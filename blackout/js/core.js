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
//    양쪽 클라이언트가 전체 상태(=상대 좌표·가구 배치)를 들고 있으므로 개발자도구를
//    열면 다 보인다. 숨김 정보 게임에서 이걸 진짜로 막으려면 방 서버(Worker)가
//    심판이 되어야 하는데, 그 서버 소스는 이 저장소에 없다.
//    → v1 은 «아는 사람끼리 하는 판»을 전제로 결정론 + 해시 대조를 택했다.
//
//  ── v0.5 «야광 페인트» ──────────────────────────────────────────────────
//  설계자의 여섯 가지(2026-09-13):
//   1. 맞았는지/맞혔는지 확실히 (→ 화면 ui.js 의 타격 연출, 여기서는 사건만 낸다)
//   2. 8×8 로 줄이고 확대
//   3. 가구는 미리 보여주지 않는다. **움직인 방향으로 시야각**이 생기고 그 안의
//      가구·상대만 보인다
//   4. 페인트는 **야광**이다. 어둠 속 다른 건 안 보이고, 맞은 사람은 **윤곽**이 보인다
//   5. 까맣던 방이 페인트로 조금씩 드러난다 — 검은 크레파스를 긁어내는 스크래치 기법
//   6. 그러니 페인트는 **판이 끝날 때까지** 남는다
//  → 상태에 «아는 칸(known)»과 «바라보는 방향(face)»이 들어갔고, 페인트·발자국에서
//    기한이 사라졌다. 화면은 view() 의 tiles(아는 칸만 채워짐)·seen(지금 시야)·
//    foe(보이는 이유 why 포함)만 본다.
// ============================================================================
BO.Core = (function () {

  // ── 규칙 상수 — 밸런스는 전부 여기서만 만진다 ──────────────────────────────
  var C = {
    W: 8, H: 8,            // v0.5: 10×10 → 8×8. «너무 커서 못 찾는다»(실서버 2판째)
    HP: 5,                 // 5번 맞으면 죽는다
    AP: 2,                 // 한 턴에 두 번 행동(이동/사격 조합 자유)
    //  ⚠ v0.5: 페인트도 발자국도 **판이 끝날 때까지** 남는다(설계자 확정, 6번).
    //    예전 PAINT_TURNS=5 / MARK_TURNS=3 은 없어졌다. 얼룩이 쌓일수록 방이 밝아지고
    //    (밟으면 묻는다 → 윤곽이 보인다) 판이 저절로 수렴한다 — 긁어낼수록 그림이
    //    드러나는 스크래치 아트가 곧 이 게임의 종반이다.
    MAX_TURNS: 140,        // 제한 턴(20초 상한 × 140 이어도 사람은 10분 안팎)
    SPAWN_BAND: 2,         // 시작 구역: 0번은 위 2줄, 1번은 아래 2줄(서로 아는 공개 규칙)

    //  ── 시야 ───────────────────────────────────────────────────────────────
    //  바라보는 방향(마지막으로 움직인 방향)으로 손전등 줄기처럼 **바로 앞 두 칸**만
    //  보인다(CONE 의 길이가 거리, 값이 각 거리에서의 좌우 폭). 가구 뒤는 안 보인다(LOS).
    //  자기 칸은 늘 안다. 옆·뒤는 안 보인다 — 그래서 옆으로 갈 땐 **부딪힐 수 있다**
    //  (bump: 행동력 1, 그쪽을 보게 되고 그 칸이 뭔지 알게 된다). 더듬더듬 걷는 어둠의 값.
    //  ⚠ 처음엔 [1,1,2](부채꼴 11칸)였는데 설계자가 「시야가 너무 넓어 암흑 속에서 싸우는
    //    것 같지 않다」고 했다. 좁혀도 판은 난다(봇 800판): [0,0] 격추 89% · 평균 30턴 ·
    //    명중 27% / [0] 88% · 34턴 / [0,1] 92% · 25턴. 어둠이 먼저다 — 두 칸 줄기.
    CONE: [0, 0],
    LOS: 1,                // 1 이면 가구가 시선을 막는다. 0 이면 부채꼴 전부 보인다.

    //  ── 전등 버튼 ──────────────────────────────────────────────────────────
    //  가운데 띠 어딘가에 버튼이 하나. 매 판 자리가 바뀐다. 밟으면 **불이 켜지고**
    //  방 전체(가구·상대)가 드러난다. **행동 하나**가 지나면 도로 꺼진다 —
    //  다만 그때 본 가구는 기억에 남는다(known). 불은 켠 사람도 비춘다.
    LAMP_ACTIONS: 1,

    //  사거리 — 무제한(원래 규칙). 야광 페인트를 «긁어내는» 도구이기도 하니까.
    RANGE: 0,
    //  인기척 — 맨해튼 이 거리 안에 상대가 있으면 **양쪽 다** 낌새를 챈다. 한 비트뿐.
    SENSE: 1
  };

  // 방향: 0=위 1=오른쪽 2=아래 3=왼쪽. 이 순서는 **네트워크로 나가는 숫자**다 —
  // 바꾸면 구버전과 말이 안 통한다.
  var DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];

  // ── 씨앗 난수 ─────────────────────────────────────────────────────────────
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
  function idx(x, y) { return y * C.W + x; }
  function dist(x1, y1, x2, y2) { return Math.abs(x1 - x2) + Math.abs(y1 - y2); }

  //  지금 자리에서 쏠 수 있는 칸들 — 제 발밑만 빼고 전부(사거리 무제한).
  function shootable(x, y) {
    var out = [];
    for (var yy = 0; yy < C.H; yy++) for (var xx = 0; xx < C.W; xx++) {
      if (xx === x && yy === y) continue;
      if (C.RANGE > 0 && dist(x, y, xx, yy) > C.RANGE) continue;
      out.push({ x: xx, y: yy });
    }
    return out;
  }

  // ── 시야 ──────────────────────────────────────────────────────────────────
  //  (x0,y0)→(x1,y1) 사이에 시선을 막는 가구가 없나. 브레젠험 — 정수만 쓴다(결정론).
  function los(room, x0, y0, x1, y1) {
    var dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx - dy, x = x0, y = y0;
    for (var guard = 0; guard < 64; guard++) {
      if (x === x1 && y === y1) return true;
      if (!(x === x0 && y === y0) && !BO.Rooms.walkable(room, x, y)) return false;
      var e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
    return true;
  }

  //  side 가 지금 보는 칸들(자기 칸 포함). 위치와 face 만으로 정해진다.
  function cone(st, side) {
    var p = st.ps[side], out = [{ x: p.x, y: p.y }];
    var fx = DX[p.face], fy = DY[p.face], rx = -fy, ry = fx;
    for (var d = 1; d <= C.CONE.length; d++) {
      var hw = C.CONE[d - 1];
      for (var o = -hw; o <= hw; o++) {
        var x = p.x + fx * d + rx * o, y = p.y + fy * d + ry * o;
        if (!inBoard(x, y)) continue;
        if (C.LOS && !los(st.room, p.x, p.y, x, y)) continue;
        out.push({ x: x, y: y });
      }
    }
    return out;
  }
  function inCone(st, side, x, y) {
    var cs = cone(st, side);
    for (var i = 0; i < cs.length; i++) if (cs[i].x === x && cs[i].y === y) return true;
    return false;
  }
  function look(st, side) {
    var cs = cone(st, side), k = st.ps[side].known;
    for (var i = 0; i < cs.length; i++) k[idx(cs[i].x, cs[i].y)] = 1;
  }
  function revealAll(st) {
    for (var s = 0; s < 2; s++) for (var i = 0; i < C.W * C.H; i++) st.ps[s].known[i] = 1;
  }
  //  행동 뒤마다: 상대가 내 시야에 들어왔으면 «내가 본 상대 자리»를 적어 둔다.
  //  ⚠ 본 쪽만 안다. 보인 쪽은 모른다(spot 은 view 에서 본 쪽에게만 나간다).
  //  ⚠ 같은 칸에 겹친 상대는 «본 것»으로 치지 않는다 — 캐릭터끼리는 막지 않고,
  //    접촉으로 위치가 드러나지 않는다는 규칙(v0.2)을 지킨다. 어차피 제 발밑은 못 쏜다.
  function sees(st, side, x, y) {
    var p = st.ps[side];
    if (p.x === x && p.y === y) return false;
    return inCone(st, side, x, y);
  }
  function noteSpots(st) {
    for (var s = 0; s < 2; s++) {
      var f = st.ps[1 - s];
      if (sees(st, s, f.x, f.y)) st.spot[1 - s] = { x: f.x, y: f.y, turn: st.turn, by: s };
    }
  }

  // ── 판 만들기 ─────────────────────────────────────────────────────────────
  function create(seed) {
    var r = rng(seed);
    var st = {
      seed: seed >>> 0,
      room: BO.Rooms.create(seed),
      turn: 1,
      side: (seed >>> 0) & 1,   // 선공도 씨앗이 정한다(둘이 서로 다른 답을 내면 안 된다)
      ap: C.AP,
      moves: 0,          // 이번 턴에 실제로 움직인 칸 수(화면·봇이 읽는다)
      //  ⚠ v1.0: 발자국은 **턴 마감이 아니라 걸음마다** 찍힌다. 그래서 «턴 시작 시점의
      //    페인트»(wasPainted)·«첫 걸음 칸»(stepFrom)·«이번 턴에 밟았나»(gotPaint) 같은
      //    턴 단위 장부가 통째로 필요 없어졌다. 젖은 신발은 `ps[i].painted` 하나뿐이다.
      ps: [], paint: [], marks: [],
      lamp: null,        // 전등 버튼 자리(판마다 다르다)
      lit: 0,            // 불이 켜진 채로 남은 «행동» 수
      seen: [null, null],   // 공개 노출(맞음·전등) — 둘 다 안다
      spot: [null, null],   // 시야로 목격됨 — **본 쪽만** 안다
      glow: null,           // {side, turn} 방금 맞아 야광에 젖은 사람 — 그 턴 동안만 보인다
      ev: [],               // 방금 처리한 턴에 일어난 일(화면이 읽는다)
      over: false, winner: null, reason: null
    };
    // 0번은 위 2줄, 1번은 아래 2줄. 어느 칸인지는 서로 모르지만 **어느 구역인지는**
    // 둘 다 안다. 처음엔 서로를 향해 본다(0번은 아래, 1번은 위).
    st.ps.push(spawn(r, 0, st.room, 2));
    st.ps.push(spawn(r, 1, st.room, 0));
    st.lamp = spawnLamp(r, st);
    look(st, 0); look(st, 1);
    return st;
  }

  //  전등 버튼 — 시작 구역을 뺀 가운데 띠에서만 뽑는다. 한쪽 코앞에 놓이면 판이 기운다.
  function spawnLamp(r, st) {
    if (C.LAMP_ACTIONS <= 0) return null;
    var choices = [];
    for (var y = C.SPAWN_BAND; y < C.H - C.SPAWN_BAND; y++) {
      for (var x = 0; x < C.W; x++) {
        if (BO.Rooms.walkable(st.room, x, y)) choices.push({ x: x, y: y });
      }
    }
    return choices.length ? choices[Math.floor(r() * choices.length)] : null;
  }

  function spawn(r, side, room, face) {
    var cells = [];
    for (var y = 0; y < C.H; y++) for (var x = 0; x < C.W; x++) {
      if ((side === 0 ? y < C.SPAWN_BAND : y >= C.H - C.SPAWN_BAND) &&
          BO.Rooms.walkable(room, x, y)) cells.push({ x: x, y: y });
    }
    if (!cells.length) throw new Error('Room has no spawn cells');
    var p = cells[Math.floor(r() * cells.length)];
    var known = [];
    for (var i = 0; i < C.W * C.H; i++) known.push(0);
    return { x: p.x, y: p.y, hp: C.HP, painted: false, face: face, known: known };
  }

  // ── 조회 ──────────────────────────────────────────────────────────────────
  function paintAt(st, x, y) {
    for (var i = 0; i < st.paint.length; i++) {
      var p = st.paint[i];
      if (p.x === x && p.y === y) return p;
    }
    return null;
  }
  function knows(st, side, x, y) { return st.ps[side].known[idx(x, y)] === 1; }

  //  갈 수 있다고 **아는** 방향. 격자 밖은 늘 안다. 모르는 칸은 일단 갈 수 있는 걸로
  //  친다 — 가구면 부딪힌다(그게 어둠이다).
  function legalDirs(st, side) {
    var p = st.ps[side], out = [];
    for (var d = 0; d < 4; d++) {
      var nx = p.x + DX[d], ny = p.y + DY[d];
      if (!inBoard(nx, ny)) continue;
      if (knows(st, side, nx, ny) && !BO.Rooms.walkable(st.room, nx, ny)) continue;
      out.push(d);
    }
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
    var k = a[0], err;
    if (k === 'm') err = _move(st, side, a[1] | 0);
    else if (k === 's') err = _shoot(st, side, a[1] | 0, a[2] | 0);
    else return '알 수 없는 행동: ' + k;
    if (err) return err;

    //  ── 불은 «행동 하나»만 간다 ────────────────────────────────────────────
    //  버튼을 밟은 행동은 `lit` 을 LAMP_ACTIONS+1 로 올려 둔다. 여기서 한 칸 깎여도
    //  딱 LAMP_ACTIONS 만큼 남는다 — 켠 사람이 그 불로 한 번은 행동할 수 있다.
    if (st.lit > 0) st.lit--;

    //  행동한 사람은 새 자리·새 방향에서 다시 본다. 그리고 둘 다: 시야에 상대가 있나.
    look(st, side);
    noteSpots(st);
    return null;
  }

  function _move(st, side, d) {
    if (d < 0 || d > 3) return '방향 범위 밖';
    var me = st.ps[side], foe = st.ps[1 - side];
    var nx = me.x + DX[d], ny = me.y + DY[d];
    if (!inBoard(nx, ny)) return '격자 밖으로는 갈 수 없습니다';
    if (!BO.Rooms.walkable(st.room, nx, ny)) {
      //  아는 가구로 걸어가는 건 규칙 위반(화면이 막는다). 모르는 가구는 **부딪힌다**:
      //  행동력 하나를 쓰고, 그쪽을 보게 되고, 그 칸이 뭔지 알게 된다. 자리는 그대로.
      if (knows(st, side, nx, ny)) return '가구가 있는 칸은 걸어갈 수 없습니다';
      st.ap--;
      me.face = d;
      me.known[idx(nx, ny)] = 1;
      var o = BO.Rooms.objectAt(st.room, nx, ny);
      st.ev.push({ k: 'bump', x: nx, y: ny, by: side, object: o ? o.id : null, kind: o ? o.kind : null });
      return null;
    }
    st.ap--;
    me.face = d;

    //  ── 발자국 — 걸음마다, 방향까지 ────────────────────────────────────────
    //  신발이 젖어 있으면 **발을 떼는 그 칸**에 발자국이 찍히고, 어느 쪽으로 갔는지(dir)가
    //  같이 남는다. 그리고 신발은 마른다 — 한 걸음이 야광을 다 쓴다.
    //  · 맞고 한 칸 → 발자국 하나. 그 화살표 끝이 지금 서 있는 칸이다(치명적이다).
    //  · 맞고 두 칸 → 첫 걸음만 찍힌다. 화살표가 가리키는 칸에서 **한 번 더** 갔으니
    //    끝 자리는 갈린다. 예전 「두 칸이면 아예 안 남는다」를 대신하는 도망이다.
    //  · 안 움직이면 젖은 채로 다음 턴 — 첫 걸음에 찍힌다.
    if (me.painted) {
      addMark(st, me.x, me.y, d, side);
      me.painted = false;
    }
    // 캐릭터끼리는 막지 않는다. 막히면 그 자체가 상대 위치 단서가 된다.
    me.x = nx; me.y = ny;
    st.moves++;

    //  페인트 칸을 밟았다 — 신발이 다시 젖는다. **이번 턴 다음 걸음부터** 바로 찍힌다
    //  (규칙 6. 예전엔 «다음 턴부터»라 얼룩 위를 지나가도 흔적이 없었다).
    if (paintAt(st, nx, ny)) {
      me.painted = true;
      st.ev.push({ k: 'step', by: side });   // 밟은 본인만 아는 사건
    }

    //  ── 전등 버튼을 밟았다 ────────────────────────────────────────────────
    //  불이 켜지고 방 전체가 드러난다 — 가구도, **둘 다**. 켠 사람도 예외가 아니다.
    if (st.lamp && nx === st.lamp.x && ny === st.lamp.y && C.LAMP_ACTIONS > 0) {
      st.lit = C.LAMP_ACTIONS + 1;           // act() 끝에서 한 칸 깎인다
      st.seen[side] = { x: nx, y: ny, turn: st.turn };
      st.seen[1 - side] = { x: foe.x, y: foe.y, turn: st.turn };
      revealAll(st);
      st.ev.push({ k: 'lamp', x: nx, y: ny, by: side, fx: foe.x, fy: foe.y });
    }
    return null;
  }

  function _shoot(st, side, x, y) {
    if (!inBoard(x, y)) return '격자 밖은 겨냥할 수 없습니다';
    var me = st.ps[side], foe = st.ps[1 - side];
    if (x === me.x && y === me.y) return '제 발밑은 쏘지 않는다';
    if (C.RANGE > 0 && dist(me.x, me.y, x, y) > C.RANGE) return '사거리 밖';
    st.ap--;

    var hit = (x === foe.x && y === foe.y);
    if (hit) {
      foe.hp--;
      foe.painted = true;                      // 맞은 사람 신발에 야광 페인트 — 발자국 규칙
      //  맞은 순간 야광이 튀어 **이 턴 동안** 상대가 보인다(남은 한 발을 쏠 수 있다).
      //  턴이 넘어가면 다시 어둠 — 「다음 턴에서는 당연히 캐릭터까지는 안 보여야 해」(설계자).
      st.glow = { side: 1 - side, turn: st.turn };
      st.seen[1 - side] = { x: x, y: y, turn: st.turn };
      if (foe.hp <= 0) { st.over = true; st.winner = side; st.reason = 'kill'; }
    }
    //  맞았든 빗나갔든 **그 칸에 페인트가 남는다 — 판이 끝날 때까지.** 같은 칸을 다시
    //  쏘면 덧칠(기록만 새로 고친다). 얼룩은 야광이라 둘 다 보고, 그 칸이 뭔지도 드러난다.
    var old = paintAt(st, x, y);
    if (old) { old.turn = st.turn; old.by = side; if (hit) old.hit = true; }
    else st.paint.push({ x: x, y: y, turn: st.turn, by: side, hit: hit });
    st.ps[0].known[idx(x, y)] = 1; st.ps[1].known[idx(x, y)] = 1;

    //  ⚠ **쏜 사람의 위치는 남기지 않는다.** 상대가 아는 것은 「어딘가에서 한 발
    //    나갔고, 그게 이 칸에 떨어졌다」뿐이다. 소리와 얼룩이 전부다.
    var object = BO.Rooms.objectAt(st.room, x, y);
    st.ev.push({ k: hit ? 'hit' : 'miss', x: x, y: y, by: side,
      material: BO.Rooms.material(st.room, x, y), object: object ? object.id : null,
      kind: object ? object.kind : 'floor' });
    return null;
  }

  //  발자국 하나. 같은 칸을 또 밟으면 **덮어쓴다** — 화살표 두 개가 겹치면 읽을 수가 없다.
  //  찍힌 칸은 둘 다 알게 된다(야광이라 보인다).
  function addMark(st, x, y, dir, side) {
    for (var i = 0; i < st.marks.length; i++) {
      var m = st.marks[i];
      if (m.x === x && m.y === y && m.side === side) { m.dir = dir; m.turn = st.turn; break; }
    }
    if (i === st.marks.length) st.marks.push({ x: x, y: y, turn: st.turn, side: side, dir: dir });
    st.ps[0].known[idx(x, y)] = 1;
    st.ps[1].known[idx(x, y)] = 1;
    st.ev.push({ k: 'mark', x: x, y: y, by: side, dir: dir });
  }

  // ── 턴 마감 ───────────────────────────────────────────────────────────────
  //  ⚠ v1.0 부터 발자국은 여기서 찍지 않는다 — `_move` 가 걸음마다 찍는다(addMark).
  //    턴 마감은 이제 제한 턴 검사와 차례 넘김만 한다.
  function endTurn(st) {
    var side = st.side;

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
  }

  // ── 턴 하나를 통째로 적용 ─────────────────────────────────────────────────
  //  네트워크로 받은 턴도, 내가 방금 확정한 턴도 **반드시 이 문을 지난다.**
  function applyTurn(st, side, acts) {
    if (st.over) return { ok: false, err: '이미 끝난 판' };
    if (side !== st.side) return { ok: false, err: '턴 주인이 아님' };
    if (!acts || acts.length > C.AP) return { ok: false, err: '행동 수 초과' };
    st.ev = [];
    for (var i = 0; i < acts.length; i++) {
      //  ⚠ 첫 발이 상대를 쓰러뜨렸으면 남은 행동은 **조용히 버린다**(오류가 아니다).
      if (st.over) break;
      var err = act(st, side, acts[i]);
      if (err) return { ok: false, err: err };   // 남은 행동은 처리하지 않는다
    }
    var ev = st.ev;
    endTurn(st);
    return { ok: true, ev: ev };
  }

  // ── 상태 해시 — 어긋남을 **조용히 넘어가지 않기 위한 장치** ────────────────
  function hash(st) {
    var s = st.turn + '|' + st.side + '|' + st.ap + '|' + st.moves + '|';
    s += JSON.stringify(st.room) + '|' + JSON.stringify(st.seen) + '|' + JSON.stringify(st.spot) + '|' +
         JSON.stringify(st.glow) + '|';
    for (var i = 0; i < 2; i++) {
      var p = st.ps[i];
      s += p.x + ',' + p.y + ',' + p.hp + ',' + (p.painted ? 1 : 0) + ',' + p.face + ',' + p.known.join('') + ';';
    }
    s += '|';
    for (var j = 0; j < st.paint.length; j++) {
      var q = st.paint[j];
      s += q.x + ',' + q.y + ',' + q.turn + ',' + q.by + ',' + (q.hit ? 1 : 0) + ';';
    }
    s += '|';
    for (var k = 0; k < st.marks.length; k++) {
      var m = st.marks[k];
      s += m.x + ',' + m.y + ',' + m.turn + ',' + m.side + ',' + m.dir + ';';
    }
    s += '|' + (st.lamp ? st.lamp.x + ',' + st.lamp.y : '-') + ',' + st.lit;
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
  function replay(seed, log) {
    var st = create(seed);
    for (var i = 0; i < log.length; i++) {
      var r = applyTurn(st, st.side, log[i]);
      if (!r.ok) return { ok: false, err: '기록 ' + (i + 1) + '번째 턴: ' + r.err, st: st };
    }
    return { ok: true, st: st };
  }

  // ── 화면이 보는 것 ────────────────────────────────────────────────────────
  //  UI·봇은 `st` 를 직접 읽지 않고 이 함수만 본다. 그래야 «실수로 상대 좌표나
  //  안 본 가구를 그려 버리는» 사고가 구조적으로 안 난다.
  function view(st, me) {
    var foe = 1 - me, P = st.ps[me], F = st.ps[foe];
    var tiles = [];
    for (var y = 0; y < C.H; y++) for (var x = 0; x < C.W; x++) {
      tiles.push(P.known[idx(x, y)] ? BO.Rooms.tileInfo(st.room, x, y) : null);
    }
    var seenNow = cone(st, me);
    //  ⚠ 상대 좌표가 이 객체에 들어오는 경우는 셋뿐이다 — 불이 켜졌거나(lit),
    //    내 시야 안에 있거나(seen), **이 턴에** 맞아 야광에 젖어 있거나(glow).
    //    glow 는 턴이 넘어가면 사라진다. 얼룩을 밟아 묻은 것(painted)은 안 보인다 —
    //    그건 발자국 규칙에만 쓰인다.
    var glowing = !!(st.glow && st.glow.side === foe && st.glow.turn === st.turn);
    var foeWhy = st.lit > 0 ? 'lit' : (sees(st, me, F.x, F.y) ? 'seen' : (glowing ? 'glow' : null));
    var foeSeen = st.seen[foe];
    if (st.spot[foe] && (!foeSeen || st.spot[foe].turn >= foeSeen.turn)) foeSeen = st.spot[foe];
    return {
      turn: st.turn, side: st.side, ap: st.ap, mine: me,
      myTurn: st.side === me && !st.over,
      me: { x: P.x, y: P.y, hp: P.hp, painted: P.painted, face: P.face },
      foeHp: F.hp,
      room: { id: st.room.id, name: st.room.name, floor: st.room.floor },
      tiles: tiles,                       // 아는 칸만 채워진다. 모르는 칸은 null.
      seen: seenNow,                      // 지금 시야각(자기 칸 포함)
      legalDirs: legalDirs(st, me),
      //  마지막으로 상대가 어디 있었나(맞힘·전등·**내 시야로 본 것**). 내가 노출된
      //  기록은 공개된 것(맞음·전등)만 — 상대가 나를 «봤다»는 건 내가 알 수 없다.
      foeSeen: foeSeen ? { x: foeSeen.x, y: foeSeen.y, turn: foeSeen.turn } : null,
      meSeen: st.seen[me] ? { x: st.seen[me].x, y: st.seen[me].y, turn: st.seen[me].turn } : null,
      paint: st.paint.map(function (p) {
        return { x: p.x, y: p.y, age: st.turn - p.turn, by: p.by, hit: !!p.hit };
      }),
      //  발자국은 **방향까지** 준다 — 어느 쪽으로 갔는지가 추적의 전부다(설계자 확정, v1.0).
      marks: st.marks.map(function (m) {
        return { x: m.x, y: m.y, age: st.turn - m.turn, side: m.side, dir: m.dir };
      }),
      //  전등 버튼 자리는 **공개 정보**다. 둘 다 어디로 가야 하는지 안다.
      lamp: st.lamp ? { x: st.lamp.x, y: st.lamp.y } : null,
      lit: st.lit,
      foe: foeWhy ? { x: F.x, y: F.y, why: foeWhy, glow: glowing } : null,   // glow: 이 턴에 맞아 야광에 젖어 있다(불빛 아래서도 칠은 보인다)
      moves: st.side === me ? st.moves : 0,
      range: C.RANGE, senseR: C.SENSE,
      //  ⚠ 새어 나가는 정보는 **참/거짓 한 비트뿐**이다. 방향도 거리도 안 준다.
      sense: C.SENSE > 0 && dist(P.x, P.y, F.x, F.y) <= C.SENSE,
      over: st.over, winner: st.winner, reason: st.reason,
      maxTurns: C.MAX_TURNS
    };
  }

  return {
    C: C, DX: DX, DY: DY,
    rng: rng, create: create, act: act, endTurn: endTurn, applyTurn: applyTurn,
    hash: hash, replay: replay, view: view,
    paintAt: paintAt, legalDirs: legalDirs, inBoard: inBoard, idx: idx,
    dist: dist, shootable: shootable, cone: cone, los: los, look: look
  };
})();
