window.GAME = window.GAME || {};

// 세로(모바일) 전용 준비 화면 패널.
//
// 왜 나눴나: 영웅 3종 + 장비 12종 + 스킬 12종을 420×900 한 화면에 펼치면 행 높이가
// 20px 대로 내려가 글자가 서로 붙는다. 읽히는 크기(설계 18px, 화면 16.7px)로 올리면
// 물리적으로 안 들어간다. 그래서 **요약 행만 두고 실제 선택은 전체화면 팝업**에서 한다.
// 행 높이는 Material 48dp / Apple HIG 44pt 중 큰 쪽(UI.TAP)을 따른다.
GAME.DraftScene.prototype._buildPanelCompact = function () {
  var C = GAME.CONFIG.COLORS;
  var UI = GAME.UI;
  var self = this;
  var S = this.split;
  var px = S.panelX, pw = S.panelW;
  var y = S.panelY;
  this.compact = true;

  // 두 줄(분류 micro + 값 subhead)이 들어가므로 탭 최소치보다 더 높아야 한다.
  // 52 로 두면 두 줄이 겹친다(실측).
  var TAP = Math.max(UI.TAP || 52, 62);
  var GAP = 8;

  this.budgetText = UI.label(this, px, y, '', 'body', C.text, 0);
  y += 28;
  this.warnText = UI.label(this, px, y, '', 'caption', C.warn, 0).setWordWrapWidth(pw);
  y += 24;

  this.rowRefs = {};

  // 요약 행 — 위에 분류, 아래에 현재 선택값
  function summaryRow(key, x, w, caption, onTap) {
    var rect = self.add.rectangle(x + w / 2, y + TAP / 2, w, TAP, GAME.UI.COL.surfaceAlt)
      .setStrokeStyle(1, GAME.UI.COL.borderUi);
    rect.setInteractive({ useHandCursor: true });
    rect.on('pointerdown', onTap);
    var cap = UI.label(self, x + 12, y + 7, caption, 'micro', C.textDim, 0)
      .setWordWrapWidth(w - 20);
    var val = UI.label(self, x + 12, y + TAP - 28, '', 'subhead', C.text, 0)
      .setWordWrapWidth(w - 20);
    self.rowRefs[key] = { rect: rect, cap: cap, val: val };
  }

  // ── 영웅 ──
  summaryRow('hero', px, pw,
    this.heroLocked ? '영웅 — 탑에서 확정됨' : '영웅 — 눌러서 변경', function () {
      if (self.heroLocked) {
        self.warnText.setText('탑에서는 로비에서 고른 영웅으로만 도전합니다.');
        return;
      }
      GAME.Modal.open(self, {
        title: '영웅 선택',
        items: GAME.HERO_ORDER.map(function (k) {
          var h = GAME.HEROES[k];
          return {
            key: k, name: h.name, note: h.trait + ' · ' + h.desc, cost: h.cost,
            selected: k === self.heroKey
          };
        }),
        onPick: function (it) {
          self.heroKey = it.key;
          GAME.Store.set('asymgame.lastHero', it.key);
          self.picks = GAME.defaultSkillPicks();
          self._trim();
          self.redraw();
        }
      });
    });
  y += TAP + GAP;

  // ── 능력치 (핵심 3개만) ──
  this.statRows = [];
  this.compactStats = [0, 2, 3];      // 공격력 · 체력 · 방어력
  for (var s2 = 0; s2 < this.compactStats.length; s2++) {
    var sd = GAME.HERO_STAT_DEFS[this.compactStats[s2]];
    var cy = y + 12;
    this.statRows.push({
      name: UI.label(this, px, cy, sd.key, 'micro', C.textDim, 0).setOrigin(0, 0.5),
      val: UI.label(this, px + pw, cy, '', 'micro', C.text, 1).setOrigin(1, 0.5),
      cy: cy
    });
    y += 26;
  }
  this.statBarGeo = { x: px + 86, w: pw - 160 };
  y += 6;

  // ── 장비 4칸 (2열 2행) ──
  var half = Math.floor((pw - GAP) / 2);
  GAME.ITEM_SLOTS.forEach(function (slot, i) {
    var col = i % 2;
    if (col === 0 && i > 0) y += TAP + GAP;
    summaryRow('item_' + slot.key, px + col * (half + GAP), half, slot.name, function () {
      var list = GAME.ITEMS[slot.key];
      var cur = self.items[slot.key];
      var base = self.spent() - (cur ? GAME.Items.find(slot.key, cur).cost : 0);
      var rows = [{ key: null, name: '착용 안 함', note: '', cost: 0, selected: !cur }];
      list.forEach(function (it) {
        rows.push({
          key: it.key, name: it.name, note: it.note, cost: it.cost,
          selected: cur === it.key,
          disabled: base + it.cost > self.budget
        });
      });
      GAME.Modal.open(self, {
        title: slot.name + ' 선택   (남은 예산 ' + (self.budget - base) + ')',
        items: rows,
        onPick: function (it) {
          self.items[slot.key] = it.key;
          self.warnText.setText('');
          self.redraw();
        }
      });
    });
  });
  y += TAP + GAP;

  // ── 스킬 QWER (2열 2행) ──
  GAME.SKILL_SLOTS.forEach(function (slot, i) {
    var col = i % 2;
    if (col === 0 && i > 0) y += TAP + GAP;
    summaryRow('skill_' + slot, px + col * (half + GAP), half, slot + ' 스킬', function () {
      var opts = GAME.HEROES[self.heroKey].skillOptions[slot];
      GAME.Modal.open(self, {
        title: slot + ' 스킬 선택',
        items: opts.map(function (o, idx) {
          return {
            key: idx, name: o.name, note: GAME.DraftScene.skillNote(o),
            selected: (self.picks[slot] || 0) === idx
          };
        }),
        onPick: function (it) { self.picks[slot] = it.key; self.redraw(); }
      });
    });
  });
  y += TAP + GAP + 4;

  this.noteText = UI.label(this, px, y, '', 'caption', C.textDim, 0).setWordWrapWidth(pw);
  y += 46;

  // ── 액션: 뒤로 + 전투 시작 한 줄 ──
  var actH = UI.BTN_H || 58;
  this._rAct = { y: y, h: actH, cy: y + actH / 2 };
  this._backW = Math.round(pw * 0.34);
  var startW = pw - this._backW - GAP;
  UI.button(this, px + this._backW + GAP + startW / 2, this._rAct.cy, startW, actH,
    '전투 시작', function () { self._start(); },
    { fill: GAME.UI.COL.panelTeal, line: GAME.CONFIG.COLORS.controller, hover: GAME.UI.COL.panelTealHi, color: C.accent, fontSize: 'button' });

  // 가로 전용 참조들 — 공용 redraw 루프가 안전하게 비도록 빈 배열로 둔다
  this.heroCards = [];
  this.itemCells = [];
  this.slotTabs = [];
  this.optionRows = [];
  this.panelEnd = y + actH;
};

// 스킬 한 줄 설명 (팝업에서 쓴다)
GAME.DraftScene.skillNote = function (o) {
  var bits = [];
  if (o.damage) bits.push('피해 ' + o.damage);
  if (o.dps) bits.push('초당 ' + o.dps);
  if (o.radius) bits.push('범위 ' + Math.round(o.radius));
  if (o.dist) bits.push('거리 ' + Math.round(o.dist));
  if (o.healNow) bits.push('회복 ' + o.healNow);
  if (o.shield) bits.push('보호막 ' + o.shield);
  if (o.rootMs) bits.push('속박 ' + (o.rootMs / 1000) + '초');
  if (o.cooldown) bits.push('쿨 ' + Math.round(o.cooldown / 1000) + '초');
  return bits.join(' · ');
};

// ── 탑 준비 가이드 위저드 (세로) ──────────────────────────────────────────
// 흐름: 예산 안내 → ① 장비 한 번에(4칸을 한 팝업에서) → ②~⑤ 스킬 Q·W·E·R 하나씩.
// 각 단계에 '이전' 버튼(첫 단계는 '탑으로', 마지막은 '전투 시작').
// 선택은 self.items / self.picks 에 바로 반영하고 뒤의 요약 패널도 redraw 로 동기화한다.
GAME.DraftScene.prototype._towerWizard = function () {
  this._wizIdx = 0;
  this._wizObjs = [];
  this._wizStep(0);
  var self = this;
  // 씬을 나갈 때 팝업 잔여물 정리
  this.events.once('shutdown', function () { self._wizClose(); });
};

GAME.DraftScene.prototype._wizClose = function () {
  if (!this._wizObjs) return;
  for (var i = 0; i < this._wizObjs.length; i++) {
    if (this._wizObjs[i] && this._wizObjs[i].destroy) this._wizObjs[i].destroy();
  }
  this._wizObjs = [];
};

// 위저드 공통 뼈대(가림막·패널·제목·단계·예산·이전/다음 버튼)를 그리고
// 콘텐츠를 채울 y 구간을 돌려준다.
GAME.DraftScene.prototype._wizChrome = function (title, stepText, leftLabel, leftTap, rightLabel, rightTap, contentH) {
  var C = GAME.CONFIG.COLORS, UI = GAME.UI, COL = UI.COL;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var self = this;
  var pad = 14, panelW = W - pad * 2, px = pad;
  var titleH = 40, stepH = 22, budgetH = 26, navH = UI.BTN_H || 58;
  var panelH = Math.min(H - 24, titleH + stepH + budgetH + contentH + navH + 40);
  var panelY = (H - panelH) / 2;

  var veil = this.add.rectangle(W / 2, H / 2, W, H, 0x05050a, 0.82).setDepth(1000).setInteractive();
  // 가림막 탭은 막기만 한다(위저드는 이전/다음으로만 이동) — 오조작 방지.
  veil.on('pointerdown', function () {});
  this._wizObjs.push(veil);

  var panel = this.add.rectangle(W / 2, panelY, panelW, panelH, COL.surface)
    .setOrigin(0.5, 0).setStrokeStyle(2, COL.borderUi || 0x4a4a68).setDepth(1001);
  this._wizObjs.push(panel);

  this._wizObjs.push(UI.label(this, px + 4, panelY + 12, title, 'subhead', C.text, 0).setDepth(1003));
  this._wizObjs.push(UI.label(this, px + panelW - 4, panelY + 14, stepText, 'caption', C.textDim, 1)
    .setOrigin(1, 0).setDepth(1003));

  // 예산 줄 — 실시간
  var left = this.budget - this.spent();
  var bt = UI.label(this, px + 4, panelY + titleH + stepH - 6,
    '예산  ' + this.spent() + ' / ' + this.budget + '   남음 ' + left,
    'caption', left < 0 ? (C.danger || C.hpBad) : C.accent, 0).setDepth(1003);
  this._wizObjs.push(bt);
  this._wizBudgetText = bt;

  // 이전 / 다음 버튼 (아래 한 줄)
  var navY = panelY + panelH - navH - 12;
  var gap = 8, halfW = Math.round((panelW - gap) / 2);
  var lb = UI.button(this, px + halfW / 2, navY + navH / 2, halfW, navH, leftLabel, leftTap, { fontSize: 'button' });
  var rb = UI.button(this, px + halfW + gap + halfW / 2, navY + navH / 2, halfW, navH, rightLabel, rightTap,
    { fill: COL.panelTeal, line: C.controller, hover: COL.panelTealHi, color: C.accent, fontSize: 'button' });
  [lb, rb].forEach(function (b) {
    b.rect.setDepth(1002); b.text.setDepth(1003); if (b.gfx) b.gfx.setDepth(1002);
    self._wizObjs.push(b.rect, b.text); if (b.gfx) self._wizObjs.push(b.gfx);
  });

  return { px: px, panelW: panelW, top: panelY + titleH + stepH + budgetH, bottom: navY - 8, depthBase: 1002 };
};

GAME.DraftScene.prototype._wizUpdateBudget = function () {
  if (!this._wizBudgetText) return;
  var C = GAME.CONFIG.COLORS;
  var left = this.budget - this.spent();
  this._wizBudgetText.setText('예산  ' + this.spent() + ' / ' + this.budget + '   남음 ' + left);
  this._wizBudgetText.setColor(left < 0 ? (C.danger || C.hpBad) : C.accent);
};

GAME.DraftScene.prototype._wizStep = function (idx) {
  this._wizClose();
  this._wizIdx = idx;
  if (idx === 0) this._wizItems();
  else this._wizSkill(['Q', 'W', 'E', 'R'][idx - 1], idx);
};

// ① 장비 — 4칸(무기/방어구/신발/물약)을 한 팝업에서 2열 그리드로. 칸마다 없음+3종.
GAME.DraftScene.prototype._wizItems = function () {
  var C = GAME.CONFIG.COLORS, UI = GAME.UI, COL = UI.COL;
  var self = this;
  var slots = GAME.ITEM_SLOTS;
  // 콘텐츠 높이 추정: 슬롯마다 (헤더 24 + 2행×56 + 간격)
  var rowH = 54, rGap = 6, hdrH = 24, blockGap = 10;
  var slotBlockH = hdrH + 2 * rowH + rGap + blockGap;
  var contentH = slots.length * slotBlockH;

  var ch = this._wizChrome('장비 선택', '1 / 5',
    '← 탑으로', function () { self.scene.start('Tower'); },
    '다음 →', function () { self._wizStep(1); }, contentH);

  var y = ch.top + 4;
  var colGap = 8, colW = Math.floor((ch.panelW - 24 - colGap) / 2);
  var x0 = ch.px + 12;

  slots.forEach(function (slot) {
    self._wizObjs.push(UI.label(self, x0, y, slot.name, 'micro', C.textDim, 0).setDepth(1003));
    y += hdrH;
    // 옵션: 없음 + 3종
    var opts = [{ key: null, name: '없음', cost: 0 }].concat(GAME.ITEMS[slot.key]);
    var cur = self.items[slot.key];
    var baseCost = self.spent() - (cur ? GAME.Items.find(slot.key, cur).cost : 0);
    opts.forEach(function (it, i) {
      var col = i % 2, rowN = Math.floor(i / 2);
      var cx = x0 + col * (colW + colGap);
      var ry = y + rowN * (rowH + rGap);
      var selected = (cur || null) === (it.key || null);
      var over = it.key && (baseCost + it.cost > self.budget);
      var rect = self.add.rectangle(cx + colW / 2, ry + rowH / 2, colW, rowH,
        selected ? COL.panelTeal : COL.surfaceAlt)
        .setStrokeStyle(selected ? 2 : 1, selected ? C.controller : (COL.borderUi || 0x3a3a52))
        .setDepth(1002);
      if (over) rect.setAlpha(0.4);
      else {
        rect.setInteractive({ useHandCursor: true });
        rect.on('pointerdown', function (p) {
          if (p && p.event && p.event.stopPropagation) p.event.stopPropagation();
          self.items[slot.key] = it.key;      // 같은 걸 다시 눌러도 유지(없음은 해제)
          self.redraw();
          self._wizStep(0);                    // 다시 그려 강조·예산 갱신
        });
      }
      self._wizObjs.push(rect);
      self._wizObjs.push(UI.label(self, cx + 10, ry + rowH / 2, it.name,
        'caption', over ? C.textDim : C.text, 0).setOrigin(0, 0.5).setDepth(1003)
        .setWordWrapWidth(colW - 40));
      if (it.key) {
        self._wizObjs.push(UI.label(self, cx + colW - 8, ry + rowH / 2, String(it.cost),
          'micro', over ? C.textDim : C.accent, 1).setOrigin(1, 0.5).setDepth(1003));
      }
    });
    y += 2 * rowH + rGap + blockGap;
  });
};

// ②~⑤ 스킬 — Q/W/E/R 를 하나씩. 3지선다 단일 선택, 이전/다음.
GAME.DraftScene.prototype._wizSkill = function (slot, idx) {
  var C = GAME.CONFIG.COLORS, UI = GAME.UI, COL = UI.COL;
  var self = this;
  var opts = GAME.HEROES[this.heroKey].skillOptions[slot];
  var rowH = 76, rGap = 8;
  var contentH = 26 + opts.length * rowH + (opts.length - 1) * rGap;

  var last = idx === 4;
  var ch = this._wizChrome(slot + ' 스킬 선택', (idx + 1) + ' / 5',
    '← 이전', function () { self._wizStep(idx - 1); },
    last ? '전투 시작' : '다음 →',
    last ? function () { self._wizClose(); self._start(); } : function () { self._wizStep(idx + 1); },
    contentH);

  var y = ch.top + 2;
  self._wizObjs.push(UI.label(self, ch.px + 12, y, GAME.HEROES[self.heroKey].name + ' — ' + slot + ' 스킬',
    'micro', C.textDim, 0).setDepth(1003));
  y += 26;

  var px = ch.px + 12, w = ch.panelW - 24;
  opts.forEach(function (o, i) {
    var ry = y + i * (rowH + rGap);
    var selected = (self.picks[slot] || 0) === i;
    var rect = self.add.rectangle(px + w / 2, ry + rowH / 2, w, rowH,
      selected ? COL.panelTeal : COL.surfaceAlt)
      .setStrokeStyle(selected ? 2 : 1, selected ? C.controller : (COL.borderUi || 0x3a3a52))
      .setDepth(1002);
    rect.setInteractive({ useHandCursor: true });
    rect.on('pointerdown', function (p) {
      if (p && p.event && p.event.stopPropagation) p.event.stopPropagation();
      self.picks[slot] = i;
      self.redraw();
      self._wizStep(idx);      // 강조 갱신
    });
    self._wizObjs.push(rect);
    self._wizObjs.push(UI.label(self, px + 12, ry + 12, (selected ? '● ' : '○ ') + o.name,
      'subhead', C.text, 0).setDepth(1003));
    self._wizObjs.push(UI.label(self, px + 12, ry + rowH - 26, GAME.DraftScene.skillNote(o),
      'caption', C.textDim, 0).setDepth(1003).setWordWrapWidth(w - 24));
  });
};

GAME.DraftScene.prototype._redrawCompact = function () {
  var C = GAME.CONFIG.COLORS;
  var hero = GAME.HEROES[this.heroKey];
  var st = GAME.Items.applyTo(hero, this.items);
  var g = this.g;
  var self = this;
  g.clear();

  this.drawScout();

  var left = this.budget - this.spent();
  this.budgetText.setText('예산 ' + this.spent() + ' / ' + this.budget + '   남음 ' + left);
  this.budgetText.setColor(left < 0 ? (C.danger || C.hpBad) : C.text);

  var R = this.rowRefs;
  R.hero.val.setText(hero.name + '  ' + hero.cost);

  var live = {
    damage: st.damage, cooldown: hero.cooldown,
    hp: st.hp, armor: st.armor, speed: st.speed
  };
  for (var i = 0; i < this.statRows.length; i++) {
    var sd = GAME.HERO_STAT_DEFS[this.compactStats[i]];
    var frac = Math.max(0, Math.min(1, sd.get(live) / sd.max));
    var bh = 12, r = this.statRows[i];
    g.fillStyle(GAME.UI.COL.surfaceHi, 1);
    g.fillRect(this.statBarGeo.x, r.cy - bh / 2, this.statBarGeo.w, bh);
    g.fillStyle(C.controller, 1);
    g.fillRect(this.statBarGeo.x, r.cy - bh / 2, this.statBarGeo.w * frac, bh);
    r.val.setText(sd.fmt(live));
  }

  GAME.ITEM_SLOTS.forEach(function (slot) {
    var k = self.items[slot.key];
    var it = k ? GAME.Items.find(slot.key, k) : null;
    var ref = R['item_' + slot.key];
    ref.val.setText(it ? it.name : '없음');
    ref.val.setColor(it ? C.text : C.textDim);
    ref.rect.setStrokeStyle(it ? 2 : 1, it ? GAME.CONFIG.COLORS.controller : GAME.UI.COL.borderUi);
  });

  GAME.SKILL_SLOTS.forEach(function (slot) {
    var o = hero.skillOptions[slot][self.picks[slot] || 0];
    R['skill_' + slot].val.setText(o.name);
  });

  this.noteText.setText(hero.desc);
};
