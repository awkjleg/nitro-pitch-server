import matchExperience from "./match-experience.txt";
import secureProgress from "./secure-progress.txt";
import gamePolish from "./game-polish.txt";
import drivingUpdates from "./driving-updates.txt";
import playerFeatures from "./player-features.txt";
// The original game is a single prebuilt HTML asset. Keep the small, reviewed
// compatibility changes here while the asset stays unchanged. Test these anchors
// whenever replacing public/index.html with a new game build.
const patches = [
  {
    "before": "})();\n\n// Nitro Pitch: online rooms through your own Cloudflare server (server/src/worker.js), the same \"room\" interface as\n// peer-room.js. Players connect to the server with a WebSocket, which works on networks that block peer-to-peer\n// connections (school and work networks). If the server can't be reached when the page opens (not set up yet, down, or\n// over its daily free limit), the game uses peer-room.js instead.\n// The server's address: window.NP_ROOM_SERVER in account-config.js (wss://\u2026/ws); \"\" turns the server off. Add ?p2p=1 to\n// the page address to skip the server.\n(() => {\n  const P2P = window.claude && window.claude.__np ? window.claude : null;      // peer-room.js (null inside Claude)\n  if (!P2P || typeof WebSocket !== \"function\") return;\n  const DEFAULT_URL = \"wss://nitropitch.bibleway.workers.dev/ws\";\n  // the lobby falls back to peer-to-peer only if the server can't be reached: no connection within OPEN_WAIT, or it\n  // connected but never sent the room (STATE_WAIT; generous, a slow device can be busy loading the game meanwhile)\n  const OPEN_WAIT = 8000, STATE_WAIT = 30000;\n  const PING = 10000, PONG_WAIT = 7000;           // keepalive (answered by the server without waking the room)\n  const clone = o => JSON.parse(JSON.stringify(o));\n  const applyPatch = (dst, p) => { for (const k in p) { if (p[k] === null) delete dst[k]; else dst[k] = p[k]; } return dst; };\n  const rnd = () => Math.random().toString(36).slice(2, 10);\n  const ME = \"s\" + rnd() + rnd().slice(0, 4);     // this tab's id in every room\n  const serverUrl = () => { const v = window.NP_ROOM_SERVER; return v === \"\" ? \"\" : typeof v === \"string\" ? v : DEFAULT_URL; };\n\n  class Room {\n    constructor(name, soft) {\n      this.name = name; this.soft = !!soft; this.me = ME;\n      this.pres = {}; this.sent = {}; this.others = new Map();\n      this.cbs = []; this.connCbs = []; this.snap = Object.freeze([]);\n      this.ws = null; this.isConnected = false; this.closed = false; this.created = undefined; this.tries = 0;\n      this.opened = new Promise((res, rej) => { this.openRes = res; this.openRej = rej; }); this.opened.catch(() => {});\n      this.openDone = false;\n      this.rebuild();\n      this.connect();\n    }\n    rebuild() {\n      const list = [Object.freeze({ peer: this.me, sameTab: true, isMe: true, kind: \"viewer\", guest: false, by: null, presence: Object.freeze(clone(this.pres)), updatedAt: Date.now() })];\n      for (const [id, e] of this.others) list.push(Object.freeze({ peer: id, sameTab: false, isMe: false, kind: \"viewer\", guest: false, by: null, presence: e.presence, updatedAt: e.updatedAt }));\n      this.snap = Object.freeze(list);\n    }\n    fire(joined = [], left = [], updated = []) { for (const f of this.cbs) { try { f({ peers: this.snap, joined, left, updated }); } catch (e) { console.error(e); } } }\n    entry(id) { return this.snap.find(x => x.peer === id); }\n    setConnected(c) { if (c === this.isConnected) return; this.isConnected = c; for (const f of this.connCbs) { try { f(c); } catch {} } }\n    upsert(id, p, full) {\n      if (id === this.me) return;\n      const prev = this.others.get(id);\n      this.others.set(id, { presence: Object.freeze(full ? clone(p) : applyPatch(prev ? clone(prev.presence) : {}, p)), updatedAt: Date.now() });\n      this.rebuild();\n      if (prev) this.fire([], [], [this.entry(id)]); else this.fire([this.entry(id)]);\n    }\n    remove(id) {\n      const prev = this.others.get(id); if (!prev) return;\n      this.others.delete(id); this.rebuild();\n      this.fire([], [Object.freeze({ peer: id, sameTab: false, isMe: false, kind: \"viewer\", guest: false, by: null, presence: prev.presence, updatedAt: prev.updatedAt })]);\n    }\n    connect() {\n      if (this.closed) return;\n      let ws;\n      try { ws = new WebSocket(serverUrl() + \"?room=\" + encodeURIComponent(this.name) + \"&id=\" + ME); } catch { this.lost(null); return; }\n      this.ws = ws; let pongT = 0;\n      const giveUp = () => { if (!this.openDone) { this.openDone = true; this.openRej({ code: \"network\" }); this.leave(); } };\n      let first = setTimeout(giveUp, OPEN_WAIT);\n      ws.onopen = () => { clearTimeout(first); first = setTimeout(giveUp, STATE_WAIT); ws.send(JSON.stringify({ t: \"hello\", p: this.pres })); };\n      ws.onmessage = e => {\n        if (e.data === \"pong\") { clearTimeout(pongT); pongT = 0; return; }\n        let m; try { m = JSON.parse(e.data); } catch { return; }\n        if (!m || typeof m !== \"object\") return;\n        if (m.t === \"state\") {\n          clearTimeout(first); this.tries = 0;\n          const keep = new Set(Object.keys(m.members || {}));\n          for (const id of [...this.others.keys()]) if (!keep.has(id)) this.remove(id);\n          for (const [id, p] of Object.entries(m.members || {})) if (p && typeof p === \"object\") this.upsert(id, p, true);\n          if (this.created === undefined) this.created = !!m.created;\n          this.setConnected(true);\n          if (!this.openDone) { this.openDone = true; this.openRes(this); }\n          return;\n        }\n        if (typeof m.id === \"string\" && m.id) {\n          if ((m.t === \"j\" || m.t === \"f\") && m.p && typeof m.p === \"object\") this.upsert(m.id, m.p, true);\n          else if (m.t === \"p\" && m.p && typeof m.p === \"object\") this.upsert(m.id, m.p, !this.others.has(m.id));\n          else if (m.t === \"l\") this.remove(m.id);\n          return;\n        }\n        if (m.t === \"resync\") ws.send(JSON.stringify({ t: \"full\", p: this.pres }));   // the room forgot us while it slept\n      };\n      ws.onclose = ws.onerror = () => { clearTimeout(first); clearInterval(ws._ping); clearTimeout(pongT); if (this.ws === ws) { if (!this.openDone) giveUp(); else this.lost(ws); } };\n      ws._ping = setInterval(() => {\n        if (ws.readyState !== 1) return;\n        try { ws.send(\"ping\"); } catch {}\n        if (!pongT) pongT = setTimeout(() => { try { ws.close(); } catch {} }, PONG_WAIT);   // no answer: the link is dead\n      }, PING);\n    }\n    lost(ws) {\n      if (ws && this.ws !== ws) return;\n      this.ws = null; this.setConnected(false);\n      if (this.closed || !this.openDone) return;                  // (still opening: the first-answer timer decides)\n      const ms = Math.min(8000, 800 * 2 ** this.tries++) + Math.random() * 400;\n      clearTimeout(this.retryT); this.retryT = setTimeout(() => this.connect(), ms);\n    }\n    wake() { if (!this.closed && !this.ws) { clearTimeout(this.retryT); this.connect(); } }\n    // ---------- the interface the game uses (same as peer-room.js) ----------\n    async presence(patch) {\n      if (!patch || typeof patch !== \"object\") return;\n      const out = {}; let n = 0;\n      for (const k in patch) { const v = patch[k] === undefined ? null : patch[k], j = JSON.stringify(v); if (this.sent[k] !== j) { this.sent[k] = j; out[k] = v; n++; } }\n      if (!n) return;\n      applyPatch(this.pres, clone(out));\n      this.rebuild(); this.fire([], [], [this.snap[0]]);\n      if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ t: \"p\", p: out }));\n    }\n    peers() { return this.snap; }\n    onPeers(cb, err) { this.cbs.push(cb); setTimeout(() => cb({ peers: this.snap, joined: this.snap, left: [], updated: [] })); return () => { this.cbs = this.cbs.filter(f => f !== cb); }; }\n    onConnection(cb) { this.connCbs.push(cb); setTimeout(() => cb(this.isConnected)); return () => { this.connCbs = this.connCbs.filter(f => f !== cb); }; }\n    connected() { return this.isConnected; }\n    async emit() {}\n    on() { return () => {}; }\n    async leave() {\n      if (this.closed) return;\n      this.closed = true; clearTimeout(this.retryT);\n      const ws = this.ws; this.ws = null;\n      if (ws) { try { if (ws.readyState === 1) ws.send('{\"t\":\"bye\"}'); ws.close(1000); } catch {} }\n      if (rooms.get(this.name) === this) rooms.delete(this.name);\n      if (!this.openDone) { this.openDone = true; this.openRej({ code: \"left\" }); }\n    }\n    async join(name) { return openRoom(name); }\n  }\n  const rooms = new Map();\n  function openRoom(name, soft) {\n    name = String(name);\n    const have = rooms.get(name);\n    if (have && !have.closed) return have.opened;\n    const r = new Room(name, soft); rooms.set(name, r);\n    return r.opened;\n  }\n  // back online / tab awake: reconnect at once\n  addEventListener(\"online\", () => { for (const r of rooms.values()) r.wake(); });\n  document.addEventListener(\"visibilitychange\", () => { if (document.visibilityState === \"visible\") for (const r of rooms.values()) r.wake(); });\n  addEventListener(\"pagehide\", () => { for (const r of [...rooms.values()]) r.leave(); });\n\n  let lobby = null;\n  window.npRoomMode = \"connecting\";\n  window.claude = {\n    __np: true,\n    use: async name => {\n      if (name !== \"room\") return null;\n      if (lobby && !lobby.closed) return lobby;\n      if (serverUrl() && !/[?&]p2p=1/.test(location.search)) {\n        try { lobby = await openRoom(\"lobby\", true); window.npRoomMode = \"server\"; return lobby; }\n        catch { /* the server can't be reached: peer-to-peer instead */ }\n      }\n      window.npRoomMode = \"p2p\";\n      return (lobby = await P2P.use(name));\n    }\n  };\n  window.npServerDebug = () => ({ me: ME, url: serverUrl(), mode: window.npRoomMode, rooms: [...rooms.values()].map(r => ({ name: r.name, connected: r.isConnected, created: r.created, peers: r.snap.length })) });\n})();\n\n</script>\n<script src=\"account-config.js\"></script>\n<script>\n",
    "after": "})();\n\n</script>\n<script src=\"/online-rooms.js\"></script>\n\n<script src=\"account-config.js\"></script>\n<script>\n"
  },
  {
    "before": "const $ = id => document.getElementById(id);\n// release number: goes up with every update (the website also serves it in version.txt)\nconst BUILD = 2026111001;\n// patch notes: a pop-up on the main menu, shown once per player per version (v), after each update (see showPatchNotes)\nconst PATCH_NOTES = { v: \"5.4\", title: \"Update 5.4: ADMIN items are the admin's\", notes: [\n",
    "after": "const $ = id => document.getElementById(id);\n// release number: goes up with every update (the website also serves it in version.txt)\nconst BUILD = 2026111012;\n// patch notes: a pop-up on the main menu, shown once per player per version (v), after each update (see showPatchNotes)\nconst PATCH_NOTES = { v: \"5.4\", title: \"Update 5.4: ADMIN items are the admin's\", notes: [\n"
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
    "after": "const PATCH_NOTES = {\n  \"v\": \"5.14\",\n  \"title\": \"Update 5.14: Stay connected, feel every hit\",\n  \"notes\": [\n    \"Match seats stay reserved for 60 seconds during a connection interruption, with clear reconnecting indicators.\",\n    \"Returning to a background tab preserves your place in the team lineup.\",\n    \"Ball contacts have speed-based sparks and stronger sound feedback. Saves and shots get clear personal feedback.\",\n    \"The match summary highlights goals, assists, saves, shots and your next level unlock. Party Up invites your available teammates.\",\n    \"Refresh from the menu when prompted to load this update.\"\n  ]\n};\n"
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
    "after": "requestAnimationFrame(frame);\n/* NP_DRIVING_UPDATES */\n/* NP_SECURE_PROGRESS */\n/* NP_PLAYER_FEATURES */\n/* NP_GAME_POLISH */\n/* NP_MATCH_EXPERIENCE */\n})();\n</script>"
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
    "after": "<script src=\"/progress-api.js\"></script>\n<link rel=\"stylesheet\" href=\"/game-polish.css\">\n</head>"
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
    "before": "function startLocalMatch(m) { startOfflineMatch(matchCfg(m), m.team === 1 ? 1 : 0); }",
    "after": "function startLocalMatch(m) { const cfg=matchCfg(m); cfg.rk=0; cfg.mm=0; startOfflineMatch(cfg, m.team === 1 ? 1 : 0); toast(\"Practice match against bots: earn XP, rank unchanged\"); }"
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
  return html.replace("/* NP_DRIVING_UPDATES */", () => drivingUpdates).replace("/* NP_SECURE_PROGRESS */", () => secureProgress).replace("/* NP_PLAYER_FEATURES */", () => playerFeatures).replace("/* NP_GAME_POLISH */", () => gamePolish).replace("/* NP_MATCH_EXPERIENCE */", () => matchExperience);
}
