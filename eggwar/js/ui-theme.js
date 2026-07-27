window.GAME = window.GAME || {};

// ═══════════════════════════════════════════════════════════════════════════
//  Egg War · UI 테마 (v1)
//  ---------------------------------------------------------------------------
//  이 파일은 **js/ui.js 다음, 씬 파일들보다 먼저** 로드한다.
//    <script src="js/ui.js?v=0.11"></script>
//    <script src="js/ui-theme.js?v=0.11"></script>   ← 여기
//    <script src="js/eggart.js?v=0.11"></script>
//
//  하는 일 3가지
//   1) CONFIG.COLORS 의 **문자열(텍스트) 색만** 대비비 AA(4.5:1) 이상으로 올린다.
//      숫자(0x…) 진영색·체력색은 손대지 않는다 → 캐릭터 아트가 그대로 유지된다.
//   2) 역할 기반 폰트 스케일 GAME.UI.FS 를 제공한다. 세로/가로 값이 이미 반영돼 있어
//      씬에서 `P ? 11 : 14` 같은 3항식을 없앨 수 있다.
//   3) GAME.UI.label / GAME.UI.button 을 **같은 시그니처로** 교체한다.
//      기존 호출은 한 줄도 안 고쳐도 그대로 동작하고, 화질·터치영역·눌림 피드백만 좋아진다.
//
//  전제 해상도: 세로 420×900 (폰 390×844 에서 FIT 배율 0.929), 가로 1340×900.
// ═══════════════════════════════════════════════════════════════════════════

(function () {
  var UI = GAME.UI = GAME.UI || {};
  var CFG = GAME.CONFIG;
  var P = CFG.PORTRAIT;

  // ───────────────────────────────────────────────────────────────────────
  //  0. 화면 배율 — 설계 px 가 실제 화면에서 몇 px 로 찍히는지
  //     (FIT 이므로 min(가로비, 세로비). 디자인 검증·로그용)
  // ───────────────────────────────────────────────────────────────────────
  UI.fitScale = function () {
    var vw = window.innerWidth || CFG.WIDTH, vh = window.innerHeight || CFG.HEIGHT;
    return Math.min(vw / CFG.WIDTH, vh / CFG.HEIGHT);
  };
  UI.onScreenPx = function (designPx) { return designPx * UI.fitScale(); };

  // ───────────────────────────────────────────────────────────────────────
  //  1. 색 토큰
  //     · 배경 3단계 + 상호작용 1단계
  //     · 본문 텍스트는 전부 #101018~#2e2e40 위에서 4.5:1 이상 (계산치 주석 참고)
  //     · 진영 '도형' 색(controller/strategist)은 기존 값 유지 — 아트가 바뀌면 안 된다.
  //       텍스트용은 같은 계열의 밝은 변형(accent/accentAlt)을 따로 둔다.
  // ───────────────────────────────────────────────────────────────────────
  var COL = UI.COL = {
    // ── 배경 레이어 (숫자: Phaser Graphics/Rectangle 용) ──
    bg:         0x101018,   // L0 캔버스 바닥
    surface:    0x1a1a26,   // L1 패널·카드 (bg 대비 1.10 — 은은한 단차)
    surfaceAlt: 0x242433,   // L2 표의 행·입력칸·올라온 카드 (bg 대비 1.24)
    surfaceHi:  0x2e2e40,   // L3 hover / 눌림 (bg 대비 1.43)

    // ── 진영 톤 패널 (버튼 배경) ──
    panelTeal:   0x16302b,  // 컨트롤러(청록) 계열 패널
    panelPurple: 0x241f38,  // 전략가(보라) 계열 패널
    panelAmber:  0x33241a,  // 탑·경고 계열 패널

    // ── 선 ──
    divider:  0x2e2e40,     // 장식용 구분선 (정보를 담지 않는 선)
    border:   0x4a4a68,     // 비대화형 패널 테두리
    // 대화형(버튼) 테두리 — 비텍스트 대비 3:1 충족
    //   #7676a0 : bg 4.39 / surface 3.99 / surfaceAlt 3.54 / surfaceHi 3.08
    borderUi: 0x7676a0,
    focus:    0xffd166,     // 키보드 포커스 링

    // ── 진영 도형색 (기존 값 그대로 — 절대 바꾸지 않는다) ──
    controller: 0x35d0a5,
    strategist: 0x9b8cf0,
    hpGood:     0x4ade80,
    hpBad:      0xef4444
  };

  // 텍스트 색 (문자열) — 괄호 안은 #101018 배경 대비비
  var TXT = UI.TXT = {
    text:      '#e8e8f0',   // 15.53:1  본문 최상위
    textMid:   '#c6c6d8',   // 11.24:1  본문 보조
    textDim:   '#a8a8c2',   //  8.15:1  설명문 (구 #9a9ab0 6.87 → 개선)
    textFaint: '#9a9cb6',   //  7.04:1  최하위 (구 #6f6f88 3.88 FAIL / #55556b 2.61 FAIL 대체)
    accent:    '#4fdcb4',   // 11.02:1  컨트롤러 청록 (구 #35d0a5 9.66 도 통과지만 소자에서 더 또렷)
    accentAlt: '#b3a8ff',   //  8.98:1  전략가 보라 (구 #9b8cf0 은 청록패널 위 4.34 FAIL)
    warn:      '#f0a86a',   //  9.48:1
    crit:      '#ffd166',   // 13.13:1
    danger:    '#ff7b7b',   //  7.55:1  (구 #ef4444 는 패널 위 3.5~4.2 FAIL)
    good:      '#4ade80'    // 10.86:1
  };

  // ── 기존 CONFIG.COLORS 를 덮어써서 씬 수정 없이도 대비가 올라가게 한다 ──
  //    문자열 키만 건드린다. 숫자 키(bg/arenaFill/controller/…)는 그대로 둔다.
  UI.applyColors = function () {
    var C = CFG.COLORS;
    C._orig = C._orig || {
      text: C.text, textDim: C.textDim, accent: C.accent,
      accentAlt: C.accentAlt, warn: C.warn, crit: C.crit
    };
    C.text = TXT.text;
    C.textDim = TXT.textDim;
    C.accent = TXT.accent;
    C.accentAlt = TXT.accentAlt;
    C.warn = TXT.warn;
    C.crit = TXT.crit;
    // 새로 쓸 수 있는 키 (기존 씬의 하드코딩 '#6f6f88' / '#55556b' 를 이걸로 교체)
    C.textMid = TXT.textMid;
    C.textFaint = TXT.textFaint;
    C.danger = TXT.danger;
    C.good = TXT.good;
    // 패널 레이어도 노출 (씬에서 add.rectangle 배경색으로 쓴다)
    C.surface = COL.surface;
    C.surfaceAlt = COL.surfaceAlt;
    C.surfaceHi = COL.surfaceHi;
    C.divider = COL.divider;
    C.border = COL.border;
    C.borderUi = COL.borderUi;
    return C;
  };
  UI.applyColors();

  // ───────────────────────────────────────────────────────────────────────
  //  2. 타이포 스케일 (역할 기반)
  //     [세로 설계px, 가로 설계px]
  //     세로 화면px = 설계px × 0.929  ← 전부 11px 이상이 되도록 잡았다.
  //     한글은 같은 px 에서 라틴보다 x-height 가 작아 보이므로 라틴 기준보다
  //     한 단계씩 크게 잡았다(본문 15 / 캡션 13 — 라틴이면 13/11 로 충분한 자리).
  // ───────────────────────────────────────────────────────────────────────
  // 근거(실제 가이드라인):
  //   · Apple HIG      본문 17pt 이상, 탭 타깃 44×44pt
  //   · Material       본문 14sp 이상, 라벨 11sp, 탭 타깃 48×48dp
  //   · 모바일 게임 통설  "18pt 미만은 폰에서 안 읽히고 오탭을 유발한다"
  // 게임은 손가락으로 급하게 누르는 화면이라 **앱 기준보다 한 단계 위**를 쓴다.
  // 세로 화면px = 설계px × 0.929 이므로 설계값은 목표 화면px ÷ 0.929 로 잡았다.
  var SCALE = {
    display:  [42, 52],   // 세로 39.0px — EGG WAR 로고, 승/패 판정
    title:    [28, 34],   //       26.0px — 씬 제목
    heading:  [22, 24],   //       20.4px — 구역 제목, 강조 수치
    subhead:  [19, 20],   //       17.7px — 카드 제목 (iOS 본문 17pt 선)
    body:     [18, 17],   //       16.7px — 본문 기본값 (게임 권장 16px+)
    caption:  [16, 14],   //       14.9px — 설명·부연
    micro:    [15, 13],   //       13.9px — 표 머리글, 단위. **절대 하한**
    button:   [20, 20],   //       18.6px — 주요 버튼 (게임 권장 18pt+)
    buttonSm: [18, 16],   //       16.7px — 보조 버튼
    numLg:    [30, 32],   //       27.9px — 전투 타이머
    num:      [22, 24],   //       20.4px — 쿨다운, 점수
    numSm:    [18, 17]    //       16.7px — 표 안 숫자
  };

  var FS = UI.FS = {};
  for (var k in SCALE) if (SCALE.hasOwnProperty(k)) FS[k] = SCALE[k][P ? 0 : 1];
  FS.MIN = FS.micro;          // 절대 하한 (세로 12 / 가로 13)
  UI.SCALE = SCALE;

  // 토큰 이름이든 숫자든 받아서 px 로 만든다. 숫자는 하한으로 clamp 한다.
  UI.size = function (v, fallback) {
    if (typeof v === 'string' && FS[v] !== undefined) return FS[v];
    var n = (typeof v === 'number' && v > 0) ? v : (fallback || FS.body);
    return Math.max(FS.MIN, Math.round(n));
  };

  // 줄간격 — 한글 wrap 은 기본 0 이면 붙어 보인다
  UI.lineGap = function (px) { return Math.round(px * 0.38); };

  // ───────────────────────────────────────────────────────────────────────
  //  3. 간격 · 반경 · 터치 타깃
  // ───────────────────────────────────────────────────────────────────────
  var SP = UI.SP = {
    xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32,
    pagePad:  P ? 16 : 32,     // 화면 좌우 여백
    cardPad:  P ? 12 : 16,
    rowGap:   P ? 10 : 12
  };
  UI.R = { sm: 6, md: 10, lg: 14, pill: 999 };   // 코너 반경

  // 모바일 최소 터치 타깃 44 CSS px → 설계 px 로 환산
  //   세로: 44 / 0.929 = 47.4 → 48
  // Material 48dp / Apple 44pt 중 **큰 쪽**을 쓴다. 세로는 화면 48px 이 되도록 ÷0.929.
  UI.TAP = P ? 52 : 44;
  UI.TAP_MIN_W = P ? 48 : 44;
  // 버튼 권장 높이
  UI.BTN_H    = P ? 58 : 48;   // 주요 (화면 54px)
  UI.BTN_H_SM = P ? 52 : 42;   // 보조 (화면 48px)

  // ───────────────────────────────────────────────────────────────────────
  //  4. 텍스트 선명도
  //     FIT 축소(0.929) + 폰 DPR(2~3) 이면 캔버스 텍스처를 1배로 그리는 게
  //     가장 큰 흐림 원인이다. Text.setResolution 으로 텍스처만 2배로 굽는다.
  //     (레이아웃·좌표는 전혀 바뀌지 않는다. 메모리만 4배.)
  //     끄고 싶으면 GAME.UI.TEXT_RES = 1 로 두고 씬을 다시 시작.
  // ───────────────────────────────────────────────────────────────────────
  UI.TEXT_RES = Math.min(2.5, Math.max(1, window.devicePixelRatio || 1));

  function styleOf(px, color, extra) {
    var s = {
      fontFamily: CFG.FONT,
      fontSize: px + 'px',
      color: color || TXT.text
    };
    if (extra) for (var e in extra) if (extra.hasOwnProperty(e)) s[e] = extra[e];
    return s;
  }

  function finish(t, px, opts) {
    opts = opts || {};
    if (UI.TEXT_RES > 1 && t.setResolution) t.setResolution(UI.TEXT_RES);
    if (t.setLineSpacing) t.setLineSpacing(opts.lineSpacing === undefined
      ? UI.lineGap(px) : opts.lineSpacing);
    // 전장 위에 얹히는 글자는 외곽선을 줘야 배경 색과 상관없이 읽힌다
    if (opts.outline) {
      t.setStroke('#0b0b12', px >= FS.heading ? 4 : 3);
      t.setShadow(0, 1, 'rgba(0,0,0,0.75)', 2, false, true);
    }
    if (opts.wrap) t.setWordWrapWidth(opts.wrap);
    if (opts.align) t.setAlign(opts.align);
    return t;
  }

  // ───────────────────────────────────────────────────────────────────────
  //  5. label — 기존 시그니처 그대로
  //     GAME.UI.label(scene, x, y, text, size, color, origin)
  //     · size 에 숫자 대신 'body' / 'caption' 같은 토큰 문자열도 넣을 수 있다.
  //     · 숫자를 넣으면 하한(세로 12 / 가로 13)으로 자동 clamp 된다
  //       → 씬을 한 줄도 안 고쳐도 "너무 작은 글자"가 사라진다.
  // ───────────────────────────────────────────────────────────────────────
  UI.label = function (scene, x, y, text, size, color, origin) {
    var px = UI.size(size, FS.body);
    var t = scene.add.text(x, y, text, styleOf(px, color));
    t.setOrigin(origin === undefined ? 0 : origin);
    return finish(t, px, {});
  };

  // 새 API — 옵션이 필요할 때. label 을 대체하지 않고 나란히 쓴다.
  //   UI.text(scene, x, y, '...', { size:'caption', color:C.textDim, origin:0.5,
  //                                 wrap: W-32, align:'center', outline:true })
  UI.text = function (scene, x, y, text, opts) {
    opts = opts || {};
    var px = UI.size(opts.size, FS.body);
    var t = scene.add.text(x, y, text, styleOf(px, opts.color, opts.style));
    if (opts.origin !== undefined) {
      if (opts.originY !== undefined) t.setOrigin(opts.origin, opts.originY);
      else t.setOrigin(opts.origin);
    } else t.setOrigin(0);
    return finish(t, px, opts);
  };

  // ───────────────────────────────────────────────────────────────────────
  //  6. button — 기존 시그니처 그대로
  //     GAME.UI.button(scene, x, y, w, h, label, onClick, opts)
  //     반환값 { rect, text } 유지. rect 는 진짜 Phaser Rectangle 이라
  //     rank.js 의 `b.rect.setStrokeStyle(2, 0x35d0a5)` 같은 후처리가 그대로 먹는다.
  //
  //     개선점
  //      · 라운드 코너 + 눌림 피드백(더 밝은 면 + 1px 내려앉음)
  //      · **히트 영역을 최소 44 CSS px 로 넓힌다 — 시각 크기는 그대로.**
  //        레이아웃을 안 건드리고 터치 성공률만 올리는 방법이다.
  //      · disabled 상태
  //      · 기본 라벨 크기를 FS.button(세로 17 / 가로 20)으로
  // ───────────────────────────────────────────────────────────────────────
  function shade(hex, amt) {
    var r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
    r = Math.max(0, Math.min(255, Math.round(r + 255 * amt)));
    g = Math.max(0, Math.min(255, Math.round(g + 255 * amt)));
    b = Math.max(0, Math.min(255, Math.round(b + 255 * amt)));
    return (r << 16) | (g << 8) | b;
  }

  UI.button = function (scene, x, y, w, h, label, onClick, opts) {
    opts = opts || {};

    var fill  = opts.fill  !== undefined ? opts.fill  : COL.surfaceAlt;
    var line  = opts.line  !== undefined ? opts.line  : COL.borderUi;
    var hover = opts.hover !== undefined ? opts.hover : shade(fill, 0.06);
    var press = opts.press !== undefined ? opts.press : shade(fill, 0.12);
    var color = opts.color || TXT.text;
    var radius = opts.radius === undefined ? UI.R.md : opts.radius;
    var px = UI.size(opts.fontSize, FS.button);

    // ── 시각: 라운드 사각형은 Graphics 로 그린다 ──
    var gfx = scene.add.graphics();

    // ── 입력 + 호환: 진짜 Rectangle 을 투명하게 얹는다 ──
    //    (setFillStyle / setStrokeStyle 호출을 가로채 gfx 를 다시 그린다)
    var rect = scene.add.rectangle(x, y, w, h, fill, 0);

    var st = { fill: fill, line: line, lw: 1, over: false, down: false, disabled: !!opts.disabled };

    function redraw() {
      var f = st.fill;
      if (st.disabled) f = shade(COL.surface, -0.01);
      else if (st.down) f = press;
      else if (st.over) f = hover;

      var dy = st.down && !st.disabled ? 1 : 0;
      var lw = Math.max(1, st.lw);
      gfx.clear();

      // 바닥 그림자 — 눌리면 사라져서 '내려앉은' 느낌이 난다
      if (!st.down && !st.disabled && opts.flat !== true) {
        gfx.fillStyle(0x000000, 0.35);
        gfx.fillRoundedRect(x - w / 2, y - h / 2 + 3, w, h, radius);
      }
      gfx.fillStyle(f, st.disabled ? 0.55 : 1);
      gfx.fillRoundedRect(x - w / 2, y - h / 2 + dy, w, h, radius);
      // 위쪽 하이라이트 — 평평한 사각형에 입체감을 준다(이미지 애셋 없이)
      if (!st.disabled) {
        gfx.fillStyle(0xffffff, st.down ? 0.03 : 0.06);
        gfx.fillRoundedRect(x - w / 2 + 1, y - h / 2 + dy + 1, w - 2, Math.max(6, h * 0.42),
          { tl: radius, tr: radius, bl: 0, br: 0 });
      }
      gfx.lineStyle(lw, st.line, st.disabled ? 0.35 : 1);
      gfx.strokeRoundedRect(x - w / 2 + lw / 2, y - h / 2 + dy + lw / 2, w - lw, h - lw, radius);

      if (txt) txt.setY(y + dy).setAlpha(st.disabled ? 0.45 : 1);
    }

    var txt = scene.add.text(x, y, label, styleOf(px, color, { align: 'center' })).setOrigin(0.5);
    finish(txt, px, { lineSpacing: 0 });
    if (opts.wrap) txt.setWordWrapWidth(opts.wrap);

    // Rectangle 의 색 API 를 가로채 gfx 로 넘긴다 → 기존 호출부가 그대로 작동한다
    rect.setFillStyle = function (c) { if (c !== undefined) { st.fill = c; } redraw(); return rect; };
    rect.setStrokeStyle = function (lw, c) {
      if (lw !== undefined) st.lw = lw;
      if (c !== undefined) st.line = c;
      redraw(); return rect;
    };

    // ── 터치 타깃: 시각 크기는 그대로 두고 히트 영역만 44px 이상으로 ──
    var pad = opts.hitPad === undefined ? 0 : opts.hitPad;
    var hw = Math.max(w + pad * 2, UI.TAP_MIN_W);
    var hh = Math.max(h + pad * 2, UI.TAP);
    if (opts.noExpand) { hw = w; hh = h; }
    // 세 번째 인자는 dropZone(boolean) 이다 — 여기에 {useHandCursor:true} 를 넣으면
    // 버튼이 통째로 드롭존이 된다. 커서는 input.cursor 로 따로 지정한다.
    rect.setInteractive(
      new Phaser.Geom.Rectangle((w - hw) / 2, (h - hh) / 2, hw, hh),
      Phaser.Geom.Rectangle.Contains
    );
    if (rect.input) rect.input.cursor = 'pointer';

    rect.on('pointerover', function () { st.over = true; redraw(); });
    rect.on('pointerout',  function () { st.over = false; st.down = false; redraw(); });
    rect.on('pointerdown', function () {
      if (st.disabled) return;
      st.down = true; redraw();
      if (opts.fireOnUp) return;
      onClick();
    });
    rect.on('pointerup', function () {
      var was = st.down;
      st.down = false; redraw();
      if (opts.fireOnUp && was && !st.disabled) onClick();
    });

    rect.once('destroy', function () { if (gfx && gfx.scene) gfx.destroy(); });

    // 겹침 감사용 표시 — 버튼과 그 버튼의 라벨은 겹쳐도 정상이다
    rect.__uiBtn = true;
    txt.__btnLabel = rect;
    gfx.__uiBtnGfx = true;         // 감사 도구가 Graphics 를 텍스트로 오인하지 않게

    redraw();

    var api = {
      rect: rect, text: txt, gfx: gfx,
      setDisabled: function (v) { st.disabled = !!v; redraw(); return api; },
      setLabel: function (s) { txt.setText(s); return api; },
      setDepth: function (d) { gfx.setDepth(d); rect.setDepth(d + 1); txt.setDepth(d + 2); return api; },
      destroy: function () { txt.destroy(); rect.destroy(); }
    };
    return api;
  };

  // ───────────────────────────────────────────────────────────────────────
  //  7. 패널 · 구분선 · 칩 — 위계를 코드로 강제한다
  // ───────────────────────────────────────────────────────────────────────
  //  level 1 = surface(패널)  2 = surfaceAlt(행/카드)  3 = surfaceHi(선택됨)
  UI.panel = function (scene, x, y, w, h, opts) {
    opts = opts || {};
    var lvl = opts.level || 1;
    var fill = opts.fill !== undefined ? opts.fill
      : (lvl >= 3 ? COL.surfaceHi : lvl === 2 ? COL.surfaceAlt : COL.surface);
    var line = opts.line !== undefined ? opts.line : COL.border;
    var radius = opts.radius === undefined ? UI.R.lg : opts.radius;
    var g = scene.add.graphics();
    if (opts.shadow !== false) {
      g.fillStyle(0x000000, 0.28);
      g.fillRoundedRect(x, y + 3, w, h, radius);
    }
    g.fillStyle(fill, opts.alpha === undefined ? 1 : opts.alpha);
    g.fillRoundedRect(x, y, w, h, radius);
    if (line !== null) {
      g.lineStyle(opts.lineWidth || 1, line, 1);
      g.strokeRoundedRect(x + 0.5, y + 0.5, w - 1, h - 1, radius);
    }
    // 왼쪽 진영 띠 — 카드가 어느 편인지 색 하나로 읽히게
    if (opts.accent) {
      g.fillStyle(opts.accent, 1);
      g.fillRoundedRect(x, y, 4, h, { tl: radius, bl: radius, tr: 0, br: 0 });
    }
    return g;
  };

  UI.divider = function (scene, x, y, w, opts) {
    opts = opts || {};
    var g = scene.add.graphics();
    g.fillStyle(opts.color === undefined ? COL.divider : opts.color, opts.alpha === undefined ? 1 : opts.alpha);
    g.fillRect(x, y, w, opts.thickness || 1);
    return g;
  };

  // 작은 태그(진영/상태) — 텍스트만 있는 것보다 훨씬 빨리 읽힌다
  UI.chip = function (scene, x, y, text, opts) {
    opts = opts || {};
    var px = UI.size(opts.size, FS.micro);
    var t = scene.add.text(0, 0, text, styleOf(px, opts.color || TXT.text)).setOrigin(0.5);
    finish(t, px, { lineSpacing: 0 });
    var padX = 8, padY = 4;
    var w = Math.max(opts.minWidth || 0, Math.ceil(t.width) + padX * 2);
    var h = Math.ceil(t.height) + padY * 2;
    var g = scene.add.graphics();
    g.fillStyle(opts.fill === undefined ? COL.surfaceAlt : opts.fill, 1);
    g.fillRoundedRect(x, y, w, h, h / 2);
    if (opts.line !== undefined && opts.line !== null) {
      g.lineStyle(1, opts.line, 1);
      g.strokeRoundedRect(x + 0.5, y + 0.5, w - 1, h - 1, h / 2);
    }
    t.setPosition(x + w / 2, y + h / 2);
    return { gfx: g, text: t, w: w, h: h };
  };

  // ───────────────────────────────────────────────────────────────────────
  //  8. statBars 개선 — 라운드 + 트랙/필 대비 + 값 표시 위치 반환
  //     (원본 시그니처 유지: g, defs, obj, x, y, barW, rowGap, color)
  // ───────────────────────────────────────────────────────────────────────
  UI.statBars = function (g, defs, obj, x, y, barW, rowGap, color) {
    var h = 14, r = h / 2;
    for (var i = 0; i < defs.length; i++) {
      var sd = defs[i];
      var frac = Math.max(0, Math.min(1, sd.get(obj) / sd.max));
      var ry = y + i * rowGap - h / 2;
      g.fillStyle(COL.surfaceHi, 1);
      g.fillRoundedRect(x, ry, barW, h, r);
      if (frac > 0) {
        var fw = Math.max(h, barW * frac);
        g.fillStyle(color, 1);
        g.fillRoundedRect(x, ry, fw, h, r);
        g.fillStyle(0xffffff, 0.14);
        g.fillRoundedRect(x + 1, ry + 1, fw - 2, h * 0.42, { tl: r, tr: r, bl: 0, br: 0 });
      }
      g.lineStyle(1, COL.border, 1);
      g.strokeRoundedRect(x + 0.5, ry + 0.5, barW - 1, h - 1, r);
    }
  };

  // ───────────────────────────────────────────────────────────────────────
  //  9. 개발용 자가검사 — 콘솔에서 GAME.UI.audit()
  //     현재 화면 배율에서 11px 미만으로 찍히는 텍스트를 찾아낸다.
  // ───────────────────────────────────────────────────────────────────────
  UI.audit = function (scene) {
    var s = UI.fitScale(), bad = [];
    (scene || (GAME.game && GAME.game.scene.getScenes(true)[0])).children.list.forEach(function (o) {
      if (!o.style || !o.text) return;
      var px = parseFloat(o.style.fontSize) * s;
      if (px < 11) bad.push({ text: String(o.text).slice(0, 24), design: o.style.fontSize, screen: px.toFixed(1) });
    });
    if (bad.length) console.table(bad); else console.log('OK — 11px 미만 텍스트 없음 (배율 ' + s.toFixed(3) + ')');
    return bad;
  };
})();
