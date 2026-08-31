/* 근로소득세 근사 — 국세청 근로소득 간이세액표를 구간 선형보간으로 근사한다.
 *
 * 왜 근사인가: 실제 간이세액표는 급여구간 × 부양가족수의 2차원 표이고 매년 바뀐다.
 *   표 전체를 싣지 않고, 1인 가구 기준 대표점 7개를 잡아 그 사이를 직선으로 잇는다.
 *   ⚠️ 그래서 이 값은 **원천징수 어림값**이지 확정 세액이 아니다. 확정은 연말정산에서 난다.
 *   화면에서 반드시 그 사실을 밝힐 것.
 *
 * 원래 salary-calculator 의 app.js 안에 갇혀 있던 함수를 꺼내 공용 모듈로 만들었다.
 * 2026-08-31 재구축.
 */
(function (global) {
  'use strict';

  /* [연봉(만원), 월 원천징수 소득세(원)] — 1인 가구 기준 대표점 */
  var POINTS = [
    [0, 0], [2000, 12000], [3000, 63700], [5000, 303600],
    [7000, 600000], [10000, 1227800], [15000, 2600000],
  ];

  /* 월 지방소득세 = 소득세의 10% */
  var LOCAL_RATE = 0.1;

  /* 연봉(만원) -> 월 소득세(원). 표 밖(1.5억 초과)은 마지막 구간 기울기로 연장한다. */
  function incomeTax(annualManwon) {
    var man = annualManwon || 0;
    if (man <= 0) return 0;
    var last = POINTS[POINTS.length - 1];
    if (man >= last[0]) {
      var prev = POINTS[POINTS.length - 2];
      var slope = (last[1] - prev[1]) / (last[0] - prev[0]);
      return last[1] + slope * (man - last[0]);
    }
    for (var i = 0; i < POINTS.length - 1; i++) {
      var a = POINTS[i], b = POINTS[i + 1];
      if (man >= a[0] && man <= b[0]) {
        return a[1] + (b[1] - a[1]) * (man - a[0]) / (b[0] - a[0]);
      }
    }
    return 0;
  }

  function localTax(annualManwon) { return incomeTax(annualManwon) * LOCAL_RATE; }

  /* 월 세금 합계 (소득세 + 지방소득세) */
  function monthlyTax(annualManwon) {
    return incomeTax(annualManwon) + localTax(annualManwon);
  }

  var TAX = {
    POINTS: POINTS, LOCAL_RATE: LOCAL_RATE,
    incomeTax: incomeTax, localTax: localTax, monthlyTax: monthlyTax,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TAX;
  global.TAX = TAX;
})(typeof window !== 'undefined' ? window : globalThis);
