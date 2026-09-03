window.GAME = window.GAME || {};

// ============================================================================
//  특성 트리 (시즌 2 「다섯 세계」 · S-H, 2026-09-03)
//
//  ## 무엇인가
//  영웅마다 **3갈래 × 3단**. 화폐는 **세계 포인트**(js/season.js — 세계 진입·보스 처치·
//  협동 승으로만 번다). 단은 순서대로만 배운다(1→2→3). 영구 캐릭터(TowerChar)에
//  `rec.traits = { 갈래키: 단 }` 로 저장되고, 캐릭터를 지우면 같이 사라진다.
//
//  ## 규율 — 축복(js/towerboon.js)과 **같은 문법, 같은 훅**
//  · **행동 훅만** 쓴다. "공격력 +10" 은 레벨업(STATS)의 일이다(towerboon.js 의 표).
//  · 훅 이름은 `combat.js` 가 아는 8개(huntersRush · momentum · riposte · lastStand ·
//    overload · siphon · phase · echo)뿐이다 — combat.js 를 안 건드리는 것이 시즌2 규칙이라
//    새 훅은 만들지 않는다. 단(tier)이 오르면 **인자(arg)** 가 세진다.
//  · `state.boons` 한 통로로 전투에 들어간다(축복·구슬과 같은 자리). 그래서 구슬을 주워
//    `state.boons` 가 통째로 다시 만들어질 때 특성이 증발하지 않도록 `state.traitHooks`
//    를 따로 들고 `reapply` 로 다시 합친다. 같은 훅이 겹치면 `mergeHooks` 규칙으로 **합산**
//    한다(둘 중 하나가 조용히 사라지면 문구가 거짓말이 된다).
//  · 씬·Phaser 무의존(tools/sim.js 샌드박스에 오른다 — tools/hero-audit.js 가 본다).
//
//  ## 붙는 자리(통합자)
//    battle.js  — `this.state.boons = GAME.TowerBoon.hooksFor({ boons: [] });` 다음 줄에
//                 `if (GAME.Traits) GAME.Traits.attach(this.state, tc);`
//    orb.js     — `state.boons = GAME.TowerBoon.hooksFor({ boons: all });` 다음 줄에
//                 `if (GAME.Traits) GAME.Traits.reapply(state);`
// ============================================================================
GAME.Traits = (function () {

  //  단 하나의 값 = 세계 포인트 1. 3갈래×3단 = 영웅당 9 포인트(시즌 총 적립 15 + 협동).
  var COST = 1;

  //  갈래: { key, name, hook, why, tiers:[{ name, desc, arg }, ×3] }
  //  desc 는 상점 한 줄(폭 ~26자). 어휘는 세계관(순우리말·부족) 규율.
  var TREE = {
    vanguard: [
      { key: 'vg_rush', name: '사냥의 열기', hook: 'huntersRush',
        why: '몰아치는 손놀림 — 한 기를 끊고 바로 다음으로 붙는다',
        tiers: [
          { name: '열기 1', desc: '처치하면 2초간 이동 x1.15', arg: { ms: 2000, speedMul: 1.15 } },
          { name: '열기 2', desc: '처치하면 2.5초간 이동 x1.30', arg: { ms: 2500, speedMul: 1.30 } },
          { name: '열기 3', desc: '처치하면 3초간 이동 x1.45', arg: { ms: 3000, speedMul: 1.45 } }
        ] },
      { key: 'vg_last', name: '배수진', hook: 'lastStand',
        why: '물약을 언제 쓸지가 선택이 된다',
        tiers: [
          { name: '배수진 1', desc: '체력 30% 아래면 피해 +15%', arg: { below: 0.30, dmgMul: 1.15 } },
          { name: '배수진 2', desc: '체력 30% 아래면 피해 +28%', arg: { below: 0.30, dmgMul: 1.28 } },
          { name: '배수진 3', desc: '체력 35% 아래면 피해 +40%', arg: { below: 0.35, dmgMul: 1.40 } }
        ] },
      { key: 'vg_over', name: '과부하', hook: 'overload',
        why: '스킬→평타 순서를 지키게 만든다',
        tiers: [
          { name: '과부하 1', desc: '스킬 뒤 첫 평타 x1.3', arg: { mul: 1.3 } },
          { name: '과부하 2', desc: '스킬 뒤 첫 평타 x1.6', arg: { mul: 1.6 } },
          { name: '과부하 3', desc: '스킬 뒤 첫 평타 x2.0', arg: { mul: 2.0 } }
        ] }
    ],
    ranger: [
      { key: 'rg_phase', name: '스침', hook: 'phase',
        why: '멈춰 서서 쏘는 습관을 벌준다',
        tiers: [
          { name: '스침 1', desc: '이동 중 받는 피해 -6%', arg: { cut: 0.06 } },
          { name: '스침 2', desc: '이동 중 받는 피해 -12%', arg: { cut: 0.12 } },
          { name: '스침 3', desc: '이동 중 받는 피해 -18%', arg: { cut: 0.18 } }
        ] },
      { key: 'rg_mom', name: '탄력', hook: 'momentum',
        why: '처치를 몰아 스킬을 몰아쓰게 만든다',
        tiers: [
          { name: '탄력 1', desc: '처치마다 쿨타임 -0.3초', arg: { cutMs: 300 } },
          { name: '탄력 2', desc: '처치마다 쿨타임 -0.7초', arg: { cutMs: 700 } },
          { name: '탄력 3', desc: '처치마다 쿨타임 -1.2초', arg: { cutMs: 1200 } }
        ] },
      { key: 'rg_echo', name: '메아리', hook: 'echo',
        why: '적이 피한 자리에 두 번째가 온다',
        tiers: [
          { name: '메아리 1', desc: '스킬이 0.9초 뒤 25% 로 한 번 더', arg: { delay: 900, mul: 0.25 } },
          { name: '메아리 2', desc: '스킬이 0.8초 뒤 40% 로 한 번 더', arg: { delay: 800, mul: 0.40 } },
          { name: '메아리 3', desc: '스킬이 0.7초 뒤 50% 로 한 번 더', arg: { delay: 700, mul: 0.50 } }
        ] }
    ],
    warden: [
      { key: 'wd_rip', name: '반격', hook: 'riposte',
        why: '일부러 맞으러 들어가는 선택지를 준다',
        tiers: [
          { name: '반격 1', desc: '맞으면 주변 충격파 (1.4초에 한 번)', arg: { cd: 1400, radius: 80, dmgMul: 0.30 } },
          { name: '반격 2', desc: '맞으면 주변 충격파 (1.2초에 한 번)', arg: { cd: 1200, radius: 90, dmgMul: 0.45 } },
          { name: '반격 3', desc: '맞으면 주변 충격파 (1초에 한 번)', arg: { cd: 1000, radius: 96, dmgMul: 0.55 } }
        ] },
      { key: 'wd_siph', name: '흡수', hook: 'siphon',
        why: '물약 없이 계속 싸워 버티는 길',
        tiers: [
          { name: '흡수 1', desc: '처치마다 체력 3% 회복', arg: { frac: 0.03 } },
          { name: '흡수 2', desc: '처치마다 체력 5% 회복', arg: { frac: 0.05 } },
          { name: '흡수 3', desc: '처치마다 체력 8% 회복', arg: { frac: 0.08 } }
        ] },
      { key: 'wd_last', name: '배수진', hook: 'lastStand',
        why: '낮은 체력을 버티는 것이 곧 화력이 된다',
        tiers: [
          { name: '배수진 1', desc: '체력 35% 아래면 피해 +15%', arg: { below: 0.35, dmgMul: 1.15 } },
          { name: '배수진 2', desc: '체력 35% 아래면 피해 +28%', arg: { below: 0.35, dmgMul: 1.28 } },
          { name: '배수진 3', desc: '체력 35% 아래면 피해 +40%', arg: { below: 0.35, dmgMul: 1.40 } }
        ] }
    ],
    shaman: [
      //  메아리 — 토템 소환·저주·사슬 전부가 한 번 더 온다(소환은 두 번째 토템, 사슬은
      //  절반 위력). 주술사의 "설치·지원" 결을 가장 키우는 갈래다.
      { key: 'sh_echo', name: '영혼 메아리', hook: 'echo',
        why: '토템이 둘이 되고 사슬이 두 번 간다',
        tiers: [
          { name: '메아리 1', desc: '스킬이 0.9초 뒤 30% 로 한 번 더', arg: { delay: 900, mul: 0.30 } },
          { name: '메아리 2', desc: '스킬이 0.8초 뒤 40% 로 한 번 더', arg: { delay: 800, mul: 0.40 } },
          { name: '메아리 3', desc: '스킬이 0.7초 뒤 50% 로 한 번 더', arg: { delay: 700, mul: 0.50 } }
        ] },
      { key: 'sh_siph', name: '조상의 숨', hook: 'siphon',
        why: '얇은 몸을 처치로 채운다 — 토템 뒤에만 숨지 않게',
        tiers: [
          { name: '숨 1', desc: '처치마다 체력 3% 회복', arg: { frac: 0.03 } },
          { name: '숨 2', desc: '처치마다 체력 5% 회복', arg: { frac: 0.05 } },
          { name: '숨 3', desc: '처치마다 체력 8% 회복', arg: { frac: 0.08 } }
        ] },
      { key: 'sh_over', name: '저주의 무게', hook: 'overload',
        why: '저주를 찍은 뒤 한 발 — 표식 배수와 곱해진다',
        tiers: [
          { name: '무게 1', desc: '스킬 뒤 첫 평타 x1.4', arg: { mul: 1.4 } },
          { name: '무게 2', desc: '스킬 뒤 첫 평타 x1.7', arg: { mul: 1.7 } },
          { name: '무게 3', desc: '스킬 뒤 첫 평타 x2.0', arg: { mul: 2.0 } }
        ] }
    ],
    assassin: [
      { key: 'as_rush', name: '사냥의 열기', hook: 'huntersRush',
        why: '끊고 다음으로 — 암살자는 멈추면 죽는다',
        tiers: [
          { name: '열기 1', desc: '처치하면 2초간 이동 x1.20', arg: { ms: 2000, speedMul: 1.20 } },
          { name: '열기 2', desc: '처치하면 2.5초간 이동 x1.32', arg: { ms: 2500, speedMul: 1.32 } },
          { name: '열기 3', desc: '처치하면 3초간 이동 x1.45', arg: { ms: 3000, speedMul: 1.45 } }
        ] },
      { key: 'as_mom', name: '탄력', hook: 'momentum',
        why: '처치가 은신·점멸을 되돌려 준다',
        tiers: [
          { name: '탄력 1', desc: '처치마다 쿨타임 -0.4초', arg: { cutMs: 400 } },
          { name: '탄력 2', desc: '처치마다 쿨타임 -0.8초', arg: { cutMs: 800 } },
          { name: '탄력 3', desc: '처치마다 쿨타임 -1.2초', arg: { cutMs: 1200 } }
        ] },
      { key: 'as_phase', name: '그림자 스침', hook: 'phase',
        why: '움직이는 동안만 얇지 않다',
        tiers: [
          { name: '스침 1', desc: '이동 중 받는 피해 -8%', arg: { cut: 0.08 } },
          { name: '스침 2', desc: '이동 중 받는 피해 -13%', arg: { cut: 0.13 } },
          { name: '스침 3', desc: '이동 중 받는 피해 -18%', arg: { cut: 0.18 } }
        ] }
    ]
  };

  //  같은 훅이 두 곳(축복·구슬 + 특성)에서 오면 **합산**한다. 규칙은 훅마다 다르다 —
  //  "더 센 쪽" 이 자연스러운 값(배수·지속)은 max, 누적이 자연스러운 값(쿨감·회복·경감)은
  //  sum(상한 있음), 주기(cd·delay)는 min.
  var MERGE = {
    huntersRush: function (a, b) { return { ms: Math.max(a.ms || 0, b.ms || 0), speedMul: Math.max(a.speedMul || 1, b.speedMul || 1) }; },
    momentum:    function (a, b) { return { cutMs: (a.cutMs || 0) + (b.cutMs || 0) }; },
    riposte:     function (a, b) { return { cd: Math.min(a.cd || 1000, b.cd || 1000), radius: Math.max(a.radius || 0, b.radius || 0), dmgMul: Math.max(a.dmgMul || 0, b.dmgMul || 0) }; },
    lastStand:   function (a, b) { return { below: Math.max(a.below || 0, b.below || 0), dmgMul: Math.max(a.dmgMul || 1, b.dmgMul || 1) }; },
    overload:    function (a, b) { return { mul: Math.max(a.mul || 1, b.mul || 1) }; },
    siphon:      function (a, b) { return { frac: Math.min(0.20, (a.frac || 0) + (b.frac || 0)) }; },
    phase:       function (a, b) { return { cut: Math.min(0.40, (a.cut || 0) + (b.cut || 0)) }; },
    echo:        function (a, b) { return { delay: Math.min(a.delay || 700, b.delay || 700), mul: Math.max(a.mul || 0, b.mul || 0) }; }
  };

  function branches(heroKey) { return TREE[heroKey] || []; }
  function branch(heroKey, key) {
    var list = branches(heroKey);
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
    return null;
  }
  function recOf(rec) {
    if (rec) return rec;
    return (GAME.TowerChar && GAME.TowerChar.exists && GAME.TowerChar.exists()) ? GAME.TowerChar.get() : null;
  }

  return {
    COST: COST,
    TREE: TREE,
    MAX_TIER: 3,
    branches: branches,
    branch: branch,

    //  { 갈래키: 단(0~3) } — 없으면 빈 객체.
    owned: function (rec) {
      rec = recOf(rec);
      return (rec && rec.traits) || {};
    },
    tierOf: function (key, rec) {
      var t = this.owned(rec)[key];
      return (typeof t === 'number' && t > 0) ? Math.min(this.MAX_TIER, t) : 0;
    },
    //  다음 단(1~3) 또는 0(다 배움).
    nextTier: function (heroKey, key, rec) {
      var b = branch(heroKey, key);
      if (!b) return 0;
      var t = this.tierOf(key, rec);
      return t >= b.tiers.length ? 0 : t + 1;
    },
    points: function () {
      return (GAME.Season && GAME.Season.worldPoints) ? GAME.Season.worldPoints() : 0;
    },
    canBuy: function (heroKey, key, rec) {
      return this.nextTier(heroKey, key, rec) > 0 && this.points() >= COST;
    },
    //  한 단 배운다 — 세계 포인트를 먼저 차감하고(실패면 아무것도 안 바꾼다) TowerChar 에 적는다.
    //  반환: 새 단(1~3) 또는 0(실패).
    buy: function (key) {
      var rec = recOf(null);
      if (!rec || !GAME.TowerChar || !GAME.TowerChar.setTrait) return 0;
      var nt = this.nextTier(rec.heroKey, key, rec);
      if (!nt) return 0;
      if (!GAME.Season || !GAME.Season.spendWorldPoint || !GAME.Season.spendWorldPoint(COST)) return 0;
      GAME.TowerChar.setTrait(key, nt);
      return nt;
    },

    //  전투가 읽을 훅 묶음(축복과 같은 꼴). 갈래마다 **가장 높은 단**의 arg 하나. 없으면 null.
    hooksFor: function (rec) {
      rec = recOf(rec);
      if (!rec || !rec.traits) return null;
      var list = branches(rec.heroKey), h = null;
      for (var i = 0; i < list.length; i++) {
        var b = list[i], t = this.tierOf(b.key, rec);
        if (!t) continue;
        var tier = b.tiers[t - 1];
        if (!tier) continue;
        h = h || {};
        var arg = {};
        for (var k in tier.arg) arg[k] = tier.arg[k];
        h[b.hook] = (h[b.hook] && MERGE[b.hook]) ? MERGE[b.hook](h[b.hook], arg) : arg;
      }
      return h;
    },

    //  두 훅 묶음을 합친다. 둘 다 null 이면 null.
    mergeHooks: function (base, extra) {
      if (!extra) return base || null;
      if (!base) { var c = {}; for (var k0 in extra) c[k0] = extra[k0]; return c; }
      var out = {}, k;
      for (k in base) out[k] = base[k];
      for (k in extra) {
        if (out[k] && MERGE[k] && typeof out[k] === 'object' && typeof extra[k] === 'object') {
          out[k] = MERGE[k](out[k], extra[k]);
        } else if (out[k] === undefined) {
          out[k] = extra[k];
        }
      }
      return out;
    },

    //  판 시작 — state.traitHooks 를 세우고 state.boons 에 합친다(축복·구슬과 같은 통로).
    attach: function (state, rec) {
      if (!state) return null;
      state.traitHooks = this.hooksFor(rec);
      state.boons = this.mergeHooks(state.boons, state.traitHooks);
      return state.boons;
    },
    //  구슬을 주워 state.boons 가 다시 만들어진 뒤 — 특성을 다시 합친다.
    reapply: function (state) {
      if (!state || !state.traitHooks) return state && state.boons;
      state.boons = this.mergeHooks(state.boons, state.traitHooks);
      return state.boons;
    },

    //  상점 한 줄 — '✦ 영혼 메아리 2' 같은 요약(허브·전투 배지용).
    summary: function (rec) {
      rec = recOf(rec);
      if (!rec) return '';
      var list = branches(rec.heroKey), parts = [];
      for (var i = 0; i < list.length; i++) {
        var t = this.tierOf(list[i].key, rec);
        if (t) parts.push(list[i].tiers[t - 1].name);
      }
      return parts.join(' · ');
    }
  };
})();
