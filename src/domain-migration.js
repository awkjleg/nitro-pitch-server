import { DurableObject } from 'cloudflare:workers';

export const OLD_HOST = 'nitropitch.bibleway.workers.dev';
export const NEW_ORIGIN = 'https://nitropitch.app';
const OLD_ORIGIN = 'https://' + OLD_HOST;
const TTL = 5 * 60 * 1000;
const MAX_BODY = 12 * 1024 * 1024;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const safeHeaders = {'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer', 'X-Content-Type-Options':'nosniff'};
const json = (data, status = 200) => new Response(JSON.stringify(data), {status, headers:{...safeHeaders,'Content-Type':'application/json'}});
const redirect = target => new Response(null, {status:302,headers:{...safeHeaders,Location:target}});
const token = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
async function boundedJson(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new Error('Use JSON');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing body');
  const chunks = []; let total = 0;
  while (true) {
    const {done,value} = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BODY) { await reader.cancel(); throw new Error('Transfer too large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
function shell(step, next = '/') {
  // No game or Firebase SDK runs while persistence is being moved.
  const encodedNext = encodeURIComponent(next);
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Moving to nitropitch.app | Nitro Pitch</title><link rel="stylesheet" href="/legal.css"><script defer src="/account-config.js"></script><script defer src="/domain-migration.js" data-step="${step}" data-next="${encodedNext}"></script></head><body><main class="page" style="max-width:720px;padding-top:12vh"><div class="card"><span class="eyebrow">Nitro Pitch · New address</span><h1 style="font-size:clamp(2rem,6vw,3rem)">Your next match is on nitropitch.app</h1><p id="migration-status" role="status" aria-live="polite">Preparing your browser save and sign-in…</p><div id="migration-actions"></div><p class="updated">Your old save stays on this device. Login credentials never appear in the redirect URL.</p><noscript><p>JavaScript is required to transfer browser saves. <a href="https://nitropitch.app/">Open nitropitch.app</a>; you may need to sign in again.</p></noscript></div></main></body></html>`, {headers:{...safeHeaders,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"}});
}

export async function migrationFetch(request, env) {
  const url = new URL(request.url);
  const old = url.hostname === OLD_HOST, current = url.origin === NEW_ORIGIN;
  const path = url.pathname;
  if (path === '/domain-migration.js' || path === '/account-config.js' || path === '/legal.css') return null;
  if (path === '/__migration/store' || path === '/__migration/redeem') {
    const origin = request.headers.get('Origin');
    if (request.method !== 'POST') return json({error:'POST required'},405);
    if ((path.endsWith('/store') && (!old || origin !== OLD_ORIGIN)) ||
        (path.endsWith('/redeem') && (!current || origin !== NEW_ORIGIN))) return json({error:'Not allowed'},403);
    let body; try { body = await boundedJson(request); } catch (_) { return json({error:'Invalid or oversized transfer'},400); }
    if (path.endsWith('/store')) {
      if (!TOKEN.test(body.challenge || '') || typeof body.sealed !== 'string' || body.sealed.length > MAX_BODY - 1024) return json({error:'Invalid transfer'},400);
      // Only encrypted browser data is stored; the private decryption key never leaves the new-origin tab.
      const id = token();
      const response = await env.TRANSFERS.get(env.TRANSFERS.idFromName(id)).fetch(new Request('https://transfer/store',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
      if (!response.ok) return response;
      return json({id});
    }
    if (!TOKEN.test(body.id || '') || !TOKEN.test(body.verifier || '')) return json({error:'Invalid transfer'},400);
    return env.TRANSFERS.get(env.TRANSFERS.idFromName(body.id)).fetch(new Request('https://transfer/redeem',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({verifier:body.verifier})}));
  }
  if (path === '/__migration/start' && current) {
    const next = url.searchParams.get('next') || '/';
    return shell('start',next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/__migration') ? next : '/');
  }
  if (path === '/__migration/export' && old) return shell('export');
  if (path === '/__migration/finish' && current) return shell('finish');
  if (path.startsWith('/__migration/')) return json({error:'Not found'},404);
  // Keep the old WebSocket endpoint working for existing tabs and the game's default room URL.
  if (old && path !== '/ws') {
    if (request.method !== 'GET' && request.method !== 'HEAD') return redirect(NEW_ORIGIN + path + url.search);
    const isPage = request.headers.get('Sec-Fetch-Mode') === 'navigate' || request.headers.get('Accept')?.includes('text/html') || path === '/' || path.endsWith('.html');
    if (isPage) return shell('entry',path + url.search);
    return redirect(NEW_ORIGIN + path + url.search);
  }
  return null;
}

export class DomainTransfer extends DurableObject {
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/store') {
      const {challenge,sealed} = await request.json();
      if (!TOKEN.test(challenge || '') || typeof sealed !== 'string' || sealed.length > MAX_BODY - 1024) return json({error:'Invalid transfer'},400);
      const chunks = Math.ceil(sealed.length / 60000);
      await this.ctx.storage.transaction(async storage => {
        if (await storage.get('meta')) throw new Error('Transfer already exists');
        for (let i=0;i<chunks;i++) await storage.put('part:'+i,sealed.slice(i*60000,(i+1)*60000));
        await storage.put('meta',{challenge,chunks,expires:Date.now()+TTL});
      });
      await this.ctx.storage.setAlarm(Date.now()+TTL);
      return json({ok:true});
    }
    if (path === '/redeem') {
      const {verifier} = await request.json();
      if (!TOKEN.test(verifier || '')) return json({error:'Invalid verifier'},403);
      const hash = new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
      const challenge = btoa(String.fromCharCode(...hash)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
      const result = await this.ctx.storage.transaction(async storage => {
        const meta = await storage.get('meta');
        if (!meta || meta.expires < Date.now()) return {status:410,error:'Transfer expired. Return to the old address to try again.'};
        if (meta.challenge !== challenge) return {status:403,error:'This transfer belongs to another browser tab.'};
        let sealed = '';
        for (let i=0;i<meta.chunks;i++) sealed += await storage.get('part:'+i) || '';
        const keys = ['meta', ...Array.from({length:meta.chunks},(_,i)=>'part:'+i)];
        for (let i=0;i<keys.length;i+=64) await storage.delete(keys.slice(i,i+64));
        return {status:200,sealed};
      });
      if (result.status === 200) { await this.ctx.storage.deleteAlarm(); return json({sealed:result.sealed}); }
      return json({error:result.error},result.status);
    }
    return json({error:'Not found'},404);
  }
  async alarm() { await this.ctx.storage.deleteAll(); }
}
