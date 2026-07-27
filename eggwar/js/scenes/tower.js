window.GAME = window.GAME || {};

// 통곡의 탑 — 두 단계로 나뉜다.
//   1) **랜딩** — 처음 눌렀을 때. 탑 일러스트(이번 층 적 에그가 앞에 서 있다),
//      현재/최고 층, 규칙 설명, 그리고 '도전'·'랭킹'·'메뉴' 만 보여준다.
//      영웅 선택은 여기서 하지 않는다(요청 반영) — 정보를 보고 마음의 준비만 하는 자리다.
//   2) **도전 화면** — '도전'을 누르면 넘어간다. 새 도전이면 영웅을 고르고,
//      진행 중인 도전이면 골드 상점(능력치 레벨업)과 '전투 시작'을 보여준다.
// 두 단계 전환은 scene.restart({step}) 로 한다 — 이 파일이 이미 '1층부터 다시'에서
// 쓰던 방식과 같다(Phaser 가 이전 화면의 표시객체를 통째로 정리해 주므로 안전하다).
GAME.TowerScene = function () {
  Phaser.Scene.call(this, { key: 'Tower' });
};
GAME.TowerScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.TowerScene.prototype.constructor = GAME.TowerScene;

GAME.TowerScene.prototype.create = function (data) {
  var C = GAME.CONFIG.COLORS;

  if (!GAME.Account.current()) { this.scene.start('Login'); return; }

  // 배경색은 각 단계가 스스로 정한다 — 랜딩은 어두운 연출용 배경을 따로 쓴다(아래 참조).

  // ── 공통 상태 (두 단계 모두 여기서부터 시작한다) ──
  var rec = GAME.Tower.get();
  var floor = rec.floor;
  this._rec = rec;
  this._floor = floor;
  this._prof = GAME.Profile.read();

  // 진행 중인 도전이 있으면 그 세팅을 그대로 쓴다(층마다 다시 고르지 않는다).
  this.run = (GAME.TowerRun && GAME.TowerRun.get()) || null;
  this.heroKey = this.run ? this.run.heroKey
                          : GAME.Store.get('asymgame.lastHero', GAME.HERO_ORDER[0]);
  if (!GAME.HEROES[this.heroKey]) this.heroKey = GAME.HERO_ORDER[0];
  this.formation = GAME.Tower.formationFor(floor, this.heroKey);

  // scene.restart 는 표시객체는 정리하지만 **인스턴스 프로퍼티는 그대로 남긴다.**
  // 랜딩 ↔ 도전 화면을 오갈 때 이전 단계의 버튼 참조(이미 파괴된 객체)가 남아 있으면
  // 안 되므로 매번 비운다.
  this.heroBtns = [];
  this.statBtns = [];
  this.goldLabel = null;
  this.runHint = null;

  var step = (data && data.step) || 'landing';
  if (step === 'challenge') this._buildChallenge();
  else this._buildLanding();
};

// ═══════════════════════════════════════════════════════════════════════
//  1) 랜딩 — "통곡의 탑" 이라는 이름 그대로의 장면.
//
//  요청 반영: 이 화면은 게임 나머지의 밝은 크림 톤을 의도적으로 깬다.
//  어둡고 사실적인 탑이 번개 아래 서 있고, 플레이어의 영웅이 **등을 보인 채**
//  그 앞에 서서 함께 올려다본다(오버더숄더 구도) — 도전이 시작되기 전 마지막 정적.
//  전부 Phaser Graphics 벡터로 그린다(이 프로젝트는 이미지 자산을 늘리지 않는다).
//  버튼은 '도전 / 랭킹 / 메뉴' 셋뿐이고, 영웅 선택은 여기서 하지 않는다.
// ═══════════════════════════════════════════════════════════════════════
GAME.TowerScene.prototype._buildLanding = function () {
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var P = GAME.CONFIG.PORTRAIT;
  var self = this;
  var u = H / 100;
  var rec = this._rec, floor = this._floor;

  // 이 화면 전용 팔레트 — 테마 토큰(C.text 등)은 밝은 배경을 전제하므로 여기서는 안 쓴다.
  var INK = { sky1: 0x03040a, sky2: 0x0d1020, sky3: 0x171b2e, ground: 0x07080c,
              stone1: 0x1b1c24, stone2: 0x232430, window: 0xffb066, crack: 0x0a0a10,
              parchment: '#ece3cf', dim: '#9a9488', gold: '#ffd166' };
  this.cameras.main.setBackgroundColor(INK.sky1);
  this._landingDark = true;

  var g = this.add.graphics();

  // ── 하늘 ── 위로 갈수록 짙어지는 밤하늘(밴드로 그라디언트를 흉내)
  var groundY = H * (P ? 0.70 : 0.66);
  var skyBands = 14;
  for (var i = 0; i < skyBands; i++) {
    var t = i / (skyBands - 1);
    g.fillStyle(this._lerpColor(INK.sky1, INK.sky3, t), 1);
    g.fillRect(0, (groundY * t), W, groundY / skyBands + 1);
  }
  // 지면
  g.fillStyle(INK.ground, 1);
  g.fillRect(0, groundY, W, H - groundY);
  // 안개 — 지면 위로 옅게 깔린 여러 겹
  for (var m = 0; m < 4; m++) {
    g.fillStyle(0x30333f, 0.10 - m * 0.015);
    g.fillEllipse(W * 0.5, groundY - m * 10, W * 1.3, 34 + m * 10);
  }

  // ── 탑 — 피사의 사탑처럼 살짝 기운 채, 밑동을 축으로 회전한 컨테이너에 그린다 ──
  var pivotX = W * 0.5, pivotY = groundY + 4;
  var towerCont = this.add.container(pivotX, pivotY);
  var tg = this.add.graphics();
  towerCont.add(tg);
  towerCont.setRotation(Phaser.Math.DegToRad(4.2));   // 살짝 왼쪽으로 기욺 — 불안정하고 오래된 느낌
  this._towerCont = towerCont;

  var towerH = H * (P ? 0.60 : 0.56);
  var baseW = Math.min(W * 0.30, 172);
  var topW = baseW * 0.5;
  var segs = 8;
  for (var s = 0; s < segs; s++) {
    var frac = s / (segs - 1);              // 0 = 밑동, 1 = 꼭대기
    var segW = baseW - (baseW - topW) * frac;
    var segH = towerH / segs;
    var segTopY = -(s + 1) * segH;
    var shade = (s % 2 === 0) ? INK.stone1 : INK.stone2;
    tg.fillStyle(shade, 1);
    tg.fillRect(-segW / 2, segTopY - 1, segW, segH + 2);
    // 가는 균열 — 결정론적으로(세션마다 안 바뀌게) sin 값으로 위치를 정한다
    tg.lineStyle(1, 0x000000, 0.35);
    var crackX = Math.sin(s * 2.7) * segW * 0.28;
    tg.lineBetween(crackX, segTopY, crackX + Math.cos(s) * 10, segTopY + segH);
    // 창 — 한 층 걸러 하나, 침침한 주황 불빛(탑 안에 뭔가 있다는 암시).
    // 광륜 반지름은 창 자체보다 살짝만 커야 한다 — segW*0.5 로 뒀더니 탑을 통째로
    // 덮는 거대한 원이 되어(실측 확인) 벽돌이 아니라 풍선처럼 보였다.
    if (s > 0 && s < segs - 1 && s % 2 === 1) {
      var winW = segW * 0.18, winH = segH * 0.34;
      var winCy = segTopY + segH * 0.5;
      tg.fillStyle(INK.window, 0.14);
      tg.fillCircle(0, winCy, winW * 1.6);        // 광륜 먼저(창보다 살짝만 크게)
      tg.fillStyle(INK.window, 0.9);
      tg.fillRect(-winW / 2, segTopY + segH * 0.32, winW, winH);   // 창은 그 위에
    }
  }
  // 꼭대기 흉벽(성가퀴)
  var topY = -segs * (towerH / segs);
  var crenN = 5;
  var lastW = topW;
  var toothW = lastW / (crenN * 2 - 1);
  tg.fillStyle(INK.stone2, 1);
  for (var c = 0; c < crenN; c++) {
    var tx = -lastW / 2 + c * toothW * 2;
    tg.fillRect(tx, topY - toothW * 1.1, toothW, toothW * 1.1);
  }

  // ── 영웅 — 등을 보인 채(오버더숄더) 탑을 올려다본다. 실제 게임 캐릭터 아트를 그대로 쓴다.
  // 화면 맨 아래 가장자리에 크게, 절반쯤 잘리게 세운다 — 오버더숄더 구도는 원래
  // 인물 상반신만 프레임 안에 들어온다. 처음엔 인물을 통째로 다 보이게 뒀더니
  // 치켜든 무기가 아래 규칙 문구·버튼을 뚫고 올라왔다(실측 확인) — 화면 밖으로 더 내린다.
  var heroKey = this.heroKey || 'vanguard';
  var heroDef = GAME.HEROES[heroKey] || GAME.HEROES.vanguard;
  var heroR = Math.min(W, H) * (P ? 0.20 : 0.15);
  var heroX = W * 0.5, heroY = H * (P ? 1.00 : 0.99);
  // 발밑 진영 링 — 컨트롤러 색으로 '이게 내 영웅' 을 표시
  g.lineStyle(3, GAME.CONFIG.COLORS.controller, 0.55);
  g.strokeEllipse(heroX, heroY + heroR * 0.35, heroR * 2.3, heroR * 0.62);
  g.fillStyle(0x000000, 0.4);
  g.fillEllipse(heroX, heroY + heroR * 0.35, heroR * 2.1, heroR * 0.5);
  // facing = -PI/2 → dir8.back === true → 얼굴이 안 보이고 무기가 몸에 가려진다(등 뒤 시점)
  GAME.UI.drawUnitFlat(g, heroDef, heroX, heroY, GAME.CONFIG.COLORS.controller, 1,
    heroR / (heroDef.radius || 17), -Math.PI / 2);

  // ── 번개 ──
  this._lightningG = this.add.graphics();
  this._flashRect = this.add.rectangle(W / 2, H / 2, W, H, 0xffffff, 1).setAlpha(0);
  this._scheduleLightning();
  this.events.once('shutdown', function () { self._stopLightning(); });

  // ── 텍스트(양피지 톤) ──
  var y = u * 4;
  var title = GAME.UI.text(this, W / 2, y, '통곡의 탑',
    { size: P ? 'display' : 'display', color: INK.parchment, origin: 0.5 }).setOrigin(0.5, 0);
  title.setFontSize((P ? 30 : 44));
  title.setShadow(0, 3, '#000000', 6, false, true);
  y = title.y + title.height + u * 0.6;
  var sub = GAME.UI.text(this, W / 2, y,
    floor + '층' + (rec.best ? ('  ·  최고 ' + rec.best + '층') : '  ·  첫 도전'),
    { size: 'body', color: INK.gold, origin: 0.5 }).setOrigin(0.5, 0);
  sub.setShadow(0, 2, '#000000', 5, false, true);

  // 규칙 설명 — 짧은 한 줄로 못박는다. 두 줄로 늘어나면 아래 버튼과 겹쳤다(실측 확인) —
  // 그래서 길이를 아예 한 줄에 들어가는 짧은 문장으로 줄였다(줄바꿈 여지를 없앰).
  var E = GAME.Tower.EARLY_FLOORS;
  var ruleTxt = (floor <= E)
    ? ('1~' + E + '층 연습 구간 · ' + (E + 1) + '층부터 조작 필수')
    : ('영웅·장비 유지 · 골드로 능력치 성장');

  // ── 버튼 영역 스크림 + 버튼 3개 (아래에서 위로) ──
  var bw = Math.min(W - 30, 420);
  var bh = u * 7;
  var gap = u * 1.4;
  var byBottom = H - u * 2;
  // 규칙 한 줄 + 여유 만큼 위로 더 떼어(예전엔 u*4 만 줬다가 겹쳤다) 스크림을 시작한다.
  var scrimTop = byBottom - bh * 3.2 - gap * 2 - u * 7;
  var scrimBands = 10;
  for (var sb = 0; sb < scrimBands; sb++) {
    var st = sb / (scrimBands - 1);
    // 영웅이 이 구간까지 크게 서 있어서(오버더숄더 구도), 버튼 위/사이 틈으로
    // 검·투구 실루엣이 비쳐 보였다(실측 2회 확인). 선형 램프는 스크림 시작 지점(st=0)의
    // 불투명도가 0 이라 '도전' 버튼 바로 위 틈에서 여전히 30% 남짓밖에 안 가려졌다.
    // **시작부터 어느 정도 어둡게(0.38) 깔고**, 그 뒤로 가파르게 올려 버튼 구간
    // 진입 전에 사실상 불투명(0.95)에 닿게 한다.
    g.fillStyle(0x000000, Math.min(0.95, 0.38 + st * 2.4));
    g.fillRect(0, scrimTop + (H - scrimTop) * (sb / scrimBands), W, (H - scrimTop) / scrimBands + 1);
  }

  GAME.UI.text(this, W / 2, scrimTop + u * 1.6, ruleTxt,
    { size: P ? 'caption' : 'body', color: INK.dim, origin: 0.5, align: 'center', wrap: W - 40 }
  ).setOrigin(0.5, 0);

  var darkBtnOpts = {
    fill: 0x14141c, line: 0xffd166, hover: 0x1e1e28, press: 0x0e0e14,
    color: INK.parchment, radius: GAME.UI.R ? GAME.UI.R.md : 10
  };

  GAME.UI.button(this, W / 2, byBottom - bh * 0.5, bw, bh, '← 메뉴', function () {
    self.scene.start('Menu');
  }, Object.assign({ fontSize: P ? 15 : 15 }, darkBtnOpts));

  GAME.UI.button(this, W / 2, byBottom - bh * 1.5 - gap, bw, bh, '🏆 랭킹', function () {
    self.scene.start('Rank', { scope: 'live' });
  }, Object.assign({ fontSize: P ? 17 : 16 }, darkBtnOpts));

  var challengeLabel = this.run ? ('도전 계속하기  —  ' + floor + '층') : '도전';
  GAME.UI.button(this, W / 2, byBottom - bh * 2.5 - gap * 2, bw, bh + u * 0.8, challengeLabel,
    function () { self.scene.restart({ step: 'challenge' }); },
    { fill: 0x2a2016, line: 0xffd166, hover: 0x352a1e, press: 0x1e1710,
      color: '#ffd166', fontSize: P ? 20 : 22, radius: GAME.UI.R ? GAME.UI.R.md : 10 });
};

// 두 색을 f(0~1) 비율로 섞는다 — 하늘 그라디언트용
GAME.TowerScene.prototype._lerpColor = function (a, b, f) {
  var ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  var br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  var r = Math.round(ar + (br - ar) * f), gg = Math.round(ag + (bg - ag) * f), bl = Math.round(ab + (bb - ab) * f);
  return (r << 16) | (gg << 8) | bl;
};

// 번개 — 무작위 간격(2.5~7초)으로 한 번씩. 씬을 나가면 타이머가 자동으로 멎도록
// this.time(씬 전용 타임 시스템)만 쓴다.
GAME.TowerScene.prototype._scheduleLightning = function () {
  var self = this;
  var delay = 2500 + Math.random() * 4500;
  this._boltTimer = this.time.delayedCall(delay, function () {
    self._strikeLightning();
    if (self._landingDark) self._scheduleLightning();
  });
};

GAME.TowerScene.prototype._stopLightning = function () {
  if (this._boltTimer) { this._boltTimer.remove(false); this._boltTimer = null; }
  this._landingDark = false;
};

GAME.TowerScene.prototype._strikeLightning = function () {
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var g = this._lightningG;
  if (!g) return;
  g.clear();
  var x = W * (0.28 + Math.random() * 0.44);
  var segs = 6, px = x, py = 0;
  var pts = [[px, py]];
  for (var i = 0; i < segs; i++) {
    px += (Math.random() - 0.5) * 60;
    py += (H * 0.5) / segs;
    pts.push([px, py]);
  }
  g.lineStyle(8, 0xeaf2ff, 0.16);
  drawPolyline(g, pts);
  g.lineStyle(3, 0xf4f8ff, 0.95);
  drawPolyline(g, pts);

  if (this._flashRect) {
    this._flashRect.setAlpha(0.5);
    this.tweens.add({ targets: this._flashRect, alpha: 0, duration: 300, ease: 'Quad.easeOut' });
  }
  var self = this;
  this.time.delayedCall(180, function () { if (g) g.clear(); });

  function drawPolyline(gr, points) {
    gr.beginPath();
    gr.moveTo(points[0][0], points[0][1]);
    for (var k = 1; k < points.length; k++) gr.lineTo(points[k][0], points[k][1]);
    gr.strokePath();
  }
};

// ═══════════════════════════════════════════════════════════════════════
//  2) 도전 화면 — 예전 로비 전체(영웅 선택 / 골드 상점 / 전투 시작)
// ═══════════════════════════════════════════════════════════════════════
GAME.TowerScene.prototype._buildChallenge = function () {
  var C = GAME.CONFIG.COLORS;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var P = GAME.CONFIG.PORTRAIT;
  var self = this;
  var u = H / 100;

  // 랜딩은 연출용 어두운 배경을 쓴다 — 여기서는 게임 본연의 테마로 되돌린다.
  this.cameras.main.setBackgroundColor(C.bg);

  var rec = this._rec, floor = this._floor, prof = this._prof;
  var budget = GAME.Tower.budgetFor(floor);

  var y = u * 5;
  function stack(label, gap) {
    y = label.y + label.height + (gap === undefined ? u * 1.6 : gap);
    return label;
  }

  var heroBudget = GAME.Tower.heroBudgetFor(floor);
  var bossDef = GAME.Tower.bossFor(floor);

  // 뒤로 — 랜딩(탑 소개 화면)으로
  GAME.UI.label(this, u * 3, u * 2.2, '←  탑 소개', P ? 13 : 13, C.textDim, 0)
    .setInteractive({ useHandCursor: true })
    .on('pointerdown', function () { self.scene.restart({ step: 'landing' }); });

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
      if (GAME.TowerRun && GAME.TowerRun.get()) GAME.TowerRun.end();
      self.scene.restart({ step: 'landing' });
    }, { fontSize: P ? 13 : 13 });
  }
  GAME.UI.button(this, W / 2, byBottom - bh * 0.5, bw, bh, '← 메뉴', function () {
    self.scene.start('Menu');
  }, { fontSize: P ? 15 : 15 });
  GAME.UI.button(this, W / 2, byBottom - bh * 1.5 - gap, bw, bh, '🏆 랭킹', function () {
    self.scene.start('Rank', { scope: 'live' });
  }, { fontSize: P ? 17 : 16 });
  this.panelMaxBottom = byBottom - bh * 2.5 - gap * 2 - (bh + u * 0.8) / 2 - 8;
  GAME.UI.button(this, W / 2, byBottom - bh * 2.5 - gap * 2, bw, bh + u * 0.8,
    this.run ? (floor + '층 전투 시작') : (floor + '층 도전 — 장비 고르기'), function () {
    GAME.Tower.pending = self.formation;
    if (self.run) {
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

  this._refresh();
};

// 도전 중 골드·능력치 표시 갱신. bump=true 면 골드 숫자가 튕기는 연출을 준다.
GAME.TowerScene.prototype._refreshRun = function (bump) {
  if (!this.run || !this.goldLabel) return;
  var C = GAME.CONFIG.COLORS;
  var self = this;
  var TR = GAME.TowerRun;

  this.goldLabel.setText('💰 골드  ' + this.run.gold);
  if (bump) {
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

  this.rationaleText.setText(this.run ? '' : ('이 층의 대응: ' + this.formation.rationale));

  var counts = {};
  this.formation.units.forEach(function (x) { counts[x.type] = (counts[x.type] || 0) + 1; });
  var keys = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
  function compFor(n) {
    var t = keys.slice(0, n).map(function (k) {
      return GAME.UNITS[k].name + ' ×' + counts[k];
    }).join('   ');
    if (keys.length > n) t += '  외 ' + (keys.length - n) + '종';
    return t;
  }
  var comp = compFor(keys.length);
  this.compText.setY(this.rationaleText.y + this.rationaleText.height + 6);
  this.compText.setText('적 ' + this.formation.units.length + '기 — ' + comp);

  if (this.panelMaxBottom) {
    var n = keys.length;
    while (n > 1 && this.compText.getBounds().bottom > this.panelMaxBottom) {
      n--;
      this.compText.setText('적 ' + this.formation.units.length + '기 — ' + compFor(n));
    }
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
