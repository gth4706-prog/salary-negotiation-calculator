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
  // 서버가 기지(배치도) 공유를 지원하는지. 같은 규약 — 없으면 랜덤매칭으로 폴백한다.
  baseSupport: null,

  enabled: function () { return !!this.API_BASE; },

  _fetch: function (path, opts) {
    if (!this.enabled()) return Promise.reject(new Error('API_BASE 미설정'));
    // node 시뮬(tools/sim.js)처럼 fetch 가 없는 환경에서도 이 파일이 로드된다.
    // 없는 전역을 부르면 ReferenceError 로 죽으므로 거절로 바꾼다(호출부는 폴백을 갖고 있다).
    if (typeof fetch !== 'function') return Promise.reject(new Error('fetch 없음'));
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

  // ── 기지(배치도) 공유 — 대전 상대를 '사람'으로 채우기 위한 것 ─────────────
  // 옛 Worker 에는 이 두 경로가 없다(404 → 거절). 호출부(js/arena.js)는 그걸
  // 잡아서 **랜덤매칭**으로 내려간다. 즉 서버가 옛 버전이어도 게임은 그대로 돈다.

  // 내 기지를 올린다. 실패해도 게임 진행에는 영향이 없다(로컬 기지는 그대로).
  postBase: function (id, formation, trophy) {
    var self = this;
    if (!this.enabled() || !id || !formation || !formation.units || !formation.units.length) {
      return Promise.resolve(null);
    }
    var body = {
      id: id,
      trophy: trophy || 0,
      // 대전 전략가가 예산으로 산 유닛 등급. 이걸 안 보내면 남이 내 진형을 칠 때
      // 전부 Lv.1 로 싸운다 — 내가 낸 돈이 상대 화면에서는 없는 것이 된다.
      unitLv: (GAME.ArenaBuild ? GAME.ArenaBuild.get().unitLv : null) || {},
      formation: {
        name: formation.name,
        tier: formation.tier,
        budget: formation.budget,
        units: formation.units.map(function (u) {
          return { type: u.type, nx: u.nx, ny: u.ny };
        })
      }
    };
    return this._fetch('/base', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) { self.baseSupport = true; return r; })
      .catch(function (e) {
        self.baseSupport = false;
        if (window.console) console.warn('기지 업로드 실패(로컬 기지는 유지):', e.message);
        return null;
      });
  },

  // 남의 기지 목록. **성공했을 때만** resolve 한다 — 실패/옛 서버는 reject 해서
  // 호출부가 '사람 진형 0개'와 '못 받아옴'을 구분할 수 있게 한다.
  // 방어 결과 보고 — 격파율의 근거를 서버에 모은다.
  // **실패해도 조용히 넘어간다.** 이건 통계이지 게임 진행이 아니라, 여기서 막히면
  // 전투가 끝나지 않는 것처럼 보이는 쪽이 더 나쁘다.
  defResult: function (targetId, defended) {
    if (!this.enabled() || !targetId) return Promise.resolve(null);
    return this._fetch('/defresult', {
      method: 'POST',
      body: JSON.stringify({ target: targetId, defended: !!defended })
    })['catch'](function () { return null; });
  },

  bases: function (excludeId, n) {
    var self = this;
    return this._fetch('/bases?exclude=' + encodeURIComponent(excludeId || '') +
                       '&n=' + (n || 12)).then(function (res) {
      if (!res || res.kind !== 'bases' || !(res.rows instanceof Array)) {
        self.baseSupport = false;
        var err = new Error('서버가 아직 배치도 공유를 지원하지 않습니다');
        err.legacy = true;
        throw err;
      }
      self.baseSupport = true;
      return res.rows;
    });
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
