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

    //  ── 전등 버튼 ──────────────────────────────────────────────────────────
    //  전장 가운데 구역 어딘가에 버튼이 하나 있다. 매 판 자리가 바뀐다.
    //  누구든 그 칸을 **밟으면 불이 켜지고 서로가 보인다.** 그리고 **행동 하나**가
    //  지나면 도로 꺼진다.
    //  ⚠ 켜는 것은 공짜가 아니다 — 불은 켠 사람도 비춘다. 게다가 마지막 행동으로
    //    켜면 남은 한 행동이 **상대 차례**에 돌아가, 공짜로 보여 주는 꼴이 된다.
    //    「언제 켜느냐」가 이 버튼의 전부다.
    //  ⚠ 자리는 위아래 시작 구역을 뺀 **가운데 띠**에서 뽑는다. 완전 무작위로
    //    뽑으면 한쪽 시작 구역 코앞에 놓여 그 판이 통째로 기울어진다.
    LAMP_ACTIONS: 1,       // 켜진 뒤 몇 «행동» 동안 보이나. 0 이면 버튼이 꺼진다.

    //  ── 아래 둘은 처음 규칙에 없던 값이다. 왜 있는지 적어 둔다 ────────────────
    //
    //  처음 규칙 그대로(사거리 무제한·인기척 없음) 봇끼리 2,000판을 돌리면:
    //      격추 0% · 무승부 76% · 명중률 0.2% · 이동 0회 · 발자국 0회
    //  «한 판도 안 끝나는 게임»이 나온다. 원인은 튜닝이 아니라 구조다 — 100칸에서
    //  보이지도 않고 움직이는 1칸짜리 표적을 아무 단서 없이 찾는 일이라, 배틀십이
    //  같은 10×10에서 성립하는 이유(배는 **안 움직이고 17칸을 차지**한다)가 여기엔
    //  둘 다 없다. 그래서 «단서»가 최소한 하나는 있어야 판이 돈다.
    //
    //  지금 값으로 봇끼리 2,000판 (`node blackout/tests/balance.js 2000`):
    //      격추 99.8% · 무승부 0.2% · 선공 승률 47.5%(공정) · 피해 8.26/10
    //      전등 3.2회/판 · 페인트 밟기 · 발자국 모두 실제로 발생
    //
    //  ⚠ 한때 **총성**(쏘면 쏜 자리가 상대 화면에 뜬다)을 넣었다가 뺐다.
    //    숫자는 잘 나왔지만(격추 92%) **설계에 없던 규칙**이었다 — 어둠 속에서
    //    쏘는 사람의 위치가 보일 이유가 없다. 사격은 소리와 이펙트로만 알린다.
    //    그 자리를 대신하는 것이 위의 전등 버튼이다: 단서를 «공짜로 새어 나오는
    //    정보»가 아니라 «가서 얻어 오는 것»으로 만든다.
    //
    //  사거리 — 실측 결과 도움이 안 됐다. 2~6 을 다 돌려 봐도 격추율이 오히려
    //  떨어졌다(둘이 서로를 아예 못 만난다). 원래 규칙인 무제한이 낫다. 눈금만 남긴다.
    RANGE: 0,              // 0 = 무제한(원래 규칙). 양수면 그 맨해튼 거리까지.

    //  인기척 — 맨해튼 이 거리 안에 상대가 있으면 **양쪽 다** 낌새를 챈다.
    //  방향도 거리도 안 알려 준다. 새는 것은 참/거짓 한 비트뿐이다. 0 이면 꺼진다.
    //  ⚠ 1 이다. 2 로 넓히면 오히려 판이 늘어진다(실측, 1500판):
    //      반경 1 → 격추 99.8% · 무승부 0.2% · 선공 47.5% · 평균 36턴 · 피해 8.26
    //      반경 2 → 격추 58.7% · 무승부 12.5% · 선공 41.2% · 평균 75턴 · 피해 6.13
    //      반경 3 → 격추 29.3% · 무승부 13.8% · 평균 107턴
    //    이유: 반경이 넓으면 「어중간한 단서」가 자주 떠서, 13칸짜리 복권을 긁느라
    //    행동력을 쓰고 정작 **전등을 하러 안 간다**(전등 사용 3.16회 → 1.68회).
    //    바로 옆 한 칸만 느끼게 두면 「모르겠으면 버튼을 하러 간다」가 분명해진다.
    //  ⚠ 실내 맵(가구 장애물)에서 다시 재면 결과가 갈린다 (1,500판):
    //      인기척 1 → 격추 86.1% · 무승부 5.1% · 평균 47턴 · 전등 2.75회
    //      인기척 0 → 격추 100%  · 무승부 0%   · 평균 41턴 · 전등 4.51회
    //    숫자만 보면 0 이 낫다. 그런데 이건 **설계자가 "인기척은 좋다"고 확정한
    //    규칙**이다 — «바로 옆에 있다»는 긴장은 숫자에 안 잡히는 재미다. 그래서
    //    1 로 둔다. 0 으로 바꾸는 건 한 글자이고, 바꾸면 위 숫자가 그대로 나온다.
    SENSE: 1
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
  function shootable(x, y, room) {
    var out = [];
    for (var yy = 0; yy < C.H; yy++) for (var xx = 0; xx < C.W; xx++) {
      if (xx === x && yy === y) continue;
      if (room && !BO.Rooms.inside(room, xx, yy)) continue;
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
      room: BO.Rooms.create(seed),
      turn: 1,
      side: (seed >>> 0) & 1,   // 선공도 씨앗이 정한다(둘이 서로 다른 답을 내면 안 된다)
      ap: C.AP,
      moves: 0,          // 이번 턴에 실제로 움직인 칸 수
      wasPainted: false, // **턴 시작 시점**의 페인트 여부 — 발자국 판정의 기준
      stepFrom: null,    // 첫 걸음을 뗀 칸(발자국은 여기 남는다)
      gotPaint: false,   // 이번 턴에 페인트 칸을 새로 밟았나
      ps: [], paint: [], marks: [],
      lamp: null,        // 전등 버튼 자리(판마다 다르다)
      lit: 0,            // 불이 켜진 채로 남은 «행동» 수
      seen: [null, null],   // 마지막 직접 명중·전등 공개
      ev: [],               // 방금 처리한 턴에 일어난 일(화면이 읽는다)
      over: false, winner: null, reason: null
    };
    // 0번은 위 3줄, 1번은 아래 3줄. 어느 칸인지는 서로 모르지만 **어느 구역인지는**
    // 둘 다 안다 — 첫 몇 턴이 완전한 무작위 찍기가 되지 않게 하는 최소한의 실마리다.
    st.ps.push(spawn(r, 0, st.room));
    st.ps.push(spawn(r, 1, st.room));
    st.lamp = spawnLamp(r, st);
    st.wasPainted = false;
    return st;
  }

  //  전등 버튼 — 가운데 띠에서만 뽑는다(위 LAMP_ACTIONS 주석 참조).
  function spawnLamp(r, st) {
    if (C.LAMP_ACTIONS <= 0) return null;
    // Use PUBLIC spawn bands, never actual hidden spawn positions.
    var choices = [];
    for (var y = C.SPAWN_BAND; y < C.H - C.SPAWN_BAND; y++) {
      for (var x = 0; x < C.W; x++) {
        if (!BO.Rooms.walkable(st.room, x, y)) continue;
        // Authored layouts have one connected floor component (room tests).
        // Keep random variety across the middle band, independent of spawns.
        choices.push({ x: x, y: y });
      }
    }
    return choices.length ? choices[Math.floor(r() * choices.length)] : null;
  }

  function spawn(r, side, room) {
    var cells = [];
    for (var y = 0; y < C.H; y++) for (var x = 0; x < C.W; x++) {
      if ((side === 0 ? y < C.SPAWN_BAND : y >= C.H - C.SPAWN_BAND) &&
          BO.Rooms.walkable(room, x, y)) cells.push({ x: x, y: y });
    }
    if (!cells.length) throw new Error('Room has no spawn cells');
    var p = cells[Math.floor(r() * cells.length)];
    return { x: p.x, y: p.y, hp: C.HP, painted: false };
  }

  // ── 조회 ──────────────────────────────────────────────────────────────────
  function paintAt(st, x, y) {
    for (var i = 0; i < st.paint.length; i++) {
      var p = st.paint[i];
      if (p.x === x && p.y === y && st.turn < p.until) return p;
    }
    return null;
  }

  // 이동 가능 여부는 공개된 방 구조만으로 정한다. 상대 위치는 참조하지 않는다.
  function legalDirs(st, side) {
    var p = st.ps[side], out = [];
    for (var d = 0; d < 4; d++) if (BO.Rooms.walkable(st.room, p.x + DX[d], p.y + DY[d])) out.push(d);
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
    //  ⚠ 버튼을 밟은 행동은 `lit` 을 LAMP_ACTIONS+1 로 올려 둔다. 그래서 여기서
    //    한 칸 깎여도 딱 LAMP_ACTIONS 만큼 남는다 — 켠 사람이 그 불로 한 번은
    //    행동할 수 있다. 켜진 채로 또 밟으면 같은 식으로 다시 채워진다.
    //    (이 방식이 아니면 「이번 행동에 켠 건가」를 따로 들고 다녀야 하고,
    //     그런 임시 상태는 해시에 안 들어가서 어긋남의 씨앗이 된다.)
    if (st.lit > 0) st.lit--;
    return null;
  }

  function _move(st, side, d) {
    if (d < 0 || d > 3) return '방향 범위 밖';
    var me = st.ps[side], foe = st.ps[1 - side];
    var nx = me.x + DX[d], ny = me.y + DY[d];
    if (!BO.Rooms.walkable(st.room, nx, ny)) return '벽이나 가구가 있는 칸은 걸어갈 수 없습니다';
    st.ap--;

    // bo0.2: players may share/pass through a floor cell. A rejected move or a
    // bump event would itself disclose a hidden opponent. Only furniture blocks.

    if (st.moves === 0) st.stepFrom = { x: me.x, y: me.y };
    me.x = nx; me.y = ny;
    st.moves++;

    //  페인트 칸을 밟았다 — 신발에 묻는다. 효과는 **다음 턴**부터다(규칙 6).
    if (paintAt(st, nx, ny)) {
      st.gotPaint = true;
      st.ev.push({ k: 'step', by: side });   // 밟은 본인만 아는 사건
    }

    //  ── 전등 버튼을 밟았다 ────────────────────────────────────────────────
    //  불이 켜지고 **둘 다** 드러난다. 켠 사람도 예외가 아니다.
    if (st.lamp && nx === st.lamp.x && ny === st.lamp.y && C.LAMP_ACTIONS > 0) {
      st.lit = C.LAMP_ACTIONS + 1;           // act() 끝에서 한 칸 깎인다
      st.seen[side] = { x: nx, y: ny, turn: st.turn };
      st.seen[1 - side] = { x: foe.x, y: foe.y, turn: st.turn };
      st.ev.push({ k: 'lamp', x: nx, y: ny, by: side, fx: foe.x, fy: foe.y });
    }
    return null;
  }

  function _shoot(st, side, x, y) {
    if (!BO.Rooms.inside(st.room, x, y)) return '방 밖은 겨냥할 수 없습니다';
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

    //  ⚠ **쏜 사람의 위치는 남기지 않는다.** 상대가 아는 것은 「어딘가에서 한 발
    //    나갔고, 그게 이 칸에 떨어졌다」뿐이다. 소리와 얼룩이 전부다.
    var object = BO.Rooms.objectAt(st.room, x, y);
    st.ev.push({ k: hit ? 'hit' : 'miss', x: x, y: y, by: side,
      material: BO.Rooms.material(st.room, x, y), object: object ? object.id : null });
    return null;
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
    s += JSON.stringify(st.room) + '|' + JSON.stringify(st.seen) + '|' +
         JSON.stringify(st.stepFrom) + '|';
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
      room: BO.Rooms.copy(st.room),
      legalDirs: legalDirs(st, me),
      foeSeen: st.seen[foe] ? BO.Rooms.copy(st.seen[foe]) : null,
      meSeen: st.seen[me] ? BO.Rooms.copy(st.seen[me]) : null,
      paint: st.paint.map(function (p) {
        return { x: p.x, y: p.y, left: p.until - st.turn, by: p.by, hit: !!p.hit };
      }),
      marks: st.marks.map(function (m) {
        return { x: m.x, y: m.y, left: m.until - st.turn, side: m.side };
      }),
      //  전등 버튼 자리는 **공개 정보**다. 둘 다 어디로 가야 하는지 안다.
      lamp: st.lamp ? { x: st.lamp.x, y: st.lamp.y } : null,
      lit: st.lit,
      //  ⚠ 상대 좌표가 이 객체에 들어오는 **유일한 경우**가 여기다 — 불이 켜져 있을 때.
      //    꺼져 있으면 아예 없는 열쇠라, 화면이 실수로 그릴 수가 없다.
      foe: st.lit > 0 ? { x: st.ps[foe].x, y: st.ps[foe].y } : null,
      moves: st.side === me ? st.moves : 0,
      stepFrom: st.side === me && st.stepFrom ? BO.Rooms.copy(st.stepFrom) : null,
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
