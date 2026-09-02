window.GAME = window.GAME || {};

// ============================================================================
//  오늘의 과제 (대격변 v3 · W2 메타 시스템, 2026-09-02)
//  ---------------------------------------------------------------------------
//  하루 3과제. KST 자정에 바뀌고, **날짜가 시드**라 같은 날은 누구나 같은 3개다
//  (기기·계정이 달라도 "오늘 과제가 뭐야"가 한 가지 답을 갖는다).
//
//  · 저장: `eggwar.dailyq.v1` — 계정별. (메뉴의 접속 보상 `eggwar.daily.<계정>` 과 다른 키다.)
//      { [계정]: { date, order:[key], t:{key:{n,done,paid}}, owed, pending:[key], total } }
//  · 보상 = 통곡의 탑 골드(30/50/80). 캐릭터(`GAME.TowerChar.get()`)가 있으면 즉시
//    `rec.gold += r; TowerChar._save(rec)`, 없으면 `owed` 에 쌓았다가 캐릭터가 생긴 뒤
//    `settle()` 에서 지급한다(과제 완료가 보상 없이 증발하지 않는다).
//  · `emit(event, payload)` 는 js/achievements.js 와 **같은 이벤트 이름**을 받는다.
//    통합자는 한 곳에서 둘을 나란히 부른다:
//        GAME.Achievements.emit('kill', { n: 3 });  GAME.Daily.emit('kill', { n: 3 });
//  · 완료 토스트는 `GAME.MetaToast`(achievements.js) 큐에 넣는다 — 화면에 띄우는 것은
//    `GAME.Achievements.flush(scene)` 하나로 둘 다 처리된다.
//  · 중복 지급 금지: `paid` 표식. 날짜가 바뀌면 과제·진행이 리셋되고 `owed` 만 이월.
//  ⚠ 시각은 `now()` 를 거친다 — 감사 도구가 `_clock` 을 꽂아 날짜를 넘겨 본다.
// ============================================================================
GAME.Daily = {
  KEY: 'eggwar.dailyq.v1',
  COUNT: 3,
  KST_OFFSET: 9 * 3600e3,

  //  과제 풀. ev = 받는 이벤트, goal = 목표 횟수, reward = 탑 골드.
  //  match(payload) 가 있으면 참일 때만 센다. count(payload) 가 있으면 그만큼 더한다.
  POOL: [
    { key: 'tower1',    name: '통곡의 탑 1층 오르기', ev: 'towerClear',  goal: 1,  reward: 30 },
    { key: 'rt1',       name: '실시간 대전 1판',      ev: 'rtResult',    goal: 1,  reward: 50,
      match: function (p) { return !(p && p.practice); } },
    { key: 'dtower1',   name: '수성의 탑 1회 막기',   ev: 'dtowerClear', goal: 1,  reward: 50 },
    { key: 'kill30',    name: '적 30기 처치',         ev: 'kill',        goal: 30, reward: 50,
      count: function (p) { return Math.max(1, Math.round(Number(p && p.n) || 1)); } },
    { key: 'orb3',      name: '구슬 3개 줍기',        ev: 'orb',         goal: 3,  reward: 30,
      count: function (p) { return Math.max(1, Math.round(Number(p && p.n) || 1)); } },
    { key: 'practice1', name: '연습 대전 1승',        ev: 'rtResult',    goal: 1,  reward: 30,
      match: function (p) { return !!(p && p.practice && p.won); } },
    { key: 'boss1',     name: '보스 1기 처치',        ev: 'bossKill',    goal: 1,  reward: 80,
      count: function (p) { return Math.max(1, Math.round(Number(p && p.n) || 1)); } }
  ],

  _poolOf: function (key) {
    for (var i = 0; i < this.POOL.length; i++) if (this.POOL[i].key === key) return this.POOL[i];
    return null;
  },

  // ── 시각 · 날짜 ──────────────────────────────────────────────────────────
  _clock: null,
  now: function () { return this._clock ? this._clock() : Date.now(); },

  //  KST 자정 기준 'YYYY-MM-DD'. UTC+9 를 더한 뒤 UTC 게터로 읽으면 기기 시간대와 무관하다.
  dateKey: function (ms) {
    var d = new Date((ms === undefined ? this.now() : ms) + this.KST_OFFSET);
    var m = d.getUTCMonth() + 1, day = d.getUTCDate();
    return d.getUTCFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  },

  // ── 결정적 선택 ──────────────────────────────────────────────────────────
  //  날짜 문자열 → 32비트 해시 → xorshift 로 피셔-예이츠. 같은 날짜는 언제나 같은 3개.
  _hash: function (s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h || 1;
  },
  pick: function (dateKey) {
    var x = this._hash(String(dateKey));
    var rnd = function () {
      x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
      return x / 4294967296;
    };
    var keys = this.POOL.map(function (p) { return p.key; });
    for (var i = keys.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = keys[i]; keys[i] = keys[j]; keys[j] = t;
    }
    return keys.slice(0, this.COUNT);
  },

  // ── 저장 ─────────────────────────────────────────────────────────────────
  _acct: function () {
    return (GAME.Account && GAME.Account.current && GAME.Account.current()) || 'guest';
  },
  _all: function () { return GAME.Store.get(this.KEY, {}) || {}; },
  _save: function (rec) {
    var all = this._all();
    all[this._acct()] = rec;
    GAME.Store.set(this.KEY, all);
  },

  //  오늘 기록. 날짜가 다르면 새로 만든다(owed·total 만 이월).
  get: function () {
    var today = this.dateKey();
    var rec = this._all()[this._acct()];
    if (!rec || rec.date !== today || !rec.t || !rec.order) {
      var owed = rec && rec.owed ? rec.owed : 0;
      var total = rec && rec.total ? rec.total : 0;
      rec = { date: today, order: this.pick(today), t: {}, owed: owed, pending: [], total: total };
      for (var i = 0; i < rec.order.length; i++) rec.t[rec.order[i]] = { n: 0, done: 0, paid: 0 };
      this._save(rec);
    }
    if (!rec.pending) rec.pending = [];
    return rec;
  },

  //  화면용 목록: [{ key, name, goal, cur, reward, done, paid }]
  tasks: function () {
    var rec = this.get();
    var out = [];
    for (var i = 0; i < rec.order.length; i++) {
      var d = this._poolOf(rec.order[i]);
      var s = rec.t[rec.order[i]] || { n: 0, done: 0, paid: 0 };
      if (!d) continue;
      out.push({ key: d.key, name: d.name, goal: d.goal, cur: Math.min(d.goal, s.n || 0),
                 reward: d.reward, done: !!s.done, paid: !!s.paid, ev: d.ev });
    }
    return out;
  },

  doneCount: function () {
    var t = this.tasks(), n = 0;
    for (var i = 0; i < t.length; i++) if (t[i].done) n++;
    return n;
  },

  // ── 이벤트 ───────────────────────────────────────────────────────────────
  //  반환: 이번 호출로 완료된 과제 key 배열.
  emit: function (event, payload) {
    var rec = this.get();
    var fresh = [];
    for (var i = 0; i < rec.order.length; i++) {
      var d = this._poolOf(rec.order[i]);
      if (!d || d.ev !== event) continue;
      if (d.match && !d.match(payload)) continue;
      var s = rec.t[d.key];
      if (!s) s = rec.t[d.key] = { n: 0, done: 0, paid: 0 };
      if (s.done) continue;
      s.n = (s.n || 0) + (d.count ? d.count(payload) : 1);
      if (s.n >= d.goal) {
        s.done = this.now();
        rec.total = (rec.total || 0) + 1;
        rec.pending.push(d.key);
        fresh.push(d.key);
      }
    }
    if (!fresh.length) { this._save(rec); return fresh; }
    //  보상 — 지급 가능하면 바로, 아니면 보류(owed).
    for (var f = 0; f < fresh.length; f++) {
      var fd = this._poolOf(fresh[f]);
      var paidNow = this._pay(fd.reward);
      if (paidNow) rec.t[fd.key].paid = 1; else rec.owed = (rec.owed || 0) + fd.reward;
      GAME.MetaToast.push('📜 오늘의 과제 완료 — ' + fd.name + '   ·   +' + fd.reward + ' 골드' +
        (paidNow ? '' : ' (캐릭터를 만들면 지급)'), { sound: 'coin' });
    }
    this._save(rec);
    //  업적 '성실한 계란' 이 이 신호로 센다.
    if (GAME.Achievements && GAME.Achievements.emit) {
      GAME.Achievements.emit('dailyDone', { n: fresh.length });
    }
    if (GAME.Progress && GAME.Progress.emit) GAME.Progress.emit('dailyDone', { n: fresh.length });
    return fresh;
  },

  //  통곡의 탑 골드로 지급. 캐릭터가 없으면 false.
  _pay: function (amount) {
    if (!GAME.TowerChar || !GAME.TowerChar.get) return false;
    var ch = GAME.TowerChar.get();
    if (!ch) return false;
    ch.gold = (ch.gold || 0) + Math.round(amount);
    GAME.TowerChar._save(ch);
    return true;
  },

  //  보류된 보상을 지급한다(캐릭터가 생긴 뒤 — 메뉴·탑·프로필 진입 시 부르면 된다).
  //  반환: 이번에 지급한 골드.
  settle: function () {
    var rec = this.get();
    var owed = rec.owed || 0;
    if (!owed) return 0;
    if (!this._pay(owed)) return 0;
    rec.owed = 0;
    //  오늘 과제 중 미지급 표식도 함께 정리한다(표시용).
    for (var k in rec.t) if (rec.t.hasOwnProperty(k) && rec.t[k].done) rec.t[k].paid = 1;
    this._save(rec);
    GAME.MetaToast.push('📜 보류된 과제 보상 지급 — +' + owed + ' 골드', { sound: 'coin' });
    return owed;
  },

  owed: function () { return this.get().owed || 0; },

  // ── 알림 ─────────────────────────────────────────────────────────────────
  pending: function () { return this.get().pending.slice(); },
  takePending: function () {
    var rec = this.get();
    var out = rec.pending.slice();
    rec.pending = [];
    this._save(rec);
    return out;
  },
  //  큐가 유실된 뒤(새로고침 등) pending 을 토스트 큐에 되살린다 — Achievements.flush 가 쓴다.
  requeue: function () {
    var keys = this.takePending();
    for (var i = 0; i < keys.length; i++) {
      var d = this._poolOf(keys[i]);
      if (d) GAME.MetaToast.push('📜 오늘의 과제 완료 — ' + d.name + '   ·   +' + d.reward + ' 골드',
        { sound: 'coin' });
    }
    return keys;
  },
  flush: function (scene) {
    if (GAME.Achievements && GAME.Achievements.flush) return GAME.Achievements.flush(scene);
    this.requeue();
    GAME.MetaToast.flush(scene);
    return [];
  }
};
