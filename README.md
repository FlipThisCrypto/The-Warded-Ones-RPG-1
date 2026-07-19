# The Warded Ones RPG 1 — Jester's Trial

**A Fiend Studios original fantasy RPG**

[![Play Now](https://img.shields.io/badge/Play-GitHub%20Pages-purple)](https://flipthiscrypto.github.io/The-Warded-Ones-RPG-1/)

---

## Play the Game

**[▶ Play in your browser →](https://flipthiscrypto.github.io/The-Warded-Ones-RPG-1/)**

No download required. Works on desktop browsers (Chrome, Firefox, Edge)
and on phones — touch controls appear automatically on touch screens.

---

## About

The Warded Ones RPG 1 is an original browser-based fantasy RPG built on The Warded Ones IP — a collection of mystical Jester characters and guardian beasts.

**Vertical Slice: Jester's Trial**

Play as Motley Max and his Jester companions as they battle through the
Warded Grounds to claim the legendary Ward Stone — then gather the full
company of six and answer what prowls between the stars.

### Features (v0.3)
- ✦ Branded title screen with animated effects
- ✦ Scroll-scrubbed cinematics — scrolling flies the camera over the live
  game map: it descends onto each story beat, then pulls up to a god's-eye
  view and glides on to the next. A five-beat prologue opens the trial, a
  victory-lap epilogue closes it over the restored grounds, and the
  prologue replays from the title screen (P). Honors reduced-motion
  preferences. (Scrub engine + camera architecture adapted from
  [scroll-world](https://github.com/oso95/scroll-world), MIT)
- ✦ Intro cutscene with progressive dialogue
- ✦ Two explorable areas: the Warded Grounds and post-trial Echoing Verge,
  with gated travel, return path, distinct atmosphere, discoveries, and encounters
- ✦ Turn-based combat with Attack / Ability / Item / Defend, per-element hit
  effects, LCK-driven critical hits, and an iris battle-transition wipe
- ✦ Tactical status effects that actually bite — burn/poison tick, freeze
  skips a turn, ATK-down and confusion swing fights
- ✦ Enemy intent telegraphs + distinct AI (defensive guards, swift flurries,
  aggressive singles out the weakest) — Defend becomes a real decision
- ✦ Six playable Jesters — three starters plus three recruitable in the world
  (Verity Vex, Cogsworth, Sir Paradox)
- ✦ Two chained story quests, a distinct boss theme, and a quest journal (J)
- ✦ Post-quest respawning hunts for extra battles and EXP
- ✦ EXP bars + a level-up fanfare showing every stat gain
- ✦ Living exploration — a full-body Motley Max world sprite with grounded
  movement, drifting ward-motes, and footstep dust
- ✦ Defeat screen with Retry Battle / Wake options
- ✦ Save / Load via browser localStorage, with an overwrite guard on New Game
- ✦ Map-aware save migration preserves existing v0.2 saves and rejects invalid destinations
- ✦ Data-driven portrait preloading, reduced-motion effects, accurate playtime,
  and a visible recovery screen when game data cannot load
- ✦ Keyboard, mouse/click, and mobile touch controls
- ✦ Labeled touch buttons with a dedicated mobile quest-journal action
- ✦ A distinct Echoing Verge map with floating ward fragments, an echo dial,
  a shattered resonance span, cache, lore marker, and guardian encounter
- ✦ Measured post-level-5 encounter scaling that preserves authored campaign
  balance, keeps bosses relevant, and increases rewards proportionally

---

## Controls

| Key | Action |
|-----|--------|
| WASD / Arrow Keys | Move |
| F / Enter | Interact / Confirm |
| X / Escape | Cancel / Pause |
| J | Quest Journal |
| Click | All menus and targets |

---

## Project Structure

```
docs/               ← GitHub Pages root (the playable game)
  index.html        ← Game shell
  game.js           ← Full game engine
  assets/
    characters/     ← Jester character portraits
    enemies/        ← Big Cat guardian portraits  
    backgrounds/    ← Battle backgrounds
    ui/             ← Logo and branding
  data/
    characters.json
    enemies.json
    abilities.json
    items.json
    quests.json
    dialogue.json

docs-src/           ← Documentation
FIEND.md            ← Studio manifesto
checklist.txt       ← Master project checklist
```

---

## Development

Built with vanilla HTML5 Canvas and JavaScript — no build step required.

To run locally:
```bash
cd docs
python3 -m http.server 8080
# then open http://localhost:8080
```

Validation:
```bash
node --check docs/game.js
node tests/validate-data.mjs
node tests/battle-balance.test.mjs
node tests/world-save.test.mjs
node tests/full-flow.test.mjs
```

The staged Godot migration contract and parity gates are documented in
[GODOT_PORT.md](GODOT_PORT.md). The browser build remains canonical.

---

## The Warded Ones

Original characters, artwork, and lore © Fiend Studios / The Warded Ones.

See `The_Warded_Ones_NFT_License_with_Image_2025-05-12.pdf` for licensing details.

---

*Fiend Studios — Build exceptional things. Finish exceptional things.*
