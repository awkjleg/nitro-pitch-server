import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QUEST_RANGES, questDropRar, matchDropRar, MATCH_DROP_CHANCE } from '../src/quest-drops.js';

test('quest drop ranges match the game quests, in order', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const block = html.slice(html.indexOf('const QUEST_KINDS = ['), html.indexOf('];', html.indexOf('const QUEST_KINDS = [')));
  const found = [...block.matchAll(/d: \[(\d+), (\d+)\], w: \[(\d+), (\d+)\]/g)].map(m => [[+m[1], +m[2]], [+m[3], +m[4]]]);
  assert.deepEqual(found, QUEST_RANGES);
});
test('harder quests give better drops; weekly better than daily; lucky drops are rare', () => {
  assert.equal(questDropRar(0, 2, false), 2); assert.equal(questDropRar(0, 4, false), 3);
  assert.equal(questDropRar(0, 12, true), 3); assert.equal(questDropRar(0, 15, true), 4); assert.equal(questDropRar(0, 18, true), 5);
  assert.equal(matchDropRar(() => 0.01), 4); assert.equal(matchDropRar(() => 0.9), 2); assert(MATCH_DROP_CHANCE <= 0.15);
});
