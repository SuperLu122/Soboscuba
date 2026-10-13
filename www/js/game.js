/*
 * Soboscuba game layer: slingshot input, merging, scoring, pressure pads,
 * rendering, menus and save/resume. Physics lives in physics.js.
 */
(function (SB) {
  'use strict';

  var CFG = SB.CONFIG, Audio = SB.Audio;
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var world = new SB.World();
  var outlineBuf = new Float32Array(1024);

  var FONT = "'Audiowide', 'Arial Black', 'Trebuchet MS', system-ui, sans-serif";
  var MAX_PULL = 140;      // world px of drag for a full-power shot
  var MAX_SPEED = 1500;    // px/s at full power
  var DANGER_TIME = 3;     // seconds of pressing at the limit that fill a pad's meter
  var PAD_LIMIT = 0.5;     // smoothed pad pressure that counts as pressing too hard
  var PAD_DRAIN = 0.2;     // meter drained per second while a pad is left alone
  var QUEUE = 3;           // sobos waiting in line beside the launcher
  var COOLDOWN = 0.45;
  var DEAD_ZONE = 5;       // world px of drag treated as a tap

  /* ---------- colour themes ----------
   * Each theme colours the whole game: the sobos (colors[level], value =
   * 2^level, level 0 is a 1), the tank and its pads, the HUD and the menus. */
  var STYLES = {
    dark: { name: 'Dark',
      colors: ['#9b2f3c', '#a8622a', '#8f7a1e', '#3f7d3a', '#1f716b', '#27548f', '#4d3c93', '#7b3079',
        '#9b3557', '#5a5d6b', '#b5852b', '#2c8a76', '#3b67b5', '#a33c3c', '#6b4fa8', '#c9c9d1'],
      ui: { bg: '#0d0d0f', tank: '#040405', frame: '#1f1f24', slot: '#08080a', pin: '#55555e',
        track: '#141417', meter: '#6e6e78', padOuter: '#26262c', padInner: '#3f3f47', hot: '#c43c3c',
        hud: '#55555e', hudDim: '#35353c', side: '#1c1c21', dot: '#d8d8de', dotDim: '#3a3a42',
        accent: '#d8d8de', ink: '#0d0d0f', inkLight: '#ececf0', card: '#16161a', button: '#b5852b' } },
    neon: { name: 'Neon',
      colors: ['#ff2e2e', '#ffe62e', '#5cff2e', '#2effbf', '#2e8bff', '#9b30ff', '#ff34b4', '#ff7433',
        '#d9ff33', '#f2f2f2', '#33ffff', '#ffc233', '#7a5cff', '#ff5c33', '#33ff88', '#ff33ff'],
      ui: { bg: '#1b1b1b', tank: '#000000', frame: '#333333', slot: '#151515', pin: '#7a7a7a',
        track: '#1c1c1c', meter: '#8c8c8c', padOuter: '#3c3c3c', padInner: '#686868', hot: '#ff3b3b',
        hud: '#6e6e6e', hudDim: '#4a4a4a', side: '#333333', dot: '#ffffff', dotDim: '#5a5a5a',
        accent: '#ffffff', ink: '#111111', inkLight: '#f2f2f2', card: '#262626', button: '#33ffff' } },
    sunset: { name: 'Sunset',
      colors: ['#ffe066', '#ffc145', '#ff9f43', '#ff7a5c', '#f2547d', '#d6449f', '#a94bc2', '#7b5bd9',
        '#5170e6', '#3d93e8', '#2fb8d8', '#2fd6b0', '#7ee08a', '#c6ec6a', '#fff3b0', '#ffffff'],
      ui: { bg: '#24142a', tank: '#130a17', frame: '#3d2541', slot: '#120914', pin: '#a07aa0',
        track: '#1a0e1d', meter: '#c9a3c4', padOuter: '#4e3352', padInner: '#7d5a80', hot: '#ff4d6d',
        hud: '#9a7c9c', hudDim: '#634a66', side: '#3a2540', dot: '#ffe9d6', dotDim: '#6b4f6e',
        accent: '#ffe9d6', ink: '#1d0f20', inkLight: '#fff4ea', card: '#2e1b34', button: '#ffb84d' } },
    candy: { name: 'Candy',
      colors: ['#ff8fab', '#ffb38a', '#ffd970', '#c8f07a', '#7de8b0', '#6fd8f0', '#8fb0ff', '#b79cff',
        '#e59cff', '#ff9ce0', '#fff1a8', '#a8fff0', '#ffc4c4', '#d4ffa8', '#ffffff', '#ffffff'],
      ui: { bg: '#191733', tank: '#0f0d24', frame: '#2f2b58', slot: '#0d0b1f', pin: '#8f88d6',
        track: '#141130', meter: '#b8b2ff', padOuter: '#3d3873', padInner: '#6a63b3', hot: '#ff5c8a',
        hud: '#8f88d6', hudDim: '#57519a', side: '#2c2855', dot: '#ffffff', dotDim: '#5a548f',
        accent: '#ffffff', ink: '#221d45', inkLight: '#ffffff', card: '#221f45', button: '#ff8fb8' } },
    paper: { name: 'Paper',
      colors: ['#e76f51', '#f4a261', '#e9c46a', '#8ab17d', '#2a9d8f', '#457b9d', '#6d6a9c', '#b56576',
        '#e56b6f', '#6d597a', '#264653', '#bc6c25', '#606c38', '#9d0208', '#3d3428', '#3d3428'],
      ui: { bg: '#efe5d5', tank: '#fbf7f0', frame: '#cbb89c', slot: '#a8957a', pin: '#efe5d5',
        track: '#ddd0bb', meter: '#8c7b63', padOuter: '#bba98e', padInner: '#d9cab2', hot: '#d1495b',
        hud: '#8c7b63', hudDim: '#b3a189', side: '#ddd0bb', dot: '#3d3428', dotDim: '#c2b197',
        accent: '#3d3428', ink: '#2b241b', inkLight: '#fbf7f0', card: '#3d3428', button: '#e76f51' } },
    ocean: { name: 'Ocean',
      colors: ['#ffd166', '#ff9f5a', '#ff6b81', '#f472b6', '#c77dff', '#7b8cff', '#4cc9f0', '#5fd3c6',
        '#4ade80', '#a3e635', '#fbbf24', '#ff5d5d', '#e879f9', '#22d3ee', '#f8fafc', '#ffffff'],
      ui: { bg: '#08263a', tank: '#041a2a', frame: '#164260', slot: '#03131f', pin: '#7fb8d6',
        track: '#062033', meter: '#9fd8f0', padOuter: '#1f5577', padInner: '#3f86ad', hot: '#ff5d5d',
        hud: '#6aa3c3', hudDim: '#2f6283', side: '#123a55', dot: '#e9fbff', dotDim: '#2f6283',
        accent: '#e9fbff', ink: '#06233a', inkLight: '#e9fbff', card: '#0c3047', button: '#ff9f5a' } }
  };
  var STYLE_ORDER = ['dark', 'neon', 'sunset', 'candy', 'paper', 'ocean'];
  var DEFAULT_STYLE = 'dark';
  STYLES.neon.unlock = 's10k'; STYLES.sunset.unlock = 'v512'; STYLES.candy.unlock = 'combo5'; STYLES.paper.unlock = 's25k'; STYLES.ocean.unlock = 'v2048';

  function hexRgb(h) {
    var n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) {
    var x = hexRgb(a), y = hexRgb(b), out = '#';
    for (var i = 0; i < 3; i++) out += (256 + Math.round(x[i] + (y[i] - x[i]) * t)).toString(16).slice(1);
    return out;
  }
  function luma(h) { var c = hexRgb(h); return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; }
  var LV = [], UI = STYLES[DEFAULT_STYLE].ui;
  function applyStyle(id) {
    var st = STYLES[id] || STYLES[DEFAULT_STYLE];
    UI = st.ui;
    for (var l = 0; l <= 24; l++) {
      var base = st.colors[Math.min(l, st.colors.length - 1)];
      var darkFill = luma(base) < 0.42;
      // Sobos fresh from the launcher wear a deep shade of their own colour
      // on their number; sobos made by a merge wear the theme's ink.
      LV[l] = { fill: base, light: mix(base, '#ffffff', 0.35),
        dark: darkFill ? mix(base, '#ffffff', 0.6) : mix(base, '#000000', 0.55),
        ink: darkFill ? UI.inkLight : UI.ink };
    }
    // Menus follow the theme too.
    var root = document.documentElement.style;
    root.setProperty('--sea', UI.bg);
    root.setProperty('--glass', UI.card);
    root.setProperty('--card-edge', UI.frame);
    root.setProperty('--coral', UI.button);
    root.setProperty('--coral-deep', mix(UI.button, '#000000', 0.35));
    root.setProperty('--hot', UI.hot);
    var logo = document.querySelectorAll('#logo span');
    for (var k = 0; k < logo.length; k++) logo[k].style.setProperty('--c', st.colors[[0, 1, 2, 3, 4, 5, 6, 7, 10][k] || 0]);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', UI.bg);
  }
  function lv(level) { return LV[Math.min(level, LV.length - 1)]; }
  function label(v) { return v >= 16384 ? (v / 1024) + 'k' : String(v); }

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
    biggest: 1,
    combo: 0, comboT: 0,
    cur: 1, next: 2,
    queue: [2, 4, 1],       // waiting in line; queue[0] is next
    readyT: 0,
    dangerT: 0, warnT: 0,
    pad: [0, 0],            // smoothed pressure on the left and right pads
    meter: [0, 0],          // each pad's danger meter (the bars on the lid); full = game over
    shake: 0,
    time: 0,
    saveT: 0,
    bumpT: 0,
    overT: 0,
    newBest: false,
    dangerPeak: 0,
    tutorial: false,
    style: store.get('style', DEFAULT_STYLE)
  };
  Audio.setMuted(store.get('muted', false));
  var hapticsOn = store.get('haptics', true);

  /* ---------- achievements ---------- */
  var ACHIEVEMENTS = [
    { id: 'merge', name: 'First squish', desc: 'Merge two sobos.' },
    { id: 'v128', name: 'Getting chunky', desc: 'Make a 128.' },
    { id: 'v512', name: 'Big wobbler', desc: 'Make a 512.' },
    { id: 'v2048', name: 'Tank boss', desc: 'Make a 2k.' },
    { id: 'v8192', name: 'Leviathan', desc: 'Make an 8k.' },
    { id: 'combo3', name: 'Chain reaction', desc: 'Get a combo of x3.' },
    { id: 'combo5', name: 'Cascade', desc: 'Get a combo of x5.' },
    { id: 'bullseye', name: 'Bullseye', desc: 'Merge a sobo with the first sobo it touches.' },
    { id: 'bank', name: 'Bank shot', desc: 'Bounce a sobo off a wall straight into a merge.' },
    { id: 'close', name: 'Close call', desc: 'Ease off a pressure pad when its bar is nearly full.' },
    { id: 's10k', name: 'Five figures', desc: 'Score 10,000 in one game.' },
    { id: 's25k', name: 'Deep diver', desc: 'Score 25,000 in one game.' },
    { id: 's100k', name: 'Abyssal', desc: 'Score 100,000 in one game.' }
  ];
  var awards = store.get('awards', {});
  var toastQueue = [], toastBusy = false;
  function styleUnlocked(id) { var u = STYLES[id].unlock; return !u || !!awards[u]; }
  if (!STYLES[S.style] || !styleUnlocked(S.style)) S.style = DEFAULT_STYLE;
  applyStyle(S.style);

  function unlock(id) {
    if (awards[id] || S.mode !== 'play') return;
    awards[id] = Date.now();
    store.set('awards', awards);
    var a = ACHIEVEMENTS.filter(function (x) { return x.id === id; })[0];
    var styleName = null;
    STYLE_ORDER.forEach(function (k) { if (STYLES[k].unlock === id) styleName = STYLES[k].name; });
    toastQueue.push({ name: a.name, desc: a.desc, extra: styleName ? 'New colour theme: ' + styleName : '' });
    showToast();
  }
  function showToast() {
    if (toastBusy || !toastQueue.length) return;
    toastBusy = true;
    var t = toastQueue.shift(), el = document.getElementById('toast');
    document.getElementById('toast-name').textContent = t.name;
    document.getElementById('toast-desc').textContent = t.desc;
    var ex = document.getElementById('toast-extra');
    ex.textContent = t.extra; ex.hidden = !t.extra;
    el.hidden = false;
    el.classList.remove('toast--out');
    Audio.award();
    setTimeout(function () { el.classList.add('toast--out'); }, 2600);
    setTimeout(function () { el.hidden = true; toastBusy = false; showToast(); }, 3000);
  }

  function haptic(strength) {
    if (!hapticsOn) return;
    try {
      var H = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
      if (H) H.impact({ style: strength > 2 ? 'HEAVY' : strength > 1 ? 'MEDIUM' : 'LIGHT' });
      else if (navigator.vibrate) navigator.vibrate(strength > 2 ? 30 : strength > 1 ? 18 : 8);
    } catch (e) {}
  }

  var fx = [];       // splash droplets
  var popups = [];   // floating score text

  function rollValue() {
    var r = Math.random() * 100;
    return r < 34 ? 1 : r < 64 ? 2 : r < 86 ? 4 : 8;
  }
  function fillQueue() {
    S.queue = [];
    for (var i = 0; i < QUEUE; i++) S.queue.push(rollValue());
    S.next = S.queue[0];
  }

  /* ---------- view / resize ---------- */
  var view = { scale: 1, ox: 0, oy: 0, dpr: 1, w: 0, h: 0 };
  var safeEl = document.getElementById('safe');

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
    document.documentElement.style.setProperty('--tank-w', (CFG.W * sc) + 'px');
    // Toasts sit inside the tank just under the launcher.
    document.documentElement.style.setProperty('--toast-top', (view.oy + (CFG.dangerY + 50) * sc) + 'px');
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
    S.score = 0; S.biggest = 1; S.combo = 0; S.comboT = 0;
    S.cur = rollValue(); fillQueue();
    S.readyT = 0.2; S.dangerT = 0; S.dangerPeak = 0; S.pad = [0, 0]; S.meter = [0, 0];
    S.newBest = false; S.overT = 0;
    S.tutorial = !store.get('tutorialDone', false);
    setMode('play');
    save();
  }

  function demoPile() {
    world.clear();
    var demo = [[128, 110, 530], [1024, 270, 520], [8, 360, 560], [64, 70, 430],
      [256, 170, 420], [32, 250, 400], [256, 340, 420], [4, 60, 560], [64, 290, 330], [128, 200, 300]];
    demo.forEach(function (d) { var b = world.add(new SB.Blob(d[0], d[1], d[2], 0, 0)); b.made = d[0] > 64; });
    S.cur = 32; S.queue = [2, 1, 4]; S.next = 2; S.readyT = 0; S.meter = [0, 0]; S.pad = [0, 0];
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
    b.track = true;
    world.add(b);
    if (S.tutorial) { S.tutorial = false; store.set('tutorialDone', true); }
    if (len < 1) Audio.drop(); else Audio.launch(len / MAX_PULL);
    S.cur = S.queue.shift(); S.queue.push(rollValue()); S.next = S.queue[0];
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
    nb.made = true;
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
      checkMergeAwards(A, B, nb);
    }
    popups.push({ x: cx, y: cy - nb.R * 0.4, text: '+' + gained.toLocaleString(),
      sub: S.combo > 1 ? 'combo x' + S.combo : '', life: 1.1, max: 1.1,
      size: 14 + Math.min(level, 12) * 1.3, color: lv(level).light });
    burst(cx, cy, nb.R, level);
    Audio.merge(level, S.combo);
    if (level >= 7) S.shake = Math.min(14, (level - 6) * 2.4);
    haptic(level >= 10 ? 3 : level >= 7 ? 2 : 1);
  }

  function checkMergeAwards(A, B, nb) {
    unlock('merge');
    if (nb.value >= 128) unlock('v128');
    if (nb.value >= 512) unlock('v512');
    if (nb.value >= 2048) unlock('v2048');
    if (nb.value >= 8192) unlock('v8192');
    if (S.combo >= 3) unlock('combo3');
    if (S.combo >= 5) unlock('combo5');
    if (S.score >= 10000) unlock('s10k');
    if (S.score >= 25000) unlock('s25k');
    if (S.score >= 100000) unlock('s100k');
    // A freshly launched blob whose only contact so far is its partner.
    [[A, B], [B, A]].forEach(function (pair) {
      var L = pair[0], P = pair[1];
      if (!L.track || L.floorHit) return;
      for (var id in L.met) if (+id !== P.id) return;
      unlock(L.sideHit ? 'bank' : 'bullseye');
    });
  }

  function burst(x, y, R, level) {
    var col = lv(level).fill, n = 10 + level * 2;
    for (var i = 0; i < n; i++) {
      var ang = Math.random() * Math.PI * 2, sp = 120 + Math.random() * 260 + level * 12;
      fx.push({ t: 'drop', x: x + Math.cos(ang) * R * 0.7, y: y + Math.sin(ang) * R * 0.7,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 120, r: 2 + Math.random() * 3.5,
        life: 0.5 + Math.random() * 0.4, max: 0.9, c: col });
    }
  }

  /* The pile loses by pressing on the pressure pads (the domes on the side
   * walls). Pressure is smoothed so the spike from a hard shot doesn't
   * count. While a pad is pressed past its limit its meter on the lid fills;
   * left alone it slowly drains. A full meter ends the game. A sobo jammed
   * up into the launcher counts as pressing both pads. */
  function checkDanger(dt) {
    var jam = 0;
    for (var i = 0; i < world.blobs.length; i++) {
      var b = world.blobs[i];
      if (b.age > 1.5 && b.growT >= 1 && b.cy - b.curR < CFG.launchY) { jam = PAD_LIMIT * 1.5; break; }
    }
    var k = Math.min(1, dt / 0.5), pressing = false;
    var raw = [world.padL, world.padR];
    for (var side = 0; side < 2; side++) {
      // Capping the raw reading keeps one hard hit from counting as a squeeze.
      S.pad[side] += (Math.min(raw[side], PAD_LIMIT * 2) + jam - S.pad[side]) * k;
      var load = S.pad[side] / PAD_LIMIT;
      if (load >= 1) { S.meter[side] += dt * Math.min(2, load) / DANGER_TIME; pressing = true; }
      else S.meter[side] = Math.max(0, S.meter[side] - dt * PAD_DRAIN);
      // The pads give a little under load (drawn and felt by the physics).
      world.padSink[side] = Math.min(7, Math.min(1.2, load) * 6);
    }
    var m = Math.max(S.meter[0], S.meter[1]);
    S.dangerT = m * DANGER_TIME;
    if (pressing) {
      S.warnT -= dt;
      if (S.warnT <= 0) { Audio.warn(); haptic(1); S.warnT = Math.max(0.18, 0.7 - m * 0.5); }
      if (m >= 1) gameOver();
    } else {
      S.warnT = 0;
      // Close call: a meter got nearly full and the pile was eased off it.
      if (S.dangerPeak >= 0.85 && m < S.dangerPeak - 0.2) { unlock('close'); S.dangerPeak = 0; }
    }
    if (m > S.dangerPeak) S.dangerPeak = m;
    if (m === 0) S.dangerPeak = 0;
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
      v: 2, score: S.score, biggest: S.biggest, cur: S.cur, queue: S.queue,
      blobs: world.blobs.map(function (b) {
        return [b.value, Math.round(b.cx * 10) / 10, Math.round(b.cy * 10) / 10, b.made ? 1 : 0];
      })
    });
  }
  function resume() {
    var s = store.get('session', null);
    if (!s || s.v !== 2) return false;
    world.clear();
    fx.length = 0; popups.length = 0;
    s.blobs.forEach(function (d) {
      var b = world.add(new SB.Blob(d[0], d[1], d[2], 0, 0));
      b.age = 2;
      b.made = !!d[3];
    });
    S.score = s.score; S.biggest = s.biggest; S.cur = s.cur; S.queue = s.queue.slice(0, QUEUE); S.next = S.queue[0];
    S.combo = 0; S.comboT = 0; S.readyT = 0.3; S.dangerT = 0; S.pad = [0, 0]; S.meter = [0, 0]; S.newBest = false;
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
      document.getElementById('awards-count').textContent = awardCount() + '/' + ACHIEVEMENTS.length;
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
    document.getElementById('btn-haptics').textContent = hapticsOn ? 'Vibration: on' : 'Vibration: off';
  }

  function awardCount() {
    return ACHIEVEMENTS.filter(function (a) { return awards[a.id]; }).length;
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function openAwards() {
    var list = document.getElementById('awards-list');
    list.textContent = '';
    ACHIEVEMENTS.forEach(function (a) {
      var li = el('li', awards[a.id] ? 'done' : '');
      li.appendChild(el('span', 'mark', awards[a.id] ? '\u2713' : '?'));
      var txt = el('div');
      txt.appendChild(el('b', null, a.name));
      txt.appendChild(el('span', null, a.desc));
      li.appendChild(txt);
      list.appendChild(li);
    });
    document.getElementById('awards-progress').textContent =
      awardCount() + ' of ' + ACHIEVEMENTS.length + ' unlocked';
    renderStyles();
    var ov = document.getElementById('awards');
    ov.hidden = false;
    ov.scrollTop = 0;
    document.getElementById('btn-awards-close').focus({ preventScroll: true });
  }
  function renderStyles() {
    var box = document.getElementById('styles-list');
    box.textContent = '';
    STYLE_ORDER.forEach(function (id) {
      var st = STYLES[id], open = styleUnlocked(id);
      var b = el('button', 'style-opt');
      b.type = 'button';
      b.id = 'style-' + id;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(S.style === id));
      b.disabled = !open;
      b.appendChild(el('b', null, st.name));
      var sw = el('span', 'swatches');
      [0, 2, 5, 7, 8, 10].forEach(function (l) {
        var i = el('i');
        i.style.background = st.colors[l];
        sw.appendChild(i);
      });
      b.appendChild(sw);
      if (!open) {
        var need = ACHIEVEMENTS.filter(function (a) { return a.id === st.unlock; })[0];
        b.appendChild(el('small', null, 'Unlock: ' + need.desc.replace(/\.$/, '')));
      }
      b.addEventListener('click', function () {
        if (!styleUnlocked(id)) return;
        Audio.click();
        S.style = id;
        store.set('style', id);
        applyStyle(id);
        renderStyles();
        document.getElementById('style-' + id).focus({ preventScroll: true });
      });
      box.appendChild(b);
    });
  }
  bind('btn-play', newGame);
  bind('btn-continue', function () { if (!resume()) newGame(); });
  bind('btn-resume', function () { setMode('play'); });
  bind('btn-restart', newGame);
  bind('btn-home', function () { save(); setMode('title'); });
  bind('btn-again', newGame);
  bind('btn-over-home', function () { demoPile(); setMode('title'); });
  bind('btn-haptics', function () {
    hapticsOn = !hapticsOn;
    store.set('haptics', hapticsOn);
    syncSound();
    haptic(2);
  });
  bind('btn-awards', function () { openAwards(); });
  bind('btn-awards-pause', function () { openAwards(); });
  function closeAwards() { document.getElementById('awards').hidden = true; }
  bind('btn-awards-close', closeAwards);
  bind('btn-awards-x', closeAwards);
  bind('btn-sound', function () {
    Audio.setMuted(!Audio.isMuted());
    store.set('muted', Audio.isMuted());
    syncSound();
  });
  syncSound();

  var sideways = window.matchMedia('(orientation: landscape) and (max-height: 500px) and (pointer: coarse)');
  function onSideways() { if (sideways.matches) pause(); }
  if (sideways.addEventListener) sideways.addEventListener('change', onSideways);
  else if (sideways.addListener) sideways.addListener(onSideways);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) pause();
  });
  window.addEventListener('pagehide', save);

  /* ---------- input ---------- */
  var drag = null;
  var PAUSE_BTN = { x: 42, y: 58, r: 22 };

  canvas.addEventListener('pointerdown', function (e) {
    Audio.unlock();
    if (S.mode !== 'play') return;
    var p = toWorld(e);
    if (Math.hypot(p.x - PAUSE_BTN.x, p.y - PAUSE_BTN.y) < PAUSE_BTN.r + 8) {
      Audio.click(); pause(); return;
    }
    if (drag) return;
    drag = { id: e.pointerId, sx: p.x, sy: p.y, x: p.x, y: p.y };
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
    drag = null;
    if (cancelled || S.mode !== 'play') return;
    // A tap, or a pull too small to aim, drops the blob gently.
    launch(len < DEAD_ZONE ? { x: 0, y: 0 } : pull);
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
    if (e.key === 'Escape' && !document.getElementById('awards').hidden) { closeAwards(); return; }
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
      for (var t = 0; t < world.blobs.length; t++) if (world.blobs[t].age > 4) world.blobs[t].track = false;
      S.saveT += dt;
      if (S.saveT > 4) { S.saveT = 0; save(); }
      S.bumpT -= dt;
      if (world.impact > 1.3 && S.bumpT <= 0) { Audio.bump(world.impact); S.bumpT = 0.09; }
    } else if (S.mode === 'over') {
      S.overT += dt;
      if (S.overT > 0.9 && overlays.over.hidden) {
        // Ignore touches briefly so a swipe already in progress can't
        // hit "Play again" before the player has seen their score.
        overlays.over.classList.add('locked');
        overlays.over.hidden = false;
        setTimeout(function () { overlays.over.classList.remove('locked'); }, 800);
      }
      doMerges();
    }

    for (var i = fx.length - 1; i >= 0; i--) {
      var f = fx[i];
      f.life -= dt;
      if (f.life <= 0) { fx.splice(i, 1); continue; }
      f.vy += 900 * dt; f.vx *= 0.98;
      f.x += f.vx * dt; f.y += f.vy * dt;
    }
    for (var j = popups.length - 1; j >= 0; j--) {
      popups[j].life -= dt;
      popups[j].y -= 40 * dt;
      if (popups[j].life <= 0) popups.splice(j, 1);
    }
    S.shake *= 0.86;
  }

  /* ---------- rendering ---------- */
  var FT = 13;   // frame thickness

  function render() {
    var dpr = view.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawBackground();

    var sx = 0, sy = 0;
    if (S.shake > 0.3) { sx = (Math.random() - 0.5) * S.shake; sy = (Math.random() - 0.5) * S.shake; }
    var s = view.scale * dpr;
    ctx.setTransform(s, 0, 0, s, (view.ox + sx) * dpr, (view.oy + sy) * dpr);

    tankPath(0);
    ctx.fillStyle = UI.tank;
    ctx.fill();
    ctx.save();
    ctx.clip();   // splashes stay inside the tank
    for (var i = 0; i < world.blobs.length; i++) drawBlob(world.blobs[i]);
    drawFx();
    ctx.restore();
    drawPads();
    drawFrame();
    if (S.mode === 'play' || S.mode === 'paused') drawLauncher();
    drawPressureWarning();
    drawPopups();
    drawHud();
  }

  /* Flat dark backdrop. With room either side of the tank (desktop, iPad
   * held sideways) the name and score stand on end beside it. */
  function drawBackground() {
    var w = canvas.width, h = canvas.height, dpr = view.dpr;
    ctx.fillStyle = UI.bg;
    ctx.fillRect(0, 0, w, h);
    if (!sideText()) return;
    var cy = (view.oy + (CFG.ceil + CFG.floor) / 2 * view.scale) * dpr;
    var room = view.ox * dpr;
    var span = (CFG.floor - CFG.ceil) * view.scale * dpr;
    ctx.fillStyle = UI.side;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.save();
    ctx.translate(room * 0.62, cy);
    ctx.rotate(-Math.PI / 2);
    ctx.font = Math.min(room * 0.36, span / 6.2) + 'px ' + FONT;
    ctx.fillText('soboscuba', 0, 0);
    ctx.restore();
    var txt = S.mode === 'title' ? S.best.toLocaleString() : S.score.toLocaleString();
    ctx.save();
    ctx.translate(w - room * 0.62, cy);
    ctx.rotate(Math.PI / 2);
    ctx.font = Math.min(room * 0.42, span / Math.max(3, txt.length * 0.9)) + 'px ' + FONT;
    ctx.fillText(txt, 0, 0);
    ctx.restore();
  }
  function sideText() { return view.ox > 120; }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* The tank's inside: a box with its two bottom corners cut off, grown by g. */
  function tankPath(g) {
    var L = CFG.wallL - g, R = CFG.wallR + g, T = CFG.ceil - g, F = CFG.floor + g;
    var C = CFG.chamfer + g * (2 - Math.SQRT2);
    ctx.beginPath();
    ctx.moveTo(L, T); ctx.lineTo(R, T); ctx.lineTo(R, F - C); ctx.lineTo(R - C, F);
    ctx.lineTo(L + C, F); ctx.lineTo(L, F - C);
    ctx.closePath();
  }

  function drawFrame() {
    ctx.save();
    ctx.beginPath();
    ctx.rect(-50, -50, CFG.W + 100, CFG.H + 100);
    tankPathAppend();
    ctx.clip('evenodd');
    tankPath(FT / 2);
    ctx.lineJoin = 'round';
    ctx.lineWidth = FT;
    ctx.strokeStyle = UI.frame;
    ctx.stroke();
    ctx.restore();

    // A slot in each wall behind its pad, with the pad's pin in it.
    for (var side = 0; side < 2; side++) {
      var x = side ? CFG.wallR + FT * 0.45 : CFG.wallL - FT * 0.45;
      ctx.fillStyle = UI.slot;
      roundRect(x - 2.5, CFG.padY - CFG.padR * 1.15, 5, CFG.padR * 2.3, 2.5);
      ctx.fill();
      ctx.fillStyle = UI.pin;
      ctx.beginPath(); ctx.arc(x, CFG.padY, 2.6, 0, Math.PI * 2); ctx.fill();
    }
    drawMeters();
  }
  function tankPathAppend() {
    var L = CFG.wallL, R = CFG.wallR, T = CFG.ceil, F = CFG.floor, C = CFG.chamfer;
    ctx.moveTo(L, T); ctx.lineTo(R, T); ctx.lineTo(R, F - C); ctx.lineTo(R - C, F);
    ctx.lineTo(L + C, F); ctx.lineTo(L, F - C);
    ctx.closePath();
  }

  /* Each pad's danger meter sits in the lid above its side: the left bar
   * fills from the left corner, the right bar from the right corner. */
  function drawMeters() {
    var len = (CFG.wallR - CFG.wallL) * 0.36, y = CFG.ceil - FT / 2 - 2.5;
    var flash = 0.5 + 0.5 * Math.sin(S.time * 16);
    for (var side = 0; side < 2; side++) {
      var m = Math.min(1, S.meter[side]);
      var x0 = side ? CFG.wallR - len : CFG.wallL;
      ctx.fillStyle = UI.track;
      roundRect(x0, y, len, 5, 2.5);
      ctx.fill();
      if (m <= 0.005) continue;
      var col = mix(UI.meter, UI.hot, Math.min(1, m * m * 1.6));
      if (m > 0.7 && S.pad[side] >= PAD_LIMIT) col = mix(col, UI.accent, flash * 0.35);
      ctx.fillStyle = col;
      var w = Math.max(5, len * m);
      roundRect(side ? CFG.wallR - w : CFG.wallL, y, w, 5, 2.5);
      ctx.fill();
    }
  }

  /* Pressure pads: grey domes bulging out of the side walls. They give a
   * little under load and warm towards red as their meter fills. */
  function drawPads() {
    ctx.save();
    tankPath(0);
    ctx.clip();
    for (var side = 0; side < 2; side++) {
      var sink = world.padSink[side];
      var cx = side ? CFG.wallR + CFG.padIn + sink : CFG.wallL - CFG.padIn - sink;
      var m = Math.min(1, S.meter[side]);
      ctx.fillStyle = mix(UI.padOuter, mix(UI.hot, UI.padOuter, 0.55), m);
      ctx.beginPath(); ctx.arc(cx, CFG.padY, CFG.padR, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = mix(UI.padInner, UI.hot, Math.pow(m, 1.4));
      ctx.beginPath(); ctx.arc(cx + (side ? 3 : -3), CFG.padY, CFG.padR - 5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  /* Warning over the tank while a pad is being pressed too hard. */
  function drawPressureWarning() {
    var pressing = S.pad[0] >= PAD_LIMIT || S.pad[1] >= PAD_LIMIT;
    var m = Math.max(S.meter[0], S.meter[1]);
    if (!pressing || m < 0.25 || S.mode !== 'play') return;
    var alarm = 0.5 + 0.5 * Math.sin(S.time * (10 + m * 14));
    var cx = CFG.W / 2, cy = CFG.dangerY + 24;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    roundRect(cx - 108, cy - 15, 216, 30, 15);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '14px ' + FONT;
    ctx.fillStyle = mix(mix(UI.hot, '#ffffff', 0.45), UI.hot, alarm);
    ctx.fillText('TOO MUCH PRESSURE', cx, cy + 1);
  }

  function nFor(R) { return Math.max(9, Math.ceil(Math.PI * (R - SB.PR) / (SB.PR * 0.82))); }

  function polyPath(pts, n) {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (var i = 1; i < n; i++) ctx.lineTo(pts[i * 2], pts[i * 2 + 1]);
    ctx.closePath();
  }

  function drawBlob(b) {
    var pts = world.outline(b, outlineBuf);
    polyPath(pts, b.n);
    ctx.fillStyle = lv(b.level).fill;
    ctx.fill();
    // A thin stroke in the same colour rounds off the corners a touch.
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2;
    ctx.strokeStyle = lv(b.level).fill;
    ctx.stroke();
    drawNumber(b.cx, b.cy, b.curR, b.value, b.level, b.made);
  }

  function drawNumber(cx, cy, R, value, level, made) {
    var txt = label(value);
    var fs = (10 + R * 0.17) * (txt.length > 3 ? 0.85 : 1);
    ctx.font = fs + 'px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = made ? lv(level).ink : lv(level).dark;
    ctx.fillText(txt, cx, cy + fs * 0.06);
  }

  /* A sobo outside the physics (launcher and queue): a regular polygon with
   * the same corner count as the real thing, optionally stretched. */
  function drawStaticBlob(value, cx, cy, R, stretchX, stretchY, ang, selected) {
    var level = Math.round(Math.log2(value)), n = nFor(R);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang || 0);
    ctx.scale(stretchX || 1, stretchY || 1);
    ctx.rotate(-(ang || 0));
    ctx.beginPath();
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2 + 0.3;
      if (i) ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R); else ctx.moveTo(Math.cos(a) * R, Math.sin(a) * R);
    }
    ctx.closePath();
    ctx.lineJoin = 'round';
    if (selected) {
      ctx.lineWidth = 7;
      ctx.strokeStyle = UI.accent;
      ctx.stroke();
    }
    ctx.fillStyle = lv(level).fill;
    ctx.fill();
    ctx.restore();
    drawNumber(cx, cy, R, value, level, false);
  }

  /* The launcher: the current sobo hangs from the lid with the queue lined
   * up to its right, each marked by a dot on the lid. While a sobo is being
   * aimed, a white arrow shows where it will go. */
  function drawLauncher() {
    var pull = currentPull();
    var len = Math.hypot(pull.x, pull.y);
    var ready = S.readyT <= 0;
    var p = ready ? spawnPoint(pull) : { x: CFG.launchX, y: CFG.launchY };

    if (ready && S.tutorial && !drag) { drawTutorial(); return; }

    // Slot positions for the current sobo and the queue.
    var vals = [S.cur].concat(S.queue), xs = [], rs = [];
    var x = CFG.launchX;
    for (var i = 0; i < vals.length; i++) {
      var r = SB.radiusFor(Math.log2(vals[i]));
      if (i) x += rs[i - 1] + r + 1;
      xs.push(x); rs.push(r);
    }
    // While the next sobo moves up, the whole line slides left one slot.
    var e = ready ? 0 : Math.max(0, S.readyT / COOLDOWN);
    e = e * e * (3 - 2 * e);
    for (var q = vals.length - 1; q >= 0; q--) {
      var nx = q + 1 < xs.length ? xs[q + 1] : xs[q] + rs[q] * 2 + 1;
      var dx = xs[q] + (nx - xs[q]) * e;
      if (dx - rs[q] > CFG.wallR - 2) continue;
      ctx.fillStyle = q === 0 ? UI.dot : UI.dotDim;
      ctx.beginPath(); ctx.arc(q === 0 && ready ? p.x : dx, CFG.ceil + 4, q === 0 ? 3.5 : 2.6, 0, Math.PI * 2); ctx.fill();
      if (q === 0 && ready) continue;
      drawStaticBlob(vals[q], dx, CFG.launchY, rs[q], 1, 1, 0, false);
    }
    if (!ready) return;

    var st = len / MAX_PULL;
    var ang = Math.atan2(pull.y, pull.x);
    var pop = Math.min(1, -S.readyT / 0.15 + 1);
    var wob = 1 + Math.sin(S.time * 5) * 0.025;
    drawStaticBlob(S.cur, p.x, p.y, rs[0] * wob * pop, 1 + st * 0.22, 1 - st * 0.14, ang, true);
    if (drag && len >= DEAD_ZONE) drawAim(p, pull);
    if (drag) {
      ctx.fillStyle = UI.accent;
      ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawAim(p, pull) {
    var len = Math.hypot(pull.x, pull.y), ux = pull.x / len, uy = pull.y / len;
    var L = 30 + (len / MAX_PULL) * 150;
    var ex = p.x + ux * L, ey = p.y + uy * L;
    ctx.strokeStyle = UI.accent;
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y); ctx.lineTo(ex, ey);
    var hx = -ux * 15, hy = -uy * 15;
    ctx.moveTo(ex + hx - uy * 9, ey + hy + ux * 9); ctx.lineTo(ex, ey); ctx.lineTo(ex + hx + uy * 9, ey + hy - ux * 9);
    ctx.stroke();
  }

  /* First game only: a ghost finger shows the slingshot drag. */
  function drawTutorial() {
    var cyc = (S.time % 2.6) / 2.6;
    var t = cyc < 0.15 ? 0 : cyc < 0.6 ? (cyc - 0.15) / 0.45 : 1;
    var ease = t * t * (3 - 2 * t);
    var sx = CFG.launchX + 30, sy = 360;
    var fx2 = sx + 46 * ease, fy = sy - 110 * ease;
    var pull = { x: sx - fx2, y: sy - fy };
    var p = spawnPoint(pull);
    var R = SB.radiusFor(Math.log2(S.cur));
    var st = Math.hypot(pull.x, pull.y) / MAX_PULL;
    drawStaticBlob(S.cur, p.x, p.y, R, 1 + st * 0.22, 1 - st * 0.14, Math.atan2(pull.y, pull.x), true);
    if (ease > 0.05) drawAim(p, pull);

    var fade = cyc > 0.85 ? 1 - (cyc - 0.85) / 0.15 : Math.min(1, cyc / 0.1);
    ctx.globalAlpha = fade;
    ctx.setLineDash([5, 6]);
    ctx.strokeStyle = UI.accent;
    ctx.globalAlpha = fade * 0.5;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(fx2, fy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = fade * 0.25;
    ctx.fillStyle = UI.accent;
    ctx.beginPath(); ctx.arc(fx2, fy, 18, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = fade;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(fx2, fy, 18, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = UI.accent;
    ctx.font = '17px ' + FONT;
    ctx.fillText('Drag back like a slingshot', CFG.W / 2, 430);
    ctx.fillText('and let go to fling', CFG.W / 2, 454);
    ctx.font = '12px ' + FONT;
    ctx.fillStyle = UI.hud;
    ctx.fillText('Tap anywhere for a gentle drop', CFG.W / 2, 486);
  }

  function drawFx() {
    for (var i = 0; i < fx.length; i++) {
      var f = fx[i];
      ctx.globalAlpha = Math.min(1, f.life / (f.max * 0.5));
      ctx.fillStyle = f.c;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
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
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
      if (p.sub) {
        ctx.font = '12px ' + FONT;
        ctx.strokeText(p.sub, p.x, p.y + p.size * 0.8);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(p.sub, p.x, p.y + p.size * 0.8);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawHud() {
    if (S.mode === 'title') return;
    // Menu button: three bars, as in the original.
    ctx.fillStyle = UI.hud;
    for (var i = -1; i <= 1; i++) roundRect(PAUSE_BTN.x - 13, PAUSE_BTN.y + i * 8 - 2.5, 26, 5, 2.5), ctx.fill();
    if (sideText()) return;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = UI.hudDim;
    ctx.font = '11px ' + FONT;
    ctx.fillText('BEST ' + S.best.toLocaleString(), CFG.wallR, 30);
    ctx.fillStyle = UI.hud;
    ctx.font = '38px ' + FONT;
    ctx.fillText(S.score.toLocaleString(), CFG.wallR + 2, 80);
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
    document.fonts.load('20px "Audiowide"').catch(function () {});
  }

  // Hooks for automated tests.
  SB.game = { S: S, world: world, view: view, awards: awards, unlock: unlock, applyStyle: applyStyle, newGame: newGame, launch: launch, resume: resume, save: save,
    update: update, render: render };
})(window.SB = window.SB || {});
