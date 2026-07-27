window.GAME = window.GAME || {};

// 첫 진입 인트로.
//
// 두 갈래로 동작한다:
//  1) **영상 인트로** — assets/intro.mp4 (8초, 829KB). 계란 둘이 격돌 → 영웅 환호 →
//     EGG WAR 제목. 제목이 뜨는 시점(5.2초)에 '게임 시작' 버튼이 아래에서 스르륵 올라온다.
//     캔버스 위에 DOM <video> 를 덮어 재생한다 — Phaser 로 영상을 로드하면 부팅이 그만큼
//     늦어지는데, DOM 이면 게임은 뒤에서 이미 초기화를 끝내고 기다릴 수 있다.
//  2) **폴백(그림 인트로)** — 영상이 못 열리거나(정책·네트워크) 재생이 막히면
//     예전의 캔버스 인트로(계란 둘이 달려와 충돌)를 그대로 돌린다. 화면이 비지 않게.
//
// 또 실용적인 이유가 하나 더 있다: 모바일은 부팅 직후 주소창이 접히며 뷰포트가 커진다.
// 이 인트로가 도는 동안 정착이 끝나 '작았다가 커지는' 순간을 플레이어가 보지 않는다.
GAME.LoadingScene = function () {
  Phaser.Scene.call(this, { key: 'Loading' });
};
GAME.LoadingScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.LoadingScene.prototype.constructor = GAME.LoadingScene;

GAME.LoadingScene.DURATION = 3200;      // 폴백(그림 인트로) 길이
GAME.LoadingScene.CLASH_AT = 1150;      // 폴백에서 두 계란이 부딪치는 시각(ms)
// 영상은 화면 크기에 따라 고른다. 세로 영상이라 큰 화면에서 540p 를 늘리면 뭉개진다
// (실측 신고: "PC 에서 너무 확대돼서 깨짐") → 넓은 화면엔 720p 원본화질을 준다.
GAME.LoadingScene.VIDEO_SRC = 'assets/intro.mp4';        // 540x960 · 829KB (폰)
GAME.LoadingScene.VIDEO_SRC_HQ = 'assets/intro-hq.mp4';  // 720x1280 · 2.1MB (PC)
GAME.LoadingScene.BUTTON_AT = 5.2;      // 영상에서 제목이 뜨는 시각(초) — 버튼도 이때 올라온다

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
  var self = this;

  this.cameras.main.setBackgroundColor(C.bg);
  this.done = false;
  this.t = 0;
  // 인트로는 기본 투영에서 그린다(전투 씬이 켠 전체화면 모드가 남아 있을 수 있다)
  GAME.Iso.setMode('default');

  // 씬을 어떤 경로로 떠나든 DOM 오버레이는 반드시 걷어낸다
  this.events.once('shutdown', function () { self._teardownVideo(); });

  if (!this._startVideo()) this._buildFallback();
};

// ── 영상 인트로 ─────────────────────────────────────────────────────────────
// 성공하면 true. 브라우저가 mp4 를 못 다루면 false 를 돌려 폴백으로 넘긴다.
GAME.LoadingScene.prototype._startVideo = function () {
  var self = this;
  var v = document.createElement('video');
  if (!v.canPlayType || !v.canPlayType('video/mp4')) return false;

  var wrap = document.createElement('div');
  wrap.id = 'intro-wrap';
  wrap.style.cssText =
    'position:fixed;inset:0;z-index:30;background:#fbf2df;' +
    'display:flex;align-items:center;justify-content:center;overflow:hidden;';

  // 화면 폭에 맞춰 파일과 표시 방식을 정한다.
  //  · 좁은 화면(폰): 540p 를 꽉 채워(cover) 몰입감 있게.
  //  · 넓은 화면(PC): 720p 를 **폰 비율 액자 안에 축소**해서 보여준다. 세로 9:16 영상을
  //    가로 모니터에 꽉 채우면 좌우가 잘리거나 늘어나 깨져 보인다(실측 신고).
  var wide = (window.innerWidth || 0) >= 720;
  v.src = wide ? GAME.LoadingScene.VIDEO_SRC_HQ : GAME.LoadingScene.VIDEO_SRC;
  v.setAttribute('poster', 'assets/intro-poster.webp');
  v.muted = true;                 // 자동재생 정책 — 소리가 있으면 모바일에서 안 뜬다
  v.defaultMuted = true;
  v.playsInline = true;
  v.setAttribute('playsinline', '');
  v.setAttribute('webkit-playsinline', '');
  v.autoplay = true;
  v.preload = 'auto';
  v.controls = false;
  if (wide) {
    // 화면 높이에 맞춰 세로로 꽉, 폭은 9:16 비율만큼만 — 가운데 액자처럼
    v.style.cssText =
      'height:100vh;height:100dvh;width:auto;max-width:100vw;aspect-ratio:9/16;' +
      'object-fit:contain;display:block;';
  } else {
    v.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
  }
  wrap.appendChild(v);

  // ── '게임 시작' 버튼 — 제목이 뜨는 시점에 아래에서 스르륵 ──
  var btn = document.createElement('button');
  btn.textContent = '게임 시작';
  btn.style.cssText =
    'position:absolute;left:50%;bottom:8%;transform:translate(-50%,140%);' +
    'padding:16px 46px;border-radius:999px;cursor:pointer;' +
    'font:700 21px var(--egg-font);letter-spacing:1px;' +
    'color:#fffcf0;background:#123f96;border:3px solid #2a2114;' +
    'box-shadow:0 6px 0 #2a2114,0 10px 22px rgba(42,33,20,.35);' +
    'opacity:0;transition:transform .55s cubic-bezier(.2,1.2,.3,1),opacity .45s ease;' +
    '-webkit-tap-highlight-color:transparent;';
  wrap.appendChild(btn);

  // 건너뛰기 — 두 번째부터는 기다리기 싫은 사람이 대부분이다
  var skip = document.createElement('button');
  skip.textContent = '건너뛰기 ▸';
  skip.style.cssText =
    'position:absolute;right:14px;top:14px;padding:9px 16px;border-radius:999px;cursor:pointer;' +
    'font:600 14px var(--egg-font);color:#2a2114;' +
    'background:rgba(255,252,240,.82);border:2px solid rgba(42,33,20,.45);' +
    '-webkit-tap-highlight-color:transparent;';
  wrap.appendChild(skip);

  // 자동재생이 막혔을 때만 뜨는 안내 (평상시 투명)
  var hint = document.createElement('div');
  hint.textContent = '▶  화면을 탭하면 인트로가 재생됩니다';
  hint.style.cssText =
    'position:absolute;left:50%;top:52%;transform:translate(-50%,-50%);' +
    'padding:12px 22px;border-radius:999px;pointer-events:none;' +
    'font:600 15px var(--egg-font);color:#2a2114;' +
    'background:rgba(255,252,240,.9);border:2px solid rgba(42,33,20,.4);' +
    'opacity:0;transition:opacity .3s ease;';
  wrap.appendChild(hint);

  document.body.appendChild(wrap);
  this._wrap = wrap;
  this._video = v;

  function reveal() {
    if (btn.dataset.on) return;
    btn.dataset.on = '1';
    btn.style.opacity = '1';
    btn.style.transform = 'translate(-50%,0)';
  }
  this._revealButton = reveal;
  // 재생이 시작되면 안내를 숨긴다
  v.addEventListener('playing', function () { hint.style.opacity = '0'; });

  btn.addEventListener('click', function () { self._go(); });
  skip.addEventListener('click', function () { self._go(); });

  // 제목 시점에 버튼 등장. 영상이 끝나면 마지막 화면에서 멈춘 채 버튼만 남긴다.
  v.addEventListener('timeupdate', function () {
    if (v.currentTime >= GAME.LoadingScene.BUTTON_AT) reveal();
  });
  v.addEventListener('ended', function () {
    // 마지막 프레임에 정지 — 검은 화면으로 끊기지 않게
    try { v.pause(); v.currentTime = Math.max(0, (v.duration || 8) - 0.05); } catch (e) {}
    reveal();
  });
  // 재생이 막히거나(자동재생 차단) 파일을 못 열면 폴백으로
  v.addEventListener('error', function () { self._videoFailed(); });

  // 자동재생이 막힌 기기를 위해 — 화면 아무 데나 한 번 누르면 재생을 다시 시도한다.
  // (모바일은 '사용자 제스처' 뒤에는 재생을 허용한다. 실측 신고: 폰에서 영상이 안 나왔다.)
  function tryPlay() {
    var pr = v.play();
    if (pr && pr.catch) pr.catch(function () {});
  }
  wrap.addEventListener('click', function (e) {
    if (e.target === btn || e.target === skip) return;
    if (v.paused) tryPlay();
  });
  wrap.addEventListener('touchstart', function () { if (v.paused) tryPlay(); }, { passive: true });

  var p = v.play();
  if (p && p.catch) {
    p.catch(function () {
      // 자동재생이 막힌 경우 — 포스터를 띄운 채 '탭하면 재생' 안내 + 시작 버튼을 바로 준다.
      // 여기서 폴백으로 넘기지 않는다: 포스터만으로도 화면이 성립하고, 탭하면 영상이 돈다.
      hint.style.opacity = '1';
      reveal();
    });
  }

  // 영상이 아예 안 뜨는 상황 대비(네트워크 지연·차단): 4초 안에 준비가 안 되면 폴백.
  // 2.5초는 느린 모바일 회선에서 너무 짧아 멀쩡한 영상도 폴백으로 넘어갔다.
  this._videoGuard = setTimeout(function () {
    if (self.done) return;
    if (v.readyState < 2) self._videoFailed();
    else if (v.paused) { hint.style.opacity = '1'; reveal(); }
  }, 4000);

  return true;
};

GAME.LoadingScene.prototype._videoFailed = function () {
  if (this.done || this._fellBack) return;
  this._fellBack = true;
  this._teardownVideo();
  this._buildFallback();
};

GAME.LoadingScene.prototype._teardownVideo = function () {
  if (this._videoGuard) { clearTimeout(this._videoGuard); this._videoGuard = null; }
  if (this._video) { try { this._video.pause(); this._video.removeAttribute('src'); this._video.load(); } catch (e) {} }
  if (this._wrap && this._wrap.parentNode) this._wrap.parentNode.removeChild(this._wrap);
  this._wrap = null; this._video = null;
};

GAME.LoadingScene.prototype._go = function () {
  if (this.done) return;
  this.done = true;
  var self = this;
  this._teardownVideo();
  this.cameras.main.fadeOut(200, 0, 0, 0);
  this.cameras.main.once('camerafadeoutcomplete', function () {
    self.scene.start(GAME.Account.current() ? 'Menu' : 'Login');
  });
};

// ── 폴백: 캔버스로 그리는 인트로 (영상이 안 될 때만) ────────────────────────
GAME.LoadingScene.prototype._buildFallback = function () {
  var C = GAME.CONFIG.COLORS;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var P = GAME.CONFIG.PORTRAIT;
  var self = this;
  var u = H / 100;

  this.fallback = true;
  this.t = 0;
  this.g = this.add.graphics();
  this.stageY = H * (P ? 0.30 : 0.34);
  this.stageX = W / 2;
  this.yolks = [];
  this.clashed = false;

  this.title = GAME.UI.label(this, W / 2, this.stageY + (P ? 92 : 118), 'EGG WAR',
    P ? 34 : 52, C.text, 0.5).setOrigin(0.5, 0).setAlpha(0);
  this.sub = GAME.UI.label(this, W / 2, this.title.y + (P ? 44 : 62),
    '계란 부족 비대칭 실시간 대전', P ? 15 : 18, C.textDim, 0.5).setOrigin(0.5, 0).setAlpha(0);

  var barW = Math.min(W - 80, 320), barH = 10;
  var barY = this.sub.y + (P ? 42 : 52);
  this.barGeo = { x: W / 2 - barW / 2, y: barY, w: barW, h: barH };
  this.progress = { v: 0 };
  this.tweens.add({
    targets: this.progress, v: 1,
    duration: GAME.LoadingScene.DURATION - 400, ease: 'Sine.easeInOut'
  });

  var tip = GAME.LoadingScene.TIPS[Math.floor(Math.random() * GAME.LoadingScene.TIPS.length)];
  this.tipLbl = GAME.UI.label(this, W / 2, barY + barH + u * 4, tip,
    P ? 13 : 14, GAME.CONFIG.COLORS.textFaint, 0.5)
    .setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(W - 60).setAlpha(0);

  GAME.UI.label(this, W / 2, H - u * 7, '화면을 탭하면 바로 시작합니다',
    P ? 13 : 13, GAME.CONFIG.COLORS.textFaint, 0.5).setOrigin(0.5, 0);

  this.input.once('pointerdown', function () { self._go(); });
  this.time.delayedCall(GAME.LoadingScene.DURATION, function () { self._go(); });
};

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
  if (!this.fallback || !this.g) return;      // 영상 인트로일 땐 그릴 게 없다
  var dt = Math.min(delta, 50);
  this.t += dt;
  var g = this.g;
  var C = GAME.CONFIG.COLORS;
  var W = GAME.CONFIG.WIDTH;
  var P = GAME.CONFIG.PORTRAIT;
  var CLASH = GAME.LoadingScene.CLASH_AT;
  g.clear();

  var ink = (GAME.UI.FX && GAME.UI.FX.ink) || 0x2a2114;
  var R = P ? 30 : 38;

  var meet = R * 0.92;
  var p = Math.min(1, this.t / CLASH);
  var ease = 1 - Math.pow(1 - p, 2.2);
  var startOff = W * 0.62;
  var offset = startOff - (startOff - meet) * ease;

  if (this.t >= CLASH && !this.clashed) { this.clashed = true; this._burst(); }
  if (this.clashed) {
    var k = Math.min(1, (this.t - CLASH) / 700);
    offset = meet + (R * 1.5) * Math.sin(Math.min(Math.PI, k * Math.PI)) * (1 - k * 0.4);
  }

  var lx = this.stageX - offset, rx = this.stageX + offset;
  var y = this.stageY;
  var bob = this.clashed ? 0 : Math.sin(this.t / 90) * R * 0.14;

  g.fillStyle(0x000000, 0.15);
  g.fillEllipse(lx, y + R * 1.15, R * 1.5, 10);
  g.fillEllipse(rx, y + R * 1.15, R * 1.5, 10);

  this._egg(g, lx, y - bob, R, C.controller, ink, 1);
  this._egg(g, rx, y + bob, R, C.strategist, ink, -1);

  if (this.clashed) {
    var fk = Math.max(0, 1 - (this.t - CLASH) / 320);
    if (fk > 0) {
      g.lineStyle(4 * fk + 1, (GAME.UI.FX && GAME.UI.FX.crit) || 0xffd166, 0.85 * fk);
      g.strokeCircle(this.stageX, y, R * (1.2 + (1 - fk) * 1.9));
    }
  }

  for (var i = this.yolks.length - 1; i >= 0; i--) {
    var q = this.yolks[i];
    q.x += q.vx * (dt / 16); q.y += q.vy * (dt / 16);
    q.vy += 0.16 * (dt / 16);
    q.life -= dt / 900;
    if (q.life <= 0) { this.yolks.splice(i, 1); continue; }
    g.fillStyle(0xf5c33b, Math.max(0, q.life));
    g.fillCircle(q.x, q.y, q.r * (0.6 + q.life * 0.6));
  }

  var after = this.t - CLASH;
  if (after > 60) {
    var a1 = Math.min(1, (after - 60) / 320);
    this.title.setAlpha(a1);
    var s = 1 + 0.14 * Math.max(0, 1 - (after - 60) / 260);
    this.title.setScale(s);
    this.sub.setAlpha(Math.min(1, (after - 220) / 340));
    this.tipLbl.setAlpha(Math.min(1, (after - 420) / 420));
  }

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

GAME.LoadingScene.prototype._egg = function (g, cx, cy, R, tint, ink, dir) {
  var shell = (GAME.UI.MAT && GAME.UI.MAT.shell) || 0xf6e6c8;
  var rx = R * 0.78, ry = R * 1.06;

  g.fillStyle(shell, 1);
  g.fillEllipse(cx, cy, rx * 2, ry * 2);
  if (GAME.UI.IS_LIGHT) {
    g.lineStyle(3, ink, 0.9);
    g.strokeEllipse(cx, cy, rx * 2, ry * 2);
  }
  g.fillStyle(tint, 0.9);
  g.fillEllipse(cx, cy + ry * 0.52, rx * 1.5, ry * 0.42);
  g.fillStyle(0xffffff, 0.32);
  g.fillEllipse(cx - rx * 0.34, cy - ry * 0.5, rx * 0.4, ry * 0.34);
  g.fillStyle(ink, 1);
  var ex = cx + dir * rx * 0.16;
  g.fillCircle(ex - rx * 0.26, cy - ry * 0.12, Math.max(2, rx * 0.11));
  g.fillCircle(ex + rx * 0.26, cy - ry * 0.12, Math.max(2, rx * 0.11));
  g.lineStyle(Math.max(3, R * 0.13), ink, 0.92);
  g.lineBetween(cx + dir * rx * 0.7, cy + ry * 0.1,
                cx + dir * rx * 1.9, cy - ry * 0.55);
};
