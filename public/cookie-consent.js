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
    document.getElementById('np-cookie-banner')?.remove();
    document.getElementById('np-cookie-dialog')?.close();
    updateStatus(saved ? null : 'Choice applied for this visit. Your browser prevented saving it.');
    // Removing a script cannot stop code it has already executed. Reload on withdrawal.
    if (!allowed && (previouslyAllowed || loaded)) { location.reload(); return; }
    loadAds();
  }
  function addActions(container) {
    for (const [label, allowed] of [['Reject advertising', false], ['Allow advertising', true]]) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = label;
      button.addEventListener('click', () => save(allowed));
      container.appendChild(button);
    }
  }
  function showSettings() {
    let dialog = document.getElementById('np-cookie-dialog');
    if (!dialog) {
      dialog = document.createElement('dialog'); dialog.id = 'np-cookie-dialog';
      dialog.setAttribute('aria-labelledby', 'np-cookie-title');
      dialog.innerHTML = '<h2 id="np-cookie-title">Advertising cookies</h2><p>Allow Google AdSense and its advertising measurement technologies? You can reject advertising and keep playing. Game saves, settings, and sign-in storage are separate.</p><p><a href="/cookies.html">Read the cookies policy</a></p><div class="np-cookie-actions"></div><button type="button" data-close>Close without changes</button>';
      addActions(dialog.querySelector('.np-cookie-actions'));
      dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
      document.body.appendChild(dialog);
    }
    if (!dialog.open) dialog.showModal();
  }
  function init() {
    const style = document.createElement('style');
    style.textContent = '#np-cookie-banner,#np-cookie-dialog{box-sizing:border-box;background:#0c1526;color:#edf4ff;border:1px solid #60728f;border-radius:12px;padding:22px;font:16px/1.6 "Segoe UI",sans-serif;box-shadow:0 15px 50px #0008}#np-cookie-banner{position:fixed;bottom:16px;left:16px;right:16px;max-width:650px;max-height:80vh;overflow:auto;z-index:999998}#np-cookie-dialog{max-width:580px;width:calc(100% - 32px);max-height:85vh;overflow:auto}#np-cookie-dialog::backdrop{background:#03080ec9}#np-cookie-banner h2,#np-cookie-dialog h2{font-size:22px;margin:0 0 10px;color:#ffd451}#np-cookie-banner a,#np-cookie-dialog a{color:#91c5ff}#np-cookie-banner button,#np-cookie-dialog button{font:700 15px/1.4 "Segoe UI",sans-serif;background:#182942;color:#edf4ff;border:1px solid #91a8c8;border-radius:7px;padding:12px 16px;cursor:pointer;min-height:44px}#np-cookie-banner button:focus-visible,#np-cookie-dialog button:focus-visible{outline:3px solid #ffd451;outline-offset:3px}.np-cookie-actions{display:flex;gap:12px;flex-wrap:wrap;margin:14px 0}';
    document.head.appendChild(style);
    document.querySelectorAll('[data-cookie-settings]').forEach(el => el.addEventListener('click', showSettings));
    updateStatus();
    if (!choice && client) {
      const banner = document.createElement('aside'); banner.id = 'np-cookie-banner';
      banner.setAttribute('aria-label', 'Advertising cookie choices');
      banner.innerHTML = '<h2>Your advertising choice</h2><p>Allow Google AdSense advertising cookies and measurement? Advertising stays off until you allow it. You can reject and still play.</p><a href="/cookies.html#choices" target="_blank" rel="noopener">Cookies policy &amp; settings</a><div class="np-cookie-actions"></div>';
      addActions(banner.querySelector('.np-cookie-actions')); document.body.appendChild(banner);
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
