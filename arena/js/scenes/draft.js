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
  this.startPos = { x: 600, y: 590 };
};

GAME.DraftScene.prototype.create = function () {
  var C = GAME.CONFIG.COLORS;
  var self = this;

  this.cameras.main.setBackgroundColor(C.bg);
  this.g = this.add.graphics();

  GAME.UI.label(this, 24, 22,
    '상대 진형 — ' + this.formation.name + (this.formation.isAI ? ' (AI 배치)' : ' (사람 배치)') +
    '   ·   ' + GAME.UI.winRateText(this.formation.id),
    15, C.accentAlt, 0);

  GAME.UI.label(this, 24, GAME.Iso.toScreenY(GAME.CONFIG.ZONE_CONTROLLER.y) - 24,
    '내 시작 위치 (아래 구역 클릭으로 이동)', 15, C.accent, 0);

  this.budgetText = GAME.UI.label(this, 24, 480, '', 17, C.text, 0);
  this.warnText = GAME.UI.label(this, 500, 480, '', 14, C.warn, 0);

  // ── 영웅 카드 (왼쪽) ──
  GAME.UI.label(this, 24, 506, '영웅', 13, C.textDim, 0);
  this.heroCards = [];
  for (var i = 0; i < GAME.HERO_ORDER.length; i++) {
    (function (key, idx) {
      var h = GAME.HEROES[key];
      var cx = 80 + idx * 130;
      var cy = 578;
      var rect = self.add.rectangle(cx, cy, 122, 96, 0x22222f).setStrokeStyle(1, 0x3a3a52);
      rect.setInteractive({ useHandCursor: true });
      rect.on('pointerdown', function () { self.heroKey = key; self._trim(); self.redraw(); });
      GAME.UI.label(self, cx, cy - 30, h.name, 17, C.text, 0.5).setOrigin(0.5);
      GAME.UI.label(self, cx, cy - 8, h.trait, 12, C.textDim, 0.5).setOrigin(0.5);
      GAME.UI.label(self, cx, cy + 30, '비용 ' + h.cost, 13, C.accent, 0.5).setOrigin(0.5);
      self.heroCards.push({ key: key, rect: rect, cx: cx, cy: cy });
    })(GAME.HERO_ORDER[i], i);
  }

  // ── 아이템 상점 (가운데) ──
  GAME.UI.label(this, 420, 506, '아이템 (같은 칸을 다시 누르면 해제)', 13, C.textDim, 0);
  this.itemCells = [];
  for (var s = 0; s < GAME.ITEM_SLOTS.length; s++) {
    (function (slot, row) {
      var ry = 552 + row * 46;
      GAME.UI.label(self, 490, ry, slot.name, 14, C.textDim, 1).setOrigin(1, 0.5);
      var list = GAME.ITEMS[slot.key];
      for (var k = 0; k < list.length; k++) {
        (function (item, col) {
          var cx = 562 + col * 122;
          var rect = self.add.rectangle(cx, ry, 116, 40, 0x22222f).setStrokeStyle(1, 0x3a3a52);
          rect.setInteractive({ useHandCursor: true });
          rect.on('pointerover', function () { self.hoverItem = item; self.redraw(); });
          rect.on('pointerout', function () { if (self.hoverItem === item) self.hoverItem = null; self.redraw(); });
          rect.on('pointerdown', function () { self._toggleItem(slot.key, item); });
          GAME.UI.label(self, cx, ry - 8, item.name, 13, C.text, 0.5).setOrigin(0.5);
          GAME.UI.label(self, cx, ry + 10, String(item.cost), 12, C.accent, 0.5).setOrigin(0.5);
          self.itemCells.push({ slot: slot.key, item: item, rect: rect });
        })(list[k], k);
      }
    })(GAME.ITEM_SLOTS[s], s);
  }

  // ── 영웅 스탯 (오른쪽) ──
  this.statTitle = GAME.UI.label(this, 892, 506, '', 15, C.text, 0);
  this.statRows = [];
  for (var t = 0; t < GAME.HERO_STAT_DEFS.length; t++) {
    var ry2 = 542 + t * 27;
    this.statRows.push({
      name: GAME.UI.label(this, 962, ry2, GAME.HERO_STAT_DEFS[t].key, 12, C.textDim, 1).setOrigin(1, 0.5),
      val: GAME.UI.label(this, 1140, ry2, '', 12, C.text, 0).setOrigin(0, 0.5),
      y: ry2
    });
  }
  this.itemNote = GAME.UI.label(this, 892, 668, '', 12, C.textDim, 0).setWordWrapWidth(288);

  // ── 스킬 설명 (하단) ──
  this.skillTexts = [];
  for (var q = 0; q < 4; q++) {
    var sx = 24 + q * 212;
    this.add.rectangle(sx + 100, 736, 200, 62, 0x1c1c28).setStrokeStyle(1, 0x33334a);
    this.skillTexts.push({
      slot: GAME.UI.label(this, sx + 12, 714, '', 14, C.accent, 0),
      name: GAME.UI.label(this, sx + 38, 714, '', 14, C.text, 0),
      desc: GAME.UI.label(this, sx + 12, 738, '', 11, C.textDim, 0).setWordWrapWidth(184)
    });
  }

  GAME.UI.button(this, 1035, 744, 280, 56, '전투 시작', function () {
    self._start();
  }, { fill: 0x1c3a34, line: 0x35d0a5, hover: 0x235045, color: C.accent, fontSize: 21 });

  // 뒤로가기는 헤더 쪽에 둔다 — 하단은 상점/스킬로 꽉 차 있다
  GAME.UI.button(this, 1110, 26, 140, 32, '← 진형 선택', function () {
    self.scene.start('Select');
  }, { fontSize: 13 });

  // 시작 위치 지정
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

// 영웅을 바꿔 예산을 넘기면 비싼 아이템부터 해제
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

  // 상대 진형 (깊이 정렬)
  var enemies = this.formation.units.slice().sort(function (a, b) { return a.y - b.y; });
  for (i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    var edef = GAME.UNITS[e.type];
    if (!edef) continue;
    GAME.UI.drawUnit(g, edef, e.x, e.y, C.strategist, 0.85);
    if (!GAME.isNonTarget(edef)) {
      g.lineStyle(2, 0xf0a86a, 0.9);
      GAME.UI.groundCircle(g, e.x, e.y, edef.radius + 7);
    }
  }

  // 내 영웅 미리보기
  var hero = GAME.HEROES[this.heroKey];
  var st = GAME.Items.applyTo(hero, this.items);
  var previewDef = { radius: hero.radius, shape: hero.shape };
  GAME.UI.drawUnit(g, previewDef, this.startPos.x, this.startPos.y, C.controller, 1);
  g.lineStyle(2, C.controller, 0.7);
  GAME.UI.groundCircle(g, this.startPos.x, this.startPos.y, hero.range);

  // 영웅 카드 강조
  for (i = 0; i < this.heroCards.length; i++) {
    var hc = this.heroCards[i];
    var on = hc.key === this.heroKey;
    hc.rect.setStrokeStyle(on ? 2 : 1, on ? C.controller : 0x3a3a52);
    hc.rect.setFillStyle(on ? 0x1c3a34 : 0x22222f);
    GAME.UI.drawUnitFlat(g, { radius: 11, shape: GAME.HEROES[hc.key].shape },
      hc.cx, hc.cy + 8, C.controller, 1);
  }

  // 아이템 칸 강조
  for (i = 0; i < this.itemCells.length; i++) {
    var cell = this.itemCells[i];
    var picked = this.items[cell.slot] === cell.item.key;
    var afford = picked || (this.spent() + cell.item.cost <= this.budget);
    cell.rect.setStrokeStyle(picked ? 2 : 1, picked ? C.controller : 0x3a3a52);
    cell.rect.setFillStyle(picked ? 0x1c3a34 : (afford ? 0x22222f : 0x1a1a22));
  }

  // 스탯 막대 — 아이템 반영 후 실제 값
  var live = {
    damage: st.damage, cooldown: hero.cooldown, hp: st.hp,
    armor: st.armor, speed: st.speed
  };
  this.statTitle.setText(hero.name + ' · ' + hero.trait);
  GAME.UI.statBars(g, GAME.HERO_STAT_DEFS, live, 972, this.statRows[0].y, 160, 27, C.controller);
  for (i = 0; i < this.statRows.length; i++) {
    this.statRows[i].val.setText(GAME.HERO_STAT_DEFS[i].fmt(live));
  }

  var note = hero.desc;
  if (this.hoverItem) note = this.hoverItem.name + ' — ' + this.hoverItem.note;
  if (st.lifesteal > 0) note += '  (흡혈 ' + Math.round(st.lifesteal * 100) + '%)';
  this.itemNote.setText(note);

  // 스킬 설명
  for (i = 0; i < 4; i++) {
    var sk = hero.skills[i];
    this.skillTexts[i].slot.setText('[' + sk.slot + ']');
    this.skillTexts[i].name.setText(sk.name);
    this.skillTexts[i].desc.setText(this._skillDesc(sk));
  }

  var left = this.budget - this.spent();
  this.budgetText.setText('예산  ' + this.spent() + ' / ' + this.budget + '  (남음 ' + left +
    ')   ·   상대와 동일 예산');
};

GAME.DraftScene.prototype._skillDesc = function (sk) {
  var cd = '쿨 ' + (sk.cooldown / 1000).toFixed(0) + '초';
  switch (sk.type) {
    case 'dash': return (sk.damage ? '돌진 + 경로 피해 ' + sk.damage : '순간 이동') + ' · ' + cd;
    case 'aoeSelf': return '주변 ' + sk.radius + ' 광역 ' + sk.damage + (sk.knockback ? ' + 넉백' : '') + ' · ' + cd;
    case 'aoeTarget': return '지정 위치 ' + (sk.repeat || 1) + '회 폭격 ' + sk.damage + ' · ' + cd;
    case 'projectile': return '관통 투사체 ' + sk.damage + ' · ' + cd;
    case 'strike': return '단일 강타 ' + sk.damage + ' (흡혈 강화) · ' + cd;
    case 'buff': return (sk.shield ? '보호막 ' + sk.shield : '방어력 +' + sk.armorAdd) + ' · ' + cd;
    case 'pull': return '전방 적을 끌어당김 + ' + sk.damage + ' · ' + cd;
    case 'aura': return '주변 지속 피해 ' + sk.dps + '/초 · ' + cd;
    case 'trap': return '덫 설치 ' + sk.damage + ' + 속박 · ' + cd;
    default: return cd;
  }
};
