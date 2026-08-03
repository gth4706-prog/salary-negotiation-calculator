window.GAME = window.GAME || {};

// 수성의 탑 — **전략가판 통곡의 탑.**
//
// 통곡의 탑이 "영웅 하나로 진형을 몇 층까지 뚫느냐"라면, 이쪽은
// **"진형 하나로 영웅을 몇 번 격파하느냐"** 다. 한 층 = 영웅 하나를 막아내는 것.
//
//   1~3층  연습 구간. 예산이 넉넉해 대충 놓아도 막힌다.
//   4층~   본 구간. 공격 영웅의 예산·스탯이 확 뛰어 **제대로 배치하지 않으면 진다.**
//   10층마다 보스 영웅.
//
// 컨트롤러 탑과 **같은 약속을 거울처럼** 건다:
//   컨트롤러 탑 — 4층부터 '조작' 없이는 못 이긴다
//   수성의 탑   — 4층부터 '배치' 없이는 못 이긴다
// 두 탑의 난이도 곡선이 벌어지면 한쪽만 파게 된다. 수치를 바꿀 때 양쪽을 같이 재라.
GAME.DefendTower = {
  KEY: 'asymgame.deftower.v1',

  // ── 전략가(플레이어)가 쓰는 예산 ──
  // 넉넉하게 시작해 천천히 오른다. 이쪽이 빨리 오르면 물량으로만 이기게 된다.
  BASE_BUDGET: 160,
  BUDGET_STEP: 4,

  // ── 공격 영웅(AI)이 쓰는 예산 ──
  // 1~3층은 낮게, 4층에서 점프. 통곡의 탑의 ENTRY_JUMP 와 같은 장치다.
  HERO_BASE: 90,
  HERO_STEP: 6,
  EARLY_FLOORS: 3,
  ENTRY_JUMP: 92,

  BOSS_EVERY: 10,
  BOSS_HERO_MUL: 1.35,      // 보스 층 영웅 예산 배수

  // ── 예산 상한을 넘긴 몫을 스탯으로 환산하는 지수 (v0.34) ──
  // `heroBudgetFor` 는 `maxSpendable()`(=253, 2026-07-28 영웅 비용 공통화 전에는 260)에서
  // 멈춘다. 넘겨서 주면 **쓸 수 없는 돈**이라
  // 화면의 예산 표시가 거짓말이 되기 때문이다(통곡의 탑에서 이미 정해둔 규칙).
  // 그런데 전략가 예산은 `BUDGET_STEP 4` 로 끝없이 오른다. 그래서 실측했더니:
  //   전략가/영웅 예산비가 15층 0.83 으로 바닥을 찍고 40층 1.22 까지 **거꾸로 올라간다.**
  //   방어율도 그대로 따라갔다 — 20층 21% → 35층 75% (파수꾼 상대, rep24).
  //   즉 **20층 넘어가면 탑이 다시 쉬워진다.** 무한의 탑인데 후반이 더 쉬우면 탑이 아니다.
  // 게다가 `BOSS_HERO_MUL 1.35` 도 캡에 통째로 먹혀서 **20층부터 보스가 사라졌다**
  //   (20층 예산 392 → 260, 이웃 19·21층도 260. 보스 층이 이웃과 완전히 동일해진다).
  // 해법: 캡 위로 흘러넘친 예산을 **버리지 않고 hp/damage 배수로 환산**한다.
  // 예산이 아니라 스탯으로 주므로 화면 표시는 계속 정직하고, 보스 배수도 되살아난다.
  // 지수가 1 미만인 이유: 예산은 스탯보다 효율이 좋다(아이템 시너지·물약 등).
  // 값은 실측으로 잡았다(원형 10종 평균 방어율, rep 12~24):
  //   0.9/0.7  → 너무 세다. 20층 이후가 전 영웅 0% 인 벽이 되어 곡선이 아니라 절벽이 된다.
  //   0.4/0.28 → 여전히 세다(20층 3%).
  //   0.28/0.20(채택) → 4층 48% → 15층 23% → 25층 13% → 35층 14%. 완만한 단조 감소.
  OVERFLOW_HP_POW: 0.28,
  OVERFLOW_DMG_POW: 0.20,

  // ── 보스 층을 스탯 축에도 얹는다 (v0.34) ──
  // 예산 배수(`BOSS_HERO_MUL`)만으로는 20층부터 보스가 **완전히 사라졌다** —
  // 20층 예산 392 도, 이웃 19·21층의 284·296 도 전부 260 으로 캡되어 같은 값이 된다.
  // 위의 넘침 환산으로 일부는 되살아나지만(20층 넘침 1.51 vs 이웃 1.09~1.14) 약하다.
  // 캡과 무관한 축에 보스를 한 번 더 얹어 "보스 층은 이웃보다 확실히 어렵다"를 복원한다.
  // (통곡의 탑 합격 조건 3번의 거울.)
  BOSS_MOD_HP: 1.30,
  BOSS_MOD_DMG: 1.20,

  // ── 영웅별 난이도 보정 (v0.34) ──
  // 영웅 3종의 '처치에 필요한 원피해'가 사냥꾼 1613 ↔ 파수꾼 4329 로 **2.7배** 벌어져 있다.
  // 그래서 층 순환으로 영웅을 바꾸면 같은 진형인데 방어율이 0%↔100% 로 튄다(실측 편차 79%p).
  // 🚫 `js/heroes.js` 의 스탯은 건드리지 않는다 — 통곡의 탑·비동기 대전·PvP 레이팅·아이템
  //    밸런스가 전부 거기에 매달려 있다. **수성의 탑 안에서만** 효과를 상쇄한다.
  // 값의 의미: 이 층 영웅의 hp/damage 배수에 곱한다. 1보다 크면 그 영웅이 세진다.
  //
  // 실측으로 잡은 값(원형 10종 평균 방어율, rep 12~24):
  //   보정 없음 → 4층 편차 24%p · 8층 29%p · 20층 79%p(최강 원형 기준)
  //   아래 값   → 4층 20%p · 12층 7%p · 25층 16%p
  // ⚠ **상수 하나로는 완전히 못 맞춘다.** 영웅마다 층 성장(hp/dmg 배수)을 받아먹는 효율이
  //   달라서, 광전사는 층이 오를수록 상대적으로 강해지고 사냥꾼은 약해진다. 즉 격차 자체가
  //   층의 함수다. 여기 값은 **전 구간 평균이 20%p 안에 들어오는 타협점**이지 정답이 아니다.
  //   더 조이려면 층 의존 보정(성장률 자체를 영웅별로)이 필요한데, 그건 별건이다.
  //
  // ── 2026-07-28 · **1.00 으로 평탄화했다.** ─────────────────────────────────
  // 위 값들은 "heroes.js 는 건드리지 않는다"는 전제에서 나온 우회로였다. 그 전제가
  // 사용자 지시로 바뀌었다 — "캐릭터는 모두 동일한 밸런스의 스펙을 갖게 하라".
  // 그래서 격차를 여기서 덮는 대신 **원인이 있는 곳(`js/heroes.js` 의 유효 내구도)**을 고쳤다.
  //   · 사냥꾼 유효 체력 694 → 1032, 파수꾼 1410 → 1134, 광전사 1215 → 1161
  //   · 보정을 끄고 잰 영웅 간 편차(원형 10종 평균, rep12, 4·8·12·20·30층):
  //       고치기 전 24/29/31/12/11 %p  →  고친 뒤 16/6/15/3/7 %p
  // 편차가 SC-3 기준(≤20%p) 안에 들어왔으므로 보정 상수를 남길 이유가 없다.
  // ⚠ 위 경고("격차 자체가 층의 함수다")는 여전히 유효하다. 광전사는 저층에서 약하고
  //   고층에서 강한 성질이 남아 있어 4층 16%p·12층 15%p 가 남는다. 0 은 아니다.
  // ⚠ 여기 값을 다시 1 이 아닌 수로 바꾸려거든, 먼저 `heroes.js` 를 고칠 수 있는지 보라.
  //   보정 상수는 수성의 탑 안에서만 듣기 때문에 통곡의 탑·대전에는 격차가 그대로 남는다.
  HERO_DIFF: { vanguard: 1.00, ranger: 1.00, warden: 1.00 },

  // ══════════════════════════════════════════════════════════════════════════
  //  골드 (v0.36) — "적 유닛을 잡으면 랜덤 골드" 를 **수성의 탑에 각색한 것**
  // ══════════════════════════════════════════════════════════════════════════
  //  ⚠ 여기서는 요청을 문자 그대로 옮길 수가 없다. 통곡의 탑은 적이 진형(10~20기)이라
  //    "한 기 잡을 때마다"가 성립하지만, **수성의 탑의 적은 영웅 딱 1기다.**
  //    그 하나를 잡는 순간이 곧 층 클리어라, 문자 그대로 옮기면
  //    "층을 깨면 골드" — 바꾸기 전과 똑같은 것이 되어버린다.
  //
  //  그래서 **적을 '조각내는' 축으로 옮겼다.**
  //    통곡의 탑: 적 진형의 총 체력을 유닛 단위로 잘라 먹고, 한 조각(=한 기)마다 보상.
  //    수성의 탑: 적 영웅의 총 체력을 GOLD_SEGMENTS 조각으로 잘라, 한 조각을 깎을 때마다 보상.
  //  둘 다 "적을 얼마나 무너뜨렸는가"에 비례한다는 같은 규칙이고, 적의 형태만 다르다.
  //
  //  후보 중 다른 둘을 버린 이유 (임의로 고르지 않았다):
  //   · **생존한 내 유닛 수 비례** — 버렸다. 영웅이 절대 닿지 않는 뒤쪽 구석에 싸구려
  //     유닛을 늘어놓기만 해도 보상이 오른다. 방어를 잘한 것과 구분되지 않고,
  //     '진형을 앞으로 내밀어 화력을 집중한다'는 이 게임의 좋은 플레이를 벌준다.
  //   · **층 클리어 + 처치 보너스 혼합** — 버렸다. 실제 지급 시점이 결국 '클리어' 하나라
  //     지금과 체감이 같다. 요청의 핵심("잡는 행위마다 보상")이 사라진다.
  //
  //  이 각색이 실제로 만들어내는 차이: **"막아냈다"에도 등급이 생긴다.**
  //  이 게임은 시간 초과(무승부)도 방어 성공으로 친다(`defend.js`: `defended = !aiWon`).
  //  예전에는 영웅을 30초에 격퇴하든 90초를 버티기만 하든 보상이 똑같았다.
  //  이제 격퇴 못 하고 버틴 판은 **깎은 만큼(최대 45%)만** 받는다 — "막아라"가 아니라
  //  "잡아라"가 되어, 진형에 화력을 넣을 이유가 생긴다.
  //  ⚠ 진 층의 골드는 남지 않는다. `fail()` 이 도전을 통째로 되돌리기 때문이다
  //    (통곡의 탑 `TowerRun.end()` 와 같은 규칙 — 아래 `fail` 주석 참조).
  //
  //  ⚠ 피해 집계는 `state.telemetry.heroDamageTaken` 을 그대로 읽는다 —
  //    `combat.js` 가 이미 쌓고 있는 값이라 전투 엔진을 건드리지 않는다.
  //    단, 가시덫(mine)은 `applyDamage` 를 거치지 않고 hp 를 직접 깎으므로
  //    **덫 피해는 집계에 안 들어간다**(알고 있는 한계, 최대 30% 한 번).
  // 2026-07-29 · 사용자 지시로 **크게 올렸다**(14/2 → 34/6).
  //   근거: 강화 가격이 L2 45 · L3 90 · L4 170 · L5 320 인데 1층 보상이 14 였다.
  //   L2 하나 올리는 데 3~4층, L5 까지는 40층분이 필요해 "성장하는 맛"이 아예 없었다.
  //   지면 골드가 통째로 사라지는 규칙(fail)이라 쌓아두는 플레이도 성립하지 않는다.
  //   새 값이면 1층 34 · 5층 58 · 10층 88(보스 176) — L2 는 첫 두 층, L5 는 20층대에 닿는다.
  GOLD_BASE: 34,
  GOLD_PER_FLOOR: 6,
  GOLD_BOSS_MUL: 2.0,
  GOLD_DAMAGE_SHARE: 0.45,   // 영웅 체력을 깎은 몫
  GOLD_KILL_SHARE: 0.55,     // 격퇴(=층 방어 성공) 몫
  GOLD_SEGMENTS: 8,          // 영웅 체력을 몇 조각으로 자를 것인가
  GOLD_SPREAD: 0.35,         // 조각당 난수 폭 ±35%

  goldFor: function (floor) {
    var g = this.GOLD_BASE + Math.max(0, floor - 1) * this.GOLD_PER_FLOOR;
    if (this.isBossFloor(floor)) g = Math.round(g * this.GOLD_BOSS_MUL);
    return g;
  },

  // 씬이 전투 시작 때 한 줄로 부른다 —  GAME.DefendTower.attachKillGold(this.state, floor);
  //  `state.onKill` 훅으로 '영웅을 실제로 격퇴했는가'를 잡는다.
  //  ⚠ 훅이 아직 없어도(combat.js 통합 전) `earnedFrom` 이 영웅의 `alive` 를 직접 보고
  //    격퇴 여부를 판정하므로 골드가 사라지지 않는다. 훅은 '더 정확한 신호'일 뿐이다.
  attachKillGold: function (state, floor) {
    if (!state) return null;
    var hero = null;
    for (var i = 0; i < state.units.length; i++) {
      if (state.units[i] && state.units[i].isHero) { hero = state.units[i]; break; }
    }
    state.killGold = 0;
    state._dgFloor = floor;
    state._dgPool = this.goldFor(floor);
    state._dgHero = hero;
    state._dgHeroMaxHp = hero ? hero.maxHp : 0;
    state._dgHeroKilled = false;
    state._dgActive = true;
    var prev = state.onKill;
    state.onKill = function (unit, st) {
      if (prev) { try { prev(unit, st); } catch (e) { /* 남의 훅이 터져도 골드는 준다 */ } }
      if (unit && unit.side === 'controller') (st || state)._dgHeroKilled = true;
    };
    return state;
  },

  // 이 판에서 번 골드. 전투가 끝난 뒤 한 번만 부른다.
  earnedFrom: function (state) {
    if (!state || !state._dgActive) return 0;
    var pool = state._dgPool || 0;
    var maxHp = state._dgHeroMaxHp || 0;
    var dealt = (state.telemetry && state.telemetry.heroDamageTaken) || 0;
    var hero = state._dgHero;
    // ⚠ '누적 피해량 / 최대체력' 하나로만 재면 **금방 100% 로 포화된다.** 영웅은 흡혈·물약으로
    //   회복하므로 누적 피해가 최대체력을 넘고도 멀쩡히 살아 있는 판이 흔하다(실측: 20층에서
    //   영웅이 이겼는데 누적 피해 100%). 그러면 뚫린 판과 격퇴한 판의 보상이 같아진다.
    //   그래서 **누적 피해**(회복을 뚫고 넣은 총량)와 **실제로 깎아 남긴 몫**(1 - 남은체력)을
    //   반씩 섞는다. 격퇴하면 둘 다 1 이라 정확히 1 이 된다.
    var cum = maxHp > 0 ? Math.max(0, Math.min(1, dealt / maxHp)) : 0;
    var net = (hero && maxHp > 0) ? Math.max(0, Math.min(1, 1 - Math.max(0, hero.hp) / maxHp)) : cum;
    var d = 0.5 * cum + 0.5 * net;
    var killed = !!state._dgHeroKilled || (hero && hero.alive === false);
    var segs = Math.floor(d * this.GOLD_SEGMENTS);
    var per = pool * this.GOLD_DAMAGE_SHARE / this.GOLD_SEGMENTS;
    var g = 0, i;
    for (i = 0; i < segs; i++) g += per * (1 + (Math.random() * 2 - 1) * this.GOLD_SPREAD);
    if (killed) g += pool * this.GOLD_KILL_SHARE * (1 + (Math.random() * 2 - 1) * this.GOLD_SPREAD);
    return Math.round(g);
  },

  // ── 도전 기록의 골드 ────────────────────────────────────────────────────
  goldOf: function () { return (this.get().gold || 0); },

  addGold: function (n) {
    if (!n) return this.goldOf();
    var rec = this.get();
    rec.gold = (rec.gold || 0) + Math.round(n);
    this._save(rec);
    return rec.gold;
  },

  spendGold: function (n) {
    var rec = this.get();
    if ((rec.gold || 0) < n) return false;
    rec.gold = (rec.gold || 0) - n;
    this._save(rec);
    return true;
  },

  // ── 유닛 레벨 (js/unitlevel.js 가 표·가격을 갖고, 저장만 여기에 붙는다) ─────
  setUnitLevel: function (typeKey, lv) {
    var rec = this.get();
    if (!rec.unitLv) rec.unitLv = {};
    if (!rec.refine) rec.refine = {};
    rec.unitLv[typeKey] = lv;
    this._save(rec);
    return rec;
  },

  // ── 증원 — 골드로 배치 예산을 영구히(이 도전 동안) 늘린다 ──────────────────
  //  "추가 유닛을 배치할 수 있게" 를 유닛 개수가 아니라 **예산**으로 구현한 이유:
  //  이 게임에서 '몇 기를 놓을 수 있는가'는 이미 예산 하나로 표현된다. 증원을 개별
  //  유닛 목록으로 따로 관리하면 배치 화면이 '예산으로 놓는 유닛'과 '증원으로 놓는 유닛'
  //  두 종류를 구분해야 하고, 그 경계에서 예산 검사가 갈라진다(옛 AI 시드 예산 초과 사고 계열).
  //  예산에 더하면 배치 화면은 아무것도 안 바꿔도 되고, 숫자도 정직하다.
  EXTRA_BUDGET_STEP: 10,     // 한 번에 사는 정원
  //  구매 1회마다 값이 이만큼 오른다(사용자 제안 5). 기본값 50 에 +5 씩이면
  //  10번째 구매가 95 다 — 계속 살 수는 있되 '무한정'은 아니게 된다.
  EXTRA_BUDGET_RISE: 5,
  extraBudgetPrice: function () {
    //  ── 살수록 비싸진다 (2026-08-03 사용자 지시: "증원도 갈수록 골드가 올라가야해") ──
    //  예전에는 몇 번을 사든 같은 값이라, 골드가 쌓이면 정원을 무한정 밀어 올릴 수
    //  있었다 — 그러면 '배치를 잘 짜는 것'보다 '많이 사는 것'이 언제나 정답이 된다.
    //  ⚠ 계단은 **산 횟수**에 걸린다(정원 총량이 아니라). 한 번에 10 씩 늘므로
    //    총량으로 계산하면 계단이 10배 성기게 걸려 체감이 안 난다.
    var bought = Math.floor((this.bonusBudget() || 0) / this.EXTRA_BUDGET_STEP);
    var base = this.EXTRA_BUDGET_STEP * (GAME.UnitLevel ? GAME.UnitLevel.BUDGET_RATE : 5);
    return base + bought * this.EXTRA_BUDGET_RISE;
  },
  bonusBudget: function () { return (this.get().bonusBudget || 0); },
  buyBudget: function () {
    var price = this.extraBudgetPrice();
    if (!this.spendGold(price)) return null;
    var rec = this.get();
    rec.bonusBudget = (rec.bonusBudget || 0) + this.EXTRA_BUDGET_STEP;
    this._save(rec);
    return rec.bonusBudget;
  },

  // 배치 화면이 실제로 써야 할 예산 — 층 예산 + 증원.
  // ⚠ `budgetFor` 는 **난이도 곡선의 기준값**이라 손대지 않는다(도구가 그걸 잰다).
  placeBudgetFor: function (floor) {
    return this.budgetFor(floor) + this.bonusBudget();
  },

  _all: function () { return GAME.Store.get(this.KEY, {}); },
  _key: function () { return GAME.Account.current() || 'guest'; },

  get: function () {
    var rec = this._all()[this._key()];
    if (!rec) {
      return { floor: 1, best: 0, runs: 0, kills: 0, placed: null, tier: null,
               gold: 0, unitLv: {}, refine: {}, bonusBudget: 0 };
    }
    if (!rec.floor) rec.floor = 1;
    // 옛 저장본에는 없는 칸 — 읽을 때 채운다(마이그레이션 코드를 따로 두지 않는다)
    if (typeof rec.gold !== 'number') rec.gold = 0;
    if (!rec.unitLv) rec.unitLv = {};
    if (!rec.refine) rec.refine = {};
    if (typeof rec.bonusBudget !== 'number') rec.bonusBudget = 0;
    return rec;
  },

  _save: function (rec) {
    var all = this._all();
    all[this._key()] = rec;
    GAME.Store.set(this.KEY, all);
  },

  // 전략가 예산 — 층마다 조금씩
  budgetFor: function (floor) {
    return this.BASE_BUDGET + (Math.max(1, floor) - 1) * this.BUDGET_STEP;
  },

  // 공격 영웅이 '받아야 할' 예산 — 상한을 씌우기 **전**의 값.
  // 캡에 먹힌 몫을 스탯으로 돌려주려면 원래 얼마였는지를 알아야 한다.
  heroBudgetRawFor: function (floor) {
    var f = Math.max(1, floor);
    var early = this.HERO_BASE + (Math.min(f, this.EARLY_FLOORS) - 1) * this.HERO_STEP;
    var b = (f <= this.EARLY_FLOORS)
      ? early
      : early + this.ENTRY_JUMP + (f - this.EARLY_FLOORS - 1) * this.HERO_STEP;
    if (this.isBossFloor(f)) b = Math.round(b * this.BOSS_HERO_MUL);
    return b;
  },

  // 공격 영웅 예산 — 4층에서 점프한 뒤 가파르게. 실제로 쓸 수 있는 상한에서 멈춘다.
  heroBudgetFor: function (floor) {
    return Math.min(this.heroBudgetRawFor(floor), GAME.Tower.maxSpendable());
  },

  // 층이 오르면 영웅 자체도 단단해진다(예산 상한에 닿은 뒤에도 난이도가 오르게).
  //  ① 층 기본 성장 (hp +1.8%/층, dmg +1.5%/층)
  //  ② 예산 상한을 넘긴 몫의 환산 — 이게 없으면 15층 이후 난이도가 거꾸로 간다(위 주석)
  //  ③ 영웅별 보정 — 영웅 내구도 2.7배 격차를 수성의 탑 안에서만 상쇄
  // heroKey 는 생략 가능하다. 생략하면 그 층의 영웅을 스스로 구한다
  // (기존 호출부 `heroModsFor(floor)` 를 그대로 두기 위한 것 — 씬은 건드리지 않는다).
  heroModsFor: function (floor, heroKey) {
    var t = Math.max(0, floor - 1);
    var hp = 1 + 0.018 * t, dmg = 1 + 0.015 * t;

    var cap = GAME.Tower.maxSpendable();
    var raw = this.heroBudgetRawFor(floor);
    if (raw > cap) {
      var over = raw / cap;
      hp *= Math.pow(over, this.OVERFLOW_HP_POW);
      dmg *= Math.pow(over, this.OVERFLOW_DMG_POW);
    }

    if (this.isBossFloor(floor)) { hp *= this.BOSS_MOD_HP; dmg *= this.BOSS_MOD_DMG; }

    // heroKeyFor 는 이제 층만 본다 — 숙련도를 구하러 Learn 을 건드릴 이유가 없다
    var hk = heroKey || this.heroKeyFor(floor);
    var k = (this.HERO_DIFF && this.HERO_DIFF[hk]) || 1;
    return { hp: hp * k, damage: dmg * k };
  },

  // 이 층에서 AI 컨트롤러가 최소한 이만큼은 잘한다.
  // 학습(Learn.getCtrl)이 더 높으면 그쪽을 쓴다 — 학습이 층수에 묻히지 않게.
  skillFloorFor: function (floor) {
    return Math.min(0.95, 0.08 + 0.035 * (Math.max(1, floor) - 1));
  },

  skillFor: function (floor) {
    var learned = (GAME.Learn.getCtrl().skill) || 0;
    return Math.max(this.skillFloorFor(floor), learned);
  },

  // ── 정련 — 5단계 이후의 강화 (2026-08-03 사용자 지시) ─────────────────────
  //  "유닛 업그레이드는 5단계만 있는 건 너무 적어. 5단계까지 간 다음 확률적으로
  //   강화할 수 있게 해주거나 하는 등 이후 시스템도 만들어줘"
  //
  //  레벨(1~5)은 **확정 성장**이라 계획을 세울 수 있어야 한다 — 거기 확률을 섞으면
  //  배치 설계가 도박이 된다. 그래서 확률은 **그 위**에 얹는다:
  //    · 5단계에 도달한 유닛만 정련할 수 있다
  //    · 성공하면 정련 단계 +1(공격·체력 +6%씩 누적), 실패하면 골드만 잃는다
  //    · **떨어지지는 않는다.** 내려가는 강화는 재미가 아니라 손실 회피 스트레스다
  //      (이 게임은 12세 이용가 캐주얼이다)
  //  ⚠ 성공률이 단계마다 낮아지고 값은 오른다 — 그래서 스스로 멈출 자리가 생긴다.
  REFINE_MAX: 10,
  REFINE_GAIN: 0.06,          // 단계당 공격·체력 배수
  refineChance: function (step) {
    //  1단계 90% → 10단계 25%. 완만하게 떨어져 "다음 한 번"이 늘 해볼 만하게 둔다.
    return Math.max(0.25, 0.90 - 0.072 * (step || 0));
  },
  refineCost: function (step) {
    return 120 + 90 * (step || 0);
  },
  refineOf: function (typeKey) {
    var rec = this.get();
    return (rec.refine && rec.refine[typeKey]) || 0;
  },
  //  정련 배수 — 진형을 만들 때 이 유닛에 곱한다.
  refineMods: function (typeKey) {
    var st = this.refineOf(typeKey);
    if (!st) return null;
    var m = 1 + this.REFINE_GAIN * st;
    return { hp: m, damage: m };
  },
  canRefine: function (typeKey) {
    var rec = this.get();
    var lv = (rec.unitLv && rec.unitLv[typeKey]) || 0;
    var maxLv = (GAME.UnitLevel && GAME.UnitLevel.MAX) || 5;
    return lv >= maxLv && this.refineOf(typeKey) < this.REFINE_MAX;
  },
  //  시도한다. { ok, step, cost } 를 돌려준다. 골드가 모자라면 null.
  tryRefine: function (typeKey) {
    var rec = this.get();
    if (!this.canRefine(typeKey)) return null;
    var step = this.refineOf(typeKey);
    var cost = this.refineCost(step);
    if ((rec.gold || 0) < cost) return null;
    rec.gold -= cost;
    var ok = Math.random() < this.refineChance(step);
    if (ok) {
      if (!rec.refine) rec.refine = {};
      rec.refine[typeKey] = step + 1;
    }
    this._save(rec);
    return { ok: ok, step: rec.refine ? (rec.refine[typeKey] || 0) : 0, cost: cost };
  },

  isBossFloor: function (floor) {
    return floor > 0 && floor % this.BOSS_EVERY === 0;
  },

  // 이 층에 올라오는 영웅 — **층 순환식**(v0.34).
  //
  // 예전에는 숙련도 구간으로 골랐다(`skill<0.3 광전사 / <0.78 파수꾼 / 그 위 사냥꾼`).
  // 숙련도가 층에 매여 있어서 실질적으로는 **1~7층 광전사 / 8~20층 파수꾼 / 21층~ 사냥꾼**,
  // 즉 층마다 상대가 통째로 바뀌는 구간제였다. 영웅 간 '처치 필요 원피해'가 2.7배라
  // 진형 화력은 숫자 하나인데 문턱만 2.7배 튀고, **구간 경계에서 방어율이 0%↔100% 계단**이 됐다
  // (실측: 같은 진형·같은 층에서 영웅만 바꾸면 21% ↔ 100%, 편차 79%p).
  // 계단이 남아 있으면 "이 진형이 8층에서 0%"라는 관측이 진형 탓인지 그 층이 마침
  // 파수꾼 구간이라서인지 **구분되지 않는다** — 원형 조사가 통째로 읽히지 않는다.
  //
  // 그래서 연속 3개 층에 세 영웅이 전부 나오게 순환시킨다. 계단이 평균으로 녹고,
  // **전략가는 한 배치로 세 영웅을 다 막아야 하므로 배치에 깊이가 생긴다**
  // (부수 효과가 아니라 이게 노림수다).
  // 남은 영웅 간 격차는 `HERO_DIFF` 로 상쇄한다 — `heroes.js` 는 건드리지 않는다.
  //
  // ⚠ `skill` 인자는 더 이상 쓰지 않지만 시그니처는 남긴다(호출부 6곳을 안 건드리려고).
  //   일반 방어전(수성의 탑 아님)의 "수색대는 숙련 78% 이상에서만" 규칙은
  //   `scenes/defend.js` 의 다른 가지에 있어 이 변경의 영향을 받지 않는다(확인함).
  heroKeyFor: function (floor, skill) {
    var f = Math.max(1, floor);
    // 1~3층은 연습 구간이라 **가장 순한 상대(광전사)로 고정**한다.
    // 순환을 그대로 적용했더니 3층이 파수꾼이 되어 무배치 방어 성공률이 58% → 33% 로
    // 떨어졌다(실측, rep24). 연습 구간이 동전 던지기가 되면 초반 이탈로 직결된다.
    // 4층부터는 순환이라 4·5·6층에 세 영웅이 전부 나온다 — 노림수는 그대로 유지된다.
    if (f <= this.EARLY_FLOORS) return 'vanguard';
    if (this.isBossFloor(f)) {
      // 보스 층도 순환한다. 결과적으로 보스 층을 낀 3개 층에도 세 영웅이 전부 들어간다
      // (예: 9·10·11층 = 파수꾼·광전사·사냥꾼).
      var idx = Math.floor(f / this.BOSS_EVERY) - 1;
      return GAME.HERO_ORDER[idx % GAME.HERO_ORDER.length];
    }
    return GAME.HERO_ORDER[(f - 1) % GAME.HERO_ORDER.length];
  },

  // 층 방어 성공 — 영웅 하나를 격파했다.
  //  state 를 주면 그 판에서 번 골드(피해 비례 + 격퇴 몫)를 함께 넣는다.
  clear: function (floor, placed, tier, state) {
    var rec = this.get();
    rec.kills = (rec.kills || 0) + 1;
    rec.floor = floor + 1;
    if (floor > (rec.best || 0)) rec.best = floor;
    rec.gold = (rec.gold || 0) + this.earnedFrom(state);
    // 다음 층에서 같은 배치로 이어갈 수 있게 남긴다(고칠 수도 있다)
    if (placed) { rec.placed = placed; rec.tier = tier || null; }
    this._save(rec);
    return rec;
  },

  // 실패 — **1층부터 다시.** 골드·유닛 레벨·증원·배치도 같이 사라진다.
  //  영구 성장으로 두면 1층이 통째로 무의미해지고(레벨 5 진형으로 1층을 도는 상태),
  //  무배치 기준선(SC-4)도 "골드가 얼마나 쌓였느냐"에 따라 달라져 측정 자체가 안 된다.
  //
  //  2026-07-29 · **두 탑의 패배 규칙이 여기로 통일됐다.** 통곡의 탑에도 체크포인트가
  //  있었는데(`Tower.CHECKPOINT_EVERY`) 사용자 지시로 없앴다 —
  //  이제 양쪽 다 "1번이라도 패배하면 1층부터, 빌드도 통째로 초기화"다.
  //  (통곡의 탑에서 빌드 초기화를 맡는 건 `TowerRun.end()` 다.)
  //  ⚠ `best`(최고 기록)만 남긴다. 랭킹 점수의 근거라 지우면 안 된다.
  fail: function () {
    var rec = this.get();
    rec.runs = (rec.runs || 0) + 1;
    rec.floor = 1;
    rec.placed = null;
    rec.tier = null;      // placed 를 지웠으면 그 등급표도 같이 지운다(짝이 안 맞으면 거짓말이 된다)
    rec.gold = 0;
    rec.unitLv = {};
    rec.refine = {};
    rec.bonusBudget = 0;
    this._save(rec);
    return rec;
  },

  reset: function () {
    var all = this._all();
    delete all[this._key()];
    GAME.Store.set(this.KEY, all);
  }
};
