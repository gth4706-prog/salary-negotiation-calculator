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
//    그림 속 책상 자리와 데이터의 책상 자리가 다르면 그림이 틀린 것이다.
//  ES5 · 의존성 없음.
// ============================================================================
BO.Art = (function () {
  var BASE = 'assets/';
  var found = {};     // 경로 → true/false (한 번 물어본 건 기억한다)
  var manifest = null, manifestState = 'idle', waiting = [];

  //  ── 목록을 먼저 읽는다 ────────────────────────────────────────────────
  //  `assets/manifest.json` 에 적힌 파일만 쓴다. 처음엔 파일을 하나하나 더듬었는데
  //  그러면 **접속마다 404 가 열다섯 개** 난다(브라우저 콘솔이 빨갛게 찬다, 실서버
  //  에선 헛요청). 목록 하나면 요청 한 번이다. 목록이 없으면 옛 방식으로 더듬는다 —
  //  그래서 「파일만 넣어도 된다」는 약속은 유지된다. 목록은
  //  `node blackout/tests/assets-manifest.js` 가 만들어 준다.
  function loadManifest(cb) {
    if (manifestState === 'done') { cb(); return; }
    waiting.push(cb);
    if (manifestState === 'loading') return;
    manifestState = 'loading';
    var finish = function (list) {
      manifest = list;                 // 배열이면 목록, null 이면 더듬기
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

  //  있으면 cb(true), 없으면 cb(false). 같은 파일은 한 번만 물어본다.
  function probe(path, cb) {
    loadManifest(function () {
      if (manifest) { cb(manifest.indexOf(path) >= 0); return; }   // 목록이 정답
      if (found[path] !== undefined) { cb(found[path]); return; }
      var img = new Image();
      img.onload = function () { found[path] = true; cb(true); };
      img.onerror = function () { found[path] = false; cb(false); };
      img.src = BASE + path;
    });
  }

  //  방 바닥 — assets/rooms/<id>.png (1000×1000, 격자 딱 맞춤). 있으면 격자 뒤에 깐다.
  function floor(board, roomId) {
    probe('rooms/' + roomId + '.png', function (ok) {
      board.classList.toggle('has-floor', ok);
      board.style.backgroundImage = ok ? 'url(' + BASE + 'rooms/' + roomId + '.png)' : '';
    });
  }

  //  가구 — assets/furniture/<kind>.png (가로 w칸 × 세로 h칸 비율, 투명 배경).
  //  있으면 CSS 로 그린 가구(<i><b>)를 숨기고 그림을 깐다.
  function furniture(el, kind) {
    probe('furniture/' + kind + '.png', function (ok) {
      el.classList.toggle('has-art', ok);
      el.style.backgroundImage = ok ? 'url(' + BASE + 'furniture/' + kind + '.png)' : '';
    });
  }

  //  얼룩·전등처럼 «종류가 하나»인 것들은 몸통(body)에 표시를 남기고 CSS 가 읽는다.
  function globals() {
    probe('sprites/splat-1.png', function (ok) { document.body.classList.toggle('has-splats', ok); });
    probe('sprites/lamp-off.png', function (ok) { document.body.classList.toggle('has-lamp', ok); });
    probe('sprites/kid-top.png', function (ok) { document.body.classList.toggle('has-kid', ok); });
    probe('sprites/footprint-me.png', function (ok) { document.body.classList.toggle('has-prints', ok); });
  }

  //  얼룩은 여러 장 중 하나를 좌표로 고른다 — 같은 칸은 늘 같은 얼룩(다시 그려도 안 흔들린다).
  function splat(x, y) { return 'sprites/splat-' + (1 + ((x * 7 + y * 13) % 4)) + '.png'; }

  return { BASE: BASE, floor: floor, furniture: furniture, globals: globals, splat: splat };
})();
