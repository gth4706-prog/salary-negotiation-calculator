window.GAME = window.GAME || {};

GAME.MenuScene = function () {
  Phaser.Scene.call(this, { key: 'Menu' });
};
GAME.MenuScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.MenuScene.prototype.constructor = GAME.MenuScene;

GAME.MenuScene.prototype.create = function () {
  var C = GAME.CONFIG.COLORS;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var P = GAME.CONFIG.PORTRAIT;
  var self = this;

  // 로그인하지 않았으면 로그인 화면으로 보낸다
  if (!GAME.Account.current()) { this.scene.start('Login'); return; }

  this.cameras.main.setBackgroundColor(C.bg);
  var u = H / 100;

  GAME.UI.label(this, W / 2, u * 12, '전략 vs 컨트롤', P ? 32 : 50, C.text, 0.5);
  GAME.UI.label(this, W / 2, u * 18, '한국군 비대칭 실시간 대전', P ? 13 : 18, C.textDim, 0.5);

  var me = GAME.Account.current();
  var rec = GAME.Score.of(me);
  var rank = GAME.Score.rankOf(me, 'all');
  GAME.UI.label(this, W / 2, u * 25,
    me + '  ·  누적 ' + rec.total.toLocaleString('ko-KR') + '점  ·  격파 ' + rec.rounds + '회' +
    (rank ? '  ·  ' + rank + '위' : ''),
    P ? 12 : 15, C.accent, 0.5);

  var bw = Math.min(W - 60, 440);

  GAME.UI.button(this, W / 2, u * 36, bw, u * 7.5, '컨트롤러로 도전', function () {
    self.scene.start('Select');
  }, { fill: 0x1c3a34, line: 0x35d0a5, hover: 0x235045, color: C.accent, fontSize: P ? 18 : 22 });
  GAME.UI.label(this, W / 2, u * 42, '영웅 1기로 진형을 격파하라 — 깰수록 그 진형이 강해진다',
    P ? 11 : 14, C.textDim, 0.5).setWordWrapWidth(W - 40);

  GAME.UI.button(this, W / 2, u * 51, bw, u * 7.5, '전략가로 방어전', function () {
    self.scene.start('Build');
  }, { fill: 0x2a2440, line: 0x9b8cf0, hover: 0x372f52, color: C.accentAlt, fontSize: P ? 18 : 22 });
  GAME.UI.label(this, W / 2, u * 57, '진형을 짜고 AI 공격을 막아라 — 막을수록 AI가 강해진다',
    P ? 11 : 14, C.textDim, 0.5).setWordWrapWidth(W - 40);

  var rc = GAME.Layout.cols(GAME.isAdmin ? 3 : 2, {
    gap: 10, width: bw, left: (W - bw) / 2, pad: 0
  });
  GAME.UI.button(this, rc[0].cx, u * 67, rc[0].w, u * 6, '🏆 랭킹', function () {
    self.scene.start('Rank', { scope: 'live' });
  }, { fontSize: P ? 14 : 16 });
  GAME.UI.button(this, rc[1].cx, u * 67, rc[1].w, u * 6, '닉네임 변경', function () {
    GAME.Account.logout();
    self.scene.start('Login');
  }, { fontSize: P ? 13 : 15 });
  if (GAME.isAdmin) {
    GAME.UI.button(this, rc[2].cx, u * 67, rc[2].w, u * 6, '닉네임 관리', function () {
      self.scene.start('Admin', { page: 0 });
    }, { fontSize: P ? 13 : 15, line: 0xf0a86a, color: '#f0a86a' });
  }

  var hint = GAME.isTouch
    ? '조작  ─  한 번 탭: 이동하며 교전   |   두 번 탭: 이동만\n스킬 버튼을 누른 뒤 위치를 탭하면 시전'
    : '조작  ─  우클릭: 이동 / 적 클릭 시 공격   |   방향키: 직접 이동\nQ W E R: 스킬   |   F: 물약   |   Space: 기본공격';
  GAME.UI.label(this, W / 2, u * 79, hint, P ? 11 : 14, C.textDim, 0.5)
    .setAlign('center').setLineSpacing(8).setWordWrapWidth(W - 40);

  GAME.UI.label(this, W / 2, u * 92,
    P ? '논타겟은 피할 수 있고, 타겟은 피할 수 없다.'
      : '논타겟 공격은 피할 수 있고, 타겟 공격은 피할 수 없다. 그것이 이 게임의 균형이다.',
    P ? 10 : 13, '#6f6f88', 0.5).setWordWrapWidth(W - 40);

  GAME.UI.label(this, W - 12, H - 10, GAME.VERSION || '', 12, '#6f6f88', 1).setOrigin(1, 1);
};
