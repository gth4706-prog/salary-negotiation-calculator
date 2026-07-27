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
    name: '광전사', art: 'berserker',
    trait: '돌격형',
    desc: '뼈 가시 볏을 세우고 뛰어든다. 양손 대검으로 쓸어담고, 두꺼워서 실수에 관대하다.',
    cost: 75,
    hp: 900, armor: 35, damage: 22, cooldown: 900, speed: 155, range: 62,
    attack: 'melee', coneDeg: 100, lifesteal: 0.10,
    radius: 17, shape: 'square',
    skillOptions: {
      Q: [
        { name: '박치기', type: 'dash', dist: 230, damage: 44, radius: 55, cooldown: 8000 },
        { name: '대검 돌진', type: 'dash', dist: 150, damage: 68, radius: 70, cooldown: 9000 },
        { name: '흙먼지 은신', type: 'dash', dist: 300, damage: 0, radius: 0, cooldown: 6000 }
      ],
      W: [
        { name: '대검 회전', type: 'aoeSelf', radius: 88, damage: 50, cooldown: 11000 },
        { name: '후려치기', type: 'pull', coneDeg: 100, dist: 170, damage: 56, cooldown: 10000 },
        { name: '모래 뿌리기', type: 'aoeSelf', radius: 130, damage: 24, rootMs: 1300, cooldown: 13000 }
      ],
      E: [
        { name: '가죽 두르기', type: 'buff', armorAdd: 45, speedMul: 0.85, duration: 3500, cooldown: 14000 },
        { name: '광폭화', type: 'buff', damageMul: 1.55, speedMul: 1.15, duration: 4000, cooldown: 16000 },
        { name: '약초 씹기', type: 'buff', healNow: 260, shield: 120, duration: 3000, cooldown: 15000 }
      ],
      R: [
        { name: '바위 내리치기', type: 'aoeSelf', radius: 150, damage: 84, knockback: 95, cooldown: 32000 },
        { name: '가시 함정', type: 'trap', damage: 152, radius: 90, rootMs: 1500, life: 20000, cooldown: 26000 },
        { name: '낙석 유도', type: 'aoeTarget', radius: 140, damage: 48, repeat: 3, interval: 650, telegraph: 700, cooldown: 30000 }
      ]
    }
  },

  ranger: {
    key: 'ranger',
    name: '사냥꾼', art: 'hunter',
    trait: '원거리형',
    desc: '장궁으로 거리를 벌리며 싸운다. 빠르지만 얇아서 한 번 물리면 위험하다.',
    cost: 85,
    hp: 620, armor: 12, damage: 20, cooldown: 750, speed: 178, range: 340,
    attack: 'projectile', projectileSpeed: 420, projectileRadius: 7, lifesteal: 0,
    radius: 15, shape: 'triangle',
    skillOptions: {
      Q: [
        { name: '관통 화살', type: 'projectile', damage: 54, speed: 520, pierce: true, radius: 9, cooldown: 8000 },
        { name: '연사', type: 'projectile', damage: 27, speed: 620, pierce: false, radius: 7, burst: 3, burstDelay: 110, cooldown: 7000 },
        { name: '불화살', type: 'aoeTarget', radius: 95, damage: 58, repeat: 1, telegraph: 500, cooldown: 9000 }
      ],
      W: [
        { name: '구르기', type: 'dash', dist: 210, damage: 0, radius: 0, cooldown: 5000 },
        { name: '도약', type: 'dash', dist: 330, damage: 0, radius: 0, cooldown: 8000 },
        { name: '뒷걸음 사격', type: 'dash', dist: 160, damage: 38, radius: 60, cooldown: 6500, backward: true }
      ],
      E: [
        { name: '올가미', type: 'trap', damage: 44, radius: 55, rootMs: 1400, life: 12000, cooldown: 11000 },
        { name: '끈끈이 덫', type: 'trap', damage: 16, radius: 90, rootMs: 2400, life: 14000, cooldown: 10000 },
        { name: '풀숲 위장', type: 'buff', armorAdd: 30, speedMul: 1.25, duration: 3000, cooldown: 12000 }
      ],
      R: [
        { name: '화살비', type: 'aoeTarget', radius: 115, damage: 27, repeat: 3, interval: 700, telegraph: 600, cooldown: 30000 },
        { name: '폭풍 화살', type: 'aoeTarget', radius: 180, damage: 21, repeat: 5, interval: 500, telegraph: 800, cooldown: 34000 },
        { name: '일격 화살', type: 'projectile', damage: 132, speed: 800, pierce: true, radius: 11, cooldown: 26000 }
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
    cost: 75,
    hp: 1052, armor: 34, damage: 17, cooldown: 1000, speed: 142, range: 64,
    attack: 'melee', coneDeg: 90, lifesteal: 0.15,
    radius: 18, shape: 'hex',
    skillOptions: {
      Q: [
        { name: '갈고리 찍기', type: 'strike', damage: 70, lifestealMul: 1.5, cooldown: 7000 },
        { name: '방패 밀치기', type: 'aoeSelf', radius: 80, damage: 42, knockback: 60, cooldown: 8000 },
        { name: '그물 던지기', type: 'strike', damage: 37, rootMs: 1800, lifestealMul: 1, cooldown: 9000 }
      ],
      W: [
        { name: '방패 세우기', type: 'buff', shield: 180, duration: 4500, cooldown: 15000 },
        { name: '철벽 자세', type: 'buff', armorAdd: 70, duration: 4000, cooldown: 14000 },
        { name: '숨 고르기', type: 'buff', healNow: 340, duration: 1000, cooldown: 17000 }
      ],
      E: [
        { name: '갈고리 당기기', type: 'pull', coneDeg: 120, dist: 240, damage: 26, cooldown: 13000 },
        { name: '회전 갈고리', type: 'pull', coneDeg: 360, dist: 200, damage: 21, cooldown: 15000 },
        { name: '돌진', type: 'dash', dist: 200, damage: 32, radius: 60, cooldown: 9000 }
      ],
      R: [
        { name: '파수 구역', type: 'aura', radius: 132, dps: 21, duration: 8000, cooldown: 34000 },
        { name: '경계 화톳불', type: 'aura', radius: 190, dps: 14, duration: 10000, cooldown: 36000 },
        { name: '대지 강타', type: 'aoeSelf', radius: 165, damage: 96, knockback: 70, cooldown: 28000 }
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
