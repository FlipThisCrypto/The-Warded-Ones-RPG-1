# CLAUDE.md — The Warded Ones RPG 1

This file teaches future Claude Code sessions how to work safely in this repository.

## The One Thing (Current)
The game is live on GitHub Pages with two complete quests, six playable
Jesters, and mobile support. The next priority is: **a second explorable
map** (the single Warded Grounds screen is now fully used) — then begin
Godot 4 port planning.

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

## Current State (v0.2 — after loop 3)
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

## Known Issues (v0.2)
- Browser screenshot tool timeout in embedded panes (RAF throttling —
  drive `game.update(1/60)` manually when testing; see PLAYTEST.md)
- Exploration area is a single hand-drawn screen — a second map is the
  next expansion
- Battle balance is untuned for levels beyond ~5

## Definition of Done
A feature is done when: implemented, integrated, tested via browser JS console, and documented.
