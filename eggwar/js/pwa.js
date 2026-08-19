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

  // 0xRRGGBB → '#rrggbb'. 테마 토큰이 숫자라 DOM 에 쓰려면 매번 필요하다.
  function hx(n) { return '#' + ('000000' + (n >>> 0).toString(16)).slice(-6); }

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

  // ── 첫 터치에서 자동 전체화면 + 방향 잠금 (2026-08-20) ─────────────────────
  //  태현님: "게임 키자마자 가로화면·전체화면 고정이 잘 안 먹힌다."
  //  브라우저는 제스처 없이 전체화면에 못 들어간다 — 그래서 **첫 터치**(어차피
  //  로딩 화면을 탭한다)에 실어서 요청한다. 잠금 방향은 toggleFullscreen 이
  //  부팅 프로필에 맞춰 정한다(반대로 잠그면 레이아웃이 통째로 어긋난다).
  //  · 설치본(standalone)은 매니페스트가 fullscreen+landscape 를 이미 보장 → 건너뜀
  //  · iOS 는 전체화면 API 가 없어 조용히 아무 일도 안 한다(기존 안내 문구가 담당)
  //  · 실패해도 사용자에게 아무것도 띄우지 않는다(전체화면 계약과 동일)
  function autoFullscreenOnFirstTouch() {
    if (!GAME.isTouch || isStandalone() || !canFullscreen()) return;
    var fire = function () {
      document.removeEventListener('pointerdown', fire, true);
      if (isFullscreen()) return;
      toggleFullscreen(function () {});
    };
    document.addEventListener('pointerdown', fire, true);
  }

  // ── '가로로 돌려주세요' 안내의 전체화면 버튼 ──
  // 여기서만은 **가로로 잠그는 게 맞다** — 사용자가 원하는 방향이 가로이기 때문.
  // 안드로이드는 전체화면 진입 후 잠금이 먹혀 화면이 실제로 돌아간다.
  // iOS 는 잠금을 거절하므로 버튼을 눌러도 그대로다 → 그래서 안내 문구를 남겨 둔다.
  function wireRotatePrompt() {
    var btn = document.getElementById('rotate-fs');
    if (!btn) return;
    if (!canFullscreen() || isStandalone()) return;   // 설치본은 이미 주소창이 없다
    btn.hidden = false;
    btn.addEventListener('click', function () {
      toggleFullscreen(function (ok) {
        if (!ok) btn.hidden = true;                   // 안 되는 기기에서는 조용히 치운다
      });
    });
  }

  // ── 확인 팝업 (DOM) ─────────────────────────────────────────────────────
  // 왜 Phaser(`js/modal.js`)가 아니라 DOM 인가:
  //  · `GAME.Modal` 은 씬 안에서 도는 표시객체다. 씬이 바뀌면 같이 파괴되고,
  //    지금 어느 씬인지 알아야 만들 수 있다. 뒤로가기는 **씬 밖의 사건**이라
  //    그 의존을 만들면 씬마다 코드가 필요해진다(이번 작업의 제약과 정면충돌).
  //  · 닉네임 팝업(`js/scenes/loading.js`)이 이미 같은 방식이다 — 근거가 같다.
  // 색은 활성 테마 토큰에서 가져온다. 하드코딩하면 테마를 바꿨을 때 이 카드만 홀로 뜬다.
  var dialog = null;
  function dialogOpen() { return !!dialog; }
  function closeDialog() {
    if (dialog && dialog.parentNode) dialog.parentNode.removeChild(dialog);
    dialog = null;
  }

  // confirm(제목, 설명, 확인라벨, onOk, onCancel)
  function confirmDialog(title, desc, okLabel, onOk, onCancel) {
    closeDialog();
    var C = (GAME.CONFIG && GAME.CONFIG.COLORS) || {};
    var COL = (GAME.UI && GAME.UI.COL) || {};
    var cardBg = hx(COL.surface !== undefined ? COL.surface : (COL.surfaceAlt || 0x1a1a26));
    var lineC = hx(COL.borderUi !== undefined ? COL.borderUi : 0x2a2114);
    var okBg = hx(COL.panelTeal !== undefined ? COL.panelTeal : 0x123f96);
    var okLine = hx(C.controller !== undefined ? C.controller : (COL.controller || 0x35d0a5));
    var subBg = hx(COL.surfaceAlt !== undefined ? COL.surfaceAlt : 0x22222e);

    var wrap = document.createElement('div');
    wrap.id = 'nav-confirm';
    // z-index 60 — 인트로(30)·설치배너(35)·닉네임(40)보다 위. 뒤로가기는 항상 최상위다.
    wrap.style.cssText =
      'position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(10,8,4,.62);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);' +
      'opacity:0;transition:opacity .2s ease;padding:20px;box-sizing:border-box;';

    var card = document.createElement('div');
    card.style.cssText =
      'width:min(92vw,360px);box-sizing:border-box;padding:24px 22px 20px;border-radius:18px;' +
      'background:' + cardBg + ';border:3px solid ' + lineC + ';' +
      'box-shadow:0 10px 0 rgba(42,33,20,.45),0 18px 40px rgba(0,0,0,.45);' +
      'font-family:var(--egg-font);text-align:center;' +
      'transform:translateY(14px) scale(.97);transition:transform .26s cubic-bezier(.2,1.2,.3,1);';

    var t = document.createElement('div');
    t.style.cssText = 'font:700 21px var(--egg-font);color:' + (C.text || '#fff') + ';margin-bottom:6px;';
    t.textContent = title;
    card.appendChild(t);

    if (desc) {
      var d = document.createElement('div');
      d.style.cssText = 'font:400 13px var(--egg-font);color:' + (C.textDim || '#aaa') +
        ';line-height:1.5;margin-bottom:16px;';
      d.textContent = desc;
      card.appendChild(d);
    }

    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;margin-top:12px;';
    card.appendChild(row);

    function mk(label, primary, fn) {
      var b = document.createElement('button');
      b.textContent = label;
      // 52px — 이 저장소의 터치 타깃 하한(UI.TAP). 급하게 누르는 화면이다.
      b.style.cssText =
        'flex:1;min-height:52px;border-radius:12px;cursor:pointer;' +
        'font:700 17px var(--egg-font);-webkit-tap-highlight-color:transparent;' +
        (primary
          ? 'color:' + (C.accent || '#fffcf0') + ';background:' + okBg + ';border:3px solid ' + okLine + ';'
          : 'color:' + (C.text || '#fff') + ';background:' + subBg + ';border:2px solid ' + lineC + ';');
      b.addEventListener('click', fn);
      row.appendChild(b);
      return b;
    }
    // 취소를 왼쪽에 둔다 — 오조작으로 오른쪽 엄지에 닿는 쪽이 파괴적이면 안 된다.
    mk('취소', false, function () { closeDialog(); if (onCancel) onCancel(); });
    mk(okLabel, true, function () { closeDialog(); if (onOk) onOk(); });

    wrap.appendChild(card);
    document.body.appendChild(wrap);
    dialog = wrap;
    // 다음 프레임에 상태를 바꿔야 transition 이 걸린다(같은 프레임에 넣으면 즉시 최종값).
    // ⚠ rAF 하나에만 맡기지 않는다 — 탭이 가려졌거나 프레임이 늦으면 rAF 가 안 돌아
    //   **모달이 투명한 채로 남는다**(헤드리스 캡처에서 실제로 그렇게 찍혔다).
    //   뒤로가기 확인창이 안 보이는 건 치명적이라 타이머로 한 번 더 보장한다.
    var shown = false;
    function reveal() {
      if (shown || !dialog) return;
      shown = true;
      wrap.style.opacity = '1';
      card.style.transform = 'translateY(0) scale(1)';
    }
    requestAnimationFrame(reveal);
    setTimeout(reveal, 60);
    return { close: closeDialog };
  }

  registerSW();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireRotatePrompt);
  } else {
    wireRotatePrompt();
    autoFullscreenOnFirstTouch();
  }

  // ── 아이폰 전용: 전체화면으로 가는 길 안내 ──────────────────────────────────
  // 사용자 신고(2026-07-29): "아이폰 웹에서는 전체화면 버튼이 없다."
  // 사실 확인:
  //   · 아이폰 사파리의 Fullscreen API 는 오랫동안 **비디오 요소 전용**이었다.
  //     아이패드는 iPadOS 16.4 에서 일반 요소 전체화면이 열렸지만 아이폰은 아니었고,
  //     iOS 17.4 무렵 기능 플래그 뒤에서 시험됐다. caniuse 는 iOS 26 대까지도
  //     여전히 '부분 지원'으로 표기한다. → 그래서 `canFullscreen()` 이 false 를 내고
  //     버튼이 아예 안 만들어진 것이다. **버그가 아니라 기기 사정이다.**
  //   · 반대로 **홈 화면에 추가는 아이폰에서 잘 된다**(흔한 오해). iOS 16.4 부터는
  //     사파리뿐 아니라 크롬·파이어폭스에서도 된다. manifest 의 display:standalone 과
  //     apple-mobile-web-app-capable 이 이미 들어 있어, 홈 화면에서 열면
  //     주소창·툴바 없이 뜬다 — 아이폰에서 이게 사실상 유일한 진짜 전체화면이다.
  //   · 안드로이드처럼 한 번 눌러 설치시키는 건 불가능하다(beforeinstallprompt 가 없다).
  //     그래서 **안내만** 할 수 있고, 그 안내가 한 번 뜨고 사라지면 안 된다 —
  //     설치 배너는 세션당 1회에 '다시 안 보기'까지 있어서 놓치면 길이 사라졌다.
  //     메뉴에서 언제든 다시 열 수 있게 이 함수를 둔다.
  function showHomeScreenGuide() {
    if (document.getElementById('ios-fs-guide')) return;
    var C = GAME.CONFIG.COLORS, COL = GAME.UI.COL;
    var wrap = document.createElement('div');
    wrap.id = 'ios-fs-guide';
    wrap.style.cssText =
      'position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;' +
      'padding:20px;box-sizing:border-box;background:rgba(10,8,4,.62);' +
      'backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);font-family:var(--egg-font);';
    var card = document.createElement('div');
    card.style.cssText =
      'max-width:420px;width:100%;box-sizing:border-box;border-radius:16px;padding:20px 18px;' +
      'background:' + hx(COL.surface === undefined ? COL.surfaceAlt : COL.surface) + ';' +
      'border:2px solid ' + hx(COL.borderUi) + ';box-shadow:0 10px 30px rgba(0,0,0,.28);';
    card.innerHTML =
      '<div style="font:700 18px var(--egg-font);color:' + C.text + ';margin-bottom:10px">' +
        '아이폰에서 꽉 찬 화면으로 하기</div>' +
      '<div style="font:400 14px/1.6 var(--egg-font);color:' + C.text + '">' +
        '아이폰 사파리에는 전체화면 버튼이 없습니다. 대신 <b>홈 화면에 추가</b>하면 ' +
        '주소창과 아래 툴바가 사라져 꽉 찬 화면으로 열립니다.' +
      '</div>' +
      '<ol style="font:400 14px/1.7 var(--egg-font);color:' + C.text + ';' +
        'margin:12px 0 0;padding-left:20px">' +
        '<li>아래쪽 <b>공유</b> 버튼(⬆︎)을 누릅니다</li>' +
        '<li>목록을 내려 <b>홈 화면에 추가</b>를 누릅니다</li>' +
        '<li>오른쪽 위 <b>추가</b>를 누릅니다</li>' +
        '<li>홈 화면에 생긴 <b>계란들의 전쟁</b> 아이콘으로 엽니다</li>' +
      '</ol>' +
      '<div style="font:400 12px/1.6 var(--egg-font);color:' + C.textDim + ';margin-top:12px">' +
        '가로로 눕히면 전장이 넓어집니다. 아이폰은 웹에서 화면 방향을 고정할 수 없어 ' +
        '회전 잠금이 켜져 있으면 풀어야 합니다.' +
      '</div>';
    var close = document.createElement('button');
    close.textContent = '알겠어요';
    close.style.cssText =
      'margin-top:16px;width:100%;min-height:48px;border-radius:12px;cursor:pointer;' +
      'border:2px solid ' + hx(COL.borderUi) + ';background:' + hx(COL.surfaceHi) + ';' +
      'color:' + C.text + ';font:700 16px var(--egg-font);-webkit-tap-highlight-color:transparent;';
    close.onclick = function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); };
    card.appendChild(close);
    wrap.appendChild(card);
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close.onclick(); });
    document.body.appendChild(wrap);
  }

  function hideHomeScreenGuide() {
    var el = document.getElementById('ios-fs-guide');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  return {
    isStandalone: isStandalone,
    isIOS: isIOS,
    showHomeScreenGuide: showHomeScreenGuide,
    hideHomeScreenGuide: hideHomeScreenGuide,
    maybeShowInstall: maybeShowInstall,
    // 배너는 DOM 이라 씬이 바뀌어도 남는다 → 메뉴를 떠날 때 반드시 걷어낸다.
    // 안 그러면 전투 화면 아래를 가린다.
    hideInstall: removeBanner,
    canFullscreen: canFullscreen,
    isFullscreen: isFullscreen,
    toggleFullscreen: toggleFullscreen,
    confirm: confirmDialog,
    closeConfirm: closeDialog,
    confirmOpen: dialogOpen
  };
})();

// ============================================================================
//  뒤로가기 = 이전 화면  (설치본 standalone 전용)
//
//  안드로이드 설치본(PWA)의 하드웨어 뒤로가기는 그냥 `history.back()` 이다.
//  이 게임은 단일 페이지라 히스토리가 **항목 하나**뿐이고, 그래서 뒤로가기를
//  누르면 곧바로 앱이 꺼진다(사용자 신고). 막으려면 히스토리에 '가드' 항목을
//  하나 심어 두고 `popstate` 를 받아 우리가 처리한 뒤 다시 심으면 된다.
//  항목 수는 **항상 2** 로 유지된다 — 무한히 쌓이지 않는다.
//
//  ⚠ **설치 안 한 브라우저에서는 절대 켜지 않는다.** 일반 웹페이지가 뒤로가기를
//    가로채면 사용자가 사이트를 떠나지 못하는 함정이 된다. `isStandalone()` 로 가른다.
//
//  씬 파일은 한 줄도 고치지 않는다. `js/main.js` 가 이미 전 씬의 `create` 에
//  훅을 걸고 있어(페이드인) 거기서 `onScene()` 만 불러주면 이력이 쌓인다.
// ============================================================================
GAME.Nav = (function () {
  // ── 이력에 남기는 씬 ──
  //  되돌아갈 때 **진입 당시 인자를 그대로** 다시 넘긴다(`scene.sys.settings.data`).
  //  그래서 Draft(formationId·tower)·Rank(kind·scope)·Build(defendTower) 처럼
  //  인자가 필요한 화면도 그대로 복원된다 — 앱이 스스로 했던 호출과 같은 호출이다.
  var KEEP = {
    Menu: 1, Login: 1, Select: 1, Build: 1, Draft: 1,
    Tower: 1, DefendTower: 1, Versus: 1, Rank: 1, Admin: 1
  };
  // ── 이력에 넣지 않는 씬과 그 이유 ──
  //  Loading  인트로다. 뒤로 갈 대상이 아니라 **앞**이다. 되돌아가면 인트로를 다시 본다.
  //  Battle   재진입 = 전투를 처음부터 다시 시작. '뒤로'가 아니다.
  //  Defend   같은 이유(관전형 방어전).
  //  Result   재진입하면 결과 연출·획득 골드 표시가 되살아난다(탑은 create 에서
  //           다음 층으로 즉시 넘기기까지 한다) → 이력에서 뺀다.
  //  이 씬들에서 뒤로가기를 누르면 **스택의 맨 위**(직전 준비 화면)로 간다.
  var FIGHT = { Battle: 1, Defend: 1 };

  var stack = [];        // [{ key, data }] — 맨 뒤가 '지금 있는 화면'
  var curKey = null;
  var armed = false;     // 히스토리에 가드 항목을 심어 두었는가
  var on = false;
  var MAX = 24;

  function log() {
    return stack.map(function (e) { return e.key; }).join('>');
  }

  function arm() {
    if (armed) return;
    try {
      // 주소는 그대로 둔다 — ?admin=1 / ?diag=1 이 날아가면 안 된다.
      history.pushState({ eggwarNav: 1 }, '', location.href);
      armed = true;
    } catch (e) {}
  }

  function push(key, data) {
    if (!KEEP[key]) return;
    // 같은 화면이 이미 이력에 있으면 **거기까지 잘라낸다**(쌓지 않는다).
    // 이게 씬의 자체 뒤로 버튼과 어긋나지 않게 하는 장치다:
    // Menu → Tower → (탑의 '← 메뉴') → Menu 는 [Menu,Tower,Menu] 가 아니라 [Menu] 가 되고,
    // 그 다음 뒤로가기는 Tower 로 되돌아가는 게 아니라 종료 확인으로 간다.
    for (var i = 0; i < stack.length; i++) {
      if (stack[i].key === key) {
        stack.length = i + 1;
        stack[i].data = data;
        return;
      }
    }
    stack.push({ key: key, data: data });
    if (stack.length > MAX) stack.shift();
  }

  // main.js 의 씬 `create` 훅에서 부른다.
  function onScene(sc) {
    var key = sc && sc.sys && sc.sys.settings && sc.sys.settings.key;
    if (!key) return;
    curKey = key;
    push(key, (sc.sys.settings.data && typeof sc.sys.settings.data === 'object')
      ? sc.sys.settings.data : undefined);
  }

  // ⚠ `scene.start` 는 **부른 씬을 멈추고** 대상을 켠다. 대상 씬에서 부르면
  //    지금 떠 있는 씬이 안 꺼져 두 화면이 겹쳐 돈다(실측에서 Menu,Tower 둘 다 활성).
  //    그래서 반드시 **지금 씬**의 ScenePlugin 으로 부른다 — 씬 파일들과 같은 방식이다.
  function goto(entry) {
    if (!entry || !GAME.game || !GAME.game.scene) return false;
    var from = GAME.game.scene.getScene(curKey) ||
               GAME.game.scene.scenes.filter(function (s) { return s.scene.isActive(); })[0];
    if (!from) return false;
    curKey = entry.key;
    from.scene.start(entry.key, entry.data);
    return true;
  }

  // 스택에서 한 칸 뒤로. 성공하면 true.
  function stepBack() {
    if (KEEP[curKey] && stack.length && stack[stack.length - 1].key === curKey) {
      if (stack.length <= 1) return false;      // 뿌리다 — 여기가 종료 지점
      stack.pop();
    }
    return goto(stack[stack.length - 1]);
  }

  // ── 종료 ──
  //  [종료]가 실제로 앱을 닫는가는 플랫폼이 정한다. 두 가지를 순서대로 시도한다:
  //   1) `window.close()` — 스크립트가 연 창에서만 동작하는 게 원칙이라 보통 무시된다.
  //   2) 가로채기를 풀고 뒤로가기를 **그대로 흘려보낸다** → 히스토리 첫 항목보다
  //      앞으로 가려는 시도가 되고, 설치본에서는 OS 가 앱을 닫는다.
  //      이건 추측이 아니라 **지금 사용자가 겪고 있는 바로 그 동작**이다
  //      (히스토리가 비어서 뒤로가기 한 번에 앱이 꺼진다는 신고가 이 작업의 발단이다).
  //  둘 다 안 되면 앱은 그냥 열려 있다 — '닫히는 척'하는 화면은 만들지 않는다.
  function doExit() {
    on = false;
    armed = false;
    // 1) 창 닫기. 크롬은 **히스토리 항목이 하나일 때만** 스크립트 닫기를 허용한다 —
    //    가드를 심었다 뺐어도 back/forward 목록 길이는 2 라 대개 무시된다.
    try { window.close(); } catch (e) {}
    // 2) 가로채기를 푼 상태로 뒤로가기를 그대로 흘려보낸다.
    setTimeout(function () { try { history.back(); } catch (e) {} }, 80);
    // 3) 그래도 앱이 살아 있으면(플랫폼이 스크립트 종료를 안 받아주는 경우)
    //    뒤로가기를 먹통으로 두지 않는다. 단 **가드는 다시 심지 않는다** —
    //    첫 항목에 선 채로 두어야 다음 뒤로가기 한 번에 OS 가 앱을 닫는다.
    //    (지금 사용자가 겪는 "뒤로가기 한 번에 꺼진다"가 바로 그 동작이다.)
    setTimeout(function () { on = true; }, 900);
  }

  function onPop() {
    if (!on) return;
    armed = false;                    // 방금 우리가 심어둔 항목이 소비됐다

    // 1) 팝업이 열려 있으면 그것부터 닫는다(= 취소).
    if (GAME.PWA.confirmOpen()) { GAME.PWA.closeConfirm(); arm(); return; }
    if (GAME.Modal && GAME.Modal.isOpen && GAME.Modal.isOpen()) { GAME.Modal.close(); arm(); return; }

    // 2) 인트로 중에는 아무 일도 하지 않는다(뒤로 갈 화면이 없다).
    if (curKey === 'Loading' || !curKey) { arm(); return; }

    // 3) 전투 중 — 나가면 그 판은 버려진다. 반드시 물어본다.
    //    (지금은 뒤로가기 한 번에 앱이 통째로 꺼지므로 어차피 버려진다. 확인이 개선이다.)
    if (FIGHT[curKey]) {
      arm();
      GAME.PWA.confirm('전투를 포기할까요?', '지금 나가면 이 판의 결과는 기록되지 않습니다.',
        '나가기', function () { if (!stepBack()) goto({ key: 'Menu' }); });
      return;
    }

    // 4) 뿌리(초기 화면 = 메뉴)면 종료 확인.
    if (!stepBack()) {
      // ⚠ iOS 설치본은 스크립트로 앱을 닫을 방법이 없다. 눌러도 아무 일 없는 [종료]
      //   버튼을 보여주지 않는다 — 되는 척하지 않는 게 이 저장소의 규칙이다.
      //   (iOS 는 하드웨어 뒤로가기도 없다. 여기 오는 건 스와이프 제스처뿐이다.)
      if (GAME.PWA.isIOS()) { arm(); return; }
      // ⚠ **여기서는 가드를 다시 심지 않는다.** 심으면 히스토리 첫 항목보다 앞으로
      //   나갈 방법이 사라져 [종료]가 아무 일도 못 한다(실측으로 확인한 함정이다:
      //   가드를 심고 back() 을 한 번 부르면 가드만 먹고 페이지는 그대로였다).
      //   지금 우리는 첫 항목에 서 있다 — 이 상태에서 뒤로가기가 한 번 더 오면
      //   OS 가 앱을 닫는다. [취소]를 누르면 그때 다시 심는다.
      GAME.PWA.confirm('게임을 종료하시겠습니까?', '', '종료', doExit, arm);
      return;
    }
    arm();
  }

  function enable() {
    if (on) return false;
    if (!GAME.PWA.isStandalone()) return false;   // ← 일반 브라우저는 절대 건드리지 않는다
    on = true;
    window.addEventListener('popstate', onPop);
    arm();
    return true;
  }

  return {
    enable: enable,
    onScene: onScene,
    isOn: function () { return on; },
    // 검증용 — 스택과 히스토리 길이를 밖에서 볼 수 있어야 실측이 된다.
    trail: log,
    depth: function () { return stack.length; },
    current: function () { return curKey; }
  };
})();
