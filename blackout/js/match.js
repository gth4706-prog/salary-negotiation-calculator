window.BO = window.BO || {};

// ============================================================================
//  블랙아웃 — **대전 진행**. 규칙 엔진과 연결 계층 사이에 있다.
//
//  하는 일 네 가지.
//   1) 턴 제한시간을 재고, 내 턴을 확정해서 상대에게 보낸다.
//   2) 상대 턴을 받아 **같은 문**(Core.applyTurn)으로 적용한다.
//   3) 매 턴 상태 해시를 대조한다. 어긋나면 **멈추고 크게 알린다.**
//   4) 끊겼다 돌아오면 씨앗 + 턴 기록으로 따라잡는다.
//
//  ── 여기가 에그워와 갈라지는 지점 ─────────────────────────────────────────
//  에그워는 실시간이라 록스텝이었다. 매 틱 입력을 맞춰야 하니 지연을 몇 프레임으로
//  잡을지가 판을 좌우했고, 끊긴 동안 잃은 입력 패킷을 되흘려 메워야 했다.
//  이 게임은 턴제다. **턴 하나 = 메시지 하나**이고, 늦게 도착해도 순서만 맞으면
//  결과가 같다. 그래서 지연 산식이 아예 없고, 재접속 복구는 「기록을 처음부터
//  다시 재생」이라는 한 줄로 끝난다. 같은 문제를 «고치는» 대신 «안 생기게» 했다.
//
//  ⚠ 어긋남을 조용히 넘기지 않는다. 에그워의 desync 는 늘 한참 뒤에 엉뚱한 증상
//    으로 드러났다(v3.53). 턴제는 턴마다 값싸게 대조할 수 있으니 매번 대조한다.
// ============================================================================
BO.Match = (function () {
  var C = BO.Core;

  var TURN_MS  = 20000;   // 내 턴 제한시간. 「실시간 대전」이 되려면 시계가 있어야 한다.
  var GRACE_MS = 10000;   // 상대 턴이 이만큼 더 늦으면 「응답 없음」을 보여준다.
  var BOT_MS   = 800;     // 봇이 생각하는 척하는 시간(즉답하면 사람이 못 따라 읽는다)
  var BOT_STEP_MS = 650;  // 봇의 첫 수와 둘째 수 사이 — 둘이 한꺼번에 터지면 못 읽는다

  var m = null;    // 지금 진행 중인 판

  //  ⚠ 상태를 전역에 걸어 두지 않는다(`BO.state` 같은 것). 콘솔을 열면 상대 좌표가
  //    보이는 건 구조상 어차피 막을 수 없지만, **한 줄로 보이게** 둘 이유는 없다.
  function view() { return m ? C.view(m.st, m.mine) : null; }

  // ── 시작 ──────────────────────────────────────────────────────────────────
  //  opts: { seed, mine, vsBot, foeName, on:{ render, events, end, status } }
  function start(opts) {
    stop();
    m = {
      st: C.create(opts.seed),
      seed: opts.seed >>> 0,
      mine: opts.mine | 0,
      foe: 1 - (opts.mine | 0),
      vsBot: !!opts.vsBot,
      foeName: opts.foeName || '상대',
      on: opts.on || {},
      log: [],            // 확정된 턴 기록 — 재접속 복구의 전부
      pending: [],        // 내가 이번 턴에 쌓아 둔 행동(아직 안 보냄)
      botActs: [],        // 봇이 이번 턴에 둔 수
      inbox: {},          // 순서보다 먼저 온 턴(n → acts)
      desync: null,       // 어긋남이 확정되면 여기에 사유가 들어온다
      deadline: 0,
      timer: null,
      botTimer: null,
      waitingSince: 0
    };
    beginTurn();
    render();
    return view();
  }

  function stop() {
    if (!m) return;
    if (m.timer) clearInterval(m.timer);
    if (m.botTimer) clearTimeout(m.botTimer);
    m = null;
  }

  function active() { return !!m; }

  // ── 턴 시작 ───────────────────────────────────────────────────────────────
  function beginTurn() {
    if (!m || m.st.over) return;
    m.st.ev = [];
    m.pending = [];
    m.deadline = now() + TURN_MS;
    m.waitingSince = now();
    if (m.timer) clearInterval(m.timer);
    m.timer = setInterval(tick, 200);

    if (m.st.side !== m.mine && m.vsBot) {
      m.botActs = [];
      scheduleBot(BOT_MS);
    }
  }

  //  ── 봇 턴 ────────────────────────────────────────────────────────────────
  //  ⚠ 봇도 **한 수씩** 둔다. 턴 전체를 미리 계획하면 첫 수가 충돌이었을 때(제자리에
  //    남는다) 둘째 수가 벽 밖으로 나간다 — 실측으로 걸린 버그다. 규칙을 거치는 문은
  //    사람과 똑같이 `Core.act` 하나뿐이다.
  //  한 수마다 사이를 두는 이유는 따로 있다: 두 발이 한꺼번에 터지면 사람이 **어디에
  //  맞았는지를 못 읽는다.** 어둠 게임에서 그건 정보를 통째로 빼앗는 것이다.
  function scheduleBot(ms) {
    if (m.botTimer) clearTimeout(m.botTimer);
    m.botTimer = setTimeout(botStep, ms);
  }

  function botStep() {
    if (!m || m.st.over || m.desync || m.st.side === m.mine) return;
    var a = BO.Bot.think(m.st, m.foe);
    var err = a ? C.act(m.st, m.foe, a) : '넘김';
    if (!err) {
      m.botActs.push(a);
      fire(m.st.ev.slice(), m.foe);
      m.st.ev = [];
    }
    if (err || m.st.ap <= 0 || m.st.over) { botCommit(); return; }
    render();
    scheduleBot(BOT_STEP_MS);
  }

  function botCommit() {
    if (!m) return;
    if (m.timer) { clearInterval(m.timer); m.timer = null; }
    C.endTurn(m.st);
    m.log.push(m.botActs.slice());
    fire(m.st.ev.slice(), m.foe);
    afterTurn();
  }

  function now() { return Date.now(); }

  //  남은 시간 · 상대가 너무 오래 말이 없으면 알려 주기.
  function tick() {
    if (!m || m.st.over || m.desync) return;
    var left = m.deadline - now();
    if (m.st.side === m.mine) {
      if (left <= 0) { commit(true); return; }   // 시간이 다 되면 남은 행동력은 버린다
    } else if (!m.vsBot) {
      //  ⚠ 상대 턴을 **대신 끝내지 않는다.** 양쪽이 제각기 「시간 됐으니 넘긴다」를
      //    하면 그 순간 두 판이 갈라진다. 기다리는 쪽은 보여 주기만 한다.
      if (now() - m.waitingSince > TURN_MS + GRACE_MS) {
        say(BO.Net.retrying ? '상대와 다시 붙는 중…' : '상대 응답이 없습니다', 'warn');
      }
    }
    render(true);
  }

  function timeLeft() {
    if (!m || m.st.over) return 0;
    return Math.max(0, m.deadline - now());
  }

  // ── 내 행동 ───────────────────────────────────────────────────────────────
  //  화면이 부르는 유일한 입력구. 행동은 **즉시 내 화면에 반영**되고(눌렀는데 반응이
  //  없으면 사람은 또 누른다), 확정은 행동력을 다 쓰거나 [턴 넘기기] 때 한다.
  function doAct(a) {
    if (!m || m.st.over || m.desync) return '진행 중이 아님';
    if (m.st.side !== m.mine) return '내 턴이 아님';
    var before = m.st.ev.length;
    var err = C.act(m.st, m.mine, a);
    if (err) return err;
    m.pending.push(a);
    fire(m.st.ev.slice(before), m.mine);
    //  ⚠ 행동력이 남았어도 **판이 끝났으면 즉시 확정**한다. 안 그러면 마지막 한 발로
    //    이긴 턴이 전송되지 않아 진 쪽 화면이 영원히 「상대 턴」에 멈춘다.
    if (m.st.ap <= 0 || m.st.over) commit(false);
    else render();
    return null;
  }

  //  남은 행동력을 버리고 턴을 넘긴다(제한시간 초과 포함).
  function pass() { return commit(true); }

  function commit(byPass) {
    if (!m || m.st.side !== m.mine || m.st.over) return;
    if (m.timer) { clearInterval(m.timer); m.timer = null; }
    var n = m.log.length;
    var acts = m.pending.slice();
    //  ⚠ 이번 턴 사건 중 **아직 안 내보낸 것만** 내보낸다. 예전엔 `st.ev` 를 통째로
    //    다시 넘겨서 사격 한 번이 기록에 두 줄로 찍혔다(브라우저 실측에서 걸렸다).
    //    행동 하나하나는 `doAct` 가 이미 그때그때 내보냈다 — 여기서 새로 생기는 것은
    //    턴을 마감하며 만들어지는 발자국뿐이다.
    var seen = m.st.ev.length;
    C.endTurn(m.st);
    m.log.push(acts);
    fire(m.st.ev.slice(seen), m.mine);
    if (!m.vsBot) {
      BO.Net.relay({ t: 't', n: n, a: acts, h: C.hash(m.st) });
    }
    if (byPass && acts.length === 0) say('턴을 넘겼습니다', '');
    afterTurn();
  }

  // ── 상대 턴 ───────────────────────────────────────────────────────────────
  //  n 은 **이 턴이 몇 번째인가**(0부터). 순서 가드가 여기 전부 있다:
  //   · n < 기록길이 → 이미 처리했다(재접속 때 같은 턴이 다시 온다). 버린다.
  //   · n > 기록길이 → 사이가 비었다. 받아 두고 빈 구간을 요청한다.
  //   · n = 기록길이 → 지금 처리할 턴.
  function applyForeign(n, acts, theirHash) {
    if (!m || m.desync) return;
    if (n < m.log.length) return;
    if (n > m.log.length) {
      m.inbox[n] = { a: acts, h: theirHash };
      BO.Net.relay({ t: 'need', n: m.log.length });
      say('빠진 턴을 받아오는 중…', '');
      return;
    }
    if (m.st.side === m.mine) { flagDesync('턴 주인이 어긋났습니다'); return; }

    m.st.ev = [];
    var r = C.applyTurn(m.st, m.st.side, acts || []);
    if (!r.ok) { flagDesync('상대 턴을 규칙이 받지 않습니다: ' + r.err); return; }
    m.log.push(acts || []);
    fire(m.st.ev.slice(), m.foe);

    //  ⚠ 해시 대조 — 이 두 줄이 이 파일의 존재 이유다.
    if (theirHash != null && (C.hash(m.st) >>> 0) !== (theirHash >>> 0)) {
      flagDesync('판이 어긋났습니다 (내 ' + (C.hash(m.st) >>> 0) + ' ≠ 상대 ' + (theirHash >>> 0) + ')');
      return;
    }
    afterTurn();

    // 먼저 와서 기다리던 다음 턴이 있으면 이어서 처리한다.
    var nx = m.inbox[m.log.length];
    if (nx) { delete m.inbox[m.log.length]; applyForeign(m.log.length, nx.a, nx.h); }
  }

  function afterTurn() {
    if (!m) return;
    if (m.st.over) {
      if (m.timer) { clearInterval(m.timer); m.timer = null; }
      render();
      if (m.on.end) m.on.end(view());
      return;
    }
    beginTurn();
    render();
  }

  // ── 어긋남 ────────────────────────────────────────────────────────────────
  //  멈춘다. 조용히 계속 두면 두 사람이 서로 다른 판을 보면서 싸우게 된다.
  function flagDesync(why) {
    if (!m || m.desync) return;
    m.desync = why;
    if (m.timer) { clearInterval(m.timer); m.timer = null; }
    say(why, 'bad');
    render();
  }

  //  복구 시도: 상대에게 **처음부터 전부** 달라고 해서 씨앗으로 다시 만든다.
  function resync() {
    if (!m) return;
    say('상대의 기록으로 판을 다시 맞추는 중…', '');
    BO.Net.relay({ t: 'need', n: 0 });
  }

  // ── 연결 계층에서 들어오는 메시지 ─────────────────────────────────────────
  function onMessage(from, d) {
    if (!m || !d || !d.t) return;
    switch (d.t) {
      case 't':
        applyForeign(d.n | 0, d.a || [], d.h);
        break;
      case 'need':
        //  상대가 빠진 구간을 달라고 한다. 내 기록에서 잘라 보낸다.
        BO.Net.relay({ t: 'log', from: d.n | 0, a: m.log.slice(d.n | 0), seed: m.seed });
        break;
      case 'log':
        takeLog(d.from | 0, d.a || [], d.seed);
        break;
    }
  }

  //  받은 기록으로 따라잡는다.
  //   · 내가 뒤처진 것뿐이면 이어서 적용한다.
  //   · 어긋남 복구(from=0)면 씨앗으로 판을 새로 만들어 통째로 재생한다.
  function takeLog(from, acts, seed) {
    if (!m) return;
    if (seed != null && (seed >>> 0) !== m.seed) {
      flagDesync('씨앗이 다릅니다 — 같은 판이 아닙니다');
      return;
    }
    if (from === 0) {
      var r = C.replay(m.seed, acts);
      if (!r.ok) { flagDesync('상대 기록도 규칙에 맞지 않습니다: ' + r.err); return; }
      m.st = r.st; m.log = acts.slice(); m.inbox = {}; m.desync = null;
      say('판을 다시 맞췄습니다', 'ok');
      afterTurn();
      return;
    }
    if (from > m.log.length) { BO.Net.relay({ t: 'need', n: m.log.length }); return; }
    for (var i = m.log.length - from; i < acts.length; i++) {
      if (m.st.side === m.mine) break;     // 내 턴 차례까지 따라잡았다
      var res = C.applyTurn(m.st, m.st.side, acts[i]);
      if (!res.ok) { flagDesync('빠진 턴 적용 실패: ' + res.err); return; }
      m.log.push(acts[i]);
    }
    say('밀린 턴을 따라잡았습니다', 'ok');
    afterTurn();
  }

  //  끊겼다 되붙었다 — 그 사이에 상대가 둔 턴이 있을 수 있다. 무조건 물어본다.
  //  (에그워는 여기서 잃은 입력 패킷을 되흘려야 했다. 턴제는 그냥 다시 받으면 된다.)
  function onReopen() {
    if (!m) return;
    say('다시 붙었습니다 — 밀린 턴을 확인합니다', 'ok');
    BO.Net.relay({ t: 'need', n: m.log.length });
  }

  // ── 화면으로 나가는 길 ────────────────────────────────────────────────────
  function render(light) { if (m && m.on.render) m.on.render(view(), !!light); }
  //  ⚠ 상대 턴의 사건 중 **본인만 아는 것**(페인트를 밟았다)은 걸러서 넘긴다.
  //    양쪽이 같은 상태를 돌리니 사건 목록도 같다 — 거르는 자리는 여기 하나다.
  var PRIVATE = { step: 1 };
  function fire(evs, by) {
    if (!evs || !evs.length || !m || !m.on.events) return;
    if (by !== m.mine) evs = evs.filter(function (e) { return !PRIVATE[e.k]; });
    if (evs.length) m.on.events(evs, by);
  }
  function say(t, kind) { if (m && m.on.status) m.on.status(t, kind || ''); }

  return {
    TURN_MS: TURN_MS,
    start: start, stop: stop, active: active, view: view,
    doAct: doAct, pass: pass, timeLeft: timeLeft,
    onMessage: onMessage, onReopen: onReopen, resync: resync,
    desync: function () { return m && m.desync; },
    isMyTurn: function () { return !!m && !m.st.over && !m.desync && m.st.side === m.mine; },
    apLeft: function () { return m ? m.st.ap : 0; },
    movesUsed: function () { return m ? m.st.moves : 0; },
    foeName: function () { return m ? m.foeName : ''; },
    logLength: function () { return m ? m.log.length : 0; }
  };
})();
