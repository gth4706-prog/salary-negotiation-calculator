window.GAME = window.GAME || {};

// 영웅 비용을 쓰고 남은 예산으로 사는 아이템. Egg War — 원시 부족 장비.
// 분류: 무기(공격력) / 방어구(체력·방어력) / 신발(이동속도) / 물약(전투 중 회복)
// 각 분류에서 하나씩만 장착할 수 있다 — 조합 선택이 곧 빌드가 되게.
GAME.ITEM_SLOTS = [
  { key: 'weapon', name: '무기' },
  { key: 'armor', name: '방어구' },
  { key: 'boots', name: '신발' },
  { key: 'potion', name: '물약' }
];

GAME.ITEMS = {
  weapon: [
    { key: 'w1', name: '돌칼', cost: 15, damageAdd: 8, note: '공격력 +8' },
    { key: 'w2', name: '청동 도끼', cost: 30, damageAdd: 18, note: '공격력 +18' },
    { key: 'w3', name: '흑요석 검', cost: 50, damageAdd: 24, lifestealAdd: 0.06, note: '공격력 +24, 흡혈 +6%' }
  ],
  armor: [
    { key: 'a1', name: '가죽 갑옷', cost: 15, hpAdd: 140, note: '체력 +140' },
    { key: 'a2', name: '뼈 갑옷', cost: 30, hpAdd: 260, armorAdd: 12, note: '체력 +260, 방어력 +12' },
    { key: 'a3', name: '거북등 갑옷', cost: 50, hpAdd: 360, armorAdd: 18, note: '체력 +360, 방어력 +18' }
  ],
  boots: [
    { key: 'b1', name: '짚신', cost: 12, speedAdd: 25, note: '이동속도 +25' },
    { key: 'b2', name: '가죽 장화', cost: 25, speedAdd: 48, note: '이동속도 +48' },
    { key: 'b3', name: '깃털 장화', cost: 40, speedAdd: 72, cdrMul: 0.88, note: '이동속도 +72, 스킬 쿨 -12%' }
  ],
  potion: [
    { key: 'p1', name: '옹달샘 물', cost: 10, heal: 220, charges: 1, note: '회복 220 · 1회' },
    { key: 'p2', name: '말린 열매', cost: 20, heal: 400, charges: 1, note: '회복 400 · 1회' },
    { key: 'p3', name: '약초 주머니', cost: 35, heal: 340, charges: 2, note: '회복 340 · 2회' }
  ]
};

GAME.Items = {
  find: function (slotKey, itemKey) {
    var list = GAME.ITEMS[slotKey] || [];
    for (var i = 0; i < list.length; i++) if (list[i].key === itemKey) return list[i];
    return null;
  },

  // 선택된 아이템들의 총 비용
  totalCost: function (chosen) {
    var t = 0;
    for (var s = 0; s < GAME.ITEM_SLOTS.length; s++) {
      var sk = GAME.ITEM_SLOTS[s].key;
      var it = chosen[sk] ? this.find(sk, chosen[sk]) : null;
      if (it) t += it.cost;
    }
    return t;
  },

  // 영웅 기본 스탯 + 아이템 보정 → 실제 전투에 쓰일 스탯
  applyTo: function (heroDef, chosen) {
    var out = {
      hp: heroDef.hp,
      armor: heroDef.armor,
      damage: heroDef.damage,
      speed: heroDef.speed,
      lifesteal: heroDef.lifesteal || 0,
      cdrMul: 1,
      potionHeal: 0,
      potionCharges: 0
    };
    for (var s = 0; s < GAME.ITEM_SLOTS.length; s++) {
      var sk = GAME.ITEM_SLOTS[s].key;
      var it = chosen && chosen[sk] ? this.find(sk, chosen[sk]) : null;
      if (!it) continue;
      if (it.hpAdd) out.hp += it.hpAdd;
      if (it.armorAdd) out.armor += it.armorAdd;
      if (it.damageAdd) out.damage += it.damageAdd;
      if (it.speedAdd) out.speed += it.speedAdd;
      if (it.lifestealAdd) out.lifesteal += it.lifestealAdd;
      if (it.cdrMul) out.cdrMul *= it.cdrMul;
      if (it.heal) { out.potionHeal = it.heal; out.potionCharges = it.charges || 1; }
    }
    return out;
  }
};
