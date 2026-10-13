const { chromium, devices } = require('./pw');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext(devices['iPhone 13']);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:8099/');
  await page.tap('#btn-play');
  await page.waitForTimeout(300);
  await page.setViewportSize({ width: 750, height: 342 });   // rotate to landscape
  await page.waitForTimeout(500);
  const m1 = await page.evaluate(() => SB.game.S.mode);
  await page.screenshot({ path: process.argv[2] + '/play/rotate.png' });
  await page.setViewportSize({ width: 390, height: 664 });   // back upright
  await page.waitForTimeout(400);
  const m2 = await page.evaluate(() => [SB.game.S.mode, getComputedStyle(document.getElementById('rotate')).display]);
  console.log('landscape mode:', m1, '| upright:', m2, errs);
  await browser.close();
})();
