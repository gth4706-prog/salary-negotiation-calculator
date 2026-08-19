window.GAME = window.GAME || {};

// 컨트롤러 조작 — 영웅 1기를 롤처럼 몬다.
//   우클릭       이동 / 적을 찍으면 공격 (롤 기본 조작)
//   방향키        직접 이동 (즉시 반응, 우클릭 명령을 덮어씀)
//   Q W E R      스킬 — **바라보는 방향(facing)** 으로 즉시 시전
//   F            물약
//
// Space(수동 기본공격)는 **없앴다** (2026-07-30, 사용자 지시).
// 사거리 안의 적은 멈춰 있든 걸어가든 자동으로 친다 — 아래 두 곳이 그 일을 한다.
// 모바일에서 공격 버튼을 없앤 것(v0.56)과 같은 이유다: 이미 자동인 것을 손으로
// 또 누르게 하면 "눌러야 하나?"라는 의심만 남는다. 조작은 이동과 스킬에만 쓴다.
//
// QWER 을 스킬 전용으로 비우기 위해 직접 이동은 WASD 가 아니라 방향키에 둔다.
//
// 화면 좌표는 전부 GAME.Iso 로 평면 좌표로 되돌린 뒤 로직에 넘긴다.
// 모바일(터치)에서는 조작을 이렇게 나눈다:
//   한 번 탭      해당 위치로 이동하며 교전(어택무브)
//   두 번 탭      해당 위치로 이동만 (교전하지 않음)
//   스킬 버튼      누르면 **바라보는 방향으로 즉시 시전**(조준 탭 없음). 사거리는 감으로.
GAME.InputController = function (scene, state, hero) {
  this.scene = scene;
  this.state = state;
  this.hero = hero;

  this.mouse = { x: hero.x, y: hero.y };   // 평면 좌표
  this.down = {};

  this.touch = GAME.isTouch;
  this.armedSkill = null;       // 조준 대기 중인 스킬 슬롯
  this._lastTap = { t: 0, x: 0, y: 0 };
  this._pendingTap = null;

  this._bind();
};

// 화면 좌표 → 평면(월드) 좌표.
// 씬이 확대(마우스 휠 줌)를 지원하면 **그 변환까지 함께 되돌린다** — 확대 상태에서도
// 클릭 이동·적 클릭·스킬 조준이 정확히 같은 지점을 가리켜야 한다.
// 그런 씬이 아니면(방어전 등) 예전과 한 글자도 다르지 않은 경로다.
GAME.InputController.prototype.toWorld = function (sx, sy) {
  if (this.scene && this.scene.screenToWorld) return this.scene.screenToWorld(sx, sy);
  return GAME.Iso.toWorld(sx, sy);
};

GAME.InputController.prototype._bind = function () {
  var self = this;
  var input = this.scene.input;

  input.on('pointermove', function (p) {
    var w = self.toWorld(p.x, p.y);
    self.mouse.x = w.x;
    self.mouse.y = w.y;
  });

  input.on('pointerdown', function (p) {
    var w = self.toWorld(p.x, p.y);
    self.mouse.x = w.x;
    self.mouse.y = w.y;

    if (!self.touch) {
      if (p.rightButtonDown()) self.issueMove(w.x, w.y);
      return;
    }

    // ── 터치 조작 ──
    if (p.y > GAME.Iso.screenRect().bottom) return;   // 하단 버튼 영역은 버튼이 처리
    // 조작 패드(스틱·버튼) 위를 누른 것은 전장 탭이 아니다.
    // 패드가 전장 아래쪽에 겹쳐 있어서 이 판정이 없으면 스틱을 잡을 때마다 영웅이 튄다.
    if (self.pad && self.pad.hits(p.x, p.y)) return;

    var now = p.downTime || Date.now();
    var last = self._lastTap;
    var isDouble = (now - last.t < 320) &&
      Math.abs(p.x - last.x) < 44 && Math.abs(p.y - last.y) < 44;
    self._lastTap = { t: now, x: p.x, y: p.y };

    if (isDouble) {
      // 두 번 탭 = 이동만. 첫 탭이 걸어둔 교전 명령을 덮어쓴다.
      self._pendingTap = null;
      self.hero.order = { type: 'move', x: w.x, y: w.y };
      if (self.scene.showMarker) self.scene.showMarker(w.x, w.y, 'move');
    } else {
      self.issueTouchAttackMove(w.x, w.y);
    }
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
      // PC 는 **마우스 위치**로 시전한다(요청으로 되돌림). 마우스가 곧 조준점이라
      // 지점 배치 스킬(낙석·함정)을 원하는 자리에 정확히 놓을 수 있다.
      // 모바일은 조준할 손가락이 없으므로 바라보는 방향으로 쏜다(touchpad.js 참조).
      GAME.Combat.castSkill(h, slot, self.mouse.x, self.mouse.y, self.state);
      ev.preventDefault();
      return;
    }

    if (ev.code === 'KeyF') {
      // `self.state` 다 — 이 핸들러 안의 `this` 는 컨트롤러가 아니다(위 castSkill 과 같은 규약).
      GAME.Combat.usePotion(h, self.state);
      ev.preventDefault();
    }
    // 방향키·스페이스가 페이지를 스크롤하지 않게 막는다
    // Space 에 기능은 없지만 preventDefault 는 남긴다 — 브라우저 기본 동작(페이지
    // 스크롤)이 전투 중에 돌면 화면이 튄다. 키를 지운 것이지 브라우저를 푼 게 아니다.
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

// 터치: 탭한 지점으로 가되, 가는 길에 적을 만나면 교전한다
GAME.InputController.prototype.issueTouchAttackMove = function (x, y) {
  var h = this.hero;
  if (!h.alive) return;
  var enemy = GAME.Combat.unitAt(this.state, x, y, 'strategist');
  if (enemy) {
    h.order = { type: 'attack', target: enemy };
    if (this.scene.showMarker) this.scene.showMarker(x, y, 'attack');
  } else {
    h.order = { type: 'attackmove', x: x, y: y };
    if (this.scene.showMarker) this.scene.showMarker(x, y, 'attackmove');
  }
};

// 스킬 버튼(모바일 패드·PC 스킬박스)을 눌렀을 때 — 조준 단계 없이 즉시 시전한다.
//   · 모바일: 조준할 손가락이 없으므로 **바라보는 방향(facing)** 으로.
//   · PC    : 마우스가 곧 조준점이므로 **마우스 위치**로(요청으로 되돌림).
GAME.InputController.prototype.armSkill = function (slot) {
  if (!this.hero.alive) return false;
  if (this.touch) return GAME.Combat.castSkillFacing(this.hero, slot, this.state);
  return GAME.Combat.castSkill(this.hero, slot, this.mouse.x, this.mouse.y, this.state);
};

GAME.InputController.prototype.update = function (dtMs) {
  var h = this.hero;
  h.manual = false;
  if (!h.alive || h.rootedFor > 0) return;

  // 모바일 조작 패드가 이동을 처리했으면 키보드 처리는 건너뛴다
  if (this.pad && this.pad.update(dtMs)) return;

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
      h.facing = GAME.DetMath.atan2(dy, dx);
    }
  }

  // 사거리 안에 적이 있으면 **가만히 있어도 자동으로 친다** (모바일과 같은 감각).
  // 쫓아가지는 않는다 — 이동은 어디까지나 플레이어 몫이고, 여기서 따라가면
  // 방향키로 거리를 재는 플레이(카이팅)가 무너진다. 사거리에 들어온 것만 때린다.
  // 위의 '직접 이동 중 자동공격'은 이동할 때만 돌아서, 멈춰 있으면 안 쐈다.
  if (!dx && !dy && h.cd <= 0) {
    var near = GAME.Combat.nearestEnemy(h, this.state.units);
    if (near && GAME.Combat.dist(h, near) <= h.def.range) {
      GAME.Combat.fire(h, near.x, near.y, near, this.state);
      h.cd = h.def.cooldown;
    }
  }

};
