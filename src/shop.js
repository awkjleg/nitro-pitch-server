// Painted cars and the credits shop. The server owns credits, painted items and the daily listing.
// Painted items are stored on the profile as "kind:index:paint" strings in p.pp (only cars for now).

// paint id -> name, colour, drop weight (in % of painted drops), tier (0 common .. 4 rarest)
export const PAINTS = [null,
  { name: 'Crimson', hex: 0xc8202f, w: 11, tier: 0 },
  { name: 'Sky Blue', hex: 0x5fc3f2, w: 11, tier: 0 },
  { name: 'Lime', hex: 0x93e23a, w: 11, tier: 0 },
  { name: 'Orange', hex: 0xff8a1e, w: 11, tier: 0 },
  { name: 'Grey', hex: 0x8f98a8, w: 10, tier: 0 },
  { name: 'Cobalt', hex: 0x2a4fd6, w: 10, tier: 0 },
  { name: 'Forest Green', hex: 0x2f7d3b, w: 9, tier: 0 },
  { name: 'Burnt Sienna', hex: 0x9a4a24, w: 7, tier: 1 },
  { name: 'Saffron', hex: 0xf2c321, w: 6, tier: 1 },
  { name: 'Pink', hex: 0xff6fb5, w: 5, tier: 1 },
  { name: 'Purple', hex: 0x7b3fd1, w: 4.5, tier: 2 },
  { name: 'Gold', hex: 0xd9a520, w: 2.5, tier: 3 },
  { name: 'Black', hex: 0x15161a, w: 1.75, tier: 3 },
  { name: 'Titanium White', hex: 0xf4f6f8, w: 0.25, tier: 4 }
];
export const PAINT_IDS = PAINTS.map((p, i) => p ? i : 0).filter(Boolean);
export const PAINTED_DROP_CHANCE = 0.25;
const PAINT_PRICE = [300, 450, 700, 1100, 2400];           // a painted car in the shop, by paint tier
const ITEM_PRICE = { 2: 150, 3: 250, 4: 400, 5: 650, 6: 1000 }; // an unpainted drop item, by rarity
const SHOP_KINDS = ['decal', 'wheel', 'boost', 'boom', 'topper', 'antenna'];
export const CREDITS_MAX = 10000000;

const key = (kind, i, paint) => kind + ':' + i + ':' + paint;
export const ownsPaint = (p, kind, i, paint) => Array.isArray(p.pp) && p.pp.includes(key(kind, i, paint));
// cars that can come painted: everything but ADMIN and event-only cars
export const paintableCars = catalog => catalog.body.map((c, i) => c && !c.admin && !c.ev ? i : -1).filter(i => i >= 0);
// the paint colours a profile may show on its current car (team colour, -1, is always allowed)
export function allowedPaint(p, colour) {
  if (colour === -1) return true;
  const id = PAINTS.findIndex(x => x && x.hex === colour);
  return id > 0 && ownsPaint(p, 'body', p.body | 0, id);
}
export function cleanPainted(raw, catalog) {
  if (!Array.isArray(raw)) return [];
  const out = new Set();
  for (const s of raw) {
    if (typeof s !== 'string') continue;
    const [kind, a, b] = s.split(':'), i = Number(a), paint = Number(b);
    if (kind === 'body' && Number.isInteger(i) && catalog.body[i] && !catalog.body[i].admin && Number.isInteger(paint) && PAINTS[paint]) out.add(key(kind, i, paint));
    if (out.size >= 2000) break;
  }
  return [...out];
}
function rollPaint(random, exclude = []) {
  const ids = PAINT_IDS.filter(id => !exclude.includes(id)), total = ids.reduce((s, id) => s + PAINTS[id].w, 0);
  let r = random() * total;
  for (const id of ids) { r -= PAINTS[id].w; if (r < 0) return id; }
  return ids[ids.length - 1];
}
// give a painted car (and the car itself, so it can be driven)
export function grantPainted(p, catalog, i, paint) {
  if (!Array.isArray(p.pp)) p.pp = [];
  if (!ownsPaint(p, 'body', i, paint)) p.pp.push(key('body', i, paint));
  if (!p.own.body) p.own.body = [];
  if (!p.own.body.includes(i)) p.own.body.push(i);
}
// a painted car from a drop: a weighted paint on a random car, one the player doesn't have in that colour yet
export function paintedDrop(p, catalog, random) {
  const cars = paintableCars(catalog);
  for (let t = 0; t < 40; t++) {
    const i = cars[Math.floor(random() * cars.length)], paint = rollPaint(random);
    if (!ownsPaint(p, 'body', i, paint)) { grantPainted(p, catalog, i, paint); return { kind: 'body', i, name: catalog.body[i].name, rar: catalog.body[i].rar, paint, paintName: PAINTS[paint].name }; }
  }
  return null;
}

// ---------- the shop ----------
export const DAY = 86400000;
export const shopDay = now => Math.floor(now / DAY);
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const carSlot = (catalog, i, paint) => ({ kind: 'body', i, paint, name: PAINTS[paint].name + ' ' + catalog.body[i].name, price: PAINT_PRICE[PAINTS[paint].tier], rar: catalog.body[i].rar, tier: PAINTS[paint].tier });
// the listing for a UTC day: 2 featured (Titanium White Octane, plus a rare-paint car that changes every 2 days) and 6 daily
export function shopListing(catalog, day) {
  const cars = paintableCars(catalog), octane = Math.max(0, catalog.body.findIndex(c => c.name === 'Octane'));
  const r2 = rng(Math.imul(Math.floor(day / 2) + 7, 2654435761));
  let fc = cars[Math.floor(r2() * cars.length)]; if (fc === octane) fc = cars[(cars.indexOf(fc) + 1) % cars.length];
  const featured = [{ ...carSlot(catalog, octane, 14), slot: 'f0' }, { ...carSlot(catalog, fc, [11, 12, 13][Math.floor(r2() * 3)]), slot: 'f1' }];
  const r = rng(Math.imul(day + 13, 2246822519)), daily = [], used = new Set(['body:' + octane + ':14', 'body:' + fc]);
  for (let t = 0; daily.length < 3 && t < 50; t++) {
    const i = cars[Math.floor(r() * cars.length)], paint = rollPaint(r, [14]);
    if (used.has('body:' + i)) continue; used.add('body:' + i);
    daily.push({ ...carSlot(catalog, i, paint), slot: 'd' + daily.length });
  }
  const items = [];
  for (const kind of SHOP_KINDS) (catalog[kind] || []).forEach((it, i) => { if (it && it.drop && !it.admin && !it.ev && ITEM_PRICE[it.rar]) items.push({ kind, i }); });
  for (let t = 0; daily.length < 6 && t < 80 && items.length; t++) {
    const x = items[Math.floor(r() * items.length)], k = x.kind + ':' + x.i;
    if (used.has(k)) continue; used.add(k);
    const it = catalog[x.kind][x.i];
    daily.push({ kind: x.kind, i: x.i, paint: 0, name: it.name, price: ITEM_PRICE[it.rar], rar: it.rar, slot: 'd' + daily.length });
  }
  return { day, ends: (day + 1) * DAY, featuredEnds: (Math.floor(day / 2) * 2 + 2) * DAY, featured, daily };
}
export const ownsSlot = (p, s) => s.paint ? ownsPaint(p, s.kind, s.i, s.paint) : !!p.own[s.kind]?.includes(s.i);
export function shopFor(p, catalog, now) {
  const L = shopListing(catalog, shopDay(now));
  const mark = s => ({ ...s, owned: ownsSlot(p, s) });
  return { ...L, featured: L.featured.map(mark), daily: L.daily.map(mark), credits: p.cr | 0 };
}
// buy a slot of today's listing; returns the bought slot or throws a message
export function buySlot(p, catalog, now, slot, day) {
  const L = shopListing(catalog, shopDay(now));
  if (day !== L.day) throw new Error('The shop just refreshed. Have a look at the new items.');
  const s = [...L.featured, ...L.daily].find(x => x.slot === slot);
  if (!s) throw new Error('That item is not in the shop');
  if (ownsSlot(p, s)) throw new Error('You already own this');
  if ((p.cr | 0) < s.price) throw new Error('Not enough credits');
  p.cr = (p.cr | 0) - s.price;
  if (s.paint) grantPainted(p, catalog, s.i, s.paint);
  else { if (!p.own[s.kind]) p.own[s.kind] = []; p.own[s.kind].push(s.i); }
  return s;
}
