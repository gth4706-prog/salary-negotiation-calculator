window.GAME = window.GAME || {};

// 랭킹. 실시간(최근 1시간) / 주간(7일) / 전체 누적.
// 서버(Worker)가 살아 있으면 전역 랭킹을, 아니면 로컬 기록을 보여준다.
// 어느 쪽인지 화면에 정확히 표시한다 — 로컬인데 '전체'라고 하면 거짓이 된다.
GAME.RankScene = function () {
  Phaser.Scene.call(this, { key: 'Rank' });
};
GAME.RankScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.RankScene.prototype.constructor = GAME.RankScene;

GAME.RankScene.prototype.init = function (data) {
  this.scope = (data && data.scope) || 'live';
  this.rowObjects = [];
};

GAME.RankScene.prototype.create = function () {
  var C = GAME.CONFIG.COLORS;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var P = GAME.CONFIG.PORTRAIT;
  var self = this;

  this.cameras.main.setBackgroundColor(C.bg);

  // 폰 가로: 한 열로 쌓으면 3줄밖에 안 들어간다. 머리를 한 줄로 접고 목록을 2열로.
  if (GAME.CONFIG.PHONE) { this._buildPhone(); return; }

  GAME.UI.label(this, W / 2, P ? 22 : 34, '랭킹', P ? 26 : 34, C.text, 0.5);
  this.scopeLabel = GAME.UI.label(this, W / 2, P ? 52 : 74,
    GAME.Api.enabled() ? '서버 확인 중…' : GAME.Score.scopeNote(),
    P ? 13 : 12, C.textDim, 0.5).setWordWrapWidth(W - 40);

  var tabs = [{ k: 'live', n: '실시간 (1시간)' }, { k: 'week', n: '주간 (7일)' }, { k: 'all', n: '전체' }];
  var tw = Math.min(W - 24, 560);
  var tc = GAME.Layout.cols(3, { gap: 8, width: tw, left: (W - tw) / 2, pad: 0 });
  for (var i = 0; i < tabs.length; i++) {
    (function (t, idx) {
      var b = GAME.UI.button(self, tc[idx].cx, P ? 90 : 112, tc[idx].w, GAME.UI.BTN_H_SM || 52, t.n, function () {
        self.scene.start('Rank', { scope: t.k });
      }, { fontSize: P ? 15 : 14 });
      if (t.k === self.scope) {
        b.rect.setStrokeStyle(2, GAME.CONFIG.COLORS.controller); b.rect.setFillStyle(GAME.UI.COL.panelTeal);
        b.text.setColor(C.accent);
      }
    })(tabs[i], i);
  }

  // 420 폭에 [순위·닉네임·탑·격파·점수] 5열은 안 들어간다.
  // 레퍼런스 두 게임 모두 목록을 "정체 한 줄 + 부연 한 줄"로 나눈다 —
  // 22줄이 안 읽히는 것보다 9줄이 읽히는 게 낫다(리더보드는 상위권이 전부다).
  this.geo = {
    top: P ? 140 : 152,
    rowH: GAME.UI.RANK_ROW_H + 6,
    pad: P ? 16 : 60
  };
  this.geo.maxRows = Math.max(3, Math.floor((H - this.geo.top - (P ? 96 : 110)) / this.geo.rowH));

  // 먼저 로컬 기록으로 그린다(서버 응답이 오면 교체된다)
  this._renderRows(GAME.Score.board(this.scope), false);

  if (GAME.Api.enabled()) {
    GAME.Api.board(this.scope).then(function (res) {
      if (!self.scene.isActive()) return;
      self.scopeLabel.setText(GAME.Score.scopeNote(true));
      self._renderRows((res && res.rows) || [], true);
    }).catch(function () {
      if (!self.scene.isActive()) return;
      self.scopeLabel.setText(GAME.Score.scopeNote(false));
    });
  }

  var me = GAME.Account.current();
  var myRec = GAME.Score.of(me);
  var myRank = GAME.Score.rankOf(me, this.scope);
  // 버튼 줄 **위쪽 끝**을 기준으로 아래에서 위로 자란다. 고정 오프셋(H-74)으로 두면
  // 문구가 2줄이 되는 순간 버튼을 파고들었다(실측 세로 420×900, 겹침 2건).
  var btnH0 = GAME.UI.BTN_H_SM || 52;
  GAME.UI.label(this, W / 2, H - (P ? 28 : 36) - btnH0 / 2 - 8,
    me ? ('내 기록 — ' + me + ' · 누적 ' + myRec.total.toLocaleString('ko-KR') + '점 · 격파 ' +
          myRec.rounds + '회 · 최고 ' + myRec.best.toLocaleString('ko-KR') +
          (myRec.towerBest ? ' · 탑 ' + myRec.towerBest + '층' : '') +
          (myRank ? ' · 이번 순위 ' + myRank + '위' : ''))
       : '로그인하지 않았습니다',
    P ? 13 : 14, C.text, 0.5).setWordWrapWidth(W - 40).setOrigin(0.5, 1);

  var bw = Math.min(W - 24, 420);
  var bc = GAME.Layout.cols(2, { gap: 10, width: bw, left: (W - bw) / 2, pad: 0 });
  GAME.UI.button(this, bc[0].cx, H - (P ? 28 : 36), bc[0].w, GAME.UI.BTN_H_SM || 52, '← 메뉴', function () {
    self.scene.start('Menu');
  }, { fontSize: P ? 17 : 16 });
  GAME.UI.button(this, bc[1].cx, H - (P ? 28 : 36), bc[1].w, GAME.UI.BTN_H_SM || 52, '닉네임 바꾸기', function () {
    GAME.Account.logout();
    self.scene.start('Login');
  }, { fontSize: P ? 15 : 15 });
};

// ── 폰 가로 (820×390) ────────────────────────────────────────────────────
GAME.RankScene.prototype._buildPhone = function () {
  var C = GAME.CONFIG.COLORS;
  var UI = GAME.UI;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var self = this;
  var PAD = 16;

  var title = UI.label(this, PAD, 8, '랭킹', 26, C.text, 0).setOrigin(0, 0);

  var tabs = [{ k: 'live', n: '실시간 (1시간)' }, { k: 'week', n: '주간 (7일)' }, { k: 'all', n: '전체' }];
  var tw = 420;
  var tc = GAME.Layout.cols(3, { gap: 8, width: tw, left: W - PAD - tw, pad: 0 });
  for (var i = 0; i < tabs.length; i++) {
    (function (t, idx) {
      var b = UI.button(self, tc[idx].cx, 34, tc[idx].w, 55, t.n, function () {
        self.scene.start('Rank', { scope: t.k });
      }, { fontSize: 16 });
      if (t.k === self.scope) {
        b.rect.setStrokeStyle(2, GAME.CONFIG.COLORS.controller);
        b.rect.setFillStyle(UI.COL.panelTeal);
        b.text.setColor(C.accent);
      }
    })(tabs[i], i);
  }

  // 안내문은 제목 오른쪽 빈자리에 붙인다 — 탭 왼쪽 끝까지만 쓴다.
  var noteX = PAD + title.width + 14;
  this.scopeLabel = UI.label(this, noteX, 18,
    GAME.Api.enabled() ? '서버 확인 중…' : GAME.Score.scopeNote(), 15, C.textDim, 0)
    .setWordWrapWidth(Math.max(80, (W - PAD - tw) - 12 - noteX));

  // ── 목록: 2열 × N행 ──
  var colW = Math.floor((W - PAD * 2 - 14) / 2);
  this.geo = {
    top: 70, rowH: 62, h: 56, pad: PAD, colW: colW,
    colX: [PAD, PAD + colW + 14], perCol: 0
  };
  var bottomTop = H - 12 - 55;
  this.geo.perCol = Math.max(1, Math.floor((bottomTop - 8 - this.geo.top + 6) / this.geo.rowH));
  this.geo.maxRows = this.geo.perCol * 2;

  this._renderRows(GAME.Score.board(this.scope), false);

  if (GAME.Api.enabled()) {
    GAME.Api.board(this.scope).then(function (res) {
      if (!self.scene.isActive()) return;
      self.scopeLabel.setText(GAME.Score.scopeNote(true));
      self._renderRows((res && res.rows) || [], true);
    }).catch(function () {
      if (!self.scene.isActive()) return;
      self.scopeLabel.setText(GAME.Score.scopeNote(false));
    });
  }

  // ── 바닥 줄: 버튼 둘 + 내 기록 ──
  var by = bottomTop + 55 / 2;
  UI.button(this, PAD + 75, by, 150, 55, '← 메뉴', function () {
    self.scene.start('Menu');
  }, { fontSize: 16 });
  UI.button(this, PAD + 150 + 10 + 85, by, 170, 55, '닉네임 바꾸기', function () {
    GAME.Account.logout();
    self.scene.start('Login');
  }, { fontSize: 16 });

  var me = GAME.Account.current();
  var myRec = GAME.Score.of(me);
  var myRank = GAME.Score.rankOf(me, this.scope);
  // 폭 442px 에 전체 문장(≈620px)은 안 들어간다 → 한 줄에 들어가게 줄인다.
  UI.label(this, W - PAD, by, me
    ? ('내 기록 · 누적 ' + myRec.total.toLocaleString('ko-KR') + '점 · 격파 ' + myRec.rounds + '회' +
       (myRec.towerBest ? (' · 탑 ' + myRec.towerBest + '층') : '') +
       (myRank ? (' · ' + myRank + '위') : ''))
    : '로그인하지 않았습니다',
    15, C.text, 1).setOrigin(1, 0.5).setAlign('right')
    .setWordWrapWidth(W - PAD - (PAD + 150 + 10 + 170 + 16));
};

GAME.RankScene.prototype._renderRows = function (rows, fromServer) {
  var C = GAME.CONFIG.COLORS;
  var W = GAME.CONFIG.WIDTH;
  var P = GAME.CONFIG.PORTRAIT;
  var g = this.geo;
  var me = GAME.Account.current();

  if (GAME.CONFIG.PHONE) { this._renderRowsPhone(rows); return; }

  // 이전에 그린 행을 지운다 (서버 응답으로 교체될 수 있으므로)
  for (var d = 0; d < this.rowObjects.length; d++) this.rowObjects[d].destroy();
  this.rowObjects = [];

  var keep = this.rowObjects;
  function add(o) { keep.push(o); return o; }

  if (!rows.length) {
    add(GAME.UI.label(this, W / 2, g.top + 40,
      '아직 기록이 없습니다.\n컨트롤러로 진형을 격파하거나 전략가로 방어에 성공하면 점수가 쌓입니다.',
      P ? 15 : 15, C.textDim, 0.5).setAlign('center').setLineSpacing(8));
    return;
  }

  // 2줄 행 — 1줄에 정체(순위·닉네임·점수), 2줄에 부연(탑·격파).
  // 열 x 를 손으로 배분할 필요가 없어져 "오른쪽 정렬 열이 닉네임을 침범"하는
  // 고질적 겹침이 구조적으로 사라진다(폭 계산은 UI.rankRow 안에서 실측으로 한다).
  var rowW = W - g.pad * 2;

  add(GAME.UI.label(this, g.pad + 4, g.top - 22, '순위 · 닉네임', 'micro', C.textDim, 0));
  add(GAME.UI.label(this, W - g.pad - 4, g.top - 22, '점수', 'micro', C.textDim, 1).setOrigin(1, 0));

  for (var i = 0; i < Math.min(rows.length, g.maxRows); i++) {
    var r = rows[i];
    var row = GAME.UI.rankRow(this, g.pad, g.top + i * g.rowH, rowW, {
      rank: i + 1,
      id: r.id,
      score: r.score || 0,
      rounds: r.rounds || 0,
      tower: r.tower || 0,        // 서버에 탑 칸이 없으면 0 → 2줄에서 그냥 빠진다
      mine: r.id === me
    });
    for (var q = 0; q < row.objs.length; q++) keep.push(row.objs[q]);
  }

  if (rows.length > g.maxRows) {
    add(GAME.UI.label(this, W / 2, g.top + g.maxRows * g.rowH + 4,
      '외 ' + (rows.length - g.maxRows) + '명 더 있음', 'micro', C.textDim, 0.5));
  }
};

// 폰 가로 — 같은 2줄 행을 **2열**로 흘린다. 1~N 위가 왼쪽 열, 그 다음이 오른쪽 열이라
// 위에서 아래로 읽는 순서가 유지된다(행 우선으로 채우면 1위 옆에 2위가 와 순위가 꼬인다).
GAME.RankScene.prototype._renderRowsPhone = function (rows) {
  var C = GAME.CONFIG.COLORS;
  var UI = GAME.UI;
  var W = GAME.CONFIG.WIDTH;
  var g = this.geo;
  var me = GAME.Account.current();

  for (var d = 0; d < this.rowObjects.length; d++) this.rowObjects[d].destroy();
  this.rowObjects = [];
  var keep = this.rowObjects;

  if (!rows.length) {
    keep.push(UI.label(this, W / 2, g.top + 50,
      '아직 기록이 없습니다.\n컨트롤러로 진형을 격파하거나 전략가로 방어에 성공하면 점수가 쌓입니다.',
      15, C.textDim, 0.5).setAlign('center').setLineSpacing(8));
    return;
  }

  var n = Math.min(rows.length, g.maxRows);
  for (var i = 0; i < n; i++) {
    var col = i < g.perCol ? 0 : 1;
    var idx = i - col * g.perCol;
    var r = rows[i];
    var row = UI.rankRow(this, g.colX[col], g.top + idx * g.rowH, g.colW, {
      rank: i + 1,
      id: r.id,
      score: r.score || 0,
      rounds: r.rounds || 0,
      tower: r.tower || 0,
      mine: r.id === me
    }, { height: g.h });
    for (var q = 0; q < row.objs.length; q++) keep.push(row.objs[q]);
  }
};
