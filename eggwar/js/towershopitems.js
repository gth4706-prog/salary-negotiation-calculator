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
  var CATALOG = {
    weapon: [
      { key: 'w1', name: '돌칼',        cost: 15,    vsCost: 15,  damageAdd: 8,    note: '공격력 +8' },
      { key: 'w2', name: '청동 도끼',   cost: 40,    vsCost: 30,  damageAdd: 18,   note: '공격력 +18' },
      { key: 'w3', name: '흑요석 검',   cost: 100,   vsCost: 50,  damageAdd: 24, lifestealAdd: 0.06, note: '공격력 +24, 흡혈 +6%' },
      { key: 'w4', name: '뼈창',        cost: 380,   vsCost: 80,  damageAdd: 60,   note: '공격력 +60' },
      { key: 'w5', name: '강철 손도끼', cost: 1400,  vsCost: 120, damageAdd: 130, lifestealAdd: 0.10, note: '공격력 +130, 흡혈 +10%' },
      { key: 'w6', name: '흑철 대검',   cost: 4800,  vsCost: 170, damageAdd: 290,  note: '공격력 +290' },
      { key: 'w7', name: '용골 단검',   cost: 15000, vsCost: 230, damageAdd: 620, lifestealAdd: 0.18, cdrMul: 0.90, note: '공격력 +620, 흡혈 +18%, 스킬 쿨 -10%' },
      { key: 'w8', name: '여명의 창',   cost: 42000, vsCost: 300, damageAdd: 1350, lifestealAdd: 0.26, note: '공격력 +1350, 흡혈 +26%' }
    ],
    armor: [
      { key: 'a1', name: '가죽 갑옷',     cost: 15,    vsCost: 15,  hpAdd: 140,   note: '체력 +140' },
      { key: 'a2', name: '뼈 갑옷',       cost: 40,    vsCost: 30,  hpAdd: 260,  armorAdd: 12, note: '체력 +260, 방어력 +12' },
      { key: 'a3', name: '거북등 갑옷',   cost: 100,   vsCost: 50,  hpAdd: 360,  armorAdd: 18, note: '체력 +360, 방어력 +18' },
      { key: 'a4', name: '강철 흉갑',     cost: 380,   vsCost: 80,  hpAdd: 900,  armorAdd: 34, note: '체력 +900, 방어력 +34' },
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
      { key: 'b4', name: '여우가죽 장화',   cost: 340,   vsCost: 65,  speedAdd: 100, cdrMul: 0.84, note: '이동속도 +100, 스킬 쿨 -16%' },
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
      { key: 'c4', name: '곰 발톱 부적',      cost: 450,   vsCost: 110, armorAdd: 30, damageAdd: 28, note: '방어력 +30, 공격력 +28' },
      { key: 'c5', name: '심장 조각',         cost: 1600,  vsCost: 160, hpAdd: 1400, luckAdd: 3, note: '체력 +1400, 행운 +3' },
      { key: 'c6', name: '그림자 반지',       cost: 5500,  vsCost: 220, cdrMul: 0.80, speedAdd: 70, damageAdd: 120, note: '스킬 쿨 -20%, 이동속도 +70, 공격력 +120' },
      { key: 'c7', name: '늪지 정수병',       cost: 17000, vsCost: 280, lifestealAdd: 0.22, damageAdd: 320, luckAdd: 6, note: '흡혈 +22%, 공격력 +320, 행운 +6' },
      { key: 'c8', name: '여명의 인장',       cost: 48000, vsCost: 360, hpAdd: 9000, armorAdd: 120, damageAdd: 700, luckAdd: 12, note: '체력 +9000, 방어력 +120, 공격력 +700, 행운 +12' }
    ]
  };

  return {
    SLOTS: SLOTS,
    CATALOG: CATALOG,
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
      ['damageAdd', 'hpAdd', 'armorAdd', 'speedAdd', 'lifestealAdd', 'luckAdd'].forEach(function (k) {
        if (it[k]) n4++;
      });
      if (it.cdrMul && it.cdrMul !== 1) n4++;
      var tight = compact && n4 >= 4;
      var L = tight
        ? { dmg: '공', hp: '체', arm: '방', spd: '속', ls: '흡', cd: '쿨', lk: '운' }
        : (compact
            ? { dmg: '공격', hp: '체력', arm: '방어', spd: '속도', ls: '흡혈', cd: '쿨', lk: '행운' }
            : { dmg: '공격력', hp: '체력', arm: '방어력', spd: '이동속도', ls: '흡혈', cd: '스킬 쿨', lk: '행운' });
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
      return p.join(compact ? ' ' : ', ');
    }
  };
})();
