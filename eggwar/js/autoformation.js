window.GAME = window.GAME || {};

// AI 전략가 — 예산과 상대 성향을 받아 배치도를 스스로 짠다.
//
// 무작위로 뽑지 않는다. 관측된 성향의 **약점을 노리는 조합**을 고른다:
//   · 파고드는 유형   → 가시덫 + 투석(광역) + 방패병 벽. 뛰어드는 순간을 응징한다.
//   · 거리 두는 유형  → 투창병(유도·회피불가) + 쇠뇌 진지(장거리). 멀리 있어도 닿는다.
//   · 중거리 유형     → 궁수 물량 + 늪지기(둔화)로 거리를 못 유지하게 만든다.
//   · 회피 능숙       → 논타겟을 줄이고 **타겟(유도)** 비중을 올린다. 피해도 맞는다.
//   · 회피 미숙       → 값싼 논타겟 물량이 더 효율적이다.
//
// 배치는 띠(band)로 나눠 앞에 벽, 뒤에 화력·지원을 둔다.
GAME.AutoFormation = {

  // ── 영웅별 카운터 ────────────────────────────────────────────
  // 한 진형이 모든 영웅을 커버할 수는 없다. 그래서 **어떤 영웅인지 먼저 보고** 짠다.
  // 각 항목은 가중치 보정 + 배치 간격 지시를 함께 낸다.
  HERO_COUNTERS: {
    // 파수꾼: 체력·방어력·흡혈이 전부 최고. 유일한 약점은 **느리고(142) 근접(72)** 이라는 것.
    // 흡혈 25% 가 120° 부채꼴로 여러 기를 동시에 때릴 때 폭발하므로,
    // 붙여 놓으면 오히려 회복시켜 준다 → **넓게 벌리고 멀리서 때린다.**
    warden: {
      w: { sniper: 16, mgnest: 12, rifleman: 8, chemtrooper: 10, mine: 8,
           bayonet: -6, shieldman: -4, medic: -2 },
      spread: 1.45,        // 좌우로 더 벌린다 (부채꼴 흡혈 방지)
      why: '파수꾼은 흡혈로 버틴다 → 뭉치지 않고 넓게 벌려, 붙기 전에 원거리로 녹인다'
    },
    // 광전사: 돌진해 들어와 휘젓는다. 들어오는 순간을 응징하는 게 답.
    vanguard: {
      w: { mine: 14, grenadier: 12, shieldman: 10, bayonet: 6, sergeant: 4,
           sniper: -3, mgnest: -2 },
      spread: 0.85,        // 촘촘히 — 돌진 지점을 겹쳐서 덮는다
      why: '광전사는 파고든다 → 가시덫·투석으로 진입 지점을 응징하고 방패병으로 막는다'
    },
    // 사냥꾼: 얇고(620) 빠르다(178). 거리를 벌리며 싸우므로 멀리 닿는 수단이 필요하다.
    ranger: {
      w: { sniper: 15, mgnest: 12, chemtrooper: 9, rifleman: 6,
           bayonet: -5, mine: -4, shieldman: -3 },
      spread: 1.15,
      why: '사냥꾼은 거리를 벌린다 → 유도 투창과 고정 화력으로 도망칠 곳을 없앤다'
    }
  },

  counterFor: function (heroKey) {
    return (heroKey && this.HERO_COUNTERS[heroKey]) || null;
  },

  // 성향 → 유닛별 가중치. heroKey 를 주면 그 영웅의 카운터가 얹힌다.
  //
  // ── `readMul` — **얼마나 세게 읽을 것인가** (2026-08-01 사용자 지시) ────────────
  //  "통곡의 탑에서 가장 중요한 건 AI 학습이야. 갈수록 어려워진다 + 나를 간파하네
  //   라는 걸 꼭 느낄 수 있게 해야 해."
  //
  //  예전엔 성향 반영이 **켜짐/꺼짐**이었다(tower.js 의 `floor >= 3`). 3층에서 켜진 뒤
  //  40층까지 세기가 똑같으니 "갈수록 나를 간파한다"가 성립할 수가 없었다 —
  //  세지는 것은 예산뿐이었고 그건 '많아진다'이지 '읽힌다'가 아니다.
  //  이제 층이 오를수록 성향 보정을 **곱해서** 키운다. 같은 성향이라도 고층일수록
  //  카운터가 날카로워진다.
  //  ⚠ 영웅 카운터(HERO_COUNTERS)에는 안 곱한다 — 그건 '무엇을 들고 왔나'라는
  //    확정 정보이지 관측으로 배운 것이 아니다. 배운 것만 자라야 학습으로 읽힌다.
  // ── 세계 가중 (시즌2 「다섯 세계」, 2026-09-03 S-W) ─────────────────────────
  //  진단: 확장 10종이 `weights` 표에 없어 기본값 1 로 뽑혔다 — 1161기 중 18기.
  //  세계마다 **그 세계의 유닛**을 세게 가중한다(플랜 §1 S-W 표). 초원은 비어 있어
  //  옛 10종 가중 그대로(R-3·1~30층 기준선). 교육 과정(allowTypes)이 아직 안 푼 종류는
  //  가중을 줘도 `_pick` 의 allowed 목록에 없어 안 뽑힌다 — 표가 앞서가도 안전하다.
  //  ⚠ 값이 큰 이유: `_pick` 은 가중치를 **단가^0.75 로 나눈다**(예산 1원당 가치). 전사(10)는
  //    w=10 이 곧 1.78 인데 확장 유닛(40)은 w=12 가 0.75 라 여전히 전사가 2.4배 더 뽑혔다
  //    (실측 12·15% — tools/tower-world-audit.js (c)). 단가 40 유닛이 전사와 같은 확률이
  //    되려면 w≈28 이 필요하고, 종류 상한(maxPerFormation 1~2)까지 겹치므로 그 위로 잡는다.
  //    세계 밖 기본 유닛(전사·궁수·투석꾼)은 살짝 내린다 — 안 내리면 자리가 안 난다.
  //  ⚠ 위로도 상한이 있다 — 확장 유닛은 **값이 스탯이 아니라 기제**라(units.js 3단계 주석:
  //    전사 240hp/10골드 vs 덩굴채 230hp/40골드) 세계 유닛 비중이 오를수록 진형의 **원시
  //    체력 합**이 준다. tools/tower-power-curve.js(ehp합÷dps 근사치)로 실측: 비중 35~40%
  //    에서 30→60층 비율이 glass 1.17 → 0.96 으로 떨어졌다(근사치는 기제 — 매듭·보호막·
  //    되받이·끌기 — 를 못 본다). 비중 ~25% 가 "세계가 읽히되 원시 위협이 덜 빠지는" 선이다.
  WORLD_WEIGHTS: {
    meadow: {},
    mire:   { vinewhip: 18, knotter: 15, shellwright: 12, hivethrower: 10, reflector: 8, chemtrooper: 7,
              bayonet: -2 },
    ash:    { emberthrower: 26, ashthrower: 22, hammer: 26, hivethrower: 5,
              bayonet: -3, grenadier: -3, shieldman: -2 },
    rift:   { stonepiler: 26, reflector: 20, palisade: 22, hammer: 5, knotter: 4,
              bayonet: -3, rifleman: -3, sniper: -3 },
    storm:  { reflector: 10, palisade: 8, shellwright: 8, hammer: 10, hivethrower: 8, vinewhip: 10,
              ashthrower: 8, stonepiler: 10, knotter: 8, emberthrower: 10, bayonet: -3 }
  },
  //  세계에서 교리 핵심(정예)으로 키울 수 있는 확장 종류 — 근접/원거리 풀에 더한다.
  //  ⚠ `opts.world` 가 있을 때만(통곡의 탑) 넓힌다. 대전·수성의 탑은 이 함수를 안 부르지만,
  //    기본 풀을 건드리면 옛 측정(formation-diversity)이 갈라진다.
  MELEE_EXT: ['reflector', 'hammer', 'stonepiler', 'knotter', 'vinewhip', 'hivethrower', 'ashthrower'],
  RANGED_EXT: ['emberthrower'],

  //  ── AI 회계 단가 — 확장 유닛의 **스탯 몫** (시즌2 S-W, 실측으로 잡음) ─────────────
  //  확장 10종의 값은 스탯이 아니라 **기제**가 정한다(units.js 3단계 주석: 전사 240hp/10골드 vs
  //  덩굴채 230hp/40골드). 그 가격은 **사람이 뜻을 갖고 놓는** 수성의 탑 기준이라, AI 진형이
  //  같은 값으로 사면 예산의 3/4 이 스탯이 아닌 곳으로 간다 — 실측(tools/sim.js A/B, fresh
  //  영웅 AIHero 0.9): 45층 돌파 13% → **88%**, 75층 0% → 58%. 세계가 층을 **쉽게** 만든다.
  //  그래서 통곡의 탑의 질 배수(js/tower.js qualityMul — "못 쓴 예산은 질로 태운다")가 지출을
  //  셀 때 확장 유닛은 이 **스탯 몫 단가**로 센다: 기제 값(단가−스탯 몫)은 예산에서 '안 쓴 돈'
  //  이 되어 진형 전체의 질로 돌아온다. 총 위협 ≈ 예산이라는 회계가 유지되고, 확장 유닛은
  //  그 위에 기제를 얹는다. 초원에는 확장 유닛이 없어 1~30층 회계는 한 톨도 안 바뀐다.
  //  값은 **실측으로 잡았다**(같은 A/B, 단가를 12 → 8 → 5 로 내리며 fresh 영웅 돌파율을 봄):
  //    45층 46% → 29% → 21%(기본 진형 13%) · 55층 63% → 54% → 38%(기본 38%) · 75층 4% → 4% → 0%(0%)
  //  즉 AI 손에서 확장 유닛의 스탯 몫은 **5~6골드어치**다(hp×dps 산수 7~8 보다 낮다 — 사거리
  //  50~58·속도 96~105 라 AIHero 를 못 따라잡는 몫만큼 더 빠진다). 방어 관통(망치)·누적(돌쌓이)
  //  처럼 스탯으로 직접 듣는 기제만 한 눈금 위.
  AI_STAT_COST: {
    reflector: 6, palisade: 5, shellwright: 5, hammer: 8, hivethrower: 6,
    vinewhip: 6, ashthrower: 5, stonepiler: 8, knotter: 6, emberthrower: 6
  },
  //  진형 키(정예 파생 포함)의 AI 회계 단가. 확장 유닛이 아니면 실제 단가 그대로.
  //  정예 파생은 실제 단가 비율(파생/원본)을 스탯 몫에 그대로 곱한다.
  statCostOf: function (typeKey) {
    var d = GAME.UNITS[typeKey];
    if (!d) return 0;
    var base = (GAME.UnitLevel && GAME.UnitLevel.baseKeyOf) ? GAME.UnitLevel.baseKeyOf(typeKey) : typeKey;
    var sc = this.AI_STAT_COST[base];
    if (sc === undefined) return d.cost || 0;
    var bd = GAME.UNITS[base];
    var ratio = (bd && bd.cost) ? (d.cost || bd.cost) / bd.cost : 1;
    return sc * ratio;
  },

  weights: function (p, heroKey, readMul, world) {
    var RM = (typeof readMul === 'number' && readMul > 0) ? readMul : 1;
    // ── 2026-07-31 · 기여도 실측 반영 (tools/unit-contribution.js) ─────────────
    //  뺑뺑이 영웅 상대로 재 보니 유닛별 기당 피해가 **519 ~ 13** 으로 40배 벌어졌다.
    //  1위 쇠뇌 진지(519, 못때림 0%) — 고정이지만 사거리가 맵 전체라 **도망칠 수 없는
    //  유일한 유닛**이다. 그런데 가중치가 3 이라 거의 안 뽑혔다.
    //  꼴찌 늪지기(13) 는 사거리를 390 으로 올려 역할을 바꿨다(units.js 참조) →
    //  이제 '거리 유지'를 벌주는 유닛이므로 가중치를 함께 올린다.
    //  투창병(sniper, 사거리 420·자동명중)도 뺑뺑이에 강한데 4 로 낮았다.
    //  ⚠ 이 표는 **뺑뺑이 대응 능력** 순으로 다시 잡은 것이다. 값을 되돌리려면
    //    먼저 unit-contribution 을 다시 돌려 근거를 갱신할 것.
    var w = {
      bayonet: 10, rifleman: 9, grenadier: 6, sniper: 8,
      shieldman: 5, medic: 3, sergeant: 4, chemtrooper: 8, mgnest: 8, mine: 0
    };

    // 영웅 카운터가 성향보다 우선한다 — 상대가 뭘 들고 오는지가 가장 확실한 정보다
    var ctr = this.counterFor(heroKey);
    if (ctr) for (var ck in ctr.w) w[ck] = (w[ck] || 0) + ctr.w[ck];

    //  세계 가중 — 확정 정보(어느 세계인가)라 readMul 을 안 곱한다(영웅 카운터와 같은 이유).
    var ww = world && this.WORLD_WEIGHTS[world];
    if (ww) for (var wk in ww) w[wk] = (w[wk] || 0) + ww[wk];

    if (!p) {
      for (var k0 in w) if (w[k0] < 1) w[k0] = 1;
      return w;
    }

    // 관측으로 배운 보정은 전부 `RM` 배로 커진다(위 readMul 주석).
    var add = function (k, v) { w[k] = (w[k] || 0) + v * RM; };

    if (p.style === 'brawler') {
      add('mine', 14); add('grenadier', 10); add('shieldman', 9); add('bayonet', 6); add('sergeant', 3);
      add('sniper', -2); add('mgnest', -1);
    } else if (p.style === 'kiter') {
      add('sniper', 14); add('mgnest', 10); add('rifleman', 5); add('medic', 3);
      add('bayonet', -4); add('mine', -2); add('shieldman', -2);
    } else {
      add('rifleman', 8); add('chemtrooper', 9); add('bayonet', 3); add('grenadier', 3);
    }

    if (p.dodge > 0.65) {
      // 논타겟을 잘 피한다 → 반드시 맞는 쪽으로
      add('sniper', 12); add('chemtrooper', 4);
      add('rifleman', -4); add('grenadier', -3);
    } else if (p.dodge < 0.35) {
      add('rifleman', 7); add('grenadier', 6);
      add('sniper', -3);
    }

    for (var k in w) if (w[k] < 1) w[k] = 1;
    return w;
  },

  // 가중치에 비례해 하나 뽑기.
  //
  // **비용으로 나눈다**는 게 핵심이다. 유닛 단위 확률로 뽑으면 투창병(40)과 전사(10)이
  // 같은 확률로 뽑히는데, 투창병 하나는 예산을 네 배 먹는다. 그 결과 예산 220 에
  // 10기밖에 못 세우고 방어율이 17% 까지 떨어졌다(같은 예산 잘 짠 배치는 19기·67%).
  // 가중치를 '예산 1원당 가치'로 해석해야 물량이라는 전략 축이 살아난다.
  //
  // costOf 를 주면 그걸로 단가를 읽는다 — **정예(레벨업)는 단가가 오르므로**
  // 원본 단가로 뽑으면 "비싼 걸 싼 값에 뽑는" 셈이 되어 예산이 초과된다.
  // `def.aiExclude` 가 붙은 유닛은 AI 가 뽑지 않는다(2026-07-31, 기여도 실측).
  // 가중치를 0 으로 두는 것만으로는 부족하다 — 다른 경로가 가중치를 더해 살아난다.
  _aiAllowed: function (t) {
    var d = GAME.UNITS[t];
    return !!d && !d.aiExclude;
  },

  _pick: function (w, allowed, costOf) {
    allowed = (allowed || []).filter(GAME.AutoFormation._aiAllowed);
    var total = 0, k, i;
    var eff = {};
    for (i = 0; i < allowed.length; i++) {
      k = allowed[i];
      var cost = Math.max(1, costOf ? costOf(k) : GAME.UNITS[k].cost);
      eff[k] = (w[k] || 1) / Math.pow(cost, 0.75);
      total += eff[k];
    }
    if (total <= 0) return null;
    var r = Math.random() * total;
    for (i = 0; i < allowed.length; i++) {
      k = allowed[i];
      r -= eff[k];
      if (r <= 0) return k;
    }
    return allowed[allowed.length - 1];
  },

  // ══════════════════════════════════════════════════════════════════════════
  //  교리(doctrine) — **'수' 대신 '질'을 고를 수 있게 한다**
  // ══════════════════════════════════════════════════════════════════════════
  //  사용자 신고: "통곡의 탑 난이도가 단순히 유닛 수만 올라가는 형태로 되고 있다."
  //  실측으로 확인됨 — 변경 전 20판 전부 레벨 1 이고, 층이 오르면 유닛 수만 늘었다.
  //
  //  그래서 예산을 쓰는 **방식**을 여러 개 만들고, 그중 하나를 성향을 근거로 고른다.
  //   · 물량      — 지금까지의 방식. 값싼 유닛을 최대한 많이.
  //   · 선봉      — 주력 원거리 한 종류만 중간 레벨.
  //   · 돌격 정예 — 근접 2종을 고레벨 + '돌격'(이동속도). **"너무 잘 피하네" 의 답이다.**
  //   · 저격 정예 — 원거리 **한 종류만** 크게 강화. 붙어 싸우는 상대를 거리에서 두들긴다.
  //   · 방벽      — 앞줄 한 종류를 '경화'(체력·방어)로 두껍게.
  //
  //  ⚠ **레벨 비용은 이 예산에서 나간다**(`UnitLevel.PREMIUM`). 공짜로 얹으면 그건
  //     선택이 아니라 그냥 난이도 상승이고, 요청받은 것이 아니다. 값을 치르니까
  //     정예를 고르면 자연히 유닛 수가 줄어든다 — 그게 "소수 정예"다.
  MELEE_POOL: ['bayonet', 'shieldman'],
  RANGED_POOL: ['rifleman', 'sniper', 'grenadier', 'chemtrooper', 'mgnest'],

  DOCTRINES: {
    swarm: {
      label: '물량', wall: 0.34, ranged: 0.30, group: null, coreN: 0,
      traits: [], coreBias: 1,
      why: '값싼 유닛을 최대한 많이 세워 몸과 화력으로 밀어붙인다'
    },
    spearhead: {
      label: '선봉', wall: 0.32, ranged: 0.36, group: 'ranged', coreN: 1,
      traits: [], coreBias: 1.35, lvCap: 3,
      why: '주력 원거리 한 종류만 키워 화력의 중심을 만든다'
    },
    chargeElite: {
      label: '돌격 정예', wall: 0.56, ranged: 0.22, group: 'melee', coreN: 2,
      traits: ['charge'], coreBias: 1.6,
      why: '이동속도와 체력을 올린 근접을 소수만 투입해 거리를 지우고 붙는다'
    },
    sharpshooter: {
      label: '저격 정예', wall: 0.28, ranged: 0.46, group: 'ranged', coreN: 1,
      traits: ['marksman'], coreBias: 1.8,
      why: '원거리 한 종류만 크게 강화해 붙기 전에 녹인다'
    },
    bulwark: {
      label: '방벽', wall: 0.46, ranged: 0.32, group: 'melee', coreN: 1,
      traits: ['hardened'], coreBias: 1.5,
      why: '앞줄 한 종류를 두껍게 만들어 진형이 먼저 무너지지 않게 한다'
    }
  },

  // 예산이 클수록 높은 레벨을 감당할 수 있다. **1 이면 정예를 아예 안 뽑는다.**
  // 경계 150 은 통곡의 탑 1~3층(예산 100~108)을 확실히 제외하기 위한 값이다 —
  // 연습 구간에 정예가 나오면 "1~3층은 쉽다"는 약속이 흔들린다.
  ELITE_MIN_BUDGET: 150,
  //  ⚠ 2026-08-02 — **상한을 5 에서 풀었다**(사용자: "단순히 유닛이 많아지는거로
  //    대응하면안돼. 전략배치 유닛 레벨업 기능을 더 활용해줘").
  //    실측: 통곡의 탑 진형 예산은 **9층에서 275** 라 그 뒤로 이 함수가 계속 5 만
  //    돌려줬다. 즉 10층부터 300층까지 예산이 늘어도 갈 곳이 **머릿수뿐**이었다.
  //    이제 예산이 커지면 레벨이 계속 오른다(js/unitlevel.js `AI_MAX`).
  //    정예는 단가에 프리미엄이 붙으므로(`premiumFor`) 레벨이 오르면 **같은 예산으로
  //    더 적은 수**를 세우게 된다 — "많이" 대신 "강하게"가 자동으로 성립한다.
  //  실측 대응(진형 예산 → 레벨): 9층 275→5 · 30층 359→6 · 60층 479→7 · 80층 559→8.
  TIER_STEPS: [150, 200, 270, 340, 420, 520, 640, 800, 1000, 1250],
  tierFor: function (budget) {
    if (budget < this.ELITE_MIN_BUDGET) return 1;
    // 첫 구간은 예전 그대로 3 → 4 → 5 로 오른다(저층 감각을 안 바꾸려는 것).
    var lv = 3;
    for (var i = 1; i < this.TIER_STEPS.length; i++) {
      if (budget < this.TIER_STEPS[i]) break;
      lv++;
    }
    var cap = (GAME.UnitLevel && GAME.UnitLevel.AI_MAX) || 5;
    return lv > cap ? cap : lv;
  },

  //  교리별 레벨 상한. 예전엔 `lvCap` 이 **절대 레벨**(선봉=3)이었는데, 상한이
  //  풀린 지금 그대로 두면 선봉만 영원히 L3 에 묶여 후반에 종이처럼 얇아진다.
  //  그래서 **비율**로 해석한다 — `lvCap/5` 만큼만 올라간다(선봉은 60%).
  _lvFor: function (budget, doctrine) {
    var tier = this.tierFor(budget);
    if (!doctrine || !doctrine.lvCap) return tier;
    return Math.max(1, Math.min(tier, Math.round(tier * (doctrine.lvCap / 5))));
  },

  // 최근에 쓴 교리는 확률을 낮춘다. **같은 전략이 연달아 나오면 '벽'으로 느껴진다** —
  // 층마다 다른 답을 요구해야 탑을 오르는 재미가 생긴다.
  _recent: [],
  RECENT_KEEP: 2,
  RECENT_MUL: 0.40,

  // 성향 → 교리 가중치. **분포를 성향이 정하고, 그 안에서만 무작위다.**
  // 순수 난수로 흔들면 "AI 가 나를 읽는다"는 이 게임의 약속이 깨지고,
  // 성향으로 하나만 결정하면 매판 같은 전략이 나와 "벽"이 된다. 둘 사이가 답이다.
  doctrineWeights: function (p, heroKey) {
    var w = { swarm: 30, spearhead: 26, chargeElite: 16, sharpshooter: 16, bulwark: 12 };

    // 영웅이 확정된 경우(도전 중이 아닐 때 tower.js 가 넘긴다)가 가장 확실한 정보다
    if (heroKey === 'warden') {
      // 파수꾼은 광역 흡혈로 버틴다 — 붙여주면 오히려 회복시킨다(HERO_COUNTERS 참조)
      w.sharpshooter += 26; w.spearhead += 10; w.chargeElite -= 12;
    } else if (heroKey === 'vanguard') {
      w.swarm += 14; w.bulwark += 16; w.chargeElite -= 6;
    } else if (heroKey === 'ranger') {
      w.chargeElite += 18; w.sharpshooter += 14;
    }

    if (!p || !p.battles) return this._floorW(w);

    // 표본이 적으면 약하게 건다 — 몇 판 안 본 사람에게 확신하면 매판 같은 게 날아온다.
    var conf = (p.conf === undefined) ? Math.min(1, p.battles / 6) : p.conf;
    var dC = (p.dodgeConf === undefined) ? conf : p.dodgeConf;
    var sC = (p.styleConf === undefined) ? conf : p.styleConf;

    if (p.style === 'brawler') {
      // 근접에서 싸운다 → 거리에서 두들긴다
      w.sharpshooter += 46 * sC; w.spearhead += 14 * sC; w.chargeElite -= 10 * sC;
    } else if (p.style === 'kiter') {
      // 거리를 둔다 → 빠른 근접으로 거리를 지운다
      w.chargeElite += 40 * sC; w.bulwark += 14 * sC; w.swarm -= 10 * sC;
    } else {
      w.spearhead += 24 * sC; w.swarm += 10 * sC;
    }

    // **"너무 잘 피하네" 가 정확히 이 신호다.**
    // 논타겟 물량이 안 맞으니 물량으로 답하는 건 낭비다 → 붙어서 압박한다.
    if (p.dodge > 0.65) {
      w.chargeElite += 44 * dC; w.sharpshooter += 10 * dC; w.swarm -= 20 * dC;
    } else if (p.dodge < 0.35) {
      // 못 피하면 값싼 논타겟 물량이 제일 효율적이다
      w.swarm += 34 * dC; w.spearhead += 12 * dC; w.sharpshooter -= 8 * dC;
    }

    // 영웅을 한 종류만 쓰는 사람에게는 그 영웅 카운터 쪽으로 더 기운다
    if (p.favHero && (p.favHeroShare || 0) > 0.7) {
      if (p.favHero === 'warden') w.sharpshooter += 20 * conf;
      else if (p.favHero === 'vanguard') w.bulwark += 18 * conf;
      else if (p.favHero === 'ranger') w.chargeElite += 16 * conf;
    }
    return this._floorW(w);
  },

  // 어떤 교리도 확률 0 이 되지 않게 — 0 이 있으면 그 전략은 영원히 안 나온다.
  // 마지막에 **학습 되먹임**(실제로 막아낸 교리인가)을 곱한다. 성향이 분포를 정하고
  // 학습은 그 분포를 기울이기만 한다 — 학습이 분포를 대체하면 다시 한 전략으로 수렴한다.
  _floorW: function (w) {
    var L = GAME.Learn;
    for (var k in w) {
      if (L && L.doctrineBias) w[k] *= L.doctrineBias(k);
      if (w[k] < 3) w[k] = 3;
    }
    return w;
  },

  // 배치도 id → 그 배치도를 짠 교리. `learn.js` 가 전투 결과를 되먹일 때 읽는다.
  // 무한히 쌓이지 않게 최근 것만 남긴다(탑은 층마다 id 가 다르다).
  _lastDoctrine: {},
  _doctrineIds: [],
  DOCTRINE_MEM: 64,
  lastDoctrineFor: function (id) { return (id && this._lastDoctrine[id]) || null; },
  _rememberDoctrine: function (id, doc) {
    if (!id) return;
    if (this._lastDoctrine[id] === undefined) this._doctrineIds.push(id);
    this._lastDoctrine[id] = doc;
    while (this._doctrineIds.length > this.DOCTRINE_MEM) {
      delete this._lastDoctrine[this._doctrineIds.shift()];
    }
  },

  chooseDoctrine: function (p, budget, heroKey) {
    if (this.tierFor(budget) <= 1) return 'swarm';   // 연습 구간 보호
    var w = this.doctrineWeights(p, heroKey), k, i;
    for (i = 0; i < this._recent.length; i++) {
      if (w[this._recent[i]] !== undefined) w[this._recent[i]] *= this.RECENT_MUL;
    }
    var total = 0;
    for (k in w) total += w[k];
    var r = Math.random() * total, pick = null;
    for (k in w) { r -= w[k]; if (r <= 0) { pick = k; break; } }
    if (!pick) pick = 'swarm';
    this._recent.push(pick);
    while (this._recent.length > this.RECENT_KEEP) this._recent.shift();
    return pick;
  },

  // 유닛이 놓일 띠 (ny: 0=맨 위, 전략가 구역은 0~0.30)
  bandOf: function (type) {
    switch (type) {
      case 'bayonet': case 'shieldman': return [0.24, 0.30];   // 앞 벽
      //  확장 근접(2026-09-03 S-W) — 표에 없으면 기본 [0.15,0.25] 로 떨어져 towerplan 의
      //  roleOf 가 'mid' 로 접었다: 망치잡이·되받이가 원거리 줄에 서서 앞 벽이 비었다.
      case 'reflector': case 'hammer': case 'stonepiler': case 'knotter':
      case 'vinewhip': case 'hivethrower': case 'ashthrower': return [0.24, 0.30];
      case 'palisade': return [0.20, 0.28];                    // 지형 — 벽 바로 뒤 길목
      case 'rifleman': case 'chemtrooper': case 'sergeant': return [0.15, 0.23];
      case 'grenadier': case 'mgnest': case 'emberthrower': return [0.11, 0.19];
      case 'sniper': case 'medic': case 'shellwright': return [0.04, 0.11];   // 뒤
      case 'mine': return [0.38, 0.47];                        // 중립지대(지나가는 길)
      default: return [0.15, 0.25];
    }
  },

  // 정예로 키울 '주력 종류'를 고른다. 무작위가 아니라 **가중치(=성향+영웅 카운터)에
  // 비례**해서 뽑는다 — 그래야 어떤 판은 전사가, 어떤 판은 궁수가 강화되면서도
  // 그 선택에 근거가 남는다. 늘 최고 가중치를 고르면 매판 같은 종류만 커진다.
  _pickCore: function (w, doctrine, budget, tierBudget, allow, meleePool, rangedPool) {
    var core = {};
    if (!doctrine.group || !doctrine.coreN) return core;
    var self = this;
    var pool = (doctrine.group === 'melee' ? (meleePool || this.MELEE_POOL) : (rangedPool || this.RANGED_POOL))
      .filter(function (t) { return !allow || allow.indexOf(t) >= 0; })
      .filter(function (t) {
        // 정예 단가가 예산의 1/4 을 넘으면 몇 기 못 세워 진형이 성립하지 않는다
        if (!GAME.UNITS[t]) return false;
        var c = self._eliteCostOf(t, doctrine, tierBudget || budget);
        return c > 0 && c <= budget * 0.25;
      });
    for (var i = 0; i < doctrine.coreN && pool.length; i++) {
      var pk = this._pick(w, pool);
      if (!pk) break;
      core[pk] = true;
      pool = pool.filter(function (t) { return t !== pk; });
    }
    return core;
  },

  _eliteCostOf: function (t, doctrine, budget) {
    var UL = GAME.UnitLevel;
    if (!UL || !UL.eliteCost) return GAME.UNITS[t] ? GAME.UNITS[t].cost : 0;
    // ⚠ 아래 generate() 의 `lv` 와 **같은 식**이어야 한다 — 갈라지면 예산 회계가
    //   실제로 세우는 유닛과 다른 단가를 쓰게 되어 진형이 예산을 넘거나 남긴다.
    return UL.eliteCost(t, this._lvFor(budget, doctrine), doctrine.traits);
  },

  // budget 안에서 조합을 채운다. profile 이 없으면 균형 조합.
  // opts.heroKey 를 주면 **그 영웅을 깨기 위한** 조합·간격으로 짠다.
  //
  // 예산 회계는 전부 **정예 단가**로 한다(`costOf`). 원본 단가로 세면 레벨업이
  // 공짜가 되어 "많이 vs 강하게" 라는 선택 자체가 사라진다.
  generate: function (budget, profile, opts) {
    opts = opts || {};
    var heroKey = opts.heroKey || null;
    var counter = this.counterFor(heroKey);
    // 층이 오를수록 성향을 더 세게 읽는다(opts.readMul — tower.js 가 넘긴다).
    var w = this.weights(profile, heroKey, opts.readMul, opts.world);
    var UL = GAME.UnitLevel;

    // 정예 레벨은 `tierBudget` 으로 정한다. **기본값은 budget 이라 아무 것도 안 바뀐다.**
    //
    // 왜 갈라 뒀는가: 보스 층은 호위 예산을 BOSS_ESCORT(0.60) 만큼 깎으므로
    // 20층 호위는 L3, 이웃 19·21층은 L5 가 된다. "그래서 보스 층이 이웃보다
    // 물러지는 것 아닌가"라는 가설을 세우고 **실제로 재봤다** —
    // tower.js 가 깎기 전 예산을 tierBudget 으로 넘기게 흉내 내어 회귀를 돌린 결과
    // (폰 프로필 rep=96): 20층 13% → 16% 로 **오히려 나빠졌다**(R-3 −1%p → +6%p).
    // 즉 가설은 틀렸다. 그러니 tower.js 는 건드리지 않는다.
    // 훅만 남겨 둔다 — 나중에 '보스 + 소수 정예 호위'를 만들고 싶을 때 쓸 자리이고,
    // 안 넘기면 동작이 완전히 동일하다.
    var tierBudget = opts.tierBudget || budget;
    // 등장 가능한 유닛 종류 제한 — 통곡의 탑의 '교육 과정'(js/towercurriculum.js)이
    // 층에 따라 넘긴다. **안 넘기면 전 종류**라 대전·수성의 탑은 완전히 무변경이다.
    var allow = (opts.allowTypes && opts.allowTypes.length) ? opts.allowTypes : null;
    function isAllowed(t) { return !allow || allow.indexOf(t) >= 0; }
    //  세계가 초원이 아니면 확장 종류도 벽·원거리 풀에 든다(정예 핵심으로 키울 수 있다).
    var ext = !!(opts.world && opts.world !== 'meadow');
    var MELEE = (ext ? this.MELEE_POOL.concat(this.MELEE_EXT) : this.MELEE_POOL).filter(isAllowed);
    var RANGED = (ext ? this.RANGED_POOL.concat(this.RANGED_EXT) : this.RANGED_POOL).filter(isAllowed);
    var docKey = opts.doctrine || this.chooseDoctrine(profile, budget, heroKey);
    var D = this.DOCTRINES[docKey] || this.DOCTRINES.swarm;
    var lv = this._lvFor(tierBudget, D);
    var core = (lv > 1) ? this._pickCore(w, D, budget, tierBudget, allow, MELEE, RANGED) : {};

    // 기본 종류 → 실제로 배치할 키. 정예면 파생 def 의 키가 나온다.
    // ── 주력이 아닌 유닛도 층이 오르면 같이 큰다 (2026-08-02 사용자 지시) ──────
    //  "단순히 유닛이 많아지는거로 대응하면안돼."
    //  실측: 상한을 푼 뒤에도 **정예는 전체의 13~20%** 뿐이고 나머지는 영원히 L1
    //  이라, 120층에서도 유닛 수만 12 → 23 으로 늘고 있었다(레벨은 주력 한두
    //  종류만 올랐다). 그래서 **바닥 레벨**을 둔다 — 주력보다 3 단계 낮게 따라온다.
    //  ⚠ 이게 난이도 인플레가 아닌 이유: `premiumFor` 가 **전투가치와 같은 값**이라
    //    레벨을 올리면 단가가 그만큼 올라 **세울 수 있는 머릿수가 준다.** 즉 같은
    //    예산이 '수'에서 '질'로 옮겨갈 뿐 총량은 대체로 보존된다(아래 실측으로 확인).
    //  ⚠ 특성(traits)은 안 준다 — 그건 그 판 주력의 정체성이라 전군에 뿌리면
    //    교리(doctrine)라는 축 자체가 흐려진다.
    var baseLv = Math.max(1, lv - 3);
    function keyOf(t) {
      if (!UL || !UL.eliteKey) return t;
      if (core[t]) return UL.eliteKey(t, lv, D.traits);
      return baseLv > 1 ? UL.eliteKey(t, baseLv, []) : t;
    }
    function costOf(t) {
      var d = GAME.UNITS[keyOf(t)];
      return d ? d.cost : 99999;
    }
    // 정예로 키운 종류는 그 판의 주력이다 — 뽑기 가중치도 같이 올린다.
    for (var ck in core) w[ck] = (w[ck] || 1) * D.coreBias;

    var chosen = [];               // { t: 기본종류, key: 실제키 }
    var spent = 0;
    var counts = {};               // **기본 종류 기준** (maxPerFormation 이 종류 단위라서)
    var pool = GAME.UNIT_ORDER.filter(isAllowed);
    var guard = 0;
    // 머릿수 상한 — 통곡의 탑 연습 구간(1~3층)만 쓴다. 0 이면 무제한(예전과 동일).
    var maxUnits = opts.maxUnits || 0;
    function full() { return maxUnits > 0 && chosen.length >= maxUnits; }
    function take(t, key) {
      chosen.push({ t: t, key: key || keyOf(t) });
      counts[t] = (counts[t] || 0) + 1;
      spent += GAME.UNITS[key || keyOf(t)].cost;
    }

    // ── 밀도 확보 ────────────────────────────────────────────────
    // 가중치만으로 뽑으면 비싼 유닛(투창병 40·쇠뇌 45·가시덫 35)을 먼저 사서
    // 예산 220 에 10기밖에 못 세운다. 같은 예산으로 잘 짠 배치는 19기를 세운다 —
    // 실측 방어율 17% vs 67%. **방어력이 비율 경감이라 물량이 실제로 강한 축**이기 때문이다.
    // 그래서 예산의 일정 비율은 값싼 전열에 먼저 묶어둔다.
    // 비율은 교리가 정한다 — 돌격 정예는 앞줄에 더, 저격 정예는 뒷줄에 더 쓴다.
    var wallBudget = budget * D.wall;
    var wallSpent = 0, wguard = 0;
    while (wguard++ < 200 && !full()) {
      var wt = this._pick(w, MELEE.filter(function (t) {
        return costOf(t) <= wallBudget - wallSpent && costOf(t) <= budget - spent;
      }), costOf);
      if (!wt) break;
      take(wt); wallSpent += costOf(wt);
    }
    // 최소 골격 — 벽 예산이 아주 작아도 앞줄 2기는 세운다
    for (var s = 0; chosen.length < 2 && s < 2 && !full(); s++) {
      if (spent + costOf('bayonet') > budget) break;
      take('bayonet');
    }

    // ── 원거리 하한 ──────────────────────────────────────────────
    // 비용 인지 픽은 값싼 근접을 선호하는데, 그것만 남으면 근접 영웅이 흡혈로 버티며
    // 뭉텅이를 갈아먹는다. 실측에서 뚫린 진형은 전부 '궁수 1기'짜리 근접 덩어리였다.
    // 지속 화력이 없으면 아무리 물량이 많아도 소용없다 → 예산의 일부를 원거리에 묶는다.
    var rangedBudget = budget * D.ranged;
    var rangedSpent = 0, rguard = 0;
    while (rguard++ < 200 && !full()) {
      var rt = this._pick(w, RANGED.filter(function (t) {
        var d = GAME.UNITS[t];
        if (costOf(t) > rangedBudget - rangedSpent) return false;
        if (costOf(t) > budget - spent) return false;
        if (d.maxPerFormation && (counts[t] || 0) >= d.maxPerFormation) return false;
        return true;
      }), costOf);
      if (!rt) break;
      take(rt); rangedSpent += costOf(rt);
    }

    while (guard++ < 400 && !full()) {
      var left = budget - spent;
      var allowed = pool.filter(function (t) {
        var d = GAME.UNITS[t];
        if (costOf(t) > left) return false;
        if (d.maxPerFormation && (counts[t] || 0) >= d.maxPerFormation) return false;
        return true;
      });
      if (!allowed.length) break;
      var t = this._pick(w, allowed, costOf);
      if (!t) break;
      take(t);
      // 같은 유닛만 쌓이지 않게 뽑힌 쪽 가중치를 조금 낮춘다
      w[t] = Math.max(1, w[t] * 0.82);
    }

    // ── 잔액 소진 ────────────────────────────────────────────────
    // 정예는 단가가 올라서 마지막에 못 쓰는 잔액이 남을 수 있다. 남은 돈은
    // **강화하지 않은(기본 레벨)** 전사로 메운다 — `assertBuild` 의 예산 소진율
    // 하한(0.90)을 정예 때문에 깨뜨리지 않기 위한 안전장치다. 실제로도 자연스럽다:
    // 정예 핵심 + 값싼 잡졸이라는 그림이 된다.
    // ⚠ 이 줄도 상한을 봐야 한다. 위 네 루프만 막고 여기를 빼놨더니 남은 예산이
    //   전부 전사로 되돌아와 상한이 아무 일도 안 했다(1층 무조작 13% — 실측).
    //   "예산을 다 쓴다"는 규칙보다 "연습 구간은 적다"는 약속이 우선한다.
    var fguard = 0;
    while (fguard++ < 40 && !full() && budget - spent >= GAME.UNITS.bayonet.cost) {
      take('bayonet', 'bayonet');
    }


    // 좌우 배치 — 상대가 자주 들어오는 쪽을 더 촘촘히
    var bias = profile ? (profile.side || 0) : 0;
    var units = [];
    var byBand = {};
    chosen.forEach(function (c) {
      var b = GAME.AutoFormation.bandOf(c.t).join(',');
      (byBand[b] = byBand[b] || []).push(c);
    });

    Object.keys(byBand).forEach(function (bandKey) {
      var list = byBand[bandKey];
      var band = bandKey.split(',').map(Number);
      var n = list.length;
      // 영웅에 따라 좌우로 벌리는 정도가 달라진다.
      // 파수꾼처럼 광역 흡혈로 버티는 상대에게는 뭉치는 것 자체가 이적행위다.
      var spread = Math.min(0.94, 0.76 * (counter ? counter.spread : 1));
      var start = 0.5 - spread / 2;
      for (var i = 0; i < n; i++) {
        // 가로로 균등 분포 + 상대 진입 방향으로 살짝 몰기
        var frac = n === 1 ? 0.5 : start + spread * (i / (n - 1));
        var nx = frac + bias * 0.10;
        nx = Math.max(0.06, Math.min(0.94, nx));
        var ny = band[0] + (band[1] - band[0]) * ((i % 2) ? 0.72 : 0.28);
        units.push({
          type: list[i].key,
          nx: Math.round(nx * 1000) / 1000,
          ny: Math.round(ny * 1000) / 1000
        });
      }
    });

    var coreKeys = Object.keys(core);
    var fid = opts.id || ('auto-' + Date.now() + '-' + Math.floor(Math.random() * 1000));
    this._rememberDoctrine(fid, docKey);
    return {
      id: fid,
      name: opts.name || 'AI 배치',
      author: 'AI', isAI: true, auto: true,
      tier: opts.tier || '자동', budget: budget, v: 2,
      units: units,
      vsHero: heroKey || null,
      // 이 판에 고른 전략 — 측정(tools/formation-diversity.js)과 화면 표시가 같이 읽는다
      doctrine: docKey,
      doctrineLabel: D.label,
      eliteLv: coreKeys.length ? lv : 1,
      eliteTypes: coreKeys,
      // 어떤 근거로 짰는지 화면에 보여주기 위해 남긴다
      rationale: this.explain(profile, heroKey, docKey, core, lv)
    };
  },

  explain: function (p, heroKey, docKey, core, lv) {
    var ctr = this.counterFor(heroKey);
    var head = ctr ? (GAME.HEROES[heroKey].name + ' 상대 — ' + ctr.why) : null;
    var parts = [];
    if (head) parts.push(head);

    // 교리를 먼저 말한다 — 플레이어가 화면에서 "이번엔 뭐가 다른가"를 알아야
    // 배치의 변화가 '학습'으로 읽힌다. 안 보이면 그냥 랜덤으로 느껴진다.
    var D = docKey && this.DOCTRINES[docKey];
    if (D && docKey !== 'swarm') {
      var names = [];
      for (var k in (core || {})) if (GAME.UNITS[k]) names.push(GAME.UNITS[k].name);
      parts.push('[' + D.label + '] ' + D.why +
        (names.length ? ' (' + names.join('·') + ' Lv' + lv + ')' : ''));
    } else if (D) {
      parts.push('[' + D.label + '] ' + D.why);
    }

    if (!p || !p.battles) {
      if (parts.length) return parts.join(' · ');
      return head || '아직 상대 정보가 없어 균형 조합으로 배치했습니다.';
    }
    if (p.style === 'brawler') parts.push('파고드는 유형 → 가시덫·투석·방패병으로 진입을 응징');
    else if (p.style === 'kiter') parts.push('거리 두는 유형 → 투창병·쇠뇌로 멀리서도 명중');
    else parts.push('중거리 유형 → 궁수 물량과 늪지기 둔화로 거리 유지 방해');
    if (p.dodge > 0.65) parts.push('회피가 능숙해 유도 공격 비중을 올림');
    else if (p.dodge < 0.35) parts.push('회피가 약해 논타겟 물량을 늘림');
    if (Math.abs(p.side) > 0.2) parts.push((p.side < 0 ? '좌측' : '우측') + ' 진입이 많아 그쪽을 보강');
    return parts.join(' · ');
  }
};
