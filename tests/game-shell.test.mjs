import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const raw=await readFile(new URL('public/index.html',root),'utf8');
const source=await readFile(new URL('src/game-shell.js',root),'utf8');
const patchContext=vm.createContext({});vm.runInContext(source.replace('export function applyGameFixes','function applyGameFixes')+'\nglobalThis.apply=applyGameFixes;',patchContext);
const html=patchContext.apply(raw);

test('game-shell changes match the actual bundled game and every inline script parses',()=>{
 assert(html.includes('src="/online-rooms.js"'));assert(html.includes('src="/game-notices.js"'));assert(/const BUILD = \d+;/.test(html));assert(!html.includes('const OPEN_WAIT = 8000, STATE_WAIT = 30000;'));
 for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(match[1]);
 assert(html.includes('if (adTab === "online" && !$("adminPop").hidden) renderAdmin();'));
 assert(html.includes('ball.floorFrame = false;'));
});
function fixture(overrides={}){
 const start=html.indexOf('function ballGrounded()'),end=html.indexOf('// ---------- replay recorder',start);
 const context=vm.createContext({viewer:false,training:null,mode:'offline',manageBots(){},snowOn:false,dropOn:false,hoopsOn:false,nowS:()=>1000,BR:2,PUCK_HH:1,L:100,UU:1,
 ball:{p:{y:10,z:0},floorFrame:false,floorT:999.9},lastTouch:{team:-1,name:''},match:{ph:'play',tl:0.01,kt:1,ot:false,s:[1,0],pt:0},...overrides});
 vm.runInContext(html.slice(start,end),context);return context;
}
test('a recent bounce does not end an airborne final play',()=>{
 const f=fixture();f.authorityMatch(0.02);assert.equal(f.match.tl,0);assert.equal(f.match.ph,'play');assert.equal(f.match.ot,false);
});
test('the final ground contact ends an unequal match even if the ball rebounds during the frame',()=>{
 const f=fixture();f.ball.floorFrame=true;f.authorityMatch(0.02);assert.equal(f.match.ph,'over');
});
test('a ground contact at zero starts overtime on a tie',()=>{
 const f=fixture();f.match.s=[1,1];f.ball.floorFrame=true;f.authorityMatch(0.02);assert.equal(f.match.ot,true);assert.equal(f.match.ph,'play');
});
test('a last-play goal is counted before the ground-contact check',()=>{
 const f=fixture();f.match.s=[0,1];f.ball.p.z=110;f.ball.floorFrame=true;f.authorityMatch(0.02);assert.equal(f.match.s[0],1);assert.equal(f.match.ph,'goal');assert.equal(f.match.ot,false);
});
test('a ball falling through a Dropshot hole is not mistaken for a floor touch',()=>{
 const f=fixture({dropOn:true});f.ball.p.y=0;f.authorityMatch(0.02);assert.equal(f.match.ph,'play');
 f.ball.p.y=-4;f.authorityMatch(0.02);assert.equal(f.match.ph,'goal');
});

test('served build, version endpoint, response header, and new active patch notes agree',async()=>{
 const version=(await readFile(new URL('public/version.txt',root),'utf8')).trim();
 assert.equal(html.match(/const BUILD = (\d+);/)[1],version);
 const worker=await readFile(new URL('src/worker.js',root),'utf8');assert(worker.includes('"X-Nitropitch-Build", "'+version+'"'));
 const notes=html.slice(html.indexOf('const PATCH_NOTES = '),html.indexOf('const PATCH_NOTES_53'));
 const context=vm.createContext({});vm.runInContext(notes+'\nglobalThis.notes=PATCH_NOTES;',context);
 assert.notEqual(context.notes.v,raw.match(/const PATCH_NOTES = \{ v: "([^"]+)"/)[1]);assert(context.notes.notes.length>0);assert(context.notes.title.includes(context.notes.v));
});

test('a newer build triggers the existing menu refresh popup and stays out of active matches',async()=>{
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true});return nodes.get(id);};
 node('matchFound').hidden=true;node('updPop').hidden=true;
 let checkCount=0;
 const version=(await readFile(new URL('public/version.txt',root),'utf8')).trim();
 const context=vm.createContext({BUILD:0,navByKey:false,mode:'menu',search:null,document:{hidden:false,addEventListener(){}},location:{protocol:'https:',reload(){}},inMatchView:()=>false,$:node,setInterval(){},Date,fetch:async()=>{checkCount++;return{ok:true,text:async()=>version};}});
 const start=html.indexOf('let updateReady = false;'),end=html.indexOf('// ---------- patch notes:',start);
 vm.runInContext(html.slice(start,end),context);
 await new Promise(resolve=>setImmediate(resolve));assert(checkCount>0);assert.equal(node('updPop').hidden,false);
 context.mode='online';context.showUpdateBar();assert.equal(node('updPop').hidden,true);
 context.mode='menu';context.showUpdateBar();assert.equal(node('updPop').hidden,false);
});
