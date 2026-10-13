// Headless physics checks on the mobile field: stability, resting size, merges.
const SB = require('./harness');
const FIELD = [[-196, -320], [196, -320], [196, 240], [148, 288], [-148, 288], [-196, 240]];
function world() { const w = new SB.World(); w.setField(FIELD); w.addBumper(-228, -112, -1); w.addBumper(228, -112, 1); return w; }
let fails = 0;
function check(name, ok, info) { console.log((ok ? 'ok   ' : 'FAIL ') + name + (info ? '  ' + info : '')); if (!ok) fails++; }

// 1. Settling matches the original. Reference values come from the real
//    game's code run headless in Godot 4.7.2: after 10 s a
//    lone 1 rests squashed at 58 x 27 px and 76% area, centre y 264.6.
{
  const w = world(); const s = w.add(new SB.Sobo(0, 0, 0));
  for (let f = 0; f < 600; f++) w.step();
  const wd = Math.max(...s.x) - Math.min(...s.x), ht = Math.max(...s.y) - Math.min(...s.y);
  check('tier 0 settles like the original', Math.abs(s.cy - 264.6) < 1.5 && Math.abs(wd - 58) < 3 && Math.abs(ht - 27) < 3 && Math.abs(s.area / s.data.innerArea - 0.76) < 0.03,
    `cy=${s.cy.toFixed(1)} w=${wd.toFixed(0)} h=${ht.toFixed(0)} A=${(s.area / s.data.innerArea).toFixed(2)}`);
}
for (const tier of [3, 9]) {
  const w = world(); const s = w.add(new SB.Sobo(tier, 0, 0));
  for (let f = 0; f < 900; f++) w.step();
  const bottom = Math.max(...s.y) + SB.SUBA_R;
  check(`tier ${tier} rests on the floor`, Math.abs(bottom - 288) < 2 && Math.abs(s.avy) < 30, `bottom=${bottom.toFixed(1)} vy=${s.avy.toFixed(2)}`);
}

// 2. A crowded pile stays sane: no NaN, nothing escapes, no tangles.
{
  const w = world(); let rnd = 1; const R = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 40; k++) w.add(new SB.Sobo(Math.floor(R() * 5), -150 + R() * 300, -250 + (k % 8) * 60)).setVelocity((R() - 0.5) * 400, 0);
  let maxMs = 0, sum = 0, recov = 0;
  for (let f = 0; f < 1200; f++) { const t = process.hrtime.bigint(); w.step(); const ms = Number(process.hrtime.bigint() - t) / 1e6; maxMs = Math.max(maxMs, ms); sum += ms; recov = Math.max(recov, w.recoveries.length); }
  let nan = false, out = 0; for (const s of w.sobos) { if (!isFinite(s.cx)) nan = true; if (Math.abs(s.cx) > 200 || s.cy > 290 || s.cy < -330) out++; }
  check('pile has no NaN', !nan); check('pile nothing escaped', out === 0, `out=${out}`);
  check('pile step time', sum / 1200 < 4, `avg=${(sum / 1200).toFixed(2)}ms max=${maxMs.toFixed(1)}ms subas=${w.count} peakRecoveries=${recov}`);
}

// 3. Two equal sobos merge into one of the next tier with the right flags.
{
  const w = world(); const a = w.add(new SB.Sobo(2, -60, 200)), b = w.add(new SB.Sobo(2, 60, 200));
  a.setVelocity(200, 0); b.setVelocity(-200, 0);
  let merged = null;
  for (let f = 0; f < 120 && !merged; f++) { w.step(); if (w.pairs.length) { const p = w.pairs[0]; merged = w.merge(p.a, p.b, p.ia, p.ib); } }
  check('equal sobos merge', merged && merged.tier === 3 && merged.merged && w.sobos.length === 1);
  for (let f = 0; f < 240; f++) w.step();
  if (merged) check('merge result inflates', merged.area / merged.data.innerArea > 0.7, `area ratio=${(merged.area / merged.data.innerArea).toFixed(3)}`);
}
process.exit(fails ? 1 : 0);
