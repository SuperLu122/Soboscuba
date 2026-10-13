const { chromium, devices } = require('./pw');
const OUT = process.argv[2] || 'look';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errors = [];
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  await page.goto('http://localhost:8099/');
  await page.evaluate(() => localStorage.setItem('soboscuba.tutorialDone', 'true'));
  await page.reload(); await sleep(1200);
  await page.screenshot({ path: OUT + '/1-title.png' });
  await page.tap('#btn-play'); await sleep(300);
  await page.evaluate(() => {
    const g = SB.game, w = g.world;
    w.clear();
    const pile = [[1024,250,540],[128,90,540],[8,360,560],[4,50,560],[256,150,460],[64,330,460],[32,240,440],[256,80,380],[64,300,380],[128,190,360],[2,370,380]];
    for (const [v,x,y] of pile) { const b = w.add(new SB.Blob(v,x,y,0,0)); b.made = v > 16; for (let f=0; f<25; f++) { g.update(1/60); } }
    for (let f=0; f<200; f++) g.update(1/60);
    g.S.score = 1860; g.S.cur = 32; g.S.queue = [2, 1, 4]; g.S.meter = [0.6, 0.15];
  });
  await sleep(1200);
  await page.screenshot({ path: OUT + '/2-pile.png' });
  await touch('touchStart', 200, 300);
  for (let i = 1; i <= 10; i++) { await touch('touchMove', 200 + i * 1, 300 - i * 9); await sleep(16); }
  await sleep(400);
  await page.screenshot({ path: OUT + '/3-aim.png' });
  await touch('touchEnd'); await sleep(150);
  await page.screenshot({ path: OUT + '/4-flight.png' });
  console.log(JSON.stringify(await page.evaluate(() => ({ mode: SB.game.S.mode, pad: SB.game.S.pad.map(x => +x.toFixed(1)), meter: SB.game.S.meter.map(x => +x.toFixed(2)), blobs: SB.game.world.blobs.length }))));
  const desk = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  desk.on('pageerror', e => errors.push('desk: ' + e.message));
  await desk.goto('http://localhost:8099/'); await sleep(800);
  await desk.click('#btn-play'); await sleep(200);
  await desk.evaluate(() => { const g = SB.game, w = g.world; [[512,200,520],[16,80,540],[8,330,540],[64,120,450],[128,280,440]].forEach(([v,x,y]) => { w.add(new SB.Blob(v,x,y,0,0)); for (let f=0; f<30; f++) g.update(1/60); }); g.S.score = 4242; });
  await sleep(800);
  await desk.screenshot({ path: OUT + '/5-desktop.png' });
  console.log('errors', JSON.stringify(errors));
  await browser.close();
})();
