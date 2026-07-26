window.GAME = window.GAME || {};

// 전투 엔진. Phaser에도, 화면 투영(Iso)에도 의존하지 않는 순수 평면 로직.
// 여기서 나온 좌표를 렌더 단계에서만 기울여 그린다 → 회피 판정의 공정성이 보존된다.
GAME.Combat = {

  createState: function () {
    return {
      units: [], projectiles: [], effects: [], traps: [],
      elapsed: 0, over: false, winner: null
    };
  },

  createUnit: function (typeKey, x, y, side) {
    var def = GAME.UNITS[typeKey];
    return this._baseUnit(def, x, y, side, typeKey);
  },

  // 영웅 = 아이템 보정을 반영한 합성 def를 가진 특수 유닛
  createHero: function (heroKey, x, y, side, chosenItems) {
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

    var u = this._baseUnit(def, x, y, side, heroKey);
    u.isHero = true;
    u.hero = h;
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
      // 전략가 유닛은 배치된 자리를 지킨다. 진지를 버리고 돌격하면 '배치'가 의미를 잃는다.
      leash: side === 'strategist' ? GAME.CONFIG.LEASH : Infinity,
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
    var s = u.def.speed;
    for (var i = 0; i < u.buffs.length; i++) if (u.buffs[i].speedMul) s *= u.buffs[i].speedMul;
    return s;
  },

  dist: function (a, b) {
    var dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  },

  aliveCount: function (state, side) {
    var n = 0;
    for (var i = 0; i < state.units.length; i++) {
      if (state.units[i].alive && state.units[i].side === side) n++;
    }
    return n;
  },

  nearestEnemy: function (unit, units) {
    var best = null, bestD = Infinity;
    for (var i = 0; i < units.length; i++) {
      var o = units[i];
      if (!o.alive || o.side === unit.side) continue;
      var d = this.dist(unit, o);
      if (d < bestD) { bestD = d; best = o; }
    }
    return best;
  },

  unitAt: function (state, x, y, side) {
    for (var i = 0; i < state.units.length; i++) {
      var u = state.units[i];
      if (!u.alive) continue;
      if (side && u.side !== side) continue;
      var dx = u.x - x, dy = u.y - y;
      if (Math.sqrt(dx * dx + dy * dy) <= u.def.radius + 6) return u;
    }
    return null;
  },

  // ── 피해 / 회복 ──────────────────────────────────────────────
  applyDamage: function (unit, dmg, source, state) {
    if (!unit.alive) return 0;
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
    if (unit.hp <= 0) { unit.hp = 0; unit.alive = false; }

    // 흡혈 — 실제로 들어간 피해 기준
    if (source && source.alive && eff > 0) {
      var ls = (source.def.lifesteal || 0) * (source._lsMul || 1);
      if (ls > 0) this.heal(source, eff * ls);
    }
    return eff;
  },

  heal: function (u, amount) {
    if (!u.alive) return;
    u.hp = Math.min(u.maxHp, u.hp + amount);
  },

  usePotion: function (u) {
    if (!u.isHero || u.potionCharges <= 0) return false;
    if (u.hp >= u.maxHp) return false;
    u.potionCharges--;
    this.heal(u, u.potionHeal);
    return true;
  },

  // ── 이동 ────────────────────────────────────────────────────
  clampToLeash: function (u) {
    if (!isFinite(u.leash)) return;
    var dx = u.x - u.home.x, dy = u.y - u.home.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d > u.leash) {
      u.x = u.home.x + (dx / d) * u.leash;
      u.y = u.home.y + (dy / d) * u.leash;
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
    var ang = Math.atan2(ty - u.y, tx - u.x);
    u.facing = ang;

    if (def.attack === 'melee') {
      var half = ((def.coneDeg || 90) * Math.PI / 180) / 2;
      for (var i = 0; i < state.units.length; i++) {
        var o = state.units[i];
        if (!o.alive || o.side === u.side) continue;
        if (this.dist(u, o) > def.range + o.def.radius) continue;
        var a = Math.atan2(o.y - u.y, o.x - u.x);
        var diff = Math.atan2(Math.sin(a - ang), Math.cos(a - ang));
        if (Math.abs(diff) <= half) this.applyDamage(o, def.damage, u, state);
      }
      state.effects.push({
        kind: 'slash', x: u.x, y: u.y, angle: ang,
        range: def.range, half: half, t: 140, total: 140, side: u.side
      });

    } else if (def.attack === 'projectile') {
      state.projectiles.push({
        x: u.x, y: u.y,
        vx: Math.cos(ang) * def.projectileSpeed,
        vy: Math.sin(ang) * def.projectileSpeed,
        damage: def.damage,
        side: u.side,
        radius: def.projectileRadius,
        life: 3000,
        owner: u
      });

    } else if (def.attack === 'aoe') {
      state.effects.push({
        kind: 'telegraph', x: tx, y: ty, r: def.aoeRadius,
        t: def.telegraph, total: def.telegraph,
        damage: def.damage, side: u.side, owner: u
      });

    } else if (def.attack === 'targeted') {
      if (target && target.alive) {
        this.applyDamage(target, def.damage, u, state);
        state.effects.push({
          kind: 'beam', x1: u.x, y1: u.y, x2: target.x, y2: target.y,
          t: 160, total: 160, side: u.side
        });
      }
    }
  },

  // ── 스킬 ────────────────────────────────────────────────────
  skillReady: function (u, slot) {
    return u.isHero && u.alive && u.skillCd[slot] <= 0 && u.rootedFor <= 0;
  },

  castSkill: function (u, slot, tx, ty, state) {
    if (!this.skillReady(u, slot)) return false;
    var sk = null;
    for (var i = 0; i < u.hero.skills.length; i++) {
      if (u.hero.skills[i].slot === slot) { sk = u.hero.skills[i]; break; }
    }
    if (!sk) return false;

    var ang = Math.atan2(ty - u.y, tx - u.x);
    u.facing = ang;
    var self = this;
    var i2, o;

    if (sk.type === 'dash') {
      var nx = u.x + Math.cos(ang) * sk.dist;
      var ny = u.y + Math.sin(ang) * sk.dist;
      var fromX = u.x, fromY = u.y;
      u.x = nx; u.y = ny;
      this.clampToArena(u);
      if (sk.damage > 0) {
        for (i2 = 0; i2 < state.units.length; i2++) {
          o = state.units[i2];
          if (!o.alive || o.side === u.side) continue;
          if (this._distToSegment(o, fromX, fromY, u.x, u.y) <= sk.radius + o.def.radius) {
            this.applyDamage(o, sk.damage, u, state);
          }
        }
      }
      state.effects.push({
        kind: 'dashTrail', x1: fromX, y1: fromY, x2: u.x, y2: u.y,
        t: 260, total: 260, side: u.side
      });

    } else if (sk.type === 'aoeSelf') {
      for (i2 = 0; i2 < state.units.length; i2++) {
        o = state.units[i2];
        if (!o.alive || o.side === u.side) continue;
        var d = this.dist(u, o);
        if (d <= sk.radius + o.def.radius) {
          this.applyDamage(o, sk.damage, u, state);
          if (sk.knockback && d > 0.1) {
            var kx = (o.x - u.x) / d, ky = (o.y - u.y) / d;
            o.x += kx * sk.knockback; o.y += ky * sk.knockback;
            this.clampToArena(o); this.clampToLeash(o);
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
      state.projectiles.push({
        x: u.x, y: u.y,
        vx: Math.cos(ang) * sk.speed,
        vy: Math.sin(ang) * sk.speed,
        damage: sk.damage,
        side: u.side,
        radius: sk.radius,
        life: 3000,
        pierce: !!sk.pierce,
        hitSet: [],
        owner: u,
        big: true
      });

    } else if (sk.type === 'strike') {
      var tgt = this.nearestEnemy(u, state.units);
      if (tgt && this.dist(u, tgt) <= u.def.range + 70) {
        u._lsMul = sk.lifestealMul || 1;
        this.applyDamage(tgt, sk.damage, u, state);
        u._lsMul = 1;
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
        t: sk.duration
      });
      if (sk.shield) u.shield += sk.shield;
      state.effects.push({
        kind: 'ring', x: u.x, y: u.y, r: u.def.radius + 26,
        t: 400, total: 400, side: u.side
      });

    } else if (sk.type === 'pull') {
      var halfP = (sk.coneDeg * Math.PI / 180) / 2;
      for (i2 = 0; i2 < state.units.length; i2++) {
        o = state.units[i2];
        if (!o.alive || o.side === u.side) continue;
        var dd = this.dist(u, o);
        if (dd > sk.dist) continue;
        var aa = Math.atan2(o.y - u.y, o.x - u.x);
        var df = Math.atan2(Math.sin(aa - ang), Math.cos(aa - ang));
        if (Math.abs(df) > halfP) continue;
        this.applyDamage(o, sk.damage, u, state);
        // 영웅 쪽으로 끌어당긴다 (leash는 그대로 적용되어 진형이 무너지진 않는다)
        var pullTo = Math.max(0, dd - 120);
        o.x = u.x + Math.cos(aa) * pullTo;
        o.y = u.y + Math.sin(aa) * pullTo;
        this.clampToArena(o); this.clampToLeash(o);
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
  runAI: function (u, state, dt) {
    var def = u.def;
    var moveTo = null;
    var engage = true;
    var tgt = null;

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
      if (!a.alive) continue;
      for (var j = i + 1; j < us.length; j++) {
        var b = us[j];
        if (!b.alive) continue;
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
          for (var m = 0; m < state.units.length; m++) {
            var v = state.units[m];
            if (!v.alive || v.side === u.side) continue;
            if (this.dist(u, v) <= au.radius + v.def.radius) {
              this.applyDamage(v, au.dps * 0.25, u, state);
            }
          }
        }
        if (au.t <= 0) u.auras.splice(k, 1);
      }

      if (u.rootedFor > 0) continue;      // 속박 중엔 행동 불가
      if (u.manual) continue;             // 플레이어가 직접 몰고 있는 유닛은 AI 생략
      this.runAI(u, state, dt);
    }

    this.separate(state);

    for (i = 0; i < state.units.length; i++) {
      if (state.units[i].alive) this.clampToLeash(state.units[i]);
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
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dtMs;

      var A = GAME.CONFIG.ARENA;
      if (p.life <= 0 || p.x < A.x || p.x > A.right || p.y < A.y || p.y > A.bottom) {
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
