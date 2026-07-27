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
  this.tower = data.tower || 0;
  this.towerRec = data.towerRec || null;
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
  if (this.tower) {
    // 통곡의 탑
    if (this.winner === 'controller') {
      title = this.tower + '층 돌파'; color = C.accent;
      sub = '다음은 ' + (this.tower + 1) + '층 — 적 진형 ' + GAME.Tower.budgetFor(this.tower + 1) +
            ' vs 내 예산 ' + GAME.Tower.heroBudgetFor(this.tower + 1) +
            '. AI가 이번 전투를 분석해 배치를 바꿉니다.';
    } else {
      title = this.tower + '층에서 탈락'; color = C.accentAlt;
      sub = '1층부터 다시 시작합니다.' +
            (this.towerRec ? ' 최고 기록 ' + (this.towerRec.best || 0) + '층.' : '');
    }
  } else if (this.defendMode) {
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

  // ── 판정 · 보상 (탕탕특공대의 결과 배너 + 운빨존많겜의 단계적 공개) ──
  // 한 번에 다 띄우지 않고 순서대로 들여보낸다. 다만 **먼저 다 만들고 alpha 0 → tween** 이다.
  // 나중에 생성하면 씬이 내려간 뒤 파괴된 객체를 건드린다(전에 겪은 사고).
  var tierObj = this.tower ? GAME.UI.tierForFloor(this.tower)
                           : GAME.UI.tierForEscalation(this.escalation);

  var plate = GAME.UI.verdictPlate(this, W / 2, u * 9, bw, title, sub, {
    tierIndex: tierObj.i,
    accentCss: color,
    titleSize: P ? 'title' : 'display'
  });

  var bx = (W - bw) / 2;
  var ry = plate.bottom + u * 1.5;
  var blocks = [];

  var scoreRow = null;
  if (this.score > 0) {
    scoreRow = GAME.UI.rewardRow(this, bx, ry, bw, '획득 점수', '0', {
      accent: 0xffd166, valueSize: 'heading'
    });
    blocks.push(scoreRow); ry = scoreRow.bottom + 8;

    var me = GAME.Account.current();
    if (me) {
      var rec = GAME.Score.of(me);
      var totalRow = GAME.UI.rewardRow(this, bx, ry, bw, '누적 점수',
        rec.total.toLocaleString('ko-KR') + '점  ·  격파 ' + rec.rounds + '회',
        { valueSize: 'body', valueColor: GAME.UI.TXT.textMid });
      blocks.push(totalRow); ry = totalRow.bottom + 8;
    }
  }

  if (this.tower) {
    var prof = GAME.Profile.read();
    var r = GAME.UI.rewardRow(this, bx, ry, bw, 'AI가 읽은 당신',
      prof.styleLabel + ' · ' + prof.dodgeLabel,
      { valueSize: 'body', valueColor: GAME.UI.TXT.crit, accent: tierObj.hex });
    blocks.push(r); ry = r.bottom + 8;
  } else if (this.defendMode) {
    var r2 = GAME.UI.rewardRow(this, bx, ry, bw, 'AI 컨트롤러 숙련도',
      Math.round(this.aiSkill * 100) + '%', { valueSize: 'body' });
    blocks.push(r2); ry = r2.bottom + 8;
  } else if (this.formationId) {
    var f = GAME.Formations.getById(this.formationId);
    var sum = GAME.Learn.summary(this.formationId);
    var r3 = GAME.UI.rewardRow(this, bx, ry, bw, '상대 진형',
      (f ? f.name : '?') + (sum ? '  ·  ' + sum.escalation + '단계' : ''),
      { valueSize: 'body', valueColor: GAME.UI.TXT.text, accent: tierObj.hex });
    blocks.push(r3); ry = r3.bottom + 8;
    var r4 = GAME.UI.rewardRow(this, bx, ry, bw, '이 진형 상대 전적',
      GAME.UI.winRateText(this.formationId),
      { valueSize: 'caption', valueColor: GAME.UI.TXT.warn });
    blocks.push(r4); ry = r4.bottom + 8;
  }

  var noteObjs = [];
  if (this.learnNotes.length) {
    noteObjs.push(GAME.UI.text(this, W / 2, ry + 4, '🧠 ' + this.learnNotes.join('  /  '), {
      size: 'micro', color: GAME.UI.TXT.crit, origin: 0.5, originY: 0,
      align: 'center', wrap: bw
    }));
    ry += u * 4;
  }

  GAME.UI.revealIn(this, [plate].concat(blocks).concat([noteObjs]), { stagger: 140 });
  if (scoreRow) {
    GAME.UI.countUp(this, scoreRow.value, this.score, { suffix: '점', duration: 800, delay: 320 });
  }

  // 버튼은 위 블록 길이에 따라 밀린다 — 고정 y 로 두면 긴 결과에서 겹친다
  var btnTop = Math.max(u * 60, ry + u * 2);

  var b1 = this.tower ? (this.winner === 'controller' ? (this.tower + 1) + '층 도전' : '1층부터 다시')
         : (this.defendMode ? '배치 고쳐 다시' : '같은 진형에 다시 도전');
  GAME.UI.button(this, W / 2, btnTop, bw, u * 7, b1, function () {
    if (self.tower) self.scene.start('Tower');
    else if (self.defendMode) self.scene.start('Build');
    else self.scene.start('Draft', { formationId: self.formationId });
  }, { fill: GAME.UI.COL.panelTeal, line: GAME.CONFIG.COLORS.controller, hover: GAME.UI.COL.panelTealHi, color: C.accent, fontSize: P ? 17 : 18 });

  GAME.UI.button(this, W / 2, btnTop + u * 9, bw, u * 6,
    this.tower ? '일반 대전으로' : (this.defendMode ? '컨트롤러로 도전' : '다른 진형 고르기'), function () {
      self.scene.start('Select');
    }, { fontSize: P ? 15 : 16 });

  var rc = GAME.Layout.cols(2, { gap: 10, width: bw, left: (W - bw) / 2, pad: 0 });
  GAME.UI.button(this, rc[0].cx, btnTop + u * 18, rc[0].w, u * 6, '🏆 랭킹', function () {
    self.scene.start('Rank', { scope: 'live' });
  }, { fontSize: P ? 15 : 15 });
  GAME.UI.button(this, rc[1].cx, btnTop + u * 18, rc[1].w, u * 6, '메뉴', function () {
    self.scene.start('Menu');
  }, { fontSize: P ? 15 : 15 });
};
