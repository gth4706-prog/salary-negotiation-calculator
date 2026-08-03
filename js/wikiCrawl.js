/* =========================================================
   위키 토끼굴 — BFS 수집기
   설계 요점(스펙 2026-08-03):
     · 본문+링크는 문서당 1요청, 도입부는 20개씩 묶음 — 요청 수를 줄인다
     · 도입부 조회 결과를 버리지 않고 "안 받은 갈래"의 요약으로 재사용한다
     · 위키 예의로 요청 사이에 간격을 둔다(기본 1000ms). 테스트는 0으로 준다.
   fetchImpl 을 주입받는 이유: 테스트에서 실제 위키를 부르지 않기 위해서다.
   ========================================================= */
(function (global) {
  var INTRO_BATCH = 20;   // 위키 titles 파라미터 안전 상한
  var MAX_NEXT = 8;       // 한 문서에서 보여줄 다음 챕터 수

  function pagesOf(json) {
    var q = json && json.query;
    if (!q || !q.pages) return [];
    return Object.keys(q.pages).map(function (k) { return q.pages[k]; });
  }

  function classifyNext(nextTitles, inBundleSet) {
    var have = [], missing = [];
    (nextTitles || []).forEach(function (t) {
      if (inBundleSet.has(t)) have.push(t); else missing.push(t);
    });
    return { have: have, missing: missing };
  }

  function sleep(ms) {
    return ms > 0 ? new Promise(function (r) { setTimeout(r, ms); }) : Promise.resolve();
  }

  /* 갈래 후보를 "필요한 만큼만" 확보한다.
     ⚠️ 2026-08-03 실측 교훈: 처음엔 문서의 링크 400여 개 **전부**의 도입부를 조회했는데,
     문서 하나 처리에 20초 넘게 걸려 150편이 사실상 불가능했다. 실제로 필요한 건
     MAX_NEXT(8)개뿐이므로, 20개씩 조회하다가 충분해지면 즉시 멈춘다.
     대부분 첫 묶음에서 8개가 채워져 문서당 요청이 1~2건으로 줄어든다. */
  function collectNext(titles, fetchImpl, cache, delayMs, want) {
    var good = [];
    var i = 0;

    function enough() {
      good = [];
      for (var k = 0; k < titles.length && good.length < want; k++) {
        var c = cache[titles[k]];
        if (c && wikiIsSubstantial(c.len)) good.push(titles[k]);
      }
      return good.length >= want;
    }

    function nextChunk() {
      if (enough() || i >= titles.length) return Promise.resolve(good);
      var chunk = [];
      while (i < titles.length && chunk.length < INTRO_BATCH) {
        var t = titles[i++];
        if (!(t in cache) && chunk.indexOf(t) === -1) chunk.push(t);
      }
      if (!chunk.length) return nextChunk();

      return fetchImpl(wikiUrl.intros(chunk)).then(function (j) {
        pagesOf(j).forEach(function (p) {
          if (p && p.title) {
            cache[p.title] = { len: (p.extract || "").length, intro: p.extract || "" };
          }
        });
        /* 응답에 안 온 제목(리다이렉트·삭제 등)도 0으로 채워 무한 재조회를 막는다 */
        chunk.forEach(function (t) { if (!(t in cache)) cache[t] = { len: 0, intro: "" }; });
        return sleep(delayMs).then(nextChunk);
      });
    }

    return nextChunk().then(function () { enough(); return good; });
  }

  function run(opts) {
    var seed = opts.seed;
    var target = opts.target || 150;
    var fetchImpl = opts.fetchImpl;
    var store = opts.store;
    var onProgress = opts.onProgress || function () {};
    var shouldStop = opts.shouldStop || function () { return false; };
    var delayMs = opts.delayMs === undefined ? 1000 : opts.delayMs;
    var bundleId = opts.bundleId || ("b" + Date.now());

    var queue = [seed];
    var queued = {};       // 큐에 넣었거나 이미 처리한 제목
    var introCache = {};   // 제목 → {len, intro}
    queued[seed] = true;
    var count = 0;

    function step() {
      if (count >= target || queue.length === 0 || shouldStop()) return Promise.resolve();
      var title = queue.shift();

      return fetchImpl(wikiUrl.page(title)).then(function (json) {
        var p = pagesOf(json)[0];
        if (!p || p.missing !== undefined) return null;

        var text = p.extract || "";
        var links = (p.links || []).map(function (x) { return x.title; })
          .filter(function (t) { return !wikiIsNoise(t); });

        return collectNext(links, fetchImpl, introCache, delayMs, MAX_NEXT).then(function (nextTitles) {
          var cache = introCache;

          return store.putArticle(bundleId, {
            title: p.title, text: text, nextTitles: nextTitles, fetchedAt: Date.now()
          }).then(function () {
            count++;
            onProgress({ done: count, target: target, title: p.title });

            /* 갈래로 채택된 것들: 아직 안 받았으면 큐에 넣고,
               도입부는 "안 받은 갈래"용 요약으로 저장해 둔다(버리지 않는다). */
            var jobs = nextTitles.map(function (t) {
              var job = store.putSummary(bundleId, {
                title: t, intro: (cache[t] && cache[t].intro) || ""
              });
              if (!queued[t]) { queued[t] = true; queue.push(t); }
              return job;
            });
            return Promise.all(jobs);
          });
        });
      }).then(function () {
        return sleep(delayMs);
      }).then(step);
    }

    return step().then(function () {
      return store.putBundle({
        id: bundleId, seedTitle: seed, createdAt: Date.now(),
        articleCount: count, bytes: 0
      });
    }).then(function () {
      return { bundleId: bundleId, count: count };
    });
  }

  global.wikiCrawl = { run: run, classifyNext: classifyNext };
})(typeof window !== "undefined" ? window : globalThis);
