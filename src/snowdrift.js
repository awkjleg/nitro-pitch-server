// Snowdrift Season (Christmas event), from 1 December: every quest finished during the event gives a Christmas Drop
// (any of the 30 Christmas items, rarer ones less often), and an advent calendar has a door to open each day from
// 1 to 25 December. Nothing of it exists for players before 1 December. The game has the same lists in
// src/snowdrift.txt; items are found by kind and name in the catalog.
export const SNOW_START = Date.UTC(2026, 11, 1, 5), SNOW_END = Date.UTC(2027, 0, 6, 5);   // midnight US Eastern
export const ADVENT_DAYS = 25;
// each day's rewards: ['item', kind, name] (a Christmas Drop instead if you already have it), ['drop', n], ['xp', n]
export const ADVENT = [
 [['item', 'antenna', 'Holly Sprig']], [['drop', 1]], [['xp', 1500]], [['item', 'title', 'Snow Driver']], [['drop', 1]],
 [['item', 'banner', 'Snowy Night']], [['xp', 2000]], [['drop', 1]], [['item', 'antenna', 'Candy Cane']], [['drop', 1]],
 [['xp', 2500]], [['item', 'topper', 'Elf Hat']], [['drop', 2]], [['item', 'decal', 'Candy Stripe']], [['drop', 1]],
 [['item', 'boost', 'Snowfall']], [['xp', 3000]], [['drop', 2]], [['item', 'wheel', 'Ice Studs']], [['item', 'title', 'Elf on the Pitch']],
 [['drop', 2]], [['item', 'paint', 'Frosted']], [['xp', 5000]], [['item', 'topper', 'Santa Cap']], [['item', 'title', 'Holiday Hero'], ['drop', 3]]
];
const ADVENT_ONLY = new Set(['title:Holiday Hero']);
const RAR_W = [30, 30, 24, 14, 8, 4, 1.5];
export const snowLive = now => now >= SNOW_START && now < SNOW_END;
export function adventToday(now) { return Math.floor((now - SNOW_START) / 864e5) + 1; }
export function cleanEv(raw) {
 const n = v => Number.isFinite(v) ? Math.max(0, Math.min(1e6, Math.trunc(v))) : 0;
 const r = raw && typeof raw === 'object' ? raw : {};
 return { hd: n(r.hd), got: n(r.got), adv: Number.isInteger(r.adv) ? r.adv & 0x1ffffff : 0 };
}
const idx = (catalog, kind, name) => (catalog[kind] || []).findIndex(x => x.name === name && x.ev);
function give(p, kind, i) { const own = p.own[kind] || (p.own[kind] = []); if (own.includes(i)) return false; own.push(i); return true; }
// quests finished in a match during the event: one Christmas Drop each
export function snowQuests(p, now, done) {
 if (!snowLive(now) || !done) return 0;
 const ev = p.ev = cleanEv(p.ev); ev.hd += done; ev.got += done; return done;
}
// open a Christmas Drop: any Christmas item you don't have yet, weighted by rarity; once you have them all, 2,000 XP
export function openChristmasDrop(p, catalog, random, now) {
 if (now < SNOW_START) return null;
 const ev = p.ev = cleanEv(p.ev);
 if (ev.hd < 1) return null;
 const pool = [];
 for (const [kind, list] of Object.entries(catalog)) list.forEach((it, i) => { if (it.ev && !ADVENT_ONLY.has(kind + ':' + it.name) && !p.own[kind]?.includes(i)) pool.push({ kind, i, name: it.name, w: RAR_W[it.rar] ?? 10 }); });
 ev.hd--;
 if (!pool.length) { p.xp += 2000; return { xp: 2000 }; }
 let r = random() * pool.reduce((s, x) => s + x.w, 0), pick = pool[pool.length - 1];
 for (const x of pool) if ((r -= x.w) <= 0) { pick = x; break; }
 give(p, pick.kind, pick.i);
 return { kind: pick.kind, i: pick.i, name: pick.name };
}
// open an advent calendar door: today's or any earlier one you missed, each once, from 1 to 25 December
export function claimAdvent(p, catalog, now, day) {
 if (!Number.isInteger(day) || day < 1 || day > ADVENT_DAYS || now < SNOW_START || day > adventToday(now)) return null;
 const ev = p.ev = cleanEv(p.ev), bit = 1 << (day - 1);
 if (ev.adv & bit) return null;
 ev.adv |= bit;
 const got = [];
 for (const [type, a, b] of ADVENT[day - 1]) {
  if (type === 'xp') { p.xp += a; got.push({ xp: a }); }
  else if (type === 'drop') { ev.hd += a; got.push({ drops: a }); }
  else { const i = idx(catalog, a, b); if (i >= 0 && give(p, a, i)) got.push({ kind: a, i, name: b }); else { ev.hd++; got.push({ drops: 1, had: b }); } }
 }
 return { day, got };
}
