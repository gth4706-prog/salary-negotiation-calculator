window.GAME = window.GAME || {};

// ============================================================================
//  통곡의 탑 상점 (2026-08-01) — 요청 5·9·10·11·14·15·16·17
//
//  탭 3개: **아이템**(구매·판매) / **스킬**(구매·미리보기) / **능력치**(레벨업 + 장착변경).
//  전부 `js/towerchar.js`(영구 캐릭터)와 `js/towershopitems.js`(확장 카탈로그)만
//  읽고 쓴다 — `GAME.ITEMS`/`heroes.js` 의 `skillOptions` 원본은 안 건드리므로
//  대전·수성의 탑에는 이 씬이 존재하는지도 모른다.
//
//  레이아웃(요청 16): 좌 = 구매 목록, 우 = 캐릭터 미리보기 + 장비 슬롯 박스,
//  하단 = 능력치 바. 목록 자체는 `GAME.Modal`(이미 검증된 팝업 목록)을 그대로
//  써서 "긴 목록을 좁은 화면에 욱여넣다 겹친다"는 이 폴더의 상습 사고를 피한다.
//
//  ⚠ 스킬 미리보기는 `draft.js` 의 애니메이션 무대(`_drawPreview`, 300줄 넘는
//    Graphics 연출)를 포팅하지 않고 **글로 된 설명**으로 대신한다 — 그 무대는
//    대전이 계속 쓰므로 원본을 손대지 않기 위한 의도적인 범위 축소다.
// ============================================================================
GAME.TowerShopScene = function () {
  Phaser.Scene.call(this, { key: 'TowerShop' });
};
GAME.TowerShopScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.TowerShopScene.prototype.constructor = GAME.TowerShopScene;

GAME.TowerShopScene.prototype.init = function (data) {
  this.tab = (data && data.tab) || 'item';
  this.previewSkill = null;   // { slot, idx } — 스킬 탭에서 지금 보고 있는 스킬
};

GAME.TowerShopScene.prototype.create = function () {
  var self = this;
  if (!GAME.Account.current()) { this.scene.start('Login'); return; }
  if (!GAME.TowerChar || !GAME.TowerChar.exists()) { this.scene.start('Tower'); return; }

  this.char = GAME.TowerChar.get();
  this.hero = GAME.HEROES[this.char.heroKey];

  // 씬 인스턴스는 재사용된다 — 이전 그리기의 파괴된 참조가 남지 않게 비운다.
  this._previewG = null;
  this._body = [];   // 탭이 바뀔 때마다 지우는 표시객체 묶음

  var C = GAME.CONFIG.COLORS;
  this.cameras.main.setBackgroundColor(C.bg);

  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var PAD = GAME.CONFIG.SMALL ? 14 : 24;

  GAME.UI.label(this, PAD, 10, '←  허브로', 15, C.textDim, 0)
    .setInteractive({ useHandCursor: true })
    .on('pointerdown', function () { self.scene.start('Tower', { step: 'challenge' }); });

  GAME.UI.label(this, W / 2, 6, '통곡의 탑 상점', GAME.CONFIG.SMALL ? 22 : 30, C.text, 0.5)
    .setOrigin(0.5, 0);

  this.goldLabel = GAME.UI.label(this, W - PAD, 10, '', 20, C.accent, 1).setOrigin(1, 0);

  var tabY = 46;
  var tabW = Math.min(W - PAD * 2, 420);
  var tc = GAME.Layout.cols(3, { gap: 8, width: tabW, left: (W - tabW) / 2, pad: 0 });
  var TABS = [['item', '🛒 아이템'], ['skill', '📖 스킬'], ['stats', '⚒ 능력치']];
  this._tabBtns = [];
  TABS.forEach(function (t, i) {
    var b = GAME.UI.button(self, tc[i].cx, tabY + 22, tc[i].w, 40, t[1], function () {
      self.tab = t[0];
      self._buildBody();
    }, { fontSize: GAME.CONFIG.SMALL ? 14 : 15 });
    self._tabBtns.push({ key: t[0], btn: b });
  });

  this._bodyTop = tabY + 52;
  this._buildBody();
};

GAME.TowerShopScene.prototype._clearBody = function () {
  this._body.forEach(function (o) { if (o && o.destroy) o.destroy(); });
  this._body = [];
};

// bump=true 면 골드 숫자가 튕기는 연출을 준다(구매/판매 직후에만 — tower.js 허브의
// `_refreshRun` 과 같은 관용, 디자인 검토 #7: 이 화면만 그 연출이 빠져 있었다).
GAME.TowerShopScene.prototype._buildBody = function (bump) {
  this._clearBody();
  this.char = GAME.TowerChar.get();     // 구매 직후 최신 상태로 다시 읽는다
  var C = GAME.CONFIG.COLORS;
  var self = this;

  this._tabBtns.forEach(function (t) {
    var on = t.key === self.tab;
    t.btn.rect.setStrokeStyle(on ? 2 : 1, on ? C.controller : GAME.UI.COL.borderUi);
    t.btn.rect.setFillStyle(on ? GAME.UI.COL.panelTeal : GAME.UI.COL.surfaceAlt);
  });

  this.goldLabel.setText('💰 골드  ' + this.char.gold);
  if (bump) {
    this.goldLabel.setScale(1.25);
    this.tweens.add({ targets: this.goldLabel, scale: 1, duration: 260, ease: 'Back.easeOut' });
  }

  if (this.tab === 'item') this._buildItemTab();
  else if (this.tab === 'skill') this._buildSkillTab();
  else this._buildStatsTab();
};

// ── 우측 캐릭터 미리보기 + 장비 슬롯 박스 (요청 16) ─────────────────────────
GAME.TowerShopScene.prototype._drawCharPanel = function (x, y, w, h) {
  var C = GAME.CONFIG.COLORS;
  var self = this;
  var g = this.add.graphics();
  this._body.push(g);
  g.fillStyle(GAME.UI.COL.surfaceAlt, 1);
  g.fillRoundedRect(x, y, w, h, 12);
  g.lineStyle(1, GAME.UI.COL.border, 1);
  g.strokeRoundedRect(x, y, w, h, 12);

  // 무대(캐릭터)는 **장비 박스가 쓰고 남은 위쪽 전부**를 받는다. 예전엔 패널 높이의
  // 고정 비율(55%)이었는데, 아이템 격자가 들어오며 패널이 세로로 길어지자 그 비율이
  // 캐릭터를 패널 밖(제목 위)까지 키웠다 — 대검이 화면 제목을 뚫고 나왔다(실측).
  var slotsN = GAME.TowerShopItems.SLOTS.length;
  var boxSlotW0 = (w - 16 - 8 * (slotsN - 1)) / slotsN;
  var boxH0 = Math.min(h * 0.42, boxSlotW0 * (GAME.CONFIG.PHONE ? 2.0 : 2.2));
  var titleH = GAME.CONFIG.SMALL ? 24 : 28;
  var stageH = h - boxH0 - 20 - titleH;
  // 계란 몸통은 발 기준 **위로 3.2r · 아래로 1.8r**(합 5r) 뻗는다(eggart 규약).
  // 그 5r 이 무대 안에 통째로 들어가도록 반지름을 역산한다 — 예전엔 발 위치만 비율로
  // 잡아서 몸통 아래쪽 1.8r 이 장비 박스 위로 내려앉았다(실측: 대검이 박스를 덮었다).
  // ⚠ **무기는 그 5r 봉투 밖으로 나간다.** 최상급 대검은 날만 2.7r 이라(GEAR_TIERS 의
  //   `len`), 몸통 기준으로 꽉 채우면 칼이 패널을 뚫고 나가고 계란 얼굴을 덮는다
  //   (실측 스크린샷). 여기 계수는 **무기까지 담는 값**이라 몸통 기준보다 작다.
  var r = Math.min(w * 0.215, stageH / 6.2);
  var cx = x + w / 2;
  var feetY = y + titleH + (stageH - r * 5) / 2 + r * 3.2;
  var t0 = this.time.now;
  this._previewG = this.add.graphics();
  this._body.push(this._previewG);
  var pg = this._previewG;
  var hero = this.hero;
  function redraw() {
    if (!pg || !pg.scene) return;
    pg.clear();
    // 무대 연출(디자인 검토 #4) — 기존 캐릭터 선택 카드(tower.js 의 _refreshHeroSelect)
    // 가 항상 쓰는 밝은 조명 원 + 어두운 접지 그림자 두 겹을 그대로 가져온다.
    // 이게 없으면 계란이 패널에 그냥 '붙여넣어진' 것처럼 뜬다(실제로 그렇게 보였다).
    pg.fillStyle(GAME.UI.COL.surfaceHi, 0.42);
    pg.fillEllipse(cx, feetY + r * 0.32, r * 2.5, r * 0.85);
    pg.fillStyle(GAME.UI.IS_LIGHT ? 0x000000 : 0x000000, GAME.UI.IS_LIGHT ? 0.13 : 0.28);
    pg.fillEllipse(cx, feetY + r * 0.36, r * 1.7, r * 0.4);
    // 장착한 무기가 미리보기에도 반영된다(사용자 지시) — 등급이 재질·광휘를 정한다.
    GAME.UI.drawUnitFlat(pg, hero, cx, feetY, C.controller, 1,
      r / (hero.radius || 17), Math.PI / 2, null, self.time.now, null,
      GAME.UI.gearTierOf(self.char.items && self.char.items.weapon));
  }
  redraw();
  this._previewTimer = this.time.addEvent({ delay: 45, loop: true, callback: redraw });
  this.events.once('shutdown', function () {
    if (self._previewTimer) self._previewTimer.remove(false);
  });

  this._body.push(GAME.UI.label(this, cx, y + 8, hero.name + '  (' + hero.trait + ')',
    GAME.CONFIG.SMALL ? 15 : 17, C.text, 0.5).setOrigin(0.5, 0));

  // 장비 슬롯 박스 4칸 — 손으로 그린 아이콘(js/itemart.js, 디자인 검토 #1) + 이름.
  // ⚠ 박스 높이는 **남은 자리를 다 먹지 않는다.** 아이템 격자가 들어오며 이 패널이
  //   세로로 길어졌는데 `h - stageH - 20` 을 그대로 쓰니 박스가 폭 4배짜리 기둥이 됐다
  //   (아이콘은 정사각으로 clamp 되어 위에 붙고 아래가 텅 비었다 — 실측으로 잡음).
  //   칸 폭 기준으로 상한을 두고, 남는 세로는 무대(캐릭터)에 돌려준다.
  var slots = GAME.TowerShopItems.SLOTS;
  var boxH = boxH0;
  var boxTop = y + h - 10 - boxH;   // 패널 바닥에 정박시킨다
  var bc = GAME.Layout.cols(slots.length, { gap: 8, width: w - 16, left: x + 8, pad: 0 });
  slots.forEach(function (s, i) {
    var key = self.char.items[s.key];
    var it = key ? GAME.TowerShopItems.find(s.key, key) : null;
    var bx = bc[i].x, bw2 = bc[i].w;
    g.fillStyle(it ? GAME.UI.COL.panelTeal : GAME.UI.COL.bg, 1);
    g.fillRoundedRect(bx, boxTop, bw2, boxH, 8);
    g.lineStyle(1, it ? C.controller : GAME.UI.COL.border, 1);
    g.strokeRoundedRect(bx, boxTop, bw2, boxH, 8);
    var slotFs = GAME.CONFIG.SMALL ? 10 : 11;
    var nameFs = GAME.CONFIG.SMALL ? 10 : 12;
    self._body.push(GAME.UI.label(self, bx + bw2 / 2, boxTop + 3, s.name,
      slotFs, C.textDim, 0.5).setOrigin(0.5, 0));
    // 아이콘 — 슬롯명과 이름 사이 남는 자리를 정사각으로 채운다. 빈 슬롯은 아이콘 없이
    // 옅은 '—' 만 남긴다(빈 것과 든 것이 실루엣만으로도 갈린다).
    var iconTop = boxTop + slotFs + 6;
    // ⚠ 칸이 좁아 이름은 **거의 항상 두 줄로 접힌다**("불멸의 등딱지", "시간을 앞선 신").
    //   한 줄치(18px)만 남겨 두면 둘째 줄이 박스 밖으로 흘러나온다(실측). 두 줄을 예약한다.
    var nameH = (GAME.CONFIG.PHONE ? 12 : 15) * 2 + 4;
    var iconSize = Math.min(bw2 - 10, boxH - slotFs - 12 - nameH);
    if (it && iconSize > 14) {
      GAME.UI.drawItem(g, s.key, it.key, bx + bw2 / 2, iconTop + iconSize / 2, iconSize);
    }
    self._body.push(GAME.UI.label(self, bx + bw2 / 2, boxTop + boxH - 4, it ? it.name : '—',
      nameFs, it ? C.accent : C.textFaint, 0.5)
      .setOrigin(0.5, 1).setWordWrapWidth(bw2 - 6).setAlign('center').setLineSpacing(0));
  });
};

// ── 능력치 바(요청 16 하단) ─────────────────────────────────────────────────
// ⚠ y 는 **위쪽 시작점**을 받는다(호출부가 `statBarsHeight()`로 미리 계산해
//   바닥에서 역산한다) — 여기서 다시 "바닥에서 몇 px" 식으로 추측하면 폰 가로
//   (844×390)처럼 여유가 좁은 화면에서 마지막 줄이 화면 밖으로 잘린다(실측으로 잡음).
// ⚠ `SMALL`(폰가로+세로 통칭)로 뭉뚱그리면 안 된다 — 세로는 900px 로 여유가 넉넉하고
//   **폰 가로만** 390px 로 극단적으로 좁다. 그래서 PHONE 을 따로 본다.
GAME.TowerShopScene.prototype.statBarsHeight = function () {
  var rowH = GAME.CONFIG.PHONE ? 17 : (GAME.CONFIG.SMALL ? 18 : 22);
  var gap = GAME.CONFIG.PHONE ? 3 : (GAME.CONFIG.SMALL ? 3 : 4);
  return 5 * rowH + 4 * gap;
};
GAME.TowerShopScene.prototype._drawStatBars = function (x, y, w) {
  var C = GAME.CONFIG.COLORS;
  var self = this;
  var bonus = GAME.TowerChar.statBonus(this.char);
  var ib = GAME.TowerChar.itemBonus(this.char);
  var luck = GAME.TowerChar.luckLevel(this.char);
  var rows = [
    ['공격력', bonus.damage + ib.damage],
    ['체력', bonus.hp + ib.hp],
    ['방어력', bonus.armor + ib.armor],
    ['이동속도', bonus.speed + ib.speed],
    ['행운', luck]
  ];
  var rowH = GAME.CONFIG.PHONE ? 17 : (GAME.CONFIG.SMALL ? 18 : 22);
  var gap = GAME.CONFIG.PHONE ? 3 : (GAME.CONFIG.SMALL ? 3 : 4);
  var fs = GAME.CONFIG.PHONE ? 10 : (GAME.CONFIG.SMALL ? 11 : 13);
  // ⚠ 예전엔 `frac: 1` 로 박혀 있어 **수치가 0 이어도 막대가 꽉 차 있었다**(사용자 신고).
  //   막대는 "얼마나 올렸나"를 말해야 하므로 상한(TowerChar.statCeil)으로 나눈다.
  var keys = ['damage', 'hp', 'armor', 'speed', 'luck'];
  rows.forEach(function (r, i) {
    var ry = y + i * (rowH + gap);
    self._body.push(GAME.UI.label(self, x, ry, r[0], fs, C.textDim, 0));
    var ceil = GAME.TowerChar.statCeil(keys[i]);
    var frac = Math.max(0, Math.min(1, r[1] / ceil));
    var m = GAME.UI.meter(self, x + 76, ry + 1, w - 76, rowH - 2, {
      color: C.controller, frac: frac,
      label: { size: fs, color: C.text, align: 'center' }
    });
    m.setText('+' + Math.round(r[1] * 10) / 10);
    self._body.push({ destroy: function () { m.destroy(); } });
  });
};

// ── 아이템 탭 ────────────────────────────────────────────────────────────
//  2026-07-31 재설계 (사용자 지시: "아이템은 클릭해야만 나오는 게 아니라 무기·방어구·
//  신발·장신구를 탭으로 나눠서 보되 아이콘까지 한눈에 보이게").
//  예전 구조: 슬롯 4행 → 각 행의 [구매] 버튼 → 팝업 목록. 즉 **8개 중 무엇을 살 수
//  있는지가 팝업을 열기 전까지 화면에 없었다.** 아이콘 44종을 그려 놓고도 장착 중인
//  4개만 보이던 셈이다.
//  지금 구조: 슬롯 하위탭(무기/방어구/신발/장신구) + 그 슬롯 8종을 **격자로 전부**
//  펼친다. 아이콘·이름·가격이 한 화면에 있고, 카드를 누르면 곧바로 구매/교체한다.
GAME.TowerShopScene.prototype._buildItemTab = function () {
  var C = GAME.CONFIG.COLORS;
  var self = this;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var top = this._bodyTop;
  var PAD = GAME.CONFIG.SMALL ? 14 : 24;
  var P = GAME.CONFIG.PHONE;
  var rightW = Math.min(W * 0.34, 280);
  var leftW = W - PAD * 3 - rightW;
  var leftX = PAD;

  // ⚠ 능력치 바가 먼저 차지할 높이를 실제로 계산한 뒤(statBarsHeight), 그 위 공간을
  // 캐릭터 패널에 준다 — 예전엔 "바닥에서 몇 px" 매직넘버였고 그 값이 실제 바 높이보다
  // 작아서 폰 가로(844×390)에서 마지막 줄("행운")이 화면 밖으로 잘렸다(실측으로 잡음).
  var statH = this.statBarsHeight();
  var statY = H - (P ? 14 : 10) - statH;
  this._drawCharPanel(W - PAD - rightW, top, rightW, statY - top - 10);
  this._drawStatBars(leftX, statY, leftW);

  var slots = GAME.TowerShopItems.SLOTS;
  if (!this.itemSlot) this.itemSlot = slots[0].key;

  // ── 슬롯 하위탭 ──
  var stH = P ? 28 : 34;
  var stc = GAME.Layout.cols(slots.length, { gap: P ? 5 : 8, width: leftW, left: leftX, pad: 0 });
  slots.forEach(function (s, i) {
    var on = s.key === self.itemSlot;
    var equipped = self.char.items[s.key];
    var b = GAME.UI.button(self, stc[i].cx, top + stH / 2, stc[i].w, stH,
      s.name + (equipped ? ' ●' : ''), function () {
        self.itemSlot = s.key;
        self._buildBody();
      }, { fontSize: P ? 12 : 14 });
    b.rect.setStrokeStyle(on ? 2 : 1, on ? C.controller : GAME.UI.COL.borderUi);
    b.rect.setFillStyle(on ? GAME.UI.COL.panelTeal : GAME.UI.COL.surfaceAlt);
    b.text.setColor(on ? C.accent : C.textDim);
    self._body.push(b);
  });

  // ── 그 슬롯의 8종을 격자로 전부 펼친다 ──
  var list = GAME.TowerShopItems.CATALOG[this.itemSlot] || [];
  var curKey = this.char.items[this.itemSlot];
  var cur = curKey ? GAME.TowerShopItems.find(this.itemSlot, curKey) : null;
  var credit = cur ? Math.floor(cur.cost * GAME.TowerChar.SELL_RATE) : 0;

  var gridTop = top + stH + (P ? 6 : 10);
  var gridBottom = statY - (P ? 6 : 12);
  var ncol = 4, nrow = Math.ceil(list.length / ncol);
  var cgap = P ? 5 : 10;
  var cardW = (leftW - cgap * (ncol - 1)) / ncol;
  var cardH = Math.min((gridBottom - gridTop - cgap * (nrow - 1)) / nrow, P ? 66 : 150);

  list.forEach(function (it, i) {
    var cx0 = leftX + (i % ncol) * (cardW + cgap);
    var cy0 = gridTop + Math.floor(i / ncol) * (cardH + cgap);
    var equipped = cur && cur.key === it.key;
    var price = Math.max(0, it.cost - credit);
    var afford = self.char.gold >= price;

    var g = self.add.graphics();
    self._body.push(g);
    g.fillStyle(equipped ? GAME.UI.COL.panelTeal : GAME.UI.COL.surfaceAlt, 1);
    g.fillRoundedRect(cx0, cy0, cardW, cardH, 10);
    g.lineStyle(equipped ? 2 : 1, equipped ? C.controller : GAME.UI.COL.border, 1);
    g.strokeRoundedRect(cx0, cy0, cardW, cardH, 10);

    // 아이콘 — 이 화면의 주인공이다. 카드 높이의 절반 가까이를 준다.
    var iconSz = Math.min(cardW - (P ? 14 : 26), cardH * (P ? 0.44 : 0.42));
    var iconCy = cy0 + (P ? 4 : 8) + iconSz / 2;
    g.fillStyle(GAME.UI.COL.bg, equipped ? 0.5 : 1);
    g.fillRoundedRect(cx0 + (cardW - iconSz) / 2 - 3, iconCy - iconSz / 2 - 3, iconSz + 6, iconSz + 6, 7);
    GAME.UI.drawItem(g, self.itemSlot, it.key, cx0 + cardW / 2, iconCy, iconSz);

    // ⚠ 이름·효과·가격은 **위에서부터 실제 높이를 재며 쌓는다.** 처음엔 이름을 위에서,
    //   효과를 아래(cardH-44)에서 잡았더니 두 줄짜리 이름과 만나 겹쳤다(실측으로 잡음).
    //   이 파일 위쪽 주석의 "좌표를 손으로 박으면 겹친다"가 그대로 재현된 사례다.
    var flowY = iconCy + iconSz / 2 + (P ? 3 : 7);
    var nameLbl = GAME.UI.label(self, cx0 + cardW / 2, flowY,
      it.name, P ? 10 : 13, equipped ? C.accent : C.text, 0.5)
      .setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(cardW - 8);
    self._body.push(nameLbl);
    flowY = nameLbl.y + nameLbl.height;

    // PC 는 카드가 커서 효과 문구까지 들어간다. 폰은 이름+가격만(넣으면 겹친다).
    // ⚠ **카드 밖으로 흘러넘치면 지운다.** 글꼴이 아직 로드되기 전에 재면 줄 수가 달라져
    //   효과 문구가 한 줄 더 접히고, 그 줄이 아래 칸 카드의 이름과 겹쳤다(겹침 감사가
    //   드문드문 1~5건으로 잡았다 — 매번은 아니라 원인을 찾는 데 시간이 걸렸다).
    //   측정에 기대는 배치는 **측정이 틀렸을 때의 바닥**을 같이 정해 둬야 한다.
    var priceH = P ? 14 : 20;
    var textBottomMax = cy0 + cardH - priceH - 4;
    if (!P) {
      var noteLbl = GAME.UI.label(self, cx0 + cardW / 2, flowY + 5,
        it.note, 10, C.textDim, 0.5).setOrigin(0.5, 0).setAlign('center')
        .setWordWrapWidth(cardW - 12);
      self._body.push(noteLbl);
      if (noteLbl.y + noteLbl.height > textBottomMax) noteLbl.setVisible(false);
      else flowY = noteLbl.y + noteLbl.height;
    }
    if (nameLbl.y + nameLbl.height > textBottomMax) nameLbl.setVisible(false);

    // 장착 중인 카드는 **되파는 자리**를 겸한다 — 격자에서는 카드가 곧 행동이라
    // 별도의 [판매] 버튼을 둘 자리가 없고, 되팔 수 있는 것은 언제나 장착 중인 하나뿐이다.
    var sellBack = Math.floor(it.cost * GAME.TowerChar.SELL_RATE);
    var priceTxt = equipped ? (P ? ('판매 ' + sellBack) : ('장착 중 · 눌러 판매 ' + sellBack))
                            : (price === 0 ? '무료 교체' : ('💰 ' + price));
    // ⚠ 가격을 카드 **바닥에서** 잡으면 이름이 한 줄 늘어나는 순간 겹친다(폰 가로에서
    //   8건 전부 겹쳤다 — 겹침 감사가 잡았다). 이름 아래로 이어 붙이되, 카드 바닥을
    //   넘지 않도록 둘 중 아래쪽을 쓴다.
    // 가격은 언제나 카드 안에 있다 — 위 문구가 아무리 길어져도 카드 바닥을 안 넘는다.
    var priceY = Math.min(Math.max(flowY + (P ? 1 : 4), cy0 + cardH - (P ? 14 : 26)),
                          cy0 + cardH - priceH);
    self._body.push(GAME.UI.label(self, cx0 + cardW / 2, priceY,
      priceTxt, P ? 9 : 13, equipped ? C.accent : (afford ? C.text : C.textDim), 0.5)
      .setOrigin(0.5, 0));

    // 카드 전체가 버튼이다 — 아이콘을 보고 바로 누르는 흐름이라 별도 [구매] 버튼을
    // 두면 손가락이 갈 곳이 둘로 갈린다. 못 사는 것도 눌리게 두되 아무 일도 안 한다
    // (막아 두면 왜 안 눌리는지 화면이 설명하지 않는다 — 가격이 흐린 것이 그 설명이다).
    var hit = self.add.rectangle(cx0 + cardW / 2, cy0 + cardH / 2, cardW, cardH, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: equipped || afford });
    hit.on('pointerdown', function () {
      if (equipped) {
        // 판매는 되돌리기 어려운 쪽이라 한 번 묻는다(구매는 안 묻는다 — 되팔 수 있으므로).
        GAME.Modal.open(self, {
          title: it.name + ' 판매',
          items: [
            { key: 'yes', name: '판매한다', note: sellBack + '골드를 돌려받습니다' },
            { key: 'no', name: '취소' }
          ],
          onPick: function (m) {
            if (!m || m.key !== 'yes') return;
            GAME.TowerChar.sellItem(self.itemSlot);
            self._buildBody(true);
          }
        });
        return;
      }
      if (!afford) return;
      if (GAME.TowerChar.buyItem(self.itemSlot, it.key)) self._buildBody(true);
    });
    self._body.push(hit);
  });
};

// `_openBuyList`(슬롯별 구매 팝업)는 **제거했다** — 격자가 그 일을 대신한다.
// 남겨 두면 "어느 쪽이 진짜 구매 경로인가"가 갈리고, 한쪽만 고쳐지는 사고가 난다.

// ── 스킬 탭 ──────────────────────────────────────────────────────────────
//  2026-07-31 재설계 (사용자 지시: "스킬화면도 아이템처럼 탭으로 나누고 넓어진 화면에는
//  스킬 미리보기 창화면을 띄워줘. 클릭하면 미리보기가 보이게").
//  예전 구조: 슬롯 4개를 한 화면에 쌓고(폰은 2×2) 각 슬롯 안에 5줄 — 20줄이 20px 행에
//  욱여넣어져 이름 말고는 아무것도 안 들어갔고, 미리보기는 좁은 오른쪽 기둥이었다.
//  지금 구조: 아이템 탭과 **같은 문법** — 슬롯 하위탭(Q/W/E/R) + 그 슬롯 5종을 카드로
//  펼치고, 남는 폭 전부를 미리보기 창에 준다.
GAME.TowerShopScene.prototype._buildSkillTab = function () {
  var C = GAME.CONFIG.COLORS;
  var self = this;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var top = this._bodyTop;
  var PAD = GAME.CONFIG.SMALL ? 14 : 24;
  var P = GAME.CONFIG.PHONE;
  var rightW = Math.min(W * 0.40, 420);
  var leftW = W - PAD * 3 - rightW;
  var leftX = PAD, rightX = W - PAD - rightW;

  var slotList = GAME.SKILL_SLOTS;
  if (!this.skillSlot) this.skillSlot = slotList[0];

  // ── 슬롯 하위탭 (Q/W/E/R) ──
  var stH = P ? 28 : 34;
  var stc = GAME.Layout.cols(slotList.length, { gap: P ? 5 : 8, width: leftW, left: leftX, pad: 0 });
  slotList.forEach(function (slot, i) {
    var on = slot === self.skillSlot;
    var lab = GAME.SKILL_SLOT_LABEL[slot] ? (slot + ' · ' + GAME.SKILL_SLOT_LABEL[slot]) : slot;
    var b = GAME.UI.button(self, stc[i].cx, top + stH / 2, stc[i].w, stH, lab, function () {
      self.skillSlot = slot;
      self.previewSkill = { slot: slot, idx: self.char.picks[slot] };
      self._buildBody();
    }, { fontSize: P ? 11 : 13 });
    b.rect.setStrokeStyle(on ? 2 : 1, on ? C.controller : GAME.UI.COL.borderUi);
    b.rect.setFillStyle(on ? GAME.UI.COL.panelTeal : GAME.UI.COL.surfaceAlt);
    b.text.setColor(on ? C.accent : C.textDim);
    self._body.push(b);
  });

  // ── 그 슬롯의 5종 카드 ──
  var slot = this.skillSlot;
  var opts = this.hero.skillOptions[slot];
  var listTop = top + stH + (P ? 6 : 10);
  var listBottom = H - (P ? 12 : 20);
  var rgap = P ? 4 : 8;
  var rowH = Math.min((listBottom - listTop - rgap * (opts.length - 1)) / opts.length, P ? 54 : 76);

  opts.forEach(function (o, idx) {
    var ry = listTop + idx * (rowH + rgap);
    var owned = GAME.TowerChar.ownsSkill(slot, idx, self.char);
    var equipped = self.char.picks[slot] === idx;
    var previewing = self.previewSkill && self.previewSkill.slot === slot && self.previewSkill.idx === idx;
    var afford = self.char.gold >= (o.cost || 0);

    var g = self.add.graphics();
    self._body.push(g);
    g.fillStyle(equipped ? GAME.UI.COL.panelTeal : GAME.UI.COL.surfaceAlt, 1);
    g.fillRoundedRect(leftX, ry, leftW, rowH, 10);
    g.lineStyle(previewing ? 2 : 1, previewing ? C.accent
      : (equipped ? C.controller : GAME.UI.COL.border), 1);
    g.strokeRoundedRect(leftX, ry, leftW, rowH, 10);

    var btnW = P ? 78 : 104;
    var txtW = leftW - 24 - btnW - 10;
    self._body.push(GAME.UI.label(self, leftX + 12, ry + (P ? 5 : 9),
      o.name + (equipped ? '  ✓ 장착 중' : (owned ? '  · 보유' : '')),
      P ? 12 : 15, owned ? C.text : C.textDim, 0).setWordWrapWidth(txtW));
    var typeLabel = GAME.SKILL_TYPE_LABEL[o.type] || o.type;
    self._body.push(GAME.UI.label(self, leftX + 12, ry + (P ? 22 : 32),
      typeLabel + '  ·  쿨 ' + (o.cooldown ? (o.cooldown / 1000) + '초' : '—') +
      (o.cost ? ('  ·  ' + o.cost + '골드') : '  ·  기본 내장'),
      P ? 10 : 12, C.textDim, 0).setWordWrapWidth(txtW));

    // 카드 본체 = 미리보기 (사용자 지시: "클릭하면 미리보기가 보이게")
    var hit = self.add.rectangle(leftX + (leftW - btnW - 10) / 2, ry + rowH / 2,
      leftW - btnW - 10, rowH, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', function () {
      self.previewSkill = { slot: slot, idx: idx };
      self._buildBody();
    });
    self._body.push(hit);

    // 오른쪽 버튼 = 구매 / 장착. 미리보기와 손가락이 갈리도록 자리를 나눈다.
    var act, fn;
    if (!owned) { act = afford ? ('💰 ' + (o.cost || 0)) : ('🔒 ' + (o.cost || 0)); fn = function () {
      if (GAME.TowerChar.buySkill(slot, idx)) self._buildBody(true);
    }; }
    else if (equipped) { act = '장착 중'; fn = function () {}; }
    else { act = '장착'; fn = function () {
      GAME.TowerChar.equipSkill(slot, idx); self._buildBody();
    }; }
    var ab = GAME.UI.button(self, leftX + leftW - 12 - btnW / 2, ry + rowH / 2,
      btnW, rowH - (P ? 12 : 18), act, fn, { fontSize: P ? 11 : 13 });
    ab.text.setColor(equipped ? C.textDim : ((owned || afford) ? C.accent : C.textDim));
    ab.rect.setStrokeStyle((owned && !equipped) || (!owned && afford) ? 2 : 1,
      (owned && !equipped) ? C.controller : GAME.UI.COL.borderUi);
    self._body.push(ab);
  });

  // ── 미리보기 창 — 넓어진 폭을 실제로 쓴다 ──
  var pg = this.add.graphics();
  this._body.push(pg);
  var pTop = top, pH = H - top - (P ? 12 : 20);
  pg.fillStyle(GAME.UI.COL.surfaceAlt, 1);
  pg.fillRoundedRect(rightX, pTop, rightW, pH, 12);
  pg.lineStyle(1, GAME.UI.COL.border, 1);
  pg.strokeRoundedRect(rightX, pTop, rightW, pH, 12);

  if (!this.previewSkill || this.previewSkill.slot !== slot) {
    this.previewSkill = { slot: slot, idx: this.char.picks[slot] };
  }
  var ps = this.previewSkill;
  var o = this.hero.skillOptions[ps.slot][ps.idx];
  var ownedP = GAME.TowerChar.ownsSkill(ps.slot, ps.idx, this.char);

  var ty = pTop + (P ? 10 : 16);
  var titleLbl = GAME.UI.label(this, rightX + rightW / 2, ty,
    o.name, P ? 16 : 22, C.accent, 0.5).setOrigin(0.5, 0).setWordWrapWidth(rightW - 28);
  this._body.push(titleLbl);
  var subLbl = GAME.UI.label(this, rightX + rightW / 2, titleLbl.y + titleLbl.height + 4,
    ps.slot + ' 슬롯  ·  ' + (GAME.SKILL_TYPE_LABEL[o.type] || o.type),
    P ? 11 : 13, C.textDim, 0.5).setOrigin(0.5, 0);
  this._body.push(subLbl);

  // 스킬 모양 — 그 슬롯의 전투 모션 포즈를 그대로 보여준다(js/eggart.js 의 `UI.actPose`).
  // 글만 있으면 "돌진"과 "강타"가 같은 문장으로 읽힌다(이 폴더가 이미 겪은 실패).
  var stageTop = subLbl.y + subLbl.height + (P ? 8 : 14);
  var descTop = pTop + pH - (P ? 92 : 140);
  var stageH = Math.max(40, descTop - stageTop - 10);
  // 무기까지 담는 계수 — 위 `_drawCharPanel` 과 같은 이유로 몸통 기준(5.2)보다 작다.
  var sr = Math.min(rightW * 0.16, stageH / 6.2);
  var scx = rightX + rightW / 2, sfeet = stageTop + (stageH - sr * 5) / 2 + sr * 3.2;
  var sg = this.add.graphics();
  this._body.push(sg);
  var heroDef = this.hero, sceneRef = this;
  var dur = (GAME.UI.SKILL_DUR && GAME.UI.SKILL_DUR[o.type]) || 480;
  function redrawSkill() {
    if (!sg || !sg.scene) return;
    sg.clear();
    sg.fillStyle(GAME.UI.COL.surfaceHi, 0.42);
    sg.fillEllipse(scx, sfeet + sr * 0.32, sr * 2.5, sr * 0.85);
    sg.fillStyle(0x000000, GAME.UI.IS_LIGHT ? 0.13 : 0.28);
    sg.fillEllipse(scx, sfeet + sr * 0.36, sr * 1.7, sr * 0.4);
    // 모션을 되풀이 재생한다 — 이 화면은 전장이 아니므로 반복이 안전하다
    // (`UI.updateAct` 를 안 쓴다: 그건 전투 상태를 읽는 관측자다).
    var t = (sceneRef.time.now % (dur + 700));
    var act = t < dur
      ? { art: heroDef.art, t: t, dur: dur, wind: 0, kind: 'skill', type: o.type }
      : null;
    GAME.UI.drawUnitFlat(sg, heroDef, scx, sfeet, C.controller, 1,
      sr / (heroDef.radius || 17), Math.PI / 2, null, sceneRef.time.now, act,
      GAME.UI.gearTierOf(sceneRef.char.items && sceneRef.char.items.weapon));
  }
  redrawSkill();
  if (this._skillPvTimer) this._skillPvTimer.remove(false);
  this._skillPvTimer = this.time.addEvent({ delay: 45, loop: true, callback: redrawSkill });
  this.events.once('shutdown', function () {
    if (self._skillPvTimer) self._skillPvTimer.remove(false);
  });

  // ⚠ **가격 배수를 얹은 사본**을 설명한다. 전장에서는 `GAME.scaleSkillsByPrice` 가
  //   비싼 스킬을 더 세게 만드는데(js/heroes.js), 여기서 원본 숫자를 보여주면 상점이
  //   거짓말을 한다("140골드짜리가 왜 표기보다 세지?").
  var shown = GAME.skillPricedCopy ? GAME.skillPricedCopy(o) : o;
  var desc = GAME.skillDesc ? GAME.skillDesc(shown) : '';
  this._body.push(GAME.UI.label(this, rightX + 14, descTop, desc || '',
    P ? 11 : 14, C.text, 0).setWordWrapWidth(rightW - 28).setLineSpacing(4));
  this._body.push(GAME.UI.label(this, rightX + 14, pTop + pH - (P ? 34 : 52),
    '쿨타임 ' + (shown.cooldown ? (Math.round(shown.cooldown / 100) / 10) + '초' : '—') +
    (o.cost ? ('    ·    ' + o.cost + '골드') : '    ·    기본 내장(무료)'),
    P ? 11 : 13, C.textDim, 0));
  this._body.push(GAME.UI.label(this, rightX + 14, pTop + pH - (P ? 18 : 28),
    ownedP ? '보유함 — 오른쪽 [장착] 으로 끼웁니다' : '미보유 — 먼저 구매해야 장착할 수 있습니다',
    P ? 11 : 13, ownedP ? C.accent : C.textDim, 0));
};

// ── 능력치 탭 ────────────────────────────────────────────────────────────
//  2026-07-31 재설계 (사용자 신고: "현재 능력치가 얼마인지도 안 보이고 복권형태로
//  얼마나 올랐는지도 눈에 안 띈다").
//  진단: 예전 화면은 한 줄에 [이름 · 현재값 · 범위 · 가격]을 같은 크기 글자로 욱여넣어
//  **무엇이 중요한지가 화면에 안 적혀 있었다.** 값을 크게 쓰는 것만으로는 부족했다 —
//  복권은 "굴렸다"는 사건이 보여야 복권이다(구슬을 5층마다 자동 지급했다가 폐기한 것과
//  같은 실패 계열: 받은 줄도 몰랐다).
//  그래서 두 가지를 바꿨다:
//   ① 한 행 안에서 **현재값이 가장 큰 글자**이고, 채워진 막대가 상한 대비 위치를 말한다.
//   ② 구매 직후 **그 행 위에 결과 배지가 튀어나온다** — 등급(쪽박/중박/대박/개대박)과
//      실제로 오른 수치를 같이. 등급은 `TowerChar.gradeOf` 가 굴림 범위 안 상대 위치로
//      정하므로 스탯마다 기준이 갈리지 않는다.
GAME.TowerShopScene.prototype._buildStatsTab = function () {
  var C = GAME.CONFIG.COLORS;
  var self = this;
  var W = GAME.CONFIG.WIDTH;
  var top = this._bodyTop;
  var PAD = GAME.CONFIG.SMALL ? 14 : 24;
  var P = GAME.CONFIG.PHONE;
  var colW = Math.min(W - PAD * 2, 620);
  var leftX = (W - colW) / 2;

  var rowH = P ? 50 : 62;
  var gap = P ? 5 : 9;
  // ⚠ 아이템 보정까지 **반드시 합친다.** 능력치만 더하면 이 탭은 "공격력 20", 아이템
  //   탭 하단 바는 "+135" 라고 말해 같은 캐릭터를 두 숫자로 부르게 된다(실측으로 발견).
  //   플레이어에게 '현재 능력치'는 언제나 전투에 실제로 들어가는 총합이다.
  var totalBonus = GAME.TowerChar.statBonus(this.char);
  var itemBonus = GAME.TowerChar.itemBonus(this.char);

  GAME.TowerChar.STAT_DEFS.forEach(function (d, i) {
    var ry = top + i * (rowH + gap);
    var lv = self.char.stats[d.key] || 0;
    var maxed = lv >= d.max;
    var cost = GAME.TowerChar.costOf(d.key, lv);
    var can = !maxed && self.char.gold >= cost;
    var total = d.key === 'luck' ? GAME.TowerChar.luckLevel(self.char)
                                 : ((totalBonus[d.key] || 0) + (itemBonus[d.key] || 0));
    var fromItem = d.key === 'luck' ? (itemBonus.luck || 0) : (itemBonus[d.key] || 0);
    var rangeLo = Math.max(1, Math.round(d.add * 0.6)), rangeHi = Math.round(d.add * 1.4);

    var g = self.add.graphics();
    self._body.push(g);
    g.fillStyle(GAME.UI.COL.surfaceAlt, 1);
    g.fillRoundedRect(leftX, ry, colW, rowH, 10);
    g.lineStyle(1, GAME.UI.COL.border, 1);
    g.strokeRoundedRect(leftX, ry, colW, rowH, 10);

    // 이름(작게) + 현재값(크게) — 이 행에서 가장 먼저 읽혀야 하는 것이 현재값이다.
    // ⚠ 값의 y 를 손으로 박았더니 폰 가로에서 이름 상자와 5px 겹쳤다(겹침 감사가 5건
    //   전부 잡았다). 이름의 **실측 높이** 아래에 붙인다.
    var nmLbl = GAME.UI.label(self, leftX + 14, ry + (P ? 4 : 9), d.name,
      P ? 10 : 13, C.textDim, 0);
    self._body.push(nmLbl);
    self._body.push(GAME.UI.label(self, leftX + 14, nmLbl.y + nmLbl.height + (P ? 0 : 2),
      String(total), P ? 18 : 26, C.text, 0));

    // 상한 대비 막대 — 하단 스탯바와 **같은 분모**(statCeil)를 써야 두 화면이 같은 말을 한다.
    var barX = leftX + (P ? 78 : 96), barW = colW - (P ? 78 : 96) - (P ? 116 : 150) - 14;
    var ceil = GAME.TowerChar.statCeil(d.key);
    var m = GAME.UI.meter(self, barX, ry + rowH / 2 - (P ? 6 : 7), barW, P ? 12 : 14, {
      color: C.controller, frac: Math.max(0, Math.min(1, total / ceil))
    });
    self._body.push({ destroy: function () { m.destroy(); } });
    // 총합 중 얼마가 장비 몫인지 같이 적는다 — 안 적으면 "능력치를 안 샀는데 왜 135 지"가 된다.
    self._body.push(GAME.UI.label(self, barX, ry + rowH / 2 + (P ? 8 : 10),
      (maxed ? '더 올릴 수 없습니다' : ('굴림 범위  +' + rangeLo + ' ~ +' + rangeHi)) +
      (fromItem ? ('    (장비 +' + fromItem + ' 포함)') : ''),
      P ? 10 : 11, C.textDim, 0));

    var bw = P ? 110 : 144;
    var b = GAME.UI.button(self, leftX + colW - 14 - bw / 2, ry + rowH / 2, bw, rowH - (P ? 12 : 16),
      maxed ? '최대' : ('🎲 ' + cost + '골드'), function () {
        var res = GAME.TowerChar.levelUp(d.key);
        if (!res) return;
        // 결과를 **다시 그리기 전에** 기억해 둔다 — _buildBody 가 화면을 통째로 새로 만든다.
        self._lastRoll = { key: d.key, gain: res.gain, at: Date.now() };
        self._buildBody(true);
      }, { fontSize: P ? 13 : 15 });
    b.text.setColor(can ? C.accent : C.textDim);
    b.rect.setStrokeStyle(can ? 2 : 1, can ? C.controller : GAME.UI.COL.borderUi);
    self._body.push(b);

    // ② 방금 이 스탯을 굴렸으면 결과 배지를 띄운다(3초). "얼마 올랐나"와 "그게 잘 나온
    //    건가"를 한 덩어리로 — 수치만 있으면 12 가 큰지 작은지 알 수 없다.
    if (self._lastRoll && self._lastRoll.key === d.key && Date.now() - self._lastRoll.at < 3000) {
      var gr = GAME.TowerChar.gradeOf(d.key, self._lastRoll.gain);
      var bg = self.add.graphics().setDepth(30);
      self._body.push(bg);
      // ⚠ 배지를 행 **위쪽**(ry - badgeH)에 띄웠더니 바로 윗 행의 구매 버튼을 덮었다
      //   (실측 스크린샷). 자기 행 안, 막대 위에 얹는다 — 3초짜리 연출이라 막대를 잠깐
      //   가리는 것은 괜찮지만 **다른 능력치의 버튼을 가리면 오조작이 난다.**
      var badgeW = Math.min(P ? 168 : 230, barW), badgeH = P ? 26 : 32;
      var bx = barX + (barW - badgeW) / 2, by = ry + (rowH - badgeH) / 2;
      bg.fillStyle(gr.color, 1);
      bg.fillRoundedRect(bx, by, badgeW, badgeH, 8);
      var lbl = GAME.UI.label(self, bx + badgeW / 2, by + badgeH / 2,
        gr.name + '!  ' + gr.flavor + '  +' + self._lastRoll.gain,
        P ? 13 : 15, '#ffffff', 0.5).setOrigin(0.5).setDepth(31);
      self._body.push(lbl);
      self.tweens.add({ targets: [lbl], scale: { from: 1.35, to: 1 }, duration: 300, ease: 'Back.easeOut' });
      self.tweens.add({ targets: [lbl, bg], alpha: 0, delay: 2200, duration: 700 });
    }
  });

  // 스킬 장착은 이 탭에서 **뺐다** — 도전 진입 팝업(tower.js `_equipSkillsThenBattle`)과
  // 스킬 탭이 그 일을 맡는다. 세 곳에 같은 UI 를 두면 어디가 진짜인지 알 수 없어진다.
  // 안내 한 줄 — 폰 가로(390px)는 5행을 쌓고 나면 이 줄이 화면 밖으로 나간다
  // (겹침 감사의 '잘림' 항목이 잡았다). 들어갈 자리가 있을 때만 띄운다.
  var footY = top + 5 * (rowH + gap) + (P ? 2 : 10);
  if (footY + 16 <= GAME.CONFIG.HEIGHT - 4) {
    self._body.push(GAME.UI.label(self, W / 2, footY,
      P ? '🎲 범위 안에서 무작위로 오릅니다 · 꽝 없음'
        : '🎲 능력치는 굴림입니다 — 범위 안에서 무작위로 오르고, 꽝(0)은 없습니다.',
      P ? 10 : 12, C.textDim, 0.5).setOrigin(0.5, 0));
  }
};
