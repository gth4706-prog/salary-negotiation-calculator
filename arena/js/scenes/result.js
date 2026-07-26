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
  this.learnNotes = data.learnNotes || [];
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

  var H = GAME.CONFIG.HEIGHT;
  var P = GAME.CONFIG.PORTRAIT;
  var u = H / 100;
  var bw = Math.min(W - 60, 360);

  GAME.UI.label(this, W / 2, u * 24, title, P ? 40 : 62, color, 0.5);
  GAME.UI.label(this, W / 2, u * 34, sub, P ? 13 : 18, C.textDim, 0.5)
    .setAlign('center').setWordWrapWidth(W - 40);

  GAME.UI.label(this, W / 2, u * 44, '상대 진형: ' + formation.name +
    (formation.isAI ? ' (AI)' : ' (사람)'), P ? 15 : 19, C.text, 0.5);
  GAME.UI.label(this, W / 2, u * 48.5, GAME.UI.winRateText(this.formationId), P ? 13 : 17, C.warn, 0.5);

  // 학습형 AI가 이번 판에서 무엇을 배웠는지 보여준다.
  // 보이지 않으면 학습이 있는지 없는지 알 수 없어 의미가 없다.
  var sum = GAME.Learn.summary(this.formationId);
  if (this.learnNotes.length) {
    GAME.UI.label(this, W / 2, u * 53.5,
      '🧠 이 진형이 배운 것: ' + this.learnNotes.join(' / '),
      P ? 11 : 13, C.crit, 0.5).setAlign('center').setWordWrapWidth(W - 60);
  } else if (sum && sum.learned.length) {
    GAME.UI.label(this, W / 2, u * 53.5,
      '🧠 적용 중인 학습: ' + sum.learned.join(', ') + '  (' + sum.battles + '전 누적)',
      P ? 11 : 13, C.crit, 0.5).setAlign('center').setWordWrapWidth(W - 60);
  }

  GAME.UI.button(this, W / 2, u * 61, bw, u * 6.5, '같은 진형에 다시 도전', function () {
    self.scene.start('Draft', { formationId: self.formationId });
  }, { fill: 0x1c3a34, line: 0x35d0a5, hover: 0x235045, color: C.accent, fontSize: P ? 16 : 19 });

  GAME.UI.button(this, W / 2, u * 70, bw, u * 5.5, '다른 진형 고르기', function () {
    self.scene.start('Select');
  }, { fontSize: P ? 14 : 17 });

  GAME.UI.button(this, W / 2, u * 78, bw, u * 5.5, '메뉴로', function () {
    self.scene.start('Menu');
  }, { fontSize: P ? 14 : 17 });
};
