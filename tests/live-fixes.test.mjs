// Regression tests for the live bugs fixed together: ranked results that paid no MMR (or nothing at all), the free play
// countdown, ball hits ignored after rejoining a private match, and the clan members list stuck on "Loading".
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {validCar,validHit,validGame,resultEvidence,rankedRules} from '../src/room-guard.js';
import {html,read} from './served-game.mjs';

const ranked=(over={})=>({s:[3,0],st:{pa:[400,3,0,0,4,0]},mut:[0,0,0,0,2,0,0],rk:1,mm:1,pl:1,tl:0,ot:false,...over});

test('a bot-filled online ranked match (players on one team only) counts for rank once that team confirms',()=>{
 const r={room:'np-m-solo',mid:'m1',final:ranked(),started:0,ended:190000,roster:[{id:'pa',uid:'ua',team:0}],acks:[]};
 assert.throws(()=>resultEvidence(r,'ua',191000),/Waiting/);
 r.acks.push('ua');const e=resultEvidence(r,'ua',191000);assert.equal(e.ranked,true);assert.equal(e.kind,'ranked');assert.equal(e.won,true);assert.deepEqual(e.st,[400,3,0,0,4,0]);
 // a 2v2 party against two bots: both players are on one team
 const party={...r,final:ranked({pl:2,st:{pa:[400,3,0,0,4,0],pb:[100,0,0,0,1,0]}}),roster:[{id:'pa',uid:'ua',team:0},{id:'pb',uid:'ub',team:0}],acks:['ub']};
 assert.equal(resultEvidence(party,'ua',191000).ranked,true);
 // without a confirmation it still pays after 90 s, without rank (unchanged)
 r.acks=[];assert.equal(resultEvidence(r,'ua',290000).ranked,false);
 // real opponents still need both teams' confirmations
 const two={...r,roster:[{id:'pa',uid:'ua',team:0},{id:'pb',uid:'ub',team:1}],acks:['ua']};
 assert.throws(()=>resultEvidence(two,'ua',191000),/Waiting/);two.acks.push('ub');assert.equal(resultEvidence(two,'ua',191000).ranked,true);
});

async function roomFixture(){
 let now=100000;const sockets=[],data=new Map(),forfeits=[];
 const storage={get:async key=>data.get(key),list:async({prefix})=>new Map([...data].filter(([key])=>key.startsWith(prefix))),put:async(key,value)=>data.set(key,structuredClone(value)),delete:async key=>data.delete(key),setAlarm:async()=>{},deleteAlarm:async()=>{}};
 const ctx={storage,getWebSockets:id=>sockets.filter(ws=>ws.readyState===1&&(!id||ws.attachment.id===id)),setWebSocketAutoResponse(){},blockConcurrencyWhile(fn){this.ready=fn();}};
 const env={PROGRESS:{idFromName:x=>x,get:()=>({fetch:async req=>{forfeits.push(await req.json());return Response.json({ok:true});}})}};
 const source=(await read('src/room.js')).replace(/^import .*;$/gm,'').replace('export class Room','class Room')+'\nglobalThis.TestRoom=Room;';
 const context=vm.createContext({validCar,validHit,validGame,resultEvidence,rankedRules,reply:Response.json,identify:async token=>({uid:token}),structuredClone,DurableObject:class{constructor(ctx,env){this.ctx=ctx;this.env=env;}},WebSocketRequestResponsePair:class{},TextEncoder,Response,Request,URL,JSON,Map,Set,Date:class extends Date{static now(){return now;}}});
 vm.runInContext(source,context);const room=new context.TestRoom(ctx,env);await ctx.ready;room.name='np-m-test';
 const socket=id=>{const ws={readyState:1,attachment:{id,ok:false},messages:[],serializeAttachment(v){this.attachment=structuredClone(v);},deserializeAttachment(){return structuredClone(this.attachment);},send(v){this.messages.push(JSON.parse(v));},close(){this.readyState=3;}};sockets.push(ws);return ws;};
 return {room,socket,forfeits,advance:ms=>{now+=ms;},send:(ws,m)=>room.webSocketMessage(ws,JSON.stringify(m))};
}
const game=(ph,s,extra={})=>({ph,s,b:[0,2,0,0,0,0,0,0,0],mut:[0,0,0,0,1,0,0],md:1,tl:ph==='over'?0:100,pt:0,mid:'mid1',st:{a:[300,s[0],0,0,2,0]},rk:1,mm:1,pl:1,...extra});

test('the host\'s final state confirms its own team, and a confirmation sent just before the end is kept',async()=>{
 const f=await roomFixture(),a=f.socket('a'),b=f.socket('b');
 await f.send(a,{t:'auth',token:'ua'});await f.send(b,{t:'auth',token:'ub'});
 await f.send(a,{t:'hello',p:{j:1,tm:0}});await f.send(b,{t:'hello',p:{j:2,tm:1}});
 await f.send(a,{t:'p',p:{g:game('countdown',[0,0])}});f.advance(200000);await f.send(a,{t:'p',p:{g:game('play',[1,0])}});
 // the opponent's client confirmed a moment before the host's final state reached the room
 await f.send(b,{t:'result-ack',mid:'mid1',score:[1,0]});
 await f.send(a,{t:'p',p:{g:game('over',[1,0])}});
 const record=f.room.matchRecords.get('mid1');assert.equal(JSON.stringify([...record.acks].sort()),'["ua","ub"]');
 assert.equal(resultEvidence(record,'ua',301000).ranked,true);assert.equal(resultEvidence(record,'ub',301000).won,false);
 // an early confirmation with a different score does not count
 const g=await roomFixture(),c=g.socket('a'),d=g.socket('b');
 await g.send(c,{t:'auth',token:'ua'});await g.send(d,{t:'auth',token:'ub'});await g.send(c,{t:'hello',p:{j:1,tm:0}});await g.send(d,{t:'hello',p:{j:2,tm:1}});
 await g.send(c,{t:'p',p:{g:game('countdown',[0,0])}});g.advance(200000);await g.send(d,{t:'result-ack',mid:'mid1',score:[0,1]});await g.send(c,{t:'p',p:{g:game('play',[1,0])}});await g.send(c,{t:'p',p:{g:game('over',[1,0])}});
 assert.equal(JSON.stringify(g.room.matchRecords.get('mid1').acks),'["ua"]');
});

test('leaving a bot-filled ranked match early is a loss like leaving one against players',async()=>{
 const f=await roomFixture(),a=f.socket('a');await f.send(a,{t:'auth',token:'ua'});await f.send(a,{t:'hello',p:{j:1,tm:0}});
 await f.send(a,{t:'p',p:{g:game('countdown',[0,0])}});await f.send(a,{t:'bye'});
 assert.deepEqual(JSON.parse(JSON.stringify(f.forfeits)),[{uid:'ua',room:'np-m-test',mid:'mid1',playlist:1}]);
});

test('a bot-filled matchmade game without the lobby stays ranked (session-start carries rk)',()=>{
 assert(html.includes('function startLocalMatch(m) { startOfflineMatch(matchCfg(m), m.team === 1 ? 1 : 0); }'));
 assert(!html.includes('rank unchanged'));
});

function matchFixture(over={}){
 const start=html.indexOf('function ballGrounded()'),end=html.indexOf('// ---------- replay recorder',start);
 const v=()=>({set(){return this;}});
 const context=vm.createContext({viewer:false,training:null,mode:'offline',freePlay:false,manageBots(){},snowOn:false,dropOn:false,hoopsOn:false,nowS:()=>1000,BR:2,PUCK_HH:1,L:100,UU:1,kickBallPos(){},skipVotes:()=>[0,0],mercyWin:()=>false,
  ball:{p:{y:10,z:0},v:v(),floorFrame:false},lastTouch:{team:-1,name:''},match:{ph:'countdown',pt:3,tl:100,kt:0,ot:false,s:[0,0],k:1},...over});
 vm.runInContext(html.slice(start,end),context);return context;
}
test('free play has no 3-2-1 countdown, also after a goal; other matches keep it',()=>{
 const free=matchFixture({freePlay:true});free.authorityMatch(0.016);assert.equal(free.match.ph,'play');
 free.match.ph='replay';free.match.pt=0.01;free.authorityMatch(0.016);assert.equal(free.match.ph,'play');assert.equal(free.match.k,2);
 const normal=matchFixture();normal.authorityMatch(0.016);assert.equal(normal.match.ph,'countdown');
 normal.match.ph='replay';normal.match.pt=0.01;normal.authorityMatch(0.016);assert.equal(normal.match.ph,'countdown');assert.equal(normal.match.pt,3);
});

test('rejoining a match keeps the ball-hit counter rising so the host applies the hits',()=>{
 const join=html.slice(html.indexOf('async function joinRoom(name, opts)'),html.indexOf('const followTry = new Map();'));
 assert(join.includes('hitSeen.clear();'));assert(!/me\.hitN = 0/.test(join));
 assert(join.includes('for (const p of ch.left) { remotes.delete(p.peer); hitSeen.delete(p.peer);'));
});

test('the clan page fills the members list even when it redraws during the request',async()=>{
 const start=html.indexOf('  // The clan page redraws whenever');assert(start>0);
 const code=html.slice(start,html.indexOf('  const online = new Map(lobbyPlayers()',start));
 let calls=0,resolve;const ml=()=>({isConnected:true,children:[],innerHTML:'x',append(...n){this.children.push(...n);}});
 const c={clan:{id:'c1'},A:{clans:{members:()=>{calls++;return new Promise(r=>{resolve=r;});}}},h:(t,cls,txt)=>txt,sbtn:t=>t,renderClanPage(){}};
 vm.createContext(c);const page=vm.runInContext('(async(ml)=>{'+code+'})',c),run=list=>page(list);
 const first=ml(),second=ml();const p1=run(first);first.isConnected=false;const p2=run(second);
 resolve([{uid:'u1',role:'owner'}]);await p1;await p2;
 assert.equal(calls,1);assert.equal(second.innerHTML,'');assert.deepEqual(c.clan.members,[{uid:'u1',role:'owner'}]);
});

test('match results that cannot be saved keep waiting for confirmations, then say why',async()=>{
 const source=await read('src/secure-progress.txt');
 const calls=[],toasts=[],reports=[];let fails=2;
 const store=new Map();
 const c={window:{},localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},crypto:{randomUUID:()=> 'id'+calls.length},
  setTimeout:fn=>{fn();return 0;},setInterval:()=>0,Date,String,JSON,Object,Promise,Math,
  adoptStore(){},leaveToMenu(){},beginMatch(){},onMatchOver(){},openDrop(){},tradeIn(){},rerollQuest(){},recordRankedResult(){},settleAbandoned(){},endTrade(){},completeTrade(){},claimGifts(){},
  matchKind:()=> 'ranked',mode:'online',me:{team:0},spec:null,match:{mid:'m1',s:[2,0],st:{k:[1,2,0,0,0,0]},rk:1,mm:1,pl:1,mut:[0,0,0,0,0,0,0]},myKey:()=> 'k',gameCode:'np-m-x',clan:{id:''},awardedMid:null,lastResult:null,
  teamRoster:()=>[],boardRows:()=> 'k',replay:{},showPost(){},toast:t=>toasts.push(t),lobbyPresence(){},queueClan(){},screen:'post',profile:{},sanitizeProfile:x=>x,enforceUnlocks(){},applyProfileToMe(){},renderMenuChrome(){},savePending:false,dbOk:true,paused:false,freePlay:false,training:null,viewer:null,
  game:{send:m=>calls.push(m.t)},h:(t,c,x)=>({text:x}),sbtn:()=>({}),
  $:()=>({textContent:'',hidden:false,replaceChildren(){},append(){}})};
 c.window.npAccounts={user:()=>({uid:'u'})};c.window.npReportError=(m)=>reports.push(m);
 c.window.NPProgressAPI={listen(){},revision:()=>0,call:async(action,row)=>{calls.push(action);if(action==='match'){if(fails-->0){const e=new Error('Waiting for both teams to confirm the result');e.status=409;throw e;}return {profile:{},result:{xpGain:350,rank:{d:20}}};}return {};}};
 vm.createContext(c);vm.runInContext(source.replace('const NPSecure =','globalThis.NPSecure =')+'\nglobalThis.over=onMatchOver;globalThis.begin=beginMatch;',c);
 await c.over();
 assert.deepEqual(calls.filter(x=>x==='match').length,3);assert.equal(calls.filter(x=>x==='result-ack').length,3);
 // an outright rejection is reported with its reason
 fails=0;c.window.NPProgressAPI.call=async()=>{const e=new Error('Match statistics failed validation');e.status=422;throw e;};c.match.mid='m2';c.screen='menu';
 await c.over();assert(toasts.some(t=>/Couldn't save this match: Match statistics failed validation/.test(t)));assert(reports.some(t=>/Match statistics failed validation/.test(t)));
 // free play starts no practice session (it used to block the next match's session for 20 s)
 calls.length=0;c.mode='offline';c.matchKind=()=> 'free';c.window.NPProgressAPI.call=async a=>{calls.push(a);return {};};c.begin();await new Promise(r=>setImmediate(r));
 assert(!calls.includes('session-start'));
 c.matchKind=()=> 'ranked';c.match.mid='m3';c.begin();await new Promise(r=>setImmediate(r));assert(calls.includes('session-start'));
});
