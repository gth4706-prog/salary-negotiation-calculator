window.GAME = window.GAME || {};

// ============================================================================
//  클라우드 저장 — "기기를 바꿔도 내 진행이 따라온다" (대격변 v3 · E 갈래, 2026-09-02)
//
//  서버: 03-webtool-adsense/workers/arena-api/worker.js 의 `/cloud/put` · `/cloud/get`
//  계정 진행(아래 SLOTS)을 한 덩어리(스냅샷)로 올리고, 로그인 직후 내려받아 **병합**한다.
//
//  ── 원칙 ────────────────────────────────────────────────────────────────────
//  · PIN 이 있어야 돈다. PIN 은 로그인 화면(GAME.Auth.verify)이 받아서 `begin(id, pin)`
//    으로 넘겨 주고, 이 모듈은 **세션 동안 메모리에만** 둔다. localStorage 에 평문으로
//    두지 않는다(기기를 뺏긴 순간 끝이고, 애초에 보관할 이유가 없다).
//  · **더 앞선 진행을 뒤로 되돌리지 않는다.** 병합 규칙은 MERGE 표(아래)가 갖는다.
//    서버는 스냅샷 내용을 모른다 — 규칙이 클라이언트에 있어야 게임을 고칠 때마다
//    워커를 같이 배포하지 않아도 된다.
//  · 골드는 **서버 우선**(중복 지급 방지). 골드로 산 것(장비·능력치·유닛 레벨·정련·
//    증원)은 골드와 **한 덩어리**라 같이 서버를 따른다 — 골드는 서버, 장비는 로컬을
//    섞으면 "돈도 있고 산 것도 있는" 캐릭터가 된다.
//  · 네트워크 실패는 **조용히**(다음 기회에). 서버가 404 를 주면(미배포) 기능을 끄고
//    `status()` 가 '서버 대기' 를 돌려준다. 로그인은 절대 막지 않는다.
//  · **검증 환경(`Api.isProbe()`)에서는 한 바이트도 쓰지 않는다** — 헤드리스 probe 가
//    실사용자 데이터를 오염시킨 사고(js/api.js 주석)의 재발 방지. 읽기도 안 한다
//    (읽어서 되는 일이 없다 — 병합은 곧 쓰기다).
//
//  ── 언제 올리나 ────────────────────────────────────────────────────────────
//  `push()` 는 5초 디바운스다. 판 끝·상점·메뉴 진입에서 마음껏 불러도 된다 — 5초 안에
//  몇 번을 불러도 한 번만 나가고, 내용이 마지막으로 올린 것과 같으면 **아예 안 나간다**
//  (서버도 무변화 put 은 KV 에 안 쓴다). `pull()` 은 로그인 직후 한 번.
//
//  ── 병합 규칙 (MERGE) ───────────────────────────────────────────────────────
//  | 칸(k)   | 저장 키                     | 규칙 |
//  |---------|-----------------------------|------|
//  | char    | asymgame.towerchar.v1       | **서버 우선(덩어리)** — 골드·장비·능력치·스킬·픽·시드 전부. 서버에 없으면 로컬 유지 |
//  | tower   | asymgame.tower.v1           | best·runs·clears = **max**, floor 등 나머지 = 서버(캐릭터와 짝) |
//  | dtower  | asymgame.deftower.v2        | best·runs·kills = **max**, 골드·유닛레벨·정련·증원·배치·회차 = 서버 |
//  | ach     | eggwar.ach.v1               | done = **합집합**(먼저 달성한 시각), c(카운터) = 키별 **max**, title = 서버(없으면 로컬), pending = 로컬(토스트는 기기 것) |
//  | daily   | eggwar.dailyq.v1            | 날짜가 다르면 **더 늦은 날짜**가 통째로, 같은 날이면 n·done = max · paid = OR(중복 지급 방지) · total = max · owed = 서버(골드와 짝) |
//  | prog    | eggwar.prog.v1              | lv/xp/total = **total 이 큰 쪽**(xp 는 레벨 안 잔량이라 따로 max 하면 거짓), titles = 합집합, att = last 가 늦은 쪽(같으면 streak max), att.total = max, owed = 서버 |
//  | rt      | eggwar.rtscore              | best·wins·losses = **max**, score(현재 점수) = 서버 |
//  | abuild  | asymgame.arenabuild.v1      | **서버 우선(덩어리)** — 빌드는 설정이다 |
//  공통: 서버 칸이 없으면 로컬 유지, 로컬 칸이 없으면 서버 그대로.
//  ⚠ "서버가 더 새로울 때만" 내려받는다 — 이 기기가 마지막으로 맞춘 시각(SYNC_KEY 의 at)
//    보다 서버 updatedAt 이 늦을 때만 restore 를 돈다. 내가 마지막으로 올린 뒤 아무도
//    안 올렸으면 로컬이 곧 최신이라 서버(=내 옛 스냅샷)로 되돌릴 이유가 없다.
//  ⚠ 캐릭터 **삭제**는 클라우드로 전파되지 않는다(서버에 칸이 없으면 로컬 유지 규칙).
//    "지웠는데 다른 기기에서 살아난다"가 될 수 있다 — 되돌리기 쉬운 쪽(살아남)을 택했다.
// ============================================================================
GAME.CloudSave = {
  VER: 1,                       // 스냅샷 스키마 판 번호(서버 `ver`)
  DEBOUNCE_MS: 5000,
  SYNC_KEY: 'eggwar.cloud.sync.v1',      // { [id]: { at, hash } } — 비밀 아님(시각·해시)

  //  null = 아직 모름 · true = 서버가 이 기능을 안다 · false = 404(미배포) → '서버 대기'
  supported: null,
  lastError: null,

  _id: null,
  _pin: null,                   // ⚠ 메모리에만. 어디에도 저장하지 않는다.
  _disabledWhy: null,           // PIN 불일치 등 — 이번 세션은 더 시도하지 않는다
  _lastHash: null,              // 마지막으로 서버에 올린(또는 서버와 같다고 확인한) 스냅샷 해시
  _timer: null,
  _waiters: null,
  _inflight: null,
  _log: [],                     // 최근 결과(진단용, ?diag=1 이 읽을 수 있다)

  // ── 저장 칸 ───────────────────────────────────────────────────────────────
  //  key() 는 **모듈의 KEY 를 그때그때 읽는다** — 문자열을 여기 복사하면 키를 바꿀 때 갈라진다.
  SLOTS: [
    { k: 'char',   key: function () { return GAME.TowerChar && GAME.TowerChar.KEY; },       merge: 'char' },
    { k: 'tower',  key: function () { return GAME.Tower && GAME.Tower.KEY; },               merge: 'tower' },
    { k: 'dtower', key: function () { return GAME.DefendTower && GAME.DefendTower.KEY; },   merge: 'dtower' },
    { k: 'ach',    key: function () { return GAME.Achievements && GAME.Achievements.KEY; }, merge: 'ach' },
    { k: 'daily',  key: function () { return GAME.Daily && GAME.Daily.KEY; },               merge: 'daily' },
    { k: 'prog',   key: function () { return GAME.Progress && GAME.Progress.KEY; },         merge: 'prog' },
    { k: 'rt',     key: function () { return GAME.RtScore && GAME.RtScore.KEY; },           merge: 'rt' },
    { k: 'abuild', key: function () { return GAME.ArenaBuild && GAME.ArenaBuild.KEY; },     merge: 'abuild' }
  ],

  // ── 상태 ─────────────────────────────────────────────────────────────────
  available: function () {
    if (!GAME.Api || !GAME.Api.enabled || !GAME.Api.enabled()) return false;
    if (GAME.Api.isProbe && GAME.Api.isProbe()) return false;
    return this.supported !== false;
  },
  armed: function () { return this.available() && !!this._id && !!this._pin && !this._disabledWhy; },

  //  화면·진단용 한 줄. 통합자가 메뉴/프로필에 그대로 띄워도 된다.
  status: function () {
    if (!GAME.Api || !GAME.Api.enabled || !GAME.Api.enabled()) return '서버 없음';
    if (GAME.Api.isProbe && GAME.Api.isProbe()) return '검증 환경';
    if (this.supported === false) return '서버 대기';
    if (this._disabledWhy) return this._disabledWhy;
    if (!this._id || !this._pin) return 'PIN 필요';
    if (this.lastError) return '연결 실패 — 다음에 다시';
    var rec = this._syncRec(this._id);
    if (rec.at) return '동기화됨 ' + this._hhmm(rec.at);
    return '대기 중';
  },
  //  PIN 없는 계정에게 보여 줄 한 줄(로그인 화면·메뉴가 쓴다).
  HINT: 'PIN 을 설정하면 다른 기기에서도 이어집니다.',

  // ── 세션 ─────────────────────────────────────────────────────────────────
  //  로그인 화면이 PIN 확인에 성공한 직후 부른다. pull 까지 한 번에 한다.
  //  ⚠ `Account.login(id)` 가 **먼저** 끝나 있어야 한다 — 저장 칸이 계정 이름으로 갈린다.
  begin: function (id, pin) {
    this.end();
    if (!id || !pin) return Promise.resolve({ ok: false, why: 'PIN 필요' });
    this._id = id;
    this._pin = String(pin);
    return this.pull();
  },
  //  로그아웃·다른 닉네임으로 전환 — PIN 을 메모리에서 지운다.
  end: function () {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    var ws = this._waiters || [];
    this._waiters = null;
    for (var i = 0; i < ws.length; i++) ws[i]({ ok: false, why: '세션 종료' });
    this._id = null; this._pin = null; this._disabledWhy = null;
    this._lastHash = null; this.lastError = null;
  },
  hasPin: function () { return !!this._pin; },

  // ── 스냅샷 ───────────────────────────────────────────────────────────────
  //  { v, id, at, s: { char, tower, … } } — 각 칸은 그 닉네임의 값만 뗀다(Transfer 와 같은
  //  규율: 통째로 담으면 이 기기의 **다른 사람 기록까지** 서버로 간다).
  snapshot: function (id) {
    id = id || this._id || (GAME.Account && GAME.Account.current && GAME.Account.current());
    if (!id) return null;
    var out = { v: this.VER, id: id, at: Date.now(), s: {} };
    var n = 0;
    for (var i = 0; i < this.SLOTS.length; i++) {
      var slot = this.SLOTS[i], key = slot.key();
      if (!key) continue;
      var all = GAME.Store.get(key, {}) || {};
      if (!Object.prototype.hasOwnProperty.call(all, id)) continue;
      out.s[slot.k] = this._clone(all[id]);
      n++;
    }
    return n ? out : null;
  },

  // ── 복원(병합) ───────────────────────────────────────────────────────────
  //  data = 서버가 돌려준 스냅샷. 돌려주는 것: { changed, slots:[바뀐 칸], localAhead }
  //  ⚠ 직접 부를 일은 거의 없다 — pull() 이 "서버가 더 새로울 때" 만 부른다.
  restore: function (data, id) {
    id = id || this._id;
    var res = { changed: false, slots: [] };
    if (!id || !data || typeof data !== 'object' || !data.s || typeof data.s !== 'object') return res;
    var s = data.s;
    for (var i = 0; i < this.SLOTS.length; i++) {
      var slot = this.SLOTS[i];
      if (!Object.prototype.hasOwnProperty.call(s, slot.k)) continue;
      var key = slot.key();
      if (!key) continue;
      var all = GAME.Store.get(key, {}) || {};
      var local = Object.prototype.hasOwnProperty.call(all, id) ? all[id] : undefined;
      var remote = this._clone(s[slot.k]);
      var merged = this.MERGE[slot.merge].call(this, this._clone(local), remote);
      if (merged === undefined) continue;
      if (JSON.stringify(merged) !== JSON.stringify(local)) {
        all[id] = merged;
        GAME.Store.set(key, all);
        res.changed = true;
        res.slots.push(slot.k);
      }
    }
    return res;
  },

  //  병합 규칙 — 전부 **순수 함수**(l = 로컬, r = 서버). tools/cloudsave-audit.js 가 직접 검사한다.
  //  공통 전제: r 이 없으면 l, l 이 없으면 r.
  MERGE: {
    char: function (l, r) { return r === undefined ? l : r; },

    tower: function (l, r) {
      if (r === undefined) return l;
      if (!l) return r;
      var o = this._clone(r) || {};
      o.best = Math.max(l.best || 0, r.best || 0);
      o.runs = Math.max(l.runs || 0, r.runs || 0);
      o.clears = Math.max(l.clears || 0, r.clears || 0);
      return o;
    },

    dtower: function (l, r) {
      if (r === undefined) return l;
      if (!l) return r;
      var o = this._clone(r) || {};
      o.best = Math.max(l.best || 0, r.best || 0);
      o.runs = Math.max(l.runs || 0, r.runs || 0);
      o.kills = Math.max(l.kills || 0, r.kills || 0);
      return o;
    },

    ach: function (l, r) {
      if (r === undefined) return l;
      if (!l) return r;
      var o = this._clone(r) || {};
      o.done = o.done || {}; o.c = o.c || {};
      var ld = l.done || {}, lc = l.c || {}, k;
      for (k in ld) if (Object.prototype.hasOwnProperty.call(ld, k) && ld[k]) {
        //  둘 다 달성했으면 **먼저** 달성한 시각을 남긴다.
        o.done[k] = o.done[k] ? Math.min(o.done[k], ld[k]) : ld[k];
      }
      for (k in lc) if (Object.prototype.hasOwnProperty.call(lc, k)) {
        o.c[k] = Math.max(Number(o.c[k]) || 0, Number(lc[k]) || 0);
      }
      if (o.title === undefined || o.title === null) o.title = (l.title === undefined ? null : l.title);
      o.pending = Array.isArray(l.pending) ? l.pending.slice() : [];
      return o;
    },

    daily: function (l, r) {
      if (r === undefined) return l;
      if (!l) return r;
      var ld = String(l.date || ''), rd = String(r.date || '');
      var o;
      if (ld !== rd) {
        //  더 늦은 날짜가 통째로. total 은 누적이라 max, owed 는 골드와 짝이라 서버.
        o = this._clone(ld > rd ? l : r) || {};
        o.total = Math.max(l.total || 0, r.total || 0);
        o.owed = r.owed || 0;
        o.pending = Array.isArray(l.pending) ? l.pending.slice() : [];
        return o;
      }
      o = this._clone(r) || {};
      o.t = o.t || {};
      var lt = l.t || {};
      for (var k in lt) if (Object.prototype.hasOwnProperty.call(lt, k)) {
        var a = lt[k] || {}, b = o.t[k] || { n: 0, done: 0, paid: 0 };
        b.n = Math.max(a.n || 0, b.n || 0);
        //  done 은 시각(0 = 미완). 둘 다 있으면 먼저 것.
        b.done = (a.done && b.done) ? Math.min(a.done, b.done) : (a.done || b.done || 0);
        b.paid = (a.paid || b.paid) ? 1 : 0;
        o.t[k] = b;
      }
      o.total = Math.max(l.total || 0, r.total || 0);
      o.owed = r.owed || 0;
      o.pending = Array.isArray(l.pending) ? l.pending.slice() : [];
      return o;
    },

    prog: function (l, r) {
      if (r === undefined) return l;
      if (!l) return r;
      //  A 갈래(js/progress.js)가 자기 규칙을 내놓으면 그것을 우선한다.
      if (GAME.Progress && typeof GAME.Progress.cloudMerge === 'function') {
        return GAME.Progress.cloudMerge(l, r);
      }
      var base = ((l.total || 0) > (r.total || 0)) ? l : r;
      var o = this._clone(r) || {};
      o.lv = base.lv; o.xp = base.xp; o.total = base.total;
      o.titles = o.titles || {};
      var lt = l.titles || {};
      for (var k in lt) if (Object.prototype.hasOwnProperty.call(lt, k) && lt[k]) {
        o.titles[k] = o.titles[k] ? Math.min(o.titles[k], lt[k]) : lt[k];
      }
      if (o.title === undefined || o.title === null) o.title = (l.title === undefined ? null : l.title);
      o.owed = r.owed || 0;
      o.pending = Array.isArray(l.pending) ? l.pending.slice() : [];
      var la = l.att || {}, ra = r.att || {};
      var ll = String(la.last || ''), rl = String(ra.last || '');
      var att = this._clone(ll > rl ? la : ra) || {};
      if (ll === rl) att.streak = Math.max(la.streak || 0, ra.streak || 0);
      att.total = Math.max(la.total || 0, ra.total || 0);
      o.att = att;
      return o;
    },

    rt: function (l, r) {
      if (r === undefined) return l;
      if (!l) return r;
      var o = this._clone(r) || {};
      o.best = Math.max(l.best || 0, r.best || 0);
      o.wins = Math.max(l.wins || 0, r.wins || 0);
      o.losses = Math.max(l.losses || 0, r.losses || 0);
      return o;
    },

    abuild: function (l, r) { return r === undefined ? l : r; }
  },

  // ── 올리기 ───────────────────────────────────────────────────────────────
  //  5초 디바운스. 돌려주는 promise 는 **실제로 나간 결과**로 풀린다(검증용).
  //  opts.now = true 면 즉시.
  push: function (opts) {
    if (!this.armed()) return Promise.resolve({ ok: false, why: this.status() });
    if (opts && opts.now) return this._flush();
    var self = this;
    if (!this._waiters) this._waiters = [];
    var p = new Promise(function (res) { self._waiters.push(res); });
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(function () {
      self._timer = null;
      var ws = self._waiters || []; self._waiters = null;
      self._flush().then(function (r) { for (var i = 0; i < ws.length; i++) ws[i](r); });
    }, this.DEBOUNCE_MS);
    return p;
  },

  _flush: function () {
    var self = this;
    if (!this.armed()) return Promise.resolve({ ok: false, why: this.status() });
    if (this._inflight) return this._inflight.then(function () { return self._flush(); });
    var id = this._id, pin = this._pin;
    var snap = this.snapshot(id);
    if (!snap) return Promise.resolve({ ok: false, why: '올릴 진행이 없다' });
    var h = this._hash(JSON.stringify(snap.s));
    if (h === this._lastHash) return Promise.resolve({ ok: true, skipped: true });
    this._inflight = GAME.Api.cloudPut(id, pin, this.VER, snap).then(function (r) {
      self._inflight = null;
      if (!r || r.kind !== 'cloud') { self.supported = false; return self._note({ ok: false, why: '서버 대기' }); }
      self.supported = true; self.lastError = null;
      self._lastHash = h;
      self._rememberSync(id, r.updatedAt || Date.now(), h);
      return self._note({ ok: true, updatedAt: r.updatedAt, unchanged: !!r.unchanged, bytes: r.bytes });
    }, function (e) { self._inflight = null; return self._fail(e); });
    return this._inflight;
  },

  // ── 내려받기 ─────────────────────────────────────────────────────────────
  //  로그인 직후 한 번. 서버가 더 새로우면 병합해서 내려받고, 병합 뒤 로컬이 서버와
  //  다르면(로컬이 앞선 칸이 있었다) 곧장 올린다 — 그래야 다음 기기가 합집합을 받는다.
  pull: function () {
    var self = this;
    if (!this.armed()) return Promise.resolve({ ok: false, why: this.status() });
    var id = this._id, pin = this._pin;
    return GAME.Api.cloudGet(id, pin).then(function (r) {
      if (!r || r.kind !== 'cloud') { self.supported = false; return self._note({ ok: false, why: '서버 대기' }); }
      self.supported = true; self.lastError = null;
      var res = { ok: true, restored: false, slots: [] };
      if (!r.found) {
        //  서버가 비어 있다 → 로컬을 올린다(첫 기기).
        self._lastHash = null;
        return self._flush().then(function (pr) { res.pushed = !!pr.ok; return self._note(res); });
      }
      var mine = self._syncRec(id);
      if ((r.updatedAt || 0) > (mine.at || 0)) {
        var m = self.restore(r.data, id);
        res.restored = m.changed; res.slots = m.slots;
      }
      var snap = self.snapshot(id);
      var h = snap ? self._hash(JSON.stringify(snap.s)) : null;
      var sh = self._hash(JSON.stringify((r.data && r.data.s) || {}));
      if (h === sh) {
        self._lastHash = h;
        self._rememberSync(id, r.updatedAt || Date.now(), h);
        return self._note(res);
      }
      self._lastHash = null;
      return self._flush().then(function (pr) { res.pushed = !!pr.ok; return self._note(res); });
    }, function (e) { return self._fail(e); });
  },

  // ── 실패 분류 ────────────────────────────────────────────────────────────
  //  · 404/경로 없음 → 서버가 아직 이 기능을 모른다: 끄고 '서버 대기'
  //  · PIN 불일치·PIN 없음 → 이 세션은 더 안 한다(계속 두드리면 잠긴다)
  //  · 검증 환경 차단(localBlock) → 조용히
  //  · 그 밖(연결 실패·시간 초과) → 다음 기회에 다시(해시를 안 올려 두므로 재시도된다)
  _fail: function (e) {
    var msg = (e && e.message) ? String(e.message) : String(e || '실패');
    if (e && e.localBlock) return this._note({ ok: false, why: '검증 환경' });
    if (/^not found$/i.test(msg) || /경로 없음/.test(msg)) {
      this.supported = false;
      return this._note({ ok: false, why: '서버 대기' });
    }
    if (/PIN/.test(msg) || /잠겼습니다/.test(msg)) {
      this._disabledWhy = msg;
      this._pin = null;
      return this._note({ ok: false, why: msg });
    }
    this.lastError = msg;
    return this._note({ ok: false, why: msg, retry: true });
  },

  // ── 보조 ─────────────────────────────────────────────────────────────────
  _note: function (r) {
    this._log.push({ t: Date.now(), r: r });
    if (this._log.length > 20) this._log.shift();
    return r;
  },
  _syncRec: function (id) {
    var all = GAME.Store.get(this.SYNC_KEY, {}) || {};
    return all[id] || { at: 0, hash: null };
  },
  _rememberSync: function (id, at, hash) {
    var all = GAME.Store.get(this.SYNC_KEY, {}) || {};
    all[id] = { at: at || Date.now(), hash: hash || null };
    GAME.Store.set(this.SYNC_KEY, all);
  },
  _clone: function (v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); },
  //  djb2 — 암호가 아니라 "같은 내용인가" 만 본다.
  _hash: function (s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36) + '.' + s.length;
  },
  _hhmm: function (ms) {
    var d = new Date(ms);
    var h = d.getHours(), m = d.getMinutes();
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
};
