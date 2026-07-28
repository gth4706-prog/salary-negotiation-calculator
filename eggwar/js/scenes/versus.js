window.GAME = window.GAME || {};

// 대전 로비 — 비동기 PvP 의 집. 여기서 세 가지를 한다.
//   1) 내 트로피/리그를 본다 (성장 지표)
//   2) 상대를 골라 공격한다 (트로피 획득)
//   3) 내가 없는 동안 당한 방어 기록을 본다 (돌아올 이유)
//
// 근거: docs/PERSONAS.md — "겨룰 상대가 없음"이 최대 이탈 사유(11/50),
// 숙련 유저 잔존 0%. 이 화면이 그 구멍을 메운다.
GAME.VersusScene = function () {
  Phaser.Scene.call(this, { key: 'Versus' });
};
GAME.VersusScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.VersusScene.prototype.constructor = GAME.VersusScene;

// ── 폰 가로(820×390) 전용 좌표 — 배치 화면(build.js)과 같은 3단 구성 ───────────
//  0..56    상단 바 : 🏅 트로피 · 리그 · 전적 · [☰]
//  62..320  본문    : **상대 카드 3장을 가로로 편다.** 이 화면의 주인공이다.
//                     카드마다 그 배치도의 미니 진형도가 들어간다 — 이름·숫자만으로는
//                     "어느 쪽이 만만한가"를 고를 수 없다(그게 이 화면의 유일한 결정이다).
//  326..382 하단 줄 : 내 기지 요약 + [기지 만들기/바꾸기]
GAME.VersusScene.PHONE = {
  PAD: 10,
  // 바 60 · 버튼 56 → 아이폰 SE(FIT 0.813)에서 화면 45.5px (48 이면 39.0px 로 미달)
  BAR_H: 60,
  BTN_H: 56, BTN_CY: 30,
  MENU_CX: 782, MENU_W: 56,
  BODY_TOP: 66, BODY_BOTTOM: 320,
  CARD_GAP: 10,
  FOOT_Y: 326, FOOT_H: 56,
  VER_W: 62
};

// 씬 재진입 때 캐시한 표시객체는 이미 파괴돼 있다 — 참조를 반드시 비운다.
GAME.VersusScene.prototype.init = function () {
  this.sheet = null;
};

GAME.VersusScene.prototype.create = function () {
  var C = GAME.CONFIG.COLORS;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var P = GAME.CONFIG.PORTRAIT;
  var self = this;
  var u = H / 100;

  if (!GAME.Account.current()) { this.scene.start('Login'); return; }

  this.cameras.main.setBackgroundColor(C.bg);
  GAME.Iso.setMode('default');

  // 폰 가로(820×390)는 세로로 쌓을 높이가 없다 — 한 열로 흘리면 버튼끼리 겹친다
  // (실측: 겹침 11건). 좌우 2열 + 아래 버튼 줄로 펼친다.
  if (GAME.CONFIG.PHONE) return this._createPhone();

  // 들어올 때 한 번: 자리 비운 동안의 방어전을 정산한다
  var fresh = GAME.Arena.simulateOfflineDefenses();
  var rec = GAME.Arena.get();
  var league = GAME.Arena.leagueOf(rec.trophy);
  var next = GAME.Arena.nextLeague(rec.trophy);

  var y = u * 4;
  function stack(label, gap) {
    y = label.y + label.height + (gap === undefined ? u * 1.4 : gap);
    return label;
  }

  stack(GAME.UI.label(this, W / 2, y, '대전', P ? 26 : 38, C.text, 0.5).setOrigin(0.5, 0), u * 0.5);
  stack(GAME.UI.label(this, W / 2, y, '내가 없는 동안에도 내 진형이 싸운다',
    P ? 13 : 15, C.textDim, 0.5).setOrigin(0.5, 0), u * 1.4);

  // ── 트로피 + 리그 ──
  var tw = Math.min(W - 30, 460);
  var card = this.add.rectangle(W / 2, y, tw, u * 13, GAME.UI.COL.surfaceAlt)
    .setStrokeStyle(2, league.hex).setOrigin(0.5, 0);
  GAME.UI.label(this, W / 2, y + u * 1.6, '🏅 ' + rec.trophy + '  트로피',
    P ? 24 : 30, C.text, 0.5).setOrigin(0.5, 0);
  var lgLine = league.name + (next ? ('   →   ' + next.name + ' 까지 ' + (next.at - rec.trophy)) : '   (최고 리그)');
  GAME.UI.label(this, W / 2, y + u * 7.4, lgLine, P ? 14 : 16, C.accent, 0.5).setOrigin(0.5, 0);
  GAME.UI.label(this, W / 2, y + u * 10.4,
    '공격 ' + rec.attackWins + '/' + rec.attacks + '   ·   방어 ' + rec.defenseWins + '/' + rec.defenses +
    '   ·   최고 ' + rec.best,
    P ? 13 : 14, C.textDim, 0.5).setOrigin(0.5, 0);
  y += u * 13 + u * 1.6;

  // ── 내 기지 ──
  var base = GAME.Arena.baseFormation();
  var saved = GAME.Formations.loadSaved();
  var baseTxt = base
    ? ('내 기지 — ' + base.name + ' (' + base.units.length + '기)')
    : (saved.length ? '내 기지가 없습니다 — 배치도를 기지로 지정하세요'
                    : '내 기지가 없습니다 — 먼저 배치도를 만드세요');
  stack(GAME.UI.label(this, W / 2, y, baseTxt, P ? 14 : 16,
    base ? C.accentAlt : C.warn, 0.5).setOrigin(0.5, 0).setWordWrapWidth(W - 40), u * 0.8);

  if (fresh.length) {
    var won = fresh.filter(function (e) { return e.defended; }).length;
    stack(GAME.UI.label(this, W / 2, y,
      '자리를 비운 사이 ' + fresh.length + '번 공격받았습니다 — ' + won + '번 막아냈습니다',
      P ? 13 : 14, GAME.UI.TXT.crit, 0.5).setOrigin(0.5, 0).setWordWrapWidth(W - 40), u * 1.2);
  } else {
    y += u * 0.6;
  }

  // ── 상대 목록 ──
  var opps = GAME.Arena.findOpponents(3);
  stack(GAME.UI.label(this, W / 2, y, '상대 고르기', P ? 15 : 17, C.text, 0.5).setOrigin(0.5, 0), u * 1.0);

  var rowH = Math.max(GAME.UI.BTN_H || 58, u * 8);
  opps.forEach(function (o, i) {
    var f = o.formation;
    var ry = y + i * (rowH + 8);
    var b = GAME.UI.button(self, W / 2, ry + rowH / 2, tw, rowH, '', function () {
      GAME.Arena.pendingOpponent = { formationId: f.id, trophy: o.trophy };
      self.scene.start('Draft', { formationId: f.id, versus: true });
    }, { fill: GAME.UI.COL.panelTeal, line: GAME.CONFIG.COLORS.controller,
         hover: GAME.UI.COL.panelTealHi, color: C.accent, fontSize: P ? 15 : 16 });
    var wr = GAME.Formations.winRate(f.id);
    b.text.setText(f.name + '   🏅' + o.trophy + '\n' +
      f.units.length + '기 · 예산 ' + GAME.Formations.budgetOf(f) +
      (wr === null ? '' : (' · 방어승률 ' + wr + '%')) +
      '   →  +' + GAME.Arena.gainFor(rec.trophy, o.trophy) + ' / -' + GAME.Arena.lossFor(rec.trophy, o.trophy));
    b.text.setAlign('center');
  });
  y += opps.length * (rowH + 8) + u * 0.8;

  // ── 방어 기록 ──
  if (rec.log.length) {
    stack(GAME.UI.label(this, W / 2, y, '방어 기록', P ? 15 : 17, C.text, 0.5).setOrigin(0.5, 0), u * 0.9);
    rec.log.slice(0, 3).forEach(function (e) {
      var line = (e.defended ? '🛡 막아냄' : '💥 뚫림') + '   ' + e.attacker +
        '  🏅' + e.attackerTrophy + '   ' + (e.delta >= 0 ? '+' : '') + e.delta;
      var lb = GAME.UI.label(self, W / 2, y, line, P ? 13 : 14,
        e.defended ? C.accent : GAME.UI.TXT.danger, 0.5).setOrigin(0.5, 0);
      y = lb.y + lb.height + 6;
    });
    GAME.Arena.markLogSeen();
    y += u * 0.8;
  }

  // ── 버튼 ──
  var bw = Math.min(W - 30, 420);
  var bh = u * 6.4;
  var gap = u * 1.2;
  var byBottom = H - u * 2;

  GAME.UI.button(this, W / 2, byBottom - bh * 0.5, bw, bh, '← 메뉴', function () {
    self.scene.start('Menu');
  }, { fontSize: P ? 15 : 15 });

  GAME.UI.button(this, W / 2, byBottom - bh * 1.5 - gap, bw, bh,
    base ? '기지 바꾸기 / 새 배치' : '배치도 만들어 기지 삼기', function () {
      self.scene.start('Build', { pickBase: true });
    }, { fill: GAME.UI.COL.panelPurple, line: GAME.CONFIG.COLORS.strategist,
         hover: GAME.UI.COL.panelPurpleHi, color: C.accentAlt, fontSize: P ? 15 : 16 });

  // 저장된 배치도가 있는데 기지가 없으면, 가장 최근 것을 기지로 삼는 지름길을 준다
  if (!base && saved.length) {
    GAME.UI.button(this, W / 2, byBottom - bh * 2.5 - gap * 2, bw, bh,
      '가장 최근 배치도를 기지로', function () {
        GAME.Arena.setBase(saved[saved.length - 1].id);
        self.scene.restart();
      }, { fill: GAME.UI.COL.panelAmber, line: GAME.UI.COL.focus,
           hover: GAME.UI.COL.panelAmberHi, color: C.warn, fontSize: P ? 15 : 16 });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
//  폰 가로 (820×390) — 배치 화면과 같은 문법(상단 얇은 바 / 큰 본문 / 하단 한 줄)
//  ---------------------------------------------------------------------------
//  예전 화면은 왼쪽 절반을 '나'(트로피·기지·방어 기록 6줄)가 먹고 상대는 오른쪽
//  1/3 에 눌린 얇은 띠 3개였다. 그런데 이 화면에서 유저가 내리는 결정은 **누구를
//  칠 것인가** 하나뿐이다 → 상대 카드가 본문 전체를 쓰게 뒤집었다.
//  · 나에 대한 정보는 상단 바 한 줄(트로피·리그·전적)로 압축
//  · 방어 기록·메뉴는 ☰ 시트로
//  · 카드 안에 **미니 진형도**를 그린다. '10기 · 예산 160' 만으로는 고를 수 없다.
// ═══════════════════════════════════════════════════════════════════════════
GAME.VersusScene.prototype._createPhone = function () {
  var C = GAME.CONFIG.COLORS, UI = GAME.UI;
  var W = GAME.CONFIG.WIDTH;
  var K = GAME.VersusScene.PHONE;
  var self = this;

  var fresh = GAME.Arena.simulateOfflineDefenses();
  var rec = GAME.Arena.get();
  var league = GAME.Arena.leagueOf(rec.trophy);
  var next = GAME.Arena.nextLeague(rec.trophy);
  var base = GAME.Arena.baseFormation();
  var saved = GAME.Formations.loadSaved();
  this.phFresh = fresh;

  // 판은 글자보다 먼저 만든다(나중에 만들면 글자를 덮는다 — ui-theme.chip 에서 겪은 문제).
  var g = this.add.graphics();
  g.fillStyle(UI.COL.surface, 1);
  g.fillRect(0, 0, W, K.BAR_H);
  g.lineStyle(1, UI.COL.border, 1);
  g.lineBetween(0, K.BAR_H - 0.5, W, K.BAR_H - 0.5);
  g.fillStyle(UI.COL.surface, 1);
  g.fillRoundedRect(4, K.FOOT_Y, W - 8 - K.VER_W, K.FOOT_H, 12);
  g.lineStyle(1, UI.COL.border, 1);
  g.strokeRoundedRect(4.5, K.FOOT_Y + 0.5, W - 9 - K.VER_W, K.FOOT_H - 1, 12);
  // 리그 색 — 트로피 옆 짧은 띠 하나로 지금 리그를 못박는다
  g.fillStyle(league.hex, 1);
  g.fillRoundedRect(K.PAD, 14, 5, 32, 2.5);

  // ── 상단 바 ─────────────────────────────────────────────────────────────
  var tro = UI.text(this, K.PAD + 13, K.BTN_CY, '🏅 ' + rec.trophy,
    { size: 'title', color: C.text, origin: 0, originY: 0.5 });
  var lgX = tro.x + tro.width + 14;
  UI.text(this, lgX, K.BTN_CY,
    league.name + (next ? ('  →  ' + next.name + ' 까지 ' + (next.at - rec.trophy)) : '  (최고 리그)'),
    { size: 'caption', color: C.accent, origin: 0, originY: 0.5 });
  UI.text(this, K.MENU_CX - K.MENU_W / 2 - 12, K.BTN_CY,
    '공격 ' + rec.attackWins + '/' + rec.attacks + '  ·  방어 ' + rec.defenseWins + '/' +
    rec.defenses + '  ·  최고 ' + rec.best,
    { size: 'micro', color: C.textDim, origin: 1, originY: 0.5 });
  UI.button(this, K.MENU_CX, K.BTN_CY, K.MENU_W, K.BTN_H, '☰',
    function () { self._toggleSheet(); }, { fontSize: 'button', hitPad: 6 });

  // ── 본문: 상대 카드 3장 ─────────────────────────────────────────────────
  var opps = GAME.Arena.findOpponents(3);
  var n = Math.max(1, opps.length);
  var cw = Math.floor((W - K.PAD * 2 - K.CARD_GAP * (n - 1)) / n);
  var ch = K.BODY_BOTTOM - K.BODY_TOP;

  // ① 카드(버튼)를 먼저 전부 만든다. UI.button 은 자기 Graphics 를 만들므로
  //    미니 진형도를 먼저 그리면 **카드 면이 그 위를 덮는다**(실제로 그렇게 됐다).
  var cards = opps.map(function (o, i) {
    var f = o.formation;
    var cx0 = K.PAD + i * (cw + K.CARD_GAP);
    var b = UI.button(self, cx0 + cw / 2, K.BODY_TOP + ch / 2, cw, ch, '', function () {
      GAME.Arena.pendingOpponent = { formationId: f.id, trophy: o.trophy };
      self.scene.start('Draft', { formationId: f.id, versus: true });
    }, { fill: UI.COL.panelTeal, line: C.controller, hover: UI.COL.panelTealHi,
         color: C.accent, fontSize: 'micro', noExpand: true });
    return { o: o, f: f, x: cx0, btn: b };
  });

  // ② 그 위에 미니 진형도 + 글자
  var mapG = this.add.graphics();
  var ZY = GAME.CONFIG.ZONE_STRATEGIST.h / GAME.CONFIG.ARENA.h;   // 0.30
  cards.forEach(function (card) {
    var f = card.f, o = card.o, cx0 = card.x;
    // 카드 안 글자는 **그 버튼의 라벨**이다 — `__btnLabel` 로 그 사실을 표시해
    // 겹침 감사에서 '버튼-자기라벨' 쌍으로 제외되게 한다(ui-theme.js 의 규약).
    function lbl(t) { t.__btnLabel = card.btn.rect; return t; }

    lbl(UI.text(self, cx0 + 12, K.BODY_TOP + 8, UI.ellipsize(f.name, 8),
      { size: 'subhead', color: C.accent }));
    lbl(UI.text(self, cx0 + cw - 12, K.BODY_TOP + 12, '🏅' + o.trophy,
      { size: 'micro', color: UI.TXT.crit, origin: 1, originY: 0 }));

    // 미니 진형도 — 전략가 구역(아레나 위 30%)만 잘라 카드 폭에 편다.
    var mx = cx0 + 10, my = K.BODY_TOP + 40, mw = cw - 20, mh = 150;
    mapG.fillStyle(C.arenaFill, 1);
    mapG.fillRoundedRect(mx, my, mw, mh, 8);
    mapG.lineStyle(1, C.arenaLine, 1);
    mapG.strokeRoundedRect(mx + 0.5, my + 0.5, mw - 1, mh - 1, 8);
    for (var u = 0; u < f.units.length; u++) {
      var un = f.units[u];
      var def = GAME.UNITS[un.type];
      if (!def) continue;
      var ux = mx + 14 + Math.max(0, Math.min(1, un.nx)) * (mw - 28);
      var uy = my + 26 + Math.max(0, Math.min(1, un.ny / (ZY + 0.04))) * (mh - 44);
      UI.drawUnitFlat(mapG, def, ux, uy, C.strategist, 1, 0.8, Math.PI / 2);
    }

    var wr = GAME.Formations.winRate(f.id);
    lbl(UI.text(self, cx0 + 12, my + mh + 8,
      f.units.length + '기  ·  예산 ' + GAME.Formations.budgetOf(f) +
      (wr === null ? '' : ('  ·  방어승률 ' + wr + '%')),
      { size: 'micro', color: C.textMid }));
    lbl(UI.text(self, cx0 + 12, my + mh + 30,
      '이기면 +' + GAME.Arena.gainFor(rec.trophy, o.trophy) +
      '   ·   지면 -' + GAME.Arena.lossFor(rec.trophy, o.trophy),
      { size: 'micro', color: C.text }));
  });

  if (!opps.length) {
    UI.text(this, W / 2, K.BODY_TOP + ch / 2, '겨룰 상대가 없습니다 — 배치도를 먼저 만드세요',
      { size: 'body', color: C.textDim, origin: 0.5 });
  }

  // ── 하단 줄: 내 기지 + 주 행동 ──────────────────────────────────────────
  var rightEdge = W - K.PAD - K.VER_W;
  var actW = 190, actCx = rightEdge - actW / 2;
  var shortcut = (!base && saved.length);
  var scW = 176, scCx = actCx - actW / 2 - 8 - scW / 2;

  var baseTxt = base
    ? ('내 기지 — ' + base.name + ' (' + base.units.length + '기)')
    : (saved.length ? '내 기지가 없습니다 — 배치도를 기지로 지정하세요'
                    : '내 기지가 없습니다 — 먼저 배치도를 만드세요');
  var subTxt;
  if (fresh.length) {
    var won = fresh.filter(function (e) { return e.defended; }).length;
    subTxt = '자리를 비운 사이 ' + fresh.length + '번 공격받아 ' + won + '번 막아냈습니다';
  } else if (rec.log.length) {
    subTxt = '방어 기록 ' + rec.log.length + '건 — ☰ 에서 확인';
  } else {
    subTxt = '내가 없는 동안에도 내 기지가 싸운다';
  }
  var textLimit = (shortcut ? (scCx - scW / 2) : (actCx - actW / 2)) - 8 - 18;
  this._fit(UI.text(this, 18, K.FOOT_Y + 8, '',
    { size: 'micro', color: base ? C.accentAlt : C.warn }), baseTxt, textLimit - 18);
  this._fit(UI.text(this, 18, K.FOOT_Y + 30, '',
    { size: 'micro', color: fresh.length ? UI.TXT.crit : C.textDim }), subTxt, textLimit - 18);

  UI.button(this, actCx, K.FOOT_Y + K.FOOT_H / 2, actW, K.FOOT_H,
    base ? '기지 바꾸기' : '기지 만들기', function () {
      self.scene.start('Build', { pickBase: true });
    }, { fill: UI.COL.panelPurple, line: C.strategist, hover: UI.COL.panelPurpleHi,
         color: C.accentAlt, fontSize: 'buttonSm', hitPad: 6 });
  if (shortcut) {
    UI.button(this, scCx, K.FOOT_Y + K.FOOT_H / 2, scW, K.FOOT_H, '최근 배치도를 기지로', function () {
      GAME.Arena.setBase(saved[saved.length - 1].id);
      self.scene.restart();
    }, { fill: UI.COL.panelAmber, line: UI.COL.focus, hover: UI.COL.panelAmberHi,
         color: C.warn, fontSize: 'micro', hitPad: 6 });
  }

  this.events.on('shutdown', function () { self._closeSheet(); });
};

// 한 줄에 맞을 때까지 뒤에서 잘라낸다(문구·폰트가 바뀌어도 옆 칸을 침범하지 않는다).
GAME.VersusScene.prototype._fit = function (txt, s, maxW) {
  if (!txt) return txt;
  txt.setText(s);
  var guard = 0;
  while (txt.width > maxW && guard++ < 60) {
    var t = txt.text;
    txt.setText(t.slice(0, Math.max(4, t.length - 2 - (t.slice(-1) === '…' ? 1 : 0))) + '…');
  }
  return txt;
};

// ═══════════════════════════════════════════════════════════════════════════
//  ☰ 시트 (폰 가로 전용) — 방어 기록 · 메뉴
// ═══════════════════════════════════════════════════════════════════════════
GAME.VersusScene.prototype._toggleSheet = function () {
  if (this.sheet) this._closeSheet(); else this._openSheet();
};

GAME.VersusScene.prototype._closeSheet = function () {
  if (!this.sheet) return;
  var o = this.sheet;
  this.sheet = null;
  for (var i = 0; i < o.length; i++) if (o[i] && o[i].destroy) o[i].destroy();
};

GAME.VersusScene.prototype._openSheet = function () {
  var self = this;
  var C = GAME.CONFIG.COLORS, UI = GAME.UI;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var rec = GAME.Arena.get();
  this._closeSheet();

  var objs = [];
  // 기록 줄 수에 맞춰 높이를 잡는다 — 고정 높이로 두면 기록이 적을 때 가운데가 텅 빈다.
  var rows = Math.max(1, Math.min(4, rec.log.length));
  var pw = 600, px0 = Math.round((W - pw) / 2), phh = 44 + rows * 24 + 82;
  var py0 = Math.round((H - phh) / 2);
  var bw = Math.floor((pw - 40 - 12) / 2), bh = 56;

  var veil = this.add.rectangle(W / 2, H / 2, W, H, UI.COL.bg, 0.74).setDepth(900);
  veil.setInteractive();
  veil.on('pointerdown', function () { self._closeSheet(); });
  objs.push(veil);
  objs.push(UI.panel(this, px0, py0, pw, phh, { level: 1 }).setDepth(901));

  objs.push(UI.text(this, W / 2, py0 + 10, '방어 기록',
    { size: 'subhead', color: C.text, origin: 0.5, originY: 0 }).setDepth(902));

  var ly = py0 + 44;
  if (rec.log.length) {
    rec.log.slice(0, 4).forEach(function (e) {
      objs.push(UI.text(self, px0 + 24, ly,
        (e.defended ? '🛡 막아냄' : '💥 뚫림') + '   ' + e.attacker + '   🏅' + e.attackerTrophy +
        '   ' + (e.delta >= 0 ? '+' : '') + e.delta,
        { size: 'micro', color: e.defended ? C.accent : UI.TXT.danger }).setDepth(902));
      ly += 24;
    });
    // 목록을 실제로 보여준 지금이 '봤다'로 표시할 시점이다(메뉴 배지가 이 값을 읽는다).
    GAME.Arena.markLogSeen();
  } else {
    objs.push(UI.text(this, W / 2, ly, '아직 공격받은 기록이 없습니다',
      { size: 'micro', color: C.textDim, origin: 0.5, originY: 0 }).setDepth(902));
    ly += 24;
  }

  function mk(cx, cy, label, fn, opts) {
    var b = UI.button(self, cx, cy, bw, bh, label, fn, opts);
    b.setDepth(902);
    objs.push(b);
    return b;
  }
  var cy = py0 + phh - 40;
  mk(px0 + 20 + bw / 2, cy, '← 메뉴', function () {
    self._closeSheet(); self.scene.start('Menu');
  }, { fontSize: 'buttonSm' });
  mk(px0 + 20 + bw + 12 + bw / 2, cy, '닫기', function () { self._closeSheet(); },
    { fontSize: 'buttonSm' });

  this.sheet = objs;
};
