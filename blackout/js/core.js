window.BO = window.BO || {};

// ============================================================================
//  블랙아웃 — **규칙 엔진**. 화면도 네트워크도 모른다.
//
//  이 파일은 순수 함수 덩어리다. DOM 을 만지지 않고, 타이머를 걸지 않고,
//  Math.random 을 부르지 않는다. 이유는 하나다 — **양쪽 브라우저가 같은 입력에서
//  반드시 같은 상태를 내야 한다.** 에그워에서 제일 비쌌던 버그가 전부 이 경계가
//  흐려진 자리에서 났다(실시간 기하가 씬마다 조금씩 달라 desync, v3.53).
//  그래서 여기서는 규칙만 돌리고, 어긋났는지는 `hash()` 로 매 턴 확인한다.
//
//  ⚠ 정직하게 적어 둔다 — **이 구조는 치트를 막지 못한다.**
//    양쪽 클라이언트가 전체 상태(=상대 좌표)를 들고 있으므로 개발자도구를 열면
//    상대 위치가 보인다. 숨김 정보 게임에서 이걸 진짜로 막으려면 방 서버(Worker)가
//    심판이 되어야 하는데, 그 서버 소스는 이 저장소에 없다.
//    대안(각자 제 좌표만 들고 피격 판정은 맞은 쪽이 답하기)도 «거짓말»이라는 다른
//    치트가 열릴 뿐이고, 비동기 왕복이 생겨 재접속 복구가 크게 어려워진다.
//    → v1 은 «아는 사람끼리 하는 판»을 전제로 결정론 + 해시 대조를 택했다.
//      서버 심판은 방 서버를 고칠 수 있게 될 때의 숙제다.
// ============================================================================
BO.Core = (function () {

  // ── 규칙 상수 — 밸런스는 전부 여기서만 만진다 ──────────────────────────────
  var C = {
    W: 10, H: 10,          // 불 꺼진 방 10×10
    HP: 5,                 // 5번 맞으면 죽는다
    AP: 2,                 // 한 턴에 두 번 행동(이동/사격 조합 자유)
    PAINT_TURNS: 5,        // 페인트가 바닥에 남는 턴 수
    MARK_TURNS: 3,         // 발자국이 보이는 턴 수(페인트보다 짧게 — 흔적은 흐려진다)
    //  제한 턴 — **판을 잘라 내지 않을 만큼**은 줘야 한다. 처음엔 60 으로 뒀는데
    //  실측해 보니 그게 대부분의 판을 중간에 끊고 있었다:
    //      60턴 → 격추 11.6% · 무승부 32.5%
    //     100턴 → 격추 62.0% · 무승부 18.0%
    //     140턴 → 아래 값(거의 다 승부가 난다)
    //  ⚠ 턴이 많다고 판이 길어지는 게 아니다. 턴 제한시간 20초는 **상한**이고
    //    사람은 보통 5초 안에 둔다. 140턴이어도 실제로는 10분 안팎이다.
    MAX_TURNS: 140,
    SPAWN_BAND: 3,         // 시작 구역: 0번은 위 3줄, 1번은 아래 3줄(서로 아는 공개 규칙)

    //  ── 여기서부터는 처음 규칙에 **없던** 값이다. 왜 넣었는지 근거를 적어 둔다 ──
    //
    //  처음 규칙 그대로(사거리 무제한·인기척 없음·총성 없음) 봇끼리 2,000판:
    //      격추 0% · 무승부 76% · 명중률 0.2% · 이동 0회 · 발자국 0회 · 피해 0.27/10
    //  «한 판도 안 끝나는 게임»이었다. 원인은 튜닝이 아니라 둘이다.
    //   (1) 어디든 쏠 수 있으면 **움직일 이유가 없다.** 둘 다 제자리에서 두 발씩만
    //       쏘니 페인트를 밟을 일이 없고, 그래서 발자국 규칙(5·6)이 한 번도 안 돈다.
    //       제일 재미있게 설계한 규칙이 통째로 죽은 코드였다.
    //   (2) 100칸에서 보이지도 않고 움직이는 1칸짜리 표적을 한 판 60발로 다섯 번
    //       맞혀야 한다. 배틀십이 같은 10×10에서 성립하는 건 배가 **안 움직이고
    //       17칸을 차지**하기 때문이다. 여기엔 그 둘이 다 없다.
    //
    //  그래서 **총성**을 넣었다. 어둠 속에서 페인트건은 시끄럽다 — 쏘면 그 순간
    //  내 자리가 상대 화면에 뜬다. 이제 제자리 연사는 제 위치를 두 번 부르는 짓이고,
    //  「쏘고 나면 반드시 움직여야」 하고, 움직이니 페인트를 밟고, 그래서 발자국이
    //  남는다. 설계한 고리가 비로소 돈다. 실측 피해량 0.27 → 5.45 (10 만점).
    //
    //  지금 값으로 봇끼리 2,000판 (`node blackout/tests/balance.js 2000`):
    //      격추 92.3% · 무승부 4.3% · 선공 승률 51.6%(공정) · 피해 8.00/10 · 명중 9.3%
    //
    //  ⚠ 남은 한계도 적어 둔다(고쳐진 척하지 않는다). 규칙 3 —「이동은 서로 절대
    //    안 보인다」— 때문에 **회피가 공짜**다. 그래서 잘 두는 둘은 서로를 오래
    //    못 잡고, 판이 평균 93턴까지 간다(제한 140턴을 60으로 줄이면 그 대가가
    //    무승부 32% 로 나온다). 눈금으로 없앨 수 있는 문제가 아니다.
    //    구조적 해답은 이미 2단계 설계에 있다: **불 켜는 버튼.**
    //    서로 «가야 할 곳»이 생기면 도망만 다닐 수가 없다.
    //
    //  ⚠ 아래 세 값을 0 으로 두면 처음 규칙 그대로로 정확히 되돌아간다.
    //    다시 재려면: `RANGE=0 SENSE=0 NOISE=0 node blackout/tests/balance.js 2000`
    //
    //  사거리 — **실측 결과 도움이 안 됐다.** 2~6 을 다 돌려 봐도 격추율이 오히려
    //  떨어졌다(둘이 서로를 아예 못 만난다). 원래 규칙인 무제한이 낫다. 눈금만 남긴다.
    RANGE: 0,              // 0 = 무제한(원래 규칙). 양수면 그 맨해튼 거리까지.

    //  인기척 — 맨해튼 이 거리 안에 상대가 있으면 **양쪽 다** 낌새를 챈다.
    //  방향도 거리도 안 알려 준다. 새는 것은 참/거짓 한 비트뿐이다.
    SENSE: 2,

    //  총성 — 쏘면 그 자리가 상대 화면에 이만큼의 턴 동안 남는다. 0 이면 규칙이 꺼진다.
    NOISE_TURNS: 2,
    //  총성을 흐리는 폭. **0 이 제일 좋았다**(실측). ±1 로 흐리면 후보가 13칸으로
    //  늘어나 회피가 다시 공짜가 되고 무승부가 44% 로 뛴다. 정확히 드러내는 대신
    //  쏜 뒤에 한 칸 움직일 수 있으니, 상대는 결국 네댓 칸 중에 찍어야 한다.
    NOISE_BLUR: 0
  };

  // 방향: 0=위 1=오른쪽 2=아래 3=왼쪽. 이 순서는 **네트워크로 나가는 숫자**다 —
  // 바꾸면 구버전과 말이 안 통한다.
  var DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];

  // ── 씨앗 난수 ─────────────────────────────────────────────────────────────
  //  서버가 준 seed 하나로 양쪽이 같은 판을 만든다. Math.random 은 쓰지 않는다.
  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5;  s >>>= 0;
      return s / 4294967296;
    };
  }

  function inBoard(x, y) { return x >= 0 && y >= 0 && x < C.W && y < C.H; }
  function dist(x1, y1, x2, y2) { return Math.abs(x1 - x2) + Math.abs(y1 - y2); }

  //  지금 자리에서 쏠 수 있는 칸들. 화면의 조준 가능 범위 표시와 봇이 같이 쓴다.
  function shootable(x, y) {
    var out = [];
    for (var yy = 0; yy < C.H; yy++) for (var xx = 0; xx < C.W; xx++) {
      if (xx === x && yy === y) continue;
      if (C.RANGE > 0 && dist(x, y, xx, yy) > C.RANGE) continue;
      out.push({ x: xx, y: yy });
    }
    return out;
  }

  // ── 판 만들기 ─────────────────────────────────────────────────────────────
  function create(seed) {
    var r = rng(seed);
    var st = {
      seed: seed >>> 0,
      turn: 1,
      side: (seed >>> 0) & 1,   // 선공도 씨앗이 정한다(둘이 서로 다른 답을 내면 안 된다)
      ap: C.AP,
      moves: 0,          // 이번 턴에 실제로 움직인 칸 수
      wasPainted: false, // **턴 시작 시점**의 페인트 여부 — 발자국 판정의 기준
      stepFrom: null,    // 첫 걸음을 뗀 칸(발자국은 여기 남는다)
      gotPaint: false,   // 이번 턴에 페인트 칸을 새로 밟았나
      ps: [], paint: [], marks: [], noise: [],
      seen: [null, null],   // 정확한 위치가 드러난 마지막 순간(피격·충돌)
      ev: [],               // 방금 처리한 턴에 일어난 일(화면이 읽는다)
      over: false, winner: null, reason: null
    };
    // 0번은 위 3줄, 1번은 아래 3줄. 어느 칸인지는 서로 모르지만 **어느 구역인지는**
    // 둘 다 안다 — 첫 몇 턴이 완전한 무작위 찍기가 되지 않게 하는 최소한의 실마리다.
    st.ps.push(spawn(r, 0));
    st.ps.push(spawn(r, 1));
    st.wasPainted = false;
    return st;
  }

  function spawn(r, side) {
    var x = Math.floor(r() * C.W);
    var y = side === 0 ? Math.floor(r() * C.SPAWN_BAND)
                       : C.H - 1 - Math.floor(r() * C.SPAWN_BAND);
    return { x: x, y: y, hp: C.HP, painted: false };
  }

  // ── 조회 ──────────────────────────────────────────────────────────────────
  function paintAt(st, x, y) {
    for (var i = 0; i < st.paint.length; i++) {
      var p = st.paint[i];
      if (p.x === x && p.y === y && st.turn < p.until) return p;
    }
    return null;
  }

  //  이번 턴에 쓸 수 있는 이동 방향(격자 밖으로는 못 나간다).
  //  ⚠ 상대가 있는 칸은 **막지 않는다** — 막으면 "막혔다"는 사실 자체가 위치를
  //    알려주는 정보가 된다. 대신 부딪히면 둘 다 드러난다(아래 _move 의 충돌).
  function legalDirs(st, side) {
    var p = st.ps[side], out = [];
    for (var d = 0; d < 4; d++) if (inBoard(p.x + DX[d], p.y + DY[d])) out.push(d);
    return out;
  }

  // ── 행동 하나 ─────────────────────────────────────────────────────────────
  //  성공하면 null, 규칙 위반이면 사유 문자열을 돌려준다.
  //  ⚠ 위반을 조용히 무시하면 안 된다 — 한쪽만 무시하면 그 순간부터 두 판이
  //    갈라지고(desync), 한참 뒤에 엉뚱한 증상으로 나타난다. 크게 실패시킨다.
  function act(st, side, a) {
    if (st.over) return '이미 끝난 판';
    if (side !== st.side) return '자기 턴이 아님';
    if (st.ap <= 0) return '행동력 없음';
    var k = a[0];
    if (k === 'm') return _move(st, side, a[1] | 0);
    if (k === 's') return _shoot(st, side, a[1] | 0, a[2] | 0);
    return '알 수 없는 행동: ' + k;
  }

  function _move(st, side, d) {
    if (d < 0 || d > 3) return '방향 범위 밖';
    var me = st.ps[side], foe = st.ps[1 - side];
    var nx = me.x + DX[d], ny = me.y + DY[d];
    if (!inBoard(nx, ny)) return '벽 밖으로는 못 간다';
    st.ap--;

    //  ── 어둠 속 충돌 ──────────────────────────────────────────────────────
    //  상대가 선 칸으로 들어가면 부딪힌다. 데미지는 없지만 **둘 다 위치가 드러난다.**
    //  일부러 대칭으로 뒀다: 더듬어 찾아낸 쪽도 대가를 치른다.
    if (nx === foe.x && ny === foe.y) {
      st.seen[side] = { x: me.x, y: me.y, turn: st.turn };
      st.seen[1 - side] = { x: foe.x, y: foe.y, turn: st.turn };
      st.ev.push({ k: 'bump', x: foe.x, y: foe.y, mx: me.x, my: me.y, by: side });
      return null;   // 제자리. 행동력만 쓴다.
    }

    if (st.moves === 0) st.stepFrom = { x: me.x, y: me.y };
    me.x = nx; me.y = ny;
    st.moves++;

    //  페인트 칸을 밟았다 — 신발에 묻는다. 효과는 **다음 턴**부터다(규칙 6).
    if (paintAt(st, nx, ny)) {
      st.gotPaint = true;
      st.ev.push({ k: 'step', by: side });   // 밟은 본인만 아는 사건
    }
    return null;
  }

  function _shoot(st, side, x, y) {
    if (!inBoard(x, y)) return '격자 밖';
    var me = st.ps[side], foe = st.ps[1 - side];
    if (x === me.x && y === me.y) return '제 발밑은 쏘지 않는다';
    if (C.RANGE > 0 && dist(me.x, me.y, x, y) > C.RANGE) return '사거리 밖';
    st.ap--;

    var hit = (x === foe.x && y === foe.y);
    if (hit) {
      foe.hp--;
      foe.painted = true;                      // 맞은 사람 신발에 페인트가 묻는다
      st.seen[1 - side] = { x: x, y: y, turn: st.turn };
      if (foe.hp <= 0) { st.over = true; st.winner = side; st.reason = 'kill'; }
    }
    //  맞았든 빗나갔든 **바닥에는 페인트가 남는다**(규칙 6). 같은 칸을 다시 쏘면
    //  기한만 새로 고친다 — 얼룩이 겹겹이 쌓이면 해시가 무의미하게 길어진다.
    var old = paintAt(st, x, y);
    if (old) { old.until = st.turn + C.PAINT_TURNS; old.by = side; if (hit) old.hit = true; }
    else st.paint.push({ x: x, y: y, until: st.turn + C.PAINT_TURNS, by: side, hit: hit });

    //  ── 총성 ── 쏜 사람의 위치를 흐려서 남긴다. 둘 다 볼 수 있다.
    if (C.NOISE_TURNS > 0) {
      var nz = blur(st, me.x, me.y);
      st.noise.push({ x: nz.x, y: nz.y, until: st.turn + C.NOISE_TURNS, by: side });
    }

    st.ev.push({ k: hit ? 'hit' : 'miss', x: x, y: y, by: side });
    return null;
  }

  //  총성을 흐리는 자리. **씨앗과 판 상태만으로 정한다** — Math.random 을 쓰면
  //  양쪽 브라우저가 서로 다른 자리에 소리를 찍고 그 순간 판이 갈라진다.
  function blur(st, x, y) {
    var b = C.NOISE_BLUR;
    if (b <= 0) return { x: x, y: y };
    var h = (st.seed ^ (st.turn * 2654435761) ^ (x * 40503) ^ (y * 12289) ^ (st.ap * 97)) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    var span = b * 2 + 1;
    var dx = (h % span) - b;
    var dy = (Math.floor(h / span) % span) - b;
    return { x: Math.min(C.W - 1, Math.max(0, x + dx)),
             y: Math.min(C.H - 1, Math.max(0, y + dy)) };
  }

  // ── 턴 마감 ───────────────────────────────────────────────────────────────
  //  발자국 규칙(5·6)이 전부 여기 있다.
  //   · 턴 시작에 페인트가 묻어 있었고 **딱 한 칸** 움직였다 → 발을 뗀 칸에 발자국.
  //   · **두 칸** 움직였다 → 아무것도 안 남는다(두 걸음이면 페인트가 다 닳는다).
  //   · 한 칸도 안 움직였다 → 페인트는 그대로 신발에 남아 다음 턴으로 넘어간다.
  //
  //  ⚠ 발자국은 **발을 뗀 칸**에만 남기고 방향은 안 적는다. 도착 칸까지 알려주면
  //    맞은 쪽은 다음 턴에 두 발을 같은 칸에 쏟아맞고 사실상 반격이 불가능해진다
  //    ("맞으면 무조건 두 칸 도망" 외길). 뗀 칸만 보이면 후보가 최대 네 칸으로
  //    좁혀질 뿐이라, «한 칸 움직이고 한 발 쏘는» 도박이 살아 있는다.
  function endTurn(st) {
    var side = st.side, me = st.ps[side];

    if (st.wasPainted && st.moves === 1 && st.stepFrom) {
      st.marks.push({ x: st.stepFrom.x, y: st.stepFrom.y,
                      until: st.turn + C.MARK_TURNS, side: side });
      st.ev.push({ k: 'mark', x: st.stepFrom.x, y: st.stepFrom.y, by: side });
    }
    //  새로 밟은 페인트가 있으면 계속 묻은 상태. 아니면 움직이지 않았을 때만 유지.
    me.painted = st.gotPaint || (st.wasPainted && st.moves === 0);

    // 기한이 지난 얼룩·흔적을 버린다. 남겨 두면 해시만 길어지고 화면도 지저분하다.
    st.paint = st.paint.filter(function (p) { return st.turn + 1 < p.until; });
    st.marks = st.marks.filter(function (m) { return st.turn + 1 < m.until; });
    st.noise = st.noise.filter(function (n) { return st.turn + 1 < n.until; });

    if (!st.over && st.turn >= C.MAX_TURNS) {
      //  시간 초과: 체력이 많은 쪽. 같으면 무승부. 숨기만 해도 이기지는 못한다.
      var a = st.ps[0].hp, b = st.ps[1].hp;
      st.over = true; st.reason = 'timeup';
      st.winner = a === b ? -1 : (a > b ? 0 : 1);
    }
    if (st.over) return;

    st.turn++;
    st.side = 1 - side;
    st.ap = C.AP;
    st.moves = 0;
    st.stepFrom = null;
    st.gotPaint = false;
    st.wasPainted = st.ps[st.side].painted;   // 다음 사람의 턴 시작 시점 상태
  }

  // ── 턴 하나를 통째로 적용 ─────────────────────────────────────────────────
  //  네트워크로 받은 턴도, 내가 방금 확정한 턴도 **반드시 이 문을 지난다.**
  //  경로가 둘이면 언젠가 둘이 달라진다.
  function applyTurn(st, side, acts) {
    if (st.over) return { ok: false, err: '이미 끝난 판' };
    if (side !== st.side) return { ok: false, err: '턴 주인이 아님' };
    if (!acts || acts.length > C.AP) return { ok: false, err: '행동 수 초과' };
    st.ev = [];
    for (var i = 0; i < acts.length; i++) {
      //  ⚠ 첫 발이 상대를 쓰러뜨렸으면 남은 행동은 **조용히 버린다**(오류가 아니다).
      //    예전엔 여기서 '이미 끝난 판' 오류가 나면서 **턴 전체가 실패**로 돌아갔다.
      //    실전이었으면 그 턴이 상대에게 전송되지 않아 이긴 쪽 화면만 끝나고 진 쪽은
      //    영원히 기다렸을 것이다(봇 400판 중 110판에서 실제로 났다).
      if (st.over) break;
      var err = act(st, side, acts[i]);
      if (err) return { ok: false, err: err };   // 남은 행동은 처리하지 않는다
    }
    var ev = st.ev;
    endTurn(st);
    return { ok: true, ev: ev };
  }

  // ── 상태 해시 — 어긋남을 **조용히 넘어가지 않기 위한 장치** ────────────────
  //  에그워의 desync 는 늘 한참 뒤에야 이상한 증상으로 드러났다. 턴제는 턴마다
  //  값싸게 대조할 수 있으니 매 턴 맞춰 보고, 다르면 즉시 멈추고 알린다.
  function hash(st) {
    var s = st.turn + '|' + st.side + '|' + st.ap + '|' + st.moves + '|' +
            (st.wasPainted ? 1 : 0) + (st.gotPaint ? 1 : 0) + '|';
    for (var i = 0; i < 2; i++) {
      var p = st.ps[i];
      s += p.x + ',' + p.y + ',' + p.hp + ',' + (p.painted ? 1 : 0) + ';';
    }
    s += '|';
    for (var j = 0; j < st.paint.length; j++) {
      var q = st.paint[j];
      s += q.x + ',' + q.y + ',' + q.until + ',' + q.by + ',' + (q.hit ? 1 : 0) + ';';
    }
    s += '|';
    for (var k = 0; k < st.marks.length; k++) {
      var m = st.marks[k];
      s += m.x + ',' + m.y + ',' + m.until + ',' + m.side + ';';
    }
    s += '|';
    for (var w = 0; w < st.noise.length; w++) {
      var nn = st.noise[w];
      s += nn.x + ',' + nn.y + ',' + nn.until + ',' + nn.by + ';';
    }
    s += '|' + (st.over ? 1 : 0) + ',' + st.winner;
    // FNV-1a 32bit — 짧고 빠르고 구현이 한 눈에 들어온다(암호용이 아니다).
    var h = 0x811c9dc5;
    for (var n = 0; n < s.length; n++) {
      h ^= s.charCodeAt(n);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  }

  // ── 씨앗 + 턴 기록으로 판을 다시 만든다 ───────────────────────────────────
  //  재접속 복구의 전부다. 턴제라 기록이 작아서(턴당 행동 2개) 통째로 주고받아도
  //  싸다 — 에그워 록스텝이 «끊긴 동안의 입력 패킷»을 메우려고 고생했던 자리를
  //  구조로 없앤 것이다.
  function replay(seed, log) {
    var st = create(seed);
    for (var i = 0; i < log.length; i++) {
      var r = applyTurn(st, st.side, log[i]);
      if (!r.ok) return { ok: false, err: '기록 ' + (i + 1) + '번째 턴: ' + r.err, st: st };
    }
    return { ok: true, st: st };
  }

  // ── 화면이 보는 것 ────────────────────────────────────────────────────────
  //  UI 는 `st` 를 직접 읽지 않고 이 함수만 본다. 그래야 «실수로 상대 좌표를
  //  그려 버리는» 사고가 구조적으로 안 난다.
  function view(st, me) {
    var foe = 1 - me;
    return {
      turn: st.turn, side: st.side, ap: st.ap, mine: me,
      myTurn: st.side === me && !st.over,
      me: { x: st.ps[me].x, y: st.ps[me].y, hp: st.ps[me].hp, painted: st.ps[me].painted },
      foeHp: st.ps[foe].hp,
      //  ⚠ 상대가 페인트를 묻혔는지는 **넣지 않는다.** 내가 맞혔다면 어차피 내 눈으로
      //    봤고, 상대가 스스로 페인트 칸을 밟은 것은 어둠 속에서 알 길이 없다.
      //    여기에 한 줄 넣어 두면 화면이 무심코 그려서 게임이 통째로 싱거워진다.
      foeSeen: st.seen[foe],
      meSeen: st.seen[me],
      paint: st.paint.map(function (p) {
        return { x: p.x, y: p.y, left: p.until - st.turn, by: p.by, hit: !!p.hit };
      }),
      marks: st.marks.map(function (m) {
        return { x: m.x, y: m.y, left: m.until - st.turn, side: m.side };
      }),
      //  총성은 양쪽 다 본다. 내 총성도 보여 준다 — 「내가 지금 얼마나 새고 있는지」를
      //  눈으로 봐야 쏘고 움직이는 리듬이 손에 붙는다.
      noise: st.noise.map(function (n) {
        return { x: n.x, y: n.y, left: n.until - st.turn, mine: n.by === me };
      }),
      moves: st.moves, stepFrom: st.stepFrom,
      range: C.RANGE, senseR: C.SENSE,
      //  ⚠ 새어 나가는 정보는 **참/거짓 한 비트뿐**이다. 방향도 거리도 안 준다.
      //    움직여 보고 켜졌다 꺼졌다를 읽어 좁혀 가는 것이 이 게임의 추적이다.
      sense: C.SENSE > 0 && dist(st.ps[me].x, st.ps[me].y, st.ps[foe].x, st.ps[foe].y) <= C.SENSE,
      over: st.over, winner: st.winner, reason: st.reason,
      maxTurns: C.MAX_TURNS
    };
  }

  return {
    C: C, DX: DX, DY: DY,
    rng: rng, create: create, act: act, endTurn: endTurn, applyTurn: applyTurn,
    hash: hash, replay: replay, view: view,
    paintAt: paintAt, legalDirs: legalDirs, inBoard: inBoard,
    dist: dist, shootable: shootable
  };
})();
