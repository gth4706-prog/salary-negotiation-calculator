window.GAME = window.GAME || {};

// 영웅을 대신 조작하는 AI. 플레이어가 **전략가로 방어**할 때 공격해 오는 쪽이다.
// skill 값(0~1)은 학습으로 오르고, 오를수록 회피·스킬 운용·물약 판단이 정교해진다.
//
// 낮은 숙련도에서는 사람 초보처럼 굴게 만든다 — 반응이 늦고, 회피를 흘리고,
// 스킬을 아무 때나 쓴다. 그래야 '점점 어려워진다'가 체감된다.
GAME.AIHero = function (state, hero, skill, adapt) {
  this.state = state;
  this.hero = hero;
  this.skill = Math.max(0, Math.min(1, skill || 0));
  //  ── 학습된 전술 (2026-08-08) ────────────────────────────────────────────
  //  ⚠ `skill` 과 다른 축이다. skill 은 **얼마나 잘하나**(반응 속도·조준),
  //    adapt 는 **무엇을 노리나**(전술). 섞으면 "어려워지기만 하고 안 배운다".
  //  ⚠ 안 주면 예전과 **완전히 같게** 군다(0). 학습이 꺼진 경로가 있어도 안전하다.
  this.adapt = adapt || {};
  if (this.adapt.focusRanged === undefined) this.adapt.focusRanged = 0;
  if (this.adapt.killSupport === undefined) this.adapt.killSupport = 0;
  if (this.adapt.avoidZone === undefined) this.adapt.avoidZone = 0;
  this.reactT = 0;
  this.retargetT = 0;
  this.target = null;
};

GAME.AIHero.prototype.update = function (dtMs) {
  var C = GAME.Combat;
  var h = this.hero, s = this.state;
  if (!h.alive) return;

  var sk = this.skill;
  var dt = dtMs / 1000;

  // 반응 지연 — 숙련도가 낮으면 판단이 느리다 (초보 260ms, 숙련 40ms)
  var reactMs = 260 - 220 * sk;
  this.reactT -= dtMs;
  var canReact = this.reactT <= 0;
  if (canReact) this.reactT = reactMs;

  var enemies = [];
  for (var i = 0; i < s.units.length; i++) {
    var u = s.units[i];
    if (u.alive && u.side === 'strategist' && !C.isHazard(u)) enemies.push(u);
  }
  if (!enemies.length) return;

  // 목표 선정 — 숙련도가 높으면 체력 낮은 적을 골라 빠르게 지운다
  this.retargetT -= dtMs;
  if (!this.target || !this.target.alive || this.retargetT <= 0) {
    this.retargetT = 900 - 500 * sk;
    var best = null, bestScore = Infinity;
    for (i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      var d = C.dist(h, e);
      var score = sk > 0.5 ? (e.hp * 0.6 + d) : d;   // 숙련도 높으면 약한 적 우선
      //  배운 것: 원거리부터 지운다. 거리 점수에서 깎아 **더 멀어도 먼저 고른다**.
      //  ⚠ 620 은 아레나 폭의 3/4 쯤이다. 처음에 260 으로 뒀더니 **표적이 안 바뀌었다** —
      //    코앞(30px)과 반대편(240px) 차이도 못 넘겨서 배운 티가 안 났다.
      //  ⚠ 값을 무한대로 두지 않고 거리 기준으로 깎는 이유: 완전히 무시하면 코앞의
      //    전사를 놔두고 반대편 궁수만 쫓다가 아무것도 못 잡는다.
      if (this.adapt.focusRanged > 0 && (e.def.range || 0) > 150) {
        score -= 620 * this.adapt.focusRanged;
      }
      //  배운 것: 지원부터 끊는다. **때리지 않는 유닛**(약초꾼·껍질장이·울짱꾼)과
      //  회복·보호막을 주는 유닛이 대상이다 — 저들이 살아 있으면 아무리 때려도
      //  되돌려진다.
      //  ⚠ 두 가설이 겹치면 할인이 두 번 붙는다. 그건 의도한 것이다 — 원거리 지원
      //    유닛(약초꾼)이 둘 다에 걸리는 건 실제로 가장 먼저 끊어야 할 표적이다.
      if (this.adapt.killSupport > 0) {
        var ab = e.def.ability;
        var isSup = (e.def.damage || 0) <= 0 ||
                    (ab && (ab.type === 'healBurst' || ab.type === 'warcry'));
        if (isSup) score -= 520 * this.adapt.killSupport;
      }
      if (score < bestScore) { bestScore = score; best = e; }
    }
    this.target = best;
  }
  var tgt = this.target || enemies[0];

  var acted = false;

  // ── 위험 회피 ──
  if (canReact && sk > 0.12) {
    var dodgePower = 0.5 + 1.3 * sk;

    // 지뢰
    for (i = 0; i < s.units.length; i++) {
      var mn = s.units[i];
      if (!mn.alive || !C.isHazard(mn)) continue;
      var dm = C.dist(h, mn);
      if (dm < mn.def.triggerRadius + 40 + 30 * sk) {
        //  ⚠ 여기에도 같은 함정이 있었다(정중앙이면 `dm||1` 로 0 방향이 나온다).
        //    지뢰 위에 정확히 서는 일은 드물어 여태 안 드러났을 뿐이다.
        var ux, uy;
        if (dm < 1) { ux = GAME.DetMath.cos(h.facing || 0); uy = GAME.DetMath.sin(h.facing || 0); }
        else { ux = (h.x - mn.x) / dm; uy = (h.y - mn.y) / dm; }
        h.x += ux * C.effSpeed(h) * dt * dodgePower;
        h.y += uy * C.effSpeed(h) * dt * dodgePower;
        C.clampToArena(h);
        acted = true;
      }
    }

    //  배운 것: 자리를 잡고 기다리는 피해(잉걸불·가시 오라)를 크게 돌아간다.
    //  ⚠ 이건 **회피가 아니라 경로 선택**이다. 예고는 잠깐 떴다 사라지지만 구역은
    //    몇 초를 버티므로, 같은 세기로 밀어내면 구역 가장자리에서 진동만 한다.
    //    그래서 반경에 여유(`pad`)를 크게 주고 밀어내는 힘도 따로 잡는다.
    if (this.adapt.avoidZone > 0) {
      var zp = 0.6 + 1.0 * this.adapt.avoidZone;
      var zones = s.emberZones || [];
      for (i = 0; i < zones.length; i++) {
        var zn = zones[i];
        if (zn.side === 'controller') continue;
        var dz = Math.sqrt((h.x - zn.x) * (h.x - zn.x) + (h.y - zn.y) * (h.y - zn.y));
        var pad = zn.r + 30 + 50 * this.adapt.avoidZone;
        if (dz < pad) {
          //  ⚠ **정중앙에 서 있으면 도망칠 방향이 0 으로 나뉜다** — 그대로 두면
          //    영웅이 불 한가운데 못 박힌 채 타 죽는다(실측: 30프레임 동안 0px 이동).
          //    구역은 던져서 만드는 물건이라 영웅 발밑에 정확히 떨어질 수 있다.
          var zx, zy;
          if (dz < 1) { zx = GAME.DetMath.cos(h.facing || 0); zy = GAME.DetMath.sin(h.facing || 0); }
          else { zx = (h.x - zn.x) / dz; zy = (h.y - zn.y) / dz; }
          h.x += zx * C.effSpeed(h) * dt * zp;
          h.y += zy * C.effSpeed(h) * dt * zp;
          C.clampToArena(h);
          acted = true;
        }
      }
      //  고정 오라(울짱꾼)도 같은 성격이다 — 자리를 잡고 기다린다.
      for (i = 0; i < s.units.length; i++) {
        var au = s.units[i];
        if (!au.alive || au.side === h.side || !au.def.auraAlways) continue;
        var da = C.dist(h, au), padA = (au.def.auraRadius || 0) + 26 + 40 * this.adapt.avoidZone;
        if (da < padA) {
          var ax, ay;
          if (da < 1) { ax = GAME.DetMath.cos(h.facing || 0); ay = GAME.DetMath.sin(h.facing || 0); }
          else { ax = (h.x - au.x) / da; ay = (h.y - au.y) / da; }
          h.x += ax * C.effSpeed(h) * dt * zp;
          h.y += ay * C.effSpeed(h) * dt * zp;
          C.clampToArena(h);
          acted = true;
        }
      }
    }

    // 예고된 광역 폭발
    for (i = 0; i < s.effects.length; i++) {
      var ef = s.effects[i];
      if (ef.kind !== 'telegraph' || ef.side === 'controller') continue;
      var de = Math.sqrt((h.x - ef.x) * (h.x - ef.x) + (h.y - ef.y) * (h.y - ef.y));
      if (de < ef.r + 20) {
        var ex, ey;
        if (de < 1) { ex = GAME.DetMath.cos(h.facing || 0); ey = GAME.DetMath.sin(h.facing || 0); }
        else { ex = (h.x - ef.x) / de; ey = (h.y - ef.y) / de; }
        h.x += ex * C.effSpeed(h) * dt * dodgePower;
        h.y += ey * C.effSpeed(h) * dt * dodgePower;
        C.clampToArena(h);
        acted = true;
      }
    }

    // 논타겟 투사체 — 숙련도가 낮으면 잘 못 피한다
    if (sk > 0.3) {
      for (i = 0; i < s.projectiles.length; i++) {
        var p = s.projectiles[i];
        if (p.side === 'controller' || p.homing) continue;
        var dx = h.x - p.x, dy = h.y - p.y;
        var dp = Math.sqrt(dx * dx + dy * dy);
        if (dp < 60 + 40 * sk) {
          var px = -p.vy, py = p.vx;
          var pl = Math.sqrt(px * px + py * py) || 1;
          h.x += (px / pl) * C.effSpeed(h) * dt * dodgePower;
          h.y += (py / pl) * C.effSpeed(h) * dt * dodgePower;
          C.clampToArena(h);
          acted = true;
        }
      }
    }
  }

  // ── 물약 ──
  var potionAt = 0.2 + 0.25 * sk;      // 숙련도 높으면 더 여유있게 쓴다
  if (h.hp < h.maxHp * potionAt) C.usePotion(h);

  // ── 스킬 ──
  if (canReact) {
    for (var q = 0; q < GAME.SKILL_SLOTS.length; q++) {
      var slot = GAME.SKILL_SLOTS[q];
      if (!C.skillReady(h, slot)) continue;
      // 숙련도가 낮으면 아무 때나 쓴다. 높으면 적이 뭉쳐 있을 때를 노린다.
      var worth = true;
      if (sk > 0.45) {
        var near = 0;
        for (i = 0; i < enemies.length; i++) if (C.dist(h, enemies[i]) < 170) near++;
        worth = near >= 2 || C.dist(h, tgt) <= h.def.range + 60;
      }
      if (worth) { C.castSkill(h, slot, tgt.x, tgt.y, s); break; }
    }
  }

  if (!acted) h.order = { type: 'attack', target: tgt };
};
