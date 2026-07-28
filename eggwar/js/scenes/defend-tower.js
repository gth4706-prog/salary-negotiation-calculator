window.GAME = window.GAME || {};

// 수성의 탑 로비 — 통곡의 탑의 거울.
//   통곡의 탑 : 영웅 하나로 진형을 몇 층까지 뚫느냐 (컨트롤러)
//   수성의 탑 : 진형 하나로 영웅을 몇 번 막아내느냐 (전략가)
// 한 층 = 공격 영웅 하나를 막아내는 것. 층이 오르면 영웅의 예산·스탯·숙련이 오른다.
// 전략가는 **어떤 영웅이 오는지 먼저 보고** 배치를 짠다 → 여기서 그 영웅을 알려준다.
GAME.DefendTowerScene = function () {
  Phaser.Scene.call(this, { key: 'DefendTower' });
};
GAME.DefendTowerScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.DefendTowerScene.prototype.constructor = GAME.DefendTowerScene;

// ── 폰 가로(820×390) 전용 좌표 — 배치 화면(build.js)과 같은 3단 구성 ───────────
//  0..56    상단 바 : 탑 이름 · 층/최고/격파 · [N층 배치하기](주 행동) · [☰]
//  62..320  본문    : **이번 층에 쳐들어오는 영웅**이 화면에서 가장 크다.
//                     왼쪽 = 층 현판 + 보스까지, 가운데 = 이름/특성/설명, 오른쪽 = 대형 아트
//  326..382 하단 줄 : 영웅 능력치·보정 + 내 배치 예산 한 줄
//  오른쪽 아래 VER_W 는 DOM 버전 배지(#ver) 자리라 비운다.
GAME.DefendTowerScene.PHONE = {
  PAD: 10,
  // 바 높이 60 · 버튼 56 은 **아이폰 SE(667×375, FIT 0.813)에서 화면 45.5px** 이 되는 값이다.
  // 48 로 두면 39.0px 라 44 CSS px 기준에 미달한다(실측).
  BAR_H: 60,
  BTN_H: 56, BTN_CY: 30,
  START_CX: 646, START_W: 200,
  MENU_CX: 782, MENU_W: 56,
  BODY_TOP: 66, BODY_BOTTOM: 320,
  LEFT_X: 10, LEFT_W: 184,
  MID_X: 196, MID_W: 296,
  // 침입 영웅이 서는 '무대' — 전장 바닥색을 깔아야 아이보리 달걀이 크림 배경에서 읽힌다
  // (build.js 팔레트 칩에서 같은 문제를 이미 겪었다).
  STAGE_X: 500, STAGE_W: 310,
  HERO_CX: 655,
  FOOT_Y: 326, FOOT_H: 56,
  VER_W: 62
};

// 씬을 다시 들어오면 캐시한 표시객체는 이미 파괴돼 있다(파괴된 객체도 truthy 다).
GAME.DefendTowerScene.prototype.init = function () {
  this.sheet = null;
};

GAME.DefendTowerScene.prototype.create = function () {
  var C = GAME.CONFIG.COLORS;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var P = GAME.CONFIG.PORTRAIT;
  var self = this;
  var u = H / 100;
  var DT = GAME.DefendTower;

  if (!GAME.Account.current()) { this.scene.start('Login'); return; }

  this.cameras.main.setBackgroundColor(C.bg);
  GAME.Iso.setMode('default');

  // 폰 가로(820×390)는 한 열로 흘릴 높이가 없다 — 아래에서 올라오는 버튼과
  // 위에서 내려오는 문구가 만난다(실측: 겹침 4건, 27px 버튼).
  if (GAME.CONFIG.PHONE) return this._createPhone();

  var rec = DT.get();
  var floor = rec.floor;
  var budget = DT.budgetFor(floor);          // 내(전략가) 배치 예산
  var skill = DT.skillFor(floor);
  var heroKey = DT.heroKeyFor(floor, skill);
  var hero = GAME.HEROES[heroKey];
  var heroBudget = DT.heroBudgetFor(floor);
  var boss = DT.isBossFloor(floor);
  var mods = DT.heroModsFor(floor);

  // 위쪽 블록은 실제로 그려진 높이만큼 내려가는 흐름 배치(세로에서 줄바꿈 겹침 방지)
  var y = u * 5;
  function stack(label, gap) {
    y = label.y + label.height + (gap === undefined ? u * 1.6 : gap);
    return label;
  }

  stack(GAME.UI.label(this, W / 2, y, '수성의 탑', P ? 26 : 40, C.text, 0.5)
    .setOrigin(0.5, 0), u * 1.0);

  var badge = GAME.UI.floorBadge(this, W / 2, y, floor, { boss: !!boss });
  y = badge.bottom + u * 1.2;

  var band = GAME.UI.bandMeter(this, W / 2 - Math.min(W - 60, 300) / 2, y,
    Math.min(W - 60, 300), floor, DT.BOSS_EVERY);
  y = band.bounds().bottom + u * 1.4;

  if (boss) {
    stack(GAME.UI.label(this, W / 2, y, '☠  보스 층 — 더 강한 영웅이 옵니다',
      P ? 19 : 22, GAME.UI.TXT.danger, 0.5).setOrigin(0.5, 0), u * 1.0);
  }

  // 이번 층에 오는 공격 영웅 — 이걸 보고 배치를 짠다
  stack(GAME.UI.label(this, W / 2, y,
    '이번 층 공격 영웅 —  ' + hero.name + '  (' + hero.trait + ')',
    P ? 17 : 21, GAME.UI.TXT.crit, 0.5).setOrigin(0.5, 0)
    .setAlign('center').setWordWrapWidth(W - 30), u * 0.8);

  stack(GAME.UI.label(this, W / 2, y, hero.desc,
    P ? 13 : 14, C.textDim, 0.5).setOrigin(0.5, 0)
    .setAlign('center').setLineSpacing(3).setWordWrapWidth(W - 44), u * 1.2);

  // 강함 지표 — 영웅 예산 + 층 강화 배수
  var toughPct = Math.round((mods.hp - 1) * 100);
  stack(GAME.UI.label(this, W / 2, y,
    '영웅 예산 ' + heroBudget + '   ·   체력 +' + toughPct + '% · 공격 +' + Math.round((mods.damage - 1) * 100) + '%' +
    '   ·   숙련 ' + Math.round(skill * 100) + '%',
    P ? 14 : 17, C.text, 0.5).setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(W - 30), u * 0.9);

  stack(GAME.UI.label(this, W / 2, y,
    '내 배치 예산 ' + budget + '   ·   최고 ' + (rec.best || 0) + '층   ·   격파 ' + (rec.kills || 0) + '회',
    P ? 14 : 17, C.accent, 0.5).setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(W - 30));

  var E = DT.EARLY_FLOORS;
  if (floor <= E) {
    stack(GAME.UI.label(this, W / 2, y,
      '1~' + E + '층은 연습 구간. ' + (E + 1) + '층부터는 제대로 배치하지 않으면 뚫립니다.',
      P ? 13 : 14, C.textDim, 0.5)
      .setOrigin(0.5, 0).setAlign('center').setLineSpacing(4).setWordWrapWidth(W - 40));
  }

  // ── 버튼 (아래에서 위로) ──
  var bw = Math.min(W - 30, 420);
  var bh = u * 7;
  var gap = u * 1.4;
  var restH = floor > 1 ? (u * 5 + gap) : 0;
  var byBottom = H - u * 2 - restH;

  if (floor > 1) {
    GAME.UI.button(this, W / 2, H - u * 2 - u * 2.5, Math.min(W - 60, 240), u * 5, '1층부터 다시', function () {
      DT.fail();
      self.scene.restart();
    }, { fontSize: P ? 13 : 13 });
  }
  GAME.UI.button(this, W / 2, byBottom - bh * 0.5, bw, bh, '← 메뉴', function () {
    self.scene.start('Menu');
  }, { fontSize: P ? 15 : 15 });
  GAME.UI.button(this, W / 2, byBottom - bh * 1.5 - gap, bw, bh, '🏆 랭킹', function () {
    self.scene.start('Rank', { scope: 'live' });
  }, { fontSize: P ? 17 : 16 });
  GAME.UI.button(this, W / 2, byBottom - bh * 2.5 - gap * 2, bw, bh + u * 0.8,
    floor + '층 방어 — 배치하기', function () {
      self.scene.start('Build', { defendTower: floor });
    }, { fill: GAME.UI.COL.panelPurple, line: GAME.CONFIG.COLORS.strategist,
         hover: GAME.UI.COL.panelPurpleHi, color: C.accentAlt, fontSize: P ? 20 : 22 });
};

// ═══════════════════════════════════════════════════════════════════════════
//  폰 가로 (820×390) — 배치 화면과 같은 문법(상단 얇은 바 / 큰 본문 / 하단 한 줄)
//  ---------------------------------------------------------------------------
//  예전 화면은 3열(층 배지 / 설명 텍스트 / 버튼 4개)이었고 **아래 절반이 비어 있었다.**
//  설명문이 주인공이라 '읽는 화면'이지 게임 화면이 아니었다.
//
//  이 화면의 존재 이유는 하나다 — **"이번 층에 어떤 영웅이 쳐들어오는가."**
//  그래서 그 영웅을 실제 게임 아트로 크게 세우고(전투에서 보게 될 바로 그 모습),
//  부차 메뉴(랭킹·메뉴·1층부터 다시)는 전부 ☰ 시트로 접었다.
//
//  캐릭터 크기는 실측 비율에서 역산한다 — 기준점에서 위 3.2r · 아래 1.8r(총 5r),
//  가로 반폭 약 2.1r. 본문 띠 높이를 5로 나눈 값이 r 이다(비율로 잡으면 발밑이 잘린다).
// ═══════════════════════════════════════════════════════════════════════════
GAME.DefendTowerScene.prototype._createPhone = function () {
  var C = GAME.CONFIG.COLORS, UI = GAME.UI;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var K = GAME.DefendTowerScene.PHONE;
  var self = this;
  var DT = GAME.DefendTower;

  var rec = DT.get();
  var floor = rec.floor;
  var budget = DT.budgetFor(floor);
  var skill = DT.skillFor(floor);
  var heroKey = DT.heroKeyFor(floor, skill);
  var hero = GAME.HEROES[heroKey];
  var heroBudget = DT.heroBudgetFor(floor);
  var boss = DT.isBossFloor(floor);
  var mods = DT.heroModsFor(floor);
  this.phFloor = floor;

  // 판(바·하단 줄·캐릭터)은 한 Graphics 에 그린다. **글자보다 먼저** 만들어야 안 덮인다.
  var g = this.add.graphics();
  g.fillStyle(UI.COL.surface, 1);
  g.fillRect(0, 0, W, K.BAR_H);
  g.lineStyle(1, UI.COL.border, 1);
  g.lineBetween(0, K.BAR_H - 0.5, W, K.BAR_H - 0.5);
  g.fillStyle(UI.COL.surface, 1);
  g.fillRoundedRect(4, K.FOOT_Y, W - 8 - K.VER_W, K.FOOT_H, 12);
  g.lineStyle(1, UI.COL.border, 1);
  g.strokeRoundedRect(4.5, K.FOOT_Y + 0.5, W - 9 - K.VER_W, K.FOOT_H - 1, 12);

  // ── 본문 오른쪽: 이번 층에 쳐들어오는 영웅 (이 화면의 주인공) ────────────
  g.fillStyle(C.arenaFill, 1);
  g.fillRoundedRect(K.STAGE_X, K.BODY_TOP, K.STAGE_W, K.BODY_BOTTOM - K.BODY_TOP, 14);
  g.lineStyle(1.5, C.arenaLine, 1);
  g.strokeRoundedRect(K.STAGE_X + 0.75, K.BODY_TOP + 0.75,
    K.STAGE_W - 1.5, K.BODY_BOTTOM - K.BODY_TOP - 1.5, 14);

  var hTop = K.BODY_TOP + 6, hBot = K.BODY_BOTTOM - 6;
  var hr = (hBot - hTop) / 5;                       // 390 화면에서 49.2
  var hy = hTop + hr * 3.2;
  // 발밑 링 — 몸통 바닥(약 1.45r 아래)에 맞춘다. 0.35r 로 두면 알 몸통에 가려 안 보인다.
  var ringY = hy + hr * 1.45;
  g.fillStyle(UI.COL.shadow === undefined ? 0x000000 : UI.COL.shadow, 0.22);
  g.fillEllipse(K.HERO_CX, ringY, hr * 2.0, hr * 0.5);
  g.lineStyle(3, UI.COL.controller, 0.6);
  g.strokeEllipse(K.HERO_CX, ringY, hr * 2.2, hr * 0.58);
  // facing = +PI/2 → 정면(우리를 본다). tower.js 는 -PI/2(등 뒤)를 쓴다.
  UI.drawUnitFlat(g, hero, K.HERO_CX, hy, UI.COL.controller, 1,
    hr / (hero.radius || 17), Math.PI / 2);

  // ── 상단 바 ─────────────────────────────────────────────────────────────
  UI.text(this, K.PAD, 5, '수성의 탑', { size: 'heading', color: C.text });
  UI.text(this, K.PAD, 35, floor + '층  ·  최고 ' + (rec.best || 0) + '층  ·  격파 ' +
    (rec.kills || 0) + '회', { size: 'micro', color: C.textDim });

  UI.button(this, K.START_CX, K.BTN_CY, K.START_W, K.BTN_H, floor + '층 배치하기',
    function () { self.scene.start('Build', { defendTower: floor }); },
    { fill: UI.COL.panelPurple, line: C.strategist, hover: UI.COL.panelPurpleHi,
      color: C.accentAlt, fontSize: 'buttonSm', hitPad: 6 });
  UI.button(this, K.MENU_CX, K.BTN_CY, K.MENU_W, K.BTN_H, '☰',
    function () { self._toggleSheet(); }, { fontSize: 'button', hitPad: 6 });

  // ── 본문 왼쪽: 층 현판 + 다음 보스까지 ──────────────────────────────────
  var badge = UI.floorBadge(this, K.LEFT_X + K.LEFT_W / 2, K.BODY_TOP + 14, floor,
    { boss: !!boss, width: 176, height: 132 });
  var band = UI.bandMeter(this, K.LEFT_X + 8, badge.bottom + 16, K.LEFT_W - 16,
    floor, DT.BOSS_EVERY);
  var ly = band.bounds().bottom + 8;
  if (boss) {
    UI.text(this, K.LEFT_X + K.LEFT_W / 2, ly, '☠ 보스 층 — 더 강한 영웅', {
      size: 'micro', color: UI.TXT.danger, origin: 0.5, originY: 0,
      wrap: K.LEFT_W, align: 'center'
    });
  }

  // ── 본문 가운데: 누가 오는가 ────────────────────────────────────────────
  var mx = K.MID_X, mw = K.MID_W;
  UI.text(this, mx, K.BODY_TOP + 8, '이번 층 침입 영웅', { size: 'micro', color: C.textDim });
  var nameT = UI.text(this, mx, K.BODY_TOP + 30, hero.name, {
    size: 'title', color: UI.TXT.crit
  });
  var traitY = nameT.y + nameT.height + 4;
  var tchip = UI.chip(this, mx, traitY, hero.trait, {
    size: 'micro', color: C.accent, fill: UI.COL.panelTeal, line: C.controller
  });
  var dy = traitY + tchip.h + 10;
  var descT = UI.text(this, mx, dy, hero.desc, {
    size: 'caption', color: C.textDim, wrap: mw
  });
  var E = DT.EARLY_FLOORS;
  if (floor <= E) {
    UI.text(this, mx, descT.y + descT.height + 8,
      '1~' + E + '층은 연습 구간. ' + (E + 1) + '층부터는 배치 없이는 뚫립니다.',
      { size: 'micro', color: C.textFaint, wrap: mw });
  }

  // ── 하단 한 줄: 영웅 능력치·보정 + 내 배치 예산 ─────────────────────────
  var footCy = K.FOOT_Y + K.FOOT_H / 2;
  UI.text(this, 18, footCy,
    '영웅 예산 ' + heroBudget + '   ·   체력 +' + Math.round((mods.hp - 1) * 100) +
    '%   ·   공격 +' + Math.round((mods.damage - 1) * 100) +
    '%   ·   숙련 ' + Math.round(skill * 100) + '%',
    { size: 'caption', color: C.text, origin: 0, originY: 0.5 });
  UI.text(this, W - K.VER_W - 16, footCy, '내 배치 예산 ' + budget,
    { size: 'caption', color: C.accent, origin: 1, originY: 0.5 });

  this.events.on('shutdown', function () { self._closeSheet(); });
};

// ═══════════════════════════════════════════════════════════════════════════
//  ☰ 시트 (폰 가로 전용) — 랭킹 · 1층부터 다시 · 메뉴
//  build.js 와 같은 방식이다. GAME.Modal 은 항목 높이가 화면(390)을 넘어 못 쓴다.
// ═══════════════════════════════════════════════════════════════════════════
GAME.DefendTowerScene.prototype._toggleSheet = function () {
  if (this.sheet) this._closeSheet(); else this._openSheet();
};

GAME.DefendTowerScene.prototype._closeSheet = function () {
  if (!this.sheet) return;
  var o = this.sheet;
  this.sheet = null;
  for (var i = 0; i < o.length; i++) if (o[i] && o[i].destroy) o[i].destroy();
};

GAME.DefendTowerScene.prototype._openSheet = function () {
  var self = this;
  var C = GAME.CONFIG.COLORS, UI = GAME.UI;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var DT = GAME.DefendTower;
  var floor = this.phFloor || 1;
  this._closeSheet();

  var objs = [];
  var pw = 560, px0 = Math.round((W - pw) / 2), py0 = 52, phh = 236;
  var bw = Math.floor((pw - 40 - 24) / 3), bh = 56;
  var bx = [px0 + 20 + bw / 2, px0 + 20 + bw + 12 + bw / 2, px0 + 20 + (bw + 12) * 2 + bw / 2];
  var cyA = py0 + 124, cyC = py0 + 190;

  var veil = this.add.rectangle(W / 2, H / 2, W, H, UI.COL.bg, 0.74).setDepth(900);
  veil.setInteractive();
  veil.on('pointerdown', function () { self._closeSheet(); });
  objs.push(veil);
  objs.push(UI.panel(this, px0, py0, pw, phh, { level: 1 }).setDepth(901));

  objs.push(UI.text(this, W / 2, py0 + 10, '탑 메뉴',
    { size: 'subhead', color: C.text, origin: 0.5, originY: 0 }).setDepth(902));
  objs.push(UI.text(this, W / 2, py0 + 44,
    '한 층 = 쳐들어오는 영웅 하나를 막아내는 것. 지면 1층부터 다시.',
    { size: 'micro', color: C.textDim, origin: 0.5, originY: 0 }).setDepth(902));
  objs.push(UI.text(this, W / 2, py0 + 70,
    '다음 보스 층까지 ' + (DT.BOSS_EVERY - ((floor - 1) % DT.BOSS_EVERY)) + '층',
    { size: 'micro', color: UI.TXT.crit, origin: 0.5, originY: 0 }).setDepth(902));

  function mk(cx, cy, label, fn, opts) {
    var b = UI.button(self, cx, cy, bw, bh, label, fn, opts);
    b.setDepth(902);
    objs.push(b);
    return b;
  }

  mk(bx[0], cyA, '🏆 랭킹', function () {
    self._closeSheet(); self.scene.start('Rank', { scope: 'live' });
  }, { fontSize: 'buttonSm' });
  mk(bx[1], cyA, '← 메뉴', function () {
    self._closeSheet(); self.scene.start('Menu');
  }, { fontSize: 'buttonSm' });
  var restart = mk(bx[2], cyA, '1층부터 다시', function () {
    self._closeSheet(); DT.fail(); self.scene.restart();
  }, { fontSize: 'buttonSm' });
  if (floor <= 1) restart.setDisabled(true);

  mk(bx[1], cyC, '닫기', function () { self._closeSheet(); }, { fontSize: 'buttonSm' });

  this.sheet = objs;
};
