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
    ring:   light ? 0x8a8272 : 0x000000,   // 스틱 바깥 링·쿨다운 부채꼴
    // 쿨이 다 돈 스킬 버튼의 면. "결국 흰색 원으로" — 밝은 테마에서는 흰색이
    // 배경과 붙어 버리므로 아주 옅은 크림으로 낮춘다(대비를 잃지 않게).
    readyFace: light ? 0xfff8ec : 0xffffff,
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
  //  ── 스틱도 물건이다 (2026-08-04) ────────────────────────────────────────
  //  예전엔 회색 반투명 원 두 개라 '도형'으로 보였다. 뼈 테 + 밧줄 눈금으로 바꾼다.
  //  ⚠ **면 알파는 안 올린다.** 위 주석이 실측으로 잡아 둔 값이다(폰 가로에서 면을
  //    진하게 하면 전장 왼쪽에 진흙 웅덩이가 생긴다). 테두리로만 물건을 만든다.
  var stickDeco = scene.add.graphics().setDepth(899).setScrollFactor(0);
  (function () {
    var M = GAME.UI.MAT, R0 = S.stickR;
    stickDeco.lineStyle(Math.max(2.5, R0 * 0.055), M.bone, PHONE ? 0.55 : 0.70);
    stickDeco.strokeCircle(sx, baseY, R0 * 0.97);
    //  방향 눈금 넷 — 밧줄을 감아 둔 자리. 스틱이 '어느 쪽으로 미는 물건'임을 말한다.
    stickDeco.lineStyle(Math.max(2, R0 * 0.045), M.rope, PHONE ? 0.45 : 0.6);
    [0, 90, 180, 270].forEach(function (d) {
      var t = d * Math.PI / 180, c = Math.cos(t), s2 = Math.sin(t);
      stickDeco.lineBetween(sx + c * R0 * 0.80, baseY + s2 * R0 * 0.80,
                            sx + c * R0 * 1.02, baseY + s2 * R0 * 1.02);
    });
  })();
  this.objects.push(stickDeco);
  this.stickDeco = stickDeco;   // 영웅이 다가오면 링·노브와 **같이** 흐려져야 한다

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

  // ── 기본공격 버튼을 없앴다 (2026-07-29, 사용자 지시) ─────────────────────
  // 사거리 안의 적은 **가만히 있어도 자동으로** 친다(input.js·touchpad.js 양쪽에
  // 그 코드가 있다). 그래서 이 버튼은 이미 하는 일이 없었고, 화면에서 가장 좋은
  // 자리(엄지 홈 포지션)를 가장 안 쓰는 버튼이 차지하고 있었다.
  // 그 자리를 스킬이 물려받는다 — 아래 arcR 이 그만큼 짧아진다.

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
  // 공격 버튼이 사라졌으므로 호 반지름의 하한이 '공격 반지름 + 스킬 반지름'에서
  // **스킬 반지름 하나**로 줄어든다 = 스킬이 엄지 쪽으로 당겨온다.
  // 겹침을 막는 하한(필요 간격에서 역산)은 그대로다 — 그게 진짜 제약이다.
  var arcR = Math.max(
    S.skillR * 1.15,
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
  // ⚠ 통곡의 탑은 물약이 없다(js/towershopitems.js 카탈로그 자체에 없음) — 버튼을
  //   만들어 두면 "삭제됐는데 왜 아직 보이지"가 된다(사용자 신고). scene.tower 로 건너뛴다.
  if (!(this.scene && (this.scene.tower || this.scene.versus))) {
    if (PHONE) {
      this._addButton('POTION', W / 2, H - S.potionR - margin, S.potionR, '물약', PAD.amber,
        function () { GAME.Combat.usePotion(self.hero, self.scene && self.scene.state); });
    } else {
      this._addButton('POTION', sx, baseY - S.stickR - S.potionR - 10, S.potionR, '물약', PAD.amber,
        function () { GAME.Combat.usePotion(self.hero, self.scene && self.scene.state); });
    }
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
  //  ⚠ 여백은 **뼈 테 두께까지** 세야 한다(2026-08-04). 테가 r×1.19 까지 나가므로
  //    4px 만 두면 테가 화면 밖으로 잘린다 — 이 줄이 원래 막으려던 사고와 같은 종류다.
  var pad = Math.max(4, r * 0.24);
  x = Math.max(r + pad, Math.min(GAME.CONFIG.WIDTH - r - pad, x));
  y = Math.max(r + pad, Math.min(GAME.CONFIG.HEIGHT - r - pad, y));
  var PAD = GAME.TouchPad.palette();

  //  ── 부족 테두리 (2026-08-04 아트 개편) ──────────────────────────────────
  //  레퍼런스의 원형 스킬 버튼은 **금속 테 + 못**으로 무게를 만든다. 그런데 이 세계에
  //  크롬도 네온도 없다 — 있는 것은 뼈·청동·밧줄뿐이다. 그대로 번역한다:
  //  뼈를 깎아 만든 테 + 청동 못 + 아래로 떨어지는 그림자.
  //  ⚠ **버튼 자체(원·글자·쿨다운)는 안 건드린다.** 크기·판정·라벨 축소 로직은 실측으로
  //    잡아 둔 값이라(R 버튼이 화면 밖으로 밀린 사고) 장식만 뒤에 깐다.
  //  ⚠ depth 898 — 버튼 원(900)·글자(902)·쿨다운(901) 전부보다 아래다.
  var deco = scene.add.graphics().setDepth(898).setScrollFactor(0);
  (function () {
    var M = GAME.UI.MAT;
    //  ⚠ **테는 버튼 바깥에 둔다.** 처음엔 0.95r 에 그렸는데 버튼 원(반지름 r, 알파
    //    0.55 흰 면)이 그 위를 덮어 전혀 안 보였다(실측 스크린샷). 테는 원을 **감싸야**
    //    테로 읽힌다 — 안쪽에 그리면 그냥 지워진다.
    deco.fillStyle(0x000000, 0.30);                        // 떠 있다는 감각
    deco.fillCircle(x, y + r * 0.13, r * 1.16);
    deco.lineStyle(Math.max(4, r * 0.19), M.bone, 1);      // 뼈 테
    deco.strokeCircle(x, y, r * 1.09);
    deco.lineStyle(Math.max(1.5, r * 0.06), M.shellRim, 0.9);   // 테 바깥 그늘 = 두께
    deco.strokeCircle(x, y, r * 1.19);
    deco.fillStyle(M.bronze, 1);                           // 청동 못 넷
    [45, 135, 225, 315].forEach(function (d) {
      var t = d * Math.PI / 180;
      deco.fillCircle(x + Math.cos(t) * r * 1.09, y + Math.sin(t) * r * 1.09, Math.max(2.5, r * 0.11));
    });
    deco.fillStyle(GAME.UI.LIGHT ? GAME.UI.LIGHT.key : 0xfff3d6, 0.6);   // 못 하이라이트
    [45, 135, 225, 315].forEach(function (d) {
      var t = d * Math.PI / 180;
      deco.fillCircle(x + Math.cos(t) * r * 1.09 - r * 0.035, y + Math.sin(t) * r * 1.09 - r * 0.035,
                      Math.max(1, r * 0.045));
    });
  })();
  this.objects.push(deco);

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

  // 쿨다운 표시 — **시계처럼 줄어드는 부채꼴**(2026-07-29, 사용자 지시).
  // 예전에는 원 전체를 덮는 어두운 원판의 '알파'로만 알렸다. 알파는 절대값을 못 읽는다 —
  // 반쯤 어두운 것이 3초인지 8초인지 알 수 없었다. 부채꼴은 각도가 곧 남은 비율이라
  // 곁눈질로도 읽히고, 다 돌면 회색이 사라지며 **흰 원**이 된다(= 지금 쓸 수 있다).
  var cool = scene.add.graphics().setDepth(901).setScrollFactor(0);

  var self = this;
  // 쿨 중에는 숫자를 띄우므로 원래 라벨을 들고 있어야 되돌릴 수 있다
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

  var b = { key: key, circle: circle, text: text, cool: cool, deco: deco,
            r: r, color: color, label: label };
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

// 쿨다운·조준 상태를 버튼에 반영.
// dtMs 를 받으면 '영웅이 가까이 오면 흐려지는' 알파를 그 시간만큼만 움직인다
// (프레임 밖에서 부르는 경우 — 버튼 탭 직후 등 — 은 안 받는다 = 즉시 반영).
GAME.TouchPad.prototype.refresh = function (dtMs) {
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
    var g = b.cool;
    g.clear();
    if (left > 0) {
      // 12시에서 시작해 시계방향으로 **남은 만큼** 회색이 남는다.
      var frac = Math.max(0, Math.min(1, left / total));
      var a0 = -Math.PI / 2;
      g.fillStyle(PAD.ring, 0.62);
      g.slice(b.circle.x, b.circle.y, b.r - 1, a0, a0 + Math.PI * 2 * frac, false);
      g.fillPath();
      // 0.1초 단위 숫자를 **라벨 대신** 띄운다. 66px 원에 이름과 숫자를 같이 넣으면
      // 둘 다 못 읽는다 — 쿨 중에는 남은 시간이 유일하게 필요한 정보다.
      b.text.setText((left / 1000).toFixed(1));
      b._ta = 0.95;
      b.text.setColor(GAME.CONFIG.COLORS.text);
      b.circle.setFillStyle(PAD.face, 0.55);
    } else {
      // 다 돌면 **흰 원**. 색으로 "지금 쓸 수 있다"를 말한다.
      if (b.text.text !== b.label) b.text.setText(b.label);
      b._ta = 1;
      // 흰 원 위에서는 밝은 글자가 사라진다 — 잉크색으로 뒤집는다.
      b.text.setColor('#2b2418');
      b.circle.setFillStyle(PAD.readyFace, 0.92);
    }
  }
  var pot = this._find('POTION');
  if (pot) pot._ta = (h.potionCharges > 0 ? 1 : 0.3);
  this._applyFade(dtMs);
};

// ── 영웅이 다가오면 조작부가 비켜 준다 ────────────────────────────────────────
//  사용자(2026-08-04): "버튼이 전장을 가려서 불편해 / 캐릭터가 가까이오면
//  불투명도를 크게주는 방식으로".
//
//  버튼은 화면 아래 두 모서리에 **고정**인데 전장은 그 아래까지 이어진다. 영웅이
//  그리로 걸어 들어가면 자기 몸이 버튼 뒤에 숨는다 — 회피 게임에서 가장 나쁜 순간이
//  하필 조작부 뒤에서 벌어진다.
//
//  ⚠ **판정은 안 건드린다.** 흐려질 뿐 누르면 그대로 눌린다. 안 보인다고 못 누르게
//    만들면 "가까이 갔더니 스킬이 안 나간다"가 된다 — 가리는 것보다 나쁜 버그다.
//  ⚠ **손이 쓰고 있는 것은 안 흐린다**: 스틱을 잡고 있는 동안, 그리고 조준 대기
//    중인 버튼(armedSkill)은 지금 눈으로 보고 있는 물건이다.
//  ⚠ 알파는 프레임마다 **한 걸음씩** 따라간다. 즉시 바꾸면 영웅이 경계 위에서
//    흔들릴 때 버튼이 깜빡인다(같은 종류의 사고를 쿨다운 표시에서 이미 겪었다).
GAME.TouchPad.FADE = {
  near: 1.7,    // 버튼 반지름 배수 — 이 안이면 가장 흐리다
  far: 3.6,     // 이 밖이면 원래대로
  min: 0.20,    // 완전히 지우지는 않는다 — 어디에 있는지는 계속 보여야 한다
  rate: 0.006   // ms 당 알파 변화 한계(≈170ms 에 0→1)
};

GAME.TouchPad.prototype._applyFade = function (dtMs) {
  var F = GAME.TouchPad.FADE;
  var h = this.hero, i, b;
  // 영웅 화면 좌표 — x 는 그대로, y 만 기울여 투영한다(js/iso.js)
  var hx = 0, hy = 0, live = !!(h && h.alive);
  if (live) { hx = h.x; hy = GAME.Iso.toScreenY(h.y); }
  var step = (dtMs === undefined) ? 1 : Math.min(1, dtMs * F.rate);

  function toward(cur, want) {
    if (cur === undefined) return want;
    var d = want - cur;
    if (d > step) return cur + step;
    if (d < -step) return cur - step;
    return want;
  }
  function wantFor(cx, cy, r, exempt) {
    if (!live || exempt) return 1;
    var dx = hx - cx, dy = hy - cy;
    var d = Math.sqrt(dx * dx + dy * dy);
    var n = r * F.near, f = r * F.far;
    if (d <= n) return F.min;
    if (d >= f) return 1;
    return F.min + (1 - F.min) * ((d - n) / (f - n));
  }

  for (i = 0; i < this.buttons.length; i++) {
    b = this.buttons[i];
    var armed = this.ctrl && this.ctrl.armedSkill === b.key;
    b._fade = toward(b._fade, wantFor(b.circle.x, b.circle.y, b.r, armed));
    var fa = b._fade;
    b.circle.setAlpha(fa);
    b.text.setAlpha((b._ta === undefined ? 1 : b._ta) * fa);
    b.cool.setAlpha(fa);
    if (b.deco) b.deco.setAlpha(fa);
  }

  // 스틱 — 화면에서 가장 넓은 자리를 차지한다. 잡고 있는 동안은 그대로 둔다.
  if (this.stickRing) {
    var held = !!this.stick.active;
    this._stickFade = toward(this._stickFade,
      wantFor(this.stick.homeX, this.stick.homeY, this.stickRing.radius, held));
    var sa = this._stickFade;
    this.stickRing.setAlpha(sa);
    this.stickKnob.setAlpha(sa);
    if (this.stickDeco) this.stickDeco.setAlpha(sa);
  }
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
  this.refresh(dtMs);
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
