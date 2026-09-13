window.BO = window.BO || {};

// ============================================================================
//  블랙아웃 — **방 데이터**. 8×8, 가구는 «숨은 정보»다.
//
//  v0.5 부터 방은 8×8 이고 «방 밖» 칸이 없다 — 격자 전체가 방이다. 그리고 가구는
//  **미리 보여주지 않는다.** 시야각 안에 들어오거나, 부딪히거나, 야광 페인트가
//  튀어야 그 칸이 무엇인지 안다(core.js 의 known). 그래서 여기 데이터는 «정답지»
//  이고, 화면과 봇은 core.view() 가 걸러 준 tiles 만 본다.
//
//  가구는 **사격에만** 반응한다. 밟거나 옆을 지나가도 아무 일도 없다 — 가구가
//  상대를 알리는 감지기가 되어선 안 된다.
// ============================================================================
BO.Rooms = (function () {
  var W = 8, H = 8;
  var layouts = [
    { id: 'office', name: '불 꺼진 사무실', floor: 'wood',
      //  . . . . . . . .
      //  . D D D . . D D     D 책상
      //  . . C . . . . C     C 의자
      //  K . . . . . . .     K 서랍장(세로 2칸)
      //  K . . . . P P .     P 서류
      //  . . . . . . . .
      //  . S S S . . . .     S 책장
      //  . . . . . . . .
      objects: [
        { id: 'desk-a', kind: 'desk', name: '책상', x: 1, y: 1, w: 3, h: 1, material: 'wood' },
        { id: 'desk-b', kind: 'desk', name: '책상', x: 6, y: 1, w: 2, h: 1, material: 'wood' },
        { id: 'chair-a', kind: 'chair', name: '의자', x: 2, y: 2, w: 1, h: 1, material: 'fabric' },
        { id: 'chair-b', kind: 'chair', name: '의자', x: 7, y: 2, w: 1, h: 1, material: 'fabric' },
        { id: 'cabinet', kind: 'cabinet', name: '서랍장', x: 0, y: 3, w: 1, h: 2, material: 'wood' },
        { id: 'papers', kind: 'papers', name: '서류 뭉치', x: 5, y: 4, w: 2, h: 1, material: 'paper' },
        { id: 'shelf', kind: 'shelf', name: '책장', x: 1, y: 6, w: 3, h: 1, material: 'wood' }
      ] },
    { id: 'bedroom', name: '불 꺼진 침실', floor: 'wood',
      //  . . . . . . . .
      //  . B B N . W W W     B 침대(2×3) N 협탁 W 옷장
      //  . B B . . . . .
      //  . B B . . . . .
      //  . . . r r r . .     r 러그(밟을 수 있다)
      //  . . . r r r . .
      //  . . . . . . . K     K 빨래 바구니
      //  . . . . . . . .
      objects: [
        { id: 'bed', kind: 'bed', name: '침대', x: 1, y: 1, w: 2, h: 3, material: 'fabric' },
        { id: 'nightstand', kind: 'nightstand', name: '협탁', x: 3, y: 1, w: 1, h: 1, material: 'wood' },
        { id: 'dresser', kind: 'cabinet', name: '옷장', x: 5, y: 1, w: 3, h: 1, material: 'wood' },
        { id: 'rug', kind: 'rug', name: '러그', x: 3, y: 4, w: 3, h: 2, material: 'fabric', walkable: true },
        { id: 'basket', kind: 'basket', name: '빨래 바구니', x: 7, y: 6, w: 1, h: 1, material: 'fabric' }
      ] },
    { id: 'living', name: '불 꺼진 거실', floor: 'wood',
      //  . . . . . . . .
      //  . . T T . . . .     T TV 장
      //  . . . . . . . .
      //  . S S S . . P .     S 소파  P 화분
      //  . t t . . . . .     t 탁자
      //  . . . . r r r .     r 러그
      //  . . . . r r r .
      //  . . . . . . . .
      objects: [
        { id: 'tv', kind: 'cabinet', name: 'TV 장', x: 2, y: 1, w: 2, h: 1, material: 'wood' },
        { id: 'sofa', kind: 'sofa', name: '소파', x: 1, y: 3, w: 3, h: 1, material: 'fabric' },
        { id: 'plant', kind: 'plant', name: '화분', x: 6, y: 3, w: 1, h: 1, material: 'fabric' },
        { id: 'table', kind: 'desk', name: '탁자', x: 1, y: 4, w: 2, h: 1, material: 'wood' },
        { id: 'rug', kind: 'rug', name: '러그', x: 4, y: 5, w: 3, h: 2, material: 'fabric', walkable: true }
      ] }
  ];
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function create(seed) {
    var s = (seed ^ 0x6d2b79f5) >>> 0;
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return copy(layouts[(s >>> 8) % layouts.length]);
  }
  //  격자 전체가 방이다. «방 밖» 칸은 없다(v0.5).
  function inside(room, x, y) { return x >= 0 && y >= 0 && x < W && y < H; }
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
  //  칸 하나의 «정답» — core.view() 가 아는 칸에 한해 이걸 화면에 넘긴다.
  //  ox/oy 는 가구 안에서의 칸 위치(그림을 칸 단위로 잘라 붙일 때 쓴다).
  function tileInfo(room, x, y) {
    if (!inside(room, x, y)) return null;
    var o = objectAt(room, x, y);
    if (!o) return { kind: 'floor', name: '바닥', walk: true, material: room.floor, id: null, ox: 0, oy: 0, w: 1, h: 1 };
    return { kind: o.kind, name: o.name, walk: o.walkable === true, material: o.material, id: o.id,
             ox: x - o.x, oy: y - o.y, w: o.w, h: o.h };
  }
  //  정답지 기준 BFS 거리 — 전등 자리 검증·테스트용. 봇은 이걸 쓰면 안 된다(봇은
  //  자기가 아는 칸만으로 길을 찾는다, bot.js).
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
  return { W: W, H: H, create: create, copy: copy, inside: inside, objectAt: objectAt,
    walkable: walkable, material: material, tileInfo: tileInfo, distances: distances,
    count: function () { return layouts.length; } };
})();
