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
        b.rect.setStrokeStyle(2, 0x35d0a5); b.rect.setFillStyle(0x1c3a34);
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
  GAME.UI.label(this, W / 2, H - (P ? 74 : 84),
    me ? ('내 기록 — ' + me + ' · 누적 ' + myRec.total.toLocaleString('ko-KR') + '점 · 격파 ' +
          myRec.rounds + '회 · 최고 ' + myRec.best.toLocaleString('ko-KR') +
          (myRec.towerBest ? ' · 탑 ' + myRec.towerBest + '층' : '') +
          (myRank ? ' · 이번 순위 ' + myRank + '위' : ''))
       : '로그인하지 않았습니다',
    P ? 13 : 14, C.text, 0.5).setWordWrapWidth(W - 40);

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

GAME.RankScene.prototype._renderRows = function (rows, fromServer) {
  var C = GAME.CONFIG.COLORS;
  var W = GAME.CONFIG.WIDTH;
  var P = GAME.CONFIG.PORTRAIT;
  var g = this.geo;
  var me = GAME.Account.current();

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
