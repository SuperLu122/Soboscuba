# Classic mode rebuild plan

Version 1.0, 2026-10-13.
Goal: make Soboscuba play like the original sobosuba, using `docs/original-spec.md` as the source of truth for rules and constants.
Kept from the earlier build: the web and iOS shell, HTML menus, sound synth, save and resume, PWA and the single-file build.
Colour themes are the original's 28, with its dark mode as the default (the user picked it over a toned-down Dark from a side-by-side render on 2026-10-13).

## Modules

All files stay plain scripts on the global `SB` namespace, loaded in this order, with no build step.

| file | owns |
|---|---|
| `js/physics.js` | Tier table, suba ring physics, extra mass balls, walls, bumpers, contacts, merge construction, shockwaves, blow-up and overlap recovery. No game rules. |
| `js/mode.js` | Classic rules: layouts, float bar, sides, rays, reenablers, spawn pool, safety spawn, roles (emerging, selectable, stack), aiming and launch, bumper holding, pre-game-over, score, achievement tracking. |
| `js/render.js` | Camera springs and all canvas drawing. |
| `js/audio.js` | Generated sounds. |
| `js/game.js` | App shell: storage, themes, menus, achievements screen, save and resume, input wiring, main loop. |

## Units and coordinates

World units are the original's px, origin at the field centre, y down.
Two layouts from the spec: mobile (392 x 608 field) for portrait screens and desktop (592 x 640 field) for landscape screens.
The camera fits the layout's world play area into the screen area left after the HUD panels.

## Simulation

Fixed 60 ticks per second, as in the original.
Each tick runs 4 substeps of semi-implicit Euler for forces (gravity 150, skin, area, ball spring, bar, bumper spring, linear damp 0.2/s), then position-based contact projection with velocity updated from the corrected positions, so contacts are inelastic and frictionless like the original (Godot combines friction with min, and every suba has friction 0).
Game rules run once per tick after physics, in the original's order: merges, spawning, pre-game-over check.

## Persistence

Save format v3 stores the full mode state (every suba position and velocity, roles, pool, bumpers, timers, score).
It is written on pause, page hide and every 4 s of play, and deleted at pre-game-over.
Older saves (v2) are discarded because their rules no longer apply.

## Checks

Node-run physics tests (no browser) for stability and merge behaviour, plus Playwright tests that play through real pointer input on a phone and a desktop viewport.
