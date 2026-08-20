window.GAME = window.GAME || {};

// ============================================================================
//  세로 화면에서 게임을 90° 돌려 **그냥 가로로 보여준다** (2026-08-20)
//
//  태현님: "그냥 게임을 키자마자 가로로 보여주면 되는거 아니냐" — 맞다.
//  screen.orientation.lock() 은 기기·브라우저마다 거부된다(삼성 인터넷 실기기:
//  "not available on this device"). 잠금에 기대는 길은 여기서 끝이고,
//  잠금 없이 되는 유일한 길이 이것이다: 뷰포트가 세로면 게임 컨테이너를
//  CSS 로 90° 회전시켜 가로 레이아웃을 그대로 채운다.
//
//   · 물리적으로 기기를 돌리면(자동회전 켜짐) 뷰포트가 가로가 되고 회전을 푼다.
//   · 설치본(PWA)은 매니페스트 landscape 로 이미 가로 뷰포트라 여기 안 온다.
//   · 데스크톱은 대상 아님(터치 기기만).
//
//  ⚠ 입력: Phaser 는 회전된 캔버스를 모른다 — getBoundingClientRect 기반 좌표가
//    통째로 어긋난다. InputManager.transformPointer 를 회전 모드에서만 갈아끼워
//    (화면세로→게임가로) 축을 맞춘다. 원본 경로는 비회전 시 그대로 탄다.
//  프로필은 건드릴 것 없다 — 폰은 방향과 무관하게 이미 가로 설계(820×390)를 쓴다
//    (세로에서는 CSS 가 게임을 숨기고 안내를 띄웠을 뿐). 여기서는 그 CSS 를 뒤집는다.
// ============================================================================
(function () {
  'use strict';

  function isTouch() {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
  }
  function portrait() {
    var w = window.innerWidth, h = window.innerHeight;
    return h > w;
  }

  //  지금 회전 모드여야 하는가 — 터치 기기 + 세로 뷰포트.
  GAME.rot90Wanted = function () { return isTouch() && portrait(); };

  //  config.js 가 읽는다: 이 값이 true 면 세로 뷰포트라도 **가로 프로필**을 고른다.
  GAME.ROT90 = GAME.rot90Wanted();

  var on = false;

  function apply() {
    var el = document.getElementById('game');
    if (!el) return;
    var want = GAME.rot90Wanted();
    if (want === on) return;
    on = want;
    GAME.ROT90 = want;
    if (want) {
      //  가로 캔버스를 세로 화면에 90° 로 눕힌다. 크기는 main.js 의 pinGame 이
      //  rot90 클래스를 보고 가로세로를 바꿔 잡는다(두 곳이 쓰면 서로 덮어쓴다).
      el.style.transformOrigin = '0 0';
      el.style.transform = 'rotate(90deg) translateY(-100%)';
      document.documentElement.classList.add('rot90');
    } else {
      el.style.transform = '';
      document.documentElement.classList.remove('rot90');
    }
    if (window.__eggRefit) { try { window.__eggRefit(); } catch (e) {} }
    else if (GAME.game && GAME.game.scale && GAME.game.scale.refresh) {
      try { GAME.game.scale.refresh(); } catch (e) {}
    }
  }

  //  Phaser 입력 좌표 변환 — 회전 모드에서만 축을 바꾼다.
  //  (90° 시계 회전: 화면의 아래 방향 = 게임의 +x, 화면의 왼쪽 방향 = 게임의 +y)
  function patchInput() {
    if (!window.Phaser || !Phaser.Input || !Phaser.Input.InputManager) return;
    var P = Phaser.Input.InputManager.prototype;
    if (P.__rot90Patched) return;
    P.__rot90Patched = true;

    //  ⚠ Phaser 는 부모 크기를 getBoundingClientRect(=회전된 시각 박스)로 잰다.
    //    회전 모드에서는 그 값이 세로(390×844)라 가로 캔버스를 레터박싱해 버린다
    //    (실측: canvas 390×185 + margin 102/227). 레이아웃 박스(844×390) 기준으로
    //    되돌린다 — 회전 모드에서만, 시각 박스가 세로일 때만 바꾼다.
    var SM = Phaser.Scale.ScaleManager.prototype;
    var gp0 = SM.getParentBounds;
    SM.getParentBounds = function () {
      var changed = gp0.call(this);
      if (on && this.parentSize && this.parentSize.width < this.parentSize.height) {
        var pw = this.parentSize.width, ph = this.parentSize.height;
        this.parentSize.setSize(ph, pw);
        changed = true;
      }
      return changed;
    };
    //  가운데 정렬도 같은 이유로 시각 박스를 쓴다 → 회전 모드에서는 **레이아웃 박스**
    //  (offsetWidth/Height — 조상 transform 의 영향을 안 받는다)로 여백을 직접 잰다.
    var uc0 = SM.updateCenter;
    SM.updateCenter = function () {
      if (!on) return uc0.call(this);
      var c = this.canvas, p = this.parent;
      if (!c || !p || !p.offsetWidth) return;
      c.style.marginLeft = ((p.offsetWidth - c.offsetWidth) / 2) + 'px';
      c.style.marginTop = ((p.offsetHeight - c.offsetHeight) / 2) + 'px';
    };
    var orig = P.transformPointer;
    //  원본(3.80.1)과 같은 구조로 좌표만 바꾼다: prev ← 현재, 위치 ← 변환값(+스무딩).
    P.transformPointer = function (t, pageX, pageY, wasMove) {
      if (!on) return orig.call(this, t, pageX, pageY, wasMove);
      var n = t.position, r = t.prevPosition;
      r.x = n.x; r.y = n.y;
      var b = this.canvas.getBoundingClientRect();
      var gw = this.scaleManager.gameSize.width, gh = this.scaleManager.gameSize.height;
      var px = pageX - (window.pageXOffset || 0), py = pageY - (window.pageYOffset || 0);
      var ox = (py - b.top) / b.height * gw;            // 화면 아래 = 게임 +x
      var oy = (b.left + b.width - px) / b.width * gh;  // 화면 왼쪽 = 게임 +y
      var h = t.smoothFactor;
      if (wasMove && h !== 0) { n.x = ox * h + r.x * (1 - h); n.y = oy * h + r.y * (1 - h); }
      else { n.x = ox; n.y = oy; }
    };
  }

  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', function () { apply(); setTimeout(apply, 300); });
  window.addEventListener('load', function () { patchInput(); apply(); });
  //  즉시 한 번 — 첫 페인트 전에 컨테이너를 눕혀 세로 화면이 번쩍이지 않게.
  if (document.readyState !== 'loading') { patchInput(); apply(); }
  else document.addEventListener('DOMContentLoaded', function () { patchInput(); apply(); });
})();
