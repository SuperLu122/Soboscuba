/*
 * Soft-body physics for Soboscuba.
 *
 * Every blob is a closed ring of small circular particles. Each substep:
 *   1. Verlet-integrate every particle (gravity + damping).
 *   2. Shape-match each ring back toward its rest circle (gives the jiggle).
 *   3. Resolve particle/particle contacts between different blobs and
 *      particle/wall contacts, using a uniform spatial hash.
 * Particles live in flat typed arrays owned by the World; a Blob stores
 * the offset and count of its slice. The arrays are rebuilt whenever
 * blobs are added or removed (rare: only on launch and merge).
 */
(function (SB) {
  'use strict';

  var PR = 6;            // particle radius
  var PD = PR * 2;       // contact distance between two particles
  var CS = PD;           // spatial hash cell size

  var CFG = SB.CONFIG = {
    W: 420, H: 760,
    wallL: 16, wallR: 404, floor: 736, ceil: 4,
    dangerY: 176,
    launchX: 210, launchY: 100,
    gravity: 1500,
    substeps: 8,
    dt: 1 / 60
  };

  function radiusFor(level) { return 14 + 8.4 * (level - 1); }
  SB.radiusFor = radiusFor;
  SB.PR = PR;

  var nextId = 1;

  function Blob(value, cx, cy, vx, vy, startR) {
    this.id = nextId++;
    this.value = value;
    this.level = Math.round(Math.log2(value));
    this.R = radiusFor(this.level);
    this.growFrom = startR || this.R;
    this.curR = this.growFrom;
    this.growT = startR ? 0 : 1;
    this.n = Math.max(8, Math.ceil(Math.PI * (this.R - PR) / (PR * 0.9)));
    this.off = -1;
    this.age = 0;
    this.angle = 0;
    this.cx = cx; this.cy = cy;
    this.vx = vx || 0; this.vy = vy || 0;
    this.dead = false;
    this.squish = 0;          // 0..1 visual squash amount, for faces
    this.blink = Math.random() * 4;

    // Unit directions of the rest shape.
    this.ux = new Float32Array(this.n);
    this.uy = new Float32Array(this.n);
    for (var i = 0; i < this.n; i++) {
      var a = (i / this.n) * Math.PI * 2;
      this.ux[i] = Math.cos(a);
      this.uy[i] = Math.sin(a);
    }
  }
  SB.Blob = Blob;

  function World() {
    this.blobs = [];
    this.count = 0;
    this.cap = 0;
    this.X = new Float32Array(0); this.Y = new Float32Array(0);
    this.PX = new Float32Array(0); this.PY = new Float32Array(0);
    this.owner = new Int32Array(0);
    var gw = this.gw = Math.ceil(CFG.W / CS) + 1;
    var gh = this.gh = Math.ceil(CFG.H / CS) + 1;
    this.cellCount = new Int32Array(gw * gh);
    this.cellStart = new Int32Array(gw * gh + 1);
    this.cellOf = new Int32Array(0);
    this.sorted = new Int32Array(0);
    this.contacts = [];   // [blobA, blobB] pairs with equal value touching
    this.contactKeys = {};
    this.impact = 0;      // strongest blob/blob impact this frame (for sfx)
  }
  SB.World = World;

  World.prototype.add = function (b) {
    this.blobs.push(b);
    this._rebuild();
    // Place particles on the start ring with the initial velocity.
    var sdt = CFG.dt / CFG.substeps;
    var r = b.curR - PR;
    for (var i = 0; i < b.n; i++) {
      var k = b.off + i;
      var d = b.parents ? unionReach(b, i) : r;
      this.X[k] = b.cx + b.ux[i] * d;
      this.Y[k] = b.cy + b.uy[i] * d;
      this.PX[k] = this.X[k] - b.vx * sdt;
      this.PY[k] = this.Y[k] - b.vy * sdt;
    }
    b.parents = null;
    return b;
  };

  /* A merged blob starts on the outline of its two parents (a peanut),
   * not on a full circle, so it cannot swallow blobs tucked into the
   * nook between them. Shape matching then inflates it to a circle. */
  function unionReach(b, i) {
    var best = PR * 0.5;
    for (var j = 0; j < b.parents.length; j++) {
      var p = b.parents[j];
      var cx = p.x - b.cx, cy = p.y - b.cy, r = p.r - PR;
      var uc = b.ux[i] * cx + b.uy[i] * cy;
      var disc = uc * uc - (cx * cx + cy * cy) + r * r;
      if (disc < 0) continue;
      var t = uc + Math.sqrt(disc);
      if (t > best) best = t;
    }
    return best;
  }

  World.prototype.remove = function (b) {
    b.dead = true;
    this.blobs = this.blobs.filter(function (o) { return o !== b; });
    this._rebuild();
  };

  World.prototype.clear = function () {
    this.blobs = [];
    this._rebuild();
  };

  World.prototype._rebuild = function () {
    var total = 0, i, b;
    for (i = 0; i < this.blobs.length; i++) total += this.blobs[i].n;
    var X = new Float32Array(total), Y = new Float32Array(total);
    var PX = new Float32Array(total), PY = new Float32Array(total);
    var owner = new Int32Array(total);
    var o = 0;
    for (i = 0; i < this.blobs.length; i++) {
      b = this.blobs[i];
      if (b.off >= 0) {
        X.set(this.X.subarray(b.off, b.off + b.n), o);
        Y.set(this.Y.subarray(b.off, b.off + b.n), o);
        PX.set(this.PX.subarray(b.off, b.off + b.n), o);
        PY.set(this.PY.subarray(b.off, b.off + b.n), o);
      }
      b.off = o;
      for (var j = 0; j < b.n; j++) owner[o + j] = i;
      o += b.n;
    }
    this.X = X; this.Y = Y; this.PX = PX; this.PY = PY;
    this.owner = owner;
    this.count = total;
    this.cellOf = new Int32Array(total);
    this.sorted = new Int32Array(total);
  };

  /* Mean position and velocity (px/s) of a blob's particles. */
  World.prototype.measure = function (b) {
    var sx = 0, sy = 0, svx = 0, svy = 0, k, end = b.off + b.n;
    for (k = b.off; k < end; k++) {
      sx += this.X[k]; sy += this.Y[k];
      svx += this.X[k] - this.PX[k]; svy += this.Y[k] - this.PY[k];
    }
    var inv = 1 / b.n, f = CFG.substeps / CFG.dt;
    b.cx = sx * inv; b.cy = sy * inv;
    b.vx = svx * inv * f; b.vy = svy * inv * f;
  };

  World.prototype.step = function () {
    var steps = CFG.substeps;
    var sdt = CFG.dt / steps;
    var g = CFG.gravity * sdt * sdt;
    var i, b;
    this.contacts.length = 0;
    this.contactKeys = {};
    this.impact = 0;

    for (i = 0; i < this.blobs.length; i++) {
      b = this.blobs[i];
      b.age += CFG.dt;
      if (b.growT < 1) {
        b.growT = Math.min(1, b.growT + CFG.dt / 0.22);
        b.curR = b.growFrom + (b.R - b.growFrom) * easeOutBack(b.growT);
      }
    }

    for (var s = 0; s < steps; s++) {
      this._integrate(g);
      this._shapeMatch();
      this._collide();
      this._walls();
    }

    for (i = 0; i < this.blobs.length; i++) this.measure(this.blobs[i]);
    if (this._untangle()) {
      for (i = 0; i < this.blobs.length; i++) this.measure(this.blobs[i]);
    }
  };

  /* Safety net: ring/ring contacts cannot separate two blobs once one ring
   * has particles inside the other. Find those and push them back out. */
  World.prototype._untangle = function () {
    var moved = false, bl = this.blobs;
    for (var i = 0; i < bl.length; i++) {
      for (var j = i + 1; j < bl.length; j++) {
        var A = bl[i], B = bl[j];
        var dx = B.cx - A.cx, dy = B.cy - A.cy;
        var lim = A.curR + B.curR - PD;
        if (dx * dx + dy * dy >= lim * lim) continue;
        if (this._pushOut(A, B)) moved = true;
        if (this._pushOut(B, A)) moved = true;
      }
    }
    return moved;
  };

  World.prototype._inside = function (A, x, y) {
    var X = this.X, Y = this.Y, o = A.off, n = A.n, inside = false;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      var xi = X[o + i], yi = Y[o + i], xj = X[o + j], yj = Y[o + j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };

  // Distance from A's centre to its particle ring along unit vector (ux, uy).
  World.prototype._reach = function (A, ux, uy) {
    var X = this.X, Y = this.Y, best = 0;
    for (var k = A.off; k < A.off + A.n; k++) {
      var d = (X[k] - A.cx) * ux + (Y[k] - A.cy) * uy;
      if (d > best) best = d;
    }
    return best;
  };

  World.prototype._pushOut = function (A, B) {
    var X = this.X, Y = this.Y, PX = this.PX, PY = this.PY, k, ux, uy, d;
    var lim2 = (A.curR + PR) * (A.curR + PR);
    if (this._inside(A, B.cx, B.cy)) {
      // B is mostly inside A: move all of B out along the centre line.
      ux = B.cx - A.cx; uy = B.cy - A.cy;
      d = Math.sqrt(ux * ux + uy * uy);
      if (d < 1e-3) { ux = 0; uy = -1; d = 0; } else { ux /= d; uy /= d; }
      var need = this._reach(A, ux, uy) + B.curR - d;
      if (need <= 0) return false;
      for (k = B.off; k < B.off + B.n; k++) {
        X[k] += ux * need; Y[k] += uy * need;
        PX[k] += ux * need; PY[k] += uy * need;
      }
      B.cx += ux * need; B.cy += uy * need;
      return true;
    }
    var moved = false;
    for (k = B.off; k < B.off + B.n; k++) {
      ux = X[k] - A.cx; uy = Y[k] - A.cy;
      var d2 = ux * ux + uy * uy;
      if (d2 > lim2 || !this._inside(A, X[k], Y[k])) continue;
      d = Math.sqrt(d2) || 1;
      ux /= d; uy /= d;
      var out = this._reach(A, ux, uy) + PR - d;
      if (out <= 0) continue;
      X[k] += ux * out; Y[k] += uy * out;
      PX[k] += ux * out; PY[k] += uy * out;
      moved = true;
    }
    return moved;
  };

  World.prototype._integrate = function (g) {
    var X = this.X, Y = this.Y, PX = this.PX, PY = this.PY;
    var maxD = PR * 0.85, damp = 0.9993;
    for (var k = 0; k < this.count; k++) {
      var vx = (X[k] - PX[k]) * damp;
      var vy = (Y[k] - PY[k]) * damp + g;
      var d2 = vx * vx + vy * vy;
      if (d2 > maxD * maxD) {
        var sc = maxD / Math.sqrt(d2);
        vx *= sc; vy *= sc;
      }
      PX[k] = X[k]; PY[k] = Y[k];
      X[k] += vx; Y[k] += vy;
    }
  };

  World.prototype._shapeMatch = function () {
    var X = this.X, Y = this.Y;
    for (var bi = 0; bi < this.blobs.length; bi++) {
      var b = this.blobs[bi], o = b.off, n = b.n, k, i;
      var cx = 0, cy = 0;
      for (k = o; k < o + n; k++) { cx += X[k]; cy += Y[k]; }
      cx /= n; cy /= n;
      // Best-fit rotation of the rest shape onto the current shape.
      var A = 0, B = 0;
      for (i = 0; i < n; i++) {
        var rx = X[o + i] - cx, ry = Y[o + i] - cy;
        A += b.ux[i] * rx + b.uy[i] * ry;
        B += b.ux[i] * ry - b.uy[i] * rx;
      }
      var ang = Math.atan2(B, A);
      b.angle = ang;
      var c = Math.cos(ang), sn = Math.sin(ang);
      var r = b.curR - PR;
      // Bigger blobs are a little softer, so they wobble more.
      var stiff = 0.16 - Math.min(0.07, b.level * 0.005);
      var dev = 0;
      for (i = 0; i < n; i++) {
        k = o + i;
        var qx = b.ux[i] * r, qy = b.uy[i] * r;
        var gx = cx + c * qx - sn * qy;
        var gy = cy + sn * qx + c * qy;
        var ex = gx - X[k], ey = gy - Y[k];
        dev += Math.abs(ex) + Math.abs(ey);
        X[k] += ex * stiff;
        Y[k] += ey * stiff;
      }
      b.squish = Math.min(1, dev / n / (r * 0.18 + 1));
    }
  };

  World.prototype._collide = function () {
    var X = this.X, Y = this.Y, PX = this.PX, PY = this.PY;
    var gw = this.gw, gh = this.gh, n = this.count;
    var cellCount = this.cellCount, cellStart = this.cellStart;
    var cellOf = this.cellOf, sorted = this.sorted, owner = this.owner;
    var blobs = this.blobs, k, c;

    cellCount.fill(0);
    for (k = 0; k < n; k++) {
      var gx = (X[k] / CS) | 0, gy = (Y[k] / CS) | 0;
      if (gx < 0) gx = 0; else if (gx >= gw) gx = gw - 1;
      if (gy < 0) gy = 0; else if (gy >= gh) gy = gh - 1;
      c = gy * gw + gx;
      cellOf[k] = c;
      cellCount[c]++;
    }
    cellStart[0] = 0;
    for (c = 0; c < gw * gh; c++) cellStart[c + 1] = cellStart[c] + cellCount[c];
    for (c = 0; c < gw * gh; c++) cellCount[c] = cellStart[c];
    for (k = 0; k < n; k++) sorted[cellCount[cellOf[k]]++] = k;

    var friction = 0.08;
    for (k = 0; k < n; k++) {
      var cc = cellOf[k];
      var cx0 = cc % gw, cy0 = (cc / gw) | 0;
      var ok = owner[k];
      for (var dy = -1; dy <= 1; dy++) {
        var yy = cy0 + dy;
        if (yy < 0 || yy >= gh) continue;
        for (var dx = -1; dx <= 1; dx++) {
          var xx = cx0 + dx;
          if (xx < 0 || xx >= gw) continue;
          var cell = yy * gw + xx;
          for (var t = cellStart[cell], end = cellStart[cell + 1]; t < end; t++) {
            var q = sorted[t];
            if (q <= k) continue;
            var oq = owner[q];
            if (oq === ok) continue;
            var ddx = X[q] - X[k], ddy = Y[q] - Y[k];
            var d2 = ddx * ddx + ddy * ddy;
            if (d2 >= PD * PD || d2 < 1e-8) continue;
            var d = Math.sqrt(d2);
            var nx = ddx / d, ny = ddy / d;
            var push = (PD - d) * 0.5;
            X[k] -= nx * push; Y[k] -= ny * push;
            X[q] += nx * push; Y[q] += ny * push;

            // Tangential friction: pull the two velocities together.
            var rvx = (X[q] - PX[q]) - (X[k] - PX[k]);
            var rvy = (Y[q] - PY[q]) - (Y[k] - PY[k]);
            var rn = rvx * nx + rvy * ny;
            var tx = rvx - rn * nx, ty = rvy - rn * ny;
            PX[k] -= tx * friction; PY[k] -= ty * friction;
            PX[q] += tx * friction; PY[q] += ty * friction;
            if (-rn > this.impact) this.impact = -rn;

            var A = blobs[ok], B = blobs[oq];
            if (A.value === B.value) {
              var key = A.id < B.id ? A.id + ':' + B.id : B.id + ':' + A.id;
              if (!this.contactKeys[key]) {
                this.contactKeys[key] = true;
                this.contacts.push([A, B]);
              }
            }
          }
        }
      }
    }
  };

  World.prototype._walls = function () {
    var X = this.X, Y = this.Y, PX = this.PX, PY = this.PY;
    var L = CFG.wallL + PR, Rr = CFG.wallR - PR;
    var F = CFG.floor - PR, T = CFG.ceil + PR;
    var wf = 0.25;
    for (var k = 0; k < this.count; k++) {
      if (X[k] < L) { X[k] = L; PY[k] += (Y[k] - PY[k]) * wf; }
      else if (X[k] > Rr) { X[k] = Rr; PY[k] += (Y[k] - PY[k]) * wf; }
      if (Y[k] > F) { Y[k] = F; PX[k] += (X[k] - PX[k]) * wf; }
      else if (Y[k] < T) { Y[k] = T; }
    }
  };

  /* Outer outline points (particle centre pushed out by its radius). */
  World.prototype.outline = function (b, out) {
    var X = this.X, Y = this.Y;
    for (var i = 0; i < b.n; i++) {
      var k = b.off + i;
      var dx = X[k] - b.cx, dy = Y[k] - b.cy;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      out[i * 2] = X[k] + dx / d * PR;
      out[i * 2 + 1] = Y[k] + dy / d * PR;
    }
    return out;
  };

  function easeOutBack(t) {
    var c1 = 1.9, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
})(window.SB = window.SB || {});
