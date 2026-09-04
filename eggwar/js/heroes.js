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
//   ── 시즌2 S-E (2026-09-03) — 주술사·암살자 전용 ──
//   summon      유닛 키(unit)를 count 기, life ms 동안 세운다(noCount·골드 0)
//   stealth     duration ms 조준 제외(논타겟은 맞음), 때리면 풀린다
//   blink       dash 와 같은 이동, 피해 0, 벽 밖으로 밀려난다
//   mark        대상 하나에 표식 — duration 동안 받는 피해 ×markMul
//   chain       최근접부터 jumps 기 연쇄, 칸마다 ×decay
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
        { name: '박치기', type: 'dash', motif: 'blade', dist: 265, damage: 60, radius: 64, cooldown: 7500, cost: 0 },
        { name: '대검 돌진', type: 'dash', motif: 'rock', dist: 175, damage: 94, radius: 82, cooldown: 8250, cost: 900 },
        { name: '흙먼지 은신', type: 'dash', motif: 'sand', dist: 300, damage: 0, radius: 0, cooldown: 6000, cost: 250 },
        { name: '폭풍 돌진', type: 'dash', motif: 'rock', dist: 340, damage: 70, radius: 70, cooldown: 6750, cost: 3000 },
        { name: '부딪쳐깨기', type: 'dash', motif: 'blade', dist: 220, damage: 120, radius: 90, cooldown: 9000, cost: 9000 }
      ],
      W: [
        { name: '대검 회전', type: 'aoeSelf', motif: 'blade', radius: 102, damage: 70, cooldown: 10000, cost: 0 },
        { name: '후려치기', type: 'pull', motif: 'blade', coneDeg: 110, dist: 200, damage: 78, cooldown: 9000, cost: 900 },
        { name: '모래 뿌리기', type: 'aoeSelf', motif: 'sand', radius: 130, damage: 24, rootMs: 1300, cooldown: 12000, cost: 250 },
        { name: '강타 후려치기', type: 'pull', motif: 'blade', coneDeg: 130, dist: 230, damage: 100, cooldown: 11000, cost: 3000 },
        { name: '광역 휩쓸기', type: 'aoeSelf', motif: 'blade', radius: 140, damage: 95, cooldown: 13000, cost: 9000 }
      ],
      E: [
        { name: '가죽 두르기', type: 'buff', motif: 'blade', armorAdd: 45, speedMul: 0.85, duration: 3500, cooldown: 12000, cost: 0 },
        { name: '광폭화', type: 'buff', motif: 'blade', damageMul: 1.85, speedMul: 1.20, duration: 4500, cooldown: 15000, cost: 900 },
        { name: '약초 씹기', type: 'buff', motif: 'blade', healNow: 260, shield: 120, duration: 3000, cooldown: 13000, cost: 250 },
        { name: '전장의 함성', type: 'buff', motif: 'blade', damageMul: 1.45, armorAdd: 30, duration: 4000, cooldown: 14000, cost: 3000 },
        { name: '불굴', type: 'buff', motif: 'shield', healNow: 400, shield: 220, duration: 3200, cooldown: 16000, cost: 9000 }
      ],
      R: [
        { name: '바위 내리치기', type: 'aoeSelf', motif: 'rock', radius: 172, damage: 118, knockback: 110, cooldown: 37500, cost: 0 },
        { name: '가시 함정', type: 'trap', motif: 'blade', damage: 200, radius: 104, rootMs: 1700, life: 20000, cooldown: 35000, cost: 900 },
        { name: '낙석 유도', type: 'aoeTarget', motif: 'blade', radius: 140, damage: 48, repeat: 3, interval: 650, telegraph: 700, cooldown: 36250, cost: 250 },
        { name: '유성 낙하', type: 'aoeTarget', motif: 'blade', radius: 160, damage: 65, repeat: 4, interval: 600, telegraph: 750, cooldown: 38750, cost: 3000 },
        { name: '대지 붕괴', type: 'aoeSelf', motif: 'earth', radius: 200, damage: 150, knockback: 130, cooldown: 40000, cost: 9000 }
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
        { name: '관통 화살', type: 'projectile', motif: 'feather', damage: 54, speed: 520, pierce: true, radius: 9, cooldown: 6750, cost: 0 },
        { name: '연사', type: 'projectile', motif: 'blade', damage: 27, speed: 620, pierce: false, radius: 7, burst: 3, burstDelay: 110, cooldown: 6000, cost: 250 },
        { name: '불화살', type: 'aoeTarget', motif: 'feather', radius: 95, damage: 58, repeat: 1, telegraph: 500, cooldown: 8250, cost: 900 },
        { name: '연쇄 사격', type: 'projectile', motif: 'feather', damage: 22, speed: 650, pierce: false, radius: 7, burst: 5, burstDelay: 100, cooldown: 7500, cost: 3000 },
        { name: '독화살', type: 'projectile', motif: 'feather', damage: 70, speed: 560, pierce: true, radius: 8, cooldown: 9000, cost: 9000 }
      ],
      W: [
        { name: '구르기', type: 'dash', motif: 'blade', dist: 210, damage: 0, radius: 0, cooldown: 9000, cost: 0 },
        { name: '도약', type: 'dash', motif: 'blade', dist: 330, damage: 0, radius: 0, cooldown: 12000, cost: 250 },
        { name: '뒷걸음 사격', type: 'dash', motif: 'feather', dist: 160, damage: 38, radius: 60, cooldown: 10000, backward: true, cost: 900 },
        { name: '회피 사격', type: 'dash', motif: 'feather', dist: 200, damage: 55, radius: 70, cooldown: 11000, backward: true, cost: 3000 },
        { name: '장거리 도약', type: 'dash', motif: 'blade', dist: 420, damage: 0, radius: 0, cooldown: 13000, cost: 9000 }
      ],
      E: [
        { name: '올가미', type: 'trap', motif: 'rope', damage: 44, radius: 55, rootMs: 1400, life: 12000, cooldown: 13000, cost: 0 },
        { name: '끈끈이 덫', type: 'trap', motif: 'blade', damage: 16, radius: 90, rootMs: 2400, life: 14000, cooldown: 12000, cost: 250 },
        { name: '풀숲 위장', type: 'buff', motif: 'blade', armorAdd: 30, speedMul: 1.25, duration: 3000, cooldown: 14000, cost: 900 },
        { name: '그림자 위장', type: 'buff', motif: 'blade', armorAdd: 20, speedMul: 1.40, duration: 3200, cooldown: 16000, cost: 3000 },
        { name: '가시 올가미', type: 'trap', motif: 'rope', damage: 65, radius: 70, rootMs: 1800, life: 13000, cooldown: 15000, cost: 9000 }
      ],
      R: [
        { name: '화살비', type: 'aoeTarget', motif: 'feather', radius: 115, damage: 27, repeat: 3, interval: 700, telegraph: 600, cooldown: 37500, cost: 0 },
        { name: '폭풍 화살', type: 'aoeTarget', motif: 'feather', radius: 180, damage: 21, repeat: 5, interval: 500, telegraph: 800, cooldown: 40000, cost: 250 },
        { name: '일격 화살', type: 'projectile', motif: 'feather', damage: 132, speed: 800, pierce: true, radius: 11, cooldown: 35000, cost: 900 },
        { name: '유성비', type: 'aoeTarget', motif: 'blade', radius: 140, damage: 30, repeat: 4, interval: 550, telegraph: 650, cooldown: 38750, cost: 3000 },
        { name: '관통 저격', type: 'projectile', motif: 'feather', damage: 170, speed: 850, pierce: true, radius: 12, cooldown: 36250, cost: 9000 }
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
        { name: '갈고리 찍기', type: 'strike', motif: 'rope', damage: 92, lifestealMul: 1.9, cooldown: 6000, cost: 0 },
        { name: '방패 밀치기', type: 'aoeSelf', motif: 'shield', radius: 96, damage: 58, knockback: 78, cooldown: 6750, cost: 900 },
        { name: '그물 던지기', type: 'strike', motif: 'blade', damage: 37, rootMs: 1800, lifestealMul: 1, cooldown: 9000, cost: 250 },
        { name: '방패 강타', type: 'aoeSelf', motif: 'shield', radius: 110, damage: 75, knockback: 95, cooldown: 8250, cost: 3000 },
        { name: '강철 갈고리', type: 'strike', motif: 'rope', damage: 120, lifestealMul: 2.1, cooldown: 7500, cost: 9000 }
      ],
      W: [
        { name: '방패 세우기', type: 'buff', motif: 'shield', shield: 300, duration: 5500, cooldown: 10000, cost: 0 },
        { name: '철벽 자세', type: 'buff', motif: 'shield', armorAdd: 110, duration: 5000, cooldown: 9000, cost: 900 },
        { name: '숨 고르기', type: 'buff', motif: 'blade', healNow: 480, duration: 1000, cooldown: 12000, cost: 250 },
        { name: '재생의 숨결', type: 'buff', motif: 'ember', healNow: 620, duration: 1200, cooldown: 13000, cost: 3000 },
        { name: '불굴의 방패', type: 'buff', motif: 'shield', shield: 420, duration: 6000, cooldown: 11000, cost: 9000 }
      ],
      E: [
        { name: '갈고리 당기기', type: 'pull', motif: 'rope', coneDeg: 120, dist: 240, damage: 26, cooldown: 14000, cost: 0 },
        { name: '회전 갈고리', type: 'pull', motif: 'rope', coneDeg: 360, dist: 200, damage: 21, cooldown: 16000, cost: 250 },
        { name: '돌진', type: 'dash', motif: 'rock', dist: 200, damage: 32, radius: 60, cooldown: 12000, cost: 900 },
        { name: '대지 돌진', type: 'dash', motif: 'rock', dist: 250, damage: 45, radius: 70, cooldown: 13000, cost: 3000 },
        { name: '강철 사슬', type: 'pull', motif: 'rope', coneDeg: 140, dist: 280, damage: 38, cooldown: 15000, cost: 9000 }
      ],
      R: [
        { name: '파수 구역', type: 'aura', motif: 'shield', radius: 152, dps: 32, duration: 9000, cooldown: 37500, cost: 0 },
        { name: '경계 화톳불', type: 'aura', motif: 'ember', radius: 210, dps: 22, duration: 12000, cooldown: 40000, cost: 250 },
        { name: '대지 강타', type: 'aoeSelf', motif: 'earth', radius: 182, damage: 130, knockback: 88, cooldown: 35000, cost: 900 },
        { name: '지진 강타', type: 'aoeSelf', motif: 'earth', radius: 210, damage: 160, knockback: 100, cooldown: 36250, cost: 3000 },
        { name: '불굴의 구역', type: 'aura', motif: 'shield', radius: 170, dps: 40, duration: 10000, cooldown: 38750, cost: 9000 }
      ]
    }
  },

  // ══════════════════════════════════════════════════════════════════════════
  //  시즌 2 「다섯 세계」 — 신규 영웅 2 (2026-09-03 S-H)
  //  엔진(S-E)이 연 새 스킬 타입 다섯(summon·stealth·blink·mark·chain)을 **이 둘이
  //  전담한다.** 기존 셋은 한 줄도 안 건드렸다(탑 회귀 기준선 보존).
  //  · 체급 규율: 유효 내구도 hp×(1+armor/100) 를 1032~1161 대역에 맞춘다.
  //      주술사 900×1.28 = 1152 · 암살자 850×1.22 = 1037 (플랜의 780 은 952 로 대역
  //      밖이라 hp 만 +70 — 방어력을 올리면 '얇다'는 정체성이 죽는다).
  //  · dps: 암살자 30/0.85s = 35.3(최고지만 사냥꾼 32.0 과 근소 — 일격은 스킬이 낸다).
  //  · 가격 사다리 0·250·900·3,000·9,000 은 기존 표와 같다(scaleSkillsByPrice 가 탑에서
  //    가격으로 위력을 맞춘다). 새 필드(life·duration·markMul·jumps·decay)는 값 배수를
  //    안 타므로 표에서 직접 계단을 준다.
  //  · 모든 스킬에 `evo`(진화) 를 명시했다 — 형식은 아래 `GAME.evoOf` 주석.
  //  · 어휘: 순우리말·원시 부족(주술·토템·뼈·그림자). 마법·군대 어휘 없음.
  //
  //  ── 주술사 전면 재설계 (2026-09-03, 태현님 지시) ──────────────────────────────
  //  "qwer 이라고 봤을 때 q 근거리유닛 소환 · w 도망/회복/소환유닛강화 · e 보조유닛소환
  //   (늪지기·족장) · r 보스 소환(용의 알 제외, 원래보다 작게) · 기본공격은 마법구체,
  //   평타는 약하게" — 옛 조상의 알(가시덫 근사)·처형(strike 근사)·사슬(E) 을 전부 버리고
  //  아래 넷으로 새로 짰다.
  //  · **평타**: dps 22/0.9=24.4(옛, 최저였다) → **16/0.9=17.8**(더 낮춘다 — 다섯 영웅 중
  //    확실한 최저치. 마법사 개념이라 스스로 때리는 화력이 아니라 소환수로 미는 설계다).
  //    투사체는 `def.projStyle:'orb'` — 화살이 아니라 마법구체(js/combat.js 발사 코드·
  //    js/scenes/battle.js 투사체 그리기 루프가 `p.orb` 플래그를 본다).
  //  · **Q(근접유닛 소환)**: `attack:'melee'` 인 일반 유닛 5종(전사→벌집꾼→돌쌓이→
  //    덩굴채→망치잡이)을 값싼 것부터 계단으로. 소환수는 `unitMods` 로 원본보다 약하게.
  //  · **W(도망/회복/소환유닛강화)**: `type:'buff'` + 신설 옵션 `sk.includeSummons` —
  //    자기 회복(healNow)에 더해 반경 안 **내가 세운 소환수**(summonOwner===u)까지
  //    버프(공격·방어·이동)+회복을 함께 건다. 다른 영웅의 buff 스킬은 opt-in 이라
  //    한 줄도 안 바뀐다.
  //  · **E(보조유닛 소환)**: 태현님이 예로 든 늪지기·족장을 그대로 — `type:'summon'`,
  //    Q(근접)와 역할을 가르기 위해 둘 다 투사체/지원형 유닛이다.
  //  · **R(보스 소환)**: 신설 스킬 타입 `type:'summonBoss'`(combat.js) — 진짜 보스
  //    def(`GAME.UNITS[bossKey]`)를 빌리되 **미니어처**로 깎는다. `bossKey` 는 10층
  //    보스부터 200층 보스까지 낮은 층 → 높은 층 순으로 진화(bossChief→bossShell→
  //    bossAshSentry→bossDrakeAsh→bossStormKing). **용의 알 계열(bossDragonEgg·
  //    bossDragonEggCracked·bossDragonCrack)은 지시대로 후보에서 뺐다.**
  //    ⚠⚠ isBoss:true 를 그대로 들고 오면 battle.js 의 HUD 보스바·보스 인트로·
  //    회복구역 타깃·업적 판정이 전부 "이 층의 그 보스"로 오인한다 — combat.js 의
  //    summonBoss 분기가 def 를 얕은 복사해 `isBoss:false`·`phases` 제거·`abilities`
  //    1개로 절단한다(상세 근거는 그 분기 주석). hp×0.05~0.11·damage×0.30~0.42 로
  //    깎고 `eliteDraw`(그리는 크기만, 판정 반지름은 원본 그대로)를 0.44~0.55 로 줄여
  //    "일반 보스와 구분되게, 확실히 작고 약하게" 만들었다.
  shaman: {
    key: 'shaman',
    name: '주술사', art: 'shaman',
    trait: '소환형',
    desc: '뼈와 깃털로 꾸민 지팡이를 든 주술사. 동료의 넋을 불러 앞세우고, 조상의 힘을 빌려 함께 싸운다.',
    // 2026-09-03 재설계 — 평타는 다섯 영웅 중 확실한 최저치(마법사 개념, 22→16).
    // 투사체는 화살이 아니라 마법구체(`projStyle:'orb'`, js/combat.js·battle.js 참조).
    hp: 900, armor: 28, damage: 16, cooldown: 900, speed: 150, range: 260,
    attack: 'projectile', projectileSpeed: 380, projectileRadius: 7, lifesteal: 0,
    projStyle: 'orb',
    radius: 16, shape: 'star',
    hint: '넋을 불러 앞세우고 뒤에서 힘을 보탠다',
    skillOptions: {
      //  Q — 근접 유닛 소환. `attack:'melee'` 인 일반 유닛만 쓴다(js/units.js
      //  GAME.UNIT_ORDER 중 melee 5종을 값싼 것 → 강한 것 순으로). 소환수는
      //  `unitMods` 로 원본 유닛보다 약하게(직접 사서 배치하는 것과 차등).
      Q: [
        { name: '전사 소환', type: 'summon', motif: 'totem', unit: 'bayonet', count: 1, life: 9000, range: 110, unitMods: { hp: 0.8, damage: 0.7 }, cooldown: 11000, cost: 0,
          evo: { at: { floor: 10 }, name: '용맹한 전사 소환', patch: { life: 12000, unitMods: { hp: 1.0, damage: 0.85 } } } },
        { name: '벌집꾼 소환', type: 'summon', motif: 'bone', unit: 'hivethrower', count: 1, life: 8500, range: 120, unitMods: { hp: 0.8, damage: 0.75 }, cooldown: 11500, cost: 250,
          evo: { at: { floor: 20 }, name: '독한 벌집꾼 소환', patch: { life: 11500, unitMods: { hp: 1.0, damage: 0.9 } } } },
        { name: '돌쌓이 소환', type: 'summon', motif: 'earth', unit: 'stonepiler', count: 1, life: 10000, range: 120, unitMods: { hp: 0.9, damage: 0.8 }, cooldown: 12500, cost: 900,
          evo: { at: { floor: 35 }, name: '거대 돌쌓이 소환', patch: { life: 13000, unitMods: { hp: 1.1, damage: 0.95 } } } },
        { name: '덩굴채 소환', type: 'summon', motif: 'bog', unit: 'vinewhip', count: 2, life: 9500, range: 130, spread: 50, unitMods: { hp: 0.85, damage: 0.8 }, cooldown: 12000, cost: 3000,
          evo: { at: { rtWins: 5 }, name: '덩굴채 무리 소환', patch: { count: 3, spread: 58, life: 12000 } } },
        { name: '망치잡이 소환', type: 'summon', motif: 'earth', unit: 'hammer', count: 1, life: 11000, range: 130, unitMods: { hp: 1.0, damage: 0.95 }, cooldown: 13000, cost: 9000,
          evo: { at: { floor: 80 }, name: '망치잡이 무리 소환', patch: { count: 2, spread: 55, life: 15000, unitMods: { hp: 1.25, damage: 1.1 } } } }
      ],
      //  W — 도망/회복/소환유닛강화. `type:'buff'` + 신설 옵션 `includeSummons` —
      //  자기 회복에 더해 반경 안 **내가 세운 소환수**(Q/E/R)까지 공격·방어·이동을
      //  버프하고 함께 회복시킨다(combat.js 의 buff 분기, opt-in — 다른 영웅 무영향).
      W: [
        { name: '정령의 가호', type: 'buff', motif: 'bone', duration: 5000, healNow: 110, radius: 220, includeSummons: true,
          sumDamageMul: 1.25, sumArmorAdd: 6, sumHealNow: 70, cooldown: 10000, cost: 0,
          evo: { at: { floor: 10 }, name: '깊은 정령의 가호', patch: { healNow: 150, sumDamageMul: 1.3, sumHealNow: 90 } } },
        { name: '늪의 가호', type: 'buff', motif: 'bog', duration: 5500, healNow: 140, radius: 230, includeSummons: true,
          sumDamageMul: 1.3, sumArmorAdd: 8, sumSpeedMul: 1.1, sumHealNow: 90, cooldown: 10000, cost: 250,
          evo: { at: { floor: 20 }, name: '깊은 늪의 가호', patch: { healNow: 180, sumDamageMul: 1.35, sumHealNow: 110 } } },
        { name: '뼈의 가호', type: 'buff', motif: 'bone', duration: 6000, healNow: 170, radius: 240, includeSummons: true,
          sumDamageMul: 1.35, sumArmorAdd: 10, sumHealNow: 110, cooldown: 10500, cost: 900,
          evo: { at: { floor: 35 }, name: '갈라진 뼈의 가호', patch: { healNow: 210, sumDamageMul: 1.4, sumHealNow: 140 } } },
        { name: '원한의 가호', type: 'buff', motif: 'ember', duration: 6500, healNow: 210, radius: 250, includeSummons: true,
          sumDamageMul: 1.45, sumArmorAdd: 12, sumHealNow: 140, cooldown: 11000, cost: 3000,
          evo: { at: { rtWins: 5 }, name: '타오르는 원한의 가호', patch: { healNow: 250, sumDamageMul: 1.5, sumHealNow: 170 } } },
        { name: '조상의 가호', type: 'buff', motif: 'totem', duration: 7000, healNow: 260, radius: 270, includeSummons: true,
          sumDamageMul: 1.55, sumArmorAdd: 16, sumHealNow: 180, cooldown: 11500, cost: 9000,
          evo: { at: { floor: 80 }, name: '태초의 가호', patch: { healNow: 310, sumDamageMul: 1.65, sumHealNow: 220, radius: 300 } } }
      ],
      //  E — 보조유닛 소환(늪지기·족장). Q(근접)와 역할을 가르기 위해 둘 다
      //  투사체/지원형 유닛이다 — 늪지기는 둔화로 발을 묶고, 족장은 곁을 강화한다.
      E: [
        //  ⚠ E 1·2단은 소환 전체에서 가장 얇았다(늪지기 유효체력 121 · 족장 140 —
        //    Q 1단 전사 250 의 절반). 보조형이라 약한 것은 맞지만 서서 둔화·버프를
        //    걸기도 전에 죽으면 역할 자체가 성립하지 않는다. 원본 유닛 체력 그대로
        //    (hp 1.0)로 올리고 공격만 낮게 유지해 '보조'라는 성격은 지킨다.
        { name: '늪지기 소환', type: 'summon', motif: 'bog', unit: 'chemtrooper', count: 1, life: 8000, range: 150, unitMods: { hp: 1.0, damage: 0.7 }, cooldown: 12000, cost: 0,
          evo: { at: { floor: 10 }, name: '깨어난 늪지기 소환', patch: { count: 2, spread: 40, life: 11000, unitMods: { hp: 1.0, damage: 0.85 } } } },
        { name: '족장 소환', type: 'summon', motif: 'totem', unit: 'sergeant', count: 1, life: 8000, range: 150, unitMods: { hp: 1.0, damage: 0.7 }, cooldown: 12500, cost: 250,
          evo: { at: { floor: 20 }, name: '깨어난 족장 소환', patch: { life: 11000, unitMods: { hp: 1.0, damage: 0.85 } } } },
        { name: '늪지기 무리 소환', type: 'summon', motif: 'bog', unit: 'chemtrooper', count: 2, life: 9500, range: 160, spread: 55, unitMods: { hp: 0.9, damage: 0.8 }, cooldown: 13000, cost: 900,
          evo: { at: { floor: 35 }, name: '늪지기 떼 소환', patch: { count: 3, spread: 65, life: 12000 } } },
        { name: '강화된 족장 소환', type: 'summon', motif: 'totem', unit: 'sergeant', count: 1, life: 11000, range: 160, unitMods: { hp: 1.1, damage: 1.0 }, cooldown: 13500, cost: 3000,
          evo: { at: { rtWins: 5 }, name: '오래된 족장 소환', patch: { life: 14000, unitMods: { hp: 1.3, damage: 1.15 } } } },
        { name: '조상의 부름', type: 'summon', motif: 'totem', unit: 'sergeant', count: 2, life: 13000, range: 170, spread: 60, unitMods: { hp: 1.3, damage: 1.2 }, cooldown: 14000, cost: 9000,
          evo: { at: { floor: 80 }, name: '태초의 부름', patch: { count: 3, spread: 75, life: 16000, unitMods: { hp: 1.5, damage: 1.35 } } } }
      ],
      //  R — 보스 소환. 신설 타입 `type:'summonBoss'`(combat.js) — 진짜 보스 def 를
      //  빌리되 isBoss 를 지우고 phases 를 없애고 abilities 를 1개로 줄인 뒤 hp·damage 를
      //  깎아 미니어처로 세운다(`eliteDraw` 로 그리는 크기만 축소). 낮은 층 보스 →
      //  높은 층 보스 순으로 진화한다. **용의 알 계열은 지시대로 후보에서 뺐다.**
      //
      //  ⚠⚠ 2026-09-04 체급 재조정 — **궁극기가 기본 스킬보다 약했다.**
      //  처음 값(hpMul 0.05·dmgMul 0.30)은 "미니어처니까 작게"만 보고 Q 와 맞대 보지
      //  않고 정했다. 실측하니 R 1단 hp 119·dmg 11 인데 Q 1단(전사)이 hp 192·dmg 25 —
      //  **쿨은 34초 대 11초로 3배 긴데 체급은 절반**이었다. 궁극기 자리에 놓을 이유가
      //  없는 스킬이다. 원본 보스 대비가 아니라 **Q 소환수 대비**로 다시 잡았다:
      //  체력은 Q 최고단(210)의 2~3배, 공격은 Q 중간단 수준.
      //  ⚠ `dmgMul` 이 1 을 넘는 것이 "원본 보스보다 세다"는 뜻이 아니다 — 미니보스는
      //    phases 가 없고 abilities 가 1개로 잘려 **원본의 주 무기인 스킬을 잃는다.**
      //    보스 평타는 CLAUDE.md v1.15 에서 "평타 약·스킬 강" 규율로 55~65% 깎인 값이라
      //    (원본 dmg 31~45) 스킬을 뺏긴 몫을 평타로 돌려주지 않으면 아무것도 못 한다.
      R: [
        //  10층 보스 — 부족을 이끄는 거대 족장. 가장 이르게 나타나는 보스라 가장 약하다.
        { name: '조상의 족장 소환', type: 'summonBoss', motif: 'totem', bossKey: 'bossChief',
          hpMul: 0.19, dmgMul: 1.05, sizeMul: 0.44, life: 16000, range: 150, cooldown: 34000, cost: 0,
          evo: { at: { floor: 10 }, name: '태초의 족장 소환', patch: { hpMul: 0.23, dmgMul: 1.18, life: 19000 } } },
        //  20층 보스 — 두꺼운 껍질 골렘. 족장보다 한 걸음 더 단단하다.
        { name: '조상의 골렘 소환', type: 'summonBoss', motif: 'earth', bossKey: 'bossShell',
          hpMul: 0.21, dmgMul: 1.05, sizeMul: 0.45, life: 17000, range: 150, cooldown: 34000, cost: 250,
          evo: { at: { floor: 20 }, name: '태초의 골렘 소환', patch: { hpMul: 0.25, dmgMul: 1.18, life: 20000 } } },
        //  40층 보스 — 재를 뒤집어쓴 파수병. 용의 첫 그림자가 드리우기 시작한 자리.
        { name: '조상의 파수병 소환', type: 'summonBoss', motif: 'ember', bossKey: 'bossAshSentry',
          hpMul: 0.24, dmgMul: 1.20, sizeMul: 0.47, life: 18000, range: 160, cooldown: 35000, cost: 900,
          evo: { at: { floor: 35 }, name: '태초의 파수병 소환', patch: { hpMul: 0.28, dmgMul: 1.33, life: 21000 } } },
        //  80층 보스 — 용이 거느린 잿날개. 처음으로 '용의 부하'를 직접 부린다.
        { name: '조상의 잿날개 소환', type: 'summonBoss', motif: 'ember', bossKey: 'bossDrakeAsh',
          hpMul: 0.27, dmgMul: 1.35, sizeMul: 0.49, life: 19000, range: 160, cooldown: 36000, cost: 3000,
          evo: { at: { rtWins: 5 }, name: '태초의 잿날개 소환', patch: { hpMul: 0.31, dmgMul: 1.48, life: 22000 } } },
        //  200층 보스 — 폭풍 하늘의 주인. 이 사다리의 정점 — 가장 늦게, 가장 강하게.
        { name: '조상의 폭풍왕 소환', type: 'summonBoss', motif: 'totem', bossKey: 'bossStormKing',
          hpMul: 0.31, dmgMul: 1.55, sizeMul: 0.52, life: 21000, range: 170, cooldown: 38000, cost: 9000,
          evo: { at: { floor: 80 }, name: '태초의 폭풍왕 소환', patch: { hpMul: 0.36, dmgMul: 1.72, life: 25000, sizeMul: 0.55 } } }
      ]
    }
  },

  assassin: {
    key: 'assassin',
    name: '암살자', art: 'stalker',
    trait: '기동형',
    desc: '눈만 보이는 두건에 쌍단검. 그림자로 들어가 표식을 찍고 한 번에 끝낸다.',
    //  hp 780 → 850: 유효 내구도 952 → 1037 (체급 대역 하한). 여전히 다섯 중 가장 얇다.
    hp: 850, armor: 22, damage: 30, cooldown: 850, speed: 172, range: 70,
    attack: 'melee', coneDeg: 80, lifesteal: 0,
    radius: 15, shape: 'diamond',
    hint: '숨었다 나와 한 번에 끝낸다',
    skillOptions: {
      Q: [
        { name: '그림자 걸음', type: 'blink', motif: 'shadow', dist: 200, cooldown: 7000, cost: 0,
          evo: { at: { floor: 10 }, name: '긴 그림자 걸음', patch: { dist: 240, cooldown: 6500 } } },
        { name: '되돌기', type: 'blink', motif: 'shadow', dist: 220, backward: true, cooldown: 6500, cost: 250,
          evo: { at: { floor: 20 }, name: '먼 되돌기', patch: { dist: 270, cooldown: 6000 } } },
        //  ⚠ 돌진에 자취를 얹는다 (2026-09-04 태현님: "돌진할때 경로에 덫을놓거나
        //    돌진하면서 수리검이나 표창을 던졌으면"). `trail` 을 적은 스킬만 탄다 —
        //    위 두 blink 는 손대지 않았다(순수 기동기라는 정체성을 지킨다).
        { name: '표창 돌진', type: 'dash', motif: 'blade', dist: 220, damage: 60, radius: 50, cooldown: 7500, cost: 900,
          trail: 'shuriken', trailN: 4, trailDamage: 26,
          evo: { at: { floor: 35 }, name: '표창 난무 돌진', patch: { damage: 78, radius: 58, trailN: 6, trailDamage: 32 } } },
        { name: '덫 놓기 돌진', type: 'dash', motif: 'shadow', dist: 260, damage: 52, radius: 48, cooldown: 7000, cost: 3000,
          trail: 'trap', trailN: 3, trailDamage: 90, trailLife: 9000,
          evo: { at: { rtWins: 5 }, name: '덫밭 가르기', patch: { trailN: 4, trailDamage: 120, dist: 300 } } },
        { name: '그림자 넘기', type: 'blink', motif: 'shadow', dist: 380, cooldown: 5500, cost: 9000,
          evo: { at: { floor: 80 }, name: '그림자 그 너머', patch: { dist: 440, cooldown: 4800 } } }
      ],
      //  W — **영역전개** (2026-09-04 태현님: "표식시스템은 영역전개느낌으로 원이
      //  생기고 거기안에 들어간 적에겐 추가데미지를 입히는 방식으로")
      //  ⚠ 기존 `mark`(대상 한 기에 표식)를 지우지 않고 **새 타입 `markZone`** 으로
      //    갈아탄다 — 대상 표식은 "누구를 노렸나", 영역은 "어디를 잠갔나"라 성질이
      //    다르고, 2단(단검 던지기)은 투척 정체성이라 그대로 둔다.
      //  ⚠ 피해를 주는 장판이 아니라 **받는 피해 증폭**이다. 장판 피해로 만들면
      //    가만히 둬도 적이 죽어 "내가 들어가서 싸운다"는 이 영웅의 성격이 사라진다.
      W: [
        { name: '그림자 영역', type: 'markZone', motif: 'shadow', duration: 5500, markMul: 1.35, range: 240, radius: 110, damage: 40, cooldown: 9000, cost: 0,
          evo: { at: { floor: 10 }, name: '넓은 그림자 영역', patch: { duration: 6500, radius: 128, markMul: 1.42 } } },
        { name: '단검 던지기', type: 'projectile', motif: 'blade', projStyle: 'dagger', damage: 60, speed: 600, pierce: false, radius: 7, cooldown: 7000, cost: 250,
          evo: { at: { floor: 20 }, name: '쌍단검 던지기', patch: { burst: 2, burstDelay: 120, damage: 48 } } },
        { name: '결계 전개', type: 'markZone', motif: 'bone', duration: 6500, markMul: 1.45, range: 260, radius: 130, damage: 55, cooldown: 9000, cost: 900,
          evo: { at: { floor: 35 }, name: '깊은 결계', patch: { duration: 7500, markMul: 1.55 } } },
        { name: '그림자 감옥', type: 'markZone', motif: 'shadow', duration: 7000, markMul: 1.55, range: 280, radius: 150, damage: 70, cooldown: 9500, cost: 3000,
          evo: { at: { rtWins: 5 }, name: '넓은 감옥', patch: { radius: 175, markMul: 1.62 } } },
        { name: '영역 전개', type: 'markZone', motif: 'shadow', duration: 8000, markMul: 1.70, range: 300, radius: 165, damage: 95, cooldown: 10000, cost: 9000,
          evo: { at: { floor: 80 }, name: '끝의 영역', patch: { duration: 9500, radius: 190, markMul: 1.85 } } }
      ],
      //  E — 은신. ⚠ **`ambushMul` 신설** (2026-09-04 태현님: "숨기 이후에 첫 공격은
      //  치명타나 더 강한 공격이 되게끔"). 은신을 푸는 **바로 그 타격**에만 곱해지고
      //  즉시 사라진다(combat.js applyDamage 관문 + breakStealth). 값을 안 적으면 1 이라
      //  다른 영웅·옛 은신은 한 톨도 안 바뀐다.
      E: [
        { name: '은신', type: 'stealth', motif: 'shadow', duration: 3000, speedMul: 1.15, ambushMul: 2.0, cooldown: 14000, cost: 0,
          evo: { at: { floor: 10 }, name: '긴 은신', patch: { duration: 3800, speedMul: 1.2, ambushMul: 2.3 } } },
        { name: '연기', type: 'stealth', motif: 'sand', duration: 2500, speedMul: 1.35, ambushMul: 2.2, cooldown: 12000, cost: 250,
          evo: { at: { floor: 20 }, name: '짙은 연기', patch: { duration: 3200, speedMul: 1.45, ambushMul: 2.5 } } },
        { name: '그림자 숨기', type: 'stealth', motif: 'shadow', duration: 3500, speedMul: 1.20, ambushMul: 2.6, cooldown: 13000, cost: 900,
          evo: { at: { floor: 35 }, name: '깊은 그림자', patch: { duration: 4500, speedMul: 1.3, ambushMul: 3.0 } } },
        { name: '풀숲 숨기', type: 'buff', motif: 'blade', armorAdd: 25, speedMul: 1.35, duration: 3200, cooldown: 14000, cost: 3000,
          evo: { at: { rtWins: 5 }, name: '깊은 풀숲', patch: { armorAdd: 35, speedMul: 1.45, duration: 3800 } } },
        { name: '완전 은신', type: 'stealth', motif: 'shadow', duration: 5500, speedMul: 1.35, ambushMul: 3.2, cooldown: 13000, cost: 9000,
          evo: { at: { floor: 80 }, name: '그림자 그 자체', patch: { duration: 7000, speedMul: 1.45, ambushMul: 3.8 } } }
      ],
      //  R — 궁극기 다섯 갈래 (2026-09-04 태현님: "강한공격도 있겠지만 수리검을 정말
      //  사방팔방으로 뿌리는 스킬도 있어야하고 분신술쓰는 스킬도 있어야하고 바라보는
      //  적한테 달라붙어서 연속공격 약 17회 연속으로 공격하는 스킬도 있으면 좋겠어").
      //  ⚠ 성격이 서로 겹치지 않게 갈랐다 — 한 방 / 광역 난사 / 분신 / 연격 / 마무리.
      //    같은 자리에 비슷한 것을 넣으면 고를 이유가 없어져 사다리가 죽는다.
      R: [
        { name: '처형', type: 'strike', motif: 'blade', damage: 160, lifestealMul: 1, cooldown: 36000, cost: 0,
          evo: { at: { floor: 10 }, name: '깔끔한 처형', patch: { damage: 200, cooldown: 33000 } } },
        //  ── 사방 난사 — 자기중심 방사. 뭉친 진형 한복판에서 쓰라고 만든 수다.
        { name: '표창 난사', type: 'spray', motif: 'blade', count: 16, damage: 46, speed: 560, life: 1100, cooldown: 34000, cost: 250,
          evo: { at: { floor: 20 }, name: '만천화우', patch: { count: 20, rings: 2, damage: 52, cooldown: 32000 } } },
        //  ── 분신술 — 분신은 스킬을 안 쓰고 평타만 친다(영웅이 둘이 되면 안 된다).
        { name: '분신술', type: 'clone', motif: 'shadow', count: 2, hpMul: 0.22, dmgMul: 0.45, life: 7000, range: 90, cooldown: 35000, cost: 900,
          evo: { at: { floor: 35 }, name: '다중 분신술', patch: { count: 3, hpMul: 0.26, dmgMul: 0.52, life: 9000 } } },
        //  ── 연격 — 17 대를 90ms 간격으로. 그동안 대상에게 붙어 있어야 하므로
        //    "안전한 큰 피해"가 아니라 **위험을 감수하는** 궁극기다.
        { name: '난격', type: 'flurry', motif: 'blade', hits: 17, every: 90, damage: 26, range: 200, cooldown: 36000, cost: 3000,
          evo: { at: { rtWins: 5 }, name: '그림자 난격', patch: { hits: 21, damage: 32, every: 80 } } },
        { name: '마지막 일격', type: 'strike', motif: 'shadow', damage: 330, lifestealMul: 1.5, cooldown: 37000, cost: 9000,
          evo: { at: { floor: 80 }, name: '끝맺음', patch: { damage: 400, lifestealMul: 2, cooldown: 34000 } } }
      ]
    }
  }
};

//  ⚠ 다섯 영웅. 이 배열을 읽는 곳(2026-09-03 grep): scenes/tower.js 카드·세로 버튼,
//    draft.js/draft-mobile.js 모달, rtprep.js 목록, build.js 저장 메뉴, towershop.js 영웅 탭,
//    defendtower.js heroKeyFor 순환, rtbot.js 봇 영웅, arenabuild.js DEFAULT, 도구 12곳.
//    카드 5장이 세로 폰(420)·가로(1340)에 들어가는지는 tower.js 의 산수 주석 참조.
GAME.HERO_ORDER = ['vanguard', 'ranger', 'warden', 'shaman', 'assassin'];
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
  trap:       '덫',
  //  시즌2 S-E 새 타입 5 (2026-09-03) — S-E 보고서의 표기 그대로. 서브셋 대조는
  //  `node tools/font-audit.js` 가 잡는다(밖이면 통합자가 재굽는다).
  summon:     '부르기',
  stealth:    '숨기',
  blink:      '점멸',
  mark:       '표식',
  chain:      '사슬',
  //  2026-09-03 · 주술사 R(summonBoss) — 새 글자를 넣지 않으려고 `summon` 과
  //  **같은 낱말**을 그대로 쓴다(서브셋 대조 불필요 — Jua 800자 제약, 위 주석 참조).
  //  개념상으로도 틀리지 않다: 미니 보스도 결국 '부르는' 소환이다.
  summonBoss: '부르기',
  //  2026-09-04 · 암살자 닌자 개편 넷. 화면에 그대로 뜨는 낱말이므로 `font-audit` 이
  //  서브셋 밖 글자를 잡는다(지금 글꼴은 자체 호스팅 2,516자라 여유가 있다).
  markZone:   '영역',
  spray:      '뿌리기',
  clone:      '나누기',
  flurry:     '몰아치기'
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
  //  씬 없는 곳(헤드리스 도구·towerchar dropCandidates)에서도 새 타입은 문장을 낸다.
  if (!D || !D._skillDesc) {
    var ex = GAME.skillDescExtra ? GAME.skillDescExtra(sk) : '';
    return ex ? (ex + ' · 쿨 ' + ((sk.cooldown || 0) / 1000).toFixed(0) + '초') : '';
  }
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

// 시즌2 새 타입 5 의 한 줄 설명 — draft.js `_skillDesc` 의 `default` 가 이걸 부른다
// (그 함수는 옛 9타입만 알고, 새 타입의 필드는 여기 표(heroes.js)가 주인이다).
GAME.skillDescExtra = function (sk) {
  if (!sk) return '';
  var UN = GAME.UNITS || {};
  switch (sk.type) {
    case 'summon': return (UN[sk.unit] ? UN[sk.unit].name : sk.unit) + ' ' + (sk.count || 1) + '기를 ' +
                          ((sk.life || 6000) / 1000).toFixed(0) + '초 동안 세운다';
    case 'stealth': return ((sk.duration || 3000) / 1000).toFixed(1) + '초 숨는다' +
                           (sk.speedMul && sk.speedMul !== 1 ? ', 이동 x' + sk.speedMul : '') + ' — 때리면 풀린다';
    case 'blink': return (sk.backward ? '뒤로 ' : '') + '점멸 ' + Math.round(sk.dist || 0) + ' (피해 없음)';
    case 'mark': return '표식 ' + ((sk.duration || 5000) / 1000).toFixed(0) + '초, 받는 피해 x' + (sk.markMul || 1.35) +
                        (sk.damage ? ' + ' + sk.damage : '');
    case 'chain': return '사슬 ' + (sk.jumps || 4) + '기 연쇄 ' + (sk.damage || 0) + ', 칸마다 x' + (sk.decay === undefined ? 0.7 : sk.decay) +
                         (sk.slowMul ? ' + 둔화' : '');
    //  2026-09-03 · 주술사 R — 미니 보스 소환. 일반 부르기 문장과 형식을 맞춘다.
    case 'summonBoss': return (UN[sk.bossKey] ? UN[sk.bossKey].name : sk.bossKey) + ' (미니어처)를 ' +
                              ((sk.life || 16000) / 1000).toFixed(0) + '초 동안 세운다';
  }
  return '';
};

// ── 스킬 진화 (시즌2 S-H, 2026-09-03) ────────────────────────────────────────
//  스키마: 선택지에 `evo: { at: {floor:N} | {rtWins:N}, name, patch: {…} }`.
//   · at    : 조건. floor = 통곡의 탑 최고층(GAME.Tower.get().best) ≥ N,
//             rtWins = 실시간 대전 승수(GAME.RtScore.get().wins) ≥ N. 판정은 TowerChar.evoReady.
//   · patch : **표 단위 값**으로 덮어쓴다(절대값). buildSkills 가 WORLD_SCALE 을 곱하기
//             **전에** 얹으므로 거리 키도 그냥 표 값으로 적는다. 가격 배수(scaleSkillsByPrice)는
//             그 뒤에 걸리므로 진화 뒤 값에도 똑같이 곱해진다.
//   · 명시하지 않은 스킬은 `GAME.evoOf` 가 **가격 단에서 기본 진화**를 만든다(피해·초당·
//     보호막·회복 ×1.3, 반경·거리 ×1.1, 쿨 ×0.9) — 기존 3영웅 60칸이 여기 해당한다.
//  전투 적용: `buildSkills(heroKey, picks)` 가 `picks._evo['Q:2']` 를 보고 patch 를 얹는다.
//  TowerChar 가 `rec.evo` 를 정본으로 두고 `rec.picks._evo` 에 미러링한다(towerloading 이
//  rec.picks 를 그대로 Battle 에 넘기므로 battle.js 를 안 건드린다). 값어치는
//  `TowerChar.evoAtkMul` 이 재서 atkIndex 에 넘긴다(추종 지수 — 성장에 맞춘 압박 절).
GAME.EVO_DEFAULT_AT = [
  { cost: 0,    at: { floor: 10 } },
  { cost: 250,  at: { floor: 20 } },
  { cost: 900,  at: { floor: 35 } },
  { cost: 3000, at: { rtWins: 5 } },
  { cost: 9000, at: { floor: 80 } }
];
GAME.evoOf = function (sk) {
  if (!sk) return null;
  if (sk.evo) return sk.evo;
  var c = sk.cost || 0, at = null;
  for (var i = 0; i < GAME.EVO_DEFAULT_AT.length; i++) {
    if (c >= GAME.EVO_DEFAULT_AT[i].cost) at = GAME.EVO_DEFAULT_AT[i].at;
  }
  var p = {};
  if (sk.damage > 0) p.damage = Math.round(sk.damage * 1.3);
  if (sk.dps > 0) p.dps = Math.round(sk.dps * 1.3);
  if (sk.shield > 0) p.shield = Math.round(sk.shield * 1.3);
  if (sk.healNow > 0) p.healNow = Math.round(sk.healNow * 1.3);
  if (sk.armorAdd > 0) p.armorAdd = Math.round(sk.armorAdd * 1.3);
  if (sk.radius > 0) p.radius = Math.round(sk.radius * 1.1);
  if (sk.dist > 0) p.dist = Math.round(sk.dist * 1.1);
  if (sk.cooldown > 0) p.cooldown = Math.round(sk.cooldown * 0.9);
  return { at: at || { floor: 10 }, name: '진화한 ' + sk.name, patch: p, auto: true };
};
//  patch 를 사본에 얹는다(원본 표는 안 건드린다). 반환 = 같은 객체.
GAME.applyEvo = function (sk, evo) {
  if (!sk || !evo || !evo.patch) return sk;
  for (var k in evo.patch) {
    var v = evo.patch[k];
    if (v && typeof v === 'object') { var c = {}; for (var j in v) c[j] = v[j]; sk[k] = c; }
    else sk[k] = v;
  }
  sk.evolved = true;
  sk.baseName = sk.name;
  if (evo.name) sk.name = evo.name;
  return sk;
};
GAME.evoKey = function (slot, idx) { return slot + ':' + idx; };
//  조건 문구(상점용).
GAME.evoAtText = function (at) {
  if (!at) return '';
  if (at.floor) return '탑 ' + at.floor + '층 돌파';
  if (at.rtWins) return '실시간 대전 ' + at.rtWins + '승';
  return '';
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
    delete sk.evo;                                  // 전투 스킬에는 진화 정의를 안 싣는다
    // 진화 — picks._evo['Q:2'] 가 서 있으면 patch 를 얹는다(WORLD_SCALE 전·가격 배수 전).
    if (picks && picks._evo && picks._evo[GAME.evoKey(slot, idx)]) {
      GAME.applyEvo(sk, GAME.evoOf(list[idx]));
    }
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

// ── 값이 비쌀수록 세다 — **통곡의 탑에서만** (2026-07-31 사용자 지시) ─────────────
//  "지금 비싼 스킬이 저렴한 스킬 대비 좋은 걸 못 느끼겠어. 그거 업데이트하고,
//   대전에서는 스킬끼리 비슷한 능력치를 갖게 해주는 게 맞아."
//
//  진단: `skillOptions` 는 **탑과 대전이 공유하는 한 벌**이다(대전에는 스킬 구매 개념이
//  없어 선택지가 늘어난 것만으로 순수 이득이었다). 그래서 표의 숫자를 그냥 올리면
//  대전이 같이 움직여 "비슷한 능력치" 요구와 정면으로 부딪친다. 실제 격차도 작았다 —
//  광전사 Q 기준 무료 박치기 7.5dps vs 140골드 부딪쳐깨기 12.0dps(1.6배)뿐이고,
//  무료 쪽이 돌진 거리는 오히려 더 길었다.
//
//  해법: 표는 그대로 두고 **탑 전투에서만** 가격에 비례해 배수를 얹는다.
//   · 대전(`js/scenes/battle.js` 의 versus 경로)은 이 함수를 부르지 않는다 → 무변화.
//   · 무료(cost 0) 스킬은 배수 1.0 이라 `tools/regress.js` 의 R-1(무조작 돌파 0%)은
//     기준선이 그대로다 — 무조작 시뮬은 언제나 기본 픽(0번)을 쓴다.
//  배수 크기는 실측으로 정했다(`scratchpad/skillprice.js` — 슬롯별 위력지수 표).
//  ① 0.0022(200골드 = 피해 1.44배) → 유료가 무료보다 낮은 슬롯이 여럿 남았다.
//  ② 0.0034(1.68배) → 신고 재발: "200골드 주고 사는 스킬은 정말 강력해야 해".
//  ③ 지금 값 — 200골드에서 **피해 2.6배 · 범위 1.30배 · 쿨 0.80배**,
//     즉 지속 화력 **3.25배**다. 무료 스킬과 같은 칸에 놓으면 다른 급으로 읽힌다.
//  이렇게 세게 줘도 되는 이유: 이 배수는 **탑에서만** 걸리고(대전 무영향), 값을 치른
//  플레이어에게만 붙으며, 잠금 규칙(towerchar.js `skillLocked`)이 싼 것부터 사도록
//  강제해 "돈만 있으면 최상급 직행"이 막혀 있다. 무조작 기준선(R-1)은 언제나 무료
//  스킬로 재므로 이 값과 무관하다.
//  ④ 2026-08-01 — 가격 사다리를 **0 · 250 · 900 · 3,000 · 9,000** 으로 다시 깔았다
//     (골드 수입이 지수가 되면서 옛 60~210 범위는 3층이면 다 사졌다).
//     계수도 그 범위에 맞춰 다시 잡는다 — 9,000 에서 **피해 4.2배 · 범위 1.6배 ·
//     쿨 0.52배 = 지속 화력 약 8배**. 사용자 요구("스킬도 능력치 차이를 많이 주고
//     골드 차이도 크게")에 맞춘 크기다.
//     중간 계단도 의미가 있어야 하므로 선형이 아니라 **제곱근**으로 오른다:
//       250 → 1.53배 · 900 → 2.0배 · 3,000 → 2.9배 · 9,000 → 4.2배(상한)
//     선형이면 250 짜리가 1.09배라 "산 티가 안 난다".
GAME.SKILL_PRICE_SCALE = { pow: 0.5, k: 0.0335, radK: 0.0063, cdK: 0.0051,
                           capDmg: 4.20, capRad: 1.60, cdFloor: 0.52 };

GAME.skillPriceMul = function (cost) {
  var S = GAME.SKILL_PRICE_SCALE;
  var c = (typeof cost === 'number' && cost > 0) ? cost : 0;
  var r = Math.pow(c, S.pow);          // 제곱근 — 중간 계단도 티가 나게 한다
  return {
    dmg: Math.min(S.capDmg, 1 + r * S.k),
    rad: Math.min(S.capRad, 1 + r * S.radK),
    cd: Math.max(S.cdFloor, 1 - r * S.cdK)
  };
};

// ── 스킬 계수 — **스킬이 내 능력치를 탄다** (2026-08-01 사용자 지시) ─────────────
//  "스킬에 공격력과 방어력 등의 계수를 넣어주고, 골드별로 스킬별로 능력치 차이를 더 줘."
//
//  ## 무엇이 문제였나
//  지금까지 스킬 피해는 **완전한 고정값**이었다. 공격력 620짜리 무기를 사도
//  '박치기 60' 은 그대로 60 이다. 그래서 두 가지가 동시에 죽어 있었다:
//   ① **성장이 안 느껴진다** — 장비를 사도 기본 공격만 세지고 스킬은 제자리다
//   ② **비싼 스킬이 안 비싸다** — 값 배수(skillPriceMul)는 고정값을 키울 뿐이라
//      투자와 스킬 사이에 아무 관계가 없다
//
//  ## 어떻게 고치나
//  `피해 = 고정값 + 공격력 × 계수` 로 바꾼다. 그리고 **계수를 값에서 뽑는다** —
//  비싼 스킬일수록 내 공격력을 더 많이 탄다. 그래야 "저 스킬을 사면 내 장비가
//  더 값어치를 한다"가 성립하고, 그게 사용자가 말한 '골드별 차이'다.
//
//  ⚠ **계수는 시전 순간에 곱한다**(js/combat.js 의 `_skillPower`). 스킬을 만들 때
//    곱하면 그 뒤에 붙는 아이템·능력치·버프가 하나도 안 실린다 — 이 저장소가
//    `u.auras = []` 로 이미 한 번 겪은 계열의 사고다.
//  ⚠ 방어형(보호막·방어력)은 **방어력**을 탄다. 공격력을 태우면 딜러가 탱커보다
//    단단해지는 역전이 생긴다.
GAME.SKILL_COEF = {
  pow: 0.42,          // 값이 오를수록 계수가 오르되 완만하게(제곱근보다 완만)
  k: 0.030,           // 계수 기울기
  base: 0.35,         // 공짜 스킬도 최소한 이만큼은 공격력을 탄다
  cap: 1.45,          // 상한 — 없으면 최고가 스킬이 후반에 혼자 다 한다
  defRatio: 0.55,     // 방어형 계수는 공격형의 절반쯤(방어력 수치가 더 작다)

  // ── 기준점 — **여기서 손익이 0 이다** ────────────────────────────────────
  //  계수를 그냥 더하기만 하면 맨몸 영웅까지 같이 세져서 **밸런스가 통째로 밀린다.**
  //  실제로 그랬다: 처음 넣자마자 R-1(4층 무조작 0% 약속)이 13% 로 깨졌다.
  //  원인은 계수가 아니라 **공짜 버프**였다 — 기본 장비만 든 영웅의 스킬도 15~29%
  //  세졌기 때문이다.
  //  그래서 고정값에서 `기준공격력 × 계수` 만큼을 미리 빼 둔다. 그러면
  //    · 기준 장비(공격력 50)에서는 **예전과 똑같은 피해**
  //    · 그보다 투자한 만큼만 더 세진다
  //  이게 사용자가 말한 "성장이 체감된다"의 정확한 모양이다. 강화가 아니라 **연결**이다.
  //  refAtk 50 은 추측이 아니라 실측이다 — 탑의 영웅 예산으로 자동 구매했을 때
  //  세 영웅의 공격력이 48·50·52 로 나온다(층이 올라도 예산 상한 때문에 거의 안 변한다).
  refAtk: 50,
  refArm: 40,
  // 고정값을 아무리 깎아도 이 비율 밑으로는 안 내린다 — 공격력 0 인 상황(디버프 등)에서
  // 스킬이 통째로 무력해지면 그건 계수가 아니라 버그처럼 느껴진다.
  floorRatio: 0.30
};

// 스킬 하나의 공격 계수. 값이 없으면(=공짜) `base` 다.
GAME.skillAtkCoef = function (sk) {
  if (!sk) return 0;
  // 피해가 0 인 스킬(은신·정화 같은 순수 유틸)은 계수를 안 준다 — 줘도 쓸 데가 없고,
  // 0 에 곱해 봐야 0 이라 오히려 '왜 안 세지지' 하는 혼란만 만든다.
  //  ⚠ 단 **`dps` 도 피해다**(구역 스킬). `damage` 만 보다가 파수꾼 궁극기가
  //    통째로 계수 밖에 있었다(2026-08-02 사용자 신고).
  if (!(sk.damage > 0) && !(sk.dps > 0)) return 0;
  if (typeof sk.atkCoef === 'number') return sk.atkCoef;      // 손으로 준 값이 있으면 그것
  var S = GAME.SKILL_COEF;
  // 값에 따른 차등은 **탑에서만**. 대전은 전부 같은 기본 계수를 쓴다(위 주석 참조).
  if (!sk._priced) return S.base;
  var c = (typeof sk.cost === 'number' && sk.cost > 0) ? sk.cost : 0;
  return Math.min(S.cap, S.base + Math.pow(c, S.pow) * S.k);
};

// 방어형(보호막·방어력 부여) 계수.
GAME.skillDefCoef = function (sk) {
  if (!sk) return 0;
  if (!(sk.shield > 0 || sk.armorAdd > 0)) return 0;
  if (typeof sk.defCoef === 'number') return sk.defCoef;
  var S = GAME.SKILL_COEF;
  if (!sk._priced) return S.base * S.defRatio;
  var c = (typeof sk.cost === 'number' && sk.cost > 0) ? sk.cost : 0;
  return Math.min(S.cap, S.base + Math.pow(c, S.pow) * S.k) * S.defRatio;
};

// 스킬 하나에 배수를 얹는다(제자리 수정). 상점 미리보기도 **같은 함수**를 거쳐야
// 화면의 숫자와 전장의 숫자가 갈리지 않는다.
GAME.scaleSkillByPrice = function (sk) {
  if (!sk || !sk.cost) return sk;
  // ⚠ **탑을 지났다는 표식**을 남긴다. 계수(skillAtkCoef)가 값에 따라 달라지는 것은
  //   탑에서만이어야 한다 — 대전은 "모든 스킬이 유사한 밸런스"가 약속이고(CLAUDE.md),
  //   `skillOptions` 는 두 모드가 **같은 한 벌을 공유**하므로 cost 필드가 대전 쪽
  //   스킬에도 그대로 붙어 있다. 표식 없이 cost 만 보면 대전에서도 9000짜리 스킬이
  //   1.45 계수를 받아 그 약속이 조용히 깨진다.
  sk._priced = true;
  var m = GAME.skillPriceMul(sk.cost);
  if (sk.damage) sk.damage = Math.round(sk.damage * m.dmg);
  // ⚠ **`dps` 를 빠뜨리고 있었다** (2026-08-02, 사용자 신고: "파수꾼 궁극기에 적용
  //   안 된 것 같아"). 구역(aura) 스킬은 피해를 `damage` 가 아니라 `dps` 로 적는데
  //   여기 목록에 없어서 값 배수가 통째로 안 걸렸다. 그 결과 파수꾼 R 슬롯에서
  //   **무료 '파수 구역' 초당 32 가 250골드 '경계 화톳불' 초당 22 보다 셌다** —
  //   돈을 쓸수록 약해지는 역전이다.
  //   교훈: 새 능력 필드를 만들면 **이 목록과 `skillAtkCoef` 둘 다** 손봐야 한다.
  if (sk.dps) sk.dps = Math.round(sk.dps * m.dmg);
  if (sk.healNow) sk.healNow = Math.round(sk.healNow * m.dmg);
  if (sk.shield) sk.shield = Math.round(sk.shield * m.dmg);
  if (sk.armorAdd) sk.armorAdd = Math.round(sk.armorAdd * m.dmg);
  // 배수형 버프는 **보너스 부분만** 키운다(1.85 를 통째로 곱하면 폭주한다).
  if (sk.damageMul && sk.damageMul > 1) sk.damageMul = 1 + (sk.damageMul - 1) * m.dmg;
  if (sk.radius) sk.radius = Math.round(sk.radius * m.rad);
  if (sk.dist) sk.dist = Math.round(sk.dist * m.rad);
  if (sk.cooldown) sk.cooldown = Math.round(sk.cooldown * m.cd);
  return sk;
};

GAME.scaleSkillsByPrice = function (skills) {
  if (!skills) return skills;
  for (var i = 0; i < skills.length; i++) GAME.scaleSkillByPrice(skills[i]);
  return skills;
};

// 표시용 — **지금 내 능력치로 이 스킬이 얼마나 나오는가**.
//  ⚠ 이게 없으면 상점이 거짓말을 한다. 계수가 붙은 뒤로 표에 적힌 고정값과
//    실제 피해가 갈라지기 때문이다. 이 저장소는 "화면이 거짓말하면 그건 아트가
//    아니라 버그다"를 이미 여러 번 겪었다(파수꾼 창 길이·물약 표시 등).
//  atk/arm 은 **영웅 기본 + 능력치 + 아이템** 을 다 더한 최종값을 넣어야 한다.
GAME.skillEffective = function (sk, atk, arm) {
  if (!sk) return sk;
  var S = GAME.SKILL_COEF;
  var out = {};
  for (var k in sk) out[k] = sk[k];
  var ac = GAME.skillAtkCoef(sk);
  if (ac > 0 && sk.damage > 0) {
    var flat = Math.max(sk.damage * S.floorRatio, sk.damage - S.refAtk * ac);
    out.damage = Math.round(flat + (atk || 0) * ac);
  }
  // 구역 스킬 — 초당 피해도 같은 규칙으로 자란다.
  if (ac > 0 && sk.dps > 0) {
    var fl3 = Math.max(sk.dps * S.floorRatio, sk.dps - S.refAtk * ac);
    out.dps = Math.round(fl3 + (atk || 0) * ac);
  }
  var dc = GAME.skillDefCoef(sk);
  if (dc > 0 && sk.shield > 0) {
    var fl2 = Math.max(sk.shield * S.floorRatio, sk.shield - S.refArm * dc);
    out.shield = Math.round(fl2 + (arm || 0) * dc);
  }
  return out;
};

// 미리보기용 — 원본을 안 건드리고 배수를 얹은 사본을 돌려준다.
GAME.skillPricedCopy = function (opt) {
  var c = {};
  for (var k in opt) c[k] = opt[k];
  return GAME.scaleSkillByPrice(c);
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
