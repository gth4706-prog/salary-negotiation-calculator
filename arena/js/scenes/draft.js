window.GAME = window.GAME || {};

// 컨트롤러 — 영웅 1기를 고르고, 남은 예산으로 아이템을 산다.
// 예산은 상대 배치도와 동일하다.
GAME.DraftScene = function () {
  Phaser.Scene.call(this, { key: 'Draft' });
};
GAME.DraftScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.DraftScene.prototype.constructor = GAME.DraftScene;

GAME.DraftScene.prototype.init = function (data) {
  this.formation = GAME.Formations.getById(data.formationId);
  this.budget = GAME.Formations.budgetOf(this.formation);
  this.heroKey = 'vanguard';
  this.items = { weapon: null, armor: null, boots: null, potion: null };
  var Z = GAME.CONFIG.ZONE_CONTROLLER;
  this.startPos = { x: Z.x + Z.w / 2, y: Z.y + Z.h * 0.55 };
};

GAME.DraftScene.prototype.create = function () {
  var C = GAME.CONFIG.COLORS;
  var self = this;
  var P = GAME.CONFIG.PORTRAIT;
  var W = GAME.CONFIG.WIDTH;
  var L = GAME.Layout;
  var hud = L.hud();

  this.cameras.main.setBackgroundColor(C.bg);
  this.g = this.add.graphics();

  GAME.UI.label(this, hud.pad, 16,
    '상대 진형 — ' + this.formation.name + (this.formation.isAI ? ' (AI)' : ' (사람)'),
    P ? 12 : 15, C.accentAlt, 0);
  GAME.UI.label(this, hud.pad, 34, GAME.UI.winRateText(this.formation.id), P ? 11 : 13, C.warn, 0);
  GAME.UI.label(this, hud.pad, GAME.Iso.toScreenY(GAME.CONFIG.ZONE_CONTROLLER.y) - 20,
    '내 시작 위치 (아래 구역을 탭해 이동)', P ? 12 : 15, C.accent, 0);

  // 세로는 폭이 좁아 분류당 1행(4행), 가로는 폭이 넓어 2분류씩 묶어 2행으로 쓴다.
  // 그래야 하단 액션 버튼이 화면 밖으로 밀리지 않는다.
  var catsPerRow = P ? 1 : 2;
  var itemRowCount = GAME.ITEM_SLOTS.length / catsPerRow;
  var itemRowH = P ? 34 : 40;
  var specs = [
    { name: 'info', h: 22, gap: 4 },
    { name: 'warn', h: 18, gap: 8 },
    { name: 'heroes', h: P ? 74 : 84, gap: 10 }
  ];
  for (var ri = 0; ri < itemRowCount; ri++) {
    specs.push({ name: 'it' + ri, h: itemRowH, gap: (ri === itemRowCount - 1) ? 8 : 5 });
  }
  specs.push({ name: 'note', h: P ? 28 : 24, gap: 8 });
  specs.push({ name: 'act', h: P ? 44 : 48, gap: 0 });
  var rows = L.rows(specs);

  this.budgetText = GAME.UI.label(this, hud.pad, rows.info.y, '', P ? 14 : 17, C.text, 0);
  this.warnText = GAME.UI.label(this, hud.pad, rows.warn.y, '', P ? 12 : 14, C.warn, 0);

  // 영웅 카드 3장
  this.heroCards = [];
  var hcols = L.cols(3, { gap: 8 });
  for (var i = 0; i < GAME.HERO_ORDER.length; i++) {
    (function (key, idx) {
      var h = GAME.HEROES[key], c = hcols[idx];
      var rect = self.add.rectangle(c.cx, rows.heroes.cy, c.w, rows.heroes.h, 0x22222f)
        .setStrokeStyle(1, 0x3a3a52);
      rect.setInteractive({ useHandCursor: true });
      rect.on('pointerdown', function () { self.heroKey = key; self._trim(); self.redraw(); });
      GAME.UI.label(self, c.cx, rows.heroes.y + 8, h.name, P ? 15 : 17, C.text, 0.5).setOrigin(0.5, 0);
      GAME.UI.label(self, c.cx, rows.heroes.y + (P ? 28 : 32), h.trait, P ? 11 : 12, C.textDim, 0.5).setOrigin(0.5, 0);
      GAME.UI.label(self, c.cx, rows.heroes.bottom - 18, '비용 ' + h.cost, P ? 12 : 13, C.accent, 0.5).setOrigin(0.5, 0);
      self.heroCards.push({ key: key, rect: rect, cx: c.cx, cy: rows.heroes.cy, y: rows.heroes.y });
    })(GAME.HERO_ORDER[i], i);
  }

  // 아이템 — 분류 라벨(고정폭) + 옵션 3개
  var labelW = P ? 50 : 58;
  var groupW = Math.floor((W - hud.pad * 2 - (catsPerRow - 1) * 18) / catsPerRow);
  this.itemCells = [];
  for (var s = 0; s < GAME.ITEM_SLOTS.length; s++) {
    (function (slot, idx) {
      var rowIdx = Math.floor(idx / catsPerRow);
      var colIdx = idx % catsPerRow;
      var rw = rows['it' + rowIdx];
      var gx = hud.pad + colIdx * (groupW + 18);
      GAME.UI.label(self, gx, rw.cy, slot.name, P ? 12 : 14, C.textDim, 0).setOrigin(0, 0.5);

      var icols = L.cols(3, { gap: 6, left: gx + labelW, width: groupW - labelW, pad: 0 });
      var list = GAME.ITEMS[slot.key];
      for (var k = 0; k < list.length; k++) {
        (function (item, ci) {
          var c = icols[ci];
          var rect = self.add.rectangle(c.cx, rw.cy, c.w, rw.h, 0x22222f).setStrokeStyle(1, 0x3a3a52);
          rect.setInteractive({ useHandCursor: true });
          rect.on('pointerover', function () { self.hoverItem = item; self.redraw(); });
          rect.on('pointerout', function () { if (self.hoverItem === item) self.hoverItem = null; self.redraw(); });
          rect.on('pointerdown', function () { self.hoverItem = item; self._toggleItem(slot.key, item); });
          GAME.UI.label(self, c.cx, rw.cy, item.name + ' ' + item.cost, P ? 11 : 12, C.text, 0.5)
            .setOrigin(0.5).setWordWrapWidth(c.w - 4);
          self.itemCells.push({ slot: slot.key, item: item, rect: rect });
        })(list[k], k);
      }
    })(GAME.ITEM_SLOTS[s], s);
  }

  this.noteText = GAME.UI.label(this, hud.pad, rows.note.y, '', P ? 11 : 13, C.textDim, 0)
    .setWordWrapWidth(W - hud.pad * 2);

  var acols = L.cols(2, { gap: 10 });
  GAME.UI.button(this, acols[0].cx, rows.act.cy, acols[0].w, rows.act.h, '전투 시작', function () {
    self._start();
  }, { fill: 0x1c3a34, line: 0x35d0a5, hover: 0x235045, color: C.accent, fontSize: P ? 17 : 20 });
  GAME.UI.button(this, acols[1].cx, rows.act.cy, acols[1].w, rows.act.h, '← 진형 선택', function () {
    self.scene.start('Select');
  }, { fontSize: P ? 13 : 15 });

  this.input.on('pointerdown', function (p) {
    if (p.y > GAME.Iso.screenRect().bottom) return;
    var w = GAME.Iso.toWorld(p.x, p.y);
    if (GAME.UI.inZone(GAME.CONFIG.ZONE_CONTROLLER, w.x, w.y)) {
      self.startPos = { x: Math.round(w.x), y: Math.round(w.y) };
      self.redraw();
    }
  });

  this.input.mouse.disableContextMenu();
  this.redraw();
};

GAME.DraftScene.prototype.spent = function () {
  return GAME.HEROES[this.heroKey].cost + GAME.Items.totalCost(this.items);
};

GAME.DraftScene.prototype._toggleItem = function (slotKey, item) {
  if (this.items[slotKey] === item.key) {
    this.items[slotKey] = null;
  } else {
    var prev = this.items[slotKey];
    this.items[slotKey] = item.key;
    if (this.spent() > this.budget) {
      this.items[slotKey] = prev;
      this.warnText.setText('예산이 부족합니다.');
      this.redraw();
      return;
    }
  }
  this.warnText.setText('');
  this.redraw();
};

GAME.DraftScene.prototype._trim = function () {
  var order = ['potion', 'boots', 'armor', 'weapon'];
  var guard = 0;
  while (this.spent() > this.budget && guard++ < 10) {
    var dropped = false;
    for (var i = 0; i < order.length; i++) {
      if (this.items[order[i]]) { this.items[order[i]] = null; dropped = true; break; }
    }
    if (!dropped) break;
  }
};

GAME.DraftScene.prototype._start = function () {
  if (this.spent() > this.budget) {
    this.warnText.setText('예산을 초과했습니다.');
    return;
  }
  this.scene.start('Battle', {
    formationId: this.formation.id,
    heroKey: this.heroKey,
    items: this.items,
    startPos: this.startPos
  });
};

GAME.DraftScene.prototype.redraw = function () {
  var C = GAME.CONFIG.COLORS;
  var g = this.g;
  var i;
  g.clear();

  GAME.UI.drawArena(g, { zones: true });

  var Z = GAME.CONFIG.ZONE_CONTROLLER;
  g.lineStyle(2, C.controller, 0.8);
  g.strokeRect(Z.x + 2, GAME.Iso.toScreenY(Z.y) + 2, Z.w - 4, Z.h * GAME.Iso.TILT - 4);

  // 상대 진형 (정규화 → 현재 아레나 좌표, 깊이 정렬)
  var enemies = this.formation.units.map(function (u) {
    var w = GAME.Formations.toWorld(u);
    return { type: u.type, x: w.x, y: w.y };
  }).sort(function (a, b) { return a.y - b.y; });

  for (i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    var edef = GAME.UNITS[e.type];
    if (!edef) continue;
    if (edef.healRadius) { g.lineStyle(1.5, 0x7ef0a0, 0.28); GAME.UI.groundCircle(g, e.x, e.y, edef.healRadius); }
    if (edef.buffRadius) { g.lineStyle(1.5, 0xffd166, 0.28); GAME.UI.groundCircle(g, e.x, e.y, edef.buffRadius); }
    if (edef.isMine) { g.lineStyle(1.5, 0xef4444, 0.5); GAME.UI.groundCircle(g, e.x, e.y, edef.triggerRadius); }
    GAME.UI.drawUnit(g, edef, e.x, e.y, C.strategist, 0.85, Math.PI / 2);
    if (!GAME.isNonTarget(edef)) {
      g.lineStyle(2, 0xf0a86a, 0.9);
      GAME.UI.groundCircle(g, e.x, e.y, edef.radius + 7);
    }
  }

  // 내 영웅 미리보기
  var hero = GAME.HEROES[this.heroKey];
  var st = GAME.Items.applyTo(hero, this.items);
  GAME.UI.drawUnit(g, { radius: hero.radius, shape: hero.shape, weapon: null },
    this.startPos.x, this.startPos.y, C.controller, 1, -Math.PI / 2);
  g.lineStyle(2, C.controller, 0.6);
  GAME.UI.groundCircle(g, this.startPos.x, this.startPos.y, hero.range);

  for (i = 0; i < this.heroCards.length; i++) {
    var hc = this.heroCards[i];
    var on = hc.key === this.heroKey;
    hc.rect.setStrokeStyle(on ? 2 : 1, on ? C.controller : 0x3a3a52);
    hc.rect.setFillStyle(on ? 0x1c3a34 : 0x22222f);
  }

  for (i = 0; i < this.itemCells.length; i++) {
    var cell = this.itemCells[i];
    var picked = this.items[cell.slot] === cell.item.key;
    var afford = picked || (this.spent() + cell.item.cost <= this.budget);
    cell.rect.setStrokeStyle(picked ? 2 : 1, picked ? C.controller : 0x3a3a52);
    cell.rect.setFillStyle(picked ? 0x1c3a34 : (afford ? 0x22222f : 0x1a1a22));
  }

  var note = hero.name + ' · ' + hero.trait + ' — ' + hero.desc;
  if (this.hoverItem) note = this.hoverItem.name + ' — ' + this.hoverItem.note;
  note += '   |   체력 ' + st.hp + ' · 공격 ' + st.damage + ' · 방어 ' + st.armor + ' · 이동 ' + st.speed;
  if (st.lifesteal > 0) note += ' · 흡혈 ' + Math.round(st.lifesteal * 100) + '%';
  this.noteText.setText(note);

  this.budgetText.setText('예산  ' + this.spent() + ' / ' + this.budget +
    '  (남음 ' + (this.budget - this.spent()) + ')   ·   상대와 동일');
};
