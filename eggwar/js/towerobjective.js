window.GAME = window.GAME || {};

// ============================================================================
//  통곡의 탑 — 층 목표 (2026-07-31 대개편 2단계)
//
//  ## 왜 만들었나
//
//  플레이어가 만지는 세 축(공간·규칙·**목표**) 중 마지막이 남아 있었다.
//  1단계가 공간(towerplan)과 규칙(towerrule)을 바꿨지만 목표는 언제나 "전멸시켜라" 였다.
//  목표가 하나면 최적 플레이도 하나로 수렴한다 — 모든 적을 안전하게 지울 순서를 찾는 것.
//
//  목표를 바꾸면 **같은 진형·같은 조건에서도 다른 판**이 된다:
//    · "우두머리만 잡으면 된다" → 잡졸을 무시하고 뚫고 들어가는 결단
//    · "N초 버티면 된다" → 죽이지 않고 도망다니는, 완전히 다른 손놀림
//    · "전멸시키되 제한 시간 안에" → 안전한 순서를 포기하고 위험을 감수
//
//  ## 구현 규율
//
//  1. **기본은 여전히 전멸이다.** 목표는 가끔 나와야 특별하다 — 매 층 다른 목표면
//     "이번엔 뭐지"를 읽는 비용만 늘고 익숙해질 틈이 없다.
//  2. **패배 조건은 건드리지 않는다.** 영웅이 죽으면 언제나 진다. 목표는 **이기는 길**만
//     바꾼다 — 두 축을 다 흔들면 플레이어가 무엇 때문에 졌는지 알 수 없다.
//  3. **화면이 목표를 말한다.** 안 보이는 목표는 목표가 아니라 함정이다.
//  4. 보스 층에는 목표를 붙이지 않는다(보스 자체가 그 층의 사건이다). 조건과 같은 규칙.
// ============================================================================

// ============================================================================
//  ── 탑 전용 정예 (2026-07-31) ─────────────────────────────────────────────
//  `TowerRule` 의 `elite` 훅이 켜지면 전투 시작 때 **적 한 기를 정예로 승격**한다.
//  새 유닛 종류를 만들지 않는 이유는 towerrule.js 의 해당 항목 주석에 있다.
//  여기 두는 이유: 목표(objective)와 마찬가지로 "유닛이 다 만들어진 뒤 한 번" 도는
//  설치 코드라 생애주기가 같다. 매 프레임 도는 부분은 combat.js 가 맡는다.
// ============================================================================
GAME.TowerElite = (function () {
  return {
    // 전투 시작 때 한 번. 가장 앞(플레이어에 가까운) 쪽이 아니라 **한가운데**를 고른다 —
    // 맨 앞이면 어차피 먼저 죽어서 기제가 발동할 틈이 없고, 맨 뒤면 닿지도 않는다.
    attach: function (state, hooks) {
      if (!hooks || !hooks.elite) return null;
      var cfg = hooks.elite;
      var pool = [];
      for (var i = 0; i < state.units.length; i++) {
        var u = state.units[i];
        if (!u.alive || u.side !== 'strategist') continue;
        if (GAME.Combat.isHazard(u)) continue;
        pool.push(u);
      }
      if (!pool.length) return null;
      pool.sort(function (a, b) { return a.y - b.y; });
      var e = pool[Math.floor(pool.length / 2)];

      e.elite = cfg.kind;
      e.eliteCfg = cfg;
      if (cfg.hp) {
        e.maxHp = Math.round(e.maxHp * cfg.hp);
        e.hp = e.maxHp;
      }
      // 그리는 크기만 키운다 — 히트박스(def.radius)를 키우면 사거리 판정이 바뀌어
      // 밸런스가 조용히 움직인다(CLAUDE.md 의 파수꾼 radius 실측이 그 증거다).
      if (cfg.size) e.eliteDraw = cfg.size;
      state.elite = e;
      return e;
    }
  };
})();

GAME.TowerObjective = (function () {

  // 목표가 나오기 시작하는 층. 조건(6층)보다 늦다 — 한 번에 다 켜면 구분이 안 된다.
  var FROM_FLOOR = 9;
  // 몇 층에 한 번 나오는가. 4면 25% 다.
  var EVERY = 4;

  var OBJECTIVES = [
    {
      key: 'slayLeader', label: '우두머리 사냥',
      desc: '가장 강한 적 한 기만 쓰러뜨리면 이긴다',
      hint: '잡졸을 무시하고 뚫고 들어갈 것인가, 안전하게 걷어낼 것인가',
      // 목표 대상 고르기 — 전략가 유닛 중 최대 체력이 가장 큰 하나
      choose: function (state) {
        var best = null;
        for (var i = 0; i < state.units.length; i++) {
          var u = state.units[i];
          if (!u.alive || u.side !== 'strategist' || GAME.Combat.isHazard(u)) continue;
          if (!best || u.maxHp > best.maxHp) best = u;
        }
        return best ? [best] : [];
      },
      // 이겼는가 — 대상이 전부 죽었으면.
      won: function (state, marks) {
        if (!marks || !marks.length) return false;
        for (var i = 0; i < marks.length; i++) if (marks[i].alive) return false;
        return true;
      }
    },
    {
      key: 'survive', label: '버티기',
      desc: '40초를 버티면 이긴다 — 다 죽일 필요가 없다',
      hint: '죽이지 않고 살아남는, 완전히 다른 손놀림',
      seconds: 40,
      choose: function () { return []; },
      won: function (state) { return state.elapsed >= 40000; }
    },
    {
      key: 'blitz', label: '속공',
      desc: '35초 안에 전멸시켜야 한다 — 시간을 넘기면 진다',
      hint: '안전한 순서를 포기하고 위험을 감수하게 만든다',
      seconds: 35,
      choose: function () { return []; },
      // 전멸은 기본 판정이 처리한다. 여기서는 **시간 초과를 패배로** 바꾸는 것만 한다.
      failAfter: 35000,
      won: function () { return false; }
    }
  ];

  function rng(seed) {
    var s = seed | 0; if (!s) s = 1;
    return function () {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s |= 0;
      return ((s >>> 0) % 100000) / 100000;
    };
  }

  // 2026-08-01 — towerplan.js 의 seedNow() 와 같은 이유로 TowerChar.climbSeed 를 먼저 본다.
  function seedNow() {
    var tc = GAME.TowerChar && GAME.TowerChar.get();
    if (tc && tc.climbSeed) return (tc.climbSeed ^ 0xabcd) | 0;
    var run = GAME.TowerRun && GAME.TowerRun.get();
    return (run && run.seed) ? ((run.seed ^ 0xabcd) | 0) : 0x0b1e;
  }

  return {
    OBJECTIVES: OBJECTIVES,
    FROM_FLOOR: FROM_FLOOR,
    EVERY: EVERY,

    byKey: function (k) {
      for (var i = 0; i < OBJECTIVES.length; i++) if (OBJECTIVES[i].key === k) return OBJECTIVES[i];
      return null;
    },

    // 이 층의 목표. 없으면 null(=전멸).
    objectiveFor: function (floor, seed) {
      if (floor < FROM_FLOOR) return null;
      if (GAME.Tower && GAME.Tower.isBossFloor && GAME.Tower.isBossFloor(floor)) return null;
      if (floor % EVERY !== 0) return null;
      var s = (seed === undefined) ? seedNow() : (seed | 0);
      var r = rng((s ^ (floor * 0x45d9f3b)) | 0);
      return OBJECTIVES[Math.floor(r() * OBJECTIVES.length)];
    },

    // 전투 시작 때 한 번 — 목표를 state 에 붙이고 대상을 고른다.
    attach: function (state, floor, seed) {
      var ob = this.objectiveFor(floor, seed);
      if (!ob) return null;
      state.objective = {
        key: ob.key, label: ob.label, desc: ob.desc,
        marks: ob.choose(state) || [],
        failAfter: ob.failAfter || 0,
        seconds: ob.seconds || 0
      };
      return state.objective;
    },

    // 매 프레임 판정. `Combat.update` 의 승패 판정 **앞**에서 부른다.
    //   'win'  — 목표 달성
    //   'lose' — 목표 실패(시간 초과)
    //   null   — 아직
    check: function (state) {
      var o = state && state.objective;
      if (!o) return null;
      var ob = this.byKey(o.key);
      if (!ob) return null;
      if (o.failAfter && state.elapsed >= o.failAfter) return 'lose';
      return ob.won(state, o.marks) ? 'win' : null;
    }
  };
})();
