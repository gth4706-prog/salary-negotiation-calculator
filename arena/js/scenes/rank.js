window.GAME = window.GAME || {};

// 랭킹. 실시간(최근 1시간) / 주간(7일) / 전체 누적.
// 지금은 로컬 저장이라 '이 브라우저에 기록된 ID' 범위임을 화면에 정확히 밝힌다.
GAME.RankScene = function () {
  Phaser.Scene.call(this, { key: 'Rank' });
};
GAME.RankScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.RankScene.prototype.constructor = GAME.RankScene;

GAME.RankScene.prototype.init = function (data) {
  this.scope = (data && data.scope) || 'live';
};

GAME.RankScene.prototype.create = function () {
  var C = GAME.CONFIG.COLORS;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var P = GAME.CONFIG.PORTRAIT;
  var self = this;

  this.cameras.main.setBackgroundColor(C.bg);

  GAME.UI.label(this, W / 2, P ? 22 : 34, '랭킹', P ? 24 : 34, C.text, 0.5);
  GAME.UI.label(this, W / 2, P ? 52 : 74, GAME.Score.scopeNote(), P ? 10 : 12, C.textDim, 0.5)
    .setWordWrapWidth(W - 40);

  var tabs = [{ k: 'live', n: '실시간 (1시간)' }, { k: 'week', n: '주간 (7일)' }, { k: 'all', n: '전체' }];
  var tc = GAME.Layout.cols(3, { gap: 8, width: Math.min(W - 24, 560), left: (W - Math.min(W - 24, 560)) / 2, pad: 0 });
  this.tabBtns = [];
  for (var i = 0; i < tabs.length; i++) {
    (function (t, idx) {
      var b = GAME.UI.button(self, tc[idx].cx, P ? 84 : 112, tc[idx].w, P ? 36 : 42, t.n, function () {
        self.scene.start('Rank', { scope: t.k });
      }, { fontSize: P ? 12 : 14 });
      if (t.k === self.scope) {
        b.rect.setStrokeStyle(2, 0x35d0a5); b.rect.setFillStyle(0x1c3a34);
        b.text.setColor(C.accent);
      }
      self.tabBtns.push(b);
    })(tabs[i], i);
  }

  var me = GAME.Account.current();
  var rows = GAME.Score.board(this.scope);
  var myRank = GAME.Score.rankOf(me, this.scope);

  var top = P ? 118 : 152;
  var rowH = P ? 34 : 40;
  var avail = H - top - (P ? 96 : 110);
  var maxRows = Math.max(3, Math.floor(avail / rowH));

  if (!rows.length) {
    GAME.UI.label(this, W / 2, top + 40,
      '아직 기록이 없습니다.\n컨트롤러로 진형을 격파하거나 전략가로 방어에 성공하면 점수가 쌓입니다.',
      P ? 12 : 15, C.textDim, 0.5).setAlign('center').setLineSpacing(8);
  }

  // 헤더
  if (rows.length) {
    var pad = P ? 14 : 60;
    GAME.UI.label(this, pad + 8, top - 18, '순위', P ? 10 : 12, C.textDim, 0);
    GAME.UI.label(this, pad + 58, top - 18, '닉네임', P ? 10 : 12, C.textDim, 0);
    GAME.UI.label(this, W - pad - 96, top - 18, '격파', P ? 10 : 12, C.textDim, 1).setOrigin(1, 0);
    GAME.UI.label(this, W - pad - 8, top - 18, '점수', P ? 10 : 12, C.textDim, 1).setOrigin(1, 0);
  }

  for (i = 0; i < Math.min(rows.length, maxRows); i++) {
    var r = rows[i];
    var y = top + i * rowH;
    var pad2 = P ? 14 : 60;
    var mine = r.id === me;
    this.add.rectangle(W / 2, y + rowH / 2 - 3, W - pad2 * 2, rowH - 6,
      mine ? 0x1c3a34 : 0x22222f).setStrokeStyle(1, mine ? 0x35d0a5 : 0x3a3a52);
    var medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : String(i + 1);
    GAME.UI.label(this, pad2 + 8, y + rowH / 2 - 3, medal, P ? 13 : 15, C.text, 0).setOrigin(0, 0.5);
    GAME.UI.label(this, pad2 + 58, y + rowH / 2 - 3, r.id, P ? 13 : 16,
      mine ? C.accent : C.text, 0).setOrigin(0, 0.5);
    GAME.UI.label(this, W - pad2 - 96, y + rowH / 2 - 3, String(r.rounds), P ? 12 : 14, C.textDim, 1).setOrigin(1, 0.5);
    GAME.UI.label(this, W - pad2 - 8, y + rowH / 2 - 3, r.score.toLocaleString('ko-KR'),
      P ? 13 : 16, C.crit, 1).setOrigin(1, 0.5);
  }

  var myRec = GAME.Score.of(me);
  GAME.UI.label(this, W / 2, H - (P ? 74 : 84),
    me ? ('내 기록 — ' + me + ' · 누적 ' + myRec.total.toLocaleString('ko-KR') + '점 · 격파 ' +
          myRec.rounds + '회 · 최고 ' + myRec.best.toLocaleString('ko-KR') +
          (myRank ? ' · 이번 순위 ' + myRank + '위' : ''))
       : '로그인하지 않았습니다',
    P ? 11 : 14, C.text, 0.5).setWordWrapWidth(W - 40);

  var bc = GAME.Layout.cols(2, { gap: 10, width: Math.min(W - 24, 420), left: (W - Math.min(W - 24, 420)) / 2, pad: 0 });
  GAME.UI.button(this, bc[0].cx, H - (P ? 30 : 36), bc[0].w, P ? 40 : 44, '← 메뉴', function () {
    self.scene.start('Menu');
  }, { fontSize: P ? 14 : 16 });
  GAME.UI.button(this, bc[1].cx, H - (P ? 30 : 36), bc[1].w, P ? 40 : 44, '닉네임 바꾸기', function () {
    GAME.Account.logout();
    self.scene.start('Login');
  }, { fontSize: P ? 13 : 15 });
};
