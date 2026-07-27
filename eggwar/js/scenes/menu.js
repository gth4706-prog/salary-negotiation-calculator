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
  // 제목 밑 작은 장식 — 간판처럼 보이게. Graphics 라 글자 겹침에 영향이 없다.
  GAME.UI.titleRule(this, W / 2, u * 21, P ? 170 : 240);

  var me = GAME.Account.current();
  var rec = GAME.Score.of(me);
  var rank = GAME.Score.rankOf(me, 'all');
  GAME.UI.label(this, W / 2, u * 25,
    me + '  ·  누적 ' + rec.total.toLocaleString('ko-KR') + '점  ·  격파 ' + rec.rounds + '회' +
    (rank ? '  ·  ' + rank + '위' : ''),
    P ? 15 : 15, C.accent, 0.5);

  var bw = Math.min(W - 60, 440);

  var tower = GAME.Tower.get();

  var BH = (GAME.UI.BTN_H || 58) / u;      // 버튼 높이를 u 단위로
  GAME.UI.button(this, W / 2, u * 34, bw, u * BH, '🗼 통곡의 탑  ' + tower.floor + '층', function () {
    self.scene.start('Tower');
    // line 을 0xf0a86a 로 박아뒀더니 크림 배경에서 1.08:1 로 사라졌다 → focus 토큰(테마별 값)
  }, { fill: GAME.UI.COL.panelAmber, line: GAME.UI.COL.focus, hover: GAME.UI.COL.panelAmberHi, color: C.warn, fontSize: P ? 17 : 21 });
  // 설명문은 **위 기준(origin y=0)**으로 버튼 바로 아래에 붙인다.
  // 가운데 기준이면 두 줄이 될 때 위쪽 절반이 버튼을 파고든다.
  GAME.UI.label(this, W / 2, u * 34 + u * BH / 2 + 6,
    'AI가 당신을 분석해 배치를 짠다 — ' + (GAME.Tower.EARLY_FLOORS + 1) + '층부터는 조작 없이 못 이긴다' +
    (tower.best ? '   (최고 ' + tower.best + '층)' : ''),
    P ? 13 : 13, C.textDim, 0.5).setOrigin(0.5, 0).setWordWrapWidth(W - 40);

  GAME.UI.button(this, W / 2, u * 49, bw, u * BH, '컨트롤러로 도전', function () {
    self.scene.start('Select');
  }, { fill: GAME.UI.COL.panelTeal, line: GAME.CONFIG.COLORS.controller, hover: GAME.UI.COL.panelTealHi, color: C.accent, fontSize: P ? 17 : 20 });
  GAME.UI.label(this, W / 2, u * 49 + u * BH / 2 + 6, '저장된 진형을 격파 — 깰수록 그 진형이 강해진다',
    P ? 13 : 13, C.textDim, 0.5).setOrigin(0.5, 0).setWordWrapWidth(W - 40);

  GAME.UI.button(this, W / 2, u * 63, bw, u * BH, '전략가로 방어전', function () {
    self.scene.start('Build');
  }, { fill: GAME.UI.COL.panelPurple, line: GAME.CONFIG.COLORS.strategist, hover: GAME.UI.COL.panelPurpleHi, color: C.accentAlt, fontSize: P ? 17 : 20 });
  GAME.UI.label(this, W / 2, u * 63 + u * BH / 2 + 6, '진형을 짜고 AI 공격을 막아라 — 막을수록 AI가 강해진다',
    P ? 13 : 13, C.textDim, 0.5).setOrigin(0.5, 0).setWordWrapWidth(W - 40);

  var rc = GAME.Layout.cols(GAME.isAdmin ? 3 : 2, {
    gap: 10, width: bw, left: (W - bw) / 2, pad: 0
  });
  GAME.UI.button(this, rc[0].cx, u * 78, rc[0].w, u * (GAME.UI.BTN_H_SM || 52) / u, '🏆 랭킹', function () {
    self.scene.start('Rank', { scope: 'live' });
  }, { fontSize: P ? 15 : 15 });
  GAME.UI.button(this, rc[1].cx, u * 78, rc[1].w, u * (GAME.UI.BTN_H_SM || 52) / u, '닉네임 변경', function () {
    GAME.Account.logout();
    self.scene.start('Login');
  }, { fontSize: P ? 15 : 14 });
  if (GAME.isAdmin) {
    GAME.UI.button(this, rc[2].cx, u * 78, rc[2].w, u * (GAME.UI.BTN_H_SM || 52) / u, '닉네임 관리', function () {
      self.scene.start('Admin', { page: 0 });
    }, { fontSize: P ? 15 : 14, line: GAME.UI.COL.focus, color: C.warn });
  }

  var hint = GAME.isTouch
    ? '조작  ─  한 번 탭: 이동하며 교전   |   두 번 탭: 이동만   |   스킬 버튼: 바라보는 방향 시전'
    : '조작  ─  우클릭: 이동 / 적 클릭 공격   |   방향키: 직접 이동   |   Q W E R: 바라보는 방향 시전   |   F: 물약';
  GAME.UI.label(this, W / 2, u * 86, hint, P ? 13 : 13, C.textDim, 0.5)
    .setAlign('center').setWordWrapWidth(W - 40);

  GAME.UI.label(this, W / 2, u * 94,
    P ? '논타겟은 피할 수 있고, 타겟은 피할 수 없다.'
      : '논타겟 공격은 피할 수 있고, 타겟 공격은 피할 수 없다. 그것이 이 게임의 균형이다.',
    P ? 13 : 13, GAME.CONFIG.COLORS.textFaint, 0.5).setWordWrapWidth(W - 40);

  // 버전 표시는 DOM 배지(#ver) 하나로 통일했다 — 캔버스에도 그리면 우하단에서 겹친다.
};
