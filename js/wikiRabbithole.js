/* =========================================================
   위키 토끼굴 — 화면 제어
   화면 4개를 섹션 표시/숨김으로 전환한다(오버레이 금지 — CSS 주석 참고).
   ⚠️ alert()/confirm() 금지. 오류는 인라인으로 보여준다(사이트 공통 규칙,
      2026-08-03 커플 재판·방 배치에서 네이티브 모달을 전부 걷어냈다).
   ========================================================= */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  if (!$("wr-seed")) return;

  var TARGET = 150;
  var state = { bundleId: null, current: null, later: [] };
  var stopFlag = false;

  function show(id) {
    ["wr-seed", "wr-progress", "wr-read", "wr-trail"].forEach(function (s) {
      $(s).hidden = (s !== id);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function err(msg) { var e = $("wr-seed-error"); e.textContent = msg; e.hidden = false; }
  function clearErr() { $("wr-seed-error").hidden = true; }

  /* 위키는 브라우저 User-Agent 를 쓰므로 Api-User-Agent 로 우리 신원을 밝힌다.
     (User-Agent 헤더는 브라우저가 덮어써서 직접 설정할 수 없다.) */
  function api(url) {
    return fetch(url, { headers: { "Api-User-Agent": WIKI_UA } }).then(function (r) {
      if (!r.ok) throw new Error("http " + r.status);
      return r.json();
    });
  }

  /* ---------- 오프라인 표시 ---------- */
  function syncOnline() { $("wr-offline").hidden = navigator.onLine; }
  window.addEventListener("online", syncOnline);
  window.addEventListener("offline", syncOnline);
  syncOnline();

  /* ---------- 씨앗 검색 (동음이의 해소) ---------- */
  function search() {
    var q = $("wr-q").value.trim();
    clearErr();
    if (!q) { err("주제를 입력해 주세요."); return; }
    if (!navigator.onLine) { err("문서를 받으려면 인터넷 연결이 필요해요. 이미 받아둔 굴은 아래에서 열 수 있습니다."); return; }
    $("wr-results").innerHTML = "<p class='desc'>찾는 중…</p>";
    api(wikiUrl.search(q)).then(function (j) {
      var hits = (j.query && j.query.search) || [];
      $("wr-results").innerHTML = "";
      if (!hits.length) { err("그 주제로 문서를 찾지 못했어요. 다른 말로 해보세요."); return; }
      hits.forEach(function (h) {
        var b = document.createElement("button");
        b.type = "button"; b.className = "wr-hit";
        var strong = document.createElement("b");
        strong.textContent = h.title;
        var span = document.createElement("span");
        /* snippet 에 <span class="searchmatch"> 가 섞여 오므로 태그를 지우고 텍스트만 쓴다 */
        span.textContent = (h.snippet || "").replace(/<[^>]*>/g, "");
        b.appendChild(strong); b.appendChild(span);
        b.addEventListener("click", function () { startCrawl(h.title); });
        $("wr-results").appendChild(b);
      });
    })["catch"](function () {
      $("wr-results").innerHTML = "";
      err("검색에 실패했어요. 잠시 후 다시 시도해 주세요.");
    });
  }
  $("wr-search").addEventListener("click", search);
  $("wr-q").addEventListener("keydown", function (e) { if (e.key === "Enter") search(); });

  /* ---------- 수집 ---------- */
  $("wr-stop").addEventListener("click", function () {
    stopFlag = true;
    $("wr-stop").textContent = "마무리하는 중…";
  });

  function startCrawl(seed) {
    stopFlag = false;
    $("wr-stop").textContent = "여기까지만 받기";
    $("wr-prog-title").textContent = "「" + seed + "」에서 시작하는 굴을 파는 중";
    $("wr-bar").style.width = "0%";
    $("wr-prog-text").textContent = "준비 중";
    show("wr-progress");

    wikiCrawl.run({
      seed: seed, target: TARGET, fetchImpl: api, store: wikiStore,
      shouldStop: function () { return stopFlag; },
      onProgress: function (p) {
        $("wr-bar").style.width = Math.round(p.done / p.target * 100) + "%";
        $("wr-prog-text").textContent = p.done + " / " + p.target + "편 — " + p.title;
      }
    }).then(function (r) {
      state.bundleId = r.bundleId;
      if (!r.count) {
        show("wr-seed");
        err("그 주제에서는 이어갈 문서를 찾지 못했어요. 조금 더 일반적인 주제로 해보세요.");
        return;
      }
      return openArticle(seed);
    })["catch"](function () {
      show("wr-seed");
      err("받는 중에 문제가 생겼어요. 인터넷 상태를 확인하고 다시 시도해 주세요.");
    });
  }

  /* ---------- 읽기 ---------- */
  function openArticle(title) {
    return wikiStore.getArticle(state.bundleId, title).then(function (a) {
      if (!a) return;
      state.current = title;
      $("wr-title").textContent = a.title;
      $("wr-body").textContent = a.text;

      /* CC BY-SA 는 출처 표시가 조건이다 — 문서마다 원문 링크를 건다 */
      var src = $("wr-source"); src.innerHTML = "";
      var link = document.createElement("a");
      link.href = wikiSourceUrl(a.title);
      link.target = "_blank"; link.rel = "noopener";
      link.textContent = "위키백과 원문";
      src.appendChild(document.createTextNode("출처: "));
      src.appendChild(link);
      src.appendChild(document.createTextNode(" · CC BY-SA 3.0"));

      return wikiStore.pushTrail(state.bundleId, a.title).then(function () {
        return renderNext(a.nextTitles || []);
      });
    }).then(function () { show("wr-read"); });
  }

  function renderNext(titles) {
    var box = $("wr-next");
    box.innerHTML = "";
    if (!titles.length) {
      var p = document.createElement("p");
      p.className = "desc";
      p.textContent = "이 문서에서 이어갈 갈래를 찾지 못했어요. 지나온 길에서 다른 곳으로 가보세요.";
      box.appendChild(p);
      return Promise.resolve();
    }
    return Promise.all(titles.map(function (t) {
      return wikiStore.getArticle(state.bundleId, t).then(function (a) {
        if (a) return { t: t, have: true };
        return wikiStore.getSummary(state.bundleId, t).then(function (s) {
          return { t: t, have: false, intro: s ? s.intro : "" };
        });
      });
    })).then(function (rows) {
      rows.forEach(function (r) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "wr-next-btn" + (r.have ? "" : " missing");
        var strong = document.createElement("b");
        strong.textContent = r.t;
        var tag = document.createElement("span");
        tag.className = "wr-tag";
        b.appendChild(strong); b.appendChild(tag);

        if (r.have) {
          tag.textContent = "받아둠 · 바로 읽기";
          b.addEventListener("click", function () { openArticle(r.t); });
        } else {
          var head = (r.intro || "").slice(0, 90);
          tag.textContent = (head ? head + "… · " : "") + "받아두지 않았어요 — 눌러서 나중에 읽기에 담기";
          b.addEventListener("click", function () {
            if (state.later.indexOf(r.t) === -1) state.later.push(r.t);
            tag.textContent = "나중에 읽기에 담았어요";
          });
        }
        box.appendChild(b);
      });
    });
  }

  /* ---------- 궤적 ---------- */
  $("wr-show-trail").addEventListener("click", function () {
    wikiStore.getTrail(state.bundleId).then(function (rows) {
      var ol = $("wr-trail-list"); ol.innerHTML = "";
      rows.forEach(function (r) {
        var li = document.createElement("li");
        li.textContent = r.title;
        ol.appendChild(li);
      });
      var lb = $("wr-later"); lb.innerHTML = "";
      $("wr-later-h").hidden = state.later.length === 0;
      state.later.forEach(function (t) {
        var b = document.createElement("button");
        b.type = "button"; b.className = "wr-hit";
        var strong = document.createElement("b"); strong.textContent = t;
        var span = document.createElement("span");
        span.textContent = navigator.onLine
          ? "이 주제로 새 굴 파기"
          : "인터넷이 되면 이 주제로 새 굴을 팔 수 있어요";
        b.appendChild(strong); b.appendChild(span);
        b.addEventListener("click", function () {
          if (!navigator.onLine) return;
          startCrawl(t);
        });
        lb.appendChild(b);
      });
      show("wr-trail");
    });
  });
  $("wr-trail-back").addEventListener("click", function () {
    if (state.current) openArticle(state.current); else show("wr-seed");
  });
  $("wr-back-home").addEventListener("click", function () {
    listBundles(); clearErr(); show("wr-seed");
  });

  /* ---------- 받아둔 굴 목록 ---------- */
  function listBundles() {
    return wikiStore.listBundles().then(function (bs) {
      var box = $("wr-bundles"); box.innerHTML = "";
      if (!bs.length) return;
      var h = document.createElement("h3");
      h.className = "wr-next-h"; h.textContent = "받아둔 굴";
      box.appendChild(h);
      bs.sort(function (a, b) { return b.createdAt - a.createdAt; }).forEach(function (b0) {
        var row = document.createElement("div"); row.className = "wr-bundle";
        var open = document.createElement("button");
        open.type = "button"; open.className = "wr-bundle-open";
        open.textContent = b0.seedTitle + " · " + b0.articleCount + "편";
        open.addEventListener("click", function () {
          state.bundleId = b0.id; state.later = [];
          openArticle(b0.seedTitle);
        });
        var del = document.createElement("button");
        del.type = "button"; del.className = "wr-bundle-del"; del.textContent = "삭제";
        del.addEventListener("click", function () {
          wikiStore.deleteBundle(b0.id).then(listBundles);
        });
        row.appendChild(open); row.appendChild(del);
        box.appendChild(row);
      });
    });
  }

  /* Service Worker 등록 — 이게 있어야 비행기 모드에서 페이지가 열린다.
     실패해도 온라인에서는 정상 동작하므로 조용히 넘어간다. */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js", { scope: "./" })["catch"](function () {});
    });
  }

  listBundles();
})();
