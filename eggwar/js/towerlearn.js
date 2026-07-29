window.GAME = window.GAME || {};

// ============================================================================
//  통곡의 탑 학습 — **탑의 AI 가 그 플레이어를 상대로 배운다.**
//
//  왜 `js/learn.js` 를 그대로 못 쓰는가:
//    learn.js 의 기록은 **배치도 id 별**로 쌓인다. 그런데 탑 배치도는 매 층
//    `tower-<층>` 으로 새로 만들어지므로 학습이 쌓일 자리가 없다. 실제로 탑에서는
//    학습이 한 번도 돈 적이 없었고, 그 빈자리를 v0.54 의 '층별 전술'(층수 = 영리함)이
//    임시로 메우고 있었다. 층 전술은 **누구에게나 똑같다** — 나를 분석한 게 아니다.
//    여기서는 **계정 별**로 쌓아 층이 바뀌어도, 도전이 끝나 1층으로 돌아가도 남는다.
//
//  ── 규율은 learn.js 와 같다: 가설 → 시험 → **개선을 입증했을 때만** 채택 ──
//  "나빠지지 않으면 유지"로 판정하면 기준이 바닥일 때 계속 져도 통과되어 나쁜 변경이
//  쌓인다(learn.js 가 그 사고를 겪고 남긴 규칙이다). 여기서도 margin 을 요구한다.
//
//  ── 이 모드만의 어려움 두 가지 ──
//  ① **승패가 신호로 약하다.** 탑은 플레이어가 이기며 올라가는 구조라 AI 는 거의 매판
//     진다. 승률로 판정하면 표본이 0 근처에 붙어 아무것도 못 배운다.
//     → **등급 점수**를 쓴다: 영웅 최대체력의 몇 %를 깎았는가(0~1) + 이겼으면 +0.5.
//       매 층 반드시 값이 나오고, '아깝게 졌다'와 '손도 못 댔다'가 구분된다.
//  ② **층이 오르면 점수도 자연히 오른다**(진형이 세지니까). 시험 전후를 그냥 비교하면
//     올라가는 중에는 **무슨 변경이든 개선으로 보인다.** 이게 이 모듈에서 가장 쉽게
//     저지를 수 있는 오판이다.
//     → **같은 층끼리만 비교한다.** 층별 평균을 따로 쌓아 두고(byFloor),
//       점수 대신 **잔차**(그 층 평균 대비 얼마나 잘했는가)로 판정한다.
//       처음 보는 층은 잔차 0 = 정보 없음으로 취급한다(그 판은 판정에 안 쓴다).
//       탑은 지면 1층부터 다시라 저층은 금방 여러 번 쌓인다 — 표본이 실제로 모인다.
// ============================================================================
GAME.TowerLearn = {
  KEY: 'asymgame.towerlearn.v1',

  TRIAL_FLOORS: 4,      // 시험을 몇 판 지켜볼 것인가
  MIN_JUDGE: 2,         // 그중 '잔차를 낼 수 있는'(이미 본 층) 판이 최소 몇 판이어야 판정하는가
  STEP: 0.20,
  MAX: 0.60,
  MARGIN: 0.05,         // 이만큼 좋아져야 채택한다(우연을 채택하지 않기 위한 문턱)

  // 층 전술(Tower.TACTICS)과 **같은 이름**을 쓴다. 그래야 mergeTactics 로 자연히 합쳐지고,
  // 화면에 이름을 띄울 때도 두 계층이 같은 말을 한다.
  ACTIONS: ['press', 'kite', 'retreat', 'cohesion', 'medicFollow', 'guardFollow'],

  LABEL: {
    press: '적극 압박', kite: '거리 벌리기', retreat: '약초꾼에게 후퇴',
    cohesion: '대형 유지', medicFollow: '약초꾼이 부상자 추적', guardFollow: '방패병이 앞을 막음'
  },

  _key: function () { return GAME.Account.current() || 'guest'; },
  _all: function () { return GAME.Store.get(this.KEY, {}); },
  _save: function (all) { GAME.Store.set(this.KEY, all); },

  DEFAULT: function () {
    return {
      floors: 0,            // 이 계정이 탑에서 치른 전투 수(도전이 끝나도 이어진다)
      adapt: { press: 0, kite: 0, retreat: 0, cohesion: 0, medicFollow: 0, guardFollow: 0 },
      trial: null,
      rejected: {},
      byFloor: {},          // { '<층>': { n, sum } }  같은 층끼리 비교하기 위한 표
      notes: []
    };
  },

  get: function () {
    var all = this._all();
    var rec = all[this._key()] || this.DEFAULT();
    var def = this.DEFAULT();
    for (var k in def.adapt) if (rec.adapt[k] === undefined) rec.adapt[k] = def.adapt[k];
    if (!rec.byFloor) rec.byFloor = {};
    if (!rec.rejected) rec.rejected = {};
    return rec;
  },

  // 전투가 읽어 갈 학습 결과. 기록이 없으면 전부 0 이라 아무 영향이 없다.
  adaptFor: function () { return this.get().adapt; },

  clamp: function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); },

  // ── AI 성적 (0 ~ 1.5) ─────────────────────────────────────────────────────
  // 영웅 체력을 얼마나 깎았는가 + 실제로 막아냈는가.
  // ⚠ '남은 체력'만 보면 흡혈·물약으로 회복한 판이 과소평가된다. 그래서
  //   **누적으로 넣은 피해**와 **최종적으로 깎아 남긴 몫**을 반씩 섞는다
  //   (수성의 탑 `DefendTower.earnedFrom` 이 같은 이유로 같은 방식을 쓴다).
  scoreOf: function (state, aiWon) {
    if (!state) return 0;
    var hero = null;
    for (var i = 0; i < state.units.length; i++) {
      if (state.units[i] && state.units[i].isHero) { hero = state.units[i]; break; }
    }
    var maxHp = hero ? hero.maxHp : 0;
    if (!maxHp) return aiWon ? 1.5 : 0;
    var dealt = (state.telemetry && state.telemetry.heroDamageTaken) || 0;
    var cum = this.clamp(dealt / maxHp, 0, 1);
    var net = this.clamp(1 - Math.max(0, hero.hp) / maxHp, 0, 1);
    return 0.5 * cum + 0.5 * net + (aiWon ? 0.5 : 0);
  },

  // 관측 → 다음에 시험해 볼 행동. learn.js `_candidate` 와 같은 신호를 쓰되
  // 탑에서만 의미가 있는 것(retreat·cohesion)을 더한다.
  _candidates: function (rec, t) {
    var c = [];
    if (t.strategistUnits > 0 && (t.engagedUnits || 0) * 2 < t.strategistUnits) {
      c.push({ key: 'press', why: '유닛 절반이 영웅과 교전조차 못 함' });
    }
    if ((t.rangedDiedInMelee || 0) > 0) {
      c.push({ key: 'kite', why: '원거리가 붙어서 죽음' });
    }
    if (t.medicPlaced && (t.medicHealed || 0) <= 0) {
      c.push({ key: 'retreat', why: '약초꾼이 회복을 못 함 — 부상자를 보냄' });
      c.push({ key: 'medicFollow', why: '약초꾼이 회복을 못 함 — 약초꾼을 보냄' });
    }
    if (t.guardPlaced && (t.guardBlocked || 0) <= 0) {
      c.push({ key: 'guardFollow', why: '방패병이 영웅을 못 막음' });
    }
    // 한 기씩 끌려나가 죽었다 = 각개격파당했다 → 뭉쳐서 움직이게.
    // 신호는 '교전한 유닛은 많은데 진형이 졌다' — 나가서 싸우긴 했는데 흩어져 싸운 것이다.
    if (t.strategistUnits > 2 && (t.engagedUnits || 0) * 1.4 >= t.strategistUnits) {
      c.push({ key: 'cohesion', why: '흩어져 싸우다 하나씩 잡힘' });
    }
    var self = this;
    return c.filter(function (x) {
      return !rec.rejected[x.key] && rec.adapt[x.key] < self.MAX - 0.001;
    });
  },

  // ── 한 층이 끝났다 ────────────────────────────────────────────────────────
  //  floor  : 방금 싸운 층
  //  state  : 전투 상태(점수·관측을 여기서 뽑는다)
  //  aiWon  : 진형이 이겼는가(= 플레이어가 졌는가)
  record: function (floor, state, aiWon) {
    var all = this._all();
    var k = this._key();
    var rec = this.get();
    var t = (state && state.telemetry) || {};
    var notes = [];

    var score = this.scoreOf(state, aiWon);

    // 같은 층의 지난 평균과 비교한다(층 상승이라는 착시를 걷어낸다).
    var fk = String(floor);
    var slot = rec.byFloor[fk];
    var residual = null;
    if (slot && slot.n > 0) residual = score - (slot.sum / slot.n);

    // 표를 갱신한다 — **비교한 뒤에** 넣어야 자기 자신과 비교하지 않는다.
    if (!slot) slot = rec.byFloor[fk] = { n: 0, sum: 0 };
    slot.n++; slot.sum += score;

    rec.floors++;

    // ── 시험 판정 ──
    if (rec.trial) {
      if (residual !== null) {
        rec.trial.judged = (rec.trial.judged || 0) + 1;
        rec.trial.resSum = (rec.trial.resSum || 0) + residual;
      }
      rec.trial.seen = (rec.trial.seen || 0) + 1;
      if (rec.trial.seen >= this.TRIAL_FLOORS) {
        if ((rec.trial.judged || 0) < this.MIN_JUDGE) {
          // 판정할 근거가 없다 — **채택도 기각도 하지 않고 더 지켜본다.**
          // 근거 없이 채택하면 학습이 아니라 무작위 변경이 된다.
          rec.trial.seen = 0;
          notes.push('"' + rec.trial.label + '" — 비교할 같은 층이 부족해 더 지켜봅니다');
        } else {
          var avg = rec.trial.resSum / rec.trial.judged;
          if (avg > this.MARGIN) {
            notes.push('"' + rec.trial.label + '" 대응이 통했습니다 — 유지합니다');
          } else {
            rec.adapt[rec.trial.key] = rec.trial.prev;
            rec.rejected[rec.trial.key] = true;
            notes.push('"' + rec.trial.label + '" 대응은 효과가 없어 되돌렸습니다');
          }
          rec.trial = null;
        }
      }
    }

    // ── 새 가설 ──
    // 진형이 진 판에서만 세운다. 이긴 판은 고칠 이유가 없다.
    if (!rec.trial && !aiWon) {
      var cands = this._candidates(rec, t);
      if (cands.length) {
        var pick = cands[0];
        var prev = rec.adapt[pick.key];
        rec.adapt[pick.key] = this.clamp(prev + this.STEP, 0, this.MAX);
        rec.trial = {
          key: pick.key, prev: prev, label: this.LABEL[pick.key] || pick.key,
          why: pick.why, seen: 0, judged: 0, resSum: 0
        };
        notes.push('배웠습니다 — ' + pick.why + ' → ' + rec.trial.label);
      }
    }

    rec.notes = notes;
    all[k] = rec;
    this._save(all);
    return rec;
  },

  // 화면에 보여줄 한 줄. 지금 이 계정을 상대로 **무엇을 배워 뒀는지**.
  summary: function () {
    var rec = this.get();
    var on = [];
    for (var i = 0; i < this.ACTIONS.length; i++) {
      var k = this.ACTIONS[i];
      if (rec.adapt[k] > 0.05) on.push(this.LABEL[k]);
    }
    if (!on.length) return null;
    return '탑이 나에게 배운 것: ' + on.join(' · ') +
           (rec.trial ? '   (시험 중 — ' + rec.trial.label + ')' : '');
  },

  // 계정을 지우거나 처음부터 다시 보고 싶을 때
  reset: function () {
    var all = this._all();
    delete all[this._key()];
    this._save(all);
  }
};
