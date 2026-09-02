window.GAME = window.GAME || {};

// 수성의 탑 — **전략가판 통곡의 탑.**
//
// 통곡의 탑이 "영웅 하나로 진형을 몇 층까지 뚫느냐"라면, 이쪽은
// **"진형 하나로 영웅을 몇 번 격파하느냐"** 다. 한 층 = 영웅 하나를 막아내는 것.
//
//   1~3층  연습 구간. 예산이 넉넉해 대충 놓아도 막힌다.
//   4층~   본 구간. 공격 영웅의 예산·스탯이 확 뛰어 **제대로 배치하지 않으면 진다.**
//   10층마다 보스 영웅.
//
// 컨트롤러 탑과 **같은 약속을 거울처럼** 건다:
//   컨트롤러 탑 — 4층부터 '조작' 없이는 못 이긴다
//   수성의 탑   — 4층부터 '배치' 없이는 못 이긴다
// 두 탑의 난이도 곡선이 벌어지면 한쪽만 파게 된다. 수치를 바꿀 때 양쪽을 같이 재라.
GAME.DefendTower = {
  // ── 저장 키 (2026-08-07 · v1 → v2) ────────────────────────────────────────
  //  규칙이 바뀌었으므로(패배해도 유지) 옛 25회차와 새 25회차는 **애초에 다른 값**이다.
  //  ⚠ **v1 을 마이그레이션하지 않는다.** 새 키라 옛 기록이 절대 안 새어 들어온다 —
  //    "갓베론이 들어와도 1회차부터"(사용자 요구)를 보장하는 가장 확실한 방법이다.
  //    v1 에서 가져오는 것은 `legacyBest()` 하나뿐이고 **표시 전용**이다.
  KEY: 'asymgame.deftower.v2',
  LEGACY_KEY: 'asymgame.deftower.v1',

  //  옛 규칙에서 세운 최고 기록. **읽기만 한다** — v2 에 옮겨 적으면 그 순간이 곧
  //  마이그레이션이고, 값이 두 곳에 생겨 갈라진다.
  //  ⚠ 지우면 "내가 25회차까지 갔던 건 어디 갔나"가 되고, 새 기록에 섞으면 거짓이 된다.
  //    남기되 **옛 규칙의 기록**이라고 이름 붙여 보여 준다.
  legacyBest: function () {
    var all = GAME.Store.get(this.LEGACY_KEY, {}) || {};
    var r = all[this._key()];
    return (r && r.best) || 0;
  },

  // ── 전략가(플레이어)가 쓰는 예산 ──
  // 넉넉하게 시작해 천천히 오른다. 이쪽이 빨리 오르면 물량으로만 이기게 된다.
  BASE_BUDGET: 160,
  BUDGET_STEP: 4,

  // ── 공격 영웅(AI)이 쓰는 예산 ──
  // 1~3층은 낮게, 4층에서 점프. 통곡의 탑의 ENTRY_JUMP 와 같은 장치다.
  HERO_BASE: 90,
  HERO_STEP: 6,
  EARLY_FLOORS: 3,
  //  ── 92 → 140 (2026-08-07 · 해금 사다리와 함께 다시 잡았다) ────────────────
  //  해금이 들어오자 초반에 쓸 수 있는 유닛이 4종뿐이 되었는데, **그 넷이 전부
  //  전투용이라 아무렇게나 뿌려도 이겼다** — 무배치 방어율이 4회차 21% → 92% 로
  //  치솟아 "4회차부터 배치 없이는 못 이긴다"는 약속이 날아갔다(실측).
  //  ⚠ 상한 위로는 못 민다. `heroBudgetFor` 가 `maxSpendable()`(253)에서 멈추므로
  //    4회차 raw = 90 + 12 + ENTRY_JUMP 가 253 을 넘으면 더 올려도 거의 안 듣는다
  //    (실측: 130 → 42% · 170 → 46% 로 평평해졌다). 140 이면 raw 242 로 상한 안이다.
  ENTRY_JUMP: 140,

  BOSS_EVERY: 10,
  BOSS_HERO_MUL: 1.35,      // 보스 층 영웅 예산 배수

  // ── 예산 상한을 넘긴 몫을 스탯으로 환산하는 지수 (v0.34) ──
  // `heroBudgetFor` 는 `maxSpendable()`(=253, 2026-07-28 영웅 비용 공통화 전에는 260)에서
  // 멈춘다. 넘겨서 주면 **쓸 수 없는 돈**이라
  // 화면의 예산 표시가 거짓말이 되기 때문이다(통곡의 탑에서 이미 정해둔 규칙).
  // 그런데 전략가 예산은 `BUDGET_STEP 4` 로 끝없이 오른다. 그래서 실측했더니:
  //   전략가/영웅 예산비가 15층 0.83 으로 바닥을 찍고 40층 1.22 까지 **거꾸로 올라간다.**
  //   방어율도 그대로 따라갔다 — 20층 21% → 35층 75% (파수꾼 상대, rep24).
  //   즉 **20층 넘어가면 탑이 다시 쉬워진다.** 무한의 탑인데 후반이 더 쉬우면 탑이 아니다.
  // 게다가 `BOSS_HERO_MUL 1.35` 도 캡에 통째로 먹혀서 **20층부터 보스가 사라졌다**
  //   (20층 예산 392 → 260, 이웃 19·21층도 260. 보스 층이 이웃과 완전히 동일해진다).
  // 해법: 캡 위로 흘러넘친 예산을 **버리지 않고 hp/damage 배수로 환산**한다.
  // 예산이 아니라 스탯으로 주므로 화면 표시는 계속 정직하고, 보스 배수도 되살아난다.
  // 지수가 1 미만인 이유: 예산은 스탯보다 효율이 좋다(아이템 시너지·물약 등).
  // 값은 실측으로 잡았다(원형 10종 평균 방어율, rep 12~24):
  //   0.9/0.7  → 너무 세다. 20층 이후가 전 영웅 0% 인 벽이 되어 곡선이 아니라 절벽이 된다.
  //   0.4/0.28 → 여전히 세다(20층 3%).
  //   0.28/0.20(채택) → 4층 48% → 15층 23% → 25층 13% → 35층 14%. 완만한 단조 감소.
  OVERFLOW_HP_POW: 0.28,
  OVERFLOW_DMG_POW: 0.20,

  // ── 보스 층을 스탯 축에도 얹는다 (v0.34) ──
  // 예산 배수(`BOSS_HERO_MUL`)만으로는 20층부터 보스가 **완전히 사라졌다** —
  // 20층 예산 392 도, 이웃 19·21층의 284·296 도 전부 260 으로 캡되어 같은 값이 된다.
  // 위의 넘침 환산으로 일부는 되살아나지만(20층 넘침 1.51 vs 이웃 1.09~1.14) 약하다.
  // 캡과 무관한 축에 보스를 한 번 더 얹어 "보스 층은 이웃보다 확실히 어렵다"를 복원한다.
  // (통곡의 탑 합격 조건 3번의 거울.)
  BOSS_MOD_HP: 1.30,
  BOSS_MOD_DMG: 1.20,

  // ── 영웅별 난이도 보정 (v0.34) ──
  // 영웅 3종의 '처치에 필요한 원피해'가 사냥꾼 1613 ↔ 파수꾼 4329 로 **2.7배** 벌어져 있다.
  // 그래서 층 순환으로 영웅을 바꾸면 같은 진형인데 방어율이 0%↔100% 로 튄다(실측 편차 79%p).
  // 🚫 `js/heroes.js` 의 스탯은 건드리지 않는다 — 통곡의 탑·비동기 대전·PvP 레이팅·아이템
  //    밸런스가 전부 거기에 매달려 있다. **수성의 탑 안에서만** 효과를 상쇄한다.
  // 값의 의미: 이 층 영웅의 hp/damage 배수에 곱한다. 1보다 크면 그 영웅이 세진다.
  //
  // 실측으로 잡은 값(원형 10종 평균 방어율, rep 12~24):
  //   보정 없음 → 4층 편차 24%p · 8층 29%p · 20층 79%p(최강 원형 기준)
  //   아래 값   → 4층 20%p · 12층 7%p · 25층 16%p
  // ⚠ **상수 하나로는 완전히 못 맞춘다.** 영웅마다 층 성장(hp/dmg 배수)을 받아먹는 효율이
  //   달라서, 광전사는 층이 오를수록 상대적으로 강해지고 사냥꾼은 약해진다. 즉 격차 자체가
  //   층의 함수다. 여기 값은 **전 구간 평균이 20%p 안에 들어오는 타협점**이지 정답이 아니다.
  //   더 조이려면 층 의존 보정(성장률 자체를 영웅별로)이 필요한데, 그건 별건이다.
  //
  // ── 2026-07-28 · **1.00 으로 평탄화했다.** ─────────────────────────────────
  // 위 값들은 "heroes.js 는 건드리지 않는다"는 전제에서 나온 우회로였다. 그 전제가
  // 사용자 지시로 바뀌었다 — "캐릭터는 모두 동일한 밸런스의 스펙을 갖게 하라".
  // 그래서 격차를 여기서 덮는 대신 **원인이 있는 곳(`js/heroes.js` 의 유효 내구도)**을 고쳤다.
  //   · 사냥꾼 유효 체력 694 → 1032, 파수꾼 1410 → 1134, 광전사 1215 → 1161
  //   · 보정을 끄고 잰 영웅 간 편차(원형 10종 평균, rep12, 4·8·12·20·30층):
  //       고치기 전 24/29/31/12/11 %p  →  고친 뒤 16/6/15/3/7 %p
  // 편차가 SC-3 기준(≤20%p) 안에 들어왔으므로 보정 상수를 남길 이유가 없다.
  // ⚠ 위 경고("격차 자체가 층의 함수다")는 여전히 유효하다. 광전사는 저층에서 약하고
  //   고층에서 강한 성질이 남아 있어 4층 16%p·12층 15%p 가 남는다. 0 은 아니다.
  // ⚠ 여기 값을 다시 1 이 아닌 수로 바꾸려거든, 먼저 `heroes.js` 를 고칠 수 있는지 보라.
  //   보정 상수는 수성의 탑 안에서만 듣기 때문에 통곡의 탑·대전에는 격차가 그대로 남는다.
  // ── 2026-08-07 · **사냥꾼만 1.50 으로 되살렸다** ───────────────────────────
  //  위 절이 "여기 값을 1 이 아닌 수로 바꾸려거든 먼저 heroes.js 를 고칠 수 있는지
  //  보라"고 적어 두었다. 봤고, **못 고친다** — 2026-07-31 사냥꾼 너프(hp 920→840 ·
  //  speed 178→158)는 사용자가 실제 플레이로 요구한 것이고, 되돌리면 통곡의 탑·대전·
  //  PvP 레이팅이 통째로 움직인다. 그런데 그 너프는 사냥꾼을 **컨트롤러로서** 잡은
  //  것이지 **공격 영웅으로서**를 본 것이 아니다. 수성의 탑에서는 사냥꾼이 쳐들어오는
  //  쪽이라, 같은 너프가 여기서는 "사냥꾼 회차만 유독 쉽다"로 나타났다.
  //  → 원인이 있는 곳을 고칠 수 없고 증상이 **이 탑 안에만** 있으므로, 이 탑 안에서만
  //    듣는 이 상수가 정확히 맞는 도구다(다른 모드에 파급이 0 이라는 것이 요점이다).
  //
  //  실측(`mode=noplace profile=fresh rep=24`, ENTRY_JUMP 140):
  //    보정      4회차 사냥꾼   8회차 사냥꾼
  //    1.00        46%           75%
  //    1.25         8%           33%
  //    **1.50**     0%            8%   ← 채택
  //  덤으로 **SC-3(영웅 간 편차)이 같이 풀렸다** — 사냥꾼이 바로 그 이상치였다:
  //    4회차 57%p → **4%p** · 6회차 → 2%p · 8회차 → 7%p.
  //  ⚠ 남는 편차는 10★ 의 24%p(파수꾼 1% vs 사냥꾼 25%)다. 보스 회차는 배수가 겹쳐
  //    편차를 키운다 — 여기를 더 조이려면 `BOSS_MOD_*` 쪽을 봐야 한다.
  HERO_DIFF: { vanguard: 1.00, ranger: 1.50, warden: 1.00 },

  // ══════════════════════════════════════════════════════════════════════════
  //  골드 (v0.36) — "적 유닛을 잡으면 랜덤 골드" 를 **수성의 탑에 각색한 것**
  // ══════════════════════════════════════════════════════════════════════════
  //  ⚠ 여기서는 요청을 문자 그대로 옮길 수가 없다. 통곡의 탑은 적이 진형(10~20기)이라
  //    "한 기 잡을 때마다"가 성립하지만, **수성의 탑의 적은 영웅 딱 1기다.**
  //    그 하나를 잡는 순간이 곧 층 클리어라, 문자 그대로 옮기면
  //    "층을 깨면 골드" — 바꾸기 전과 똑같은 것이 되어버린다.
  //
  //  그래서 **적을 '조각내는' 축으로 옮겼다.**
  //    통곡의 탑: 적 진형의 총 체력을 유닛 단위로 잘라 먹고, 한 조각(=한 기)마다 보상.
  //    수성의 탑: 적 영웅의 총 체력을 GOLD_SEGMENTS 조각으로 잘라, 한 조각을 깎을 때마다 보상.
  //  둘 다 "적을 얼마나 무너뜨렸는가"에 비례한다는 같은 규칙이고, 적의 형태만 다르다.
  //
  //  후보 중 다른 둘을 버린 이유 (임의로 고르지 않았다):
  //   · **생존한 내 유닛 수 비례** — 버렸다. 영웅이 절대 닿지 않는 뒤쪽 구석에 싸구려
  //     유닛을 늘어놓기만 해도 보상이 오른다. 방어를 잘한 것과 구분되지 않고,
  //     '진형을 앞으로 내밀어 화력을 집중한다'는 이 게임의 좋은 플레이를 벌준다.
  //   · **층 클리어 + 처치 보너스 혼합** — 버렸다. 실제 지급 시점이 결국 '클리어' 하나라
  //     지금과 체감이 같다. 요청의 핵심("잡는 행위마다 보상")이 사라진다.
  //
  //  이 각색이 실제로 만들어내는 차이: **"막아냈다"에도 등급이 생긴다.**
  //  이 게임은 시간 초과(무승부)도 방어 성공으로 친다(`defend.js`: `defended = !aiWon`).
  //  예전에는 영웅을 30초에 격퇴하든 90초를 버티기만 하든 보상이 똑같았다.
  //  이제 격퇴 못 하고 버틴 판은 **깎은 만큼(최대 45%)만** 받는다 — "막아라"가 아니라
  //  "잡아라"가 되어, 진형에 화력을 넣을 이유가 생긴다.
  //  ⚠ 2026-08-07 — 예전에는 '진 층의 골드는 남지 않는다'였다(`fail()` 이 도전을
  //    통째로 되돌렸다). **지금은 남는다** — 진 판에서 깎아 낸 만큼도 그대로 지갑에
  //    들어간다. 패배의 대가는 골드가 아니라 '회차가 안 오른다' 하나뿐이다.
  //
  //  ⚠ 피해 집계는 `state.telemetry.heroDamageTaken` 을 그대로 읽는다 —
  //    `combat.js` 가 이미 쌓고 있는 값이라 전투 엔진을 건드리지 않는다.
  //    단, 가시덫(mine)은 `applyDamage` 를 거치지 않고 hp 를 직접 깎으므로
  //    **덫 피해는 집계에 안 들어간다**(알고 있는 한계, 최대 30% 한 번).
  // 2026-07-29 · 사용자 지시로 **크게 올렸다**(14/2 → 34/6).
  //   근거: 강화 가격이 L2 45 · L3 90 · L4 170 · L5 320 인데 1층 보상이 14 였다.
  //   L2 하나 올리는 데 3~4층, L5 까지는 40층분이 필요해 "성장하는 맛"이 아예 없었다.
  //   (⚠ 2026-08-07 — 이 근거 중 '지면 골드가 통째로 사라지는 규칙이라 쌓아두는
  //    플레이가 성립하지 않는다'는 **더 이상 사실이 아니다.** 영구 성장이 되어 골드가
  //    쌓인다. 값을 다시 볼 때 이 전제부터 다시 세울 것.)
  //   새 값이면 1층 34 · 5층 58 · 10층 88(보스 176) — L2 는 첫 두 층, L5 는 20층대에 닿는다.
  GOLD_BASE: 34,
  GOLD_PER_FLOOR: 6,
  GOLD_BOSS_MUL: 2.0,
  GOLD_DAMAGE_SHARE: 0.45,   // 영웅 체력을 깎은 몫
  GOLD_KILL_SHARE: 0.55,     // 격퇴(=층 방어 성공) 몫
  GOLD_SEGMENTS: 8,          // 영웅 체력을 몇 조각으로 자를 것인가
  GOLD_SPREAD: 0.35,         // 조각당 난수 폭 ±35%

  goldFor: function (floor) {
    var g = this.GOLD_BASE + Math.max(0, floor - 1) * this.GOLD_PER_FLOOR;
    if (this.isBossFloor(floor)) g = Math.round(g * this.GOLD_BOSS_MUL);
    return g;
  },

  // 씬이 전투 시작 때 한 줄로 부른다 —  GAME.DefendTower.attachKillGold(this.state, floor);
  //  `state.onKill` 훅으로 '영웅을 실제로 격퇴했는가'를 잡는다.
  //  ⚠ 훅이 아직 없어도(combat.js 통합 전) `earnedFrom` 이 영웅의 `alive` 를 직접 보고
  //    격퇴 여부를 판정하므로 골드가 사라지지 않는다. 훅은 '더 정확한 신호'일 뿐이다.
  attachKillGold: function (state, floor) {
    if (!state) return null;
    var hero = null;
    for (var i = 0; i < state.units.length; i++) {
      if (state.units[i] && state.units[i].isHero) { hero = state.units[i]; break; }
    }
    state.killGold = 0;
    state._dgFloor = floor;
    state._dgPool = this.goldFor(floor);
    state._dgHero = hero;
    state._dgHeroMaxHp = hero ? hero.maxHp : 0;
    state._dgHeroKilled = false;
    state._dgActive = true;
    var prev = state.onKill;
    state.onKill = function (unit, st) {
      if (prev) { try { prev(unit, st); } catch (e) { /* 남의 훅이 터져도 골드는 준다 */ } }
      if (unit && unit.side === 'controller') (st || state)._dgHeroKilled = true;
    };
    return state;
  },

  // 이 판에서 번 골드. 전투가 끝난 뒤 한 번만 부른다.
  earnedFrom: function (state) {
    if (!state || !state._dgActive) return 0;
    var pool = state._dgPool || 0;
    var maxHp = state._dgHeroMaxHp || 0;
    var dealt = (state.telemetry && state.telemetry.heroDamageTaken) || 0;
    var hero = state._dgHero;
    // ⚠ '누적 피해량 / 최대체력' 하나로만 재면 **금방 100% 로 포화된다.** 영웅은 흡혈·물약으로
    //   회복하므로 누적 피해가 최대체력을 넘고도 멀쩡히 살아 있는 판이 흔하다(실측: 20층에서
    //   영웅이 이겼는데 누적 피해 100%). 그러면 뚫린 판과 격퇴한 판의 보상이 같아진다.
    //   그래서 **누적 피해**(회복을 뚫고 넣은 총량)와 **실제로 깎아 남긴 몫**(1 - 남은체력)을
    //   반씩 섞는다. 격퇴하면 둘 다 1 이라 정확히 1 이 된다.
    var cum = maxHp > 0 ? Math.max(0, Math.min(1, dealt / maxHp)) : 0;
    var net = (hero && maxHp > 0) ? Math.max(0, Math.min(1, 1 - Math.max(0, hero.hp) / maxHp)) : cum;
    var d = 0.5 * cum + 0.5 * net;
    var killed = !!state._dgHeroKilled || (hero && hero.alive === false);
    var segs = Math.floor(d * this.GOLD_SEGMENTS);
    var per = pool * this.GOLD_DAMAGE_SHARE / this.GOLD_SEGMENTS;
    var g = 0, i;
    for (i = 0; i < segs; i++) g += per * (1 + (Math.random() * 2 - 1) * this.GOLD_SPREAD);
    if (killed) g += pool * this.GOLD_KILL_SHARE * (1 + (Math.random() * 2 - 1) * this.GOLD_SPREAD);
    return Math.round(g);
  },

  // ── 도전 기록의 골드 ────────────────────────────────────────────────────
  goldOf: function () { return (this.get().gold || 0); },

  addGold: function (n) {
    if (!n) return this.goldOf();
    var rec = this.get();
    rec.gold = (rec.gold || 0) + Math.round(n);
    this._save(rec);
    return rec.gold;
  },

  spendGold: function (n) {
    var rec = this.get();
    if ((rec.gold || 0) < n) return false;
    rec.gold = (rec.gold || 0) - n;
    this._save(rec);
    return true;
  },

  // ── 유닛 레벨 (js/unitlevel.js 가 표·가격을 갖고, 저장만 여기에 붙는다) ─────
  setUnitLevel: function (typeKey, lv) {
    var rec = this.get();
    if (!rec.unitLv) rec.unitLv = {};
    if (!rec.refine) rec.refine = {};
    rec.unitLv[typeKey] = lv;
    this._save(rec);
    return rec;
  },

  // ── 증원 — 골드로 배치 예산을 영구히(이 도전 동안) 늘린다 ──────────────────
  //  "추가 유닛을 배치할 수 있게" 를 유닛 개수가 아니라 **예산**으로 구현한 이유:
  //  이 게임에서 '몇 기를 놓을 수 있는가'는 이미 예산 하나로 표현된다. 증원을 개별
  //  유닛 목록으로 따로 관리하면 배치 화면이 '예산으로 놓는 유닛'과 '증원으로 놓는 유닛'
  //  두 종류를 구분해야 하고, 그 경계에서 예산 검사가 갈라진다(옛 AI 시드 예산 초과 사고 계열).
  //  예산에 더하면 배치 화면은 아무것도 안 바꿔도 되고, 숫자도 정직하다.
  EXTRA_BUDGET_STEP: 10,     // 한 번에 사는 정원
  //  구매 1회마다 값이 이만큼 오른다(사용자 제안 5). 기본값 50 에 +5 씩이면
  //  10번째 구매가 95 다 — 계속 살 수는 있되 '무한정'은 아니게 된다.
  EXTRA_BUDGET_RISE: 5,
  extraBudgetPrice: function () {
    //  ── 살수록 비싸진다 (2026-08-03 사용자 지시: "증원도 갈수록 골드가 올라가야해") ──
    //  예전에는 몇 번을 사든 같은 값이라, 골드가 쌓이면 정원을 무한정 밀어 올릴 수
    //  있었다 — 그러면 '배치를 잘 짜는 것'보다 '많이 사는 것'이 언제나 정답이 된다.
    //  ⚠ 계단은 **산 횟수**에 걸린다(정원 총량이 아니라). 한 번에 10 씩 늘므로
    //    총량으로 계산하면 계단이 10배 성기게 걸려 체감이 안 난다.
    var bought = Math.floor((this.bonusBudget() || 0) / this.EXTRA_BUDGET_STEP);
    var base = this.EXTRA_BUDGET_STEP * (GAME.UnitLevel ? GAME.UnitLevel.BUDGET_RATE : 5);
    return base + bought * this.EXTRA_BUDGET_RISE;
  },
  bonusBudget: function () { return (this.get().bonusBudget || 0); },
  buyBudget: function () {
    var price = this.extraBudgetPrice();
    if (!this.spendGold(price)) return null;
    var rec = this.get();
    rec.bonusBudget = (rec.bonusBudget || 0) + this.EXTRA_BUDGET_STEP;
    this._save(rec);
    return rec.bonusBudget;
  },

  // 배치 화면이 실제로 써야 할 예산 — 층 예산 + 증원.
  // ⚠ `budgetFor` 는 **난이도 곡선의 기준값**이라 손대지 않는다(도구가 그걸 잰다).
  placeBudgetFor: function (floor) {
    return this.budgetFor(floor) + this.bonusBudget();
  },

  _all: function () { return GAME.Store.get(this.KEY, {}); },
  _key: function () { return GAME.Account.current() || 'guest'; },

  get: function () {
    var rec = this._all()[this._key()];
    if (!rec) {
      return { floor: 1, best: 0, runs: 0, kills: 0, placed: null, tier: null,
               gold: 0, unitLv: {}, refine: {}, bonusBudget: 0, seed: 0 };
    }
    if (!rec.floor) rec.floor = 1;
    // 옛 저장본에는 없는 칸 — 읽을 때 채운다(마이그레이션 코드를 따로 두지 않는다)
    if (typeof rec.gold !== 'number') rec.gold = 0;
    if (!rec.unitLv) rec.unitLv = {};
    if (!rec.refine) rec.refine = {};
    if (typeof rec.bonusBudget !== 'number') rec.bonusBudget = 0;
    if (typeof rec.seed !== 'number') rec.seed = 0;
    return rec;
  },

  //  영웅 추종 가중치 배정용 시드. 없으면 그때 굴려 **저장**한다.
  //  ⚠ 읽기 함수가 쓰는 것이 이상해 보이지만, 대안은 두 가지 다 나쁘다 —
  //    ① 매번 새로 굴리면 같은 회차를 재도전할 때마다 영웅 성격이 바뀌어
  //       "무엇을 고칠까"가 성립하지 않는다(운이 아니라 문제로 읽혀야 한다).
  //    ② 기록 생성 시점에만 굴리면 v1 시절 기록·손으로 만든 기록에 시드가 없다.
  //  ⚠ 도구는 재현성을 위해 이 값을 **직접 박는다**(tools/defend-curve.js 참조).
  seedOf: function () {
    var rec = this.get();
    if (rec.seed) return rec.seed;
    var s = (Math.floor(Math.random() * 0x7ffffffe) + 1) | 0;
    rec.seed = s;
    this._save(rec);
    return s;
  },

  // ── 막힌 회차는 **그 회차만** 조용히 약해진다 (2026-08-07) ──────────────────
  //  통곡의 탑 `js/towerchar.js` 의 같은 이름 함수들과 **같은 모양**이되 값은 독립이다.
  //  (모양을 맞추는 이유: 두 탑의 규칙이 갈라지면 "다섯 번 지면 최대한 쉬워진다"는
  //   규칙 하나로 두 탑을 설명할 수 없게 된다.)
  //
  //  ⚠ **화면에 안 띄운다**(사용자 지시). "너는 N번 졌다"를 화면이 세어 주는 것은
  //    도움이 아니라 면박이고, 깼을 때의 성취도 같이 깎는다.
  //    → `reliefInfo` 는 그래도 남긴다. **화면에서 뗀 기제는 감사만이 유일한 눈**이다
  //      (`tools/deftower-audit.js`).
  //  ⚠ 상한이 반드시 필요하다 — 없으면 20번 지는 순간 적 체력이 0 이 된다.
  //  ⚠ 누적은 **곱이 아니라 합**(n × step). 곱이면 0 에 점근해 사람이 셀 수 없다.
  //  ⚠ 회차를 **깨면 초기화**한다. 안 그러면 완화가 영구 누적되어 뒤 회차가 통째로 쉬워진다.
  //  ⚠ 통곡의 탑과 달리 **보스 예외를 두지 않는다.** 저쪽은 보스 5% 고정이지만
  //    이쪽 보스는 `BOSS_MOD_HP`/`BOSS_MOD_DMG` 로 이미 따로 세워 둔 축이 있어,
  //    완화까지 갈라 놓으면 보스 회차의 실제 난이도를 두 손잡이가 동시에 흔든다.
  RELIEF_STEP: 0.05,           // 재도전 1회당 5%p
  RELIEF_MAX: 0.25,            // 5회에서 바닥

  noteFloorFail: function (floor) {
    var rec = this.get();
    if (!rec) return;
    var f = rec.floorFail;
    //  회차가 바뀌면 처음부터 — 완화는 **지금 막힌 벽**에만 쌓인다.
    if (!f || f.f !== floor) f = { f: floor, n: 0 };
    f.n++;
    rec.floorFail = f;
    this._save(rec);
  },

  clearFloorFail: function (floor) {
    var rec = this.get();
    if (!rec || !rec.floorFail || rec.floorFail.f !== floor) return;
    delete rec.floorFail;               // 깼으면 사라진다(다음 회차는 온전한 난이도로)
    this._save(rec);
  },

  //  영웅의 체력·공격에 곱할 값(1 이하). 회차가 다르거나 기록이 없으면 정확히 1.
  reliefFor: function (floor) {
    var rec = this.get();
    var f = rec && rec.floorFail;
    if (!f || f.f !== floor || !(f.n > 0)) return 1;
    return 1 - Math.min(this.RELIEF_MAX, f.n * this.RELIEF_STEP);
  },

  //  감사 전용 — 몇 번 막혔고 몇 % 약해졌는가. **화면에는 쓰지 않는다.**
  reliefInfo: function (floor) {
    var rec = this.get();
    var f = rec && rec.floorFail;
    if (!f || f.f !== floor || !(f.n > 0)) return null;
    return {
      tries: f.n,
      cut: Math.round((1 - this.reliefFor(floor)) * 100),
      atMax: f.n * this.RELIEF_STEP >= this.RELIEF_MAX
    };
  },

  // ── 내 진형이 기본보다 얼마나 세졌는가 (2026-08-07) ─────────────────────────
  //  영웅 난이도가 따라올 대상이다. **두 축을 가른다**(스펙 §4.1):
  //    내 총 화력(dps) → 영웅의 체력   (안 그러면 영웅이 즉시 녹는다)
  //    내 총 내구(ehp) → 영웅의 공격력 (안 그러면 영웅이 못 뚫는다)
  //  ⚠ 기하평균으로 합치면 안 된다. 통곡의 탑이 정확히 그것으로 사고를 냈다 —
  //    공격 몰빵 빌드가 기하평균에 희석되어 "42층을 3초만에" 깨졌다.
  //
  //  ⚠⚠ **분모가 이 함수의 핵심이다.** 같은 배치를 '성장 0' 으로 계산한 값으로 나눈다.
  //    ① 성장이 없으면 구성이 무엇이든 **정확히 1.000** 이다
  //       → `tools/defend-curve.js profile=fresh` 가 기존 기준표를 그대로 재현한다
  //         (통곡의 탑이 "신선한 캐릭터는 배수가 정확히 1.000" 으로 R-1 기준선을
  //          지킨 것과 같은 수법).
  //    ② 약하게 배치해 약한 영웅을 받는 **샌드백이 성립하지 않는다** — 분자와 분모가
  //       같이 움직여 비율이 안 변한다. (약하게 배치하면 회차 기본값이 그대로 남아
  //       그냥 진다 — 스펙 §4.2.)
  //
  //  ⚠ 증원(bonusBudget)은 유닛 **수**를 늘리는 성장이라 위 비율에서 상쇄된다.
  //    그래서 예산 비를 따로 곱한다. 이 값도 증원이 없으면 정확히 1.000 이다.
  //  ⚠⚠ 그 비는 **산 정원이 아니라 실제로 채운 양**으로 잰다 (2026-08-07 검토에서 잡힘).
  //    `placeBudgetFor / budgetFor` 로 두면 배치를 한 기도 안 늘려도 영웅만 세져서,
  //    **골드로 증원을 사는 것이 순수 손해**가 된다(실측: 10회차·3기 배치에서
  //    증원 0 → 영웅 hp ×1.60, 증원 200 → ×2.73). 화면에 경고도 없다.
  //    실제 배치액으로 재면 "채운 만큼만 따라온다"가 되어 앞뒤가 맞는다.
  //  ⚠ 하한 1 을 둔다 — 기본 예산보다 적게 놓아 영웅을 약하게 만드는 샌드백을 막는다
  //    (덜 놓으면 그냥 약한 진형으로 회차 기본 난이도를 만나 진다).
  //
  //  placed 는 `[{ type }]` 만 있으면 된다(좌표를 안 본다) — 씬은 실제 배치를,
  //  도구는 원형에서 만든 목록을 그대로 넘길 수 있다.
  growthIndex: function (placed, floor) {
    var rec = this.get();
    var list = placed || rec.placed || [];
    var UL = GAME.UnitLevel;
    var f = floor || rec.floor || 1;
    var dps = 0, dps0 = 0, ehp = 0, ehp0 = 0, spent = 0;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || !p.type) continue;
      //  ⚠ `type` 은 원본 키가 아닐 수 있다 — 탑은 `shieldman#6+charge` 같은 정예
      //    파생 키를 쓴다. 되돌리지 않으면 `GAME.UNITS[type]` 이 undefined 가 되어
      //    조용히 건너뛴다(이 저장소가 로딩 공략에서 이미 겪은 사고).
      var key = UL ? UL.baseKeyOf(p.type) : p.type;
      var def = GAME.UNITS[key];
      if (!def) continue;
      var lm = UL ? UL.modsForLevel(UL.levelOf(key)) : { hp: 1, damage: 1 };
      var rm = this.refineMods(key) || { hp: 1, damage: 1 };
      //  가중치는 def 의 고정값이라 분자·분모에 똑같이 걸린다 — 어떤 유닛이 평균을
      //  더 끌고 가는지만 정한다.
      var d0 = (def.damage || 0) / Math.max(0.1, (def.cooldown || 1000) / 1000);
      var e0 = (def.hp || 0) * (1 + (def.armor || 0) / 100);
      dps0 += d0; dps += d0 * ((lm.damage || 1) * (rm.damage || 1));
      ehp0 += e0; ehp += e0 * ((lm.hp || 1) * (rm.hp || 1));
      spent += (def.cost || 0);
    }
    var base = this.budgetFor(f);
    var bg = (base > 0 && spent > 0) ? Math.max(1, spent / base) : 1;
    return {
      dps: (dps0 > 0 ? dps / dps0 : 1) * bg,
      ehp: (ehp0 > 0 ? ehp / ehp0 : 1) * bg
    };
  },

  // ── 영웅마다 추종 폭이 다르다 (2026-08-07) ─────────────────────────────────
  //  ⚠ 1:1 추종은 업그레이드를 무의미하게 만든다. 통곡의 탑이 이 신고를 그대로 받았다:
  //    "내가 강해지는거에따라 똑같이 전부다 강해져버리니까 게임이 그냥 계속 똑같은
  //     느낌이야 … 결국 사용자입장에서 변칙적이어야해"
  //  거기서 쓴 해법이 `Tower.UNIT_PROFILES`(자리마다 추종 가중치를 다르게, 기대값은
  //  정확히 1.0)다. 평균 난이도는 안 움직이면서 매판 누가 위협적인지가 달라진다.
  //  **수성의 탑 거울**: 쳐들어오는 영웅마다 가중치를 다르게 굴린다 —
  //  어떤 회차의 영웅은 내 화력을 바짝 따라오고(단단한 놈), 어떤 놈은 내 내구를
  //  따라온다(아픈 놈).
  //
  //  ⚠ **기대값을 정확히 1.0 으로 맞춘다.** 안 그러면 평균 난이도가 슬쩍 움직여
  //    실측으로 잡은 `FOLLOW_POW` 가 조용히 어긋나고, `defend-curve.js` 가 재는 값이
  //    더는 실제 게임을 대표하지 않게 된다.
  //      hpW  기대값 = .3×1.5 + .3×0.7 + .2×1.1 + .2×0.6 = 1.00
  //      dmgW 기대값 = .3×0.7 + .3×1.5 + .2×1.1 + .2×0.6 = 1.00
  //  ⚠ 폭은 통곡의 탑(0.2~2.0)보다 **좁게** 시작한다. 저쪽은 유닛 15기의 평균이라
  //    편차가 녹지만, 수성의 탑은 **영웅이 한 명뿐**이라 같은 폭이면 훨씬 크게 느껴진다.
  //    넓히려거든 실측(`tools/defend-curve.js`)으로 확인하고 넓힐 것.
  HERO_PROFILES: [
    { key: 'tough', p: 0.30, hpW: 1.5, dmgW: 0.7 },   // 단단한 놈 — 내 화력을 바짝 따라온다
    { key: 'sharp', p: 0.30, hpW: 0.7, dmgW: 1.5 },   // 아픈 놈  — 내 내구를 바짝 따라온다
    { key: 'full',  p: 0.20, hpW: 1.1, dmgW: 1.1 },   // 둘 다 조금씩
    { key: 'plain', p: 0.20, hpW: 0.6, dmgW: 0.6 }    // 성장을 거의 안 따라온다
  ],

  //  ── 추종 지수 — **실측으로 정했다** (2026-08-07) ──────────────────────────
  //  통곡의 탑은 같은 자리에서 0.75 를 골랐다. 여기서는 **1.00 이다.** 눈으로 고르지
  //  않았고, 서로 다른 답이 나온 데에는 이유가 있다(아래).
  //
  //  실측 (`tools/defend-curve.js mode=avg profile=upgraded rep=24 seed=20260728`,
  //   원형 10종 × 영웅 3종 평균 방어율. upgraded = 유닛 L5 · 정련 5 · 증원 120):
  //    지수        30★    60★
  //    0(추종없음)  33%     —     ← 성장을 안 따라오면 탑이 4.7배 쉬워진다(기제 검증)
  //    0.55        22%    18%
  //    0.75        10%    11%
  //    **1.00       7%     7%**  ← 채택
  //    1.30         3%     2%    ← 과보정(fresh 아래 = 키우면 손해)
  //    (fresh 기준)  7%     6%
  //
  //  판정 축은 둘이다:
  //    ① **성장해도 체감이 그대로인가** — upgraded 가 fresh 와 같은 방어율이어야 한다.
  //       1.00 만 7/7 대 7/6 으로 맞는다. 0.55 는 22/18 로 **키우면 탑이 3배 시시해진다.**
  //    ② **후반이 안 쉬워지는가**(30→60 이 안 오른다) — 1.00 은 7→7 로 평평하다.
  //
  //  ⚠⚠ **처음에는 0.55 를 골랐다가 뒤집었다.** 그때 쓴 측정이 틀린 조건이었기 때문이다 —
  //    도구가 기본 예산만큼만 진형을 짓고 영웅에게는 증원분을 얹은 배수를 줬다. 즉
  //    "증원을 사 놓고 안 쓰는 사람"을 재고 있었다(`growthIndex` 의 옛 `bg` 와 같은 결함).
  //    정원을 채워서 다시 재니 같은 지수에서 7% 가 아니라 **22%** 가 나왔다.
  //    → **밸런스 지수를 고르기 전에 "도구가 재는 사람이 실제 플레이어와 같은가"를 먼저 볼 것.**
  //
  //  ⚠ 왜 통곡의 탑(0.75)과 다른가: 저쪽은 유닛 15기의 평균이라 개별 편차가 녹고,
  //    성장이 지수(골드 ×1.08/층 · T10 무기 +1350)라 배수가 자릿수로 자란다.
  //    여기는 **영웅이 한 명뿐**이고 성장이 곱셈이 아니라 거의 선형이다
  //    (유닛 레벨 5 상한 · 정련 10 상한 · 증원은 예산에 더해진다) — 선형으로 자라는
  //    것을 따라가려면 지수도 1 이어야 한다. **두 탑에 같은 값을 쓰지 말 것.**
  //
  //  ⚠ 1.00 은 '1:1 추종'이라 "키워도 체감이 같다"가 될 수 있다. 그 답은 지수를 낮추는
  //    것이 아니라 **`HERO_PROFILES` 의 편차**다(스펙 §4.3) — 평균은 그대로 두고 매
  //    회차 누가 위협적인지를 바꾼다. 지수를 낮추면 평균 난이도 자체가 내려가 버린다.
  FOLLOW_POW: 1.00,
  //  오버플로 안전장치. 증원(bonusBudget)은 계속 살 수 있어 지수에 상한이 없다.
  //  낮게 잡으면 "무한의 탑에 고정 상한을 두면 언젠가 반드시 넘는다"는 통곡의 탑
  //  사고를 되풀이하므로 넉넉히 둔다.
  FOLLOW_CAP: 12,

  //  결정적 난수(xorshift) — `js/tower.js` 의 `_urng` 와 같은 식이다.
  _hrng: function (seed) {
    var s = seed | 0; if (!s) s = 1;
    return function () {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s |= 0;
      return ((s >>> 0) % 100000) / 100000;
    };
  },

  //  이 회차 영웅의 성격. 시드는 (기록 시드, 회차) 라 **같은 회차는 재도전해도 같다** —
  //  "무엇을 고칠까"가 성립하려면 운이 아니라 문제로 읽혀야 한다.
  heroProfile: function (floor) {
    var r = this._hrng((this.seedOf() ^ (floor * 2654435761)) | 0)();
    var list = this.HERO_PROFILES, acc = 0;
    for (var i = 0; i < list.length; i++) {
      acc += list[i].p;
      if (r < acc) return list[i];
    }
    return list[list.length - 1];
  },

  _save: function (rec) {
    var all = this._all();
    all[this._key()] = rec;
    GAME.Store.set(this.KEY, all);
  },

  // 전략가 예산 — 층마다 조금씩
  budgetFor: function (floor) {
    return this.BASE_BUDGET + (Math.max(1, floor) - 1) * this.BUDGET_STEP;
  },

  // 공격 영웅이 '받아야 할' 예산 — 상한을 씌우기 **전**의 값.
  // 캡에 먹힌 몫을 스탯으로 돌려주려면 원래 얼마였는지를 알아야 한다.
  heroBudgetRawFor: function (floor) {
    var f = Math.max(1, floor);
    var early = this.HERO_BASE + (Math.min(f, this.EARLY_FLOORS) - 1) * this.HERO_STEP;
    var b = (f <= this.EARLY_FLOORS)
      ? early
      : early + this.ENTRY_JUMP + (f - this.EARLY_FLOORS - 1) * this.HERO_STEP;
    if (this.isBossFloor(f)) b = Math.round(b * this.BOSS_HERO_MUL);
    return b;
  },

  // 공격 영웅 예산 — 4층에서 점프한 뒤 가파르게. 실제로 쓸 수 있는 상한에서 멈춘다.
  heroBudgetFor: function (floor) {
    return Math.min(this.heroBudgetRawFor(floor), GAME.Tower.maxSpendable());
  },

  // 회차가 오르면 영웅 자체도 단단해진다(예산 상한에 닿은 뒤에도 난이도가 오르게).
  //  ① 회차 기본 성장 (hp +1.8%/회차, dmg +1.5%/회차)
  //  ② 예산 상한을 넘긴 몫의 환산 — 이게 없으면 15회차 이후 난이도가 거꾸로 간다(위 주석)
  //  ③ **내 진형 성장 추종** (2026-08-07 신설) — 내 화력이 영웅의 체력을,
  //     내 내구가 영웅의 공격을 부른다. 영구 성장으로 바꾼 대가를 여기서 치른다.
  //  ④ 영웅별 보정(`HERO_DIFF`, 지금은 전부 1.00)
  //  ⑤ 조용한 완화 — 같은 회차에서 진 만큼 영웅이 약해진다
  //
  //  heroKey 는 생략 가능하다(생략하면 그 회차의 영웅을 스스로 구한다).
  //  idx 도 생략 가능하다 — 생략하면 기록에 저장된 배치로 계산한다. 전투 씬은
  //  **그 판에 실제로 세운 배치**를 넘긴다(로비 미리보기와 전투가 같은 값을 보게).
  //
  //  ⚠ 순서를 바꾸지 말 것. 완화는 **맨 마지막에 곱한다** — 앞에 넣으면 보스 배수나
  //    추종에 먹혀 실제로 깎이는 폭이 달라진다.
  //  ⚠ 화면 표시(`js/scenes/defend-tower.js`)도 이 함수를 쓰므로 완화가 반영된
  //    **정직한 값**이 뜬다. 완화를 문구로 알리지 않는 것과 모순되지 않는다 —
  //    "너는 N번 졌다"를 안 세어 줄 뿐, 영웅이 얼마나 센지는 계속 사실대로 적는다.
  heroModsFor: function (floor, heroKey, idx) {
    var t = Math.max(0, floor - 1);
    var hp = 1 + 0.018 * t, dmg = 1 + 0.015 * t;

    var cap = GAME.Tower.maxSpendable();
    var raw = this.heroBudgetRawFor(floor);
    if (raw > cap) {
      var over = raw / cap;
      hp *= Math.pow(over, this.OVERFLOW_HP_POW);
      dmg *= Math.pow(over, this.OVERFLOW_DMG_POW);
    }

    // ③ 성장 추종 — 두 축을 **가른 채로** 각각 따라간다(기하평균 금지, 스펙 §4.1)
    var g = idx || this.growthIndex(null, floor);
    var prof = this.heroProfile(floor);
    var hf = Math.max(1, Math.min(this.FOLLOW_CAP, Math.pow(g.dps || 1, this.FOLLOW_POW)));
    var df = Math.max(1, Math.min(this.FOLLOW_CAP, Math.pow(g.ehp || 1, this.FOLLOW_POW)));
    hp *= 1 + (hf - 1) * prof.hpW;
    dmg *= 1 + (df - 1) * prof.dmgW;

    if (this.isBossFloor(floor)) { hp *= this.BOSS_MOD_HP; dmg *= this.BOSS_MOD_DMG; }

    // heroKeyFor 는 이제 회차만 본다 — 숙련도를 구하러 Learn 을 건드릴 이유가 없다
    var hk = heroKey || this.heroKeyFor(floor);
    var k = (this.HERO_DIFF && this.HERO_DIFF[hk]) || 1;
    var rel = this.reliefFor(floor);
    return { hp: hp * k * rel, damage: dmg * k * rel };
  },

  // 이 층에서 AI 컨트롤러가 최소한 이만큼은 잘한다.
  // 학습(Learn.getCtrl)이 더 높으면 그쪽을 쓴다 — 학습이 층수에 묻히지 않게.
  skillFloorFor: function (floor) {
    return Math.min(0.95, 0.08 + 0.035 * (Math.max(1, floor) - 1));
  },

  skillFor: function (floor) {
    var learned = (GAME.Learn.getCtrl().skill) || 0;
    return Math.max(this.skillFloorFor(floor), learned);
  },

  // ── 정련 — 5단계 이후의 강화 (2026-08-03 사용자 지시) ─────────────────────
  //  "유닛 업그레이드는 5단계만 있는 건 너무 적어. 5단계까지 간 다음 확률적으로
  //   강화할 수 있게 해주거나 하는 등 이후 시스템도 만들어줘"
  //
  //  레벨(1~5)은 **확정 성장**이라 계획을 세울 수 있어야 한다 — 거기 확률을 섞으면
  //  배치 설계가 도박이 된다. 그래서 확률은 **그 위**에 얹는다:
  //    · 5단계에 도달한 유닛만 정련할 수 있다
  //    · 성공하면 정련 단계 +1(공격·체력 +6%씩 누적), 실패하면 골드만 잃는다
  //    · **떨어지지는 않는다.** 내려가는 강화는 재미가 아니라 손실 회피 스트레스다
  //      (이 게임은 12세 이용가 캐주얼이다)
  //  ⚠ 성공률이 단계마다 낮아지고 값은 오른다 — 그래서 스스로 멈출 자리가 생긴다.
  REFINE_MAX: 10,
  REFINE_GAIN: 0.06,          // 단계당 공격·체력 배수
  refineChance: function (step) {
    //  1단계 90% → 10단계 25%. 완만하게 떨어져 "다음 한 번"이 늘 해볼 만하게 둔다.
    return Math.max(0.25, 0.90 - 0.072 * (step || 0));
  },
  refineCost: function (step) {
    return 120 + 90 * (step || 0);
  },
  refineOf: function (typeKey) {
    var rec = this.get();
    return (rec.refine && rec.refine[typeKey]) || 0;
  },
  //  정련 배수 — 진형을 만들 때 이 유닛에 곱한다.
  refineMods: function (typeKey) {
    var st = this.refineOf(typeKey);
    if (!st) return null;
    var m = 1 + this.REFINE_GAIN * st;
    return { hp: m, damage: m };
  },
  canRefine: function (typeKey) {
    var rec = this.get();
    var lv = (rec.unitLv && rec.unitLv[typeKey]) || 0;
    var maxLv = (GAME.UnitLevel && GAME.UnitLevel.MAX) || 5;
    return lv >= maxLv && this.refineOf(typeKey) < this.REFINE_MAX;
  },
  //  시도한다. { ok, step, cost } 를 돌려준다. 골드가 모자라면 null.
  tryRefine: function (typeKey) {
    var rec = this.get();
    if (!this.canRefine(typeKey)) return null;
    var step = this.refineOf(typeKey);
    var cost = this.refineCost(step);
    if ((rec.gold || 0) < cost) return null;
    rec.gold -= cost;
    var ok = Math.random() < this.refineChance(step);
    if (ok) {
      if (!rec.refine) rec.refine = {};
      rec.refine[typeKey] = step + 1;
    }
    this._save(rec);
    return { ok: ok, step: rec.refine ? (rec.refine[typeKey] || 0) : 0, cost: cost };
  },

  isBossFloor: function (floor) {
    return floor > 0 && floor % this.BOSS_EVERY === 0;
  },

  // ══════════════════════════════════════════════════════════════════════════
  //  해금 사다리 (2026-08-07 · 2단계) — **처음엔 4종만 준다**
  // ══════════════════════════════════════════════════════════════════════════
  //  > "그 유닛들은 일정 탑 이상 깨야만 쓸 수 있게 … 보스 잡을 때마다 하나씩"
  //  > "차라리 수성의 탑 모든 유닛들에 그 기준을 적용하고 처음에 4종류 정도만 풀어주자"
  //  > "5,8,10,15,20,30 그 다음은 적절히 거리두면 좋을 듯"
  //
  //  ⚠ **수성의 탑에만 건다.** 대전·통곡의 탑·AI 자동배치(`autoformation.js`)는
  //    이 표를 안 본다 — 거기까지 잠그면 남의 진형이 통째로 바뀌어 밸런스가 날아간다.
  //
  //  시작 4종을 무엇으로 할 것인가 — **실측으로 정했다.**
  //    전사(10) 벽 · 궁수(20) 원거리 · 투석꾼(20) 광역 · 족장(30) 아군 버프
  //
  //  ⚠⚠ 처음에는 **방패병**을 시작에 넣었다가 뺐다. 방패병은 체력 504 짜리 벽이라
  //    **아무렇게나 뿌려도 버틴다** — 무배치 방어 성공률이 4회차 92% · 8회차 67% 로
  //    치솟아 "4회차부터 배치 없이는 못 이긴다"는 약속이 통째로 날아갔다(실측).
  //    네 시안을 재서 골랐다(`mode=noplace profile=fresh rep=24`, 무배치 방어율):
  //        시작 4번째    4회차   6회차   8회차
  //        방패병         92%     13%     67%   ← 버림
  //        늪지기         33%      —      21%
  //        약초꾼         38%     17%     54%
  //        **족장**       42%      4%     29%   ← 채택
  //    방패병은 **첫 해금 보상**으로 옮겼다. "이제 벽을 세울 수 있다"가 5회차의 사건이
  //    되고, 시작 구성이 물렁해져 배치가 실제로 필요해진다 — 설계와 측정이 같은 답을 냈다.
  //  ⚠ 약초꾼(공격력 0)을 시작에 안 넣은 이유: 처음 온 사람이 예산을 흘리기 쉽다.
  //
  //  ⚠ 뒤로 갈수록 비싸고 특이하게 — 마지막이 가장 강한 것(쇠뇌 진지 50)이어야
  //    사다리 끝이 사건이 된다. 보스 회차(10·20·30)에 셋을 배치해 **보스를 깬 보상**이
  //    되게 했다.
  //  ⚠ 표에 없는 유닛은 **처음부터 열려 있다**(`unlockAt` 이 0 을 돌려준다).
  //    새 유닛을 넣고 여기 안 적으면 조용히 다 열리는 쪽으로 실패한다 — 감사가 센다.
  UNLOCK: {
    bayonet: 0,      // 전사        10  시작 · 벽
    rifleman: 0,     // 궁수        20  시작 · 원거리
    grenadier: 0,    // 투석꾼      20  시작 · 광역(물렁해서 자리를 잘 잡아야 한다)
    sergeant: 0,     // 족장        30  시작 · 아군 공격력 버프
    shieldman: 5,    // 방패병      30  **첫 해금** — 이제 진짜 벽을 세운다
    medic: 8,        // 약초꾼      30  회복 — 진형을 오래 살린다
    sniper: 10,      // 투창병      40  ★보스 보상 · 자동명중 고화력
    chemtrooper: 15, // 늪지기      40  둔화 — 영웅의 기동을 깎는다
    mine: 20,        // 가시덫      30  ★보스 보상 · 함정(완전히 다른 축)
    mgnest: 42,      // 쇠뇌 진지   50  ★사다리의 끝 — **가장 비싼 유닛**이 마지막이다
    //  ── 확장 4종 (2026-08-08) ─────────────────────────────────────────────
    //  ⚠ 사이를 벌려 끼웠다. 해금이 붙어 있으면 한 회차에 둘이 열려서 **둘 다
    //    안 써 보고 넘어간다** — 새 유닛을 넣는 값어치가 사라진다.
    //    최종 간격: 5·8·10·12·15·18·20·22·25·28·30·32·35·38·40·42
    //  ⚠ 쇠뇌 진지를 30 → **35 로 밀었다.** 확장하면서 망치잡이를 끝에 뒀더니
    //    사다리의 마지막이 40원짜리가 되어 "끝이 사건이어야 한다"가 깨졌다
    //    (감사가 잡았다). 가장 비싼 50원이 끝을 지킨다.
    palisade: 12,    // 울짱꾼      30  자리를 갉는다 — 진형이 '구역'을 갖는 첫 수단
    reflector: 18,   // 되받이      40  받아친다 — 영웅이 때릴수록 손해 보는 첫 수단
    shellwright: 25, // 껍질장이    40  선불 보호막 — 회복(약초꾼)과 다른 축
    hammer: 30,      // 망치잡이    40  방어 관통 — 방어를 두껍게 만 영웅을 벌준다
    //  ── 확장 2차 (2026-08-08) ──
    hivethrower: 22, // 벌집꾼      30  죽으면 터진다 — 처치 '순서'가 아니라 '위치'를 묻는다
    vinewhip: 28,    // 덩굴채      40  끌어당긴다 — 원거리 영웅의 안전거리를 지운다
    //  ── 확장 3차 (2026-08-08) ──
    //  ⚠ 35 아래는 "연달아 열리지 않는다"(간격 2 이상) 규율로 **이미 꽉 찼다.**
    //    억지로 끼우면 한 회차에 둘이 열려서 둘 다 안 써 보고 넘어간다 — 그래서
    //    위로 늘리고, 가장 비싼 쇠뇌 진지를 35 → 42 로 밀어 끝을 계속 지키게 했다.
    stonepiler: 32,  // 돌쌓이      30  아군이 쓰러질수록 커진다 — 처치 순서를 벌준다
    ashthrower: 35,  // 잿가루꾼    40  스킬을 늦춘다 — 아껴 쓰게 만든다(봉인이 아니다)
    knotter: 38,     // 매듭지기    40  피해를 나눈다 — 집중 처치를 무효로 만든다
    emberthrower: 40 // 불씨꾼      40  땅에 불이 남는다 — 전장이 시간에 따라 좁아진다
  },

  //  이 유닛이 열리는 회차. 0 이면 처음부터.
  unlockAt: function (typeKey) {
    var k = (GAME.UnitLevel && GAME.UnitLevel.baseKeyOf) ? GAME.UnitLevel.baseKeyOf(typeKey) : typeKey;
    var v = this.UNLOCK[k];
    return (typeof v === 'number') ? v : 0;
  },

  //  ⚠ 기준은 **지금 회차가 아니라 최고 기록(best)** 이다. 회차는 '1회차부터 다시'로
  //    되돌릴 수 있는데, 한 번 연 것이 그때 닫히면 벌처럼 느껴진다.
  //    `best` 는 그 사람이 실제로 도달했던 곳이라 되돌아가지 않는다.
  unlockedFloor: function () {
    var rec = this.get();
    return Math.max(rec.best || 0, (rec.floor || 1) - 1);
  },

  isUnlocked: function (typeKey) {
    var at = this.unlockAt(typeKey);
    return at <= 0 || this.unlockedFloor() >= at;
  },

  //  지금 쓸 수 있는 유닛들(팔레트 순서 그대로).
  unlockedList: function () {
    var out = [], order = GAME.UNIT_ORDER || [];
    for (var i = 0; i < order.length; i++) if (this.isUnlocked(order[i])) out.push(order[i]);
    return out;
  },

  //  다음에 열리는 것 — 화면이 "무엇을 향해 오르는가"를 말할 수 있게.
  //  { key, at, left } 또는 null(전부 열림).
  nextUnlock: function () {
    var cur = this.unlockedFloor(), order = GAME.UNIT_ORDER || [];
    var best = null;
    for (var i = 0; i < order.length; i++) {
      var at = this.unlockAt(order[i]);
      if (at > cur && (!best || at < best.at)) best = { key: order[i], at: at, left: at - cur };
    }
    return best;
  },

  //  이 회차를 **깨서** 새로 열린 것들. 결과 화면이 축하하는 데 쓴다.
  //  ⚠ `clear()` 뒤에 부른다 — 그때 `best` 가 이미 올라가 있다.
  unlockedBy: function (clearedFloor) {
    var out = [], order = GAME.UNIT_ORDER || [];
    for (var i = 0; i < order.length; i++) {
      if (this.unlockAt(order[i]) === clearedFloor) out.push(order[i]);
    }
    return out;
  },

  // 이 층에 올라오는 영웅 — **층 순환식**(v0.34).
  //
  // 예전에는 숙련도 구간으로 골랐다(`skill<0.3 광전사 / <0.78 파수꾼 / 그 위 사냥꾼`).
  // 숙련도가 층에 매여 있어서 실질적으로는 **1~7층 광전사 / 8~20층 파수꾼 / 21층~ 사냥꾼**,
  // 즉 층마다 상대가 통째로 바뀌는 구간제였다. 영웅 간 '처치 필요 원피해'가 2.7배라
  // 진형 화력은 숫자 하나인데 문턱만 2.7배 튀고, **구간 경계에서 방어율이 0%↔100% 계단**이 됐다
  // (실측: 같은 진형·같은 층에서 영웅만 바꾸면 21% ↔ 100%, 편차 79%p).
  // 계단이 남아 있으면 "이 진형이 8층에서 0%"라는 관측이 진형 탓인지 그 층이 마침
  // 파수꾼 구간이라서인지 **구분되지 않는다** — 원형 조사가 통째로 읽히지 않는다.
  //
  // 그래서 연속 3개 층에 세 영웅이 전부 나오게 순환시킨다. 계단이 평균으로 녹고,
  // **전략가는 한 배치로 세 영웅을 다 막아야 하므로 배치에 깊이가 생긴다**
  // (부수 효과가 아니라 이게 노림수다).
  // 남은 영웅 간 격차는 `HERO_DIFF` 로 상쇄한다 — `heroes.js` 는 건드리지 않는다.
  //
  // ⚠ `skill` 인자는 더 이상 쓰지 않지만 시그니처는 남긴다(호출부 6곳을 안 건드리려고).
  //   일반 방어전(수성의 탑 아님)의 "수색대는 숙련 78% 이상에서만" 규칙은
  //   `scenes/defend.js` 의 다른 가지에 있어 이 변경의 영향을 받지 않는다(확인함).
  heroKeyFor: function (floor, skill) {
    var f = Math.max(1, floor);
    // 1~3층은 연습 구간이라 **가장 순한 상대(광전사)로 고정**한다.
    // 순환을 그대로 적용했더니 3층이 파수꾼이 되어 무배치 방어 성공률이 58% → 33% 로
    // 떨어졌다(실측, rep24). 연습 구간이 동전 던지기가 되면 초반 이탈로 직결된다.
    // 4층부터는 순환이라 4·5·6층에 세 영웅이 전부 나온다 — 노림수는 그대로 유지된다.
    if (f <= this.EARLY_FLOORS) return 'vanguard';
    if (this.isBossFloor(f)) {
      // 보스 층도 순환한다. 결과적으로 보스 층을 낀 3개 층에도 세 영웅이 전부 들어간다
      // (예: 9·10·11층 = 파수꾼·광전사·사냥꾼).
      var idx = Math.floor(f / this.BOSS_EVERY) - 1;
      return GAME.HERO_ORDER[idx % GAME.HERO_ORDER.length];
    }
    return GAME.HERO_ORDER[(f - 1) % GAME.HERO_ORDER.length];
  },

  // 층 방어 성공 — 영웅 하나를 격파했다.
  //  state 를 주면 그 판에서 번 골드(피해 비례 + 격퇴 몫)를 함께 넣는다.
  clear: function (floor, placed, tier, state) {
    var rec = this.get();
    rec.kills = (rec.kills || 0) + 1;
    rec.floor = floor + 1;
    if (floor > (rec.best || 0)) rec.best = floor;
    rec.gold = (rec.gold || 0) + this.earnedFrom(state);
    //  메타 이벤트(v3.0) — 회차 방어 성공. 조건 판정은 Achievements/Daily 가 한다.
    try {
      if (GAME.Achievements && GAME.Achievements.emit) GAME.Achievements.emit('dtowerClear', { run: floor });
      if (GAME.Daily && GAME.Daily.emit) GAME.Daily.emit('dtowerClear', { run: floor });
      if (GAME.Progress && GAME.Progress.emit) GAME.Progress.emit('dtowerClear', { run: floor });
    } catch (e) {}
    // 다음 층에서 같은 배치로 이어갈 수 있게 남긴다(고칠 수도 있다)
    if (placed) { rec.placed = placed; rec.tier = tier || null; }
    this._save(rec);
    return rec;
  },

  // 실패 — **아무것도 안 지운다.** 회차·골드·유닛 레벨·정련·증원·배치도가 전부 남는다.
  //
  //  ── 2026-08-07 · 옛 규칙(1회차부터 다시)을 버렸다 ─────────────────────────
  //  옛 주석은 리셋의 근거를 이렇게 적어 두었다:
  //    "영구 성장으로 두면 1층이 통째로 무의미해지고(레벨 5 진형으로 1층을 도는 상태),
  //     무배치 기준선(SC-4)도 '골드가 얼마나 쌓였느냐'에 따라 달라져 측정 자체가 안 된다."
  //  그 우려는 **여전히 옳고, 이번 변경이 그 둘을 각각 푼다**:
  //    · 1층이 무의미해지는 문제 → `heroModsFor` 의 성장 추종(내가 세지면 영웅도 센다)
  //    · 측정이 안 되는 문제     → `tools/defend-curve.js` 의 고정 성장 프로필
  //  같은 주석의 "두 탑의 패배 규칙이 여기로 통일됐다"(2026-07-29)는 **이미 낡았다** —
  //  통곡의 탑이 2026-08-01 에 "패배해도 층 유지"로 바꿨고, 수성의 탑만 옛 규칙에
  //  혼자 남아 있었다. 서버 실측이 그 결과를 그대로 보여 준다(수성 최고 25회차 vs
  //  통곡 최고 62층) — 숫자 크기의 차이는 난이도가 아니라 리셋 규칙의 차이였다.
  //
  //  ⚠ `placed` 와 `tier` 는 **짝이다.** 한쪽만 남기면 등급표가 어긋나 거짓이 된다.
  //    둘 다 남기는 것이 이 변경의 핵심이다 — `js/scenes/build.js` 가 이미
  //    `DefendTower.get().placed` 를 읽어 이어가는 코드를 갖고 있어 그 경로가 살아난다.
  //  ⚠ 완화(`noteFloorFail`)는 여기서 부르지 않는다. 이 함수는 **저장만** 하고,
  //    "졌다"는 사건은 씬(`js/scenes/defend.js`)이 한 곳에서 기록한다 —
  //    두 곳에서 세면 한 번의 패배가 두 번 세어진다.
  //
  //  ⚠⚠ **진 판의 배치를 반드시 여기서 남긴다** (2026-08-07 검토에서 잡힘).
  //    처음 판은 `clear()` 에서만 `placed` 를 저장했다. 그러면 배치를 고쳐서 진 판의
  //    수정이 통째로 사라지고 `rec.placed` 가 **'마지막으로 이긴 배치'** 로 되돌아간다:
  //      9회차를 A 로 깬다 → 10회차를 B 로 고쳐 붙는다 → 진다 → 재도전이 **A** 로 들어간다.
  //    "매 패배의 질문이 '무엇을 고칠까'가 된다"는 이 개편의 노림수가 정확히 거기서
  //    무너진다 — 고친 것이 매번 지워지니까. 성장 시트의 강화 목록(`_growthTypes`)과
  //    로비 미리보기(`growthIndex(null, …)`)도 같이 어긋난다.
  //  ⚠ `placed` 와 `tier` 는 **짝이다.** 한쪽만 남기면 등급표가 거짓이 된다.
  fail: function (placed, tier) {
    var rec = this.get();
    rec.runs = (rec.runs || 0) + 1;
    if (placed) { rec.placed = placed; rec.tier = tier || null; }
    this._save(rec);
    return rec;
  },

  // ── 진행만 처음으로 되돌린다 (2026-08-07 신설) ─────────────────────────────
  //  옛 `fail()` 이 이 일을 겸하고 있었다. 영구 성장으로 바뀌며 그 겸직이 끝났는데,
  //  '1회차부터 다시' 버튼 두 개가 여전히 `fail()` 을 부르고 있어 **누르면 아무 일도
  //  안 일어나는 상태**였다(검토에서 잡힘).
  //  ⚠ `best`(랭킹 점수의 근거)와 `seed`(영웅 성격 — 다시 굴리면 같은 회차가 딴 놈이
  //    된다)는 남긴다. `runs` 도 누적값이라 남긴다.
  //  ⚠ 부르는 쪽이 **반드시 확인을 받아야 한다.** 영구 성장이 된 이상 실수로 누르면
  //    잃는 것이 크다(통곡의 탑의 캐릭터 삭제와 같은 무게다).
  restartRun: function () {
    var rec = this.get();
    rec.floor = 1;
    rec.placed = null;
    rec.tier = null;
    rec.gold = 0;
    rec.unitLv = {};
    rec.refine = {};
    rec.bonusBudget = 0;
    delete rec.floorFail;      // 완화도 같이 지운다 — 새 도전이다
    this._save(rec);
    return rec;
  },

  reset: function () {
    var all = this._all();
    delete all[this._key()];
    GAME.Store.set(this.KEY, all);
  }
};
