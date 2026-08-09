/* 퇴직금 계산기 v0.01 — 법정 공식 그대로.
 *
 * ■ 왜 만들었나 (2026-08-09 자동완성 실측, 40개)
 *   "퇴직금 계산기"가 1순위. "세전 세후 / 통상임금 / 알바 / 계산 방법"이 뒤를 잇는다.
 *   ⚠️ 기존 퇴사 타이밍 도구(resignation.js)에도 퇴직금이 있지만 **근사치**다
 *      (코드 주석에 "세후 월급 × 근속연수로 근사"라고 적혀 있다).
 *      여기서는 근로자퇴직급여 보장법의 실제 공식으로 계산한다. 역할이 다르다 —
 *      저쪽은 "언제 나가야 하나", 여기는 "얼마 받나".
 *
 * ■ 공식 (근로자퇴직급여 보장법 제8조)
 *     퇴직금 = 1일 평균임금 × 30일 × (재직일수 ÷ 365)
 *     1일 평균임금 = 퇴직 전 3개월 임금총액 ÷ 그 3개월의 총일수
 *     임금총액 = 3개월 급여 + 연간 상여금 × 3/12 + 연차수당 × 3/12
 *   ⚠️ 근로기준법 제2조 ②: **평균임금이 통상임금보다 적으면 통상임금을 평균임금으로 한다.**
 *      이 보정을 빼먹으면 실제보다 적게 나온다.
 *
 * ■ 세금은 계산하지 않는다. 퇴직소득세는 근속연수공제·환산급여공제를 거쳐 정해지는데
 *   공제표를 정확히 모른 채 숫자를 내면 틀린 금액을 주게 된다. 세전만 내고 그 사실을 밝힌다.
 */
(function (global) {
  'use strict';

  var MS_DAY = 86400000;

  function parseDate(s) {
    if (!s) return null;
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(s).trim());
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    var dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return dt;
  }
  function daysBetween(a, b) { return Math.round((b - a) / MS_DAY); }

  /* 퇴직일에서 3개월 전 날짜 — 그 달에 같은 일자가 없으면 말일로 맞춘다(1/31 → 10/31). */
  function minusMonths(d, n) {
    var y = d.getUTCFullYear(), m = d.getUTCMonth() - n, day = d.getUTCDate();
    var t = new Date(Date.UTC(y, m, 1));
    var last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
    return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), Math.min(day, last)));
  }

  /* 퇴직 전 3개월의 총일수 — 달마다 다르다(89~92일). 여기서 평균임금이 갈린다. */
  function periodDays(leaveDate) { return daysBetween(minusMonths(leaveDate, 3), leaveDate); }

  /* 재직일수 = 퇴직일 - 입사일 (퇴직일 = 마지막 근무일의 다음 날) */
  function servedDays(hire, leave) { return daysBetween(hire, leave); }

  /* 퇴직금 지급 대상인가 — 1년 이상 계속근로 + 주 15시간 이상 */
  function eligible(days, weeklyHours) {
    return { years: days >= 365, hours: weeklyHours == null || weeklyHours >= 15,
             ok: days >= 365 && (weeklyHours == null || weeklyHours >= 15) };
  }

  /* 1일 평균임금.
     pay3: 3개월 급여 합계(원) / bonus: 연간 상여금 / leavePay: 연차수당
     ordinaryDaily: 1일 통상임금(있으면 하한으로 적용) */
  function dailyAverage(pay3, bonus, leavePay, days, ordinaryDaily) {
    if (!days) return 0;
    var total = (pay3 || 0) + (bonus || 0) * 3 / 12 + (leavePay || 0) * 3 / 12;
    var avg = total / days;
    if (ordinaryDaily && ordinaryDaily > avg) return ordinaryDaily;   // 근로기준법 제2조 ②
    return avg;
  }
  /* 통상임금 보정이 실제로 걸렸는지 — 화면에서 그 사실을 알려주기 위해 따로 본다 */
  function usedOrdinary(pay3, bonus, leavePay, days, ordinaryDaily) {
    if (!days || !ordinaryDaily) return false;
    var raw = ((pay3 || 0) + (bonus || 0) * 3 / 12 + (leavePay || 0) * 3 / 12) / days;
    return ordinaryDaily > raw;
  }

  function severance(dailyAvg, served) { return dailyAvg * 30 * (served / 365); }

  var SEV = {
    parseDate: parseDate, daysBetween: daysBetween, minusMonths: minusMonths,
    periodDays: periodDays, servedDays: servedDays, eligible: eligible,
    dailyAverage: dailyAverage, usedOrdinary: usedOrdinary, severance: severance
  };
  global.SEV = SEV;
  if (typeof module !== 'undefined' && module.exports) module.exports = SEV;

  /* ── 화면 ─────────────────────────────────────────── */
  if (typeof document === 'undefined') return;

  function $(id) { return document.getElementById(id); }
  function n(el) { var v = parseFloat(String(el.value).replace(/,/g, '')); return isFinite(v) && v > 0 ? v : 0; }
  function won(x) { return Math.round(x).toLocaleString() + '원'; }

  function calc() {
    var hire = parseDate($('sv-hire').value), leave = parseDate($('sv-leave').value);
    var out = $('sv-out'), warn = $('sv-warn');
    warn.hidden = true;
    if (!hire || !leave || leave <= hire) { out.hidden = true; return; }

    var served = servedDays(hire, leave);
    var pdays = periodDays(leave);
    var monthly = n($('sv-monthly'));
    var pay3 = monthly * 3;
    var bonus = n($('sv-bonus')), lp = n($('sv-leavepay'));
    var ordM = n($('sv-ordinary'));
    var ordDaily = ordM ? ordM * 3 / pdays : 0;   // 월 통상임금 → 1일 환산(같은 기간 기준)

    var el = eligible(served, null);
    if (!el.years) {
      warn.textContent = '재직일수 ' + served + '일 — 1년(365일) 미만이라 법정 퇴직금 대상이 아닙니다.';
      warn.hidden = false;
    }
    if (!pay3) { out.hidden = true; return; }

    var avg = dailyAverage(pay3, bonus, lp, pdays, ordDaily);
    var amt = severance(avg, served);
    var usedOrd = usedOrdinary(pay3, bonus, lp, pdays, ordDaily);

    $('sv-amount').textContent = won(amt);
    var ul = $('sv-lines');
    ul.textContent = '';
    [
      '재직일수 ' + served.toLocaleString() + '일 (약 ' + (served / 365).toFixed(2) + '년)',
      '퇴직 전 3개월 총일수 ' + pdays + '일',
      '1일 평균임금 ' + won(avg) + (usedOrd ? ' — 통상임금이 더 커서 통상임금으로 계산했습니다' : ''),
      '계산식: ' + won(avg) + ' × 30일 × (' + served + ' ÷ 365)',
      '세전 금액입니다. 퇴직소득세는 별도로 공제됩니다'
    ].forEach(function (t) {
      var li = document.createElement('li'); li.textContent = t; ul.appendChild(li);
    });
    out.hidden = false;
  }

  document.addEventListener('DOMContentLoaded', function () {
    ['sv-hire', 'sv-leave', 'sv-monthly', 'sv-bonus', 'sv-leavepay', 'sv-ordinary']
      .forEach(function (id) {
        var el = $(id);
        if (el) { el.addEventListener('input', calc); el.addEventListener('change', calc); }
      });
  });
})(typeof window !== 'undefined' ? window : globalThis);
