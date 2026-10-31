import {DurableObject} from 'cloudflare:workers';
import {ApiError,reply,identify,readJson,firebaseDoc,ADMIN_UID} from './firebase-auth.js';
import {catalog,Ranked,economy,levelInfo} from './reward-rules.js';
const ID=/^[A-Za-z0-9_-]{1,128}$/, midOK=/^[A-Za-z0-9_-]{1,80}$/;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const n=(v,max=1e9)=>Number.isFinite(v)?clamp(Math.trunc(v),0,max):0;
const cosmetics={body:'body',decal:'decal',wheel:'wheel',trail:'boost',boom:'boom',finish:'paint',topper:'topper',antenna:'antenna',title:'title',banner:'banner'};
export function cleanProfile(raw={}){
 const p={xp:0,pxp:0,pxc:0,qn:0,games:0,wins:0,goals:0,saves:0,mvps:0,dlv:0,cm:500,rt:-1,rk:[0,1,2].map(()=>[500,0,0,0,-1]),own:{},drops:[],qs:null,ab:null,cv:2,paint:-1,name:'',fr:[]};
 for(const key of ['xp','pxp','pxc','qn','games','wins','goals','saves','mvps','dlv'])p[key]=n(raw[key]);
 p.cm=Number.isFinite(raw.cm)?n(raw.cm,4000):500;p.rt=Number.isFinite(raw.rt)?clamp(Math.trunc(raw.rt),-1,7):-1;
 p.rk=[0,1,2].map(i=>{let r=raw.rk?.[i];if(r&&!Array.isArray(r))r=[r.m,r.p,r.w,r.l,r.pk];return Array.isArray(r)?[n(r[0],4000),n(r[1]),n(r[2]),n(r[3]),clamp(Number.isFinite(r[4])?Math.trunc(r[4]):-1,-1,21)]:[500,0,0,0,-1];});
 for(const[k,list]of Object.entries(catalog))p.own[k]=Array.isArray(raw.own?.[k])?[...new Set(raw.own[k].filter(i=>Number.isInteger(i)&&list[i]&&!list[i].admin))]:[];
 p.drops=Array.isArray(raw.drops)?raw.drops.filter(i=>Number.isInteger(i)&&i>=2&&i<=6).slice(0,200):[];
 if(raw.qs&&typeof raw.qs==='object')p.qs=economy(p).cleanQuests(raw.qs);
 p.name=typeof raw.name==='string'?raw.name.slice(0,14):'';p.settings=typeof raw.settings==='string'?raw.settings.slice(0,20000):'';
 for(const[field,kind]of Object.entries(cosmetics))p[field]=catalog[kind][raw[field]]?raw[field]:0;
 if(Number.isInteger(raw.paint))p.paint=clamp(raw.paint,-1,0xffffff);
 p.fr=Array.isArray(raw.fr)?raw.fr.filter(x=>typeof x==='string').slice(0,50):[];
 return p;
}
function cloud(p){return {...p,rk:p.rk.map(([m,p,w,l,pk])=>({m,p,w,l,pk})),level:levelInfo(p.xp).lv};}
function publicRow(p,uid){const best=p.rk.filter(r=>r[1]>=5).sort((a,b)=>b[0]-a[0])[0];return {uid,name:p.name||p.username||'Player',mmr:best?.[0]??0,rank:best?Ranked.info(best[0]).idx:-1,wins:p.wins,goals:p.goals,level:levelInfo(p.xp).lv,ti:p.title,bn:p.banner,clanId:p.clanId||''};}
function permission(p,k,i,uid){const it=catalog[k]?.[i];if(!it)return false;if(it.admin)return uid===ADMIN_UID||(p.adminItems||[]).includes(k+':'+i);if(p.own[k]?.includes(i))return true;if(it.lead)return !!p.clanId&&p.clanRole==='owner';if(it.clan)return !!p.clanId; // Clan level visuals are additionally vetted by the Firebase clan client.
 if(it.tier>=0)return p.rt>=it.tier;if(it.qn)return p.qn>=it.qn;if(it.pass)return economy(p).passTier()>=it.pass;if(it.drop)return false;return levelInfo(p.xp).lv>=(it.lv||1);}
export function awardMatch(p,e,now=Date.now(),averages=[500,500]){
 const E=economy(p,now);E.ensureQuests();const before=levelInfo(p.xp),passFrom=E.passTier(),st=e.st;
 const k=e.online?1:.5,part=Math.round(150*k),wb=e.won?Math.round(200*k):0,perf=Math.round(st[0]*k),mv=e.mvp?Math.round(100*k):0;
 const tier=p.rk.filter(r=>r[1]>=5).reduce((a,r)=>Math.max(a,Ranked.info(r[0]).tier),-1),mult=Ranked.xpMult(tier),base=part+wb+perf+mv,bonus=Math.round(base*(mult-1));
 const lines=[['Match played',part],['Win bonus',wb],['Performance',perf]];if(mv)lines.push(['MVP',mv]);if(bonus)lines.push(['Rank bonus ×'+mult,bonus,true]);
 p.xp+=base+bonus;p.games++;if(e.won)p.wins++;p.goals+=st[1];p.saves+=st[3];if(mv)p.mvps++;
 const quests=E.advanceQuests({...e,mvp:!!mv});for(const q of quests){p.xp+=q.xp;lines.push([q.text,q.xp,true]);}
 const xp0=p.xp,px=base+bonus+quests.reduce((s,q)=>s+q.px,0),tiers=E.addPassXp(px);if(p.xp>xp0)lines.push(['Nitro Pass rewards',p.xp-xp0,true]);
 let rank=null;
 if(e.ranked&&[1,2,3].includes(e.playlist)){
  const r=p.rk[e.playlist-1],b={mmr:r[0],played:r[1],info:Ranked.info(r[0])},rt0=p.rt,d=Ranked.delta(averages[e.team],averages[1-e.team],e.won,r[1]);
  r[0]=clamp(r[0]+d,0,4000);r[1]++;r[e.won?2:3]++;const after={mmr:r[0],played:r[1],info:Ranked.info(r[0])};
  if(r[1]>=5){r[4]=Math.max(r[4],after.info.idx);p.rt=Math.max(p.rt,after.info.tier);}
  rank={pl:e.playlist,d,won:e.won,before:b,after,placedNow:b.played<5&&after.played>=5,newTiers:Array.from({length:Math.max(0,p.rt-rt0)},(_,i)=>rt0+i+1)};
 }else if(e.online&&e.kind==='casual')p.cm=clamp(p.cm+Math.round(15*((e.won?1:0)-1/(1+10**((averages[1-e.team]-averages[e.team])/400)))),0,4000);
 p.ab=null;const drops=E.grantLevelDrops();
 return {before,after:levelInfo(p.xp),xpGain:lines.reduce((s,l)=>s+l[1],0),lines,kind:e.kind,rank,mid:e.mid,pass:{from:passFrom,tiers,px},quests,drops,clanContribution:{xp:(e.won?100:0)+20*st[1],wins:e.won?1:0,goals:st[1],cvw:0,cvl:0}};
}
export async function progressFetch(req,env){
 const url=new URL(req.url);if(!url.pathname.startsWith('/api/progress'))return null;
 try{
  if(req.method!=='POST')throw new ApiError('POST required',405);
  if(req.headers.get('Origin')!==url.origin)throw new ApiError('Not allowed',403);
  const body=await readJson(req),token=req.headers.get('Authorization')?.replace(/^Bearer /,'');const user=await identify(token);
  return env.PROGRESS.get(env.PROGRESS.idFromName('accounts-v1')).fetch(new Request('https://progress/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({body,token,user})}));
 }catch(e){return reply({error:e instanceof ApiError?e.message:'Progress service is unavailable. Please retry.'},e.status||503);}
}
export class Progress extends DurableObject{
 constructor(ctx,env){super(ctx,env);this.tail=Promise.resolve();this.banCache=new Map();}
 async fetch(req){const run=this.tail.then(()=>this.run(req));this.tail=run.catch(()=>{});try{return await run;}catch(e){return reply({error:e instanceof ApiError?e.message:'Could not save progress. Please retry.'},e.status||503);}}
 async load(user,token){
  const {uid}=user,key='p:'+uid;
  const until=this.banCache.get(uid)||0;if(until<Date.now()){if(await firebaseDoc('bans/'+uid,token))throw new ApiError('This account is banned',403);this.banCache.set(uid,Date.now()+60000);}
  let p=await this.ctx.storage.get(key);
  if(!p){const raw=await firebaseDoc('players/'+uid,token);p=cleanProfile(raw||{});p.username=user.username;p.rev=1;p.migratedAt=Date.now();p.imported=!!raw;p.adminItems=(await firebaseDoc('adminItems/'+uid,token))?.items||[];const E=economy(p);E.ensureQuests();E.payPassXp();E.grantLevelDrops();await this.ctx.storage.put(key,p);await this.ctx.storage.put('lb:'+uid,publicRow(p,uid));}
  if(!p.clanChecked||Date.now()-p.clanChecked>60000){const membership=await firebaseDoc('clanMembers/'+uid,token);p.clanId=membership?.clanId||'';p.clanRole=membership?.role||'';p.clanChecked=Date.now();await this.ctx.storage.put(key,p);}
  return p;
 }
 async save(uid,p){p.rev=(p.rev||0)+1;await this.ctx.storage.transaction(async tx=>{await tx.put('p:'+uid,p);await tx.put('lb:'+uid,publicRow(p,uid));});}
 async run(req){
  const path=new URL(req.url).pathname;
  if(path==='/forfeit'){
   const {uid,room,mid,playlist}=await req.json();if(!ID.test(uid||'')||!/^np-m-[a-z0-9-]{1,50}$/.test(room||'')||!midOK.test(mid||'')||![1,2,3].includes(playlist))throw new ApiError('Invalid departure');
   const p=await this.ctx.storage.get('p:'+uid),key='match:'+uid+':'+room+':'+mid;if(!p||await this.ctx.storage.get(key))return reply({ok:true});
   const r=p.rk[playlist-1],d=Ranked.delta(r[0],r[0],false,r[1]);r[0]=Math.max(0,r[0]+d);r[1]++;r[3]++;p.ab=null;p.rev++;
   await this.ctx.storage.transaction(async tx=>{await tx.put('p:'+uid,p);await tx.put('lb:'+uid,publicRow(p,uid));await tx.put(key,{forfeit:true,at:Date.now()});});return reply({ok:true});
  }
  const {body:b,token,user}=await req.json();if(!user||!ID.test(user.uid))throw new ApiError('Invalid account',401);
  const uid=user.uid,p=await this.load(user,token),now=Date.now();const response=(extra={})=>reply({profile:cloud(p),rev:p.rev,...extra});
  if(b.action==='load'){const E=economy(p);if(E.ensureQuests())await this.save(uid,p);return response();}
  if(b.action==='save'){
   const d=b.profile||{};for(const[field,k]of Object.entries(cosmetics))if(Number.isInteger(d[field])&&permission(p,k,d[field],uid))p[field]=d[field];
   if(Number.isInteger(d.paint))p.paint=clamp(d.paint,-1,0xffffff);
   if(typeof d.name==='string')p.name=d.name.replace(/[^\p{L}\p{N} _.\-]/gu,'').slice(0,14);
   if(typeof d.settings==='string'&&d.settings.length<=20000){try{const v=JSON.parse(d.settings);if(v&&typeof v==='object'&&!Array.isArray(v))p.settings=d.settings;}catch{}}
   await this.save(uid,p);return response();
  }
  if(b.action==='leaderboard'){
   if(!['mmr','wins','goals'].includes(b.field))throw new ApiError('Unknown leaderboard');
   // Existing rankings remain visible as a frozen baseline. Once migrated, an account's server row always wins.
   let legacy=await this.ctx.storage.get('legacy-leaderboard');
   if(!legacy){legacy=[];for(const field of ['mmr','wins','goals']){
    const r=await fetch('https://firestore.googleapis.com/v1/projects/nitro-pitch/databases/(default)/documents:runQuery',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({structuredQuery:{from:[{collectionId:'leaderboard'}],orderBy:[{field:{fieldPath:field},direction:'DESCENDING'}],limit:100}}),signal:AbortSignal.timeout(12000)});
    if(!r.ok)throw new ApiError('Could not load rankings. Please retry.',503);
    for(const row of await r.json()){if(!row.document)continue;const f=row.document.fields||{},get=k=>f[k]?.stringValue??Number(f[k]?.integerValue??f[k]?.doubleValue??0);legacy.push({uid:row.document.name.split('/').at(-1),name:get('name'),mmr:get('mmr'),rank:get('rank'),wins:get('wins'),goals:get('goals'),level:get('level'),ti:get('ti'),bn:get('bn'),clanId:get('clanId')||''});}
   }await this.ctx.storage.put('legacy-leaderboard',legacy);}
   const field=b.field;const rows=new Map(legacy.map(x=>[x.uid,x]));let after;
   do{const page=await this.ctx.storage.list({prefix:'lb:',limit:1000,...(after?{startAfter:after}:{})});for(const[key,row]of page){rows.set(row.uid,row);after=key;}if(page.size<1000)break;}while(true);
   return reply({rows:[...rows.values()].sort((a,b)=>b[field]-a[field]||a.uid.localeCompare(b.uid)).slice(0,clamp(n(b.limit,100),1,100))});
  }
  if(b.action==='leaderboard-get'){if(!ID.test(b.uid||''))throw new ApiError('Invalid player');return reply({row:await this.ctx.storage.get('lb:'+b.uid)||null});}
  // Idempotency keys survive refreshes and retrying a lost response.
  if(!midOK.test(b.id||''))throw new ApiError('Missing action ID');
  const receiptKey='paid:'+uid+':'+b.id,prior=await this.ctx.storage.get(receiptKey);
  if(prior){if(prior.action!==b.action)throw new ApiError('Action ID already used',409);return response(prior.result);}
  let result={},extraWrites={};
  if(b.action==='session-start'){
   if(!midOK.test(b.mid||''))throw new ApiError('Invalid match');
   if(p.session&&p.session.mid!==b.mid&&now-p.session.started<20000)throw new ApiError('A match is already starting',429);
   p.session={mid:b.mid,started:now,last:now,active:0,mut:Array.isArray(b.mut)?b.mut.slice(0,7):[0,0,0,0,0,0,0]};
  }else if(b.action==='session-tick'){
   if(!p.session||p.session.mid!==b.mid||now-p.session.started>7200000)throw new ApiError('This practice session expired',409);
   p.session.active+=Math.min(20000,Math.max(0,now-p.session.last));p.session.last=now;
  }else if(b.action==='match'){
   let e;
   if(typeof b.room==='string'&&/^np-[mp]-[a-z0-9-]{1,50}$/.test(b.room)){
    const r=await this.env.ROOMS.get(this.env.ROOMS.idFromName(b.room)).fetch(new Request('https://room/_result',{method:'POST',body:JSON.stringify({uid,mid:b.mid})}));
    const data=await r.json();if(!r.ok)throw new ApiError(data.error||'Waiting for match confirmation',r.status);e=data;
   }else{
    const s=p.session;if(!s||s.mid!==b.mid||now-s.started>7200000)throw new ApiError('Practice session was not registered',409);
    const elapsed=(s.active+Math.min(20000,now-s.last))/1000,score=b.score,st=b.st;
    if(elapsed<20||!Array.isArray(score)||score.length!==2||!score.every(x=>Number.isInteger(x)&&x>=0&&x<=99)||!Array.isArray(st)||st.length!==6||!st.every(x=>Number.isInteger(x)&&x>=0)||st[0]>elapsed*25+500||st[1]>Math.max(...score)||st.slice(1).some(x=>x>elapsed/2+10))throw new ApiError('Practice result failed validation',422);
    const length=[300,180,600][s.mut[0]];if(!length||elapsed+20<length)throw new ApiError('Finish the practice match to earn rewards',422);
    e={mid:b.mid,st,score,won:score[0]>score[1],mvp:!!b.mvp,online:false,extra:!!s.mut[6],kind:'exhibition',ranked:false,team:0,elapsed};p.session=null;
   }
   // A room/match may be claimed only once, even with a fresh HTTP action ID.
   const key='match:'+uid+':'+(b.room||'practice')+':'+e.mid;if(await this.ctx.storage.get(key))throw new ApiError('This match has already been saved',409);
   const averages=[500,500];if(e.roster){for(const t of [0,1]){const players=e.roster.filter(x=>x.team===t&&x.uid),values=[];for(const m of players){const other=m.uid===uid?p:await this.ctx.storage.get('p:'+m.uid);values.push(e.ranked?other?.rk?.[e.playlist-1]?.[0]??500:other?.cm??500);}if(values.length)averages[t]=values.reduce((a,b)=>a+b,0)/values.length;}}
   const avgKey='averages:'+(b.room||uid)+':'+e.mid;const savedAverages=await this.ctx.storage.get(avgKey);extraWrites[avgKey]=savedAverages||averages;
   result={result:awardMatch(p,e,now,savedAverages||averages)};extraWrites[key]={at:now};
  }else if(b.action==='drop'||b.action==='trade-in'){
   if(b.rev!==p.rev)throw new ApiError('Your inventory changed in another tab. Try again.',409);
   const E=economy(p,now);
   if(b.action==='drop'){if(!Number.isInteger(b.index))throw new ApiError('Invalid drop');const got=E.openDrop(b.index);if(!got)throw new ApiError('That drop is no longer available',409);E.grantLevelDrops();result={got};}
   else{
    const keys=b.keys,r=b.rarity;if(!Array.isArray(keys)||keys.length!==5||new Set(keys).size!==5||!Number.isInteger(r)||r<2||r>=6)throw new ApiError('Pick five different items of the same rarity');
    const picked=keys.map(key=>{const [kind,v]=String(key).split(':'),i=Number(v);if(!Number.isInteger(i)||i<0)throw new ApiError('Invalid item');if(kind==='drop'){if(p.drops[i]!==r)throw new ApiError('Drop is no longer available',409);return {key,drop:true,k:i,name:r+' Drop'};}const it=catalog[kind]?.[i];if(!it?.drop||it.admin||it.rar!==r||!p.own[kind]?.includes(i))throw new ApiError('Item is no longer available',409);return {key,kind,i,name:it.name};});
    for(const i of picked.filter(x=>x.drop).map(x=>x.k).sort((a,b)=>b-a))p.drops.splice(i,1);
    for(const x of picked.filter(x=>!x.drop))p.own[x.kind]=p.own[x.kind].filter(i=>i!==x.i);
    const pool=E.dropPool(r+1);let got;if(pool.length){got={...pool[crypto.getRandomValues(new Uint32Array(1))[0]%pool.length],rar:r+1};p.own[got.kind].push(got.i);}else{E.addDrop(r+1);got={drop:r+1};}result={got,picked};
   }
  }else if(b.action==='reroll'){if(!economy(p,now).rerollQuest(b.index))throw new ApiError('You have used today’s reroll',409);
  }else if(b.action==='gift'){
   if(!midOK.test(b.gift||''))throw new ApiError('Invalid gift');const key='gift:'+b.gift;
   if(await this.ctx.storage.get(key))return response({claimed:false});
   const g=await firebaseDoc('gifts/'+b.gift,token);if(!g||g.to!==uid||g.claimed)throw new ApiError('Gift already claimed',409);
   const E=economy(p,now),before=levelInfo(p.xp);let got=null;
   if(g.item){const [kind,v]=g.item.split(':'),i=Number(v),it=catalog[kind]?.[i];if(!it)throw new ApiError('Invalid gift');if(it.admin){p.adminItems=(await firebaseDoc('adminItems/'+uid,token))?.items||[];if(!permission(p,kind,i,uid))throw new ApiError('This item was not granted to your account',403);}else if(!p.own[kind].includes(i))p.own[kind].push(i);got={kind,i,name:it.name,rar:it.rar};}
   p.xp=Math.max(0,p.xp+clamp(Math.trunc(Number(g.xp)||0),-1e6,1e6));const px=clamp(Math.trunc(Number(g.px)||0),-1e6,1e6);if(px>0)E.addPassXp(px);else p.pxp=Math.max(0,p.pxp+px);E.grantLevelDrops();
   result={claimed:true,got,before,after:levelInfo(p.xp),xp:g.xp||0,px,note:String(g.note||'').slice(0,120)};extraWrites[key]={uid,at:now};
  }else if(b.action==='trade-cancel'){
   if(!ID.test(b.other||'')||!midOK.test(b.trade||''))throw new ApiError('Invalid trade');const key='trade:'+[uid,b.other].sort().join(':')+':'+b.trade,existing=await this.ctx.storage.get(key);
   if(!existing?.done)await this.ctx.storage.put(key,{cancelled:true,at:now});return response({cancelled:!existing?.done});
  }else if(b.action==='trade'){
   const other=b.other;if(!ID.test(other||'')||other===uid||!midOK.test(b.trade||''))throw new ApiError('Invalid trade');
   const offer=list=>{if(!Array.isArray(list)||list.length>8)throw new ApiError('Invalid offer');const keys=list.map(x=>Array.isArray(x)&&x.length===2?x[0]+':'+x[1]:'');if(new Set(keys).size!==keys.length||keys.some(k=>!k))throw new ApiError('Invalid offer');for(const [k,i]of list)if(!Number.isInteger(i)||!catalog[k]?.[i]?.drop||catalog[k][i].admin)throw new ApiError('Only drop items can be traded');return list;};
   const mine=offer(b.mine),theirs=offer(b.theirs),pair=[uid,other].sort(),key='trade:'+pair.join(':')+':'+b.trade,existing=await this.ctx.storage.get(key),want=JSON.stringify(uid===pair[0]?[mine,theirs]:[theirs,mine]);
   if(existing?.done)return response({traded:true});if(existing?.cancelled)throw new ApiError('This trade was cancelled',409);
   if(existing&&existing.want!==want)throw new ApiError('The trade offer changed. Confirm it again.',409);
   const tr=existing&&now-existing.at<120000?existing:{at:now,want,approvals:[]};if(!tr.approvals.includes(uid))tr.approvals.push(uid);
   if(tr.approvals.length<2){await this.ctx.storage.put(key,tr);return response({waiting:true});}
   const q=await this.ctx.storage.get('p:'+other);if(!q)throw new ApiError('Other player needs to refresh their inventory',409);
   const owns=(p,list)=>list.every(([k,i])=>p.own[k]?.includes(i));if(!owns(p,mine)||!owns(q,theirs))throw new ApiError('An offered item is no longer owned',409);
   for(const [from,to,list]of [[p,q,mine],[q,p,theirs]])for(const[k,i]of list){from.own[k]=from.own[k].filter(v=>v!==i);if(!to.own[k].includes(i))to.own[k].push(i);}
   p.rev++;q.rev++;await this.ctx.storage.transaction(async tx=>{await tx.put('p:'+uid,p);await tx.put('p:'+other,q);await tx.put(key,{done:true,at:now});});return response({traded:true});
  }else throw new ApiError('Unknown progress action');
  // Write the state and the receipt atomically: a dropped response cannot duplicate a reward.
  p.rev++;await this.ctx.storage.transaction(async tx=>{await tx.put('p:'+uid,p);await tx.put('lb:'+uid,publicRow(p,uid));await tx.put(receiptKey,{action:b.action,result,at:now});for(const[key,value]of Object.entries(extraWrites))await tx.put(key,value);});
  return response(result);
 }
}
