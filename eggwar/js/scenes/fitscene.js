window.GAME = window.GAME || {};

// ============================================================================
//  피팅 도구 (2026-08-21 태현님: "내가 드래그하고 확대 축소해서 직접 씌우게")
//
//  주소에 ?fit=1 을 붙이면 이 씬으로 들어온다(일반 사용자는 못 본다).
//  맨 계란(정면/옆/뒤) 위에 투구·무기·등짐 이미지를 **직접** 올리고
//  드래그(이동) · 휠(크기) · Shift+휠(가로폭만) 로 맞춘 뒤 [저장]을 누르면
//  localStorage('eggwar.fit') 에 r 배수 값이 쌓인다 — Claude 가 그 값을 읽어
//  eggart 의 앵커 테이블에 그대로 옮긴다.
//
//  좌표계: 계란 발밑이 (0,0), r(반지름) 배수. dy 는 위가 음수.
// ============================================================================
GAME.FitScene = function () {
  Phaser.Scene.call(this, { key: 'Fit' });
};
GAME.FitScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.FitScene.prototype.constructor = GAME.FitScene;

GAME.FitScene.prototype.init = function () {
  this._cur = null;        // { key, img }
  this._view = 0;          // 0 정면 · 1 옆 · 2 뒤
  this._rows = [];
};

GAME.FitScene.prototype.create = function () {
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var self = this;
  this.cameras.main.setBackgroundColor(0xf3ecd8);
  if (GAME.GearBank) GAME.GearBank.preload(this);

  //  기준 계란 — 큼직하게(r=86), 화면 중앙 오른쪽
  this.R = 86;
  this.EX = W * 0.56;
  this.EY = H * 0.72;      // 발밑
  this._eggG = this.add.graphics().setDepth(10);
  this._drawEgg();

  //  ── 자산 목록 (왼쪽, 두 줄 스크롤 없이 격자) ──
  var KEYS = [
    'helmVanguard', 'helmRanger', 'helmWarden', 'helmPot', 'helmBand', 'helmCap',
    'helmHood', 'helmLeaf', 'helmBucket', 'helmHorns', 'helmSedge', 'helmPot2',
    'greatsword', 'bow', 'hookspear', 'roundshield', 'stonesword', 'handaxe',
    'javelin', 'towershield', 'slingimg', 'leafstaffimg', 'sapjarimg', 'ballistaimg',
    'quiverimg', 'capeimg', 'furimg', 'packimg'
  ];
  var bx = 14, byy = 44, bw = 96, bh = 30, cols = 3;
  this.add.text(bx, 10, '자산을 눌러 계란에 올리고: 드래그=이동 · 휠=크기 · Shift+휠=가로폭', {
    fontFamily: 'sans-serif', fontSize: '15px', color: '#33291b'
  });
  KEYS.forEach(function (k, i) {
    var x = bx + (i % cols) * (bw + 6), y = byy + Math.floor(i / cols) * (bh + 5);
    var t = self.add.text(x, y, k.replace('helm', '투구:').replace('img', ''), {
      fontFamily: 'sans-serif', fontSize: '12px', color: '#f3ecd8',
      backgroundColor: '#6b5537', padding: { x: 6, y: 5 }, fixedWidth: bw
    }).setDepth(50).setInteractive({ useHandCursor: true });
    t.on('pointerdown', function () { self._pick(k); });
  });

  //  ── 방향 토글 + 저장/삭제 ──
  var names = ['정면', '옆', '뒤'];
  names.forEach(function (n, i) {
    var t = self.add.text(W * 0.42 + i * 74, 12, n, {
      fontFamily: 'sans-serif', fontSize: '16px', color: '#f3ecd8',
      backgroundColor: '#4a6b3a', padding: { x: 14, y: 7 }
    }).setDepth(50).setInteractive({ useHandCursor: true });
    t.on('pointerdown', function () { self._view = i; self._drawEgg(); self._refresh(); });
  });
  var save = this.add.text(W - 220, 12, '💾 저장', {
    fontFamily: 'sans-serif', fontSize: '16px', color: '#f3ecd8',
    backgroundColor: '#a5622e', padding: { x: 16, y: 7 }
  }).setDepth(50).setInteractive({ useHandCursor: true });
  save.on('pointerdown', function () { self._save(); });
  var exp = this.add.text(W - 330, 12, '📋 결과 복사', {
    fontFamily: 'sans-serif', fontSize: '16px', color: '#f3ecd8',
    backgroundColor: '#4a5a7a', padding: { x: 12, y: 7 }
  }).setDepth(50).setInteractive({ useHandCursor: true });
  exp.on('pointerdown', function () {
    var txt = localStorage.getItem('eggwar.fit') || '{}';
    var done = function () { self._info.setText('📋 복사됨 — 채팅에 붙여넣어 주세요  ' + txt.slice(0, 120) + '…'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done, function () { self._info.setText(txt); });
    } else {
      self._info.setText(txt);                   // 복사가 막히면 그대로 보여 준다
    }
  });
  var clr = this.add.text(W - 110, 12, '↺ 이 자산 초기화', {
    fontFamily: 'sans-serif', fontSize: '13px', color: '#f3ecd8',
    backgroundColor: '#7a3a2e', padding: { x: 8, y: 8 }
  }).setDepth(50).setInteractive({ useHandCursor: true });
  clr.on('pointerdown', function () { self._clearCur(); });

  //  수치 표시
  this._info = this.add.text(W * 0.42, H - 64, '', {
    fontFamily: 'Consolas, monospace', fontSize: '15px', color: '#33291b',
    backgroundColor: '#ffffff', padding: { x: 10, y: 8 }
  }).setDepth(50);
  this._saved = this.add.text(14, H - 30, '', {
    fontFamily: 'sans-serif', fontSize: '13px', color: '#4a6b3a'
  }).setDepth(50);

  //  ── 입력: 드래그·휠 ──
  this.input.on('pointermove', function (p) {
    if (!self._cur || !p.isDown) return;
    if (p.x < W * 0.36) return;                  // 목록 영역 클릭은 무시
    self._cur.img.x = p.x;
    self._cur.img.y = p.y;
    self._refresh();
  });
  this.input.on('wheel', function (p, objs, dx, dy) {
    if (!self._cur) return;
    var f = dy > 0 ? 0.94 : 1.06;
    var ev = self.input.activePointer.event;
    if (ev && ev.shiftKey) {
      self._cur.img.scaleX *= f;                 // 가로만
    } else {
      self._cur.img.scaleX *= f;
      self._cur.img.scaleY *= f;
    }
    self._refresh();
  });

  this._loadSavedCount();
};

GAME.FitScene.prototype._drawEgg = function () {
  var g = this._eggG;
  g.clear();
  var dirs = [0, Math.PI / 2, Math.PI];        // 정면(관객) · 옆(오른쪽) · 뒤
  var art = { helm: null, gear: null, back: null, face: 'open', wide: 0.78 };
  GAME.UI.drawEggChar(g, art, this.EX, this.EY, this.R,
    GAME.CONFIG.COLORS.controller, 1, dirs[this._view], false, 0.72);
  //  발밑 십자 — 기준점이 눈에 보여야 한다
  g.lineStyle(2, 0xa5622e, 0.8);
  g.lineBetween(this.EX - 14, this.EY, this.EX + 14, this.EY);
  g.lineBetween(this.EX, this.EY - 14, this.EX, this.EY + 14);
};

GAME.FitScene.prototype._pick = function (key) {
  var texKey = 'gear-' + key;
  if (!this.textures.exists(texKey)) { this._info.setText(key + ' — 텍스처 없음'); return; }
  if (this._cur) { this._cur.img.destroy(); this._cur = null; }
  var img = this.add.image(this.EX, this.EY - this.R, texKey).setDepth(30);
  //  이미 저장된 값이 있으면 그 자리에서 시작한다
  var all = this._store();
  var rec = all[key] && all[key][this._view];
  if (rec) {
    img.x = this.EX + rec.dx * this.R;
    img.y = this.EY + rec.dy * this.R;
    img.setDisplaySize(rec.w * this.R, rec.h * this.R);
  } else {
    var tex = this.textures.get(texKey).getSourceImage();
    var h = this.R * 1.6;
    img.setDisplaySize(h * tex.width / tex.height, h);
  }
  this._cur = { key: key, img: img };
  this._refresh();
};

GAME.FitScene.prototype._store = function () {
  try { return JSON.parse(localStorage.getItem('eggwar.fit') || '{}'); }
  catch (e) { return {}; }
};

GAME.FitScene.prototype._refresh = function () {
  if (!this._cur) { this._info.setText('자산을 고르세요'); return; }
  var im = this._cur.img;
  var dx = (im.x - this.EX) / this.R;
  var dy = (im.y - this.EY) / this.R;
  var w = im.displayWidth / this.R, h = im.displayHeight / this.R;
  this._info.setText(this._cur.key + '  [' + ['정면', '옆', '뒤'][this._view] + ']\n' +
    'dx ' + dx.toFixed(2) + '  dy ' + dy.toFixed(2) +
    '  w ' + w.toFixed(2) + '  h ' + h.toFixed(2));
};

GAME.FitScene.prototype._save = function () {
  if (!this._cur) return;
  var all = this._store();
  var im = this._cur.img;
  all[this._cur.key] = all[this._cur.key] || {};
  all[this._cur.key][this._view] = {
    dx: Math.round((im.x - this.EX) / this.R * 100) / 100,
    dy: Math.round((im.y - this.EY) / this.R * 100) / 100,
    w: Math.round(im.displayWidth / this.R * 100) / 100,
    h: Math.round(im.displayHeight / this.R * 100) / 100
  };
  localStorage.setItem('eggwar.fit', JSON.stringify(all));
  this._loadSavedCount();
  this._info.setText('✅ 저장됨 — ' + this._cur.key + ' [' + ['정면', '옆', '뒤'][this._view] + ']');
};

GAME.FitScene.prototype._clearCur = function () {
  if (!this._cur) return;
  var all = this._store();
  delete all[this._cur.key];
  localStorage.setItem('eggwar.fit', JSON.stringify(all));
  this._loadSavedCount();
};

GAME.FitScene.prototype._loadSavedCount = function () {
  var all = this._store();
  var n = Object.keys(all).length;
  this._saved.setText('저장된 자산 ' + n + '개 — 다 맞추셨으면 [📋 결과 복사]를 눌러 채팅에 붙여넣어 주세요');
};
