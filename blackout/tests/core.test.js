// 규칙 엔진 검증. `node blackout/tests/core.test.js`
//
// 왜 있나: 이 게임의 재미는 «어둠 속 정보»에 전부 걸려 있는데 — 시야각, 야광 페인트,
// 윤곽, 발자국 — 그건 화면을 보고는 확인이 어렵다(어둠 속이라 눈으로 못 본다).
// 그래서 규칙은 눈이 아니라 여기서 확인한다.
globalThis.window = globalThis;
require('../js/rooms.js');
require('../js/core.js');
var C = BO.Core, W = C.C.W, H = C.C.H;

var pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
function eq(a, b, name) { ok(a === b, name, 'got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); }
function section(t) { console.log('\n' + t); }

// 원하는 배치를 직접 만든다 — 씨앗으로 우연히 나오길 기다리지 않는다.
//  빈 8×8 방. face 는 0번 아래(2), 1번 위(0). 아는 칸은 시야각만큼.
function board(p0, p1, side, objects) {
  var st = C.create(1);
  st.room = { id: 'test', name: 'test', floor: 'wood', objects: objects || [] };
  st.ps[0] = { x: p0[0], y: p0[1], hp: 5, painted: false, face: 2, item: null, known: zeros() };
  st.ps[1] = { x: p1[0], y: p1[1], hp: 5, painted: false, face: 0, item: null, known: zeros() };
  st.side = side || 0; st.ap = 2; st.turn = 1; st.lamp = null; st.lit = 0;
  st.seen = [null, null]; st.spot = [null, null]; st.paint = []; st.marks = []; st.glow = null;
  st.drops = [];
  C.look(st, 0); C.look(st, 1);                 // 판을 만들 때처럼 각자 제 시야만큼 안다                 // 판을 만들 때처럼 각자 제 시야만큼 안다
  return st;
}
function zeros() { var k = []; for (var i = 0; i < W * H; i++) k.push(0); return k; }
function knownCount(st, s) { return st.ps[s].known.join('').replace(/0/g, '').length; }
var UP = 0, RIGHT = 1, DOWN = 2, LEFT = 3;

section('판 만들기 (8×8)');
(function () {
  var a = C.create(777), b = C.create(777);
  eq(W + 'x' + H, '8x8', '격자는 8×8');
  eq(C.hash(a), C.hash(b), '같은 씨앗이면 같은 판');
  ok(C.create(778).seed !== a.seed, '다른 씨앗은 다른 판');
  ok(a.ps[0].y < C.C.SPAWN_BAND, '0번은 위 2줄에서 시작');
  ok(a.ps[1].y >= H - C.C.SPAWN_BAND, '1번은 아래 2줄에서 시작');
  eq(a.ps[0].face, DOWN, '0번은 처음에 아래를 본다');
  eq(a.ps[1].face, UP, '1번은 처음에 위를 본다');
  eq(a.ps[0].hp, 5, '체력 5로 시작');
  eq(a.ap, 2, '행동력 2로 시작');
  ok(knownCount(a, 0) > 1 && knownCount(a, 0) < 20, '처음 아는 칸은 자기 칸 + 시야각뿐', knownCount(a, 0));
  ok(a.ps[0].known[C.idx(a.ps[0].x, a.ps[0].y)] === 1, '자기 칸은 안다');
})();

section('행동력 — 한 턴에 두 번');
(function () {
  var st = board([0, 0], [7, 7]);
  eq(C.act(st, 0, ['m', RIGHT]), null, '이동 1');
  eq(st.ap, 1, '행동력 1 남음');
  eq(C.act(st, 0, ['s', 5, 5]), null, '사격 1');
  eq(st.ap, 0, '행동력 소진');
  ok(C.act(st, 0, ['m', RIGHT]) !== null, '세 번째 행동은 거절');
  ok(C.act(st, 1, ['m', RIGHT]) !== null, '남의 턴에는 행동 불가');
})();

section('이동 · 바라보는 방향');
(function () {
  var st = board([0, 0], [7, 7]);
  ok(C.act(st, 0, ['m', UP]) !== null, '격자 밖(위)으로는 못 간다');
  ok(C.act(st, 0, ['m', LEFT]) !== null, '격자 밖(왼쪽)으로는 못 간다');
  eq(st.ap, 2, '거절된 행동은 행동력을 쓰지 않는다');
  C.act(st, 0, ['m', RIGHT]);
  eq(st.ps[0].x, 1, '오른쪽으로 한 칸');
  eq(st.ps[0].face, RIGHT, '움직인 방향을 본다');
  eq(st.moves, 1, '이동 횟수 1');
})();

section('부딪힘 — 모르는 가구로 걸어가면 행동력 하나, 그쪽을 보게 되고, 그 칸을 알게 된다');
(function () {
  var st = board([0, 0], [7, 7], 0, [{ id: 'd', kind: 'desk', name: '책상', x: 1, y: 0, w: 1, h: 1, material: 'wood' }]);
  ok(!st.ps[0].known[C.idx(1, 0)], '처음엔 오른쪽 칸을 모른다(아래를 보고 있다)');
  ok(C.legalDirs(st, 0).indexOf(RIGHT) >= 0, '모르는 칸은 갈 수 있는 걸로 친다');
  eq(C.act(st, 0, ['m', RIGHT]), null, '부딪힘은 규칙 위반이 아니다');
  eq(st.ps[0].x + ',' + st.ps[0].y, '0,0', '자리는 그대로');
  eq(st.ap, 1, '행동력 하나를 쓴다');
  eq(st.ps[0].face, RIGHT, '부딪힌 쪽을 보게 된다');
  eq(st.ps[0].known[C.idx(1, 0)], 1, '그 칸이 뭔지 알게 된다');
  eq(st.moves, 0, '움직인 것으로 치지 않는다(발자국 규칙에 안 걸린다)');
  ok(st.ev.some(function (e) { return e.k === 'bump' && e.kind === 'desk'; }), '부딪힘 사건(무엇에 부딪혔는지)');
  ok(C.legalDirs(st, 0).indexOf(RIGHT) < 0, '이제 그쪽은 갈 수 없는 방향');
  ok(C.act(st, 0, ['m', RIGHT]) !== null, '아는 가구로 또 가는 건 거절');
  eq(st.ap, 1, '거절은 행동력을 안 쓴다');
  ok(!st.ps[1].known[C.idx(1, 0)], '상대는 내가 부딪힌 걸 모른다');
})();

section('사격 · 피격 · 야광 페인트');
(function () {
  var st = board([0, 0], [5, 5]);
  C.act(st, 0, ['s', 5, 5]);
  eq(st.ps[1].hp, 4, '맞으면 체력 1 감소');
  ok(st.ps[1].painted, '맞은 사람은 페인트가 묻는다');
  ok(!!st.seen[1], '맞은 순간 위치가 드러난다');
  ok(!!C.paintAt(st, 5, 5), '맞은 칸에 페인트가 남는다');
  eq(st.ps[0].known[C.idx(5, 5)] + st.ps[1].known[C.idx(5, 5)], 2, '야광 얼룩은 둘 다 본다 — 그 칸이 뭔지 둘 다 알게 된다');

  var st2 = board([0, 0], [7, 7]);
  C.act(st2, 0, ['s', 4, 4]);
  eq(st2.ps[1].hp, 5, '빗나가면 체력 그대로');
  ok(!!C.paintAt(st2, 4, 4), '빗나가도 그 칸에는 페인트가 남는다');
  ok(C.act(st2, 0, ['s', 0, 0]) !== null, '제 발밑은 쏘지 못한다');
  ok(C.act(st2, 0, ['s', 8, 0]) !== null, '격자 밖은 못 쏜다');
})();

section('페인트·발자국은 판이 끝날 때까지 남는다');
(function () {
  var st = board([0, 0], [7, 7]);
  C.applyTurn(st, 0, [['s', 4, 4]]);
  for (var t = 0; t < 40; t++) C.applyTurn(st, st.side, []);
  ok(!!C.paintAt(st, 4, 4), '40턴이 지나도 얼룩이 있다');
  eq(C.view(st, 1).paint.length, 1, '화면에도 그대로');
  eq(C.view(st, 1).paint[0].age, 41, '얼룩의 나이만 는다');

  var m = board([3, 3], [5, 5], 0);
  C.applyTurn(m, 0, [['s', 5, 5]]);
  C.applyTurn(m, 1, [['m', LEFT]]);
  for (var u = 0; u < 40; u++) C.applyTurn(m, m.side, []);
  eq(m.marks.length, 1, '발자국도 판이 끝날 때까지');
  eq(C.view(m, 0).marks[0].dir, LEFT, '방향도 그대로 남는다');
})();

section('발자국 — 젖은 신발은 걸음마다, 발을 뗀 칸에, 방향까지 남긴다');
(function () {
  var st = board([3, 3], [5, 5], 0);
  C.applyTurn(st, 0, [['s', 5, 5]]);            // 0번이 1번을 맞힘 → 1번 신발이 젖는다
  ok(st.ps[1].painted, '맞은 뒤 신발이 젖는다');
  var r = C.applyTurn(st, 1, [['m', LEFT], ['s', 0, 0]]);   // 한 칸 + 사격
  ok(r.ok, '턴 적용 성공');
  eq(st.marks.length, 1, '발자국이 하나 남는다');
  eq(st.marks[0].x + ',' + st.marks[0].y, '5,5', '발자국은 **발을 뗀 칸**에 남는다');
  eq(st.marks[0].dir, LEFT, '**어느 쪽으로 갔는지**가 같이 남는다');
  eq(st.marks[0].x + C.DX[st.marks[0].dir] + ',' + (st.marks[0].y + C.DY[st.marks[0].dir]),
     st.ps[1].x + ',' + st.ps[1].y, '한 칸만 갔으면 화살표 끝이 곧 지금 자리다 — 치명적이다');
  ok(!st.ps[1].painted, '한 걸음이 야광을 다 쓴다');
})();

section('발자국 — 두 칸 도망은 첫 걸음만 남기고 끝자리를 흐린다');
(function () {
  var st = board([3, 3], [5, 5], 0);
  C.applyTurn(st, 0, [['s', 5, 5]]);
  C.applyTurn(st, 1, [['m', LEFT], ['m', LEFT]]);
  eq(st.marks.length, 1, '두 걸음이어도 발자국은 하나(첫 걸음)');
  eq(st.marks[0].x + ',' + st.marks[0].y, '5,5', '첫 걸음을 뗀 칸');
  eq(st.marks[0].dir, LEFT, '방향은 첫 걸음의 방향');
  eq(st.ps[1].x + ',' + st.ps[1].y, '3,5', '실제로는 한 칸 더 갔다 — 화살표 끝이 아니다');
  ok(!st.ps[1].painted, '두 걸음이면 당연히 말라 있다');
})();

section('발자국 — 안 움직이면 젖은 채로 다음 턴, 첫 걸음에 찍힌다');
(function () {
  var st = board([3, 3], [5, 5], 0);
  C.applyTurn(st, 0, [['s', 5, 5]]);
  C.applyTurn(st, 1, [['s', 0, 0], ['s', 1, 1]]);   // 제자리에서 두 발
  eq(st.marks.length, 0, '안 움직였으니 발자국도 없다');
  ok(st.ps[1].painted, '야광은 그대로 신발에 남는다');
  C.applyTurn(st, 0, []);                            // 0번 턴 넘김
  C.applyTurn(st, 1, [['m', LEFT]]);                 // 이제 한 칸
  eq(st.marks.length, 1, '움직인 그 턴에 발자국이 남는다');
  eq(st.marks[0].dir, LEFT, '방향도 같이');
})();

section('규칙 6 — 얼룩 위를 지나가면 **그 자리에** 발자국이 남는다');
(function () {
  //  ⚠ v1.0 의 핵심. 예전엔 밟아도 «다음 턴부터»라, 얼룩을 밟고 계속 걸으면 아무 흔적이
  //    없었다. 이제 밟는 순간 신발이 젖고 **다음 걸음에** 바로 찍힌다.
  var st = board([3, 3], [5, 5], 0);
  C.applyTurn(st, 0, [['s', 4, 5]]);                 // (4,5) 를 칠했다(빗나감)
  ok(!st.ps[1].painted, '빗나갔으니 아직 안 묻었다');
  C.applyTurn(st, 1, [['m', LEFT], ['m', LEFT]]);    // (5,5)→(4,5) 얼룩 밟고 →(3,5) 계속
  eq(st.marks.length, 1, '얼룩 위를 지나가면 흔적이 남는다');
  eq(st.marks[0].x + ',' + st.marks[0].y, '4,5', '발자국은 **얼룩을 밟았던 칸**에 찍힌다');
  eq(st.marks[0].dir, LEFT, '그리고 어느 쪽으로 빠져나갔는지까지');
  ok(!st.ps[1].painted, '한 걸음에 다 썼다');

  var s2 = board([3, 3], [5, 5], 0);
  C.applyTurn(s2, 0, [['s', 4, 5]]);
  C.applyTurn(s2, 1, [['m', LEFT]]);                 // 얼룩을 밟고 거기서 멈춘다
  eq(s2.marks.length, 0, '밟고 멈추면 그 턴엔 아직 없다');
  ok(s2.ps[1].painted, '젖은 채로 다음 턴');
  C.applyTurn(s2, 0, []);
  C.applyTurn(s2, 1, [['m', UP]]);
  eq(s2.marks.length, 1, '다음 턴 첫 걸음에 찍힌다');
  eq(s2.marks[0].x + ',' + s2.marks[0].y + ',' + s2.marks[0].dir, '4,5,' + UP, '밟았던 칸에, 나간 방향으로');
})();

section('규칙 6 — 얼룩을 연달아 밟으면 걸음마다 찍힌다(자취)');
(function () {
  var st = board([3, 3], [5, 5], 0);
  C.applyTurn(st, 0, [['s', 4, 5], ['s', 3, 5]]);    // 연달아 두 칸 칠함
  C.applyTurn(st, 1, [['m', LEFT], ['m', LEFT]]);    // (4,5) 밟고 →(3,5) 도 얼룩
  eq(st.marks.length, 1, '첫 얼룩 칸에 한 개');
  ok(st.ps[1].painted, '도착 칸도 얼룩이라 다시 젖었다');
  C.applyTurn(st, 0, []);
  C.applyTurn(st, 1, [['m', LEFT]]);
  eq(st.marks.length, 2, '다음 걸음에 또 하나 — 자취가 이어진다');
  eq(st.marks[1].x + ',' + st.marks[1].y, '3,5', '두 번째는 둘째 얼룩 칸에');
})();

section('발자국 — 같은 칸을 다시 밟으면 방향만 새로 고친다');
(function () {
  var st = board([3, 3], [5, 5], 0);
  C.applyTurn(st, 0, [['s', 5, 5]]);
  C.applyTurn(st, 1, [['m', LEFT]]);                 // (5,5) 에 왼쪽 발자국
  eq(st.marks.length, 1, '발자국 하나');
  C.applyTurn(st, 0, [['s', 4, 5]]);                 // 그 자리를 맞힌다 → 다시 젖음
  C.applyTurn(st, 1, [['m', RIGHT]]);                // (4,5) 에서 오른쪽으로 = (5,5) 로 복귀
  C.applyTurn(st, 0, [['s', 5, 5]]);
  C.applyTurn(st, 1, [['m', LEFT]]);                 // (5,5) 를 또 밟고 나간다
  var at55 = st.marks.filter(function (m) { return m.x === 5 && m.y === 5; });
  eq(at55.length, 1, '같은 칸에 발자국이 겹쳐 쌓이지 않는다 — 화살표가 둘이면 못 읽는다');
  eq(at55[0].dir, LEFT, '마지막으로 나간 방향이 남는다');
})();

section('상대와 겹쳐도 이동 단서가 새지 않는다');
(function () {
  var st = board([4, 4], [5, 4]);
  st.ps[0].face = 0;                                  // 위를 본다 — 오른쪽 칸은 시야 밖
  eq(C.act(st, 0, ['m', RIGHT]), null, '상대 칸도 정상 이동');
  eq(st.ps[0].x, 5, '멈추거나 되돌아가지 않는다');
  eq(C.view(st, 0).foe, null, '같은 칸에 겹쳐도 «본 것»이 아니다 — 접촉은 정보가 아니다');
  eq(st.ap, 1, '일반 이동과 같은 행동력');
  eq(st.seen[0], null, '이동자 위치 공개 없음');
  eq(st.seen[1], null, '상대 위치 공개 없음');
  ok(!st.ev.some(function (e) { return e.k === 'bump'; }), '충돌 사건 없음');
})();

section('시야 — 바라보는 방향 바로 앞 두 칸(손전등 줄기)');
(function () {
  //  (3,6) 에서 위를 본다: (3,5) · (3,4) 두 칸만
  var st = board([3, 6], [3, 4], 0); st.ps[0].face = UP;
  var v = C.view(st, 0);
  ok(!!v.foe && v.foe.why === 'seen', '두 칸 앞의 상대가 보인다', JSON.stringify(v.foe));
  eq(v.seen.length, 1 + 1 + 1, '시야 칸 수 = 자기 칸 + 앞 두 칸');
  st.ps[1] = { x: 3, y: 7, hp: 5, painted: false, face: 0, known: zeros() };
  eq(C.view(st, 0).foe, null, '바로 뒤는 안 보인다');
  st.ps[1].x = 4; st.ps[1].y = 5;
  eq(C.view(st, 0).foe, null, '앞 대각선은 안 보인다 — 줄기는 폭이 없다');
  st.ps[1].x = 2; st.ps[1].y = 6;
  eq(C.view(st, 0).foe, null, '바로 옆도 안 보인다(인기척으로만 느낀다)');
  st.ps[1].x = 3; st.ps[1].y = 3;
  eq(C.view(st, 0).foe, null, '세 칸 앞은 안 보인다');
  //  격자 밖으로 나가는 부채꼴은 잘린다
  var e = board([0, 0], [7, 7], 0); e.ps[0].face = UP;
  eq(C.view(e, 0).seen.length, 1, '벽을 보고 있으면 자기 칸만');
})();

section('시야각 — 가구 뒤는 안 보인다 (LOS)');
(function () {
  var st = board([3, 6], [3, 4], 0, [{ id: 'd', kind: 'desk', name: '책상', x: 3, y: 5, w: 1, h: 1, material: 'wood' }]);
  st.ps[0].face = UP; C.look(st, 0);
  var v = C.view(st, 0);
  eq(v.foe, null, '책상 바로 뒤의 상대는 안 보인다');
  ok(v.tiles[C.idx(3, 5)] && v.tiles[C.idx(3, 5)].kind === 'desk', '책상 자체는 보인다(아는 칸이 된다)');
  eq(v.tiles[C.idx(3, 4)], null, '책상 뒤 칸은 모른다');
  eq(v.tiles[C.idx(2, 5)], null, '책상 옆 칸은 줄기 밖이라 모른다');
  var s2 = board([3, 6], [3, 4], 0, [{ id: 'd', kind: 'desk', name: '책상', x: 2, y: 5, w: 1, h: 1, material: 'wood' }]);
  s2.ps[0].face = UP; C.look(s2, 0);
  ok(!!C.view(s2, 0).foe, '줄기 옆의 책상은 시선을 막지 않는다');
})();

section('시야로 본 것은 본 쪽만 안다');
(function () {
  var st = board([3, 6], [3, 4], 0); st.ps[0].face = UP;
  C.act(st, 0, ['s', 7, 7]);                        // 아무 행동 뒤에 목격이 기록된다
  var mine = C.view(st, 0), theirs = C.view(st, 1);
  ok(mine.foeSeen && mine.foeSeen.x === 3 && mine.foeSeen.y === 4, '본 쪽은 «마지막으로 본 자리»를 기억한다');
  eq(theirs.meSeen, null, '보인 쪽은 자기가 보였다는 걸 모른다');
  eq(theirs.foe, null, '보인 쪽에게 본 사람이 보이는 건 아니다');
})();

section('야광 — 맞은 순간 그 턴 동안 보인다, 턴이 넘어가면 다시 어둠');
(function () {
  var st = board([0, 0], [5, 5], 0);
  C.act(st, 0, ['s', 5, 5]);
  var v = C.view(st, 0);
  ok(!!v.foe && v.foe.why === 'glow' && v.foe.x === 5 && v.foe.y === 5, '맞힌 직후 야광에 젖은 상대가 보인다');
  eq(C.act(st, 0, ['s', 5, 5]), null, '두 번째 행동으로 다시 쏜다');
  eq(st.ps[1].hp, 3, '연달아 맞는다 — 찾은 값이다');
  C.endTurn(st);
  eq(C.view(st, 0).foe, null, '턴이 넘어가면 안 움직였어도 안 보인다 — 다음 턴엔 캐릭터는 어둠 속');
  ok(st.ps[1].painted, '신발의 야광(발자국 규칙)은 그대로 남는다');
  C.applyTurn(st, 1, [['m', LEFT]]);
  eq(st.marks.length, 1, '한 칸 움직이면 발자국');
  eq(st.marks[0].dir, LEFT, '방향까지');

  var s2 = board([0, 0], [5, 5], 0);
  C.applyTurn(s2, 0, [['s', 5, 5]]);
  C.applyTurn(s2, 1, [['s', 7, 7], ['s', 7, 6]]);   // 안 움직이고 두 발
  eq(C.view(s2, 0).foe, null, '상대가 안 움직여도 다음 내 턴에는 안 보인다(다시 찾아야 한다)');

  var s3 = board([0, 0], [5, 5], 0);
  C.applyTurn(s3, 0, [['s', 4, 5]]);                // 빗나가 (4,5) 에 얼룩
  C.applyTurn(s3, 1, [['m', LEFT]]);                // 상대가 얼룩을 밟음
  eq(C.view(s3, 0).foe, null, '얼룩을 밟아 묻은 건 보이지 않는다 — 발자국으로만 드러난다');
  ok(s3.ps[1].painted, '밟아서 묻긴 했다');
  var g1 = board([0, 0], [5, 5], 0), g2 = board([0, 0], [5, 5], 0);
  C.act(g1, 0, ['s', 5, 5]); C.act(g2, 0, ['s', 4, 4]);
  ok(C.hash(g1) !== C.hash(g2), '야광 상태도 해시에 들어간다');
})();

section('화면이 보는 것 — 상대 좌표도 가구도 새지 않는다');
(function () {
  var st = board([2, 2], [7, 7], 0, [{ id: 'd', kind: 'desk', name: '책상', x: 6, y: 6, w: 2, h: 1, material: 'wood' }]);
  st.ps[0].face = UP;
  var v = C.view(st, 0), s = JSON.stringify(v);
  ok(v.me.x === 2 && v.me.y === 2, '내 좌표는 보인다');
  eq(v.foe, null, '안 보이면 상대 좌표는 null');
  ok(v.foeHp === 5, '상대 체력은 공개 정보');
  eq(s.indexOf('"x":7,"y":7'), -1, '어느 구석에도 상대 좌표가 없다');
  eq(s.indexOf('objects'), -1, '가구 정답지(objects)는 화면에 안 간다');
  eq(s.indexOf('desk'), -1, '안 본 책상은 어디에도 없다');
  eq(v.tiles[C.idx(6, 6)], null, '모르는 칸은 null');
  ok(v.tiles[C.idx(2, 2)] && v.tiles[C.idx(2, 2)].kind === 'floor', '내 칸은 안다');
  eq(v.tiles.length, W * H, 'tiles 는 칸 수만큼');
  ok(!('room' in v) || !v.room.objects, 'room 에는 이름만');
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
  var st = board([0, 0], [7, 7], 0);
  st.ps[0].hp = 3; st.ps[1].hp = 2;
  var guard = 0;
  while (!st.over && guard++ < 200) C.applyTurn(st, st.side, []);
  ok(st.over, '제한 턴에서 판이 끝난다');
  eq(st.turn, C.C.MAX_TURNS, '마지막 턴에서 끝난다');
  eq(st.reason, 'timeup', '사유는 시간 초과');
  eq(st.winner, 0, '체력이 많은 쪽이 이긴다');
  var st2 = board([0, 0], [7, 7], 0), g2 = 0;
  while (!st2.over && g2++ < 200) C.applyTurn(st2, st2.side, []);
  eq(st2.winner, -1, '체력이 같으면 무승부');
})();

section('결정론 — 같은 입력이면 같은 상태');
(function () {
  //  엔진에게 합법 수를 물어 만든다(모르는 가구로 걸어가는 «부딪힘»도 합법이다).
  function playout(seed, turns) {
    var st = C.create(seed), r = C.rng(seed ^ 0xabcdef), log = [];
    for (var t = 0; t < turns && !st.over; t++) {
      var acts = [];
      for (var a = 0; a < 2; a++) {
        if (r() < 0.5) {
          var dirs = C.legalDirs(st, st.side);
          acts.push(['m', dirs[Math.floor(r() * dirs.length)]]);
        } else {
          var me = st.ps[st.side], targets = C.shootable(me.x, me.y);
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
  var caught = C.create(seed);
  for (var i = 0; i < live.log.length; i++) C.applyTurn(caught, caught.side, live.log[i]);
  eq(C.hash(caught), C.hash(live.st), '재접속 복구(씨앗+기록)로 같은 판에 도달한다');
  var c = C.replay(seed + 1, live.log);
  ok(!c.ok || C.hash(c.st) !== C.hash(a.st), '씨앗이 다르면 다른 판');
  var t1 = C.create(seed), t2 = C.create(seed);
  C.applyTurn(t1, t1.side, [['s', 0, 0]]);
  C.applyTurn(t2, t2.side, [['s', 0, 1]]);
  ok(C.hash(t1) !== C.hash(t2), '한 칸만 달라도 해시가 달라진다');
  var f1 = board([3, 3], [6, 6]), f2 = board([3, 3], [6, 6]); f2.ps[0].face = UP;
  ok(C.hash(f1) !== C.hash(f2), '바라보는 방향이 달라도 해시가 다르다');
  var k1 = board([3, 3], [6, 6]), k2 = board([3, 3], [6, 6]); k2.ps[1].known[0] = 1;
  ok(C.hash(k1) !== C.hash(k2), '아는 칸이 달라도 해시가 다르다');
  var d1 = board([4, 4], [6, 6]), d2 = board([4, 4], [6, 6]);
  d1.ps[0].painted = true; d2.ps[0].painted = true;
  C.act(d1, 0, ['m', LEFT]); C.act(d2, 0, ['m', UP]);
  ok(C.hash(d1) !== C.hash(d2), '발자국 방향이 달라도 해시가 다르다');
})();

section('잘못된 턴은 조용히 넘어가지 않는다');
(function () {
  var st = board([0, 0], [7, 7], 0);
  var r = C.applyTurn(st, 0, [['m', UP]]);             // 벽 밖
  ok(!r.ok, '규칙 위반 턴은 실패로 돌아온다');
  var r2 = C.applyTurn(board([0, 0], [7, 7], 0), 0, [['m', 2], ['m', 2], ['m', 2]]);
  ok(!r2.ok, '행동력을 넘긴 턴은 거절된다');
  var r3 = C.applyTurn(board([0, 0], [7, 7], 0), 1, [['m', 2]]);
  ok(!r3.ok, '턴 주인이 아니면 거절된다');
})();

section('마지막 한 발로 이긴 턴');
(function () {
  var st = board([0, 0], [5, 5], 0);
  st.ps[1].hp = 1;
  var r = C.applyTurn(st, 0, [['s', 5, 5], ['s', 4, 4]]);
  ok(r.ok, '이기는 턴도 정상으로 처리된다', r.err);
  ok(st.over && st.winner === 0, '승부가 제대로 났다');
  eq(C.paintAt(st, 4, 4), null, '죽은 뒤의 남은 행동은 버려진다');
})();

section('사격은 위치를 흘리지 않는다');
(function () {
  var st = board([2, 2], [7, 7], 0); st.ps[0].face = UP; st.ps[1].face = DOWN;
  C.applyTurn(st, 0, [['s', 7, 7]]);
  var v1 = C.view(st, 1);
  eq(v1.foe, null, '맞은 쪽 화면에도 쏜 사람 좌표는 없다');
  eq(JSON.stringify(v1).indexOf('noise'), -1, '총성 같은 열쇠가 아예 없다');
  eq(v1.paint.length, 1, '떨어진 칸의 얼룩은 보인다');
  ok(v1.me.hp === 4, '맞았다는 사실도 안다');
  ok(v1.me.painted, '내가 묻었다는 것도 안다(움직여야 한다)');
})();

section('전등 버튼 — 켜면 방 전체가 드러난다');
(function () {
  var st = board([0, 0], [7, 7], 0, [{ id: 'd', kind: 'desk', name: '책상', x: 6, y: 6, w: 2, h: 1, material: 'wood' }]);
  st.ps[0].face = UP;
  st.lamp = { x: 1, y: 0 }; st.lit = 0;
  eq(C.view(st, 0).foe, null, '불이 꺼져 있으면 상대 좌표가 없다');
  ok(!!C.view(st, 0).lamp, '버튼 자리는 양쪽 다 안다');
  eq(C.view(st, 0).tiles[C.idx(6, 6)], null, '켜기 전엔 먼 책상을 모른다');

  eq(C.act(st, 0, ['m', 1]), null, '버튼 칸으로 이동');
  eq(st.lit, C.C.LAMP_ACTIONS, '불이 켜진다');
  eq(C.view(st, 0).foe.why, 'lit', '켠 사람에게 상대가 보인다');
  ok(!!C.view(st, 1).foe, '**상대에게도** 켠 사람이 보인다 — 켜는 건 공짜가 아니다');
  ok(!!st.seen[0] && !!st.seen[1], '둘 다 드러난 것으로 기록된다');
  eq(knownCount(st, 0), W * H, '방 전체를 알게 된다');
  eq(knownCount(st, 1), W * H, '상대도 방 전체를 알게 된다');

  C.act(st, 0, ['s', 7, 7]);
  eq(st.lit, 0, '행동 하나가 지나면 꺼진다');
  eq(C.view(st, 0).foe.why, 'glow', '꺼져도 방금 맞힌 상대는 이 턴 동안 야광으로 보인다');
  ok(C.view(st, 0).foe.glow === true, '야광 표시(glow)는 why 와 별개로 준다 — 불빛 아래서도 칠이 보이게');
  eq(st.ps[1].hp, 4, '불빛 아래 쏜 한 발은 맞았다');
  ok(C.view(st, 0).tiles[C.idx(6, 6)] && C.view(st, 0).tiles[C.idx(6, 6)].kind === 'desk', '불이 꺼져도 본 가구는 기억한다');
})();

section('전등 — 마지막 행동으로 켜면 상대가 그 불빛을 쓴다');
(function () {
  var st = board([0, 0], [7, 7], 0);
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
    if (st.lamp.y < C.C.SPAWN_BAND || st.lamp.y >= H - C.C.SPAWN_BAND) outside++;
  }
  ok(Object.keys(seen).length > 15, '판마다 자리가 바뀐다', Object.keys(seen).length + '가지');
  eq(outside, 0, '시작 구역 안에는 절대 안 놓인다(한쪽만 유리해진다)');
})();

section('인기척 — 바로 옆 한 칸, 양쪽 다, 한 비트만');
(function () {
  var near = board([4, 4], [4, 5], 0), far = board([4, 4], [6, 4], 0);
  near.ps[0].face = UP; near.ps[1].face = DOWN; far.ps[0].face = UP;
  eq(C.C.SENSE, 1, '인기척 반경은 1 (설계자 확정값)');
  ok(C.view(near, 0).sense, '바로 옆이면 인기척이 켜진다');
  ok(C.view(near, 1).sense, '인기척은 양쪽 다 느낀다');
  ok(!C.view(far, 0).sense, '두 칸 떨어지면 꺼진다');
  ok(typeof C.view(near, 0).sense === 'boolean', '새는 것은 참/거짓 한 비트뿐이다');
  ok(C.view(near, 0).foe === null, '인기척이 켜져도(시야 밖이면) 상대 좌표는 안 준다');
})();

section('보급 상자 — 몇 턴마다 하나, 자리도 내용물도 공개, 씨앗으로만 정해진다');
(function () {
  var st = C.create(12345), spawned = 0, turns = 0;
  while (turns < 30 && !st.over) {
    var r = C.applyTurn(st, st.side, []);
    turns++;
    r.ev.forEach(function (e) { if (e.k === 'drop') spawned++; });
  }
  ok(spawned > 0, '몇 턴 지나면 상자가 떨어진다', spawned + '개');
  ok(st.drops.length <= C.C.DROP_MAX, '바닥에 DROP_MAX 를 넘겨 쌓이지 않는다', st.drops.length + '개');

  //  ⚠ 이 게임에서 제일 비싼 버그는 desync 다. 상자는 Math.random 을 쓰면 안 된다.
  var again = C.replay(12345, new Array(turns).fill([]));
  ok(again.ok, '같은 씨앗·같은 기록으로 다시 돌릴 수 있다', again.err);
  eq(C.hash(again.st), C.hash(st), '다시 돌린 판의 해시가 같다 — 상자가 결정론이다');
  eq(JSON.stringify(again.st.drops), JSON.stringify(st.drops), '상자 자리·내용물까지 똑같다');

  //  둘 다 본다 — 이게 «만날 이유»의 전부다.
  var v0 = C.view(st, 0), v1 = C.view(st, 1);
  eq(JSON.stringify(v0.drops), JSON.stringify(v1.drops), '상자는 양쪽에 똑같이 보인다(공개 정보)');
  if (st.drops.length) {
    ok(!!v0.drops[0].kind, '내용물도 미리 보인다 — 갈 값이 있는지 판단할 수 있어야 한다');
    ok(v0.tiles[C.idx(st.drops[0].x, st.drops[0].y)] !== null, '상자가 놓인 칸은 둘 다 알게 된다');
  }
  var seeds = {};
  for (var i = 1; i <= 40; i++) {
    var t = C.create(i * 7919);
    for (var k = 0; k < C.C.DROP_EVERY; k++) C.applyTurn(t, t.side, []);
    if (t.drops.length) seeds[t.drops[0].x + ',' + t.drops[0].y + ':' + t.drops[0].kind] = 1;
  }
  ok(Object.keys(seeds).length > 10, '판마다 자리도 내용물도 달라진다', Object.keys(seeds).length + '가지');
})();

section('보급 상자 — 밟으면 줍고, 그 순간 자리가 드러난다(그게 값이다)');
(function () {
  var st = board([3, 3], [7, 7], 0);
  st.drops = [{ x: 3, y: 4, kind: 'bomb', turn: 1 }];
  eq(C.act(st, 0, ['m', DOWN]), null, '상자 칸으로 걸어갈 수 있다');
  eq(st.ps[0].item, 'bomb', '밟으면 줍는다');
  eq(st.drops.length, 0, '주운 상자는 바닥에서 사라진다');
  ok(!!st.seen[0] && st.seen[0].x === 3 && st.seen[0].y === 4, '주운 자리가 공개 노출로 남는다');
  ok(C.view(st, 1).foeSeen && C.view(st, 1).foeSeen.y === 4, '상대는 「방금 거기 있었다」를 안다');
  eq(C.view(st, 0).item, 'bomb', '내 손에 든 것은 내게만 보인다');
  ok(C.view(st, 1).item == null, '⚠ 상대가 든 도구는 절대 넘어가지 않는다');

  //  손이 차 있으면 안 집는다 — 원치 않는 교환으로 자리가 팔리면 안 된다.
  var st2 = board([3, 3], [7, 7], 0);
  st2.ps[0].item = 'heal';
  st2.drops = [{ x: 3, y: 4, kind: 'bomb', turn: 1 }];
  C.act(st2, 0, ['m', DOWN]);
  eq(st2.ps[0].item, 'heal', '손이 차 있으면 상자를 밟아도 안 바뀐다');
  eq(st2.drops.length, 1, '상자도 그대로 남는다');
  ok(st2.seen[0] == null, '그러니 자리도 안 드러난다');
})();

section('도구 — 모양대로 칠하고, 쓴 사람의 자리는 사격과 똑같이 안 드러난다');
(function () {
  var st = board([0, 0], [4, 4], 0);
  st.ps[0].item = 'bomb';
  eq(C.act(st, 0, ['u', 4, 4]), null, '겨눈 칸에 던질 수 있다');
  eq(st.ps[1].hp, 4, '십자 안에 상대가 있으면 한 대');
  eq(st.paint.length, 5, '닿은 칸이 전부 칠해진다 — 그만큼 방이 드러난다');
  eq(st.ps[0].item, null, '쓰면 손이 빈다');
  eq(st.ap, 1, '행동력 하나를 쓴다');
  ok(C.view(st, 1).foeSeen == null || C.view(st, 1).foeSeen.x !== 0,
     '⚠ 던진 사람의 자리는 상대에게 안 간다(설계자 확정: 쏘면 들킨다는 설정은 없다)');
  ok(!!C.view(st, 0).foe, '맞힌 턴 동안은 상대가 야광으로 보인다');

  //  가장자리에 걸친 모양은 잘린다 — 구석에서 쓰면 그만큼 손해다.
  var edge = board([0, 0], [7, 7], 0);
  edge.ps[0].item = 'bomb';
  C.act(edge, 0, ['u', 0, 7]);
  eq(edge.paint.length, 3, '격자 밖으로 나간 칸은 버린다');

  //  여러 칸에 걸쳐도 한 번만 아프다.
  var once = board([0, 0], [3, 3], 0);
  once.ps[0].item = 'wide';
  C.act(once, 0, ['u', 3, 3]);
  eq(once.ps[1].hp, 4, '2×2 가 겹쳐도 체력은 하나만 깎인다');
  eq(once.paint.length, 4, '2×2 는 네 칸');
})();

section('도구 — 반창고는 제자리에서만, 그리고 자리를 알려주지 않는다');
(function () {
  var st = board([2, 2], [7, 7], 0);
  st.ps[0].item = 'heal'; st.ps[0].hp = 2;
  ok(!!C.act(st, 0, ['u', 5, 5]), '엉뚱한 칸에는 못 쓴다');
  eq(st.ps[0].hp, 2, '규칙 위반은 상태를 안 바꾼다');
  eq(C.act(st, 0, ['u', 2, 2]), null, '제자리에서는 쓸 수 있다');
  eq(st.ps[0].hp, 3, '체력이 하나 돌아온다');
  eq(st.paint.length, 0, '아무것도 칠하지 않는다');
  var ev = st.ev[st.ev.length - 1];
  eq(ev.k, 'heal', '회복 사건이 난다');
  ok(ev.x == null && ev.y == null, '⚠ 사건에 좌표가 없다 — 반창고로 내 자리가 새면 안 된다');

  var full = board([2, 2], [7, 7], 0);
  full.ps[0].item = 'heal';
  C.act(full, 0, ['u', 2, 2]);
  eq(full.ps[0].hp, C.C.HP, '체력 상한을 넘지 않는다');

  var empty = board([2, 2], [7, 7], 0);
  ok(!!C.act(empty, 0, ['u', 2, 2]), '빈손이면 규칙이 받지 않는다');
  eq(empty.ap, 2, '거절된 행동은 행동력도 안 쓴다');
})();

section('도구 — 해시에 들어간다(한쪽만 달라지면 그 자리에서 잡혀야 한다)');
(function () {
  var a = board([0, 0], [4, 4], 0), b = board([0, 0], [4, 4], 0);
  eq(C.hash(a), C.hash(b), '같은 판은 같은 해시');
  b.ps[0].item = 'bomb';
  ok(C.hash(a) !== C.hash(b), '손에 든 도구가 다르면 해시가 다르다');
  var c = board([0, 0], [4, 4], 0);
  c.drops = [{ x: 2, y: 2, kind: 'wide', turn: 1 }];
  ok(C.hash(a) !== C.hash(c), '바닥의 상자가 다르면 해시가 다르다');
})();

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' 통과 · ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
