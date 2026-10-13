const { chromium } = require('./pw');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const f of [require('path').resolve(__dirname, '../www/index.html'), require('path').resolve(__dirname, '../dist/soboscuba.html')]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + f);
    await page.click('#btn-play'); await page.waitForTimeout(150);
    await page.mouse.move(640, 400); await page.mouse.down(); await page.mouse.move(600, 300, { steps: 5 }); await page.mouse.up();
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => ({ mode: SB.game.S.mode, blobs: SB.game.world.blobs.length,
      font: [...document.fonts].some(f => f.family.includes('Audiowide') && f.status === 'loaded') }));
    console.log(f, JSON.stringify(r), 'errors:', JSON.stringify(errors));
  }
  await browser.close();
})();
