window.GAME = window.GAME || {};

// ============================================================================
//  특성 — **격자형 특성 트리** (2026-09-04 전면 재설계)
//
//  태현님: "특성시스템은 내가 캡쳐첨부한 롤의 특성을 참고해 이런식의 나뭇가지를 원했어.
//   그리고 세계관보다는 사용자가 읽고 방향정하기 편해야해. 그리고 여기서의 특성으로는
//   능력치나 아이템으로 얻기어렵거나 얻을수없는 능력을 얻었으면좋겠어"
//
//  ## 옛 구조와 무엇이 달라졌나
//    옛: 영웅마다 6갈래 × 4단, 같은 컨셉의 **형제 갈래**를 1단 이상 사야 4단이 열림.
//    새: **세 나무(공격·방어·유틸) × 격자**. 롤 특성처럼
//        · 칸마다 **단계(n/max)** 가 있고
//        · **줄마다 그 나무에 쓴 누적 점수**가 있어야 열리고(ROW_GATE)
//        · 일부 칸은 **위 칸을 찍어야** 열린다(req — 화면에 세로 연결선으로 그린다)
//
//  ## 왜 영웅별이 아니라 공용인가
//    옛 구조는 영웅 5명 × 6갈래를 따로 적어 두어 **읽을 것이 5배**였고, 새 영웅을
//    넣을 때마다 6갈래를 새로 지어야 했다. 태현님 요구가 "읽고 방향 정하기 편해야
//    한다"이므로 **한 벌을 모두가 공유**한다 — 롤 특성도 챔피언별이 아니다.
//    영웅 색은 화면이 입힌다(데이터는 공용).
//
//  ## 무엇을 특성으로 주는가 — **능력치·아이템으로 못 얻는 것만**
//    태현님 지시 그대로다. 그래서 여기엔 "공격력 +10" 같은 칸이 **하나도 없다**.
//    전부 조건부 행동(처치하면 / 맞으면 / 체력이 낮으면 / 스킬을 쓰면)이다.
//    ⚠ 새 칸을 넣을 때 이 규율을 먼저 볼 것 — 숫자만 올리는 칸은 상점이 이미 판다.
//
//  ## 붙는 자리(통합자)
//    battle.js  — `GAME.Traits.attach(this.state, tc)` · `haste` 를 hero.speed/cdrMul 에
//    orb.js     — `GAME.Traits.reapply(state)`
//    towerchar.js — `luckGoldMul` 안에서 `goldFind` 배수
//    combat.js  — execute·cap·revive 훅을 applyDamage 관문에서 읽는다
// ============================================================================
GAME.Traits = (function () {

  //  ⚠ **한 단 = 1 점**(롤 방식). 옛 구조의 1/2/4/7 계단을 버렸다 — 계단은
  //    "이 갈래를 끝까지 팔 것인가"를 묻는데, 격자에서는 **어느 줄까지 내려갈
  //    것인가**를 줄 게이트가 이미 묻는다. 두 장치가 겹치면 읽기만 어려워진다.
  var COST = 1;

  //  줄 게이트 — 그 **나무에 쓴 누적 점수**가 이만큼이어야 그 줄이 열린다.
  //  (롤 캡처의 '위에서부터 채워 내려간다'가 이것이다.)
  var ROW_GATE = [0, 4, 8];

  //  ── 나무 셋 ────────────────────────────────────────────────────────────────
  //  talent: { key, row, col, name, max, hook, ranks:[arg…], desc:[줄…], req }
  //    row  — 0·1·2 (ROW_GATE 와 짝)
  //    col  — 그 줄 안에서 왼쪽부터
  //    req  — 이 칸을 열려면 1단 이상 찍혀 있어야 하는 칸(화면이 세로선으로 잇는다)
  //  ⚠ desc 는 **읽고 고르는 문장**이다. 세계관 수사 말고 "무엇이 일어나는가"만 적는다.
  var TREES = [
    {
      key: 'attack', name: '공격', why: '몰아붙여 끝낸다',
      talents: [
        { key: 'a_rush', row: 0, col: 0, name: '사냥의 열기', max: 3, hook: 'huntersRush',
          ranks: [{ ms: 2000, speedMul: 1.15 }, { ms: 2600, speedMul: 1.30 }, { ms: 3200, speedMul: 1.45 }],
          desc: ['처치하면 2초간 이동 ×1.15', '처치하면 2.6초간 이동 ×1.30', '처치하면 3.2초간 이동 ×1.45'] },
        { key: 'a_over', row: 0, col: 1, name: '과부하', max: 3, hook: 'overload',
          ranks: [{ mul: 1.4 }, { mul: 1.8 }, { mul: 2.3 }],
          desc: ['스킬 직후 첫 평타 ×1.4', '스킬 직후 첫 평타 ×1.8', '스킬 직후 첫 평타 ×2.3'] },
        { key: 'a_mom', row: 1, col: 0, name: '탄력', max: 3, hook: 'momentum', req: 'a_rush',
          ranks: [{ cutMs: 700 }, { cutMs: 1200 }, { cutMs: 1800 }],
          desc: ['처치하면 스킬 쿨 0.7초 감소', '처치하면 스킬 쿨 1.2초 감소', '처치하면 스킬 쿨 1.8초 감소'] },
        { key: 'a_siphon', row: 1, col: 1, name: '흡수', max: 3, hook: 'siphon', req: 'a_over',
          ranks: [{ frac: 0.05 }, { frac: 0.09 }, { frac: 0.14 }],
          desc: ['처치하면 최대체력 5% 회복', '처치하면 최대체력 9% 회복', '처치하면 최대체력 14% 회복'] },
        //  ── 마무리 칸 ──
        { key: 'a_exec', row: 2, col: 0, name: '마무리', max: 1, hook: 'execute', req: 'a_siphon',
          ranks: [{ below: 0.25, mul: 1.6 }],
          desc: ['체력 25% 아래인 적에게 주는 피해 ×1.6'] }
      ]
    },
    {
      key: 'defense', name: '방어', why: '버티고 되돌려준다',
      talents: [
        { key: 'd_last', row: 0, col: 0, name: '배수진', max: 3, hook: 'lastStand',
          ranks: [{ below: 0.30, dmgMul: 1.18 }, { below: 0.30, dmgMul: 1.32 }, { below: 0.35, dmgMul: 1.48 }],
          desc: ['체력 30% 아래면 내 피해 +18%', '체력 30% 아래면 내 피해 +32%', '체력 35% 아래면 내 피해 +48%'] },
        { key: 'd_rip', row: 0, col: 1, name: '반격', max: 3, hook: 'riposte',
          ranks: [{ cd: 1400, r: 84, dmgMul: 0.45 }, { cd: 1100, r: 92, dmgMul: 0.60 }, { cd: 900, r: 100, dmgMul: 0.75 }],
          desc: ['맞으면 주변에 충격파(1.4초마다)', '맞으면 더 센 충격파(1.1초마다)', '맞으면 가장 센 충격파(0.9초마다)'] },
        { key: 'd_phase', row: 1, col: 0, name: '스침', max: 3, hook: 'phase', req: 'd_rip',
          ranks: [{ cut: 0.10 }, { cut: 0.16 }, { cut: 0.22 }],
          desc: ['움직이는 동안 받는 피해 −10%', '움직이는 동안 받는 피해 −16%', '움직이는 동안 받는 피해 −22%'] },
        //  ⚠ 이 칸이 "아이템으로 못 얻는 것"의 대표다 — 방어력은 비율 경감이라
        //    **한 방이 큰 공격**을 못 막는다. 상한은 그 축을 통째로 바꾼다.
        { key: 'd_cap', row: 1, col: 1, name: '한 방 막기', max: 3, hook: 'cap', req: 'd_last',
          ranks: [{ frac: 0.40 }, { frac: 0.32 }, { frac: 0.26 }],
          desc: ['한 번에 최대체력 40% 넘게 안 맞는다', '한 번에 32% 넘게 안 맞는다', '한 번에 26% 넘게 안 맞는다'] },
        { key: 'd_revive', row: 2, col: 0, name: '버티기', max: 1, hook: 'revive', req: 'd_cap',
          ranks: [{ healFrac: 0.30 }],
          desc: ['죽을 피해를 한 판에 한 번 버티고 30% 회복'] }
      ]
    },
    {
      key: 'utility', name: '유틸', why: '더 빨리, 더 많이 모은다',
      talents: [
        { key: 'u_haste', row: 0, col: 0, name: '재촉', max: 3, hook: 'haste',
          ranks: [{ speedMul: 1.04, cdrMul: 0.96 }, { speedMul: 1.07, cdrMul: 0.92 }, { speedMul: 1.10, cdrMul: 0.88 }],
          desc: ['이동 ×1.04 · 스킬 쿨 −4%', '이동 ×1.07 · 스킬 쿨 −8%', '이동 ×1.10 · 스킬 쿨 −12%'] },
        { key: 'u_gold', row: 0, col: 1, name: '전리품의 눈', max: 3, hook: 'goldFind',
          ranks: [{ mul: 1.08 }, { mul: 1.16 }, { mul: 1.26 }],
          desc: ['골드 획득 +8%', '골드 획득 +16%', '골드 획득 +26%'] },
        { key: 'u_orb', row: 1, col: 0, name: '구슬 감각', max: 3, hook: 'orbFind', req: 'u_gold',
          ranks: [{ mul: 1.35 }, { mul: 1.7 }, { mul: 2.1 }],
          desc: ['구슬이 떨어질 확률 ×1.35', '구슬이 떨어질 확률 ×1.7', '구슬이 떨어질 확률 ×2.1'] },
        { key: 'u_echo', row: 1, col: 1, name: '메아리', max: 2, hook: 'echo', req: 'u_haste',
          ranks: [{ chance: 0.14 }, { chance: 0.24 }],
          desc: ['스킬이 14% 확률로 한 번 더', '스킬이 24% 확률로 한 번 더'] },
        { key: 'u_prep', row: 2, col: 0, name: '준비된 자', max: 1, hook: 'prep', req: 'u_echo',
          ranks: [{ on: 1 }],
          desc: ['판이 시작될 때 모든 스킬을 바로 쓸 수 있다'] }
      ]
    }
  ];

  //  같은 훅이 두 곳(축복·구슬·특성)에서 오면 어떻게 합칠지. 없으면 먼저 온 것을 쓴다.
  var MERGE = {
    huntersRush: function (a, b) { return { ms: Math.max(a.ms || 0, b.ms || 0), speedMul: Math.max(a.speedMul || 1, b.speedMul || 1) }; },
    momentum:    function (a, b) { return { cutMs: (a.cutMs || 0) + (b.cutMs || 0) }; },
    riposte:     function (a, b) { return { cd: Math.min(a.cd || 9999, b.cd || 9999), r: Math.max(a.r || 0, b.r || 0), dmgMul: Math.max(a.dmgMul || 0, b.dmgMul || 0) }; },
    lastStand:   function (a, b) { return { below: Math.max(a.below || 0, b.below || 0), dmgMul: Math.max(a.dmgMul || 1, b.dmgMul || 1) }; },
    overload:    function (a, b) { return { mul: Math.max(a.mul || 1, b.mul || 1) }; },
    siphon:      function (a, b) { return { frac: (a.frac || 0) + (b.frac || 0) }; },
    phase:       function (a, b) { return { cut: Math.min(0.45, (a.cut || 0) + (b.cut || 0)) }; },
    echo:        function (a, b) { return { chance: Math.min(0.5, (a.chance || 0) + (b.chance || 0)) }; },
    haste:       function (a, b) { return { speedMul: Math.max(a.speedMul || 1, b.speedMul || 1), cdrMul: Math.min(a.cdrMul || 1, b.cdrMul || 1) }; },
    goldFind:    function (a, b) { return { mul: Math.max(a.mul || 1, b.mul || 1) }; },
    //  2026-09-04 신설 — 전부 "능력치·아이템으로 못 얻는" 축이다.
    execute:     function (a, b) { return { below: Math.max(a.below || 0, b.below || 0), mul: Math.max(a.mul || 1, b.mul || 1) }; },
    cap:         function (a, b) { return { frac: Math.min(a.frac || 1, b.frac || 1) }; },   // 작을수록 강하다
    revive:      function (a, b) { return { healFrac: Math.max(a.healFrac || 0, b.healFrac || 0) }; },
    orbFind:     function (a, b) { return { mul: Math.max(a.mul || 1, b.mul || 1) }; },
    prep:        function (a, b) { return { on: 1 }; }
  };

  function allTalents() {
    var out = [];
    for (var i = 0; i < TREES.length; i++) {
      for (var j = 0; j < TREES[i].talents.length; j++) {
        var t = TREES[i].talents[j];
        t.tree = TREES[i].key;                 // 역참조(데이터에 한 번만 심는다)
        out.push(t);
      }
    }
    return out;
  }
  function talent(key) {
    var all = allTalents();
    for (var i = 0; i < all.length; i++) if (all[i].key === key) return all[i];
    return null;
  }
  function treeOf(key) {
    for (var i = 0; i < TREES.length; i++) if (TREES[i].key === key) return TREES[i];
    return null;
  }
  function recOf(rec) {
    if (rec) return rec;
    return (GAME.TowerChar && GAME.TowerChar.exists && GAME.TowerChar.exists()) ? GAME.TowerChar.get() : null;
  }
  function rankOf(key, rec) {
    rec = recOf(rec);
    return (rec && rec.traits && rec.traits[key]) || 0;
  }
  //  그 나무에 쓴 누적 점수 — 줄 게이트가 이것을 본다.
  function spentIn(treeKey, rec) {
    rec = recOf(rec);
    if (!rec || !rec.traits) return 0;
    var tr = treeOf(treeKey), n = 0;
    if (!tr) return 0;
    for (var i = 0; i < tr.talents.length; i++) n += (rec.traits[tr.talents[i].key] || 0) * COST;
    return n;
  }

  var api = {
    COST: COST,
    ROW_GATE: ROW_GATE,
    TREES: TREES,
    talents: allTalents,
    talent: talent,
    treeOf: treeOf,
    rankOf: rankOf,
    spentIn: spentIn,
    rowGate: function (row) { return ROW_GATE[row] === undefined ? 0 : ROW_GATE[row]; },

    //  이 칸을 지금 살 수 있는가 — 못 사면 **왜 못 사는지**를 같이 돌려준다.
    //  ⚠ 화면이 그 문구를 그대로 띄운다. "왜 잠겼는지 모르겠다"가 이 시스템에서
    //    가장 흔한 불만이라, 이유를 데이터가 만들어 주는 쪽이 맞다.
    reasonFor: function (key, rec) {
      rec = recOf(rec);
      var t = talent(key);
      if (!t) return '없는 특성';
      if (!rec) return '캐릭터가 없다';
      var cur = rankOf(key, rec);
      if (cur >= t.max) return '이미 끝까지 찍었다';
      var gate = this.rowGate(t.row);
      var have = spentIn(t.tree, rec);
      if (have < gate) return treeOf(t.tree).name + ' 에 ' + (gate - have) + '점 더 필요';
      if (t.req && rankOf(t.req, rec) < 1) {
        var rq = talent(t.req);
        return (rq ? rq.name : t.req) + ' 을(를) 먼저 찍어야 한다';
      }
      var pts = (GAME.Season && GAME.Season.worldPoints) ? GAME.Season.worldPoints() : 0;
      if (pts < COST) return '세계 포인트가 없다';
      return null;
    },
    canBuy: function (key, rec) { return this.reasonFor(key, rec) === null; },

    //  한 단 산다. 성공하면 새 단계, 실패하면 0.
    buy: function (key, rec) {
      rec = recOf(rec);
      if (!this.canBuy(key, rec)) return 0;
      if (!GAME.Season || !GAME.Season.spendWorldPoint || !GAME.Season.spendWorldPoint(COST)) return 0;
      if (!rec.traits) rec.traits = {};
      rec.traits[key] = (rec.traits[key] || 0) + 1;
      if (GAME.TowerChar && GAME.TowerChar.saveRec) GAME.TowerChar.saveRec(rec);
      else if (GAME.TowerChar && GAME.TowerChar.KEY && GAME.Account) {
        var all = GAME.Store.get(GAME.TowerChar.KEY, {});
        all[GAME.Account.current() || 'guest'] = rec;
        GAME.Store.set(GAME.TowerChar.KEY, all);
      }
      return rec.traits[key];
    },

    //  찍은 특성 전부를 훅 뭉치로. 축복(towerboon)과 **같은 모양**이라 그대로 합쳐진다.
    hooksFor: function (rec) {
      rec = recOf(rec);
      var out = {};
      if (!rec || !rec.traits) return out;
      var all = allTalents();
      for (var i = 0; i < all.length; i++) {
        var t = all[i], r = rec.traits[t.key] || 0;
        if (r < 1) continue;
        var arg = t.ranks[Math.min(r, t.max) - 1];
        if (!arg) continue;
        if (out[t.hook] && MERGE[t.hook]) out[t.hook] = MERGE[t.hook](out[t.hook], arg);
        else if (out[t.hook] === undefined) out[t.hook] = arg;
      }
      return out;
    },

    mergeHooks: function (base, extra) {
      var out = {}, k;
      for (k in (base || {})) out[k] = base[k];
      for (k in (extra || {})) {
        if (out[k] && MERGE[k] && typeof out[k] === 'object' && typeof extra[k] === 'object') {
          out[k] = MERGE[k](out[k], extra[k]);
        } else if (out[k] === undefined) {
          out[k] = extra[k];
        }
      }
      return out;
    },

    attach: function (state, rec) {
      if (!state) return null;
      state.traitHooks = this.hooksFor(rec);
      state.boons = this.mergeHooks(state.boons, state.traitHooks);
      return state.boons;
    },
    reapply: function (state) {
      if (!state || !state.traitHooks) return state && state.boons;
      state.boons = this.mergeHooks(state.boons, state.traitHooks);
      return state.boons;
    },

    //  허브·전투 배지 한 줄.
    summary: function (rec) {
      rec = recOf(rec);
      if (!rec || !rec.traits) return '';
      var all = allTalents(), parts = [];
      for (var i = 0; i < all.length; i++) {
        var r = rec.traits[all[i].key] || 0;
        if (r > 0) parts.push(all[i].name + ' ' + r);
      }
      return parts.join(' · ');
    },

    //  총 몇 점을 썼나(전 나무 합).
    spentAll: function (rec) {
      var n = 0;
      for (var i = 0; i < TREES.length; i++) n += spentIn(TREES[i].key, rec);
      return n;
    }
  };
  return api;
})();
