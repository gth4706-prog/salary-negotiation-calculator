window.GAME = window.GAME || {};

// 첫 진입 인트로 + 로딩 화면.
//
// 세 가지를 동시에 해결한다:
//  1) **인트로** — 계란 둘이 달려와 부딪치고 노른자가 터진다. 이 게임이 뭘 하는
//     게임인지 3초 안에 보여준다(설명문보다 빠르다).
//  2) **연출** — 바로 로그인 폼이 튀어나오는 것보다 한 박자 쉬는 편이 완성도가 높다.
//  3) **실용** — 모바일은 부팅 직후 주소창이 접히며 뷰포트가 커진다. 그 사이 화면이
//     작게 떴다가 커지는 게 보였다(실측 신고). 이 3초 동안 정착이 끝난다.
//
// 탭하면 즉시 넘어간다 — 두 번째부터는 기다리기 싫은 사람이 대부분이다.
GAME.LoadingScene = function () {
  Phaser.Scene.call(this, { key: 'Loading' });
};
GAME.LoadingScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.LoadingScene.prototype.constructor = GAME.LoadingScene;

GAME.LoadingScene.DURATION = 3200;
GAME.LoadingScene.CLASH_AT = 1150;      // 두 계란이 부딪치는 시각(ms)

GAME.LoadingScene.TIPS = [
  '논타겟은 피할 수 있고, 타겟은 피할 수 없다.',
  '진형은 촘촘할수록 광역에 약하다.',
  '영웅은 바라보는 방향으로 스킬을 쏜다.',
  '통곡의 탑 4층부터는 조작 없이 이길 수 없다.',
  '수성의 탑은 배치가 곧 실력이다.',
  '약초꾼을 먼저 끊으면 진형이 무너진다.',
  '방어력은 비율로 깎인다 — 물량은 여전히 유효하다.'
];

GAME.LoadingScene.prototype.create = function () {
  var C = GAME.CONFIG.COLORS;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var P = GAME.CONFIG.PORTRAIT;
  var self = this;
  var u = H / 100;

  this.cameras.main.setBackgroundColor(C.bg);
  this.done = false;
  this.t = 0;
  // 인트로는 기본 투영에서 그린다(전투 씬이 켠 전체화면 모드가 남아 있을 수 있다)
  GAME.Iso.setMode('default');

  this.g = this.add.graphics();

  // 두 계란이 만나는 지점(화면 좌표) — 제목 위쪽
  this.stageY = H * (P ? 0.30 : 0.34);
  this.stageX = W / 2;
  this.yolks = [];
  this.clashed = false;

  // ── 제목 (충돌 뒤에 등장) ──
  this.title = GAME.UI.label(this, W / 2, this.stageY + (P ? 92 : 118), 'EGG WAR',
    P ? 34 : 52, C.text, 0.5).setOrigin(0.5, 0).setAlpha(0);
  this.sub = GAME.UI.label(this, W / 2, this.title.y + (P ? 44 : 62),
    '계란 부족 비대칭 실시간 대전', P ? 15 : 18, C.textDim, 0.5).setOrigin(0.5, 0).setAlpha(0);

  // ── 진행 바 ──
  var barW = Math.min(W - 80, 320), barH = 10;
  var barY = this.sub.y + (P ? 42 : 52);
  this.barGeo = { x: W / 2 - barW / 2, y: barY, w: barW, h: barH };
  this.progress = { v: 0 };
  this.tweens.add({
    targets: this.progress, v: 1,
    duration: GAME.LoadingScene.DURATION - 400, ease: 'Sine.easeInOut'
  });

  // ── 팁 ──
  var tip = GAME.LoadingScene.TIPS[Math.floor(Math.random() * GAME.LoadingScene.TIPS.length)];
  this.tipLbl = GAME.UI.label(this, W / 2, barY + barH + u * 4, tip,
    P ? 13 : 14, GAME.CONFIG.COLORS.textFaint, 0.5)
    .setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(W - 60).setAlpha(0);

  GAME.UI.label(this, W / 2, H - u * 7, '화면을 탭하면 바로 시작합니다',
    P ? 13 : 13, GAME.CONFIG.COLORS.textFaint, 0.5).setOrigin(0.5, 0);

  this.input.once('pointerdown', function () { self._go(); });
  this.time.delayedCall(GAME.LoadingScene.DURATION, function () { self._go(); });
};

GAME.LoadingScene.prototype._go = function () {
  if (this.done) return;
  this.done = true;
  var self = this;
  // 부드럽게 닫고 넘어간다 — 딱 끊기면 인트로를 넣은 의미가 반감된다.
  this.cameras.main.fadeOut(220, 0, 0, 0);
  this.cameras.main.once('camerafadeoutcomplete', function () {
    self.scene.start(GAME.Account.current() ? 'Menu' : 'Login');
  });
};

// 충돌 순간 — 노른자를 사방으로 튀긴다(게임 안의 죽음 연출과 같은 언어)
GAME.LoadingScene.prototype._burst = function () {
  var n = 14;
  for (var i = 0; i < n; i++) {
    var a = (Math.PI * 2 / n) * i + Math.random() * 0.4;
    var sp = 1.6 + Math.random() * 2.4;
    this.yolks.push({
      x: this.stageX, y: this.stageY,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.2,
      r: 3 + Math.random() * 4, life: 1
    });
  }
  this.cameras.main.shake(180, 0.006);
};

GAME.LoadingScene.prototype.update = function (time, delta) {
  var dt = Math.min(delta, 50);
  this.t += dt;
  var g = this.g;
  if (!g) return;
  var C = GAME.CONFIG.COLORS;
  var W = GAME.CONFIG.WIDTH;
  var P = GAME.CONFIG.PORTRAIT;
  var CLASH = GAME.LoadingScene.CLASH_AT;
  g.clear();

  var ink = (GAME.UI.FX && GAME.UI.FX.ink) || 0x2a2114;
  var R = P ? 30 : 38;

  // ── 두 계란의 위치 ──
  // 0 → CLASH: 양쪽 끝에서 달려와 가운데서 만난다. 이후엔 반동으로 살짝 물러난다.
  var meet = R * 0.92;
  var p = Math.min(1, this.t / CLASH);
  var ease = 1 - Math.pow(1 - p, 2.2);                  // 가속해서 달려든다
  var startOff = W * 0.62;
  var offset = startOff - (startOff - meet) * ease;

  if (this.t >= CLASH && !this.clashed) { this.clashed = true; this._burst(); }
  if (this.clashed) {
    // 부딪친 뒤 튕겨 물러났다가 천천히 제자리 — 대치 상태로 남는다
    var k = Math.min(1, (this.t - CLASH) / 700);
    offset = meet + (R * 1.5) * Math.sin(Math.min(Math.PI, k * Math.PI)) * (1 - k * 0.4);
  }

  var lx = this.stageX - offset, rx = this.stageX + offset;
  var y = this.stageY;

  // 달릴 때 위아래로 통통 (걸음걸이 대용)
  var bob = this.clashed ? 0 : Math.sin(this.t / 90) * R * 0.14;

  // 그림자
  g.fillStyle(0x000000, 0.15);
  g.fillEllipse(lx, y + R * 1.15, R * 1.5, 10);
  g.fillEllipse(rx, y + R * 1.15, R * 1.5, 10);

  // 계란 둘 — 진영색으로 구분(왼쪽 컨트롤러 / 오른쪽 전략가)
  this._egg(g, lx, y - bob, R, C.controller, ink, 1);
  this._egg(g, rx, y + bob, R, C.strategist, ink, -1);

  // 충돌 섬광
  if (this.clashed) {
    var fk = Math.max(0, 1 - (this.t - CLASH) / 320);
    if (fk > 0) {
      g.lineStyle(4 * fk + 1, (GAME.UI.FX && GAME.UI.FX.crit) || 0xffd166, 0.85 * fk);
      g.strokeCircle(this.stageX, y, R * (1.2 + (1 - fk) * 1.9));
    }
  }

  // 노른자 파편
  for (var i = this.yolks.length - 1; i >= 0; i--) {
    var q = this.yolks[i];
    q.x += q.vx * (dt / 16); q.y += q.vy * (dt / 16);
    q.vy += 0.16 * (dt / 16);
    q.life -= dt / 900;
    if (q.life <= 0) { this.yolks.splice(i, 1); continue; }
    g.fillStyle(0xf5c33b, Math.max(0, q.life));
    g.fillCircle(q.x, q.y, q.r * (0.6 + q.life * 0.6));
  }

  // ── 충돌 뒤 제목·팁 등장 ──
  var after = this.t - CLASH;
  if (after > 60) {
    var a1 = Math.min(1, (after - 60) / 320);
    this.title.setAlpha(a1);
    // 살짝 커졌다 제자리로 — '쾅' 하고 박히는 느낌
    var s = 1 + 0.14 * Math.max(0, 1 - (after - 60) / 260);
    this.title.setScale(s);
    this.sub.setAlpha(Math.min(1, (after - 220) / 340));
    this.tipLbl.setAlpha(Math.min(1, (after - 420) / 420));
  }

  // ── 진행 바 ──
  var b = this.barGeo;
  var track = (GAME.UI.COL && GAME.UI.COL.meterTrack) || 0x2a2a3a;
  g.fillStyle(track, 1);
  g.fillRoundedRect(b.x, b.y, b.w, b.h, b.h / 2);
  var pw = Math.max(b.h, b.w * this.progress.v);
  g.fillStyle(C.controller, 1);
  g.fillRoundedRect(b.x, b.y, pw, b.h, b.h / 2);
  if (GAME.UI.IS_LIGHT) {
    g.lineStyle(2, ink, 0.55);
    g.strokeRoundedRect(b.x, b.y, b.w, b.h, b.h / 2);
  }
};

// 계란 하나. dir = 바라보는 쪽(1 오른쪽 / -1 왼쪽)
GAME.LoadingScene.prototype._egg = function (g, cx, cy, R, tint, ink, dir) {
  var shell = (GAME.UI.MAT && GAME.UI.MAT.shell) || 0xf6e6c8;
  var rx = R * 0.78, ry = R * 1.06;

  g.fillStyle(shell, 1);
  g.fillEllipse(cx, cy, rx * 2, ry * 2);
  if (GAME.UI.IS_LIGHT) {
    g.lineStyle(3, ink, 0.9);
    g.strokeEllipse(cx, cy, rx * 2, ry * 2);
  }
  // 진영 띠 — 색으로 편을 읽게 한다(몸통은 둘 다 계란이라 색이 유일한 구분)
  g.fillStyle(tint, 0.9);
  g.fillEllipse(cx, cy + ry * 0.52, rx * 1.5, ry * 0.42);
  // 광택
  g.fillStyle(0xffffff, 0.32);
  g.fillEllipse(cx - rx * 0.34, cy - ry * 0.5, rx * 0.4, ry * 0.34);
  // 눈 — 서로를 노려본다
  g.fillStyle(ink, 1);
  var ex = cx + dir * rx * 0.16;
  g.fillCircle(ex - rx * 0.26, cy - ry * 0.12, Math.max(2, rx * 0.11));
  g.fillCircle(ex + rx * 0.26, cy - ry * 0.12, Math.max(2, rx * 0.11));
  // 무기 — 앞쪽으로 뻗은 막대(전사 실루엣)
  g.lineStyle(Math.max(3, R * 0.13), ink, 0.92);
  g.lineBetween(cx + dir * rx * 0.7, cy + ry * 0.1,
                cx + dir * rx * 1.9, cy - ry * 0.55);
};
