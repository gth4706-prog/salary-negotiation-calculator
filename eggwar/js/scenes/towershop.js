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

GAME.TowerShopScene.prototype._buildBody = function () {
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

  // 좁은 화면(폰 가로)일수록 장비 박스가 2줄로 접힐 이름이 많다 — 무대 비중을 줄여
  // 박스에 세로 여유를 더 준다(실측: 55% 그대로면 이름이 박스 위 슬롯명과 겹쳤다).
  var stageH = h * (GAME.CONFIG.SMALL ? 0.42 : 0.55);
  var r = Math.min(w * 0.28, stageH * 0.42);
  var cx = x + w / 2, feetY = y + stageH * 0.78;
  var t0 = this.time.now;
  this._previewG = this.add.graphics();
  this._body.push(this._previewG);
  var pg = this._previewG;
  var hero = this.hero;
  function redraw() {
    if (!pg || !pg.scene) return;
    pg.clear();
    GAME.UI.drawUnitFlat(pg, hero, cx, feetY, C.controller, 1,
      r / (hero.radius || 17), Math.PI / 2, null, self.time.now);
  }
  redraw();
  this._previewTimer = this.time.addEvent({ delay: 45, loop: true, callback: redraw });
  this.events.once('shutdown', function () {
    if (self._previewTimer) self._previewTimer.remove(false);
  });

  this._body.push(GAME.UI.label(this, cx, y + 8, hero.name + '  (' + hero.trait + ')',
    GAME.CONFIG.SMALL ? 15 : 17, C.text, 0.5).setOrigin(0.5, 0));

  // 장비 슬롯 박스 4칸 — 아이콘 대신 이름을 넣는다(신규 확장 카탈로그는 아직 아이콘이 없다).
  var slots = GAME.TowerShopItems.SLOTS;
  var boxTop = y + stageH + 10;
  var boxH = h - stageH - 20;
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
    var nameFs = GAME.CONFIG.SMALL ? 11 : 13;
    self._body.push(GAME.UI.label(self, bx + bw2 / 2, boxTop + 3, s.name,
      slotFs, C.textDim, 0.5).setOrigin(0.5, 0));
    // ⚠ 이름 줄은 **슬롯명 아래에서부터 자라게** 한다(origin y=0, 중앙 고정이 아니다).
    //   긴 이름이 2줄로 접히면 중앙 고정은 위로도 자라 슬롯명과 겹친다(실측으로 잡음).
    self._body.push(GAME.UI.label(self, bx + bw2 / 2, boxTop + slotFs + 11,
      it ? it.name : '—', nameFs, it ? C.accent : C.textFaint, 0.5)
      .setOrigin(0.5, 0).setWordWrapWidth(bw2 - 6).setAlign('center').setLineSpacing(1));
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
  rows.forEach(function (r, i) {
    var ry = y + i * (rowH + gap);
    self._body.push(GAME.UI.label(self, x, ry, r[0], fs, C.textDim, 0));
    var m = GAME.UI.meter(self, x + 76, ry + 1, w - 76, rowH - 2, {
      color: C.controller, frac: 1,
      label: { size: fs, color: C.text, align: 'center' }
    });
    m.setText('+' + Math.round(r[1] * 10) / 10);
    self._body.push({ destroy: function () { m.destroy(); } });
  });
};

// ── 아이템 탭 ────────────────────────────────────────────────────────────
GAME.TowerShopScene.prototype._buildItemTab = function () {
  var C = GAME.CONFIG.COLORS;
  var self = this;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var top = this._bodyTop;
  var PAD = GAME.CONFIG.SMALL ? 14 : 24;
  var rightW = Math.min(W * 0.34, 280);
  var leftW = W - PAD * 3 - rightW;
  var leftX = PAD;

  // ⚠ 능력치 바가 먼저 차지할 높이를 실제로 계산한 뒤(statBarsHeight), 그 위 공간을
  // 캐릭터 패널에 준다 — 예전엔 "바닥에서 몇 px" 매직넘버였고 그 값이 실제 바 높이보다
  // 작아서 폰 가로(844×390)에서 마지막 줄("행운")이 화면 밖으로 잘렸다(실측으로 잡음).
  var statH = this.statBarsHeight();
  var statY = H - 10 - statH;
  this._drawCharPanel(W - PAD - rightW, top, rightW, statY - top - 10);
  this._drawStatBars(leftX, statY, leftW);

  var slots = GAME.TowerShopItems.SLOTS;
  var rowH = GAME.CONFIG.PHONE ? 42 : Math.max(GAME.UI.BTN_H_SM || 52, 56);
  var gap = GAME.CONFIG.PHONE ? 6 : 10;
  var rowFs = GAME.CONFIG.PHONE ? 13 : (GAME.CONFIG.SMALL ? 14 : 15);
  slots.forEach(function (s, i) {
    var ry = top + i * (rowH + gap);
    var cur = self.char.items[s.key] ? GAME.TowerShopItems.find(s.key, self.char.items[s.key]) : null;
    var g = self.add.graphics();
    self._body.push(g);
    g.fillStyle(GAME.UI.COL.surfaceAlt, 1);
    g.fillRoundedRect(leftX, ry, leftW, rowH, 10);
    g.lineStyle(1, GAME.UI.COL.border, 1);
    g.strokeRoundedRect(leftX, ry, leftW, rowH, 10);
    self._body.push(GAME.UI.label(self, leftX + 14, ry + (GAME.CONFIG.PHONE ? 4 : 8),
      s.name + '  ' + (cur ? cur.name : '(없음)'), rowFs, C.text, 0));
    if (!GAME.CONFIG.PHONE) {
      self._body.push(GAME.UI.label(self, leftX + 14, ry + rowH - 24,
        cur ? cur.note : '장착된 것이 없습니다', 12, C.textDim, 0).setWordWrapWidth(leftW - 200));
    }

    var bc = GAME.Layout.cols(cur ? 2 : 1, { gap: 8, width: 190, left: leftX + leftW - 198, pad: 0 });
    var buyBtn = GAME.UI.button(self, bc[0].cx, ry + rowH / 2, bc[0].w, rowH - (GAME.CONFIG.PHONE ? 8 : 12),
      cur ? '교체' : '구매', function () { self._openBuyList(s.key); }, { fontSize: 14 });
    self._body.push(buyBtn);
    if (cur) {
      var sellBtn = GAME.UI.button(self, bc[1].cx, ry + rowH / 2, bc[1].w, rowH - (GAME.CONFIG.PHONE ? 8 : 12),
        '판매 (' + Math.floor(cur.cost * GAME.TowerChar.SELL_RATE) + ')', function () {
          GAME.TowerChar.sellItem(s.key);
          self._buildBody();
        }, { fontSize: 13 });
      self._body.push(sellBtn);
    }
  });
};

GAME.TowerShopScene.prototype._openBuyList = function (slotKey) {
  var self = this;
  var list = GAME.TowerShopItems.CATALOG[slotKey] || [];
  var cur = this.char.items[slotKey] ? GAME.TowerShopItems.find(slotKey, this.char.items[slotKey]) : null;
  var credit = cur ? Math.floor(cur.cost * GAME.TowerChar.SELL_RATE) : 0;
  var items = list.map(function (it) {
    var price = Math.max(0, it.cost - credit);
    var selected = cur && cur.key === it.key;
    return {
      key: it.key, name: it.name + (selected ? '  (장착 중)' : ''),
      note: it.note, cost: selected ? null : price,
      disabled: selected || price > self.char.gold
    };
  });
  GAME.Modal.open(this, {
    title: (GAME.TowerShopItems.SLOTS.filter(function (s) { return s.key === slotKey; })[0] || {}).name + ' 구매',
    items: items,
    onPick: function (it) {
      if (!it || !it.key) return;
      GAME.TowerChar.buyItem(slotKey, it.key);
      self._buildBody();
    }
  });
};

// ── 스킬 탭 ──────────────────────────────────────────────────────────────
GAME.TowerShopScene.prototype._buildSkillTab = function () {
  var C = GAME.CONFIG.COLORS;
  var self = this;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var top = this._bodyTop;
  var PAD = GAME.CONFIG.SMALL ? 14 : 24;
  var rightW = Math.min(W * 0.36, 300);
  var leftW = W - PAD * 3 - rightW;
  var rightX = W - PAD - rightW;

  var slotList = GAME.SKILL_SLOTS;
  var perSlot = this.hero.skillOptions.Q.length;
  // ⚠ 폰 가로(844×390)는 4슬롯을 세로로 쌓을 높이가 없다(실측: 15건 화면 밖으로 잘림).
  //   2×2 격자로 접는다 — 세로(PORTRAIT, 900px)는 여유가 있어 그대로 세로 1열을 쓴다.
  var cols = GAME.CONFIG.PHONE ? 2 : 1;
  var rowH = GAME.CONFIG.PHONE ? 20 : 34;
  var slotGap = GAME.CONFIG.PHONE ? 6 : 10;
  var slotH = perSlot * rowH + (GAME.CONFIG.PHONE ? 16 : 22);
  var slotFs = GAME.CONFIG.PHONE ? 11 : 13;
  var optFs = GAME.CONFIG.PHONE ? 10 : 12;
  var cellW = cols > 1 ? (leftW - slotGap * (cols - 1)) / cols : leftW;

  slotList.forEach(function (slot, si) {
    var opts = self.hero.skillOptions[slot];
    var col = si % cols, row = Math.floor(si / cols);
    var sLeft = PAD + col * (cellW + slotGap);
    var sTop = top + row * (slotH + slotGap);
    var g = self.add.graphics();
    self._body.push(g);
    g.fillStyle(GAME.UI.COL.surfaceAlt, 1);
    g.fillRoundedRect(sLeft, sTop, cellW, slotH, 10);
    g.lineStyle(1, GAME.UI.COL.border, 1);
    g.strokeRoundedRect(sLeft, sTop, cellW, slotH, 10);
    var slotLabel = GAME.SKILL_SLOT_LABEL[slot] ? (slot + ' · ' + GAME.SKILL_SLOT_LABEL[slot]) : slot;
    self._body.push(GAME.UI.label(self, sLeft + 10, sTop + 3, slotLabel, slotFs, C.accent, 0));

    opts.forEach(function (o, idx) {
      var ry = sTop + (GAME.CONFIG.PHONE ? 16 : 20) + idx * rowH;
      var owned = GAME.TowerChar.ownsSkill(slot, idx, self.char);
      var equipped = self.char.picks[slot] === idx;
      var priceW = GAME.CONFIG.PHONE ? 40 : 70;
      var rowRect = self.add.rectangle(sLeft + cellW / 2, ry + rowH / 2 - 1, cellW - 10, rowH - 3,
        equipped ? GAME.UI.COL.panelTeal : GAME.UI.COL.bg)
        .setStrokeStyle(1, equipped ? C.controller : GAME.UI.COL.border);
      self._body.push(rowRect);
      rowRect.setInteractive({ useHandCursor: true }).on('pointerdown', function () {
        self.previewSkill = { slot: slot, idx: idx };
        self._refreshSkillPreview();
      });
      var label = (owned ? o.name : (o.name + ' 🔒')) + (equipped ? ' ✓' : '');
      self._body.push(GAME.UI.label(self, sLeft + 8, ry + rowH / 2 - optFs / 2 - 1, label,
        optFs, owned ? C.text : C.textDim, 0).setWordWrapWidth(cellW - priceW - 20));
      if (!owned) {
        var buyBtn = GAME.UI.button(self, sLeft + cellW - priceW / 2 - 6, ry + rowH / 2 - 1,
          priceW, rowH - 6, (o.cost || 0) + 'G', function () {
            if (GAME.TowerChar.buySkill(slot, idx)) self._buildBody();
          }, { fontSize: GAME.CONFIG.PHONE ? 10 : 12 });
        self._body.push(buyBtn);
      }
    });
  });

  // 우측 미리보기 — 애니메이션 무대 대신 글로 된 설명(범위 축소, 파일 상단 주석 참조).
  var pg = this.add.graphics();
  this._body.push(pg);
  var pTop = top, pH = H - top - 20;
  pg.fillStyle(GAME.UI.COL.surfaceAlt, 1);
  pg.fillRoundedRect(rightX, pTop, rightW, pH, 12);
  pg.lineStyle(1, GAME.UI.COL.border, 1);
  pg.strokeRoundedRect(rightX, pTop, rightW, pH, 12);
  this._previewTitle = GAME.UI.label(this, rightX + 14, pTop + 12, '', 17, C.accent, 0)
    .setWordWrapWidth(rightW - 28);
  this._previewBody = GAME.UI.label(this, rightX + 14, pTop + 44, '', 13, C.textDim, 0)
    .setWordWrapWidth(rightW - 28).setLineSpacing(4);
  this._previewOwned = GAME.UI.label(this, rightX + 14, pTop + pH - 30, '', 13, C.accentAlt, 0);
  this._body.push(this._previewTitle, this._previewBody, this._previewOwned);

  if (!this.previewSkill) this.previewSkill = { slot: 'Q', idx: this.char.picks.Q };
  this._refreshSkillPreview();
};

GAME.TowerShopScene.prototype._refreshSkillPreview = function () {
  if (!this._previewTitle || !this._previewTitle.scene) return;
  var ps = this.previewSkill;
  var o = this.hero.skillOptions[ps.slot][ps.idx];
  var typeLabel = GAME.SKILL_TYPE_LABEL[o.type] || o.type;
  this._previewTitle.setText(o.name + '  (' + ps.slot + ' · ' + typeLabel + ')');
  var desc = GAME.skillDesc ? GAME.skillDesc(o) : '';
  this._previewBody.setText((desc || '') +
    '\n\n쿨타임 ' + (o.cooldown ? (o.cooldown / 1000) + '초' : '—') +
    (o.cost ? ('\n가격 ' + o.cost + '골드') : '\n기본 내장(무료)'));
  var owned = GAME.TowerChar.ownsSkill(ps.slot, ps.idx, this.char);
  this._previewOwned.setText(owned ? '보유함 — 능력치 탭에서 장착할 수 있습니다'
                                    : '미보유 — 장착하려면 먼저 구매하세요');
  this._previewOwned.setColor(owned ? GAME.CONFIG.COLORS.accent : GAME.CONFIG.COLORS.textDim);
};

// ── 능력치 탭 ────────────────────────────────────────────────────────────
GAME.TowerShopScene.prototype._buildStatsTab = function () {
  var C = GAME.CONFIG.COLORS;
  var self = this;
  var W = GAME.CONFIG.WIDTH;
  var top = this._bodyTop;
  var PAD = GAME.CONFIG.SMALL ? 14 : 24;
  var colW = Math.min((W - PAD * 3) / 2, 420);
  var leftX = PAD, rightX = W - PAD - colW;

  // 좌: 스탯 5종 레벨업 (폰 가로는 5줄이 390px 에 못 들어가 행 높이를 줄인다 — 실측으로 잡음)
  var rowH = GAME.CONFIG.PHONE ? 44 : Math.max(GAME.UI.BTN_H_SM || 52, 56);
  var gap = GAME.CONFIG.PHONE ? 4 : 8;
  var statFs = GAME.CONFIG.PHONE ? 12 : 14;
  GAME.TowerChar.STAT_DEFS.forEach(function (d, i) {
    var ry = top + i * (rowH + gap);
    var lv = self.char.stats[d.key] || 0;
    var maxed = lv >= d.max;
    var cost = GAME.TowerChar.costOf(d.key, lv);
    var can = !maxed && self.char.gold >= cost;
    var b = GAME.UI.button(self, leftX + colW / 2, ry + rowH / 2, colW, rowH, '', function () {
      if (GAME.TowerChar.levelUp(d.key)) self._buildBody();
    }, { fontSize: statFs });
    b.text.setText(d.name + '  Lv.' + lv + (maxed ? ' (최대)' : '') +
      '\n' + (maxed ? ('+' + d.add * lv) : ('+' + d.add * lv + '  →  ' + cost + '골드')));
    b.text.setAlign('center');
    b.text.setColor(can ? C.accent : C.textDim);
    b.rect.setStrokeStyle(can ? 2 : 1, can ? C.controller : GAME.UI.COL.borderUi);
    self._body.push(b);
  });

  // 우: 슬롯별 장착 스킬 변경(보유한 것 중에서만, 무료)
  self._body.push(GAME.UI.label(self, rightX, top, '스킬 장착', GAME.CONFIG.PHONE ? 14 : 16, C.text, 0));
  var srowH = GAME.CONFIG.PHONE ? 44 : 60, sgap = GAME.CONFIG.PHONE ? 4 : 10;
  var stopOff = GAME.CONFIG.PHONE ? 22 : 30;
  GAME.SKILL_SLOTS.forEach(function (slot, i) {
    var ry = top + stopOff + i * (srowH + sgap);
    var idx = self.char.picks[slot];
    var sk = self.hero.skillOptions[slot][idx];
    var g = self.add.graphics();
    self._body.push(g);
    g.fillStyle(GAME.UI.COL.surfaceAlt, 1);
    g.fillRoundedRect(rightX, ry, colW, srowH, 10);
    g.lineStyle(1, GAME.UI.COL.border, 1);
    g.strokeRoundedRect(rightX, ry, colW, srowH, 10);
    self._body.push(GAME.UI.label(self, rightX + 12, ry + (GAME.CONFIG.PHONE ? 4 : 8),
      slot + '  ' + sk.name, GAME.CONFIG.PHONE ? 12 : 14, C.text, 0).setWordWrapWidth(colW - 110));
    var owned = self.char.ownedSkills[slot] || [0];
    var changeBtn = GAME.UI.button(self, rightX + colW - 60, ry + srowH / 2, 100,
      srowH - (GAME.CONFIG.PHONE ? 8 : 16), '변경', function () {
        var items = self.hero.skillOptions[slot].map(function (o, oi) {
          return {
            key: String(oi), name: o.name + (oi === idx ? '  (장착 중)' : ''),
            note: owned.indexOf(oi) >= 0 ? '보유함' : '미보유 — 상점에서 구매하세요',
            disabled: oi === idx || owned.indexOf(oi) < 0
          };
        });
        GAME.Modal.open(self, {
          title: slot + ' 슬롯 스킬 장착',
          items: items,
          onPick: function (it) {
            if (!it) return;
            GAME.TowerChar.equipSkill(slot, parseInt(it.key, 10));
            self._buildBody();
          }
        });
      }, { fontSize: 13 });
    self._body.push(changeBtn);
  });
};
