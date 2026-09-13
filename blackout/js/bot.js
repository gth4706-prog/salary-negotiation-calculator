window.BO = window.BO || {};

// ============================================================================
//  블랙아웃 — **연습 상대**.
//
//  왜 있나: 실사용자가 몇 명뿐이라 **빈 방이 기본 상태**다(에그워에서 배운 것).
//  상대가 올 때까지 아무것도 못 하는 게임은 아무도 두 번 열지 않는다.
//
//  ⚠⚠ 이 봇은 **속이지 않는다.** 들어오자마자 `Core.view(st, 나)` 로 바꾸고 그 뒤로는
//    `st` 를 한 번도 안 본다. 상대 좌표도, **안 본 가구도** 모른다. 사람이 쓰는 단서
//    (시야각·야광 얼룩·발자국·윤곽·인기척·시작 구역)만으로 추리하고, 모르는 칸은
//    «갈 수 있겠지» 하고 걷다가 부딪히기도 한다. 사람과 같은 조건이어야 연습이 된다.
//
//  ⚠ Math.random 을 쓴다. 봇은 **연습 모드에서만** 돌고 그때는 맞출 상대가 없다.
//    실시간 대전 경로(match.js 의 vsBot=false)는 여기를 절대 부르지 않는다.
// ============================================================================
BO.Bot = (function () {
  var C = BO.Core;

  //  **한 번에 한 수만** 돌려준다(없으면 null = 턴 넘김). 부딪히면 자리가 안 바뀌니
  //  두 수를 미리 짜면 둘째 수가 틀린다 — 한 수 두고, 보고, 다음 수를 정한다.
  //  ── 모드 ──  'normal' 이 실전. 'tutorial' 은 가르치는 상대다:
  //   쏘지 않고, 페인트가 묻으면 **딱 한 칸** 움직여 발자국 규칙을 보여 주고,
  //   그 외엔 턴을 넘긴다.
  var mode = 'normal';

  function think(st, side) {
    var v = C.view(st, side);        // ← 여기서부터 st 는 없는 셈 친다
    if (mode === 'tutorial') return teach(v);
    return decide(v);
  }

  function teach(v) {
    if (v.ap <= 0) return null;
    if (v.me.painted && v.moves === 0) return mv(pickMove(v, null, false));   // 한 걸음 → 발자국을 보여 준다
    return null;
  }

  // ── 아는 것만으로 ─────────────────────────────────────────────────────────
  function W() { return C.C.W; }
  function H() { return C.C.H; }
  function tile(v, x, y) { return v.tiles[y * W() + x]; }
  //  모르는 칸은 «갈 수 있겠지» — 틀리면 부딪히고, 그러면 알게 된다.
  function passable(v, x, y) {
    if (!C.inBoard(x, y)) return false;
    var t = tile(v, x, y);
    return !t || t.walk;
  }
  function knownBlocked(v, x, y) {
    if (!C.inBoard(x, y)) return true;
    var t = tile(v, x, y);
    return !!(t && !t.walk);
  }
  //  목표 칸까지의 거리(BFS) — 아는 가구만 피한다.
  function paths(v, tx, ty) {
    var out = {}, q = [{ x: tx, y: ty }], head = 0;
    if (!passable(v, tx, ty)) return out;
    out[tx + ',' + ty] = 0;
    while (head < q.length) {
      var p = q[head++];
      for (var d = 0; d < 4; d++) {
        var nx = p.x + C.DX[d], ny = p.y + C.DY[d], key = nx + ',' + ny;
        if (!passable(v, nx, ny) || out[key] != null) continue;
        out[key] = out[p.x + ',' + p.y] + 1;
        q.push({ x: nx, y: ny });
      }
    }
    return out;
  }
  //  (x,y) 에서 face 쪽을 보면 들어오는 칸들 — 기하만(가구가 가리는 건 모른 척).
  function fan(x, y, face) {
    var out = [], fx = C.DX[face], fy = C.DY[face], rx = -fy, ry = fx, cone = C.C.CONE;
    for (var d = 1; d <= cone.length; d++) {
      for (var o = -cone[d - 1]; o <= cone[d - 1]; o++) {
        var cx = x + fx * d + rx * o, cy = y + fy * d + ry * o;
        if (C.inBoard(cx, cy)) out.push({ x: cx, y: cy });
      }
    }
    return out;
  }

  // ── 믿음 격자 ─────────────────────────────────────────────────────────────
  //  «상대는 지금 어디 있을까»를 공개 단서만으로 점수판으로 만든다. 턴마다 새로.
  function belief(v) {
    var g = [], x, y;
    for (y = 0; y < H(); y++) { g.push([]); for (x = 0; x < W(); x++) g[y].push(0.01); }

    //  «age 턴 전에 여기 있었다» — 그 뒤로 한 턴에 최대 2칸씩 갔을 수 있다.
    function spread(cx, cy, age, weight) {
      var r = Math.max(1, age);
      for (var yy = 0; yy < H(); yy++) for (var xx = 0; xx < W(); xx++) {
        var d = Math.abs(xx - cx) + Math.abs(yy - cy);
        if (d <= r) g[yy][xx] += weight / (1 + d);
      }
    }
    var evidence = false;

    //  ① 마지막으로 본 자리(맞혔거나·전등이거나·내 시야에 들어왔거나)
    if (v.foeSeen) { spread(v.foeSeen.x, v.foeSeen.y, v.turn - v.foeSeen.turn, 6); evidence = true; }

    //  ② 상대 발자국 — 그 칸에서 **어느 쪽으로** 발을 뗐는지까지 안다(v1.0).
    //     그러니 무게는 발자국 칸이 아니라 **화살표가 가리키는 칸**에 싣고, 그 너머로도
    //     조금 흘린다(한 걸음 더 갔을 수 있다). 방향을 안 쓰면 발자국이 반만 쓸모 있다.
    for (var i = 0; i < v.marks.length; i++) {
      var mk = v.marks[i];
      if (mk.side === v.mine || mk.age > 10) continue;
      var w = 6 / (1 + mk.age / 3);
      var tx = mk.x + C.DX[mk.dir], ty = mk.y + C.DY[mk.dir];
      if (C.inBoard(tx, ty)) {
        spread(tx, ty, mk.age, w);
        var fx = tx + C.DX[mk.dir], fy = ty + C.DY[mk.dir];       // 같은 방향으로 한 칸 더
        if (C.inBoard(fx, fy)) spread(fx, fy, mk.age, w * 0.6);
      } else spread(mk.x, mk.y, mk.age, w);
      g[mk.y][mk.x] *= 0.35;                                       // 발을 뗀 칸엔 이제 없다
      evidence = true;
    }

    //  ③ 아직 아무 단서도 없으면 **시작 구역**이 유일한 실마리다(공개 규칙).
    if (!evidence) {
      var band = v.mine === 0 ? [H() - C.C.SPAWN_BAND, H() - 1] : [0, C.C.SPAWN_BAND - 1];
      var spreadT = Math.max(0, v.turn - 1);
      for (y = 0; y < H(); y++) for (x = 0; x < W(); x++) {
        var dy = y < band[0] ? band[0] - y : (y > band[1] ? y - band[1] : 0);
        if (dy <= spreadT) g[y][x] += 1.2 / (1 + dy);
      }
    }

    //  ④ 내가 쏴서 빗나간 칸 — 그때 거기 없었다. 방금이면 확실, 오래됐으면 흐리게
    //     (얼룩은 안 지워지니 나이로 판단한다).
    for (var k = 0; k < v.paint.length; k++) {
      var q = v.paint[k];
      if (q.by !== v.mine || q.hit) continue;
      g[q.y][q.x] *= q.age <= 1 ? 0.05 : (q.age <= 4 ? 0.3 : 0.8);
    }

    //  ⑤ **상대도 상자를 노린다.** 상자 자리는 둘 다 아는 유일한 목적지다 — 단서가
    //     없을 때도 「저기로 오고 있을 것」이라는 약한 예측을 세울 수 있다. 약하게만.
    for (var b = 0; b < (v.drops || []).length; b++) {
      var dd = v.drops[b];
      for (y = 0; y < H(); y++) for (x = 0; x < W(); x++) {
        var dm2 = C.dist(x, y, dd.x, dd.y);
        if (dm2 <= 2) g[y][x] += 0.5 / (1 + dm2);
      }
    }

    //  ⑥ **지금 내 시야에 있는 칸에는 없다** — 있었으면 보였을 테니. 제일 확실한 부정 단서.
    if (!v.foe) for (var s = 0; s < v.seen.length; s++) g[v.seen[s].y][v.seen[s].x] = 0;

    //  ⑦ **인기척** — 켜지면 반경 안 어딘가, 꺼지면 반경 안에는 확실히 없다.
    if (v.senseR > 0) {
      for (y = 0; y < H(); y++) for (x = 0; x < W(); x++) {
        var dm = C.dist(x, y, v.me.x, v.me.y);
        if (v.sense) g[y][x] = dm <= v.senseR ? g[y][x] + 8 : g[y][x] * 0.05;
        else if (dm <= v.senseR) g[y][x] = 0;
      }
    }

    //  아는 가구 칸에는 서 있을 수 없다. 제 발밑은 못 쏜다.
    for (y = 0; y < H(); y++) for (x = 0; x < W(); x++) if (knownBlocked(v, x, y)) g[y][x] = 0;
    g[v.me.y][v.me.x] = 0;
    return g;
  }

  //  ── 판단 ────────────────────────────────────────────────────────────────
  function decide(v) {
    if (v.ap <= 0) return null;
    var first = (v.ap === C.C.AP);

    //  ① **보이면 쏜다** — 불빛 아래든, 시야 안이든, 야광 윤곽이든.
    if (v.foe && (v.foe.x !== v.me.x || v.foe.y !== v.me.y)) return ['s', v.foe.x, v.foe.y];
    if (v.foe) return mv(pickMove(v, null, false));

    var g = belief(v);

    //  ② 신발이 젖어 있으면 다음 걸음에 **방향까지 있는 발자국**이 찍힌다. 한 걸음만
    //     떼고 멈추면 화살표 끝이 곧 내 자리다 — 두 걸음을 붙여 끝자리를 흐린다.
    if (v.me.painted) return mv(pickMove(v, null, true));

    //  ③ 손에 도구가 있으면 — 반창고는 아플 때, 나머지는 **덮은 칸의 합**이 제일 큰 곳에.
    //     도구는 한 발보다 넓으니 단서가 흐려도 던질 값이 있다(문턱을 낮게 둔다).
    if (v.item === 'heal') {
      if (v.me.hp <= 2) return ['u', v.me.x, v.me.y];
      //  체력이 가득인데 반창고를 쥐고 있으면 **다음 상자를 못 줍는다**(한 손에 하나).
      //  코앞에 상자가 있으면 감고 버린다 — 손을 비우는 것도 수다.
      if (v.me.hp >= C.C.HP && v.drops && v.drops.length) {
        var near0 = nearestDrop(v);
        if (near0 && near0.n <= 2) return ['u', v.me.x, v.me.y];
      }
    } else if (v.item && hasLead(v)) {
      var blast = bestBlast(g, v);
      if (blast && blast.s > 0.9) return ['u', blast.x, blast.y];
    }

    //  ④ **코앞의 상자는 단서보다 먼저다.** 두 걸음 안이면 주워 두고 쫓는다 — 도구 하나가
    //     한 발보다 넓고, 무엇보다 상대도 그리로 오는 중이다.
    if (!v.item && v.drops && v.drops.length) {
      var near = nearestDrop(v);
      if (near && near.n > 0 && near.n <= 2) {
        var grab = pickMove(v, near, false, g);
        if (grab != null) return ['m', grab];
      }
    }

    //  ⑤ 단서가 있으면 쏜다. 없으면 **쏘지 않는다** — 64칸에 대고 찍는 건 낭비다.
    if (hasLead(v)) {
      var shot = bestShot(g, v);
      if (shot && shot.s > 0.4) return ['s', shot.x, shot.y];
    }

    // ── 여기부터는 «단서가 없다». 정보를 얻으러 간다. ────────────────────────
    //  ⑥ **보급 상자** — 손이 비었으면 제일 가까운 상자로 간다. 전등보다 먼저인 이유:
    //     도구도 얻고, 무엇보다 **상대도 거기로 온다.** 어둠에서 만날 유일한 약속이다.
    if (!v.item && v.drops && v.drops.length) {
      var box = nearestDrop(v);
      if (box && !(v.me.x === box.x && v.me.y === box.y)) {
        var toBox = pickMove(v, box, false, g);
        if (toBox != null) return ['m', toBox];
      }
    }
    if (v.lamp) {
      var onLamp = (v.me.x === v.lamp.x && v.me.y === v.lamp.y);
      var adj = -1;
      for (var d = 0; d < 4; d++)
        if (v.me.x + C.DX[d] === v.lamp.x && v.me.y + C.DY[d] === v.lamp.y) adj = d;
      //  ⑦ 버튼이 바로 옆이고 **첫 행동**이면 켠다(마지막 행동으로 켜면 상대가 그 불을 쓴다).
      if (adj >= 0 && first) return ['m', adj];
      //  ⑧ 버튼 위에 서 있다 → 한 칸 물러난다. 다음 턴 첫 행동으로 다시 밟으려고.
      if (onLamp) return mv(pickMove(v, null, false, g));
      //  ⑨ 아직 멀다 → 다가간다(아는 가구만 피해서. 모르는 가구면 부딪히고 배운다).
      if (adj < 0) {
        var toLamp = pickMove(v, v.lamp, false, g);
        if (toLamp != null) return ['m', toLamp];
      }
    }
    //  ⑩ 버튼이 없거나 갈 데가 없으면 — 새 칸을 제일 많이 보게 되는 쪽으로 훑는다.
    var sweep = pickMove(v, null, false, g);
    if (sweep != null) return ['m', sweep];
    var fb = bestShot(g, v);
    return fb ? ['s', fb.x, fb.y] : null;
  }

  //  쫓을 만한 단서가 있나 — 없으면 추리해 봐야 허공이다.
  function hasLead(v) {
    if (v.sense) return true;
    if (v.foeSeen && (v.turn - v.foeSeen.turn) <= 6) return true;
    for (var i = 0; i < v.marks.length; i++) if (v.marks[i].side !== v.mine && v.marks[i].age <= 6) return true;
    return false;
  }

  function mv(d) { return d != null ? ['m', d] : null; }

  //  제일 가까운 상자 — 아는 가구만 피해서 걸어갔을 때. 못 가는 상자는 뺀다.
  function nearestDrop(v) {
    var best = null;
    for (var i = 0; i < v.drops.length; i++) {
      var d = v.drops[i], pp = paths(v, d.x, d.y), n = pp[v.me.x + ',' + v.me.y];
      if (n == null) continue;
      if (d.kind === 'heal' && v.me.hp >= C.C.HP - 1) n += 6;   // 멀쩡할 땐 반창고가 안 급하다
      if (!best || n < best.n) best = { x: d.x, y: d.y, n: n };
    }
    return best;
  }

  //  도구는 모양대로 여러 칸을 덮는다 — 그러니 «한 칸 최고점»이 아니라 **덮은 칸의 합**이
  //  제일 큰 자리에 던진다. 사람이 손으로 하는 계산과 같다.
  function bestBlast(g, v) {
    var best = null;
    for (var y = 0; y < H(); y++) for (var x = 0; x < W(); x++) {
      var ts = C.shapeTiles(v.item, x, y), s = 0;
      for (var i = 0; i < ts.length; i++) {
        var t = ts[i];
        if (knownBlocked(v, t.x, t.y)) continue;
        if (t.x === v.me.x && t.y === v.me.y) continue;    // 제 발밑은 어차피 못 맞힌다
        s += g[t.y][t.x];
      }
      if (!best || s > best.s) best = { x: x, y: y, s: s };
    }
    return best;
  }

  //  사정권 안에서 점수가 가장 높은 칸.
  function bestShot(g, v) {
    var cells = C.shootable(v.me.x, v.me.y), best = null;
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      if (knownBlocked(v, c.x, c.y)) continue;
      if (!best || g[c.y][c.x] > best.s) best = { x: c.x, y: c.y, s: g[c.y][c.x] };
    }
    return best;
  }

  //  어디로 갈까 — 공개 정보만 본다.
  //   · 얼룩은 피한다(밟으면 야광이 되어 보인다)
  //   · `toward` 쪽으로 좁혀 간다 / `flee` 면 최근에 들킨 자리에서 멀어진다
  //   · `g` 가 있으면 새 자리에서 **보게 될 칸**(모르는 칸·상대가 있을 법한 칸)을 쳐 준다
  function pickMove(v, toward, flee, g) {
    var me = v.me, best = null, bestScore = -1e9;
    var dists = toward ? paths(v, toward.x, toward.y) : null;
    var paintAt = {};
    for (var i = 0; i < v.paint.length; i++) paintAt[v.paint[i].x + ',' + v.paint[i].y] = 1;
    var boxAt = {};
    if (!v.item) for (var b = 0; b < (v.drops || []).length; b++) boxAt[v.drops[b].x + ',' + v.drops[b].y] = 1;

    for (var j = 0; j < v.legalDirs.length; j++) {
      var d = v.legalDirs[j];
      var nx = me.x + C.DX[d], ny = me.y + C.DY[d];
      var s = Math.random() * 0.9;                       // 예측 불가능해야 한다
      if (paintAt[nx + ',' + ny]) s -= 4;                // 밟으면 윤곽이 보인다
      //  상자 위로 한 걸음이면 도구 하나. 얼룩을 밟는 값(−4)보다 크게 둔다 — 그래야
      //  얼룩 위에 놓인 상자도 주우러 간다(그게 이 판에서 제일 재미있는 선택이다).
      if (boxAt[nx + ',' + ny]) s += 6;
      //  모르는 칸은 부딪힐 수 있다. 시야가 두 칸 줄기라 옆은 늘 모른다 — 벌점을 세게 두지
      //  않으면 판당 50번을 부딪힌다(실측). 앞(보이는 칸)으로 가는 걸 좋아하게.
      if (!tile(v, nx, ny)) s -= 1.1;
      if (toward) {
        var was = dists[me.x + ',' + me.y], nowd = dists[nx + ',' + ny];
        if (nowd == null) continue;
        s += ((was == null ? 99 : was) - nowd) * 4.0;
      }
      //  도망은 «상대가 안다고 믿는 내 자리»에서 멀어지는 것이다.
      if (flee && v.meSeen) {
        s += (C.dist(nx, ny, v.meSeen.x, v.meSeen.y) - C.dist(me.x, me.y, v.meSeen.x, v.meSeen.y)) * 2.0;
      }
      //  ⚠ 마지막 행동으로 버튼을 밟으면 남은 불빛 한 행동이 상대에게 간다.
      if (v.lamp && nx === v.lamp.x && ny === v.lamp.y && v.ap <= 1) s -= 5;
      var edge = Math.min(nx, ny, W() - 1 - nx, H() - 1 - ny);
      if (edge === 0) s -= 0.3;
      if (g) {
        var cells = fan(nx, ny, d);
        for (var c = 0; c < cells.length; c++) {
          if (!tile(v, cells[c].x, cells[c].y)) s += 0.35;    // 새로 보게 될 칸
          s += g[cells[c].y][cells[c].x] * 3;                  // 상대가 있을 법한 칸을 비춘다
        }
      }
      if (s > bestScore) { bestScore = s; best = d; }
    }
    return best;
  }

  return { think: think, belief: belief, paths: paths,
           setMode: function (m) { mode = m === 'tutorial' ? 'tutorial' : 'normal'; },
           getMode: function () { return mode; } };
})();
