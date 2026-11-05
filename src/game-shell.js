import clanEmblems from "./clan-emblems.txt";
import mobileMenus from "./mobile-menus.txt";
import touchInput from "./touch-input.txt";
import phoneControls from "./phone-controls.txt";
import matchExperience from "./match-experience.txt";
import secureProgress from "./secure-progress.txt";
import gamePolish from "./game-polish.txt";
import drivingUpdates from "./driving-updates.txt";
import playerFeatures from "./player-features.txt";
import inviteAlerts from "./invite-alerts.txt";
import seasonUpdate from "./season-update.txt";
import seasonRewards from "./season-rewards.txt";
import seasonTools from "./season-tools.txt";
import snowdrift from "./snowdrift.txt";
import paintsUi from "./paints.txt";
import adminMmr from "./admin-mmr.txt";
import menuMusic from "./menu-music.txt";
import moderationUi from "./moderation.txt";
import privateMessages from "./messages.txt";
import menuLayout from "./menu-layout.txt";
import {moderationScript} from "./moderation.js";
import sideswipe from "./sideswipe.txt";
import sideswipeMenu from "./sideswipe-menu.txt";
// The original game is a single prebuilt HTML asset. Keep the small, reviewed
// compatibility changes here while the asset stays unchanged. Test these anchors
// whenever replacing public/index.html with a new game build.
const patches = [
  {
    "before": "  partyFollowInfo = /^np-[pf]-/.test(room) && isPartyLeader() ? {",
    "after": "  partyFollowInfo = /^np-[pf]-/.test(room) && (isPartyLeader() || partyState().size > 1) ? {"
  },
  {
    "before": "s.tag.position.y = entries.length > 1 ? 2.45 : 2.2;",
    "after": "s.tag.position.y = (entries.length > 1 ? 2.95 + (e.z < -1 ? 0.95 : 0) : 2.75) + (CARS[e.body] && (CARS[e.body].tung || CARS[e.body].turtle) ? 0.35 : 0);"
  },
  {
    "before": "  if (jump < 3 * BR) ball.off.add(_t.subVectors(ball.p, np)); else ball.off.set(0, 0, 0);\n  if (ball.off.length() > BR) ball.off.setLength(BR);",
    "after": "  // corrections from the host glide in over a moment instead of the ball jumping (only a real teleport snaps)\n  if (jump < 10 * BR) ball.off.add(_t.subVectors(ball.p, np)); else ball.off.set(0, 0, 0);\n  if (ball.off.length() > 4 * BR) ball.off.setLength(4 * BR);"
  },
  {
    "before": "        moveBallTo(new V3(pr.h.p[0], pr.h.p[1], pr.h.p[2]).addScaledVector(nv, age), nv);",
    "after": "        // a 50/50 (both touch at once, kickoffs especially): mix the two hits where the ball is, instead of the later\n        // message replacing the earlier touch and the ball jumping to where the other player sent it\n        const lt = touches.length ? touches[touches.length - 1] : null;\n        if (lt && lt.key !== p.peer && nowS() - lt.t < 0.25) { const diff = _t.subVectors(nv, ball.v).length(); nv.add(ball.v).multiplyScalar(0.5); nv.y += Math.min(diff * 0.2, 12); moveBallTo(ball.p.clone(), nv); }\n        else moveBallTo(new V3(pr.h.p[0], pr.h.p[1], pr.h.p[2]).addScaledVector(nv, age), nv);"
  },
  {
    "before": "        s.car.g.position.y = 0.24 + RIDE + (e.garage ? 0 : Math.sin(now * 2 + n) * 0.03);",
    "after": "        s.car.g.position.y = 0.24 + RIDE + (e.garage ? 0 : Math.sin(now * 2 + n) * 0.03);\n        s.car.g.scale.setScalar(e.garage ? 1 : 1.3);   // the main menu shows the cars bigger"
  },
  {
    "before": "        if (s.tag) { const k = entries.length > 1 ? 3.1 : 2.3;",
    "after": "        if (s.tag) { const k = entries.length > 1 ? 2.45 : 2.3;"
  },
  {
    "before": "  entries.forEach((e, k) => { const side = k === 0 ? 0 : (k % 2 ? 1 : -1), step = Math.ceil(k / 2); e.x = side * step * 3.7; e.z = -step * 0.9; e.face = -side * 0.5; if (e.me) e.yaw = 0.5 + t * 0.35; });",
    "after": "  entries.forEach((e, k) => { const side = k === 0 ? 0 : (k % 2 ? 1 : -1), step = Math.ceil(k / 2); const S = [[0, 0], [2.4, -0.5], [-2.4, -0.5], [1.2, -2.3], [-1.2, -2.3], [3.6, -2.3]][k] || [side * step * 2.4, -2.3]; e.x = S[0]; e.z = S[1]; e.face = -side * 0.5; if (e.me) e.yaw = 0.5 + t * 0.35; });"
  },
  {
    "before": "          toast(\"Following \" + L.name + \" into \" + privInfo.name);\n          joinRoom(pf.rm, { joiner: true });",
    "after": "          toast(\"Following \" + L.name + \" into \" + privInfo.name);\n          if (mode !== \"menu\") leaveToMenu(true);\n          joinRoom(pf.rm, { joiner: true });"
  },
  {
    "before": "      } else if (pf && typeof pf.rm === \"string\" && /^np-p-[a-z0-9]{1,16}$/.test(pf.rm) && fin(pf.t) && mode === \"menu\") {",
    "after": "      } else if (pf && typeof pf.rm === \"string\" && /^np-p-[a-z0-9]{1,16}$/.test(pf.rm) && fin(pf.t) && (mode === \"menu\" || freePlay)) {   // (from the menus or from party free play: no password needed, you follow your leader)"
  },
  {
    "before": "\"You have nothing to trade yet. Drop items (from drops) can be traded.\"",
    "after": "\"You have nothing to trade yet. Drop items, painted cars and items the admin gave you can be traded.\""
  },
  {
    "before": "const tradeable = () => { const out = []; for (const [kind, list] of DROP_KINDS) list.forEach((it, i) => it.drop && owns(kind, i) && out.push([kind, i])); return out; };",
    "after": "// tradeable: drop items, painted cars and anything you own only because it was given to you (the server checks the same:\n// not admin designs, event or clan items, or items your level / rank would unlock anyway)\nfunction npTradeOK(kind, i) {\n  const it = listOf(kind)[i];\n  if (!it || it.admin || it.ev || it.clan || it.lead || it.none || !owns(kind, i)) return false;\n  if (it.drop || it.painted) return true;\n  const own = profile.own[kind]; profile.own[kind] = own.filter(v => v !== i);\n  try { return lockOf(kind, i) !== \"\"; } finally { profile.own[kind] = own; }\n}\nconst tradeable = () => { const out = []; for (const [kind] of GKINDS) (listOf(kind) || []).forEach((it, i) => npTradeOK(kind, i) && out.push([kind, i])); return out; };"
  },
  {
    "before": "  for (const [l, rr] of r.drops || []) out.push(\"Level \" + l + \" drop! Unlocked a \" + RARITIES[rr][0] + \" Drop: open it in Nitro Pass > Drops.\");",
    "after": "  for (const [l, rr] of r.drops || []) out.push(\"Level \" + l + \" drop! Unlocked a \" + RARITIES[rr][0] + \" Drop: open it in Nitro Pass > Drops.\");\n  for (const [why, rr] of r.extraDrops || []) out.push(why + \" You got a \" + RARITIES[rr][0] + \" Drop: open it in Nitro Pass > Drops.\");"
  },
  {
    "before": "      info.append(h(\"b\", \"\", questText(x)), h(\"small\", \"\", \"+\" + x.xp + \" XP \u00b7 +\" + x.px + \" pass XP\"));",
    "after": "      info.append(h(\"b\", \"\", questText(x)), h(\"small\", \"\", \"+\" + x.xp + \" XP \u00b7 +\" + x.px + \" pass XP \u00b7 \" + RARITIES[npQuestDrop(x, weekly)][0] + \" Drop\"));"
  },
  {
    "before": "const questText = q => QUEST_KINDS[q.k].t(q.t);",
    "after": "const questText = q => QUEST_KINDS[q.k].t(q.t);\n// the drop a quest gives (the server works it out the same way, src/quest-drops.js): harder quests give better drops\nfunction npQuestDrop(q, weekly) { const K = QUEST_KINDS[q.k]; if (!K) return 2; const [a, b] = weekly ? K.w : K.d, f = b > a ? (q.t - a) / (b - a) : 0.5; return weekly ? (f < 0.34 ? 3 : f < 0.67 ? 4 : 5) : (f < 0.5 ? 2 : 3); }"
  },
  {
    "before": "    h(\"div\", \"note\", \"Quests count in online matches and matches against bots (not free play or training). Every quest also gives pass XP, and you can reroll one daily quest a day.\"));",
    "after": "    h(\"div\", \"note\", \"Quests count in online matches and matches against bots (not free play or training). Every quest gives pass XP and a drop (harder quests give better drops), and you can reroll one daily quest a day. Any match can also give a lucky drop.\"));"
  },
  {
    "before": "        uv.push(side ? 1 - u : u, v);",
    "after": "        uv.push(side && key === \"np\" ? 1 - u : u, v);   // real flags: the stars / emblem stay by the pole on both sides (only the text flag reads the other way)"
  },
  {
    "before": "})();\n\n// Nitro Pitch: online rooms through your own Cloudflare server (server/src/worker.js), the same \"room\" interface as\n// peer-room.js. Players connect to the server with a WebSocket, which works on networks that block peer-to-peer\n// connections (school and work networks). If the server can't be reached when the page opens (not set up yet, down, or\n// over its daily free limit), the game uses peer-room.js instead.\n// The server's address: window.NP_ROOM_SERVER in account-config.js (wss://\u2026/ws); \"\" turns the server off. Add ?p2p=1 to\n// the page address to skip the server.\n(() => {\n  const P2P = window.claude && window.claude.__np ? window.claude : null;      // peer-room.js (null inside Claude)\n  if (!P2P || typeof WebSocket !== \"function\") return;\n  const DEFAULT_URL = \"wss://nitropitch.bibleway.workers.dev/ws\";\n  // the lobby falls back to peer-to-peer only if the server can't be reached: no connection within OPEN_WAIT, or it\n  // connected but never sent the room (STATE_WAIT; generous, a slow device can be busy loading the game meanwhile)\n  const OPEN_WAIT = 8000, STATE_WAIT = 30000;\n  const PING = 10000, PONG_WAIT = 7000;           // keepalive (answered by the server without waking the room)\n  const clone = o => JSON.parse(JSON.stringify(o));\n  const applyPatch = (dst, p) => { for (const k in p) { if (p[k] === null) delete dst[k]; else dst[k] = p[k]; } return dst; };\n  const rnd = () => Math.random().toString(36).slice(2, 10);\n  const ME = \"s\" + rnd() + rnd().slice(0, 4);     // this tab's id in every room\n  const serverUrl = () => { const v = window.NP_ROOM_SERVER; return v === \"\" ? \"\" : typeof v === \"string\" ? v : DEFAULT_URL; };\n\n  class Room {\n    constructor(name, soft) {\n      this.name = name; this.soft = !!soft; this.me = ME;\n      this.pres = {}; this.sent = {}; this.others = new Map();\n      this.cbs = []; this.connCbs = []; this.snap = Object.freeze([]);\n      this.ws = null; this.isConnected = false; this.closed = false; this.created = undefined; this.tries = 0;\n      this.opened = new Promise((res, rej) => { this.openRes = res; this.openRej = rej; }); this.opened.catch(() => {});\n      this.openDone = false;\n      this.rebuild();\n      this.connect();\n    }\n    rebuild() {\n      const list = [Object.freeze({ peer: this.me, sameTab: true, isMe: true, kind: \"viewer\", guest: false, by: null, presence: Object.freeze(clone(this.pres)), updatedAt: Date.now() })];\n      for (const [id, e] of this.others) list.push(Object.freeze({ peer: id, sameTab: false, isMe: false, kind: \"viewer\", guest: false, by: null, presence: e.presence, updatedAt: e.updatedAt }));\n      this.snap = Object.freeze(list);\n    }\n    fire(joined = [], left = [], updated = []) { for (const f of this.cbs) { try { f({ peers: this.snap, joined, left, updated }); } catch (e) { console.error(e); } } }\n    entry(id) { return this.snap.find(x => x.peer === id); }\n    setConnected(c) { if (c === this.isConnected) return; this.isConnected = c; for (const f of this.connCbs) { try { f(c); } catch {} } }\n    upsert(id, p, full) {\n      if (id === this.me) return;\n      const prev = this.others.get(id);\n      this.others.set(id, { presence: Object.freeze(full ? clone(p) : applyPatch(prev ? clone(prev.presence) : {}, p)), updatedAt: Date.now() });\n      this.rebuild();\n      if (prev) this.fire([], [], [this.entry(id)]); else this.fire([this.entry(id)]);\n    }\n    remove(id) {\n      const prev = this.others.get(id); if (!prev) return;\n      this.others.delete(id); this.rebuild();\n      this.fire([], [Object.freeze({ peer: id, sameTab: false, isMe: false, kind: \"viewer\", guest: false, by: null, presence: prev.presence, updatedAt: prev.updatedAt })]);\n    }\n    connect() {\n      if (this.closed) return;\n      let ws;\n      try { ws = new WebSocket(serverUrl() + \"?room=\" + encodeURIComponent(this.name) + \"&id=\" + ME); } catch { this.lost(null); return; }\n      this.ws = ws; let pongT = 0;\n      const giveUp = () => { if (!this.openDone) { this.openDone = true; this.openRej({ code: \"network\" }); this.leave(); } };\n      let first = setTimeout(giveUp, OPEN_WAIT);\n      ws.onopen = () => { clearTimeout(first); first = setTimeout(giveUp, STATE_WAIT); ws.send(JSON.stringify({ t: \"hello\", p: this.pres })); };\n      ws.onmessage = e => {\n        if (e.data === \"pong\") { clearTimeout(pongT); pongT = 0; return; }\n        let m; try { m = JSON.parse(e.data); } catch { return; }\n        if (!m || typeof m !== \"object\") return;\n        if (m.t === \"state\") {\n          clearTimeout(first); this.tries = 0;\n          const keep = new Set(Object.keys(m.members || {}));\n          for (const id of [...this.others.keys()]) if (!keep.has(id)) this.remove(id);\n          for (const [id, p] of Object.entries(m.members || {})) if (p && typeof p === \"object\") this.upsert(id, p, true);\n          if (this.created === undefined) this.created = !!m.created;\n          this.setConnected(true);\n          if (!this.openDone) { this.openDone = true; this.openRes(this); }\n          return;\n        }\n        if (typeof m.id === \"string\" && m.id) {\n          if ((m.t === \"j\" || m.t === \"f\") && m.p && typeof m.p === \"object\") this.upsert(m.id, m.p, true);\n          else if (m.t === \"p\" && m.p && typeof m.p === \"object\") this.upsert(m.id, m.p, !this.others.has(m.id));\n          else if (m.t === \"l\") this.remove(m.id);\n          return;\n        }\n        if (m.t === \"resync\") ws.send(JSON.stringify({ t: \"full\", p: this.pres }));   // the room forgot us while it slept\n      };\n      ws.onclose = ws.onerror = () => { clearTimeout(first); clearInterval(ws._ping); clearTimeout(pongT); if (this.ws === ws) { if (!this.openDone) giveUp(); else this.lost(ws); } };\n      ws._ping = setInterval(() => {\n        if (ws.readyState !== 1) return;\n        try { ws.send(\"ping\"); } catch {}\n        if (!pongT) pongT = setTimeout(() => { try { ws.close(); } catch {} }, PONG_WAIT);   // no answer: the link is dead\n      }, PING);\n    }\n    lost(ws) {\n      if (ws && this.ws !== ws) return;\n      this.ws = null; this.setConnected(false);\n      if (this.closed || !this.openDone) return;                  // (still opening: the first-answer timer decides)\n      const ms = Math.min(8000, 800 * 2 ** this.tries++) + Math.random() * 400;\n      clearTimeout(this.retryT); this.retryT = setTimeout(() => this.connect(), ms);\n    }\n    wake() { if (!this.closed && !this.ws) { clearTimeout(this.retryT); this.connect(); } }\n    // ---------- the interface the game uses (same as peer-room.js) ----------\n    async presence(patch) {\n      if (!patch || typeof patch !== \"object\") return;\n      const out = {}; let n = 0;\n      for (const k in patch) { const v = patch[k] === undefined ? null : patch[k], j = JSON.stringify(v); if (this.sent[k] !== j) { this.sent[k] = j; out[k] = v; n++; } }\n      if (!n) return;\n      applyPatch(this.pres, clone(out));\n      this.rebuild(); this.fire([], [], [this.snap[0]]);\n      if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ t: \"p\", p: out }));\n    }\n    peers() { return this.snap; }\n    onPeers(cb, err) { this.cbs.push(cb); setTimeout(() => cb({ peers: this.snap, joined: this.snap, left: [], updated: [] })); return () => { this.cbs = this.cbs.filter(f => f !== cb); }; }\n    onConnection(cb) { this.connCbs.push(cb); setTimeout(() => cb(this.isConnected)); return () => { this.connCbs = this.connCbs.filter(f => f !== cb); }; }\n    connected() { return this.isConnected; }\n    async emit() {}\n    on() { return () => {}; }\n    async leave() {\n      if (this.closed) return;\n      this.closed = true; clearTimeout(this.retryT);\n      const ws = this.ws; this.ws = null;\n      if (ws) { try { if (ws.readyState === 1) ws.send('{\"t\":\"bye\"}'); ws.close(1000); } catch {} }\n      if (rooms.get(this.name) === this) rooms.delete(this.name);\n      if (!this.openDone) { this.openDone = true; this.openRej({ code: \"left\" }); }\n    }\n    async join(name) { return openRoom(name); }\n  }\n  const rooms = new Map();\n  function openRoom(name, soft) {\n    name = String(name);\n    const have = rooms.get(name);\n    if (have && !have.closed) return have.opened;\n    const r = new Room(name, soft); rooms.set(name, r);\n    return r.opened;\n  }\n  // back online / tab awake: reconnect at once\n  addEventListener(\"online\", () => { for (const r of rooms.values()) r.wake(); });\n  document.addEventListener(\"visibilitychange\", () => { if (document.visibilityState === \"visible\") for (const r of rooms.values()) r.wake(); });\n  addEventListener(\"pagehide\", () => { for (const r of [...rooms.values()]) r.leave(); });\n\n  let lobby = null;\n  window.npRoomMode = \"connecting\";\n  window.claude = {\n    __np: true,\n    use: async name => {\n      if (name !== \"room\") return null;\n      if (lobby && !lobby.closed) return lobby;\n      if (serverUrl() && !/[?&]p2p=1/.test(location.search)) {\n        try { lobby = await openRoom(\"lobby\", true); window.npRoomMode = \"server\"; return lobby; }\n        catch { /* the server can't be reached: peer-to-peer instead */ }\n      }\n      window.npRoomMode = \"p2p\";\n      return (lobby = await P2P.use(name));\n    }\n  };\n  window.npServerDebug = () => ({ me: ME, url: serverUrl(), mode: window.npRoomMode, rooms: [...rooms.values()].map(r => ({ name: r.name, connected: r.isConnected, created: r.created, peers: r.snap.length })) });\n})();\n\n</script>\n<script src=\"account-config.js\"></script>\n<script>\n",
    "after": "})();\n\n</script>\n<script src=\"/online-rooms.js\"></script>\n\n<script src=\"account-config.js\"></script>\n<script>\n"
  },
  {
    "before": "const $ = id => document.getElementById(id);\n// release number: goes up with every update (the website also serves it in version.txt)\nconst BUILD = 2026111001;\n// patch notes: a pop-up on the main menu, shown once per player per version (v), after each update (see showPatchNotes)\nconst PATCH_NOTES = { v: \"5.4\", title: \"Update 5.4: ADMIN items are the admin's\", notes: [\n",
    "after": "const $ = id => document.getElementById(id);\n// release number: goes up with every update (the website also serves it in version.txt)\nconst BUILD = 2026111055;\n// patch notes: a pop-up on the main menu, shown once per player per version (v), after each update (see showPatchNotes)\nconst PATCH_NOTES = { v: \"5.4\", title: \"Update 5.4: ADMIN items are the admin's\", notes: [\n"
  },
  {
    "before": "// RLUtilities-style bounce: restitution 0.6 on the normal part, friction that trades sliding for spin\nfunction ballContact(b, n, r) {\n  if (n.y > 0.7 && b === ball && b.p.y < r + 1) ball.floorT = nowS();     // touched the floor (the 0:00 rule)\n  const vn = b.v.dot(n);\n  if (vn >= 0) return;\n",
    "after": "// RLUtilities-style bounce: restitution 0.6 on the normal part, friction that trades sliding for spin\nfunction ballContact(b, n, r) {\n  if (n.y > 0.7 && b === ball && b.p.y < r + 1) { ball.floorT = nowS(); ball.floorFrame = true; }     // touched the floor (the 0:00 rule)\n  const vn = b.v.dot(n);\n  if (vn >= 0) return;\n"
  },
  {
    "before": "    _pk.addScaledVector(_pn, PUCK_R - d);\n    const vn = b.v.dot(_pn), flat = _pn.y > 0.7;\n    if (flat) { ground = true; if (b === ball) ball.floorT = nowS(); }\n    if (vn < 0) {\n      if (-vn > bounceImpact) bounceImpact = -vn;\n",
    "after": "    _pk.addScaledVector(_pn, PUCK_R - d);\n    const vn = b.v.dot(_pn), flat = _pn.y > 0.7;\n    if (flat) { ground = true; if (b === ball) { ball.floorT = nowS(); ball.floorFrame = true; } }\n    if (vn < 0) {\n      if (-vn > bounceImpact) bounceImpact = -vn;\n"
  },
  {
    "before": "  if (!retry || mode === \"menu\") setStatus(ONLINE_MSG);\n  room.onPeers(() => lobbyChanged(), e => { onlineOk = false; setStatus(netErr(e, \"Lost the lobby connection (\" + e.code + \"). Offline modes still work.\"), true); lobbyChanged(); });\n  room.onConnection(c => { if (mode !== \"menu\") return; setStatus(c ? ONLINE_MSG : \"Reconnecting\u2026\"); });\n  lobbyPresence();\n  lobbyChanged();\n",
    "after": "  if (!retry || mode === \"menu\") setStatus(ONLINE_MSG);\n  room.onPeers(() => lobbyChanged(), e => { onlineOk = false; setStatus(netErr(e, \"Lost the lobby connection (\" + e.code + \"). Offline modes still work.\"), true); lobbyChanged(); });\n  room.onConnection(c => { onlineOk = c; if (mode === \"menu\") setStatus(c ? ONLINE_MSG : \"Reconnecting\u2026\"); lobbyChanged(); });\n  lobbyPresence();\n  lobbyChanged();\n"
  },
  {
    "before": "  checkCodeJoin();\n  renderMenuChrome();\n  if ($(\"menu\").hidden) return;\n  if (screen === \"home\") renderParty();\n",
    "after": "  checkCodeJoin();\n  renderMenuChrome();\n  if (adTab === \"online\" && !$(\"adminPop\").hidden) renderAdmin();\n  if ($(\"menu\").hidden) return;\n  if (screen === \"home\") renderParty();\n"
  },
  {
    "before": "// ---------- match logic (authority) ----------\n// the ball (or puck) touching the floor: at 0:00 that ends the match, or starts overtime on a tie\nfunction ballGrounded() { return nowS() - (ball.floorT || -9) < 0.3 || (snowOn ? ball.p.y < PUCK_HH + 0.3 : ball.p.y < BR + 0.3 && ball.p.y > -BR); }\nlet overT = 0, botT = 0;\nfunction authorityMatch(dt) {\n",
    "after": "// ---------- match logic (authority) ----------\n// the ball (or puck) touching the floor: at 0:00 that ends the match, or starts overtime on a tie\nfunction ballGrounded() { return ball.floorFrame === true || (!dropOn && (snowOn ? ball.p.y <= PUCK_HH + 0.02 : ball.p.y <= BR + 0.02 && ball.p.y > -BR)); }\nlet overT = 0, botT = 0;\nfunction authorityMatch(dt) {\n"
  },
  {
    "before": "      if (match.tl <= 0) {\n        match.tl = 0;\n        if (ballGrounded()) { if (match.s[0] !== match.s[1]) match.ph = \"over\"; else match.ot = true; }\n      }\n    }\n",
    "after": "      if (match.tl <= 0) {\n        match.tl = 0;\n      }\n    }\n"
  },
  {
    "before": "      } else match.sc = lastTouch.name ? lastTouch.name + \" (own goal)\" : \"\";\n      match.ph = \"goal\"; match.pt = 2.2;\n    }\n  } else if (match.ph === \"goal\") {\n",
    "after": "      } else match.sc = lastTouch.name ? lastTouch.name + \" (own goal)\" : \"\";\n      match.ph = \"goal\"; match.pt = 2.2;\n    } else if (!match.ot && match.tl === 0 && ballGrounded()) {\n      if (match.s[0] !== match.s[1]) match.ph = \"over\"; else match.ot = true;\n    }\n  } else if (match.ph === \"goal\") {\n"
  },
  {
    "before": "  if (clanPageBusy) return;\n  clanPageBusy = true;\n  try { clan.members = await A.clans.members(clan.id); } catch { clan.members = null; } finally { clanPageBusy = false; }\n  ml.innerHTML = \"\";\n",
    "after": "  // The clan page redraws whenever the clan, its join requests or the lobby change. A redraw during the members\n  // request used to return early and leave the new page on \"Loading members…\" for good (the list went to the old,\n  // removed page). Every redraw now waits for the same request and fills its own list.\n  const memId = clan.id;\n  if (!clan.memReq || clan.memReq.id !== memId) { const req = { id: memId }; req.p = A.clans.members(memId).catch(() => null).finally(() => { if (clan.memReq === req) clan.memReq = null; }); clan.memReq = req; }\n  const memList = await clan.memReq.p;\n  if (!ml.isConnected || clan.id !== memId) return;\n  clan.members = memList;\n  ml.innerHTML = \"\";\n  if (!memList) { ml.append(h(\"div\", \"note\", \"Members could not be loaded.\"), sbtn(\"Retry\", \"xs pri\", () => renderClanPage())); return; }\n"
  },
  {
    "before": "  hitSeen.clear(); dmSeen.clear(); qcSeen.clear(); me.kick = -1; me.hitN = 0; me.hit = null; me.dms = []; me.qc = null;",
    "after": "  // the ball-hit counter never goes back to 0: a host who saw this tab before (it left and joined the same private\n  // match again) ignores hits numbered at or below the last one it applied, so a reset made every hit snap back\n  hitSeen.clear(); dmSeen.clear(); qcSeen.clear(); me.kick = -1; me.hit = null; me.dms = []; me.qc = null;"
  },
  {
    "before": "    for (const p of ch.left) { remotes.delete(p.peer); if (fin(p.presence && p.presence.j)) feed(-1, cleanName(p.presence.nm), \"left the match\"); }",
    "after": "    for (const p of ch.left) { remotes.delete(p.peer); hitSeen.delete(p.peer); dmSeen.delete(p.peer); qcSeen.delete(p.peer); if (fin(p.presence && p.presence.j)) feed(-1, cleanName(p.presence.nm), \"left the match\"); }"
  },
  {
    "before": "    match.pt -= dt; kickBallPos(ball.p); ball.v.set(0, 0, 0); ball.hsT = -1; ball.hoop = -1;\n    if (match.pt <= 0) { match.ph = \"play\"; match.pt = 0; }\n",
    "after": "    match.pt -= dt; kickBallPos(ball.p); ball.v.set(0, 0, 0); ball.hsT = -1; ball.hoop = -1;\n    if (match.pt <= 0 || freePlay) { match.ph = \"play\"; match.pt = 0; }     // free play has no 3-2-1 countdown\n"
  },
  {
    "before": "      else { match.k++; match.ph = \"countdown\"; match.pt = 3; match.kt = 0; }",
    "after": "      else if (freePlay) { match.k++; match.ph = \"play\"; match.pt = 0; match.kt = 0; }   // free play: straight back to the kickoff spot, no countdown\n      else { match.k++; match.ph = \"countdown\"; match.pt = 3; match.kt = 0; }"
  },
  {
    "before": "let jpLatch = false;\nfunction simulate(dt, now) {\n  const inp = readInput();\n  if (paused && mode !== \"online\") { sfx.engine(0, false, false, false); return; }\n",
    "after": "let jpLatch = false;\nfunction simulate(dt, now) {\n  ball.floorFrame = false;\n  const inp = readInput();\n  if (paused && mode !== \"online\") { sfx.engine(0, false, false, false); return; }\n"
  },
  {
    "before": "  if (screen !== \"home\") showScreen(\"home\");\n  $(\"onlinePop\").hidden = !$(\"onlinePop\").hidden;\n};\n$(\"onlineClose\").onclick = () => { $(\"onlinePop\").hidden = true; };\n",
    "after": "  if (screen !== \"home\") showScreen(\"home\");\n  $(\"onlinePop\").hidden = !$(\"onlinePop\").hidden;\n  if (!$(\"onlinePop\").hidden) renderParty();\n};\n$(\"onlineClose\").onclick = () => { $(\"onlinePop\").hidden = true; };\n"
  },
  {
    "before": "function renderParty() {\n  lchatRender();\n  const ps = partyState(), players = lobbyPlayers(), lead = ps.isLeader, full = ps.size >= PARTY_MAX, now = Date.now();\n  const inParty = new Set(ps.members.map(m => m.peer));\n  const on = !!roomApi && onlineOk, code = partyCodeShown();\n",
    "after": "function renderParty() {\n  lchatRender();\n  const ps = partyState(), players = onlineOk ? lobbyPlayers() : [], lead = ps.isLeader, full = ps.size >= PARTY_MAX, now = Date.now();\n  const inParty = new Set(ps.members.map(m => m.peer));\n  const on = !!roomApi && onlineOk, code = partyCodeShown();\n"
  },
  {
    "before": "      body.append(ta, row);\n    } else {\n      const ps = lobbyPlayers();\n      body.append(h(\"div\", \"\", ps.length + 1 + \" online (including you)\"));\n",
    "after": "      body.append(ta, row);\n    } else {\n      if (!onlineOk) { body.append(h(\"div\", \"none\", \"Reconnecting to the shared lobby\u2026\")); return; }\n      const ps = lobbyPlayers();\n      body.append(h(\"div\", \"\", ps.length + 1 + \" online (including you)\"));\n"
  },
  {
    "before": "<script src=\"/privacy-consent.js\"></script>",
    "after": "<script src=\"/game-notices.js\"></script>"
  },
  {
    "before": "const PATCH_NOTES = { v: \"5.4\", title: \"Update 5.4: ADMIN items are the admin's\", notes: [\n  \"ADMIN items (car, decal, wheels, topper, antenna, title, banner) only show for the admin and players he gifted them to. Copies anyone gave themselves are gone\",\n] };\n",
    "after": "const PATCH_NOTES = {\n  \"v\": \"5.57\",\n  \"title\": \"Update 5.57: Kickoffs and parties\",\n  \"notes\": [\n    \"Kickoffs online: when two players hit the ball at the same time, the hits now combine instead of the ball jumping to a different spot.\",\n    \"Small differences between your screen and the host's now glide smoothly instead of the ball teleporting.\",\n    \"Whoever in your party starts a private match, the rest of the party follows them in automatically with no password.\",\n    \"Bigger cars on the main menu with the player names higher above them, a closer camera for big parties, and a slightly smaller menu on computers.\",\n    \"Refresh from the menu when prompted to load this update.\"\n  ]\n};\n"
  },
  {
    "before": "<title>Nitro Pitch</title>",
    "after": "<title>Nitro Pitch \u2014 Free Online Car Soccer Game</title>\n<link rel=\"canonical\" href=\"https://nitropitch.app/\">\n<meta property=\"og:type\" content=\"website\">\n<meta property=\"og:title\" content=\"Nitro Pitch \u2014 Free Online Car Soccer Game\">\n<meta property=\"og:url\" content=\"https://nitropitch.app/\">\n<meta property=\"og:description\" content=\"Boost, jump and score in free multiplayer car soccer. Play ranked matches, private rooms and bots right in your browser\u2014no download needed.\">\n<link rel=\"icon\" type=\"image/png\" sizes=\"48x48\" href=\"/nitro-pitch-icon-48.png\">\n<link rel=\"icon\" href=\"/favicon.ico\" sizes=\"16x16 32x32 48x48\">\n<link rel=\"apple-touch-icon\" sizes=\"180x180\" href=\"/apple-touch-icon.png\">\n<meta property=\"og:image\" content=\"https://nitropitch.app/nitro-pitch-icon.png\">\n<meta property=\"og:image:type\" content=\"image/png\">\n<meta property=\"og:image:width\" content=\"512\">\n<meta property=\"og:image:height\" content=\"512\">\n<meta property=\"og:image:alt\" content=\"A blue rocket car boosting toward a soccer ball on a navy background\">\n<meta name=\"twitter:card\" content=\"summary\">\n<meta name=\"twitter:title\" content=\"Nitro Pitch \u2014 Free Online Car Soccer Game\">\n<meta name=\"twitter:description\" content=\"Boost, jump and score in free multiplayer car soccer, right in your browser.\">\n<meta name=\"twitter:image\" content=\"https://nitropitch.app/nitro-pitch-icon.png\">\n<meta name=\"twitter:image:alt\" content=\"A blue rocket car boosting toward a soccer ball on a navy background\">\n<link rel=\"icon\" type=\"image/png\" sizes=\"512x512\" href=\"/nitro-pitch-icon.png\">\n<meta property=\"og:site_name\" content=\"Nitro Pitch\">"
  },
  {
    "before": "<meta name=\"description\" content=\"Nitro Pitch: rocket-powered car soccer in your browser. Play bots or friends online.\">",
    "after": "<meta name=\"description\" content=\"Play Nitro Pitch, a free car soccer browser game with multiplayer, ranked matches and bots. No download. See our FAQ about unblocked game websites.\">"
  },
  {
    "before": ".filter(m => tab === \"clan\" ? m.clan && m.cid === clan.id : !m.clan);",
    "after": ".filter(m => (!window.NPPlayerFeatures || !window.NPPlayerFeatures.isChatBlocked(m)) && (tab === \"clan\" ? m.clan && m.cid === clan.id : !m.clan));"
  },
  {
    "before": "    for (const p of players) {\n      const t = p.pr.td;",
    "after": "    for (const p of players) {\n      if (window.NPPlayerFeatures?.isBlocked(p)) continue;\n      const t = p.pr.td;"
  },
  {
    "before": "if (!tt || tt.id !== t.id || trade) { toast(\"That trade request is gone\"); return; }",
    "after": "if (!tt || tt.id !== t.id || trade || window.NPPlayerFeatures?.isBlocked(q)) { toast(\"That trade request is gone\"); return; }"
  },
  {
    "before": "requestAnimationFrame(frame);\n})();\n</script>",
    "after": "requestAnimationFrame(frame);\n/* NP_DRIVING_UPDATES */\n/* NP_SECURE_PROGRESS */\n/* NP_PLAYER_FEATURES */\n/* NP_GAME_POLISH */\n/* NP_MATCH_EXPERIENCE */\n/* NP_PHONE_CONTROLS */\n/* NP_CLAN_EMBLEMS */\n/* NP_MOBILE_MENUS */\n/* NP_INVITE_ALERTS */\n/* NP_SEASON_UPDATE */\n})();\n</script>"
  },
  {
    "before": "<button class=\"nb\" id=\"navSettings\" type=\"button\">",
    "after": "<button class=\"nb\" id=\"navMore\" type=\"button\"><span><i class=\"ic\" data-ic=\"star\"></i><span><b>More</b><small>History, blocks &amp; info</small></span></span></button>\n      <button class=\"nb\" id=\"navSettings\" type=\"button\">"
  },
  {
    "before": "  <!-- PLAY -->",
    "after": "  <section class=\"scr\" id=\"more\" hidden aria-label=\"More\">\n    <div class=\"shead\"><button class=\"back\" type=\"button\" data-back><span><i class=\"ic\" data-ic=\"left\"></i>Back<kbd>Esc</kbd></span></button><div class=\"stitle\"><small>Main menu</small><h1>More</h1></div></div>\n    <div class=\"psec\"><span>Your game</span></div>\n    <div class=\"tiles on\">\n      <button class=\"tile c-blue\" id=\"np-history\" type=\"button\"><span class=\"tin\"><i class=\"ic big\" data-ic=\"trophy\"></i><i class=\"ic wm\" data-ic=\"trophy\"></i><b>Match history</b><small>Your last 20 matches, scores and rank changes on this device.</small></span></button>\n      <button class=\"tile c-purple\" id=\"np-blocks\" type=\"button\"><span class=\"tin\"><i class=\"ic big\" data-ic=\"lock\"></i><i class=\"ic wm\" data-ic=\"lock\"></i><b>Blocked players</b><small>Manage who can send you chat and invitations on this device.</small></span></button>\n      <a class=\"tile c-teal\" href=\"/about\" id=\"np-about\" style=\"color:inherit;text-decoration:none\"><span class=\"tin\"><i class=\"ic big\" data-ic=\"ball\"></i><i class=\"ic wm\" data-ic=\"ball\"></i><b>About</b><small>Game modes, browser play and unblocked games FAQ.</small></span></a>\n    </div>\n  </section>\n\n  <style>#more .tiles.on{grid-template-columns:repeat(3,minmax(0,1fr))}@media(max-width:980px){#more .tiles.on{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:760px){#more .tiles.on{grid-template-columns:1fr}}</style>\n  <!-- PLAY -->"
  },
  {
    "before": "const MAIN_SCREENS = new Set([\"home\",",
    "after": "const MAIN_SCREENS = new Set([\"home\", \"more\","
  },
  {
    "before": "const ALL_SCREENS = [\"home\",",
    "after": "const ALL_SCREENS = [\"home\", \"more\","
  },
  {
    "before": "const DEPTH = { home: 0,",
    "after": "const DEPTH = { home: 0, more: 1,"
  },
  {
    "before": "    case \"play\": case \"garage\": case \"pass\": case \"career\": case \"account\": showScreen(\"home\"); return true;",
    "after": "    case \"more\": case \"play\": case \"garage\": case \"pass\": case \"career\": case \"account\": showScreen(\"home\"); return true;"
  },
  {
    "before": "<meta name=\"theme-color\" content=\"#0b1020\">",
    "after": "<meta name=\"theme-color\" content=\"#0b1020\">\n<script type=\"application/ld+json\">{\"@context\":\"https://schema.org\",\"@type\":\"VideoGame\",\"name\":\"Nitro Pitch\",\"url\":\"https://nitropitch.app/\",\"image\":\"https://nitropitch.app/nitro-pitch-icon.png\",\"description\":\"Free online car soccer browser game with multiplayer, ranked matches, private rooms, bot matches and training.\",\"genre\":[\"Sports\",\"Racing\"],\"playMode\":[\"SinglePlayer\",\"MultiPlayer\"],\"gamePlatform\":\"Web browser\",\"applicationCategory\":\"GameApplication\",\"operatingSystem\":\"Web browser\",\"isAccessibleForFree\":true,\"inLanguage\":\"en\",\"@id\":\"https://nitropitch.app/#game\",\"screenshot\":[\"https://nitropitch.app/images/nitro-pitch-car-soccer-arena.webp\",\"https://nitropitch.app/images/nitro-pitch-free-play.webp\",\"https://nitropitch.app/images/nitro-pitch-main-menu.webp\",\"https://nitropitch.app/images/nitro-pitch-ranked-playlists.webp\",\"https://nitropitch.app/images/nitro-pitch-leaderboard.webp\"]}</script>\n<script type=\"application/ld+json\">{\"@context\":\"https://schema.org\",\"@graph\":[{\"@type\":\"WebSite\",\"@id\":\"https://nitropitch.app/#website\",\"name\":\"Nitro Pitch\",\"url\":\"https://nitropitch.app/\",\"publisher\":{\"@id\":\"https://nitropitch.app/#organization\"}},{\"@type\":\"Organization\",\"@id\":\"https://nitropitch.app/#organization\",\"name\":\"Nitro Pitch\",\"url\":\"https://nitropitch.app/\",\"logo\":{\"@type\":\"ImageObject\",\"url\":\"https://nitropitch.app/nitro-pitch-icon.png\",\"contentUrl\":\"https://nitropitch.app/nitro-pitch-icon.png\",\"width\":512,\"height\":512}}]}</script>\n"
  },
  {
    "before": "  c.p.addScaledVector(c.v, dt);\n  carContacts(c, dt);",
    "after": "  NPDrive.move(c, dt);"
  },
  {
    "before": "function startTutorial() {\n  if (loginGate()) return;",
    "after": "function startTutorial() {\n  if (isBanned) { loginGate(); return; }"
  },
  {
    "before": "function startFreePlay(keepSearch) {\n  if (loginGate()) return;",
    "after": "function startFreePlay(keepSearch) {\n  if (isBanned) { loginGate(); return; }"
  },
  {
    "before": "  if (s === \"play\" && loginGate()) return;",
    "after": "  if (s === \"play\" && isBanned) { loginGate(); return; }"
  },
  {
    "before": "fov: 90, dist: 270, height: 100, angle: -3, stiff: 0.5, ver: SET_VER, ballCam: true, shake: true,",
    "after": "fov: 105, dist: 280, height: 100, angle: -3, stiff: 0.5, ver: SET_VER, ballCam: true, shake: false,"
  },
  {
    "before": "    user: () => toUser(auth && auth.currentUser),",
    "after": "    user: () => toUser(auth && auth.currentUser),\n    async token(force=false) { await ready; if (!auth.currentUser) throw new Error(\"Sign in to continue\"); return auth.currentUser.getIdToken(force); },"
  },
  {
    "before": "      const ref = fs.collection(\"players\").doc(fu.uid);\n      return {",
    "after": "      if (window.NPProgressAPI) return window.NPProgressAPI.store();\n      const ref = fs.collection(\"players\").doc(fu.uid);\n      return {"
  },
  {
    "before": "</head>",
    "after": "<script src=\"/progress-api.js\"></script>\n<link rel=\"stylesheet\" href=\"/game-polish.css\">\n<link rel=\"stylesheet\" href=\"/mobile.css\">\n</head>"
  },
  {
    "before": "  function musicTick() {\n    if (!ctx || !musicOn || muted || musicVol <= 0 || ctx.state !== \"running\") { if (ctx) musicNext = ctx.currentTime + 0.05; return; }",
    "after": "  function musicTick() {\n    if (typeof npMenuTracks === \"function\" && ctx && musicGain && npMenuTracks(ctx, musicGain, musicOn && !muted && musicVol > 0 && ctx.state === \"running\")) return;\n    if (!ctx || !musicOn || muted || musicVol <= 0 || ctx.state !== \"running\") { if (ctx) musicNext = ctx.currentTime + 0.05; return; }"
  },
  {
    "before": "  else if (match.ph === \"goal\") showMsg(\"GOAL!\", match.sc ? match.sc + \" scores for \" + (match.lg ? \"orange\" : \"blue\") + (match.as ? \", assist from \" + match.as : \"\") : \"\", match.lg ? \"var(--orange)\" : \"var(--blue)\");",
    "after": "  else if (match.ph === \"goal\") showMsg(\"GOAL!\", npGoalLine(match.sc ? match.sc + \" scores for \" + (match.lg ? \"orange\" : \"blue\") + (match.as ? \", assist from \" + match.as : \"\") : \"\"), match.lg ? \"var(--orange)\" : \"var(--blue)\");"
  },
  {
    "before": "function openDropUI(k) {",
    "after": "async function openDropUI(k) {"
  },
  {
    "before": "  const got = openDrop(k); if (!got) return;",
    "after": "  const got = await openDrop(k); if (!got) return;"
  },
  {
    "before": "function tradeInUI() {",
    "after": "async function tradeInUI() {"
  },
  {
    "before": "  const r = tiRar, res = tradeIn(r, tiSel.slice());",
    "after": "  const r = tiRar, res = await tradeIn(r, tiSel.slice());"
  },
  {
    "before": "() => { if (rerollQuest(i)) { toast(\"New quest: \" + questText(profile.qs.dq[i])); renderPass(); }",
    "after": "async () => { if (await rerollQuest(i)) { toast(\"New quest: \" + questText(profile.qs.dq[i])); renderPass(); }"
  },
  {
    "before": "function pickHost(now) {\n  let best = null;",
    "after": "function pickHost(now) {\n  if (game.serverHost) { const selected=game.peers().find(p=>p.peer===game.serverHost); if(selected)return selected; }\n  let best = null;"
  },
  {
    "before": "const KICK_MARKS =",
    "after": "THEMES.push(\n  { name: \"Sunset Canyon\", night: false, bg: 0x312039, horizon: 0xe9a174, fog: [420, 1050], stripes: [\"#447054\", \"#4c7a5b\"], line: \"rgba(245,245,221,.9)\", corner: \"#392a39\", wall: 0xffc69b, wallOp: .13, rim: 0xf6ccab, stand: 0x423345, outer: 0x452f3d, strip: 0xffbf79, beam: .03, roof: 0x352c3e, ramp: 0x67505c },\n  { name: \"Aurora Ridge\", night: true, bg: 0x071b31, horizon: 0x276a78, fog: [420, 1000], stripes: [\"#28554c\", \"#306256\"], line: \"rgba(223,245,239,.92)\", corner: \"#122b3a\", wall: 0x8cebd7, wallOp: .14, rim: 0xa0eee3, stand: 0x153846, outer: 0x16333e, strip: 0x71e7cb, beam: .04, roof: 0x132b3e, ramp: 0x345a63 },\n  { name: \"Orbital Station\", night: true, bg: 0x040b1b, horizon: 0x263757, fog: [450, 1100], stripes: [\"#273d50\", \"#30475a\"], line: \"rgba(229,241,255,.92)\", corner: \"#0b182d\", wall: 0x9dc9ef, wallOp: .13, rim: 0xe1ebff, stand: 0x1d2c46, outer: 0x101c32, strip: 0x85d8ed, beam: .03, roof: 0x16243d, ramp: 0x40516b }\n);\nconst KICK_MARKS ="
  },
  {
    "before": "const GOAL_BLAST_R = 36, GOAL_BLAST_V = 48, _gbd = new V3();",
    "after": "const GOAL_BLAST_R = 72, GOAL_BLAST_V = 64, _gbd = new V3();"
  },
  {
    "before": "  const f = (1 - dist / GOAL_BLAST_R) ** 1.5;",
    "after": "  const f = (1 - dist / GOAL_BLAST_R) ** 0.85;"
  },
  {
    "before": "  d.y = Math.max(d.y, 0) + 0.45; d.normalize();",
    "after": "  d.y = Math.max(d.y, 0) + 0.6; d.normalize();"
  },
  {
    "before": "  c.v.addScaledVector(d, GOAL_BLAST_V * f);",
    "after": "  c.v.addScaledVector(d, GOAL_BLAST_V * f).clampLength(0, 90);"
  },
  {
    "before": "  if (f > 0.25) fx.burst(c.p, 0xffffff, Math.round(40 * f), 10, 0.6, 6);",
    "after": "  if (f > 0.25) fx.burst(c.p, 0xffffff, Math.round(24 * f), 12, 0.6, 6);"
  },
  {
    "before": "const dayNow = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);",
    "after": "const dayNow = () => Math.floor(Date.now() / 86400000);"
  },
  {
    "before": "  if (mode === \"menu\") { demoSim(dt);",
    "after": "  if (!$(\"unlockPop\").hidden || !$(\"dropPop\").hidden) thumbs.pump();\n  if (mode === \"menu\") { demoSim(dt);"
  },
  {
    "before": "    if (newTouch && c === me.car) { sfx.hit(relSpeed * 0.8); me.lastHitSnd = nowS(); shakeT = Math.max(shakeT, Math.min(0.35, relSpeed / 120)); }",
    "after": "    if (newTouch && c === me.car) { NPMatchExperience.hit(b.p, relSpeed); me.lastHitSnd = nowS(); if (!NPPolish.reduced()) shakeT = Math.max(shakeT, Math.min(0.2, relSpeed / 180)); }"
  },
  {
    "before": "  if (mode === \"online\" && game && !joinPending && Date.now() - hiddenAt > 2000) { me.joinedAt = Date.now(); game.presence({ j: me.joinedAt }).catch(() => {}); }",
    "after": "  if (mode === \"online\" && game && !joinPending && Date.now() - hiddenAt > 2000) { game.presence({ j: me.joinedAt }).catch(() => {}); }"
  },
  {
    "before": "  const dist = settings.dist * UU, hgt = settings.height * UU, ang = settings.angle * Math.PI / 180;",
    "after": "  const phoneFrame = NPDrive.framing();\n  const dist = phoneFrame.dist * UU, hgt = phoneFrame.height * UU, ang = settings.angle * Math.PI / 180;"
  },
  {
    "before": "  const fovNow = vFov(settings.fov);\n  _cu.copy(UP);",
    "after": "  const fovNow = phoneFrame.fov;\n  _cu.copy(UP);"
  },
  {
    "before": "  if (settings.shake && shakeT > 0) { shakeT -= dt; camera.position.x += (Math.random() - 0.5) * shakeT * 1.2; camera.position.y += (Math.random() - 0.5) * shakeT * 1.2; }",
    "after": "  if (settings.shake && shakeT > 0) { shakeT = Math.max(0, shakeT - dt); if (!phoneFrame.mobile) { camera.position.x += (Math.random() - 0.5) * shakeT * 1.2; camera.position.y += (Math.random() - 0.5) * shakeT * 1.2; } }"
  },
  {
    "before": "  let pit = thr, rear = held(\"rear\");",
    "after": "  let pit = thr, rear = held(\"rear\") || !!touch.rear;"
  },
  {
    "before": "  <div class=\"tb\" id=\"tCam\">CAM</div>",
    "after": "  <button type=\"button\" class=\"tb\" id=\"tCam\" aria-label=\"Toggle ball camera\" aria-pressed=\"false\">BALL CAM</button>\n  <button type=\"button\" class=\"tb\" id=\"tRear\" aria-label=\"Hold to look behind\">LOOK BACK</button>"
  },
  {
    "before": "(() => {\n  const stick = $(\"stick\"), knob = $(\"knob\");\n  let sid = null, cx = 0, cy = 0;\n  stick.addEventListener(\"pointerdown\", e => { sid = e.pointerId; const r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; stick.setPointerCapture(sid); mv(e); });\n  stick.addEventListener(\"pointermove\", e => { if (e.pointerId === sid) mv(e); });\n  const end = e => { if (e.pointerId !== sid) return; sid = null; touch.x = touch.y = 0; knob.style.transform = \"\"; };\n  stick.addEventListener(\"pointerup\", end); stick.addEventListener(\"pointercancel\", end);\n  function mv(e) {\n    let dx = (e.clientX - cx) / 60, dy = (e.clientY - cy) / 60; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }\n    touch.x = Math.abs(dx) > 0.12 ? dx : 0; touch.y = Math.abs(dy) > 0.12 ? dy : 0;\n    knob.style.transform = `translate(${dx * 40}px,${dy * 40}px)`;\n  }\n  for (const [id, key] of [[\"tJump\", \"jump\"], [\"tBoost\", \"boost\"], [\"tDrift\", \"drift\"], [\"tRollL\", \"rollL\"], [\"tRollR\", \"rollR\"], [\"tItem\", \"item\"]]) {\n    const el = $(id);\n    el.addEventListener(\"pointerdown\", e => { touch[key] = true; el.classList.add(\"on\"); try { el.setPointerCapture(e.pointerId); } catch {} });\n    const up = () => { touch[key] = false; el.classList.remove(\"on\"); };\n    el.addEventListener(\"pointerup\", up); el.addEventListener(\"pointercancel\", up);\n  }\n  $(\"tCam\").addEventListener(\"click\", () => toggleBallCam());\n  $(\"tMenu\").addEventListener(\"click\", () => { if (inMatchView()) togglePause(); });\n})();\n",
    "after": "/* NP_TOUCH_INPUT */\n"
  },
  {
    "before": "const isTouch = matchMedia(\"(pointer: coarse)\").matches;",
    "after": "const isTouch = matchMedia(\"(any-pointer: coarse)\").matches || navigator.maxTouchPoints > 0;"
  },
  {
    "before": "<div class=\"tb\" id=\"tJump\">JUMP</div>",
    "after": "<button type=\"button\" class=\"tb\" id=\"tJump\" aria-label=\"Jump\">JUMP</button>"
  },
  {
    "before": "<div class=\"tb\" id=\"tBoost\">BOOST</div>",
    "after": "<button type=\"button\" class=\"tb\" id=\"tBoost\" aria-label=\"Boost\">BOOST</button>"
  },
  {
    "before": "<div class=\"tb\" id=\"tDrift\">SLIDE<br>ROLL</div>",
    "after": "<button type=\"button\" class=\"tb\" id=\"tDrift\" aria-label=\"Powerslide and air roll\">SLIDE<br>ROLL</button>"
  },
  {
    "before": "<div class=\"tb\" id=\"tRollL\" aria-label=\"Air roll left\">&#10226;</div>",
    "after": "<button type=\"button\" class=\"tb\" id=\"tRollL\" aria-label=\"Air roll left\">&#10226;</button>"
  },
  {
    "before": "<div class=\"tb\" id=\"tRollR\" aria-label=\"Air roll right\">&#10227;</div>",
    "after": "<button type=\"button\" class=\"tb\" id=\"tRollR\" aria-label=\"Air roll right\">&#10227;</button>"
  },
  {
    "before": "<div class=\"tb\" id=\"tItem\" hidden>ITEM</div>",
    "after": "<button type=\"button\" class=\"tb\" id=\"tItem\" aria-label=\"Use item\" hidden>ITEM</button>"
  },
  {
    "before": "<div class=\"tb\" id=\"tMenu\">II</div>",
    "after": "<button type=\"button\" class=\"tb\" id=\"tMenu\" aria-label=\"Pause menu\">II</button>"
  },
  {
    "before": "  const cap = Math.min(devicePixelRatio, 2);",
    "after": "  const cap = Math.min(devicePixelRatio, isTouch ? 1.5 : 2);"
  },
  {
    "before": "      li.append(n, nm, h(\"span\", \"v\", \"Lv \" + L.lv + \" \u00b7 \" + (c.xp | 0) + \" XP\"));",
    "after": "      li.append(n, clanLogo(c), nm, h(\"span\", \"v\", \"Lv \" + L.lv + \" \u00b7 \" + (c.xp | 0) + \" XP\"));"
  },
  {
    "before": "    li.append(v); list.append(li);",
    "after": "    if (r.clanId && lbClans[r.clanId]) li.insertBefore(clanLogo(lbClans[r.clanId]), nm);\n    li.append(v); list.append(li);"
  },
  {
    "before": "<button type=\"button\" class=\"lbt\" data-lb=\"clans\">Clans</button>",
    "after": "<button type=\"button\" class=\"lbt\" data-lb=\"level\">Levels</button><button type=\"button\" class=\"lbt\" data-lb=\"clans\">Clans</button>"
  },
  {
    "before": "if (![\"mmr\", \"wins\", \"goals\"].includes(field)) throw new Error(\"Unknown leaderboard.\");",
    "after": "if (![\"mmr\", \"wins\", \"goals\", \"level\"].includes(field)) throw new Error(\"Unknown leaderboard.\");"
  },
  {
    "before": "    } else { li.append(n, nm); v.textContent = (fin(r[k]) ? r[k] : 0) + (k === \"wins\" ? \" wins\" : \" goals\"); }",
    "after": "    } else { li.append(n, nm); v.textContent = k === \"level\" ? \"Level \" + Math.max(1, Math.min(MAXLV, r.level | 0)) : (fin(r[k]) ? r[k] : 0) + (k === \"wins\" ? \" wins\" : \" goals\"); }"
  },
  {
    "before": "    && !(r.wins > 20000 || r.goals > 100000 || r.mmr > 3000 || (r.wins > 0 && r.goals > r.wins * 60))).slice(0, 25);",
    "after": "    && (k !== \"level\" || Number.isInteger(r.level) && r.level >= 1 && r.level <= MAXLV)\n    && !(r.wins > 20000 || r.goals > 100000 || r.mmr > 3000 || (r.wins > 0 && r.goals > r.wins * 60))).slice(0, 25);"
  },
  {
    "before": "    const E = 1 / (1 + Math.pow(10, clamp(opp - team, -4000, 4000) / 400));\n    return won ? Math.max(1, Math.round(K * (1 - E))) : -Math.max(1, Math.round(K * E));\n  }\n",
    "after": "    const E = 1 / (1 + Math.pow(10, clamp(opp - team, -4000, 4000) / 400));\n    // the higher your rank, the less a win gives (full gains up to Gold, under half at Supersonic Legend); losses don't shrink\n    const climb = clamp(1 - Math.max(0, team - 500) / 2600, 0.45, 1);\n    return won ? Math.max(1, Math.round(K * (1 - E) * climb)) : -Math.max(1, Math.round(K * E));\n  }\n"
  },
  {
    "before": "  const SK = [[0, 0.40], [150, 0.45], [385, 0.55], [565, 0.65], [745, 0.75], [955, 0.85],\n    [1255, 0.95], [1650, 1.05], [1861, 1.12]];",
    "after": "  const SK = [[0, 0.46], [150, 0.53], [385, 0.64], [565, 0.75], [745, 0.85], [955, 0.95],\n    [1255, 1.04], [1650, 1.12], [1861, 1.18]];"
  },
  {
    "before": "const BOT_DF = [0.55, 0.8, 1];",
    "after": "const BOT_DF = [0.6, 0.88, 1.08];"
  },
  {
    "before": "  { name: \"ADMIN\", col: \"#ff2a2a\", admin: true, g: 2 }\n",
    "after": "  { name: \"ADMIN\", col: \"#ff2a2a\", admin: true, g: 2 },\n  { name: \"Bronze Grinder\", col: \"#d9925a\", u: \"t0\", g: 1 },\n  { name: \"Silver Striker\", col: \"#c9d2df\", u: \"t1\", g: 1 },\n  { name: \"Golden Touch\", col: \"#ffcf4a\", u: \"t2\", g: 1 },\n  { name: \"Platinum Pilot\", col: \"#5fe3d8\", u: \"t3\", g: 1 },\n  { name: \"Diamond Driver\", col: \"#5cb8ff\", u: \"t4\", g: 1 }\n"
  },
  {
    "before": "  { name: \"ADMIN\", bg: \"repeating-linear-gradient(135deg,#1a0000 0 10px,#2b0000 10px 20px),linear-gradient(90deg,#000,#5a0000)\", admin: true, glow: 1 }\n",
    "after": "  { name: \"ADMIN\", bg: \"repeating-linear-gradient(135deg,#1a0000 0 10px,#2b0000 10px 20px),linear-gradient(90deg,#000,#5a0000)\", admin: true, glow: 1 },\n  { name: \"Bronze Plate\", bg: \"linear-gradient(100deg,#2a1206,#8a4a22 40%,#e3a06a 50%,#8a4a22 60%,#2a1206)\", u: \"t0\" },\n  { name: \"Silver Shine\", bg: \"linear-gradient(100deg,#1b2029,#6d7888 40%,#eef3fa 50%,#6d7888 60%,#1b2029)\", u: \"t1\" },\n  { name: \"Gold Medal\", bg: \"radial-gradient(circle at 12% 50%,#fff3b0 0,#ffcf4a 10%,transparent 28%),linear-gradient(100deg,#3a2600,#b88a12 45%,#ffe27a 52%,#3a2600)\", u: \"t2\" },\n  { name: \"Platinum Edge\", bg: \"linear-gradient(120deg,transparent 0 46%,rgba(255,255,255,.55) 48%,transparent 52%),linear-gradient(100deg,#062a2e,#1d8f8a 45%,#9ff5ec 52%,#062a2e)\", u: \"t3\" },\n  { name: \"Diamond Cut\", bg: \"conic-gradient(from 45deg at 20% 50%,#0d2a66,#5cb8ff,#d6efff,#5cb8ff,#0d2a66) 0 0/48px 100%,linear-gradient(90deg,#071a3f,#123a8a)\", u: \"t4\" },\n  { name: \"Supersonic Legend\", bg: \"radial-gradient(circle at 30% 40%,rgba(255,255,255,.9) 0 1px,transparent 2px) 0 0/19px 13px,linear-gradient(100deg,#1a1f33,#8d98b8 40%,#ffffff 50%,#8d98b8 60%,#1a1f33)\", u: \"t7\", glow: 1 }\n"
  },
  {
    "before": "        if (r.text) who.append(h(\"div\", \"\", \"Message: \\u201c\" + r.text + \"\\u201d\"));\n",
    "after": "        if (r.text) who.append(h(\"div\", \"\", \"Message: \\u201c\" + r.text + \"\\u201d\"));\n        if (typeof npReportChat === \"function\") npReportChat(r, who);\n"
  },
  {
    "before": "  if (pnState === 1 || !onMenu || !$(\"confirm\").hidden || !$(\"updPop\").hidden || !$(\"dropPop\").hidden || !$(\"tiPop\").hidden) return;\n",
    "after": "  if (pnState === 1 || !onMenu || !$(\"confirm\").hidden || !$(\"updPop\").hidden || !$(\"dropPop\").hidden || !$(\"tiPop\").hidden || document.getElementById(\"nitropitch-terms-modal\")) return;\n"
  },
  {
    "before": "    { name: \"ADMIN\", lv: 1, tier: -1, admin: true }\n  ];\n",
    "after": "    { name: \"ADMIN\", lv: 1, tier: -1, admin: true },\n    // 31..34: Snowdrift Season (Christmas event)\n    { name: \"Ugly Sweater\", lv: 1, tier: -1, ev: 1 }, { name: \"Candy Stripe\", lv: 1, tier: -1, ev: 1 },\n    { name: \"Gift Wrap\", lv: 1, tier: -1, ev: 1 }, { name: \"Frostbite\", lv: 1, tier: -1, ev: 1 }\n  ];\n"
  },
  {
    "before": "    { name: \"ADMIN\", lv: 1, admin: true }\n  ];\n  const RIM_PRESET",
    "after": "    { name: \"ADMIN\", lv: 1, admin: true },\n    { name: \"Peppermint\", lv: 1, ev: 1 }, { name: \"Ice Studs\", lv: 1, ev: 1 }, { name: \"Wreath Rims\", lv: 1, ev: 1 }\n  ];\n  const RIM_PRESET"
  },
  {
    "before": "    { style: \"blade\", n: 6, cell: \"gold\", ring: \"black\", cap: \"gold\" }\n  ];",
    "after": "    { style: \"blade\", n: 6, cell: \"gold\", ring: \"black\", cap: \"gold\" },\n    { style: \"dish\", n: 8, cell: \"white\", lip: \"red\", cap: \"red\" },\n    { style: \"spoke\", n: 5, w0: 0.2, w1: 0.13, cell: \"xice\", cap: \"white\", tyre: \"offroad\" },\n    { style: \"mesh\", n: 10, cell: \"xgreen\", cap: \"gold\" }\n  ];"
  },
  {
    "before": "    neon0: [0x7cc4ff, 0.2, 0, 0x3a9cff], neon1:",
    "after": "    xice: [0x9fdcff, 0.15, 0.35], xgreen: [0x1d7a41, 0.5, 0.1],\n    neon0: [0x7cc4ff, 0.2, 0, 0x3a9cff], neon1:"
  },
  {
    "before": "  const FINISHES = [\"Gloss\", \"Matte\", \"Metallic\", \"Pearl\", \"Chrome\"];",
    "after": "  const FINISHES = [\"Gloss\", \"Matte\", \"Metallic\", \"Pearl\", \"Chrome\", \"Frosted\"];"
  },
  {
    "before": "    if (f === 4) return {",
    "after": "    if (f === 5) return { roughness: 0.6, metalness: 0.08, clearcoat: 0.5, clearcoatRoughness: 0.45, envMapIntensity: 0.85, sheen: 1, sheenRoughness: 0.35, sheenColor: new THREE.Color(0xdff4ff) };\n    if (f === 4) return {"
  },
  {
    "before": "      g.fillStyle = \"#ffcf3a\"; g.fillRect(0, 456, DW, 3); g.fillRect(0, 497, DW, 3);\n    }\n  ];\n",
    "after": "      g.fillStyle = \"#ffcf3a\"; g.fillRect(0, 456, DW, 3); g.fillRect(0, 497, DW, 3);\n    },\n    // 31 Ugly Sweater: knitted zigzags with green diamonds on red\n    (g) => {\n      g.fillStyle = \"#b51f30\"; g.fillRect(0, 0, DW, DH);\n      g.strokeStyle = \"#f4f6ff\"; g.lineWidth = 8; g.lineJoin = \"miter\";\n      for (const y of [70, 190, 310, 430]) { g.beginPath(); for (let x = -40, i = 0; x < DW + 40; x += 32, i++) g.lineTo(x, y + (i % 2 ? 16 : -16)); g.stroke(); }\n      for (let row = 0; row < 4; row++) for (let x = (row % 2) * 48; x < DW + 20; x += 96) {\n        const y = 130 + row * 120;\n        g.fillStyle = \"#2fbb66\"; g.beginPath(); g.moveTo(x, y - 22); g.lineTo(x + 18, y); g.lineTo(x, y + 22); g.lineTo(x - 18, y); g.closePath(); g.fill();\n        g.fillStyle = \"#f4f6ff\"; g.fillRect(x - 4, y - 4, 8, 8); g.fillRect(x + 44, y - 3, 6, 6);\n      }\n    },\n    // 32 Candy Stripe: diagonal peppermint stripes\n    (g) => {\n      g.fillStyle = \"#f4f6ff\"; g.fillRect(0, 0, DW, DH);\n      g.save(); g.translate(DW / 2, DH / 2); g.rotate(-0.6);\n      for (let x = -1400; x < 1400; x += 120) { g.fillStyle = \"#d6283a\"; g.fillRect(x, -900, 52, 1800); g.fillStyle = \"#2a8a4e\"; g.fillRect(x + 70, -900, 12, 1800); }\n      g.restore();\n    },\n    // 33 Gift Wrap: starry green paper with a gold ribbon\n    (g) => {\n      g.fillStyle = \"#1d7a41\"; g.fillRect(0, 0, DW, DH);\n      const star = (x, y, r) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i & 1 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } g.closePath(); g.fill(); };\n      for (let y = 30, row = 0; y < DH + 20; y += 70, row++) for (let x = (row % 2) * 45 + 20; x < DW + 20; x += 90) {\n        g.fillStyle = \"rgba(255,212,81,.85)\"; star(x, y, 13);\n        g.fillStyle = \"#f4f6ff\"; g.beginPath(); g.arc(x + 45, y + 35, 3, 0, 7); g.fill();\n      }\n      g.fillStyle = \"#ffd451\"; g.fillRect(0, 300, DW, 34); g.fillRect(DW * 0.55, 0, 34, DH);\n      g.fillStyle = \"#b8901a\"; g.fillRect(0, 300, DW, 4); g.fillRect(0, 330, DW, 4); g.fillRect(DW * 0.55, 0, 4, DH); g.fillRect(DW * 0.55 + 30, 0, 4, DH);\n    },\n    // 34 Frostbite: deep ice blue with glowing frost cracks\n    (g, e, team, rnd) => {\n      const gr = g.createLinearGradient(0, 0, DW, 0); gr.addColorStop(0, \"#0b2f5a\"); gr.addColorStop(1, \"#2a7fc4\");\n      g.fillStyle = gr; g.fillRect(0, 0, DW, DH);\n      const paths = [];\n      for (let k = 0; k < 11; k++) { let x = DW * (0.5 + rnd() * 0.5), y = 40 + rnd() * 440; const pts = [[x, y]]; for (let s = 0; s < 8; s++) { x -= 40 + rnd() * 70; y += (rnd() - 0.5) * 90; pts.push([x, y]); } paths.push(pts); }\n      const draw = (c, col, w) => { c.strokeStyle = col; c.lineWidth = w; c.lineCap = \"round\"; c.lineJoin = \"round\"; for (const pts of paths) { c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke(); } };\n      draw(g, \"#e8f6ff\", 5); draw(e, \"#6fd0ff\", 4);\n      g.fillStyle = \"#ffffff\"; for (let k = 0; k < 60; k++) { g.beginPath(); g.arc(rnd() * DW, rnd() * DH, 1.5 + rnd() * 2, 0, 7); g.fill(); }\n      return true;\n    }\n  ];\n"
  },
  {
    "before": "        k.add(extrude(A, 0.008, 0, 1), 0xff2040, GLOW(0xff1030, 1.8, 0.2), { p: [0, 0.018, s * 0.19], r: [0, s > 0 ? 0 : PI, 0] });\n      }\n    } }\n  ];\n",
    "after": "        k.add(extrude(A, 0.008, 0, 1), 0xff2040, GLOW(0xff1030, 1.8, 0.2), { p: [0, 0.018, s * 0.19], r: [0, s > 0 ? 0 : PI, 0] });\n      }\n    } },\n    // Snowdrift Season (Christmas event)\n    { name: \"Santa Cap\", ev: 1, make(k) {\n      k.add(horn([[0, 0.02, 0], [0, 0.13, -0.01], [0, 0.21, -0.06], [0.03, 0.24, -0.13], [0.06, 0.2, -0.17]], 0.105, 0.014, 18, 16), 0xd6283a, SATIN);\n      k.add(torus(0.105, 0.03, 10, 30), 0xf4f6ff, MATTE, { p: [0, 0.024, 0], r: [PI / 2, 0, 0] });\n      k.add(sph(0.034, 12, 10), 0xf4f6ff, MATTE, { p: [0.06, 0.19, -0.18], slot: 1 });\n    }, anim(o, t) { o.slots[1].position.y = Math.sin(t * 5) * 0.006; } },\n    { name: \"Elf Hat\", ev: 1, make(k) {\n      k.add(horn([[0, 0.01, 0], [0, 0.14, 0], [0, 0.25, -0.02], [0.02, 0.32, -0.07], [0.05, 0.33, -0.12]], 0.1, 0.006, 16, 18), (x, y) => Math.floor(y / 0.06) % 2 ? 0xe23b4a : 0x2fa35a, SATIN, { fc: true });\n      k.add(cyl(0.104, 0.11, 0.035, 24, 1, true), 0xe23b4a, SATIN, { p: [0, 0.012, 0] });\n      k.add(sph(0.022, 10, 8), 0xffd451, METAL, { p: [0.05, 0.325, -0.13] });\n    } },\n    { name: \"Rooftop Pine\", ev: 1, make(k) {\n      k.add(cyl(0.025, 0.025, 0.04, 10), 0x7a4a24, MATTE, { p: [0, 0.02, 0] });\n      k.add(cyl(0.004, 0.13, 0.13, 18), 0x1f8a49, MATTE, { p: [0, 0.1, 0] });\n      k.add(cyl(0.004, 0.1, 0.11, 18), 0x26a157, MATTE, { p: [0, 0.17, 0] });\n      k.add(cyl(0.004, 0.07, 0.09, 18), 0x2fbb66, MATTE, { p: [0, 0.23, 0] });\n      k.add(extrude(starShape(0.03, 0.013), 0.01, 0.003, 1), 0xffd451, GLOW(0xffb000, 1.2, 0.3), { p: [0, 0.29, 0] });\n      for (const [a, y, r, c] of [[0.4, 0.08, 0.1, 0xe23b4a], [2.3, 0.09, 0.095, 0x2e8bff], [4.2, 0.075, 0.1, 0xffd451], [1.4, 0.16, 0.07, 0xff8a1e], [3.4, 0.15, 0.072, 0xb48cff], [5.3, 0.165, 0.065, 0xe23b4a], [0.9, 0.22, 0.045, 0x2e8bff], [3.9, 0.215, 0.047, 0xffd451]])\n        k.add(sph(0.012, 8, 6), c, GLOW(c, 0.7, 0.3), { p: [Math.sin(a) * r, y, Math.cos(a) * r] });\n    } },\n    { name: \"Snow Globe\", ev: 1, make(k) {\n      k.add(cyl(0.085, 0.1, 0.05, 24), 0x7a4a24, SATIN, { p: [0, 0.025, 0] });\n      k.add(cyl(0.07, 0.07, 0.012, 24), 0xffd451, METAL, { p: [0, 0.055, 0] });\n      k.add(sph(0.074, 20, 10, 0, TAU, PI / 2, PI / 2), 0xf4f6ff, MATTE, { p: [0, 0.135, 0] });\n      k.add(cyl(0.004, 0.03, 0.05, 10), 0x1f8a49, MATTE, { p: [0, 0.125, 0] });\n      for (const [x, y, z] of [[0.03, 0.17, 0.02], [-0.035, 0.15, -0.01], [0.01, 0.19, -0.035], [-0.02, 0.18, 0.03], [0.04, 0.13, -0.03], [-0.045, 0.165, 0.02]])\n        k.add(sph(0.006, 6, 5), 0xffffff, MATTE, { p: [x, y, z], slot: 1 });\n      k.add(sph(0.08, 24, 18), 0xbfe8ff, { r: 0.05, t: 0.22 }, { p: [0, 0.135, 0] });\n    }, anim(o, t, dt) { o.slots[1].rotation.y += dt * 0.8; } },\n    { name: \"Gingerbread Pal\", ev: 1, make(k) {\n      const G = 0xb8672e, M = { r: 0.7 };\n      k.add(cyl(0.04, 0.05, 0.1, 14), G, M, { p: [0, 0.09, 0], s: [1, 1, 0.45] });\n      k.add(sph(0.045, 16, 12), G, M, { p: [0, 0.18, 0], s: [1, 1, 0.5] });\n      for (const s of [-1, 1]) {\n        k.add(cyl(0.017, 0.017, 0.07, 8), G, M, { p: [s * 0.065, 0.125, 0], r: [0, 0, s * 1.1] });\n        k.add(cyl(0.02, 0.02, 0.07, 8), G, M, { p: [s * 0.028, 0.03, 0], r: [0, 0, s * 0.25] });\n        k.add(sph(0.007, 6, 5), 0x2a160a, GLOSS, { p: [s * 0.016, 0.19, 0.022] });\n      }\n      for (const [y, c] of [[0.12, 0xe23b4a], [0.085, 0x2fbb66]]) k.add(sph(0.009, 8, 6), c, GLOSS, { p: [0, y, 0.024] });\n      k.add(torus(0.016, 0.003, 5, 12, PI), 0xf4f6ff, MATTE, { p: [0, 0.172, 0.022], r: [0, 0, PI] });\n    } }\n  ];\n"
  },
  {
    "before": "      k.add(extrude(starShape(0.034, 0.015), 0.01, 0.004, 1), 0xffcf3f, { r: 0.25, m: 1, e: 0xffa000, ei: 0.55 }, { p: [0, 0.03, 0], slot: 0 });\n    } }\n  ];\n",
    "after": "      k.add(extrude(starShape(0.034, 0.015), 0.01, 0.004, 1), 0xffcf3f, { r: 0.25, m: 1, e: 0xffa000, ei: 0.55 }, { p: [0, 0.03, 0], slot: 0 });\n    } },\n    // Snowdrift Season (Christmas event)\n    { name: \"Candy Cane\", ev: 1, make(k) {\n      k.add(horn([[0, 0, 0], [0, 0.09, 0], [0, 0.13, 0.015], [0, 0.145, 0.045], [0, 0.13, 0.07], [0, 0.11, 0.075]], 0.012, 0.012, 10, 24), (x, y, z) => Math.floor((y + z) / 0.022) % 2 ? 0xd6283a : 0xf4f6ff, GLOSS, { fc: true });\n    } },\n    { name: \"Frostflake\", ev: 1, make(k) {\n      const C = 0xbfe8ff, M = GLOW(0x6fd0ff, 0.9, 0.2), y = 0.075;\n      for (let i = 0; i < 3; i++) k.add(box(0.008, 0.13, 0.008), C, M, { p: [0, y, 0], r: [0, 0, i * PI / 3], slot: 1 });\n      for (let i = 0; i < 6; i++) { const a = i * PI / 3; for (const s of [-1, 1]) k.add(box(0.005, 0.03, 0.005), C, M, { p: [-Math.sin(a) * 0.042, y + Math.cos(a) * 0.042, 0], r: [0, 0, a + s * 0.7], slot: 1 }); }\n      k.add(sph(0.012, 10, 8), 0xffffff, M, { p: [0, y, 0], slot: 1 });\n    }, anim(o, t) { o.slots[1].rotation.y = t * 0.8; } },\n    { name: \"Bauble\", ev: 1, make(k) {\n      k.add(sph(0.055, 22, 16), 0xd6283a, GLOSS, { p: [0, 0.07, 0] });\n      k.add(torus(0.055, 0.007, 6, 30), 0xffd451, METAL, { p: [0, 0.07, 0], r: [PI / 2, 0, 0] });\n      k.add(cyl(0.015, 0.015, 0.016, 12), 0xffd451, METAL, { p: [0, 0.128, 0] });\n    } },\n    { name: \"Holly Sprig\", ev: 1, make(k) {\n      for (const s of [-1, 1]) k.add(sph(0.05, 12, 8), 0x1f8a49, { r: 0.45 }, { p: [s * 0.045, 0.05, 0], r: [0, 0, s * 0.5], s: [1, 0.42, 0.12] });\n      for (const [x, y] of [[-0.012, 0.035], [0.012, 0.035], [0, 0.055]]) k.add(sph(0.014, 10, 8), 0xd6283a, GLOSS, { p: [x, y, 0.01] });\n    } }\n  ];\n"
  },
  {
    "before": "{ name: \"Aurora\", lv: 1, c: 0x4dffb0, fx: \"aurora\" }\n];",
    "after": "{ name: \"Aurora\", lv: 1, c: 0x4dffb0, fx: \"aurora\" },\n  // Snowdrift Season (Christmas event)\n  { name: \"Snowfall\", lv: 1, c: 0xeaf8ff, fx: \"snow\", ev: 1 }, { name: \"Sleigh Bells\", lv: 1, c: 0xffd451, fx: \"bells\", ev: 1 }, { name: \"Peppermint Twist\", lv: 1, c: 0xd6283a, fx: \"candy\", ev: 1 }\n];"
  },
  {
    "before": "{ name: \"Neon Wave\", lv: 1, fx: \"neon\" }];",
    "after": "{ name: \"Neon Wave\", lv: 1, fx: \"neon\" },\n  { name: \"Present Pop\", lv: 1, fx: \"gift\", ev: 1 }, { name: \"Blizzard\", lv: 1, fx: \"blizzard\", ev: 1 }, { name: \"Northern Lights\", lv: 1, fx: \"northern\", ev: 1 }];"
  },
  {
    "before": "{ name: \"Chrome\", pass: 40 }];",
    "after": "{ name: \"Chrome\", pass: 40 }, { name: \"Frosted\", ev: 1 }];"
  },
  {
    "before": "mode: 2, spin: 1 })]\n  };\n  const PIXCOL = ",
    "after": "mode: 2, spin: 1 })],\n    snow: [pr({ shape: S.FLAKE, life: 1.6, size: [0.55, 0.3], drag: 2.2, grav: 1.2, c0: 0xffffff, c1: 0xbfe8ff, spin: 1.5, mode: 3, wob: 4, sizeVar: 0.5 }),\n      pr({ shape: S.GLOW, life: 0.4, size: [0.6, 0.2], drag: 3, c0: 0xeaf8ff, c1: 0x9fdcff, alpha: 0.5 })],\n    bells: [pr({ shape: S.SPARK, life: 0.9, size: [0.6, 0.12], drag: 2.2, grav: 1.2, c0: 0xfff3b0, c1: 0xffd451, spin: 2, mode: 2 }),\n      pr({ shape: S.STAR, life: 1.0, size: [0.5, 0.2], drag: 2, grav: 2, c0: 0xffd451, spin: 2, mode: 3 })],\n    candy: [pr({ shape: S.GLOW, life: 0.9, size: [0.6, 0.2], drag: 1.4, c0: 0xffffff, alpha: 0.95 }),\n      pr({ shape: S.GLOW, life: 0.9, size: [0.6, 0.2], drag: 1.4, c0: 0xff2a3a, alpha: 0.95 })],\n  };\n  const PIXCOL = "
  },
  {
    "before": "    const J = (s) => (Math.random() - 0.5) * s;\n    if (st === \"sparkle\") {",
    "after": "    const J = (s) => (Math.random() - 0.5) * s;\n    if (st === \"snow\") {\n      for (let i = n(45); i--;) sp(P[0], x + J(0.6), y + J(0.5), z + J(0.6), bx * 5 + J(3), by * 5 + J(2) + 0.5, bz * 5 + J(3));\n      for (let i = n(30); i--;) sp(P[1], x + J(0.3), y + J(0.3), z + J(0.3), bx * 7, by * 7, bz * 7);\n      return true;\n    }\n    if (st === \"bells\") {\n      for (let i = n(60); i--;) sp(P[0], x + J(0.5), y + J(0.4), z + J(0.5), bx * 6 + J(3), by * 6 + J(3) + 1, bz * 6 + J(3));\n      for (let i = n(10); i--;) sp(P[1], x + J(0.4), y + J(0.4), z + J(0.4), bx * 5 + J(2), by * 5 + J(2) + 1, bz * 5 + J(2));\n      return true;\n    }\n    if (st === \"candy\") {\n      perp(bx, by, bz);\n      const a = now * 14;\n      for (let s = 0; s < 2; s++) { const c = Math.cos(a + s * Math.PI) * 0.35, d = Math.sin(a + s * Math.PI) * 0.35; for (let i = n(55); i--;) sp(P[s], x + _e1.x * c + _e2.x * d, y + _e1.y * c + _e2.y * d, z + _e1.z * c + _e2.z * d, bx * 6, by * 6, bz * 6); }\n      return true;\n    }\n    if (st === \"sparkle\") {"
  },
  {
    "before": "      later(1.1, () => sphereBurst(PG.spark, C, 160 * L, 12, 32, cols, 1, 1));\n    }\n  };\n  const BOOM_KEYS = ",
    "after": "      later(1.1, () => sphereBurst(PG.spark, C, 160 * L, 12, 32, cols, 1, 1));\n    },\n    // Snowdrift Season: a present bursts open\n    gift(P, col, L) {\n      const C = P.clone(); C.y = Math.max(C.y, 3);\n      const cols = [0xd6283a, 0x2fbb66, 0xffd451, 0xffffff];\n      flash(C, 0xffd451, 14, 0.35);\n      sphereBurst(PG.conf, C, 260 * L, 14, 30, cols, 1, 1, 6);\n      sphereBurst(PG.star, C, 60 * L, 10, 22, [0xffd451, 0xffffff], 1, 1, 4);\n      for (let i = 0; i < 3; i++) later(i * 0.18, () => ring(C, cols[i], 22 + i * 8));\n      try { sfx.pop(0); } catch (e) {}\n    },\n    // Snowdrift Season: ice shards and a whirl of snow\n    blizzard(P, col, L) {\n      BOOMFX.ice(P, col, L);\n      const C = P.clone(); C.y = Math.max(C.y, 3);\n      for (let w = 0; w < 4; w++) later(w * 0.2, () => {\n        for (let k = 0; k < 90 * L; k++) { const a = Math.random() * 6.283, r = R(1, 5), s = R(14, 26); sp(PG.flake, C.x + Math.cos(a) * r, C.y + R(-2, 4), C.z + Math.sin(a) * r, -Math.sin(a) * s + Math.cos(a) * 6, R(2, 10), Math.cos(a) * s + Math.sin(a) * 6, -1); }\n      });\n      sphereBurst(PG.glow, C, 80 * L, 10, 24, [0xffffff, 0x9fdcff], 1, 0.7);\n    },\n    // Snowdrift Season: curtains of green and purple light rise from the goal\n    northern(P, col, L) {\n      const C = P.clone(); C.y = Math.max(C.y, 2);\n      flash(C, 0x4dffb0, 16, 0.6);\n      for (let w = 0; w < 6; w++) later(w * 0.15, () => {\n        const c = w % 2 ? 0xb48cff : 0x4dffb0;\n        for (let k = 0; k < 70 * L; k++) { const x = C.x + R(-14, 14); sp(PG.glow, x, C.y + R(0, 2), C.z + R(-2, 2) + Math.sin(x * 0.4 + w) * 2, R(-1, 1), R(10, 22), R(-1, 1), c, R(1.2, 2.2), 1.4); }\n      });\n      later(0.9, () => sphereBurst(PG.spark, C, 140 * L, 10, 26, [0x4dffb0, 0xb48cff, 0xffffff], 1, 1));\n    }\n  };\n  const BOOM_KEYS = "
  },
  {
    "before": "  { name: \"Diamond Driver\", col: \"#5cb8ff\", u: \"t4\", g: 1 }",
    "after": "  { name: \"Diamond Driver\", col: \"#5cb8ff\", u: \"t4\", g: 1 },\n  { name: \"Snow Driver\", col: \"#bfe8ff\", ev: 1 }, { name: \"Elf on the Pitch\", col: \"#5fd38a\", ev: 1 }, { name: \"North Pole Pro\", col: \"#ff7b7b\", ev: 1 }, { name: \"Holiday Hero\", col: \"#ffd451\", ev: 1, g: 1 }"
  },
  {
    "before": "u: \"t7\", glow: 1 }",
    "after": "u: \"t7\", glow: 1 },\n  { name: \"Snowy Night\", bg: \"radial-gradient(circle,#ffffff 0 1.5px,transparent 2.5px) 0 0/26px 22px,radial-gradient(circle,#9fd0ff 0 1px,transparent 2px) 9px 7px/17px 15px,#0e1d44\", ev: 1 },\n  { name: \"Candy Cane\", bg: \"repeating-linear-gradient(120deg,#b51f30 0 18px,#f4f6ff 18px 30px,#2a8a4e 30px 36px,#f4f6ff 36px 48px)\", ev: 1 },\n  { name: \"Fireside\", bg: \"radial-gradient(ellipse at 85% 120%,#ff8a1e 0,#c43a0e 30%,transparent 60%),radial-gradient(circle,#ffcf6a 0 1px,transparent 2px) 0 0/23px 19px,#2a0c06\", ev: 1 }"
  },
  {
    "before": "  if (owns(kind, i)) return \"\";                         // the developer gave it to you\n",
    "after": "  if (owns(kind, i)) return \"\";                         // the developer gave it to you\n  if (it.ev) return snowLock(kind, it);\n"
  },
  {
    "before": "  return { TOPPERS: TOPPERS.map(d => (d.admin ? { name: d.name, admin: true } : { name: d.name })), ANTENNAS: ANTENNAS.map(d => (d.admin ? { name: d.name, admin: true } : { name: d.name })),",
    "after": "  return { TOPPERS: TOPPERS.map(d => (d.admin ? { name: d.name, admin: true } : d.ev ? { name: d.name, ev: 1 } : { name: d.name })), ANTENNAS: ANTENNAS.map(d => (d.admin ? { name: d.name, admin: true } : d.ev ? { name: d.name, ev: 1 } : { name: d.name })),"
  },
  {
    "before": "  if (typeof s.name === \"string\") o.name = cleanName(s.name).slice(0, 14);\n",
    "after": "  if (typeof s.name === \"string\") o.name = cleanName(s.name).slice(0, 14);\n  if (s.ev && typeof s.ev === \"object\") o.ev = { hd: int(s.ev.hd | 0, 0, 1e6), got: int(s.ev.got | 0, 0, 1e6), adv: (s.ev.adv | 0) & 0x1ffffff };\n"
  }
];

export function applyGameFixes(html) {
  for (const {before,after} of patches) {
    const index = html.indexOf(before);
    if (index < 0 || html.indexOf(before,index+before.length) !== -1) {
      throw new Error('The game source changed; update the tested game-shell compatibility changes.');
    }
    html = html.slice(0,index)+after+html.slice(index+before.length);
  }
  return html.replace("/* NP_DRIVING_UPDATES */", () => drivingUpdates).replace("/* NP_SECURE_PROGRESS */", () => secureProgress).replace("/* NP_PLAYER_FEATURES */", () => playerFeatures).replace("/* NP_GAME_POLISH */", () => gamePolish).replace("/* NP_MATCH_EXPERIENCE */", () => matchExperience).replace("/* NP_PHONE_CONTROLS */", () => phoneControls).replace("/* NP_TOUCH_INPUT */", () => touchInput).replace("/* NP_CLAN_EMBLEMS */", () => clanEmblems).replace("/* NP_MOBILE_MENUS */", () => mobileMenus).replace("/* NP_INVITE_ALERTS */", () => inviteAlerts).replace("/* NP_SEASON_UPDATE */", () => [seasonUpdate, seasonRewards, seasonTools, snowdrift, paintsUi, adminMmr, menuMusic, moderationScript, moderationUi, privateMessages, menuLayout, "/* NP2D-START (website only: the CrazyGames build removes this block) */", sideswipe, sideswipeMenu, "/* NP2D-END */"].join("\n"));
}
