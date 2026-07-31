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

  // 영웅별 기본 스탯 head-start (2026-07-31 사용자 지시: "전사는 공격력, 궁수는
  // 이동속도, 파수꾼은 체력과 방어력이 더 있는 상태에서 능력치 업그레이드하게").
  // 상점 레벨업(statGain)과는 별개의 축이다 — 캐릭터를 만드는 순간부터 항상 붙어 있고,
  // 레벨업 보너스는 그 위에 더해진다. `statBonus()` 가 이 값을 합산해 반환한다.
  HERO_BASE: {
    vanguard: { damage: 20 },
    ranger:   { speed: 20 },
    warden:   { hp: 20, armor: 20 }
  },

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
    // statGain — 레벨업으로 실제 얻은 누적치(복권형 랜덤이라 lv × add 와 더 이상 같지 않다).
    // 이 필드가 없는 옛 캐릭터(개편 전)는 예전 확정식(d.add*lv)으로 역산해 채운다 —
    // 그래야 개편 순간 화면에 뜨는 능력치 총합이 갑자기 줄어드는 일이 없다.
    if (!rec.statGain) {
      rec.statGain = {};
      for (var gi = 0; gi < this.STAT_DEFS.length; gi++) {
        var gd = this.STAT_DEFS[gi];
        rec.statGain[gd.key] = gd.add * (rec.stats[gd.key] || 0);
      }
    }
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

  // ── 스탯 레벨업 — 복권형(2026-07-31 사용자 지시: "구매하면 일정 범위만큼 오르는거지
  // 대신 꽝은 없도록") ─────────────────────────────────────────────────
  // 구매 횟수(`rec.stats[key]`)는 그대로 **가격 계단**으로만 쓰고, 실제로 얻는 능력치는
  // `rec.statGain[key]`에 누적한다. `d.add`를 중앙값으로 0.6~1.4배 범위에서 굴리고
  // 반올림 후 최소 1을 보장해 "꽝"(0 증가)이 나오지 않게 한다.
  rollGain: function (key) {
    var d = this.statDef(key);
    if (!d) return 0;
    var roll = d.add * (0.6 + Math.random() * 0.8);
    var val = Math.round(roll);
    return val < 1 ? 1 : val;
  },

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
    var gain = this.rollGain(key);
    rec.statGain[key] = (rec.statGain[key] || 0) + gain;
    this._save(rec);
    return { rec: rec, gain: gain };
  },

  // 전투 시작 때 영웅에게 더할 보정. luck 은 hero.def 에 얹는 스탯이 아니라
  // 골드·치유구역 확률의 배수로 쓰이므로 여기 반환값에는 안 담는다(아래 luckLevel 참조).
  // 영웅별 기본 head-start(HERO_BASE, 요청 7번)도 여기서 합산한다 — 상점 레벨업과
  // 같은 반환값에 섞여야 towershop.js 의 스탯바·능력치 탭 총합 표시가 한 곳만 고치면 된다.
  statBonus: function (rec) {
    rec = rec || this.get();
    var out = { damage: 0, hp: 0, armor: 0, speed: 0 };
    if (!rec) return out;
    for (var i = 0; i < this.STAT_DEFS.length; i++) {
      var d = this.STAT_DEFS[i];
      if (d.key === 'luck') continue;
      out[d.key] = rec.statGain[d.key] || 0;
    }
    var base = this.HERO_BASE[rec.heroKey];
    if (base) {
      for (var k in base) if (out[k] !== undefined) out[k] += base[k];
    }
    return out;
  },

  // 게이지의 분모 — "이 스탯을 끝까지 올리면 얼마인가". 상점 하단 스탯바가 `frac:1`
  // 로 박혀 있어서 **0 인데도 파란 막대가 꽉 차 있었다**(사용자 신고). 막대는 비율을
  // 말해야 하므로 분모가 필요하다.
  //  = 영웅 기본 head-start 최대 + 복권 상한(add×max×1.4) + 슬롯별 최고 아이템 합.
  // 영웅마다 다른 head-start 는 **최대값**을 쓴다 — 분모가 영웅마다 달라지면 같은
  // 수치가 영웅에 따라 다른 길이로 보여 비교가 안 된다.
  statCeil: function (key) {
    if (this._ceil && this._ceil[key] !== undefined) return this._ceil[key];
    if (!this._ceil) this._ceil = {};
    var d = this.statDef(key);
    if (!d) return 1;
    var total = d.add * d.max * 1.4;
    var hb = 0, h;
    for (h in this.HERO_BASE) if (this.HERO_BASE[h][key]) hb = Math.max(hb, this.HERO_BASE[h][key]);
    total += hb;
    var CAT = GAME.TowerShopItems;
    if (CAT) {
      var field = { damage: 'damageAdd', hp: 'hpAdd', armor: 'armorAdd', speed: 'speedAdd', luck: 'luckAdd' }[key];
      for (var i = 0; i < CAT.SLOTS.length; i++) {
        var list = CAT.CATALOG[CAT.SLOTS[i].key] || [], best = 0;
        for (var j = 0; j < list.length; j++) if (list[j][field]) best = Math.max(best, list[j][field]);
        total += best;
      }
    }
    this._ceil[key] = Math.max(1, Math.round(total));
    return this._ceil[key];
  },

  // 복권 결과의 등급 — 사용자 지시: "이번에 오른게 많이오른건지 적게오른건지
  // 쪽박·중박·대박·개대박으로 구분해서 알려줘". 굴림 범위가 add 의 0.6~1.4배이므로
  // 그 안에서의 **상대 위치**로 나눈다(절대 수치로 나누면 스탯마다 기준이 달라진다).
  // 세계관 어휘(계란 부족 전쟁)에 맞춰 도박 용어 대신 '알' 비유로 이름을 붙였다.
  GRADES: [
    { min: 0.00, key: 'dud',   name: '쪽박',   flavor: '작은 알',     color: 0x9a8f7c },
    { min: 0.35, key: 'ok',    name: '중박',   flavor: '여문 알',     color: 0x5aa9e6 },
    { min: 0.70, key: 'good',  name: '대박',   flavor: '황금 알',     color: 0xf0a500 },
    { min: 0.92, key: 'jack',  name: '개대박', flavor: '여명의 알',   color: 0xe8455f }
  ],

  // gain 이 그 스탯의 굴림 범위 어디쯤인지 → 등급. `levelUp` 이 돌려준 gain 을 넣는다.
  gradeOf: function (key, gain) {
    var d = this.statDef(key);
    if (!d) return this.GRADES[0];
    var lo = Math.max(1, Math.round(d.add * 0.6)), hi = Math.round(d.add * 1.4);
    var t = hi > lo ? (gain - lo) / (hi - lo) : 1;
    if (t < 0) t = 0; if (t > 1) t = 1;
    var g = this.GRADES[0];
    for (var i = 0; i < this.GRADES.length; i++) if (t >= this.GRADES[i].min) g = this.GRADES[i];
    return g;
  },

  // 능력치의 행운 누적치 + 장신구의 luckAdd 를 합친다. 장비도 행운을 줄 수 있으므로
  // 스탯만 읽으면 장신구로 얻은 행운이 골드·치유구역 확률에 반영되지 않는다.
  luckLevel: function (rec) {
    rec = rec || this.get();
    if (!rec) return 0;
    var lv = (rec.statGain && rec.statGain.luck) || 0;
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

  // 선행 조건 — **더 싼 스킬을 전부 사야 다음 것을 살 수 있다** (2026-07-31 사용자 지시:
  // "이전 스킬을 구매해야만 다음 스킬을 구매할 수 있게"). 0번(무료 내장)은 항상 열려 있다.
  //
  // ⚠ **배열 순서(idx)가 아니라 가격 순위로 잠근다.** `skillOptions` 의 인덱스는 가격
  //   오름차순이 아니다(광전사 Q 는 0·70·60·90·140 — 2번이 1번보다 싸다). 그렇다고 배열을
  //   가격순으로 재정렬하면 저장된 `picks`/`ownedSkills` 가 **다른 스킬을 가리키게** 되고,
  //   같은 배열을 쓰는 **대전(js/arenabuild.js)의 저장된 조합까지** 조용히 바뀐다.
  //   가격으로 판정하면 인덱스를 한 칸도 안 건드리고 같은 규칙을 얻는다.
  skillLocked: function (slot, idx, rec) {
    rec = rec || this.get();
    if (!rec || idx <= 0) return false;
    var h = GAME.HEROES[rec.heroKey];
    var list = (h && h.skillOptions[slot]) || [];
    var myCost = (list[idx] && list[idx].cost) || 0;
    for (var i = 0; i < list.length; i++) {
      if (i === idx) continue;
      var c = list[i].cost || 0;
      // 더 싼 것(같은 값이면 앞 번호)이 하나라도 미보유면 잠긴다.
      if (c < myCost || (c === myCost && i < idx)) {
        if (!this.ownsSkill(slot, i, rec)) return true;
      }
    }
    return false;
  },

  buySkill: function (slot, idx) {
    var rec = this.get();
    if (!rec) return null;
    if (this.ownsSkill(slot, idx, rec)) return null;
    if (this.skillLocked(slot, idx, rec)) return null;   // 앞 번호부터 사야 한다
    var cost = this.skillCost(slot, idx);
    if (!isFinite(cost) || rec.gold < cost) return null;
    rec.gold -= cost;
    rec.ownedSkills[slot] = (rec.ownedSkills[slot] || [0]).concat([idx]);
    this._markNewSkill(rec, slot, idx);
    this._save(rec);
    return rec;
  },

  // ── 새로 얻은 스킬 표시 (2026-08-01 사용자 지시) ─────────────────────────────
  //  "새로운 스킬을 얻거나 샀을 때는 전투 시작하기 전에 **딱 한 번만** 알려주고,
  //   그다음부턴 장착된 상태를 유지하고 다시 알려줄 필요 없어."
  //
  //  예전엔 도전할 때마다 Q→W→E→R 팝업이 떴다(선택지가 2개 이상인 슬롯 전부).
  //  매번 같은 것을 다시 고르게 하는 것은 선택이 아니라 통행세다.
  //  그래서 **새로 생긴 것이 있을 때만** 그 슬롯 하나를 띄운다.
  _markNewSkill: function (rec, slot, idx) {
    if (!rec.newSkills) rec.newSkills = [];
    rec.newSkills.push({ slot: slot, idx: idx });
  },

  // 알려줄 것이 남았는가 → [{slot, idx}, …] (없으면 빈 배열)
  pendingNewSkills: function (rec) {
    rec = rec || this.get();
    return (rec && rec.newSkills) || [];
  },

  // 알렸다 — 목록을 비운다. 이걸 안 부르면 영원히 다시 뜬다.
  clearNewSkills: function () {
    var rec = this.get();
    if (!rec) return null;
    rec.newSkills = [];
    this._save(rec);
    return rec;
  },

  // ── 보스 처치 보상 (2026-07-31 사용자 지시) ─────────────────────────────
  //  "보스를 깨면 아이템이나 스킬북을 확정적으로 1개 이상 드랍하게 해줘.
  //   당연히 보유하지 않은 걸로."
  //
  //  후보를 만드는 규칙 — 둘 다 "받고 나서 손해가 아닌 것"만 넣는다:
  //   · 아이템: 그 슬롯에서 **지금 낀 것보다 비싼 것 중 가장 싼 것**(= 바로 윗 단계).
  //     아무거나 주면 최상급을 낀 슬롯에 하급이 꽂혀 오히려 약해진다.
  //   · 스킬  : 그 슬롯에서 **미보유 중 가장 싼 것**. 그게 곧 잠금이 풀려 있는 다음
  //     칸이라(위 `skillLocked`) 사다리 규칙을 건너뛰지 않는다.
  dropCandidates: function (rec) {
    rec = rec || this.get();
    var out = [];
    if (!rec) return out;
    var CAT = GAME.TowerShopItems;
    if (CAT) {
      for (var i = 0; i < CAT.SLOTS.length; i++) {
        var sk = CAT.SLOTS[i].key;
        var curKey = rec.items[sk];
        var curCost = curKey ? (CAT.find(sk, curKey) || {}).cost || 0 : -1;
        var list = CAT.CATALOG[sk] || [], best = null;
        for (var j = 0; j < list.length; j++) {
          if (list[j].cost > curCost && (!best || list[j].cost < best.cost)) best = list[j];
        }
        if (best) out.push({ kind: 'item', slot: sk, key: best.key, name: best.name, note: best.note });
      }
    }
    var h = GAME.HEROES[rec.heroKey];
    if (h) {
      for (var s = 0; s < GAME.SKILL_SLOTS.length; s++) {
        var slot = GAME.SKILL_SLOTS[s];
        var opts = h.skillOptions[slot] || [], pick = null, pickIdx = -1;
        for (var k = 0; k < opts.length; k++) {
          if (this.ownsSkill(slot, k, rec)) continue;
          if (!pick || (opts[k].cost || 0) < (pick.cost || 0)) { pick = opts[k]; pickIdx = k; }
        }
        if (pick) out.push({ kind: 'skill', slot: slot, idx: pickIdx, name: pick.name,
                             note: slot + ' 슬롯 스킬북' });
      }
    }
    return out;
  },

  // 확정 드랍 — 후보에서 무작위 1개를 실제로 지급한다(골드 안 든다).
  // 줄 게 하나도 없으면(전부 최상급 보유) null 대신 골드로 갈음하도록 호출부가 판단한다.
  grantBossDrop: function () {
    var rec = this.get();
    if (!rec) return null;
    var cands = this.dropCandidates(rec);
    if (!cands.length) return null;
    var pick = cands[Math.floor(Math.random() * cands.length)];
    if (pick.kind === 'item') {
      // 상점 구매와 달리 **공짜로** 꽂는다(교체 차액도 안 받는다).
      rec.items[pick.slot] = pick.key;
    } else {
      rec.ownedSkills[pick.slot] = (rec.ownedSkills[pick.slot] || [0]).concat([pick.idx]);
      this._markNewSkill(rec, pick.slot, pick.idx);   // 드랍도 '새로 얻은 것'이다
    }
    this._save(rec);
    return pick;
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
