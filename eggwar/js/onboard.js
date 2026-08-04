window.GAME = window.GAME || {};

// ============================================================================
//  온보딩 — **로딩 화면에서 한 번씩만** 가르친다 (2026-08-03)
//
//  사용자 지시: "튜토리얼과 온보딩은 로딩화면에서 녹여내려했다. 로딩화면에서
//  새로운 거 나와서 알릴 게 있다면 **그 내용만** 나오게 해줘. 새로운 온보딩을
//  알려줄 땐 매번 나오는 AI 학습 내용이나 배치 설명은 생략해도 돼."
//
//  ## 왜 별도 튜토리얼 화면을 안 만드는가
//  튜토리얼을 따로 만들면 **한 번 건너뛰면 영영 못 본다.** 이 게임은 로딩 화면이
//  이미 "이번 판에 무엇이 새로운가"를 말하는 자리라, 배울 것도 거기서 말하는 것이
//  맞다. 그리고 **새 적이 나오는 층은 그것만 보여준다**는 규칙이 이미 있다
//  (js/scenes/towerloading.js) — 온보딩도 같은 문법을 쓴다.
//
//  ## 규율
//  · 한 번 보여준 것은 다시 안 띄운다(계정별로 기억).
//  · 한 화면에 **하나만**. 두 개가 동시에 해당되면 우선순위가 높은 것 하나만.
//  · "그때가 왔을 때" 가르친다 — 보스 태세는 첫 보스 층 로딩에서, 구슬은 그때.
//    미리 다 알려주면 읽지도 않고 기억도 안 난다.
//  ⚠ **이기는 조건(층 목표)은 온보딩이 떠도 안 가린다.** towerloading.js 가 스스로
//    적어 둔 원칙이다 — "안 보이는 목표는 목표가 아니라 함정이다."
// ============================================================================
GAME.Onboard = {
  KEY: 'asymgame.onboard.v1',

  //  우선순위 순. `when(ctx)` 가 true 면 후보가 된다.
  //  ctx = { floor, isBoss, formation, char }
  LESSONS: [
    {
      id: 'move',
      when: function (c) { return c.floor <= 1; },
      title: '🎮 움직이고 때리기',
      body: GAME.isTouch
        ? '왼쪽 조이스틱으로 이동, 오른쪽 버튼으로 스킬.\n적은 알아서 때린다 — 너는 피하는 데 집중해라.'
        : '우클릭으로 이동, 적을 클릭하면 공격.\nQ W E R 은 바라보는 방향으로 나간다.'
    },
    {
      id: 'dodge',
      when: function (c) { return c.floor >= 2 && c.floor <= 4; },
      title: '⭕ 붉은 원은 피하라는 뜻',
      body: '바닥에 원이 뜨면 그 자리에 곧 떨어진다.\n이 게임의 공격은 대부분 보고 피할 수 있다 — 서 있지만 마라.'
    },
    {
      id: 'boss',
      when: function (c) { return c.isBoss; },
      title: '☠ 보스는 방어 태세를 쓴다',
      body: '노란 고리가 조여들면 곧 껍질을 닫는다.\n닫힌 동안 때리면 「공격반사」로 내가 맞는다 — 손을 떼고 기다려라.'
    },
    {
      id: 'orb',
      when: function (c) { return c.isBoss; },
      title: '🔮 보스전에는 구슬이 떨어진다',
      body: '회복 · 공격력 2배 · 다음 한 방 1,000% 세 가지.\n5초 뒤 사라진다 — 지금 주우러 갈지 판단해라.'
    },
    {
      id: 'rule',
      when: function (c) { return !!(c.formation && c.formation.ruleLabel); },
      title: '⚠ 층에는 조건이 붙는다',
      body: '조건은 난이도가 아니라 답을 바꾼다.\n적이 얇아지는 대신 빨라지기도 한다 — 매번 읽어라.'
    },
    {
      id: 'shop',
      when: function (c) { return c.floor >= 3 && c.floor <= 6; },
      title: '⚒ 골드는 상점에서 쓴다',
      body: '허브의 상점에서 아이템·스킬·능력치를 산다.\n져도 캐릭터와 골드는 안 사라진다 — 사서 다시 오면 된다.'
    }
  ],

  _all: function () { return GAME.Store.get(this.KEY, {}); },
  _key: function () { return (GAME.Account && GAME.Account.current()) || 'guest'; },

  seen: function () {
    var a = this._all()[this._key()];
    return a && a.length ? a : [];
  },

  //  이번 로딩에서 가르칠 것 하나. 없으면 null.
  //  ⚠ 여기서 **기록하지 않는다.** 화면에 실제로 띄운 쪽이 `markSeen` 을 부른다 —
  //    고르기만 하고 안 띄우는 경로가 생기면 그 교훈을 영영 못 보게 된다.
  pick: function (ctx) {
    var done = this.seen();
    for (var i = 0; i < this.LESSONS.length; i++) {
      var L = this.LESSONS[i];
      if (done.indexOf(L.id) >= 0) continue;
      var ok = false;
      try { ok = !!L.when(ctx || {}); } catch (e) { ok = false; }
      if (ok) return L;
    }
    return null;
  },

  markSeen: function (id) {
    var all = this._all(), k = this._key();
    var a = all[k] || [];
    if (a.indexOf(id) < 0) a.push(id);
    all[k] = a;
    GAME.Store.set(this.KEY, all);
  },

  //  캐릭터를 지우고 다시 시작하면 처음부터 배우게 한다.
  reset: function () {
    var all = this._all();
    delete all[this._key()];
    GAME.Store.set(this.KEY, all);
  }
};
