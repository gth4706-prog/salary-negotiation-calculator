window.GAME = window.GAME || {};

// ============================================================================
//  통곡의 탑 — **영구 캐릭터** (2026-08-01 대개편)
//
//  사용자 지시: "실패하면 다시 1층으로 돌아가는 게 아니라, 한 번 유닛을 고르면
//  성장시켜서 최대 몇 층까지 갈 수 있는지를 시험하는 공간으로 바꿀 것."
//
//  예전(`js/towerrun.js`)은 "도전(run)" 하나가 단위였다 — 지면 그 도전이 통째로
//  사라지고 처음부터 다시 골랐다(로그라이크). 지금은 **캐릭터 하나**가 단위다 —
//  한 번 영웅을 고르면 그 캐릭터는 영구히 저장되고, 이기든 지든 성장은 남는다.
//  캐릭터를 지워야만 처음부터 다시 시작한다(요청 4번).
//
//  ⚠ **`js/towerrun.js`는 손대지 않는다.** `js/arenabuild.js`(대전)가
//    `TowerRun.STATS`/`statDef`/`costOf` 를 그대로 참조한다(그 파일 자체 주석:
//    "가격표를 복제하지 않는 것이 중요하다 — 복제하면 탑과 대전의 강화 가격이
//    조용히 갈라진다"). 이 파일은 그 스키마를 안 건드리고 **완전히 새 저장소**를
//    쓴다 — 그래서 대전·수성의 탑은 이 개편과 무관하게 그대로 동작한다.
//
//  ⚠ 아이템도 마찬가지로 `GAME.ITEMS`(대전·수성탑 공용)를 안 건드리고
//    `GAME.TowerShopItems`(신규, 물약 없음)를 따로 쓴다.
// ============================================================================
GAME.TowerChar = {
  KEY: 'asymgame.towerchar.v1',

  // ── 스탯 가격표 — TowerRun.STATS 와 **완전히 독립**이다(공유하지 않는다). ──
  //  영구 진행이라 수십 번 등반을 반복하는 것을 전제로 커브를 다시 짰다.
  //  `luck`(행운)은 5번째 축 — 골드 획득 배수 + 치유 구역 등장 확률을 같이 올린다
  //  (js/healzone.js 의 `luckHealMul`, 아래 `luckGoldMul` 참조).
  STAT_DEFS: [
    { key: 'damage', name: '공격력',   add: 2,  cost: 8,  step: 3, max: 60 },
    { key: 'hp',     name: '체력',     add: 45, cost: 8,  step: 3, max: 60 },
    { key: 'armor',  name: '방어력',   add: 3,  cost: 9,  step: 4, max: 50 },
    { key: 'speed',  name: '이동속도', add: 5,  cost: 9,  step: 4, max: 40 },
    { key: 'luck',   name: '행운',     add: 1,  cost: 14, step: 6, max: 30 }
  ],

  // 아이템 판매 환급률 (요청 14: "되팔면 70% 가격으로")
  SELL_RATE: 0.70,

  statDef: function (key) {
    for (var i = 0; i < this.STAT_DEFS.length; i++) if (this.STAT_DEFS[i].key === key) return this.STAT_DEFS[i];
    return null;
  },
  costOf: function (key, level) {
    var d = this.statDef(key);
    if (!d) return Infinity;
    return d.cost + d.step * (level || 0);
  },

  _all: function () { return GAME.Store.get(this.KEY, {}); },
  _key: function () { return GAME.Account.current() || 'guest'; },
  _save: function (rec) {
    var all = this._all();
    all[this._key()] = rec;
    GAME.Store.set(this.KEY, all);
  },

  exists: function () { return !!this._all()[this._key()]; },

  // 저장된 게 없으면 null(진행 중인 도전이 없으면 null 인 TowerRun.get() 과 같은 규율).
  get: function () {
    var rec = this._all()[this._key()];
    if (!rec) return null;
    // 방어적 채움 — 스키마가 늘어도(구버전 캐릭터) 죽지 않게.
    if (!rec.stats) rec.stats = {};
    for (var i = 0; i < this.STAT_DEFS.length; i++) {
      var k = this.STAT_DEFS[i].key;
      if (typeof rec.stats[k] !== 'number') rec.stats[k] = 0;
    }
    if (!rec.items) rec.items = { weapon: null, armor: null, boots: null, accessory: null };
    if (!rec.ownedSkills) rec.ownedSkills = { Q: [0], W: [0], E: [0], R: [0] };
    if (!rec.picks) rec.picks = { Q: 0, W: 0, E: 0, R: 0 };
    if (typeof rec.gold !== 'number') rec.gold = 0;
    if (typeof rec.climbSeed !== 'number') rec.climbSeed = this._rollSeed();
    return rec;
  },

  _rollSeed: function () { return Math.floor(Math.random() * 0x7fffffff) || 1; },

  // 캐릭터 생성 — **딱 한 번**, 영웅만 고른다(아이템·스킬 선택 없음, 요청 2번).
  // 기본 스킬(슬롯당 0번)은 자동으로 내장되어 있다(요청 6번: "기본 스킬만 남기고").
  create: function (heroKey) {
    var rec = {
      heroKey: heroKey,
      gold: 0,
      stats: { damage: 0, hp: 0, armor: 0, speed: 0, luck: 0 },
      items: { weapon: null, armor: null, boots: null, accessory: null },
      ownedSkills: { Q: [0], W: [0], E: [0], R: [0] },
      picks: { Q: 0, W: 0, E: 0, R: 0 },
      climbSeed: this._rollSeed()
    };
    this._save(rec);
    return rec;
  },

  // 캐릭터 삭제 — 요청 4번: "캐릭터를 삭제하고 다시 1층부터 진행할 수 있다."
  // ⚠ `GAME.Tower`(층·최고기록·랭킹)는 **여기서 지우지 않는다** — `best` 는 랭킹
  //   점수의 근거라 캐릭터가 바뀌어도 계정의 영구 기록으로 남아야 한다. 현재 층만
  //   1로 되돌린다(호출부가 `GAME.Tower.resetFloor()` 를 같이 부른다).
  remove: function () {
    var all = this._all();
    delete all[this._key()];
    GAME.Store.set(this.KEY, all);
  },

  // 도전(등반 시도)마다 층 배치를 새로 섞는다. 캐릭터가 영구화되면서 `climbSeed` 를
  // 고정해 두면 "이 캐릭터에게 7층은 평생 같은 배치"가 되어 CLAUDE.md 가 이미
  // 경고한 실패 모드(층 번호만으로 배치를 외운다)로 되돌아간다. 그래서 도전을
  // 시작할 때마다(허브 화면 진입 시) 다시 굴린다 — 같은 층도 매번 다른 배치가 된다.
  rollClimbSeed: function () {
    var rec = this.get();
    if (!rec) return null;
    rec.climbSeed = this._rollSeed();
    this._save(rec);
    return rec;
  },

  // ── 골드 ──────────────────────────────────────────────────────────────
  addGold: function (amount) {
    var rec = this.get();
    if (!rec || !amount) return rec;
    rec.gold += Math.round(amount);
    this._save(rec);
    return rec;
  },

  // ── 스탯 레벨업 ───────────────────────────────────────────────────────
  levelUp: function (key) {
    var rec = this.get();
    var d = this.statDef(key);
    if (!rec || !d) return null;
    var lv = rec.stats[key] || 0;
    if (lv >= d.max) return null;
    var cost = this.costOf(key, lv);
    if (rec.gold < cost) return null;
    rec.gold -= cost;
    rec.stats[key] = lv + 1;
    this._save(rec);
    return rec;
  },

  // 전투 시작 때 영웅에게 더할 보정. luck 은 hero.def 에 얹는 스탯이 아니라
  // 골드·치유구역 확률의 배수로 쓰이므로 여기 반환값에는 안 담는다(아래 luckLevel 참조).
  statBonus: function (rec) {
    rec = rec || this.get();
    var out = { damage: 0, hp: 0, armor: 0, speed: 0 };
    if (!rec) return out;
    for (var i = 0; i < this.STAT_DEFS.length; i++) {
      var d = this.STAT_DEFS[i];
      if (d.key === 'luck') continue;
      out[d.key] = d.add * (rec.stats[d.key] || 0);
    }
    return out;
  },

  // 능력치의 행운 레벨 + 장신구의 luckAdd 를 합친다. 장비도 행운을 줄 수 있으므로
  // 스탯만 읽으면 장신구로 얻은 행운이 골드·치유구역 확률에 반영되지 않는다.
  luckLevel: function (rec) {
    rec = rec || this.get();
    if (!rec) return 0;
    var lv = (rec.stats && rec.stats.luck) || 0;
    return lv + (this.itemBonus(rec).luck || 0);
  },

  // 행운 1레벨당 골드 +2%. 상한 30레벨 = +60%.
  luckGoldMul: function (rec) {
    return 1 + this.luckLevel(rec) * 0.02;
  },
  // 행운 1레벨당 치유 구역 등장 확률 +3%(배수). js/healzone.js 가 곱해 쓴다.
  luckHealMul: function (rec) {
    return 1 + this.luckLevel(rec) * 0.03;
  },

  // ── 아이템 (탑 전용 확장 카탈로그 — js/towershopitems.js) ────────────────
  //  ⚠ **판매가 구매에 이미 녹아 있다.** 슬롯을 교체하면 옛 아이템은 자동으로
  //    70% 가격에 팔리고 그 값이 새 아이템 값에서 빠진다 — "차액만 낸다"던
  //    예전(`TowerRun.buyItem`) 방식의 페널티 버전이다. 빈 슬롯에서 그냥 팔기만
  //    하고 싶으면 `sellItem` 을 쓴다.
  buyItem: function (slotKey, itemKey) {
    var rec = this.get();
    var CAT = GAME.TowerShopItems;
    if (!rec || !CAT) return null;
    var it = CAT.find(slotKey, itemKey);
    if (!it) return null;
    var cur = rec.items[slotKey] ? CAT.find(slotKey, rec.items[slotKey]) : null;
    var credit = cur ? Math.floor(cur.cost * this.SELL_RATE) : 0;
    var price = Math.max(0, it.cost - credit);
    if (rec.gold < price) return null;
    rec.gold -= price;
    rec.items[slotKey] = itemKey;
    this._save(rec);
    return rec;
  },

  sellItem: function (slotKey) {
    var rec = this.get();
    var CAT = GAME.TowerShopItems;
    if (!rec || !CAT) return null;
    var cur = rec.items[slotKey] ? CAT.find(slotKey, rec.items[slotKey]) : null;
    if (!cur) return null;
    rec.gold += Math.floor(cur.cost * this.SELL_RATE);
    rec.items[slotKey] = null;
    this._save(rec);
    return rec;
  },

  // 장착 아이템을 실제 전투 스탯 보정으로 — GAME.Items.applyTo 와 같은 필드 이름을
  // 쓰되(공유 파싱 로직은 없다 — 카탈로그가 별개다), 카탈로그를 직접 순회한다.
  itemBonus: function (rec) {
    rec = rec || this.get();
    var out = { hp: 0, armor: 0, damage: 0, speed: 0, lifesteal: 0, cdrMul: 1, luck: 0 };
    if (!rec || !GAME.TowerShopItems) return out;
    var slots = GAME.TowerShopItems.SLOTS;
    for (var i = 0; i < slots.length; i++) {
      var sk = slots[i].key;
      var it = rec.items[sk] ? GAME.TowerShopItems.find(sk, rec.items[sk]) : null;
      if (!it) continue;
      if (it.hpAdd) out.hp += it.hpAdd;
      if (it.armorAdd) out.armor += it.armorAdd;
      if (it.damageAdd) out.damage += it.damageAdd;
      if (it.speedAdd) out.speed += it.speedAdd;
      if (it.lifestealAdd) out.lifesteal += it.lifestealAdd;
      if (it.cdrMul) out.cdrMul *= it.cdrMul;
      if (it.luckAdd) out.luck += it.luckAdd;
    }
    return out;
  },

  // ── 스킬 (요청 6·9·10: 기본 1개 내장 + 나머지 상점 구매, 구매한 것만 장착) ──
  ownsSkill: function (slot, idx, rec) {
    rec = rec || this.get();
    if (!rec) return false;
    var list = rec.ownedSkills[slot] || [];
    return list.indexOf(idx) >= 0;
  },

  skillCost: function (slot, idx) {
    var rec = this.get();
    if (!rec) return Infinity;
    var h = GAME.HEROES[rec.heroKey];
    var opt = h && h.skillOptions[slot] && h.skillOptions[slot][idx];
    return opt ? (opt.cost || 0) : Infinity;
  },

  buySkill: function (slot, idx) {
    var rec = this.get();
    if (!rec) return null;
    if (this.ownsSkill(slot, idx, rec)) return null;
    var cost = this.skillCost(slot, idx);
    if (!isFinite(cost) || rec.gold < cost) return null;
    rec.gold -= cost;
    rec.ownedSkills[slot] = (rec.ownedSkills[slot] || [0]).concat([idx]);
    this._save(rec);
    return rec;
  },

  // 보유한 스킬만 장착할 수 있다(요청 10: "구매하지 않은 스킬은 미리볼 순 있지만
  // 장착할 순 없게"). 무료 — 장비 교체와 달리 골드가 안 든다.
  equipSkill: function (slot, idx) {
    var rec = this.get();
    if (!rec || !this.ownsSkill(slot, idx, rec)) return null;
    rec.picks[slot] = idx;
    this._save(rec);
    return rec;
  }
};
