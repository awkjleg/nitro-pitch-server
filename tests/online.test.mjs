import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {validCar,validHit,validGame,resultEvidence,rankedRules} from '../src/room-guard.js';
const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

async function roomFixture(){
  let now=100000;const sockets=[],data=new Map();let alarm=null;
  const storage={get:async key=>data.get(key),list:async({prefix})=>new Map([...data].filter(([key])=>key.startsWith(prefix))),put:async(key,value)=>data.set(key,structuredClone(value)),delete:async key=>data.delete(key),setAlarm:async value=>{alarm=value;},deleteAlarm:async()=>{alarm=null;}};
  const ctx={storage,getWebSockets:id=>sockets.filter(ws=>ws.readyState===1&&(!id||ws.attachment.id===id)),setWebSocketAutoResponse(){},blockConcurrencyWhile(fn){this.ready=fn();}};
  const source=(await read('src/room.js')).replace(/^import .*;$/gm,'').replace('export class Room','class Room')+'\nglobalThis.TestRoom=Room;';
  const context=vm.createContext({validCar,validHit,validGame,resultEvidence,reply:Response.json,identify:async()=>({uid:"test"}),structuredClone,DurableObject:class{constructor(ctx,env){this.ctx=ctx;this.env=env;}},WebSocketRequestResponsePair:class{},TextEncoder,Response,Request,URL,JSON,Map,Set,Date:class extends Date{static now(){return now;}}});vm.runInContext(source,context);
  const fixture={ctx,sockets,data,advance:ms=>{now+=ms;},get alarm(){return alarm;},async wake(){this.room=new context.TestRoom(ctx,{});await ctx.ready;return this.room;},socket(id){const ws={readyState:1,attachment:{id,ok:false},messages:[],serializeAttachment(value){this.attachment=structuredClone(value);},deserializeAttachment(){return structuredClone(this.attachment);},send(value){this.messages.push(JSON.parse(value));},close(){this.readyState=3;}};sockets.push(ws);return ws;},message(ws,value){return this.room.webSocketMessage(ws,JSON.stringify(value));}};
  await fixture.wake();return fixture;
}

test('hibernation retains a quiet lobby and broadcasts one authoritative membership',async()=>{
 const f=await roomFixture(),a=f.socket('a'),b=f.socket('b');await f.message(a,{t:'hello',p:{nm:'A'}});await f.message(b,{t:'hello',p:{nm:'B'}});
 await f.wake();await f.message(a,{t:'sync',p:{nm:'A'}});
 const state=a.messages.filter(m=>m.t==='state').at(-1);assert.deepEqual(state.memberIds,['b']);assert.equal(state.members.b.nm,'B');
 assert(!a.messages.some(m=>m.t==='l'));
});

test('large sleeping match records preserve player seats while requesting a full resync',async()=>{
 const f=await roomFixture(),a=f.socket('a'),b=f.socket('b');await f.message(a,{t:'hello',p:{nm:'A',j:1,tm:0,large:'large'.repeat(1000)}});await f.message(b,{t:'hello',p:{nm:'B',j:2,tm:1}});
 await f.wake();await f.message(b,{t:'sync',p:{nm:'B',j:2,tm:1}});const state=b.messages.filter(m=>m.t==='state').at(-1);
 assert.deepEqual(state.memberIds,['a']);assert.deepEqual(state.pending,['a']);assert.equal(state.members.a.j,1);assert(a.messages.some(m=>m.t==='resync'));
 await f.message(a,{t:'full',p:{nm:'A',j:1,tm:0,large:'restored'}});assert.equal(f.room.partial.size,0);
});

test('short disconnects survive a wake/reconnect without a false departure; real departures expire',async()=>{
 const f=await roomFixture(),a=f.socket('a'),b=f.socket('b');await f.message(a,{t:'hello',p:{nm:'A'}});await f.message(b,{t:'hello',p:{nm:'B'}});
 a.readyState=3;await f.room.webSocketClose(a);assert(f.alarm);await f.wake();
 const replacement=f.socket('a');await f.message(replacement,{t:'hello',p:{nm:'A'}});assert(!b.messages.some(m=>m.t==='l'&&m.id==='a'));assert.equal(f.room.departures.size,0);
 replacement.readyState=3;await f.room.webSocketClose(replacement);f.advance(12001);await f.room.alarm();assert(b.messages.some(m=>m.t==='l'&&m.id==='a'));assert(!f.room.pres.has('a'));
});

test('explicit leave is immediate and a replaced socket cannot remove the new connection',async()=>{
 const f=await roomFixture(),a=f.socket('a'),b=f.socket('b');await f.message(a,{t:'hello',p:{nm:'A'}});await f.message(b,{t:'hello',p:{nm:'B'}});
 a.attachment.replaced=true;a.attachment.ok=false;const replacement=f.socket('a');await f.message(replacement,{t:'hello',p:{nm:'A2'}});a.readyState=3;await f.room.webSocketClose(a);assert.equal(f.room.pres.get('a').nm,'A2');
 await f.message(replacement,{t:'bye'});assert(!f.room.pres.has('a'));assert(b.messages.some(m=>m.t==='l'&&m.id==='a'));
});

async function clientFixture(){
 const timers=[],intervals=[],sockets=[],listeners={};let now=100000;
 const context={console,crypto:{getRandomValues:a=>{a.set([1,2,3]);return a;}},location:{protocol:'https:',host:'nitropitch.app'},document:{visibilityState:'visible',addEventListener(type,fn){listeners[type]=fn;}},setTimeout(fn){const value={fn,cleared:false};timers.push(value);return value;},clearTimeout(timer){if(timer)timer.cleared=true;},setInterval(fn){const value={fn,cleared:false};intervals.push(value);return value;},clearInterval(timer){if(timer)timer.cleared=true;},addEventListener(type,fn){listeners[type]=fn;},Date:class extends Date{static now(){return now;}}};
 context.window=context;context.claude={__np:true,use(){throw Error('A separate fallback lobby must not be used');}};
 context.WebSocket=class{constructor(url){this.url=url;this.readyState=0;this.messages=[];sockets.push(this);}send(value){this.messages.push(value);}close(){this.readyState=3;}open(){this.readyState=1;this.onopen();}receive(value){this.onmessage({data:JSON.stringify(value)});}};
 vm.runInNewContext(await read('public/online-rooms.js'),context);
 return{context,sockets,timers,intervals,listeners,advance:ms=>{now+=ms;},async lobby(){return context.claude.use('room');},flush(){for(const timer of timers.splice(0))if(!timer.cleared)timer.fn();}};
}

test('client reconnects to the same lobby, ignores old sockets, and applies membership atomically',async()=>{
 const f=await clientFixture(),room=await f.lobby();await room.presence({nm:'Me'});const ws=f.sockets[0];ws.open();
 ws.receive({t:'state',members:{a:{nm:'A'},b:{nm:'B'}},memberIds:['a','b']});assert.equal(room.peers().length,3);
 let left=0;room.onPeers(change=>{left+=change.left.length;});f.flush();
 ws.receive({t:'state',members:{a:{nm:'A'}},memberIds:['a','b'],pending:['b']});assert.equal(room.peers().length,3);assert.equal(left,0);
 room.lost(ws);f.flush();const next=f.sockets.at(-1);next.open();next.receive({t:'state',members:{a:{nm:'A'},b:{nm:'B'}},memberIds:['a','b']});ws.receive({t:'l',id:'b'});assert.equal(room.peers().length,3);assert.equal(f.context.npRoomMode,'server');
});

test('tab wake requests an authoritative refresh and identical full states do not refresh gameplay timestamps',async()=>{
 const f=await clientFixture(),room=await f.lobby(),ws=f.sockets[0];ws.open();ws.receive({t:'state',members:{a:{nm:'A',j:1}},memberIds:['a']});const first=room.peers()[1].updatedAt;
 f.advance(10000);ws.receive({t:'state',members:{a:{nm:'A',j:1}},memberIds:['a']});assert.equal(room.peers()[1].updatedAt,first);
 f.listeners.visibilitychange();assert(ws.messages.some(value=>value.includes('"t":"sync"')));
 ws.receive({t:'f',id:'a',p:{nm:'A',j:1,t:2}});assert(room.peers()[1].updatedAt>first);
});

test('rematches require every active human and reject stale votes, changed rosters and disconnects',async()=>{
 const f=await roomFixture(),a=f.socket('a'),b=f.socket('b'),s=f.socket('s');
 await f.message(a,{t:'hello',p:{j:1,tm:0}});await f.message(b,{t:'hello',p:{j:2,tm:1}});await f.message(s,{t:'hello',p:{j:3,tm:-1,sp:true}});
 const vote=(mid='m1',roster=['a','b'])=>({mid,roster,yes:true});
 await f.message(a,{t:'p',p:{npRematch:vote()}});assert(!a.messages.some(m=>m.t==='rematch-ready'));
 await f.message(b,{t:'p',p:{npRematch:vote('old')}});assert(!a.messages.some(m=>m.t==='rematch-ready'));
 await f.message(b,{t:'p',p:{npRematch:vote('m1',['b'])}});assert(!a.messages.some(m=>m.t==='rematch-ready'));
 await f.message(b,{t:'p',p:{npRematch:vote()}});assert.deepEqual(a.messages.filter(m=>m.t==='rematch-ready'),[{t:'rematch-ready',mid:'m1',voters:['a','b']}]);
 await f.message(a,{t:'p',p:{nm:'A'}});assert.equal(a.messages.filter(m=>m.t==='rematch-ready').length,1);
 b.readyState=3;await f.room.webSocketClose(b);await f.message(a,{t:'p',p:{npRematch:vote('m2')}});assert.equal(a.messages.filter(m=>m.t==='rematch-ready').length,1);
 const replacement=f.socket('b');await f.message(replacement,{t:'hello',p:{j:2,tm:1,npRematch:vote('m2')}});assert.equal(a.messages.filter(m=>m.t==='rematch-ready').length,2);
});
test('connection metrics track pong latency and server events unsubscribe',async()=>{
 const f=await clientFixture(),room=await f.lobby(),ws=f.sockets[0];ws.open();ws.receive({t:'state',members:{}});
 f.advance(37);ws.onmessage({data:'pong'});assert.equal(room.connectionInfo().pingMs,37);assert.equal(room.connectionInfo().connected,true);
 let events=0;const off=room.on('rematch-ready',()=>events++);ws.receive({t:'rematch-ready',mid:'m1',voters:['a','b']});off();ws.receive({t:'rematch-ready',mid:'m1',voters:['a','b']});assert.equal(events,1);
 room.lost(ws);assert.equal(room.connectionInfo().connected,false);
});

test('match disconnect reserves the same team seat for sixty seconds and broadcasts recovery',async()=>{
 const f=await roomFixture();f.room.name='np-m-test';await f.ctx.storage.put('room-name','np-m-test');
 const a=f.socket('a'),b=f.socket('b');await f.message(a,{t:'hello',p:{nm:'A',j:1,tm:0}});await f.message(b,{t:'hello',p:{nm:'B',j:2,tm:1}});
 a.readyState=3;await f.room.webSocketClose(a);assert.equal(f.alarm,160000);assert.equal(b.messages.at(-2)?.t==='connection'||b.messages.some(m=>m.t==='connection'&&m.until===160000),true);
 f.advance(30000);await f.wake();await f.message(b,{t:'sync',p:{nm:'B',j:2,tm:1}});assert.equal(b.messages.filter(m=>m.t==='state').at(-1).reconnecting.a,160000);
 const replacement=f.socket('a');await f.message(replacement,{t:'hello',p:{nm:'A',j:1,tm:0}});assert.equal(f.room.pres.get('a').tm,0);assert.equal(f.room.pres.get('a').j,1);assert(b.messages.some(m=>m.t==='connection'&&m.id==='a'&&m.until===0));assert(!b.messages.some(m=>m.t==='l'));
 replacement.readyState=3;await f.room.webSocketClose(replacement);f.advance(60001);await f.room.alarm();assert(!f.room.pres.has('a'));assert(b.messages.some(m=>m.t==='l'&&m.id==='a'));
});
test('connection indicators reconcile snapshots, recovery events and final departures',async()=>{
 const f=await clientFixture(),room=await f.lobby(),ws=f.sockets[0];ws.open();ws.receive({t:'state',members:{other:{nm:'Other'}},reconnecting:{other:160000}});assert.equal(room.connectionInfo().reconnecting.other,160000);
 ws.receive({t:'connection',id:'other',until:0});assert.equal(room.connectionInfo().reconnecting.other,undefined);
 ws.receive({t:'connection',id:'other',until:170000});ws.receive({t:'l',id:'other'});assert.equal(room.connectionInfo().reconnecting.other,undefined);
 room.lost(ws);assert.equal(room.connectionInfo().disconnectedAt,100000);
});
