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
  //  ⚠ 절대 주소여야 한다. CSS 변수(--art, --floor, --splat)에 넣은 url() 은 크롬이 «변수를
  //    쓴 스타일시트(css/rooms.css)» 기준으로 풀어서, 상대 주소면 css/assets/… 로 가 404 가
  //    났다(실측: 마루·가구 그림이 전부 검게 나왔다). 문서 기준으로 미리 풀어 둔다.
  var BASE = (function () {
    try { var a = document.createElement('a'); a.href = 'assets/'; return a.href; } catch (e) { return 'assets/'; }
  })();
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

  //  방 바닥 — assets/rooms/<id>.jpg(또는 .png). 있으면 칸마다 제 조각을 --art 로 받는다(rooms.css).
  //  사진 같은 마루는 JPG 가 PNG 의 1/8 크기다(2MB 예산).
  function floor(board, roomId) {
    var ticket = board._floorTicket = (board._floorTicket || 0) + 1;
    board.classList.remove('has-floor');
    board.style.removeProperty('--floor');
    board.style.removeProperty('--floor-edge');
    probe('rooms/' + roomId + '.jpg', function (okJpg) {
      if (okJpg) { set('rooms/' + roomId + '.jpg'); return; }
      probe('rooms/' + roomId + '.png', function (okPng) { set(okPng ? 'rooms/' + roomId + '.png' : null); });
    });
    function set(path) {
      if (board._floorTicket !== ticket) return;
      board.classList.toggle('has-floor', !!path);
      board.style.setProperty('--floor', path ? 'url(' + BASE + path + ')' : 'none');
      board.style.removeProperty('--floor-edge');
      if (path) edges(BASE + path, function (e) { if (board._floorTicket === ticket) board.style.setProperty('--floor-edge', e); });
    }
  }
  //  내장 마루(SVG)의 윤곽 — svgart 가 심은 --floor-<id> 로부터. 판에 한 번.
  function floorEdgesBuiltin(board, roomId) {
    var ticket = board._builtinTicket = (board._builtinTicket || 0) + 1;
    board.style.removeProperty('--floor-edge-builtin');
    var v = getComputedStyle(document.body).getPropertyValue('--floor-' + roomId);
    if (!v) return;
    edges(v.trim(), function (e) { if (board._builtinTicket === ticket) board.style.setProperty('--floor-edge-builtin', e); });
  }

  //  가구 조각 — assets/furniture/<kind>-<w>x<h>.png (크기별), 없으면 <kind>.png.
  //  칸 하나가 알려지는 순간 불린다. 그림이 있으면 그 칸의 조각을 --art 로 넣는다.
  //  ⚠ 먼저 내장 SVG(svgart.js)를 깔고, 그림 파일이 있으면 그걸로 덮는다. 그래서
  //    파일이 하나도 없어도 «방»처럼 보인다. 크기별 파일을 먼저 찾는 이유: 같은 kind 라도
  //    1×2 서랍장과 3×1 수납장은 다른 그림이다(늘려 쓰면 찌그러진다).
  function tile(cell, t, roomId) {
    var ticket = cell._artTicket = (cell._artTicket || 0) + 1;
    cell.classList.remove('has-art');
    cell.style.removeProperty('--art'); cell.style.removeProperty('--edge');
    if (!t || t.kind === 'floor') return;
    var builtin = BO.SvgArt ? BO.SvgArt.furniture(t) : null;
    if (builtin) {
      cell.style.setProperty('--art', builtin + ' ' + slicePos(t.ox, t.oy, t.w, t.h));
      edges(builtin, function (e) { if (cell._artTicket === ticket && !cell.classList.contains('has-art')) cell.style.setProperty('--edge', e + ' ' + slicePos(t.ox, t.oy, t.w, t.h)); });
    }
    var sized = 'furniture/' + t.kind + '-' + t.w + 'x' + t.h + '.png', plain = 'furniture/' + t.kind + '.png';
    probe(sized, function (ok) {
      if (cell._artTicket !== ticket) return;
      if (ok) { use(sized); return; }
      probe(plain, function (ok2) { if (cell._artTicket !== ticket) return; if (ok2) use(plain); else cell.classList.remove('has-art'); });
    });
    function use(path) {
      if (cell._artTicket !== ticket) return;
      cell.classList.add('has-art');
      cell.style.setProperty('--art', slice(BASE + path, t.ox, t.oy, t.w, t.h));
      edges(BASE + path, function (e) { if (cell._artTicket === ticket) cell.style.setProperty('--edge', e + ' ' + slicePos(t.ox, t.oy, t.w, t.h)); });
    }
  }
  function slicePos(ox, oy, w, h) {
    var px = w > 1 ? (ox / (w - 1) * 100) : 0, py = h > 1 ? (oy / (h - 1) * 100) : 0;
    return px + '% ' + py + '% / ' + (w * 100) + '% ' + (h * 100) + '% no-repeat';
  }

  //  «종류가 하나»인 것들은 몸통(body)에 표시를 남기고 CSS 가 읽는다.
  function globals() {
    probe('sprites/splat-1.png', function (ok) { document.body.classList.toggle('has-splats', ok); });
    probe('sprites/lamp-off.png', function (ok) { document.body.classList.toggle('has-lamp', ok); });
    probe('sprites/kid-top.png', function (ok) { document.body.classList.toggle('has-kid', ok); });
    probe('sprites/kid-full.png', function (ok) { document.body.classList.toggle('has-kid-full', ok); });
    probe('sprites/footprint-me.png', function (ok) { document.body.classList.toggle('has-prints', ok); });
  }

  //  ── 윤곽 마스크 — 야광 페인트가 튄 자리에 «무엇이 있었는지» 선으로 드러난다 ─────
  //  그림 한 장을 캔버스에 그려 소벨(Sobel) 경계를 뽑고, 흰 선(알파 = 경계 세기)만 남긴
  //  PNG data URL 을 만든다. 칸 단위 슬라이스는 그림과 똑같은 식으로 한다. 한 장에 한 번.
  //  ⚠ 그림 파일·내장 SVG(data URL) 둘 다 같은 출처라 캔버스가 더럽혀지지 않는다.
  var edgeCache = {};
  function edges(url, cb) {
    if (edgeCache[url] !== undefined) { if (edgeCache[url]) cb(edgeCache[url]); return; }
    if (edgeCache[url + '#wait']) { edgeCache[url + '#wait'].push(cb); return; }
    edgeCache[url + '#wait'] = [cb];
    var img = new Image();
    img.onload = function () {
      var out = null;
      try { out = sobel(img); } catch (e) { out = null; }
      edgeCache[url] = out;
      var w = edgeCache[url + '#wait']; delete edgeCache[url + '#wait'];
      if (out) for (var i = 0; i < w.length; i++) w[i](out);
    };
    img.onerror = function () { edgeCache[url] = null; delete edgeCache[url + '#wait']; };
    img.src = url.replace(/^url\("?|"?\)$/g, '');
  }
  function sobel(img) {
    var W = Math.min(img.naturalWidth || img.width, 800), H = Math.min(img.naturalHeight || img.height, 800);
    if (!W || !H) return null;
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var g = c.getContext('2d'); g.drawImage(img, 0, 0, W, H);
    var d = g.getImageData(0, 0, W, H).data, lum = new Float32Array(W * H), i, x, y;
    for (i = 0; i < W * H; i++) lum[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) * (d[i * 4 + 3] / 255);
    var o = g.createImageData(W, H), od = o.data;
    for (y = 1; y < H - 1; y++) for (x = 1; x < W - 1; x++) {
      var p = y * W + x;
      var gx = -lum[p - W - 1] - 2 * lum[p - 1] - lum[p + W - 1] + lum[p - W + 1] + 2 * lum[p + 1] + lum[p + W + 1];
      var gy = -lum[p - W - 1] - 2 * lum[p - W] - lum[p - W + 1] + lum[p + W - 1] + 2 * lum[p + W] + lum[p + W + 1];
      var m = Math.sqrt(gx * gx + gy * gy) * 1.6;           // 세기 — 은은한 결도 살짝 보이게
      var a = m > 255 ? 255 : m;
      od[p * 4] = 255; od[p * 4 + 1] = 255; od[p * 4 + 2] = 255; od[p * 4 + 3] = a < 24 ? 0 : a;
    }
    g.putImageData(o, 0, 0);
    return 'url("' + c.toDataURL('image/png') + '")';
  }

  //  얼룩은 여러 장 중 하나를 좌표로 고른다 — 같은 칸은 늘 같은 얼룩.
  function splat(x, y) { return 'sprites/splat-' + (1 + ((x * 7 + y * 13) % 4)) + '.png'; }

  return { BASE: BASE, floor: floor, floorEdgesBuiltin: floorEdgesBuiltin, tile: tile, globals: globals, splat: splat, slice: slice, edges: edges };
})();
