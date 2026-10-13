const { chromium, devices } = require('./pw');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://localhost:8099/');
  await page.tap('#btn-play');
  const r = await page.evaluate(() => {
    const g = SB.game, w = g.world;
    w.add(new SB.Blob(8192, 120, 480, 0, 0)); w.add(new SB.Blob(8192, 300, 480, 0, 0));
    for (let f = 0; f < 120; f++) g.update(1/60);
    const big = w.blobs.map(b => b.value);
    // Crowd the tank
    const vals = [2,4,8,16,32,64,128,256,512];
    for (let i = 0; i < 25; i++) { w.add(new SB.Blob(vals[i % 9], 60 + (i * 53) % 300, 250 + (i % 5) * 20, 0, 0)).age = 0; for (let f = 0; f < 10; f++) g.update(1/60); }
    g.S.meter = [0, 0]; // keep playing regardless
    let t0 = performance.now();
    for (let f = 0; f < 300; f++) { g.S.meter = [0, 0]; g.update(1/60); }
    const ms = (performance.now() - t0) / 300;
    const speeds = w.blobs.map(b => Math.hypot(b.vx, b.vy));
    const escaped = w.blobs.filter(b => b.cx < 22 || b.cx > 398 || b.cy > 596 || !isFinite(b.cx)).length;
    return { afterBigMerge: big, blobs: w.blobs.length, particles: w.count, msPerStep: ms.toFixed(2),
      maxSpeed: Math.max(...speeds).toFixed(1), avgSpeed: (speeds.reduce((a,b)=>a+b,0)/speeds.length).toFixed(1), escaped };
  });
  console.log(JSON.stringify(r), 'errors:', JSON.stringify(errors));
  await page.waitForTimeout(300);
  await page.screenshot({ path: process.argv[2] + '/6-stress.png' });
  await browser.close();
})();
