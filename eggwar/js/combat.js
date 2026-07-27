window.GAME = window.GAME || {};

// 전투 엔진. Phaser에도, 화면 투영(Iso)에도 의존하지 않는 순수 평면 로직.
// 여기서 나온 좌표를 렌더 단계에서만 기울여 그린다 → 회피 판정의 공정성이 보존된다.
GAME.Combat = {

  createState: function () {
    return {
      units: [], projectiles: [], effects: [], traps: [],
      numbers: [],          // 떠오르는 피해 숫자 (렌더 전용 데이터)
      elapsed: 0, over: false, winner: null,
      // 전략가가 영웅에게 마지막으로 피해를 준 뒤 흐른 시간 → 교착 압박 계산에 쓴다
      noHitFor: 0,
      // 학습형 AI: 배치도의 적응값 + 이번 판 관측치
      adapt: null,
      telemetry: {
        medicHealed: 0, guardBlocked: 0, rangedDiedInMelee: 0, heroXSamples: [],
        // 진형이 영웅에게 닿지도 못했는가 (제자리에서 왕복하는 문제를 감지하는 신호)
        strategistUnits: 0, engagedUnits: 0, heroDamageTaken: 0,
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
              'projectileSpeed', 'bulletSpeed'],

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
    return out;
  },

  // mods: { hp, damage } — 난이도 단계(escalation)에 따른 능력 배수
  createUnit: function (typeKey, x, y, side, mods) {
    var base = GAME.UNITS[typeKey];
    var def = base;
    if (mods && (mods.hp !== 1 || mods.damage !== 1)) {
      def = {};
      for (var k in base) def[k] = base[k];
      def.hp = Math.round(base.hp * (mods.hp || 1));
      def.damage = Math.round(base.damage * (mods.damage || 1));
    }
    return this._baseUnit(this.scaleDef(def), x, y, side, typeKey);
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
      lifesteal: st.lifesteal,
      cost: h.cost
    };

    var u = this._baseUnit(this.scaleDef(def), x, y, side, heroKey);
    u.isHero = true;
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
      leash: side === 'strategist' ? (def.chase || GAME.CONFIG.LEASH) : Infinity,
      stance: 'hold',        // hold | chase | return
      restFor: 0,            // 복귀 직후 잠시 대기 (즉시 재출격 = 진동 방지)
      everEngaged: false,    // 이 유닛이 한 번이라도 적을 때렸는가 (학습 신호)
      hp: def.hp,
      maxHp: def.hp,
      cd: Math.random() * 250,
      alive: true,
      order: null,
      manual: false,
      facing: side === 'strategist' ? Math.PI / 2 : -Math.PI / 2,
      flash: 0,
      rootedFor: 0,
      isHero: false,
      shield: 0,
      buffs: [],
      auras: []
    };
  },

  // ── 파생 스탯 ────────────────────────────────────────────────
  effArmor: function (u) {
    var a = u.def.armor || 0;
    for (var i = 0; i < u.buffs.length; i++) if (u.buffs[i].armorAdd) a += u.buffs[i].armorAdd;
    return a;
  },

  effSpeed: function (u) {
    if (u.def.immobile) return 0;
    var s = u.def.speed;
    for (var i = 0; i < u.buffs.length; i++) if (u.buffs[i].speedMul) s *= u.buffs[i].speedMul;
    return s;
  },

  // 분대장이 주변에 있으면 공격력이 올라간다. 영웅은 자기 버프(전투 각성)를 받는다.
  effDamage: function (u, state) {
    var d = u.def.damage;
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

  dist: function (a, b) {
    var dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
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
      if (u.alive && u.side === side && !this.isHazard(u)) n++;
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
  applyDamage: function (unit, dmg, source, state, opts) {
    if (!unit.alive) return 0;
    // 지뢰는 피해로 제거할 수 없다. 밟아서 터뜨리거나, 피해서 지나가는 수밖에.
    if (this.isHazard(unit)) return 0;

    // 크리티컬 — 모든 공격에 25% 확률로 1.5배
    var crit = false;
    if (!(opts && opts.noCrit) && Math.random() < GAME.CONFIG.CRIT_CHANCE) {
      crit = true;
      dmg *= GAME.CONFIG.CRIT_MULT;
    }

    // 방어력은 '비율' 경감이다. 정액 차감으로 하면 방어력 높은 영웅에게
    // 약한 공격 다수(=물량)가 최소피해 1로 무력화되어, 물량이라는 전략 자체가 죽는다.
    var eff = Math.max(1, dmg * (100 / (100 + this.effArmor(unit))));

    if (unit.shield > 0) {
      var absorbed = Math.min(unit.shield, eff);
      unit.shield -= absorbed;
      eff -= absorbed;
    }

    unit.hp -= eff;
    unit.flash = 130;
    if (unit.hp <= 0) {
      unit.hp = 0; unit.alive = false;
      this.spawnYolk(state, unit);   // 죽으면 노른자가 터진다
      // 관측: 원거리 유닛이 근접 공격에 죽었나 (kite 학습 신호)
      if (state && unit.side === 'strategist' && (unit.def.range || 0) > 150 &&
          source && source.def && source.def.attack === 'melee') {
        state.telemetry.rangedDiedInMelee++;
      }
    }

    if (state) {
      this.pushNumber(state, unit, eff, crit);
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
    if (!state) return;
    var r = unit.def.radius;
    state.effects.push({
      kind: 'yolk', x: unit.x, y: unit.y, r: r,
      hero: !!unit.isHero, seed: Math.random() * 6.283,
      t: 480, total: 480, side: unit.side
    });
    state.effects.push({
      kind: 'yolkStain', x: unit.x, y: unit.y, r: r,
      t: 1600, total: 1600, side: unit.side
    });
  },

  pushNumber: function (state, unit, amount, crit) {
    if (amount <= 0) return;
    state.numbers.push({
      x: unit.x + (Math.random() - 0.5) * 30,
      y: unit.y,
      // 좌우로 퍼지게 흘려보낸다 — 같은 자리에서 여러 대 맞으면 숫자가 뭉쳐 읽을 수 없다
      drift: (Math.random() - 0.5) * 46,
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

  heal: function (u, amount) {
    if (!u.alive) return;
    u.hp = Math.min(u.maxHp, u.hp + amount);
  },

  // 화학병 점착탄 — 같은 종류의 둔화는 갱신만 하고 중첩되지 않는다
  applySlow: function (u, p) {
    for (var i = 0; i < u.buffs.length; i++) {
      if (u.buffs[i].slowTag) { u.buffs[i].t = p.slowMs; return; }
    }
    u.buffs.push({ speedMul: p.slowMul, t: p.slowMs, slowTag: true });
  },

  usePotion: function (u) {
    if (!u.isHero || u.potionCharges <= 0) return false;
    if (u.hp >= u.maxHp) return false;
    u.potionCharges--;
    this.heal(u, u.potionHeal);
    return true;
  },

  // ── 이동 ────────────────────────────────────────────────────
  // leash 는 '절대 한계'다. 교착 압박이 차오르면 그만큼 함께 늘어난다.
  clampToLeash: function (u, state) {
    if (!isFinite(u.leash)) return;
    var limit = state ? this.effChase(u, state) : u.leash;
    var dx = u.x - u.home.x, dy = u.y - u.home.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d > limit) {
      u.x = u.home.x + (dx / d) * limit;
      u.y = u.home.y + (dy / d) * limit;
    }
  },

  clampToArena: function (u) {
    var A = GAME.CONFIG.ARENA, r = u.def.radius;
    if (u.x < A.x + r) u.x = A.x + r;
    if (u.x > A.right - r) u.x = A.right - r;
    if (u.y < A.y + r) u.y = A.y + r;
    if (u.y > A.bottom - r) u.y = A.bottom - r;
  },

  moveToward: function (u, tx, ty, step) {
    var dx = tx - u.x, dy = ty - u.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.5) return true;
    if (step > d) step = d;
    u.x += (dx / d) * step;
    u.y += (dy / d) * step;
    u.facing = Math.atan2(dy, dx);
    this.clampToArena(u);
    return d <= step + 0.5;
  },

  // ── 기본 공격 ────────────────────────────────────────────────
  fire: function (u, tx, ty, target, state) {
    var def = u.def;
    if (def.attack === 'none') return;
    var ang = Math.atan2(ty - u.y, tx - u.x);
    u.facing = ang;
    var dmg = this.effDamage(u, state);

    if (def.attack === 'melee') {
      var half = ((def.coneDeg || 90) * Math.PI / 180) / 2;
      // 부채꼴에 여러 기가 걸려도 흡혈은 첫 대상만 온전히 받고(AOE_LIFESTEAL),
      // 이 한 번 휘두르기의 회복 총량은 lsBudget 이 묶는다(LIFESTEAL_SWING_CAP).
      var meleeHit = 0, meleeLs = this._lsBudget(u);
      for (var i = 0; i < state.units.length; i++) {
        var o = state.units[i];
        if (!o.alive || o.side === u.side) continue;
        if (this.dist(u, o) > def.range + o.def.radius) continue;
        var a = Math.atan2(o.y - u.y, o.x - u.x);
        var diff = Math.atan2(Math.sin(a - ang), Math.cos(a - ang));
        if (Math.abs(diff) <= half) {
          this.applyDamage(o, dmg, u, state, {
            lsScale: meleeHit === 0 ? 1 : GAME.CONFIG.AOE_LIFESTEAL,
            lsBudget: meleeLs
          });
          meleeHit++;
        }
      }
      state.effects.push({
        kind: 'slash', x: u.x, y: u.y, angle: ang,
        range: def.range, half: half, t: 140, total: 140, side: u.side
      });
      // 근접도 '무언가 날아간다'는 게 보이도록 검기를 띄운다 (연출 전용, 피해는 위에서 이미 적용)
      state.effects.push({
        kind: 'slashWave', x: u.x, y: u.y, angle: ang,
        range: def.range, t: 220, total: 220, side: u.side
      });

    } else if (def.attack === 'projectile') {
      state.projectiles.push({
        x: u.x, y: u.y,
        vx: Math.cos(ang) * def.projectileSpeed,
        vy: Math.sin(ang) * def.projectileSpeed,
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
    return this.castSkill(u, slot, u.x + Math.cos(ang) * reach, u.y + Math.sin(ang) * reach, state);
  },

  castSkill: function (u, slot, tx, ty, state) {
    if (!this.skillReady(u, slot)) return false;
    var sk = null;
    for (var i = 0; i < u.skills.length; i++) {
      if (u.skills[i].slot === slot) { sk = u.skills[i]; break; }
    }
    if (!sk) return false;

    var ang = Math.atan2(ty - u.y, tx - u.x);
    u.facing = ang;
    var self = this;
    var i2, o;

    if (sk.type === 'dash') {
      // backward = 마우스 반대 방향으로 물러나며 쏜다(반동 사격)
      var dir = sk.backward ? ang + Math.PI : ang;
      var nx = u.x + Math.cos(dir) * sk.dist;
      var ny = u.y + Math.sin(dir) * sk.dist;
      var fromX = u.x, fromY = u.y;
      u.x = nx; u.y = ny;
      this.clampToArena(u);
      if (sk.damage > 0) {
        var dashHit = 0, dashLs = this._lsBudget(u);
        for (i2 = 0; i2 < state.units.length; i2++) {
          o = state.units[i2];
          if (!o.alive || o.side === u.side) continue;
          if (this._distToSegment(o, fromX, fromY, u.x, u.y) <= sk.radius + o.def.radius) {
            this.applyDamage(o, sk.damage, u, state, { lsScale: this._ls(dashHit++), lsBudget: dashLs });
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
          this.applyDamage(o, sk.damage, u, state, { lsScale: this._ls(aoeHit++), lsBudget: aoeLs });
          if (sk.rootMs) o.rootedFor = Math.max(o.rootedFor, sk.rootMs);
          if (sk.knockback && d > 0.1) {
            var kx = (o.x - u.x) / d, ky = (o.y - u.y) / d;
            o.x += kx * sk.knockback; o.y += ky * sk.knockback;
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
          damage: sk.damage, side: u.side, owner: u
        });
      }

    } else if (sk.type === 'projectile') {
      var shots = sk.burst || 1;
      for (var b2 = 0; b2 < shots; b2++) {
        state.projectiles.push({
          x: u.x, y: u.y,
          vx: Math.cos(ang) * sk.speed,
          vy: Math.sin(ang) * sk.speed,
          damage: sk.damage,
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
        last.x -= Math.cos(ang) * last.delayDist;
        last.y -= Math.sin(ang) * last.delayDist;
      }

    } else if (sk.type === 'strike') {
      var tgt = this.nearestEnemy(u, state.units);
      if (tgt && this.dist(u, tgt) <= u.def.range + 70) {
        u._lsMul = sk.lifestealMul || 1;
        this.applyDamage(tgt, sk.damage, u, state);
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
      if (sk.shield) u.shield += sk.shield;
      if (sk.healNow) this.heal(u, sk.healNow);
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
        var aa = Math.atan2(o.y - u.y, o.x - u.x);
        var df = Math.atan2(Math.sin(aa - ang), Math.cos(aa - ang));
        if (Math.abs(df) > halfP) continue;
        this.applyDamage(o, sk.damage, u, state, { lsScale: this._ls(pullHit++), lsBudget: pullLs });
        // 영웅 쪽으로 끌어당긴다 (leash는 그대로 적용되어 진형이 무너지진 않는다)
        var pullTo = Math.max(0, dd - 120);
        o.x = u.x + Math.cos(aa) * pullTo;
        o.y = u.y + Math.sin(aa) * pullTo;
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
        x: px2, y: py2, radius: sk.radius, damage: sk.damage,
        rootMs: sk.rootMs, life: sk.life, side: u.side, owner: u
      });

    } else if (sk.type === 'aura') {
      u.auras.push({ radius: sk.radius, dps: sk.dps, t: sk.duration, tick: 0 });
    }

    u.skillCd[slot] = sk.cooldown * (u.cdrMul || 1);
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

  effAggro: function (u, state) {
    var p = this.pressureOf(state);
    var press = (state.adapt && state.adapt.press) || 0;
    return this._reach(u.def.aggro || 300, p, press * 220);
  },

  effChase: function (u, state) {
    var p = this.pressureOf(state);
    var press = (state.adapt && state.adapt.press) || 0;
    return this._reach(u.def.chase || GAME.CONFIG.LEASH, p, press * 160);
  },

  // 전략가 유닛의 진형 이탈/복귀 판정.
  // 반환값이 false면 이번 프레임은 이동만 처리했고 교전하지 않는다.
  //
  // 중요: stance 가 **이동을 실제로 통제**해야 한다. 예전 구현은 stance 와 무관하게
  // 항상 가장 가까운 적을 향해 걸어가서, leash 가 되돌리는 진자운동이 생겼다.
  updateStance: function (u, state, dt) {
    if (u.side !== 'strategist') return true;
    if (u.def.immobile) { u.stance = 'hold'; return true; }

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

    // 추격 한계를 넘겼으면 복귀
    if (fromHome >= chase) { u.stance = 'return'; return false; }

    // '집에서 갈 수 있는 거리 안에 있는 적'만 쫓는다.
    // 닿을 수 없는 적을 쫓으면 나갔다 돌아오기를 반복할 뿐이다.
    var tgtFromHome = Math.sqrt((tgt.x - u.home.x) * (tgt.x - u.home.x) +
                                (tgt.y - u.home.y) * (tgt.y - u.home.y));
    var reachable = tgtFromHome <= chase - u.def.range * 0.5;
    var inAggro = this.dist(u, tgt) <= aggro;

    if (u.restFor > 0) { u.stance = 'hold'; }
    else if (inAggro && reachable) { u.stance = 'chase'; }
    else { u.stance = 'hold'; }

    // 대기 상태면 제자리(집)를 지킨다 — 밀려났으면 돌아온다
    if (u.stance === 'hold') {
      if (fromHome > 10) this.moveToward(u, u.home.x, u.home.y, this.effSpeed(u) * dt);
      // 사거리 안에 적이 있으면 제자리에서 쏜다 (아래 runAI 가 처리)
      return this.dist(u, tgt) <= u.def.range;
    }
    return true;
  },

  runAI: function (u, state, dt) {
    var def = u.def;
    var moveTo = null;
    var engage = true;
    var tgt = null;

    // 지원·설치 유닛은 교전하지 않으므로 진지 이탈/복귀(stance) 판정을 적용하지 않는다.
    // stance 를 먼저 돌리면 부상자를 따라가려는 이동을 매 프레임 되돌려 상쇄된다.
    if (def.attack === 'none') {
      if (def.isMine || def.immobile) return;

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

      // 학습: kite — **다친** 원거리 유닛만 물러나며 쏜다.
      // 멀쩡한 유닛까지 물러나면 진형의 화력 집중이 깨져 오히려 약해진다(실측으로 확인).
      var ad2 = state.adapt;
      if (ad2 && ad2.kite > 0.1 && u.side === 'strategist' &&
          def.range > 150 && u.hp < u.maxHp * 0.55 &&
          d < def.range * 0.4 && u.rootedFor <= 0) {
        var away = Math.atan2(u.y - tgt.y, u.x - tgt.x);
        u.x += Math.cos(away) * this.effSpeed(u) * dt * ad2.kite;
        u.y += Math.sin(away) * this.effSpeed(u) * dt * ad2.kite;
        this.clampToArena(u);
        u.facing = Math.atan2(tgt.y - u.y, tgt.x - u.x);
        if (u.cd <= 0) { this.fire(u, tgt.x, tgt.y, tgt, state); u.cd = def.cooldown; }
        return;
      }

      if (d <= def.range) {
        u.facing = Math.atan2(tgt.y - u.y, tgt.x - u.x);
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
          // 영웅은 체급이 커서 잘 안 밀린다
          var aw = a.isHero ? 0.18 : 1, bw = b.isHero ? 0.18 : 1;
          var push = (min - d);
          var nx = dx / d, ny = dy / d;
          var sum = aw + bw;
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

    for (i = 0; i < state.units.length; i++) {
      u = state.units[i];
      if (!u.alive) continue;

      if (u.cd > 0) u.cd -= dtMs;
      if (u.flash > 0) u.flash -= dtMs;
      if (u.rootedFor > 0) u.rootedFor -= dtMs;

      if (u.isHero) {
        for (k in u.skillCd) if (u.skillCd[k] > 0) u.skillCd[k] -= dtMs;
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
        if (au.tick <= 0) {
          au.tick = 250;
          var auraHit = 0, auraLs = this._lsBudget(u);
          for (var m = 0; m < state.units.length; m++) {
            var v = state.units[m];
            if (!v.alive || v.side === u.side) continue;
            if (this.dist(u, v) <= au.radius + v.def.radius) {
              // 지속 피해는 크리티컬 판정을 하지 않는다(숫자가 폭주함)
              this.applyDamage(v, au.dps * 0.25, u, state,
                { noCrit: true, lsScale: this._ls(auraHit++), lsBudget: auraLs });
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
              this.heal(al, u.def.healPerTick);
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

      // 발목지뢰 — 밟으면 최대 체력의 일정 비율이 날아간다
      if (u.def.isMine) {
        for (k = 0; k < state.units.length; k++) {
          var vic = state.units[k];
          if (!vic.alive || vic.side === u.side) continue;
          if (this.dist(u, vic) > u.def.triggerRadius) continue;
          var pct = vic.maxHp * u.def.pctMaxHp;
          // 방어력을 무시하고 비율로 깎는다 — 지뢰는 방탄복으로 막는 게 아니다
          vic.hp -= pct; vic.flash = 200;
          if (vic.hp <= 0) { vic.hp = 0; vic.alive = false; this.spawnYolk(state, vic); }
          this.pushNumber(state, vic, pct, true);
          state.effects.push({
            kind: 'blast', x: u.x, y: u.y, r: u.def.blastRadius,
            t: 320, total: 320, side: u.side
          });
          u.alive = false;   // 1회용
          this.spawnYolk(state, u);
          break;
        }
        if (!u.alive) continue;
      }

      if (u.rootedFor > 0) continue;      // 속박 중엔 행동 불가
      if (u.manual) continue;             // 플레이어가 직접 몰고 있는 유닛은 AI 생략
      this.runAI(u, state, dt);
    }

    this.separate(state);

    for (i = 0; i < state.units.length; i++) {
      if (state.units[i].alive) this.clampToLeash(state.units[i], state);
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
    for (i = state.effects.length - 1; i >= 0; i--) {
      var e = state.effects[i];
      e.t -= dtMs;
      if (e.t > 0) continue;

      if (e.kind === 'telegraph') {
        for (var n = 0; n < state.units.length; n++) {
          var w = state.units[n];
          if (!w.alive || w.side === e.side) continue;
          var ex = w.x - e.x, ey = w.y - e.y;
          if (Math.sqrt(ex * ex + ey * ey) <= e.r + w.def.radius) {
            this.applyDamage(w, e.damage, e.owner, state);
          }
        }
        state.effects[i] = {
          kind: 'blast', x: e.x, y: e.y, r: e.r, t: 200, total: 200, side: e.side
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
    }
  }
};
