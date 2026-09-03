window.GAME = window.GAME || {};

// ============================================================================
//  통곡의 탑 — **유닛 교육 과정** (2026-07-31 사용자 지시)
//
//  "1층부터 시작할 때 초급 유닛만 나오게 하고, 그다음에 3층에 처음 궁수를 보여줘서
//   저게 궁수구나 인지하게 만들고, 5층에선 쇠뇌 진지를 처음 보여준다거나 하는 방식으로
//   플레이어가 플레이하면서 자연스럽게 유닛별 대처방법과 어떤 유닛이 어떤 역할 하는구나
//   알게 만들고 싶어."
//
//  왜 필요한가: 지금까지 1층부터 `GAME.UNIT_ORDER` 10종이 **전부** 뽑기 대상이었다.
//  1층에서 투창병(자동명중)·쇠뇌 진지(맵 전체 사거리)·가시덫(안 보이는 함정)을 한꺼번에
//  만나면 무엇에 맞아 죽었는지조차 알 수 없다. 이 게임의 유닛은 저마다 **다른 답**을
//  요구하는데(js/scenes/towerloading.js 의 전술 팁 표가 그 증거다), 답을 배울 기회가
//  없으면 그 설계가 통째로 낭비된다.
//
//  설계 원칙
//   ① **한 층에 한 종류만 새로 등장한다.** 두 개를 같이 풀면 무엇이 무엇인지 안 갈린다.
//   ② 새 유닛은 **홀수 층**에만 들어온다. 짝수 층은 방금 배운 것을 연습하는 자리다.
//   ③ 순서는 '대처법의 난이도' 순이다 — 눈에 보이고 피할 수 있는 것부터,
//      보이지 않거나 피할 수 없는 것으로 간다.
//   ④ 보스 층(10·20…)까지는 그 구간에서 배울 것을 다 가르친 상태로 도착하게 한다.
//
//  ⚠ **탑 전용이다.** 대전(Versus)·수성의 탑은 이 파일을 안 부른다 — 그쪽은 사람이
//    직접 짠 배치도이거나 이미 학습이 끝난 사람을 상대하는 자리다.
// ============================================================================
GAME.TowerCurriculum = {

  // 층 → 그 층에서 **처음 등장**하는 유닛. 위 원칙 ①②③ 을 그대로 옮긴 표다.
  // `js/scenes/towerloading.js` 의 `TOWER_UNIT_TIPS` 가 각 유닛의 대처법을 한 줄로
  // 갖고 있으므로, 데뷔 층 로딩 화면에서 그 줄을 강조해 띄운다(아래 `debutOf`).
  //  ⚠ 2026-08-01 — **1~10층은 튜토리얼이다**(사용자 재확인: "초반 1~10층은 거의
  //    튜토리얼이라 생각해야 해. 1층에서 적 유닛이 많이 나올 필요 없고 전사만 보여줘도
  //    되고. 한 20층 가서부터 쇠뇌 진지 나와도 돼").
  //    그래서 소개 간격을 넓혔다 — 1~10층에는 **네 종류만** 나오고, 뒤로 갈수록
  //    까다로운 것들이 천천히 들어온다. 쇠뇌 진지(맵 전체 사거리)는 20층으로 미뤘다.
  //  ⚠ 2026-08-01 — `lesson` 은 **딱 한 줄**이다(사용자 지시: "새로운 유닛이 나올 때
  //    설명은 1줄만 해도 돼. 전사는 근거리 유닛이고 돌진 스킬만 조심하자 / 궁수는
  //    와리가리해서 피하자 등").
  //    말투도 그 예시를 따랐다 — 설명문이 아니라 **옆에서 알려주는 한마디**다.
  //    긴 설명은 읽히지 않는다: 로딩 화면은 몇 초짜리이고, 플레이어가 가져가야 할 것은
  //    "이놈 앞에서 뭘 하면 되나" 하나뿐이다.
  //  ── `share` 는 그 층에서 **그 유닛이 차지할 머릿수 비율**이다 (2026-08-01) ──
  //  기본값(`DEBUT_SHARE`)이 아니라 유닛마다 다른 이유는 **실측 때문**이다.
  //  전부 0.55 로 두니 무조작 돌파가 이렇게 나왔다(rep=48, 한계 10%):
  //      투석꾼 4% · 투창병 17% · 방패병 21% · 약초꾼 42% · 늪지기 73% · 가시덫 65%
  //  한 종류로 몰면 **조합이 사라진다.** 약초꾼·늪지기는 스스로 딜을 거의 안 내고,
  //  가시덫은 애초에 승패 판정에서 빠지는 위험물이라(`Combat.isHazard`) 과반이 되면
  //  "쓰러뜨려야 할 적"이 절반으로 줄어든다 — 소개하려다 층을 통째로 무너뜨린 것이다.
  //  아래 값은 **무조작 돌파 ≤5% 를 지키는 최대치**로 하나씩 재서 넣었다.
  //  ⚠ 눈으로 고치지 말 것. 바꾸면 `node tools/regress.js` 의 R-1 이 데뷔 층을
  //    전부 검사하므로 거기서 잡힌다.
  UNLOCK: [
    { floor: 1,  type: 'bayonet',     share: 0.55, lesson: '근거리 유닛이다. 돌진만 조심하자' },
    { floor: 3,  type: 'rifleman',    share: 0.55, lesson: '직선으로만 쏜다. 좌우로 움직이며 피하자' },
    { floor: 6,  type: 'grenadier',   share: 0.45, lesson: '떨어질 자리가 먼저 보인다. 그 자리만 비키자' },
    { floor: 9,  type: 'shieldman',   share: 0.35, lesson: '날아가는 걸 대신 맞아준다. 먼저 지우자' },
    { floor: 12, type: 'medic',       share: 0.25, lesson: '동료를 계속 살린다. 이놈부터 끊자' },
    { floor: 15, type: 'sniper',      share: 0.45, lesson: '이 창은 못 피한다. 보이면 먼저 지우자' },
    { floor: 18, type: 'chemtrooper', share: 0.25, lesson: '맞으면 느려진다. 멀리 돌지 말고 붙자' },
    // ⚠ **보스 층(10의 배수)에는 데뷔를 두지 않는다.** 20층에 뒀더니 로딩 화면이
    //   글로는 "새로운 적 · 쇠뇌 진지"라 해 놓고 그림은 보스를 그렸다(실측). 그 층은
    //   이미 자기 정체성이 있어서 소개가 묻힌다 — 아래 `_bossFree` 가 이걸 지킨다.
    //   19층이면 보스 직전에 배우게 되어 원칙 ④("보스까지는 다 가르친 상태로 도착")에도 맞다.
    { floor: 19, type: 'mgnest',      share: 0.55, lesson: '맵 끝까지 닿는다. 숨지 말고 곧장 붙자' },
    { floor: 24, type: 'sergeant',    share: 0.55, lesson: '살아 있으면 주변이 세진다. 이놈부터 노리자' },
    { floor: 28, type: 'mine',        share: 0.35, lesson: '안 보인다. 붉은 원이 뜨면 이동 스킬로 튀자' },
    //  ── 확장 10종 (2026-08-08, 사용자 지시: "통곡의탑에도 밸런스 맞게 추가") ──
    //  ⚠ 같은 원칙 그대로다: 한 층에 하나 · 보스 층(10의 배수) 회피 · 대처법이 쉬운
    //    것부터. 앞의 열 종을 다 배운 뒤(28층)부터 시작한다.
    //  ⚠ `share` 는 **눈으로 정하지 않았다.** 아래 값은 `regress.js` R-1(데뷔 층
    //    무조작 돌파율)으로 재서 넣었다 — 공격을 안 하는 유닛(울짱꾼·껍질장이)에
    //    머릿수를 몰면 "쓰러뜨릴 적"이 줄어 층이 오히려 쉬워진다(위 주석의 실측).
    //  ── 시즌2 「다섯 세계」(2026-09-03 S-W) — **데뷔 층을 세계에 맞춰 다시 놓았다.**
    //    진단: 확장 10종이 31~61층에 몰려 있어 61층 이후 새 어휘가 보스뿐이었고,
    //    `autoformation.weights` 가 10키뿐이라 데뷔 층 밖에서는 사실상 안 뽑혔다.
    //    이제 유닛은 **자기 세계에서** 처음 나오고, 그 세계의 편성 가중(AutoFormation
    //    WORLD_WEIGHTS)이 그 뒤로도 계속 뽑는다. 세계 진입 층(31·61·101·151)에는
    //    데뷔를 두지 않는다 — 그 층은 세계 자체를 소개하는 자리다(보스 층과 같은 이유).
    //      안개늪(31~60): 덩굴채 · 껍질장이 · 매듭지기 · 벌집꾼 · 되받이
    //      잿더미(61~100): 불씨꾼 · 잿가루꾼 · 망치잡이
    //      균열(101~150): 돌쌓이 · 울짱꾼
    //    share 는 R-1 로 잰 옛 값을 그대로 물려받았다(R-1 은 참고 지표 — 층이 바뀌어
    //    비율의 뜻은 같다: "소개하되 조합을 안 지운다").
    { floor: 33, type: 'vinewhip',    share: 0.35, lesson: '거리를 벌려도 끌어당긴다. 이동 스킬을 아껴 두자' },
    { floor: 36, type: 'shellwright', share: 0.20, lesson: '미리 막아 준다. 한 번에 몰아치지 말고 두 박자로 치자' },
    { floor: 39, type: 'knotter',     share: 0.30, lesson: '피해를 나눠 진다. 하나만 파지 말고 광역으로 치자' },
    //  ⚠ 0.45 로 뒀더니 무조작 돌파 13%(한계 10) — **아군도 맞는 사망 폭발**이라
    //    머릿수를 몰면 진형이 제 폭발에 녹는다. 0.28 에서 다시 쟀다.
    { floor: 43, type: 'hivethrower', share: 0.28, lesson: '죽으면 터진다. 붙어서 잡지 말자' },
    { floor: 47, type: 'reflector',   share: 0.45, lesson: '웅크리면 되받아친다. 그때만 손을 떼자' },
    { floor: 63, type: 'emberthrower',share: 0.35, lesson: '불이 남는다. 설 자리를 미리 정해 두자' },
    { floor: 67, type: 'ashthrower',  share: 0.30, lesson: '스킬이 늦게 돌아온다. 한 번 쓸 때 확실히 쓰자' },
    { floor: 72, type: 'hammer',      share: 0.45, lesson: '방어를 뚫는다. 두꺼운 갑옷을 믿지 말자' },
    { floor: 103, type: 'stonepiler', share: 0.45, lesson: '동료가 죽을수록 커진다. 이놈을 먼저 잡자' },
    { floor: 107, type: 'palisade',   share: 0.25, lesson: '움직이지 않는다. 곁을 지나가지 말고 돌아가자' }
  ],

  // 이 층까지 **풀린** 유닛 종류. AutoFormation 이 이 목록 밖에서는 안 뽑는다.
  typesFor: function (floor) {
    var out = [];
    for (var i = 0; i < this.UNLOCK.length; i++) {
      if (this.UNLOCK[i].floor <= floor) out.push(this.UNLOCK[i].type);
    }
    // 표가 비는 일은 없어야 하지만, 있더라도 전열은 반드시 남긴다
    // (유닛 0종이면 `AutoFormation` 이 빈 진형을 만들고 첫 프레임에 전투가 끝난다 —
    //  이 저장소가 이미 겪은 실패 모드다).
    return out.length ? out : ['bayonet'];
  },

  // ── 연습 구간의 머릿수 상한 ──────────────────────────────────────────────
  //  ⚠ 종류를 줄이면 난이도가 **내려갈 거라고 착각하기 쉽다.** 실제로는 반대였다:
  //    1층에 전사만 허용하니 예산 100 이 전부 최저가 유닛(10골드)으로 가서 10기짜리
  //    빽빽한 벽이 됐고, 무조작 돌파가 95% → 25% 로 떨어졌다(실측). 이 저장소가 이미
  //    아는 사실 그대로다 — "방어력이 비율 경감이라 물량이 실제로 강한 축"이다.
  //    CLAUDE.md 의 약속은 "1~3층은 연습 구간, 4층부터 조작 없이는 진다"이므로
  //    **연습 구간에서는 머릿수를 직접 묶는다.** 4층부터는 상한이 없다(설계된 벽).
  //  2026-08-01 — 상한을 **10층까지** 늘렸다(1~10층 = 튜토리얼). 1층은 전사 3기다.
  //  ⚠ 다만 **4층부터 무조작 0%** 라는 약속(CLAUDE.md·R-1)은 깨면 안 된다.
  //    머릿수를 너무 낮추면 조작 없이도 이겨서 그 약속이 무너진다 —
  //    아래 값은 R-1 을 돌려 가며 잡은 것이다(측정 없이 손대지 말 것).
  MAX_UNITS: { 1: 3, 2: 5, 3: 7, 4: 10, 5: 11, 6: 12, 7: 13, 8: 14, 9: 15, 10: 16 },
  maxUnitsFor: function (floor) { return this.MAX_UNITS[floor] || 0; },

  // 이 층이 **데뷔 층**인가 → 그 항목(없으면 null). 로딩 화면이 이걸로 강조 문구를 만든다.
  //  보스 층에서는 **언제나 null** 이다 — 보스 화면과 소개 화면이 같은 자리를 놓고 다투면
  //  글과 그림이 어긋난다(위 UNLOCK 주석의 실측 사고). 표를 잘못 고쳐도 여기서 막힌다.
  debutOf: function (floor) {
    if (GAME.Tower && GAME.Tower.isBossFloor && GAME.Tower.isBossFloor(floor)) return null;
    for (var i = 0; i < this.UNLOCK.length; i++) {
      if (this.UNLOCK[i].floor === floor) return this.UNLOCK[i];
    }
    return null;
  },

  // ── 테마 층 — **가끔은 웃겨도 된다** (2026-08-01 사용자 지시) ────────────────
  //  "가끔은 유머러스한 배치도가 나와도 재밌을 것 같아. 예를 들면 '방패병이 화나서
  //   모였습니다' 라는 설명 띄우고 방패병만 15마리 온다거나, 늪지대만 엄청 나온다거나."
  //
  //  한 종류만 잔뜩 나오는 판은 **난이도 장치가 아니라 리듬 장치**다. 매 층 잘 짜인
  //  진형만 나오면 긴장이 평평해진다 — 가끔 어이없는 판이 끼면 그 다음 정상 층이
  //  다시 무겁게 느껴진다. 그리고 한 종류만 나오면 그 유닛의 성질을 몸으로 배운다
  //  (교육 과정과 같은 목적을 다른 방식으로 한 번 더 하는 셈이다).
  //
  //  ⚠ 규칙 셋:
  //   · **보스 층에는 안 나온다** — 그 층은 이미 자기 정체성이 있다.
  //   · **해금된 종류만** 고른다(교육 과정을 앞지르지 않는다).
  //   · 확률은 등반 시드에 묶는다 — 같은 등반 안에서는 같은 층이 같은 판이어야
  //     "이 층은 그런 층"이라고 배울 수 있다.
  THEMES: [
    { type: 'shieldman',   label: '방패병들이 화가 났습니다', hint: '전부 방패병입니다. 뚫을 한 방이 필요합니다' },
    { type: 'chemtrooper', label: '온통 늪지대가 되었습니다', hint: '전부 늪지기입니다. 느려지는 걸 각오하세요' },
    { type: 'rifleman',    label: '궁수 대회가 열렸습니다',   hint: '화살이 사방에서 날아옵니다. 계속 움직이세요' },
    { type: 'grenadier',   label: '돌 던지기 축제입니다',     hint: '그림자가 보이면 그 자리를 뜨세요' },
    { type: 'bayonet',     label: '전사들이 우르르 몰려왔습니다', hint: '수는 많지만 하나하나는 약합니다' },
    { type: 'medic',       label: '약초꾼들이 소풍을 나왔습니다', hint: '서로를 계속 살립니다. 한 곳씩 끊으세요' },
    { type: 'sniper',      label: '투창 시합이 한창입니다',   hint: '피할 수 없는 창입니다. 빨리 붙으세요' },
    { type: 'mgnest',      label: '쇠뇌 진지를 잔뜩 지었습니다', hint: '숨을 곳이 없습니다. 곧장 파고드세요' }
  ],
  // 데뷔 층에서 **소개하는 유닛이 차지할 최소 비율**. 과반이라야 "저놈이 새로 온 놈"이
  // 읽힌다 — 1/15 로 섞여 있으면 소개 화면을 읽고 들어가도 찾지 못한다.
  // 1.0(전부)은 일부러 피한다: 그건 테마 층의 그림이고, 두 장치가 같아 보이면 안 된다.
  DEBUT_SHARE: 0.55,
  // 데뷔 유닛에 쓸 수 있는 예산 상한. 이게 없으면 비싼 유닛(쇠뇌 진지·족장)의 데뷔 층이
  // 예산을 다 먹어 단일 종류 판이 된다 — 그건 테마 층의 그림이다.
  //  ⚠ 0.7 로 뒀더니 **R-1 이 깨졌다**(15층 무조작 돌파 17%, 한계 10%). 이유는
  //    난이도 설계가 아니라 산수다 — 데뷔 유닛이 0.7 에서 막히자 남은 예산이 싼 유닛
  //    쪽으로 갔는데 그쪽은 개수(`maxOthers`)로 묶여 있어 **예산의 13% 가 그냥 안 쓰였다.**
  //    안 쓴 예산은 곧 얇은 진형이고, 얇으면 조작 없이도 뚫린다.
  //    0.85 는 "데뷔 유닛이 예산을 거의 다 먹되 다른 종류가 한 줌은 남는" 선이다.
  //  ⚠ 그리고 이 값은 **고정 상수면 안 된다.** 0.85 로 못박고 `share` 만 유닛별로
  //    낮췄더니 15층이 다시 21% 로 뛰었다 — share 를 낮춰 머릿수를 줄여 놓고 예산 상한은
  //    그대로라 데뷔 유닛이 여전히 예산을 다 먹었고, 그만큼 **다른 종류가 못 들어왔다.**
  //    두 값은 같이 움직여야 한다. 아래 식(share + 0.30)이 위 표를 실제로 잰 조건이다.
  debutBudgetCap: function (share) { return Math.min(0.85, (share || this.DEBUT_SHARE) + 0.30); },

  THEME_FROM_FLOOR: 6,        // 5층까지는 기본기를 배우는 자리라 변주를 안 넣는다
  THEME_CHANCE: 0.11,

  // 이 층이 테마 층인가 → 테마 항목(아니면 null). seed 는 등반 시드다.
  themeFor: function (floor, seed, unlockedTypes) {
    if (floor < this.THEME_FROM_FLOOR) return null;
    if (GAME.Tower && GAME.Tower.isBossFloor && GAME.Tower.isBossFloor(floor)) return null;
    // 데뷔 층에는 테마를 안 건다 — 테마는 판을 **한 종류로** 갈아치우므로, 소개하려던
    // 유닛이 그 판에서 통째로 사라진다(6·9·12·15·18·19·24·28층이 겹칠 수 있다).
    // 소개하는 층은 소개가 우선이다.
    if (this.debutOf(floor)) return null;
    // 시드 + 층으로 결정적 난수 — 같은 등반에서 같은 층은 늘 같은 판이다.
    var h = ((seed || 1) * 2654435761 + floor * 40503) >>> 0;
    var r = (h % 1000) / 1000;
    if (r >= this.THEME_CHANCE) return null;
    var pool = this.THEMES.filter(function (t) {
      return !unlockedTypes || unlockedTypes.indexOf(t.type) >= 0;
    });
    if (!pool.length) return null;
    return pool[(h >>> 10) % pool.length];
  },

  // 전부 풀리는 층. 이 위로는 제한이 없다(= 예전과 같은 뽑기).
  fullFloor: function () {
    var m = 0;
    for (var i = 0; i < this.UNLOCK.length; i++) m = Math.max(m, this.UNLOCK[i].floor);
    return m;
  },

  // ══════════════════════════════════════════════════════════════════════════
  //  시즌2 「다섯 세계」 — 세계 표 · 전장 규칙 · 세계 보스 (2026-09-03 S-W)
  //
  //  태현님: "통곡의 탑 120층 넘었는데 지루해, 매번 같은 패턴 반복." 정독 결과
  //  4~61층에 어휘가 소진되고 61층 이후 새 어휘는 보스 6마리뿐이었다. 그래서
  //  **층대마다 세계가 바뀌고 규칙·편성·보스 문법이 바뀐다.** 이 절이 그 정본이다 —
  //  협동(S-C)·렌더(S-A)·사운드(S-S)·시즌 프레임(S-F)이 아래 이름을 그대로 부른다:
  //      worldFor(floor) · fieldFor(floor, seed) · worldBossKeyFor(floor) · worldEntryFloor(key)
  //
  //  ⚠ 정본 키·경계는 `js/season.js` 의 `GAME.Season.WORLDS` 다(meadow/mire/ash/rift/storm,
  //    1~30 / 31~60 / 61~100 / 101~150 / 151+, 세계 보스 30·60·100·150·200). Season 이
  //    있으면 **그 표를 읽고**, 없을 때(도구·옛 캐시)만 아래 사본을 쓴다 — 두 표가
  //    갈라지면 메뉴는 '잿더미'라는데 전투는 안개늪 규칙을 태우는 사고가 난다.
  //    `UI.WORLD_BOUNDS`([31,61,101,151])·`Music.worldKeyFor` 도 같은 경계다.
  //  ⚠ 세계는 **배수가 아니라 규칙**이다. 초원(1~30)은 전장 규칙 null·세계 조건 없음 —
  //    R-3(10·20층)와 1~30층 곡선의 기준선을 한 톨도 안 움직인다(tools/tower-world-audit.js
  //    가 fresh 캐릭터 배수 1.000 과 초원 발동 0 을 대조군으로 잰다).
  // ══════════════════════════════════════════════════════════════════════════
  WORLDS: [
    { key: 'meadow', name: '초원',      from: 1,   to: 30,       boss: 30,  icon: '🌿' },
    { key: 'mire',   name: '안개늪',    from: 31,  to: 60,       boss: 60,  icon: '🌫' },
    { key: 'ash',    name: '잿더미',    from: 61,  to: 100,      boss: 100, icon: '🌋' },
    { key: 'rift',   name: '균열',      from: 101, to: 150,      boss: 150, icon: '⛰' },
    { key: 'storm',  name: '폭풍 하늘', from: 151, to: Infinity, boss: 200, icon: '🌩' }
  ],

  //  세계마다 다른 것 — 화면 한 줄(rule/field)과 세계 보스 키. 전장 규칙의 실제 값은
  //  `fieldFor`, 세계 조건의 실제 값은 js/towerrule.js `WORLD_RULES` 가 정본이다.
  WORLD_INFO: {
    meadow: { boss: 'bossNest',
              rule: '규칙 없음 — 기본 진형', field: null,
              short: '기본' },
    mire:   { boss: 'bossSwampMother',
              rule: '안개(원거리 사거리 30%↓) 또는 늪 구역 · 좁은눈 상시',
              field: '안개 · 늪', short: '안개·늪' },
    ash:    { boss: 'bossAshLord',
              rule: '용암 구역이 시간이 갈수록 넓어진다 · 광란 강화',
              field: '용암 확장', short: '용암' },
    rift:   { boss: 'bossRiftGiant',
              rule: '12초마다 지진 — 예고 뒤 발이 묶인다 · 결속 상시',
              field: '지진 12초', short: '지진' },
    storm:  { boss: 'bossStormKing',
              rule: '바람이 밀고 낙뢰가 떨어진다 · 광란+끈질김 조합',
              field: '바람 · 낙뢰', short: '바람·낙뢰' }
  },
  //  폭풍 하늘 보스 주기(200 부터 50마다). `Tower.DRAGON_FROM`(300)부터는 태초의 용과
  //  번갈아 나온다 — 무한의 탑이라 '마지막 보스'는 끝이 아니라 가장 무거운 주기다.
  STORM_BOSS_EVERY: 50,

  //  정본 표 — Season 이 있으면 그것(키·경계·보스 층을 공유), 없으면 사본.
  worlds: function () {
    var S = GAME.Season;
    var src = (S && S.WORLDS && S.WORLDS.length) ? S.WORLDS : this.WORLDS;
    var out = [];
    for (var i = 0; i < src.length; i++) {
      var w = src[i];
      var mine = this.WORLDS[i] || {};
      out.push({ key: w.key, name: w.name, idx: i, from: w.from, to: w.to, boss: w.boss,
                 icon: w.icon || mine.icon || '' });
    }
    return out;
  },

  //  floor → { key, name, idx, from, to, boss, icon, rule, field, short, bossKey }
  worldFor: function (floor) {
    var f = Math.max(1, Math.round(Number(floor) || 1));
    var ws = this.worlds(), idx = 0;
    for (var i = 0; i < ws.length; i++) if (f >= ws[i].from) idx = i;
    var w = ws[idx], info = this.WORLD_INFO[w.key] || {};
    w.rule = info.rule || ''; w.field = info.field || null; w.short = info.short || '';
    w.bossKey = info.boss || null;
    return w;
  },
  worldByKey: function (key) {
    var ws = this.worlds();
    for (var i = 0; i < ws.length; i++) if (ws[i].key === key) return this.worldFor(ws[i].from);
    return null;
  },
  //  세계의 첫 층(31·61·101·151). 모르는 키면 null.
  worldEntryFloor: function (key) {
    var w = this.worldByKey(key);
    return w ? w.from : null;
  },
  //  이 층이 **세계 진입 층**인가 — 31·61·101·151, 그리고 폭풍 하늘은 50주기(201·251…)마다
  //  다시 '새 폭풍'으로 알린다(층수만 오르는 구간에 마디를 만든다). 포인트·스팅어는
  //  towerloading 이 세계 키당 최초 1회만 준다(이 함수는 화면 판정만).
  isWorldEntry: function (floor) {
    var f = Math.round(Number(floor) || 0);
    if (f <= 1) return false;
    var ws = this.worlds();
    for (var i = 1; i < ws.length; i++) if (ws[i].from === f) return true;
    var last = ws[ws.length - 1];
    if (f > last.from && (f - last.from) % this.STORM_BOSS_EVERY === 0) return true;
    return false;
  },

  //  세계 보스 층 → 보스 키. 30·60·100·150 은 세계 표의 boss 층, 폭풍 하늘은 200 부터
  //  50마다(태초의 용 사다리 `Tower.DRAGON_FROM` 부터는 둘이 번갈아). 그 밖은 null —
  //  `Tower.bossKeyFor` 가 기존 사다리(권속·알·부위)로 채운다.
  worldBossKeyFor: function (floor) {
    var f = Math.round(Number(floor) || 0);
    if (f <= 0) return null;
    var ws = this.worlds();
    var last = ws[ws.length - 1];
    if (f >= last.boss && (f - last.boss) % this.STORM_BOSS_EVERY === 0) {
      var T = GAME.Tower, dFrom = (T && T.DRAGON_FROM) || 300;
      if (f >= dFrom && Math.floor((f - dFrom) / this.STORM_BOSS_EVERY) % 2 === 0) {
        return (T && T.DRAGON_KEY) || 'bossDragonLord';
      }
      return this.WORLD_INFO[last.key].boss;
    }
    for (var i = 0; i < ws.length - 1; i++) {
      if (ws[i].boss === f) return this.WORLD_INFO[ws[i].key].boss;
    }
    return null;
  },
  isWorldBossFloor: function (floor) { return !!this.worldBossKeyFor(floor); },

  // ── 전장 규칙 (state.towerField) ─────────────────────────────────────────
  //  엔진(S-E, js/combat.js `setField`/`updateArenaRule`) 스키마를 **데이터로 채운다.**
  //  좌표는 전부 **아레나 비율**(x,y 0~1 · r/maxR 은 폭 비율)이다 — px 로 적으면
  //  `_buildField` 가 다시 폭을 곱해 조용히 맵 밖이 된다.
  //  시드는 등반 시드(TowerChar.climbSeed)라 같은 등반에서는 같은 층이 같은 구역이고,
  //  등반을 다시 시작하면 구역 위치가 조금씩 달라진다(js/towerplan.js 시드 규율 그대로).
  //  ⚠ 한 층에 **한 종류**만 실을 수 있다(엔진 `F.kind` 하나). 안개늪의 '안개+늪'은
  //    층마다 둘 중 하나가 걸리고, 보스(늪의 어미)는 페이즈에서 안개→늪으로 바꾼다.
  //  ⚠ 초원은 언제나 null(R-3 기준선). 보너스 판은 battle.js 가 아예 안 부른다.
  FIELD_SEED_SALT: 0x5f1e1d,
  _rng: function (seed) {
    var s = seed | 0; if (!s) s = 1;
    return function () {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s |= 0;
      return ((s >>> 0) % 100000) / 100000;
    };
  },
  _seedNow: function () {
    var tc = GAME.TowerChar && GAME.TowerChar.get && GAME.TowerChar.get();
    if (tc && tc.climbSeed) return tc.climbSeed | 0;
    var run = GAME.TowerRun && GAME.TowerRun.get && GAME.TowerRun.get();
    if (run && run.seed) return run.seed | 0;
    return 0x5eed;
  },
  fieldFor: function (floor, seed) {
    var f = Math.round(Number(floor) || 0);
    if (f <= 0) return null;
    var w = this.worldFor(f);
    if (w.key === 'meadow') return null;
    var s = (seed === undefined || seed === null) ? this._seedNow() : (seed | 0);
    var r = this._rng((s ^ (f * 2654435761) ^ this.FIELD_SEED_SALT) | 0);
    var boss = this.isWorldBossFloor(f);
    if (w.key === 'mire') {
      //  안개 ↔ 늪 — 세계 보스 층은 안개(보스 페이즈가 늪을 편다). 그 밖은 절반씩.
      if (boss || r() < 0.5) return { kind: 'fog', rangeMul: 0.7, meleeBelow: 130 };
      var zn = 1 + Math.floor(r() * 2), zones = [];
      for (var zi = 0; zi < zn; zi++) {
        zones.push({ x: +(0.25 + r() * 0.5).toFixed(3), y: +(0.34 + r() * 0.30).toFixed(3),
                     r: +(0.10 + r() * 0.05).toFixed(3), slowMul: 0.55 });
      }
      return { kind: 'swamp', zones: zones, slowMs: 400 };
    }
    if (w.key === 'ash') {
      //  용암 — 작게 시작해 시간에 따라 넓어진다(px/s, 엔진이 WORLD_SCALE 을 곱한다).
      //  피해는 최대체력 비율(pct)이라 층 배수와 무관하게 "서 있으면 4%/초" 다.
      //  ⚠ 자리는 **영웅이 건너는 띠**(y 0.45~0.70 — 진형 아래·시작 구역 위)에 둔다.
      //    가운데(0.36~0.64)에 뒀더니 영웅 AI 가 한 번도 안 밟았다(감사 lava 0틱) —
      //    "전장이 좁아진다"는 건너야 하는 길이 좁아진다는 뜻이다.
      var ln = boss ? 1 : 1 + Math.floor(r() * 2), lz = [];
      for (var li = 0; li < ln; li++) {
        lz.push({ x: +(boss ? 0.5 : 0.30 + r() * 0.40).toFixed(3), y: +(boss ? 0.55 : 0.45 + r() * 0.25).toFixed(3),
                  r: 0.06, maxR: +(0.14 + r() * 0.08).toFixed(3), growPx: 5 });
      }
      return { kind: 'lava', zones: lz, pct: 0.02, tickMs: 500 };
    }
    if (w.key === 'rift') {
      return { kind: 'quake', periodMs: 12000, warnMs: 2000, rootMs: 600,
               first: 8000 + Math.floor(r() * 4) * 1000 };
    }
    //  폭풍 하늘 — 바람 방향은 시드마다 다르다(좌우 어느 쪽으로 밀리는지가 곧 공략).
    var dirs = [0, Math.PI, Math.PI * 0.25, Math.PI * 0.75, -Math.PI * 0.25, -Math.PI * 0.75];
    return { kind: 'storm', windDir: dirs[Math.floor(r() * dirs.length)], windPx: 40,
             boltEveryMs: 6000, boltFirst: 5000, boltRadius: 0.11, boltTelegraph: 2000, boltPct: 0.25 };
  },
  //  로딩·허브용 한 줄. def 를 읽어 말한다(표와 실제가 갈라지지 않게).
  fieldLabel: function (def) {
    if (!def) return null;
    switch (def.kind) {
      case 'fog':   return '안개 — 원거리 사거리가 30% 준다';
      case 'swamp': return '늪 구역 — 안에 서면 느려진다';
      case 'lava':  return '용암 — 시간이 갈수록 넓어진다. 서 있으면 탄다';
      case 'quake': return '지진 — 예고 뒤 발이 묶인다. 미리 자리를 잡자';
      case 'storm': return '폭풍 — 바람이 밀고, 발밑에 낙뢰 예고가 뜨면 비키자';
    }
    return null;
  }
};

//  S-F(js/scenes/tower.js `_worldLine`)가 `GAME.TowerWorld.worldFor` 를 먼저 본다 — 같은 객체다.
GAME.TowerWorld = GAME.TowerCurriculum;
