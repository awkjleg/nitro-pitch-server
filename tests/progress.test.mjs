import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {catalog,Ranked,economy,levelInfo} from '../src/reward-rules.js';
import {cleanEv,snowQuests,openChristmasDrop,claimAdvent,SNOW_START,ADVENT} from '../src/snowdrift.js';
import {ApiError,reply} from '../src/firebase-auth.js';
import {validCar,validGame,validHit,resultEvidence} from '../src/room-guard.js';
const source=(await readFile(new URL('../src/progress.js',import.meta.url),'utf8')).replace(/^import .*;$/gm,'').replaceAll('export ','');
async function fixture(raw={}){
 let now=1800000000000;const data=new Map(),docs=new Map([['players/a',raw],['players/b',raw]]);
 const clone=v=>v===undefined?undefined:structuredClone(v);
 const storage={get:async k=>clone(data.get(k)),put:async(k,v)=>data.set(k,clone(v)),list:async({prefix})=>new Map([...data].filter(([k])=>k.startsWith(prefix))),transaction:async fn=>{const snapshot=clone(data);try{return await fn(storage);}catch(e){data.clear();for(const[k,v]of snapshot)data.set(k,v);throw e;}}};
 const ctx={storage},env={ROOMS:{idFromName:x=>x,get:()=>({fetch:async()=>Response.json({mid:'online1',st:[200,1,0,0,1,0],score:[1,0],won:true,mvp:true,online:true,ranked:true,playlist:1,team:0,kind:'ranked',roster:[{uid:'a',team:0},{uid:'b',team:1}],elapsed:300})})}};
 const c=vm.createContext({cleanEv,snowQuests,openChristmasDrop,claimAdvent,catalog,Ranked,economy,levelInfo,ApiError,reply,ADMIN_UID:'admin',crypto,URL,Response,Request,structuredClone,AbortSignal,console,Map,Set,Date:class extends Date{static now(){return now;}},DurableObject:class{constructor(ctx,env){this.ctx=ctx;this.env=env;}},firebaseDoc:async path=>clone(docs.get(path)||null)});
 vm.runInContext(source+'\nglobalThis.Progress=Progress;globalThis.cleanProfile=cleanProfile;',c);const ledger=new c.Progress(ctx,env);
 return {data,docs,env,ledger,advance:ms=>now+=ms,clean:c.cleanProfile,async call(action,b={},uid='a'){const response=await ledger.fetch(new Request('https://progress/action',{method:'POST',body:JSON.stringify({body:{action,...b},user:{uid,username:uid},token:'test'})}));return {status:response.status,...await response.json()};}};
}
test('existing Firebase progress imports once and browser save cannot award XP, rank, drops or items',async()=>{
 const f=await fixture({xp:8000,pxp:0,dlv:9,own:{body:[9]},rk:[{m:840,p:8,w:6,l:2,pk:10}],name:'Player'});const a=await f.call('load');assert.equal(a.status,200);assert.equal(a.profile.xp,8000);assert(a.profile.own.body.includes(9));
 f.docs.set('players/a',{xp:1e9});const b=await f.call('save',{profile:{xp:1e9,pxp:1e9,own:{body:[10]},rk:[{m:4000}],drops:[6,6],name:'New name',body:25}});
 assert.equal(b.profile.xp,8000);assert.equal(b.profile.rk[0].m,840);assert.equal(b.profile.name,'New name');assert(!b.profile.own.body.includes(10));assert.equal(b.profile.body,0);assert.deepEqual((await f.call('load')).profile.own,a.profile.own);
});
test('concurrent drop opens consume one drop, return one receipt, and reject stale tabs',async()=>{
 const f=await fixture({drops:[4],dlv:1});const initial=await f.call('load');
 const args={id:'open-1',index:0,rev:initial.rev};const [a,b]=await Promise.all([f.call('drop',args),f.call('drop',args)]);
 assert.equal(a.status,200);assert.equal(b.status,200);assert.deepEqual(a.got,b.got);assert.equal(b.profile.drops.length,0);assert.equal((await f.call('drop',{id:'open-2',index:0,rev:initial.rev})).status,409);
 const list=b.profile.own[a.got.kind];assert.equal(list.filter(x=>x===a.got.i).length,1);
});
test('trade-ins reject repeated indices without consuming anything',async()=>{
 const f=await fixture({drops:[2,2,2,2,2],dlv:1}),a=await f.call('load');const b=await f.call('trade-in',{id:'ti1',rev:a.rev,rarity:2,keys:['drop:0','drop:0','drop:0','drop:0','drop:0']});assert.equal(b.status,400);assert.equal((await f.call('load')).profile.drops.length,5);
 const c=await f.call('trade-in',{id:'ti2',rev:a.rev,rarity:2,keys:['drop:0','drop:1','drop:2','drop:3','drop:4']});assert.equal(c.status,200);assert.equal(c.profile.drops.length,0);assert(c.got.kind);
});
test('practice rewards require a registered timed session and never grant competitive rank',async()=>{
 const f=await fixture({dlv:1});await f.call('load');const result={id:'pay',mid:'practice',score:[2,1],st:[200,2,0,0,2,0],mvp:true};
 assert.equal((await f.call('match',result)).status,409);await f.call('session-start',{id:'s',mid:'practice',mut:[1,0,0,0,0,0,0]});assert.equal((await f.call('match',result)).status,422);
 for(let i=0;i<18;i++){f.advance(10000);assert.equal((await f.call('session-tick',{id:'tick'+i,mid:'practice'})).status,200);}
 const r=await f.call('match',result);assert.equal(r.status,200);assert(r.result.xpGain>0);assert.equal(r.result.rank,null);assert.equal(r.profile.rk[0].p,0);
 const duplicate=await f.call('match',result);assert.equal(duplicate.profile.games,1);assert.deepEqual(duplicate.result,r.result);
});
test('a ranked match filled with bots counts for rank at your own MMR',async()=>{
 const f=await fixture({dlv:1});await f.call('load');const result={id:'pay-rk',mid:'botranked',score:[3,1],st:[300,3,0,0,4,0],mvp:true};
 await f.call('session-start',{id:'s-rk',mid:'botranked',mut:[1,0,0,0,0,0,0],rk:1,pl:2});
 for(let i=0;i<18;i++){f.advance(10000);assert.equal((await f.call('session-tick',{id:'tk'+i,mid:'botranked'})).status,200);}
 const r=await f.call('match',result);assert.equal(r.status,200);assert(r.result.rank);assert.equal(r.result.rank.pl,2);assert(r.result.rank.d>0);assert.equal(r.profile.rk[1].p,1);
});
test('online receipts give rank only once and use server-owned opponent ratings',async()=>{
 const f=await fixture({dlv:1});await f.call('load');await f.call('load',{},'b');const args={id:'result1',mid:'online1',room:'np-m-test',xp:999999,rank:4000};
 const r=await f.call('match',args);assert.equal(r.status,200);assert.equal(r.profile.rk[0].m,520);assert.equal(r.result.rank.d,20);
 assert.equal((await f.call('match',{...args,id:'different'})).status,409);assert.equal((await f.call('load')).profile.games,1);
});
test('trades require mirrored approvals and transfer both inventories atomically',async()=>{
 const f=await fixture({dlv:1,own:{body:[9,10]}});await f.call('load');await f.call('load',{},'b');
 const first=await f.call('trade',{id:'ta',trade:'pair1',other:'b',mine:[['body',9]],theirs:[['body',10]]});assert(first.waiting);
 assert((await f.call('load')).profile.own.body.includes(9));
 const second=await f.call('trade',{id:'tb',trade:'pair1',other:'a',mine:[['body',10]],theirs:[['body',9]]},'b');assert(second.traded);
 const a=await f.call('load'),b=await f.call('load',{},'b');assert(!a.profile.own.body.includes(9));assert(!b.profile.own.body.includes(10));
 const retry=await f.call('trade',{id:'ta',trade:'pair1',other:'b',mine:[['body',9]],theirs:[['body',10]]});assert(retry.traded);assert(!retry.profile.own.body.includes(9));
});
test('cancelled trades and unowned offers cannot grant items',async()=>{
 const f=await fixture({dlv:1});await f.call('load');await f.call('load',{},'b');const args={id:'ta',trade:'pair2',other:'b',mine:[],theirs:[['body',9]]};await f.call('trade',args);
 await f.call('trade-cancel',{id:'cancel',trade:'pair2',other:'b'});const r=await f.call('trade',{id:'tb',trade:'pair2',other:'a',mine:[['body',9]],theirs:[]},'b');assert.equal(r.status,409);assert.equal((await f.call('load')).profile.own.body.length,0);
});
test('gift claims verify Firebase recipient, ignore client amounts, and cannot be repeated',async()=>{
 const f=await fixture({dlv:1});await f.call('load');f.docs.set('gifts/g1',{to:'a',xp:500,claimed:false});f.docs.set('gifts/g2',{to:'b',xp:9000,claimed:false});
 const a=await f.call('gift',{id:'ga',gift:'g1',xp:1000000});assert.equal(a.status,200);assert.equal(a.profile.xp,500);
 const b=await f.call('gift',{id:'gb',gift:'g1'});assert.equal(b.profile.xp,500);assert.equal(b.claimed,false);assert.equal((await f.call('gift',{id:'gc',gift:'g2'})).status,409);
});
test('ranked departures count once and cannot later claim a winning reward',async()=>{
 const f=await fixture({dlv:1});await f.call('load');const req=()=>new Request('https://progress/forfeit',{method:'POST',body:JSON.stringify({uid:'a',room:'np-m-test',mid:'online1',playlist:1})});await f.ledger.fetch(req());await f.ledger.fetch(req());const p=await f.call('load');assert.equal(p.profile.rk[0].l,1);assert.equal(p.profile.rk[0].m,480);assert.equal((await f.call('match',{id:'later',mid:'online1',room:'np-m-test'})).status,409);
});
test('wire guards reject corrupt rotations, impossible velocities, malformed hits and score payloads',()=>{
 assert(validCar([0,1,0,0,0,0,1,46,0,0,0,0]));assert(!validCar([0,1,0,0,0,0,0,46,0,0,0,0]));assert(!validCar([0,1,0,0,0,0,1,10000,0,0,0,0]));assert(!validHit({n:1,p:[0,0,0],v:[Infinity,0,0]}));assert(!validGame({ph:'over',s:[99,-1]}));
});
test('ranked results need independent team acknowledgements, sane clock and stats',()=>{
 const r={room:'np-m-test',mid:'m',started:1000,ended:301000,roster:[{id:'a',uid:'ua',team:0},{id:'b',uid:'ub',team:1}],acks:['ua'],final:{s:[1,0],st:{a:[150,1,0,0,1,0]},mut:[0,0,0,0,0,0,0],rk:1,pl:1,mm:1,tl:0,ot:false}};
 assert.throws(()=>resultEvidence(r,'ua',302000),/Waiting/);r.acks.push('ub');assert(resultEvidence(r,'ua',302000).ranked);assert.throws(()=>resultEvidence(r,'outside',302000),/not in/);
 r.final.st.a[1]=20;assert.throws(()=>resultEvidence(r,'ua',302000),/statistics/);r.final.st.a[1]=1;r.ended=21000;assert.throws(()=>resultEvidence(r,'ua',22000),/clock/);
});

test('levels leaderboard merges saved levels with older accounts, rejects invalid levels and ignores forged client XP',async()=>{
 const f=await fixture({xp:8000,name:'Racer'});const p=await f.call('load');
 f.data.set('legacy-level-leaderboard',[{uid:'old',name:'Veteran',level:100},{uid:'a',name:'Outdated',level:100},{uid:'z',name:'Maxed',level:100},{uid:'bad',name:'Invalid',level:999}]);
 f.data.set('legacy-leaderboard',[{uid:'oldRank',name:'Old ranking',mmr:700}]);
 await f.call('save',{profile:{xp:1e9,level:100}});
 const r=await f.call('leaderboard',{field:'level',limit:25});assert.equal(r.status,200);assert.deepEqual(r.rows.map(x=>x.uid),['old','z','a']);assert.equal(r.rows.at(-1).level,p.profile.level);assert.equal(r.rows.at(-1).name,'Racer');assert.equal((await f.call('leaderboard',{field:'level',limit:1})).rows.length,1);
 assert.equal((await f.call('leaderboard',{field:'password',limit:25})).status,400);assert(f.data.has('legacy-leaderboard'));
 f.docs.set('gifts/levelGift',{to:'a',xp:500000,claimed:false});const gift=await f.call('gift',{id:'level-gift',gift:'levelGift'});const after=await f.call('leaderboard',{field:'level',limit:25});assert.equal(after.rows.find(x=>x.uid==='a').level,gift.profile.level);assert(gift.profile.level>p.profile.level);
});
test('Christmas Drops: one per quest during the event, any Christmas item, nothing before 1 December',()=>{
 const p={own:{},xp:0,ev:null};
 assert.equal(snowQuests(p,SNOW_START-1000,2),0);assert.equal(p.ev,null);
 p.ev={hd:1};assert.equal(openChristmasDrop(p,catalog,()=>0.5,SNOW_START-1000),null);assert.deepEqual(p.own,{});
 assert.equal(snowQuests(p,SNOW_START+1000,2),2);assert.equal(p.ev.hd,3);
 const names=new Set();let guard=0;p.ev.hd=100;
 while(p.ev.hd>0&&guard++<100){const g=openChristmasDrop(p,catalog,Math.random,SNOW_START+5000);if(g.xp){assert.equal(g.xp,2000);break;}names.add(g.kind+':'+g.name);assert(catalog[g.kind][g.i].ev);}
 const all=Object.entries(catalog).flatMap(([k,l])=>l.filter(x=>x.ev).map(x=>k+':'+x.name)).filter(x=>x!=='title:Holiday Hero');
 assert.equal(names.size,all.length);assert(!names.has('title:Holiday Hero'));
});
test('advent calendar: one door a day from 1 December, missed days can be opened later, each once',()=>{
 const p={own:{},xp:0,ev:null},day=d=>SNOW_START+(d-1)*864e5+3600e3;
 assert.equal(claimAdvent(p,catalog,SNOW_START-1000,1),null);
 assert.equal(claimAdvent(p,catalog,day(1),2),null);
 const d1=claimAdvent(p,catalog,day(1),1);assert.equal(d1.got[0].name,'Holly Sprig');assert(p.own.antenna.length===1);
 assert.equal(claimAdvent(p,catalog,day(1),1),null);
 const d3=claimAdvent(p,catalog,day(5),3);assert.equal(d3.got[0].xp,1500);assert.equal(p.xp,1500);
 assert.equal(claimAdvent(p,catalog,day(30),26),null);
 const d25=claimAdvent(p,catalog,day(25),25);assert.equal(d25.got[0].name,'Holiday Hero');assert.equal(d25.got[1].drops,3);
 assert.equal(ADVENT.length,25);
 for(const rewards of ADVENT)for(const [t,k,n] of rewards)if(t==='item')assert(catalog[k].findIndex(x=>x.name===n&&x.ev)>=0,n);
});
test('mixed ranked matches: a guest team confirms by place in the match, and is rated at the other team',()=>{
 const g={s:[3,1],st:{pa:[300,3,0,0,4,0],pg:[100,1,0,0,2,0]},mut:[0,0,0,0,0,0,0],rk:1,mm:1,pl:1,tl:0,ot:false};
 const r={room:'np-m-x',mid:'m1',final:g,started:0,ended:300000,roster:[{id:'pa',uid:'ua',team:0},{id:'pg',uid:null,team:1}],acks:['ua']};
 assert.throws(()=>resultEvidence(r,'ua',301000),/Waiting/);
 r.acks.push('g:pg');assert.equal(resultEvidence(r,'ua',301000).ranked,true);
 r.acks=['ua'];const late=resultEvidence(r,'ua',400000);assert.equal(late.ranked,false);assert.equal(late.won,true);
});
