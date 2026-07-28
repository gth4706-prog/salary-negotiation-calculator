window.GAME = window.GAME || {};

// ============================================================================
//  설치(PWA) · 전체화면
//
//  배경 — 왜 이 파일이 생겼나 (docs/proposals/2026-07-28-mobile-strategy.md)
//  세로 레이아웃이 기종마다 깨지는 사고를 세 번 겪었다. 원인은 전부 같았다:
//  **주소창 때문에 보이는 뷰포트가 흔들리고, 그 값을 브라우저에 물으면 기종마다
//  다른 답이 온다.** 가로로 돌려도 주소창은 그대로 있으니 해결이 안 된다.
//
//  홈 화면에 설치해서 열면(`display: standalone`) 주소창이 **아예 없다** →
//  원인 자체가 사라진다. iOS·안드로이드 둘 다 되는 표준 동작이라
//  API 호환성에 기대지 않는다.
//
//  전체화면 API 는 **보조 수단**일 뿐이다. 조사 결과(2026-07):
//    · `requestFullscreen()`  — 안드로이드 크롬 완전 지원 / iOS 사파리는 여전히 부분 지원
//    · `screen.orientation.lock()` — MDN 기준 "Limited availability, not Baseline".
//      iOS 에서는 사실상 불가. 즉 **가로 강제는 iOS 에서 못 한다.**
//    · iOS 전체화면은 입력창에 포커스가 가면 풀린다는 보고가 있다 →
//      닉네임 입력이 끝난 **메뉴 이후에만** 버튼을 노출한다.
//  그래서 여기서는 "되면 좋고 안 되면 조용히 숨긴다" 원칙으로만 쓴다.
//  **전체화면을 전제로 레이아웃을 짜지 않는다.**
// ============================================================================
GAME.PWA = (function () {
  var DISMISS_KEY = 'asymgame.installDismissed';

  function isStandalone() {
    if (window.navigator && window.navigator.standalone === true) return true;  // iOS
    return !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  }

  function isIOS() {
    var ua = navigator.userAgent || '';
    // iPadOS 13+ 는 데스크톱 사파리로 위장한다 → 터치 지원으로 한 번 더 거른다
    return /iPad|iPhone|iPod/.test(ua) ||
           (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  }

  // ── 서비스 워커 ──
  // 안드로이드 크롬이 '앱 설치'를 제안하려면 fetch 핸들러를 가진 워커가 필요하다.
  // sw.js 는 의도적으로 아무것도 캐시하지 않는다(그 이유는 sw.js 주석 참조).
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' &&
        location.hostname !== '127.0.0.1') return;
    try {
      navigator.serviceWorker.register('sw.js', { scope: './' })['catch'](function () {});
    } catch (e) {}
  }

  // ── 설치 유도 ──
  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();          // 크롬 기본 배너를 막고 우리 타이밍에 띄운다
    deferredPrompt = e;
  });
  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    try { GAME.Store.set(DISMISS_KEY, 1); } catch (e) {}
    removeBanner();
  });

  var banner = null;
  var bannerTimer = null;
  var shownThisSession = false;
  function removeBanner() {
    if (bannerTimer) { clearTimeout(bannerTimer); bannerTimer = null; }
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
    banner = null;
  }

  function dismissed() {
    try { return !!GAME.Store.get(DISMISS_KEY, 0); } catch (e) { return false; }
  }

  // 메뉴에 처음 도달했을 때만 부른다 — 인트로·닉네임 입력을 가로막지 않게.
  function maybeShowInstall() {
    if (banner || shownThisSession || isStandalone() || dismissed()) return;
    if (!GAME.isTouch) return;                 // 데스크톱에는 의미가 없다
    if (!deferredPrompt && !isIOS()) return;   // 설치 경로가 없는 브라우저는 조용히 넘어간다

    var C = GAME.CONFIG.COLORS, COL = GAME.UI.COL;
    function hx(n) { return '#' + ('000000' + (n >>> 0).toString(16)).slice(-6); }

    banner = document.createElement('div');
    banner.id = 'install-bar';
    banner.style.cssText =
      'position:fixed;left:0;right:0;bottom:0;z-index:35;box-sizing:border-box;' +
      'padding:12px 14px calc(12px + env(safe-area-inset-bottom,0px));' +
      'display:flex;gap:10px;align-items:center;font-family:var(--egg-font);' +
      'background:' + hx(COL.surface === undefined ? COL.surfaceAlt : COL.surface) + ';' +
      'border-top:2px solid ' + hx(COL.borderUi) + ';' +
      'box-shadow:0 -6px 18px rgba(0,0,0,.18);' +
      'transform:translateY(110%);transition:transform .4s cubic-bezier(.2,1.1,.3,1);';

    var txt = document.createElement('div');
    txt.style.cssText = 'flex:1;min-width:0;font:600 13px var(--egg-font);color:' + C.text + ';line-height:1.45;';
    txt.innerHTML = isIOS() && !deferredPrompt
      ? '홈 화면에 추가하면 주소창 없이 꽉 찬 화면으로 즐길 수 있어요.<br>' +
        '<span style="color:' + C.textDim + ';font-weight:400">공유 <b>⬆</b> → “홈 화면에 추가”</span>'
      : '홈 화면에 추가하면 주소창 없이 꽉 찬 화면으로 즐길 수 있어요.';
    banner.appendChild(txt);

    if (deferredPrompt) {
      var add = document.createElement('button');
      add.textContent = '추가';
      add.style.cssText =
        'flex:0 0 auto;min-height:44px;padding:0 18px;border-radius:10px;cursor:pointer;' +
        'font:700 15px var(--egg-font);color:' + C.accent + ';' +
        'background:' + hx(COL.panelTeal) + ';border:2px solid ' + hx(C.controller || COL.controller) + ';' +
        '-webkit-tap-highlight-color:transparent;';
      add.addEventListener('click', function () {
        var p = deferredPrompt;
        deferredPrompt = null;
        removeBanner();
        if (p && p.prompt) { try { p.prompt(); } catch (e) {} }
      });
      banner.appendChild(add);
    }

    var close = document.createElement('button');
    close.textContent = '✕';
    close.setAttribute('aria-label', '닫기');
    close.style.cssText =
      'flex:0 0 auto;width:44px;height:44px;border-radius:10px;cursor:pointer;' +
      'font:600 16px var(--egg-font);color:' + C.textDim + ';' +
      'background:transparent;border:2px solid ' + hx(COL.border) + ';' +
      '-webkit-tap-highlight-color:transparent;';
    close.addEventListener('click', function () {
      try { GAME.Store.set(DISMISS_KEY, 1); } catch (e) {}
      removeBanner();
    });
    banner.appendChild(close);

    document.body.appendChild(banner);
    shownThisSession = true;
    requestAnimationFrame(function () {
      if (banner) banner.style.transform = 'translateY(0)';
    });
    // 세로에서 이 막대(70px)가 메뉴 하단 버튼 줄을 덮는다(실측). 설치는 급한 일이 아니므로
    // **스스로 물러난다.** 한 세션에 한 번만 뜨고, ✕ 를 누르면 다음부터 영영 안 뜬다.
    bannerTimer = setTimeout(function () {
      if (!banner) return;
      banner.style.transform = 'translateY(110%)';
      setTimeout(removeBanner, 450);
    }, 9000);
  }

  // ── 전체화면 ──
  function fsElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function canFullscreen() {
    var d = document.documentElement;
    return !!(d.requestFullscreen || d.webkitRequestFullscreen) &&
           (document.fullscreenEnabled === undefined || document.fullscreenEnabled ||
            document.webkitFullscreenEnabled);
  }

  function isFullscreen() { return !!fsElement(); }

  // 성공/실패를 콜백으로 알려준다. 실패해도 절대 사용자에게 에러를 띄우지 않는다 —
  // 호출부가 버튼을 조용히 숨기는 게 이 기능의 계약이다.
  function toggleFullscreen(done) {
    function finish() { if (done) done(isFullscreen()); }
    try {
      if (isFullscreen()) {
        var ex = document.exitFullscreen || document.webkitExitFullscreen;
        var pr = ex ? ex.call(document) : null;
        if (pr && pr.then) pr.then(finish, finish); else setTimeout(finish, 120);
        return;
      }
      var d = document.documentElement;
      var req = d.requestFullscreen || d.webkitRequestFullscreen;
      if (!req) { finish(); return; }
      var p = req.call(d, { navigationUI: 'hide' });
      if (p && p.then) p.then(afterEnter, finish); else setTimeout(afterEnter, 150);
    } catch (e) { finish(); }

    function afterEnter() {
      // **지금 방향으로 잠근다.** 가로로 강제하지 않는다 — 우리 레이아웃은
      // 부팅 시점의 방향으로 이미 고정돼 있어서, 반대로 잠그면 화면이 통째로 어긋난다.
      // 안드로이드는 전체화면일 때만 잠금이 되고, iOS 는 거절한다(정상).
      try {
        if (screen.orientation && screen.orientation.lock) {
          var want = GAME.CONFIG.PORTRAIT ? 'portrait' : 'landscape';
          var lp = screen.orientation.lock(want);
          if (lp && lp['catch']) lp['catch'](function () {});
        }
      } catch (e) {}
      finish();
    }
  }

  registerSW();

  return {
    isStandalone: isStandalone,
    isIOS: isIOS,
    maybeShowInstall: maybeShowInstall,
    // 배너는 DOM 이라 씬이 바뀌어도 남는다 → 메뉴를 떠날 때 반드시 걷어낸다.
    // 안 그러면 전투 화면 아래를 가린다.
    hideInstall: removeBanner,
    canFullscreen: canFullscreen,
    isFullscreen: isFullscreen,
    toggleFullscreen: toggleFullscreen
  };
})();
