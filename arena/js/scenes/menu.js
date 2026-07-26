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

  this.cameras.main.setBackgroundColor(C.bg);

  var u = H / 100;   // 화면 높이 비율로 배치 — 세로/가로 모두 대응

  GAME.UI.label(this, W / 2, u * 14, '전략 vs 컨트롤', P ? 34 : 54, C.text, 0.5);
  GAME.UI.label(this, W / 2, u * 21, '한국군 비대칭 실시간 대전', P ? 15 : 20, C.textDim, 0.5);

  GAME.UI.label(this, W / 2, u * 30,
    P ? '전략가는 진형을 짜고 지켜본다.\n컨트롤러는 영웅 하나로 뚫는다.'
      : '전략가는 진형을 짜고 지켜본다.  컨트롤러는 영웅 하나로 그것을 뚫는다.',
    P ? 14 : 18, C.textDim, 0.5).setAlign('center').setLineSpacing(6);

  var bw = Math.min(W - 60, 420);

  GAME.UI.button(this, W / 2, u * 43, bw, u * 8, '컨트롤러로 도전', function () {
    self.scene.start('Select');
  }, { fill: 0x1c3a34, line: 0x35d0a5, hover: 0x235045, color: C.accent, fontSize: P ? 18 : 22 });
  GAME.UI.label(this, W / 2, u * 49, '영웅 1기 + 장비로 진형 전체를 섬멸하라', P ? 12 : 15, C.textDim, 0.5);

  GAME.UI.button(this, W / 2, u * 58, bw, u * 8, '전략가로 배치 만들기', function () {
    self.scene.start('Build');
  }, { fill: 0x2a2440, line: 0x9b8cf0, hover: 0x372f52, color: C.accentAlt, fontSize: P ? 18 : 22 });
  GAME.UI.label(this, W / 2, u * 64, '진형을 짜서 저장하면 컨트롤러들이 그것과 싸운다', P ? 12 : 15, C.textDim, 0.5);

  var hint = GAME.isTouch
    ? '조작  ─  한 번 탭: 이동하며 교전   |   두 번 탭: 이동만\n스킬 버튼을 누른 뒤 위치를 탭하면 시전'
    : '조작  ─  우클릭: 이동 / 적 클릭 시 공격   |   방향키: 직접 이동\nQ W E R: 스킬   |   F: 물약   |   Space: 기본공격';
  GAME.UI.label(this, W / 2, u * 76, hint, P ? 12 : 15, C.textDim, 0.5)
    .setAlign('center').setLineSpacing(8).setWordWrapWidth(W - 40);

  GAME.UI.label(this, W / 2, u * 90,
    P ? '논타겟은 피할 수 있고, 타겟은 피할 수 없다.'
      : '논타겟 공격은 피할 수 있고, 타겟 공격은 피할 수 없다. 그것이 이 게임의 균형이다.',
    P ? 11 : 14, '#6f6f88', 0.5).setWordWrapWidth(W - 40);

  // 버전은 캔버스 안에도 찍는다 — DOM 배지가 가려지거나 안 보이는 경우가 있어서
  GAME.UI.label(this, W - 12, H - 10, GAME.VERSION || '', 12, '#6f6f88', 1).setOrigin(1, 1);
};
