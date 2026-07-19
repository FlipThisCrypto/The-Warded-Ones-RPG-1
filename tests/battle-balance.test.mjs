import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const noop = () => {};
const canvas = { width: 900, height: 600, getContext: () => ({}) };
const context = vm.createContext({
  console, Math, Date, structuredClone, setTimeout: fn => { fn(); return 0; }, clearTimeout: noop,
  requestAnimationFrame: noop, localStorage: { getItem: () => null, setItem: noop },
  window: { addEventListener: noop, AudioContext: class {}, webkitAudioContext: class {} },
  document: { addEventListener: noop, getElementById: id => id === 'game-canvas' ? canvas : null,
    body: { classList: { add: noop } } },
  navigator: { maxTouchPoints: 0 }, matchMedia: () => ({ matches: false, addEventListener: noop }),
  Image: class {}, fetch: async () => ({ json: async () => ({}) }),
});
const source = fs.readFileSync(path.join(root, 'docs', 'game.js'), 'utf8');
vm.runInContext(`${source}\nglobalThis.__balanceExports = { WardedOnesGame };`, context);
const { WardedOnesGame } = context.__balanceExports;
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'docs', 'data', name), 'utf8'));
const characters = read('characters.json');
const enemies = read('enemies.json');
const plain = value => JSON.parse(JSON.stringify(value));

function partyAt(level) {
  return characters.map(def => ({
    id: def.id,
    level,
    currentHp: def.stats.hp + def.growth.hp * (level - 1),
    stats: Object.fromEntries(Object.keys(def.stats).map(key => [
      key, def.stats[key] + (def.growth[key] || 0) * (level - 1),
    ])),
  }));
}

function makeGame(level) {
  const game = new WardedOnesGame();
  game.party = partyAt(level);
  game.data = { enemies };
  game.audio = new Proxy({}, { get: () => noop });
  return game;
}

const originalEnemies = structuredClone(enemies);
const astral = enemies.find(enemy => enemy.id === 'astral_cougar');

for (const level of [1, 5]) {
  const scaled = makeGame(level).scaleEnemyForParty(astral);
  assert.deepEqual(plain(scaled.stats), astral.stats, `level ${level} must preserve authored campaign stats`);
  assert.equal(scaled.rewards.exp, astral.rewards.exp);
  assert.equal(scaled.rewards.gold, astral.rewards.gold);
}

const expectedBonusAtTen = 5;
const levelTenBoss = makeGame(10).scaleEnemyForParty(astral);
assert.equal(levelTenBoss.stats.hp, Math.round(astral.stats.hp * (1 + expectedBonusAtTen * 0.14)));
assert.equal(levelTenBoss.stats.atk, astral.stats.atk + expectedBonusAtTen * 2);
assert.equal(levelTenBoss.stats.def, astral.stats.def + expectedBonusAtTen);
assert.ok(levelTenBoss.rewards.exp > astral.rewards.exp && levelTenBoss.rewards.gold > astral.rewards.gold,
  'scaled encounters must compensate the player');

let previousHp = 0;
for (const level of [5, 10, 15, 25, 40]) {
  const scaled = makeGame(level).scaleEnemyForParty(astral);
  assert.ok(scaled.stats.hp >= previousHp, 'enemy durability must scale monotonically');
  previousHp = scaled.stats.hp;
}

function basicPartyRounds(level, enemyDef) {
  const roundDamage = partyAt(level).reduce(
    (sum, member) => sum + Math.max(1, member.stats.atk - enemyDef.stats.def), 0);
  return enemyDef.stats.hp / roundDamage;
}

const roundsAtFive = basicPartyRounds(5, makeGame(5).scaleEnemyForParty(astral));
const roundsAtTen = basicPartyRounds(10, levelTenBoss);
assert.ok(roundsAtFive >= 2.5, `level-5 Astral Cougar should survive multiple basic rounds (got ${roundsAtFive.toFixed(2)})`);
assert.ok(roundsAtTen >= 2.5, `level-10 scaling should preserve boss presence (got ${roundsAtTen.toFixed(2)})`);
assert.deepEqual(enemies, originalEnemies, 'balance scaling must never mutate shared enemy definitions');

console.log(`Battle balance passed: Astral Cougar basic-round durability L5=${roundsAtFive.toFixed(2)}, L10=${roundsAtTen.toFixed(2)}; authored stats preserved through level 5.`);
