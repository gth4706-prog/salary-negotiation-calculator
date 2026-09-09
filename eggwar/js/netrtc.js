window.GAME = window.GAME || {};

// ============================================================================
//  실시간 대전 — **P2P 직결 계층** (WebRTC DataChannel, 2026-08-21)
//
//  왜 있나: 실측으로 확정된 구조 문제 때문이다. 한국 ISP 는 Cloudflare 무료 플랜
//  트래픽을 해외 콜로(LAX)로 우회시킨다 — cf-ray 실측 LAX, relay 왕복 p50 493ms.
//  DO 를 APAC 에 둬도(v2.19) 클라이언트→엣지 구간이 이미 태평양을 건너므로
//  서버 위치로는 해결이 안 된다. 실시간 모바일 게임의 표준대로 **두 플레이어를
//  직접 연결**한다(한국↔한국 P2P ≈ 10~40ms). 서버(DO)는 세 역할만 남는다:
//  방 관리 · 시그널링(offer/answer/ICE 릴레이) · P2P 실패 시 폴백 릴레이.
//
//  규약:
//   · NetRoom.relay() 가 이 계층을 먼저 시도한다 — 열려 있으면 DataChannel 로,
//     아니면 기존 WS 릴레이로. **씬·록스텝은 전송 경로를 모른다**(수신 이벤트 동일).
//   · ordered+reliable 기본 채널(TCP 같은 보장) — 록스텝은 유실을 못 견딘다.
//   · 실패는 **이 방에서는 확정**(_dead) — WS 로 눌러앉고 되돌아가지 않는다.
//     경로가 오락가락하면 같은 틱 입력 패킷의 순서 역전 위험이 생긴다
//     (lockstep 의 q 시퀀스 가드가 이중 방어선).
//   · 시그널링은 반드시 **원시 WS**(NetRoom.send)로 보낸다 — relay() 를 쓰면
//     자기 자신을 통해 자기를 여는 순환이 된다.
//  ES5 · 콜백만(게임 클라이언트 규약).
// ============================================================================
GAME.NetRtc = {
  pc: null,
  dc: null,
  _open: false,
  _dead: false,        // 이 방에서 P2P 포기(실패 확정) — reset() 전까지 재시도 없음
  rttMs: null,         // DataChannel 실측 왕복지연 (록스텝 입력 지연 산정에 쓰인다)
  //  ⚠ **p95 를 따로 둔다** — 중앙값만 쓰면 모바일 지터가 입력 버퍼를 넘을 때마다
  //    strict lockstep 이 멈춘다(그게 "간헐적 렉"으로 보인다). `rtflow` 가 이 값을 읽는다.
  rttP95Ms: null,
  _fastPingCount: 0,
  _samples: [],
  _pingSeq: 0,
  _pingAt: {},
  _pingTimer: null,

  supported: function () { return typeof RTCPeerConnection === 'function'; },
  //  ⚠ `ready()`(붙었다)와 `measurementReady()`(잴 만큼 쟀다)는 **다른 질문**이다.
  //    붙자마자 delay 를 굳히면 표본 한두 개로 정하게 된다 — 그 값이 판 내내 간다.
  measurementReady: function () { return this.ready() && this._samples.length >= 8; },
  ready: function () {
    return this._open && !this._dead && this.dc && this.dc.readyState === 'open';
  },

  //  방에 2명이 모이면 방장이 offer 를 낸다. netroom 이 peers 갱신 때마다 부른다.
  //  (양쪽이 동시에 offer 를 내면 충돌한다 — 방장 단독 offer 로 결정적이게.)
  maybeStart: function () {
    var NR = GAME.NetRoom;
    if (!this.supported() || this._dead || this.pc) return;
    if (!NR.connected || !NR.peers || NR.peers.length !== 2) return;
    this._create();
    if (NR.me === NR.host) this._offer();
  },

  //  워커의 `/ice` 에서 단기 TURN 자격증명을 받아 이미 만든 연결에 얹는다.
  //  ⚠ 실패해도 조용히 넘어간다 — STUN 직결과 기존 WS 릴레이(`/ws`)가 그대로 남아
  //    대전이 끊기지 않는다. TURN 은 직결이 안 되는 망(대칭 NAT)을 위한 보조 경로다.
  //  ⚠ 키가 워커에 없으면 서버가 STUN 만 돌려준다 — 그때도 이 코드는 정상 동작한다.
  _loadIce: function (pc, base) {
    var NR = GAME.NetRoom;
    var url = (NR && NR.BASE ? NR.BASE : '') + '/ice';
    if (!NR || !NR.BASE || typeof fetch !== 'function') return;
    //  ⚠ 방에서 받은 서명 티켓을 실어 보낸다 — 없으면 서버가 STUN 만 돌려준다
    //    (거절이 아니라 폴백이라 대전은 그대로 성립한다).
    var opt = { cache: 'no-store' };
    if (NR.iceTicket) opt.headers = { Authorization: 'Bearer ' + NR.iceTicket };
    fetch(url, opt).then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (d) {
      if (!d || !d.iceServers || !d.iceServers.length) return;
      if (!pc || pc.signalingState === 'closed' || !pc.setConfiguration) return;
      try { pc.setConfiguration({ iceServers: base.concat(d.iceServers) }); } catch (e) {}
    })['catch'](function () {});
  },

  _create: function () {
    var self = this;
    var pc;
    try {
      //  ── ICE 서버 ──────────────────────────────────────────────────────────
      //  ⚠⚠ **TURN 자격증명을 여기에 적지 말 것** (2026-09-09 보안 수정).
      //    2026-08-24 부터 metered.ca 의 장기 username/credential 이 이 자리에 평문으로
      //    박혀 있었다. 당시 주석은 "TURN 자격증명은 클라이언트 내장이 표준(공개 성격)"
      //    이라고 적었는데 **그건 틀렸다** — 표준은 서버가 발급하는 **단기** 자격증명이고,
      //    장기 키를 넣으면 누구나 `joeltool.com/eggwar/js/netrtc.js` 를 받아 그 계정의
      //    릴레이 할당량을 그대로 쓸 수 있다(무료 500MB/월이 남의 트래픽으로 소진된다).
      //    전역 보안 규칙("브라우저로 가는 코드에 진짜 비밀 키를 넣지 않는다") 위반이고,
      //    RT 인수인계 문서(INTEGRATION-MAP.md)의 이식 순서 1번이 이 폐기다.
      //  → 이제 워커의 `/ice` 가 **수명 1시간짜리**를 발급한다. 키는 워커 시크릿에만 있다.
      //  ⚠ `_loadIce` 는 **비동기**다. 그 사이에도 연결은 시작해야 하므로 STUN 만으로
      //    먼저 만들고, 도착하면 `setConfiguration` 으로 갈아끼운다(표준 API).
      //    도착 전에 붙어 버리면 그 판은 STUN 직결로 가는데, 그건 원래 가장 좋은 경로다.
      var ICE = [
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'stun:stun.l.google.com:19302' }
      ];
      pc = new RTCPeerConnection({ iceServers: ICE });
      this._loadIce(pc, ICE);
    } catch (e) { this._fail(); return; }
    this.pc = pc;
    pc.onicecandidate = function (ev) {
      if (ev.candidate) self._signal({ ice: ev.candidate });
    };
    pc.onconnectionstatechange = function () {
      if (!self.pc) return;
      var st = self.pc.connectionState;
      if (st === 'failed' || st === 'closed') self._fail();
    };
    pc.ondatachannel = function (ev) { self._bind(ev.channel); };
  },

  _offer: function () {
    var self = this;
    var dc;
    try { dc = this.pc.createDataChannel('lk', { ordered: true }); }
    catch (e) { this._fail(); return; }
    this._bind(dc);
    this.pc.createOffer()
      .then(function (d) { return self.pc.setLocalDescription(d); })
      .then(function () { self._signal({ sdp: self.pc.localDescription }); })
      .catch(function () { self._fail(); });
  },

  _bind: function (dc) {
    var self = this;
    this.dc = dc;
    dc.onopen = function () {
      self._open = true;
      self._startPing();
      GAME.NetRoom._emit('rtc', true);
    };
    dc.onclose = function () { self._fail(); };
    dc.onerror = function () { self._fail(); };
    dc.onmessage = function (ev) {
      self.lastRecvAt = (window.performance && performance.now) ? performance.now() : Date.now();
      var m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.__p) { try { dc.send(JSON.stringify({ __q: m.__p })); } catch (e) {} return; }
      if (m.__q) { self._pong(m.__q); return; }
      //  씬·록스텝이 보는 수신 이벤트는 WS 릴레이와 완전히 같다.
      GAME.NetRoom._emit('message', m.from, m.data);
    };
  },

  //  상대의 시그널(offer/answer/ICE) — netroom 'relay' 수신부가 가로채 넘겨준다.
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
      }).catch(function () { self._fail(); });
    } else if (sig.ice) {
      this.pc.addIceCandidate(sig.ice).catch(function () {});
    }
  },

  _signal: function (obj) {
    GAME.NetRoom.send({ t: 'relay', data: { rtc: obj } });
  },

  //  relay 데이터 송신 — 성공하면 true(WS 로 보낼 필요 없음), 아니면 false.
  send: function (data) {
    if (!this.ready()) return false;
    try {
      this.dc.send(JSON.stringify({ from: GAME.NetRoom.me, data: data }));
      return true;
    } catch (e) { this._fail(); return false; }
  },

  // ── DataChannel 자체 왕복지연 — 록스텝 입력 지연은 **실제 경로**의 rtt 를 봐야 한다 ──
  //  ⚠⚠ **빠른 워밍업** (2026-09-09, RT 인수인계 `INTEGRATION-MAP.md` §netrtc).
  //    예전엔 2초마다 한 번이라 표본 8개를 모으는 데 **16초**가 걸렸다. 준비 화면이
  //    60초라 판이 시작될 때까지 측정이 안 끝나고, 그러면 `rtflow` 가 기본값 180ms 로
  //    입력 지연을 굳혀 **직결이 2ms 인데도 서버 경유 왕복 기준**으로 논다.
  //    250ms × 12회 = 3초면 끝난다. 그 뒤엔 다시 2초 주기로 돌아간다(부하 없음).
  _startPing: function () {
    var self = this;
    this._stopPing();
    this._fastPingCount = 0;
    this._ping();
    this._pingTimer = setInterval(function () {
      self._ping();
      self._fastPingCount++;
      if (self._fastPingCount >= 12) {
        self._stopPing();
        self._pingTimer = setInterval(function () { self._ping(); }, 2000);
      }
    }, 250);
  },
  _stopPing: function () {
    if (this._pingTimer) { clearInterval(this._pingTimer); this._pingTimer = null; }
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
    this._samples.push(now - t0);
    if (this._samples.length > 9) this._samples.shift();
    var s = this._samples.slice().sort(function (a, b) { return a - b; });
    this.rttMs = s[(s.length - 1) >> 1];
    this.rttP95Ms = s[Math.max(0, Math.ceil(s.length * 0.95) - 1)];
  },

  _fail: function () {
    this._open = false;
    this._dead = true;          // 이 방에서는 WS 폴백으로 눌러앉는다
    this._stopPing();
    if (this.dc) { try { this.dc.close(); } catch (e) {} this.dc = null; }
    if (this.pc) { try { this.pc.close(); } catch (e) {} this.pc = null; }
    GAME.NetRoom._emit('rtc', false);
  },

  //  방을 나가면 초기화 — 다음 방에서 다시 시도한다.
  reset: function () {
    this._stopPing();
    if (this.dc) { try { this.dc.close(); } catch (e) {} }
    if (this.pc) { try { this.pc.close(); } catch (e) {} }
    this.pc = null; this.dc = null;
    this._open = false; this._dead = false;
    this.rttMs = null; this.rttP95Ms = null; this._samples = []; this._pingAt = {};
  }
};
