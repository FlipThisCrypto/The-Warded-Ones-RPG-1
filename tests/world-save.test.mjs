import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const storage = new Map();
let storageFails = false;
const expectedLogs = [];
const noop = () => {};
const context = vm.createContext({
  console: { ...console, error: (...args) => expectedLogs.push(['error', ...args]), warn: (...args) => expectedLogs.push(['warn', ...args]) },
  Math,
  Date,
  setTimeout,
  clearTimeout,
  requestAnimationFrame: noop,
  localStorage: {
    getItem: key => { if (storageFails) throw new Error('storage denied'); return storage.get(key) ?? null; },
    setItem: (key, value) => { if (storageFails) throw new Error('quota exceeded'); storage.set(key, value); },
    removeItem: key => storage.delete(key),
  },
  window: { addEventListener: noop, AudioContext: class {}, webkitAudioContext: class {} },
  document: { addEventListener: noop, getElementById: () => null, body: { classList: { add: noop } } },
  navigator: { maxTouchPoints: 0 },
  matchMedia: () => ({ matches: false, addEventListener: noop }),
  Image: class {},
  fetch: async () => ({ json: async () => ({}) }),
});
const source = fs.readFileSync(path.join(root, 'docs', 'game.js'), 'utf8');
vm.runInContext(`${source}\nglobalThis.__testExports = { WardedOnesGame, ExploreManager };`, context);
const { WardedOnesGame, ExploreManager } = context.__testExports;
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'docs', 'data', name), 'utf8'));
const data = {
  characters: read('characters.json'), enemies: read('enemies.json'), abilities: read('abilities.json'),
  items: read('items.json'), questDefs: read('quests.json'), dialogue: read('dialogue.json'),
};

function makeGame() {
  const game = new WardedOnesGame();
  game.data = data;
  game.party = data.characters.filter(c => !c.recruit).map(c => game.createPartyMember(c));
  game.quests = structuredClone(data.questDefs);
  game.inventory = [];
  game.ui = { showNotification: noop };
  game.audio.playTone = noop;
  game.audio.playExploreMusic = noop;
  return game;
}

storage.clear();
const game = makeGame();
game.explore = new ExploreManager(game);
assert.deepEqual(Object.keys(game.explore.mapStates), ['warded_grounds', 'echoing_verge']);
game.quests.find(q => q.id === 'trial_of_wards').complete = true;
assert.equal(game.explore.switchMap('echoing_verge', { x: 450, y: 105 }), true);
game.explore.update(1 / 60, { width: 900, height: 600 });
assert.equal(game.explore.mapStates.echoing_verge.encounter_zones.some(z => z.hunt), false);
assert.equal(game.explore.mapStates.warded_grounds.encounter_zones.filter(z => z.hunt).length, 2);
game.explore.objects.find(o => o.id === 'echo_cache').opened = true;
game.save();
const saved = JSON.parse(storage.get('warded_ones_save_v1'));
assert.equal(saved.schemaVersion, 2);
assert.equal(saved.exploreState.currentMap, 'echoing_verge');
assert.equal(saved.exploreState.mapStates.echoing_verge.objects.find(o => o.id === 'echo_cache').opened, true);

const roundTrip = makeGame();
assert.equal(roundTrip.load(), true);
assert.equal(roundTrip.explore.currentMap, 'echoing_verge');
assert.equal(roundTrip.explore.objects.find(o => o.id === 'echo_cache').opened, true);

const legacy = {
  party: [{ id: 'motley_max', level: 2, currentHp: 90, currentMp: 40 }],
  quests: structuredClone(data.questDefs), inventory: [], gold: 12, playtime: 30,
  exploreState: { playerX: 410, playerY: 310, battleCount: 2, elderTalked: true, stoneTouched: false,
    npcs: [{ talked: true }], objects: [], encounter_zones: [{ used: true }, { used: true }, { used: false }] },
};
storage.set('warded_ones_save_v1', JSON.stringify(legacy));
const migrated = makeGame();
assert.equal(migrated.load(), true);
assert.equal(migrated.explore.currentMap, 'warded_grounds');
assert.equal(migrated.explore.playerX, 410);
assert.equal(migrated.explore.encounter_zones.some(z => z.id === 'grounds_blaze' && !z.used), true);

legacy.exploreState.currentMap = 'unknown_map';
storage.set('warded_ones_save_v1', JSON.stringify(legacy));
const unknownMap = makeGame();
assert.equal(unknownMap.load(), true);
assert.equal(unknownMap.explore.currentMap, 'warded_grounds');

storage.set('warded_ones_save_v1', '{broken');
assert.equal(makeGame().load(), false);
storageFails = true;
const denied = makeGame();
denied.explore = new ExploreManager(denied);
assert.equal(denied.save(), false);
assert.equal(denied.load(), false);
storageFails = false;
assert.equal(expectedLogs.length, 3, 'corrupt, quota, and denied-storage paths should each report once');
console.log('World/save tests passed: 20 assertions across map registry, hunt ownership, roundtrip, legacy migration, boss restoration, unknown-map fallback, corrupt JSON, and unavailable storage.');
