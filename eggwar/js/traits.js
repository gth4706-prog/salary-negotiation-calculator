window.GAME = window.GAME || {};

// ============================================================================
//  특성 트리 (시즌2 「다섯 세계」 · S-H, 2026-09-03 → **6갈래 확장** 2026-09-03 2차)
//
//  ## 무엇인가
//  영웅마다 **6갈래(공격 2 · 방어 2 · 유틸 2) × 4단**. 화폐는 **세계 포인트**
//  (js/season.js — 세계 진입·보스 처치·협동 승으로만 번다). 단은 순서대로만
//  배운다(1→2→3→4)에 더해, **4단(캡스톤)은 같은 갈래(concept)의 다른 갈래가
//  1단 이상이어야 배울 수 있다** — "나뭇가지" 게이트. 먼저 넓힌 뒤에야 끝까지
//  깊어진다. 단별 비용은 escalate(1·2·4·7) — 갈래 하나 풀 비용 14, 영웅 하나
//  전부 84. 영구 캐릭터(TowerChar)에 `rec.traits = { 갈래키: 단 }` 로 저장되고,
//  캐릭터를 지우면 같이 사라진다.
//
//  ## 규율 — 축복(js/towerboon.js)과 **같은 문법, 같은 훅**
//  · **행동 훅만** 쓴다. "공격력 +10" 은 레벨업(STATS)의 일이다(towerboon.js 의 표).
//  · 훅 이름은 `combat.js` 가 아는 8개(huntersRush · momentum · riposte · lastStand ·
//    overload · siphon · phase · echo)에 더해, **combat.js 를 안 건드린 채** 붙는
//    유틸 훅 둘(haste · goldFind — 각각 battle.js/towerchar.js 한 곳에서만 읽는다).
//    단(tier)이 오르면 **인자(arg)** 가 세진다.
//  · **공격 풀**(huntersRush·overload·momentum·echo) · **방어 풀**(riposte·lastStand·
//    siphon·phase)에서 영웅마다 2개씩 고른다. 유틸 둘(haste·goldFind)은 **모든
//    영웅 공통 메커니즘**이고 이름·설명 문구만 영웅 색으로 다르다.
//  · `state.boons` 한 통로로 전투에 들어간다(축복·구슬과 같은 자리) — **haste 는
//    예외**다(아래 참조). 구슬을 주워 `state.boons` 가 통째로 다시 만들어질 때
//    특성이 증발하지 않도록 `state.traitHooks` 를 따로 들고 `reapply` 로 다시
//    합친다. 같은 훅이 겹치면 `mergeHooks` 규칙으로 **합산**한다(둘 중 하나가
//    조용히 사라지면 문구가 거짓말이 된다).
//  · 씬·Phaser 무의존(tools/sim.js 샌드박스에 오른다 — tools/hero-audit.js 가 본다).
//
//  ## 붙는 자리(통합자)
//    battle.js  — `this.state.boons = GAME.TowerBoon.hooksFor({ boons: [] });` 다음 줄에
//                 `if (GAME.Traits) GAME.Traits.attach(this.state, tc);` 다음 줄에
//                 `haste` 훅을 `this.hero.speed`/`this.hero.cdrMul` 에 직접 곱한다
//                 (combat.js 는 이 훅을 모른다 — 렌더·속도 계층 한정, opt-in).
//    orb.js     — `state.boons = GAME.TowerBoon.hooksFor({ boons: all });` 다음 줄에
//                 `if (GAME.Traits) GAME.Traits.reapply(state);`
//    towerchar.js — `luckGoldMul(rec)` 안에서 `goldFind` 훅 배수를 곱한다.
// ============================================================================
GAME.Traits = (function () {

  //  단별 비용 escalate — 1단 1 · 2단 2 · 3단 4 · 4단 7. 갈래 하나 풀 비용 14,
  //  영웅 하나 전부(6갈래) 84. index 0 = 1단.
  var COST_BY_TIER = [1, 2, 4, 7];
  var MAX_TIER = COST_BY_TIER.length;

  //  갈래: { key, name, hook, concept, why, tiers:[{ name, desc, arg }, ×4] }
  //  concept 은 'attack' | 'defense' | 'utility' — UI 그룹핑·색 구분에 쓴다.
  //  desc 는 상점 한 줄(폭 ~26자). 어휘는 세계관(순우리말·부족) 규율.
  //
  //  유틸 두 갈래(haste·goldFind)의 **단별 arg 는 전 영웅 공통**이다(같은 메커니즘) —
  //  이름·why·tier 이름만 영웅 색으로 바뀐다.
  var HASTE_TIERS = [
    { name: '재촉 1', desc: '이동 x1.03 · 쿨감 3%', arg: { speedMul: 1.03, cdrMul: 0.97 } },
    { name: '재촉 2', desc: '이동 x1.05 · 쿨감 6%', arg: { speedMul: 1.05, cdrMul: 0.94 } },
    { name: '재촉 3', desc: '이동 x1.07 · 쿨감 9%', arg: { speedMul: 1.07, cdrMul: 0.91 } },
    { name: '재촉 4', desc: '이동 x1.10 · 쿨감 12%', arg: { speedMul: 1.10, cdrMul: 0.88 } }
  ];
  var GOLD_TIERS = [
    { name: '감각 1', desc: '골드 획득 +6%', arg: { mul: 1.06 } },
    { name: '감각 2', desc: '골드 획득 +12%', arg: { mul: 1.12 } },
    { name: '감각 3', desc: '골드 획득 +19%', arg: { mul: 1.19 } },
    { name: '감각 4', desc: '골드 획득 +28%', arg: { mul: 1.28 } }
  ];

  var TREE = {
    vanguard: [
      // ── 공격 ──
      { key: 'vg_rush', name: '사냥의 열기', hook: 'huntersRush', concept: 'attack',
        why: '몰아치는 손놀림 — 한 기를 끊고 바로 다음으로 붙는다',
        tiers: [
          { name: '열기 1', desc: '처치하면 2초간 이동 x1.15', arg: { ms: 2000, speedMul: 1.15 } },
          { name: '열기 2', desc: '처치하면 2.5초간 이동 x1.30', arg: { ms: 2500, speedMul: 1.30 } },
          { name: '열기 3', desc: '처치하면 3초간 이동 x1.45', arg: { ms: 3000, speedMul: 1.45 } },
          { name: '열기 4', desc: '처치하면 3.5초간 이동 x1.60', arg: { ms: 3500, speedMul: 1.60 } }
        ] },
      { key: 'vg_over', name: '과부하', hook: 'overload', concept: 'attack',
        why: '스킬→평타 순서를 지키게 만든다',
        tiers: [
          { name: '과부하 1', desc: '스킬 뒤 첫 평타 x1.3', arg: { mul: 1.3 } },
          { name: '과부하 2', desc: '스킬 뒤 첫 평타 x1.6', arg: { mul: 1.6 } },
          { name: '과부하 3', desc: '스킬 뒤 첫 평타 x2.0', arg: { mul: 2.0 } },
          { name: '과부하 4', desc: '스킬 뒤 첫 평타 x2.5', arg: { mul: 2.5 } }
        ] },
      // ── 방어 ──
      { key: 'vg_last', name: '배수진', hook: 'lastStand', concept: 'defense',
        why: '물약을 언제 쓸지가 선택이 된다',
        tiers: [
          { name: '배수진 1', desc: '체력 30% 아래면 피해 +15%', arg: { below: 0.30, dmgMul: 1.15 } },
          { name: '배수진 2', desc: '체력 30% 아래면 피해 +28%', arg: { below: 0.30, dmgMul: 1.28 } },
          { name: '배수진 3', desc: '체력 35% 아래면 피해 +40%', arg: { below: 0.35, dmgMul: 1.40 } },
          { name: '배수진 4', desc: '체력 35% 아래면 피해 +52%', arg: { below: 0.35, dmgMul: 1.52 } }
        ] },
      { key: 'vg_rip', name: '맞부딪힘', hook: 'riposte', concept: 'defense',
        why: '물러서지 않는 돌격형이 맞고도 되받아친다',
        tiers: [
          { name: '맞부딪힘 1', desc: '맞으면 주변 충격파 (1.5초)', arg: { cd: 1500, radius: 76, dmgMul: 0.25 } },
          { name: '맞부딪힘 2', desc: '맞으면 주변 충격파 (1.25초)', arg: { cd: 1250, radius: 86, dmgMul: 0.38 } },
          { name: '맞부딪힘 3', desc: '맞으면 주변 충격파 (1.05초)', arg: { cd: 1050, radius: 92, dmgMul: 0.50 } },
          { name: '맞부딪힘 4', desc: '맞으면 주변 충격파 (0.9초)', arg: { cd: 900, radius: 98, dmgMul: 0.60 } }
        ] },
      // ── 유틸(공통 메커니즘, 문구만 영웅 색) ──
      { key: 'vg_haste', name: '전장의 재촉', hook: 'haste', concept: 'utility',
        why: '무거운 대검도 빠른 손에 실린다', tiers: HASTE_TIERS },
      { key: 'vg_gold', name: '전리품의 눈', hook: 'goldFind', concept: 'utility',
        why: '적을 쓰러뜨릴수록 손에 남는 것도 많아진다', tiers: GOLD_TIERS }
    ],
    ranger: [
      // ── 공격 ──
      { key: 'rg_mom', name: '탄력', hook: 'momentum', concept: 'attack',
        why: '처치를 몰아 스킬을 몰아쓰게 만든다',
        tiers: [
          { name: '탄력 1', desc: '처치마다 쿨타임 -0.3초', arg: { cutMs: 300 } },
          { name: '탄력 2', desc: '처치마다 쿨타임 -0.7초', arg: { cutMs: 700 } },
          { name: '탄력 3', desc: '처치마다 쿨타임 -1.2초', arg: { cutMs: 1200 } },
          { name: '탄력 4', desc: '처치마다 쿨타임 -1.8초', arg: { cutMs: 1800 } }
        ] },
      { key: 'rg_echo', name: '메아리', hook: 'echo', concept: 'attack',
        why: '적이 피한 자리에 두 번째가 온다',
        tiers: [
          { name: '메아리 1', desc: '스킬이 0.9초 뒤 25% 로 한 번 더', arg: { delay: 900, mul: 0.25 } },
          { name: '메아리 2', desc: '스킬이 0.8초 뒤 40% 로 한 번 더', arg: { delay: 800, mul: 0.40 } },
          { name: '메아리 3', desc: '스킬이 0.7초 뒤 50% 로 한 번 더', arg: { delay: 700, mul: 0.50 } },
          { name: '메아리 4', desc: '스킬이 0.62초 뒤 58% 로 한 번 더', arg: { delay: 620, mul: 0.58 } }
        ] },
      // ── 방어 ──
      { key: 'rg_phase', name: '스침', hook: 'phase', concept: 'defense',
        why: '멈춰 서서 쏘는 습관을 벌준다',
        tiers: [
          { name: '스침 1', desc: '이동 중 받는 피해 -6%', arg: { cut: 0.06 } },
          { name: '스침 2', desc: '이동 중 받는 피해 -12%', arg: { cut: 0.12 } },
          { name: '스침 3', desc: '이동 중 받는 피해 -18%', arg: { cut: 0.18 } },
          { name: '스침 4', desc: '이동 중 받는 피해 -24%', arg: { cut: 0.24 } }
        ] },
      { key: 'rg_siph', name: '사냥한 피', hook: 'siphon', concept: 'defense',
        why: '화살통이 비어도 처치가 물약이 된다',
        tiers: [
          { name: '사냥 1', desc: '처치마다 체력 2% 회복', arg: { frac: 0.02 } },
          { name: '사냥 2', desc: '처치마다 체력 4% 회복', arg: { frac: 0.04 } },
          { name: '사냥 3', desc: '처치마다 체력 6% 회복', arg: { frac: 0.06 } },
          { name: '사냥 4', desc: '처치마다 체력 9% 회복', arg: { frac: 0.09 } }
        ] },
      // ── 유틸 ──
      { key: 'rg_haste', name: '바람의 재촉', hook: 'haste', concept: 'utility',
        why: '가벼운 발이 사거리보다 먼저 산다', tiers: HASTE_TIERS },
      { key: 'rg_gold', name: '사냥꾼의 셈', hook: 'goldFind', concept: 'utility',
        why: '사냥감의 값어치를 놓치지 않는다', tiers: GOLD_TIERS }
    ],
    warden: [
      // ── 공격 ──
      { key: 'wd_over', name: '무게의 일격', hook: 'overload', concept: 'attack',
        why: '묵직한 방패로 막은 뒤 첫 타격이 짓누른다',
        tiers: [
          { name: '일격 1', desc: '스킬 뒤 첫 평타 x1.2', arg: { mul: 1.2 } },
          { name: '일격 2', desc: '스킬 뒤 첫 평타 x1.4', arg: { mul: 1.4 } },
          { name: '일격 3', desc: '스킬 뒤 첫 평타 x1.65', arg: { mul: 1.65 } },
          { name: '일격 4', desc: '스킬 뒤 첫 평타 x2.0', arg: { mul: 2.0 } }
        ] },
      { key: 'wd_mom', name: '전선의 탄력', hook: 'momentum', concept: 'attack',
        why: '버텨낸 자리에서 처치가 다음 스킬을 당긴다',
        tiers: [
          { name: '탄력 1', desc: '처치마다 쿨타임 -0.25초', arg: { cutMs: 250 } },
          { name: '탄력 2', desc: '처치마다 쿨타임 -0.55초', arg: { cutMs: 550 } },
          { name: '탄력 3', desc: '처치마다 쿨타임 -0.9초', arg: { cutMs: 900 } },
          { name: '탄력 4', desc: '처치마다 쿨타임 -1.3초', arg: { cutMs: 1300 } }
        ] },
      // ── 방어 ──
      { key: 'wd_rip', name: '반격', hook: 'riposte', concept: 'defense',
        why: '맞고 서 있는 것이 이 영웅의 방식이다',
        tiers: [
          { name: '반격 1', desc: '맞으면 주변 충격파 (1.4초에 한 번)', arg: { cd: 1400, radius: 80, dmgMul: 0.30 } },
          { name: '반격 2', desc: '맞으면 주변 충격파 (1.2초에 한 번)', arg: { cd: 1200, radius: 90, dmgMul: 0.45 } },
          { name: '반격 3', desc: '맞으면 주변 충격파 (1초에 한 번)', arg: { cd: 1000, radius: 96, dmgMul: 0.55 } },
          { name: '반격 4', desc: '맞으면 주변 충격파 (0.88초에 한 번)', arg: { cd: 880, radius: 100, dmgMul: 0.62 } }
        ] },
      { key: 'wd_siph', name: '흡수', hook: 'siphon', concept: 'defense',
        why: '물약 없이 계속 싸워 버티는 길',
        tiers: [
          { name: '흡수 1', desc: '처치마다 체력 3% 회복', arg: { frac: 0.03 } },
          { name: '흡수 2', desc: '처치마다 체력 5% 회복', arg: { frac: 0.05 } },
          { name: '흡수 3', desc: '처치마다 체력 8% 회복', arg: { frac: 0.08 } },
          { name: '흡수 4', desc: '처치마다 체력 11% 회복', arg: { frac: 0.11 } }
        ] },
      // ── 유틸 ──
      { key: 'wd_haste', name: '방벽의 재촉', hook: 'haste', concept: 'utility',
        why: '두꺼운 갑주도 재촉 앞에선 가벼워진다', tiers: HASTE_TIERS },
      { key: 'wd_gold', name: '수비대의 몫', hook: 'goldFind', concept: 'utility',
        why: '긴 싸움을 버틴 값을 골드로 챙긴다', tiers: GOLD_TIERS }
    ],
    shaman: [
      // ── 공격 ──
      //  메아리 — 토템 소환·저주·사슬 전부가 한 번 더 온다(소환은 두 번째 토템, 사슬은
      //  절반 위력). 주술사의 "설치·지원" 결을 가장 키우는 갈래다.
      { key: 'sh_echo', name: '영혼 메아리', hook: 'echo', concept: 'attack',
        why: '토템이 둘이 되고 사슬이 두 번 간다',
        tiers: [
          { name: '메아리 1', desc: '스킬이 0.9초 뒤 30% 로 한 번 더', arg: { delay: 900, mul: 0.30 } },
          { name: '메아리 2', desc: '스킬이 0.8초 뒤 40% 로 한 번 더', arg: { delay: 800, mul: 0.40 } },
          { name: '메아리 3', desc: '스킬이 0.7초 뒤 50% 로 한 번 더', arg: { delay: 700, mul: 0.50 } },
          { name: '메아리 4', desc: '스킬이 0.62초 뒤 58% 로 한 번 더', arg: { delay: 620, mul: 0.58 } }
        ] },
      { key: 'sh_over', name: '저주의 무게', hook: 'overload', concept: 'attack',
        why: '저주를 찍은 뒤 한 발 — 표식 배수와 곱해진다',
        tiers: [
          { name: '무게 1', desc: '스킬 뒤 첫 평타 x1.4', arg: { mul: 1.4 } },
          { name: '무게 2', desc: '스킬 뒤 첫 평타 x1.7', arg: { mul: 1.7 } },
          { name: '무게 3', desc: '스킬 뒤 첫 평타 x2.0', arg: { mul: 2.0 } },
          { name: '무게 4', desc: '스킬 뒤 첫 평타 x2.35', arg: { mul: 2.35 } }
        ] },
      // ── 방어 ──
      { key: 'sh_siph', name: '조상의 숨', hook: 'siphon', concept: 'defense',
        why: '얇은 몸을 처치로 채운다 — 토템 뒤에만 숨지 않게',
        tiers: [
          { name: '숨 1', desc: '처치마다 체력 3% 회복', arg: { frac: 0.03 } },
          { name: '숨 2', desc: '처치마다 체력 5% 회복', arg: { frac: 0.05 } },
          { name: '숨 3', desc: '처치마다 체력 8% 회복', arg: { frac: 0.08 } },
          { name: '숨 4', desc: '처치마다 체력 11% 회복', arg: { frac: 0.11 } }
        ] },
      { key: 'sh_last', name: '위태로운 주술', hook: 'lastStand', concept: 'defense',
        why: '궁지에 몰릴수록 저주가 짙어진다',
        tiers: [
          { name: '주술 1', desc: '체력 30% 아래면 피해 +12%', arg: { below: 0.30, dmgMul: 1.12 } },
          { name: '주술 2', desc: '체력 30% 아래면 피해 +24%', arg: { below: 0.30, dmgMul: 1.24 } },
          { name: '주술 3', desc: '체력 35% 아래면 피해 +38%', arg: { below: 0.35, dmgMul: 1.38 } },
          { name: '주술 4', desc: '체력 35% 아래면 피해 +50%', arg: { below: 0.35, dmgMul: 1.50 } }
        ] },
      // ── 유틸 ──
      { key: 'sh_haste', name: '영혼의 재촉', hook: 'haste', concept: 'utility',
        why: '토템을 옮기는 발이 빨라진다', tiers: HASTE_TIERS },
      { key: 'sh_gold', name: '영혼의 셈', hook: 'goldFind', concept: 'utility',
        why: '거둬들인 영혼이 골드로도 돌아온다', tiers: GOLD_TIERS }
    ],
    assassin: [
      // ── 공격 ──
      { key: 'as_rush', name: '사냥의 열기', hook: 'huntersRush', concept: 'attack',
        why: '끊고 다음으로 — 암살자는 멈추면 죽는다',
        tiers: [
          { name: '열기 1', desc: '처치하면 2초간 이동 x1.20', arg: { ms: 2000, speedMul: 1.20 } },
          { name: '열기 2', desc: '처치하면 2.5초간 이동 x1.32', arg: { ms: 2500, speedMul: 1.32 } },
          { name: '열기 3', desc: '처치하면 3초간 이동 x1.45', arg: { ms: 3000, speedMul: 1.45 } },
          { name: '열기 4', desc: '처치하면 3.5초간 이동 x1.57', arg: { ms: 3500, speedMul: 1.57 } }
        ] },
      { key: 'as_mom', name: '탄력', hook: 'momentum', concept: 'attack',
        why: '처치가 은신·점멸을 되돌려 준다',
        tiers: [
          { name: '탄력 1', desc: '처치마다 쿨타임 -0.4초', arg: { cutMs: 400 } },
          { name: '탄력 2', desc: '처치마다 쿨타임 -0.8초', arg: { cutMs: 800 } },
          { name: '탄력 3', desc: '처치마다 쿨타임 -1.2초', arg: { cutMs: 1200 } },
          { name: '탄력 4', desc: '처치마다 쿨타임 -1.7초', arg: { cutMs: 1700 } }
        ] },
      // ── 방어 ──
      { key: 'as_phase', name: '그림자 스침', hook: 'phase', concept: 'defense',
        why: '움직이는 동안만 얇지 않다',
        tiers: [
          { name: '스침 1', desc: '이동 중 받는 피해 -8%', arg: { cut: 0.08 } },
          { name: '스침 2', desc: '이동 중 받는 피해 -13%', arg: { cut: 0.13 } },
          { name: '스침 3', desc: '이동 중 받는 피해 -18%', arg: { cut: 0.18 } },
          { name: '스침 4', desc: '이동 중 받는 피해 -23%', arg: { cut: 0.23 } }
        ] },
      { key: 'as_last', name: '궁지의 칼날', hook: 'lastStand', concept: 'defense',
        why: '궁지에 몰린 자객이 가장 위험하다',
        tiers: [
          { name: '칼날 1', desc: '체력 30% 아래면 피해 +20%', arg: { below: 0.30, dmgMul: 1.20 } },
          { name: '칼날 2', desc: '체력 30% 아래면 피해 +35%', arg: { below: 0.30, dmgMul: 1.35 } },
          { name: '칼날 3', desc: '체력 35% 아래면 피해 +50%', arg: { below: 0.35, dmgMul: 1.50 } },
          { name: '칼날 4', desc: '체력 35% 아래면 피해 +65%', arg: { below: 0.35, dmgMul: 1.65 } }
        ] },
      // ── 유틸 ──
      { key: 'as_haste', name: '그림자의 재촉', hook: 'haste', concept: 'utility',
        why: '그림자는 원래도 빠르지만 더 빨라질 수 있다', tiers: HASTE_TIERS },
      { key: 'as_gold', name: '그림자 금고', hook: 'goldFind', concept: 'utility',
        why: '표적의 주머니까지 훑고 지나간다', tiers: GOLD_TIERS }
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
    echo:        function (a, b) { return { delay: Math.min(a.delay || 700, b.delay || 700), mul: Math.max(a.mul || 0, b.mul || 0) }; },
    //  유틸 신설 — battle.js/towerchar.js 가 각자 한 곳에서 `hooksFor(...).haste`/
    //  `.goldFind` 를 직접 읽으므로, 여기 있는 규칙은 오직 **같은 훅이 두 갈래 이상에서
    //  겹칠 때**(이 게임에선 안 생긴다 — 영웅당 haste/goldFind 는 하나씩)와, 장차 축복·
    //  구슬 쪽에 같은 이름이 생길 경우를 위한 안전망이다.
    haste:       function (a, b) { return { speedMul: Math.max(a.speedMul || 1, b.speedMul || 1), cdrMul: Math.min(a.cdrMul || 1, b.cdrMul || 1) }; },
    goldFind:    function (a, b) { return { mul: Math.max(a.mul || 1, b.mul || 1) }; }
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
  //  같은 영웅·같은 concept 의 **다른** 갈래들(형제 갈래) — 4단 게이트가 본다.
  function siblings(heroKey, key) {
    var b = branch(heroKey, key);
    if (!b) return [];
    var list = branches(heroKey);
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].key === key) continue;
      if (list[i].concept === b.concept) out.push(list[i]);
    }
    return out;
  }

  var api = {
    COST_BY_TIER: COST_BY_TIER,
    TREE: TREE,
    MAX_TIER: MAX_TIER,
    branches: branches,
    branch: branch,
    siblings: siblings,

    //  단(tier) 하나를 배우는 비용 — 1단 1 · 2단 2 · 3단 4 · 4단 7.
    costOf: function (tier) {
      var i = Math.max(1, Math.min(MAX_TIER, tier || 1)) - 1;
      return COST_BY_TIER[i];
    },

    //  { 갈래키: 단(0~4) } — 없으면 빈 객체.
    owned: function (rec) {
      rec = recOf(rec);
      return (rec && rec.traits) || {};
    },
    tierOf: function (key, rec) {
      var t = this.owned(rec)[key];
      return (typeof t === 'number' && t > 0) ? Math.min(this.MAX_TIER, t) : 0;
    },
    //  다음 단(1~4) 또는 0(다 배움). **게이트와 무관하게** "순서상 다음 단"만 답한다 —
    //  게이트 판정은 gateOpen 이 따로 한다(UI 가 "잠김 이유"를 구별해서 보여줄 수 있게).
    nextTier: function (heroKey, key, rec) {
      var b = branch(heroKey, key);
      if (!b) return 0;
      var t = this.tierOf(key, rec);
      return t >= b.tiers.length ? 0 : t + 1;
    },
    //  4단(캡스톤) 게이트 — 같은 concept 의 **다른** 갈래가 1단 이상이어야 열린다.
    //  1~3단은 항상 true(순서대로만 배우면 되므로 nextTier 자체가 그 제약이다).
    gateOpen: function (heroKey, key, nt, rec) {
      if (nt !== 4) return true;
      var sibs = siblings(heroKey, key);
      if (!sibs.length) return true;   // 형제가 없는 concept 이면 게이트 없음
      for (var i = 0; i < sibs.length; i++) {
        if (this.tierOf(sibs[i].key, rec) >= 1) return true;
      }
      return false;
    },
    //  게이트가 막혀 있을 때 UI 문구용 — 열려 있으면 null.
    gateReason: function (heroKey, key, rec) {
      var nt = this.nextTier(heroKey, key, rec);
      if (nt !== 4) return null;
      if (this.gateOpen(heroKey, key, nt, rec)) return null;
      var sibs = siblings(heroKey, key);
      var names = sibs.map(function (s) { return s.name; }).join(' · ');
      //  조사(을/를)는 GAME.UI.fillName 이 있으면 그걸로 정확히 맞춘다 — 없으면(헤드리스
      //  샌드박스, ui-hud.js 미로드) '을(를)' 로 둘 다 적어 안전하게 낮춘다.
      if (GAME.UI && GAME.UI.fillName) return GAME.UI.fillName('먼저 {n}{를} 1단 이상 배우세요', names);
      return '먼저 ' + names + ' 을(를) 1단 이상 배우세요';
    },
    points: function () {
      return (GAME.Season && GAME.Season.worldPoints) ? GAME.Season.worldPoints() : 0;
    },
    canBuy: function (heroKey, key, rec) {
      var nt = this.nextTier(heroKey, key, rec);
      if (!nt) return false;
      if (!this.gateOpen(heroKey, key, nt, rec)) return false;
      return this.points() >= this.costOf(nt);
    },
    //  한 단 배운다 — 세계 포인트를 먼저 차감하고(실패면 아무것도 안 바꾼다) TowerChar 에 적는다.
    //  반환: 새 단(1~4) 또는 0(실패).
    buy: function (key) {
      var rec = recOf(null);
      if (!rec || !GAME.TowerChar || !GAME.TowerChar.setTrait) return 0;
      var nt = this.nextTier(rec.heroKey, key, rec);
      if (!nt) return 0;
      if (!this.gateOpen(rec.heroKey, key, nt, rec)) return 0;
      var cost = this.costOf(nt);
      if (!GAME.Season || !GAME.Season.spendWorldPoint || !GAME.Season.spendWorldPoint(cost)) return 0;
      GAME.TowerChar.setTrait(key, nt);
      return nt;
    },

    //  전투가 읽을 훅 묶음(축복과 같은 꼴). 갈래마다 **가장 높은 단**의 arg 하나. 없으면 null.
    //  ⚠ haste 는 combat.js 가 모르는 훅이다 — battle.js 가 이 반환값에서 `.haste` 만
    //    따로 읽어 hero.speed/cdrMul 에 직접 곱한다(state.boons 에도 얹히긴 하지만
    //    combat.js 쪽에서는 아무도 안 읽으므로 무해하다).
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
  //  하위호환 — 옛 코드가 `T.COST`(단마다 1)를 참조하면 1단 비용을 준다.
  api.COST = COST_BY_TIER[0];
  return api;
})();
