import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'docs', 'data', name), 'utf8'));
const characters = read('characters.json');
const enemies = read('enemies.json');
const abilities = read('abilities.json');
const items = read('items.json');
const quests = read('quests.json');
const dialogue = read('dialogue.json');
const errors = [];
const unique = (rows, label) => {
  const seen = new Set();
  rows.forEach(row => {
    if (!row.id) errors.push(`${label}: missing id`);
    else if (seen.has(row.id)) errors.push(`${label}: duplicate id ${row.id}`);
    seen.add(row.id);
  });
};

unique(characters, 'character'); unique(enemies, 'enemy'); unique(items, 'item'); unique(quests, 'quest');
const abilityIds = new Set(Object.keys(abilities));
for (const actor of [...characters, ...enemies]) {
  for (const id of actor.abilities || []) if (!abilityIds.has(id)) errors.push(`${actor.id}: unknown ability ${id}`);
}
const itemIds = new Set(items.map(x => x.id));
const questIds = new Set(quests.map(x => x.id));
for (const quest of quests) {
  if (quest.unlocks && !questIds.has(quest.unlocks)) errors.push(`${quest.id}: unknown unlock ${quest.unlocks}`);
  for (const id of quest.rewards?.items || []) if (!itemIds.has(id)) errors.push(`${quest.id}: unknown reward ${id}`);
}
for (const [key, lines] of Object.entries(dialogue)) {
  if (!Array.isArray(lines) || !lines.length) errors.push(`dialogue ${key}: empty`);
  for (const line of lines || []) if (!line.speaker || !line.text) errors.push(`dialogue ${key}: malformed line`);
}
for (const actor of [...characters, ...enemies]) {
  if (actor.portrait && !fs.existsSync(path.join(root, 'docs', actor.portrait))) errors.push(`${actor.id}: missing portrait ${actor.portrait}`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Validated ${characters.length} characters, ${enemies.length} enemies, ${abilityIds.size} abilities, ${items.length} items, ${quests.length} quests, and ${Object.keys(dialogue).length} dialogue sequences.`);
}
