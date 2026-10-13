// Physics sanity: bounce/roll on landing, and tangles under hard shots.
const { chromium, devices } = require('./pw');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://localhost:8099/');
  await page.evaluate(() => { try { localStorage.setItem('soboscuba.tutorialDone', 'true'); } catch (e) {} });
  await page.tap('#btn-play');
  const r = await page.evaluate(() => {
    const g = SB.game, w = g.world, out = {};
    // 1. Bounce: drop a 16 from the launcher onto an empty floor.
    w.clear();
    const b = w.add(new SB.Blob(16, 210, 166, 0, 0));
    let landed = false, minY = 1e9, landX = 0, maxRise = 0, f;
    for (f = 0; f < 300; f++) {
      g.S.meter = [0, 0]; g.update(1/60);
      if (!landed && b.cy + b.R > 590) { landed = true; landX = b.cx; minY = b.cy; }
      if (landed) { maxRise = Math.max(maxRise, minY - b.cy); }
    }
    out.bounce = maxRise.toFixed(1); out.roll = Math.abs(b.cx - landX).toFixed(1);
    // 2. Hard sideways shot into a blob on the floor: how far does it fly back?
    w.clear();
    // 3. Tangles: 120 hard random shots, tally frames where a blob centre lies inside another ring.
    g.newGame(); g.S.mode = 'play';
    let tangles = 0, frames = 0, worst = 0;
    for (let s = 0; s < 120; s++) {
      g.S.readyT = 0;
      const a = Math.random() * Math.PI, p = 60 + Math.random() * 80;
      g.launch({ x: Math.cos(a) * p * (Math.random() < .5 ? 1 : -1), y: Math.abs(Math.sin(a)) * p });
      for (let k = 0; k < 30; k++) {
        g.S.meter = [0, 0]; g.update(1/60); frames++;
        let t = 0;
        for (const A of w.blobs) for (const B of w.blobs) if (A !== B && A.curR > B.curR && w._inside(A, B.cx, B.cy)) t++;
        if (t) tangles++; worst = Math.max(worst, t);
      }
      if (g.S.mode !== 'play') { g.newGame(); }
    }
    out.tangleFrames = tangles + '/' + frames; out.worst = worst;
    out.nan = w.blobs.some(b => !isFinite(b.cx));
    out.escaped = w.blobs.filter(b => b.cx < 16 || b.cx > 404 || b.cy > 600 || (b.cx - 22) + (596 - b.cy) < 40 || (398 - b.cx) + (596 - b.cy) < 40).length;
    return out;
  });
  console.log(JSON.stringify(r), 'errors', JSON.stringify(errors));
  await browser.close();
})();
