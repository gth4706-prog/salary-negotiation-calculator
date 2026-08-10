/* 4대보험 계산기 v0.01 — 근로자 부담 + **사업주 부담**까지.
 *
 * ■ 왜 만들었나 (2026-08-10 자동완성 실측, 28개)
 *   "4대보험 계산기 / 2026 / 요율 / 요율표 / 알바 / 월급".
 *   ⚠️ 연봉 계산기와 겹치는지 먼저 확인했다 —
 *      저쪽은 **"내 실수령액이 얼마인가"** 를 답하고 4대보험은 **합계로만** 나온다.
 *      여기는 **"항목별로 얼마씩 빠지고, 회사는 얼마를 내나"** 다. 의도가 다르다.
 *      특히 사업주 부담분은 사이트 어디에도 없었다(인건비 계산 수요).
 *
 * ■ 요율 (이 프로젝트에서 이미 검증한 2026년 값 — js/app.js 의 takeHome() 과 같아야 한다)
 *   · 국민연금  근로자 4.75%  (기준소득월액 상한 6,370,000원)
 *   · 건강보험  근로자 3.595%
 *   · 장기요양  건강보험료 × 13.14%
 *   · 고용보험(실업급여)  근로자 0.9%
 *
 * ■ 사업주 부담
 *   국민연금·건강보험·장기요양은 **근로자와 같은 요율**을 회사도 낸다(절반씩).
 *   고용보험은 실업급여분 0.9% 는 같지만 **고용안정·직업능력개발사업분이 규모별로 다르다.**
 *   산재보험은 **전액 사업주 부담이고 업종별로 크게 다르다.**
 *   ⚠️ 규모별·업종별 정확한 값을 모른 채 숫자를 내면 틀린 금액을 주게 된다.
 *      그래서 이 둘은 **사용자가 직접 넣도록** 하고, 안 넣으면 계산에서 뺀다.
 */
(function (global) {
  'use strict';

  var RATE = {
    pension: 0.0475,        // 국민연금 근로자
    health: 0.03595,        // 건강보험 근로자
    ltcOfHealth: 0.1314,    // 장기요양 = 건강보험료 × 이 값
    employment: 0.009       // 고용보험(실업급여) 근로자
  };
  var PENSION_CAP = 6370000;   // 국민연금 기준소득월액 상한
  var TAX_FREE_DEFAULT = 200000;  // 비과세 식대 기본값

  /* 보험료 부과 기준이 되는 보수월액 — 비과세는 빠진다 */
  function taxableMonthly(gross, taxFree) {
    return Math.max(0, (gross || 0) - (taxFree == null ? TAX_FREE_DEFAULT : taxFree));
  }

  /* 근로자 부담 — 항목별 */
  function employee(gross, taxFree) {
    var t = taxableMonthly(gross, taxFree);
    var pension = Math.min(t, PENSION_CAP) * RATE.pension;
    var health = t * RATE.health;
    var ltc = health * RATE.ltcOfHealth;
    var emp = t * RATE.employment;
    return {
      base: t, pension: pension, health: health, ltc: ltc, employment: emp,
      total: pension + health + ltc + emp
    };
  }

  /* 사업주 부담.
     empExtraRate: 고용안정·직업능력개발 요율(규모별, 사용자 입력)
     accidentRate: 산재보험 요율(업종별, 사용자 입력) — 둘 다 없으면 0 으로 둔다. */
  function employer(gross, taxFree, empExtraRate, accidentRate) {
    var t = taxableMonthly(gross, taxFree);
    var pension = Math.min(t, PENSION_CAP) * RATE.pension;   // 근로자와 같은 요율
    var health = t * RATE.health;
    var ltc = health * RATE.ltcOfHealth;
    var emp = t * RATE.employment;                            // 실업급여분은 동일
    var empExtra = t * (empExtraRate || 0);
    var accident = t * (accidentRate || 0);
    return {
      base: t, pension: pension, health: health, ltc: ltc,
      employment: emp, employmentExtra: empExtra, accident: accident,
      total: pension + health + ltc + emp + empExtra + accident,
      /* 규모·업종을 안 넣으면 이 둘이 빠져 있다는 뜻 — 화면에서 밝힌다 */
      partial: !empExtraRate && !accidentRate
    };
  }

  /* 회사가 실제로 쓰는 인건비 = 급여 + 사업주 부담 */
  function laborCost(gross, taxFree, empExtraRate, accidentRate) {
    return (gross || 0) + employer(gross, taxFree, empExtraRate, accidentRate).total;
  }
  /* 세전에서 4대보험만 뺀 금액 (소득세는 별도 — 실수령액이 아니다) */
  function afterInsurance(gross, taxFree) {
    return (gross || 0) - employee(gross, taxFree).total;
  }
  /* 국민연금 상한에 걸렸는가 — 고소득자에게 중요한 갈림 */
  function pensionCapped(gross, taxFree) {
    return taxableMonthly(gross, taxFree) > PENSION_CAP;
  }

  var INS = {
    RATE: RATE, PENSION_CAP: PENSION_CAP, TAX_FREE_DEFAULT: TAX_FREE_DEFAULT,
    taxableMonthly: taxableMonthly, employee: employee, employer: employer,
    laborCost: laborCost, afterInsurance: afterInsurance, pensionCapped: pensionCapped
  };
  global.INS = INS;
  if (typeof module !== 'undefined' && module.exports) module.exports = INS;

  /* ── 화면 ─────────────────────────────────────────── */
  if (typeof document === 'undefined') return;

  function $(id) { return document.getElementById(id); }
  function n(el) { var v = parseFloat(String(el.value).replace(/,/g, '')); return isFinite(v) && v > 0 ? v : 0; }
  function won(x) { return Math.round(x).toLocaleString() + '원'; }
  function row(tb, label, amt, note) {
    var tr = document.createElement('tr');
    [label, won(amt), note || ''].forEach(function (s, i) {
      var td = document.createElement('td');
      td.textContent = s;
      if (i === 1) td.style.fontWeight = '700';
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  }

  function calc() {
    var monthly = n($('in-monthly'));
    var out = $('in-out'), warn = $('in-warn');
    warn.hidden = true;
    if (!monthly) { out.hidden = true; return; }
    var taxFree = $('in-taxfree').value === '' ? TAX_FREE_DEFAULT : n($('in-taxfree'));
    var extra = n($('in-empextra')) / 100;
    var acc = n($('in-accident')) / 100;

    var e = employee(monthly, taxFree);
    var c = employer(monthly, taxFree, extra, acc);

    $('in-total').textContent = won(e.total);
    var tb = $('in-emp-body'); tb.textContent = '';
    row(tb, '국민연금', e.pension, '4.75%' + (pensionCapped(monthly, taxFree) ? ' (상한 적용)' : ''));
    row(tb, '건강보험', e.health, '3.595%');
    row(tb, '장기요양', e.ltc, '건보료의 13.14%');
    row(tb, '고용보험', e.employment, '0.9%');
    row(tb, '합계', e.total, '보수월액 ' + won(e.base) + ' 기준');

    var tb2 = $('in-er-body'); tb2.textContent = '';
    row(tb2, '국민연금', c.pension, '근로자와 동일');
    row(tb2, '건강보험', c.health, '근로자와 동일');
    row(tb2, '장기요양', c.ltc, '근로자와 동일');
    row(tb2, '고용보험(실업급여)', c.employment, '근로자와 동일');
    if (extra) row(tb2, '고용안정·직업능력개발', c.employmentExtra, (extra * 100).toFixed(2) + '%');
    if (acc) row(tb2, '산재보험', c.accident, (acc * 100).toFixed(2) + '% · 전액 회사 부담');
    row(tb2, '합계', c.total, c.partial ? '규모·업종분 제외' : '');

    $('in-labor').textContent = won(laborCost(monthly, taxFree, extra, acc));
    $('in-after').textContent = won(afterInsurance(monthly, taxFree));

    if (c.partial) {
      warn.textContent = '고용안정·직업능력개발 요율(규모별)과 산재보험 요율(업종별)은 사업장마다 달라 '
                       + '기본값을 넣지 않았습니다. 아래에 직접 넣으면 사업주 부담에 반영됩니다.';
      warn.hidden = false;
    } else if (pensionCapped(monthly, taxFree)) {
      warn.textContent = '보수월액이 국민연금 기준소득월액 상한(6,370,000원)을 넘어 '
                       + '국민연금은 상한액으로 계산했습니다.';
      warn.hidden = false;
    }
    out.hidden = false;
  }

  document.addEventListener('DOMContentLoaded', function () {
    ['in-monthly', 'in-taxfree', 'in-empextra', 'in-accident'].forEach(function (id) {
      var el = $(id);
      if (el) { el.addEventListener('input', calc); el.addEventListener('change', calc); }
    });
  });
})(typeof window !== 'undefined' ? window : globalThis);
