window.GAME = window.GAME || {};

// 세계관: Egg War — 계란 캐릭터들의 원시 부족 전쟁. 고증보다 패러디, 12세 이용가 톤.
// 몸통은 전부 달걀이라 **종류 구분은 든 무기와 방어구(실루엣)가 전담한다.**
// art 값은 js/ui.js 의 아트 시스템 키다 (색이 아니라 형태로 구분하기 위한 것).
//
// attack: melee / projectile / aoe = 논타겟(회피 가능), targeted = 자동명중(회피 불가),
//         none = 공격하지 않는 지원 유닛
// armor: 비율 경감 — 100/(100+armor) 만큼만 피해가 들어간다.
//   정액 차감으로 하면 방어력 높은 대상에게 약한 공격 다수(=물량)가 무력화되어
//   '물량' 이라는 전략 축 자체가 죽는다. 그래서 비율 방식을 쓴다.
// chase/aggro: 배치를 깨고 쫓아나갈 수 있는 거리와 반응 범위. chase 0 이면 고정이다.
GAME.UNITS = {
  bayonet: {
    key: 'bayonet', name: '전사', art: 'warrior',
    desc: '청동 단검과 나무 방패. 싸고 튼튼한 벽.',
    cost: 10, hp: 240, armor: 30, speed: 135, range: 52, damage: 28, cooldown: 800,
    attack: 'melee', coneDeg: 90, radius: 13, shape: 'square', weapon: 'bayonet',
    chase: 270, aggro: 210
  },

  rifleman: {
    key: 'rifleman', name: '궁수', art: 'archer',
    desc: '단궁. 논타겟 직선 사격이라 보고 피할 수 있다.',
    cost: 15, hp: 140, armor: 10, speed: 115, range: 330, damage: 41, cooldown: 1300,
    attack: 'projectile', projectileSpeed: 240, projectileRadius: 6,
    radius: 11, shape: 'triangle', weapon: 'rifle',
    chase: 150, aggro: 360
  },

  grenadier: {
    key: 'grenadier', name: '투석꾼', art: 'slinger',
    desc: '무릿매로 돌을 날린다. 예고 후 터지는 광역 — 구역을 봉쇄한다.',
    cost: 25, hp: 120, armor: 5, speed: 95, range: 300, damage: 69, cooldown: 2500,
    attack: 'aoe', aoeRadius: 62, telegraph: 900,
    radius: 12, shape: 'diamond', weapon: 'launcher',
    chase: 130, aggro: 330
  },

  sniper: {
    key: 'sniper', name: '투창병', art: 'spearman',
    desc: '미늘 작살. 던지면 반드시 맞는다. 비싼 대신 회피 불가.',
    cost: 40, hp: 100, armor: 5, speed: 90, range: 420, damage: 81, cooldown: 3000,
    attack: 'targeted', bulletSpeed: 760,
    radius: 11, shape: 'hex', weapon: 'sniperRifle',
    chase: 110, aggro: 440
  },

  // ── 지원 계열 ──────────────────────────────────────────────
  medic: {
    key: 'medic', name: '약초꾼', art: 'herbalist',
    desc: '약초로 주변 아군을 주기적으로 회복시킨다. 스스로는 안 싸운다.',
    cost: 30, hp: 130, armor: 10, speed: 105, range: 0, damage: 0, cooldown: 1000,
    attack: 'none',
    healRadius: 150, healPerTick: 14, healInterval: 1000,
    radius: 11, shape: 'cross', weapon: 'aidkit',
    chase: 140, aggro: 0
  },

  shieldman: {
    key: 'shieldman', name: '방패병', art: 'shieldman',
    desc: '나무 대방패로 아군에게 갈 투사체를 대신 맞는다. 공격력은 낮다.',
    cost: 25, hp: 420, armor: 45, speed: 100, range: 50, damage: 12, cooldown: 1100,
    attack: 'melee', coneDeg: 80,
    intercept: 46,          // 이 반경 안을 지나는 적 투사체를 대신 맞는다
    radius: 15, shape: 'shield', weapon: 'riotShield',
    chase: 200, aggro: 240
  },

  sergeant: {
    key: 'sergeant', name: '족장', art: 'chieftain',
    desc: '소뿔 투구를 쓴 우두머리. 주변 아군의 공격력을 올린다. 진형의 심장.',
    cost: 35, hp: 170, armor: 20, speed: 110, range: 240, damage: 23, cooldown: 1500,
    attack: 'projectile', projectileSpeed: 260, projectileRadius: 5,
    buffRadius: 190, buffDamageMul: 1.30,
    radius: 12, shape: 'star', weapon: 'pistol',
    chase: 160, aggro: 300
  },

  // ── 고정·설치물 ────────────────────────────────────────────
  // 고정 유닛은 움직일 수 없으므로 '맵 끝까지 닿는 사거리'를 갖는다(사각지대 금지 규칙).
  // 논타겟 투사체라 멀수록 날아오는 시간이 길어져 피하기 쉬워진다 —
  // 사거리가 길다고 강해지는 게 아니라 '숨을 곳이 없어지는' 쪽으로 작동한다.
  mgnest: {
    key: 'mgnest', name: '쇠뇌 진지', art: 'ballista',
    desc: '거치식 연발 쇠뇌. 절대 움직이지 않지만 맵 어디든 닿는다.',
    cost: 45, hp: 300, armor: 25, speed: 0, range: 0, rangeSpan: true, damage: 30, cooldown: 420,
    attack: 'projectile', projectileSpeed: 340, projectileRadius: 5,
    radius: 14, shape: 'bunker', weapon: 'mg',
    chase: 0, aggro: 0,       // 고정
    immobile: true
  },

  chemtrooper: {
    key: 'chemtrooper', name: '늪지기', art: 'bogman',
    desc: '끈끈한 수액 단지를 던진다. 맞으면 영웅이 느려진다.',
    cost: 30, hp: 130, armor: 10, speed: 100, range: 300, damage: 21, cooldown: 2200,
    attack: 'projectile', projectileSpeed: 210, projectileRadius: 9,
    slowMul: 0.55, slowMs: 2200,
    radius: 12, shape: 'diamond', weapon: 'launcher',
    chase: 140, aggro: 320
  },

  mine: {
    key: 'mine', name: '가시덫', art: 'snaretrap',
    desc: '밟으면 최대 체력의 30%가 날아간다. 배치도당 1개만.',
    cost: 35, hp: 40, armor: 0, speed: 0, range: 0, damage: 0, cooldown: 999999,
    attack: 'none',
    isMine: true, triggerRadius: 52, pctMaxHp: 0.30, blastRadius: 80,
    radius: 9, shape: 'mine', weapon: null,
    chase: 0, aggro: 0, immobile: true,
    maxPerFormation: 1
  }
};

// ── 보스 (통곡의 탑 10층마다) ────────────────────────────────────────────
// 플레이어가 배치할 수 없고 AI 도 뽑지 않는다 — UNIT_ORDER 에 넣지 않는 이유다.
// 새 메커니즘을 만들지 않고 기존 공격 타입만 크게 굴린다(위험을 늘리지 않으려고).
// 체급으로 존재감을 주되 **회피 가능한 논타겟**이라 실력으로 넘을 수 있어야 한다.
GAME.BOSS_UNITS = {
  bossChief: {
    key: 'bossChief', name: '거대 족장', art: 'chieftain', isBoss: true,
    desc: '부족을 이끄는 거대한 알. 주변 아군을 크게 강화하고 직접 후려친다.',
    cost: 0, hp: 1500, armor: 26, speed: 96, range: 96, damage: 52, cooldown: 1300,
    attack: 'melee', coneDeg: 110,
    buffRadius: 250, buffDamageMul: 1.45,
    radius: 27, shape: 'star', weapon: 'pistol',
    chase: 420, aggro: 420
  },

  bossShell: {
    key: 'bossShell', name: '껍질 골렘', art: 'guardian', isBoss: true,
    desc: '두꺼운 껍질 덩어리. 느리지만 닿으면 밀려난다.',
    cost: 0, hp: 1420, armor: 26, speed: 78, range: 104, damage: 68, cooldown: 1600,
    attack: 'melee', coneDeg: 130,
    radius: 30, shape: 'shield', weapon: 'riotShield',
    chase: 460, aggro: 460
  },

  bossNest: {
    key: 'bossNest', name: '둥지 포탑', art: 'ballista', isBoss: true,
    desc: '움직이지 않는 거대 둥지. 맵 전체에 쉬지 않고 쏘아댄다.',
    cost: 0, hp: 1500, armor: 22, speed: 0, range: 0, rangeSpan: true,
    damage: 44, cooldown: 520,
    attack: 'projectile', projectileSpeed: 300, projectileRadius: 8,
    radius: 26, shape: 'bunker', weapon: 'mg',
    chase: 0, aggro: 0, immobile: true
  }
};

for (var _bk in GAME.BOSS_UNITS) GAME.UNITS[_bk] = GAME.BOSS_UNITS[_bk];

GAME.isBoss = function (def) { return !!(def && def.isBoss); };

// 플레이어 팔레트 · AI 뽑기 풀. **보스는 여기 없다.**
GAME.UNIT_ORDER = [
  'bayonet', 'rifleman', 'grenadier', 'sniper',
  'shieldman', 'medic', 'sergeant', 'chemtrooper', 'mgnest', 'mine'
];

GAME.isNonTarget = function (def) {
  return def.attack !== 'targeted';
};

// rangeSpan 이 붙은 정의는 사거리를 맵 대각선으로 채운다.
// units.js 가 config.js 뒤에 로드되므로 여기서 한 번만 계산해 박아둔다.
(function () {
  for (var k in GAME.UNITS) {
    if (GAME.UNITS[k].rangeSpan) GAME.UNITS[k].range = GAME.CONFIG.MAP_SPAN;
  }
})();

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
