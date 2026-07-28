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
//  폰 가로 (820×390) — 3열
//   왼쪽 = 지금 몇 층인가(현판 + 보스까지 게이지)
//   가운데 = **이번 층에 오는 영웅**(이걸 보고 배치를 짠다 — 이 화면의 존재 이유다)
//   오른쪽 = 버튼
// ═══════════════════════════════════════════════════════════════════════════
GAME.DefendTowerScene.prototype._createPhone = function () {
  var C = GAME.CONFIG.COLORS, UI = GAME.UI;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
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

  var PAD = 12, BTN_W = 216, GAP = 14;
  var bx = W - PAD - BTN_W;                 // 592
  var lx = PAD, lw = 200;                   // 왼쪽 열
  var mx = lx + lw + GAP, mw = bx - GAP - mx;

  UI.text(this, lx, 4, '수성의 탑', { size: 'heading', color: C.text });
  // 오른쪽 끝에 붙인다 — 왼쪽 열 폭(200)에 맞춰 오른쪽 정렬하면 제목과 겹친다(실측 144px²).
  UI.text(this, W - PAD, 8,
    '최고 ' + (rec.best || 0) + '층 · 격파 ' + (rec.kills || 0) + '회',
    { size: 'micro', color: C.textDim, origin: 1, originY: 0 });

  // ── 왼쪽: 층 현판 + 보스까지 ─────────────────────────────────────────────
  var badge = UI.floorBadge(this, lx + lw / 2, 44, floor, { boss: !!boss, width: 172, height: 94 });
  var band = UI.bandMeter(this, lx + 8, badge.bottom + 16, lw - 16, floor, DT.BOSS_EVERY);
  var y = band.bounds().bottom + 12;
  if (boss) {
    UI.text(this, lx + lw / 2, y, '☠ 보스 층 — 더 강한 영웅', {
      size: 'micro', color: UI.TXT.danger, origin: 0.5, originY: 0,
      wrap: lw, align: 'center'
    });
  }

  // ── 가운데: 이번 층에 오는 영웅 ─────────────────────────────────────────
  var my = 36;
  function line(text, opts) {
    var t = UI.text(self, mx, my, text, opts);
    my = t.y + t.height + (opts && opts.gap !== undefined ? opts.gap : 8);
    return t;
  }
  line('이번 층 공격 영웅 —  ' + hero.name + '  (' + hero.trait + ')',
    { size: 'subhead', color: UI.TXT.crit, wrap: mw });
  line(hero.desc, { size: 'caption', color: C.textDim, wrap: mw, gap: 14 });
  line('영웅 예산 ' + heroBudget + '  ·  체력 +' + Math.round((mods.hp - 1) * 100) +
    '% · 공격 +' + Math.round((mods.damage - 1) * 100) + '%  ·  숙련 ' + Math.round(skill * 100) + '%',
    { size: 'caption', color: C.text, wrap: mw });
  line('내 배치 예산 ' + budget, { size: 'caption', color: C.accent, wrap: mw, gap: 14 });
  var E = DT.EARLY_FLOORS;
  if (floor <= E) {
    line('1~' + E + '층은 연습 구간. ' + (E + 1) + '층부터는 제대로 배치하지 않으면 뚫립니다.',
      { size: 'micro', color: C.textDim, wrap: mw });
  }

  // ── 오른쪽: 버튼 (위에서 아래로) ────────────────────────────────────────
  var by = 34, BH = 84, SH = 68, g2 = 14;
  UI.button(this, bx + BTN_W / 2, by + BH / 2, BTN_W, BH, floor + '층 방어 — 배치하기',
    function () { self.scene.start('Build', { defendTower: floor }); },
    { fill: UI.COL.panelPurple, line: C.strategist, hover: UI.COL.panelPurpleHi,
      color: C.accentAlt, fontSize: 'button' });
  by += BH + g2;
  UI.button(this, bx + BTN_W / 2, by + SH / 2, BTN_W, SH, '🏆 랭킹',
    function () { self.scene.start('Rank', { scope: 'live' }); }, { fontSize: 'buttonSm' });
  by += SH + g2;
  UI.button(this, bx + BTN_W / 2, by + SH / 2, BTN_W, SH, '← 메뉴',
    function () { self.scene.start('Menu'); }, { fontSize: 'buttonSm' });
  by += SH + g2;
  if (floor > 1 && by + SH < H - 8) {
    UI.button(this, bx + BTN_W / 2, by + SH / 2, BTN_W, SH, '1층부터 다시',
      function () { DT.fail(); self.scene.restart(); }, { fontSize: 'buttonSm' });
  }
};
