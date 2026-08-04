/* 위키 토끼굴 — 앱 셸 캐시.
   본문은 IndexedDB 에 있으므로 여기서는 HTML/CSS/JS 만 캐시한다.
   ⚠️ 위키 API 응답은 캐시하지 않는다(용량 폭증 + 최신성 혼란).
      오프라인에서 위키 호출이 실패하는 건 정상이고, 화면이 그걸 안내한다. */
/* ⚠️ 배포할 때마다 이 이름과 아래 SHELL 의 ?v= 를 **반드시 함께** 올린다.
   안 올리면 SW 가 옛 JS 를 계속 서빙해서 고친 게 반영되지 않는다.
   (2026-08-03 개발 중 실제로 이것 때문에 수정 전 코드가 돌아 오진단할 뻔했다.) */
var CACHE = "wr-shell-v0.07";
var SHELL = [
  "./",
  "./index.html",
  "../css/style.css?v=0.14",
  "../css/wikiRabbithole.css?v=0.07",
  "../js/site.js?v=0.14",
  "../js/wikiApi.js?v=0.07",
  "../js/wikiStore.js?v=0.07",
  "../js/wikiCrawl.js?v=0.07",
  "../js/wikiRabbithole.js?v=0.07"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      /* addAll 은 하나만 실패해도 설치가 통째로 실패한다. 개별로 담는다. */
      return Promise.all(SHELL.map(function (u) {
        return c.add(u)["catch"](function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (ks) {
      return Promise.all(ks.filter(function (k) { return k !== CACHE; })
                           .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var url;
  try { url = new URL(e.request.url); } catch (err) { return; }
  /* 위키 API·광고는 가로채지 않는다 */
  if (url.hostname.indexOf("wikipedia.org") !== -1) return;
  if (url.hostname.indexOf("googlesyndication") !== -1) return;

  e.respondWith(
    caches.match(e.request).then(function (hit) {
      if (hit) return hit;
      return fetch(e.request)["catch"](function () {
        /* 오프라인에서 문서 요청이면 앱 셸을 돌려준다 */
        return caches.match("./index.html");
      });
    })
  );
});
