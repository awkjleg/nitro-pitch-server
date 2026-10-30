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
      return localStorage.getItem(STORAGE_BASE + ':' + uid) === '1';
    }
    return localStorage.getItem(GLOBAL_KEY) === '1';
  }

  function saveAccepted(uid) {
    if (uid) {
      localStorage.setItem(STORAGE_BASE + ':' + uid, '1');
    }
    localStorage.setItem(GLOBAL_KEY, '1');
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

    const modal = document.createElement('div');
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
      '<h2 style="margin:0 0 12px;color:#fff;font-family:"Russo One","Arial Black",Impact,sans-serif;font-weight:400;font-size:clamp(1.8rem,3vw,2.6rem);letter-spacing:.05em;text-transform:uppercase;line-height:1.1;">Terms & Privacy Consent</h2>',
      '<p style="margin:0 0 12px;line-height:1.6;">By continuing, you agree to Nitro Pitch’s <a href="/privacy-policy.html" target="_blank" style="color:#2e8bff;text-decoration:none;">Privacy Policy</a> and the game terms.</p>',
      '<p style="margin:0 0 18px;line-height:1.6;">This game may use cookies, analytics, and advertising technologies such as Google AdSense. Google may use cookies to personalize or measure ads.</p>',
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
      overlay.remove();
    });

    laterBtn.addEventListener('click', function () {
      overlay.remove();
    });

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  function showConsentIfNeeded() {
    if (window.location.pathname.indexOf('/privacy-policy.html') !== -1) return;
    if (alreadyAccepted(getCurrentUid())) return;

    // One prompt per person. This appears again only if they have not accepted yet.
    setTimeout(function () {
      if (!document.getElementById('nitropitch-terms-modal')) {
        showConsentModal();
      }
    }, 350);
  }

  function initConsentTracking() {
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
