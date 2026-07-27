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

  // 영웅을 먼저 고른다 — AI 전략가는 **그 영웅을 보고** 배치를 짠다.
  // 그래서 영웅을 바꾸면 아래 배치도 즉시 다시 그려진다.
  this.heroKey = GAME.Store.get('asymgame.lastHero', GAME.HERO_ORDER[0]);
  if (!GAME.HEROES[this.heroKey]) this.heroKey = GAME.HERO_ORDER[0];
  this.formation = GAME.Tower.formationFor(floor, this.heroKey);

  GAME.UI.label(this, W / 2, u * 8, '통곡의 탑', P ? 30 : 46, C.text, 0.5);
  var heroBudget = GAME.Tower.heroBudgetFor(floor);
  var bossDef = GAME.Tower.bossFor(floor);
  GAME.UI.label(this, W / 2, u * 15,
    floor + '층  ·  적 진형 ' + budget + '  vs  내 예산 ' + heroBudget +
    '  ·  최고 기록 ' + (rec.best || 0) + '층',
    P ? 14 : 19, bossDef ? C.crit : C.accent, 0.5).setWordWrapWidth(W - 40);

  if (bossDef) {
    GAME.UI.label(this, W / 2, u * 19.5,
      '☠  보스 층 — ' + bossDef.name,
      P ? 15 : 20, C.hpBad ? '#ef4444' : C.warn, 0.5);
  }

  var E = GAME.Tower.EARLY_FLOORS;
  GAME.UI.label(this, W / 2, u * 23,
    '꼭대기가 없는 무한의 탑입니다. 1~' + E + '층은 연습 구간, ' + (E + 1) +
    '층부터는 조작하지 않으면 이길 수 없습니다.\n' +
    GAME.Tower.BOSS_EVERY + '층마다 보스가 나옵니다. 지면 1층부터 다시 시작합니다.',
    P ? 11 : 14,
    floor > E ? C.warn : C.textDim, 0.5).setAlign('center').setLineSpacing(6).setWordWrapWidth(W - 60);

  // ── 영웅 선택 (배치보다 먼저다) ──
  var pw = Math.min(W - 60, 640);
  GAME.UI.label(this, W / 2, u * 27.5,
    '내 영웅을 먼저 고르세요 — AI 전략가가 이걸 보고 배치를 짭니다',
    P ? 11 : 13, C.text, 0.5).setWordWrapWidth(W - 40);

  var hc = GAME.Layout.cols(GAME.HERO_ORDER.length, {
    gap: 8, width: pw, left: (W - pw) / 2, pad: 0
  });
  this.heroBtns = [];
  GAME.HERO_ORDER.forEach(function (hk, i) {
    var h = GAME.HEROES[hk];
    var b = GAME.UI.button(self, hc[i].cx, u * 33, hc[i].w, u * 6.5,
      h.name + '\n' + h.trait, function () {
        self.heroKey = hk;
        GAME.Store.set('asymgame.lastHero', hk);
        // 영웅이 바뀌면 상대 배치도 다시 짜인다
        self.formation = GAME.Tower.formationFor(floor, hk);
        self._refresh();
      }, { fontSize: P ? 11 : 13 });
    b.text.setAlign('center');
    self.heroBtns.push({ key: hk, btn: b });
  });

  // AI가 읽은 내 성향 + 이 영웅에 대한 대응
  this.add.rectangle(W / 2, u * 47, pw, u * 16, 0x22222f).setStrokeStyle(1, 0x3a3a52);
  GAME.UI.label(this, W / 2 - pw / 2 + 16, u * 41,
    prof.battles ? ('AI가 읽은 당신 — ' + prof.styleLabel + ' · ' + prof.dodgeLabel +
                    ' (평균 교전거리 ' + prof.avgDist + ', ' + prof.battles + '전 분석)')
                 : 'AI가 읽은 당신 — 아직 분석할 전투 기록이 없습니다',
    P ? 11 : 13, C.crit, 0).setWordWrapWidth(pw - 32);
  this.rationaleText = GAME.UI.label(this, W / 2 - pw / 2 + 16, u * 45,
    '', P ? 10 : 12, C.textDim, 0).setWordWrapWidth(pw - 32);
  this.compText = GAME.UI.label(this, W / 2 - pw / 2 + 16, u * 51,
    '', P ? 10 : 12, C.accentAlt, 0).setWordWrapWidth(pw - 32);

  this._refresh();

  var bw = Math.min(W - 60, 420);
  GAME.UI.button(this, W / 2, u * 61, bw, u * 7.5, floor + '층 도전', function () {
    // 이 배치도를 임시 등록해 기존 흐름(Draft → Battle)을 그대로 쓴다
    GAME.Tower.pending = self.formation;
    self.scene.start('Draft', {
      formationId: self.formation.id, tower: floor, heroKey: self.heroKey
    });
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

// 고른 영웅에 맞춰 선택 표시·대응 근거·적 구성을 다시 그린다
GAME.TowerScene.prototype._refresh = function () {
  var C = GAME.CONFIG.COLORS;
  var self = this;

  this.heroBtns.forEach(function (h) {
    var on = h.key === self.heroKey;
    h.btn.rect.setStrokeStyle(on ? 2 : 1, on ? 0x35d0a5 : 0x4a4a68);
    h.btn.rect.setFillStyle(on ? 0x1c3a34 : 0x262637);
    h.btn.text.setColor(on ? C.accent : C.text);
  });

  this.rationaleText.setText('이 층의 대응: ' + this.formation.rationale);

  var counts = {};
  this.formation.units.forEach(function (x) { counts[x.type] = (counts[x.type] || 0) + 1; });
  var comp = Object.keys(counts).map(function (k) {
    return GAME.UNITS[k].name + ' ' + counts[k];
  }).join(' · ');
  this.compText.setText('적 ' + this.formation.units.length + '기 — ' + comp);
};
