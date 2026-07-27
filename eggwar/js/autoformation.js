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
  weights: function (p, heroKey) {
    var w = {
      bayonet: 10, rifleman: 10, grenadier: 6, sniper: 4,
      shieldman: 5, medic: 4, sergeant: 4, chemtrooper: 4, mgnest: 3, mine: 3
    };

    // 영웅 카운터가 성향보다 우선한다 — 상대가 뭘 들고 오는지가 가장 확실한 정보다
    var ctr = this.counterFor(heroKey);
    if (ctr) for (var ck in ctr.w) w[ck] = (w[ck] || 0) + ctr.w[ck];

    if (!p) {
      for (var k0 in w) if (w[k0] < 1) w[k0] = 1;
      return w;
    }

    if (p.style === 'brawler') {
      w.mine += 14; w.grenadier += 10; w.shieldman += 9; w.bayonet += 6; w.sergeant += 3;
      w.sniper -= 2; w.mgnest -= 1;
    } else if (p.style === 'kiter') {
      w.sniper += 14; w.mgnest += 10; w.rifleman += 5; w.medic += 3;
      w.bayonet -= 4; w.mine -= 2; w.shieldman -= 2;
    } else {
      w.rifleman += 8; w.chemtrooper += 9; w.bayonet += 3; w.grenadier += 3;
    }

    if (p.dodge > 0.65) {
      // 논타겟을 잘 피한다 → 반드시 맞는 쪽으로
      w.sniper += 12; w.chemtrooper += 4;
      w.rifleman -= 4; w.grenadier -= 3;
    } else if (p.dodge < 0.35) {
      w.rifleman += 7; w.grenadier += 6;
      w.sniper -= 3;
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
  _pick: function (w, allowed) {
    var total = 0, k, i;
    var eff = {};
    for (i = 0; i < allowed.length; i++) {
      k = allowed[i];
      var cost = Math.max(1, GAME.UNITS[k].cost);
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

  // 유닛이 놓일 띠 (ny: 0=맨 위, 전략가 구역은 0~0.30)
  bandOf: function (type) {
    switch (type) {
      case 'bayonet': case 'shieldman': return [0.24, 0.30];   // 앞 벽
      case 'rifleman': case 'chemtrooper': case 'sergeant': return [0.15, 0.23];
      case 'grenadier': case 'mgnest': return [0.11, 0.19];
      case 'sniper': case 'medic': return [0.04, 0.11];        // 뒤
      case 'mine': return [0.38, 0.47];                        // 중립지대(지나가는 길)
      default: return [0.15, 0.25];
    }
  },

  // budget 안에서 조합을 채운다. profile 이 없으면 균형 조합.
  // opts.heroKey 를 주면 **그 영웅을 깨기 위한** 조합·간격으로 짠다.
  generate: function (budget, profile, opts) {
    opts = opts || {};
    var heroKey = opts.heroKey || null;
    var counter = this.counterFor(heroKey);
    var w = this.weights(profile, heroKey);
    var chosen = [];
    var spent = 0;
    var counts = {};
    var pool = GAME.UNIT_ORDER.slice();
    var guard = 0;

    // ── 밀도 확보 ────────────────────────────────────────────────
    // 가중치만으로 뽑으면 비싼 유닛(투창병 40·쇠뇌 45·가시덫 35)을 먼저 사서
    // 예산 220 에 10기밖에 못 세운다. 같은 예산으로 잘 짠 배치는 19기를 세운다 —
    // 실측 방어율 17% vs 67%. **방어력이 비율 경감이라 물량이 실제로 강한 축**이기 때문이다.
    // 그래서 예산의 일정 비율은 값싼 전열에 먼저 묶어둔다.
    var WALL_SHARE = 0.34;
    var wallBudget = budget * WALL_SHARE;
    var wallPool = ['bayonet', 'shieldman'];
    var wallSpent = 0, wguard = 0;
    while (wguard++ < 200) {
      var wt = this._pick(w, wallPool.filter(function (t) {
        return GAME.UNITS[t].cost <= wallBudget - wallSpent;
      }));
      if (!wt) break;
      chosen.push(wt); counts[wt] = (counts[wt] || 0) + 1;
      spent += GAME.UNITS[wt].cost; wallSpent += GAME.UNITS[wt].cost;
    }
    // 최소 골격 — 벽 예산이 아주 작아도 앞줄 2기는 세운다
    for (var s = 0; chosen.length < 2 && s < 2; s++) {
      var d0 = GAME.UNITS.bayonet;
      if (spent + d0.cost > budget) break;
      chosen.push('bayonet'); spent += d0.cost;
      counts.bayonet = (counts.bayonet || 0) + 1;
    }

    // ── 원거리 하한 ──────────────────────────────────────────────
    // 비용 인지 픽은 값싼 근접을 선호하는데, 그것만 남으면 근접 영웅이 흡혈로 버티며
    // 뭉텅이를 갈아먹는다. 실측에서 뚫린 진형은 전부 '궁수 1기'짜리 근접 덩어리였다.
    // 지속 화력이 없으면 아무리 물량이 많아도 소용없다 → 예산의 일부를 원거리에 묶는다.
    var RANGED_SHARE = 0.30;
    var rangedBudget = budget * RANGED_SHARE;
    var rangedPool = ['rifleman', 'sniper', 'grenadier', 'chemtrooper', 'mgnest'];
    var rangedSpent = 0, rguard = 0;
    while (rguard++ < 200) {
      var rt = this._pick(w, rangedPool.filter(function (t) {
        var d = GAME.UNITS[t];
        if (d.cost > rangedBudget - rangedSpent) return false;
        if (d.cost > budget - spent) return false;
        if (d.maxPerFormation && (counts[t] || 0) >= d.maxPerFormation) return false;
        return true;
      }));
      if (!rt) break;
      chosen.push(rt); counts[rt] = (counts[rt] || 0) + 1;
      spent += GAME.UNITS[rt].cost; rangedSpent += GAME.UNITS[rt].cost;
    }

    while (guard++ < 400) {
      var left = budget - spent;
      var allowed = pool.filter(function (t) {
        var d = GAME.UNITS[t];
        if (d.cost > left) return false;
        if (d.maxPerFormation && (counts[t] || 0) >= d.maxPerFormation) return false;
        return true;
      });
      if (!allowed.length) break;
      var t = this._pick(w, allowed);
      if (!t) break;
      chosen.push(t);
      counts[t] = (counts[t] || 0) + 1;
      spent += GAME.UNITS[t].cost;
      // 같은 유닛만 쌓이지 않게 뽑힌 쪽 가중치를 조금 낮춘다
      w[t] = Math.max(1, w[t] * 0.82);
    }

    // 좌우 배치 — 상대가 자주 들어오는 쪽을 더 촘촘히
    var bias = profile ? (profile.side || 0) : 0;
    var units = [];
    var byBand = {};
    chosen.forEach(function (t) {
      var b = GAME.AutoFormation.bandOf(t).join(',');
      (byBand[b] = byBand[b] || []).push(t);
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
          type: list[i],
          nx: Math.round(nx * 1000) / 1000,
          ny: Math.round(ny * 1000) / 1000
        });
      }
    });

    return {
      id: opts.id || ('auto-' + Date.now() + '-' + Math.floor(Math.random() * 1000)),
      name: opts.name || 'AI 배치',
      author: 'AI', isAI: true, auto: true,
      tier: opts.tier || '자동', budget: budget, v: 2,
      units: units,
      vsHero: heroKey || null,
      // 어떤 근거로 짰는지 화면에 보여주기 위해 남긴다
      rationale: this.explain(profile, heroKey)
    };
  },

  explain: function (p, heroKey) {
    var ctr = this.counterFor(heroKey);
    var head = ctr ? (GAME.HEROES[heroKey].name + ' 상대 — ' + ctr.why) : null;
    if (!p || !p.battles) {
      return head || '아직 상대 정보가 없어 균형 조합으로 배치했습니다.';
    }
    var parts = [];
    if (head) parts.push(head);
    if (p.style === 'brawler') parts.push('파고드는 유형 → 가시덫·투석·방패병으로 진입을 응징');
    else if (p.style === 'kiter') parts.push('거리 두는 유형 → 투창병·쇠뇌로 멀리서도 명중');
    else parts.push('중거리 유형 → 궁수 물량과 늪지기 둔화로 거리 유지 방해');
    if (p.dodge > 0.65) parts.push('회피가 능숙해 유도 공격 비중을 올림');
    else if (p.dodge < 0.35) parts.push('회피가 약해 논타겟 물량을 늘림');
    if (Math.abs(p.side) > 0.2) parts.push((p.side < 0 ? '좌측' : '우측') + ' 진입이 많아 그쪽을 보강');
    return parts.join(' · ');
  }
};
