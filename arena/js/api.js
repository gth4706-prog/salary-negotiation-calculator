window.GAME = window.GAME || {};

// 서버 연동 계층.
//
// joeltool.com 은 GitHub Pages(정적)라 서버 코드를 못 돌린다. 그래서 서버는
// Cloudflare Worker + KV 가 담당하고, 이 파일이 그 API 를 호출한다.
//
//   API_BASE 가 비어 있으면 → 로컬 전용(localStorage)으로 동작한다.
//   실제 Worker 주소를 넣으면 → 점수·랭킹·닉네임이 전역으로 공유된다.
//
// 워커 소스: 03-webtool-adsense/workers/arena-api/worker.js
GAME.Api = {
  // Cloudflare Worker 주소. 여기가 살아 있으면 전역 랭킹으로 동작하고,
  // 응답이 없거나 아직 코드가 배포되지 않았으면 조용히 로컬 기록으로 되돌아간다.
  API_BASE: 'https://arena-api.gth3941.workers.dev',

  enabled: function () { return !!this.API_BASE; },

  _fetch: function (path, opts) {
    if (!this.enabled()) return Promise.reject(new Error('API_BASE 미설정'));
    return fetch(this.API_BASE + path, opts).then(function (r) {
      if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || r.status); });
      return r.json();
    });
  },

  // 점수 전송 — 실패해도 게임 진행에는 영향이 없다(로컬에 이미 기록됨)
  postScore: function (entry) {
    if (!this.enabled()) return Promise.resolve(null);
    return this._fetch('/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    }).catch(function (e) {
      if (window.console) console.warn('점수 전송 실패(로컬 기록은 유지):', e.message);
      return null;
    });
  },

  board: function (scope) {
    return this._fetch('/board?scope=' + encodeURIComponent(scope || 'all'));
  },

  me: function (id) {
    return this._fetch('/me?id=' + encodeURIComponent(id));
  },

  names: function (token) {
    return this._fetch('/names', { headers: token ? { 'X-Admin-Token': token } : {} });
  },

  moderate: function (id, patch, token) {
    var h = { 'Content-Type': 'application/json' };
    if (token) h['X-Admin-Token'] = token;
    var body = { id: id };
    for (var k in patch) body[k] = patch[k];
    return this._fetch('/moderate', { method: 'POST', headers: h, body: JSON.stringify(body) });
  }
};

// Store 에 원격 훅을 연결한다 — 서버가 켜져 있으면 isRemote() 가 true 가 되고
// 랭킹 화면 문구도 '전체 플레이어 기준'으로 바뀐다.
if (GAME.Api.enabled()) {
  GAME.Store.remote = {
    push: function () { /* 점수는 GAME.Api.postScore 로 개별 전송한다 */ }
  };
}
