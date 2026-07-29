window.GAME = window.GAME || {};

// 학습형 AI. 두 방향 모두 배운다.
//
//  (A) 전략가 진형  — 플레이어가 컨트롤러로 도전할 때 상대 진형이 배운다.
//      · 전술 학습: 가설 → 시험 → 채택/기각 언덕오르기 (행동 파라미터)
//      · 난이도 상승(escalation): **격파당할 때마다 그 진형이 강해진다.**
//        같은 배치를 반복해서 깨면 점점 어려워진다.
//  (B) AI 컨트롤러 — 플레이어가 전략가로 방어할 때 공격해 오는 AI 가 배운다.
//
// 모든 기록은 로그인한 ID 별로 분리된다. 다른 ID 로 들어오면 난이도가 처음부터 시작한다.
GAME.Learn = {
  KEY: 'asymgame.learn.v3',
  TRIAL_BATTLES: 3,
  MAX: 0.5,
  STEP: 0.25,
  MAX_ESCALATION: 12,

  _key: function (formationId) {
    return (GAME.Account.current() || 'guest') + '|' + formationId;
  },
  _ctrlKey: function () {
    return (GAME.Account.current() || 'guest') + '|@controller';
  },

  DEFAULT: function () {
    return {
      battles: 0, wins: 0,
      escalation: 0,          // 컨트롤러에게 격파당한 횟수 = 난이도 단계
      adapt: {
        medicFollow: 0, guardFollow: 0, kite: 0, rallyBias: 0,
        press: 0            // 진형이 영웅에게 닿지도 못했을 때 올라가는 '압박' — 반응·추격 범위 확대
      },
      trial: null,
      rejected: {},
      obs: { heroSideSum: 0, heroSideN: 0 },
      lastNotes: []
    };
  },

  DEFAULT_CTRL: function () {
    return {
      battles: 0, wins: 0,
      skill: 0,               // 0~1  AI 컨트롤러의 숙련도 (지면 오른다)
      obs: { deathsToMelee: 0, deathsToRanged: 0, timeouts: 0 },
      lastNotes: []
    };
  },

  _all: function () { return GAME.Store.get(this.KEY, {}); },
  _save: function (all) { GAME.Store.set(this.KEY, all); },

  _fill: function (rec, def) {
    for (var k in def.adapt || {}) if (rec.adapt && rec.adapt[k] === undefined) rec.adapt[k] = def.adapt[k];
    if (!rec.obs) rec.obs = def.obs;
    if (!rec.rejected) rec.rejected = {};
    if (rec.escalation === undefined) rec.escalation = 0;
    return rec;
  },

  get: function (formationId) {
    var all = this._all();
    var rec = all[this._key(formationId)];
    if (!rec) return this.DEFAULT();
    return this._fill(rec, this.DEFAULT());
  },

  clamp: function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); },

  // 난이도 단계 → 전략가 유닛 능력 배수.
  // 시뮬 결과 숙련자 승률이 L0 13/15 → L4 9/15 → L8 6/15 → L12 1/15 로 떨어진다.
  // 첫 격파는 되지만 반복해서 깨면 벽이 되도록 잡은 곡선이다.
  escalationMods: function (esc) {
    return {
      hp: 1 + 0.16 * esc,
      damage: 1 + 0.13 * esc,
      // 단계가 오르면 학습 행동의 상한도 함께 오른다
      adaptCap: Math.min(1, this.MAX + 0.05 * esc)
    };
  },

  _candidate: function (rec, t, cap) {
    var c = [];
    if (t.medicPlaced && (t.medicHealed || 0) <= 0) {
      c.push({ key: 'medicFollow', why: '약초꾼이 회복을 못 함 → 부상자를 따라가게' });
    }
    if (t.guardPlaced && (t.guardBlocked || 0) <= 0) {
      c.push({ key: 'guardFollow', why: '방패병이 못 막음 → 영웅 앞을 가로막게' });
    }
    if ((t.rangedDiedInMelee || 0) > 0) {
      c.push({ key: 'kite', why: '원거리가 붙어서 죽음 → 다치면 물러나게' });
    }
    // 진형 절반 이상이 영웅을 한 번도 못 때렸다 = 제자리만 지키고 교전을 못 했다.
    // 태현님이 관찰한 "제자리에서 뱅글뱅글 돌고 영웅을 잡으러 안 간다"가 이 신호다.
    if (t.strategistUnits > 0 && (t.engagedUnits || 0) * 2 < t.strategistUnits) {
      c.unshift({ key: 'press', why: '유닛 절반 이상이 영웅과 교전조차 못 함 → 더 적극적으로 나가게' });
    }
    return c.filter(function (x) {
      return !rec.rejected[x.key] && rec.adapt[x.key] < cap - 0.001;
    });
  },

  // ── (A) 전략가 진형 학습 ──
  // won = 전략가(진형)가 이겼는가
  record: function (formationId, won, telemetry) {
    var all = this._all();
    var k = this._key(formationId);
    var rec = this._fill(all[k] || this.DEFAULT(), this.DEFAULT());

    rec.battles++;
    if (won) rec.wins++;

    var t = telemetry || {};
    var notes = [];

    // 격파당했다 → 다음 판은 더 강해진다
    if (!won) {
      if (rec.escalation < this.MAX_ESCALATION) {
        rec.escalation++;
        notes.push('격파당해 난이도가 ' + rec.escalation + '단계로 올랐습니다');
      } else {
        notes.push('난이도가 최고 단계(' + this.MAX_ESCALATION + ')입니다');
      }
    }

    var cap = this.escalationMods(rec.escalation).adaptCap;

    if (t.heroSideAvg !== undefined) {
      rec.obs.heroSideSum += t.heroSideAvg;
      rec.obs.heroSideN++;
      if (rec.obs.heroSideN >= 2) {
        var avg = rec.obs.heroSideSum / rec.obs.heroSideN;
        if (Math.abs(avg) > 0.18) {
          var before = rec.adapt.rallyBias;
          rec.adapt.rallyBias = this.clamp(rec.adapt.rallyBias * 0.7 + avg * 0.3, -1, 1);
          if (Math.abs(rec.adapt.rallyBias - before) > 0.05) {
            notes.push('영웅이 ' + (avg < 0 ? '왼쪽' : '오른쪽') + '으로 들어와 대비 방향을 조정');
          }
        }
      }
    }

    // 시험 판정
    if (rec.trial) {
      var since = rec.battles - rec.trial.atBattle;
      if (since >= this.TRIAL_BATTLES) {
        var rateSince = (rec.wins - rec.trial.atWins) / since;
        // 개선을 입증해야 채택한다. '나빠지지 않으면 유지'로 하면
        // 기준 승률 0 에서 계속 져도 통과되어 나쁜 변경이 쌓인다.
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

    if (!rec.trial && !won) {
      var cands = this._candidate(rec, t, cap);
      if (cands.length) {
        var pick = cands[0];
        var prev = rec.adapt[pick.key];
        rec.adapt[pick.key] = this.clamp(prev + this.STEP, 0, cap);
        rec.trial = {
          key: pick.key, prev: prev, label: pick.why,
          baseRate: rec.battles ? rec.wins / rec.battles : 0,
          atBattle: rec.battles, atWins: rec.wins
        };
        notes.push('시험 시작 — ' + pick.why);
      }
    }

    rec.lastNotes = notes;
    all[k] = rec;
    this._save(all);

    // 이 배치도를 **어떤 교리로 짰는지는 AutoFormation 이 기억한다**(id → doctrine).
    // 호출부(scenes/battle.js)를 한 줄도 안 고치고 되먹임을 닫기 위한 경로다.
    // 사람이 짠 배치도면 기억이 없어 null 이고, 그때는 아무 일도 안 일어난다.
    //
    // ⚠ **반드시 `_save(all)` 뒤에 부른다.** 위쪽 `all` 은 함수 진입 시점의 스냅샷이라,
    //    먼저 부르면 recordDoctrine 이 쓴 값을 이 _save 가 옛 스냅샷으로 덮어쓴다.
    //    (실제로 그렇게 짰다가 학습 배수가 전부 1.00 으로 나왔다 — mode=learn 이 잡았다.)
    if (GAME.AutoFormation && GAME.AutoFormation.lastDoctrineFor) {
      this.recordDoctrine(GAME.AutoFormation.lastDoctrineFor(formationId), won);
    }
    return rec;
  },

  summary: function (formationId) {
    var rec = this.get(formationId);
    if (!rec.battles && !rec.escalation) return null;
    var a = rec.adapt, active = [];
    if (a.press > 0.1) active.push('적극 압박');
    if (a.medicFollow > 0.1) active.push('약초꾼 추적');
    if (a.guardFollow > 0.1) active.push('방패병 차단');
    if (a.kite > 0.1) active.push('부상 시 이탈');
    if (Math.abs(a.rallyBias) > 0.2) active.push(a.rallyBias < 0 ? '좌측 대비' : '우측 대비');
    return {
      battles: rec.battles, wins: rec.wins, escalation: rec.escalation,
      learned: active, testing: rec.trial ? rec.trial.label : null
    };
  },

  // ── (A-2) 교리 학습 — **어떤 전략이 이 사람에게 통했는가** ────────────────
  //
  // `autoformation.js` 는 성향(회피율·교전거리·선호 영웅)만 보고 교리를 고른다.
  // 그건 '읽는' 것이지 '배우는' 것은 아니다. 여기서 결과를 되먹여, 실제로 막아낸
  // 교리의 확률을 올리고 매번 뚫린 교리는 내린다.
  //
  // ⚠ 되먹임을 세게 걸지 않는다(±40% 상한, 표본 4판부터 최대). 세게 걸면 몇 판 만에
  //    한 교리로 수렴해 **다시 "매판 같은 전략"** 이 된다 — 이번에 고친 바로 그 문제다.
  //    성향이 분포를 정하고 학습은 그 분포를 기울이기만 한다.
  //
  // ⚠ 배치도 단위가 아니라 **계정 단위**다. 통곡의 탑은 층마다 배치도 id 가 달라서
  //    (`tower-4`, `tower-5` …) 배치도 단위로 쌓으면 표본이 영원히 안 모인다.
  DOC_MAX_BIAS: 0.40,
  DOC_FULL_N: 4,

  _docKey: function () { return (GAME.Account.current() || 'guest') + '|@doctrine'; },

  getDoctrines: function () {
    var all = this._all();
    return all[this._docKey()] || {};
  },

  // strategistWon = 진형(AI)이 막아냈는가
  recordDoctrine: function (doctrine, strategistWon) {
    if (!doctrine) return null;
    var all = this._all();
    var k = this._docKey();
    var rec = all[k] || {};
    var d = rec[doctrine] || { win: 0, loss: 0 };
    if (strategistWon) d.win++; else d.loss++;
    rec[doctrine] = d;
    all[k] = rec;
    this._save(all);
    return d;
  },

  // 교리 가중치에 곱할 값 (0.60 ~ 1.40). 표본이 없으면 1.
  doctrineBias: function (doctrine) {
    var d = this.getDoctrines()[doctrine];
    if (!d) return 1;
    var n = d.win + d.loss;
    if (!n) return 1;
    var rate = d.win / n;
    var conf = Math.min(1, n / this.DOC_FULL_N);
    return 1 + this.DOC_MAX_BIAS * (rate - 0.5) * 2 * conf;
  },

  resetDoctrines: function () {
    var all = this._all();
    delete all[this._docKey()];
    this._save(all);
  },

  // ── (B) AI 컨트롤러 학습 (플레이어가 전략가로 방어할 때) ──
  getCtrl: function () {
    var all = this._all();
    var rec = all[this._ctrlKey()];
    if (!rec) return this.DEFAULT_CTRL();
    if (rec.skill === undefined) rec.skill = 0;
    if (!rec.obs) rec.obs = this.DEFAULT_CTRL().obs;
    return rec;
  },

  // won = AI 컨트롤러가 이겼는가
  recordCtrl: function (won, telemetry) {
    var all = this._all();
    var k = this._ctrlKey();
    var rec = this.getCtrl();
    var t = telemetry || {};
    var notes = [];

    rec.battles++;
    if (won) rec.wins++;

    // 막혔으면 더 잘하게 배운다. 이겼으면 현재 수준을 유지한다.
    if (!won) {
      var before = rec.skill;
      rec.skill = this.clamp(rec.skill + 0.12, 0, 1);
      if (t.timedOut) {
        rec.obs.timeouts++;
        notes.push('시간 안에 못 뚫어 더 공격적으로 접근하도록 배웠습니다');
      } else {
        notes.push('격퇴당해 회피와 스킬 활용을 더 정교하게 배웠습니다');
      }
      if (rec.skill > before + 0.001) {
        notes.push('AI 컨트롤러 숙련도 ' + Math.round(rec.skill * 100) + '%');
      }
    } else {
      notes.push('AI 컨트롤러가 돌파했습니다 (숙련도 ' + Math.round(rec.skill * 100) + '%)');
    }

    rec.lastNotes = notes;
    all[k] = rec;
    this._save(all);
    return rec;
  },

  reset: function (formationId) {
    var all = this._all();
    delete all[this._key(formationId)];
    this._save(all);
  },

  resetCtrl: function () {
    var all = this._all();
    delete all[this._ctrlKey()];
    this._save(all);
  }
};
