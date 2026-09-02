window.GAME = window.GAME || {};

// ============================================================================
//  가이드 오버레이 씬 (key 'Guide') — Battle **위에 병렬로** 뜬다 (2026-09-02, 갈래 B)
//
//  · 진입: js/guide.js `arm()` 이 Battle 의 create 이벤트에서 `scene.launch('Guide')`.
//  · 그림만 담당한다 — 단계·판정은 GAME.Guide(순수 함수). Battle 은 **읽기만**
//    (`GAME.game.scene.getScene('Battle')` 의 hero/state/pad/hud/skillBoxes).
//  · 입력은 통과한다: 이 씬의 상호작용 객체는 [건너뛰기] 하나뿐이라 나머지 터치·클릭은
//    아래 Battle 이 그대로 받는다(Phaser 는 맞은 객체가 없으면 다음 씬으로 흘린다).
//  · Battle 이 shutdown 되면 스스로 stop. 두 번 안 뜬다(Onboard 기록은 guide.js).
//  · 손가락/화살표는 전부 벡터(Graphics). 가리키는 자리는 **실측 좌표**다 —
//    스틱은 pad.stick.homeX/Y, 스킬 Q 는 pad 버튼 원 / PC 스킬 칸 rect 에서 읽는다.
//    고정값을 박으면 좌우 반전(flip)·배율(scale) 설정에서 엉뚱한 곳을 가리킨다.
//  ⚠ 씬 인스턴스는 재사용된다 — 상태는 전부 init 에서 되돌린다.
// ============================================================================
GAME.GuideScene = function () {
  Phaser.Scene.call(this, { key: 'Guide' });
};
GAME.GuideScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.GuideScene.prototype.constructor = GAME.GuideScene;

GAME.GuideScene.prototype.init = function (data) {
  this._mode = (data && data.mode) || 'tower1';
  //  create 엔 data 가 없다 — 여기서 읽고, 다음 진입이 옛 인자를 물려받지 않게 비운다.
  if (this.scene && this.scene.settings) this.scene.settings.data = {};
  this._battle = null;
  this._run = null;
  this._band = null;
  this._skip = null;
  this._g = null;
  this._chk = null;
  this._pulse = 0;
  this._closing = false;
  this._onBattleShutdown = null;
  this._endedAt = null;
};

GAME.GuideScene.prototype.create = function () {
  var self = this;
  var bs = GAME.Guide && GAME.Guide._battle();
  if (!bs || !bs.scene || !bs.scene.isActive() || !bs.hero || !bs.state) { this.scene.stop(); return; }
  this._battle = bs;
  this.scene.bringToTop();

  //  뒤로가기 이력(js/pwa.js) — main.js 의 create 훅이 curKey 를 'Guide' 로 바꾼다.
  //  그대로 두면 하드웨어 뒤로가기가 "전투 중" 확인을 건너뛰고 Guide 의 ScenePlugin 으로
  //  Tower 를 켜 **Battle 이 밑에서 계속 돈다.** 훅 다음 순서로 Battle 로 되돌린다.
  this.events.once('create', function () {
    if (GAME.Nav && GAME.Nav.onScene) { try { GAME.Nav.onScene(bs); } catch (e) {} }
  });

  //  Battle 이 사라지면 같이 정리한다.
  this._onBattleShutdown = function () { self._close(); };
  bs.events.once('shutdown', this._onBattleShutdown);
  this.events.once('shutdown', function () {
    if (self._battle && self._battle.events && self._onBattleShutdown) {
      self._battle.events.off('shutdown', self._onBattleShutdown);
    }
    self._onBattleShutdown = null;
    self._battle = null;
  });

  this._run = GAME.Guide.createRun(bs.hero);

  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var SMALL = GAME.CONFIG.SMALL;
  var fs = SMALL ? 16 : 20;
  //  띠는 HUD 실측 바닥 아래 — 고정 y 를 박으면 보스 층·폰에서 HUD 를 파고든다.
  var bandY = (bs.hud && typeof bs.hud.bottom === 'number') ? bs.hud.bottom + (SMALL ? 6 : 10) : Math.round(H * 0.2);

  //  [건너뛰기] — 우상단. 텍스트 배경 내장(tutorial.js 와 같은 이유: 이 층위에서
  //  rect+text 두 몸은 어긋날 수 있다).
  this._skip = this.add.text(W - (SMALL ? 10 : 16), bandY, '건너뛰기', {
    fontFamily: GAME.CONFIG.FONT, fontSize: (SMALL ? 14 : 16) + 'px',
    color: '#e8dcc2', backgroundColor: 'rgba(30,24,12,0.72)', padding: { x: 12, y: 7 }
  }).setOrigin(1, 0).setDepth(20).setScrollFactor(0);
  this._skip.setInteractive({ useHandCursor: true });
  this._skip.on('pointerdown', function (p) {
    if (p && p.event && p.event.stopPropagation) p.event.stopPropagation();
    if (!self._run || self._run.finished) return;
    GAME.Guide.skip(self._run);
    self._close();
  });

  //  단계 띠 — 짧게, 상단.
  this._band = this.add.text(W / 2, bandY, '', {
    fontFamily: GAME.CONFIG.FONT, fontSize: fs + 'px',
    color: '#fff6df', backgroundColor: 'rgba(30,24,12,0.78)', padding: { x: 14, y: 8 }
  }).setOrigin(0.5, 0).setDepth(10).setScrollFactor(0);
  this._band.setWordWrapWidth(W - 2 * (this._skip.width + 28));
  this._setBand();

  this._g = this.add.graphics().setDepth(5).setScrollFactor(0);
};

//  띠 문구 갱신 + 건너뛰기와 안 겹치게 왼쪽으로 민다(문구 최악 케이스 대비).
GAME.GuideScene.prototype._setBand = function (txt) {
  if (!this._band || !this._band.scene) return;
  var W = GAME.CONFIG.WIDTH;
  this._band.setText(txt !== undefined ? txt : GAME.Guide.stepText(this._run.step, !!GAME.isTouch));
  var limit = this._skip.x - this._skip.width - 10;
  var cx = W / 2;
  if (cx + this._band.width / 2 > limit) cx = limit - this._band.width / 2;
  this._band.x = Math.max(this._band.width / 2 + 8, cx);
};

//  단계 통과 — ✓ 가 튕기고 다음 문구로.
GAME.GuideScene.prototype._tick = function () {
  var self = this;
  if (!this._band || !this._band.scene) return;
  var SMALL = GAME.CONFIG.SMALL;
  if (this._chk && this._chk.scene) this._chk.destroy();
  this._chk = this.add.text(this._band.x + this._band.width / 2 + 6, this._band.y + this._band.height / 2, '✓', {
    fontFamily: GAME.CONFIG.FONT, fontSize: (SMALL ? 26 : 34) + 'px',
    color: '#7ef0a8', stroke: '#0e2a18', strokeThickness: 4
  }).setOrigin(0, 0.5).setDepth(12).setScrollFactor(0).setScale(0.3).setAlpha(0);
  this.tweens.add({ targets: this._chk, scale: 1.25, alpha: 1, duration: 180, ease: 'Back.easeOut',
    onComplete: function () {
      if (!self._chk || !self._chk.scene) return;
      self.tweens.add({ targets: self._chk, scale: 1, duration: 120 });
      self.tweens.add({ targets: self._chk, alpha: 0, delay: 520, duration: 220,
        onComplete: function () { if (self._chk && self._chk.scene) { self._chk.destroy(); self._chk = null; } } });
    } });
  this.tweens.add({ targets: this._band, scaleX: 1.06, scaleY: 1.06, duration: 110, yoyo: true });
  if (GAME.Sound && GAME.Sound.play) { try { GAME.Sound.play('coinPick'); } catch (e) {} }
  this._setBand();
};

GAME.GuideScene.prototype._end = function (won) {
  if (this._g && this._g.scene) this._g.clear();
  this._endedAt = 0;
  if (won) this._setBand('🎉 첫 승리! 가이드 완료');
  else this._setBand('다음엔 예고 원을 피해 보세요 — 다시 도전!');
};

GAME.GuideScene.prototype._close = function () {
  if (this._closing) return;
  this._closing = true;
  if (this.scene && this.scene.isActive && this.scene.isActive()) this.scene.stop();
};

GAME.GuideScene.prototype.update = function (time, delta) {
  var bs = this._battle;
  if (this._closing) return;
  if (!bs || !bs.scene || !bs.scene.isActive() || !bs.hero || !bs.state) { this._close(); return; }
  var run = this._run;
  if (!run) return;
  if (run.finished) {
    //  Battle 이 종료를 3초 붙잡는 동안 띠만 남긴다. 그 뒤 Battle shutdown 이 닫는다 —
    //  혹시 안 오면(관전 유지 등) 스스로 닫는다.
    if (this._endedAt !== null) { this._endedAt += delta; if (this._endedAt > 4000) this._close(); }
    return;
  }
  var ev = GAME.Guide.advance(run, bs.hero, bs.state, delta);
  if (ev && ev.passed) this._tick();
  if (ev && ev.finished) {
    GAME.Guide.complete(run, ev.won);
    this._end(ev.won);
    return;
  }
  this._pulse += delta;
  this._drawPointer(bs, run);
};

// ── 가리키기 ────────────────────────────────────────────────────────────────
//  전장 좌표 → 화면: Iso 투영 뒤 Battle 의 줌(worldLayer scale/offset)까지 따른다.
GAME.GuideScene.prototype._toScreen = function (bs, wx, wy) {
  var p = GAME.Iso.toScreen(wx, wy);
  var z = bs._zoom || 1;
  var o = bs._zoomOff || { x: 0, y: 0 };
  return { x: p.x * z + o.x, y: p.y * z + o.y, z: z };
};

GAME.GuideScene.prototype._nearestEnemy = function (bs) {
  var h = bs.hero, best = null, bd = Infinity;
  var us = bs.state.units || [];
  for (var i = 0; i < us.length; i++) {
    var u = us[i];
    if (!u || !u.alive || u.side === h.side) continue;
    var dx = u.x - h.x, dy = u.y - h.y, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = u; }
  }
  return best;
};

//  현재 단계가 가리킬 자리 — { x, y, rx, ry, kind: 'hand'|'arrow'|'keys', from: 'br'|'auto' }
GAME.GuideScene.prototype._target = function (bs, run) {
  var step = GAME.Guide.STEPS[run.step];
  var pad = bs.pad, h = bs.hero, p;
  if (step.target === 'stick') {
    if (pad && pad.stick && typeof pad.stick.homeX === 'number') {
      var sr = (pad.stickRing && pad.stickRing.radius) || 60;
      return { x: pad.stick.homeX, y: pad.stick.homeY, rx: sr, ry: sr, kind: 'hand' };
    }
    p = this._toScreen(bs, h.x, h.y);
    return { x: p.x, y: p.y, rx: 30 * p.z, ry: 22 * p.z, kind: 'keys' };
  }
  if (step.target === 'skillQ') {
    if (pad && pad._find) {
      var b = pad._find('Q') || (pad.buttons && pad.buttons[0]);
      if (b && b.circle) return { x: b.circle.x, y: b.circle.y, rx: b.r || 30, ry: b.r || 30, kind: 'hand' };
    }
    if (bs.skillBoxes && bs.skillBoxes[0] && bs.skillBoxes[0].rect) {
      var r = bs.skillBoxes[0].rect;
      return { x: r.x, y: r.y, rx: r.width / 2, ry: r.height / 2, kind: 'arrow', rect: true };
    }
  }
  if (step.target === 'telegraph') {
    var ds = GAME.Guide.dodgeState(bs.state, h);
    if (ds.nearest) {
      p = this._toScreen(bs, ds.nearest.x, ds.nearest.y);
      var tr = (ds.nearest.r || 40) * p.z;
      //  달아날 방향 — 예고 중심에서 영웅 쪽 바깥으로
      var ang = Math.atan2(h.y - ds.nearest.y, h.x - ds.nearest.x);
      return { x: p.x, y: p.y, rx: tr, ry: tr * GAME.Iso.TILT, kind: 'escape', ang: ang, danger: !ds.outside };
    }
    p = this._toScreen(bs, h.x, h.y);
    return { x: p.x, y: p.y, rx: 30 * p.z, ry: 22 * p.z, kind: 'ring' };
  }
  //  'enemy'
  var e = this._nearestEnemy(bs);
  if (e) {
    p = this._toScreen(bs, e.x, e.y);
    var er = ((e.radius || (e.def && e.def.radius) || 14) + 10) * p.z;
    return { x: p.x, y: p.y, rx: er, ry: er * GAME.Iso.TILT, kind: 'arrow' };
  }
  return null;
};

GAME.GuideScene.prototype._drawPointer = function (bs, run) {
  var g = this._g;
  if (!g || !g.scene) return;
  g.clear();
  var t = this._target(bs, run);
  if (!t) return;
  var SMALL = GAME.CONFIG.SMALL;
  var s = SMALL ? 0.8 : 1;
  var ph = (Math.sin(this._pulse / 260) + 1) / 2;    // 0..1 맥동
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;

  //  ① 강조 고리 — 자리를 먼저 밝힌다
  var ringCol = t.danger ? 0xff5a4e : 0xffd166;
  g.lineStyle(3 + 2 * ph, ringCol, 0.85);
  if (t.rect) g.strokeRoundedRect(t.x - t.rx - 3 - 2 * ph, t.y - t.ry - 3 - 2 * ph, (t.rx + 3 + 2 * ph) * 2, (t.ry + 3 + 2 * ph) * 2, 8);
  else g.strokeEllipse(t.x, t.y, (t.rx + 6 + 8 * ph) * 2, (t.ry + 6 + 8 * ph) * 2);

  if (t.kind === 'ring') return;

  if (t.kind === 'escape') {
    //  ④ 예고 밖으로 — 원 가장자리에서 바깥으로 뻗는 굵은 화살표
    var ax = t.x + Math.cos(t.ang) * t.rx, ay = t.y + Math.sin(t.ang) * t.ry;
    var len = (46 + 22 * ph) * s;
    this._arrow(g, ax, ay, ax + Math.cos(t.ang) * len, ay + Math.sin(t.ang) * len, 9 * s, ringCol);
    return;
  }

  if (t.kind === 'hand') {
    //  손가락 — 오른쪽 아래에서 들어와 목표를 찍는다. 손끝이 목표 가장자리에 닿는다.
    var d = (18 + 14 * ph) * s;
    var fx = t.x + t.rx * 0.35 + d, fy = t.y + t.ry * 0.35 + d;
    this._hand(g, fx, fy, s);
    return;
  }

  if (t.kind === 'keys') {
    //  PC 이동 — 영웅 옆에 방향키 넉 장
    this._keys(g, t.x + (t.rx + 34) * s, t.y - 6 * s, s);
    return;
  }

  //  'arrow' — 목표에 가까운 화면 모서리 쪽에서 날아와 꽂힌다(화면 밖으로 안 나가게)
  var fromX = t.x < W / 2 ? 1 : -1, fromY = t.y < H / 2 ? 1 : -1;
  var ang2 = Math.atan2(-fromY, -fromX);
  var gap = Math.max(t.rx, t.ry) + (10 + 12 * ph) * s;
  var L = 44 * s;
  var tx = t.x + Math.cos(ang2) * gap, ty = t.y + Math.sin(ang2) * gap;
  this._arrow(g, tx + Math.cos(ang2) * L, ty + Math.sin(ang2) * L, tx, ty, 8 * s, ringCol);
};

//  굵은 화살표 (x0,y0)→(x1,y1), 촉 포함. 잉크 외곽선 + 크림 면.
GAME.GuideScene.prototype._arrow = function (g, x0, y0, x1, y1, w, col) {
  var ang = Math.atan2(y1 - y0, x1 - x0);
  var head = w * 2.4;
  var bx = x1 - Math.cos(ang) * head, by = y1 - Math.sin(ang) * head;
  var nx = -Math.sin(ang), ny = Math.cos(ang);
  var pts = [
    x0 + nx * w * 0.5, y0 + ny * w * 0.5,
    bx + nx * w * 0.5, by + ny * w * 0.5,
    bx + nx * head * 0.75, by + ny * head * 0.75,
    x1, y1,
    bx - nx * head * 0.75, by - ny * head * 0.75,
    bx - nx * w * 0.5, by - ny * w * 0.5,
    x0 - nx * w * 0.5, y0 - ny * w * 0.5
  ];
  g.lineStyle(4, 0x1a120a, 0.9);
  g.fillStyle(col || 0xffd166, 1);
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (var i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
  g.strokePath();
  g.fillPath();
};

//  가리키는 손 — 손끝이 (fx,fy). 손바닥은 오른쪽 아래.
GAME.GuideScene.prototype._hand = function (g, fx, fy, s) {
  var skin = 0xffe3b8, ink = 0x2a1c0c;
  var fw = 13 * s, fl = 30 * s;            // 검지 폭·길이
  var pw = 30 * s, ph2 = 26 * s;           // 손바닥
  //  손가락 방향: 왼쪽 위(목표)를 향한다
  var ang = -Math.PI * 0.75;
  var cx = fx - Math.cos(ang) * fl, cy = fy - Math.sin(ang) * fl;   // 검지 뿌리
  //  손바닥
  g.lineStyle(3, ink, 1);
  g.fillStyle(skin, 1);
  g.fillRoundedRect(cx - pw * 0.15, cy - ph2 * 0.2, pw, ph2, 9 * s);
  g.strokeRoundedRect(cx - pw * 0.15, cy - ph2 * 0.2, pw, ph2, 9 * s);
  //  접힌 손가락 셋 — 손바닥 위쪽 가장자리의 작은 마디
  g.fillStyle(ink, 0.35);
  for (var i = 0; i < 3; i++) {
    g.fillEllipse(cx + pw * 0.28 + i * pw * 0.22, cy - ph2 * 0.05, pw * 0.16, ph2 * 0.22);
  }
  //  엄지
  g.fillStyle(skin, 1);
  g.fillEllipse(cx - pw * 0.2, cy + ph2 * 0.45, pw * 0.42, ph2 * 0.3);
  g.strokeEllipse(cx - pw * 0.2, cy + ph2 * 0.45, pw * 0.42, ph2 * 0.3);
  //  검지 — 굵은 선으로 뿌리→끝, 끝은 둥글게
  g.lineStyle(fw + 3 * s, ink, 1);
  g.lineBetween(cx, cy, fx, fy);
  g.lineStyle(fw, skin, 1);
  g.lineBetween(cx, cy, fx, fy);
  g.fillStyle(skin, 1);
  g.fillCircle(fx, fy, fw / 2);
  g.lineStyle(3, ink, 1);
  g.strokeCircle(fx, fy, fw / 2 + 1.5 * s);
  //  손끝 반짝
  g.fillStyle(0xffffff, 0.9);
  g.fillCircle(fx - 2 * s, fy - 2 * s, 2.2 * s);
};

//  방향키 넉 장 — 위 한 장, 아래 세 장. 가운데 아래가 (x,y).
GAME.GuideScene.prototype._keys = function (g, x, y, s) {
  var k = 22 * s, gap = 4 * s, r = 4 * s;
  var ink = 0x2a1c0c, face = 0xfff3d6;
  var self = this;
  function key(kx, ky, ang) {
    g.lineStyle(2.5, ink, 1);
    g.fillStyle(face, 1);
    g.fillRoundedRect(kx - k / 2, ky - k / 2, k, k, r);
    g.strokeRoundedRect(kx - k / 2, ky - k / 2, k, k, r);
    //  화살촉
    var a = ang, hl = k * 0.28;
    var tx = kx + Math.cos(a) * hl, ty = ky + Math.sin(a) * hl;
    var bx = kx - Math.cos(a) * hl * 0.6, by = ky - Math.sin(a) * hl * 0.6;
    self._arrow(g, bx, by, tx, ty, 3.2 * s, 0xffd166);
  }
  key(x, y - k - gap, -Math.PI / 2);
  key(x - k - gap, y, Math.PI);
  key(x, y, Math.PI / 2);
  key(x + k + gap, y, 0);
};
