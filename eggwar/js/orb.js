window.GAME = window.GAME || {};

// ============================================================================
//  구슬 (2026-07-31, 사용자 지시) — 축복을 **줍는 물건**으로 바꾼다
//
//  ## 왜 바꿨나
//
//  축복은 원래 '두 갈래 문'에서 골랐고, 문을 없앤 뒤에는 5층마다 자동으로 붙었다.
//  둘 다 실패했다. 이유가 같다 — **언제 무엇을 얻었는지가 몸에 안 남았다.**
//    · 문: 이름만 보고 고르라니 선택이 아니라 퀴즈였다
//    · 자동: 층 화면 구석에 `✦ 탄력` 한 줄. 받은 줄도 모른다
//
//  사용자 지시: "적 유닛을 잡았을 때 구슬 같은 걸로 랜덤하게 나오게 하고, 구슬을 먹으면
//  간단한 텍스트로 알려줘. 예를 들면 스침 = 회피의 구슬 = 이동 중 받는 피해 18% 감소!"
//
//  이게 맞는 설계다. 얻는 순간이 **전투 안에** 있고, 주우러 가는 행동이 필요하고,
//  주운 즉시 무엇을 얻었는지 글자로 뜬다. 세 가지가 전부 '몸에 남는' 조건이다.
//
//  ## 동전과 같은 문법을 쓴다
//  `js/coin.js` 가 이미 "적을 잡으면 떨어지고 지나가면 줍는다"를 하고 있다.
//  플레이어가 이미 아는 동작이므로 **새로 배울 것이 없다.** 구슬은 그 위에 얹는다:
//    · 떨어지는 조건이 다르다(확률)
//    · 주울 때 골드가 아니라 **능력**이 붙고 큰 글자가 뜬다
//
//  ## 규율
//  1. **한 판에 얻을 수 있는 구슬 수에 상한을 둔다.** 없으면 물량 층에서 9종을 다 먹고
//     남은 층이 무의미해진다. 상한이 곧 '이 판의 빌드'를 만든다.
//  2. **같은 구슬은 두 번 안 나온다.** 중복은 보상이 아니라 낭비다.
//  3. **이름은 능력을 말해야 한다.** '스침'은 무슨 뜻인지 모른다 → **'회피의 구슬'**.
//     사용자가 든 예시가 그대로 규칙이다.
//  4. 축복 효과 자체(`js/towerboon.js` 의 훅)는 그대로 쓴다 — 이미 검증된 기제다.
//     이 파일은 **얻는 방법**만 바꾼다.
// ============================================================================

GAME.Orb = (function () {

  // 축복 키 → 구슬 이름. 사용자 예시("스침 = 회피의 구슬")의 결을 따라
  // **무엇을 하는 구슬인지**가 이름에 들어가게 지었다.
  var NAMES = {
    huntersRush: '질주의 구슬',
    momentum:    '재촉의 구슬',
    riposte:     '가시의 구슬',
    lastStand:   '역전의 구슬',
    overload:    '벼름의 구슬',
    siphon:      '흡수의 구슬',
    phase:       '회피의 구슬',
    echo:        '메아리 구슬',
    greed:       '탐욕의 구슬'
  };

  // 한 판에 먹을 수 있는 상한. 3 이면 "이번 판은 질주+흡수+가시" 처럼 조합이 생긴다.
  var MAX_PER_BATTLE = 3;
  // 적 한 기를 잡을 때 구슬이 나올 확률. 층당 적이 10~20기이므로 0.10 이면
  // 기대 1~2개, 운이 좋으면 상한 3개까지 — "가끔 나온다"가 성립하는 값이다.
  var DROP_CHANCE = 0.10;

  return {
    NAMES: NAMES,
    MAX_PER_BATTLE: MAX_PER_BATTLE,
    DROP_CHANCE: DROP_CHANCE,

    nameOf: function (key) { return NAMES[key] || '구슬'; },

    // 주웠을 때 띄울 한 줄. 사용자 예시 형식 그대로:
    //   "회피의 구슬 — 이동 중 받는 피해 18% 감소!"
    lineFor: function (key) {
      var b = GAME.TowerBoon && GAME.TowerBoon.byKey(key);
      if (!b) return this.nameOf(key);
      return this.nameOf(key) + ' — ' + b.desc + '!';
    },

    // 이 전투에서 아직 안 나온 축복 하나를 뽑는다. 없으면 null.
    // ⚠ `state.orbTaken` 은 **이 판에서 주운 것**, `run.boons` 는 도전 전체다.
    //   판마다 새로 뽑되 도전 중 이미 가진 것은 다시 안 준다(중복은 낭비다).
    // ⚠ **바닥에 놓인 구슬도 세야 한다.** 처음엔 `orbTaken`(주운 것)만 봤는데,
    //   줍기 전에는 그 배열이 비어 있어서 상한이 전혀 안 걸렸다 —
    //   400번 굴리니 **39개**가 깔리고 같은 구슬이 반복됐다(감사가 잡았다).
    //   "이미 나와 있는 것"과 "이미 주운 것"을 합쳐야 상한과 중복 검사가 성립한다.
    _pending: function (state) {
      var out = (state.orbTaken || []).slice();
      var list = state.orbs || [];
      for (var i = 0; i < list.length; i++) {
        if (out.indexOf(list[i].key) < 0) out.push(list[i].key);
      }
      return out;
    },

    roll: function (state) {
      if (!GAME.TowerBoon) return null;
      state.orbTaken = state.orbTaken || [];
      var seen = this._pending(state);
      if (seen.length >= MAX_PER_BATTLE) return null;
      var run = GAME.TowerRun && GAME.TowerRun.get();
      var owned = (run && run.boons) || [];
      var pool = GAME.TowerBoon.BOONS.filter(function (b) {
        return owned.indexOf(b.key) < 0 && seen.indexOf(b.key) < 0;
      });
      if (!pool.length) return null;
      return pool[Math.floor(Math.random() * pool.length)].key;
    },

    // 적이 죽었을 때 부른다. 확률을 넘기면 구슬 하나를 바닥에 놓는다.
    // 좌표만 기록한다 — 그리기·줍기는 씬(OrbField)이 한다.
    maybeDrop: function (state, x, y) {
      if (!state || !state.orbs) return null;
      if (this._pending(state).length >= MAX_PER_BATTLE) return null;
      //  구슬 감각(orbFind, 2026-09-04 특성) — 떨어질 확률에 배수를 건다.
      //  ⚠ 상한(MAX_PER_BATTLE)은 그대로다 — 확률만 올라가고 총량은 안 바뀐다.
      //    안 그러면 특성 하나로 한 판에 구슬이 쏟아져 구슬의 특별함이 사라진다.
      var ofMul = (state.boons && state.boons.orbFind && state.boons.orbFind.mul) || 1;
      if (Math.random() >= DROP_CHANCE * ofMul) return null;
      var key = this.roll(state);
      if (!key) return null;
      state.orbs.push({ key: key, x: x, y: y, t: 0, taken: false });
      return key;
    },

    // 주웠다 — 효과를 즉시 켠다.
    // ⚠ **전투 중에 켜야 한다.** `run.boons` 에만 넣으면 다음 판부터 듣는다(=이번 판엔
    //   아무 일도 안 일어난다). `state.boons` 를 다시 만들어 그 자리에서 붙인다.
    take: function (state, key) {
      state.orbTaken = state.orbTaken || [];
      if (state.orbTaken.indexOf(key) >= 0) return false;
      state.orbTaken.push(key);
      var run = GAME.TowerRun && GAME.TowerRun.get();
      if (run) {
        run.boons = run.boons || [];
        if (run.boons.indexOf(key) < 0) run.boons.push(key);
        GAME.TowerRun._save(run);
      }
      // 이번 판에 곧바로 적용 — 훅 묶음을 다시 만든다.
      if (GAME.TowerBoon) {
        var all = (run && run.boons) ? run.boons.slice() : state.orbTaken.slice();
        state.boons = GAME.TowerBoon.hooksFor({ boons: all });
        // 시즌2 특성(js/traits.js)은 boons 와 같은 훅 묶음에 얹혀 있어서, 여기서 통째로
        // 다시 만들면 증발한다 — 다시 붙인다(S-H 통합 항목).
        if (GAME.Traits && GAME.Traits.reapply) GAME.Traits.reapply(state);
        // 훅이 아니라 **스탯**인 구슬(탐욕)은 영웅에게 직접 얹는다. 훅만 다시 만들면
        // 이런 구슬은 이번 판에 아무 일도 안 일어난다 — 문구와 실제가 어긋난다.
        var units = state.units || [];
        for (var i = 0; i < units.length; i++) {
          if (units[i].isHero && units[i].side !== 'strategist') {
            GAME.TowerBoon.applyOneMod(units[i], key);
            break;
          }
        }
      }
      return true;
    }
  };
})();
