window.GAME = window.GAME || {};

// 전략가 — 진형을 짜서 배치도로 저장한다.
// 사람이 배치하는 유닛은 항상 화면 아래에 놓고, 저장할 때 위쪽(전투 기준)으로 뒤집는다.
// 좌표는 정규화(0~1)로 저장되므로 세로/가로 어느 쪽에서 만들어도 호환된다.
GAME.BuildScene = function () {
  Phaser.Scene.call(this, { key: 'Build' });
};
GAME.BuildScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.BuildScene.prototype.constructor = GAME.BuildScene;

GAME.BuildScene.prototype.init = function () {
  this.placed = [];
  this.selected = null;      // 빨간 화살표로 표시할 유닛
  this.picked = 'bayonet';
  this.tier = GAME.CONFIG.DEFAULT_TIER;
};

GAME.BuildScene.prototype.create = function () {
  var C = GAME.CONFIG.COLORS;
  var self = this;
  var P = GAME.CONFIG.PORTRAIT;
  var W = GAME.CONFIG.WIDTH;
  var L = GAME.Layout;
  var hud = L.hud();

  this.cameras.main.setBackgroundColor(C.bg);
  this.budget = GAME.CONFIG.BUDGETS[this.tier];
  this.zone = GAME.CONFIG.ZONE_CONTROLLER;
  this.myColor = C.strategist;

  this.g = this.add.graphics();

  GAME.UI.label(this, hud.pad, 18, '상대에게 보일 모습 (위)', P ? 15 : 15, C.accentAlt, 0);
  GAME.UI.label(this, hud.pad, GAME.Iso.toScreenY(this.zone.y) - 20,
    '내 진형 배치 (아래) — 탭 배치 / 우클릭·길게 제거', P ? 15 : 15, C.accentAlt, 0);

  // 팔레트가 10종이라 2행 그리드로 배치한다
  var perRow = 5;
  var paletteRows = Math.ceil(GAME.UNIT_ORDER.length / perRow);
  var chipH = P ? 52 : 58;

  var rows = L.rows([
    { name: 'info', h: 22, gap: 4 },
    { name: 'warn', h: 20, gap: 8 },
    { name: 'pal0', h: chipH, gap: 6 },
    { name: 'pal1', h: chipH, gap: 10 },
    { name: 'tier', h: P ? 38 : 42, gap: 8 },
    { name: 'act', h: P ? 42 : 46, gap: 0 }
  ]);
  this.rowsRef = rows;

  this.budgetText = GAME.UI.label(this, hud.pad, rows.info.y, '', P ? 17 : 17, C.text, 0);
  this.warnText = GAME.UI.label(this, hud.pad, rows.warn.y, '', P ? 15 : 14, C.warn, 0);

  // 유닛 팔레트
  this.chips = [];
  var cols = L.cols(perRow, { gap: P ? 5 : 8 });
  for (var i = 0; i < GAME.UNIT_ORDER.length; i++) {
    (function (key, idx) {
      var def = GAME.UNITS[key];
      var r = Math.floor(idx / perRow), c = cols[idx % perRow];
      var rowY = (r === 0 ? rows.pal0 : rows.pal1);
      var rect = self.add.rectangle(c.cx, rowY.cy, c.w, chipH, 0x22222f).setStrokeStyle(1, 0x3a3a52);
      rect.setInteractive({ useHandCursor: true });
      rect.on('pointerdown', function () { self.picked = key; self.redraw(); });
      GAME.UI.label(self, c.cx + (P ? 8 : 10), rowY.y + 8, def.name, P ? 15 : 14, C.text, 0.5).setOrigin(0.5, 0);
      GAME.UI.label(self, c.cx + (P ? 8 : 10), rowY.bottom - 18, String(def.cost),
        P ? 13 : 12, C.accent, 0.5).setOrigin(0.5, 0);
      self.chips.push({ key: key, rect: rect, cx: c.cx, cy: rowY.cy, x: c.x });
    })(GAME.UNIT_ORDER[i], i);
  }

  // 예산 티어
  var tcols = L.cols(3, { gap: 8, width: Math.min(W, 420), left: hud.pad });
  this.tierButtons = [];
  var tiers = GAME.CONFIG.BUDGET_TIERS;
  for (var t = 0; t < tiers.length; t++) {
    (function (tier, idx) {
      var c = tcols[idx];
      var b = GAME.UI.button(self, c.cx, rows.tier.cy, c.w, rows.tier.h,
        tier.replace('예산', '') + ' ' + GAME.CONFIG.BUDGETS[tier], function () {
          self.tier = tier;
          self.budget = GAME.CONFIG.BUDGETS[tier];
          self._trimToBudget();
          self.redraw();
        }, { fontSize: P ? 15 : 15 });
      self.tierButtons.push({ tier: tier, ui: b });
    })(tiers[t], t);
  }

  // 유닛 설명(티어 버튼 오른쪽 남은 공간)
  // 세로에서는 티어 버튼 오른쪽에 남는 폭이 없다 → 설명을 경고문 줄에 겹쳐 쓴다
  var descX = P ? hud.pad : Math.min(W, 420) + hud.pad + 10;
  var descY = P ? rows.warn.y : rows.tier.y - 2;
  this.unitDesc = GAME.UI.label(this, descX, descY, '', P ? 13 : 13, C.textDim, 0)
    .setWordWrapWidth(P ? (W - hud.pad * 2) : Math.max(80, W - descX - hud.pad));

  // 액션
  var acols = L.cols(4, { gap: 8 });
  GAME.UI.button(this, acols[0].cx, rows.act.cy, acols[0].w, rows.act.h, '방어전 시작', function () {
    self._defend();
  }, { fill: 0x1c3a34, line: 0x35d0a5, hover: 0x235045, color: C.accent, fontSize: P ? 17 : 17 });
  GAME.UI.button(this, acols[1].cx, rows.act.cy, acols[1].w, rows.act.h, '배치도 저장', function () {
    self._save();
  }, { fill: 0x2a2440, line: 0x9b8cf0, hover: 0x372f52, color: C.accentAlt, fontSize: P ? 17 : 17 });
  GAME.UI.button(this, acols[2].cx, rows.act.cy, acols[2].w, rows.act.h, '전부 지우기', function () {
    self.placed = []; self.warnText.setText(''); self.redraw();
  }, { fontSize: P ? 15 : 14 });
  GAME.UI.button(this, acols[3].cx, rows.act.cy, acols[3].w, rows.act.h, '메뉴', function () {
    self.scene.start('Menu');
  }, { fontSize: P ? 15 : 14 });

  this.input.on('pointerdown', function (p) {
    if (p.y > GAME.Iso.screenRect().bottom) return;
    var wpt = GAME.Iso.toWorld(p.x, p.y);
    if (p.rightButtonDown()) { self._removeAt(wpt.x, wpt.y); return; }
    // 이미 놓은 유닛을 누르면 '선택'이다 — 빨간 화살표와 체력바를 보여준다.
    // 빈 자리를 누르면 새로 배치한다.
    var hit = self._unitAt(wpt.x, wpt.y);
    if (hit) { self.selected = (self.selected === hit) ? null : hit; self.redraw(); return; }
    self.selected = null;
    self._placeAt(wpt.x, wpt.y);
  });

  this.input.mouse.disableContextMenu();
  this.redraw();
};

GAME.BuildScene.prototype.spent = function () {
  var t = 0;
  for (var i = 0; i < this.placed.length; i++) t += GAME.UNITS[this.placed[i].type].cost;
  return t;
};

// 배치된 유닛 중 이 좌표를 누른 것 (가장 가까운 것 하나)
GAME.BuildScene.prototype._unitAt = function (x, y) {
  var best = null, bestD = Infinity;
  for (var i = 0; i < this.placed.length; i++) {
    var p = this.placed[i];
    var def = GAME.UNITS[p.type];
    var dx = p.x - x, dy = p.y - y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d <= def.radius + 10 && d < bestD) { bestD = d; best = p; }
  }
  return best;
};

GAME.BuildScene.prototype._trimToBudget = function () {
  while (this.spent() > this.budget && this.placed.length) this.placed.pop();
};

GAME.BuildScene.prototype._countOf = function (type) {
  var n = 0;
  for (var i = 0; i < this.placed.length; i++) if (this.placed[i].type === type) n++;
  return n;
};

GAME.BuildScene.prototype._placeAt = function (x, y) {
  if (!GAME.UI.inZone(this.zone, x, y)) {
    this.warnText.setText('아래 배치 구역 안에만 놓을 수 있습니다.');
    return;
  }
  var def = GAME.UNITS[this.picked];
  if (def.maxPerFormation && this._countOf(this.picked) >= def.maxPerFormation) {
    this.warnText.setText(def.name + '은(는) 배치도당 ' + def.maxPerFormation + '개까지만 놓을 수 있습니다.');
    return;
  }
  if (this.spent() + def.cost > this.budget) {
    this.warnText.setText('예산이 부족합니다. (' + def.name + ' ' + def.cost + ')');
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
    if (Math.sqrt(dx * dx + dy * dy) <= GAME.UNITS[p.type].radius + 12) {
      this.placed.splice(i, 1);
      if (this.selected === p) this.selected = null;
      this.warnText.setText('');
      this.redraw();
      return;
    }
  }
};

// 방어전 — AI 컨트롤러가 이 진형을 공격한다
GAME.BuildScene.prototype._defend = function () {
  if (!this.placed.length) {
    this.warnText.setText('유닛을 최소 1기 배치해야 합니다.');
    return;
  }
  this.scene.start('Defend', {
    placed: this.placed.slice(), tier: this.tier, budget: this.budget
  });
};

GAME.BuildScene.prototype._save = function () {
  if (!this.placed.length) {
    this.warnText.setText('유닛을 최소 1기 배치해야 합니다.');
    return;
  }
  var name = window.prompt('배치도 이름을 입력하세요', '내 진형');
  if (!name) return;

  // 한 배치가 모든 영웅을 커버할 수는 없다 → 이 배치도가 **어떤 영웅을 상대로 짠 것인지**
  // 지정해 저장한다. 매칭할 때 그 영웅으로 오는 상대에게 우선 출전한다.
  var order = GAME.HERO_ORDER;
  var menu = order.map(function (k, i) {
    return (i + 1) + '. ' + GAME.HEROES[k].name + ' (' + GAME.HEROES[k].trait + ')';
  }).join('\n');
  var ans = window.prompt(
    '이 배치도는 어떤 영웅을 상대로 짠 것인가요?\n\n' + menu + '\n0. 특정 영웅 없음 (범용)\n\n번호 입력', '0');
  if (ans === null) return;
  var idx = parseInt(ans, 10);
  var vsHero = (idx >= 1 && idx <= order.length) ? order[idx - 1] : null;

  // 아래에서 만든 걸 위쪽(전투 기준)으로 뒤집고, 정규화 좌표로 저장
  var units = this.placed.map(function (p) {
    var n = GAME.Formations.normalize(p.x, GAME.mirrorY(p.y));
    return { type: p.type, nx: n.nx, ny: n.ny };
  });
  GAME.Formations.save({
    id: GAME.Formations.newId(),
    name: name.slice(0, 20),
    author: '나', isAI: false,
    tier: this.tier, budget: this.budget, v: 2,
    vsHero: vsHero,
    units: units
  });
  this.scene.start('Menu');
};

GAME.BuildScene.prototype.redraw = function () {
  var C = GAME.CONFIG.COLORS;
  var g = this.g;
  var Iso = GAME.Iso;
  var i, def;
  g.clear();

  GAME.UI.drawArena(g, { zones: true });

  g.lineStyle(2, this.myColor, 0.85);
  g.strokeRect(this.zone.x + 2, Iso.toScreenY(this.zone.y) + 2,
    this.zone.w - 4, this.zone.h * Iso.TILT - 4);

  // 위쪽: 상대가 볼 모습(뒤집힌 미리보기)
  for (i = 0; i < this.placed.length; i++) {
    var pv = this.placed[i];
    GAME.UI.drawUnit(g, GAME.UNITS[pv.type], pv.x, GAME.mirrorY(pv.y), C.strategist, 0.3, Math.PI / 2);
  }

  // 아래쪽: 내가 놓은 것 (깊이 정렬)
  var sorted = this.placed.slice().sort(function (a, b) { return a.y - b.y; });
  for (i = 0; i < sorted.length; i++) {
    var p = sorted[i];
    def = GAME.UNITS[p.type];
    // 지원 유닛의 영향 범위를 배치 중에 보여준다
    if (def.healRadius) { g.lineStyle(1.5, 0x7ef0a0, 0.3); GAME.UI.groundCircle(g, p.x, p.y, def.healRadius); }
    if (def.buffRadius) { g.lineStyle(1.5, 0xffd166, 0.3); GAME.UI.groundCircle(g, p.x, p.y, def.buffRadius); }
    if (def.isMine) { g.lineStyle(1.5, 0xef4444, 0.5); GAME.UI.groundCircle(g, p.x, p.y, def.triggerRadius); }
    if (def.intercept) { g.lineStyle(1.5, 0x8fa0bb, 0.35); GAME.UI.groundCircle(g, p.x, p.y, def.intercept); }
    var pos = GAME.UI.drawUnit(g, def, p.x, p.y, this.myColor, 1, -Math.PI / 2);
    if (!GAME.isNonTarget(def)) {
      g.lineStyle(2, 0xf0a86a, 0.9);
      GAME.UI.groundCircle(g, p.x, p.y, def.radius + 7);
    }
    // 선택한 유닛 — 빨간 화살표 + 체력바(배치 중이라 항상 만피)
    if (this.selected === p && pos) {
      GAME.UI.hpBar(g, pos.sx, pos.by, def.radius, 1, { width: Math.max(30, def.radius * 2.6) });
      GAME.UI.selectArrow(g, pos.sx, pos.by - 8, def.radius, this.time.now);
    }
  }

  // 팔레트
  for (var c = 0; c < this.chips.length; c++) {
    var chip = this.chips[c];
    var on = chip.key === this.picked;
    chip.rect.setStrokeStyle(on ? 2 : 1, on ? this.myColor : 0x3a3a52);
    chip.rect.setFillStyle(on ? 0x2c2c3e : 0x22222f);
    GAME.UI.drawUnitFlat(g, GAME.UNITS[chip.key], chip.x + 14, chip.cy, this.myColor, 1, 0.8);
  }

  for (var b = 0; b < this.tierButtons.length; b++) {
    var tb = this.tierButtons[b];
    var active = tb.tier === this.tier;
    tb.ui.rect.setStrokeStyle(active ? 2 : 1, active ? this.myColor : 0x4a4a68);
    tb.ui.rect.setFillStyle(active ? 0x2c2c3e : 0x262637);
  }

  var sel = GAME.UNITS[this.picked];
  this.unitDesc.setText(sel.name + ' (' + sel.cost + ') — ' + sel.desc);

  // 세로는 폭이 420 이라 긴 문구가 화면을 넘는다 — 핵심만 남긴다
  this.budgetText.setText(GAME.CONFIG.PORTRAIT
    ? ('예산 ' + this.spent() + '/' + this.budget + ' · 유닛 ' + this.placed.length + '기')
    : ('예산  ' + this.spent() + ' / ' + this.budget +
       '  (' + this.tier + ')   ·   유닛 ' + this.placed.length + '기   ·   컨트롤러도 같은 예산'));
};
