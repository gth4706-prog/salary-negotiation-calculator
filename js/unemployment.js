/* 실업급여(구직급여) 계산기 — joeltool.com
   ─────────────────────────────────────────────────────────────
   ■ 왜 만들었나 (2026-08-08)
     구글 자동완성 실측에서 "실업급여 계산 / 금액 / 조건 / 기간"이 상위였고,
     기존 «퇴사 타이밍 계산기»와 한 흐름이다(퇴사 -> 퇴직금·연차 -> 실업급여).
     프로젝트 CLAUDE.md 에 "실업급여 자격판정은 v2로 보류"라고 적혀 있던 것을 이제 만든다.

   ■ 2026년 기준값 (1차 출처 교차확인 완료)
     · 구직급여일액 = 이직 전 평균임금의 60%
     · 1일 상한액 68,100원
     · 1일 하한액 66,048원  = 최저임금 10,320원 × 80% × 8시간  (검산 일치)
     · 소정급여일수: 연령(50세 기준)과 고용보험 가입기간에 따라 120~270일

   ⚠️ 요율·상한·하한은 매년 바뀐다. 여기와 index.html 의 정적 표가
      **같은 값**이어야 한다. 한쪽만 고치면 도구와 표가 어긋난다.
   ⚠️ 이건 모의계산이다. 수급 자격(비자발적 이직 등)은 고용센터가 최종 판단한다. */
(function () {
  "use strict";

  var DAILY_CAP = 68100;                 // 2026 1일 상한액
  var DAILY_FLOOR = 66048;               // 2026 1일 하한액 (최저임금 10,320 × 0.8 × 8h)
  var RATE = 0.6;                        // 평균임금 대비 지급률
  var MIN_WAGE_HOUR = 10320;             // 2026 최저시급 (하한액 근거 표시용)

  /* 고용보험법 별표 — 소정급여일수 */
  var DAYS = [
    { key: "u1",   label: "1년 미만",          under50: 120, over50: 120 },
    { key: "1to3", label: "1년 이상 3년 미만",  under50: 150, over50: 180 },
    { key: "3to5", label: "3년 이상 5년 미만",  under50: 180, over50: 210 },
    { key: "5to10",label: "5년 이상 10년 미만", under50: 210, over50: 240 },
    { key: "o10",  label: "10년 이상",          under50: 240, over50: 270 }
  ];

  function $(id) { return document.getElementById(id); }
  function won(n) { return Math.round(n).toLocaleString() + "원"; }

  /* 1일 평균임금 = 최근 3개월 임금 총액 ÷ 그 기간 총일수.
     월급만 입력받으므로 월급×3 ÷ 91.25(3개월 평균일수) 로 근사한다. */
  function dailyAverage(monthlyManwon) {
    if (!monthlyManwon) return 0;
    return monthlyManwon * 10000 * 3 / 91.25;
  }

  function dailyBenefit(monthlyManwon) {
    var raw = dailyAverage(monthlyManwon) * RATE;
    if (raw > DAILY_CAP) return { v: DAILY_CAP, capped: "상한" };
    if (raw < DAILY_FLOOR) return { v: DAILY_FLOOR, capped: "하한" };
    return { v: raw, capped: null };
  }

  function payDays(tenureKey, age50plus) {
    for (var i = 0; i < DAYS.length; i++) {
      if (DAYS[i].key === tenureKey) return age50plus ? DAYS[i].over50 : DAYS[i].under50;
    }
    return 0;
  }

  function calc() {
    var pay = +($("ub-pay") || {}).value || 0;
    var tenure = ($("ub-tenure") || {}).value || "1to3";
    var age50 = !!($("ub-age50") || {}).checked;
    var box = $("ub-result");
    if (!box) return;

    if (pay <= 0) {
      box.hidden = true;
      return;
    }
    var d = dailyBenefit(pay);
    var days = payDays(tenure, age50);
    var total = d.v * days;
    var note = d.capped === "상한"
      ? "평균임금의 60%가 상한액을 넘어서 <b>상한액 " + won(DAILY_CAP) + "</b>이 적용됐어요."
      : d.capped === "하한"
      ? "평균임금의 60%가 하한액에 못 미쳐서 <b>하한액 " + won(DAILY_FLOOR) + "</b>이 적용됐어요."
      : "평균임금의 60%가 그대로 적용됐어요.";

    $("ub-daily").innerHTML = won(d.v);
    $("ub-days").innerHTML = days + "일";
    $("ub-total").innerHTML = won(total);
    $("ub-note").innerHTML = note;
    $("ub-monthly").innerHTML = won(d.v * 30) + " 안팎";
    box.hidden = false;
  }

  function init() {
    ["ub-pay", "ub-tenure", "ub-age50"].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener("input", calc);
      el.addEventListener("change", calc);
    });
    var b = $("ub-calc");
    if (b) b.addEventListener("click", calc);
    /* 하한액 근거를 화면에 밝힌다 — 숫자만 던지면 신뢰가 안 생긴다 */
    var f = $("ub-floor-basis");
    if (f) f.innerHTML = "최저임금 " + MIN_WAGE_HOUR.toLocaleString() + "원 × 80% × 8시간";
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  /* 테스트에서 쓰도록 노출 */
  window.UB = { dailyAverage: dailyAverage, dailyBenefit: dailyBenefit,
                payDays: payDays, DAYS: DAYS,
                DAILY_CAP: DAILY_CAP, DAILY_FLOOR: DAILY_FLOOR, RATE: RATE };
})();
