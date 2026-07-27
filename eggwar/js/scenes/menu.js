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

  GAME.UI.label(this, W / 2, u * 12, '🥚 EGG WAR', P ? 28 : 50, C.text, 0.5);
  GAME.UI.label(this, W / 2, u * 18, '계란 부족 비대칭 실시간 대전', P ? 15 : 18, C.textDim, 0.5);

  var me = GAME.Account.current();
  var rec = GAME.Score.of(me);
  var rank = GAME.Score.rankOf(me, 'all');
  GAME.UI.label(this, W / 2, u * 25,
    me + '  ·  누적 ' + rec.total.toLocaleString('ko-KR') + '점  ·  격파 ' + rec.rounds + '회' +
    (rank ? '  ·  ' + rank + '위' : ''),
    P ? 15 : 15, C.accent, 0.5);

  var bw = Math.min(W - 60, 440);

  var tower = GAME.Tower.get();

  GAME.UI.button(this, W / 2, u * 34, bw, u * 7, '🗼 통곡의 탑  ' + tower.floor + '층', function () {
    self.scene.start('Tower');
  }, { fill: 0x3a2a1c, line: 0xf0a86a, hover: 0x4a3524, color: C.warn, fontSize: P ? 17 : 21 });
  GAME.UI.label(this, W / 2, u * 39.5,
    'AI가 당신을 분석해 배치를 짠다 — ' + (GAME.Tower.EARLY_FLOORS + 1) + '층부터는 조작 없이 못 이긴다' +
    (tower.best ? '   (최고 ' + tower.best + '층)' : ''),
    P ? 13 : 13, C.textDim, 0.5).setWordWrapWidth(W - 40);

  GAME.UI.button(this, W / 2, u * 48, bw, u * 6.5, '컨트롤러로 도전', function () {
    self.scene.start('Select');
  }, { fill: 0x1c3a34, line: 0x35d0a5, hover: 0x235045, color: C.accent, fontSize: P ? 17 : 20 });
  GAME.UI.label(this, W / 2, u * 53, '저장된 진형을 격파 — 깰수록 그 진형이 강해진다',
    P ? 13 : 13, C.textDim, 0.5).setWordWrapWidth(W - 40);

  GAME.UI.button(this, W / 2, u * 61, bw, u * 6.5, '전략가로 방어전', function () {
    self.scene.start('Build');
  }, { fill: 0x2a2440, line: 0x9b8cf0, hover: 0x372f52, color: C.accentAlt, fontSize: P ? 17 : 20 });
  GAME.UI.label(this, W / 2, u * 66, '진형을 짜고 AI 공격을 막아라 — 막을수록 AI가 강해진다',
    P ? 13 : 13, C.textDim, 0.5).setWordWrapWidth(W - 40);

  var rc = GAME.Layout.cols(GAME.isAdmin ? 3 : 2, {
    gap: 10, width: bw, left: (W - bw) / 2, pad: 0
  });
  GAME.UI.button(this, rc[0].cx, u * 74, rc[0].w, u * 5.5, '🏆 랭킹', function () {
    self.scene.start('Rank', { scope: 'live' });
  }, { fontSize: P ? 15 : 15 });
  GAME.UI.button(this, rc[1].cx, u * 74, rc[1].w, u * 5.5, '닉네임 변경', function () {
    GAME.Account.logout();
    self.scene.start('Login');
  }, { fontSize: P ? 15 : 14 });
  if (GAME.isAdmin) {
    GAME.UI.button(this, rc[2].cx, u * 74, rc[2].w, u * 5.5, '닉네임 관리', function () {
      self.scene.start('Admin', { page: 0 });
    }, { fontSize: P ? 15 : 14, line: 0xf0a86a, color: '#f0a86a' });
  }

  var hint = GAME.isTouch
    ? '조작  ─  한 번 탭: 이동하며 교전   |   두 번 탭: 이동만   |   스킬 버튼 → 위치 탭'
    : '조작  ─  우클릭: 이동 / 적 클릭 공격   |   방향키: 직접 이동   |   Q W E R: 스킬   |   F: 물약';
  GAME.UI.label(this, W / 2, u * 84, hint, P ? 13 : 13, C.textDim, 0.5)
    .setAlign('center').setWordWrapWidth(W - 40);

  GAME.UI.label(this, W / 2, u * 92,
    P ? '논타겟은 피할 수 있고, 타겟은 피할 수 없다.'
      : '논타겟 공격은 피할 수 있고, 타겟 공격은 피할 수 없다. 그것이 이 게임의 균형이다.',
    P ? 13 : 13, '#6f6f88', 0.5).setWordWrapWidth(W - 40);

  GAME.UI.label(this, W - 12, H - 10, GAME.VERSION || '', 12, '#6f6f88', 1).setOrigin(1, 1);
};
