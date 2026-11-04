import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PAINTS} from '../src/paints.js';
import {html} from './served-game.mjs';
test('the game and the server agree on every paint colour; painted cars ship, the shop does not',async()=>{
 const src=await readFile(new URL('../src/paints.txt',import.meta.url),'utf8');
 const client=[...src.matchAll(/\{ name: "([^"]+)", hex: (0x[0-9a-f]{6}), tier: (\d) \}/g)].map(m=>[m[1],Number(m[2]),+m[3]]);
 assert.deepEqual(client,PAINTS.slice(1).map(p=>[p.name,p.hex,p.tier]));
 assert(html.includes('const NPPaints = (() => {'));
 assert(!html.includes('id="navShop"')&&!html.includes('id="shop"')&&!/admin-credits|shop-buy/.test(html));
 assert(Math.abs(PAINTS.slice(1).reduce((s,p)=>s+p.w,0)-100)<1e-9);
});
