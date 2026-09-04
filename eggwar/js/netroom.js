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
  //  ⚠ 한국 ISP 는 Cloudflare 무료 트래픽을 해외 콜로(LAX)로 우회시킨다(실측 RTT
  //    493ms). 한국 리전 릴레이로 갈아탈 때를 위해 저장소 오버라이드를 둔다 —
  //    localStorage 'eggwar.rtbase' 에 주소를 넣으면 게임 배포 없이 갈아탄다.
  BASE: (function () {
    try {
      var o = localStorage.getItem('eggwar.rtbase');
      if (o && /^https:\/\//.test(o)) return o;
    } catch (e) {}
    return 'https://arena-room.gth3941.workers.dev';
  })(),

  // ── 상태 ──
  ws: null,
  code: null,          // 지금 들어가 있는 방 코드
  me: null,            // 서버가 확정한 내 이름(중복이면 뒤에 #2 가 붙는다)
  host: null,
  peers: [],
  connected: false,
  closedByUser: false,
  retrying: false,     // 끊겼지만 다시 붙는 중 — 판을 끝내면 안 되는 상태
  MAX_RETRY: 6,

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
  //   on.drop(info)  — 끊겼고 **다시 붙는 중**(판을 끝내지 말 것)
  //   on.reopen()    — 끊겼다 되붙었다(잃은 패킷을 다시 흘릴 자리)
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

  //  내 닉네임 — ⚠ 예전엔 `GAME.Account.currentId()` 를 불렀는데 **그런 함수가 없어서**
  //  전원이 '손님' 으로 입장하고 있었다(2026-09-03 rt-audit 실측: 방장·손님 둘 다 '손님').
  //  서버가 같은 이름을 회수하게 되자 두 번째 입장자가 방장을 밀어냈다. `current()` 가 정본.
  _myName: function () {
    var A = GAME.Account;
    var c = A && A.current ? A.current() : null;
    var n = (c && typeof c === 'object') ? (c.id || c.name) : c;
    return (n && String(n)) || '손님';
  },
  //  기기 토큰 — 백그라운드 복귀·새로고침 뒤 **같은 기기의 같은 이름**만 서버가 자리를
  //  회수한다. 다른 기기가 같은 닉네임으로 들어오면 예전처럼 '이름#2' 다.
  _cid: function () {
    if (this._cidVal) return this._cidVal;
    var v = null;
    try { v = localStorage.getItem('eggwar.cid'); } catch (e) {}
    if (!v) {
      v = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      try { localStorage.setItem('eggwar.cid', v); } catch (e2) {}
    }
    this._cidVal = v;
    return v;
  },

  // 방 만들기 → cb(err, { code, host, mode })
  createRoom: function (opts, cb) {
    opts = opts || {};
    this._http('/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: opts.id || this._myName(),
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
    this.retrying = false;
    this.code = String(code || '').toUpperCase();
    this._openSocket(id);
    return true;
  },

  _openSocket: function (id) {
    var self = this;
    var base = this.BASE.replace(/^http/, 'ws');
    var name = id || this._myName();
    var url = base + '/ws?code=' + encodeURIComponent(this.code) +
              '&id=' + encodeURIComponent(name) +
              '&cid=' + encodeURIComponent(this._cid()) +          //  기기 토큰 — 같은 이름·같은 기기만 자리 회수
              '&v=' + encodeURIComponent(GAME.VERSION || '');   //  버전 악수(록스텝 보호)
    var ws;
    try { ws = new WebSocket(url); }
    catch (e) { this._scheduleRetry(id); return; }
    this.ws = ws;

    //  ⚠ 소켓 신원 가드 — 재접속(visibilitychange)으로 새 소켓을 열면 **옛 좀비
    //    소켓의 onclose 가 늦게 도착해** connected=false 로 새 연결 상태를 덮고
    //    재시도까지 걸어 소켓이 두 개가 된다(실제 위험 경로). 핸들러마다
    //    "내가 아직 현역인가(self.ws === ws)"를 먼저 본다.
    ws.onopen = function () {
      if (self.ws !== ws) return;
      var wasRetrying = self.retrying;
      self.connected = true;
      self.retrying = false;
      self._retry = 0;
      self._startHeartbeat();
      //  끊겼다 되붙은 것이면 알린다 — 록스텝은 끊긴 동안 보낸 입력 패킷을 잃으므로
      //  받는 쪽이 그 틱을 **빈 입력으로** 실행해 desync 가 된다. 듣는 쪽(battle.js)이
      //  outbox 를 다시 흘려 그 구멍을 메운다.
      if (wasRetrying) self._emit('reopen', {});
    };

    ws.onmessage = function (ev) {
      if (self.ws !== ws) return;
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      self._onMessage(msg);
    };

    ws.onerror = function () {
      if (self.ws !== ws) return;
      self._emit('error', '연결 오류');
    };

    //  ⚠⚠ 끊김에는 **두 종류**가 있고, 예전에는 둘을 구분하지 않았다 (2026-09-04).
    //  소켓이 잠깐 끊기는 것은 이 게임에서 예외가 아니라 기본이다(폰 화면 꺼짐·
    //  네트워크 전환·DO 재기동). 그런데 `close` 를 무조건 올리는 바람에 그 한 번의
    //  깜빡임이 **판을 끝내고 있었다** — 협동 보스전에서 "둘 다 파트너가 떠났다며
    //  시작하자마자 끝난다"(태현님 신고)의 정체다. 재시도가 걸린 끊김은 `drop`,
    //  정말 끝난 것만 `close` 다. 되붙으면 `reopen` 이 온다.
    ws.onclose = function (ev) {
      if (self.ws !== ws) return;
      self.connected = false;
      self._stopHeartbeat();
      var code = ev && ev.code;
      //  4009 = 버전 불일치 · 4004 = 없는 방 — 서버의 의도적 거절. 재시도해도 같은 답.
      //  4008 = 다른 연결(같은 닉네임·같은 기기)이 자리를 가져감 — 이쪽이 물러난다.
      var fatal = self.closedByUser || code === 4009 || code === 4004 || code === 4008;
      if (!fatal && self._retry < self.MAX_RETRY) {
        self.retrying = true;
        self._emit('drop', { code: code });
        self._scheduleRetry(id);
      } else {
        self.retrying = false;
        self._emit('close', { code: code, byUser: self.closedByUser });
      }
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
    if (this._retry >= this.MAX_RETRY) {
      //  여기가 **진짜 끝**이다 — 이제서야 close 를 올린다(위 onclose 주석 참조).
      this.retrying = false;
      this._emit('error', '재접속 실패 — 방에서 나갑니다');
      this._emit('close', { code: 0, byUser: false });
      return;
    }
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
    this.retrying = false;
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
    //  지연은 **실제 전투 경로**(P2P 직결이 붙었으면 그쪽)를 보여준다 — 예전엔
    //  서버 경유 WS 값만 보여줘서 "612ms" 같은 숫자가 떴는데, 정작 전투 입력
    //  지연은 bestRtt 로 정해진다. 화면과 전투가 다른 값을 말하면 안 된다.
    var rt = this.bestRtt();
    var viaP2p = GAME.NetRtc && GAME.NetRtc.ready() && GAME.NetRtc.rttMs != null;
    return '방 ' + this.code + ' · ' + n + '/2명' +
      (rt == null ? '' : ' · 지연 ' + Math.round(rt) + 'ms' + (viaP2p ? ' (직결)' : ''));
  }
};

// ── 백그라운드 전환 = 퇴장이 아니다 (2026-09-02 태현님: "접속이 너무 자주 끊어짐") ──
//  예전 코드는 pagehide 에서 leave(true) 를 불렀다. 그런데 폰은 **화면이 꺼지거나
//  앱을 잠깐 바꿔도 pagehide 가 뜬다** — 상대를 기다리며 화면이 어두워지는 순간
//  자기 손으로 방을 나가 버렸고(closedByUser=true 라 재접속 로직까지 무력화),
//  돌아와 보면 "연결이 끊겼습니다"였다. 이게 신고의 정체다.
//  지금은: 나가기는 오직 [나가기] 버튼과 씬 shutdown 만 한다. 백그라운드로 소켓이
//  죽으면 서버 하트비트 청소가 상대에게 알리고, **화면에 돌아오면 같은 방으로
//  즉시 재입장**한다(서버가 같은 닉네임의 유령 자리를 회수한다 — worker 쪽 짝 수정).
if (typeof window !== 'undefined' && window.addEventListener &&
    typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', function () {
    var NR = GAME.NetRoom;
    if (document.visibilityState !== 'visible') return;
    if (!NR.code || NR.connected || NR.closedByUser) return;
    //  대기 중이던 재시도 타이머보다 빠르게, 횟수도 새로 센다(사람이 돌아온 순간이
    //  가장 붙기 좋은 순간이다 — 백그라운드에선 타이머가 스로틀되어 있었다).
    if (NR._retryTimer) { clearTimeout(NR._retryTimer); NR._retryTimer = null; }
    NR._retry = 0;
    NR._openSocket();
  });
}
