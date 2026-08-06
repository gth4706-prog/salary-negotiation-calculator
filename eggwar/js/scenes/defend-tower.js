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
//  0..56    상단 바 : 탑 이름 · 층/최고/격파 · [N회차 배치하기](주 행동) · [☰]
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
  // ⚒ 성장 — 배치하기(546..746) 왼쪽 빈 구간. 405..535 (오른쪽 이웃과 11px 간격)
  GROW_CX: 470, GROW_W: 130,
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
GAME.DefendTowerScene.prototype.init = function (data) {
  this.sheet = null;
  this.growth = null;
  // 층을 막아내고 돌아왔으면 **성장 화면을 먼저 띄운다** (2026-07-29, 사용자 지시).
  // 예전에는 ☰ 안에 숨어 있어서, 골드를 벌어도 쓸 곳이 있다는 걸 모른 채
  // 다음 층으로 넘어가는 경우가 많았다. 라운드가 끝난 그 순간이 고를 때다.
  this._autoGrowth = !!(data && data.cleared);
  // 파괴된 Phaser 객체는 여전히 truthy 라 `if (this._heroG)` 가드를 통과한다 —
  // 이 저장소에서 이미 터진 유형이다. 씬을 다시 들어올 때마다 반드시 비운다.
  this._heroG = null;
  this._heroGeo = null;
};

GAME.DefendTowerScene.prototype.create = function () {
  if (GAME.Music) GAME.Music.play('defend');
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
  if (GAME.CONFIG.PHONE) { this._createPhone(); this._maybeAutoGrowth(); return; }

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
    stack(GAME.UI.label(this, W / 2, y, '☠  보스 회차 — 더 강한 영웅이 옵니다',
      P ? 19 : 22, GAME.UI.TXT.danger, 0.5).setOrigin(0.5, 0), u * 1.0);
  }

  // 이번 층에 오는 공격 영웅 — 이걸 보고 배치를 짠다
  stack(GAME.UI.label(this, W / 2, y,
    '이번 회차 공격 영웅 —  ' + hero.name + '  (' + hero.trait + ')',
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
    '내 인구 ' + DT.placeBudgetFor(floor) +
    (DT.bonusBudget() ? (' (기본 ' + budget + ' + 증원 ' + DT.bonusBudget() + ')') : '') +
    '   ·   최고 ' + (rec.best || 0) + '회차   ·   격파 ' + (rec.kills || 0) + '회',
    P ? 14 : 17, C.accent, 0.5).setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(W - 30), u * 0.8);

  // ── 골드 (v0.36) ─────────────────────────────────────────────────────────
  // 적 영웅을 깎은 만큼 쌓인다. 유닛 레벨업·증원에 쓴다.
  stack(GAME.UI.label(this, W / 2, y,
    '◈ ' + DT.goldOf() + ' 골드' + this._levelSummaryText(),
    P ? 15 : 18, GAME.UI.TXT.crit, 0.5).setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(W - 30));

  var E = DT.EARLY_FLOORS;
  if (floor <= E) {
    stack(GAME.UI.label(this, W / 2, y,
      '1~' + E + '회차는 연습 구간. ' + (E + 1) + '회차부터는 제대로 배치하지 않으면 뚫립니다.',
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
    GAME.UI.button(this, W / 2, H - u * 2 - u * 2.5, Math.min(W - 60, 240), u * 5, '1회차부터 다시', function () {
      DT.fail();
      //  ⚠ **`scene.restart()` 를 부르지 않는다** (2026-08-03 사용자 신고: "화면 반짝임").
      //    씬을 통째로 다시 만들면 한 프레임 동안 화면이 비었다가 다시 그려져
      //    **깜빡임**으로 보인다. 시트를 열어 두고 버튼을 여러 번 누르는 화면이라
      //    누를 때마다 화면이 번쩍이면 조작감이 무너진다.
      //    바뀌는 것은 **골드·레벨·값 숫자뿐**이므로 그 자리들만 다시 쓴다.
      self._refreshGrowth();

    }, { fontSize: P ? 13 : 13 });
  }
  GAME.UI.button(this, W / 2, byBottom - bh * 0.5, bw, bh, '← 메뉴', function () {
    self.scene.start('Menu');
  }, { fontSize: P ? 15 : 15 });
  // 랭킹과 성장을 한 줄 2칸으로 — 성장(골드 사용처)이 랭킹보다 자주 눌린다.
  var gc = GAME.Layout.cols(2, { gap: 8, width: bw, left: (W - bw) / 2, pad: 0 });
  GAME.UI.button(this, gc[0].cx, byBottom - bh * 1.5 - gap, gc[0].w, bh,
    '⚒ 성장 (' + DT.goldOf() + ')', function () { self._openGrowth(); },
    { fill: GAME.UI.COL.panelPurple, line: GAME.CONFIG.COLORS.strategist,
      hover: GAME.UI.COL.panelPurpleHi, color: C.accentAlt, fontSize: P ? 16 : 16 });
  GAME.UI.button(this, gc[1].cx, byBottom - bh * 1.5 - gap, gc[1].w, bh, '🏆 랭킹', function () {
    self.scene.start('Rank', { scope: 'live' });
  }, { fontSize: P ? 16 : 16 });
  GAME.UI.button(this, W / 2, byBottom - bh * 2.5 - gap * 2, bw, bh + u * 0.8,
    floor + '회차 방어 — 배치하기', function () {
      self.scene.start('Build', { defendTower: floor });
    }, { fill: GAME.UI.COL.panelPurple, line: GAME.CONFIG.COLORS.strategist,
         hover: GAME.UI.COL.panelPurpleHi, color: C.accentAlt, fontSize: P ? 20 : 22 });

  this.events.on('shutdown', function () { self._closeGrowth(); });

  this._maybeAutoGrowth();
};

// 지금 올려둔 유닛 레벨 요약 — "  ·  전사 Lv.3 · 쇠뇌 진지 Lv.2"
// create 가 끝난 뒤 한 프레임 뒤에 연다 — 화면이 다 그려진 위에 얹혀야
// 패널이 배경보다 먼저 뜨는 깜빡임이 없다.
GAME.DefendTowerScene.prototype._maybeAutoGrowth = function () {
  if (!this._autoGrowth) return;
  this._autoGrowth = false;
  var self = this;
  this.time.delayedCall(60, function () {
    if (self.scene && self.scene.isActive() && self._openGrowth) self._openGrowth();
  });
};

GAME.DefendTowerScene.prototype._levelSummaryText = function () {
  if (!GAME.UnitLevel) return '';
  var raised = GAME.UnitLevel.raised();
  if (!raised.length) return '';
  var parts = [];
  var max = GAME.CONFIG.PHONE ? 2 : 3;      // 폰 가로 왼쪽 열은 184px 뿐 — 두 개면 한 줄에 들어간다
  for (var i = 0; i < raised.length && i < max; i++) {
    parts.push(GAME.UNITS[raised[i].key].name + ' Lv.' + raised[i].lv);
  }
  if (raised.length > max) parts.push('+' + (raised.length - max));
  return '   ·   ' + parts.join(' · ');
};

// ═══════════════════════════════════════════════════════════════════════════
//  폰 가로 (820×390) — 배치 화면과 같은 문법(상단 얇은 바 / 큰 본문 / 하단 한 줄)
//  ---------------------------------------------------------------------------
//  예전 화면은 3열(층 배지 / 설명 텍스트 / 버튼 4개)이었고 **아래 절반이 비어 있었다.**
//  설명문이 주인공이라 '읽는 화면'이지 게임 화면이 아니었다.
//
//  이 화면의 존재 이유는 하나다 — **"이번 층에 어떤 영웅이 쳐들어오는가."**
//  그래서 그 영웅을 실제 게임 아트로 크게 세우고(전투에서 보게 될 바로 그 모습),
//  부차 메뉴(랭킹·메뉴·1회차부터 다시)는 전부 ☰ 시트로 접었다.
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

  // ── 침입 영웅은 **살아 움직인다** ─────────────────────────────────────────
  //  통곡의 탑 캐릭터 선택과 같은 규율: 호흡(스쿼시&스트레치) + 주기적 공격 모션.
  //  그러려면 매 프레임 다시 그려야 하므로 **판(g)과 분리된 Graphics** 에 그린다 —
  //  g 를 통째로 다시 그리면 그 위에 얹힌 글자들이 매 프레임 덮인다.
  //  g 보다 나중에 만들어 판 위에 오고, 글자는 그 뒤에 만들어져 영웅 위에 온다.
  var hTop = K.BODY_TOP + 6, hBot = K.BODY_BOTTOM - 6;
  this._heroGeo = {
    r: (hBot - hTop) / 5,                           // 390 화면에서 49.2
    y: hTop + ((hBot - hTop) / 5) * 3.2,
    cx: K.HERO_CX,
    def: hero
  };
  this._heroG = this.add.graphics();
  this._drawHero();

  // ── 상단 바 ─────────────────────────────────────────────────────────────
  UI.text(this, K.PAD, 5, '수성의 탑', { size: 'heading', color: C.text });
  UI.text(this, K.PAD, 35, floor + '회차  ·  최고 ' + (rec.best || 0) + '회차  ·  격파 ' +
    (rec.kills || 0) + '회', { size: 'micro', color: C.textDim });

  UI.button(this, K.START_CX, K.BTN_CY, K.START_W, K.BTN_H, floor + '회차 배치하기',
    function () { self.scene.start('Build', { defendTower: floor }); },
    { fill: UI.COL.panelPurple, line: C.strategist, hover: UI.COL.panelPurpleHi,
      color: C.accentAlt, fontSize: 'buttonSm', hitPad: 6 });
  UI.button(this, K.MENU_CX, K.BTN_CY, K.MENU_W, K.BTN_H, '☰',
    function () { self._toggleSheet(); }, { fontSize: 'button', hitPad: 6 });
  // ⚒ 성장 — 골드로 유닛 레벨업 / 증원. 배치하기(546..746) 왼쪽 빈 구간에 넣는다.
  // 좌측 제목·층 정보는 최악(격파 999회)이어도 x≈300 에서 끝난다(실측).
  UI.button(this, K.GROW_CX, K.BTN_CY, K.GROW_W, K.BTN_H, '⚒ 성장',
    function () { self._openGrowth(); },
    { fill: UI.COL.panelPurple, line: C.strategist, hover: UI.COL.panelPurpleHi,
      color: C.accentAlt, fontSize: 'buttonSm', hitPad: 6 });

  // ── 본문 왼쪽: 층 현판 + 다음 보스까지 ──────────────────────────────────
  var badge = UI.floorBadge(this, K.LEFT_X + K.LEFT_W / 2, K.BODY_TOP + 14, floor,
    { boss: !!boss, width: 176, height: 132 });
  var band = UI.bandMeter(this, K.LEFT_X + 8, badge.bottom + 16, K.LEFT_W - 16,
    floor, DT.BOSS_EVERY);
  var ly = band.bounds().bottom + 8;
  if (boss) {
    UI.text(this, K.LEFT_X + K.LEFT_W / 2, ly, '☠ 보스 회차 — 더 강한 영웅', {
      size: 'micro', color: UI.TXT.danger, origin: 0.5, originY: 0,
      wrap: K.LEFT_W, align: 'center'
    });
  }

  // ── 본문 가운데: 누가 오는가 ────────────────────────────────────────────
  var mx = K.MID_X, mw = K.MID_W;
  UI.text(this, mx, K.BODY_TOP + 8, '이번 회차 침입 영웅', { size: 'micro', color: C.textDim });
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
  var midY = descT.y + descT.height + 8;
  var E = DT.EARLY_FLOORS;
  if (floor <= E) {
    var early = UI.text(this, mx, midY,
      '1~' + E + '회차는 연습 구간. ' + (E + 1) + '회차부터는 배치 없이는 뚫립니다.',
      { size: 'micro', color: C.textFaint, wrap: mw });
    midY = early.y + early.height + 8;
  }
  // ── 골드 + 유닛 레벨 (v0.36) ─────────────────────────────────────────────
  //  왼쪽 열은 보스 층에서 [현판 132 + 게이지 + 보스 경고 2줄] 로 이미 꽉 찬다(실측: 60층에서 겹침).
  //  하단 줄도 60층이면 "체력 +259% · 공격 +179% · 숙련 95%" 로 길어져 자리가 없다.
  //  가운데 열(196..492)의 설명문 아래가 유일하게 남는 자리다.
  var goldT = UI.text(this, mx, midY, '◈ ' + DT.goldOf() + ' 골드',
    { size: 'caption', color: UI.TXT.crit, wrap: mw });
  var lvTxt = this._levelSummaryText();
  if (lvTxt) {
    UI.text(this, mx, goldT.y + goldT.height + 4, lvTxt.replace(/^\s+·\s+/, ''),
      { size: 'micro', color: C.textDim, wrap: mw });
  }

  // ── 하단 한 줄: 영웅 능력치·보정 + 내 배치 예산 ─────────────────────────
  var footCy = K.FOOT_Y + K.FOOT_H / 2;
  UI.text(this, 18, footCy,
    '영웅 예산 ' + heroBudget + '   ·   체력 +' + Math.round((mods.hp - 1) * 100) +
    '%   ·   공격 +' + Math.round((mods.damage - 1) * 100) +
    '%   ·   숙련 ' + Math.round(skill * 100) + '%',
    { size: 'caption', color: C.text, origin: 0, originY: 0.5 });
  UI.text(this, W - K.VER_W - 16, footCy,
    '내 인구 ' + DT.placeBudgetFor(floor) +
    (DT.bonusBudget() ? (' (+' + DT.bonusBudget() + ')') : ''),
    { size: 'caption', color: C.accent, origin: 1, originY: 0.5 });

  this.events.on('shutdown', function () { self._closeSheet(); self._closeGrowth(); });
};

// ═══════════════════════════════════════════════════════════════════════════
//  ⚒ 성장 시트 — 골드로 ① 유닛 레벨업 ② 증원(배치 예산)
//  ---------------------------------------------------------------------------
//  요청 원문: "얻은 골드로 추가 유닛을 배치할 수 있게 하거나 특정 유닛의 레벨을 올릴 수 있게".
//
//  왜 팝업(시트)인가 — 로비 화면은 폰 가로 390px 에 이미 3단(바/본문/하단줄)이 꽉 차 있다.
//  상점을 본문에 펼치면 이 화면의 주인공(침입 영웅)을 밀어내야 한다.
//  `CLAUDE.md`: "세로에서 목록이 안 들어가면 팝업으로 뺀다" — 폰 가로도 같은 이유다.
//
//  레벨업 대상은 **지금 배치해 둔 유닛 종류**만 보여준다. 10종을 다 늘어놓으면
//  폰 가로에 안 들어가고(칸 높이가 터치 하한 아래로 내려간다), 안 쓰는 유닛을 올릴
//  이유도 없다. 아직 한 번도 배치한 적이 없으면 안내만 띄운다.
//  · 시트는 PC/폰 공통이다 — 크기(700×306)가 폰 가로(820×390)에 들어가므로 나눌 이유가 없다.
// ═══════════════════════════════════════════════════════════════════════════
GAME.DefendTowerScene.prototype._closeGrowth = function () {
  if (!this.growth) return;
  var o = this.growth;
  this.growth = null;
  for (var i = 0; i < o.length; i++) if (o[i] && o[i].destroy) o[i].destroy();
};

// 이 도전에서 레벨을 올릴 수 있는 유닛 종류 — 마지막 배치에 실제로 쓴 것들
GAME.DefendTowerScene.prototype._growthTypes = function () {
  var rec = GAME.DefendTower.get();
  var seen = {}, out = [], i, t;
  var placed = rec.placed || [];
  for (i = 0; i < placed.length; i++) {
    t = placed[i] && placed[i].type;
    if (!t || !GAME.UNITS[t] || seen[t]) continue;
    seen[t] = 1;
    out.push(t);
  }
  // 이미 레벨을 올려둔 종류는 배치에서 빠져도 계속 보여준다(되돌릴 수 있어야 한다)
  var raised = GAME.UnitLevel ? GAME.UnitLevel.raised() : [];
  for (i = 0; i < raised.length; i++) {
    if (!seen[raised[i].key]) { seen[raised[i].key] = 1; out.push(raised[i].key); }
  }
  return out.slice(0, 5);
};

GAME.DefendTowerScene.prototype._openGrowth = function () {
  var self = this;
  var C = GAME.CONFIG.COLORS, UI = GAME.UI;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var DT = GAME.DefendTower, UL = GAME.UnitLevel;
  this._closeSheet();
  this._closeGrowth();
  if (!UL) return;

  var objs = [];
  var pw = Math.min(700, W - 40), phh = Math.min(306, H - 60);
  var px0 = Math.round((W - pw) / 2), py0 = Math.round((H - phh) / 2);
  var bh = 56, gap = 12;
  var bw = Math.floor((pw - 40 - gap * 2) / 3);
  var col = [px0 + 20 + bw / 2, px0 + 20 + bw + gap + bw / 2, px0 + 20 + (bw + gap) * 2 + bw / 2];
  var row1 = py0 + 116, row2 = row1 + bh + gap, closeCy = row2 + bh + gap + 4;

  var veil = this.add.rectangle(W / 2, H / 2, W, H, UI.COL.bg, 0.74).setDepth(900);
  veil.setInteractive();
  veil.on('pointerdown', function () { self._closeGrowth(); });
  objs.push(veil);
  objs.push(UI.panel(this, px0, py0, pw, phh, { level: 1 }).setDepth(901));

  objs.push(UI.text(this, W / 2, py0 + 10, '⚒ 성장   —   ◈ ' + DT.goldOf() + ' 골드',
    { size: 'subhead', color: C.accentAlt, origin: 0.5, originY: 0 }).setDepth(902));
  objs.push(UI.text(this, W / 2, py0 + 42,
    '골드는 침입 영웅의 체력을 깎을 때마다 들어온다. 격퇴하면 가장 많다.',
    { size: 'micro', color: C.textDim, origin: 0.5, originY: 0 }).setDepth(902));
  objs.push(UI.text(this, W / 2, py0 + 66,
    '레벨은 유닛 종류 단위로 최대 ' + UL.MAX + '단. 지면 골드·레벨·증원이 전부 사라진다.',
    { size: 'micro', color: UI.TXT.crit, origin: 0.5, originY: 0 }).setDepth(902));

  function mk(cx, cy, label, fn, opts) {
    var b = UI.button(self, cx, cy, bw, bh, label, fn, opts);
    b.setDepth(902);
    if (b.text) b.text.setAlign('center');
    objs.push(b);
    // ⚠ `UI.button` 의 destroy() 는 텍스트와 히트박스만 지우고 **면(gfx)은 남긴다.**
    //   시트를 닫아도 둥근 사각형이 화면에 눌어붙는다 — gfx 를 따로 목록에 넣어 같이 지운다.
    if (b.gfx) objs.push(b.gfx);
    return b;
  }

  var types = this._growthTypes();
  var i, slot = 0;
  for (i = 0; i < types.length; i++) {
    (function (key) {
      var def = GAME.UNITS[key];
      var lv = UL.levelOf(key);
      var cost = UL.costToNext(key);
      //  ── 무엇이 좋아지는가를 **버튼에 적는다** (2026-08-03 사용자 신고) ────
      //  "유닛 강화는 어떻게 강해지는지 사용자가 알 수가 없어."
      //  맞는 지적이다 — 예전에는 `전사 Lv.2 → 3 · ◈120` 이 전부라 **무엇이 얼마나
      //  오르는지** 화면 어디에도 없었다. 값을 치르는 화면에서 대가만 보이고 얻는
      //  것이 안 보이면 고를 근거가 없다. 지금 배수와 다음 배수를 나란히 보여 준다.
      var mNow = UL.modsForLevel ? UL.modsForLevel(lv) : null;
      var mNext = (cost !== null && UL.modsForLevel) ? UL.modsForLevel(lv + 1) : null;
      var pctOf = function (m) {
        if (!m) return '';
        return '체력 +' + Math.round((m.hp - 1) * 100) + '%  공격 +' + Math.round((m.damage - 1) * 100) + '%';
      };
      var gain = mNext ? (pctOf(mNow) + '  →  ' + pctOf(mNext)) : pctOf(mNow);
      var label = def.name + '  Lv.' + lv +
        (cost === null ? '   최대' : ('  →  ' + (lv + 1) + '   ◈ ' + cost)) +
        (gain ? '\n' + gain : '');
      var cx = col[slot % 3], cy = slot < 3 ? row1 : row2;
      var b = mk(cx, cy, label, function () {
        if (UL.levelUp(key)) {
          if (GAME.Sound && GAME.Sound.play) GAME.Sound.play('click');
          self._closeGrowth();
      //  ⚠ **`scene.restart()` 를 부르지 않는다** (2026-08-03 사용자 신고: "화면 반짝임").
      //    씬을 통째로 다시 만들면 한 프레임 동안 화면이 비었다가 다시 그려져
      //    **깜빡임**으로 보인다. 시트를 열어 두고 버튼을 여러 번 누르는 화면이라
      //    누를 때마다 화면이 번쩍이면 조작감이 무너진다.
      //    바뀌는 것은 **골드·레벨·값 숫자뿐**이므로 그 자리들만 다시 쓴다.
      self._refreshGrowth();

        }
      }, { fontSize: 'micro' });
      if (cost === null || DT.goldOf() < cost) b.setDisabled(true);
      slot++;
    })(types[i]);
  }

  if (!types.length) {
    objs.push(UI.text(this, W / 2, row1 - 4,
      '먼저 한 번 배치하면 그 유닛들을 여기서 키울 수 있다.',
      { size: 'caption', color: C.textDim, origin: 0.5, originY: 0 }).setDepth(902));
    slot = 3;                                   // 증원 버튼은 둘째 줄로 내린다
  }

  // 증원 — 배치 예산 +STEP
  var price = DT.extraBudgetPrice();
  var bcx = col[slot % 3], bcy = slot < 3 ? row1 : row2;
  //  ⚠ `EXTRA_BUDGET_STEP` 은 **옛 예산 단위**(10)다. 화면은 인구로 바뀌었으므로
  //    10 으로 나눠 보여줘야 한다 — 그대로 두면 "증원 +10 인구"가 되어
  //    실제로 늘어나는 1명과 어긋난다(사용자 신고).
  var POPD = (GAME.BuildScene && GAME.BuildScene.POP_DIV) || 10;
  var stepPop = Math.max(1, Math.round(DT.EXTRA_BUDGET_STEP / POPD));
  var eb = mk(bcx, bcy, '증원  +' + stepPop + ' 인구\n◈ ' + price, function () {
    if (DT.buyBudget()) {
      if (GAME.Sound && GAME.Sound.play) GAME.Sound.play('click');
      self._closeGrowth();
      self.scene.restart();
    }
  }, { fontSize: 'micro', fill: UI.COL.panelTeal, line: C.controller,
       hover: UI.COL.panelTealHi, color: C.accent });
  if (DT.goldOf() < price) eb.setDisabled(true);

  mk(col[1], closeCy, '닫기', function () { self._closeGrowth(); }, { fontSize: 'buttonSm' });

  this.growth = objs;
};

// ═══════════════════════════════════════════════════════════════════════════
//  ☰ 시트 (폰 가로 전용) — 랭킹 · 1회차부터 다시 · 메뉴
//  build.js 와 같은 방식이다. GAME.Modal 은 항목 높이가 화면(390)을 넘어 못 쓴다.
// ═══════════════════════════════════════════════════════════════════════════
GAME.DefendTowerScene.prototype._toggleSheet = function () {
  if (this.sheet) this._closeSheet(); else this._openSheet();
};

//  성장 화면의 숫자만 새로 그린다 — 씬을 다시 만들지 않는다(반짝임 방지).
//  ⚠ 시트를 닫았다 여는 방식이라 **한 프레임 안에** 끝난다. 화면 전체를 버리는
//    `scene.restart()` 와 달리 배경·전장 그림이 그대로 남아 깜빡임이 없다.
GAME.DefendTowerScene.prototype._refreshGrowth = function () {
  try {
    var open = !!this.sheet;
    if (open) { this._closeSheet(); this._openGrowth(); }
    if (this._goldLbl && this._goldLbl.setText) {
      this._goldLbl.setText('◈ ' + GAME.DefendTower.get().gold);
    }
  } catch (e) { /* 화면이 이미 바뀌었으면 아무 일도 아니다 */ }
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
    '한 회차 = 쳐들어오는 영웅 하나를 막아내는 것. 지면 1회차부터 다시.',
    { size: 'micro', color: C.textDim, origin: 0.5, originY: 0 }).setDepth(902));
  //  ⚠ 같은 한 칸 어긋남이 여기에도 있었다(`js/ui-hud.js` 의 `bandMeter` 주석 참조).
  //    보스 판정은 `floor % BOSS_EVERY === 0` 인데 표시는 `(floor-1) % ...` 이라
  //    보스 회차에 서서 "다음 보스까지 1회차"라고 말했다. 규칙에서 그대로 유도한다.
  var dtInto = floor % DT.BOSS_EVERY;
  objs.push(UI.text(this, W / 2, py0 + 70,
    dtInto === 0 ? '보스 회차' : ('다음 보스까지 ' + (DT.BOSS_EVERY - dtInto) + '회차'),
    { size: 'micro', color: UI.TXT.crit, origin: 0.5, originY: 0 }).setDepth(902));

  function mk(cx, cy, label, fn, opts) {
    var b = UI.button(self, cx, cy, bw, bh, label, fn, opts);
    b.setDepth(902);
    objs.push(b);
    if (b.gfx) objs.push(b.gfx);   // destroy() 가 면을 안 지운다 — 위 성장 시트 주석 참조
    return b;
  }

  mk(bx[0], cyA, '🏆 랭킹', function () {
    self._closeSheet(); self.scene.start('Rank', { scope: 'live' });
  }, { fontSize: 'buttonSm' });
  mk(bx[1], cyA, '← 메뉴', function () {
    self._closeSheet(); self.scene.start('Menu');
  }, { fontSize: 'buttonSm' });
  var restart = mk(bx[2], cyA, '1회차부터 다시', function () {
    self._closeSheet(); DT.fail(); self.scene.restart();
  }, { fontSize: 'buttonSm' });
  if (floor <= 1) restart.setDisabled(true);

  mk(bx[1], cyC, '닫기', function () { self._closeSheet(); }, { fontSize: 'buttonSm' });

  this.sheet = objs;
};

// 침입 영웅 한 마리를 그린다(발밑 링 포함). `idle` 을 안 넘기면 정지 포즈다.
GAME.DefendTowerScene.prototype._drawHero = function () {
  var geo = this._heroGeo, g = this._heroG;
  if (!geo || !g || !g.scene) return;
  var UI = GAME.UI;
  var hr = geo.r, hy = geo.y;
  g.clear();
  // 발밑 링 — 몸통 바닥(약 1.45r 아래)에 맞춘다. 0.35r 로 두면 알 몸통에 가려 안 보인다.
  var ringY = hy + hr * 1.45;
  g.fillStyle(UI.COL.shadow === undefined ? 0x000000 : UI.COL.shadow, 0.22);
  g.fillEllipse(geo.cx, ringY, hr * 2.0, hr * 0.5);
  g.lineStyle(3, UI.COL.controller, 0.6);
  g.strokeEllipse(geo.cx, ringY, hr * 2.2, hr * 0.58);
  // facing = +PI/2 → 정면(우리를 본다). tower.js 는 -PI/2(등 뒤)를 쓴다.
  // 10번째 인자가 idle(ms) — eggart 가 호흡·공격 포즈를 만든다.
  UI.drawUnitFlat(g, geo.def, geo.cx, hy, UI.COL.controller, 1,
    hr / (geo.def.radius || 17), Math.PI / 2, null, this.time.now);
};

// 영웅만 매 프레임 다시 그린다. 판·글자는 건드리지 않는다.
GAME.DefendTowerScene.prototype.update = function () {
  if (this._heroG) this._drawHero();
};
