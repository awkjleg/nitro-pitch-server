import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {catalog,Ranked,economy,levelInfo} from '../src/reward-rules.js';
import {cleanEv,snowQuests,openChristmasDrop,claimAdvent,SNOW_START,ADVENT} from '../src/snowdrift.js';
import {ApiError,reply} from '../src/firebase-auth.js';
import * as Paints from '../src/paints.js';
import {badName,safeName,filterText} from '../src/moderation.js';
import * as QuestDrops from '../src/quest-drops.js';
import {validCar,validGame,validHit,resultEvidence,MATCH_SECONDS} from '../src/room-guard.js';
import {readFileSync} from 'node:fs';
const source=(await readFile(new URL('../src/progress.js',import.meta.url),'utf8')).replace(/^import .*;$/gm,'').replaceAll('export ','');
async function fixture(raw={}){
 let now=1800000000000;const data=new Map(),docs=new Map([['players/a',raw],['players/b',raw]]);
 const clone=v=>v===undefined?undefined:structuredClone(v);
 const storage={get:async k=>clone(data.get(k)),put:async(k,v)=>data.set(k,clone(v)),list:async({prefix})=>new Map([...data].filter(([k])=>k.startsWith(prefix))),transaction:async fn=>{const snapshot=clone(data);try{return await fn(storage);}catch(e){data.clear();for(const[k,v]of snapshot)data.set(k,v);throw e;}}};
 const ctx={storage},env={ROOMS:{idFromName:x=>x,get:()=>({fetch:async()=>Response.json({mid:'online1',st:[200,1,0,0,1,0],score:[1,0],won:true,mvp:true,online:true,ranked:true,playlist:1,team:0,kind:'ranked',roster:[{uid:'a',team:0},{uid:'b',team:1}],elapsed:300})})}};
 const c=vm.createContext({MATCH_SECONDS,...Paints,...QuestDrops,badName,safeName,filterText,cleanEv,snowQuests,openChristmasDrop,claimAdvent,catalog,Ranked,economy,levelInfo,ApiError,reply,ADMIN_UID:'admin',crypto,URL,Response,Request,structuredClone,AbortSignal,console,Map,Set,Date:class extends Date{static now(){return now;}},DurableObject:class{constructor(ctx,env){this.ctx=ctx;this.env=env;}},firebaseDoc:async path=>clone(docs.get(path)||null)});
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
 assert.equal((await f.call('match',result)).status,409);await f.call('session-start',{id:'s',mid:'practice',mut:[0,0,0,0,0,0,0]});assert.equal((await f.call('match',result)).status,422);
 for(let i=0;i<18;i++){f.advance(10000);assert.equal((await f.call('session-tick',{id:'tick'+i,mid:'practice'})).status,200);}
 const r=await f.call('match',result);assert.equal(r.status,200);assert(r.result.xpGain>0);assert.equal(r.result.rank,null);assert.equal(r.profile.rk[0].p,0);
 const duplicate=await f.call('match',result);assert.equal(duplicate.profile.games,1);assert.deepEqual(duplicate.result,r.result);
});
test('a ranked match filled with bots counts for rank at your own MMR',async()=>{
 const f=await fixture({dlv:1});await f.call('load');const result={id:'pay-rk',mid:'botranked',score:[3,1],st:[300,3,0,0,4,0],mvp:true};
 await f.call('session-start',{id:'s-rk',mid:'botranked',mut:[0,0,0,0,0,0,0],rk:1,pl:2});   // the default 3-minute match
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

test('match lengths match the game: a 3-minute match counts, five ranked wins move the rank',async()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),m=html.match(/const LENGTHS = \[([^\]]+)\]/);
 assert.deepEqual(m[1].split(',').map(x=>x.trim()==='Infinity'?Infinity:Number(x)),MATCH_SECONDS);
 const f=await fixture({dlv:1});await f.call('load');let mmr=null;
 for(let g=0;g<5;g++){
  const mid='rk5-'+g;await f.call('session-start',{id:'s'+mid,mid,mut:[0,0,0,0,0,0,0],rk:1,pl:1});
  for(let i=0;i<17;i++){f.advance(10000);await f.call('session-tick',{id:'t'+mid+i,mid});}
  const r=await f.call('match',{id:'p'+mid,mid,score:[3,1],st:[300,2,0,0,3,0]});assert.equal(r.status,200,JSON.stringify(r));assert(r.result.rank.d>0);mmr=r.profile.rk[0].m;f.advance(25000);
 }
 assert(mmr>=590,'five wins from 500 should climb about 100 MMR, got '+mmr);
});
test('online: a normal 3-minute match passes the clock check',()=>{
 const r={room:'np-m-x',mid:'m',started:1000,ended:181000,roster:[{id:'a',uid:'ua',team:0},{id:'b',uid:'ub',team:1}],acks:['ua','ub'],final:{s:[2,1],st:{a:[150,1,0,0,1,0]},mut:[0,0,0,0,0,0,0],rk:1,pl:1,mm:1,tl:0,ot:false}};
 assert(resultEvidence(r,'ua',182000).ranked);
});
test('a bot-filled ranked match ended by the 5-goal mercy rule is saved (it used to be rejected as unfinished)',async()=>{
 const f=await fixture({dlv:1});await f.call('load');
 await f.call('session-start',{id:'s-mercy',mid:'mercy',mut:[0,0,0,0,0,0,0],rk:1,pl:1});
 for(let i=0;i<9;i++){f.advance(10000);await f.call('session-tick',{id:'tm'+i,mid:'mercy'});}
 const lost=await f.call('match',{id:'pay-mercy',mid:'mercy',score:[1,6],st:[150,1,0,0,2,0],mvp:false});
 assert.equal(lost.status,200);assert(lost.result.rank.d<0);assert.equal(lost.profile.games,1);assert.equal(lost.profile.goals,1);
 // too quick for that many goals, or no 5-goal lead: the full match length is still required
 f.advance(30000);await f.call('session-start',{id:'s-fast',mid:'fast',mut:[0,0,0,0,0,0,0],rk:1,pl:1});f.advance(15000);await f.call('session-tick',{id:'tf',mid:'fast'});f.advance(10000);
 assert.equal((await f.call('match',{id:'pay-fast',mid:'fast',score:[5,0],st:[500,5,0,0,5,0]})).status,422);
 f.advance(30000);await f.call('session-start',{id:'s-close',mid:'close',mut:[0,0,0,0,0,0,0],rk:1,pl:1});for(let i=0;i<9;i++){f.advance(10000);await f.call('session-tick',{id:'tc'+i,mid:'close'});}
 assert.equal((await f.call('match',{id:'pay-close',mid:'close',score:[4,0],st:[400,4,0,0,4,0]})).status,422);
});
test('painted cars are their own bodies; old painted cars move over; any body colour can be picked',async()=>{
 const tw=catalog.paintedBase+13*catalog.paintedBase+0;assert.equal(catalog.body[tw].name,'Titanium White Octane');
 // a 5.35/5.36 profile: painted as "body:0:14" with the white kept in paint
 const f=await fixture({dlv:1,pp:['body:0:14'],body:0,paint:0xf4f6f8});const a=await f.call('load');
 assert(a.profile.own.body.includes(tw));assert.equal(a.profile.body,tw);assert.equal(a.profile.paint,-1);assert.equal(a.profile.pp,undefined);
 let v=await f.call('save',{profile:{body:tw,paint:0x123456}});assert.equal(v.profile.body,tw);assert.equal(v.profile.paint,0x123456);   // any colour again
 v=await f.call('save',{profile:{body:tw+1}});assert.equal(v.profile.body,tw);                                                     // a painted car you don't own
 assert.equal((await f.call('shop')).status,400);                                                                                  // no shop
});
test('drops: about one in four opens as a painted car and never repeats one you own',async()=>{
 const f=await fixture({drops:Array(60).fill(3),dlv:1});let r=await f.call('load');let painted=0;
 for(let k=0;k<60;k++){r=await f.call('drop',{id:'d'+k,index:0,rev:r.rev});assert.equal(r.status,200);if(r.got.kind==='body'&&r.got.i>=catalog.paintedBase){painted++;assert(catalog.body[r.got.i].painted);assert(r.profile.own.body.includes(r.got.i));}}
 const own=r.profile.own.body;assert.equal(new Set(own).size,own.length);assert(painted>=4&&painted<=30,'painted '+painted);
});
test('admin MMR: only the admin can change it; it clamps and moves the peak once placed',async()=>{
 const f=await fixture({dlv:1,rk:[{m:600,p:8,w:5,l:3,pk:5}]});await f.call('load');await f.call('load',{},'admin');
 assert.equal((await f.call('admin-mmr',{id:'m0',uid:'a',pl:1,amount:100},'a')).status,403);
 let r=await f.call('admin-mmr',{id:'m1',uid:'a',pl:1,amount:300,note:'gg'},'admin');assert.equal(r.status,200);assert.equal(r.mmr,900);
 const a=await f.call('load');assert.equal(a.profile.rk[0].m,900);assert(a.profile.rk[0].pk>=Ranked.info(900).idx);assert.equal(a.profile.mmrGift.amount,300);
 r=await f.call('admin-mmr',{id:'m2',uid:'a',pl:1,amount:-4000},'admin');assert.equal(r.mmr,0);
 assert.equal((await f.call('admin-mmr',{id:'m3',uid:'a',pl:4,amount:10},'admin')).status,400);
});
test('moderation: ban reasons reach the banned player, admin names lock, offensive names are refused',async()=>{
 const f=await fixture({dlv:1,name:'Racer'});await f.call('load');await f.call('load',{},'admin');
 assert.equal((await f.call('admin-ban',{id:'b0',uid:'a',on:true,reason:'x'},'a')).status,403);
 assert.equal((await f.call('admin-ban',{id:'b1',uid:'a',on:true,reason:''},'admin')).status,400);
 assert.equal((await f.call('admin-ban',{id:'b2',uid:'a',on:true,reason:'Cheating in ranked'},'admin')).status,200);
 f.docs.set('bans/a',{name:'Racer'});const banned=await f.call('load');assert.equal(banned.status,403);assert.match(banned.error,/banned: Cheating in ranked/);
 f.docs.delete('bans/a');await f.call('admin-ban',{id:'b3',uid:'a',on:false},'admin');f.advance(61000);assert.equal((await f.call('load')).status,200);
 assert.equal((await f.call('admin-name',{id:'n0',uid:'a',name:'fuckface'},'admin')).status,400);
 const n=await f.call('admin-name',{id:'n1',uid:'a',name:'Cool Kid'},'admin');assert.equal(n.status,200);assert.equal(n.name,'Cool Kid');
 let v=await f.call('save',{profile:{name:'Other'}});assert.equal(v.profile.name,'Cool Kid');assert.equal(v.profile.nameLock,'Cool Kid');
 await f.call('admin-name',{id:'n2',uid:'a',name:null},'admin');v=await f.call('save',{profile:{name:'Sh1thead'}});assert.equal(v.profile.name,'Cool Kid');   // offensive: kept the old one
 v=await f.call('save',{profile:{name:'Classic Ace'}});assert.equal(v.profile.name,'Classic Ace');
});
test('admin-given items trade, but items your level would unlock anyway do not',async()=>{
 const f=await fixture({dlv:1,own:{body:[0,20]}});await f.call('load');await f.call('load',{},'b');
 await f.call('trade',{id:'tx',trade:'lv1',other:'b',mine:[['body',0]],theirs:[]});const no=await f.call('trade',{id:'ty',trade:'lv1',other:'a',mine:[],theirs:[['body',0]]},'b');assert.equal(no.status,409);assert((await f.call('load')).profile.own.body.includes(0));
 await f.call('trade',{id:'tg1',trade:'gift1',other:'b',mine:[['body',20]],theirs:[]});const ok=await f.call('trade',{id:'tg2',trade:'gift1',other:'a',mine:[],theirs:[['body',20]]},'b');assert(ok.traded);
 assert((await f.call('load',{},'b')).profile.own.body.includes(20));
});
test('the admin can see a player\'s items and take one away; nobody else can',async()=>{
 const f=await fixture({dlv:1,own:{body:[9,10]}});await f.call('load',{},'b');await f.call('load',{},'admin');
 assert.equal((await f.call('admin-take',{id:'x1',uid:'b',kind:'body',i:9})).status,403);
 const inv=await f.call('admin-inventory',{id:'i1',uid:'b'},'admin');assert.deepEqual(inv.own.body,[9,10]);
 const t=await f.call('admin-take',{id:'t1',uid:'b',kind:'body',i:9},'admin');assert(t.taken);
 assert.deepEqual((await f.call('load',{},'b')).profile.own.body,[10]);
 assert.equal((await f.call('admin-take',{id:'t2',uid:'b',kind:'body',i:9},'admin')).status,409);
});
test('private messages: delivered to the other account, filtered, counted unread until read, rate limited',async()=>{
 const f=await fixture({dlv:1});await f.call('load');await f.call('load',{},'b');
 assert.equal((await f.call('pm-send',{to:'zz',text:'hi'})).status,404);
 const s=await f.call('pm-send',{to:'b',text:'  good game  you shit  '});assert(s.ok);assert.equal(s.msg[1].includes('shit'),false);
 assert.equal((await f.call('pm-send',{to:'b',text:'again'})).status,429);
 const ib=await f.call('pm-inbox',{},'b');assert.equal(ib.unread,1);assert.equal(ib.peers[0].id,'a');
 const t=await f.call('pm-thread',{with:'a'},'b');assert.equal(t.msgs.length,1);assert.equal(t.msgs[0][0],'a');
 assert.equal((await f.call('pm-inbox',{},'b')).unread,0);assert.equal((await f.call('pm-inbox')).peers[0].unread,0);
});
