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

  //  ⚠⚠ **2026-09-14 사다리를 새로 깐다** (태현님: "지금 시간부로 모두 1000점에서
  //    시작하게해"). 예전 시작값은 600 이었고 그 위에 쌓인 점수가 섞이면 티어가
  //    뜻을 잃는다 — 같은 «골드» 가 옛 600 기준인지 새 1000 기준인지 알 수 없다.
  //  ⚠ 그래서 **도장(EPOCH)** 을 찍는다. 기록의 도장이 다르면 처음 읽는 순간
  //    사다리를 1000 으로 되돌린다. 값을 지우는 게 아니라 **한 번만** 되돌리는
  //    것이라, 되돌린 뒤에는 평소대로 쌓인다(다시 밀어도 도장이 같아 안 움직인다).
  //  ⚠ 협동 기록(`coop`)은 **안 건드린다** — 그건 점수 사다리가 아니라 다른 축이고
  //    (세계별 승수·최단 시간), 여기 초기화에 딸려 지우면 남의 축을 지우는 것이다.
  //  ⚠ 서버(agg.rt)는 **다음 실시간 판에서** 따라온다(`record` 가 보고한다).
  //    여기서 서버에 밀지 않는 이유: 게임을 켜기만 한 사람까지 랭킹에 올라간다.
  EPOCH: 20260914,
  START: 1000,

  _key: function () { return (GAME.Account && GAME.Account.current()) || 'guest'; },

  get: function () {
    var all = GAME.Store.get(this.KEY, {});
    var rec = all[this._key()];
    if (!rec) rec = { score: this.START, best: this.START, wins: 0, losses: 0, epoch: this.EPOCH };
    if (rec.score === undefined) rec.score = this.START;
    //  ⚠ 새 사다리로 갈아타는 자리 — 도장이 다르면 **한 번만** 되돌린다.
    //    전적(승·패)도 같이 비운다: 600 기준 판과 1000 기준 판을 한 줄에 세면
    //    승률이 두 사다리의 평균이 되어 아무것도 안 말한다.
    if (rec.epoch !== this.EPOCH) {
      rec.epoch = this.EPOCH;
      rec.score = this.START;
      rec.best = this.START;
      rec.wins = 0;
      rec.losses = 0;
      this._save(rec);
    }
    return rec;
  },

  // ── 티어 (2026-09-14 태현님: "티어시스템과 랭크점수… 모두 1000점에서 시작…
  //    브론즈실버골드 식으로 적절히 차용") ──────────────────────────────────
  //
  //  ⚠⚠ **구간 폭은 실측에서 나왔다.** 동급끼리 붙으면 승 +22 · 패 −16 이다
  //    (`Arena.gainFor/lossFor`, BASE_GAIN 22 · BASE_LOSS 16). 그래서
  //    티어 하나 = **300점 ≈ 순승 7판**, 단계 하나 = 100점 ≈ 순승 2~3판으로 잡았다.
  //    이보다 좁으면 한 판에 두 단계가 오르내려 «올랐다» 가 안 남고, 넓으면
  //    한 저녁 내내 같은 칸에 있어서 «오르는 중» 이 안 보인다.
  //  ⚠ 시작 1000 은 **실버 2** — 일부러 바닥이 아니다. 브론즈까지 내려가려면
  //    순패 10판이라 «몇 판 졌다고 최하위» 가 안 되고, 위로는 여섯 티어가 남는다.
  //  ⚠ 단계 번호는 **내려갈수록 큰 수**다(실버 3 → 실버 1 → 골드 3). 이 방향이
  //    널리 쓰이는 규약이라 설명 없이 읽힌다. 마스터 위로는 단계가 없다 —
  //    거기서부터는 점수 자체가 순위다.
  //  ⚠ 로마 숫자(Ⅲ)를 안 쓴다 — 글꼴 서브셋(835자) 밖이라 실기기에서 두부가 된다.
  TIERS: [
    { key: 'bronze',   name: '브론즈',   min: 0,    color: '#a5703c', divs: 3 },
    { key: 'silver',   name: '실버',     min: 850,  color: '#b9c2cc', divs: 3 },
    { key: 'gold',     name: '골드',     min: 1150, color: '#e0b64a', divs: 3 },
    { key: 'platinum', name: '플래티넘', min: 1450, color: '#6fcfc0', divs: 3 },
    { key: 'diamond',  name: '다이아',   min: 1750, color: '#7db9f0', divs: 3 },
    { key: 'master',   name: '마스터',   min: 2100, color: '#b98ae0', divs: 0 },
    { key: 'legend',   name: '전설',     min: 2500, color: '#ef8f4a', divs: 0 }
  ],

  //  점수 → 티어. `{ key, name, div, label, color, min, next, into, span, pct }`
  //  ⚠ `next` 는 **다음 티어의 시작점**이다(마지막 티어는 null). 화면이 «승급까지
  //    몇 점» 을 말할 때 쓴다 — 숫자만 띄우면 그 점수가 높은 건지 모른다.
  tierOf: function (score) {
    var s = Math.max(0, Math.round(score || 0));
    var T = this.TIERS, i = 0, k;
    for (k = 0; k < T.length; k++) if (s >= T[k].min) i = k;
    var t = T[i];
    var next = (i + 1 < T.length) ? T[i + 1].min : null;
    var span = (next === null) ? 0 : (next - t.min);
    var into = s - t.min;
    //  단계 — 안쪽일수록 작은 번호. 구간을 divs 등분한다.
    var div = 0;
    if (t.divs > 0 && span > 0) {
      div = t.divs - Math.floor(into / (span / t.divs));
      if (div < 1) div = 1;
      if (div > t.divs) div = t.divs;
    }
    return {
      key: t.key, name: t.name, color: t.color, div: div,
      label: t.name + (div ? (' ' + div) : ''),
      min: t.min, next: next, into: into, span: span,
      pct: span > 0 ? Math.max(0, Math.min(1, into / span)) : 1
    };
  },

  //  «승급까지 N점» — 최고 티어면 null.
  toNext: function (score) {
    var t = this.tierOf(score);
    return t.next === null ? null : Math.max(0, t.next - Math.round(score || 0));
  },


  _save: function (rec) {
    var all = GAME.Store.get(this.KEY, {});
    all[this._key()] = rec;
    GAME.Store.set(this.KEY, all);
  },

  //  판이 끝나면 한 번. oppScore 는 상대의 실시간 점수(rtSetup 교환값).
  record: function (won, oppScore) {
    var rec = this.get();
    var before = rec.score;
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
    //  ⚠ **승급·강등을 여기서 판정해 돌려준다.** 화면이 점수만 받으면 «올랐다» 를
    //    말할 수 없고, 결과 화면이 스스로 티어를 다시 계산하면 판정이 두 벌이 된다.
    var pv = this.tierOf(before), nw = this.tierOf(rec.score);
    return { delta: delta, score: rec.score,
             tier: nw, prevTier: pv,
             promoted: (nw.min > pv.min) || (nw.min === pv.min && nw.div < pv.div),
             demoted:  (nw.min < pv.min) || (nw.min === pv.min && nw.div > pv.div) };
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
