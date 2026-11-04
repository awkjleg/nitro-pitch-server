// Shared replay clips, game error reports and player reports (with the chat around them) for the admin, Web Push
// subscriptions (src/push.js) and private messages (src/messages.js).
// One Durable Object ("ops-v1") holds them in SQLite: clips last 30 days, errors and reports keep the newest few hundred.
import {DurableObject} from 'cloudflare:workers';
import {ApiError,reply,identify,readJson,firebaseDoc,ADMIN_UID} from './firebase-auth.js';
import {PushHub} from './push.js';
import {MessageHub} from './messages.js';
const CLIP_MAX=450000, CLIP_DAYS=30, CLIPS_PER_DAY=40, ERR_KEEP=300, REP_KEEP=500;
const str=(v,max)=>typeof v==='string'?v.slice(0,max):'';
const rid=()=>Array.from(crypto.getRandomValues(new Uint8Array(8)),b=>'abcdefghijkmnpqrstuvwxyz23456789'[b&31]).join('').slice(0,10);
async function sha(s){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,'0')).join('').slice(0,24);}

export class Ops extends DurableObject{
 constructor(ctx,env){
  super(ctx,env);const sql=ctx.storage.sql;this.sql=sql;
  sql.exec(`CREATE TABLE IF NOT EXISTS clips(id TEXT PRIMARY KEY,uid TEXT,title TEXT,data TEXT,at INTEGER)`);
  sql.exec(`CREATE TABLE IF NOT EXISTS errs(h TEXT PRIMARY KEY,msg TEXT,stack TEXT,url TEXT,build TEXT,ua TEXT,uid TEXT,n INTEGER,first INTEGER,last INTEGER)`);
  sql.exec(`CREATE TABLE IF NOT EXISTS reps(id TEXT PRIMARY KEY,at INTEGER,by TEXT,byName TEXT,uid TEXT,name TEXT,reason TEXT,chat TEXT,state TEXT)`);
  this.push=new PushHub(ctx.storage,env);
  this.messages=new MessageHub(ctx.storage,{push:this.push,
   account:async(uid,token)=>{if(!env.PROGRESS)return null;const r=await env.PROGRESS.get(env.PROGRESS.idFromName('accounts-v1')).fetch(new Request('https://progress/account',{method:'POST',body:JSON.stringify({uid,token})}));if(!r.ok)throw new ApiError('Messages are unavailable. Please retry.',503);return r.json();},
   // the admin's chat mutes (Firebase mutes/{uid}, readable by every signed-in player) also stop private messages
   muted:async(uid,token)=>{if(!token)return false;try{const m=await firebaseDoc('mutes/'+uid,token);const until=typeof m?.until==='string'?Date.parse(m.until):+m?.until||0;return until>Date.now();}catch{return false;}}});
 }
 // ---- private messages (src/messages.js): signed-in players only
 async pmSend(b,user,token){return this.messages.send(user,b,token);}
 async pmInbox(b,user){return this.messages.inbox(user,b);}
 async pmThread(b,user){return this.messages.thread(user,b);}
 // ---- Web Push: subscriptions, the once-per-release Big Update broadcast and the admin's manual send (src/push.js)
 async pushResult(r){if(r.error)throw new ApiError(r.error,r.status||400);return r;}
 async pushSub(b,user){return this.pushResult(await this.push.subscribe(b,user?.uid||null));}
 async pushUnsub(b){return this.pushResult(await this.push.unsubscribe(b));}
 async pushAnnounce(b){return this.push.announce(b.release);}
 async adminPush(b,user){
  if(user?.uid!==ADMIN_UID)throw new ApiError('Admin only',403);
  if(b.act==='status')return this.push.status(b.release);
  if(b.act==='send')return this.pushResult(await this.push.manual(b.release,str(b.text,120)));
  throw new ApiError('Unknown action');
 }
 async alarm(){await this.push.alarm();}
 async fetch(req){
  try{const {op,body,user,token}=await req.json();return reply(await this[op](body||{},user||null,token||null));}
  catch(e){return reply({error:e instanceof ApiError?e.message:'Something went wrong. Please retry.'},e.status||500);}
 }
 // ---- clips
 async clipPut(b,user){
  const data=str(b.data,CLIP_MAX+1);if(data.length<200||data.length>CLIP_MAX)throw new ApiError('That replay is too big to share');
  try{const d=JSON.parse(data);if(!Array.isArray(d.fr)||!Array.isArray(d.meta))throw 0;}catch{throw new ApiError('Invalid replay');}
  const day=Date.now()-864e5,used=this.sql.exec('SELECT COUNT(*) AS c FROM clips WHERE uid=? AND at>?',user.uid,day).one().c;
  if(used>=CLIPS_PER_DAY)throw new ApiError('You shared a lot of replays today. Try again tomorrow.',429);
  this.sql.exec('DELETE FROM clips WHERE at<?',Date.now()-CLIP_DAYS*864e5);
  const id=rid();this.sql.exec('INSERT INTO clips VALUES(?,?,?,?,?)',id,user.uid,str(b.title,60)||'Replay',data,Date.now());
  return {id};
 }
 async clipGet(b){
  const row=[...this.sql.exec('SELECT title,data,at FROM clips WHERE id=?',str(b.id,16))][0];
  if(!row||row.at<Date.now()-CLIP_DAYS*864e5)throw new ApiError('This replay link has expired or does not exist',404);
  return {title:row.title,data:row.data};
 }
 // ---- errors from players' browsers (the same error counts up instead of filling the list)
 async errPut(b,user){
  const msg=str(b.msg,400);if(!msg)return {ok:true};
  const stack=str(b.stack,2000),h=await sha(msg+'|'+stack.split('\n').slice(0,3).join('|')),now=Date.now();
  const have=[...this.sql.exec('SELECT n FROM errs WHERE h=?',h)][0];
  if(have)this.sql.exec('UPDATE errs SET n=n+1,last=?,build=?,url=?,ua=? WHERE h=?',now,str(b.build,20),str(b.url,200),str(b.ua,200),h);
  else{
   this.sql.exec('INSERT INTO errs VALUES(?,?,?,?,?,?,?,?,?,?)',h,msg,stack,str(b.url,200),str(b.build,20),str(b.ua,200),user?.uid||'',1,now,now);
   this.sql.exec('DELETE FROM errs WHERE h IN (SELECT h FROM errs ORDER BY last DESC LIMIT -1 OFFSET ?)',ERR_KEEP);
  }
  return {ok:true};
 }
 // ---- player reports with the lobby chat before them
 async repPut(b,user){
  const reason=str(b.reason,300).trim();if(reason.length<3)throw new ApiError('Type a reason');
  const chat=Array.isArray(b.chat)?b.chat.slice(-30).map(m=>({n:str(m?.n,24),u:str(m?.u,128),t:str(m?.t,200),at:Number.isFinite(m?.at)?m.at:0})):[];
  const day=Date.now()-864e5,used=this.sql.exec('SELECT COUNT(*) AS c FROM reps WHERE by=? AND at>?',user.uid,day).one().c;
  if(used>=30)throw new ApiError('You have sent a lot of reports today.',429);
  this.sql.exec('INSERT INTO reps VALUES(?,?,?,?,?,?,?,?,?)',rid(),Date.now(),user.uid,str(b.byName,24)||user.username,str(b.uid,128),str(b.name,24),reason,JSON.stringify(chat),'open');
  this.sql.exec('DELETE FROM reps WHERE id IN (SELECT id FROM reps ORDER BY at DESC LIMIT -1 OFFSET ?)',REP_KEEP);
  return {ok:true};
 }
 // ---- the admin tab
 async adminList(b,user){
  if(user?.uid!==ADMIN_UID)throw new ApiError('Admin only',403);
  if(b.kind==='errors')return {rows:[...this.sql.exec('SELECT h,msg,stack,url,build,ua,uid,n,first,last FROM errs ORDER BY last DESC LIMIT 100')]};
  const st=b.state==='done'?'done':'open';
  return {rows:[...this.sql.exec('SELECT * FROM reps WHERE state=? ORDER BY at DESC LIMIT 100',st)].map(r=>({...r,chat:JSON.parse(r.chat||'[]')}))};
 }
 async adminAct(b,user){
  if(user?.uid!==ADMIN_UID)throw new ApiError('Admin only',403);
  if(b.act==='resolve')this.sql.exec("UPDATE reps SET state='done' WHERE id=?",str(b.id,16));
  else if(b.act==='reopen')this.sql.exec("UPDATE reps SET state='open' WHERE id=?",str(b.id,16));
  else if(b.act==='clearError')this.sql.exec('DELETE FROM errs WHERE h=?',str(b.id,32));
  else if(b.act==='clearErrors')this.sql.exec('DELETE FROM errs');
  else throw new ApiError('Unknown action');
  return {ok:true};
 }
}
const ROUTES={'/api/clips':['clipPut',true],'/api/clip':['clipGet',false],'/api/errors':['errPut',false],'/api/reports':['repPut',true],'/api/admin/list':['adminList',true],'/api/admin/act':['adminAct',true],'/api/push/subscribe':['pushSub',false],'/api/push/unsubscribe':['pushUnsub',false],'/api/admin/push':['adminPush',true],'/api/messages/send':['pmSend',true],'/api/messages/inbox':['pmInbox',true],'/api/messages/thread':['pmThread',true]};
const errHits=new Map(),pushHits=new Map();
const opsObject=env=>env.OPS.get(env.OPS.idFromName('ops-v1'));
// The automatic Big Update trigger. src/worker.js calls it for every game page it serves; the first page served on
// nitropitch.app after a deploy whose active patch notes say "big": true asks Ops (in the background) to announce the
// release. Ops remembers announced patch-notes versions, so each release is pushed once, however many isolates ask.
let announcedHere='';
export function announceBigUpdate(url,env,ctx,release){
 if(!release?.big||!release.v||announcedHere===release.v||!ctx?.waitUntil)return false;
 if(url.hostname!=='nitropitch.app'&&!(env.PUSH_ANNOUNCE_ANY_HOST==='1'&&/^(localhost|127\.0\.0\.1)$/.test(url.hostname)))return false;
 announcedHere=release.v;
 ctx.waitUntil(opsObject(env).fetch(new Request('https://ops/',{method:'POST',body:JSON.stringify({op:'pushAnnounce',body:{release}})})).then(r=>{if(!r.ok)throw 0;}).catch(()=>{announcedHere='';}));
 return true;
}
// release: the served build's patch notes ({build,v,title,big}) from src/game-shell.js, never from the browser
export async function opsFetch(req,env,{release}={}){
 const url=new URL(req.url);
 if(url.pathname==='/api/push/key'){if(req.method!=='GET')return reply({error:'GET required'},405);return reply({key:env.VAPID_PUBLIC||''});}
 const route=ROUTES[url.pathname];if(!route)return null;
 try{
  const [op,needUser]=route;
  if(op==='clipGet'){if(req.method!=='GET')throw new ApiError('GET required',405);return env.OPS.get(env.OPS.idFromName('ops-v1')).fetch(new Request('https://ops/',{method:'POST',body:JSON.stringify({op,body:{id:url.searchParams.get('id')}})}));}
  if(req.method!=='POST')throw new ApiError('POST required',405);
  if(req.headers.get('Origin')!==url.origin)throw new ApiError('Not allowed',403);
  if(op==='pushSub'||op==='pushUnsub'){const ip=req.headers.get('CF-Connecting-IP')||'?',now=Date.now(),e=pushHits.get(ip);if(e&&e.until>now&&e.n>=120)throw new ApiError('Too many requests. Try again later.',429);if(!e||e.until<=now)pushHits.set(ip,{n:1,until:now+3600e3});else e.n++;if(pushHits.size>5000)pushHits.clear();}
  if(op==='errPut'){const ip=req.headers.get('CF-Connecting-IP')||'?',now=Date.now(),e=errHits.get(ip);if(e&&e.until>now&&e.n>=20)return reply({ok:true});if(!e||e.until<=now)errHits.set(ip,{n:1,until:now+3600e3});else e.n++;if(errHits.size>5000)errHits.clear();}
  const body=await readJson(req,op==='clipPut'?500000:32768);
  if(op==='adminPush')body.release=release||null;
  const token=req.headers.get('Authorization')?.replace(/^Bearer /,'');
  let user=null;if(needUser)user=await identify(token);else if(token){try{user=await identify(token);}catch{}}
  return env.OPS.get(env.OPS.idFromName('ops-v1')).fetch(new Request('https://ops/',{method:'POST',body:JSON.stringify({op,body,user,...(op==='pmSend'?{token}:{})})}));
 }catch(e){return reply({error:e instanceof ApiError?e.message:'Service unavailable. Please retry.'},e.status||503);}
}
