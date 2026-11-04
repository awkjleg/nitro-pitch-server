// Drops from playing: every finished quest gives a drop (harder quests give better ones), and any counted match
// has a small chance of a bonus drop. QUEST_RANGES are the game's QUEST_KINDS daily (d) and weekly (w) target
// ranges, in the same order (tests/quest-drops.test.mjs checks they still match public/index.html).
export const QUEST_RANGES = [
  [[2, 4], [12, 18]], [[1, 3], [6, 10]], [[3, 6], [15, 30]], [[2, 5], [12, 20]], [[1, 3], [6, 12]], [[4, 8], [20, 40]],
  [[1, 3], [5, 12]], [[1, 1], [3, 6]], [[600, 1200], [4000, 7000]], [[1, 3], [6, 12]], [[1, 2], [4, 8]]
];
// rarity: 2 Rare, 3 Very Rare, 4 Import, 5 Exotic. Daily: easy Rare, hard Very Rare. Weekly: Very Rare / Import / Exotic.
export function questDropRar(k, t, weekly) {
  const r = QUEST_RANGES[k]; if (!r) return 2;
  const [a, b] = r[weekly ? 1 : 0], f = b > a ? (t - a) / (b - a) : 0.5;
  return weekly ? (f < 0.34 ? 3 : f < 0.67 ? 4 : 5) : (f < 0.5 ? 2 : 3);
}
// a random drop after a match: 1 in 10 matches; mostly Rare, sometimes Very Rare, rarely Import
export const MATCH_DROP_CHANCE = 0.1;
export const matchDropRar = random => { const x = random(); return x < 0.05 ? 4 : x < 0.3 ? 3 : 2; };
