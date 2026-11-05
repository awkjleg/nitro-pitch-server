// Painted cars from drops. A painted car is its own car body (Titanium White Octane is a different car from the
// Octane): extra entries appended to catalog.body, built from their base car with the paint on the trim.
// Index of base car B in paint P: BASE + (P - 1) * BASE + B, where BASE is the number of real bodies.

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

// add the painted cars to a catalog (once); placeholders for ADMIN / event cars keep the index maths simple
export function addPaintedCars(catalog) {
  if (catalog.paintedBase) return catalog;
  const base = catalog.body.length;
  for (let P = 1; P < PAINTS.length; P++) for (let B = 0; B < base; B++) {
    const c = catalog.body[B];
    catalog.body.push(c.admin || c.ev ? { name: 'ADMIN', lv: 1, rar: 7, admin: true } : { name: PAINTS[P].name + ' ' + c.name, lv: 999, rar: c.rar, painted: [B, P] });
  }
  catalog.body.push({ name: 'Tung Tung Sahur', lv: 1, rar: 7, admin: true });   // ADMIN design car (src/paints.txt builds it)
  catalog.body.push({ name: 'Shell Shock', lv: 1, rar: 7, admin: true });       // ADMIN design: an original turtle ninja
  Object.defineProperty(catalog, 'paintedBase', { value: base });
  return catalog;
}
export const paintedIndex = (catalog, B, P) => catalog.paintedBase + (P - 1) * catalog.paintedBase + B;
const paintableCars = catalog => catalog.body.slice(0, catalog.paintedBase).map((c, i) => c && !c.admin && !c.ev ? i : -1).filter(i => i >= 0);
function rollPaint(random) {
  const total = PAINT_IDS.reduce((s, id) => s + PAINTS[id].w, 0);
  let r = random() * total;
  for (const id of PAINT_IDS) { r -= PAINTS[id].w; if (r < 0) return id; }
  return PAINT_IDS[PAINT_IDS.length - 1];
}
// a painted car from a drop: a weighted paint on a random car, one the player doesn't have yet
export function paintedDrop(p, catalog, random) {
  const cars = paintableCars(catalog);
  if (!p.own.body) p.own.body = [];
  for (let t = 0; t < 40; t++) {
    const B = cars[Math.floor(random() * cars.length)], P = rollPaint(random), i = paintedIndex(catalog, B, P);
    if (!p.own.body.includes(i)) { p.own.body.push(i); return { kind: 'body', i, name: catalog.body[i].name, rar: catalog.body[i].rar }; }
  }
  return null;
}
// update 5.35/5.36 kept painted cars as "body:B:P" strings in p.pp and the trim paint in p.paint: turn them into
// painted car bodies (and give the body back its free colour)
export function migratePainted(p, catalog) {
  if (!Array.isArray(p.pp) || !p.pp.length) { delete p.pp; return false; }
  if (!p.own.body) p.own.body = [];
  for (const s of p.pp) {
    const [kind, a, b] = String(s).split(':'), B = Number(a), P = Number(b);
    if (kind !== 'body' || !Number.isInteger(B) || B < 0 || B >= catalog.paintedBase || !PAINTS[P]) continue;
    const i = paintedIndex(catalog, B, P);
    if (catalog.body[i] && !catalog.body[i].admin && !p.own.body.includes(i)) p.own.body.push(i);
    if (p.body === B && p.paint === PAINTS[P].hex) { p.body = i; p.paint = -1; }
  }
  delete p.pp;
  return true;
}
