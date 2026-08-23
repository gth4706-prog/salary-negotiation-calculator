window.GAME = window.GAME || {};

// 전투 엔진. Phaser에도, 화면 투영(Iso)에도 의존하지 않는 순수 평면 로직.
// 여기서 나온 좌표를 렌더 단계에서만 기울여 그린다 → 회피 판정의 공정성이 보존된다.
GAME.Combat = {

  //  ── 시뮬 전용 난수 (록스텝 P2) ─────────────────────────────────────────────
  //  ⚠ 전역 Math.random 을 시드로 갈아끼우는 방식(회귀·감사 하네스)은 **렌더가
  //    난수열을 오염시킨다** — 두 클라이언트의 파티클 호출 횟수가 다르면 시뮬
  //    난수가 갈린다. 그래서 시뮬(combat)은 자기 rng 를 따로 갖는다.
  //    seedRng(방장이 배포한 시드)를 안 부르면 null → Math.random 으로 떨어져
  //    기존 모드·하네스는 한 비트도 안 바뀐다(하네스는 전역 스왑을 계속 쓴다).
  _rng: null,
  seedRng: function (seed) {
    var s = seed | 0;
    this._rng = function () {
      s = s + 0x6D2B79F5 | 0;
      var t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  },
  clearRng: function () { this._rng = null; },
  rand: function () { return this._rng ? this._rng() : Math.random(); },

  createState: function () {
    //  PACE 는 **통곡의 탑 전투에서만** 켠다(battle.js·sim 이 상태 생성 직후 세운다).
    //  기본 false — 수성·대전·실시간은 기존 속도 그대로다(수성 무배치 곡선 실측으로
    //  확인: 전역 적용 시 SC-4 가 4층 33%·6층 50% 로 무너졌다).
    GAME.Combat.paceOn = false;
    return {
      units: [], projectiles: [], effects: [], traps: [],
      // 구슬(js/orb.js) — 적을 잡으면 확률로 떨어진다. 씬이 그리고 줍는다.
      orbs: [], orbTaken: [],
      // 치유 구역(js/healzone.js) — 물약을 대신한다. `towerHealOn` 은 통곡의 탑
      // 전투에서만 battle.js 가 켠다(대전·수성의 탑은 이 기제가 안 돈다).
      healZones: [], healTaken: 0, towerHealOn: false,
      //  잉걸불 구역(불씨꾼) — 땅에 남아 시간이 지나며 사라진다.
      //  ⚠ 갱신은 **여기(Combat.update)** 에서 돈다. 치유 구역은 battle.js 가 갱신해서
      //    헤드리스(sim·회귀·곡선 도구)에서는 아예 안 돈다 — 회복이면 몰라도
      //    **피해 기제가 측정 도구에 안 보이면 밸런스 숫자가 통째로 거짓말**이 된다.
      //    battle.js 는 그리기만 한다.
      emberZones: [],
      numbers: [],          // 떠오르는 피해 숫자 (렌더 전용 데이터)
      elapsed: 0, over: false, winner: null,
      // 전략가가 영웅에게 마지막으로 피해를 준 뒤 흐른 시간 → 교착 압박 계산에 쓴다
      noHitFor: 0,

      // ── 교전 개시 신호 ────────────────────────────────────────────────
      // false 인 동안 전략가 유닛은 **자기 자리에서 대기(휴식)** 한다. 진형을 짜 두고
      // 영웅이 오기를 기다리는 것이 배치의 의미이므로, 첫 접촉 전에 마중 나가지 않는다.
      //
      // 다음 둘 중 하나면 true 로 뒤집히고, 그 뒤로는 **노는 유닛이 없다**:
      //   · 어느 쪽이든 첫 피해가 발생했다 (applyDamage)
      //   · 영웅이 어떤 전략가 유닛의 반응 범위(def.aggro) 안에 들어왔다 (updateStance)
      // 뒤집힌 뒤에는 지루함 타이머(boredomOf)를 기다리지 않고 즉시 교전 태세가 된다.
      // ⚠ 교전 태세 = '사거리 안이면 쏘고, 아니면 자기 chase 반경 안에서만 움직인다'.
      //   chase 는 늘리지 않는다 — 늘리면 진형이 통째로 돌격해 영웅이 6초에 녹는다.
      engaged: false,
      engagedAt: null,       // 뒤집힌 시각(ms). 계측용.
      // 학습형 AI: 배치도의 적응값 + 이번 판 관측치
      adapt: null,
      telemetry: {
        medicHealed: 0, guardBlocked: 0, rangedDiedInMelee: 0, heroXSamples: [],
        // 진형이 영웅에게 닿지도 못했는가 (제자리에서 왕복하는 문제를 감지하는 신호)
        strategistUnits: 0, engagedUnits: 0, heroDamageTaken: 0,
        //  ── 학습 관측 (2026-08-08) ────────────────────────────────────────
        //  "원거리에게 맞기만 하고 한 대도 못 때렸다"를 다음 판에 쓰려면 **두 값을
        //  따로 재야** 한다. 지금까지는 맞은 총량만 있어 무엇에게 맞았는지 몰랐다.
        heroDmgFromRanged: 0, heroDmgToRanged: 0,
        //  '구역'에게 맞은 양 — 잉걸불·가시 오라·사망 폭발·가시덫처럼 **자리를 잡고
        //  기다리는** 피해다. 이게 크다는 건 영웅이 자리를 못 고르고 있다는 뜻이다.
        heroDmgFromZone: 0,
        //  진형이 되돌린 양(회복 + 보호막) vs 영웅이 넣은 양. 둘을 견줘야 "때린 게
        //  되돌려지고 있다"를 알 수 있다 — 회복량만으로는 많고 적음을 판단 못 한다.
        strategistHealed: 0, heroDamageDealt: 0,
        // 플레이어 성향 관측 (GAME.Profile 이 읽는다)
        heroDistSamples: [], projectilesAtHero: 0, projectilesHitHero: 0
      }
    };
  },

  // 거리성 스탯에 WORLD_SCALE 을 곱한다.
  // 세로 화면은 전장이 좁아서(면적 46%) 원래 값을 그대로 쓰면 사거리 하나가
  // 맵 전체를 덮는다. 여기서 한 번에 환산해 상대 기하를 보존한다.
  // hp/damage/cooldown 같은 비거리 스탯은 건드리지 않는다.
  DIST_KEYS: ['range', 'speed', 'chase', 'aggro', 'healRadius', 'buffRadius',
              'intercept', 'triggerRadius', 'blastRadius', 'aoeRadius',
              'projectileSpeed', 'bulletSpeed',
              // 원거리 유닛끼리 유지하는 최소 간격. 거리 단위이므로 여기 반드시 넣는다 —
              // 빠뜨리면 폰 프로필(WORLD_SCALE 0.556)에서만 조용히 어긋난다.
              'spacing', 'protectGap',
              // 달려들며 치기 밀어내기. 거리 단위라 여기 반드시 넣는다.
              'chargeKnock', 'trampleKnock', 'auraRadius'],

  scaleDef: function (def) {
    var K = GAME.CONFIG.WORLD_SCALE;
    if (!K || K === 1) return def;
    var out = {};
    for (var k in def) out[k] = def[k];
    for (var i = 0; i < this.DIST_KEYS.length; i++) {
      var key = this.DIST_KEYS[i];
      if (typeof out[key] === 'number' && out[key] > 0) out[key] = out[key] * K;
    }
    // 유닛 크기는 덜 줄인다 — 폰에서 너무 작아지면 뭘 상대하는지 안 보인다
    if (typeof out.radius === 'number') out.radius = Math.max(6, out.radius * Math.sqrt(K));
    // 능력(ability)은 **중첩 객체**라 위 루프가 못 건드린다. 거리 키를 따로 환산하지 않으면
    // 폰 프로필(WORLD_SCALE 0.556)에서만 보스 돌진이 맵을 가로지른다 — 조용히 깨지는 유형.
    var AK = ['dist', 'radius', 'minRange', 'maxRange', 'knockback', 'spread'];
    function scaleAbil(src) {
      var ab = {}, kk;
      for (kk in src) ab[kk] = src[kk];
      for (var ai = 0; ai < AK.length; ai++) {
        if (typeof ab[AK[ai]] === 'number' && ab[AK[ai]] > 0) ab[AK[ai]] *= K;
      }
      return ab;
    }
    if (out.ability) out.ability = scaleAbil(out.ability);
    // ⚠ 복수 스킬(`abilities`)도 **똑같이** 환산해야 한다. 빠뜨리면 폰 프로필
    //   (WORLD_SCALE 0.556)에서만 알 보스의 예고 반경이 안 줄어 조용히 어긋난다.
    if (out.abilities && out.abilities.length) {
      var arr = [];
      for (var bi = 0; bi < out.abilities.length; bi++) arr.push(scaleAbil(out.abilities[bi]));
      out.abilities = arr;
    }
    return out;
  },

  // mods — 난이도 단계(escalation)·층 조건에 따른 능력 배수.
  //
  // ⚠ 예전에는 `{ hp, damage }` 두 개만 먹었다. 통곡의 탑 **층 조건**(towerrule.js)이
  //   "장갑을 두르고 대신 무르다", "빠르지만 약하다" 같은 축을 쓰려면 더 필요해서
  //   **표로 일반화**했다. 여기 없는 키를 mods 에 넣으면 조용히 무시된다 —
  //   새 축을 쓰려면 `MOD_KEYS` 에 먼저 넣을 것(안 그러면 "조건이 안 먹는다"로 나타난다).
  //
  // ⚠ `speed`·`range` 는 **거리성 스탯이라 `scaleDef` 가 WORLD_SCALE 을 곱한다.** 순서가
  //   중요하다 — 배수를 먼저 곱하고 그다음 scaleDef 를 통과시켜야 세로 화면에서도 맞는다.
  //   (거꾸로 하면 폰에서만 조건이 세게 먹는다.)
  MOD_KEYS: ['hp', 'damage', 'armor', 'speed', 'range', 'cooldown'],

  createUnit: function (typeKey, x, y, side, mods) {
    var base = GAME.UNITS[typeKey];
    var def = base;
    if (mods) {
      var touched = false, i, k;
      for (i = 0; i < this.MOD_KEYS.length; i++) {
        k = this.MOD_KEYS[i];
        if (mods[k] !== undefined && mods[k] !== 1) { touched = true; break; }
      }
      if (touched) {
        def = {};
        for (k in base) def[k] = base[k];
        for (i = 0; i < this.MOD_KEYS.length; i++) {
          k = this.MOD_KEYS[i];
          var m = mods[k];
          if (m === undefined || m === 1 || typeof base[k] !== 'number') continue;
          // hp·damage 는 정수로 둔다(체력바·피해 숫자가 소수로 보이면 지저분하다).
          def[k] = (k === 'hp' || k === 'damage') ? Math.round(base[k] * m) : base[k] * m;
        }
      }
    }
    var u = this._baseUnit(this.scaleDef(def), x, y, side, typeKey);
    //  ── 상시 오라 (2026-08-08 · 울짱꾼) ──────────────────────────────────────
    //  ⚠ 이 등록이 지금까지 **`createHero` 안에만 있었다** — 유닛에는 경로 자체가
    //    없어서 def 에 `auraDps` 를 적어도 조용히 아무 일도 안 일어났다(실측으로 잡음).
    //    이 폴더가 이미 겪은 "등록 0개인데 에러도 없어서 되고 있다고 착각했다"와
    //    같은 계열이다 — 그래서 감사가 **오라 개수부터** 센다.
    //  ⚠ `moveOnly` 는 파수꾼(영웅) 때문에 생긴 조건이라 기본값을 유지하고,
    //    `auraAlways` 를 적은 def 만 상시로 돈다(고정물은 안 움직여서 안 걸린다).
    if (u.def.auraDps) {
      u.auras.push({ radius: u.def.auraRadius, dps: u.def.auraDps, t: Infinity, tick: 0,
                     tickMs: 500, noLs: true, noNumber: true, passive: true,
                     moveOnly: !u.def.auraAlways });
    }
    return u;
  },

  // 영웅 = 아이템 보정을 반영한 합성 def를 가진 특수 유닛
  createHero: function (heroKey, x, y, side, chosenItems, skillPicks) {
    var h = GAME.HEROES[heroKey];
    var st = GAME.Items.applyTo(h, chosenItems || {});

    var def = {
      key: heroKey,
      name: h.name,
      hp: st.hp,
      armor: st.armor,
      damage: st.damage,
      speed: st.speed,
      range: h.range,
      cooldown: h.cooldown,
      attack: h.attack,
      coneDeg: h.coneDeg,
      projectileSpeed: h.projectileSpeed,
      projectileRadius: h.projectileRadius,
      radius: h.radius,
      shape: h.shape,
      // ⚠ 렌더 전용. 이게 빠져 있던 동안 전투의 영웅은 `UI.LEGACY_ART[shape]` 폴백으로
      //   **일반 유닛 아트**(광전사→전사·사냥꾼→궁수·파수꾼→투창병)로 그려지고 있었다
      //   (2026-08-20 실측: 파수꾼 그리기 76회가 전부 javelin 분기, hookShield 0회).
      //   로비·카드 화면은 HEROES def 를 직접 써서 멀쩡했다 — 전투만 조용히 달랐다.
      art: h.art,
      lifesteal: st.lifesteal,
      // 달려들며 치기 — 영웅 def 는 화이트리스트라 여기 안 적으면 조용히 사라진다.
      chargeKnock: h.chargeKnock, chargeDamageMul: h.chargeDamageMul,
      trampleKnock: h.trampleKnock, auraDps: h.auraDps, auraRadius: h.auraRadius,
      cost: GAME.HERO_BASE_COST
    };

    var u = this._baseUnit(this.scaleDef(def), x, y, side, heroKey);
    u.isHero = true;
    //  ⚠⚠ 영웅은 목줄이 없다 (2026-08-21 실사용 신고 "위쪽 구석으로 못 간다"의 진범).
    //  P1(2026-08-19)이 실시간 대칭 전장을 위해 `_baseUnit` 의 leash 진영 조건을
    //  없애면서 영웅에게도 leash 가 붙었고, update 말미의 전 유닛 clampToLeash 가
    //  **매 프레임 출발점 쪽으로 되끌었다** — 목줄 반경 경계에서 이동 속도와 정확히
    //  상쇄되어 "그 선을 넘어 못 걷는" 보이지 않는 원이 생겼다(내 재현 x=714 정지의
    //  실체 — 전장 경계로 오진했었다). clampToLeash 첫 줄이 Infinity 를 면제한다.
    u.leash = Infinity;
    u.hero = h;
    // QWER 슬롯마다 고른 선택지로 실제 스킬 세트를 구성한다
    u.skills = GAME.buildSkills(heroKey, skillPicks || GAME.defaultSkillPicks());
    u.cdrMul = st.cdrMul;
    u.potionHeal = st.potionHeal;
    u.potionCharges = st.potionCharges;
    u.skillCd = { Q: 0, W: 0, E: 0, R: 0 };
    u.shield = 0;
    u.buffs = [];
    u.auras = [];
    // ⚠ **반드시 이 `u.auras = []` 뒤에 와야 한다.** 위(=_baseUnit 직후)에 넣었더니
    //   여기서 통째로 덮여 조용히 사라졌다 — 등록 0개인데 에러도 없어서, 실제로
    //   시뮬을 돌려 틱 수를 세보기 전까지 '되고 있다'고 착각했다.
    // 상시 오라는 **기존 auras 틱을 그대로 쓴다**(새 판정 루프를 만들면 스킬 오라와
    //   규칙이 갈라져 조용히 어긋난다). t: Infinity 라 splice 로 사라지지 않는다.
    if (u.def.auraDps) {
      //  ⚠ `moveOnly` 는 파수꾼(영웅) 때문에 생긴 조건이다 — 상시로 두면 **AI 공격
      //    영웅이 공짜로 받아** SC-3 편차가 27%p 가 됐다(위 주석). 그런데 그 위험은
      //    **오라를 가진 쪽이 영웅일 때**의 것이다. 전략가가 세우는 고정물(울짱꾼)은
      //    반대 방향이라 같은 조건을 걸면 **한 번도 안 발동한다**(안 움직이니까).
      //    그래서 `auraAlways` opt-in 을 둔다 — 안 적은 기존 def 는 그대로 moveOnly 다.
      u.auras.push({ radius: u.def.auraRadius, dps: u.def.auraDps, t: Infinity, tick: 0,
                     tickMs: 500, noLs: true, noNumber: true, passive: true,
                     moveOnly: !u.def.auraAlways });
    }
    return u;
  },

  _baseUnit: function (def, x, y, side, typeKey) {
    return {
      type: typeKey,
      def: def,
      side: side,
      x: x,
      y: y,
      home: { x: x, y: y },
      // 전략가 유닛은 적이 가까우면 배치를 깨고 쫓아나가되, chase 반경을 넘으면 자리로 돌아온다.
      // 무한 돌격을 막아 '배치'가 여전히 의미를 갖게 하는 장치.
      //  ⚠ 진영 조건을 뗐다(2026-08-19 실시간 대전 P1) — 예전엔 컨트롤러 진영에
      //    유닛이 없어서 side 로 걸러도 같았지만, 같은 전장 실시간은 **양쪽 다
      //    진형을 세운다.** 유닛이면 진영과 무관하게 배치 리시를 갖는다(무한 돌격
      //    금지는 이 게임의 진형 약속이다). 영웅의 Infinity 는 createHero 가 담당한다.
      leash: (def.chase || GAME.CONFIG.LEASH),
      stance: 'hold',        // hold | chase | return
      // 한 번 추격을 결심했는가. 서면 복귀·리시를 적용하지 않는다(끝까지 쫓는다).
      committed: false,
      restFor: 0,            // 복귀 직후 잠시 대기 (즉시 재출격 = 진동 방지)
      // 호위 역할 — 'ranged' | 'melee' | null.
      // 값이 있으면 그 부류의 아군 쪽에 붙어 선다(누구를 지킬지 판단하는 자리).
      // **지금은 학습과 연결돼 있지 않다.** 나중에 js/learn.js 가 이 값을 직접 써넣으면
      // (u.protectRole = 'ranged') 그 판부터 바로 반영된다 — 토대만 깔아둔 것이다.
      protectRole: def.protectRole || null,
      // 시선 잠금 — 이번 프레임에 공격으로 시선을 정했으면 이동이 덮어쓰지 못한다.
      faceLock: 0,
      everEngaged: false,    // 이 유닛이 한 번이라도 적을 때렸는가 (학습 신호)
      //  PACE.HP — 판의 호흡(config.js). **유닛만** 줄인다(영웅 제외 — 근거는 config).
      //  ⚠ 보스는 체력 반감에서 **제외** — 보스 격파시간은 boss-invariance 가
      //    지수(POWER_POW_BOSS=1.0)로 상수로 맞춰 둔 값이라, 반 토막 내면 보스층이
      //    이웃 일반층보다 쉬워진다(rep=96 실측: 10층 53% vs 11층 20%, R-3 붕괴).
      hp: Math.max(1, Math.round(def.hp * (!GAME.Combat.paceOn || def.isBoss || (GAME.HEROES && GAME.HEROES[typeKey]) ? 1 : GAME.CONFIG.PACE.HP))),
      maxHp: Math.max(1, Math.round(def.hp * (!GAME.Combat.paceOn || def.isBoss || (GAME.HEROES && GAME.HEROES[typeKey]) ? 1 : GAME.CONFIG.PACE.HP))),
      cd: GAME.Combat.rand() * 250,
      alive: true,
      order: null,
      manual: false,
      facing: side === 'strategist' ? Math.PI / 2 : -Math.PI / 2,
      flash: 0,
      rootedFor: 0,
      isHero: false,
      shield: 0,
      // 지난 프레임이 끝난 시점의 위치. '달려들며 친 타격'(chargeKnock) 판정에만 쓴다.
      // 매 프레임 끝에서 갱신하므로 fire() 시점의 차이 = 이번 프레임에 걸어온 거리다.
      _px: x, _py: y,
      buffs: [],
      auras: []
    };
  },

  // ── 파생 스탯 ────────────────────────────────────────────────
  effArmor: function (u) {
    var a = u.def.armor || 0;
    for (var i = 0; i < u.buffs.length; i++) if (u.buffs[i].armorAdd) a += u.buffs[i].armorAdd;
    //  방패 내구도 — 맞은 만큼 영구히 깎인다(applyDamage 가 누적).
    if (u._shieldWear) a = Math.max(0, a - u._shieldWear);
    //  ── 최후 저항 (2026-08-08, 사용자 신고) ────────────────────────────────
    //  "항상 방패병만 마지막에 남고 남은 20초 동안 방패병만 때리다가 끝나는 게 지루하다."
    //  구조적인 결과다: AI 도 사람도 **체력 낮은 적부터** 지우므로, 방어 45·체력 큰
    //  방패병이 반드시 마지막에 남는다. 거기서부터는 사건이 없고 씹는 시간만 남는다.
    //  → 마지막 한둘이 되면 **방어가 무너진다.** 진형이라는 게 서로 받쳐 주는 것이라,
    //    받쳐 줄 동료가 없으면 두꺼움이 유지될 이유도 없다(연출과 규칙이 같은 말을 한다).
    //  ⚠ 체력이 아니라 **방어만** 깎는다. 체력을 깎으면 화면의 체력바가 갑자기 줄어
    //    "버그"로 읽힌다 — 방어는 눈에 안 보이는 값이라 그런 일이 없다.
    if (u._lastStand) a *= this.LAST_STAND.armorMul;
    return a;
  },

  //  ⚠ 값은 아래 두 도구로 재고 정했다: `regress.js`(탑) · `defend-curve.js`(수성의 탑).
  //    양쪽 다 흔들면 안 되는 값이라 눈으로 고치지 말 것.
  LAST_STAND: { at: 2, afterMs: 20000, armorMul: 0.55, dmgMul: 1.25 },

  effSpeed: function (u) {
    if (u.def.immobile) return 0;
    var s = u.def.speed;
    for (var i = 0; i < u.buffs.length; i++) if (u.buffs[i].speedMul) s *= u.buffs[i].speedMul;
    return s;
  },

  // 분대장이 주변에 있으면 공격력이 올라간다. 영웅은 자기 버프(전투 각성)를 받는다.
  effDamage: function (u, state) {
    var d = u.def.damage;
    //  최후 저항 — 마지막 한둘은 더 세게 친다. 방어만 깎으면 '약해져서 빨리 죽는다'가
    //  되어 김이 빠진다. 서로 빨리 결판나야 **사건**이 된다.
    if (u._lastStand) d *= this.LAST_STAND.dmgMul;
    for (var b = 0; b < u.buffs.length; b++) {
      if (u.buffs[b].damageMul) d *= u.buffs[b].damageMul;
    }
    if (!state) return d;
    for (var i = 0; i < state.units.length; i++) {
      var o = state.units[i];
      if (!o.alive || o.side !== u.side || o === u) continue;
      if (!o.def.buffRadius) continue;
      if (this.dist(u, o) <= o.def.buffRadius) d *= o.def.buffDamageMul;
    }
    return d;
  },

  // ── 방어 태세 주기 (2026-08-03) ──────────────────────────────────────────────
  //  `def.guard = { every, warn, ms, cut, reflect }`
  //    every  다음 태세까지 간격(ms)      warn  들어가기 전 예고(ms)
  //    ms     태세 지속(ms)               cut   태세 중 받는 피해 배수
  //    reflect 때린 피해의 이 비율만큼 **내가** 맞는다
  //
  //  ⚠ **예고(warn)가 없으면 이 기제는 함정이 된다.** 갑자기 반사가 켜지면
  //    "내가 뭘 잘못했는지 모른 채 죽는" 경험이 된다. 이 저장소가 이미 같은
  //    교훈을 적어 뒀다(용의 알 껍질 깨기: "큰 피해 자체가 문제가 아니라
  //    '못 피하는' 것이 문제다"). 그래서 태세도 **미리 보이고** 시작한다.
  tickGuard: function (u, dtMs) {
    var g = u && u.alive && u.def && u.def.guard;
    if (!g) return;
    if (u._guardT === undefined) {
      u._guardT = (g.first === undefined ? g.every : g.first);
      u._guardPhase = 'idle';
      u._guardOn = false;
    }
    u._guardT -= dtMs;
    if (u._guardT > 0) return;
    if (u._guardPhase === 'idle') {              // 예고 시작
      u._guardPhase = 'warn';
      u._guardT = (g.warn === undefined ? 900 : g.warn);
      u._guardOn = false;
    } else if (u._guardPhase === 'warn') {       // 태세 돌입
      u._guardPhase = 'on';
      u._guardT = (g.ms === undefined ? 5000 : g.ms);
      u._guardOn = true;
    } else {                                     // 태세 해제
      u._guardPhase = 'idle';
      u._guardT = g.every;
      u._guardOn = false;
    }
  },

  // ── 보스는 밀리지 않는다 (2026-08-02 사용자 지시) ────────────────────────────
  //  "보스몹은 이동이나 밀리지않게해줘"
  //  밀치기·끌어당기기가 보스에게 걸리면 두 가지가 무너진다:
  //   ① 보스가 자기 자리를 못 지켜서 예고 원(telegraph)과 실제 위치가 어긋난다 —
  //      피할 수 있게 설계한 스킬이 안 피해지거나, 반대로 거저 피해진다.
  //   ② 밀치기로 벽에 몰아 놓고 때리는 것이 모든 보스의 정답이 된다.
  //  ⚠ **자리 옮김이 일어나는 곳은 전부 이 함수를 거쳐야 한다.** 직접 `o.x +=` 를
  //    쓰면 그 경로만 조용히 예외가 된다(예전에 `abilities` 를 빠뜨려 스킬이 0번
  //    발동한 전례가 있다 — 같은 종류의 실수다).
  isAnchored: function (u) {
    return !!(u && u.def && u.def.isBoss);
  },
  //  상대 이동. 보스면 아무 일도 안 하고 false 를 돌려준다.
  displace: function (u, dx, dy) {
    if (this.isAnchored(u)) return false;
    u.x += dx; u.y += dy;
    return true;
  },
  //  절대 위치 이동(끌어당기기처럼 목표 지점이 정해진 경우).
  displaceTo: function (u, x, y) {
    if (this.isAnchored(u)) return false;
    u.x = x; u.y = y;
    return true;
  },

  dist: function (a, b) {
    var dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  },

  // ── 달려들며 치기 (2026-07-29) ──────────────────────────────────────────────
  // "이번 프레임에 **움직이면서** 휘둘렀는가."
  //
  // 왜 이 판정이 조작 깊이를 만드는가: `runAI` 는 사거리에 들어오면 그 자리에 서서
  // 친다(`if (d <= def.range) { fire; return; }`) — 즉 **AI 는 이동과 공격을 같은
  // 프레임에 못 한다.** 반면 플레이어 조작(`input.js` 방향키 · `touchpad.js` 스틱)은
  // 걷는 도중에 직접 `fire()` 를 부른다. 그래서 이 조건은 특별 취급 없이도
  // "손으로 몰고 있는 영웅"에게만 성립한다.
  //   → 무조작 기준선(AIHero skill 0)은 **구조적으로 이 보너스를 못 받는다.**
  //     "4층부터 조작 없이는 진다"는 약속이 이 변경으로 흔들릴 수 없는 이유다.
  //
  // 문턱은 프레임률과 무관해야 한다. 한 프레임 이동량은 `effSpeed * dt` 이므로
  // 그 40%(=속도 × 0.006초)를 기준으로 잡으면 30~144fps 어디서나 같은 판정이 된다.
  // 거리와 속도 둘 다 WORLD_SCALE 로 함께 줄어들어 비율은 프로필에 불변이다.
  isCharging: function (u) {
    if (u._px === undefined) return false;
    var dx = u.x - u._px, dy = u.y - u._py;
    return (dx * dx + dy * dy) > (function(v){return v*v;})(this.effSpeed(u) * 0.006);
  },

  // 지뢰는 '전투원'이 아니라 지형 위험물이다. 쏘는 게 아니라 피하는 것이므로
  // 조준 대상에서 빼고, 승패 판정(전멸 조건)에서도 세지 않는다.
  // 세지 않으면 지뢰를 못 없애서 이길 수 없는 상황이 생기기 때문.
  isHazard: function (u) {
    return !!u.def.isMine;
  },

  aliveCount: function (state, side) {
    var n = 0;
    for (var i = 0; i < state.units.length; i++) {
      var u = state.units[i];
      //  noCount(알지키기 황금알): 승패 머릿수에서 뺀다 — 영웅이 죽으면 알이
      //  살아 있어도 져야 한다("영웅 사망 = 패배" 약속).
      if (u.alive && u.side === side && !this.isHazard(u) && !(u.def && u.def.noCount)) n++;
    }
    return n;
  },

  nearestEnemy: function (unit, units) {
    var best = null, bestD = Infinity;
    for (var i = 0; i < units.length; i++) {
      var o = units[i];
      if (!o.alive || o.side === unit.side || this.isHazard(o)) continue;
      var d = this.dist(unit, o);
      if (d < bestD) { bestD = d; best = o; }
    }
    return best;
  },

  unitAt: function (state, x, y, side) {
    for (var i = 0; i < state.units.length; i++) {
      var u = state.units[i];
      if (!u.alive || this.isHazard(u)) continue;
      if (side && u.side !== side) continue;
      var dx = u.x - x, dy = u.y - y;
      if (Math.sqrt(dx * dx + dy * dy) <= u.def.radius + 6) return u;
    }
    return null;
  },

  // ── 피해 / 회복 ──────────────────────────────────────────────
  // opts: { noCrit: true } 면 크리티컬 판정을 건너뛴다(지속피해 등)
  //  ── 전장 연출 이벤트 (2026-08-22 태현님) — 판정·기록만, 그리기는 battle.js ──
  //  ev: 'spot'(영웅에게 첫 공격 개시 — 빨간 느낌표+대사) · 'skill'(스킬 시전) ·
  //      'death'(전사) · 'giveup'(영웅 추격 포기). 난수 없음 — 록스텝 안전.
  _banterEv: function (state, u, ev) {
    (state.banterEv || (state.banterEv = [])).push({ u: u, ev: ev });
  },

  applyDamage: function (unit, dmg, source, state, opts) {
    if (!unit.alive) return 0;
    //  PACE.DMG — 피해의 단일 관문(config.js). **유닛이 내는 피해만** 배속한다
    //  (영웅 제외 — 영웅은 유닛 체력이 절반이라 이미 두 배 빨리 잡는다). 파생
    //  피해(매듭 분배·반사)는 이미 배율이 실린 값이라 noPace 로 이중 적용을 막는다.
    if (GAME.Combat.paceOn && !(opts && opts.noPace)) {
      dmg *= (source && source.isHero) ? GAME.CONFIG.PACE.HERO_DMG : GAME.CONFIG.PACE.DMG;
    }
    // 지뢰는 피해로 제거할 수 없다. 밟아서 터뜨리거나, 피해서 지나가는 수밖에.
    if (this.isHazard(unit)) return 0;

    //  ── 매듭 (2026-08-08 · 매듭지기) ──────────────────────────────────────
    //  묶인 아군끼리 피해를 **나눠 진다.** 한 기만 집중해서 끊는 전술이 안 통하고,
    //  답은 광역으로 동시에 치는 것이 된다.
    //  ⚠ `noKnot` 로 재귀를 끊는다. 안 끊으면 나눈 피해가 다시 나뉘어 무한히 퍼진다.
    //  ⚠ 총량은 안 늘린다 — 나누기만 한다. 늘리면 매듭지기가 있는 진형이 오히려
    //    더 빨리 녹아 정체성이 뒤집힌다.
    if (state && !(opts && opts.noKnot) && dmg > 0) {
      var _kn = null;
      for (var _ki = 0; _ki < state.units.length; _ki++) {
        var _kc = state.units[_ki];
        if (!_kc.alive || _kc.side !== unit.side || !_kc.def.knotRadius) continue;
        if (this.dist(_kc, unit) > _kc.def.knotRadius) continue;
        _kn = _kc; break;
      }
      if (_kn) {
        var _link = [];
        for (var _kj = 0; _kj < state.units.length; _kj++) {
          var _kt = state.units[_kj];
          if (!_kt.alive || _kt.side !== unit.side || _kt === unit) continue;
          if (this.isHazard(_kt)) continue;
          if (this.dist(_kn, _kt) <= _kn.def.knotRadius) _link.push(_kt);
        }
        var _cap = (_kn.def.knotMax || 3);
        if (_link.length > _cap) _link.length = _cap;
        if (_link.length) {
          var _share = (_kn.def.knotShare || 0.5);
          var _each = (dmg * _share) / _link.length;
          for (var _kk = 0; _kk < _link.length; _kk++) {
            this.applyDamage(_link[_kk], _each, source, state,
                             { noCrit: true, noKnot: true, noLs: true, noPace: true });
          }
          dmg = dmg * (1 - _share);
        }
      }
    }

    // ── 축복 훅 — 영웅이 **때릴 때** (towerboon.js) ────────────────────────
    //  ⚠ `source.isHero` 검사가 핵심이다. 빼면 축복이 적까지 강화한다.
    var bh = state && state.boons;
    if (bh && source && source.isHero) {
      // 배수진 — 체력이 낮을수록 위험을 유지할 값어치가 생긴다
      if (bh.lastStand && source.maxHp &&
          source.hp / source.maxHp <= (bh.lastStand.below || 0.35)) {
        dmg *= bh.lastStand.dmgMul || 1.4;
      }
      // 과부하 — 스킬 뒤 **한 방만**. 쓰면 표시를 지운다(난사하면 값을 못 받는다).
      if (source._overload && !(opts && opts.noOverload)) {
        dmg *= source._overload;
        source._overload = 0;
      }
    }
    // 스침 — 영웅이 **움직이는 동안** 받는 피해가 준다. 멈춰서 때리는 습관을 벌준다.
    if (bh && bh.phase && unit.isHero && this.isCharging && this.isCharging(unit)) {
      dmg *= 1 - (bh.phase.cut || 0.18);
    }

    // ── 정예 '두령' 오라 — 곁의 아군이 더 아프게 때린다 (towerrule.js) ──────
    //  처치 순서를 강제하는 기제다: 두령을 먼저 끊지 않으면 주변이 전부 세다.
    if (state && state.elite && state.elite.alive && state.elite.elite === 'warlord' &&
        source && source.side === 'strategist' && source !== state.elite) {
      var wc = state.elite.eliteCfg, wr = (wc.radius || 170);
      var wdx = source.x - state.elite.x, wdy = source.y - state.elite.y;
      if (wdx * wdx + wdy * wdy <= wr * wr) dmg *= 1 + (wc.dmg || 0.30);
    }

    // ── 층 조건 훅 — 공격하는 쪽이 전략가일 때만 적용한다 ──────────────────
    //  ⚠ **때리는 쪽**을 보는 것이 핵심이다. 유닛의 def 배수(ironclad 등)와 달리
    //    광란·결속은 '그 유닛이 지금 얼마나 세졌나' 라 def 에 못 싣는다.
    //    영웅 쪽에 걸면 조건이 플레이어를 강화해 버린다 — 반드시 side 검사.
    var trk = state && state.towerRule;
    if (trk && source && source.side === 'strategist') {
      // 광란 — 시간이 흐를수록 세진다. 무한 카이팅(시간을 쓰는 답)을 막는다.
      if (trk.frenzy) {
        var fz = trk.frenzy;
        var steps = Math.floor((state.elapsed || 0) / (fz.per || 15000));
        dmg *= 1 + Math.min(fz.max || 0.6, steps * (fz.add || 0.10));
      }
      // 결속 — 곁의 동료가 죽은 만큼 세진다. `_bond` 는 사망 처리에서 올린다.
      if (trk.bond && source._bond) {
        dmg *= 1 + Math.min((trk.bond.max || 5), source._bond) * (trk.bond.dmg || 0.18);
      }
    }

    // 크리티컬 — 기본은 모든 공격에 25% 확률로 1.5배.
    // 치명타 능력치(통곡의 탑, 2026-08-22)를 산 영웅은 자기 값을 갖고 온다
    // (`critChance`/`critMul`, battle.js 탑 분기에서만 심는다 — 없으면 기본값 그대로라
    //  대전·수성탑·실시간은 한 톨도 안 바뀐다).
    var crit = false;
    var critCh = (source && source.critChance) || GAME.CONFIG.CRIT_CHANCE;
    var critMu = (source && source.critMul) || GAME.CONFIG.CRIT_MULT;
    if (!(opts && opts.noCrit) && GAME.Combat.rand() < critCh) {
      crit = true;
      dmg *= critMu;
    }

    // 방어력은 '비율' 경감이다. 정액 차감으로 하면 방어력 높은 영웅에게
    // 약한 공격 다수(=물량)가 최소피해 1로 무력화되어, 물량이라는 전략 자체가 죽는다.
    //  ── 방어구 관통 (2026-08-08 · 망치잡이) ────────────────────────────────
    //  ⚠ **opt-in 필드 하나**다. `armorPen` 이 없는 기존 유닛은 한 톨도 안 바뀐다
    //    (`slowMul`·`knockback` 과 같은 패턴). 방어력을 **깎는** 것이지 무시하는 게
    //    아니다 — 무시로 두면 방어 몰빵 빌드가 통째로 죽어 선택지가 사라진다.
    //  ⚠ 비율 경감(100/(100+armor))은 이 게임의 핵심 규율이라 식 자체는 안 건드린다.
    var _pen = (source && source.def && source.def.armorPen) || 0;
    //  ── 방패는 정면만 (2026-08-23 태현님: "정면이 아닌 경우 약점이 되길") ──────
    //  `shieldArc` 가 있는 유닛은 **정면 원호에서 온 피해만** 방어로 받는다.
    //  옆·뒤에서 맞으면 방어 0 + 약점 배수(shieldBackMul) — 돌아 들어가면 뚫린다.
    //  9층 방패병 3기 교착(유효체력 1,460 × 3 vs 제한 90초 = 필패) 신고의 답이다.
    //  ⚠ opt-in 필드 — 없는 유닛은 한 톨도 안 바뀐다(armorPen 과 같은 패턴).
    //  ⚠ facing 은 시뮬이 DetMath 로 굴리는 결정론 값이라 록스텝 안전.
    var _flank = false;
    if (unit.def.shieldArc && source && typeof source.x === 'number') {
      var _fang = (typeof unit.facing === 'number') ? unit.facing :
        (unit.side === 'strategist' ? Math.PI / 2 : -Math.PI / 2);
      var _iang = GAME.DetMath.atan2(source.y - unit.y, source.x - unit.x);
      var _dAng = Math.abs(((_iang - _fang + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (_dAng > (unit.def.shieldArc * Math.PI / 180) / 2) _flank = true;
    }
    if (_flank) dmg *= (unit.def.shieldBackMul || 1.25);
    var _arm = _flank ? 0 : this.effArmor(unit) * (1 - Math.min(0.8, _pen));
    var eff = Math.max(1, dmg * (100 / (100 + _arm)));
    //  ── 방패 내구도 (2026-08-23 태현님) ─────────────────────────────────────
    //  맞을수록 방패가 상해 방어가 깎인다(영구, 하한 0) — 컨트롤을 못 해도
    //  교착이 수학적으로 불가능해지는 안전망. effArmor 가 누적치를 뺀다.
    if (unit.def.shieldWear && eff > 0) {
      unit._shieldWear = (unit._shieldWear || 0) + unit.def.shieldWear;
    }

    //  ── 보호막이 먼저 깎인다 (2026-08-08 · 껍질장이) ──────────────────────────
    //  ⚠ **방어력 뒤에 온다.** 방어는 비율이고 보호막은 정액이라, 순서를 바꾸면
    //    보호막이 방어력만큼 부풀어 값이 두 배로 듣는다.
    //  ⚠ 버프를 다 훑지 않고 **첫 보호막 하나만** 쓴다 — 위 `healBurst` 가 중복을
    //    갱신으로 막으므로 하나뿐이고, 여러 개를 더하면 '쌓으면 무적'이 된다.
    if (eff > 0 && unit.buffs) {
      for (var _sb = 0; _sb < unit.buffs.length; _sb++) {
        var _b = unit.buffs[_sb];
        if (!_b.shieldTag || !(_b.shield > 0)) continue;
        var _use = Math.min(_b.shield, eff);
        _b.shield -= _use; eff -= _use;
        if (_b.shield <= 0) unit.buffs.splice(_sb, 1);
        break;
      }
      if (eff <= 0) return 0;      // 통째로 막았다 — 피해도 흡혈도 없다
    }

    // ── 방어 태세 — **때리면 안 되는 시간** (2026-08-03 사용자 지시) ────────────
    //  "붙어서 계속때리기만하면 안돼. 방어태세일때 때리면 공격반사! 라고 뜨면서
    //   내가 데미지를 입는다던가"
    //
    //  이 게임의 보스전은 지금까지 **DPS 체크**였다 — 공격 버튼을 놓지 않는 것이
    //  언제나 정답이라 읽을 것이 없었다("1%의 긴장도 없이"). 태세는 그 전제를 깬다:
    //  태세 중에는 때리는 것 자체가 손해라, **멈출 줄 아는 것**이 실력이 된다.
    //
    //  ⚠ 피해를 줄이기만 하면 안 된다. 그러면 "어차피 곧 풀리니 계속 때린다"가
    //    여전히 최적이다. **반사**가 있어야 멈출 이유가 생긴다.
    //  ⚠ 반사는 `noReflect` 로 재귀를 끊는다 — 안 그러면 반사가 반사를 부른다.
    if (unit._guardOn && unit.def && unit.def.guard && !(opts && opts.noReflect)) {
      var gd = unit.def.guard;
      var attempted = eff;
      eff = Math.max(1, eff * (gd.cut === undefined ? 0.15 : gd.cut));
      if (source && source.alive && source !== unit && source.side !== unit.side &&
          gd.reflect && state) {
        //  ⚠ **반사는 방어력을 무시한다.** 그냥 넣으면 반사 피해가 내 방어력으로
        //    또 깎여서, 방어를 쌓을수록 반사가 무의미해진다 — 방어형 빌드만
        //    "계속 때려도 되는" 예외가 되어 이 기제가 통째로 무너진다.
        //    (사용자 실측 빌드는 방어력 264 라 반사의 21% 만 받게 된다.)
        //    그래서 미리 방어 계수를 되곱해 **실제로 들어가는 양이 의도한 값**이
        //    되게 한다. 반사량은 내가 낸 피해에 비례하므로 화력 빌드일수록 더 아프다 —
        //    "세게 때릴수록 크게 돌려받는다"가 이 기제의 뜻이다.
        var srcArmor = this.effArmor(source);
        var back = Math.max(1, Math.round(attempted * gd.reflect * (100 + srcArmor) / 100));
        this.applyDamage(source, back, unit, state,
                         { noReflect: true, noCrit: true, abil: true, noPace: true });
        //  battle.js 가 이 숫자가 늘어난 것을 보고 "공격반사!" 를 띄운다.
        //  (전투 엔진이 화면 문구를 직접 만들지 않는다 — 씬이 읽어 간다.)
        state.reflectPing = (state.reflectPing || 0) + 1;
      }
    }

    if (unit.shield > 0) {
      var absorbed = Math.min(unit.shield, eff);
      unit.shield -= absorbed;
      eff -= absorbed;
    }

    // 첫 피해가 곧 교전 개시다. 어느 쪽이 때렸든 상관없다 —
    // 진형이 '아직 아무 일도 없다'고 착각한 채 뒷줄이 노는 것을 막는 신호다.
    if (state && !state.engaged && source && source.side !== unit.side) {
      state.engaged = true;
      state.engagedAt = state.elapsed;
    }

    unit.hp -= eff;
    unit.flash = 130;

    // ── 크게 맞았다 — 기존 타격음 위에 얹는 강조음 (2026-08-12) ──────────────
    //  "지금 hit은 일반 타격 하나뿐이다. 큰 피해에 얹을 강조음이 있으면 '묵직하게
    //  맞았다'가 소리로도 전달된다." 문턱은 유닛 피격음(6%)보다 훨씬 높게 잡는다 —
    //  스치는 피해가 아니라 **진짜 큰 한 방**에만 울려야 "크다"는 뜻이 산다.
    //  ⚠ 편을 안 가린다 — 영웅이 크게 맞을 때도, 전략가 유닛이 크게 맞을 때도 둘 다
    //    "묵직하다"는 같은 정보다. 기존 hit/heroHurt/유닛 목소리는 그대로 나고
    //    이 소리는 그 위에 얹히는 오버레이일 뿐이다(sound.js critHit 주석 참조).
    if (GAME.Sound && eff >= unit.maxHp * 0.18) GAME.Sound.play('critHit');

    // ── 축복 훅 — 영웅이 **맞았을 때**: 반격 (towerboon.js) ─────────────────
    //  피하기만 하던 플레이에 "일부러 맞으러 들어간다"는 선택지를 준다.
    //  ⚠ 쿨타임이 필수다 — 없으면 물량에 둘러싸였을 때 프레임마다 터져 화면이 하얘지고
    //    진형이 순식간에 증발한다. 1초에 한 번이 그 선을 잡은 값이다.
    //  ⚠ `noCrit`·`noOverload` 를 넘긴다. 반격이 크리·과부하를 또 태우면
    //    "맞을수록 이득"이 너무 커져 회피 게임이 아니게 된다.
    if (unit.isHero && unit.alive && state && state.boons && state.boons.riposte) {
      var rp = state.boons.riposte;
      if ((unit._ripCd || 0) <= 0) {
        unit._ripCd = rp.cd || 1000;
        var rr2 = (rp.radius || 96), rdmg = (unit.def.damage || 0) * (rp.dmgMul || 0.55);
        for (var ri = 0; ri < state.units.length; ri++) {
          var rv = state.units[ri];
          if (!rv.alive || rv.side === unit.side || this.isHazard(rv)) continue;
          var rdx = rv.x - unit.x, rdy = rv.y - unit.y;
          if (rdx * rdx + rdy * rdy <= rr2 * rr2) {
            this.applyDamage(rv, rdmg, unit, state, { noCrit: true, noOverload: true });
          }
        }
        // 화면에 보이게 — 이 게임의 규칙("모든 공격은 눈에 보이는 투사체를 갖는다")을 지킨다.
        // ⚠ 새 `kind` 를 만들지 않는다. 렌더러(scenes/battle.js)가 모르는 종류를 넣으면
        //   **조용히 안 그려진다** — 이 폴더가 겪은 "기제는 도는데 안 보인다" 계열이다.
        //   `ring` 이 이미 같은 그림(퍼지는 잉크 고리)이라 그대로 쓴다.
        state.effects.push({ kind: 'ring', x: unit.x, y: unit.y, r: rr2,
                             t: 260, total: 260, side: unit.side });
      }
    }

    if (unit.hp <= 0) {
      unit.hp = 0; unit.alive = false;
      this.spawnYolk(state, unit);   // 죽으면 노른자가 터진다
      // ── 정예 '폭심' — 죽으면 크게 터진다 (towerrule.js) ──────────────────
      //  "붙어서 아무거나 먼저 잡기"를 벌준다. 아군도 함께 맞는다 — 그래야 위치가 의미를 갖는다.
      //  ⚠ `noCrit` 로 준다. 사망 폭발이 크리까지 터지면 즉사 구간이 생겨 배울 수 없다.
      //  ⚠ 이 게이트가 `elite === 'bomb'` **한 줄**이라, def 에 `deathBlast` 를 적은
      //    유닛도 같은 폭발을 쓰게 열었다(2026-08-08 단지꾼 · 말벌집).
      //    새 코드를 만들지 않는 것이 핵심이다 — 아군도 맞는 성질, 크리 없음,
      //    고리 이펙트까지 정예 '폭심'과 **똑같이** 굴러야 배운 것이 그대로 통한다.
      if ((unit.elite === 'bomb' || unit.def.deathBlast) && state) {
        var bc = unit.eliteCfg || unit.def.deathBlast, br = (bc.radius || 132);
        var bdm = (unit.def.damage || 10) * (bc.dmgMul || 1.9);
        for (var xi = 0; xi < state.units.length; xi++) {
          var xv = state.units[xi];
          if (!xv.alive || xv === unit || this.isHazard(xv)) continue;
          var xdx = xv.x - unit.x, xdy = xv.y - unit.y;
          if (xdx * xdx + xdy * xdy <= br * br) {
            this.applyDamage(xv, bdm, unit, state, { noCrit: true, zone: true });
          }
        }
        state.effects.push({ kind: 'ring', x: unit.x, y: unit.y, r: br,
                             t: 340, total: 340, side: unit.side });
      }
      // 층 조건 `bond`(결속) — 죽은 자리 근처의 **같은 편**이 세진다.
      // 처치 순서를 고르게 만드는 장치다: 뭉친 쪽을 먼저 지우면 남은 것이 강해진다.
      if (state && state.towerRule && state.towerRule.bond &&
          unit.side === 'strategist') {
        var bd = state.towerRule.bond, rr = (bd.radius || 120);
        for (var bi = 0; bi < state.units.length; bi++) {
          var bu = state.units[bi];
          if (!bu.alive || bu === unit || bu.side !== 'strategist') continue;
          var bdx = bu.x - unit.x, bdy = bu.y - unit.y;
          if (bdx * bdx + bdy * bdy <= rr * rr) bu._bond = (bu._bond || 0) + 1;
        }
      }
      // ── 축복 훅 — 영웅이 **처치했을 때** (towerboon.js) ──────────────────
      //  세 축복이 여기 붙는다. 셋 다 "처치를 몰아치면 값을 받는다"는 같은 방향이지만
      //  주는 자원이 다르다: 속도(붙기) · 쿨타임(때리기) · 체력(버티기).
      var bk2 = state && state.boons;
      if (bk2 && source && source.isHero && source.alive) {
        if (bk2.huntersRush) {
          // 같은 버프는 갱신만 한다(중첩하면 후반에 속도가 폭주한다)
          var found = false;
          for (var hb = 0; hb < source.buffs.length; hb++) {
            if (source.buffs[hb].rushTag) {
              source.buffs[hb].t = bk2.huntersRush.ms || 3000; found = true; break;
            }
          }
          if (!found) {
            source.buffs.push({ speedMul: bk2.huntersRush.speedMul || 1.45,
                                t: bk2.huntersRush.ms || 3000, rushTag: true });
          }
        }
        if (bk2.momentum) {
          var cut = bk2.momentum.cutMs || 1200;
          for (var ck in source.skillCd) {
            if (source.skillCd[ck] > 0) source.skillCd[ck] = Math.max(0, source.skillCd[ck] - cut);
          }
        }
        if (bk2.siphon) this.heal(source, source.maxHp * (bk2.siphon.frac || 0.08));
      }
      // state.onKill 이 있으면 호출한다. 렌더/경제 계층이 여기에 붙는다(골드 보상 등).
      //  전사 대사 후보 (2026-08-22 태현님: "죽을 때도 대사") — 위험물은 제외.
      if (state && unit.side === 'strategist' && !this.isHazard(unit)) {
        this._banterEv(state, unit, 'death');
      }
      // 구슬 — 전략가 유닛을 잡았을 때만. 위험물(가시덫)은 '잡았다'로 안 친다.
      if (state && GAME.Orb && unit.side === 'strategist' && !this.isHazard(unit)) {
        GAME.Orb.maybeDrop(state, unit.x, unit.y);
      }
      if (state && state.towerHealOn && GAME.HealZone && unit.side === 'strategist' && !this.isHazard(unit)) {
        GAME.HealZone.maybeDrop(state, unit.x, unit.y);
      }
      //  ── 돌쌓이 (2026-08-08) ──────────────────────────────────────────────
      //  아군이 쓰러질 때마다 그 자리의 돌을 하나 얹는다 — 영웅의 기본 전술
      //  ("싼 것부터 치운다")을 **벌주는** 첫 유닛이다.
      //  ⚠ `state.onKill` 에 체이닝하지 않고 여기서 직접 돈다. 저 훅은 씬이 통째로
      //    갈아끼우는 자리라(수성의 탑이 골드 계산에 쓴다), 얹으면 씬 순서에 따라
      //    조용히 사라진다. def 가 신호이고 죽음이 사건이니 죽는 자리에서 처리한다.
      //  ⚠ 상한을 둔다. 진형이 통째로 갈리는 판에서 상한이 없으면 마지막 한 기가
      //    보스가 되어 "배치를 잘 짰다"가 아니라 "오래 버텼다"가 이긴다.
      if (state && !this.isHazard(unit)) {
        for (var sp = 0; sp < state.units.length; sp++) {
          var pil = state.units[sp];
          if (!pil.alive || pil === unit || pil.side !== unit.side) continue;
          var pc = pil.def.stackOnAllyDeath;
          if (!pc) continue;
          pil._stacks = (pil._stacks || 0);
          if (pil._stacks >= (pc.max || 8)) continue;
          pil._stacks++;
          var addHp = pc.hp || 22;
          pil.maxHp += addHp; pil.hp += addHp;          // 이미 깎인 만큼은 안 채워 준다
          //  ⚠ 방어는 **기존 배선(`effArmor` 의 `armorAdd` 버프)** 으로 얹는다.
          //    처음엔 `pil.bonusArmor` 라는 새 필드를 만들었는데 그걸 읽는 곳이
          //    아무 데도 없어서 **숫자만 오르고 실제로는 안 단단해질** 뻔했다.
          var sb = null;
          for (var sq = 0; sq < pil.buffs.length; sq++) {
            if (pil.buffs[sq].stoneTag) { sb = pil.buffs[sq]; break; }
          }
          if (!sb) { sb = { armorAdd: 0, t: Infinity, stoneTag: true }; pil.buffs.push(sb); }
          sb.armorAdd += (pc.armor || 4);
        }
      }
      if (state && state.onKill) state.onKill(unit, state);
      // 관측: 원거리 유닛이 근접 공격에 죽었나 (kite 학습 신호)
      if (state && unit.side === 'strategist' && (unit.def.range || 0) > 150 &&
          source && source.def && source.def.attack === 'melee') {
        state.telemetry.rangedDiedInMelee++;
      }
    }

    if (state) {
      // 상시 오라처럼 **잦고 작은** 피해는 숫자를 띄우지 않는다. 초당 여러 번 × 적 여러 기면
      // 화면이 1~2 짜리 숫자로 뒤덮이고, 이 저장소에서 피해 숫자는 이미 프레임 저하의
      // 원인이었다(v0.38). 존재는 바닥 고리와 피격 반짝임으로 읽힌다.
      if (!(opts && opts.noNumber)) this.pushNumber(state, unit, eff, crit);
      // 전략가가 영웅을 때렸다 → 압박을 그만큼 덜어내고 '교전했다'로 기록.
      //
      // 한 번이라도 맞으면 압박을 0 으로 되돌리던 예전 방식은 구멍이었다. 저격수 하나가
      // 가끔 긁기만 해도 압박이 영원히 0 이라, 나머지 진형은 집에 앉아 있고 영웅은
      // 90초 동안 피해 112 만 받으며 쉬었다(실측). 그래서 '맞았는가'가 아니라
      // **'충분히 위협받고 있는가'** 로 바꾼다 — 초당 최대체력 2% 를 기준으로 삼는다.
      if (unit.isHero && source && source.side === 'strategist') {
        var relief = (eff / Math.max(1, unit.maxHp * 0.02)) * 1000;
        state.noHitFor = Math.max(0, state.noHitFor - relief);
        state.telemetry.heroDamageTaken += eff;
        //  ── 학습 관측 (2026-08-08) ────────────────────────────────────────
        //  "원거리에게 맞기만 하고 한 대도 못 때렸다"를 다음 판에 쓰려면 **그 두 값을
        //  따로 재야** 한다. 지금까지는 맞은 총량만 있어서 무엇에게 맞았는지 몰랐다.
        if ((source.def.range || 0) > 150) state.telemetry.heroDmgFromRanged += eff;
        if (opts && opts.zone) state.telemetry.heroDmgFromZone += eff;
      } else if (source && source.isHero && unit.side === 'strategist' && state && state.telemetry) {
        state.telemetry.heroDamageDealt += eff;
        if ((unit.def.range || 0) > 150) state.telemetry.heroDmgToRanged += eff;
        // 내가 맞고 있다는 걸 소리로도 알린다(화면만 보면 놓친다)
        if (GAME.Sound) GAME.Sound.play('heroHurt');
      } else if (GAME.Sound && GAME.Sound.playFor && !unit.isHero && eff > 0) {
        //  ⚠ 유닛 피격음은 **아플 때만** 낸다. 스치는 피해까지 소리를 내면
        //    전장이 계속 지글거려 정작 중요한 소리(영웅 피격)를 덮는다.
        //    기준은 최대체력 6% — 한두 대로는 안 울리고, 제대로 맞으면 울린다.
        if (eff >= unit.maxHp * 0.06) GAME.Sound.playFor('hurt', unit.def);
        if (!source.everEngaged) {
          source.everEngaged = true;
          state.telemetry.engagedUnits++;
        }
      }
    }

    // 흡혈 — 실제로 들어간 피해 기준.
    //
    // opts.lsScale 은 **광역으로 여러 기를 동시에 때렸을 때** 두 번째 대상부터 걸리는 감쇠다.
    // 이게 없으면 흡혈이 명중 수에 그대로 비례해서, 부채꼴이 넓은 영웅은
    // 표기 흡혈 25% 가 실측 79% 로 뛴다(헌병대: 한 방에 평균 3.16기 명중).
    // 그 결과 **전략가가 물량을 늘릴수록 영웅을 더 회복시켜 주는** 역전이 생겼다.
    if (source && source.alive && eff > 0) {
      var ls = (source.def.lifesteal || 0) * (source._lsMul || 1) *
               ((opts && opts.lsScale !== undefined) ? opts.lsScale : 1);
      if (ls > 0) {
        var want = eff * ls;
        // 스윙 총량 상한 — 한 번 휘두르기의 회복 합계를 opts.lsBudget 이 묶는다.
        // 대상 수에 비례해 회복이 무한정 늘던 것을 여기서 자른다(CONFIG.LIFESTEAL_SWING_CAP).
        if (opts && opts.lsBudget) {
          var room = opts.lsBudget.cap - opts.lsBudget.used;
          want = room <= 0 ? 0 : Math.min(want, room);
          opts.lsBudget.used += want;
        }
        if (want > 0) this.heal(source, want);
      }
    }
    return eff;
  },

  // 광역 공격의 n 번째 대상에 걸리는 흡혈 배수. 첫 대상만 온전히 받는다.
  _ls: function (hitIndex) {
    return hitIndex === 0 ? 1 : GAME.CONFIG.AOE_LIFESTEAL;
  },

  // 한 번 휘두르기(부채꼴·광역)의 흡혈 회복 총량 상한 주머니.
  // cap = 시전자 최대체력 × CONFIG.LIFESTEAL_SWING_CAP. 0 이면 무제한(상한 없음).
  _lsBudget: function (source) {
    var frac = GAME.CONFIG.LIFESTEAL_SWING_CAP || 0;
    return { cap: frac > 0 ? source.maxHp * frac : Infinity, used: 0 };
  },

  // 죽음 연출 — 피 대신 노른자. 12세 이용가 톤으로 짧고 귀엽게, 얼룩은 금방 사라진다.
  spawnYolk: function (state, unit) {
    // 죽는 순간 소리 — 노른자가 터지는 '퐁'. Sound 가 없거나 막혀 있어도 조용히 넘어간다.
    if (GAME.Sound) {
      GAME.Sound.play('yolk');
      //  ⚠ '퐁'은 **지운 게 아니라 남겼다.** 저건 이 게임에서 "누가 죽었다"를 뜻하는
      //    소리라, 종류별 꼬리로 갈아치우면 죽음 자체를 못 알아듣는다.
      //    재료 소리는 그 뒤에 얹어 "무엇이 죽었는지"만 더한다.
      if (GAME.Sound.playFor) GAME.Sound.playFor('die', unit.def);
    }
    if (!state) return;
    var r = unit.def.radius;
    state.effects.push({
      kind: 'yolk', x: unit.x, y: unit.y, r: r,
      hero: !!unit.isHero, seed: GAME.Combat.rand() * 6.283,
      t: 480, total: 480, side: unit.side
    });
    state.effects.push({
      kind: 'yolkStain', x: unit.x, y: unit.y, r: r,
      t: 1600, total: 1600, side: unit.side
    });
  },

  pushNumber: function (state, unit, amount, crit) {
    if (amount <= 0) return;
    // ⚠ **세로로 층을 나눈다** (2026-08-01). 광역기 한 방이 열 기를 동시에 때리면
    //   숫자 열 개가 **같은 높이로** 나란히 떠서 서로를 밟는다. 좌우로만 흩어서는
    //   안 풀린다 — 유닛들이 애초에 가까이 붙어 있기 때문이다.
    //   스킬에 계수가 붙어 숫자가 길어진 뒤(예: "2.6k!") 겹침이 눈에 띄게 늘었다
    //   (겹침 감사 0건 → 13건). 뜨는 순서대로 세 층에 번갈아 올린다.
    state._numSeq = ((state._numSeq || 0) + 1) % 3;
    state.numbers.push({
      x: unit.x + (GAME.Combat.rand() - 0.5) * 44,
      y: unit.y,
      yOff: state._numSeq * 17,
      // 좌우로 퍼지게 흘려보낸다 — 같은 자리에서 여러 대 맞으면 숫자가 뭉쳐 읽을 수 없다
      drift: (GAME.Combat.rand() - 0.5) * 46,
      value: Math.round(amount),
      crit: !!crit,
      // 영웅이 맞은 건지 적이 맞은 건지 색으로 구분
      onHero: !!unit.isHero,
      t: crit ? 1000 : 750,
      total: crit ? 1000 : 750
    });
    // 숫자가 무한정 쌓이지 않게 상한
    if (state.numbers.length > 70) state.numbers.splice(0, state.numbers.length - 70);
  },

  //  ── 상처(치유 감소) — 2026-08-02 사용자 지시 ─────────────────────────────
  //  "흡혈로 인해서 아예 데미지 못 입히는 경우도 있으니 전략 배치 유닛 중
  //   치유 감소에 대한 스킬도 추가해야 할 듯해."
  //
  //  **여기 한 곳에만 넣는다.** `heal` 이 이 게임의 모든 회복이 지나가는 단일
  //  관문이다(흡혈·물약·healNow·healBurst·회복 오라가 전부 여길 통한다).
  //  흡혈 계산 쪽에 넣었으면 물약과 오라가 새고, 물약 쪽에 넣었으면 흡혈이 샌다.
  //  ⚠ 이 게임의 흡혈은 **맞은 대상 수에 비례해 증폭**된다(CLAUDE.md 의 실측:
  //    표기 25% 가 실효 79%). 그래서 흡혈만 따로 깎는 방식으로는 광역 영웅에게
  //    체감이 안 온다 — 회복의 총량을 깎아야 답이 된다.
  //  ⚠ 이 함수는 **전략가·영웅 양쪽이 다 쓴다.** 진형이 되돌린 양만 세려면
  //    편을 봐야 한다 — 안 보면 영웅의 흡혈까지 진형 회복으로 잡힌다.
  heal: function (u, amount, state) {
    //  PACE.HEAL — 회복의 단일 관문(config.js). 유닛 체력 통이 절반이 됐으므로
    //  유닛 회복도 절반이어야 비중이 예전과 같다(영웅 회복은 그대로).
    if (GAME.Combat.paceOn && !(u && u.isHero)) amount *= GAME.CONFIG.PACE.HEAL;
    if (state && state.telemetry && u && u.side === 'strategist' && amount > 0) {
      state.telemetry.strategistHealed += Math.min(amount, Math.max(0, u.maxHp - u.hp));
    }
    return this._heal0(u, amount);
  },

  _heal0: function (u, amount) {
    if (!u.alive) return;
    //  ⚠ `buffs` 가 **없는 유닛도 이 문을 통과한다** — 치유 구역(healzone.js)이
    //    넘기는 대상처럼 최소 필드만 가진 객체가 있다. 가드 없이 `u.buffs.length`
    //    를 읽었더니 그 경로가 통째로 죽었다(towerchar-audit 이 잡았다).
    //    회복은 이 게임에서 가장 여러 곳에서 불리는 함수다 — 여기서 던지면
    //    전투 루프가 같이 죽는다.
    if (u.buffs) {
      for (var i = 0; i < u.buffs.length; i++) {
        if (u.buffs[i].healCutTag) { amount *= (1 - u.buffs[i].healCut); break; }
      }
    }
    if (amount <= 0) return;
    u.hp = Math.min(u.maxHp, u.hp + amount);
  },

  // 상처는 둔화와 같은 규칙이다 — 같은 종류끼리 **중첩하지 않고 갱신만** 한다.
  // 중첩되면 약초꾼 서넛이 깔린 진형에서 회복이 통째로 0 이 되어 답이 아니라 벽이 된다.
  applyHealCut: function (u, frac, ms) {
    if (!u.alive || !u.buffs || !(frac > 0)) return false;
    for (var i = 0; i < u.buffs.length; i++) {
      if (u.buffs[i].healCutTag) {
        u.buffs[i].t = Math.max(u.buffs[i].t, ms);
        u.buffs[i].healCut = Math.max(u.buffs[i].healCut, frac);
        return true;
      }
    }
    u.buffs.push({ healCut: frac, t: ms, healCutTag: true });
    return true;
  },

  // 화학병 점착탄 — 같은 종류의 둔화는 갱신만 하고 중첩되지 않는다
  applySlow: function (u, p) {
    for (var i = 0; i < u.buffs.length; i++) {
      if (u.buffs[i].slowTag) { u.buffs[i].t = p.slowMs; return; }
    }
    u.buffs.push({ speedMul: p.slowMul, t: p.slowMs, slowTag: true });
  },

  // `state` 는 선택 인자다 — 넘기면 층 조건 `nosupply`(무보급)를 검사한다.
  // 안 넘기는 옛 호출부는 예전과 똑같이 동작한다.
  usePotion: function (u, state) {
    if (!u.isHero || u.potionCharges <= 0) return false;
    if (u.hp >= u.maxHp) return false;
    // 무보급 층 — 물약을 쓸 수 없다. 대신 보상이 1.5배다(towerrule.js).
    // 충전은 **소모하지 않는다** — 못 쓴 것이지 쓴 것이 아니다.
    if (state && state.towerRule && state.towerRule.nosupply) return false;
    u.potionCharges--;
    this.heal(u, u.potionHeal);
    return true;
  },

  // ── 이동 ────────────────────────────────────────────────────
  // leash 는 '절대 한계'다. 교착 압박이 차오르면 그만큼 함께 늘어난다.
  //
  // **한계를 넘었다고 좌표를 즉시 옮기지 않는다.** 예전엔 그렇게 스냅했는데,
  // 추격 한계는 압박(pressure)에 따라 실시간으로 늘었다 줄었다 한다 — 영웅이 도약으로
  // 멀리 빠지면 한계가 확 줄면서 밖에 있던 유닛들이 **한 프레임에 순간이동**했다
  // (실측 신고: "궁수가 도약 쓰면 적 유닛이 순간이동"). 걸어서 돌아오게 한다.
  // 다만 아주 크게 벗어난 경우(넉백·끌기 등으로 튕겨나간 상황)는 안전장치로 잘라준다.
  clampToLeash: function (u, state, dt) {
    if (!isFinite(u.leash)) return;
    var limit = state ? this.effChase(u, state) : u.leash;
    var dx = u.x - u.home.x, dy = u.y - u.home.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d <= limit || d <= 0.001) return;

    // ⚠ **순간이동을 없앴다** (2026-07-29, 사용자 신고).
    //   예전엔 한계의 1.6 배를 넘으면 좌표를 잘라 붙였다 — 화면에서는 유닛이
    //   한 프레임에 원래 자리로 **텔레포트**하는 것으로 보인다. 안전장치라고 넣었지만
    //   실제로는 가장 눈에 띄는 버그였고, 보스·방패병 돌진(v0.50)이 유닛을 멀리
    //   보내면서 더 자주 걸렸다. 아무리 멀어도 **걸어서** 돌아온다.
    // 추격을 결심한 유닛은 리시를 아예 적용하지 않는다 — 아래 updateStance 참조.
    if (u.committed) return;
    // 한계 바깥이면 그 경계로 **걸어서** 돌아온다
    var step = this.effSpeed(u) * (dt === undefined ? 0.016 : dt);
    var back = Math.min(d - limit, step);
    u.x -= (dx / d) * back;
    u.y -= (dy / d) * back;
  },

  clampToArena: function (u) {
    var A = GAME.CONFIG.ARENA, r = u.def.radius;
    if (u.x < A.x + r) u.x = A.x + r;
    if (u.x > A.right - r) u.x = A.right - r;
    if (u.y < A.y + r) u.y = A.y + r;
    if (u.y > A.bottom - r) u.y = A.bottom - r;
  },

  // ── 시선 (요청 4) ───────────────────────────────────────────────────────
  // 규칙 두 줄이 전부다:
  //   · 이동 중이면 **진행 방향**을 본다  (moveToward)
  //   · 자동공격 중이면 **공격 대상 방향**을 본다 (faceAttack) — 공격이 우선이다
  // 영웅(isHero)은 예외다. 플레이어 조작(js/input.js·touchpad.js)이 시선을 소유한다.
  //
  // ⚠ facing 은 렌더에만 쓰이는 값처럼 보이지만 `castSkillFacing`(영웅 전용)이 읽는다.
  //   근접 부채꼴 판정은 facing 이 아니라 `fire()` 가 대상에서 그 자리에서 계산한
  //   `ang` 을 쓰므로, 여기서 시선을 바꿔도 **근접 명중은 달라지지 않는다**(회귀로 확인).
  faceAttack: function (u, ang) {
    u.facing = ang;
    // 영웅은 잠그지 않는다 — 시선의 주인이 플레이어이기 때문이다(규칙을 뺏으면 조작이 어긋난다).
    if (!u.isHero) u.faceLock = 2;
  },

  moveToward: function (u, tx, ty, step) {
    var dx = tx - u.x, dy = ty - u.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.5) return true;
    if (step > d) step = d;
    u.x += (dx / d) * step;
    u.y += (dy / d) * step;
    // 공격이 시선을 잡고 있지 않을 때만 진행 방향을 본다
    if (!(u.faceLock > 0)) u.facing = GAME.DetMath.atan2(dy, dx);
    this.clampToArena(u);
    return d <= step + 0.5;
  },

  // ── 기본 공격 ────────────────────────────────────────────────
  fire: function (u, tx, ty, target, state) {
    var def = u.def;
    if (def.attack === 'none') return;
    //  영웅 발견 — 사거리 진입이 아니라 **처음 공격을 시작하는 순간**이다
    //  (2026-08-22 태현님: "감지해서 공격을 시작할 때 띄워줘").
    if (u.side === 'strategist' && target && target.isHero &&
        u._spotAt === undefined && state) {
      u._spotAt = state.elapsed;
      this._banterEv(state, u, 'spot');
    }
    var ang = GAME.DetMath.atan2(ty - u.y, tx - u.x);
    this.faceAttack(u, ang);
    var dmg = this.effDamage(u, state);

    //  ── 벼려진 일격(구슬) — **다음 평타 한 번만** 배수를 태우고 소모된다 ──────
    //  (2026-08-02 사용자 지시: "다음 기본공격은 1,000%의 데미지를 입히는 구슬")
    //  ⚠ 여기서 소모하는 이유: `effDamage` 는 표시·미리보기 등 다른 곳에서 불릴 수
    //    있어 거기 넣으면 **때리지도 않았는데 소모될** 수 있다. `fire` 는 실제로
    //    한 대 치는 유일한 지점이라 "한 번만"이 구조적으로 보장된다.
    if (u._nextHitMul && u._nextHitMul > 1) {
      dmg *= u._nextHitMul;
      u._nextHitMul = 0;
      u._nextHitFlash = 1;               // 연출용 — 이번 타격이 그 한 방이었다
    }

    // 공격음 — 근접은 둔탁하게, 원거리는 바람 가르는 소리로.
    // **내 영웅의 공격만** 소리를 낸다: 진형 10기가 동시에 쏘면 소리가 뭉개져 시끄럽기만 하다.
    //  ⚠ 사냥꾼(`art: 'hunter'`)은 **활**이다 — 돌·창과 같은 '쉭' 소리를 쓰면 무엇을
    //    들고 있는지가 소리로 안 전해진다. 시위 튕김 + 깃 소리 두 겹으로 따로 낸다
    //    (2026-08-04 사용자 요청: "화살은 효과음이라던가 ... 좀 더 멋있으면").
    //  ⚠ 여기는 소리만 고른다 — 판정·피해에는 한 줄도 안 닿는다.
    if (GAME.Sound && u.isHero) {
      GAME.Sound.play(def.attack === 'melee' ? 'hit'
                      : (def.art === 'hunter' ? 'bow' : 'shoot'));
    } else if (GAME.Sound && GAME.Sound.playFor && (def.damage || 0) > 0) {
      //  ── 유닛 공격음 (2026-08-08) ────────────────────────────────────────
      //  ⚠ 지금까지 **유닛은 아무 소리도 안 냈다**(위 조건이 `u.isHero` 다).
      //    스무 기가 싸우는데 들리는 건 영웅 하나뿐이라 전장이 이상하게 조용했다.
      //  ⚠ 재료별 게이트 + 작은 볼륨은 `sound.js` 가 맡는다. 여기서는 부르기만 한다 —
      //    판정·피해에는 한 줄도 안 닿는다.
      //  ⚠ **공격력 0 인 유닛은 소리를 내면 안 된다.** 울짱꾼·껍질장이·약초꾼은
      //    때리는 유닛이 아닌데 공격 루틴은 그대로 돌아서, 안 막으면 아무도 안 맞는데
      //    계속 휘두르는 소리가 난다(감사에서 잡혔다 — 화면만 보면 절대 모른다).
      GAME.Sound.playFor('atk', def);
    }

    if (def.attack === 'melee') {
      var half = ((def.coneDeg || 90) * Math.PI / 180) / 2;
      // 달려들며 친 타격이면 밀어내고 피해가 조금 는다. 멈춰 서서 치면 평타 그대로다.
      var charged = !!def.chargeKnock && this.isCharging(u);
      if (charged && def.chargeDamageMul) dmg *= def.chargeDamageMul;
      // 부채꼴에 여러 기가 걸려도 흡혈은 첫 대상만 온전히 받고(AOE_LIFESTEAL),
      // 이 한 번 휘두르기의 회복 총량은 lsBudget 이 묶는다(LIFESTEAL_SWING_CAP).
      var meleeHit = 0, meleeLs = this._lsBudget(u);
      for (var i = 0; i < state.units.length; i++) {
        var o = state.units[i];
        if (!o.alive || o.side === u.side) continue;
        if (this.dist(u, o) > def.range + o.def.radius) continue;
        var a = GAME.DetMath.atan2(o.y - u.y, o.x - u.x);
        var diff = GAME.DetMath.atan2(GAME.DetMath.sin(a - ang), GAME.DetMath.cos(a - ang));
        if (Math.abs(diff) <= half) {
          this.applyDamage(o, dmg, u, state, {
            lsScale: meleeHit === 0 ? 1 : GAME.CONFIG.AOE_LIFESTEAL,
            lsBudget: meleeLs
          });
          // 밀어내기는 **살아남은 적만** 민다(죽은 유닛을 밀면 노른자가 엉뚱한 데서 튄다).
          // 밀어내는 거리는 사거리보다 한참 짧게 잡는다 — 길면 내가 때리던 적을
          // 내 사거리 밖으로 밀어내 스스로 화력을 깎는다(근접이 가장 손해 보는 짓이다).
          if (charged && o.alive) {
            var kd = this.dist(u, o);
            if (kd > 0.1) {
              this.displace(o, ((o.x - u.x) / kd) * def.chargeKnock,
                               ((o.y - u.y) / kd) * def.chargeKnock);
              this.clampToArena(o); this.clampToLeash(o, state);
            }
          }
          meleeHit++;
        }
      }
      state.effects.push({
        kind: 'slash', x: u.x, y: u.y, angle: ang,
        range: def.range, half: half, t: 140, total: 140, side: u.side,
        charged: charged
      });
      // 근접도 '무언가 날아간다'는 게 보이도록 검기를 띄운다 (연출 전용, 피해는 위에서 이미 적용)
      state.effects.push({
        kind: 'slashWave', x: u.x, y: u.y, angle: ang,
        range: def.range, t: 220, total: 220, side: u.side
      });

    } else if (def.attack === 'projectile') {
      state.projectiles.push({
        x: u.x, y: u.y,
        vx: GAME.DetMath.cos(ang) * def.projectileSpeed,
        vy: GAME.DetMath.sin(ang) * def.projectileSpeed,
        damage: dmg,
        side: u.side,
        radius: def.projectileRadius,
        life: 3000,
        owner: u,
        slowMul: def.slowMul, slowMs: def.slowMs,   // 화학병 점착탄
        sticky: !!def.slowMul
      });
      // 관측: 영웅을 겨눈 논타겟이 몇 발이었나 (회피 실력 계산의 분모)
      if (u.side === 'strategist' && target && target.isHero) {
        state.telemetry.projectilesAtHero++;
      }

    } else if (def.attack === 'aoe') {
      state.effects.push({
        kind: 'telegraph', x: tx, y: ty, r: def.aoeRadius,
        t: def.telegraph, total: def.telegraph,
        damage: dmg, side: u.side, owner: u
      });
      // 예고 시간 동안 시전자에서 착탄점으로 구체가 날아가는 게 보인다
      state.effects.push({
        kind: 'lob', x1: u.x, y1: u.y, x2: tx, y2: ty,
        t: def.telegraph, total: def.telegraph, side: u.side
      });

    } else if (def.attack === 'targeted') {
      // 자동명중이지만 '보이게' 한다 — 유도탄이라 피할 수는 없다
      if (target && target.alive) {
        state.projectiles.push({
          x: u.x, y: u.y, vx: 0, vy: 0,
          damage: dmg, side: u.side, radius: 6,
          life: 4000, owner: u, homing: target,
          speed: def.bulletSpeed || 700, tracer: true
        });
      }
    }
  },

  // ── 스킬 ────────────────────────────────────────────────────
  skillReady: function (u, slot) {
    return u.isHero && u.alive && u.skillCd[slot] <= 0 && u.rootedFor <= 0;
  },

  // 스킬의 '예상 사거리' — 시전 방향으로 얼마나 뻗는가. UI 표시와 방향 시전에 함께 쓴다.
  //  · dash/pull   : 이동/원뿔 거리(sk.dist, 이미 WORLD_SCALE 반영됨)
  //  · aoeSelf/aura: 자기 중심 반경(sk.radius)
  //  · aoeTarget/trap/projectile: 앞쪽으로 떨어질 거리(literal 은 월드 배율을 곱한다)
  //  · buff/strike : 자기/자동 대상 — 방향 무의미(0)
  skillReach: function (sk) {
    if (!sk) return 0;
    var ws = (GAME.CONFIG && GAME.CONFIG.WORLD_SCALE) || 1;
    switch (sk.type) {
      case 'dash': case 'pull': return Math.round(sk.dist || 0);
      case 'aoeSelf': case 'aura': return Math.round(sk.radius || 0);
      case 'aoeTarget': return Math.round((sk.range || 240) * ws);
      case 'trap': return Math.round((sk.range || 220) * ws);
      case 'projectile': return Math.round((sk.range || 460) * ws);
      default: return 0;   // buff, strike
    }
  },

  // 영웅이 **바라보는 방향(facing)** 으로 즉시 시전한다. PC·모바일 공통.
  // 조준을 따로 하지 않는다 — 지점 배치 스킬(aoeTarget/trap)은 사거리만큼 앞에 떨어지고,
  // 방향형(dash/projectile/pull)은 각도만 쓰인다. 자기중심(buff/aoeSelf/aura)은 facing 을
  // 그대로 보존한다(reach 0 이면 앞 120px 로 각도만 유지).
  castSkillFacing: function (u, slot, state) {
    if (!this.skillReady(u, slot)) return false;
    var sk = null;
    for (var i = 0; i < u.skills.length; i++) {
      if (u.skills[i].slot === slot) { sk = u.skills[i]; break; }
    }
    if (!sk) return false;
    var ang = (typeof u.facing === 'number') ? u.facing : 0;
    var reach = this.skillReach(sk) || 120;
    return this.castSkill(u, slot, u.x + GAME.DetMath.cos(ang) * reach, u.y + GAME.DetMath.sin(ang) * reach, state);
  },

  // 시전이 만든 이펙트에 시전자 표시를 붙인다(색을 나누기 위한 것 — castSkill 주석 참조).
  _tagSkillFx: function (state, from, u, sk) {
    if (!state || !state.effects || from < 0) return;
    var key = (u && u.isHero) ? (u.type || (u.def && u.def.key)) : null;
    //  급(grade) — 스킬 가격에서 5단으로 접는다. **렌더 전용 태그**다(굵기·알파·장식
    //  가짓수만 바꾸고 반경은 절대 안 바꾼다 — 예고 반경은 판정 약속이다).
    //  유니티 배정표(기본형×속성×급)의 '급' 축을 웹에 들여오는 자리(2026-08-20).
    var cost = (sk && sk.cost) || 0;
    var grade = cost <= 0 ? 1 : cost <= 300 ? 2 : cost <= 900 ? 3 : cost <= 3000 ? 4 : 5;
    for (var i = from; i < state.effects.length; i++) {
      if (state.effects[i].heroKey === undefined) state.effects[i].heroKey = key;
      if (state.effects[i].grade === undefined) state.effects[i].grade = grade;
    }
  },

  // 이번 시전의 실제 피해 — 고정값 + 공격력 × 계수.
  //  ⚠ 계수는 `damage > 0` 인 스킬에만 붙는다(유틸 스킬은 0 이라 곱해도 0).
  _skillPower: function (u, sk) {
    var base = (sk && sk.damage) || 0;
    if (!(base > 0) || !GAME.skillAtkCoef) return base;
    var coef = GAME.skillAtkCoef(sk);
    if (!(coef > 0)) return base;
    var S = GAME.SKILL_COEF;
    var atk = (u && u.def && u.def.damage) || 0;
    // 기준 공격력에서 **손익 0** 이 되게 고정값을 미리 깎는다(SKILL_COEF 주석 참조).
    var flat = Math.max(base * S.floorRatio, base - S.refAtk * coef);
    return Math.round(flat + atk * coef);
  },

  // 구역(aura) 스킬의 초당 피해. `damage` 와 같은 규칙을 쓴다 —
  //  ⚠ 이 필드를 빠뜨려서 파수꾼 궁극기만 계수 밖에 있었다(2026-08-02 신고).
  _skillDps: function (u, sk) {
    var base = (sk && sk.dps) || 0;
    if (!(base > 0) || !GAME.skillAtkCoef) return base;
    var coef = GAME.skillAtkCoef(sk);
    if (!(coef > 0)) return base;
    var S = GAME.SKILL_COEF;
    var atk = (u && u.def && u.def.damage) || 0;
    var flat = Math.max(base * S.floorRatio, base - S.refAtk * coef);
    return Math.round(flat + atk * coef);
  },

  // 보호막·방어 부여는 **방어력**을 탄다(공격력을 태우면 딜러가 더 단단해진다).
  _skillShield: function (u, sk) {
    var base = (sk && sk.shield) || 0;
    if (!(base > 0) || !GAME.skillDefCoef) return base;
    var coef = GAME.skillDefCoef(sk);
    if (!(coef > 0)) return base;
    var S = GAME.SKILL_COEF;
    var arm = (u && u.def && u.def.armor) || 0;
    var flat = Math.max(base * S.floorRatio, base - S.refArm * coef);
    return Math.round(flat + arm * coef);
  },

  castSkill: function (u, slot, tx, ty, state) {
    //  ── 스킬 재료(motif) — 2026-08-03 ────────────────────────────────────
    //  ⚠ 이펙트마다 손으로 `motif:` 를 달지 않는다. 이 함수가 만드는 이펙트가
    //    12곳이 넘어서 하나라도 빠지면 그 스킬만 조용히 무채색이 된다
    //    (이 저장소가 `abilities` 복수형을 빠뜨려 겪은 사고와 같은 종류다).
    //    그래서 **push 를 감싸** 이 시전 동안 만들어지는 것 전부에 자동으로 붙인다.
    var _push0 = state.effects.push, _mo = null;
    //  ⚠ `u.skills` 는 **배열**이고 슬롯은 항목의 `.slot` 필드다(Q/W/E/R).
    //    `u.skills[slot]` 로 읽으면 언제나 undefined 라 재료가 영영 안 붙는다 —
    //    아래 `_castSkillInner` 가 쓰는 것과 **같은 방식**으로 찾아야 한다.
    try {
      for (var _i = 0; u.skills && _i < u.skills.length; _i++) {
        if (u.skills[_i] && u.skills[_i].slot === slot) { _mo = u.skills[_i].motif; break; }
      }
    } catch (e) { _mo = null; }
    if (_mo) {
      state.effects.push = function (o) {
        if (o && o.motif === undefined) o.motif = _mo;
        return _push0.apply(this, arguments);
      };
    }
    try {
      var _ok = this._castSkillInner(u, slot, tx, ty, state);
      //  ── 궁극기 신호 (2026-08-03) ────────────────────────────────────────
      //  ⚠ 전투 엔진은 **화면 문구를 만들지 않는다**(공격반사 때와 같은 규약).
      //    "궁극기가 나갔다"는 사실만 남기고, 배너는 씬이 읽어서 띄운다.
      //  ⚠ 영웅만이다. 진형 유닛이 R 을 쓰는 일은 없지만 조건을 명시해 둔다.
      if (_ok && slot === 'R' && u && u.isHero && state) {
        for (var _j = 0; u.skills && _j < u.skills.length; _j++) {
          if (u.skills[_j] && u.skills[_j].slot === 'R') {
            state.ultCast = { name: u.skills[_j].name, n: (state.ultCast ? state.ultCast.n : 0) + 1 };
            break;
          }
        }
      }
      return _ok;
    } finally {
      state.effects.push = _push0;
    }
  },

  _castSkillInner: function (u, slot, tx, ty, state) {
    if (!this.skillReady(u, slot)) return false;
    var sk = null;
    for (var i = 0; i < u.skills.length; i++) {
      if (u.skills[i].slot === slot) { sk = u.skills[i]; break; }
    }
    if (!sk) return false;

    var ang = GAME.DetMath.atan2(ty - u.y, tx - u.x);
    u.facing = ang;
    var self = this;
    var i2, o;

    // ── 스킬 계수 (2026-08-01 사용자 지시) ──────────────────────────────────
    //  `피해 = 고정값 + 공격력 × 계수`. **여기서 계산해야** 아이템·능력치·버프가
    //  전부 실린다 — 스킬을 만들 때 곱하면 그 뒤에 붙는 보정이 하나도 안 들어간다.
    //  아래에서 `sk.damage` 대신 `skDmg` 를 쓴다(전부 바꿔야 한다. 하나만 놓치면
    //  그 스킬만 조용히 옛 수치로 돈다 — 이 저장소가 반복해 겪은 실패 모드다).
    var skDmg = this._skillPower(u, sk);
    var skShield = this._skillShield(u, sk);

    // ── 이 시전이 만든 이펙트에 **누가 썼는지** 표시한다 (2026-08-01) ───────────
    //  스킬 이펙트가 세 영웅 모두 같은 색이라 정체성이 안 섰다. 색을 나누려면
    //  그리는 쪽이 시전자를 알아야 하는데, 이펙트를 push 하는 자리가 타입마다
    //  흩어져 있다(dash·aoeSelf·aoeTarget·buff·pull·trap…).
    //  **한 곳에서 잡는다** — 시전 전 길이를 기억해 두고 끝나고 그 뒤에 붙은 것만
    //  태그한다. 새 스킬 타입을 추가해도 자동으로 따라온다(빠뜨릴 자리가 없다).
    var _fxMark = state && state.effects ? state.effects.length : -1;

    // 스킬 시전음 — 광역/폭발 계열은 묵직하게, 나머지는 솟는 톤으로
    if (GAME.Sound) {
      var boomy = (sk.type === 'aoeSelf' || sk.type === 'aoeTarget' || sk.type === 'trap');
      GAME.Sound.play(boomy ? 'boom' : 'skill');
    }

    if (sk.type === 'dash') {
      // backward = 마우스 반대 방향으로 물러나며 쏜다(반동 사격)
      var dir = sk.backward ? ang + Math.PI : ang;
      var nx = u.x + GAME.DetMath.cos(dir) * sk.dist;
      var ny = u.y + GAME.DetMath.sin(dir) * sk.dist;
      var fromX = u.x, fromY = u.y;
      u.x = nx; u.y = ny;
      this.clampToArena(u);
      if (skDmg > 0) {
        var dashHit = 0, dashLs = this._lsBudget(u);
        for (i2 = 0; i2 < state.units.length; i2++) {
          o = state.units[i2];
          if (!o.alive || o.side === u.side) continue;
          if (this._distToSegment(o, fromX, fromY, u.x, u.y) <= sk.radius + o.def.radius) {
            this.applyDamage(o, skDmg, u, state, { lsScale: this._ls(dashHit++), lsBudget: dashLs });
          }
        }
      }
      state.effects.push({
        kind: 'dashTrail', x1: fromX, y1: fromY, x2: u.x, y2: u.y,
        t: 260, total: 260, side: u.side
      });

    } else if (sk.type === 'aoeSelf') {
      var aoeHit = 0, aoeLs = this._lsBudget(u);
      for (i2 = 0; i2 < state.units.length; i2++) {
        o = state.units[i2];
        if (!o.alive || o.side === u.side) continue;
        var d = this.dist(u, o);
        if (d <= sk.radius + o.def.radius) {
          this.applyDamage(o, skDmg, u, state, { lsScale: this._ls(aoeHit++), lsBudget: aoeLs });
          if (sk.rootMs) o.rootedFor = Math.max(o.rootedFor, sk.rootMs);
          if (sk.knockback && d > 0.1) {
            var kx = (o.x - u.x) / d, ky = (o.y - u.y) / d;
            this.displace(o, kx * sk.knockback, ky * sk.knockback);
            this.clampToArena(o); this.clampToLeash(o, state);
          }
        }
      }
      state.effects.push({
        kind: 'ring', x: u.x, y: u.y, r: sk.radius,
        t: 320, total: 320, side: u.side
      });

    } else if (sk.type === 'aoeTarget') {
      var reps = sk.repeat || 1;
      for (var r = 0; r < reps; r++) {
        state.effects.push({
          kind: 'telegraph', x: tx, y: ty, r: sk.radius,
          t: sk.telegraph + r * (sk.interval || 600),
          total: sk.telegraph,
          damage: skDmg, side: u.side, owner: u
        });
      }

    } else if (sk.type === 'projectile') {
      var shots = sk.burst || 1;
      for (var b2 = 0; b2 < shots; b2++) {
        state.projectiles.push({
          x: u.x, y: u.y,
          vx: GAME.DetMath.cos(ang) * sk.speed,
          vy: GAME.DetMath.sin(ang) * sk.speed,
          damage: skDmg,
          side: u.side,
          radius: sk.radius,
          life: 3000,
          // 연사는 시간차를 두고 나가게 뒤쪽에서 출발시킨다
          delayDist: b2 * (sk.burstDelay || 0) * sk.speed / 1000,
          pierce: !!sk.pierce,
          hitSet: [],
          owner: u,
          big: true
        });
        var last = state.projectiles[state.projectiles.length - 1];
        last.x -= GAME.DetMath.cos(ang) * last.delayDist;
        last.y -= GAME.DetMath.sin(ang) * last.delayDist;
      }

    } else if (sk.type === 'strike') {
      var tgt = this.nearestEnemy(u, state.units);
      if (tgt && this.dist(u, tgt) <= u.def.range + 70) {
        u._lsMul = sk.lifestealMul || 1;
        this.applyDamage(tgt, skDmg, u, state);
        u._lsMul = 1;
        if (sk.rootMs) tgt.rootedFor = Math.max(tgt.rootedFor, sk.rootMs);
        state.effects.push({
          kind: 'beam', x1: u.x, y1: u.y, x2: tgt.x, y2: tgt.y,
          t: 220, total: 220, side: u.side
        });
      } else {
        return false;   // 대상이 없으면 쿨다운을 소모하지 않는다
      }

    } else if (sk.type === 'buff') {
      u.buffs.push({
        armorAdd: sk.armorAdd || 0,
        speedMul: sk.speedMul || 1,
        damageMul: sk.damageMul || 1,
        t: sk.duration
      });
      if (skShield) u.shield += skShield;
      if (sk.healNow) this.heal(u, sk.healNow, state);
      state.effects.push({
        kind: 'ring', x: u.x, y: u.y, r: u.def.radius + 26,
        t: 400, total: 400, side: u.side
      });

    } else if (sk.type === 'pull') {
      var halfP = (sk.coneDeg * Math.PI / 180) / 2;
      var pullHit = 0, pullLs = this._lsBudget(u);
      for (i2 = 0; i2 < state.units.length; i2++) {
        o = state.units[i2];
        if (!o.alive || o.side === u.side) continue;
        var dd = this.dist(u, o);
        if (dd > sk.dist) continue;
        var aa = GAME.DetMath.atan2(o.y - u.y, o.x - u.x);
        var df = GAME.DetMath.atan2(GAME.DetMath.sin(aa - ang), GAME.DetMath.cos(aa - ang));
        if (Math.abs(df) > halfP) continue;
        this.applyDamage(o, skDmg, u, state, { lsScale: this._ls(pullHit++), lsBudget: pullLs });
        // 영웅 쪽으로 끌어당긴다 (leash는 그대로 적용되어 진형이 무너지진 않는다)
        var pullTo = Math.max(0, dd - 120);
        this.displaceTo(o, u.x + GAME.DetMath.cos(aa) * pullTo, u.y + GAME.DetMath.sin(aa) * pullTo);
        this.clampToArena(o); this.clampToLeash(o, state);
      }
      state.effects.push({
        kind: 'slash', x: u.x, y: u.y, angle: ang,
        range: sk.dist, half: halfP, t: 260, total: 260, side: u.side
      });

    } else if (sk.type === 'trap') {
      // 마우스 위치에 설치. 사거리를 넘으면 사거리 끝에 놓인다.
      var tdx = tx - u.x, tdy = ty - u.y;
      var td = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
      var maxD = 260;
      var px2 = td > maxD ? u.x + (tdx / td) * maxD : tx;
      var py2 = td > maxD ? u.y + (tdy / td) * maxD : ty;
      state.traps.push({
        x: px2, y: py2, radius: sk.radius, damage: skDmg,
        rootMs: sk.rootMs, life: sk.life, side: u.side, owner: u
      });

    } else if (sk.type === 'aura') {
      // 구역 스킬의 초당 피해도 계수를 탄다(`_skillPower` 와 같은 규칙).
      u.auras.push({ radius: sk.radius, dps: this._skillDps(u, sk),
                     t: sk.duration, tick: 0 });
    }

    //  ── 잿가루 (2026-08-08 · 잿가루꾼) ────────────────────────────────────
    //  ⚠ '침묵'은 이 게임이 **버린 후보**다 — "무조작 0%" 약속과 정면으로 싸운다.
    //    잿가루는 못 쓰게 하는 게 아니라 **아껴 쓰게** 만든다: 스킬은 언제나 나가고,
    //    다음 것이 늦게 온다. 값은 시전 시점에 한 번만 곱해지므로, 이미 돌던 쿨다운을
    //    소급해 늘리지 않는다(뒤늦게 늘어나면 화면이 거짓말을 한다).
    var _cdb = 1;
    for (var _cb = 0; _cb < u.buffs.length; _cb++) {
      if (u.buffs[_cb].cdMul) _cdb *= u.buffs[_cb].cdMul;
    }
    u.skillCd[slot] = sk.cooldown * (u.cdrMul || 1) * _cdb;

    // 이 시전이 만든 이펙트 전부에 시전자를 표시한다(위 `_fxMark` 주석 참조).
    this._tagSkillFx(state, _fxMark, u, sk);

    // ── 축복 훅 — 스킬 시전 (towerboon.js) ────────────────────────────────
    var bk = state && state.boons;
    if (bk && u.isHero) {
      // 과부하 — 다음 기본 공격 한 방이 배로 아프다. `fire` 가 이 표시를 보고 소모한다.
      if (bk.overload) u._overload = bk.overload.mul || 2.0;
      // 메아리 — 같은 스킬을 잠시 뒤 절반 위력으로 한 번 더. 예약만 하고 실행은 update 다.
      // ⚠ 메아리가 스스로를 또 예약하면 무한 복제가 된다 → `_echoing` 중에는 안 건다.
      if (bk.echo && !state._echoing) {
        state.echoes = state.echoes || [];
        state.echoes.push({
          u: u, slot: slot, tx: tx, ty: ty,
          t: bk.echo.delay || 700, mul: bk.echo.mul || 0.5
        });
      }
    }
    return true;
  },

  _distToSegment: function (p, x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    var len2 = dx * dx + dy * dy;
    if (len2 < 0.0001) return Math.sqrt((p.x - x1) * (p.x - x1) + (p.y - y1) * (p.y - y1));
    var t = ((p.x - x1) * dx + (p.y - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    var px = x1 + t * dx, py = y1 + t * dy;
    return Math.sqrt((p.x - px) * (p.x - px) + (p.y - py) * (p.y - py));
  },

  // ── AI ──────────────────────────────────────────────────────
  // 교착 압박(pressure). 전략가가 영웅에게 한동안 피해를 못 주면 0→1 로 차오르고,
  // 그만큼 반응·추격 범위가 늘어난다. 이게 없으면 영웅이 사거리 밖에 가만히 서 있기만 해도
  // 진형이 영원히 닿지 못한다(실제로 유닛이 제자리에서 왕복하는 버그로 나타났다).
  pressureOf: function (state) {
    var idle = state.noHitFor || 0;
    if (idle <= 5000) return 0;
    return Math.min(1, (idle - 5000) / 11000);
  },

  // 압박이 가득 차면 추격·반응 범위가 **맵 전체**까지 늘어난다.
  // 곱셈으로 늘리기만 하면 상한이 유닛마다 달라서 "닿을 수 없는 구석"이 남는다.
  // 그래서 압박에 비례해 MAP_SPAN 쪽으로 직접 보간한다 —
  // 영웅이 멀리 서서 쉬는 순간 반드시 누군가 오게 만드는 장치다.
  _reach: function (base, p, pressAdd) {
    var span = GAME.CONFIG.MAP_SPAN;
    var v = base + (span - base) * p;
    return Math.min(span, v + pressAdd);
  },

  // 유닛별 '지루함' — 이 유닛이 **한 번도 싸우지 못한 채** 흘려보낸 시간(ms).
  //
  // 왜 필요한가(실측): 전역 압박(pressureOf)은 영웅이 **아무한테도** 안 맞을 때만 오른다.
  // 그래서 앞줄이 영웅과 붙어 싸우는 동안 압박은 계속 0 이고, 뒷줄은 영원히 대기했다 —
  // 4층에서 전체의 42%, 8층에서 54% 가 한 번도 교전하지 않았다(전투 끝까지).
  // 유닛 개인의 무료함으로 자기 반응 범위만 넓히면, 앞줄 교전은 그대로 두고
  // 논 유닛만 천천히 합류한다. 시작하자마자 전원 돌격하는 부작용이 없다
  // (CLAUDE.md: aggro 를 통째로 키우면 뭉텅이 돌격이 되어 영웅이 6초 만에 녹았다).
  BORED_AFTER: 4000,      // 이 시간 넘게 논 뒤부터
  BORED_FULL: 14000,      // 이 시간이면 반응 범위가 맵 끝까지
  BORED_ENGAGED: 2000,    // 교전이 시작된 뒤의 유예(ms). 0 으로 내리면 진형이 일찍 흩어진다.
  boredomOf: function (u, state) {
    var t = u.idleFor || 0;
    // 교전이 이미 시작됐으면 '지루해질 때까지 기다리는' 유예를 줄인다.
    // 전투 중인데 4초를 온전히 세고 있을 이유는 없다.
    // ⚠ 0 으로 없애면 반응 램프가 너무 빨라져 진형이 일찍 흩어진다 —
    //   수성의 탑 4층 파수꾼 방어율이 43%→33% 로 떨어졌다(rep=24 × 시드 4개, 재현됨).
    var after = (state && state.engaged) ? this.BORED_ENGAGED : this.BORED_AFTER;
    if (t <= after) return 0;
    return Math.min(1, (t - after) / (this.BORED_FULL - after));
  },

  effAggro: function (u, state) {
    var p = Math.max(this.pressureOf(state), this.boredomOf(u, state));
    var press = (state.adapt && state.adapt.press) || 0;
    // ⚠ 교전이 시작됐다고 aggro 를 넓히지 **않는다.** 시도했다가 되돌렸다:
    //   `max(aggro, chase)` 로 반응 범위를 넓히면(전사 210→270) 근접 줄이 자기 자리를
    //   일찍 떠나 각개격파당한다. 수성의 탑 4층 파수꾼 방어율 43% → 35%,
    //   영웅 간 편차 17%p → 23%p 로 **SC-3 이 깨졌다**(rep=24 × 시드 2개, 재현됨).
    //   반면 지루함 유예 단축(BORED_ENGAGED)은 같은 조건에서 43% 로 비용이 0 이었다.
    //   → "교전 태세"는 지루함 램프로만 앞당기고, 반응 반경 자체는 조율된 값을 지킨다.
    //   CLAUDE.md: "aggro 는 좁게 — 전부 한꺼번에 달려들면 뭉텅이 돌격이 된다."
    // ── 층 조건 훅 (towerrule.js) ──────────────────────────────────────────
    //  `narrow`(좁은눈) 은 반응 반경을 좁히고, `tenacious`(끈질김) 은 넓힌다.
    //  ⚠ 위 경고("aggro 를 넓히면 뭉텅이 돌격")가 여기에도 적용된다 — 그래서 끈질김의
    //    aggro 배수는 1.35 로 작게 잡고, 진짜 효과는 **추격 반경**(effChase)에 실었다.
    //    조건을 세게 하려면 chaseMul 을 올릴 것, aggroMul 은 건드리지 말 것.
    var hk = state && state.towerRule;
    var base = u.def.aggro || 300;
    if (hk && u.side === 'strategist') {
      if (hk.narrow && hk.narrow.aggroMul) base *= hk.narrow.aggroMul;
      if (hk.tenacious && hk.tenacious.aggroMul) base *= hk.tenacious.aggroMul;
    }
    return this._reach(base, p, press * 220);
  },

  // 추격(leash) 쪽 지루함은 **예전 곡선 그대로** 둔다 (4초 유예 유지).
  //
  // ⚠ 여기에 engaged 를 태우면 안 된다. 실측(rep=48, 통곡의 탑): 교전 개시로 chase 램프까지
  //   빨라지게 했더니 유닛이 자기 자리를 일찍 떠나 각개격파당했고, 숙련90 돌파율이
  //   9층 25→38 · 11층 23→29 · 19층 13→21 · 21층 13→27 로 **진형이 확실히 약해졌다.**
  //   "각자 위치를 고수"가 상위 원칙이다 — 반응 범위(effAggro)만 넓히고 이동 반경은 그대로 둔다.
  boredomChase: function (u) {
    var t = u.idleFor || 0;
    if (t <= this.BORED_AFTER) return 0;
    return Math.min(1, (t - this.BORED_AFTER) / (this.BORED_FULL - this.BORED_AFTER));
  },

  effChase: function (u, state) {
    // 지루한 유닛은 더 멀리까지 쫓아나간다(교착을 푸는 장치 — 예전 그대로다).
    var p = Math.max(this.pressureOf(state), this.boredomChase(u));
    var press = (state.adapt && state.adapt.press) || 0;
    var base = u.def.chase || GAME.CONFIG.LEASH;
    // 층 조건 `tenacious`(끈질김) — "한번 붙으면 끝까지 따라온다".
    // 이게 끌고 다니기(카이팅으로 진형을 흩는 답)를 막는 본체다.
    var hk = state && state.towerRule;
    if (hk && hk.tenacious && hk.tenacious.chaseMul && u.side === 'strategist') {
      base *= hk.tenacious.chaseMul;
    }
    return this._reach(base, p, press * 160);
  },

  _homeDist: function (u) {
    var dx = u.x - u.home.x, dy = u.y - u.home.y;
    return Math.sqrt(dx * dx + dy * dy);
  },

  // '집으로 되돌아가기'를 시작하는 거리.
  //
  // 원거리 유닛은 간격 유지(spaceRanged) 때문에 자기 자리에서 조금 밀려난다.
  // 그걸 매 프레임 되돌리면 밀어내기와 되돌리기가 서로 싸워 **제자리 진동**이 된다
  // (CLAUDE.md 의 '뱅글뱅글 도는 버그'와 같은 계열이다). 그래서 간격 한 칸만큼은
  // 허용하고, 그 밖으로 나가야만 되돌린다. 근접·고정물은 예전 그대로 10 이다.
  _holdSlack: function (u) {
    var s = u.def.spacing || 0;
    return s > 0 ? Math.max(10, s * 0.9) : 10;
  },

  // 교전 태세의 **전진 초소** — 자기 chase 반경 안에서 목표에 가장 가까운 지점.
  //
  // 왜 필요한가(실측): 원거리 유닛은 `reachable`(= 목표가 chase - range/2 안에 있는가)이
  // 사실상 항상 거짓이라 **한 번도 추격 상태가 되지 않는다**. 궁수는 chase 150 · range 330 이라
  // 조건이 150-165 = -15 로 음수다. 그래서 사거리 밖의 영웅을 향해 아무것도 하지 않고
  // 집에 서 있었다 — 이게 '노는 유닛'의 정체다(4층 33%, 8층 31%).
  //
  // 그렇다고 추격을 풀면 진형이 통째로 돌격한다. 그래서 **자기 반경의 일부까지만 나가 서게** 한다.
  // 목표가 집에서 이미 사거리 안이면 집 그대로다(움직일 이유가 없다).
  //
  // ⚠⚠ POST_ADVANCE 는 **0 = 끔** 이 기본값이다. 왜 껐는지 반드시 읽을 것.
  //
  // 이 장치를 켜면 '노는 유닛'은 확실히 사라진다(교전 후 대기 비율 4층 33%→8%, 8층 32%→8%,
  // 20층 26%→7%, rep=36). 그런데 **같은 장치가 "4층부터는 배치 없이는 진다"는 약속을 깬다.**
  //
  //   수성의 탑 무배치 방어율 (4층, rep=96, 시드 20260728/777/4242)
  //     끔            4% /  3% /  2%   (평균 3.0)   ← SC-4 기준 ≤10% 를 여유 있게 통과
  //     0.15 켬       8% / 15% /  8%
  //     0.25 켬       7% / 15% /  7%
  //     0.45 켬       7% / 15% /  6%   (평균 9.3, 시드 777 은 SC-4 실패)
  //     0.90 켬       8% / 14% /  6%
  //
  // **거리를 줄여도 값이 안 내려간다** — 즉 문제는 '얼마나 나가느냐'가 아니라
  // '노는 유닛이 스스로 자리를 고쳐도 되느냐'라는 이분법이다. 유닛이 자기 위치를 보정해 주면
  // 아무렇게나 놓은 진형도 알아서 진형이 되고, 그만큼 **배치라는 실력 축이 죽는다.**
  // 근접 제외·기본 chase 한도·'한 걸음이면 닿는 경우만' 세 가지 안전장치를 다 걸어도 그대로였다.
  //
  // 그래서 기본은 끄고 장치만 남긴다. 켜려면 이 값 하나만 0.45 로 바꾸면 되고,
  // 바꾸는 순간 위 표의 비용을 지불하는 것이다(SC-4 재측정 필수).
  POST_ADVANCE: 0,
  POST_REACH: 0.5,      // '한 걸음이면 닿는다'의 기준 — 사거리의 이 비율만큼 모자란 경우까지만

  // 전진 초소를 쓸 수 있는 유닛 = **사거리가 추격 반경보다 긴 유닛**(궁수·투창병·투석꾼·늪지기·족장).
  // 이들만 `reachable` 이 구조적으로 항상 거짓이라 영원히 대기한다.
  //
  // ⚠ 근접(전사 range 52 < chase 270)은 제외한다. 근접은 원래 정상적으로 추격하므로
  //   전진 초소가 필요 없고, 넣었더니 **근접 줄 전체가 앞으로 밀려나 뭉텅이 돌격**이 됐다.
  //   실측(무배치 방어 4층, rep=96 × 시드 3개): 근접 포함 시 3.0% → 10~13% 로 뛰어
  //   "4층부터는 배치 없이는 진다"는 약속이 깨졌다 — 아무렇게나 놓아도 알아서 진형을 만든다.
  _canPost: function (u) {
    return (u.def.range || 0) > (u.def.chase || 0);
  },

  _postPoint: function (u, tgt, chase) {
    if (!this.POST_ADVANCE) return u.home;      // 기본값 0 — 위 주석 참조
    if (!tgt || !u.home || !this._canPost(u)) return u.home;
    var dx = tgt.x - u.home.x, dy = tgt.y - u.home.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.001) return u.home;
    var need = d - (u.def.range || 0) * 0.9;    // 이만큼 나가면 사거리에 든다
    if (need <= 0) return u.home;
    // **한 걸음이면 닿는 유닛만** 나선다. 이보다 멀면 그건 노는 게 아니라 자리를 잘못 잡은 것이고,
    // 그걸 유닛이 스스로 고쳐 주면 '배치'라는 실력 축이 죽는다(무배치 방어율이 그대로 오른다).
    if (need > (u.def.range || 0) * this.POST_REACH) return u.home;
    // ⚠ 한도는 **def.chase(기본 반경)** 다 — effChase 를 쓰면 안 된다.
    //   effChase 는 지루함/압박으로 MAP_SPAN 까지 부풀어서, 0.45 를 곱해도 675px 짜리
    //   맵 횡단이 된다(실측: 4층 무배치 방어 3.0% → 9.7%, 시드에 따라 16%).
    //   교착을 푸는 일은 지루함 경로(stance='chase')가 이미 맡고 있다. 여기는 자리 지키기다.
    var lim = (u.def.chase || GAME.CONFIG.LEASH) * this.POST_ADVANCE;
    var out = Math.min(need, lim);
    return { x: u.home.x + (dx / d) * out, y: u.home.y + (dy / d) * out };
  },

  // ── 원거리 간격 유지 ────────────────────────────────────────────────────
  // 근접은 뭉쳐도 된다(벽이 되는 게 일이다). 원거리는 뭉치면 **광역 한 방에 몰살**한다.
  // 같은 진영 원거리끼리 def.spacing 보다 가까우면 서로 밀어내되,
  // **집에서 더 멀어지는 방향은 쓰지 않는다** — 밀어내기가 진형을 흩뜨리면 안 되므로
  // 이미 간격 한 칸 밖에 나가 있는 유닛은 접선(집까지의 거리를 유지하는) 성분만 쓴다.
  SPACING_PUSH: 0.5,     // 이동속도 대비 밀어내기 속도(무차원). 집으로 끌리는 힘보다 약하게 둔다.
  spaceRanged: function (state, dt) {
    var us = state.units, i, j;
    for (i = 0; i < us.length; i++) {
      var a = us[i];
      if (!a.alive || !a.def.spacing || a.def.immobile) continue;
      if (a.isHero || a.manual || a.rootedFor > 0 || this.isHazard(a)) continue;

      var px = 0, py = 0, n = 0;
      for (j = 0; j < us.length; j++) {
        var b = us[j];
        if (i === j || !b.alive || b.side !== a.side || !b.def.spacing) continue;
        var dx = a.x - b.x, dy = a.y - b.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        var want = Math.max(a.def.spacing, b.def.spacing);
        if (d >= want) continue;
        if (d < 0.001) { dx = 1; dy = 0; d = 1; }   // 완전히 겹쳤으면 임의 축으로 뗀다
        var w = (want - d) / want;                  // 가까울수록 세게
        px += (dx / d) * w; py += (dy / d) * w; n++;
      }
      if (!n) continue;

      var pl = Math.sqrt(px * px + py * py);
      if (pl < 0.0001) continue;
      px /= pl; py /= pl;

      // 집에서 멀어지는 성분 제거 (이미 간격 한 칸 밖이면)
      var hx = a.x - a.home.x, hy = a.y - a.home.y;
      var hd = Math.sqrt(hx * hx + hy * hy);
      if (hd > a.def.spacing && hd > 0.001) {
        var out = (px * hx + py * hy) / hd;         // 바깥(집 반대) 방향 성분
        if (out > 0) {
          px -= (hx / hd) * out; py -= (hy / hd) * out;
          var pl2 = Math.sqrt(px * px + py * py);
          if (pl2 < 0.0001) continue;               // 바깥 말고 갈 곳이 없으면 안 움직인다
          px /= pl2; py /= pl2;
        }
      }

      var step = this.effSpeed(a) * dt * this.SPACING_PUSH;
      a.x += px * step; a.y += py * step;
      this.clampToArena(a);
      // 시선은 건드리지 않는다 — 간격 조정은 '이동'이 아니라 자세 잡기다.
    }
  },

  // ── 호위 역할 (토대) ───────────────────────────────────────────────────
  // u.protectRole 이 'ranged'/'melee' 면 그 부류의 아군과 적 사이에 끼어 선다.
  // 반환 true 면 이번 프레임 이동을 여기서 처리했다는 뜻.
  //
  // ⚠ 지금은 **아무 유닛도 이 값을 갖고 있지 않다**(units.js 기본값 없음).
  //   나중에 js/learn.js 가 관측을 근거로 u.protectRole 을 써넣으면 그때부터 작동한다.
  //   여기서 학습을 판단하지 않는다 — 자리만 만들어 둔 것이다.
  runProtect: function (u, state, dt) {
    if (!u.protectRole || u.side !== 'strategist' || u.rootedFor > 0) return false;
    if (u.def.immobile || this.isHazard(u)) return false;

    var want = u.protectRole, best = null, bestD = Infinity, i;
    for (i = 0; i < state.units.length; i++) {
      var al = state.units[i];
      if (!al.alive || al.side !== u.side || al === u || this.isHazard(al)) continue;
      if (this._roleOf(al) !== want) continue;
      var d = this.dist(u, al);
      if (d < bestD) { bestD = d; best = al; }
    }
    if (!best) return false;

    var foe = this.nearestEnemy(best, state.units);
    if (!foe) return false;

    // 지킬 대상과 적을 잇는 선 위, 대상 바로 앞에 선다
    var ax = foe.x - best.x, ay = foe.y - best.y;
    var ad = Math.sqrt(ax * ax + ay * ay) || 1;
    // 기본 간격은 **자기 반지름**에서 뽑는다(radius 는 scaleDef 가 이미 화면에 맞게 줄인 값).
    // 여기에 상수 26 같은 raw 값을 쓰면 폰 프로필에서만 조용히 어긋난다 —
    // 그래서 def.protectGap 은 DIST_KEYS 에 등록해 두었고, 폴백은 아예 스케일된 값을 쓴다.
    var gap = (u.def.protectGap || u.def.radius * 2) + best.def.radius + u.def.radius;
    var tx = best.x + (ax / ad) * gap, ty = best.y + (ay / ad) * gap;

    // 자기 추격 반경 밖으로는 나가지 않는다 (진형 이탈 금지)
    var chase = this.effChase(u, state);
    var gx = tx - u.home.x, gy = ty - u.home.y;
    var gd = Math.sqrt(gx * gx + gy * gy);
    if (gd > chase) { tx = u.home.x + (gx / gd) * chase; ty = u.home.y + (gy / gd) * chase; }

    if (this.dist(u, { x: tx, y: ty }) <= 8) return false;   // 이미 제자리면 평소 행동
    this.moveToward(u, tx, ty, this.effSpeed(u) * dt);
    return true;
  },

  _roleOf: function (u) {
    var d = u.def;
    if (d.attack === 'melee') return 'melee';
    if (d.attack === 'none' || !d.range) return null;
    return d.range > 150 ? 'ranged' : 'melee';
  },

  // 전략가 유닛의 진형 이탈/복귀 판정.
  // 반환값이 false면 이번 프레임은 이동만 처리했고 교전하지 않는다.
  //
  // 중요: stance 가 **이동을 실제로 통제**해야 한다. 예전 구현은 stance 와 무관하게
  // 항상 가장 가까운 적을 향해 걸어가서, leash 가 되돌리는 진자운동이 생겼다.
  updateStance: function (u, state, dt) {
    //  ⚠ 영웅은 stance(hold/chase/return) 대상이 아니다 — 실시간 대전에서 손님
    //  영웅이 'strategist' 팀 라벨을 달게 되면서(2026-08-21) 교전 전 "자리 지키기"에
    //  붙잡혀 이동 명령이 통째로 무시됐다(실측: 스폰 좌표에서 한 발도 못 움직임).
    if (u.side !== 'strategist' || u.isHero) return true;

    // 지루함 누적/해제 — 사거리 안에 적이 있으면(=싸울 수 있으면) 논 게 아니다.
    // 고정물(쇠뇌 진지·지뢰)도 사거리로 판단한다: 못 쏘고 있으면 지루한 게 맞지만
    // 움직일 수 없으니 aggro 만 넓어져 '사각지대'가 줄어든다.
    var nearEnemy = this.nearestEnemy(u, state.units);
    var nearD = nearEnemy ? this.dist(u, nearEnemy) : Infinity;
    var canFight = nearEnemy && nearD <= (u.def.range || 0) + 4;
    if (canFight) u.idleFor = 0;
    else u.idleFor = (u.idleFor || 0) + dt * 1000;

    // 교전 개시 판정 ②: 영웅이 어떤 유닛의 반응 범위 안에 들어왔다.
    // def.aggro 를 쓰는 이유 — 이미 진형별로 조율된 '이 유닛이 반응하는 거리'이고,
    // 고정물(쇠뇌 aggro 0)·가시덫은 자연히 빠진다. 쇠뇌가 맵 끝에서 쏘는 것만으로
    // 교전이 시작되면 대기 구간이 통째로 사라지기 때문이다(사거리로 판정하면 그렇게 된다).
    if (!state.engaged && nearEnemy && (u.def.aggro || 0) > 0 && nearD <= u.def.aggro) {
      state.engaged = true;
      state.engagedAt = state.elapsed;
    }

    if (u.def.immobile) { u.stance = 'hold'; return true; }

    // 교전 전에는 **자리를 지키며 쉰다.** 마중 나가지 않는다.
    // 사거리 안에 적이 있으면 쏘기는 한다(그 순간 위에서 engaged 가 켜진다).
    if (!state.engaged) {
      u.stance = 'hold';
      if (this._homeDist(u) > this._holdSlack(u)) {
        this.moveToward(u, u.home.x, u.home.y, this.effSpeed(u) * dt);
      }
      return !!canFight;
    }

    var dxh = u.x - u.home.x, dyh = u.y - u.home.y;
    var fromHome = Math.sqrt(dxh * dxh + dyh * dyh);
    var chase = this.effChase(u, state);
    var aggro = this.effAggro(u, state);

    if (u.restFor > 0) u.restFor -= dt * 1000;

    if (u.stance === 'return') {
      if (fromHome <= 8) {
        u.stance = 'hold';
        u.restFor = 900;         // 돌아온 직후엔 잠시 쉰다 (즉시 재출격 = 진동)
        return true;
      }
      this.moveToward(u, u.home.x, u.home.y, this.effSpeed(u) * dt);
      return false;
    }

    var tgt = this.nearestEnemy(u, state.units);
    if (!tgt) { u.stance = 'hold'; return true; }

    // ── 한 번 쫓기로 했으면 끝까지 쫓는다 (2026-07-29, 사용자 지시) ────────────
    // 예전 규칙: 집에서 chase 를 넘으면 무조건 복귀. 그래서 유닛이 쫓다 말고 돌아서고,
    //   영웅이 다시 다가오면 또 나오는 **왕복 운동**이 생겼다. 보기에도 이상하고
    //   "왜 쫓다 마는가"라는 신고로 이어졌다.
    // 새 규칙: `committed` 가 서면 복귀 판정도 리시도 적용하지 않는다.
    //   진입은 여전히 좁게 막는다(아래 inAggro/reachable) — 그래서 진형 전체가
    //   한꺼번에 뛰쳐나가지는 않고, **영웅 근처에 있던 놈만** 물고 늘어진다.
    // ⚠ CLAUDE.md 경고("chase 를 늘리면 뭉텅이 돌격이 되어 영웅이 6초에 녹는다")는
    //   여전히 유효하다. 다만 그 경고는 **진입 조건**을 넓히는 경우의 이야기이고,
    //   여기서 푸는 것은 **이탈 조건**이다. 진입은 그대로 좁다.
    if (!u.committed && fromHome >= chase) {
      //  영웅을 쫓다 여기서 접는다 — '못 잡겠다' 대사 후보(한 유닛당 한 번만).
      if (u.side === 'strategist' && u._spotAt !== undefined && !u._gaveUp &&
          tgt && tgt.isHero) {
        u._gaveUp = true;
        this._banterEv(state, u, 'giveup');
      }
      u.stance = 'return'; return false;
    }

    // '집에서 갈 수 있는 거리 안에 있는 적'만 쫓는다.
    // 닿을 수 없는 적을 쫓으면 나갔다 돌아오기를 반복할 뿐이다.
    var tgtFromHome = Math.sqrt((tgt.x - u.home.x) * (tgt.x - u.home.x) +
                                (tgt.y - u.home.y) * (tgt.y - u.home.y));
    var reachable = tgtFromHome <= chase - u.def.range * 0.5;
    var inAggro = this.dist(u, tgt) <= aggro;

    if (u.committed) { u.stance = 'chase'; }
    else if (u.restFor > 0) { u.stance = 'hold'; }
    else if (inAggro && reachable) { u.stance = 'chase'; u.committed = true; }
    else { u.stance = 'hold'; }

    // 대기 상태면 자기 자리를 지킨다 — 밀려났으면 돌아온다.
    // 교전이 시작된 뒤에는 '자리'가 집이 아니라 **전진 초소**다(자기 반경 안, 노는 것 방지).
    if (u.stance === 'hold') {
      var post = state.engaged ? this._postPoint(u, tgt, chase) : u.home;
      var pdx = u.x - post.x, pdy = u.y - post.y;
      if (Math.sqrt(pdx * pdx + pdy * pdy) > this._holdSlack(u)) {
        this.moveToward(u, post.x, post.y, this.effSpeed(u) * dt);
      }
      // 사거리 안에 적이 있으면 제자리에서 쏜다 (아래 runAI 가 처리)
      return this.dist(u, tgt) <= u.def.range;
    }
    return true;
  },

  // ── 유닛 능력 (2026-07-29) ─────────────────────────────────────────────────
  // 사용자 신고: "궁수로는 그냥 뺑뺑이만 돌리다 방패병만 남는다. 보스도 뺑뺑이로 끝났다."
  // 계측(`tools/kite-audit.js`)이 확인했다 — 사냥꾼은 전투의 **48%** 동안 아무도 그를
  // 때릴 수 없었다(광전사 7% · 파수꾼 2%). 보스 속도 78~96 대 사냥꾼 178 이라
  // **구조적으로 못 잡는다.** 체력을 올리는 건 답이 아니다(꼬리만 길어진다) —
  // 필요한 건 '거리를 지우는 수단'과 '피할 수 있는 위협'이다.
  //
  // 규율 셋:
  //   1. **반드시 예고한다.** 예고 없는 순간이동 피해는 조작이 아니라 사고다.
  //      예고를 보고 움직이면 피해진다 = 그게 곧 조작할 거리다.
  //   2. **멀 때만 쓴다**(minRange). 붙어 있는데 돌진하면 뒤로 지나쳐 더 우스워진다.
  //   3. 시전 중에는 다른 행동을 안 한다 — 예고와 실제가 어긋나면 피할 수가 없다.
  //
  // 반환 true = 이번 프레임은 능력이 가져갔다(이동·공격 생략).
  // ── 스킬을 **두 개 이상** 가질 수 있다 (2026-08-02 사용자 지시) ───────────────
  //  "차라리 한방스킬도 있되 그건 노력만하면 피할수있게끔 미리 경고를 하거나 해줘."
  //  한 유닛이 '자주 나가는 작은 것'과 '가끔 나가는 큰 것'을 같이 가지려면 스킬이
  //  둘이어야 한다. `def.abilities` 배열이 있으면 **번갈아** 쓴다.
  //  ⚠ `def.ability`(단수)만 있는 기존 유닛은 이 함수가 예전과 **완전히 동일**하게
  //    돈다 — opt-in 이라 회귀 위험이 없다(`slowMul`·`knockback` 과 같은 패턴).
  //  ⚠ 시전 중에는 **그때 고른 스킬을 계속 붙잡는다.** 매 프레임 다시 고르면
  //    예고와 실제 폭발이 서로 다른 스킬이 되어 "피할 수가 없다" — 이 파일이
  //    이미 규율로 적어 둔 "예고와 실제가 어긋나면 못 피한다"의 정확한 사례다.
  _abilityOf: function (u) {
    var list = u.def.abilities;
    if (!list || !list.length) return u.def.ability;
    if (u.abilT > 0 && u._abilCur) return u._abilCur;
    return list[(u._abilIdx || 0) % list.length];
  },

  //  ── 이 능력이 만드는 이펙트 전부에 `motif`/`owner` 를 붙인다 (2026-08-07) ──────
  //  `castSkill` 이 이미 쓰는 패턴 그대로다(그 주석: "이펙트마다 손으로 `motif:` 를 달지
  //  않는다 — 12곳이 넘어서 하나라도 빠지면 그 스킬만 조용히 무채색이 된다").
  //  능력 쪽도 push 자리가 여섯이라 같은 사고가 난다.
  //  ⚠ `owner` 를 같이 싣는 이유: 렌더가 "누가 쓴 능력인가"를 알아야 포효(warcry)를
  //    회복(healBurst)과 다르게 그릴 수 있다. 예고에는 이미 있었는데 나머지에 없었다.
  //  ⚠ **판정·피해·쿨에는 아무 영향이 없다.** 이펙트 객체에 필드 두 개가 더 붙을 뿐이다.
  _withAbilFx: function (state, u, ab, fn) {
    var mo = ab && ab.motif;
    var p0 = state.effects.push;
    state.effects.push = function (o) {
      if (o) {
        if (mo && o.motif === undefined) o.motif = mo;
        if (o.owner === undefined) o.owner = u;
      }
      return p0.apply(this, arguments);
    };
    try { return fn(); } finally { state.effects.push = p0; }
  },

  runAbility: function (u, state, dt) {
    var ab = this._abilityOf(u);
    if (!ab) return false;
    var dtMs = dt * 1000;

    if (u.abilCd === undefined) { u.abilCd = ab.cooldown * (0.35 + GAME.Combat.rand() * 0.5); u.abilT = 0; }
    if (u.abilCd > 0) u.abilCd -= dtMs;

    // 시전 중 — 예고가 끝나면 터뜨린다
    if (u.abilT > 0) {
      u.abilT -= dtMs;
      if (u.abilT <= 0) {
        var self0 = this;
        this._withAbilFx(state, u, ab, function () { self0._execAbility(u, state, ab); });
      }
      return true;
    }
    if (u.abilCd > 0 || u.rootedFor > 0) return false;

    var tgt = this.nearestEnemy(u, state.units);
    if (!tgt) return false;
    var d = this.dist(u, tgt);
    // ⚠ 돌진은 **닿을 수 있을 때만** 쓴다. maxRange 를 dist 보다 크게 잡았더니
    //   목표 앞에서 멈춰 아무도 못 치는 돌진이 됐다 — 실측: 400회 발동에 11회 명중(3%),
    //   무조작 영웅에게는 **0%**(초보가 더 안 맞는다는 건 기제가 안 도는 것이다).
    //   여기서 한 번 더 막아, 유닛 정의에서 실수해도 헛돌진이 나가지 않게 한다.
    //  ── 후보 순환 (2026-08-23 보스 궁극기) ─────────────────────────────────
    //  복수 능력에서 이번 차례 능력이 사거리 게이트에 막히면 **다음 능력을 본다.**
    //  안 그러면 돌진(minRange 150)이 첫 번째인 보스에게 영웅이 붙어 있는 동안
    //  차례가 영원히 안 넘어가 궁극기가 한 번도 안 나간다(실측 — 시전 0회 교착).
    var list0 = u.def.abilities;
    if (list0 && list0.length) {
      var start0 = (u._abilIdx || 0) % list0.length, picked0 = -1;
      for (var ci0 = 0; ci0 < list0.length; ci0++) {
        var cand0 = list0[(start0 + ci0) % list0.length];
        if (d < (cand0.minRange || 0) || d > (cand0.maxRange || Infinity)) continue;
        if (cand0.type === 'charge' && d > cand0.dist) continue;
        ab = cand0; picked0 = (start0 + ci0) % list0.length; break;
      }
      if (picked0 < 0) return false;
      u._abilPicked = picked0;
    } else {
      if (d < (ab.minRange || 0) || d > (ab.maxRange || Infinity)) return false;
      if (ab.type === 'charge' && d > ab.dist) return false;
    }

    u.abilCd = ab.cooldown;
    u.abilT = ab.telegraph;
    //  스킬 시전도 사건이다 — 첫 시전이 영웅을 향하면 그게 곧 발견이고,
    //  이미 발견한 뒤라면 '스킬 쓴다' 대사 후보가 된다(battle.js 가 소비).
    if (u.side === 'strategist' && state) {
      if (tgt.isHero && u._spotAt === undefined) {
        u._spotAt = state.elapsed;
        this._banterEv(state, u, 'spot');
      } else this._banterEv(state, u, 'skill');
    }
    // 이번 시전이 어느 스킬이었는지 붙잡아 두고(예고↔폭발 일치), 다음은 그 다음 것.
    // (후보 순환으로 건너뛴 경우 _abilPicked 가 실제 시전 칸이다)
    if (u.def.abilities && u.def.abilities.length) {
      u._abilCur = ab;
      var castIdx = (u._abilPicked !== undefined) ? u._abilPicked : (u._abilIdx || 0);
      u._abilIdx = (castIdx + 1) % u.def.abilities.length;
      u._abilPicked = undefined;
    }
    // ── 예측 사격 (2026-07-31, 뺑뺑이의 **진짜 원인**을 고친다) ────────────────
    //  ⚠ 여기가 "22층인데 뺑뺑이만 돌리면 깨진다"의 구조적 원인이었다.
    //    예고를 **대상의 현재 위치**에 박으면, 대상이 예고 시간 동안 이동한 거리가
    //    폭발 반경보다 크면 **등속으로 도망치기만 해도 절대 안 맞는다.**
    //    실측: 궁수 예고 640ms × 사냥꾼 속도 158 = **101px 이동** vs 반경 72 → 항상 빗나감.
    //    화력·체력을 아무리 올려도 닿지를 못하니 의미가 없었다.
    //
    //  → 대상의 **진행 방향으로 미리 쏜다.** `aimLead` 는 유닛별 계수(0=예전과 동일).
    //    이러면 컨트롤러는 예고가 뜰 때마다 **방향을 꺾어야** 한다. 꺾을 때마다 진행
    //    성분을 잃으므로 실효 속도가 158 아래로 떨어진다 — 스탯을 한 줄도 안 건드리고
    //    "영웅이 제일 빠르다"를 상황 의존적으로 해소한다. 잘 꺾는 사람은 여전히 빠르다.
    //
    //  ⚠ `aimLead` 는 **무차원 계수라 `DIST_KEYS` 에 넣으면 안 된다.** 넣으면 세로
    //    (WORLD_SCALE 0.636)에서만 리드가 0.64배로 조용히 약해진다.
    u.abilX = tgt.x; u.abilY = tgt.y;          // 기본 = 예고 시점의 자리(예전과 동일)
    var lead = ab.aimLead || 0;
    if (lead > 0 && tgt._px !== undefined) {
      var vx = tgt.x - tgt._px, vy = tgt.y - tgt._py;
      var vlen = Math.sqrt(vx * vx + vy * vy);
      if (vlen > 0.01) {                        // 멈춰 있으면 리드하지 않는다
        var sp = this.effSpeed(tgt);            // 프레임 이동량이 아니라 초당 속도를 쓴다
        var lt = (ab.telegraph || 0) / 1000;
        u.abilX = tgt.x + (vx / vlen) * sp * lt * lead;
        u.abilY = tgt.y + (vy / vlen) * sp * lt * lead;
        // 아레나 밖으로 나가면 벽 뒤에 떨어져 아무도 안 맞는다 — 안으로 물린다.
        // ⚠ `clampToArena` 는 **유닛**을 받는다(`u.def.radius` 를 읽는다). 좌표만 넘기면
        //   `Cannot read properties of undefined (reading 'radius')` 로 **전투 루프가 죽는다.**
        //   실제로 그렇게 짰다가 잡았다 — 예측 사격이 켜지는 순간 게임이 멈추는 버그였다.
        //   여기서는 점 하나를 물리는 것뿐이므로 아레나 경계를 직접 쓴다.
        var AR = GAME.CONFIG.ARENA;
        if (AR) {
          var pad = ab.radius || 60;
          u.abilX = Math.max(AR.x + pad * 0.5, Math.min(AR.x + AR.w - pad * 0.5, u.abilX));
          u.abilY = Math.max(AR.y + pad * 0.5, Math.min(AR.y + AR.h - pad * 0.5, u.abilY));
        }
      }
    }
    this.faceAttack(u, GAME.DetMath.atan2(u.abilY - u.y, u.abilX - u.x));
    state.effects.push({
      //  ⚠ `pull` 도 **제 자리에서** 퍼진다(덩굴채). 여기 안 넣으면 예고 원이
      //    `u.abilX`(=조준점) 에 떠서 "저기서 온다"고 거짓말을 한다.
      kind: 'telegraph',
      x: (ab.type === 'shockwave' || ab.type === 'pull') ? u.x : u.abilX,
      y: (ab.type === 'shockwave' || ab.type === 'pull') ? u.y : u.abilY,
      r: ab.radius || 60, t: ab.telegraph, total: ab.telegraph, side: u.side,
      // 재료(js/skillfx.js MOTIF_MAT). 없으면 예전처럼 기본 팔레트다.
      motif: ab.motif,
      // 용 보스 원소색 구분(js/scenes/battle.js `bossGlowOf`)이 시전자를 찾을 수
      // 있도록 싣는다 — barrage 가 실제로 터질 때 만드는 예고(_execAbility)는
      // 이미 owner 를 싣고 있었는데, 이 '예고 중' 미리보기 예고에는 없었다.
      owner: u
    });
    return true;
  },

  _execAbility: function (u, state, ab) {
    var i, o, hit = 0, ls = this._lsBudget(u);
    var self = this;
    function bite(o2, extraKnock) {
      // `abil: true` 는 계측용 표식이다 — 능력 피해가 보호막에 흡수되면 체력 비교로는
      // 안 잡혀서 '능력이 안 맞는다'로 오독하게 된다(실제로 그렇게 오독했다).
      self.applyDamage(o2, ab.damage, u, state,
                       { lsScale: self._ls(hit++), lsBudget: ls, abil: true });
      var kb = extraKnock === undefined ? ab.knockback : extraKnock;
      if (kb && o2.alive) {
        var dd = self.dist(u, o2);
        if (dd > 0.1) {
          self.displace(o2, ((o2.x - u.x) / dd) * kb, ((o2.y - u.y) / dd) * kb);
          self.clampToArena(o2); self.clampToLeash(o2, state);
        }
      }
    }

    if (ab.type === 'charge') {
      // 예고한 지점까지 **직선으로 밀고 들어간다.** 경로에 걸린 적을 친다.
      var dx = u.abilX - u.x, dy = u.abilY - u.y;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      var go = Math.min(ab.dist, d);
      var fx = u.x, fy = u.y;
      u.x += (dx / d) * go; u.y += (dy / d) * go;
      this.clampToArena(u);
      // 리시는 일부러 적용하지 않는다 — 돌진은 '진형을 깨고 나가는' 행동이고,
      // 다음 프레임부터 stance/clampToLeash 가 알아서 데려온다.
      for (i = 0; i < state.units.length; i++) {
        o = state.units[i];
        if (!o.alive || o.side === u.side || this.isHazard(o)) continue;
        if (this._distToSegment(o, fx, fy, u.x, u.y) <= (ab.radius || 55) + o.def.radius) bite(o);
      }
      state.effects.push({ kind: 'dashTrail', x1: fx, y1: fy, x2: u.x, y2: u.y,
                           t: 300, total: 300, side: u.side });

    } else if (ab.type === 'shockwave') {
      for (i = 0; i < state.units.length; i++) {
        o = state.units[i];
        if (!o.alive || o.side === u.side || this.isHazard(o)) continue;
        if (this.dist(u, o) <= ab.radius + o.def.radius) bite(o);
      }
      state.effects.push({ kind: 'ring', x: u.x, y: u.y, r: ab.radius,
                           t: 380, total: 380, side: u.side });

    } else if (ab.type === 'healBurst') {
      // 약초꾼 — 주변 아군을 한 번에 크게 회복. 공격하지 않는 유닛이라 피해 스킬은
      // 정체성을 깬다. 대신 "약초꾼을 먼저 끊어야 한다"는 처치 순서를 강제한다.
      for (i = 0; i < state.units.length; i++) {
        o = state.units[i];
        if (!o.alive || o.side !== u.side || this.isHazard(o)) continue;
        if (this.dist(u, o) > ab.radius) continue;
        if (ab.heal) this.heal(o, ab.heal, state);
        //  ── 선불 방어 (2026-08-08 · 껍질장이) ────────────────────────────
        //  ⚠ 회복(사후)과 **축이 다르다**: 보호막은 맞기 **전에** 깎는다. 그래서
        //    영웅의 한 방 버스트가 무효가 되고 두 박자로 나눠 쳐야 한다.
        //  ⚠ 버프 시스템의 태그 패턴을 그대로 쓴다(warcry·healCut 과 같은 모양).
        //    중복 시전은 **더 큰 값으로 갱신**한다 — 쌓이면 무적이 된다.
        if (ab.shield > 0) {
          var sdup = false;
          for (var si = 0; si < o.buffs.length; si++) {
            if (o.buffs[si].shieldTag) {
              o.buffs[si].shield = Math.max(o.buffs[si].shield, ab.shield);
              o.buffs[si].t = ab.shieldMs || 6000; sdup = true; break;
            }
          }
          if (!sdup) o.buffs.push({ shield: ab.shield, t: ab.shieldMs || 6000, shieldTag: true });
          //  ⚠ **보호막도 '되돌린 양'이다.** 회복만 세면 껍질장이가 아무리 막아 줘도
          //    관측이 0 이라 "진형이 계속 버틴다"는 가설이 안 선다 — 껍질장이가
          //    학습의 눈에 안 보이는 유닛이 되어 버린다.
          if (state && state.telemetry && o.side === 'strategist') {
            state.telemetry.strategistHealed += ab.shield;
          }
        }
      }
      // ── 같은 연기가 **적에게는 상처**로 간다 (2026-08-02) ──────────────
      //  약초꾼에게 새 유닛을 만들어 붙이는 대신 **이미 있는 스킬의 반대편**을
      //  쓴다. CLAUDE.md 가 경고하는 "새 유닛은 아트·밸런스·팔레트·AI 가중치를
      //  다 늘리고도 결국 체력 많은 전사가 된다"를 피하면서, 흡혈의 답을
      //  "약초꾼을 먼저 끊어라"라는 **처치 순서**로 만든다 — 이 폴더가 정예에
      //  쓴 것과 같은 설계다.
      if (ab.enemyHealCut > 0) {
        for (i = 0; i < state.units.length; i++) {
          o = state.units[i];
          if (!o.alive || o.side === u.side || this.isHazard(o)) continue;
          if (this.dist(u, o) <= ab.radius) {
            if (this.applyHealCut(o, ab.enemyHealCut, ab.enemyHealCutMs || 4000)) {
              state.telemetry.healCuts = (state.telemetry.healCuts || 0) + 1;
            }
          }
        }
      }
      state.effects.push({ kind: 'healPulse', x: u.x, y: u.y, r: ab.radius,
                           t: 420, total: 420, side: u.side });

    } else if (ab.type === 'warcry') {
      // 족장 — 주변 아군에게 **일시적** 공격 버프. 상시 버프(buffDamageMul)가 정체성이라
      // 그것을 잠깐 크게 키운다. 그 몇 초가 진형의 화력 정점이고, 붙어 있으면 위험하다.
      for (i = 0; i < state.units.length; i++) {
        o = state.units[i];
        if (!o.alive || o.side !== u.side || this.isHazard(o)) continue;
        if (this.dist(u, o) > ab.radius) continue;
        var dup = false;
        for (var wi = 0; wi < o.buffs.length; wi++) {
          if (o.buffs[wi].warcryTag) { o.buffs[wi].t = ab.ms || 4000; dup = true; break; }
        }
        if (!dup) o.buffs.push({ damageMul: ab.dmgMul || 1.6, t: ab.ms || 4000, warcryTag: true });
      }
      state.effects.push({ kind: 'ring', x: u.x, y: u.y, r: ab.radius,
                           t: 420, total: 420, side: u.side });

    } else if (ab.type === 'ember') {
      //  불씨꾼 — 던진 자리에 불을 남긴다. 예고 지점(`abilX/Y`)에 심으므로 이 게임의
      //  계약("논타겟은 보고 피할 수 있다")은 그대로다: 예고를 보고 비키면 안 맞고,
      //  대신 **비킨 그 자리를 몇 초간 못 쓴다.**
      //  ⚠ 동시에 남는 수에 상한을 둔다. 없으면 후반에 바닥이 통째로 불바다가 되어
      //    영웅이 '피할 곳'을 잃는다 — 그건 난이도가 아니라 고장이다.
      if (!state.emberZones) state.emberZones = [];
      var cap = ab.maxZones || 3;
      var mine2 = 0;
      for (var mz = 0; mz < state.emberZones.length; mz++) {
        if (state.emberZones[mz].owner === u) mine2++;
      }
      if (mine2 >= cap) {
        for (var dz = 0; dz < state.emberZones.length; dz++) {
          if (state.emberZones[dz].owner === u) { state.emberZones.splice(dz, 1); break; }
        }
      }
      state.emberZones.push({ x: u.abilX, y: u.abilY, r: ab.radius,
                              t: ab.ms || 5000, tick: 0, dps: ab.dps || 26,
                              side: u.side, owner: u });
      state.effects.push({ kind: 'ring', x: u.abilX, y: u.abilY, r: ab.radius,
                           t: 320, total: 320, side: u.side });

    } else if (ab.type === 'ashcloud') {
      //  잿가루꾼 — `warcry`(족장)의 **거울**이다: 같은 모양의 태그 버프를 같은 방식으로
      //  밀어넣되, 아군이 아니라 **적**에게 넣고 값이 공격력이 아니라 쿨다운이다.
      //  ⚠ 중복 시전은 시간만 갱신한다 — 곱해 쌓이면 사실상 침묵이 되어 버린 후보로 돌아간다.
      for (i = 0; i < state.units.length; i++) {
        o = state.units[i];
        if (!o.alive || o.side === u.side || this.isHazard(o)) continue;
        if (this.dist(u, o) > ab.radius) continue;
        var adup = false;
        for (var ai = 0; ai < o.buffs.length; ai++) {
          if (o.buffs[ai].ashTag) { o.buffs[ai].t = ab.ms || 6000; adup = true; break; }
        }
        if (!adup) o.buffs.push({ cdMul: ab.cdMul || 1.35, t: ab.ms || 6000, ashTag: true });
      }
      state.effects.push({ kind: 'ring', x: u.x, y: u.y, r: ab.radius,
                           t: 420, total: 420, side: u.side });

    } else if (ab.type === 'pull') {
      //  덩굴채 — 원거리 영웅의 **안전거리를 지운다.** 영웅 스킬 `pull`(combat.js 위쪽)을
      //  그대로 옮겨 왔다: 같은 원뿔·같은 `displaceTo`·같은 `clampToLeash`.
      //  ⚠ **끌어당기는 거리를 남긴다**(`keep`). 0 으로 붙여 버리면 겹쳐 서서 서로
      //    안 보이고, 이 게임엔 유닛 충돌이 없어 밀려난 채로 끼어 버린다.
      //  ⚠ 아군은 절대 안 당긴다 — 진형이 제 손으로 무너지면 배치의 뜻이 사라진다.
      var halfA = ((ab.coneDeg || 360) * Math.PI / 180) / 2;
      var aim = GAME.DetMath.atan2(u.abilY - u.y, u.abilX - u.x);
      var pulled = 0;
      for (i = 0; i < state.units.length; i++) {
        o = state.units[i];
        if (!o.alive || o.side === u.side || this.isHazard(o)) continue;
        var pd = this.dist(u, o);
        if (pd > ab.dist) continue;
        var pa = GAME.DetMath.atan2(o.y - u.y, o.x - u.x);
        if (halfA < Math.PI) {
          var pdf = GAME.DetMath.atan2(GAME.DetMath.sin(pa - aim), GAME.DetMath.cos(pa - aim));
          if (Math.abs(pdf) > halfA) continue;
        }
        if (ab.damage) bite(o);
        var keep = (ab.keep === undefined) ? 96 : ab.keep;
        this.displaceTo(o, u.x + GAME.DetMath.cos(pa) * Math.max(keep, pd - (ab.power || 130)),
                           u.y + GAME.DetMath.sin(pa) * Math.max(keep, pd - (ab.power || 130)));
        this.clampToArena(o); this.clampToLeash(o, state);
        pulled++;
      }
      u._lastPulled = pulled;   // 감사가 "실제로 당겼는가"를 셀 수 있게 남긴다
      state.effects.push({ kind: 'ring', x: u.x, y: u.y, r: ab.dist,
                           t: 300, total: 300, side: u.side });

    } else if (ab.type === 'barrage') {
      // 예고 원을 여러 개 뿌린다. 첫 발은 예고 지점, 나머지는 그 주변으로 흩는다 —
      // 한 점에 겹쳐 떨어지면 '한 발'과 다를 게 없어 피할 거리가 안 생긴다.
      // `telegraph` 이펙트가 만료되면 **스스로 터진다**(damage·owner 를 들고 있다).
      // 별도 blast 목록을 만들면 규칙이 두 벌이 되므로 영웅 aoeTarget 과 같은 길을 쓴다.
      var reps = ab.repeat || 3;
      for (var r = 0; r < reps; r++) {
        var sx = u.abilX + (r === 0 ? 0 : (GAME.Combat.rand() - 0.5) * (ab.spread || 200));
        var sy = u.abilY + (r === 0 ? 0 : (GAME.Combat.rand() - 0.5) * (ab.spread || 200));
        //  fuse(5.6차 — 보스 궁극기): 착탄까지의 예고 시간. 거대 원(맵 과반)은
        //  피할 거리가 머니 fuse 를 길게 잡아 "보고 걸어나가면 피해진다"를 지킨다.
        var delay = r * (ab.interval || 420) + (ab.fuse || 340);
        state.effects.push({ kind: 'telegraph', x: sx, y: sy, r: ab.radius,
                             t: delay, total: delay,
                             damage: ab.damage, side: u.side, owner: u, abil: true,
                             // 늪지기처럼 둔화를 얹는 스킬이면 예고에 실어 보낸다.
                             slowMul: ab.slowMul, slowMs: ab.slowMs,
                             // 용 보스 — "밀어낸다"는 이름값이 필요한 종류만(opt-in).
                             knockback: ab.knockback });
      }
    }
  },

  runAI: function (u, state, dt) {
    var def = u.def;
    //  실시간 대전(2026-08-21 태현님): 영웅은 **명령이 있을 때만** 움직이고 때린다.
    //  자동 교전은 전략가 유닛의 것이다. 양쪽 클라이언트가 같은 규칙 = 결정론 유지.
    if (state.pvpRealtime && u.isHero && !u.order) return;
    // 능력이 이번 프레임을 가져갔으면 이동·공격은 건너뛴다(예고와 실제가 어긋나면 못 피한다)
    // ⚠ `abilities`(복수)만 가진 유닛도 여기를 통과해야 한다 — 이 가드가
    //   `def.ability` 만 보고 있어서 알 보스가 **스킬을 한 번도 안 썼다**(실측:
    //   50층 6판에 시전 0회). 복수형을 추가하는 변경에서 가장 놓치기 쉬운 자리다.
    if ((def.ability || (def.abilities && def.abilities.length)) &&
        this.runAbility(u, state, dt)) return;
    var moveTo = null;
    var engage = true;
    var tgt = null;

    // 지원·설치 유닛은 교전하지 않으므로 진지 이탈/복귀(stance) 판정을 적용하지 않는다.
    // stance 를 먼저 돌리면 부상자를 따라가려는 이동을 매 프레임 되돌려 상쇄된다.
    if (def.attack === 'none') {
      if (def.isMine || def.immobile) return;

      // 호위 역할 — medicFollow 보다 먼저 본다. 둘 다 이동을 수행하므로
      // 한 프레임에 하나만 돌아야 서로 상쇄되지 않는다.
      if (this.runProtect(u, state, dt)) return;

      // 학습(medicFollow): 위생병이 회복을 못 했던 진형은 부상자를 따라가도록 배운다.
      // 이 판단은 여기 한 곳에서만 한다 — 다른 곳에서 또 움직이면 서로 상쇄된다.
      var ad = state.adapt;
      if (def.healRadius && ad && ad.medicFollow > 0.2 && u.side === 'strategist') {
        var worst = null, worstRatio = 0.9;
        for (var wi = 0; wi < state.units.length; wi++) {
          var w2 = state.units[wi];
          if (!w2.alive || w2.side !== u.side || w2 === u || this.isHazard(w2)) continue;
          var ratio = w2.hp / w2.maxHp;
          if (ratio < worstRatio) { worstRatio = ratio; worst = w2; }
        }
        if (worst && this.dist(u, worst) > def.healRadius * 0.6) {
          u.leash = Infinity;   // 부상자를 따라갈 땐 진지 구속을 푼다
          this.moveToward(u, worst.x, worst.y, this.effSpeed(u) * dt);
          return;
        }
      }

      var home = u.home;
      if (this.dist(u, { x: home.x, y: home.y }) > 6) {
        this.moveToward(u, home.x, home.y, this.effSpeed(u) * dt);
      }
      return;
    }

    if (!this.updateStance(u, state, dt)) return;

    if (u.order) {
      if (u.order.type === 'move') {
        moveTo = { x: u.order.x, y: u.order.y };
        engage = false;
      } else if (u.order.type === 'attackmove') {
        moveTo = { x: u.order.x, y: u.order.y };
      } else if (u.order.type === 'attack') {
        if (u.order.target && u.order.target.alive) tgt = u.order.target;
        else u.order = null;
      }
    }

    if (engage && !tgt) tgt = this.nearestEnemy(u, state.units);

    if (tgt) {
      var d = this.dist(u, tgt);

      var ad2 = state.adapt;

      // ── 약초꾼에게 후퇴 (retreat, 2026-07-29) ────────────────────────────
      // 다친 유닛이 **회복해 줄 아군에게 붙는다.** `medicFollow`(약초꾼이 부상자를
      // 따라간다)의 반대 방향이고, 둘은 섞여도 된다 — 서로 마주 걸어오면 더 빨리 만난다.
      // 규율:
      //   · 약초꾼 자신은 후퇴하지 않는다(회복원이 도망가면 진형이 통째로 무너진다)
      //   · **이미 회복 반경 안이면 움직이지 않는다** — 안 그러면 약초꾼 위에 겹쳐 서서
      //     진형에 구멍이 나고, 광역 한 방에 뭉텅이로 죽는다
      //   · 후퇴 중에도 사거리 안의 적은 계속 친다(도망만 치면 진형 화력이 사라진다)
      // 후퇴는 kite 보다 **먼저** 본다. 둘 다 조건이 맞으면 회복이 우선이다 —
      // kite 는 죽지 않으려는 행동이고 후퇴는 살아 돌아오려는 행동이라, 뒤가 더 낫다.
      if (ad2 && ad2.retreat > 0.1 && u.side === 'strategist' && u.rootedFor <= 0 &&
          !def.healRadius && !def.immobile && u.hp < u.maxHp * (0.30 + 0.25 * ad2.retreat)) {
        var medic = null, medD = Infinity;
        for (var mi = 0; mi < state.units.length; mi++) {
          var mu = state.units[mi];
          if (!mu.alive || mu.side !== u.side || !mu.def.healRadius) continue;
          var md = this.dist(u, mu);
          if (md < medD) { medD = md; medic = mu; }
        }
        // ⚠ **가까운 약초꾼에게만 간다.** 거리 제한이 없을 때 실측하니 다친 유닛이
        //   맵을 가로질러 걸어가느라 전투에서 통째로 빠졌고, 그 결과 전술을 켠 쪽이
        //   **더 쉬워졌다**(프로 돌파 12층 58%→65%). 회복은 싸움을 이어가기 위한
        //   것이지 싸움을 그만두는 것이 아니다.
        var reach = (medic ? medic.def.healRadius : 0) + 220 * (GAME.CONFIG.WORLD_SCALE || 1);
        // 회복 반경 안이면 그 자리에서 회복받으며 싸운다(붙지 않는다)
        if (medic && medD > medic.def.healRadius * 0.75 && medD <= reach) {
          this.moveToward(u, medic.x, medic.y, this.effSpeed(u) * dt * (0.55 + 0.45 * ad2.retreat));
          if (d <= def.range) {
            this.faceAttack(u, GAME.DetMath.atan2(tgt.y - u.y, tgt.x - u.x));
            if (u.cd <= 0) { this.fire(u, tgt.x, tgt.y, tgt, state); u.cd = def.cooldown; }
          }
          return;
        }
      }

      // ── 대형 유지 (cohesion, 2026-07-29) ─────────────────────────────────
      // **혼자 튀어나가지 않는다.** v0.53 에서 '한 번 쫓으면 끝까지 쫓는다'(committed)를
      // 넣자, 영웅이 유닛을 하나씩 끌어내 각개격파하는 것이 최적 전략이 됐다.
      // 주변에 아군이 없으면 전진을 멈추고 무리 쪽으로 물러난다 —
      // 진형이 '뭉쳐서 함께' 움직이므로 끌어내기가 통하지 않는다.
      // ⚠ 사거리 안이면 예외다. 닿는데 안 치면 그건 대형 유지가 아니라 태업이다.
      if (ad2 && ad2.cohesion > 0.1 && u.side === 'strategist' && u.stance === 'chase' &&
          d > def.range && u.rootedFor <= 0 && !def.immobile) {
        var near = 0, cx = 0, cy = 0;
        var band = 190 * (GAME.CONFIG.WORLD_SCALE || 1);
        for (var ci = 0; ci < state.units.length; ci++) {
          var cu = state.units[ci];
          if (!cu.alive || cu.side !== u.side || cu === u || this.isHazard(cu)) continue;
          if (this.dist(u, cu) <= band) { near++; cx += cu.x; cy += cu.y; }
        }
        var needed = 1 + Math.round(ad2.cohesion * 2);      // 0.85 → 아군 3기 필요
        if (near < needed && near > 0) {
          // ⚠ 처음엔 '혼자면 멈춘다'로 만들었는데, 그러면 진형이 영웅에게 닿지를 못해
          //   **오히려 쉬워졌다**(실측). 대형 유지는 '가지 않는 것'이 아니라
          //   '같이 가는 것'이다. 무리 쪽으로 당기되 목표를 향한 전진은 유지한다 —
          //   아군 중심과 적 사이의 중간점으로 간다.
          var mixX = (cx / near) * ad2.cohesion + tgt.x * (1 - ad2.cohesion);
          var mixY = (cy / near) * ad2.cohesion + tgt.y * (1 - ad2.cohesion);
          this.moveToward(u, mixX, mixY, this.effSpeed(u) * dt);
          if (d <= def.range && u.cd <= 0) {
            this.faceAttack(u, GAME.DetMath.atan2(tgt.y - u.y, tgt.x - u.x));
            this.fire(u, tgt.x, tgt.y, tgt, state); u.cd = def.cooldown;
          }
          return;
        }
      }

      // 학습: kite — **다친** 원거리 유닛만 물러나며 쏜다.
      // 멀쩡한 유닛까지 물러나면 진형의 화력 집중이 깨져 오히려 약해진다(실측으로 확인).
      // ⚠ **근접 상대에게만 물러난다.** 사거리 340 짜리 영웅에게 물러나 봐야
      //   그쪽 사거리 안이라 맞는 건 그대로이고 내 화력만 줄어든다 —
      //   실측에서 kite 를 켠 쪽이 더 쉬웠던 원인 중 하나다.
      if (ad2 && ad2.kite > 0.1 && u.side === 'strategist' &&
          def.range > 150 && (tgt.def.range || 0) < 150 && u.hp < u.maxHp * 0.55 &&
          d < def.range * 0.4 && u.rootedFor <= 0) {
        var away = GAME.DetMath.atan2(u.y - tgt.y, u.x - tgt.x);
        u.x += GAME.DetMath.cos(away) * this.effSpeed(u) * dt * ad2.kite;
        u.y += GAME.DetMath.sin(away) * this.effSpeed(u) * dt * ad2.kite;
        this.clampToArena(u);
        this.faceAttack(u, GAME.DetMath.atan2(tgt.y - u.y, tgt.x - u.x));
        if (u.cd <= 0) { this.fire(u, tgt.x, tgt.y, tgt, state); u.cd = def.cooldown; }
        return;
      }

      if (d <= def.range) {
        this.faceAttack(u, GAME.DetMath.atan2(tgt.y - u.y, tgt.x - u.x));
        if (u.cd <= 0) {
          this.fire(u, tgt.x, tgt.y, tgt, state);
          u.cd = def.cooldown;
        }
        return;
      }
      if (!moveTo || (u.order && u.order.type === 'attack')) {
        moveTo = { x: tgt.x, y: tgt.y };
      }
    }

    // 호위 역할 — 여기까지 왔다는 건 이번 프레임에 쏘지 못한다는 뜻이다.
    // 쏠 수 있으면 위에서 이미 return 했다 → **공격이 언제나 호위보다 우선**이다.
    if (this.runProtect(u, state, dt)) return;

    // 학습: guardFollow — 방탄병이 영웅과 가장 가까운 아군 사이를 막아선다.
    // 영웅이 멀면 움직이지 않는다 — 맵을 가로질러 달려가면 진형에서 이탈해 손해다.
    var ad3 = state.adapt;
    if (ad3 && ad3.guardFollow > 0.1 && u.side === 'strategist' && u.def.intercept && u.rootedFor <= 0) {
      var hero = null;
      for (var hh = 0; hh < state.units.length; hh++) {
        if (state.units[hh].alive && state.units[hh].isHero) { hero = state.units[hh]; break; }
      }
      if (hero && this.dist(u, hero) < 340) {
        var ward = null, wd = Infinity;
        for (var aa = 0; aa < state.units.length; aa++) {
          var al2 = state.units[aa];
          if (!al2.alive || al2.side !== u.side || al2 === u || this.isHazard(al2)) continue;
          var dh = this.dist(al2, hero);
          if (dh < wd) { wd = dh; ward = al2; }
        }
        if (ward) {
          var mx2 = (ward.x + hero.x) / 2, my2 = (ward.y + hero.y) / 2;
          if (this.dist(u, { x: mx2, y: my2 }) > 30) {
            this.moveToward(u, mx2, my2, this.effSpeed(u) * dt * ad3.guardFollow);
            u.leash = Math.max(u.leash, u.def.chase * 1.5);
            return;
          }
        }
      }
    }

    if (moveTo) {
      var arrived = this.moveToward(u, moveTo.x, moveTo.y, this.effSpeed(u) * dt);
      if (arrived && u.order && (u.order.type === 'move' || u.order.type === 'attackmove')) {
        u.order = null;
      }
    }
  },

  separate: function (state) {
    var us = state.units;
    for (var i = 0; i < us.length; i++) {
      var a = us[i];
      if (!a.alive || this.isHazard(a) || a.def.immobile) continue;
      for (var j = i + 1; j < us.length; j++) {
        var b = us[j];
        if (!b.alive || this.isHazard(b) || b.def.immobile) continue;
        var dx = b.x - a.x, dy = b.y - a.y;
        var min = a.def.radius + b.def.radius;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d > 0 && d < min) {
          // 영웅은 체급이 커서 잘 안 밀린다. 가중치는 **그 유닛이 밀려나는 비율**이다.
          //  ⚠ 보스는 0 — **몸으로 밀어도 안 밀린다** (2026-08-03 사용자 확인:
          //    "보스가 내 스킬이나 내 무빙에 밀려나지않는다가 맞아").
          //    `displace()` 는 스킬 계열만 막는다. 걸어가서 몸으로 미는 것은 이
          //    겹침 해소가 하는 일이라 여기서 따로 막아야 한다 — 안 그러면
          //    "보스를 벽으로 밀어붙이고 때린다"가 그대로 남는다.
          //    움직이는 보스(족장·골렘·권속·태초의 용)가 대상이다. 안 움직이는
          //    보스(알·둥지·발·손)는 위의 `def.immobile` 에서 이미 걸러진다.
          //  ⚠ 0 으로 두면 **상대가 밀리는 몫이 1.0 이 된다** — 보스가 안 비켜도
          //    내가 밀려나므로 겹친 채로 끝나지 않는다(겹침 감사가 이걸 본다).
          var aw = this.isAnchored(a) ? 0 : (a.isHero ? 0.18 : 1);
          var bw = this.isAnchored(b) ? 0 : (b.isHero ? 0.18 : 1);
          var sum = aw + bw;
          if (sum <= 0) continue;          // 둘 다 안 밀리는 조합이면 할 일이 없다
          var push = (min - d);
          var nx = dx / d, ny = dy / d;
          a.x -= nx * push * (aw / sum); a.y -= ny * push * (aw / sum);
          b.x += nx * push * (bw / sum); b.y += ny * push * (bw / sum);
          this.clampToArena(a);
          this.clampToArena(b);
        }
      }
    }
  },

  // ── 메인 루프 ────────────────────────────────────────────────
  update: function (state, dtMs) {
    if (state.over) return;
    var dt = dtMs / 1000;
    state.elapsed += dtMs;
    state.noHitFor += dtMs;

    var i, u, k;

    //  ── 최후 저항 판정 (2026-08-08) ────────────────────────────────────────
    //  ⚠ **시간 조건을 같이 건다.** 머릿수만 보면 판 초반에 소수로 시작한 진형이
    //    처음부터 최후 저항이 되어 밸런스가 통째로 바뀐다. 20초를 넘겨서까지
    //    한둘만 남아 있을 때가 '지루한 꼬리'다.
    //  ⚠ 위험물(가시덫)은 세지 않는다 — 쓰러뜨릴 대상이 아니라서 남아 있어도
    //    '한 기 남았다'가 아니다.
    if (state.elapsed > this.LAST_STAND.afterMs) {
      var _ls = { strategist: 0, controller: 0 };
      for (i = 0; i < state.units.length; i++) {
        u = state.units[i];
        if (!u.alive || u.isHero || this.isHazard(u)) continue;
        _ls[u.side] = (_ls[u.side] || 0) + 1;
      }
      for (i = 0; i < state.units.length; i++) {
        u = state.units[i];
        if (!u.alive || u.isHero || this.isHazard(u)) continue;
        if (_ls[u.side] <= this.LAST_STAND.at && !u._lastStand) {
          u._lastStand = true;
          //  자리를 지킬 이유가 사라졌다 — 끝까지 쫓는다.
          u.leash = Infinity;
          u.committed = true;
          state.effects.push({ kind: 'ring', x: u.x, y: u.y, r: (u.def.radius || 12) * 3,
                               t: 420, total: 420, side: u.side });
        }
      }
    }

    //  ── 잉걸불 구역 (2026-08-08 · 불씨꾼) ──────────────────────────────────
    //  전장이 시간에 따라 좁아진다 — 회피가 '한 번의 반응'이 아니라 '누적된 계획'이 된다.
    //  ⚠ 심은 쪽은 안 밟는다. 아군까지 태우면 진형이 제 불에 녹아 배치가 뜻을 잃는다
    //    (벌집꾼은 반대로 아군도 맞는데, 저건 **한 번 터지고 끝**이라 위치를 고를 수
    //     있고 이건 **몇 초간 남는** 물건이라 고를 수가 없다).
    if (state.emberZones && state.emberZones.length) {
      for (var ez = state.emberZones.length - 1; ez >= 0; ez--) {
        var zn = state.emberZones[ez];
        zn.t -= dtMs;
        if (zn.t <= 0) { state.emberZones.splice(ez, 1); continue; }
        zn.tick = (zn.tick || 0) + dtMs;
        if (zn.tick < 500) continue;
        zn.tick -= 500;
        for (var eu = 0; eu < state.units.length; eu++) {
          var vic2 = state.units[eu];
          if (!vic2.alive || vic2.side === zn.side || this.isHazard(vic2)) continue;
          var edx = vic2.x - zn.x, edy = vic2.y - zn.y;
          if (edx * edx + edy * edy > zn.r * zn.r) continue;
          this.applyDamage(vic2, zn.dps * 0.5, zn.owner || null, state,
                           { noCrit: true, noLs: true, zone: true });
        }
      }
    }

    for (i = 0; i < state.units.length; i++) {
      u = state.units[i];
      if (!u.alive) continue;

      this.tickGuard(u, dtMs);
      if (u.cd > 0) u.cd -= dtMs;
      if (u.flash > 0) u.flash -= dtMs;
      if (u.rootedFor > 0) u.rootedFor -= dtMs;
      if (u._ripCd > 0) u._ripCd -= dtMs;      // 축복 '반격' 쿨타임
      // 시선 잠금은 프레임 단위다 — 이번 프레임에 공격하지 않으면 곧바로 풀린다.
      if (u.faceLock > 0) u.faceLock--;

      if (u.isHero) {
        for (k in u.skillCd) if (u.skillCd[k] > 0) u.skillCd[k] -= dtMs;
        // ── 저체력 긴박감 — 짧은 심장박동 (2026-08-12) ────────────────────────
        //  ⚠ 문턱만 여기서 매 프레임 확인하고, 반복을 막는 **게이트는 sound.js
        //    가 건다**(heroLowHp, 950ms) — 두 군데서 따로 쿨다운을 재면 시계가
        //    어긋난다(이 파일이 이미 여러 번 겪은 실수 계열). 최대체력 25% 미만을
        //    "위험" 구간으로 삼는다 — heroHurt(맞았다)와 다른, "지금 위험하다"는
        //    지속 신호다.
        if (GAME.Sound && u.hp > 0 && u.hp <= u.maxHp * 0.25) GAME.Sound.play('heroLowHp');
      }

      // 버프 만료
      for (k = u.buffs.length - 1; k >= 0; k--) {
        u.buffs[k].t -= dtMs;
        if (u.buffs[k].t <= 0) u.buffs.splice(k, 1);
      }

      // 오라 지속 피해
      for (k = u.auras.length - 1; k >= 0; k--) {
        var au = u.auras[k];
        au.t -= dtMs;
        au.tick -= dtMs;
        // 이동 조건부 오라(파수꾼 '무게') — **밀고 지나갈 때만** 갉는다.
        // 왜 상시가 아닌가: 상시로 두면 수성의 탑의 AI 공격 영웅이 공짜로 받는다.
        //   4층 방어율이 39%→31% 로 떨어져 영웅 간 편차가 27%p 가 됐다(SC-3 실패, 한계 20).
        //   dps 를 2 까지 낮춰도 25%p 라 크기 문제가 아니었다 — 광전사가 저층에서 약한
        //   성질이 있어(57%) 파수꾼을 조금만 올려도 벌어지는 구조다.
        //   `runAI` 는 사거리에 들면 멈춰서 치므로, 이동 조건을 걸면 AI 는 이 기제를
        //   구조적으로 못 쓴다 — 광전사의 '달려들며 치기'와 같은 장치다.
        // 시계는 계속 돌린다(멈춰 있다 다시 걸을 때 한 틱을 몰아 넣지 않게).
        if (au.moveOnly && !this.isCharging(u)) { if (au.tick <= 0) au.tick = au.tickMs || 250; }
        else if (au.tick <= 0) {
          au.tick = au.tickMs || 250;
          var auraHit = 0, auraLs = this._lsBudget(u);
          for (var m = 0; m < state.units.length; m++) {
            var v = state.units[m];
            if (!v.alive || v.side === u.side) continue;
            if (this.dist(u, v) <= au.radius + v.def.radius) {
              // 지속 피해는 크리티컬 판정을 하지 않는다(숫자가 폭주함)
              // 상시 오라(파수꾼 '무게')는 흡혈을 태우지 않는다 — 초당 4번 도는 판정에
              // 흡혈이 붙으면 서 있기만 해도 회복이 쌓여 '버티는 지속형'이 '무적'이 된다.
              this.applyDamage(v, au.dps * (au.tickMs || 250) / 1000, u, state,
                { noCrit: true, noNumber: !!au.noNumber, zone: true,
                  lsScale: au.noLs ? 0 : this._ls(auraHit++), lsBudget: auraLs });
            }
          }
        }
        if (au.t <= 0) u.auras.splice(k, 1);
      }

      // 위생병 — 주변 아군 회복
      if (u.def.healRadius) {
        u.healTick = (u.healTick || 0) - dtMs;
        if (u.healTick <= 0) {
          u.healTick = u.def.healInterval;
          var healed = 0;
          for (k = 0; k < state.units.length; k++) {
            var al = state.units[k];
            if (!al.alive || al.side !== u.side || al === u) continue;
            if (al.hp >= al.maxHp) continue;
            if (this.dist(u, al) <= u.def.healRadius) {
              this.heal(al, u.def.healPerTick, state);
              healed++;
              if (u.side === 'strategist') state.telemetry.medicHealed += u.def.healPerTick;
            }
          }
          if (healed) {
            state.effects.push({
              kind: 'healPulse', x: u.x, y: u.y, r: u.def.healRadius,
              t: 420, total: 420, side: u.side
            });
          }
        }

      }

      // ── 가시덫 — 밟으면 **도화선이 타고** 그 뒤에 터진다 (2026-08-01) ──────────
      //  예전엔 밟는 즉시 피해였다. 지금은 두 단계다:
      //   ① 밟는다 → `u.fuse` 가 켜진다(이때부터 화면에 폭발 범위가 보인다)
      //   ② 도화선이 다 타면 **blastRadius 안의 적 전부**가 맞는다.
      //  ⚠ 피해 대상이 '밟은 놈'이 아니라 '그때 범위 안에 있는 놈'이라는 것이 핵심이다.
      //    그래야 빠져나가면 안 맞는다 — 그게 이 개편의 목적이다(js/units.js 주석 참조).
      if (u.def.isMine) {
        if (u.fuse === undefined) u.fuse = -1;
        if (u.fuse < 0) {
          for (k = 0; k < state.units.length; k++) {
            var trg = state.units[k];
            if (!trg.alive || trg.side === u.side) continue;
            if (this.dist(u, trg) > u.def.triggerRadius) continue;
            u.fuse = u.def.fuseMs || 450;
            u.armedAt = state.elapsed;
            break;
          }
        } else {
          // ⚠ 이 함수의 델타 인자 이름은 `dtMs` 다. `dt` 로 썼더니 도화선이 한 번도
          //   안 줄어 **지뢰가 영원히 안 터졌다**(실측으로 잡음 — 조용히 아무 일도
          //   안 일어나는 종류의 버그다).
          u.fuse -= dtMs;
          if (u.fuse <= 0) {
            var br = u.def.blastRadius;
            for (k = 0; k < state.units.length; k++) {
              var vic = state.units[k];
              if (!vic.alive || vic.side === u.side) continue;
              if (this.dist(u, vic) > br) continue;         // 빠져나갔으면 안 맞는다
              var pct = vic.maxHp * u.def.pctMaxHp;
              // 방어력을 무시하고 비율로 깎는다 — 지뢰는 방탄복으로 막는 게 아니다
              vic.hp -= pct; vic.flash = 200;
              if (vic.hp <= 0) {
                vic.hp = 0; vic.alive = false; this.spawnYolk(state, vic);
                if (state.onKill) state.onKill(vic, state);
              }
              this.pushNumber(state, vic, pct, true);
            }
            state.effects.push({
              kind: 'blast', x: u.x, y: u.y, r: br,
              t: 320, total: 320, side: u.side
            });
            //  ⚠ 가시덫은 **피해로 죽지 않는다**(위에서 isHazard 로 막는다) — 그래서
            //    다른 유닛과 달리 사망음 경로를 안 탄다. 이 유닛에게 '죽음'은 곧
            //    **터지는 순간**이므로 여기서 소리를 낸다. 안 넣으면 밟혀도 조용하다.
            if (GAME.Sound) {
              GAME.Sound.play('boom');
              if (GAME.Sound.playFor) GAME.Sound.playFor('die', u.def);
            }
            u.alive = false;   // 1회용
            this.spawnYolk(state, u);
            if (state.onKill) state.onKill(u, state);
          }
        }
        if (!u.alive) continue;
      }

      if (u.rootedFor > 0) continue;      // 속박 중엔 행동 불가
      if (u.manual) continue;             // 플레이어가 직접 몰고 있는 유닛은 AI 생략
      this.runAI(u, state, dt);
    }

    // ── 밟기 (2026-07-29) ──────────────────────────────────────────────────
    // "덩치로 밀고 지나간다." 걸어가는 길에 **몸이 닿은** 적만 조금 밀어낸다.
    // 광전사의 '달려들며 치기'와 형제 기제지만 셋이 다르다:
    //   · 공격이 아니라 **이동**에 붙는다 — 때리지 않아도, 지나가기만 해도 밀린다
    //   · 접촉 판정이다(사거리 아님) — 그래서 덩치(radius)가 곧 영향 범위다
    //   · 밀어내는 힘이 더 약하다 — 파수꾼은 뚫는 영웅이 아니라 버티는 영웅이다
    // 여기(AI 루프가 끝난 뒤)에서 도는 이유: 이번 프레임 이동이 전부 확정돼야
    // "실제로 걸어간 길"을 알 수 있다. 루프 안에서 하면 유닛마다 시점이 어긋난다.
    for (i = 0; i < state.units.length; i++) {
      var tu2 = state.units[i];
      if (!tu2.alive || !tu2.def.trampleKnock || !this.isCharging(tu2)) continue;
      var didTrample = false;
      for (k = 0; k < state.units.length; k++) {
        var tv = state.units[k];
        if (!tv.alive || tv.side === tu2.side || this.isHazard(tv)) continue;
        var td = this.dist(tu2, tv);
        var contact = tu2.def.radius + tv.def.radius + 4;
        if (td > contact || td <= 0.1) continue;
        this.displace(tv, ((tv.x - tu2.x) / td) * tu2.def.trampleKnock,
                          ((tv.y - tu2.y) / td) * tu2.def.trampleKnock);
        this.clampToArena(tv); this.clampToLeash(tv, state);
        didTrample = true;
      }
      // 흙먼지는 **묶어서 하나만** 띄운다. 밟기는 매 프레임 도는 판정이라 접촉마다
      // 이펙트를 밀면 초당 수십 개가 쌓인다(피해 숫자로 이미 겪은 유형).
      tu2._trampleFx = (tu2._trampleFx || 0) - dtMs;
      if (didTrample && tu2._trampleFx <= 0) {
        tu2._trampleFx = 190;
        state.effects.push({ kind: 'ring', x: tu2.x, y: tu2.y,
                             r: tu2.def.radius * 1.5, t: 220, total: 220, side: tu2.side });
      }
    }

    // 원거리 간격 유지 → 겹침 해소 순서다. 겹침(separate)이 마지막이라야
    // 간격 밀어내기가 유닛을 서로 겹쳐놓은 채 프레임을 끝내지 않는다.
    this.spaceRanged(state, dt);
    this.separate(state);

    for (i = 0; i < state.units.length; i++) {
      if (state.units[i].alive) this.clampToLeash(state.units[i], state, dt);
    }

    // ── 프레임 끝 위치 기록 (달려들며 치기 판정용) ──────────────────────────
    // 여기(모든 이동·간격·겹침·리시가 끝난 뒤)에서 찍어야 다음 프레임의 차이가
    // **순수한 이번 프레임 이동량**이 된다. 루프 안에서 찍으면 유닛마다 기준 시점이
    // 달라져 조용히 어긋난다.
    for (i = 0; i < state.units.length; i++) {
      var pu = state.units[i];
      pu._px = pu.x; pu._py = pu.y;
    }

    // 덫
    for (i = state.traps.length - 1; i >= 0; i--) {
      var tr = state.traps[i];
      tr.life -= dtMs;
      var triggered = false;
      for (k = 0; k < state.units.length; k++) {
        var tu = state.units[k];
        if (!tu.alive || tu.side === tr.side) continue;
        if (this.dist(tu, tr) <= tr.radius) {
          this.applyDamage(tu, tr.damage, tr.owner, state);
          tu.rootedFor = Math.max(tu.rootedFor, tr.rootMs);
          triggered = true;
        }
      }
      if (triggered || tr.life <= 0) {
        if (triggered) {
          state.effects.push({ kind: 'blast', x: tr.x, y: tr.y, r: tr.radius, t: 220, total: 220, side: tr.side });
        }
        state.traps.splice(i, 1);
      }
    }

    // 투사체
    for (i = state.projectiles.length - 1; i >= 0; i--) {
      var p = state.projectiles[i];

      // 유도탄: 대상을 계속 따라간다 (회피 불가 — 대신 눈에 보인다)
      if (p.homing) {
        if (!p.homing.alive) { state.projectiles.splice(i, 1); continue; }
        var hx = p.homing.x - p.x, hy = p.homing.y - p.y;
        var hd = Math.sqrt(hx * hx + hy * hy) || 1;
        p.vx = (hx / hd) * p.speed;
        p.vy = (hy / hd) * p.speed;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dtMs;

      var A = GAME.CONFIG.ARENA;
      if (p.life <= 0 || p.x < A.x || p.x > A.right || p.y < A.y || p.y > A.bottom) {
        state.projectiles.splice(i, 1);
        continue;
      }

      // 방탄병 차단 — 아군에게 갈 투사체를 몸으로 대신 맞는다.
      // 유도탄(저격)은 대상이 정해져 있어 차단하지 않는다.
      var blocker = null;
      if (!p.homing) {
        for (k = 0; k < state.units.length; k++) {
          var sh = state.units[k];
          if (!sh.alive || sh.side === p.side || !sh.def.intercept) continue;
          var sdx = sh.x - p.x, sdy = sh.y - p.y;
          if (Math.sqrt(sdx * sdx + sdy * sdy) <= sh.def.intercept + p.radius) { blocker = sh; break; }
        }
      }
      if (blocker) {
        this.applyDamage(blocker, p.damage, p.owner, state);
        if (p.sticky) this.applySlow(blocker, p);
        if (blocker.side === 'strategist') state.telemetry.guardBlocked++;
        state.effects.push({ kind: 'block', x: p.x, y: p.y, t: 200, total: 200, side: p.side });
        state.projectiles.splice(i, 1);
        continue;
      }

      var removed = false;
      for (k = 0; k < state.units.length; k++) {
        var o = state.units[k];
        if (!o.alive || o.side === p.side) continue;
        var ddx = o.x - p.x, ddy = o.y - p.y;
        if (Math.sqrt(ddx * ddx + ddy * ddy) > o.def.radius + p.radius) continue;

        if (p.pierce) {
          if (p.hitSet.indexOf(o) !== -1) continue;
          p.hitSet.push(o);
          this.applyDamage(o, p.damage, p.owner, state);
          state.effects.push({ kind: 'spark', x: p.x, y: p.y, t: 120, total: 120, side: p.side });
        } else {
          this.applyDamage(o, p.damage, p.owner, state);
          if (p.sticky) this.applySlow(o, p);
          // 관측: 영웅이 논타겟에 실제로 맞았나 (회피 실력 계산의 분자)
          if (o.isHero && p.side === 'strategist' && !p.homing) {
            state.telemetry.projectilesHitHero++;
          }
          state.effects.push({ kind: 'spark', x: p.x, y: p.y, t: 120, total: 120, side: p.side });
          state.projectiles.splice(i, 1);
          removed = true;
        }
        break;
      }
      if (removed) continue;
    }

    // 이펙트 (예고 폭발 포함)
    // ── 정예 '방패' — 주기적으로 곁의 아군에게 보호막을 준다 (towerrule.js) ──
    //  "뒷줄만 골라 치기"를 막는다. 보호막을 걷어내려면 앞을 먼저 상대해야 한다.
    if (state.elite && state.elite.alive && state.elite.elite === 'shield') {
      var sc2 = state.elite.eliteCfg;
      state.elite._shTick = (state.elite._shTick || 0) - dtMs;
      if (state.elite._shTick <= 0) {
        state.elite._shTick = sc2.every || 4000;
        var sr = (sc2.radius || 150), sf = (sc2.shieldFrac || 0.35);
        for (var si2 = 0; si2 < state.units.length; si2++) {
          var sv = state.units[si2];
          if (!sv.alive || sv.side !== 'strategist' || this.isHazard(sv)) continue;
          var sdx = sv.x - state.elite.x, sdy = sv.y - state.elite.y;
          if (sdx * sdx + sdy * sdy > sr * sr) continue;
          // 보호막은 **갱신**이지 누적이 아니다 — 쌓이면 후반에 무적이 된다.
          sv.shield = Math.max(sv.shield || 0, sv.maxHp * sf);
        }
        state.effects.push({ kind: 'ring', x: state.elite.x, y: state.elite.y,
                             r: sr, t: 300, total: 300, side: 'strategist' });
      }
    }

    // ── 축복 '메아리' — 예약해 둔 스킬을 절반 위력으로 한 번 더 (towerboon.js) ──
    //  ⚠ `_echoing` 표시를 세워 **메아리가 또 메아리를 예약하지 않게** 한다.
    //    없으면 스킬 하나가 무한히 자기 복제한다(넣자마자 겪은 뒤 넣은 가드다).
    if (state.echoes && state.echoes.length) {
      for (var ei = state.echoes.length - 1; ei >= 0; ei--) {
        var ec = state.echoes[ei];
        ec.t -= dtMs;
        if (ec.t > 0) continue;
        state.echoes.splice(ei, 1);
        if (!ec.u.alive) continue;
        var savedCd = ec.u.skillCd[ec.slot];
        var savedDmg = ec.u.def.damage;
        ec.u.skillCd[ec.slot] = 0;                  // 쿨타임을 무시하고 한 번 더
        ec.u.def.damage = savedDmg * ec.mul;        // 절반 위력
        state._echoing = true;
        this.castSkill(ec.u, ec.slot, ec.tx, ec.ty, state);
        state._echoing = false;
        ec.u.def.damage = savedDmg;
        ec.u.skillCd[ec.slot] = savedCd;            // 원래 쿨타임을 돌려놓는다
      }
    }

    for (i = state.effects.length - 1; i >= 0; i--) {
      var e = state.effects[i];
      e.t -= dtMs;
      if (e.t > 0) continue;

      if (e.kind === 'telegraph') {
        // ⚠ **피해값이 없는 예고는 그냥 사라진다.** 여기 가드가 없어서, 피해 없이
        //   '어디로 돌진할지'만 알리는 예고(charge)가 만료될 때 `applyDamage(w, undefined)`
        //   가 불렸고 영웅 체력이 NaN 이 됐다. NaN 은 `hp <= 0` 이 거짓이라 **영웅이 죽지
        //   않았고**, 회귀가 전 층 100% 돌파라는 말도 안 되는 값을 냈다.
        //   숫자가 이상하면 밸런스가 아니라 먼저 NaN 을 의심할 것.
        if (e.damage === undefined || e.damage === null) { state.effects.splice(i, 1); continue; }
        for (var n = 0; n < state.units.length; n++) {
          var w = state.units[n];
          if (!w.alive || w.side === e.side) continue;
          var ex = w.x - e.x, ey = w.y - e.y;
          if (Math.sqrt(ex * ex + ey * ey) <= e.r + w.def.radius) {
            this.applyDamage(w, e.damage, e.owner, state, e.abil ? { abil: true } : undefined);
            // 늪지기 스킬 — 예고 폭발이 둔화도 건다. `slowMul` 이 실린 예고만 해당된다
            // (없으면 아무 일도 안 하므로 기존 예고는 그대로다).
            if (e.slowMul) this.applySlow(w, { slowMul: e.slowMul, slowMs: e.slowMs || 2000 });
            // 용 보스 — 폭풍/손/발 처럼 "밀어낸다"는 이름값이 필요한 barrage 에만
            // 얹는다(2026-08-02, `slowMul` 과 같은 opt-in 패턴 — 없으면 기존 barrage는
            // 한 줄도 안 바뀐다). charge/shockwave 의 `bite()` 넉백과 같은 식이다.
            if (e.knockback) {
              var kd = Math.sqrt(ex * ex + ey * ey);
              if (kd > 0.1) {
                w.x += (ex / kd) * e.knockback; w.y += (ey / kd) * e.knockback;
                this.clampToArena(w); this.clampToLeash(w, state);
              }
            }
          }
        }
        //  ⚠ **재료(motif)·시전자(owner)·영웅키를 그대로 물려준다** (2026-08-07 수정).
        //    예전에는 여기서 통째로 잃었다 — 예고까지는 깃털/돌인데 **터지는 순간만
        //    무채색**이 되는 결함이 유닛뿐 아니라 영웅 aoeTarget(화살비·유성비·낙석
        //    유도…)에도 그대로 있었다. 폭발이 그 스킬의 정점인데 거기서 재료가 사라졌다.
        state.effects[i] = {
          kind: 'blast', x: e.x, y: e.y, r: e.r, t: 200, total: 200, side: e.side,
          motif: e.motif, owner: e.owner, heroKey: e.heroKey, abil: e.abil
        };
        continue;
      }
      state.effects.splice(i, 1);
    }

    // 떠오르는 피해 숫자 수명
    for (i = state.numbers.length - 1; i >= 0; i--) {
      state.numbers[i].t -= dtMs;
      if (state.numbers[i].t <= 0) state.numbers.splice(i, 1);
    }

    // 관측: 영웅이 어느 쪽(x)으로 들어오는지 1초마다 샘플 (rallyBias 학습 신호)
    state._heroSampleT = (state._heroSampleT || 0) - dtMs;
    if (state._heroSampleT <= 0) {
      state._heroSampleT = 1000;
      for (i = 0; i < state.units.length; i++) {
        var hu = state.units[i];
        if (hu.alive && hu.isHero) {
          var A2 = GAME.CONFIG.ARENA;
          state.telemetry.heroXSamples.push(((hu.x - A2.x) / A2.w) * 2 - 1);
          // 관측: 영웅이 적과 어느 거리에서 싸우는가 (파고드는가 / 거리를 두는가)
          var ne = this.nearestEnemy(hu, state.units);
          if (ne) state.telemetry.heroDistSamples.push(this.dist(hu, ne));
          break;
        }
      }
    }

    // ── 층 목표 판정 (towerobjective.js) — 기본 승패보다 **먼저** 본다 ────────
    //  목표는 **이기는 길만** 바꾼다. 영웅이 죽으면 언제나 지는 것은 그대로다
    //  (아래 `cAlive === 0` 가 계속 담당한다). 두 축을 다 흔들면 플레이어가 무엇 때문에
    //  졌는지 알 수 없게 된다.
    if (state.objective && GAME.TowerObjective) {
      var oR = GAME.TowerObjective.check(state);
      if (oR === 'win' && this.aliveCount(state, 'controller') > 0) {
        state.over = true; state.winner = 'controller'; state.objectiveDone = true;
        return;
      }
      if (oR === 'lose') {
        state.over = true; state.winner = 'strategist'; state.objectiveFailed = true;
        return;
      }
    }

    // ── 같은 전장 실시간(pvpRealtime) — **영웅이 죽으면 그쪽이 진다** ────────
    //  기존 모드의 「컨트롤러=영웅 하나」 전제가 여기서는 안 선다(양쪽 다 진형+영웅).
    //  그래서 승패 축을 영웅으로 못박는다 — 이 게임의 원래 약속(영웅 사망=패배)을
    //  양쪽에 대칭으로 적용한 것이다. 시간 초과는 남은 영웅 체력 비율로 가른다.
    if (state.pvpRealtime) {
      var hC = null, hS = null;
      for (i = 0; i < state.units.length; i++) {
        var hh = state.units[i];
        if (!hh.isHero) continue;
        if (hh.side === 'controller') hC = hh; else hS = hh;
      }
      //  ⚠ 비대칭 실시간(2026-08-20 확정 사양: 전략가 vs 컨트롤러)에서는 전략가에
      //    영웅이 없다 — 그쪽은 **전멸 = 패배**다. 영웅이 있으면 영웅 사망 = 패배.
      var cDead = hC ? !hC.alive : this.aliveCount(state, 'controller') === 0;
      var sDead = hS ? !hS.alive : this.aliveCount(state, 'strategist') === 0;
      if (cDead && sDead) { state.over = true; state.winner = 'draw'; }
      else if (sDead) { state.over = true; state.winner = 'controller'; }
      else if (cDead) { state.over = true; state.winner = 'strategist'; }
      else if (state.elapsed >= GAME.CONFIG.BATTLE_TIME * 1000) {
        //  시간 초과 — 영웅이 있으면 영웅 체력 비율(기존 규약 유지), 없으면 진영
        //  전체의 남은 체력 합 비율로 가른다.
        var ratio = function (hero, side) {
          if (hero) return hero.hp / hero.maxHp;
          var hp = 0, mx = 0;
          for (var k = 0; k < state.units.length; k++) {
            var uu = state.units[k];
            if (uu.side !== side) continue;
            mx += uu.maxHp || uu.def.hp || 0;
            if (uu.alive) hp += uu.hp;
          }
          return mx > 0 ? hp / mx : 0;
        };
        var rc = ratio(hC, 'controller'), rs = ratio(hS, 'strategist');
        state.over = true;
        state.timeUp = true;   // 렌더가 '타임 오버'를 띄운다 (2026-08-22 태현님)
        state.winner = rc === rs ? 'draw' : (rc > rs ? 'controller' : 'strategist');
      }
      return;
    }

    // 승패 판정
    var cAlive = this.aliveCount(state, 'controller');
    var sAlive = this.aliveCount(state, 'strategist');
    if (cAlive === 0 && sAlive === 0) {
      state.over = true; state.winner = 'draw';
    } else if (sAlive === 0) {
      state.over = true; state.winner = 'controller';
    } else if (cAlive === 0) {
      state.over = true; state.winner = 'strategist';
    } else if (state.elapsed >= GAME.CONFIG.BATTLE_TIME * 1000) {
      state.over = true; state.winner = 'draw';
      state.timeUp = true;   // 렌더가 '타임 오버'를 띄운다 (2026-08-22 태현님)
    }
  }
};
