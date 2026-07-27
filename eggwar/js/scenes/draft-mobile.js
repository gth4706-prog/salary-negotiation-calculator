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
    var rect = self.add.rectangle(x + w / 2, y + TAP / 2, w, TAP, 0x242433)
      .setStrokeStyle(1, 0x4a4a68);
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
    { fill: 0x1c3a34, line: 0x35d0a5, hover: 0x235045, color: C.accent, fontSize: 'button' });

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
  this.budgetText.setColor(left < 0 ? C.hpBad : C.text);

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
    g.fillStyle(0x2a2a3a, 1);
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
    ref.rect.setStrokeStyle(it ? 2 : 1, it ? 0x35d0a5 : 0x4a4a68);
  });

  GAME.SKILL_SLOTS.forEach(function (slot) {
    var o = hero.skillOptions[slot][self.picks[slot] || 0];
    R['skill_' + slot].val.setText(o.name);
  });

  this.noteText.setText(hero.desc);
};
