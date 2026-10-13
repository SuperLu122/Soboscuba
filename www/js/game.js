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
  var DEAD_ZONE = 5;       // world px of drag treated as a tap

  /* ---------- blob styles (colors[level], value = 2^level) ---------- */
  var STYLES = {
    reef: { name: 'Reef', colors: ['#9be7ff', '#9be7ff', '#5fd3c6', '#ffd166', '#ff9f5a', '#ff6b81',
      '#c77dff', '#7b8cff', '#4ade80', '#ff5d5d', '#f472b6', '#fbbf24', '#22d3ee', '#a3e635', '#e879f9', '#f8fafc'] },
    pastel: { name: 'Pastel', unlock: 'v512', colors: ['#d4f1ff', '#d4f1ff', '#b8f0e0', '#fff1b8', '#ffd6b8',
      '#ffc2d1', '#e3c8ff', '#c9d1ff', '#c6f6c6', '#ffb3b3', '#ffc8e8', '#ffe2a8', '#b5f1ff', '#e0f7a8', '#f6c8ff', '#ffffff'] },
    neon: { name: 'Neon', unlock: 'combo5', colors: ['#7df9ff', '#7df9ff', '#39ff88', '#f8ff3a', '#ff9f1c',
      '#ff3fa4', '#b14cff', '#4d6dff', '#00f5d4', '#ff2e63', '#fee440', '#00bbf9', '#9b5de5', '#f15bb5', '#00f5a0', '#ffffff'] },
    sunset: { name: 'Sunset', unlock: 's25k', colors: ['#fff3b0', '#fff3b0', '#ffe08a', '#ffc86b', '#ffab5c',
      '#ff8f5a', '#ff6f61', '#f0567a', '#d94892', '#b23fa6', '#8e44ad', '#6c4ab6', '#4f5bd5', '#3b7dd8', '#2ea0d6', '#ffffff'] },
    midnight: { name: 'Midnight', unlock: 'v2048', colors: ['#c4d8ff', '#c4d8ff', '#a6c1ff', '#8aa9f7', '#7392ea',
      '#5f7ddb', '#4f6acb', '#4258b9', '#374aa6', '#2d3c92', '#25317e', '#1e286b', '#ffd166', '#ff9f5a', '#ff6b81', '#ffffff'] }
  };
  var STYLE_ORDER = ['reef', 'pastel', 'neon', 'sunset', 'midnight'];
  var INK = '#0b2239', INK_LIGHT = '#f4fbff';

  function hexRgb(h) {
    var n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) {
    var x = hexRgb(a), y = hexRgb(b);
    return 'rgb(' + Math.round(x[0] + (y[0] - x[0]) * t) + ',' +
      Math.round(x[1] + (y[1] - x[1]) * t) + ',' + Math.round(x[2] + (y[2] - x[2]) * t) + ')';
  }
  function luma(h) { var c = hexRgb(h); return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; }
  var LV = [];
  function applyStyle(id) {
    var st = STYLES[id] || STYLES.reef;
    for (var l = 0; l <= 24; l++) {
      var base = st.colors[Math.min(l, st.colors.length - 1)];
      LV[l] = { fill: base, light: mix(base, '#ffffff', 0.5), dark: mix(base, '#06233a', 0.5),
        ink: luma(base) < 0.5 ? INK_LIGHT : INK };
    }
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
    newBest: false,
    dangerPeak: 0,
    tutorial: false,
    style: store.get('style', 'reef')
  };
  Audio.setMuted(store.get('muted', false));
  var hapticsOn = store.get('haptics', true);

  /* ---------- achievements ---------- */
  var ACHIEVEMENTS = [
    { id: 'merge', name: 'First squish', desc: 'Merge two blobs.' },
    { id: 'v128', name: 'Getting chunky', desc: 'Make a 128.' },
    { id: 'v512', name: 'Big wobbler', desc: 'Make a 512.' },
    { id: 'v2048', name: 'Tank boss', desc: 'Make a 2k.' },
    { id: 'v8192', name: 'Leviathan', desc: 'Make an 8k.' },
    { id: 'combo3', name: 'Chain reaction', desc: 'Get a combo of x3.' },
    { id: 'combo5', name: 'Cascade', desc: 'Get a combo of x5.' },
    { id: 'bullseye', name: 'Bullseye', desc: 'Merge a blob with the first blob it touches.' },
    { id: 'bank', name: 'Bank shot', desc: 'Bounce a blob off a wall straight into a merge.' },
    { id: 'close', name: 'Close call', desc: 'Clear the line with under half a second to spare.' },
    { id: 's10k', name: 'Five figures', desc: 'Score 10,000 in one game.' },
    { id: 's25k', name: 'Deep diver', desc: 'Score 25,000 in one game.' },
    { id: 's100k', name: 'Abyssal', desc: 'Score 100,000 in one game.' }
  ];
  var awards = store.get('awards', {});
  var toastQueue = [], toastBusy = false;
  function styleUnlocked(id) { var u = STYLES[id].unlock; return !u || !!awards[u]; }
  if (!STYLES[S.style] || !styleUnlocked(S.style)) S.style = 'reef';
  applyStyle(S.style);

  function unlock(id) {
    if (awards[id] || S.mode !== 'play') return;
    awards[id] = Date.now();
    store.set('awards', awards);
    var a = ACHIEVEMENTS.filter(function (x) { return x.id === id; })[0];
    var styleName = null;
    STYLE_ORDER.forEach(function (k) { if (STYLES[k].unlock === id) styleName = STYLES[k].name; });
    toastQueue.push({ name: a.name, desc: a.desc, extra: styleName ? 'New blob style: ' + styleName : '' });
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
    // Toasts sit just under the danger line, clear of the launcher and HUD.
    document.documentElement.style.setProperty('--toast-top', (view.oy + (CFG.dangerY + 14) * sc) + 'px');
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
    S.readyT = 0.2; S.dangerT = 0; S.dangerPeak = 0; S.newBest = false; S.overT = 0;
    S.tutorial = !store.get('tutorialDone', false);
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
    b.track = true;
    world.add(b);
    if (S.tutorial) { S.tutorial = false; store.set('tutorialDone', true); }
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
    nb.joy = 1.3;

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
      size: 18 + Math.min(level, 12) * 1.6, color: lv(level).light });
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
      if (S.warnT <= 0) { Audio.warn(); haptic(1); S.warnT = Math.max(0.18, 0.6 - S.dangerT * 0.15); }
      if (S.dangerT >= DANGER_TIME) gameOver();
    } else {
      S.dangerT = Math.max(0, S.dangerT - dt * 2);
      S.warnT = 0;
      if (S.dangerT === 0) {
        if (S.dangerPeak >= DANGER_TIME - 0.5) unlock('close');
        S.dangerPeak = 0;
      }
    }
    if (S.dangerT > S.dangerPeak) S.dangerPeak = S.dangerT;
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
      [1, 3, 5, 7, 9, 11].forEach(function (l) {
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
  var PAUSE_BTN = { x: 38, y: 40, r: 22 };

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
    updateSobos(dt);
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
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.font = '13px ' + FONT;
      ctx.fillText(Math.max(0, DANGER_TIME - S.dangerT).toFixed(1), cx, cy + 1);
      if (S.dangerT > 0.4) {
        var a = 0.65 + alarm * 0.35;
        ctx.font = (20 + alarm * 2) + 'px ' + FONT;
        ctx.textAlign = 'right';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(60,0,0,' + (0.6 * a) + ')';
        ctx.fillStyle = 'rgba(255,120,120,' + a + ')';
        ctx.strokeText('OVERFLOW!', cx - 22, cy + 1);
        ctx.fillText('OVERFLOW!', cx - 22, cy + 1);
      }
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

  /* ---------- sobo moods ----------
   * Every sobo has a face that reacts to what is going on: it watches the
   * shot being lined up, follows blobs flying past, gazes longingly at a
   * matching neighbour, squeals in flight, scrunches up when hit, beams
   * after merging, sweats over the line, and dozes off when left alone. */
  function updateSobos(dt) {
    var bl = world.blobs, i, j, b, o;
    var flyer = null, aimP = null;
    if (drag && S.mode === 'play' && S.readyT <= 0) {
      var pl = currentPull();
      if (Math.hypot(pl.x, pl.y) >= DEAD_ZONE) aimP = spawnPoint(pl);
    }
    for (i = 0; i < bl.length; i++) {
      b = bl[i];
      if (b.mood === undefined) initFace(b);
      if (b.touch || b.age > 3) b.landed = true;
      if (b.track && !b.landed && (!flyer || b.age < flyer.age)) flyer = b;
    }
    for (i = 0; i < bl.length; i++) {
      b = bl[i];
      var sp = Math.hypot(b.vx, b.vy);
      var dv = Math.hypot(b.vx - b.pvx, b.vy - b.pvy);
      b.pvx = b.vx; b.pvy = b.vy;
      if (dv > 260 && b.age > 0.1) b.ouch = 0.45;
      if (b.ouch > 0) b.ouch -= dt;
      if (b.joy > 0) b.joy -= dt;
      b.still = sp < 12 ? b.still + dt : 0;
      if (b.still > 0 && b.ouch > 0) b.still = 0;

      // A matching neighbour close enough to touch soon.
      var mate = null, best = 1e9;
      for (j = 0; j < bl.length; j++) {
        o = bl[j];
        if (o === b || o.value !== b.value) continue;
        var d = Math.hypot(o.cx - b.cx, o.cy - b.cy) - b.curR - o.curR;
        if (d < b.curR * 1.2 && d < best) { best = d; mate = o; }
      }

      // Hysteresis so a face doesn't flicker while the squash hovers near the limit.
      if (b.squish > 0.92) b.strained = true; else if (b.squish < 0.7) b.strained = false;
      var over = b.cy - b.curR < CFG.dangerY && S.dangerT > 0 && b.age > 1.5;
      var m = 'idle';
      if (S.mode === 'over') m = 'sad';
      else if (b.joy > 0) m = 'happy';
      else if (b.track && !b.landed) m = 'wee';
      else if (b.ouch > 0) m = 'ouch';
      else if (over) m = 'worry';
      else if (b.strained) m = 'strain';
      else if (mate) m = 'eager';
      else if (b.still > 14) m = 'sleep';
      b.mood = m;
      if (m !== 'sleep' && b.still > 14 && sp > 30) b.still = 0;

      // Where to look (unit-ish vector).
      var tx = 0, ty = 0, tgt = null;
      if (m === 'sleep' || m === 'happy') { tx = 0; ty = 0.2; }
      else if (m === 'sad') { tx = 0; ty = 1; }
      else if (m === 'worry') { tx = 0; ty = -1; }
      else if (m === 'wee') { tx = b.vx; ty = b.vy; var vl = Math.hypot(tx, ty) || 1; tx /= vl; ty /= vl; }
      else if (aimP) tgt = aimP;
      else if (flyer && flyer !== b) tgt = { x: flyer.cx, y: flyer.cy };
      else if (mate) tgt = { x: mate.cx, y: mate.cy };
      else {
        b.wanderT -= dt;
        if (b.wanderT <= 0) {
          b.wanderT = 1.5 + Math.random() * 3.5;
          var a = Math.random() * Math.PI * 2, r = Math.random() < 0.35 ? 0 : 0.5 + Math.random() * 0.5;
          b.wx = Math.cos(a) * r; b.wy = Math.sin(a) * r * 0.7;
        }
        tx = b.wx; ty = b.wy;
      }
      if (tgt) {
        var gx = tgt.x - b.cx, gy = tgt.y - b.cy, gl = Math.hypot(gx, gy) || 1;
        tx = gx / gl; ty = gy / gl;
      }
      var k = Math.min(1, dt * (m === 'wee' ? 14 : 7));
      b.gx += (tx - b.gx) * k; b.gy += (ty - b.gy) * k;
      tickBlink(b, dt);
    }
    // The blob in the launcher and the next one up.
    var lf = S.launchFace, nf = S.nextFace;
    var lp = currentPull(), ll = Math.hypot(lp.x, lp.y);
    lf.mood = drag && ll > MAX_PULL * 0.55 ? 'determined' : drag && ll >= DEAD_ZONE ? 'eager' : 'idle';
    var lx = 0, ly = 0.7;
    if (drag && ll >= DEAD_ZONE) { lx = lp.x / ll; ly = lp.y / ll; }
    else if (flyer) { lx = flyer.cx - CFG.launchX; ly = flyer.cy - CFG.launchY; var fl = Math.hypot(lx, ly) || 1; lx /= fl; ly /= fl; }
    lf.gx += (lx - lf.gx) * Math.min(1, dt * 9); lf.gy += (ly - lf.gy) * Math.min(1, dt * 9);
    nf.mood = 'idle';
    nf.gx += (-0.9 - nf.gx) * Math.min(1, dt * 5); nf.gy += (0.35 - nf.gy) * Math.min(1, dt * 5);
    tickBlink(lf, dt); tickBlink(nf, dt);
  }

  function initFace(b) {
    b.mood = 'idle'; b.gx = 0; b.gy = 0.3; b.wx = 0; b.wy = 0.3; b.wanderT = Math.random() * 2;
    b.blinkT = 1 + Math.random() * 4; b.blinkA = 0; b.joy = b.joy || 0; b.ouch = 0; b.still = 0;
    b.pvx = b.vx; b.pvy = b.vy;
  }
  function newFace() { var f = {}; initFace(f); f.vx = f.vy = 0; return f; }
  S.launchFace = newFace();
  S.nextFace = newFace();

  function tickBlink(f, dt) {
    f.blinkT -= dt;
    if (f.blinkT <= 0) { f.blinkA = 0.14; f.blinkT = 2.2 + Math.random() * 4.5; if (Math.random() < 0.2) f.blinkT = 0.3; }
    if (f.blinkA > 0) f.blinkA -= dt;
  }

  // How far a blob is squashed: principal axes of its outline, relative to
  // a circle of radius R. The face is drawn through this so it squishes too.
  function bodyStretch(pts, n, cx, cy, R) {
    var sxx = 0, syy = 0, sxy = 0;
    for (var i = 0; i < n; i++) {
      var dx = pts[i * 2] - cx, dy = pts[i * 2 + 1] - cy;
      sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    }
    sxx /= n; syy /= n; sxy /= n;
    var tr = (sxx + syy) / 2, det = Math.sqrt(Math.max(0, (sxx - syy) * (sxx - syy) / 4 + sxy * sxy));
    var l1 = tr + det, l2 = Math.max(1e-3, tr - det);
    var th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    var base = R * R / 2;
    var s1 = Math.sqrt(l1 / base), s2 = Math.sqrt(l2 / base);
    var norm = 1 / Math.sqrt(s1 * s2);   // keep the face's size, just its shape
    s1 = Math.max(0.6, Math.min(1.6, s1 * norm));
    s2 = Math.max(0.6, Math.min(1.6, s2 * norm));
    var c = Math.cos(th), s = Math.sin(th);
    return [c * c * s1 + s * s * s2, c * s * (s1 - s2), s * s * s1 + c * c * s2];
  }

  function drawBlob(b) {
    if (b.mood === undefined) initFace(b);
    var pts = world.outline(b, outlineBuf);
    var R = b.curR;
    smoothPath(pts, b.n);
    ctx.fillStyle = blobPaint(b.level, b.cx, b.cy, R);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = lv(b.level).dark;
    ctx.stroke();
    drawGloss(b.cx, b.cy, R);
    var m = bodyStretch(pts, b.n, b.cx, b.cy, R - SB.PR * 0.5);
    ctx.save();
    ctx.translate(b.cx, b.cy);
    ctx.transform(m[0], m[1], m[1], m[2], 0, 0);
    ctx.rotate(Math.max(-0.3, Math.min(0.3, b.vx / 2400)));
    drawFace(R, b.level, b.value, b);
    ctx.restore();
  }

  function drawGloss(cx, cy, R) {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(cx - R * 0.42, cy - R * 0.52, R * 0.18, R * 0.1, -0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  /* A sobo face in local coordinates (origin at the body centre). */
  function drawFace(R, level, value, f) {
    var c = lv(level), ink = c.ink, mood = f.mood || 'idle';
    var small = R < 30;
    var gx = f.gx || 0, gy = f.gy || 0;
    var gl = Math.hypot(gx, gy);
    if (gl > 1) { gx /= gl; gy /= gl; }
    // The whole face turns a little toward where it is looking.
    var fx0 = gx * R * 0.1, fy0 = gy * R * 0.07;
    var ex = R * (small ? 0.33 : 0.29), ey = fy0 - R * (small ? 0.27 : 0.2);
    var erx = Math.max(1.9, R * (small ? 0.1 : 0.085)), ery = Math.max(2.4, R * (small ? 0.125 : 0.11));
    var my = fy0 + R * (small ? -0.02 : 0.05);
    var mw = R * (small ? 0.15 : 0.16);
    var lw = Math.max(1.4, R * 0.042);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = lw;
    ctx.strokeStyle = ink; ctx.fillStyle = ink;

    // Cheeks.
    if (R >= 22 && mood !== 'sad') {
      ctx.fillStyle = mood === 'happy' || mood === 'eager' || mood === 'strain' ? 'rgba(255,90,130,0.45)' : 'rgba(255,110,140,0.3)';
      for (var cs = -1; cs <= 1; cs += 2) {
        ctx.beginPath();
        ctx.ellipse(fx0 + cs * R * 0.47, my - R * 0.03, R * 0.11, R * 0.065, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = ink;
    }

    var blink = f.blinkA > 0 ? Math.abs(f.blinkA - 0.07) / 0.07 : 1;   // 1 open .. 0 shut
    var px = gx * erx * 0.55, py = gy * ery * 0.45;                      // pupil shift
    for (var s = -1; s <= 1; s += 2) {
      var x = fx0 + s * ex, y = ey;
      ctx.beginPath();
      if (mood === 'happy') {
        ctx.arc(x, y + ery * 0.5, erx * 1.15, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      } else if (mood === 'sleep') {
        ctx.arc(x, y - ery * 0.2, erx * 1.1, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
      } else if (mood === 'ouch' || mood === 'strain') {
        var w = erx * 1.05, h = ery * 0.9;
        ctx.moveTo(x - s * w, y - h); ctx.lineTo(x + s * w * 0.6, y); ctx.lineTo(x - s * w, y + h);
        ctx.stroke();
      } else {
        var big = mood === 'wee' ? 1.3 : 1;
        var ry = ery * big * blink;
        if (ry < ery * 0.25) {
          ctx.moveTo(x - erx, y); ctx.lineTo(x + erx, y); ctx.stroke();
        } else {
          ctx.ellipse(x + px, y + py, erx * big, ry, 0, 0, Math.PI * 2);
          ctx.fill();
          if (R >= 18) {
            ctx.fillStyle = 'rgba(255,255,255,0.92)';
            ctx.beginPath();
            ctx.arc(x + px - erx * 0.3 * big, y + py - ry * 0.38, erx * 0.42 * big, 0, Math.PI * 2);
            ctx.fill();
            if (R >= 34) {
              ctx.beginPath();
              ctx.arc(x + px + erx * 0.32 * big, y + py + ry * 0.35, erx * 0.18 * big, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.fillStyle = ink;
          }
          if (mood === 'sad' || mood === 'worry' || mood === 'determined') {
            // Brows: worried ones tilt up in the middle, determined ones down.
            var tilt = mood === 'determined' ? -1 : 1;
            ctx.beginPath();
            ctx.moveTo(x - s * erx * 1.2, y - ery * 1.7 - tilt * ery * 0.35);
            ctx.lineTo(x + s * erx * 1.0, y - ery * 1.7 + tilt * ery * 0.45);
            ctx.stroke();
          }
        }
      }
    }

    // Mouth.
    ctx.beginPath();
    if (mood === 'happy' || mood === 'eager') {
      var r0 = mw * (mood === 'happy' ? 0.85 : 0.6);
      ctx.moveTo(fx0 - r0, my);
      ctx.arc(fx0, my, r0, 0, Math.PI);
      ctx.closePath();
      ctx.fill();
      if (R >= 26) {
        ctx.fillStyle = 'rgba(255,120,150,0.95)';
        ctx.beginPath();
        ctx.ellipse(fx0, my + r0 * 0.62, r0 * 0.5, r0 * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = ink;
      }
    } else if (mood === 'wee') {
      if (small) ctx.ellipse(fx0, my + mw * 0.12, mw * 0.32, mw * 0.36, 0, 0, Math.PI * 2);
      else ctx.ellipse(fx0, my + mw * 0.3, mw * 0.42, mw * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (mood === 'ouch' || mood === 'strain' || mood === 'worry') {
      var zw = mw * (mood === 'worry' ? 0.7 : 0.9), zh = mw * 0.18;
      ctx.moveTo(fx0 - zw, my + zh);
      for (var z = 1; z <= 4; z++) ctx.lineTo(fx0 - zw + zw * 2 * z / 4, my + (z % 2 ? -zh : zh));
      ctx.stroke();
    } else if (mood === 'sad') {
      ctx.arc(fx0, my + mw * 0.75, mw * 0.6, Math.PI * 1.2, Math.PI * 1.8);
      ctx.stroke();
    } else if (mood === 'sleep') {
      ctx.ellipse(fx0, my + mw * 0.15, mw * 0.18, mw * 0.24, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (mood === 'determined') {
      ctx.moveTo(fx0 - mw * 0.5, my + mw * 0.1); ctx.lineTo(fx0 + mw * 0.5, my + mw * 0.1);
      ctx.stroke();
    } else {
      // Contented little "w" smile.
      var hw = mw * 0.5;
      ctx.moveTo(fx0 - hw * 2, my - hw * 0.25);
      ctx.quadraticCurveTo(fx0 - hw, my + hw * 1.1, fx0, my);
      ctx.quadraticCurveTo(fx0 + hw, my + hw * 1.1, fx0 + hw * 2, my - hw * 0.25);
      ctx.stroke();
    }

    // Extras.
    if (mood === 'worry' && R >= 20) {
      ctx.fillStyle = 'rgba(160,225,255,0.95)';
      var sx = fx0 + R * 0.55, sy = ey - R * 0.12 + ((S.time * 0.6) % 1) * R * 0.25;
      ctx.beginPath();
      ctx.moveTo(sx, sy - R * 0.13);
      ctx.quadraticCurveTo(sx + R * 0.08, sy, sx, sy + R * 0.04);
      ctx.quadraticCurveTo(sx - R * 0.08, sy, sx, sy - R * 0.13);
      ctx.fill();
    } else if (mood === 'sleep' && R >= 20) {
      var zt = (S.time * 0.5 + (f.blinkT || 0) * 0.1) % 1;
      ctx.globalAlpha = Math.sin(zt * Math.PI) * 0.8;
      ctx.font = Math.max(9, R * 0.22) + 'px ' + FONT;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('z', fx0 + R * (0.45 + zt * 0.2), ey - R * (0.25 + zt * 0.3));
      ctx.globalAlpha = 1;
    }

    // The number sits on the tummy.
    var txt = label(value);
    var fs = small ? Math.max(9.5, R * 0.6) : Math.min(50, R * (txt.length > 3 ? 0.32 : txt.length > 2 ? 0.38 : 0.44));
    ctx.font = fs + 'px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.85;
    ctx.fillText(txt, fx0 * 0.5, R * (small ? 0.4 : 0.46) + fs * 0.05);
    ctx.globalAlpha = 1;
  }

  function drawStaticBlob(value, cx, cy, R, stretchX, stretchY, ang, face) {
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
    drawGloss(0, 0, R);
    drawFace(R, level, value, face || { mood: 'idle', gx: 0, gy: 0.4 });
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

    if (ready && S.tutorial && !drag) {
      drawTutorial(R);
      return;
    }
    if (ready) {
      if (len >= DEAD_ZONE) drawTrajectory(p, pull, R);
      var pop = Math.min(1, -S.readyT / 0.15 + 1);
      var wob = 1 + Math.sin(S.time * 5) * 0.025;
      var st = len / MAX_PULL;
      var ang = Math.atan2(pull.y, pull.x);
      drawStaticBlob(S.cur, p.x, p.y, R * wob * pop, 1 + st * 0.18, 1 - st * 0.12, ang, S.launchFace);
    } else {
      ctx.strokeStyle = 'rgba(230,250,255,0.25)';
      ctx.setLineDash([4, 5]);
      ctx.beginPath(); ctx.arc(CFG.launchX, CFG.launchY, R, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /* First game only: a ghost finger shows the slingshot drag. */
  function drawTutorial(R) {
    var cyc = (S.time % 2.6) / 2.6;
    var t = cyc < 0.15 ? 0 : cyc < 0.6 ? (cyc - 0.15) / 0.45 : 1;
    var ease = t * t * (3 - 2 * t);
    var sx = CFG.launchX + 30, sy = 330;
    var fx2 = sx + 46 * ease, fy = sy - 120 * ease;
    var pull = { x: sx - fx2, y: sy - fy };
    var p = spawnPoint(pull);
    var ax = CFG.launchX - 50, bx = CFG.launchX + 50, ay = CFG.launchY - 4;
    ctx.strokeStyle = 'rgba(255,170,140,0.85)';
    ctx.lineWidth = 3;
    var pl = Math.hypot(pull.x, pull.y) || 1;
    ctx.beginPath(); ctx.moveTo(ax, ay);
    ctx.lineTo(p.x - pull.x / pl * R * 0.9, p.y - pull.y / pl * R * 0.9);
    ctx.lineTo(bx, ay); ctx.stroke();
    if (ease > 0.05) drawTrajectory(p, pull, R);
    var st = Math.hypot(pull.x, pull.y) / MAX_PULL;
    drawStaticBlob(S.cur, p.x, p.y, R, 1 + st * 0.18, 1 - st * 0.12, Math.atan2(pull.y, pull.x), S.launchFace);

    var fade = cyc > 0.85 ? 1 - (cyc - 0.85) / 0.15 : Math.min(1, cyc / 0.1);
    ctx.globalAlpha = fade;
    ctx.setLineDash([5, 6]);
    ctx.strokeStyle = 'rgba(233,251,255,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(fx2, fy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(233,251,255,0.35)';
    ctx.beginPath(); ctx.arc(fx2, fy, 20, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#e9fbff';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(fx2, fy, 20, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '22px ' + FONT;
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(4,24,42,0.8)';
    ctx.fillStyle = '#e9fbff';
    var l1 = 'Drag back like a slingshot', l2 = 'and let go to fling';
    ctx.strokeText(l1, CFG.W / 2, 400); ctx.fillText(l1, CFG.W / 2, 400);
    ctx.strokeText(l2, CFG.W / 2, 428); ctx.fillText(l2, CFG.W / 2, 428);
    ctx.font = '16px ' + FONT;
    ctx.fillStyle = '#8fd3e8';
    ctx.strokeText('Tap anywhere for a gentle drop', CFG.W / 2, 462);
    ctx.fillText('Tap anywhere for a gentle drop', CFG.W / 2, 462);
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
    drawStaticBlob(S.next, CFG.W - 20 - 28, 80, nR, 1, 1, 0, S.nextFace);
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
  SB.game = { S: S, world: world, view: view, awards: awards, unlock: unlock, applyStyle: applyStyle, newGame: newGame, launch: launch, resume: resume, save: save,
    update: update, render: render };
})(window.SB = window.SB || {});
