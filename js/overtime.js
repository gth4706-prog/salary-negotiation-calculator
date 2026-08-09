/* 연장·야간·휴일근로 수당 계산기 v0.01
 *
 * ■ 왜 만들었나 (2026-08-09 자동완성 실측, 40개)
 *   "야간수당 몇시부터 / 기준 / 계산법", "연장근로수당 계산기", "휴일근로수당 계산법".
 *   그리고 **"야간수당 5인미만"** — 상시 5인 미만 사업장은 가산수당이 아예 적용되지 않는데
 *   이걸 모르면 계산이 통째로 틀린다. 검색어가 그 혼란을 그대로 보여준다.
 *   ⚠️ 기존 도구 어디에도 연장·야간·휴일 가산 로직이 없다(겹치지 않음).
 *      주휴수당 계산기가 "초과분은 연장수당으로 따로 받는다"고 가리키던 빈칸이다.
 *
 * ■ 근거 — 근로기준법 제56조 (가산임금)
 *   · 연장근로: 통상임금의 50% 가산 → **1.5배**
 *   · 야간근로(22:00~06:00): 50% 가산 → **+0.5배**
 *   · 휴일근로: 8시간 이내 50% 가산(1.5배), **8시간 초과분은 100% 가산(2배)**
 *   · 중복 적용된다. 연장+야간 = 2.0배, 휴일 8시간 초과 + 야간 = 2.5배
 *   ⚠️ 근로기준법 제11조 — **상시 4명 이하(5인 미만) 사업장은 제56조가 적용되지 않는다.**
 *      이 경우 아무리 밤에 일해도 가산 없이 1.0배다.
 */
(function (global) {
  'use strict';

  var NIGHT_START = 22, NIGHT_END = 6;   // 22:00 ~ 06:00

  /* 배수 계산. 모든 가산은 통상임금 기준으로 **더해진다**(곱하지 않는다). */
  function multiplier(o) {
    o = o || {};
    if (o.under5) return 1;              // 5인 미만은 가산 자체가 없다
    var m = 1;
    if (o.holiday) {
      m += o.overEight ? 1.0 : 0.5;      // 휴일 8시간 초과분은 100% 가산
    } else if (o.extended) {
      m += 0.5;                          // 연장 50% 가산
    }
    if (o.night) m += 0.5;               // 야간 50% 가산 (연장·휴일과 중복)
    return m;
  }

  /* 어떤 시각이 야간(22~06)에 해당하는가 */
  function isNightHour(hour) {
    var h = ((hour % 24) + 24) % 24;
    return h >= NIGHT_START || h < NIGHT_END;
  }
  /* 시작~종료 사이에 야간 시간이 몇 시간인가 (자정을 넘겨도 맞게 센다) */
  function nightHours(startHour, hours) {
    var n = 0;
    for (var i = 0; i < Math.floor(hours); i++) {
      if (isNightHour(startHour + i)) n += 1;
    }
    var frac = hours - Math.floor(hours);
    if (frac > 0 && isNightHour(startHour + Math.floor(hours))) n += frac;
    return n;
  }

  function pay(hourly, hours, o) { return (hourly || 0) * (hours || 0) * multiplier(o); }

  /* 1일 근무를 통째로 계산 — 정상/연장/야간을 나눠서 합산한다.
     hours: 그날 총 근로시간, start: 시작 시각(0~23), holiday: 휴일근로 여부 */
  function daily(hourly, hours, start, holiday, under5) {
    var normalLimit = holiday ? 8 : 8;            // 휴일도 8시간이 경계
    var base = Math.min(hours, normalLimit);
    var over = Math.max(0, hours - normalLimit);
    var nh = nightHours(start, hours);
    // 야간이 base 구간과 over 구간에 각각 얼마나 걸치는지 (뒤쪽부터 채운다고 본다)
    var nightOver = Math.min(nh, over);
    var nightBase = nh - nightOver;

    var parts = [
      { label: holiday ? '휴일 8시간 이내' : '기본',
        hours: base - nightBase, mult: multiplier({ holiday: holiday, under5: under5 }) },
      { label: holiday ? '휴일 8시간 이내 + 야간' : '기본 + 야간',
        hours: nightBase, mult: multiplier({ holiday: holiday, night: true, under5: under5 }) },
      { label: holiday ? '휴일 8시간 초과' : '연장',
        hours: over - nightOver,
        mult: multiplier({ holiday: holiday, extended: !holiday, overEight: holiday, under5: under5 }) },
      { label: holiday ? '휴일 8시간 초과 + 야간' : '연장 + 야간',
        hours: nightOver,
        mult: multiplier({ holiday: holiday, extended: !holiday, overEight: holiday,
                           night: true, under5: under5 }) }
    ].filter(function (p) { return p.hours > 0.0001; });

    var total = 0;
    parts.forEach(function (p) { p.pay = (hourly || 0) * p.hours * p.mult; total += p.pay; });
    return { parts: parts, total: total, nightHours: nh, overHours: over };
  }

  var OT = {
    NIGHT_START: NIGHT_START, NIGHT_END: NIGHT_END,
    multiplier: multiplier, isNightHour: isNightHour, nightHours: nightHours,
    pay: pay, daily: daily
  };
  global.OT = OT;
  if (typeof module !== 'undefined' && module.exports) module.exports = OT;

  /* ── 화면 ─────────────────────────────────────────── */
  if (typeof document === 'undefined') return;

  function $(id) { return document.getElementById(id); }
  function n(el) { var v = parseFloat(String(el.value).replace(/,/g, '')); return isFinite(v) && v > 0 ? v : 0; }
  function won(x) { return Math.round(x).toLocaleString() + '원'; }
  function hr(x) { return (Math.round(x * 10) / 10) + '시간'; }

  function calc() {
    var hourly = n($('ot-hourly')) || 10320;
    var hours = n($('ot-hours'));
    var start = parseFloat($('ot-start').value);
    if (!isFinite(start)) start = 9;
    var holiday = $('ot-holiday').checked;
    var under5 = $('ot-under5').checked;
    var out = $('ot-out'), warn = $('ot-warn');
    warn.hidden = true;
    if (!hours) { out.hidden = true; return; }

    var r = daily(hourly, hours, start, holiday, under5);
    if (under5) {
      warn.textContent = '상시 5인 미만 사업장은 근로기준법 제56조(가산임금)가 적용되지 않아 '
                       + '연장·야간·휴일 가산이 없습니다. 전부 1.0배로 계산했습니다.';
      warn.hidden = false;
    }

    $('ot-total').textContent = won(r.total);
    var ul = $('ot-lines');
    ul.textContent = '';
    r.parts.forEach(function (p) {
      var li = document.createElement('li');
      li.textContent = p.label + ' ' + hr(p.hours) + ' × ' + p.mult + '배 = ' + won(p.pay);
      ul.appendChild(li);
    });
    var extra = document.createElement('li');
    extra.textContent = '야간(22~06시) 해당 ' + hr(r.nightHours)
                      + (r.overHours ? ' · ' + (holiday ? '휴일 8시간 초과 ' : '연장 ') + hr(r.overHours) : '');
    ul.appendChild(extra);
    var note = document.createElement('li');
    note.textContent = '세전 금액이며 통상임금 기준입니다';
    ul.appendChild(note);
    out.hidden = false;
  }

  document.addEventListener('DOMContentLoaded', function () {
    ['ot-hourly', 'ot-hours', 'ot-start', 'ot-holiday', 'ot-under5'].forEach(function (id) {
      var el = $(id);
      if (el) { el.addEventListener('input', calc); el.addEventListener('change', calc); }
    });
  });
})(typeof window !== 'undefined' ? window : globalThis);
