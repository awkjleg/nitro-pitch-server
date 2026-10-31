import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {read} from './served-game.mjs';
const src=(await read('src/firebase-auth.js')).replaceAll('export ','');
function fixture(){let calls=0;const ctx=vm.createContext({crypto:webcrypto,TextEncoder,TextDecoder,atob,Response,AbortSignal,Date,Uint8Array,fetch:async()=>{calls++;return Response.json({users:[{localId:'player1',displayName:'Player'}]});}});vm.runInContext(src,ctx);return {ctx,calls:()=>calls};}
const token=(override={})=>'header.'+Buffer.from(JSON.stringify({aud:'nitro-pitch',iss:'https://securetoken.google.com/nitro-pitch',sub:'player1',exp:Date.now()/1000+3600,...override})).toString('base64url')+'.signature';
test('Firebase verification binds account identity to this project and caches only verified tokens',async()=>{const {ctx,calls}=fixture(),t=token();assert.equal((await ctx.identify(t)).uid,'player1');await ctx.identify(t);assert.equal(calls(),1);await assert.rejects(ctx.identify(token({aud:'other-project'})),/Invalid/);await assert.rejects(ctx.identify(token({sub:'other-player'})),/Invalid/);await assert.rejects(ctx.identify(token({exp:1})),/Invalid/);await assert.rejects(ctx.identify('invalid'),/sign in/);});
test('progress JSON parser rejects oversized, malformed and incorrect content types',async()=>{const {ctx}=fixture();await assert.rejects(ctx.readJson(new Request('https://test',{method:'POST',body:'{}'})),/JSON required/);await assert.rejects(ctx.readJson(new Request('https://test',{method:'POST',headers:{'Content-Type':'application/json'},body:'{bad'})),/Invalid JSON/);await assert.rejects(ctx.readJson(new Request('https://test',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(100)}),50),/too large/);});
