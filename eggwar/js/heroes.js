window.GAME = window.GAME || {};

// 컨트롤러가 조작하는 영웅. 진형 전체(10기 이상)를 혼자 상대해야 하므로
// 일반 유닛과는 체급이 다르다 — 레이드 보스에 가깝다.
//
// 각 QWER 슬롯마다 **3가지 선택지**가 있고, 전투 전에 하나씩 고른다.
// 같은 영웅이라도 조합에 따라 플레이가 달라지게 하는 게 목적.
//
// 스킬 타입(원시 동작 조합):
//   dash        순간 이동 + 경로 피해
//   aoeSelf     자기 주변 즉발 광역
//   aoeTarget   지정 위치 예고 후 폭발(반복 가능)
//   projectile  직선 투사체(관통 여부)
//   strike      단일 대상 강타(흡혈 배수 적용)
//   buff        방어력/이동속도/보호막 일시 상승
//   aura        일정 시간 주변 지속 피해
//   pull        전방 원뿔 내 적을 끌어당김 + 피해
//   trap        지면에 설치, 밟으면 피해 + 속박
//
// ── 영웅 비용은 **공통 상수 하나**다 (2026-07-28) ─────────────────────────────
// 예전에는 영웅마다 cost 가 달랐다(광전사 75 / 사냥꾼 85 / 파수꾼 75). 그런데 그 가격차는
// 밸런스 축으로 **작동하지 않았다** — 아이템 예산이 남으면 자동으로 더 비싼 아이템을 사므로
// 10원 차이는 아이템 한 단계로 흡수됐고, 대신 "누가 얼마인가"라는 정보가 준비 화면에서
// 강함의 신호처럼 읽혀 오해만 만들었다. 강함은 스탯으로 말하는 게 맞다.
// 값 78 은 옛 3종 평균가(75/85/75 = 78.3)와 같게 잡은 것이다 —
// `maxSpendable()` 이 260 → 253 으로만 움직이고 나머지 예산 상수(Tower.BASE_BUDGET 100,
// Tower.HERO_BASE_BUDGET 135, DefendTower.BASE_BUDGET 160·HERO_BASE 90 …)는 그대로 유효하다.
GAME.HERO_BASE_COST = 78;

// ── 세 영웅을 **같은 체급**으로 맞췄다 (2026-07-28, 실측 기반) ────────────────
// 문제: v0.34 에서 수성의 탑이 `HERO_DIFF { vanguard 1.04, ranger 1.27, warden 0.88 }`
//   라는 보정 상수로 영웅별 강함 차이를 덮고 있었다. 그 상수 자체가 증거다 —
//   **사냥꾼은 27% 부족하고 파수꾼은 12% 과했다**(값이 클수록 그 영웅을 버프해야
//   같은 난이도가 됐다는 뜻이다. 흔히 반대로 읽는데, 큰 값 = 약한 영웅이다).
//   보정은 수성의 탑 안에서만 걸리므로 통곡의 탑·비동기 대전에서는 격차가 그대로 남았다.
//
// 측정 방법: `node tools/defend-curve.js mode=avg rep=12 floors=4,8,12,20,30
//            hdiff=vanguard:1,ranger:1,warden:1` (보정을 끄고 원형 10종 평균 방어율).
//   방어율이 높다 = 전략가가 잘 막는다 = **그 영웅이 약하다.**
//   보정 끄고 잰 값(사거리 버프 후):
//     광전사 60/53/23/0/0 · 사냥꾼 51/55/49/12/11 · 파수꾼 41/28/22/0/0  → 편차 최대 27%p
//   즉 파수꾼이 가장 세고 사냥꾼이 가장 약했다.
//
// 고친 축과 **왜 그 축인가**:
//   · 사냥꾼(가장 약함) — 체력 620→860, 방어력 12→20, 공격력 20→26.
//     유효 체력이 694 로 다른 둘의 절반이라 층이 오를수록(적 체력·공격이 배수로 자람)
//     혼자만 무너졌다. **원거리라는 정체성은 사거리 340·최고 공속이 지키므로**
//     내구도와 화력을 올려도 원거리형은 유지된다.
//   · 파수꾼(가장 셈) — 체력 1052→900, 방어력 34→26. 흡혈(0.15)·부채꼴(90°)은 손대지 않았다.
//     `config.js` 의 계측 기록대로 **흡혈은 이 격차의 원인이 아니다**(단일 대상 회복이
//     다중 명중보다 크다). 원인은 유효 내구도라 거기만 깎았다.
//   · 광전사 — 공격력 22→26, 체력 900→860. 4층에서 체력을 올려도 방어율이 60% 에서
//     꿈쩍하지 않았는데(900/960/990/1050 전부 60%) 공격력만 올리자 60→54→51 로 움직였다.
//     즉 광전사의 저층 약점은 '못 버텨서'가 아니라 **'못 끝내서'**였다. 돌격형이니 화력 축이 맞다.
//
// 결과: 세 영웅의 **유효 체력(hp × (1 + armor/100))이 1032~1161 로 모인다.**
//   광전사 1161 · 사냥꾼 1032 · 파수꾼 1134. 예전에는 694 ~ 1410(2.0배)였다.
//   보정 없이 잰 편차가 27%p → **16%p** 로 줄어서 `HERO_DIFF` 를 1.00 으로 평탄화했다.
//   ⚠ 0 은 못 된다 — 격차는 층의 함수다(광전사는 저층에서 약하고 고층에서 강하다).
//     상수 하나로 전 구간을 맞출 수 없다는 `defendtower.js` 의 경고는 여전히 유효하다.
//
// ── 근접 사거리 버프 (같은 날, 사용자 요청) ──────────────────────────────────
//   광전사 62→82, 파수꾼 64→84 (+32%). "난전에서 둘러싸여 다굴당하는 걸 줄이자."
//   ⚠ v0.34 의 파수꾼 너프가 '부채꼴·사거리'였으므로(120°/72 → 90°/64 로 줄여
//     무조작 4층 돌파 13%→0%) 되돌리면 무조작 돌파가 살아날 위험이 있었다. 실측했다:
//     사거리만 62/64 → 82/84 로 올렸을 때 파수꾼 방어율 4층 36%→41% 로 **오히려 약해졌다**.
//     사거리가 길어지면 진형 앞에서 멈춰 선봉만 긁고, 안으로 파고들지 않기 때문이다.
//     부채꼴(coneDeg)은 건드리지 않았다 — 너프의 핵심은 각도 쪽이었고 그건 그대로다.
//
// ── 2026-07-29 · **초당 화력(DPS)도 같은 체급으로 모았다** ────────────────────
// 증상: 수성의 탑에서 **유닛 레벨이 오를수록 영웅 간 편차가 벌어졌다.**
//   `node tools/defend-curve.js mode=avg rep=24 lv=1` → 최대 편차 17%p (통과)
//   `node tools/defend-curve.js mode=avg rep=24 lv=5` → 최대 편차 **24%p @15층** (SC-3 실패)
//   그 층 값: 광전사 58% / 사냥꾼 34% / 파수꾼 58%.
//
// 계측 ① — **hp 축과 damage 축을 따로 돌렸다**(15층, 원형 10종, rep24):
//     L1(1.00/1.00)      18 / 29 / 15   편차 14%p
//     L5-hp만 (1.29/1.00) 39 / 30 / 38   편차  9%p
//     L5-dmg만(1.00/1.21) 35 / 32 / 27   편차  8%p
//     L5      (1.29/1.21) 57 / 34 / 58   편차 **24%p**
//   → 한 축씩 주면 편차가 안 생긴다. **두 축을 곱한 크기**에서만 터진다.
//     즉 특정 축이 범인이 아니라 '진형이 세지는 총량'이 범인이다.
//
// 계측 ② — **원형별로 쪼개니 칸이 전부 0% 아니면 100%였다**(15층, rep24):
//     쇠뇌진지  L1 광0/사0/파0  → L5 광100/사**0**/파100
//     궁수떼    L1 광0/사0/파0  → L5 광100/사**0**/파 96
//     전사뭉텅이 L1 광0/사**100**/파0 → L5 광100/사100/파83
//   원형 평균 방어율은 사실상 **"열 원형 중 몇 개가 뒤집혔는가"의 개수**다(칸당 10%p).
//   그래서 편차는 연속량이 아니라 **문턱을 넘은 원형 수의 차이**다.
//
// 계측 ③ — 결말을 쪼개보니 **시간초과(무승부)는 0판**이었다. 전부 '영웅 사망' 아니면
//   '진형 전멸'로 끝난다. 즉 문턱은 시계가 아니라 **영웅의 처리량 대 피격량**이다.
//   15층 쇠뇌진지에서 진형을 전멸시키는 데 걸린 시간: 광전사 23초 / 사냥꾼 **17초** / 파수꾼 24초.
//   L5 로 진형 총 hp 가 1200→1548 이 되자 필요 시간이 28/21/29 초로 늘고,
//   **광전사·파수꾼만 그 전에 죽었다**(사냥꾼은 그대로 전멸시킴).
//   실효 dps(초당 진형에 넣은 피해)는 52 / 69 / 51 — 사냥꾼이 33% 높다.
//   흩어져 고정된 표적(쇠뇌 진지는 nx 0.12~0.88 에 퍼져 있고 사거리가 맵 전체다)은
//   근접 영웅에게 **이동 시간이라는 죽은 시간**을 물리는데, 원거리는 그게 없기 때문이다.
//
// 결론(메커니즘): 유닛 레벨은 모든 영웅의 여유(margin)를 **같은 배수(1.29×1.21=1.56)로**
//   깎는다. 그런데 영웅마다 여유의 크기가 다르고, 원형별 승패가 문턱 함수라
//   여유가 얇은 영웅부터 원형이 우수수 뒤집힌다. **여유 차이의 뿌리는 초당 화력이었다** —
//   유효 체력은 이미 1032~1161 로 모아 놨는데 dps 는 광전사 28.9 / 사냥꾼 34.7 / 파수꾼 22.0
//   으로 **1.58배**나 벌어져 있었다. 유효 체력에 이어 남아 있던 마지막 비대칭 축이다.
//
// ⚠ **유닛 레벨 곡선(`js/unitlevel.js` MODS)을 깎는 것은 해법이 아니다** — 실측했다.
//   L5 를 1.29/1.14 로 낮추자 15층 편차는 21%p 로 줄었지만 8층이 **27%p 로 터졌다**
//   (파수꾼만 41% 로 주저앉는다). 편차는 버프 크기의 단조 함수가 아니라 문턱 통과 개수라,
//   버프를 줄이면 **다른 층에서 다른 원형이 뒤집힌다.** 원인은 영웅 쪽에 있다.
//
// 고친 축 (dps 1.58배 → **1.23배**, 유효 체력은 그대로 유지):
//   · 사냥꾼 damage 26→24 (dps 34.7→32.0). 위 계측에서 흩어진 원거리 진형을 혼자
//     33% 빠르게 지워 여유가 두 배였다. 사거리 340·공속 750ms 는 그대로라 원거리 정체성은 유지.
//   · 파수꾼 damage 22→26 (dps 22.0→26.0), hp 900→860 으로 상쇄.
//     낮은 화력이 25층에서 파수꾼만 무너뜨렸다(L5 25층: 광 24% / 사 24% / 파 **45%**).
//     내구도를 조금 떼어 화력에 옮긴 것이라 **총 체급은 그대로**다
//     (유효 체력 1134 → 1084, 여전히 셋 중 중간).
//   · 광전사는 손대지 않았다 — 이미 28.9 로 셋의 중앙값이다.
//
// 결과(원형 10종 평균, rep24 · 시드 2개): **L5 최대 편차 24%p → 17%p (SC-3 통과)**,
//   L1 은 17%p 그대로. 층별 평균 난이도 곡선도 거의 안 움직였다(아래 표는 CLAUDE.md 참조).
// ⚠ 4층 L1 편차 19%p 는 **이 변경 전과 같다.** 광전사가 저층에서 약한 성질(59% vs 40%)이
//   남아 있고, 그건 dps 축이 아니다. "격차 자체가 층의 함수"라는 경고는 여전히 유효하다.
GAME.HEROES = {
  vanguard: {
    key: 'vanguard',
    name: '광전사', art: 'berserker',
    trait: '돌격형',
    desc: '뼈 가시 볏을 세우고 뛰어든다. 양손 대검으로 쓸어담고, 두꺼워서 실수에 관대하다.',
    // 유효 체력 860 × 1.35 = 1161. 화력 축(damage 22→26)으로 저층 약점을 고쳤다.
    // 2026-07-29 · damage 26→28 (dps 28.9→31.1). 같은 논리의 연장이다 —
    //   유닛 L5 15층에서 흩어진 쇠뇌 진지를 지우는 데 광전사 28초 / 사냥꾼 21초가 걸려
    //   광전사만 그 전에 죽었다. 이동 시간이라는 죽은 시간을 화력으로 갚는다.
    hp: 860, armor: 35, damage: 28, cooldown: 900, speed: 155, range: 82,
    attack: 'melee', coneDeg: 100, lifesteal: 0.10,
    radius: 17, shape: 'square',
    skillOptions: {
      Q: [
        { name: '박치기', type: 'dash', dist: 230, damage: 44, radius: 55, cooldown: 8000 },
        { name: '대검 돌진', type: 'dash', dist: 150, damage: 68, radius: 70, cooldown: 9000 },
        { name: '흙먼지 은신', type: 'dash', dist: 300, damage: 0, radius: 0, cooldown: 6000 }
      ],
      W: [
        { name: '대검 회전', type: 'aoeSelf', radius: 88, damage: 50, cooldown: 11000 },
        { name: '후려치기', type: 'pull', coneDeg: 100, dist: 170, damage: 56, cooldown: 10000 },
        { name: '모래 뿌리기', type: 'aoeSelf', radius: 130, damage: 24, rootMs: 1300, cooldown: 13000 }
      ],
      E: [
        { name: '가죽 두르기', type: 'buff', armorAdd: 45, speedMul: 0.85, duration: 3500, cooldown: 14000 },
        { name: '광폭화', type: 'buff', damageMul: 1.55, speedMul: 1.15, duration: 4000, cooldown: 16000 },
        { name: '약초 씹기', type: 'buff', healNow: 260, shield: 120, duration: 3000, cooldown: 15000 }
      ],
      R: [
        { name: '바위 내리치기', type: 'aoeSelf', radius: 150, damage: 84, knockback: 95, cooldown: 32000 },
        { name: '가시 함정', type: 'trap', damage: 152, radius: 90, rootMs: 1500, life: 20000, cooldown: 26000 },
        { name: '낙석 유도', type: 'aoeTarget', radius: 140, damage: 48, repeat: 3, interval: 650, telegraph: 700, cooldown: 30000 }
      ]
    }
  },

  ranger: {
    key: 'ranger',
    name: '사냥꾼', art: 'hunter',
    trait: '원거리형',
    desc: '장궁으로 거리를 벌리며 싸운다. 빠르지만 얇아서 한 번 물리면 위험하다.',
    // 유효 체력 920 × 1.20 = 1104. 셋 중 여전히 가장 낮다 — '얇다'는 정체성은 남는다.
    // 860 → 920: 층 평균(4~40층 11개 층)으로 보면 860 일 때 사냥꾼만 방어율 평균 23.1% 로
    //   광전사 18.5 · 파수꾼 15.5 보다 높았다(= 혼자 약했다). 체력으로 올린 이유는
    //   공격력(26/0.75s = 34.7dps)이 이미 셋 중 1위라 더 올리면 원거리형이 아니라
    //   '딜러 원탑'이 되기 때문이다. 부족한 축은 처음부터 내구도였다.
    // damage 26→24 (2026-07-29): 초당 화력 34.7 → 32.0. 위 'DPS 체급 통일' 절 참조 —
    //   흩어진 원거리 진형을 근접보다 33% 빠르게 지워 유닛 레벨 버프를 혼자 흡수했다.
    hp: 920, armor: 20, damage: 24, cooldown: 750, speed: 178, range: 340,
    attack: 'projectile', projectileSpeed: 420, projectileRadius: 7, lifesteal: 0,
    radius: 15, shape: 'triangle',
    skillOptions: {
      Q: [
        { name: '관통 화살', type: 'projectile', damage: 54, speed: 520, pierce: true, radius: 9, cooldown: 8000 },
        { name: '연사', type: 'projectile', damage: 27, speed: 620, pierce: false, radius: 7, burst: 3, burstDelay: 110, cooldown: 7000 },
        { name: '불화살', type: 'aoeTarget', radius: 95, damage: 58, repeat: 1, telegraph: 500, cooldown: 9000 }
      ],
      W: [
        { name: '구르기', type: 'dash', dist: 210, damage: 0, radius: 0, cooldown: 5000 },
        { name: '도약', type: 'dash', dist: 330, damage: 0, radius: 0, cooldown: 8000 },
        { name: '뒷걸음 사격', type: 'dash', dist: 160, damage: 38, radius: 60, cooldown: 6500, backward: true }
      ],
      E: [
        { name: '올가미', type: 'trap', damage: 44, radius: 55, rootMs: 1400, life: 12000, cooldown: 11000 },
        { name: '끈끈이 덫', type: 'trap', damage: 16, radius: 90, rootMs: 2400, life: 14000, cooldown: 10000 },
        { name: '풀숲 위장', type: 'buff', armorAdd: 30, speedMul: 1.25, duration: 3000, cooldown: 12000 }
      ],
      R: [
        { name: '화살비', type: 'aoeTarget', radius: 115, damage: 27, repeat: 3, interval: 700, telegraph: 600, cooldown: 30000 },
        { name: '폭풍 화살', type: 'aoeTarget', radius: 180, damage: 21, repeat: 5, interval: 500, telegraph: 800, cooldown: 34000 },
        { name: '일격 화살', type: 'projectile', damage: 132, speed: 800, pierce: true, radius: 11, cooldown: 26000 }
      ]
    }
  },

  warden: {
    key: 'warden',
    name: '파수꾼', art: 'guardian',
    trait: '지속형',
    desc: '연꼴 방패와 갈고리 창으로 버틴다. 오래 싸워 이기는 쪽.',
    // 너프 근거(실측): 헌병대는 방어 관련 **모든 축에서 1위**였다 —
    // 최고 체력·최고 방어력·최고 흡혈·가장 넓은 부채꼴·가장 긴 근접 사거리·가장 싼 비용.
    // 낮은 공격력(17)이 페널티여야 하는데, 공격력은 흡혈의 입력값이라
    // 다중 타격으로 오히려 상쇄됐다. 표기 흡혈 25% 가 실측 유효 79% 로 뛰었다.
    // 정체성(버티는 지속형)은 남기되 축을 하나씩 떼어낸다.
    // 부채꼴·사거리가 핵심 너프다. 흡혈은 '한 방에 몇 기를 때리는가'로 증폭되므로,
    // 흡혈 수치를 깎는 것보다 **때리는 대상 수를 줄이는 쪽**이 원인을 직접 건드린다.
    // 120°/72 → 90°/64 로 줄이자 무조작 돌파가 사라졌다(4층 13%→0%).
    // 유효 체력 900 × 1.26 = 1134. 흡혈 0.15(최고)·부채꼴 90° 는 그대로 — 지속형은 유지.
    // damage 17→22: 낮은 공격력은 "모든 방어 축에서 1위"이던 시절의 **페널티**였다.
    //   내구도 우위를 걷어낸 지금은 페널티가 아니라 고층 붕괴 원인이 됐다 —
    //   적 체력이 층마다 배수로 자라는데 혼자 화력이 낮아 못 끝낸다(실측: 31층 방어율
    //   광전사 1% · 사냥꾼 11% 인데 파수꾼만 28%, 즉 파수꾼만 약했다).
    //   17→21→24 스윕: 31층 28→25→20%, 35층 24→14→7%. 22 가 사냥꾼(13%)과 가장 가깝다.
    //   초당 화력은 22.0 으로 여전히 셋 중 꼴찌다(광전사 28.9 · 사냥꾼 34.7) — 정체성 유지.
    // 2026-07-29 · damage 22→26 (dps 22.0→26.0), hp 900→860 으로 상쇄.
    //   17→22 로 올렸을 때의 논리("적 체력이 층마다 배수로 자라는데 혼자 화력이 낮아 못 끝낸다")가
    //   유닛 레벨이 들어오면서 한 번 더, 더 크게 재현됐다 — 유닛 L5(진형 hp×1.29)에서
    //   25층 방어율이 광전사 24% · 사냥꾼 24% 인데 파수꾼만 45% 였다(= 파수꾼만 못 뚫었다).
    //   내구도를 조금 떼어 화력으로 옮긴 것이므로 총 체급은 유지된다(유효 체력 1134→1084).
    //   흡혈 0.15·부채꼴 90°·최저 dps 순위(광 28.9 · 사 32.0 · 파 26.0)는 그대로 — 지속형 유지.
    hp: 860, armor: 26, damage: 26, cooldown: 1000, speed: 142, range: 84,
    attack: 'melee', coneDeg: 90, lifesteal: 0.15,
    radius: 18, shape: 'hex',
    skillOptions: {
      Q: [
        { name: '갈고리 찍기', type: 'strike', damage: 70, lifestealMul: 1.5, cooldown: 7000 },
        { name: '방패 밀치기', type: 'aoeSelf', radius: 80, damage: 42, knockback: 60, cooldown: 8000 },
        { name: '그물 던지기', type: 'strike', damage: 37, rootMs: 1800, lifestealMul: 1, cooldown: 9000 }
      ],
      W: [
        { name: '방패 세우기', type: 'buff', shield: 180, duration: 4500, cooldown: 15000 },
        { name: '철벽 자세', type: 'buff', armorAdd: 70, duration: 4000, cooldown: 14000 },
        { name: '숨 고르기', type: 'buff', healNow: 340, duration: 1000, cooldown: 17000 }
      ],
      E: [
        { name: '갈고리 당기기', type: 'pull', coneDeg: 120, dist: 240, damage: 26, cooldown: 13000 },
        { name: '회전 갈고리', type: 'pull', coneDeg: 360, dist: 200, damage: 21, cooldown: 15000 },
        { name: '돌진', type: 'dash', dist: 200, damage: 32, radius: 60, cooldown: 9000 }
      ],
      R: [
        { name: '파수 구역', type: 'aura', radius: 132, dps: 21, duration: 8000, cooldown: 34000 },
        { name: '경계 화톳불', type: 'aura', radius: 190, dps: 14, duration: 10000, cooldown: 36000 },
        { name: '대지 강타', type: 'aoeSelf', radius: 165, damage: 96, knockback: 70, cooldown: 28000 }
      ]
    }
  }
};

GAME.HERO_ORDER = ['vanguard', 'ranger', 'warden'];
GAME.SKILL_SLOTS = ['Q', 'W', 'E', 'R'];

// 선택된 인덱스 조합 → 실제 스킬 배열
GAME.buildSkills = function (heroKey, picks) {
  var h = GAME.HEROES[heroKey];
  var out = [];
  for (var i = 0; i < GAME.SKILL_SLOTS.length; i++) {
    var slot = GAME.SKILL_SLOTS[i];
    var list = h.skillOptions[slot];
    var idx = (picks && picks[slot] !== undefined) ? picks[slot] : 0;
    if (idx < 0 || idx >= list.length) idx = 0;
    var sk = {};
    for (var k in list[idx]) sk[k] = list[idx][k];
    // 스킬의 거리·범위도 전장 크기에 맞춰 환산한다(세로에서만 1 이 아니다)
    var K = GAME.CONFIG.WORLD_SCALE;
    if (K && K !== 1) {
      ['dist', 'radius', 'speed', 'coneDeg'].forEach(function (key) {
        if (key === 'coneDeg') return;               // 각도는 거리 아님
        if (typeof sk[key] === 'number' && sk[key] > 0) sk[key] = sk[key] * K;
      });
    }
    sk.slot = slot;
    out.push(sk);
  }
  return out;
};

GAME.defaultSkillPicks = function () {
  return { Q: 0, W: 0, E: 0, R: 0 };
};

// 영웅도 스탯 막대로 비교할 수 있게 — 유닛과 같은 축을 쓰되 최댓값은 영웅끼리 잡는다.
GAME.HERO_STAT_DEFS = [
  { key: '공격력', get: function (h) { return h.damage; }, fmt: function (h) { return String(h.damage); } },
  { key: '공격속도', get: function (h) { return 1000 / h.cooldown; }, fmt: function (h) { return (1000 / h.cooldown).toFixed(2) + '/s'; } },
  { key: '체력', get: function (h) { return h.hp; }, fmt: function (h) { return String(h.hp); } },
  { key: '방어력', get: function (h) { return h.armor; }, fmt: function (h) { return String(h.armor); } },
  { key: '이동속도', get: function (h) { return h.speed; }, fmt: function (h) { return String(h.speed); } }
];

(function () {
  for (var i = 0; i < GAME.HERO_STAT_DEFS.length; i++) {
    var sd = GAME.HERO_STAT_DEFS[i], max = 0;
    for (var k = 0; k < GAME.HERO_ORDER.length; k++) {
      var v = sd.get(GAME.HEROES[GAME.HERO_ORDER[k]]);
      if (v > max) max = v;
    }
    sd.max = max || 1;
  }
})();
