window.GAME = window.GAME || {};

// 점수와 랭킹.
// 격파한 라운드(=난이도 단계)와 학습 진행도를 함께 점수화한다.
// 같은 진형을 반복해 깨면 난이도(escalation)가 오르므로, 높은 단계 격파가 더 큰 점수다.
GAME.Score = {
  KEY: 'asymgame.scores.v1',

  // 한 판의 점수
  forResult: function (opts) {
    // opts: { won, asStrategist, budget, escalation, secondsLeft, hpPct, enemiesKilled }
    if (!opts.won) return 0;
    var s = 0;
    if (opts.asStrategist) {
      // 전략가 승리: AI 컨트롤러를 막아냈다
      s = 120 + (opts.escalation || 0) * 40 + Math.round((opts.budget || 0) / 3);
    } else {
      // 컨트롤러 승리: 진형을 격파했다
      s = 100
        + (opts.escalation || 0) * 60          // 반복 격파로 오른 난이도
        + Math.round((opts.budget || 0) / 2)   // 상대 진형 규모
        + Math.round((opts.secondsLeft || 0) * 2)
        + Math.round((opts.hpPct || 0) * 50);  // 체력을 남기고 이겼는가
    }
    return Math.max(0, Math.round(s));
  },

  _all: function () { return GAME.Store.get(this.KEY, {}); },

  // 기록 추가
  add: function (id, entry) {
    if (!id) return null;
    var all = this._all();
    var rec = all[id] || { id: id, total: 0, best: 0, rounds: 0, entries: [] };
    rec.total += entry.score;
    if (entry.score > rec.best) rec.best = entry.score;
    if (entry.won && !entry.asStrategist) rec.rounds++;
    rec.entries.push({
      t: Date.now(), score: entry.score, won: !!entry.won,
      role: entry.asStrategist ? 'S' : 'C',
      esc: entry.escalation || 0, formation: entry.formationName || ''
    });
    // 무한정 쌓이지 않게 최근 200판만
    if (rec.entries.length > 200) rec.entries = rec.entries.slice(-200);
    all[id] = rec;
    GAME.Store.set(this.KEY, all);

    // 서버가 켜져 있으면 전역 랭킹에도 올린다. 실패해도 로컬 기록은 남는다.
    if (GAME.Api && GAME.Api.enabled()) {
      GAME.Api.postScore({
        id: id, score: entry.score, won: !!entry.won,
        role: entry.asStrategist ? 'S' : 'C',
        esc: entry.escalation || 0, formation: entry.formationName || ''
      });
    }
    return rec;
  },

  of: function (id) {
    return this._all()[id] || { id: id, total: 0, best: 0, rounds: 0, entries: [] };
  },

  // 기간별 랭킹. scope: 'live' | 'week' | 'all'
  //   live = 최근 1시간(실시간), week = 최근 7일, all = 전체 누적
  board: function (scope) {
    var all = this._all();
    var now = Date.now();
    var cut = scope === 'live' ? now - 3600e3
            : scope === 'week' ? now - 7 * 864e5
            : 0;

    var rows = Object.keys(all).map(function (id) {
      var rec = all[id];
      if (!cut) {
        return { id: id, score: rec.total, rounds: rec.rounds, best: rec.best };
      }
      var sum = 0, rounds = 0, best = 0;
      for (var i = 0; i < rec.entries.length; i++) {
        var e = rec.entries[i];
        if (e.t < cut) continue;
        sum += e.score;
        if (e.won && e.role === 'C') rounds++;
        if (e.score > best) best = e.score;
      }
      return { id: id, score: sum, rounds: rounds, best: best };
    }).filter(function (r) { return r.score > 0; });

    // 차단된 닉네임은 랭킹에서 감춘다
    rows = rows.filter(function (r) { return !GAME.Account.isBlocked(r.id); });
    rows.sort(function (a, b) { return b.score - a.score || b.rounds - a.rounds; });
    return rows;
  },

  rankOf: function (id, scope) {
    var b = this.board(scope);
    for (var i = 0; i < b.length; i++) if (b[i].id === id) return i + 1;
    return null;
  },

  // 랭킹 범위를 화면에 정확히 알린다. 서버가 실제로 응답했는지로 판단한다
  // (주소만 설정돼 있고 응답이 없으면 '전체'라고 표시하면 거짓말이 된다).
  scopeNote: function (serverOk) {
    if (serverOk === true) return '전체 플레이어 기준 (서버 연동)';
    if (serverOk === false) return '이 브라우저 기준 — 서버에 연결하지 못했습니다';
    return '이 브라우저에 기록된 ID 기준';
  }
};
