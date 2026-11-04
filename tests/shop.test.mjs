import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PAINTS,shopListing} from '../src/shop.js';
import {catalog} from '../src/reward-rules.js';
import {html} from './served-game.mjs';
test('the game and the server agree on every paint colour, and the shop is in the served game',async()=>{
 const src=await readFile(new URL('../src/shop.txt',import.meta.url),'utf8');
 const client=[...src.matchAll(/\{ name: "([^"]+)", hex: (0x[0-9a-f]{6}), tier: (\d) \}/g)].map(m=>[m[1],Number(m[2]),+m[3]]);
 assert.deepEqual(client,PAINTS.slice(1).map(p=>[p.name,p.hex,p.tier]));
 assert(html.includes('const NPShop = (() => {'));
 const total=PAINTS.slice(1).reduce((s,p)=>s+p.w,0);assert(Math.abs(total-100)<1e-9);
});
test('every day has two featured and six daily items, Titanium White Octane first',()=>{
 for(let day=20000;day<20040;day++){const L=shopListing(catalog,day);assert.equal(L.featured[0].name,'Titanium White Octane');assert.equal(L.featured.length,2);assert.equal(L.daily.length,6);
  const keys=[...L.featured,...L.daily].map(s=>s.kind+':'+s.i+':'+s.paint);assert.equal(new Set(keys).size,keys.length);}
});
