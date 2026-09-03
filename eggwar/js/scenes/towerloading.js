window.GAME = window.GAME || {};

// ============================================================================
//  통곡의 탑 — 도전 진입 로딩 (2026-08-01, 요청 12·13)
//
//  "도전을 들어가면 항상 의도적으로 3초 정도의 로딩 시간이 걸리게 하고, 로딩 바가
//   진척되면서 이번 진형은 어떻게 배치되었는지, 그리고 각 전략 유닛마다 특징을
//   1줄씩 랜덤으로 띄워줘. 예를 들면 '투창병의 공격은 피할 수 없으니, 먼저
//   제거를 추천드립니다' 이런 식으로."
//
//  필요한 정보는 전투 시작 전에 **이미 다 준비돼 있다** — `formation.planLabel/
//  planHint`(배치 원형), `formation.ruleLabel/ruleDesc`(층 조건), `formation.units`
//  (이 층 적 구성). 유닛별 전술 팁만 새로 저작했다(`js/units.js` 에는 세계관 설명만
//  있고 전술 조언이 없었다).
//
//  ⚠ **영웅/스킬은 `js/towerchar.js` 에서 직접 읽는다.** `js/scenes/tower.js` 의
//    `_enterBattle` 은 formationId/tower/heroKey 만 넘긴다 — Battle 씬 진입 계약을
//    두 곳에 복제하지 않기 위해서다(그 파일의 상습 사고 경고 참조).
// ============================================================================

// 유닛 키 → 전술 팁 후보(2개씩). `js/units.js` 의 desc/ability 를 근거로 새로 썼다.
GAME.TOWER_UNIT_TIPS = {
  //  ── 확장 10종 (2026-08-08) ────────────────────────────────────────────
  //  ⚠ 여기 없는 유닛은 로딩 화면에서 **아무 말도 안 나온다** — 새 유닛을 넣으면
  //    반드시 채운다. 두 줄씩 두는 이유는 같은 층을 여러 번 봐도 안 지루하게.
  palisade: [
    '울짱꾼은 움직이지 않지만, 곁에 서 있으면 계속 갉힙니다.',
    '울짱꾼이 막은 길은 돌아가는 편이 빠릅니다.'
  ],
  hivethrower: [
    '벌집꾼은 죽으면 터지니, 붙어서 잡으면 같이 맞습니다.',
    '벌집꾼은 어디서 죽이느냐가 중요합니다.'
  ],
  reflector: [
    '되받이가 웅크릴 때 때리면 그대로 돌려받습니다.',
    '되받이는 웅크리는 잠깐만 손을 떼면 그만입니다.'
  ],
  hammer: [
    '망치잡이의 돌망치는 방어를 뚫으니, 갑옷을 믿고 서 있으면 위험합니다.',
    '망치잡이는 느립니다. 거리를 두면 한 대도 안 맞습니다.'
  ],
  shellwright: [
    '껍질장이가 씌운 보호막은 첫 한 방을 통째로 먹습니다.',
    '껍질장이가 있으면 몰아치기보다 두 박자로 나눠 치는 편이 낫습니다.'
  ],
  vinewhip: [
    '덩굴채는 거리를 벌려도 끌어당깁니다. 이동 스킬을 아껴 두세요.',
    '덩굴채의 예고 원이 뜨면 그 반경 밖으로 나가면 됩니다.'
  ],
  stonepiler: [
    '돌쌓이는 동료가 죽을 때마다 커지니, 잡몹부터 치우면 손해입니다.',
    '돌쌓이는 먼저 잡을수록 쌉니다.'
  ],
  knotter: [
    '매듭지기가 있으면 한 놈만 파도 피해가 나뉩니다.',
    '매듭지기 앞에서는 광역으로 한꺼번에 치는 편이 낫습니다.'
  ],
  ashthrower: [
    '잿가루를 맞으면 스킬이 늦게 돌아옵니다. 한 번 쓸 때 확실히 쓰세요.',
    '잿가루꾼은 스킬을 막지 않습니다 — 아껴 쓰게 만들 뿐입니다.'
  ],
  emberthrower: [
    '불씨꾼이 던진 불은 몇 초간 남습니다. 설 자리를 미리 정해 두세요.',
    '불씨꾼의 불은 피할 수 있지만, 피한 자리를 뺏깁니다.'
  ],
  bayonet: [
    '전사는 뭉쳐서 벽을 만드니, 벽을 허물 한 방이 필요합니다.',
    '전사의 돌진은 짧은 예비 동작이 있으니, 미리 피하면 무력화됩니다.'
  ],
  rifleman: [
    '궁수의 화살은 직선으로만 날아가니, 좌우로 움직이면 피할 수 있습니다.',
    '궁수는 한 자리에 오래 서 있으면 정조준에 맞으니, 계속 움직이는 것이 좋습니다.'
  ],
  grenadier: [
    '투석꾼의 돌은 예고 뒤에 터지니, 그림자가 보이면 그 자리를 벗어나세요.',
    '투석꾼은 사거리가 길지 않으니, 먼저 접근해 끊는 것도 방법입니다.'
  ],
  sniper: [
    '투창병의 공격은 피할 수 없으니, 먼저 제거를 추천드립니다.',
    '투창병은 다시 던지기까지 오래 걸리니, 첫 발만 버티면 여유가 생깁니다.'
  ],
  medic: [
    '약초꾼을 먼저 끊으면 진형이 무너집니다.',
    '약초꾼은 스스로 싸우지 않으니, 원거리 공격으로 먼저 지우는 것이 효율적입니다.'
  ],
  shieldman: [
    '방패는 정면만 막습니다. 옆이나 뒤로 돌아 들어가면 더 큰 피해가 들어갑니다.',
    '방패는 맞을수록 상합니다. 오래 때리면 방어가 무너지니 포기하지 마세요.',
    '방패병은 날아가는 공격을 대신 맞아주니, 먼저 지우면 뒤가 뚫립니다.',
    '방패병의 돌진은 준비 동작이 보이니, 미리 피하면 거리를 벌릴 수 있습니다.'
  ],
  sergeant: [
    '족장이 살아있으면 주변이 강해지니, 먼저 노리는 것이 좋습니다.',
    '족장의 포효가 터지면 진형 전체가 강해지니, 그 순간에는 거리를 두세요.'
  ],
  chemtrooper: [
    '늪지기에게 맞으면 느려지니, 거리를 유지하는 전략은 오히려 위험할 수 있습니다.',
    '늪지기의 둔화는 넓게 퍼지니, 뭉쳐 있지 않는 것이 좋습니다.'
  ],
  mgnest: [
    '쇠뇌 진지는 움직이지 않으니, 위치만 바꿔도 피할 수 있습니다.',
    '쇠뇌 진지는 맵 어디든 닿으니, 숨을 곳을 찾기보다 빠르게 접근하는 것이 낫습니다.'
  ],
  mine: [
    '가시덫은 보이지 않습니다. 밟으면 붉은 원이 뜨고 잠깐 뒤 터지니, 그때 이동 스킬로 빠져나가세요.',
    '가시덫은 걸어서는 못 벗어납니다 — 붉은 원이 보이면 곧바로 이동 스킬을 쓰세요.'
  ]
};

// ── 공략 한 줄 (2026-08-05 사용자 지시) ──────────────────────────────────────
//  > "로딩에서는 어떻게해야 깰수있을지 **플레이방법을 토대로 공략을 제안**해주기만 하자"
//
//  기존 팁(`TOWER_UNIT_TIPS`)과 무엇이 다른가: 저건 "이 유닛은 이런 놈이다"라는
//  **사실**이고, 이건 "이 판은 이렇게 깨라"는 **순서**다. 그리고 결정적으로
//  **내가 지금 들고 있는 스킬을 보고 말한다** — 같은 층이라도 광전사와 사냥꾼의
//  공략이 같을 수 없다. 그게 "플레이 방법을 토대로"의 뜻이라고 읽었다.
//
//  ⚠ 두 줄을 넘기지 않는다. 로딩은 3초다 — 네 줄을 쓰면 아무것도 안 읽힌다.
//  ⚠ 완화(재도전 N회 -N%)는 **여기서도 말하지 않는다**(같은 지시). 화면은 진 횟수를
//    세는 대신 이기는 방법을 말한다.

//  먼저 죽여야 하는 순서. 앞쪽이 우선이다.
//  근거: 회복(medic)·강화(sergeant)는 남겨두면 **다른 전부가 안 죽는다**, 그다음이
//  피할 수 없는 딜(sniper)과 전 맵 사거리(mgnest)다. 앞줄 몸(bayonet/shieldman)은
//  마지막 — 그것부터 치는 것이 이 게임에서 가장 흔한 패착이다.
GAME.TOWER_THREAT_ORDER = [
  'medic', 'sergeant', 'sniper', 'mgnest', 'chemtrooper',
  'grenadier', 'rifleman', 'shieldman', 'mine', 'bayonet'
];
GAME.TOWER_THREAT_PLAN = {
  medic: '약초꾼이 깎은 체력을 계속 되돌린다 — 이 판은 약초꾼을 먼저 지우고 시작하는 판이다.',
  sergeant: '족장이 살아 있는 동안은 주변이 전부 강하다 — 족장부터 끊으면 나머지가 순해진다.',
  sniper: '투창병은 피할 수 없는 공격이다 — 오래 끌수록 손해다. 가장 먼저 끊어라.',
  mgnest: '쇠뇌 진지는 맵 어디든 닿는다 — 숨을 곳을 찾지 말고 곧장 붙어서 지워라.',
  chemtrooper: '늪지기에게 맞으면 느려져 다른 공격까지 못 피한다 — 둔화부터 없애라.',
  grenadier: '투석꾼은 예고 뒤에 터진다 — 그림자를 보고 움직이면 한 발도 안 맞는다.',
  rifleman: '궁수의 화살은 직선이다 — 정면으로 다가가지 말고 옆으로 돌아 붙어라.',
  shieldman: '방패병이 뒤를 대신 맞아준다 — 방패병을 밀어내거나 넘어가야 뒤가 뚫린다.',
  mine: '가시덫이 깔려 있다 — 붉은 원이 뜨면 걸어서는 못 벗어난다. 이동 스킬을 아껴 둬라.',
  bayonet: '전사는 뭉쳐서 벽을 만든다 — 한 놈씩 떼어내지 말고 뭉친 곳을 통째로 노려라.'
};
//  내가 들고 있는 스킬의 **성격**으로 쓰는 법을 말한다(js/heroes.js 의 `type`).
//  ⚠ 조사는 **이름의 받침이 정한다**. '{은}{를}{가}{로}' 를 `UI.fillName` 이 바꾼다 —
//    그냥 '은(는)' 이라고 적으면 화면에 "화살비은(는)" 이 그대로 뜬다(실측).
GAME.TOWER_SKILL_PLAN = {
  dash: '{n}{로} 앞줄을 넘어 뒤부터 치면 순서를 바꿀 수 있다.',
  aoeSelf: '{n}{은} 적이 나를 둘러쌌을 때 가장 크다 — 뭉칠 때까지 참아라.',
  aoeTarget: '{n}{은} 뭉친 자리에 넣어야 값을 한다. 한 놈에게 쓰지 마라.',
  pull: '{n}{로} 뒷줄을 끌어내면 앞줄을 뚫지 않아도 된다.',
  projectile: '{n}{은} 직선이라 겹쳐 선 줄을 노릴 때 가장 많이 맞는다.',
  trap: '{n}{를} 길목에 미리 깔고 유인하면 싸움이 반으로 준다.',
  buff: '{n}{은} 교전 직전에 켜라 — 켜고 들어가는 것과 맞고 켜는 것은 다르다.',
  aura: '{n}{가} 켜져 있는 동안은 붙어 있어야 값을 한다.',
  strike: '{n}{은} 한 놈을 확실히 지우는 데 쓴다 — 위에 적힌 표적에 써라.'
};

// ── 적 스킬 설명 (2026-08-22 태현님: "로딩화면은 적 유닛의 스킬설명 위주로") ──
//  형식: 유닛 · 스킬이 하는 일 — 대처. 한 줄에 셋이 다 있어야 3초 로딩에 읽힌다.
//  ⚠ 새 유닛을 넣으면 여기도 채운다 — 없으면 그 유닛은 로딩에서 스킬을 안 알려준다.
GAME.TOWER_SKILL_DESC = {
  bayonet: '전사의 달려들기 — 짧은 예고 뒤 돌진해 밀쳐낸다. 예고가 보이면 옆으로 비켜라.',
  rifleman: '궁수의 정조준 — 서 있는 자리에 그림자를 겨눈다. 계속 움직이면 안 맞는다.',
  grenadier: '투석꾼의 돌무더기 — 예고 원 세 개를 흩어 떨어뜨린다. 원 밖으로만 걸으면 된다.',
  sniper: '투창병의 작살 — 평타는 피할 수 없고, 스킬은 예고가 보이는 큰 한 방이다. 먼저 끊어라.',
  medic: '약초꾼의 광역 회복 — 깎아 둔 체력을 통째로 되돌린다. 무엇보다 먼저 지워라.',
  shieldman: '방패병의 밀치기 — 날아오는 공격도 대신 맞아준다. 밀어내거나 넘어가야 뒤가 뚫린다.',
  sergeant: '족장의 포효 — 주변 전체의 공격이 세진다. 족장부터 끊으면 나머지가 순해진다.',
  chemtrooper: '늪지기의 늪 — 맞으면 느려져 다음 공격까지 못 피한다. 둔화부터 없애라.',
  mgnest: '쇠뇌 진지의 집중사격 — 전 맵 사거리 4연발. 숨을 곳은 없다, 곧장 붙어 지워라.',
  mine: '가시덫 — 밟으면 붉은 원이 뜨고 터진다. 걸어서는 못 벗어나니 이동 스킬을 아껴 둬라.',
  palisade: '울짱꾼의 가시 울타리 — 곁에 서 있으면 계속 갉힌다. 그 길은 돌아가라.',
  hivethrower: '벌집꾼 — 죽는 자리에서 터진다. 어디서 죽일지 고르는 것이 대처다.',
  reflector: '되받이의 웅크림 — 그동안 때린 피해를 그대로 돌려받는다. 웅크리면 잠깐 손을 떼라.',
  hammer: '망치잡이의 돌망치 — 방어를 뚫고 때린다. 갑옷을 믿지 말고 거리를 벌려라.',
  shellwright: '껍질장이의 보호막 — 아군의 첫 한 방을 통째로 먹는다. 두 박자로 나눠 쳐라.',
  vinewhip: '덩굴채의 덩굴 — 거리를 벌려도 끌어당긴다. 예고 원이 뜨면 반경 밖으로 나가라.',
  stonepiler: '돌쌓이의 돌탑 — 동료가 죽을 때마다 세진다. 이놈부터 잡아야 싸게 먹힌다.',
  knotter: '매듭지기의 매듭 — 묶인 적끼리 피해를 나눈다. 한 놈만 파지 말고 광역으로 쳐라.',
  ashthrower: '잿가루꾼의 잿가루 — 맞으면 스킬이 늦게 돌아온다. 한 번 쓸 때 확실히 써라.',
  emberthrower: '불씨꾼의 불씨 — 떨어진 자리에 불이 남는다. 설 자리를 미리 정해 둬라.'
};
//  스킬 설명을 띄우는 우선순위 — 위협 순서(THREAT_ORDER)에 확장 유닛을 끼워 넣은 것.
//  회복·강화·성장형이 앞이다: 늦게 알수록 손해가 커지는 순서다.
GAME.TOWER_SKILL_PRIORITY = [
  'medic', 'shellwright', 'sergeant', 'stonepiler', 'knotter', 'sniper', 'mgnest',
  'reflector', 'vinewhip', 'chemtrooper', 'ashthrower', 'hammer', 'grenadier',
  'emberthrower', 'rifleman', 'hivethrower', 'shieldman', 'palisade', 'mine', 'bayonet'
];

//  이 층 + 내 스킬 → 공략 두 줄. 못 만들면 빈 배열(호출부가 알아서 건너뛴다).
GAME.towerAdvice = function (formation, heroKey) {
  var out = [];
  if (!formation || !formation.units || !formation.units.length) return out;

  //  ① 이 층에서 가장 먼저 죽여야 하는 것
  //  ⚠ **`u.type` 은 원본 키가 아니다.** 탑은 정예 파생을 만들면서 레벨·능력을 붙인
  //    키를 쓴다 — 실측하면 `shieldman#6+charge` · `rifleman#3` 처럼 나온다.
  //    그래서 `GAME.UnitLevel.baseKeyOf` 로 원본으로 되돌려야 표에서 찾힌다.
  //    ⚠ 바로 아래 예전 팁 코드(`TOWER_UNIT_TIPS[u.type]`)가 이걸 안 해서 **탑에서는
  //      한 번도 안 떴다** — 조건이 조용히 false 라 아무도 눈치채지 못했다.
  //      (이 저장소의 "유닛 키는 표시 이름이 아니다" 함정과 같은 계열이다.)
  var base = function (t) {
    return (GAME.UnitLevel && GAME.UnitLevel.baseKeyOf) ? GAME.UnitLevel.baseKeyOf(t) : t;
  };
  var present = {};
  formation.units.forEach(function (u) {
    var k = base(u.type);
    present[k] = (present[k] || 0) + 1;
  });
  //  ① 적 스킬 설명 — 최대 2줄 (2026-08-22 태현님: "적 유닛의 스킬설명 위주로").
  //  예전 ⚔(먼저 죽일 것) 한 줄을 대체한다 — 우선순위 1번의 설명에 이미 '먼저
  //  끊어라'가 들어 있어 두 정보가 한 줄에 산다. 보스 층은 ☠ 줄이 있으니 1줄만.
  //  ⚠ 🎯 는 쓰지 않는다 — 이 화면에서 **층 목표**가 이미 그 아이콘을 쓴다.
  var order = GAME.TOWER_SKILL_PRIORITY || GAME.TOWER_THREAT_ORDER;
  var wantSkill = 1;   //  2026-08-23 태현님: "글자 너무 과다" — 층 불문 1줄
  for (var i = 0; i < order.length && wantSkill > 0; i++) {
    if (present[order[i]] && GAME.TOWER_SKILL_DESC[order[i]]) {
      out.push('🗡 ' + GAME.TOWER_SKILL_DESC[order[i]]);
      wantSkill--;
    }
  }

  //  ② 그 일을 **내가 가진 수단**으로 어떻게 하나
  //  ⚠ 스킬은 `TowerChar.picks`(슬롯→선택지 색인)로 정해진다. 여기서 기본값을
  //    가정하면 상점에서 바꿔 낀 사람에게 엉뚱한 스킬을 권하게 된다.
  var hero = GAME.HEROES && GAME.HEROES[heroKey];
  var rec = (GAME.TowerChar && GAME.TowerChar.exists && GAME.TowerChar.exists())
            ? GAME.TowerChar.get() : null;
  if (hero && hero.skillOptions && rec && rec.picks) {
    var mine = [];
    (GAME.SKILL_SLOTS || []).forEach(function (slot) {
      var opts = hero.skillOptions[slot] || [];
      var sk = opts[rec.picks[slot] || 0];
      if (sk && GAME.TOWER_SKILL_PLAN[sk.type]) mine.push(sk);
    });
    if (mine.length) {
      //  매번 같은 줄이 뜨면 두 번째 도전부터는 안 읽는다 — 가진 것 중 하나를 고른다.
      var sk2 = mine[Math.floor(Math.random() * mine.length)];
      out.push('▸ ' + GAME.UI.fillName(GAME.TOWER_SKILL_PLAN[sk2.type], sk2.name));
    }
  }
  return out;
};

GAME.TowerLoadingScene = function () {
  Phaser.Scene.call(this, { key: 'TowerLoading' });
};
GAME.TowerLoadingScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.TowerLoadingScene.prototype.constructor = GAME.TowerLoadingScene;

// 기본 3초. **새 유닛 데뷔 층은 여기에 더 준다**(사용자 지시: "로딩을 1초 정도 더
// 길게 해서 사용자가 읽을 수 있게") — 읽을 것이 늘었는데 시간이 그대로면 못 읽는다.
GAME.TowerLoadingScene.DURATION = 3000;
GAME.TowerLoadingScene.DEBUT_EXTRA = 1600;

GAME.TowerLoadingScene.prototype.init = function (data) {
  this.formationId = data.formationId;
  this.tower = data.tower || 0;
  this.heroKey = data.heroKey;
  this.replay = !!data.replay;      // 지난 층 다시(2026-08-31) — Battle 에 그대로 전달
  this._t = 0;
  this._meter = null;
  // 데뷔 층이면 읽을 시간을 더 준다. 세계 진입 층(시즌2)도 같은 이유로 더 준다.
  var TC0 = GAME.TowerCurriculum;
  var extra = (TC0 && TC0.debutOf(this.tower)) ? GAME.TowerLoadingScene.DEBUT_EXTRA : 0;
  if (!extra && TC0 && TC0.isWorldEntry && TC0.isWorldEntry(this.tower)) extra = GAME.TowerLoadingScene.DEBUT_EXTRA;
  this._dur = GAME.TowerLoadingScene.DURATION + extra;
};

// ── 세계 진입 (시즌2 「다섯 세계」, 2026-09-03 S-W) ──────────────────────────
//  세계 진입 층(31·61·101·151, 폭풍 하늘은 50주기)에 **세계 이름·규칙을 크게** 알린다.
//  스팅어(`Music.sting('worldEnter')`)와 세계 포인트(`Season.earnWorldPoint`)는 세계 키당
//  **최초 1회**만 — 저장 키 `eggwar.towerworld.v1`(계정별)로 막는다. TowerChar 는 S-H
//  소유라 건드리지 않는다.
//  ⚠ Season(S-F)도 층을 **깼을 때** `_applyFloor` 로 진입 포인트를 준다(31층을 깨면
//    안개늪 진입 +1). 여기서 먼저 주고 Season 기록에 '진입'을 표시해 두지 않으면 같은
//    세계에 두 번 준다 — 그래서 준 뒤 `worlds[key].entered` 를 함께 세운다(계약:
//    Season._rec/_save 는 S-F 의 저장 관문이고 스키마는 season.js 머리 주석 그대로).
GAME.TowerLoadingScene.WORLD_KEY = 'eggwar.towerworld.v1';
GAME.TowerLoadingScene.prototype._noteWorldEntry = function (w) {
  if (!w || !w.key || !GAME.Store) return false;
  var KEY = GAME.TowerLoadingScene.WORLD_KEY;
  var acct = (GAME.Account && GAME.Account.current && GAME.Account.current()) || 'guest';
  var all = GAME.Store.get(KEY, {}) || {};
  var rec = all[acct];
  if (!rec) rec = all[acct] = { entered: {} };
  if (!rec.entered) rec.entered = {};
  if (rec.entered[w.key]) return false;
  rec.entered[w.key] = Date.now();
  GAME.Store.set(KEY, all);
  try {
    if (GAME.Music && GAME.Music.sting) GAME.Music.sting('worldEnter', { world: w.key });
  } catch (e) {}
  try {
    var S = GAME.Season;
    if (S && S.earnWorldPoint && S.POINTS) {
      var already = false;
      if (S.progress) {
        var pr = S.progress(w.from);
        for (var i = 0; i < pr.length; i++) if (pr[i].key === w.key && pr[i].entered) already = true;
      }
      if (!already) {
        S.earnWorldPoint(S.POINTS.enter, 'enter:' + w.key);
        if (S._rec && S._save) {
          var r = S._rec();
          if (r && r.worlds && r.worlds[w.key] && !r.worlds[w.key].entered) {
            r.worlds[w.key].entered = S.now ? S.now() : Date.now();
            S._save(r);
          }
        }
      }
    }
  } catch (e2) {}
  return true;
};

GAME.TowerLoadingScene.prototype.create = function () {
  var C = GAME.CONFIG.COLORS;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var self = this;
  this.cameras.main.setBackgroundColor(C.bg);

  var formation = GAME.Formations.getById(this.formationId);
  var hero = GAME.HEROES[this.heroKey];
  var bossDef = formation && formation.boss ? GAME.UNITS[formation.boss] : null;

  // 보스 층 강조(디자인 검토 #5) — 이 게임은 이미 어디서나 `bossDef ? 위험색 : 본문색`
  // 규칙을 쓴다(tower.js 의 여러 화면). 로딩 화면만 그 규칙이 빠져 있었다 — 전투가
  // 시작되기도 전에 "이번 층은 다르다"가 읽혀야 그 규칙이 완성된다.
  var bossNumeric = bossDef ? (GAME.UI.IS_LIGHT ? 0xB01F35 : 0xef4444) : C.controller;
  var titleColor = bossDef ? GAME.UI.TXT.danger : C.text;

  //  세계 진입 층(시즌2 S-W) — 제목 자체가 세계 이름이 된다. 층 번호는 뒤로.
  var TC = GAME.TowerCurriculum;
  var worldEntry = (TC && TC.isWorldEntry && this.tower && TC.isWorldEntry(this.tower))
    ? TC.worldFor(this.tower) : null;
  if (worldEntry) this._noteWorldEntry(worldEntry);
  var titleText = worldEntry
    ? ((worldEntry.icon ? worldEntry.icon + ' ' : '') + worldEntry.name + '  ·  ' + this.tower + '층')
    : (this.tower + '층 진입');
  var titleLbl = GAME.UI.label(this, W / 2, H * 0.10, titleText, GAME.CONFIG.SMALL ? 26 : 34,
    worldEntry ? GAME.UI.TXT.accent || titleColor : titleColor, 0.5).setOrigin(0.5, 0);
  var subLbl = GAME.UI.label(this, W / 2, titleLbl.y + titleLbl.height + 6,
    hero ? hero.name + ' 출전' : '', GAME.CONFIG.SMALL ? 15 : 17, C.textDim, 0.5).setOrigin(0.5, 0);

  var debut = GAME.TowerCurriculum && GAME.TowerCurriculum.debutOf(this.tower);
  var debutDef = debut && GAME.UNITS[debut.type];

  // ── 데뷔 층은 **그 유닛만** 보여준다 (2026-08-01 사용자 지시) ─────────────────
  //  "새로운 적 유닛이 나올 때는 다른 설명 다 빼고 그 적 유닛에 대한 설명만 띄우고,
  //   실루엣이랍시고 억지로 불투명도 주지 말고 그냥 유닛하고 어떤 유닛이고 어떤 공격을
  //   하는지 자세히 보여줘. 로딩을 1초 정도 더 길게 해서 읽을 수 있게."
  //
  //  맞는 지적이다. 예전엔 데뷔 문구가 배치 원형·층 조건·랜덤 팁과 **같은 문단에
  //  섞여** 넷 중 하나로 흘러갔고, 정작 새 유닛은 알파 0.55~0.92 로 흐리게 그려
  //  "무엇이 새로 왔는가"가 화면에서 가장 약한 신호였다. 소개하는 층이면 소개만 한다.
  // ── 층 목표는 **언제나** 띄운다 (2026-08-01 사용자 신고) ────────────────────
  //  "유닛을 다 잡지 않았는데 라운드 종료되는 일이 있어."
  //  버그가 아니라 **안 보이던 규칙**이다. 목표 '우두머리 사냥'은 한 기만 잡으면,
  //  '버티기'는 40초를 넘기면 그 자리에서 이긴다 — 적이 남아 있어도 끝난다.
  //  그런데 이 화면은 목표를 한 번도 안 띄웠고(원형·조건·팁만 띄웠다), 전투 중
  //  배지에 이름만 짧게 붙는 게 전부였다. `js/towerobjective.js` 가 스스로 적어 둔
  //  원칙 셋을 그 상태로 어기고 있었던 것이다 —
  //    "화면이 목표를 말한다. **안 보이는 목표는 목표가 아니라 함정이다.**"
  //  ⚠ 그래서 데뷔 층에서도 이 줄만은 뺄 수 없다. "다른 설명 다 빼라"는 지시는
  //    *설명*을 빼라는 것이지 **이기는 조건**을 숨기라는 뜻이 아니다.
  //  ⚠ 시드를 **넘기지 않는다.** `battle.js` 도 `tower.js` 도 인자 없이 부르고,
  //    그러면 `seedNow()`(등반 시드)가 고른다. 여기서만 `formation.seed` 를 넘기면
  //    로딩 화면이 *다른* 목표를 예고하고 전투는 딴 목표로 도는, 안 띄우느니 못한
  //    상태가 된다 — 부르는 방식이 곧 계약이다.
  var objective = GAME.TowerObjective && this.tower
    ? GAME.TowerObjective.objectiveFor(this.tower) : null;

  //  ── 온보딩 (2026-08-03 사용자 지시) ────────────────────────────────────────
  //  "로딩화면에서 새로운 거 나와서 알릴 게 있다면 **그 내용만** 나오게 해줘.
  //   새로운 온보딩을 알려줄 땐 매번 나오는 AI 학습 내용이나 배치 설명은 생략해도 돼."
  //  새 적 소개(debut)와 **같은 문법**이다 — 가르칠 게 있으면 그것만 띄운다.
  //  ⚠ 층 목표만은 남긴다. 이 파일이 스스로 적어 둔 원칙이다("안 보이는 목표는
  //    목표가 아니라 함정이다"). "설명을 빼라"는 지시는 *이기는 조건*을 숨기라는
  //    뜻이 아니다.
  //  ⚠ 데뷔 층이면 데뷔가 우선이다 — 그 층의 '새로운 것'은 그 적이다.
  var lesson = null;
  if (!debutDef && !worldEntry && GAME.Onboard) {
    lesson = GAME.Onboard.pick({
      floor: this.tower || 0,
      isBoss: !!(GAME.Tower && GAME.Tower.isBossFloor && this.tower &&
                 GAME.Tower.isBossFloor(this.tower)),
      formation: formation,
      char: (GAME.TowerChar && GAME.TowerChar.exists && GAME.TowerChar.exists())
              ? GAME.TowerChar.get() : null
    });
  }

  var lines = [];
  if (objective) lines.push('🎯 ' + objective.label + ' — ' + objective.desc);
  if (worldEntry) {
    //  세계 진입 — **세계 이름과 규칙만** 크게. 데뷔 층과 같은 문법("가르칠 게 있으면
    //  그것만"). 규칙 줄은 표(WORLD_INFO.rule)를, 전장 줄은 이 층의 실제 def 를 읽는다.
    lines.push('🌍 새로운 세계 — ' + worldEntry.name);
    if (worldEntry.rule) lines.push('규칙: ' + worldEntry.rule);
    if (formation && formation.fieldLabel) lines.push((worldEntry.icon || '') + ' ' + formation.fieldLabel);
  } else if (lesson) {
    //  가르칠 게 있으면 **이것만.** 배치 원형·층 조건·AI 가 읽은 내용·랜덤 팁은 뺀다.
    lines.push(lesson.title);
    lines.push(lesson.body);
    GAME.Onboard.markSeen(lesson.id);
  } else if (debutDef) {
    // ⚠ **한 줄만** 쓴다(2026-08-01 사용자 지시). 예전엔 세계관 설명 + 자동 생성한
    //   공격 방식 + 대처법까지 네 줄이었는데, 로딩 몇 초에 그걸 다 읽지 않는다.
    //   글이 줄면 남는 자리가 전부 **그림**으로 간다 — 생김새를 외우는 게 이 화면의 목적이다.
    lines.push('🆕 새로운 적  ·  ' + debutDef.name);
    lines.push(debut.lesson);
  } else if (GAME.Tower && GAME.Tower.bonusFor && GAME.Tower.bonusFor(this.tower)) {
    //  보너스 판 — 적 설명은 거짓말이 된다(알깨기·탄막은 적이 안 나온다).
    //  판의 규칙만 말한다. 층수 미반영도 여기서 미리 알린다(2026-08-23 태현님).
    var bKind = GAME.Tower.bonusFor(this.tower);
    if (bKind === 'guard') {
      lines.push('🥚 보너스 판 — 황금알을 지켜라! 판이 끝날 때까지 버티면 큰 보상');
    } else if (bKind === 'break') {
      lines.push('🥚 보너스 판 — 황금알을 깨라! 때린 만큼 골드 · 층은 오르지 않는 덤 판');
    } else {
      lines.push('🏹 보너스 판 — 화살비를 피하라! 45초 버티기 · 바닥 금화 줍기 · 층은 오르지 않는 덤 판');
    }
  } else {
    //  ── B안 로테이션 (2026-08-23 태현님: "텍스트 너무 많아 — B로 해") ──────────
    //  구성 = 층 정보(목표 포함 최대 2줄 — 보스 > 조건 > 테마 순) + 팁 1줄.
    //  팁은 층 번호로 [적 스킬 → 내 스킬 → 배치 → AI 학습]을 돌아가며 **한 종류만** —
    //  정보량은 유지하되 한 화면에는 한 종류만 온다. 못 만드는 종류면 다음으로 순환.
    var infoCand = [];
    if (bossDef) infoCand.push('☠ ' + bossDef.name + ' — ' + bossDef.desc);
    //  전장 규칙(시즌2) — 보스 다음, 조건 앞. 이 층에 실제로 걸리는 def 를 읽은 한 줄이다.
    if (formation && formation.fieldLabel) infoCand.push((formation.worldIcon || '🌍') + ' ' + formation.fieldLabel);
    if (formation && formation.ruleLabel) infoCand.push('⚠ ' + formation.ruleLabel + ' — ' + formation.ruleDesc);
    if (formation && formation.themeLabel) infoCand.push('🎪 ' + formation.themeLabel + ' — ' + (formation.themeHint || ''));
    for (var ic = 0; ic < infoCand.length && lines.length < 2; ic++) lines.push(infoCand[ic]);

    var base2 = function (t) {
      return (GAME.UnitLevel && GAME.UnitLevel.baseKeyOf) ? GAME.UnitLevel.baseKeyOf(t) : t;
    };
    var present2 = {};
    if (formation && formation.units) {
      formation.units.forEach(function (u) { present2[base2(u.type)] = 1; });
    }
    var tipOf = {
      enemy: function () {
        var order = GAME.TOWER_SKILL_PRIORITY || [];
        for (var i2 = 0; i2 < order.length; i2++) {
          if (present2[order[i2]] && GAME.TOWER_SKILL_DESC[order[i2]]) {
            return '🗡 ' + GAME.TOWER_SKILL_DESC[order[i2]];
          }
        }
        return null;
      },
      mine: function () {
        var hero2 = GAME.HEROES && GAME.HEROES[self.heroKey];
        var rec2 = (GAME.TowerChar && GAME.TowerChar.exists && GAME.TowerChar.exists())
                   ? GAME.TowerChar.get() : null;
        if (!hero2 || !hero2.skillOptions || !rec2 || !rec2.picks) return null;
        var mine2 = [];
        (GAME.SKILL_SLOTS || []).forEach(function (slot) {
          var opts2 = hero2.skillOptions[slot] || [];
          var sk3 = opts2[rec2.picks[slot] || 0];
          if (sk3 && GAME.TOWER_SKILL_PLAN[sk3.type]) mine2.push(sk3);
        });
        if (!mine2.length) return null;
        var sk4 = mine2[Math.floor(Math.random() * mine2.length)];
        return '▸ ' + GAME.UI.fillName(GAME.TOWER_SKILL_PLAN[sk4.type], sk4.name);
      },
      plan: function () {
        return (formation && formation.planLabel)
          ? '◈ ' + formation.planLabel + ' — ' + formation.planHint : null;
      },
      learn: function () { return (formation && formation.readNote) || null; }
    };
    var ROT = ['enemy', 'mine', 'plan', 'learn'];
    for (var rIdx = 0; rIdx < ROT.length; rIdx++) {
      var tip = tipOf[ROT[((this.tower || 0) + rIdx) % ROT.length]]();
      if (tip) { lines.push(tip); break; }
    }
  }
  lines = lines.filter(function (s) { return s; });

  // 줄 사이 간격: 보통은 빈 줄로 띄운다(원형·조건·팁은 **서로 다른 사실**이라 붙이면
  // 한 문단으로 읽힌다). 데뷔 층의 두 줄은 "누구인가 + 어떻게 상대하나"로 **한 덩어리**라
  // 빈 줄이 필요 없고, 폰 가로(390px 높이)에서는 그 빈 줄 하나가 그림 띠의 23% 다.
  var joiner = debutDef ? '\n' : '\n\n';
  var infoLbl = GAME.UI.label(this, W / 2, subLbl.y + subLbl.height + 18, lines.join(joiner),
    GAME.CONFIG.SMALL ? 14 : 16, C.textDim, 0.5).setOrigin(0.5, 0).setAlign('center').setLineSpacing(8)
    .setWordWrapWidth(Math.min(W - 60, 640));

  // 이 층 적 실루엣(디자인 검토 #3) — formation.units 는 이미 읽어 온 데이터라
  // 텍스트로만 쓰고 버리고 있었다. 보스가 있으면 보스를, 없으면 가장 많이 나오는
  // 유닛을 세 마리 정도 흐릿하게 세워 "무엇과 싸우는지"를 로딩 중에도 보여준다.
  // ⚠ 실루엣 크기·위치를 **실제로 잰 텍스트 높이**에서 역산한다 — 고정 비율(H*0.62 등)로
  //   박았더니 문구가 1~3줄로 늘어나는 층에서 위 정보 문단과 겹쳤다(실측으로 잡음,
  //   eggart 의 "몸통은 sy 기준 위로 3.2r·아래로 1.8r 뻗는다" 규칙을 거꾸로 쓴 것).
  var barW = Math.min(W - 80, 480), barH = 14, barY = H - Math.max(60, H * 0.10);
  var bandTop = infoLbl.y + infoLbl.height + 14;
  var bandBottom = barY - 16;
  var bandH = Math.max(20, bandBottom - bandTop);
  // 계란 몸통은 발 기준 위로 3.2r · 아래로 1.8r(합 5r) 뻗는다(eggart 규약).
  var r = bandH / 5;
  var anchorUp = 3.2;
  // ── 데뷔 층은 **띠에 꽉 차게** 세운다 (2026-08-01 사용자 지시: "생김새를 잘 볼 수
  //    있게 크기 키워줘") ──────────────────────────────────────────────────────
  //  ⚠ 두 번 틀렸고 둘 다 원인이 같다 — **안전 상한(5r)을 실제 크기로 착각**했다.
  //    ① `min(bandH/5, W*0.16)` 로 폭 상한만 걸었더니 크기가 한 픽셀도 안 변했다
  //       (`bandH/5` 가 언제나 더 작아 상한이 걸릴 일이 없었다).
  //    ② 그래서 3.8 로 나눴더니 이번엔 쇠뇌 진지가 진행바를 뚫고 나갔다 —
  //       유닛마다 앵커 위아래 비율이 딴판인데 하나의 비율로 맞춘 탓이다.
  //  지금은 `UI.flatExtents` 의 **실측 경계 상자**로 그 유닛에 맞춰 정확히 채운다.
  //  다른 층은 유닛을 여럿 늘어놓으므로 예전 안전 상한을 그대로 둔다.
  if (debutDef && !bossDef) {
    var ex = GAME.UI.flatExtents(debutDef);
    // 세로: 띠 높이를 (위+아래) 로 나눈다. 가로: 그림 폭이 화면의 62% 를 넘지 않게.
    //  ⚠ 세로 폰(420 폭)에서는 가로가 먼저 막힌다 — 폭을 안 보면 화면 밖으로 나간다.
    //  ⚠ `bandH/3.0` 상한이 왜 필요한가: **납작한 유닛**은 높이를 채우려다 옆으로
    //    터진다. 가시덫(위 0.83r·아래 0.82r)은 이 상한이 없으면 r 이 남들의 2배가 되어
    //    폭 750px 짜리 갈색 덩어리가 됐다(실측) — 뭘 보여주는 그림인지 알 수 없다.
    //    다른 아홉 종은 합이 2.7r 이상이라 이 상한에 안 걸린다(가시덫 전용 안전장치).
    r = Math.min(bandH / (ex.up + ex.down), (W * 0.62) / (ex.halfW * 2), bandH / 3.0);
    // 띠를 다 못 채우면 **남는 여백을 위아래로 나눠** 가운데 세운다.
    // (안 하면 납작한 유닛이 위로 붙고 아래가 휑하게 빈다.)
    anchorUp = ex.up + (bandH / r - (ex.up + ex.down)) / 2;
  }
  var silY = bandTop + r * anchorUp;
  if (bossDef) {
    GAME.UI.drawUnitFlat(this.add.graphics().setAlpha(0.92), bossDef,
      W / 2, silY, GAME.CONFIG.COLORS.strategist, 1, r / (bossDef.radius || 27), -Math.PI / 2);
  } else if (debutDef) {
    // 데뷔 층에서는 **그 유닛 하나만, 또렷하게** 세운다.
    // ⚠ 알파를 주지 않는다(사용자 지시: "실루엣이랍시고 억지로 불투명도 주지 마").
    //   소개하는 화면에서 흐리게 그리는 것은 그 자체로 모순이다 — 외우라고 띄운 그림이다.
    //   지면 고정물(가시덫)도 `drawUnitFlat` 이 알아서 접지 아트로 그린다.
    GAME.UI.drawUnitFlat(this.add.graphics(), debutDef,
      W / 2, silY, GAME.CONFIG.COLORS.strategist, 1, r / (debutDef.radius || 12), -Math.PI / 2);
  } else if (formation && formation.units && formation.units.length) {
    var counts = {};
    formation.units.forEach(function (u) { counts[u.type] = (counts[u.type] || 0) + 1; });
    var top3 = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 3);
    var silG = this.add.graphics().setAlpha(0.55);
    var spread = Math.min(W * 0.22, r * 3.6);
    top3.forEach(function (k, i) {
      var def = GAME.UNITS[k];
      if (!def || def.isMine) return;                            // 지뢰류는 서 있는 실루엣이 없다
      var sx = W / 2 + (i - (top3.length - 1) / 2) * spread;
      GAME.UI.drawUnitFlat(silG, def, sx, silY, GAME.CONFIG.COLORS.strategist, 1,
        r * 0.82 / (def.radius || 12), -Math.PI / 2);
    });
  }

  this._meter = GAME.UI.meter(this, (W - barW) / 2, barY, barW, barH, {
    color: bossNumeric, frac: 0
  });

  this._done = false;
};

GAME.TowerLoadingScene.prototype.update = function (time, delta) {
  if (this._done) return;
  this._t += delta;
  var dur = this._dur || GAME.TowerLoadingScene.DURATION;
  if (this._meter) this._meter.set(Math.min(1, this._t / dur));
  if (this._t >= dur) {
    this._done = true;
    var Z = GAME.CONFIG.ZONE_CONTROLLER;
    var picks = (GAME.TowerChar && GAME.TowerChar.get() && GAME.TowerChar.get().picks) ||
                GAME.defaultSkillPicks();
    this.scene.start('Battle', {
      formationId: this.formationId,
      heroKey: this.heroKey,
      items: {},
      picks: picks,
      tower: this.tower,
      replay: this.replay,
      startPos: { x: Z.x + Z.w / 2, y: Z.y + Z.h * 0.55 }
    });
  }
};
