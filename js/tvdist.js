/* TV 시청거리 계산기 v0.01 — 순수 계산 + 화면.
 *
 * ■ 왜 만들었나 (2026-08-09 자동완성 실측, 32개)
 *   "tv 시청거리 계산" / "tv 크기 계산" / "55·65·75·85인치 tv 시청거리" —
 *   **답이 계산으로 떨어지는데 사람들이 매번 검색하고 있다.** 외부 데이터가 전혀 필요 없다.
 *   방금 낸 tv-size-guide.html 과 짝이 된다(평수 계산기↔원룸 평수 가이드와 같은 구조).
 *
 * ■ 계산 근거
 *   인치는 화면 **대각선**이다. 16:9 화면에서
 *     가로 = 대각선 × 16/√(16²+9²) = ×0.87157
 *     세로 = 대각선 × 9/√(16²+9²) = ×0.49026
 *   시청거리는 화질에 따라 다르다. 4K 는 픽셀이 촘촘해 더 가까이 앉아도 된다.
 *
 * ■ 계산 로직(TVD.*)은 화면과 분리해 tests/tvdist-test.mjs 가 파일에서 그대로 읽어 쓴다.
 */
(function (global) {
  'use strict';

  var CM_PER_INCH = 2.54;
  var DIAG_UNIT = Math.sqrt(16 * 16 + 9 * 9);      // = 18.3576...
  var KW = 16 / DIAG_UNIT;                          // 0.87157 — 대각선 대비 가로
  var KH = 9 / DIAG_UNIT;                           // 0.49026 — 대각선 대비 세로

  /* 화질별 권장 시청거리 배수 (대각선 기준).
     ⚠️ FHD 의 2~2.5배는 '픽셀이 안 보이는 거리'라 화질이 좋아지면 줄어든다.
        4K 에서 예전 기준을 그대로 쓰면 필요 이상으로 멀리 앉게 된다. */
  var RATIO = {
    "4k":  { min: 1.2, max: 1.5, label: "4K UHD" },
    "fhd": { min: 2.0, max: 2.5, label: "FHD (풀HD)" }
  };

  function diagCm(inch) { return inch * CM_PER_INCH; }
  function widthCm(inch) { return diagCm(inch) * KW; }
  function heightCm(inch) { return diagCm(inch) * KH; }

  /* 인치 → 권장 거리(cm) */
  function distanceFor(inch, q) {
    var r = RATIO[q] || RATIO["4k"];
    var d = diagCm(inch);
    return { min: d * r.min, max: d * r.max };
  }
  /* 거리(cm) → 권장 인치 — distanceFor 의 역함수 */
  function inchFor(distCm, q) {
    var r = RATIO[q] || RATIO["4k"];
    return { min: distCm / (CM_PER_INCH * r.max), max: distCm / (CM_PER_INCH * r.min) };
  }
  /* 놓을 자리 가로(cm) → 들어가는 최대 인치 (가로 = 인치 × 2.54 × 0.87157) */
  function maxInchForWidth(widthCmVal) { return widthCmVal / (CM_PER_INCH * KW); }

  /* 벽걸이 화면 중심 높이 — 앉았을 때 눈높이에 맞춘다.
     소파 좌면(기본 42cm) + 앉은 사람 눈높이(기본 70cm). */
  function mountCenterHeight(seatH, eyeH) {
    return (seatH == null ? 42 : seatH) + (eyeH == null ? 70 : eyeH);
  }
  /* 화면 아래쪽이 바닥에서 몇 cm 인가 (거치 위치 확인용) */
  function screenBottom(inch, centerH) { return centerH - heightCm(inch) / 2; }

  var STEPS = [32, 43, 50, 55, 65, 75, 85];
  function nearestStep(inch) {
    var best = STEPS[0];
    for (var i = 0; i < STEPS.length; i++) {
      if (Math.abs(STEPS[i] - inch) < Math.abs(best - inch)) best = STEPS[i];
    }
    return best;
  }
  /* 규격 인치 중 폭 안에 실제로 들어가는 가장 큰 것 (없으면 null) */
  function fitStep(widthCmVal) {
    var out = null;
    for (var i = 0; i < STEPS.length; i++) if (widthCm(STEPS[i]) <= widthCmVal) out = STEPS[i];
    return out;
  }
  function round1(n) { return Math.round(n * 10) / 10; }

  var TVD = {
    CM_PER_INCH: CM_PER_INCH, KW: KW, KH: KH, RATIO: RATIO, STEPS: STEPS,
    diagCm: diagCm, widthCm: widthCm, heightCm: heightCm,
    distanceFor: distanceFor, inchFor: inchFor, maxInchForWidth: maxInchForWidth,
    mountCenterHeight: mountCenterHeight, screenBottom: screenBottom,
    nearestStep: nearestStep, fitStep: fitStep, round1: round1
  };
  global.TVD = TVD;
  if (typeof module !== 'undefined' && module.exports) module.exports = TVD;

  /* ── 화면 (브라우저에서만) ───────────────────────────── */
  if (typeof document === 'undefined') return;

  function $(id) { return document.getElementById(id); }
  function num(el) { var v = parseFloat(el.value); return isFinite(v) && v > 0 ? v : 0; }
  function q() {
    var r = document.querySelector('input[name="tv-q"]:checked');
    return r ? r.value : '4k';
  }
  function m(cm) { return (cm / 100).toFixed(2) + 'm'; }

  function put(bigText, bigUnit, lines) {
    var out = $('tv-out');
    $('tv-big').textContent = bigText;
    $('tv-unit').textContent = bigUnit;
    var ul = $('tv-lines');
    ul.textContent = '';
    lines.forEach(function (t) {
      var li = document.createElement('li');
      li.textContent = t;
      ul.appendChild(li);
    });
    out.hidden = false;
  }
  function hide() { $('tv-out').hidden = true; }

  function calcInch() {
    var inch = num($('tv-inch'));
    if (!inch) return hide();
    var d = distanceFor(inch, q());
    put(m(d.min) + ' ~ ' + m(d.max), '권장 시청거리', [
      '화면 가로 ' + Math.round(widthCm(inch)) + 'cm · 세로 ' + Math.round(heightCm(inch)) + 'cm',
      '대각선 ' + round1(diagCm(inch)) + 'cm (' + inch + '인치)',
      '벽걸이라면 화면 중심을 바닥에서 약 ' + Math.round(mountCenterHeight()) + 'cm에',
      '거치대는 가로 ' + Math.round(widthCm(inch) + 10) + 'cm 이상을 권합니다'
    ]);
  }
  function calcDist() {
    var v = num($('tv-dist'));
    if (!v) return hide();
    var cm = $('tv-dist-unit').value === 'm' ? v * 100 : v;
    var r = inchFor(cm, q());
    var pick = nearestStep((r.min + r.max) / 2);
    put(Math.round(r.min) + '~' + Math.round(r.max), '인치', [
      '규격 중에서는 ' + pick + '인치가 가장 가깝습니다',
      pick + '인치의 화면 가로는 ' + Math.round(widthCm(pick)) + 'cm입니다',
      '거리 ' + m(cm) + ' 기준 · ' + (RATIO[q()] || RATIO['4k']).label
    ]);
  }
  function calcWidth() {
    var w = num($('tv-width'));
    if (!w) return hide();
    var maxI = maxInchForWidth(w);
    var fit = fitStep(w);
    put(fit ? String(fit) : '—', fit ? '인치까지' : '32인치도 안 들어갑니다', [
      '계산상 최대 ' + round1(maxI) + '인치 (가로 ' + Math.round(w) + 'cm 기준)',
      fit ? fit + '인치의 화면 가로는 ' + Math.round(widthCm(fit)) + 'cm입니다'
          : '가로 ' + Math.round(widthCm(32)) + 'cm 이상이 필요합니다',
      '베젤과 스탠드를 감안해 한 단계 아래를 고르면 안전합니다'
    ]);
  }

  function tab(name) {
    ['inch', 'dist', 'width'].forEach(function (k) {
      var p = $('tv-panel-' + k), b = $('tv-tab-' + k);
      if (p) p.hidden = (k !== name);
      if (b) b.classList.toggle('on', k === name);
    });
    hide();
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('tv-inch').addEventListener('input', calcInch);
    $('tv-dist').addEventListener('input', calcDist);
    $('tv-dist-unit').addEventListener('change', calcDist);
    $('tv-width').addEventListener('input', calcWidth);
    Array.prototype.forEach.call(document.querySelectorAll('input[name="tv-q"]'), function (r) {
      r.addEventListener('change', function () {
        if (!$('tv-panel-inch').hidden) calcInch();
        else if (!$('tv-panel-dist').hidden) calcDist();
      });
    });
    ['inch', 'dist', 'width'].forEach(function (k) {
      $('tv-tab-' + k).addEventListener('click', function () { tab(k); });
    });
    tab('inch');
  });
})(typeof window !== 'undefined' ? window : globalThis);
