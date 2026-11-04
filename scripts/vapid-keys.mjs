// Make a VAPID key pair for Nitro Pitch's Big Update notifications (Web Push).
// Usage: node scripts/vapid-keys.mjs
// Then store both as Worker secrets (never commit the private key):
//   npx wrangler secret put VAPID_PUBLIC    (paste the public key)
//   npx wrangler secret put VAPID_PRIVATE   (paste the private key)
// Keep the same pair afterwards: a new pair makes every browser subscribe again the next time it opens the game.
const b64u = bytes => Buffer.from(bytes).toString('base64url');
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const publicKey = b64u(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));
const privateKey = (await crypto.subtle.exportKey('jwk', pair.privateKey)).d;
console.log('VAPID_PUBLIC=' + publicKey);
console.log('VAPID_PRIVATE=' + privateKey);
