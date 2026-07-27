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

  var heroBudget = GAME.Tower.heroBudgetFor(floor);
  var bossDef = GAME.Tower.bossFor(floor);

  // 여기엔 titleRule 을 넣지 않는다 — 바로 아래 층수 배지의 어깨 리본이 이미 장식 역할을 하고,
  // 둘을 겹쳐 놨더니 가로선이 리본을 관통했다(세로 화면에서 확인).
  stack(GAME.UI.label(this, W / 2, y, '통곡의 탑', P ? 26 : 40, C.text, 0.5)
    .setOrigin(0.5, 0), u * 1.0);

  // 층수 배지 — 등급 색이 곧 난이도다(운빨존많겜의 등급 색 사다리를 난이도에 옮긴 것)
  var badge = GAME.UI.floorBadge(this, W / 2, y, floor, { boss: !!bossDef });
  y = badge.bottom + u * 1.2;

  // 다음 보스까지 — "10층마다 보스"라는 규칙이 눈에 보인다
  var band = GAME.UI.bandMeter(this, W / 2 - Math.min(W - 60, 300) / 2, y,
    Math.min(W - 60, 300), floor, GAME.Tower.BOSS_EVERY);
  y = band.bounds().bottom + u * 1.4;

  if (bossDef) {
    // 색을 직접 박으면(구 '#ff7b7b') 크림 배경에서 2.2:1 로 흐려진다 → 테마 danger 토큰
    stack(GAME.UI.label(this, W / 2, y, '☠  ' + bossDef.name,
      P ? 19 : 22, GAME.UI.TXT.danger, 0.5).setOrigin(0.5, 0), u * 1.0);
  }

  stack(GAME.UI.label(this, W / 2, y,
    '적 진형 ' + budget + '   vs   내 예산 ' + heroBudget + '   ·   최고 ' + (rec.best || 0) + '층',
    P ? 15 : 19, C.text, 0.5)
    .setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(W - 30));

  // 연습 구간 안내는 **1~3층에서만** 보여준다.
  // 4층 이상에서는 이미 아는 내용이고, 그 두 줄이 아래 패널을 버튼까지 밀어낸다.
  var E = GAME.Tower.EARLY_FLOORS;
  if (floor <= E) {
    stack(GAME.UI.label(this, W / 2, y,
      '1~' + E + '층은 연습 구간. ' + (E + 1) + '층부터는 조작 없이는 이길 수 없습니다.',
      P ? 13 : 14, C.textDim, 0.5)
      .setOrigin(0.5, 0).setAlign('center').setLineSpacing(4).setWordWrapWidth(W - 40));
  }

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
  this.panelRect = this.add.rectangle(W / 2, panelTop, pw, 10, GAME.UI.COL.surfaceAlt)
    .setStrokeStyle(1, GAME.UI.COL.border).setOrigin(0.5, 0);
  this.panelRect.setDepth(-1);

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
  // 패널(위에서 자람)과 버튼(아래에서 올라옴)이 만나는 지점.
  // 진형 구성 문구 길이가 매번 달라 **간헐적으로만** 겹쳤다 — 이 선을 넘지 않게 맞춘다.
  this.panelMaxBottom = byBottom - bh * 2.5 - gap * 2 - (bh + u * 0.8) / 2 - 8;
  GAME.UI.button(this, W / 2, byBottom - bh * 2.5 - gap * 2, bw, bh + u * 0.8, floor + '층 도전', function () {
    // 이 배치도를 임시 등록해 기존 흐름(Draft → Battle)을 그대로 쓴다
    GAME.Tower.pending = self.formation;
    self.scene.start('Draft', {
      formationId: self.formation.id, tower: floor, heroKey: self.heroKey
    });
  }, { fill: GAME.UI.COL.panelTeal, line: GAME.CONFIG.COLORS.controller, hover: GAME.UI.COL.panelTealHi, color: C.accent, fontSize: P ? 20 : 22 });

  // 버튼을 다 만든 뒤에 그린다 — _refresh 가 panelMaxBottom(버튼 최상단)을 봐야 하는데
  // 먼저 부르면 그 값이 아직 없어 첫 화면에서만 문구가 버튼을 침범했다.
  this._refresh();

  // 버전 표시는 DOM 배지(#ver) 하나로 통일했다 — 캔버스에도 그리면 우하단에서 겹친다.
};

// 고른 영웅에 맞춰 선택 표시·대응 근거·적 구성을 다시 그린다
GAME.TowerScene.prototype._refresh = function () {
  var C = GAME.CONFIG.COLORS;
  var self = this;

  this.heroBtns.forEach(function (h) {
    var on = h.key === self.heroKey;
    h.btn.rect.setStrokeStyle(on ? 2 : 1, on ? GAME.CONFIG.COLORS.controller : GAME.UI.COL.borderUi);
    h.btn.rect.setFillStyle(on ? GAME.UI.COL.panelTeal : GAME.UI.COL.surfaceAlt);
    h.btn.text.setColor(on ? C.accent : C.text);
  });

  this.rationaleText.setText('이 층의 대응: ' + this.formation.rationale);

  var counts = {};
  this.formation.units.forEach(function (x) { counts[x.type] = (counts[x.type] || 0) + 1; });
  // 유닛 종류가 10종까지 가면 이 줄이 3~4줄로 늘어나 아래 버튼을 밀어낸다.
  // 진형 구성이 매번 랜덤이라 **간헐적으로만** 터져서 더 위험하다 — 길이를 상한으로 묶는다.
  var keys = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
  function compFor(n) {
    var t = keys.slice(0, n).map(function (k) {
      return GAME.UNITS[k].name + ' ' + counts[k];
    }).join(' · ');
    if (keys.length > n) t += ' 외 ' + (keys.length - n) + '종';
    return t;
  }
  var comp = compFor(keys.length);
  // 대응 근거와 적 구성은 길이가 매번 다르다 → 앞 글자의 실제 높이만큼 밀고,
  // 패널 배경도 내용에 맞춰 다시 그린다. 고정 높이로 두면 긴 문구가 삐져나온다.
  this.compText.setY(this.rationaleText.y + this.rationaleText.height + 6);
  this.compText.setText('적 ' + this.formation.units.length + '기 — ' + comp);

  // 버튼 선을 넘으면 유닛 종류를 하나씩 줄여가며 맞춘다.
  // 글자 수로 어림잡으면 한글 폭 때문에 틀린다 — **실제로 그려본 높이**로 판단한다.
  if (this.panelMaxBottom) {
    var n = keys.length;
    while (n > 1 && this.compText.getBounds().bottom > this.panelMaxBottom) {
      n--;
      this.compText.setText('적 ' + this.formation.units.length + '기 — ' + compFor(n));
    }
    // 종류를 1종까지 줄여도 넘치는 경우가 있다 — 그건 **대응 근거가 길어서**
    // 적 구성 한 줄조차 자리가 없는 것이다(세로 12기 진형에서 실측: 616 > 600).
    // 그때는 근거를 줄여 자리를 만든다. 근거를 통째로 없애면 왜 이렇게 배치됐는지
    // 알 수 없어지므로 말줄임으로만 줄인다.
    var guard = 0;
    while (this.compText.getBounds().bottom > this.panelMaxBottom && guard++ < 80) {
      var s = String(this.rationaleText.text).replace(/…$/, '');
      if (s.length <= 16) break;
      this.rationaleText.setText(s.slice(0, -4) + '…');
      this.compText.setY(this.rationaleText.y + this.rationaleText.height + 6);
    }
  }

  if (this.panelRect && this.panelGeo) {
    var bottom = this.compText.getBounds().bottom + 10;
    this.panelRect.setSize(this.panelGeo.w, Math.max(20, bottom - this.panelGeo.top));
  }
};
