/* 내 월급 한 장 — 정보를 한 번만 넣으면 급여·보험·퇴직금·연차·실업급여가 한꺼번에 나온다.
 *
 * 왜 이렇게 만들었나 (2026-08-31 재구축):
 *   예전엔 퇴직금 계산기, 실업급여 계산기, 4대보험 계산기가 **따로** 있었다.
 *   그런데 사람은 "내 퇴직금"만 궁금한 게 아니라 "내 상황"이 궁금하다.
 *   월급과 입사일은 어차피 전부 같은 값인데 계산기마다 다시 입력해야 했다.
 *   그래서 입력을 하나로 합치고 결과를 전부 펼친다. 이게 이 도구의 존재 이유다.
 *
 * 계산은 전부 기존 순수 모듈에 위임한다 — 여기서 공식을 다시 쓰지 않는다.
 *   INS(4대보험) / TAX(소득세) / SEV(퇴직금) / AL(연차) / UB(실업급여) / WAGE(주휴·통상시급) / OT(가산수당)
 *   ⚠️ 요율·상한 같은 숫자를 이 파일에 복사해 두지 말 것. 갱신할 때 반드시 어긋난다.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var won = function (n) { return Math.round(n || 0).toLocaleString() + '원'; };
  var manwon = function (n) { return Math.round((n || 0) / 10000).toLocaleString() + '만원'; };

  /* 오늘 (UTC 자정 기준 — SEV/AL 의 날짜 함수가 UTC 로 동작한다) */
  function today() {
    var d = new Date();
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  }
  function fmtDate(d) {
    if (!d) return '—';
    return d.getUTCFullYear() + '.' + (d.getUTCMonth() + 1) + '.' + d.getUTCDate();
  }

  /* ---------- 입력 읽기 ---------- */
  function read() {
    var monthlyMan = +($('mp-monthly') || {}).value || 0;      // 월 세전 급여(만원)
    var weekly = +($('mp-weekly') || {}).value || 0;           // 주 소정근로시간
    var taxFree = (+($('mp-taxfree') || {}).value || 0) * 10000; // 비과세(만원 -> 원)
    var hireStr = ($('mp-hire') || {}).value || '';
    var age50 = !!($('mp-age50') || {}).checked;
    return {
      monthlyMan: monthlyMan,
      gross: monthlyMan * 10000,
      annualMan: monthlyMan * 12,
      weekly: weekly,
      taxFree: taxFree,
      hire: hireStr ? SEV.parseDate(hireStr) : null,
      age50: age50,
    };
  }

  /* ---------- 월 소정근로시간 = (소정 + 주휴) × 주/월 ----------
     40시간이면 (40+8)×4.345 ≒ 209시간 으로 법정 기준과 맞는다. */
  function monthlyHours(weekly) {
    if (!weekly) return WAGE.MONTHLY_HOURS_STD;
    /* 반올림하는 이유: 주 40시간이면 48 x 4.3452 = 208.57 이 나오는데
       법정·실무 기준은 209 시간이다. 반올림해야 다른 계산기·급여대장과 값이 맞는다. */
    return Math.round((weekly + WAGE.holidayHours(weekly)) * WAGE.WEEKS_PER_MONTH);
  }

  /* ---------- 실업급여 소정급여일수 구간 키 ---------- */
  function tenureKey(servedDays) {
    var y = servedDays / 365;
    if (y < 1) return 'u1';
    if (y < 3) return '1to3';
    if (y < 5) return '3to5';
    if (y < 10) return '5to10';
    return 'o10';
  }

  /* ================= 카드별 렌더 ================= */

  /* 1. 실수령액 */
  function renderTakeHome(d) {
    var emp = INS.employee(d.gross, d.taxFree);
    var tax = TAX.monthlyTax(d.annualMan);
    var net = d.gross - emp.total - tax;

    $('mp-net').textContent = won(net);
    $('mp-net-sub').textContent =
      '세전 ' + won(d.gross) + ' · 공제 합계 ' + won(emp.total + tax);

    var rows = [
      ['국민연금', emp.pension], ['건강보험', emp.health],
      ['장기요양', emp.ltc], ['고용보험', emp.employment],
      ['소득세', TAX.incomeTax(d.annualMan)], ['지방소득세', TAX.localTax(d.annualMan)],
    ];
    $('mp-deduct').innerHTML = rows.map(function (r) {
      return '<div class="kv"><span>' + r[0] + '</span><b>' + won(r[1]) + '</b></div>';
    }).join('');

    $('mp-net-note').textContent = INS.pensionCapped(d.gross, d.taxFree)
      ? '국민연금 기준소득월액 상한(' + manwon(INS.PENSION_CAP) + ')에 걸려 더 오르지 않습니다.'
      : '';
  }

  /* 2. 4대보험 — 내가 내는 것과 회사가 내는 것 */
  function renderInsurance(d) {
    var emp = INS.employee(d.gross, d.taxFree);
    var er = INS.employer(d.gross, d.taxFree, 0, 0);
    $('mp-ins-me').textContent = won(emp.total);
    $('mp-ins-company').textContent = won(er.total);
    $('mp-ins-note').textContent =
      '회사도 거의 같은 금액을 함께 냅니다. 산재보험(전액 회사 부담)과 고용안정·직업능력개발 부담금은 업종·규모에 따라 달라 여기서는 뺐습니다.';
  }

  /* 3. 퇴직금 */
  function renderSeverance(d) {
    var box = $('mp-sev-body');
    if (!d.hire) { box.innerHTML = '<p class="muted">입사일을 넣으면 계산합니다.</p>'; return; }

    var now = today();
    var served = SEV.servedDays(d.hire, now);
    var el = SEV.eligible(served, d.weekly || null);
    var pDays = SEV.periodDays(now);
    var daily = SEV.dailyAverage(d.gross * 3, 0, 0, pDays, 0);
    var amount = SEV.severance(daily, served);

    if (!el.ok) {
      var need = 365 - served;
      box.innerHTML = '<p class="big warn">아직 대상이 아닙니다</p>' +
        '<p class="muted">' +
        (!el.years ? '계속근로 1년까지 <b>' + need + '일</b> 남았습니다. ' +
          '그날이 <b>' + fmtDate(new Date(d.hire.getTime() + 365 * 86400000)) + '</b>입니다.' : '') +
        (!el.hours ? ' 주 소정근로시간이 15시간 미만이면 대상에서 빠집니다.' : '') +
        '</p>';
      return;
    }
    box.innerHTML =
      '<p class="big">' + won(amount) + '</p>' +
      '<div class="kv"><span>재직일수</span><b>' + served.toLocaleString() + '일 (약 ' + (served / 365).toFixed(2) + '년)</b></div>' +
      '<div class="kv"><span>1일 평균임금</span><b>' + won(daily) + '</b></div>' +
      '<p class="muted">오늘 퇴사한다고 가정한 금액입니다. 상여금·연차수당이 있으면 실제로는 더 많습니다.</p>';
  }

  /* 4. 연차 */
  function renderAnnualLeave(d) {
    var box = $('mp-al-body');
    if (!d.hire) { box.innerHTML = '<p class="muted">입사일을 넣으면 계산합니다.</p>'; return; }

    var now = today();
    var r = AL.byHireDate(d.hire, now);
    var hourly = d.gross / monthlyHours(d.weekly);
    var perDay = hourly * 8;

    box.innerHTML =
      '<p class="big">' + r.days + '일</p>' +
      (r.monthly
        ? '<p class="muted">1년 미만이라 <b>1개월 개근마다 1일</b>씩 생깁니다 (최대 11일).</p>'
        : '<div class="kv"><span>근속</span><b>' + r.years + '년차</b></div>') +
      '<div class="kv"><span>미사용 시 수당(1일)</span><b>' + won(perDay) + '</b></div>' +
      '<p class="muted">수당은 통상시급 × 8시간으로 계산했습니다. 남은 연차 전부면 ' +
      won(perDay * r.days) + '입니다.</p>';
  }

  /* 5. 실업급여 */
  function renderUnemployment(d) {
    var box = $('mp-ub-body');
    if (!d.monthlyMan) { box.innerHTML = '<p class="muted">월 급여를 넣으면 계산합니다.</p>'; return; }

    var b = UB.dailyBenefit(d.monthlyMan);
    var served = d.hire ? SEV.servedDays(d.hire, today()) : 0;
    var key = tenureKey(served);
    var days = UB.payDays(key, d.age50);
    var label = '';
    for (var i = 0; i < UB.DAYS.length; i++) if (UB.DAYS[i].key === key) label = UB.DAYS[i].label;

    box.innerHTML =
      '<p class="big">' + won(b.v * days) + '</p>' +
      '<div class="kv"><span>1일 지급액</span><b>' + won(b.v) +
      (b.capped ? ' <span class="tag">' + b.capped + '</span>' : '') + '</b></div>' +
      '<div class="kv"><span>소정급여일수</span><b>' + days + '일 (' + label + ')</b></div>' +
      '<p class="muted">' +
      (b.capped === '상한'
        ? '상한액에 걸렸습니다. 월급이 더 올라도 실업급여는 늘지 않습니다.'
        : b.capped === '하한'
          ? '하한액이 적용됐습니다. 상한(' + won(UB.DAILY_CAP) + ')과 겨우 ' +
            won(UB.DAILY_CAP - UB.DAILY_FLOOR) + ' 차이입니다.'
          : '평균임금의 60%입니다.') +
      ' 자발적 퇴사는 원칙적으로 대상이 아닙니다.</p>';
  }

  /* 6. 시급·수당 단가 */
  function renderHourly(d) {
    var box = $('mp-hr-body');
    if (!d.gross || !d.weekly) { box.innerHTML = '<p class="muted">월 급여와 주 근무시간을 넣으면 계산합니다.</p>'; return; }

    var mh = monthlyHours(d.weekly);
    var hourly = d.gross / mh;
    var minw = WAGE.minWage(2026);
    var below = hourly < minw;

    var rows = [
      ['연장근로 (1.5배)', OT.pay(hourly, 1, { extended: true })],
      ['야간근로 (1.5배)', OT.pay(hourly, 1, { night: true })],
      ['연장 + 야간 (2배)', OT.pay(hourly, 1, { extended: true, night: true })],
      ['휴일 8시간 이내 (1.5배)', OT.pay(hourly, 1, { holiday: true })],
      ['휴일 8시간 초과 (2배)', OT.pay(hourly, 1, { holiday: true, overEight: true })],
    ];

    box.innerHTML =
      '<p class="big' + (below ? ' warn' : '') + '">' + won(hourly) + '<span class="unit">/시간</span></p>' +
      '<div class="kv"><span>월 소정근로시간</span><b>' + Math.round(mh) + '시간</b></div>' +
      '<div class="kv"><span>주휴수당 포함 여부</span><b>' +
        (WAGE.holidayHours(d.weekly) > 0 ? '포함 (주 ' + WAGE.holidayHours(d.weekly).toFixed(1) + '시간)' : '해당 없음 (주 15시간 미만)') +
      '</b></div>' +
      (below ? '<p class="warn-box">2026년 최저시급 ' + won(minw) + '보다 낮습니다. 확인이 필요합니다.</p>' : '') +
      '<div class="sub-h">1시간당 가산수당</div>' +
      rows.map(function (r) {
        return '<div class="kv"><span>' + r[0] + '</span><b>' + won(r[1]) + '</b></div>';
      }).join('') +
      '<p class="muted">5인 미만 사업장은 가산수당(연장·야간·휴일)이 적용되지 않습니다.</p>';
  }

  /* 7. 퇴사 타이밍 — 퇴직금과 연차를 둘 다 챙기는 날 */
  function renderTiming(d) {
    var box = $('mp-tm-body');
    if (!d.hire) { box.innerHTML = '<p class="muted">입사일을 넣으면 계산합니다.</p>'; return; }

    var now = today();
    var served = SEV.servedDays(d.hire, now);
    var oneYear = new Date(d.hire.getTime() + 365 * 86400000);

    /* 다음 연차 발생일 = 다음 입사 기념일 */
    var y = now.getUTCFullYear();
    var anniv = new Date(Date.UTC(y, d.hire.getUTCMonth(), d.hire.getUTCDate()));
    if (anniv <= now) anniv = new Date(Date.UTC(y + 1, d.hire.getUTCMonth(), d.hire.getUTCDate()));

    var items = [];
    if (served < 365) {
      items.push(['퇴직금이 생기는 날', fmtDate(oneYear), Math.ceil((oneYear - now) / 86400000) + '일 뒤']);
    }
    items.push(['다음 연차가 생기는 날', fmtDate(anniv), Math.ceil((anniv - now) / 86400000) + '일 뒤']);

    box.innerHTML = items.map(function (r) {
      return '<div class="kv"><span>' + r[0] + '</span><b>' + r[1] + ' <span class="tag">' + r[2] + '</span></b></div>';
    }).join('') +
      '<p class="muted">연차는 <b>발생일 하루 전에 퇴사하면 받지 못합니다.</b> ' +
      '기념일 당일까지 재직해야 그 해 연차가 생깁니다. 퇴직금도 같은 원리로 1년째 되는 날을 채워야 합니다.</p>';
  }

  /* ================= 실행 ================= */
  function run() {
    var d = read();
    var hasInput = d.monthlyMan > 0;
    $('mp-results').hidden = !hasInput;
    $('mp-empty').hidden = hasInput;
    if (!hasInput) return;

    renderTakeHome(d);
    renderInsurance(d);
    renderSeverance(d);
    renderAnnualLeave(d);
    renderUnemployment(d);
    renderHourly(d);
    renderTiming(d);
  }

  function init() {
    ['mp-monthly', 'mp-hire', 'mp-weekly', 'mp-taxfree', 'mp-age50'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener('input', run);
      el.addEventListener('change', run);
    });
    run();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
