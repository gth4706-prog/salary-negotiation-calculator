window.GAME = window.GAME || {};

// 통곡의 탑 — 층을 올라가며 점점 어려워지는 모드.
//
//   1층은 쉽다. 올라갈수록:
//     · 예산이 +10 씩 늘어난다 (1층 100 → 2층 110 → 3층 120 …)
//     · AI 전략가가 **그 플레이어의 성향을 깨는 조합**으로 배치를 짠다
//     · 학습된 행동(압박·위생병 추적 등)이 함께 반영된다
//
//   지면 1층으로 돌아간다. 최고 층수는 ID 별로 남고 랭킹 점수가 된다.
GAME.Tower = {
  KEY: 'asymgame.tower.v1',
  BASE_BUDGET: 100,
  BUDGET_STEP: 10,

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

  // 진형(탑) 예산 — 한 층에 +10
  budgetFor: function (floor) {
    return this.BASE_BUDGET + (floor - 1) * this.BUDGET_STEP;
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
  // 계수는 실측으로 정했다 — 더 세게 주면 12층에서 돌파율이 0% 로 꺾여 벽이 된다.
  modsFor: function (floor) {
    var t = Math.max(0, floor - 1);
    return { hp: 1 + 0.025 * t, damage: 1 + 0.02 * t };
  },

  // 이 층의 배치도를 만든다. 1~2층은 성향 반영을 약하게 해서 진입 장벽을 낮춘다.
  formationFor: function (floor) {
    var budget = this.budgetFor(floor);
    var prof = GAME.Profile.read();
    var useProfile = floor >= 3 && prof.battles >= 1;
    return GAME.AutoFormation.generate(budget, useProfile ? prof : null, {
      id: 'tower-' + floor,
      name: floor + '층',
      tier: '탑 ' + floor + '층'
    });
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
