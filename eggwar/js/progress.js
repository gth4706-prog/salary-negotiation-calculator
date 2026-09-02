window.GAME = window.GAME || {};

// ============================================================================
//  플레이어 진행 — 레벨/XP · 레벨업 보상 · 연속 출석 (대격변 v3 · A 진행 트랙, 2026-09-02)
//  ---------------------------------------------------------------------------
//  업적(js/achievements.js)이 "무엇을 해냈는가"라면 여기는 "얼마나 쌓았는가"다.
//  어디서 무엇을 해도 XP 가 오르고, 레벨이 오르면 탑 골드와(5·10·20·30·50) 칭호를 준다.
//  매일 들어오면 출석 스트릭이 이어지고 7일 주기로 보상이 커진다.
//
//  · 저장: `eggwar.prog.v1` — 계정별(`GAME.Account.current() || 'guest'`).
//      { [계정]: { lv, xp, total, titles:{key:시각}, title:key|null, owed,
//                  pending:[{id,text,sound}], att:{ last:'YYYY-MM-DD', streak, total } } }
//    `xp` 는 **현재 레벨 안에서 쌓인 양**, `total` 은 평생 누적(표시용). 레벨업 보상은
//    `lv` 가 오르는 그 자리에서 한 번만 준다 — 총 XP 에서 레벨을 역산하는 방식이면
//    "몇 레벨 보상을 이미 줬는가"를 따로 기억해야 해서 두 번 주는 사고가 난다.
//  · 이벤트 이름은 js/achievements.js · js/daily.js 와 **같다**(한 곳에서 발행).
//    통합자는 셋을 나란히 부른다:
//        GAME.Achievements.emit('kill', {n:3}); GAME.Daily.emit('kill', {n:3}); GAME.Progress.emit('kill', {n:3});
//
//      emit('towerClear',  { floor })           20 + 층×2
//      emit('dtowerClear', { run })             20 + 회차×2
//      emit('rtResult',    { won, practice })   실시간 승 60 / 패 25 · 연습 승 15 / 패 5
//      emit('kill',        { n })               1 × n
//      emit('orb',         { n })               3 × n
//      emit('bossKill',    { n })               80 × n
//      emit('siegeWin')                         50
//      emit('dailyDone',   { n })               25 × n   (js/daily.js 가 완료 시 보낸다)
//
//  · 레벨 곡선 `need(L) = 80 + 45·L + 6·L²` — 상한 없음(무한의 탑과 같은 규율).
//    L1→2 131 · L10→11 1,130 · L30→31 6,830 · L50→51 17,330.
//  · 레벨업 보상 = 탑 골드 **새 레벨 × 25** + 5·10·20·30·50 레벨에 칭호. 골드는 캐릭터
//    (`GAME.TowerChar`)가 있으면 즉시, 없으면 `owed` 에 쌓았다가 `settle()` 에서 지급한다
//    (js/daily.js 와 같은 규율 — 보상이 증발하지 않는다).
//  · 출석: KST 날짜 기준 하루 1회 `checkIn()`. 어제 출석했으면 스트릭 +1, 아니면 1.
//    7일 주기 보상 30·40·50·60·80·100·150 골드, 7일째엔 칭호 '개근 계란'.
//    `settle()` = 오늘 출석 처리 + 보류 골드 지급. 메뉴·프로필 진입 시 한 번 부른다.
//  · 칭호: 업적 칭호와 **같은 방식**으로 고른다. achievements.js 는 이 모듈을 모르므로
//    합치는 쪽은 여기다 — `allTitles()` / `chooseTitle(key)` / `displayTitle()` 을
//    프로필이 쓴다(한쪽을 고르면 다른 쪽은 자동으로 뗀다 — 칭호는 하나만 단다).
//  · 토스트: 발생 즉시 `GAME.MetaToast` 큐에 넣고 `pending` 에도 남긴다(새로고침으로 큐가
//    사라져도 다음 flush 가 되살린다). `flush(scene)` 가 이 화면에서 아직 못 띄운 것만
//    큐에 다시 넣는다 — `_live` 가 "이번 페이지 수명 안에 이미 큐에 넣은 것"을 기억하므로
//    Achievements.flush 와의 호출 순서에 좌우되지 않는다.
//  ⚠ 씬·Phaser 에 의존하지 않는다(flush 만 scene 을 받는다) — tools/sim.js 샌드박스에
//    올려 헤드리스로 감사한다(tools/progress-audit.js). 시각은 `now()` 를 거친다(`_clock`).
// ============================================================================
GAME.Progress = {
  KEY: 'eggwar.prog.v1',
  KST_OFFSET: 9 * 3600e3,

  //  XP 표 — 감사·문서가 이 표를 그대로 읽는다. 판정은 xpFor 한 곳.
  XP: {
    towerClear:  { base: 20, per: 2,  desc: '층 클리어 20 + 층×2' },
    dtowerClear: { base: 20, per: 2,  desc: '회차 방어 20 + 회차×2' },
    rtWin: 60, rtLose: 25, practiceWin: 15, practiceLose: 5,
    kill: 1, orb: 3, bossKill: 80, siegeWin: 50, dailyDone: 25
  },

  //  레벨업 골드 = 새 레벨 × GOLD_PER_LV
  GOLD_PER_LV: 25,

  //  레벨 칭호. ⚠ 칭호 폭 8.5자 이하(한글 1 · 숫자/공백 0.55) — 프로필 격자·모달 상한
  //    (tools/meta-audit.js 와 같은 자, tools/progress-audit.js 가 잰다).
  TITLES: [
    { key: 'lv_5',  lv: 5,  title: '싹튼 계란',   name: '레벨 5' },
    { key: 'lv_10', lv: 10, title: '단단한 껍질', name: '레벨 10' },
    { key: 'lv_20', lv: 20, title: '노련한 계란', name: '레벨 20' },
    { key: 'lv_30', lv: 30, title: '전장의 고참', name: '레벨 30' },
    { key: 'lv_50', lv: 50, title: '전설의 계란', name: '레벨 50' },
    { key: 'att_7', lv: 0,  title: '개근 계란',   name: '7일 연속 출석' }
  ],

  //  출석 7일 주기 보상(골드). 7일째는 칭호도 준다.
  ATT_REWARDS: [30, 40, 50, 60, 80, 100, 150],
  ATT_TITLE_KEY: 'att_7',

  // ── 레벨 곡선 ─────────────────────────────────────────────────────────────
  need: function (lv) {
    lv = Math.max(1, Math.round(Number(lv) || 1));
    return 80 + 45 * lv + 6 * lv * lv;
  },

  // ── 시각 · 날짜 (js/daily.js 와 같은 규칙) ───────────────────────────────
  _clock: null,
  now: function () { return this._clock ? this._clock() : Date.now(); },
  dateKey: function (ms) {
    var d = new Date((ms === undefined ? this.now() : ms) + this.KST_OFFSET);
    var m = d.getUTCMonth() + 1, day = d.getUTCDate();
    return d.getUTCFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  },

  // ── 저장 ─────────────────────────────────────────────────────────────────
  _acct: function () {
    return (GAME.Account && GAME.Account.current && GAME.Account.current()) || 'guest';
  },
  _all: function () { return GAME.Store.get(this.KEY, {}) || {}; },
  _rec: function () {
    var r = this._all()[this._acct()];
    if (!r) r = {};
    if (typeof r.lv !== 'number' || r.lv < 1) r.lv = 1;
    if (typeof r.xp !== 'number' || r.xp < 0) r.xp = 0;
    if (typeof r.total !== 'number') r.total = 0;
    if (!r.titles) r.titles = {};
    if (r.title === undefined) r.title = null;
    if (typeof r.owed !== 'number') r.owed = 0;
    if (!r.pending) r.pending = [];
    if (!r.att) r.att = { last: '', streak: 0, total: 0 };
    return r;
  },
  _save: function (rec) {
    var all = this._all();
    all[this._acct()] = rec;
    GAME.Store.set(this.KEY, all);
  },

  // ── 토스트 ───────────────────────────────────────────────────────────────
  //  이번 페이지 수명 안에 큐에 넣은 알림 id. 새로고침되면 비므로 pending 이 되살린다.
  _live: {},
  _seq: 0,
  _notify: function (rec, text, sound) {
    var id = String(this.now()) + '-' + (++this._seq);
    rec.pending.push({ id: id, text: text, sound: sound || 'coin' });
    while (rec.pending.length > 12) rec.pending.shift();
    if (GAME.MetaToast) GAME.MetaToast.push(text, { sound: sound || 'coin' });
    this._live[id] = 1;
  },

  // ── 골드 지급 (js/daily.js 와 같은 경로) ────────────────────────────────
  _pay: function (amount) {
    if (!amount) return true;
    if (!GAME.TowerChar || !GAME.TowerChar.get) return false;
    var ch = GAME.TowerChar.get();
    if (!ch) return false;
    ch.gold = (ch.gold || 0) + Math.round(amount);
    GAME.TowerChar._save(ch);
    return true;
  },

  // ── XP ───────────────────────────────────────────────────────────────────
  //  이벤트 → XP. 모르는 이벤트는 0.
  xpFor: function (event, payload) {
    payload = payload || {};
    var X = this.XP;
    var n = Math.max(1, Math.round(Number(payload.n) || 1));
    switch (event) {
      case 'towerClear':  return X.towerClear.base + X.towerClear.per * Math.max(0, Math.round(Number(payload.floor) || 0));
      case 'dtowerClear': return X.dtowerClear.base + X.dtowerClear.per * Math.max(0, Math.round(Number(payload.run) || 0));
      case 'rtResult':
        if (payload.practice) return payload.won ? X.practiceWin : X.practiceLose;
        return payload.won ? X.rtWin : X.rtLose;
      case 'kill':      return X.kill * n;
      case 'orb':       return X.orb * n;
      case 'bossKill':  return X.bossKill * n;
      case 'siegeWin':  return X.siegeWin;
      case 'dailyDone': return X.dailyDone * n;
      default: return 0;
    }
  },

  //  반환: { xp: 이번에 받은 XP, levels: [새로 오른 레벨…], gold: 이번에 지급(또는 보류)된 골드 }
  emit: function (event, payload) {
    var gain = this.xpFor(event, payload);
    if (!gain) return { xp: 0, levels: [], gold: 0 };
    return this.addXp(gain);
  },

  addXp: function (amount) {
    amount = Math.max(0, Math.round(Number(amount) || 0));
    var rec = this._rec();
    var out = { xp: amount, levels: [], gold: 0 };
    if (!amount) return out;
    rec.xp += amount;
    rec.total += amount;
    //  한 번에 여러 레벨이 오를 수 있다(큰 보스 처치 등). 레벨마다 보상을 **따로** 준다.
    while (rec.xp >= this.need(rec.lv)) {
      rec.xp -= this.need(rec.lv);
      rec.lv += 1;
      out.levels.push(rec.lv);
      out.gold += this._rewardLevel(rec, rec.lv);
    }
    this._save(rec);
    return out;
  },

  //  레벨 보상 — 골드(즉시 또는 보류) + 칭호. 반환: 골드.
  _rewardLevel: function (rec, lv) {
    var gold = lv * this.GOLD_PER_LV;
    var paidNow = this._pay(gold);
    if (!paidNow) rec.owed += gold;
    var t = null;
    for (var i = 0; i < this.TITLES.length; i++) {
      var d = this.TITLES[i];
      if (d.lv === lv && !rec.titles[d.key]) { rec.titles[d.key] = this.now(); t = d; }
    }
    this._notify(rec, '⬆ 레벨 업!  Lv.' + lv + '   ·   +' + gold + ' 골드' +
      (paidNow ? '' : ' (캐릭터를 만들면 지급)') + (t ? '   ·   칭호: ' + t.title : ''), 'coin');
    return gold;
  },

  //  화면용 요약. into = 현재 레벨 안에서 쌓인 XP, need = 다음 레벨까지 필요한 양.
  get: function () {
    var rec = this._rec();
    var need = this.need(rec.lv);
    return { lv: rec.lv, into: rec.xp, need: need, total: rec.total,
             frac: Math.max(0, Math.min(1, need ? rec.xp / need : 0)),
             owed: rec.owed, streak: rec.att.streak };
  },
  level: function () { return this._rec().lv; },

  // ── 출석 ─────────────────────────────────────────────────────────────────
  //  오늘 아직 안 했으면 출석 처리. 반환:
  //    { already:true }                       이미 오늘 했다
  //    { day, streak, gold, title, paid }     day = 7일 주기 안의 칸(1~7)
  checkIn: function () {
    var rec = this._rec();
    var today = this.dateKey();
    if (rec.att.last === today) return { already: true, streak: rec.att.streak, day: this.dayOf(rec.att.streak) };
    var yesterday = this.dateKey(this.now() - 86400e3);
    rec.att.streak = (rec.att.last === yesterday) ? (rec.att.streak || 0) + 1 : 1;
    rec.att.last = today;
    rec.att.total = (rec.att.total || 0) + 1;
    var day = this.dayOf(rec.att.streak);
    var gold = this.ATT_REWARDS[day - 1];
    var paidNow = this._pay(gold);
    if (!paidNow) rec.owed += gold;
    var title = null;
    if (day === this.ATT_REWARDS.length && !rec.titles[this.ATT_TITLE_KEY]) {
      rec.titles[this.ATT_TITLE_KEY] = this.now();
      title = this.titleOf(this.ATT_TITLE_KEY);
    }
    this._notify(rec, '📅 출석 ' + rec.att.streak + '일째 — +' + gold + ' 골드' +
      (paidNow ? '' : ' (캐릭터를 만들면 지급)') + (title ? '   ·   칭호: ' + title : ''), 'coin');
    this._save(rec);
    return { already: false, day: day, streak: rec.att.streak, gold: gold, title: title, paid: paidNow };
  },

  //  스트릭 → 7일 주기 안의 칸(1~7). 스트릭 0 이면 0.
  dayOf: function (streak) { return streak > 0 ? ((streak - 1) % this.ATT_REWARDS.length) + 1 : 0; },

  //  화면용: { streak, day(1~7, 오늘 출석 전이면 다음 칸), todayDone, rewards, todayGold, nextGold }
  attendance: function () {
    var rec = this._rec();
    var today = this.dateKey();
    var todayDone = rec.att.last === today;
    var streak = rec.att.streak || 0;
    //  오늘 아직 안 했으면(정산 전 화면) — 어제 이어졌으면 다음 칸, 끊겼으면 1칸.
    var yesterday = this.dateKey(this.now() - 86400e3);
    var effStreak = todayDone ? streak : ((rec.att.last === yesterday) ? streak + 1 : 1);
    var day = this.dayOf(effStreak);
    var nextDay = this.dayOf(effStreak + 1);
    return { streak: streak, day: day, todayDone: todayDone, rewards: this.ATT_REWARDS.slice(),
             todayGold: this.ATT_REWARDS[day - 1], nextGold: this.ATT_REWARDS[nextDay - 1],
             total: rec.att.total || 0 };
  },

  // ── 정산 — 메뉴·프로필 진입 시 한 번 ─────────────────────────────────────
  //  오늘 출석 + 보류 골드 지급. 반환 { checkIn, paid }.
  settle: function () {
    var ci = null;
    try { ci = this.checkIn(); } catch (e) { ci = { error: true }; }
    return { checkIn: ci, paid: this.payOwed() };
  },
  payOwed: function () {
    var rec = this._rec();
    var owed = rec.owed || 0;
    if (!owed) return 0;
    if (!this._pay(owed)) return 0;
    rec.owed = 0;
    this._notify(rec, '💰 보류된 레벨·출석 보상 지급 — +' + owed + ' 골드', 'coin');
    this._save(rec);
    return owed;
  },
  owed: function () { return this._rec().owed || 0; },

  // ── 칭호 ─────────────────────────────────────────────────────────────────
  _titleDef: function (key) {
    for (var i = 0; i < this.TITLES.length; i++) if (this.TITLES[i].key === key) return this.TITLES[i];
    return null;
  },
  titleOf: function (key) { var d = this._titleDef(key); return d ? d.title : ''; },
  hasTitle: function (key) { return !!this._rec().titles[key]; },

  //  얻은 칭호 목록(획득 순). [{ key, title, name, at, src:'lv' }]
  titles: function () {
    var rec = this._rec(), out = [];
    for (var i = 0; i < this.TITLES.length; i++) {
      var d = this.TITLES[i];
      if (rec.titles[d.key]) out.push({ key: d.key, title: d.title, name: d.name, at: rec.titles[d.key], src: 'lv' });
    }
    out.sort(function (a, b) { return a.at - b.at; });
    return out;
  },
  setTitle: function (key) {
    var rec = this._rec();
    if (key === null || key === undefined || key === '') { rec.title = null; this._save(rec); return true; }
    if (!this._titleDef(key) || !rec.titles[key]) return false;
    rec.title = key;
    this._save(rec);
    return true;
  },
  currentTitleKey: function () {
    var rec = this._rec();
    return (rec.title && rec.titles[rec.title]) ? rec.title : null;
  },
  currentTitle: function () {
    var k = this.currentTitleKey();
    return k ? this.titleOf(k) : '';
  },

  //  ── 업적 칭호와 합치기 (프로필이 쓴다) ──────────────────────────────────
  //  전체 목록: 업적 칭호(src:'ach') + 레벨·출석 칭호(src:'lv'), 획득 순.
  allTitles: function () {
    var out = [];
    var A = GAME.Achievements;
    if (A && A.earnedTitles) {
      var e = A.earnedTitles();
      for (var i = 0; i < e.length; i++) out.push({ key: e[i].key, title: e[i].title, name: e[i].name, at: e[i].at, src: 'ach' });
    }
    out = out.concat(this.titles());
    out.sort(function (a, b) { return a.at - b.at; });
    return out;
  },
  //  하나만 단다 — 한쪽을 고르면 다른 쪽은 뗀다. '' / null 이면 둘 다 뗀다.
  chooseTitle: function (key) {
    var A = GAME.Achievements;
    if (key === null || key === undefined || key === '') {
      this.setTitle(null);
      if (A && A.setTitle) A.setTitle(null);
      return true;
    }
    if (this._titleDef(key)) {
      if (!this.setTitle(key)) return false;
      if (A && A.setTitle) A.setTitle(null);
      return true;
    }
    if (A && A.setTitle && A.setTitle(key)) { this.setTitle(null); return true; }
    return false;
  },
  currentTitleAnyKey: function () {
    var A = GAME.Achievements;
    var k = (A && A.currentTitleKey) ? A.currentTitleKey() : null;
    return k || this.currentTitleKey();
  },
  displayTitle: function () {
    var A = GAME.Achievements;
    var t = (A && A.currentTitle) ? A.currentTitle() : '';
    return t || this.currentTitle();
  },

  // ── 알림 ─────────────────────────────────────────────────────────────────
  pending: function () { return this._rec().pending.slice(); },
  takePending: function () {
    var rec = this._rec();
    var out = rec.pending.slice();
    rec.pending = [];
    this._save(rec);
    return out;
  },
  //  아직 이번 페이지에서 큐에 안 넣은 알림만 되살리고 토스트를 흘린다.
  //  호출부: 메뉴·프로필·결과 화면에서 `GAME.Achievements.flush(this)` 다음 줄에
  //  `GAME.Progress.flush(this)`. 반환: 되살린 알림 수.
  flush: function (scene) {
    var items = this.takePending();
    var n = 0;
    for (var i = 0; i < items.length; i++) {
      if (this._live[items[i].id]) continue;
      if (GAME.MetaToast) GAME.MetaToast.push(items[i].text, { sound: items[i].sound });
      this._live[items[i].id] = 1;
      n++;
    }
    if (GAME.MetaToast) GAME.MetaToast.flush(scene);
    return n;
  }
};
