window.GAME = window.GAME || {};

// ============================================================================
//  가이드 전투 (FTUE, 2026-09-02 대격변 v3 갈래 B) — **단계 정의 + 조건 판정**
//
//  "첫 60초 안에 조작하며 배우고 첫 승리 보상을 받는다"가 업계 최상위 FTUE 기준이다.
//  글 모달(js/tutorial.js)은 입구 안내판이고, 이 파일은 **첫 탑 1층 전투 위에 얹히는
//  행동 코치**의 두뇌다. 그림은 js/scenes/guide.js(오버레이 씬, Battle 과 병렬)가 맡는다.
//
//  규율
//  · 각 단계는 **실제 행동으로만** 넘어간다(글 읽고 '확인' 아님). 판정 함수는 전부
//    순수 함수라 헤드리스(tools/guide-audit.js)로 가짜 상태를 넣어 검사한다.
//  · Phaser 를 최상위에서 참조하지 않는다 — tools/sim.js 샌드박스에 올라간다.
//  · battle.js 는 **읽기만** 한다(다른 갈래가 편집 중). 씬 훅은 Battle 의 이벤트
//    이미터에 리스너를 얹는 것뿐이다.
//  · 1회 규칙은 GAME.Onboard('guide-tower1'). 승리로 완주하거나 건너뛰면 기록된다.
//    **패배하면 기록하지 않는다** — 다음 1층 재도전에 다시 뜬다(완주 못 한 가이드는
//    본 것이 아니다).
//  · battle.js 의 옛 3단계 코치('battle-coach-v1')와 겹치면 안내가 두 겹이 된다 →
//    가이드가 뜨는 판에는 그 키를 먼저 seen 으로 눌러 둔다(arm 에서).
// ============================================================================
GAME.Guide = {
  KEY: 'guide-tower1',
  OLD_COACH_KEY: 'battle-coach-v1',

  MOVE_PX: 60,            // ① 영웅이 이만큼 움직이면 통과
  DODGE_HOLD_MS: 3000,    // ④ 예고가 보인 뒤 이만큼 지나면(못 피했어도) 통과
  DODGE_WAIT_MS: 8000,    // ④ 예고가 한 번도 안 오면 이만큼 뒤 통과(가이드가 판을 막지 않는다)

  //  통합자가 보상 토스트 이벤트로 잇는다 — 여기서는 노출만.
  reward: { gold: 50 },
  done: false,            // 이번 가이드가 **승리로** 끝났다(결과 화면 진입 전 읽는다)
  force: false,           // ❓ 다시 보기 — 최고층 조건을 한 번 무시
  pendingMode: null,      // arm() 이 걸어 둔 모드('tower1'). Battle create 에서 소비된다

  STEPS: [
    { id: 'move',   n: '①', touch: '스틱을 밀어 움직여 보세요', pc: '방향키로 움직여 보세요', target: 'stick' },
    { id: 'attack', n: '②', touch: '가까이 가면 자동으로 공격합니다', pc: '가까이 가면 자동으로 공격합니다', target: 'enemy' },
    { id: 'skill',  n: '③', touch: '스킬 버튼을 눌러 보세요', pc: 'Q 를 눌러 스킬을 써 보세요', target: 'skillQ' },
    { id: 'dodge',  n: '④', touch: '피하세요 — 붉은 예고 원 밖으로', pc: '피하세요 — 붉은 예고 원 밖으로', target: 'telegraph' },
    { id: 'finish', n: '⑤', touch: '남은 적을 모두 처치하세요', pc: '남은 적을 모두 처치하세요', target: 'enemy' }
  ],

  stepText: function (i, touch) {
    var s = this.STEPS[i];
    if (!s) return '';
    return s.n + ' ' + (touch ? s.touch : s.pc);
  },

  // ── 1회 규칙 ─────────────────────────────────────────────────────────────
  seen: function () {
    return !!(GAME.Onboard && GAME.Onboard.seen().indexOf(this.KEY) >= 0);
  },

  //  처음 통곡의 탑에 들어온 계정(최고층 0 · 가이드 미완료)의 1층 전투에만.
  shouldShow: function (floor, opts) {
    opts = opts || {};
    if (opts.rt) return false;
    if ((floor || 1) > 1) return false;
    if (!GAME.Onboard) return false;
    if (this.seen()) return false;
    if (this.force) return true;
    var rec = GAME.Tower && GAME.Tower.get ? GAME.Tower.get() : { best: 0 };
    return !(rec.best > 0);
  },

  // ── 전투 진입 훅 ─────────────────────────────────────────────────────────
  //  tower.js 는 Battle 을 직접 켜지 않는다(TowerLoading 을 거친다). 그래서 "전투
  //  진입 직후"는 **Battle 씬의 create 이벤트**로 잡는다 — battle.js 를 안 고치고
  //  그 씬의 이미터에 한 번짜리 리스너를 얹는 것뿐이다.
  //  ⚠ 두 번 arm 해도 리스너는 하나다(모드만 갱신). 소비되면 스스로 떼어진다.
  arm: function (mode) {
    this.pendingMode = mode || 'tower1';
    this.force = false;
    //  옛 인전투 코치와 두 겹이 되지 않게 — 가이드가 그 역할을 통째로 물려받는다.
    if (GAME.Onboard && GAME.Onboard.seen().indexOf(this.OLD_COACH_KEY) < 0) {
      GAME.Onboard.markSeen(this.OLD_COACH_KEY);
    }
    var bs = this._battle();
    if (!bs || !bs.events || this._armedFn) return true;
    var self = this;
    this._armedFn = function () {
      var m = self.pendingMode;
      self.disarm();
      if (!m) return;
      //  Battle 이 정말 "탑 1층 · 내가 모는 영웅 · 실시간 아님" 인지 확인한다.
      if (!bs.scene || !bs.scene.isActive || !bs.scene.isActive()) return;
      if (bs.rt || !bs.tower || bs.tower > 1 || !bs.hero || !bs.state) return;
      try { bs.scene.launch('Guide', { mode: m }); } catch (e) {}
    };
    bs.events.once('create', this._armedFn);
    return true;
  },

  disarm: function () {
    var bs = this._battle();
    if (bs && bs.events && this._armedFn) bs.events.off('create', this._armedFn);
    this._armedFn = null;
    this.pendingMode = null;
  },

  _battle: function () {
    try {
      return (GAME.game && GAME.game.scene && GAME.game.scene.getScene('Battle')) || null;
    } catch (e) { return null; }
  },

  // ── 진행 상태 ─────────────────────────────────────────────────────────────
  createRun: function (hero) {
    return {
      step: 0,
      x0: hero ? hero.x : 0, y0: hero ? hero.y : 0,
      t: 0,          // 전체 경과(ms)
      stepT: 0,      // 현재 단계 경과(ms)
      seenAt: null,  // ④ 예고를 처음 본 시각(stepT 기준)
      passed: [],
      finished: false,
      won: false
    };
  },

  // ── 판정 5종 — 전부 순수 함수 ───────────────────────────────────────────
  //  ① 이동: 시작 지점에서 MOVE_PX 이상
  moved: function (hero, run) {
    if (!hero) return false;
    var dx = hero.x - run.x0, dy = hero.y - run.y0;
    return Math.sqrt(dx * dx + dy * dy) >= this.MOVE_PX;
  },

  //  ② 공격: 적 유닛 하나라도 체력이 줄었다(죽은 것도 줄어든 것이다)
  enemyHurt: function (state, hero) {
    if (!state || !state.units) return false;
    var side = hero ? hero.side : 'controller';
    for (var i = 0; i < state.units.length; i++) {
      var u = state.units[i];
      if (!u || u.side === side) continue;
      if (!u.alive) return true;
      if (typeof u.maxHp === 'number' && u.hp < u.maxHp) return true;
    }
    return false;
  },

  //  ③ 스킬: 쿨이 도는 순간(skillCd > 0)이 곧 시전이다 — 로직에 손대지 않고 읽는다
  skillCast: function (hero) {
    if (!hero || !hero.skillCd) return false;
    for (var k in hero.skillCd) if (hero.skillCd[k] > 0) return true;
    return false;
  },

  //  ④ 회피: 적 진영 예고(state.effects 의 kind 'telegraph', side 가 있고 내 편이 아님)
  //  ⚠ 영웅 자신의 스킬 예고(side 없음)는 세지 않는다 — 내 예고를 "피하라"면 헛소리다.
  //  outside = 모든 적 예고 원의 **완전히** 밖(중심 거리 > r + 내 반지름).
  dodgeState: function (state, hero) {
    var res = { telegraphs: 0, outside: true, nearest: null };
    if (!state || !state.effects || !hero) return res;
    var hr = (hero.radius || (hero.def && hero.def.radius) || 0);
    var best = Infinity;
    for (var i = 0; i < state.effects.length; i++) {
      var e = state.effects[i];
      if (!e || e.kind !== 'telegraph' || !e.side || e.side === hero.side) continue;
      res.telegraphs++;
      var dx = hero.x - e.x, dy = hero.y - e.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d <= (e.r || 0) + hr) res.outside = false;
      if (d < best) { best = d; res.nearest = e; }
    }
    return res;
  },

  dodged: function (run, hero, state) {
    var ds = this.dodgeState(state, hero);
    if (ds.telegraphs > 0 && run.seenAt === null) run.seenAt = run.stepT;
    if (run.seenAt !== null) {
      if (ds.telegraphs > 0 && ds.outside) return true;
      if (run.stepT - run.seenAt >= this.DODGE_HOLD_MS) return true;
      return false;
    }
    return run.stepT >= this.DODGE_WAIT_MS;
  },

  //  ⑤ 종료: 전투가 끝났다
  ended: function (state) { return !!(state && state.over); },

  //  매 프레임 — 현재 단계의 조건을 보고 넘긴다.
  //  반환: null | { passed: id } | { finished: true, won: bool }
  advance: function (run, hero, state, dtMs) {
    if (!run || run.finished) return null;
    dtMs = dtMs || 0;
    run.t += dtMs; run.stepT += dtMs;
    //  전투가 끝나면 어느 단계에 있든 종료다(가이드가 결과를 막으면 안 된다).
    if (this.ended(state)) {
      run.finished = true;
      run.won = !!(state && state.winner === (hero ? hero.side : 'controller'));
      return { finished: true, won: run.won };
    }
    var id = this.STEPS[run.step].id, ok = false;
    if (id === 'move') ok = this.moved(hero, run);
    else if (id === 'attack') ok = this.enemyHurt(state, hero);
    else if (id === 'skill') ok = this.skillCast(hero);
    else if (id === 'dodge') ok = this.dodged(run, hero, state);
    else if (id === 'finish') ok = false;   // 종료 판정은 위에서
    if (!ok) return null;
    run.passed.push(id);
    run.step = Math.min(run.step + 1, this.STEPS.length - 1);
    run.stepT = 0; run.seenAt = null;
    return { passed: id };
  },

  // ── 마무리 ──────────────────────────────────────────────────────────────
  //  승리면 기록하고 done 을 세운다. 패배면 기록하지 않는다(다시 뜬다).
  complete: function (run, won) {
    if (run) { run.finished = true; run.won = !!won; }
    if (won) {
      if (GAME.Onboard) GAME.Onboard.markSeen(this.KEY);
      this.done = true;
    }
    return !!won;
  },

  skip: function (run) {
    if (run) run.finished = true;
    if (GAME.Onboard) GAME.Onboard.markSeen(this.KEY);
    this.done = false;
    return true;
  },

  //  통합자용 — 보상을 한 번만 꺼내 간다(결과 화면·토스트).
  claim: function () {
    if (!this.done) return null;
    this.done = false;
    return { gold: this.reward.gold };
  },

  //  ❓ 다시 보기(js/tutorial.js) — 기록을 지우고 다음 1층 전투에 다시 띄운다.
  reset: function () {
    if (GAME.Onboard && GAME.Onboard._all) {
      var all = GAME.Onboard._all(), k = GAME.Onboard._key();
      var a = all[k] || [];
      var i = a.indexOf(this.KEY);
      if (i >= 0) { a.splice(i, 1); all[k] = a; GAME.Store.set(GAME.Onboard.KEY, all); }
    }
    this.force = true;
    this.done = false;
  }
};
