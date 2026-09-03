window.GAME = window.GAME || {};

// ============================================================================
//  통곡의 탑 — 층 조건 (2026-07-30 대개편)
//
//  ## 왜 만들었나
//
//  사용자 신고: "컨트롤이 매번 똑같은 구조다."
//  맞는 관찰이었다. 배치 원형(towerplan.js)이 **공간**을 바꿔도, 규칙이 같으면
//  최적 플레이는 하나로 수렴한다 — 사거리 끝에서 옆으로 돌며 쿨타임마다 때린다.
//  그게 모든 층에서 통하는 답이면 컨트롤은 층수와 무관하게 같은 손놀림이다.
//
//  그래서 **규칙 자체를 층마다 바꾼다.** 조건은 난이도를 올리는 장치가 아니라
//  **다른 답을 강제하는 장치**다. 그 구분이 이 파일의 설계 기준이다:
//    · "적 체력 +20%" 는 조건이 아니다 — 같은 답을 더 오래 반복하게 만들 뿐이다(그건 modsFor).
//    · "적이 죽을 때 주변 아군이 세진다" 는 조건이다 — **처치 순서**를 바꾸게 만든다.
//
//  ## 각 조건이 무엇을 강제하는가 (이 표가 없으면 조건을 추가하지 말 것)
//
//  | 조건    | 바꾸는 것            | 막는 습관                |
//  |---------|----------------------|--------------------------|
//  | 광란    | 시간이 흐르면 적이 세진다 | 무한 카이팅(시간을 쓰는 답) |
//  | 철벽    | 장갑↑ 체력↓          | 잔딜 누적                 |
//  | 질풍    | 속도↑ 체력↓          | 거리 유지                 |
//  | 결속    | 죽으면 주변이 세진다   | 아무 순서로나 처치         |
//  | 무보급  | 물약 없음             | 맞고 버티기               |
//  | 끈질김  | 추격 반경↑            | 끌고 다니기               |
//  | 좁은눈  | 시야(aggro)↓ 공격력↑  | 뭉텅이로 끌어모으기        |
//
//  ## 구현 규율
//
//  1. **밸런스 축과 조건 축을 섞지 않는다.** `Tower.modsFor` 는 층수에 따른 완만한 성장만
//     담당하고, 조건은 그 위에 곱해진다. 두 축을 한 함수에 넣으면 곡선을 다시 잴 수 없다.
//  2. **조건은 서로 상쇄하지 않는다** — 한 층에 하나만 붙는다. 둘을 겹치면 무엇이 무엇을
//     한 건지 플레이어도 나도 알 수 없다.
//  3. **이름과 한 줄 설명이 화면에 뜬다.** 이름 없는 변화는 '그냥 어려워짐'이다.
//  4. **1~5층에는 조건이 없다.** 연습 구간(1~3층) + 원형만 먼저 익히는 두 층.
//  5. 배수는 `Combat.MOD_KEYS` 에 있는 축만 쓸 수 있다. 없는 축을 쓰면 **조용히 무시된다.**
//
//  ⚠ `frenzy`(광란)·`bond`(결속)·`tenacious`(끈질김)·`narrow`(좁은눈)는 배수만으로는
//    표현이 안 돼 전투 쪽에 훅이 필요하다. 어떤 훅을 쓰는지 각 항목의 `hook` 에 적었고,
//    `js/combat.js` 가 그 이름을 보고 동작한다. **훅 이름을 바꾸면 양쪽을 같이 고칠 것.**
// ============================================================================

GAME.TowerRule = (function () {

  // 조건이 붙기 시작하는 층. 그 아래는 원형만으로 충분히 새롭다.
  var FROM_FLOOR = 6;
  // 조건 없는 층의 비율 — 매 층 조건이 붙으면 조건이 '기본값'이 되어 특별함을 잃는다.
  // 3층마다 한 번은 조건 없이 쉬어 간다(리듬).
  var REST_EVERY = 3;

  var RULES = [
    {
      key: 'frenzy', label: '광란',
      desc: '시간이 흐를수록 적이 강해진다 — 오래 끌면 진다',
      mods: {},
      hook: 'frenzy',           // combat.js 가 elapsed 로 피해를 올린다
      hookArg: { per: 15000, add: 0.10, max: 0.60 },
      forbids: '무한 카이팅'
    },
    {
      key: 'ironclad', label: '철벽',
      desc: '두껍지만 무르다 — 약한 공격은 튕기고, 한 방이 잘 든다',
      // 비율 경감(100/(100+armor))이라 장갑 2배는 잔딜을 크게 깎는다.
      // 체력을 같이 낮춰 총 내구도는 비슷하게 두고 **답만 바꾼다**.
      mods: { armor: 2.2, hp: 0.78 },
      forbids: '잔딜 누적'
    },
    {
      key: 'gale', label: '질풍',
      desc: '빠르지만 약하다 — 거리를 벌리는 것으로는 못 막는다',
      mods: { speed: 1.30, hp: 0.82 },
      forbids: '거리 유지'
    },
    {
      key: 'bond', label: '결속',
      desc: '한 기가 죽으면 곁의 동료가 세진다 — 순서를 골라야 한다',
      mods: {},
      hook: 'bond',
      hookArg: { radius: 120, dmg: 0.18, max: 5 },
      forbids: '아무 순서로나 처치'
    },
    {
      key: 'nosupply', label: '무보급',
      desc: '이 층에서는 물약을 쓸 수 없다 — 대신 보상이 크다',
      mods: {},
      hook: 'nosupply',
      goldMul: 1.5,
      forbids: '맞고 버티기'
    },
    {
      key: 'tenacious', label: '끈질김',
      desc: '한번 붙으면 끝까지 따라온다 — 끌고 다녀도 떨어지지 않는다',
      mods: {},
      hook: 'tenacious',
      hookArg: { chaseMul: 2.4, aggroMul: 1.35 },
      forbids: '끌고 다니기'
    },
    {
      key: 'narrow', label: '좁은눈',
      desc: '늦게 알아채지만 알아채면 아프다 — 한꺼번에 끌어모으면 위험하다',
      mods: { damage: 1.22 },
      hook: 'narrow',
      hookArg: { aggroMul: 0.62 },
      forbids: '뭉텅이로 끌어모으기'
    },
    // ── 탑 전용 정예 (2026-07-31) ──────────────────────────────────────────
    //  "탑 전용 몬스터를 넣어 달라"는 요청에 **새 유닛 종류가 아니라 조건**으로 답한다.
    //  이유: 새 유닛은 아트(js/eggart.js)·밸런스·팔레트·AI 가중치를 전부 늘리고,
    //  그렇게 늘려도 결국 "체력 많은 전사" 가 되기 쉽다. 반면 정예는 **기존 유닛 한 기에
    //  기제를 얹는 것**이라 아트 0 · 새 밸런스 축 0 이면서, 층마다 다른 놈이 정예가 되므로
    //  같은 유닛이 다르게 싸운다. 세계관도 그대로다 — 부족의 정예 전사다.
    //  ⚠ 셋 다 **처치 순서를 강제**한다는 공통 목적을 가진다. 그게 이 게임에 없던 축이다.
    {
      key: 'warlord', label: '정예 · 두령',
      desc: '두령 한 기가 주변 아군을 강화한다 — 먼저 끊지 않으면 전부 세다',
      mods: {},
      hook: 'elite', hookArg: { kind: 'warlord', radius: 170, dmg: 0.30, hp: 1.6, size: 1.30 },
      forbids: '앞에서부터 순서대로 처치'
    },
    {
      key: 'bulwarkElite', label: '정예 · 방패',
      desc: '방패 정예가 곁의 아군에게 보호막을 준다 — 뒤를 치려면 먼저 걷어야 한다',
      mods: {},
      hook: 'elite', hookArg: { kind: 'shield', radius: 150, shieldFrac: 0.35,
                                every: 4000, hp: 1.8, size: 1.28 },
      forbids: '뒷줄만 골라 치기'
    },
    {
      key: 'bomber', label: '정예 · 폭심',
      desc: '폭심이 죽으면 크게 터진다 — 붙어서 잡으면 같이 다친다',
      mods: {},
      hook: 'elite', hookArg: { kind: 'bomb', radius: 132, dmgMul: 1.9, hp: 1.4, size: 1.26 },
      forbids: '붙어서 아무거나 먼저 잡기'
    }
  ];

  // ── 세계 조건 (시즌2 「다섯 세계」, 2026-09-03 S-W) ────────────────────────
  //  세계마다 **상시로 걸리는 조건** 하나. 돌아가는 조건(RULES)과 다른 축이다 —
  //  RULES 는 층마다 답을 바꾸고, 세계 조건은 그 세계에 있는 동안 **같은 답을 계속
  //  요구**한다(그래서 "세계"로 읽힌다). 값은 기본 조건의 강화판이고, 그 세계에서는
  //  같은 훅의 기본 조건을 돌림표에서 뺀다(`excludes`) — 같은 훅이 두 번 걸리면
  //  hooksFor 가 하나를 버려 화면과 전투가 어긋난다.
  //  ⚠ 초원(meadow)은 없다 — R-3·1~30층 곡선 기준선. 보스 층도 없다(ruleFor 와 같은
  //    이유: 보스 기제가 그 층의 조건이고, 세계 보스는 페이즈·전장까지 들고 있다).
  //  ⚠ 폭풍 하늘은 **조합**이다(`hooks` 복수) — 플랜 §1 S-W "둘 조합".
  var WORLD_RULES = {
    mire: {
      key: 'mireNarrow', label: '안개의 눈', world: 'mire',
      desc: '안개 속에서는 늦게 알아채지만 알아채면 아프다 — 한꺼번에 끌어모으면 위험하다',
      mods: { damage: 1.12 }, hook: 'narrow', hookArg: { aggroMul: 0.62 },
      excludes: ['narrow'], forbids: '뭉텅이로 끌어모으기'
    },
    ash: {
      key: 'ashFrenzy', label: '잿불 광란', world: 'ash',
      desc: '재가 쌓일수록 적이 거세진다 — 오래 끌면 진다',
      mods: {}, hook: 'frenzy', hookArg: { per: 12000, add: 0.12, max: 0.80 },
      excludes: ['frenzy'], forbids: '무한 카이팅'
    },
    rift: {
      key: 'riftBond', label: '균열의 결속', world: 'rift',
      desc: '한 기가 쓰러지면 곁의 동료가 더 세진다 — 순서를 골라야 한다',
      mods: {}, hook: 'bond', hookArg: { radius: 140, dmg: 0.22, max: 6 },
      excludes: ['bond'], forbids: '아무 순서로나 처치'
    },
    storm: {
      key: 'stormCrown', label: '폭풍의 관', world: 'storm',
      desc: '시간이 갈수록 거세지고, 한번 붙으면 끝까지 따라온다',
      mods: {},
      hooks: { frenzy: { per: 15000, add: 0.10, max: 0.60 },
               tenacious: { chaseMul: 2.0, aggroMul: 1.25 } },
      excludes: ['frenzy', 'tenacious'], forbids: '무한 카이팅 · 끌고 다니기'
    }
  };

  function worldOf(floor) {
    var TC = GAME.TowerCurriculum;
    if (TC && TC.worldFor) return TC.worldFor(floor);
    return { key: 'meadow', idx: 0, from: 1 };
  }

  function rng(seed) {
    var s = seed | 0; if (!s) s = 1;
    return function () {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s |= 0;
      return ((s >>> 0) % 100000) / 100000;
    };
  }

  //  이 세계에서 돌아가는 조건 풀. `worlds` 태그가 있으면 그 세계에서만, 세계 조건이
  //  `excludes` 한 것은 뺀다. 초원은 RULES 전부(= 예전 그대로).
  function poolFor(world) {
    var wr = WORLD_RULES[world.key];
    var ex = (wr && wr.excludes) || [];
    var out = [];
    for (var i = 0; i < RULES.length; i++) {
      var r = RULES[i];
      if (r.worlds && r.worlds.indexOf(world.key) < 0) continue;
      if (ex.indexOf(r.key) >= 0) continue;
      out.push(r);
    }
    return out.length ? out : RULES;
  }

  // 같은 구간 안에서 조건이 한 번씩 돌게 섞는다(원형과 같은 방식). 길이는 풀 기준.
  function shuffled(seed, cycleIdx, n) {
    var r = rng((seed ^ (cycleIdx * 0x85ebca6b)) | 0);
    var a = [];
    for (var i = 0; i < n; i++) a.push(i);
    for (var j = n - 1; j > 0; j--) {
      var k = Math.floor(r() * (j + 1));
      var t = a[j]; a[j] = a[k]; a[k] = t;
    }
    return a;
  }

  // 2026-08-01 — towerplan.js 의 seedNow() 와 같은 이유로 TowerChar.climbSeed 를
  // 먼저 본다(등반 시도마다 재롤되는 값 — 캐릭터 고정 시드를 쓰면 배치가 영원히 굳는다).
  function seedNow() {
    var tc = GAME.TowerChar && GAME.TowerChar.get();
    if (tc && tc.climbSeed) return (tc.climbSeed ^ 0x1234) | 0;
    var run = GAME.TowerRun && GAME.TowerRun.get();
    if (run && run.seed) return (run.seed ^ 0x1234) | 0;
    return 0x8eed;
  }

  return {
    RULES: RULES,
    WORLD_RULES: WORLD_RULES,
    FROM_FLOOR: FROM_FLOOR,
    poolFor: function (floor) { return poolFor(worldOf(floor)); },

    // ── 세계 조건 — 그 세계에 있는 동안 상시 (보스 층·초원 제외) ─────────────
    worldRuleFor: function (floor) {
      if (floor < FROM_FLOOR) return null;
      if (GAME.Tower && GAME.Tower.isBossFloor && GAME.Tower.isBossFloor(floor)) return null;
      return WORLD_RULES[worldOf(floor).key] || null;
    },

    // 이 층의 조건. 없으면 null.
    // ⚠ 보스 층에는 조건을 붙이지 않는다 — 보스 기제 자체가 그 층의 '조건' 이고,
    //   둘을 겹치면 보스 층이 벽이 된다(BOSS_ESCORT 를 잡느라 겪은 일과 같은 계열).
    // ⚠ 시즌2 — 풀은 **세계 기준**이다(poolFor). 초원은 옛 표·옛 순번 그대로라
    //   1~30층 결과가 한 층도 안 바뀐다. 다른 세계는 세계 첫 층부터 순번을 새로 센다
    //   (한 세계 안에서 풀이 한 번씩 돌게 — 9층 유일성의 세계판).
    ruleFor: function (floor, seed) {
      if (floor < FROM_FLOOR) return null;
      if (GAME.Tower && GAME.Tower.isBossFloor && GAME.Tower.isBossFloor(floor)) return null;
      var w = worldOf(floor);
      var pool = poolFor(w);
      var C = pool.length;
      var n = (w.idx === 0) ? (floor - FROM_FLOOR) : (floor - w.from);
      if (n % REST_EVERY === (REST_EVERY - 1)) return null;   // 쉬어 가는 층
      var s = (seed === undefined) ? seedNow() : (seed | 0);
      if (w.idx > 0) s = (s ^ (w.idx * 0x51ed27d)) | 0;
      // 쉬는 층을 뺀 순번으로 세야 조건이 골고루 돈다
      var idx = n - Math.floor((n + 1) / REST_EVERY);
      var order = shuffled(s, Math.floor(idx / C), C);
      return pool[order[((idx % C) + C) % C]];
    },

    // 이 층에 걸리는 조건 전부 — [세계 조건, 첫째, 둘째] 순(있는 것만).
    rulesFor: function (floor, seed) {
      var out = [];
      var wr = this.worldRuleFor(floor);
      if (wr) out.push(wr);
      var r = this.ruleFor(floor, seed);
      if (r) out.push(r);
      var r2 = this.ruleFor2(floor, seed);
      if (r2) out.push(r2);
      return out;
    },

    //  화면용 — '안개의 눈 + 철벽' / 설명은 ' / ' 로 잇는다. 없으면 null.
    labelFor: function (floor, seed) {
      var rs = this.rulesFor(floor, seed);
      if (!rs.length) return null;
      return { label: rs.map(function (r) { return r.label; }).join(' + '),
               desc: rs.map(function (r) { return r.desc; }).join(' / '),
               keys: rs.map(function (r) { return r.key; }) };
    },

    // ── 조건의 세기가 층을 따라간다 (2026-08-08, 사용자 지시) ────────────────
    //  신고: "층이 증가할수록 단순히 유닛 수만 늘리는 게 아니라 능력치나 배치로 좀
    //  다양하게 접목해 줬으면 좋겠어."
    //  조건표 자체는 6층부터 이미 골고루 돌고 있었다 — 문제는 **값이 안 자란다**는
    //  것이었다. 6층의 '좁은눈'과 37층의 '좁은눈'이 같은 값이면 후반엔 있으나 마나다.
    //  → 배수를 1 에서 얼마나 떨어져 있는지(=조건의 '세기')를 층에 비례해 키운다.
    //  ⚠ 배수를 그냥 곱하면 안 된다. `hp: 0.78` 처럼 **1 보다 작은 배수**는 곱할수록
    //    커져서 조건이 거꾸로 약해진다. 그래서 **1 에서의 거리**를 키운다.
    //  ⚠ 상한 1.8 — 실측(regress R-1)에서 그 위로 가면 후반 층이 벽이 된다.
    ruleScale: function (floor) {
      var f = Math.max(FROM_FLOOR, floor || FROM_FLOOR);
      return Math.min(1.8, 1 + (f - FROM_FLOOR) * 0.018);
    },

    // 층 조건의 배수를 기존 mods 에 곱해서 돌려준다. 원본은 안 건드린다.
    applyMods: function (mods, rule, floor) {
      var out = {};
      var k;
      for (k in mods) out[k] = mods[k];
      if (!rule || !rule.mods) return out;
      var sc = (floor === undefined) ? 1 : this.ruleScale(floor);
      for (k in rule.mods) {
        var v = rule.mods[k];
        var scaled = 1 + (v - 1) * sc;      // 1 에서의 거리를 키운다
        if (scaled < 0.05) scaled = 0.05;   // 0 이하로 내려가 유닛이 사라지는 것 방지
        out[k] = (out[k] === undefined ? 1 : out[k]) * scaled;
      }
      return out;
    },

    // ── 후반에는 조건이 둘이다 (2026-08-08) ───────────────────────────────
    //  ⚠ `SECOND_FROM` 아래에서는 절대 둘이 안 걸린다. 배우는 구간에 조건 둘을 겹치면
    //    무엇 때문에 죽었는지 못 가린다 — 이 파일이 '한 번에 하나'로 만든 이유 그대로다.
    //  ⚠ 보스 층은 여전히 조건 없음(위 `ruleFor` 가 이미 막는다).
    //  ⚠ 둘째 조건은 **첫째와 다른 것**을 고른다. 같은 것이 두 번 걸리면 배수가
    //    제곱이 되어 그 층만 벽이 된다.
    SECOND_FROM: 35,

    ruleFor2: function (floor, seed) {
      if (floor < this.SECOND_FROM) return null;
      var first = this.ruleFor(floor, seed);
      if (!first) return null;               // 쉬는 층·보스 층은 그대로 쉰다
      var pool = poolFor(worldOf(floor));
      var s = (seed === undefined) ? seedNow() : (seed | 0);
      var r = rng((s ^ (floor * 0x27d4eb2d)) | 0);
      for (var tries = 0; tries < 8; tries++) {
        var cand = pool[Math.floor(r() * pool.length) % pool.length];
        if (cand.key !== first.key) return cand;
      }
      return null;
    },

    //  이 층의 조건 배수를 **전부** 곱한다(세계 조건 → 첫째 → 둘째). Tower.modsFor 계열이
    //  부른다. ⚠ 예전엔 첫째 조건의 배수만 곱했다 — 둘째(철벽·질풍·좁은눈이 둘째로
    //  걸린 경우)는 화면에 이름만 뜨고 값은 안 걸렸다. 화면과 전투가 갈라지면 안 되므로
    //  둘째도 곱한다(35층부터라 R-3 10·20층 기준선과 무관).
    applyAll: function (mods, floor, seed) {
      var out = mods;
      var rs = this.rulesFor(floor, seed);
      for (var i = 0; i < rs.length; i++) out = this.applyMods(out, rs[i], floor);
      return out;
    },

    // 전투가 읽을 훅 묶음. 조건이 없으면 null 이라 전투는 아무 일도 하지 않는다.
    //  순서: 세계 조건(상시) → 첫째 → 둘째. 세계 조건은 `hooks`(복수)일 수 있다.
    hooksFor: function (floor, seed) {
      var rs = this.rulesFor(floor, seed);
      var h = {}, any = false;
      for (var i = 0; i < rs.length; i++) {
        var r = rs[i];
        //  ⚠ 훅이 겹치면 **덮어쓰지 않는다** — 먼저 온 것을 남긴다. 정예 훅이 두 번 걸리면
        //    한 유닛에 정예가 둘 붙어 그림도 판정도 꼬인다.
        if (r.hooks) {
          for (var k in r.hooks) { if (h[k] === undefined) { h[k] = r.hooks[k] || true; any = true; } }
        }
        if (r.hook && h[r.hook] === undefined) { h[r.hook] = r.hookArg || true; any = true; }
      }
      return any ? h : null;
    }
  };
})();
