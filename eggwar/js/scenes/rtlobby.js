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
  this._myFormation = null;
  this._theirFormation = null;
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

// ── 입장 후 상태 갱신 ──
GAME.RtLobbyScene.prototype._onRoom = function () {
  var NR = GAME.NetRoom, UI = GAME.UI, C = GAME.CONFIG.COLORS;
  var self = this;
  if (!this.scene || !this.scene.isActive()) return;
  if (!NR.connected) return;
  if (!this._joined) {
    this._joined = true;
    this._rows.forEach(function (r) { r.destroy(); });
    this._rows = [];
    var bw = 300, bh = Math.max(UI.BTN_H || 58, 56);
    this._readyBtn = UI.button(this, GAME.CONFIG.WIDTH / 2, this._listTop + GAME.CONFIG.HEIGHT * 0.14,
      bw, bh, '⚔ 준비 완료', function () {
        self._ready = !self._ready;
        GAME.NetRoom.setReady(self._ready);
        self._readyBtn.text.setText(self._ready ? '⌛ 상대를 기다리는 중…' : '⚔ 준비 완료');
      });
  }
  this._codeTxt.setText('방 코드  ' + NR.code);
  var names = NR.peers.map(function (p) { return p.id + (p.id === NR.host ? ' (방장)' : ''); });
  this._peersTxt.setText(names.join('   vs   ') +
    (NR.peers.length < 2 ? '\n상대를 기다리는 중 — 코드를 알려주세요' :
      (NR.rttMs != null ? '\n왕복 지연 ' + Math.round(NR.rttMs) + 'ms' : '')));
  this._setStatus(NR.statusText());
};

// ── 시작 — 시드 확보 → 내 진형을 보내고 상대 진형을 기다린다 ──
GAME.RtLobbyScene.prototype._onStart = function (msg) {
  this._startMsg = msg;
  var base = GAME.Arena.baseFormation();
  //  진형이 없어도 서고는 싸울 수 있어야 한다 — 빈 진형(영웅 단독)으로 보낸다.
  this._myFormation = base ? { name: base.name, units: base.units } : { name: '', units: [] };
  GAME.NetRoom.relay({ type: 'rtFormation', formation: this._myFormation });
  this._setStatus('시작! 진형을 교환하는 중…');
  this._maybeBattle();
};

GAME.RtLobbyScene.prototype._onRelay = function (from, data) {
  if (!data) return;
  if (data.type === 'rtFormation') {
    this._theirFormation = data.formation || { units: [] };
    this._maybeBattle();
  }
};

GAME.RtLobbyScene.prototype._maybeBattle = function () {
  if (this._started || !this._startMsg || !this._myFormation || !this._theirFormation) return;
  this._started = true;
  //  진영 배정은 **이름 정렬**로 결정한다 — 서버 members 순서는 접속 순서라 둘이 같지만,
  //  혹시 갈려도 안 되도록 결정적 규칙 하나로 못박는다: 사전순 앞 = controller(아래).
  var NR = GAME.NetRoom;
  var ids = NR.peers.map(function (p) { return p.id; }).sort();
  var mySide = (NR.me === ids[0]) ? 'controller' : 'strategist';
  this.scene.start('Battle', {
    rt: {
      seed: this._startMsg.seed >>> 0,
      side: mySide,
      myFormation: this._myFormation,
      theirFormation: this._theirFormation
    },
    heroKey: GAME.TowerChar && GAME.TowerChar.exists() ? GAME.TowerChar.get().hero : 'vanguard',
    formationId: null
  });
};
