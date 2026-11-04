// Nitro 2D (side-view mode, match.mut[6] === 6) on the server: its own ranked playlists (4 = 2D Duel, 5 = 2D Doubles,
// 6 = 2D Standard) and ladder (Ranked2D, 3 placements), 2-minute matches, its own stats (p.s2) and leaderboards (board: '2d'), with XP, quests, pass and rank-tier rewards shared with 3D.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {catalog,Ranked,Ranked2D,economy,levelInfo} from '../src/reward-rules.js';
import {cleanEv,snowQuests,openChristmasDrop,claimAdvent} from '../src/snowdrift.js';
import {ApiError,reply} from '../src/firebase-auth.js';
import * as Paints from '../src/paints.js';
import {validGame,resultEvidence,rankedRules,playlistFits,is2D,MATCH_SECONDS,matchSeconds,PLAYLISTS} from '../src/room-guard.js';
const source=(await readFile(new URL('../src/progress.js',import.meta.url),'utf8')).replace(/^import .*;$/gm,'').replaceAll('export ','');
const MUT3=[0,0,0,0,0,0,0],MUT2=[0,0,0,0,0,0,6];

async function fixture(raw={}){
 let now=1800000000000,evidence=null;const data=new Map(),docs=new Map([['players/a',raw],['players/b',{}]]);
 const clone=v=>v===undefined?undefined:structuredClone(v);
 const storage={get:async k=>clone(data.get(k)),put:async(k,v)=>data.set(k,clone(v)),list:async({prefix})=>new Map([...data].filter(([k])=>k.startsWith(prefix)).sort(([a],[b])=>a<b?-1:1)),transaction:async fn=>{const snapshot=clone(data);try{return await fn(storage);}catch(e){data.clear();for(const[k,v]of snapshot)data.set(k,v);throw e;}}};
 const env={ROOMS:{idFromName:x=>x,get:()=>({fetch:async()=>evidence?Response.json(evidence):Response.json({error:'Match result is not ready'},{status:409})})}};
 const c=vm.createContext({...Paints,MATCH_SECONDS,matchSeconds,PLAYLISTS,playlistFits,is2D,cleanEv,snowQuests,openChristmasDrop,claimAdvent,catalog,Ranked,Ranked2D,economy,levelInfo,ApiError,reply,ADMIN_UID:'admin',crypto,URL,Response,Request,structuredClone,AbortSignal,console,Map,Set,Date:class extends Date{static now(){return now;}},DurableObject:class{constructor(ctx,env){this.ctx=ctx;this.env=env;}},firebaseDoc:async path=>clone(docs.get(path)||null)});
 vm.runInContext(source+'\nglobalThis.Progress=Progress;globalThis.cleanProfile=cleanProfile;',c);const ledger=new c.Progress({storage},env);
 const f={data,docs,ledger,clean:c.cleanProfile,advance:ms=>now+=ms,setEvidence:e=>{evidence=e;},
  async call(action,b={},uid='a'){const response=await ledger.fetch(new Request('https://progress/action',{method:'POST',body:JSON.stringify({body:{action,...b},user:{uid,username:uid},token:'test'})}));return {status:response.status,...await response.json()};},
  // a bot match registered with session-start and played for `secs` seconds (the full default 3D length unless given)
  async practice(mid,{mut,rk=0,pl=0,md,secs=180}={},score=[3,1]){
   await f.call('session-start',{id:'s-'+mid,mid,mut,rk,pl,...(md?{md}:{})});
   for(let i=0;i<secs/10;i++){f.advance(10000);assert.equal((await f.call('session-tick',{id:'t-'+mid+i,mid})).status,200);}
   const r=await f.call('match',{id:'m-'+mid,mid,score,st:[300,3,1,2,4,0],mvp:true});f.advance(25000);return r;
  }};
 return f;
}
const plain=v=>JSON.parse(JSON.stringify(v));
const rk=p=>p.rk.map(r=>[r.m,r.p,r.w,r.l]);
const stats=p=>[p.games,p.wins,p.goals,p.saves,p.mvps];
const s2=p=>[p.s2.games,p.s2.wins,p.s2.goals,p.s2.saves,p.s2.mvps];

test('a 3-entry profile upgrades to 6 rank entries with zeroed 2D stats (import and stored profiles)',async()=>{
 const f=await fixture();const p=plain(f.clean({rk:[{m:840,p:8,w:6,l:2,pk:10},[700,5,3,2,8],{m:600,p:1,w:1,l:0,pk:-1}],wins:7,cm:610}));
 assert.equal(p.rk.length,6);assert.deepEqual(p.rk.slice(0,3),[[840,8,6,2,10],[700,5,3,2,8],[600,1,1,0,-1]]);
 assert.deepEqual(p.rk[3],[500,0,0,0,-1]);assert.deepEqual(p.rk[4],[500,0,0,0,-1]);assert.deepEqual(p.rk[5],[500,0,0,0,-1]);assert.equal(p.wins,7);
 assert.deepEqual(plain(f.clean({rk:[0,1,2,3,4].map(i=>[600+i,i,0,0,-1])}).rk.map(r=>r[0])),[600,601,602,603,604,500],'a 5-entry profile gains 2D Standard');
 assert.deepEqual(p.s2,{games:0,wins:0,goals:0,saves:0,mvps:0});assert.equal(p.cm,610);assert.equal(p.cm2,500);
 assert.deepEqual(plain(f.clean({rk:[0,1,2,3,4].map(i=>[600+i,i,0,0,-1]),s2:{games:3,wins:2,goals:9,saves:1,mvps:1}}).s2),{games:3,wins:2,goals:9,saves:1,mvps:1});
 // a profile stored by the previous server version (3 entries, no s2) is upgraded on load
 const old=f.clean({rk:[[840,8,6,2,10]]});old.rk=old.rk.slice(0,3);delete old.s2;delete old.cm2;old.rev=4;f.data.set('p:a',old);
 const r=await f.call('load');assert.equal(r.status,200);assert.equal(r.profile.rk.length,6);assert.deepEqual(r.profile.rk[3],{m:500,p:0,w:0,l:0,pk:-1});assert.deepEqual(r.profile.rk[5],{m:500,p:0,w:0,l:0,pk:-1});
 assert.deepEqual(r.profile.s2,{games:0,wins:0,goals:0,saves:0,mvps:0});assert.equal(r.profile.rk[0].m,840);assert.equal(f.data.get('p:a').rk.length,6);
});

test('ranked rules: playlists 1-3 are 3D only, 4-6 are 2D only with the right team size',()=>{
 const g=(pl,mut,md)=>({rk:1,mm:1,pl,md,mut});
 for(const pl of [1,2,3])assert(rankedRules(g(pl,MUT3,pl),'np-m-x'));
 assert(rankedRules(g(4,MUT2,1),'np-m-x'));assert(rankedRules(g(5,MUT2,2),'np-m-x'));assert(rankedRules(g(6,MUT2,3),'np-m-x'),'2D Standard 3v3');
 assert(!rankedRules(g(6,MUT3,3),'np-m-x'));assert(!rankedRules(g(7,MUT2,3),'np-m-x'));assert(!rankedRules(g(6,MUT2,2),'np-m-x'),'2D Standard is 3v3');
 assert(!rankedRules(g(4,MUT3,1),'np-m-x'),'2D Duel needs a 2D match');assert(!rankedRules(g(1,MUT2,1),'np-m-x'),'3D Duel cannot be played in 2D');
 assert(!rankedRules(g(4,MUT2,2),'np-m-x'),'2D Duel is 1v1');assert(!rankedRules(g(5,MUT2,1),'np-m-x'),'2D Doubles is 2v2');assert(!rankedRules(g(5,MUT2,3),'np-m-x'));
 assert(!rankedRules(g(6,MUT2,1),'np-m-x'));assert(!rankedRules(g(4,[1,0,0,0,0,0,6],1),'np-m-x'),'other mutators stay default');
 assert(!rankedRules(g(4,MUT2,1),'np-p-x'),'private matches never count');
 assert(validGame({ph:'play',s:[0,0],b:[0,0,0,0,0,0,0,0,0],mut:MUT2,md:2,tl:100,pt:10,mid:'m',st:{}}),'mode slot 6 passes the wire guard');
});

test('online 2D ranked results are accepted and labelled 2D; casual 2D is not an Extra Mode',()=>{
 const rec=final=>({room:'np-m-x',mid:'m',started:1000,ended:181000,roster:[{id:'a',uid:'ua',team:0},{id:'b',uid:'ub',team:1}],acks:['ua','ub'],final:{s:[2,1],st:{a:[150,1,0,0,1,0]},tl:0,ot:false,...final}});
 const e=resultEvidence(rec({mut:MUT2,rk:1,mm:1,pl:4,md:1}),'ua',200000);
 assert.equal(e.ranked,true);assert.equal(e.playlist,4);assert.equal(e.d2,true);assert.equal(e.extra,false);assert.equal(e.kind,'ranked');
 const d=resultEvidence(rec({mut:MUT2,rk:1,mm:1,pl:5,md:2}),'ua',200000);assert.equal(d.ranked,true);assert.equal(d.playlist,5);
 assert.equal(resultEvidence(rec({mut:MUT3,rk:1,mm:1,pl:4,md:1}),'ua',200000).ranked,false);
 assert.equal(resultEvidence(rec({mut:MUT2,rk:1,mm:1,pl:1,md:1}),'ua',200000).ranked,false);
 const casual=resultEvidence(rec({mut:MUT2,rk:0,mm:1,pl:1,md:1,x:-1}),'ua',200000);assert.equal(casual.kind,'casual');assert.equal(casual.extra,false);assert.equal(casual.d2,true);
 const casualX=resultEvidence(rec({mut:MUT2,rk:0,mm:1,pl:1,md:1,x:2}),'ua',200000);assert.equal(casualX.kind,'casual');
 const threeD=resultEvidence(rec({mut:MUT3,rk:1,mm:1,pl:1,md:1}),'ua',200000);assert.equal(threeD.d2,false);assert.equal(threeD.ranked,true);
 const st=resultEvidence(rec({mut:MUT2,rk:1,mm:1,pl:6,md:3}),'ua',200000);assert.equal(st.ranked,true);assert.equal(st.playlist,6);
});

test('a 2D ranked bot match (pl 4, mut[6] 6) counts and only moves the 2D Duel rank and 2D stats',async()=>{
 const f=await fixture({dlv:1});await f.call('load');
 const r=await f.practice('d2duel',{mut:MUT2,rk:1,pl:4,md:1,secs:120});assert.equal(r.status,200,JSON.stringify(r));
 assert(r.result.rank);assert.equal(r.result.rank.pl,4);assert(r.result.rank.d>0);assert(r.result.xpGain>0);
 assert.deepEqual(rk(r.profile).map(x=>x[1]),[0,0,0,1,0,0]);assert.equal(r.profile.rk[3].w,1);assert(r.profile.rk[3].m>500);
 assert.deepEqual(s2(r.profile),[1,1,3,2,1]);assert.deepEqual(stats(r.profile),[0,0,0,0,0]);
 assert.equal(f.data.get('lb:a').wins,0);assert.equal(f.data.get('lb2:a').wins,1);assert.equal(f.data.get('lb2:a').goals,3);
 const d=await f.practice('d2doubles',{mut:MUT2,rk:1,pl:5,secs:120});assert.equal(d.result.rank.pl,5);assert.deepEqual(rk(d.profile).map(x=>x[1]),[0,0,0,1,1,0]);
 const t=await f.practice('d2standard',{mut:MUT2,rk:1,pl:6,md:3,secs:120});assert.equal(t.result.rank.pl,6);assert.deepEqual(rk(t.profile).map(x=>x[1]),[0,0,0,1,1,1]);
});

test('ranked bot matches in the wrong mode pay rewards but never rank',async()=>{
 const f=await fixture({dlv:1});await f.call('load');
 const a=await f.practice('wrong1',{mut:MUT3,rk:1,pl:4});assert.equal(a.status,200);assert.equal(a.result.rank,null,'pl 4 with mut[6] 0');assert(a.result.xpGain>0);
 assert.deepEqual(stats(a.profile),[1,1,3,2,1],'a 3D match counts as 3D');assert.deepEqual(s2(a.profile),[0,0,0,0,0]);
 const b=await f.practice('wrong2',{mut:MUT2,rk:1,pl:1});assert.equal(b.status,200);assert.equal(b.result.rank,null,'pl 1 with mut[6] 6');
 assert.deepEqual(s2(b.profile),[1,1,3,2,1]);assert.deepEqual(stats(b.profile),[1,1,3,2,1]);
 const c=await f.practice('wrong3',{mut:MUT2,rk:1,pl:5,md:1});assert.equal(c.result.rank,null,'2D Doubles reported as 1v1');
 assert.deepEqual(rk(c.profile).map(x=>x[1]),[0,0,0,0,0,0]);
 assert.equal(a.result.lines.some(l=>/Extra Mode/.test(l[0])),false);
});

test('a 3D match updates only 3D stats and leaves the 2D board alone',async()=>{
 const f=await fixture({dlv:1});await f.call('load');
 const r=await f.practice('three',{mut:MUT3,rk:1,pl:1});assert.equal(r.result.rank.pl,1);
 assert.deepEqual(rk(r.profile).map(x=>x[1]),[1,0,0,0,0,0]);assert.deepEqual(stats(r.profile),[1,1,3,2,1]);assert.deepEqual(s2(r.profile),[0,0,0,0,0]);
 assert.equal(f.data.get('lb:a').wins,1);assert.equal(f.data.has('lb2:a'),false);
});

test('online 2D ranked receipts move the 2D rank at server-owned 2D ratings, once',async()=>{
 const f=await fixture({dlv:1,rk:[[900,10,5,5,-1]]});await f.call('load');await f.call('load',{},'b');
 const record={room:'np-m-twod',mid:'online2d',started:1000,ended:181000,roster:[{id:'pa',uid:'a',team:0},{id:'pb',uid:'b',team:1}],acks:['a','b'],final:{s:[2,1],st:{pa:[250,2,0,1,3,0],pb:[100,1,0,0,1,0]},mut:MUT2,rk:1,mm:1,pl:4,md:1,tl:0,ot:false}};
 f.setEvidence(resultEvidence(record,'a',200000));
 const r=await f.call('match',{id:'claim2d',mid:'online2d',room:'np-m-twod'});assert.equal(r.status,200,JSON.stringify(r));
 assert.equal(r.result.rank.pl,4);assert.equal(r.result.rank.d,20,'placement K at equal 2D ratings (500 v 500), not the 3D 900');
 assert.equal(r.profile.rk[3].m,520);assert.equal(r.profile.rk[0].m,900);assert.deepEqual(s2(r.profile),[1,1,2,1,1]);assert.equal(r.profile.games,0);
 assert.equal((await f.call('match',{id:'claim2d-again',mid:'online2d',room:'np-m-twod'})).status,409);
 // a 2D casual online match moves the 2D hidden casual MMR, not the 3D one
 f.setEvidence(resultEvidence({...record,mid:'casual2d',final:{...record.final,rk:0,x:-1}},'a',200000));
 const c=await f.call('match',{id:'claim-c2d',mid:'casual2d',room:'np-m-twod'});assert.equal(c.status,200);assert.equal(c.result.rank,null);
 assert(c.profile.cm2>500);assert.equal(c.profile.cm,500);assert.equal(c.profile.s2.games,2);
});

test('2D ranked departures forfeit the 2D playlist, also for an old stored profile',async()=>{
 const f=await fixture({dlv:1});await f.call('load');const p=f.data.get('p:a');p.rk=p.rk.slice(0,3);delete p.s2;f.data.set('p:a',p);
 const res=await f.ledger.fetch(new Request('https://progress/forfeit',{method:'POST',body:JSON.stringify({uid:'a',room:'np-m-test',mid:'gone',playlist:5})}));assert.equal(res.status,200);
 const res6=await f.ledger.fetch(new Request('https://progress/forfeit',{method:'POST',body:JSON.stringify({uid:'a',room:'np-m-test',mid:'gone6',playlist:6})}));assert.equal(res6.status,200);
 const r=await f.call('load');assert.equal(r.profile.rk[4].l,1);assert.equal(r.profile.rk[4].m,480);assert.equal(r.profile.rk[5].l,1);assert.equal(r.profile.rk[0].p,0);assert(f.data.has('lb2:a'));
 assert.equal((await f.ledger.fetch(new Request('https://progress/forfeit',{method:'POST',body:JSON.stringify({uid:'a',room:'np-m-test',mid:'bad',playlist:7})}))).status,400);
});

test('leaderboards: the 3D board ignores 2D ranks and stats; board "2d" lists 2D rows',async()=>{
 const f=await fixture({dlv:1,name:'Ace',rk:[[700,10,6,4,-1],[500,0,0,0,-1],[500,0,0,0,-1],[1500,12,10,2,-1],[1620,2,2,0,-1],[1580,3,2,1,-1]],wins:4,goals:9,s2:{games:12,wins:10,goals:30,saves:5,mvps:4}});
 f.data.set('legacy-leaderboard',[{uid:'old',name:'Old 3D',mmr:800,wins:50,goals:60}]);await f.call('load');await f.call('load',{},'b');
 const three=await f.call('leaderboard',{field:'mmr',limit:25});assert.equal(three.status,200);
 const a3=three.rows.find(x=>x.uid==='a');assert.equal(a3.mmr,700);assert.equal(a3.rank,Ranked.info(700).idx);assert.equal(a3.wins,4);assert.equal(a3.goals,9);
 assert.deepEqual(Object.keys(a3).sort(),['bn','clanId','goals','level','mmr','name','rank','ti','uid','wins'],'3D rows keep their shape');
 assert.deepEqual((await f.call('leaderboard',{field:'mmr',board:'3d',limit:25})).rows,three.rows);
 const two=await f.call('leaderboard',{field:'mmr',board:'2d',limit:25});assert.equal(two.status,200);
 assert.deepEqual(two.rows.map(x=>x.uid),['a'],'only accounts that played 2D, and no 3D legacy rows');
 assert.equal(two.rows[0].mmr,1580,'best placed of rk[3..5]: 3 games place a 2D playlist, 2 do not');assert.equal(two.rows[0].rank,Ranked2D.info(1580).idx);assert.equal(two.rows[0].rank,28);assert.equal(two.rows[0].wins,10);assert.equal(two.rows[0].goals,30);assert.equal(two.rows[0].name,'Ace');
 assert.equal((await f.call('leaderboard',{field:'wins',board:'2d',limit:25})).rows[0].wins,10);
 assert.equal((await f.call('leaderboard-get',{uid:'a',board:'2d'})).row.mmr,1580);assert.equal((await f.call('leaderboard-get',{uid:'a'})).row.mmr,700);
 assert.equal((await f.call('leaderboard-get',{uid:'b',board:'2d'})).row,null);
 assert.equal((await f.call('leaderboard',{field:'mmr',board:'4d',limit:25})).status,400);
 // a name change updates both boards
 await f.call('save',{profile:{name:'Ace2'}});assert.equal(f.data.get('lb2:a').name,'Ace2');assert.equal(f.data.get('lb:a').name,'Ace2');
});

test('shared progression: a 2D rank sets the XP multiplier and rank-tier drops',async()=>{
 const f=await fixture({dlv:1,rk:[[1500,4,4,0,-1],[500,0,0,0,-1],[500,0,0,0,-1],[1000,3,3,0,-1]]});await f.call('load');
 const r=await f.practice('bonus',{mut:MUT3});assert.equal(r.result.rank,null);
 assert(r.result.lines.some(l=>l[0]==='Rank bonus ×'+Ranked.xpMult(Ranked2D.info(1000).tier)&&Ranked2D.info(1000).tierName==='Platinum'),JSON.stringify(r.result.lines));
 const g=await fixture({dlv:1,rk:[[500,0,0,0,-1],[500,0,0,0,-1],[500,0,0,0,-1],[500,2,2,0,-1]]});await g.call('load');
 const placed=await g.practice('place',{mut:MUT2,rk:1,pl:4,secs:120});assert.equal(placed.result.rank.placedNow,true,'the third 2D match places');assert.equal(placed.profile.rk[3].p,3);
 assert(placed.result.rank.newTiers.length>0);assert(placed.profile.rt>=0);assert(placed.profile.drops.length>0,'rank-up drop from a 2D placement');
});

test('Nitro 2D ladder: 6 tiers x 5 ranks of 55 MMR, then Legend from 1650',()=>{
 assert.equal(Ranked2D.MINS.length,31);assert.equal(Ranked2D.RANKS.length,31);assert.deepEqual(Ranked2D.MINS.slice(0,3),[0,55,110]);assert.equal(Ranked2D.MINS[29],1595);assert.equal(Ranked2D.MINS[30],1650);
 const at=m=>{const i=Ranked2D.info(m);return [i.idx,i.name,i.tier,i.tierName,i.lvl,i.div];};
 assert.deepEqual(at(0),[0,'Bronze I',0,'Bronze',1,0]);assert.deepEqual(at(54),[0,'Bronze I',0,'Bronze',1,0]);
 assert.deepEqual(at(55),[1,'Bronze II',0,'Bronze',2,0]);assert.deepEqual(at(274),[4,'Bronze V',0,'Bronze',5,0]);assert.deepEqual(at(275),[5,'Silver I',1,'Silver',1,0]);
 assert.deepEqual(at(1594),[28,'Champion IV',5,'Champion',4,0]);assert.deepEqual(at(1595),[29,'Champion V',5,'Champion',5,0]);
 assert.deepEqual(at(1649),[29,'Champion V',5,'Champion',5,0]);assert.deepEqual(at(1650),[30,'Legend',6,'Legend',0,0]);assert.deepEqual(at(4000),[30,'Legend',6,'Legend',0,0]);
 assert.equal(Ranked2D.info(1595).min,1595);assert.equal(Ranked2D.info(1595).max,1649);assert.equal(Ranked2D.info(1622).frac,27/55);
 assert.equal(Ranked2D.info(1650).frac,0);assert.equal(Ranked2D.info(1750).frac,.5);assert.equal(Ranked2D.info(1900).frac,1);assert.equal(Ranked2D.info(1650).max,1850);
 assert.equal(Ranked2D.info(500).name,'Silver V');assert.equal(Ranked2D.START,500);assert.equal(Ranked2D.PLACEMENTS,3);assert.equal(Ranked.PLACEMENTS,5);assert.equal(Ranked2D.xpMult,Ranked.xpMult);
 // K 40 during the 3 placement matches, then 20 (3D keeps K 40 for 5)
 assert.equal(Ranked2D.delta(500,500,true,2),20);assert.equal(Ranked2D.delta(500,500,true,3),10);assert.equal(Ranked.delta(500,500,true,3),20);
 assert.equal(Ranked2D.delta(500,500,false,0),-20);assert.equal(Ranked2D.delta(500,500,false,9),-10);assert.equal(Ranked2D.delta(800,600,true,9),Ranked.delta(800,600,true,9));
 assert.deepEqual([-1,0,1,2,3,4,5,6].map(Ranked2D.sharedTier),[-1,0,1,2,3,4,5,6]);assert.equal(Ranked2D.TIERS[-1].name,'Unranked');
 assert.deepEqual(Ranked2D.TIERS.map(t=>t.name),['Bronze','Silver','Gold','Platinum','Diamond','Champion','Legend']);
});

test('2D results report 2D rank names and peaks; 3D results keep the 3D ladder',async()=>{
 const f=await fixture({dlv:1,rk:[[500,0,0,0,-1],[500,0,0,0,-1],[500,0,0,0,-1],[1647,10,8,2,28]]});await f.call('load');
 const r=await f.practice('legend',{mut:MUT2,rk:1,pl:4,secs:120});assert.equal(r.result.rank.ladder,'2d');
 assert.equal(r.result.rank.before.info.name,'Champion V');assert.equal(r.result.rank.after.info.name,'Legend');assert.equal(r.result.rank.after.info.idx,30);
 assert.equal(r.profile.rk[3].pk,30,'peak idx on the 2D ladder');assert.equal(r.profile.rt,6,'Legend counts as shared tier 6');assert.deepEqual(plain(r.result.rank.newTiers),[0,1,2,3,4,5,6]);
 const t=await f.practice('three-names',{mut:MUT3,rk:1,pl:1});assert.equal(t.result.rank.ladder,'3d');assert.equal(t.result.rank.before.info.name,Ranked.info(500).name);
 assert.equal(plain(f.clean({rk:[0,1,2,3,4].map(()=>[500,5,0,0,99])}).rk.map(r=>r[4])).join(),'21,21,21,30,30,-1');
});

test('Nitro 2D matches are 2 minutes; 3D keeps 3 minutes (practice sessions and online evidence)',async()=>{
 assert.equal(matchSeconds(MUT2),120);assert.equal(matchSeconds([1,0,0,0,0,0,6]),120);assert.equal(matchSeconds(MUT3),180);assert.equal(matchSeconds([1,0,0,0,0,0,0]),300);
 const f=await fixture({dlv:1});await f.call('load');
 const two=await f.practice('two-min',{mut:MUT2,secs:120});assert.equal(two.status,200,JSON.stringify(two));assert.equal(two.profile.s2.games,1);
 const three=await f.practice('three-short',{mut:MUT3,secs:120});assert.equal(three.status,422,'a 3D match is 3 minutes');
 const three2=await f.practice('three-full',{mut:MUT3,secs:180});assert.equal(three2.status,200);
 const short2=await f.practice('two-short',{mut:MUT2,secs:90});assert.equal(short2.status,422,'a 2D match still has to be finished');
 const rec=(final,secs)=>({room:'np-m-x',mid:'m',started:1000,ended:1000+secs*1000,roster:[{id:'a',uid:'ua',team:0},{id:'b',uid:'ub',team:1}],acks:['ua','ub'],final:{s:[2,1],st:{a:[150,1,0,0,1,0]},tl:0,ot:false,...final}});
 const e=resultEvidence(rec({mut:MUT2,rk:1,mm:1,pl:4,md:1},120),'ua',200000);assert.equal(e.ranked,true);assert.equal(e.d2,true);
 assert.throws(()=>resultEvidence(rec({mut:MUT2,rk:1,mm:1,pl:4,md:1},90),'ua',200000),/clock/);
 assert.throws(()=>resultEvidence(rec({mut:MUT3,rk:1,mm:1,pl:1,md:1},120),'ua',200000),/clock/);
 assert.equal(resultEvidence(rec({mut:MUT3,rk:1,mm:1,pl:1,md:1},180),'ua',200000).ranked,true);
});
