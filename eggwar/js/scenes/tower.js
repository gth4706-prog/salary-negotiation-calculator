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

  // 진행 중인 도전이 있으면 그 세팅을 그대로 쓴다(층마다 다시 고르지 않는다).
  // 없으면 새 도전이므로 여기서 영웅을 고르고, 준비 화면에서 장비·스킬을 확정한다.
  this.run = (GAME.TowerRun && GAME.TowerRun.get()) || null;
  this.heroKey = this.run ? this.run.heroKey
                          : GAME.Store.get('asymgame.lastHero', GAME.HERO_ORDER[0]);
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
    this.run
      ? ('적 진형 ' + budget + '   ·   내 빌드 유지 중   ·   최고 ' + (rec.best || 0) + '층')
      : ('적 진형 ' + budget + '   vs   시작 예산 ' + GAME.TowerRun.START_BUDGET +
         '   ·   최고 ' + (rec.best || 0) + '층'),
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

  var pw = Math.min(W - 30, 640);
  this.heroBtns = [];

  if (this.run) {
    // ── 도전 진행 중: 골드로 능력치를 올린다 ──
    // 영웅·스킬은 도전 내내 고정이므로 고르는 UI 를 두지 않는다. 여기서 하는 건 성장뿐.
    var hero = GAME.HEROES[this.heroKey];
    stack(GAME.UI.label(this, W / 2, y,
      '내 영웅  ' + hero.name + '  (' + hero.trait + ')  —  도전 내내 유지됩니다',
      P ? 14 : 16, GAME.UI.TXT.crit, 0.5).setOrigin(0.5, 0).setWordWrapWidth(W - 30), u * 0.8);

    this.goldLabel = GAME.UI.label(this, W / 2, y, '', P ? 20 : 24, C.accent, 0.5).setOrigin(0.5, 0);
    y = this.goldLabel.y + this.goldLabel.height + u * 1.2;

    var sc = GAME.Layout.cols(2, { gap: 8, width: pw, left: (W - pw) / 2, pad: 0 });
    var rowH = Math.max(GAME.UI.BTN_H_SM || 52, u * 6);
    this.statBtns = [];
    GAME.TowerRun.STATS.forEach(function (d, i) {
      var col = sc[i % 2];
      var ry = y + Math.floor(i / 2) * (rowH + 8);
      var b = GAME.UI.button(self, col.cx, ry + rowH / 2, col.w, rowH, '', function () {
        if (GAME.TowerRun.levelUp(d.key)) {
          self.run = GAME.TowerRun.get();
          self._refreshRun(true);
        }
      }, { fontSize: P ? 13 : 14 });
      b.text.setAlign('center');
      self.statBtns.push({ def: d, btn: b });
    });
    y += Math.ceil(GAME.TowerRun.STATS.length / 2) * (rowH + 8) + u * 0.6;

    // 이 문구는 장비 이름 길이에 따라 1~2줄이 된다. **먼저 채워 넣고 실제 높이만큼** 밀어야
    // 아래 성향 패널을 파고들지 않는다(빈 문자열 높이로 밀었더니 실제로 겹쳤다).
    this.runHint = GAME.UI.label(this, W / 2, y,
      this._runHintText(), P ? 13 : 13, C.textDim, 0.5).setOrigin(0.5, 0).setWordWrapWidth(W - 40);
    y = this.runHint.y + this.runHint.height + u * 1.6;
  } else {
    // ── 새 도전: 영웅을 먼저 고른다 ──
    stack(GAME.UI.label(this, W / 2, y,
      '영웅을 고르세요 — 이 도전이 끝날 때까지 함께 갑니다',
      P ? 13 : 13, C.text, 0.5).setOrigin(0.5, 0).setWordWrapWidth(W - 30), u * 1.0);

    var hc = GAME.Layout.cols(GAME.HERO_ORDER.length, {
      gap: 8, width: pw, left: (W - pw) / 2, pad: 0
    });
    var heroH = u * 7;
    GAME.HERO_ORDER.forEach(function (hk, i) {
      var h = GAME.HEROES[hk];
      var b = GAME.UI.button(self, hc[i].cx, y + heroH / 2, hc[i].w, heroH,
        h.name + '\n' + h.trait, function () {
          self.heroKey = hk;
          GAME.Store.set('asymgame.lastHero', hk);
          self._refresh();
        }, { fontSize: P ? 13 : 13 });
      b.text.setAlign('center');
      self.heroBtns.push({ key: hk, btn: b });
    });
    y += heroH + u * 1.8;
  }

  // AI가 읽은 내 성향 + 이 영웅에 대한 대응 (내용 길이에 맞춰 패널을 그린다)
  //
  // 도전 중에는 위에 골드 상점(4칸)이 들어가 세로가 빠듯하다. 그래서 성향 문장은
  // **한 줄로 짧게** 줄인다 — 길게 두면 아래 '전투 시작' 버튼을 파고든다(실측 확인).
  // 정작 중요한 '적 구성'(compText)은 남겨야 하므로 이쪽을 줄이는 게 맞다.
  var panelTop = y;
  var lx = W / 2 - pw / 2 + 14;
  var profLine = this.run
    ? (prof.battles ? ('내 성향 — ' + prof.styleLabel + ' · ' + prof.dodgeLabel)
                    : '내 성향 — 아직 기록 없음')
    : (prof.battles ? ('AI가 읽은 당신 — ' + prof.styleLabel + ' · ' + prof.dodgeLabel +
                       ' (교전거리 ' + prof.avgDist + ', ' + prof.battles + '전)')
                    : 'AI가 읽은 당신 — 아직 분석할 기록이 없습니다');
  var l1 = GAME.UI.label(this, lx, y + 10, profLine,
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
  GAME.UI.button(this, W / 2, byBottom - bh * 2.5 - gap * 2, bw, bh + u * 0.8,
    this.run ? (floor + '층 전투 시작') : (floor + '층 도전 — 장비 고르기'), function () {
    // 이 배치도를 임시 등록해 기존 흐름을 그대로 쓴다
    GAME.Tower.pending = self.formation;
    if (self.run) {
      // 도전 중 — 다시 고르지 않고 저장된 세팅으로 곧장 전투로
      var Z = GAME.CONFIG.ZONE_CONTROLLER;
      self.scene.start('Battle', {
        formationId: self.formation.id,
        heroKey: self.run.heroKey,
        items: self.run.items,
        picks: self.run.picks,
        tower: floor,
        startPos: { x: Z.x + Z.w / 2, y: Z.y + Z.h * 0.55 }
      });
    } else {
      self.scene.start('Draft', {
        formationId: self.formation.id, tower: floor, heroKey: self.heroKey
      });
    }
  }, { fill: GAME.UI.COL.panelTeal, line: GAME.CONFIG.COLORS.controller, hover: GAME.UI.COL.panelTealHi, color: C.accent, fontSize: P ? 20 : 22 });

  // 버튼을 다 만든 뒤에 그린다 — _refresh 가 panelMaxBottom(버튼 최상단)을 봐야 하는데
  // 먼저 부르면 그 값이 아직 없어 첫 화면에서만 문구가 버튼을 침범했다.
  this._refresh();

  // 버전 표시는 DOM 배지(#ver) 하나로 통일했다 — 캔버스에도 그리면 우하단에서 겹친다.
};

// 고른 영웅에 맞춰 선택 표시·대응 근거·적 구성을 다시 그린다
// 도전 중 골드·능력치 표시 갱신. bump=true 면 골드 숫자가 튕기는 연출을 준다.
GAME.TowerScene.prototype._refreshRun = function (bump) {
  if (!this.run || !this.goldLabel) return;
  var C = GAME.CONFIG.COLORS;
  var self = this;
  var TR = GAME.TowerRun;

  this.goldLabel.setText('💰 골드  ' + this.run.gold);
  if (bump) {
    // 돈이 줄어든 게 눈에 보이게 — 숫자가 한 번 커졌다 돌아온다
    this.goldLabel.setScale(1.25);
    this.tweens.add({ targets: this.goldLabel, scale: 1, duration: 260, ease: 'Back.easeOut' });
  }

  var bonus = TR.statBonus(this.run);
  this.statBtns.forEach(function (s) {
    var d = s.def;
    var lv = self.run.levels[d.key] || 0;
    var maxed = lv >= d.max;
    var cost = TR.costOf(d.key, lv);
    var can = !maxed && self.run.gold >= cost;
    s.btn.text.setText(d.name + '  Lv.' + lv + (maxed ? ' (최대)' : '')
      + '\n' + (maxed ? ('+' + bonus[d.key]) : ('+' + bonus[d.key] + '  →  ' + cost + '골드')));
    s.btn.text.setColor(can ? C.accent : C.textDim);
    s.btn.rect.setStrokeStyle(can ? 2 : 1, can ? C.controller : GAME.UI.COL.borderUi);
    s.btn.rect.setFillStyle(can ? GAME.UI.COL.panelTeal : GAME.UI.COL.surfaceAlt);
  });

  if (this.runHint) this.runHint.setText(this._runHintText());
};

// 도전 중 장비 요약 한 줄
GAME.TowerScene.prototype._runHintText = function () {
  var rec = this.run || (GAME.TowerRun && GAME.TowerRun.get());
  if (!rec) return '';
  var it = rec.items || {};
  var worn = GAME.ITEM_SLOTS.map(function (s) {
    var k = it[s.key];
    return k ? GAME.Items.find(s.key, k).name : null;
  }).filter(Boolean);
  return '장비 ' + (worn.length ? worn.join(' · ') : '없음') + '  ·  층을 깰 때마다 골드 획득';
};

GAME.TowerScene.prototype._refresh = function () {
  var C = GAME.CONFIG.COLORS;
  var self = this;

  if (this.run) { this._refreshRun(false); }

  this.heroBtns.forEach(function (h) {
    var on = h.key === self.heroKey;
    h.btn.rect.setStrokeStyle(on ? 2 : 1, on ? GAME.CONFIG.COLORS.controller : GAME.UI.COL.borderUi);
    h.btn.rect.setFillStyle(on ? GAME.UI.COL.panelTeal : GAME.UI.COL.surfaceAlt);
    h.btn.text.setColor(on ? C.accent : C.text);
  });

  // 도전 중에는 골드 상점이 세로를 먹으므로 대응 근거를 접는다(적 구성이 더 중요하다)
  this.rationaleText.setText(this.run ? '' : ('이 층의 대응: ' + this.formation.rationale));

  var counts = {};
  this.formation.units.forEach(function (x) { counts[x.type] = (counts[x.type] || 0) + 1; });
  // 유닛 종류가 10종까지 가면 이 줄이 3~4줄로 늘어나 아래 버튼을 밀어낸다.
  // 진형 구성이 매번 랜덤이라 **간헐적으로만** 터져서 더 위험하다 — 길이를 상한으로 묶는다.
  var keys = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
  // 'x3' 처럼 개수를 붙여 한눈에 읽히게 (요청 반영)
  function compFor(n) {
    var t = keys.slice(0, n).map(function (k) {
      return GAME.UNITS[k].name + ' ×' + counts[k];
    }).join('   ');
    if (keys.length > n) t += '  외 ' + (keys.length - n) + '종';
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
