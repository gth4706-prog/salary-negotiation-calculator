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

  // 공격 영웅 예산 — 4층에서 점프한 뒤 가파르게. 실제로 쓸 수 있는 상한에서 멈춘다.
  heroBudgetFor: function (floor) {
    var f = Math.max(1, floor);
    var early = this.HERO_BASE + (Math.min(f, this.EARLY_FLOORS) - 1) * this.HERO_STEP;
    var b = (f <= this.EARLY_FLOORS)
      ? early
      : early + this.ENTRY_JUMP + (f - this.EARLY_FLOORS - 1) * this.HERO_STEP;
    if (this.isBossFloor(f)) b = Math.round(b * this.BOSS_HERO_MUL);
    return Math.min(b, GAME.Tower.maxSpendable());
  },

  // 층이 오르면 영웅 자체도 단단해진다(예산 상한에 닿은 뒤에도 난이도가 오르게)
  heroModsFor: function (floor) {
    var t = Math.max(0, floor - 1);
    return { hp: 1 + 0.018 * t, damage: 1 + 0.015 * t };
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

  // 이 층에 올라오는 영웅. 숙련도에 따라 종류가 바뀐다(기존 방어전 규칙과 동일).
  heroKeyFor: function (floor, skill) {
    if (this.isBossFloor(floor)) {
      // 보스 층은 순환시켜 매번 다른 상대를 만나게 한다
      var idx = Math.floor(floor / this.BOSS_EVERY) - 1;
      return GAME.HERO_ORDER[idx % GAME.HERO_ORDER.length];
    }
    return skill < 0.3 ? 'vanguard' : (skill < 0.78 ? 'warden' : 'ranger');
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
