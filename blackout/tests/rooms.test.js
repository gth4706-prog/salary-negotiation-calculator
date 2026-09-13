// 방 데이터·숨은 가구·부딪힘·재질 반응·결정론 재생. `node blackout/tests/rooms.test.js`
globalThis.window = globalThis;
require('../js/rooms.js'); require('../js/core.js'); require('../js/bot.js');
var assert = require('assert'), C = BO.Core, R = BO.Rooms, W = C.C.W, H = C.C.H;
var layouts = {}, positions = {};
for (var seed = 1; seed <= 1000; seed++) {
  var st = C.create(seed * 104729), room = st.room;
  layouts[room.id] = true;
  var paths = R.distances(room, st.ps[0].x, st.ps[0].y), floorCount = 0;
  room.objects.forEach(function (o) {
    for (var y = o.y; y < o.y + o.h; y++) for (var x = o.x; x < o.x + o.w; x++) {
      assert(R.inside(room, x, y), 'Furniture stays inside the 8×8 board');
    }
  });
  for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) if (R.walkable(room, x, y)) floorCount++;
  assert.strictEqual(Object.keys(paths).length, floorCount, 'All floor cells connected');
  st.ps.forEach(function (p) { assert(R.walkable(room, p.x, p.y)); });
  assert(paths[st.ps[1].x + ',' + st.ps[1].y] != null, 'Both spawns connected');
  assert(paths[st.lamp.x + ',' + st.lamp.y] != null, 'Lamp reachable');
  positions[st.lamp.x + ',' + st.lamp.y] = true;
  var v = C.view(st, st.side), oldHash = C.hash(st), js = JSON.stringify(v);
  assert(js.indexOf('objects') < 0, 'View never carries the furniture answer sheet');
  assert(v.tiles.filter(function (t) { return t === null; }).length > 30, 'Most of the room starts unknown');
  v.tiles[0] = { kind: 'desk' }; v.seen.length = 0;
  assert.strictEqual(C.hash(st), oldHash, 'View cannot mutate state');
  assert.strictEqual(C.hash(C.create(st.seed)), oldHash, 'Same seed = identical geometry');
}
assert.strictEqual(Object.keys(layouts).length, R.count());
assert(Object.keys(positions).length > 15);
console.log('✓ 1,000 seeds: connected floors, valid spawns/lamp, ' + R.count() + ' layouts, isolated views');

function zeros() { var k = []; for (var i = 0; i < W * H; i++) k.push(0); return k; }
function fixture() {
  var st = C.create(1);
  st.room = { id: 'fixture', name: 'fixture', floor: 'wood', objects: [
      { id: 'papers', kind: 'papers', name: '서류', material: 'paper', x: 2, y: 2, w: 1, h: 1 },
      { id: 'bed', kind: 'bed', name: '침대', material: 'fabric', x: 4, y: 4, w: 2, h: 2 },
      { id: 'rug', kind: 'rug', name: '러그', material: 'fabric', x: 6, y: 6, w: 1, h: 1, walkable: true }
    ] };
  st.ps = [{ x: 1, y: 2, hp: 5, painted: false, face: 0, known: zeros() },
           { x: 7, y: 7, hp: 5, painted: false, face: 0, known: zeros() }];
  st.side = 0; st.lamp = null; st.lit = 0; st.seen = [null, null]; st.spot = [null, null];
  st.paint = []; st.marks = []; st.glow = null;
  C.look(st, 0); C.look(st, 1);
  return st;
}
//  부딪힘: (1,2) 에서 위를 보고 있으니 오른쪽 (2,2) 의 서류는 모른다
var bump = fixture();
assert.strictEqual(C.view(bump, 0).tiles[C.idx(2, 2)], null, 'Unseen furniture is unknown');
assert(C.legalDirs(bump, 0).indexOf(1) >= 0, 'Unknown cell counts as walkable');
assert.strictEqual(C.act(bump, 0, ['m', 1]), null, 'Walking into unknown furniture is a bump, not an error');
assert.strictEqual(bump.ps[0].x, 1, 'Bump does not move');
assert.strictEqual(bump.ap, 1, 'Bump costs one action');
assert.strictEqual(bump.ps[0].face, 1, 'Bump turns you toward it');
assert.strictEqual(bump.ev[0].k, 'bump'); assert.strictEqual(bump.ev[0].kind, 'papers');
assert.strictEqual(C.view(bump, 0).tiles[C.idx(2, 2)].kind, 'papers', 'Now you know what it is');
assert(C.legalDirs(bump, 0).indexOf(1) < 0, 'Known furniture is no longer a legal direction');
var h = C.hash(bump);
assert(C.act(bump, 0, ['m', 1]), 'Walking into known furniture is rejected');
assert.strictEqual(C.hash(bump), h, 'Rejected move changes nothing');
assert.strictEqual(C.view(bump, 1).tiles[C.idx(2, 2)], null, 'Opponent learns nothing from my bump');
console.log('✓ Bump: costs an action, turns you, reveals the tile to you only');

['paper', 'fabric', 'wood'].forEach(function (material, i) {
  var st = fixture(), xy = [[2, 2], [4, 4], [3, 3]][i];
  var geometry = JSON.stringify(st.room);
  assert.strictEqual(C.act(st, 0, ['s', xy[0], xy[1]]), null);
  assert.strictEqual(st.ev[0].material, material);
  assert.strictEqual(st.ev[0].k, 'miss');
  assert.strictEqual(st.paint.length, 1, 'No splash damage to extra cells');
  assert.strictEqual(st.ps[1].hp, 5);
  assert.strictEqual(JSON.stringify(st.room), geometry, 'Reaction never changes geometry');
  assert.deepStrictEqual(st.seen, [null, null], 'Furniture hits disclose no player location');
  assert(!('source' in st.ev[0]) && !('mx' in st.ev[0]));
  assert.strictEqual(C.view(st, 1).tiles[C.idx(xy[0], xy[1])].material, material, 'Luminous paint reveals the tile to both');
});
var rug = fixture(); rug.ps[0].x = 5; rug.ps[0].y = 6;
assert.strictEqual(C.act(rug, 0, ['m', 1]), null, 'Rug is walkable');
console.log('✓ Furniture blocks movement, rugs remain walkable, material reactions do not reveal');

var a = fixture(), b = fixture(); b.ps[1].x = 0; b.ps[1].y = 7;
C.act(a, 0, ['s', 2, 2]); C.act(b, 0, ['s', 2, 2]);
assert.deepStrictEqual(a.ev, b.ev, 'Decor hit event independent of hidden opponent position');
assert.deepStrictEqual(C.view(a, 0), C.view(b, 0), 'No proximity/occupancy oracle in view');
var moving = fixture(); moving.ps[0].painted = true;
C.act(moving, 0, ['m', 0]);
var hidden = C.view(moving, 1);
assert.strictEqual(hidden.moves, 0, 'The opponent never learns how far I moved this turn');
assert.strictEqual(hidden.foe, null, 'A painted mover is dark again once the hit turn is over (v0.9)');
assert.strictEqual(hidden.foeSeen, null, 'and no exposure record until it is a hit/lamp');
var dark = fixture(); C.act(dark, 0, ['m', 0]);
assert.strictEqual(C.view(dark, 1).foe, null, 'An unpainted mover out of sight has no coordinates');
//  v1.0: 발자국은 걸음 그 자리에서 바로 찍힌다(턴 마감을 기다리지 않는다) — 방향까지.
assert.strictEqual(hidden.marks.length, 1, 'A wet step prints immediately, mid-turn');
assert.strictEqual(hidden.marks[0].dir, 0, 'and carries the direction of travel');
assert.strictEqual(hidden.marks[0].x + ',' + hidden.marks[0].y, '1,2', 'at the tile the foot left');
C.endTurn(moving);
assert.strictEqual(C.view(moving, 1).marks.length, 1, 'still exactly one after the turn commits');
var overlap = fixture(); overlap.ps[1] = { x: 1, y: 1, hp: 5, painted: false, face: 0, known: zeros() };
assert.strictEqual(C.act(overlap, 0, ['m', 0]), null);
assert.strictEqual(C.view(overlap, 0).foe, null, 'Sharing a cell is not seeing');
assert.strictEqual(overlap.ev.length, 0);
var changed = fixture(), before = C.hash(changed);
changed.room.objects[0].material = 'wood'; assert.notStrictEqual(C.hash(changed), before);
console.log('✓ Hidden moves/collocation stay private; only committed footprints reveal movement');

var bumps = 0;
for (var n = 1; n <= 30; n++) {
  var live = C.create(n * 7919), log = [], r = C.rng(n);
  var oldRandom = Math.random; Math.random = r;
  while (!live.over && log.length < 80) {
    var acts = [];
    while (live.ap > 0 && !live.over) {
      var act = BO.Bot.think(live, live.side);
      if (!act) break;
      assert.strictEqual(C.act(live, live.side, act), null, 'Bot only selects legal actions');
      for (var e = 0; e < live.ev.length; e++) if (live.ev[e].k === 'bump') bumps++;
      acts.push(act);
    }
    C.endTurn(live); log.push(acts);
  }
  Math.random = oldRandom;
  var replay = C.replay(live.seed, log);
  assert(replay.ok); assert.strictEqual(C.hash(replay.st), C.hash(live));
}
console.log('✓ 30 bot games: legal navigation (' + bumps + ' bumps into unknown furniture) and exact replay hashes');
