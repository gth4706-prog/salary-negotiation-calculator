window.GAME = window.GAME || {};

// 통곡의 탑 로비 — 현재 층과 AI가 짠 배치의 근거를 보여주고 도전으로 넘긴다.
GAME.TowerScene = function () {
  Phaser.Scene.call(this, { key: 'Tower' });
};
GAME.TowerScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.TowerScene.prototype.constructor = GAME.TowerScene;

GAME.TowerScene.prototype.create = function () {
  var C = GAME.CONFIG.COLORS;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var P = GAME.CONFIG.PORTRAIT;
  var self = this;
  var u = H / 100;

  if (!GAME.Account.current()) { this.scene.start('Login'); return; }

  this.cameras.main.setBackgroundColor(C.bg);

  var rec = GAME.Tower.get();
  var floor = rec.floor;
  var budget = GAME.Tower.budgetFor(floor);
  var prof = GAME.Profile.read();

  // 이 층의 배치를 미리 만들어 보여준다(도전 시 같은 배치로 들어간다)
  this.formation = GAME.Tower.formationFor(floor);

  GAME.UI.label(this, W / 2, u * 8, '통곡의 탑', P ? 30 : 46, C.text, 0.5);
  var heroBudget = GAME.Tower.heroBudgetFor(floor);
  GAME.UI.label(this, W / 2, u * 15,
    floor + '층  ·  적 진형 ' + budget + '  vs  내 예산 ' + heroBudget +
    '  ·  최고 기록 ' + (rec.best || 0) + '층',
    P ? 14 : 19, C.accent, 0.5).setWordWrapWidth(W - 40);

  GAME.UI.label(this, W / 2, u * 21,
    '한 층마다 적 진형은 +' + GAME.Tower.BUDGET_STEP + ', 내 예산은 +' + GAME.Tower.HERO_BUDGET_STEP +
    ' — 격차가 벌어지며 어려워집니다.\n' +
    'AI는 당신의 플레이를 분석해 배치를 바꿉니다. 지면 1층부터 다시 시작합니다.',
    P ? 11 : 14, C.textDim, 0.5).setAlign('center').setLineSpacing(6).setWordWrapWidth(W - 60);

  // AI가 읽은 내 성향
  var pw = Math.min(W - 60, 640);
  this.add.rectangle(W / 2, u * 36, pw, u * 15, 0x22222f).setStrokeStyle(1, 0x3a3a52);
  GAME.UI.label(this, W / 2 - pw / 2 + 16, u * 30,
    prof.battles ? ('AI가 읽은 당신 — ' + prof.styleLabel + ' · ' + prof.dodgeLabel +
                    ' (평균 교전거리 ' + prof.avgDist + ', ' + prof.battles + '전 분석)')
                 : 'AI가 읽은 당신 — 아직 분석할 전투 기록이 없습니다',
    P ? 11 : 13, C.crit, 0);
  GAME.UI.label(this, W / 2 - pw / 2 + 16, u * 34,
    '이 층의 대응: ' + this.formation.rationale,
    P ? 10 : 12, C.textDim, 0).setWordWrapWidth(pw - 32);

  // 적 구성 요약
  var counts = {};
  this.formation.units.forEach(function (x) { counts[x.type] = (counts[x.type] || 0) + 1; });
  var comp = Object.keys(counts).map(function (k) {
    return GAME.UNITS[k].name + ' ' + counts[k];
  }).join(' · ');
  GAME.UI.label(this, W / 2 - pw / 2 + 16, u * 39.5,
    '적 ' + this.formation.units.length + '기 — ' + comp,
    P ? 10 : 12, C.accentAlt, 0).setWordWrapWidth(pw - 32);

  var bw = Math.min(W - 60, 420);
  GAME.UI.button(this, W / 2, u * 56, bw, u * 8, floor + '층 도전', function () {
    // 이 배치도를 임시 등록해 기존 흐름(Draft → Battle)을 그대로 쓴다
    GAME.Tower.pending = self.formation;
    self.scene.start('Draft', { formationId: self.formation.id, tower: floor });
  }, { fill: 0x1c3a34, line: 0x35d0a5, hover: 0x235045, color: C.accent, fontSize: P ? 18 : 22 });

  GAME.UI.button(this, W / 2, u * 68, bw, u * 6, '🏆 랭킹', function () {
    self.scene.start('Rank', { scope: 'live' });
  }, { fontSize: P ? 14 : 16 });

  GAME.UI.button(this, W / 2, u * 78, bw, u * 6, '← 메뉴', function () {
    self.scene.start('Menu');
  }, { fontSize: P ? 13 : 15 });

  if (floor > 1) {
    GAME.UI.button(this, W / 2, u * 88, Math.min(W - 60, 240), u * 5, '1층부터 다시', function () {
      GAME.Tower.fail();
      self.scene.restart();
    }, { fontSize: P ? 12 : 13 });
  }

  GAME.UI.label(this, W - 12, H - 10, GAME.VERSION || '', 12, '#6f6f88', 1).setOrigin(1, 1);
};
