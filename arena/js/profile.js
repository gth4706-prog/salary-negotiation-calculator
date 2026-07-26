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
  read: function () {
    var r = this.get();
    var avgDist = r.distN ? r.distSum / r.distN : 200;
    var dodge = r.projAt >= 6 ? 1 - (r.projHit / r.projAt) : 0.5;   // 표본 부족하면 중간값
    var side = r.sideN ? r.sideSum / r.sideN : 0;

    var style = avgDist < 130 ? 'brawler' : (avgDist > 300 ? 'kiter' : 'skirmisher');
    var favHero = null, favN = 0;
    for (var h in r.heroUse) if (r.heroUse[h] > favN) { favN = r.heroUse[h]; favHero = h; }

    return {
      battles: r.battles,
      style: style,
      styleLabel: style === 'brawler' ? '파고드는 유형' : (style === 'kiter' ? '거리 두는 유형' : '중거리 유형'),
      avgDist: Math.round(avgDist),
      dodge: dodge,                  // 0~1, 높으면 논타겟을 잘 피한다
      dodgeLabel: dodge > 0.65 ? '회피 능숙' : (dodge < 0.35 ? '회피 미숙' : '회피 보통'),
      side: side,
      favHero: favHero
    };
  },

  reset: function () {
    var all = this._all();
    delete all[this._key()];
    GAME.Store.set(this.KEY, all);
  }
};
