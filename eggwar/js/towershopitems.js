window.GAME = window.GAME || {};

// ============================================================================
//  통곡의 탑 전용 확장 아이템 카탈로그 (2026-08-01)
//
//  사용자 지시: "아이템 종류를 대폭 늘려주고 물약 시스템은 없애줘."
//
//  ⚠ `GAME.ITEMS`(js/items.js, 일반 대전·수성의 탑 공용)는 **전혀 건드리지 않는다.**
//    그 테이블에 물약을 지우거나 항목을 더하면 일반 대전과 수성의 탑(defend.js)의
//    AI 자동구매 목록이 조용히 같이 움직인다.
//
//  슬롯 4종: 무기 / 방어구 / 신발 / 장신구. 각 8단계.
//
//  ══ 가격이 두 벌인 이유 (2026-08-01 개편) ══════════════════════════════════
//  사용자 지시: "처음엔 10~100골드 시세로 하되 4단계 넘어가는 건 1천 단위부터
//  1만 단위 아이템도 있어야 하고, 그에 맞게 능력치도 어마어마해야 해."
//
//  그래서 탑 가격(`cost`)을 **지수로** 키웠다: 15 → 40 → 100 → 380 → 1,400 →
//  4,800 → 15,000 → 42,000. 5단계부터는 "이번 등반의 목표"가 되는 값이다.
//
//  ⚠ 그런데 이 카탈로그는 **대전도 같이 쓴다**(js/arenabuild.js). 대전은 한 판
//    예산 500 이라 지수 가격을 그대로 쓰면 4단계 위로는 영원히 못 산다 —
//    "대전도 8단계를 쓴다"는 결정(v0.87)이 그 자리에서 무효가 된다.
//    → **`vsCost`(대전 전용 가격)를 따로 둔다.** 같은 아이템, 두 통화.
//      탑은 지수로 벌고 지수로 쓰고, 대전은 고정 예산 안에서 고르게 쓴다.
//    카탈로그를 복제하지 않는 것이 핵심이다 — 복제하면 효과값이 조용히 갈라진다.
// ============================================================================
GAME.TowerShopItems = (function () {

  var SLOTS = [
    { key: 'weapon', name: '무기' },
    { key: 'armor', name: '방어구' },
    { key: 'boots', name: '신발' },
    { key: 'accessory', name: '장신구' }
  ];

  //  단계별 탑 가격(공통 뼈대). 슬롯마다 ±10% 안에서 흔든다.
  //    1~3단계 = 10~100 시세(초반), 4단계부터 자릿수가 바뀐다.
  //  ⚠ 이 값을 바꾸면 **골드 수입 곡선(js/towerrun.js 의 goldFor)도 같이** 봐야 한다.
  //    둘이 갈라지면 최상급이 영원히 안 잡히거나(너무 비쌈) 3층에 다 사진다(너무 쌈).
  //
  //  ── 8단 → 10단 (2026-08-03 사용자 지시: "아이템을 더 추가하는 방식으로") ─────
  //  골드 곡선을 피벗한 뒤(towerrun.js 5차) 누적 구매력이 이렇게 된다:
  //    10층 296 · 20층 938 · 30층 2,324
  //  옛 8단 사다리로 사는 시점을 계산하면 3단(세트 410)이 **14층**, 4단(세트 1,520)이
  //  **26층** 이라 그 사이 열두 층 동안 상점에 살 것이 하나도 없었다. 돈만 늘리고
  //  쓸 곳을 안 늘리면 "가난하다"가 "심심하다"로 바뀔 뿐이다.
  //  → **가장 넓은 두 공백**(100→380 은 3.8배, 380→1400 은 3.7배)에 한 단씩 끼웠다.
  //    이제 배율이 약 2배로 고르고, 구매 시점이 4·9·14·18·26·33·40층으로 흩어진다.
  //
  //  ⚠ **키를 다시 매기지 않았다.** 새 단계는 배열 중간에 들어가지만 키는 w9/w10 이다.
  //    순번대로 w4 를 새 것에 주면 이미 '뼈창(w4)'을 낀 채 저장된 캐릭터가 말없이
  //    다른 아이템을 낀 것이 된다. 이 파일의 어떤 코드도 키 숫자를 등급으로 쓰지 않고
  //    (`dropCandidates` 는 `tier = j + 1`, 즉 **배열 순번**을 쓴다) 아트 쪽도 같은 날
  //    순번을 읽도록 고쳤다(js/eggart.js `gearTierOf`). 순서를 정하는 것은 **배열 위치**다.
  var CATALOG = {
    weapon: [
      { key: 'w1', name: '돌칼',        cost: 15,    vsCost: 15,  damageAdd: 8,    note: '공격력 +8' },
      { key: 'w2', name: '청동 도끼',   cost: 40,    vsCost: 30,  damageAdd: 18,   note: '공격력 +18' },
      { key: 'w3', name: '흑요석 검',   cost: 100,   vsCost: 50,  damageAdd: 24, lifestealAdd: 0.06, note: '공격력 +24, 흡혈 +6%' },
      { key: 'w9', name: '이빨 박은 몽둥이', cost: 190, vsCost: 62, damageAdd: 38, note: '공격력 +38' },
      { key: 'w4', name: '뼈창',        cost: 380,   vsCost: 80,  damageAdd: 60,   note: '공격력 +60' },
      { key: 'w10', name: '들소뿔 갈래창',   cost: 700, vsCost: 100, damageAdd: 88, lifestealAdd: 0.04, note: '공격력 +88, 흡혈 +4%' },
      //  ── 취향 분기 (2026-08-22 태현님: "비싸지는 구간에선 각자 취향에 맞게 방향
      //  잡아 선택 — 좀 저렴해도 공격속도가 높아서 그걸 쓴다던가") ──────────────
      //  같은 값대에 세 갈래를 둔다: 순수 공격력 / 공속(저렴·잦은 타격) / 치명(도박수).
      //  atkspeedAdd = 평타 간격 감소 %p · critAdd = 치명타 점수(확률, 50% 넘게 쌓으면
      //  피해 전환 — towerchar.critOf 와 같은 규칙 하나를 쓴다).
      { key: 'w11', name: '질풍 찌르개', cost: 1150,  vsCost: 110, damageAdd: 92,  atkspeedAdd: 14 },
      { key: 'w12', name: '맹수 발톱',   cost: 1250,  vsCost: 115, damageAdd: 88,  critAdd: 12 },
      { key: 'w5', name: '강철 손도끼', cost: 1400,  vsCost: 120, damageAdd: 130, lifestealAdd: 0.10, note: '공격력 +130, 흡혈 +10%' },
      //  ── 2026-08-23 증설(태현님 "300층까지 충분한 구조인지 점검") — 실측:
      //  1,400→4,200(3.0배)·4,800→13,500(2.8배) 두 공백이 각 13개 층이고,
      //  42,000 뒤로는 78층 이후 222개 층 동안 살 것이 없었다. 배율을 2배 안팎으로
      //  고르게 6단을 끼워 300층 언저리(용 본체)까지 사다리가 이어진다.
      { key: 'w16', name: '검은 요석 낫', cost: 2600, vsCost: 140, damageAdd: 150, critAdd: 8, note: '공격력 +150, 치명타 +8%' },
      { key: 'w13', name: '바람의 송곳니', cost: 4200, vsCost: 160, damageAdd: 190, atkspeedAdd: 24 },
      { key: 'w14', name: '사냥신의 눈', cost: 4500, vsCost: 165, damageAdd: 175, critAdd: 22, lifestealAdd: 0.06 },
      { key: 'w6', name: '흑철 대검',   cost: 4800,  vsCost: 170, damageAdd: 290,  note: '공격력 +290' },
      { key: 'w17', name: '멧돼지왕 엄니', cost: 8500, vsCost: 190, damageAdd: 360, lifestealAdd: 0.12, note: '공격력 +360, 흡혈 +12%' },
      { key: 'w15', name: '번개 이빨',   cost: 13500, vsCost: 225, damageAdd: 420, atkspeedAdd: 32, critAdd: 10 },
      { key: 'w7', name: '용골 단검',   cost: 15000, vsCost: 230, damageAdd: 620, lifestealAdd: 0.18, cdrMul: 0.90, note: '공격력 +620, 흡혈 +18%, 스킬 쿨 -10%' },
      { key: 'w18', name: '심연 흑철 창', cost: 25000, vsCost: 260, damageAdd: 850, atkspeedAdd: 20, note: '공격력 +850, 공속 +20' },
      { key: 'w8', name: '여명의 창',   cost: 42000, vsCost: 300, damageAdd: 1350, lifestealAdd: 0.26, note: '공격력 +1350, 흡혈 +26%' },
      { key: 'w19', name: '용비늘 도끼', cost: 95000, vsCost: 340, damageAdd: 2900, lifestealAdd: 0.22, note: '공격력 +2900, 흡혈 +22%' },
      { key: 'w20', name: '태초의 송곳니', cost: 210000, vsCost: 380, damageAdd: 6400, critAdd: 16, lifestealAdd: 0.15, note: '공격력 +6400, 치명타 +16%, 흡혈 +15%' },
      { key: 'w21', name: '용심장 파쇄추', cost: 450000, vsCost: 420, damageAdd: 13500, lifestealAdd: 0.30, cdrMul: 0.85, note: '공격력 +13500, 흡혈 +30%, 스킬 쿨 -15%' }
    ],
    armor: [
      { key: 'a1', name: '가죽 갑옷',     cost: 15,    vsCost: 15,  hpAdd: 140,   note: '체력 +140' },
      { key: 'a2', name: '뼈 갑옷',       cost: 40,    vsCost: 30,  hpAdd: 260,  armorAdd: 12, note: '체력 +260, 방어력 +12' },
      { key: 'a3', name: '거북등 갑옷',   cost: 100,   vsCost: 50,  hpAdd: 360,  armorAdd: 18, note: '체력 +360, 방어력 +18' },
      { key: 'a9', name: '늑대가죽 흉갑', cost: 190,   vsCost: 62,  hpAdd: 560,  armorAdd: 25, note: '체력 +560, 방어력 +25' },
      { key: 'a4', name: '강철 흉갑',     cost: 380,   vsCost: 80,  hpAdd: 900,  armorAdd: 34, note: '체력 +900, 방어력 +34' },
      { key: 'a10', name: '매머드 뼈 갑주', cost: 700, vsCost: 100, hpAdd: 1400, armorAdd: 45, note: '체력 +1400, 방어력 +45' },
      { key: 'a5', name: '흑요석 판금',   cost: 1400,  vsCost: 120, hpAdd: 2100, armorAdd: 58, note: '체력 +2100, 방어력 +58' },
      { key: 'a6', name: '용비늘 갑옷',   cost: 4800,  vsCost: 170, hpAdd: 4800, armorAdd: 95, note: '체력 +4800, 방어력 +95' },
      { key: 'a7', name: '대지의 갑주',   cost: 15000, vsCost: 230, hpAdd: 11000, armorAdd: 155, note: '체력 +11000, 방어력 +155' },
      { key: 'a8', name: '불멸의 등딱지', cost: 42000, vsCost: 300, hpAdd: 25000, armorAdd: 260, note: '체력 +25000, 방어력 +260' }
    ],
    boots: [
      // ⚠ 이동속도만은 지수로 못 올린다 — 영웅 기본이 142~158 인데 +600 을 주면
      //   한 프레임 이동거리가 히트박스를 뛰어넘어 **충돌·회피 판정이 깨진다.**
      //   그래서 신발은 속도를 완만하게 올리고 남는 값어치를 **쿨감**으로 준다.
      { key: 'b1', name: '짚신',            cost: 12,    vsCost: 12,  speedAdd: 25,  note: '이동속도 +25' },
      { key: 'b2', name: '가죽 장화',       cost: 35,    vsCost: 25,  speedAdd: 48,  note: '이동속도 +48' },
      { key: 'b3', name: '깃털 장화',       cost: 90,    vsCost: 40,  speedAdd: 72,  cdrMul: 0.88, note: '이동속도 +72, 스킬 쿨 -12%' },
      { key: 'b9', name: '이끼 감은 신',    cost: 175,   vsCost: 52,  speedAdd: 86,  cdrMul: 0.86, note: '이동속도 +86, 스킬 쿨 -14%' },
      { key: 'b4', name: '여우가죽 장화',   cost: 340,   vsCost: 65,  speedAdd: 100, cdrMul: 0.84, note: '이동속도 +100, 스킬 쿨 -16%' },
      { key: 'b10', name: '사슴 힘줄 신',   cost: 650,   vsCost: 82,  speedAdd: 115, cdrMul: 0.81, note: '이동속도 +115, 스킬 쿨 -19%' },
      { key: 'b5', name: '바람 신발',       cost: 1250,  vsCost: 100, speedAdd: 130, cdrMul: 0.78, note: '이동속도 +130, 스킬 쿨 -22%' },
      { key: 'b6', name: '유령 걸음',       cost: 4300,  vsCost: 150, speedAdd: 160, cdrMul: 0.70, note: '이동속도 +160, 스킬 쿨 -30%' },
      { key: 'b7', name: '폭풍 딛기',       cost: 13500, vsCost: 210, speedAdd: 195, cdrMul: 0.60, note: '이동속도 +195, 스킬 쿨 -40%' },
      { key: 'b8', name: '시간을 앞선 신',  cost: 38000, vsCost: 280, speedAdd: 230, cdrMul: 0.48, note: '이동속도 +230, 스킬 쿨 -52%' }
    ],
    // 장신구 — 스탯 4종에 안 걸리는 보조 효과 + 행운.
    accessory: [
      { key: 'c1', name: '부적 목걸이',       cost: 20,    vsCost: 20,  luckAdd: 1, note: '행운 +1' },
      { key: 'c2', name: '늑대 이빨 목걸이',  cost: 50,    vsCost: 45,  lifestealAdd: 0.05, note: '흡혈 +5%' },
      { key: 'c3', name: '매의 깃털 장식',    cost: 120,   vsCost: 70,  cdrMul: 0.92, luckAdd: 1, note: '스킬 쿨 -8%, 행운 +1' },
      { key: 'c9', name: '멧돼지 송곳니 팔찌', cost: 230,  vsCost: 88,  lifestealAdd: 0.10, luckAdd: 2, note: '흡혈 +10%, 행운 +2' },
      { key: 'c4', name: '곰 발톱 부적',      cost: 450,   vsCost: 110, armorAdd: 30, damageAdd: 28, note: '방어력 +30, 공격력 +28' },
      { key: 'c10', name: '조상의 뼈 고리',   cost: 850,   vsCost: 135, armorAdd: 50, damageAdd: 55, luckAdd: 2, note: '방어력 +50, 공격력 +55, 행운 +2' },
      { key: 'c11', name: '벼락 부싯돌',      cost: 1450,  vsCost: 150, atkspeedAdd: 12, critAdd: 8 },
      { key: 'c5', name: '심장 조각',         cost: 1600,  vsCost: 160, hpAdd: 1400, luckAdd: 3, note: '체력 +1400, 행운 +3' },
      { key: 'c12', name: '맹금의 눈알',      cost: 5200,  vsCost: 210, critAdd: 20, damageAdd: 90, luckAdd: 2 },
      { key: 'c6', name: '그림자 반지',       cost: 5500,  vsCost: 220, cdrMul: 0.80, speedAdd: 70, damageAdd: 120, note: '스킬 쿨 -20%, 이동속도 +70, 공격력 +120' },
      { key: 'c7', name: '늪지 정수병',       cost: 17000, vsCost: 280, lifestealAdd: 0.22, damageAdd: 320, luckAdd: 6, note: '흡혈 +22%, 공격력 +320, 행운 +6' },
      { key: 'c8', name: '여명의 인장',       cost: 48000, vsCost: 360, hpAdd: 9000, armorAdd: 120, damageAdd: 700, luckAdd: 12, note: '체력 +9000, 방어력 +120, 공격력 +700, 행운 +12' }
    ]
  };

  return {
    SLOTS: SLOTS,
    CATALOG: CATALOG,
    // ── 무기 이름은 **영웅마다 다르다** (2026-08-01 사용자 지시) ─────────────────
    //  "각 영웅에 맞는 무기로 컨셉잡아주고."
    //
    //  ## 무엇이 어긋나 있었나
    //  무기 이름이 '뼈창'·'용골 단검'·'여명의 창' 처럼 **구체적인 무기 종류**인데,
    //  화면에 그려지는 것은 언제나 **그 영웅 고유의 무기**다(광전사 대검 · 사냥꾼 장궁 ·
    //  파수꾼 갈고리 방패 — js/eggart.js 의 `gear` 키). 그래서 사냥꾼이 '여명의 창'을
    //  사면 **이름은 창인데 손에는 활**을 든다. 이름과 그림이 서로 다른 말을 했다.
    //
    //  ## 어떻게 고치나
    //  등급(재질)은 그대로 두고 **무기 종류만 영웅을 따라간다.** 아이템 키(w1~w8)와
    //  값·수치는 하나도 안 건드린다 — 저장된 캐릭터가 그대로 살아 있어야 한다.
    //  ⚠ 재질 이름은 `UI.GEAR_TIERS` 의 등급 순서(돌·청동·흑요석·뼈·강철·흑철·용골·여명)와
    //    **같은 줄에 세운다.** 어긋나면 그림은 청동인데 이름은 강철인 상태가 된다.
    //  ⚠⚠ **표 길이가 카탈로그와 같아야 한다.** v1.46 에서 무기를 8 → 10 단으로
    //    늘리면서 이 표를 안 늘렸더니, `nameFor` 가 배열 순번으로 읽는 탓에 4단부터
    //    이름이 한 칸씩 밀렸다 — 공격력 +38 짜리 새 무기가 '뼈 대검'(원래 5단 이름)으로
    //    뜨고, 마지막 두 개는 표 밖이라 영웅과 무관한 기본 이름이 나왔다(실측).
    //    **단계를 늘릴 때 이 세 줄을 같이 늘릴 것.**
    WEAPON_NAMES: {
      vanguard: ['돌 대검', '청동 대검', '흑요석 대검', '이빨 대검', '뼈 대검',
                 '들소뿔 대검', '질풍 대검', '맹수 대검', '강철 대검',
                 '바람의 대검', '사냥신의 대검', '흑철 대검', '번개 대검',
                 '용골 대검', '여명의 대검'],
      ranger:   ['나무 활', '청동 활', '흑요석 활', '이빨 활', '뼈 활',
                 '들소뿔 활', '질풍 활', '맹수 활', '강철 활',
                 '바람의 활', '사냥신의 활', '흑철 활', '번개 활',
                 '용골 활', '여명의 활'],
      warden:   ['나무 방패', '청동 방패', '흑요석 방패', '이빨 방패', '뼈 방패',
                 '들소뿔 방패', '질풍 방패', '맹수 방패', '강철 방패',
                 '바람의 방패', '사냥신의 방패', '흑철 방패', '번개 방패',
                 '용골 방패', '여명의 방패']
    },

    // 이 영웅이 들었을 때 이 아이템의 이름. 무기가 아니면 원래 이름 그대로.
    nameFor: function (it, heroKey) {
      if (!it) return '';
      var tbl = heroKey && this.WEAPON_NAMES[heroKey];
      if (!tbl) return it.name;
      var list = CATALOG.weapon || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].key === it.key) return tbl[i] || it.name;
      }
      return it.name;                       // 무기 슬롯이 아니다
    },

    find: function (slotKey, itemKey) {
      var list = CATALOG[slotKey] || [];
      for (var i = 0; i < list.length; i++) if (list[i].key === itemKey) return list[i];
      return null;
    },
    // 대전 가격 — 없으면 탑 가격으로 떨어진다(표에 빠진 항목이 있어도 안 죽는다).
    vsCostOf: function (it) {
      return (it && typeof it.vsCost === 'number') ? it.vsCost : (it ? it.cost : 0);
    },

    // ── 효과 문구를 **값에서 만든다** (2026-08-01 사용자 신고: "아이템 설명이 안 뜨는
    //    게 있어") ──────────────────────────────────────────────────────────────
    //  원인: 효과가 3~4개인 장신구(그림자 반지·여명의 인장)는 손으로 쓴 `note` 가 길어
    //  폰 카드에서 두 줄을 넘겼고, 넘치면 **숨기는** 안전장치가 발동해 설명이 통째로
    //  사라졌다. 숨기는 건 답이 아니다 — 사용자가 요구한 것이 바로 그 설명이다.
    //
    //  그래서 문자열을 자르는 대신 **값에서 짧게 다시 만든다**:
    //   · 라벨을 줄인다(공격력→공격 · 이동속도→속도 · 스킬 쿨→쿨)
    //   · 큰 수는 축약한다(9000 → 9k) — `UI.numAbbr` 과 같은 규칙
    //  덤으로 손으로 쓴 `note` 가 실제 값과 어긋날 위험도 사라진다(값이 곧 설명이다).
    noteOf: function (it, compact) {
      if (!it) return '';
      var ab = function (n) {
        return (GAME.UI && GAME.UI.numAbbr) ? GAME.UI.numAbbr(n) : String(n);
      };
      // ⚠ 라벨 길이를 **효과 개수에 따라** 바꾼다. 폰 카드 한 줄은 실측 약 26자인데,
      //   효과 4개짜리(여명의 인장)는 2자 라벨로도 25자라 아슬아슬하게 두 줄로 접혀
      //   카드를 11px 넘쳤다(실측). 4개 이상일 때만 1자 라벨로 줄인다 —
      //   흔한 1~3효과 아이템의 가독성은 그대로 두고 예외만 조인다.
      var n4 = 0;
      ['damageAdd', 'hpAdd', 'armorAdd', 'speedAdd', 'lifestealAdd', 'luckAdd',
       'atkspeedAdd', 'critAdd'].forEach(function (k) {
        if (it[k]) n4++;
      });
      if (it.cdrMul && it.cdrMul !== 1) n4++;
      var tight = compact && n4 >= 4;
      var L = tight
        ? { dmg: '공', hp: '체', arm: '방', spd: '속', ls: '흡', cd: '쿨', lk: '운', as2: '공속', cr: '치명' }
        : (compact
            ? { dmg: '공격', hp: '체력', arm: '방어', spd: '속도', ls: '흡혈', cd: '쿨', lk: '행운', as2: '공속', cr: '치명' }
            : { dmg: '공격력', hp: '체력', arm: '방어력', spd: '이동속도', ls: '흡혈', cd: '스킬 쿨', lk: '행운', as2: '공격속도', cr: '치명타' });
      // 압축 모드는 라벨과 값 사이 공백도 뺀다 — 실측으로 이 한 칸이 줄바꿈을 갈랐다.
      //   4효과 장신구 기준: "공격 +700  체력 +9k …"(2줄) → "공격+700 체력+9k …"(1줄)
      var sp = compact ? '' : ' ';
      var p = [];
      if (it.damageAdd) p.push(L.dmg + sp + '+' + ab(it.damageAdd));
      if (it.hpAdd) p.push(L.hp + sp + '+' + ab(it.hpAdd));
      if (it.armorAdd) p.push(L.arm + sp + '+' + ab(it.armorAdd));
      if (it.speedAdd) p.push(L.spd + sp + '+' + ab(it.speedAdd));
      if (it.lifestealAdd) p.push(L.ls + sp + '+' + Math.round(it.lifestealAdd * 100) + '%');
      if (it.cdrMul && it.cdrMul !== 1) p.push(L.cd + sp + '-' + Math.round((1 - it.cdrMul) * 100) + '%');
      if (it.luckAdd) p.push(L.lk + sp + '+' + it.luckAdd);
      if (it.atkspeedAdd) p.push(L.as2 + sp + '+' + it.atkspeedAdd + '%');
      if (it.critAdd) p.push(L.cr + sp + '+' + it.critAdd);
      return p.join(compact ? ' ' : ', ');
    }
  };
})();
