// Snowdrift Season (Christmas event): challenges unlock 27 items, Holiday Drops hold the 3 rarest.
// The game has the same list in src/snowdrift.txt; items are found by kind and name in the catalog.
export const SNOW_START = Date.UTC(2026, 11, 1, 5), SNOW_END = Date.UTC(2027, 0, 6, 5);   // US Eastern midnight
export const SNOW_DROP_EVERY = 5;                                                              // a Holiday Drop every 5 event matches
// [stat, count, kind, name]: stat m = matches, g = goals, s = saves, w = wins, all = every other challenge done
export const SNOW_CH = [
 ['m', 1, 'antenna', 'Holly Sprig'], ['m', 5, 'title', 'Snow Driver'], ['g', 5, 'antenna', 'Candy Cane'], ['m', 10, 'banner', 'Snowy Night'],
 ['w', 5, 'topper', 'Elf Hat'], ['g', 15, 'decal', 'Candy Stripe'], ['s', 10, 'boost', 'Snowfall'], ['m', 20, 'wheel', 'Ice Studs'],
 ['w', 10, 'topper', 'Gingerbread Pal'], ['g', 25, 'title', 'Elf on the Pitch'], ['g', 30, 'antenna', 'Bauble'], ['m', 30, 'decal', 'Gift Wrap'],
 ['s', 20, 'paint', 'Frosted'], ['w', 15, 'title', 'North Pole Pro'], ['w', 20, 'antenna', 'Frostflake'], ['m', 40, 'topper', 'Santa Cap'],
 ['g', 40, 'decal', 'Ugly Sweater'], ['w', 25, 'wheel', 'Peppermint'], ['s', 30, 'boost', 'Sleigh Bells'], ['m', 50, 'banner', 'Candy Cane'],
 ['w', 30, 'topper', 'Rooftop Pine'], ['g', 60, 'decal', 'Frostbite'], ['m', 75, 'wheel', 'Wreath Rims'], ['w', 40, 'boost', 'Peppermint Twist'],
 ['g', 100, 'boom', 'Present Pop'], ['m', 100, 'banner', 'Fireside'], ['all', 26, 'title', 'Holiday Hero']
];
// [kind, name, weight]
export const SNOW_DROP = [['topper', 'Snow Globe', 45], ['boom', 'Blizzard', 40], ['boom', 'Northern Lights', 15]];
const idx = (catalog, kind, name) => (catalog[kind] || []).findIndex(x => x.name === name && x.ev);
export function cleanEv(raw) {
 const n = v => Number.isFinite(v) ? Math.max(0, Math.min(1e6, Math.trunc(v))) : 0;
 const r = raw && typeof raw === 'object' ? raw : {};
 return { m: n(r.m), g: n(r.g), s: n(r.s), w: n(r.w), hd: n(r.hd), hdg: n(r.hdg) };
}
function grant(p, catalog, kind, name, out) {
 const i = idx(catalog, kind, name); if (i < 0) return;
 const own = p.own[kind] || (p.own[kind] = []);
 if (!own.includes(i)) { own.push(i); out.push({ kind, i, name }); }
}
// after a match in the event: count it, hand out finished challenges and earned Holiday Drops
export function snowMatch(p, catalog, now, st, won) {
 if (now < SNOW_START || now >= SNOW_END) return null;
 const ev = p.ev = cleanEv(p.ev);
 ev.m++; ev.g += st[1] | 0; ev.s += st[3] | 0; if (won) ev.w++;
 const unlocked = [];
 for (const [stat, count, kind, name] of SNOW_CH) if (stat !== 'all' && ev[stat] >= count) grant(p, catalog, kind, name, unlocked);
 const done = SNOW_CH.filter(([stat, , kind, name]) => stat !== 'all' && p.own[kind]?.includes(idx(catalog, kind, name))).length;
 if (done >= SNOW_CH.length - 1) grant(p, catalog, 'title', 'Holiday Hero', unlocked);
 const earned = Math.floor(ev.m / SNOW_DROP_EVERY), drops = Math.max(0, earned - ev.hdg);
 ev.hd += drops; ev.hdg = Math.max(ev.hdg, earned);
 return { unlocked, drops };
}
// open one Holiday Drop: one of the drop-only items you don't have yet (by weight), else 2,000 XP
export function openHolidayDrop(p, catalog, random) {
 const ev = p.ev = cleanEv(p.ev);
 if (ev.hd < 1) return null;
 ev.hd--;
 const left = SNOW_DROP.filter(([kind, name]) => { const i = idx(catalog, kind, name); return i >= 0 && !p.own[kind]?.includes(i); });
 if (!left.length) { p.xp += 2000; return { xp: 2000 }; }
 let r = random() * left.reduce((s, x) => s + x[2], 0), pick = left[left.length - 1];
 for (const x of left) if ((r -= x[2]) <= 0) { pick = x; break; }
 const out = []; grant(p, catalog, pick[0], pick[1], out); return out[0] || null;
}
