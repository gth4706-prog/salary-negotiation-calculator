window.GAME = window.GAME || {};

// ============================================================================
//  유닛 레벨 1~5 — **수성의 탑 전용 성장축**
// ============================================================================
//  통곡의 탑의 거울이다. 저쪽은 골드로 **영웅의 능력치 레벨**을 올려 더 높이 오르고,
//  이쪽은 골드로 **유닛 종류의 레벨**을 올려 더 오래 막는다.
//
//  왜 '유닛 종류' 단위인가 (기(instance) 단위가 아니라):
//   · 수성의 탑은 매 층 진형을 다시 놓는다(`rec.placed` 를 불러와 고치는 방식).
//     기 단위로 레벨을 매기면 어느 전사가 몇 레벨인지 층마다 다시 짚어야 한다.
//   · 종류 단위면 "내 진형의 주력은 전사다 → 전사를 키운다"는 **배치 전략의 연장**이 된다.
//     사용자 요청 원문도 "특정 유닛의 레벨을 올릴 수 있게" 다.
//
//  ⚠ 능력치 적용은 **`combat.js` 를 고치지 않는다.** `Combat.createUnit` 이 이미 받는
//    `mods = {hp, damage}` 인자로만 넘긴다. 그 이상(사거리·쿨다운·방어력)은 지금 구조로
//    못 준다 — 필요해지면 combat.js 의 mods 처리를 넓혀야 한다(별건).
//
//  ⚠ 저장은 `GAME.DefendTower` 의 도전 기록 안에 둔다(`rec.unitLv`).
//    그래야 **지면(=`DefendTower.fail()`) 레벨도 같이 사라진다.** 영구 성장으로 두면
//    1층이 통째로 무의미해지고, 무배치 기준선(SC-4)도 측정 불가능해진다.
GAME.UnitLevel = {
  MAX: 5,

  // ── 레벨당 배수 ───────────────────────────────────────────────────────────
  //  index = 레벨-1. L1 은 반드시 1.00/1.00 이어야 한다(레벨을 안 올린 사람 = 지금과 동일).
  //  hp 를 damage 보다 조금 더 준다 — 진형의 역할은 '버티며 갉는 것'이라
  //  체력이 늘어야 딜 시간이 늘고, 공격만 올리면 순삭당하는 건 그대로여서 체감이 안 난다.
  //
  //  ⚠ 값은 실측으로 **한 번 크게 깎았다**(`tools/defend-curve.js mode=avg rep=24 lv=`).
  //  처음 잡은 L5(hp×1.62 dmg×1.46)는 **탑을 통째로 무너뜨렸다**:
  //     층      4    8   12   20★  25   30★  35   40★
  //     L1     47%  35%  25%   2%   5%   2%   8%   4%
  //     L5(폐기)70%  70%  60%  35%  52%  22%  49%  24%
  //  35층 8% → 49% 다. 곡선이 40층까지 거의 평평해져 '무한의 탑'이 성립하지 않는다.
  //  (SC-3 영웅 간 편차도 21%p 로 기준 20%p 를 넘겼다.)
  //  → 레벨당 폭을 절반 이하로 줄여 **L5 가 옛 L3 자리에 오도록** 다시 잡았다.
  //     L5(채택) 63%  66%  55%   8%  24%   8%  25%   7%
  //  최고 레벨이 후반 방어율을 2~3배로 올려 "더 깊이 간다"는 보상은 남기되,
  //  곡선은 여전히 63% → 7% 로 떨어진다.
  //
  //  ── 2026-07-29 · **이 표를 더 깎아서 SC-3 을 고치려 하지 마라(실측 실패)** ──────
  //  증상은 다시 나타났다: L1 편차 17%p 인데 **L5 편차 24%p @15층** (SC-3 실패).
  //  "레벨 폭이 크니까 또 줄이면 되겠지"가 자연스러운 반응인데, 실측하면 **틀렸다.**
  //    L5 를 1.29/1.14 로 낮춤 → 15층 편차 24→21%p 로 줄지만 **8층이 27%p 로 터졌다**
  //    L5 를 1.24/1.14 로 낮춤 → 15층 22%p · 8층 23%p (둘 다 실패)
  //  이유: 원형 10종 평균 방어율은 연속량이 아니라 **"열 원형 중 몇 개가 문턱을 넘었나"**
  //  의 개수다(칸당 10%p, 개별 칸은 거의 0% 아니면 100%). 버프를 줄이면 편차가 줄어드는 게
  //  아니라 **다른 층에서 다른 원형이 뒤집힌다.** 편차는 버프 크기의 단조 함수가 아니다.
  //  → 진짜 원인은 영웅 쪽(초당 화력 격차 1.58배)이었고 `js/heroes.js` 에서 고쳤다.
  //    이 표는 그대로 두는 것이 맞다. 자세한 계측은 `heroes.js` 상단 'DPS 체급 통일' 절.
  //
  //  현재 표(L5)의 재측정값 — 2026-07-29, `mode=avg rep=24`, 영웅 DPS 통일 후:
  //     층      4    8   12   20★  25   30★  35   40★
  //     L1     46%  37%  22%   3%   4%   3%   7%   4%
  //     L5     63%  64%  54%   9%  29%   7%  27%   7%
  MODS: [
    { hp: 1.00, damage: 1.00 },
    { hp: 1.07, damage: 1.05 },
    { hp: 1.14, damage: 1.10 },
    { hp: 1.21, damage: 1.15 },
    { hp: 1.29, damage: 1.21 }
  ],

  // ── 다음 레벨 값 ──────────────────────────────────────────────────────────
  //  index = 도달할 레벨. COST[2] = L1→L2 가격.
  //  가파르게 올린다: 한 종류를 L5 까지 올리는 총액 625 골드는
  //  **20층 근처까지 살아남아야 모이는 돈**이다(수성의 탑 골드는 층당 14+2×(층-1)).
  //  L5 가 흔해지면 곡선이 통째로 주저앉는다.
  COST: [0, 0, 45, 90, 170, 320],

  // 증원(배치 예산 추가)의 골드 환율. 1 예산 = 이만큼의 골드.
  //  5 로 잡은 이유: 수성의 탑 예산은 층당 +4 로 오른다(`DefendTower.BUDGET_STEP`).
  //  골드는 **누적**되므로 환율이 낮으면 예산 성장률을 통째로 갈아치운다 —
  //  층당 24골드 ÷ 5 = +4.8 예산/층 이라 기존 성장분과 같은 체급에서 멈춘다.
  BUDGET_RATE: 5,

  // ── 조회 ──────────────────────────────────────────────────────────────────
  _rec: function () {
    return (GAME.DefendTower && GAME.DefendTower.get) ? GAME.DefendTower.get() : null;
  },

  clamp: function (lv) {
    if (typeof lv !== 'number' || !isFinite(lv)) return 1;
    if (lv < 1) return 1;
    if (lv > this.MAX) return this.MAX;
    return Math.floor(lv);
  },

  // 이 유닛 종류의 현재 레벨(1~5). 기록이 없으면 1.
  levelOf: function (typeKey) {
    var rec = this._rec();
    if (!rec || !rec.unitLv) return 1;
    return this.clamp(rec.unitLv[typeKey] || 1);
  },

  // Combat.createUnit 에 그대로 넘길 배수. 레벨 1 이면 {1,1} 이라 아무 것도 안 바뀐다.
  modsForLevel: function (lv) {
    var m = this.MODS[this.clamp(lv) - 1] || this.MODS[0];
    return { hp: m.hp, damage: m.damage };
  },
  modsFor: function (typeKey) { return this.modsForLevel(this.levelOf(typeKey)); },

  // 다음 레벨 가격. 이미 최대면 null.
  costToNext: function (typeKey) {
    var lv = this.levelOf(typeKey);
    if (lv >= this.MAX) return null;
    return this.COST[lv + 1];
  },

  canLevelUp: function (typeKey) {
    var c = this.costToNext(typeKey);
    if (c === null) return false;
    return (GAME.DefendTower.goldOf() >= c);
  },

  // 한 단계 올린다. 성공하면 새 레벨, 실패하면 null.
  levelUp: function (typeKey) {
    if (!GAME.UNITS || !GAME.UNITS[typeKey]) return null;
    var lv = this.levelOf(typeKey);
    if (lv >= this.MAX) return null;
    var cost = this.COST[lv + 1];
    if (!GAME.DefendTower.spendGold(cost)) return null;
    GAME.DefendTower.setUnitLevel(typeKey, lv + 1);
    return lv + 1;
  },

  // ── 전투용 ────────────────────────────────────────────────────────────────
  //  씬에서 `Combat.createUnit(...)` 대신 이걸 부르면 레벨 배수 + 아트용 `def.lv` 가
  //  한 번에 붙는다. **combat.js 를 고치지 않기 위한 얇은 껍데기다.**
  //  레벨 1 이면 `Combat.createUnit` 을 그대로 부른 것과 완전히 동일하다(회귀 위험 0).
  createUnit: function (typeKey, x, y, side) {
    var lv = this.levelOf(typeKey);
    var u = GAME.Combat.createUnit(typeKey, x, y, side, this.modsForLevel(lv));
    if (lv > 1 && u && u.def) {
      // def 는 GAME.UNITS 의 원본일 수 있다(mods 가 1 이면 복사되지 않는다).
      // 여기서는 lv>1 이라 항상 복사본이지만, 원본 오염은 절대 내면 안 되므로 한 번 더 복사한다.
      var d = {}, k;
      for (k in u.def) d[k] = u.def[k];
      d.lv = lv;
      u.def = d;
    }
    return u;
  },

  // 레벨을 **명시로** 받는 변형 — 대전에서 쓴다.
  // `createUnit` 은 레벨을 수성의 탑 기록(`levelOf`)에서 읽으므로 남의 진형에는 못 쓴다.
  // extraMods(탑 층 강화 등)가 있으면 레벨 배수와 **곱한다** — 둘 중 하나만 적용하면
  // 같은 유닛이 모드마다 다른 체급이 된다.
  createUnitAt: function (typeKey, x, y, side, lv, extraMods) {
    lv = this.clamp(lv);
    var m = this.modsForLevel(lv);
    var mods = { hp: m.hp, damage: m.damage };
    if (extraMods) {
      mods.hp *= (extraMods.hp || 1);
      mods.damage *= (extraMods.damage || 1);
    }
    var u = GAME.Combat.createUnit(typeKey, x, y, side, mods);
    if (lv > 1 && u && u.def) {
      // 원본(GAME.UNITS) 오염은 절대 내면 안 된다 — 반드시 사본에 lv 를 적는다.
      var d = {}, k;
      for (k in u.def) d[k] = u.def[k];
      d.lv = lv;
      u.def = d;
    }
    return u;
  },

  // 팔레트·미리보기용 — 레벨이 반영된 def 사본(아트가 `def.lv` 를 읽는다).
  def: function (typeKey) {
    var base = GAME.UNITS[typeKey];
    if (!base) return null;
    var lv = this.levelOf(typeKey);
    if (lv <= 1) return base;
    var m = this.modsForLevel(lv), d = {}, k;
    for (k in base) d[k] = base[k];
    d.hp = Math.round(base.hp * m.hp);
    d.damage = Math.round(base.damage * m.damage);
    d.lv = lv;
    return d;
  },

  // 표시용 — "체력 +29% · 공격 +21%"
  summaryFor: function (lv) {
    var m = this.modsForLevel(lv);
    return '체력 +' + Math.round((m.hp - 1) * 100) + '%  ·  공격 +' + Math.round((m.damage - 1) * 100) + '%';
  },

  // 지금 레벨을 올려둔 종류들 — 상점·결과 화면 표시용
  raised: function () {
    var rec = this._rec(), out = [];
    if (!rec || !rec.unitLv) return out;
    for (var k in rec.unitLv) {
      if (GAME.UNITS[k] && rec.unitLv[k] > 1) out.push({ key: k, lv: this.clamp(rec.unitLv[k]) });
    }
    out.sort(function (a, b) { return b.lv - a.lv; });
    return out;
  },

  // ==========================================================================
  //  AI 전략가용 정예 (통곡의 탑) — **레벨을 예산으로 산다**
  // ==========================================================================
  //  수성의 탑에서는 사람이 '골드'로 유닛 종류의 레벨을 산다. 통곡의 탑에서는
  //  AI 전략가가 **진형 예산 그대로** 산다. 그래야 "많이 vs 강하게"가 진짜 선택이 된다.
  //  공짜로 얹으면 그건 선택이 아니라 그냥 난이도 상승이다 — 요청받은 것이 아니다.
  //
  //  ⚠ 왜 `Combat.createUnit(mods)` 가 아니라 **파생 def** 인가:
  //     mods 는 hp/damage 만 받는다. 사용자 요청 원문이 "**이동속도가 높고** 체력이 높인
  //     전사"라 속도 축이 필요하다. combat.js 는 다른 에이전트가 잡고 있어 못 고치므로,
  //     `GAME.UNITS` 에 파생 정의를 등록하고 진형에는 그 키를 넣는다.
  //     이러면 `GAME.UNITS[u.type]` 로 읽는 **모든 소비자(전투·편성표·비용 계산·아트)가
  //     한 줄도 안 고치고 그대로 동작한다.** `def.lv` 가 붙으므로 eggart 의 레벨 장식도
  //     자동으로 뜬다 — 플레이어가 "저건 강화된 유닛"이라고 알아볼 수 있어야 하니 맞다.
  //     파생 키는 종류 10 × 레벨 5 × 특성 조합으로 상한이 있어 무한히 늘지 않는다.

  // 레벨 프리미엄(기본 비용 대비 추가 배수). **MODS 의 전투가치와 같은 값으로 잡는다.**
  //   L2 1.07×1.05=1.124  L3 1.14×1.10=1.254  L4 1.21×1.15=1.392  L5 1.29×1.21=1.561
  // 할인하면 AI 가 무조건 정예를 뽑아 탑 난이도만 오르고(요청이 아니다),
  // 할증하면 아무도 안 뽑아 이 기능이 죽는다. 가치와 같아야 **어느 쪽이 유리한지를
  // 상대(플레이어)의 성향이 정한다** — 그게 이 기능의 전부다.
  PREMIUM: [0, 0, 0.124, 0.254, 0.392, 0.561],

  // 정예 특성 — 레벨(hp/damage) 밖의 축. 가격은 이득보다 조금 비싸게 잡았다
  // (속도·사거리는 수치 이상의 값을 하므로 등가로 매기면 과해진다).
  TRAITS: {
    // "너무 잘 피하네" 대응 — 붙어서 압박한다
    charge:   { label: '돌격', cost: 0.20, speed: 1.22, aggro: 1.18, chase: 1.15,
                why: '이동속도를 올려 거리를 좁힌다' },
    // "체력이 높인" 대응 — 오래 버틴다
    hardened: { label: '경화', cost: 0.24, hp: 1.12, armorAdd: 6,
                why: '체력·방어를 올려 벽으로 세운다' },
    // 원거리 정예 — 더 멀리서 더 자주
    marksman: { label: '정조준', cost: 0.26, cooldown: 0.88, range: 1.10,
                why: '사거리와 발사 속도를 올린다' }
  },

  _variants: {},

  // 파생 def 를 만들고(한 번만) 그 키를 돌려준다. lv=1 · 특성 없음이면 원본 키 그대로.
  eliteKey: function (baseKey, lv, traits) {
    lv = this.clamp(lv);
    var tl = traits || [];
    var tk = tl.slice().sort().join(',');
    if (lv <= 1 && !tk) return baseKey;
    var base = GAME.UNITS[baseKey];
    if (!base) return baseKey;
    var key = baseKey + '#' + lv + (tk ? '+' + tk : '');
    if (GAME.UNITS[key]) return key;

    var m = this.modsForLevel(lv), d = {}, k, i;
    for (k in base) d[k] = base[k];
    d.key = key;
    d.baseKey = baseKey;
    d.lv = lv;
    d.elite = true;
    d.hp = Math.round(base.hp * m.hp);
    d.damage = Math.round(base.damage * m.damage);

    var prem = this.PREMIUM[lv] || 0;
    var labels = [];
    for (i = 0; i < tl.length; i++) {
      var t = this.TRAITS[tl[i]];
      if (!t) continue;
      prem += t.cost;
      if (t.hp) d.hp = Math.round(d.hp * t.hp);
      if (t.armorAdd) d.armor = (d.armor || 0) + t.armorAdd;
      if (t.speed && d.speed) d.speed = Math.round(d.speed * t.speed);
      if (t.aggro && d.aggro) d.aggro = Math.round(d.aggro * t.aggro);
      if (t.chase && d.chase) d.chase = Math.round(d.chase * t.chase);
      if (t.cooldown && d.cooldown) d.cooldown = Math.round(d.cooldown * t.cooldown);
      // rangeSpan(고정물)은 사거리가 이미 '맵 대각선'이라 곱하면 안 된다.
      if (t.range && d.range && !d.rangeSpan) d.range = Math.round(d.range * t.range);
      labels.push(t.label);
    }
    // 최소 +1 — 단가 10짜리 전사가 반올림으로 공짜 강화가 되면 안 된다.
    d.cost = Math.max(base.cost + 1, Math.round(base.cost * (1 + prem)));
    d.name = base.name + (labels.length ? ' ' + labels.join('') : '') + ' Lv' + lv;

    GAME.UNITS[key] = d;
    this._variants[key] = d;
    return key;
  },

  // 파생 키 → 원본 종류. 소비자(집계·팔레트)가 종류를 세려면 필요하다.
  baseKeyOf: function (typeKey) {
    var d = GAME.UNITS[typeKey];
    return (d && d.baseKey) || typeKey;
  },

  isElite: function (typeKey) {
    var d = GAME.UNITS[typeKey];
    return !!(d && d.elite);
  },

  // 이 조합의 단가(예산 계산용).
  eliteCost: function (baseKey, lv, traits) {
    var k = this.eliteKey(baseKey, lv, traits);
    var d = GAME.UNITS[k];
    return d ? d.cost : 0;
  }
};
