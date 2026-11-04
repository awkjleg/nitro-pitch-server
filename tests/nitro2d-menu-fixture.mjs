// A small stand-in for the game closure, enough to run src/sideswipe-menu.txt under node:vm against the served page's DOM.
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {html, raw, read} from './served-game.mjs';

export const menuSource = await read('src/sideswipe-menu.txt');
const grab = (start, end) => { const a = raw.indexOf(start), b = raw.indexOf(end, a); if (a < 0 || b < 0) throw new Error('anchor missing: ' + start); return raw.slice(a, b); };
const rankedSrc = grab('const Ranked = (() => {', 'if (typeof module !== "undefined") module.exports = Ranked;');
const mmSrc = grab('const MM = (() => {', 'if (typeof module !== "undefined") module.exports = MM;');

// the pure ladder + badge block, on its own
export function ladder() {
  const block = menuSource.slice(menuSource.indexOf('// ==== NP2D-RANKED-START'), menuSource.indexOf('// ==== NP2D-RANKED-END'));
  return vm.runInNewContext(block + '\nNP2DRanked;', {});
}

export function fixture({stored = null, menu2d = false, peers = []} = {}) {
  const dom = new JSDOM(html, {url: 'https://nitropitch.app/'}), w = dom.window, d = w.document;
  if (stored) w.localStorage.setItem('np-profile', JSON.stringify(stored));
  if (menu2d) w.localStorage.setItem('np-2d-menu', '1');
  const calls = [], toasts = [], saves = [];
  const RK0 = () => [500, 0, 0, 0, -1];
  const c = {
    window: w, document: d, localStorage: w.localStorage, Image: w.Image, console, Math, JSON, Date, Promise, setTimeout: () => 0, clearTimeout() {},
    $: id => d.getElementById(id), calls, toasts, saves,
    MMR_MAX: 4000, THEMES: Array.from({length: 8}, (_, i) => ({name: 'Arena ' + i})), MAXLV: 100,
    fin: x => typeof x === 'number' && Number.isFinite(x), clamp: (x, a, b) => x < a ? a : x > b ? b : x,
    RK0, mode: 'menu', screen: 'home', spec: null, freePlay: false, onlineOk: true, roomApi: null,
    search: null, lastSearch: null, searchTimer: 0, searchSimMs: 4500, foundT: 0, toastT: 0, partyKey: 'x', plKind: 'casual', lbKind: 'mmr',
    lastRank: null, rankAnimT: [], mmDone: new Set(), exh: {arena: 2, md: 2, df: 1, mut: [0, 0, 0, 0, 0, 0]},
    match: {mut: [0, 0, 0, 0, 0, 0, 0], md: 2, rk: 0, pl: 0, ph: 'demo', s: [0, 0]},
    profile: {xp: 0, games: 0, wins: 0, goals: 0, saves: 0, mvps: 0, rk: [RK0(), RK0(), RK0()], cm: 500, rt: -1, ab: null},
    PLAYLISTS: [null, {name: 'Duel', tag: '1v1'}, {name: 'Doubles', tag: '2v2'}, {name: 'Standard', tag: '3v3'}],
    sfx: {ready() {}, init() {}, levelUp() {}},
    party: {leader: 'me', isLeader: true, size: 1, members: [{peer: 'me', me: true, name: 'Me', lv: 1, rb: -1}]},
    peers,
  };
  c.int = (x, a, b) => c.clamp(Math.floor(x), a, b);
  c.okArr = (a, n) => Array.isArray(a) && a.length >= n && a.slice(0, n).every(c.fin);
  vm.createContext(c);
  vm.runInContext(rankedSrc + mmSrc + '\nglobalThis.Ranked = Ranked; globalThis.MM = MM;', c);
  vm.runInContext(`
    function cleanRk(e) { if (e && typeof e === 'object' && !Array.isArray(e)) e = [e.m, e.p, e.w, e.l, e.pk]; if (!Array.isArray(e) || !fin(e[0])) return RK0(); return [clamp(Math.round(e[0]), 0, MMR_MAX), e[1] | 0, e[2] | 0, e[3] | 0, fin(e[4]) ? e[4] : -1]; }
    // the game's sanitizeProfile keeps 3 rank entries and drops s2 / cm2
    function sanitizeProfile(s) { const o = {}; if (!s || typeof s !== 'object') return o; for (const k of ['xp', 'games', 'wins', 'goals', 'saves', 'mvps']) if (fin(s[k])) o[k] = s[k]; if (Array.isArray(s.rk)) o.rk = [0, 1, 2].map(i => cleanRk(s.rk[i])); if (fin(s.cm)) o.cm = s.cm; return o; }
    // start-up: this browser's save is loaded before the injected files run
    try { const s = JSON.parse(localStorage.getItem('np-profile') || 'null'); if (s) Object.assign(profile, sanitizeProfile(s)); } catch {}
    function settleAbandoned() { calls.push('settle'); }
    function rankView(pl) { return { pl, ladder: '3d' }; }
    function bestPlacedTier() { return -1; }
    function recordRankedResult(pl) { calls.push('rank3d:' + pl); return { pl }; }
    function recordCasualResult(a, b, won) { profile.cm += won ? 10 : -10; }
    function myMatchMmr() { return match.rk && match.pl ? profile.rk[Math.min(match.pl, 3) - 1][0] : profile.cm; }
    function onMatchOver() { profile.games++; profile.wins++; profile.goals += 3; profile.saves += 1; profile.mvps++; saveProfile(); }
    function saveProfile() { saves.push(JSON.parse(JSON.stringify(profile))); }
    function lobbyPresence() { calls.push('presence'); }
    function lbEntry() { return { mmr: 0, rank: -1 }; }
    function partyPresence() { return { pty: null }; }
    function loginGate() { return false; }
    const isPartyLeader = () => party.isLeader;
    function toast(t) { toasts.push(t); }
    function partyState() { return party; }
    function renderSearchBar() { const q = search; $('searchBar').hidden = !q; if (q) setTxt('searchWhat', (q.r === 1 ? 'Competitive' : q.r === 2 ? 'Extra · ' + ['Rumble'][q.x].name : 'Casual') + ' · ' + q.pl.map(s => s + 'v' + s).join(', ')); }
    function setTxt(id, t) { $(id).textContent = t; }
    const EXTRA_MODES = [{ name: 'Rumble', md: 3 }];
    function startSearch(kind, playlists, extraId) { search = { id: 'q3d', kind, r: kind === 'ranked' ? 1 : kind === 'extra' ? 2 : 0, pl: playlists.slice(), x: 0, t: 1 }; lastSearch = { kind, playlists, extraId: 0 }; return true; }
    function cancelSearch() { search = null; }
    function searchQ() { return search && { id: search.id, r: search.r, x: search.x, pl: search.pl, m: { 1: profile.cm, 2: profile.cm, 3: profile.cm }, n: party.size, mem: [], t: search.t }; }
    function lobbyPlayers() { return peers; }
    function onMatchFound(m) { calls.push('found3d'); return EXTRA_MODES[m.x | 0].name.length > 0; }
    function showMatchFound(t) { calls.push('found:' + t); }
    function hideMatchFound() {}
    function leaveToMenu() { calls.push('leave'); mode = 'menu'; match.ph = 'demo'; }
    function joinMatchmade(m) { calls.push('join'); }
    function matchCfg(m) { return { md: m.md, mut: [0, 0, 0, 0, 1, 0, 0], rk: m.r === 1 ? 1 : 0, pl: m.md, x: -1, mm: 1 }; }
    function startLocalMatch(m) { calls.push('local3d'); }
    function startOfflineMatch(cfg, team) { calls.push('offline'); match = Object.assign({}, cfg, { mut: cfg.mut.slice(), ph: 'countdown', s: [0, 0] }); mode = 'offline'; }
    function partySync() {}
    function matchTitle() { return 'Exhibition ' + match.md + 'v' + match.md; }
    function renderPartyInvite() {}
    function renderMenuChrome() { $('hEmb').src = 'ranked3d'; }
    function showScreen(s) { screen = s; calls.push('screen:' + s); }
    function rerenderScreen() { calls.push('rerender:' + screen); }
    function renderPlay() {}
    function renderPlaylists() {}
    function renderExhibition() {}
    function startExhibition() { calls.push('exhibition3d'); }
    function renderPrivate() {}
    function createPrivate(cfg) { calls.push(cfg); }
    function renderParty() {}
    function showStats(e) { calls.push(e); }
    const memberOf = p => ({ peer: p.peer, name: p.name, lv: p.lv, rb: p.rb });
    function statsForUid() {}
    function vetLook(u, o) { return o; }
    const okTitle = x => x | 0, okBanner = x => x | 0, cleanName = x => String(x);
    function renderCareer() { const st = $('cStats'); st.innerHTML = ''; for (const v of [profile.games, profile.wins]) { const b = document.createElement('b'); b.textContent = v; st.append(b); } $('cRanks').innerHTML = '<div class="rcard">3D</div>'; }
    async function renderLeaderboard() { calls.push('board3d'); }
    function selfMember() { return { peer: 'me', me: true }; }
    function namePlate() {}
    function tagEl() { return document.createElement('span'); }
    function clanLevel() { return { lv: 1 }; }
    function animateRank(rk) { calls.push('anim3d'); }
    function showroomEntries() { return [{ me: true, peer: 'me', rb: 3 }]; }
  `, c);
  vm.runInContext(menuSource + '\nglobalThis.api = NP2DMenu;', c);
  return {c, w, d, $: id => d.getElementById(id)};
}
