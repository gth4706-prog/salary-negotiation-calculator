// Egg War 서비스 워커 — **의도적으로 아무것도 캐시하지 않는다.**
//
// 왜 있나: 안드로이드 크롬이 '앱 설치'(홈 화면에 추가 → standalone 실행)를 제안하려면
// manifest 외에 **fetch 핸들러를 가진 서비스 워커**가 등록돼 있어야 한다.
// 우리가 원하는 건 오프라인 동작이 아니라 **주소창 없는 화면**이다.
//
// 왜 캐시를 안 하나: 이 저장소는 배포마다 `?v=` 를 올려 캐시를 갱신하는 구조다.
// 서비스 워커가 자산을 선캐시하면 그 규율 위에 두 번째 캐시 계층이 얹혀
// "버전을 올렸는데도 옛 파일이 뜨는" 사고가 난다. 이미 그 계열 사고를 겪었다.
// 그래서 fetch 는 **그대로 네트워크로 흘려보내기만** 한다.
//
// 되돌리는 법: 이 파일 내용을 아래 한 줄로 바꿔 배포하면 스스로 사라진다.
//   self.addEventListener('install', () => self.registration.unregister());
var VERSION = 'eggwar-sw-v1';

self.addEventListener('install', function (e) {
  // 새 워커를 곧바로 활성화한다 — 탭을 두 번 닫았다 열게 만들지 않는다.
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    // 과거에 만들어졌을 수 있는 캐시를 전부 지운다(이 워커는 캐시를 쓰지 않는다).
    var names = await caches.keys();
    await Promise.all(names.map(function (n) { return caches.delete(n); }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function (e) {
  // 설치 조건을 만족시키기 위한 최소 핸들러.
  // 문서 요청만 통과시키고 나머지는 브라우저 기본 동작에 맡긴다(respondWith 를 안 부르면 기본).
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request));
});

// 비상 정지 — 페이지에서 postMessage({type:'unregister'}) 를 보내면 스스로 등록 해제한다.
self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'unregister') self.registration.unregister();
});
