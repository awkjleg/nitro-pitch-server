// Nitro Pitch online rooms: one Durable Object per room ("lobby", "np-m-…" matches, "np-p-…" private matches).
// Players connect with a WebSocket to /ws?room=<name>&id=<player id>. The room keeps each player's presence and
// passes every change on to the others. It uses WebSocket hibernation, so a quiet room costs (almost) nothing; after
// waking from hibernation it has forgotten the presences and asks each player to send theirs again ("resync").
import { DurableObject } from "cloudflare:workers";

// sites allowed to use the rooms (your copies of the game); anything else is refused
const ORIGIN_OK = /^https:\/\/([a-z0-9-]+\.)*bibleway\.workers\.dev$|^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const MAX_PLAYERS = 400, MAX_MSG = 64000;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      if (req.headers.get("Upgrade") !== "websocket") return new Response("Nitro Pitch rooms: WebSocket only", { status: 426 });
      const origin = req.headers.get("Origin") || "";
      if (!ORIGIN_OK.test(origin)) return new Response("Not allowed", { status: 403 });
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
      const transformed = new HTMLRewriter()
        .on('script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]', {
          element(element) { element.remove(); }
        })
        .on("head", {
          element(element) {
            element.prepend('<script src="/cookie-consent.js" data-ad-client="ca-pub-3345250551146308"></script>', { html: true });
          }
        }).transform(asset);
      const response = new Response(transformed.body, transformed);
      response.headers.delete("ETag");
      response.headers.delete("Content-Length");
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("X-Nitropitch-Consent", "v1");
      return response;
    }
    return env.ASSETS.fetch(req);
  }
};

const cleanId = s => String(s || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 48);

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.pres = new Map();                                   // player id -> presence (lost when the room hibernates)
    // keepalive pings are answered without waking the room
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }
  async fetch(req) {
    const id = cleanId(new URL(req.url).searchParams.get("id"));
    if (!id) return new Response("Missing id", { status: 400 });
    if (this.ctx.getWebSockets().length >= MAX_PLAYERS) return new Response("Room full", { status: 503 });
    const pair = new WebSocketPair(), [client, server] = Object.values(pair);
    for (const old of this.ctx.getWebSockets(id)) { try { old.close(4000, "replaced"); } catch {} }   // the same player reconnecting
    this.ctx.acceptWebSocket(server, [id]);
    server.serializeAttachment({ id, ok: false });          // ok: this socket has said hello
    return new Response(null, { status: 101, webSocket: client });
  }
  info(ws) { try { return ws.deserializeAttachment() || {}; } catch { return {}; } }
  send(ws, s) { try { ws.send(s); } catch {} }
  // to everyone who has said hello, except one socket
  bcast(m, except) { const s = JSON.stringify(m); for (const ws of this.ctx.getWebSockets()) if (ws !== except && this.info(ws).ok) this.send(ws, s); }
  async webSocketMessage(ws, data) {
    if (typeof data !== "string" || data.length > MAX_MSG) return;
    let m; try { m = JSON.parse(data); } catch { return; }
    if (!m || typeof m !== "object") return;
    const a = this.info(ws), id = a.id;
    if (!id) return;
    if (m.t === "hello" || m.t === "full") {
      const p = m.p && typeof m.p === "object" && !Array.isArray(m.p) ? m.p : {};
      const known = this.pres.has(id);
      this.pres.set(id, p);
      if (m.t === "hello") {
        // a newcomer gets everyone's presence; players this room forgot (it hibernated) are asked to send theirs again
        const created = this.ctx.getWebSockets().filter(w => w !== ws && this.info(w).ok).length === 0;
        const members = {};
        for (const [k, v] of this.pres) if (k !== id) members[k] = v;
        this.send(ws, JSON.stringify({ t: "state", you: id, created, members }));
        if (!a.ok) ws.serializeAttachment({ id, ok: true });
        for (const w of this.ctx.getWebSockets()) { const b = this.info(w); if (w !== ws && b.ok && !this.pres.has(b.id)) this.send(w, '{"t":"resync"}'); }
        this.bcast({ t: known ? "f" : "j", id, p }, ws);
      } else this.bcast({ t: "f", id, p }, ws);             // a resync answer: replaces what the others have
      return;
    }
    if (m.t === "p" && m.p && typeof m.p === "object") {
      if (!this.pres.has(id)) { this.send(ws, '{"t":"resync"}'); return; }   // forgotten while hibernating
      const cur = this.pres.get(id);
      for (const k in m.p) { if (m.p[k] === null) delete cur[k]; else cur[k] = m.p[k]; }
      this.bcast({ t: "p", id, p: m.p }, ws);
      return;
    }
    if (m.t === "bye") { try { ws.close(1000, "bye"); } catch {} this.gone(ws); }
  }
  gone(ws) {
    const id = this.info(ws).id;
    if (!id) return;
    // still connected on another socket (a reconnect replaced this one): not gone
    if (this.ctx.getWebSockets(id).some(w => w !== ws && w.readyState === 1)) return;
    const had = this.pres.delete(id);
    if (had || this.info(ws).ok) this.bcast({ t: "l", id }, ws);
  }
  async webSocketClose(ws) { this.gone(ws); }
  async webSocketError(ws) { this.gone(ws); }
}
