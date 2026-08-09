/* 연차 계산기 v0.01 — 입사일 기준 · 회계연도 기준 둘 다.
 *
 * ■ 왜 만들었나 (2026-08-09 자동완성 실측, 37개)
 *   "연차 계산기"가 1순위인데 그 아래가 **"회계연도 기준" / "입사일 기준"** 으로 갈린다.
 *   회사마다 기준이 달라서 자기 연차가 몇 개인지 모르는 사람이 많다는 뜻이다.
 *   ⚠️ 기존 퇴사 타이밍 도구는 **"다음 연차가 언제 생기나"(발생일)** 만 본다.
 *      여기는 **"지금 내 연차가 몇 개인가"(개수)** 다. 역할이 다르다.
 *
 * ■ 근거 — 근로기준법 제60조
 *   · 1년 미만: 1개월 개근마다 1일, 최대 11일
 *   · 1년 이상: 15일
 *   · 3년 이상: 매 2년마다 1일 가산 → 15 + floor((근속연수-1)/2), 상한 25일
 *
 * ■ 회계연도 기준은 법이 아니라 **실무 관행**이다. 다만 퇴직 시 입사일 기준으로 계산한 것보다
 *   적으면 안 된다(근로자에게 불리하게 적용할 수 없다). 그래서 이 도구는 **둘 다 계산해
 *   비교**한다 — 그게 이 검색어들이 원하는 답이다.
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

  /* 근속 만 연수 — 입사 응당일 기준(2023-03-02 입사면 2026-03-02 에 3년) */
  function serviceYears(hire, at) {
    var y = at.getUTCFullYear() - hire.getUTCFullYear();
    var anniv = new Date(Date.UTC(at.getUTCFullYear(), hire.getUTCMonth(), hire.getUTCDate()));
    if (at < anniv) y -= 1;
    return y;
  }
  /* 만 개월수 — 1년 미만 구간의 월차 계산에 쓴다 */
  function serviceMonths(hire, at) {
    var m = (at.getUTCFullYear() - hire.getUTCFullYear()) * 12 + (at.getUTCMonth() - hire.getUTCMonth());
    if (at.getUTCDate() < hire.getUTCDate()) m -= 1;
    return Math.max(0, m);
  }

  /* 근로기준법 제60조 — 근속연수별 연차 일수 (1년 이상) */
  function daysForYears(years) {
    if (years < 1) return 0;
    return Math.min(25, 15 + Math.floor((years - 1) / 2));
  }

  /* 입사일 기준: 그 시점까지 **발생한** 연차 총 일수 */
  function byHireDate(hire, at) {
    var yrs = serviceYears(hire, at);
    if (yrs < 1) {
      // 1개월 개근마다 1일, 최대 11일
      return { days: Math.min(11, serviceMonths(hire, at)), years: 0, monthly: true };
    }
    return { days: daysForYears(yrs), years: yrs, monthly: false };
  }

  /* 회계연도(1/1~12/31) 기준.
     입사 첫 해는 근무 비율만큼 비례 부여한다 — 15 × (입사일~그해 12/31 재직일수 ÷ 365).
     ⚠️ 회사마다 소수점 처리가 다르다. 여기서는 소수 첫째 자리까지 보여준다. */
  function proratedFirstYear(hire) {
    var yearEnd = new Date(Date.UTC(hire.getUTCFullYear(), 11, 31));
    var worked = daysBetween(hire, yearEnd) + 1;      // 입사일 당일 포함
    if (worked <= 0) return 0;
    return Math.round(15 * (worked / 365) * 10) / 10;
  }
  function byFiscalYear(hire, at) {
    var hy = hire.getUTCFullYear(), ay = at.getUTCFullYear();
    var elapsed = ay - hy;                            // 입사 후 지난 회계연도 수
    if (elapsed <= 0) {
      // 입사한 해에는 아직 회계연도 연차가 없다 — 1년 미만 월차만 발생
      return { days: Math.min(11, serviceMonths(hire, at)), prorated: 0, monthly: true };
    }
    var pro = proratedFirstYear(hire);
    if (elapsed === 1) return { days: pro, prorated: pro, monthly: false };
    // 두 번째 회계연도부터는 정상 부여. 근속연수는 (elapsed - 1) 년차로 본다.
    return { days: daysForYears(elapsed - 1), prorated: pro, monthly: false };
  }

  /* 미사용 연차수당 = 1일 통상임금 × 미사용 일수 */
  function unusedPay(dailyOrdinary, unusedDays) {
    return (dailyOrdinary || 0) * (unusedDays || 0);
  }

  var AL = {
    parseDate: parseDate, daysBetween: daysBetween,
    serviceYears: serviceYears, serviceMonths: serviceMonths,
    daysForYears: daysForYears, byHireDate: byHireDate,
    proratedFirstYear: proratedFirstYear, byFiscalYear: byFiscalYear,
    unusedPay: unusedPay
  };
  global.AL = AL;
  if (typeof module !== 'undefined' && module.exports) module.exports = AL;

  /* ── 화면 ─────────────────────────────────────────── */
  if (typeof document === 'undefined') return;

  function $(id) { return document.getElementById(id); }
  function n(el) { var v = parseFloat(String(el.value).replace(/,/g, '')); return isFinite(v) && v > 0 ? v : 0; }
  function won(x) { return Math.round(x).toLocaleString() + '원'; }

  function calc() {
    var hire = parseDate($('al-hire').value);
    var at = parseDate($('al-at').value) || new Date();
    var out = $('al-out');
    if (!hire || at <= hire) { out.hidden = true; return; }

    var h = byHireDate(hire, at);
    var f = byFiscalYear(hire, at);
    var better = h.days >= f.days ? '입사일' : '회계연도';

    $('al-main').textContent = h.days + '일';
    $('al-sub').textContent = '입사일 기준 · 근속 ' + (h.monthly ? '1년 미만' : h.years + '년');
    $('al-fiscal').textContent = f.days + '일';

    var ul = $('al-lines');
    ul.textContent = '';
    var lines = [];
    if (h.monthly) {
      lines.push('1년 미만이라 1개월 개근마다 1일씩 발생합니다 (최대 11일)');
      lines.push('현재 만 ' + serviceMonths(hire, at) + '개월 근무');
    } else {
      lines.push('근속 ' + h.years + '년 → 15일 + 가산 ' + (h.days - 15) + '일');
      if (h.days === 25) lines.push('법정 상한 25일에 도달했습니다');
    }
    if (!f.monthly && f.prorated) {
      lines.push('회계연도 기준 첫 해 비례분은 ' + f.prorated + '일이었습니다');
    }
    lines.push(better === '입사일'
      ? '두 기준 중 입사일 기준이 같거나 더 많습니다'
      : '회계연도 기준이 더 많습니다 — 회사 기준을 확인하세요');
    lines.push('퇴직할 때는 입사일 기준보다 적게 줄 수 없습니다');
    lines.forEach(function (t) {
      var li = document.createElement('li'); li.textContent = t; ul.appendChild(li);
    });

    var used = n($('al-used'));
    var daily = n($('al-daily'));
    var unused = Math.max(0, h.days - used);
    var pay = $('al-pay');
    if (daily && unused > 0) {
      pay.textContent = '미사용 ' + unused + '일 × ' + won(daily) + ' = ' + won(unusedPay(daily, unused));
      pay.hidden = false;
    } else if (used) {
      pay.textContent = '미사용 ' + unused + '일';
      pay.hidden = false;
    } else {
      pay.hidden = true;
    }
    out.hidden = false;
  }

  document.addEventListener('DOMContentLoaded', function () {
    ['al-hire', 'al-at', 'al-used', 'al-daily'].forEach(function (id) {
      var el = $(id);
      if (el) { el.addEventListener('input', calc); el.addEventListener('change', calc); }
    });
  });
})(typeof window !== 'undefined' ? window : globalThis);
