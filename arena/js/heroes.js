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
GAME.HEROES = {
  vanguard: {
    key: 'vanguard',
    name: '특전사',
    trait: '돌격형',
    desc: '침투해서 휘젓는다. 대검 하나로 쓸어담고, 두꺼워서 실수에 관대하다.',
    cost: 75,
    hp: 1125, armor: 35, damage: 26, cooldown: 900, speed: 155, range: 62,
    attack: 'melee', coneDeg: 100, lifesteal: 0.10,
    radius: 17, shape: 'square',
    skillOptions: {
      Q: [
        { name: '돌파', type: 'dash', dist: 230, damage: 55, radius: 55, cooldown: 8000 },
        { name: '착검 돌격', type: 'dash', dist: 150, damage: 85, radius: 70, cooldown: 9000 },
        { name: '연막 침투', type: 'dash', dist: 300, damage: 0, radius: 0, cooldown: 6000 }
      ],
      W: [
        { name: '대검 난무', type: 'aoeSelf', radius: 88, damage: 62, cooldown: 11000 },
        { name: '가로 베기', type: 'pull', coneDeg: 100, dist: 170, damage: 70, cooldown: 10000 },
        { name: '섬광탄', type: 'aoeSelf', radius: 130, damage: 30, rootMs: 1300, cooldown: 13000 }
      ],
      E: [
        { name: '방탄 태세', type: 'buff', armorAdd: 45, speedMul: 0.85, duration: 3500, cooldown: 14000 },
        { name: '전투 각성', type: 'buff', damageMul: 1.55, speedMul: 1.15, duration: 4000, cooldown: 16000 },
        { name: '응급 처치', type: 'buff', healNow: 260, shield: 120, duration: 3000, cooldown: 15000 }
      ],
      R: [
        { name: '수류탄 투척', type: 'aoeSelf', radius: 150, damage: 105, knockback: 95, cooldown: 32000 },
        { name: '크레모아 설치', type: 'trap', damage: 190, radius: 90, rootMs: 1500, life: 20000, cooldown: 26000 },
        { name: '포격 요청', type: 'aoeTarget', radius: 140, damage: 60, repeat: 3, interval: 650, telegraph: 700, cooldown: 30000 }
      ]
    }
  },

  ranger: {
    key: 'ranger',
    name: '수색대',
    trait: '원거리형',
    desc: 'K2로 거리를 벌리며 싸운다. 빠르지만 얇아서 한 번 물리면 위험하다.',
    cost: 85,
    hp: 775, armor: 12, damage: 23, cooldown: 750, speed: 178, range: 340,
    attack: 'projectile', projectileSpeed: 420, projectileRadius: 7, lifesteal: 0,
    radius: 15, shape: 'triangle',
    skillOptions: {
      Q: [
        { name: '관통 사격', type: 'projectile', damage: 68, speed: 520, pierce: true, radius: 9, cooldown: 8000 },
        { name: '속사', type: 'projectile', damage: 34, speed: 620, pierce: false, radius: 7, burst: 3, burstDelay: 110, cooldown: 7000 },
        { name: '유탄 사격', type: 'aoeTarget', radius: 95, damage: 72, repeat: 1, telegraph: 500, cooldown: 9000 }
      ],
      W: [
        { name: '전술 굴림', type: 'dash', dist: 210, damage: 0, radius: 0, cooldown: 5000 },
        { name: '위치 변경', type: 'dash', dist: 330, damage: 0, radius: 0, cooldown: 8000 },
        { name: '반동 사격', type: 'dash', dist: 160, damage: 48, radius: 60, cooldown: 6500, backward: true }
      ],
      E: [
        { name: '크레모아', type: 'trap', damage: 55, radius: 55, rootMs: 1400, life: 12000, cooldown: 11000 },
        { name: '조명 지뢰', type: 'trap', damage: 20, radius: 90, rootMs: 2400, life: 14000, cooldown: 10000 },
        { name: '위장 태세', type: 'buff', armorAdd: 30, speedMul: 1.25, duration: 3000, cooldown: 12000 }
      ],
      R: [
        { name: '박격포 요청', type: 'aoeTarget', radius: 115, damage: 34, repeat: 3, interval: 700, telegraph: 600, cooldown: 30000 },
        { name: '융단 폭격', type: 'aoeTarget', radius: 180, damage: 26, repeat: 5, interval: 500, telegraph: 800, cooldown: 34000 },
        { name: '저격 지원', type: 'projectile', damage: 165, speed: 800, pierce: true, radius: 11, cooldown: 26000 }
      ]
    }
  },

  warden: {
    key: 'warden',
    name: '헌병대',
    trait: '지속형',
    desc: '방패로 버티며 오래 싸운다. 물량을 끌어모아 녹이는 쪽.',
    cost: 65,
    hp: 1315, armor: 45, damage: 20, cooldown: 1000, speed: 142, range: 72,
    attack: 'melee', coneDeg: 120, lifesteal: 0.25,
    radius: 18, shape: 'hex',
    skillOptions: {
      Q: [
        { name: '진압봉', type: 'strike', damage: 88, lifestealMul: 2.5, cooldown: 7000 },
        { name: '방패 타격', type: 'aoeSelf', radius: 80, damage: 52, knockback: 60, cooldown: 8000 },
        { name: '테이저', type: 'strike', damage: 46, rootMs: 1800, lifestealMul: 1, cooldown: 9000 }
      ],
      W: [
        { name: '방패 방어', type: 'buff', shield: 300, duration: 4500, cooldown: 15000 },
        { name: '진압 대형', type: 'buff', armorAdd: 70, duration: 4000, cooldown: 14000 },
        { name: '군장 정비', type: 'buff', healNow: 340, duration: 1000, cooldown: 17000 }
      ],
      E: [
        { name: '검문 검색', type: 'pull', coneDeg: 120, dist: 240, damage: 32, cooldown: 13000 },
        { name: '일제 검문', type: 'pull', coneDeg: 360, dist: 200, damage: 26, cooldown: 15000 },
        { name: '추격', type: 'dash', dist: 200, damage: 40, radius: 60, cooldown: 9000 }
      ],
      R: [
        { name: '통제 구역', type: 'aura', radius: 132, dps: 26, duration: 8000, cooldown: 34000 },
        { name: '위병소 설치', type: 'aura', radius: 190, dps: 17, duration: 10000, cooldown: 36000 },
        { name: '진압 작전', type: 'aoeSelf', radius: 165, damage: 120, knockback: 70, cooldown: 28000 }
      ]
    }
  }
};

GAME.HERO_ORDER = ['vanguard', 'ranger', 'warden'];
GAME.SKILL_SLOTS = ['Q', 'W', 'E', 'R'];

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
