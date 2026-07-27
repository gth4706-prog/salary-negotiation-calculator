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

  // 층 클리어 보상. 예전엔 층당 영웅 예산이 +5 씩 올랐다 —
  // 그 성장을 골드로 옮긴 것이라 **비슷한 값에서 출발**해 실측으로 조정한다.
  // 보스 층은 더 준다(구간을 넘은 보상).
  GOLD_BASE: 14,
  GOLD_PER_FLOOR: 2,
  GOLD_BOSS_MUL: 2.0,
  goldFor: function (floor) {
    var g = this.GOLD_BASE + Math.max(0, floor - 1) * this.GOLD_PER_FLOOR;
    if (GAME.Tower.isBossFloor && GAME.Tower.isBossFloor(floor)) g = Math.round(g * this.GOLD_BOSS_MUL);
    return g;
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
      floorsCleared: 0
    };
    this._save(rec);
    return rec;
  },

  // 층 클리어 — 골드를 준다
  clear: function (floor) {
    var rec = this.get();
    if (!rec) return null;
    rec.gold += this.goldFor(floor);
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
