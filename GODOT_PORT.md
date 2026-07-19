# Godot 4 Port Plan

## Decision

The browser game remains the shipped, canonical implementation. A Godot 4
port may begin only as a parity project: it must consume the same authored JSON
and runtime art, reproduce one complete vertical path at a time, and never
block GitHub Pages releases.

## Why Port

Godot can eventually provide stronger scene tooling, animation, controller
support, and desktop/mobile packaging. It is not a reason to rewrite proven
content, redesign combat, or maintain two divergent games.

## Non-Goals

- No new quests, characters, lore, online features, blockchain, or monetization.
- No conversion of source NFT artwork; only processed `docs/assets/` files are used.
- No Godot-exclusive balance or dialogue data.
- No replacement of the browser build until full parity is demonstrated.
- No one-shot rewrite of `docs/game.js`.

## Canonical Shared Contract

The files in `docs/data/` remain the source of truth for characters, enemies,
abilities, items, quests, and dialogue. Godot importers must accept the current
schema without hand-edited copies. Stable IDs and save schema semantics remain
unchanged. Engine-specific presentation belongs in engine-specific scenes and
scripts, not in duplicated content JSON.

## Migration Order and Gates

### Gate 0 — Project Skeleton

- Godot 4.x project opens without warnings.
- A headless smoke test loads all six JSON datasets and every referenced asset.
- CI can run the smoke test independently of browser tests.
- No gameplay code is copied yet.

### Gate 1 — Warded Grounds Exploration

- Render the 900×600 Warded Grounds composition and full-body Motley Max.
- Match movement bounds, collision, interaction radius, D-pad/controller input,
  reduced-motion behavior, and the exploration HUD.
- Load NPCs, objects, and encounters from stable IDs.
- Parity evidence: the same arrival, Elder, chest, and collision checks pass in
  browser and Godot.

### Gate 2 — Dialogue and Quest State

- Progressive dialogue, portraits, branching callbacks, journal, and both quest
  stage chains work from shared JSON.
- A scripted quest-state fixture produces equivalent browser/Godot results.

### Gate 3 — One Complete Battle

- Port turn order, MP, Attack/Ability/Item/Defend, statuses, intent telegraphs,
  AI archetypes, rewards, defeat Retry/Wake, and post-level-5 scaling.
- Use `tests/battle-balance.test.mjs` output as the numerical reference.
- Complete one Abyss Tiger battle before porting any other enemy.

### Gate 4 — Complete v0.3 Route

- Port the Blaze Lion, recruits, Astral Cougar, Echoing Verge, hunts, travel,
  cache/discovery state, prologue, and epilogue.
- Reproduce the deterministic full-flow protocol in a Godot headless test.
- Desktop keyboard/controller and touch layouts pass visual acceptance.

### Gate 5 — Save Compatibility and Release Candidate

- Define a versioned import path for browser save schema 2; never silently
  overwrite a browser save.
- Complete both quests from a clean save and load representative legacy/mid-
  quest fixtures.
- Match all browser validation counts and balance gates.
- Only then evaluate packaging and whether Godot should become primary.

## Suggested Structure

```text
godot/
  project.godot
  scenes/
    game.tscn
    explore/warded_grounds.tscn
    battle/battle.tscn
    ui/
  scripts/
    data_repository.gd
    game_state.gd
    save_codec.gd
  tests/
  assets/              # imported from, not manually diverged from, docs/assets
```

## Parity Scorecard

A gate is complete only when it is implemented, headlessly tested, visually
checked, and documented. Record each result beside the corresponding browser
test. If a Godot choice would require changing shared canon or rules, improve
the shared contract first and verify both engines.

## First Implementation Task

Create only Gate 0: an empty Godot project, a JSON data repository, and a
headless validation command. Stop there for review. This is the smallest step
that proves the port can share the existing game factory instead of forking it.
