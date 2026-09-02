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
  this._replay = !!data.towerReplay;          // 지난 층 다시(연습 판) — 진행 무변화
  this.runRec = data.runRec || null;          // 통곡의 탑 도전 상태(골드·레벨)
  this.goldGained = data.goldGained || 0;
  this.bossDrop = data.bossDrop || null;       // 보스 확정 드랍 { kind, name, note }
  this.timeUp = !!data.timeUp;                 // 시간 초과로 끝났는가(패배 사유 표시)
  this.versus = !!data.versus;                // 대전(비동기 PvP) 공격이었는가
  this.arenaResult = data.arenaResult || null;// { delta, trophy, league }
  this.rtResult = data.rtResult || null;      // { won, delta, score } | { invalid }
  this.rtLive = data.rtLive || null;          // { myRole, theirRole } — 방 유지 중이면
  this._rtVoted = false;                      // 내가 [한판 더]를 눌렀나
  this._rtTheirVote = false;                  // 상대의 [한판 더]가 도착했나
  this._rtGoing = false;                      // 재대결 전환 중(방을 나가면 안 된다)
  this._rtVoteTimer = null;
  this.report = data.report || null;          // 전투 요약(combat state.report)
  this.bonusRound = data.bonusRound || null;  // 사이드 보너스 판('break'|'dodge') — 층 미반영
  this.battleSec = data.battleSec || 0;
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
  if (this._replay) return false;              // 연습 판은 층 클리어가 아니다
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
      drop: this.bossDrop || null,
      //  전투 요약(2026-08-23) — 층 클리어는 Result 를 건너뛰므로 도전 화면이
      //  「📊 전투 요약」 버튼으로 이 데이터를 연다.
      report: this.report || null,
      battleSec: this.battleSec || 0,
      bonus: this.bonusRound || null
    }
  });
  return true;
};

//  이 결과가 어느 보드의 것인가 — 랭킹 버튼이 맞는 탭을 열게 한다.
GAME.ResultScene.prototype._rankKind = function () {
  if (this.rtResult) return 'rt';
  if (this.defendTower) return 'dtower';
  if (this.versus) return 'arena';   // ⚠ 대전 보드의 키는 'versus' 가 아니라 'arena' 다(js/score.js KINDS)
  return 'tower';
};

// ── 실시간 재대결 (2026-08-31 태현님 ①) ─────────────────────────────────────
//  방(WS)은 battle 이 정상 종료 판에 한해 살려서 넘긴다. 양쪽이 [한판 더]를 누르면
//  방장이 새 시드를 릴레이하고, 둘 다 같은 역할로 RtFlow.begin → RtPrep 재진입.
//  ⚠ 투표는 1초마다 재전송한다 — 상대가 아직 결과 화면에 못 왔으면(종료 연출 시차)
//    그쪽 수신 핸들러가 없어서 첫 전송이 조용히 버려진다(멱등이라 중복 무해).
GAME.ResultScene.prototype._rtWire = function () {
  if (!this.rtLive || !GAME.NetRoom.connected) return;
  var self = this;
  GAME.NetRoom.on.message = function (from, data) {
    if (!data) return;
    if (data.type === 'rtAgain') {
      self._rtTheirVote = true;
      if (self._rtAgainBtn && self._rtAgainBtn.text && !self._rtVoted)
        self._rtAgainBtn.text.setText('🔔 상대가 한판 더를 원합니다!');
      self._maybeRestart();
    } else if (data.type === 'rtRestart' && data.seed !== undefined) {
      self._rtGo(data.seed);
    }
  };
  GAME.NetRoom.on.close = function () {
    self.rtLive = null;
    if (self._rtAgainBtn && self._rtAgainBtn.text && self._rtAgainBtn.text.scene)
      self._rtAgainBtn.text.setText('(상대가 방을 떠났습니다)');
  };
  //  씬을 떠날 때 — 재대결 전환이 아니면 방을 정리한다(콜백 잔류 방지).
  //  ⚠ 재대결이면 콜백을 **건드리면 안 된다** — _rtGo 의 RtFlow.begin 이 방금
  //    자기 핸들러(rtSetup 수신)를 걸었는데 여기서 null 로 덮으면 세팅 교환이 죽는다.
  this.events.once('shutdown', function () {
    if (self._rtVoteTimer) { clearInterval(self._rtVoteTimer); self._rtVoteTimer = null; }
    if (!self._rtGoing) {
      GAME.NetRoom.on.message = null;
      GAME.NetRoom.on.close = null;
      GAME.NetRoom.leave(true);
    }
  });
};

GAME.ResultScene.prototype._rtAgainClick = function () {
  //  연습 대전 — 같은 난이도로 곧장 다시(준비 화면부터). 방·서버 없음.
  if (this.rtResult && this.rtResult.practice) {
    if (this._rtGoing) return;
    this._rtGoing = true;
    GAME.RtFlow.beginLocal(this.rtResult.practice);
    this.scene.start('RtPrep');
    return;
  }
  if (this._rtVoted || !this.rtLive || !GAME.NetRoom.connected) return;
  this._rtVoted = true;
  var self = this;
  GAME.NetRoom.relay({ type: 'rtAgain' });
  this._rtVoteTimer = setInterval(function () {
    if (self._rtGoing || !GAME.NetRoom.connected) { clearInterval(self._rtVoteTimer); return; }
    GAME.NetRoom.relay({ type: 'rtAgain' });
  }, 1000);
  if (this._rtAgainBtn && this._rtAgainBtn.text)
    this._rtAgainBtn.text.setText('⌛ 상대를 기다리는 중…');
  this._maybeRestart();
};

GAME.ResultScene.prototype._maybeRestart = function () {
  //  방장만 시드를 만든다 — 두 명이 각자 만들면 서로 다른 판이 된다.
  if (!this._rtVoted || !this._rtTheirVote || this._rtGoing) return;
  if (GAME.NetRoom.me !== GAME.NetRoom.host) return;
  var seed = (Math.floor(Math.random() * 0x7fffffff) || 1) >>> 0;
  GAME.NetRoom.relay({ type: 'rtRestart', seed: seed });
  this._rtGo(seed);
};

GAME.ResultScene.prototype._rtGo = function (seed) {
  if (this._rtGoing || !this.rtLive) return;
  this._rtGoing = true;
  if (this._rtVoteTimer) { clearInterval(this._rtVoteTimer); this._rtVoteTimer = null; }
  GAME.RtFlow.begin(this.rtLive.myRole, this.rtLive.theirRole, { seed: seed >>> 0 });
  var sm = GAME.game.scene;
  sm.getScenes(true).forEach(function (s) { sm.stop(s.scene.key); });
  sm.start('RtPrep');
};

GAME.ResultScene.prototype.create = function () {
  // 층 클리어는 화면을 만들지 않고 바로 다음 층 도전 화면으로 넘어간다.
  if (this._skipToNextFloor()) return;

  //  메타 토스트(v3.0) — 이 판에서 새로 달성한 업적·완료한 일일 과제를 띄운다.
  var selfM = this;
  //  첫 전투 가이드 보상(v3.0 B) — 한 번만 나온다(Guide.claim 이 두 번째부터 null).
  try {
    var gw = (GAME.Guide && GAME.Guide.claim) ? GAME.Guide.claim() : null;
    if (gw && gw.gold && GAME.TowerChar && GAME.TowerChar.exists()) {
      var grec = GAME.TowerChar.get();
      grec.gold = (grec.gold || 0) + gw.gold;
      GAME.TowerChar._save(grec);
      if (GAME.MetaToast) GAME.MetaToast.push('🎓 첫 전투 가이드 완료 — 골드 +' + gw.gold);
    }
  } catch (e) {}
  this.time.delayedCall(500, function () {
    if (!selfM.scene.isActive()) return;
    if (GAME.Achievements && GAME.Achievements.flush) GAME.Achievements.flush(selfM);
    if (GAME.Daily && GAME.Daily.flush) GAME.Daily.flush(selfM);
    if (GAME.Progress && GAME.Progress.flush) GAME.Progress.flush(selfM);
    //  클라우드 저장(v3.0 E) — 판이 끝난 진행을 밀어 올린다(디바운스·무변화 미전송).
    if (GAME.CloudSave && GAME.CloudSave.push) { try { GAME.CloudSave.push(); } catch (e) {} }
  });

  var C = GAME.CONFIG.COLORS;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var P = GAME.CONFIG.PORTRAIT;
  var self = this;
  var u = H / 100;
  var bw = Math.min(W - 60, 380);

  this.cameras.main.setBackgroundColor(C.bg);

  // 결과음 — 이겼는지 졌는지를 소리로 먼저 알린다.
  // 방어전은 '내가 막았는가'가 승리이므로 판정이 반대다.
  //  ⚠ 판정을 **한 곳에서만** 낸다. 예전엔 이 블록이 `Sound` 전용이었는데, 음악
  //    스팅어를 붙이면서 같은 조건문을 또 쓰고 싶어진다 — 그러면 방어전의 뒤집힌
  //    판정이 한쪽에서만 반영되어 "이겼는데 패배 음악이 나오는" 상태가 된다.
  var good = this.defendMode || this.defendTower
    ? (this.winner !== 'controller')
    : (this.winner === 'controller');
  //  실시간은 팀 라벨(controller/strategist)이 역할이 아니라 '자리'다 — 내 승패는
  //  rtResult.won 이 안다(winner==='controller' 비교는 손님 쪽에서 반대로 읽힌다).
  if (this.rtResult && !this.rtResult.invalid) good = !!this.rtResult.won;
  this._good = good;   // _buildPhone(별도 메서드)의 도장 훅이 같이 쓴다
  if (GAME.Sound) GAME.Sound.play(good ? 'win' : 'lose');
  //  실시간 재대결 — 방이 살아 있으면 상대의 [한판 더]/재시작 신호를 받는다.
  this._rtWire();
  //  등반 중 쌓인 획득 팝업 — 여기가 "게임 끝난 다음"이다(2026-08-22 태현님).
  //  결과음과 겹치지 않게 반 박자 늦춘다.
  //  ⚠ 700ms 지연 동안 [다음 층]을 누르면 flush 가 증발해 **다음 판 결과에서**
  //    떴다(2026-08-23 태현님 신고). 지연을 줄이고, 놓친 큐는 상점 진입이 받는다.
  if (GAME.DropPopup && GAME.DropPopup.queue.length) {
    this.time.delayedCall(250, function () { GAME.DropPopup.flush(self); });
  }
  // 결과 화면에는 배경음악을 깔지 않는다 — 스팅어가 이 화면의 주인공이다.
  if (GAME.Music) { GAME.Music.stop(); GAME.Music.sting(good ? 'win' : 'lose'); }

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
      //  패배 **사유**를 제목이 말한다 (2026-08-22 태현님: "왜 졌는지는 알아야지") —
      //  시간을 다 쓴 판과 영웅이 쓰러진 판은 다음에 고칠 것이 다르다.
      title = this.timeUp ? '⏳ 타임 오버 — ' + this.tower + '층'
                          : this.tower + '층에서 탈락';
      color = C.accentAlt;
      sub = (this.timeUp ? '제한 시간 안에 진형을 뚫지 못했습니다. 화력을 올리거나 회복·강화 유닛부터 끊어 보세요. '
                         : '영웅이 쓰러졌습니다. ') +
            '같은 층에서 다시 도전할 수 있습니다 — 캐릭터와 성장은 그대로 남습니다.' +
            (this.towerRec ? ' 최고 기록 ' + (this.towerRec.best || 0) + '층.' : '');
    }
  } else if (this.defendTower) {
    // 수성의 탑 — 영웅을 막아냈으면 한 층 올라간다
    var DT = GAME.DefendTower;
    if (this.winner === 'controller') {
      // 2026-08-07 — 패배해도 회차가 안 돌아간다(영구 성장). "1층부터" 문구를 없애고
      //  같은 회차 재도전을 안내한다. **배치를 고칠 수 있다는 것을 여기서 말한다** —
      //  매 패배의 질문이 "무엇을 고칠까"가 되는 것이 이 변경의 노림수다.
      title = this.defendTower + '회차 방어 실패'; color = C.accentAlt;
      sub = '영웅에게 뚫렸습니다. 배치를 고쳐 같은 회차에 다시 도전할 수 있습니다 — ' +
            '골드·유닛 강화·증원은 그대로 남습니다.' +
            (this.towerRec ? ' 최고 기록 ' + (this.towerRec.best || 0) + '회차.' : '');
    } else {
      var nf = this.defendTower + 1;
      //  같은 화면 안에서 단위가 갈리면 안 된다 — 패배 쪽을 '회차'로 바꿨으므로
      //  승리 쪽도 같이 맞춘다(수성의 탑 로비도 '회차'로 부른다).
      title = this.defendTower + '회차 방어 성공'; color = C.accent;
      //  ── 해금을 **여기서 축하한다** (2026-08-07 · 2단계) ─────────────────
      //  ⚠ 새로 열린 것을 말 안 하면 해금이 보상이 아니라 '어느 날 갑자기 늘어난 칸'이
      //    된다. 이 저장소가 축복·구슬에서 두 번 겪은 실패가 정확히 그것이다 —
      //    "받은 줄을 몰랐다". 그래서 판정 문구의 **맨 앞**에 놓는다.
      var got = DT.unlockedBy ? DT.unlockedBy(this.defendTower) : [];
      var gotNames = got.map(function (k) { return GAME.UNITS[k].name; });
      if (gotNames.length) {
        title = '🔓 ' + gotNames.join(' · ') + ' 해금!';
        color = GAME.UI.TXT.crit;
      }
      var nx = DT.nextUnlock ? DT.nextUnlock() : null;
      sub = (gotNames.length
              ? (this.defendTower + '회차를 깼습니다 — ' + gotNames.join('·') + '을(를) 배치할 수 있게 됐습니다. ')
              : ((this.winner === 'draw' ? '시간 안에 뚫지 못했습니다 — 방어 성공. ' : '영웅을 격퇴했습니다. '))) +
            '다음은 ' + nf + '회차 — 오는 영웅 ' +
            GAME.HEROES[DT.heroKeyFor(nf, DT.skillFor(nf))].name +
            ' (예산 ' + DT.heroBudgetFor(nf) + ') vs 내 배치 ' + DT.budgetFor(nf) + '.' +
            //  다음 목표를 늘 보여 준다 — 사다리는 '다음 칸이 보일 때'만 사다리다.
            (nx ? ('  다음 해금: ' + GAME.UNITS[nx.key].name + ' (' + nx.at + '회차)') : '');
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
  } else if (this.rtResult) {
    //  실시간 대전 — 승패보다 **실시간 점수가 얼마나 움직였는지**가 결과다.
    //  공성 트로피와 다른 축이라는 것이 문구에서도 읽혀야 한다.
    var rr = this.rtResult;
    if (rr.invalid) {
      title = '판 무효'; color = C.warn;
      sub = '동기화가 어긋나 이 판은 기록되지 않았습니다. 점수 변동 없음.';
    } else if (rr.practice) {
      //  연습 대전(봇) — 점수 무정산. 난이도만 말한다.
      var lvName = (GAME.RtBot && GAME.RtBot.LEVELS[rr.practice] && GAME.RtBot.LEVELS[rr.practice].name) || rr.practice;
      title = rr.won ? '연습 대전 승리' : '연습 대전 패배'; color = rr.won ? C.accent : C.textDim;
      sub = '봇(' + lvName + ') 상대 연습 — 실시간 점수는 움직이지 않습니다.';
    } else if (rr.won) {
      title = '실시간 대전 승리'; color = C.accent;
      sub = '실시간 점수 +' + rr.delta + ' → ' + rr.score;
    } else {
      title = '실시간 대전 패배'; color = C.accentAlt;
      sub = '실시간 점수 ' + rr.delta + ' → ' + rr.score + '. 다시 도전해 보세요.';
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
  //  📊 전투 요약 (2026-08-23 태현님) — 우상단 버튼. 승리는 '입힌 피해',
  //  패배는 '받은 피해' 탭이 기본으로 열린다(BattleReport 가 처리).
  if (this.report && GAME.BattleReport) {
    var repSelf = this;
    //  ⚠ 폰은 우상단이 보상 열(y=14 시작)의 자리다 — 우상단에 두면 획득 골드
    //    글자를 정확히 덮는다(2026-08-23 태현님 실사고). 왼쪽 열(판정 패널) 아래는
    //    비어 있으므로 거기 둔다. PC 는 우상단이 비어 있어 그대로.
    var rpBtn = GAME.UI.button(this,
      GAME.CONFIG.PHONE ? (16 + 404 / 2) : (W - 110),
      GAME.CONFIG.PHONE ? (GAME.CONFIG.HEIGHT - 38) : 40,
      GAME.CONFIG.PHONE ? 200 : 180, GAME.CONFIG.PHONE ? 44 : 48, '📊 전투 요약',
      function () {
        GAME.BattleReport.open(repSelf, repSelf.report,
          { win: good, sec: repSelf.battleSec });
      }, { fontSize: GAME.CONFIG.PHONE ? 13 : 15 });
    rpBtn.setDepth(50);
    //  전투가 끝나면 요약을 **먼저** 보여준다 (2026-08-23 태현님: "팝업으로 보여주고
    //  닫은 다음에야 메뉴나 상점을 선택할 수 있게") — 베일이 전 화면을 덮으므로
    //  닫기 전에는 아래 버튼이 눌리지 않는다. 버튼은 다시 보기용으로 남는다.
    GAME.BattleReport.open(repSelf, repSelf.report, { win: good, sec: repSelf.battleSec });
    //  겹침 감사 훅 — 버튼을 눌러야 열리는 패널은 씬만 띄워서는 검사가 안 된다.
    if (GAME.__openReport) {
      GAME.__openReport = 0;
      GAME.BattleReport.open(repSelf, repSelf.report, { win: good, sec: repSelf.battleSec });
    }
  }

  if (GAME.CONFIG.PHONE) { this._buildPhone(title, sub, color, tierObj); return; }

  //  생성 승패 도장(도착 시 자동 활성 — uibank). 판정 현수막 뒤에 옅게.
  if (GAME.UIBank) {
    GAME.UIBank.place(this, this._good ? 'stampWin' : 'stampLose',
      W / 2, u * 22, u * 34, u * 34, { alpha: 0.85 });
  }
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
  if (this.tower && this._replay) b1 = '🔁 ' + this.tower + '층 한 번 더 (연습)';
  else if (this.tower) b1 = (this.winner === 'controller' ? (this.tower + 1) + '층 도전' : this.tower + '층 재도전');
  else if (this.defendTower) b1 = (this.winner === 'controller' ? '그대로 재도전' : (this.defendTower + 1) + '회차 방어');
  else if (this.rtResult) {
    //  실시간(2026-08-31 태현님 ①) — 예전 기본 갈래('같은 진형에 다시 도전' →
    //  Draft('__rt'))는 **없는 진형으로 가는 막다른 화면**이었다(판 끝 멈춤의 정체).
    b1 = this.rtResult.practice ? '🔁 다시 (연습 대전)'
       : (this.rtLive && GAME.NetRoom.connected) ? '🔄 한판 더 (상대 동의 시)' : null;
  }
  else if (this.versus) b1 = '다음 상대';
  else if (this.defendMode) b1 = '배치 고쳐 다시';
  else b1 = '같은 진형에 다시 도전';
  if (this.rtResult) {
    if (b1) {
      this._rtAgainBtn = GAME.UI.button(this, W / 2, btnTop, bw, u * 7, b1,
        function () { self._rtAgainClick(); },
        { fill: GAME.UI.COL.panelTeal, line: GAME.CONFIG.COLORS.controller,
          hover: GAME.UI.COL.panelTealHi, color: C.accent, fontSize: P ? 16 : 17 });
    } else {
      GAME.UI.text(this, W / 2, btnTop, '(상대가 방을 떠나 재대결할 수 없습니다)',
        { size: 'caption', color: C.textDim, origin: 0.5 });
    }
    GAME.UI.button(this, W / 2, btnTop + u * 9, bw, u * 6, '🚪 대전 나가기', function () {
      self._rtGoing = false;
      GAME.NetRoom.leave(true);
      self.scene.start('Versus');
    }, { fontSize: P ? 14 : 15 });
    GAME.UI.button(this, W / 2, btnTop + u * 16, bw, u * 5, '← 메뉴로', function () {
      GAME.NetRoom.leave(true);
      self.scene.start('Menu');
    }, { fontSize: P ? 13 : 14 });
    return;
  }
  GAME.UI.button(this, W / 2, btnTop, bw, u * 7, b1, function () {
    // 2026-07-31 — 이 화면의 `self.tower` 분기는 **패배했을 때만** 온다(승리는
    // `_skipToNextFloor` 가 이 화면 자체를 건너뛴다). 그래서 여기는 항상 "같은 층 재도전"
    // 이고, 허브를 한 번 더 거치지 않고 `instantRetry` 로 곧장 그 층 전투로 들어간다.
    if (self.tower && self._replay) { self.scene.start('Tower', { step: 'challenge', instantRetry: true, replayFloor: self.tower }); return; }
    if (self.tower) self.scene.start('Tower', { step: 'challenge', instantRetry: true });
    else if (self.defendTower) {
      // 2026-08-07 — 졌으면 **배치를 그대로 들고 곧장 다시 붙는다**(허브를 안 거친다).
      //  막아냈으면 예전대로 허브로 가서 성장 화면부터 연다.
      if (self.winner === 'controller') {
        self.scene.start('Build', { defendTower: self.defendTower, instantStart: true });
      } else {
        self.scene.start('DefendTower', { cleared: true });
      }
    }
    else if (self.versus) self.scene.start('Versus');
    else if (self.defendMode) self.scene.start('Build');
    else self.scene.start('Draft', { formationId: self.formationId });
  }, { fill: GAME.UI.COL.panelTeal, line: GAME.CONFIG.COLORS.controller, hover: GAME.UI.COL.panelTealHi, color: C.accent, fontSize: P ? 17 : 18 });

  // ── 탑 패배 화면의 갈래는 넷이다 (2026-08-01 사용자 신고: "로비로 가는 버튼이 없어") ──
  //  재도전 / 상점 / 능력치 / 로비. 예전엔 '일반 대전으로' 하나뿐이라 **탑 안에서
  //  성장하러 갈 길이 화면에 없었다** — 진 직후가 바로 장비를 보러 갈 순간인데도.
  if (this.tower) {
    var tc = GAME.Layout.cols(3, { gap: 8, width: bw, left: (W - bw) / 2, pad: 0 });
    var opts = [
      ['🛒 상점', function () { self.scene.start('TowerShop', { tab: 'item' }); }],
      ['⚒ 능력치', function () { self.scene.start('TowerShop', { tab: 'stats' }); }],
      ['🏠 로비', function () { self.scene.start('Tower', { step: 'challenge' }); }]
    ];
    opts.forEach(function (o, i) {
      GAME.UI.button(self, tc[i].cx, btnTop + u * 9, tc[i].w, u * 6, o[0], o[1],
        { fontSize: P ? 13 : 15 });
    });
    GAME.UI.button(this, W / 2, btnTop + u * 16, bw, u * 5, '← 메뉴로', function () {
      self.scene.start('Menu');
    }, { fontSize: P ? 13 : 14 });
  } else {
    GAME.UI.button(this, W / 2, btnTop + u * 9, bw, u * 6,
      //  ⚠ 아래에 이미 '메뉴' 버튼이 있다. 여기까지 '메뉴로'로 두면 같은 곳으로 가는
      //    버튼이 두 개가 된다(QA 실측: 대전·수성의 탑 결과 화면). 각 모드에서
      //    **다음에 할 만한 것**으로 바꾼다.
      this.defendTower ? '🛠 배치 고치기'
        : (this.versus ? '⚔ 다시 대전' : (this.defendMode ? '컨트롤러로 도전' : '다른 진형 고르기')),
      function () {
        // 배치 수정은 **항상 열려 있다**(사용자 지시) — 이긴 판에서도 다음 회차를
        //  들어가기 전에 고칠 수 있어야 한다.
        if (self.defendTower) {
          self.scene.start('Build', { defendTower: GAME.DefendTower.get().floor });
          return;
        }
        if (self.versus) { self.scene.start('Versus'); return; }
        self.scene.start('Select');
      }, { fontSize: P ? 15 : 16 });
  }

  var rc = GAME.Layout.cols(2, { gap: 10, width: bw, left: (W - bw) / 2, pad: 0 });
  //  ⚠ **방금 한 것의 보드**로 가야 한다. 예전에는 분류를 안 넘겨서 `kindDef(undefined)`
  //    가 첫 항목(통곡의 탑)으로 떨어졌다 — 대전에서 이겨도 탑 보드가 열렸다.
  //    `scope:'live'` 도 이제 없는 기간이라 죽은 인자였다(rank.js:26 주석 참조).
  GAME.UI.button(this, rc[0].cx, btnTop + u * 18, rc[0].w, u * 6, '🏆 랭킹', function () {
    self.scene.start('Rank', { kind: self._rankKind(), scope: 'all' });
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

  //  생성 승패 도장(도착 시 자동 활성) — 왼쪽 기둥 하단의 빈 들판 자리.
  if (GAME.UIBank) {
    GAME.UIBank.place(this, this._good ? 'stampWin' : 'stampLose',
      PAD + LW / 2, H * 0.62, 200, 200, { alpha: 0.85 });
  }
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

  //  실시간(폰) — 큰 버튼 = [한판 더], 아랫줄 = 나가기·랭킹·메뉴 (2026-08-31 ①).
  if (this.rtResult) {
    if (this.rtResult.practice || (this.rtLive && GAME.NetRoom.connected)) {
      this._rtAgainBtn = UI.button(this, rx + rw / 2, mainTop + mainH / 2, rw, mainH,
        this.rtResult.practice ? '🔁 다시 (연습)' : '🔄 한판 더', function () { self._rtAgainClick(); },
        { fill: UI.COL.panelTeal, line: GAME.CONFIG.COLORS.controller,
          hover: UI.COL.panelTealHi, color: C.accent, fontSize: 18 });
    } else {
      UI.text(this, rx + rw / 2, mainTop + mainH / 2, '(상대가 방을 떠났습니다)',
        { size: 'caption', color: C.textDim, origin: 0.5 });
    }
    var bcR = GAME.Layout.cols(3, { gap: 10, width: rw, left: rx, pad: 0 });
    [['🚪 나가기', function () { GAME.NetRoom.leave(true); self.scene.start('Versus'); }],
     ['🏆 랭킹', function () { self.scene.start('Rank', { kind: 'rt', scope: 'all' }); }],
     ['메뉴', function () { GAME.NetRoom.leave(true); self.scene.start('Menu'); }]
    ].forEach(function (o, i) {
      UI.button(self, bcR[i].cx, secTop + secH / 2, bcR[i].w, secH, o[0], o[1], { fontSize: 15 });
    });
    return;
  }

  var b1;
  // 2026-08-01 — 패배해도 층이 안 돌아가므로 재도전 문구도 같은 층을 가리킨다.
  if (this.tower && this._replay) b1 = '🔁 ' + this.tower + '층 한 번 더 (연습)';
  else if (this.tower) b1 = (this.winner === 'controller' ? (this.tower + 1) + '층 도전' : this.tower + '층 재도전');
  else if (this.defendTower) b1 = (this.winner === 'controller' ? '그대로 재도전' : (this.defendTower + 1) + '회차 방어');
  else if (this.versus) b1 = '다음 상대';
  else if (this.defendMode) b1 = '배치 고쳐 다시';
  else b1 = '같은 진형에 다시 도전';

  UI.button(this, rx + rw / 2, mainTop + mainH / 2, rw, mainH, b1, function () {
    if (self.tower && self._replay) {
      self.scene.start('Tower', { step: 'challenge', instantRetry: true, replayFloor: self.tower });
      return;
    }
    // 2026-07-31 — 이 화면의 `self.tower` 분기는 **패배했을 때만** 온다(승리는
    // `_skipToNextFloor` 가 이 화면 자체를 건너뛴다). 그래서 여기는 항상 "같은 층 재도전"
    // 이고, 허브를 한 번 더 거치지 않고 `instantRetry` 로 곧장 그 층 전투로 들어간다.
    if (self.tower) self.scene.start('Tower', { step: 'challenge', instantRetry: true });
    else if (self.defendTower) {
      // 2026-08-07 — 졌으면 **배치를 그대로 들고 곧장 다시 붙는다**(허브를 안 거친다).
      //  막아냈으면 예전대로 허브로 가서 성장 화면부터 연다.
      if (self.winner === 'controller') {
        self.scene.start('Build', { defendTower: self.defendTower, instantStart: true });
      } else {
        self.scene.start('DefendTower', { cleared: true });
      }
    }
    else if (self.versus) self.scene.start('Versus');
    else if (self.defendMode) self.scene.start('Build');
    else self.scene.start('Draft', { formationId: self.formationId });
  }, { fill: UI.COL.panelTeal, line: GAME.CONFIG.COLORS.controller,
       hover: UI.COL.panelTealHi, color: C.accent, fontSize: 19 });

  var bc = GAME.Layout.cols(3, { gap: 10, width: rw, left: rx, pad: 0 });
  // 탑 패배 화면은 **성장하러 가는 길**이 있어야 한다(사용자 신고: 로비 버튼이 없다).
  // 재도전은 위 큰 버튼이 맡으므로 여기 셋은 상점·능력치·로비다.
  var row = this.tower
    ? [['🛒 상점', function () { self.scene.start('TowerShop', { tab: 'item' }); }],
       ['⚒ 능력치', function () { self.scene.start('TowerShop', { tab: 'stats' }); }],
       ['🏠 로비', function () { self.scene.start('Tower', { step: 'challenge' }); }]]
    : [[(this.defendTower ? '🛠 배치 고치기' : (this.versus ? '메뉴로'
          : (this.defendMode ? '컨트롤러로 도전' : '다른 진형'))),
        function () {
          // 배치 수정은 **항상 열려 있다**(사용자 지시) — 이긴 판에서도 다음 회차를
          //  들어가기 전에 고칠 수 있어야 한다.
          if (self.defendTower) {
            self.scene.start('Build', { defendTower: GAME.DefendTower.get().floor });
            return;
          }
          self.scene.start(self.versus ? 'Menu' : 'Select');
        }],
       ['🏆 랭킹', function () { self.scene.start('Rank', { kind: self._rankKind(), scope: 'all' }); }],
       ['메뉴', function () { self.scene.start('Menu'); }]];
  row.forEach(function (o, i) {
    UI.button(self, bc[i].cx, secTop + secH / 2, bc[i].w, secH, o[0], o[1], { fontSize: 15 });
  });
};
