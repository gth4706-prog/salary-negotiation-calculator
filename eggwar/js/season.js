window.GAME = window.GAME || {};

// ============================================================================
//  시즌 프레임 (시즌 2 「다섯 세계」 · S-F, 2026-09-03)
//  ---------------------------------------------------------------------------
//  통곡의 탑을 **다섯 세계**로 읽는 틀. 층은 그대로인데 "지금 어느 세계에 있고, 어디까지
//  정복했는가"가 메뉴·프로필·랭킹·허브에 한 줄로 선다. 세계 경계는 S-W 플랜
//  (docs/superpowers/plans/2026-09-03-season2.md §1 S-W)의 값을 **그대로** 쓴다:
//
//      1~30 초원 · 31~60 안개늪 · 61~100 잿더미 · 101~150 균열 · 151+ 폭풍 하늘
//
//  · 저장: `eggwar.season.v1` — 계정별(`GAME.Account.current() || 'guest'`).
//      { [계정]: { seasonId, worlds:{key:{entered, boss}}, earned, spent, log:[{n,why,t}],
//                  coopWins, best:{tower, dtower}, claimed:{n:시각}, owed,
//                  history:{시즌id:{claimed, best, at}} } }
//  · **세계 포인트**(화폐): 세계 첫 진입 +1 · 세계 보스 처치 +2 · 협동 승 +1.
//      earnWorldPoint(n, why) / spendWorldPoint(n) / worldPoints()
//    S-H(스킬 진화·특성)가 `spendWorldPoint` 로 쓴다. 잔액 = earned − spent.
//  · 정복 판정은 **층 하나로** 한다(`_applyFloor`): 층 f 를 깼으면 from ≤ f 인 세계는 전부
//    '진입', boss ≤ f 인 세계는 전부 '정복'. 세계마다 조건 코드를 따로 두지 않는다 —
//    업적(js/achievements.js)이 카운터 하나로 판정하는 것과 같은 이유(두 번 달성·안 달성).
//    세계 보스 층 = 세계의 마지막 층(30·60·100·150), 폭풍 하늘은 첫 50주기 보스(200).
//  · 시즌 보상 표(`REWARDS`): 세계 정복 수 1~5 → 골드(+칭호는 세계 업적이 준다).
//      claimable() → 받을 수 있는 줄 / claim(scene) → 지급(1회, `claimed` 표식).
//    골드는 js/daily.js 와 같은 경로 — 캐릭터가 있으면 즉시, 없으면 `owed` 에 두었다가
//    `settle()` 에서 지급한다(보상이 증발하지 않는다).
//  · 시즌 전환: `CURRENT.id` 가 저장된 `seasonId` 와 다르면 `_rollover` — **정복·포인트·
//    협동 승은 보존**, `claimed`·`best` 만 history 로 내리고 새로 시작한다.
//  · 이벤트 `emit(event, payload)` — 통합자가 battle/defendtower 에서 Achievements 와
//    나란히 부른다(이름은 achievements.js 와 같다):
//        emit('towerClear', { floor })   세계 진입·보스 처치 판정 (+ best.tower)
//        emit('coopWin')                 협동 승 +1 포인트 (+ coopWins)
//        emit('dtowerClear', { run })    시즌 기록(best.dtower)만
//    ⚠ 세계 정복 업적(`worldConquer`)은 **여기서** Achievements 로 보낸다 — 세계를 아는
//      곳이 여기뿐이다. `coopWin` 은 통합자가 Achievements 에도 따로 보내므로 여기서
//      전달하지 않는다(두 번 세는 사고 방지).
//  ⚠ 씬·Phaser 에 의존하지 않는다(claim 의 scene 은 토스트 flush 용) — tools/sim.js
//    샌드박스에 올려 헤드리스로 감사한다(tools/season-audit.js). 시각은 `now()` 를 거친다.
// ============================================================================
GAME.Season = {
  KEY: 'eggwar.season.v1',
  KST_OFFSET: 9 * 3600e3,

  CURRENT: { id: 2, name: '다섯 세계', start: '2026-09-03', end: '2026-11-30' },

  //  세계 5 — 이름·경계는 S-W 플랜 값 그대로. color 는 UI.TIER 팔레트(대비 검증된 값).
  //  ⚠ name 은 폭 6.5자 이하(메뉴 진행 칸·허브 한 줄). tools/season-audit.js 가 잰다.
  WORLDS: [
    { key: 'meadow', name: '초원',      from: 1,   to: 30,       boss: 30,  color: 0x4ade80, icon: '🌿' },
    { key: 'mire',   name: '안개늪',    from: 31,  to: 60,       boss: 60,  color: 0x6bb8ff, icon: '🌫' },
    { key: 'ash',    name: '잿더미',    from: 61,  to: 100,      boss: 100, color: 0xf0a86a, icon: '🌋' },
    { key: 'rift',   name: '균열',      from: 101, to: 150,      boss: 150, color: 0xb3a8ff, icon: '⛰' },
    { key: 'storm',  name: '폭풍 하늘', from: 151, to: Infinity, boss: 200, color: 0xffd166, icon: '🌩' }
  ],

  //  세계 포인트 적립 표. 감사·문서가 이 표를 읽는다 — 판정은 emit 한 곳.
  POINTS: { enter: 1, boss: 2, coop: 1 },

  //  시즌 보상 — 세계 정복 수 n 에 도달하면 골드. 칭호는 n 번째 세계의 업적이 준다
  //  (정복은 단조라 "정복 수 n" = "n 번째 세계 정복"이다). 액수는 그 층대 누적 골드의
  //  1/10 언저리(30층 누적 2.3k · 60층 24k · 100층 55k — CLAUDE.md 골드 5차 곡선).
  REWARDS: [
    { n: 1, gold: 300,   achKey: 's2_world_meadow' },
    { n: 2, gold: 1500,  achKey: 's2_world_mire' },
    { n: 3, gold: 5000,  achKey: 's2_world_ash' },
    { n: 4, gold: 12000, achKey: 's2_world_rift' },
    { n: 5, gold: 30000, achKey: 's2_world_storm' }
  ],

  // ── 시각 ─────────────────────────────────────────────────────────────────
  _clock: null,
  now: function () { return this._clock ? this._clock() : Date.now(); },

  //  'YYYY-MM-DD' → 그날 KST 00:00 의 ms. end 는 그날 자정까지 포함한다(endMs = 다음날 0시).
  _dayMs: function (s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return 0;
    return Date.UTC(+m[1], +m[2] - 1, +m[3]) - this.KST_OFFSET;
  },
  startMs: function () { return this._dayMs(this.CURRENT.start); },
  endMs: function () { return this._dayMs(this.CURRENT.end) + 864e5; },
  //  남은 일수(오늘 포함). 종료일 당일은 1, 지나면 0.
  daysLeft: function (ms) {
    var t = ms === undefined ? this.now() : ms;
    return Math.max(0, Math.ceil((this.endMs() - t) / 864e5));
  },
  ended: function (ms) { return this.daysLeft(ms) <= 0; },
  //  메뉴·랭킹 배너 한 줄. 종료 뒤엔 '종료'.
  bannerText: function (ms) {
    var d = this.daysLeft(ms);
    return '🌋 시즌 ' + this.CURRENT.id + ' · ' + this.CURRENT.name + ' — ' + (d > 0 ? 'D-' + d : '종료');
  },

  // ── 세계 표 ──────────────────────────────────────────────────────────────
  worlds: function () {
    var out = [];
    for (var i = 0; i < this.WORLDS.length; i++) {
      var w = this.WORLDS[i];
      out.push({ key: w.key, name: w.name, from: w.from, to: w.to, boss: w.boss,
                 color: w.color, icon: w.icon, index: i });
    }
    return out;
  },
  worldIndex: function (floor) {
    var f = Math.max(1, Math.round(Number(floor) || 1));
    var idx = 0;
    for (var i = 0; i < this.WORLDS.length; i++) if (f >= this.WORLDS[i].from) idx = i;
    return idx;
  },
  worldOf: function (floor) { return this.worlds()[this.worldIndex(floor)]; },
  worldByKey: function (key) {
    var ws = this.worlds();
    for (var i = 0; i < ws.length; i++) if (ws[i].key === key) return ws[i];
    return null;
  },
  //  다음 세계의 첫 층. 마지막 세계면 null.
  nextWorldFloor: function (floor) {
    var i = this.worldIndex(floor);
    return i + 1 < this.WORLDS.length ? this.WORLDS[i + 1].from : null;
  },
  //  허브 한 줄: '🌿 초원  ·  다음 세계 안개늪까지 12층'  (opts.short: '🌿 초원 · 안개늪까지 12층' — 폰 250px 기둥)
  hubLine: function (floor, opts) {
    var short = !!(opts && opts.short);
    var w = this.worldOf(floor);
    var nf = this.nextWorldFloor(floor);
    var s = w.icon + ' ' + w.name;
    if (nf) {
      var nw = this.worldOf(nf);
      s += (short ? ' · ' : '  ·  다음 세계 ') + nw.name + '까지 ' + Math.max(1, nf - Math.round(Number(floor) || 1)) + '층';
    } else {
      s += (short ? ' · ' : '  ·  ') + '마지막 세계';
    }
    return s;
  },

  // ── 저장 ─────────────────────────────────────────────────────────────────
  _acct: function () {
    return (GAME.Account && GAME.Account.current && GAME.Account.current()) || 'guest';
  },
  _all: function () { return GAME.Store.get(this.KEY, {}) || {}; },
  _rec: function () {
    var r = this._all()[this._acct()];
    if (!r) r = {};
    if (!r.worlds) r.worlds = {};
    for (var i = 0; i < this.WORLDS.length; i++) {
      var k = this.WORLDS[i].key;
      if (!r.worlds[k]) r.worlds[k] = { entered: 0, boss: 0 };
      if (typeof r.worlds[k].entered !== 'number') r.worlds[k].entered = 0;
      if (typeof r.worlds[k].boss !== 'number') r.worlds[k].boss = 0;
    }
    if (typeof r.earned !== 'number') r.earned = 0;
    if (typeof r.spent !== 'number') r.spent = 0;
    if (!r.log) r.log = [];
    if (typeof r.coopWins !== 'number') r.coopWins = 0;
    if (!r.best) r.best = { tower: 0, dtower: 0 };
    if (typeof r.best.tower !== 'number') r.best.tower = 0;
    if (typeof r.best.dtower !== 'number') r.best.dtower = 0;
    if (!r.claimed) r.claimed = {};
    if (typeof r.owed !== 'number') r.owed = 0;
    if (!r.history) r.history = {};
    if (typeof r.seasonId !== 'number') r.seasonId = this.CURRENT.id;
    if (r.seasonId !== this.CURRENT.id) this._rollover(r);
    return r;
  },
  _save: function (rec) {
    var all = this._all();
    all[this._acct()] = rec;
    GAME.Store.set(this.KEY, all);
  },

  //  시즌 전환 — 정복·포인트·협동 승은 남기고, 시즌 보상(claimed)·시즌 기록(best)만
  //  history 로 내린다. owed(못 받은 골드)는 시즌과 무관한 빚이라 그대로 둔다.
  _rollover: function (rec) {
    rec.history[String(rec.seasonId)] = {
      claimed: rec.claimed, best: rec.best, at: this.now()
    };
    rec.claimed = {};
    rec.best = { tower: 0, dtower: 0 };
    rec.seasonId = this.CURRENT.id;
    this._save(rec);
    return rec;
  },

  // ── 세계 포인트 ──────────────────────────────────────────────────────────
  worldPoints: function () {
    var r = this._rec();
    return Math.max(0, r.earned - r.spent);
  },
  earnWorldPoint: function (n, why) {
    n = Math.max(0, Math.round(Number(n) || 0));
    if (!n) return this.worldPoints();
    var r = this._rec();
    this._earn(r, n, why);
    this._save(r);
    return Math.max(0, r.earned - r.spent);
  },
  _earn: function (rec, n, why) {
    rec.earned += n;
    rec.log.push({ n: n, why: String(why || ''), t: this.now() });
    while (rec.log.length > 60) rec.log.shift();
  },
  //  잔액이 모자라면 false — 아무것도 안 바꾼다.
  spendWorldPoint: function (n) {
    n = Math.max(0, Math.round(Number(n) || 0));
    var r = this._rec();
    if (!n) return true;
    if (r.earned - r.spent < n) return false;
    r.spent += n;
    r.log.push({ n: -n, why: 'spend', t: this.now() });
    while (r.log.length > 60) r.log.shift();
    this._save(r);
    return true;
  },
  pointLog: function () { return this._rec().log.slice(); },

  // ── 진행 조회 ────────────────────────────────────────────────────────────
  //  [{ key, name, icon, color, from, to, boss, entered, conquered, current }]
  //  current = 지금 도전 중인 층의 세계(floor 를 안 주면 GAME.Tower 의 현재 층).
  progress: function (floor) {
    var r = this._rec();
    if (floor === undefined) {
      floor = 1;
      try { if (GAME.Tower && GAME.Tower.get) floor = GAME.Tower.get().floor || 1; } catch (e) {}
    }
    var cur = this.worldIndex(floor);
    var ws = this.worlds();
    for (var i = 0; i < ws.length; i++) {
      var s = r.worlds[ws[i].key];
      ws[i].entered = !!s.entered;
      ws[i].conquered = !!s.boss;
      ws[i].current = (i === cur);
    }
    return ws;
  },
  conqueredCount: function () {
    var r = this._rec(), n = 0;
    for (var i = 0; i < this.WORLDS.length; i++) if (r.worlds[this.WORLDS[i].key].boss) n++;
    return n;
  },
  //  랭킹 시즌 탭·프로필용 요약.
  summary: function () {
    var r = this._rec();
    return { id: this.CURRENT.id, name: this.CURRENT.name, start: this.CURRENT.start,
             end: this.CURRENT.end, daysLeft: this.daysLeft(), ended: this.ended(),
             conquered: this.conqueredCount(), total: this.WORLDS.length,
             bestTower: r.best.tower, bestDtower: r.best.dtower,
             points: Math.max(0, r.earned - r.spent), coopWins: r.coopWins };
  },

  // ── 이벤트 ───────────────────────────────────────────────────────────────
  //  반환: { entered:[key], conquered:[key], points:적립 }.
  emit: function (event, payload) {
    payload = payload || {};
    var rec = this._rec();
    var out = { entered: [], conquered: [], points: 0 };
    var before = rec.earned;
    switch (event) {
      case 'towerClear': {
        var f = Math.round(Number(payload.floor) || 0);
        if (f <= 0) return out;
        rec.best.tower = Math.max(rec.best.tower, f);
        this._applyFloor(rec, f, out);
        break;
      }
      case 'coopWin':
        rec.coopWins += 1;
        this._earn(rec, this.POINTS.coop, 'coop');
        this._toast('🤝 협동 승리  ·  세계 포인트 +' + this.POINTS.coop);
        break;
      case 'dtowerClear':
        rec.best.dtower = Math.max(rec.best.dtower, Math.round(Number(payload.run) || 0));
        break;
      default:
        return out;
    }
    out.points = rec.earned - before;
    this._save(rec);
    return out;
  },

  //  층 f 를 깼다 → from ≤ f 인 세계는 진입, boss ≤ f 인 세계는 정복. 이미 된 것은 건너뛴다.
  _applyFloor: function (rec, f, out) {
    var now = this.now();
    for (var i = 0; i < this.WORLDS.length; i++) {
      var w = this.WORLDS[i];
      var s = rec.worlds[w.key];
      if (f >= w.from && !s.entered) {
        s.entered = now;
        this._earn(rec, this.POINTS.enter, 'enter:' + w.key);
        if (out) out.entered.push(w.key);
        this._toast(w.icon + ' 새 세계 — ' + w.name + ' 진입!  ·  세계 포인트 +' + this.POINTS.enter);
      }
      if (f >= w.boss && !s.boss) {
        s.boss = now;
        this._earn(rec, this.POINTS.boss, 'boss:' + w.key);
        if (out) out.conquered.push(w.key);
        this._toast(w.icon + ' ' + w.name + ' 정복!  ·  세계 포인트 +' + this.POINTS.boss);
        //  세계 정복 업적 — 세계를 아는 곳이 여기뿐이라 여기서 보낸다(js/daily.js 의
        //  dailyDone 과 같은 선례).
        if (GAME.Achievements && GAME.Achievements.emit) {
          try { GAME.Achievements.emit('worldConquer', { world: w.key }); } catch (e) {}
        }
      }
    }
  },

  _toast: function (text) {
    if (GAME.MetaToast && GAME.MetaToast.push) GAME.MetaToast.push(text, { sound: 'coin' });
  },

  // ── 시즌 보상 ────────────────────────────────────────────────────────────
  claimable: function () {
    var r = this._rec();
    var n = this.conqueredCount();
    var out = [];
    for (var i = 0; i < this.REWARDS.length; i++) {
      var rw = this.REWARDS[i];
      if (n >= rw.n && !r.claimed[rw.n]) out.push({ n: rw.n, gold: rw.gold, achKey: rw.achKey });
    }
    return out;
  },
  //  받을 수 있는 줄을 전부 지급한다(각 1회). 반환: 이번에 지급(또는 보류)한 골드 합.
  claim: function (scene) {
    var list = this.claimable();
    if (!list.length) return 0;
    var r = this._rec();
    var total = 0;
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      r.claimed[it.n] = this.now();
      total += it.gold;
      var paidNow = this._pay(it.gold);
      if (!paidNow) r.owed += it.gold;
      var title = (GAME.Achievements && GAME.Achievements.titleOf) ? GAME.Achievements.titleOf(it.achKey) : '';
      this._toast('🎁 시즌 보상 — 세계 ' + it.n + '개 정복  ·  +' + it.gold + ' 골드' +
        (title ? ('  ·  칭호: ' + title) : '') + (paidNow ? '' : ' (캐릭터를 만들면 지급)'));
    }
    this._save(r);
    if (scene && GAME.Achievements && GAME.Achievements.flush) GAME.Achievements.flush(scene);
    return total;
  },
  claimed: function () { return this._rec().claimed; },

  //  통곡의 탑 골드로 지급(js/daily.js 와 같은 경로). 캐릭터가 없으면 false.
  _pay: function (amount) {
    if (!amount) return true;
    if (!GAME.TowerChar || !GAME.TowerChar.get) return false;
    var ch = GAME.TowerChar.get();
    if (!ch) return false;
    ch.gold = (ch.gold || 0) + Math.round(amount);
    GAME.TowerChar._save(ch);
    return true;
  },
  owed: function () { return this._rec().owed; },

  //  메뉴·프로필 진입 시 한 번: ① 탑 최고층으로 정복을 맞춘다(개편 전 기록·이어하기로 들어온
  //  진행이 이벤트 없이도 세계에 반영된다) ② 보류 골드 지급 ③ 받을 보상 지급.
  //  반환: 이번에 지급(보류 포함)한 골드.
  settle: function (scene) {
    var r = this._rec();
    var best = 0;
    try { if (GAME.Tower && GAME.Tower.get) best = GAME.Tower.get().best || 0; } catch (e) {}
    if (best > 0) {
      r.best.tower = Math.max(r.best.tower, best);
      this._applyFloor(r, best, null);
    }
    var paid = 0;
    if (r.owed > 0 && this._pay(r.owed)) {
      paid = r.owed;
      this._toast('🎁 보류된 시즌 보상 지급 — +' + r.owed + ' 골드');
      r.owed = 0;
    }
    this._save(r);
    return paid + this.claim(scene);
  }
};
