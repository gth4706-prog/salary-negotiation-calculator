window.GAME = window.GAME || {};

// 세계관: Egg War — 계란 캐릭터들의 원시 부족 전쟁. 고증보다 패러디, 12세 이용가 톤.
// 몸통은 전부 달걀이라 **종류 구분은 든 무기와 방어구(실루엣)가 전담한다.**
// art 값은 js/ui.js 의 아트 시스템 키다 (색이 아니라 형태로 구분하기 위한 것).
//
// attack: melee / projectile / aoe = 논타겟(회피 가능), targeted = 자동명중(회피 불가),
//         none = 공격하지 않는 지원 유닛
// armor: 비율 경감 — 100/(100+armor) 만큼만 피해가 들어간다.
//   정액 차감으로 하면 방어력 높은 대상에게 약한 공격 다수(=물량)가 무력화되어
//   '물량' 이라는 전략 축 자체가 죽는다. 그래서 비율 방식을 쓴다.
// chase/aggro: 배치를 깨고 쫓아나갈 수 있는 거리와 반응 범위. chase 0 이면 고정이다.
// spacing: **같은 진영 원거리끼리 유지하는 최소 간격**(거리 스탯 — Combat.DIST_KEYS 에 등록됨).
//   근접에는 넣지 않는다. 근접은 뭉쳐서 벽이 되는 게 일이고, 흩어지면 벽에 구멍이 난다.
//   원거리는 반대로 뭉치면 광역 한 방에 몰살당한다. 값은 radius 기반(약 3.4배)으로 잡았다 —
//   겹침 한계(반지름 합 ≈ 2×radius)보다 확실히 크되, 진형이 흩어질 만큼 크지는 않게.
//   고정물(쇠뇌 진지·둥지 포탑)에는 넣지 않는다. 움직일 수 없어 간격을 만들 수 없다.
GAME.UNITS = {
  bayonet: {
    key: 'bayonet', name: '전사', art: 'warrior',
lore: '부족의 앞줄에 서기로 한 알. 뒤에 선 동료가 활을 당길 시간을 대신 벌어 준다.',
    desc: '청동 단검과 나무 방패. 싸고 튼튼한 벽.',
    // 2026-07-31 · **공격력 버프** (사용자 지시 5번). damage 28→38 (dps 35.0→47.5).
    //   전사는 가장 싸고 가장 많이 깔리는 유닛이라 **진형 전체의 화력 밀도를 사실상 이 값이**
    //   정한다. 컨트롤러가 너무 쉽게 뚫는다는 신고에 대한 가장 직접적인 손잡이다.
    //   체력·방어는 안 올린다 — 더 단단해지면 '오래 걸리는 판'이 되지 '위험한 판'이 안 된다.
    cost: 10, pop: 1, hp: 240, armor: 30, speed: 135, range: 52, damage: 35, cooldown: 800,
    attack: 'melee', coneDeg: 90, radius: 13, shape: 'square', weapon: 'bayonet',
    chase: 270, aggro: 210,
    // 달려들기 — 가장 흔한 유닛이라 **압박의 밀도를 정하는 건 사실상 이 값이다.**
    // 속도 135 로는 사냥꾼(178)을 못 잡아 그냥 뒤를 따라다니는 배경이었다.
    // 쿨 9초로 길게 잡되 초기 쿨이 유닛마다 흩어지므로(runAbility) 여러 기가 있으면
    // 번갈아 들어온다 — "쉴 새 없이 뭔가 온다"는 밀도를 물량이 아니라 시차로 만든다.
    // 피해는 작게(22). 이 능력의 일은 죽이는 게 아니라 **가만히 못 있게 하는 것**이다.
    // `motif` 는 **아트 전용 키**다(js/skillfx.js 의 MOTIF_MAT 팔레트를 고른다).
    // 밸런스에는 한 톨도 안 들어간다 — heroes.js 의 스킬 60종이 이미 같은 키를 쓰고 있고,
    // 유닛 능력 9종만 빠져 있어서 **아홉 가지가 전부 같은 진흙색으로 터지고 있었다.**
    ability: { type: 'charge', motif: 'blade', cooldown: 6600, telegraph: 450,
               minRange: 110, maxRange: 210, dist: 210,
               damage: 54, radius: 36, knockback: 16 }
  },

  rifleman: {
    key: 'rifleman', name: '궁수', art: 'archer',
lore: '숲에서 새알을 노리던 사냥꾼. 화살은 곧게 날아가니 길목을 미리 잡아야 맞는다.',
    desc: '단궁. 논타겟 직선 사격이라 보고 피할 수 있다.',
    cost: 20, pop: 2, hp: 187, armor: 10, speed: 115, range: 330, damage: 51, cooldown: 1300,
    attack: 'projectile', projectileSpeed: 240, projectileRadius: 6,
    radius: 11, shape: 'triangle', weapon: 'rifle',
    chase: 150, aggro: 360, spacing: 38,
    // 정조준 — **멀리 서 있는 것을 벌하는 유일한 수단.**
    // 사용자 신고 1번("궁수가 너무 유리해")의 구조적 원인은 사거리 340 짜리 영웅이
    // 아무 대가 없이 거리를 유지할 수 있다는 것이었다(반응요구 63% vs 근접 90%).
    // 돌진은 원거리 영웅에게 안 통한다 — 붙기 전에 또 물러나면 그만이다.
    // 그래서 **거리를 유지해도 닿는 것**을 하나 만든다: 발밑에 그림자가 지고,
    // 그 자리에 계속 서 있으면 맞는다. 피하는 법은 하나뿐 — 움직이는 것.
    ability: { type: 'barrage', motif: 'feather', cooldown: 7200, telegraph: 640,
               minRange: 150, maxRange: 900,
               damage: 104, radius: 72, repeat: 1,
               // 예측 사격 계수 — 진행 방향으로 미리 쏜다(combat.js 주석 참조)
               aimLead: 0.75 }
  },

  grenadier: {
    key: 'grenadier', name: '투석꾼', art: 'slinger',
lore: '강가의 둥근 돌만 골라 담는 무릿매꾼. 겨눈 자리에 그림자가 지고, 못 피한 것만 부순다.',
    desc: '무릿매로 돌을 날린다. 예고 후 터지는 광역 — 구역을 봉쇄한다.',
    cost: 20, pop: 2, hp: 96, armor: 5, speed: 95, range: 300, damage: 51, cooldown: 2500,
    attack: 'aoe', aoeRadius: 62, telegraph: 900,
    radius: 12, shape: 'diamond', weapon: 'launcher',
    chase: 130, aggro: 330, spacing: 41,
    // 2026-07-31 · 스킬 신설. 정체성(구역 봉쇄)을 그대로 키운다 —
    // 한 발이 아니라 **세 발을 흩어 떨어뜨려** 서 있을 자리를 지운다.
    // 피해는 평타(69)보다 낮게 잡는다. 이 스킬의 일은 죽이는 게 아니라 **쫓아내는 것**이다.
    ability: { type: 'barrage', motif: 'rock', cooldown: 7600, telegraph: 700,
               minRange: 120, maxRange: 900,
               damage: 92, radius: 66, repeat: 3, spread: 190, interval: 380,
               // 예측 사격 계수 — 진행 방향으로 미리 쏜다(combat.js 주석 참조)
               aimLead: 0.55 }
  },

  sniper: {
    key: 'sniper', name: '투창병', art: 'spearman',
lore: '한 번 던지면 반드시 박히는 미늘 작살. 대신 다시 던질 때까지 오래 숨을 고른다.',
    desc: '미늘 작살. 던지면 반드시 맞는다. 비싼 대신 회피 불가.',
    cost: 40, pop: 4, hp: 100, armor: 5, speed: 90, range: 420, damage: 75, cooldown: 3000,
    attack: 'targeted', bulletSpeed: 760,
    radius: 11, shape: 'hex', weapon: 'sniperRifle',
    chase: 110, aggro: 440, spacing: 38,
    // 2026-07-31 · 스킬 신설. 이미 자동명중이라 '맞추는 것'을 더 줘도 의미가 없다 →
    // **예고가 보이는 큰 한 방**을 준다. 피할 수 있게 만들어 자동명중과 결이 달라진다.
    ability: { type: 'barrage', motif: 'bone', cooldown: 9000, telegraph: 900,
               minRange: 160, maxRange: 900,
               damage: 188, radius: 82, repeat: 1,
               // 예측 사격 계수 — 진행 방향으로 미리 쏜다(combat.js 주석 참조)
               aimLead: 0.7 }
  },

  // ── 지원 계열 ──────────────────────────────────────────────
  medic: {
    key: 'medic', name: '약초꾼', art: 'herbalist',
lore: '약초를 씹어 상처에 붙이는 손. 스스로는 안 싸우지만 주변의 알들이 잘 안 깨진다.',
    desc: '약초로 주변 아군을 회복시킨다. 같은 연기가 적에게는 상처가 되어 회복을 막는다.',
    cost: 30, pop: 3, hp: 130, armor: 10, speed: 105, range: 0, damage: 0, cooldown: 1000,
    attack: 'none',
    healRadius: 150, healPerTick: 14, healInterval: 1000,
    radius: 11, shape: 'cross', weapon: 'aidkit',
    chase: 140, aggro: 0,
    // 2026-07-31 · 스킬 신설. 공격하지 않는 유닛이라 피해 스킬은 정체성을 깬다 →
    // **주변 아군을 한 번에 크게 회복**시킨다. 진형이 무너지기 직전을 되돌리는 장치라,
    // 컨트롤러에게 '약초꾼을 먼저 끊어야 한다'는 처치 순서를 강제한다.
    // ── 2026-08-02 · **흡혈의 답** (사용자 지시) ────────────────────────────
    //  "흡혈로 인해서 아예 데미지 못 입히는 경우도 있으니 치유 감소 스킬도 필요."
    //  새 유닛을 만들지 않고 **이미 있는 스킬의 반대편**을 쓴다 — 약초꾼의 연기가
    //  아군에게는 약이고 적에게는 독이다. 그래야 아트·팔레트·AI 가중치가 안 늘고,
    //  답이 "약초꾼을 먼저 끊어라"라는 **처치 순서**로 표현된다.
    //  55%/4.5초 — 반으로 깎되 0 으로는 안 만든다. 0 이면 답이 아니라 벽이 되고,
    //  이 게임의 흡혈은 광역 명중 수에 비례해 증폭되므로(표기 25% → 실효 79%)
    //  절반만 깎아도 광역 영웅에게는 체감이 크다.
    ability: { type: 'healBurst', motif: 'sand', cooldown: 14000, telegraph: 500,
               radius: 190, heal: 130,
               enemyHealCut: 0.55, enemyHealCutMs: 4500 }
  },

  shieldman: {
    key: 'shieldman', name: '방패병', art: 'shieldman',
lore: '통나무를 깎아 만든 대방패. 날아오는 것을 대신 받아 뒷줄의 약한 알들을 살린다.',
    desc: '나무 대방패로 아군에게 갈 투사체를 대신 맞는다. 공격력은 낮다.',
    cost: 30, pop: 3, hp: 504, armor: 45, speed: 100, range: 50, damage: 13, cooldown: 1100,
    attack: 'melee', coneDeg: 80,
    intercept: 46,          // 이 반경 안을 지나는 적 투사체를 대신 맞는다
    radius: 15, shape: 'shield', weapon: 'riotShield',
    chase: 200, aggro: 240,
    // 방패 돌진 — 사용자 신고("뺑뺑이 돌리다 방패병만 남는다")에 대한 답.
    // 방패병은 유효 체력 609(비보스 최고)에 속도 100 이라, 사거리 340 짜리 영웅에게는
    // **19초짜리 벽**이었다(사냥꾼 유효 피해 16.5 × 쿨 750ms). 체력을 깎으면 존재 이유가
    // 사라지고, 그대로 두면 지루하다. 그래서 **거리를 지우는 수단**을 줬다 —
    // 이제 방패병은 맞아주는 물건이 아니라 '피해야 하는 순간'을 만든다.
    ability: { type: 'charge', motif: 'shield', cooldown: 6400, telegraph: 520,
               minRange: 120, maxRange: 270, dist: 270,
               damage: 66, radius: 44, knockback: 24 }
  },

  sergeant: {
    key: 'sergeant', name: '족장', art: 'chieftain',
lore: '소뿔 투구를 쓰고 앞장서는 우두머리. 그가 보고 있는 동안 부족이 더 세게 친다.',
    desc: '소뿔 투구를 쓴 우두머리. 주변 아군의 공격력을 올린다. 진형의 심장.',
    cost: 30, pop: 3, hp: 146, armor: 20, speed: 110, range: 240, damage: 18, cooldown: 1500,
    attack: 'projectile', projectileSpeed: 260, projectileRadius: 5,
    buffRadius: 190, buffDamageMul: 1.30,
    radius: 12, shape: 'star', weapon: 'pistol',
    chase: 160, aggro: 300, spacing: 41,
    // 2026-07-31 · 스킬 신설. 상시 버프(1.30)가 정체성이므로 **일시적으로 더 크게** 준다.
    // 포효가 터지면 그 몇 초가 진형의 화력 정점이다 — 그때 붙어 있으면 위험하다는 신호.
    ability: { type: 'warcry', motif: 'rope', cooldown: 15000, telegraph: 600,
               radius: 220, dmgMul: 1.6, ms: 4000 }
  },

  // ── 고정·설치물 ────────────────────────────────────────────
  // 고정 유닛은 움직일 수 없으므로 '맵 끝까지 닿는 사거리'를 갖는다(사각지대 금지 규칙).
  // 논타겟 투사체라 멀수록 날아오는 시간이 길어져 피하기 쉬워진다 —
  // 사거리가 길다고 강해지는 게 아니라 '숨을 곳이 없어지는' 쪽으로 작동한다.
  mgnest: {
    key: 'mgnest', name: '쇠뇌 진지', art: 'ballista',
lore: '통나무로 짜 세운 거치 쇠뇌. 한 발도 못 움직이는 대신 골짜기 끝까지 닿는다.',
    desc: '거치식 연발 쇠뇌. 절대 움직이지 않지만 맵 어디든 닿는다.',
    cost: 50, pop: 5, hp: 333, armor: 25, speed: 0, range: 0, rangeSpan: true, damage: 31, cooldown: 420,
    attack: 'projectile', projectileSpeed: 340, projectileRadius: 5,
    radius: 14, shape: 'bunker', weapon: 'mg',
    chase: 0, aggro: 0,       // 고정
    immobile: true,
    // 2026-07-31 · 스킬 신설. 못 움직이는 대신 **집중 사격**으로 한 구역을 지운다.
    // 고정물이라 컨트롤러가 위치만 바꾸면 피할 수 있다 — 대가가 분명한 스킬이다.
    ability: { type: 'barrage', motif: 'blade', cooldown: 8200, telegraph: 620,
               minRange: 100, maxRange: 900,
               damage: 100, radius: 58, repeat: 4, spread: 150, interval: 300,
               // 예측 사격 계수 — 진행 방향으로 미리 쏜다(combat.js 주석 참조)
               aimLead: 0.6 }
  },

  chemtrooper: {
    key: 'chemtrooper', name: '늪지기', art: 'bogman',
lore: '끈끈한 늪 수액을 단지에 담아 던진다. 맞은 자는 발이 붙어 달아나지 못한다.',
    desc: '끈끈한 수액 단지를 던진다. 맞으면 영웅이 느려진다.',
    // ── 2026-07-31 · **역할 재정의: 뺑뺑이 잡는 유닛** (기여도 실측 근거) ──────
    //   `tools/unit-contribution.js` 로 재니 전 유닛 중 **꼴찌**였다 —
    //   기당 피해 13, 한 번도 못 때린 개체 44%. 이유는 스탯이 아니라 **구조**다:
    //   사거리 300 < 영웅 340, 속도 100 < 영웅 158 → 쏠 수도 붙을 수도 없었다.
    //   숫자를 조금 올려도 여전히 못 닿으니 의미가 없다. **일을 바꾼다.**
    //   range 300→**390** (영웅 340 을 넘긴다) · 둔화 0.55→**0.45**, 2200→**3000ms**.
    //   이제 늪지기는 '거리를 유지하는 것' 자체를 벌준다 — 늪에 걸리면 느려져
    //   전사(135)·방패병 돌진에게 따라잡힌다. 화력(21)은 그대로 — 죽이는 유닛이 아니다.
    //   대신 비용 30→38: 뺑뺑이의 유일한 해답이 싸면 진형이 늪지기만 깔게 된다.
    cost: 40, pop: 4, hp: 137, armor: 10, speed: 100, range: 390, damage: 20, cooldown: 2200,
    attack: 'projectile', projectileSpeed: 210, projectileRadius: 9,
    slowMul: 0.45, slowMs: 3000,
    radius: 12, shape: 'diamond', weapon: 'launcher',
    chase: 140, aggro: 320, spacing: 41,
    // 2026-07-31 · 스킬 신설. 둔화가 정체성이므로 **넓게 한 번에** 건다.
    // 카이팅(거리를 벌리는 답)을 직접 벌주는 유일한 전략 유닛 스킬이다.
    ability: { type: 'barrage', motif: 'bog', cooldown: 8600, telegraph: 760,
               minRange: 120, maxRange: 900,
               damage: 62, radius: 110, repeat: 1, slowMul: 0.5, slowMs: 2600,
               // 예측 사격 계수 — 진행 방향으로 미리 쏜다(combat.js 주석 참조)
               aimLead: 0.85 }
  },

  mine: {
    key: 'mine', name: '가시덫', art: 'snaretrap',
lore: '마른 풀로 덮어둔 뼈 가시 함정. 밟기 전까지는 거기 있는 줄 아무도 모른다.',
    desc: '보이지 않는다. 밟으면 잠깐 뒤 크게 터진다 — 걸어서는 못 벗어난다.',
    cost: 30, pop: 3, hp: 34, armor: 0, speed: 0, range: 0, damage: 0, cooldown: 999999,
    attack: 'none',
    // ── 2026-08-01 · **보이지 않고, 밟으면 예고 뒤에 터진다** (사용자 지시) ───────
    //  "지뢰는 상대방 눈에 안 보이게 하고, 대신 밟으면 피할 수 있는 범위와 시간을
    //   약간만 주고 터트리게 해줘. 피하는 건 최소 이동 스킬을 써야 피할 수 있을 정도."
    //
    //  예전엔 밟는 즉시 피해였다 — 피할 여지가 0 이라 '함정'이 아니라 '지뢰세'였고,
    //  게다가 발밑 점선 링으로 **위치가 다 보여서** 애초에 안 밟으면 그만이었다.
    //  둘 다 뒤집는다: 위치는 숨기고, 밟은 뒤에 짧은 도망 기회를 준다.
    //
    //  ⚠ 시간·범위는 "걸어서는 못 벗어나고 이동 스킬이면 벗어난다"에서 역산했다.
    //    밟는 지점은 중심에서 triggerRadius(52), 안전선은 blastRadius(150) →
    //    걸어서 벗어나려면 98px 를 가야 하고 영웅 속도 142~158 기준 **0.62~0.69초**가
    //    걸린다. 도화선을 0.45초로 두면 걸음으로는 못 빠지고, 돌진류(175~340px)는
    //    한 번에 벗어난다. 세 거리값은 전부 `DIST_KEYS` 라 프로필 배율이 같이 걸려
    //    이 비율은 PC·폰·세로에서 동일하다.
    isMine: true, triggerRadius: 52, pctMaxHp: 0.30, blastRadius: 150,
    fuseMs: 450,
    radius: 9, shape: 'mine', weapon: null,
    chase: 0, aggro: 0, immobile: true,
    maxPerFormation: 1,
    // ⚠ **AI 진형에서는 뺀다** (2026-07-31, 기여도 실측). 뺑뺑이 영웅은 함정을 밟을
    //   일이 없어 못때림 **100%** · 이동 0 이었다 — 비용 35 를 그냥 버리는 칸이었다.
    //   플레이어 배치(대전·수성의 탑)에서는 그대로 쓸 수 있다. 사람은 상대가 지나갈
    //   길을 읽고 놓을 수 있지만, AI 는 그 판단을 못 한다는 것이 데이터의 결론이다.
    aiExclude: true
  }
};

// ── 보스 (통곡의 탑 10층마다) ────────────────────────────────────────────
// 플레이어가 배치할 수 없고 AI 도 뽑지 않는다 — UNIT_ORDER 에 넣지 않는 이유다.
// 새 메커니즘을 만들지 않고 기존 공격 타입만 크게 굴린다(위험을 늘리지 않으려고).
// 체급으로 존재감을 주되 **회피 가능한 논타겟**이라 실력으로 넘을 수 있어야 한다.
GAME.BOSS_UNITS = {
  // ── 40층~ · **계란이 아닌 것들** (2026-08-02 사용자 지시) ────────────────────
  //  "정말 강력해 보이는 몬스터 … 올라갈수록 세계관과 연결된 강한 몹 … 최종 보스는
  //   정말 큰 용 … 50, 100 정도엔 용의 부하나 용의 몸 일부하고 싸우면서 그 강함의
  //   크기를 미리 느꼈으면."
  //
  //  세계관 층위: 계란 부족의 전쟁 **위에 더 오래된 것**이 있다.
  //    40층  재 파수병 — 계란 부족의 마지막. 여기서 '용의 재'가 처음 나온다
  //    50층  잿날개    — 용의 부하. 용이 실재한다는 첫 증거
  //    70/90 서리·폭풍 권속
  //    100층 용의 발톱 — **몸의 일부**. 나머지는 화면 밖이라는 게 요점이다
  //    150층~ 용 본체
  //  ⚠ 새 전투 메커니즘을 만들지 않는다 — 기존 `charge`/`barrage` 만 크게 굴린다.
  //    새 타입을 넣으면 combat.js 전체가 회귀 위험에 들어간다(이 폴더의 오랜 규율).
  //  ⚠ 아트는 `beast:종류:결` 문자열이다(js/bossart.js). eggart 의 ART 표는
  //    계란 전용이라 건드리지 않는다.
  bossAshSentry: {
    key: 'bossAshSentry', name: '재 파수병', art: 'beast:sentry:ash', isBoss: true,
    lore: '탑 위에서 내려온 재를 뒤집어쓴 채 굳어 버린 파수병. 뿔이 돋기 시작했다.',
    desc: '재를 뒤집어쓴 파수병. 재가 쌓인 자리를 넓게 짓밟는다.',
    cost: 0, hp: 318, armor: 30, speed: 92, range: 104, damage: 70, cooldown: 1250,
    guard: { every: 12500, warn: 900, ms: 3800, cut: 0.15, reflect: 0.50 },
    attack: 'melee', coneDeg: 120,
    radius: 29, shape: 'star', weapon: 'riotShield',
    chase: 460, aggro: 460,
    ability: { type: 'charge', cooldown: 6000, telegraph: 560,
               minRange: 150, maxRange: 500, dist: 500,
               damage: 280, radius: 70, knockback: 58 }
  },

  bossDrakeAsh: {
    key: 'bossDrakeAsh', name: '잿날개', art: 'beast:drake:ash', isBoss: true,
    lore: '용이 거느린 것 중 가장 작은 것. 그런데도 부족 하나를 하룻밤에 지웠다.',
    desc: '용의 부하. 낮게 날아와 덮치고, 재를 흩뿌린다.',
    cost: 0, hp: 318, armor: 30, speed: 118, range: 112, damage: 65, cooldown: 1150,
    guard: { every: 12000, warn:  900, ms: 4000, cut: 0.15, reflect: 0.50 },
    attack: 'melee', coneDeg: 110,
    radius: 30, shape: 'star', weapon: 'rifle',
    chase: 560, aggro: 560,
    // 급강하 — 가장 빠른 놈이라 거리를 더 멀리 지운다. 예고는 짧지만 사거리가 길다.
    ability: { type: 'charge', cooldown: 5000, telegraph: 480,
               minRange: 170, maxRange: 640, dist: 640,
               damage: 269, radius: 78, knockback: 70 }
  },

  bossDrakeFrost: {
    key: 'bossDrakeFrost', name: '서리 권속', art: 'beast:drake:frost', isBoss: true,
    lore: '숨을 뱉으면 골짜기가 하얗게 언다. 얼어붙은 것은 다시 움직이지 못한다.',
    desc: '서리를 뿌리는 권속. 넓은 자리를 얼려 발을 묶는다.',
    cost: 0, hp: 308, armor: 34, speed: 104, range: 120, damage: 70, cooldown: 1250,
    guard: { every: 11800, warn:  900, ms: 4100, cut: 0.15, reflect: 0.52 },
    attack: 'melee', coneDeg: 120,
    radius: 30, shape: 'star', weapon: 'riotShield',
    chase: 560, aggro: 560,
    // 얼림(2026-08-02 사용자 지시: "불 뿜거나 얼음 뿜거나 등 보스몹다운 스킬") —
    // `slowMul`/`slowMs`는 늪지기 스킬이 이미 쓰는 필드라 combat.js 는 한 글자도
    // 안 바뀐다. "얼어붙은 것은 다시 움직이지 못한다"는 lore 그대로 실현된다.
    ability: { type: 'barrage', cooldown: 6200, telegraph: 700,
               minRange: 0, maxRange: 4000,
               damage: 219, radius: 130, repeat: 3, interval: 400, spread: 250,
               slowMul: 0.45, slowMs: 2200 }
  },

  bossDrakeStorm: {
    key: 'bossDrakeStorm', name: '폭풍 권속', art: 'beast:drake:storm', isBoss: true,
    lore: '날개 한 번에 하늘이 갈린다. 용이 오기 전에 길을 여는 것이 이것의 일이다.',
    desc: '폭풍을 몰고 오는 권속. 하늘에서 연달아 내리꽂는다.',
    cost: 0, hp: 323, armor: 34, speed: 126, range: 116, damage: 62, cooldown: 1100,
    guard: { every: 11500, warn:  850, ms: 4200, cut: 0.14, reflect: 0.55 },
    attack: 'melee', coneDeg: 115,
    radius: 31, shape: 'star', weapon: 'rifle',
    chase: 620, aggro: 620,
    // 밀어냄(2026-08-02) — `knockback` 은 `js/combat.js`에 새로 추가한 opt-in
    // 필드(barrage 예고가 터질 때 슬로우처럼 얹는다). "폭풍"이라는 이름값을
    // 실제 물리적 결과로 준다 — 다른 barrage 보스는 이 필드가 없어 그대로다.
    ability: { type: 'barrage', cooldown: 5400, telegraph: 560,
               minRange: 0, maxRange: 4000,
               damage: 205, radius: 118, repeat: 4, interval: 320, spread: 300,
               knockback: 46 }
  },

  // ── 용의 몸 — 50층마다 한 부위씩 (2026-08-02 사용자 지시) ────────────────────
  //  "50 · 100 · 150 · 200 · 250 에서 각각 용의 발, 용의 손, 용의 날개,
  //   용의 반쪽 얼굴 등으로 보여주다가 결국 300에서 실제 용과 싸우길."
  //
  //  다섯 부위는 **같은 한 마리의 다른 부분**이다. 그래서 셋을 지킨다:
  //   ① 전부 `ember` 결 — 색이 같아야 같은 것으로 읽힌다
  //   ② **위로 갈수록 몸의 중심에 가까워진다**(발 → 손 → 날개 → 얼굴 → 상반신)
  //   ③ 부위는 **움직이지 않는다**(날개만 예외로 조금 움직인다) — 몸의 일부가
  //      따라다니면 그게 한 마리라는 착각이 깨진다. 크기와 사거리로 위협한다.
  //  체력은 300층의 본체(30,000)를 향해 계단으로 오른다. 층 성장 배수가 따로
  //  곱해지므로(`Tower.bossModsFor`) 여기 값은 **계단의 모양**만 정한다.
  //  ⚠ 2026-08-02 9차 — **순서가 뒤집혔다**(사용자 지시: "알을 50,100,150에 넣고
  //    발 손 날개를 300전에 넣자. 알이 깨지고 발이 나오는게 맞지"). 맞는 말이다 —
  //    8차까지는 부위(발·손·날개)를 먼저 보여주고 알을 나중에 뒀는데, 그러면
  //    **이미 다 자란 용의 부위를 본 뒤에 알로 되돌아가는** 시간 역행이 된다.
  //    지금은 알 → 균열 → 눈 → 발 → 손 → 날개 → 본체 순이다(부화 과정 그대로).
  //    그래서 체력 계단도 통째로 다시 매겼다 — 층이 바뀌면 계단도 따라가야 한다.
  bossDragonFoot: {
    key: 'bossDragonFoot', name: '용의 발', art: 'beast:foot:ember', isBoss: true,
    lore: '깨진 껍질을 딛고 발 하나가 먼저 나왔다. 발톱 하나가 계란 부족의 키만 하다.',
    desc: '용의 발. 밟히면 진형 한 줄이 사라진다.',
    cost: 0, hp: 377, armor: 46, speed: 0, range: 200, damage: 84, cooldown: 1500,
    guard: { every: 11500, warn: 850, ms: 4400, cut: 0.12, reflect: 0.60 },
    attack: 'melee', coneDeg: 160,
    radius: 32, shape: 'bunker', weapon: 'riotShield',
    chase: 0, aggro: 0, immobile: true,
    // 밀어냄 — "밟히면 진형 한 줄이 사라진다"를 실제로 날아가게 만든다(knockback,
    // 폭풍 권속과 같은 opt-in 필드).
    ability: { type: 'barrage', cooldown: 5600, telegraph: 800,
               minRange: 0, maxRange: 4000,
               damage: 247, radius: 165, repeat: 4, interval: 360, spread: 340,
               knockback: 54 }
  },

  bossDragonClaw: {
    key: 'bossDragonClaw', name: '용의 손', art: 'beast:claw:ember', isBoss: true,
    lore: '이번엔 손이다. 무엇을 쥐려고 껍질을 밀어내는지는 아무도 모른다.',
    desc: '용의 손. 다섯 손가락이 전장을 통째로 움켜쥔다.',
    cost: 0, hp: 380, armor: 50, speed: 0, range: 210, damage: 82, cooldown: 1450,
    guard: { every: 11000, warn: 800, ms: 4600, cut: 0.12, reflect: 0.65 },
    attack: 'melee', coneDeg: 170,
    radius: 34, shape: 'bunker', weapon: 'riotShield',
    chase: 0, aggro: 0, immobile: true,
    // 내리찍기(2026-08-02 사용자 지시: "손이 움직이거나 주먹을 내리치는 등의
    // 스킬이 있어야 해") — 팔이 화면 위로 이어지는 연출이라 이동은 안 어울린다,
    // 대신 제자리에서 **자기 반경 전체를 찍어 누른다.** `shockwave`는 이미 있는
    // 능력 타입이라 combat.js 를 한 줄도 안 건드리고, 반경만 melee 사거리(210)보다
    // 훨씬 크게 잡아 "다섯 손가락이 전장을 통째로 움켜쥔다"는 desc 를 실현한다.
    ability: { type: 'shockwave', cooldown: 5400, telegraph: 900,
               damage: 295, radius: 270 }
  },

  bossDragonWing: {
    key: 'bossDragonWing', name: '용의 날개', art: 'beast:wingpart:ember', isBoss: true,
    lore: '마지막으로 날개가 펴졌다. 하늘이 한 번 어두워졌다 — 구름이 아니었다.',
    desc: '용의 날개. 한 번 접었다 펴면 전장이 뒤집힌다.',
    // 부위 중 유일하게 움직인다 — 날개는 원래 움직이는 것이다. 다만 아주 느리게.
    cost: 0, hp: 383, armor: 54, speed: 62, range: 230, damage: 79, cooldown: 1400,
    guard: { every: 11000, warn: 800, ms: 4600, cut: 0.12, reflect: 0.65 },
    attack: 'melee', coneDeg: 180,
    radius: 36, shape: 'star', weapon: 'riotShield',
    chase: 420, aggro: 460,
    // 접었다 펴기(2026-08-02) — "한 번 접었다 펴면 전장이 뒤집힌다"는 자기중심
    // 파동(`shockwave`, 넉백 내장)과 정확히 같은 그림이다. 날개는 부위 중
    // 유일하게 움직이는 존재라는 설정과도 맞는다(퍼덕임 = 자기중심). barrage 의
    // 여러 예고 대신 **한 번의 큰 파동**으로 바꿔 다른 barrage 보스와 구분한다.
    ability: { type: 'shockwave', cooldown: 5000, telegraph: 700,
               damage: 245, radius: 225 }
  },

  // ── 용의 알 세 단계 (2026-08-02 8차 신설 → 9차에서 **앞으로** 옮김) ──────────
  //  8차 사용자 지시: "에그워와 맞게 드래곤 알도 보스에 추가해주고, 알이 깨어져서
  //   깨어지는 알(균열 안에서 반짝이는 눈만 보임)도 과정에 추가."
  //  9차 사용자 지시: "알을 50,100,150에 넣고 발 손 날개를 300전에 넣자.
  //   **알이 깨지고 발이 나오는게 맞지.**"
  //
  //  9차 지적이 순서의 오류를 짚었다. 8차는 부위(발·손·날개)를 50~150에 두고
  //  알을 200~250에 뒀는데, 그러면 **다 자란 용의 부위를 본 뒤에 알로 되돌아가는**
  //  시간 역행이 된다. 지금은 부화 과정 그대로다:
  //    50  용의 알     — 멀쩡한 알. 안에서 뭔가 두근거린다
  //    100 금 간 알    — 균열이 갔다. 아직 안은 안 보인다
  //    150 깨어지는 알 — 그 틈으로 **눈만** 보인다
  //    200 용의 발 · 230 용의 손 · 260 용의 날개 — 껍질을 뚫고 하나씩 나온다
  //    300 태초의 용   — 다 나왔다(얼굴은 여기서 처음 공개된다)
  //
  //  ⚠ **이 게임은 알에서 깨어난 자들의 전쟁이다**(CLAUDE.md 세계관). 모든 유닛이
  //    알에서 나왔는데 정작 최종 보스만 알과 무관했다 — 용도 알에서 나온다고 하면
  //    세계관이 한 바퀴 닫힌다. 계란 부족이 서로 싸우는 동안 산 아래에서
  //    **가장 큰 알**이 깨어나고 있었다는 이야기가 된다.
  bossDragonEgg: {
    key: 'bossDragonEgg', name: '용의 알', art: 'beast:egg:ember', isBoss: true,
    lore: '산보다 오래된 알. 겉은 돌처럼 식었는데 안에서 무언가 계속 두근거린다.',
    desc: '용의 알. 껍질이 단단해 좀처럼 깨지지 않는다.',
    // 알은 **움직이지도 쫓아오지도 않는다** — 두꺼운 껍질 그 자체다. 그래서 방어력을
    // 이 게임 최고로 두고(70), 공격은 '박동'으로 주변을 흔드는 것 하나뿐이다.
    // "때리는 보스"가 아니라 "부수는 데 오래 걸리는 벽"이라는 다른 종류의 층이 된다.
    // ⚠ 2026-08-02 사용자 재신고: "피할수없는 스킬이 10k데미지가 떠서 한번에죽었어."
    //   범인은 스킬이 아니라 **평타**였다 — 104 × 50층 배수 32.6 × 성장 2.9 = **9,834**.
    //   거기에 사거리 210 · 부채꼴 360도 · 1.5초마다라 **예고도 없이 무조건** 맞는다.
    //   지난번엔 abilities 만 고치고 평타를 안 봤다 — 같은 실수를 반복하지 말 것.
    //   알은 **밀치고 때리는 것이 아니다**(팔이 없다). 평타를 1/4 로 줄이고
    //   사거리도 줄여 "붙지만 않으면 안 맞는다"로 바꿈.
    cost: 0, hp: 285, armor: 52, speed: 0, range: 150, damage: 84, cooldown: 1500,
    guard: { every: 11000, warn: 900, ms: 4200, cut: 0.12, reflect: 0.55 },
    attack: 'melee', coneDeg: 360,
    radius: 38, shape: 'bunker', weapon: 'riotShield',
    chase: 0, aggro: 0, immobile: true,
    // ── 스킬 둘 (2026-08-02 사용자 지시) ────────────────────────────────────
    //  "스킬 한방에 8k가 넘는건 너무해. 2k정도만 해도 될거같고, 차라리 한방스킬도
    //   있되 그건 노력만하면 피할수있게끔 미리 경고를 하거나 해줘."
    //
    //  신고가 맞았다. 예전 박동은 **예고 1초 · 반경 235 · 피해 112** 였다 —
    //  50층 배수(×32.6)에 성장분까지 곱하면 8,000 이 넘는데, 1초 안에 반경 235 를
    //  벗어나려면 초속 235 가 필요하다(영웅은 142~178). **구조적으로 못 피하는
    //  큰 한 방**이었던 것이다. 큰 피해 자체가 문제가 아니라 '못 피하는' 것이 문제다.
    //
    //  그래서 둘로 나눈다:
    //   ① 박동 — 자주(5.2초), 작게(112 → 28 = 예전의 1/4, 실측 ~2,000). 못 피해도 죽지 않는다.
    //   ② 껍질 깨기 — 가끔(13초), 크게. 대신 **예고 2.4초 · 반경 165 · 추적 없음**.
    //      2.4초면 영웅이 340~430px 를 움직인다 — 반경 165 는 걸어 나가기만 해도 벗어난다.
    //      즉 "노력만 하면 피할 수 있는 한 방"이다(사용자 요청 그대로).
    //  ⚠ 2026-08-02 3차 — 위 숫자들은 **보스 층 지수(×35)가 있던 시절 값**이다.
    //    지수를 걷어냈으므로(js/tower.js bossModsFor) 여기 기본값을 사용자가 지정한
    //    체감 목표에 맞춰 다시 잡는다: 평타 1,000 · 스킬 2,000 · 궁극기 5,000.
    //    50층 배수(층1.49 × 성장9.7 × 보스1.5 ≈ 21.6)로 나눈 값이 아래 damage 다.
    abilities: [
      { type: 'shockwave', cooldown: 5200, telegraph: 1000,
        damage: 93, radius: 235 },                    // 박동 — 실측 ~2,000
      { type: 'barrage', cooldown: 13000, telegraph: 2700,
        minRange: 0, maxRange: 4000, aimLead: 0,
        damage: 232, radius: 160, repeat: 1, interval: 0, spread: 0 }  // 껍질 깨기 — 실측 ~5,000
    ]
  },

  bossDragonEggCracked: {
    key: 'bossDragonEggCracked', name: '금 간 알', art: 'beast:eggcrack:ember', isBoss: true,
    lore: '껍질에 금이 갔다. 안쪽은 아직 어둡지만, 열기가 새어 나오기 시작했다.',
    desc: '금 간 알. 틈에서 새는 열기가 주변을 지진다.',
    // 방어력이 알(70)보다 낮다 — 금이 갔으니 당연하다. 대신 체력과 공격이 오른다.
    cost: 0, hp: 323, armor: 46, speed: 0, range: 158, damage: 79, cooldown: 1400,
    guard: { every: 11000, warn: 850, ms: 4400, cut: 0.12, reflect: 0.60 },
    attack: 'melee', coneDeg: 360,
    radius: 39, shape: 'bunker', weapon: 'riotShield',
    chase: 0, aggro: 0, immobile: true,
    // 50층과 같은 구조(박동 + 피할 수 있는 한 방). 균열이 커진 만큼 둘 다 조금씩 세다.
    abilities: [
      { type: 'shockwave', cooldown: 4800, telegraph: 900,
        damage: 42, radius: 258 },
      { type: 'barrage', cooldown: 12500, telegraph: 2600,
        minRange: 0, maxRange: 4000, aimLead: 0,
        damage: 112, radius: 170, repeat: 1, interval: 0, spread: 0 }
    ]
  },

  bossDragonCrack: {
    key: 'bossDragonCrack', name: '깨어지는 알', art: 'beast:eggeye:ember', isBoss: true,
    lore: '껍질이 갈라졌다. 그 틈으로 눈 하나가 이쪽을 보고 있다. 아직 눈뿐이다.',
    desc: '깨어지는 알. 균열에서 새어 나오는 열기가 전장을 태운다.',
    cost: 0, hp: 360, armor: 42, speed: 0, range: 165, damage: 73, cooldown: 1300,
    guard: { every: 10500, warn: 800, ms: 4600, cut: 0.10, reflect: 0.65 },
    attack: 'melee', coneDeg: 360,
    radius: 40, shape: 'bunker', weapon: 'riotShield',
    chase: 0, aggro: 0, immobile: true,
    // 균열에서 뿜는 열 — 이제 **멀리까지 닿는다**(앞의 두 단계는 자기중심뿐이었다).
    // 150층이 100층보다 무서워지는 이유가 체력이 아니라 **사거리**라는 게 요지다.
    //  ⚠ 이쪽 첫 스킬은 원래부터 **5연발 산개**라 한 발이 작고(피해 142 → 40) 피할
    //    자리가 있다 — 알 두 단계의 '박동'과 같은 자리다. 여기에 같은 규격의
    //    "피할 수 있는 한 방"을 붙여 셋의 문법을 통일한다.
    abilities: [
      { type: 'barrage', cooldown: 4400, telegraph: 700,
        minRange: 0, maxRange: 4000,
        damage: 48, radius: 195, repeat: 5, interval: 300, spread: 360,
        knockback: 38 },
      { type: 'barrage', cooldown: 12000, telegraph: 2500,
        minRange: 0, maxRange: 4000, aimLead: 0,
        damage: 138, radius: 180, repeat: 1, interval: 0, spread: 0 }
    ]
  },

  bossDragonLord: {
    key: 'bossDragonLord', name: '태초의 용', art: 'beast:dragon:ember', isBoss: true,
    lore: '계란 부족이 서로를 치는 동안, 그것은 산 아래에서 자고 있었다. 이제 다 나왔다.',
    desc: '태초의 용. 날개 한 번에 전장이 뒤집힌다.',
    //  300층. 앞의 다섯 부위가 전부 이 한 마리였다는 것을 여기서 확인한다.
    cost: 0, hp: 368, armor: 58, speed: 108, range: 260, damage: 70, cooldown: 1250,
    guard: { every: 10000, warn: 750, ms: 5000, cut: 0.10, reflect: 0.75 },
    attack: 'melee', coneDeg: 160,
    radius: 42, shape: 'star', weapon: 'riotShield',
    chase: 760, aggro: 760,
    // 둘을 다 가진 유일한 보스 — 거리도 지우고 설 자리도 지운다.
    ability: { type: 'barrage', cooldown: 4200, telegraph: 600,
               minRange: 0, maxRange: 4000,
               damage: 196, radius: 220, repeat: 7, interval: 280, spread: 440 }
  },

  bossChief: {
    key: 'bossChief', name: '거대 족장', art: 'chieftain', isBoss: true,
lore: '오래 살아남아 둥지만큼 커진 우두머리. 그가 포효하면 부족 전체가 세게 친다.',
    desc: '부족을 이끄는 거대한 알. 주변 아군을 크게 강화하고 직접 후려친다.',
    // 체력을 **깎았다**(2026-07-29). 사용자 신고: "보스도 그냥 뺑뺑이만 돌리다 끝났어."
    //   원인은 강함이 아니라 **모양**이었다 — 체력 1420~1500 에 위협 수단이 없으니
    //   '길고 안전한 체력 깎기'가 됐다(사냥꾼 20층 꼬리 22.2초).
    //   위 능력으로 위협을 주고 체력을 줄여 **짧고 무서운** 쪽으로 옮긴다.
    //   실측(사냥꾼 20층): hp 1420 꼬리 22.2초 → 1050 17.5초 → 900 13.6초.
    cost: 0, hp: 312, armor: 26, speed: 96, range: 96, damage: 73, cooldown: 1300,
    guard: { every: 13000, warn: 1100, ms: 3400, cut: 0.20, reflect: 0.35 },
    attack: 'melee', coneDeg: 110,
    buffRadius: 250, buffDamageMul: 1.45,
    radius: 27, shape: 'star', weapon: 'pistol',
    chase: 420, aggro: 420,
    // 성난 돌진 — 속도 96 으로는 사냥꾼(178)을 영원히 못 잡는다. 보스가 '거리를 지우는
    // 수단'을 하나도 안 가진 게 뺑뺑이의 구조적 원인이었다. 예고 520ms 라 피할 수 있다.
    ability: { type: 'charge', cooldown: 6500, telegraph: 520,
               minRange: 150, maxRange: 460, dist: 460,
               damage: 299, radius: 62, knockback: 46 }
  },

  bossShell: {
    key: 'bossShell', name: '껍질 골렘', art: 'guardian', isBoss: true,
lore: '버려진 알 껍질을 뒤집어쓴 커다란 것. 느리지만 한 번 스치면 그대로 밀려난다.',
    desc: '두꺼운 껍질 덩어리. 느리지만 닿으면 밀려난다.',
    // 체력을 **깎았다**(2026-07-29). 사용자 신고: "보스도 그냥 뺑뺑이만 돌리다 끝났어."
    //   원인은 강함이 아니라 **모양**이었다 — 체력 1420~1500 에 위협 수단이 없으니
    //   '길고 안전한 체력 깎기'가 됐다(사냥꾼 20층 꼬리 22.2초).
    //   위 능력으로 위협을 주고 체력을 줄여 **짧고 무서운** 쪽으로 옮긴다.
    //   실측(사냥꾼 20층): hp 1420 꼬리 22.2초 → 1050 17.5초 → 900 13.6초.
    cost: 0, hp: 312, armor: 26, speed: 78, range: 104, damage: 90, cooldown: 1600,
    guard: { every: 12000, warn: 950, ms: 4000, cut: 0.15, reflect: 0.45 },
    attack: 'melee', coneDeg: 130,
    radius: 30, shape: 'shield', weapon: 'riotShield',
    chase: 460, aggro: 460,
    // 껍질 구르기 — 셋 중 가장 느린 놈(속도 78)이라 거리 지우기가 가장 절실하다.
    // 예고가 길고(900ms) 대신 가장 멀리 굴러오며 가장 세게 민다 —
    // '느리지만 한 번 스치면 그대로 밀려난다'는 소개 문구 그대로다.
    // 쿨 7500 → **5200**. 체력을 950 으로 깎았더니 폰 프로필에서 20층 보스가 이웃보다
    //   쉬워졌다(R-3 +3%p 실패). 되돌리는 길은 둘이었다 — 체력을 1250 으로 올리거나(-4%p)
    //   구르기를 더 자주 하거나(-2%p). **후자를 골랐다**: 체력을 올리면 방금 줄인 꼬리가
    //   도로 길어진다(사냥꾼 20층 14.8초 → 19.8초). 보스는 두꺼워서가 아니라
    //   무서워서 어려워야 한다는 것이 이번 변경의 요지다.
    ability: { type: 'charge', cooldown: 5200, telegraph: 900,
               minRange: 160, maxRange: 580, dist: 580,
               damage: 388, radius: 76, knockback: 92 }
  },

  bossNest: {
    key: 'bossNest', name: '둥지 포탑', art: 'ballista', isBoss: true,
lore: '산 위에 놓인 거대한 둥지. 쉬지 않고 온 골짜기에 화살을 뿌린다.',
    desc: '움직이지 않는 거대 둥지. 맵 전체에 쉬지 않고 쏘아댄다.',
    // 체력을 **깎았다**(2026-07-29). 사용자 신고: "보스도 그냥 뺑뺑이만 돌리다 끝났어."
    //   원인은 강함이 아니라 **모양**이었다 — 체력 1420~1500 에 위협 수단이 없으니
    //   '길고 안전한 체력 깎기'가 됐다(사냥꾼 20층 꼬리 22.2초).
    //   위 능력으로 위협을 주고 체력을 줄여 **짧고 무서운** 쪽으로 옮긴다.
    //   실측(사냥꾼 20층): hp 1420 꼬리 22.2초 → 1050 17.5초 → 900 13.6초.
    // ⚠ 체급표 통일(2026-08-02) — 보스 층 지수를 없애면서 기본값을 한 눈금 위에 올렸다.
    //   이 보스만 쿨다운 520ms 로 매우 빠르므로 **한 방 피해는 낮게** 유지한다
    //   (다른 보스 기준으로 30 을 주면 초당 피해가 2.5배가 된다).
    cost: 0, hp: 322, armor: 22, speed: 0, range: 0, rangeSpan: true,
    guard: { every: 12500, warn: 1000, ms: 3600, cut: 0.18, reflect: 0.40 },
    damage: 29, cooldown: 520,
    attack: 'projectile', projectileSpeed: 300, projectileRadius: 8,
    radius: 26, shape: 'bunker', weapon: 'mg',
    chase: 0, aggro: 0, immobile: true,
    // 화살비 — 움직일 수 없으니 거리를 지우는 대신 **설 자리를 지운다.**
    // 예고 원 3개가 시차를 두고 떨어져서, 서 있으면 맞고 계속 움직이면 피한다.
    ability: { type: 'barrage', cooldown: 6800, telegraph: 640,
               minRange: 0, maxRange: 4000,
               damage: 130, radius: 104, repeat: 3, interval: 430, spread: 230 }
  }
};

for (var _bk in GAME.BOSS_UNITS) GAME.UNITS[_bk] = GAME.BOSS_UNITS[_bk];

GAME.isBoss = function (def) { return !!(def && def.isBoss); };

// 플레이어 팔레트 · AI 뽑기 풀. **보스는 여기 없다.**
GAME.UNIT_ORDER = [
  'bayonet', 'rifleman', 'grenadier', 'sniper',
  'shieldman', 'medic', 'sergeant', 'chemtrooper', 'mgnest', 'mine'
];

// 이 유닛의 공격이 **자동명중(회피 불가)** 인가. 지금은 투창병 하나뿐이다.
//
// ⚠ 예전 이름은 `isNonTarget` 이었고 그게 **버그 두 개를 만들었다**(2026-07-30, 둘 다 실측).
//   "논타겟 공격을 한다"는 뜻인데 이름이 "조준 대상이 아니다(= 함정·고정물이다)"로 읽혀서:
//     · `battle.js` 의 껍질 금(체력) 가드가 `!isNonTarget` 이라 **투창병에게만** 금이 갔다
//       — "체력을 읽지 않고 보게 한다"는 이 게임의 문법이 사실상 죽어 있었다(호출 1 → 14).
//     · 새로 만든 발밑 진영 링도 같은 가드를 써서 **호출 0** 이었다(대상 14기 전부 걸러짐).
//   게다가 사용처 전부가 `!GAME.isNonTarget(...)` 이중부정이었다 — 부정 없이 쓰는 곳이
//   하나도 없었다. 그래서 뜻대로 뒤집어 이름을 바꿨다. **되돌리지 말 것.**
//   '함정·지면 고정물인가'를 묻고 싶으면 `GAME.UI.artOf(def).ground` 를 쓴다.
GAME.isAutoHit = function (def) {
  return def.attack === 'targeted';
};

// rangeSpan 이 붙은 정의는 사거리를 맵 대각선으로 채운다.
// units.js 가 config.js 뒤에 로드되므로 여기서 한 번만 계산해 박아둔다.
(function () {
  for (var k in GAME.UNITS) {
    if (GAME.UNITS[k].rangeSpan) GAME.UNITS[k].range = GAME.CONFIG.MAP_SPAN;
  }
})();

// 스탯 막대 표시용. max 는 아래에서 유닛 전체 최댓값으로 자동 채운다.
GAME.STAT_DEFS = [
  { key: '공격력', get: function (d) { return d.damage; }, fmt: function (d) { return d.damage ? String(d.damage) : '—'; } },
  { key: '공격속도', get: function (d) { return d.damage ? 1000 / d.cooldown : 0; }, fmt: function (d) { return d.damage ? (1000 / d.cooldown).toFixed(2) + '/s' : '—'; } },
  { key: '체력', get: function (d) { return d.hp; }, fmt: function (d) { return String(d.hp); } },
  { key: '방어력', get: function (d) { return d.armor; }, fmt: function (d) { return String(d.armor); } },
  { key: '이동속도', get: function (d) { return d.speed; }, fmt: function (d) { return d.speed ? String(d.speed) : '고정'; } }
];

(function () {
  for (var i = 0; i < GAME.STAT_DEFS.length; i++) {
    var sd = GAME.STAT_DEFS[i], max = 0;
    for (var k = 0; k < GAME.UNIT_ORDER.length; k++) {
      var v = sd.get(GAME.UNITS[GAME.UNIT_ORDER[k]]);
      if (v > max) max = v;
    }
    sd.max = max || 1;
  }
})();
