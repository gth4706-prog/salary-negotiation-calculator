window.BO = window.BO || {};

// Public, deterministic room geometry. Furniture reacts to SHOTS only. Neither
// occupancy nor walking changes it: decor must never become an enemy sensor.
BO.Rooms = (function () {
  var layouts = [
    { id: 'office', name: '불 꺼진 사무실', floor: 'wood',
      rows: ['..........', '..........', '..........', '..........', '..........',
             '..........', '..........', '.......###', '.......###', '.......###'],
      objects: [
        { id: 'desk-a', kind: 'desk', name: '책상', x: 1, y: 1, w: 3, h: 1, material: 'wood' },
        { id: 'desk-b', kind: 'desk', name: '책상', x: 6, y: 1, w: 3, h: 1, material: 'wood' },
        { id: 'chair-a', kind: 'chair', name: '의자', x: 2, y: 2, w: 1, h: 1, material: 'fabric' },
        { id: 'chair-b', kind: 'chair', name: '의자', x: 7, y: 2, w: 1, h: 1, material: 'fabric' },
        { id: 'cabinet', kind: 'cabinet', name: '서랍장', x: 0, y: 4, w: 1, h: 2, material: 'wood' },
        { id: 'papers', kind: 'papers', name: '서류 뭉치', x: 6, y: 4, w: 2, h: 1, material: 'paper' },
        { id: 'shelf', kind: 'shelf', name: '책장', x: 1, y: 8, w: 3, h: 1, material: 'wood' }
      ] },
    { id: 'bedroom', name: '불 꺼진 침실', floor: 'wood',
      rows: ['##########', '..........', '..........', '..........', '..........',
             '..........', '..........', '..........', '..........', '##########'],
      objects: [
        { id: 'bed', kind: 'bed', name: '침대', x: 1, y: 2, w: 3, h: 3, material: 'fabric' },
        { id: 'nightstand', kind: 'nightstand', name: '협탁', x: 4, y: 2, w: 1, h: 1, material: 'wood' },
        { id: 'dresser', kind: 'cabinet', name: '옷장', x: 6, y: 2, w: 3, h: 1, material: 'wood' },
        { id: 'rug', kind: 'rug', name: '러그', x: 4, y: 5, w: 3, h: 2, material: 'fabric', walkable: true },
        { id: 'basket', kind: 'basket', name: '빨래 바구니', x: 8, y: 6, w: 1, h: 1, material: 'fabric' }
      ] }
  ];
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function create(seed) {
    var s = (seed ^ 0x6d2b79f5) >>> 0;
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return copy(layouts[(s >>> 8) % layouts.length]);
  }
  function inside(room, x, y) {
    return !!(room && room.rows[y] && room.rows[y].charAt(x) === '.');
  }
  function objectAt(room, x, y) {
    for (var i = 0; i < room.objects.length; i++) {
      var o = room.objects[i];
      if (x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h) return o;
    }
    return null;
  }
  function walkable(room, x, y) {
    if (!inside(room, x, y)) return false;
    var o = objectAt(room, x, y);
    return !o || o.walkable === true;
  }
  function material(room, x, y) {
    var o = objectAt(room, x, y);
    return o ? o.material : room.floor;
  }
  // Breadth-first distances through public walkable cells, for lamp placement
  // and bot navigation. Manhattan distance alone gets stuck behind furniture.
  function distances(room, x, y) {
    var out = {}, q = [{ x: x, y: y }], head = 0;
    if (!walkable(room, x, y)) return out;
    out[x + ',' + y] = 0;
    var dx = [0, 1, 0, -1], dy = [-1, 0, 1, 0];
    while (head < q.length) {
      var p = q[head++];
      for (var d = 0; d < 4; d++) {
        var nx = p.x + dx[d], ny = p.y + dy[d], key = nx + ',' + ny;
        if (!walkable(room, nx, ny) || out[key] != null) continue;
        out[key] = out[p.x + ',' + p.y] + 1;
        q.push({ x: nx, y: ny });
      }
    }
    return out;
  }
  return { create: create, copy: copy, inside: inside, objectAt: objectAt,
    walkable: walkable, material: material, distances: distances };
})();
