// Nitro Pitch notifications (Web Push). Registered by the game only after the player turns notifications on.
// It does nothing else: no caching, no offline copy, no network interception.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  const title = String(d.title || "Nitro Pitch").slice(0, 80);
  e.waitUntil(self.registration.showNotification(title, {
    body: String(d.body || "").slice(0, 200),
    tag: String(d.tag || "np-update").slice(0, 64),
    icon: "/nitro-pitch-icon.png",
    badge: "/nitro-pitch-icon-48.png",
    data: { url: "https://nitropitch.app/" }
  }));
});

// clicking it opens Nitro Pitch: an open game tab is brought forward (never reloaded mid-match), otherwise a new one
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = "https://nitropitch.app/";
  e.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of tabs) {
      try { if (new URL(c.url).origin === new URL(url).origin && "focus" in c) return await c.focus(); } catch {}
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});

// the browser replaced the subscription (expired keys): save the new one in place of the old one
const keyBytes = k => Uint8Array.from(atob(k.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((k.length + 3) % 4)), c => c.charCodeAt(0));
self.addEventListener("pushsubscriptionchange", e => {
  const old = e.oldSubscription;
  e.waitUntil((async () => {
    try {
      const { key } = await (await fetch("/api/push/key")).json();
      if (!key) return;
      const sub = e.newSubscription || await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
      await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...sub.toJSON(), old: old && old.endpoint || "" }) });
    } catch {}
  })());
});
