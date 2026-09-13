window.BO = window.BO || {};

// ============================================================================
//  블랙아웃 — **연습 상대**.
//
//  왜 있나: 실사용자가 몇 명뿐이라 **빈 방이 기본 상태**다(에그워에서 배운 것).
//  상대가 올 때까지 아무것도 못 하는 게임은 아무도 두 번 열지 않는다.
//
//  ⚠⚠ 이 봇은 **속이지 않는다.** 들어오자마자 `Core.view(st, 나)` 로 바꾸고 그 뒤로는
//    `st` 를 한 번도 안 본다. 상대 좌표를 그냥 읽어 버리면 «어둠 속에서 찾아내는»
//    이 게임의 재미를 연습에서는 확인할 수가 없다 — 봇이 백발백중이 되니까.
//    사람이 쓰는 단서(페인트 얼룩·발자국·목격·시작 구역)만으로 추리한다.
//
//  ⚠ Math.random 을 쓴다. 봇은 **연습 모드에서만** 돌고 그때는 맞출 상대가 없다.
//    실시간 대전 경로(match.js 의 vsBot=false)는 여기를 절대 부르지 않는다.
// ============================================================================
BO.Bot = (function () {
  var C = BO.Core;

  //  **한 번에 한 수만** 돌려준다(없으면 null = 턴 넘김).
  //  ⚠ 처음엔 턴 전체(두 수)를 한 번에 계획했는데 실측에서 불법 수가 나왔다:
  //    첫 수가 **충돌**이면 제자리에 남는데(규칙) 계획은 이미 옮겨 간 걸로 쳐서,
  //    둘째 수가 벽 밖으로 나갔다. 한 수씩 두면 이 버그 종류가 통째로 없어진다 —
  //    그리고 사람과 같아진다: 부딪혀 보고 나서 다음 수를 정하는 것.
  function think(st, side) {
    var v = C.view(st, side);        // ← 여기서부터 st 는 없는 셈 친다
    return decide(v);
  }

  // ── 믿음 격자 ─────────────────────────────────────────────────────────────
  //  «상대는 지금 어디 있을까»를 공개 단서만으로 0~1 점수판으로 만든다.
  //  턴마다 처음부터 다시 만든다(상태를 들고 다니지 않는다 — 재접속·재시작에
  //  영향을 안 받는 쪽이 훨씬 안전하다).
  function belief(v) {
    var W = C.C.W, H = C.C.H, g = [], x, y;
    for (y = 0; y < H; y++) { g.push([]); for (x = 0; x < W; x++) g[y].push(0.01); }

    //  상대가 한 턴에 갈 수 있는 최대 거리는 2칸. 지난 age 턴(양쪽 턴 합)이면
    //  상대 턴은 그 절반이니 최대 이동거리 ≈ age 칸(맨해튼).
    function cone(cx, cy, age, weight) {
      var r = Math.max(1, age);
      for (var yy = 0; yy < H; yy++) for (var xx = 0; xx < W; xx++) {
        var d = Math.abs(xx - cx) + Math.abs(yy - cy);
        if (d <= r) g[yy][xx] += weight / (1 + d);
      }
    }

    //  「반경 r 안 어딘가」 — 중심이 특별히 유력하지는 않은 단서(사격 흔적이 그렇다).
    //  원뿔(cone)과 달리 가장자리도 중심만큼 쳐 준다.
    function ring(cx, cy, r, weight) {
      for (var yy = 0; yy < H; yy++) for (var xx = 0; xx < W; xx++) {
        if (Math.abs(xx - cx) + Math.abs(yy - cy) <= r) g[yy][xx] += weight / (1 + r);
      }
    }

    var evidence = false;

    //  ① 정확히 드러난 순간(맞혔거나 부딪혔다) — 가장 센 단서.
    if (v.foeSeen) { cone(v.foeSeen.x, v.foeSeen.y, v.turn - v.foeSeen.turn, 6); evidence = true; }

    //  ② 상대가 남긴 발자국 — 그 칸에서 발을 뗐다. 방향은 모르니 원뿔로 퍼뜨린다.
    for (var i = 0; i < v.marks.length; i++) {
      var mk = v.marks[i];
      if (mk.side === v.mine) continue;              // 내 발자국은 단서가 아니다
      cone(mk.x, mk.y, C.C.MARK_TURNS - mk.left, 5);
      evidence = true;
    }

    //  ③ 아직 아무 단서도 없으면 **시작 구역**이 유일한 실마리다(공개 규칙).
    if (!evidence) {
      var band = v.mine === 0 ? [H - C.C.SPAWN_BAND, H - 1] : [0, C.C.SPAWN_BAND - 1];
      var spread = Math.max(0, v.turn - 1);
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
        var dy = y < band[0] ? band[0] - y : (y > band[1] ? y - band[1] : 0);
        if (dy <= spread) g[y][x] += 1.2 / (1 + dy);
      }
    }

    //  ④ **상대가 칠한 얼룩** — 이 게임에서 제일 꾸준한 단서다.
    //     사거리가 있으니 「그 칸을 쐈다」는 곧 「그때 그 칸에서 사거리 안에 있었다」다.
    //     얼룩은 양쪽 화면에 다 보이므로 사람도 똑같이 쓸 수 있는 정보다.
    //     (사거리를 무제한으로 두면 이 단서가 통째로 사라진다 — 그래서 아무도 서로를
    //      못 찾았다. 사거리를 넣은 진짜 이유가 이것이다.)
    for (var j = 0; j < v.paint.length; j++) {
      var p = v.paint[j];
      if (p.by === v.mine) continue;
      var age2 = C.C.PAINT_TURNS - p.left;
      ring(p.x, p.y, v.range + age2, 3.5);
      evidence = true;
    }

    //  ⑤ **상대의 총성** — 가장 최근이고 가장 정확한 위치 단서다.
    //     흐려져 있으니 「그 근처 어딘가」로 읽는다(흐린 폭 + 지난 턴만큼 더 퍼진다).
    for (var t = 0; t < v.noise.length; t++) {
      var nz = v.noise[t];
      if (nz.mine) continue;                       // 내 총성은 나에 대한 단서다
      var ageN = C.C.NOISE_TURNS - nz.left;
      ring(nz.x, nz.y, C.C.NOISE_BLUR + ageN, 9);
      evidence = true;
    }

    //  ⑥ 내가 쏴서 빗나간 칸 — 그때 상대는 거기 없었다. 최근일수록 강한 부정 단서.
    //  ⚠ 나이에 따라 벌점을 풀어 주면 두 턴 만에 같은 칸으로 돌아온다(실측:
    //    60턴 내내 같은 두 칸만 쐈다). 얼룩이 살아 있는 동안은 계속 배제한다 —
    //    그래야 새 땅을 쓸어 나간다.
    for (var k = 0; k < v.paint.length; k++) {
      var q = v.paint[k];
      if (q.by !== v.mine || q.hit) continue;
      g[q.y][q.x] *= 0.12;
    }

    //  ⑦ **인기척** — 켜지면 반경 안 어딘가, 꺼지면 반경 안에는 확실히 없다. 켜졌으면 내 주변 반경 안 어딘가,
    //     꺼졌으면 그 반경 안에는 «확실히 없다»(부정 단서도 그만큼 세다).
    if (v.senseR > 0) {
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
        var dm = C.dist(x, y, v.me.x, v.me.y);
        if (v.sense) g[y][x] = dm <= v.senseR ? g[y][x] + 8 : g[y][x] * 0.05;
        else if (dm <= v.senseR) g[y][x] = 0;
      }
    }

    //  ⑧ 내가 선 칸에는 상대가 있을 수 없다(있었으면 부딪혔다).
    g[v.me.y][v.me.x] = 0;
    return g;
  }

  function ranked(g) {
    var out = [];
    for (var y = 0; y < C.C.H; y++) for (var x = 0; x < C.C.W; x++) out.push({ x: x, y: y, s: g[y][x] });
    out.sort(function (a, b) { return b.s - a.s; });
    return out;
  }

  //  ── 판단 ────────────────────────────────────────────────────────────────
  //  ⚠ 처음에는 「사정권 안에서 제일 점수 높은 칸을 쏜다」로 짰다가 실측에서 크게
  //    틀렸다: 봇 둘이 9칸 떨어진 채 **60턴 내내 제자리에서 같은 두 칸만 쐈다.**
  //    사정권 끄트머리 칸의 점수가 «허공»인데도 문턱(0.12)은 넘었기 때문이다.
  //  → 기준을 절대값에서 **상대값**으로 바꿨다. 「사정권 안 최선」이 「판 전체 최선」에
  //    한참 못 미치면 쏘지 말고 **다가간다.** 이 한 줄이 사냥을 만든다.
  var SHOOT_RATIO = 0.55;

  function decide(v) {
    if (v.ap <= 0) return null;
    var g = belief(v), gb = globalBest(g);
    var first = (v.ap === C.C.AP);
    var shotsDone = (C.C.AP - v.ap) - v.moves;

    //  내가 방금 들켰나 — 상대가 **내 정확한 위치**를 안다면 그 자리는 죽음이다.
    var exposed = v.meSeen && (v.turn - v.meSeen.turn) <= 2;

    //  ① 페인트가 묻은 채 한 칸 움직였다 → **반드시 한 칸 더.** 여기서 쏘면
    //     발자국이 남아 다음 턴에 그 자리로 두 발이 날아온다(규칙 5).
    if (v.me.painted && v.moves === 1) return mv(pickMove(v, null, true));

    //  ② 페인트가 묻은 채 들켰다 → 두 칸 도망을 시작한다. 쏘는 것보다 사는 게 먼저다.
    if (v.me.painted && exposed && first) return mv(pickMove(v, null, true));

    var shot = bestShot(g, v.me);
    //  사정권 안 최선이 판 전체 최선에 한참 못 미치면 «허공에 쏘는 것»이다.
    var worth = v.sense || (shot && gb && shot.s >= gb.s * SHOOT_RATIO);

    //  ③ 첫 수는 **무조건 사격이 먼저**다.
    //     ⚠ 순서가 승패를 가른다. 총성은 **쏜 그 순간의 자리**를 가리킨다. 쏘고 나서
    //       옮기면 상대가 받아 든 좌표는 이미 헛자리다. 반대로 움직이고 쏘면 새 자리를
    //       그대로 불러 주는 꼴이 된다. (처음에 거꾸로 짰다가 실측에서 격추율이
    //       99%→55% 로 주저앉았다.)
    if (first) return worth ? ['s', shot.x, shot.y] : mv(pickMove(v, gb, false));

    //  ④ 둘째 수 — 이미 쐈으면 그 자리를 뜬다.
    //     단 **페인트가 묻었으면 움직이지 않는다**: 한 칸만 움직이면 발자국이 남는데
    //     남은 행동력으로는 두 칸을 못 채운다(규칙 5). 그럴 땐 버티고 한 발 더 쏜다.
    if (shotsDone >= 1 && !v.me.painted) {
      var d = pickMove(v, null, true);
      if (d != null) return ['m', d];
    }
    if (worth) return ['s', shot.x, shot.y];
    return mv(pickMove(v, gb, false));
  }

  function mv(d) { return d != null ? ['m', d] : null; }

  function globalBest(g) {
    var best = null;
    for (var y = 0; y < C.C.H; y++) for (var x = 0; x < C.C.W; x++)
      if (!best || g[y][x] > best.s) best = { x: x, y: y, s: g[y][x] };
    return best;
  }

  //  사정권 안에서 점수가 가장 높은 칸(이번 턴에 이미 쏜 칸은 뺀다).
  function bestShot(g, me) {
    var cells = C.shootable(me.x, me.y), best = null;
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      if (!best || g[c.y][c.x] > best.s) best = { x: c.x, y: c.y, s: g[c.y][c.x] };
    }
    return best;
  }

  //  어디로 갈까 — 공개 정보만 본다.
  //   · 페인트 칸은 피한다(밟으면 다음 턴에 발자국을 남기게 된다)
  //   · `toward` 쪽으로 좁혀 간다 / `flee` 면 최근에 들킨 자리에서 멀어진다
  function pickMove(v, toward, flee) {
    var me = v.me, best = null, bestScore = -1e9;
    var paintAt = {};
    for (var i = 0; i < v.paint.length; i++) paintAt[v.paint[i].x + ',' + v.paint[i].y] = 1;

    for (var d = 0; d < 4; d++) {
      var nx = me.x + C.DX[d], ny = me.y + C.DY[d];
      if (!C.inBoard(nx, ny)) continue;
      var s = Math.random() * 0.9;                       // 예측 불가능해야 한다
      if (paintAt[nx + ',' + ny]) s -= 2.5;              // 밟으면 흔적이 생긴다
      if (toward) {
        var was = C.dist(me.x, me.y, toward.x, toward.y);
        var nowd = C.dist(nx, ny, toward.x, toward.y);
        s += (was - nowd) * 2.0;
      }
      //  도망은 «상대가 안다고 믿는 내 자리»에서 멀어지는 것이다. 그 자리는 둘이다:
      //  내가 드러난 마지막 지점과, 내 총성이 찍힌 지점.
      if (flee) {
        var away = [];
        if (v.meSeen) away.push(v.meSeen);
        for (var q = 0; q < v.noise.length; q++) if (v.noise[q].mine) away.push(v.noise[q]);
        for (var w = 0; w < away.length; w++) {
          s += (C.dist(nx, ny, away[w].x, away[w].y) - C.dist(me.x, me.y, away[w].x, away[w].y)) * 2.0;
        }
      }
      var edge = Math.min(nx, ny, C.C.W - 1 - nx, C.C.H - 1 - ny);
      if (edge === 0) s -= 0.4;
      if (s > bestScore) { bestScore = s; best = d; }
    }
    return best;
  }

  return { think: think, belief: belief };
})();
