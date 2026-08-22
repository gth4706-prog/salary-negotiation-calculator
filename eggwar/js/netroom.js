window.GAME = window.GAME || {};

// ============================================================================
//  실시간 대전 — **방 접속 계층**. (v0 · 아직 게임을 붙이지 않는다)
//
//  이 파일이 하는 일은 딱 하나다: **두 브라우저를 같은 방에 넣고 메시지를 주고받는 것.**
//  전투 상태는 아직 한 바이트도 오가지 않는다. 반쯤 동작하는 넷코드를 만들면
//  데이터 어긋남(desync)이 조용히 나서 나중에 원인을 못 찾기 때문이다.
//  결정론 감사 결과와 다음 단계는 `docs/proposals/2026-07-29-realtime-pvp.md`.
//
//  서버: 03-webtool-adsense/workers/arena-room/worker.js (Cloudflare DO)
//  기존 `js/api.js`(랭킹 Worker)와는 **별개 서버**다. 서로를 깨뜨리지 않는다.
//
//  설계 전제 — **실사용자가 3명이다.**
//    · 방이 비어 있는 것이 기본 상태다. "아무도 없음"을 정직하게 보여준다.
//    · 접속이 끊기는 것도 기본 상태다(모바일 화면 잠금·탭 전환). 재접속이 기본 동작이다.
//    · 상대가 안 오면 기다리게 두지 말고 빠져나갈 길을 항상 준다.
//
//  ES5 로 쓴다(게임 클라이언트 전체 규약). Promise 는 쓰지 않고 콜백만 쓴다 —
//  구형 브라우저에서 폴리필 없이 돌게.
// ============================================================================
GAME.NetRoom = {

  // 방 서버 주소. **비어 있으면 실시간 대전 기능 자체가 꺼진다**(조용히).
  // 2026-08-19 배포 완료(npx wrangler, DO SQLite 마이그레이션 포함).
  // 실측: /health ok · welcome/relay/ready→start 왕복 확인 · RTT 177~184ms(LAX 경유).
  BASE: 'https://arena-room.gth3941.workers.dev',

  // ── 상태 ──
  ws: null,
  code: null,          // 지금 들어가 있는 방 코드
  me: null,            // 서버가 확정한 내 이름(중복이면 뒤에 #2 가 붙는다)
  host: null,
  peers: [],
  connected: false,
  closedByUser: false,

  rttMs: null,         // 최근 왕복지연
  rttSamples: [],      // 최근 표본 (중앙값을 쓴다 — 평균은 한 번의 튐에 끌려간다)
  _pingSeq: 0,
  _pingAt: {},
  _timer: null,
  _retry: 0,
  _retryTimer: null,

  // 이벤트 콜백 — 씬이 여기에 붙는다.
  //   on.open(info) / on.peers(list) / on.message(from, data)
  //   on.start(info) / on.close(reason) / on.error(msg) / on.rtt(ms)
  on: {},

  enabled: function () { return !!this.BASE; },

  _emit: function (name, a, b) {
    var f = this.on[name];
    if (typeof f === 'function') {
      try { f(a, b); }
      catch (e) { if (window.console) console.warn('NetRoom.' + name + ' 처리 중 오류:', e); }
    }
  },

  // ── HTTP: 방 만들기 / 목록 ────────────────────────────────────────────────
  _http: function (path, opts, cb) {
    if (!this.enabled()) { cb(new Error('방 서버 주소 미설정')); return; }
    if (typeof fetch !== 'function') { cb(new Error('fetch 없음')); return; }
    fetch(this.BASE + path, opts).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
        return j;
      });
    }).then(function (j) { cb(null, j); }, function (e) { cb(e); });
  },

  // 방 만들기 → cb(err, { code, host, mode })
  createRoom: function (opts, cb) {
    opts = opts || {};
    this._http('/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: opts.id || (GAME.Account && GAME.Account.currentId && GAME.Account.currentId()) || '손님',
        name: opts.name || '',
        mode: opts.mode || 'race'
      })
    }, cb || function () {});
  },

  // 공개 방 목록 → cb(err, { rooms: [...] })
  // **비어 있는 것이 정상이다.** 호출부는 "아직 아무도 없습니다"를 보여줄 것.
  listRooms: function (cb) {
    this._http('/rooms', { method: 'GET' }, cb || function () {});
  },

  // ── WebSocket: 입장 ───────────────────────────────────────────────────────
  join: function (code, id) {
    if (!this.enabled()) { this._emit('error', '방 서버 주소가 설정되지 않았습니다'); return false; }
    if (typeof WebSocket !== 'function') { this._emit('error', '이 브라우저는 WebSocket 을 지원하지 않습니다'); return false; }
    this.leave(true);                 // 이전 연결을 확실히 정리하고 시작한다
    this.closedByUser = false;
    this.code = String(code || '').toUpperCase();
    this._openSocket(id);
    return true;
  },

  _openSocket: function (id) {
    var self = this;
    var base = this.BASE.replace(/^http/, 'ws');
    var name = id || (GAME.Account && GAME.Account.currentId && GAME.Account.currentId()) || '손님';
    var url = base + '/ws?code=' + encodeURIComponent(this.code) +
              '&id=' + encodeURIComponent(name) +
              '&v=' + encodeURIComponent(GAME.VERSION || '');   //  버전 악수(록스텝 보호)
    var ws;
    try { ws = new WebSocket(url); }
    catch (e) { this._scheduleRetry(id); return; }
    this.ws = ws;

    ws.onopen = function () {
      self.connected = true;
      self._retry = 0;
      self._startHeartbeat();
    };

    ws.onmessage = function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      self._onMessage(msg);
    };

    ws.onerror = function () {
      self._emit('error', '연결 오류');
    };

    ws.onclose = function (ev) {
      self.connected = false;
      self._stopHeartbeat();
      self._emit('close', { code: ev && ev.code, byUser: self.closedByUser });
      //  4009 = 서버의 의도적 거절(버전 불일치) — 재시도해도 같은 답이다.
      if (!self.closedByUser && !(ev && ev.code === 4009)) self._scheduleRetry(id);
    };
  },

  _onMessage: function (msg) {
    switch (msg.t) {
      case 'err':
        //  서버가 참가를 거절한 사유(버전 불일치 등) — 화면이 읽어 보여준다.
        this.lastError = msg.msg || '접속이 거절되었습니다.';
        this._emit('error', this.lastError);   //  로비 on.error 는 문자열을 기대한다
        this.closedByUser = true;         //  재시도 금지 — 사유가 해결돼야 의미가 있다
        break;
      case 'hb':
        // 하트비트 자동응답. 서버(Durable Object)를 깨우지 않고 런타임이 답한다.
        break;

      case 'welcome':
        this.me = msg.you;
        this.host = msg.host;
        this.peers = msg.peers || [];
        this._emit('open', msg);
        this._emit('peers', this.peers);
        if (GAME.NetRtc) GAME.NetRtc.maybeStart();   // 2명 모이면 P2P 직결 시도
        break;

      case 'peer':
        this.peers = msg.peers || this.peers;
        if (msg.host) this.host = msg.host;
        this._emit('peers', this.peers, msg);
        if (GAME.NetRtc) GAME.NetRtc.maybeStart();
        break;

      case 'pong': {
        var t0 = this._pingAt[msg.n];
        delete this._pingAt[msg.n];
        if (t0 !== undefined) {
          var rtt = this._now() - t0;
          this.rttSamples.push(rtt);
          if (this.rttSamples.length > 9) this.rttSamples.shift();
          // 중앙값 — 한 번 크게 튄 표본에 끌려가지 않게. 지연 보정 프레임 수를
          // 정할 근거가 될 숫자라 안정성이 정확도보다 중요하다.
          var s = this.rttSamples.slice().sort(function (a, b) { return a - b; });
          this.rttMs = s[(s.length - 1) >> 1];
          this.send({ t: 'rtt', ms: this.rttMs });
          this._emit('rtt', this.rttMs);
        }
        break;
      }

      case 'start':
        // 시드와 시작 시각은 **서버가 정한다**. 클라이언트가 정하면 둘이 다를 수 있다.
        this._emit('start', msg);
        break;

      case 'relay':
        //  P2P 시그널(offer/answer/ICE)은 씬에 보이면 안 된다 — 여기서 가로챈다.
        if (msg.data && msg.data.rtc) {
          if (GAME.NetRtc) GAME.NetRtc.onSignal(msg.from, msg.data.rtc);
          break;
        }
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
    try { this.ws.send(JSON.stringify(obj)); return true; }
    catch (e) { return false; }
  },

  // 방 안의 상대에게 아무 데이터나 보낸다. 서버는 내용을 해석하지 않는다.
  //  P2P 직결이 열려 있으면 그쪽으로(왕복 ~10ms), 아니면 WS 릴레이(LAX 경유 ~500ms).
  //  받는 쪽 이벤트는 동일하다 — 씬·록스텝은 경로를 모른다.
  relay: function (data) {
    if (GAME.NetRtc && GAME.NetRtc.send(data)) return true;
    return this.send({ t: 'relay', data: data });
  },

  //  록스텝 입력 지연 산정용 — 실제로 메시지가 다닐 경로의 왕복지연.
  bestRtt: function () {
    var rc = GAME.NetRtc;
    if (rc && rc.ready() && rc.rttMs != null) return rc.rttMs;
    return this.rttMs;
  },

  setReady: function (v) { return this.send({ t: 'ready', ready: v !== false }); },

  // ── 하트비트 & 왕복지연 ───────────────────────────────────────────────────
  // 두 가지를 같이 한다:
  //   1) 살아있음 표시 — 서버가 유령 연결을 청소할 수 있게
  //   2) RTT 측정      — 락스텝 입력 지연을 몇 프레임으로 할지 정하는 근거
  // 5초 간격인 이유: 무료 플랜에서 DO 로 들어오는 메시지 하나가 요청 하나로 세진다.
  // 2인 × 5초 = 하루 34,560 요청으로 10만 한도 안에 들어온다.
  _startHeartbeat: function () {
    var self = this;
    this._stopHeartbeat();
    this._ping();
    this._timer = setInterval(function () { self._ping(); }, 5000);
  },
  _stopHeartbeat: function () {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  },
  _ping: function () {
    var n = ++this._pingSeq;
    this._pingAt[n] = this._now();
    // 답이 안 오는 ping 기록이 쌓이지 않게 정리
    var keys = Object.keys(this._pingAt);
    if (keys.length > 20) delete this._pingAt[keys[0]];
    this.send({ t: 'ping', n: n });
  },

  // ── 재접속 ────────────────────────────────────────────────────────────────
  // 모바일은 화면을 끄거나 탭을 바꾸면 소켓이 끊긴다. 그게 예외가 아니라 기본이다.
  // 지수 백오프로 다시 붙되 상한을 둔다(무한 재시도는 배터리를 태운다).
  _scheduleRetry: function (id) {
    var self = this;
    if (this._retryTimer) return;
    if (this._retry >= 6) { this._emit('error', '재접속 실패 — 방에서 나갑니다'); return; }
    var wait = Math.min(8000, 500 * Math.pow(2, this._retry));
    this._retry++;
    this._emit('error', '연결이 끊겼습니다. ' + Math.round(wait / 100) / 10 + '초 후 재시도 (' +
      this._retry + '/6)');
    this._retryTimer = setTimeout(function () {
      self._retryTimer = null;
      if (!self.closedByUser) self._openSocket(id);
    }, wait);
  },

  leave: function (silent) {
    this.closedByUser = true;
    if (GAME.NetRtc) GAME.NetRtc.reset();
    this._stopHeartbeat();
    if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; }
    if (this.ws) {
      try { this.ws.send(JSON.stringify({ t: 'bye' })); } catch (e) {}
      try { this.ws.close(1000, 'leave'); } catch (e) {}
      this.ws = null;
    }
    this.connected = false;
    this.peers = [];
    this.rttSamples = [];
    this.rttMs = null;
    this._retry = 0;
    if (!silent) this._emit('close', { byUser: true });
  },

  // 화면에 그대로 쓸 수 있는 한 줄 요약
  statusText: function () {
    if (!this.enabled()) return '실시간 대전 준비 중';
    if (!this.connected) return '연결 중…';
    var n = this.peers.length;
    return '방 ' + this.code + ' · ' + n + '/2명' +
      (this.rttMs === null ? '' : ' · 지연 ' + Math.round(this.rttMs) + 'ms');
  }
};

// 탭을 닫거나 새로고침하면 상대가 "왜 멈춰 있지"를 겪지 않도록 즉시 알린다.
// (소켓이 그냥 끊겨도 서버가 결국 감지하지만, 그동안 상대는 몇 초를 기다린다.)
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('pagehide', function () {
    if (GAME.NetRoom.connected) GAME.NetRoom.leave(true);
  });
}
