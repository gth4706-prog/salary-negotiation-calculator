window.GAME = window.GAME || {};

// 통곡의 탑 '도전(run)' — **한 번 세팅하고 층마다 성장하는** 구조.
//
// 예전 방식: 층마다 영웅·아이템·스킬을 다시 골랐다. 층수가 오를수록 영웅 예산이
// 올라(135 +5/층) 더 좋은 장비를 사는 게 성장이었다. 문제는 매 층 같은 선택을
// 반복해야 했고(지루함), AI 가 '그 층에 고른 영웅'을 카운터로 잡느라 층마다 상성이 튀었다.
//
// 지금 방식:
//   1) 도전 시작 때 **한 번만** 영웅·아이템·스킬을 고른다(시작 예산 START_BUDGET).
//   2) 한 층 깰 때마다 **골드**를 받는다.
//   3) 골드로 **능력치를 레벨업**하거나 **빈 장비칸을 채우거나 등급을 올린다**.
//      영웅과 이미 고른 스킬은 그대로 간다 — 내 빌드가 층을 거치며 자라는 감각.
//   4) 지면 도전이 끝난다(1층부터 새 도전).
//
// 영웅이 도전 내내 고정이므로 AI 는 '영웅 카운터'가 아니라
// **그 사람의 전투 양상**(js/profile.js)을 읽어 배치를 짠다.
GAME.TowerRun = {
  KEY: 'asymgame.towerrun.v1',

  // 도전 시작 예산 — 영웅 + 아이템을 사는 최초 한 번의 돈.
  // 예전 1층 영웅 예산(135)과 같게 둬서 1층 체감이 바뀌지 않게 한다.
  START_BUDGET: 135,

  // ── 층 골드 총량(풀) ──────────────────────────────────────────────────────
  // 예전엔 층당 영웅 예산이 +5 씩 올랐다 — 그 성장을 골드로 옮긴 값이다.
  //
  // 2026-07-28 · **지급 방식이 바뀌었다.** 예전에는 이 값을 층을 깬 순간 통째로 줬는데
  // (사용자 요청) 지금은 **적 유닛을 잡을 때마다 랜덤하게 쪼개서** 준다.
  // 이 함수는 이제 "그 층에서 나올 골드의 총량"이라는 뜻이고, 값 자체는 손대지 않았다 —
  // 성장 곡선을 그대로 유지하기 위해서다(층별 기대 총액이 변경 전과 같아야 한다).
  GOLD_BASE: 14,
  GOLD_PER_FLOOR: 2,
  GOLD_BOSS_MUL: 2.0,
  goldFor: function (floor) {
    var g = this.GOLD_BASE + Math.max(0, floor - 1) * this.GOLD_PER_FLOOR;
    if (GAME.Tower.isBossFloor && GAME.Tower.isBossFloor(floor)) g = Math.round(g * this.GOLD_BOSS_MUL);
    return g;
  },

  // ── 처치 보상 골드 (v0.36) ────────────────────────────────────────────────
  //
  //  요청: "층을 깨면 골드"를 **"적 유닛을 잡으면 랜덤 골드"** 로 바꾼다.
  //
  //  왜 '유닛 cost 에 비례하는 고정 요율'이 아니라 '층 풀을 나눠 갖는' 방식인가 —
  //  실측(`scratchpad/measure-formation.js`, 층별 40회 평균)으로 확인한 것:
  //    층      1     4     10★   20★   30★   35
  //    진형비용 97   253   163   188   213   373
  //    옛 골드  14    20    64   104   144    82
  //    골드/비용 0.144 0.079 0.394 0.552 0.678 0.220
  //  **비율이 10배 가까이 흔들린다.** 보스 층은 호위 예산이 0.60 으로 깎이는데 골드는
  //  2배라 요율이 치솟고, 4층은 진형 예산이 108→255 로 점프하는데 골드는 +2 뿐이라
  //  요율이 바닥을 친다. 고정 요율 하나로는 어떤 값을 골라도 어떤 층에선 몇 배씩 틀린다.
  //  → 그래서 **층 총량(goldFor)을 그대로 두고, 그 안에서 유닛 cost 비율로 나눈다.**
  //    "비싼 유닛이 더 준다 / 보스는 크게" 는 지키면서 층별 기대 총액은 **다 주웠을 때** 변경 전과 같다.
  //  실제로는 동전을 주워야 들어오므로 실효 수령률이 곧 성장 속도다 —
  //  AI(동전을 주우러 가지 않는다) 기준 85~93%, 사람은 그보다 높다(실측).
  //  **일부러 보정하지 않았다.** 보정하면 '주워야 한다'는 규칙이 무의미해진다.
  //
  //  분배 규칙
  //   · 가중치 = 유닛 cost. 보스는 cost 가 0 이라 별도 상수(BOSS_KILL_WEIGHT)를 쓴다.
  //   · 위험물(가시덫)은 **가중치에서도 보상에서도 뺀다.** 전멸 판정(`Combat.isHazard`)에서
  //     이미 '전투원'이 아니고, 밟혀서 자폭하는 물건이라 '잡았다'고 하기도 어렵다.
  //     빼두면 총합이 층 풀과 정확히 일치한다(안 빼면 덫이 안 밟힌 판만 총액이 모자란다).
  //   · 한 기당 지급액 = 풀 × (가중치/총가중치) × 난수. **최소 1골드**(0 이 뜨면 처치가
  //     보상으로 안 읽힌다). 잔돈은 carry 로 이월해 반올림 손실이 쌓이지 않게 한다.
  KILL_POOL_FRAC: 0.90,     // 층 총량 중 처치 보상으로 나가는 몫
  CLEAR_BONUS_FRAC: 0.10,   // 남은 몫은 층 클리어 보너스(요청: "없애거나 크게 줄인다")
  KILL_SPREAD: 0.40,        // 한 기당 난수 폭 ±40%
  BOSS_KILL_WEIGHT: 90,     // 보스 가중치 = 가장 비싼 일반 유닛(45)의 2배

  killWeight: function (def) {
    if (!def) return 1;
    if (def.isBoss) return this.BOSS_KILL_WEIGHT;
    return Math.max(1, def.cost || 1);
  },

  clearBonusFor: function (floor) {
    return Math.round(this.goldFor(floor) * this.CLEAR_BONUS_FRAC);
  },

  // ── 전투 시작 때 씬이 한 줄로 부른다 ──────────────────────────────────────
  //   GAME.TowerRun.attachKillGold(this.state, this.tower);
  //
  //  `state.onKill(unit, state)` 훅을 설치한다. 이 훅은 `js/combat.js` 가
  //  `spawnYolk` 를 부르는 세 지점에서 호출한다(다른 에이전트가 넣는 계약).
  //  ⚠ 훅이 아직 없어도(=한 번도 안 불려도) 게임이 깨지지 않아야 한다 →
  //    `earnedFrom` 이 0 을 돌려주고 `clear` 가 **옛 방식(층 클리어 총액)으로 되돌아간다.**
  attachKillGold: function (state, floor) {
    if (!state) return null;
    var self = this;
    var W = 0, i, u;
    for (i = 0; i < state.units.length; i++) {
      u = state.units[i];
      if (!u || u.side !== 'strategist' || u.isHero) continue;
      if (GAME.Combat.isHazard && GAME.Combat.isHazard(u)) continue;
      W += this.killWeight(u.def);
    }
    state.killGold = 0;
    state.killGoldEvents = [];      // [{x,y,gold,boss}] — 연출용(전장에 "+3" 띄우려면 이걸 읽는다)
    state._kgFloor = floor;
    state._kgPool = this.goldFor(floor) * this.KILL_POOL_FRAC;
    state._kgWeight = W;
    state._kgCarry = 0;
    state._kgActive = true;
    var prev = state.onKill;
    state.onKill = function (unit, st) {
      if (prev) { try { prev(unit, st); } catch (e) { /* 남의 훅이 터져도 골드는 준다 */ } }
      self._onKill(unit, st || state);
    };
    return state;
  },

  _onKill: function (unit, state) {
    if (!state || !state._kgActive || !unit) return 0;
    // 훅이 **실제로 불렸다**는 사실을 따로 기록한다. 아래 goldGainFor 가
    // '골드 0' 을 '훅이 안 불렸다' 로 오판하지 않게 하는 유일한 근거다.
    state._kgFired = true;
    if (unit.side !== 'strategist' || unit.isHero) return 0;         // 내 영웅이 죽은 건 보상 아님
    if (GAME.Combat.isHazard && GAME.Combat.isHazard(unit)) return 0; // 가시덫은 지형이다
    if (unit.__kgPaid) return 0;                                      // 같은 기에 두 번 주지 않는다
    unit.__kgPaid = true;
    var W = state._kgWeight || 0;
    if (W <= 0) return 0;
    var jit = 1 + (Math.random() * 2 - 1) * this.KILL_SPREAD;
    var exact = state._kgPool * (this.killWeight(unit.def) / W) * jit;
    var give = Math.max(1, Math.round(exact + state._kgCarry));
    state._kgCarry += exact - give;      // 반올림 잔돈 이월 — 총합이 풀에서 안 흘러내리게
    state.killGold += give;
    state.killGoldEvents.push({ x: unit.x, y: unit.y, gold: give, boss: !!(unit.def && unit.def.isBoss) });
    return give;
  },

  // 이 판에서 처치로 번 골드(훅이 안 붙었으면 0)
  earnedFrom: function (state) {
    return (state && state._kgActive) ? Math.round(state.killGold || 0) : 0;
  },

  // 결과 화면에 띄울 이번 층 총 획득액.
  //  ⚠ 안전망 두 겹.
  //   ① state 가 없으면(씬이 아직 통합 안 됨) 옛 방식대로 층 총액을 준다.
  //   ② 훅을 걸었는데 **한 번도 안 불렸으면**(combat.js 의 `state.onKill` 호출이 빠졌거나
  //      되돌려졌으면) killGold 가 0 이다. 그대로 두면 클리어 보너스 10% 만 남아
  //      **성장 곡선이 조용히 1/10 로 죽는다.** 이건 화면에도 안 보이는 종류의 사고라
  //      옛 방식으로 되돌리고 콘솔에 남긴다.
  // 층 조건의 보상 배수 — 지금은 `nosupply`(무보급, 1.5배)뿐이다.
  // "제약을 받아들이면 보상이 크다"가 성립해야 조건이 벌칙이 아니라 **선택**이 된다.
  //  ⚠ 축복(탐욕)의 배수와 **곱해진다** — 무보급 층에서 탐욕을 들면 1.5 × 1.4 = 2.1배다.
  //    의도한 것이다: 제약 둘을 겹쳐 받아들인 대가는 겹쳐서 준다.
  ruleGoldMul: function (floor) {
    var m = 1;
    if (GAME.TowerRule) {
      var r = GAME.TowerRule.ruleFor(floor);
      if (r && r.goldMul) m *= r.goldMul;
    }
    if (GAME.TowerBoon) m *= GAME.TowerBoon.goldMul(this.get());
    return m;
  },

  goldGainFor: function (floor, state) {
    var rm = this.ruleGoldMul(floor);
    if (state && state._kgActive) {
      var earned = this.earnedFrom(state);
      // 훅이 한 번이라도 불렸으면 **0 도 정직한 결과다** — 동전을 하나도 안 주운 판이다.
      // 예전엔 `earned > 0` 으로만 갈라서, 한 개도 안 주운 쪽이 층 총액을 통째로 받는
      // 역전이 생겼다(동전 시스템이 들어오면서 실제로 도달 가능한 경로가 됐다).
      if (state._kgFired) {
        return Math.round((earned + this.clearBonusFor(floor)) * rm);
      }
      if (window.console && console.warn) {
        console.warn('[TowerRun] 처치 골드가 0 이다 — combat.js 의 state.onKill 훅이 안 불렸을 수 있다. 층 총액으로 되돌린다.');
      }
    }
    return Math.round(this.goldFor(floor) * rm);
  },

  // ── 능력치 레벨업 ──
  // 한 레벨의 효과는 **아이템 한 단계보다 작게** 잡는다. 레벨업이 아이템을 대체하면
  // 장비 선택이 무의미해진다. 비용은 레벨마다 올라 무한 성장을 막는다.
  STATS: [
    { key: 'damage', name: '공격력', add: 2,  cost: 10, step: 5, max: 20, unit: '' },
    { key: 'hp',     name: '체력',   add: 45, cost: 10, step: 5, max: 20, unit: '' },
    { key: 'armor',  name: '방어력', add: 3,  cost: 12, step: 6, max: 15, unit: '' },
    { key: 'speed',  name: '이동속도', add: 5, cost: 12, step: 6, max: 12, unit: '' }
  ],
  statDef: function (key) {
    for (var i = 0; i < this.STATS.length; i++) if (this.STATS[i].key === key) return this.STATS[i];
    return null;
  },
  // 다음 레벨 가격 (현재 레벨이 오를수록 비싸진다)
  costOf: function (key, level) {
    var d = this.statDef(key);
    if (!d) return Infinity;
    return d.cost + d.step * (level || 0);
  },

  _all: function () { return GAME.Store.get(this.KEY, {}); },
  _key: function () { return GAME.Account.current() || 'guest'; },

  // 진행 중인 도전이 없으면 null
  get: function () {
    var rec = this._all()[this._key()];
    return (rec && rec.active) ? rec : null;
  },

  _save: function (rec) {
    var all = this._all();
    all[this._key()] = rec;
    GAME.Store.set(this.KEY, all);
  },

  // 도전 시작 — 영웅·아이템·스킬을 확정한다
  start: function (heroKey, items, picks) {
    var rec = {
      active: true,
      heroKey: heroKey,
      items: items || { weapon: null, armor: null, boots: null, potion: null },
      picks: picks || GAME.defaultSkillPicks(),
      gold: 0,
      levels: { damage: 0, hp: 0, armor: 0, speed: 0 },
      floorsCleared: 0,
      // ── 도전 시드 (2026-07-30 대개편) ─────────────────────────────────────
      // 층의 **배치 원형과 조건**이 이 시드로 결정된다. 왜 층 번호만으로 정하지 않는가:
      //   · 층 번호만이면 "7층은 집게 층" 이 영구히 고정된다 → 몇 번 오르면 다 외운다.
      //   · 매 시도마다 난수면 같은 층을 다시 칠 때마다 딴 판이 되어 **배워서 대응하는**
      //     이 게임의 축이 무너진다(TowerLearn 의 동일층 비교도 근거를 잃는다).
      // 그래서 **도전 한 판 안에서는 고정, 새 도전마다 새로 섞인다** — 로그라이크의 표준이다.
      // 죽어서 1층부터 다시 오르면 그때는 새 배열이라 지루하지 않다.
      seed: Math.floor(Math.random() * 0x7fffffff) || 1
    };
    this._save(rec);
    return rec;
  },

  // 층 클리어 — 골드를 준다.
  //  state 를 주면 **처치로 번 골드 + 작은 클리어 보너스**,
  //  안 주면(또는 훅이 안 붙었으면) 옛 방식대로 층 총액을 통째로 준다.
  clear: function (floor, state) {
    var rec = this.get();
    if (!rec) return null;
    rec.gold += this.goldGainFor(floor, state);
    rec.floorsCleared = (rec.floorsCleared || 0) + 1;
    this._save(rec);
    return rec;
  },

  // 도전 종료(패배) — 다음엔 처음부터 고른다
  end: function () {
    var all = this._all();
    delete all[this._key()];
    GAME.Store.set(this.KEY, all);
  },

  // 능력치 한 단계 올리기. 성공하면 남은 골드, 실패하면 null
  levelUp: function (key) {
    var rec = this.get();
    var d = this.statDef(key);
    if (!rec || !d) return null;
    var lv = rec.levels[key] || 0;
    if (lv >= d.max) return null;
    var cost = this.costOf(key, lv);
    if (rec.gold < cost) return null;
    rec.gold -= cost;
    rec.levels[key] = lv + 1;
    this._save(rec);
    return rec;
  },

  // 도전 중 장비 구매/교체. 골드로 산다(예산이 아니라 골드다 — 도전 중엔 예산이 없다).
  // 같은 칸의 더 좋은 등급으로 갈아탈 때는 **차액**만 낸다(이미 낸 값을 존중).
  buyItem: function (slotKey, itemKey) {
    var rec = this.get();
    if (!rec) return null;
    var it = GAME.Items.find(slotKey, itemKey);
    if (!it) return null;
    var cur = rec.items[slotKey] ? GAME.Items.find(slotKey, rec.items[slotKey]) : null;
    var price = it.cost - (cur ? cur.cost : 0);
    if (price < 0) return null;              // 하향 교체로 환불받는 건 막는다
    if (rec.gold < price) return null;
    rec.gold -= price;
    rec.items[slotKey] = itemKey;
    this._save(rec);
    return rec;
  },

  // ── 물약 보급 (2026-07-29, 사용자 지시) ──────────────────────────────────
  // "물약은 라운드 끝날 때마다 구매할 수 있게." 이미 `buyItem('potion', …)` 이 있었는데
  // **부르는 화면이 없었다** — 층간 화면은 능력치 강화만 노출했다. 그래서 도전을 시작할 때
  // 고른 물약이 전부였고, 골드가 남아도 회복 수단을 늘릴 길이 없었다.
  // 여기서는 '다음 등급이 무엇이고 차액이 얼마인가'만 계산한다(구매는 buyItem 이 한다).
  nextPotion: function (rec) {
    rec = rec || this.get();
    if (!rec) return null;
    var list = GAME.ITEMS.potion || [];
    var curKey = rec.items && rec.items.potion;
    var cur = curKey ? GAME.Items.find('potion', curKey) : null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].cost > (cur ? cur.cost : -1)) {
        return { item: list[i], price: list[i].cost - (cur ? cur.cost : 0), cur: cur };
      }
    }
    return { item: null, price: 0, cur: cur };      // 이미 최고 등급
  },

  // 레벨업이 반영된 스탯 보정 — 전투 시작 때 영웅에게 더해진다
  statBonus: function (rec) {
    rec = rec || this.get();
    var out = { damage: 0, hp: 0, armor: 0, speed: 0 };
    if (!rec) return out;
    for (var i = 0; i < this.STATS.length; i++) {
      var d = this.STATS[i];
      out[d.key] = d.add * (rec.levels[d.key] || 0);
    }
    return out;
  },

  // 지금까지 능력치에 쓴 골드 (표시용)
  spentOnLevels: function (rec) {
    rec = rec || this.get();
    if (!rec) return 0;
    var total = 0;
    for (var i = 0; i < this.STATS.length; i++) {
      var d = this.STATS[i], lv = rec.levels[d.key] || 0;
      for (var l = 0; l < lv; l++) total += this.costOf(d.key, l);
    }
    return total;
  }
};
