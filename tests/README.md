# Browser tests

Playwright scripts that drive the real game in Chromium. Start the dev server first:

```
PORT=8099 node tools/serve.js      # every test loads http://localhost:8099/
npm i -D playwright && npx playwright install chromium   # once
mkdir -p out/play
```

Run any script with an output folder for screenshots: `node tests/test.js out`.

| Script | Checks |
|---|---|
| test.js | Smoke test: play, drag-launch, resume, forced pad overload ends the game |
| phys.js | Landing bounce/roll, tangles under 120 hard shots, escapes, NaN |
| stress.js | Two 8192s merge, crowded tank, ms per physics step |
| filetest.js | `www/index.html` and `dist/soboscuba.html` work straight from disk (run `npm run build:single` first) |
| offline.js | Service worker offline reload |
| rotate.js | Sideways phone pauses and shows the rotate prompt |
| overlock.js | Game-over card ignores an instant tap |
| layouts.js | iPad, iPad sideways, desktop, small phone (needs `out/play`) |
| look.js | Screenshots of title, mid-game pile, aiming, desktop |
| themes.js | Same pile rendered in each colour theme: `node tests/themes.js dark neon sunset` |
| padcal.js | Pressure-pad calibration: pad pressure as a pile grows |
