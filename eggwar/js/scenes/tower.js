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

  // 세로 화면에서는 문구가 줄바꿈돼 고정 좌표(u*N)로는 계속 겹친다.
  // 그래서 위쪽 블록은 **실제로 그려진 높이만큼 내려가는 흐름 배치**로 쌓는다.
  var y = u * 5;
  function stack(label, gap) {
    y = label.y + label.height + (gap === undefined ? u * 1.6 : gap);
    return label;
  }

  stack(GAME.UI.label(this, W / 2, y, '통곡의 탑', P ? 28 : 46, C.text, 0.5).setOrigin(0.5, 0), u * 1.2);

  var heroBudget = GAME.Tower.heroBudgetFor(floor);
  var bossDef = GAME.Tower.bossFor(floor);
  stack(GAME.UI.label(this, W / 2, y,
    floor + '층  ·  적 진형 ' + budget + '  vs  내 예산 ' + heroBudget +
    '  ·  최고 ' + (rec.best || 0) + '층',
    P ? 15 : 19, bossDef ? C.crit : C.accent, 0.5)
    .setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(W - 30));

  if (bossDef) {
    stack(GAME.UI.label(this, W / 2, y, '☠  보스 층 — ' + bossDef.name,
      P ? 17 : 20, '#ef4444', 0.5).setOrigin(0.5, 0));
  }

  var E = GAME.Tower.EARLY_FLOORS;
  stack(GAME.UI.label(this, W / 2, y,
    '꼭대기가 없는 무한의 탑. 1~' + E + '층은 연습 구간, ' + (E + 1) +
    '층부터는 조작 없이는 이길 수 없습니다.\n' +
    GAME.Tower.BOSS_EVERY + '층마다 보스. 지면 1층부터 다시.',
    P ? 13 : 14, floor > E ? C.warn : C.textDim, 0.5)
    .setOrigin(0.5, 0).setAlign('center').setLineSpacing(4).setWordWrapWidth(W - 40));

  // ── 영웅 선택 (배치보다 먼저다) ──
  var pw = Math.min(W - 30, 640);
  stack(GAME.UI.label(this, W / 2, y,
    '내 영웅을 먼저 고르세요 — AI가 이걸 보고 배치합니다',
    P ? 13 : 13, C.text, 0.5).setOrigin(0.5, 0).setWordWrapWidth(W - 30), u * 1.0);

  var hc = GAME.Layout.cols(GAME.HERO_ORDER.length, {
    gap: 8, width: pw, left: (W - pw) / 2, pad: 0
  });
  var heroH = u * 7;
  this.heroBtns = [];
  GAME.HERO_ORDER.forEach(function (hk, i) {
    var h = GAME.HEROES[hk];
    var b = GAME.UI.button(self, hc[i].cx, y + heroH / 2, hc[i].w, heroH,
      h.name + '\n' + h.trait, function () {
        self.heroKey = hk;
        GAME.Store.set('asymgame.lastHero', hk);
        // 영웅이 바뀌면 상대 배치도 다시 짜인다
        self.formation = GAME.Tower.formationFor(floor, hk);
        self._refresh();
      }, { fontSize: P ? 13 : 13 });
    b.text.setAlign('center');
    self.heroBtns.push({ key: hk, btn: b });
  });
  y += heroH + u * 1.8;

  // AI가 읽은 내 성향 + 이 영웅에 대한 대응 (내용 길이에 맞춰 패널을 그린다)
  var panelTop = y;
  var lx = W / 2 - pw / 2 + 14;
  var l1 = GAME.UI.label(this, lx, y + 10,
    prof.battles ? ('AI가 읽은 당신 — ' + prof.styleLabel + ' · ' + prof.dodgeLabel +
                    ' (교전거리 ' + prof.avgDist + ', ' + prof.battles + '전)')
                 : 'AI가 읽은 당신 — 아직 분석할 기록이 없습니다',
    P ? 13 : 13, C.crit, 0).setWordWrapWidth(pw - 28);
  this.rationaleText = GAME.UI.label(this, lx, l1.y + l1.height + 6,
    '', P ? 13 : 12, C.textDim, 0).setWordWrapWidth(pw - 28);
  this.compText = GAME.UI.label(this, lx, 0, '', P ? 13 : 12, C.accentAlt, 0)
    .setWordWrapWidth(pw - 28);
  this.panelGeo = { top: panelTop, x: W / 2, w: pw, lx: lx };
  this.panelRect = this.add.rectangle(W / 2, panelTop, pw, 10, 0x22222f)
    .setStrokeStyle(1, 0x3a3a52).setOrigin(0.5, 0);
  this.panelRect.setDepth(-1);

  this._refresh();

  var bw = Math.min(W - 30, 420);
  var bh = u * 7;
  var gap = u * 1.4;
  var restH = floor > 1 ? (u * 5 + gap) : 0;
  var byBottom = H - u * 2 - restH;

  if (floor > 1) {
    GAME.UI.button(this, W / 2, H - u * 2 - u * 2.5, Math.min(W - 60, 240), u * 5, '1층부터 다시', function () {
      GAME.Tower.fail();
      self.scene.restart();
    }, { fontSize: P ? 13 : 13 });
  }
  GAME.UI.button(this, W / 2, byBottom - bh * 0.5, bw, bh, '← 메뉴', function () {
    self.scene.start('Menu');
  }, { fontSize: P ? 15 : 15 });
  GAME.UI.button(this, W / 2, byBottom - bh * 1.5 - gap, bw, bh, '🏆 랭킹', function () {
    self.scene.start('Rank', { scope: 'live' });
  }, { fontSize: P ? 17 : 16 });
  GAME.UI.button(this, W / 2, byBottom - bh * 2.5 - gap * 2, bw, bh + u * 0.8, floor + '층 도전', function () {
    // 이 배치도를 임시 등록해 기존 흐름(Draft → Battle)을 그대로 쓴다
    GAME.Tower.pending = self.formation;
    self.scene.start('Draft', {
      formationId: self.formation.id, tower: floor, heroKey: self.heroKey
    });
  }, { fill: 0x1c3a34, line: 0x35d0a5, hover: 0x235045, color: C.accent, fontSize: P ? 20 : 22 });

  // 버전 표시는 DOM 배지(#ver) 하나로 통일했다 — 캔버스에도 그리면 우하단에서 겹친다.
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
  // 대응 근거와 적 구성은 길이가 매번 다르다 → 앞 글자의 실제 높이만큼 밀고,
  // 패널 배경도 내용에 맞춰 다시 그린다. 고정 높이로 두면 긴 문구가 삐져나온다.
  this.compText.setY(this.rationaleText.y + this.rationaleText.height + 6);
  this.compText.setText('적 ' + this.formation.units.length + '기 — ' + comp);

  if (this.panelRect && this.panelGeo) {
    var bottom = this.compText.y + this.compText.height + 10;
    this.panelRect.setSize(this.panelGeo.w, Math.max(20, bottom - this.panelGeo.top));
  }
};
