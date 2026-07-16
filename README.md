# The Warded Ones RPG 1 — Jester's Trial

**A Fiend Studios original fantasy RPG**

[![Play Now](https://img.shields.io/badge/Play-GitHub%20Pages-purple)](https://flipthiscrypto.github.io/The-Warded-Ones-RPG-1/)

---

## Play the Game

**[▶ Play in your browser →](https://flipthiscrypto.github.io/The-Warded-Ones-RPG-1/)**

No download required. Works on desktop browsers (Chrome, Firefox, Edge).

---

## About

The Warded Ones RPG 1 is an original browser-based fantasy RPG built on The Warded Ones IP — a collection of mystical Jester characters and guardian beasts.

**Vertical Slice: Jester's Trial**

Play as Motley Max and his Jester companions as they battle through the Warded Grounds to claim the legendary Ward Stone.

### Features (v0.1)
- ✦ Branded title screen with animated effects
- ✦ Intro cutscene with progressive dialogue
- ✦ Explorable area with NPCs and interactive objects
- ✦ Turn-based combat with Attack / Ability / Item / Defend
- ✦ Full party system (Motley Max, Gloam, Tumbling Tess)
- ✦ Enemy abilities and AI behavior
- ✦ Status effects (burn, freeze, confuse, etc.)
- ✦ EXP, leveling, and gold rewards
- ✦ Quest tracking system
- ✦ Save / Load via browser localStorage
- ✦ Keyboard and mouse/click controls

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
