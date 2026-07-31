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
            // 영웅 비용은 더 이상 개별 값이 아니다(전 영웅 공통) → 목록에 숫자를 띄우지 않는다.
            key: k, name: h.name,
            note: h.trait + ' · ' + h.desc + (h.hint ? ' · ' + h.hint : ''),
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
    '장비 예산  ' + this.spent() + ' / ' + this.budget + '   남음 ' + left,
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
  this._wizBudgetText.setText('장비 예산  ' + this.spent() + ' / ' + this.budget + '   남음 ' + left);
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
  this.budgetText.setText('장비 예산 ' + this.spent() + ' / ' + this.budget + '   남음 ' + left);
  this.budgetText.setColor(left < 0 ? (C.danger || C.hpBad) : C.text);

  var R = this.rowRefs;
  // 여기 예산 표기는 **장비 예산**이다. 영웅 기본가(78)를 같이 띄우면
  // '예산 0 / 57' 옆에 '광전사 78' 이 붙어 57 중 78 을 쓴 것처럼 읽힌다(실측 지적).
  R.hero.val.setText(hero.name + '  ·  ' + hero.trait);

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

// ═══════════════════════════════════════════════════════════════════════════
//  폰 가로 (820×390) — 준비 화면 2단계
//  ---------------------------------------------------------------------------
//  왜 '한 화면'이 아니라 '2단계'인가 (계산 근거)
//    폰 가로에서 글자 하한은 UI.FS.MIN = 15 설계px 이고 한 줄 상자는 19px 다.
//    · 왼쪽 레일(적 편성표)은 최소 폭 224 — "쇠뇌 진지 ×2" 한 줄이 들어가는 최소치.
//    · 남는 폭 572 안에서
//        장비  : 슬롯 4줄 × 카드 3장. 카드 한 장에 아이콘 40 + 이름/설명 2줄이 들어가야
//                하므로 카드 55 높이 × 4줄 = 235.
//        스킬  : 탭 4개(터치 56) + 3지선다(이름+설명 2줄 = 75) × 3 = 238.
//        미리보기 무대 : 폭 264 × 높이 220 이하로는 9종 이펙트가 무대를 넘친다.
//      → 장비 235 + 스킬 238 = 473 이 필요한데 본문 높이는 298 뿐이다.
//        가로로 더 쪼개도 (572 − 스킬 300 − 무대 264 = 8) 장비가 들어갈 폭이 없다.
//    한 화면에 욱여넣으려면 글자를 하한 밑으로 내려야 하는데, 그게 이 저장소에서
//    반복해서 사고를 낸 바로 그 선택이다. 그래서 **장비 → 스킬** 2단계로 나눈다.
//    적 편성표(왼쪽 레일)와 예산/골드(아래 띠)는 두 단계에서 **그대로 유지**되므로
//    "무엇을 상대로 얼마를 쓰고 있는가"는 어느 단계에서도 사라지지 않는다.
// ═══════════════════════════════════════════════════════════════════════════

// 설계 상수 — 전부 820×390 기준. SE(667×375)는 FIT 0.813 이므로
// 터치 타깃은 설계 55px 이상이어야 화면 44px 를 넘는다(55×0.813 = 44.7).
GAME.DraftScene.PH = {
  PAD: 8,
  HEAD_Y: 3, HEAD_H: 21,
  BODY_Y: 26, BODY_H: 298,
  BAR_Y: 328, BTN_H: 56, BTN_W: 148,
  RAIL_W: 224, GAP: 8,
  VER_W: 52          // 우하단 DOM 버전 배지(#ver)가 덮는 폭 — 버튼을 여기까지 밀지 않는다
};

GAME.DraftScene.prototype._createPhone = function () {
  var C = GAME.CONFIG.COLORS, UI = GAME.UI;
  var self = this;
  var W = GAME.CONFIG.WIDTH;
  var K = GAME.DraftScene.PH;

  this.phone = true;
  this.compact = false;
  this._phObjs = [];
  this._phCells = [];
  this._phTabs = [];
  this._phOpts = [];
  // 공용 Graphics — 표시 목록 맨 앞이라 뒤에 만드는 글자·카드가 항상 이 위에 온다.
  this.g = this.add.graphics();

  // ── 머리줄 ──────────────────────────────────────────────────────────────
  // 오른쪽 표시를 먼저 만들어 실제 왼쪽 끝을 재고, 제목을 그 앞까지만 쓴다.
  this.phStepLbl = UI.label(this, W - K.PAD, K.HEAD_Y, '', 'micro', C.accent, 0).setOrigin(1, 0);
  var learned = GAME.Learn.summary(this.formation.id);
  var head = this.formation.name + (this.formation.isAI ? ' (AI)' : ' (사람)') +
    '  ·  ' + GAME.UI.winRateText(this.formation.id) +
    (learned ? ('  ·  학습 ' + learned.battles + '전') : '');
  this.phHeadLbl = UI.label(this, K.PAD, K.HEAD_Y, '', 'micro', C.accentAlt, 0);
  GAME.DraftScene.fitText(this.phHeadLbl, head, W - K.PAD * 2 - 180, UI.FS.micro, UI.FS.micro);

  // ── 왼쪽 레일: 적 편성표 (두 단계 공통) ──────────────────────────────────
  this._phBuildRail();

  // ── 아래 띠: 예산 · 남은 골드 · 이전/다음 ────────────────────────────────
  var barCy = K.BAR_Y + K.BTN_H / 2;
  this.budgetText = UI.label(this, K.PAD, K.BAR_Y + 2, '', 'micro', C.textDim, 0);
  // 설명과 경고는 **같은 객체**를 쓴다 — 두 객체를 같은 줄에 두면 겹친다(이 저장소의 상습 사고).
  // 경고가 비어 있을 때만 설명으로 되돌린다(_redrawPhone).
  this.warnText = UI.label(this, K.PAD, K.BAR_Y + 26, '', 'micro', C.warn, 0);
  this.noteText = this.warnText;

  var goldX = 452;
  UI.label(this, goldX, K.BAR_Y + 2, '남은 골드', 'micro', C.textDim, 0).setOrigin(1, 0);
  this.goldText = UI.label(this, goldX, K.BAR_Y + 24, '0', 'num', C.accent, 0).setOrigin(1, 0);

  // 오른쪽 끝 44px 는 DOM 버전 배지(#ver, right:10 bottom:8)의 자리다 — 비워둔다.
  var rx = W - K.VER_W - K.BTN_W;
  var lx = rx - K.GAP - K.BTN_W;
  this._phBtnL = UI.button(this, lx + K.BTN_W / 2, barCy, K.BTN_W, K.BTN_H, '',
    function () { self._phBack(); }, { fontSize: 'buttonSm' });
  this._phBtnR = UI.button(this, rx + K.BTN_W / 2, barCy, K.BTN_W, K.BTN_H, '',
    function () { self._phNext(); },
    { fill: UI.COL.panelTeal, line: C.controller, hover: UI.COL.panelTealHi,
      color: C.accent, fontSize: 'button' });

  this._phStep(0);
};

GAME.DraftScene.prototype._phBack = function () {
  if (this._phStepIdx > 0) { this._phStep(this._phStepIdx - 1); return; }
  // 대전은 첫 단계에서 뒤로 가면 **영웅 선택으로** 돌아간다(2026-07-31 사용자 지시:
  // "이전으로 돌아가서 골드 분배할 수도 있게"). 대전 목록으로 나가려면 한 번 더 누른다.
  // ⚠ 탑은 그대로 — 거기는 AI 가 그 영웅을 보고 배치를 짰으므로 바꾸면 카운터가 어긋난다.
  if (this.versus && !this._phHeroBackUsed) {
    this._phHeroBackUsed = true;
    this.needHeroPick = true;
    this._pickHero();
    return;
  }
  this.scene.start(this.tower ? 'Tower' : (this.versus ? 'Versus' : 'Select'));
};

GAME.DraftScene.prototype._phNext = function () {
  if (this._phStepIdx === 0) { this._phStep(1); return; }
  this._start();
};

// ── 왼쪽 레일 ───────────────────────────────────────────────────────────────
//  TFT 의 '플레이어 목록' 자리다. 준비 화면에서 정말 필요한 정보는 "어디에 서 있나"가
//  아니라 "무엇이 몇 기 있나" — 그래서 미니맵이 아니라 표다.
//  종류가 8종을 넘으면 행 높이가 글자 상자(19)보다 얇아지므로 2열로 접는다.
GAME.DraftScene.prototype._phBuildRail = function () {
  var C = GAME.CONFIG.COLORS, UI = GAME.UI;
  var K = GAME.DraftScene.PH;
  var rd = this._rosterData();
  var rows = rd.rows;
  var i;

  var x = K.PAD, y = K.BODY_Y, w = K.RAIL_W, h = K.BODY_H;
  var ix = x + 8, iw = w - 16;
  this._phRail = { x: x, y: y, w: w, h: h, rows: [] };

  UI.label(this, ix, y + 6, '적 편성  ' + rd.total + '기 · ' + rows.length + '종',
    'micro', rd.boss ? C.crit : C.accentAlt, 0);
  var l2 = UI.label(this, ix, y + 26, '', 'micro', C.textDim, 0);
  GAME.DraftScene.fitText(l2, '체력 ' + rd.hp + ' · 화력 ' + rd.dps + '/초' +
    (rd.boss ? ' · 보스 ' + rd.boss : ''), iw, UI.FS.micro, UI.FS.micro);

  var top = y + 50;
  var legendH = 21;
  var avail = (y + h - 8 - legendH) - top;
  var cols = 1, perCol = rows.length;
  var rowH = rows.length ? Math.floor(avail / rows.length) - 3 : 30;
  if (rowH < 24 && rows.length > 1) {
    cols = 2;
    perCol = Math.ceil(rows.length / 2);
    rowH = Math.floor(avail / perCol) - 3;
  }
  rowH = Math.max(21, Math.min(34, rowH));
  var colW = Math.floor((iw - (cols - 1) * 6) / cols);
  this._phRail.top = top;

  for (i = 0; i < rows.length; i++) {
    var r = rows[i], d = r.def;
    var ci = Math.floor(i / perCol), ri = i % perCol;
    if (ci >= cols) break;
    var rx2 = ix + ci * (colW + 6);
    var ry = top + ri * (rowH + 3);
    if (ry + rowH > y + h - legendH) break;
    var boss = GAME.isBoss(d);
    var auto = GAME.isAutoHit(d);

    var cnt = UI.label(this, rx2 + colW - 4, ry + (rowH - 19) / 2, '×' + r.n,
      'micro', C.accent, 0).setOrigin(1, 0);
    var nm = UI.label(this, rx2 + 34, ry + (rowH - 19) / 2, '', 'micro',
      boss ? C.crit : (auto ? (C.danger || C.warn) : C.text), 0);
    GAME.DraftScene.fitText(nm, (boss ? '★' : '') + d.name,
      colW - 34 - Math.ceil(cnt.width) - 6, UI.FS.micro, UI.FS.micro);

    this._phRail.rows.push({
      def: d, x: rx2, y: ry, w: colW, h: rowH,
      tone: boss ? UI.COL.focus : (auto ? UI.COL.hpBad : UI.COL.controller),
      strong: boss || auto
    });
  }

  var lg = UI.label(this, ix, y + h - legendH - 4, '', 'micro', C.textDim, 0);
  GAME.DraftScene.fitText(lg, '붉은 띠 = 자동명중 · 금 = 보스', iw, UI.FS.micro, UI.FS.micro);
};

GAME.DraftScene.prototype._phDrawRail = function () {
  var C = GAME.CONFIG.COLORS, COL = GAME.UI.COL;
  var g = this.g, R = this._phRail;
  if (!R) return;
  g.fillStyle(COL.surface, 1);
  g.fillRoundedRect(R.x, R.y, R.w, R.h, 10);
  g.lineStyle(1, COL.border, 1);
  g.strokeRoundedRect(R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1, 10);
  g.fillStyle(COL.divider, 1);
  g.fillRect(R.x + 8, R.top - 6, R.w - 16, 1);

  for (var i = 0; i < R.rows.length; i++) {
    var r = R.rows[i];
    g.fillStyle(COL.surfaceAlt, 1);
    g.fillRoundedRect(r.x, r.y, r.w, r.h, 6);
    g.fillStyle(r.tone, r.strong ? 0.95 : 0.55);
    g.fillRoundedRect(r.x, r.y + 3, 3, r.h - 6, 2);
    var sc = Math.min(9.5, r.h * 0.32) / r.def.radius;
    GAME.UI.drawUnitFlat(g, r.def, r.x + 17, r.y + r.h / 2 + 5, C.strategist, 1, sc);
  }
};

// ── 단계 전환 ───────────────────────────────────────────────────────────────
GAME.DraftScene.prototype._phClearStep = function () {
  if (this.pg && this.pg.clearMask) this.pg.clearMask(true);
  if (this._pvMask && this._pvMask.destroy) this._pvMask.destroy();
  this._pvMask = null;
  this.pg = null;
  this.pvStage = null;
  this._pvSkill = null;
  this.pvName = null;
  this.pvDesc = null;
  if (!this._phObjs) { this._phObjs = []; return; }
  for (var i = 0; i < this._phObjs.length; i++) {
    var o = this._phObjs[i];
    if (o && o.destroy) o.destroy();
  }
  this._phObjs = [];
  this._phCells = [];
  this._phTabs = [];
  this._phOpts = [];
};

GAME.DraftScene.prototype._phKeep = function (o) { this._phObjs.push(o); return o; };

GAME.DraftScene.prototype._phStep = function (idx) {
  var C = GAME.CONFIG.COLORS;
  // 이 2단계 흐름은 **폰 가로 전용**이다. PC·세로에서는 _createPhone 이 돌지 않아
  // _phBtnL/R·phStepLbl 이 없다 → 그 상태로 들어오면 'setLabel of null' 로 죽는다.
  // (실측: 검증 스크립트가 프로필을 안 가리고 불러서 걸렸다. 지금 UI 경로는 없지만
  //  씬 재진입·외부 호출에서 언제든 재현될 수 있는 형태라 입구에서 막는다.)
  if (!this._phBtnL || !this._phBtnR || !this.phStepLbl) return;
  this._phClearStep();
  this._phStepIdx = idx;
  this.hoverItem = null;
  if (idx === 0) this._phItems(); else this._phSkills();

  var backLabel = this.tower ? '← 탑으로' : (this.versus ? '← 대전' : '← 진형 선택');
  this._phBtnL.setLabel(idx === 0 ? backLabel : '← 장비');
  this._phBtnR.setLabel(idx === 0 ? '스킬 →' : '전투 시작');
  this.phStepLbl.setText(idx === 0 ? '1 / 2  장비' :
    ('2 / 2  스킬  ·  ' + GAME.HEROES[this.heroKey].name));
  this._warn('');
  this.redraw();
  this._pvSyncPick();
};

// ── ① 장비 ─────────────────────────────────────────────────────────────────
//  슬롯 4줄 × 카드 3장. TFT 의 상점 줄을 슬롯마다 하나씩 둔 꼴이다.
//  좌우 스크롤을 쓰지 않은 이유: 12종은 '한 줄'이 아니라 **4개 슬롯 × 3단계 가격표**라,
//  한 줄로 늘어놓으면 슬롯 묶음이 사라지고 같은 슬롯끼리 비교하려면 스크롤이 필요해진다.
//  스크롤 없이 다 들어가면 스크롤보다 항상 낫다.
GAME.DraftScene.prototype._phItems = function () {
  var C = GAME.CONFIG.COLORS, UI = GAME.UI, COL = UI.COL;
  var self = this;
  var K = GAME.DraftScene.PH;
  var W = GAME.CONFIG.WIDTH;
  var px = K.PAD + K.RAIL_W + K.GAP;          // 240
  var pw = W - K.PAD - px;                    // 572
  var y = K.BODY_Y;

  var hero = GAME.HEROES[this.heroKey];

  // 영웅 확인 줄 (고를 수 없다 — 이전 화면에서 확정됐다)
  this.heroStripL = this._phKeep(UI.label(this, px, y, '', 'micro', C.accentAlt, 0));
  this.heroStripR = this._phKeep(UI.label(this, px + pw, y, '', 'micro', C.textDim, 0).setOrigin(1, 0));

  // 능력치 막대 — 장비를 고르면 바로 움직인다
  var sy = y + 21;
  var n = GAME.HERO_STAT_DEFS.length;
  var cw = Math.floor((pw - (n - 1) * 6) / n);
  this.statRows = [];
  this.statCols = [];
  for (var i = 0; i < n; i++) {
    var cx = px + i * (cw + 6);
    this.statRows.push({
      name: null,
      val: this._phKeep(UI.label(this, cx, sy, '', 'micro', C.textDim, 0)),
      cy: sy + 26
    });
    this.statCols.push({ x: cx, w: cw, cy: sy + 26 });
  }

  // 슬롯 4줄 — 카드 높이는 SE(FIT 0.813)에서도 화면 44px 를 넘어야 한다 → 설계 55 이상.
  var top = sy + 38;                            // 85
  var bottom = K.BODY_Y + K.BODY_H;             // 324
  var slots = GAME.ITEM_SLOTS;
  var gap = 5;
  var rowH = Math.floor((bottom - top - gap * (slots.length - 1)) / slots.length);
  var gutter = 48;
  var cardLeft = px + gutter + 4;
  var cardW = Math.floor((W - K.PAD - cardLeft - 16) / 3);

  this.itemCells = [];
  for (var k = 0; k < slots.length; k++) {
    (function (slot, si) {
      var ry = top + si * (rowH + gap);
      var cy = ry + rowH / 2;
      var sl = self._phKeep(UI.label(self, px, cy - 10, '', 'micro', C.textDim, 0));
      GAME.DraftScene.fitText(sl, slot.name, gutter, UI.FS.micro, UI.FS.micro);
      var list = GAME.ITEMS[slot.key];
      for (var m = 0; m < list.length; m++) {
        (function (item, ci) {
          var cx = cardLeft + ci * (cardW + 8);
          var rect = self._phKeep(self.add.rectangle(cx + cardW / 2, cy, cardW, rowH, COL.surfaceAlt)
            .setStrokeStyle(1, COL.border).setDepth(-1));
          rect.setInteractive({ useHandCursor: true });
          rect.on('pointerdown', function () { self.hoverItem = item; self._toggleItem(slot.key, item); });

          var tx = cx + 46;
          var nm = self._phKeep(UI.label(self, tx, cy - 20, '', 'micro', C.text, 0));
          var cs = self._phKeep(UI.label(self, cx + cardW - 6, cy - 20, String(item.cost),
            'micro', C.accent, 0).setOrigin(1, 0));
          var nt = self._phKeep(UI.label(self, tx, cy + 1, '', 'micro', C.textDim, 0));
          GAME.DraftScene.fitText(nm, item.name,
            cardW - 46 - Math.ceil(cs.width) - 8, UI.FS.micro, UI.FS.micro);
          GAME.DraftScene.fitText(nt, item.note, cardW - 52, UI.FS.micro, UI.FS.micro);

          self.itemCells.push({
            slot: slot.key, item: item, rect: rect, name: nm, cost: cs, note: nt,
            ix: cx + 24, iy: cy, isz: 38,
            x: cx, y: ry, w: cardW, h: rowH
          });
        })(list[m], m);
      }
    })(slots[k], k);
  }

  // 가로/세로 전용 참조는 비워둔다 — 공용 코드가 안전하게 돌게
  this.heroCards = [];
  this.slotTabs = [];
  this.optionRows = [];
};

// ── ② 스킬 + 미리보기 무대 ─────────────────────────────────────────────────
GAME.DraftScene.prototype._phSkills = function () {
  var C = GAME.CONFIG.COLORS, UI = GAME.UI, COL = UI.COL;
  var self = this;
  var K = GAME.DraftScene.PH;
  var W = GAME.CONFIG.WIDTH;
  var px = K.PAD + K.RAIL_W + K.GAP;          // 240
  var y = K.BODY_Y;
  var bottom = K.BODY_Y + K.BODY_H;           // 324

  var stW = 264;                               // 무대 폭 — 9종 이펙트가 넘치지 않는 최소치
  var lw = W - K.PAD - px - stW - K.GAP;       // 스킬 목록 폭 300
  var rx = px + lw + K.GAP;

  // 탭 QWER — 폭 71 에 스킬 이름까지 넣으면 두 글자밖에 안 남는다.
  // 고른 스킬 이름은 아래 목록(● 표시)과 무대 이름표에서 읽히므로 탭은 글자 하나로 크게.
  var tabH = 56;
  var tabW = Math.floor((lw - 3 * 5) / 4);
  this.slotTabs = [];
  for (var t = 0; t < GAME.SKILL_SLOTS.length; t++) {
    (function (slot, idx) {
      var cx = px + idx * (tabW + 5);
      var rect = self._phKeep(self.add.rectangle(cx + tabW / 2, y + tabH / 2, tabW, tabH, COL.surfaceAlt)
        .setStrokeStyle(1, COL.border).setDepth(-1));
      rect.setInteractive({ useHandCursor: true });
      rect.on('pointerdown', function () {
        self.editSlot = slot; self._pvHover = false; self.redraw();
      });
      var lbl = self._phKeep(UI.label(self, cx + tabW / 2, y + tabH / 2 - 16, slot,
        'subhead', C.accent, 0.5).setOrigin(0.5, 0));
      var sub = self._phKeep(UI.label(self, cx + tabW / 2, y + tabH - 22, '',
        'micro', C.textDim, 0.5).setOrigin(0.5, 0));
      self.slotTabs.push({ slot: slot, rect: rect, label: lbl, sub: sub, w: tabW });
    })(GAME.SKILL_SLOTS[t], t);
  }

  // 3지선다
  var oy = y + tabH + 6;
  var oGap = 5;
  var oh = Math.floor((bottom - oy - oGap * 2) / 3);
  this.optionRows = [];
  for (var o = 0; o < 3; o++) {
    var ry = oy + o * (oh + oGap);
    var rect2 = this._phKeep(this.add.rectangle(px + lw / 2, ry + oh / 2, lw, oh, COL.surfaceAlt)
      .setStrokeStyle(1, COL.border).setDepth(-1));
    rect2.setInteractive({ useHandCursor: true });
    (function (idx, rr) {
      rr.on('pointerdown', function () {
        var opts = GAME.HEROES[self.heroKey].skillOptions[self.editSlot];
        if (!opts[idx]) return;
        self.picks[self.editSlot] = idx; self._pvHover = false; self.redraw();
      });
    })(o, rect2);
    this.optionRows.push({
      rect: rect2,
      name: this._phKeep(UI.label(this, px + 10, ry + 6, '', 'micro', C.text, 0)),
      desc: this._phKeep(UI.label(this, px + 10, ry + 28, '', 'micro', C.textDim, 0)
        .setWordWrapWidth(lw - 20))
    });
  }

  // 미리보기 무대 — 사용자가 직접 요청한 기능이라 폰에서도 살린다.
  var stH = 220;
  this.pvStage = { x: rx, y: y, w: stW, h: stH, cx: rx + stW / 2, cy: y + stH / 2 };
  this.pg = this._phKeep(this.add.graphics());
  var mg = this.make.graphics({ add: false });
  mg.fillStyle(0xffffff, 1);
  mg.fillRoundedRect(rx, y, stW, stH, 10);
  this._pvMask = mg;
  this.pg.setMask(mg.createGeometryMask());

  this.pvName = this._phKeep(UI.label(this, rx, y + stH + 4, '', 'micro', C.accent, 0));
  this.pvDesc = this._phKeep(UI.label(this, rx, y + stH + 26, '', 'micro', C.textDim, 0)
    .setWordWrapWidth(stW));

  this.heroCards = [];
  this.itemCells = [];
};

// ── 폰 redraw ───────────────────────────────────────────────────────────────
GAME.DraftScene.prototype._redrawPhone = function () {
  var C = GAME.CONFIG.COLORS, UI = GAME.UI, COL = UI.COL;
  var g = this.g;
  var i;
  g.clear();

  this._phDrawRail();

  var hero = GAME.HEROES[this.heroKey];
  var st = GAME.Items.applyTo(hero, this.items);
  var left = this.itemBudget - this.spent();

  if (this._phStepIdx === 0) {
    this.heroStripL.setText('영웅 확정 — ' + hero.name + ' · ' + hero.trait);
    GAME.DraftScene.fitText(this.heroStripR,
      '공격 ' + st.damage + ' · 체력 ' + st.hp + ' · 방어 ' + st.armor + ' · 이동 ' + st.speed +
      (st.lifesteal > 0 ? ' · 흡혈 ' + Math.round(st.lifesteal * 100) + '%' : ''),
      330, UI.FS.micro, UI.FS.micro);

    var live = { damage: st.damage, cooldown: hero.cooldown, hp: st.hp, armor: st.armor, speed: st.speed };
    for (i = 0; i < this.statRows.length; i++) {
      var sd = GAME.HERO_STAT_DEFS[i];
      var frac = Math.max(0, Math.min(1, sd.get(live) / sd.max));
      var bc = this.statCols[i], bh = 9;
      g.fillStyle(COL.surfaceHi, 1);
      g.fillRoundedRect(bc.x, bc.cy - bh / 2, bc.w, bh, 4);
      if (frac > 0) {
        g.fillStyle(C.controller, 1);
        g.fillRoundedRect(bc.x, bc.cy - bh / 2, Math.max(bh, bc.w * frac), bh, 4);
      }
      g.lineStyle(1, COL.border, 1);
      g.strokeRoundedRect(bc.x + 0.5, bc.cy - bh / 2 + 0.5, bc.w - 1, bh - 1, 4);
      GAME.DraftScene.fitText(this.statRows[i].val, sd.key + ' ' + sd.fmt(live),
        bc.w, UI.FS.micro, UI.FS.micro);
    }

    for (i = 0; i < this.itemCells.length; i++) {
      var cell = this.itemCells[i];
      var picked = this.items[cell.slot] === cell.item.key;
      var afford = picked || (cell.item.cost <= left);
      cell.rect.setStrokeStyle(picked ? 2 : 1, picked ? C.controller : COL.border);
      cell.rect.setFillStyle(picked ? COL.panelTeal : (afford ? COL.surfaceAlt : COL.bg));
      if (UI.drawItem) UI.drawItem(g, cell.slot, cell.item.key, cell.ix, cell.iy, cell.isz);
      if (!afford) {
        g.fillStyle(COL.bg, 0.58);
        g.fillRoundedRect(cell.x + 1, cell.y + 1, cell.w - 2, cell.h - 2, 6);
      }
      cell.name.setAlpha(afford ? 1 : 0.42);
      cell.cost.setAlpha(afford ? 1 : 0.42);
      cell.note.setAlpha(afford ? 1 : 0.35);
      cell.cost.setColor(picked ? C.accent : (afford ? C.crit : C.textDim));
      if (picked) {
        g.lineStyle(2, C.controller, 0.9);
        g.strokeRoundedRect(cell.x + 1, cell.y + 1, cell.w - 2, cell.h - 2, 7);
      }
    }
  } else {
    for (i = 0; i < this.slotTabs.length; i++) {
      var tab = this.slotTabs[i];
      var active = tab.slot === this.editSlot;
      tab.rect.setStrokeStyle(active ? 2 : 1, active ? C.controller : COL.border);
      tab.rect.setFillStyle(active ? COL.panelTeal : COL.surfaceAlt);
      var pickIdx = this.picks[tab.slot] || 0;
      GAME.DraftScene.fitText(tab.sub, hero.skillOptions[tab.slot][pickIdx].name,
        tab.w - 6, UI.FS.micro, UI.FS.micro);
    }
    var opts = hero.skillOptions[this.editSlot];
    for (i = 0; i < this.optionRows.length; i++) {
      var r = this.optionRows[i];
      if (i >= opts.length) { r.rect.setVisible(false); r.name.setText(''); r.desc.setText(''); continue; }
      r.rect.setVisible(true);
      var sel = (this.picks[this.editSlot] || 0) === i;
      r.rect.setStrokeStyle(sel ? 2 : 1, sel ? C.controller : COL.border);
      r.rect.setFillStyle(sel ? COL.panelTeal : COL.surfaceAlt);
      r.name.setText((sel ? '● ' : '○ ') + opts[i].name);
      r.desc.setText(this._skillDesc(opts[i]));
    }
    this._pvSyncPick();
  }

  // 아래 띠 — 경고가 있으면 경고, 없으면 영웅 설명(같은 객체라 겹칠 수가 없다)
  if (this._warnOn) {
    this.warnText.setColor(C.warn);
  } else {
    this.warnText.setColor(C.textDim);
    GAME.DraftScene.fitText(this.warnText, hero.desc, 420, UI.FS.micro, UI.FS.micro);
  }
  GAME.DraftScene.fitText(this.budgetText,
    '장비 예산 ' + this.spent() + ' / ' + this.itemBudget + '  ·  상대와 동일 조건',
    420, UI.FS.micro, UI.FS.micro);
  this.budgetText.setColor(left < 0 ? (C.danger || C.hpBad) : C.textDim);
  this._rollGold(left);
};
