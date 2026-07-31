window.GAME = window.GAME || {};

// ============================================================================
//  통곡의 탑 전용 확장 아이템 카탈로그 (2026-08-01)
//
//  사용자 지시: "아이템 종류를 대폭 늘려주고 물약 시스템은 없애줘."
//
//  ⚠ `GAME.ITEMS`(js/items.js, 대전·수성의 탑 공용)는 **전혀 건드리지 않는다.**
//    그 테이블에 물약을 지우거나 항목을 더하면 대전(ArenaBuild)의 예산 계산과
//    수성의 탑(defend.js)의 AI 자동구매 목록이 조용히 같이 움직인다. 대신 여기에
//    **완전히 새로운 테이블**을 만든다 — 물약 슬롯 자체가 없으므로 "물약 제거"가
//    저절로 성립하고(탑 전투에서는 애초에 물약을 가질 수 없다), 대전은 무변화다.
//
//  슬롯 4종: 무기 / 방어구 / 신발 / 장신구(신규 — 요청 16의 "네모 박스" 여러 칸에
//  대응, 행운·흡혈·쿨감처럼 스탯 4종에 안 걸리는 보조 효과를 담는다).
//  각 슬롯 8단계 — 기존 3단계에서 대폭 확충. 가격은 영구 진행(수십 회 등반)을
//  전제로 옛 3단계(15~50)보다 훨씬 높은 상한(300)까지 늘렸다.
// ============================================================================
GAME.TowerShopItems = (function () {

  var SLOTS = [
    { key: 'weapon', name: '무기' },
    { key: 'armor', name: '방어구' },
    { key: 'boots', name: '신발' },
    { key: 'accessory', name: '장신구' }
  ];

  var CATALOG = {
    weapon: [
      { key: 'w1', name: '돌칼', cost: 15, damageAdd: 8, note: '공격력 +8' },
      { key: 'w2', name: '청동 도끼', cost: 30, damageAdd: 18, note: '공격력 +18' },
      { key: 'w3', name: '흑요석 검', cost: 50, damageAdd: 24, lifestealAdd: 0.06, note: '공격력 +24, 흡혈 +6%' },
      { key: 'w4', name: '뼈창', cost: 80, damageAdd: 34, note: '공격력 +34' },
      { key: 'w5', name: '강철 손도끼', cost: 120, damageAdd: 46, lifestealAdd: 0.08, note: '공격력 +46, 흡혈 +8%' },
      { key: 'w6', name: '흑철 대검', cost: 170, damageAdd: 60, note: '공격력 +60' },
      { key: 'w7', name: '용골 단검', cost: 230, damageAdd: 78, lifestealAdd: 0.12, cdrMul: 0.94, note: '공격력 +78, 흡혈 +12%, 스킬 쿨 -6%' },
      { key: 'w8', name: '여명의 창', cost: 300, damageAdd: 100, lifestealAdd: 0.16, note: '공격력 +100, 흡혈 +16%' }
    ],
    armor: [
      { key: 'a1', name: '가죽 갑옷', cost: 15, hpAdd: 140, note: '체력 +140' },
      { key: 'a2', name: '뼈 갑옷', cost: 30, hpAdd: 260, armorAdd: 12, note: '체력 +260, 방어력 +12' },
      { key: 'a3', name: '거북등 갑옷', cost: 50, hpAdd: 360, armorAdd: 18, note: '체력 +360, 방어력 +18' },
      { key: 'a4', name: '강철 흉갑', cost: 80, hpAdd: 480, armorAdd: 26, note: '체력 +480, 방어력 +26' },
      { key: 'a5', name: '흑요석 판금', cost: 120, hpAdd: 620, armorAdd: 34, note: '체력 +620, 방어력 +34' },
      { key: 'a6', name: '용비늘 갑옷', cost: 170, hpAdd: 780, armorAdd: 42, note: '체력 +780, 방어력 +42' },
      { key: 'a7', name: '대지의 갑주', cost: 230, hpAdd: 950, armorAdd: 52, note: '체력 +950, 방어력 +52' },
      { key: 'a8', name: '불멸의 등딱지', cost: 300, hpAdd: 1150, armorAdd: 64, note: '체력 +1150, 방어력 +64' }
    ],
    boots: [
      { key: 'b1', name: '짚신', cost: 12, speedAdd: 25, note: '이동속도 +25' },
      { key: 'b2', name: '가죽 장화', cost: 25, speedAdd: 48, note: '이동속도 +48' },
      { key: 'b3', name: '깃털 장화', cost: 40, speedAdd: 72, cdrMul: 0.88, note: '이동속도 +72, 스킬 쿨 -12%' },
      { key: 'b4', name: '여우가죽 장화', cost: 65, speedAdd: 95, note: '이동속도 +95' },
      { key: 'b5', name: '바람 신발', cost: 100, speedAdd: 120, cdrMul: 0.84, note: '이동속도 +120, 스킬 쿨 -16%' },
      { key: 'b6', name: '유령 걸음', cost: 150, speedAdd: 145, note: '이동속도 +145' },
      { key: 'b7', name: '폭풍 딛기', cost: 210, speedAdd: 170, cdrMul: 0.78, note: '이동속도 +170, 스킬 쿨 -22%' },
      { key: 'b8', name: '시간을 앞선 신', cost: 280, speedAdd: 200, cdrMul: 0.72, note: '이동속도 +200, 스킬 쿨 -28%' }
    ],
    // 신규 슬롯 — 스탯 4종에 안 걸리는 보조 효과. `luckAdd` 는 TowerChar.luckLevel 이
    // 능력치의 행운 레벨과 합쳐 읽는다(js/towerchar.js 참조).
    accessory: [
      { key: 'c1', name: '부적 목걸이', cost: 20, luckAdd: 1, note: '행운 +1' },
      { key: 'c2', name: '늑대 이빨 목걸이', cost: 45, lifestealAdd: 0.05, note: '흡혈 +5%' },
      { key: 'c3', name: '매의 깃털 장식', cost: 70, cdrMul: 0.92, note: '스킬 쿨 -8%' },
      { key: 'c4', name: '곰 발톱 부적', cost: 110, armorAdd: 14, damageAdd: 10, note: '방어력 +14, 공격력 +10' },
      { key: 'c5', name: '심장 조각', cost: 160, hpAdd: 300, luckAdd: 1, note: '체력 +300, 행운 +1' },
      { key: 'c6', name: '그림자 반지', cost: 220, cdrMul: 0.85, speedAdd: 40, note: '스킬 쿨 -15%, 이동속도 +40' },
      { key: 'c7', name: '늪지 정수병', cost: 280, lifestealAdd: 0.10, damageAdd: 20, note: '흡혈 +10%, 공격력 +20' },
      { key: 'c8', name: '여명의 인장', cost: 360, hpAdd: 400, armorAdd: 20, damageAdd: 15, luckAdd: 2, note: '체력 +400, 방어력 +20, 공격력 +15, 행운 +2' }
    ]
  };

  return {
    SLOTS: SLOTS,
    CATALOG: CATALOG,
    find: function (slotKey, itemKey) {
      var list = CATALOG[slotKey] || [];
      for (var i = 0; i < list.length; i++) if (list[i].key === itemKey) return list[i];
      return null;
    }
  };
})();
