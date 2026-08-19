// 계란들의 전쟁 서비스 워커 — **자산 캐시 + 오프라인 폴백** (v2, 2026-08-19)
//
// v1 은 일부러 아무것도 캐시하지 않았다(설치 조건용 최소 워커). 앱(WebView 래퍼)을
// 스토어에 올리면서 두 가지가 필요해져 캐시를 켠다:
//   ① 두 번째 실행부터 즉시 로드(매 실행 전량 다운로드 제거)
//   ② 불안정한 회선에서도 게임이 뜬다(랭킹·실시간 대전만 온라인 필요)
//
// ⚠⚠ v1 이 캐시를 겁냈던 이유("버전을 올렸는데 옛 파일이 뜬다")는 **설계로 피한다**:
//   · 자산 URL 에는 전부 `?v=` 가 박혀 있다 → 캐시 키가 곧 버전이다. 새 배포 = 새
//     URL = 자동 캐시 미스. 옛 파일이 새 버전에 낄 구조가 없다.
//   · 유일한 무버전 진입점 index.html 은 **네트워크 우선**이다 — 온라인이면 언제나
//     방금 배포한 판을 받고, 캐시는 오프라인일 때만 쓰는 뒷문이다.
//   · 같은 경로의 옛 버전 항목은 새 버전을 캐시할 때 지운다(무한 누적 방지).
//
// ⚠ 절대 캐시하지 않는 것:
//   · `/api/` (랭킹 워커 라우트 — 같은 오리진이라 명시적으로 걸러야 한다)
//   · 교차 출처 전부(workers.dev 등) · GET 아닌 요청 전부
//   · WebSocket 은 서비스 워커가 애초에 못 가로챈다 — 실시간 대전은 영향 0.
//
// 비상 정지(전 사용자 즉시 원복): 이 파일을 아래 한 줄로 바꿔 배포한다.
//   self.addEventListener('install', function () { self.registration.unregister(); });
var CACHE = 'eggwar-v2';

self.addEventListener('install', function (e) {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    var names = await caches.keys();
    await Promise.all(names.map(function (n) {
      return n === CACHE ? Promise.resolve() : caches.delete(n);
    }));
    await self.clients.claim();
  })());
});

//  캐시해도 되는 요청인가 — 같은 오리진 GET 정적 자산만.
function cacheable(req) {
  if (req.method !== 'GET') return false;
  var u;
  try { u = new URL(req.url); } catch (e) { return false; }
  if (u.origin !== self.location.origin) return false;
  if (u.pathname.indexOf('/api/') === 0) return false;
  return true;
}

//  같은 경로의 다른 버전(?v=) 항목을 지운다 — 배포를 거듭해도 캐시가 안 붓게.
async function dropOldVersions(cache, url) {
  var u = new URL(url);
  if (!u.searchParams.has('v')) return;
  var keys = await cache.keys();
  for (var i = 0; i < keys.length; i++) {
    var k = new URL(keys[i].url);
    if (k.origin === u.origin && k.pathname === u.pathname && keys[i].url !== url)
      await cache.delete(keys[i]);
  }
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (!cacheable(req)) return;               // respondWith 안 부르면 브라우저 기본 동작

  //  ── 문서(index.html) — 네트워크 우선, 오프라인일 때만 캐시 ──────────────
  if (req.mode === 'navigate') {
    e.respondWith((async function () {
      try {
        var fresh = await fetch(req);
        if (fresh && fresh.ok) {
          var c = await caches.open(CACHE);
          await c.put(req, fresh.clone());
        }
        return fresh;
      } catch (err) {
        var hit = await caches.match(req, { ignoreSearch: true });
        if (hit) return hit;
        throw err;
      }
    })());
    return;
  }

  //  ── 정적 자산 — 캐시 우선(URL 에 버전이 박혀 있어 불변), 미스면 받고 저장 ──
  e.respondWith((async function () {
    var hit = await caches.match(req);
    if (hit) return hit;
    var res = await fetch(req);
    //  200 기본 응답만 저장한다 — 오류·부분 응답을 캐시하면 그게 곧 고장의 화석이 된다.
    if (res && res.ok && res.type === 'basic') {
      try {
        var c = await caches.open(CACHE);
        await dropOldVersions(c, req.url);
        await c.put(req, res.clone());
      } catch (err) { /* 저장 실패는 조용히 — 게임은 네트워크 응답으로 계속 간다 */ }
    }
    return res;
  })());
});

//  비상 정지 — 페이지에서 postMessage({type:'unregister'}) 를 보내면 스스로 해제.
self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'unregister') self.registration.unregister();
});
