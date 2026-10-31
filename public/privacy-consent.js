(function () {
  const STORAGE_BASE = 'nitropitch_terms_accepted';
  const GLOBAL_KEY = STORAGE_BASE + '_global';

  function getCurrentUid() {
    try {
      if (window.firebase && firebase.auth && firebase.auth().currentUser) {
        return firebase.auth().currentUser.uid || null;
      }
    } catch (e) {}
    return null;
  }

  function alreadyAccepted(uid) {
    if (uid) {
      try { return localStorage.getItem(STORAGE_BASE + ':' + uid) === '1'; } catch (_) { return false; }
    }
    try { return localStorage.getItem(GLOBAL_KEY) === '1'; } catch (_) { return false; }
  }

  function saveAccepted(uid) {
    try {
      if (uid) {
        localStorage.setItem(STORAGE_BASE + ':' + uid, '1');
      }
      localStorage.setItem(GLOBAL_KEY, '1');
    } catch (_) {}
  }

  function showConsentModal() {
    if (document.getElementById('nitropitch-terms-modal')) return;

    const overlay = document.createElement('div');
    overlay.id = 'nitropitch-terms-modal';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '999999';
    overlay.style.background = 'rgba(3,8,14,.76)';
    overlay.style.display = 'grid';
    overlay.style.placeItems = 'center';
    overlay.style.padding = '20px';

    const modal = document.createElement('dialog');
    modal.setAttribute('aria-labelledby', 'nitropitch-terms-title');
    modal.style.maxHeight = '85vh';
    modal.style.overflowY = 'auto';
    modal.style.width = 'min(760px, 92vw)';
    modal.style.background = 'linear-gradient(180deg, rgba(10,18,34,.98), rgba(8,12,22,.98))';
    modal.style.border = '1px solid rgba(150,180,255,.24)';
    modal.style.borderRadius = '18px';
    modal.style.boxShadow = '0 20px 60px rgba(0,0,0,.52)';
    modal.style.padding = '26px 24px 20px';
    modal.style.color = '#edf4ff';
    modal.style.fontFamily = 'Chakra Petch, Segoe UI, sans-serif';

    modal.innerHTML = [
      '<div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#ffd451;font-weight:700;margin-bottom:10px;">Before you play</div>',
      '<h2 id="nitropitch-terms-title" style="margin:0 0 12px;color:#fff;font-family:Russo One,Arial Black,Impact,sans-serif;font-weight:400;font-size:clamp(1.8rem,3vw,2.6rem);letter-spacing:.05em;text-transform:uppercase;line-height:1.1;">Terms &amp; Privacy Notice</h2>',
      '<p style="margin:0 0 12px;line-height:1.6;">Please read the <a href="/terms-and-conditions.html" target="_blank" rel="noopener" style="color:#91c5ff">Terms &amp; Conditions</a> and <a href="/privacy-policy.html" target="_blank" rel="noopener" style="color:#91c5ff">Privacy Policy</a> before playing.</p>',
      '<p style="margin:0 0 18px;line-height:1.6;">Terms acknowledgment does not allow advertising cookies. Make your advertising choice separately, and change it on the <a href="/cookies.html#choices" target="_blank" rel="noopener" style="color:#91c5ff">cookies page</a>.</p>',
      '<div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:flex-end;">',
      '  <button id="nitropitch-accept-btn" style="background:linear-gradient(135deg,#ffd451,#ff8a1e);color:#1b0d00;border:none;border-radius:12px;padding:14px 18px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;">I Agree</button>',
      '  <button id="nitropitch-later-btn" style="background:transparent;color:#edf4ff;border:1px solid rgba(255,255,255,.18);border-radius:12px;padding:14px 18px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;">Later</button>',
      '</div>'
    ].join('');

    const acceptBtn = modal.querySelector('#nitropitch-accept-btn');
    const laterBtn = modal.querySelector('#nitropitch-later-btn');

    acceptBtn.addEventListener('click', function () {
      const uid = getCurrentUid();
      saveAccepted(uid);
      modal.close();
      overlay.remove();
    });

    laterBtn.addEventListener('click', function () {
      modal.close();
      overlay.remove();
    });

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    modal.addEventListener('cancel', () => overlay.remove());
    modal.showModal();
  }

  function showConsentIfNeeded() {
    if (/\/(privacy-policy|terms-and-conditions|cookies)\.html$/.test(window.location.pathname)) return;
    if (alreadyAccepted(getCurrentUid())) return;

    // One prompt per person. This appears again only if they have not accepted yet.
    setTimeout(function () {
      if (!document.getElementById('nitropitch-terms-modal')) {
        showConsentModal();
      }
    }, 350);
  }

  function addPolicyLinks() {
    const home = document.getElementById('home');
    if (!home || document.getElementById('np-policy-links')) return;
    const nav = document.createElement('nav');
    nav.id = 'np-policy-links';
    nav.setAttribute('aria-label', 'Policies');
    nav.style.cssText = 'position:absolute;bottom:8px;left:20px;z-index:5;display:flex;flex-wrap:wrap;gap:16px;padding:10px;background:rgba(6,10,20,.92);border-radius:6px;font:14px/1.5 Segoe UI,sans-serif';
    for (const [label, href] of [['Terms', '/terms-and-conditions.html'], ['Privacy', '/privacy-policy.html'], ['Cookies', '/cookies.html']]) {
      const link = document.createElement('a');
      link.textContent = label; link.href = href;
      link.target = '_blank'; link.rel = 'noopener';
      link.style.color = '#b8d7ff';
      nav.appendChild(link);
    }
    home.appendChild(nav);
  }

  function initConsentTracking() {
    addPolicyLinks();
    if (window.firebase && firebase.auth) {
      try {
        firebase.auth().onAuthStateChanged(function () {
          showConsentIfNeeded();
        });
      } catch (e) {
        showConsentIfNeeded();
      }
      return;
    }

    showConsentIfNeeded();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initConsentTracking, { once: true });
  } else {
    initConsentTracking();
  }
})();
