// One server-backed lobby for every tab. Transient failures reconnect here instead
// of silently putting a player into a separate peer-to-peer lobby.
(() => {
  const legacy = window.claude;
  if (!legacy || !legacy.__np || typeof WebSocket !== 'function') return;
  const DEFAULT_URL = location.protocol === 'https:' ? 'wss://' + location.host + '/ws' : 'ws://' + location.host + '/ws';
  const OPEN_WAIT = 10000, STATE_WAIT = 30000, HEARTBEAT = 10000, REPLY_WAIT = 10000;
  const clone = value => JSON.parse(JSON.stringify(value));
  function patch(target, values) { for (const key of Object.keys(values)) { if (values[key] === null) delete target[key]; else target[key] = values[key]; } return target; }
  const me = 's' + crypto.getRandomValues(new Uint32Array(3)).join('-');
  const serverUrl = () => typeof window.NP_ROOM_SERVER === 'string' && window.NP_ROOM_SERVER ? window.NP_ROOM_SERVER : DEFAULT_URL;
  const rooms = new Map();

  class Room {
    constructor(name, lobby = false) {
      this.name = name; this.lobby = lobby; this.me = me;
      this.pres = {}; this.sent = {}; this.others = new Map(); this.cbs = []; this.connCbs = []; this.events = new Map(); this.rttMs=null; this.lastPongAt=0;
      this.closed = false; this.isConnected = false; this.created = undefined; this.tries = 0; this.ws = null;
      this.opened = new Promise((resolve,reject) => { this.resolve = resolve; this.reject = reject; }); this.opened.catch(() => {});
      this.rebuild(); this.connect();
    }
    rebuild() {
      this.snap = Object.freeze([
        Object.freeze({peer:me,sameTab:true,isMe:true,kind:'viewer',guest:false,by:null,presence:Object.freeze(clone(this.pres)),updatedAt:Date.now()}),
        ...[...this.others].map(([id,item]) => Object.freeze({peer:id,sameTab:false,isMe:false,kind:'viewer',guest:false,by:null,...item}))
      ]);
    }
    fire(joined=[],left=[],updated=[]) { for (const cb of this.cbs) { try { cb({peers:this.snap,joined,left,updated}); } catch(error) { console.error(error); } } }
    connected() { return this.isConnected; }
    connectionInfo(){return {connected:this.isConnected,pingMs:this.rttMs,lastReply:this.lastPongAt};}
    setConnected(connected) {
      if (connected === this.isConnected) return;
      this.isConnected = connected;
      for (const cb of this.connCbs) { try { cb(connected); } catch (_) {} }
    }
    applyState(message) {
      const previous = this.others, next = new Map();
      const pending = new Set(message.pending || []);
      const ids = Array.isArray(message.memberIds) ? message.memberIds : Object.keys(message.members || {});
      for (const id of ids) {
        if (id === me) continue;
        const prior = previous.get(id), incoming = message.members?.[id];
        const presence = incoming && typeof incoming === 'object' ? (pending.has(id) && prior ? patch(clone(prior.presence),incoming) : clone(incoming)) : clone(prior?.presence || {});
        // A membership refresh is not a new gameplay update from a sleeping peer.
        const unchanged=prior && JSON.stringify(prior.presence)===JSON.stringify(presence);
        next.set(id,{presence:Object.freeze(presence),updatedAt:pending.has(id)||unchanged ? prior?.updatedAt || 0 : Date.now()});
      }
      this.others = next; this.rebuild();
      const joined=this.snap.filter(p=>!p.sameTab&&!previous.has(p.peer));
      const updated=this.snap.filter(p=>!p.sameTab&&previous.has(p.peer));
      const left=[...previous].filter(([id])=>!next.has(id)).map(([id,item])=>Object.freeze({peer:id,sameTab:false,isMe:false,...item}));
      this.fire(joined,left,updated);
    }
    upsert(id,values,full) {
      if (id === me || !values || typeof values !== 'object') return;
      const prior=this.others.get(id);
      const presence=full ? clone(values) : patch(clone(prior?.presence || {}),values);
      const unchanged=prior && JSON.stringify(prior.presence)===JSON.stringify(presence);
      this.others.set(id,{presence:Object.freeze(presence),updatedAt:unchanged?prior.updatedAt:Date.now()});
      this.rebuild();const entry=this.snap.find(p=>p.peer===id);
      this.fire(prior?[]:[entry],[],prior?[entry]:[]);
    }
    remove(id) {
      const prior=this.others.get(id);if(!prior)return;
      this.others.delete(id);this.rebuild();this.fire([],[Object.freeze({peer:id,sameTab:false,isMe:false,...prior})]);
    }
    send(message) {
      if (this.ws?.readyState !== 1) return;
      try { this.ws.send(typeof message === 'string' ? message : JSON.stringify(message)); } catch (_) {}
    }
    sync() { this.send({t:'sync',p:this.pres}); }
    connect() {
      if (this.closed) return;
      clearTimeout(this.retryTimer);
      let ws;
      try { ws=new WebSocket(serverUrl()+'?room='+encodeURIComponent(this.name)+'&id='+encodeURIComponent(me)); } catch (_) { if(!this.lobby&&!this.everConnected){this.reject({code:'network'});this.leave();}else this.lost();return; }
      this.ws=ws;
      const fail=()=>{
        if(this.ws!==ws || this.closed)return;
        try{ws.close();}catch(_){}
        if(!this.lobby && !this.everConnected){this.reject({code:'timeout'});this.leave();return;}
        this.lost(ws);
      };
      this.firstTimer=setTimeout(fail,OPEN_WAIT);
      ws.onopen=()=>{
        if(this.ws!==ws || this.closed)return;
        clearTimeout(this.firstTimer);this.firstTimer=setTimeout(fail,STATE_WAIT);
        this.send({t:'hello',p:this.pres});
      };
      ws.onmessage=event=>{
        if(this.ws!==ws || this.closed)return;
        if(event.data==='pong'){if(this.replyTimer){const rtt=Math.max(0,Date.now()-this.pingSentAt);this.rttMs=Math.round(this.rttMs===null?rtt:this.rttMs*.7+rtt*.3);this.lastPongAt=Date.now();}clearTimeout(this.replyTimer);this.replyTimer=null;return;}
        let message;try{message=JSON.parse(event.data);}catch(_){return;}
        if(!message || typeof message!=='object')return;
        if(message.t==='state'){
          clearTimeout(this.firstTimer);this.tries=0;this.applyState(message);
          if(this.created===undefined)this.created=!!message.created;
          this.everConnected=true;this.setConnected(true);this.resolve(this);this.ping();return;
        }
        if(message.t==='rematch-ready'&&typeof message.mid==='string'&&Array.isArray(message.voters)&&message.voters.every(id=>typeof id==='string')){for(const cb of this.events.get(message.t)||[]){try{cb(message);}catch(error){console.error(error);}}return;}
        if(message.t==='resync'){this.send({t:'full',p:this.pres});return;}
        if(typeof message.id==='string'){
          if(message.t==='j'||message.t==='f')this.upsert(message.id,message.p,true);
          else if(message.t==='p')this.upsert(message.id,message.p,false);
          else if(message.t==='l')this.remove(message.id);
        }
      };
      ws.onclose=ws.onerror=()=>{if(this.ws===ws){if(!this.lobby&&!this.everConnected){this.reject({code:'network'});this.leave();}else this.lost(ws);}};
      this.lastTick=Date.now();
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer=setInterval(()=>{
        if(this.ws!==ws || this.closed || ws.readyState!==1)return;
        // Throttled background timers must not interpret an old deadline as a fresh failure.
        const resumed=Date.now()-this.lastTick>HEARTBEAT*2;this.lastTick=Date.now();
        if(resumed){clearTimeout(this.replyTimer);this.replyTimer=null;}
        this.sync();this.ping();
      },HEARTBEAT);
    }
    ping() {
      if(this.replyTimer || this.ws?.readyState!==1)return;
      this.pingSentAt=Date.now();this.send('ping');
      const ws=this.ws;
      this.replyTimer=setTimeout(()=>{
        this.replyTimer=null;if(this.ws!==ws || this.closed)return;
        if(Date.now()-this.lastTick>HEARTBEAT*2){this.lastTick=Date.now();this.sync();this.ping();return;}
        try{ws.close();}catch(_){}this.lost(ws);
      },REPLY_WAIT);
    }
    lost(ws) {
      if(ws && this.ws!==ws)return;
      clearTimeout(this.firstTimer);clearTimeout(this.replyTimer);clearInterval(this.heartbeatTimer);this.replyTimer=null;
      this.ws=null;this.setConnected(false);
      if(this.closed)return;
      clearTimeout(this.retryTimer);
      this.retryTimer=setTimeout(()=>this.connect(),Math.min(8000,500*2**this.tries++)+Math.random()*250);
    }
    wake() {
      if(this.closed)return;
      if(!this.ws || this.ws.readyState>1){this.lost(this.ws);clearTimeout(this.retryTimer);this.connect();return;}
      if(this.ws.readyState===1){clearTimeout(this.replyTimer);this.replyTimer=null;this.lastTick=Date.now();this.sync();this.ping();}
    }
    async presence(values) {
      if(!values || typeof values!=='object')return;
      const out={};
      for(const key of Object.keys(values)){const value=values[key]===undefined?null:values[key],text=JSON.stringify(value);if(this.sent[key]!==text){this.sent[key]=text;out[key]=value;}}
      if(!Object.keys(out).length)return;
      patch(this.pres,clone(out));this.rebuild();this.fire([],[],[this.snap[0]]);this.send({t:'p',p:out});
    }
    peers(){return this.snap;}
    onPeers(cb){this.cbs.push(cb);setTimeout(()=>{if(!this.closed&&this.cbs.includes(cb))cb({peers:this.snap,joined:this.snap,left:[],updated:[]});});return()=>{this.cbs=this.cbs.filter(value=>value!==cb);};}
    onConnection(cb){this.connCbs.push(cb);setTimeout(()=>{if(!this.closed&&this.connCbs.includes(cb))cb(this.isConnected);});return()=>{this.connCbs=this.connCbs.filter(value=>value!==cb);};}
    async emit(){}
    on(name,cb){if(typeof cb!=='function')return()=>{};if(!this.events.has(name))this.events.set(name,new Set());const set=this.events.get(name);set.add(cb);return()=>set.delete(cb);}
    async leave(){
      if(this.closed)return;
      this.send({t:'bye'});this.closed=true;clearTimeout(this.firstTimer);clearTimeout(this.retryTimer);clearTimeout(this.replyTimer);clearInterval(this.heartbeatTimer);
      const ws=this.ws;this.ws=null;this.setConnected(false);try{ws?.close(1000,'left');}catch(_){}
      if(rooms.get(this.name)===this)rooms.delete(this.name);
      if(!this.everConnected)this.reject({code:'left'});
    }
    async join(name){const room=openRoom(String(name),false);return room.opened;}
  }
  function openRoom(name,lobby){const existing=rooms.get(name);if(existing&&!existing.closed)return existing;const room=new Room(name,lobby);rooms.set(name,room);return room;}
  addEventListener('online',()=>{for(const room of rooms.values())room.wake();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')for(const room of rooms.values())room.wake();});
  addEventListener('pagehide',event=>{if(!event.persisted)for(const room of [...rooms.values()])room.leave();});
  addEventListener('pageshow',event=>{if(event.persisted)for(const room of rooms.values())room.wake();});
  window.npRoomMode='server';
  window.claude={__np:true,use:async name=>name==='room'?openRoom('lobby',true):null};
  window.npServerDebug=()=>({me,url:serverUrl(),mode:'server',rooms:[...rooms.values()].map(room=>({name:room.name,connected:room.isConnected,created:room.created,peers:room.snap.length}))});
})();
