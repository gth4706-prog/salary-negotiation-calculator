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

  function rng(seed) {
    var s = seed | 0; if (!s) s = 1;
    return function () {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s |= 0;
      return ((s >>> 0) % 100000) / 100000;
    };
  }

  var CYCLE = RULES.length;

  // 같은 구간 안에서 조건이 한 번씩 돌게 섞는다(원형과 같은 방식).
  function shuffled(seed, cycleIdx) {
    var r = rng((seed ^ (cycleIdx * 0x85ebca6b)) | 0);
    var a = [];
    for (var i = 0; i < CYCLE; i++) a.push(i);
    for (var j = CYCLE - 1; j > 0; j--) {
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
    FROM_FLOOR: FROM_FLOOR,

    // 이 층의 조건. 없으면 null.
    // ⚠ 보스 층에는 조건을 붙이지 않는다 — 보스 기제 자체가 그 층의 '조건' 이고,
    //   둘을 겹치면 보스 층이 벽이 된다(BOSS_ESCORT 를 잡느라 겪은 일과 같은 계열).
    ruleFor: function (floor, seed) {
      if (floor < FROM_FLOOR) return null;
      if (GAME.Tower && GAME.Tower.isBossFloor && GAME.Tower.isBossFloor(floor)) return null;
      var n = floor - FROM_FLOOR;
      if (n % REST_EVERY === (REST_EVERY - 1)) return null;   // 쉬어 가는 층
      var s = (seed === undefined) ? seedNow() : (seed | 0);
      // 쉬는 층을 뺀 순번으로 세야 조건이 골고루 돈다
      var idx = n - Math.floor((n + 1) / REST_EVERY);
      var order = shuffled(s, Math.floor(idx / CYCLE));
      return RULES[order[((idx % CYCLE) + CYCLE) % CYCLE]];
    },

    // 층 조건의 배수를 기존 mods 에 곱해서 돌려준다. 원본은 안 건드린다.
    applyMods: function (mods, rule) {
      var out = {};
      var k;
      for (k in mods) out[k] = mods[k];
      if (!rule || !rule.mods) return out;
      for (k in rule.mods) out[k] = (out[k] === undefined ? 1 : out[k]) * rule.mods[k];
      return out;
    },

    // 전투가 읽을 훅 묶음. 조건이 없으면 null 이라 전투는 아무 일도 하지 않는다.
    hooksFor: function (floor, seed) {
      var r = this.ruleFor(floor, seed);
      if (!r || !r.hook) return null;
      var h = {};
      h[r.hook] = r.hookArg || true;
      return h;
    }
  };
})();
