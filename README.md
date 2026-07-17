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

### Features (v0.2)
- ✦ Branded title screen with animated effects
- ✦ Scroll-scrubbed cinematics — scrolling flies the camera over the live
  game map: a five-beat prologue before the trial, a victory-lap epilogue
  over the restored grounds when the final quest ends, and a prologue
  replay from the title screen (P). Honors reduced-motion preferences.
  (Scrub technique adapted from
  [scroll-world](https://github.com/oso95/scroll-world), MIT)
- ✦ Intro cutscene with progressive dialogue
- ✦ Explorable area with NPCs, chests, and interactive objects
- ✦ Turn-based combat with Attack / Ability / Item / Defend
- ✦ Six playable Jesters — three starters plus three recruitable in the world
  (Verity Vex, Cogsworth, Sir Paradox)
- ✦ Two chained story quests, boss fights, and a quest journal (J)
- ✦ Enemy abilities, AI behavior, and party-wide boss AoEs
- ✦ Status effects (burn, freeze, confuse, ATK/SPD down, evade)
- ✦ EXP, leveling, and gold rewards
- ✦ Defeat screen with Retry Battle / Wake options
- ✦ Save / Load via browser localStorage (settings persist too)
- ✦ Keyboard, mouse/click, and mobile touch controls

---

## Controls

| Key | Action |
|-----|--------|
| WASD / Arrow Keys | Move |
| F / Enter | Interact / Confirm |
| X / Escape | Cancel / Pause |
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

---

## The Warded Ones

Original characters, artwork, and lore © Fiend Studios / The Warded Ones.

See `The_Warded_Ones_NFT_License_with_Image_2025-05-12.pdf` for licensing details.

---

*Fiend Studios — Build exceptional things. Finish exceptional things.*
