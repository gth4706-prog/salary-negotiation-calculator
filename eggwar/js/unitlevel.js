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
  }
};
