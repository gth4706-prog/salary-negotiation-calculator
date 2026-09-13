// Room geometry, target-only interactions, hidden movement and deterministic replay.
globalThis.window = globalThis;
require('../js/rooms.js'); require('../js/core.js'); require('../js/bot.js');
var assert = require('assert'), C = BO.Core, R = BO.Rooms;
var layouts = {}, positions = {};
for (var seed = 1; seed <= 1000; seed++) {
  var st = C.create(seed * 104729), room = st.room;
  layouts[room.id] = true;
  assert.strictEqual(room.rows.length, 10);
  room.rows.forEach(function (row) { assert.strictEqual(row.length, 10); });
  var paths = R.distances(room, st.ps[0].x, st.ps[0].y), floorCount = 0;
  room.objects.forEach(function (o) {
    for (var y = o.y; y < o.y + o.h; y++) for (var x = o.x; x < o.x + o.w; x++) {
      assert(R.inside(room, x, y), 'Furniture stays inside room');
    }
  });
  for (var y = 0; y < 10; y++) for (var x = 0; x < 10; x++) {
    if (R.walkable(room, x, y)) floorCount++;
  }
  assert.strictEqual(Object.keys(paths).length, floorCount, 'All floor cells connected');
  st.ps.forEach(function (p) { assert(R.walkable(room, p.x, p.y)); });
  assert(paths[st.ps[1].x + ',' + st.ps[1].y] != null, 'Both spawns connected');
  assert(paths[st.lamp.x + ',' + st.lamp.y] != null, 'Lamp reachable');
  positions[st.lamp.x + ',' + st.lamp.y] = true;
  var v = C.view(st, st.side), oldHash = C.hash(st);
  v.room.rows[0] = '##########';
  v.room.objects[0].x = 99;
  assert.strictEqual(C.hash(st), oldHash, 'View cannot mutate room');
  assert.strictEqual(C.hash(C.create(st.seed)), oldHash, 'Same seed = identical geometry');
}
assert.strictEqual(Object.keys(layouts).length, 2);
assert(Object.keys(positions).length > 20);
console.log('✓ 1,000 seeds: connected floors, valid spawns/lamp, two layouts, isolated views');

function fixture() {
  var st = C.create(1);
  st.room = { id: 'fixture', name: 'fixture', floor: 'wood',
    rows: Array(10).fill('..........'), objects: [
      { id: 'papers', kind: 'papers', material: 'paper', x: 2, y: 2, w: 1, h: 1 },
      { id: 'bed', kind: 'bed', material: 'fabric', x: 4, y: 4, w: 2, h: 2 },
      { id: 'rug', kind: 'rug', material: 'fabric', x: 6, y: 6, w: 1, h: 1, walkable: true }
    ] };
  st.ps = [{ x: 1, y: 2, hp: 5, painted: false }, { x: 8, y: 8, hp: 5, painted: false }];
  st.side = 0; st.lamp = null;
  return st;
}
var blocked = fixture(), h = C.hash(blocked);
assert(C.act(blocked, 0, ['m', 1]));
assert.strictEqual(C.hash(blocked), h, 'Rejected furniture move changes nothing');
assert(!C.legalDirs(blocked, 0).includes(1));
blocked.room.rows[0] = '##########'; h = C.hash(blocked);
assert(C.act(blocked, 0, ['s', 0, 0]));
assert.strictEqual(C.hash(blocked), h, 'Outside shot costs no AP');
assert(!C.shootable(1, 2, blocked.room).some(function (p) { return p.y === 0; }));

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
});
var rug = fixture(); rug.ps[0].x = 5; rug.ps[0].y = 6;
assert.strictEqual(C.act(rug, 0, ['m', 1]), null, 'Rug is walkable');
console.log('✓ Walls/furniture block movement, rugs remain walkable, material reactions do not reveal');

var a = fixture(), b = fixture(); b.ps[1].x = 7;
C.act(a, 0, ['s', 2, 2]); C.act(b, 0, ['s', 2, 2]);
assert.deepStrictEqual(a.ev, b.ev, 'Decor hit event independent of hidden opponent position');
assert.deepStrictEqual(C.view(a, 0), C.view(b, 0), 'No proximity/occupancy oracle in view');
var moving = fixture(); moving.ps[0].painted = true; moving.wasPainted = true;
C.act(moving, 0, ['m', 0]);
var hidden = C.view(moving, 1);
assert.strictEqual(hidden.stepFrom, null); assert.strictEqual(hidden.moves, 0);
assert.strictEqual(hidden.foe, null); assert.strictEqual(hidden.foeSeen, null);
assert.strictEqual(hidden.marks.length, 0, 'No premature footprint before turn commit');
C.endTurn(moving);
assert.strictEqual(C.view(moving, 1).marks.length, 1, 'Committed footprint visible');
var overlap = fixture(); overlap.ps[1] = { x: 1, y: 1, hp: 5, painted: false };
assert.strictEqual(C.act(overlap, 0, ['m', 0]), null);
assert.strictEqual(C.view(overlap, 0).foe, null); assert.strictEqual(overlap.ev.length, 0);
var changed = fixture(), before = C.hash(changed);
changed.room.objects[0].material = 'wood'; assert.notStrictEqual(C.hash(changed), before);
console.log('✓ Hidden moves/collocation stay private; only committed footprints reveal movement');

for (var n = 1; n <= 30; n++) {
  var live = C.create(n * 7919), log = [], r = C.rng(n);
  var oldRandom = Math.random; Math.random = r;
  while (!live.over && log.length < 80) {
    var acts = [];
    while (live.ap > 0 && !live.over) {
      var act = BO.Bot.think(live, live.side);
      if (!act) break;
      assert.strictEqual(C.act(live, live.side, act), null, 'Bot only selects legal actions');
      acts.push(act);
    }
    C.endTurn(live); log.push(acts);
  }
  Math.random = oldRandom;
  var replay = C.replay(live.seed, log);
  assert(replay.ok); assert.strictEqual(C.hash(replay.st), C.hash(live));
}
console.log('✓ 30 bot games: legal navigation and exact replay hashes');
