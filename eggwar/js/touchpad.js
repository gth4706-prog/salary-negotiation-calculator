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

// 조작 패드 색. **테마를 따라간다** — 밝은 테마에서 검은 원을 그리면 화면에 구멍이 뚫린 것처럼 보인다.
GAME.TouchPad.palette = function () {
  var UI = GAME.UI || {};
  var th = (UI.THEMES && UI.currentTheme) ? UI.THEMES[UI.currentTheme()] : null;
  var light = !!(th && th.dark === false);
  var C = GAME.CONFIG.COLORS;
  return {
    face:   light ? 0xffffff : 0x11131c,   // 버튼 면
    faceHi: light ? 0xd9d2c2 : 0x2a2f42,   // 눌렸을 때
    ink:    light ? 0x33291b : 0xffffff,   // 스틱 노브·테두리
    ring:   light ? 0x8a8272 : 0x000000,   // 스틱 바깥 링·쿨다운 덮개
    amber:  (UI.COL && UI.COL.panelAmberHi) || 0xf0a86a,
    armed:  UI.cssToHex ? UI.cssToHex(C.crit, 0xffd166) : 0xffd166
  };
};

GAME.TouchPad.SIZES = function () {
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var shortSide = Math.min(W, H);

  // ── 폰 가로(820×390) ──────────────────────────────────────────────────
  // 짧은 변이 곧 화면 높이라 세로용 비율(짧은 변 대비)을 그대로 쓰면 버튼이 작아진다.
  // 모바일 MOBA(와일드리프트) 기준: 스틱은 화면 높이의 20% 안팎 반경, 공격 버튼이 가장 크고
  // 스킬은 그 주위 부채꼴. 스킬이 4개라 롤토체스식 '한 줄'로는 담기지 않는다.
  //
  // 터치 타깃 규율: 설계 px = 화면 px 이지만 **아이폰 SE(667×375)는 FIT 0.81 배**라
  // 설계 54px 이 화면 44px 이다 → 모든 버튼을 설계 지름 56px 이상으로 잡는다.
  if (GAME.CONFIG.PHONE) {
    return {
      stickR: Math.round(H * 0.21),    // 82 — 엄지 사정권(왼쪽 아래)
      knobR: Math.round(H * 0.095),    // 37
      mainR: Math.round(H * 0.108),    // 42 · 지름 84 → SE 68px
      // 0.075(지름 58) → 0.085(지름 66). 버튼에 슬롯 글자 대신 **한글 라벨**을 넣으면서
      // 넓힌 것이다. 58px 원에 '궁극기' 3글자를 넣으면 글자가 설계 15px 까지 내려가고
      // SE(배율 0.813)에서는 화면 12px 이 되어 하한 13px 을 깬다. 66px 이면 17px 로 잡혀
      // SE 에서도 13.8px 이다. 터치 타깃은 오히려 47 → SE 54px 로 좋아진다.
      skillR: Math.round(H * 0.085),   // 33 · 지름 66 → SE 54px
      potionR: Math.round(H * 0.072)   // 28 · 지름 56 → SE 45px
    };
  }
  // 조작부가 **전장 위에 겹쳐** 놓이게 되면서 전장을 잡아먹지 않는다 →
  // 그만큼 버튼을 키울 수 있다(실기기에서 "버튼이 작다" 신고). 지름 기준으로
  // 스킬 0.058→0.072(≈60px, 화면 ~48px), 공격 0.070→0.086 으로 올렸다.
  return {
    stickR: Math.round(shortSide * 0.118),   // 바깥 링 반지름
    knobR: Math.round(shortSide * 0.054),
    mainR: Math.round(shortSide * 0.086),    // 기본공격
    // QWER·물약도 **최소 터치 타깃 44 CSS px** 을 넘겨야 한다.
    // 0.046 이면 폰에서 지름 35px 라 자꾸 빗나간다(실측).
    skillR: Math.round(shortSide * 0.072),
    potionR: Math.round(shortSide * 0.068)
  };
};

GAME.TouchPad.prototype._build = function () {
  var scene = this.scene, self = this;
  var C = GAME.CONFIG.COLORS;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var S = GAME.TouchPad.SIZES();
  var PAD = GAME.TouchPad.palette();

  // 조작부는 전장 **위에 겹쳐** 놓는다(전장을 화면 거의 전체로 쓰기 위함).
  // 다만 폰 하단바(제스처 바)와는 반드시 띄운다 — 안 그러면 스틱을 잡다가 홈으로 나간다.
  var PHONE = GAME.CONFIG.PHONE;
  var margin = PHONE ? 16 : Math.round(Math.min(W, H) * 0.055);
  var bottomGap = (GAME.CONFIG.PORTRAIT && GAME.Iso.BOTTOM_GAP) ? GAME.Iso.BOTTOM_GAP * 0.55 : 0;
  var baseY = H - S.stickR - margin - bottomGap;

  // ── 왼쪽: 가상 스틱 ──
  var sx = S.stickR + margin;
  this.stick.cx = sx;
  this.stick.cy = baseY;
  this.stick.homeX = sx;      // 손을 떼면 돌아올 자리
  this.stick.homeY = baseY;

  // 스틱은 **선으로 읽히게** 한다. 폰 가로는 반지름이 82(화면 높이의 21%)라
  // 세로와 같은 알파(면 0.22 / 노브 0.30)를 쓰면 전장 왼쪽에 커다란 진흙 웅덩이가 생긴다
  // (실측 스크린샷). 면을 옅게 깔고 테두리를 굵게 살리면 같은 크기로도 전장이 보인다.
  var fillA = PHONE ? 0.07 : 0.22, lineA = PHONE ? 0.5 : 0.30;
  var knobA = PHONE ? 0.16 : 0.30;
  this.stickRing = scene.add.circle(sx, baseY, S.stickR, PAD.ring, fillA)
    .setStrokeStyle(PHONE ? 3 : 2, PAD.ink, lineA).setDepth(900).setScrollFactor(0);
  this.stickKnob = scene.add.circle(sx, baseY, S.knobR, PAD.ink, knobA)
    .setStrokeStyle(PHONE ? 3 : 2, PAD.ink, 0.55).setDepth(901).setScrollFactor(0);
  this.objects.push(this.stickRing, this.stickKnob);

  // 스틱은 링 밖에서 눌러도 잡히도록 넉넉한 판정 원을 따로 둔다
  // 판정 구역은 **왼쪽 아래 넓은 사각형**이다. 엄지가 대충 닿아도 잡히도록
  // 스틱 그림보다 훨씬 크게 잡는다(떠다니는 스틱이라 정확히 누를 필요가 없다).
  // 폰 가로는 스틱 반경이 크고 화면이 낮다 → 판정 구역을 왼쪽 아래에 좁게 가둔다.
  // 넓게 잡으면 하단 중앙 물약 버튼까지 삼켜 오조작이 난다(폭 0.52 면 실제로 겹쳤다).
  var zoneW = Math.round(W * (PHONE ? 0.40 : 0.52));
  var zoneTop = PHONE ? Math.max(0, H - Math.round(S.stickR * 2.6))
                      : Math.min(baseY - S.stickR * 1.7, H - S.stickR * 3.2);
  var zoneH = H - zoneTop;
  this.stickZoneRect = { x: 0, y: zoneTop, w: zoneW, h: zoneH };
  this.stickZone = scene.add.rectangle(zoneW / 2, zoneTop + zoneH / 2, zoneW, zoneH, 0xffffff, 0.001)
    .setDepth(899).setScrollFactor(0);
  this.stickZone.setInteractive();
  this.objects.push(this.stickZone);
  // 감사용 표식 — 판정 구역은 **보이지 않는 손가락 영역**이라 겹침 검사에서 뺀다.
  // 스틱 그림(링·노브)은 이 안에 있는 게 정상이다.
  this.stickZone.__padZone = true;
  this.stickRing.__padStick = true;
  this.stickKnob.__padStick = true;

  // ── 오른쪽: 액션 버튼 ──
  // 스틱과 공격 버튼은 반지름이 다르다 → 같은 baseY 를 쓰면 오른쪽만 40px 떠 보인다.
  // 각자 **화면 아래에서** 자기 반지름만큼 띄운다.
  var cx = W - S.mainR - margin;
  var cy = PHONE ? (H - S.mainR - margin) : baseY;

  this._addButton('ATK', cx, cy, S.mainR, '공격', GAME.CONFIG.COLORS.controller, function () {
    self._attack();
  });

  // 기본공격 버튼을 중심으로 왼쪽 위 호에 QWER 을 건다.
  //
  // 각도를 손으로 박으면 버튼 크기가 바뀔 때 조용히 겹친다(실제로 41px 간격에
  // 60px 이 필요해 겹쳤다). 그래서 **반지름에서 필요한 각도를 역산**한다.
  // 호는 **공격 버튼의 왼쪽~위쪽 90° 안에만** 둔다. 오른쪽으로 넘어가면 화면 밖이다.
  // 그리고 각도를 고정하고 반지름을 정하면 버튼이 커질 때 겹치므로, 반대로
  // **필요한 간격(지름+여백)에서 호 반지름을 역산**한다. 이러면 크기를 바꿔도 안 겹친다.
  var n = GAME.SKILL_SLOTS.length;
  var gap = Math.round(S.skillR * 0.22);
  var startDeg = 6, endDeg = 90;
  var stepRad = ((endDeg - startDeg) / (n - 1)) * Math.PI / 180;
  var arcR = Math.max(
    S.mainR + S.skillR + 8,
    (S.skillR * 2 + gap) / (2 * Math.sin(stepRad / 2))
  );
  GAME.SKILL_SLOTS.forEach(function (slot, i) {
    var a = (startDeg * Math.PI / 180) + stepRad * i;
    self._addButton(slot, cx - Math.cos(a) * arcR, cy - Math.sin(a) * arcR,
      S.skillR, self._slotLabel(slot), GAME.CONFIG.COLORS.strategist,
      function () { self._skill(slot); });
  });

  // 물약 — 세로에서는 스틱 위쪽(왼손 엄지 자리).
  // 폰 가로에서는 **하단 중앙**으로 뺀다: 자주 안 쓰는 버튼이라 두 엄지의 사정권
  // 한가운데(= 가장 덜 붐비는 자리)에 두는 편이 스틱·스킬 오조작을 줄인다.
  if (PHONE) {
    this._addButton('POTION', W / 2, H - S.potionR - margin, S.potionR, '물약', PAD.amber,
      function () { GAME.Combat.usePotion(self.hero); });
  } else {
    this._addButton('POTION', sx, baseY - S.stickR - S.potionR - 10, S.potionR, '물약', PAD.amber,
      function () { GAME.Combat.usePotion(self.hero); });
  }

  this._bind();
  this.refresh();
};

// 폰에는 키보드가 없다 — 버튼에 찍힌 'Q' 는 아무 뜻이 없다.
// 그래서 **지금 그 슬롯에 끼워둔 스킬의 성격**을 한글로 적는다(`js/heroes.js` 의 표).
// R 만 슬롯 이름('궁극기')을 쓴다 — 세 영웅 9개 선택지가 전부 쿨 26~36초의 큰 기술이라
// 슬롯 자체에 성격이 있는 유일한 자리다. 나머지는 고른 스킬마다 뜻이 달라진다.
GAME.TouchPad.prototype._slotLabel = function (slot) {
  var h = this.hero, sk = null;
  if (h && h.skills) {
    for (var i = 0; i < h.skills.length; i++) if (h.skills[i].slot === slot) { sk = h.skills[i]; break; }
  }
  return GAME.skillLabel ? GAME.skillLabel(sk, slot) : slot;
};

GAME.TouchPad.prototype._addButton = function (key, x, y, r, label, color, onTap) {
  var scene = this.scene;
  // 호 위에 배치하다 보면 마지막 버튼이 화면 밖으로 밀린다(R 버튼이 실제로 잘렸다).
  // 버튼 크기를 키울 때마다 다시 터지므로 여기서 한 번에 가둔다.
  var pad = 4;
  x = Math.max(r + pad, Math.min(GAME.CONFIG.WIDTH - r - pad, x));
  y = Math.max(r + pad, Math.min(GAME.CONFIG.HEIGHT - r - pad, y));
  var PAD = GAME.TouchPad.palette();
  var circle = scene.add.circle(x, y, r, PAD.face, 0.55)
    .setStrokeStyle(2, color, 0.75).setDepth(900).setScrollFactor(0);
  circle.setInteractive(new Phaser.Geom.Circle(r, r, r), Phaser.Geom.Circle.Contains);

  // 글자 크기는 **라벨 길이에서 역산**한다. 예전엔 라벨이 'Q' 한 글자라 r*0.62 로 늘 남았는데,
  // 이제 '궁극기' 같은 한글 3글자가 들어와 그대로 두면 원을 넘친다(버튼 각도를 손으로
  // 박았다가 겹친 것과 같은 종류의 실수다 — 크기가 바뀌면 조용히 터진다).
  var budget = r * 2 * 0.80;                       // 원 안 가로 여유(테두리 + 시각 여백)
  var chars = Math.max(1, String(label).length);
  var px = Math.min(Math.max(10, Math.round(r * 0.62)), Math.floor(budget / chars));
  var text = scene.add.text(x, y, label, {
    fontFamily: GAME.CONFIG.FONT,
    fontSize: px + 'px',
    color: GAME.CONFIG.COLORS.text
  }).setOrigin(0.5).setDepth(902).setScrollFactor(0);
  // 폰트(Jua)와 폴백 폰트의 글자 폭이 달라 계산만으로는 안심할 수 없다 → **실측으로 한 번 더 줄인다.**
  // 하한은 ui-theme 의 절대 하한(FS.micro · 세로 15 / 가로 13)을 따른다.
  var floorPx = GAME.CONFIG.PORTRAIT ? 15 : 13;
  while (px > floorPx && text.width > budget) { px -= 1; text.setFontSize(px); }

  // 쿨다운 표시 — 원을 덮는 어두운 원판의 알파로 남은 시간을 보여준다
  var cool = scene.add.circle(x, y, r - 1, PAD.ring, 0).setDepth(901).setScrollFactor(0);

  var self = this;
  circle.on('pointerdown', function (p) {
    p.event && p.event.preventDefault && p.event.preventDefault();
    circle.setFillStyle(PAD.faceHi, 0.8);
    onTap();
  });
  circle.on('pointerup', function () { circle.setFillStyle(PAD.face, 0.55); });
  circle.on('pointerout', function () { circle.setFillStyle(PAD.face, 0.55); });

  // 겹침 감사용 표식 — 버튼과 **자기 라벨/쿨다운 덮개** 쌍만 정확히 제외하려면
  // 도구가 소속을 알아야 한다(UI.button 의 rect.__uiBtn 과 같은 방식).
  circle.__padKey = key;
  text.__padOwner = key;
  cool.__padOwner = key;

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
  // 버튼을 누르면 **바라보는 방향으로 즉시 시전**한다(조준 탭 없음). 사거리는 감으로 맞춘다.
  this.ctrl.armSkill(slot);   // armSkill 은 이제 즉시 시전한다(input.js 참조)
  this.refresh();
};

GAME.TouchPad.prototype._bind = function () {
  var self = this;
  var S = GAME.TouchPad.SIZES();

  // **떠다니는 스틱(floating joystick).** 고정 스틱은 엄지를 정확히 그 자리에 올려야 해서
  // 모바일 게임에서 조작이 어렵다는 평의 가장 큰 원인이다. 업계 권장은
  // "엄지가 닿은 자리에 스틱이 생기는" 방식 — 여기서는 판정 구역 안 아무 데나 눌러도
  // 그 지점이 곧 스틱 중심이 된다. 손을 떼면 원래 자리로 돌아간다.
  this.stickZone.on('pointerdown', function (p) {
    self.stick.active = true;
    self.stick.id = p.id;
    self.stick.cx = p.x;
    self.stick.cy = p.y;
    self.stickRing.setPosition(p.x, p.y);
    self.stickKnob.setPosition(p.x, p.y);
    self._moveKnob(p);
  });

  this.scene.input.on('pointermove', function (p) {
    if (self.stick.active && p.id === self.stick.id) self._moveKnob(p);
  });

  var release = function (p) {
    if (!self.stick.active || p.id !== self.stick.id) return;
    self.stick.active = false;
    self.stick.dx = 0; self.stick.dy = 0;
    // 손을 떼면 스틱을 원래 홈 자리로 되돌린다(다음에 어디를 눌러야 할지 보이게)
    self.stick.cx = self.stick.homeX;
    self.stick.cy = self.stick.homeY;
    self.stickRing.setPosition(self.stick.homeX, self.stick.homeY);
    self.stickKnob.setPosition(self.stick.homeX, self.stick.homeY);
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
  var z = this.stickZoneRect;
  if (z && x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) return true;
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
  var PAD = GAME.TouchPad.palette();
  for (var i = 0; i < this.buttons.length; i++) {
    var b = this.buttons[i];
    if (GAME.SKILL_SLOTS.indexOf(b.key) === -1) continue;
    var ready = GAME.Combat.skillReady(h, b.key);
    var armed = this.ctrl.armedSkill === b.key;
    b.circle.setStrokeStyle(armed ? 3 : 2, armed ? PAD.armed : b.color, ready ? 0.85 : 0.30);
    b.text.setAlpha(ready ? 1 : 0.35);
    var left = h.skillCd ? (h.skillCd[b.key] || 0) : 0;
    // h.skills 는 **배열**이다(슬롯은 각 원소의 .slot). 'Q' 로 색인하면 항상 undefined 라
    // total 이 1 이 되고 어두움이 늘 최대(0.6)에 붙어 **남은 쿨이 전혀 안 보였다**.
    var total = this._cooldownOf(h, b.key);
    b.cool.setFillStyle(PAD.ring, left > 0 ? Math.min(0.6, (left / total) * 0.6) : 0);
  }
  var pot = this._find('POTION');
  if (pot) pot.text.setAlpha(h.potionCharges > 0 ? 1 : 0.3);
};

// 이 슬롯 스킬의 전체 쿨다운(ms). skillCd 에 들어가는 값과 같은 기준이어야
// '남은 비율'이 맞는다 — Combat 이 cdrMul 을 곱해서 넣는다.
GAME.TouchPad.prototype._cooldownOf = function (h, slot) {
  if (h.skills) {
    for (var i = 0; i < h.skills.length; i++) {
      if (h.skills[i].slot === slot) return Math.max(1, h.skills[i].cooldown * (h.cdrMul || 1));
    }
  }
  return 1;
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
