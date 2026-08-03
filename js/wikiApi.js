/* =========================================================
   위키 토끼굴 — 위키 API 계층
   - 이 파일은 네트워크를 몰라도 되는 순수 판정 함수 + URL 조립만 담는다.
     실제 fetch 는 wikiCrawl.js 가 한다(테스트를 쉽게 하려는 분리).
   - ⚠️ origin=* 를 빼면 브라우저에서 CORS 로 막힌다.
     2026-08-03 실측: origin=* 있으면 `access-control-allow-origin: *` 응답.
   ========================================================= */
var WIKI_API = "https://ko.wikipedia.org/w/api.php";
var WIKI_UA = "joeltool-wiki-rabbithole/1.0 (https://joeltool.com; contact@joeltool.com)";
var WIKI_MIN_INTRO = 300;   // 도입부가 이보다 짧으면 토막글로 보고 갈래에서 뺀다

/* 실측(2026-08-03): 심리학 링크 418개 중 앞부분이 연도·ISBN·기호였다
   (1010년 / 1590년 / ... / ISBN (식별자) / Ψ).
   그대로 두면 "다음 챕터: 1590년"이 뜬다. */
var WIKI_NOISE = [
  /^\d+년$/, /^\d+년대$/, /^\d+세기$/, /^\d+월\s*\d+일$/,
  /^ISBN/, /^ISSN/, /^DOI/, /^도이/,
  /식별자\)$/,
  /^[A-Za-z]$/, /^[Ͱ-Ͽ]$/,          // 단일 라틴/그리스 문자 (Ψ 등)
  /^분류:/, /^위키/, /^틀:/, /^파일:/, /^도움말:/, /^특수:/
];

function wikiIsNoise(title) {
  if (!title) return true;
  for (var i = 0; i < WIKI_NOISE.length; i++) {
    if (WIKI_NOISE[i].test(title)) return true;
  }
  return false;
}

function wikiIsSubstantial(introLength) {
  return (introLength || 0) >= WIKI_MIN_INTRO;
}

/* candidates: [{title, introLength}] → 노이즈·토막글을 뺀 제목 배열(최대 max개) */
function wikiPickNext(candidates, max) {
  var out = [];
  for (var i = 0; i < candidates.length && out.length < max; i++) {
    var c = candidates[i];
    if (wikiIsNoise(c.title)) continue;
    if (!wikiIsSubstantial(c.introLength)) continue;
    out.push(c.title);
  }
  return out;
}

var wikiUrl = {
  /* 본문 + 링크를 한 번에 — 요청 수를 절반으로 줄인다 */
  page: function (title) {
    return WIKI_API + "?action=query&prop=extracts%7Clinks&explaintext=1"
      + "&pllimit=500&plnamespace=0&format=json&origin=*&redirects=1"
      + "&titles=" + encodeURIComponent(title);
  },
  /* 도입부만 묶음 조회(최대 20개) — 갈래 후보를 거르는 용도 겸
     경계 문서의 요약으로 재사용한다(버리지 않는다) */
  intros: function (titles) {
    return WIKI_API + "?action=query&prop=extracts&exintro=1&explaintext=1"
      + "&format=json&origin=*&redirects=1"
      + "&titles=" + titles.map(encodeURIComponent).join("%7C");
  },
  search: function (q) {
    return WIKI_API + "?action=query&list=search&srlimit=5&format=json&origin=*"
      + "&srsearch=" + encodeURIComponent(q);
  }
};

/* 위키 extracts(explaintext)는 문단 제목을 "== 정의 ==", "=== 어원 ===" 처럼
   원문 마크업 그대로 준다. 그대로 뿌리면 미완성 화면처럼 보인다.
   여기서 블록 목록으로 바꿔주고, DOM 생성은 화면 쪽에서 한다(textContent 로만 —
   위키 본문을 innerHTML 에 넣지 않는다). */
function wikiRenderBlocks(text) {
  var out = [];
  (text || "").split(/\r?\n/).forEach(function (raw) {
    var line = raw.trim();
    if (!line) return;
    /* 여는 등호와 닫는 등호를 따로 잡아 개수가 같을 때만 제목으로 본다.
       역참조(\1)만 쓰면 "== 이상한 ===" 이 제목 "이상한 =" 으로 잘못 잡힌다. */
    var m = line.match(/^(=+)\s*(.+?)\s*(=+)$/);
    if (m && m[1].length === m[3].length && m[1].length >= 2 && m[1].length <= 6) {
      var title = m[2].trim();
      if (!title) return;
      /* 본문 가치가 없는 꼬리 절은 버린다 */
      if (/^(같이 보기|각주|참고 문헌|참고문헌|외부 링크|외부링크|출처)$/.test(title)) {
        out.push({ type: "cut" });
        return;
      }
      out.push({ type: "h", level: Math.min(m[1].length, 4), text: title });
      return;
    }
    out.push({ type: "p", text: line });
  });
  /* 첫 "cut" 이후는 통째로 잘라낸다 */
  var stop = -1;
  for (var i = 0; i < out.length; i++) { if (out[i].type === "cut") { stop = i; break; } }
  if (stop >= 0) out = out.slice(0, stop);
  return out;
}

function wikiSourceUrl(title) {
  return "https://ko.wikipedia.org/wiki/" + encodeURIComponent(title);
}
