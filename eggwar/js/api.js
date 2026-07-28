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

  // 서버가 분류별 랭킹(kind)을 지원하는지 — 한 번 확인하면 기억한다.
  //   null = 아직 모름 / true = 지원 / false = 옛 버전(로컬로 폴백)
  kindSupport: null,

  enabled: function () { return !!this.API_BASE; },

  _fetch: function (path, opts) {
    if (!this.enabled()) return Promise.reject(new Error('API_BASE 미설정'));
    return fetch(this.API_BASE + path, opts).then(function (r) {
      if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || r.status); });
      return r.json();
    });
  },

  // 점수 전송 — 실패해도 게임 진행에는 영향이 없다(로컬에 이미 기록됨).
  // 새 필드(tower/dtower/trophy/hero/gear)는 **옛 Worker 가 그냥 무시**한다.
  // 즉 서버를 배포하기 전에도 이 호출은 지금과 똑같이 동작한다.
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

  // 랭킹 조회.
  //   board('score', 'all')   기존 종합 점수 랭킹
  //   board('tower', 'week')  통곡의 탑 · 최근 7일
  //
  // ⚠ **옛 Worker 는 `kind` 를 모른다.** 그냥 무시하고 종합 점수 랭킹을 돌려주는데,
  //   그걸 '통곡의 탑 랭킹'이라고 화면에 붙이면 거짓 정보가 된다(층수 자리에 점수가 뜬다).
  //   그래서 새 Worker 는 응답에 `kind` 를 되돌려 준다 — 그게 없으면 옛 버전으로 보고
  //   거절해서 호출부가 **로컬 기록으로 폴백**하게 한다.
  board: function (kind, scope) {
    var k = kind || 'score';
    // 예전 시그니처 board(scope) 로 부른 곳이 있어도 깨지지 않게 한다
    if (scope === undefined && (k === 'live' || k === 'week' || k === 'all')) {
      scope = k; k = 'score';
    }
    var self = this;
    return this._fetch('/board?kind=' + encodeURIComponent(k) +
                       '&scope=' + encodeURIComponent(scope || 'all')).then(function (res) {
      var ok = !!(res && res.kind === k);
      if (k === 'score') {
        // 종합 랭킹은 옛 서버도 정확히 같은 모양을 준다 — 그대로 쓴다
        if (res && res.kind !== undefined) self.kindSupport = true;
        return res;
      }
      self.kindSupport = ok;
      if (!ok) {
        // '연결 실패'와 구분한다 — 화면 문구가 달라야 무엇을 고쳐야 할지 알 수 있다
        var err = new Error('서버가 아직 분류별 랭킹을 지원하지 않습니다(로컬 기록 표시)');
        err.legacy = true;
        throw err;
      }
      return res;
    });
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
