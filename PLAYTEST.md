# PLAYTEST.md — Automated Full-Playthrough Sweep

A scripted end-to-end playthrough driven through the real game flow in the
browser console (no state shortcuts: battles are fought turn by turn with
`executePlayerAttack`, encounters trigger by walking, NPCs/objects by
interact range). Run it after any engine or content change.

## Protocol (browser dev console, game served locally)

1. `localStorage.clear()` → Title → New Game → drain intro dialogue.
2. Elder Ward from within interact range (≤60px; approach the platform from
   below at y≈225).
3. Walk into both guardian encounter zones while holding a movement key
   (zone checks only run while moving) and fight to victory.
4. Blaze Lion spawns at (750,360) after both guardians — walk in, win.
   (The Ward Stone only *warns* while the presence is alive: intended.)
5. Claim the Ward Stone from its left edge (x≈665, y≈150) →
   Quest 1 complete → Quest 2 unlocks.
6. Recruit Verity Vex (120,460), Cogsworth (835,320), Sir Paradox (450,555)
   → gather stage 3/3.
7. Star Sigil (455,95 — stand clear of the gold chest's radius) →
   Astral Cougar → fight to victory → Quest 2 complete.
8. `game.save(); game.load()` roundtrip; check `console.error` capture.
9. After Quest 1, walk through the south gate (x 390–510, y=568) into The
   Echoing Verge. Verify the arrival card and that held movement does not bounce
   back through the transition.
10. Speak to the Ward Echo, examine the Resonant Marker, open the Verge Cache,
    and defeat the paired guardians. Verify each reward occurs only once.
11. Save/load inside the Verge, return through the north arch, then save/load
    again in the Grounds. Verify location and per-map object/encounter state.

## Automated checks

```bash
node --check docs/game.js
node tests/validate-data.mjs
node tests/world-save.test.mjs
node tests/full-flow.test.mjs
```

The world/save test covers schema-2 roundtrip, v1 migration, unknown-map
fallback, corrupt JSON, and Blaze Lion restoration from a mid-quest save.

## Results — 2026-07-17 (v0.3 multi-map regression loop)

| Check | Result |
|---|---|
| Deterministic full-flow integration | ✅ both quests, recruits, bosses, hunts, Verge, return |
| World/save assertions | ✅ 19 passed |
| Data validation | ✅ 6 characters, 6 enemies, 37 abilities, 5 items, 2 quests, 18 dialogues |
| Echoing Verge visual render | ✅ zero console errors |
| Hunt ownership after loading/updating in Verge | ✅ fixed; hunts remain in Grounds |
| Exploration HUD overlap / invalid HP-MP maxima | ✅ fixed |
| Narrow viewport horizontal overflow | ✅ fixed at 390×844 |

## Results — 2026-07-16 (loop 3, after items 1–8)

| Check | Result |
|---|---|
| Console errors across the full run | **0** |
| Quest 1 (elder → guardians ×2 → Blaze Lion → stone) | ✅ completable |
| Quest 2 (unlock → recruits 3/3 → sigil boss) | ✅ completable |
| Astral Cougar fought turn-by-turn | ✅ won (~110 rounds, 6/6 alive) |
| Save/load after full completion | ✅ state intact |
| Defeat → Retry / Wake (checked in item 8) | ✅ |

Environment notes for whoever runs this next:
- The embedded preview browser throttles `requestAnimationFrame`; drive
  frames manually with `for(...) game.update(1/60)` between actions.
- Interact range is `npc/object.radius + 40` — most "bugs" during sweeps
  are actually the probe standing too far away. Verify distance first.
