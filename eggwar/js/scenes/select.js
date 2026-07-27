window.GAME = window.GAME || {};

GAME.SelectScene = function () {
  Phaser.Scene.call(this, { key: 'Select' });
};
GAME.SelectScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.SelectScene.prototype.constructor = GAME.SelectScene;

GAME.SelectScene.prototype.create = function () {
  var C = GAME.CONFIG.COLORS;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var P = GAME.CONFIG.PORTRAIT;
  var self = this;
  var pad = P ? 17 : 90;

  this.cameras.main.setBackgroundColor(C.bg);

  GAME.UI.label(this, W / 2, P ? 28 : 46, '도전할 진형 선택', P ? 22 : 32, C.text, 0.5);
  GAME.UI.label(this, W / 2, P ? 58 : 90,
    'AI 진형은 솔직히 표시합니다. 예산은 상대와 동일합니다.', P ? 15 : 15, C.textDim, 0.5)
    .setWordWrapWidth(W - 30);

  var top = P ? 84 : 128;
  GAME.UI.button(this, W / 2, top + 26, Math.min(W - 40, 260), GAME.UI.BTN_H_SM || 52, '🎲 랜덤 매칭', function () {
    var f = GAME.Formations.random();
    if (f) self.scene.start('Draft', { formationId: f.id });
  }, { fill: 0x2a2440, line: 0x9b8cf0, hover: 0x372f52, color: C.accentAlt, fontSize: P ? 17 : 17 });

  var all = GAME.Formations.loadAll();
  var startY = top + 58;
  var backH = GAME.UI.BTN_H_SM || 52;   // 최소 터치 타깃(화면 48px)
  var avail = H - startY - backH - 30;
  var rowH = P ? 74 : 82;
  var maxRows = Math.max(1, Math.floor(avail / rowH));

  for (var i = 0; i < Math.min(all.length, maxRows); i++) {
    this._row(all[i], pad, startY + i * rowH, W - pad * 2, rowH - 12);
  }
  if (all.length > maxRows) {
    GAME.UI.label(this, W / 2, startY + maxRows * rowH - 4,
      '외 ' + (all.length - maxRows) + '개 더 있음', 12, C.textDim, 0.5);
  }

  GAME.UI.button(this, W / 2, H - 34, Math.min(W - 40, 200), backH, '← 메뉴로', function () {
    self.scene.start('Menu');
  }, { fontSize: P ? 17 : 17 });
};

GAME.SelectScene.prototype._row = function (formation, x, y, w, h) {
  var C = GAME.CONFIG.COLORS;
  var P = GAME.CONFIG.PORTRAIT;
  var self = this;

  var isAI = !!formation.isAI;
  var accent = isAI ? 0x9b8cf0 : 0x35d0a5;

  var rect = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x22222f).setStrokeStyle(1, 0x3a3a52);
  rect.setInteractive({ useHandCursor: true });
  rect.on('pointerover', function () { rect.setFillStyle(0x2c2c3e); rect.setStrokeStyle(1, accent); });
  rect.on('pointerout', function () { rect.setFillStyle(0x22222f); rect.setStrokeStyle(1, 0x3a3a52); });
  rect.on('pointerdown', function () { self.scene.start('Draft', { formationId: formation.id }); });

  // 이 배치도가 특정 영웅을 상대로 짜였다면 솔직히 알린다 —
  // 상성을 숨기면 '왜 졌는지 모르는 판'이 된다.
  var vs = formation.vsHero && GAME.HEROES[formation.vsHero]
    ? '  ⚔ ' + GAME.HEROES[formation.vsHero].name + ' 대비' : '';
  GAME.UI.label(this, x + 14, y + 8, formation.name, P ? 17 : 20, C.text, 0);
  if (vs) {
    GAME.UI.label(this, x + 14 + (P ? 120 : 160), y + (P ? 15 : 16), vs,
      P ? 13 : 12, C.warn, 0);
  }
  GAME.UI.label(this, x + 14, y + (P ? 38 : 36), isAI ? 'AI 배치' : '사람 배치',
    P ? 13 : 13, isAI ? C.accentAlt : C.accent, 0);
  GAME.UI.label(this, x + (P ? 76 : 110), y + (P ? 38 : 36),
    '유닛 ' + formation.units.length + '기 · 예산 ' + GAME.Formations.budgetOf(formation),
    P ? 13 : 13, C.textDim, 0);

  GAME.UI.label(this, x + w - 14, y + (P ? 9 : 20), GAME.UI.winRateText(formation.id),
    P ? 13 : 15, C.warn, 1).setOrigin(1, 0);
  GAME.UI.label(this, x + w - 14, y + (P ? 40 : 46), '도전 →', P ? 13 : 13, C.textDim, 1).setOrigin(1, 0);
};
