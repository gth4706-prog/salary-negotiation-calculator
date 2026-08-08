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
  this.adapt = adapt || { focusRanged: 0 };
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
        var ux = (h.x - mn.x) / (dm || 1), uy = (h.y - mn.y) / (dm || 1);
        h.x += ux * C.effSpeed(h) * dt * dodgePower;
        h.y += uy * C.effSpeed(h) * dt * dodgePower;
        C.clampToArena(h);
        acted = true;
      }
    }

    // 예고된 광역 폭발
    for (i = 0; i < s.effects.length; i++) {
      var ef = s.effects[i];
      if (ef.kind !== 'telegraph' || ef.side === 'controller') continue;
      var de = Math.sqrt((h.x - ef.x) * (h.x - ef.x) + (h.y - ef.y) * (h.y - ef.y));
      if (de < ef.r + 20) {
        var ex = (h.x - ef.x) / (de || 1), ey = (h.y - ef.y) / (de || 1);
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
