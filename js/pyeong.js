/* 평수 계산기 v0.01 — 순수 계산 + 화면.
 *
 * ■ 왜 만들었나 (2026-08-09 구글 자동완성 실측)
 *   "평수 계산기" / "평수 계산기 가로 세로" / "제곱미터 평 변환기" / "84제곱미터 평 변환"
 *   — 글이 아니라 **도구를 찾는 검색어**가 26개 나왔다. 그리고 우리 배치 시뮬레이터가
 *   평수를 입력받으므로, 계산 결과를 그대로 그 도구로 넘길 수 있다.
 *
 * ■ 서버·키 불필요. 전부 브라우저 계산이라 비용 0.
 * ■ 계산 로직(PY.*)은 화면과 분리해 tests/pyeong-test.mjs 가 파일에서 그대로 읽어 쓴다.
 */
(function (global) {
  'use strict';

  /* 1평 = 6자×6자 = 400/121 ㎡. 흔히 쓰는 3.3058 은 이 값의 반올림이다.
     ⚠️ 3.3058 로 고정하면 큰 면적에서 오차가 누적되므로 분수를 그대로 쓴다. */
  var M2_PER_PYEONG = 400 / 121;   // = 3.305785123966942...

  function m2ToPyeong(m2) { return m2 / M2_PER_PYEONG; }
  function pyeongToM2(py) { return py * M2_PER_PYEONG; }

  /* 가로·세로(m)로 면적을 구한다. cm 로 들어오면 호출부에서 m 로 바꿔 넘긴다. */
  function areaFrom(w, h) { return w * h; }

  /* 표시용 반올림 — 평은 소수 2자리, ㎡는 소수 2자리가 실용적이다. */
  function round2(n) { return Math.round(n * 100) / 100; }

  /* 평수대별로 "실제로 뭐가 들어가는지".
     ⚠️ 숫자만 주면 체감이 안 온다. 자동완성에 "원룸 평수 체감"이 있었던 이유다.
     기준 치수는 우리 가구 규격 가이드와 같은 값을 쓴다. */
  var FEEL = [
    { max: 4,        title: '3~4평',   desc: '침대 하나에 좁은 통로. 책상을 놓으면 옷장 자리가 없습니다.',
      fits: ['슈퍼싱글 침대(110×200)', '수납장 또는 작은 책상 하나'] },
    { max: 5,        title: '4~5평',   desc: '1인 가구 원룸에서 가장 흔한 크기입니다.',
      fits: ['슈퍼싱글 침대', '책상 1000~1200', '옷장 100cm'] },
    { max: 6,        title: '5~6평',   desc: '가구 배치에 선택지가 생깁니다.',
      fits: ['슈퍼싱글~더블 침대', '책상 1200~1400', '옷장 120cm', '작은 소파 또는 의자'] },
    { max: 8,        title: '6~8평',   desc: '침대와 책상을 떨어뜨려 놓을 수 있습니다.',
      fits: ['퀸 침대(150×200)', '책상 1400', '옷장 150cm', '2인용 소파'] },
    { max: 10,       title: '8~10평',  desc: '분리형 원룸이나 작은 투룸 크기입니다.',
      fits: ['퀸~킹 침대', '책상 1600', '옷장 180cm', '3인용 소파', '4인 식탁'] },
    { max: Infinity, title: '10평 이상', desc: '방을 용도별로 나눠 쓸 수 있습니다.',
      fits: ['킹 침대', '책상 1600 이상', '붙박이급 옷장', '3인용 소파', '6인 식탁'] }
  ];
  function feelOf(pyeong) {
    for (var i = 0; i < FEEL.length; i++) if (pyeong <= FEEL[i].max) return FEEL[i];
    return FEEL[FEEL.length - 1];
  }

  /* 배치 시뮬레이터는 정수 평을 받는다. 0.5 이상이면 올리되 최소 1평. */
  function plannerPyeong(pyeong) { return Math.max(1, Math.round(pyeong)); }

  var PY = {
    M2_PER_PYEONG: M2_PER_PYEONG,
    m2ToPyeong: m2ToPyeong, pyeongToM2: pyeongToM2,
    areaFrom: areaFrom, round2: round2, feelOf: feelOf,
    plannerPyeong: plannerPyeong, FEEL: FEEL
  };
  global.PY = PY;
  if (typeof module !== 'undefined' && module.exports) module.exports = PY;

  /* ── 화면 (브라우저에서만) ───────────────────────────── */
  if (typeof document === 'undefined') return;

  function $(id) { return document.getElementById(id); }
  function num(el) { var v = parseFloat(el.value); return isFinite(v) && v > 0 ? v : 0; }

  function show(m2) {
    var out = $('py-out');
    if (!m2) { out.hidden = true; return; }
    var py = m2ToPyeong(m2);
    $('py-pyeong').textContent = round2(py).toLocaleString();
    $('py-m2').textContent = round2(m2).toLocaleString();
    var f = feelOf(py);
    $('py-feel-title').textContent = f.title;
    $('py-feel-desc').textContent = f.desc;
    var ul = $('py-fits');
    ul.textContent = '';
    f.fits.forEach(function (s) {
      var li = document.createElement('li');
      li.textContent = s;           // 사용자 입력이 섞이지 않지만 관례상 textContent 로만
      ul.appendChild(li);
    });
    $('py-planner').href = '../room-planner/?pyeong=' + plannerPyeong(py);
    out.hidden = false;
  }

  function calcSize() {
    var w = num($('py-w')), h = num($('py-h'));
    var unit = document.querySelector('input[name="py-unit"]:checked');
    var isCm = unit && unit.value === 'cm';
    if (isCm) { w = w / 100; h = h / 100; }
    show(w && h ? areaFrom(w, h) : 0);
  }
  function calcM2() { show(num($('py-m2in'))); }
  function calcPy() { var p = num($('py-pyin')); show(p ? pyeongToM2(p) : 0); }

  function tab(name) {
    ['size', 'm2', 'py'].forEach(function (k) {
      var p = $('py-panel-' + k), b = $('py-tab-' + k);
      if (p) p.hidden = (k !== name);
      if (b) b.classList.toggle('on', k === name);
    });
    $('py-out').hidden = true;
  }

  document.addEventListener('DOMContentLoaded', function () {
    ['py-w', 'py-h'].forEach(function (id) { $(id).addEventListener('input', calcSize); });
    Array.prototype.forEach.call(document.querySelectorAll('input[name="py-unit"]'),
      function (r) { r.addEventListener('change', calcSize); });
    $('py-m2in').addEventListener('input', calcM2);
    $('py-pyin').addEventListener('input', calcPy);
    ['size', 'm2', 'py'].forEach(function (k) {
      $('py-tab-' + k).addEventListener('click', function () { tab(k); });
    });
    tab('size');
  });
})(typeof window !== 'undefined' ? window : globalThis);
