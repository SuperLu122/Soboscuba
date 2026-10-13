/*
 * Soboscuba game layer: slingshot input, merging, scoring, danger line,
 * rendering, menus and save/resume. Physics lives in physics.js.
 */
(function (SB) {
  'use strict';

  var CFG = SB.CONFIG, Audio = SB.Audio;
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var world = new SB.World();
  var outlineBuf = new Float32Array(1024);

  var FONT = "'Lilita One', 'Arial Rounded MT Bold', 'Trebuchet MS', system-ui, sans-serif";
  var MAX_PULL = 140;      // world px of drag for a full-power shot
  var MAX_SPEED = 1500;    // px/s at full power
  var DANGER_TIME = 3;     // seconds a blob may sit over the line
  var COOLDOWN = 0.45;

  /* ---------- palette (index = level, value = 2^level) ---------- */
  var PALETTE = ['#9be7ff', '#9be7ff', '#5fd3c6', '#ffd166', '#ff9f5a', '#ff6b81',
    '#c77dff', '#7b8cff', '#4ade80', '#ff5d5d', '#f472b6', '#fbbf24', '#22d3ee',
    '#a3e635', '#e879f9', '#f8fafc'];
  var INK = '#0b2239';

  function hexRgb(h) {
    var n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) {
    var x = hexRgb(a), y = hexRgb(b);
    return 'rgb(' + Math.round(x[0] + (y[0] - x[0]) * t) + ',' +
      Math.round(x[1] + (y[1] - x[1]) * t) + ',' + Math.round(x[2] + (y[2] - x[2]) * t) + ')';
  }
  var LV = [];
  for (var l = 0; l <= 24; l++) {
    var base = PALETTE[Math.min(l, PALETTE.length - 1)];
    LV[l] = { fill: base, light: mix(base, '#ffffff', 0.5), dark: mix(base, '#06233a', 0.5) };
  }
  function lv(level) { return LV[Math.min(level, LV.length - 1)]; }
  function label(v) { return v >= 1024 ? (v / 1024) + 'k' : String(v); }

  /* ---------- storage (may throw in private mode / sandboxes) ---------- */
  var store = {
    get: function (k, d) {
      try { var v = localStorage.getItem('soboscuba.' + k); return v == null ? d : JSON.parse(v); }
      catch (e) { return d; }
    },
    set: function (k, v) { try { localStorage.setItem('soboscuba.' + k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem('soboscuba.' + k); } catch (e) {} }
  };

  /* ---------- state ---------- */
  var S = {
    mode: 'title',          // title | play | paused | over
    score: 0,
    best: store.get('best', 0),
    biggest: 2,
    combo: 0, comboT: 0,
    cur: 2, next: 4,
    readyT: 0,
    dangerT: 0, warnT: 0,
    shake: 0,
    time: 0,
    saveT: 0,
    bumpT: 0,
    overT: 0,
    newBest: false
  };
  Audio.setMuted(store.get('muted', false));

  var fx = [];       // droplets and bubbles
  var popups = [];   // floating score text
  var ambient = [];  // background bubbles (screen space, 0..1)
  for (var a = 0; a < 26; a++) {
    ambient.push({ x: Math.random(), y: Math.random(), r: 1 + Math.random() * 3.5,
      s: 0.015 + Math.random() * 0.03, w: Math.random() * 6 });
  }

  function rollValue() {
    var r = Math.random() * 100;
    return r < 38 ? 2 : r < 68 ? 4 : r < 88 ? 8 : 16;
  }

  /* ---------- view / resize ---------- */
  var view = { scale: 1, ox: 0, oy: 0, dpr: 1, w: 0, h: 0 };
  var safeEl = document.getElementById('safe');
  var bgGrad = null;

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cs = getComputedStyle(safeEl);
    var il = parseFloat(cs.paddingLeft) || 0, ir = parseFloat(cs.paddingRight) || 0;
    var it = parseFloat(cs.paddingTop) || 0, ib = parseFloat(cs.paddingBottom) || 0;
    var aw = w - il - ir, ah = h - it - ib;
    var sc = Math.min(aw / CFG.W, ah / CFG.H);
    view.scale = sc; view.dpr = dpr; view.w = w; view.h = h;
    view.ox = il + (aw - CFG.W * sc) / 2;
    view.oy = it + (ah - CFG.H * sc) / 2;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bgGrad.addColorStop(0, '#11688a');
    bgGrad.addColorStop(0.45, '#0a3d5c');
    bgGrad.addColorStop(1, '#03111f');
    document.documentElement.style.setProperty('--tank-w', (CFG.W * sc) + 'px');
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { setTimeout(resize, 200); });

  function toWorld(e) {
    return { x: (e.clientX - view.ox) / view.scale, y: (e.clientY - view.oy) / view.scale };
  }

  /* ---------- game flow ---------- */
  function newGame() {
    world.clear();
    fx.length = 0; popups.length = 0;
    S.score = 0; S.biggest = 2; S.combo = 0; S.comboT = 0;
    S.cur = rollValue(); S.next = rollValue();
    S.readyT = 0.2; S.dangerT = 0; S.newBest = false; S.overT = 0;
    setMode('play');
    save();
  }

  function demoPile() {
    world.clear();
    var demo = [[128, 120, 640], [64, 290, 650], [32, 360, 560], [16, 210, 560],
      [8, 70, 520], [256, 230, 430], [4, 110, 430], [2, 160, 380], [8, 330, 420], [16, 60, 330]];
    demo.forEach(function (d) { world.add(new SB.Blob(d[0], d[1], d[2], 0, 0)); });
    S.cur = 8; S.next = 4; S.readyT = 0;
  }

  function spawnPoint(pull) {
    var R = SB.radiusFor(Math.log2(S.cur));
    var x = CFG.launchX - pull.x * 0.3, y = CFG.launchY - pull.y * 0.3;
    x = Math.max(CFG.wallL + R + 2, Math.min(CFG.wallR - R - 2, x));
    y = Math.max(CFG.ceil + R + 2, Math.min(CFG.dangerY - R - 2, y));
    return { x: x, y: y };
  }

  function launch(pull) {
    if (S.mode !== 'play' || S.readyT > 0) return;
    var len = Math.hypot(pull.x, pull.y);
    var p = spawnPoint(pull);
    var k = MAX_SPEED / MAX_PULL;
    var b = new SB.Blob(S.cur, p.x, p.y, pull.x * k, pull.y * k);
    world.add(b);
    if (len < 1) Audio.drop(); else Audio.launch(len / MAX_PULL);
    S.cur = S.next; S.next = rollValue();
    S.readyT = COOLDOWN;
  }

  function doMerges() {
    var c = world.contacts;
    if (!c.length) return;
    var used = {};
    for (var i = 0; i < c.length; i++) {
      var A = c[i][0], B = c[i][1];
      if (A.dead || B.dead || used[A.id] || used[B.id]) continue;
      used[A.id] = used[B.id] = true;
      merge(A, B);
    }
  }

  function merge(A, B) {
    var cx = (A.cx + B.cx) / 2, cy = (A.cy + B.cy) / 2;
    var vx = (A.vx + B.vx) / 2, vy = (A.vy + B.vy) / 2;
    world.remove(A); world.remove(B);
    var nb = new SB.Blob(A.value * 2, cx, cy, vx * 0.6, vy * 0.6, A.R);
    nb.parents = [{ x: A.cx, y: A.cy, r: A.curR }, { x: B.cx, y: B.cy, r: B.curR }];
    world.add(nb);

    var level = nb.level;
    S.combo = S.comboT > 0 ? S.combo + 1 : 1;
    S.comboT = 1.4;
    var gained = nb.value * S.combo;
    if (S.mode === 'play') {
      S.score += gained;
      if (nb.value > S.biggest) S.biggest = nb.value;
      if (S.score > S.best) { S.best = S.score; S.newBest = true; store.set('best', S.best); }
    }
    popups.push({ x: cx, y: cy - nb.R * 0.4, text: '+' + gained.toLocaleString(),
      sub: S.combo > 1 ? 'combo x' + S.combo : '', life: 1.1, max: 1.1,
      size: 18 + Math.min(level, 12) * 1.6, color: lv(level).light });
    burst(cx, cy, nb.R, level);
    Audio.merge(level, S.combo);
    if (level >= 7) S.shake = Math.min(14, (level - 6) * 2.4);
    if (navigator.vibrate) { try { navigator.vibrate(level >= 9 ? 30 : 10); } catch (e) {} }
  }

  function burst(x, y, R, level) {
    var col = lv(level).fill, n = 10 + level * 2;
    for (var i = 0; i < n; i++) {
      var ang = Math.random() * Math.PI * 2, sp = 120 + Math.random() * 260 + level * 12;
      fx.push({ t: 'drop', x: x + Math.cos(ang) * R * 0.7, y: y + Math.sin(ang) * R * 0.7,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 120, r: 2 + Math.random() * 3.5,
        life: 0.5 + Math.random() * 0.4, max: 0.9, c: col });
    }
    for (var j = 0; j < 4 + level; j++) {
      fx.push({ t: 'bub', x: x + (Math.random() - 0.5) * R * 1.4, y: y + (Math.random() - 0.5) * R,
        vx: 0, vy: -60 - Math.random() * 90, r: 2 + Math.random() * 5, w: Math.random() * 6,
        life: 1 + Math.random() * 0.8, max: 1.8 });
    }
  }

  function checkDanger(dt) {
    var over = false;
    for (var i = 0; i < world.blobs.length; i++) {
      var b = world.blobs[i];
      if (b.age > 1.5 && b.growT >= 1 && b.cy - b.R < CFG.dangerY) { over = true; break; }
    }
    if (over) {
      S.dangerT += dt;
      S.warnT -= dt;
      if (S.warnT <= 0) { Audio.warn(); S.warnT = Math.max(0.18, 0.6 - S.dangerT * 0.15); }
      if (S.dangerT >= DANGER_TIME) gameOver();
    } else {
      S.dangerT = Math.max(0, S.dangerT - dt * 2);
      S.warnT = 0;
    }
  }

  function gameOver() {
    setMode('over');
    S.overT = 0;
    Audio.over();
    store.del('session');
    document.getElementById('over-score').textContent = S.score.toLocaleString();
    document.getElementById('over-best').textContent = S.best.toLocaleString();
    document.getElementById('over-biggest').textContent = label(S.biggest);
    document.getElementById('over-newbest').hidden = !S.newBest || S.score === 0;
  }

  /* ---------- save / resume ---------- */
  function save() {
    if (S.mode !== 'play' && S.mode !== 'paused') return;
    store.set('session', {
      v: 1, score: S.score, biggest: S.biggest, cur: S.cur, next: S.next,
      blobs: world.blobs.map(function (b) {
        return [b.value, Math.round(b.cx * 10) / 10, Math.round(b.cy * 10) / 10];
      })
    });
  }
  function resume() {
    var s = store.get('session', null);
    if (!s || s.v !== 1) return false;
    world.clear();
    fx.length = 0; popups.length = 0;
    s.blobs.forEach(function (d) {
      var b = world.add(new SB.Blob(d[0], d[1], d[2], 0, 0));
      b.age = 2;
    });
    S.score = s.score; S.biggest = s.biggest; S.cur = s.cur; S.next = s.next;
    S.combo = 0; S.comboT = 0; S.readyT = 0.3; S.dangerT = 0; S.newBest = false;
    setMode('play');
    return true;
  }

  /* ---------- menus ---------- */
  var overlays = {
    title: document.getElementById('title'),
    paused: document.getElementById('pause'),
    over: document.getElementById('over')
  };
  function setMode(m) {
    S.mode = m;
    overlays.title.hidden = m !== 'title';
    overlays.paused.hidden = m !== 'paused';
    overlays.over.hidden = true; // shown after a short delay in update()
    if (m === 'title') {
      document.getElementById('btn-continue').hidden = !store.get('session', null);
      document.getElementById('title-best').textContent = S.best.toLocaleString();
    }
    drag = null;
  }
  function pause() {
    if (S.mode !== 'play') return;
    setMode('paused');
    save();
  }

  function bind(id, fn) {
    document.getElementById(id).addEventListener('click', function () {
      Audio.unlock(); Audio.click(); fn();
    });
  }
  function syncSound() {
    document.getElementById('btn-sound').textContent = Audio.isMuted() ? 'Sound: off' : 'Sound: on';
  }
  bind('btn-play', newGame);
  bind('btn-continue', function () { if (!resume()) newGame(); });
  bind('btn-resume', function () { setMode('play'); });
  bind('btn-restart', newGame);
  bind('btn-home', function () { save(); setMode('title'); });
  bind('btn-again', newGame);
  bind('btn-over-home', function () { demoPile(); setMode('title'); });
  bind('btn-sound', function () {
    Audio.setMuted(!Audio.isMuted());
    store.set('muted', Audio.isMuted());
    syncSound();
  });
  syncSound();

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) pause();
  });
  window.addEventListener('pagehide', save);

  /* ---------- input ---------- */
  var drag = null;
  var PAUSE_BTN = { x: 38, y: 40, r: 22 };

  canvas.addEventListener('pointerdown', function (e) {
    Audio.unlock();
    if (S.mode !== 'play') return;
    var p = toWorld(e);
    if (Math.hypot(p.x - PAUSE_BTN.x, p.y - PAUSE_BTN.y) < PAUSE_BTN.r + 8) {
      Audio.click(); pause(); return;
    }
    if (drag) return;
    drag = { id: e.pointerId, sx: p.x, sy: p.y, x: p.x, y: p.y, t: performance.now() };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var p = toWorld(e);
    drag.x = p.x; drag.y = p.y;
  });
  function endDrag(e, cancelled) {
    if (!drag || e.pointerId !== drag.id) return;
    var pull = currentPull();
    var len = Math.hypot(pull.x, pull.y);
    var quick = performance.now() - drag.t < 260;
    drag = null;
    if (cancelled || S.mode !== 'play') return;
    if (len < 10) {
      if (quick) launch({ x: 0, y: 0 });   // tap = gentle drop
      return;                              // dragged back to start = cancel
    }
    launch(pull);
  }
  canvas.addEventListener('pointerup', function (e) { endDrag(e, false); });
  canvas.addEventListener('pointercancel', function (e) { endDrag(e, true); });

  function currentPull() {
    if (!drag) return { x: 0, y: 0 };
    var x = drag.sx - drag.x, y = drag.sy - drag.y;
    var len = Math.hypot(x, y);
    if (len > MAX_PULL) { x *= MAX_PULL / len; y *= MAX_PULL / len; }
    return { x: x, y: y };
  }

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      if (S.mode === 'play') pause();
      else if (S.mode === 'paused') setMode('play');
      return;
    }
    if (S.mode === 'play' && (e.key === ' ' || e.key === 'ArrowDown' || e.key === 'Enter')) {
      Audio.unlock();
      launch({ x: 0, y: 0 });
      e.preventDefault();
    }
  });

  /* ---------- update ---------- */
  function update(dt) {
    S.time += dt;
    if (S.mode === 'paused') return;

    world.step();
    if (S.mode === 'play') {
      doMerges();
      checkDanger(dt);
      if (S.readyT > 0) S.readyT -= dt;
      if (S.comboT > 0) S.comboT -= dt;
      S.saveT += dt;
      if (S.saveT > 4) { S.saveT = 0; save(); }
      S.bumpT -= dt;
      if (world.impact > 1.3 && S.bumpT <= 0) { Audio.bump(world.impact); S.bumpT = 0.09; }
    } else if (S.mode === 'over') {
      S.overT += dt;
      if (S.overT > 0.9 && overlays.over.hidden) overlays.over.hidden = false;
      doMerges();
    }

    for (var i = fx.length - 1; i >= 0; i--) {
      var f = fx[i];
      f.life -= dt;
      if (f.life <= 0) { fx.splice(i, 1); continue; }
      if (f.t === 'drop') { f.vy += 900 * dt; f.vx *= 0.98; }
      else { f.w += dt * 5; f.vx = Math.sin(f.w) * 20; }
      f.x += f.vx * dt; f.y += f.vy * dt;
    }
    for (var j = popups.length - 1; j >= 0; j--) {
      popups[j].life -= dt;
      popups[j].y -= 40 * dt;
      if (popups[j].life <= 0) popups.splice(j, 1);
    }
    for (var k = 0; k < ambient.length; k++) {
      var b = ambient[k];
      b.y -= b.s * dt;
      b.w += dt;
      if (b.y < -0.05) { b.y = 1.05; b.x = Math.random(); }
    }
    S.shake *= 0.86;
  }

  /* ---------- rendering ---------- */
  function render() {
    var dpr = view.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawBackground();

    var sx = 0, sy = 0;
    if (S.shake > 0.3) { sx = (Math.random() - 0.5) * S.shake; sy = (Math.random() - 0.5) * S.shake; }
    var s = view.scale * dpr;
    ctx.setTransform(s, 0, 0, s, (view.ox + sx) * dpr, (view.oy + sy) * dpr);

    drawTank();
    drawDangerLine();
    for (var i = 0; i < world.blobs.length; i++) drawBlob(world.blobs[i]);
    drawFx();
    if (S.mode === 'play' || S.mode === 'paused') drawLauncher();
    drawPopups();
    drawHud();
  }

  function drawBackground() {
    var w = canvas.width, h = canvas.height;
    ctx.fillStyle = bgGrad || '#0a3d5c';
    ctx.fillRect(0, 0, w, h);
    // Light shafts from the surface.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 4; i++) {
      var x = w * (0.15 + i * 0.25) + Math.sin(S.time * 0.3 + i * 1.7) * w * 0.05;
      var spread = w * (0.06 + 0.03 * Math.sin(S.time * 0.5 + i));
      var g = ctx.createLinearGradient(0, 0, 0, h * 0.85);
      g.addColorStop(0, 'rgba(160,230,255,0.10)');
      g.addColorStop(1, 'rgba(160,230,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - spread * 0.3, 0);
      ctx.lineTo(x + spread * 0.3, 0);
      ctx.lineTo(x + spread * 2.2 + w * 0.08, h * 0.85);
      ctx.lineTo(x - spread * 0.4 + w * 0.08, h * 0.85);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(220,245,255,0.22)';
    ctx.lineWidth = 1.2 * view.dpr;
    for (var k = 0; k < ambient.length; k++) {
      var b = ambient[k];
      ctx.beginPath();
      ctx.arc((b.x + Math.sin(b.w) * 0.01) * w, b.y * h, b.r * view.dpr, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawTank() {
    var L = CFG.wallL, R = CFG.wallR, F = CFG.floor;
    // Water inside the tank, a touch brighter than the sea behind it.
    var g = ctx.createLinearGradient(0, 0, 0, F);
    g.addColorStop(0, 'rgba(120,210,240,0.06)');
    g.addColorStop(1, 'rgba(120,210,240,0.12)');
    ctx.fillStyle = g;
    ctx.fillRect(L, CFG.ceil, R - L, F - CFG.ceil);

    // Sand floor.
    var sg = ctx.createLinearGradient(0, F, 0, CFG.H);
    sg.addColorStop(0, '#e9cf96');
    sg.addColorStop(1, '#b98f58');
    ctx.fillStyle = sg;
    roundRect(L - 10, F, R - L + 20, CFG.H - F + 4, 8);
    ctx.fill();
    ctx.fillStyle = 'rgba(120,80,40,0.25)';
    for (var i = 0; i < 18; i++) {
      var px = L + ((i * 97) % (R - L)), py = F + 5 + ((i * 37) % 16);
      ctx.beginPath(); ctx.arc(px, py, 1.4 + (i % 3) * 0.6, 0, Math.PI * 2); ctx.fill();
    }

    // Glass walls.
    ctx.fillStyle = 'rgba(200,240,255,0.16)';
    roundRect(L - 10, CFG.ceil + 40, 10, F - CFG.ceil - 36, 5); ctx.fill();
    roundRect(R, CFG.ceil + 40, 10, F - CFG.ceil - 36, 5); ctx.fill();
    ctx.strokeStyle = 'rgba(230,250,255,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(L, CFG.ceil + 44); ctx.lineTo(L, F);
    ctx.moveTo(R, CFG.ceil + 44); ctx.lineTo(R, F);
    ctx.stroke();
  }

  function drawDangerLine() {
    var y = CFG.dangerY, t = S.dangerT / DANGER_TIME;
    var alarm = t > 0 ? 0.5 + 0.5 * Math.sin(S.time * (10 + t * 14)) : 0;
    if (t > 0) {
      ctx.fillStyle = 'rgba(255,90,90,' + (0.06 + alarm * 0.12 * (0.4 + t)) + ')';
      ctx.fillRect(CFG.wallL, CFG.ceil, CFG.wallR - CFG.wallL, y - CFG.ceil);
    }
    ctx.save();
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -S.time * 20;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = t > 0 ? 'rgba(255,110,110,' + (0.6 + alarm * 0.4) + ')' : 'rgba(230,250,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(CFG.wallL + 4, y); ctx.lineTo(CFG.wallR - 4, y);
    ctx.stroke();
    ctx.restore();
    if (t > 0) {
      // Countdown ring at the right end of the line.
      var cx = CFG.wallR - 26, cy = y - 22;
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.arc(cx, cy, 13, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#ff6e6e';
      ctx.beginPath(); ctx.arc(cx, cy, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - t)); ctx.stroke();
    }
  }

  function smoothPath(pts, n) {
    ctx.beginPath();
    var lx = pts[(n - 1) * 2], ly = pts[(n - 1) * 2 + 1];
    ctx.moveTo((lx + pts[0]) / 2, (ly + pts[1]) / 2);
    for (var i = 0; i < n; i++) {
      var x = pts[i * 2], y = pts[i * 2 + 1];
      var j = (i + 1) % n;
      ctx.quadraticCurveTo(x, y, (x + pts[j * 2]) / 2, (y + pts[j * 2 + 1]) / 2);
    }
    ctx.closePath();
  }

  function blobPaint(level, cx, cy, R) {
    var c = lv(level);
    var g = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.45, R * 0.1, cx, cy, R * 1.15);
    g.addColorStop(0, c.light);
    g.addColorStop(0.55, c.fill);
    g.addColorStop(1, c.dark);
    return g;
  }

  function drawBlob(b) {
    var pts = world.outline(b, outlineBuf);
    var R = b.curR;
    smoothPath(pts, b.n);
    ctx.fillStyle = blobPaint(b.level, b.cx, b.cy, R);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = lv(b.level).dark;
    ctx.stroke();
    drawGlossAndFace(b.cx, b.cy, R, b.value, b.level, b.squish, b);
  }

  function drawGlossAndFace(cx, cy, R, value, level, squish, b) {
    // Gloss highlight.
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(cx - R * 0.38, cy - R * 0.5, R * 0.2, R * 0.11, -0.6, 0, Math.PI * 2);
    ctx.fill();

    var hasFace = R >= 20;
    var numY = hasFace ? cy + R * 0.2 : cy;
    if (hasFace) {
      var ey = cy - R * 0.22, ex = R * 0.26, er = Math.max(2, R * 0.075);
      ctx.fillStyle = INK;
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(1.6, R * 0.04);
      ctx.lineCap = 'round';
      var blinking = b && ((S.time + b.blink) % 4.2) < 0.12;
      if (squish > 0.55) {
        // Squeezed: > <
        for (var s = -1; s <= 1; s += 2) {
          ctx.beginPath();
          ctx.moveTo(cx + s * ex - er, ey - er);
          ctx.lineTo(cx + s * ex + s * er * -0.2, ey);
          ctx.lineTo(cx + s * ex - er, ey + er);
          ctx.stroke();
        }
      } else if (blinking) {
        ctx.beginPath();
        ctx.moveTo(cx - ex - er, ey); ctx.lineTo(cx - ex + er, ey);
        ctx.moveTo(cx + ex - er, ey); ctx.lineTo(cx + ex + er, ey);
        ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(cx - ex, ey, er, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + ex, ey, er, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath(); ctx.arc(cx - ex + er * 0.35, ey - er * 0.35, er * 0.35, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + ex + er * 0.35, ey - er * 0.35, er * 0.35, 0, Math.PI * 2); ctx.fill();
      }
    }
    var txt = label(value);
    var fs = hasFace ? Math.min(54, R * (txt.length > 3 ? 0.5 : 0.62)) : R * (txt.length > 1 ? 0.85 : 1.05);
    ctx.font = fs + 'px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = INK;
    ctx.globalAlpha = 0.88;
    ctx.fillText(txt, cx, numY + fs * 0.05);
    ctx.globalAlpha = 1;
  }

  function drawStaticBlob(value, cx, cy, R, stretchX, stretchY, ang) {
    var level = Math.round(Math.log2(value));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang || 0);
    ctx.scale(stretchX || 1, stretchY || 1);
    ctx.rotate(-(ang || 0));
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fillStyle = blobPaint(level, 0, 0, R);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = lv(level).dark;
    ctx.stroke();
    drawGlossAndFace(0, 0, R, value, level, 0, null);
    ctx.restore();
  }

  function drawLauncher() {
    var pull = currentPull();
    var len = Math.hypot(pull.x, pull.y);
    var R = SB.radiusFor(Math.log2(S.cur));
    var p = spawnPoint(pull);
    var ax = CFG.launchX - 50, bx = CFG.launchX + 50, ay = CFG.launchY - 4;

    // Launcher posts.
    ctx.fillStyle = 'rgba(230,250,255,0.5)';
    ctx.beginPath(); ctx.arc(ax, ay, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(bx, ay, 5, 0, Math.PI * 2); ctx.fill();

    var ready = S.readyT <= 0;
    // Back band.
    ctx.strokeStyle = 'rgba(255,170,140,0.85)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    if (ready && len > 1) {
      var nx = pull.x / len, ny = pull.y / len;
      var backX = p.x - nx * R * 0.9, backY = p.y - ny * R * 0.9;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(backX, backY); ctx.lineTo(bx, ay); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, ay); ctx.stroke();
    }

    if (ready) {
      if (len > 10) drawTrajectory(p, pull, R);
      var pop = Math.min(1, -S.readyT / 0.15 + 1);
      var wob = 1 + Math.sin(S.time * 5) * 0.025;
      var st = len / MAX_PULL;
      var ang = Math.atan2(pull.y, pull.x);
      drawStaticBlob(S.cur, p.x, p.y, R * wob * pop, 1 + st * 0.18, 1 - st * 0.12, ang);
    } else {
      ctx.strokeStyle = 'rgba(230,250,255,0.25)';
      ctx.setLineDash([4, 5]);
      ctx.beginPath(); ctx.arc(CFG.launchX, CFG.launchY, R, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawTrajectory(p, pull, R) {
    var k = MAX_SPEED / MAX_PULL;
    var vx = pull.x * k, vy = pull.y * k, x = p.x, y = p.y;
    var dt = 1 / 60;
    ctx.fillStyle = '#e9fbff';
    for (var i = 1; i <= 40; i++) {
      vy += CFG.gravity * dt;
      x += vx * dt; y += vy * dt;
      if (x < CFG.wallL + R || x > CFG.wallR - R || y > CFG.floor - R) break;
      if (i % 3) continue;
      ctx.globalAlpha = Math.max(0, 0.75 - i / 50);
      ctx.beginPath(); ctx.arc(x, y, 3.2 - i * 0.04, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawFx() {
    for (var i = 0; i < fx.length; i++) {
      var f = fx[i], a = Math.min(1, f.life / (f.max * 0.5));
      ctx.globalAlpha = a;
      if (f.t === 'drop') {
        ctx.fillStyle = f.c;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(235,250,255,0.85)';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawPopups() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < popups.length; i++) {
      var p = popups[i], a = Math.min(1, p.life / 0.4);
      var sc = 1 + Math.max(0, (p.life - p.max + 0.15)) * 3;
      ctx.globalAlpha = a;
      ctx.font = (p.size * sc) + 'px ' + FONT;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(4,24,42,0.75)';
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
      if (p.sub) {
        ctx.font = '15px ' + FONT;
        ctx.strokeText(p.sub, p.x, p.y + p.size * 0.8);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(p.sub, p.x, p.y + p.size * 0.8);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawHud() {
    if (S.mode === 'title') return;
    // Pause button.
    ctx.fillStyle = 'rgba(4,24,42,0.45)';
    ctx.beginPath(); ctx.arc(PAUSE_BTN.x, PAUSE_BTN.y, PAUSE_BTN.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(230,250,255,0.4)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#e9fbff';
    ctx.fillRect(PAUSE_BTN.x - 7, PAUSE_BTN.y - 8, 5, 16);
    ctx.fillRect(PAUSE_BTN.x + 2, PAUSE_BTN.y - 8, 5, 16);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#8fd3e8';
    ctx.font = '13px ' + FONT;
    ctx.fillText('SCORE', 20, 88);
    ctx.fillStyle = '#e9fbff';
    ctx.font = '34px ' + FONT;
    ctx.fillText(S.score.toLocaleString(), 19, 122);
    ctx.fillStyle = '#8fd3e8';
    ctx.font = '13px ' + FONT;
    ctx.fillText('BEST  ' + S.best.toLocaleString(), 20, 146);

    ctx.textAlign = 'right';
    ctx.fillText('NEXT', CFG.W - 20, 30);
    var nR = SB.radiusFor(Math.log2(S.next)) * 0.8;
    drawStaticBlob(S.next, CFG.W - 20 - 28, 80, nR, 1, 1, 0);
  }

  /* ---------- main loop ---------- */
  var last = 0, acc = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    var t = ts / 1000;
    if (!last) last = t;
    var el = Math.min(0.1, t - last);
    last = t;
    acc += el;
    var steps = 0;
    while (acc >= CFG.dt && steps < 4) { update(CFG.dt); acc -= CFG.dt; steps++; }
    if (steps >= 4) acc = 0;
    render();
  }

  resize();
  demoPile();
  setMode('title');
  requestAnimationFrame(frame);

  if (document.fonts && document.fonts.load) {
    document.fonts.load('20px "Lilita One"').catch(function () {});
  }

  // Hooks for automated tests.
  SB.game = { S: S, world: world, newGame: newGame, launch: launch, resume: resume, save: save,
    update: update, render: render };
})(window.SB = window.SB || {});
