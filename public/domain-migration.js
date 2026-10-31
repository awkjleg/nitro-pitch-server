(async function () {
  'use strict';
  const OLD = 'https://nitropitch.bibleway.workers.dev';
  const NEW = 'https://nitropitch.app';
  const STATE = 'np-domain-transfer-v1';
  const COMPLETE = 'np-domain-migrated-v1';
  const TTL = 5 * 60 * 1000;
  const MAX_PLAIN = 8 * 1024 * 1024;
  const script = document.currentScript;
  const step = script.dataset.step;
  const encoder = new TextEncoder();
  const status = document.getElementById('migration-status');
  const actions = document.getElementById('migration-actions');
  const ALLOWED = /^(np-(?:settings|mute|profile|name|train|tut|exh|priv|pls|replays|rp-[a-z0-9]{1,16}|rejoin|clanq|clanreq|patch-seen|ann-closed|adm-seen|cookie-choice-v1)|np-(?:match-history|blocked):[A-Za-z0-9_-]{1,128}|nitropitch_terms_accepted(?:_global|:[A-Za-z0-9_-]{1,128}))$/;

  function base64(bytes) {
    let binary = '';
    for (let i=0;i<bytes.length;i+=16384) binary += String.fromCharCode(...bytes.subarray(i,i+16384));
    return btoa(binary).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
  }
  function unbase64(text) {
    if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('Invalid transfer encoding');
    return Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
  }
  function safeNext(value) {
    try { const url = new URL(value,NEW); return url.origin === NEW && !url.pathname.startsWith('/__migration/') ? url.pathname+url.search+url.hash : '/'; }
    catch (_) { return '/'; }
  }
  function authKey() {
    const apiKey = window.NP_FIREBASE_CONFIG?.apiKey;
    if (!apiKey) throw new Error('Account configuration is unavailable. Your old save has not been changed.');
    return 'firebase:authUser:' + apiKey + ':[DEFAULT]';
  }
  function button(label, run) {
    const element = document.createElement('button'); element.className = 'action'; element.type = 'button'; element.textContent = label; element.style.margin = '8px 12px 8px 0';
    element.addEventListener('click',run); actions.appendChild(element); return element;
  }
  async function post(path,body) {
    const response = await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'omit',cache:'no-store',redirect:'error'});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'The transfer could not be completed.');
    return data;
  }
  function validUser(value) {
    return value && typeof value.uid === 'string' && value.apiKey === window.NP_FIREBASE_CONFIG?.apiKey && value.appName === '[DEFAULT]' &&
      value.stsTokenManager && typeof value.stsTokenManager.refreshToken === 'string';
  }
  function firebaseDb() {
    return new Promise((resolve,reject)=>{
      const request = indexedDB.open('firebaseLocalStorageDb',1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('firebaseLocalStorage')) request.result.createObjectStore('firebaseLocalStorage',{keyPath:'fbase_key'});
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Your browser could not access saved sign-in storage.'));
      request.onblocked = () => reject(new Error('Close other Nitro Pitch tabs and try again.'));
    });
  }
  async function dbUser(mode = 'readonly', value) {
    const db = await firebaseDb();
    try {
      return await new Promise((resolve,reject)=>{
        const transaction = db.transaction('firebaseLocalStorage',mode);
        const store = transaction.objectStore('firebaseLocalStorage');
        const request = mode === 'readonly' ? store.get(authKey()) : store.put({fbase_key:authKey(),value});
        let result;
        request.onsuccess = () => { result = mode === 'readonly' ? request.result?.value || null : value; };
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = transaction.onerror = () => reject(new Error('Your browser could not save the transferred sign-in.'));
      });
    } finally { db.close(); }
  }
  async function readUser() {
    // Firebase 10.12.2 normally uses IndexedDB; include its local/session fallbacks.
    let user = null, dbError = null;
    try { user = await dbUser(); } catch (error) { dbError = error; }
    if (validUser(user)) return user;
    for (const storage of [localStorage,sessionStorage]) {
      const raw = storage.getItem(authKey());
      if (raw) { try { const parsed = JSON.parse(raw); if (validUser(parsed)) return parsed; } catch (_) {} }
    }
    // On Safari and restricted browsers IndexedDB may be unavailable. A cloud account
    // still keeps its server save, but a session that cannot be read cannot be moved.
    if (dbError) throw dbError;
    return null;
  }
  async function collect() {
    const local = {};
    for (let i=0;i<localStorage.length;i++) {
      const key = localStorage.key(i);
      if (ALLOWED.test(key)) local[key] = localStorage.getItem(key);
    }
    const user = await readUser();
    const party = sessionStorage.getItem('np-pc');
    return {version:1,local,user,party,created:Date.now()};
  }
  async function seal(payload, publicKey) {
    const pair = await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveKey']);
    const peer = await crypto.subtle.importKey('raw',unbase64(publicKey),{name:'ECDH',namedCurve:'P-256'},false,[]);
    const key = await crypto.subtle.deriveKey({name:'ECDH',public:peer},pair.privateKey,{name:'AES-GCM',length:256},false,['encrypt']);
    const bytes = encoder.encode(JSON.stringify(payload));
    if (bytes.length > MAX_PLAIN) throw new Error('This browser save is too large to transfer automatically. Your old copy is unchanged.');
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({name:'AES-GCM',iv},key,bytes);
    return JSON.stringify({publicKey:base64(new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey))),iv:base64(iv),data:base64(new Uint8Array(ciphertext))});
  }
  async function unseal(sealed, privateJwk) {
    const encrypted = JSON.parse(sealed);
    const key = await crypto.subtle.importKey('jwk',privateJwk,{name:'ECDH',namedCurve:'P-256'},false,['deriveKey']);
    const peer = await crypto.subtle.importKey('raw',unbase64(encrypted.publicKey),{name:'ECDH',namedCurve:'P-256'},false,[]);
    const aes = await crypto.subtle.deriveKey({name:'ECDH',public:peer},key,{name:'AES-GCM',length:256},false,['decrypt']);
    const plaintext = await crypto.subtle.decrypt({name:'AES-GCM',iv:unbase64(encrypted.iv)},aes,unbase64(encrypted.data));
    if (plaintext.byteLength > MAX_PLAIN) throw new Error('Invalid transfer size');
    const result = JSON.parse(new TextDecoder().decode(plaintext));
    if (result.version !== 1 || !result.local || typeof result.local !== 'object' || Array.isArray(result.local) || !Number.isFinite(result.created) || result.created > Date.now() || Date.now()-result.created > TTL) throw new Error('The transfer expired. Reopen the old address to try again.');
    if (result.user !== null && !validUser(result.user)) throw new Error('Invalid account transfer');
    return result;
  }
  function profileLabel(raw) {
    try { const p=JSON.parse(raw); return (String(p.name || 'Guest').slice(0,24)) + ' · ' + (Number.isFinite(p.xp) ? p.xp : 0) + ' XP'; } catch (_) { return 'Saved game'; }
  }
  async function importSave(payload, replace = false) {
    const previous = new Map(); let previousParty = null, partyTouched = false;
    const existingUser = await readUser();
    try {
      for (const [key,value] of Object.entries(payload.local)) {
        if (!ALLOWED.test(key) || typeof value !== 'string') throw new Error('Invalid game save');
        const prior = localStorage.getItem(key);
        if (replace || prior === null) { previous.set(key,prior); localStorage.setItem(key,value); }
      }
      if (typeof payload.party === 'string' && (replace || !sessionStorage.getItem('np-pc'))) {
        previousParty = sessionStorage.getItem('np-pc');partyTouched = true;sessionStorage.setItem('np-pc',payload.party);
      }
      if (payload.user && (!existingUser || (replace && existingUser.uid !== payload.user.uid))) {
        // Populate the exact persistence record used by the existing pinned Firebase SDK
        // before the game starts. Firebase validates/refreshes the session on startup.
        await dbUser('readwrite',payload.user);
        // Prevent an older local/session fallback from selecting a different account.
        localStorage.removeItem(authKey()); sessionStorage.removeItem(authKey());
      }
    } catch (error) {
      for (const key of previous.keys()) { try { localStorage.removeItem(key); } catch (_) {} }
      for (const [key,value] of previous) { try { if (value !== null) localStorage.setItem(key,value); } catch (_) {} }
      if (partyTouched) { try { if (previousParty === null) sessionStorage.removeItem('np-pc'); else sessionStorage.setItem('np-pc',previousParty); } catch (_) {} }
      throw error;
    }
  }
  function markComplete() {
    // Future visits through an old bookmark use the new save instead of offering
    // the unchanged legacy copy again.
    try { localStorage.setItem(COMPLETE,'1'); } catch (_) {}
    try { sessionStorage.setItem(COMPLETE,'1'); } catch (_) {}
  }
  async function finish(payload,next) {
    const currentUser = await readUser();
    const oldProfile = payload.local['np-profile'], currentProfile = localStorage.getItem('np-profile');
    const accountConflict = currentUser && payload.user && currentUser.uid !== payload.user.uid;
    const guestConflict = !currentUser && oldProfile && currentProfile && oldProfile !== currentProfile;
    if (accountConflict || guestConflict) {
      status.textContent = accountConflict ? 'This browser is already signed in to a different account on nitropitch.app. Choose which account to use.' : 'You have a save on both addresses. Choose which local save to use. The old-domain copy will stay unchanged.';
      if (guestConflict) { const p=document.createElement('p');p.textContent='New address: '+profileLabel(currentProfile)+' · Old address: '+profileLabel(oldProfile);actions.appendChild(p); }
      button('Keep the save already here',()=>{ markComplete();sessionStorage.removeItem(STATE);location.replace(NEW+next); });
      button('Bring my old save',async()=>{ try { actions.replaceChildren();status.textContent='Restoring your old save…';await importSave(payload,true);markComplete();sessionStorage.removeItem(STATE);location.replace(NEW+next); } catch (error) { showError(error); } });
      return;
    }
    await importSave(payload);
    markComplete();
    sessionStorage.removeItem(STATE);
    status.textContent = 'Your save is ready. Opening Nitro Pitch…';
    location.replace(NEW+next);
  }
  function showError(error) {
    status.textContent = error.message || 'The transfer could not finish. Your old save has not been changed.';
    actions.replaceChildren();
    button('Retry the transfer',()=>location.replace(NEW+'/__migration/start?force=1'));
    const link=document.createElement('a');link.href=NEW+'/';link.textContent='Open nitropitch.app without copying';link.style.display='block';actions.appendChild(link);
  }
  async function run() {
    if (step === 'entry') {
      if (location.origin !== OLD) throw new Error('Unexpected migration address');
      const next = safeNext(decodeURIComponent(script.dataset.next || '/')+location.hash);
      location.replace(NEW+'/__migration/start?next='+encodeURIComponent(next));return;
    }
    if (step === 'start') {
      if (location.origin !== NEW) throw new Error('Unexpected migration address');
      const next=safeNext(decodeURIComponent(script.dataset.next || '/'));
      const force=new URLSearchParams(location.search).get('force') === '1';
      if (!force && (localStorage.getItem(COMPLETE) === '1' || sessionStorage.getItem(COMPLETE) === '1')) { location.replace(NEW+next);return; }
      const pair = await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveKey']);
      const verifier=base64(crypto.getRandomValues(new Uint8Array(32)));
      const challenge=base64(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(verifier))));
      const publicKey=base64(new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey)));
      sessionStorage.setItem(STATE,JSON.stringify({verifier,privateKey:await crypto.subtle.exportKey('jwk',pair.privateKey),next,at:Date.now()}));
      location.replace(OLD+'/__migration/export?challenge='+encodeURIComponent(challenge)+'&publicKey='+encodeURIComponent(publicKey));return;
    }
    if (step === 'export') {
      if (location.origin !== OLD) throw new Error('Unexpected migration address');
      const query=new URLSearchParams(location.search),challenge=query.get('challenge'),publicKey=query.get('publicKey');
      history.replaceState(null,'','/__migration/export');
      if (!/^[A-Za-z0-9_-]{43}$/.test(challenge || '') || !/^[A-Za-z0-9_-]{87}$/.test(publicKey || '')) throw new Error('Start the move from the old game address.');
      status.textContent='Copying your saved game and sign-in securely…';
      const payload=await collect();
      const sealed=await seal(payload,publicKey);
      const {id}=await post('/__migration/store',{challenge,sealed});
      location.replace(NEW+'/__migration/finish#'+encodeURIComponent(id));return;
    }
    if (step === 'finish') {
      if (location.origin !== NEW) throw new Error('Unexpected migration address');
      const id=decodeURIComponent(location.hash.slice(1));
      history.replaceState(null,'','/__migration/finish');
      const raw=sessionStorage.getItem(STATE); if (!raw) throw new Error('This transfer must finish in the same browser tab where it started.');
      const state=JSON.parse(raw);
      if (!/^[A-Za-z0-9_-]{43}$/.test(id) || !Number.isFinite(state.at) || state.at>Date.now() || Date.now()-state.at>TTL) throw new Error('The transfer expired. Reopen the old game address to try again.');
      const {sealed}=await post('/__migration/redeem',{id,verifier:state.verifier});
      await finish(await unseal(sealed,state.privateKey),safeNext(state.next));return;
    }
    throw new Error('Unknown migration step');
  }
  try { await run(); } catch (error) { showError(error); }
})();
