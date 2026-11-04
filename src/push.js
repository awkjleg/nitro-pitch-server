// Web Push for Nitro Pitch: "Big Update!" notifications to every browser that turned notifications on.
// Standard Web Push, implemented with WebCrypto only (no libraries):
//   - payload encryption: RFC 8291 (aes128gcm content coding, RFC 8188), one record
//   - sender identity: VAPID (RFC 8292), an ES256 JWT signed with the VAPID private key
// The keys come from Worker secrets: VAPID_PUBLIC (base64url, 65-byte uncompressed P-256 point) and
// VAPID_PRIVATE (base64url, 32-byte private scalar). Generate a pair with `node scripts/vapid-keys.mjs`.
// PushHub keeps the subscriptions in the Ops Durable Object's storage and sends broadcasts from its alarm,
// a small batch at a time, so a big player base never hits the per-invocation subrequest limit.
const te = new TextEncoder();
export const b64u = bytes => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, ''); };
export const unb64u = str => { const s = atob(String(str).replaceAll('-', '+').replaceAll('_', '/') + '==='.slice((String(str).length + 3) % 4)); return Uint8Array.from(s, c => c.charCodeAt(0)); };
const concat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}
const RS = 4096, MAX_PLAINTEXT = 3000;

// RFC 8291 section 3.4 + RFC 8188: returns the request body (header + one encrypted record).
// `salt` and `asKeys` (an ECDH P-256 key pair) are only passed by the tests (RFC 8291 appendix A).
export async function encryptPayload(plaintext, uaPublic, authSecret, { salt, asKeys } = {}) {
  if (typeof plaintext === 'string') plaintext = te.encode(plaintext);
  if (plaintext.length > MAX_PLAINTEXT) throw new Error('Push payload too large');
  if (uaPublic.length !== 65 || uaPublic[0] !== 4 || authSecret.length !== 16) throw new Error('Invalid push subscription keys');
  salt = salt || crypto.getRandomValues(new Uint8Array(16));
  const as = asKeys || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const ua = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: ua }, as.privateKey, 256));
  // HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0x00 || ua_public || as_public, 32)
  const prkKey = await hmac(authSecret, ecdhSecret);
  const ikm = await hmac(prkKey, concat(te.encode('WebPush: info\0'), uaPublic, asPublic, [1]));
  // HKDF(salt, IKM, ...) for the content encryption key and nonce
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(te.encode('Content-Encoding: aes128gcm\0'), [1]))).slice(0, 16);
  const nonce = (await hmac(prk, concat(te.encode('Content-Encoding: nonce\0'), [1]))).slice(0, 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const record = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(plaintext, [2])));   // 0x02: last record, no padding
  return concat(salt, [RS >>> 24 & 255, RS >>> 16 & 255, RS >>> 8 & 255, RS & 255], [asPublic.length], asPublic, record);
}

// the VAPID private key as a WebCrypto signing key (the public key supplies x and y)
const signingKeys = new Map();
async function vapidKey(vapid) {
  const id = vapid.publicKey + vapid.privateKey;
  if (!signingKeys.has(id)) {
    const pub = unb64u(vapid.publicKey), d = unb64u(vapid.privateKey);
    if (pub.length !== 65 || pub[0] !== 4 || d.length !== 32) throw new Error('VAPID keys are malformed');
    signingKeys.clear();
    signingKeys.set(id, crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33)), d: b64u(d), ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']));
  }
  return signingKeys.get(id);
}
// RFC 8292: Authorization: vapid t=<ES256 JWT for the push service's origin>, k=<public key>
export async function vapidHeader(endpoint, vapid, now = Date.now()) {
  const aud = new URL(endpoint).origin;
  const head = b64u(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(te.encode(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: vapid.subject || 'https://nitropitch.app' })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await vapidKey(vapid), te.encode(head + '.' + body)));
  return 'vapid t=' + head + '.' + body + '.' + b64u(sig) + ', k=' + vapid.publicKey;
}
// one push message; resolves to the push service's HTTP status (0 = network error)
export async function sendPush(sub, message, vapid, { ttl = 2 * 86400, topic = '', urgency = 'normal', fetchImpl = fetch, now = Date.now() } = {}) {
  const body = await encryptPayload(JSON.stringify(message), unb64u(sub.p256dh), unb64u(sub.auth));
  const headers = { 'Content-Type': 'application/octet-stream', 'Content-Encoding': 'aes128gcm', TTL: String(ttl), Urgency: urgency, Authorization: await vapidHeader(sub.ep, vapid, now) };
  if (/^[A-Za-z0-9_-]{1,32}$/.test(topic)) headers.Topic = topic;
  try { const r = await fetchImpl(sub.ep, { method: 'POST', headers, body, signal: AbortSignal.timeout(10000) }); return r.status; }
  catch { return 0; }
}

// browser push services only (the Worker never posts to any other address a client gives it)
const PUSH_HOST = /(^|\.)(fcm\.googleapis\.com|android\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com)$/;
export function cleanSubscription(s) {
  const ep = typeof s?.endpoint === 'string' ? s.endpoint : '';
  let url; try { url = new URL(ep); } catch { return null; }
  if (ep.length > 1024 || url.protocol !== 'https:' || url.port || !PUSH_HOST.test(url.hostname)) return null;
  let p256dh, auth; try { p256dh = unb64u(s.keys?.p256dh || ''); auth = unb64u(s.keys?.auth || ''); } catch { return null; }
  if (p256dh.length !== 65 || p256dh[0] !== 4 || auth.length !== 16) return null;
  return { ep, p256dh: b64u(p256dh), auth: b64u(auth) };
}
async function epHash(ep) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(ep))), x => x.toString(16).padStart(2, '0')).join('').slice(0, 32); }

export const BIG_UPDATE_TITLE = 'Nitro Pitch — Big Update!';
export const PUSH = { BATCH: 40, GAP_MS: 2000, MAX_SUBS: 250000, STALE_MS: 180 * 864e5, JOB_STUCK_MS: 6 * 3600e3 };
const SUB = 'push:s:';
export class PushHub {
  // storage: a Durable Object storage (get/put/delete/list/setAlarm); env: VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT
  constructor(storage, env, { fetchImpl = (...a) => fetch(...a), now = () => Date.now() } = {}) { this.storage = storage; this.env = env; this.fetchImpl = fetchImpl; this.now = now; }
  vapid() { const { VAPID_PUBLIC: publicKey, VAPID_PRIVATE: privateKey, VAPID_SUBJECT: subject } = this.env || {}; return publicKey && privateKey ? { publicKey, privateKey, subject } : null; }
  async count() { return (await this.storage.get('push:n')) | 0; }
  // uid: the signed-in account using this browser (optional), so private-message notifications can reach it
  async subscribe(b, uid = null) {
    const s = cleanSubscription(b);
    if (!s) return { error: 'Invalid push subscription', status: 400 };
    const h = await epHash(s.ep), have = await this.storage.get(SUB + h);
    if (b.old && typeof b.old === 'string' && b.old !== s.ep) await this.unsubscribe({ endpoint: b.old });
    if (!have) { const n = await this.count(); if (n >= PUSH.MAX_SUBS) return { error: 'Notifications are full right now', status: 503 }; await this.storage.put('push:n', n + 1); }
    if (have?.uid && have.uid !== uid) await this.unlink(have.uid, h);
    await this.storage.put(SUB + h, { ...s, at: this.now(), ...(uid ? { uid } : {}) });
    if (uid) { const list = (await this.storage.get('push:u:' + uid) || []).filter(x => x !== h); list.push(h); await this.storage.put('push:u:' + uid, list.slice(-8)); }
    return { ok: true };
  }
  async unlink(uid, h) { const list = await this.storage.get('push:u:' + uid); if (list) { const next = list.filter(x => x !== h); if (next.length) await this.storage.put('push:u:' + uid, next); else await this.storage.delete('push:u:' + uid); } }
  // one account's browsers (private messages): sent at once; gone subscriptions are removed
  async sendToUser(uid, message, topic = '') {
    const vapid = this.vapid(), list = await this.storage.get('push:u:' + uid) || [];
    if (!vapid || !list.length) return { sent: 0 };
    let sent = 0;
    await Promise.all(list.map(async h => {
      const sub = await this.storage.get(SUB + h);
      if (!sub || sub.uid !== uid) { await this.unlink(uid, h); return; }
      const status = await sendPush(sub, message, vapid, { ttl: 6 * 3600, topic, urgency: 'high', fetchImpl: this.fetchImpl, now: this.now() });
      if (status === 404 || status === 410) { await this.storage.delete(SUB + h); await this.unlink(uid, h); await this.storage.put('push:n', Math.max(0, (await this.count()) - 1)); }
      else if (status >= 200 && status < 300) sent++;
    }));
    return { sent };
  }
  async unsubscribe(b) {
    if (typeof b?.endpoint !== 'string' || b.endpoint.length > 1024) return { ok: true };
    const h = await epHash(b.endpoint);
    const have = await this.storage.get(SUB + h);
    if (have) { await this.storage.delete(SUB + h); if (have.uid) await this.unlink(have.uid, h); await this.storage.put('push:n', Math.max(0, (await this.count()) - 1)); }
    return { ok: true };
  }
  // the automatic trigger: a release whose patch notes say big: true is announced once (per patch-notes version)
  async announce(release) {
    if (!release?.big || typeof release.v !== 'string' || !release.v) return { skipped: 'not a big update' };
    if (!this.vapid()) return { skipped: 'VAPID keys are not set' };    // not marked: it goes out once the secrets exist
    const key = 'push:announced:' + release.v;
    if (await this.storage.get(key)) return { already: true };
    await this.storage.put(key, { at: this.now(), build: release.build || 0, title: String(release.title || '') });
    return this.start({ kind: 'auto', v: release.v, title: String(release.title || 'A big update is here') });
  }
  // the admin's button: send the update notification now (for the current patch notes, or a custom line)
  async manual(release, text) {
    if (!this.vapid()) return { error: 'Push is not set up: add the VAPID_PUBLIC and VAPID_PRIVATE secrets first', status: 503 };
    const job = await this.storage.get('push:job');
    if (job && this.now() - job.started < PUSH.JOB_STUCK_MS) return { error: 'A notification is already being sent (' + job.sent + ' so far)', status: 409 };
    const title = String(text || release?.title || 'A big update is here').trim().slice(0, 120);
    if (release?.v) await this.storage.put('push:announced:' + release.v, { at: this.now(), build: release.build || 0, title, manual: true });
    return this.start({ kind: 'manual', v: release?.v || '', title });
  }
  async start({ kind, v, title }) {
    const job = await this.storage.get('push:job');
    if (job && this.now() - job.started < PUSH.JOB_STUCK_MS) { (job.queue = job.queue || []).push({ kind, v, title }); await this.storage.put('push:job', job); return { queued: true }; }
    await this.storage.put('push:job', { kind, v, title, after: '', sent: 0, gone: 0, failed: 0, started: this.now() });
    await this.storage.setAlarm(this.now() + 50);
    return { started: true, subscribers: await this.count() };
  }
  async status(release) {
    const job = await this.storage.get('push:job') || null;
    if (job) delete job.queue;
    return { subscribers: await this.count(), job, last: await this.storage.get('push:last') || null, configured: !!this.vapid(),
      release: release ? { v: release.v, title: release.title, big: !!release.big } : null, announced: release?.v ? await this.storage.get('push:announced:' + release.v) || null : null };
  }
  // one batch per alarm; the alarm re-arms itself until every subscription has been tried
  async alarm() {
    const job = await this.storage.get('push:job'), vapid = this.vapid();
    if (!job) return;
    if (!vapid) { await this.finish(job, 'VAPID keys missing'); return; }
    const page = await this.storage.list({ prefix: SUB, limit: PUSH.BATCH, ...(job.after ? { startAfter: job.after } : {}) });
    const message = { title: BIG_UPDATE_TITLE, body: job.title, url: 'https://nitropitch.app/', tag: 'np-update' + (job.v ? '-' + job.v : '') };
    const topic = ('update' + (job.v || '')).replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 32), now = this.now();
    let gone = 0;
    await Promise.all([...page].map(async ([key, sub]) => {
      if (now - (sub.at || 0) > PUSH.STALE_MS) { await this.storage.delete(key); gone++; return; }
      const status = await sendPush(sub, message, vapid, { topic, fetchImpl: this.fetchImpl, now });
      if (status === 404 || status === 410) { await this.storage.delete(key); gone++; }
      else if (status >= 200 && status < 300) job.sent++;
      else job.failed++;
    }));
    if (gone) { job.gone += gone; await this.storage.put('push:n', Math.max(0, (await this.count()) - gone)); }
    if (page.size) job.after = [...page.keys()].at(-1);
    if (page.size < PUSH.BATCH) { await this.finish(job); return; }
    await this.storage.put('push:job', job);
    await this.storage.setAlarm(now + PUSH.GAP_MS);
  }
  async finish(job, error) {
    const { queue = [], ...done } = job;
    delete done.after;
    await this.storage.put('push:last', { ...done, finished: this.now(), ...(error ? { error } : {}) });
    await this.storage.delete('push:job');
    const next = queue.shift();
    if (next) { await this.storage.put('push:job', { ...next, queue, after: '', sent: 0, gone: 0, failed: 0, started: this.now() }); await this.storage.setAlarm(this.now() + PUSH.GAP_MS); }
  }
}
