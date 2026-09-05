window.GAME = window.GAME || {};

// ============================================================================
//  특성 — **격자 특성판** (2026-09-05 전면 재설계 2차)
//
//  태현님: "특성시스템 너무 개성없고 설명만 길다. 아주 간단하게 공격력 5%증가
//   이런식으로 하면서 저번보내준 이미지 느낌으로 들어가게해야한다"
//   (참고 이미지: 세 갈래 색 패널 · 아이콘 격자 · 칸마다 n/max · 찍으면 금테 ·
//    위 칸에서 아래 칸으로 잇는 화살표 — WoW/구 롤 특성 화면)
//
//  ## ⚠ 앞선 판(v3.22)이 왜 틀렸나 — 되풀이 금지
//  그때는 "능력치·아이템으로 못 얻는 것만 준다"를 규율로 박아 두고 **전부 조건부
//  행동**으로 채웠다(처치하면 / 맞으면 / 체력이 낮으면). 그 결과 칸마다 두 줄짜리
//  문장이 붙어, 판이 **읽어야 하는 표**가 됐다. 특성판은 읽는 물건이 아니라
//  **보고 고르는 물건**이다 — 참고 이미지에는 설명이 한 글자도 없다.
//  → 지금은 **앞 두 줄이 단순 능력치**(공격력 +4% 같은 한 마디)이고, 조건부 행동은
//    **마지막 줄 하나**로 몰았다. 고르는 재미는 "무엇을 읽었나"가 아니라
//    "어느 나무를 얼마나 팠나"에서 나온다.
//
//  ## ⚠⚠ 특성 능력치는 **난이도 추종에 안 들어간다** — 이게 이 설계의 핵심이다
//  이 게임은 적을 내 성장에 맞춰 키운다(`Tower.atkIndex`/`ehpIndex` ← statBonus +
//  itemBonus). 특성 능력치를 그 두 지수에 넣으면 **공격력 +20% 를 찍는 순간 적 체력도
//  +20%** 가 되어 특성이 아무 느낌이 없다 — "개성 없다"의 가장 확실한 재발 경로다.
//  그래서 특성 보너스는 **전투에서만** 얹히고(`js/scenes/battle.js` 의 특성 블록)
//  두 지수는 특성을 **모른다.** 세계 포인트는 한 시즌에 스무 점 남짓이라 이 예외가
//  곡선을 흔들지 않는다(신선한 캐릭터 = 특성 0 = 기준선 그대로).
//
//  ## 붙는 자리(통합자)
//    battle.js    — `Traits.attach(state, tc)`(훅) + `Traits.statBonus(tc)`(능력치)
//    orb.js       — `Traits.reapply(state)`
//    towerchar.js — `luckGoldMul` 안에서 `goldFind`
//    combat.js    — execute·cap·revive 훅을 applyDamage 관문에서 읽는다
// ============================================================================
GAME.Traits = (function () {

  //  한 단 = 1 점. 계단 비용을 안 쓰는 이유: 줄 게이트가 이미 "얼마나 깊이 팔
  //  것인가"를 묻는다. 두 장치를 겹치면 읽기만 어려워진다.
  var COST = 1;

  //  줄 게이트 — 그 **나무에 쓴 누적 점수**가 이만큼이어야 그 줄이 열린다.
  //  참고 이미지의 "위에서부터 채워 내려간다"가 이것이다.
  var ROW_GATE = [0, 4, 8];

  //  ── 능력치 칸의 표기 규칙 ──────────────────────────────────────────────────
  //  `stat` 은 **단당 증가분**이다(1단 +4% → 3단 +12%). 화면은 `descAt(t, rank)` 가
  //  만드는 한 마디만 띄운다 — 데이터에 문장을 적어 두지 않는다(그게 길어지는 길이다).
  //  키 뜻: pct 는 퍼센트, 그 외는 절대값.
  //    damagePct 공격력 · atkspeedPct 공격속도 · crit 치명타 확률(%p)
  //    hpPct 최대 체력 · armorPct 방어력 · lifesteal 흡혈(%p)
  //    speedPct 이동속도 · cdrPct 스킬 쿨 감소
  var STAT_LABEL = {
    damagePct:   '공격력',
    atkspeedPct: '공격속도',
    crit:        '치명타',
    hpPct:       '최대 체력',
    armorPct:    '방어력',
    lifesteal:   '흡혈',
    speedPct:    '이동속도',
    cdrPct:      '스킬 쿨'
  };
  //  줄어드는 것이 좋은 축(표기를 '−' 로 뒤집는다).
  var STAT_LOWER = { cdrPct: true };

  //  ── 나무 셋 ────────────────────────────────────────────────────────────────
  //  talent: { key, row, col, name, icon, max, stat|hook, ranks?, req? }
  //    row  — 0·1·2 (ROW_GATE 와 짝)   col — 그 줄 안에서 왼쪽부터
  //    stat — 단당 증가분(단순 능력치 칸)   hook — 조건부 행동 칸(ranks 필요)
  //    req  — 1단 이상 찍혀 있어야 열리는 위 칸(화면이 세로 화살표로 잇는다)
  //  ⚠ 공용 한 벌이다(영웅별 아님). 영웅 5명 × 나무를 따로 적으면 읽을 것이 5배가 되고
  //    새 영웅마다 나무를 새로 지어야 한다. 참고 이미지의 특성판도 캐릭터별이 아니다.
  var TREES = [
    {
      key: 'attack', name: '공격', icon: '⚔', why: '몰아붙여 끝낸다',
      talents: [
        { key: 'a_edge',  row: 0, col: 0, name: '예리함', icon: '⚔', max: 5, stat: { damagePct: 4 } },
        { key: 'a_swift', row: 0, col: 1, name: '속사',   icon: '💨', max: 5, stat: { atkspeedPct: 4 } },
        { key: 'a_aim',   row: 0, col: 2, name: '정확',   icon: '🎯', max: 5, stat: { crit: 3 } },

        { key: 'a_over',  row: 1, col: 0, name: '과부하', icon: '💥', max: 3, hook: 'overload', req: 'a_edge',
          ranks: [{ mul: 1.4 }, { mul: 1.8 }, { mul: 2.3 }],
          desc: ['스킬 후 첫 평타 ×1.4', '스킬 후 첫 평타 ×1.8', '스킬 후 첫 평타 ×2.3'] },
        { key: 'a_rush',  row: 1, col: 1, name: '사냥의 열기', icon: '🔥', max: 3, hook: 'huntersRush', req: 'a_swift',
          ranks: [{ ms: 2000, speedMul: 1.15 }, { ms: 2600, speedMul: 1.30 }, { ms: 3200, speedMul: 1.45 }],
          desc: ['처치 시 2초 이동 ×1.15', '처치 시 2.6초 이동 ×1.30', '처치 시 3.2초 이동 ×1.45'] },
        { key: 'a_siphon', row: 1, col: 2, name: '흡수', icon: '🩸', max: 3, hook: 'siphon', req: 'a_aim',
          ranks: [{ frac: 0.05 }, { frac: 0.09 }, { frac: 0.14 }],
          desc: ['처치 시 체력 5% 회복', '처치 시 체력 9% 회복', '처치 시 체력 14% 회복'] },

        { key: 'a_exec',  row: 2, col: 1, name: '마무리', icon: '🗡', max: 1, hook: 'execute', req: 'a_over',
          ranks: [{ below: 0.25, mul: 1.6 }],
          desc: ['체력 25% 이하 적에게 ×1.6'] }
      ]
    },
    {
      key: 'defense', name: '방어', icon: '🛡', why: '버티고 되돌려준다',
      talents: [
        { key: 'd_hp',    row: 0, col: 0, name: '강골',   icon: '❤️', max: 5, stat: { hpPct: 4 } },
        { key: 'd_arm',   row: 0, col: 1, name: '단단함', icon: '🛡', max: 5, stat: { armorPct: 6 } },
        { key: 'd_leech', row: 0, col: 2, name: '갈증',   icon: '💧', max: 5, stat: { lifesteal: 1.5 } },

        //  ⚠ 이 칸이 "능력치로는 못 얻는 것"의 대표다 — 방어력은 **비율** 경감이라
        //    한 방이 큰 공격을 못 막는다. 상한은 그 축을 통째로 바꾼다.
        { key: 'd_cap',   row: 1, col: 0, name: '한 방 막기', icon: '🪨', max: 3, hook: 'cap', req: 'd_arm',
          ranks: [{ frac: 0.40 }, { frac: 0.32 }, { frac: 0.26 }],
          desc: ['한 방 피해 체력 40%까지', '한 방 피해 체력 32%까지', '한 방 피해 체력 26%까지'] },
        { key: 'd_phase', row: 1, col: 1, name: '스침', icon: '👣', max: 3, hook: 'phase', req: 'd_hp',
          ranks: [{ cut: 0.10 }, { cut: 0.16 }, { cut: 0.22 }],
          desc: ['이동 중 받는 피해 −10%', '이동 중 받는 피해 −16%', '이동 중 받는 피해 −22%'] },
        { key: 'd_rip',   row: 1, col: 2, name: '반격', icon: '⚡', max: 3, hook: 'riposte', req: 'd_leech',
          ranks: [{ cd: 1400, r: 84, dmgMul: 0.45 }, { cd: 1100, r: 92, dmgMul: 0.60 }, { cd: 900, r: 100, dmgMul: 0.75 }],
          desc: ['피격 시 충격파 · 1.4초', '피격 시 센 충격파 · 1.1초', '피격 시 강한 충격파 · 0.9초'] },

        { key: 'd_revive', row: 2, col: 1, name: '버티기', icon: '🕯', max: 1, hook: 'revive', req: 'd_cap',
          ranks: [{ healFrac: 0.30 }],
          desc: ['한 판 1회 버티고 30% 회복'] }
      ]
    },
    {
      key: 'utility', name: '유틸', icon: '✦', why: '더 빨리, 더 많이 모은다',
      talents: [
        { key: 'u_move', row: 0, col: 0, name: '신속', icon: '🥾', max: 5, stat: { speedPct: 4 } },
        { key: 'u_cool', row: 0, col: 1, name: '냉각', icon: '❄️', max: 5, stat: { cdrPct: 4 } },
        { key: 'u_gold', row: 0, col: 2, name: '전리품의 눈', icon: '💰', max: 5, hook: 'goldFind',
          ranks: [{ mul: 1.08 }, { mul: 1.16 }, { mul: 1.26 }, { mul: 1.36 }, { mul: 1.48 }],
          desc: ['골드 +8%', '골드 +16%', '골드 +26%', '골드 +36%', '골드 +48%'] },

        { key: 'u_haste', row: 1, col: 0, name: '재촉', icon: '🌪', max: 3, hook: 'haste', req: 'u_move',
          ranks: [{ speedMul: 1.04, cdrMul: 0.96 }, { speedMul: 1.07, cdrMul: 0.92 }, { speedMul: 1.10, cdrMul: 0.88 }],
          desc: ['이동 ×1.04 · 쿨 −4%', '이동 ×1.07 · 쿨 −8%', '이동 ×1.10 · 쿨 −12%'] },
        { key: 'u_echo', row: 1, col: 1, name: '메아리', icon: '🌀', max: 2, hook: 'echo', req: 'u_cool',
          ranks: [{ chance: 0.14 }, { chance: 0.24 }],
          desc: ['스킬 14% 확률로 한 번 더', '스킬 24% 확률로 한 번 더'] },
        { key: 'u_orb', row: 1, col: 2, name: '구슬 감각', icon: '🔮', max: 3, hook: 'orbFind', req: 'u_gold',
          ranks: [{ mul: 1.35 }, { mul: 1.7 }, { mul: 2.1 }],
          desc: ['구슬 확률 ×1.35', '구슬 확률 ×1.7', '구슬 확률 ×2.1'] },

        { key: 'u_prep', row: 2, col: 1, name: '준비된 자', icon: '📯', max: 1, hook: 'prep', req: 'u_echo',
          ranks: [{ on: 1 }],
          desc: ['시작할 때 모든 스킬 쿨 0'] }
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
    STAT_LABEL: STAT_LABEL,
    STAT_LOWER: STAT_LOWER,
    talents: allTalents,
    talent: talent,
    treeOf: treeOf,
    rankOf: rankOf,
    spentIn: spentIn,
    rowGate: function (row) { return ROW_GATE[row] === undefined ? 0 : ROW_GATE[row]; },

    //  ── 칸 한 마디 ────────────────────────────────────────────────────────────
    //  `rank` 단계에서 이 칸이 주는 것. 능력치 칸은 **누적값**을 만들어 준다
    //  (1단 +4% / 3단 +12%) — 단당 증가분을 그대로 보여주면 "지금 내가 얼마나
    //  받고 있나"를 사람이 암산해야 한다.
    //  rank 0 이면 1단을 찍으면 무엇이 되는지 보여준다(살지 말지 고르는 화면이므로).
    descAt: function (t, rank) {
      if (!t) return '';
      var r = rank > 0 ? Math.min(rank, t.max) : 1;
      if (t.stat) {
        var parts = [], k;
        for (k in t.stat) {
          var v = t.stat[k] * r;
          var sign = STAT_LOWER[k] ? '−' : '+';
          var unit = (k === 'crit' || k === 'lifesteal') ? '%p' : '%';
          //  소수점은 흡혈(1.5)에서만 생긴다 — 정수면 안 찍는다.
          var num = (Math.round(v * 10) % 10 === 0) ? String(Math.round(v)) : v.toFixed(1);
          parts.push((STAT_LABEL[k] || k) + ' ' + sign + num + unit);
        }
        return parts.join(' · ');
      }
      return (t.desc && t.desc[r - 1]) || '';
    },

    //  ── 능력치 합계 ───────────────────────────────────────────────────────────
    //  ⚠⚠ **`Tower.atkIndex`/`ehpIndex` 는 이 값을 절대 보면 안 된다** (파일 머리 참조).
    //     보는 순간 적이 같이 세져 특성이 아무 느낌이 없어진다.
    statBonus: function (rec) {
      rec = recOf(rec);
      var out = { damagePct: 0, atkspeedPct: 0, crit: 0, hpPct: 0,
                  armorPct: 0, lifesteal: 0, speedPct: 0, cdrPct: 0 };
      if (!rec || !rec.traits) return out;
      var all = allTalents();
      for (var i = 0; i < all.length; i++) {
        var t = all[i], r = rec.traits[t.key] || 0;
        if (r < 1 || !t.stat) continue;
        for (var k in t.stat) out[k] = (out[k] || 0) + t.stat[k] * Math.min(r, t.max);
      }
      return out;
    },

    //  이 칸을 지금 살 수 있는가 — 못 사면 **왜 못 사는지**를 같이 돌려준다.
    //  ⚠ 짧게. 격자 칸은 좁아 한 마디를 넘기면 안 된다.
    reasonFor: function (key, rec) {
      rec = recOf(rec);
      var t = talent(key);
      if (!t) return '없는 특성';
      if (!rec) return '캐릭터 없음';
      var cur = rankOf(key, rec);
      if (cur >= t.max) return '최대';
      var gate = this.rowGate(t.row);
      var have = spentIn(t.tree, rec);
      if (have < gate) return treeOf(t.tree).name + ' ' + (gate - have) + '점';
      if (t.req && rankOf(t.req, rec) < 1) {
        var rq = talent(t.req);
        return (rq ? rq.name : t.req) + ' 먼저';
      }
      var pts = (GAME.Season && GAME.Season.worldPoints) ? GAME.Season.worldPoints() : 0;
      if (pts < COST) return '포인트 부족';
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

    //  찍은 특성의 **훅**만 모은다(능력치 칸은 statBonus 쪽이라 건너뛴다).
    hooksFor: function (rec) {
      rec = recOf(rec);
      var out = {};
      if (!rec || !rec.traits) return out;
      var all = allTalents();
      for (var i = 0; i < all.length; i++) {
        var t = all[i], r = rec.traits[t.key] || 0;
        if (r < 1 || !t.hook || !t.ranks) continue;
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
