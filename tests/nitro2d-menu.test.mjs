import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture, ladder, menuSource} from './nitro2d-menu-fixture.mjs';
import {Ranked2D} from '../src/reward-rules.js';
// values made in the game's vm realm: compare their plain JSON form
const same = (a, b, m) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, m);

test('the 2D ladder mirrors the server: same MINS, placements and rank for every MMR', () => {
  const L = ladder();
  same([...L.MINS], [...Ranked2D.MINS]);
  assert.equal(L.MINS.length, 31); assert.equal(L.MINS[29], 29 * 55); assert.equal(L.MINS[30], 1650);
  assert.equal(L.PLACEMENTS, Ranked2D.PLACEMENTS);
  assert.equal(L.PLACEMENTS, 3);
  for (let mmr = 0; mmr <= 2000; mmr += 7) {
    const a = L.info(mmr), b = Ranked2D.info(mmr);
    for (const k of ['idx', 'name', 'tier', 'tierName', 'lvl', 'min', 'max']) assert.equal(a[k], b[k], k + ' at ' + mmr);
    assert(Math.abs(a.frac - b.frac) < 1e-9);
  }
  assert.equal(L.RANKS[0].name, 'Bronze I'); assert.equal(L.RANKS[29].name, 'Champion V'); assert.equal(L.RANKS[30].name, 'Legend');
  for (let t = -1; t <= 7; t++) assert.equal(L.sharedTier(t), Ranked2D.sharedTier(t));
});

test('every 2D badge is its own SVG with the rank numeral, and the Unranked badge is different', () => {
  const L = ladder(), seen = new Set();
  for (let i = -1; i <= 30; i++) {
    const svg = L.svg(i);
    assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 100 100">/);
    assert(!seen.has(svg), 'badge ' + i + ' repeats another'); seen.add(svg);
    assert(L.emblemURL(i).startsWith('data:image/svg+xml'));
  }
  assert.equal(L.svg(99), L.svg(30));
});

test('no player-visible text names the other game or its modes', () => {
  const strings = menuSource.match(/"[^"\n]*"|'[^'\n]*'|`[^`]*`/g);
  assert(strings.length > 100);
  for (const text of strings) assert.doesNotMatch(text, /sideswipe|rocket league/i);
});

test('old 3-entry profiles load with default 2D ranks, 2D stats and 2D casual MMR', () => {
  const {c} = fixture({stored: {xp: 900, games: 7, rk: [[700, 9, 6, 3, 4], [500, 0, 0, 0, -1], [610, 5, 3, 2, 2]], cm: 640}});
  assert.equal(c.profile.rk.length, 6);
  same(c.profile.rk[0], [700, 9, 6, 3, 4]);
  for (const i of [3, 4, 5]) same(c.profile.rk[i], [500, 0, 0, 0, -1]);
  same({...c.profile.s2}, {games: 0, wins: 0, goals: 0, saves: 0, mvps: 0});
  assert.equal(c.profile.cm2, 500);
  assert.equal(c.profile.games, 7);
});

test('6-entry profiles keep the 2D ranks, s2 and cm2 through the start-up load and every later sanitize', () => {
  const stored = {games: 3, rk: [[700, 9, 6, 3, 4], [500, 0, 0, 0, -1], [610, 5, 3, 2, 2], [880, 4, 3, 1, 16], [500, 1, 1, 0, -1], [455, 2, 0, 2, -1]], s2: {games: 4, wins: 3, goals: 9, saves: 2, mvps: 1}, cm2: 720};
  const {c} = fixture({stored});
  same(c.profile.rk.map(e => [...e]), stored.rk);
  same({...c.profile.s2}, stored.s2); assert.equal(c.profile.cm2, 720);
  // the account / progress-service form: rank entries as objects
  const cloud = c.sanitizeProfile({rk: stored.rk.map(([m, p, w, l, pk]) => ({m, p, w, l, pk})), s2: stored.s2, cm2: 690});
  same(cloud.rk.map(e => [...e]), stored.rk); assert.equal(cloud.cm2, 690); assert.equal(cloud.s2.goals, 9);
  // a full profile without 2D fields resets them instead of keeping another account's
  const fresh = c.sanitizeProfile({rk: [[600, 5, 3, 2, 1]]});
  same(fresh.rk.slice(3).map(e => [...e]), [[500, 0, 0, 0, -1], [500, 0, 0, 0, -1], [500, 0, 0, 0, -1]]);
  assert.equal(fresh.s2.games, 0); assert.equal(fresh.cm2, 500);
  // a 2D peak can go past the 3D ladder's top (Legend is idx 30)
  assert.equal(c.sanitizeProfile({rk: [0, 0, 0, [1700, 20, 15, 5, 30]].map(e => e || [500, 0, 0, 0, -1])}).rk[3][4], 30);
});

test('the Nitro 2D switch changes the menus, is saved and comes back after a reload', () => {
  const f = fixture();
  assert.equal(f.c.window.NP2D.menu, false); assert(!f.d.body.classList.contains('np2d'));
  const sw = f.$('np2dSwitch');
  assert.match(sw.textContent, /Nitro 2D/); assert.equal(f.$('navPlay').nextElementSibling, sw);
  sw.click();
  assert.equal(f.c.window.NP2D.menu, true); assert(f.d.body.classList.contains('np2d'));
  assert.equal(f.w.localStorage.getItem('np-2d-menu'), '1');
  assert.match(sw.textContent, /Nitro Pitch 3D/);
  assert.match(f.$('navPlay').textContent, /Side view/);
  const again = fixture({menu2d: true});
  assert.equal(again.c.window.NP2D.menu, true); assert(again.d.body.classList.contains('np2d'));
  again.$('np2dSwitch').click();
  assert.equal(again.c.window.NP2D.menu, false); assert.equal(again.w.localStorage.getItem('np-2d-menu'), '0');
  assert.match(again.$('navPlay').textContent, /Online & offline/);
});

test('the 2D play screen offers casual, ranked, private and an exhibition only', () => {
  const f = fixture({menu2d: true});
  f.c.renderPlay();
  const shown = id => !f.$(id).hidden;
  same(['pCasual', 'pRanked', 'pPrivate', 'pExhib'].map(shown), [true, true, true, true]);
  same(['pExtra', 'freeBtn', 'pTrain'].map(shown), [false, false, false]);
  f.$('np2dSwitch').click(); f.c.renderPlay();
  same(['pExtra', 'freeBtn', 'pTrain'].map(shown), [true, true, true]);
  // an extra-mode search can't start from the 2D menus
  f.$('np2dSwitch').click();
  assert.equal(f.c.startSearch('extra', [3], 0), false);
});

test('2D searches publish r 2 with x 100 / 101 and 2D ratings, and the matcher never mixes them with 3D', () => {
  const f = fixture({menu2d: true, stored: {rk: [[900, 9, 6, 3, 4], [500, 0, 0, 0, -1], [610, 5, 3, 2, 2], [300, 4, 3, 1, 5], [700, 3, 2, 1, 12], [1200, 5, 4, 1, 21]], cm: 800, cm2: 420}});
  const {c} = f;
  assert.equal(c.startSearch('ranked', [1, 2, 3]), true);
  assert.equal(c.search.r, 2); assert.equal(c.search.x, 101); same([...c.search.pl], [1, 2, 3]);
  let q = c.searchQ();
  assert.equal(q.r, 2); assert.equal(q.x, 101); same({...q.m}, {1: 300, 2: 700, 3: 1200});
  assert.equal(c.lastSearch.extraId, 101);
  c.renderSearchBar();
  assert.equal(f.$('searchWhat').textContent, 'Nitro 2D · Competitive · 1v1, 2v2, 3v3');
  c.search = null; c.startSearch('casual', [2]);
  q = c.searchQ(); assert.equal(q.x, 100); same({...q.m}, {1: 420, 2: 420, 3: 420});
  // the lobby matcher: a 2D search and a 3D search of the same size never meet; two 2D searches do
  const s2d = (peer, x) => ({peer, q: {id: peer, r: 2, x, pl: [1], m: {1: 500}, n: 1, t: 1}}), s3d = peer => ({peer, q: {id: peer, r: 0, x: 0, pl: [1], m: {1: 500}, n: 1, t: 1}});
  assert.equal(c.MM.plan([s2d('a', 100), s3d('b')], 2, new Set()).length, 0);
  assert.equal(c.MM.plan([s2d('a', 100), s2d('b', 101)], 2, new Set()).length, 0);
  const m = c.MM.plan([s2d('a', 101), s2d('b', 101)], 2, new Set());
  assert.equal(m.length, 1); assert.equal(m[0].r, 2); assert.equal(m[0].x, 101); assert.equal(m[0].md, 1);
  // the match: announced as Nitro 2D (not as an extra mode) and set up as a 2D ranked match in its playlist
  c.search = {id: 'a', r: 2, x: 101, pl: [1], t: 1};
  assert.equal(c.onMatchFound({code: 'abc', sid: 'a', r: 2, x: 101, md: 3, bm: 700, team: 0, expect: 6}), true);
  assert(c.calls.includes('found:Nitro 2D · Competitive 3v3')); assert(!c.calls.includes('found3d'));
  for (const [md, pl] of [[1, 4], [2, 5], [3, 6]]) {
    const cfg = c.matchCfg({r: 2, x: 101, md, bm: 700});
    assert.equal(cfg.mut[6], 6); assert.equal(cfg.rk, 1); assert.equal(cfg.pl, pl); assert.equal(cfg.mm, 1); assert.equal(cfg.x, -1);
    same(cfg.mut.filter((_, i) => i !== 4 && i !== 6), [0, 0, 0, 0, 0]);
  }
  const casual = c.matchCfg({r: 2, x: 100, md: 2});
  assert.equal(casual.rk, 0); assert.equal(casual.pl, 2); assert.equal(casual.mut[6], 6);
  // 3D searches are untouched
  assert.equal(c.matchCfg({r: 1, md: 2}).mut[6], 0);
  f.$('np2dSwitch').click(); c.search = null; c.startSearch('casual', [3]);
  assert.equal(c.search.id, 'q3d'); assert.equal(c.search.r, 0);
});

test('queue again after a 2D match searches 2D again, even from the 3D menus', () => {
  const {c} = fixture();
  c.startSearch('ranked', [2], 101);
  assert.equal(c.search.x, 101); assert.equal(c.search.r, 2);
});

test('party presence carries the 2D MMRs, 2D stats, best 2D rank and the menu mode', () => {
  const {c} = fixture({menu2d: true, stored: {rk: [[900, 9, 6, 3, 4], [500, 0, 0, 0, -1], [610, 5, 3, 2, 2], [300, 4, 3, 1, 5], [700, 3, 2, 1, 12], [1200, 0, 0, 0, -1]], cm2: 420, s2: {games: 4, wins: 3, goals: 9, saves: 2, mvps: 1}}});
  const p = c.partyPresence();
  same([...p.mv2], [420, 300, 700, 1200]);
  same([...p.st2], [4, 3, 9, 2, 1]);
  assert.equal(p.rb2, 12); assert.equal(p.m2, 1); assert.equal(p.pty, null);
});

test('a party member follows the leader between Nitro Pitch 3D and Nitro 2D', () => {
  const leader = {peer: 'L', name: 'Lead', pr: {m2: 1}};
  const f = fixture({peers: [leader]}), {c} = f;
  c.party = {leader: 'L', isLeader: false, size: 2, members: [{peer: 'L', name: 'Lead'}, {peer: 'me', me: true}]};
  c.partySync();
  assert.equal(c.window.NP2D.menu, true); assert.match(c.toasts.at(-1), /party is playing Nitro 2D/);
  // a member can't switch away on their own
  f.$('np2dSwitch').click(); assert.equal(c.window.NP2D.menu, true);
  leader.pr.m2 = 0; c.partySync();
  assert.equal(c.window.NP2D.menu, false); assert.match(c.toasts.at(-1), /Nitro Pitch 3D/);
  // in a match the menus wait
  leader.pr.m2 = 1; c.mode = 'online'; c.partySync(); assert.equal(c.window.NP2D.menu, false);
});

test('2D matches count in the 2D stats and the 2D rank, never in the 3D ones', () => {
  const {c} = fixture({stored: {games: 10, wins: 5, goals: 20, saves: 4, mvps: 2, rk: [[700, 9, 6, 3, 4], [500, 0, 0, 0, -1], [610, 5, 3, 2, 2]]}});
  c.match = {mut: [0, 0, 0, 0, 3, 0, 6], md: 1, rk: 1, pl: 4, ph: 'over', s: [3, 1]};
  c.mode = 'offline';
  c.onMatchOver();
  same([c.profile.games, c.profile.wins, c.profile.goals, c.profile.saves, c.profile.mvps], [10, 5, 20, 4, 2]);
  same({...c.profile.s2}, {games: 1, wins: 1, goals: 3, saves: 1, mvps: 1});
  assert.equal(c.saves.at(-1).s2.games, 1); assert.equal(c.saves.at(-1).games, 10);
  // the 2D ladder with 3 placement matches
  let r;
  for (let i = 0; i < 3; i++) r = c.recordRankedResult(4, 500, 500, true);
  assert.equal(r.ladder, '2d'); assert.equal(r.placedNow, true); assert.equal(c.profile.rk[3][1], 3);
  same(c.profile.rk[0], [700, 9, 6, 3, 4]);
  assert(!c.calls.some(x => x === 'rank3d:4'));
  assert.equal(c.profile.rk[3][4], c.api.view2(4).inf.idx);
  // 2D casual MMR
  c.match.rk = 0; c.recordCasualResult(500, 500, true); assert.equal(c.profile.cm2, 510); assert.equal(c.profile.cm, 500);
  assert.equal(c.myMatchMmr(), 510);
  // a 3D match still counts in 3D
  c.match = {mut: [0, 0, 0, 0, 3, 0, 0], md: 2, rk: 0, pl: 0, ph: 'over', s: [1, 0]};
  c.onMatchOver(); assert.equal(c.profile.games, 11); assert.equal(c.profile.s2.games, 1);
});

test('the career shows 2D stats and the three 2D ranks in the 2D menus and the 3D ones otherwise', () => {
  const f = fixture({menu2d: true, stored: {games: 10, wins: 5, rk: [[700, 9, 6, 3, 4], [500, 0, 0, 0, -1], [610, 5, 3, 2, 2], [880, 4, 3, 1, 16], [500, 1, 1, 0, -1], [500, 0, 0, 0, -1]], s2: {games: 4, wins: 3, goals: 9, saves: 2, mvps: 1}}});
  f.c.renderCareer();
  const stats = [...f.$('cStats').querySelectorAll('b')].map(b => b.textContent);
  same(stats, ['4', '3', '75%', '9', '2', '1']);
  const cards = [...f.$('cRanks').querySelectorAll('.rcard')];
  assert.equal(cards.length, 3);
  assert.match(cards[0].textContent, /Duel.*1v1.*Platinum II.*MMR 880/s);
  assert.match(cards[1].textContent, /Unranked.*Placement 1 of 3/s);
  assert.match(cards[2].textContent, /Standard.*Placement 0 of 3/s);
  assert(cards[0].querySelector('img').src.startsWith('data:image/svg+xml'));
  f.$('np2dSwitch').click(); f.c.renderCareer();
  same([...f.$('cStats').querySelectorAll('b')].map(b => b.textContent), ['10', '5']);
  assert.equal(f.$('cRanks').textContent, '3D');
});

test('the leaderboards show the 2D boards from the progress service while in the 2D menus', async () => {
  const f = fixture({menu2d: true}), asked = [];
  f.w.npAccounts = {user: () => ({uid: 'me1'}), clans: {getMany: async () => ({})}};
  f.w.NPProgressAPI = {call: async (action, data) => { asked.push({action, ...data}); return {rows: [{uid: 'u1', name: 'Ace', mmr: 1700, rank: 30, wins: 40, goals: 90}]}; }};
  await f.c.renderLeaderboard();
  same(asked[0], {action: 'leaderboard', field: 'mmr', limit: 40, board: '2d'});
  assert.match(f.$('lbList').textContent, /Ace.*Legend · 1700/s);
  f.c.lbKind = 'wins'; await f.c.renderLeaderboard();
  assert.equal(asked[1].field, 'wins'); assert.equal(asked[1].board, '2d'); assert.match(f.$('lbList').textContent, /40 wins/);
  f.$('np2dSwitch').click(); await f.c.renderLeaderboard();
  assert.equal(asked.length, 2); assert(f.c.calls.includes('board3d'));
});

test('leaving a match returns to the menus of its kind; 2D offline, private and exhibition matches are 2D', () => {
  const {c} = fixture();
  c.mode = 'offline'; c.match = {mut: [0, 0, 0, 0, 0, 0, 6], md: 2, ph: 'over', s: [0, 0]};
  c.leaveToMenu();
  assert.equal(c.window.NP2D.menu, true);
  c.mode = 'online'; c.match = {mut: [0, 0, 0, 0, 0, 0, 0], md: 2, ph: 'over', s: [0, 0]};
  c.leaveToMenu();
  assert.equal(c.window.NP2D.menu, false);
  c.window.NP2D.setMenu(true);
  c.exh.md = 3; c.startExhibition();
  assert.equal(c.match.mut[6], 6); assert.equal(c.match.md, 3); assert.equal(c.match.mut[4], 2); assert(!c.calls.includes('exhibition3d'));
  c.createPrivate({name: 'x', md: 2, mut: [1, 2, 1, 1, 5, 1, 2]});
  same([...c.calls.at(-1).mut], [0, 0, 0, 0, 5, 0, 6]);
  assert.equal(c.matchTitle(), 'Nitro 2D · Exhibition 3v3');
});

test('players lists tag each player with the game they are on, and presence publishes it', () => {
  const peers = [{peer: 'p1', name: 'Old', lv: 3, rb: -1, pr: {}}, {peer: 'p2', name: 'Flat', lv: 4, rb: -1, pr: {g2: 1, rb2: 7}}];
  const f = fixture({peers}), {c} = f;
  const ol = f.$('onlineList');
  for (const p of peers) { const row = f.d.createElement('div'); row.className = 'pm ol'; row.innerHTML = '<img><div class="who"><b>' + p.name + '</b></div>'; ol.append(row); }
  c.renderParty();
  const tags = [...ol.querySelectorAll('.np2d-game')].map(t => [t.textContent, t.classList.contains('on2d')]);
  same(tags, [['Nitro Pitch', false], ['Nitro 2D', true]]);
  assert.equal(c.partyPresence().g2, 0);
  f.$('np2dSwitch').click(); assert.equal(c.partyPresence().g2, 1);
  // in a match, the match decides
  c.mode = 'online'; c.match = {mut: [0, 0, 0, 0, 0, 0, 0]}; assert.equal(c.partyPresence().g2, 0);
  // 2D badges on the main menu name banners, and 2D rank badges for the other players
  c.mode = 'menu';
  assert.equal(c.showroomEntries()[0].rb, 1000);
  c.renderParty(); assert(ol.querySelectorAll('img')[1].src.startsWith('data:image/svg+xml'));
});
