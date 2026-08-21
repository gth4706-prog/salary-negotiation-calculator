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
  //  쿨감 합계 하한 — 이보다 더 줄지 않는다(0.70 = 최대 30% 감소).
  //  궁극기 기본 36초 기준 최소 25.2초가 남는다(사용자 요구: "25초는 넘었어야").
  CDR_FLOOR: 0.70,

  KEY: 'asymgame.towerchar.v1',

  // ── 스탯 가격표 — TowerRun.STATS 와 **완전히 독립**이다(공유하지 않는다). ──
  //  영구 진행이라 수십 번 등반을 반복하는 것을 전제로 커브를 다시 짰다.
  //  `luck`(행운)은 5번째 축 — 골드 획득 배수 + 치유 구역 등장 확률을 같이 올린다
  //  (js/healzone.js 의 `luckHealMul`, 아래 `luckGoldMul` 참조).
  STAT_DEFS: [
    // ⚠ `max` 는 이제 **상한이 아니라 막대의 기준선**이다(2026-08-01 상한 폐지).
    //   구매를 막는 데는 안 쓰이고, 진행 막대의 분모로만 쓴다. 그 선을 넘어서면
    //   `statCeil` 이 분모를 함께 늘려 막대가 꽉 찬 채 멈추지 않게 한다.
    //  `desc` 는 능력치 탭 행의 설명 줄이다(2026-08-22 태현님: 행운 설명 보강 +
    //  공격속도·치명타 신설). 없는 스탯은 굴림 범위를 대신 보여준다.
    { key: 'damage', name: '공격력',   add: 2,  cost: 8,  step: 3, max: 60 },
    { key: 'hp',     name: '체력',     add: 45, cost: 8,  step: 3, max: 60 },
    { key: 'armor',  name: '방어력',   add: 3,  cost: 9,  step: 4, max: 50 },
    { key: 'speed',  name: '이동속도', add: 5,  cost: 9,  step: 4, max: 40 },
    //  공격속도 — **평타 간격**만 줄인다(스킬 쿨은 장신구 cdrMul 축이 따로 있다.
    //  같은 축을 두 곳에서 깎으면 상한(CDR_FLOOR)이 무의미해진다).
    { key: 'atkspeed', name: '공격속도', add: 2, cost: 10, step: 4, max: 40,
      desc: '평타가 빨라진다 — 쌓인 % 만큼 공격 간격이 줄어든다' },
    //  치명타 — 확률은 50%까지, 그 위로는 치명타 피해로 전환(2026-08-22 태현님 설계).
    { key: 'crit',   name: '치명타',   add: 2,  cost: 12, step: 5, max: 50 },
    { key: 'luck',   name: '행운',     add: 1,  cost: 14, step: 6, max: 30,
      desc: '레벨당: 골드 +2% · 회복 구역 등장 +3% · 아이템 드랍 +2.5%' }
  ],

  //  치명타 점수 → 실효값. 기본은 전 유닛 공통 크리(CONFIG 25%·×1.5)이고,
  //  점수는 그 위에 얹힌다: 확률은 **50%에서 멈추고**, 멈춘 뒤 남는 점수는
  //  1점당 치명타 피해 +2%p 로 바뀐다(태현님: "치명타확률은 최대 50%까지이고
  //  그다음부턴 치명타데미지가 늘어나는 방식").
  critOf: function (pts) {
    var baseCh = Math.round((GAME.CONFIG.CRIT_CHANCE || 0.25) * 100);
    var baseMul = GAME.CONFIG.CRIT_MULT || 1.5;
    var ch = Math.min(50, baseCh + (pts || 0));
    var over = Math.max(0, (pts || 0) - (50 - baseCh));
    return { chance: ch, mul: Math.round((baseMul + over * 0.02) * 100) / 100 };
  },

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
    if (typeof rec.pressure !== 'number') rec.pressure = 1;
    //  ── 옛 압박 흉터 치유 (2026-08-03) ──────────────────────────────────────
    //  압박 폭을 1.00~1.60 으로 좁히기 전(0.85~2.40)에 저장된 값이 새 범위 밖에
    //  있을 수 있다. 특히 **하한에 박힌 캐릭터**가 문제다 — 1.4M 짜리 못 깨는
    //  보스에 계속 져서 바닥을 친 저장 데이터가 실제로 있다(사용자 캐릭터).
    //  그대로 두면 고쳐도 한동안 계속 쉬운 보스를 보게 되므로 한 번 되돌린다.
    //  ⚠ 조용히 지우지 않고 범위 안으로 **끌어오기만** 한다 — 잘 하던 사람의
    //    높은 압박까지 1.0 으로 리셋하면 그쪽이 갑자기 쉬워진다.
    if (rec.pressure < this.PRESSURE_MIN) rec.pressure = this.PRESSURE_MIN;
    if (rec.pressure > this.PRESSURE_MAX) rec.pressure = this.PRESSURE_MAX;
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
    // ⚠ **상한이 없다** (2026-08-01 사용자 지시: "능력치 업그레이드는 한계없도록해줘").
    //   예전엔 `lv >= d.max` 에서 막고 화면에 '최대' 를 띄웠다. 무한의 탑에 상한이
    //   있으면 어느 시점부터 골드가 갈 곳을 잃는다 — 층은 끝없이 오르는데 성장만 멈춘다.
    //   대신 **값이 계단으로 오르므로**(costOf = cost + step×lv) 경제가 스스로 제동을
    //   건다. 50레벨이면 공격력 한 칸에 158골드다.
    var cost = this.costOf(key, lv);
    if (rec.gold < cost) return null;
    rec.gold -= cost;
    rec.stats[key] = lv + 1;
    var gain = this.rollGain(key);
    rec.statGain[key] = (rec.statGain[key] || 0) + gain;
    this._save(rec);
    return { rec: rec, gain: gain };
  },

  // ── 이동속도만 되팔 수 있다 (2026-08-03 사용자 지시) ─────────────────────────
  //  > "이동속도는 유일하게 능력치를 클릭해서 되파는 기능을 넣어줘 되파는건 70%금액으로
  //  >  왜냐면 너무빠르면 컨트롤이 어렵네"
  //
  //  다른 능력치는 올려서 손해 볼 일이 없지만 **이동속도는 다르다** — 너무 빠르면
  //  적 사이를 지나쳐 버려 조준·회피가 오히려 어려워진다. 즉 이 축만 유일하게
  //  "되돌리고 싶다"가 성립한다. 그래서 되팔기는 이 한 축에만 연다.
  //  ⚠ 환급률은 아이템과 같은 `SELL_RATE`(70%)를 쓴다 — 두 벌로 두면 조용히 갈라진다.
  SELLABLE_STATS: { speed: true },
  canSellStat: function (key) {
    var rec = this.get();
    return !!(this.SELLABLE_STATS[key] && rec && (rec.stats[key] || 0) > 0);
  },
  //  되팔면 얼마 돌아오는가 — **마지막에 치른 값**의 70%(계단이라 레벨마다 다르다).
  sellStatBack: function (key) {
    var rec = this.get();
    var lv = (rec && rec.stats[key]) || 0;
    if (lv <= 0) return 0;
    return Math.floor(this.costOf(key, lv - 1) * this.SELL_RATE);
  },
  levelDown: function (key) {
    var rec = this.get();
    var d = this.statDef(key);
    if (!rec || !d || !this.SELLABLE_STATS[key]) return null;
    var lv = rec.stats[key] || 0;
    if (lv <= 0) return null;
    //  ⚠ 빼는 양은 **그동안 받은 것의 평균**이다. `rollGain` 이 무작위라 마지막
    //    한 번이 얼마였는지는 어디에도 안 남아 있다. 평균을 빼야 남은 레벨 수와
    //    누적 보정이 계속 맞아떨어진다(고정값을 빼면 몇 번 사고팔 때마다 어긋난다).
    var per = (rec.statGain[key] || 0) / lv;
    var back = this.sellStatBack(key);
    rec.stats[key] = lv - 1;
    rec.statGain[key] = Math.max(0, Math.round((rec.statGain[key] || 0) - per));
    rec.gold += back;
    this._save(rec);
    return { rec: rec, back: back, lost: Math.round(per) };
  },

  // 전투 시작 때 영웅에게 더할 보정. luck 은 hero.def 에 얹는 스탯이 아니라
  // 골드·치유구역 확률의 배수로 쓰이므로 여기 반환값에는 안 담는다(아래 luckLevel 참조).
  // 영웅별 기본 head-start(HERO_BASE, 요청 7번)도 여기서 합산한다 — 상점 레벨업과
  // 같은 반환값에 섞여야 towershop.js 의 스탯바·능력치 탭 총합 표시가 한 곳만 고치면 된다.
  statBonus: function (rec) {
    rec = rec || this.get();
    var out = { damage: 0, hp: 0, armor: 0, speed: 0 };
    //  ⚠ 2026-08-02 — **대전(ArenaBuild) 레코드가 이 함수로 들어온다.**
    //    `towershop.js` 의 `shownSkill` 은 mode 와 무관하게 이걸 부르는데, 대전에는
    //    능력치 강화가 없어서 레코드에 `statGain` 자체가 없다 → `rec.statGain[..]`
    //    에서 TypeError 가 나 **대전 스킬 탭이 통째로 죽었다**(overlap 감사가 잡았다.
    //    사람 눈에는 "탭이 안 열린다"로만 보인다). 능력치가 없는 레코드에는 0 이 맞고,
    //    아래 `HERO_BASE` head-start 도 같이 건너뛰어야 한다 — 그건 탑 전용 축이다.
    if (!rec || !rec.statGain) return out;
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
  //  ⚠ 상한을 없앤 뒤로는 **분모도 같이 자라야 한다.** 안 그러면 기준선을 넘는 순간
  //    막대가 꽉 찬 채로 멈춰서 "더 올려도 아무 일 없다"처럼 보인다(상한이 없다는
  //    사실과 화면이 어긋난다). `current` 를 주면 그 값보다 항상 여유 있는 분모를 준다.
  statCeil: function (key, current) {
    var base = this._statCeilBase(key);
    if (typeof current === 'number' && current > base * 0.92) {
      return Math.max(base, current * 1.22);
    }
    return base;
  },

  _statCeilBase: function (key) {
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
    //  ── 가격은 언제나 **정가**다 (2026-08-22 태현님: "하위 아이템을 산다고 상위
    //  아이템 값이 변하면 안 된다"). 예전엔 `정가 − 낀 것의 70%` 차액을 청구해서,
    //  뭘 끼고 있느냐에 따라 같은 아이템의 표시 가격이 흔들렸다. 지금은 정가를
    //  내고 **낀 것은 70% 에 자동으로 되판다** — 순수지출은 예전과 동일하고,
    //  화면의 가격표만 흔들리지 않게 된다.
    if (rec.gold + credit < it.cost) return null;
    rec.gold = rec.gold - it.cost + credit;
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
      if (it.cdrMul) out.cdrMul *= it.cdrMul;   // 곱연산 — 아래에서 상한을 건다
      if (it.luckAdd) out.luck += it.luckAdd;
    }
    //  ── 쿨감 상한 (2026-08-03 사용자 신고) ────────────────────────────────
    //  "궁극기 쿨은 10초정도였고 … 25초정도는 넘었어야해"
    //  ⚠ 쿨감이 **곱연산**이라 겹치면 폭주한다: 장화 0.48 × 무기 0.90 × 장신구 0.80
    //    = 0.346 → 30초짜리 궁극기가 **10.4초**가 된다(실측, 신고 값과 일치).
    //    개별 아이템은 "-12%" 처럼 온건해 보이는데 곱하면 -65% 가 되는 것이 함정이다.
    //  ⚠ 상한을 여기 한 곳에 둔다. 아이템마다 값을 낮추면 새 아이템이 추가될 때마다
    //    같은 사고가 다시 난다 — 합계에 뚜껑을 씌우는 쪽이 구조적으로 안전하다.
    out.cdrMul = Math.max(GAME.TowerChar.CDR_FLOOR, out.cdrMul);
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

  // ── 압박 계수 — **전투 양상**으로 오르내린다 (2026-08-02 사용자 지시) ──────
  //  "전략 배치하는 쪽에서 … 전투 양상을 비교해서 그에 맞게 올리도록."
  //
  //  `Tower.heroPowerIndex` 가 **장부상의 강함**(능력치+장비)을 재는 축이라면,
  //  이건 **실제로 얼마나 여유로웠나**를 재는 축이다. 둘 다 필요하다 — 장부가
  //  같아도 조작이 좋으면 훨씬 쉽게 이기고, 그 사람에게는 더 눌러야 한다.
  //  이 게임이 이미 쓰던 장치(escalation: 같은 진형을 깰 때마다 강해진다)의
  //  1인칭 판이다.
  //
  //  ⚠ **판정 근거를 승패가 아니라 '남은 체력'으로 잡는다.** 승패만 보면 아슬아슬한
  //    승리와 압도적 승리가 같은 값이 되어, 벽에 부딪힌 사람에게도 계속 올린다.
  //  ⚠ 지면 내린다 — 무한의 탑은 막히면 끝이라, 오르기만 하는 값은 벽을 만든다.
  //  ⚠ 한 판에 최대 ±8% 다. 한 번의 운으로 다음 층이 딴판이 되면 배울 수가 없다.
  //  ── 압박 폭을 좁혔다 (2026-08-03) ────────────────────────────────────────
  //  0.85~2.40 은 **2.8배 스윙**이다. 같은 층이 12초도 되고 34초도 되면 그건
  //  적응이 아니라 복불복이다. 실제로 사고가 났다 — 사용자가 1.4M 짜리 못 깨는
  //  보스에 계속 지면서 압박이 하한에 박혔고(지면 ×0.93, 14번이면 바닥),
  //  그 상태에서 보스를 정상으로 되돌리자 **2.8배 약한 보스**가 나왔다.
  //  "10초만에 1%의 긴장도 없이 끝났다"가 그 결과다.
  //  ⚠ 교훈: 난이도 되먹임은 **왜 졌는지를 모른다.** 버그로 못 깨던 구간이
  //    있으면 그 흉터가 오래 남는다. 그래서 ① 폭을 좁히고 ② 회복을 빠르게 한다.
  PRESSURE_MIN: 1.00,
  PRESSURE_MAX: 1.60,
  notePressure: function (won, hpFrac, secs) {
    var rec = this.get();
    if (!rec) return null;
    var mul;
    //  ⚠ **내려가는 것보다 올라가는 것을 빠르게** 둔다. 연패로 바닥에 박히면
    //    회복이 느릴 때 "쉬운 게임"이 한참 이어진다(위 사고). 반대로 너무 쉬우면
    //    바로 조여야 체감이 유지된다.
    if (!won) mul = 0.96;                                // 완만하게 내린다
    else if (hpFrac >= 0.60 && secs <= 28) mul = 1.14;   // 아주 여유로웠다 → 빨리 조인다
    else if (hpFrac >= 0.35) mul = 1.06;
    else if (hpFrac >= 0.15) mul = 1.00;
    else mul = 0.98;                                     // 이겼지만 간신히
    rec.pressure = Math.max(this.PRESSURE_MIN,
                   Math.min(this.PRESSURE_MAX, (rec.pressure || 1) * mul));
    this._save(rec);
    return rec.pressure;
  },

  // ── 막힌 층은 **그 층만** 조금씩 약해진다 (2026-08-03 사용자 지시) ────────────
  //  > "해당 탑을 못깨면 못깰수록 아주 조금씩 약해지게만들어줘야해"
  //
  //  ⚠ 바로 위 `pressure` 로는 이 요구를 못 채운다 — **하한이 1.00** 이라 고전하는
  //    사람은 거기 붙어 있고 아무리 져도 완화가 **정확히 0** 이다. 잘 이기는 사람만
  //    오르내리는 장치라, 정작 도움이 필요한 쪽에 닿지 않았다. 하한을 1 아래로
  //    내리는 방법도 있지만 그건 **전역**이라 한 층에서 막힌 대가로 그 뒤 층이
  //    통째로 시시해진다. 그래서 층에만 걸리는 별도 축을 둔다.
  //
  //  ⚠ 신선한 캐릭터는 기록이 없으므로 완화가 정확히 1.000 이다 —
  //    `tools/regress.js` 의 R-1(4층 이상 무조작 0%) 기준선이 한 톨도 안 움직인다.
  //  ── 2026-08-05 사용자 지시 ────────────────────────────────────────────────
  //  > (1차) "못깰때마다 10%씩 / 보스전은 5%만"
  //  > (2차) "8%로 변경하고 보스는 5%씩 낮추는걸로 **고정**"
  //
  //  처음 값 4% 는 "아주 조금씩"이라는 말을 그대로 받아 잡은 것인데, 7번을 져도
  //  28% 라 진짜 벽 앞에서는 체감이 거의 없었다.
  //
  //  ⚠ 보스는 **비례가 아니라 고정 5%** 다. 1차 지시 때는 "절반"이라 일반값을
  //    따라다녔지만, 2차에서 고정으로 못박았다 — 일반값을 나중에 또 만져도
  //    보스는 5% 그대로다. 그래서 `RELIEF_STEP / 2` 같은 식으로 쓰지 않는다.
  //  ⚠ 누적은 **곱이 아니라 합**이다(n × step). 곱으로 하면 0 에 점근하면서
  //    "몇 번 지면 얼마나 쉬워지는가"를 사람이 셀 수 없다.
  //  ⚠ 상한이 반드시 필요하다 — 없으면 열몇 번에 적 체력이 0 이 된다. 두 경우 모두
  //    **5회에서 바닥**으로 맞춘다(일반 40% · 보스 25%). 회수를 같게 두면
  //    "다섯 번 지면 최대한 쉬워진다"는 규칙 하나만 기억하면 된다.
  RELIEF_STEP: 0.08,           // 재도전 1회당 8%
  RELIEF_MAX: 0.40,            // 5회에서 바닥
  RELIEF_STEP_BOSS: 0.05,      // 보스는 고정 5%(일반값과 연동하지 않는다)
  RELIEF_MAX_BOSS: 0.25,       // 역시 5회에서 바닥
  noteFloorFail: function (floor) {
    var rec = this.get();
    if (!rec) return;
    var f = rec.floorFail;
    //  층이 바뀌면 처음부터 — 완화는 **지금 막힌 벽**에만 쌓인다.
    if (!f || f.f !== floor) f = { f: floor, n: 0 };
    f.n++;
    rec.floorFail = f;
    this._save(rec);
  },
  clearFloorFail: function (floor) {
    var rec = this.get();
    if (!rec || !rec.floorFail || rec.floorFail.f !== floor) return;
    delete rec.floorFail;               // 깼으면 사라진다(다음 층은 온전한 난이도로)
    this._save(rec);
  },
  //  이 층에 걸리는 한 걸음 크기와 상한. 보스 층은 절반이다.
  //  ⚠ 보스 판정은 `GAME.Tower` 가 쥔다(`BOSS_EVERY`). 여기서 `floor % 10` 을 다시
  //    적으면 주기를 바꿀 때 조용히 갈라진다 — 이 저장소가 가격표에서 이미 겪은 종류다.
  reliefRule: function (floor) {
    var boss = !!(GAME.Tower && GAME.Tower.isBossFloor && GAME.Tower.isBossFloor(floor));
    return boss
      ? { step: this.RELIEF_STEP_BOSS, max: this.RELIEF_MAX_BOSS, boss: true }
      : { step: this.RELIEF_STEP, max: this.RELIEF_MAX, boss: false };
  },
  //  적 체력·공격에 곱할 값(1 이하). 층이 다르거나 기록이 없으면 1.
  reliefFor: function (floor) {
    var rec = this.get();
    var f = rec && rec.floorFail;
    if (!f || f.f !== floor || !(f.n > 0)) return 1;
    var r = this.reliefRule(floor);
    return 1 - Math.min(r.max, f.n * r.step);
  },
  //  화면에 보여 줄 값 — 몇 번 막혔고 몇 % 약해졌는가.
  //  ⚠ `boss`/`atMax` 도 같이 준다. 보스 층은 깎이는 속도가 절반이라, 안 알려 주면
  //    "왜 여기만 덜 쉬워지지"가 되고 완화가 고장 난 것처럼 보인다.
  reliefInfo: function (floor) {
    var rec = this.get();
    var f = rec && rec.floorFail;
    if (!f || f.f !== floor || !(f.n > 0)) return null;
    var r = this.reliefRule(floor);
    return {
      tries: f.n,
      cut: Math.round((1 - this.reliefFor(floor)) * 100),
      boss: r.boss,
      atMax: f.n * r.step >= r.max
    };
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
        var cur = curKey ? CAT.find(sk, curKey) : null;
        var curCost = cur ? cur.cost : -1;
        var list = CAT.CATALOG[sk] || [], best = null, tier = 0;
        for (var j = 0; j < list.length; j++) {
          if (list[j].cost > curCost && (!best || list[j].cost < best.cost)) { best = list[j]; tier = j + 1; }
        }
        if (best) out.push({ kind: 'item', slot: sk, key: best.key, name: best.name, note: best.note,
                             slotName: CAT.SLOTS[i].name, tier: tier, total: list.length,
                             cost: best.cost, prevName: cur ? cur.name : null,
                             gain: this._itemGain(cur, best) });
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
                             note: slot + ' 슬롯 스킬북', cost: pick.cost || 0,
                             desc: GAME.skillDesc ? GAME.skillDesc(pick) : '',
                             prevName: (opts[rec.picks[slot]] || {}).name || null });
      }
    }
    return out;
  },

  //  **무엇이 얼마나 좋아지는가**를 숫자로 만든다. 팝업이 "축하합니다"만 하고
  //  끝나면 받은 사람은 그게 좋은 건지도 모른다 — 사용자 요구의 핵심이 여기다.
  //  ⚠ 카탈로그의 `note` 는 **그 아이템의 절대값**이라 교체분이 아니다.
  //    3단계(공 +24)를 끼고 4단계(공 +60)를 받으면 실제 증가분은 +36 이다.
  _itemGain: function (cur, next) {
    var F = [['damageAdd', '공격력'], ['hpAdd', '체력'], ['armorAdd', '방어력'],
             ['speedAdd', '이동속도'], ['luckAdd', '행운']];
    var out = [], i, d;
    for (i = 0; i < F.length; i++) {
      d = (next[F[i][0]] || 0) - ((cur && cur[F[i][0]]) || 0);
      if (d) out.push(F[i][1] + ' ' + (d > 0 ? '+' : '') + d);
    }
    d = Math.round(((next.lifestealAdd || 0) - ((cur && cur.lifestealAdd) || 0)) * 100);
    if (d) out.push('흡혈 ' + (d > 0 ? '+' : '') + d + '%');
    d = Math.round((((cur && cur.cdrMul) || 1) - (next.cdrMul || 1)) * 100);
    if (d) out.push('스킬 쿨 ' + (d > 0 ? '-' : '+') + Math.abs(d) + '%');
    return out;
  },

  //  후보 하나를 실제로 지급한다(골드 안 든다). 보스·일반 층이 같은 문을 쓴다.
  _grantDrop: function (pick) {
    var rec = this.get();
    if (!rec || !pick) return null;
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

  // 확정 드랍 — 후보에서 무작위 1개를 실제로 지급한다.
  // 줄 게 하나도 없으면(전부 최상급 보유) null 대신 골드로 갈음하도록 호출부가 판단한다.
  grantBossDrop: function () {
    var cands = this.dropCandidates();
    if (!cands.length) return null;
    var pick = cands[Math.floor(Math.random() * cands.length)];
    pick.from = 'boss';
    return this._grantDrop(pick);
  },

  // ── 일반 층 드랍 (2026-08-02 사용자 지시, 2026-08-02 추가 조정) ───────────────
  //  "일반 몹에서도 낮은 확률로 나와야 하고 당연히 갖고 있는 것보다 1단계만 높은 것만."
  //
  //  뒷조건은 이미 `dropCandidates` 가 지키고 있다(슬롯마다 **지금 낀 것보다 비싼 것 중
  //  가장 싼 것** 하나, 스킬은 미보유 중 가장 싼 것 = 잠금이 풀린 다음 칸). 그래서
  //  여기서 새로 정하는 것은 **확률뿐**이다.
  //
  //  처음엔 10% 로 잡았다(보스 확정 1개와 맞먹는 기대치를 노림 — 9개 층 × 10% ≈ 0.9개).
  //  → 사용자 지시로 **3% 로 재조정**: 일반 층에서 너무 잘 나와 상점 구매 동기가
  //  옅어진다는 판단. 9개 층 기대 0.27개로, 이제 "언제 올지 모르는 보너스"가 되고
  //  보스 확정분(9개 층당 1개)이 다시 주된 성장 경로가 된다.
  //  행운은 골드·치유구역과 같은 배수로 여기에도 붙는다 — 행운의 축이 셋이 된다.
  FLOOR_DROP_CHANCE: 0.03,
  luckDropMul: function (rec) { return 1 + this.luckLevel(rec) * 0.025; },

  rollFloorDrop: function () {
    var rec = this.get();
    if (!rec) return null;
    if (Math.random() >= this.FLOOR_DROP_CHANCE * this.luckDropMul(rec)) return null;
    var cands = this.dropCandidates(rec);
    if (!cands.length) return null;
    var pick = cands[Math.floor(Math.random() * cands.length)];
    pick.from = 'floor';
    return this._grantDrop(pick);
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
