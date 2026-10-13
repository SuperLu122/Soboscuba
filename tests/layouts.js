const { chromium, devices } = require('./pw');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const cfgs = [['phone-land', devices['iPhone 13 landscape']], ['ipad', devices['iPad Pro 11']],
    ['ipad-land', devices['iPad Pro 11 landscape']], ['desk', { viewport: { width: 1920, height: 1080 } }], ['small-phone', devices['iPhone SE']]];
  for (const [name, dev] of cfgs) {
    const ctx = await browser.newContext(dev);
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto('http://localhost:8099/');
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${process.argv[2]}/play/L-${name}-title.png` });
    const rot = await page.evaluate(() => getComputedStyle(document.getElementById('rotate')).display);
    if (rot !== 'none') { console.log(name, 'rotate prompt shown (expected for sideways phone)'); await ctx.close(); continue; }
    await page.click('#btn-play');
    await page.evaluate(() => { const g = SB.game; for (let i = 0; i < 25; i++) { g.S.readyT = 0; g.launch({ x: (i % 7 - 3) * 14, y: 10 }); for (let f = 0; f < 40; f++) g.update(1 / 60); } });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${process.argv[2]}/play/L-${name}-game.png` });
    console.log(name, JSON.stringify(await page.evaluate(() => SB.game.view)), errs);
    await ctx.close();
  }
  await browser.close();
})();
