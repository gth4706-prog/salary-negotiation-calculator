window.GAME = window.GAME || {};

// ============================================================================
//  실시간 대전 준비 흐름 (2026-08-22 태현님 사양)
//
//  "각각 컨트롤러할지 전략가할지 고른 다음, 둘 다 준비 완료하면 같은 골드 수준에서
//   전략가는 배치를 고르고 컨트롤러는 영웅·아이템·스킬을 사는 시간을 1분 줘야 해.
//   그다음 전투 준비 완료하면 게임으로 들어가는 거야."
//
//  ## 왜 씬이 아니라 전역 모듈인가
//  준비 단계에서 컨트롤러는 **상점(TowerShop)을 다녀온다** — 씬이 바뀌는 동안에도
//  상대의 세팅(rtSetup)이 도착할 수 있다. 씬에 상태를 두면 상점을 다녀오는 사이
//  받은 세팅이 유실된다(씬 shutdown 이 NetRoom 콜백을 뗀다). 그래서 교환 상태와
//  타이머를 여기(전역)에 두고, 씬(RtPrep)은 그리기만 한다.
//
//  ## 흐름
//  로비: 역할 선택 → [준비 완료] → 서버 start(seed) → RtFlow.begin() → RtPrep 씬
//  RtPrep: 60초 안에 전략가 = 배치 선택 / 컨트롤러 = 대전 준비창(예산 500)
//          → [전투 준비 완료] → commitMine() → 양쪽 세팅이 모이면 Battle
//  시간이 다 되면 자동 확정(컨트롤러 = 대전 준비창 마지막 구성 · 전략가 = 첫 저장 배치).
// ============================================================================
GAME.RtFlow = {
  PREP_MS: 60000,

  active: false,
  myRole: null,
  theirRole: null,
  startMsg: null,
  mySetup: null,
  theirSetup: null,
  deadline: 0,
  _started: false,
  _rttFrozen: null,
  _tickId: null,

  begin: function (myRole, theirRole, startMsg) {
    this.active = true;
    this.myRole = myRole;
    this.theirRole = theirRole;
    this.startMsg = startMsg;
    this.mySetup = null;
    this.theirSetup = null;
    this._started = false;
    this._rttFrozen = null;
    this.deadline = Date.now() + this.PREP_MS;
    var self = this;
    //  ⚠ NetRoom 콜백을 **여기서 쥔다** — RtPrep 이 상점을 다녀와도 안 끊긴다.
    //    Battle 이 시작되면 battle.js 가 다시 가져간다(교대 계약).
    GAME.NetRoom.on.message = function (from, data) {
      if (data && data.type === 'rtSetup' && data.setup) {
        self.theirSetup = data.setup;
        self.maybeBattle();
      }
    };
    GAME.NetRoom.on.close = function (info) {
      if (!info || !info.byUser) self.abort('상대의 연결이 끊겼습니다');
    };
    if (this._tickId) clearInterval(this._tickId);
    this._tickId = setInterval(function () { self._check(); }, 500);
  },

  remainMs: function () { return Math.max(0, this.deadline - Date.now()); },

  _check: function () {
    if (!this.active) { this._stopTick(); return; }
    //  시간이 다 되면 내 세팅을 자동 확정한다 — 상대만 기다리는 상태로는 안 넘어간다.
    if (!this.mySetup && this.remainMs() <= 0) this.commitDefault();
  },

  _stopTick: function () {
    if (this._tickId) { clearInterval(this._tickId); this._tickId = null; }
  },

  //  자동 확정 — 컨트롤러: 대전 준비창의 마지막 구성. 전략가: 첫 저장 배치.
  commitDefault: function () {
    if (this.mySetup || !this.active) return;
    if (this.myRole === 'strategist') {
      var list = GAME.Formations.loadSaved();
      var f = list && list[0];
      if (!f) { this.abort('저장된 배치가 없습니다'); return; }
      this.commitMine(this.buildStrategistSetup(f));
    } else {
      this.commitMine(this.buildControllerSetup());
    }
  },

  //  세팅 조립 — 양쪽 클라이언트가 이 스냅샷만으로 같은 영웅/진형을 만든다(결정론).
  buildControllerSetup: function () {
    var rec = GAME.ArenaBuild ? GAME.ArenaBuild.get() : {};
    return {
      role: 'controller',
      heroKey: rec.heroKey || 'vanguard',
      picks: rec.picks || GAME.defaultSkillPicks(),
      items: rec.items || {}
    };
  },
  buildStrategistSetup: function (f) {
    return { role: 'strategist',
             formation: { name: f.name || '', units: f.units } };
  },

  commitMine: function (setup) {
    if (!this.active || this.mySetup) return;
    //  rtt 는 한 번만 얼린다 — 양쪽이 (내 rtt, 상대 rtt)의 같은 쌍으로 같은 지연을
    //  계산해야 한다. 재전송 때 값이 바뀌면 세션 지연이 갈라져 desync 다.
    if (this._rttFrozen == null)
      this._rttFrozen = Math.round(GAME.NetRoom.bestRtt() || 180);
    setup.rtt = this._rttFrozen;
    setup.rtScore = GAME.RtScore ? GAME.RtScore.get().score : 0;
    this.mySetup = setup;
    GAME.NetRoom.relay({ type: 'rtSetup', setup: setup });
    this.maybeBattle();
  },

  //  유실 대비 재전송 — 값 불변으로 그대로 다시.
  resend: function () {
    if (this.mySetup) GAME.NetRoom.relay({ type: 'rtSetup', setup: this.mySetup });
  },

  maybeBattle: function () {
    if (this._started || !this.active) return;
    if (!this.mySetup || !this.theirSetup || !this.startMsg) return;
    this._started = true;
    this._stopTick();
    var NR = GAME.NetRoom;
    //  팀 라벨: 방장 = 'controller' 팀 · 손님 = 'strategist' 팀 (역할과 무관한 자리 이름).
    var meTeam = (NR.me === NR.host) ? 'controller' : 'strategist';
    var oneWay = ((this.mySetup.rtt || 180) + (this.theirSetup.rtt || 180)) / 2;
    var delay = Math.max(3, Math.min(24, Math.ceil(oneWay * 1.15 / 33.4) + 2));
    var heroKey = this.mySetup.heroKey || this.theirSetup.heroKey || 'vanguard';
    var rt = {
      seed: this.startMsg.seed >>> 0,
      meTeam: meTeam,
      delay: delay,
      my: this.mySetup,
      their: this.theirSetup
    };
    this.active = false;
    var sm = GAME.game.scene;
    sm.getScenes(true).forEach(function (s) { sm.stop(s.scene.key); });
    sm.start('Battle', { rt: rt, heroKey: heroKey, formationId: null });
  },

  abort: function (msg) {
    this._stopTick();
    if (!this.active) return;
    this.active = false;
    GAME.NetRoom.on.message = null;
    GAME.NetRoom.on.close = null;
    GAME.NetRoom.leave(true);
    var sm = GAME.game && GAME.game.scene;
    if (sm) {
      var prep = sm.getScene('RtPrep');
      if (prep && prep.scene.isActive()) {
        sm.getScenes(true).forEach(function (s) { sm.stop(s.scene.key); });
        sm.start('Versus');
      }
    }
    this.lastAbort = msg || null;
  }
};
