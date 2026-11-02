import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {html,read} from './served-game.mjs';
const input=await read('src/touch-input.txt'),menus=await read('src/mobile-menus.txt'),phone=await read('src/phone-controls.txt');
function fixture(){
 const dom=new JSDOM(html),w=dom.window,d=w.document,$=id=>d.getElementById(id),actions=[];
 const c={document:d,window:w,$,innerWidth:390,innerHeight:844,touch:{},paused:false,ballCam:true,isTouch:true,screen:'home',training:null,freePlay:false,mode:'online',CHATS:['Nice shot!','Thanks!'],quickChat:i=>actions.push('chat:'+i),boardToggle:true,boardHeld:true,TUT:Array.from({length:8},()=>({d:()=> 'Keyboard directions'})),inMatchView:()=>true,addEventListener:w.addEventListener.bind(w),paintIcons(){},setTxt:(id,text)=>$(id).textContent=text,toggleBallCam(){c.ballCam=!c.ballCam},togglePause(){c.paused=!c.paused},updateHud(){},updatePauseButtons(){},renderTrainHud(){},goBack(){actions.push('back')},showScreen(s){c.screen=s;actions.push(s)},trainKey:k=>actions.push(k),freePlayBall:()=>actions.push('ball')};
 vm.createContext(c);vm.runInContext(input+'\n'+phone+'\n'+menus+'\nglobalThis.api=NPMobileMenus;globalThis.input=NPTouch;',c);
 $('touch').hidden=false;
 $('stick').getBoundingClientRect=()=>({left:16,top:200,width:112,height:112});
 const send=(id,type,pointerId,x=72,y=256)=>{const e=new w.Event(type,{cancelable:true});for(const [k,v]of Object.entries({pointerId,clientX:x,clientY:y}))Object.defineProperty(e,k,{value:v});$(id).dispatchEvent(e);return e;};
 const resize=(width,height)=>{c.innerWidth=width;c.innerHeight=height;w.dispatchEvent(new w.Event('resize'));};
 return{c,d,w,$,actions,send,resize};
}
test('scaled phone joystick reaches full throttle, keeps a radial deadzone and rejects a second steering finger',()=>{
 const f=fixture();f.send('stick','pointerdown',1,72,210);assert(f.c.touch.y<-.95);const held=f.c.touch.y;
 f.send('stick','pointerdown',2,120,256);f.send('stick','pointermove',2,120,256);assert.equal(f.c.touch.y,held);f.send('stick','pointerup',2);assert.equal(f.c.touch.y,held);
 f.send('stick','pointermove',1,74,257);assert.equal(f.c.touch.x,0);assert.equal(f.c.touch.y,0);f.send('stick','pointermove',1,120,208);assert(Math.abs(Math.hypot(f.c.touch.x,f.c.touch.y)-1)<1e-9);f.send('stick','lostpointercapture',1);assert.equal(f.c.touch.x,0);assert.equal(f.c.touch.y,0);
});
test('steering, boost and jump can be held together and each releases only its own finger',()=>{
 const f=fixture();f.send('stick','pointerdown',1,72,210);f.send('tBoost','pointerdown',2);f.send('tJump','pointerdown',3);assert(f.c.touch.boost&&f.c.touch.jump&&f.c.touch.y<0);
 f.send('tBoost','pointerup',3);assert(f.c.touch.boost);f.send('tJump','pointercancel',3);assert(!f.c.touch.jump&&f.c.touch.boost);f.send('tBoost','lostpointercapture',2);assert(!f.c.touch.boost);assert(f.c.touch.y<0);
});
test('rotation, blur, pause and visibility loss release momentary controls while preserving the selected camera',()=>{
 const f=fixture();for(const event of ['resize','blur']){f.send('tBoost','pointerdown',2);f.send('tJump','pointerdown',3);f.w.dispatchEvent(new f.w.Event(event));assert(!f.c.touch.boost&&!f.c.touch.jump);assert(f.$('tCam').classList.contains('on'));}
 f.send('tBoost','pointerdown',2);f.c.paused=true;f.c.updateHud(0,0);assert(!f.c.touch.boost);f.send('tJump','pointerdown',3);assert(!f.c.touch.jump);f.c.paused=false;f.c.updateHud(0,0);f.send('tBoost','pointerdown',2);f.d.dispatchEvent(new f.w.Event('visibilitychange'));assert(!f.c.touch.boost);assert(f.$('tCam').classList.contains('on'));
});
test('portrait and landscape phone layouts switch on rotation and leave desktop without a social overlay',()=>{
 const f=fixture();assert(f.d.documentElement.classList.contains('np-phone'));assert(!f.d.documentElement.classList.contains('np-landscape'));f.resize(844,390);assert(f.d.documentElement.classList.contains('np-landscape'));f.$('npSocialNav').click();assert(f.$('menu').classList.contains('np-social-open'));f.resize(1280,720);assert(!f.d.documentElement.classList.contains('np-phone'));assert(!f.$('menu').classList.contains('np-social-open'));assert(!f.$('party').hasAttribute('aria-modal'));assert.equal(f.$('npSocialNav').getAttribute('aria-expanded'),'false');
});
test('phone social drawer and quick actions close through Back and do not remain over another menu',()=>{
 const f=fixture();f.$('npQuickTools').click();assert(f.$('menu').classList.contains('np-tools-open'));f.c.goBack();assert(!f.$('menu').classList.contains('np-tools-open'));assert.deepEqual(f.actions,[]);
 f.$('npSocialNav').focus();f.$('npSocialNav').click();assert.equal(f.$('party').getAttribute('role'),'dialog');assert.equal(f.$('npSocialNav').getAttribute('aria-expanded'),'true');f.c.goBack();assert(!f.$('party').hasAttribute('role'));assert.equal(f.d.activeElement,f.$('npSocialNav'));
 f.$('npSocialNav').click();f.c.showScreen('garage');assert(!f.$('menu').classList.contains('np-social-open'));assert.deepEqual(f.actions,['garage']);
});
test('phone training pause actions retry and advance the real training functions without exposing next during a tutorial',()=>{
 const f=fixture(),buttons=f.d.querySelectorAll('.np-practice-buttons button');f.c.training={tut:0};f.c.paused=true;f.c.updatePauseButtons();assert(!buttons[0].parentElement.hidden);assert(buttons[1].hidden);buttons[0].click();assert.deepEqual(f.actions,['KeyR']);assert(!f.c.paused);
 f.c.training={tut:null};f.c.paused=true;f.c.updatePauseButtons();assert(!buttons[1].hidden);buttons[1].click();assert.deepEqual(f.actions,['KeyR','KeyN']);assert(!f.c.paused);f.c.training=null;f.c.updatePauseButtons();assert(buttons[0].parentElement.hidden);
});
test('phone scoreboard can be dismissed without a keyboard and tutorial uses touch directions only on touch devices',()=>{
 const f=fixture();f.$('board').hidden=false;f.d.querySelector('.np-board-close').click();assert(f.$('board').hidden);assert(!f.c.boardToggle&&!f.c.boardHeld);assert.match(f.c.TUT[0].d(),/left stick/);f.c.isTouch=false;assert.equal(f.c.TUT[0].d(),'Keyboard directions');
});

test('phone quick chat uses the existing message sender and closes when pausing',()=>{
 const f=fixture();f.c.updateHud(0,0);assert(!f.$('tChat').hidden);f.$('tChat').click();assert(!f.$('npTouchChat').hidden);f.$('npTouchChat').querySelectorAll('button')[1].click();assert.deepEqual(f.actions,['chat:0']);assert(f.$('npTouchChat').hidden);f.$('tChat').click();f.c.paused=true;f.c.updateHud(0,0);assert(f.$('npTouchChat').hidden);assert(f.$('tChat').hidden);
});
