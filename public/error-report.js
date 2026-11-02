// Nitro Pitch: send game errors to the site's server so the admin sees bugs before players report them.
// Only the error message, where it happened, the game build and the browser name are sent. No account data.
(() => {
  'use strict';
  const seen = new Set(); let sent = 0;
  const noise = /ResizeObserver loop|^Script error\.?$|chrome-extension:|moz-extension:|safari-extension:|adsbygoogle|googlesyndication|NetworkError|Failed to fetch|Load failed/i;
  function send(msg, stack) {
    msg = String(msg || '').slice(0, 400); stack = String(stack || '').slice(0, 2000);
    if (!msg || noise.test(msg) || noise.test(stack) || sent >= 8) return;
    const key = msg + '|' + stack.split('\n')[1]; if (seen.has(key)) return; seen.add(key); sent++;
    const body = JSON.stringify({ msg, stack, url: location.pathname + location.search.slice(0, 40), build: String(window.npBuild || ''), ua: navigator.userAgent.slice(0, 200) });
    try { fetch('/api/errors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {}); } catch (_) {}
  }
  addEventListener('error', e => { if (e && e.message) send(e.message, e.error && e.error.stack || (e.filename ? e.filename + ':' + e.lineno + ':' + e.colno : '')); });
  addEventListener('unhandledrejection', e => { const r = e && e.reason; if (r && (r.stack || r.message)) send(r.message || String(r), r.stack || ''); });
  window.npReportError = send;
})();
