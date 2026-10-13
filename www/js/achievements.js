/*
 * The original's 30 achievements and the rules that unlock them
 * (docs/original-spec.md, section 13). Each unlocked achievement is worth
 * one colour-theme unlock token.
 */
(function (SB) {
  'use strict';

  var D = [
    ['score_0', 'score 0', 'Finish a game with a score of exactly 0.', 'exact', 0],
    ['score_10', 'score 10', 'Finish a game with a score of exactly 10.', 'exact', 10],
    ['score_100', 'score 100', 'Finish a game with a score of exactly 100.', 'exact', 100],
    ['score_1000', 'score 1000', 'Finish a game with a score of exactly 1000.', 'exact', 1000],
    ['8192', '8192', 'Have an 8192 sobo.', 'reach', 8192],
    ['bar_64', 'bar 64', 'Have a 64 sobo on the float bar.', 'bar', 64],
    ['bar_128', 'bar 128', 'Have a 128 sobo on the float bar.', 'bar', 128],
    ['bar_256', 'bar 256', 'Have a 256 sobo on the float bar.', 'bar', 256],
    ['bar_512', 'bar 512', 'Have a 512 sobo on the float bar.', 'bar', 512],
    ['air_32', 'air merge 32', 'Merge into a 32 sobo without it touching anything for a quarter second.', 'air', 32],
    ['air_64', 'air merge 64', 'Merge into a 64 sobo without it touching anything for a quarter second.', 'air', 64],
    ['air_128', 'air merge 128', 'Merge into a 128 sobo without it touching anything for a quarter second.', 'air', 128],
    ['air_256', 'air merge 256', 'Merge into a 256 sobo without it touching anything for a quarter second.', 'air', 256],
    ['clean_512', 'clean 512', 'Have a lone 512 sobo in the stack.', 'clean', 512],
    ['clean_1024', 'clean 1024', 'Have a lone 1024 sobo in the stack.', 'clean', 1024],
    ['clean_2048', 'clean 2048', 'Have a lone 2048 sobo in the stack.', 'clean', 2048],
    ['clean_4096', 'clean 4096', 'Have a lone 4096 sobo in the stack.', 'clean', 4096],
    ['6x_128', '6x 128', 'Have 6x 128 sobos for 10 seconds.', 'hold', 128, 6],
    ['5x_256', '5x 256', 'Have 5x 256 sobos for 10 seconds.', 'hold', 256, 5],
    ['4x_512', '4x 512', 'Have 4x 512 sobos for 10 seconds.', 'hold', 512, 4],
    ['3x_1024', '3x 1024', 'Have 3x 1024 sobos for 10 seconds.', 'hold', 1024, 3],
    ['121212', '121212', 'Without merging any sobo above 2, have 6 sobos in the stack for 10 seconds without interruption.', 'nomerge', 2, 6],
    ['1212121212', '1212121212', 'Without merging any sobo above 2, have 10 sobos in the stack for 10 seconds without interruption.', 'nomerge', 2, 10],
    ['chain_1_16', 'chain from 1 to 16', 'Have a lineage of sobos merging from 1 to 16 without interruption.', 'chain', 1, 16],
    ['chain_1_128', 'chain from 1 to 128', 'Have a lineage of sobos merging from 1 to 128 without interruption.', 'chain', 1, 128],
    ['chain_1_512', 'chain from 1 to 512', 'Have a lineage of sobos merging from 1 to 512 without interruption.', 'chain', 1, 512],
    ['chain_32_1024', 'chain from 32 to 1024', 'Have a lineage of sobos merging from 32 to 1024 without interruption.', 'chain', 32, 1024],
    ['chain_128_2048', 'chain from 128 to 2048', 'Have a lineage of sobos merging from 128 to 2048 without interruption.', 'chain', 128, 2048],
    ['chain_512_4096', 'chain from 512 to 4096', 'Have a lineage of sobos merging from 512 to 4096 without interruption.', 'chain', 512, 4096],
    ['suncle', 'praise the suncle', 'Get a safety-spawn with both spawners blocked.', 'event']
  ];
  var DEFS = D.map(function (d) { return { id: d[0], name: d[1], desc: d[2], kind: d[3], a: d[4], b: d[5] }; });
  var HOLD = 10, AIR_TICKS = 15;

  /* Watches one game. `unlock(id)` is called once per new achievement. */
  function Tracker(unlock) {
    this.unlock = unlock;
    this.reset();
  }
  Tracker.prototype.reset = function () {
    this.air = [];          // {sobo, ticks}
    this.holdT = {};        // def id -> seconds
    this.bigMerge = false;  // a merge produced a value above 2 this game
    this.chains = [];       // {start, head, value}
  };
  Tracker.prototype._each = function (kind, fn) {
    for (var i = 0; i < DEFS.length; i++) if (DEFS[i].kind === kind) fn(DEFS[i]);
  };
  Tracker.prototype.created = function (s) {
    var self = this;
    this._each('reach', function (d) { if (s.value === d.a) self.unlock(d.id); });
  };
  Tracker.prototype.barJoin = function (s) {
    var self = this;
    this._each('bar', function (d) { if (s.value === d.a) self.unlock(d.id); });
  };
  Tracker.prototype.merge = function (A, B, N, onBar) {
    var self = this;
    this.created(N);
    if (N.value > 2) this.bigMerge = true;
    if (!onBar) this.air.push({ sobo: N, ticks: 0 });
    // Lineages: continue a chain whose head was consumed, start new ones.
    var next = [];
    for (var i = 0; i < this.chains.length; i++) {
      var c = this.chains[i];
      if (c.head === A || c.head === B) { c.head = N; c.value = N.value; next.push(c); }
      else if (!c.head.dead) next.push(c);
    }
    this._each('chain', function (d) {
      if (N.value === d.a * 2 && !next.some(function (c) { return c.start === d.a && c.head === N; })) {
        next.push({ start: d.a, head: N, value: N.value });
      }
    });
    this.chains = next;
    this._each('chain', function (d) {
      for (var k = 0; k < next.length; k++) if (next[k].start === d.a && next[k].value === d.b) self.unlock(d.id);
    });
  };
  Tracker.prototype.launch = function () { this.chains = []; };
  Tracker.prototype.safetySpawn = function () { this.unlock('suncle'); };
  Tracker.prototype.gameOver = function (score) {
    var self = this;
    this._each('exact', function (d) { if (score === d.a) self.unlock(d.id); });
  };
  /* Once per physics tick while playing. */
  Tracker.prototype.tick = function (mode, dt) {
    var self = this, all = mode.world.sobos, i;
    for (i = this.air.length - 1; i >= 0; i--) {
      var a = this.air[i];
      if (a.sobo.dead || mode.onBar(a.sobo) || a.sobo.touched) { this.air.splice(i, 1); continue; }
      if (++a.ticks >= AIR_TICKS) {
        this.air.splice(i, 1);
        this._each('air', function (d) { if (a.sobo.value === d.a) self.unlock(d.id); });
      }
    }
    if (mode.stack.length === 1) {
      var lone = mode.stack[0];
      this._each('clean', function (d) { if (lone.value === d.a) self.unlock(d.id); });
    }
    var counts = {};
    for (i = 0; i < all.length; i++) counts[all[i].value] = (counts[all[i].value] || 0) + 1;
    this._each('hold', function (d) { self._hold(d, (counts[d.a] || 0) >= d.b, dt); });
    this._each('nomerge', function (d) { self._hold(d, !self.bigMerge && mode.stack.length >= d.b, dt); });
  };
  Tracker.prototype._hold = function (d, ok, dt) {
    if (!ok) { this.holdT[d.id] = 0; return; }
    this.holdT[d.id] = (this.holdT[d.id] || 0) + dt;
    if (this.holdT[d.id] >= HOLD) this.unlock(d.id);
  };

  SB.Achievements = { DEFS: DEFS, Tracker: Tracker };
})(window.SB = window.SB || {});
