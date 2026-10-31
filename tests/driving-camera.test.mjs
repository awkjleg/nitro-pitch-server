import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
const root=new URL('../',import.meta.url),read=p=>readFile(new URL(p,root),'utf8');
const raw=await read('public/index.html'),drivingUpdates=await read('src/driving-updates.txt'),playerFeatures=await read('src/player-features.txt');
const shell=(await read('src/game-shell.js')).replace('import playerFeatures from "./player-features.txt";','').replace('import drivingUpdates from "./driving-updates.txt";','').replace('export function applyGameFixes','function applyGameFixes');
const patch=vm.createContext({drivingUpdates,playerFeatures});vm.runInContext(shell+'\nglobalThis.apply=applyGameFixes;',patch);const html=patch.apply(raw);
function fixture(){
 const camera=new THREE.PerspectiveCamera(60,16/9,0.1,1000);
 const ctx=vm.createContext({THREE,V3:THREE.Vector3,Q:THREE.Quaternion,Math,console,clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),CARS:[{h:[0.867,0.3866,1.2051],ho:[0,0.415,0.2776]}],me:{team:0,car:null},match:{mut:[0,1],ph:'play'},sfx:{jump(){},whoosh(){}},fx:{emit(){}},camera,mode:'offline',camBlend:0,rearView:false,ballCam:true,ballMesh:{visible:true},ball:{rp:new THREE.Vector3(0,2,20)},settings:{dist:280,height:100,angle:-3,stiff:0.5,fov:105,shake:false},innerWidth:1280,innerHeight:720,spec:null,dropOn:false,DVERT:[],showroomOn:()=>false,nowS:()=>1,paused:false,renderer:{},replay:{active:false}});
 const constants=raw.slice(raw.indexOf('const UU = 0.02;',raw.indexOf('// ---------- Rocket League units')),raw.indexOf('const CARS = CarLib.BODIES.map'));
 const surface=raw.slice(raw.indexOf('// ---------- surfaces: floor, ceiling, walls, corners'),raw.indexOf('// ---------- physics (Rocket League'));
 const physics=html.slice(html.indexOf('const lerpTable ='),html.indexOf('let bounceImpact ='));
 const cameraSource=raw.slice(raw.indexOf('// ---------- camera ----------'),raw.indexOf('// ---------- goal knockback'));
 vm.runInContext(constants+'\n'+surface+'\n'+physics+'\n'+cameraSource+'\n'+drivingUpdates+'\nglobalThis.gameTest={makeCar,resetCar,stepCar,arenaSDF,carContacts,NPDrive,camPos,camLook,camUp,camDir,camPrevC,W,L,H,RB,RIDE,BMAX,UP};',ctx);
 const f=ctx.gameTest;ctx.me.car=f.makeCar();f.resetCar(ctx.me.car,0,0,0);
 return{ctx,camera,...f,car:ctx.me.car};
}
const input={thr:1,steer:0,hb:false,boost:false,jh:false,pitch:0,roll:0};
const finite=v=>[v.x,v.y,v.z].every(Number.isFinite);
function sideCar(f){f.car.p.set(f.W-f.RIDE,12,0);f.car.n.set(-1,0,0);f.car.q.setFromUnitVectors(f.UP,f.car.n);f.car.rq.copy(f.car.q);f.car.rp.copy(f.car.p);f.car.ground=true;}

test('driving at speed follows the floor-to-wall curve with contact and speed intact',()=>{
 const f=fixture();f.car.p.set(f.W-f.RB-8,f.RIDE,0);f.car.q.setFromAxisAngle(f.UP,Math.PI/2);f.car.v.set(40,0,0);
 let wall=0;for(let i=0;i<100;i++){
  f.stepCar(f.car,{...input,boost:true},1/120,false);
  assert(finite(f.car.p)&&finite(f.car.v));
  if(f.car.n.x<-.95&&f.car.p.y<25){assert(f.car.ground);wall++;const up=new THREE.Vector3(0,1,0).applyQuaternion(f.car.q);assert(up.dot(f.car.n)>.995);assert(Math.abs(f.arenaSDF(f.car.p,new THREE.Vector3(),f.car.h[0])-f.RIDE)<.02);}
 }
 assert(wall>20);assert(f.car.p.y>10);assert(f.car.v.length()>30);
});
test('wall corners preserve wheel contact instead of throwing the car off',()=>{
 const f=fixture();sideCar(f);f.car.p.z=f.L-(f.W+f.L-8064*.02)-6;f.car.v.set(0,0,35);
 let corner=0;for(let i=0;i<65;i++){f.stepCar(f.car,input,1/120,false);assert(finite(f.car.p));if(f.car.n.x<-.4&&f.car.n.z<-.4){corner++;assert(f.car.ground);}}
 assert(corner>10);assert(f.car.v.length()>15);
});
test('wall jumps leave the surface and ceiling contact releases naturally',()=>{
 const f=fixture();sideCar(f);const normal=f.car.n.clone();f.car.v.set(0,0,20);f.stepCar(f.car,input,1/120,true);
 assert(!f.car.ground);assert(f.car.v.dot(normal)>4);assert(f.car.jumped);assert(!f.car.dodged);
 for(let i=0;i<4;i++)f.stepCar(f.car,input,1/120,false);assert(!f.car.ground);
 f.car.p.set(30,f.H-f.RIDE,0);f.car.n.set(0,-1,0);f.car.q.setFromUnitVectors(f.UP,f.car.n);f.car.ground=true;f.car.v.set(0,0,10);
 f.stepCar(f.car,input,1/120,false);assert(!f.car.ground);assert(f.car.v.y<0);
});
test('surface movement does not create an invisible wall across either goal mouth',()=>{
 for(const side of[-1,1]){const f=fixture();f.car.p.set(0,f.RIDE,side*(f.L-4));f.car.q.setFromAxisAngle(f.UP,side===1?0:Math.PI);f.car.v.set(0,0,side*20);
  for(let i=0;i<36;i++)f.stepCar(f.car,input,1/120,false);assert(side*f.car.p.z>f.L+1);assert(f.car.ground);}
});
test('curved wall movement is consistent at different simulation intervals',()=>{
 const run=dt=>{const f=fixture();f.car.p.set(f.W-f.RB-4,f.RIDE,0);f.car.q.setFromAxisAngle(f.UP,Math.PI/2);f.car.v.set(40,0,0);for(let t=0;t<.6-dt/2;t+=dt)f.stepCar(f.car,{...input,boost:true},dt,false);return f.car.p;};
 const a=run(1/120),b=run(1/60),c=run(1/240);assert(a.distanceTo(b)<.5);assert(a.distanceTo(c)<.5);
});
function projectedBall(f){f.camera.updateMatrixWorld();return f.ctx.ball.rp.clone().project(f.camera);}
test('ball cam keeps the ball framed after wall avoidance changes camera position',()=>{
 const f=fixture();sideCar(f);f.ctx.ball.rp.set(f.W-1.9,15,10);
 for(let i=0;i<180;i++)f.ctx.updateCamera(1/60,i/60);
 assert(f.arenaSDF(f.camera.position,new THREE.Vector3(),.8)>.75);const p=projectedBall(f);assert(Math.abs(p.x)<.85);assert(Math.abs(p.y)<.85);assert(p.z<1&&p.z>-1);
 assert(finite(f.camera.position)&&finite(f.camUp));
});
test('an overhead ball does not flip the orbit when its horizontal position jitters',()=>{
 const f=fixture();f.ctx.ball.rp.set(0,25,0);let previous=f.camDir.clone();
 for(let i=0;i<180;i++){f.ctx.ball.rp.x=i%2?.002:-.002;f.ctx.ball.rp.z=i%3?.003:-.003;f.ctx.updateCamera(1/60,i/60);assert(f.camDir.dot(previous)>.999);previous.copy(f.camDir);const p=projectedBall(f);assert(Math.abs(p.x)<.85&&Math.abs(p.y)<.85);}
});
test('camera aim is finite for opposite targets and screen up crosses a vertical look without a roll flip',()=>{
 const f=fixture();f.camPos.set(0,2,0);let v=f.NPDrive.aim(new THREE.Vector3(0,2,10),new THREE.Vector3(0,2,-10),f.UP,75,16/9);assert(finite(v));assert(Math.abs(v.length()-1)<1e-8);
 let previous=null;for(let i=0;i<101;i++){v=new THREE.Vector3(.05-i*.001,1,0).normalize();f.NPDrive.screenUp(v,f.UP,1/60,i===0);assert(finite(f.camUp));assert(Math.abs(f.camUp.dot(v))<1e-6);if(previous)assert(f.camUp.dot(previous)>.99);previous=f.camUp.clone();}
});
test('camera handles a ball passing close to it and fast car resets without NaNs',()=>{
 const f=fixture();f.ctx.ball.rp.set(0,2,-5.6);
 for(let i=0;i<80;i++){f.ctx.ball.rp.z+=.15;f.ctx.updateCamera(1/60,i/60);assert(finite(f.camera.position)&&finite(f.camLook));assert(f.camera.position.distanceTo(f.ctx.ball.rp)>f.ctx.gameTest.RIDE);}
 f.car.rp.set(-50,1,40);f.ctx.updateCamera(1/60,2);assert(f.camera.position.distanceTo(f.car.rp)<12);assert(finite(f.camLook));
});
test('guest practice bypasses account creation while online and banned-player gates remain',()=>{
 assert(html.includes('function startTutorial() {\n  if (isBanned) { loginGate(); return; }'));
 assert(html.includes('function startFreePlay(keepSearch) {\n  if (isBanned) { loginGate(); return; }'));
 assert(html.includes('function startSearch(kind, playlists, extraId) {\n  if (loginGate()) return false;'));
 assert(html.includes('function joinPrivate(name, pass) {\n  if (loginGate()) return;'));
});

test('new camera defaults apply to fresh players without resetting saved camera settings',()=>{
 const ctx=vm.createContext({});const start=html.indexOf('const ACTIONS ='),end=html.indexOf('let settings = DEFAULT_SETTINGS();',start);
 vm.runInContext(html.slice(start,end)+'\nglobalThis.defaults=DEFAULT_SETTINGS;globalThis.parse=parseSettings;',ctx);
 const fresh=ctx.defaults();assert.equal(fresh.fov,105);assert.equal(fresh.shake,false);
 const saved=ctx.parse({...fresh,fov:96,dist:310,height:130,stiff:.8,shake:true});assert.equal(saved.s.fov,96);assert.equal(saved.s.dist,310);assert.equal(saved.s.height,130);assert.equal(saved.s.shake,true);assert.equal(saved.upgraded,false);
});
test('the actual tutorial and free-play entry points accept guests but still reject banned accounts',()=>{
 const f=fixture(),ctx=f.ctx;let started=0,gates=0,hidden=0;
 Object.assign(ctx,{isBanned:false,loginGate(){gates++;return true;},startOfflineMatch(){started++;ctx.mode='offline';},exh:{arena:0},training:null,freePlay:false,search:null,toast(){},renderHelp(){},renderSearchBar(){},resetBallAt(){},setupTutStep(){},hideMenu(){hidden++;}});
 const tutorial=html.slice(html.indexOf('function startTutorial()'),html.indexOf('function setupTutStep()'));
 const free=html.slice(html.indexOf('function startFreePlay('),html.indexOf('// free play while you search'));
 vm.runInContext(tutorial+'\n'+free,ctx);ctx.startTutorial();assert.equal(started,1);assert.equal(gates,0);assert.equal(ctx.training.tut,0);assert.equal(hidden,1);
 ctx.startFreePlay();assert.equal(started,2);assert.equal(ctx.freePlay,true);assert.equal(gates,0);
 ctx.isBanned=true;ctx.startTutorial();ctx.startFreePlay();assert.equal(started,2);assert.equal(gates,2);
});


test('holding rear view works while ball cam is enabled and preserves the selected camera mode',()=>{
 const f=fixture();f.ctx.rearView=true;
 for(let i=0;i<100;i++)f.ctx.updateCamera(1/60,i/60);
 assert(f.camera.position.z>f.car.rp.z+2);assert.equal(f.ctx.ballCam,true);
 f.ctx.rearView=false;for(let i=0;i<120;i++)f.ctx.updateCamera(1/60,2+i/60);
 assert(f.camera.position.z<f.car.rp.z-2);assert.equal(f.ctx.ballCam,true);const p=projectedBall(f);assert(Math.abs(p.x)<.85&&Math.abs(p.y)<.85);
});
