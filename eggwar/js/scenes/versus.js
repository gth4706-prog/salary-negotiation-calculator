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
//  폰 가로 (820×390)
//  ---------------------------------------------------------------------------
//  왼쪽 = '나'(트로피·기지·방어 기록), 오른쪽 = '상대 고르기', 아래 = 이동 버튼.
//  세로로 쌓지 않고 가로로 펼친다 — 높이 390 에는 카드 하나와 버튼 두 개면 끝이다.
// ═══════════════════════════════════════════════════════════════════════════
GAME.VersusScene.prototype._createPhone = function () {
  var C = GAME.CONFIG.COLORS, UI = GAME.UI;
  var W = GAME.CONFIG.WIDTH;
  var self = this;
  var PAD = 12, VER_W = 52, GAP = 12;
  var BAR_Y = 322, BTN_H = 56;

  var fresh = GAME.Arena.simulateOfflineDefenses();
  var rec = GAME.Arena.get();
  var league = GAME.Arena.leagueOf(rec.trophy);
  var next = GAME.Arena.nextLeague(rec.trophy);
  var base = GAME.Arena.baseFormation();
  var saved = GAME.Formations.loadSaved();

  var lx = PAD, lw = 384;
  var rx = lx + lw + GAP, rw = W - PAD - rx;

  UI.text(this, lx, 4, '대전', { size: 'heading', color: C.text });
  UI.text(this, lx + 76, 12, '내가 없는 동안에도 내 진형이 싸운다',
    { size: 'micro', color: C.textDim });

  // ── 왼쪽: 나 ────────────────────────────────────────────────────────────
  var y = 34;
  this.add.rectangle(lx, y, lw, 74, UI.COL.surfaceAlt).setStrokeStyle(2, league.hex).setOrigin(0, 0);
  UI.text(this, lx + 12, y + 6, '🏅 ' + rec.trophy + '  트로피', { size: 'title', color: C.text });
  UI.text(this, lx + lw - 12, y + 12,
    league.name + (next ? ('  →  ' + next.name + ' 까지 ' + (next.at - rec.trophy)) : '  (최고 리그)'),
    { size: 'micro', color: C.accent, origin: 1, originY: 0, wrap: lw - 190, align: 'right' });
  UI.text(this, lx + 12, y + 48,
    '공격 ' + rec.attackWins + '/' + rec.attacks + '  ·  방어 ' + rec.defenseWins + '/' + rec.defenses +
    '  ·  최고 ' + rec.best, { size: 'micro', color: C.textDim });
  y += 82;

  var baseTxt = base
    ? ('내 기지 — ' + base.name + ' (' + base.units.length + '기)')
    : (saved.length ? '내 기지가 없습니다 — 배치도를 기지로 지정하세요'
                    : '내 기지가 없습니다 — 먼저 배치도를 만드세요');
  var bl = UI.text(this, lx, y, baseTxt,
    { size: 'micro', color: base ? C.accentAlt : C.warn, wrap: lw });
  y = bl.y + bl.height + 6;

  if (fresh.length) {
    var won = fresh.filter(function (e) { return e.defended; }).length;
    var fl = UI.text(this, lx, y,
      '자리를 비운 사이 ' + fresh.length + '번 공격받아 ' + won + '번 막아냈습니다',
      { size: 'micro', color: UI.TXT.crit, wrap: lw });
    y = fl.y + fl.height + 6;
  }

  if (rec.log.length) {
    UI.text(this, lx, y, '방어 기록', { size: 'micro', color: C.text });
    y += 22;
    rec.log.slice(0, 3).forEach(function (e) {
      if (y + 20 > BAR_Y - 6) return;
      UI.text(self, lx, y, (e.defended ? '🛡 막아냄' : '💥 뚫림') + '  ' + e.attacker +
        '  🏅' + e.attackerTrophy + '  ' + (e.delta >= 0 ? '+' : '') + e.delta,
        { size: 'micro', color: e.defended ? C.accent : UI.TXT.danger, wrap: lw });
      y += 21;
    });
    GAME.Arena.markLogSeen();
  }

  // ── 오른쪽: 상대 고르기 ─────────────────────────────────────────────────
  UI.text(this, rx, 34, '상대 고르기', { size: 'micro', color: C.text });
  var opps = GAME.Arena.findOpponents(3);
  var oy = 56, oGap = 6;
  var oh = Math.floor((BAR_Y - 6 - oy - oGap * 2) / 3);
  opps.forEach(function (o, i) {
    var f = o.formation;
    var ry = oy + i * (oh + oGap);
    var b = UI.button(self, rx + rw / 2, ry + oh / 2, rw, oh, '', function () {
      GAME.Arena.pendingOpponent = { formationId: f.id, trophy: o.trophy };
      self.scene.start('Draft', { formationId: f.id, versus: true });
    }, { fill: UI.COL.panelTeal, line: C.controller, hover: UI.COL.panelTealHi,
         color: C.accent, fontSize: 'micro' });
    var wr = GAME.Formations.winRate(f.id);
    b.text.setText(f.name + '   🏅' + o.trophy + '\n' +
      f.units.length + '기 · 예산 ' + GAME.Formations.budgetOf(f) +
      (wr === null ? '' : (' · 방어승률 ' + wr + '%')) +
      '\n+' + GAME.Arena.gainFor(rec.trophy, o.trophy) + ' / -' + GAME.Arena.lossFor(rec.trophy, o.trophy));
    b.text.setAlign('center');
  });

  // ── 아래 버튼 줄 ────────────────────────────────────────────────────────
  var slots = (!base && saved.length) ? 3 : 2;
  var total = W - PAD - VER_W - PAD;
  var bw = Math.floor((total - 8 * (slots - 1)) / slots);
  var bx = function (i) { return PAD + i * (bw + 8) + bw / 2; };
  var si = 0;
  UI.button(this, bx(si++), BAR_Y + BTN_H / 2, bw, BTN_H, '← 메뉴', function () {
    self.scene.start('Menu');
  }, { fontSize: 'buttonSm' });
  UI.button(this, bx(si++), BAR_Y + BTN_H / 2, bw, BTN_H,
    base ? '기지 바꾸기 / 새 배치' : '배치도 만들어 기지 삼기', function () {
      self.scene.start('Build', { pickBase: true });
    }, { fill: UI.COL.panelPurple, line: C.strategist, hover: UI.COL.panelPurpleHi,
         color: C.accentAlt, fontSize: 'buttonSm' });
  if (slots === 3) {
    UI.button(this, bx(si++), BAR_Y + BTN_H / 2, bw, BTN_H, '가장 최근 배치도를 기지로', function () {
      GAME.Arena.setBase(saved[saved.length - 1].id);
      self.scene.restart();
    }, { fill: UI.COL.panelAmber, line: UI.COL.focus, hover: UI.COL.panelAmberHi,
         color: C.warn, fontSize: 'buttonSm' });
  }
};
