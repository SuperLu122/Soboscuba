# Tests

Run everything with `npm test`.
Each test prints `ok` or `FAIL` per check and exits non-zero on any failure.

## Headless (`tests/node`, `npm run test:node`)

No browser needed.
`harness.js` loads the game's rule and physics scripts into Node.

| Test | Checks |
|---|---|
| phys.js | A lone 1 settles to the size and shape the original reaches in Godot, big sobos rest still, a 40-sobo pile stays sane and fast, equal sobos merge |
| mode.js | Spawning side and timing, the bar, launch and merge scoring, spawn pool unlocks, one merge per tick, bumper holding and the loss, save and restore, achievements, themes |

## Browser (`tests/e2e`, `npm run test:e2e`)

These start their own local server and drive Chromium with real mouse and touch input.
Screenshots go to `out/e2e/` (or `$OUT`).

Setup, once:

```sh
npm i --no-save playwright && npx playwright install chromium
```

Set `CHROMIUM_PATH` to use a specific Chromium binary.

| Test | Checks |
|---|---|
| flows.js | Aim, right-click cancel, launch, pause, save and continue across a reload, the loss, the game over card and view board, theme unlocks, light mode |
| play.js | Plays a game with touch on a phone and a mouse on a desktop window: drags launch, sobos merge, nothing escapes. `SHOTS=n` sets the length |
| files.js | `www/index.html` and the single-file build play straight from disk with fonts loaded |
| offline.js | After one visit the service worker serves the game and fonts offline |
| rotate.js | A sideways phone pauses and shows the rotate prompt |
| overcard.js | Game over numbers stay on one line, six digits on an iPhone SE |
| layouts.js | Phones, iPads, laptop, 4K and a narrow window all show the whole field with the HUD clear of it |
| themes.js | The same board in all 28 colour themes, for a visual check |
