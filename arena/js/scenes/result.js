window.GAME = window.GAME || {};

GAME.ResultScene = function () {
  Phaser.Scene.call(this, { key: 'Result' });
};
GAME.ResultScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.ResultScene.prototype.constructor = GAME.ResultScene;

GAME.ResultScene.prototype.init = function (data) {
  this.winner = data.winner;
  this.formationId = data.formationId;
  this.heroKey = data.heroKey;
};

GAME.ResultScene.prototype.create = function () {
  var C = GAME.CONFIG.COLORS;
  var W = GAME.CONFIG.WIDTH;
  var self = this;

  this.cameras.main.setBackgroundColor(C.bg);

  var formation = GAME.Formations.getById(this.formationId);

  // 전적은 배치도(전략가) 관점으로 기록한다
  var outcome = this.winner === 'strategist' ? 'win'
    : (this.winner === 'controller' ? 'loss' : 'draw');
  GAME.Formations.recordResult(this.formationId, outcome);

  var title, sub, color;
  if (this.winner === 'controller') {
    title = '돌파 성공';
    sub = '영웅 하나로 진형을 전부 섬멸했습니다. 컨트롤이 전략을 이겼습니다.';
    color = C.accent;
  } else if (this.winner === 'strategist') {
    title = '영웅 전사';
    sub = '진형을 뚫지 못했습니다. 배치가 컨트롤을 이겼습니다.';
    color = C.accentAlt;
  } else {
    title = '무승부';
    sub = '제한 시간 안에 결판이 나지 않았습니다. 피하기만 해서는 이길 수 없습니다.';
    color = C.warn;
  }

  GAME.UI.label(this, W / 2, 210, title, 62, color, 0.5);
  GAME.UI.label(this, W / 2, 284, sub, 18, C.textDim, 0.5);

  GAME.UI.label(this, W / 2, 366, '상대 진형: ' + formation.name +
    (formation.isAI ? '  (AI 배치)' : '  (사람 배치)'), 19, C.text, 0.5);
  GAME.UI.label(this, W / 2, 402, GAME.UI.winRateText(this.formationId), 17, C.warn, 0.5);

  GAME.UI.button(this, W / 2, 494, 340, 56, '같은 진형에 다시 도전', function () {
    self.scene.start('Draft', { formationId: self.formationId });
  }, { fill: 0x1c3a34, line: 0x35d0a5, hover: 0x235045, color: C.accent, fontSize: 19 });

  GAME.UI.button(this, W / 2, 566, 340, 48, '다른 진형 고르기', function () {
    self.scene.start('Select');
  }, { fontSize: 17 });

  GAME.UI.button(this, W / 2, 630, 340, 48, '메뉴로', function () {
    self.scene.start('Menu');
  }, { fontSize: 17 });
};
