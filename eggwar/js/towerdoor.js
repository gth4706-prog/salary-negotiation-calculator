window.GAME = window.GAME || {};

// ============================================================================
//  통곡의 탑 — 두 갈래 문 (2026-07-31 대개편 2단계)
//
//  ## 왜 만들었나
//
//  사용자 신고: **"층 구조도 매번 똑같은 구조다."**
//  1단계가 층의 내용을 바꿨지만 **오르는 방식**은 그대로였다 — 깨면 다음 층, 또 깨면 다음 층.
//  선택이 없으면 층은 순번일 뿐이고, 플레이어는 자기 도전을 '설계'하지 못한다.
//
//  로그라이크가 반복을 이기는 방법은 하나다: **갈림길**. 같은 층수라도
//  "나는 저번엔 안전한 길로 갔고 이번엔 탐욕을 들었다"가 되면 두 번째 도전이 처음이 아니다.
//
//  ## 무엇을 고르게 하는가
//
//  문 하나는 **다음 층의 예고 + 보상**이다. 둘 다 보여 주고 고르게 한다:
//    · 왼쪽 문: 조건이 붙은 층 + 큰 보상(축복 또는 골드)
//    · 오른쪽 문: 조건이 없거나 약한 층 + 작은 보상
//  즉 **위험과 보상을 맞바꾸는 결정**이다. 무엇이 기다리는지 모르고 고르면 그건 도박이지
//  선택이 아니다 — 그래서 원형·조건을 **미리 다 보여 준다.**
//
//  ## 구현 규율
//
//  1. **문은 다음 층의 조건을 바꾼다.** 층수는 그대로다(2층씩 건너뛰게 하면 곡선이 깨진다).
//     `TowerRun.doorPick` 에 고른 문을 적어 두고 `TowerRule.ruleFor` 가 그걸 존중한다.
//  2. **되돌릴 수 없다.** 고르고 나면 그 층을 깰 때까지 유지된다. 그래야 고민이 성립한다.
//  3. **1~5층에는 문이 없다.** 조건이 시작되는 층(TowerRule.FROM_FLOOR)부터다 —
//     배울 것이 아직 없는데 고르라고 하면 무의미한 클릭이 된다.
//  4. 문 후보는 **도전 시드 + 층**으로 결정적이다. 같은 문을 다시 봐도 같은 선택지여야
//     "저번에 저걸 골랐지" 가 성립한다.
// ============================================================================

GAME.TowerDoor = (function () {

  function rng(seed) {
    var s = seed | 0; if (!s) s = 1;
    return function () {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s |= 0;
      return ((s >>> 0) % 100000) / 100000;
    };
  }

  function runSeed() {
    var run = GAME.TowerRun && GAME.TowerRun.get();
    return (run && run.seed) ? (run.seed | 0) : 0x30ed;
  }

  return {
    // 문이 열리기 시작하는 층 — 조건이 시작되는 층과 맞춘다.
    FROM_FLOOR: (GAME.TowerRule && GAME.TowerRule.FROM_FLOOR) || 6,

    // 이 층에 들어가기 전에 문을 보여줄 것인가.
    // 도전 중일 때만 — 단층 도전(도전 기록 없이 한 층만)에는 성장 축이 없어 문이 무의미하다.
    shouldOffer: function (floor) {
      if (!GAME.TowerRun || !GAME.TowerRun.get()) return false;
      if (floor < this.FROM_FLOOR) return false;
      var run = GAME.TowerRun.get();
      // 이미 이 층의 문을 골랐으면 다시 묻지 않는다(되돌릴 수 없다는 규칙).
      return !(run.doorPick && run.doorPick.floor === floor);
    },

    // 이 층의 두 문. 결정적이다(도전 시드 + 층).
    //   risky : 조건이 붙는다 + 보상이 크다
    //   safe  : 조건이 없다 + 보상이 작다
    doorsFor: function (floor) {
      var r = rng((runSeed() ^ (floor * 0x27d4eb2d)) | 0);
      var rule = GAME.TowerRule ? GAME.TowerRule.ruleFor(floor) : null;
      var run = GAME.TowerRun && GAME.TowerRun.get();

      // 험한 문의 조건 — 이 층에 원래 붙는 조건이 있으면 그것을, 없으면 하나 뽑는다.
      var riskyRule = rule;
      if (!riskyRule && GAME.TowerRule && GAME.TowerRule.RULES.length) {
        riskyRule = GAME.TowerRule.RULES[Math.floor(r() * GAME.TowerRule.RULES.length)];
      }

      // 보상 — 축복이 남아 있으면 축복, 아니면 골드.
      var offer = GAME.TowerBoon ? GAME.TowerBoon.offer(1, (runSeed() ^ floor * 7919) | 0, run) : [];
      var boon = offer.length ? offer[0] : null;

      var goldBig = Math.round((GAME.TowerRun ? GAME.TowerRun.goldFor(floor) : 20) * 0.55);
      var goldSmall = Math.round(goldBig * 0.35);

      return [
        {
          key: 'risky',
          label: '험한 길',
          ruleKey: riskyRule ? riskyRule.key : null,
          ruleLabel: riskyRule ? riskyRule.label : null,
          ruleDesc: riskyRule ? riskyRule.desc : null,
          boonKey: boon ? boon.key : null,
          boonLabel: boon ? boon.label : null,
          boonDesc: boon ? boon.desc : null,
          gold: boon ? 0 : goldBig,
          why: boon ? '조건을 안고 가는 대신 새 힘을 얻는다'
                    : '조건을 안고 가는 대신 골드를 더 받는다'
        },
        {
          key: 'safe',
          label: '무난한 길',
          ruleKey: null, ruleLabel: null, ruleDesc: null,
          boonKey: null, boonLabel: null, boonDesc: null,
          gold: goldSmall,
          why: '조건 없이 지나간다. 대신 얻는 것이 적다'
        }
      ];
    },

    // 문을 고른다. 보상을 즉시 지급하고, 그 층의 조건을 확정한다.
    pick: function (floor, doorKey) {
      if (!GAME.TowerRun) return null;
      var run = GAME.TowerRun.get();
      if (!run) return null;
      var doors = this.doorsFor(floor);
      var d = null;
      for (var i = 0; i < doors.length; i++) if (doors[i].key === doorKey) d = doors[i];
      if (!d) d = doors[doors.length - 1];

      run.doorPick = { floor: floor, key: d.key, ruleKey: d.ruleKey || null };
      if (d.boonKey) {
        run.boons = run.boons || [];
        if (run.boons.indexOf(d.boonKey) < 0) run.boons.push(d.boonKey);
      }
      if (d.gold) run.gold = (run.gold || 0) + d.gold;
      GAME.TowerRun._save(run);
      return d;
    },

    // 이 층에서 확정된 조건 키(문을 골랐으면 그것, 아니면 null).
    // `TowerRule.ruleFor` 가 이 값을 존중한다 — 두 곳이 갈라지면 화면과 전투가 다른 말을 한다.
    pickedRuleKey: function (floor) {
      var run = GAME.TowerRun && GAME.TowerRun.get();
      if (!run || !run.doorPick || run.doorPick.floor !== floor) return undefined;
      return run.doorPick.ruleKey;   // null 이면 '조건 없음' 이라는 뜻이다
    }
  };
})();
