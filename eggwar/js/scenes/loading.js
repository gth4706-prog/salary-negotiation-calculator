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
  //  무기 이미지 선적재 — 캐릭터 카드가 텍스처보다 먼저 그려져 옛 벡터로 박제되는
  //  것을 막는다(2026-08-21 실기기 신고). 수백 KB, 서비스워커 캐시가 흡수한다.
  if (GAME.GearBank) GAME.GearBank.preload(this);
  // 지시는 "**인트로부터** 로비"였다 — 메뉴에서 시작하면 첫인상을 통째로 놓친다.
  //  ⚠ 여기서 튼다고 이 순간 소리가 나는 건 아니다. 브라우저 자동재생 정책 때문에
  //    오디오는 첫 입력 전까지 열리지 않는다. 그래도 지금 걸어 두는 것이 맞다 —
  //    `Music._attach()` 가 컨텍스트가 열리는 순간 페이드인을 걸어 주므로,
  //    사용자가 어디든 처음 건드리는 그 순간부터 로비 곡이 이어진다.
  if (GAME.Music) GAME.Music.play('lobby');
  var C = GAME.CONFIG.COLORS;
  var self = this;

  this.cameras.main.setBackgroundColor(C.bg);
  this.done = false;
  this.t = 0;
  // 인트로는 기본 투영에서 그린다(전투 씬이 켠 전체화면 모드가 남아 있을 수 있다)
  GAME.Iso.setMode('default');

  // 씬을 어떤 경로로 떠나든 DOM 오버레이는 반드시 걷어낸다
  this.events.once('shutdown', function () { self._teardownVideo(); self._removeAsk(); });

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

  // 화면 폭에 맞춰 **표시 방식**을 정한다.
  //  · 좁은 화면: 꽉 채워(cover) 몰입감 있게.
  //  · 넓은 화면: **폰 비율 액자 안에 축소**해서 보여준다. 세로 9:16 영상을
  //    가로 모니터에 꽉 채우면 좌우가 잘리거나 늘어나 깨져 보인다(실측 신고).
  var wide = (window.innerWidth || 0) >= 720;

  // 파일은 **화면 폭이 아니라 기기**로 고른다.
  //   폰을 가로로 들면 innerWidth 가 844~932 라 예전 `>=720` 조건이 통째로 참이 됐고,
  //   그래서 **폰이 PC용 2.1MB 파일을 받았다.** 이 게임은 모바일 가로 전용이므로
  //   사실상 모든 폰이 그랬다. 실측(헤드리스, 대역폭 제한):
  //     2.1MB @1500kbps → 4초 시점 재생위치 0.97초 · @750kbps → 0.22초 (계속 stall)
  //     849KB @1500kbps → 2.54초              · @750kbps → 0.84초
  //   즉 폰에서는 영상이 사실상 멈춰 있었다. 파일 선택을 레이아웃 프로필에 묶는다.
  //   ('phone' = 터치 + coarse 포인터 + 최대변 1100 미만. 태블릿·데스크톱은 'pc' 라
  //    예전대로 720p 를 받는다 — PC 화질 신고에 대한 대응은 그대로 살아 있다.)
  var hq = wide && GAME.CONFIG.PROFILE === 'pc';

  // ⚠ 순서가 중요하다 — `muted` 는 **src 를 붙이기 전에** 세워야 한다.
  //   사파리는 소스가 걸리는 순간의 음소거 상태로 자동재생 가부를 판정한다.
  //   속성(attribute)도 같이 단다: 프로퍼티만으로는 안 보는 엔진이 있다.
  v.muted = true;                 // 자동재생 정책 — 소리가 있으면 모바일에서 안 뜬다
  v.defaultMuted = true;
  v.setAttribute('muted', '');
  v.playsInline = true;
  v.setAttribute('playsinline', '');
  v.setAttribute('webkit-playsinline', '');
  v.autoplay = true;
  v.setAttribute('autoplay', '');
  v.preload = 'auto';
  v.controls = false;
  v.setAttribute('poster', 'assets/intro-poster.webp');
  v.src = hq ? GAME.LoadingScene.VIDEO_SRC_HQ : GAME.LoadingScene.VIDEO_SRC;
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

  this._startBtn = btn;
  this._skipBtn = skip;

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
  //
  // 자동 재시도도 건다. 첫 `play()` 는 데이터가 한 바이트도 없는 readyState 0 에서
  // 불리는데, 그 시점의 거절이 곧 '영영 못 튼다'는 뜻은 아니다. 실측(헤드리스,
  // `--autoplay-policy=user-gesture-required`): `play()` 가 653ms 에
  // **NotAllowedError** 로 거절되고 그 46ms 뒤에 canplay 가 온다. 데이터가 도착한
  // 뒤에 한 번 더 시도해야 잡히는 구간이다. 설치본(standalone)은 창이 뜨는 순간
  // 문서가 잠깐 숨김일 수 있어 **다시 보일 때도** 시도한다.
  var gaveUp = false;                 // 사용자가 이미 안내를 본 뒤에는 조용히 있는다
  function tryPlay() {
    if (self.done || !self._video) return;
    var pr = v.play();
    if (pr && pr['catch']) pr['catch'](function () {});
  }
  function blocked() {                // 자동재생이 막혔다 — 포스터 + 안내로 성립시킨다
    if (gaveUp || self.done) return;
    gaveUp = true;
    hint.style.opacity = '1';
    reveal();
  }
  wrap.addEventListener('click', function (e) {
    if (e.target === btn || e.target === skip) return;
    if (v.paused) tryPlay();
  });
  wrap.addEventListener('touchstart', function () { if (v.paused) tryPlay(); }, { passive: true });
  v.addEventListener('canplay', function () { if (v.paused) tryPlay(); });
  v.addEventListener('loadeddata', function () { if (v.paused) tryPlay(); });
  this._onVis = function () { if (!document.hidden && v.paused) tryPlay(); };
  document.addEventListener('visibilitychange', this._onVis);

  var p = v.play();
  if (p && p['catch']) {
    p['catch'](function () {
      // 여기서 바로 포기하지 않는다. 위 canplay/loadeddata 재시도가 남아 있으므로
      // 조금 기다렸다가 그래도 멈춰 있으면 안내를 띄운다.
      // 폴백(그림 인트로)으로는 넘기지 않는다: 포스터만으로도 화면이 성립하고,
      // 탭하면 영상이 돈다.
      setTimeout(function () { if (v.paused) blocked(); }, 900);
    });
  }

  // 영상이 **아예 안 오는** 상황 대비(네트워크 차단·파일 없음): 그때만 그림 인트로로.
  //
  // 예전 조건은 "4초 시점 readyState<2 이면 폴백"이었다. 이건 느린 회선에서 위험하다 —
  // 메타데이터가 오는 중이어도 시각만 넘으면 멀쩡한 영상을 버린다. 실측하면 750kbps
  // 에서도 4초 시점 readyState 는 2~3 이라 이 조건이 실제로 터지진 않았지만, 판정
  // 근거를 **'진척이 있는가'** 로 바꾼다. 한 바이트도 못 받았을 때만 폴백이다.
  var gotData = false;
  v.addEventListener('progress', function () { gotData = true; });
  v.addEventListener('loadedmetadata', function () { gotData = true; });
  this._videoGuard = setTimeout(function () {
    if (self.done) return;
    if (!gotData && v.readyState < 1) { self._videoFailed(); return; }
    if (v.paused) blocked();
  }, 4500);

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
  if (this._onVis) { document.removeEventListener('visibilitychange', this._onVis); this._onVis = null; }
  if (this._video) { try { this._video.pause(); this._video.removeAttribute('src'); this._video.load(); } catch (e) {} }
  if (this._wrap && this._wrap.parentNode) this._wrap.parentNode.removeChild(this._wrap);
  this._wrap = null; this._video = null;
};

GAME.LoadingScene.prototype._go = function () {
  if (this.done) return;
  // 아직 이름이 없으면 여기서 바로 받는다. 예전엔 Login 씬으로 넘겼는데,
  // 인트로가 끝나자마자 화면이 통째로 갈아엎히면서 연출이 끊겼다.
  // 영상 마지막 프레임을 그대로 배경으로 두고 그 위에 팝업만 띄운다.
  if (!GAME.Account.current()) { this._askNickname(); return; }
  this.done = true;
  var self = this;
  this._teardownVideo();
  this.cameras.main.fadeOut(200, 0, 0, 0);
  this.cameras.main.once('camerafadeoutcomplete', function () {
    self.scene.start('Menu');
  });
};

// ── 닉네임 팝업 ─────────────────────────────────────────────────────────────
// 인트로(영상이면 마지막 프레임, 폴백이면 캔버스) 위에 얹는 DOM 카드.
// Phaser 캔버스에는 텍스트 입력이 없어서 DOM 을 쓴다 — login.js 와 같은 이유다.
GAME.LoadingScene.prototype._askNickname = function () {
  if (this._askWrap) return;
  var self = this;

  // 영상은 마지막 프레임에서 멈춰 배경 노릇을 한다. 소리 없는 정지화면이라 안전하다.
  if (this._video) { try { this._video.pause(); } catch (e) {} }
  if (this._videoGuard) { clearTimeout(this._videoGuard); this._videoGuard = null; }
  if (this._startBtn) this._startBtn.style.display = 'none';
  if (this._skipBtn) this._skipBtn.style.display = 'none';

  // 색은 활성 테마에서 가져온다. 하드코딩하면 테마를 바꿨을 때 이 카드만 홀로 뜬다.
  var C = GAME.CONFIG.COLORS, COL = GAME.UI.COL;
  function hx(n) { return '#' + ('000000' + (n >>> 0).toString(16)).slice(-6); }
  var cardBg = hx(COL.surface !== undefined ? COL.surface : COL.surfaceAlt);
  var lineC = hx(COL.borderUi);
  var inBg = hx(COL.surfaceAlt);
  var btnBg = hx(COL.panelTeal);
  var btnLine = hx(C.controller || COL.controller);

  var wrap = document.createElement('div');
  wrap.id = 'nick-ask';
  wrap.style.cssText =
    'position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;' +
    'background:rgba(10,8,4,.62);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);' +
    'opacity:0;transition:opacity .28s ease;padding:20px;box-sizing:border-box;';

  var card = document.createElement('div');
  card.style.cssText =
    'width:min(92vw,380px);box-sizing:border-box;padding:26px 24px 22px;border-radius:18px;' +
    'background:' + cardBg + ';border:3px solid ' + lineC + ';' +
    'box-shadow:0 10px 0 rgba(42,33,20,.45),0 18px 40px rgba(0,0,0,.45);' +
    'font-family:var(--egg-font);text-align:center;' +
    'transform:translateY(18px) scale(.96);transition:transform .34s cubic-bezier(.2,1.2,.3,1);';

  function el(tag, css, text) {
    var e = document.createElement(tag);
    e.style.cssText = css;
    if (text !== undefined) e.textContent = text;
    card.appendChild(e);
    return e;
  }

  el('div', 'font:700 23px var(--egg-font);color:' + C.text + ';margin-bottom:6px;',
    '닉네임을 입력하세요');
  el('div', 'font:400 13px var(--egg-font);color:' + C.textDim + ';line-height:1.5;margin-bottom:18px;',
    '비밀번호는 없습니다. 이 이름 그대로 랭킹에 오릅니다.');

  var input = document.createElement('input');
  input.type = 'text';
  input.maxLength = GAME.Account.MAX_LEN;
  input.placeholder = '2~12자';
  input.style.cssText =
    'width:100%;box-sizing:border-box;height:52px;padding:0 14px;margin-bottom:10px;' +
    'font:600 19px var(--egg-font);text-align:center;' +
    'border-radius:10px;border:2px solid ' + lineC + ';background:' + inBg + ';' +
    'color:' + C.text + ';outline:none;';
  card.appendChild(input);

  var msg = el('div', 'min-height:18px;font:600 13px var(--egg-font);color:' + C.warn + ';margin-bottom:10px;', '');

  var enter = document.createElement('button');
  enter.textContent = '입장';
  enter.style.cssText =
    'width:100%;height:56px;border-radius:12px;cursor:pointer;' +
    'font:700 20px var(--egg-font);letter-spacing:1px;' +
    'color:' + C.accent + ';background:' + btnBg + ';border:3px solid ' + btnLine + ';' +
    'box-shadow:0 5px 0 rgba(42,33,20,.4);-webkit-tap-highlight-color:transparent;';
  card.appendChild(enter);

  // 최근 쓰던 이름 — 두 번째부터는 타이핑을 다시 시키지 않는다
  var recent = GAME.Account.list().filter(function (r) { return !r.blocked; }).slice(0, 3);
  if (recent.length) {
    el('div', 'font:400 12px var(--egg-font);color:' + C.textDim + ';margin:16px 0 8px;', '최근 사용');
    var row = el('div', 'display:flex;gap:8px;justify-content:center;flex-wrap:wrap;');
    recent.forEach(function (r) {
      var chip = document.createElement('button');
      chip.textContent = r.id;
      // 44px 은 터치 타깃 하한이다(CLAUDE.md). padding 만으로는 40px 이 나왔다(실측).
      chip.style.cssText =
        'min-height:46px;padding:0 18px;border-radius:999px;cursor:pointer;max-width:100%;' +
        'font:600 14px var(--egg-font);color:' + C.text + ';' +
        'background:' + inBg + ';border:2px solid ' + lineC + ';' +
        'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' +
        '-webkit-tap-highlight-color:transparent;';
      chip.addEventListener('click', function () { submit(r.id); });
      row.appendChild(chip);
    });
  }

  wrap.appendChild(card);
  document.body.appendChild(wrap);
  this._askWrap = wrap;
  // 다음 프레임에 상태를 바꿔야 transition 이 걸린다(같은 프레임에 넣으면 즉시 최종값이 된다)
  requestAnimationFrame(function () {
    wrap.style.opacity = '1';
    card.style.transform = 'translateY(0) scale(1)';
  });

  function submit(value) {
    var r = GAME.Account.login(value);
    if (!r.ok) {
      msg.textContent = r.reason;
      card.style.transform = 'translateY(0) scale(1.02)';
      setTimeout(function () { card.style.transform = 'translateY(0) scale(1)'; }, 130);
      return;
    }
    self._removeAsk();
    self.done = true;
    self._teardownVideo();
    self.cameras.main.fadeOut(200, 0, 0, 0);
    self.cameras.main.once('camerafadeoutcomplete', function () { self.scene.start('Menu'); });
  }

  enter.addEventListener('click', function () { submit(input.value); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') submit(input.value);
    e.stopPropagation();          // 게임 키 핸들러로 새지 않게
  });
  input.focus();
};

GAME.LoadingScene.prototype._removeAsk = function () {
  if (this._askWrap && this._askWrap.parentNode) this._askWrap.parentNode.removeChild(this._askWrap);
  this._askWrap = null;
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

  this.title = GAME.UI.label(this, W / 2, this.stageY + (P ? 92 : 118), '계란들의 전쟁',
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
