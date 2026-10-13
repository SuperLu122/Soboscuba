const { chromium } = require('./pw');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['dark'];
  const errors = [];
  for (const id of ids) {
    const page = await browser.newPage({ viewport: { width: 390, height: 640 }, deviceScaleFactor: 2 });
    page.on('pageerror', e => errors.push(id + ': ' + e.message));
    await page.goto('http://localhost:8099/');
    await page.evaluate(() => localStorage.setItem('soboscuba.tutorialDone', 'true'));
    await page.click('#btn-play');
    await page.evaluate((id) => {
      const g = SB.game, w = g.world; g.applyStyle(id);
      w.clear();
      const pile = [[1024,250,540],[128,90,540],[8,360,560],[4,50,560],[256,150,460],[64,330,460],[32,240,440],[512,90,380],[16,300,380],[128,190,340],[2,370,380],[1,60,300]];
      for (const [v,x,y] of pile) { const b = w.add(new SB.Blob(v,x,y,0,0)); b.made = v > 8; for (let f=0; f<25; f++) w.step(); }
      for (let f=0; f<200; f++) w.step();
      g.S.score = 1860; g.S.cur = 32; g.S.queue = [2, 1, 4]; g.S.readyT = 0; g.S.meter = [0.55, 0.2];
      g.S.mode = 'paused'; document.getElementById('pause').hidden = true;
    }, id);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `theme-${id}.png` });
    await page.close();
  }
  console.log('errors', JSON.stringify(errors));
  await browser.close();
})();
