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
    if (self._dom && self._dom.parentNode) self._dom.parentNode.removeChild(self._dom);
    if (!self._started) {
      GAME.NetRoom.on = {};
      GAME.NetRoom.leave(true);
    } else {
      //  준비 단계(RtFlow)로 넘어가는 길 — message/close 는 **RtFlow 가 이어받았다.**
      //  `on = {}` 로 통째로 지우면 상대 세팅(rtSetup)이 유실되어 전투로 못 넘어간다
      //  (2026-08-22 실측: 둘 다 확정했는데 Battle 이 영영 안 열렸다).
      GAME.NetRoom.on.open = null;
      GAME.NetRoom.on.peers = null;
      GAME.NetRoom.on.rtt = null;
      GAME.NetRoom.on.error = null;
      GAME.NetRoom.on.start = null;
    }
  });

  // ── 방 목록 (2026-08-22 레이아웃 재정비 — 폰 가로 390px 에서 목록·버튼이
  //    겹치고, 입장 뒤에도 '방 만들기'가 남아 있던 것을 고침) ──────────────────
  var listTop = PH ? 96 : u * 16;
  this._listTop = listTop;
  this._refreshList();

  //  하단 버튼 — 폰은 세로가 없어 **가로로 나란히**, 참조를 들고 입장하면 숨긴다.
  var bh = PH ? 50 : Math.max(UI.BTN_H || 58, u * 10);
  this._mkBtns = [];
  if (PH) {
    var bw2 = Math.min(340, (W - 60) / 2);
    this._mkBtns.push(UI.button(this, W / 2 - bw2 / 2 - 8, H - 34, bw2, bh, '🏟 방 만들기',
      function () { self._createRoom(); }, { fontSize: 14 }));
    this._mkBtns.push(UI.button(this, W / 2 + bw2 / 2 + 8, H - 34, bw2, bh, '🔑 코드로 입장',
      function () { if (!self._joined) self._askCode(); }, { fontSize: 14 }));
  } else {
    var bw = Math.min(W - 30, 380);
    this._mkBtns.push(UI.button(this, W / 2, H - u * 26, bw, bh, '🏟 방 만들기',
      function () { self._createRoom(); }));
    this._mkBtns.push(UI.button(this, W / 2, H - u * 26 + bh + 8, bw, bh, '🔑 코드로 입장',
      function () { if (!self._joined) self._askCode(); }));
  }
  var mh = PH ? 40 : Math.max(UI.BTN_H_SM || 52, u * 7);
  UI.button(this, PH ? 64 : 76, PH ? 26 : Math.max(mh / 2 + 6, u * 3.4), PH ? 100 : 120, mh,
    '← 대전', function () { self.scene.start('Versus'); }, { fontSize: PH ? 12 : 14 });

  // 방 상태 표시(코드·인원·지연) — 입장하면 나타난다
  this._codeTxt = UI.text(this, W / 2, PH ? 52 : 110, '',
    { size: PH ? 'subhead' : 'head', color: C.accentAlt, origin: 0.5 });
  this._peersTxt = UI.text(this, W / 2, PH ? 76 : 152, '',
    { size: PH ? 'caption' : 'body', color: C.text, origin: 0.5, originY: 0 });
  this._peersTxt.setAlign('center');

  this._setStatus(GAME.NetRoom.enabled() ? '방을 만들거나 코드로 입장하세요' : '실시간 대전 준비 중');

  this.time.delayedCall(400, function () {
    if (self.scene.isActive() && GAME.Tutorial) GAME.Tutorial.show(self, 'rt');
  });
};

GAME.RtLobbyScene.prototype._createRoom = function () {
  var self = this;
  if (this._joined) return;
  this._setStatus('방을 만드는 중…');
  GAME.NetRoom.createRoom({}, function (err, room) {
    if (err) { self._setStatus('⚠ 방 만들기 실패: ' + err.message); return; }
    GAME.NetRoom.join(room.code);
  });
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
    var maxRows = GAME.CONFIG.PHONE ? 2 : 4;
    res.rooms.slice(0, maxRows).forEach(function (r, i) {
      var rh = GAME.CONFIG.PHONE ? 46 : 58;
      var b = UI.button(self, W / 2, self._listTop + 36 + i * (rh + 8), Math.min(W - 30, 560), rh,
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
    //  방에 들어왔으면 만들기/입장 버튼은 치운다 — 남겨두면 역할 버튼과 겹치고
    //  눌리기까지 한다(2026-08-22 태현님 ①: "버튼 클릭 시 액션도 이상함").
    (this._mkBtns || []).forEach(function (b) {
      [b.gfx, b.rect, b.text].forEach(function (e) { if (e && e.destroy) e.destroy(); });
    });
    this._mkBtns = [];
    var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
    var PH = GAME.CONFIG.PHONE;
    var bh = PH ? 50 : Math.max(UI.BTN_H || 58, 56);
    var bw = PH ? Math.min(330, (W - 56) / 2) : 330;
    var y0 = PH ? 130 : 250;
    this._roleBtnS = UI.button(this, W / 2 - bw / 2 - 9, y0, bw, bh, '🛡 전략가 (진형으로 막는다)',
      function () { self._pickRole('strategist'); },
      { fill: UI.COL.panelPurple, line: GAME.CONFIG.COLORS.strategist, fontSize: PH ? 12 : 14 });
    this._roleBtnC = UI.button(this, W / 2 + bw / 2 + 9, y0, bw, bh, '⚔ 컨트롤러 (영웅으로 뚫는다)',
      function () { self._pickRole('controller'); },
      { fill: UI.COL.panelTeal, line: GAME.CONFIG.COLORS.controller, fontSize: PH ? 12 : 14 });
    this._roleTxt = UI.text(this, W / 2, y0 + bh / 2 + (PH ? 12 : 18), '',
      { size: 'caption', color: C.textDim, origin: 0.5, originY: 0 });
    this._roleTxt.setAlign('center');
    this._readyBtn = UI.button(this, W / 2, y0 + bh / 2 + (PH ? 96 : 128), Math.min(W - 40, 360), bh,
      '⚔ 준비 완료', function () { self._toggleReady(); });
    UI.text(this, W / 2, y0 + bh / 2 + (PH ? 96 : 128) + bh / 2 + 8,
      '둘 다 준비하면 60초 동안 배치·장비를 고르고 전투가 시작됩니다',
      { size: 'micro', color: C.textDim, origin: 0.5, originY: 0 });
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
  var self2 = this;
  var mark = function (btn, picked, col) {
    if (!btn) return;
    if (btn.text) btn.text.setAlpha(picked || !self2._myRole ? 1 : 0.5);
    if (btn.rect && btn.rect.setStrokeStyle) btn.rect.setStrokeStyle(picked ? 3 : 1, col);
  };
  mark(this._roleBtnS, this._myRole === 'strategist', GAME.CONFIG.COLORS.strategist);
  mark(this._roleBtnC, this._myRole === 'controller', GAME.CONFIG.COLORS.controller);
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
  //  2026-08-22 태현님 사양: 여기서는 **역할만** 확정한다. 배치·장비는 다음 화면
  //  (RtPrep, 60초)에서 고른다 — 둘 다 준비를 누르면 서버 start 가 온다.
  this._ready = true;
  GAME.NetRoom.setReady(true);
  this._readyBtn.text.setText('⌛ 상대의 준비를 기다리는 중… (다시 누르면 취소)');
};

GAME.RtLobbyScene.prototype._onRelay = function (from, data) {
  if (!data) return;
  if (data.type === 'rtRole') {
    this._theirRole = data.role || null;
    this._refreshRoleUi();
  }
};

//  서버 start(seed) — 둘 다 준비를 눌렀다는 뜻. 60초 준비 화면으로 넘어간다.
GAME.RtLobbyScene.prototype._onStart = function (msg) {
  if (this._started) return;
  this._started = true;
  GAME.RtFlow.begin(this._myRole, this._theirRole, msg);
  this.scene.start('RtPrep');
};
