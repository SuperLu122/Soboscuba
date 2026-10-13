const { chromium } = require('./pw');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const seed0 of [7, 99, 1234]) {
    const page = await browser.newPage({ viewport: { width: 420, height: 620 } });
    await page.goto('http://localhost:8099/');
    await page.click('#btn-play');
    const rows = await page.evaluate((seed0) => {
      const g = SB.game, w = g.world; w.clear();
      let seed = seed0; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const out = [];
      for (let i = 0; i < 30; i++) {
        const v = 2 ** Math.floor(rnd() * 9);
        w.add(new SB.Blob(v, 60 + rnd() * 300, 170, (rnd() - 0.5) * 300, 300));
        for (let f = 0; f < 60; f++) w.step();
        let L = 0, R = 0, top = 1e9;
        for (let f = 0; f < 60; f++) { w.step(); L += w.padL; R += w.padR; }
        for (const b of w.blobs) top = Math.min(top, b.cy - b.curR);
        out.push([i + 1, Math.round(top), +(L / 60).toFixed(1), +(R / 60).toFixed(1)]);
        if (top < 175) break;
      }
      return out;
    }, seed0);
    console.log('seed', seed0, rows.map(r => r.join(':')).join('  '));
    await page.close();
  }
  await browser.close();
})();
