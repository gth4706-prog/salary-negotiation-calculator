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

  // ══ 영웅 성장에 맞춘 압박 (2026-08-02 사용자 지시) ═══════════════════════════
  //  "30층을 넘어가니 통곡의 탑 깨기가 너무 쉬워. 전략 배치하는 쪽에서 유닛 업그레이드와
  //   영웅의 능력치, 그리고 전투 양상을 비교해서 그에 맞게 올리도록 해줘."
  //
  //  **이 파일이 이미 원인을 적어 두고 있었다** (아래 `bossModsFor` 주석):
  //  "아이템 가격·효과가 지수가 되면서 영웅 화력이 층당 지수로 자란다 … 선형 성장이
  //   지수 성장을 못 따라간다." 그때는 **보스만** 지수로 고쳤다. 일반 층은 그대로
  //  hp +1.2%/층 · 예산 +4/층 선형이었고, 게다가 능력치 업그레이드에서 상한이
  //  사라졌으므로(2026-08-01) 영웅 쪽은 위로 열려 있고 진형 쪽만 닫혀 있었다.
  //  30층대에서 쉬워지는 것은 곡선이 아니라 **구조**의 결과다.
  //
  //  그래서 층수가 아니라 **지금 이 캐릭터의 실제 강함**을 재서 곱한다. 두 축이다:
  //    ① 성장 지수 — 능력치 + 장비가 만든 공격력·유효체력이 기본치의 몇 배인가
  //    ② 압박 계수 — **전투 양상**. 여유 있게 이기면 오르고 지면 내린다(아래 TowerChar)
  //
  //  ⚠ 신선한 캐릭터에서는 정확히 1.0 이다 — 그래서 R-1(무조작 0%)·R-3 기준선이
  //    한 톨도 안 움직인다. 이 성질이 없으면 회귀표를 통째로 다시 뽑아야 한다.
  //  ⚠ `modsFor` 가 **층수만의 함수가 아니게 된다.** 도구가 곡선을 잴 때는
  //    `modsFor(n, false, true)` 로 이 축을 빼고 재는 것이 맞다(성장은 사람마다 다르다).
  //  ── 지수를 **실측으로** 잡았다 (`node tools/tower-power-curve.js`) ──────────
  //  그 도구가 재는 것은 "영웅이 진형 전체를 녹이는 데 걸리는 시간"이다.
  //  고치기 전: 5층 54.9초 → 60층 **10.0초**. 층이 오를수록 5.5배 쉬워지고 있었다
  //  — 사용자 신고가 그대로 재현된 숫자다.
  //  그 곡선은 대략 `녹이는시간 ∝ 성장지수^-0.48` 이었다. 그래서 되돌리는 데
  //  필요한 총지수는 0.48 이고, 여기에 조금 더 얹어(0.67) **후반이 살짝 더**
  //  어려워지게 한다. 유닛 0.55 + 예산 0.12 = 0.67.
  //  ⚠ 처음엔 0.80 + 0.30 = 1.10 을 넣었다가 40층 녹이는 시간이 341초가 나왔다
  //    (전투 제한시간의 몇 배다 — 못 이기는 층이 된다). **과보정도 버그다.**
  //  ⚠ 2026-08-02 4차 재설계 — **기하평균이 화력 몰빵 빌드를 숨겼다.**
  //    사용자 신고: "42층을 3초 만에 피가 하나도 안 달고 깼어." 원인은 하나였다 —
  //    `heroPowerIndex` 가 `sqrt(공격배수 × 유효체력배수)` 였는데, 공격에만 몰아주고
  //    방어를 안 산 빌드는 유효체력배수가 1에 가까워 **기하평균이 공격 성장을
  //    희석시킨다**(공격 300배 + 체력 1배 → 지수 √300 ≈ 17배로 과소평가됨).
  //    그 결과 "죽기 전에 다 죽인다"는 순수 화력 빌드에게 진형이 안 따라왔다.
  //
  //    고침: **두 축을 분리한다.** 적 체력은 내 공격력(=킬 속도)을 따라가고,
  //    적 공격력은 내 유효체력(=버티는 힘)을 따라간다. 한쪽에만 몰아줘도
  //    그 축의 적이 정확히 그만큼 따라온다 — 희석될 자리가 없다.
  //    (`tools/tower-power-curve.js profile=glass` 로 화력 몰빵 빌드를 직접
  //     흉내내 실측했다 — 균형 잡힌 빌드만 재던 예전 도구는 이 사고를 못 잡았다.)
  //
  //    캡도 24 → **1200** 으로 올렸다. "무한의 탑"인데 고정 상한을 두면 지수
  //    성장 경제(골드가 매층 ×1.12)가 언젠가 그 상한을 반드시 넘는다 — 이번 사고가
  //    바로 그거였다(상한이 낮아서가 아니라, 상한이 **존재하는 것 자체**가 문제).
  //    지금 캡은 디자인 상한이 아니라 오버플로 방지용 안전장치다.
  //
  //    지수는 0.55 → **0.75** 로 다시 올렸다(실측: `tools/tower-power-curve.js`).
  //    0.55 에서는 화력 몰빵 프로필의 30→60층 녹이는 시간 비율이 0.81배로,
  //    여전히 후반이 쉬워지고 있었다 — 지수가 1보다 작으면 **무한히 자라는
  //    지수 경제(골드)를 유한한 지수만으로는 언젠가 반드시 못 따라간다.**
  //    1.00 은 과했다(균형 빌드조차 20층부터 90초 제한시간을 넘겼다 — 341초
  //    전례와 같은 과보정). 0.75 에서 세 프로필(glass/tank/balanced) 전부
  //    30→60층 비율이 1.0 이상으로 나온다 — 갈수록 쉬워지지 않는다.
  POWER_POW_UNIT: 0.75,      // 유닛 체력·공격에 걸리는 지수
  POWER_POW_BUDGET: 0.12,    // 예산에 걸리는 지수 — 낮게 잡는다
  POWER_CAP: 1200,           // 유닛 배수 상한 — 안전장치일 뿐, 실제로는 거의 안 닿는다
  BUDGET_MUL_CAP: 1.8,       // 예산 배수 상한
  //  ⚠ 예산을 크게 올리면 **오히려 컨트롤러가 유리해진다**(CLAUDE.md 실측:
  //    예산이 커질수록 아이템 효율이 유닛 추가보다 좋다). 그래서 무게는 유닛 쪽에
  //    싣고 예산은 살짝만 민다 — 진형이 두꺼워지되 뒤집히지는 않게.

  //  ⚠ 기준선은 `HEROES` 의 생짜 스탯이 아니라 **갓 만든 캐릭터**다(head-start 포함).
  //    `statBonus`/`itemBonus` 는 head-start 를 이미 포함하므로 `atk0`/`ehp0` 에
  //    또 더하면 두 번 세어 신선한 캐릭터가 1.0 이 아니게 된다(실제로 그랬다).
  _hb: function (rec) { return (GAME.TowerChar.HERO_BASE && GAME.TowerChar.HERO_BASE[rec.heroKey]) || {}; },

  //  내 공격력이 기본 영웅의 몇 배인가(쿨감 포함 — 실제 dps 다). 기본이면 1.0.
  atkIndex: function () {
    var TC = GAME.TowerChar;
    if (!TC || !TC.exists || !TC.exists()) return 1;
    var rec = TC.get();
    var base = rec && GAME.HEROES[rec.heroKey];
    if (!base) return 1;
    var b = TC.statBonus(rec), ib = TC.itemBonus(rec), hb = this._hb(rec);
    var atk0 = (base.damage || 0) + (hb.damage || 0) || 1;
    var atk = (base.damage || 0) + (b.damage || 0) + (ib.damage || 0);
    // 쿨감(cdrMul, 1보다 작을수록 빠르다)도 실제 dps 다 — 안 넣으면 쿨감 아이템으로
    // 찍은 빌드의 진짜 화력이 과소평가된다.
    var p = (atk / (ib.cdrMul || 1)) / atk0;
    return p > 1 ? p : 1;
  },

  //  내 유효체력이 기본 영웅의 몇 배인가(흡혈 포함 — 맞으면서 채우는 것도 버티는
  //  힘이다). 기본이면 1.0.
  ehpIndex: function () {
    var TC = GAME.TowerChar;
    if (!TC || !TC.exists || !TC.exists()) return 1;
    var rec = TC.get();
    var base = rec && GAME.HEROES[rec.heroKey];
    if (!base) return 1;
    var b = TC.statBonus(rec), ib = TC.itemBonus(rec), hb = this._hb(rec);
    var ehp0 = ((base.hp || 0) + (hb.hp || 0) || 1) *
               (1 + ((base.armor || 0) + (hb.armor || 0)) / 100);
    var ehp = ((base.hp || 1) + (b.hp || 0) + (ib.hp || 0)) *
              (1 + ((base.armor || 0) + (b.armor || 0) + (ib.armor || 0)) / 100);
    var lsMul = 1 + (ib.lifesteal || 0) * 1.5;   // 대략치 — 정밀 계측 대상 아님
    var p = (ehp * lsMul) / ehp0;
    return p > 1 ? p : 1;
  },

  pressureOf: function () {
    var TC = GAME.TowerChar;
    if (!TC || !TC.exists || !TC.exists()) return 1;
    var rec = TC.get();
    return (rec && typeof rec.pressure === 'number') ? rec.pressure : 1;
  },

  // 적 체력 배수 — **내 공격력**(킬 속도)을 따라간다. 순수 화력 빌드가 이 축을
  // 못 벗어나는 것이 이번 수정의 핵심이다.
  hpMul: function () {
    var m = Math.pow(this.atkIndex(), this.POWER_POW_UNIT) * this.pressureOf();
    return Math.max(1, Math.min(this.POWER_CAP, m));
  },

  // 적 공격력 배수 — **내 유효체력**(버티는 힘)을 따라간다. 순수 방어 빌드가
  // 무피해로 버티지 못하게 한다.
  dmgMul: function () {
    var m = Math.pow(this.ehpIndex(), this.POWER_POW_UNIT) * this.pressureOf();
    return Math.max(1, Math.min(this.POWER_CAP, m));
  },

  budgetMul: function () {
    // 예산(적 숫자)은 두 축 중 **더 크게 자란 쪽**을 따라간다 — 어느 쪽으로
    // 몰아줘도 진형이 그만큼 두꺼워진다.
    var idx = Math.max(this.atkIndex(), this.ehpIndex());
    var m = Math.pow(idx, this.POWER_POW_BUDGET) * Math.sqrt(this.pressureOf());
    return Math.max(1, Math.min(this.BUDGET_MUL_CAP, m));
  },

  budgetFor: function (floor, skipPower) {
    var mul = skipPower ? 1 : this.budgetMul();
    var early = this.BASE_BUDGET + (Math.min(floor, this.EARLY_FLOORS) - 1) * this.BUDGET_STEP;
    if (floor <= this.EARLY_FLOORS) return early;
    return Math.round((early + this.ENTRY_JUMP +
                       (floor - this.EARLY_FLOORS - 1) * this.BUDGET_STEP) * mul);
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
  modsFor: function (floor, skipRule, skipPower) {
    var t = Math.max(0, floor - 1);
    var hpM = skipPower ? 1 : this.hpMul();
    var dmgM = skipPower ? 1 : this.dmgMul();
    var m = { hp: (1 + 0.012 * t) * hpM, damage: (1 + 0.010 * t) * dmgM };
    if (skipRule || !GAME.TowerRule) return m;
    return GAME.TowerRule.applyMods(m, GAME.TowerRule.ruleFor(floor));
  },

  // ── 유닛별 편차 (2026-08-02 사용자 지시) ─────────────────────────────────────
  //  "밸런스패치에서 두 축을 분리하여 따라가는게 전부다 그렇지않게해줘 … 결국
  //   사용자입장에서 변칙적이어야해 언제는 방패병이 너무 딴딴하고 언제는 쇠뇌진지
  //   공격이 너무 아프고 그런거지." 위 `hpMul`/`dmgMul`(atkIndex·ehpIndex 추종)을
  //  진형의 **모든 유닛에 똑같이** 곱하던 것이 문제였다 — 매판 전부가 같이 세지니
  //  체감이 늘 똑같다. 그래서 **유닛마다** 두 축을 얼마나 따라갈지 가중치를 다르게 준다.
  //
  //  4개 성향, 유닛 10기 기준 대략(사용자 지시 "100%일때 비율" — 정확히 안 지켜도
  //  된다고 명시함, 그래서 확률로만 근사한다):
  //    공격력 > 체력  30% — hp 는 조금만, damage 는 두 배로 따라간다(쇠뇌 진지 등이
  //                          이 성향이면 "너무 아프다"가 나온다)
  //    체력 > 공격력  30% — 반대(방패병이 이 성향이면 "너무 딴딴하다"가 나온다)
  //    전부 따라감    20% — 두 축 다 기준보다도 더 세게(진짜 위협)
  //    원래 약한 상태 20% — 거의 안 따라간다(원래 체급 그대로, 쉬는 유닛)
  //
  //  ⚠ 가중치의 **기대값을 정확히 1.0** 으로 맞췄다(계산: 0.3×0.4+0.3×2.0+0.2×1.2+0.2×0.2=1.0,
  //    양 축 대칭이라 hp·damage 둘 다 같다). 그래야 `tools/*.js` 가 재는 **평균 난이도
  //    곡선**(균일 `modsFor` 기준, 지수 0.75 실측치)이 그대로 유효하다 — 여기서 편차만
  //    키우고 평균을 슬쩍 올리면, 방금 실측으로 잡은 지수가 조용히 다시 어긋난다.
  //    개별 유닛만 그 평균 주변에서 크게 흔들리게 하는 것이 이번 요청의 전부다.
  UNIT_PROFILES: [
    { key: 'atk',  p: 0.30, hpW: 0.4, dmgW: 2.0 },
    { key: 'hp',   p: 0.30, hpW: 2.0, dmgW: 0.4 },
    { key: 'full', p: 0.20, hpW: 1.2, dmgW: 1.2 },
    { key: 'weak', p: 0.20, hpW: 0.2, dmgW: 0.2 }
  ],

  // 결정적 난수(xorshift, `js/towerplan.js` 의 `rng(seed)`와 같은 식) — 같은 등반
  // 시도(같은 climbSeed) 안에서는 같은 유닛 자리가 같은 성향을 갖는다(재현 가능).
  // 등반을 다시 시작하면(climbSeed 재롤 — `js/towerplan.js` seedNow() 주석 참조)
  // 성향도 통째로 다시 섞인다 — 그게 "변칙적"의 실체다.
  _urng: function (seed) {
    var s = seed | 0; if (!s) s = 1;
    return function () {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s |= 0;
      return ((s >>> 0) % 100000) / 100000;
    };
  },

  _unitSeed: function (floor, index) {
    var base = 0x5eed;
    var TC = GAME.TowerChar;
    if (TC && TC.exists && TC.exists()) {
      var rec = TC.get();
      if (rec && rec.climbSeed) base = rec.climbSeed | 0;
    }
    return ((base ^ (floor * 2654435761)) ^ (index * 40503)) | 0;
  },

  unitProfile: function (floor, index) {
    var r = this._urng(this._unitSeed(floor, index))();
    var list = this.UNIT_PROFILES, acc = 0;
    for (var i = 0; i < list.length; i++) {
      acc += list[i].p;
      if (r < acc) return list[i];
    }
    return list[list.length - 1];
  },

  // `modsFor` 의 유닛별 편차판. 보스가 아닌 일반 유닛에만 쓴다(보스는 여전히
  // `bossModsFor` 의 독자 곡선). skipPower 를 주면(도구용) 편차가 걸릴 축 자체가
  // 없어져(follow=1) 가중치와 무관하게 균일 `modsFor(skipPower=true)`와 같아진다.
  unitModsFor: function (floor, index, skipRule, skipPower) {
    var t = Math.max(0, floor - 1);
    var prof = this.unitProfile(floor, index);
    var hpFollow = skipPower ? 1 : this.hpMul();
    var dmgFollow = skipPower ? 1 : this.dmgMul();
    var hpM = 1 + (hpFollow - 1) * prof.hpW;
    var dmgM = 1 + (dmgFollow - 1) * prof.dmgW;
    var m = { hp: (1 + 0.012 * t) * hpM, damage: (1 + 0.010 * t) * dmgM };
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
  //  ⚠⚠ 2026-08-02 재설계 — **위 지수는 이중 계산이었다.** (사용자 신고:
  //  "용의알 체력 1.4m은 말이안된다. 파수꾼으로 1분내내쳤는데 0.1깎았다.")
  //
  //  `bossModsFor` 가 `modsFor(floor)` 를 받아서 지수를 또 곱했는데, `modsFor` 는
  //  **이미 `hpMul()`(= 캐릭터 성장 추종)을 품고 있다.** 즉 보스만 성장 추종과
  //  층 지수를 **둘 다** 받았다. 50층 실측: 층1.59 × 성장11.8 × 보스35 = **656배**.
  //  기본 체력 1,700 × 656 = 1.11M — 신고 그대로다. 100층은 1.43**억**이 나왔다.
  //
  //  왜 아무도 못 봤나: 두 곡선이 하루 차이로 **각각 상대가 없다고 보고** 조정됐다
  //  (보스 지수 08-01 "보스가 너무 약해" → 성장 추종 08-02 "30층부터 너무 쉬워").
  //  그리고 기존 도구는 승률과 '녹이는 시간'만 재느라 **보스 한 마리의 최종 숫자를
  //  그대로 찍어 본 적이 없었다.** → `tools/boss-stat-audit.js` 를 그래서 만들었다.
  //
  //  고침: 층 지수를 **없앤다.** 보스도 일반 유닛과 같은 `modsFor` 곡선을 타고,
  //  '보스다움'은 아래 **상수 배수** 하나로만 준다. 이러면 층이 아무리 올라가도
  //  보스는 항상 "일반 유닛 곡선 × 상수"라 51층·100층·300층에서 곡선이 안 터진다
  //  (사용자 지시 5: "깨더라도 다음 51탄 밸런스가 무너져").
  //  ⚠ 이 값을 바꾸면 `js/units.js` 의 보스 기본 체력표도 같이 봐야 한다 —
  //    둘은 곱해져서 화면 숫자가 된다. 반드시 `node tools/boss-stat-audit.js` 로 확인.
  //  ══ 보스는 **지수 1.0** 으로 따라간다 (2026-08-03 사용자 지시) ══════════════
  //  "어떤 유저가 오더라도 그리고 내가 앞으로 100층에 가더라도 적용가능한 밸런스"
  //
  //  일반 유닛은 `POWER_POW_UNIT = 0.75` 를 쓴다. 그런데 **내 dps 는 atkIndex 에
  //  정비례**(지수 1.0)한다. 따라서
  //        격파시간 = 보스유효체력 / 내dps  ∝  atkIndex^0.75 / atkIndex^1.0
  //                                        =  atkIndex^(-0.25)
  //  즉 **강해질수록 보스는 반드시 쉬워진다.** 지수가 1보다 작은 한 이건 조정으로
  //  못 막는다 — 수학이다. 지금까지 "고층이 쉬워진다"가 반복해서 돌아온 이유가
  //  이것이고, 50층 알이 12초에 죽은 것도 같은 뿌리다.
  //
  //  그래서 **보스에만** 지수 1.0 을 쓴다. 그러면
  //        격파시간 ∝ atkIndex^0 = 상수
  //  가 되어 **캐릭터가 얼마나 세든 보스전 길이가 같다.** 마찬가지로 보스 피해는
  //  `ehpIndex^1.0` 을 따라가므로 **보스 한 대가 내 체력의 몇 %인지가 영원히 같다**
  //  (지금 신고 "평타가 내 체력의 3.3%라 아무 긴장이 없다"가 이 축의 문제였다).
  //
  //  ⚠ 일반 유닛에 1.0 을 쓰면 안 된다 — 이미 시도했다가 "20층부터 90초 제한을
  //    넘겨 못 이기는 층"이 됐다(위 POWER_POW_UNIT 주석). 진형은 **머릿수**라
  //    체력 총합이 그대로 벽이 되지만, 보스는 하나뿐이라 길이만 늘어난다.
  //    두 축을 갈라 두는 것이 핵심이다.
  POWER_POW_BOSS: 1.0,

  //  보스 축만 다시 계산한다(일반 유닛 곡선은 손대지 않는다).
  _bossFollow: function (idx) {
    var m = Math.pow(Math.max(1, idx), this.POWER_POW_BOSS) * this.pressureOf();
    return Math.max(1, Math.min(this.POWER_CAP, m));
  },

  BOSS_HP_PREMIUM: 2.4,
  BOSS_DMG_PREMIUM: 1.65,
  bossModsFor: function (floor) {
    //  ⚠ `modsFor` 를 그대로 쓰면 안 된다 — 거기엔 유닛용 지수 0.75 가 이미 들어 있다.
    //    층 조건(towerrule)은 그대로 타되 **추종 배수만** 갈아 끼운다.
    //
    //  ⚠ **층당 선형 성장(1+0.012t)도 뺐다.** 보스는 하나뿐이라 그 항이 그대로
    //    싸움 길이가 되는데, 그러면 300층 보스는 10층 보스보다 4.6배 오래 걸린다.
    //    그걸 상쇄하려고 기본 체력을 낮추면(300층 300→54) **기본값이 거꾸로 뒤집혀**
    //    표를 읽을 수 없게 된다(교정 도구가 실제로 그런 표를 뱉었다).
    //    지금은 `def.hp` 하나가 곧 **그 보스와 몇 초 싸우는가**를 뜻한다 — 층별
    //    난이도 상승은 진형·호위가 맡는다(보스는 '위협', 진형은 '난이도').
    var m = { hp: this._bossFollow(this.atkIndex()),
              damage: this._bossFollow(this.ehpIndex()) };
    if (GAME.TowerRule) m = GAME.TowerRule.applyMods(m, GAME.TowerRule.ruleFor(floor));
    return {
      hp: m.hp * this.BOSS_HP_PREMIUM,
      damage: m.damage * this.BOSS_DMG_PREMIUM
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
  //  ⚠ 2026-08-02 재조정 0.66 → 1.00. **보스 층 난이도의 출처를 바꾼 것이다.**
  //   보스 층 지수를 걷어내자(bossModsFor) R-3 이 반대로 뒤집혔다 — 보스 층이
  //   이웃보다 **쉬워졌다**(10층 +8%p · 20층 +36%p). 원인은 명확하다: 호위 예산을
  //   34% 깎아 놓고 그 구멍을 부풀린 보스가 메우고 있었는데, 보스를 정상 크기로
  //   되돌리자 구멍만 남았다.
  //   그렇다고 보스를 다시 부풀릴 수는 없다 — 사용자가 정한 체감 목표(50층 알
  //   체력 8,000)가 곧 이 파일의 기준점이기 때문이다. 그래서 **난이도는 호위가,
  //   위협은 보스가** 맡도록 나눈다. 이건 이 파일이 원래 적어 둔 원칙과도 같다:
  //   "보스는 두꺼워서가 아니라 무서워서 어려워야 한다."
  BOSS_ESCORT: 1.00,
  BOSS_ORDER: ['bossChief', 'bossShell', 'bossNest'],

  isBossFloor: function (floor) {
    return floor > 0 && floor % this.BOSS_EVERY === 0;
  },

  // ── 층별 보스 — **올라갈수록 세계관이 깊어진다** (2026-08-02 사용자 지시) ─────
  //  "올라갈수록 세계관과 연결된 강한 몹이 나왔으면 좋겠고 최종 보스는 정말 큰 용.
  //   50, 100 정도엔 용의 부하나 용의 몸 일부하고 싸우면서 그 강함의 크기를 미리 느꼈으면."
  //
  //  예전엔 셋을 무한히 돌렸다(`BOSS_ORDER` 순환). 100층에서도 10층과 같은 놈이
  //  나오니 **올라가는 의미가 보스에서는 하나도 안 났다.**
  //  이제 층이 이야기를 탄다:
  //    10·20·30  계란 부족의 강자 (족장 → 골렘 → 둥지)
  //    40        재 파수병      — 계란 부족의 마지막. '용의 재'가 처음 나온다
  //    50        잿날개        — 용의 부하. 용이 실재한다는 첫 증거
  //    60        재 파수병(재등장) 70 서리 권속 · 80 잿날개 · 90 폭풍 권속
  //    100       용의 발톱     — 몸의 일부
  //    110~140   권속들이 다시 돈다(이때는 이미 그 크기를 안다)
  //    150~      태초의 용     — 이후 50층마다 다시 나온다
  //  ⚠ 무한의 탑이라 '최종'이 진짜 끝일 수 없다. 대신 **150층부터 50층 간격으로만**
  //    나오게 해서, 만나는 것 자체가 사건이 되게 한다.
  // ── 보스 사다리 (2026-08-02 9차 개편) ──────────────────────────────────────
  //  9차 사용자 지시: "알을 50,100,150에 넣고 발 손 날개를 300전에 넣자.
  //  **알이 깨지고 발이 나오는게 맞지.**"
  //
  //  8차는 부위(발·손·날개)를 앞에 두고 알을 뒤에 뒀는데, 그러면 **다 자란 용의
  //  부위를 본 뒤에 알로 되돌아가는** 시간 역행이 된다. 지금은 부화 과정 그대로다:
  //    50   용의 알       멀쩡한 알. 안에서 뭔가 두근거린다
  //    100  금 간 알      균열이 갔다. 아직 안은 안 보인다
  //    150  깨어지는 알   그 틈으로 **눈만** 보인다
  //    200  용의 발       껍질을 딛고 발이 먼저 나온다
  //    230  용의 손
  //    260  용의 날개     마지막으로 날개가 펴진다
  //    270~290  권속들    본체 직전의 숨 고르기
  //    300  태초의 용     다 나왔다 — **얼굴은 여기서 처음 공개된다**
  //  그 사이 10의 배수는 전부 권속(부하)이 채운다 — "누구의 부하인가"를 알려준다.
  //
  //  ⚠ 얼굴을 300층까지 아끼는 것이 이 사다리의 핵심이다(8차 결론, 그대로 유지).
  //    부위는 "얼마나 큰가"만 흘리므로 예고로 옳지만, 얼굴은 정체 그 자체다.
  //  ⚠ 알 세 단계는 세계관 회수이기도 하다 — 이 게임은 "알에서 깨어난 자들의
  //    전쟁"인데(CLAUDE.md) 정작 최종 보스만 알과 무관했다. 계란 부족이 서로
  //    싸우는 동안 산 아래에서 **가장 큰 알**이 깨어나고 있었다는 이야기가 된다.
  //  ⚠ 부위 간격이 50 이 아니라 **30**(200·230·260)인 이유: 셋을 50 간격으로 두면
  //    350 까지 밀려 본체가 300 에서 벗어난다. 30 간격으로 당겨 270~290 을 권속에게
  //    주면 **본체 직전에 숨 고르는 구간**이 생겨 오히려 300 층이 사건이 된다.
  BOSS_SCHEDULE: {
    10: 'bossChief', 20: 'bossShell', 30: 'bossNest',
    40: 'bossAshSentry',
    50: 'bossDragonEgg',                                    // ← 알(정체 회수)
    60: 'bossDrakeAsh', 70: 'bossDrakeFrost',
    80: 'bossAshSentry', 90: 'bossDrakeStorm',
    100: 'bossDragonEggCracked',                            // ← 금 간 알
    110: 'bossDrakeFrost', 120: 'bossDrakeStorm',
    130: 'bossDrakeAsh',  140: 'bossDrakeFrost',
    150: 'bossDragonCrack',                                 // ← 깨어지는 알(눈만)
    160: 'bossDrakeStorm', 170: 'bossDrakeFrost',
    180: 'bossDrakeStorm', 190: 'bossDrakeAsh',
    200: 'bossDragonFoot',                                  // ← 발이 먼저 나온다
    210: 'bossDrakeFrost', 220: 'bossDrakeStorm',
    230: 'bossDragonClaw',                                  // ← 손
    240: 'bossDrakeAsh',  250: 'bossAshSentry',
    260: 'bossDragonWing',                                  // ← 날개
    300: 'bossDragonLord'                                   // ← 본체(얼굴 공개)
  },
  //  표에 없는 10의 배수 층은 이 목록이 돈다.
  BOSS_LATE: ['bossDrakeFrost', 'bossDrakeStorm', 'bossDrakeAsh', 'bossAshSentry'],
  //  300층을 넘어가면 본체가 50층마다 다시 나온다 — 꼭대기가 없는 탑이므로
  //  '마지막 보스'는 끝이 아니라 **가장 무거운 주기**가 된다.
  DRAGON_FROM: 300,
  DRAGON_EVERY: 50,

  bossKeyFor: function (floor) {
    if (!this.isBossFloor(floor)) return null;
    if (floor >= this.DRAGON_FROM && (floor - this.DRAGON_FROM) % this.DRAGON_EVERY === 0) {
      return 'bossDragonLord';
    }
    if (this.BOSS_SCHEDULE[floor]) return this.BOSS_SCHEDULE[floor];
    var n = Math.floor(floor / this.BOSS_EVERY) - 11;      // 110층이 0 번
    if (n < 0) n = 0;
    return this.BOSS_LATE[n % this.BOSS_LATE.length];
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

    // ── 데뷔 층은 **그 유닛 중심으로** 짠다 (2026-08-01 사용자 지시) ──────────
    //  "유닛 소개를 하면 꼭 그 유닛 중심으로 배치된 게 나와야 해."
    //  맞는 지적이고, 안 하면 소개 화면이 거짓말이 된다 — 15기 중 약초꾼 한 기가
    //  뒤에 섞여 있으면 "새로운 적 · 약초꾼"을 읽고 들어가서 그놈을 찾지도 못한다.
    //  배우는 방법은 **여러 번 마주치는 것**이지 이름을 한 번 읽는 게 아니다.
    //
    //  ⚠ 테마 층처럼 한 종류로 다 채우지는 않는다. 그건 이미 테마의 몫이고, 데뷔 층까지
    //    단일 종류면 두 장치가 같은 그림이 되어 둘 다 특별함을 잃는다. 과반만 채운다.
    //  ⚠ **예산을 지킨다.** 싼 유닛을 비싼 유닛으로 바꾸면 총액이 늘어난다 —
    //    넘긴 만큼 뒤에서 덜어내지 않으면 '소개하는 층'이 그냥 '어려운 층'이 된다.
    //  ⚠ 첫 구현은 "비싼 것부터 데뷔 유닛으로 바꾸고, 예산 넘치면 데뷔가 아닌 것부터
    //    덜어낸다"였는데, **여덟 층 중 다섯이 100% 단일 종류**가 됐다(실측). 싼 유닛을
    //    비싼 데뷔 유닛으로 바꾸느라 예산이 넘쳤고, 그 뒤처리가 나머지를 전부 지웠다.
    //    바로 위에서 "테마 층처럼 하지 않는다"고 적어 놓고 정확히 그 그림을 만든 것이다.
    //    그래서 지금은 고쳐 쓰지 않고 **처음부터 다시 짠다** — 데뷔 유닛을 먼저 세우고,
    //    남는 예산으로 싼 것부터 채운다. 예산을 넘길 일 자체가 없다.
    var debutHere = GAME.TowerCurriculum && GAME.TowerCurriculum.debutOf(floor);
    var dDef = debutHere && GAME.UNITS[debutHere.type];
    if (dDef && dDef.cost > 0 && f.units && f.units.length) {
      var n0 = f.units.length;
      var capUnits = maxUnits || n0;
      // 데뷔 유닛 수 — 과반이되 예산의 일정 비율을 넘지 않는다(나머지 종류가 설 자리).
      // 비율은 **유닛마다 다르다** — 왜 다른지는 towercurriculum.js 의 UNLOCK 주석에 있다
      // (약초꾼·늪지기·가시덫을 과반으로 몰면 층이 조작 없이 뚫린다).
      var dShare = debutHere.share || GAME.TowerCurriculum.DEBUT_SHARE;
      var k = Math.ceil(n0 * dShare);
      k = Math.min(k, Math.floor(budget * GAME.TowerCurriculum.debutBudgetCap(dShare) / dDef.cost));
      k = Math.max(1, Math.min(k, capUnits));

      // 좌표는 원래 진형 것을 그대로 물려받는다(아래 `TowerPlan.apply` 가 다시 놓지만,
      // 원형이 없는 경우를 대비해 흩어진 상태를 유지한다).
      var slots = f.units.map(function (u) { return { nx: u.nx, ny: u.ny }; });
      var out = [], spent = 0;
      for (var k1 = 0; k1 < k; k1++) {
        out.push({ type: debutHere.type, nx: slots[k1].nx, ny: slots[k1].ny });
        spent += dDef.cost;
      }
      // 나머지는 **싼 것부터** 채운다 — 종류가 남아야 데뷔 유닛이 '다르게' 보인다.
      //  ⚠ 개수를 반드시 묶는다. 안 묶었더니 남는 예산이 전부 10골드짜리 전사로 가서
      //    쇠뇌 진지 4기가 14기 중 4기(29%)가 됐다 — 예산은 지켰지만 **화면에서는
      //    소개한 유닛이 묻혔다**(실측). 비율은 결국 눈에 보이는 머릿수의 문제다.
      var maxOthers = Math.max(1, Math.round(k * (1 - dShare) / dShare));
      var others = f.units.filter(function (u) { return u.type !== debutHere.type; })
        .sort(function (a, b) {
          return ((GAME.UNITS[a.type] || {}).cost || 0) - ((GAME.UNITS[b.type] || {}).cost || 0);
        });
      var nOthers = 0;
      others.forEach(function (u) {
        var c = (GAME.UNITS[u.type] || {}).cost || 0;
        if (nOthers >= maxOthers || out.length >= capUnits || spent + c > budget) return;
        out.push({ type: u.type, nx: slots[out.length % slots.length].nx,
                   ny: slots[out.length % slots.length].ny });
        spent += c; nOthers++;
      });
      // 남은 예산은 데뷔 유닛으로 마저 쓴다 — 안 그러면 층이 원래보다 얇아진다
      // (1층은 전사밖에 없어서 `others` 가 비고, 이 줄이 없으면 3기가 2기가 된다).
      while (out.length < capUnits && spent + dDef.cost <= budget) {
        out.push({ type: debutHere.type, nx: slots[out.length % slots.length].nx,
                   ny: slots[out.length % slots.length].ny });
        spent += dDef.cost;
      }
      f.units = out;
      f.debutType = debutHere.type;
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
