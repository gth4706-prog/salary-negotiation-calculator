window.GAME = window.GAME || {};

// ============================================================================
//  실시간 대결 방 화면 (P3-1, 2026-08-20)
//
//  흐름: 방 목록 → [방 만들기] 또는 방 줄 클릭/코드 입장 → 대기(상대·지연 표시)
//        → [준비] → 둘 다 준비되면 서버가 start(seed) → 진형 교환 → Battle(rt).
//
//  ⚠ 아직 versus 화면에 입구가 없다 — 전투 배선(P3-2)이 끝나기 전에는
//    사용자에게 노출하지 않는다(반쪽 금지). 개발 진입: scene.start('RtLobby').
//  ⚠ 시드·시작은 서버가 정한다(netroom 'start'). 진형은 start 후 relay 로 맞교환 —
//    둘 다 받으면 Battle 로 넘어간다. 코드는 대문자 4자(방 서버 makeCode).
// ============================================================================
GAME.RtLobbyScene = function () {
  Phaser.Scene.call(this, { key: 'RtLobby' });
};
GAME.RtLobbyScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.RtLobbyScene.prototype.constructor = GAME.RtLobbyScene;

GAME.RtLobbyScene.prototype.init = function () {
  this._rows = [];
  this._status = null;
  this._peersTxt = null;
  this._readyBtn = null;
  this._codeTxt = null;
  this._joined = false;
  this._ready = false;
  this._started = false;
  this._myRole = null;
  this._theirRole = null;
  this._mySetup = null;         // { role, formation | heroKey+picks, rtt }
  this._theirSetup = null;
  this._myRttSent = null;       // ⚠ 첫 전송 때 얼린다 — 재전송마다 갱신하면 양쪽 지연 계산이 갈라진다
  this._roleBtnS = null;
  this._roleBtnC = null;
  this._roleTxt = null;
  this._startMsg = null;
  this._dom = null;
};

GAME.RtLobbyScene.prototype.create = function () {
  var C = GAME.CONFIG.COLORS, UI = GAME.UI;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var PH = GAME.CONFIG.PHONE;
  var self = this;
  var u = H / 100;

  this.cameras.main.setBackgroundColor(C.bg);
  if (GAME.Music) GAME.Music.play('versus');

  UI.text(this, W / 2, u * 3, '⚡ 실시간 대결',
    { size: PH ? 'subhead' : 'title', color: C.accent, origin: 0.5, originY: 0 });
  this._status = UI.text(this, W / 2, u * 3 + (PH ? 30 : 54), '',
    { size: 'micro', color: C.textDim, origin: 0.5, originY: 0 });

  // ── NetRoom 콜백 — 씬이 죽은 뒤 불리면 안 된다: shutdown 에서 전부 뗀다 ──
  var NR = GAME.NetRoom;
  NR.on.open = function () { self._onRoom(); };
  NR.on.peers = function () { self._onRoom(); };
  NR.on.rtt = function () { self._onRoom(); };
  NR.on.error = function (msg) { self._setStatus('⚠ ' + msg); };
  NR.on.close = function (info) {
    if (!info || !info.byUser) self._setStatus('연결이 끊겼습니다');
  };
  NR.on.start = function (msg) { self._onStart(msg); };
  NR.on.message = function (from, data) { self._onRelay(from, data); };
  this.events.once('shutdown', function () {
    GAME.NetRoom.on = {};
    if (self._dom && self._dom.parentNode) self._dom.parentNode.removeChild(self._dom);
    // 전투로 넘어갈 때는 연결을 유지해야 한다 — 나갈 때만 끊는다.
    if (!self._started) GAME.NetRoom.leave(true);
  });

  // ── 왼쪽: 방 목록 ──
  var listTop = u * 16;
  this._listTop = listTop;
  this._refreshList();

  // ── 오른쪽/하단: 버튼들 ──
  var bw = Math.min(W - 30, 380), bh = Math.max(UI.BTN_H || 58, u * (PH ? 13 : 10));
  UI.button(this, W / 2, H - u * 26, bw, bh, '🏟 방 만들기', function () {
    if (self._joined) return;
    self._setStatus('방을 만드는 중…');
    GAME.NetRoom.createRoom({}, function (err, room) {
      if (err) { self._setStatus('⚠ 방 만들기 실패: ' + err.message); return; }
      GAME.NetRoom.join(room.code);
    });
  });
  UI.button(this, W / 2, H - u * 26 + bh + 8, bw, bh, '🔑 코드로 입장', function () {
    if (self._joined) return;
    self._askCode();
  });
  var mh = Math.max(UI.BTN_H_SM || 52, u * 7);
  UI.button(this, 76, Math.max(mh / 2 + 6, u * 3.4), 120, mh, '← 대전',
    function () { self.scene.start('Versus'); }, { fontSize: 14 });

  // 방 상태 표시(코드·인원·지연) + 준비 버튼 — 입장하면 나타난다
  this._codeTxt = UI.text(this, W / 2, listTop - u * 6, '',
    { size: PH ? 'subhead' : 'head', color: C.accentAlt, origin: 0.5 });
  this._peersTxt = UI.text(this, W / 2, listTop + u * 2, '',
    { size: PH ? 'caption' : 'body', color: C.text, origin: 0.5, originY: 0 });
  this._peersTxt.setAlign('center');

  this._setStatus(GAME.NetRoom.enabled() ? '방을 만들거나 코드로 입장하세요' : '실시간 대전 준비 중');
};

GAME.RtLobbyScene.prototype._setStatus = function (s) {
  if (this._status && this._status.scene) this._status.setText(s);
};

// ── 방 목록 ──
GAME.RtLobbyScene.prototype._refreshList = function () {
  var self = this, UI = GAME.UI, C = GAME.CONFIG.COLORS;
  var W = GAME.CONFIG.WIDTH;
  GAME.NetRoom.listRooms(function (err, res) {
    if (!self.scene || !self.scene.isActive()) return;
    if (self._joined) return;
    self._rows.forEach(function (r) { r.destroy(); });
    self._rows = [];
    if (err || !res || !res.rooms || !res.rooms.length) {
      var t = UI.text(self, W / 2, self._listTop + 40,
        err ? '방 목록을 받지 못했습니다' : '지금 열린 방이 없습니다 — 방을 만들면 상대가 들어올 수 있습니다',
        { size: 'caption', color: C.textDim, origin: 0.5 });
      self._rows.push(t);
      return;
    }
    res.rooms.slice(0, 4).forEach(function (r, i) {
      var b = UI.button(self, W / 2, self._listTop + 40 + i * 66, Math.min(W - 30, 560), 58,
        '방 ' + r.code + '   ·   ' + r.host + '   ·   ' + r.members + '/2명',
        function () { GAME.NetRoom.join(r.code); }, { fontSize: 14 });
      self._rows.push(b.rect || b); if (b.text) self._rows.push(b.text);
    });
  });
};

// ── 코드 입력 — DOM input(로그인 씬과 같은 방식; Phaser 에는 텍스트 입력이 없다) ──
GAME.RtLobbyScene.prototype._askCode = function () {
  var self = this;
  if (this._dom) return;
  var el = document.createElement('input');
  el.type = 'text'; el.maxLength = 6; el.placeholder = '방 코드 (예: BS6V)';
  el.style.cssText = 'position:fixed;left:50%;top:40%;transform:translate(-50%,-50%);' +
    'z-index:40;font-size:22px;padding:10px 14px;text-transform:uppercase;width:220px;' +
    'border:2px solid #7a6a4a;border-radius:10px;text-align:center;';
  document.body.appendChild(el);
  el.focus();
  this._dom = el;
  el.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') {
      var code = el.value.trim().toUpperCase();
      el.parentNode.removeChild(el); self._dom = null;
      if (code) GAME.NetRoom.join(code);
    } else if (ev.key === 'Escape') {
      el.parentNode.removeChild(el); self._dom = null;
    }
  });
};

// ── 입장 후: 역할 선택 → 준비 (2026-08-20 태현님 사양) ──────────────────────
//  한쪽은 전략가(진형), 한쪽은 컨트롤러(영웅) — 게임 본연의 비대칭 그대로.
//  준비는 **역할이 서로 다를 때만** 켜진다. 전략가는 저장된 내 전장이 있어야 한다.
GAME.RtLobbyScene.prototype._onRoom = function () {
  var NR = GAME.NetRoom, UI = GAME.UI, C = GAME.CONFIG.COLORS;
  var self = this;
  if (!this.scene || !this.scene.isActive()) return;
  if (!NR.connected) return;
  if (!this._joined) {
    this._joined = true;
    this._rows.forEach(function (r) { r.destroy(); });
    this._rows = [];
    var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
    var bh = Math.max(UI.BTN_H || 58, 56);
    var y0 = this._listTop + H * 0.10;
    this._roleBtnS = UI.button(this, W / 2 - 170, y0, 320, bh, '🛡 전략가 (진형으로 막는다)',
      function () { self._pickRole('strategist'); },
      { fill: UI.COL.panelPurple, line: GAME.CONFIG.COLORS.strategist, fontSize: 14 });
    this._roleBtnC = UI.button(this, W / 2 + 170, y0, 320, bh, '⚔ 컨트롤러 (영웅으로 뚫는다)',
      function () { self._pickRole('controller'); },
      { fill: UI.COL.panelTeal, line: GAME.CONFIG.COLORS.controller, fontSize: 14 });
    this._readyBtn = UI.button(this, W / 2, y0 + bh + 14, 320, bh, '⚔ 준비 완료',
      function () { self._toggleReady(); });
    this._roleTxt = UI.text(this, W / 2, y0 + bh * 2 + 26, '',
      { size: 'caption', color: C.textDim, origin: 0.5 });
    this._roleTxt.setAlign('center');
  }
  this._codeTxt.setText('방 코드  ' + NR.code);
  var names = NR.peers.map(function (p) { return p.id + (p.id === NR.host ? ' (방장)' : ''); });
  this._peersTxt.setText(names.join('   vs   ') +
    (NR.peers.length < 2 ? '\n상대를 기다리는 중 — 코드를 알려주세요' :
      (NR.rttMs != null ? '\n왕복 지연 ' + Math.round(NR.rttMs) + 'ms' : '')));
  this._refreshRoleUi();
  this._setStatus(NR.statusText());
};

GAME.RtLobbyScene.prototype._pickRole = function (role) {
  if (this._ready) return;                       // 준비를 풀어야 역할을 바꿀 수 있다
  this._myRole = (this._myRole === role) ? null : role;
  GAME.NetRoom.relay({ type: 'rtRole', role: this._myRole });
  this._refreshRoleUi();
};

GAME.RtLobbyScene.prototype._roleOk = function () {
  //  2026-08-21 태현님: 컨트롤러끼리도, 전략가가 손님이어도 싸울 수 있어야 한다.
  //  전략가 vs 전략가만 아직 막는다 — 영웅 없는 화면(HUD·시점)이 준비되지 않았다.
  if (!this._myRole) return '역할을 고르세요';
  if (this._theirRole === 'strategist' && this._myRole === 'strategist')
    return '전략가끼리의 대전은 다음 업데이트에서 — 한쪽은 컨트롤러로';
  if (this._myRole === 'strategist' && !GAME.Formations.loadSaved().length)
    return '전략가는 저장된 배치가 필요합니다 (대전 → 내 전장 만들기)';
  if (GAME.NetRoom.peers.length < 2) return '상대를 기다리는 중';
  return null;
};

GAME.RtLobbyScene.prototype._refreshRoleUi = function () {
  if (!this._roleTxt || !this._roleTxt.scene) return;
  var mark = function (btn, on) { if (btn && btn.text) btn.text.setAlpha(on ? 1 : 0.55); };
  mark(this._roleBtnS, this._myRole !== 'controller');
  mark(this._roleBtnC, this._myRole !== 'strategist');
  var why = this._roleOk();
  var mine = this._myRole === 'strategist' ? '나: 🛡 전략가' :
             this._myRole === 'controller' ? '나: ⚔ 컨트롤러' : '나: (선택 전)';
  var theirs = this._theirRole === 'strategist' ? '상대: 🛡 전략가' :
               this._theirRole === 'controller' ? '상대: ⚔ 컨트롤러' : '상대: (선택 전)';
  this._roleTxt.setText(mine + '   ·   ' + theirs + (why ? ('\n' + why) : '\n준비를 누르면 시작됩니다'));
};

GAME.RtLobbyScene.prototype._toggleReady = function () {
  var why = this._roleOk();
  if (why) { this._setStatus('⚠ ' + why); return; }
  if (this._ready) {                              // 취소
    this._ready = false;
    GAME.NetRoom.setReady(false);
    this._readyBtn.text.setText('⚔ 준비 완료');
    return;
  }
  //  3번 사양(2026-08-21): 들어가서 **고른다** — 전략가는 배치, 컨트롤러는 영웅.
  this._openSetupPick();
};

//  세팅 선택 — 고르는 순간 준비가 걸리고 세팅이 상대에게 간다.
GAME.RtLobbyScene.prototype._openSetupPick = function () {
  var self = this;
  if (this._myRole === 'strategist') {
    var list = GAME.Formations.loadSaved();
    GAME.Modal.open(this, {
      title: '🛡 어느 배치로 싸울까요?',
      items: list.map(function (f) {
        return { key: f.id, name: f.name || '(이름 없음)',
                 note: (f.units ? f.units.length : 0) + '기' };
      }),
      onPick: function (it) {
        var f = GAME.Formations.getById(it.key);
        if (!f) return;
        self._commitSetup({ role: 'strategist',
          formation: { name: f.name || '', units: f.units } });
      }
    });
  } else {
    GAME.Modal.open(this, {
      title: '⚔ 어느 영웅으로 싸울까요?',
      items: GAME.HERO_ORDER.map(function (k) {
        var h = GAME.HEROES[k];
        return { key: k, name: h.name, note: h.trait || '' };
      }),
      onPick: function (it) {
        self._commitSetup({ role: 'controller', heroKey: it.key,
          picks: GAME.defaultSkillPicks() });
      }
    });
  }
};

GAME.RtLobbyScene.prototype._commitSetup = function (setup) {
  //  rtt 는 여기서 한 번만 얼린다. 지연은 양쪽이 (내 rtt, 상대 rtt) 의 max 로
  //  **같은 값**을 계산해야 한다 — 재전송 때 값이 바뀌면 세션 지연이 갈라져 desync 다.
  if (this._myRttSent == null)
    this._myRttSent = Math.round(GAME.NetRoom.bestRtt() || 180);
  setup.rtt = this._myRttSent;
  this._mySetup = setup;
  this._ready = true;
  GAME.NetRoom.setReady(true);
  GAME.NetRoom.relay({ type: 'rtSetup', setup: setup });
  this._readyBtn.text.setText('⌛ 상대를 기다리는 중… (다시 누르면 취소)');
  this._maybeBattle();
};

//  유실 대비 재전송 — 이미 확정한 세팅을 그대로 다시 보낸다(rtt 포함, 값 불변).
GAME.RtLobbyScene.prototype._sendSetup = function () {
  if (this._mySetup) GAME.NetRoom.relay({ type: 'rtSetup', setup: this._mySetup });
};

GAME.RtLobbyScene.prototype._onRelay = function (from, data) {
  if (!data) return;
  if (data.type === 'rtRole') {
    this._theirRole = data.role || null;
    this._refreshRoleUi();
  } else if (data.type === 'rtSetup' && data.setup) {
    this._theirSetup = data.setup;
    this._maybeBattle();
  }
};

//  서버 start(seed) — 둘 다 준비를 눌렀다는 뜻. 세팅 두 쪽이 모이면 전투로.
GAME.RtLobbyScene.prototype._onStart = function (msg) {
  this._startMsg = msg;
  this._sendSetup();                              // 유실 대비 한 번 더
  this._setStatus('시작! 세팅을 교환하는 중…');
  this._maybeBattle();
};

GAME.RtLobbyScene.prototype._maybeBattle = function () {
  if (this._started || !this._startMsg) return;
  if (!this._mySetup || !this._theirSetup) return;
  this._started = true;
  var NR = GAME.NetRoom;
  //  팀 라벨: 방장 = 'controller' 팀(아래) · 손님 = 'strategist' 팀(위).
  //  역할과 무관한 **자리 이름**이다 — 양쪽이 (me===host) 로 같은 결론을 낸다.
  var meTeam = (NR.me === NR.host) ? 'controller' : 'strategist';
  //  적응 입력 지연 — 두 rtt 의 max 에서 유도. 양쪽 입력이 같으므로 결과도 같다.
  //  틱 33.4ms: delay ≈ ceil(rtt·0.7/33.4)+2, 6~18틱(200~600ms) 사이로 가둔다.
  //  입력 편도 지연 추정 = (내 rtt + 상대 rtt) / 2.
  //  · WS 릴레이: 편도 = 나→DO + DO→상대 ≈ 내rtt/2 + 상대rtt/2 — 정확히 이 식이다.
  //    (⚠ max(rtt)·0.7 이던 옛 식은 릴레이 편도를 절반으로 잘못 봐 만성 스톨감이었다)
  //  · P2P 직결: 편도 = rtt/2 라 이 식은 2배 보수적 — 그래도 3~4틱이라 충분히 낮다.
  //  하한 3틱(100ms): P2P 에서 6틱(200ms)은 아깝다. 양쪽이 같은 rtt 쌍으로 같은
  //  값을 내므로 갈라질 수 없다.
  var oneWay = ((this._mySetup.rtt || 180) + (this._theirSetup.rtt || 180)) / 2;
  var delay = Math.max(3, Math.min(24, Math.ceil(oneWay * 1.15 / 33.4) + 2));
  var heroKey = this._mySetup.heroKey || this._theirSetup.heroKey || 'vanguard';
  this.scene.start('Battle', {
    rt: {
      seed: this._startMsg.seed >>> 0,
      meTeam: meTeam,
      delay: delay,
      my: this._mySetup,
      their: this._theirSetup
    },
    heroKey: heroKey,
    formationId: null
  });
};
