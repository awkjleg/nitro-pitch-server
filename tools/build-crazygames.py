#!/usr/bin/env python3
"""Build the CrazyGames version of Nitro Pitch as a zip.

The game page is the one nitropitch.app serves (start `npx wrangler dev --port 8787` first), changed for CrazyGames:
guest play only (no Firebase sign-in), no AdSense / cookie banner / terms pop-up, no links to other places to play,
relative file paths, three.js bundled, the CrazyGames SDK (gameplay start / stop), online play through the
nitropitch.app server, the Christmas event and replay sharing (which need accounts) left out, and original names
instead of Rocket League's for cars, ranks and modes.
Usage: python3 tools/build-crazygames.py <version>   ->  ../nitro-pitch-website/nitro-pitch-crazygames-v<version>.zip
"""
import os, re, sys, shutil, zipfile, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, 'public')
VERSION = sys.argv[1] if len(sys.argv) > 1 else 'dev'
OUT_DIR = os.path.join(os.path.dirname(ROOT), 'nitro-pitch-website')
SITE = 'https://nitropitch.app'

html = urllib.request.urlopen('http://localhost:8787/').read().decode('utf-8')

def sub(old, new, count=None, must=True):
    global html
    n = html.count(old)
    if must and n == 0: raise SystemExit('missing anchor: ' + old[:80])
    if count is not None and n != count: raise SystemExit('expected %d of %r, found %d' % (count, old[:60], n))
    html = html.replace(old, new)

# ---- no ads, cookie banner, error reports or terms pop-up (CrazyGames serves its own ads through its SDK)
html = re.sub(r'<script src="/error-report\.js"></script>', '', html)
html = re.sub(r'<script src="/cookie-consent\.js"[^>]*></script>', '', html)
html = re.sub(r'<script[^>]*pagead2\.googlesyndication\.com[^>]*></script>', '', html)
html = re.sub(r'<script src="/?game-notices\.js"></script>', '', html)
html = re.sub(r'<script src="/?privacy-consent\.js"></script>', '', html)
html = re.sub(r'<link rel="canonical"[^>]*>', '', html)
html = re.sub(r'<script type="application/ld\+json">.*?</script>', '', html, flags=re.S)

# ---- three.js bundled instead of loaded from a CDN
html = re.sub(r'<script src="https://cdn\.jsdelivr\.net/npm/three@0\.158\.0/build/three\.min\.js"></script>', '<script src="three.min.js"></script>', html)
if 'three.min.js"' not in html: raise SystemExit('three.js tag not found')

# ---- the website's own pages open on nitropitch.app; the game's files load with relative paths
for page in ['privacy-policy.html', 'terms-and-conditions.html', 'cookies.html', 'about']:
    html = html.replace('href="/' + page, 'target="_blank" rel="noopener" href="' + SITE + '/' + page)
html = re.sub(r'(src|href)="/(?!/)', r'\1="./', html)
html = html.replace('<script src="account-config.js"></script>', '<script src="./account-config.js"></script>')

# ---- the CrazyGames SDK
sub('<head>', '<head>\n<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>', count=1)

# ---- original names (display only: the game finds cars by their place in the list)
for a, b in [("Rocket League's", "classic car soccer's"), ("Rocket League", "classic car soccer"), ("Grand Champion", "Grand Master"),
             ("Supersonic Legend", "Hypersonic Legend"), ("Heatseeker", "Homing Ball"), ("Dropshot", "Floor Breaker"),
             ("Snow Day", "Ice Puck"), ("Rumble", "Power-Up Chaos"), ("Soccar", "Classic")]:
    html = html.replace(a, b)

# ---- features that need nitropitch.app accounts or pages are left out
html = re.sub(r" Sign in when you(’|')re ready for online matches\.", "", html)
html = html.replace('ns.textContent = "Controls, camera, account";', 'ns.textContent = "Controls, camera";')
sub('const OK = typeof Notification === "function" && window.isSecureContext;', 'const OK = false;', count=1)
# CrazyGames hosts its own copy and updates it from the portal: no version.txt checks
sub('  if (!/^https?:$/.test(location.protocol) || document.hidden || updateReady) return;\n  try { const r = await fetch("version.txt?t="', '  return;\n  try { const r = await fetch("version.txt?t="', count=1)
sub('if (location.hostname === "localhost" || location.hostname === "127.0.0.1") window.npDev = code => eval(code);', '', count=1)

CG = r'''
// ---- CrazyGames build: original car names, the CrazyGames SDK (gameplay start / stop), nitropitch.app-only parts hidden
{
  const CAR_NAMES = ["Striker", "Viper", "Arrow", "Bulldog", "Foxhound", "Toxin", "Blowback", "Guardian", "Rhino", "Hotrod", "Gadget", "Kaze", "Beetle", "Hellcat",
    "Stingray", "Vertex", "Tremor", "Tornado", "Reaper", "Gecko", "Hunter 77", "Katana", "Apex GP", "Warden", "Huntress"];
  CAR_NAMES.forEach((n, i) => { if (CARS[i] && !CARS[i].admin && CARS[i].name !== "ADMIN") CARS[i].name = n; });
  const HB = { Octane: "Balanced", Dominus: "Long", Plank: "Flat", Breakout: "Sleek", Hybrid: "Hybrid" };
  const sel = renderGarageSel;
  renderGarageSel = function () { sel.apply(this, arguments); if (gTab === "body") { const it = gList(gTab)[gSel] || gList(gTab)[0]; const t = $("gInfo"); if (t && HB[it.hb]) t.textContent = t.textContent.replace(it.hb + " hitbox", HB[it.hb] + " hitbox"); } };
  const style = document.createElement("style");
  style.textContent = "body{-webkit-user-select:none;-moz-user-select:none;user-select:none}input,textarea{-webkit-user-select:text;user-select:text}#setAcct,#fbBtn,#linksBtn,#np-about,#acctBtn,#navAccount,#notifPop,[data-rp=\"share\"],.ctab[data-ct=\"clan\"],.ctab[data-ct=\"lb\"],.lc-tab[data-lt=\"clan\"],.lc-rep{display:none!important}body.cg-nochat #lchat,body.cg-nochat #npTouchChat,body.cg-nochat #tChat{display:none!important}#cgLegal{position:fixed;left:50%;transform:translateX(-50%);bottom:34px;white-space:nowrap;z-index:20;font:12px/1.3 \"Chakra Petch\",sans-serif;color:#9fb0d4}#cgLegal[hidden]{display:none}#cgLegal a{color:#cfe2ff}";
  document.head.append(style);
  const SDK = () => window.CrazyGames && window.CrazyGames.SDK;
  let ready = false, playing = false;
  // saves: the CrazyGames Data module keeps the profile with the player's CrazyGames account (any device once logged
  // in; this browser for guests). On first use the progress already in this browser moves into it.
  const cgStore = {
    load: async () => { try { const s = SDK().data.getItem("np-cloud"); return s ? JSON.parse(s) : null; } catch { return null; } },
    save: async d => { SDK().data.setItem("np-cloud", JSON.stringify(d)); }
  };
  async function cgAccount() {
    try { await adoptStore(cgStore, true); } catch {}
    // their CrazyGames username is their name in the game
    try {
      if (!SDK().user.isUserAccountAvailable) return;
      const u = await SDK().user.getUser();
      const nm = u && u.username ? cleanName(u.username).slice(0, 14) : "";
      if (nm && profile.name !== nm) { profile.name = nm; $("nick").value = nm; me.name = nm; saveProfile(); lobbyPresence(); renderMenuChrome(); }
    } catch {}
  }
  (async () => {
    try { await SDK().init(); ready = true; } catch { return; }
    try { SDK().game.loadingStop(); } catch {}
    await cgAccount();
    try { SDK().user.addAuthListener(() => cgAccount()); } catch {}
    // audio follows CrazyGames' mute setting
    const cgMute = () => { try { const m = !!(SDK().game.settings && SDK().game.settings.muteAudio); if (m !== sfx.muted) { sfx.toggle(); renderSoundBtn(); } } catch {} };
    cgMute(); try { SDK().game.addSettingsChangeListener(() => cgMute()); } catch {}
    // opened from a friend's invite link: join their party as soon as the online lobby is up
    let invite = ""; try { invite = normPartyCode(SDK().game.getInviteParam("roomId") || ""); } catch {}
    if (invite) { const t0 = Date.now(), t = setInterval(() => { if (Date.now() - t0 > 45000) { clearInterval(t); return; } if (roomApi && onlineOk && partyCodeShown()) { clearInterval(t); setTimeout(() => { if (partyJoinCode(invite)) toast("Joining your friend's party…"); }, 800); } }, 700); }
    // Instant Multiplayer (a party leader starting from CrazyGames): straight to the party, ready to invite friends
    try { if (SDK().game.isInstantMultiplayer && !invite) { showScreen("home"); toast("Invite friends with the Invite button, then search together or start a private match"); } } catch {}
  })();
  // the party is the CrazyGames "room": its code is the room id, open to friends until it is full (6)
  let cgRoom = "", cgLink = "";
  setInterval(() => {
    if (!ready) return;
    const c = roomApi && onlineOk ? partyCodeShown() : "", ps = c ? partyState() : null, open = !!ps && ps.size < PARTY_MAX;
    const key = c + "|" + open;
    if (!c || key === cgRoom) return;
    cgRoom = key;
    try { SDK().game.updateRoom({ roomId: c, isJoinable: open, inviteParams: { roomId: c } }); } catch {}
    try { cgLink = SDK().game.inviteLink({ roomId: c }); } catch {}
    try { SDK().game.showInviteButton({ roomId: c }); } catch {}
  }, 2000);
  // a friend's invite accepted while the game is already open: join their party
  const cgJoin = params => { const code = normPartyCode(params && (params.roomId || params.roomName) || ""); if (!code) return; const t0 = Date.now(), t = setInterval(() => { if (Date.now() - t0 > 45000) { clearInterval(t); return; } if (roomApi && onlineOk && mode === "menu") { clearInterval(t); if (partyJoinCode(code)) toast("Joining your friend's party…"); } }, 700); };
  const cgHooks = setInterval(() => { if (!ready) return; clearInterval(cgHooks); try { SDK().game.addJoinRoomListener(cgJoin); } catch {} }, 500);
  // chat follows CrazyGames' disableChat setting
  const chatOff = () => { let off = false; try { off = !!(SDK().game.settings && SDK().game.settings.disableChat); } catch {} document.body.classList.toggle("cg-nochat", off); return off; };
  { const qc = quickChat; quickChat = function () { if (ready && chatOff()) return; return qc.apply(this, arguments); }; }
  const cgChat = setInterval(() => { if (!ready) return; clearInterval(cgChat); chatOff(); try { SDK().game.addSettingsChangeListener(() => chatOff()); } catch {} }, 500);
  // the Terms and Privacy Policy, shown on the main menu
  {
    const legal = document.createElement("div"); legal.id = "cgLegal";
    legal.innerHTML = 'By playing you agree to the <a href="https://nitropitch.app/terms-and-conditions.html" target="_blank" rel="noopener">Terms</a> and <a href="https://nitropitch.app/privacy-policy.html" target="_blank" rel="noopener">Privacy Policy</a>';
    document.body.append(legal);
    setInterval(() => { legal.hidden = !(mode === "menu" && screen === "home"); }, 500);
  }
  {
    const copy = $("partyCodeCopy").onclick;
    $("partyCodeCopy").onclick = async function () {
      const c = partyCodeShown();
      let link = ""; try { link = ready && c ? SDK().game.inviteLink({ roomId: c }) : ""; } catch {}
      if (!link) return copy && copy.apply(this, arguments);
      try { await navigator.clipboard.writeText(link); toast("Invite link copied: send it to a friend"); } catch { prompt("Copy this invite link:", link); }
    };
  }
  // ranked: confirm the result to the server like account players do, so mixed matches count for everyone
  {
    const over = onMatchOver;
    onMatchOver = function () {
      try {
        if (mode === "online" && game && match.mid && (me.team === 0 || me.team === 1)) {
          const mid = match.mid, score = match.s.slice(), room = game;
          for (const ms of [0, 1500, 4000, 9000, 20000]) setTimeout(() => { try { room.send && room.send({ t: "result-ack", mid, score }); } catch {} }, ms);
        }
      } catch {}
      return over.apply(this, arguments);
    };
  }
  setInterval(() => {
    if (!ready) return;
    const now = mode !== "menu" && !paused && ["countdown", "play", "goal", "replay"].includes(match.ph);
    if (now === playing) return;
    playing = now;
    try { if (now) SDK().game.gameplayStart(); else SDK().game.gameplayStop(); } catch {}
  }, 500);
}
'''
anchor = '    prune(); new MutationObserver(prune).observe(itemSel, { childList: true });\n  };\n}\n'
sub(anchor, anchor + CG, count=1)
if '/api/' in html.replace("fetch('/api/progress'", ''): pass

# ---- account settings: guest play only (no Firebase), online play through the nitropitch.app server
config = '''// Nitro Pitch on CrazyGames: guest play only (progress saves in this browser). Online play uses the nitropitch.app server.
window.NP_ROOM_SERVER = "wss://nitropitch.app/ws";
'''
cfg_src = open(os.path.join(PUB, 'account-config.js')).read()
m = re.search(r'window\.NP_ICE_SERVERS = \[.*?\];', cfg_src, re.S)
if m: config += m.group(0) + '\n'

# ---- collect the files the page uses
build = os.path.join('/tmp', 'np-crazygames-build')
shutil.rmtree(build, ignore_errors=True); os.makedirs(build)
open(os.path.join(build, 'index.html'), 'w').write(html)
open(os.path.join(build, 'account-config.js'), 'w').write(config)

shutil.copy(os.path.join(ROOT, 'node_modules', 'three', 'build', 'three.min.js'), os.path.join(build, 'three.min.js'))
# the Coming soon picture (the countdown to the Christmas event)
cs = open(os.path.join(PUB, 'coming-soon.html')).read()
cs = re.sub(r'<link rel="icon"[^>]*>', '', cs).replace('href="/"', 'href="#"')
open(os.path.join(build, 'coming-soon.html'), 'w').write(cs)
missing = []
for ref in sorted(set(re.findall(r'(?:src|href)="\./([^"#?]+)"', html))):
    if ref in ('account-config.js', 'three.min.js'): continue
    srcp = os.path.join(PUB, ref)
    if os.path.isfile(srcp):
        os.makedirs(os.path.dirname(os.path.join(build, ref)), exist_ok=True); shutil.copy(srcp, os.path.join(build, ref))
    else: missing.append(ref)
if missing: print('not found (left out):', missing)
for bad in ['googlesyndication', 'cookie-consent', 'game-notices', 'firebaseapp']:
    if bad in open(os.path.join(build, 'index.html')).read(): print('warning: still mentions', bad)
os.makedirs(OUT_DIR, exist_ok=True)
zpath = os.path.join(OUT_DIR, 'nitro-pitch-crazygames-v%s.zip' % VERSION)
with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
    for dp, _, fs in os.walk(build):
        for f in fs: z.write(os.path.join(dp, f), os.path.relpath(os.path.join(dp, f), build))
total = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(build) for f in fs)
print(zpath, 'files:', sum(len(fs) for _, _, fs in os.walk(build)), 'size MB: %.2f' % (total / 1e6))
