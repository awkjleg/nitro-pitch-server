import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as THREE from 'three';
import {JSDOM} from 'jsdom';
import {html,read} from './served-game.mjs';
const source=await read('src/game-polish.txt');
function fixture(){
 const dom=new JSDOM(html),document=dom.window.document,$=id=>document.getElementById(id);
 dom.window.HTMLCanvasElement.prototype.getContext=()=>new Proxy({createLinearGradient:()=>({addColorStop(){}})},{get:(o,k)=>o[k]||(()=>{})});
 const themes=Array.from({length:8},(_,i)=>({name:'Arena '+i,bg:0x102030,horizon:0x405060,ramp:0x123456,stripes:['#123456'],night:true}));
 const item={name:'Test unlock',lv:2,rar:2};let saved=0;
 const ctx=vm.createContext({THREE,V3:THREE.Vector3,UP:new THREE.Vector3(0,1,0),scene:new THREE.Scene(),THEMES:themes,rampMat:new THREE.MeshBasicMaterial(),rng:()=>()=>.5,applyTheme(){},renderExhibition(){},renderPrivate(){},setTheme(){},$: $,document,Event:dom.window.Event,matchMedia:()=>({matches:false}),settings:{quality:1},perfLite:false,mode:'menu',screen:'home',match:{mid:'m1',mut:[0,0,0,0,0,0,0],ph:'play',s:[0,0]},training:null,snowOn:false,fx:{goal(){},step(){}},sfx:{ready(){},levelUp(){}},showPost(){},updateHud(){},lastResult:null,performance:{now:()=>0},cancelAnimationFrame(){},requestAnimationFrame(){},setTimeout(fn){fn();return 1},clearTimeout(){},showUnlockPop(){},unlockShownFor:'',dpGot:null,COS_KINDS:['body'],listOf:()=>[item],lockOf:()=>false,passReward:()=>[],rankOf:()=> 'Rookie',kindName:()=> 'Car',passTier:()=>1,PASS_TIERS:50,RARITIES:[['Common','#fff'],['Uncommon','#fff'],['Rare','#39f']],profile:{},gField:k=>k,applyProfileToMe(){},saveProfile(){saved++},lobbyPresence(){},renderMenuChrome(){},renderGarage(){},toast(){},itemThumb:()=>document.createElement('canvas'),dropThumb:()=>document.createElement('canvas'),sbtn:(text,cls,fn)=>{const b=document.createElement('button');b.innerHTML='<span></span>';b.firstChild.textContent=text;b.className=cls;b.onclick=fn;return b;}});
 vm.runInContext(source+'\nglobalThis.polish=NPPolish;',ctx);return {ctx,document,$,saved:()=>saved,dom};
}
test('arena picker changes selection and replaces disposed scenery without changing field geometry',()=>{
 const {ctx,$}=fixture();ctx.renderExhibition();assert.equal($('np-exArena').children.length,8);
 ctx.applyTheme(5);const first=ctx.scene.children.find(x=>x.name==='Nitro Pitch arena scenery');assert(first);let disposed=0;first.traverse(o=>o.geometry?.addEventListener('dispose',()=>disposed++));
 ctx.applyTheme(6);assert(disposed>0);assert(!ctx.scene.children.includes(first));ctx.applyTheme(7);assert.equal(ctx.scene.children.filter(x=>x.name==='Nitro Pitch arena scenery').length,1);ctx.applyTheme(0);assert.equal(ctx.scene.children.filter(x=>x.name==='Nitro Pitch arena scenery').length,0);
});
test('unlock reveal renders actual reward and equips it, while pending results hide saved badge',()=>{
 const f=fixture(),{ctx,$}=f;ctx.showUnlockPop({mid:'r1',before:{lv:1},after:{lv:2},drops:[],pass:{tiers:[]}});assert.equal($('unlockPop').hidden,false);const button=$('unlockPop').querySelector('li button');assert(button);button.click();assert.equal(ctx.profile.body,0);assert.equal(f.saved(),1);assert.equal(button.disabled,true);
 ctx.lastResult={mid:'m1',xpGain:200};ctx.showPost(0);assert.equal($('np-reward-saved').hidden,false);ctx.lastResult=null;ctx.showPost(0);assert.equal($('np-reward-saved').hidden,true);
});
test('goal shockwave expands, fades, and clears on a match transition',()=>{
 const {ctx}=fixture();ctx.mode='offline';ctx.fx.goal(0,new THREE.Vector3(0,3,100),0xffaa00);const blast=ctx.scene.children.find(x=>x.visible&&x.children.length===3);assert(blast);ctx.fx.step(.5);assert(blast.children[1].scale.x>15);assert(blast.children[1].material.opacity>0);ctx.match.mid='m2';ctx.fx.step(.01);assert.equal(blast.visible,false);
});
test('goal pushback reaches distant cars, pushes up and away, and remains bounded',()=>{
 const start=html.indexOf('const GOAL_BLAST_R ='),end=html.indexOf('// ---------- HUD',start);const ctx=vm.createContext({V3:THREE.Vector3,fx:{burst(){}}});vm.runInContext(html.slice(start,end),ctx);
 const car=()=>({p:new THREE.Vector3(0,1,50),v:new THREE.Vector3(),w:new THREE.Vector3(),ground:true});const c=car();assert(ctx.goalBlast(c,new THREE.Vector3(0,1,100))>0);assert(c.v.z<0&&c.v.y>0);assert.equal(c.ground,false);c.p.z=100;c.v.set(100,100,100);ctx.goalBlast(c,new THREE.Vector3(0,1,100));assert(c.v.length()<=90.001);const far=car();far.p.z=0;assert.equal(ctx.goalBlast(far,new THREE.Vector3(0,1,100)),0);
});
