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

// ══════════════════════════════════════════════════════════════════════════
//  데이터 어댑터 — **이 화면은 두 모드가 같이 쓴다** (2026-08-01)
//
//  사용자 지시: "대전도 통곡의 탑에서 업데이트한 아이템UI와 스킬, 전투화면은 모두
//  가져가야 해. 안 가져오는 건 단 둘 — 모든 스킬은 유사한 밸런스, 능력치 강화 없음."
//
//  ⚠ **화면을 복제하지 않는다.** 600줄짜리 상점 UI를 대전용으로 한 벌 더 만들면
//    이 저장소가 반복해서 겪은 사고(두 벌이 조용히 갈라진다)가 그대로 재현된다.
//    대신 데이터 출처만 갈아끼운다 — UI 코드는 `self.src.*` 하나만 본다.
//
//  두 모드의 차이(여기 표에 다 있다):
//              탑                              대전
//    지갑      영구 골드                        한 판 예산(GAME.Arena.BUDGET)
//    아이템    사면 소모, 되팔면 70% 환급        예산 안에서 착용/해제(환급 개념 없음)
//    스킬      돈 주고 사고, 싼 것부터 잠금 해제  전부 무료·전부 열림(= 유사 밸런스)
//    능력치    탭 있음                          **없음**
//    영웅      캐릭터 생성 때 고정               여기서 고른다
GAME.TowerShopScene.SOURCES = {
  tower: {
    mode: 'tower',
    title: '통곡의 탑 상점',
    backLabel: '←  허브로',
    purseLabel: '💰 골드  ',
    tabs: [['item', '🛒 아이템'], ['skill', '📖 스킬'], ['stats', '⚒ 능력치']],
    back: function (sc) { sc.scene.start('Tower', { step: 'challenge' }); },
    rec: function () { return GAME.TowerChar.get(); },
    purse: function (rec) { return rec.gold; },
    //  가격은 언제나 **정가**다 (2026-08-22 태현님: 낀 것에 따라 상위 아이템 값이
    //  흔들리면 안 된다). 교체하면 낀 것이 70% 로 자동 판매된다(buyItem 의 계약) —
    //  그 환급은 afford 가 세고, 카드의 가격표에는 섞지 않는다.
    priceOf: function (rec, slot, it) { return it.cost; },
    afford: function (rec, price, slot) {
      var CAT = GAME.TowerShopItems;
      var cur = (slot && rec.items[slot]) ? CAT.find(slot, rec.items[slot]) : null;
      var credit = cur ? Math.floor(cur.cost * GAME.TowerChar.SELL_RATE) : 0;
      return rec.gold + credit >= price;
    },
    buy: function (slot, key) { return !!GAME.TowerChar.buyItem(slot, key); },
    canSell: true,
    sellBack: function (it) { return Math.floor(it.cost * GAME.TowerChar.SELL_RATE); },
    sell: function (slot) { return !!GAME.TowerChar.sellItem(slot); },
    skillOwned: function (slot, idx, rec) { return GAME.TowerChar.ownsSkill(slot, idx, rec); },
    skillLocked: function (slot, idx, rec) { return GAME.TowerChar.skillLocked(slot, idx, rec); },
    skillBuy: function (slot, idx) { return !!GAME.TowerChar.buySkill(slot, idx); },
    skillEquip: function (slot, idx) { return !!GAME.TowerChar.equipSkill(slot, idx); },
    // 탑은 가격 배수가 걸린다 — 상점 표기도 그 값이어야 거짓말을 안 한다.
    //  ⚠ 2026-08-01 — **계수까지 얹는다.** 스킬 피해가 `고정값 + 공격력 × 계수` 로
    //    바뀌었으므로, 값 배수만 얹은 숫자는 이제 실제 피해가 아니다.
    //    여기서 지금 내 능력치를 넣어 계산해야 "무기를 사면 스킬도 세진다"가
    //    **화면에서 보인다** — 그게 이번 개편의 목적이기도 하다.
    shownSkill: function (o, rec) {
      var c = GAME.skillPricedCopy ? GAME.skillPricedCopy(o) : o;
      if (!rec || !GAME.skillEffective) return c;
      var h = GAME.HEROES[rec.heroKey] || {};
      var b = GAME.TowerChar.statBonus(rec), ib = GAME.TowerChar.itemBonus(rec);
      return GAME.skillEffective(c,
        (h.damage || 0) + (b.damage || 0) + (ib.damage || 0),
        (h.armor || 0) + (b.armor || 0) + (ib.armor || 0));
    }
  },

  arena: {
    mode: 'arena',
    title: '대전 준비',
    backLabel: '←  대전으로',
    purseLabel: '◈ 남은 예산  ',
    tabs: [['hero', '🥚 영웅'], ['item', '🛒 아이템'], ['skill', '📖 스킬']],
    back: function (sc) { sc.scene.start('Versus'); },
    rec: function () { return GAME.ArenaBuild.get(); },
    purse: function (rec) { return GAME.ArenaBuild.left(rec); },
    // 대전은 환급이 없다 — 값은 언제나 정가다(바꿔 끼면 옛 값이 예산으로 그냥 돌아온다).
    priceOf: function (rec, slot, it) { return GAME.TowerShopItems.vsCostOf(it); },
    // ⚠ 같은 슬롯을 **바꿔 끼는** 경우, 지금 낀 것의 값은 예산으로 되돌아온다.
    //   그걸 안 세면 "예산이 남는데 못 산다"가 된다(실제로 그렇게 틀렸다).
    afford: function (rec, price, slot) {
      var CAT = GAME.TowerShopItems;
      var cur = (slot && rec.items[slot]) ? CAT.find(slot, rec.items[slot]) : null;
      return GAME.ArenaBuild.left(rec) + (cur ? CAT.vsCostOf(cur) : 0) >= price;
    },
    buy: function (slot, key) { return GAME.ArenaBuild.equipItem(slot, key) !== null; },
    canSell: true,
    sellBack: function (it) { return GAME.TowerShopItems.vsCostOf(it); },  // 벗으면 값이 그대로 예산으로 돌아온다
    sell: function (slot) { return GAME.ArenaBuild.unequipItem(slot) !== null; },
    // 대전은 스킬을 사지 않는다 — 전부 보유·전부 해제 상태다(= 유사 밸런스).
    skillOwned: function () { return true; },
    skillLocked: function () { return false; },
    skillBuy: function () { return false; },
    skillEquip: function (slot, idx) {
      var rec = GAME.ArenaBuild.get();
      rec.picks[slot] = idx;
      GAME.ArenaBuild.setHero(null, null, rec.picks);
      return true;
    },
    // 대전은 배수를 안 태운다 — 표에 적힌 값 그대로다.
    shownSkill: function (o) { return o; }
  }
};
GAME.TowerShopScene.prototype.init = function (data) {
  this.mode = (data && data.mode === 'arena') ? 'arena' : 'tower';
  this.src = GAME.TowerShopScene.SOURCES[this.mode];
  var defTab = this.mode === 'arena' ? 'hero' : 'item';
  this.tab = (data && data.tab) || defTab;
  this.previewSkill = null;   // { slot, idx } — 스킬 탭에서 지금 보고 있는 스킬
  // ⚠ 씬 인스턴스는 재사용된다 — 여기서 안 비우면 지난번에 고른 아이템이 다음 입장에
  //   그대로 선택돼 있고, 확정 막대가 "구매" 상태로 대기한다(오조작의 씨앗).
  this.itemPick = null;       // { slot, key } — 아이템 탭에서 지금 고른 것
  this.itemSlot = null;
  this.skillSlot = null;
  this.arenaFormationId = (data && data.formationId) || null;
  this.arenaTest = !!(data && data.test);
};

GAME.TowerShopScene.prototype.create = function () {
  var self = this;
  if (!GAME.Account.current()) { this.scene.start('Login'); return; }
  if (this.mode === 'tower' && (!GAME.TowerChar || !GAME.TowerChar.exists())) {
    this.scene.start('Tower'); return;
  }

  // 이 씬은 탑과 대전이 함께 쓴다 — 곡도 그 모드를 따라간다.
  if (GAME.Music) GAME.Music.play(this.mode === 'arena' ? 'versus' : 'tower');
  this.char = this.src.rec();
  this.hero = GAME.HEROES[this.char.heroKey];

  // 씬 인스턴스는 재사용된다 — 이전 그리기의 파괴된 참조가 남지 않게 비운다.
  this._previewG = null;
  this._body = [];   // 탭이 바뀔 때마다 지우는 표시객체 묶음

  var C = GAME.CONFIG.COLORS;
  this.cameras.main.setBackgroundColor(C.bg);

  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var PAD = GAME.CONFIG.SMALL ? 14 : 24;

  GAME.UI.label(this, PAD, 10, this.src.backLabel, 15, C.textDim, 0)
    .setInteractive({ useHandCursor: true })
    .on('pointerdown', function () { self.src.back(self); });

  GAME.UI.label(this, W / 2, 6, this.src.title, GAME.CONFIG.SMALL ? 22 : 30, C.text, 0.5)
    .setOrigin(0.5, 0);

  this.goldLabel = GAME.UI.label(this, W - PAD, 10, '', 20, C.accent, 1).setOrigin(1, 0);

  var tabY = 46;
  var TABS = this.src.tabs;
  var tabW = Math.min(W - PAD * 2, 420);
  var tc = GAME.Layout.cols(TABS.length, { gap: 8, width: tabW, left: (W - tabW) / 2, pad: 0 });
  this._tabBtns = [];
  TABS.forEach(function (t, i) {
    var b = GAME.UI.button(self, tc[i].cx, tabY + 22, tc[i].w, 40, t[1], function () {
      self.tab = t[0];
      self._buildBody();
    }, { fontSize: GAME.CONFIG.SMALL ? 14 : 15 });
    self._tabBtns.push({ key: t[0], btn: b });
  });

  this._bodyTop = tabY + 52;

  // 대전 전용 — 출전 버튼은 **탭과 무관하게 항상 보인다**(_body 에 안 넣는다).
  // 어느 탭에서든 준비가 끝났다고 느끼는 순간 나갈 수 있어야 한다.
  // ⚠ 이 버튼은 _body 밖에 있으므로 **탭 내용이 그 아래로 파고들 수 있다.**
  //   실제로 겹침 감사가 세 탭 전부에서 잡았다(장비 박스·미리보기 문구 위에 얹혔다).
  //   그래서 본문이 쓸 수 있는 세로를 그만큼 줄여 둔다 — 각 탭이 이 값을 읽는다.
  this._bottomPad = 0;
  if (this.mode === 'arena') {
    var bw = GAME.CONFIG.SMALL ? 130 : 180;
    var bh = GAME.CONFIG.SMALL ? 32 : 40;
    this._bottomPad = bh + (GAME.CONFIG.SMALL ? 8 : 12);
    GAME.UI.button(this, W - PAD - bw / 2, H - PAD - bh / 2 + 6, bw, bh, '⚔ 출전',
      function () { self._arenaSortie(); },
      { fill: GAME.UI.COL.panelTeal, line: C.controller, hover: GAME.UI.COL.panelTealHi,
        color: C.accent, fontSize: GAME.CONFIG.SMALL ? 14 : 17 });
  }

  this._buildBody();
};

// 대전 출전 — 준비한 영웅/아이템/스킬 그대로 전투로.
// ⚠ 아이템은 `{}` 로 넘긴다. `Combat.createHero` 는 **`GAME.ITEMS`(3단계 옛 표)** 로
//   해석하는데 우리 키(w5·c8 …)는 그 표에 없다. 탑이 이미 쓰는 방식 그대로,
//   보정은 `js/scenes/battle.js` 의 versus 블록이 `ArenaBuild.itemBonus` 로 직접 얹는다.
GAME.TowerShopScene.prototype._arenaSortie = function () {
  var rec = GAME.ArenaBuild.get();
  var Z = GAME.CONFIG.ZONE_CONTROLLER;
  this.scene.start('Battle', {
    formationId: this.arenaFormationId,
    heroKey: rec.heroKey,
    items: {},
    picks: rec.picks,
    versus: true,
    test: this.arenaTest,
    startPos: { x: Z.x + Z.w / 2, y: Z.y + Z.h * 0.55 }
  });
};

GAME.TowerShopScene.prototype._clearBody = function () {
  this._body.forEach(function (o) { if (o && o.destroy) o.destroy(); });
  this._body = [];
};

// bump=true 면 골드 숫자가 튕기는 연출을 준다(구매/판매 직후에만 — tower.js 허브의
// `_refreshRun` 과 같은 관용, 디자인 검토 #7: 이 화면만 그 연출이 빠져 있었다).
GAME.TowerShopScene.prototype._buildBody = function (bump) {
  this._clearBody();
  //  풀 이미지 전부 숨김 — 이 화면은 스윕이 안 돌아서, 탭을 갈아엎을 때 옛 탭의
  //  아이콘·무기 이미지가 유령으로 남는다(gearbank._order 도입으로 이미지가 패널
  //  위로 올라오면서 눈에 보이게 됐다). 이번 탭이 다시 그리는 것만 되살아난다.
  if (GAME.GearBank && GAME.GearBank.hideAll) GAME.GearBank.hideAll();
  this.char = this.src.rec();           // 구매 직후 최신 상태로 다시 읽는다
  this.hero = GAME.HEROES[this.char.heroKey] || this.hero;
  var C = GAME.CONFIG.COLORS;
  var self = this;

  this._tabBtns.forEach(function (t) {
    var on = t.key === self.tab;
    t.btn.rect.setStrokeStyle(on ? 2 : 1, on ? C.controller : GAME.UI.COL.borderUi);
    t.btn.rect.setFillStyle(on ? GAME.UI.COL.panelTeal : GAME.UI.COL.surfaceAlt);
  });

  this.goldLabel.setText(this.src.purseLabel + this.src.purse(this.char));
  if (bump) {
    this.goldLabel.setScale(1.25);
    this.tweens.add({ targets: this.goldLabel, scale: 1, duration: 260, ease: 'Back.easeOut' });
  }

  if (this.tab === 'hero') this._buildHeroTab();
  else if (this.tab === 'item') this._buildItemTab();
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
      GAME.UI.drawItem(g, s.key, it.key, bx + bw2 / 2, iconTop + iconSize / 2, iconSize, self.char.heroKey);
    }
    self._body.push(GAME.UI.label(self, bx + bw2 / 2, boxTop + boxH - 4,
      it ? GAME.TowerShopItems.nameFor(it, self.char.heroKey) : '—',
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
  // 대전에는 능력치 강화가 없다 — 막대는 **아이템이 준 것**만 말한다.
  // 탑은 강화 + 아이템 합계다. 같은 막대를 두 모드가 쓰되 더하는 항이 다르다.
  var rows;
  if (this.mode === 'arena') {
    var aib = GAME.ArenaBuild.itemBonus(this.char);
    rows = [
      ['공격력', aib.damage], ['체력', aib.hp], ['방어력', aib.armor],
      ['이동속도', aib.speed], ['행운', aib.luck]
    ];
  } else {
    var bonus = GAME.TowerChar.statBonus(this.char);
    var ib = GAME.TowerChar.itemBonus(this.char);
    rows = [
      ['공격력', bonus.damage + ib.damage],
      ['체력', bonus.hp + ib.hp],
      ['방어력', bonus.armor + ib.armor],
      ['이동속도', bonus.speed + ib.speed],
      ['행운', GAME.TowerChar.luckLevel(this.char)]
    ];
  }
  var rowH = GAME.CONFIG.PHONE ? 17 : (GAME.CONFIG.SMALL ? 18 : 22);
  var gap = GAME.CONFIG.PHONE ? 3 : (GAME.CONFIG.SMALL ? 3 : 4);
  var fs = GAME.CONFIG.PHONE ? 10 : (GAME.CONFIG.SMALL ? 11 : 13);
  // ⚠ 예전엔 `frac: 1` 로 박혀 있어 **수치가 0 이어도 막대가 꽉 차 있었다**(사용자 신고).
  //   막대는 "얼마나 올렸나"를 말해야 하므로 상한(TowerChar.statCeil)으로 나눈다.
  var keys = ['damage', 'hp', 'armor', 'speed', 'luck'];
  rows.forEach(function (r, i) {
    var ry = y + i * (rowH + gap);
    self._body.push(GAME.UI.label(self, x, ry, r[0], fs, C.textDim, 0));
    var ceil = GAME.TowerChar.statCeil(keys[i], r[1]);
    var frac = Math.max(0, Math.min(1, r[1] / ceil));
    var m = GAME.UI.meter(self, x + 76, ry + 1, w - 76, rowH - 2, {
      color: C.controller, frac: frac,
      label: { size: fs, color: C.text, align: 'center' }
    });
    m.setText('+' + Math.round(r[1] * 10) / 10);
    self._body.push({ destroy: function () { m.destroy(); } });
  });
};

// ── 영웅 탭 (대전 전용) ──────────────────────────────────────────────────
//  탑은 캐릭터를 만들 때 영웅이 정해져 평생 안 바뀐다. 대전은 판마다 고를 수 있다.
//  ⚠ 영웅을 바꾸면 **스킬 선택이 그 영웅 것이 아니게 된다** — 슬롯별 선택지 배열이
//    영웅마다 다르기 때문이다. 그래서 바꾸는 즉시 기본값으로 되돌린다.
GAME.TowerShopScene.prototype._buildHeroTab = function () {
  var C = GAME.CONFIG.COLORS;
  var self = this;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var top = this._bodyTop;
  var PAD = GAME.CONFIG.SMALL ? 14 : 24;
  var P = GAME.CONFIG.PHONE;

  var order = GAME.HERO_ORDER;
  var gap = P ? 8 : 16;
  var cardW = Math.min((W - PAD * 2 - gap * (order.length - 1)) / order.length, 300);
  var totalW = cardW * order.length + gap * (order.length - 1);
  var left = (W - totalW) / 2;
  var cardH = Math.min(H - top - (P ? 60 : 96) - this._bottomPad, P ? 250 : 470);

  order.forEach(function (hk, i) {
    var h = GAME.HEROES[hk];
    var on = self.char.heroKey === hk;
    var cx0 = left + i * (cardW + gap);

    var g = self.add.graphics();
    self._body.push(g);
    g.fillStyle(on ? GAME.UI.COL.panelTeal : GAME.UI.COL.surfaceAlt, 1);
    g.fillRoundedRect(cx0, top, cardW, cardH, 12);
    g.lineStyle(on ? 3 : 1, on ? C.controller : GAME.UI.COL.border, 1);
    g.strokeRoundedRect(cx0, top, cardW, cardH, 12);

    self._body.push(GAME.UI.label(self, cx0 + cardW / 2, top + 10,
      h.name, P ? 16 : 22, on ? C.accent : C.text, 0.5).setOrigin(0.5, 0));
    self._body.push(GAME.UI.label(self, cx0 + cardW / 2, top + (P ? 30 : 40),
      h.trait, P ? 11 : 13, C.textDim, 0.5).setOrigin(0.5, 0));

    // ⚠ 아래 두 줄(스탯 요약·버튼)의 자리를 **먼저 떼고** 무대를 잡는다.
    //   예전엔 셋을 각자 카드 바닥에서 역산했다가 스탯 줄과 버튼이 겹쳤다(감사가 잡음).
    var btnH = P ? 26 : 34;
    var statLineH = P ? 15 : 18;
    var footH = btnH + statLineH + (P ? 12 : 18);
    var stageTop = top + (P ? 46 : 62);
    var stageH = cardH - (stageTop - top) - footH;
    var r = Math.min(cardW * 0.215, stageH / 5.2);
    var feetY = stageTop + (stageH - r * 5) / 2 + r * 3.2;
    var pg = self.add.graphics();
    self._body.push(pg);
    pg.fillStyle(GAME.UI.COL.surfaceHi, 0.42);
    pg.fillEllipse(cx0 + cardW / 2, feetY + r * 0.32, r * 2.5, r * 0.85);
    pg.fillStyle(0x000000, GAME.UI.IS_LIGHT ? 0.13 : 0.28);
    pg.fillEllipse(cx0 + cardW / 2, feetY + r * 0.36, r * 1.7, r * 0.4);
    GAME.UI.drawUnitFlat(pg, h, cx0 + cardW / 2, feetY, C.controller, 1,
      r / (h.radius || 17), Math.PI / 2, null, self.time.now, null,
      on ? GAME.UI.gearTierOf(self.char.items && self.char.items.weapon) : 0);

    // 스탯 요약은 무대 바로 아래, 버튼은 카드 바닥 — 둘 사이가 겹치지 않게 떼어 놨다.
    self._body.push(GAME.UI.label(self, cx0 + cardW / 2, stageTop + stageH + 2,
      '체력 ' + h.hp + ' · 공격 ' + h.damage + ' · 속도 ' + h.speed,
      P ? 10 : 12, C.textDim, 0.5).setOrigin(0.5, 0));

    var bw = cardW - (P ? 20 : 32);
    var b = GAME.UI.button(self, cx0 + cardW / 2, top + cardH - (P ? 8 : 12) - btnH / 2, bw, btnH,
      on ? '선택됨' : '이 영웅으로', function () {
        if (on) return;
        // 영웅이 바뀌면 스킬 선택은 그 영웅의 것이 아니다 → 기본값으로 되돌린다.
        GAME.ArenaBuild.setHero(hk, null, GAME.defaultSkillPicks());
        self.previewSkill = null;
        self.skillSlot = null;
        self._buildBody(true);
      }, { fontSize: P ? 12 : 14 });
    b.text.setColor(on ? C.textDim : C.accent);
    b.rect.setStrokeStyle(on ? 1 : 2, on ? GAME.UI.COL.borderUi : C.controller);
    self._body.push(b);
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
//  ── 세로 스크롤 영역 (2026-08-03 사용자 지시) ────────────────────────────────
//  > "아이템 단수가 너무 많으면 스크롤 기능을 추가해 … 아이템은 상위 아이템도 계속
//  >  늘려야하거든"
//
//  예전 격자는 행이 늘면 **카드 높이를 나눠 가졌다.** 그래서 단계를 8 → 10 으로
//  늘리자마자 폰 카드가 28px 로 줄어 글자가 카드를 넘쳐 다음 칸과 겹쳤다(v1.46 실측).
//  상위 아이템이 앞으로도 계속 늘어난다면 그 구조는 반드시 다시 터진다 —
//  **카드 크기를 고정하고 넘치는 만큼 스크롤한다.**
//
//  ⚠ `layer` 는 컨테이너지만 **좌표계를 안 바꾼다** — (0,0)에서 시작하므로 안에 넣는
//    표시객체는 절대좌표 그대로 두면 되고, 스크롤은 컨테이너 y 만 움직인다.
//  ⚠ **마스크는 입력을 안 막는다.** 화면 밖으로 밀려난 카드도 Phaser 는 계속 눌리는
//    것으로 친다 — 그래서 `tap()` 이 좌표를 직접 검사한다. 이걸 빠뜨리면 목록 위쪽
//    바깥의 보이지도 않는 카드가 눌린다.
GAME.TowerShopScene.prototype._scroller = function (x, y, w, h, stateKey) {
  var self = this;
  var C = GAME.CONFIG.COLORS;
  var layer = this.add.container(0, 0);
  this._body.push(layer);

  var mg = this.make.graphics({ x: 0, y: 0, add: false });
  mg.fillStyle(0xffffff, 1);
  mg.fillRect(x, y, w, h);
  layer.setMask(mg.createGeometryMask());
  //  ⚠ 겹침 감사(tools/overlap-audit.js)가 읽는다. 마스크는 Phaser 내부 객체라 밖에서
  //    사각형을 되꺼낼 수가 없어서, **보이는 창을 여기 적어 둔다.** 이게 없으면 감사가
  //    스크롤로 밀려난(=안 보이는) 카드까지 겹침으로 세어 거짓 실패를 낸다.
  layer.__clipRect = { x: x, y: y, w: w, h: h };
  this._body.push({ destroy: function () { mg.destroy(); } });

  //  스크롤 위치는 **씬에 남긴다.** 카드를 고를 때마다 `_buildBody` 가 전부 다시
  //  그리는데, 위치를 지역변수로 두면 고를 때마다 맨 위로 튕겨 올라가 아래쪽 아이템은
  //  아예 고를 수가 없게 된다.
  if (self[stateKey] === undefined) self[stateKey] = 0;

  var inside = function (p) { return p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h; };
  var api = { layer: layer, max: 0 };
  api.add = function (o) { layer.add(o); self._body.push(o); return o; };

  //  ── 눌리는 자리는 **표시객체가 아니라 좌표로** 잡는다 (2026-08-03 사용자 신고) ──
  //  > "방어구,신발 탭 버튼이 안눌려"
  //
  //  처음엔 카드마다 투명한 히트 사각형을 컨테이너에 넣었다. 그런데 **마스크는 그리는
  //  것만 자르고 입력은 안 자른다** — 스크롤해서 창 위로 밀려난 카드는 눈에서만
  //  사라지고 히트 영역은 그 자리(=슬롯 버튼 줄)에 그대로 남는다. 컨테이너가 버튼보다
  //  나중에 만들어져 표시목록 위에 있으니 Phaser 는 맨 위의 그것을 집고, 좌표 밖이라
  //  아무 일도 안 한다 — **버튼은 이벤트를 아예 못 받는다.** "안 눌린다"가 아니라
  //  가려져 있었던 것이고, 스크롤한 뒤에만 생겨서 더 헷갈렸다.
  //
  //  ⚠ `input.enabled = false` 로 꺼 보는 것도 시도했는데 **안 통했다**(실측).
  //    그래서 아예 **컨테이너 안에 상호작용 객체를 하나도 두지 않는다.** 누를 자리는
  //    사각형 목록으로만 갖고 있다가 스크롤 영역이 직접 판정한다 — 표시목록에 없으니
  //    무엇도 가릴 수가 없고, 앞으로 이 계열의 사고가 구조적으로 불가능해진다.
  var zones = [];
  api.tap = function (rect, fn) { zones.push({ r: rect, fn: fn }); };

  //  누르고 뗀 자리가 거의 같을 때만 고른다 — 끌어서 스크롤하려던 손짓이 그대로
  //  선택이 되면 폰에서 목록을 못 쓴다.
  var press = null;
  var onDown0 = function (p) { press = inside(p) ? { x: p.x, y: p.y } : null; };
  var onUp0 = function (p) {
    if (!press) return;
    var moved = Math.abs(p.x - press.x) + Math.abs(p.y - press.y);
    press = null;
    if (moved > 10 || !inside(p)) return;
    var sy = self[stateKey] || 0;                  // 화면 좌표 → 내용 좌표
    for (var i = 0; i < zones.length; i++) {
      var r = zones[i].r;
      if (p.x >= r.x && p.x <= r.x + r.w && p.y + sy >= r.y && p.y + sy <= r.y + r.h) {
        zones[i].fn(); return;
      }
    }
  };
  this.input.on('pointerdown', onDown0);
  this.input.on('pointerup', onUp0);
  this._body.push({ destroy: function () {
    self.input.off('pointerdown', onDown0);
    self.input.off('pointerup', onUp0);
  } });

  api.finish = function (contentH) {
    api.max = Math.max(0, contentH - h);
    self[stateKey] = Math.max(0, Math.min(api.max, self[stateKey]));
    layer.y = -self[stateKey];
    if (api.max <= 0) return;          // 다 들어가면 스크롤 장치를 안 만든다

    //  손잡이 — "아래에 더 있다"가 보여야 한다. 없으면 스크롤되는 줄 모른다.
    var bar = self.add.graphics();
    self._body.push(bar);
    var drawBar = function () {
      var th = Math.max(24, h * (h / contentH));
      var t = api.max ? (self[stateKey] / api.max) : 0;
      bar.clear();
      bar.fillStyle(GAME.UI.COL.border, 0.35);
      bar.fillRoundedRect(x + w - 5, y, 4, h, 2);
      bar.fillStyle(C.accent, 0.85);
      bar.fillRoundedRect(x + w - 5, y + (h - th) * t, 4, th, 2);
    };
    drawBar();

    var moveTo = function (v) {
      self[stateKey] = Math.max(0, Math.min(api.max, v));
      layer.y = -self[stateKey];
      drawBar();
    };

    var onWheel = function (p, over, dx, dy) { if (inside(p)) moveTo(self[stateKey] + dy * 0.5); };
    self.input.on('wheel', onWheel);

    var drag = null;
    var onDown = function (p) { if (inside(p)) drag = { y: p.y, at: self[stateKey] }; };
    var onMove = function (p) {
      if (!drag) return;
      if (!p.isDown) { drag = null; return; }
      moveTo(drag.at - (p.y - drag.y));
    };
    var onUp = function () { drag = null; };
    self.input.on('pointerdown', onDown);
    self.input.on('pointermove', onMove);
    self.input.on('pointerup', onUp);

    //  ⚠ 씬 입력 핸들러는 `_body` 파괴로 안 없어진다 — 직접 떼지 않으면 탭을 옮길
    //    때마다 쌓여서 한 번 굴릴 때 여러 칸씩 튄다.
    self._body.push({ destroy: function () {
      self.input.off('wheel', onWheel);
      self.input.off('pointerdown', onDown);
      self.input.off('pointermove', onMove);
      self.input.off('pointerup', onUp);
    } });
  };
  return api;
};

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
  // ⚠ **폰 가로에서는 하단 능력치 바를 안 그린다** (2026-07-31).
  //   사용자 요구가 "아이템 이름과 어떤 능력치를 추가해주는지도 박스 안에 보여줘"인데,
  //   390px 화면에서 능력치 바(97px)까지 깔면 카드에 남는 세로가 66px 뿐이라
  //   아이콘·이름·효과·가격을 물리적으로 못 담는다(글자는 `UI.size` 가 13px 아래로
  //   안 내려가므로 폰트를 줄여 우겨넣는 길도 없다 — 하한이 곧 벽이다).
  //   능력치 총합은 이제 **능력치 탭**이 더 잘 보여주므로, 좁은 화면에서는 그쪽에 맡긴다.
  var statH = P ? 0 : this.statBarsHeight();
  var statY = H - (P ? 12 : 10) - statH - this._bottomPad;
  this._drawCharPanel(W - PAD - rightW, top, rightW, statY - top - 10);
  if (!P) this._drawStatBars(leftX, statY, leftW);

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
        //  슬롯이 바뀌면 목록이 통째로 다른 것이므로 **맨 위에서 시작한다.**
        //  안 되돌리면 무기 목록 밑에서 신발 탭으로 갔을 때 중간부터 보인다.
        self._itemScrollY = 0;
        self._buildBody();
      }, { fontSize: P ? 12 : 14 });
    b.rect.setStrokeStyle(on ? 2 : 1, on ? C.controller : GAME.UI.COL.borderUi);
    b.rect.setFillStyle(on ? GAME.UI.COL.panelTeal : GAME.UI.COL.surfaceAlt);
    b.text.setColor(on ? C.accent : C.textDim);
    self._body.push(b);
  });

  // ── 그 슬롯의 전 단계를 격자로 펼친다(2026-08-03 기준 10종) ──
  //  ⚠ 행 수는 `list.length` 에서 계산한다 — 단계를 늘리면 폰이 4행에서 5행이 되고
  //    카드 높이가 그만큼 줄어든다. 단계를 더 늘릴 때는 반드시 overlap-audit 을 돌릴 것.
  var list = GAME.TowerShopItems.CATALOG[this.itemSlot] || [];
  var curKey = this.char.items[this.itemSlot];
  var cur = curKey ? GAME.TowerShopItems.find(this.itemSlot, curKey) : null;

  // 선택한 칸이 이 슬롯의 것이 아니면 버린다(탭을 옮기면 선택도 따라 옮겨야 한다).
  if (this.itemPick && this.itemPick.slot !== this.itemSlot) this.itemPick = null;

  // ⚠ **격자 아래에 '확정 막대'를 위한 자리를 먼저 뗀다** (2026-07-31 사용자 신고:
  //   "클릭만 했더니 구매가 되어버렸어"). 카드를 누르면 곧장 사던 것을 고르기/확정
  //   두 단계로 나눴다 — 되돌리기 어려운 행동은 한 번 더 물어야 한다.
  var barH = P ? 34 : 44;
  var gridTop = top + stH + (P ? 6 : 10);
  var gridBottom = statY - (P ? 4 : 12) - barH - (P ? 4 : 8);
  // 폰은 **2열 4행 + 가로형 카드**(아이콘 왼쪽 · 글 오른쪽)다. 4열로 쪼개면 칸 폭이
  // 127px 라 효과 문구가 4줄로 접힌다. 2열이면 258px 라 두 줄에 들어간다.
  // PC 는 카드가 커서 세로형(아이콘 위 · 글 아래)이 더 읽기 좋다.
  var ncol = P ? 2 : 4, nrow = Math.ceil(list.length / ncol);
  var cgap = P ? 5 : 10;
  //  ⚠ 손잡이가 설 자리(6px)를 빼고 카드 폭을 잡는다 — 안 빼면 오른쪽 카드가 손잡이에
  //    깔린다. 스크롤이 없는 경우에도 폭을 같게 둔다(슬롯을 옮길 때 카드가 안 들썩인다).
  var gridW = leftW - 6;
  var cardW = (gridW - cgap * (ncol - 1)) / ncol;
  //  ⚠ **높이는 고정이다.** 예전에는 남는 자리를 행 수로 나눴는데, 그러면 단계를
  //    늘릴 때마다 카드가 얇아져 결국 글자가 넘친다(v1.46 에서 겪었다).
  var cardH = P ? 58 : 150;
  var gridH = Math.max(cardH + 4, gridBottom - gridTop);
  var sc = this._scroller(leftX, gridTop, leftW, gridH, '_itemScrollY');

  list.forEach(function (it, i) {
    var cx0 = leftX + (i % ncol) * (cardW + cgap);
    var cy0 = gridTop + Math.floor(i / ncol) * (cardH + cgap);
    var equipped = cur && cur.key === it.key;
    var picked = self.itemPick && self.itemPick.key === it.key;
    var price = self.src.priceOf(self.char, self.itemSlot, it);
    var afford = self.src.afford(self.char, price, self.itemSlot);

    var g = sc.add(self.add.graphics());
    g.fillStyle(equipped ? GAME.UI.COL.panelTeal : GAME.UI.COL.surfaceAlt, 1);
    g.fillRoundedRect(cx0, cy0, cardW, cardH, 10);
    // 테두리 세 상태: 고른 것(강조) > 장착 중(진영색) > 평소.
    g.lineStyle(picked ? 3 : (equipped ? 2 : 1),
                picked ? C.accent : (equipped ? C.controller : GAME.UI.COL.border), 1);
    g.strokeRoundedRect(cx0, cy0, cardW, cardH, 10);

    var priceTxt = equipped ? '장착 중'
                            : (price === 0 ? '무료 교체' : ('💰 ' + price));
    var priceCol = equipped ? C.accent : (afford ? C.text : C.textDim);

    if (P) {
      // ── 폰: 가로형 — 아이콘 왼쪽, [이름 / 효과] 오른쪽, 가격은 이름 줄 오른쪽 끝 ──
      // 아이콘을 조금 줄여 글 폭을 6px 벌었다 — 효과 4개짜리 장신구가 한 줄에 들어가는
      // 경계가 그만큼 여유로워진다(실측: 마지막 행에서만 2줄로 접혀 카드를 넘쳤다).
      var pIcon = Math.min(cardH - 8, 36);
      var pIx = cx0 + 5;
      g.fillStyle(GAME.UI.COL.bg, equipped ? 0.5 : 1);
      g.fillRoundedRect(pIx, cy0 + (cardH - pIcon) / 2, pIcon, pIcon, 6);
      GAME.UI.drawItem(g, self.itemSlot, it.key, pIx + pIcon / 2, cy0 + cardH / 2, pIcon - 4, self.char.heroKey);

      var tx = pIx + pIcon + 8;
      var tw = cx0 + cardW - 6 - tx;
      //  ⚠ 두 줄의 y 를 **카드 높이에서 역산한다**(2026-08-03). 예전에는 `cy0+4` /
      //    `cy0+22` 로 박혀 있었는데, 단계를 8 → 10 으로 늘리자 폰이 4행에서 5행이 되어
      //    카드가 28px 로 줄었고 아래 줄이 카드를 넘쳐 **다음 칸 이름과 겹쳤다**
      //    (overlap-audit 이 대전 아이템 탭에서 8건 잡았다). 고정 오프셋은 행 수가
      //    바뀌는 격자에서 반드시 이렇게 터진다 — 앞으로 단계를 더 늘려도 안전하다.
      var lineH = 16;                                    // 13px 글자 + 최소 여백
      var padY = Math.max(1, (cardH - lineH * 2 + 3) / 2);
      var nameY = cy0 + padY, noteY = nameY + lineH;
      var priceLbl = sc.add(GAME.UI.label(self, cx0 + cardW - 6, nameY, priceTxt, 13, priceCol, 0)
        .setOrigin(1, 0));
      // 이름은 가격이 차지하고 남은 폭만 쓴다 — 안 그러면 둘이 겹친다.
      sc.add(GAME.UI.label(self, tx, nameY,
        GAME.TowerShopItems.nameFor(it, self.char.heroKey), 13,
        equipped ? C.accent : C.text, 0).setWordWrapWidth(Math.max(40, tw - priceLbl.width - 8)));
      // 효과 문구 — 이 줄이 사용자가 요구한 "어떤 능력치를 추가해주는지"다.
      // ⚠ **숨기지 않는다.** 예전엔 넘치면 `setVisible(false)` 로 감췄는데, 효과가
      //   3~4개인 장신구(그림자 반지·여명의 인장)가 통째로 설명 없는 카드가 됐다
      //   (사용자 신고). 지금은 값에서 **짧게 다시 만들어**(라벨 축약 + 큰 수 k 표기)
      //   폭 안에 들어가게 한다 — 감추는 대신 줄이는 것이 맞다.
      var noteTxt = GAME.TowerShopItems.noteOf(it, true);
      sc.add(GAME.UI.label(self, tx, noteY, noteTxt, 13, C.textDim, 0)
        .setWordWrapWidth(tw).setLineSpacing(0));

    } else {
      // ── PC: 세로형 — 아이콘 위, 이름·효과 가운데, 가격 바닥 ──
      // ⚠ 아이콘 비중을 0.42 → 0.34 로 낮췄다. 0.42 면 글 자리가 48px 뿐이라
      //   이름(17) + 두 줄짜리 효과(34) = 51px 가 안 들어가 효과가 통째로 숨겨졌다
      //   (사용자 신고: "어떤 능력치 추가해주는지도 박스 안에 보여줘"). 60px 로 벌었다.
      var iconSz = Math.min(cardW - 26, cardH * 0.34);
      var iconCy = cy0 + 8 + iconSz / 2;
      g.fillStyle(GAME.UI.COL.bg, equipped ? 0.5 : 1);
      g.fillRoundedRect(cx0 + (cardW - iconSz) / 2 - 3, iconCy - iconSz / 2 - 3, iconSz + 6, iconSz + 6, 7);
      GAME.UI.drawItem(g, self.itemSlot, it.key, cx0 + cardW / 2, iconCy, iconSz, self.char.heroKey);

      var flowY = iconCy + iconSz / 2 + 7;
      var nameLbl = sc.add(GAME.UI.label(self, cx0 + cardW / 2, flowY,
        GAME.TowerShopItems.nameFor(it, self.char.heroKey), 13,
        equipped ? C.accent : C.text, 0.5)
        .setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(cardW - 8));
      sc.add(GAME.UI.label(self, cx0 + cardW / 2, nameLbl.y + nameLbl.height + 3,
        GAME.TowerShopItems.noteOf(it, false), 13, C.textDim, 0.5).setOrigin(0.5, 0).setAlign('center')
        .setWordWrapWidth(cardW - 12));
      sc.add(GAME.UI.label(self, cx0 + cardW / 2, cy0 + cardH - 6,
        priceTxt, 13, priceCol, 0.5).setOrigin(0.5, 1));
    }

    // 카드를 누르면 **고르기만 한다.** 사는 것은 아래 확정 막대의 버튼이 한다.
    // (예전엔 카드가 곧 구매였는데, 구경하려고 누른 것이 그대로 결제됐다 — 사용자 신고.)
    //  ⚠ **투명 사각형을 만들지 않는다.** 눌릴 자리를 좌표로만 등록하면 표시목록에
    //    아무것도 안 올라가므로, 스크롤로 밀려난 카드가 슬롯 버튼을 가리는 사고가
    //    구조적으로 불가능해진다(위 `_scroller` 주석 참조).
    sc.tap({ x: cx0, y: cy0, w: cardW, h: cardH }, function () {
      self.itemPick = { slot: self.itemSlot, key: it.key };
      self._buildBody();
    });
  });
  sc.finish(nrow * cardH + (nrow - 1) * cgap);

  // ── 확정 막대 — 고른 것을 실제로 사고 파는 유일한 자리 ──
  var barY = gridBottom + (P ? 4 : 8);
  var pick = self.itemPick ? GAME.TowerShopItems.find(self.itemSlot, self.itemPick.key) : null;
  var bg2 = this.add.graphics();
  this._body.push(bg2);
  bg2.fillStyle(GAME.UI.COL.surfaceAlt, 1);
  bg2.fillRoundedRect(leftX, barY, leftW, barH, 10);
  bg2.lineStyle(1, GAME.UI.COL.border, 1);
  bg2.strokeRoundedRect(leftX, barY, leftW, barH, 10);

  if (!pick) {
    this._body.push(GAME.UI.label(this, leftX + leftW / 2, barY + barH / 2,
      '살 물건을 고르세요', P ? 12 : 14, C.textDim, 0.5).setOrigin(0.5));
  } else {
    var arena = self.mode === 'arena';
    var pEquipped = cur && cur.key === pick.key;
    var pPrice = self.src.priceOf(self.char, self.itemSlot, pick);
    var pAfford = self.src.afford(self.char, pPrice, self.itemSlot);
    var pBack = self.src.sellBack(pick);
    var bw2 = P ? 108 : 150;
    // 대전은 '판매'가 아니라 '벗기'다 — 통화가 아니라 예산이라 값이 그대로 돌아온다.
    var offWord = arena ? '벗기' : '판매';
    //  교체 시 낀 것의 70% 환급을 여기서 말한다 — 가격표(정가)에 섞으면 상위
    //  아이템 값이 낀 것에 따라 흔들린다(2026-08-22 태현님 지시로 정가 고정).
    var pTrade = (!pEquipped && !arena && cur)
      ? ('  (낀 것 되팔기 +' + self.src.sellBack(cur) + ')') : '';
    this._body.push(GAME.UI.label(this, leftX + 12, barY + barH / 2,
      pick.name + '  ·  ' + (pEquipped ? (arena ? ('벗으면 ' + pBack + ' 돌려받음')
                                                 : ('판매가 ' + pBack + '골드'))
                                       : (pPrice === 0 ? '무료 교체' : (pPrice + (arena ? '' : '골드') + pTrade))),
      P ? 12 : 15, pEquipped ? C.accent : (pAfford ? C.text : C.textDim), 0)
      .setOrigin(0, 0.5).setWordWrapWidth(leftW - bw2 - 30));

    var actLabel = pEquipped ? offWord : (cur ? '교체' : (arena ? '장착' : '구매'));
    var ab2 = GAME.UI.button(this, leftX + leftW - 10 - bw2 / 2, barY + barH / 2,
      bw2, barH - (P ? 8 : 12), actLabel, function () {
        if (pEquipped) {
          // 탑의 판매는 되돌리기 어려워 한 번 묻는다. 대전은 그냥 벗는 것이라 안 묻는다
          // (예산이 그대로 돌아오므로 되돌릴 수 있다 — 물어야 할 이유가 없다).
          if (arena) {
            if (self.src.sell(self.itemSlot)) { self.itemPick = null; self._buildBody(true); }
            return;
          }
          GAME.Modal.open(self, {
            title: pick.name + ' 판매',
            items: [
              { key: 'yes', name: '판매한다', note: pBack + '골드를 돌려받습니다' },
              { key: 'no', name: '취소' }
            ],
            onPick: function (m) {
              if (!m || m.key !== 'yes') return;
              self.src.sell(self.itemSlot);
              self.itemPick = null;
              self._buildBody(true);
            }
          });
          return;
        }
        if (!pAfford) return;
        if (self.src.buy(self.itemSlot, pick.key)) {
          self.itemPick = null;
          self._buildBody(true);
        }
      }, { fontSize: P ? 12 : 14 });
    ab2.text.setColor(pEquipped ? C.accent : (pAfford ? C.accent : C.textDim));
    ab2.rect.setStrokeStyle(pAfford || pEquipped ? 2 : 1,
                            pAfford || pEquipped ? C.controller : GAME.UI.COL.borderUi);
    this._body.push(ab2);
  }
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
  //  **화면에서는 가격 오름차순으로 세운다.** 잠금 규칙이 "더 싼 것부터"(towerchar.js 의
  //  `skillLocked`)라 목록도 그 순서로 보여야 사다리가 눈에 보인다. 원본 배열은 그대로
  //  두고 표시 순서만 바꾼다 — 배열을 재정렬하면 저장된 picks 가 다른 스킬을 가리킨다.
  var slot = this.skillSlot;
  var opts = this.hero.skillOptions[slot].map(function (o, i) { return { o: o, idx: i }; })
    .sort(function (a, b) { return ((a.o.cost || 0) - (b.o.cost || 0)) || (a.idx - b.idx); });
  var listTop = top + stH + (P ? 6 : 10);
  var listBottom = H - (P ? 12 : 20) - this._bottomPad;
  var rgap = P ? 4 : 8;
  var rowH = Math.min((listBottom - listTop - rgap * (opts.length - 1)) / opts.length, P ? 54 : 76);

  opts.forEach(function (entry, row) {
    var o = entry.o, idx = entry.idx;
    var ry = listTop + row * (rowH + rgap);
    var owned = self.src.skillOwned(slot, idx, self.char);
    var locked = !owned && self.src.skillLocked(slot, idx, self.char);
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
      (locked ? '🔒 ' : '') + o.name +
      (equipped ? '  ✓ 장착 중' : (owned ? '  · 보유' : '')),
      P ? 12 : 15, owned ? C.text : C.textDim, 0).setWordWrapWidth(txtW));
    var typeLabel = GAME.SKILL_TYPE_LABEL[o.type] || o.type;
    // 잠긴 칸은 **왜 못 사는지**를 그 자리에 적는다 — 안 적으면 "왜 안 눌리지"가 된다.
    self._body.push(GAME.UI.label(self, leftX + 12, ry + (P ? 22 : 32),
      // 대전은 스킬을 사지 않는다 — 가격을 적으면 있지도 않은 통화를 말하게 된다.
      // ⚠ 2026-08-01 — **목록에 위력을 적는다**(사용자: "계수가 아직도 잘 안 들어간 것
      //   같아"). 계수는 실제로 들어가 있었지만 **목록에는 쿨과 값만** 있어서, 고르기
      //   전에는 스킬끼리 비교할 방법이 없었다. 상세 창을 하나씩 열어 봐야 알 수 있는
      //   수치는 "없는 것과 같다" — 비교가 안 되면 값 차이도 못 느낀다.
      //   `shownSkill` 이 값 배수 + 계수를 다 얹은 값을 준다(상세 창과 같은 숫자다).
      locked ? '앞 단계 스킬을 먼저 사야 열립니다'
             : (function () {
                 var sh = self.src.shownSkill(o, self.char);
                 var pw = sh.damage > 0 ? ('피해 ' + GAME.UI.numAbbr(sh.damage))
                        : (sh.shield > 0 ? ('보호막 ' + GAME.UI.numAbbr(sh.shield))
                        : (sh.dps > 0 ? ('초당 ' + GAME.UI.numAbbr(sh.dps)) : ''));
                 //  ⚠ 쿨타임은 **가격 배수가 반영된 값**(sh)을 보여야 한다.
                 //    원본 o.cooldown 을 쓰면 상세 화면과 최대 2배 어긋난다
                 //    (대지 붕괴 목록 34초 vs 상세 17.7초). 비쌀수록 쿨이 짧아지는
                 //    것이 이 상점의 판매 논리인데, 목록이 그 이득을 숨기고 있었다.
                 return typeLabel + (pw ? ('  ·  ' + pw) : '') +
                   '  ·  쿨 ' + (sh.cooldown ? (Math.round(sh.cooldown / 100) / 10) + '초' : '—') +
                   (self.mode === 'arena' ? ''
                     : (o.cost ? ('  ·  ' + o.cost + '골드') : '  ·  기본 내장'));
               })(),
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
    if (locked) {
      // 앞 단계를 아직 안 산 상태 — 값을 보여주되 누를 수 없다는 걸 자물쇠로 말한다.
      act = '🔒 잠김'; fn = function () {};
    } else if (!owned) { act = afford ? ('💰 ' + (o.cost || 0)) : ('💰 ' + (o.cost || 0)); fn = function () {
      if (self.src.skillBuy(slot, idx)) self._buildBody(true);
    }; }
    else if (equipped) { act = '장착 중'; fn = function () {}; }
    else { act = '장착'; fn = function () {
      self.src.skillEquip(slot, idx); self._buildBody();
    }; }
    var ab = GAME.UI.button(self, leftX + leftW - 12 - btnW / 2, ry + rowH / 2,
      btnW, rowH - (P ? 12 : 18), act, fn, { fontSize: P ? 11 : 13 });
    ab.text.setColor(locked ? C.textDim
                            : (equipped ? C.textDim : ((owned || afford) ? C.accent : C.textDim)));
    ab.rect.setStrokeStyle((owned && !equipped) || (!owned && afford) ? 2 : 1,
      (owned && !equipped) ? C.controller : GAME.UI.COL.borderUi);
    self._body.push(ab);
  });

  // ── 미리보기 창 — 넓어진 폭을 실제로 쓴다 ──
  var pg = this.add.graphics();
  this._body.push(pg);
  var pTop = top, pH = H - top - (P ? 12 : 20) - this._bottomPad;
  pg.fillStyle(GAME.UI.COL.surfaceAlt, 1);
  pg.fillRoundedRect(rightX, pTop, rightW, pH, 12);
  pg.lineStyle(1, GAME.UI.COL.border, 1);
  pg.strokeRoundedRect(rightX, pTop, rightW, pH, 12);

  if (!this.previewSkill || this.previewSkill.slot !== slot) {
    this.previewSkill = { slot: slot, idx: this.char.picks[slot] };
  }
  var ps = this.previewSkill;
  var o = this.hero.skillOptions[ps.slot][ps.idx];
  // ⚠ **가격 배수를 얹은 사본**을 쓴다. 전장에서는 `GAME.scaleSkillsByPrice` 가 비싼
  //   스킬을 더 세게 만드는데(js/heroes.js), 여기서 원본 숫자·크기를 보여주면 상점이
  //   거짓말을 한다. 미리보기 그림도 이 값으로 그린다(아래 drawSkillFx).
  //   ⚠ 반드시 무대 그리기보다 **먼저** 정의해야 한다 — drawSkillFx 가 첫 프레임에
  //     이걸 읽으므로, 아래에 두면 undefined 를 참조해 그 자리에서 터진다.
  var shown = this.src.shownSkill(o, this.char);
  var ownedP = this.src.skillOwned(ps.slot, ps.idx, this.char);

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
  // ── 실제 스킬을 미리 보여준다 (2026-08-01 사용자 지시) ────────────────────────
  //  "스킬 상점에서 스킬 미리보기도 **실제 그 스킬을** 미리보기하게끔 바꾸고."
  //
  //  예전엔 영웅의 **자세**만 반복 재생했다 — 돌진이든 광역이든 몸이 조금 다르게
  //  움직일 뿐이라 "이 스킬이 뭘 하는지"는 여전히 글로만 알 수 있었다.
  //  이제 그 스킬의 **실제 값**(반경·거리·부채꼴·투사체)을 무대 바닥에 그린다.
  //  ⚠ 값은 `shown`(가격 배수를 얹은 사본)에서 읽는다 — 전장에서 실제로 나갈 크기를
  //    보여줘야 미리보기가 거짓말을 안 한다.
  //  ⚠ 무대 폭에 맞춰 **비율로 줄인다.** 월드 좌표를 그대로 쓰면 반경 200 짜리가
  //    패널을 뚫고 나간다. 서로 다른 스킬의 크기 비교가 유지되도록 한 배율만 쓴다.
  var pvScale = Math.min(1, (rightW * 0.42) / 220);
  var fxCol = GAME.UI.IS_LIGHT ? 0xB01F35 : 0xef4444;
  function drawSkillFx(prog) {
    var d = shown;
    var rad = (d.radius || 0) * pvScale;
    var dist = (d.dist || 0) * pvScale;
    // 바닥 표시 — 이 스킬이 **어디에 닿는가**
    if (d.type === 'dash' && dist > 0) {
      sg.lineStyle(3, fxCol, 0.55);
      sg.lineBetween(scx, sfeet, scx, sfeet - dist);
      sg.fillStyle(fxCol, 0.30);
      sg.fillCircle(scx, sfeet - dist, Math.max(4, rad * 0.5));
    } else if (d.type === 'aoeSelf' && rad > 0) {
      sg.fillStyle(fxCol, 0.14 + 0.10 * Math.sin(prog * Math.PI));
      sg.fillEllipse(scx, sfeet, rad * 2, rad * 1.1);
      sg.lineStyle(2, fxCol, 0.6); sg.strokeEllipse(scx, sfeet, rad * 2, rad * 1.1);
    } else if (d.type === 'aoeTarget' && rad > 0) {
      var ty = sfeet - dist * 0.6 - rad * 1.2;
      sg.lineStyle(2, fxCol, 0.65); sg.strokeEllipse(scx, ty, rad * 2, rad * 1.1);
      sg.fillStyle(fxCol, 0.10 + 0.22 * prog);
      sg.fillEllipse(scx, ty, rad * 2 * prog, rad * 1.1 * prog);
    } else if (d.type === 'projectile') {
      var fly = sfeet - (sr * 5.5) * prog;
      sg.fillStyle(fxCol, 0.85);
      sg.fillCircle(scx, fly, Math.max(3, (d.projectileRadius || 6) * pvScale * 1.6));
    } else if (d.type === 'pull' && dist > 0) {
      // 부채꼴 — 각도를 그대로 보여준다
      var half = ((d.coneDeg || 90) / 2) * Math.PI / 180;
      sg.fillStyle(fxCol, 0.16);
      sg.beginPath(); sg.moveTo(scx, sfeet);
      for (var a = -half; a <= half; a += 0.08) {
        sg.lineTo(scx + Math.sin(a) * dist, sfeet - Math.cos(a) * dist * 0.55);
      }
      sg.closePath(); sg.fillPath();
    } else if (d.type === 'trap' && rad > 0) {
      sg.lineStyle(2, fxCol, 0.7);
      sg.strokeEllipse(scx, sfeet + sr * 0.6, rad * 2, rad * 1.0);
    } else if (d.type === 'aura' && (d.radius || 0) > 0) {
      var ar = rad * (0.9 + 0.1 * Math.sin(prog * Math.PI * 2));
      sg.lineStyle(3, fxCol, 0.5); sg.strokeEllipse(scx, sfeet, ar * 2, ar * 1.05);
    } else if (d.type === 'strike') {
      sg.fillStyle(fxCol, 0.55 * (1 - prog));
      sg.fillCircle(scx, sfeet - sr * 1.4, Math.max(6, sr * 0.9 * (0.4 + prog)));
    } else if (d.type === 'buff') {
      sg.lineStyle(3, fxCol, 0.35 + 0.35 * Math.sin(prog * Math.PI));
      sg.strokeEllipse(scx, sfeet, sr * 3.0, sr * 1.5);
    }
  }

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
    // 효과는 **몸 뒤에** 깔린다(먼저 그린다) — 위에 얹으면 캐릭터를 가린다.
    if (act) drawSkillFx(Math.min(1, t / dur));
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

  var desc = GAME.skillDesc ? GAME.skillDesc(shown) : '';
  this._body.push(GAME.UI.label(this, rightX + 14, descTop, desc || '',
    P ? 11 : 14, C.text, 0).setWordWrapWidth(rightW - 28).setLineSpacing(4));

  // ── **왜 이 숫자인지** 적는다 (2026-08-01 사용자 지시) ──────────────────────
  //  "스킬 표시에도 어떻게 반영되는지 보여주고."
  //  계수는 v0.96 부터 실제로 들어가 있었지만, 화면에는 **결과 숫자만** 떴다.
  //  그러면 무기를 바꿔도 "숫자가 바뀌었네" 까지만 알지 **무엇 때문에 바뀌었는지**
  //  모른다 — 성장과 스킬이 연결돼 있다는 것 자체가 안 읽힌다.
  //  그래서 계산식을 그대로 보여 준다: 기본 + 공격력 × 계수.
  (function () {
    if (!GAME.skillAtkCoef) return;
    var priced = GAME.skillPricedCopy ? GAME.skillPricedCopy(o) : o;
    var ac = GAME.skillAtkCoef(priced), dc = GAME.skillDefCoef(priced);
    if (!(ac > 0) && !(dc > 0)) return;
    var K = GAME.SKILL_COEF;
    var b = GAME.TowerChar.statBonus(self.char), ib = GAME.TowerChar.itemBonus(self.char);
    var line;
    if (ac > 0 && priced.damage > 0) {
      var atk = (self.hero.damage || 0) + (b.damage || 0) + (ib.damage || 0);
      var flat = Math.max(priced.damage * K.floorRatio, priced.damage - K.refAtk * ac);
      line = '기본 ' + Math.round(flat) + '  +  공격력 ' + GAME.UI.numAbbr(atk) +
             ' × ' + ac.toFixed(2) + '  =  ' + GAME.UI.numAbbr(shown.damage);
    } else if (ac > 0 && priced.dps > 0) {
      // 구역 스킬 — 초당 피해로 같은 식을 보여 준다(2026-08-02).
      var atk2 = (self.hero.damage || 0) + (b.damage || 0) + (ib.damage || 0);
      var fl3 = Math.max(priced.dps * K.floorRatio, priced.dps - K.refAtk * ac);
      line = '초당  기본 ' + Math.round(fl3) + '  +  공격력 ' + GAME.UI.numAbbr(atk2) +
             ' × ' + ac.toFixed(2) + '  =  ' + GAME.UI.numAbbr(shown.dps);
    } else {
      var arm = (self.hero.armor || 0) + (b.armor || 0) + (ib.armor || 0);
      var fl2 = Math.max(priced.shield * K.floorRatio, priced.shield - K.refArm * dc);
      line = '기본 ' + Math.round(fl2) + '  +  방어력 ' + GAME.UI.numAbbr(arm) +
             ' × ' + dc.toFixed(2) + '  =  ' + GAME.UI.numAbbr(shown.shield);
    }
    self._body.push(GAME.UI.label(self, rightX + 14, descTop + (P ? 20 : 26),
      line, P ? 10 : 12, C.accent, 0).setWordWrapWidth(rightW - 28));
    self._body.push(GAME.UI.label(self, rightX + 14, descTop + (P ? 38 : 50),
      '비싼 스킬일수록 내 능력치를 더 많이 탑니다', P ? 9 : 11, C.textDim, 0)
      .setWordWrapWidth(rightW - 28));
  })();
  var arenaMode = this.mode === 'arena';
  this._body.push(GAME.UI.label(this, rightX + 14, pTop + pH - (P ? 34 : 52),
    '쿨타임 ' + (shown.cooldown ? (Math.round(shown.cooldown / 100) / 10) + '초' : '—') +
    (arenaMode ? '' : (o.cost ? ('    ·    ' + o.cost + '골드') : '    ·    기본 내장(무료)')),
    P ? 11 : 13, C.textDim, 0));
  this._body.push(GAME.UI.label(this, rightX + 14, pTop + pH - (P ? 18 : 28),
    arenaMode ? '대전에서는 모든 스킬을 값 없이 고를 수 있습니다'
              : (ownedP ? '보유함 — 오른쪽 [장착] 으로 끼웁니다'
                        : '미보유 — 먼저 구매해야 장착할 수 있습니다'),
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
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var top = this._bodyTop;
  var PAD = GAME.CONFIG.SMALL ? 14 : 24;
  var P = GAME.CONFIG.PHONE;

  //  ── 뽑기 카드 재설계 (2026-08-22 태현님: "총 능력치는 위에 보여주고, 구매는
  //  직사각형 카드에 각 파트 어울리는 그림으로 뽑기하는 것처럼") ────────────────
  //  구성: 위 = 총 능력치 요약 한 줄(7종) / 아래 = 스탯마다 세로 카드 한 장
  //  (그림 + 이름 + 총합 + 🎲 가격). 카드의 🎲 를 누르는 것이 곧 뽑기다.
  var totalBonus = GAME.TowerChar.statBonus(this.char);
  var itemBonus = GAME.TowerChar.itemBonus(this.char);
  function totalOf(d) {
    if (d.key === 'luck') return GAME.TowerChar.luckLevel(self.char);
    return (totalBonus[d.key] || 0) + (itemBonus[d.key] || 0);
  }

  var DEFS = GAME.TowerChar.STAT_DEFS;
  var n = DEFS.length;
  var contW = W - PAD * 2;
  var leftX = PAD;

  //  ① 요약 줄 — 7칸 균등. "현재 내 몸"이 먼저 읽혀야 카드의 + 가 뜻을 가진다.
  var sumH = P ? 30 : 40;
  var sg = this.add.graphics();
  this._body.push(sg);
  sg.fillStyle(GAME.UI.COL.surfaceAlt, 1);
  sg.fillRoundedRect(leftX, top, contW, sumH, 8);
  sg.lineStyle(1, GAME.UI.COL.border, 1);
  sg.strokeRoundedRect(leftX, top, contW, sumH, 8);
  var sumCols = GAME.Layout.cols(n, { gap: 4, width: contW - 12, left: leftX + 6, pad: 0 });
  DEFS.forEach(function (d, i) {
    var cxm = sumCols[i].x + sumCols[i].w / 2;
    var tv = totalOf(d);
    var vTxt = d.key === 'atkspeed' ? tv + '%' : String(Math.round(tv * 10) / 10);
    var snm = GAME.UI.label(self, cxm, top + (P ? 2 : 4), d.name,
      P ? 9 : 11, C.textDim, 0.5).setOrigin(0.5, 0);
    self._body.push(snm);
    //  값은 이름의 **실측 높이** 아래에 — 고정 오프셋은 최대 수치(36700)에서 겹쳤다.
    self._body.push(GAME.UI.label(self, cxm, snm.y + snm.height + 1, vTxt,
      P ? 12 : 15, C.text, 0.5).setOrigin(0.5, 0));
  });

  //  ② 카드 줄 — 한 줄 7장. 폰 가로도 816/7 ≈ 112px 로 선다.
  var cardTop = top + sumH + (P ? 6 : 12);
  var cardH = Math.min(P ? 240 : 460, H - cardTop - (P ? 6 : 16));
  var cc = GAME.Layout.cols(n, { gap: P ? 6 : 10, width: contW, left: leftX, pad: 0 });

  //  스탯별 그림 — 벡터로 그린다(자산 0KB 원칙 + 파트 정체성).
  var ICON = {
    damage: function (g, x, y, r) {              // 돌검
      g.fillStyle(0xcfd6de, 1);
      g.fillTriangle(x, y - r, x - r * 0.28, y + r * 0.35, x + r * 0.28, y + r * 0.35);
      g.fillStyle(0x8a6b4a, 1);
      g.fillRect(x - r * 0.42, y + r * 0.35, r * 0.84, r * 0.16);
      g.fillRect(x - r * 0.09, y + r * 0.5, r * 0.18, r * 0.5);
    },
    hp: function (g, x, y, r) {                  // 계란 + 심장박동
      g.fillStyle(0xf4ecd8, 1);
      g.fillEllipse(x, y, r * 1.3, r * 1.7);
      g.lineStyle(Math.max(2, r * 0.14), 0xe8455f, 1);
      g.beginPath();
      g.moveTo(x - r * 0.6, y);
      g.lineTo(x - r * 0.2, y);
      g.lineTo(x - r * 0.05, y - r * 0.4);
      g.lineTo(x + r * 0.12, y + r * 0.4);
      g.lineTo(x + r * 0.25, y);
      g.lineTo(x + r * 0.6, y);
      g.strokePath();
    },
    armor: function (g, x, y, r) {               // 방패
      g.fillStyle(0x7d8894, 1);
      g.fillPoints([
        { x: x - r * 0.7, y: y - r * 0.75 }, { x: x + r * 0.7, y: y - r * 0.75 },
        { x: x + r * 0.62, y: y + r * 0.25 }, { x: x, y: y + r * 0.9 },
        { x: x - r * 0.62, y: y + r * 0.25 }
      ], true);
      g.fillStyle(0xb9c2cc, 1);
      g.fillCircle(x, y - r * 0.1, r * 0.22);
    },
    speed: function (g, x, y, r) {               // 질주 바람
      g.lineStyle(Math.max(2, r * 0.16), 0x76c7e0, 1);
      g.lineBetween(x - r * 0.8, y - r * 0.45, x + r * 0.5, y - r * 0.45);
      g.lineBetween(x - r * 0.55, y, x + r * 0.75, y);
      g.lineBetween(x - r * 0.8, y + r * 0.45, x + r * 0.4, y + r * 0.45);
      g.fillStyle(0x76c7e0, 1);
      g.fillTriangle(x + r * 0.5, y - r * 0.7, x + r * 0.95, y, x + r * 0.5, y + r * 0.7);
    },
    atkspeed: function (g, x, y, r) {            // 번개
      g.fillStyle(0xf0c33c, 1);
      g.fillPoints([
        { x: x + r * 0.25, y: y - r * 0.95 }, { x: x - r * 0.45, y: y + r * 0.1 },
        { x: x - r * 0.05, y: y + r * 0.1 }, { x: x - r * 0.25, y: y + r * 0.95 },
        { x: x + r * 0.5, y: y - r * 0.15 }, { x: x + r * 0.08, y: y - r * 0.15 }
      ], true);
    },
    crit: function (g, x, y, r) {                // 폭발 별
      g.fillStyle(0xe8455f, 1);
      for (var i = 0; i < 8; i++) {
        var a1 = (i / 8) * Math.PI * 2, a2 = a1 + Math.PI / 8;
        var ro = i % 2 ? r * 0.55 : r, ri2 = r * 0.3;
        g.fillTriangle(x, y,
          x + Math.cos(a1) * ro, y + Math.sin(a1) * ro,
          x + Math.cos(a2) * ri2, y + Math.sin(a2) * ri2);
      }
      g.fillStyle(0xffd35c, 1);
      g.fillCircle(x, y, r * 0.28);
    },
    luck: function (g, x, y, r) {                // 네잎클로버
      g.fillStyle(0x5da457, 1);
      g.fillEllipse(x - r * 0.32, y - r * 0.32, r * 0.62, r * 0.62);
      g.fillEllipse(x + r * 0.32, y - r * 0.32, r * 0.62, r * 0.62);
      g.fillEllipse(x - r * 0.32, y + r * 0.32, r * 0.62, r * 0.62);
      g.fillEllipse(x + r * 0.32, y + r * 0.32, r * 0.62, r * 0.62);
      g.lineStyle(Math.max(1.5, r * 0.1), 0x3e7a3a, 1);
      g.lineBetween(x, y + r * 0.2, x + r * 0.25, y + r * 0.95);
    }
  };

  DEFS.forEach(function (d, i) {
    var cx0 = cc[i].x, cw = cc[i].w;
    var lv = self.char.stats[d.key] || 0;
    var cost = GAME.TowerChar.costOf(d.key, lv);
    var can = self.char.gold >= cost;
    var total = totalOf(d);

    var g = self.add.graphics();
    self._body.push(g);
    g.fillStyle(GAME.UI.COL.surfaceAlt, 1);
    g.fillRoundedRect(cx0, cardTop, cw, cardH, 10);
    g.lineStyle(can ? 2 : 1, can ? C.controller : GAME.UI.COL.border, 1);
    g.strokeRoundedRect(cx0, cardTop, cw, cardH, 10);

    //  그림 — 카드 상단. 파트의 얼굴이다. A-2 아이콘 시트(2026-08-22 이식)가
    //  있으면 그걸 쓰고, 없으면(로드 전) 벡터 폴백. 치명타만 시트에 없어 벡터다.
    var icR = Math.min(cw * 0.26, P ? 20 : 34);
    var icY = cardTop + (P ? 30 : 56);
    var IMG_ICON = { damage: 'iconAtk', hp: 'iconHp', armor: 'iconArmor',
                     speed: 'iconSpeed', atkspeed: 'iconFfwd', luck: 'iconLuck' };
    var icImg = IMG_ICON[d.key];
    if (!(icImg && GAME.GearBank &&
          GAME.GearBank.place(g, icImg, cx0 + cw / 2, icY, icR * 2.5, icR * 2.5, 1))) {
      if (ICON[d.key]) ICON[d.key](g, cx0 + cw / 2, icY, icR);
    }

    //  이름 + 현재 총합
    var nmY = icY + icR + (P ? 8 : 16);
    var cnm = GAME.UI.label(self, cx0 + cw / 2, nmY, d.name,
      P ? 11 : 14, C.textDim, 0.5).setOrigin(0.5, 0);
    self._body.push(cnm);
    var tvTxt = d.key === 'atkspeed' ? total + '%' : String(Math.round(total * 10) / 10);
    //  값·설명은 이름의 **실측 높이**에서 이어 내린다 — 고정 오프셋은 겹침 감사가 잡았다.
    var tvLbl = GAME.UI.label(self, cx0 + cw / 2, cnm.y + cnm.height + 2, tvTxt,
      P ? 16 : 24, C.text, 0.5).setOrigin(0.5, 0);
    self._body.push(tvLbl);

    //  설명 한 줄 — 치명타는 실효값(확률·배수)을 그 자리에서 계산해 보여준다.
    var smallTxt;
    if (d.key === 'crit') {
      var ce = GAME.TowerChar.critOf(total);
      smallTxt = ce.chance + '%' + (ce.chance >= 50 ? '(최대)' : '') + ' ×' + ce.mul;
    } else if (d.key === 'atkspeed') {
      smallTxt = '간격 -' + Math.round((1 - 1 / (1 + total / 100)) * 100) + '%';
    } else if (d.key === 'luck') {
      smallTxt = P ? '골드·드랍↑' : '골드 +2%·드랍 +2.5%/Lv';
    } else {
      var rl = Math.max(1, Math.round(d.add * 0.6)), rh = Math.round(d.add * 1.4);
      smallTxt = '+' + rl + '~+' + rh;
    }
    self._body.push(GAME.UI.label(self, cx0 + cw / 2, tvLbl.y + tvLbl.height + 2, smallTxt,
      P ? 9 : 11, C.textDim, 0.5).setOrigin(0.5, 0).setWordWrapWidth(cw - 8).setAlign('center'));

    //  🎲 뽑기 버튼 — 카드 바닥. 결과 배지는 카드 위(그림 자리)에 튄다.
    var canSell = GAME.TowerChar.canSellStat && GAME.TowerChar.canSellStat(d.key);
    var bh = P ? 30 : 44;
    var by2 = cardTop + cardH - 10 - bh / 2 - (canSell ? (P ? 24 : 30) : 0);
    var b = GAME.UI.button(self, cx0 + cw / 2, by2, cw - 12, bh,
      '🎲 ' + cost, function () {
        var res = GAME.TowerChar.levelUp(d.key);
        if (!res) return;
        self._lastRoll = { key: d.key, gain: res.gain, at: Date.now() };
        self._buildBody(true);
      }, { fontSize: P ? 12 : 15 });
    b.text.setColor(can ? C.accent : C.textDim);
    b.rect.setStrokeStyle(can ? 2 : 1, can ? C.controller : GAME.UI.COL.borderUi);
    self._body.push(b);

    //  이동속도 되팔기 — 이 스탯만(빠르면 조준이 흔들린다 — 2026-08-03 결정 유지).
    if (canSell) {
      var back = GAME.TowerChar.sellStatBack(d.key);
      var sb = GAME.UI.button(self, cx0 + cw / 2, cardTop + cardH - 10 - (P ? 11 : 14),
        cw - 12, P ? 20 : 26, '↩ ' + back, function () {
          if (!GAME.TowerChar.levelDown(d.key)) return;
          self._buildBody(true);
        }, { fontSize: P ? 10 : 12 });
      sb.text.setColor(C.textDim);
      sb.rect.setStrokeStyle(1, GAME.UI.COL.borderUi);
      self._body.push(sb);
    }

    //  방금 굴린 카드에는 결과 배지 — 등급색으로 3초.
    if (self._lastRoll && self._lastRoll.key === d.key && Date.now() - self._lastRoll.at < 3000) {
      var gr = GAME.TowerChar.gradeOf(d.key, self._lastRoll.gain);
      var bg = self.add.graphics().setDepth(30);
      self._body.push(bg);
      var badgeW = cw - 8, badgeH = P ? 30 : 40;
      var bx = cx0 + 4, byB = icY - badgeH / 2;
      bg.fillStyle(gr.color, 1);
      bg.fillRoundedRect(bx, byB, badgeW, badgeH, 8);
      var lbl = GAME.UI.label(self, bx + badgeW / 2, byB + badgeH / 2,
        gr.name + '! +' + self._lastRoll.gain,
        P ? 11 : 14, '#ffffff', 0.5).setOrigin(0.5).setDepth(31);
      self._body.push(lbl);
      self.tweens.add({ targets: [lbl], scale: { from: 1.4, to: 1 }, duration: 300, ease: 'Back.easeOut' });
      self.tweens.add({ targets: [lbl, bg], alpha: 0, delay: 2200, duration: 700 });
    }
  });
};
