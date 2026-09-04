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
  this._quick = false;          // 빠른 대전 중(자동 역할·준비)
  this._quickAt = 0;            // 빠른 대전 시작 시각 — 60초 넘으면 연습 대전 제안
  this._quickTxt = null;
  this._quickEv = null;
  this._coop = null;            // 협동 보스전(S-C) — { world, floor }. 방장이 만들거나 방 이름에서 읽는다
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
  //  ── 빠른 대전 · 연습 대전 (v3.0, 2026-09-02) ─────────────────────────────
  //  "방 목록이 비면 할 게 없다"가 실시간 대전의 가장 큰 구멍이었다. 빠른 대전은
  //  열린 방을 찾아 붙거나 방을 만들어 기다리고, 연습 대전은 봇과 실시간 규칙
  //  그대로 싸운다(js/rtbot.js). 둘 다 입장 전 화면에만 있고 입장하면 치운다.
  var qy = PH ? (H - 34 - bh - 8) : (H - u * 26 - bh - 8);
  var qw = PH ? Math.min(340, (W - 60) / 2) : Math.min(W - 30, 380);
  if (PH) {
    this._mkBtns.push(UI.button(this, W / 2 - qw / 2 - 8, qy, qw, bh, '⚡ 빠른 대전',
      function () { self._quickMatch(); }, { fontSize: 14 }));
    this._mkBtns.push(UI.button(this, W / 2 + qw / 2 + 8, qy, qw, bh, '🤖 연습 대전 (봇)',
      function () { self._practice(); }, { fontSize: 14 }));
  } else {
    var qw2 = (qw - 8) / 2;
    this._mkBtns.push(UI.button(this, W / 2 - qw2 / 2 - 4, qy, qw2, bh, '⚡ 빠른 대전',
      function () { self._quickMatch(); }));
    this._mkBtns.push(UI.button(this, W / 2 + qw2 / 2 + 4, qy, qw2, bh, '🤖 연습 대전',
      function () { self._practice(); }));
  }
  //  ── 협동 보스전 (시즌 2 S-C) — 세계 선택 → 봇 파트너로 바로 / 방 만들어 초대 ──
  //  빠른·연습 줄 **위** 한 줄. 폰(390 높이): 목록 2행 바닥 209 · 이 줄 윗변 215 — 겹치지 않는다.
  var cy2 = qy - bh - 8;
  this._mkBtns.push(UI.button(this, W / 2, cy2, PH ? Math.min(W - 60, 696) : qw, bh,
    '🤝 협동 보스전 (2인 · 혼자면 봇 파트너)', function () { self._coopStart(); },
    { fill: UI.COL.panelTeal, line: GAME.CONFIG.COLORS.controller, fontSize: PH ? 14 : 16 }));

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
      //  협동 방(S-C)은 이름에 세계를 싣는다 — 목록에서 보이고, 들어가면 그 세계로 굳는다.
      var cp = GAME.RtCoop ? GAME.RtCoop.parseRoomName(r.name) : null;
      var tag = cp ? ('🤝 ' + GAME.RtCoop.label(cp.world) + '   ·   ') : '';
      var b = UI.button(self, W / 2, self._listTop + 36 + i * (rh + 8), Math.min(W - 30, 560), rh,
        tag + '방 ' + r.code + '   ·   ' + r.host + '   ·   ' + r.members + '/2명',
        function () { self._coop = cp; GAME.NetRoom.join(r.code); }, { fontSize: 14 });
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
    //  ⚠ 폰 y0 130 이면 버튼 윗변(105)이 참가자 글 둘째 줄(왕복 지연, ~76+34)을
    //    덮는다(2026-09-01 태현님 캡처 실측) — 148 로 내린다.
    var y0 = PH ? 148 : 250;
    this._roleBtnS = UI.button(this, W / 2 - bw / 2 - 9, y0, bw, bh, '🛡 전략가 (진형으로 막는다)',
      function () { self._pickRole('strategist'); },
      { fill: UI.COL.panelPurple, line: GAME.CONFIG.COLORS.strategist, fontSize: PH ? 12 : 14 });
    this._roleBtnC = UI.button(this, W / 2 + bw / 2 + 9, y0, bw, bh, '⚔ 컨트롤러 (영웅으로 뚫는다)',
      function () { self._pickRole('controller'); },
      { fill: UI.COL.panelTeal, line: GAME.CONFIG.COLORS.controller, fontSize: PH ? 12 : 14 });
    this._roleTxt = UI.text(this, W / 2, y0 + bh / 2 + (PH ? 12 : 18), '',
      { size: 'caption', color: C.textDim, origin: 0.5, originY: 0 });
    this._roleTxt.setAlign('center');
    //  ⚠ 폭 360 은 대기 문구가 판을 넘어 뻗는다(캡처 실측) — 넉넉히 520.
    this._readyBtn = UI.button(this, W / 2, y0 + bh / 2 + (PH ? 96 : 128), Math.min(W - 40, 520), bh,
      '⚔ 준비 완료', function () { self._toggleReady(); });
    UI.text(this, W / 2, y0 + bh / 2 + (PH ? 96 : 128) + bh / 2 + 8,
      '둘 다 준비하면 60초 동안 배치·장비를 고르고 전투가 시작됩니다',
      { size: 'micro', color: C.textDim, origin: 0.5, originY: 0 });
  }
  this._codeTxt.setText('방 코드  ' + NR.code);
  var names = NR.peers.map(function (p) { return p.id + (p.id === NR.host ? ' (방장)' : ''); });
  var bestRt = NR.bestRtt();
  this._peersTxt.setText(names.join('   vs   ') +
    (NR.peers.length < 2 ? '\n상대를 기다리는 중 — 코드를 알려주세요' :
      (bestRt != null ? '\n왕복 지연 ' + Math.round(bestRt) + 'ms' +
        (GAME.NetRtc && GAME.NetRtc.ready() ? ' (직결)' : ' (서버 경유)') : '')));
  //  협동(S-C) — 역할은 둘 다 컨트롤러로 굳는다. 방장은 세계를 상대에게 매번 알린다(입장
  //  시점이 달라 한 번만 보내면 놓친다 — rtRole 과 같은 멱등 재전송).
  if (this._coop) {
    this._myRole = 'controller';
    if (NR.me === NR.host) NR.relay({ type: 'rtCoop', world: this._coop.world, floor: this._coop.floor });
    if (this._roleBtnS) [this._roleBtnS, this._roleBtnC].forEach(function (b) {
      [b.gfx, b.rect, b.text].forEach(function (e) { if (e && e.setVisible) e.setVisible(false); });
    });
  }
  //  빠른 대전 — 상대가 들어오면 역할·준비를 자동으로 잡는다(사람이 누를 것이 없다).
  //  방장=컨트롤러 · 손님=전략가(저장 배치가 있을 때만, 없으면 컨트롤러). 상대가
  //  수동으로 들어온 사람이어도 내 쪽만 자동이면 충분하다.
  if (this._quick && !this._ready && NR.peers.length >= 2) {
    var iAmHost = NR.me === NR.host;
    var wantRole = iAmHost ? 'controller'
                 : (GAME.Formations.loadSaved().length ? 'strategist' : 'controller');
    if (this._myRole !== wantRole) this._pickRole(wantRole);
    var self3 = this;
    this.time.delayedCall(600, function () {
      if (self3.scene.isActive() && self3._quick && !self3._ready && !self3._roleOk()) self3._toggleReady();
    });
  }
  this._refreshRoleUi();
  //  방에 들어오면 상태 줄을 비운다 — 방 코드·참가자·지연을 전용 줄이 이미 말하고 있어
  //  같은 내용이 겹쳌 찍혔다(2026-09-01 태현님 캐처 실측).
  this._setStatus(this._joined ? '' : NR.statusText());
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
  //  협동(S-C) — 역할 검사가 없다. 둘 다 컨트롤러.
  if (this._coop) return GAME.NetRoom.peers.length < 2 ? '파트너를 기다리는 중' : null;
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
  if (this._coop) {
    //  협동 — 역할 줄 대신 세계·보스 층을 말한다.
    var cl = GAME.RtCoop ? GAME.RtCoop.label(this._coop.world) : this._coop.world;
    this._roleTxt.setText('🤝 협동 보스전 — ' + cl + ' ' + this._coop.floor + '층 보스' +
      (why ? ('\n' + why) : '\n둘 다 컨트롤러 · 준비를 누르면 시작됩니다'));
    return;
  }
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
  this._readyBtn.text.setText('⌛ 상대 대기 중 — 다시 누르면 취소');
};

GAME.RtLobbyScene.prototype._onRelay = function (from, data) {
  if (!data) return;
  if (data.type === 'rtRole') {
    this._theirRole = data.role || null;
    this._refreshRoleUi();
  } else if (data.type === 'rtCoop' && data.world) {
    //  협동 방(S-C) — 방장이 알린 세계로 굳는다(코드 입장이라 목록을 안 거친 손님도 안다).
    var fl = parseInt(data.floor, 10) || (GAME.RtCoop ? GAME.RtCoop.floorOf(data.world) : 30);
    this._coop = { world: String(data.world), floor: fl };
    this._myRole = 'controller';
    this._theirRole = 'controller';
    this._onRoom();
  }
};

//  서버 start(seed) — 둘 다 준비를 눌렀다는 뜻. 60초 준비 화면으로 넘어간다.
GAME.RtLobbyScene.prototype._onStart = function (msg) {
  if (this._started) return;
  this._started = true;
  if (this._coop) GAME.RtFlow.beginCoop(this._coop, msg);
  else GAME.RtFlow.begin(this._myRole, this._theirRole, msg);
  this.scene.start('RtPrep');
};

// ── 협동 보스전 (시즌 2 S-C) — 세계 고르기 → 봇 파트너로 바로 / 방 만들기 / 코드 입장 ──
//  세계는 **도달한 곳까지**만 열린다(RtCoop.worlds — 탑 최고층·시즌 진입). 잠긴 세계는
//  숨기지 않고 회색 + 🔒(수성의 탑 해금 사다리와 같은 규율: 숨기면 목표가 안 된다).
GAME.RtLobbyScene.prototype._coopStart = function () {
  var self = this;
  if (this._joined || !GAME.RtCoop || !GAME.Modal) return;
  var ws = GAME.RtCoop.worlds();
  if (!ws.length) { this._setStatus('⚠ 시즌 세계 표가 없습니다'); return; }
  GAME.Modal.open(this, {
    title: '🤝 협동 보스전 — 세계',
    items: ws.map(function (w) {
      var bk = GAME.RtCoop.bossKeyFor(w.floor), bd = GAME.UNITS[bk];
      //  잠긴 사유는 **지금 규칙**을 말한다(2026-09-04 태현님 ⑥) — 앞 세계를 협동으로
      //  깨면 열린다. 탑 기록으로도 열리므로 그 길도 같이 적는다.
      return { key: w.key, disabled: !w.open,
               name: (w.open ? '' : '🔒 ') + w.icon + ' ' + w.name + '  ·  ' + w.floor + '층' +
                     (w.open && w.wins ? '  ·  ' + w.wins + '승' : ''),
               note: w.open ? ('보스: ' + (bd ? bd.name : '?') + ' · 둘이서 180초 안에 처치')
                            : ((w.prevName ? w.prevName + ' 을 협동으로 깨면 열립니다' : '')
                               + ' (또는 통곡의 탑 ' + w.from + '층)') };
    }),
    onPick: function (it) {
      var w = GAME.RtCoop.worldOf(it.key);
      if (!w || !w.open) return;
      GAME.Modal.close();
      self._coopMode(w);
    }
  });
};

GAME.RtLobbyScene.prototype._coopMode = function (w) {
  var self = this;
  var coop = { world: w.key, floor: w.floor };
  GAME.Modal.open(this, {
    title: '🤝 ' + w.icon + ' ' + w.name + ' ' + w.floor + '층 — 누구와?',
    items: [
      { key: 'bot',  name: '🤖 바로 시작 (봇 파트너)', note: '혼자여도 됩니다 — 봇이 같은 편 영웅을 맡습니다' },
      { key: 'room', name: '🏟 방 만들기 (친구 초대)', note: '방 코드를 알려주면 친구가 파트너로 들어옵니다' },
      { key: 'code', name: '🔑 코드로 입장',            note: '친구가 만든 협동 방에 들어갑니다' }
    ],
    onPick: function (it) {
      GAME.Modal.close();
      if (it.key === 'bot') {
        GAME.RtFlow.beginLocalCoop(coop, GAME.RtCoop.BOT_LEVEL);
        self._started = true;             //  shutdown 이 방을 정리하지 않게(방 없음)
        self.scene.start('RtPrep');
      } else if (it.key === 'room') {
        if (self._joined) return;
        self._coop = coop;
        self._setStatus('협동 방을 만드는 중…');
        GAME.NetRoom.createRoom({ name: GAME.RtCoop.roomName(coop.world, coop.floor) }, function (err, room) {
          if (err) { self._coop = null; self._setStatus('⚠ 방 만들기 실패: ' + err.message); return; }
          GAME.NetRoom.join(room.code);
        });
      } else {
        self._askCode();
      }
    }
  });
};

// ── 연습 대전(봇) — 난이도를 고르고 준비 화면으로 (v3.0, 2026-09-02) ──────────
GAME.RtLobbyScene.prototype._practice = function () {
  var self = this;
  if (this._joined) return;
  var B = GAME.RtBot;
  if (!B) { this._setStatus('⚠ 봇 모듈이 없습니다'); return; }
  GAME.Modal.open(this, {
    title: '🤖 연습 대전 — 난이도',
    items: B.ORDER.map(function (k) { return { key: k, name: B.LEVELS[k].name, note: B.LEVELS[k].note }; }),
    onPick: function (it) {
      GAME.Modal.close();
      GAME.RtFlow.beginLocal(it.key);
      self._started = true;             //  shutdown 이 방을 정리하지 않게(방 없음)
      self.scene.start('RtPrep');
    }
  });
};

// ── 빠른 대전 — 열린 방에 붙거나, 없으면 방을 만들어 기다린다 ───────────────
GAME.RtLobbyScene.prototype._quickMatch = function () {
  var self = this;
  if (this._joined || this._quick) return;
  this._quick = true;
  this._quickAt = Date.now();
  this._setStatus('⚡ 상대를 찾는 중…');
  GAME.NetRoom.listRooms(function (err, res) {
    if (!self.scene || !self.scene.isActive()) return;
    //  협동 방(S-C)은 빠른 대전 짝이 아니다 — 목록에서 뺀다.
    var open = (res && res.rooms || []).filter(function (r) {
      return (r.members || 0) < 2 && !(GAME.RtCoop && GAME.RtCoop.parseRoomName(r.name));
    });
    if (!err && open.length) { GAME.NetRoom.join(open[0].code); return; }
    GAME.NetRoom.createRoom({}, function (e2, room) {
      if (!self.scene || !self.scene.isActive()) return;
      if (e2) { self._quick = false; self._setStatus('⚠ 방 만들기 실패: ' + e2.message); return; }
      GAME.NetRoom.join(room.code);
    });
  });
  //  1초마다 경과를 보여주고, 60초가 넘도록 상대가 없으면 연습 대전을 제안한다.
  if (this._quickEv) this._quickEv.remove(false);
  this._quickEv = this.time.addEvent({ delay: 1000, loop: true, callback: function () {
    if (!self.scene.isActive() || !self._quick) return;
    var NR = GAME.NetRoom;
    if (NR.peers.length >= 2) return;
    var sec = Math.round((Date.now() - self._quickAt) / 1000);
    if (self._joined && self._peersTxt && self._peersTxt.scene) {
      self._peersTxt.setText('⚡ 상대를 찾는 중… ' + sec + '초\n방 코드 ' + NR.code + ' — 친구에게 알려도 됩니다');
    }
    if (sec >= 60 && !self._quickTxt) {
      var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT, PH = GAME.CONFIG.PHONE;
      self._quickTxt = GAME.UI.button(self, W / 2, PH ? H - 34 : H - 60, Math.min(W - 40, 420), PH ? 46 : 54,
        '🤖 상대가 없어요 — 연습 대전으로', function () {
          GAME.NetRoom.leave(true);
          self._quick = false; self._joined = false;
          self.scene.restart();
          self.time.delayedCall(80, function () {
            var sc = GAME.game.scene.getScene('RtLobby');
            if (sc && sc._practice) sc._practice();
          });
        }, { fontSize: PH ? 14 : 16 });
    }
  } });
};
