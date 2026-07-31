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
    // range 82 → 90 (2026-07-29, 사용자 요청). 위 '근접 사거리 버프' 절의 옛 결론
    //   ("사거리를 올리면 진형 앞에서 멈춰 선봉만 긁어 오히려 약해진다")은
    //   **프로 에이전트가 사거리 끝(range×0.82)에 멈춰 서던 시절의 관측이다.**
    //   에이전트가 옆돌기를 하게 고친 뒤 다시 재니 4층 돌파가 75%→75% 로 안 떨어진다.
    //   즉 그 결론은 게임의 성질이 아니라 측정 도구의 성질이었다.
    hp: 860, armor: 35, damage: 28, cooldown: 900, speed: 155, range: 90,
    attack: 'melee', coneDeg: 100, lifesteal: 0.10,
    // ── 달려들며 치기 (2026-07-29, 사용자 요청) ───────────────────────────────
    // 문제: 근접 컨트롤러가 "붙어서 평타만 치면 되는" 영웅이었다. 계측이 그대로 말한다 —
    //   `node tools/hero-skillgap.js` 평균 숙련 격차 사냥꾼 91.8%p vs 광전사 26.0%p.
    //   구조적 원인은 `combat.js` 의 `if (d <= def.range) { fire; return; }` 다:
    //   사거리에 들어오면 서서 치는 게 최적이라 이동이 곧 손해였다.
    // 고친 방식: **움직이면서 휘두른 타격만** 밀어내고 피해가 는다(`Combat.isCharging`).
    //   서 있으면 평타 그대로다 → 멈춰 있는 것이 이제 명확히 손해다.
    // 왜 사거리 버프가 아닌가: 실측했다(`hstat=vanguard.range:...`).
    //   102 → 4층 돌파 50%→38% 로 **떨어진다**(진형 앞에서 멈춰 선봉만 긁는다).
    //   122 → 30층 돌파 96%. 무한의 탑이 성립하지 않는다. 사거리는 답이 아니었다.
    // 왜 확률이 아닌가: 확률은 슬롯머신이라 계획을 세울 수 없다. 조작의 재미는
    //   "내가 하면 된다"는 예측 가능성에서 나온다.
    // 밀어내기 30 은 사거리 82 보다 한참 짧다 — 밀어도 여전히 내 사거리 안이라
    //   스스로 화력을 밀어내지 않는다.
    // 피해 배수는 **빼기로 했다**. 계측이 그렇게 말한다:
    //   옆돌기만(밀어내기 0.01px·배수 1.0) 62.6%p vs 밀어내기 30px 61.8%p — 같다.
    //   반면 배수 1.25 를 얹으면 84.4%p 로 뛰고 30층 돌파가 88% 가 된다(사냥꾼과 동급).
    //   즉 배수는 '조작의 재미'가 아니라 그냥 +25% 화력이고, 무한의 탑을 무너뜨린다.
    // 밀어내기는 승률을 안 바꾼다(그래서 밸런스 비용 0). 남기는 이유는 다르다 —
    //   움직이며 친 타격이 **눈에 보이게** 달라야 플레이어가 '움직이는 게 이득'을 배운다.
    //   다굴당할 때 빠져나올 공간을 여는 실전 가치도 여기 있다(시뮬의 프로는 회피가
    //   초인적이라 그 값어치를 못 재지만, 사람은 다르다).
    chargeKnock: 30,
    // 화면에 한 줄로 알려준다 — 안 보이는 기제는 없는 기제다.
    // 어휘는 세계관 규율대로 순우리말 동작어만 쓴다(군대·마법 어휘 금지).
    // ⚠ 이 글자들은 config.js 의 800자 서브셋 안에 있어야 한다(확인함).
    hint: '달려들며 휘두르면 밀어낸다',
    radius: 17, shape: 'square',
    skillOptions: {
      // ── 2026-07-31 · 스킬 버프 (사용자 지시 2·3번) ──────────────────────────
      //  "사냥꾼은 뺑뺑이를 컨트롤 스킬로 삼되, 광전사와 파수꾼은 **다른 타격감**이
      //   있어야 한다."
      //  방향을 갈랐다 — 사냥꾼의 재미는 '안 맞는 것'(위치 선정)이고,
      //  **광전사의 재미는 '크게 맞히는 것'** 이어야 한다. 그래서 광전사는
      //  **한 방의 크기와 도달 범위**를 키운다(쿨은 그대로 두거나 조금만 줄인다) —
      //  쿨을 줄이면 '자주 누르는 손'이 되어 사냥꾼과 결이 같아진다.
      //  피해 +25~40% · 반경 +10~20% · 돌진 거리 +15%.

      // ── 2026-08-01 · 상점 확충(요청 6·9) — 슬롯당 3→5. 기본(0번)은 무료 내장이고
      //  나머지는 전부 골드로 구매해야 장착할 수 있다(`js/towerchar.js` 의 `ownedSkills`).
      //  새로 늘린 두 개(3·4번)는 **기존 타입의 숫자 변형**이다 — combat.js 에 새 로직을
      //  안 만들어 회귀 위험을 없앤다. 가격은 슬롯 안에서 상대 위력에 맞춰 매겼다.
      Q: [
        { name: '박치기', type: 'dash', dist: 265, damage: 60, radius: 64, cooldown: 8000, cost: 0 },
        { name: '대검 돌진', type: 'dash', dist: 175, damage: 94, radius: 82, cooldown: 9000, cost: 70 },
        { name: '흙먼지 은신', type: 'dash', dist: 300, damage: 0, radius: 0, cooldown: 6000, cost: 60 },
        { name: '폭풍 돌진', type: 'dash', dist: 340, damage: 70, radius: 70, cooldown: 7000, cost: 90 },
        { name: '부딪쳐깨기', type: 'dash', dist: 220, damage: 120, radius: 90, cooldown: 10000, cost: 140 }
      ],
      W: [
        { name: '대검 회전', type: 'aoeSelf', radius: 102, damage: 70, cooldown: 11000, cost: 0 },
        { name: '후려치기', type: 'pull', coneDeg: 110, dist: 200, damage: 78, cooldown: 10000, cost: 80 },
        { name: '모래 뿌리기', type: 'aoeSelf', radius: 130, damage: 24, rootMs: 1300, cooldown: 13000, cost: 70 },
        { name: '강타 후려치기', type: 'pull', coneDeg: 130, dist: 230, damage: 100, cooldown: 11500, cost: 120 },
        { name: '광역 휩쓸기', type: 'aoeSelf', radius: 140, damage: 95, cooldown: 13000, cost: 150 }
      ],
      E: [
        { name: '가죽 두르기', type: 'buff', armorAdd: 45, speedMul: 0.85, duration: 3500, cooldown: 14000, cost: 0 },
        { name: '광폭화', type: 'buff', damageMul: 1.85, speedMul: 1.20, duration: 4500, cooldown: 16000, cost: 90 },
        { name: '약초 씹기', type: 'buff', healNow: 260, shield: 120, duration: 3000, cooldown: 15000, cost: 80 },
        { name: '전장의 함성', type: 'buff', damageMul: 1.45, armorAdd: 30, duration: 4000, cooldown: 15000, cost: 130 },
        { name: '불굴', type: 'buff', healNow: 400, shield: 220, duration: 3200, cooldown: 17000, cost: 170 }
      ],
      R: [
        { name: '바위 내리치기', type: 'aoeSelf', radius: 172, damage: 118, knockback: 110, cooldown: 32000, cost: 0 },
        { name: '가시 함정', type: 'trap', damage: 200, radius: 104, rootMs: 1700, life: 20000, cooldown: 26000, cost: 110 },
        { name: '낙석 유도', type: 'aoeTarget', radius: 140, damage: 48, repeat: 3, interval: 650, telegraph: 700, cooldown: 30000, cost: 100 },
        { name: '유성 낙하', type: 'aoeTarget', radius: 160, damage: 65, repeat: 4, interval: 600, telegraph: 750, cooldown: 32000, cost: 180 },
        { name: '대지 붕괴', type: 'aoeSelf', radius: 200, damage: 150, knockback: 130, cooldown: 34000, cost: 200 }
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
    // ── 2026-07-31 · 너프 (사용자 지시 1번) ────────────────────────────────
    //   "대전에서 컨트롤러로 테스트해보니 사냥꾼으로 깨기가 너무 쉽다."
    //   **실제 플레이 신고**이고, 이 저장소의 옛 측정은 이 축을 못 봤다 —
    //   가상 컨트롤러가 사거리 끝에 멈춰 서서 싸우느라 근접의 천장을 낮게 재고
    //   원거리를 상대적으로 과대평가했다(그 판정은 이번에 폐기했다. regress.js R-2).
    //
    //   무엇을 깎을 것인가: **사거리(340)가 아니라 속도(178)** 다.
    //   사거리는 '원거리형'이라는 정체성 자체라 깎으면 다른 영웅이 된다.
    //   문제는 사거리가 아니라 **사거리 + 최고 속도**의 조합이었다 — 붙으려는
    //   근접(전사 135, 광전사 155)보다 빠르니 거리를 유지하는 데 아무 대가가 없다.
    //   속도를 158 로 내리면 여전히 셋 중 가장 빠르지만(광전사 155 와 근소),
    //   전사의 달려들기(dist 210)와 방패 돌진(270)이 실제로 닿기 시작한다.
    //   체력 920→840: 유효 내구도 1104→1008. '얇다'는 정체성을 되살린다.
    hp: 840, armor: 20, damage: 24, cooldown: 750, speed: 158, range: 340,
    attack: 'projectile', projectileSpeed: 420, projectileRadius: 7, lifesteal: 0,
    radius: 15, shape: 'triangle',
    skillOptions: {
      // ── 2026-08-01 · 상점 확충(요청 6·9). 0번 무료 내장, 나머지 구매 필요.
      Q: [
        { name: '관통 화살', type: 'projectile', damage: 54, speed: 520, pierce: true, radius: 9, cooldown: 8000, cost: 0 },
        { name: '연사', type: 'projectile', damage: 27, speed: 620, pierce: false, radius: 7, burst: 3, burstDelay: 110, cooldown: 7000, cost: 70 },
        { name: '불화살', type: 'aoeTarget', radius: 95, damage: 58, repeat: 1, telegraph: 500, cooldown: 9000, cost: 80 },
        { name: '연쇄 사격', type: 'projectile', damage: 22, speed: 650, pierce: false, radius: 7, burst: 5, burstDelay: 100, cooldown: 8500, cost: 110 },
        { name: '독화살', type: 'projectile', damage: 70, speed: 560, pierce: true, radius: 8, cooldown: 9000, cost: 140 }
      ],
      W: [
        { name: '구르기', type: 'dash', dist: 210, damage: 0, radius: 0, cooldown: 5000, cost: 0 },
        { name: '도약', type: 'dash', dist: 330, damage: 0, radius: 0, cooldown: 8000, cost: 60 },
        { name: '뒷걸음 사격', type: 'dash', dist: 160, damage: 38, radius: 60, cooldown: 6500, backward: true, cost: 70 },
        { name: '회피 사격', type: 'dash', dist: 200, damage: 55, radius: 70, cooldown: 7000, backward: true, cost: 110 },
        { name: '장거리 도약', type: 'dash', dist: 420, damage: 0, radius: 0, cooldown: 9000, cost: 130 }
      ],
      E: [
        { name: '올가미', type: 'trap', damage: 44, radius: 55, rootMs: 1400, life: 12000, cooldown: 11000, cost: 0 },
        { name: '끈끈이 덫', type: 'trap', damage: 16, radius: 90, rootMs: 2400, life: 14000, cooldown: 10000, cost: 70 },
        { name: '풀숲 위장', type: 'buff', armorAdd: 30, speedMul: 1.25, duration: 3000, cooldown: 12000, cost: 80 },
        { name: '그림자 위장', type: 'buff', armorAdd: 20, speedMul: 1.40, duration: 3200, cooldown: 13000, cost: 110 },
        { name: '가시 올가미', type: 'trap', damage: 65, radius: 70, rootMs: 1800, life: 13000, cooldown: 12000, cost: 140 }
      ],
      R: [
        { name: '화살비', type: 'aoeTarget', radius: 115, damage: 27, repeat: 3, interval: 700, telegraph: 600, cooldown: 30000, cost: 0 },
        { name: '폭풍 화살', type: 'aoeTarget', radius: 180, damage: 21, repeat: 5, interval: 500, telegraph: 800, cooldown: 34000, cost: 120 },
        { name: '일격 화살', type: 'projectile', damage: 132, speed: 800, pierce: true, radius: 11, cooldown: 26000, cost: 140 },
        { name: '유성비', type: 'aoeTarget', radius: 140, damage: 30, repeat: 4, interval: 550, telegraph: 650, cooldown: 32000, cost: 190 },
        { name: '관통 저격', type: 'projectile', damage: 170, speed: 850, pierce: true, radius: 12, cooldown: 28000, cost: 210 }
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
    // 2026-07-31 · **체력·방어력 버프** (사용자 지시 6번: "파수꾼은 체력과 방어력을 더").
    //   hp 860→1000 · armor 26→34. 유효 내구도(hp×(1+armor/100)) 1084→1340 (+24%).
    //   ⚠ 이 값은 CLAUDE.md 의 '영웅 체급 통일'(유효 내구도 1032~1161) 을 **일부러 벗어난다.**
    //     그 통일은 가상 컨트롤러 측정에 기대 잡은 값인데, 그 판정을 이번에 폐기했다
    //     (regress.js R-2 주석). 지속형 영웅은 '오래 버텨 이긴다'가 정체성이므로
    //     실제 플레이 감각을 우선한다. 화력(26)·부채꼴(90°)·속도(142)는 그대로다.
    hp: 1000, armor: 34, damage: 26, cooldown: 1000, speed: 142, range: 84,
    attack: 'melee', coneDeg: 90, lifesteal: 0.15,
    // ── '무게' — 덩치 · 밟기 · 상시 오라 (2026-07-29, 사용자 요청) ─────────────
    // 광전사가 '달려들며 친다'면 파수꾼은 **그냥 거기 있는 것만으로 압박한다**.
    // 같은 근접이라도 조작의 결이 달라야 두 영웅을 고를 이유가 생긴다:
    //   광전사 = 치고 빠지며 밀어낸다(공격에 붙는 기제, 밀어내기 30)
    //   파수꾼 = 밀고 들어가 눌러앉는다(이동·존재에 붙는 기제, 밟기 14)
    //
    // radius 18 → 24 (덩치). 공짜가 아니다 — 접촉 판정은 **양쪽 반지름의 합**이라
    //   적의 사거리 판정(`dist > range + 대상반지름`)에도 그대로 들어간다.
    //   즉 커질수록 **적이 나를 더 쉽게 때린다.** 밟기 범위를 얻고 피격 면적을 내주는
    //   거래이고, 그게 '덩치 큰 방패병'이라는 그림과도 맞는다.
    // trampleKnock 14 (광전사 30 의 절반 이하). 파수꾼은 뚫는 영웅이 아니라
    //   버티는 영웅이라, 밀어내기가 세면 정체성이 광전사 쪽으로 넘어간다.
    // auraDps 는 아래 계측으로 정한다 — **조작 없이도 켜지는 유일한 기제**라
    //   무조작 기준선(R-1 · SC-4)을 직접 위협한다. 반드시 재고 넣을 것.
    // radius 18 → **21** (24 가 아니다). 실측: 24 는 숙련 격차를 57.6%p → 37.8%p 로
    //   깎는다(−20%p, 순수 너프). 방어력 26→38 로 보상해도 51%p 에 그치고, 그 보상은
    //   **무조작 돌파율까지 같이 올려** R-1·SC-4 를 갉는다. 21 은 56.8%p 로 사실상 무비용.
    //   즉 덩치는 공짜가 아니고, 얼마나 키울 수 있는지는 재봐야 알 수 있다.
    radius: 21, shape: 'hex',
    // auraDps 10 · **이동 중에만** 갉는다(combat.js `moveOnly`). 상시 오라는 실패했다:
    //   상시로 두면 수성의 탑의 AI 공격 영웅이 공짜로 받아 4층 방어율이 39%→31%,
    //   영웅 간 편차가 17%p→27%p 로 SC-3 을 깬다. dps 를 2 까지 낮춰도 25%p 였다 —
    //   **크기 문제가 아니라 구조 문제였다**(광전사가 저층에서 약해 조금만 올려도 벌어진다).
    //   또 상시 오라 8 은 파수꾼 단독 무조작 8층 돌파를 11% 로 밀어 R-1 도 갉았다
    //   (rep=96. ⚠ regress.js R-1 은 영웅 3종을 순환해 1/3 로 희석되므로 그때는 통과했다 —
    //    영웅별로 따로 재지 않으면 이 위반을 못 본다).
    //   이동 조건을 걸자 둘 다 사라졌다: 수성 4층 편차 17%p, 무조작 2/6/2(오라 0 과 같음).
    //   AI 는 사거리에 들면 멈춰서 치므로 이 기제를 구조적으로 못 쓰기 때문이다.
    //   그래서 dps 를 4 → 10 으로 올려도 공짜다(통곡 숙련 격차 49.7→67.3%p).
    // 정체성도 이쪽이 맞다 — '서서 발산하는 장판'이 아니라 **밀고 지나가며 갉는 무게**다.
    //   밟기와 한 몸이 된다: 움직이면 몸에 닿은 적이 밀리고 주변이 갉인다.
    // 흡혈은 안 태운다(noLs) — 초당 도는 판정에 흡혈이 붙으면 '버티는 지속형'이 '무적'이 된다.
    // 피해 숫자도 안 띄운다(noNumber) — 존재는 바닥 고리로 읽힌다.
    trampleKnock: 14, auraDps: 10, auraRadius: 96,
    // 사용자 표현('덩치로 밟는다')을 그대로 못 쓴다 — 덩·곁·갉 이 800자 서브셋 밖이라
    // 폰트가 146KB 1파일 → 491KB 25파일이 된다. 뜻이 같은 서브셋 안 낱말로 바꿨다.
    hint: '무게로 밀고 주변을 깎는다',
    // ── 2026-07-31 · 스킬 버프 (사용자 지시 2·3번) ──────────────────────────
    //  세 영웅의 **재미의 축을 일부러 갈랐다**:
    //    사냥꾼 = '안 맞는 것'   (위치 선정 · 뺑뺑이가 정당한 컨트롤 스킬)
    //    광전사 = '크게 맞히는 것' (한 방의 크기 — 피해·반경·돌진 거리)
    //    파수꾼 = '안 죽는 것'   (버티는 두께 — 보호막·장갑·회복·지속 장판)
    //  그래서 파수꾼은 **한 방을 키우지 않는다.** 보호막 180→300, 장갑 70→110,
    //  회복 340→480, 장판 dps 21→32·14→22 로 **버티는 시간**을 키웠다.
    //  근접 스킬(갈고리·밀치기)만 흡혈 배수와 함께 올려 '오래 싸울수록 강해지는' 결을 세운다.
    //  ⚠ 쿨타임은 셋 다 안 건드렸다 — 쿨을 줄이면 세 영웅이 전부 '자주 누르는 손'이 되어
    //    결이 같아진다. 축을 가르는 것이 이번 변경의 목적이다.
    skillOptions: {
      // ── 2026-08-01 · 상점 확충(요청 6·9). 0번 무료 내장, 나머지 구매 필요.
      Q: [
        { name: '갈고리 찍기', type: 'strike', damage: 92, lifestealMul: 1.9, cooldown: 7000, cost: 0 },
        { name: '방패 밀치기', type: 'aoeSelf', radius: 96, damage: 58, knockback: 78, cooldown: 8000, cost: 80 },
        { name: '그물 던지기', type: 'strike', damage: 37, rootMs: 1800, lifestealMul: 1, cooldown: 9000, cost: 70 },
        { name: '방패 강타', type: 'aoeSelf', radius: 110, damage: 75, knockback: 95, cooldown: 8500, cost: 120 },
        { name: '강철 갈고리', type: 'strike', damage: 120, lifestealMul: 2.1, cooldown: 8000, cost: 150 }
      ],
      W: [
        { name: '방패 세우기', type: 'buff', shield: 300, duration: 5500, cooldown: 15000, cost: 0 },
        { name: '철벽 자세', type: 'buff', armorAdd: 110, duration: 5000, cooldown: 14000, cost: 90 },
        { name: '숨 고르기', type: 'buff', healNow: 480, duration: 1000, cooldown: 17000, cost: 80 },
        { name: '재생의 숨결', type: 'buff', healNow: 620, duration: 1200, cooldown: 18000, cost: 140 },
        { name: '불굴의 방패', type: 'buff', shield: 420, duration: 6000, cooldown: 16000, cost: 160 }
      ],
      E: [
        { name: '갈고리 당기기', type: 'pull', coneDeg: 120, dist: 240, damage: 26, cooldown: 13000, cost: 0 },
        { name: '회전 갈고리', type: 'pull', coneDeg: 360, dist: 200, damage: 21, cooldown: 15000, cost: 70 },
        { name: '돌진', type: 'dash', dist: 200, damage: 32, radius: 60, cooldown: 9000, cost: 90 },
        { name: '대지 돌진', type: 'dash', dist: 250, damage: 45, radius: 70, cooldown: 10000, cost: 120 },
        { name: '강철 사슬', type: 'pull', coneDeg: 140, dist: 280, damage: 38, cooldown: 14000, cost: 140 }
      ],
      R: [
        { name: '파수 구역', type: 'aura', radius: 152, dps: 32, duration: 9000, cooldown: 34000, cost: 0 },
        { name: '경계 화톳불', type: 'aura', radius: 210, dps: 22, duration: 12000, cooldown: 36000, cost: 110 },
        { name: '대지 강타', type: 'aoeSelf', radius: 182, damage: 130, knockback: 88, cooldown: 28000, cost: 130 },
        { name: '지진 강타', type: 'aoeSelf', radius: 210, damage: 160, knockback: 100, cooldown: 30000, cost: 190 },
        { name: '불굴의 구역', type: 'aura', radius: 170, dps: 40, duration: 10000, cooldown: 35000, cost: 200 }
      ]
    }
  }
};

GAME.HERO_ORDER = ['vanguard', 'ranger', 'warden'];
GAME.SKILL_SLOTS = ['Q', 'W', 'E', 'R'];

// ── 스킬 라벨 (2026-07-29) ────────────────────────────────────────────────────
// PC 는 키보드가 있으니 `Q W E R` 이 곧 조작 안내다. 그런데 **폰에는 키보드가 없다** —
// 원형 버튼에 찍힌 알파벳 네 글자는 아무것도 알려주지 않는다.
//
// ⚠ 그렇다고 **슬롯마다 이름을 붙일 수는 없다.** 위 skillOptions 를 슬롯별로 세로로 읽어보면
//   R 을 빼고는 슬롯에 공통 성격이 없다:
//     Q  광전사 dash ×3        · 사냥꾼 projectile ×2 + aoeTarget · 파수꾼 strike ×2 + aoeSelf
//     W  광전사 aoeSelf ×2+pull · 사냥꾼 dash ×3               · 파수꾼 buff ×3
//     E  광전사 buff ×3        · 사냥꾼 trap ×2 + buff          · 파수꾼 pull ×2 + dash
//     R  광전사 aoeSelf/trap/aoeTarget · 사냥꾼 aoeTarget ×2/projectile · 파수꾼 aura ×2/aoeSelf
//   즉 W 하나만 봐도 광역·이동·방어로 갈린다. 슬롯 이름 하나로 묶으면 세 영웅 중 둘에게 거짓말이다.
//   **R 만 일관된다** — 타입은 제각각이지만 9개 선택지가 전부 쿨다운 26~36초(다른 슬롯은 5~17초)
//   짜리 판을 뒤집는 기술이다. 그래서 R 만 슬롯 이름('궁극기')을 쓴다.
//   나머지 세 슬롯은 **그 슬롯에 고른 스킬의 type** 을 이름 삼는다. 타입 이름은 곧
//   "이 버튼을 누르면 무슨 일이 일어나는가"라 조합을 바꿔도 표시가 계속 정직하다.
//   (덤: 세 영웅 어느 조합에서도 QWE 세 라벨이 서로 겹치지 않는다 — 27조합 전수 확인.)
//
// 어휘 규율 — 세계관은 **계란 부족 전쟁 · 원시 직업/무기 · 12세 이용가**다.
//   군대·총기·마법 어휘는 폐기된 컨셉이라 쓰지 않는다(그래서 '폭격'·'사격'·'주문'은 탈락).
//   순우리말 동작어를 쓰고, **최대 3글자**로 맞춘다(모바일 버튼이 지름 58~66px 원이다).
//   그리고 `js/config.js` 의 Jua 서브셋이 **정확히 800자로 꽉 차 있어** 새 글자를 하나라도
//   쓰면 첫 로딩이 146KB → 491KB 가 된다. 아래 열 낱말은 전부 서브셋 안에서 골랐다(검사 완료).
//   ⚠ 이 표를 고칠 때는 반드시 서브셋 대조부터 할 것.
GAME.SKILL_TYPE_LABEL = {
  // '돌진'이 아니다: dash 7개 중 3개(흙먼지 은신·구르기·도약)가 피해 0 이고
  // 1개(뒷걸음 사격)는 뒤로 뛴다. 적에게 달려든다고 쓰면 절반 넘게 거짓이 된다.
  dash:       '뛰기',
  aoeSelf:    '쓸기',    // 제자리에서 주변을 한 번에 — 대검 회전·모래 뿌리기·방패 밀치기
  aoeTarget:  '겨냥',    // 자리를 겨눠 예고 후 떨어뜨린다 ('떨구기'는 '떨'이 서브셋 밖)
  projectile: '쏘기',
  // '강타'(한자어)·'찍기'(그물 던지기엔 거짓) 대신 평범한 동작어. 한 놈만 때린다.
  strike:     '때리기',
  buff:       '다지기',  // 보호막·방어력·회복·광폭화 — 제 몸을 다진다
  pull:       '끌기',
  aura:       '구역',    // 밟으면 아픈 자리를 남긴다 (지금은 R 전용이라 화면에는 안 나온다)
  trap:       '덫'
};

// R 은 타입과 무관하게 슬롯 이름을 우선한다.
GAME.SKILL_SLOT_LABEL = { R: '궁극기' };

// 모바일 버튼/PC 스킬바가 쓰는 짧은 이름. 못 알아보는 타입이면 슬롯 글자로 되돌린다.
GAME.skillLabel = function (sk, slot) {
  slot = slot || (sk && sk.slot);
  if (slot && GAME.SKILL_SLOT_LABEL[slot]) return GAME.SKILL_SLOT_LABEL[slot];
  var t = sk && GAME.SKILL_TYPE_LABEL[sk.type];
  return t || slot || '';
};

// 스킬 효과 한 줄 설명 — **구현은 한 벌만 둔다.**
// 지금 실물은 `js/scenes/draft.js` 의 `DraftScene.prototype._skillDesc` 다(순수 함수라
// this 를 쓰지 않는다). 여기서 복사해 오면 두 곳이 조용히 어긋나므로 **호출 시점에 빌려 쓴다.**
// → 정리할 때는 draft.js 의 함수 본문을 이 자리로 옮기고 그쪽을 한 줄로 만들면 된다:
//     GAME.DraftScene.prototype._skillDesc = function (sk) { return GAME.skillDesc(sk); };
//   (draft.js 는 이번 작업의 담당 파일이 아니라 손대지 않았다.)
GAME.skillDesc = function (sk) {
  if (!sk) return '';
  var D = GAME.DraftScene && GAME.DraftScene.prototype;
  if (!D || !D._skillDesc) return '';
  // ⚠ 준비 화면은 `skillOptions` 의 **원본**(정수)을 넘기지만, 전투 중 `hero.skills` 는
  //   `buildSkills` 가 WORLD_SCALE 을 곱한 뒤라 세로에서 55.974683544303794 같은 실수다.
  //   그대로 찍으면 설명이 소수점 열여섯 자리가 된다(실측으로 걸렸다).
  //   거리성 값만 반올림한 사본을 넘긴다 — 배수(speedMul·damageMul)는 건드리면 안 된다.
  var DIST = ['radius', 'dist', 'speed'], out = sk, k, i;
  for (i = 0; i < DIST.length; i++) {
    k = DIST[i];
    if (typeof sk[k] === 'number' && sk[k] % 1 !== 0) {
      if (out === sk) { out = {}; for (var j in sk) out[j] = sk[j]; }
      out[k] = Math.round(sk[k]);
    }
  }
  return D._skillDesc(out);
};

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
