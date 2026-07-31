window.GAME = window.GAME || {};

// ============================================================================
//  대전 빌드 — **하나의 예산(GAME.Arena.BUDGET)으로 전부 산다.**
//
//  2026-07-30 사용자 지시로 대전이 재설계됐다:
//    · 참여할 때 컨트롤러/전략가를 고른다
//    · 양쪽 예산을 같게 고정한다
//    · 수성의 탑의 **유닛 등급**을 대전으로 가져온다(전략가 쪽)
//
//  2026-08-01 — 통곡의 탑의 아이템·스킬 화면을 그대로 쓰게 바꿨다(아래 절 참조).
//  이때 **능력치 강화는 걷어냈다**(사용자 지시). 그래서 옛 머리말에 있던
//  "TowerRun 가격표를 빌려 쓴다"는 설명도 함께 사라졌다 — 이제 빌려 쓰는 가격표는
//  `UnitLevel.COST`(유닛 등급) 하나뿐이다.
//
//  ⚠ 유닛 등급은 원래 **자기 통화**(수성의 탑 골드)를 쓴다. 대전에는 그런 통화가 없고
//    예산 하나뿐이라 `UnitLevel.levelUp` 을 그대로 부르면 없는 지갑에서 돈을 빼려다
//    조용히 실패한다. 그래서 **가격표만 빌려 쓰고** 지불은 예산으로 한다.
//    가격표를 복제하지 않는 것이 중요하다 — 복제하면 두 모드의 등급 가격이 갈라진다.
//
//  기록은 계정별 하나다. 대전 배치도가 id 당 하나인 것과 짝이 맞는다.
// ============================================================================
GAME.ArenaBuild = {
  KEY: 'asymgame.arenabuild.v1',

  _key: function () { return GAME.Account.current() || 'guest'; },
  _all: function () { return GAME.Store.get(this.KEY, {}); },
  _save: function (rec) {
    var all = this._all();
    all[this._key()] = rec;
    GAME.Store.set(this.KEY, all);
  },

  // ── 2026-08-01 개편 — 대전이 통곡의 탑의 아이템·스킬 화면을 그대로 쓴다 ──────
  //  사용자 지시: "대전도 통곡의 탑에서 업데이트한 아이템UI와 스킬, 전투화면은 모두
  //  가져가야 해. 안 가져오는 건 단 둘 — 모든 스킬은 유사한 밸런스를 가진다,
  //  능력치 업그레이드 기능은 없다."
  //
  //  바뀐 것
  //   · 아이템 카탈로그를 `GAME.TowerShopItems`(4슬롯 × 8단계)로 교체.
  //     **물약 슬롯은 사라지고 장신구가 들어온다**(사용자 확인).
  //   · **능력치 강화 제거.** `stats`/`buyStat`/`sellStat`/`statBonus` 를 걷어냈다.
  //   · 예산을 올렸다(js/arena.js 의 `BUDGET`) — 8단계 아이템은 최고가가 360 이라
  //     300 예산으로는 한 칸도 최상급을 못 채운다.
  //
  //  ⚠ `GAME.ITEMS`(3단계 + 물약)는 **그대로 둔다.** 일반 대전(Select→Draft)과
  //    수성의 탑 AI 자동구매가 계속 쓴다. 대전만 참조를 갈아탄 것이다.
  //  ⚠ 스킬 가격 배수(`GAME.scaleSkillsByPrice`)는 **탑에서만** 걸린다. 대전은 그
  //    함수를 부르지 않으므로 모든 스킬이 표에 적힌 값 그대로다(= 유사 밸런스).
  ITEM_SLOTS: function () {
    return (GAME.TowerShopItems && GAME.TowerShopItems.SLOTS) || [];
  },
  findItem: function (slotKey, itemKey) {
    return GAME.TowerShopItems ? GAME.TowerShopItems.find(slotKey, itemKey) : null;
  },

  DEFAULT: function () {
    return {
      role: null,                                   // 'controller' | 'strategist'
      heroKey: GAME.HERO_ORDER ? GAME.HERO_ORDER[0] : 'vanguard',
      items: { weapon: null, armor: null, boots: null, accessory: null },
      picks: GAME.defaultSkillPicks ? GAME.defaultSkillPicks() : { Q: 0, W: 0, E: 0, R: 0 },
      unitLv: {}                                          // 수성의 탑식 유닛 등급
    };
  },

  get: function () {
    var rec = this._all()[this._key()];
    if (!rec) return this.DEFAULT();
    var def = this.DEFAULT();
    if (!rec.items) rec.items = def.items;
    if (!rec.picks) rec.picks = def.picks;
    if (!rec.unitLv) rec.unitLv = {};
    // 옛 기록 정리 — 물약 슬롯과 능력치는 더 이상 존재하지 않는다.
    // 남겨 두면 `heroSpent` 가 없는 카탈로그를 뒤지다 값을 0 으로 세고,
    // 화면의 '남은 예산'이 실제와 어긋난다.
    if (rec.items.potion !== undefined) delete rec.items.potion;
    if (rec.items.accessory === undefined) rec.items.accessory = null;
    if (rec.stats) delete rec.stats;
    return rec;
  },

  setRole: function (role) {
    var rec = this.get();
    rec.role = role;
    this._save(rec);
    return rec;
  },

  // ── 지출 ────────────────────────────────────────────────────────────────
  // 컨트롤러: 영웅 + 아이템 + 능력치 강화
  // 전략가  : 유닛 + 유닛 등급
  // 역할이 다르면 쓰는 항목이 다르지만 **예산 상한은 같다**(GAME.Arena.BUDGET).
  //
  // `statCost`/`statsSpent` 는 **제거했다**(2026-08-01) — 능력치 강화가 없어졌다.
  // 죽은 채로 두면 "대전에도 능력치가 있나"로 읽히고, 지워진 함수를 부르다 터진다.

  // 유닛 등급 가격도 UnitLevel.COST 를 그대로 쓴다.
  unitLvCost: function (lv) {
    var C = (GAME.UnitLevel && GAME.UnitLevel.COST) || [];
    return C[lv] === undefined ? Infinity : C[lv];
  },

  unitLvSpent: function (rec) {
    rec = rec || this.get();
    var t = 0;
    for (var k in rec.unitLv) {
      var lv = rec.unitLv[k] || 1;
      for (var l = 2; l <= lv; l++) t += this.unitLvCost(l);
    }
    return t;
  },

  // 컨트롤러 쪽 지출 — 영웅 + 아이템(탑 카탈로그).
  heroSpent: function (rec) {
    rec = rec || this.get();
    var t = (typeof GAME.HERO_BASE_COST === 'number') ? GAME.HERO_BASE_COST : 78;
    var slots = this.ITEM_SLOTS();
    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i].key;
      var key = rec.items[slot];
      if (!key) continue;
      var it = this.findItem(slot, key);
      if (it) t += it.cost;
    }
    return t;
  },

  // 아이템 착용/해제 — 예산을 넘기면 안 된다. 탑과 달리 **환급 개념이 없다**
  // (대전은 한 판 준비이고 통화가 아니라 예산이라, 되팔기가 아니라 '벗기'다).
  equipItem: function (slotKey, itemKey) {
    var rec = this.get();
    var it = this.findItem(slotKey, itemKey);
    if (!it) return null;
    var prev = rec.items[slotKey];
    rec.items[slotKey] = itemKey;
    if (this.spent(rec) > GAME.Arena.BUDGET) { rec.items[slotKey] = prev; return null; }
    this._save(rec);
    return this.left(rec);
  },

  unequipItem: function (slotKey) {
    var rec = this.get();
    if (!rec.items[slotKey]) return null;
    rec.items[slotKey] = null;
    this._save(rec);
    return this.left(rec);
  },

  // 아이템이 실제 전투 스탯으로 — 탑의 `TowerChar.itemBonus` 와 **같은 규칙**이다.
  // 두 곳이 갈라지면 같은 아이템이 모드마다 다른 값이 된다.
  itemBonus: function (rec) {
    rec = rec || this.get();
    var out = { hp: 0, armor: 0, damage: 0, speed: 0, lifesteal: 0, cdrMul: 1, luck: 0 };
    var slots = this.ITEM_SLOTS();
    for (var i = 0; i < slots.length; i++) {
      var it = rec.items[slots[i].key] ? this.findItem(slots[i].key, rec.items[slots[i].key]) : null;
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

  // ── 배치판에 놓인 유닛 총액 ───────────────────────────────────────────────
  // ⚠ **이 값이 없어서 버그가 났다** (2026-07-30 신고: "쇠뇌 진지 업그레이드를 누르니
  //   유닛이 사라지고 돈은 안 써지고 버튼도 안 사라진다").
  //   놓인 유닛은 `BuildScene.placed` 에 있고 이 모듈은 그걸 몰랐다. 그래서
  //   `left()` 가 "300 − 등급값" 을 내놓아 **판이 가득 찼는데도 구매가 통과**했고,
  //   구매로 배치 예산이 줄면 `_trimToBudget` 이 **맨 뒤 유닛을 뽑아버렸다**
  //   (고른 유닛이 아니라서 버튼은 그대로 남고, 사라진 유닛 값이 환원돼 돈이 안 준 듯 보였다).
  //   전략가 예산은 '유닛 + 등급'이 한 주머니이므로 여기서 **같이 세야 한다.**
  // 저장하지 않는다(화면 상태다) — 씬이 매번 알려준다.
  _placedCost: 0,
  setPlacedCost: function (n) { this._placedCost = Math.max(0, n || 0); },

  // 전체 지출(역할에 따라 세는 항목이 다르다)
  spent: function (rec) {
    rec = rec || this.get();
    if (rec.role === 'strategist') return this.unitLvSpent(rec) + this._placedCost;
    return this.heroSpent(rec);          // 능력치 강화 제거(2026-08-01) — 아이템뿐이다
  },

  left: function (rec) {
    return GAME.Arena.BUDGET - this.spent(rec);
  },

  // ── 구매 ────────────────────────────────────────────────────────────────
  // 성공하면 남은 예산, 실패하면 null. **예산을 넘기면 사지 않는다** —
  // 여기서 막지 않으면 화면의 '남은 예산'이 음수가 되어 거짓말이 된다.
  // `buyStat`/`sellStat` 은 **제거했다**(2026-08-01 사용자 지시: "능력치 업그레이드
  // 기능은 없다"). 대전에서 강해지는 길은 아이템 하나뿐이다.

  buyUnitLv: function (typeKey) {
    var rec = this.get();
    var MAXL = (GAME.UnitLevel && GAME.UnitLevel.MAX) || 5;
    var lv = rec.unitLv[typeKey] || 1;
    if (lv >= MAXL) return null;
    if (this.unitLvCost(lv + 1) > this.left(rec)) return null;
    rec.unitLv[typeKey] = lv + 1;
    this._save(rec);
    return this.left(rec);
  },

  sellUnitLv: function (typeKey) {
    var rec = this.get();
    var lv = rec.unitLv[typeKey] || 1;
    if (lv <= 1) return null;
    rec.unitLv[typeKey] = lv - 1;
    if (rec.unitLv[typeKey] <= 1) delete rec.unitLv[typeKey];
    this._save(rec);
    return this.left(rec);
  },

  setHero: function (heroKey, items, picks) {
    var rec = this.get();
    if (heroKey) rec.heroKey = heroKey;
    if (items) rec.items = items;
    if (picks) rec.picks = picks;
    this._save(rec);
    return rec;
  },

  // `statBonus` 는 **제거했다** — 대전에 능력치 강화가 없으므로 더할 것이 없다.
  // (js/scenes/battle.js 의 versus 블록도 같이 걷어냈다. 남겨 두면 0 을 더하는
  //  죽은 코드가 되어 "대전에도 능력치가 있나" 하는 오해를 남긴다.)

  // ── 강화 패널(openUpgrades)은 **제거했다** (2026-08-01) ─────────────────────
  //  능력치 강화가 사라져 'stats' 갈래가 죽었고, 전략가의 유닛 등급은
  //  js/scenes/build.js 가 unitLvCost/unitLvSpent 를 직접 써서 자기 화면에 그린다.
  //  즉 이 함수를 부르는 곳이 한 곳도 없다 — 남겨 두면 지워진 buyStat 을 부르는
  //  시한폭탄이 된다.

  reset: function () {
    var all = this._all();
    delete all[this._key()];
    GAME.Store.set(this.KEY, all);
  }
};
