window.GAME = window.GAME || {};

GAME.BattleScene = function () {
  Phaser.Scene.call(this, { key: 'Battle' });
};
GAME.BattleScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.BattleScene.prototype.constructor = GAME.BattleScene;

GAME.BattleScene.prototype.init = function (data) {
  this.formation = GAME.Formations.getById(data.formationId);
  this.heroKey = data.heroKey;
  this.items = data.items || {};
  this.startPos = data.startPos || { x: 600, y: 590 };
  this.ended = false;
  this.markers = [];
};

GAME.BattleScene.prototype.create = function () {
  var C = GAME.CONFIG.COLORS;
  var self = this;

  this.cameras.main.setBackgroundColor(C.bg);
  this.g = this.add.graphics();

  this.state = GAME.Combat.createState();

  for (var i = 0; i < this.formation.units.length; i++) {
    var e = this.formation.units[i];
    if (!GAME.UNITS[e.type]) continue;
    this.state.units.push(GAME.Combat.createUnit(e.type, e.x, e.y, 'strategist'));
  }

  this.hero = GAME.Combat.createHero(
    this.heroKey, this.startPos.x, this.startPos.y, 'controller', this.items);
  this.state.units.push(this.hero);

  this.input.mouse.disableContextMenu();
  this.ctrl = new GAME.InputController(this, this.state, this.hero);

  var barTop = 486;

  this.hudHero = GAME.UI.label(this, 24, barTop, '', 17, C.accent, 0);
  this.hudTimer = GAME.UI.label(this, 600, barTop - 2, '', 26, C.text, 0.5).setOrigin(0.5, 0);
  this.hudEnemy = GAME.UI.label(this, 1176, barTop, '', 17, C.accentAlt, 0).setOrigin(1, 0);

  // 스킬 바
  this.skillBoxes = [];
  var slots = ['Q', 'W', 'E', 'R'];
  for (var s = 0; s < slots.length; s++) {
    var cx = 420 + s * 104;
    var cy = barTop + 118;
    this.add.rectangle(cx, cy, 96, 96, 0x1c1c28).setStrokeStyle(1, 0x3a3a52);
    this.skillBoxes.push({
      slot: slots[s], cx: cx, cy: cy,
      key: GAME.UI.label(this, cx - 38, cy - 40, slots[s], 15, C.accent, 0),
      name: GAME.UI.label(this, cx, cy + 26, '', 12, C.text, 0.5).setOrigin(0.5),
      cd: GAME.UI.label(this, cx, cy - 4, '', 20, C.text, 0.5).setOrigin(0.5)
    });
  }

  this.potionBox = { cx: 856, cy: barTop + 118 };
  this.add.rectangle(this.potionBox.cx, this.potionBox.cy, 96, 96, 0x1c1c28).setStrokeStyle(1, 0x3a3a52);
  GAME.UI.label(this, this.potionBox.cx - 38, this.potionBox.cy - 40, 'F', 15, C.accent, 0);
  this.potionText = GAME.UI.label(this, this.potionBox.cx, this.potionBox.cy - 2, '', 15, C.text, 0.5).setOrigin(0.5);
  GAME.UI.label(this, this.potionBox.cx, this.potionBox.cy + 26, '물약', 12, C.text, 0.5).setOrigin(0.5);

  GAME.UI.label(this, 600, barTop + 190,
    '우클릭 이동 / 적 클릭 공격   ·   방향키 직접 이동   ·   Q W E R 스킬(마우스 방향)   ·   F 물약   ·   Space 기본공격',
    13, '#6f6f88', 0.5).setOrigin(0.5);

  this.events.on('shutdown', function () { if (self.ctrl) self.ctrl.destroy(); });
};

GAME.BattleScene.prototype.showMarker = function (x, y, type) {
  this.markers.push({ x: x, y: y, type: type, t: 450, total: 450 });
};

GAME.BattleScene.prototype.update = function (time, delta) {
  var dt = Math.min(delta, 50);

  if (!this.state.over) {
    this.ctrl.update(dt);
    GAME.Combat.update(this.state, dt);
  }

  for (var i = this.markers.length - 1; i >= 0; i--) {
    this.markers[i].t -= dt;
    if (this.markers[i].t <= 0) this.markers.splice(i, 1);
  }

  this.draw();
  this.updateHud();

  if (this.state.over && !this.ended) {
    this.ended = true;
    var self = this;
    this.time.delayedCall(1100, function () {
      self.scene.start('Result', {
        winner: self.state.winner,
        formationId: self.formation.id,
        heroKey: self.heroKey
      });
    });
  }
};

GAME.BattleScene.prototype.updateHud = function () {
  var C = GAME.CONFIG.COLORS;
  var h = this.hero;
  var remain = Math.max(0, GAME.CONFIG.BATTLE_TIME - this.state.elapsed / 1000);

  this.hudTimer.setText(remain.toFixed(1) + '초');
  this.hudTimer.setColor(remain < 15 ? C.warn : C.text);

  var hpTxt = h.alive ? Math.ceil(h.hp) + ' / ' + h.maxHp : '전사';
  var shieldTxt = h.shield > 0 ? '  +보호막 ' + Math.ceil(h.shield) : '';
  this.hudHero.setText(h.hero.name + '   HP ' + hpTxt + shieldTxt);

  this.hudEnemy.setText(this.formation.name + '   남은 적 ' +
    GAME.Combat.aliveCount(this.state, 'strategist') + '기');

  for (var i = 0; i < this.skillBoxes.length; i++) {
    var b = this.skillBoxes[i];
    var sk = h.hero.skills[i];
    b.name.setText(sk.name);
    var cd = h.skillCd[b.slot];
    b.cd.setText(cd > 0 ? (cd / 1000).toFixed(1) : '준비');
    b.cd.setColor(cd > 0 ? C.textDim : C.accent);
  }

  this.potionText.setText(h.potionCharges > 0 ? h.potionCharges + '회' : '없음');
  this.potionText.setColor(h.potionCharges > 0 ? C.text : C.textDim);
};

GAME.BattleScene.prototype.draw = function () {
  var C = GAME.CONFIG.COLORS;
  var Iso = GAME.Iso;
  var g = this.g;
  var s = this.state;
  var i;

  g.clear();
  GAME.UI.drawArena(g, { zones: false });

  // ── 지면 레이어: 마커·덫·이펙트 ──
  for (i = 0; i < this.markers.length; i++) {
    var mk = this.markers[i];
    var a = mk.t / mk.total;
    g.lineStyle(2, mk.type === 'attack' ? 0xef4444 : 0x7ed957, a);
    GAME.UI.groundCircle(g, mk.x, mk.y, 8 + (1 - a) * 16);
  }

  for (i = 0; i < s.traps.length; i++) {
    var tr = s.traps[i];
    g.lineStyle(2, 0x7ef0d0, 0.85);
    GAME.UI.groundCircle(g, tr.x, tr.y, tr.radius);
    g.fillStyle(0x7ef0d0, 0.12);
    GAME.UI.groundCircleFill(g, tr.x, tr.y, tr.radius);
  }

  for (i = 0; i < s.effects.length; i++) {
    var e = s.effects[i];
    var col = e.side === 'controller' ? C.controller : C.strategist;

    if (e.kind === 'telegraph') {
      var prog = 1 - e.t / e.total;
      if (prog < 0) prog = 0;
      g.fillStyle(0xef4444, 0.10 + prog * 0.20);
      GAME.UI.groundCircleFill(g, e.x, e.y, e.r);
      g.lineStyle(2, 0xef4444, 0.5 + prog * 0.5);
      GAME.UI.groundCircle(g, e.x, e.y, e.r);
      g.lineStyle(2, 0xef4444, 0.85);
      GAME.UI.groundCircle(g, e.x, e.y, e.r * prog);

    } else if (e.kind === 'blast') {
      var b2 = e.t / e.total;
      g.fillStyle(0xffd166, 0.55 * b2);
      GAME.UI.groundCircleFill(g, e.x, e.y, e.r);

    } else if (e.kind === 'ring') {
      var r2 = e.t / e.total;
      g.lineStyle(4, col, r2);
      GAME.UI.groundCircle(g, e.x, e.y, e.r * (1.15 - r2 * 0.15));

    } else if (e.kind === 'slash') {
      var sa = e.t / e.total;
      g.fillStyle(col, 0.26 * sa);
      g.slice(e.x, Iso.toScreenY(e.y), e.range,
        e.angle - e.half, e.angle + e.half, false);
      g.fillPath();

    } else if (e.kind === 'dashTrail') {
      var da = e.t / e.total;
      g.lineStyle(9, col, 0.45 * da);
      g.lineBetween(e.x1, Iso.toScreenY(e.y1) - 14, e.x2, Iso.toScreenY(e.y2) - 14);

    } else if (e.kind === 'beam') {
      var ba = e.t / e.total;
      g.lineStyle(3, 0xf0a86a, ba);
      g.lineBetween(e.x1, Iso.toScreenY(e.y1) - 14, e.x2, Iso.toScreenY(e.y2) - 14);

    } else if (e.kind === 'spark') {
      var pa = e.t / e.total;
      g.fillStyle(0xffffff, pa);
      g.fillCircle(e.x, Iso.toScreenY(e.y) - 12, 4 * pa + 2);
    }
  }

  // 영웅 오라
  for (i = 0; i < this.hero.auras.length; i++) {
    var au = this.hero.auras[i];
    g.fillStyle(C.controller, 0.10);
    GAME.UI.groundCircleFill(g, this.hero.x, this.hero.y, au.radius);
    g.lineStyle(2, C.controller, 0.5);
    GAME.UI.groundCircle(g, this.hero.x, this.hero.y, au.radius);
  }

  // ── 유닛: 뒤(위)에서 앞(아래) 순으로 그려 겹침이 자연스럽게 ──
  var alive = [];
  for (i = 0; i < s.units.length; i++) if (s.units[i].alive) alive.push(s.units[i]);
  alive.sort(function (a, b) { return a.y - b.y; });

  for (i = 0; i < alive.length; i++) {
    var u = alive[i];
    var color = GAME.UI.sideColor(u.side);
    if (u.flash > 0) color = 0xffffff;

    if (u.isHero) {
      g.lineStyle(2, C.controller, 0.55);
      GAME.UI.groundCircle(g, u.x, u.y, u.def.radius + 10);
    }

    var pos = GAME.UI.drawUnit(g, u.def, u.x, u.y, color, 1);

    if (!u.isHero && !GAME.isNonTarget(u.def)) {
      g.lineStyle(2, 0xf0a86a, 0.9);
      GAME.UI.groundCircle(g, u.x, u.y, u.def.radius + 6);
    }

    if (u.rootedFor > 0) {
      g.lineStyle(2, 0x7ef0d0, 0.9);
      GAME.UI.groundCircle(g, u.x, u.y, u.def.radius + 12);
    }

    // 바라보는 방향
    g.lineStyle(2, color, 0.65);
    g.lineBetween(pos.sx, pos.by,
      pos.sx + Math.cos(u.facing) * (u.def.radius + 9),
      pos.by + Math.sin(u.facing) * (u.def.radius + 9) * Iso.TILT);

    // 체력 바
    var bw = u.isHero ? 64 : u.def.radius * 2.3;
    var ratio = u.hp / u.maxHp;
    var by = pos.by - u.def.radius - 10;
    g.fillStyle(0x000000, 0.6);
    g.fillRect(pos.sx - bw / 2, by, bw, u.isHero ? 7 : 4);
    g.fillStyle(ratio > 0.35 ? C.hpGood : C.hpBad, 1);
    g.fillRect(pos.sx - bw / 2, by, bw * ratio, u.isHero ? 7 : 4);
    if (u.shield > 0) {
      var sw = Math.min(1, u.shield / u.maxHp);
      g.fillStyle(0x7ec8f0, 1);
      g.fillRect(pos.sx - bw / 2, by - 5, bw * sw, 4);
    }
  }

  // ── 투사체 ──
  for (i = 0; i < s.projectiles.length; i++) {
    var p = s.projectiles[i];
    var pcol = p.side === 'controller' ? 0x7ef0d0 : 0xffb06a;
    var psx = p.x, psy = Iso.toScreenY(p.y) - 12;
    var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1;
    var ux = p.vx / sp, uy = (p.vy / sp) * Iso.TILT;
    var rr = p.radius * (p.big ? 1.5 : 1);
    g.lineStyle(3, pcol, 0.35);
    g.lineBetween(psx - ux * 22, psy - uy * 22, psx, psy);
    g.fillStyle(pcol, 0.22);
    g.fillCircle(psx, psy, rr + 6);
    g.fillStyle(pcol, 1);
    g.fillCircle(psx, psy, rr);
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(psx, psy, Math.max(2, rr - 3));
  }

  if (this.state.over) {
    g.fillStyle(0x000000, 0.45);
    g.fillRect(0, 0, GAME.CONFIG.WIDTH, GAME.CONFIG.HEIGHT);
  }
};
