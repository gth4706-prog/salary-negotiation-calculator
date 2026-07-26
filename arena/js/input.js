window.GAME = window.GAME || {};

// 컨트롤러 조작 — 영웅 1기를 롤처럼 몬다.
//   우클릭       이동 / 적을 찍으면 공격 (롤 기본 조작)
//   방향키        직접 이동 (즉시 반응, 우클릭 명령을 덮어씀)
//   Q W E R      스킬 — 마우스 위치/방향으로 시전
//   F            물약
//   Space        마우스 방향으로 기본공격
//
// QWER 을 스킬 전용으로 비우기 위해 직접 이동은 WASD 가 아니라 방향키에 둔다.
//
// 화면 좌표는 전부 GAME.Iso 로 평면 좌표로 되돌린 뒤 로직에 넘긴다.
GAME.InputController = function (scene, state, hero) {
  this.scene = scene;
  this.state = state;
  this.hero = hero;

  this.mouse = { x: hero.x, y: hero.y };   // 평면 좌표
  this.down = {};

  this._bind();
};

GAME.InputController.prototype._bind = function () {
  var self = this;
  var input = this.scene.input;

  input.on('pointermove', function (p) {
    var w = GAME.Iso.toWorld(p.x, p.y);
    self.mouse.x = w.x;
    self.mouse.y = w.y;
  });

  input.on('pointerdown', function (p) {
    var w = GAME.Iso.toWorld(p.x, p.y);
    self.mouse.x = w.x;
    self.mouse.y = w.y;
    if (p.rightButtonDown()) self.issueMove(w.x, w.y);
  });

  // ev.code 를 쓰면 한/영 상태와 무관하게 동작한다
  this._onKeyDown = function (ev) {
    if (self.down[ev.code]) return;        // 키 반복 무시
    self.down[ev.code] = true;

    var h = self.hero;
    if (!h.alive) return;

    var slot = null;
    if (ev.code === 'KeyQ') slot = 'Q';
    else if (ev.code === 'KeyW') slot = 'W';
    else if (ev.code === 'KeyE') slot = 'E';
    else if (ev.code === 'KeyR') slot = 'R';

    if (slot) {
      GAME.Combat.castSkill(h, slot, self.mouse.x, self.mouse.y, self.state);
      ev.preventDefault();
      return;
    }

    if (ev.code === 'KeyF') {
      GAME.Combat.usePotion(h);
      ev.preventDefault();
    }
    // 방향키·스페이스가 페이지를 스크롤하지 않게 막는다
    if (ev.code === 'Space' || ev.code.indexOf('Arrow') === 0) ev.preventDefault();
  };

  this._onKeyUp = function (ev) { self.down[ev.code] = false; };

  window.addEventListener('keydown', this._onKeyDown);
  window.addEventListener('keyup', this._onKeyUp);
};

GAME.InputController.prototype.destroy = function () {
  window.removeEventListener('keydown', this._onKeyDown);
  window.removeEventListener('keyup', this._onKeyUp);
};

GAME.InputController.prototype.issueMove = function (x, y) {
  var h = this.hero;
  if (!h.alive) return;
  var enemy = GAME.Combat.unitAt(this.state, x, y, 'strategist');
  if (enemy) {
    h.order = { type: 'attack', target: enemy };
    if (this.scene.showMarker) this.scene.showMarker(x, y, 'attack');
  } else {
    h.order = { type: 'move', x: x, y: y };
    if (this.scene.showMarker) this.scene.showMarker(x, y, 'move');
  }
};

GAME.InputController.prototype.castW = function () {
  if (this.hero.alive) {
    GAME.Combat.castSkill(this.hero, 'W', this.mouse.x, this.mouse.y, this.state);
  }
};

GAME.InputController.prototype.update = function (dtMs) {
  var h = this.hero;
  h.manual = false;
  if (!h.alive || h.rootedFor > 0) return;

  var dt = dtMs / 1000;
  var dx = 0, dy = 0;
  if (this.down['ArrowUp']) dy -= 1;
  if (this.down['ArrowDown']) dy += 1;
  if (this.down['ArrowLeft']) dx -= 1;
  if (this.down['ArrowRight']) dx += 1;

  if (dx || dy) {
    var len = Math.sqrt(dx * dx + dy * dy);
    h.manual = true;
    h.order = null;
    h.x += (dx / len) * GAME.Combat.effSpeed(h) * dt;
    h.y += (dy / len) * GAME.Combat.effSpeed(h) * dt;
    GAME.Combat.clampToArena(h);

    // 직접 이동 중에도 사거리 안의 적은 자동으로 친다 (롤과 같은 감각)
    var tgt = GAME.Combat.nearestEnemy(h, this.state.units);
    if (tgt && h.cd <= 0 && GAME.Combat.dist(h, tgt) <= h.def.range) {
      GAME.Combat.fire(h, tgt.x, tgt.y, tgt, this.state);
      h.cd = h.def.cooldown;
    } else {
      h.facing = Math.atan2(dy, dx);
    }
  }

  // 수동 기본공격
  if (this.down['Space'] && h.cd <= 0) {
    var target = null;
    if (h.def.attack === 'melee') {
      target = GAME.Combat.nearestEnemy(h, this.state.units);
      if (target && GAME.Combat.dist(h, target) > h.def.range) target = null;
    }
    GAME.Combat.fire(h, this.mouse.x, this.mouse.y, target, this.state);
    h.cd = h.def.cooldown;
    h.manual = true;
  }
};
