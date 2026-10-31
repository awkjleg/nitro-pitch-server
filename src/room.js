import { DurableObject } from 'cloudflare:workers';
const MAX_PLAYERS=400,MAX_MSG=64000,RECONNECT_GRACE=12000;
const cleanId=value=>String(value||'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,48);
const bytes=new TextEncoder();

export class Room extends DurableObject {
  constructor(ctx,env){
    super(ctx,env);this.pres=new Map();this.partial=new Set();this.departures=new Map();this.resyncAt=new Map();this.rematchSent=null;
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'));
    // Socket attachments survive hibernation. Full small lobby records fit; large
    // match records retain identity/seat metadata until the client resends them.
    for(const ws of ctx.getWebSockets()){
      const info=this.info(ws);if(!info.ok || !info.id || ws.readyState!==1)continue;
      this.pres.set(info.id,info.p||{});if(!info.full)this.partial.add(info.id);
    }
    ctx.blockConcurrencyWhile(async()=>{
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
    let record={id,ok:true,p,full:true};
    if(bytes.encode(JSON.stringify(record)).length>1900){
      const summary={};
      for(const key of ['nm','lv','j','tm','sp','lp','ingame','ui','un','rb','bv']){
        const value=p[key];
        if(typeof value==='string'&&['nm','lp','ui','un'].includes(key))summary[key]=value.slice(0,key==='ui'?64:key==='lp'?48:32);
        else if(typeof value==='boolean'||(typeof value==='number'&&Number.isFinite(value)))summary[key]=value;
      }
      record={id,ok:true,p:summary,full:false};
    }
    ws.serializeAttachment(record);
  }
  state(ws,created=false){
    const id=this.info(ws).id,members=Object.create(null);for(const[key,value]of this.pres)if(key!==id)members[key]=value;
    this.send(ws,{t:'state',you:id,created,members,memberIds:Object.keys(members),pending:[...this.partial].filter(key=>key!==id)});
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
  async fetch(request){
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
    if(['hello','full','sync'].includes(message.t)){
      const p=message.p&&typeof message.p==='object'&&!Array.isArray(message.p)?message.p:{};
      const known=this.pres.has(id),created=[...this.pres.keys()].every(key=>key===id);
      const changed=!known||this.partial.has(id)||JSON.stringify(this.pres.get(id))!==JSON.stringify(p);
      this.pres.set(id,p);this.partial.delete(id);this.resyncAt.delete(id);this.cache(ws,id,p);
      if(this.departures.delete(id)){await this.ctx.storage.delete('leave:'+id);await this.scheduleAlarm();}
      if(message.t==='hello'||message.t==='sync')this.state(ws,created);
      if(changed)this.bcast({t:known?'f':'j',id,p},ws);this.resync();this.checkRematch(message.t==='hello'||message.t==='sync');return;
    }
    if(message.t==='p'&&message.p&&typeof message.p==='object'&&!Array.isArray(message.p)){
      if(!info.ok||!this.pres.has(id)||this.partial.has(id)){this.send(ws,{t:'resync'});return;}
      const current=this.pres.get(id),out={};
      for(const key of Object.keys(message.p)){
        if(['__proto__','constructor','prototype'].includes(key))continue;
        out[key]=message.p[key];if(out[key]===null)delete current[key];else current[key]=out[key];
      }
      this.cache(ws,id,current);this.bcast({t:'p',id,p:out},ws);this.resync();this.checkRematch();return;
    }
    if(message.t==='bye'){await this.gone(ws,true);try{ws.close(1000,'bye');}catch(_){}}
  }
  async gone(ws,explicit=false){
    const info=this.info(ws),id=info.id;if(!id||!info.ok||!this.current(ws,id))return;
    try{ws.serializeAttachment({...info,ok:false});}catch(_){}
    if(explicit){
      this.pres.delete(id);this.partial.delete(id);this.resyncAt.delete(id);this.departures.delete(id);
      await this.ctx.storage.delete('leave:'+id);await this.scheduleAlarm();this.bcast({t:'l',id});this.snapshots();return;
    }
    // Retain a seat during short transport interruptions. An explicit Leave still
    // removes it immediately; a reconnect with the same tab ID cancels this timer.
    const p=this.pres.get(id)||info.p||{},until=Date.now()+RECONNECT_GRACE;
    this.pres.set(id,p);this.departures.set(id,until);this.partial.add(id);
    await this.ctx.storage.put('leave:'+id,{p,until});await this.scheduleAlarm();
  }
  async webSocketClose(ws){await this.gone(ws);try{ws.close(1000,'disconnected');}catch(_){}}
  async webSocketError(ws){await this.gone(ws);try{ws.close(1011,'connection error');}catch(_){}}
  async alarm(){
    for(const[id,until]of this.departures){
      if(until>Date.now())continue;
      const connected=this.ctx.getWebSockets(id).some(ws=>ws.readyState===1&&this.info(ws).ok);
      this.departures.delete(id);await this.ctx.storage.delete('leave:'+id);
      if(!connected){this.pres.delete(id);this.partial.delete(id);this.resyncAt.delete(id);this.bcast({t:'l',id});}
    }
    await this.scheduleAlarm();this.snapshots();
  }
}
