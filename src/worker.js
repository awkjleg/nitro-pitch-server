// Nitro Pitch online rooms: one Durable Object per room ("lobby", "np-m-…" matches, "np-p-…" private matches).
// Players connect with a WebSocket to /ws?room=<name>&id=<player id>. The room keeps each player's presence and
// passes every change on to the others. It uses WebSocket hibernation, so a quiet room costs (almost) nothing; after
// waking, it restores socket identity records and asks clients to refresh any large presence payloads.
export { Room } from "./room.js";
import { applyGameFixes } from "./game-shell.js";
import { migrationFetch } from "./domain-migration.js";
export { DomainTransfer } from "./domain-migration.js";

// sites allowed to use the rooms (your copies of the game); anything else is refused
const ORIGIN_OK = /^https:\/\/([a-z0-9-]+\.)*bibleway\.workers\.dev$|^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const migration = await migrationFetch(req, env);
    if (migration) return migration;
    if (url.pathname === "/ws") {
      if (req.headers.get("Upgrade") !== "websocket") return new Response("Nitro Pitch rooms: WebSocket only", { status: 426 });
      const origin = req.headers.get("Origin") || "";
      if (origin !== "https://nitropitch.app" && !ORIGIN_OK.test(origin)) return new Response("Not allowed", { status: 403 });
      const room = String(url.searchParams.get("room") || "lobby").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60) || "lobby";
      return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(req);
    }
    // Transform the game shell before any browser can request its legacy ad loader.
    if (["/", "/index", "/index/", "/index.html"].includes(url.pathname)) {
      const headers = new Headers(req.headers);
      headers.delete("If-None-Match");
      headers.delete("If-Modified-Since");
      const asset = await env.ASSETS.fetch(new Request(req, { headers }));
      if (!asset.ok || !asset.headers.get("Content-Type")?.includes("text/html")) return asset;
      const gameHtml = applyGameFixes(await asset.text());
      const gameAsset = new Response(gameHtml, asset);
      const transformed = new HTMLRewriter()
        .on('script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]', {
          element(element) { element.remove(); }
        })
        .on("head", {
          element(element) {
            element.prepend('<script src="/cookie-consent.js" data-ad-client="ca-pub-3345250551146308"></script>', { html: true });
          }
        }).transform(gameAsset);
      const response = new Response(transformed.body, transformed);
      response.headers.delete("ETag");
      response.headers.delete("Content-Length");
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("X-Nitropitch-Consent", "v1");
      response.headers.set("X-Nitropitch-Build", "2026111006");
      return response;
    }
    return env.ASSETS.fetch(req);
  }
};
