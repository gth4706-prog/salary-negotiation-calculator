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
  st.ps[0] = { x: p0[0], y: p0[1], hp: 5, painted: false, face: 2, known: zeros() };
  st.ps[1] = { x: p1[0], y: p1[1], hp: 5, painted: false, face: 0, known: zeros() };
  st.side = side || 0; st.ap = 2; st.turn = 1; st.lamp = null; st.lit = 0;
  st.seen = [null, null]; st.spot = [null, null]; st.paint = []; st.marks = [];
  st.wasPainted = st.ps[st.side].painted;
  C.look(st, 0); C.look(st, 1);                 // 판을 만들 때처럼 각자 제 시야만큼 안다
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
  ok(!st.ps[1].painted, '한 걸음에 페인트가 닳았다 — 윤곽이 꺼진다');
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
  st.ps[0].face = 0;                                  // 위를 본다 — 오른쪽 칸은 시야 밖
  eq(C.act(st, 0, ['m', RIGHT]), null, '상대 칸도 정상 이동');
  eq(st.ps[0].x, 5, '멈추거나 되돌아가지 않는다');
  eq(C.view(st, 0).foe, null, '같은 칸에 겹쳐도 «본 것»이 아니다 — 접촉은 정보가 아니다');
  eq(st.ap, 1, '일반 이동과 같은 행동력');
  eq(st.seen[0], null, '이동자 위치 공개 없음');
  eq(st.seen[1], null, '상대 위치 공개 없음');
  ok(!st.ev.some(function (e) { return e.k === 'bump'; }), '충돌 사건 없음');
})();

section('시야각 — 바라보는 방향 앞 1·2·3칸 부채꼴');
(function () {
  //  (3,6) 에서 위를 본다: 5줄 x2~4 · 4줄 x2~4 · 3줄 x1~5
  var st = board([3, 6], [3, 4], 0); st.ps[0].face = UP;
  var v = C.view(st, 0);
  ok(!!v.foe && v.foe.why === 'seen', '두 칸 앞의 상대가 보인다', JSON.stringify(v.foe));
  eq(v.seen.length, 1 + 3 + 3 + 5, '시야 칸 수 = 자기 칸 + 3 + 3 + 5');
  st.ps[1] = { x: 3, y: 7, hp: 5, painted: false, face: 0, known: zeros() };
  eq(C.view(st, 0).foe, null, '바로 뒤는 안 보인다');
  st.ps[1].x = 6; st.ps[1].y = 3;
  eq(C.view(st, 0).foe, null, '세 칸 앞 부채꼴 밖(좌우 2칸 초과)은 안 보인다');
  st.ps[1].x = 5; st.ps[1].y = 3;
  eq(C.view(st, 0).foe.why, 'seen', '세 칸 앞 좌우 2칸 안쪽은 보인다');
  st.ps[1].x = 3; st.ps[1].y = 2;
  eq(C.view(st, 0).foe, null, '네 칸 앞은 안 보인다');
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
  ok(v.tiles[C.idx(2, 5)] && v.tiles[C.idx(2, 5)].kind === 'floor', '책상 옆 칸은 보인다');
  st.ps[1].x = 5; st.ps[1].y = 3;
  ok(!!C.view(st, 0).foe, '책상을 비껴 선 상대는 보인다');
  st.ps[1].x = 4; st.ps[1].y = 3;
  eq(C.view(st, 0).foe, null, '시선이 책상 모서리를 스치는 자리도 가려진다(브레젠험 선)');
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

section('윤곽 — 맞으면 야광 페인트 때문에 보인다, 움직이면 꺼진다');
(function () {
  var st = board([0, 0], [5, 5], 0);
  C.act(st, 0, ['s', 5, 5]);
  var v = C.view(st, 0);
  ok(!!v.foe && v.foe.why === 'glow' && v.foe.x === 5 && v.foe.y === 5, '맞힌 직후 상대 윤곽이 보인다');
  eq(C.act(st, 0, ['s', 5, 5]), null, '두 번째 행동으로 윤곽을 다시 쏜다');
  eq(st.ps[1].hp, 3, '연달아 맞는다 — 찾은 값이다');
  C.endTurn(st);
  ok(!!C.view(st, 0).foe, '상대 턴이 되어도 안 움직였으면 아직 보인다');
  C.applyTurn(st, 1, [['m', LEFT], ['m', LEFT]]);
  eq(C.view(st, 0).foe, null, '두 칸 도망치면 윤곽이 꺼진다');

  var s2 = board([0, 0], [5, 5], 0);
  C.applyTurn(s2, 0, [['s', 5, 5]]);
  C.applyTurn(s2, 1, [['s', 7, 7], ['s', 7, 6]]);   // 안 움직이고 두 발
  ok(!!C.view(s2, 0).foe && C.view(s2, 0).foe.why === 'glow', '안 움직이면 내 턴에도 윤곽이 그대로 — 맞았으면 움직여야 한다');

  var s3 = board([0, 0], [5, 5], 0);
  C.applyTurn(s3, 0, [['s', 4, 5]]);                // 빗나가 (4,5) 에 얼룩
  C.applyTurn(s3, 1, [['m', LEFT]]);                // 상대가 얼룩을 밟음
  ok(C.view(s3, 0).foe && C.view(s3, 0).foe.why === 'glow', '얼룩을 밟아도 묻는다 — 밟고 서 있으면 보인다');
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
  eq(C.view(st, 0).foe.why, 'glow', '꺼져도 방금 맞힌 상대는 윤곽으로 보인다');
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

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' 통과 · ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
