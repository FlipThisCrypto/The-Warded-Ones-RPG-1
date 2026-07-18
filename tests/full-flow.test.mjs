import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const storage = new Map();
const noop = () => {};
const canvas = { width: 900, height: 600, getContext: () => ({}) };
const context = vm.createContext({
  console, Math, Date, structuredClone, setTimeout: fn => { fn(); return 0; }, clearTimeout: noop,
  requestAnimationFrame: noop,
  localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
  window: { addEventListener: noop, AudioContext: class {}, webkitAudioContext: class {} },
  document: { addEventListener: noop, getElementById: id => id === 'game-canvas' ? canvas : null,
    body: { classList: { add: noop } } },
  navigator: { maxTouchPoints: 0 }, matchMedia: () => ({ matches: false, addEventListener: noop }),
  Image: class {}, fetch: async () => ({ json: async () => ({}) }),
});
const source = fs.readFileSync(path.join(root, 'docs', 'game.js'), 'utf8');
vm.runInContext(`${source}\nglobalThis.__testExports = { WardedOnesGame, ExploreManager, STATE };`, context);
const { WardedOnesGame, ExploreManager, STATE } = context.__testExports;
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'docs', 'data', name), 'utf8'));

const game = new WardedOnesGame();
game.data = { characters: read('characters.json'), enemies: read('enemies.json'), abilities: read('abilities.json'),
  items: read('items.json'), questDefs: read('quests.json'), dialogue: read('dialogue.json') };
game.audio = new Proxy({}, { get: () => noop });
game.ui = { showNotification: noop, questCompleteData: null };
game.party = game.data.characters.filter(c => !c.recruit).map(c => game.createPartyMember(c));
game.inventory = [{ id: 'healing_potion', quantity: 3 }];
game.quests = structuredClone(game.data.questDefs);
game.explore = new ExploreManager(game);
game.state = STATE.EXPLORE;

function drainDialogue() {
  let guard = 0;
  while (game.dialogue && !game.dialogue.done && guard++ < 30) {
    game.dialogue.charIndex = game.dialogue.targetText.length;
    game.dialogue.displayText = game.dialogue.targetText;
    game.dialogue.advance();
  }
  assert.ok(guard < 30, 'dialogue must terminate');
}
function winPendingBattle() {
  if (game.battleTransition) game.updateBattleTransition(1);
  assert.ok(game.battle, 'battle should start');
  game.battle.enemies.forEach(e => { e.currentHp = 0; });
  assert.equal(game.battle.checkBattleEnd(), true);
  assert.equal(game.state, STATE.VICTORY);
  game.battle.endVictory();
}
function interactAt(x, y) {
  game.explore.playerX = x; game.explore.playerY = y; game.explore.interact();
}

// Quest 1: Elder, two roaming guardians, dynamic Blaze Lion, Ward Stone.
interactAt(148, 225); drainDialogue();
assert.equal(game.isQuestStageDone('trial_of_wards', 'speak_elder'), true);
interactAt(420, 160);
interactAt(720, 480);
assert.ok(game.inventory.some(i => i.id === 'healing_potion' && i.quantity >= 4));
assert.ok(game.inventory.some(i => i.id === 'full_restore'));
assert.equal(game.inventory.some(i => !game.getItemDef(i.id)), false, 'all chest rewards must be usable items');
for (const id of ['grounds_abyss', 'grounds_arcane']) {
  const zone = game.explore.encounter_zones.find(z => z.id === id);
  zone.used = true; game.explore.triggerBattle(zone.enemy, zone.bg, zone); drainDialogue(); winPendingBattle();
}
assert.equal(game.explore.battleCount, 2);
const blaze = game.explore.encounter_zones.find(z => z.id === 'grounds_blaze');
assert.ok(blaze && !blaze.used, 'Blaze Lion should spawn after guardian two');
blaze.used = true; game.explore.triggerBattle(blaze.enemy, blaze.bg, blaze); winPendingBattle();
interactAt(665, 148); drainDialogue();
assert.equal(game.quests.find(q => q.id === 'trial_of_wards').complete, true);
assert.equal(game.quests.find(q => q.id === 'the_astral_hunt').locked, false);
game.dismissQuestComplete();

// Hunts appear after Quest 1 and all three recruits advance Quest 2.
game.state = STATE.EXPLORE; game.explore.update(1 / 60, canvas);
assert.equal(game.explore.huntsSpawned, true);
for (const [x, y, id] of [[120, 460, 'verity_vex'], [835, 320, 'cogsworth'], [450, 555, 'sir_paradox']]) {
  interactAt(x, y); drainDialogue(); assert.ok(game.party.some(m => m.id === id));
}
assert.equal(game.isQuestStageDone('the_astral_hunt', 'gather_jesters'), true);

// Astral Cougar finale and quest-complete callback chain.
interactAt(455, 95); drainDialogue();
assert.ok(game.battle, 'Astral Cougar battle should start');
winPendingBattle(); drainDialogue();
assert.equal(game.quests.find(q => q.id === 'the_astral_hunt').complete, true);
game.dismissQuestComplete();

// Second map: travel, guide, discovery, cache, encounter, persistence, return.
game.state = STATE.EXPLORE;
game.explore.playerX = 450; game.explore.playerY = 567; game.input.keys.ArrowDown = true;
game.explore.update(1 / 30, canvas); game.input.keys.ArrowDown = false;
assert.equal(game.explore.currentMap, 'echoing_verge');
assert.equal(game.explore.playerY, 105, 'entry spawn must clear the return trigger');
interactAt(450, 190); drainDialogue();
interactAt(185, 390); drainDialogue();
assert.equal(game.explore.objects.find(o => o.id === 'resonant_marker').discovered, true);
interactAt(735, 430);
assert.equal(game.explore.objects.find(o => o.id === 'echo_cache').opened, true);
const vergeFight = game.explore.encounter_zones.find(z => z.id === 'verge_guardians');
vergeFight.used = true; game.explore.triggerBattle(vergeFight.enemy, vergeFight.bg, vergeFight); drainDialogue(); winPendingBattle();
game.save();
assert.equal(JSON.parse(storage.get('warded_ones_save_v1')).exploreState.currentMap, 'echoing_verge');
game.explore.playerX = 450; game.explore.playerY = 66; game.input.keys.ArrowUp = true;
game.explore.update(1 / 30, canvas); game.input.keys.ArrowUp = false;
assert.equal(game.explore.currentMap, 'warded_grounds');
assert.equal(game.explore.playerY, 520, 'return spawn must clear the entry trigger');

// Defeat exits: Retry restores the exact pre-battle party; Wake returns to exploration.
const retryHp = game.party.map(m => [m.id, m.currentHp]);
game.startBattle(['abyss_tiger'], 'battle_bg', noop, () => game.explore.onBattleLose());
game.battle.party.forEach(m => { m.currentHp = 0; });
assert.equal(game.battle.checkBattleEnd(), true);
assert.equal(game.state, STATE.DEFEAT);
game.retryLastBattle();
for (const [id, hp] of retryHp) assert.equal(game.party.find(m => m.id === id).currentHp, hp);
game.battle.party.forEach(m => { m.currentHp = 0; });
game.battle.checkBattleEnd();
game.battle.endDefeat();
assert.equal(game.state, STATE.EXPLORE);
assert.ok(game.party.every(m => m.currentHp > 0), 'Wake must revive the defeated party');

console.log('Full-flow integration passed: both quests, six-member party, chest rewards, encounters, hunts, Echoing Verge, persistence, Retry, and Wake.');
