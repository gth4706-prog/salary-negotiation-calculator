window.GAME = window.GAME || {};

// 학습형 AI 전략가.
//
// 신경망은 쓰지 않는다. 서버 없는 브라우저 게임에는 과잉이고 데이터도 부족하다.
// 대신 **가설 → 시험 → 채택/기각** 을 반복하는 언덕오르기(hill climbing)를 쓴다.
//
//   1) 전투가 끝나면 그 판의 지표를 본다(회복량 0, 방탄병이 못 막음, 원거리가 근접사 등)
//   2) 실패 원인이 뚜렷하면 대응하는 행동값을 **조금** 올리고 '시험 중'으로 표시한다
//   3) 이후 몇 판의 승률을 시험 전 승률과 비교한다
//        - 나아졌으면 채택(그 값을 유지)
//        - 나빠졌으면 **되돌리고** 그 방향은 기각 목록에 넣어 다시 시도하지 않는다
//
// 3단계가 핵심이다. 이게 없으면 "고쳤다고 생각한 변경이 실제로는 진형을 약화"시키는데도
// 계속 밀어붙이게 된다(실제로 처음 구현에서 승률이 떨어졌다).
GAME.Learn = {
  KEY: 'asymgame.learn.v2',
  TRIAL_BATTLES: 3,     // 이만큼 치러보고 판정한다
  MAX: 0.5,             // 행동값 상한 — 너무 크면 진형이 통째로 무너진다
  STEP: 0.25,

  DEFAULT: function () {
    return {
      battles: 0, wins: 0,
      adapt: {
        medicFollow: 0,    // 위생병이 부상 아군 쪽으로 이동
        guardFollow: 0,    // 방탄병이 영웅과 아군 사이를 막아섬
        kite: 0,           // 부상당한 원거리 유닛이 물러나며 쏨
        rallyBias: 0       // 영웅이 자주 오는 쪽으로 진형이 치우침
      },
      trial: null,         // { key, prev, baseRate, atBattle, atWins }
      rejected: {},        // 시험해봤지만 승률이 떨어진 방향
      obs: { heroSideSum: 0, heroSideN: 0 },
      lastNotes: []
    };
  },

  _all: function () {
    try {
      var raw = window.localStorage.getItem(this.KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return this._mem || {}; }
  },

  _save: function (all) {
    try { window.localStorage.setItem(this.KEY, JSON.stringify(all)); }
    catch (e) { this._mem = all; }
  },

  get: function (formationId) {
    var all = this._all();
    var rec = all[formationId];
    if (!rec) return this.DEFAULT();
    var d = this.DEFAULT();
    for (var k in d.adapt) if (rec.adapt[k] === undefined) rec.adapt[k] = d.adapt[k];
    if (!rec.obs) rec.obs = d.obs;
    if (!rec.rejected) rec.rejected = {};
    return rec;
  },

  clamp: function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); },

  // 관측치로부터 "이걸 고치면 나아질 것 같다"는 후보를 뽑는다
  _candidate: function (rec, t) {
    var c = [];
    if (t.medicPlaced && (t.medicHealed || 0) <= 0) {
      c.push({ key: 'medicFollow', why: '위생병이 회복을 못 함 → 부상자를 따라가게' });
    }
    if (t.guardPlaced && (t.guardBlocked || 0) <= 0) {
      c.push({ key: 'guardFollow', why: '방탄병이 못 막음 → 영웅 앞을 가로막게' });
    }
    if ((t.rangedDiedInMelee || 0) > 0) {
      c.push({ key: 'kite', why: '원거리가 붙어서 죽음 → 다치면 물러나게' });
    }
    // 이미 상한이거나 기각된 방향은 제외
    var self = this;
    return c.filter(function (x) {
      return !rec.rejected[x.key] && rec.adapt[x.key] < self.MAX - 0.001;
    });
  },

  // 전투 종료 시 호출. won = 전략가(진형)가 이겼는가.
  record: function (formationId, won, telemetry) {
    var all = this._all();
    var rec = all[formationId] || this.DEFAULT();
    var d = this.DEFAULT();
    for (var k in d.adapt) if (rec.adapt[k] === undefined) rec.adapt[k] = d.adapt[k];
    if (!rec.obs) rec.obs = d.obs;
    if (!rec.rejected) rec.rejected = {};

    rec.battles++;
    if (won) rec.wins++;

    var t = telemetry || {};
    var notes = [];

    if (t.heroSideAvg !== undefined) {
      rec.obs.heroSideSum += t.heroSideAvg;
      rec.obs.heroSideN++;
      if (rec.obs.heroSideN >= 2) {
        var avg = rec.obs.heroSideSum / rec.obs.heroSideN;
        if (Math.abs(avg) > 0.18) {
          // 진형 치우침은 부작용이 작아 시험 없이 바로 반영한다
          var before = rec.adapt.rallyBias;
          rec.adapt.rallyBias = this.clamp(rec.adapt.rallyBias * 0.7 + avg * 0.3, -1, 1);
          if (Math.abs(rec.adapt.rallyBias - before) > 0.05) {
            notes.push('영웅이 ' + (avg < 0 ? '왼쪽' : '오른쪽') + '으로 들어와 대비 방향을 조정');
          }
        }
      }
    }

    // ── 시험 중이면 결과를 판정한다 ──
    if (rec.trial) {
      var since = rec.battles - rec.trial.atBattle;
      if (since >= this.TRIAL_BATTLES) {
        var winsSince = rec.wins - rec.trial.atWins;
        var rateSince = winsSince / since;
        // **개선을 입증해야 채택한다.** '나빠지지 않았으면 유지'로 하면
        // 기준 승률이 0일 때 계속 져도 통과되어(0 < 0 이 거짓) 나쁜 변경이 쌓인다.
        if (rateSince > rec.trial.baseRate + 0.001) {
          notes.push('"' + rec.trial.label + '" 가 승률을 올려 유지합니다');
        } else {
          rec.adapt[rec.trial.key] = rec.trial.prev;
          rec.rejected[rec.trial.key] = true;
          notes.push('"' + rec.trial.label + '" 는 효과가 없어 되돌렸습니다');
        }
        rec.trial = null;
      }
    }

    // ── 시험이 없으면 새 가설을 세운다 ──
    if (!rec.trial) {
      var cands = this._candidate(rec, t);
      if (cands.length && !won) {     // 진 판에서만 새로 시도한다
        var pick = cands[0];
        var prev = rec.adapt[pick.key];
        rec.adapt[pick.key] = this.clamp(prev + this.STEP, 0, this.MAX);
        rec.trial = {
          key: pick.key, prev: prev, label: pick.why,
          baseRate: rec.battles ? rec.wins / rec.battles : 0,
          atBattle: rec.battles, atWins: rec.wins
        };
        notes.push('시험 시작 — ' + pick.why);
      }
    }

    rec.lastNotes = notes;
    all[formationId] = rec;
    this._save(all);
    return rec;
  },

  summary: function (formationId) {
    var rec = this.get(formationId);
    if (!rec.battles) return null;
    var a = rec.adapt, active = [];
    if (a.medicFollow > 0.1) active.push('위생병 추적');
    if (a.guardFollow > 0.1) active.push('방탄병 차단');
    if (a.kite > 0.1) active.push('부상 시 이탈');
    if (Math.abs(a.rallyBias) > 0.2) active.push(a.rallyBias < 0 ? '좌측 대비' : '우측 대비');
    return {
      battles: rec.battles, wins: rec.wins, learned: active,
      testing: rec.trial ? rec.trial.label : null
    };
  },

  reset: function (formationId) {
    var all = this._all();
    delete all[formationId];
    this._save(all);
  }
};
