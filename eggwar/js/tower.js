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
  HERO_BASE_BUDGET: 135,
  HERO_BUDGET_STEP: 5,

  // 영웅이 실제로 쓸 수 있는 최대 금액(가장 비싼 영웅 + 칸별 최고가 아이템).
  // 이걸 넘겨서 주면 화면에 표시되는 예산이 거짓말이 된다 — 쓸 수가 없는 돈이다.
  maxSpendable: function () {
    var hero = 0, k;
    for (k in GAME.HEROES) if (GAME.HEROES[k].cost > hero) hero = GAME.HEROES[k].cost;
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
  modsFor: function (floor) {
    var t = Math.max(0, floor - 1);
    return { hp: 1 + 0.012 * t, damage: 1 + 0.010 * t };
  },

  // ── 보스 층 ──────────────────────────────────────────────────
  // 10층마다 보스가 나온다. 층수만 올라가는 무한의 탑에 '구간'을 만들어 주는 장치다.
  BOSS_EVERY: 10,
  // 보스 층 호위 예산 비율. 실측으로 잡았다 —
  // 0.70 이면 보스 층이 벽(프로 0~20%), 0.50 이하면 오히려 무조작이 뚫는다(20%).
  // 0.60 에서 무조작 0% 를 지키면서 프로 13~40% 가 나온다.
  BOSS_ESCORT: 0.60,
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
    // 도전(TowerRun)이 진행 중이면 영웅은 **도전 내내 고정**이다. 그런 상황에서 매 층
    // 그 영웅의 카운터를 얹으면 같은 상성이 층마다 반복돼 '벽'처럼 느껴진다.
    // 그래서 도전 중에는 카운터를 끄고 **그 사람의 전투 양상**(Profile — 교전거리·회피·
    // 진입 방향)만으로 배치를 짠다. 매 층 영웅을 다시 고르던 예전 방식에서는
    // '무엇을 들고 오는지'가 가장 확실한 정보였으니 그때는 카운터를 그대로 쓴다.
    var runActive = !!(GAME.TowerRun && GAME.TowerRun.get());
    var f = GAME.AutoFormation.generate(budget, useProfile ? prof : null, {
      id: 'tower-' + floor,
      name: floor + '층',
      tier: '탑 ' + floor + '층',
      heroKey: runActive ? null : (heroKey || null)
    });

    if (bossKey) {
      // 보스는 진형 한가운데 뒤쪽에 선다
      f.units.push({ type: bossKey, nx: 0.5, ny: 0.13 });
      f.boss = bossKey;
      f.name = floor + '층 · 보스';
      f.rationale = GAME.UNITS[bossKey].name + ' — ' + GAME.UNITS[bossKey].desc +
                    '\n' + f.rationale;
    }
    return f;
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

  // 실패 — 1층부터 다시
  fail: function () {
    var rec = this.get();
    rec.runs = (rec.runs || 0) + 1;
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
