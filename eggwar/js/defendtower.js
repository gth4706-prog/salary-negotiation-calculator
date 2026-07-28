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

  _all: function () { return GAME.Store.get(this.KEY, {}); },
  _key: function () { return GAME.Account.current() || 'guest'; },

  get: function () {
    var rec = this._all()[this._key()];
    if (!rec) return { floor: 1, best: 0, runs: 0, kills: 0, placed: null, tier: null };
    if (!rec.floor) rec.floor = 1;
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

  // 층 방어 성공 — 영웅 하나를 격파했다
  clear: function (floor, placed, tier) {
    var rec = this.get();
    rec.kills = (rec.kills || 0) + 1;
    rec.floor = floor + 1;
    if (floor > (rec.best || 0)) rec.best = floor;
    // 다음 층에서 같은 배치로 이어갈 수 있게 남긴다(고칠 수도 있다)
    if (placed) { rec.placed = placed; rec.tier = tier || null; }
    this._save(rec);
    return rec;
  },

  fail: function () {
    var rec = this.get();
    rec.runs = (rec.runs || 0) + 1;
    rec.floor = 1;
    rec.placed = null;
    this._save(rec);
    return rec;
  },

  reset: function () {
    var all = this._all();
    delete all[this._key()];
    GAME.Store.set(this.KEY, all);
  }
};
