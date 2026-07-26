window.GAME = window.GAME || {};

// 세계관: 한국 군대 — 고증보다 패러디 쪽. 소재만 빌려오고 톤은 가볍게.
//
// attack: melee / projectile / aoe = 논타겟(회피 가능), targeted = 자동명중(회피 불가),
//         none = 공격하지 않는 지원 유닛
// armor: 비율 경감 — 100/(100+armor) 만큼만 피해가 들어간다.
//   정액 차감으로 하면 방어력 높은 대상에게 약한 공격 다수(=물량)가 무력화되어
//   '물량' 이라는 전략 축 자체가 죽는다. 그래서 비율 방식을 쓴다.
// chase/aggro: 배치를 깨고 쫓아나갈 수 있는 거리와 반응 범위. chase 0 이면 고정이다.
GAME.UNITS = {
  bayonet: {
    key: 'bayonet', name: '대검병', desc: '대검 하나 들고 달려든다. 싸고 튼튼한 벽.',
    cost: 10, hp: 240, armor: 30, speed: 135, range: 52, damage: 24, cooldown: 800,
    attack: 'melee', coneDeg: 90, radius: 13, shape: 'square', weapon: 'bayonet',
    chase: 270, aggro: 210
  },

  rifleman: {
    key: 'rifleman', name: '소총수', desc: 'K2 소총. 논타겟 직선 사격이라 보고 피할 수 있다.',
    cost: 15, hp: 140, armor: 10, speed: 115, range: 330, damage: 36, cooldown: 1300,
    attack: 'projectile', projectileSpeed: 240, projectileRadius: 6,
    radius: 11, shape: 'triangle', weapon: 'rifle',
    chase: 150, aggro: 360
  },

  grenadier: {
    key: 'grenadier', name: '유탄수', desc: 'K201 유탄. 예고 후 터지는 광역 — 구역을 봉쇄한다.',
    cost: 25, hp: 120, armor: 5, speed: 95, range: 300, damage: 60, cooldown: 2500,
    attack: 'aoe', aoeRadius: 62, telegraph: 900,
    radius: 12, shape: 'diamond', weapon: 'launcher',
    chase: 130, aggro: 330
  },

  sniper: {
    key: 'sniper', name: '저격수', desc: 'K14. 유도되어 반드시 맞는다. 비싼 대신 회피 불가.',
    cost: 40, hp: 100, armor: 5, speed: 90, range: 420, damage: 70, cooldown: 3000,
    attack: 'targeted', bulletSpeed: 760,
    radius: 11, shape: 'hex', weapon: 'sniperRifle',
    chase: 110, aggro: 440
  },

  // ── 지원 계열 ──────────────────────────────────────────────
  medic: {
    key: 'medic', name: '위생병', desc: '주변 아군을 주기적으로 회복시킨다. 스스로는 안 싸운다.',
    cost: 30, hp: 130, armor: 10, speed: 105, range: 0, damage: 0, cooldown: 1000,
    attack: 'none',
    healRadius: 150, healPerTick: 14, healInterval: 1000,
    radius: 11, shape: 'cross', weapon: 'aidkit',
    chase: 140, aggro: 0
  },

  shieldman: {
    key: 'shieldman', name: '방탄병', desc: '방탄복으로 아군에게 갈 투사체를 대신 맞는다. 공격력은 낮다.',
    cost: 25, hp: 420, armor: 45, speed: 100, range: 50, damage: 10, cooldown: 1100,
    attack: 'melee', coneDeg: 80,
    intercept: 46,          // 이 반경 안을 지나는 적 투사체를 대신 맞는다
    radius: 15, shape: 'shield', weapon: 'riotShield',
    chase: 200, aggro: 240
  },

  sergeant: {
    key: 'sergeant', name: '분대장', desc: '주변 아군의 공격력을 올린다. 진형의 심장.',
    cost: 35, hp: 170, armor: 20, speed: 110, range: 240, damage: 20, cooldown: 1500,
    attack: 'projectile', projectileSpeed: 260, projectileRadius: 5,
    buffRadius: 190, buffDamageMul: 1.30,
    radius: 12, shape: 'star', weapon: 'pistol',
    chase: 160, aggro: 300
  },

  // ── 고정·설치물 ────────────────────────────────────────────
  mgnest: {
    key: 'mgnest', name: '기관총 진지', desc: 'K3 경기관총. 절대 움직이지 않지만 화력이 압도적이다.',
    cost: 45, hp: 300, armor: 25, speed: 0, range: 360, damage: 26, cooldown: 420,
    attack: 'projectile', projectileSpeed: 340, projectileRadius: 5,
    radius: 14, shape: 'bunker', weapon: 'mg',
    chase: 0, aggro: 0,       // 고정
    immobile: true
  },

  chemtrooper: {
    key: 'chemtrooper', name: '화학병', desc: '점착 유탄을 던진다. 맞으면 영웅이 느려진다.',
    cost: 30, hp: 130, armor: 10, speed: 100, range: 300, damage: 18, cooldown: 2200,
    attack: 'projectile', projectileSpeed: 210, projectileRadius: 9,
    slowMul: 0.55, slowMs: 2200,
    radius: 12, shape: 'diamond', weapon: 'launcher',
    chase: 140, aggro: 320
  },

  mine: {
    key: 'mine', name: '발목지뢰', desc: '밟으면 최대 체력의 30%가 날아간다. 배치도당 1개만.',
    cost: 35, hp: 40, armor: 0, speed: 0, range: 0, damage: 0, cooldown: 999999,
    attack: 'none',
    isMine: true, triggerRadius: 52, pctMaxHp: 0.30, blastRadius: 80,
    radius: 9, shape: 'mine', weapon: null,
    chase: 0, aggro: 0, immobile: true,
    maxPerFormation: 1
  }
};

GAME.UNIT_ORDER = [
  'bayonet', 'rifleman', 'grenadier', 'sniper',
  'shieldman', 'medic', 'sergeant', 'chemtrooper', 'mgnest', 'mine'
];

GAME.isNonTarget = function (def) {
  return def.attack !== 'targeted';
};

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
