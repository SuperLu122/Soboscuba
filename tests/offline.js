const { chromium, devices } = require('./pw');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext(devices['iPhone 13']);
  const page = await ctx.newPage();
  await page.goto('http://localhost:8099/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(800);
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForTimeout(800);
  await page.tap('#btn-play');
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => ({ mode: SB.game.S.mode, font: [...document.fonts].some(f => f.family.includes('Audiowide') && f.status === 'loaded'),
    icon: !!document.querySelector('link[rel=apple-touch-icon]') }));
  console.log('offline reload:', JSON.stringify(r));
  await browser.close();
})();
