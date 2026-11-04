// Painted cars from drops. The server owns which painted cars a player has.
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

