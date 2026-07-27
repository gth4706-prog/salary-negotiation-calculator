window.GAME = window.GAME || {};

// 모바일 세로 화면 조작 패드 — 로블록스식.
//
//   왼쪽 아래   가상 스틱(썸스틱). 끌면 그 방향으로 계속 걷는다.
//   오른쪽 아래 원형 버튼 — 큰 것 하나(기본공격) + 사분원 호에 QWER + 물약.
//
// 크기 기준(중요): 로블록스 모바일은 썸스틱 지름이 화면 짧은 변의 약 20%,
// 액션 버튼은 그 절반 이하다. 모바일 게임 이식작들이 흔히 저지르는
// "버튼이 화면 절반을 덮는" 실수를 피하려고 여기 비율을 상수로 못박아 둔다.
// 전장을 가리는 순간 회피 게임이 성립하지 않는다.
GAME.TouchPad = function (scene, ctrl) {
  this.scene = scene;
  this.ctrl = ctrl;
  this.hero = ctrl.hero;
  this.objects = [];
  this.buttons = [];
  this.stick = { active: false, id: null, dx: 0, dy: 0, cx: 0, cy: 0 };
  this._build();
};

GAME.TouchPad.SIZES = function () {
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var shortSide = Math.min(W, H);
  return {
    stickR: Math.round(shortSide * 0.105),   // 바깥 링 반지름 (지름 = 짧은 변의 21%)
    knobR: Math.round(shortSide * 0.048),
    mainR: Math.round(shortSide * 0.068),    // 기본공격
    skillR: Math.round(shortSide * 0.046),   // QWER
    potionR: Math.round(shortSide * 0.036)
  };
};

GAME.TouchPad.prototype._build = function () {
  var scene = this.scene, self = this;
  var C = GAME.CONFIG.COLORS;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var S = GAME.TouchPad.SIZES();

  var margin = Math.round(Math.min(W, H) * 0.055);
  var baseY = H - S.stickR - margin;

  // ── 왼쪽: 가상 스틱 ──
  var sx = S.stickR + margin;
  this.stick.cx = sx;
  this.stick.cy = baseY;

  this.stickRing = scene.add.circle(sx, baseY, S.stickR, 0x000000, 0.22)
    .setStrokeStyle(2, 0xffffff, 0.30).setDepth(900).setScrollFactor(0);
  this.stickKnob = scene.add.circle(sx, baseY, S.knobR, 0xffffff, 0.30)
    .setStrokeStyle(2, 0xffffff, 0.55).setDepth(901).setScrollFactor(0);
  this.objects.push(this.stickRing, this.stickKnob);

  // 스틱은 링 밖에서 눌러도 잡히도록 넉넉한 판정 원을 따로 둔다
  this.stickZone = scene.add.circle(sx, baseY, S.stickR * 1.6, 0xffffff, 0.001)
    .setDepth(899).setScrollFactor(0);
  this.stickZone.setInteractive(
    new Phaser.Geom.Circle(S.stickR * 1.6, S.stickR * 1.6, S.stickR * 1.6),
    Phaser.Geom.Circle.Contains);
  this.objects.push(this.stickZone);

  // ── 오른쪽: 액션 버튼 ──
  var cx = W - S.mainR - margin;
  var cy = baseY;

  this._addButton('ATK', cx, cy, S.mainR, '공격', 0x35d0a5, function () {
    self._attack();
  });

  // 기본공격 버튼을 중심으로 왼쪽 위 호에 QWER 을 건다.
  //
  // 각도를 손으로 박으면 버튼 크기가 바뀔 때 조용히 겹친다(실제로 41px 간격에
  // 60px 이 필요해 겹쳤다). 그래서 **반지름에서 필요한 각도를 역산**한다.
  var n = GAME.SKILL_SLOTS.length;
  var gap = Math.round(S.skillR * 0.20);
  var arcR = S.mainR + S.skillR + Math.round(S.skillR * 1.15);
  // 이웃한 두 버튼의 중심 거리가 (반지름 합 + 여백) 이상이 되는 최소 각도
  var need = 2 * Math.asin(Math.min(1, (S.skillR * 2 + gap) / (2 * arcR)));
  var start = 6 * Math.PI / 180;
  GAME.SKILL_SLOTS.forEach(function (slot, i) {
    var a = start + need * i;
    self._addButton(slot, cx - Math.cos(a) * arcR, cy - Math.sin(a) * arcR,
      S.skillR, slot, 0x9b8cf0, function () { self._skill(slot); });
  });

  // 물약 — 스틱 위쪽(왼손 엄지로 닿는 자리)
  this._addButton('POTION', sx, baseY - S.stickR - S.potionR - 10, S.potionR, '물약', 0xf0a86a,
    function () { GAME.Combat.usePotion(self.hero); });

  this._bind();
  this.refresh();
};

GAME.TouchPad.prototype._addButton = function (key, x, y, r, label, color, onTap) {
  var scene = this.scene;
  var circle = scene.add.circle(x, y, r, 0x11131c, 0.55)
    .setStrokeStyle(2, color, 0.75).setDepth(900).setScrollFactor(0);
  circle.setInteractive(new Phaser.Geom.Circle(r, r, r), Phaser.Geom.Circle.Contains);

  var text = scene.add.text(x, y, label, {
    fontFamily: GAME.CONFIG.FONT,
    fontSize: Math.max(10, Math.round(r * 0.62)) + 'px',
    color: '#e8e8f0'
  }).setOrigin(0.5).setDepth(902).setScrollFactor(0);

  // 쿨다운 표시 — 원을 덮는 어두운 원판의 알파로 남은 시간을 보여준다
  var cool = scene.add.circle(x, y, r - 1, 0x000000, 0).setDepth(901).setScrollFactor(0);

  var self = this;
  circle.on('pointerdown', function (p) {
    p.event && p.event.preventDefault && p.event.preventDefault();
    circle.setFillStyle(0x2a2f42, 0.8);
    onTap();
  });
  circle.on('pointerup', function () { circle.setFillStyle(0x11131c, 0.55); });
  circle.on('pointerout', function () { circle.setFillStyle(0x11131c, 0.55); });

  var b = { key: key, circle: circle, text: text, cool: cool, r: r, color: color };
  this.buttons.push(b);
  this.objects.push(circle, text, cool);
  return b;
};

GAME.TouchPad.prototype._attack = function () {
  var h = this.hero;
  if (!h.alive || h.cd > 0) return;
  var tgt = GAME.Combat.nearestEnemy(h, this.ctrl.state.units);
  if (tgt && GAME.Combat.dist(h, tgt) <= h.def.range) {
    GAME.Combat.fire(h, tgt.x, tgt.y, tgt, this.ctrl.state);
    h.cd = h.def.cooldown;
  } else if (h.def.attack !== 'melee') {
    // 원거리는 바라보는 방향으로 쏜다 (사거리 밖이어도 견제가 된다)
    GAME.Combat.fire(h, h.x + Math.cos(h.facing) * h.def.range,
      h.y + Math.sin(h.facing) * h.def.range, null, this.ctrl.state);
    h.cd = h.def.cooldown;
  } else if (tgt) {
    // 근접인데 멀면 그쪽으로 붙는다
    h.order = { type: 'attack', target: tgt };
  }
};

GAME.TouchPad.prototype._skill = function (slot) {
  // 조준이 필요한 스킬은 버튼을 누르면 조준 모드로 들어가고, 다음 탭 위치에 시전된다.
  this.ctrl.armSkill(slot);
  this.refresh();
};

GAME.TouchPad.prototype._bind = function () {
  var self = this;
  var S = GAME.TouchPad.SIZES();

  this.stickZone.on('pointerdown', function (p) {
    self.stick.active = true;
    self.stick.id = p.id;
    self._moveKnob(p);
  });

  this.scene.input.on('pointermove', function (p) {
    if (self.stick.active && p.id === self.stick.id) self._moveKnob(p);
  });

  var release = function (p) {
    if (!self.stick.active || p.id !== self.stick.id) return;
    self.stick.active = false;
    self.stick.dx = 0; self.stick.dy = 0;
    self.stickKnob.setPosition(self.stick.cx, self.stick.cy);
  };
  this.scene.input.on('pointerup', release);
  this.scene.input.on('pointerupoutside', release);
};

GAME.TouchPad.prototype._moveKnob = function (p) {
  var S = GAME.TouchPad.SIZES();
  var dx = p.x - this.stick.cx, dy = p.y - this.stick.cy;
  var len = Math.sqrt(dx * dx + dy * dy);
  var max = S.stickR;
  if (len > max) { dx = dx / len * max; dy = dy / len * max; len = max; }
  this.stickKnob.setPosition(this.stick.cx + dx, this.stick.cy + dy);

  // 데드존 — 손가락을 올려두기만 한 걸 이동으로 읽지 않는다
  var dead = max * 0.18;
  if (len < dead) { this.stick.dx = 0; this.stick.dy = 0; return; }
  this.stick.dx = dx / max;
  this.stick.dy = dy / max;
};

// 이 좌표가 조작 패드 위인가 — 전장 탭과 구분하기 위해 쓴다
GAME.TouchPad.prototype.hits = function (x, y) {
  var S = GAME.TouchPad.SIZES();
  var sdx = x - this.stick.cx, sdy = y - this.stick.cy;
  if (sdx * sdx + sdy * sdy <= Math.pow(S.stickR * 1.6, 2)) return true;
  for (var i = 0; i < this.buttons.length; i++) {
    var b = this.buttons[i];
    var dx = x - b.circle.x, dy = y - b.circle.y;
    if (dx * dx + dy * dy <= b.r * b.r * 1.2) return true;
  }
  return false;
};

// 쿨다운·조준 상태를 버튼에 반영
GAME.TouchPad.prototype.refresh = function () {
  var h = this.hero;
  for (var i = 0; i < this.buttons.length; i++) {
    var b = this.buttons[i];
    if (GAME.SKILL_SLOTS.indexOf(b.key) === -1) continue;
    var ready = GAME.Combat.skillReady(h, b.key);
    var armed = this.ctrl.armedSkill === b.key;
    b.circle.setStrokeStyle(armed ? 3 : 2, armed ? 0xffd166 : b.color, ready ? 0.85 : 0.30);
    b.text.setAlpha(ready ? 1 : 0.35);
    var left = h.skillCd ? (h.skillCd[b.key] || 0) : 0;
    var total = (h.skills && h.skills[b.key]) ? h.skills[b.key].cooldown : 1;
    b.cool.setFillStyle(0x000000, left > 0 ? Math.min(0.6, left / total * 0.6) : 0);
  }
  var pot = this._find('POTION');
  if (pot) pot.text.setAlpha(h.potionCharges > 0 ? 1 : 0.3);
};

GAME.TouchPad.prototype._find = function (key) {
  for (var i = 0; i < this.buttons.length; i++) if (this.buttons[i].key === key) return this.buttons[i];
  return null;
};

// 매 프레임 — 스틱 입력을 영웅 이동으로 바꾼다
GAME.TouchPad.prototype.update = function (dtMs) {
  this.refresh();
  var h = this.hero;
  if (!h.alive || h.rootedFor > 0) return false;
  var dx = this.stick.dx, dy = this.stick.dy;
  if (!dx && !dy) return false;

  var dt = dtMs / 1000;
  var len = Math.sqrt(dx * dx + dy * dy) || 1;
  h.manual = true;
  h.order = null;
  h.x += (dx / len) * GAME.Combat.effSpeed(h) * dt;
  h.y += (dy / len) * GAME.Combat.effSpeed(h) * dt;
  GAME.Combat.clampToArena(h);

  // 걷는 중에도 사거리 안의 적은 자동으로 친다 (키보드 조작과 같은 감각)
  var tgt = GAME.Combat.nearestEnemy(h, this.ctrl.state.units);
  if (tgt && h.cd <= 0 && GAME.Combat.dist(h, tgt) <= h.def.range) {
    GAME.Combat.fire(h, tgt.x, tgt.y, tgt, this.ctrl.state);
    h.cd = h.def.cooldown;
  } else {
    h.facing = Math.atan2(dy, dx);
  }
  return true;
};

GAME.TouchPad.prototype.destroy = function () {
  for (var i = 0; i < this.objects.length; i++) {
    if (this.objects[i] && this.objects[i].destroy) this.objects[i].destroy();
  }
  this.objects = [];
  this.buttons = [];
};
