window.GAME = window.GAME || {};

// 전략가 — 진형을 짜서 배치도로 저장한다.
// 사람이 배치하는 유닛은 항상 화면 아래에 놓고, 저장할 때 위쪽(전투 기준)으로 뒤집는다.
GAME.BuildScene = function () {
  Phaser.Scene.call(this, { key: 'Build' });
};
GAME.BuildScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.BuildScene.prototype.constructor = GAME.BuildScene;

GAME.BuildScene.prototype.init = function () {
  this.placed = [];
  this.picked = 'warrior';
  this.tier = GAME.CONFIG.DEFAULT_TIER;
};

GAME.BuildScene.prototype.create = function () {
  var C = GAME.CONFIG.COLORS;
  var self = this;

  this.cameras.main.setBackgroundColor(C.bg);
  this.budget = GAME.CONFIG.BUDGETS[this.tier];
  this.zone = GAME.CONFIG.ZONE_CONTROLLER;   // 사람은 항상 아래
  this.myColor = C.strategist;

  this.g = this.add.graphics();

  GAME.UI.label(this, 24, 22, '상대에게 보일 모습 (위) — 미리보기', 15, C.accentAlt, 0);
  GAME.UI.label(this, 24, GAME.Iso.toScreenY(this.zone.y) - 24,
    '내 진형 배치 구역 (아래) — 좌클릭 배치 / 우클릭 제거', 15, C.accentAlt, 0);

  var barTop = 486;

  this.budgetText = GAME.UI.label(this, 24, barTop, '', 17, C.text, 0);
  this.warnText = GAME.UI.label(this, 590, barTop, '', 15, C.warn, 0.5).setOrigin(0.5, 0);

  // 예산 티어 (왼쪽)
  GAME.UI.label(this, 24, barTop + 26, '예산 (컨트롤러도 같은 예산을 받습니다)', 12, C.textDim, 0);
  this.tierButtons = [];
  var tiers = GAME.CONFIG.BUDGET_TIERS;
  for (var t = 0; t < tiers.length; t++) {
    (function (tier, idx) {
      var b = GAME.UI.button(self, 70 + idx * 104, barTop + 74, 98, 42,
        tier.replace('예산', '') + ' ' + GAME.CONFIG.BUDGETS[tier], function () {
          self.tier = tier;
          self.budget = GAME.CONFIG.BUDGETS[tier];
          self._trimToBudget();
          self.redraw();
        }, { fontSize: 15 });
      self.tierButtons.push({ tier: tier, ui: b });
    })(tiers[t], t);
  }

  // 유닛 팔레트 (가운데)
  this.chips = [];
  var w = 112, h = 68, gap = 10;
  var startX = 407;
  for (var i = 0; i < GAME.UNIT_ORDER.length; i++) {
    (function (key, idx) {
      var def = GAME.UNITS[key];
      var cx = startX + idx * (w + gap);
      var cy = barTop + 48;
      var rect = self.add.rectangle(cx, cy, w, h, 0x22222f).setStrokeStyle(1, 0x3a3a52);
      rect.setInteractive({ useHandCursor: true });
      rect.on('pointerdown', function () { self.picked = key; self.redraw(); });
      GAME.UI.label(self, cx + 12, cy - 17, def.name, 15, C.text, 0.5).setOrigin(0.5);
      GAME.UI.label(self, cx + 12, cy + 8,
        def.cost + '  ·  ' + (GAME.isNonTarget(def) ? '논타겟' : '타겟'),
        12, GAME.isNonTarget(def) ? C.textDim : C.warn, 0.5).setOrigin(0.5);
      self.chips.push({ key: key, rect: rect, cx: cx, cy: cy });
    })(GAME.UNIT_ORDER[i], i);
  }

  // 액션 버튼
  GAME.UI.button(this, 460, barTop + 134, 200, 46, '배치도 저장', function () {
    self._save();
  }, { fill: 0x2a2440, line: 0x9b8cf0, hover: 0x372f52, color: C.accentAlt, fontSize: 18 });
  GAME.UI.button(this, 620, barTop + 134, 100, 40, '전부지우기', function () {
    self.placed = []; self.warnText.setText(''); self.redraw();
  }, { fontSize: 14 });
  GAME.UI.button(this, 736, barTop + 134, 100, 40, '메뉴', function () {
    self.scene.start('Menu');
  }, { fontSize: 15 });

  // 스탯 패널 (오른쪽)
  this.statTitle = GAME.UI.label(this, 862, barTop, '', 16, C.text, 0);
  this.statRows = [];
  for (var s = 0; s < GAME.STAT_DEFS.length; s++) {
    var ry = barTop + 38 + s * 28;
    this.statRows.push({
      name: GAME.UI.label(this, 940, ry, GAME.STAT_DEFS[s].key, 13, C.textDim, 1).setOrigin(1, 0.5),
      val: GAME.UI.label(this, 1142, ry, '', 13, C.text, 0).setOrigin(0, 0.5),
      y: ry
    });
  }

  this.input.on('pointerdown', function (p) {
    if (p.y > GAME.Iso.screenRect().bottom) return;
    var wpt = GAME.Iso.toWorld(p.x, p.y);
    if (p.rightButtonDown()) self._removeAt(wpt.x, wpt.y);
    else self._placeAt(wpt.x, wpt.y);
  });

  this.input.mouse.disableContextMenu();
  this.redraw();
};

GAME.BuildScene.prototype.spent = function () {
  var t = 0;
  for (var i = 0; i < this.placed.length; i++) t += GAME.UNITS[this.placed[i].type].cost;
  return t;
};

GAME.BuildScene.prototype._trimToBudget = function () {
  while (this.spent() > this.budget && this.placed.length) this.placed.pop();
};

GAME.BuildScene.prototype._placeAt = function (x, y) {
  if (!GAME.UI.inZone(this.zone, x, y)) {
    this.warnText.setText('아래 배치 구역 안에만 놓을 수 있습니다.');
    return;
  }
  var def = GAME.UNITS[this.picked];
  if (this.spent() + def.cost > this.budget) {
    this.warnText.setText('예산이 부족합니다. (' + def.name + ' 비용 ' + def.cost + ')');
    return;
  }
  for (var i = 0; i < this.placed.length; i++) {
    var p = this.placed[i];
    var dx = p.x - x, dy = p.y - y;
    if (Math.sqrt(dx * dx + dy * dy) < 30) {
      this.warnText.setText('유닛이 너무 가깝습니다.');
      return;
    }
  }
  this.placed.push({ type: this.picked, x: Math.round(x), y: Math.round(y) });
  this.warnText.setText('');
  this.redraw();
};

GAME.BuildScene.prototype._removeAt = function (x, y) {
  for (var i = this.placed.length - 1; i >= 0; i--) {
    var p = this.placed[i];
    var dx = p.x - x, dy = p.y - y;
    if (Math.sqrt(dx * dx + dy * dy) <= GAME.UNITS[p.type].radius + 10) {
      this.placed.splice(i, 1);
      this.warnText.setText('');
      this.redraw();
      return;
    }
  }
};

GAME.BuildScene.prototype._save = function () {
  if (!this.placed.length) {
    this.warnText.setText('유닛을 최소 1기 배치해야 합니다.');
    return;
  }
  var name = window.prompt('배치도 이름을 입력하세요', '내 진형');
  if (!name) return;
  var flipped = this.placed.map(function (p) {
    return { type: p.type, x: p.x, y: GAME.mirrorY(p.y) };
  });
  GAME.Formations.save({
    id: GAME.Formations.newId(),
    name: name.slice(0, 20),
    author: '나',
    isAI: false,
    tier: this.tier,
    budget: this.budget,
    units: flipped
  });
  this.scene.start('Menu');
};

GAME.BuildScene.prototype.redraw = function () {
  var C = GAME.CONFIG.COLORS;
  var g = this.g;
  var i, def;
  g.clear();

  GAME.UI.drawArena(g, { zones: true });

  var zr = GAME.Iso;
  g.lineStyle(2, this.myColor, 0.85);
  g.strokeRect(this.zone.x + 2, zr.toScreenY(this.zone.y) + 2,
    this.zone.w - 4, this.zone.h * zr.TILT - 4);

  // 위쪽: 상대가 볼 모습(뒤집힌 미리보기) — 전투에서처럼 아래를 향한다
  for (i = 0; i < this.placed.length; i++) {
    var pv = this.placed[i];
    GAME.UI.drawUnit(g, GAME.UNITS[pv.type], pv.x, GAME.mirrorY(pv.y), C.strategist, 0.32, Math.PI / 2);
  }

  // 아래쪽: 내가 놓은 것 (깊이 정렬)
  var sorted = this.placed.slice().sort(function (a, b) { return a.y - b.y; });
  for (i = 0; i < sorted.length; i++) {
    var p = sorted[i];
    def = GAME.UNITS[p.type];
    GAME.UI.drawUnit(g, def, p.x, p.y, this.myColor, 1, -Math.PI / 2);
    if (!GAME.isNonTarget(def)) {
      g.lineStyle(2, 0xf0a86a, 0.9);
      GAME.UI.groundCircle(g, p.x, p.y, def.radius + 7);
    }
  }

  // 팔레트
  for (var c = 0; c < this.chips.length; c++) {
    var chip = this.chips[c];
    var on = chip.key === this.picked;
    chip.rect.setStrokeStyle(on ? 2 : 1, on ? this.myColor : 0x3a3a52);
    chip.rect.setFillStyle(on ? 0x2c2c3e : 0x22222f);
    GAME.UI.drawUnitFlat(g, GAME.UNITS[chip.key], chip.cx - 38, chip.cy - 2, this.myColor, 1);
  }

  // 티어 강조
  for (var b = 0; b < this.tierButtons.length; b++) {
    var tb = this.tierButtons[b];
    var active = tb.tier === this.tier;
    tb.ui.rect.setStrokeStyle(active ? 2 : 1, active ? this.myColor : 0x4a4a68);
    tb.ui.rect.setFillStyle(active ? 0x2c2c3e : 0x262637);
  }

  // 스탯 막대
  var sel = GAME.UNITS[this.picked];
  this.statTitle.setText('유닛 정보 — ' + sel.name + '  (비용 ' + sel.cost + ')');
  GAME.UI.statBars(g, GAME.STAT_DEFS, sel, 950, this.statRows[0].y, 180, 28, this.myColor);
  for (i = 0; i < this.statRows.length; i++) {
    this.statRows[i].val.setText(GAME.STAT_DEFS[i].fmt(sel));
  }

  this.budgetText.setText('예산  ' + this.spent() + ' / ' + this.budget +
    '  (' + this.tier + ', 남음 ' + (this.budget - this.spent()) + ')     유닛 ' + this.placed.length + '기');
};
