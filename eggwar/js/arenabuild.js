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
    if (this._rtRec) { this._rtRec = rec; return; }   // RT 임시 레코드는 저장 안 한다
    var all = this._all();
    all[this._key()] = rec;
    GAME.Store.set(this.KEY, all);
  },

  // ── 실시간 대전 전용 임시 레코드 (2026-08-24 태현님 ④) ──────────────────────
  //  "영웅 고른 다음 무기·능력치 고르는 과정" 을 복원하되 "초기화된 상태" 약속도
  //  지킨다 — 판마다 DEFAULT 에서 새로 시작하고, localStorage 에 안 남기며(위 _save
  //  게이트), 일반 대전(비동기)의 저장 빌드도 안 건드린다. RtFlow.begin 이 켜고
  //  maybeBattle/abort 가 끈다. 켜져 있는 동안 get() 이 이 레코드만 돌려주므로
  //  TowerShop(mode:'arena') 의 구매·스킬픽이 전부 여기로 쌓인다.
  _rtRec: null,
  rtBegin: function (heroKey) {
    this._rtRec = this.DEFAULT();
    this._rtRec.role = 'controller';
    this._rtRec.rtStats = {};                //  실시간 능력치(이 필드가 있어야 구매 가능)
    if (heroKey) this._rtRec.heroKey = heroKey;
    return this._rtRec;
  },
  rtEnd: function () { this._rtRec = null; },

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
    if (this._rtRec) return this._rtRec;              // RT 준비 중엔 임시 레코드만
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
    t += this.rtStatSpent(rec);              //  실시간 능력치(rtStats 없는 레코드는 0)
    var slots = this.ITEM_SLOTS();
    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i].key;
      var key = rec.items[slot];
      if (!key) continue;
      var it = this.findItem(slot, key);
      if (it) t += GAME.TowerShopItems.vsCostOf(it);
    }
    return t;
  },

  // 아이템 착용/해제 — 예산을 넘기면 안 된다. 탑과 달리 **환급 개념이 없다**
  // (대전은 한 판 준비이고 통화가 아니라 예산이라, 되팔기가 아니라 '벗기'다).
  equipItem: function (slotKey, itemKey) {
    var rec = this.get();
    var it = this.findItem(slotKey, itemKey);
    if (!it) return null;
    //  실시간 준비 중엔 단계 상한 위 아이템은 화면에서 걸러지지만, 여기서도 막는다 —
    //  UI 만 거르면 다른 경로(불러오기 등)로 새는 것이 이 저장소의 반복 패턴이다.
    if (this._rtRec && !this.rtItemAllowed(slotKey, itemKey)) return null;
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

  // ── 실시간 대전 전용 아이템 효과 배율 (2026-08-31 태현님: "방어구만 올리면
  //    피가 안 단다 … 무조작으로 50% 체력차이만 발생하게") ─────────────────────
  //  탑 카탈로그 수치는 못 깎는다(통곡의 탑 밸런스가 그 위에 서 있다). 실시간만
  //  **효과에 배율**을 걸어 격차를 줄인다. 값은 tools/rt-balance-audit.js 실측으로
  //  잡는다 — 여기 숫자를 바꾸면 그 감사를 반드시 다시 돌릴 것.
  //  2026-08-31 실측 채택(무조작 최악 대진 승자 잔여 50%): 3단 상한 + 이 배율에서
  //  warden balanced vs none = 50% 로 기준선에 정확히 닿는다. speed/흡혈/쿨감은
  //  무조작 결투로 잴 수 없는 축이라 1 로 둔다(3단 값 자체가 작다).
  RT_ITEM_EFF: { damage: 0.4, armor: 0.3, hp: 0.15, speed: 1, lifesteal: 1, cdr: 1 },

  //  실시간에서 **살 수 있는 아이템 단계 상한** (2026-08-31). 탑 카탈로그는 지수라
  //  (10단+ 무기 공+13,500 — 기본 28의 480배) 예산 500으로도 영웅이 다른 생물이
  //  된다. 배율로 깎으면 표기와 실효가 갈라지니, 실시간은 저단계만 판다.
  //  값은 tools/rt-balance-audit.js 가 "무조작 체력차 ≤50%" 로 잡는다.
  RT_TIER_MAX: 3,

  //  ── 실시간 능력치 (2026-08-31 태현님: "아이템 3단뿐이면 능력치도") ──────────
  //  탑의 복권형과 달리 **고정 증가치**다 — 드래프트는 예산 500 안에서 계획을
  //  세우는 자리라 뽑기가 끼면 계획이 안 된다(록스텝 결정론에도 맞다).
  //  luck 은 스탯이 아니라 **구슬 드랍률**이다: 1 렙 = 처치 시 5%, 떨어진 구슬은
  //  **그 행운을 올린 쪽(유발자 팀)만** 주울 수 있다(태현님 사양).
  RT_STATS: {
    damage: { name: '공격력',   add: 6,  cost: 45, max: 5, note: '+6 / 렙' },
    hp:     { name: '체력',     add: 45, cost: 45, max: 5, note: '+45 / 렙' },
    armor:  { name: '방어력',   add: 3,  cost: 40, max: 5, note: '+3 / 렙' },
    speed:  { name: '이동속도', add: 6,  cost: 40, max: 3, note: '+6 / 렙' },
    luck:   { name: '행운',     add: 1,  cost: 35, max: 5, note: '처치 시 구슬 +5% / 렙 (내 팀만 습득)' }
  },
  rtStatSpent: function (rec) {
    if (!rec || !rec.rtStats) return 0;
    var t = 0;
    for (var k in rec.rtStats) {
      var d = this.RT_STATS[k];
      if (d) t += d.cost * (rec.rtStats[k] || 0);
    }
    return t;
  },
  buyRtStat: function (key) {
    var rec = this.get();
    if (!rec.rtStats) return null;                 // 실시간 준비 중이 아니다
    var d = this.RT_STATS[key];
    if (!d) return null;
    var lv = rec.rtStats[key] || 0;
    if (lv >= d.max) return null;
    if (this.left(rec) < d.cost) return null;
    rec.rtStats[key] = lv + 1;
    this._save(rec);
    return this.left(rec);
  },
  sellRtStat: function (key) {
    var rec = this.get();
    if (!rec.rtStats || !(rec.rtStats[key] > 0)) return null;
    rec.rtStats[key] -= 1;
    this._save(rec);
    return this.left(rec);
  },
  rtItemAllowed: function (slotKey, itemKey) {
    var list = (GAME.TowerShopItems && GAME.TowerShopItems.CATALOG[slotKey]) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].key === itemKey) return i < this.RT_TIER_MAX;
    }
    return false;
  },

  //  실시간 전투에 아이템을 얹는다 — battle.js(_rtApplyItems)와 감사 도구가 **같은
  //  함수**를 쓴다(두 벌이면 조용히 갈라진다). 결정론: itemBonus 는 items 의 순수 함수.
  applyToHeroRt: function (hu, items) {
    //  단계 상한 위 아이템은 **적용 단계에서도** 거른다 — 상대가 보낸 세팅 스냅샷을
    //  그대로 믿으면 조작된 클라이언트가 지수 아이템을 실어 보낼 수 있다.
    //  양쪽이 같은 규칙으로 거르므로 결정론은 유지된다.
    var safe = {};
    for (var k in (items || {})) {
      if (items[k] && this.rtItemAllowed(k, items[k])) safe[k] = items[k];
    }
    var ib = this.itemBonus({ items: safe });
    var E = this.RT_ITEM_EFF;
    var d = hu.def;
    d.damage += Math.round(ib.damage * E.damage);
    d.armor += Math.round(ib.armor * E.armor);
    d.speed += Math.round(ib.speed * E.speed);
    d.lifesteal = (d.lifesteal || 0) + ib.lifesteal * E.lifesteal;
    hu.cdrMul = (hu.cdrMul || 1) * (1 - (1 - ib.cdrMul) * E.cdr);
    var hp = Math.round(ib.hp * E.hp);
    //  실시간 능력치 — 고정 증가치라 배율 없이 그대로 붙는다(표기 = 실효).
    var st = (arguments.length > 2 && arguments[2]) || null;
    if (st) {
      var R = this.RT_STATS;
      d.damage += R.damage.add * (st.damage || 0);
      d.armor += R.armor.add * (st.armor || 0);
      d.speed += R.speed.add * (st.speed || 0);
      hp += R.hp.add * (st.hp || 0);
      hu.rtLuck = st.luck || 0;              //  구슬 드랍률(처치 시 5%/렙) — combat 이 읽는다
    }
    if (hp) { d.hp += hp; hu.maxHp = d.hp; hu.hp = d.hp; }
    return ib;
  },

  //  실시간 적용 효과 요약 문구 — 화면(RtPrep)이 "산 만큼 실제로 얼마가 붙는가"를
  //  말한다(2026-08-31 태현님: "아이템으로 구매한 능력치가 얼마나 되는지 알아야").
  rtBonusText: function (items, stats) {
    var ib = this.itemBonus({ items: items || {} });
    var E = this.RT_ITEM_EFF;
    var parts = [];
    //  능력치(고정 증가) 합산 — 표기 = 실효
    if (stats) {
      var R = this.RT_STATS;
      for (var sk in stats) {
        if (R[sk] && stats[sk] > 0) {
          if (sk === 'luck') parts.push('행운 ' + stats[sk]);
          else parts.push(R[sk].name.slice(0, 2) + '+' + (R[sk].add * stats[sk]));
        }
      }
    }
    var dmg = Math.round(ib.damage * E.damage);
    var arm = Math.round(ib.armor * E.armor);
    var hp = Math.round(ib.hp * E.hp);
    var spd = Math.round(ib.speed * E.speed);
    if (dmg) parts.push('공+' + dmg);
    if (arm) parts.push('방+' + arm);
    if (hp) parts.push('체+' + hp);
    if (spd) parts.push('이속+' + spd);
    if (ib.lifesteal) parts.push('흡혈+' + Math.round(ib.lifesteal * E.lifesteal * 100) + '%');
    if (ib.cdrMul !== 1) parts.push('쿨감 ' + Math.round((1 - ib.cdrMul) * E.cdr * 100) + '%');
    return parts.join(' · ');
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
