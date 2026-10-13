// Headless classic-mode rule checks against docs/original-spec.md.
const SB = require('./harness');
let fails = 0;
function check(name, ok, info) { console.log((ok ? 'ok   ' : 'FAIL ') + name + (info ? '  ' + info : '')); if (!ok) fails++; }
function seed(n) { let s = n; Math.random = () => (s = (s * 16807) % 2147483647) / 2147483647; }
function run(m, ticks) { for (let i = 0; i < ticks; i++) m.tick(); }

// 1. Spawning: the first sobo comes from the right, flies in through the wall
//    and becomes selectable; the pool starts as just the 1s.
{
  seed(1);
  const sides = [], m = new SB.Classic('mobile', { spawn: (s, side) => sides.push(side) });
  run(m, 1);
  check('first spawn is on the right', sides[0] === 1);
  check('spawned sobo cannot merge while emerging', m.emerging.length === 1 && !m.emerging[0].allowMerges);
  run(m, 60);
  check('it becomes selectable once inside', m.selectable.length === 1 && m.emerging.length === 0);
  run(m, 600);
  const s = m.selectable[0];
  check('it floats on the bar', Math.abs(s.cy - m.layout.barY) < 6, `cy=${s.cy.toFixed(1)}`);
  check('pool starts at tier 0 only', m.pool.join() === '0');
}

// 2. Launch, merge and score: two launched 1s merge into a 2 worth 2 points.
{
  seed(2);
  const gains = [], m = new SB.Classic('mobile', { gain: n => gains.push(n) });
  let guard = 0;
  while (m.score === 0 && guard++ < 60) {
    run(m, 30);
    if (m.selectable.length) m.launch(m.selectable[0], 0, 0.6);
    run(m, 90);
  }
  check('launched sobos merge and score', m.score >= 2 && gains[0] === 2, `score=${m.score} gains=${gains.slice(0, 3)}`);
  check('merged sobo is flagged', m.world.sobos.some(s => s.merged));
  check('merging into a 2 unlocks tier 1 spawns', m.pool.indexOf(1) >= 0, `pool=${m.pool}`);
}

// 3. One merge per tick, lowest contact first.
{
  const m = new SB.Classic('desktop', {}), w = m.world;
  const pairs = [[-150, 250], [150, 100]].map(([x, y]) => [new SB.Sobo(0, x - 25, y), new SB.Sobo(0, x + 25, y)]);
  pairs.flat().forEach(s => { w.add(s); m._stack(s); });
  let merges = [];
  m.hooks.merge = (A, B, N, x, y) => merges.push({ tick: m.ticks, y });
  run(m, 3);
  const firstTick = merges.filter(e => e.tick === merges[0].tick);
  check('only one merge per tick', merges.length >= 1 && firstTick.length === 1, `merges=${JSON.stringify(merges)}`);
  check('the lowest contact merges first', merges[0].y > 200);
}

// 4. Both bumpers fully out ends the game after the 3 s freeze.
{
  const ev = [], m = new SB.Classic('mobile', { preGameOver: () => ev.push('pre'), gameOver: () => ev.push('over') });
  run(m, 10);
  m.sides.forEach(s => { s.bumper.x = s.bumper.restX + s.bumper.dir * 32; s.bumper.vx = 0; });
  run(m, 2);
  check('both bumpers held starts pre-game-over', m.state === 'pregameover' && ev[0] === 'pre');
  const frozen = m.world.sobos.map(s => s.cx).join();
  run(m, 60);
  check('the board is frozen', m.world.sobos.map(s => s.cx).join() === frozen);
  for (let i = 0; i < 200; i++) m.frame(1 / 60);
  check('game over after 3 s', m.state === 'gameover' && ev[1] === 'over');
}

// 5. One bumper alone never ends the game, and holding lapses 0.5 s after release.
{
  const m = new SB.Classic('mobile', {});
  m.sides[0].bumper.x = m.sides[0].bumper.restX - 32;
  run(m, 2);
  check('one bumper held is only a warning', m.state === 'playing' && m.sides[0].holding);
  run(m, 60);
  check('holding lapses after release', !m.sides[0].holding);
}

// 6. Save and restore round trip.
{
  seed(3);
  const m = new SB.Classic('desktop', {});
  for (let k = 0; k < 12; k++) { run(m, 60); if (m.selectable.length) m.launch(m.selectable[0], (k % 3 - 1) * 0.3, 0.5); }
  run(m, 30);
  const data = JSON.parse(JSON.stringify(m.capture()));
  const n = new SB.Classic('desktop', {});
  check('restore accepts a v3 save', n.restore(data));
  check('restore keeps every sobo and role', n.world.sobos.length === m.world.sobos.length && n.stack.length === m.stack.length && n.selectable.length === m.selectable.length,
    `${n.world.sobos.length}/${m.world.sobos.length}`);
  check('restore keeps score and pool', n.score === m.score && n.pool.join() === m.pool.join());
  check('a save for the other layout is refused', !new SB.Classic('mobile', {}).restore(data));
  run(n, 120);
  check('restored game keeps running', n.world.sobos.every(s => isFinite(s.cx)));
}

// 7. Achievements: lineage chains, bar sizes, the exact-score set.
{
  const got = [], t = new SB.Achievements.Tracker(id => got.push(id));
  const mk = v => ({ value: v, dead: false });
  let head = mk(2); t.merge(mk(1), mk(1), head, false);
  for (let v = 4; v <= 16; v *= 2) { const n = mk(v); t.merge(head, mk(v / 2), n, false); head.dead = true; head = n; }
  check('a 1 to 16 lineage earns chain 1-16', got.indexOf('chain_1_16') >= 0, got.join());
  t.barJoin({ value: 64 });
  check('a 64 on the bar earns bar 64', got.indexOf('bar_64') >= 0);
  t.gameOver(0);
  check('a final score of 0 earns score 0', got.indexOf('score_0') >= 0);
  check('there are 30 achievements', SB.Achievements.DEFS.length === 30);
  check('28 themes, dark mode first', SB.STYLES.length === 28 && SB.STYLES[0].id === 'dark_mode');
}
process.exit(fails ? 1 : 0);
