const { chromium, devices } = require('./pw');
const SP = process.argv[2];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://localhost:8099/');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: SP + '/1-title.png' });
  await page.tap('#btn-play');
  // Fire a bunch of shots via the real launch() with random aims.
  const stats = await page.evaluate(async () => {
    const g = SB.game;
    let maxStep = 0, total = 0, n = 0;
    for (let shot = 0; shot < 40; shot++) {
      g.S.readyT = 0;
      g.launch({ x: (Math.random() - 0.5) * 120, y: Math.random() * 60 });
      for (let f = 0; f < 40; f++) {
        const t0 = performance.now(); g.update(1 / 60); const dt = performance.now() - t0;
        maxStep = Math.max(maxStep, dt); total += dt; n++;
        if (g.S.mode !== 'play') break;
      }
      if (g.S.mode !== 'play') break;
    }
    let nan = false;
    for (const b of g.world.blobs) if (!isFinite(b.cx) || !isFinite(b.cy)) nan = true;
    const escaped = g.world.blobs.filter(b => b.cx < 0 || b.cx > 420 || b.cy > 760).length;
    return { mode: g.S.mode, score: g.S.score, biggest: g.S.biggest, blobs: g.world.blobs.length,
      particles: g.world.count, avgStepMs: (total / n).toFixed(3), maxStepMs: maxStep.toFixed(2), nan, escaped };
  });
  console.log(JSON.stringify(stats));
  await page.waitForTimeout(800);
  await page.screenshot({ path: SP + '/2-play.png' });

  // Real touch-ish drag with mouse events to aim and launch.
  await page.evaluate(() => { SB.game.S.readyT = 0; if (SB.game.S.mode !== 'play') SB.game.newGame(); });
  await page.waitForTimeout(400);
  await page.mouse.move(195, 300); await page.mouse.down();
  await page.mouse.move(150, 200, { steps: 6 });
  await page.waitForTimeout(100);
  await page.screenshot({ path: SP + '/3-aim.png' });
  const before = await page.evaluate(() => SB.game.world.blobs.length);
  await page.mouse.up();
  await page.waitForTimeout(100);
  const after = await page.evaluate(() => SB.game.world.blobs.length);
  console.log('drag launch added blob:', after === before + 1);

  // Save / resume round trip.
  const resumed = await page.evaluate(() => { SB.game.save(); const n = SB.game.world.blobs.length; SB.game.resume(); return n === SB.game.world.blobs.length; });
  console.log('resume ok:', resumed);

  // Force game over to see the overlay.
  await page.evaluate(() => { Object.defineProperty(SB.game.world, 'padR', { get: () => 40, set: () => {}, configurable: true }); });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: SP + '/4-over.png' });
  console.log('mode after forced overflow:', await page.evaluate(() => SB.game.S.mode));

  const desk = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  desk.on('pageerror', e => errors.push('desktop: ' + e.message));
  await desk.goto('http://localhost:8099/');
  await desk.click('#btn-play');
  await desk.evaluate(async () => { for (let i = 0; i < 12; i++) { SB.game.S.readyT = 0; SB.game.launch({ x: (i % 5 - 2) * 30, y: 20 }); for (let f = 0; f < 45; f++) SB.game.update(1 / 60); } });
  await desk.waitForTimeout(500);
  await desk.screenshot({ path: SP + '/5-desktop.png' });
  console.log('errors:', JSON.stringify(errors));
  await browser.close();
})();
