window.BO = window.BO || {};

// ============================================================================
//  블랙아웃 — **연결 계층**. 두 브라우저를 같은 방에 넣고 메시지를 나른다.
//
//  에그워 `js/netroom.js` + `js/netrtc.js` 에서 **턴제에 필요한 것만** 옮겼다.
//  서버는 같은 것을 쓴다: Cloudflare Durable Object 방 서버(arena-room).
//  방 코드는 서버가 발급하고, 버전 악수(`v=`)가 다르면 서버가 입장을 거절하므로
//  에그워 방과 섞일 일은 없다(4009).
//
//  ── 옮기면서 **뺀 것** ────────────────────────────────────────────────────
//   · 록스텝 입력 지연 산식(p95/중앙값 논쟁) — 턴제라 아예 필요 없다. 에그워에서
//     제일 오래 태운 자리인데("움직이고나면 1초있다가 움직여") 이 게임은 구조가
//     그 문제를 만들지 않는다. 한 턴에 메시지 한 번이면 끝난다.
//   · 틱·시드 정렬, 입력 패킷 되흘리기 — 재접속 복구는 `match.js` 가 씨앗+턴기록
//     재생으로 한다(훨씬 단순하고 확실하다).
//
//  ── 옮기면서 **지킨 것**(전부 실제로 사람이 신고해서 알게 된 것들) ─────────
//   · 백그라운드 전환은 퇴장이 아니다. `pagehide` 에서 방을 나가면 폰 화면이
//     꺼지는 순간 자기 손으로 방을 나간다.
//   · 끊김에는 두 종류가 있다 — 다시 붙는 중(`drop`)과 정말 끝(`close`).
//     구분 안 하면 깜빡임 한 번이 판을 끝낸다.
//   · 소켓 신원 가드(`self.ws !== ws`) — 재접속 때 옛 좀비 소켓의 onclose 가
//     늦게 도착해 새 연결 상태를 덮어쓴다.
//   · 한국 ISP 는 Cloudflare 무료 트래픽을 해외(LAX)로 우회시킨다. 서버 경유는
//     왕복 500ms 가 나온다 → **P2P 직결을 먼저 시도**한다(한국↔한국 10~40ms).
//   · TURN 자격증명을 클라이언트에 박지 않는다. 서버 `/ice` 가 단기 발급한다.
//
//  ES5 · 콜백만. 빌드 도구 없이 그대로 브라우저가 읽는다.
// ============================================================================
BO.VERSION = 'bo1.2-paint2';  // v1.2 보급 상자·도구 — 규칙이 달라 구버전과 못 붙는다

BO.Net = {
  //  방 서버. 비어 있으면 실시간 대전이 조용히 꺼진다(연습은 그대로 된다).
  //  localStorage 'blackout.rtbase' 로 배포 없이 갈아탈 수 있다 — 한국 리전
  //  릴레이가 생겼을 때를 위한 문이다.
  BASE: (function () {
    try {
      var o = localStorage.getItem('blackout.rtbase');
      //  https 만 허용한다 — 다만 **내 컴퓨터에 띄운 방 서버**는 예외다.
      //  (넷코드를 고칠 때 실제 서버 없이 둘을 붙여 보려면 이 문이 필요하다.
      //   공개된 주소로는 절대 http 를 못 쓰게 막아 둔다.)
      if (o && (/^https:\/\//.test(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(o))) return o;
    } catch (e) {}
    return 'https://arena-room.gth3941.workers.dev';
  })(),

  MODE: 'dark',        // 방 서버가 해석하지 않는 꼬리표. 공개 목록에서 우리 방만 고른다.

  ws: null, code: null, me: null, host: null, peers: [],
  connected: false, closedByUser: false, retrying: false,
  iceTicket: '', rttMs: null, rttSamples: [],
  MAX_RETRY: 6,
  _pingSeq: 0, _pingAt: {}, _timer: null, _retry: 0, _retryTimer: null,
  on: {},

  enabled: function () { return !!this.BASE; },

  _emit: function (name, a, b) {
    var f = this.on[name];
    if (typeof f === 'function') {
      try { f(a, b); } catch (e) { if (window.console) console.warn('Net.' + name, e); }
    }
  },

  // ── 이름 / 기기 토큰 ──────────────────────────────────────────────────────
  //  ⚠ 에그워에서 없는 함수를 부르는 바람에 **전원이 '손님'으로 입장**했고, 서버가
  //    같은 이름의 자리를 회수하면서 두 번째 입장자가 방장을 밀어냈다. 이름은
  //    여기서 한 군데서만 만든다.
  nick: function () {
    var v = null;
    try { v = localStorage.getItem('blackout.nick'); } catch (e) {}
    if (!v) {
      v = '요원' + (1000 + Math.floor(Math.random() * 9000));
      this.setNick(v);
    }
    return v;
  },
  setNick: function (v) {
    v = String(v || '').trim().slice(0, 12);
    if (!v) return this.nick();
    try { localStorage.setItem('blackout.nick', v); } catch (e) {}
    return v;
  },
  //  같은 기기의 같은 이름만 서버가 자리를 회수한다(새로고침·백그라운드 복귀).
  _cid: function () {
    if (this._cidVal) return this._cidVal;
    var v = null;
    try { v = localStorage.getItem('blackout.cid'); } catch (e) {}
    if (!v) {
      v = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      try { localStorage.setItem('blackout.cid', v); } catch (e2) {}
    }
    this._cidVal = v;
    return v;
  },

  // ── HTTP ──────────────────────────────────────────────────────────────────
  _http: function (path, opts, cb) {
    if (!this.enabled()) { cb(new Error('방 서버 주소 미설정')); return; }
    if (typeof fetch !== 'function') { cb(new Error('이 브라우저에는 fetch 가 없습니다')); return; }
    fetch(this.BASE + path, opts).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
        return j;
      });
    }).then(function (j) { cb(null, j); }, function (e) { cb(e); });
  },

  createRoom: function (opts, cb) {
    opts = opts || {};
    this._http('/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: opts.id || this.nick(),
        name: opts.name || ('🕶 ' + this.nick() + ' 의 암실'),
        mode: this.MODE
      })
    }, cb || function () {});
  },

  //  공개 방 목록. **비어 있는 것이 기본 상태다** — 실사용자가 몇 명뿐이다.
  //  호출부는 "아직 아무도 없습니다"를 정직하게 보여주고 나갈 길을 준다.
  //  ⚠ 방 서버는 에그워와 공용이다. 처음엔 `mode === 'dark'` 인 방만 남기고 나머지를
  //    **버렸는데**, 실제 서버가 mode 를 그대로 돌려주지 않아 태현님이 만든 방이
  //    목록에서 사라졌다(실서버 첫 테스트에서 걸림). 이제 **아무것도 버리지 않는다.**
  //    우리 방인지는 `ours` 로만 표시한다 — mode 가 맞거나, 방 이름의 🕶 표식으로.
  //    엉뚱한 방에 들어가도 버전 악수(4009)가 막고 로비가 사유를 보여 준다.
  listRooms: function (cb) {
    var self = this;
    this._http('/rooms', { method: 'GET' }, function (err, j) {
      if (err) { cb(err); return; }
      var rooms = (j && j.rooms) || [];
      rooms.forEach(function (r) {
        if (!r) return;
        r.ours = (r.mode === self.MODE) || /^🕶/.test(String(r.name || ''));
      });
      cb(null, { rooms: rooms, raw: j });
    });
  },

  // ── WebSocket ─────────────────────────────────────────────────────────────
  join: function (code) {
    if (!this.enabled()) { this._emit('error', '방 서버 주소가 설정되지 않았습니다'); return false; }
    if (typeof WebSocket !== 'function') { this._emit('error', '이 브라우저는 WebSocket 을 지원하지 않습니다'); return false; }
    this.leave(true);
    this.closedByUser = false;
    this.retrying = false;
    this.code = String(code || '').toUpperCase();
    this._openSocket();
    return true;
  },

  _openSocket: function () {
    var self = this;
    var base = this.BASE.replace(/^http/, 'ws');
    var url = base + '/ws?code=' + encodeURIComponent(this.code) +
              '&id=' + encodeURIComponent(this.nick()) +
              '&cid=' + encodeURIComponent(this._cid()) +
              '&v=' + encodeURIComponent(BO.VERSION);
    var ws;
    try { ws = new WebSocket(url); } catch (e) { this._scheduleRetry(); return; }
    this.ws = ws;

    //  ⚠ 소켓 신원 가드 — 재접속으로 새 소켓을 열면 옛 좀비 소켓의 onclose 가 늦게
    //    도착해 새 연결 상태를 덮고 재시도까지 걸어 소켓이 두 개가 된다.
    ws.onopen = function () {
      if (self.ws !== ws) return;
      var wasRetrying = self.retrying;
      self.connected = true; self.retrying = false; self._retry = 0;
      self._startHeartbeat();
      if (wasRetrying) self._emit('reopen', {});
    };
    ws.onmessage = function (ev) {
      if (self.ws !== ws) return;
      var msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
      self._onMessage(msg);
    };
    ws.onerror = function () { if (self.ws === ws) self._emit('error', '연결 오류'); };
    ws.onclose = function (ev) {
      if (self.ws !== ws) return;
      self.connected = false;
      self._stopHeartbeat();
      var code = ev && ev.code;
      //  4009 버전 불일치 · 4004 없는 방 · 4008 다른 연결이 자리를 가져감.
      //  서버가 뜻을 갖고 거절한 것이라 다시 붙어도 같은 답이다.
      var fatal = self.closedByUser || code === 4009 || code === 4004 || code === 4008;
      if (!fatal && self._retry < self.MAX_RETRY) {
        self.retrying = true;
        self._emit('drop', { code: code });     // 판을 끝내면 안 되는 끊김
        self._scheduleRetry();
      } else {
        self.retrying = false;
        self._emit('close', { code: code, byUser: self.closedByUser });
      }
    };
  },

  _onMessage: function (msg) {
    switch (msg.t) {
      case 'err':
        this.lastError = msg.msg || '접속이 거절되었습니다.';
        this._emit('error', this.lastError);
        this.closedByUser = true;       // 사유가 해결돼야 의미가 있다 — 재시도 금지
        break;
      case 'hb': break;                 // 하트비트는 런타임이 답한다
      case 'welcome':
        if (msg.iceTicket) this.iceTicket = msg.iceTicket;
        this.me = msg.you; this.host = msg.host; this.peers = msg.peers || [];
        this._emit('open', msg);
        this._emit('peers', this.peers);
        BO.Rtc.maybeStart();
        break;
      case 'iceticket':
        this.iceTicket = msg.ticket || '';
        BO.Rtc.onTicket();
        break;
      case 'peer':
        this.peers = msg.peers || this.peers;
        if (msg.host) this.host = msg.host;
        this._emit('peers', this.peers, msg);
        BO.Rtc.maybeStart();
        break;
      case 'pong': {
        var t0 = this._pingAt[msg.n];
        delete this._pingAt[msg.n];
        if (t0 !== undefined) {
          var rtt = this._now() - t0;
          this.rttSamples.push(rtt);
          if (this.rttSamples.length > 9) this.rttSamples.shift();
          var s = this.rttSamples.slice().sort(function (a, b) { return a - b; });
          this.rttMs = s[(s.length - 1) >> 1];      // 중앙값 — 한 번 튄 표본에 안 끌린다
          this.send({ t: 'rtt', ms: this.rttMs });
          this._emit('rtt', this.rttMs);
        }
        break;
      }
      case 'start':
        //  씨앗과 시작은 **서버가 정한다.** 클라이언트가 정하면 둘이 다른 판을 연다.
        this._emit('start', msg);
        break;
      case 'relay':
        if (msg.data && msg.data.rtc) { BO.Rtc.onSignal(msg.from, msg.data.rtc); break; }
        this._emit('message', msg.from, msg.data);
        break;
      case 'error':
        this._emit('error', msg.error);
        break;
    }
  },

  _now: function () {
    return (window.performance && performance.now) ? performance.now() : Date.now();
  },

  send: function (obj) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    try { this.ws.send(JSON.stringify(obj)); return true; } catch (e) { return false; }
  },

  //  상대에게 보낸다. 직결이 열려 있으면 그쪽, 아니면 서버 릴레이.
  //  **받는 쪽 이벤트는 같다** — 위층은 경로를 모른다.
  relay: function (data) {
    if (BO.Rtc.send(data)) return true;
    return this.send({ t: 'relay', data: data });
  },

  bestRtt: function () {
    if (BO.Rtc.ready() && BO.Rtc.rttMs != null) return BO.Rtc.rttMs;
    return this.rttMs;
  },

  setReady: function (v) { return this.send({ t: 'ready', ready: v !== false }); },

  // ── 하트비트 겸 왕복지연 ──────────────────────────────────────────────────
  //  5초 간격인 이유: 무료 플랜에서 DO 로 들어오는 메시지 하나가 요청 하나로 세진다.
  //  2인 × 5초 = 하루 34,560 요청으로 10만 한도 안에 들어온다.
  _startHeartbeat: function () {
    var self = this;
    this._stopHeartbeat();
    this._ping();
    this._timer = setInterval(function () { self._ping(); }, 5000);
  },
  _stopHeartbeat: function () { if (this._timer) { clearInterval(this._timer); this._timer = null; } },
  _ping: function () {
    var n = ++this._pingSeq;
    this._pingAt[n] = this._now();
    var keys = Object.keys(this._pingAt);
    if (keys.length > 20) delete this._pingAt[keys[0]];
    this.send({ t: 'ping', n: n });
  },

  _scheduleRetry: function () {
    var self = this;
    if (this._retryTimer) return;
    if (this._retry >= this.MAX_RETRY) {
      this.retrying = false;
      this._emit('error', '재접속 실패 — 방에서 나갑니다');
      this._emit('close', { code: 0, byUser: false });
      return;
    }
    var wait = Math.min(8000, 500 * Math.pow(2, this._retry));
    this._retry++;
    this._emit('error', '연결이 끊겼습니다. ' + Math.round(wait / 100) / 10 + '초 후 재시도 (' +
      this._retry + '/' + this.MAX_RETRY + ')');
    this._retryTimer = setTimeout(function () {
      self._retryTimer = null;
      if (!self.closedByUser) self._openSocket();
    }, wait);
  },

  leave: function (silent) {
    this.closedByUser = true;
    this.retrying = false;
    BO.Rtc.reset();
    this._stopHeartbeat();
    if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; }
    if (this.ws) {
      try { this.ws.send(JSON.stringify({ t: 'bye' })); } catch (e) {}
      try { this.ws.close(1000, 'leave'); } catch (e) {}
      this.ws = null;
    }
    this.connected = false;
    this.peers = [];
    this.iceTicket = '';      // 티켓은 방마다 다르다. 안 지우면 다음 방에서 거절당한다.
    this.rttSamples = []; this.rttMs = null; this._retry = 0;
    if (!silent) this._emit('close', { byUser: true });
  },

  statusText: function () {
    if (!this.enabled()) return '실시간 대전 준비 중';
    if (!this.connected) return this.retrying ? '다시 붙는 중…' : '연결 중…';
    var rt = this.bestRtt();
    var direct = BO.Rtc.ready() && BO.Rtc.rttMs != null;
    return '방 ' + this.code + ' · ' + this.peers.length + '/2명' +
      (rt == null ? '' : ' · 지연 ' + Math.round(rt) + 'ms' + (direct ? ' 직결' : ' 서버경유'));
  }
};

// ============================================================================
//  P2P 직결(WebRTC DataChannel).
//  서버 경유는 한국에서 왕복 500ms 가 나온다 — 턴제라 «못 할 정도»는 아니지만,
//  턴 넘김이 매번 반 초씩 밀리면 「실시간 대전」이라는 말이 무색해진다.
// ============================================================================
BO.Rtc = {
  pc: null, dc: null, _open: false, _dead: false,
  rttMs: null, route: null, pairKind: null, iceMs: null,
  _samples: [], _pingSeq: 0, _pingAt: {}, _pingTimer: null, _routeTimer: null,
  _fast: 0, _iceT0: 0,

  supported: function () { return typeof RTCPeerConnection === 'function'; },
  ready: function () { return this._open && !this._dead && this.dc && this.dc.readyState === 'open'; },
  //  ⚠ `ready()` 는 「채널이 열려 있나」다. 상대 폰이 죽어도 readyState 는 한참
  //    'open' 으로 남는다(ICE 끊김 감지가 수십 초 걸린다). 「상대가 정말 있나」는
  //    **2초마다 보내는 핑에 최근에 답했나**로 본다. 6초 안에 답이 없으면 없는 것.
  lastPongAt: 0,
  alive: function () {
    if (!this.ready()) return false;
    var now = (window.performance && performance.now) ? performance.now() : Date.now();
    return this.lastPongAt > 0 && (now - this.lastPongAt) < 6000;
  },

  //  방에 둘이 모이면 방장이 offer 를 낸다.
  //  (양쪽이 동시에 offer 를 내면 충돌한다 — 방장 단독이라야 결정적이다.)
  maybeStart: function () {
    var N = BO.Net;
    if (!this.supported() || this._dead || this.pc) return;
    if (!N.connected || !N.peers || N.peers.length !== 2) return;
    this._create();
    if (N.me === N.host) this._offer();
  },

  onTicket: function () {
    //  티켓이 늦게 도착했다 — TURN 을 다시 받아 온다. 안 부르면 영영 안 붙는다.
    if (this.pc) this._loadIce(this.pc, this._baseIce());
  },

  _baseIce: function () {
    return [{ urls: 'stun:stun.cloudflare.com:3478' },
            { urls: 'stun:stun.l.google.com:19302' }];
  },

  //  ⚠⚠ **TURN 자격증명을 이 파일에 적지 말 것.** 브라우저로 가는 코드에 장기 키를
  //    넣으면 누구나 받아서 그 계정의 릴레이 할당량을 쓴다(에그워에서 실제로 그랬고
  //    2026-09-09 에 폐기했다). 서버 `/ice` 가 수명 1시간짜리를 발급한다.
  //  ⚠ 실패해도 조용히 넘어간다 — STUN 직결과 서버 릴레이가 그대로 남는다.
  _loadIce: function (pc, base) {
    var N = BO.Net;
    if (!N.BASE || typeof fetch !== 'function') return;
    var opt = { cache: 'no-store' };
    if (N.iceTicket) opt.headers = { Authorization: 'Bearer ' + N.iceTicket };
    fetch(N.BASE + '/ice', opt).then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (d) {
      if (!d || !d.iceServers || !d.iceServers.length) return;
      if (!pc || pc.signalingState === 'closed' || !pc.setConfiguration) return;
      try { pc.setConfiguration({ iceServers: base.concat(d.iceServers) }); } catch (e) {}
    })['catch'](function () {});
  },

  _create: function () {
    var self = this, pc, base = this._baseIce();
    try {
      pc = new RTCPeerConnection({ iceServers: base });
      this._iceT0 = Date.now();
      this.route = null; this.pairKind = null; this.iceMs = null;
      this._loadIce(pc, base);          // 비동기다 — 그 사이에도 STUN 으로 붙기 시작한다
    } catch (e) { this._fail(); return; }
    this.pc = pc;
    pc.onicecandidate = function (ev) { if (ev.candidate) self._signal({ ice: ev.candidate }); };
    pc.onconnectionstatechange = function () {
      if (!self.pc) return;
      var st = self.pc.connectionState;
      if (st === 'failed' || st === 'closed') self._fail();
    };
    pc.ondatachannel = function (ev) { self._bind(ev.channel); };
  },

  _offer: function () {
    var self = this, dc;
    //  ordered+reliable — 턴 커밋은 유실되면 판이 멈춘다.
    try { dc = this.pc.createDataChannel('bo', { ordered: true }); }
    catch (e) { this._fail(); return; }
    this._bind(dc);
    this.pc.createOffer()
      .then(function (d) { return self.pc.setLocalDescription(d); })
      .then(function () { self._signal({ sdp: self.pc.localDescription }); })
      ['catch'](function () { self._fail(); });
  },

  _bind: function (dc) {
    var self = this;
    this.dc = dc;
    dc.onopen = function () {
      self._open = true;
      self._startPing();
      self._pollRoute();
      if (self._routeTimer) clearInterval(self._routeTimer);
      self._routeTimer = setInterval(function () { self._pollRoute(); }, 2000);
      BO.Net._emit('rtc', true);
    };
    dc.onclose = function () { self._fail(); };
    dc.onerror = function () { self._fail(); };
    dc.onmessage = function (ev) {
      var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.__p) { try { dc.send(JSON.stringify({ __q: m.__p })); } catch (e2) {} return; }
      if (m.__q) { self._pong(m.__q); return; }
      BO.Net._emit('message', m.from, m.data);
    };
  },

  onSignal: function (from, sig) {
    var self = this;
    if (!this.supported() || this._dead) return;
    if (!this.pc) this._create();
    if (!this.pc) return;
    if (sig.sdp) {
      this.pc.setRemoteDescription(new RTCSessionDescription(sig.sdp)).then(function () {
        if (sig.sdp.type === 'offer') {
          return self.pc.createAnswer()
            .then(function (a) { return self.pc.setLocalDescription(a); })
            .then(function () { self._signal({ sdp: self.pc.localDescription }); });
        }
      })['catch'](function () { self._fail(); });
    } else if (sig.ice) {
      this.pc.addIceCandidate(sig.ice)['catch'](function () {});
    }
  },

  //  ⚠ 시그널링은 **원시 WS** 로 보낸다. relay() 를 쓰면 자기 자신을 통해 자기를
  //    여는 순환이 된다.
  _signal: function (obj) { BO.Net.send({ t: 'relay', data: { rtc: obj } }); },

  send: function (data) {
    if (!this.ready()) return false;
    try { this.dc.send(JSON.stringify({ from: BO.Net.me, data: data })); return true; }
    catch (e) { this._fail(); return false; }
  },

  //  ⚠ `dc=on` 은 직결 성공을 뜻하지 않는다 — TURN 릴레이 위에서도 채널은 열린다.
  //    선택된 candidate pair 의 **타입만** 읽어 분류한다(주소는 안 읽는다 — 개인정보).
  _pollRoute: function () {
    var self = this;
    if (!this.pc || !this.pc.getStats) return;
    this.pc.getStats(null).then(function (rep) {
      var pair = null, cands = {};
      rep.forEach(function (r) {
        if (r.type === 'local-candidate' || r.type === 'remote-candidate') cands[r.id] = r;
        if (r.type === 'candidate-pair' && (r.selected || r.state === 'succeeded' || r.nominated)) {
          if (!pair || r.selected || (r.nominated && !pair.selected)) pair = r;
        }
      });
      if (!pair) return;
      var L = cands[pair.localCandidateId], R = cands[pair.remoteCandidateId];
      var lt = L && L.candidateType, rt = R && R.candidateType;
      if (!lt && !rt) return;
      self.pairKind = (lt || '?') + '/' + (rt || '?');
      self.route = (lt === 'relay' || rt === 'relay') ? 'turn' : 'p2p';
      if (self.iceMs == null && self._iceT0) self.iceMs = Date.now() - self._iceT0;
    })['catch'](function () {});
  },

  //  붙자마자 빠르게 재고(250ms×12=3초) 그 뒤엔 2초 주기. 에그워에서는 2초 주기라
  //  표본을 모으는 데 16초가 걸려 준비 화면이 끝나도 측정이 안 끝났다.
  _startPing: function () {
    var self = this;
    this._stopPing();
    this._fast = 0;
    this._ping();
    this._pingTimer = setInterval(function () {
      self._ping();
      if (++self._fast >= 12) {
        clearInterval(self._pingTimer);
        self._pingTimer = setInterval(function () { self._ping(); }, 2000);
      }
    }, 250);
  },
  _stopPing: function () {
    if (this._pingTimer) { clearInterval(this._pingTimer); this._pingTimer = null; }
    //  경로 폴러도 같이 끈다 — 안 끄면 연결이 죽은 뒤에도 2초마다 남아 쌓인다.
    if (this._routeTimer) { clearInterval(this._routeTimer); this._routeTimer = null; }
  },
  _ping: function () {
    if (!this.ready()) return;
    var n = ++this._pingSeq;
    this._pingAt[n] = (window.performance && performance.now) ? performance.now() : Date.now();
    try { this.dc.send(JSON.stringify({ __p: n })); } catch (e) {}
  },
  _pong: function (n) {
    var t0 = this._pingAt[n];
    delete this._pingAt[n];
    if (t0 === undefined) return;
    var now = (window.performance && performance.now) ? performance.now() : Date.now();
    this.lastPongAt = now;
    this._samples.push(now - t0);
    if (this._samples.length > 9) this._samples.shift();
    var s = this._samples.slice().sort(function (a, b) { return a - b; });
    this.rttMs = s[(s.length - 1) >> 1];
  },

  _fail: function () {
    this._open = false;
    this._dead = true;      // 이 방에서는 서버 릴레이로 눌러앉는다. 오락가락하지 않는다.
    this._stopPing();
    if (this.dc) { try { this.dc.close(); } catch (e) {} this.dc = null; }
    if (this.pc) { try { this.pc.close(); } catch (e) {} this.pc = null; }
    BO.Net._emit('rtc', false);
  },

  reset: function () {
    this._stopPing();
    if (this.dc) { try { this.dc.close(); } catch (e) {} }
    if (this.pc) { try { this.pc.close(); } catch (e) {} }
    this.pc = null; this.dc = null;
    this._open = false; this._dead = false;
    this.rttMs = null; this._samples = []; this._pingAt = {}; this.lastPongAt = 0;
    this.route = null; this.pairKind = null; this.iceMs = null;
  }
};

// ── 백그라운드 전환은 퇴장이 아니다 ─────────────────────────────────────────
//  폰은 화면이 꺼지거나 앱을 잠깐 바꿔도 pagehide 가 뜬다. 에그워는 거기서 방을
//  나가 버려서(closedByUser=true 라 재접속 로직까지 무력화) 상대를 기다리며 화면이
//  어두워지는 순간 스스로 방을 나갔다. 나가기는 오직 [나가기] 버튼만 한다.
//  돌아오면 같은 방으로 즉시 재입장한다.
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('visibilitychange', function () {
    var N = BO.Net;
    if (document.visibilityState !== 'visible') return;
    if (!N.code || N.connected || N.closedByUser) return;
    //  사람이 돌아온 순간이 가장 붙기 좋은 순간이다 — 백그라운드에서 스로틀된
    //  재시도 타이머를 기다리지 않고 지금 바로, 횟수도 새로 센다.
    if (N._retryTimer) { clearTimeout(N._retryTimer); N._retryTimer = null; }
    N._retry = 0;
    N._openSocket();
  });
}
