window.GAME = window.GAME || {};

GAME.MenuScene = function () {
  Phaser.Scene.call(this, { key: 'Menu' });
};
GAME.MenuScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.MenuScene.prototype.constructor = GAME.MenuScene;

GAME.MenuScene.prototype.create = function () {
  var C = GAME.CONFIG.COLORS;
  var W = GAME.CONFIG.WIDTH;
  var self = this;

  this.cameras.main.setBackgroundColor(C.bg);

  GAME.UI.label(this, W / 2, 128, '전략 vs 컨트롤', 54, C.text, 0.5);
  GAME.UI.label(this, W / 2, 190, '비대칭 실시간 대전', 20, C.textDim, 0.5);

  GAME.UI.label(this, W / 2, 258,
    '전략가는 진형을 짜고 지켜본다.  컨트롤러는 영웅 하나로 그것을 뚫는다.',
    18, C.textDim, 0.5);

  GAME.UI.button(this, W / 2, 348, 420, 66, '컨트롤러로 도전', function () {
    self.scene.start('Select');
  }, { fill: 0x1c3a34, line: 0x35d0a5, hover: 0x235045, color: C.accent, fontSize: 22 });

  GAME.UI.label(this, W / 2, 396, '영웅 1기 + 아이템으로 진형 전체를 섬멸하라', 15, C.textDim, 0.5);

  GAME.UI.button(this, W / 2, 474, 420, 66, '전략가로 배치 만들기', function () {
    self.scene.start('Build');
  }, { fill: 0x2a2440, line: 0x9b8cf0, hover: 0x372f52, color: C.accentAlt, fontSize: 22 });

  GAME.UI.label(this, W / 2, 522, '진형을 짜서 저장하면, 컨트롤러들이 그것과 싸운다', 15, C.textDim, 0.5);

  var hint = GAME.isTouch
    ? '컨트롤러 조작  ─  한 번 탭: 이동하며 교전   |   두 번 탭: 이동만\n' +
      '스킬 버튼을 누른 뒤 위치를 탭하면 시전   |   물약 버튼으로 회복'
    : '컨트롤러 조작  ─  우클릭: 이동 / 적 클릭 시 공격   |   방향키: 직접 이동\n' +
      'Q W E R: 스킬 (마우스 방향으로 시전)   |   F: 물약   |   Space: 기본공격';
  GAME.UI.label(this, W / 2, 624, hint, 15, C.textDim, 0.5).setAlign('center').setLineSpacing(9);

  GAME.UI.label(this, W / 2, 726,
    '논타겟 공격은 피할 수 있고, 타겟 공격은 피할 수 없다. 그것이 이 게임의 균형이다.',
    14, '#6f6f88', 0.5);
};
