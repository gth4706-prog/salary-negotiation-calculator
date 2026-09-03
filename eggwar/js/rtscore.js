window.GAME = window.GAME || {};

// ============================================================================
//  실시간 대전 점수 (2026-08-21 태현님: "실시간대전의 점수와 공성전의 점수가
//  각각 달라야함") — 공성전 트로피(js/arena.js)와 **완전히 다른 축**이다.
//
//  · 로컬이 원본, 서버(agg.rt/rtBest)는 랭킹용 보고 — 점수·트로피와 같은 구도.
//  · 등락 공식은 Arena 의 gainFor/lossFor 를 그대로 빌린다(상대가 강할수록 많이
//    얻고, 내가 강한데 지면 많이 잃는다). 상대 점수는 로비 세팅 교환(rtSetup)에
//    실려 온다 — 없으면(옛 클라) 시작값으로 친다.
//  · 데싱크 판(승자 null)은 **무정산** — 판 무효는 점수 무효다.
//  · 서버 보고는 score:0/won:false 로 보낸다(총점·판수를 안 부풀리는 멱등 패턴,
//    js/score.js resync 와 같은 규약).
// ============================================================================
GAME.RtScore = {
  KEY: 'eggwar.rtscore',
  START: 600,

  _key: function () { return (GAME.Account && GAME.Account.current()) || 'guest'; },

  get: function () {
    var all = GAME.Store.get(this.KEY, {});
    var rec = all[this._key()];
    if (!rec) rec = { score: this.START, best: this.START, wins: 0, losses: 0 };
    if (rec.score === undefined) rec.score = this.START;
    return rec;
  },

  _save: function (rec) {
    var all = GAME.Store.get(this.KEY, {});
    all[this._key()] = rec;
    GAME.Store.set(this.KEY, all);
  },

  //  판이 끝나면 한 번. oppScore 는 상대의 실시간 점수(rtSetup 교환값).
  record: function (won, oppScore) {
    var rec = this.get();
    var opp = (oppScore > 0) ? oppScore : this.START;
    var delta = won ? GAME.Arena.gainFor(rec.score, opp)
                    : -GAME.Arena.lossFor(rec.score, opp);
    rec.score = Math.max(0, rec.score + delta);
    if (rec.score > rec.best) rec.best = rec.score;
    if (won) rec.wins++; else rec.losses++;
    this._save(rec);
    //  서버 랭킹 보고 — 실패해도 로컬은 이미 반영됐다(다음 판에 또 보고된다).
    if (GAME.Api && GAME.Api.enabled && GAME.Api.enabled()) {
      var id = GAME.Account.current();
      if (id) {
        GAME.Api._fetch('/score', {
          method: 'POST',
          body: JSON.stringify({ id: id, score: 0, won: false, rt: rec.score })
        })['catch'](function () { return null; });
      }
    }
    return { delta: delta, score: rec.score };
  },

  // ── 협동 보스전 기록 (시즌 2 S-C) — 세계별 승수·판수·최단 시간, 로컬만 ──────────
  //  실시간 점수와 **다른 축**이다(협동은 점수가 오르내리지 않는다). 서버 필드는 요청만
  //  (통합자 보고서: agg.coop = { [world]: { wins, best } }) — 지금은 보고하지 않는다.
  coopGet: function (world) {
    var rec = this.get();
    if (!rec.coop) rec.coop = {};
    if (world) return rec.coop[world] || { wins: 0, plays: 0, best: 0 };
    return rec.coop;
  },
  //  판이 끝나면 한 번. sec = 판 길이(초). 반환: 그 세계의 갱신된 기록.
  coopRecord: function (world, won, sec) {
    var rec = this.get();
    if (!rec.coop) rec.coop = {};
    var w = rec.coop[world] || { wins: 0, plays: 0, best: 0 };
    w.plays++;
    if (won) {
      w.wins++;
      var s = Math.max(1, Math.round(sec || 0));
      if (!w.best || s < w.best) w.best = s;
    }
    rec.coop[world] = w;
    this._save(rec);
    return { wins: w.wins, plays: w.plays, best: w.best };
  }
};
