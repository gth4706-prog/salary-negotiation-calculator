window.GAME = window.GAME || {};

GAME.SelectScene = function () {
  Phaser.Scene.call(this, { key: 'Select' });
};
GAME.SelectScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.SelectScene.prototype.constructor = GAME.SelectScene;

GAME.SelectScene.prototype.create = function () {
  var C = GAME.CONFIG.COLORS;
  var W = GAME.CONFIG.WIDTH;
  var self = this;

  this.cameras.main.setBackgroundColor(C.bg);

  GAME.UI.label(this, W / 2, 52, '도전할 진형 선택', 32, C.text, 0.5);
  GAME.UI.label(this, W / 2, 94,
    'AI가 만든 진형은 솔직히 표시합니다. 예산은 상대와 동일하게 받습니다.',
    15, C.textDim, 0.5);

  GAME.UI.button(this, W / 2, 148, 260, 46, '🎲 랜덤 매칭', function () {
    var f = GAME.Formations.random();
    if (f) self.scene.start('Draft', { formationId: f.id });
  }, { fill: 0x2a2440, line: 0x9b8cf0, hover: 0x372f52, color: C.accentAlt, fontSize: 17 });

  var all = GAME.Formations.loadAll();
  var startY = 196;
  var rowH = 82;
  var maxRows = 6;

  for (var i = 0; i < Math.min(all.length, maxRows); i++) {
    this._row(all[i], 90, startY + i * rowH, W - 180, rowH - 14);
  }

  if (all.length > maxRows) {
    GAME.UI.label(this, W / 2, startY + maxRows * rowH + 2,
      '외 ' + (all.length - maxRows) + '개 더 있음', 14, C.textDim, 0.5);
  }

  GAME.UI.button(this, W / 2, 762, 200, 46, '← 메뉴로', function () {
    self.scene.start('Menu');
  }, { fontSize: 17 });
};

GAME.SelectScene.prototype._row = function (formation, x, y, w, h) {
  var C = GAME.CONFIG.COLORS;
  var self = this;

  var isAI = !!formation.isAI;
  var accent = isAI ? 0x9b8cf0 : 0x35d0a5;

  var rect = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x22222f)
    .setStrokeStyle(1, 0x3a3a52);
  rect.setInteractive({ useHandCursor: true });
  rect.on('pointerover', function () { rect.setFillStyle(0x2c2c3e); rect.setStrokeStyle(1, accent); });
  rect.on('pointerout', function () { rect.setFillStyle(0x22222f); rect.setStrokeStyle(1, 0x3a3a52); });
  rect.on('pointerdown', function () {
    self.scene.start('Draft', { formationId: formation.id });
  });

  GAME.UI.label(this, x + 20, y + 10, formation.name, 20, C.text, 0);

  GAME.UI.label(this, x + 20, y + 40, isAI ? 'AI 배치' : '사람 배치', 13,
    isAI ? C.accentAlt : C.accent, 0);

  GAME.UI.label(this, x + 110, y + 40,
    '유닛 ' + formation.units.length + '기  ·  예산 ' + GAME.Formations.budgetOf(formation) +
    (formation.tier ? ' (' + formation.tier + ')' : ''),
    13, C.textDim, 0);

  GAME.UI.label(this, x + w - 20, y + 24, GAME.UI.winRateText(formation.id), 15, C.warn, 1)
    .setOrigin(1, 0.5);

  GAME.UI.label(this, x + w - 20, y + 48, '클릭해서 도전 →', 13, C.textDim, 1)
    .setOrigin(1, 0.5);
};
