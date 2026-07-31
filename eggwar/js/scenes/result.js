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
  this.defendTower = data.defendTower || 0;   // 수성의 탑 층수
  // 시험 판 — 아무것도 기록되지 않았다는 사실을 **화면이 말해야 한다**.
  // 조용히 넘어가면 '왜 트로피가 안 올랐지'로 읽힌다.
  this.test = !!data.test;
  this.aiSkill = data.aiSkill || 0;
  this.score = data.score || 0;
  this.escalation = data.escalation || 0;
  this.tower = data.tower || 0;
  this.towerRec = data.towerRec || null;
  this.runRec = data.runRec || null;          // 통곡의 탑 도전 상태(골드·레벨)
  this.goldGained = data.goldGained || 0;
  this.bossDrop = data.bossDrop || null;       // 보스 확정 드랍 { kind, name, note }
  this.versus = !!data.versus;                // 대전(비동기 PvP) 공격이었는가
  this.arenaResult = data.arenaResult || null;// { delta, trophy, league }
};

// ── 통곡의 탑 · 층 클리어는 이 화면을 **건너뛴다** (2026-07-29, 사용자 지시) ─────────
//
//  "한 층을 깨고 나면 바로 다음 층 도전화면(골드로 능력치 업데이트하는 화면)으로."
//  전투를 끝낸 `scenes/battle.js` 는 모드와 무관하게 항상 `Result` 를 띄운다(그 파일은
//  다른 에이전트가 작업 중이라 건드리지 않는다). 그래서 **여기서 되돌린다** —
//  탑 승리면 아무것도 만들지 않고 곧장 `Tower` 씬의 도전 단계로 넘긴다.
//
//  ⚠ 대신 결과 화면이 보여주던 것(획득 골드·획득 점수·다음 층)이 사라진다.
//    그대로 두면 "골드를 받았다"는 사실이 화면 어디에도 안 남는다(실제로 그렇게 됐었다).
//    → `cleared` 로 넘겨서 도전 화면이 골드 라벨·힌트 줄에 직접 띄운다.
//  ⚠ 패배·무승부는 그대로 결과 화면을 거친다. 요약이 필요한 순간이다.
//  ⚠ 다른 모드(일반 대전·방어전·수성의 탑·비동기 대전)는 이 분기에 들어오지 않는다.
GAME.ResultScene.prototype._skipToNextFloor = function () {
  if (!this.tower || this.winner !== 'controller') return false;
  // 결과 화면이 내던 승리음은 여기서 대신 낸다(연출이 통째로 사라지지 않게).
  if (GAME.Sound && GAME.Sound.play) { try { GAME.Sound.play('win'); } catch (e) {} }
  this.scene.start('Tower', {
    step: 'challenge',
    cleared: {
      floor: this.tower,
      gold: this.goldGained || 0,
      score: this.score || 0,
      best: (this.towerRec && this.towerRec.best) || 0,
      drop: this.bossDrop || null
    }
  });
  return true;
};

GAME.ResultScene.prototype.create = function () {
  // 층 클리어는 화면을 만들지 않고 바로 다음 층 도전 화면으로 넘어간다.
  if (this._skipToNextFloor()) return;

  var C = GAME.CONFIG.COLORS;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var P = GAME.CONFIG.PORTRAIT;
  var self = this;
  var u = H / 100;
  var bw = Math.min(W - 60, 380);

  this.cameras.main.setBackgroundColor(C.bg);

  // 결과음 — 이겼는지 졌는지를 소리로 먼저 알린다.
  // 방어전은 '내가 막았는가'가 승리이므로 판정이 반대다.
  if (GAME.Sound) {
    var good = this.defendMode || this.defendTower
      ? (this.winner !== 'controller')
      : (this.winner === 'controller');
    GAME.Sound.play(good ? 'win' : 'lose');
  }

  var title, sub, color;
  if (this.tower) {
    // 통곡의 탑
    // ⚠ 아래 '돌파' 가지는 `_skipToNextFloor` 가 먼저 가로채므로 **평소에는 안 탄다.**
    //   지우지 않고 남긴다 — 다른 씬이 탑 승리로 Result 를 직접 띄우는 경우의 안전망이다.
    if (this.winner === 'controller') {
      title = this.tower + '층 돌파'; color = C.accent;
      sub = '다음은 ' + (this.tower + 1) + '층 — 적 진형 ' + GAME.Tower.budgetFor(this.tower + 1) +
            '. 골드로 능력치를 올리고 올라가세요. AI는 이번 전투 양상을 보고 배치를 바꿉니다.';
    } else {
      // 2026-08-01 — 패배해도 층이 안 돌아간다(캐릭터가 영구화됐다). "1층부터"
      //  문구를 없애고 같은 층 재도전을 안내한다.
      title = this.tower + '층에서 탈락'; color = C.accentAlt;
      sub = '같은 층에서 다시 도전할 수 있습니다 — 캐릭터와 성장은 그대로 남습니다.' +
            (this.towerRec ? ' 최고 기록 ' + (this.towerRec.best || 0) + '층.' : '');
    }
  } else if (this.defendTower) {
    // 수성의 탑 — 영웅을 막아냈으면 한 층 올라간다
    var DT = GAME.DefendTower;
    if (this.winner === 'controller') {
      title = this.defendTower + '층 방어 실패'; color = C.accentAlt;
      sub = '영웅에게 뚫렸습니다. 1층부터 다시 시작합니다.' +
            (this.towerRec ? ' 최고 기록 ' + (this.towerRec.best || 0) + '층.' : '');
    } else {
      var nf = this.defendTower + 1;
      title = this.defendTower + '층 방어 성공'; color = C.accent;
      sub = (this.winner === 'draw' ? '시간 안에 뚫지 못했습니다 — 방어 성공. ' : '영웅을 격퇴했습니다. ') +
            '다음은 ' + nf + '층 — 오는 영웅 ' +
            GAME.HEROES[DT.heroKeyFor(nf, DT.skillFor(nf))].name +
            ' (예산 ' + DT.heroBudgetFor(nf) + ') vs 내 배치 ' + DT.budgetFor(nf) + '.';
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
  } else if (this.test) {
    // 시험 판 — 기록이 없다는 사실을 **제목과 설명 둘 다**에서 말한다.
    // '공격 성공' 이라고만 쓰면 트로피가 오른 줄 알고 화면을 닫는다.
    if (this.winner === 'controller') {
      title = '시험 — 내 전장이 뚫렸습니다'; color = C.warn;
      sub = '내가 만든 전장을 내가 뚫어 봤습니다. 점수·트로피·격파율에 반영되지 않습니다.';
    } else {
      title = '시험 — 내 전장이 막았습니다'; color = C.accent;
      sub = '내 전장이 버텼습니다. 점수·트로피·격파율에 반영되지 않습니다.';
    }
  } else if (this.versus && this.arenaResult) {
    // 대전(비동기 PvP) — 승패보다 **트로피가 얼마나 움직였는지**가 결과다
    var ar = this.arenaResult;
    if (this.winner === 'controller') {
      title = '공격 성공'; color = C.accent;
      sub = '상대 진형을 뚫었습니다. 트로피 ' + (ar.delta >= 0 ? '+' : '') + ar.delta +
            ' → ' + ar.trophy + ' (' + ar.league.name + ')';
    } else {
      title = '공격 실패'; color = C.accentAlt;
      sub = '상대 진형이 버텼습니다. 트로피 ' + ar.delta + ' → ' + ar.trophy +
            ' (' + ar.league.name + '). 다른 상대를 노려보세요.';
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
  var tierObj = (this.tower || this.defendTower)
    ? GAME.UI.tierForFloor(this.tower || this.defendTower)
    : GAME.UI.tierForEscalation(this.escalation);

  // 폰 가로: 판정 → 보상 → 버튼 3단을 세로로 쌓으면 아래 두 단이 통째로 화면 밖으로
  // 나간다(실측 화면밖 11건). 왼쪽 = 무슨 일이 있었나, 오른쪽 = 무엇을 받았고 다음은 뭔가.
  if (GAME.CONFIG.PHONE) { this._buildPhone(title, sub, color, tierObj); return; }

  var plate = GAME.UI.verdictPlate(this, W / 2, u * 9, bw, title, sub, {
    tierIndex: tierObj.i,
    accentCss: color,
    titleSize: P ? 'title' : 'display'
  });

  var bx = (W - bw) / 2;
  var rw = this._rewards(bx, plate.bottom + u * 1.5, bw, tierObj);
  var blocks = rw.blocks, scoreRow = rw.scoreRow, ry = rw.bottom;

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

  // 액션 스택은 화면 하단에 정박시킨다(썸 리치 + 바닥 여백 흡수). 3행이 u*90 근처에서
  // 끝나도록 아래에서 위로 잡되, 위 정보 블록과는 절대 겹치지 않게 ry 아래로 clamp 한다.
  //   예전엔 고정 u*60 에서 아래로 뻗어 바닥 ~19% 가 비고 정보-버튼 사이 띠가 남았다.
  var btnTop = Math.max(ry + u * 3, u * 68);

  var b1;
  // 2026-08-01 — 패배해도 층이 안 돌아가므로 재도전 문구도 같은 층을 가리킨다.
  if (this.tower) b1 = (this.winner === 'controller' ? (this.tower + 1) + '층 도전' : this.tower + '층 재도전');
  else if (this.defendTower) b1 = (this.winner === 'controller' ? '1층부터 다시' : (this.defendTower + 1) + '층 방어');
  else if (this.versus) b1 = '다음 상대';
  else if (this.defendMode) b1 = '배치 고쳐 다시';
  else b1 = '같은 진형에 다시 도전';
  GAME.UI.button(this, W / 2, btnTop, bw, u * 7, b1, function () {
    // 2026-07-31 — 이 화면의 `self.tower` 분기는 **패배했을 때만** 온다(승리는
    // `_skipToNextFloor` 가 이 화면 자체를 건너뛴다). 그래서 여기는 항상 "같은 층 재도전"
    // 이고, 허브를 한 번 더 거치지 않고 `instantRetry` 로 곧장 그 층 전투로 들어간다.
    if (self.tower) self.scene.start('Tower', { step: 'challenge', instantRetry: true });
    else if (self.defendTower) self.scene.start('DefendTower',
      { cleared: self.winner !== 'controller' });   // 막아냈으면 성장 화면부터 연다
    else if (self.versus) self.scene.start('Versus');
    else if (self.defendMode) self.scene.start('Build');
    else self.scene.start('Draft', { formationId: self.formationId });
  }, { fill: GAME.UI.COL.panelTeal, line: GAME.CONFIG.COLORS.controller, hover: GAME.UI.COL.panelTealHi, color: C.accent, fontSize: P ? 17 : 18 });

  GAME.UI.button(this, W / 2, btnTop + u * 9, bw, u * 6,
    this.tower ? '일반 대전으로'
      : (this.defendTower ? '메뉴로'
        : (this.versus ? '메뉴로' : (this.defendMode ? '컨트롤러로 도전' : '다른 진형 고르기'))), function () {
      self.scene.start((self.defendTower || self.versus) ? 'Menu' : 'Select');
    }, { fontSize: P ? 15 : 16 });

  var rc = GAME.Layout.cols(2, { gap: 10, width: bw, left: (W - bw) / 2, pad: 0 });
  GAME.UI.button(this, rc[0].cx, btnTop + u * 18, rc[0].w, u * 6, '🏆 랭킹', function () {
    self.scene.start('Rank', { scope: 'live' });
  }, { fontSize: P ? 15 : 15 });
  GAME.UI.button(this, rc[1].cx, btnTop + u * 18, rc[1].w, u * 6, '메뉴', function () {
    self.scene.start('Menu');
  }, { fontSize: P ? 15 : 15 });
};

// 보상/지표 줄 묶음 — 가로·세로·폰 가로가 **같은 내용을 같은 순서로** 보여줘야 하므로
// 좌표만 받아 한 곳에서 만든다(예전엔 이 블록이 create 안에 박혀 있어 재배치가 불가능했다).
GAME.ResultScene.prototype._rewards = function (bx, ry, bw, tierObj) {
  var blocks = [];
  var scoreRow = null;

  // 시험 판은 **보상 줄을 아예 만들지 않는다.** 점수가 저장되지 않았는데 '획득 점수'와
  // '누적 점수'를 보여주면, 얻은 것처럼 읽혀 위쪽 "반영되지 않습니다" 와 정면으로 어긋난다.
  // (실측에서 '획득 점수'·트로피 줄이 그대로 떠 있었다.)
  if (this.score > 0 && !this.test) {
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
    // 도전 보상 — 골드가 올랐다는 걸 점수와 같은 무게로 보여준다
    if (this.goldGained > 0 && this.runRec) {
      var gr = GAME.UI.rewardRow(this, bx, ry, bw, '획득 골드',
        '+' + this.goldGained + '  (보유 ' + this.runRec.gold + ')',
        { accent: 0xffd166, valueSize: 'heading', valueColor: GAME.UI.TXT.crit });
      blocks.push(gr); ry = gr.bottom + 8;
    }
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

  return { blocks: blocks, scoreRow: scoreRow, bottom: ry };
};

// ── 폰 가로 (820×390) ────────────────────────────────────────────────────
//  왼쪽 = 판정 현수막 + 설명 + 학습 노트, 오른쪽 = 보상 줄 + 다음 행동 버튼.
//  버튼은 **바닥에서 위로** 잡는다 — 보상 줄 개수가 2~4개로 변해도 안 밀린다.
GAME.ResultScene.prototype._buildPhone = function (title, sub, color, tierObj) {
  var C = GAME.CONFIG.COLORS;
  var UI = GAME.UI;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var self = this;

  var PAD = 16;
  var LW = 404;
  var rx = PAD + LW + 16, rw = W - PAD - rx;

  var plate = UI.verdictPlate(this, PAD + LW / 2, 12, LW, title, sub, {
    tierIndex: tierObj.i, accentCss: color, titleSize: 'title'
  });

  var noteObjs = [];
  if (this.learnNotes.length) {
    noteObjs.push(UI.text(this, PAD + LW / 2, plate.bottom + 2,
      '🧠 ' + this.learnNotes.join('  /  '), {
        size: 'micro', color: UI.TXT.crit, origin: 0.5, originY: 0,
        align: 'center', wrap: LW
      }));
  }

  // ── 오른쪽: 보상 → 다음 행동 ──
  // 55 는 아이폰 SE(FIT 0.813)에서 화면 44.7px — 44px 하한을 넘기는 최소값이다.
  var secH = 55, secTop = H - 12 - secH;
  var mainH = 62, mainTop = secTop - 10 - mainH;
  var rw2 = this._rewards(rx, 14, rw, tierObj);
  var blocks = rw2.blocks, scoreRow = rw2.scoreRow;

  UI.revealIn(this, [plate].concat(blocks).concat([noteObjs]), { stagger: 120 });
  if (scoreRow) {
    UI.countUp(this, scoreRow.value, this.score, { suffix: '점', duration: 800, delay: 300 });
  }

  var b1;
  // 2026-08-01 — 패배해도 층이 안 돌아가므로 재도전 문구도 같은 층을 가리킨다.
  if (this.tower) b1 = (this.winner === 'controller' ? (this.tower + 1) + '층 도전' : this.tower + '층 재도전');
  else if (this.defendTower) b1 = (this.winner === 'controller' ? '1층부터 다시' : (this.defendTower + 1) + '층 방어');
  else if (this.versus) b1 = '다음 상대';
  else if (this.defendMode) b1 = '배치 고쳐 다시';
  else b1 = '같은 진형에 다시 도전';

  UI.button(this, rx + rw / 2, mainTop + mainH / 2, rw, mainH, b1, function () {
    // 2026-07-31 — 이 화면의 `self.tower` 분기는 **패배했을 때만** 온다(승리는
    // `_skipToNextFloor` 가 이 화면 자체를 건너뛴다). 그래서 여기는 항상 "같은 층 재도전"
    // 이고, 허브를 한 번 더 거치지 않고 `instantRetry` 로 곧장 그 층 전투로 들어간다.
    if (self.tower) self.scene.start('Tower', { step: 'challenge', instantRetry: true });
    else if (self.defendTower) self.scene.start('DefendTower',
      { cleared: self.winner !== 'controller' });   // 막아냈으면 성장 화면부터 연다
    else if (self.versus) self.scene.start('Versus');
    else if (self.defendMode) self.scene.start('Build');
    else self.scene.start('Draft', { formationId: self.formationId });
  }, { fill: UI.COL.panelTeal, line: GAME.CONFIG.COLORS.controller,
       hover: UI.COL.panelTealHi, color: C.accent, fontSize: 19 });

  var b2 = this.tower ? '일반 대전으로'
    : (this.defendTower ? '메뉴로' : (this.versus ? '메뉴로' : (this.defendMode ? '컨트롤러로 도전' : '다른 진형')));
  var bc = GAME.Layout.cols(3, { gap: 10, width: rw, left: rx, pad: 0 });
  UI.button(this, bc[0].cx, secTop + secH / 2, bc[0].w, secH, b2, function () {
    self.scene.start((self.defendTower || self.versus) ? 'Menu' : 'Select');
  }, { fontSize: 15 });
  UI.button(this, bc[1].cx, secTop + secH / 2, bc[1].w, secH, '🏆 랭킹', function () {
    self.scene.start('Rank', { scope: 'live' });
  }, { fontSize: 15 });
  UI.button(this, bc[2].cx, secTop + secH / 2, bc[2].w, secH, '메뉴', function () {
    self.scene.start('Menu');
  }, { fontSize: 15 });
};
