window.GAME = window.GAME || {};

// ============================================================================
//  실시간 대전 — **전장 룰렛** (2026-09-11 태현님)
//  > "게임 장비까지 다 고르고 시작하면 주사위나 룰렛처럼 돌아가면서 … 걸리는 맵
//  >  플레이하도록할거야 … 완료되면 그 맵에대한 설명을 보여주면서 어떤맵인지 알려주면"
//
//  ⚠⚠ **결과는 돌리기 전에 이미 정해져 있다.** 서버 시드 하나로 양쪽이
//    `RtMaps.defForSeed` 를 돌려 같은 맵을 얻고, 이 화면은 그 결과로 **가는 길**을
//    보여 줄 뿐이다. 여기서 난수를 돌리면 두 사람이 다른 전장을 보게 된다.
//
//  ⚠⚠ **건너뛰기를 안 둔다.** 한쪽만 건너뛰면 그만큼 먼저 전투에 들어가고, 그 시간은
//    록스텝이 그대로 스톨로 먹는다(들어가자마자 멈춰 있는 판이 된다).
//    양쪽이 **같은 길이**를 쓰는 것이 여기서는 기다림보다 싸다.
// ============================================================================
GAME.RtSpinScene = function () {
  Phaser.Scene.call(this, { key: 'RtSpin' });
};
GAME.RtSpinScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.RtSpinScene.prototype.constructor = GAME.RtSpinScene;

GAME.RtSpinScene.prototype.SPIN_MS = 2200;   //  도는 시간
GAME.RtSpinScene.prototype.HOLD_MS = 2600;   //  설명을 보여 주는 시간

GAME.RtSpinScene.prototype.init = function (data) {
  //  ⚠ 씬 인스턴스는 재사용된다 — 이 저장소가 다섯 번 같은 사고를 겪은 자리다.
  this.payload = data || {};
  this._t = 0;
  this._done = false;
  this._rows = null;
  this._card = null;
};

GAME.RtSpinScene.prototype.create = function () {
  var UI = GAME.UI;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT, P = !!GAME.CONFIG.PHONE;
  var RM = GAME.RtMaps;

  var seed = (this.payload.rt && this.payload.rt.seed) || 0;
  this.def = RM.defForSeed(seed);
  this.target = RM.LIST.indexOf(this.def);

  var g = this.add.graphics();
  g.fillStyle(0x1a140c, 1).fillRect(0, 0, W, H);
  g.setDepth(0);

  UI.text(this, W / 2, P ? 22 : 40, '이번 전장을 뽑는 중…',
    { size: P ? 'subhead' : 'head', color: '#f6ead2', origin: 0.5, originY: 0 });

  //  ── 룰렛 — 맵 이름이 세로로 흘러가고 가운데 표시선에 걸린다 ──────────────
  //  ⚠ 칸 높이는 **글자 크기에서** 정한다 — 화면에서 역산하면 폰에서 막 눈다
  //    (특성 격자에서 이미 같은 사고를 겪었다).
  this.rowH = P ? 34 : 46;
  this.midY = H * 0.52;
  var cw = Math.min(W - 40, P ? 360 : 520);

  var win = this.add.graphics();
  win.fillStyle(0xf6ead2, 0.10).fillRoundedRect(W / 2 - cw / 2, this.midY - this.rowH * 1.9, cw, this.rowH * 3.8, 10);
  win.lineStyle(2, 0x8a6a3a, 0.9).strokeRoundedRect(W / 2 - cw / 2, this.midY - this.rowH * 1.9, cw, this.rowH * 3.8, 10);
  win.setDepth(1);

  //  가운데 표시선 — 여기 걸리는 것이 내 전장이다.
  var mk = this.add.graphics();
  mk.fillStyle(0xd88a2a, 0.22).fillRect(W / 2 - cw / 2 + 2, this.midY - this.rowH / 2, cw - 4, this.rowH);
  mk.lineStyle(2, 0xd88a2a, 0.95).strokeRect(W / 2 - cw / 2 + 2, this.midY - this.rowH / 2, cw - 4, this.rowH);
  mk.setDepth(2);

  //  칸은 맵 수의 여러 배를 길게 쌓는다(감기면서 돌아가는 느낌).
  this._rows = [];
  var N = RM.LIST.length;
  var total = N * 4 + this.target + 1;
  for (var i = 0; i < total; i++) {
    var d = RM.LIST[i % N];
    var t = UI.text(this, W / 2, 0, d.name + '   ' + RM.pctOf(d).toFixed(0) + '%',
      { size: P ? 'body' : 'subhead', color: '#f6ead2', origin: 0.5 });
    t.setDepth(3);
    this._rows.push(t);
  }
  this._total = total;
  this._layout(0);

  UI.text(this, W / 2, H - (P ? 26 : 44), '양쪽 모두 같은 전장으로 들어갑니다',
    { size: 'micro', color: '#a89a86', origin: 0.5, originY: 0 });
};

//  진행률(0~1)에서 칸 자리를 잡는다. 끝에서 정확히 target 이 가운데 온다.
GAME.RtSpinScene.prototype._layout = function (p) {
  //  감속(easeOutCubic) — 뒤로 갈수록 «걸릴 것 같은» 느낌이 난다.
  var e = 1 - Math.pow(1 - p, 3);
  var travel = (this._total - 1) * e;
  for (var i = 0; i < this._rows.length; i++) {
    var r = this._rows[i];
    if (!r || !r.scene) continue;
    r.y = this.midY + (i - travel) * this.rowH;
    var d = Math.abs(r.y - this.midY) / (this.rowH * 2.2);
    r.setAlpha(Math.max(0, 1 - d));
  }
};

GAME.RtSpinScene.prototype.update = function (time, delta) {
  if (this._done) return;
  this._t += delta;
  if (this._t < this.SPIN_MS) { this._layout(this._t / this.SPIN_MS); return; }
  this._layout(1);
  if (!this._card) { this._reveal(); return; }
  if (this._t >= this.SPIN_MS + this.HOLD_MS) {
    this._done = true;
    var sm = GAME.game.scene;
    var pay = this.payload;
    sm.getScenes(true).forEach(function (s) { sm.stop(s.scene.key); });
    sm.start('Battle', { rt: pay.rt, heroKey: pay.heroKey, formationId: null });
  }
};

//  걸린 맵의 설명 — "어떤맵인지 알려주면 되겠네".
GAME.RtSpinScene.prototype._reveal = function () {
  var UI = GAME.UI;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT, P = !!GAME.CONFIG.PHONE;
  var self = this, d = this.def;

  //  ⚠ 칸을 글자에서 역산한다(고정 높이 금지 — 이 저장소의 반복 함정).
  var cw = Math.min(W - 28, P ? 380 : 520), wrap = cw - (P ? 24 : 32);
  var texts = [], y = 0, objs = [];
  function put(t, o) {
    o.origin = 0.5; o.originY = 0;
    var x = UI.text(self, W / 2, y, t, o);
    x.setAlign('center'); x.setWordWrapWidth(wrap); x.setDepth(21);
    texts.push(x); objs.push(x);
    y += x.height + (P ? 4 : 6);
    return x;
  }
  put('✦ ' + d.name, { size: P ? 'subhead' : 'head', color: '#8a3b12' });
  put(d.desc, { size: 'caption', color: '#241a10' });
  (d.rules || []).forEach(function (ln) { put(ln, { size: 'micro', color: '#241a10' }); });
  put('등장 확률 ' + GAME.RtMaps.pctOf(d).toFixed(0) + '%', { size: 'micro', color: '#6b5a44' });

  var pad = P ? 12 : 16, ch = y + pad * 2 - (P ? 4 : 6);
  var top = H / 2 - ch / 2;
  for (var i = 0; i < texts.length; i++) texts[i].y += top + pad;

  var g = this.add.graphics();
  g.fillStyle(0x1a140c, 0.72).fillRect(0, 0, W, H);
  g.fillStyle(0xf6ead2, 0.99).fillRoundedRect(W / 2 - cw / 2, top, cw, ch, 10);
  g.lineStyle(2, 0x5a4632, 1).strokeRoundedRect(W / 2 - cw / 2, top, cw, ch, 10);
  g.setDepth(20);
  objs.push(g);
  this._card = objs;
};

GAME.RtSpinScene.prototype.shutdown = function () {};
