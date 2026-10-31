import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../src/player-features.txt',import.meta.url),'utf8');
const coreSource=source.slice(0,source.indexOf('(function () {',20));
function core(){const context={window:{}};vm.runInNewContext(coreSource,context);return context.window.NPPlayerCore;}
test('history sanitizes persisted data, deduplicates matches and keeps the last twenty',()=>{
 const C=core(),row={id:'m',at:1,title:'Private 1v1',result:'Win',score:[3,2],rank:{before:500,after:520},team:['Me'],opponents:['Them']};
 assert.equal(C.history(null).length,0);assert.equal(C.history([{}]).length,0);
 let rows=[];for(let i=0;i<25;i++)rows=C.addHistory(rows,{...row,id:'m'+i});assert.equal(rows.length,20);assert.equal(rows[0].id,'m24');
 rows=C.addHistory(rows,{...row,id:'m24',score:[4,2]});assert.equal(rows.length,20);assert.equal(rows[0].score[0],4);assert.equal(rows[0].rank.after-rows[0].rank.before,20);
});
test('blocks prefer account identities and reject malformed stored entries',()=>{
 const C=core();assert.equal(C.identity({ui:'user',peer:'socket'}),'uid:user');assert.equal(C.identity({peer:'socket'}),'peer:socket');assert.equal(C.identity({peer:'<script>'}),'');
 assert.equal(C.blocks([{id:'uid:user',name:'Player'},{id:'bad',name:'Bad'}]).length,1);assert.equal(C.blocks(Array.from({length:120},()=>({id:'peer:p',name:'P'}))).length,100);
});
test('rematch consensus ignores spectators but requires the original roster and match',()=>{
 const C=core(),v={mid:'m',yes:true,roster:['a','b']},peers=[{peer:'a',presence:{j:1,tm:0,npRematch:v}},{peer:'b',presence:{j:2,tm:1,npRematch:v}},{peer:'spectator',presence:{j:3,tm:0,sp:true}}];
 assert(C.rematch('m',['a','b'],peers).ready);assert(!C.rematch('old',['a','b'],peers).ready);peers[1].presence.npRematch={...v,roster:{bad:true}};assert(!C.rematch('m',['a','b'],peers).ready);peers[1].presence.npRematch=v;assert(!C.rematch('m',['a','b','gone'],peers).complete);assert(!C.rematch('m',['a','b'],peers.slice(0,1)).complete);
});
