window.GAME = window.GAME || {};

// ============================================================================
//  대전 빌드 — **하나의 예산(300)으로 전부 산다.**
//
//  2026-07-30 사용자 지시로 대전이 재설계됐다:
//    · 참여할 때 컨트롤러/전략가를 고른다
//    · 양쪽 예산을 300 으로 고정한다
//    · 통곡의 탑의 **능력치 강화**와 수성의 탑의 **유닛 등급**을 대전으로 가져온다
//
//  ⚠ 두 강화 시스템은 원래 **각자의 통화**를 쓴다 —
//    `TowerRun.levelUp` 은 도전 골드를, `UnitLevel.levelUp` 은 수성의 탑 골드를 깎는다.
//    대전에는 그런 통화가 없고 예산 하나뿐이라, 그 함수들을 그대로 부르면
//    **없는 지갑에서 돈을 빼려다 조용히 실패한다**(둘 다 실패 시 null 을 반환할 뿐이다).
//    그래서 여기서는 두 시스템의 **가격표만 빌려 쓰고** 지불은 예산으로 한다.
//    가격표를 복제하지 않는 것이 중요하다 — 복제하면 탑과 대전의 강화 가격이
//    조용히 갈라진다(이 저장소에서 이미 여러 번 겪은 유형).
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

  DEFAULT: function () {
    return {
      role: null,                                   // 'controller' | 'strategist'
      heroKey: GAME.HERO_ORDER ? GAME.HERO_ORDER[0] : 'vanguard',
      items: { weapon: null, armor: null, boots: null, potion: null },
      picks: GAME.defaultSkillPicks ? GAME.defaultSkillPicks() : { Q: 0, W: 0, E: 0, R: 0 },
      stats: { damage: 0, hp: 0, armor: 0, speed: 0 },   // 통곡의 탑식 능력치 강화
      unitLv: {}                                          // 수성의 탑식 유닛 등급
    };
  },

  get: function () {
    var rec = this._all()[this._key()];
    if (!rec) return this.DEFAULT();
    var def = this.DEFAULT();
    if (!rec.items) rec.items = def.items;
    if (!rec.picks) rec.picks = def.picks;
    if (!rec.stats) rec.stats = def.stats;
    if (!rec.unitLv) rec.unitLv = {};
    for (var k in def.stats) if (typeof rec.stats[k] !== 'number') rec.stats[k] = 0;
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
  // 역할이 다르면 쓰는 항목이 다르지만 **예산 상한은 같다**(둘 다 300).

  statCost: function (key, lv) {
    // 가격표는 TowerRun 것을 그대로 쓴다(복제 금지 — 위 주석 참조).
    var d = GAME.TowerRun && GAME.TowerRun.statDef ? GAME.TowerRun.statDef(key) : null;
    if (!d) return Infinity;
    return d.cost + d.step * lv;
  },

  statsSpent: function (rec) {
    rec = rec || this.get();
    var t = 0;
    var list = (GAME.TowerRun && GAME.TowerRun.STATS) || [];
    for (var i = 0; i < list.length; i++) {
      var lv = rec.stats[list[i].key] || 0;
      for (var j = 0; j < lv; j++) t += this.statCost(list[i].key, j);
    }
    return t;
  },

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

  // 컨트롤러 쪽 지출 — 영웅 + 아이템.
  heroSpent: function (rec) {
    rec = rec || this.get();
    var t = (typeof GAME.HERO_BASE_COST === 'number') ? GAME.HERO_BASE_COST : 78;
    for (var i = 0; i < GAME.ITEM_SLOTS.length; i++) {
      var slot = GAME.ITEM_SLOTS[i].key;
      var key = rec.items[slot];
      if (!key) continue;
      var it = GAME.Items.find(slot, key);
      if (it) t += it.cost;
    }
    return t;
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
    return this.heroSpent(rec) + this.statsSpent(rec);
  },

  left: function (rec) {
    return GAME.Arena.BUDGET - this.spent(rec);
  },

  // ── 구매 ────────────────────────────────────────────────────────────────
  // 성공하면 남은 예산, 실패하면 null. **예산을 넘기면 사지 않는다** —
  // 여기서 막지 않으면 화면의 '남은 예산'이 음수가 되어 거짓말이 된다.
  buyStat: function (key) {
    var rec = this.get();
    var d = GAME.TowerRun && GAME.TowerRun.statDef ? GAME.TowerRun.statDef(key) : null;
    if (!d) return null;
    var lv = rec.stats[key] || 0;
    if (lv >= d.max) return null;
    if (this.statCost(key, lv) > this.left(rec)) return null;
    rec.stats[key] = lv + 1;
    this._save(rec);
    return this.left(rec);
  },

  sellStat: function (key) {
    var rec = this.get();
    var lv = rec.stats[key] || 0;
    if (lv <= 0) return null;
    rec.stats[key] = lv - 1;
    this._save(rec);
    return this.left(rec);
  },

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

  // 능력치 강화가 반영된 보정 — 전투 시작 때 영웅에게 더한다.
  // 계산식은 TowerRun.statBonus 와 **같은 규칙**이어야 한다(add × 레벨).
  statBonus: function (rec) {
    rec = rec || this.get();
    var out = { damage: 0, hp: 0, armor: 0, speed: 0 };
    var list = (GAME.TowerRun && GAME.TowerRun.STATS) || [];
    for (var i = 0; i < list.length; i++) {
      out[list[i].key] = list[i].add * (rec.stats[list[i].key] || 0);
    }
    return out;
  },

  // ── 강화 패널 ────────────────────────────────────────────────────────────
  // 컨트롤러(능력치)와 전략가(유닛 등급)가 **같은 구현**을 쓴다. 두 벌로 만들면
  // 가격 표시·예산 판정이 조용히 갈라진다(이 저장소에서 반복된 사고 유형).
  //   kind: 'stats' | 'units'
  //   unitKeys: 전략가 패널에서 보여줄 유닛 종류(배치에 놓인 것들)
  //   onChange: 산 뒤 화면을 다시 그리라고 알려준다
  openUpgrades: function (scene, kind, unitKeys, onChange) {
    var self = this;
    var rec = this.get();
    var items = [];

    if (kind === 'stats') {
      var list = (GAME.TowerRun && GAME.TowerRun.STATS) || [];
      for (var i = 0; i < list.length; i++) {
        var d = list[i];
        var lv = rec.stats[d.key] || 0;
        var maxed = lv >= d.max;
        var cost = this.statCost(d.key, lv);
        items.push({
          key: d.key,
          name: d.name + '  Lv.' + lv + (maxed ? ' (최대)' : ''),
          note: maxed ? ('+' + d.add * lv)
                      : ('+' + d.add * lv + '  →  다음 ' + cost + '  ·  누르면 구매'),
          cost: maxed ? 0 : cost,
          disabled: maxed || cost > this.left(rec)
        });
      }
    } else {
      var MAXL = (GAME.UnitLevel && GAME.UnitLevel.MAX) || 5;
      var keys = unitKeys || [];
      for (var u = 0; u < keys.length; u++) {
        var tk = keys[u];
        var def = GAME.UNITS[tk];
        if (!def) continue;
        var ul = rec.unitLv[tk] || 1;
        var umax = ul >= MAXL;
        var ucost = this.unitLvCost(ul + 1);
        items.push({
          key: tk,
          name: def.name + '  Lv.' + ul + (umax ? ' (최대)' : ''),
          note: umax ? '더 올릴 수 없습니다'
                     : ('다음 등급 ' + ucost + '  ·  누르면 구매'),
          cost: umax ? 0 : ucost,
          disabled: umax || ucost > this.left(rec)
        });
      }
      if (!items.length) {
        items.push({ key: null, name: '먼저 유닛을 배치하세요',
                     note: '배치한 종류만 등급을 올릴 수 있습니다', cost: 0, disabled: true });
      }
    }

    GAME.Modal.open(scene, {
      title: (kind === 'stats' ? '⚒ 능력치 강화' : '⚒ 유닛 등급') +
             '   —   남은 예산 ' + this.left(rec),
      items: items,
      onPick: function (it) {
        if (!it || !it.key) return;
        var ok = (kind === 'stats') ? self.buyStat(it.key) : self.buyUnitLv(it.key);
        if (ok === null) return;                 // 예산 부족·최대치 — 조용히 무시
        if (onChange) onChange();
        // 산 뒤 값이 바뀌었으니 **다시 연다**(가격·남은 예산이 그대로면 거짓말이 된다)
        self.openUpgrades(scene, kind, unitKeys, onChange);
      }
    });
  },

  reset: function () {
    var all = this._all();
    delete all[this._key()];
    GAME.Store.set(this.KEY, all);
  }
};
