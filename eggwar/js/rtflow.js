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
    this.local = false;
    this.botLevel = null;
    this.myRole = myRole;
    this.theirRole = theirRole;
    this.startMsg = startMsg;
    this.mySetup = null;
    this.theirSetup = null;
    this.myHeroPick = null;     //  지난 판의 영웅 선택이 새 판에 새지 않게
    //  컨트롤러 — 판마다 **초기화된** 임시 빌드(예산 500 드래프트, 2026-08-24 태현님 ④).
    //  이월 없음 · 저장 안 됨. TowerShop(mode:'arena') 왕복이 전부 여기에 쌓인다.
    if (GAME.ArenaBuild) {
      if (myRole === 'controller') GAME.ArenaBuild.rtBegin();
      else GAME.ArenaBuild.rtEnd();
    }
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

  //  ── 연습 대전(봇) — 방·서버 없이 같은 준비 흐름을 탄다 (v3.0, 2026-09-02) ──
  //  NetRoom 콜백을 **하나도 안 건다.** 상대 세팅은 commitMine 이 봇 세팅으로 채운다.
  local: false,
  botLevel: null,
  beginLocal: function (level) {
    this.active = true;
    this.local = true;
    this.botLevel = level || 'normal';
    this.myRole = 'controller';
    this.theirRole = 'controller';
    this.startMsg = { seed: (Math.floor(Math.random() * 0xffffffff) >>> 0) };
    this.mySetup = null;
    this.theirSetup = null;
    this.myHeroPick = null;
    if (GAME.ArenaBuild) GAME.ArenaBuild.rtBegin();
    this._started = false;
    this._rttFrozen = 0;
    this.deadline = Date.now() + this.PREP_MS;
    var self = this;
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
  //  2026-08-23 태현님: "영웅은 모두 초기화된 상태로 서로 골라야 한다" —
  //  대전 상점(예산·아이템)을 접고, 준비 화면에서 고른 영웅 + 기본 스킬픽만.
  myHeroPick: null,
  setHeroPick: function (k) {
    this.myHeroPick = k;
    //  임시 빌드에도 같은 영웅을 — 상점(TowerShop)이 rec.heroKey 를 보고 그린다.
    if (GAME.ArenaBuild && GAME.ArenaBuild._rtRec) GAME.ArenaBuild._rtRec.heroKey = k;
  },
  buildControllerSetup: function (heroKey) {
    //  드래프트 반영(2026-08-24 태현님 ④) — 준비 중 상점에서 산 아이템·스킬픽을
    //  세팅 스냅샷에 싣는다. 상점을 안 다녀왔으면 DEFAULT 그대로 = 기본 스펙.
    var rec = (GAME.ArenaBuild && GAME.ArenaBuild._rtRec) || null;
    return {
      role: 'controller',
      heroKey: heroKey || this.myHeroPick || (rec && rec.heroKey) || 'vanguard',
      picks: (rec && rec.picks) || GAME.defaultSkillPicks(),
      items: (rec && rec.items) || {},
      stats: (rec && rec.rtStats) || {}      //  실시간 능력치(행운 포함) — 2026-08-31
    };
  },
  buildStrategistSetup: function (f) {
    return { role: 'strategist',
             formation: { name: f.name || '', units: f.units } };
  },

  commitMine: function (setup) {
    if (!this.active || this.mySetup) return;
    //  입력 지연은 여기서 얼리는 rtt 로 정해진다. P2P 직결이 아직 안 붙었으면 서버
    //  경유 rtt(수백 ms)가 판 내내 굳는다 — "렉" 신고의 한 축(2026-09-02). 직결이
    //  붙을 때까지 **최대 1.5초**만 기다렸다가 얼린다(양쪽 같은 규칙이라 안전하고,
    //  기다리는 동안도 준비 시간은 흐른다).
    if (!this.local && this._rttFrozen == null && GAME.NetRtc && !GAME.NetRtc.ready() &&
        GAME.NetRoom.peers && GAME.NetRoom.peers.length >= 2 && !this._rttWaiting) {
      var selfW = this, waited = 0;
      this._rttWaiting = true;
      var iv = setInterval(function () {
        waited += 100;
        if (GAME.NetRtc.ready() || waited >= 1500 || !selfW.active) {
          clearInterval(iv);
          selfW._rttWaiting = false;
          if (selfW.active) selfW.commitMine(setup);
        }
      }, 100);
      return;
    }
    //  rtt 는 한 번만 얼린다 — 양쪽이 (내 rtt, 상대 rtt)의 같은 쌍으로 같은 지연을
    //  계산해야 한다. 재전송 때 값이 바뀌면 세션 지연이 갈라져 desync 다.
    if (this._rttFrozen == null)
      this._rttFrozen = Math.round(GAME.NetRoom.bestRtt() || 180);
    setup.rtt = this._rttFrozen;
    setup.rtScore = GAME.RtScore ? GAME.RtScore.get().score : 0;
    this.mySetup = setup;
    if (this.local) {
      //  연습 대전 — 상대는 봇. 내 영웅과 다른 영웅을 우선 고른다(시드 결정적).
      this.theirSetup = GAME.RtBot.botSetup(this.botLevel, this.startMsg.seed, setup.heroKey);
      this.maybeBattle();
      return;
    }
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
    //  세팅 스냅샷에 이미 실렸다 — 임시 빌드는 여기서 닫는다(전투·일반 대전 오염 방지).
    if (GAME.ArenaBuild) GAME.ArenaBuild.rtEnd();
    var NR = GAME.NetRoom;
    //  팀 라벨: 방장 = 'controller' 팀 · 손님 = 'strategist' 팀 (역할과 무관한 자리 이름).
    //  연습 대전은 언제나 내가 'controller' 팀 · 지연 2틱(네트워크 없음).
    var meTeam = this.local ? 'controller' : ((NR.me === NR.host) ? 'controller' : 'strategist');
    var oneWay = ((this.mySetup.rtt || 180) + (this.theirSetup.rtt || 180)) / 2;
    var delay = this.local ? 2 : Math.max(3, Math.min(24, Math.ceil(oneWay * 1.15 / 33.4) + 2));
    var heroKey = this.mySetup.heroKey || this.theirSetup.heroKey || 'vanguard';
    var rt = {
      seed: this.startMsg.seed >>> 0,
      meTeam: meTeam,
      delay: delay,
      my: this.mySetup,
      their: this.theirSetup,
      local: !!this.local,
      botLevel: this.local ? this.botLevel : null
    };
    this.active = false;
    var sm = GAME.game.scene;
    sm.getScenes(true).forEach(function (s) { sm.stop(s.scene.key); });
    sm.start('Battle', { rt: rt, heroKey: heroKey, formationId: null });
  },

  abort: function (msg) {
    this._stopTick();
    if (GAME.ArenaBuild) GAME.ArenaBuild.rtEnd();
    if (!this.active) return;
    this.active = false;
    if (!this.local) {
      GAME.NetRoom.on.message = null;
      GAME.NetRoom.on.close = null;
      GAME.NetRoom.leave(true);
    }
    this.local = false;
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
