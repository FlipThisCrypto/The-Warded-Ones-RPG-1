# CLAUDE.md — The Warded Ones RPG 1

This file teaches future Claude Code sessions how to work safely in this repository.

## The One Thing (Current)
The game has two complete quests, six playable Jesters, mobile support, and
a second explorable map. The next priority is: **complete a real full browser
playthrough of the v0.3 two-map route and tune/fix anything it reveals**.

## Project Overview
Browser-based RPG vertical slice built with vanilla HTML5 Canvas/JavaScript. Hosted on GitHub Pages from `/docs`.

**Live URL:** https://flipthiscrypto.github.io/The-Warded-Ones-RPG-1/

## Repository Structure

```
docs/               ← The playable game (GitHub Pages source)
  index.html        ← Game shell + fonts
  game.js           ← Complete game engine (~2300 lines)
  assets/           ← Processed runtime assets (512px portraits)
  data/             ← JSON game data (edit these to change content)

Big Cats/           ← Source NFT artwork (enemies)
The Warded Ones - Jesters/  ← Source NFT artwork (player characters)
The Warded Ones/    ← Extended lore, trait data
FIEND.md            ← Studio manifesto (governs all decisions)
checklist.txt       ← Master project checklist
```

## Run Locally
```bash
cd docs
python3 -m http.server 8080
# open http://localhost:8080
```

## Architecture

The game is a single-file JavaScript game engine (`docs/game.js`) with these classes:

- `WardedOnesGame` — top-level state machine (STATE enum)
- `InputManager` — keyboard input + justPressed tracking
- `AudioManager` — Web Audio API procedural sound
- `UI` — menus, HUD, notifications, quest complete
- `DialogueManager` — progressive text, portraits, branching
- `ExploreManager` — top-down exploration, NPC/object interaction, encounter zones
- `BattleManager` — turn-based combat, abilities, items, status effects, AI

**State machine:** LOADING → TITLE → CUTSCENE → EXPLORE ↔ DIALOGUE ↔ BATTLE → VICTORY/DEFEAT → QUEST_COMPLETE

## Adding Content

**New character:** Add to `docs/data/characters.json`, add abilities to `abilities.json`, add portrait to `docs/assets/characters/`

**New enemy:** Add to `docs/data/enemies.json`, add portrait to `docs/assets/enemies/`

**New ability:** Add to `docs/data/abilities.json` (keyed by ID)

**New quest:** Add to `docs/data/quests.json`

**New dialogue:** Add to `docs/data/dialogue.json` (keyed by string ID)

## Asset Rules
- Source art lives in the NFT collection folders — **never modify source files**
- Runtime assets go in `docs/assets/` at 512×512 PNG or 1024×576 JPG
- Process with Python PIL: `Image.open(src).resize((512,512), LANCZOS).save(out)`
- The `.gitignore` excludes the large NFT build folders from git

## Pushing Updates
```bash
git add docs/ README.md
git commit -m "feat: description"
git push origin main
# GitHub Pages deploys automatically in ~2 minutes
```

## Canon Rules (from FIEND.md)
- Use only Warded Ones characters, art, and lore
- Do not copy Final Fantasy or other RPG IP
- Do not destructively alter source artwork
- Do not add blockchain, NFT minting, or online features to the game
- Finish complete slices before expanding

## Current State (v0.3 — multi-map foundation)
- The Echoing Verge unlocks at the south gate after `trial_of_wards`, returns
  through its north arch, and contains a Ward Echo guide, Resonant Marker
  discovery, cache, and a two-guardian encounter.
- `ExploreManager.mapStates` owns map-specific NPC/object/encounter state;
  `currentMap` and stable IDs serialize under save schema 2 while the existing
  `warded_ones_save_v1` storage key remains compatible.
- Legacy saves default to Warded Grounds, invalid coordinates/map IDs are
  clamped/fallback safely, and mid-quest saves recreate the dynamic Blaze Lion.
- Durable checks live in `tests/validate-data.mjs` and
  `tests/world-save.test.mjs`; `tests/full-flow.test.mjs` covers both chained
  quests and the complete two-map callback flow.
- Six playable Jesters: 3 starters + 3 recruitable via map NPCs
  (`recruit: true` in characters.json; recruit NPCs in ExploreManager)
- Two chained quests (quests.json `unlocks` field); quest journal on J
- Astral Cougar boss at the animated Star Sigil; enemy AoE support
- Mobile touch controls (D-pad + ✦/✕ buttons, auto-shown on touch screens)
- Defeat screen: ENTER retries the battle (pre-battle party snapshot),
  ESC wakes at half HP; lost encounter zones re-arm (no quest soft-lock)
- Audio settings persist (warded_ones_settings_v1); saves persist chest/
  sigil object state
- Automated playthrough protocol + latest results: PLAYTEST.md
- Combat depth (loop 4): status effects are mechanically real — buildTurnOrder
  holds LIVE combatant refs (tagged isPlayer), advanceToNextTurn does
  start-of-turn upkeep for both sides (clear Defend, tick DoT/expiry,
  freeze=skip-turn). atk_down cuts damage 0.7x (damage-time multiplier, never
  mutates the JSON-shared stats), confuse (Shuffle) gives 40% self-hit. LCK
  drives crits (5%+1%/LCK, 1.7x, gold flash + CRITICAL! + sting). Per-element
  hit VFX (ELEMENT_FX/abilityElement → spawnImpactBurst) + element-tinted
  numbers. Enemy intent telegraphs (scheduleEnemyAction stores enemyIntent,
  1700ms wind-up) + AI archetypes (defensive guards <40% HP, swift favours
  multi-hit, aggressive targets weakest); chooseEnemyAbility filters affordable.
- Post-quest respawning hunts (ExploreManager.spawnHunts) use the otherwise-
  idle azure_tiger + arctic_lion once trial_of_wards completes; onBattleWin(zone)
  branches on zone.hunt (no quest progress, 12s cooldown, re-arm after player
  leaves); huntsSpawned persisted.
- Progression is legible: levelUp() returns stat gains; victory + quest-complete
  show a +HP/+MP/… breakdown (boxes grow); EXP bars in the explore party panel
  and victory screen.
- Boss music: playBattleMusic(isBoss) — blaze_lion has "boss":true (lower/denser/
  phrygian); checkBattleEnd stopMusic() before the jingle. Ambient explore:
  drifting ward motes (scatter from player) + footstep dust.
- Iris battle transition (WardedOnesGame.battleTransition): ward-ring iris wipe
  replaces the hard cut; triggerBattle routes through startBattleTransition;
  battle created at the midpoint (its fadeIn skipped); startNewGame/load clear it.
  NOTE: the Ward Stone Blaze Lion and Astral Cougar fights start via interact()'s
  direct startBattle (they have dialogue intros), so they do NOT play the iris.
- Scroll-scrubbed cinematics (STATE.PROLOGUE, ScrollFlightManager): new game
  opens with a scroll-driven camera flight over the live-rendered map —
  wheel/touch-drag/W-S scrub, 5 story sections, route rail, ESC skips.
  The class takes an opts config: the finale (the_astral_hunt completion,
  via dismissQuestComplete) plays the EPILOGUE victory-lap config over the
  restored world; P on the title screen replays the prologue. Honors
  prefers-reduced-motion (instant camera, no drift).
  Camera = scroll-world architecture B (the diorama grammar): sections are
  PLACES (`cam` pose + optional `from`), auto-built into an interleaved
  dive/connector segment chain. A section's copy pins to its DIVE (so it
  peaks on-subject); CONNECTORS arc up to a god's-eye overview and descend
  into the next subject. Seams are frame-identical — a connector's endpoint
  is the same object as its neighbour dive's pose (`s._from`), and the arc
  uses sin(π·t), which is 0 at both seams. To add a beat, add a section —
  segments/offsets rebuild themselves. Scrub math + architecture adapted
  from github.com/oso95/scroll-world (MIT, attributed in the class header)

## Known Issues (v0.2)
- Browser screenshot tool timeout in embedded panes (RAF throttling —
  drive `game.update(1/60)` manually when testing; see PLAYTEST.md)
- The Echoing Verge is procedurally rendered; it has not yet received bespoke
  runtime artwork.
- Battle balance is untuned for levels beyond ~5

## Definition of Done
A feature is done when: implemented, integrated, tested via browser JS console, and documented.
