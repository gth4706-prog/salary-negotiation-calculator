window.GAME = window.GAME || {};

// 첫 진입 로딩 화면.
//
// 두 가지를 동시에 해결한다:
//  1) **연출** — 바로 로그인 폼이 튀어나오는 것보다 한 박자 쉬는 편이 완성도가 높아 보인다.
//  2) **실용** — 모바일은 부팅 직후 주소창이 접히며 뷰포트가 커진다. 그 사이 게임 화면이
//     작게 떴다가 커지는 게 보였다(실측 신고). 이 3초 동안 정착이 끝나므로
//     플레이어는 '작았다가 커지는' 순간을 보지 않는다.
//
// 탭하면 즉시 넘어간다 — 두 번째부터는 기다리기 싫은 사람이 대부분이다.
GAME.LoadingScene = function () {
  Phaser.Scene.call(this, { key: 'Loading' });
};
GAME.LoadingScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.LoadingScene.prototype.constructor = GAME.LoadingScene;

GAME.LoadingScene.DURATION = 3000;

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

  var cx = W / 2, cy = H * 0.40;
  var eggR = P ? 46 : 60;

  // ── 계란 ──
  // 아트 파일(eggart)은 유닛/영웅 전용이라 여기서는 간단한 도형으로 직접 그린다.
  // 통통 튀며 살짝 눌리는(squash) 움직임 — 살아있는 느낌을 주는 가장 싼 방법.
  this.g = this.add.graphics();
  this.egg = { y: 0, squash: 1, spin: 0 };

  this.tweens.add({
    targets: this.egg, y: -eggR * 0.55, duration: 460,
    ease: 'Sine.easeOut', yoyo: true, repeat: -1
  });
  this.tweens.add({
    targets: this.egg, squash: 0.86, duration: 230,
    ease: 'Sine.easeInOut', yoyo: true, repeat: -1, delay: 380
  });

  this.eggCx = cx; this.eggCy = cy; this.eggR = eggR;

  // ── 제목 ──
  var title = GAME.UI.label(this, cx, cy + eggR + u * 5, 'EGG WAR', P ? 30 : 46, C.text, 0.5)
    .setOrigin(0.5, 0).setAlpha(0);
  this.tweens.add({ targets: title, alpha: 1, duration: 600, ease: 'Quad.easeOut' });

  var sub = GAME.UI.label(this, cx, title.y + title.height + 6,
    '계란 부족 비대칭 실시간 대전', P ? 15 : 18, C.textDim, 0.5).setOrigin(0.5, 0).setAlpha(0);
  this.tweens.add({ targets: sub, alpha: 1, duration: 600, delay: 200, ease: 'Quad.easeOut' });

  // ── 진행 바 ──
  var barW = Math.min(W - 80, 320), barH = 10;
  var barX = cx - barW / 2, barY = sub.y + sub.height + u * 5;
  this.barGeo = { x: barX, y: barY, w: barW, h: barH };
  this.progress = { v: 0 };
  this.tweens.add({
    targets: this.progress, v: 1,
    duration: GAME.LoadingScene.DURATION - 300, ease: 'Sine.easeInOut'
  });

  // ── 팁 ──
  var tip = GAME.LoadingScene.TIPS[Math.floor(Math.random() * GAME.LoadingScene.TIPS.length)];
  var tipLbl = GAME.UI.label(this, cx, barY + barH + u * 4, tip,
    P ? 13 : 14, GAME.CONFIG.COLORS.textFaint, 0.5)
    .setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(W - 60).setAlpha(0);
  this.tweens.add({ targets: tipLbl, alpha: 1, duration: 700, delay: 500 });

  GAME.UI.label(this, cx, H - u * 7, '화면을 탭하면 바로 시작합니다',
    P ? 13 : 13, GAME.CONFIG.COLORS.textFaint, 0.5).setOrigin(0.5, 0);

  // 탭하면 즉시 진행
  this.input.once('pointerdown', function () { self._go(); });
  this.time.delayedCall(GAME.LoadingScene.DURATION, function () { self._go(); });
};

GAME.LoadingScene.prototype._go = function () {
  if (this.done) return;
  this.done = true;
  var self = this;
  // 화면을 부드럽게 닫고 넘어간다 — 딱 끊기면 로딩 화면을 넣은 의미가 반감된다.
  this.cameras.main.fadeOut(220, 0, 0, 0);
  this.cameras.main.once('camerafadeoutcomplete', function () {
    self.scene.start(GAME.Account.current() ? 'Menu' : 'Login');
  });
};

GAME.LoadingScene.prototype.update = function () {
  var g = this.g;
  var C = GAME.CONFIG.COLORS;
  if (!g) return;
  g.clear();

  var cx = this.eggCx, cy = this.eggCy, R = this.eggR;
  var e = this.egg;
  var ry = R * e.squash;              // 눌림
  var rx = R * (2 - e.squash) * 0.78;  // 눌리면 옆으로 퍼진다
  var y = cy + e.y + (R - ry);

  // 그림자 — 높이 뜰수록 작고 옅게
  var lift = Math.max(0, -e.y) / (R * 0.55);
  g.fillStyle(0x000000, 0.16 * (1 - lift * 0.6));
  g.fillEllipse(cx, cy + R + 10, rx * 1.5 * (1 - lift * 0.25), 12 * (1 - lift * 0.3));

  // 몸통
  var shell = (GAME.UI.MAT && GAME.UI.MAT.shell) || 0xf6e6c8;
  var ink = (GAME.UI.FX && GAME.UI.FX.ink) || 0x2a2114;
  g.fillStyle(shell, 1);
  g.fillEllipse(cx, y, rx * 2, ry * 2.24);
  if (GAME.UI.IS_LIGHT) {
    g.lineStyle(3, ink, 0.9);
    g.strokeEllipse(cx, y, rx * 2, ry * 2.24);
  }
  // 광택
  g.fillStyle(0xffffff, 0.35);
  g.fillEllipse(cx - rx * 0.34, y - ry * 0.62, rx * 0.42, ry * 0.5);
  // 눈 — 통통 튈 때 감았다 떴다
  var blink = Math.abs(e.y) > R * 0.4;
  g.fillStyle(ink, 1);
  if (blink) {
    g.fillRect(cx - rx * 0.42, y - ry * 0.06, rx * 0.26, 3);
    g.fillRect(cx + rx * 0.16, y - ry * 0.06, rx * 0.26, 3);
  } else {
    g.fillCircle(cx - rx * 0.29, y - ry * 0.04, Math.max(2.5, rx * 0.1));
    g.fillCircle(cx + rx * 0.29, y - ry * 0.04, Math.max(2.5, rx * 0.1));
  }

  // 진행 바
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
