import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {encryptPayload,vapidHeader,sendPush,cleanSubscription,PushHub,PUSH,BIG_UPDATE_TITLE,b64u,unb64u} from '../src/push.js';
import {ApiError,reply} from '../src/firebase-auth.js';
import {MessageHub} from '../src/messages.js';
import {root,html,release} from './served-game.mjs';
const te=new TextEncoder(),td=new TextDecoder();
const ECDH={name:'ECDH',namedCurve:'P-256'};

// RFC 8291 appendix A
const RFC={plaintext:'When I grow up, I want to be a watermelon',
 asPublic:'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',asPrivate:'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
 uaPublic:'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',uaPrivate:'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
 salt:'DGv6ra1nlYgDCS1FRnbzlw',auth:'BTBZMqHH6r4Tts7J_aSIgg',
 body:'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN'};
const jwkOf=(pub,d)=>{const p=unb64u(pub);return {kty:'EC',crv:'P-256',x:b64u(p.slice(1,33)),y:b64u(p.slice(33)),...(d?{d}:{})};};
async function hmac(key,data){return new Uint8Array(await crypto.subtle.sign('HMAC',await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']),data));}
const cat=(...a)=>{const o=new Uint8Array(a.reduce((n,x)=>n+x.length,0));let i=0;for(const x of a){o.set(x,i);i+=x.length;}return o;};
// the browser's side: decrypt an aes128gcm push body with the subscription's private key
async function decrypt(body,uaPublic,uaPrivateKey,auth){
 const salt=body.slice(0,16),rs=new DataView(body.buffer,body.byteOffset).getUint32(16),idlen=body[20],asPublic=body.slice(21,21+idlen),record=body.slice(21+idlen);
 assert.equal(rs,4096);assert(record.length<=rs);
 const ecdh=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:await crypto.subtle.importKey('raw',asPublic,ECDH,false,[])},uaPrivateKey,256));
 const ikm=await hmac(await hmac(auth,ecdh),cat(te.encode('WebPush: info\0'),uaPublic,asPublic,[1])),prk=await hmac(salt,ikm);
 const cek=(await hmac(prk,cat(te.encode('Content-Encoding: aes128gcm\0'),[1]))).slice(0,16),iv=(await hmac(prk,cat(te.encode('Content-Encoding: nonce\0'),[1]))).slice(0,12);
 const plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv},await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['decrypt']),record));
 assert.equal(plain.at(-1),2);return td.decode(plain.slice(0,-1));
}
async function browserSubscription(){
 const k=await crypto.subtle.generateKey(ECDH,true,['deriveBits']),pub=new Uint8Array(await crypto.subtle.exportKey('raw',k.publicKey)),auth=crypto.getRandomValues(new Uint8Array(16));
 return {privateKey:k.privateKey,pub,auth,json:{endpoint:'https://fcm.googleapis.com/fcm/send/'+b64u(crypto.getRandomValues(new Uint8Array(12))),keys:{p256dh:b64u(pub),auth:b64u(auth)}}};
}
async function vapidPair(){const k=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),j=await crypto.subtle.exportKey('jwk',k.privateKey);return {VAPID_PUBLIC:b64u(new Uint8Array(await crypto.subtle.exportKey('raw',k.publicKey))),VAPID_PRIVATE:j.d,verify:k.publicKey};}

test('payload encryption matches the RFC 8291 example (aes128gcm)',async()=>{
 const privateKey=await crypto.subtle.importKey('jwk',jwkOf(RFC.asPublic,RFC.asPrivate),ECDH,false,['deriveBits']),publicKey=await crypto.subtle.importKey('raw',unb64u(RFC.asPublic),ECDH,true,[]);
 const body=await encryptPayload(RFC.plaintext,unb64u(RFC.uaPublic),unb64u(RFC.auth),{salt:unb64u(RFC.salt),asKeys:{privateKey,publicKey}});
 assert.equal(b64u(body),RFC.body);
 const ua=await crypto.subtle.importKey('jwk',jwkOf(RFC.uaPublic,RFC.uaPrivate),ECDH,false,['deriveBits']);
 assert.equal(await decrypt(body,unb64u(RFC.uaPublic),ua,unb64u(RFC.auth)),RFC.plaintext);
});
test('VAPID JWT is ES256, for the push service origin, short-lived, and verifies with the public key',async()=>{
 const v=await vapidPair(),now=1800000000000;
 const h=await vapidHeader('https://fcm.googleapis.com/fcm/send/abc',{publicKey:v.VAPID_PUBLIC,privateKey:v.VAPID_PRIVATE,subject:'mailto:owner@example.com'},now);
 const m=h.match(/^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/);assert(m,h);assert.equal(m[4],v.VAPID_PUBLIC);
 assert.deepEqual(JSON.parse(td.decode(unb64u(m[1]))),{typ:'JWT',alg:'ES256'});
 const claims=JSON.parse(td.decode(unb64u(m[2])));assert.equal(claims.aud,'https://fcm.googleapis.com');assert.equal(claims.sub,'mailto:owner@example.com');assert(claims.exp>now/1000&&claims.exp<=now/1000+86400);
 assert(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},v.verify,unb64u(m[3]),te.encode(m[1]+'.'+m[2])));
});
test('a push request carries the encrypted message the browser can read',async()=>{
 const v=await vapidPair(),s=await browserSubscription();let req;
 const status=await sendPush({ep:s.json.endpoint,...s.json.keys},{title:BIG_UPDATE_TITLE,body:'Update 6.0'},{publicKey:v.VAPID_PUBLIC,privateKey:v.VAPID_PRIVATE},{topic:'update6',fetchImpl:async(url,init)=>{req={url,...init};return new Response(null,{status:201});}});
 assert.equal(status,201);assert.equal(req.url,s.json.endpoint);assert.equal(req.headers['Content-Encoding'],'aes128gcm');assert.equal(req.headers.Topic,'update6');assert(+req.headers.TTL>0);assert.match(req.headers.Authorization,/^vapid t=/);
 assert.deepEqual(JSON.parse(await decrypt(req.body,s.pub,s.privateKey,s.auth)),{title:'Nitro Pitch — Big Update!',body:'Update 6.0'});
});
test('only real browser push services and well-formed keys are accepted as subscriptions',async()=>{
 const s=(await browserSubscription()).json;assert(cleanSubscription(s));
 for(const ep of ['https://evil.example/push','http://fcm.googleapis.com/x','https://fcm.googleapis.com:8443/x','https://fcm.googleapis.com.evil.example/x','javascript:alert(1)',''])assert.equal(cleanSubscription({...s,endpoint:ep}),null,ep);
 for(const ep of ['https://updates.push.services.mozilla.com/wpush/v2/x','https://wns2-par02p.notify.windows.com/w/?token=x','https://web.push.apple.com/abc'])assert(cleanSubscription({...s,endpoint:ep}),ep);
 assert.equal(cleanSubscription({...s,keys:{...s.keys,auth:'AAAA'}}),null);assert.equal(cleanSubscription({...s,keys:{...s.keys,p256dh:b64u(new Uint8Array(65))}}),null);
});

// a Durable Object storage stand-in
function memoryStorage(){
 const data=new Map(),clone=v=>v===undefined?undefined:structuredClone(v);let alarm=null;
 return {data,get alarm(){return alarm;},get:async k=>clone(data.get(k)),put:async(k,v)=>{data.set(k,clone(v));},delete:async k=>data.delete(k),setAlarm:async t=>{alarm=t;},
  list:async({prefix='',limit=Infinity,startAfter}={})=>new Map([...data].filter(([k])=>k.startsWith(prefix)&&(!startAfter||k>startAfter)).sort(([a],[b])=>a<b?-1:1).slice(0,limit).map(([k,v])=>[k,clone(v)]))};
}
async function hub(statusFor=()=>201){
 const storage=memoryStorage(),v=await vapidPair(),sent=[];
 const h=new PushHub(storage,v,{fetchImpl:async(url,init)=>{sent.push(url);return new Response(null,{status:statusFor(url)});}});
 const drain=async()=>{for(let i=0;i<100&&storage.alarm!==null;i++){const t=storage.alarm;await h.alarm();if(storage.alarm===t)break;}};
 return {storage,h,sent,drain,env:v};
}
test('subscription API: save, refresh, replace and remove a browser',async()=>{
 const {h,storage}=await hub(),a=(await browserSubscription()).json,b=(await browserSubscription()).json;
 assert.deepEqual(await h.subscribe(a),{ok:true});assert.deepEqual(await h.subscribe(a),{ok:true});assert.equal(await h.count(),1);
 assert.equal((await h.subscribe({...a,endpoint:'https://example.com/x'})).status,400);
 await h.subscribe({...b,old:a.endpoint});assert.equal(await h.count(),1);
 const saved=[...storage.data].filter(([k])=>k.startsWith('push:s:')).map(([,v])=>v.ep);assert.deepEqual(saved,[b.endpoint]);
 await h.unsubscribe({endpoint:b.endpoint});await h.unsubscribe({endpoint:b.endpoint});assert.equal(await h.count(),0);
});
test('a big release is broadcast once, in batches, and gone subscriptions are pruned',async()=>{
 const {h,storage,sent,drain}=await hub(url=>url.endsWith('gone')?410:url.endsWith('down')?500:201);
 const n=PUSH.BATCH*2+5;for(let i=0;i<n;i++){const s=(await browserSubscription()).json;if(i===3)s.endpoint+='gone';if(i===4)s.endpoint+='down';await h.subscribe(s);}
 const rel={build:2026120101,v:'6.0',title:'Update 6.0: Nitro 2D',big:true};
 assert.deepEqual(await h.announce({...rel,big:false}),{skipped:'not a big update'});assert.equal(storage.alarm,null);
 const first=await h.announce(rel);assert.equal(first.started,true);assert.equal(first.subscribers,n);
 assert.deepEqual(await h.announce(rel),{already:true});
 await h.alarm();assert.equal(sent.length,PUSH.BATCH,'one batch per alarm');assert(storage.alarm>0);
 await drain();assert.equal(sent.length,n);assert.equal(new Set(sent).size,n);
 const last=(await h.status(rel)).last;assert.equal(last.sent,n-2);assert.equal(last.gone,1);assert.equal(last.failed,1);assert.equal(last.kind,'auto');assert.equal(last.title,rel.title);
 assert.equal(await h.count(),n-1);assert.equal((await h.status(rel)).announced.build,rel.build);
 // a new isolate, a redeploy of the same release, a restart: still once
 assert.deepEqual(await h.announce(rel),{already:true});await drain();assert.equal(sent.length,n);
});
test('without VAPID keys nothing is sent and the release is still announced once they are added',async()=>{
 const storage=memoryStorage(),rel={build:1,v:'6.1',title:'Big',big:true};
 assert.deepEqual(await new PushHub(storage,{}).announce(rel),{skipped:'VAPID keys are not set'});
 assert.equal((await new PushHub(storage,{}).manual(rel,'')).status,503);
 const v=await vapidPair();assert.equal((await new PushHub(storage,v,{fetchImpl:async()=>new Response(null,{status:201})}).announce(rel)).started,true);
});

// the Ops Durable Object and its routes (src/ops.js), with the Worker's own release info
const opsSource=(await readFile(new URL('src/ops.js',root),'utf8')).replace(/^import .*;$/gm,'').replaceAll('export ','');
async function ops(env={}){
 const storage=memoryStorage(),c=vm.createContext({ApiError,reply,PushHub,MessageHub,firebaseDoc:async()=>null,ADMIN_UID:'admin',crypto,URL,Request,Response,TextEncoder,Date,Map,Array,Uint8Array,JSON,
  identify:async t=>({uid:t,username:t}),readJson:async req=>req.json(),DurableObject:class{constructor(ctx,env){this.ctx=ctx;this.env=env;}}});
 vm.runInContext(opsSource+'\nglobalThis.Ops=Ops;globalThis.opsFetch=opsFetch;globalThis.announceBigUpdate=announceBigUpdate;',c);
 const o=new c.Ops({storage:Object.assign(storage,{sql:{exec:()=>({one:()=>({c:0})})}})},env);
 env.OPS={idFromName:x=>x,get:()=>({fetch:req=>o.fetch(req)})};
 const call=async(path,body,{token,origin='https://nitropitch.app',method='POST',rel}={})=>{
  const r=await c.opsFetch(new Request('https://nitropitch.app'+path,{method,headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(method==='POST'?{body:JSON.stringify(body)}:{})}),env,{release:rel});
  return {status:r.status,...await r.json()};
 };
 return {storage,o,c,env,call};
}
test('push routes: the public key, subscribe and unsubscribe need no account but do need the site origin',async()=>{
 const v=await vapidPair(),{call,storage}=await ops({...v}),s=(await browserSubscription()).json;
 assert.equal((await call('/api/push/key',null,{method:'GET'})).key,v.VAPID_PUBLIC);
 assert.equal((await call('/api/push/subscribe',s,{origin:'https://evil.example'})).status,403);
 assert.equal((await call('/api/push/subscribe',s,{method:'GET'})).status,405);
 assert.equal((await call('/api/push/subscribe',{...s,endpoint:'https://evil.example/x'})).status,400);
 assert.equal((await call('/api/push/subscribe',s)).ok,true);assert.equal(storage.data.get('push:n'),1);
 assert.equal((await call('/api/push/unsubscribe',{endpoint:s.endpoint})).ok,true);assert.equal(storage.data.get('push:n'),0);
});
test('the manual "Send update notification" is admin-only and uses the served release, not the browser’s',async()=>{
 const v=await vapidPair(),{call,storage}=await ops({...v}),rel={build:7,v:'6.2',title:'Update 6.2: Big one',big:true};
 assert.equal((await call('/api/admin/push',{act:'send'},{token:'player',rel})).status,403);
 assert.equal((await call('/api/admin/push',{act:'status'},{token:'player',rel})).status,403);
 assert.equal(storage.alarm,null);
 const sent=await call('/api/admin/push',{act:'send',release:{v:'forged',big:true}},{token:'admin',rel});assert.equal(sent.status,200);assert.equal(sent.started,true);
 assert.equal(storage.data.get('push:job').title,'Update 6.2: Big one');assert(storage.data.get('push:announced:6.2').manual);assert(!storage.data.has('push:announced:forged'));
 assert.equal((await call('/api/admin/push',{act:'send'},{token:'admin',rel})).status,409,'one broadcast at a time');
 const st=await call('/api/admin/push',{act:'status'},{token:'admin',rel});assert.equal(st.configured,true);assert.equal(st.release.v,'6.2');assert(st.job);
});
test('the Worker announces a big release once from nitropitch.app, in the background',async()=>{
 const v=await vapidPair(),{c,env,storage}=await ops({...v}),waits=[],ctx={waitUntil:p=>waits.push(p)};
 const rel={build:9,v:'6.3',title:'Update 6.3',big:true},site=new URL('https://nitropitch.app/');
 assert.equal(c.announceBigUpdate(site,env,ctx,{...rel,big:false}),false);
 assert.equal(c.announceBigUpdate(new URL('https://nitropitch.bibleway.workers.dev/'),env,ctx,rel),false);
 assert.equal(c.announceBigUpdate(new URL('http://localhost:8790/'),env,ctx,rel),false);
 assert.equal(c.announceBigUpdate(site,env,ctx,rel),true);assert.equal(c.announceBigUpdate(site,env,ctx,rel),false);
 await Promise.all(waits);assert.equal(waits.length,1);assert(storage.data.get('push:announced:6.3'));assert.equal(storage.data.get('push:job').kind,'auto');
});

test('served release: BUILD and the active patch notes, with "big": true marking an announced release',async()=>{
 assert.equal(String(release.build),html.match(/const BUILD = (\d+);/)[1]);
 const notes=html.slice(html.indexOf('const PATCH_NOTES = '),html.indexOf('const PATCH_NOTES_53'));
 const ctx=vm.createContext({});vm.runInContext(notes+'\nglobalThis.notes=PATCH_NOTES;',ctx);
 assert.equal(release.v,ctx.notes.v);assert.equal(release.title,ctx.notes.title);assert.equal(release.big,ctx.notes.big===true);
 // marking a release big is one line in src/game-shell.js
 const source=(await readFile(new URL('src/game-shell.js',root),'utf8')).replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
 const marked=source.replace('"after": "const PATCH_NOTES = {\\n','"after": "const PATCH_NOTES = {\\n  \\"big\\": true,\\n');assert.notEqual(marked,source);
 const m=vm.createContext({});vm.runInContext(marked+'\nglobalThis.release=RELEASE;',m);assert.equal(m.release.big,true);assert.equal(m.release.v,release.v);
});
test('the service worker shows the push and opens nitropitch.app on click',async()=>{
 const sw=await readFile(new URL('public/sw.js',root),'utf8'),handlers={},shown=[],opened=[],waits=[];
 const self={addEventListener:(t,f)=>handlers[t]=f,skipWaiting(){},registration:{showNotification:async(t,o)=>shown.push([t,o])},clients:{claim(){},matchAll:async()=>[],openWindow:async u=>opened.push(u)}};
 vm.runInContext(sw,vm.createContext({self,URL,fetch:async()=>{throw 0;},atob,Uint8Array,JSON,String}));
 handlers.push({data:{json:()=>({title:BIG_UPDATE_TITLE,body:'Update 6.0: Nitro 2D',tag:'np-update-6.0'})},waitUntil:p=>waits.push(p)});await Promise.all(waits);
 assert.equal(shown[0][0],'Nitro Pitch — Big Update!');assert.equal(shown[0][1].body,'Update 6.0: Nitro 2D');
 let closed=false;handlers.notificationclick({notification:{close:()=>closed=true},waitUntil:p=>waits.push(p)});await Promise.all(waits);
 assert(closed);assert.deepEqual(opened,['https://nitropitch.app/']);
 assert(html.includes('navigator.serviceWorker.register("/sw.js")'));assert.equal(html.split('const OK = typeof Notification === "function" && window.isSecureContext;').length,2,'the CrazyGames build turns notifications off with this one line');
});
