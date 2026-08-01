window.GAME = window.GAME || {};

// 통곡의 탑 — **꼭대기가 없는 무한의 탑.** 어디까지 오르느냐가 곧 실력이다.
//
//   1~3층  연습 구간. 영웅 예산이 진형보다 많아 조작을 몰라도 오를 수 있다.
//   4층~   본 구간. 진형 예산이 확 뛰어 **조작하지 않으면 이길 수 없다.**
//   10층마다 보스. 층수만 올라가는 무한의 탑에 '구간'을 만들어 주는 장치다.
//
//   올라갈수록 예산이 조금씩(+4) 늘고, AI 가 그 플레이어와 **그 영웅**을 깨는 조합으로 짠다.
//   지면 1층으로 돌아간다. 도달한 최고 층수가 ID 별로 남아 랭킹 점수가 된다.
GAME.Tower = {
  KEY: 'asymgame.tower.v1',
  BASE_BUDGET: 100,

  // 층당 증가폭. **무한의 탑이라 이 값이 곧 '얼마나 오래 오를 수 있는가'다.**
  // +10 이면 프로도 10~12층에서 끊기고(실측), +4 면 30층대까지 오른다.
  // 천천히 조여야 층수 자체가 실력의 척도가 된다.
  BUDGET_STEP: 4,

  _all: function () { return GAME.Store.get(this.KEY, {}); },
  _key: function () { return GAME.Account.current() || 'guest'; },

  get: function () {
    var rec = this._all()[this._key()];
    if (!rec) return { floor: 1, best: 0, runs: 0, clears: 0 };
    if (!rec.floor) rec.floor = 1;
    return rec;
  },

  _save: function (rec) {
    var all = this._all();
    all[this._key()] = rec;
    GAME.Store.set(this.KEY, all);
  },

  // ── 패배 = 1층부터 다시 (2026-07-29, 사용자 지시) ────────────────────────
  //
  // 예전에는 **체크포인트**가 있었다(`CHECKPOINT_EVERY: 3` — 최고 기록 아래
  // 가장 가까운 3의 배수에서 재시작). 근거는 페르소나 이탈 시뮬이었다:
  // "진행 상실"이 두 번째로 큰 이탈 사유였고, 간격을 5→3 으로 좁히자
  // 잔존율이 50%→62% 로 올랐다.
  //
  // ⚠ 그 체크포인트를 **없앴다.** 사용자 지시가 "1번이라도 패배하면 1층부터 다시"다.
  //   이 변경에는 측정된 비용이 있다 — `node tools/personas.js` 로 **같은 시드 10개를
  //   짝지어** 잰 값(2026-07-29. 옛 규칙은 `checkpointFor` 를 되살려 같은 코드베이스에서
  //   측정했다 — 그때 다른 에이전트가 autoformation.js 를 고치고 있어서, 시각이 다른
  //   숫자끼리 비교하면 그쪽 변경이 섞인다):
  //     잔존율 평균 55.2% → **49.6%** (-5.6%p). 10개 시드 중 8개가 하락·1개 상승.
  //     이탈 사유 '진행 상실' 0명 → 50명 중 3~7명(평균 5명, 약 10%)으로 되살아났다.
  //     대신 '취향 불일치' 이탈은 줄었다 — 더 일찍 떠나서 그 판정까지 못 간 것이다.
  //   대신 규칙이 단순해지고
  //   (탑은 한 번 지면 처음부터), 아래 `TowerRun.end()` 와 규칙이 일치한다 —
  //   예전에는 층은 3층으로 되돌아가는데 영웅·아이템·골드는 통째로 사라져
  //   "체크포인트가 있다"는 말이 절반만 사실이었다.
  //
  // `checkpointFor`/`CHECKPOINT_EVERY` 는 제거했다. 남겨두면 도구
  // (`tools/personas.js` 가 존재 여부로 분기한다)가 옛 규칙을 계속 측정한다.

  // 탑은 두 구간으로 나뉜다.
  //
  //   1~3층 (연습 구간): 영웅 예산이 진형보다 많다. 조작을 몰라도 올라갈 수 있다.
  //   4층부터 (본 구간): 진형 예산이 **영웅을 확 앞지른다.**
  //     "4층부터는 컨트롤 안 하면 진다"가 이 게임이 지켜야 할 약속이라,
  //     그 경계에서 예산을 한 번 크게 점프시킨다. 완만히 올리면 8~10층까지
  //     무조작으로 뚫려서(실측 67%) 약속이 깨진다.
  //   점프 폭은 실측으로 정했다: 110 이면 헌병대가 무조작으로 4층을 67% 뚫고,
  //   170 이면 숙련자도 못 넘는 벽이 된다. 147(4층 예산 255)에서 무조작 0% / 프로 80%대가 나온다.
  EARLY_FLOORS: 3,
  ENTRY_JUMP: 147,

  budgetFor: function (floor) {
    var early = this.BASE_BUDGET + (Math.min(floor, this.EARLY_FLOORS) - 1) * this.BUDGET_STEP;
    if (floor <= this.EARLY_FLOORS) return early;
    return early + this.ENTRY_JUMP + (floor - this.EARLY_FLOORS - 1) * this.BUDGET_STEP;
  },

  // 영웅 예산은 **더 높게 시작해서 더 느리게** 오른다.
  //
  //   · 시작을 높게(135) — 1층은 확실히 쉬워야 한다. 진형 100 vs 영웅 100 이면
  //     1층 돌파율이 75% 밖에 안 나왔다(실측). 135 로 올리니 94~100% 가 된다.
  //   · 증가를 느리게(+5/층) — 양쪽을 똑같이 올리면 난이도가 아예 오르지 않는다.
  //     예산이 커질수록 아이템 효율이 유닛 추가보다 좋아서 컨트롤러가 유리해진다.
  // 2026-07-29 · 135 → **170** (사용자 지시: "초반 시작 골드를 넉넉히").
  //   근거: 1층 예산 135 에서 영웅값 78 을 빼면 아이템에 쓸 돈이 **57** 이었다.
  //   최저가 한 벌(돌칼15+가죽15+짚신12+옹달샘10)이 52 라, 사실상 '전부 최하급'
  //   외에 선택지가 없었다 — 고르는 화면인데 고를 게 없는 상태.
  //   170 이면 92 가 남아 한두 칸을 중급으로 올리는 선택이 생긴다.
  //   ⚠ 저층이 그만큼 쉬워진다. R-1(4층 이상 무조작 0%)을 반드시 다시 잴 것.
  HERO_BASE_BUDGET: 170,
  HERO_BUDGET_STEP: 5,

  // 영웅이 실제로 쓸 수 있는 최대 금액(가장 비싼 영웅 + 칸별 최고가 아이템).
  // 이걸 넘겨서 주면 화면에 표시되는 예산이 거짓말이 된다 — 쓸 수가 없는 돈이다.
  maxSpendable: function () {
    // 영웅 비용은 3종 공통(`GAME.HERO_BASE_COST`)이라 '가장 비싼 영웅'을 찾을 필요가 없다.
    // (예전엔 75/85/75 라 최댓값 85 를 썼다 → maxSpendable 260. 지금은 78 이라 253.)
    // 방어적으로 읽는다. 여기가 NaN 이 되면 heroBudgetFor → 수성의 탑 overflow 보정까지
    // 예산 계산 전체가 통째로 오염된다(구버전 heroes.js 가 캐시로 섞이는 경우 대비).
    var hero = (typeof GAME.HERO_BASE_COST === 'number') ? GAME.HERO_BASE_COST : 78;
    var items = 0;
    for (var i = 0; i < GAME.ITEM_SLOTS.length; i++) {
      var list = GAME.ITEMS[GAME.ITEM_SLOTS[i].key] || [];
      var best = 0;
      for (var j = 0; j < list.length; j++) if (list[j].cost > best) best = list[j].cost;
      items += best;
    }
    return hero + items;
  },

  heroBudgetFor: function (floor) {
    var b = this.HERO_BASE_BUDGET + (floor - 1) * this.HERO_BUDGET_STEP;
    return Math.min(b, this.maxSpendable());
  },

  // 층이 올라갈수록 유닛 자체도 단단해진다(예산만으로는 후반이 심심해진다).
  // 무한의 탑이라 계수를 낮게 잡는다 — 0.025 면 20층에서 프로도 0% 가 된다(실측).
  //
  // ⚠ **층 조건 배수는 여기서 곱한다**(towerrule.js). 두 축을 한 함수에 두는 이유:
  //   호출부가 하나뿐이라 조건을 빠뜨릴 자리가 없다. 다만 **성장(층수)과 조건(규칙)은
  //   서로 다른 목적**이라는 것을 잊지 말 것 — 성장은 완만하게 어렵게 만들고,
  //   조건은 난이도가 아니라 **답을 바꾼다**(그래서 체력을 깎으며 장갑을 올리기도 한다).
  //   곡선을 다시 잴 때는 `Tower.modsFor(n, true)` 로 조건을 빼고 재는 것이 맞다.
  modsFor: function (floor, skipRule) {
    var t = Math.max(0, floor - 1);
    var m = { hp: 1 + 0.012 * t, damage: 1 + 0.010 * t };
    if (skipRule || !GAME.TowerRule) return m;
    return GAME.TowerRule.applyMods(m, GAME.TowerRule.ruleFor(floor));
  },

  // ── 보스 전용 성장 (2026-08-01 사용자 지시: "보스가 너무 약해") ────────────────
  //  ⚠ 이 파일이 **이미 원인과 해법을 적어 두고 있었다**(아래 BOSS_ESCORT 주석):
  //    "보스 기여가 자기가 밀어낸 예산보다 얇아진다 … 근본 해법은 보스 성장률을
  //     예산 성장률에 맞추는 것이다." 그때는 미뤘고, 지금 그걸 한다.
  //
  //  왜 지금 특히 문제인가: 아이템 가격·효과가 지수가 되면서(js/towershopitems.js)
  //  영웅 화력이 층당 지수로 자란다 — 40층 T7 무기 하나가 공격력 +620 이다.
  //  그런데 보스는 `modsFor`(hp +1.2%/층)만 받아 40층에서도 hp 1,000×1.47 ≈ 1,470 이다.
  //  두 번 휘두르면 끝나는 '보스'다. **선형 성장이 지수 성장을 못 따라간다.**
  //
  //  그래서 보스만 지수로 키운다. 목표는 "영웅 화력의 15~25대 분량"이다:
  //    층    영웅 대략 화력   보스 hp(1,000 기준)
  //    10       ~90            1,920
  //    20      ~160            4,000
  //    30      ~320            8,200
  //    40      ~650           17,000
  //  공격력은 조금 완만하게(1.065) — 영웅 체력도 방어구로 같이 자라지만 한 방에
  //  죽으면 배울 기회가 없다. 보스는 두꺼워서가 아니라 **무서워서** 어려워야 한다는
  //  아래 원칙은 유지한다(능력 `charge`/`barrage` 는 그대로다).
  BOSS_HP_RATE: 1.075,
  BOSS_DMG_RATE: 1.065,
  bossModsFor: function (floor) {
    var base = this.modsFor(floor);          // 층 조건(towerrule)도 그대로 태운다
    var t = Math.max(0, floor - 1);
    return {
      hp: base.hp * Math.pow(this.BOSS_HP_RATE, t),
      damage: base.damage * Math.pow(this.BOSS_DMG_RATE, t)
    };
  },

  // ── 보스 층 ──────────────────────────────────────────────────
  // 10층마다 보스가 나온다. 층수만 올라가는 무한의 탑에 '구간'을 만들어 주는 장치다.
  BOSS_EVERY: 10,
  // 보스 층 호위 예산 비율. 실측으로 잡았다 —
  // 0.70 이면 보스 층이 벽(프로 0~20%), 0.50 이하면 오히려 무조작이 뚫는다(20%).
  // 0.60 에서 무조작 0% 를 지키면서 프로 13~40% 가 나온다.
  // 0.60 → 0.66 (2026-07-29). **20층 보스만** 이웃보다 쉬워지던 것을 고친다.
  //  원인: ESCORT 가 **비율**이라 깎이는 호위 예산의 절대량이 층과 함께 자란다
  //  (10층 −112 · 20층 −128 · 30층 −144). 반면 보스 보상은 modsFor(hp+1.2%/층)뿐이라
  //  껍질 골렘 hp 가 1420→1744 에 그친다 — **보스 기여가 자기가 밀어낸 예산보다 얇아진다.**
  //  20층 보스가 순환상 껍질 골렘(속도 78, 셋 중 가장 느려 가장 잘 카이팅된다)인 것이 겹친다.
  //  30★(둥지 포탑, 사거리=맵)는 같은 조건에서도 −10~−13%p 로 멀쩡하다.
  //  실측(rep=96, 시드 2개, 숙련 0.9). Δ = 보스층 − 이웃 평균, 음수라야 통과:
  //    0.60  PC 20★ +0.5 / +3.5 ❌ · 폰 +1.5 / +7.5 ❌
  //    0.66  PC 20★ −8.5 / −11.5 ✅ · 폰 −7.5 / −7.5 ✅   (10★·30★ 는 어느 값에서도 안 나빠진다)
  //  0.72 도 통과하지만 위 '0.70 이면 벽' 경고가 있어 0.66 을 택했다.
  //  ⚠ 비율이라 50층대에서 또 어긋난다. 근본 해법은 호위 예산을 **절대 유보액**으로 두거나
  //    보스 성장률을 예산 성장률에 맞추는 것이다.
  BOSS_ESCORT: 0.66,
  BOSS_ORDER: ['bossChief', 'bossShell', 'bossNest'],

  isBossFloor: function (floor) {
    return floor > 0 && floor % this.BOSS_EVERY === 0;
  },

  bossKeyFor: function (floor) {
    if (!this.isBossFloor(floor)) return null;
    var idx = Math.floor(floor / this.BOSS_EVERY) - 1;
    return this.BOSS_ORDER[idx % this.BOSS_ORDER.length];
  },

  bossFor: function (floor) {
    var k = this.bossKeyFor(floor);
    return k ? GAME.UNITS[k] : null;
  },

  // 이 층의 배치도를 만든다. 1~2층은 성향 반영을 약하게 해서 진입 장벽을 낮춘다.
  //
  // heroKey 를 받는 게 중요하다 — 한 배치가 모든 영웅을 커버할 수는 없다.
  // **어떤 영웅으로 올라오는지 먼저 보고** 그 영웅의 카운터로 짠다.
  formationFor: function (floor, heroKey) {
    var budget = this.budgetFor(floor);
    var bossKey = this.bossKeyFor(floor);

    // 보스 층은 호위를 줄이고 보스를 얹는다. 예산을 그대로 두고 보스만 더하면
    // 그 층만 난이도가 두 배가 되어 '구간'이 아니라 벽이 된다.
    // 너무 많이 줄이면 반대로 보스 층이 **더 쉬워져** '4층부터 조작 필수' 약속이 깨진다.
    if (bossKey) budget = Math.round(budget * this.BOSS_ESCORT);

    var prof = GAME.Profile.read();
    var useProfile = floor >= 3 && prof.battles >= 1;

    // 영웅 카운터를 쓸지 말지.
    //
    // 영구 캐릭터(js/towerchar.js)가 있으면 영웅은 **그 캐릭터 내내 고정**이다.
    // 그런 상황에서 매 층 그 영웅의 카운터를 얹으면 같은 상성이 영원히 반복돼
    // '벽'처럼 느껴진다. 그래서 카운터를 끄고 **그 사람의 전투 양상**(Profile —
    // 교전거리·회피·진입 방향)만으로 배치를 짠다.
    // ⚠ 2026-08-01 — 예전엔 `TowerRun`(도전 단위, 지면 사라짐)을 봤다. 지금은
    //   `TowerChar`(캐릭터 단위, 영구)로 바뀌었다 — 판정 대상만 바뀌었을 뿐
    //   "고정된 영웅에게는 카운터를 끈다"는 규칙 자체는 그대로다.
    var runActive = !!(GAME.TowerChar && GAME.TowerChar.exists());
    // 유닛 교육 과정(js/towercurriculum.js) — 층에 따라 등장 종류를 늘려 간다.
    // 1층은 전사만, 3층에 궁수, 5층에 투석꾼… 한 층에 한 종류씩 소개한다.
    // 표를 다 푼 층부터는 null 을 넘겨 예전과 같은 전 종류 뽑기가 된다.
    var allowTypes = null, maxUnits = 0;
    if (GAME.TowerCurriculum && floor <= GAME.TowerCurriculum.fullFloor()) {
      allowTypes = GAME.TowerCurriculum.typesFor(floor);
      // 연습 구간(1~3층)은 머릿수도 묶는다 — 종류만 줄이면 예산이 최저가 유닛으로
      // 몰려 오히려 더 빽빽해진다(towercurriculum.js 의 MAX_UNITS 주석 참조).
      maxUnits = GAME.TowerCurriculum.maxUnitsFor(floor);
    }
    var f = GAME.AutoFormation.generate(budget, useProfile ? prof : null, {
      id: 'tower-' + floor,
      name: floor + '층',
      tier: '탑 ' + floor + '층',
      heroKey: runActive ? null : (heroKey || null),
      allowTypes: allowTypes,
      maxUnits: maxUnits,
      // 층이 오를수록 **더 세게 읽는다**(js/autoformation.js 의 readMul 주석).
      // 3층에서 1.0 으로 시작해 층당 +8%, 상한 3.5배(≈35층). 예산은 '많아진다'를,
      // 이 값은 '읽힌다'를 담당한다 — 둘이 갈라져 있어야 후자가 느껴진다.
      readMul: useProfile ? Math.min(3.5, 1 + Math.max(0, floor - 3) * 0.08) : 1
    });
    // 이번 층이 **나를 어떻게 읽었는지**를 배치도에 실어 보낸다(로딩 화면이 띄운다).
    if (useProfile && GAME.Profile && GAME.Profile.readNote) {
      f.readNote = GAME.Profile.readNote(prof, floor);
    }

    // ── 테마 층 — 한 종류만 잔뜩 (2026-08-01) ────────────────────────────────
    //  구성을 통째로 갈아끼운다. 좌표는 그대로 두고 아래 `TowerPlan.apply` 가
    //  원형에 맞춰 다시 놓으므로, 여기서는 **무엇이 몇 기인가**만 정하면 된다.
    //  ⚠ 예산을 지킨다 — 한 종류로 채우되 총액이 원래 예산을 넘지 않게 센다.
    //    안 지키면 '재미있는 판'이 그냥 '불공정한 판'이 된다.
    if (GAME.TowerCurriculum) {
      var seedNow = (GAME.TowerChar && GAME.TowerChar.get() && GAME.TowerChar.get().climbSeed) || 1;
      var theme = GAME.TowerCurriculum.themeFor(floor, seedNow, allowTypes);
      var tDef = theme && GAME.UNITS[theme.type];
      if (tDef && tDef.cost > 0) {
        var n = Math.max(3, Math.min(24, Math.floor(budget / tDef.cost)));
        var tu = [];
        for (var ti = 0; ti < n; ti++) {
          // 좌표는 임시다(원형이 다시 놓는다). 그래도 원형이 없을 때를 대비해
          // 앞뒤로 고르게 흩어 둔다 — 한 점에 겹쳐 두면 그대로 뭉텅이가 된다.
          tu.push({ type: theme.type,
                    nx: 0.10 + 0.80 * ((ti % 6) / 5),
                    ny: 0.12 + 0.26 * (Math.floor(ti / 6) / Math.max(1, Math.ceil(n / 6) - 1 || 1)) });
        }
        f.units = tu;
        f.themeLabel = theme.label;
        f.themeHint = theme.hint;
        f.name = floor + '층 · ' + theme.label;
      }
    }

    // ── 층 배치 원형 (2026-07-30 대개편) ────────────────────────────────────
    //  구성은 위에서 `AutoFormation` 이 정했고, **공간은 여기서 다시 정한다.**
    //  이게 "매번 똑같은 진형"이라는 신고의 직접 해답이다 — 구성 다양성은 이미
    //  아키타입 17/20 으로 높았는데(tools/formation-diversity.js) 배치 기하가 언제나
    //  'band 별 균등 가로 분포' 하나였다. 플레이어가 만지는 것은 구성이 아니라 공간이다.
    //  ⚠ **보스를 얹기 전에** 부른다 — 보스는 한가운데 뒤쪽이라는 자기 규칙이 있다.
    if (GAME.TowerPlan) GAME.TowerPlan.apply(f, floor);

    if (bossKey) {
      // 보스는 진형 한가운데 뒤쪽에 선다
      f.units.push({ type: bossKey, nx: 0.5, ny: 0.13 });
      f.boss = bossKey;
      f.name = floor + '층 · 보스';
      f.rationale = GAME.UNITS[bossKey].name + ' — ' + GAME.UNITS[bossKey].desc +
                    '\n' + f.rationale;
    }
    // 층이 오를수록 켜지는 **전술 계층**을 배치도에 붙여 보낸다.
    f.tactics = this.tacticsFor(floor);
    // 층 조건 — 규칙 자체가 바뀐다(towerrule.js). 배치 원형이 **공간**을 바꾸고
    // 조건이 **규칙**을 바꾼다. 둘을 나눈 이유는 각각이 막는 습관이 다르기 때문이다.
    if (GAME.TowerRule) {
      var rule = GAME.TowerRule.ruleFor(floor);
      if (rule) {
        f.rule = rule.key;
        f.ruleLabel = rule.label;
        f.ruleDesc = rule.desc;
      }
    }

    // 화면이 "이 층은 뭐가 다른가"를 말할 수 있게 설명에 한 줄 얹는다.
    // 숫자가 조용히 오르기만 하면 플레이어는 '그냥 어려워졌다'로만 느낀다 —
    // 무엇이 달라졌는지 이름을 붙여 줘야 대응할 생각을 한다.
    // ⚠ **원형과 조건을 먼저 적는다.** 이 둘이 이 층을 다른 층과 구분하는 주역이고,
    //   전술·학습은 보조 정보다. 순서가 곧 중요도다.
    // 층 목표 — 무엇을 하면 이기는가. 조건보다도 먼저 알아야 하는 정보다.
    if (GAME.TowerObjective) {
      var obj = GAME.TowerObjective.objectiveFor(floor);
      if (obj) {
        f.objective = obj.key;
        f.objectiveLabel = obj.label;
        f.objectiveDesc = obj.desc;
      }
    }

    if (f.planLabel) {
      f.rationale = '진형: ' + f.planLabel + ' — ' + f.planHint +
                    (f.rationale ? '\n' + f.rationale : '');
    }
    if (f.ruleLabel) {
      f.rationale = '조건: ' + f.ruleLabel + ' — ' + f.ruleDesc +
                    (f.rationale ? '\n' + f.rationale : '');
    }

    var act = [];
    for (var ti = 0; ti < this.TACTICS.length; ti++) {
      var tk = this.TACTICS[ti].key;
      if (f.tactics[tk] > 0.1) act.push(this.NEW_TACTIC_LABEL[tk]);
    }
    if (act.length) {
      var fresh = this.newTacticAt(floor);
      // '전술' 은 쓸 수 없다 — '술' 이 config.js 의 800자 폰트 서브셋 밖이다
      // (넣으면 woff2 가 1개 146KB → 25개 491KB 가 된다). 뜻이 같은 '움직임' 을 쓴다.
      f.rationale = (f.rationale ? f.rationale + '\n' : '') +
        '움직임: ' + act.join(' · ') + (fresh ? '   ← 이번 층부터 ' + fresh : '');
    }
    // 탑이 **나를 상대로** 배운 것. 층 전술(누구에게나 같음)과 줄을 나눠 적는다 —
    // 한 줄에 섞으면 "원래 그런 것"과 "나 때문에 생긴 것"이 구분되지 않는다.
    if (GAME.TowerLearn) {
      var mine = GAME.TowerLearn.summary();
      if (mine) f.rationale = (f.rationale ? f.rationale + '\n' : '') + mine;
    }
    return f;
  },

  // ── 층별 전술 (2026-07-29, 사용자 지시) ─────────────────────────────────────
  //  "층이 오를수록 AI 가 패턴을 분석해 난이도가 올라가야 하니, 거리를 벌리거나
  //   대형을 유지하거나 약초꾼에게 가서 회복하는 전략적 움직임도 가능하도록 미리 설계."
  //
  //  ⚠ 왜 숫자를 층에 매다는가 — `js/learn.js` 의 학습(가설→시험→채택)은 **배치도별**로
  //    쌓인다. 그런데 통곡의 탑 배치도는 `tower-<층>` 이라 층마다 새 배치도이고,
  //    한 층을 여러 번 도전하지 않는 한 학습이 쌓일 자리가 없다. 그래서 탑에서는
  //    "몇 층인가"가 곧 "얼마나 영리한가"여야 한다. 학습은 대전·방어전에서 계속 돈다.
  //
  //  ⚠ 값은 **최댓값으로 합친다**(학습값과 층값 중 큰 쪽). 두 계층이 곱해지면
  //    고층에서 두 배로 세져 곡선이 통제 불능이 된다.
  //
  //  각 행동이 켜지는 층을 다르게 잡은 이유 — 한꺼번에 켜면 플레이어가 **무엇이 달라졌는지
  //  구분할 수 없다.** 한 층대에 하나씩 새 행동이 등장해야 "이번엔 뭐가 다르지"가 읽힌다.
  //    5층~  kite      다친 원거리가 물러나며 쏜다        (이미 combat.js 에 있던 행동)
  //   10층~  retreat   다친 유닛이 약초꾼에게 붙어 회복한다  (신설)
  //   16층~  cohesion  혼자 튀어나가지 않고 무리와 함께 나간다 (신설)
  //   22층~  press     교전조차 못 하는 유닛이 더 적극적으로 나간다 (이미 있던 행동)
  //  각각 시작 층에서 0 부터 시작해 GROWTH 층에 걸쳐 MAX 까지 오른다.
  TACTICS: [
    { key: 'kite',     from: 5,  growth: 14, max: 0.75 },
    { key: 'retreat',  from: 10, growth: 16, max: 0.90 },
    { key: 'cohesion', from: 16, growth: 18, max: 0.85 },
    { key: 'press',    from: 22, growth: 20, max: 0.60 }
  ],

  tacticsFor: function (floor) {
    var out = {};
    for (var i = 0; i < this.TACTICS.length; i++) {
      var t = this.TACTICS[i];
      if (floor < t.from) { out[t.key] = 0; continue; }
      var p = Math.min(1, (floor - t.from) / t.growth);
      out[t.key] = Math.round(t.max * p * 100) / 100;
    }
    return out;
  },

  // 학습값과 층 전술을 합친다 — **큰 쪽을 쓴다**(곱하지 않는다. 위 경고 참조).
  // 전투를 시작하는 쪽(scenes/battle.js · tools/sim.js)이 한 줄로 부른다.
  mergeTactics: function (learned, tactics) {
    var out = {};
    var k;
    for (k in (learned || {})) out[k] = learned[k];
    for (k in (tactics || {})) {
      out[k] = Math.max(typeof out[k] === 'number' ? out[k] : 0, tactics[k] || 0);
    }
    return out;
  },

  // 학습값은 **더한다**(최댓값이 아니다). 2026-07-29 실측이 이유다:
  //   층 전술은 고층에서 0.75~0.90 까지 오르는데 학습값 상한은 0.60 이라,
  //   최댓값으로 합치면 **고층에서 학습이 통째로 가려진다.** 실제로 학습을 켜고 끈
  //   A/B 에서 차이가 0.1층(28.9 vs 29.0)밖에 안 났다.
  //   층 전술은 "몇 층인가"이고 학습은 "**너**를 상대로 배운 것"이라 성격이 다르다 —
  //   후자는 언제나 얹혀야 의미가 있다. 상한 1.0 은 combat.js 의 행동들이
  //   0~1 비율로 쓰이기 때문이다(넘기면 이동 속도 배수가 1을 넘어 이상해진다).
  addTactics: function (base, extra, cap) {
    var lim = cap === undefined ? 1 : cap;
    var out = {}, k;
    for (k in (base || {})) out[k] = base[k];
    for (k in (extra || {})) {
      var v = (typeof out[k] === 'number' ? out[k] : 0) + (extra[k] || 0);
      out[k] = v > lim ? lim : v;
    }
    return out;
  },

  // 이 층에서 새로 켜진 전술의 이름 — 도전 화면이 "이번 층은 뭐가 다른가"를 말할 때 쓴다.
  NEW_TACTIC_LABEL: {
    kite: '거리 벌리기', retreat: '약초꾼에게 후퇴',
    cohesion: '대형 유지', press: '적극 압박'
  },
  newTacticAt: function (floor) {
    for (var i = 0; i < this.TACTICS.length; i++) {
      if (this.TACTICS[i].from === floor) return this.NEW_TACTIC_LABEL[this.TACTICS[i].key];
    }
    return null;
  },

  // 층 클리어
  clear: function (floor) {
    var rec = this.get();
    rec.clears = (rec.clears || 0) + 1;
    rec.floor = floor + 1;
    if (floor > (rec.best || 0)) rec.best = floor;
    this._save(rec);
    return rec;
  },

  // 실패 — **더 이상 1층으로 돌아가지 않는다** (2026-08-01, 사용자 지시).
  //  "실패하면 다시 1층으로 돌아가는 게 아니라, 캐릭터를 성장시켜서 최대 몇 층까지
  //   갈 수 있는지 시험하는 공간으로 바꿀 것." 캐릭터(`js/towerchar.js`)가 영구화된
  //  지금은 패배도 그 시험의 일부다 — 같은 층에서 바로 다시 도전할 수 있어야
  //  "어디까지 갈 수 있나"를 실제로 시험하게 된다(매번 1층부터면 grind 만 남는다).
  //  최고 기록(best)은 여전히 남는다(랭킹 점수의 근거라 지우면 안 된다).
  fail: function () {
    var rec = this.get();
    rec.runs = (rec.runs || 0) + 1;
    this._save(rec);
    return rec;
  },

  // 캐릭터를 **삭제할 때만** 층이 1로 돌아간다(요청 4번:
  // "플레이어는 캐릭터를 삭제하고 다시 1층부터 진행할 수 있어"). `best`/`runs`/`clears`
  // 는 계정의 영구 기록이라 건드리지 않는다 — 새 캐릭터도 같은 랭킹 줄에 쌓인다.
  resetFloor: function () {
    var rec = this.get();
    rec.floor = 1;
    this._save(rec);
    return rec;
  },

  reset: function () {
    var all = this._all();
    delete all[this._key()];
    GAME.Store.set(this.KEY, all);
  }
};
