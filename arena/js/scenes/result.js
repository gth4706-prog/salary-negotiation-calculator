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
  this.defendMode = !!data.defendMode;
  this.aiSkill = data.aiSkill || 0;
  this.score = data.score || 0;
  this.escalation = data.escalation || 0;
};

GAME.ResultScene.prototype.create = function () {
  var C = GAME.CONFIG.COLORS;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var P = GAME.CONFIG.PORTRAIT;
  var self = this;
  var u = H / 100;
  var bw = Math.min(W - 60, 380);

  this.cameras.main.setBackgroundColor(C.bg);

  var title, sub, color;
  if (this.defendMode) {
    // 전략가 방어전 — AI 컨트롤러가 이겼으면 내 진형이 뚫린 것
    if (this.winner === 'controller') {
      title = '진형 돌파됨'; color = C.accentAlt;
      sub = 'AI 컨트롤러가 뚫었습니다. 배치를 고쳐 다시 막아보세요.';
    } else if (this.winner === 'strategist') {
      title = '방어 성공'; color = C.accent;
      sub = 'AI 컨트롤러를 격퇴했습니다. 다음 판의 AI는 더 잘합니다.';
    } else {
      title = '시간 초과 방어'; color = C.warn;
      sub = 'AI가 시간 안에 뚫지 못했습니다. 방어 성공으로 봅니다.';
    }
  } else {
    if (this.winner === 'controller') {
      title = '돌파 성공'; color = C.accent;
      sub = '영웅 하나로 진형을 섬멸했습니다. 이 진형은 다음에 더 강해집니다.';
    } else if (this.winner === 'strategist') {
      title = '영웅 전사'; color = C.accentAlt;
      sub = '진형을 뚫지 못했습니다. 배치가 컨트롤을 이겼습니다.';
    } else {
      title = '무승부'; color = C.warn;
      sub = '제한 시간 안에 결판이 나지 않았습니다. 피하기만 해서는 이길 수 없습니다.';
    }
  }

  GAME.UI.label(this, W / 2, u * 17, title, P ? 34 : 54, color, 0.5);
  GAME.UI.label(this, W / 2, u * 26, sub, P ? 12 : 16, C.textDim, 0.5)
    .setAlign('center').setWordWrapWidth(W - 50);

  // 획득 점수
  if (this.score > 0) {
    GAME.UI.label(this, W / 2, u * 34, '+' + this.score.toLocaleString('ko-KR') + '점',
      P ? 22 : 30, C.crit, 0.5);
    var me = GAME.Account.current();
    if (me) {
      var rec = GAME.Score.of(me);
      GAME.UI.label(this, W / 2, u * 40,
        '누적 ' + rec.total.toLocaleString('ko-KR') + '점 · 격파 ' + rec.rounds + '회',
        P ? 11 : 14, C.textDim, 0.5);
    }
  }

  var y = 46;
  if (this.defendMode) {
    GAME.UI.label(this, W / 2, u * y, 'AI 컨트롤러 숙련도 ' + Math.round(this.aiSkill * 100) + '%',
      P ? 13 : 17, C.text, 0.5);
    y += 5;
  } else if (this.formationId) {
    var f = GAME.Formations.getById(this.formationId);
    var sum = GAME.Learn.summary(this.formationId);
    GAME.UI.label(this, W / 2, u * y, '상대 진형: ' + (f ? f.name : '?') +
      (sum ? '  ·  난이도 ' + sum.escalation + '단계' : ''), P ? 13 : 17, C.text, 0.5);
    y += 4.5;
    GAME.UI.label(this, W / 2, u * y, GAME.UI.winRateText(this.formationId), P ? 11 : 14, C.warn, 0.5);
    y += 5;
  }

  // 학습 내용 — 보이지 않으면 학습이 있는지 알 수 없다
  if (this.learnNotes.length) {
    GAME.UI.label(this, W / 2, u * y, '🧠 ' + this.learnNotes.join('  /  '),
      P ? 10 : 13, C.crit, 0.5).setAlign('center').setWordWrapWidth(W - 60);
  }

  var b1 = this.defendMode ? '배치 고쳐 다시' : '같은 진형에 다시 도전';
  GAME.UI.button(this, W / 2, u * 64, bw, u * 7, b1, function () {
    if (self.defendMode) self.scene.start('Build');
    else self.scene.start('Draft', { formationId: self.formationId });
  }, { fill: 0x1c3a34, line: 0x35d0a5, hover: 0x235045, color: C.accent, fontSize: P ? 15 : 18 });

  GAME.UI.button(this, W / 2, u * 73, bw, u * 6, this.defendMode ? '컨트롤러로 도전' : '다른 진형 고르기', function () {
    self.scene.start('Select');
  }, { fontSize: P ? 13 : 16 });

  var rc = GAME.Layout.cols(2, { gap: 10, width: bw, left: (W - bw) / 2, pad: 0 });
  GAME.UI.button(this, rc[0].cx, u * 82, rc[0].w, u * 6, '🏆 랭킹', function () {
    self.scene.start('Rank', { scope: 'live' });
  }, { fontSize: P ? 13 : 15 });
  GAME.UI.button(this, rc[1].cx, u * 82, rc[1].w, u * 6, '메뉴', function () {
    self.scene.start('Menu');
  }, { fontSize: P ? 13 : 15 });
};
