window.GAME = window.GAME || {};

// 컨트롤러 준비 화면.
// 컨트롤러는 유닛을 배치하지 않으므로 배치 UI가 필요 없다.
// 왼쪽 = 상대 진형을 세로로 크게 보여주는 정찰 화면, 오른쪽 = 영웅·능력치·아이템·스킬 커스터마이징.
GAME.DraftScene = function () {
  Phaser.Scene.call(this, { key: 'Draft' });
};
GAME.DraftScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.DraftScene.prototype.constructor = GAME.DraftScene;

GAME.DraftScene.prototype.init = function (data) {
  this.formation = GAME.Formations.getById(data.formationId);
  this.tower = (data && data.tower) || 0;    // 통곡의 탑 층수 (0이면 일반 대전)
  // 탑에서는 영웅 예산이 진형보다 느리게 오른다 (난이도가 실제로 올라가게)
  this.budget = this.tower ? GAME.Tower.heroBudgetFor(this.tower)
                           : GAME.Formations.budgetOf(this.formation);
  // 탑에서는 로비에서 이미 영웅을 골랐다(AI 가 그 영웅을 보고 배치를 짰으므로
  // 여기서 바꾸면 카운터가 어긋난다). 그래서 넘어온 영웅을 그대로 쓴다.
  this.heroKey = (data && data.heroKey && GAME.HEROES[data.heroKey])
    ? data.heroKey
    : GAME.Store.get('asymgame.lastHero', 'vanguard');
  if (!GAME.HEROES[this.heroKey]) this.heroKey = 'vanguard';
  this.heroLocked = !!(this.tower && data && data.heroKey);
  this.items = { weapon: null, armor: null, boots: null, potion: null };
  this.picks = GAME.defaultSkillPicks();
  this.editSlot = 'Q';
  this.hoverItem = null;
  // 씬을 다시 들어오면 이전 표시객체는 이미 파괴돼 있다. 참조를 지우지 않으면
  // redraw 의 `if (!this.scoutSummary)` 가 파괴된 객체를 재사용해 터진다.
  this.scoutSummary = null;
};

GAME.DraftScene.prototype.create = function () {
  var C = GAME.CONFIG.COLORS;
  var self = this;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var P = GAME.CONFIG.PORTRAIT;

  this.cameras.main.setBackgroundColor(C.bg);

  // ── 화면 분할 ──
  // 세로 모바일은 폭이 좁아 좌우 분할이 안 되므로 위(정찰)/아래(설정)로 나눈다.
  // 정찰도 아래의 '적 구성 요약'은 유닛 종류가 많으면 두 줄이 된다.
  // 그 높이를 명시적으로 잡아두지 않으면 아래 패널의 첫 줄(예산)과 겹친다(실제로 겪음).
  var SUMMARY_H = P ? 48 : 20;
  this.split = P
    ? { scoutX: 10, scoutY: 40, scoutW: W - 20, scoutH: Math.round(H * 0.20),
        panelX: 10, panelY: 40 + Math.round(H * 0.20) + 4 + SUMMARY_H, panelW: W - 20 }
    : { scoutX: 16, scoutY: 52, scoutW: Math.round(W * 0.34), scoutH: H - 116,
        panelX: Math.round(W * 0.34) + 32, panelY: 52, panelW: W - Math.round(W * 0.34) - 48 };

  this.g = this.add.graphics();

  // 오른쪽 학습 표시를 먼저 그려 실제 왼쪽 끝을 재고, 제목을 그 앞까지만 쓴다.
  // 배치도 이름이 20자까지 되는데 제목을 그냥 이어붙였더니 화면 밖으로 나가면서
  // 오른쪽 표시와 겹쳤다(세로 411px, 화면 420px).
  var learned = GAME.Learn.summary(this.formation.id);
  var learnLbl = GAME.UI.label(this, W - 16, 14,
    learned ? ('학습 ' + learned.battles + '전' + (learned.learned.length ? ' · ' + learned.learned.join(', ') : ''))
            : '학습 기록 없음',
    P ? 13 : 13, learned && learned.learned.length ? C.crit : C.textDim, 1).setOrigin(1, 0);

  var head = '상대 진형 정찰 — ' + this.formation.name + (this.formation.isAI ? ' (AI)' : ' (사람)');
  var headLbl = GAME.UI.label(this, 16, 14, head, P ? 15 : 16, C.accentAlt, 0);
  var headMax = learnLbl.getBounds().x - 10 - 16;
  if (headLbl.width > headMax && headMax > 40) {
    var hs = head;
    while (hs.length > 1 && headLbl.width > headMax) { hs = hs.slice(0, -1); headLbl.setText(hs + '…'); }
  }
  GAME.UI.label(this, 16, P ? 36 : 32, GAME.UI.winRateText(this.formation.id), P ? 13 : 13, C.warn, 0);

  this._buildPanel();

  // 세로에서는 패널이 화면 아래까지 꽉 차서 '뒤로' 를 따로 아래에 둘 자리가 없다
  // (실제로 '전투 시작' 버튼과 겹쳤다). 같은 줄 왼쪽에 나란히 놓는다.
  var backLabel = this.tower ? '← 탑으로' : '← 진형 선택';
  if (P) {
    var ra = this._rAct;
    GAME.UI.button(this, this.split.panelX + this._backW / 2, ra.cy, this._backW, ra.h,
      backLabel, function () {
        self.scene.start(self.tower ? 'Tower' : 'Select');
      }, { fontSize: 15 });
  } else {
    GAME.UI.button(this, W - 90, H - 26, 160, 36, backLabel, function () {
      self.scene.start(self.tower ? 'Tower' : 'Select');
    }, { fontSize: 14 });
  }

  this.redraw();

  // 탑(세로): 영웅은 로비에서 이미 확정됐으니, 예산 → 장비(한 번에) → 스킬 QWER(하나씩)
  // 순서의 가이드 팝업을 그 위에 띄운다. 요약 패널은 뒤에 그대로 있어(닫으면 폴백) 동기화된다.
  if (this.tower && P && this._towerWizard) this._towerWizard();
};

GAME.DraftScene.prototype._buildPanel = function () {
  // 세로 폰은 목록을 전부 펼칠 높이가 없다 → 요약 행 + 팝업(js/scenes/draft-mobile.js)
  if (GAME.CONFIG.PORTRAIT) return this._buildPanelCompact();
  var C = GAME.CONFIG.COLORS;
  var self = this;
  var P = GAME.CONFIG.PORTRAIT;
  var S = this.split;
  var px = S.panelX, pw = S.panelW;
  var y = S.panelY;

  function row(h, gap) { var r = { y: y, h: h, cy: y + h / 2, bottom: y + h }; y += h + (gap === undefined ? 8 : gap); return r; }
  function cols(n, gap, left, width) {
    gap = gap === undefined ? 8 : gap;
    left = left === undefined ? px : left;
    width = width === undefined ? pw : width;
    var w = Math.floor((width - gap * (n - 1)) / n);
    var out = [];
    for (var i = 0; i < n; i++) { var x = left + i * (w + gap); out.push({ x: x, w: w, cx: x + w / 2 }); }
    return out;
  }

  // 예산
  var rBudget = row(P ? 21 : 24, 4);
  this.budgetText = GAME.UI.label(this, px, rBudget.y, '', P ? 17 : 17, C.text, 0);
  var rWarn = row(P ? 16 : 18, 5);
  this.warnText = GAME.UI.label(this, px, rWarn.y, '', P ? 13 : 13, C.warn, 0);

  // 영웅 카드. 탑에서는 로비에서 이미 고른 뒤 AI 가 그 영웅의 카운터로 배치를 짰으므로
  // 여기서 바꾸면 '영웅을 보고 배치한다'는 규칙이 깨진다 → 잠근다.
  GAME.UI.label(this, px, y,
    this.heroLocked ? '영웅 (탑 로비에서 선택 — 적이 이 영웅에 맞춰 배치했습니다)' : '영웅',
    P ? 13 : 13, this.heroLocked ? C.warn : C.textDim, 0).setWordWrapWidth(pw);
  y += P ? 16 : 18;
  var rHero = row(P ? 62 : 78, 7);
  this.heroCards = [];
  var hc = cols(3, 8);
  for (var i = 0; i < GAME.HERO_ORDER.length; i++) {
    (function (key, idx) {
      var h = GAME.HEROES[key], c = hc[idx];
      var rect = self.add.rectangle(c.cx, rHero.cy, c.w, rHero.h, GAME.UI.COL.surfaceAlt).setStrokeStyle(1, GAME.UI.COL.border);
      if (!self.heroLocked) {
        rect.setInteractive({ useHandCursor: true });
        rect.on('pointerdown', function () {
          self.heroKey = key;
          GAME.Store.set('asymgame.lastHero', key);
          self.picks = GAME.defaultSkillPicks(); self._trim(); self.redraw();
        });
      } else if (key !== self.heroKey) {
        rect.setAlpha(0.35);
      }
      GAME.UI.label(self, c.cx, rHero.y + 6, h.name, P ? 17 : 16, C.text, 0.5).setOrigin(0.5, 0);
      GAME.UI.label(self, c.cx, rHero.y + (P ? 27 : 28), h.trait, P ? 13 : 12, C.textDim, 0.5).setOrigin(0.5, 0);
      GAME.UI.label(self, c.cx, rHero.bottom - 18, '비용 ' + h.cost, P ? 13 : 12, C.accent, 0.5).setOrigin(0.5, 0);
      self.heroCards.push({ key: key, rect: rect });
    })(GAME.HERO_ORDER[i], i);
  }

  // 능력치 막대
  GAME.UI.label(this, px, y, '능력치', P ? 13 : 13, C.textDim, 0);
  y += P ? 17 : 18;
  this.statRows = [];
  var barW = Math.min(180, pw - 150);
  for (var s = 0; s < GAME.HERO_STAT_DEFS.length; s++) {
    var rs = row(P ? 15 : 19, 1);
    this.statRows.push({
      name: GAME.UI.label(this, px + 58, rs.cy, GAME.HERO_STAT_DEFS[s].key, P ? 13 : 12, C.textDim, 1).setOrigin(1, 0.5),
      val: GAME.UI.label(this, px + 68 + barW, rs.cy, '', P ? 13 : 12, C.text, 0).setOrigin(0, 0.5),
      cy: rs.cy
    });
  }
  this.statBarGeo = { x: px + 66, w: barW };
  y += 8;

  // 아이템
  GAME.UI.label(this, px, y, '장비', P ? 13 : 13, C.textDim, 0);
  y += P ? 17 : 18;
  this.itemCells = [];
  var labelW = P ? 32 : 54;
  for (var k = 0; k < GAME.ITEM_SLOTS.length; k++) {
    (function (slot) {
      var ri = row(P ? 26 : 32, 3);
      GAME.UI.label(self, px, ri.cy, slot.name, P ? 13 : 13, C.textDim, 0).setOrigin(0, 0.5);
      var ic = cols(3, 5, px + labelW, pw - labelW);
      var list = GAME.ITEMS[slot.key];
      for (var m = 0; m < list.length; m++) {
        (function (item, ci) {
          var c = ic[ci];
          var rect = self.add.rectangle(c.cx, ri.cy, c.w, ri.h, GAME.UI.COL.surfaceAlt).setStrokeStyle(1, GAME.UI.COL.border);
          rect.setInteractive({ useHandCursor: true });
          rect.on('pointerover', function () { self.hoverItem = item; self.redraw(); });
          rect.on('pointerout', function () { if (self.hoverItem === item) { self.hoverItem = null; self.redraw(); } });
          rect.on('pointerdown', function () { self.hoverItem = item; self._toggleItem(slot.key, item); });
          GAME.UI.label(self, c.cx, ri.cy, item.name + ' ' + item.cost, P ? 13 : 12, C.text, 0.5)
            .setOrigin(0.5).setWordWrapWidth(c.w - 4);
          self.itemCells.push({ slot: slot.key, item: item, rect: rect });
        })(list[m], m);
      }
    })(GAME.ITEM_SLOTS[k]);
  }
  y += 8;

  // 스킬 — 슬롯 탭(QWER) + 그 슬롯의 3가지 선택지
  GAME.UI.label(this, px, y, '스킬 (슬롯을 고르고 아래에서 선택)', P ? 13 : 13, C.textDim, 0);
  y += P ? 17 : 18;
  var rTabs = row(P ? 26 : 32, 4);
  this.slotTabs = [];
  var tc = cols(4, 6);
  for (var t = 0; t < GAME.SKILL_SLOTS.length; t++) {
    (function (slot, idx) {
      var c = tc[idx];
      var rect = self.add.rectangle(c.cx, rTabs.cy, c.w, rTabs.h, GAME.UI.COL.surfaceAlt).setStrokeStyle(1, GAME.UI.COL.border);
      rect.setInteractive({ useHandCursor: true });
      rect.on('pointerdown', function () { self.editSlot = slot; self.redraw(); });
      var lbl = GAME.UI.label(self, c.cx, rTabs.cy, slot, P ? 15 : 15, C.accent, 0.5).setOrigin(0.5);
      self.slotTabs.push({ slot: slot, rect: rect, label: lbl });
    })(GAME.SKILL_SLOTS[t], t);
  }

  this.optionRows = [];
  for (var o = 0; o < 3; o++) {
    var ro = row(P ? 34 : 46, 4);
    var rect = this.add.rectangle(px + pw / 2, ro.cy, pw, ro.h, GAME.UI.COL.surfaceAlt).setStrokeStyle(1, GAME.UI.COL.border);
    rect.setInteractive({ useHandCursor: true });
    (function (idx) {
      rect.on('pointerdown', function () { self.picks[self.editSlot] = idx; self.redraw(); });
    })(o);
    this.optionRows.push({
      rect: rect,
      name: GAME.UI.label(this, px + 10, ro.y + 4, '', P ? 15 : 14, C.text, 0),
      desc: GAME.UI.label(this, px + 10, ro.y + (P ? 22 : 24), '', P ? 13 : 11, C.textDim, 0)
        .setWordWrapWidth(pw - 20)
    });
  }
  y += 6;

  this.noteText = GAME.UI.label(this, px, y, '', P ? 13 : 12, C.textDim, 0).setWordWrapWidth(pw);
  y += P ? 40 : 24;

  var rAct = row(P ? 42 : 48, 0);
  this._rAct = rAct;
  // 세로: 왼쪽 '뒤로' + 오른쪽 '전투 시작' 을 한 줄에 나눠 담는다
  this._backW = P ? Math.round(pw * 0.34) : 0;
  var startW = P ? (pw - this._backW - 8) : Math.min(pw, 300);
  var startCx = P ? (px + this._backW + 8 + startW / 2) : (px + pw / 2);
  GAME.UI.button(this, startCx, rAct.cy, startW, rAct.h, '전투 시작', function () {
    self._start();
  }, { fill: GAME.UI.COL.panelTeal, line: GAME.CONFIG.COLORS.controller, hover: GAME.UI.COL.panelTealHi, color: C.accent, fontSize: P ? 17 : 20 });

  this.panelEnd = y;
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
  var Z = GAME.CONFIG.ZONE_CONTROLLER;
  this.scene.start('Battle', {
    formationId: this.formation.id,
    heroKey: this.heroKey,
    items: this.items,
    picks: this.picks,
    tower: this.tower,
    startPos: { x: Z.x + Z.w / 2, y: Z.y + Z.h * 0.55 }
  });
};

GAME.DraftScene.prototype._skillDesc = function (sk) {
  var cd = '쿨 ' + (sk.cooldown / 1000).toFixed(0) + '초';
  var t = '';
  switch (sk.type) {
    case 'dash': t = (sk.damage ? (sk.backward ? '물러나며 ' : '') + '돌진 + 경로 피해 ' + sk.damage : '순간 이동 ' + sk.dist); break;
    case 'aoeSelf': t = '주변 ' + sk.radius + ' 광역 ' + sk.damage + (sk.knockback ? ' + 넉백' : '') + (sk.rootMs ? ' + 속박' : ''); break;
    case 'aoeTarget': t = '지정 위치 ' + (sk.repeat || 1) + '회 폭격, 회당 ' + sk.damage; break;
    case 'projectile': t = (sk.burst ? sk.burst + '연사 ' : '') + (sk.pierce ? '관통 ' : '') + '투사체 ' + sk.damage; break;
    case 'strike': t = '단일 강타 ' + sk.damage + (sk.rootMs ? ' + 속박' : '') + (sk.lifestealMul > 1 ? ' (흡혈 강화)' : ''); break;
    case 'buff': t = [sk.shield ? '보호막 ' + sk.shield : null, sk.armorAdd ? '방어력 +' + sk.armorAdd : null,
                      sk.damageMul ? '공격력 x' + sk.damageMul : null, sk.healNow ? '즉시 회복 ' + sk.healNow : null,
                      sk.speedMul && sk.speedMul !== 1 ? '이동 x' + sk.speedMul : null].filter(Boolean).join(', '); break;
    case 'pull': t = (sk.coneDeg >= 360 ? '주변' : '전방') + ' 적을 끌어당김 + ' + sk.damage; break;
    case 'aura': t = '주변 ' + sk.radius + ' 지속 피해 ' + sk.dps + '/초, ' + (sk.duration / 1000) + '초'; break;
    case 'trap': t = '설치 ' + sk.damage + ' + 속박'; break;
  }
  return t + ' · ' + cd;
};

GAME.DraftScene.prototype.redraw = function () {
  if (this.compact) return this._redrawCompact();
  var C = GAME.CONFIG.COLORS;
  var g = this.g;
  var S = this.split;
  var i;
  g.clear();

  this.drawScout();

  // ── 오른쪽(또는 아래): 설정 패널 ──
  // hero 는 drawScout() 로 옮겨갔으므로 여기서 다시 잡는다
  var hero = GAME.HEROES[this.heroKey];
  var st = GAME.Items.applyTo(hero, this.items);

  for (i = 0; i < this.heroCards.length; i++) {
    var on = this.heroCards[i].key === this.heroKey;
    this.heroCards[i].rect.setStrokeStyle(on ? 2 : 1, on ? C.controller : GAME.UI.COL.border);
    this.heroCards[i].rect.setFillStyle(on ? GAME.UI.COL.panelTeal : GAME.UI.COL.surfaceAlt);
  }

  var live = { damage: st.damage, cooldown: hero.cooldown, hp: st.hp, armor: st.armor, speed: st.speed };
  for (i = 0; i < this.statRows.length; i++) {
    var sd = GAME.HERO_STAT_DEFS[i];
    var frac = Math.max(0, Math.min(1, sd.get(live) / sd.max));
    var bh = GAME.CONFIG.PORTRAIT ? 15 : 14;
    g.fillStyle(GAME.UI.COL.surfaceHi, 1);
    g.fillRect(this.statBarGeo.x, this.statRows[i].cy - bh / 2, this.statBarGeo.w, bh);
    g.fillStyle(C.controller, 1);
    g.fillRect(this.statBarGeo.x, this.statRows[i].cy - bh / 2, this.statBarGeo.w * frac, bh);
    g.lineStyle(1, GAME.UI.COL.border, 1);
    g.strokeRect(this.statBarGeo.x, this.statRows[i].cy - bh / 2, this.statBarGeo.w, bh);
    this.statRows[i].val.setText(sd.fmt(live));
  }

  for (i = 0; i < this.itemCells.length; i++) {
    var cell = this.itemCells[i];
    var picked = this.items[cell.slot] === cell.item.key;
    var afford = picked || (this.spent() + cell.item.cost <= this.budget);
    cell.rect.setStrokeStyle(picked ? 2 : 1, picked ? C.controller : GAME.UI.COL.border);
    cell.rect.setFillStyle(picked ? GAME.UI.COL.panelTeal : (afford ? GAME.UI.COL.surfaceAlt : GAME.UI.COL.bg));
  }

  // 스킬 탭 + 선택지
  for (i = 0; i < this.slotTabs.length; i++) {
    var tab = this.slotTabs[i];
    var active = tab.slot === this.editSlot;
    tab.rect.setStrokeStyle(active ? 2 : 1, active ? C.controller : GAME.UI.COL.border);
    tab.rect.setFillStyle(active ? GAME.UI.COL.panelTeal : GAME.UI.COL.surfaceAlt);
    var pickIdx = this.picks[tab.slot] || 0;
    // 세로 화면은 탭 폭이 ~98px 이라 스킬 이름까지 넣으면 옆 탭을 침범한다.
    // 고른 스킬 이름은 아래 선택지 목록에 이미 강조돼 있으므로 슬롯 글자만 남긴다.
    tab.label.setText(GAME.CONFIG.PORTRAIT
      ? tab.slot
      : tab.slot + ' · ' + hero.skillOptions[tab.slot][pickIdx].name);
  }

  var opts = hero.skillOptions[this.editSlot];
  for (i = 0; i < this.optionRows.length; i++) {
    var r = this.optionRows[i];
    if (i >= opts.length) { r.rect.setVisible(false); r.name.setText(''); r.desc.setText(''); continue; }
    r.rect.setVisible(true);
    var sel = (this.picks[this.editSlot] || 0) === i;
    r.rect.setStrokeStyle(sel ? 2 : 1, sel ? C.controller : GAME.UI.COL.border);
    r.rect.setFillStyle(sel ? GAME.UI.COL.panelTeal : GAME.UI.COL.surfaceAlt);
    r.name.setText((sel ? '● ' : '○ ') + opts[i].name);
    r.desc.setText(this._skillDesc(opts[i]));
  }

  var note = hero.desc;
  if (this.hoverItem) note = this.hoverItem.name + ' — ' + this.hoverItem.note;
  if (st.lifesteal > 0) note += '   (흡혈 ' + Math.round(st.lifesteal * 100) + '%)';
  this.noteText.setText(note);

  this.budgetText.setText('예산  ' + this.spent() + ' / ' + this.budget +
    '  (남음 ' + (this.budget - this.spent()) + ')   ·   상대와 동일');
};


// 정찰도(상대 진형 축소도) — 세로 compact 패널도 이걸 그대로 쓴다
GAME.DraftScene.prototype.drawScout = function () {
  var C = GAME.CONFIG.COLORS;
  var g = this.g;
  var S = this.split;
  var i;
  // ── 왼쪽(또는 위): 상대 진형 정찰 화면 ──
  // 아레나 전체를 이 사각형에 맞춰 축소해 그린다. 세로 비율을 유지한다.
  var A = GAME.CONFIG.ARENA;
  var sc = Math.min(S.scoutW / A.w, S.scoutH / A.h);
  var dw = A.w * sc, dh = A.h * sc;
  var ox = S.scoutX + (S.scoutW - dw) / 2;
  var oy = S.scoutY + (S.scoutH - dh) / 2;

  g.fillStyle(C.arenaFill, 1);
  g.fillRect(ox, oy, dw, dh);
  // 전략가/컨트롤러 구역
  var zs = GAME.CONFIG.ZONE_STRATEGIST, zc = GAME.CONFIG.ZONE_CONTROLLER;
  g.fillStyle(C.zoneStrategist, 0.5);
  g.fillRect(ox, oy + (zs.y - A.y) * sc, dw, zs.h * sc);
  g.fillStyle(C.zoneController, 0.5);
  g.fillRect(ox, oy + (zc.y - A.y) * sc, dw, zc.h * sc);
  g.lineStyle(1, C.arenaLine, 0.35);
  for (var gy = A.y + 100; gy < A.bottom; gy += 100) {
    g.lineBetween(ox, oy + (gy - A.y) * sc, ox + dw, oy + (gy - A.y) * sc);
  }
  g.lineStyle(2, C.arenaLine, 1);
  g.strokeRect(ox, oy, dw, dh);

  // 적 유닛 (축소 좌표, 위에서 아래 순서로)
  var enemies = this.formation.units.map(function (u) {
    var w = GAME.Formations.toWorld(u);
    return { type: u.type, x: w.x, y: w.y };
  }).sort(function (a, b) { return a.y - b.y; });

  for (i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    var def = GAME.UNITS[e.type];
    if (!def) continue;
    var sx = ox + (e.x - A.x) * sc, sy = oy + (e.y - A.y) * sc;
    // 지원 유닛 범위
    var FX = GAME.UI.FX;
    if (def.healRadius) { g.lineStyle(1, FX.healRing, 0.35); g.strokeCircle(sx, sy, def.healRadius * sc); }
    if (def.buffRadius) { g.lineStyle(1, FX.buffRing, 0.35); g.strokeCircle(sx, sy, def.buffRadius * sc); }
    if (def.isMine) { g.lineStyle(1, FX.mineRing, 0.6); g.strokeCircle(sx, sy, def.triggerRadius * sc); }
    if (def.intercept) { g.lineStyle(1, FX.guardRing, 0.4); g.strokeCircle(sx, sy, def.intercept * sc); }
    GAME.UI.drawUnitFlat(g, def, sx, sy, C.strategist, 1, Math.max(0.62, sc * 1.15));
    if (!GAME.isNonTarget(def)) { g.lineStyle(1.5, FX.targetRing, 0.9); g.strokeCircle(sx, sy, def.radius * sc + 4); }
  }

  // 내 시작 위치 표시
  var Z = GAME.CONFIG.ZONE_CONTROLLER;
  var hx = ox + (Z.x + Z.w / 2 - A.x) * sc, hy = oy + (Z.y + Z.h * 0.55 - A.y) * sc;
  var hero = GAME.HEROES[this.heroKey];
  g.lineStyle(1.5, C.controller, 0.6);
  g.strokeCircle(hx, hy, hero.range * sc);
  // art 를 같이 넘겨야 한다 — 영웅과 유닛이 shape 를 공유해서, 빼먹으면
  // 정찰도의 내 영웅이 엉뚱한 유닛 모양으로 그려진다.
  GAME.UI.drawUnitFlat(g, { radius: hero.radius, shape: hero.shape, art: hero.art },
    hx, hy, C.controller, 1, Math.max(0.7, sc * 1.2));

  // 적 구성 요약
  var counts = {};
  this.formation.units.forEach(function (u) { counts[u.type] = (counts[u.type] || 0) + 1; });
  var summary = Object.keys(counts).map(function (k) {
    return (GAME.UNITS[k] ? GAME.UNITS[k].name : k) + ' ' + counts[k];
  }).join(' · ');
  if (!this.scoutSummary) {
    this.scoutSummary = GAME.UI.label(this, S.scoutX, S.scoutY + S.scoutH + 6, '',
      GAME.CONFIG.PORTRAIT ? 13 : 12, C.textDim, 0).setWordWrapWidth(S.scoutW);
  }
  this.scoutSummary.setText('적 ' + this.formation.units.length + '기 — ' + summary);

};
