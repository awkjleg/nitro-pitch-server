// Nitro 2D gameplay (src/sideswipe.txt) in the real served game, in headless Chromium.
// Skips (with a note) where Playwright or Chromium is not installed. Set NP2D_SHOTS=<dir> to save screenshots.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {read} from './served-game.mjs';
import {serve,openGame,loadPlaywright} from './nitro2d-game-harness.mjs';

const source=await read('src/sideswipe.txt');
test('Nitro 2D gameplay keeps one player-facing name and no trademarked words',()=>{
 assert.match(source,/N2\.NAME = "Nitro 2D";/);
 assert.equal((source.match(/"Nitro 2D"/g)||[]).length,1);
 assert(!/sideswipe|rocket league/i.test(source.replace(/src\/sideswipe\.txt/g,'')));
 assert.match(source,/window\.NP2D = window\.NP2D \|\| \{\};/);
});

const pw=loadPlaywright();
let browser=null,srv=null,why='';
if(pw){try{browser=await pw.chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});srv=await serve();}catch(e){why=String(e.message||e).split('\n')[0];browser=null;}}
else why='playwright is not installed';
const opts={skip:browser?false:'browser unavailable: '+why,timeout:240000};
const SHOTS=process.env.NP2D_SHOTS||'';
if(SHOTS)await mkdir(SHOTS,{recursive:true});
async function shot(page,name){if(SHOTS)await page.screenshot({path:SHOTS.replace(/\/?$/,'/')+name+'.png'});}
test.after(async()=>{if(browser)await browser.close();if(srv)await srv.close();});

// one page for the whole file; each test starts its own match
let gamePromise=null;
const game=()=>gamePromise||(gamePromise=openGame(browser,srv.url,{viewport:{width:1280,height:720}}));
const start=(page,o)=>page.evaluate(o=>{const T=window.NP2D.test;T.hold(true);T.autopilot(null);T.idleBots=false;window.NP2D.startOffline(o);return T.snap();},o);
const run=(page,sec,draw=0)=>page.evaluate(([sec,draw])=>window.NP2D.test.run(sec,1/60,draw),[sec,draw]);
const onPlane=(s,eps=1e-6)=>{
 assert(Math.abs(s.ball.p[0])<eps&&Math.abs(s.ball.v[0])<eps,'ball off the plane '+s.ball.p);
 assert(Math.abs(s.ball.w[1])<eps&&Math.abs(s.ball.w[2])<eps,'ball spins off the plane');
 for(const c of [s.me,...s.bots]){
  assert(Math.abs(c.p[0])<eps&&Math.abs(c.v[0])<eps,'car off the plane '+c.p);
  assert(Math.abs(c.fwd[0])<1e-3||c.turning||c.rolling,'car turned out of the plane '+c.fwd);   // (a roof auto-flip rolls through)
 }
};

test('NP2D API and match setup: names, playlists, 2-minute clock, ranked flags for 1v1, 2v2 and 3v3',opts,async()=>{
 const {page,errors}=await game();
 const api=await page.evaluate(()=>({NAME:NP2D.NAME,MODE:NP2D.MODE,PL:NP2D.PL,on:NP2D.on()}));
 assert.deepEqual(api,{NAME:'Nitro 2D',MODE:6,PL:{duel:4,doubles:5,standard:6},on:false});
 let s=await start(page,{size:1});
 assert.equal(s.live,true);assert.equal(s.mut[6],6);assert.equal(s.mut[0],0);assert.equal(s.tl,120);assert.equal(s.md,1);assert.equal(s.rk,0);assert.equal(s.bots.length,1);
 s=await start(page,{size:2});
 assert.deepEqual([s.md,s.pl,s.rk,s.mm,s.mut[6],s.tl],[2,2,0,1,6,120]);assert.equal(s.bots.length,3);
 s=await start(page,{size:3});
 assert.deepEqual([s.md,s.mut[6]],[3,6]);assert.equal(s.bots.length,5);
 s=await start(page,{size:2,pl:0,df:2});
 assert.deepEqual([s.md,s.pl,s.rk,s.mm],[2,0,0,0]);
 // ranked: rk 1, mm 1, pl 4-6 (what the server counts for the 2D playlists); starting one needs an account
 const cfg=await page.evaluate(()=>[1,2,3].map(size=>NP2D.config({size,ranked:true,theme:2})));
 assert.deepEqual(cfg.map(c=>[c.md,c.pl,c.rk,c.mm,c.x,c.mut.join()]),[[1,4,1,1,-1,'0,0,0,0,2,0,6'],[2,5,1,1,-1,'0,0,0,0,2,0,6'],[3,6,1,1,-1,'0,0,0,0,2,0,6']]);
 assert.equal((await page.evaluate(()=>NP2D.config({pl:5,ranked:true}))).md,2);
 const real=errors.filter(e=>!/^Error: load\b/.test(e));   // (outside scripts the test server refuses)
 assert.equal(real.length,0,real.join('\n'));
});

test('kickoffs line everyone up on the plane facing the ball, and the camera watches from the side',opts,async()=>{
 const {page}=await game();
 for(const size of [1,2,3]){
  const s0=await start(page,{size});
  const s=await run(page,0.5,1);
  onPlane(s);
  for(const c of [s.me,...s.bots]){
   const toBall=Math.sign(-c.p[2]);
   assert.equal(Math.sign(c.fwd[2]),toBall,'faces the ball at kickoff');
   assert(Math.abs(c.p[2])>=15,'kickoff spot '+c.p[2]);
  }
  // nobody shares a spot with a teammate
  const zs=[s.me,...s.bots].map(c=>c.p[2].toFixed(1));assert.equal(new Set(zs).size,zs.length);
  // side-on: the camera looks along x, from -x for blue (blue attacks to the right of the screen)
  assert(Math.abs(s.cam.dir[0])>0.97,'camera direction '+s.cam.dir);
  assert.equal(Math.sign(s.cam.p[0]),s0.team===1?1:-1);
  await shot(page,'v2-kickoff-'+size+'v'+size);
 }
});

test('cars and ball stay on the plane through a full 2v2 bot match, and bots score',opts,async()=>{
 const {page}=await game();
 await start(page,{size:2,bm:900});
 await page.evaluate(()=>window.NP2D.test.autopilot(0.8));
 let goals=0,s;
 for(let i=0;i<150;i++){s=await run(page,1,i===40?1:0);onPlane(s);goals=s.s[0]+s.s[1];if(s.ph==='over')break;if(i===40)await shot(page,'v2-play-2v2');}
 assert(goals>=2,'goals scored '+goals);
});

test('a bot scores against an idle player within a minute',opts,async()=>{
 const {page}=await game();
 await start(page,{size:1,bm:700});
 let s;for(let i=0;i<60;i++){s=await run(page,1);if(s.s[1-s.team]>0)break;}
 assert(s.s[1-s.team]>0,'the bot did not score');
});

test('keyboard: W drives, S brakes and reverses or turns round from a stop, A/D do nothing, W/S spin in the air',opts,async()=>{
 const {page}=await game();
 await start(page,{size:1,team:0});
 await run(page,3.1);                                        // countdown
 const reset=()=>page.evaluate(()=>{const T=window.NP2D.test;T.idleBots=true;T._bots()[0].car.p.set(0,0.34,27);T.place(24,1.83);T.placeCar(-20,1,100);return T.run(0.3,1/60,0);});
 let s=await reset();
 const hold=async(keys,sec,draw=0)=>{for(const k of keys)await page.keyboard.down(k);const r=await run(page,sec,draw);for(const k of keys)await page.keyboard.up(k);return r;};
 s=await hold(['KeyD'],0.5);assert(Math.abs(s.me.v[2])<0.5,'D does nothing '+s.me.v[2]);
 s=await hold(['KeyA'],0.5);assert(Math.abs(s.me.v[2])<0.5,'A does nothing');
 s=await hold(['KeyW'],0.8);assert(s.me.v[2]>8,'W drives the way the car faces '+s.me.v[2]);assert(s.me.fwd[2]>0.99);
 const fast=s.me.v[2];
 await page.keyboard.down('KeyS');s=await run(page,0.2);assert(s.me.v[2]<fast-5,'S brakes');assert(s.me.fwd[2]>0.99,'no turn while braking');
 s=await run(page,1.2);await page.keyboard.up('KeyS');
 assert(s.me.v[2]<-2&&s.me.fwd[2]>0.99,'then reverses '+s.me.v[2]);onPlane(s);
 s=await reset();
 await page.keyboard.down('KeyS');s=await run(page,1/60);
 assert(s.me.fwd[2]<-0.99&&s.me.turning,'S from a stop turns the car round');
 s=await run(page,1);await page.keyboard.up('KeyS');
 assert(s.me.v[2]<-5,'and holding it drives off the other way '+s.me.v[2]);onPlane(s);
 const scr=await page.evaluate(()=>{window.NP2D.test.run(0.3,1/60,1);return window.NP2D.test.screen();});
 assert(Math.abs(scr.me[0])<0.95&&Math.abs(scr.me[1])<0.95,'your car stays on screen '+scr.me);
 await shot(page,'v2-turned');
 // air: hold W and the car keeps spinning nose-down, faster than a car can pitch in 3D
 s=await reset();
 s=await hold(['KeyJ'],0.12);assert(!s.me.ground);
 const a0=Math.atan2(s.me.fwd[1],s.me.fwd[2]);
 s=await hold(['KeyW'],0.4,1);
 let d=Math.atan2(s.me.fwd[1],s.me.fwd[2])-a0;while(d>0)d-=2*Math.PI;
 assert(d<-1.5,'spins nose-down '+d);onPlane(s);
 // a flip goes the way W/S points: W at the second jump is a front flip toward +z
 s=await reset();
 await hold(['KeyJ'],0.05);await run(page,0.05);const vz0=(await run(page,0)).me.v[2];
 await page.keyboard.down('KeyW');s=await hold(['KeyJ'],1/30);s=await run(page,0.2);await page.keyboard.up('KeyW');
 assert(s.me.v[2]-vz0>6,'front flip '+(s.me.v[2]-vz0));onPlane(s);
 // a double jump spins the car right round
 s=await reset();
 await hold(['KeyJ'],0.1);await run(page,0.08);s=await hold(['KeyJ'],1/30);
 assert(s.me.spinning,'double jump spin');
 s=await run(page,0.15,1);await shot(page,'v2-aerial-spin');
});

test('compact arena: goals score at the compact goal line, the wall above a goal bounces the ball back, cars stay inside',opts,async()=>{
 const {page}=await game();
 await start(page,{size:1,team:0});
 await run(page,3.1);
 const A=await page.evaluate(()=>NP2D.ARENA);
 assert(A.L<=40&&A.H<=20&&A.GH<A.H,'compact '+JSON.stringify(A));
 // high on the end wall: comes back
 let s=await page.evaluate(([L,H])=>{const T=window.NP2D.test;T.idleBots=true;T._bots()[0].car.p.set(0,0.34,-10);T.placeCar(-20,1);T.place(L-6,H-6,25,0);return T.run(0.6,1/60,0);},[A.L,A.H]);
 assert(s.ball.v[2]<0,'bounced off the wall above the goal');assert.deepEqual(s.s,[0,0]);
 // low into the goal: blue scores
 s=await page.evaluate(([L])=>{const T=window.NP2D.test;T.place(L-6,2,25,0);return T.run(0.8,1/60,0);},[A.L]);
 assert.equal(s.s[0],1,'goal '+s.s);assert.equal(s.ph,'goal');
 await shot(page,'v2-goal');
 s=await run(page,8);
 // a car driving flat out into its own end stays in the arena (in the goal at most)
 await page.evaluate(()=>{const T=window.NP2D.test;T.placeCar(-10,-1,100);});
 await page.keyboard.down('KeyW');await page.keyboard.down('KeyK');s=await run(page,2.5);await page.keyboard.up('KeyW');await page.keyboard.up('KeyK');
 assert(Math.abs(s.me.p[2])<=A.L+A.GD+0.5&&s.me.p[1]<=A.H+0.5,'inside '+s.me.p);onPlane(s);
});

test('online: host state keeps 2D (mode 6, playlists 4-6) on clients',opts,async()=>{
 const {page}=await game();
 await start(page,{size:2});
 const s=await page.evaluate(()=>window.NP2D.test.host({mut:[0,0,0,0,1,0,6],pl:6,md:3,rk:1,mm:1,ph:'play'}));
 assert.equal(s.mut[6],6);assert.equal(s.pl,6);assert.equal(s.md,3);assert.equal(s.live,true);
});

test('portrait phone: the side camera frames your car and the ball',opts,async()=>{
 const g=await openGame(browser,srv.url,{viewport:{width:390,height:844},context:{isMobile:true,hasTouch:true}});
 await start(g.page,{size:1});
 const s=await run(g.page,3.4,1);
 assert(Math.abs(s.cam.dir[0])>0.97);
 let scr=await g.page.evaluate(()=>window.NP2D.test.screen());
 assert(Math.abs(scr.me[0])<1&&Math.abs(scr.me[1])<1,'car on screen '+scr.me);
 // closer together, both are in the frame
 await g.page.evaluate(()=>window.NP2D.test.place(-11,6));await run(g.page,1.5,1);
 scr=await g.page.evaluate(()=>window.NP2D.test.screen());
 for(const p of [scr.me,scr.ball])assert(Math.abs(p[0])<1&&Math.abs(p[1])<1,'on screen '+p);
 const hidden=await g.page.evaluate(()=>['tCam','tRear','tDrift','tRollL','tRollR'].map(id=>getComputedStyle(document.getElementById(id)).display));
 assert.deepEqual(hidden,['none','none','none','none','none']);
 await shot(g.page,'v2-portrait');
 await g.context.close();
});

test('bot skill rises with 2D MMR along the shared curve (2D tiers map onto the 3D ones)',opts,async()=>{
 const {page}=await game();
 const r=await page.evaluate(()=>{const m=[0,150,275,400,550,700,825,1000,1100,1250,1375,1500,1650,1800];
  return {sk:m.map(x=>NP2D.botSkill(x)),bronze:NP2D.botSkill(0),legend:NP2D.botSkill(1650)};});
 for(let i=1;i<r.sk.length;i++)assert(r.sk[i]>r.sk[i-1]||(r.sk[i]===r.sk[i-1]&&i>=r.sk.length-2),'skill rises '+r.sk.join());
 assert(r.bronze<0.5&&r.legend>1.1,'Bronze '+r.bronze+' Legend '+r.legend);
 // the match uses it: bots matched to a high 2D MMR play at a higher skill than at a low one
 await start(page,{size:1,bm:100});await run(page,3.3);
 const lo=(await page.evaluate(()=>window.NP2D.test.snap())).bots[0].sk;
 await start(page,{size:1,bm:1600});await run(page,3.3);
 const hi=(await page.evaluate(()=>window.NP2D.test.snap())).bots[0].sk;
 assert(hi>lo+0.4,'bots '+lo+' -> '+hi);
});
