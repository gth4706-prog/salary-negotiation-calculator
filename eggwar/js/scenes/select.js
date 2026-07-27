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
  }, { fill: GAME.UI.COL.panelPurple, line: GAME.CONFIG.COLORS.strategist, hover: GAME.UI.COL.panelPurpleHi, color: C.accentAlt, fontSize: P ? 17 : 17 });

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
  var accent = isAI ? GAME.CONFIG.COLORS.strategist : GAME.CONFIG.COLORS.controller;

  var rect = this.add.rectangle(x + w / 2, y + h / 2, w, h, GAME.UI.COL.surfaceAlt).setStrokeStyle(1, GAME.UI.COL.border);
  rect.setInteractive({ useHandCursor: true });
  rect.on('pointerover', function () { rect.setFillStyle(GAME.UI.COL.surfaceHi); rect.setStrokeStyle(1, accent); });
  rect.on('pointerout', function () { rect.setFillStyle(GAME.UI.COL.surfaceAlt); rect.setStrokeStyle(1, GAME.UI.COL.border); });
  rect.on('pointerdown', function () { self.scene.start('Draft', { formationId: formation.id }); });

  // 이 배치도가 특정 영웅을 상대로 짜였다면 솔직히 알린다 —
  // 상성을 숨기면 '왜 졌는지 모르는 판'이 된다.
  var vs = formation.vsHero && GAME.HEROES[formation.vsHero]
    ? '⚔ ' + GAME.HEROES[formation.vsHero].name + ' 대비' : '';

  // 배치도 이름은 사용자가 최대 20자까지 넣는다. 이름 뒤 항목을 **고정 오프셋**으로
  // 박아두면 긴 이름에서 반드시 겹친다(실제로 겹쳤다: 이름↔'⚔ 대비'↔승률 3중 충돌).
  // 그래서 오른쪽 항목을 먼저 그려 실제 왼쪽 끝을 재고, 남는 폭에 맞춰 이름을 줄인다.
  // 세로(420 폭)에서는 승률 문구("방어 승률 33%  (3전 1승 1패 1무)")가 229px 나 돼서
  // 첫 줄에 두면 이름 자리가 14px 밖에 안 남는다. 그래서 세로는 **승률을 둘째 줄 오른쪽**으로
  // 내리고 '도전 →' 화살표를 뺀다(행 전체가 이미 탭 가능하다). 가로는 폭이 넉넉해 그대로.
  var rate = GAME.UI.label(this, x + w - 14, y + (P ? 38 : 20),
    P ? GAME.UI.winRateShort(formation.id) : GAME.UI.winRateText(formation.id),
    P ? 13 : 15, C.warn, 1).setOrigin(1, 0);
  if (!P) {
    GAME.UI.label(this, x + w - 14, y + 46, '도전 →', 13, C.textDim, 1).setOrigin(1, 0);
  }

  var nameLbl = GAME.UI.label(this, x + 14, y + 8, formation.name, P ? 17 : 20, C.text, 0);
  var vsLbl = vs ? GAME.UI.label(this, x + 14, y + (P ? 15 : 16), vs, P ? 13 : 12, C.warn, 0) : null;

  // 첫 줄이 쓸 수 있는 오른쪽 끝
  var lineRight = P ? (x + w - 14) : (rate.getBounds().x - 10);
  function fitName() {
    var avail = lineRight - (vsLbl ? vsLbl.width + 8 : 0) - (x + 14);
    if (avail <= 16) return false;                 // 태그를 빼야 자리가 난다
    if (nameLbl.width > avail) {
      var s = formation.name;
      while (s.length > 1 && nameLbl.width > avail) { s = s.slice(0, -1); nameLbl.setText(s + '…'); }
    }
    return true;
  }
  if (!fitName() && vsLbl) {
    // 태그까지 넣을 자리가 없으면 태그를 포기한다 — 이름이 잘려 안 읽히는 것보다 낫다
    vsLbl.destroy(); vsLbl = null;
    fitName();
  }
  if (vsLbl) vsLbl.setX(nameLbl.x + nameLbl.width + 8);

  // 둘째 줄은 한 문장으로 합친다 — 두 라벨을 고정 x 로 나란히 두면
  // '사람 배치'(4자)와 'AI 배치'(2자)의 폭 차이만큼 세로에서 겹쳤다.
  var meta = GAME.UI.label(this, x + 14, y + (P ? 38 : 36),
    (isAI ? 'AI 배치' : '사람 배치') +
    '  ·  유닛 ' + formation.units.length + '기 · 예산 ' + GAME.Formations.budgetOf(formation),
    P ? 13 : 13, isAI ? C.accentAlt : C.accent, 0);
  var metaMax = rate.getBounds().x - 8 - (x + 14);
  if (metaMax > 24 && meta.width > metaMax) {
    var ms = meta.text;
    while (ms.length > 1 && meta.width > metaMax) { ms = ms.slice(0, -1); meta.setText(ms + '…'); }
  }
};
