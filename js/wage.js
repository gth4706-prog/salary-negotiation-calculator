/* 주휴수당·최저임금 계산기 v0.01
 *
 * ■ 왜 만들었나 (2026-08-09 자동완성 실측, 38개)
 *   "주휴수당 계산기 / 조건 / 포함 시급", "최저임금 계산기 2026".
 *   ⚠️ 실업급여 도구가 최저임금을 **상수로만** 쓰고 있어 겹치지 않는다(하한액 근거).
 *
 * ■ 근거
 *   · 2026년 최저임금 시급 10,320원 (이 프로젝트에서 이미 검증한 값 — 실업급여 하한액 근거와 동일)
 *   · 주휴수당(근로기준법 제55조): 1주 소정근로시간 **15시간 이상** + 소정근로일 개근 시
 *     1주에 평균 1회 이상 유급휴일. 40시간 미만이면 **비례** 지급한다.
 *       주휴시간 = (1주 소정근로시간 ÷ 40) × 8   ← 40시간을 넘어도 8시간이 상한
 *   · 월 환산 209시간 = (40 + 8) × (365 ÷ 7 ÷ 12) = 48 × 4.345 ≈ 208.57 → 209
 *
 * ■ 주휴수당은 **연장·야간 가산과 무관**하다. 소정근로시간 기준이라 초과근무를 많이 해도
 *   주휴시간은 8시간을 넘지 않는다. 이걸 헷갈리는 검색어가 많아 화면에서도 밝힌다.
 */
(function (global) {
  'use strict';

  var MIN_WAGE = { 2026: 10320, 2025: 10030 };   // 시급(원)
  var FULL_WEEK = 40;                            // 법정 1주 소정근로시간
  var HOLIDAY_MAX = 8;                           // 주휴 상한(시간)
  var WEEKS_PER_MONTH = 365 / 7 / 12;            // 4.3452...

  function minWage(year) { return MIN_WAGE[year] || MIN_WAGE[2026]; }

  /* 주휴수당 대상인가 — 주 15시간 이상 + 개근 */
  function eligible(weeklyHours, perfect) {
    return { hours: weeklyHours >= 15, perfect: perfect !== false,
             ok: weeklyHours >= 15 && perfect !== false };
  }

  /* 주휴시간 = (주 소정근로시간 ÷ 40) × 8, 상한 8시간. 15시간 미만이면 0. */
  function holidayHours(weeklyHours) {
    if (!weeklyHours || weeklyHours < 15) return 0;
    return Math.min(HOLIDAY_MAX, (weeklyHours / FULL_WEEK) * HOLIDAY_MAX);
  }
  function holidayPay(hourly, weeklyHours) { return (hourly || 0) * holidayHours(weeklyHours); }

  /* 주급 = 시급 × 근로시간 + 주휴수당 */
  function weeklyPay(hourly, weeklyHours) {
    return (hourly || 0) * (weeklyHours || 0) + holidayPay(hourly, weeklyHours);
  }
  /* 월급 환산 — 주급 × 4.345 (한 달을 4주로 보면 실제보다 적게 나온다) */
  function monthlyPay(hourly, weeklyHours) {
    return weeklyPay(hourly, weeklyHours) * WEEKS_PER_MONTH;
  }
  /* 주휴 포함 실질 시급 — 주 40시간이면 시급의 1.2배가 된다 */
  function effectiveHourly(hourly, weeklyHours) {
    if (!weeklyHours) return 0;
    return weeklyPay(hourly, weeklyHours) / weeklyHours;
  }
  /* 최저임금 월 환산(주 40시간 기준) = 시급 × 209
     ⚠️ 209 는 208.57 의 **반올림**이다. 그래서 정확 환산(주급 × 4.345)보다 조금 크다.
        2026년 주 40시간 기준으로 2,156,880 vs 2,152,457 — 약 4,400원 차이.
        고시·근로계약서는 관행적으로 209 를 쓰므로 **둘 다 보여주고 차이를 밝힌다.**
        (테스트가 이 불일치를 잡아냈다. 한쪽으로 뭉개지 않는다.) */
  var MONTHLY_HOURS_STD = 209;
  function monthlyMinimum(year) { return minWage(year) * MONTHLY_HOURS_STD; }
  /* 209시간 기준 월급 — 주 40시간 근무자에게 실무에서 쓰는 값 */
  function monthlyPay209(hourly) { return (hourly || 0) * MONTHLY_HOURS_STD; }

  /* 지급받는 시급이 최저임금에 미달하는가 */
  function belowMinimum(hourly, year) { return (hourly || 0) < minWage(year); }

  var WAGE = {
    MIN_WAGE: MIN_WAGE, FULL_WEEK: FULL_WEEK, HOLIDAY_MAX: HOLIDAY_MAX,
    WEEKS_PER_MONTH: WEEKS_PER_MONTH, MONTHLY_HOURS_STD: MONTHLY_HOURS_STD,
    minWage: minWage, eligible: eligible, holidayHours: holidayHours, holidayPay: holidayPay,
    weeklyPay: weeklyPay, monthlyPay: monthlyPay, effectiveHourly: effectiveHourly,
    monthlyMinimum: monthlyMinimum, monthlyPay209: monthlyPay209,
    belowMinimum: belowMinimum
  };
  global.WAGE = WAGE;
  if (typeof module !== 'undefined' && module.exports) module.exports = WAGE;

  /* ── 화면 ─────────────────────────────────────────── */
  if (typeof document === 'undefined') return;

  function $(id) { return document.getElementById(id); }
  function n(el) { var v = parseFloat(String(el.value).replace(/,/g, '')); return isFinite(v) && v > 0 ? v : 0; }
  function won(x) { return Math.round(x).toLocaleString() + '원'; }
  function hr(x) { return (Math.round(x * 10) / 10) + '시간'; }

  function calc() {
    var hourly = n($('wg-hourly')) || minWage(2026);
    var hours = n($('wg-hours'));
    var out = $('wg-out'), warn = $('wg-warn');
    warn.hidden = true;
    if (!hours) { out.hidden = true; return; }

    var el = eligible(hours, true);
    if (!el.hours) {
      warn.textContent = '주 ' + hours + '시간 — 15시간 미만이라 주휴수당 대상이 아닙니다. '
                       + '4주를 평균해 15시간을 넘으면 대상이 됩니다.';
      warn.hidden = false;
    } else if (belowMinimum(n($('wg-hourly')), 2026) && n($('wg-hourly'))) {
      warn.textContent = '입력한 시급이 2026년 최저임금 ' + won(minWage(2026)) + '보다 낮습니다.';
      warn.hidden = false;
    }

    $('wg-monthly').textContent = won(monthlyPay(hourly, hours));
    var ul = $('wg-lines');
    ul.textContent = '';
    [
      '주급 ' + won(weeklyPay(hourly, hours)) + ' (근로 ' + hr(hours) + ' + 주휴 ' + hr(holidayHours(hours)) + ')',
      '주휴수당 ' + won(holidayPay(hourly, hours)) + ' — ' + (holidayHours(hours) ? '(' + hours + ' ÷ 40) × 8시간분' : '대상 아님'),
      '주휴 포함 실질 시급 ' + won(effectiveHourly(hourly, hours)),
      '월 환산은 주급 × 4.345입니다 (4주로 곱하면 적게 나옵니다)',
      hours === 40 ? '근로계약서에서 흔히 쓰는 209시간 기준으로는 ' + won(monthlyPay209(hourly))
                   + ' — 209는 208.57의 반올림이라 조금 큽니다' : '',
      '세전 금액입니다. 4대보험·소득세는 별도로 공제됩니다'
    ].filter(Boolean).forEach(function (t) {
      var li = document.createElement('li'); li.textContent = t; ul.appendChild(li);
    });
    out.hidden = false;
  }

  document.addEventListener('DOMContentLoaded', function () {
    ['wg-hourly', 'wg-hours'].forEach(function (id) {
      var el = $(id);
      if (el) { el.addEventListener('input', calc); el.addEventListener('change', calc); }
    });
    var q = $('wg-quick');
    if (q) {
      q.addEventListener('click', function (e) {
        var b = e.target.closest('[data-h]');
        if (!b) return;
        $('wg-hours').value = b.getAttribute('data-h');
        calc();
      });
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
