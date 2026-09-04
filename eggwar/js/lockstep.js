window.GAME = window.GAME || {};
// ============================================================================
//  록스텝 — 같은 전장 실시간 대전의 심장. (P2, 2026-08-19)
//
//  모델: 두 클라이언트가 **같은 시뮬을 나란히 굴린다.** 오가는 것은 입력뿐이다.
//   · 시간은 고정 틱(30/s)으로만 흐른다. 렌더 프레임과 분리(누적기).
//   · 내 입력은 틱 T 에 넣으면 **T+DELAY 에 실행**되도록 스케줄하고 즉시 상대에게
//     보낸다. 상대도 같게 한다 → 두 쪽 모두 같은 틱에 같은 입력을 갖는다.
//   · 틱 T 는 **상대의 T 패킷이 도착해야** 실행한다(빈 입력도 패킷은 온다 — 진행 신호).
//     안 왔으면 시뮬을 세운다(스톨). RTT 158ms + DELAY 6틱(200ms)이면 스톨은 드물다.
//   · 같은 틱의 명령은 고정 순서(controller 먼저)로 적용한다 — 순서가 갈리면 끝이다.
//   · CHECK_EVERY 틱마다 상태 digest 를 교환해 어긋남(desync)을 **정직하게** 잡는다.
//     v1 은 재동기화하지 않는다 — 판 무효를 선언하고 끝낸다(반쯤 맞는 판이 최악이다).
//
//  전제(P0·P1 에서 실측 완료):
//   · 시뮬은 엔진 무관 비트 결정론(detmath + Combat.seedRng)
//   · 명령 = 데이터: {kind:'order', order:{...}} | {kind:'skill', slot, x, y}
//     | {kind:'potion'} — js/input.js 가 만드는 형식 그대로 직렬화 가능한 값만.
//
//  이 파일은 **전송을 모른다.** send 콜백만 받는다(NetRoom 이든 하니스든).
// ============================================================================
GAME.Lockstep = (function () {
  'use strict';

  var TICK_MS = 1000 / 30;
  var DELAY = 6;            // 입력 지연(틱) — 200ms. RTT p95 171ms 를 덮는다.
  var CHECK_EVERY = 30;     // digest 교환 주기(틱) — 1초.
  //  한 프레임에 몰아서 따라잡는 상한(틱). ⚠ 크면 스톨이 풀리는 순간 **순간이동**이
  //  된다 — 8 이면 267ms 어치가 한 프레임에 지나가고 그게 "렉"으로 보고된다
  //  (2026-09-04 태현님 ⑧). 4 면 초당 최대 120틱(필요치 30틱의 4배)이라 따라잡기는
  //  넉넉하면서 눈에는 빨리 감기로 읽힌다. 이 값을 3 밑으로 내리면 30fps 기기에서
  //  영영 못 따라잡는다(30fps × 3 = 90틱/s 가 하한선).
  var CATCHUP_MAX = 4;
  //  재접속 때 다시 흘릴 입력 창(틱). 8초치 — 재시도 백오프 상한(8초)보다 넉넉해야
  //  끊긴 구간을 통째로 덮는다. 그보다 오래 끊겼으면 어차피 close 로 판이 끝난다.
  var RESEND_WINDOW = 240;

  //  FNV-1a Float64 비트 digest — pvp-harness 와 같은 식(결정론 판정은 비트 비교).
  function digest(state) {
    var buf = new ArrayBuffer(8), f64 = new Float64Array(buf), u8 = new Uint8Array(buf);
    var h = 0x811c9dc5 >>> 0;
    function eat(v) {
      f64[0] = v;
      for (var i = 0; i < 8; i++) { h = (h ^ u8[i]) >>> 0; h = Math.imul(h, 0x01000193) >>> 0; }
    }
    for (var i = 0; i < state.units.length; i++) {
      var u = state.units[i];
      eat(u.x); eat(u.y); eat(u.hp); eat(u.alive ? 1 : 0); eat(u.cd || 0);
    }
    eat(state.elapsed);
    return h >>> 0;
  }

  function Session(opts) {
    //  opts: { state, mySide, send(msg), onDesync(tick), heroOf(side), delay }
    //  delay — 입력 지연 틱. **양쪽이 같은 값**이어야 한다(각자 계산하면 desync).
    //  실측 RTT 에서 유도한다(모바일 300ms+ 에서 고정 6틱은 스톨 연발이었다).
    this.delay = Math.max(2, Math.min(24, (opts.delay | 0) || DELAY));
    this.state = opts.state;
    this.mySide = opts.mySide;
    this.send = opts.send;
    this.onDesync = opts.onDesync || function () {};
    //  heroOf(side[, heroId]) — 두 번째 인자는 협동용(step 주석). 1인 세션은 무시해도 된다.
    this.heroOf = opts.heroOf;

    this.tick = 0;                 // 다음에 실행할 틱
    this.acc = 0;                  // 렌더 dt 누적기(ms)
    this.cmdsBySide = { controller: {}, strategist: {} };   // tick → cmds[]
    //  상대 입력이 **확정된** 마지막 틱. 시작 시 DELAY-1 — 양쪽 다 0..DELAY-1 을
    //  빈 입력으로 미리 채우는 대칭 규약이라, 첫 DELAY 틱은 신호 없이도 돈다.
    this.remoteTick = this.delay - 1;
    this._sq = 0;                 // 내 입력 패킷 일련번호
    this._outbox = {};            // tick → 내가 보낸 입력 패킷(재접속 재전송용)
    this._pq = {};                // 틱별 최근 수신 일련번호 — 늦게 온 옛 패킷을 버린다
    this.myDigests = {};           // tick → digest (내 것)
    this.theirDigests = {};        // tick → digest (상대 것)
    this.desynced = false;
    this.stalledMs = 0;            // 진단용 — 스톨 총량

    //  시작 직후 DELAY 틱 동안 상대 입력이 원천적으로 없다 — 양쪽 다 0..DELAY-1 틱을
    //  빈 입력으로 미리 채워 같은 출발선을 만든다.
    for (var t = 0; t < this.delay; t++) {
      this.cmdsBySide.controller[t] = [];
      this.cmdsBySide.strategist[t] = [];
    }
  }

  //  내 입력 — 지금 넣으면 tick+DELAY 에 실행되도록 큐에 넣고 즉시 전송한다.
  //  ⚠ 같은 틱에 여러 번 불릴 수 있다(이동+스킬). 배열로 쌓는다.
  //  협동: `heroId` 를 주면 명령에 `h` 로 실린다(안 주면 예전 그대로 — 첫 영웅).
  Session.prototype.queueLocal = function (cmd, heroId) {
    if (this.desynced) return;
    if (heroId !== undefined && heroId !== null && cmd && cmd.h === undefined) cmd.h = heroId;
    var at = this.tick + this.delay;
    var q = this.cmdsBySide[this.mySide];
    if (!q[at]) q[at] = [];
    q[at].push(cmd);
    var msg = { type: 'input', t: at, side: this.mySide, cmds: q[at], q: ++this._sq };
    //  ⚠ 보낸 것을 **들고 있는다**(2026-09-04). 소켓이 잠깐 끊기면 그 사이 보낸 입력
    //  패킷이 통째로 사라지는데, `inputsFinal` 은 최댓값 병합이라 **혼자 살아 돌아와**
    //  받는 쪽이 그 틱을 빈 입력으로 실행해 버린다 → 조용한 desync. 되붙는 순간
    //  outbox 를 다시 흘려 구멍을 메운다(수신이 멱등이라 중복은 무해하다).
    this._outbox[at] = msg;
    this.send(msg);
  };

  //  재접속 직후 — 아직 상대가 실행하지 않았을 수 있는 입력을 전부 다시 보낸다.
  //  상대 진행도를 모르므로 **최근 창(RESEND_WINDOW 틱)** 을 통째로 흘린다.
  Session.prototype.resendInputs = function () {
    if (this.desynced) return 0;
    var n = 0, from = this.tick - RESEND_WINDOW;
    for (var k in this._outbox) {
      if ((k | 0) < from) { delete this._outbox[k]; continue; }
      this.send(this._outbox[k]); n++;
    }
    //  상대가 내 진행 신호도 놓쳤을 수 있다 — 최신 확정치를 한 번 더(멱등).
    if (this.tick > 0) this.send({ type: 'inputsFinal', upto: this.tick - 1 + this.delay, side: this.mySide });
    return n;
  };

  //  상대(또는 릴레이) 메시지 수신.
  Session.prototype.onMessage = function (msg) {
    if (this.desynced) return;
    if (msg.type === 'input') {
      //  같은 틱 패킷이 여러 번 오면 마지막 것이 전체 목록이다(전송이 누적본을 보냄).
      //  ⚠ 입력 패킷은 remoteTick 을 **올리지 않는다** — 그 틱에 입력이 더 올 수
      //    있다(확정은 inputsFinal 만 한다). 패킷만 보고 달리면 늦게 온 추가 입력을
      //    빼먹은 채 실행해 desync 가 된다.
      //  전송 경로(P2P↔WS 폴백)가 바뀌는 순간 같은 틱의 누적본이 역순으로 올 수
      //  있다 — 일련번호가 낮은(옛) 패킷은 버린다. 없으면 옛 목록이 새 것을 덮는다.
      if (msg.q !== undefined) {
        if (this._pq[msg.t] !== undefined && msg.q < this._pq[msg.t]) return;
        this._pq[msg.t] = msg.q;
      }
      this.cmdsBySide[msg.side][msg.t] = msg.cmds || [];
    } else if (msg.type === 'inputsFinal') {
      //  "내 입력은 msg.upto 틱까지 확정" — 보낸 쪽이 틱 t 를 **실행한 순간**
      //  t+DELAY 이전 입력은 더 못 넣게 되므로(스케줄이 tick+DELAY), 그때 보낸다.
      //  ⚠ 예전 이름 tickdone("틱 실행 후 알림")은 상호 대기 교착이었다 —
      //    A 는 B 가 T 를 돌기를, B 는 A 가 T 를 돌기를 기다렸다(하니스 실측 27틱 정지).
      if (msg.side !== this.mySide && msg.upto > this.remoteTick) this.remoteTick = msg.upto;
    } else if (msg.type === 'digest') {
      this.theirDigests[msg.t] = msg.d;
      this._checkDigest(msg.t);
    }
  };

  Session.prototype._checkDigest = function (t) {
    var mine = this.myDigests[t], theirs = this.theirDigests[t];
    if (mine === undefined || theirs === undefined) return;
    if (mine !== theirs) {
      this.desynced = true;
      this.onDesync(t);
    }
    delete this.myDigests[t]; delete this.theirDigests[t];
  };

  //  틱 T 를 실행할 수 있는가 — 상대 입력이 T 까지 **확정**돼 있어야 한다.
  Session.prototype.canRun = function () {
    return this.tick <= this.remoteTick;
  };

  //  한 틱 실행 — 명령 적용(고정 순서) → 시뮬 → digest.
  Session.prototype.step = function () {
    var state = this.state, t = this.tick;
    var order = ['controller', 'strategist'];        // ⚠ 순서 고정 — 갈리면 desync
    for (var s = 0; s < 2; s++) {
      var side = order[s];
      var cmds = this.cmdsBySide[side][t] || [];
      //  ── 협동(시즌2 S-E/S-C): 명령에 `h`(heroId) 가 있으면 그 영웅에게 간다 ──
      //  `heroOf(side, heroId)` 계약 — battle 이 `_rtHeroes[side]` 를 **배열**(또는 id 맵)로
      //  넓히면 두 번째 인자로 고른다. 없거나 모르는 id 면 첫 영웅(하위호환: 지금의 1인
      //  세션은 h 를 안 실으므로 예전과 동일). 같은 틱 안에서 영웅이 달라도 **명령 순서는
      //  배열 순서 그대로**라 양쪽이 같은 순서로 적용한다.
      for (var i = 0; i < cmds.length; i++) {
        var hero = this.heroOf(side, cmds[i] && cmds[i].h);
        this._apply(hero, cmds[i]);
      }
      delete this.cmdsBySide[side][t];
    }
    this.tick++;
    delete this._outbox[t - RESEND_WINDOW];     // 재전송 창 밖은 버린다(무한 증가 방지)

    //  틱 t 를 실행했으므로 내 입력 스케줄은 t+DELAY 까지 확정이다(이후 입력은
    //  전부 t+1+DELAY 이상에 실린다). 상대는 이 신호로 t+DELAY 까지 달릴 수 있다.
    //  (매 틱 1개 — 수십 바이트. 실사용 3명 규모에서 비용 없음.)
    //  ⚠ **시뮬보다 먼저 보낸다** (2026-09-04). 값은 한 비트도 안 다르지만(스케줄은
    //    `tick++` 시점에 확정된다), 상대의 스톨을 푸는 신호가 내 시뮬 한 틱만큼 일찍
    //    출발한다. 난전 프레임에서 그 한 틱이 상대의 스톨로 그대로 넘어간다.
    //  ⚠ `tick++` **뒤**여야 한다. 앞에서 보내면 t+delay 에 아직 내 입력이 더 실릴 수
    //    있어 상대가 빈 입력으로 그 틱을 돌린다 — 조용한 desync 다.
    this.send({ type: 'inputsFinal', upto: t + this.delay, side: this.mySide });
    GAME.Combat.update(state, TICK_MS);

    if (t > 0 && t % CHECK_EVERY === 0) {
      var d = digest(state);
      this.myDigests[t] = d;
      this.send({ type: 'digest', t: t, d: d });
      this._checkDigest(t);
    }
  };

  Session.prototype._apply = function (hero, cmd) {
    if (!hero || !hero.alive) return;
    if (cmd.kind === 'order') hero.order = cmd.order;
    else if (cmd.kind === 'skill')
      GAME.Combat.castSkill(hero, cmd.slot, cmd.x, cmd.y, this.state);
    else if (cmd.kind === 'potion' && GAME.Combat.usePotion)
      GAME.Combat.usePotion(hero, this.state);
  };

  //  렌더 프레임에서 부른다 — dt 를 누적해 실행 가능한 틱만큼 돌린다.
  //  반환: 이번 호출에서 실행한 틱 수(0 이면 스톨 중 — 화면에 "동기화 중" 표시용).
  Session.prototype.advance = function (dtMs) {
    if (this.desynced || this.state.over) return 0;
    this.acc += dtMs;
    var ran = 0;
    while (this.acc >= TICK_MS && !this.state.over) {
      if (!this.canRun()) { this.stalledMs += this.acc; this.acc = 0; break; }
      this.acc -= TICK_MS;
      this.step();
      ran++;
      if (ran >= CATCHUP_MAX) { this.acc = 0; break; }
    }
    return ran;
  };

  return {
    TICK_MS: TICK_MS, DELAY: DELAY, CHECK_EVERY: CHECK_EVERY,
    digest: digest,
    create: function (opts) { return new Session(opts); }
  };
})();
