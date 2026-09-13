// 규칙 엔진 검증. `node blackout/tests/core.test.js`
//
// 왜 있나: 이 게임의 재미는 규칙 5·6(발자국)과 페인트 잔존에 전부 걸려 있는데,
// 그건 화면을 보고는 확인이 어렵다(어둠 속이라 눈으로 못 본다). 그래서 규칙은
// 눈이 아니라 여기서 확인한다.
globalThis.window = globalThis;
require('../js/rooms.js');
require('../js/core.js');
var C = BO.Core;

var pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
function eq(a, b, name) { ok(a === b, name, 'got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); }
function section(t) { console.log('\n' + t); }

// 원하는 배치를 직접 만든다 — 씨앗으로 우연히 나오길 기다리지 않는다.
function board(p0, p1, side) {
  var st = C.create(1);
  st.room = { id: 'test', name: 'test', floor: 'wood', rows: Array(10).fill('..........'), objects: [] };
  st.ps[0] = { x: p0[0], y: p0[1], hp: 5, painted: false };
  st.ps[1] = { x: p1[0], y: p1[1], hp: 5, painted: false };
  st.side = side || 0; st.ap = 2; st.turn = 1;
  st.wasPainted = st.ps[st.side].painted;
  return st;
}
var UP = 0, RIGHT = 1, DOWN = 2, LEFT = 3;

section('판 만들기');
(function () {
  var a = C.create(777), b = C.create(777);
  eq(C.hash(a), C.hash(b), '같은 씨앗이면 같은 판');
  ok(C.create(778).seed !== a.seed, '다른 씨앗은 다른 판');
  ok(a.ps[0].y < C.C.SPAWN_BAND, '0번은 위 3줄에서 시작');
  ok(a.ps[1].y >= C.C.H - C.C.SPAWN_BAND, '1번은 아래 3줄에서 시작');
  eq(a.ps[0].hp, 5, '체력 5로 시작');
  eq(a.ap, 2, '행동력 2로 시작');
})();

section('행동력 — 한 턴에 두 번');
(function () {
  var st = board([0, 0], [9, 9]);
  eq(C.act(st, 0, ['m', RIGHT]), null, '이동 1');
  eq(st.ap, 1, '행동력 1 남음');
  eq(C.act(st, 0, ['s', 5, 5]), null, '사격 1');
  eq(st.ap, 0, '행동력 소진');
  ok(C.act(st, 0, ['m', RIGHT]) !== null, '세 번째 행동은 거절');
  ok(C.act(st, 1, ['m', RIGHT]) !== null, '남의 턴에는 행동 불가');
})();

section('이동');
(function () {
  var st = board([0, 0], [9, 9]);
  ok(C.act(st, 0, ['m', UP]) !== null, '격자 밖(위)으로는 못 간다');
  ok(C.act(st, 0, ['m', LEFT]) !== null, '격자 밖(왼쪽)으로는 못 간다');
  eq(st.ap, 2, '거절된 행동은 행동력을 쓰지 않는다');
  C.act(st, 0, ['m', DOWN]);
  eq(st.ps[0].y, 1, '아래로 한 칸');
  eq(st.moves, 1, '이동 횟수 1');
})();

section('사격 · 피격 · 페인트 잔존');
(function () {
  var st = board([0, 0], [5, 5]);
  C.act(st, 0, ['s', 5, 5]);
  eq(st.ps[1].hp, 4, '맞으면 체력 1 감소');
  ok(st.ps[1].painted, '맞은 사람은 페인트가 묻는다');
  ok(!!st.seen[1], '맞은 순간 위치가 드러난다');
  ok(!!C.paintAt(st, 5, 5), '맞은 칸에 페인트가 남는다');

  var st2 = board([0, 0], [9, 9]);
  C.act(st2, 0, ['s', 4, 4]);
  eq(st2.ps[1].hp, 5, '빗나가면 체력 그대로');
  ok(!!C.paintAt(st2, 4, 4), '빗나가도 그 칸에는 페인트가 남는다');
  ok(C.act(st2, 0, ['s', 0, 0]) !== null, '제 발밑은 쏘지 못한다');
})();

section('페인트는 5턴 뒤에 사라진다');
(function () {
  var st = board([0, 0], [9, 9]);
  C.applyTurn(st, 0, [['s', 4, 4]]);          // 1턴에 칠했다
  var seenAlive = [];
  for (var t = 0; t < 7; t++) {
    seenAlive.push(st.turn + ':' + (C.paintAt(st, 4, 4) ? '남음' : '없음'));
    C.applyTurn(st, st.side, []);             // 아무것도 안 하고 턴만 넘긴다
  }
  eq(seenAlive.join(' '), '2:남음 3:남음 4:남음 5:남음 6:없음 7:없음 8:없음',
     '1턴에 칠한 페인트는 5턴(1~5턴) 살아 있고 6턴에는 없다');
})();

section('규칙 5 — 맞은 사람이 한 칸 움직이면 발자국이 보인다');
(function () {
  var st = board([3, 3], [5, 5], 0);
  C.applyTurn(st, 0, [['s', 5, 5]]);            // 0번이 1번을 맞힘 → 1번 페인트
  ok(st.ps[1].painted, '맞은 뒤 페인트 상태');
  ok(st.wasPainted, '다음 턴 시작 시점 기준이 잡힌다');
  var r = C.applyTurn(st, 1, [['m', LEFT], ['s', 0, 0]]);   // 한 칸 + 사격
  ok(r.ok, '턴 적용 성공');
  eq(st.marks.length, 1, '발자국이 하나 남는다');
  eq(st.marks[0].x + ',' + st.marks[0].y, '5,5', '발자국은 **발을 뗀 칸**에 남는다');
  ok(!st.ps[1].painted, '한 걸음에 페인트가 닳았다');
})();

section('규칙 5 — 두 칸 움직이면 발자국이 안 보인다');
(function () {
  var st = board([3, 3], [5, 5], 0);
  C.applyTurn(st, 0, [['s', 5, 5]]);
  C.applyTurn(st, 1, [['m', LEFT], ['m', LEFT]]);
  eq(st.marks.length, 0, '두 걸음이면 흔적이 남지 않는다');
  ok(!st.ps[1].painted, '두 걸음이면 페인트가 다 닳는다');
  eq(st.ps[1].x + ',' + st.ps[1].y, '3,5', '두 칸 이동한 위치');
})();

section('규칙 5 — 안 움직이면 페인트는 다음 턴으로 넘어간다');
(function () {
  var st = board([3, 3], [5, 5], 0);
  C.applyTurn(st, 0, [['s', 5, 5]]);
  C.applyTurn(st, 1, [['s', 0, 0], ['s', 1, 1]]);   // 제자리에서 두 발
  eq(st.marks.length, 0, '안 움직였으니 발자국도 없다');
  ok(st.ps[1].painted, '페인트는 그대로 신발에 남는다');
  C.applyTurn(st, 0, []);                            // 0번 턴 넘김
  C.applyTurn(st, 1, [['m', LEFT]]);                 // 이제 한 칸
  eq(st.marks.length, 1, '움직인 그 턴에 발자국이 남는다');
})();

section('규칙 6 — 페인트 칸을 밟으면 다음 턴에 발자국이 남는다');
(function () {
  var st = board([3, 3], [5, 5], 0);
  C.applyTurn(st, 0, [['s', 4, 5]]);                 // (4,5) 를 칠했다(빗나감)
  ok(!st.ps[1].painted, '빗나갔으니 아직 안 묻었다');
  C.applyTurn(st, 1, [['m', LEFT]]);                 // (5,5)→(4,5) 페인트 밟음
  eq(st.marks.length, 0, '밟은 그 턴에는 발자국이 없다(효과는 다음 턴부터)');
  ok(st.ps[1].painted, '밟아서 페인트가 묻었다');
  C.applyTurn(st, 0, []);
  C.applyTurn(st, 1, [['m', LEFT]]);                 // 한 칸 → 발자국
  eq(st.marks.length, 1, '밟은 다음 턴에 한 칸 움직이면 발자국');
  eq(st.marks[0].x + ',' + st.marks[0].y, '4,5', '발을 뗀 칸에 남는다');
})();

section('규칙 6 — 밟고 다시 밟으면 계속 묻어 있다');
(function () {
  var st = board([3, 3], [5, 5], 0);
  C.applyTurn(st, 0, [['s', 4, 5], ['s', 3, 5]]);    // 연달아 두 칸 칠함
  C.applyTurn(st, 1, [['m', LEFT], ['m', LEFT]]);    // 두 칸 다 페인트 위
  ok(st.ps[1].painted, '두 걸음이어도 새로 밟았으면 다시 묻는다');
})();

section('상대와 겹쳐도 이동 단서가 새지 않는다');
(function () {
  var st = board([4, 4], [5, 4]);
  eq(C.act(st, 0, ['m', RIGHT]), null, '상대 칸도 정상 이동');
  eq(st.ps[0].x, 5, '멈추거나 되돌아가지 않는다');
  eq(st.ap, 1, '일반 이동과 같은 행동력');
  eq(st.seen[0], null, '이동자 위치 공개 없음');
  eq(st.seen[1], null, '상대 위치 공개 없음');
  ok(!st.ev.some(function (e) { return e.k === 'bump'; }), '충돌 사건 없음');
})();

section('승패');
(function () {
  var st = board([0, 0], [5, 5], 0);
  st.ps[1].hp = 1;
  C.applyTurn(st, 0, [['s', 5, 5]]);
  ok(st.over, '체력이 0이면 끝');
  eq(st.winner, 0, '맞힌 쪽이 이긴다');
  eq(st.reason, 'kill', '사유는 격추');
  ok(!C.applyTurn(st, 1, [['m', 0]]).ok, '끝난 판에는 더 못 둔다');
})();

section('턴 제한 — 숨기만 하면 이기지 못한다');
(function () {
  var st = board([0, 0], [9, 9], 0);
  st.ps[0].hp = 3; st.ps[1].hp = 2;
  var guard = 0;
  while (!st.over && guard++ < 200) C.applyTurn(st, st.side, []);
  ok(st.over, '제한 턴에서 판이 끝난다');
  eq(st.turn, C.C.MAX_TURNS, '마지막 턴에서 끝난다');
  eq(st.reason, 'timeup', '사유는 시간 초과');
  eq(st.winner, 0, '체력이 많은 쪽이 이긴다');

  var st2 = board([0, 0], [9, 9], 0);
  var g2 = 0;
  while (!st2.over && g2++ < 200) C.applyTurn(st2, st2.side, []);
  eq(st2.winner, -1, '체력이 같으면 무승부');
})();

section('결정론 — 같은 입력이면 같은 상태');
(function () {
  //  ⚠ 턴 기록을 손으로 적지 않는다. 시작 위치가 씨앗마다 달라서 손으로 적은
  //    기록은 어떤 씨앗에서는 벽 밖으로 나가는 불법 턴이 된다(처음에 그렇게 짰다가
  //    엔진이 정확히 거절해서 알았다). **엔진에게 합법 수를 물어** 만든다.
  function playout(seed, turns) {
    var st = C.create(seed), r = C.rng(seed ^ 0xabcdef), log = [];
    for (var t = 0; t < turns && !st.over; t++) {
      var acts = [];
      for (var a = 0; a < 2; a++) {
        if (r() < 0.5) {
          var dirs = C.legalDirs(st, st.side);
          acts.push(['m', dirs[Math.floor(r() * dirs.length)]]);
        } else {
          var me = st.ps[st.side], targets = C.shootable(me.x, me.y, st.room);
          var target = targets[Math.floor(r() * targets.length)];
          acts.push(['s', target.x, target.y]);
        }
        var err = C.act(st, st.side, acts[acts.length - 1]);
        if (err) return { ok: false, err: err, log: log, st: st };
        if (st.over) break;
      }
      C.endTurn(st);
      log.push(acts);
    }
    return { ok: true, log: log, st: st };
  }

  var seed = 20260913;
  var live = playout(seed, 40);
  ok(live.ok, '합법 수만으로 40턴을 둔다', live.err);
  ok(live.log.length > 10, '충분히 긴 기록이 만들어진다', live.log.length);

  var a = C.replay(seed, live.log), b = C.replay(seed, live.log);
  ok(a.ok, '기록 재생이 성공한다', a.err);
  eq(C.hash(a.st), C.hash(b.st), '두 번 재생해도 같은 해시');
  eq(C.hash(live.st), C.hash(a.st), '한 턴씩 진행한 판 == 기록으로 되살린 판');

  //  실제 대전에서 벌어지는 일 그대로: 재접속한 쪽이 씨앗 + 기록만 받아 따라잡는다.
  var caught = C.create(seed);
  for (var i = 0; i < live.log.length; i++) C.applyTurn(caught, caught.side, live.log[i]);
  eq(C.hash(caught), C.hash(live.st), '재접속 복구(씨앗+기록)로 같은 판에 도달한다');

  var c = C.replay(seed + 1, live.log);
  ok(!c.ok || C.hash(c.st) !== C.hash(a.st), '씨앗이 다르면 다른 판');

  //  해시가 실제로 «다름»을 잡아내는가 — 안 잡으면 대조 자체가 무의미하다.
  var t1 = C.create(seed), t2 = C.create(seed);
  C.applyTurn(t1, t1.side, [['s', 0, 0]]);
  C.applyTurn(t2, t2.side, [['s', 0, 1]]);
  ok(C.hash(t1) !== C.hash(t2), '한 칸만 달라도 해시가 달라진다');
})();

section('잘못된 턴은 조용히 넘어가지 않는다');
(function () {
  var st = board([0, 0], [9, 9], 0);
  var r = C.applyTurn(st, 0, [['m', UP]]);             // 벽 밖
  ok(!r.ok, '규칙 위반 턴은 실패로 돌아온다');
  var r2 = C.applyTurn(board([0, 0], [9, 9], 0), 0, [['m', 2], ['m', 2], ['m', 2]]);
  ok(!r2.ok, '행동력을 넘긴 턴은 거절된다');
  var r3 = C.applyTurn(board([0, 0], [9, 9], 0), 1, [['m', 2]]);
  ok(!r3.ok, '턴 주인이 아니면 거절된다');
})();

section('화면이 보는 것에는 상대 좌표가 없다');
(function () {
  var st = board([2, 2], [7, 7], 0);
  st.lit = 0;
  var v = C.view(st, 0);
  var s = JSON.stringify(v);
  ok(v.me.x === 2 && v.me.y === 2, '내 좌표는 보인다');
  //  ⚠ 이제 `foe` 열쇠는 **있다** — 다만 불이 켜졌을 때만 값이 찬다. 열쇠가
  //    없는 것과 null 인 것은 다르니, 검사도 「불 꺼짐 → null」로 바뀐다.
  ok(v.foe === null, '불이 꺼져 있으면 상대 좌표는 null 이다');
  ok(v.foeHp === 5, '상대 체력은 공개 정보');
  ok(s.indexOf('"foeSeen":null') >= 0, '드러난 적이 없으면 목격 정보도 없다');
  //  불이 꺼진 view 를 통째로 훑어 상대 좌표가 새는 곳이 없는지 본다.
  st.ps[1] = { x: 7, y: 7, hp: 5, painted: false };
  ok(JSON.stringify(C.view(st, 0)).indexOf('"x":7,"y":7') === -1,
     '불이 꺼져 있으면 어느 구석에도 상대 좌표가 없다');
})();

section('마지막 한 발로 이긴 턴');
(function () {
  //  ⚠ 회귀 방지. 첫 발이 죽였는데 둘째 행동이 남아 있으면 예전에는 턴 전체가
  //    실패로 돌아왔고, 실전이었으면 그 턴이 상대에게 전송되지 않아 진 쪽 화면이
  //    영원히 「상대 턴」에 멈췄다(봇 400판 중 110판에서 실제로 발생).
  var st = board([0, 0], [5, 5], 0);
  st.ps[1].hp = 1;
  var r = C.applyTurn(st, 0, [['s', 5, 5], ['s', 4, 4]]);
  ok(r.ok, '이기는 턴도 정상으로 처리된다', r.err);
  ok(st.over && st.winner === 0, '승부가 제대로 났다');
  eq(C.paintAt(st, 4, 4), null, '죽은 뒤의 남은 행동은 버려진다');
})();

section('사격은 위치를 흘리지 않는다');
(function () {
  //  ⚠ 한때 총성 규칙(쏘면 쏜 자리가 상대에게 뜬다)을 넣었다가 뺐다. 설계에 없던
  //    규칙이었다. 다시 기어들어오지 않게 여기서 못을 박는다.
  var st = board([2, 2], [7, 7], 0);
  var v0 = C.view(st, 1);
  C.applyTurn(st, 0, [['s', 7, 7]]);
  var v1 = C.view(st, 1);
  ok(v1.foe === null, '맞은 쪽 화면에도 쏜 사람 좌표는 없다');
  eq(JSON.stringify(v1).indexOf('noise'), -1, '총성 같은 열쇠가 아예 없다');
  //  맞은 쪽이 아는 것: 「어딘가에서 한 발 나갔고 이 칸에 떨어졌다」 뿐이다.
  eq(v1.paint.length, 1, '떨어진 칸의 얼룩은 보인다');
  ok(v1.me.hp === 4, '맞았다는 사실도 안다');
})();

section('전등 버튼');
(function () {
  var st = board([0, 0], [9, 9], 0);
  st.lamp = { x: 1, y: 0 }; st.lit = 0;
  eq(C.view(st, 0).foe, null, '불이 꺼져 있으면 상대 좌표가 없다');
  ok(!!C.view(st, 0).lamp, '버튼 자리는 양쪽 다 안다');

  eq(C.act(st, 0, ['m', 1]), null, '버튼 칸으로 이동');
  eq(st.lit, C.C.LAMP_ACTIONS, '불이 켜진다');
  ok(!!C.view(st, 0).foe, '켠 사람에게 상대가 보인다');
  ok(!!C.view(st, 1).foe, '**상대에게도** 켠 사람이 보인다 — 켜는 건 공짜가 아니다');
  ok(!!st.seen[0] && !!st.seen[1], '둘 다 드러난 것으로 기록된다');

  C.act(st, 0, ['s', 9, 9]);
  eq(st.lit, 0, '행동 하나가 지나면 꺼진다');
  eq(C.view(st, 0).foe, null, '꺼지면 다시 안 보인다');
  eq(st.ps[1].hp, 4, '불빛 아래 쏜 한 발은 맞았다');
})();

section('전등 — 마지막 행동으로 켜면 상대가 그 불빛을 쓴다');
(function () {
  //  설계상 중요한 결과다: 언제 켜느냐가 이 버튼의 전부다.
  var st = board([0, 0], [9, 9], 0);
  st.lamp = { x: 1, y: 0 }; st.lit = 0;
  C.applyTurn(st, 0, [['s', 5, 5], ['m', 1]]);   // 쏘고 나서 마지막 행동으로 켬
  eq(st.lit, C.C.LAMP_ACTIONS, '턴이 끝나도 불은 켜진 채로 남는다');
  ok(!!C.view(st, 1).foe, '상대 차례가 되었는데 불이 켜져 있다');
  C.act(st, 1, ['s', 1, 0]);
  eq(st.ps[0].hp, 4, '상대가 그 불빛으로 켠 사람을 맞힌다');
  eq(st.lit, 0, '그 한 행동으로 불이 꺼진다');
})();

section('전등 — 판마다 자리가 다르고 가운데 띠에 있다');
(function () {
  var seen = {}, outside = 0;
  for (var i = 1; i <= 200; i++) {
    var st = C.create(i * 104729);
    seen[st.lamp.x + ',' + st.lamp.y] = 1;
    if (st.lamp.y < C.C.SPAWN_BAND || st.lamp.y >= C.C.H - C.C.SPAWN_BAND) outside++;
  }
  ok(Object.keys(seen).length > 20, '판마다 자리가 바뀐다', Object.keys(seen).length + '가지');
  eq(outside, 0, '시작 구역 안에는 절대 안 놓인다(한쪽만 유리해진다)');
})();

section('인기척은 사용하지 않는다');
(function () {
  var st = board([4, 4], [5, 4]);
  eq(C.C.SENSE, 0, '자동 위치 감지 비활성');
  eq(C.view(st, 0).sense, false, '바로 옆이어도 감지하지 않음');
  eq(C.view(st, 1).sense, false, '양쪽 동일');
})();

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' 통과 · ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
