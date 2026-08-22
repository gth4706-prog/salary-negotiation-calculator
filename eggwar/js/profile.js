window.GAME = window.GAME || {};

// 플레이어 성향 프로필. 전투에서 관측한 값을 ID 별로 누적해,
// AI 전략가가 "이 사람을 깨는 배치"를 짜는 근거로 쓴다.
//
// 읽는 것:
//   - 교전 거리   : 파고드는가(근접) / 거리를 두는가(카이팅)
//   - 회피율      : 논타겟을 잘 피하는가 → 잘 피하면 '타겟(유도)' 유닛이 유효하다
//   - 영웅 선택   : 어떤 영웅을 즐겨 쓰는가
//   - 진입 방향   : 주로 좌/우 어디로 들어오는가
GAME.Profile = {
  KEY: 'asymgame.profile.v1',

  DEFAULT: function () {
    return {
      battles: 0,
      heroUse: {},              // heroKey → 횟수
      distSum: 0, distN: 0,     // 평균 교전 거리
      projAt: 0, projHit: 0,    // 논타겟이 향한 횟수 / 실제 맞은 횟수
      sideSum: 0, sideN: 0      // -1(좌) ~ 1(우)
    };
  },

  _all: function () { return GAME.Store.get(this.KEY, {}); },

  _key: function () { return GAME.Account.current() || 'guest'; },

  get: function () {
    var rec = this._all()[this._key()];
    if (!rec) return this.DEFAULT();
    var d = this.DEFAULT();
    for (var k in d) if (rec[k] === undefined) rec[k] = d[k];
    return rec;
  },

  record: function (heroKey, telemetry) {
    var all = this._all();
    var k = this._key();
    var rec = all[k] || this.DEFAULT();
    var d = this.DEFAULT();
    for (var f in d) if (rec[f] === undefined) rec[f] = d[f];

    rec.battles++;
    rec.heroUse[heroKey] = (rec.heroUse[heroKey] || 0) + 1;

    var t = telemetry || {};
    var ds = t.heroDistSamples || [];
    for (var i = 0; i < ds.length; i++) { rec.distSum += ds[i]; rec.distN++; }
    rec.projAt += t.projectilesAtHero || 0;
    rec.projHit += t.projectilesHitHero || 0;

    var xs = t.heroXSamples || [];
    for (var j = 0; j < xs.length; j++) { rec.sideSum += xs[j]; rec.sideN++; }

    all[k] = rec;
    GAME.Store.set(this.KEY, all);
    return rec;
  },

  // 관측치 → 사람이 읽을 수 있는 성향
  read: function () { return this.readFrom(this.get()); },

  // 순수 함수로 분리한 이유: AI 가 "이런 성향이면 어떤 배치가 나오나"를 저장소 없이
  // 시험할 수 있어야 한다(`tools/formation-diversity.js` 가 합성 프로필을 넣는다).
  // 저장소를 타는 read() 만 있으면 다양성 측정 자체가 불가능하다.
  readFrom: function (r) {
    var avgDist = r.distN ? r.distSum / r.distN : 200;
    var dodge = r.projAt >= 6 ? 1 - (r.projHit / r.projAt) : 0.5;   // 표본 부족하면 중간값
    var side = r.sideN ? r.sideSum / r.sideN : 0;

    var style = avgDist < 130 ? 'brawler' : (avgDist > 300 ? 'kiter' : 'skirmisher');
    var favHero = null, favN = 0, heroN = 0;
    for (var h in r.heroUse) { heroN += r.heroUse[h]; if (r.heroUse[h] > favN) { favN = r.heroUse[h]; favHero = h; } }

    // ── 확신도 ────────────────────────────────────────────────────────────
    // AI 가 성향을 얼마나 세게 믿어도 되는가. 표본이 적을 때 확신하면
    // **몇 판 안 된 사람에게 매판 같은 전략이 날아온다** — 게임이 좁아 보인다.
    // 확신이 낮으면 AutoFormation 이 여러 전략을 골고루 시험하고(=다양해지고),
    // 표본이 쌓일수록 카운터 쪽으로 분포가 쏠린다. 학습이 눈에 보이는 형태다.
    var conf = Math.min(1, (r.battles || 0) / 6);
    var dodgeConf = Math.min(1, (r.projAt || 0) / 24);
    var styleConf = Math.min(1, (r.distN || 0) / 40);

    return {
      battles: r.battles,
      style: style,
      styleLabel: style === 'brawler' ? '파고드는 유형' : (style === 'kiter' ? '거리 두는 유형' : '중거리 유형'),
      avgDist: Math.round(avgDist),
      dodge: dodge,                  // 0~1, 높으면 논타겟을 잘 피한다
      dodgeLabel: dodge > 0.65 ? '회피 능숙' : (dodge < 0.35 ? '회피 미숙' : '회피 보통'),
      side: side,
      favHero: favHero,
      // 성향을 얼마나 믿을 수 있는가 (0~1)
      conf: conf,
      dodgeConf: dodgeConf,
      styleConf: styleConf,
      // 영웅을 한 종류만 쓰는가(1=고정) — 고정이면 그 영웅 카운터를 더 세게 건다
      favHeroShare: heroN ? favN / heroN : 0
    };
  },

  // ── "탑이 나를 이렇게 읽었다" 한 줄 (2026-08-01 사용자 지시) ──────────────────
  //  "갈수록 어려워진다 + 나를 간파하네 라는 걸 꼭 느낄 수 있게 해야 해."
  //
  //  ⚠ 읽는 것만으로는 안 느껴진다 — **읽었다는 사실을 말해 줘야** 느껴진다.
  //    이 게임은 이미 같은 실패를 두 번 겪었다(축복·구슬: 받은 줄도 몰랐다).
  //    배치가 조용히 나를 카운터하면 플레이어에겐 그냥 "어려워졌다"로만 남는다.
  //    그래서 관측 결과와 **그래서 무엇을 늘렸는지**를 짝지어 로딩 화면에 띄운다.
  readNote: function (p, floor) {
    p = p || this.read();
    if (!p || p.battles < 1) return '';
    var mul = Math.min(3.5, 1 + Math.max(0, (floor || 0) - 3) * 0.08);
    var counter = p.style === 'brawler'
      ? '가시덫과 투석꾼을 늘려 파고드는 순간을 노립니다'
      : (p.style === 'kiter'
          ? '투창병과 쇠뇌 진지를 늘려 도망칠 곳을 지웁니다'
          : '궁수와 늪지기를 늘려 거리를 못 잡게 합니다');
    var dodgeNote = p.dodge > 0.65
      ? '  회피가 좋아 피할 수 없는 공격의 비중을 올렸습니다.'
      : (p.dodge < 0.35 ? '  회피가 약해 광역 공격을 늘렸습니다.' : '');
    //  2026-08-23 태현님: "로딩화면 글자 너무 과다" — 3줄 → **1줄**로 압축.
    //  무엇을 늘렸는지(counter)는 뺀다 — 간파의 존재와 강도만 알리면 충분하다.
    //  (counter/dodgeNote 계산은 위에 남긴다 — 되돌릴 때 문구가 그대로 살아난다.)
    void counter; void dodgeNote;
    return '👁 탑이 당신을 읽었습니다 — ' + p.styleLabel + ' · ' + p.dodgeLabel +
           ' (간파 ' + mul.toFixed(1) + '배)';
  },

  reset: function () {
    var all = this._all();
    delete all[this._key()];
    GAME.Store.set(this.KEY, all);
  }
};
