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
    shape: 'square'
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
    shape: 'triangle'
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
    shape: 'diamond'
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
    radius: 11,
    shape: 'hex'
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
