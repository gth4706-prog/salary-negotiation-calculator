window.GAME = window.GAME || {};

// ============================================================================
//  업적 · 칭호 (대격변 v3 · W2 메타 시스템, 2026-09-02)
//  ---------------------------------------------------------------------------
//  "내 게임" 감을 만드는 장치. 탑·수성·실시간·공성 어디서 무엇을 해도 여기에 쌓이고,
//  달성하면 **칭호**를 준다(프로필에서 고른다).
//
//  · 저장: `eggwar.ach.v1` — 계정별(`GAME.Account.current() || 'guest'`).
//      { [계정]: { done: {key: 달성시각}, c: {누적 카운터}, title: key|null, pending: [key] } }
//  · 모든 업적은 **카운터 하나 + 목표값**으로 판정한다(`stat`/`goal`). 이벤트는 카운터만
//    올리고, 판정은 `_check` 한 곳에서 한다 — 조건 코드가 업적마다 흩어지면 "두 번
//    달성"이나 "안 달성" 같은 버그가 업적마다 따로 생긴다.
//  · `emit(event, payload)` 는 **정의만** 한다. 호출부(battle/result/defend-tower)는
//    통합자가 배선한다. 이벤트 이름은 js/daily.js 와 같다(한 곳에서 발행).
//
//      emit('towerClear',  { floor, noHeal })   통곡의 탑 층 클리어(회복 0이면 noHeal:true)
//      emit('dtowerClear', { run })             수성의 탑 회차 방어 성공
//      emit('rtResult',    { won, practice })   실시간 대전 결과(연습이면 practice:true)
//      emit('kill',        { n })               적 처치 n기(생략 시 1)
//      emit('orb')                              구슬 획득
//      emit('bossKill')                         보스 처치
//      emit('siegeWin')                         공성전 승리
//      emit('gear',        { tier })            장착 중인 장비의 **가장 낮은** 단계(빈 칸이면 0)
//      emit('dailyDone')                        일일 과제 완료(js/daily.js 가 스스로 보낸다)
//      emit('worldConquer', { world })          시즌 2 세계 보스 처치(js/season.js 가 스스로 보낸다)
//      emit('coopWin')                          협동 보스전 승리
//      emit('skillEvo',    { n })               스킬 진화 n회(생략 시 1)
//      emit('trait',       { rank })            특성 한 갈래의 도달 단(최대값만 남는다)
//
//  · 토스트: `flush(scene)` — 상단 슬라이드 인 2.4초, 여러 개면 순차. 엔진은
//    `GAME.MetaToast` 로 분리해 두어 일일 과제 완료 알림도 같은 줄에 선다.
//  ⚠ 이 파일은 씬·Phaser 에 의존하지 않는다(flush 만 scene 을 받는다) — tools/sim.js
//    샌드박스에 올려 헤드리스로 감사한다(tools/meta-audit.js).
// ============================================================================

// ── 공용 토스트 엔진 ──────────────────────────────────────────────────────
//  큐에 넣고(push) 씬이 있을 때 흘려보낸다(flush). 씬을 넘기지 않으면 아무것도 안 그리고
//  큐에만 남는다 — 전투 중에 달성해도 결과/메뉴 화면에서 뒤늦게 뜬다.
GAME.MetaToast = {
  queue: [],
  _run: null,
  DUR: 2400,          // 한 장이 떠 있는 시간(ms) — 슬라이드 인·아웃 포함
  MAX_QUEUE: 12,

  push: function (text, opts) {
    if (!text) return;
    this.queue.push({ text: String(text), color: (opts && opts.color) || null,
      sound: (opts && opts.sound) || null });
    while (this.queue.length > this.MAX_QUEUE) this.queue.shift();
  },

  //  씬이 살아 있고 큐가 비지 않았으면 순차 재생을 시작한다. 이미 그 씬에서 재생
  //  중이면 그냥 돌아간다(큐에 넣은 것은 그 재생 루프가 이어서 집는다).
  flush: function (scene) {
    if (!scene || !scene.add || !scene.scene || !scene.scene.isActive()) return;
    //  프로필처럼 업적·과제를 **화면 자체가 보여주는** 씬은 토스트를 안 띄운다(큐는 남겨
    //  다음 씬에서 뜬다). 제목 줄과 겹치던 overlap-audit 2건(2026-09-03)의 답.
    if (scene._toastMute) return;
    if (this._run && this._run.scene === scene && this._run.busy) return;
    var self = this;
    this._run = { scene: scene, busy: false };
    //  ⚠ 씬 인스턴스는 재사용된다 — 씬이 닫히면 이 실행 표식을 반드시 지운다. 안 지우면
    //    다음 진입에서 "재생 중"으로 오인해 영영 안 뜬다.
    if (scene.events && scene.events.once) {
      scene.events.once('shutdown', function () {
        if (self._run && self._run.scene === scene) self._run = null;
      });
    }
    this._next();
  },

  _next: function () {
    var r = this._run;
    if (!r) return;
    var scene = r.scene;
    if (!this.queue.length || !scene.scene || !scene.scene.isActive()) { this._run = null; return; }
    var it = this.queue.shift();
    r.busy = true;
    var self = this;
    //  헤드리스(ui-theme 미로드)나 tween 없는 씬 — 그리지 못하면 소비만 하고 넘어간다.
    if (!GAME.UI || !GAME.UI.text || !GAME.UI.panel || !scene.tweens || !scene.time) {
      r.busy = false; this._next(); return;
    }
    var C = GAME.CONFIG.COLORS, UI = GAME.UI;
    var W = GAME.CONFIG.WIDTH;
    var small = !!GAME.CONFIG.SMALL;
    var maxW = Math.min(W - 40, 560);
    var txt = UI.text(scene, W / 2, 0, it.text,
      { size: small ? 'caption' : 'body', color: it.color || C.crit, origin: 0.5,
        wrap: maxW - 36, align: 'center' });
    var pw = Math.min(maxW, Math.ceil(txt.width) + 36);
    var ph = Math.ceil(txt.height) + 18;
    var pg = UI.panel(scene, W / 2 - pw / 2, 0, pw, ph,
      { level: 3, line: UI.COL.focus, radius: Math.min(12, ph / 2 - 1) });
    //  Modal(1000~1003) 위에서도 보이도록.
    pg.setDepth(1500); txt.setDepth(1501);
    //  씬이 `_toastTop` 을 주면 그 자리(제목 줄이 맨 위인 프로필 씬 — overlap-audit 2026-09-03).
    var yTop = (typeof scene._toastTop === 'number') ? scene._toastTop : (small ? 8 : 16);
    var startY = -ph - 6;
    pg.setY(startY); txt.setY(startY + ph / 2);
    if (it.sound && GAME.Sound) { try { GAME.Sound.play(it.sound); } catch (e) {} }

    var slideIn = 220, slideOut = 260;
    var hold = Math.max(400, this.DUR - slideIn - slideOut);
    var kill = function () {
      if (pg && pg.scene) pg.destroy();
      if (txt && txt.scene) txt.destroy();
    };
    scene.tweens.add({ targets: pg, y: yTop, duration: slideIn, ease: 'Cubic.easeOut' });
    scene.tweens.add({ targets: txt, y: yTop + ph / 2, duration: slideIn, ease: 'Cubic.easeOut' });
    scene.time.delayedCall(slideIn + hold, function () {
      if (!pg.scene) { r.busy = false; self._next(); return; }
      scene.tweens.add({ targets: [pg], y: startY, duration: slideOut, ease: 'Cubic.easeIn' });
      scene.tweens.add({ targets: [txt], y: startY + ph / 2, duration: slideOut, ease: 'Cubic.easeIn',
        onComplete: function () { kill(); r.busy = false; self._next(); } });
    });
  }
};

GAME.Achievements = {
  KEY: 'eggwar.ach.v1',

  //  stat = 카운터 이름, goal = 목표값. 달성 = c[stat] >= goal.
  //  ⚠ name 은 폭 6.5자, title 은 8.5자 이하(한글 1 · 숫자/공백 0.55) — 프로필 격자
  //    칸(폰 가로 192px, 15px 글자)에 맞춘 상한. tools/meta-audit.js 가 잰다.
  DEFS: [
    { key: 'tower_5',   name: '첫 계단',    title: '탑의 견습생',   desc: '통곡의 탑 5층을 넘는다',        stat: 'towerBest',    goal: 5 },
    { key: 'tower_10',  name: '열 층의 벽', title: '탑의 개척자',   desc: '통곡의 탑 10층을 넘는다',       stat: 'towerBest',    goal: 10 },
    { key: 'tower_20',  name: '스무 층',    title: '껍질 등반가',   desc: '통곡의 탑 20층을 넘는다',       stat: 'towerBest',    goal: 20 },
    { key: 'tower_30',  name: '구름 위로',  title: '구름 위의 계란', desc: '통곡의 탑 30층을 넘는다',       stat: 'towerBest',    goal: 30 },
    { key: 'tower_50',  name: '통곡을 넘어', title: '통곡을 넘은 자', desc: '통곡의 탑 50층을 넘는다',       stat: 'towerBest',    goal: 50 },
    { key: 'dtower_5',  name: '첫 방어',    title: '껍질 파수꾼',   desc: '수성의 탑 5회차를 막는다',      stat: 'dtowerBest',   goal: 5 },
    { key: 'dtower_10', name: '열 번의 방어', title: '철벽 진형가', desc: '수성의 탑 10회차를 막는다',     stat: 'dtowerBest',   goal: 10 },
    { key: 'dtower_20', name: '난공불락',   title: '난공불락의 성', desc: '수성의 탑 20회차를 막는다',     stat: 'dtowerBest',   goal: 20 },
    { key: 'rt_win_1',  name: '첫 승리',    title: '첫 노른자',     desc: '실시간 대전에서 처음 이긴다',   stat: 'rtWins',       goal: 1 },
    { key: 'rt_win_5',  name: '다섯 승',    title: '결투 애호가',   desc: '실시간 대전 5승',               stat: 'rtWins',       goal: 5 },
    { key: 'rt_win_20', name: '스무 승',    title: '전장의 노장',   desc: '실시간 대전 20승',              stat: 'rtWins',       goal: 20 },
    { key: 'rt_games_10', name: '단골 결투', title: '단골 결투사',  desc: '실시간 대전 10판 참가',         stat: 'rtGames',      goal: 10 },
    { key: 'practice_win_1', name: '연습 첫승', title: '허수아비 사냥꾼', desc: '연습 대전(봇)에서 처음 이긴다', stat: 'practiceWins', goal: 1 },
    { key: 'siege_win_1', name: '성벽 돌파', title: '성벽 부수는 자', desc: '공성전에서 처음 이긴다',      stat: 'siegeWins',    goal: 1 },
    { key: 'kills_100', name: '처치 100',   title: '백 개의 노른자', desc: '적을 누적 100기 처치',          stat: 'kills',        goal: 100 },
    { key: 'kills_1000', name: '처치 1000', title: '천 개의 노른자', desc: '적을 누적 1000기 처치',        stat: 'kills',        goal: 1000 },
    { key: 'boss_1',    name: '첫 괴물',    title: '괴물 사냥꾼',   desc: '보스를 처음 처치',              stat: 'bossKills',    goal: 1 },
    { key: 'boss_5',    name: '괴물의 천적', title: '괴물의 천적',  desc: '보스를 누적 5기 처치',          stat: 'bossKills',    goal: 5 },
    { key: 'orbs_10',   name: '구슬 열 개', title: '구슬 수집가',   desc: '구슬을 누적 10개 획득',         stat: 'orbs',         goal: 10 },
    { key: 'full_set3', name: '완전 무장',  title: '완전 무장 병사', desc: '장비 네 칸을 전부 3단 이상으로', stat: 'gearTier',    goal: 3 },
    { key: 'streak_3',  name: '3연승',      title: '멈추지 않는 껍질', desc: '실시간 대전 3연승',          stat: 'rtStreakBest', goal: 3 },
    { key: 'streak_5',  name: '5연승',      title: '불패의 껍질',   desc: '실시간 대전 5연승',             stat: 'rtStreakBest', goal: 5 },
    { key: 'no_heal',   name: '무보급 등반', title: '무보급 등반가', desc: '회복 없이 통곡의 탑 한 층 클리어', stat: 'noHealClears', goal: 1 },
    { key: 'tower_clears_50', name: '오십 계단', title: '꾸준한 발걸음', desc: '통곡의 탑 층 클리어 누적 50회', stat: 'towerClears', goal: 50 },
    { key: 'dtower_clears_30', name: '서른 번 방어', title: '진형의 장인', desc: '수성의 탑 방어 성공 누적 30회', stat: 'dtowerClears', goal: 30 },
    { key: 'daily_10',  name: '과제 열 개', title: '성실한 계란',   desc: '오늘의 과제 누적 10개 완료',     stat: 'dailyDone',    goal: 10 },
    //  ── 시즌 2 「다섯 세계」 (S-F, 2026-09-03) — 세계 5 정복 · 협동 첫승 · 첫 진화 · 특성 3단 ──
    //  세계 정복은 js/season.js 가 `worldConquer {world}` 로 보낸다(세계를 아는 곳이 거기뿐).
    //  협동 승·진화·특성은 통합자/S-H 가 Achievements 에 직접 보낸다.
    { key: 's2_world_meadow', name: '초원 정복',   title: '초원을 달린 자', desc: '시즌 2 · 초원(1~30층)의 세계 보스를 처치',      stat: 'world_meadow', goal: 1 },
    { key: 's2_world_mire',   name: '안개늪 정복', title: '안개를 걷은 자', desc: '시즌 2 · 안개늪(31~60층)의 세계 보스를 처치',   stat: 'world_mire',   goal: 1 },
    { key: 's2_world_ash',    name: '잿더미 정복', title: '재를 밟은 자',   desc: '시즌 2 · 잿더미(61~100층)의 세계 보스를 처치',  stat: 'world_ash',    goal: 1 },
    { key: 's2_world_rift',   name: '균열 정복',   title: '균열을 건넌 자', desc: '시즌 2 · 균열(101~150층)의 세계 보스를 처치',   stat: 'world_rift',   goal: 1 },
    { key: 's2_world_storm',  name: '폭풍 정복',   title: '폭풍을 탄 자',   desc: '시즌 2 · 폭풍 하늘(151층~)의 세계 보스를 처치', stat: 'world_storm',  goal: 1 },
    { key: 's2_coop_win_1',   name: '협동 첫승',   title: '함께 싸운 자',   desc: '협동 보스전에서 처음 이긴다',                    stat: 'coopWins',     goal: 1 },
    { key: 's2_evo_1',        name: '첫 진화',     title: '진화한 껍질',    desc: '스킬을 처음 진화시킨다',                          stat: 'skillEvos',    goal: 1 },
    { key: 's2_trait_3',      name: '특성 완성',   title: '뿌리 깊은 계란', desc: '특성 한 갈래를 3단까지 찍는다',                   stat: 'traitRankBest', goal: 3 }
  ],

  _defOf: function (key) {
    for (var i = 0; i < this.DEFS.length; i++) if (this.DEFS[i].key === key) return this.DEFS[i];
    return null;
  },

  _acct: function () {
    return (GAME.Account && GAME.Account.current && GAME.Account.current()) || 'guest';
  },
  _all: function () { return GAME.Store.get(this.KEY, {}) || {}; },
  _rec: function () {
    var all = this._all();
    var r = all[this._acct()];
    if (!r) r = {};
    if (!r.done) r.done = {};
    if (!r.c) r.c = {};
    if (!r.pending) r.pending = [];
    if (r.title === undefined) r.title = null;
    return r;
  },
  _save: function (rec) {
    var all = this._all();
    all[this._acct()] = rec;
    GAME.Store.set(this.KEY, all);
  },

  // ── 이벤트 → 카운터 ─────────────────────────────────────────────────────
  //  반환: 이번 호출로 **새로** 달성한 업적 key 배열(없으면 빈 배열).
  emit: function (event, payload) {
    payload = payload || {};
    var rec = this._rec();
    var c = rec.c;
    var n = Math.max(1, Math.round(Number(payload.n) || 1));
    var touched = true;
    switch (event) {
      case 'towerClear':
        c.towerBest = Math.max(c.towerBest || 0, Math.round(Number(payload.floor) || 0));
        c.towerClears = (c.towerClears || 0) + 1;
        if (payload.noHeal) c.noHealClears = (c.noHealClears || 0) + 1;
        break;
      case 'dtowerClear':
        c.dtowerBest = Math.max(c.dtowerBest || 0, Math.round(Number(payload.run) || 0));
        c.dtowerClears = (c.dtowerClears || 0) + 1;
        break;
      case 'rtResult':
        if (payload.practice) {
          c.practiceGames = (c.practiceGames || 0) + 1;
          if (payload.won) c.practiceWins = (c.practiceWins || 0) + 1;
        } else {
          c.rtGames = (c.rtGames || 0) + 1;
          if (payload.won) {
            c.rtWins = (c.rtWins || 0) + 1;
            c.rtStreak = (c.rtStreak || 0) + 1;
            c.rtStreakBest = Math.max(c.rtStreakBest || 0, c.rtStreak);
          } else {
            c.rtStreak = 0;
          }
        }
        break;
      case 'kill':     c.kills = (c.kills || 0) + n; break;
      case 'orb':      c.orbs = (c.orbs || 0) + n; break;
      case 'bossKill': c.bossKills = (c.bossKills || 0) + n; break;
      case 'siegeWin': c.siegeWins = (c.siegeWins || 0) + 1; break;
      case 'gear':     c.gearTier = Math.max(c.gearTier || 0, Math.round(Number(payload.tier) || 0)); break;
      case 'dailyDone': c.dailyDone = (c.dailyDone || 0) + n; break;
      //  ── 시즌 2 (S-F) ──
      case 'worldConquer': {                       //  { world: 'meadow'|'mire'|'ash'|'rift'|'storm' } — js/season.js 가 보낸다
        var wk = String(payload.world || '');
        if (!/^[a-z]+$/.test(wk)) { touched = false; break; }
        c['world_' + wk] = 1;
        break;
      }
      case 'coopWin':  c.coopWins = (c.coopWins || 0) + 1; break;              //  협동 보스전 승리
      case 'skillEvo': c.skillEvos = (c.skillEvos || 0) + n; break;            //  스킬 진화 n회
      case 'trait':    c.traitRankBest = Math.max(c.traitRankBest || 0, Math.round(Number(payload.rank) || 0)); break;   //  { rank } 한 갈래의 단
      default: touched = false;
    }
    if (!touched) return [];
    var fresh = this._check(rec);
    this._save(rec);
    for (var i = 0; i < fresh.length; i++) {
      var d = this._defOf(fresh[i]);
      if (d) GAME.MetaToast.push('🏆 업적 달성 — ' + d.name + '   ·   칭호: ' + d.title,
        { sound: 'coin' });
    }
    return fresh;
  },

  //  카운터로 판정. 이미 달성한 것은 절대 다시 달성되지 않는다(done 에 시각이 남는다).
  _check: function (rec) {
    var fresh = [];
    var now = Date.now();
    for (var i = 0; i < this.DEFS.length; i++) {
      var d = this.DEFS[i];
      if (rec.done[d.key]) continue;
      if ((rec.c[d.stat] || 0) >= d.goal) {
        rec.done[d.key] = now;
        rec.pending.push(d.key);
        fresh.push(d.key);
      }
    }
    return fresh;
  },

  // ── 조회 ─────────────────────────────────────────────────────────────────
  progress: function (key) {
    var d = this._defOf(key);
    if (!d) return null;
    var rec = this._rec();
    var cur = Math.min(d.goal, rec.c[d.stat] || 0);
    return { key: key, cur: cur, goal: d.goal, done: !!rec.done[key], at: rec.done[key] || 0,
             pct: d.goal ? cur / d.goal : 0 };
  },

  list: function () {
    var rec = this._rec();
    var out = [];
    for (var i = 0; i < this.DEFS.length; i++) {
      var d = this.DEFS[i];
      var cur = Math.min(d.goal, rec.c[d.stat] || 0);
      out.push({ key: d.key, name: d.name, title: d.title, desc: d.desc, goal: d.goal,
                 cur: cur, done: !!rec.done[d.key], at: rec.done[d.key] || 0,
                 pct: d.goal ? cur / d.goal : 0 });
    }
    return out;
  },

  doneCount: function () {
    var rec = this._rec(), n = 0;
    for (var i = 0; i < this.DEFS.length; i++) if (rec.done[this.DEFS[i].key]) n++;
    return n;
  },

  titleOf: function (key) {
    var d = this._defOf(key);
    return d ? d.title : '';
  },

  //  달성한 업적의 칭호만 고를 수 있다. null 을 주면 칭호를 뗀다.
  setTitle: function (key) {
    var rec = this._rec();
    if (key === null || key === undefined || key === '') {
      rec.title = null; this._save(rec); return true;
    }
    if (!this._defOf(key) || !rec.done[key]) return false;
    rec.title = key;
    this._save(rec);
    return true;
  },

  currentTitleKey: function () {
    var rec = this._rec();
    return (rec.title && rec.done[rec.title]) ? rec.title : null;
  },
  currentTitle: function () {
    var k = this.currentTitleKey();
    return k ? this.titleOf(k) : '';
  },

  //  달성한 칭호 목록(프로필의 칭호 선택 팝업용). 달성 순.
  earnedTitles: function () {
    var rec = this._rec();
    var out = [];
    for (var i = 0; i < this.DEFS.length; i++) {
      var d = this.DEFS[i];
      if (rec.done[d.key]) out.push({ key: d.key, title: d.title, name: d.name, at: rec.done[d.key] });
    }
    out.sort(function (a, b) { return a.at - b.at; });
    return out;
  },

  // ── 알림 ─────────────────────────────────────────────────────────────────
  //  새로 달성했는데 아직 화면에 안 띄운 것.
  pending: function () { return this._rec().pending.slice(); },

  //  pending 을 비우고 돌려준다(flush 가 쓴다 — 헤드리스 감사도 이걸로 비운다).
  takePending: function () {
    var rec = this._rec();
    var out = rec.pending.slice();
    rec.pending = [];
    this._save(rec);
    return out;
  },

  //  토스트로 띄우고 비운다. 일일 과제 완료 알림도 같은 엔진이므로 여기서 함께 흘린다 —
  //  호출부는 이 한 줄만 부르면 된다: `GAME.Achievements.flush(this)`.
  //  ⚠ emit 시점에 이미 MetaToast 큐에 넣어 두므로 여기서는 큐가 비어 있을 때만
  //    (예: 다른 씬에서 달성했고 그 씬은 flush 를 안 불렀을 때) pending 으로 다시 채운다.
  flush: function (scene) {
    var keys = this.takePending();
    if (!GAME.MetaToast.queue.length) {
      for (var i = 0; i < keys.length; i++) {
        var d = this._defOf(keys[i]);
        if (d) GAME.MetaToast.push('🏆 업적 달성 — ' + d.name + '   ·   칭호: ' + d.title,
          { sound: 'coin' });
      }
      if (GAME.Daily && GAME.Daily.requeue) GAME.Daily.requeue();
    } else if (GAME.Daily && GAME.Daily.takePending) {
      GAME.Daily.takePending();
    }
    GAME.MetaToast.flush(scene);
    return keys;
  }
};
