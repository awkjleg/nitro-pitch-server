import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {html,read} from './served-game.mjs';
const source=await read('src/phone-controls.txt');
function fixture(){
 const dom=new JSDOM(html),w=dom.window,d=w.document;
 const c={document:d,$:id=>d.getElementById(id),touch:{},ballCam:true,paused:false,inMatchView:()=>true,updateHud(){},addEventListener:w.addEventListener.bind(w)};
 vm.createContext(c);vm.runInContext(source,c);d.getElementById('touch').hidden=false;
 const send=(type,id)=>{const event=new w.Event(type,{cancelable:true});Object.defineProperty(event,'pointerId',{value:id});d.getElementById('tRear').dispatchEvent(event);};
 return{c,d,w,send};
}
test('phone camera label tracks camera selection and rear view does not toggle it',()=>{
 const f=fixture();assert.equal(f.d.getElementById('tCam').getAttribute('aria-pressed'),'true');f.send('pointerdown',1);assert(f.c.touch.rear);assert(f.c.ballCam);f.send('pointerup',2);assert(f.c.touch.rear);f.send('pointerup',1);assert.equal(f.c.touch.rear,false);
 f.c.ballCam=false;f.c.updateHud(0,0);assert.equal(f.d.getElementById('tCam').textContent,'BALL CAM OFF');assert.equal(f.d.getElementById('tCam').getAttribute('aria-pressed'),'false');
});
test('cancelled touches, rotation, blur and pause always release look-back',()=>{
 const f=fixture();for(const event of ['pointercancel','lostpointercapture']){f.send('pointerdown',1);f.send(event,1);assert.equal(f.c.touch.rear,false);}
 for(const event of ['blur','resize']){f.send('pointerdown',1);f.w.dispatchEvent(new f.w.Event(event));assert.equal(f.c.touch.rear,false);}
 f.send('pointerdown',1);f.c.paused=true;f.c.updateHud(0,0);assert.equal(f.c.touch.rear,false);f.send('pointerdown',1);assert.equal(f.c.touch.rear,false);
});
