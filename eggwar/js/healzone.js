window.GAME = window.GAME || {};

// ============================================================================
//  치유 구역 (2026-08-01) — 물약을 대신한다
//
//  사용자 지시: "통곡의 탑을 플레이하다가 랜덤하게 중간에 치료 가능한 영역이
//  나타나고 그걸 먹으면 치유되게끔 설정. 치유영역이 뜰 확률은 1판에 0.5회 정도
//  나오게끔 랜덤으로. 이 확률과 동전이 더 잘 뜰 확률을 올리는 걸 행운이라는
//  능력치로 판매할 것."
//
//  물약 시스템을 없애면서(요청 7) 회복 수단이 통째로 사라지면 안 되므로, 그 자리를
//  **줍는 구역**이 대신한다. `js/orb.js` 와 같은 문법이다(적을 잡으면 확률로 떨어지고
//  지나가면 줍는다) — 플레이어가 새로 배울 것이 없다.
//
//  ⚠ **한 판에 하나만.** 상한이 없으면 회복이 물약보다 훨씬 후해져서 방어 난이도
//    곡선(4층 이상 무조작 0% 등)이 조용히 움직인다. 상한 1 + 낮은 처치당 확률로
//    "가끔 나온다" 정도만 유지한다 — orb.js 가 겪은 "바닥에 놓인 것도 세야 상한이
//    걸린다"는 사고를 그대로 피한다(`_pending` 과 같은 방식으로 합산한다).
//
//  ⚠ **통곡의 탑 전용이다.** `js/scenes/battle.js` 가 `state.towerHealOn` 을
//    탑 전투에서만 켠다 — 대전·수성의 탑은 이 기제가 아예 굴러가지 않는다.
// ============================================================================
GAME.HealZone = (function () {

  var MAX_PER_BATTLE = 1;
  // 층당 처치 10~20기 기준으로 "판당 평균 0.5회"에 수렴하도록 잡은 값.
  // 기대 드랍 횟수 ≈ 처치수 × BASE_CHANCE. 15기 기준 15×0.033 ≈ 0.5.
  var BASE_CHANCE = 0.033;
  // 주우면 최대 체력의 이 비율만큼 회복한다. 절대값이 아니라 비율인 이유는
  // 영웅마다·성장 단계마다 최대 체력이 크게 갈리기 때문이다(옛 물약은 절대값이라
  // 성장한 영웅에게는 갈수록 하찮아졌다).
  var HEAL_FRAC = 0.30;

  function luckMul() {
    if (!GAME.TowerChar || !GAME.TowerChar.exists()) return 1;
    return GAME.TowerChar.luckHealMul(GAME.TowerChar.get());
  }

  return {
    MAX_PER_BATTLE: MAX_PER_BATTLE, BASE_CHANCE: BASE_CHANCE, HEAL_FRAC: HEAL_FRAC,

    // 바닥에 놓인 것 + 이미 주운 것의 합. orb.js 의 `_pending` 과 같은 이유로 필요하다 —
    // 주운 것만 세면 아직 안 주운 사이에 상한이 안 걸린다.
    _pending: function (state) {
      return (state.healTaken || 0) + ((state.healZones && state.healZones.length) || 0);
    },

    // 적이 죽었을 때 부른다. 확률을 넘기면 치유 구역 하나를 바닥에 놓는다.
    maybeDrop: function (state, x, y) {
      if (!state || !state.healZones) return false;
      if (this._pending(state) >= MAX_PER_BATTLE) return false;
      if (Math.random() >= BASE_CHANCE * luckMul()) return false;
      state.healZones.push({ x: x, y: y, t: 0 });
      return true;
    },

    // 주웠다 — 그 자리에서 회복시킨다. 회복량(반올림)을 반환한다(토스트 문구용).
    take: function (state, hero) {
      if (!state || !hero || !hero.alive) return 0;
      state.healTaken = (state.healTaken || 0) + 1;
      var amount = Math.round((hero.maxHp || 0) * HEAL_FRAC);
      if (amount > 0 && GAME.Combat && GAME.Combat.heal) GAME.Combat.heal(hero, amount);
      return amount;
    },

    // ── 보스 층: **시간으로** 뿌린다 (2026-08-02 사용자 지시) ────────────────
    //  "차라리 보스전은 주기적으로 회복물약이나 구슬이 주변에 생성되었으면 좋겠어."
    //
    //  기존 드랍은 **처치 기반**이라 보스 층에서 거의 안 나온다 — 호위가 적고
    //  보스 하나를 오래 때리는 구조라, 판당 기대 0.5개가 사실상 0개가 된다.
    //  그래서 보스 층에서만 **주기적으로** 하나씩 놓는다. 근접 영웅이 붙어서
    //  싸우다 체력이 마르는 문제(사용자 신고: "가까이 가면 3방만에 죽음")의
    //  직접적인 답이기도 하다 — 회복이 **바닥에 놓이므로** 잠깐 떨어졌다
    //  돌아오는 리듬이 생긴다(그냥 자동 회복을 주면 그 리듬이 안 생긴다).
    BOSS_INTERVAL: 9000,     // 9초마다 하나
    BOSS_MAX: 6,             // 한 판 상한(무한히 깔리면 회복이 공짜가 된다)
    BOSS_FIRST: 4000,        // 첫 개는 조금 일찍

    //  ── 5초 뒤 사라진다 (2026-08-02 사용자 지시) ──────────────────────────────
    //  "보스전에서 나타나는 회복의샘이나 구슬은 잠시나왔다가 5초후에 사라지게
    //   만들어. 반짝이다가 사라지면돼"
    //  ⚠ 이게 난이도 축을 하나 더 만든다: 회복이 **거기 계속 있는 자원**이 아니라
    //    **지금 갈지 말지 고르는 선택**이 된다. 보스 앞에서 빠질 타이밍을 재는 게
    //    보스전의 리듬이 되라는 뜻이다. 일반 층 드랍(maybeDrop)은 수명을 안 준다 —
    //    거기서는 "지나가다 줍는" 물건이라 성격이 다르다.
    BOSS_TTL: 5000,
    BLINK_MS: 1600,          // 마지막 1.6초는 깜빡인다(사라진다는 예고)

    //  ── 구슬 종류 (2026-08-02 사용자 지시) ───────────────────────────────────
    //  "구슬중에는 10초간 공격력을 2배로 만들거나 다음 기본공격은 1,000%의
    //   데미지를 입히는 구슬도 넣어줘"
    //  보스전은 '오래 버티며 깎기'라 회복만 있으면 리듬이 한 가지뿐이다. 공격 구슬이
    //  들어가면 **위험을 무릅쓰고 주우러 갈 이유**가 생기고, 5초 수명과 맞물려
    //  "지금 저걸 먹으러 갈까"라는 판단이 매번 생긴다.
    KINDS: [
      { key: 'heal', w: 0.50, label: '회복의 샘',   color: 0x4fd07a },
      { key: 'rage', w: 0.30, label: '분노의 구슬', color: 0xff7a3c },
      { key: 'edge', w: 0.20, label: '벼려진 일격', color: 0xffd257 }
    ],
    RAGE_MS: 10000,          // 공격력 2배 지속
    RAGE_MUL: 2,
    EDGE_MUL: 10,            // 다음 평타 1,000%

    _rollKind: function () {
      var r = Math.random(), acc = 0;
      for (var i = 0; i < this.KINDS.length; i++) {
        acc += this.KINDS[i].w;
        if (r < acc) return this.KINDS[i].key;
      }
      return 'heal';
    },

    //  종류에 맞게 효과를 준다. 토스트에 띄울 문구를 반환한다(없으면 빈 문자열).
    applyKind: function (state, hero, kind) {
      if (!hero || !hero.alive) return '';
      if (kind === 'rage') {
        hero.buffs = hero.buffs || [];
        // 같은 것을 또 먹으면 겹쳐 쌓지 않고 시간을 새로 채운다 — 쌓기 시작하면
        // 4배·8배가 나와서 보스가 의미를 잃는다.
        for (var i = 0; i < hero.buffs.length; i++) {
          if (hero.buffs[i].rageTag) { hero.buffs[i].t = this.RAGE_MS; return '분노의 구슬 — 공격력 2배 10초!'; }
        }
        hero.buffs.push({ damageMul: this.RAGE_MUL, t: this.RAGE_MS, rageTag: true });
        return '분노의 구슬 — 공격력 2배 10초!';
      }
      if (kind === 'edge') {
        hero._nextHitMul = this.EDGE_MUL;
        return '벼려진 일격 — 다음 공격 1,000%!';
      }
      var amount = this.take(state, hero);
      return amount > 0 ? ('회복의 샘 — 체력 ' + amount + ' 회복!') : '';
    },

    //  `js/scenes/battle.js` 가 보스 층 전투에서 매 프레임 부른다.
    //  ⚠ 보스 층이 아니면 **아무 일도 하지 않는다** — 일반 층 곡선은 안 건드린다.
    tickBoss: function (state, dtMs, arena, bossUnit) {
      if (!state || !state.healZones || !state.bossHealOn) return false;
      if ((state.bossHealMade || 0) >= this.BOSS_MAX) return false;
      state.bossHealT = (state.bossHealT === undefined)
        ? this.BOSS_FIRST : state.bossHealT - dtMs;
      if (state.bossHealT > 0) return false;
      state.bossHealT = this.BOSS_INTERVAL;
      var A = arena || (GAME.CONFIG && GAME.CONFIG.ARENA);
      if (!A) return false;
      // 보스에게서 **떨어진 곳**에 놓는다 — 붙어 있는 채로 공짜 회복이 되면
      // "잠깐 빠졌다 돌아온다"는 리듬이 사라진다.
      var bx = bossUnit ? bossUnit.x : A.x + A.w / 2;
      var by = bossUnit ? bossUnit.y : A.y + A.h * 0.3;
      var pad = 60, x, y, tries = 0;
      do {
        x = A.x + pad + Math.random() * (A.w - pad * 2);
        y = A.y + A.h * 0.35 + Math.random() * (A.h * 0.6 - pad);
        tries++;
      } while (tries < 12 && ((x - bx) * (x - bx) + (y - by) * (y - by)) < 220 * 220);
      //  ⚠ 보스전 것만 `ttl`/`kind` 를 단다. 일반 층 드랍은 필드가 없으므로
      //    `_updateHealZones` 의 수명 처리가 통째로 안 걸린다(기존 곡선 불변).
      state.healZones.push({ x: x, y: y, t: 0, ttl: this.BOSS_TTL, kind: this._rollKind() });
      state.bossHealMade = (state.bossHealMade || 0) + 1;
      return true;
    }
  };
})();
