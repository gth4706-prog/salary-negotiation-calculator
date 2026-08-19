window.GAME = window.GAME || {};
// ============================================================================
//  결정론 수학 — 실시간 대전(록스텝)의 초석.  (2026-08-19, P0)
//
//  왜 있나: IEEE-754 의 +,-,*,/,sqrt 는 어느 JS 엔진에서나 비트까지 같지만,
//  sin/cos/atan2 같은 초월함수는 **구현 정의**라 브라우저마다 마지막 비트가 다르다.
//  실측(2026-07-29 결정론 감사): node V8 ↔ Edge 사이에서 이 셋 때문에 전투 digest 가
//  갈렸다. 같은 전장을 두 기기가 나란히 굴리려면 이 셋을 사칙연산만으로 다시 만든다.
//
//  구현: fdlibm(Sun 의 고전 수학 라이브러리) 커널 이식.
//   · sin/cos — Cody-Waite 3단 π/2 감산 + 미니맥스 다항식 (|r|≤π/4)
//   · atan/atan2 — 구간 축소(비교·나눗셈) + 미니맥스 다항식
//  다항식 평가는 곱셈·덧셈뿐이라 엔진 무관 비트 동일이다.
//
//  ⚠ 정확도는 원본 Math 대비 ~1ulp 수준 — 게임 수치로는 동일하지만 **비트가 바뀌므로**
//    기존 회귀 기준선(R-1~R-5)이 미세하게 움직일 수 있다. 치환 후 regress 재확인이 필수.
//  ⚠ 시뮬 경로(js/combat.js)만 이걸 쓴다. 렌더는 원래 Math 를 쓴다(빠르고, 어긋나도
//    그림일 뿐이다). 입력 생성부도 원래 Math — 록스텝은 입력을 **데이터**로 주고받으므로
//    입력을 만드는 수학은 기기마다 달라도 된다.
// ============================================================================
GAME.DetMath = (function () {
  'use strict';

  //  ── Cody-Waite π/2 조각 (fdlibm) — k*조각 곱이 |k|<2^20 에서 정확하다 ──
  var PIO2_1 = 1.57079632673412561417e+00;   // π/2 상위 33비트
  var PIO2_1T = 6.07710050650619224932e-11;
  var PIO2_2 = 6.07710050630396597660e-11;
  var PIO2_2T = 2.02226624879595063154e-21;
  var INV_PIO2 = 6.36619772367581382433e-01; // 2/π

  //  sin 커널 계수 (|r| ≤ π/4)
  var S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03,
      S3 = -1.98412698298579493134e-04, S4 = 2.75573137070700676789e-06,
      S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10;
  //  cos 커널 계수
  var C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03,
      C3 = 2.48015872894767294178e-05, C4 = -2.75573143513906633035e-07,
      C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11;

  function kernSin(x, y) {
    var z = x * x, v = z * x;
    var r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
    return x - ((z * (0.5 * y - v * r) - y) - v * S1);
  }
  function kernCos(x, y) {
    var z = x * x;
    var r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
    var hz = 0.5 * z, w = 1.0 - hz;
    return w + (((1.0 - w) - hz) + (z * r - x * y));
  }

  //  x 를 [-π/4, π/4] 로 줄이고 사분면 번호를 준다. 게임 각도는 |x| < 1e5 안이라
  //  Cody-Waite 3단으로 충분하다(넘치면 안전하게 0 사분면 취급 — 게임에 그 각도는 없다).
  var _rr = { n: 0, hi: 0, lo: 0 };
  function reduce(x) {
    var fn = x * INV_PIO2;
    //  round-to-nearest — floor 는 엔진 무관 정확 연산이다.
    var n = (fn >= 0) ? ((fn + 0.5) | 0) : -((0.5 - fn) | 0);
    if (fn - n === 0.5 || n - fn === 0.5) { /* 경계는 어느 쪽이든 일관되면 된다 */ }
    var r = x - n * PIO2_1;
    var w = n * PIO2_1T;
    var hi = r - w;
    var t = r;
    w = n * PIO2_2;
    r = hi - w;
    var q = n * PIO2_2T - ((t - r) - w);
    _rr.n = n & 3; _rr.hi = r; _rr.lo = q;
    return _rr;
  }

  function dsin(x) {
    if (x !== x) return NaN;
    if (x > -7.85398163397448278999e-01 && x < 7.85398163397448278999e-01)
      return kernSin(x, 0);
    var rr = reduce(x);
    switch (rr.n) {
      case 0: return kernSin(rr.hi, rr.lo);
      case 1: return kernCos(rr.hi, rr.lo);
      case 2: return -kernSin(rr.hi, rr.lo);
      default: return -kernCos(rr.hi, rr.lo);
    }
  }
  function dcos(x) {
    if (x !== x) return NaN;
    if (x > -7.85398163397448278999e-01 && x < 7.85398163397448278999e-01)
      return kernCos(x < 0 ? -x : x, 0);
    var rr = reduce(x);
    switch (rr.n) {
      case 0: return kernCos(rr.hi, rr.lo);
      case 1: return -kernSin(rr.hi, rr.lo);
      case 2: return -kernCos(rr.hi, rr.lo);
      default: return kernSin(rr.hi, rr.lo);
    }
  }

  //  ── atan (fdlibm) ────────────────────────────────────────────────────────
  var atanhi = [4.63647609000806093515e-01, 7.85398163397448278999e-01,
                9.82793723247329054082e-01, 1.57079632679489655800e+00];
  var atanlo = [2.26987774529616870924e-17, 3.06161699786838301793e-17,
                1.39033110312309984516e-17, 6.12323399573676603587e-17];
  var aT = [3.33333333333329318027e-01, -1.99999999998764832476e-01,
            1.42857142725034663711e-01, -1.11111104054623557880e-01,
            9.09088713343650656196e-02, -7.69187620504482999495e-02,
            6.66107313738753120669e-02, -5.83357013379057348645e-02,
            4.97687799461593236017e-02, -3.65315727442169155270e-02,
            1.62858201153657823623e-02];

  function datan(x) {
    if (x !== x) return NaN;
    var neg = x < 0;
    if (neg) x = -x;
    var id, r;
    if (x < 0.4375) { id = -1; }
    else if (x < 0.6875) { id = 0; x = (2.0 * x - 1.0) / (2.0 + x); }
    else if (x < 1.1875) { id = 1; x = (x - 1.0) / (x + 1.0); }
    else if (x < 39.0)   { id = 2; x = (x - 1.5) / (1.0 + 1.5 * x); }
    else                 { id = 3; x = -1.0 / x; }
    var z = x * x, w = z * z;
    var s1 = z * (aT[0] + w * (aT[2] + w * (aT[4] + w * (aT[6] + w * (aT[8] + w * aT[10])))));
    var s2 = w * (aT[1] + w * (aT[3] + w * (aT[5] + w * (aT[7] + w * aT[9]))));
    if (id < 0) r = x - x * (s1 + s2);
    else r = atanhi[id] - ((x * (s1 + s2) - atanlo[id]) - x);
    return neg ? -r : r;
  }

  var PI = 3.14159265358979311600e+00;
  var PI_LO = 1.22464679914735320717e-16;

  function datan2(y, x) {
    if (x !== x || y !== y) return NaN;
    if (x === 1.0) return datan(y);
    if (x === 0) {
      if (y === 0) return (1 / y === -Infinity || 1 / x === -Infinity) ? PI : 0; // 관례 유지
      return y > 0 ? PI / 2 : -PI / 2;
    }
    if (y === 0) return x > 0 ? y : (1 / y === -Infinity ? -PI : PI);
    var z = datan(y / x >= 0 ? y / x : -(y / x));
    //  사분면 조립 — 비교와 덧셈만 쓴다.
    if (x > 0) return y > 0 ? z : -z;
    return y > 0 ? PI - (z - PI_LO) : (z - PI_LO) - PI;
  }

  return { sin: dsin, cos: dcos, atan2: datan2, atan: datan };
})();
