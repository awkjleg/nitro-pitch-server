(function () {
  'use strict';
  const KEY = 'np-cookie-choice-v1';
  const TTL = 180 * 24 * 60 * 60 * 1000;
  const client = document.currentScript && document.currentScript.dataset.adClient;
  let choice = readChoice(), loaded = false;

  function readChoice() {
    try {
      const value = JSON.parse(localStorage.getItem(KEY));
      if (value && value.version === 1 && typeof value.advertising === 'boolean' &&
          Number.isFinite(value.at) && value.at <= Date.now() && Date.now() - value.at < TTL) return value;
    } catch (_) {}
    return null;
  }
  function loadAds() {
    if (!client || loaded || !choice || !choice.advertising) return;
    loaded = true;
    const script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(client);
    script.dataset.npAdvertising = 'true';
    document.head.appendChild(script);
  }
  function updateStatus(message) {
    const status = document.getElementById('cookie-choice-status');
    if (status) status.textContent = message || (choice ? 'Current choice: advertising ' + (choice.advertising ? 'allowed.' : 'rejected.') : 'No advertising choice saved. Advertising is off.');
  }
  function save(allowed) {
    const previouslyAllowed = !!(choice && choice.advertising);
    choice = {version: 1, advertising: allowed, at: Date.now()};
    let saved = true;
    try { localStorage.setItem(KEY, JSON.stringify(choice)); } catch (_) { saved = false; }
    document.getElementById('np-cookie-dialog')?.close();
    updateStatus(saved ? null : 'Choice applied for this visit. Your browser prevented saving it.');
    // Removing a script cannot stop code it has already executed. Reload on withdrawal.
    if (!allowed && (previouslyAllowed || loaded)) { location.reload(); return; }
    loadAds();
  }
  function addActions(container) {
    for (const [label, allowed] of [['Reject advertising', false], ['Allow advertising', true]]) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = label; if (allowed) button.dataset.allow = '';
      button.addEventListener('click', () => save(allowed));
      container.appendChild(button);
    }
  }
  function showSettings() {
    let dialog = document.getElementById('np-cookie-dialog');
    if (!dialog) {
      dialog = document.createElement('dialog'); dialog.id = 'np-cookie-dialog';
      dialog.setAttribute('aria-labelledby', 'np-cookie-title');
      dialog.innerHTML = '<div class="np-eyebrow">Your choice</div><h2 id="np-cookie-title">Advertising cookies</h2><p>Allow Google AdSense and its advertising measurement technologies? You can reject advertising and keep playing. Game saves, settings, and sign-in storage are separate.</p><p><a href="/cookies.html">Read the cookies policy</a></p><div class="np-cookie-actions"></div><button type="button" data-close>Close without changes</button>';
      addActions(dialog.querySelector('.np-cookie-actions'));
      dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
      document.body.appendChild(dialog);
    }
    if (!dialog.open) dialog.showModal();
  }
  function init() {
    const style = document.createElement('style');
    style.textContent = '#np-cookie-dialog{box-sizing:border-box;margin:auto;max-width:620px;width:calc(100% - 32px);max-height:85vh;overflow:auto;background:linear-gradient(180deg,rgba(10,18,34,.98),rgba(8,12,22,.98));color:#edf4ff;border:1px solid rgba(150,180,255,.24);border-radius:18px;padding:26px 24px 20px;font:16px/1.6 "Chakra Petch","Segoe UI",sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.52)}#np-cookie-dialog::backdrop{background:rgba(3,8,14,.76)}#np-cookie-dialog .np-eyebrow{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#ffd451;font-weight:700;margin-bottom:10px}#np-cookie-dialog h2{margin:0 0 12px;color:#fff;font:400 clamp(1.8rem,3vw,2.6rem)/1.1 "Russo One","Arial Black",Impact,sans-serif;letter-spacing:.05em;text-transform:uppercase}#np-cookie-dialog p{margin:0 0 12px}#np-cookie-dialog a{color:#91c5ff}#np-cookie-dialog button{font:700 14px/1.2 "Chakra Petch","Segoe UI",sans-serif;letter-spacing:.1em;text-transform:uppercase;background:rgba(255,255,255,.04);color:#edf4ff;border:1px solid rgba(150,180,255,.3);border-radius:12px;padding:14px 18px;cursor:pointer;min-height:48px;transition:filter .15s,background .15s}#np-cookie-dialog button:hover{background:rgba(255,255,255,.1)}#np-cookie-dialog button[data-allow]{background:linear-gradient(180deg,#ffd451,#ff9a1e);color:#111;border-color:transparent}#np-cookie-dialog button[data-allow]:hover{filter:brightness(1.08)}#np-cookie-dialog button[data-close]{background:none;border-color:transparent;color:#b0bdd6;padding:10px 4px;min-height:0;font-size:12px}#np-cookie-dialog button:focus-visible{outline:3px solid #ffd451;outline-offset:3px}.np-cookie-actions{display:flex;gap:12px;flex-wrap:wrap;justify-content:flex-end;margin:18px 0 6px}';
    document.head.appendChild(style);
    document.querySelectorAll('[data-cookie-settings]').forEach(el => el.addEventListener('click', showSettings));
    updateStatus();
    if (!choice && client) {
      const prompt = () => {
        if (choice) return;
        // Present one centered dialog at a time, after the terms notice is closed.
        if (document.querySelector('dialog[open]')) { setTimeout(prompt,250); return; }
        showSettings();
      };
      setTimeout(prompt,600);
    }
    // Recheck when a suspended/backgrounded tab becomes visible.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      const current = readChoice();
      if (loaded && (!current || !current.advertising)) location.reload();
    });
  }
  window.addEventListener('storage', event => {
    if (event.key === KEY || event.key === null) location.reload();
  });
  loadAds();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once: true}); else init();
})();
