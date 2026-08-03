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

  // ── 아이폰에서 랭킹이 안 붙는 문제 (2026-08-03 사용자 신고) ──────────────────
  //  "아이폰에서 우리 서버 랭킹에 연결이 안돼"
  //
  //  진단: 워커는 어떤 Origin 으로 물어봐도 `Access-Control-Allow-Origin:
  //  https://joeltool.com` **하나만** 돌려준다(실측). 즉 오리진이 조금이라도
  //  다르면 브라우저가 막는다. 게다가 `*.workers.dev` 는 게임 도메인 입장에서
  //  **서드파티**라, iOS 의 추적 방지·콘텐츠 차단기·사설 릴레이 계열이 통째로
  //  끊어 버리는 일이 잦다(workers.dev 는 피싱에 자주 쓰여 차단 목록에 흔히 오른다).
  //  아이폰에서만 안 되는 증상과 앞뒤가 맞는다.
  //
  //  근본 해법은 **같은 오리진으로 부르는 것**이다. joeltool.com 은 Cloudflare
  //  프록시 뒤에 있으므로(실측: CF-RAY 응답) 워커에 `joeltool.com/api/*` 라우트를
  //  걸면 CORS 자체가 사라지고 서드파티 차단에도 안 걸린다.
  //
  //  ⚠ 라우트는 **Cloudflare 대시보드에서 사람이** 걸어야 한다(계정 권한).
  //    그래서 이 클라이언트는 **두 경로를 다 안다**: 같은 오리진을 먼저 찔러 보고
  //    안 되면 예전 주소로 돌아간다. 라우트가 없으면 지금과 똑같이 동작하고,
  //    라우트가 생기는 순간 아무 배포 없이 그쪽으로 옮겨 간다.
  SAME_ORIGIN_BASE: '/api',
  _base: null,          // 결정된 주소(한 번 정하면 기억한다)
  _probed: false,

  //  기기에 한 번 기록해 두면 다음 방문부터는 같은 오리진을 안 찔러도 된다.
  //  (라우트가 생기면 그때 한 번 성공하고 그 뒤로 계속 그쪽을 쓴다.)
  _loadBase: function () {
    if (this._base) return;
    try {
      var v = GAME.Store.get(this.BASE_KEY, null);
      if (v === this.SAME_ORIGIN_BASE && this._canSameOrigin()) this._base = v;
    } catch (e) { /* 저장소가 막혀 있으면 매번 탐색한다 */ }
  },

  //  같은 오리진을 시도할 자격이 있는가 — 실제 사이트 위에서만 의미가 있다.
  _canSameOrigin: function () {
    if (typeof location === 'undefined') return false;
    return /^https?:$/.test(location.protocol) &&
           /(^|\.)joeltool\.com$/.test(location.hostname || '');
  },

  // 서버가 분류별 랭킹(kind)을 지원하는지 — 한 번 확인하면 기억한다.
  //   null = 아직 모름 / true = 지원 / false = 옛 버전(로컬로 폴백)
  kindSupport: null,
  // 서버가 기지(배치도) 공유를 지원하는지. 같은 규약 — 없으면 랜덤매칭으로 폴백한다.
  baseSupport: null,

  enabled: function () { return !!this.API_BASE; },

  // ── 검증 도구는 **서버에 쓰지 않는다** (2026-07-30, 실제 사고) ──────────────
  // 헤드리스 probe 를 로컬이 아니라 **라이브 주소(joeltool.com)** 에 대고 돌린 적이 있다.
  // 그 probe 가 `시험` 이라는 닉네임으로 2기짜리 배치도를 저장했고, 그게 사용자 화면의
  // **대전 전장 목록에 남의 전장으로 떴다**(사용자 신고). 읽기만 하는 probe 라고 생각했지만
  // 대전 화면은 들어가는 순간 `syncBase` 로 자기 배치도를 올린다 — 읽기/쓰기 구분이
  // 호출부에 흩어져 있으면 사람이 못 지킨다.
  //
  // ⚠ **localhost 검사만으로는 이 사고를 못 막는다.** 워커 CORS 가
  //   `Access-Control-Allow-Origin: https://joeltool.com` 이라 로컬은 애초에 브라우저가
  //   막는다(즉 로컬은 원래 안전했다). 실제로 새어나간 경로는 **라이브 오리진 위에서 돈
  //   헤드리스 브라우저**다. 그래서 막아야 하는 신호는 주소가 아니라 '사람이 아님' 이다.
  //   `--headless=new` 로 띄운 Edge/Chrome 은 UA 에 `HeadlessChrome` 을 박는다(실측).
  //   실제 플레이어의 브라우저에는 절대 안 들어가므로 오탐이 없다.
  //
  // 관문은 `_fetch` **한 곳**에 둔다 — POST 면 무조건 여기서 걸린다. 우회 스위치는
  // **일부러 두지 않았다**(있으면 내가 그걸 쓰고 같은 사고를 다시 낸다). 쓰기 경로를
  // 시험해야 하면 `API_BASE` 를 개발용 Worker 로 바꿔서 볼 것.
  // 읽기는 막지 않는다 — 읽어서는 아무것도 오염되지 않는다.
  isProbe: function () {
    if (typeof navigator !== 'undefined') {
      var ua = navigator.userAgent || '';
      if (/Headless/i.test(ua) || navigator.webdriver === true) return true;
    }
    if (typeof location === 'undefined') return false;   // node 시뮬 — fetch 자체가 없다
    return location.protocol === 'file:' ||
           /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(location.hostname || '');
  },

  _fetch: function (path, opts) {
    if (!this.enabled()) return Promise.reject(new Error('API_BASE 미설정'));
    // node 시뮬(tools/sim.js)처럼 fetch 가 없는 환경에서도 이 파일이 로드된다.
    // 없는 전역을 부르면 ReferenceError 로 죽으므로 거절로 바꾼다(호출부는 폴백을 갖고 있다).
    if (typeof fetch !== 'function') return Promise.reject(new Error('fetch 없음'));
    if (opts && opts.method === 'POST' && this.isProbe()) {
      if (window.console) console.warn('[api] 검증 환경에서는 서버 쓰기를 보내지 않는다: ' + path);
      var blocked = new Error('검증 환경 쓰기 차단');
      // ⚠ 이 거절을 '서버가 그 기능을 지원하지 않음'으로 읽으면 안 된다.
      //   postBase 의 catch 가 baseSupport=false 로 내려버리면 로컬에서 남의 전장 목록이
      //   통째로 안 뜨고 랜덤매칭으로 폴백한다(막으려던 건 쓰기뿐이다).
      blocked.localBlock = true;
      return Promise.reject(blocked);
    }
    var self = this;
    this._loadBase();

    //  ── 타임아웃 (2026-08-03) ────────────────────────────────────────────────
    //  ⚠ **`fetch` 는 스스로 포기하지 않는다.** 연결이 막히거나 아주 느린 망에서는
    //    promise 가 영영 안 끝나고, 화면은 '불러오는 중'에서 멈춘 채로 남는다 —
    //    사용자에게는 그게 곧 "서버에 연결이 안 된다"로 보인다(아이폰 신고).
    //    실패는 **빨리** 해야 로컬 기록으로라도 되돌아갈 수 있다.
    //  ⚠ `AbortSignal.timeout()` 은 iOS 16+ 에서만 된다. 고치려는 대상이 구형
    //    아이폰일 수 있으므로 AbortController + setTimeout 으로 쓴다(iOS 12+).
    function withTimeout(base, ms) {
      var ctl = (typeof AbortController === 'function') ? new AbortController() : null;
      var o = {};
      if (opts) for (var k in opts) if (Object.prototype.hasOwnProperty.call(opts, k)) o[k] = opts[k];
      if (ctl) o.signal = ctl.signal;
      var timer = setTimeout(function () { if (ctl) ctl.abort(); }, ms);
      return fetch(base + path, o).then(function (r) {
        clearTimeout(timer);
        //  응답이 JSON 이 아니면 **그 경로는 없는 것**이다. `/api/*` 라우트가 없으면
        //  GitHub Pages 가 404 HTML 을 주는데, 그걸 성공으로 읽으면 랭킹이 조용히
        //  빈 화면이 된다. 그래서 본문 형식까지 확인한다.
        var ct = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
        if (ct.indexOf('json') < 0) throw new Error('경로 없음(' + r.status + ')');
        if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || r.status); });
        return r.json();
      }, function (e) {
        clearTimeout(timer);
        throw new Error(e && e.name === 'AbortError' ? '응답 없음(' + ms + 'ms 초과)'
                                                     : (e && e.message) || '연결 실패');
      });
    }
    function remember(err) { self.lastError = err && err.message ? err.message : String(err); throw err; }

    if (this._base) return withTimeout(this._base, this.TIMEOUT_MS).catch(remember);
    if (!this._canSameOrigin()) {
      this._base = this.API_BASE;
      return withTimeout(this._base, this.TIMEOUT_MS).catch(remember);
    }
    //  같은 오리진을 **짧게** 한 번만 찔러 본다. 여기서 오래 기다리면 라우트가 없는
    //  지금 상태에서 모든 첫 호출이 그만큼 늦어진다(실측: 404 응답까지 0.57초).
    return withTimeout(this.SAME_ORIGIN_BASE, this.PROBE_MS).then(function (v) {
      self._base = self.SAME_ORIGIN_BASE;
      GAME.Store.set(self.BASE_KEY, self.SAME_ORIGIN_BASE);
      return v;
    }, function () {
      self._base = self.API_BASE;
      return withTimeout(self.API_BASE, self.TIMEOUT_MS).catch(remember);
    });
  },

  //  ⚠ 값을 크게 잡으면 '멈춘 화면'이 길어지고, 작게 잡으면 느린 망에서 헛되이
  //    포기한다. 8초는 모바일 3G 왕복(실측 0.7초)의 10배가 넘는 여유다.
  TIMEOUT_MS: 8000,
  PROBE_MS: 2500,
  BASE_KEY: 'asymgame.apibase.v1',
  lastError: null,

  //  지금 어느 경로로 붙었는지 — 화면에 진단을 띄울 때 쓴다.
  activeBase: function () { return this._base || '(아직 결정 안 됨)'; },

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
        if (!e.localBlock) self.baseSupport = false;
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
