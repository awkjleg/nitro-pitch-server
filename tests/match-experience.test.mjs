import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {html,read} from './served-game.mjs';
const source=await read('src/match-experience.txt');
function fixture(){
 const dom=new JSDOM(html),document=dom.window.document,sounds=[],bursts=[],popups=[],invites=[];let now=10;
 const peers=[{peer:'self',sameTab:true,presence:{j:1,tm:0}},{peer:'mate',presence:{j:2,tm:0,lp:'lobby-mate',nm:'Mate'}},{peer:'enemy',presence:{j:3,tm:1}}];
 const info={connected:true,disconnectedAt:0,reconnecting:{}};
 const c={document,$:id=>document.getElementById(id),Date,nowS:()=>now,clamp:(x,a,b)=>Math.max(a,Math.min(b,x)),sfx:{hit:x=>sounds.push(x)},fx:{burst:(...args)=>bursts.push(args)},TEAM_COL:[1,2],me:{team:0},NPPolish:{reduced:()=>false},settings:{quality:1},freePlay:false,popup:t=>popups.push(t),updateHud(){},mode:'online',game:{peers:()=>peers,connectionInfo:()=>info},cleanName:s=>s,myKey:()=> 'self',match:{mid:'m1',ph:'play',st:{self:[500,3,1,2,5]}},spec:null,myLevel:()=>2,MAXLV:100,COS_KINDS:['body'],listOf:()=>[{name:'Admin',lv:3,admin:true},{name:'Racer',lv:5},{name:'Later',lv:10}],lobbyPlayers:()=>[{peer:'lobby-mate'}],partyState:()=>({members:[{peer:'self'}],size:1}),partySent:new Map(),partyInvite:p=>invites.push(p),PARTY_MAX:6,isPartyLeader:()=>true,matchKind:()=> 'ranked',showPost(){document.getElementById('postAgain').querySelector('span').textContent='Queue again';}};
 vm.createContext(c);vm.runInContext(source+'\nglobalThis.api=NPMatchExperience;',c);return {c,document,sounds,bursts,popups,invites,info,advance:t=>now+=t};
}
test('match summary shows stats and eligible next unlock; Party Up invites only teammates',()=>{
 const f=fixture();f.c.showPost(0);assert.equal(f.document.querySelector('#np-match-summary').parentElement.className,'post');assert.deepEqual([...f.document.querySelectorAll('#np-match-summary b')].map(n=>n.textContent),['3','1','2','5']);assert.match(f.document.getElementById('np-next-unlock').textContent,/Racer.*5/);assert.equal(f.document.getElementById('postAgain').textContent,'Play Again');f.document.getElementById('np-post-party').click();assert.deepEqual(f.invites,['lobby-mate']);
 f.c.spec={};f.c.showPost(-1);assert(f.document.getElementById('np-match-summary').hidden);assert(f.document.getElementById('np-post-party').hidden);
});
test('training text-only button can transition back to a regular match result',()=>{
 const f=fixture();f.document.getElementById('postAgain').textContent='Play again';assert.doesNotThrow(()=>f.c.showPost(0));f.c.showPost(0);assert.equal(f.document.querySelectorAll('#np-match-summary').length,1);
});
test('feedback throttles contact spam and honors reduced motion while reflecting real stat changes',()=>{
 const f=fixture();f.c.api.hit({},10);f.c.api.hit({},45);assert.equal(f.sounds.length,1);assert.equal(f.bursts.length,1);f.advance(1);f.c.NPPolish.reduced=()=>true;f.c.api.hit({},45);assert.equal(f.bursts.length,1);assert(f.sounds[1]>f.sounds[0]);
 f.c.updateHud(.016,10);f.c.match.st.self[3]++;f.c.updateHud(.016,11);assert(f.popups.includes('SAVE!'));
 f.info.reconnecting.mate=Date.now()+5000;f.c.updateHud(.016,12);assert.match(f.document.querySelector('.np-connection').textContent,/Mate reconnecting/);f.c.mode='menu';f.c.updateHud(.016,13);assert(f.document.querySelector('.np-connection').hidden);
});
