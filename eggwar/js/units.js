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
    cost: 10, hp: 240, armor: 30, speed: 135, range: 52, damage: 38, cooldown: 800,
    attack: 'melee', coneDeg: 90, radius: 13, shape: 'square', weapon: 'bayonet',
    chase: 270, aggro: 210,
    // 달려들기 — 가장 흔한 유닛이라 **압박의 밀도를 정하는 건 사실상 이 값이다.**
    // 속도 135 로는 사냥꾼(178)을 못 잡아 그냥 뒤를 따라다니는 배경이었다.
    // 쿨 9초로 길게 잡되 초기 쿨이 유닛마다 흩어지므로(runAbility) 여러 기가 있으면
    // 번갈아 들어온다 — "쉴 새 없이 뭔가 온다"는 밀도를 물량이 아니라 시차로 만든다.
    // 피해는 작게(22). 이 능력의 일은 죽이는 게 아니라 **가만히 못 있게 하는 것**이다.
    ability: { type: 'charge', cooldown: 9000, telegraph: 450,
               minRange: 110, maxRange: 210, dist: 210,
               damage: 22, radius: 36, knockback: 16 }
  },

  rifleman: {
    key: 'rifleman', name: '궁수', art: 'archer',
lore: '숲에서 새알을 노리던 사냥꾼. 화살은 곧게 날아가니 길목을 미리 잡아야 맞는다.',
    desc: '단궁. 논타겟 직선 사격이라 보고 피할 수 있다.',
    cost: 15, hp: 140, armor: 10, speed: 115, range: 330, damage: 41, cooldown: 1300,
    attack: 'projectile', projectileSpeed: 240, projectileRadius: 6,
    radius: 11, shape: 'triangle', weapon: 'rifle',
    chase: 150, aggro: 360, spacing: 38,
    // 정조준 — **멀리 서 있는 것을 벌하는 유일한 수단.**
    // 사용자 신고 1번("궁수가 너무 유리해")의 구조적 원인은 사거리 340 짜리 영웅이
    // 아무 대가 없이 거리를 유지할 수 있다는 것이었다(반응요구 63% vs 근접 90%).
    // 돌진은 원거리 영웅에게 안 통한다 — 붙기 전에 또 물러나면 그만이다.
    // 그래서 **거리를 유지해도 닿는 것**을 하나 만든다: 발밑에 그림자가 지고,
    // 그 자리에 계속 서 있으면 맞는다. 피하는 법은 하나뿐 — 움직이는 것.
    ability: { type: 'barrage', cooldown: 10000, telegraph: 640,
               minRange: 150, maxRange: 900,
               damage: 46, radius: 72, repeat: 1,
               // 예측 사격 계수 — 진행 방향으로 미리 쏜다(combat.js 주석 참조)
               aimLead: 0.75 }
  },

  grenadier: {
    key: 'grenadier', name: '투석꾼', art: 'slinger',
lore: '강가의 둥근 돌만 골라 담는 무릿매꾼. 겨눈 자리에 그림자가 지고, 못 피한 것만 부순다.',
    desc: '무릿매로 돌을 날린다. 예고 후 터지는 광역 — 구역을 봉쇄한다.',
    cost: 25, hp: 120, armor: 5, speed: 95, range: 300, damage: 69, cooldown: 2500,
    attack: 'aoe', aoeRadius: 62, telegraph: 900,
    radius: 12, shape: 'diamond', weapon: 'launcher',
    chase: 130, aggro: 330, spacing: 41,
    // 2026-07-31 · 스킬 신설. 정체성(구역 봉쇄)을 그대로 키운다 —
    // 한 발이 아니라 **세 발을 흩어 떨어뜨려** 서 있을 자리를 지운다.
    // 피해는 평타(69)보다 낮게 잡는다. 이 스킬의 일은 죽이는 게 아니라 **쫓아내는 것**이다.
    ability: { type: 'barrage', cooldown: 11000, telegraph: 700,
               minRange: 120, maxRange: 900,
               damage: 38, radius: 66, repeat: 3, spread: 190, interval: 380,
               // 예측 사격 계수 — 진행 방향으로 미리 쏜다(combat.js 주석 참조)
               aimLead: 0.55 }
  },

  sniper: {
    key: 'sniper', name: '투창병', art: 'spearman',
lore: '한 번 던지면 반드시 박히는 미늘 작살. 대신 다시 던질 때까지 오래 숨을 고른다.',
    desc: '미늘 작살. 던지면 반드시 맞는다. 비싼 대신 회피 불가.',
    cost: 40, hp: 100, armor: 5, speed: 90, range: 420, damage: 81, cooldown: 3000,
    attack: 'targeted', bulletSpeed: 760,
    radius: 11, shape: 'hex', weapon: 'sniperRifle',
    chase: 110, aggro: 440, spacing: 38,
    // 2026-07-31 · 스킬 신설. 이미 자동명중이라 '맞추는 것'을 더 줘도 의미가 없다 →
    // **예고가 보이는 큰 한 방**을 준다. 피할 수 있게 만들어 자동명중과 결이 달라진다.
    ability: { type: 'barrage', cooldown: 13000, telegraph: 900,
               minRange: 160, maxRange: 900,
               damage: 96, radius: 82, repeat: 1,
               // 예측 사격 계수 — 진행 방향으로 미리 쏜다(combat.js 주석 참조)
               aimLead: 0.7 }
  },

  // ── 지원 계열 ──────────────────────────────────────────────
  medic: {
    key: 'medic', name: '약초꾼', art: 'herbalist',
lore: '약초를 씹어 상처에 붙이는 손. 스스로는 안 싸우지만 주변의 알들이 잘 안 깨진다.',
    desc: '약초로 주변 아군을 주기적으로 회복시킨다. 스스로는 안 싸운다.',
    cost: 30, hp: 130, armor: 10, speed: 105, range: 0, damage: 0, cooldown: 1000,
    attack: 'none',
    healRadius: 150, healPerTick: 14, healInterval: 1000,
    radius: 11, shape: 'cross', weapon: 'aidkit',
    chase: 140, aggro: 0,
    // 2026-07-31 · 스킬 신설. 공격하지 않는 유닛이라 피해 스킬은 정체성을 깬다 →
    // **주변 아군을 한 번에 크게 회복**시킨다. 진형이 무너지기 직전을 되돌리는 장치라,
    // 컨트롤러에게 '약초꾼을 먼저 끊어야 한다'는 처치 순서를 강제한다.
    ability: { type: 'healBurst', cooldown: 14000, telegraph: 500,
               radius: 190, heal: 130 }
  },

  shieldman: {
    key: 'shieldman', name: '방패병', art: 'shieldman',
lore: '통나무를 깎아 만든 대방패. 날아오는 것을 대신 받아 뒷줄의 약한 알들을 살린다.',
    desc: '나무 대방패로 아군에게 갈 투사체를 대신 맞는다. 공격력은 낮다.',
    cost: 25, hp: 420, armor: 45, speed: 100, range: 50, damage: 12, cooldown: 1100,
    attack: 'melee', coneDeg: 80,
    intercept: 46,          // 이 반경 안을 지나는 적 투사체를 대신 맞는다
    radius: 15, shape: 'shield', weapon: 'riotShield',
    chase: 200, aggro: 240,
    // 방패 돌진 — 사용자 신고("뺑뺑이 돌리다 방패병만 남는다")에 대한 답.
    // 방패병은 유효 체력 609(비보스 최고)에 속도 100 이라, 사거리 340 짜리 영웅에게는
    // **19초짜리 벽**이었다(사냥꾼 유효 피해 16.5 × 쿨 750ms). 체력을 깎으면 존재 이유가
    // 사라지고, 그대로 두면 지루하다. 그래서 **거리를 지우는 수단**을 줬다 —
    // 이제 방패병은 맞아주는 물건이 아니라 '피해야 하는 순간'을 만든다.
    ability: { type: 'charge', cooldown: 8000, telegraph: 520,
               minRange: 120, maxRange: 270, dist: 270,
               damage: 30, radius: 44, knockback: 24 }
  },

  sergeant: {
    key: 'sergeant', name: '족장', art: 'chieftain',
lore: '소뿔 투구를 쓰고 앞장서는 우두머리. 그가 보고 있는 동안 부족이 더 세게 친다.',
    desc: '소뿔 투구를 쓴 우두머리. 주변 아군의 공격력을 올린다. 진형의 심장.',
    cost: 35, hp: 170, armor: 20, speed: 110, range: 240, damage: 23, cooldown: 1500,
    attack: 'projectile', projectileSpeed: 260, projectileRadius: 5,
    buffRadius: 190, buffDamageMul: 1.30,
    radius: 12, shape: 'star', weapon: 'pistol',
    chase: 160, aggro: 300, spacing: 41,
    // 2026-07-31 · 스킬 신설. 상시 버프(1.30)가 정체성이므로 **일시적으로 더 크게** 준다.
    // 포효가 터지면 그 몇 초가 진형의 화력 정점이다 — 그때 붙어 있으면 위험하다는 신호.
    ability: { type: 'warcry', cooldown: 15000, telegraph: 600,
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
    cost: 45, hp: 300, armor: 25, speed: 0, range: 0, rangeSpan: true, damage: 30, cooldown: 420,
    attack: 'projectile', projectileSpeed: 340, projectileRadius: 5,
    radius: 14, shape: 'bunker', weapon: 'mg',
    chase: 0, aggro: 0,       // 고정
    immobile: true,
    // 2026-07-31 · 스킬 신설. 못 움직이는 대신 **집중 사격**으로 한 구역을 지운다.
    // 고정물이라 컨트롤러가 위치만 바꾸면 피할 수 있다 — 대가가 분명한 스킬이다.
    ability: { type: 'barrage', cooldown: 12000, telegraph: 620,
               minRange: 100, maxRange: 900,
               damage: 44, radius: 58, repeat: 4, spread: 150, interval: 300,
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
    cost: 38, hp: 130, armor: 10, speed: 100, range: 390, damage: 21, cooldown: 2200,
    attack: 'projectile', projectileSpeed: 210, projectileRadius: 9,
    slowMul: 0.45, slowMs: 3000,
    radius: 12, shape: 'diamond', weapon: 'launcher',
    chase: 140, aggro: 320, spacing: 41,
    // 2026-07-31 · 스킬 신설. 둔화가 정체성이므로 **넓게 한 번에** 건다.
    // 카이팅(거리를 벌리는 답)을 직접 벌주는 유일한 전략 유닛 스킬이다.
    ability: { type: 'barrage', cooldown: 13000, telegraph: 760,
               minRange: 120, maxRange: 900,
               damage: 26, radius: 110, repeat: 1, slowMul: 0.5, slowMs: 2600,
               // 예측 사격 계수 — 진행 방향으로 미리 쏜다(combat.js 주석 참조)
               aimLead: 0.85 }
  },

  mine: {
    key: 'mine', name: '가시덫', art: 'snaretrap',
lore: '마른 풀로 덮어둔 뼈 가시 함정. 밟기 전까지는 거기 있는 줄 아무도 모른다.',
    desc: '보이지 않는다. 밟으면 잠깐 뒤 크게 터진다 — 걸어서는 못 벗어난다.',
    cost: 35, hp: 40, armor: 0, speed: 0, range: 0, damage: 0, cooldown: 999999,
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
    cost: 0, hp: 1150, armor: 30, speed: 92, range: 104, damage: 60, cooldown: 1250,
    attack: 'melee', coneDeg: 120,
    radius: 29, shape: 'star', weapon: 'riotShield',
    chase: 460, aggro: 460,
    ability: { type: 'charge', cooldown: 6000, telegraph: 560,
               minRange: 150, maxRange: 500, dist: 500,
               damage: 86, radius: 70, knockback: 58 }
  },

  bossDrakeAsh: {
    key: 'bossDrakeAsh', name: '잿날개', art: 'beast:drake:ash', isBoss: true,
    lore: '용이 거느린 것 중 가장 작은 것. 그런데도 부족 하나를 하룻밤에 지웠다.',
    desc: '용의 부하. 낮게 날아와 덮치고, 재를 흩뿌린다.',
    cost: 0, hp: 1250, armor: 30, speed: 118, range: 112, damage: 66, cooldown: 1150,
    attack: 'melee', coneDeg: 110,
    radius: 30, shape: 'star', weapon: 'rifle',
    chase: 560, aggro: 560,
    // 급강하 — 가장 빠른 놈이라 거리를 더 멀리 지운다. 예고는 짧지만 사거리가 길다.
    ability: { type: 'charge', cooldown: 5000, telegraph: 480,
               minRange: 170, maxRange: 640, dist: 640,
               damage: 96, radius: 78, knockback: 70 }
  },

  bossDrakeFrost: {
    key: 'bossDrakeFrost', name: '서리 권속', art: 'beast:drake:frost', isBoss: true,
    lore: '숨을 뱉으면 골짜기가 하얗게 언다. 얼어붙은 것은 다시 움직이지 못한다.',
    desc: '서리를 뿌리는 권속. 넓은 자리를 얼려 발을 묶는다.',
    cost: 0, hp: 1320, armor: 34, speed: 104, range: 120, damage: 70, cooldown: 1250,
    attack: 'melee', coneDeg: 120,
    radius: 30, shape: 'star', weapon: 'riotShield',
    chase: 560, aggro: 560,
    ability: { type: 'barrage', cooldown: 6200, telegraph: 700,
               minRange: 0, maxRange: 4000,
               damage: 78, radius: 130, repeat: 3, interval: 400, spread: 250 }
  },

  bossDrakeStorm: {
    key: 'bossDrakeStorm', name: '폭풍 권속', art: 'beast:drake:storm', isBoss: true,
    lore: '날개 한 번에 하늘이 갈린다. 용이 오기 전에 길을 여는 것이 이것의 일이다.',
    desc: '폭풍을 몰고 오는 권속. 하늘에서 연달아 내리꽂는다.',
    cost: 0, hp: 1400, armor: 34, speed: 126, range: 116, damage: 74, cooldown: 1100,
    attack: 'melee', coneDeg: 115,
    radius: 31, shape: 'star', weapon: 'rifle',
    chase: 620, aggro: 620,
    ability: { type: 'barrage', cooldown: 5400, telegraph: 560,
               minRange: 0, maxRange: 4000,
               damage: 88, radius: 118, repeat: 4, interval: 320, spread: 300 }
  },

  bossDragonClaw: {
    key: 'bossDragonClaw', name: '용의 발톱', art: 'beast:claw:ember', isBoss: true,
    lore: '땅을 뚫고 올라온 것은 발톱 하나뿐이다. 나머지는 아직 아래에 있다.',
    desc: '용의 발톱. 이것 하나가 진형을 통째로 긁어낸다.',
    // 움직이지 않는다 — **크기로** 위협한다. 대신 닿는 범위가 압도적으로 넓다.
    cost: 0, hp: 1800, armor: 40, speed: 0, range: 190, damage: 110, cooldown: 1500,
    attack: 'melee', coneDeg: 150,
    radius: 32, shape: 'bunker', weapon: 'riotShield',
    chase: 0, aggro: 0, immobile: true,
    ability: { type: 'barrage', cooldown: 5600, telegraph: 760,
               minRange: 0, maxRange: 4000,
               damage: 104, radius: 150, repeat: 4, interval: 360, spread: 330 }
  },

  bossDragonLord: {
    key: 'bossDragonLord', name: '태초의 용', art: 'beast:dragon:ember', isBoss: true,
    lore: '계란 부족이 서로를 치는 동안, 그것은 산 아래에서 자고 있었다. 이제 깨어났다.',
    desc: '태초의 용. 날개 한 번에 전장이 뒤집힌다.',
    cost: 0, hp: 2600, armor: 44, speed: 108, range: 170, damage: 130, cooldown: 1300,
    attack: 'melee', coneDeg: 140,
    radius: 34, shape: 'star', weapon: 'riotShield',
    chase: 720, aggro: 720,
    // 둘을 다 가진 유일한 보스 — 거리도 지우고 설 자리도 지운다.
    ability: { type: 'barrage', cooldown: 5000, telegraph: 620,
               minRange: 0, maxRange: 4000,
               damage: 120, radius: 160, repeat: 5, interval: 300, spread: 360 }
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
    cost: 0, hp: 1000, armor: 26, speed: 96, range: 96, damage: 52, cooldown: 1300,
    attack: 'melee', coneDeg: 110,
    buffRadius: 250, buffDamageMul: 1.45,
    radius: 27, shape: 'star', weapon: 'pistol',
    chase: 420, aggro: 420,
    // 성난 돌진 — 속도 96 으로는 사냥꾼(178)을 영원히 못 잡는다. 보스가 '거리를 지우는
    // 수단'을 하나도 안 가진 게 뺑뺑이의 구조적 원인이었다. 예고 520ms 라 피할 수 있다.
    ability: { type: 'charge', cooldown: 6500, telegraph: 520,
               minRange: 150, maxRange: 460, dist: 460,
               damage: 74, radius: 62, knockback: 46 }
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
    cost: 0, hp: 950, armor: 26, speed: 78, range: 104, damage: 68, cooldown: 1600,
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
               damage: 92, radius: 76, knockback: 92 }
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
    cost: 0, hp: 1020, armor: 22, speed: 0, range: 0, rangeSpan: true,
    damage: 44, cooldown: 520,
    attack: 'projectile', projectileSpeed: 300, projectileRadius: 8,
    radius: 26, shape: 'bunker', weapon: 'mg',
    chase: 0, aggro: 0, immobile: true,
    // 화살비 — 움직일 수 없으니 거리를 지우는 대신 **설 자리를 지운다.**
    // 예고 원 3개가 시차를 두고 떨어져서, 서 있으면 맞고 계속 움직이면 피한다.
    ability: { type: 'barrage', cooldown: 6800, telegraph: 640,
               minRange: 0, maxRange: 4000,
               damage: 52, radius: 104, repeat: 3, interval: 430, spread: 230 }
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
