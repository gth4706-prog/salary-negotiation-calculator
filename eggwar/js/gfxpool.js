window.GAME = window.GAME || {};

// ============================================================================
//  Graphics 타원 그리기의 쓰레기 제거 (2026-08-05)
//
//  ── 왜 ─────────────────────────────────────────────────────────────────────
//  사용자 리포트: "난전에서 적군이 스킬을 남발할 때뿐만 아니라 **간헐적으로** 렉이
//  발생하네. 지켜보니까 스킬 남발할 때도 아니고 난전할 때도 아니야. 그냥 불규칙해."
//
//  실측(`tools/alloc-probe.js`, 폰 가로 25층):
//    · 프레임당 **719KB** 를 새로 할당하고 있었다 → GC 가 **0.3~0.5초마다** 돈다
//    · A/B 로 `draw()` 를 끄면 719 → 280KB (= 전장 그리기가 그 중 440KB)
//  부하와 무관하게 0.3초마다 멈추는 것 — 그것이 "그냥 불규칙"의 정체다.
//  (`tools/fps-real.js` 가 앞서 "느린 프레임의 부하 지표가 평균과 같다"고 잡아
//   둔 것과 정확히 맞물린다: 그릴 게 많아서가 아니라 **멈추는** 것이었다.)
//
//  ── 무엇이 만들었나 ────────────────────────────────────────────────────────
//  Phaser 3.80.1 의 `Graphics.fillEllipse` 원본(vendor/phaser.min.js 실물):
//      fillEllipse: function (x, y, w, h, n) {
//        void 0 === n && (n = 32);
//        var r = new Ellipse(x, y, w, h).getPoints(n);   // ← 여기
//        return this.fillPoints(r, true);
//      }
//  **호출 한 번마다** Ellipse 객체 1개 + 배열 1개 + Point 객체 **32개**를 만든다.
//  이 게임의 그림은 계란 — 즉 거의 전부가 타원이다. 유닛 한 기가 접지 그림자만
//  2개, 몸·눈·장비까지 더하면 프레임당 타원 호출이 수백 번이다. 그게 곧 수백 KB다.
//
//  ⚠ `fillCircle` 은 해당 없다. 원본이 `beginPath → arc → fillPath` 로 **명령
//    버퍼에 숫자만 넣는다**(Point 배열을 안 만든다). 그래서 여기서는 안 건드린다 —
//    안 새는 곳까지 갈아엎으면 위험만 늘고 얻는 게 없다.
//
//  ── 어떻게 고쳤나 ──────────────────────────────────────────────────────────
//  `fillPoints`/`strokePoints` 원본을 보면 배열을 **읽기만 한다**(moveTo/lineTo 로
//  명령 버퍼에 옮겨 담고 끝. 참조를 붙들지 않는다). 그러니 배열과 Point 를
//  **매번 새로 만들 이유가 없다** — 분할 수(smoothness)마다 하나씩 두고 값만 덮어쓴다.
//
//  ⚠ 재진입 걱정 없음: 점을 채우고 `fillPoints` 를 부르는 사이에 다른 그리기가
//    끼어들 수 없다(동기 호출이고 그 안에서 타원을 다시 그리지 않는다).
//  ⚠ **그림이 한 픽셀도 달라지면 안 된다.** 점 좌표 계산은 Phaser 의 것과 같은 식이다:
//        angle = 2π · i/n,  x = cx + (w/2)·cos(angle),  y = cy + (h/2)·sin(angle)
//    같은 값을 내는지는 짐작이 아니라 **실행 중에 대조해서** 확인한다 —
//    `GAME.GfxPool.verify()` 가 Phaser 원본 `getPoints` 와 좌표를 맞대 본다.
//    `tools/predeploy-check.sh` 와 `tools/phone-shot.js` 가 이 함수를 부른다.
// ============================================================================
(function () {
  if (typeof Phaser === 'undefined' || !Phaser.GameObjects || !Phaser.GameObjects.Graphics) return;
  var P = Phaser.GameObjects.Graphics.prototype;
  if (P.__ellipsePooled) return;

  //  분할 수마다 버퍼 하나. 이 게임이 실제로 쓰는 값은 몇 종류뿐이라 금방 수렴한다.
  var POOL = {};
  function buf(n) {
    var a = POOL[n];
    if (!a) {
      a = POOL[n] = new Array(n);
      for (var i = 0; i < n; i++) a[i] = { x: 0, y: 0 };
    }
    return a;
  }

  function points(x, y, w, h, n) {
    //  분할 수가 3 미만이면 `fillPoints` 가 `t[0].x` 에서 터진다(원본도 똑같이 터진다 —
    //  `getPoints(0)` 이 빈 배열을 준다). 이 저장소에서 그리기 예외 한 줄은 Phaser
    //  업데이트 루프를 통째로 죽이므로(v1.58 수성의 탑 정지) 여기서 막아 둔다.
    //  n<3 으로 부르는 자리는 어차피 이미 깨진 호출이라, 삼각형으로 바꿔도 잃을 게 없다.
    if (!(n >= 3)) n = 3;
    var a = buf(n), hw = w / 2, hh = h / 2;
    var step = (Math.PI * 2) / n, t = 0;
    for (var i = 0; i < n; i++) {
      a[i].x = x + hw * Math.cos(t);
      a[i].y = y + hh * Math.sin(t);
      t += step;
    }
    return a;
  }

  // ── 분할 수를 **크기에서** 정한다 (2026-08-07) ─────────────────────────────
  //  Phaser 기본값은 크기와 무관하게 32 다. 그런데 이 게임의 유닛은 폰에서
  //  25~33px 이고, 그 안의 눈·그림자·장비는 8~20px 짜리 타원이다.
  //  8px 타원을 32조각으로 나누면 한 조각이 0.8px — **화면에 없는 정밀도**를
  //  프레임마다 3만 번씩 계산하고 있었다(실측: 프레임당 타원 호출 360회).
  //
  //  ⚠ **"안 보인다"를 짐작하지 않고 픽셀로 답했다.** 다각형이 진짜 타원에서
  //    벗어나는 최대 거리(사지타) = r·(1−cos(π/n)). 폰 DPR 3 환산:
  //        크기        지금(32분할)   이 규칙
  //        8×6         0.06 기기px    8분할  0.91
  //        20×24       0.17           18분할 0.55
  //        80×60       0.58           32분할 0.58 (그대로)
  //        200×120     1.44           32분할 1.44 (그대로)
  //    즉 **가장 나빠지는 경우(0.91)도 지금 이미 나가고 있는 최악(1.44)보다 낫다.**
  //    큰 타원은 상한 32 에 걸려 한 톨도 안 바뀐다 — 눈에 띄는 곳은 안 건드린다.
  //
  //  ⚠ 분할 수를 **명시로 넘기는 호출은 그대로 존중한다**(`js/bossart.js` 가 8~12 로
  //    이미 낮춰 부른다). 여기서 덮으면 남이 실측으로 잡아 둔 값을 지우게 된다.
  var SEG_PX = 4;      // 한 조각이 대략 이 길이(설계px)가 되게
  var MIN_N = 8;       // 아무리 작아도 팔각형 밑으로는 안 간다
  var MAX_N = 32;      // Phaser 기본값 — 이보다 곱게 만들지 않는다
  function autoN(w, h) {
    //  둘레 근사 π·(w+h)/2. 정확한 타원 둘레가 필요 없다 — 조각 수를 정하는 데만 쓴다.
    var per = Math.PI * (Math.abs(w) + Math.abs(h)) * 0.5;
    var n = Math.ceil(per / SEG_PX);
    return n < MIN_N ? MIN_N : (n > MAX_N ? MAX_N : n);
  }

  P.fillEllipse = function (x, y, w, h, smoothness) {
    if (smoothness === undefined) smoothness = autoN(w, h);
    return this.fillPoints(points(x, y, w, h, smoothness), true);
  };
  P.strokeEllipse = function (x, y, w, h, smoothness) {
    if (smoothness === undefined) smoothness = autoN(w, h);
    return this.strokePoints(points(x, y, w, h, smoothness), true);
  };
  //  ...Shape 판도 같이 갈아준다. 원본은 `shape.getPoints(n)` 를 부르므로 그냥 두면
  //  이 경로로 들어오는 호출만 계속 쓰레기를 만든다.
  P.fillEllipseShape = function (e, smoothness) {
    return this.fillEllipse(e.x, e.y, e.width, e.height, smoothness);
  };
  P.strokeEllipseShape = function (e, smoothness) {
    return this.strokeEllipse(e.x, e.y, e.width, e.height, smoothness);
  };
  P.__ellipsePooled = true;

  //  ── 대조 검사 ────────────────────────────────────────────────────────────
  //  "같은 식으로 썼으니 같겠지"는 근거가 아니다. Phaser 원본 `Ellipse.getPoints`
  //  와 좌표를 직접 맞대 본다. 어긋나면 그림이 달라졌다는 뜻이므로 배포를 막아야 한다.
  GAME.GfxPool = {
    verify: function () {
      if (!Phaser.Geom || !Phaser.Geom.Ellipse) return { ok: false, why: 'Phaser.Geom.Ellipse 없음' };
      var cases = [
        [0, 0, 10, 10, 32], [13.5, -7.25, 40, 18, 32],
        [200, 120, 3, 3, 8], [-40, 80, 100, 100, 12], [7, 7, 55.5, 22.25, 24]
      ];
      var worst = 0, n = 0;
      for (var ci = 0; ci < cases.length; ci++) {
        var c = cases[ci];
        var real = new Phaser.Geom.Ellipse(c[0], c[1], c[2], c[3]).getPoints(c[4]);
        var mine = points(c[0], c[1], c[2], c[3], c[4]);
        if (real.length !== mine.length) return { ok: false, why: '개수 다름 ' + real.length + '/' + mine.length };
        for (var i = 0; i < real.length; i++) {
          worst = Math.max(worst, Math.abs(real[i].x - mine[i].x), Math.abs(real[i].y - mine[i].y));
          n++;
        }
      }
      //  부동소수 오차만 허용한다. 1e-9 는 화면 픽셀로 옮기면 0 이다.
      if (!(worst < 1e-9)) return { ok: false, worst: worst, points: n, why: '좌표가 원본과 다름' };

      //  ── 분할 수 규칙 검사 (2026-08-07) ──────────────────────────────────
      //  ⚠ 위 대조는 "주어진 n 에서 좌표가 맞는가"만 본다. **n 을 스스로 고르기
      //    시작했으므로 그 선택도 검사해야 한다** — 안 그러면 규칙이 조용히 어긋나도
      //    (예: SEG_PX 를 20 으로 바꿔 놓아도) 이 함수는 계속 초록불이다.
      //  판정 기준은 "지금 이미 나가고 있는 최악보다 나쁘지 않은가"다. 큰 타원은
      //  32 에 걸려 지금과 똑같으므로, 그 값이 곧 허용선이다.
      function sagitta(r, k) { return r * (1 - Math.cos(Math.PI / k)); }
      var BIG = 200, BIGH = 120;                       // 이 게임에서 가장 큰 타원 계열
      var bar = sagitta(Math.max(BIG, BIGH) / 2, autoN(BIG, BIGH));
      var sizes = [[6, 4], [8, 6], [12, 10], [16, 20], [20, 24], [34, 40],
                   [60, 40], [80, 60], [140, 90], [BIG, BIGH]];
      var worstSag = 0, worstAt = '';
      for (var si = 0; si < sizes.length; si++) {
        var w2 = sizes[si][0], h2 = sizes[si][1];
        var k = autoN(w2, h2);
        if (!(k >= MIN_N && k <= MAX_N)) {
          return { ok: false, why: '분할 수가 범위 밖 ' + w2 + 'x' + h2 + ' → ' + k };
        }
        var s = sagitta(Math.max(w2, h2) / 2, k);
        if (s > worstSag) { worstSag = s; worstAt = w2 + 'x' + h2 + '(' + k + '분할)'; }
      }
      if (worstSag > bar) {
        return { ok: false, why: '오차가 기존 최악(' + bar.toFixed(3) + 'px)을 넘음 — ' +
                                 worstAt + ' ' + worstSag.toFixed(3) + 'px' };
      }
      return { ok: true, worst: worst, points: n,
               sag: worstSag, sagBar: bar, sagAt: worstAt };
    },

    //  도구가 절감량을 잴 수 있게 규칙을 밖에서도 부를 수 있게 둔다.
    autoN: function (w, h) { return autoN(w, h); }
  };
})();
