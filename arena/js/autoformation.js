window.GAME = window.GAME || {};

// AI 전략가 — 예산과 상대 성향을 받아 배치도를 스스로 짠다.
//
// 무작위로 뽑지 않는다. 관측된 성향의 **약점을 노리는 조합**을 고른다:
//   · 파고드는 유형   → 지뢰 + 유탄(광역) + 방탄병 벽. 뛰어드는 순간을 응징한다.
//   · 거리 두는 유형  → 저격수(유도·회피불가) + 기관총 진지(장거리). 멀리 있어도 닿는다.
//   · 중거리 유형     → 소총수 물량 + 화학병(둔화)로 거리를 못 유지하게 만든다.
//   · 회피 능숙       → 논타겟을 줄이고 **타겟(유도)** 비중을 올린다. 피해도 맞는다.
//   · 회피 미숙       → 값싼 논타겟 물량이 더 효율적이다.
//
// 배치는 띠(band)로 나눠 앞에 벽, 뒤에 화력·지원을 둔다.
GAME.AutoFormation = {

  // 성향 → 유닛별 가중치
  weights: function (p) {
    var w = {
      bayonet: 10, rifleman: 10, grenadier: 6, sniper: 4,
      shieldman: 5, medic: 4, sergeant: 4, chemtrooper: 4, mgnest: 3, mine: 3
    };
    if (!p) return w;

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

  // 가중치에 비례해 하나 뽑기
  _pick: function (w, allowed) {
    var total = 0, k;
    for (k in w) if (allowed.indexOf(k) !== -1) total += w[k];
    if (total <= 0) return null;
    var r = Math.random() * total;
    for (k in w) {
      if (allowed.indexOf(k) === -1) continue;
      r -= w[k];
      if (r <= 0) return k;
    }
    return allowed[0];
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
  generate: function (budget, profile, opts) {
    opts = opts || {};
    var w = this.weights(profile);
    var chosen = [];
    var spent = 0;
    var counts = {};
    var pool = GAME.UNIT_ORDER.slice();
    var guard = 0;

    // 최소 골격: 앞 벽 2기는 반드시 (뒤 유닛이 그냥 녹는 걸 막는다)
    var seedTypes = ['bayonet', 'bayonet'];
    for (var s = 0; s < seedTypes.length; s++) {
      var d0 = GAME.UNITS[seedTypes[s]];
      if (spent + d0.cost <= budget) {
        chosen.push(seedTypes[s]); spent += d0.cost;
        counts[seedTypes[s]] = (counts[seedTypes[s]] || 0) + 1;
      }
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
      for (var i = 0; i < n; i++) {
        // 가로로 균등 분포 + 상대 진입 방향으로 살짝 몰기
        var frac = n === 1 ? 0.5 : 0.12 + 0.76 * (i / (n - 1));
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
      // 어떤 근거로 짰는지 화면에 보여주기 위해 남긴다
      rationale: this.explain(profile)
    };
  },

  explain: function (p) {
    if (!p || !p.battles) return '아직 상대 정보가 없어 균형 조합으로 배치했습니다.';
    var parts = [];
    if (p.style === 'brawler') parts.push('파고드는 유형 → 지뢰·유탄·방탄병으로 진입을 응징');
    else if (p.style === 'kiter') parts.push('거리 두는 유형 → 저격수·기관총으로 멀리서도 명중');
    else parts.push('중거리 유형 → 소총 물량과 화학병 둔화로 거리 유지 방해');
    if (p.dodge > 0.65) parts.push('회피가 능숙해 유도 공격 비중을 올림');
    else if (p.dodge < 0.35) parts.push('회피가 약해 논타겟 물량을 늘림');
    if (Math.abs(p.side) > 0.2) parts.push((p.side < 0 ? '좌측' : '우측') + ' 진입이 많아 그쪽을 보강');
    return parts.join(' · ');
  }
};
