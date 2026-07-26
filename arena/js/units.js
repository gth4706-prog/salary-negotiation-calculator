window.GAME = window.GAME || {};

// 유닛 정의 테이블.
// attack 타입: melee / projectile / aoe = 논타겟(회피 가능), targeted = 자동명중(회피 불가)
// armor(방어력): 비율 경감 — 100/(100+armor) 만큼만 피해가 들어간다.
//   정액 차감으로 하면 방어력 높은 대상에게 약한 공격 다수(=물량)가 무력화되어
//   '물량' 이라는 전략 축 자체가 죽는다. 그래서 비율 방식을 쓴다.
GAME.UNITS = {
  warrior: {
    key: 'warrior',
    name: '전사',
    desc: '논타겟 근접. 싸고 튼튼한 벽.',
    cost: 10,
    hp: 240,
    armor: 30,
    speed: 135,
    range: 52,
    damage: 24,
    cooldown: 800,
    attack: 'melee',
    coneDeg: 90,
    radius: 13,
    shape: 'square',
    weapon: 'sword',
    // 배치 지점에서 이만큼까지는 쫓아나갈 수 있다. 근접은 진형을 깨고 달려든다.
    // aggro 를 좁게 잡아 '가까운 몇 기만' 반응하게 한다. 전부 한꺼번에 달려들면
    // 진형이 그냥 뭉텅이 돌격이 되고, 영웅이 순식간에 녹아 배울 틈이 없다.
    chase: 270,
    aggro: 210
  },
  archer: {
    key: 'archer',
    name: '궁수',
    desc: '논타겟 직선 투사체. 보고 피할 수 있다.',
    cost: 15,
    hp: 140,
    armor: 10,
    speed: 115,
    range: 330,
    damage: 36,
    cooldown: 1300,
    attack: 'projectile',
    projectileSpeed: 230,
    projectileRadius: 7,
    radius: 11,
    shape: 'triangle',
    weapon: 'bow',
    // 원거리는 자리를 지키며 쏜다. 조금만 움직인다.
    chase: 150,
    aggro: 360
  },
  mage: {
    key: 'mage',
    name: '마법사',
    desc: '논타겟 광역. 예고 후 폭발, 구역 봉쇄.',
    cost: 25,
    hp: 120,
    armor: 5,
    speed: 95,
    range: 300,
    damage: 60,
    cooldown: 2500,
    attack: 'aoe',
    aoeRadius: 62,
    telegraph: 900,
    radius: 12,
    shape: 'diamond',
    weapon: 'staff',
    chase: 130,
    aggro: 330
  },
  sniper: {
    key: 'sniper',
    name: '저격수',
    desc: '타겟 자동명중. 회피 불가. 매우 비쌈.',
    cost: 40,
    hp: 100,
    armor: 5,
    speed: 90,
    range: 420,
    damage: 70,
    cooldown: 3000,
    attack: 'targeted',
    bulletSpeed: 760,
    radius: 11,
    shape: 'hex',
    weapon: 'rifle',
    chase: 110,
    aggro: 440
  }
};

GAME.UNIT_ORDER = ['warrior', 'archer', 'mage', 'sniper'];

GAME.isNonTarget = function (def) {
  return def.attack !== 'targeted';
};

// 스탯 막대 표시용 정의. get=원값, max는 아래에서 유닛 전체 최댓값으로 자동 채운다.
GAME.STAT_DEFS = [
  { key: '공격력', get: function (d) { return d.damage; }, fmt: function (d) { return String(d.damage); } },
  { key: '공격속도', get: function (d) { return 1000 / d.cooldown; }, fmt: function (d) { return (1000 / d.cooldown).toFixed(2) + '/s'; } },
  { key: '체력', get: function (d) { return d.hp; }, fmt: function (d) { return String(d.hp); } },
  { key: '방어력', get: function (d) { return d.armor; }, fmt: function (d) { return String(d.armor); } },
  { key: '이동속도', get: function (d) { return d.speed; }, fmt: function (d) { return String(d.speed); } }
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
