const { chromium, devices } = require('./pw');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext(devices['iPhone 13']);
  const page = await ctx.newPage();
  await page.goto('http://localhost:8099/');
  await page.tap('#btn-play');
  await page.evaluate(() => { Object.defineProperty(SB.game.world, 'padL', { get: () => 40, set: () => {}, configurable: true }); });
  await page.waitForFunction(() => !document.getElementById('over').hidden);
  const r = await page.evaluate(() => JSON.stringify(document.getElementById('btn-again').getBoundingClientRect()));
  const b = JSON.parse(r);
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);   // immediate tap: must be ignored
  await page.waitForTimeout(200);
  const m1 = await page.evaluate(() => SB.game.S.mode);
  await page.waitForTimeout(900);
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);   // later tap: works
  await page.waitForTimeout(200);
  const m2 = await page.evaluate(() => SB.game.S.mode);
  console.log('instant tap ->', m1, '| tap after 1.1s ->', m2);
  await browser.close();
})();
