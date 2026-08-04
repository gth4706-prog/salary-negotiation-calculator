window.GAME = window.GAME || {};

// ============================================================================
//  통곡의 탑 — 축복 (2026-07-31 대개편 2단계)
//
//  ## 왜 만들었나
//
//  사용자 신고의 남은 절반: **"컨트롤이 매번 똑같은 구조다."**
//  1단계(towerplan/towerrule)가 적을 바꿨지만, **내 쪽은 도전 내내 그대로**였다.
//  영웅이 고정이고 스킬 4개도 고정이니 손놀림이 층수와 무관하게 같다.
//  `TowerRun.STATS`(공격력·체력·방어력·이동속도 레벨업)은 숫자만 키운다 — 같은 손놀림이
//  조금 더 세질 뿐이다. **컨트롤을 바꾸려면 "무엇을 할 수 있는가"가 바뀌어야 한다.**
//
//  ## 축복과 레벨업의 차이 (이 구분을 지킬 것)
//
//  | | 레벨업(STATS) | 축복(BOONS) |
//  |---|---|---|
//  | 바꾸는 것 | 숫자 | **행동** |
//  | 얻는 법 | 골드로 산다(언제나 가능) | 층을 깨고 **고른다**(되돌릴 수 없다) |
//  | 개수 | 무제한 성장 | 한 도전에 몇 개, 서로 조합된다 |
//  | 목적 | 성장 곡선 | **매 판 다른 손놀림** |
//
//  그래서 축복은 "공격력 +10" 같은 것을 절대 넣지 않는다. 그건 레벨업의 일이다.
//  축복은 **없던 선택지를 만든다** — 처치하면 돌진이 초기화되니 몰이사냥을 하게 되고,
//  피격 시 반격 파동이 나가니 일부러 맞으러 들어가게 된다.
//
//  ## 구현 규율
//
//  1. **훅 이름은 `combat.js` 와 계약이다.** 이름을 바꾸면 양쪽을 같이 고칠 것.
//  2. **영웅 쪽에만 건다.** `side === 'controller'` 검사를 빠뜨리면 적까지 강해진다
//     (towerrule 에서 같은 함정을 이미 한 번 짚었다).
//  3. **중복 선택 가능한 축복은 `stack: true`** 로 표시하고, 아니면 한 번만 제시된다.
//  4. 축복은 도전이 끝나면 사라진다(`TowerRun.end` 가 기록째 지운다). 영구 성장이 아니다.
// ============================================================================

GAME.TowerBoon = (function () {

  var BOONS = [
    {
      key: 'huntersRush', label: '사냥의 열기',
      desc: '적을 처치하면 이동속도가 3초간 크게 오른다',
      why: '몰아치는 손놀림을 만든다 — 한 기를 끊고 바로 다음으로 붙는다',
      hook: 'huntersRush', arg: { ms: 3000, speedMul: 1.45 }
    },
    {
      key: 'momentum', label: '탄력',
      desc: '적을 처치할 때마다 스킬 쿨타임이 1.2초 줄어든다',
      why: '"쿨마다 한 대" 라는 리듬을 깨고, 처치를 몰아 스킬을 몰아쓰게 만든다',
      hook: 'momentum', arg: { cutMs: 1200 }
    },
    {
      key: 'riposte', label: '반격',
      desc: '맞으면 주변에 충격파가 나간다 (1초에 한 번)',
      why: '피하기만 하던 플레이에 일부러 맞으러 들어가는 선택지를 준다',
      hook: 'riposte', arg: { cd: 1000, radius: 96, dmgMul: 0.55 }
    },
    {
      key: 'lastStand', label: '배수진',
      desc: '체력이 35% 아래면 피해가 40% 늘어난다',
      why: '물약을 언제 쓸지가 선택이 된다 — 아껴서 위험을 유지할 것인가',
      hook: 'lastStand', arg: { below: 0.35, dmgMul: 1.40 }
    },
    {
      key: 'overload', label: '과부하',
      desc: '스킬을 쓰면 다음 기본 공격이 2배로 아프다',
      why: '스킬→평타 순서를 지키게 만든다. 난사하면 값을 못 받는다',
      hook: 'overload', arg: { mul: 2.0 }
    },
    {
      key: 'siphon', label: '흡수',
      desc: '처치할 때마다 체력을 8% 회복한다',
      why: '물약에 의존하지 않고 계속 싸워서 버티는 길을 연다',
      hook: 'siphon', arg: { frac: 0.08 }
    },
    {
      key: 'phase', label: '스침',
      desc: '이동 중에는 받는 피해가 18% 줄어든다',
      why: '멈춰 서서 때리는 습관을 벌준다 — 움직이며 싸우게 만든다',
      hook: 'phase', arg: { cut: 0.18 }
    },
    {
      key: 'echo', label: '메아리',
      desc: '스킬이 0.7초 뒤 절반 위력으로 한 번 더 터진다',
      why: '적이 피한 자리에 두 번째가 온다 — 예측해서 쏘는 재미',
      hook: 'echo', arg: { delay: 700, mul: 0.5 }
    },
    {
      key: 'greed', label: '탐욕',
      desc: '골드를 40% 더 얻지만 최대 체력이 12% 줄어든다',
      why: '성장 속도와 안전을 맞바꾸는 선택. 유일하게 대가가 있는 축복이다',
      hook: null, mods: { hpMul: 0.88 }, goldMul: 1.40
    }
  ];

  function byKey(k) {
    for (var i = 0; i < BOONS.length; i++) if (BOONS[i].key === k) return BOONS[i];
    return null;
  }

  return {
    BOONS: BOONS,
    byKey: byKey,

    // 이 도전이 가진 축복 키 목록.
    owned: function (rec) {
      rec = rec || (GAME.TowerRun && GAME.TowerRun.get());
      return (rec && rec.boons) || [];
    },

    has: function (key, rec) {
      return this.owned(rec).indexOf(key) >= 0;
    },

    // 제시할 후보 n개. 이미 가진 것은 뺀다(`stack` 이 붙은 것만 다시 나온다).
    // 시드를 받아 결정적으로 뽑는다 — 같은 문을 다시 열어도 같은 후보여야 고민이 성립한다.
    offer: function (n, seed, rec) {
      var own = this.owned(rec);
      var pool = BOONS.filter(function (b) {
        return b.stack || own.indexOf(b.key) < 0;
      });
      var s = (seed | 0) || 1;
      function rnd() {
        s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s |= 0;
        return ((s >>> 0) % 100000) / 100000;
      }
      var out = [];
      pool = pool.slice();
      for (var i = 0; i < n && pool.length; i++) {
        out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
      }
      return out;
    },

    // 전투가 읽을 훅 묶음. 축복이 없으면 null 이라 combat.js 는 아무 일도 하지 않는다.
    hooksFor: function (rec) {
      var own = this.owned(rec);
      if (!own.length) return null;
      var h = null;
      for (var i = 0; i < own.length; i++) {
        var b = byKey(own[i]);
        if (!b || !b.hook) continue;
        h = h || {};
        h[b.hook] = b.arg || true;
      }
      return h;
    },

    // 영웅 def 에 곧바로 얹는 배수(훅이 아니라 스탯인 것). 지금은 `greed` 뿐이다.
    // 전투 시작 시 한 번 부른다. `heroUnit.def` 는 `buildHero` 가 판마다 새로 만드는
    // 객체라 여러 판에 걸쳐 누적되지 않는다(공유 def 였다면 층마다 체력이 깎였을 것이다).
    applyDefMods: function (heroUnit, rec) {
      var own = this.owned(rec);
      for (var i = 0; i < own.length; i++) this._mod(heroUnit, byKey(own[i]));
    },

    // 구슬을 **전투 중에** 주웠을 때 그 하나만 얹는다.
    // ⚠ 이게 없으면 탐욕의 구슬이 거짓말을 한다 — 골드 배수는 판이 끝날 때 읽으니
    //   이번 판부터 듣는데, 대가인 체력 −12% 는 다음 판 `buildHero` 에서야 붙는다.
    //   "체력이 12% 줄어든다!" 라고 띄워 놓고 안 줄어드는 것은 문구가 틀린 것이다.
    applyOneMod: function (heroUnit, key) {
      if (!heroUnit) return false;
      return this._mod(heroUnit, byKey(key));
    },

    _mod: function (heroUnit, b) {
      if (!b || !b.mods || !b.mods.hpMul) return false;
      heroUnit.def.hp = Math.round(heroUnit.def.hp * b.mods.hpMul);
      heroUnit.maxHp = heroUnit.def.hp;
      // 최대치가 내려가면 현재 체력도 같이 내려간다. 단 **죽이지는 않는다** —
      // 구슬을 주운 행동이 곧바로 패배가 되면 보상이 아니라 함정이다.
      heroUnit.hp = Math.max(1, Math.min(heroUnit.hp, heroUnit.maxHp));
      return true;
    },

    // 축복의 골드 배수(탐욕). 층 조건의 배수와 **곱해진다** — 무보급+탐욕이면 2.1배다.
    goldMul: function (rec) {
      var own = this.owned(rec), m = 1;
      for (var i = 0; i < own.length; i++) {
        var b = byKey(own[i]);
        if (b && b.goldMul) m *= b.goldMul;
      }
      return m;
    }
  };
})();
