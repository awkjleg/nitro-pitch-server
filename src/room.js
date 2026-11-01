import { DurableObject } from 'cloudflare:workers';
import {identify,reply} from './firebase-auth.js';
import {validCar,validGame,validHit,resultEvidence,rankedRules} from './room-guard.js';
const MAX_PLAYERS=400,MAX_MSG=64000,RECONNECT_GRACE=12000,MATCH_RECONNECT_GRACE=60000;
const cleanId=value=>String(value||'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,48);
const bytes=new TextEncoder();

export class Room extends DurableObject {
  constructor(ctx,env){
    super(ctx,env);this.pres=new Map();this.partial=new Set();this.departures=new Map();this.resyncAt=new Map();this.rematchSent=null;this.host=null;this.orders=new Map();this.rate=new Map();this.matchRecords=new Map();this.name="";
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'));
    // Socket attachments survive hibernation. Full small lobby records fit; large
    // match records retain identity/seat metadata until the client resends them.
    for(const ws of ctx.getWebSockets()){
      const info=this.info(ws);if(!info.ok || !info.id || ws.readyState!==1)continue;
      this.pres.set(info.id,info.p||{});this.orders.set(info.id,info.order||0);if(!info.full)this.partial.add(info.id);
    }
    ctx.blockConcurrencyWhile(async()=>{
      this.name=await ctx.storage.get('room-name')||'';
      const records=await ctx.storage.list({prefix:'match:'});for(const[k,r]of records)if(Date.now()-(r.ended||r.started)<86400000)this.matchRecords.set(k.slice(6),r);else await ctx.storage.delete(k);
      const saved=await ctx.storage.list({prefix:'leave:'});
      for(const[key,value]of saved){const id=key.slice(6);if(value.until>Date.now()&&!this.pres.has(id)){this.pres.set(id,value.p);this.departures.set(id,value.until);this.partial.add(id);}else await ctx.storage.delete(key);}
      await this.scheduleAlarm();
    });
  }
  info(ws){try{return ws.deserializeAttachment()||{};}catch(_){return {};}}
  send(ws,value){try{ws.send(typeof value==='string'?value:JSON.stringify(value));}catch(_){}}
  bcast(message,except){const value=JSON.stringify(message);for(const ws of this.ctx.getWebSockets())if(ws!==except&&ws.readyState===1&&this.info(ws).ok)this.send(ws,value);}
  current(ws,id){return !this.info(ws).replaced&&!this.ctx.getWebSockets(id).some(other=>other!==ws&&other.readyState===1&&!this.info(other).replaced);}
  cache(ws,id,p){
    const prev=this.info(ws);let record={id,ok:true,p,full:true,uid:prev.uid||null,authAt:prev.authAt||0,order:prev.order||Date.now()};
    if(bytes.encode(JSON.stringify(record)).length>1900){
      const summary={};
      for(const key of ['nm','lv','j','tm','sp','lp','ingame','ui','un','rb','bv']){
        const value=p[key];
        if(typeof value==='string'&&['nm','lp','ui','un'].includes(key))summary[key]=value.slice(0,key==='ui'?64:key==='lp'?48:32);
        else if(typeof value==='boolean'||(typeof value==='number'&&Number.isFinite(value)))summary[key]=value;
      }
      record={...record,p:summary,full:false};
    }
    ws.serializeAttachment(record);
  }
  state(ws,created=false){
    const id=this.info(ws).id,members=Object.create(null);for(const[key,value]of this.pres)if(key!==id)members[key]=value;
    this.send(ws,{t:'state',you:id,created,host:this.host,members,memberIds:Object.keys(members),pending:[...this.partial].filter(key=>key!==id),reconnecting:Object.fromEntries(this.departures)});
  }
  snapshots(){for(const ws of this.ctx.getWebSockets())if(ws.readyState===1&&this.info(ws).ok)this.state(ws);}
  resync(){
    const now=Date.now();
    for(const ws of this.ctx.getWebSockets()){
      const{id,ok}=this.info(ws);if(!ok||!this.partial.has(id)||now-(this.resyncAt.get(id)||0)<3000)continue;
      this.resyncAt.set(id,now);this.send(ws,{t:'resync'});
    }
  }
  checkRematch(force=false){
    if(this.partial.size||this.departures.size)return;
    const players=[...this.pres].filter(([,p])=>Number.isFinite(p.j)&&[0,1].includes(p.tm)&&!p.sp);
    if(players.length<2)return;
    const ids=players.map(([id])=>id).sort(),roster=JSON.stringify(ids),mid=players[0][1].npRematch?.mid;
    if(typeof mid!=='string'||!mid||mid.length>80)return;
    for(const[id,p]of players){
      const v=p.npRematch;
      if(!v||v.mid!==mid||v.yes!==true||!Array.isArray(v.roster)||JSON.stringify([...v.roster].sort())!==roster)return;
      if(!this.ctx.getWebSockets(id).some(ws=>ws.readyState===1&&this.info(ws).ok&&!this.info(ws).replaced))return;
    }
    const key=mid+':'+roster;if(force||this.rematchSent!==key){this.rematchSent=key;this.bcast({t:'rematch-ready',mid,voters:ids});}
  }
  async scheduleAlarm(){if(this.departures.size)await this.ctx.storage.setAlarm(Math.min(...this.departures.values()));else await this.ctx.storage.deleteAlarm();}
  chooseHost(){
    if(!this.name||this.name==='lobby')return;
    const candidates=[...this.pres].filter(([id,p])=>Number.isFinite(p.j)&&!p.sp&&!this.departures.has(id)&&this.ctx.getWebSockets(id).some(ws=>ws.readyState===1&&this.info(ws).ok));
    candidates.sort((a,b)=>(this.orders.get(a[0])||0)-(this.orders.get(b[0])||0)||a[0].localeCompare(b[0]));
    const next=candidates[0]?.[0]||null;if(next!==this.host){this.host=next;this.bcast({t:'host',id:next});}
  }
  async track(id,p){
    if(this.name==='lobby'||!this.name||!p.g||id!==this.host)return;
    const g=p.g;if(!g.mid||['lobby','demo'].includes(g.ph))return;
    let r=this.matchRecords.get(g.mid),fresh=false;
    if(!r){
      if(this.matchRecords.size>=20){const key=this.matchRecords.keys().next().value;this.matchRecords.delete(key);await this.ctx.storage.delete('match:'+key);}
      r={room:this.name,mid:g.mid,started:Date.now(),last:Date.now(),score:[0,0],roster:[],acks:[],invalid:g.ph!=='countdown'&&g.ph!=='play'};fresh=true;this.matchRecords.set(g.mid,r);
    }
    if(r.final)return;
    const now=Date.now();if(g.s.some((n,i)=>n<r.score[i]||n-r.score[i]>1)||g.s.reduce((a,b)=>a+b,0)>(now-r.started)/1000+2)r.invalid=true;
    for(const [peer,pr]of this.pres){if(![0,1].includes(pr.tm)||pr.sp)continue;const ws=this.ctx.getWebSockets(peer).find(ws=>this.info(ws).ok),uid=ws&&this.info(ws).uid;const old=r.roster.find(x=>x.id===peer);
      if(!old)r.roster.push({id:peer,uid:uid||null,team:pr.tm});else if(old.team!==pr.tm)r.invalid=true;else if(uid&&!old.uid)old.uid=uid;
    }
    // Multiple tabs of one account cannot impersonate an opponent.
    const ids=r.roster.map(x=>x.uid).filter(Boolean);if(new Set(ids).size!==ids.length)r.invalid=true;
    r.lastGame={rk:g.rk,mm:g.mm,pl:g.pl,mut:g.mut};
    const changed=JSON.stringify(r.score)!==JSON.stringify(g.s);r.score=g.s.slice();r.last=now;
    if(g.ph==='over'){r.final=structuredClone(g);r.ended=now;}
    if(fresh||changed||r.final||now-(r.saved||0)>5000){r.saved=now;await this.ctx.storage.put('match:'+g.mid,r);}
  }
  async markDeparture(id){
    for(const r of this.matchRecords.values()){
      const member=r.roster.find(x=>x.id===id);if(!member||r.final||!r.lastGame)continue;
      r.departed=r.departed||[];if(r.departed.includes(member.uid))continue;r.departed.push(member.uid);await this.ctx.storage.put('match:'+r.mid,r);
      if(member.uid&&rankedRules(r.lastGame,this.name)&&[0,1].every(t=>r.roster.some(x=>x.team===t&&x.uid))&&this.env.PROGRESS)await this.env.PROGRESS.get(this.env.PROGRESS.idFromName('accounts-v1')).fetch(new Request('https://progress/forfeit',{method:'POST',body:JSON.stringify({uid:member.uid,room:this.name,mid:r.mid,playlist:r.lastGame.pl})}));
    }
  }
  async fetch(request){
    if(new URL(request.url).pathname==='/_result'&&request.method==='POST'){
      const {uid,mid}=await request.json();try{return reply(resultEvidence(this.matchRecords.get(mid),uid));}catch(e){return reply({error:e.message},409);}
    }
    this.name=new URL(request.url).searchParams.get('room')||this.name;await this.ctx.storage.put('room-name',this.name);
    const id=cleanId(new URL(request.url).searchParams.get('id'));if(!id)return new Response('Missing id',{status:400});
    const sockets=this.ctx.getWebSockets();if(sockets.length>=MAX_PLAYERS&&!sockets.some(ws=>this.info(ws).id===id))return new Response('Room full',{status:503});
    const pair=new WebSocketPair(),[client,server]=Object.values(pair);
    for(const old of this.ctx.getWebSockets(id)){try{old.serializeAttachment({...this.info(old),ok:false,replaced:true});old.close(4000,'replaced');}catch(_){}}
    this.ctx.acceptWebSocket(server,[id]);server.serializeAttachment({id,ok:false});
    return new Response(null,{status:101,webSocket:client});
  }
  async webSocketMessage(ws,data){
    if(typeof data!=='string'||data.length>MAX_MSG||bytes.encode(data).length>MAX_MSG)return;
    let message;try{message=JSON.parse(data);}catch(_){return;}
    if(!message||typeof message!=='object')return;
    const info=this.info(ws),id=info.id;if(!id||!this.current(ws,id))return;
    const now=Date.now(),rate=this.rate.get(id)||{at:now,n:0};if(now-rate.at>1000){rate.at=now;rate.n=0;}this.rate.set(id,rate);if(++rate.n>100)return;
    if(message.t==='auth-clear'){ws.serializeAttachment({...info,uid:null});const p=this.pres.get(id);if(p){p.ui=null;this.cache(ws,id,p);this.bcast({t:'p',id,p:{ui:null}});}return;}
    if(message.t==='auth'){
      try{const u=await identify(message.token);const cur=this.info(ws);if(!this.current(ws,id))return;ws.serializeAttachment({...cur,uid:u.uid,authAt:now});const p=this.pres.get(id);if(p){p.ui=u.uid;this.cache(ws,id,p);this.bcast({t:'p',id,p:{ui:u.uid}});}this.send(ws,{t:'auth-ok',uid:u.uid});}
      catch{const cur=this.info(ws);ws.serializeAttachment({...cur,uid:null});this.send(ws,{t:'auth-error'});}return;
    }
    if(message.t==='result-ack'){
      const r=this.matchRecords.get(message.mid),uid=info.uid;
      if(r?.final&&uid&&r.roster.some(x=>x.uid===uid)&&JSON.stringify(r.final.s)===JSON.stringify(message.score)){
        if(!r.acks.includes(uid)){r.acks.push(uid);await this.ctx.storage.put('match:'+r.mid,r);}this.bcast({t:'result-ready',mid:r.mid});
      }return;
    }
    // Untrusted presence can never supply a verified account ID or authoritative host field.
    if(message.p&&typeof message.p==='object'){
      if(!validCar(message.p.c)||!validHit(message.p.h)||!validGame(message.p.g))return;
      delete message.p.npUid;delete message.p.serverHost;message.p.ui=info.uid||null;
      if(message.p.g&&this.host&&this.host!==id){delete message.p.g;}
    }
    if(['hello','full','sync'].includes(message.t)){
      const p=message.p&&typeof message.p==='object'&&!Array.isArray(message.p)?message.p:{};
      const known=this.pres.has(id),created=[...this.pres.keys()].every(key=>key===id);
      const changed=!known||this.partial.has(id)||JSON.stringify(this.pres.get(id))!==JSON.stringify(p);
      this.pres.set(id,p);if(!this.orders.has(id))this.orders.set(id,info.order||Date.now());this.partial.delete(id);this.resyncAt.delete(id);this.cache(ws,id,p);
      if(this.departures.delete(id)){await this.ctx.storage.delete('leave:'+id);await this.scheduleAlarm();this.bcast({t:'connection',id,until:0});}
      if(message.t==='hello'||message.t==='sync')this.state(ws,created);
      this.chooseHost();await this.track(id,p);if(changed)this.bcast({t:known?'f':'j',id,p},ws);this.resync();this.checkRematch(message.t==='hello'||message.t==='sync');return;
    }
    if(message.t==='p'&&message.p&&typeof message.p==='object'&&!Array.isArray(message.p)){
      if(!info.ok||!this.pres.has(id)||this.partial.has(id)){this.send(ws,{t:'resync'});return;}
      const current=this.pres.get(id),out={};
      for(const key of Object.keys(message.p)){
        if(['__proto__','constructor','prototype'].includes(key))continue;
        out[key]=message.p[key];if(out[key]===null)delete current[key];else current[key]=out[key];
      }
      this.cache(ws,id,current);this.chooseHost();await this.track(id,current);this.bcast({t:'p',id,p:out},ws);this.resync();this.checkRematch();return;
    }
    if(message.t==='bye'){await this.gone(ws,true);try{ws.close(1000,'bye');}catch(_){}}
  }
  async gone(ws,explicit=false){
    const info=this.info(ws),id=info.id;if(!id||!info.ok||!this.current(ws,id))return;
    try{ws.serializeAttachment({...info,ok:false});}catch(_){}
    if(explicit){
      await this.markDeparture(id);
      this.pres.delete(id);this.partial.delete(id);this.resyncAt.delete(id);this.departures.delete(id);
      await this.ctx.storage.delete('leave:'+id);await this.scheduleAlarm();this.bcast({t:'l',id});this.chooseHost();this.snapshots();return;
    }
    // Retain a seat during short transport interruptions. An explicit Leave still
    // removes it immediately; a reconnect with the same tab ID cancels this timer.
    const p=this.pres.get(id)||info.p||{},until=Date.now()+(this.name&&this.name!=='lobby'?MATCH_RECONNECT_GRACE:RECONNECT_GRACE);
    this.pres.set(id,p);this.departures.set(id,until);this.partial.add(id);
    await this.ctx.storage.put('leave:'+id,{p,until});await this.scheduleAlarm();this.bcast({t:'connection',id,until});this.chooseHost();
  }
  async webSocketClose(ws){await this.gone(ws);try{ws.close(1000,'disconnected');}catch(_){}}
  async webSocketError(ws){await this.gone(ws);try{ws.close(1011,'connection error');}catch(_){}}
  async alarm(){
    for(const[id,until]of this.departures){
      if(until>Date.now())continue;
      const connected=this.ctx.getWebSockets(id).some(ws=>ws.readyState===1&&this.info(ws).ok);
      this.departures.delete(id);await this.ctx.storage.delete('leave:'+id);
      if(!connected){await this.markDeparture(id);this.pres.delete(id);this.partial.delete(id);this.resyncAt.delete(id);this.bcast({t:'l',id});}
    }
    await this.scheduleAlarm();this.snapshots();
  }
}
