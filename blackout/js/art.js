window.BO = window.BO || {};

// ============================================================================
//  블랙아웃 — **그림 끼우기**. 있으면 쓰고, 없으면 CSS 시험 자산으로 논다.
//
//  왜 이런 식인가: 그림은 사람(또는 다른 AI)이 나중에 채운다. 그때마다 코드를
//  고치게 하고 싶지 않다. 파일을 `assets/` 에 넣기만 하면 여기서 알아서 찾아 쓰고,
//  없으면 지금처럼 CSS 로 그린다. 그래서 그림이 반만 있어도 게임이 깨지지 않는다.
//
//  ⚠ 그림은 **보이는 것만** 바꾼다. 어느 칸이 막혔는지·어디를 쏠 수 있는지는
//    `rooms.js` 의 데이터가 정하고 그림은 거기에 맞춰 얹힌다. 거꾸로가 아니다.
//
//  ── v0.5: 그림은 **칸 단위로 잘라** 붙인다 ──────────────────────────────
//  가구는 시야에 들어온 칸만 보이고, 얼룩은 그 칸의 그림을 얼룩 모양으로 뚫어
//  보여 준다. 그래서 「책상 그림 한 장」을 통째로 깔 수 없다 — 칸마다 그 칸에
//  해당하는 조각만 보여야 한다. background-size/position 으로 자른다.
//  ES5 · 의존성 없음.
// ============================================================================
BO.Art = (function () {
  var BASE = 'assets/';
  var found = {};     // 경로 → true/false (한 번 물어본 건 기억한다)
  var manifest = null, manifestState = 'idle', waiting = [];

  //  `assets/manifest.json` 에 적힌 파일만 쓴다(접속마다 404 를 열다섯 개 내지 않으려고).
  //  목록이 없으면 옛 방식으로 더듬는다 — 「파일만 넣어도 된다」는 약속은 유지된다.
  //  목록은 `node blackout/tests/assets-manifest.js` 가 만들어 준다.
  function loadManifest(cb) {
    if (manifestState === 'done') { cb(); return; }
    waiting.push(cb);
    if (manifestState === 'loading') return;
    manifestState = 'loading';
    var finish = function (list) {
      manifest = list;
      manifestState = 'done';
      var w = waiting; waiting = [];
      for (var i = 0; i < w.length; i++) w[i]();
    };
    if (typeof fetch !== 'function') { finish(null); return; }
    fetch(BASE + 'manifest.json', { cache: 'no-cache' }).then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (j) {
      finish(j && j.files && j.files.length !== undefined ? j.files : null);
    })['catch'](function () { finish(null); });
  }

  function probe(path, cb) {
    loadManifest(function () {
      if (manifest) { cb(manifest.indexOf(path) >= 0); return; }
      if (found[path] !== undefined) { cb(found[path]); return; }
      var img = new Image();
      img.onload = function () { found[path] = true; cb(true); };
      img.onerror = function () { found[path] = false; cb(false); };
      img.src = BASE + path;
    });
  }

  //  칸 단위 자르기: 가로 w 칸짜리 그림에서 ox 번째 칸을 보이려면
  //  background-size 를 w×100% 로 두고 position 을 ox/(w-1)×100% 로 둔다(퍼센트
  //  위치는 «남는 공간» 기준이라 이 식이 맞다. w=1 이면 0).
  function slice(url, ox, oy, w, h) {
    var px = w > 1 ? (ox / (w - 1) * 100) : 0, py = h > 1 ? (oy / (h - 1) * 100) : 0;
    return 'url(' + url + ') ' + px + '% ' + py + '% / ' + (w * 100) + '% ' + (h * 100) + '% no-repeat';
  }

  //  방 바닥 — assets/rooms/<id>.png. 있으면 칸마다 제 조각을 --art 로 받는다(rooms.css).
  function floor(board, roomId) {
    probe('rooms/' + roomId + '.png', function (ok) {
      board.classList.toggle('has-floor', ok);
      board.style.setProperty('--floor', ok ? 'url(' + BASE + 'rooms/' + roomId + '.png)' : 'none');
    });
  }

  //  가구 조각 — assets/furniture/<kind>.png (가로 w칸 × 세로 h칸 비율, 투명 배경).
  //  칸 하나가 알려지는 순간 불린다. 그림이 있으면 그 칸의 조각을 --art 로 넣는다.
  function tile(cell, t, roomId) {
    cell.style.removeProperty('--art');
    if (!t || t.kind === 'floor') return;
    var path = 'furniture/' + t.kind + (t.w > 1 && t.h === 1 && t.kind === 'cabinet' && t.w >= 3 ? '-wide' : '') + '.png';
    probe(path, function (ok) {
      cell.classList.toggle('has-art', ok);
      if (ok) cell.style.setProperty('--art', slice(BASE + path, t.ox, t.oy, t.w, t.h));
    });
  }

  //  «종류가 하나»인 것들은 몸통(body)에 표시를 남기고 CSS 가 읽는다.
  function globals() {
    probe('sprites/splat-1.png', function (ok) { document.body.classList.toggle('has-splats', ok); });
    probe('sprites/lamp-off.png', function (ok) { document.body.classList.toggle('has-lamp', ok); });
    probe('sprites/kid-top.png', function (ok) { document.body.classList.toggle('has-kid', ok); });
    probe('sprites/footprint-me.png', function (ok) { document.body.classList.toggle('has-prints', ok); });
  }

  //  얼룩은 여러 장 중 하나를 좌표로 고른다 — 같은 칸은 늘 같은 얼룩.
  function splat(x, y) { return 'sprites/splat-' + (1 + ((x * 7 + y * 13) % 4)) + '.png'; }

  return { BASE: BASE, floor: floor, tile: tile, globals: globals, splat: splat, slice: slice };
})();
