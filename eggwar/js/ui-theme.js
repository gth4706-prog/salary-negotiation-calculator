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

  // 코너 반경을 변의 절반 안으로 가둔다(위 경고 참조). 객체형 반경도 각 항목을 자른다.
  function _safeR(r, w, h) {
    var cap = Math.max(0, Math.min(w, h) / 2 - 1);
    if (typeof r === 'number') return Math.min(r, cap);
    if (r && typeof r === 'object') {
      var out = {}, k;
      for (k in r) out[k] = (typeof r[k] === 'number') ? Math.min(r[k], cap) : r[k];
      return out;
    }
    return r;
  }
  // 'P' 는 원래 세로 플래그였지만, 이 파일이 쓰는 용도는 **글자·간격을 작은 화면에
  // 맞출 것인가**다. 폰 가로(820×390)도 작은 화면이므로 SMALL 을 본다.
  var P = CFG.SMALL !== undefined ? CFG.SMALL : CFG.PORTRAIT;

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
    // hover/눌림용 밝은 짝 — 씬이 이 값을 직접 박아 쓰고 있었다(테마를 켜면 남색이 남는다)
    panelTealHi:   0x235045,
    panelPurpleHi: 0x372f52,
    panelAmberHi:  0x4a3524,

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
    hpBad:      0xef4444,

    // 게이지 트랙 · 그림자 — 어두운 테마 기준값.
    // 라이트 테마는 순검정을 쓰면 크림 패널에 구멍이 뚫린 것처럼 보인다 → 테마가 덮어쓴다.
    meterTrack: 0x0b0b12,
    shadow:     0x000000
  };

  // ───────────────────────────────────────────────────────────────────────
  //  1-b. 라이트 테마 여부
  //     버튼 눌림 방향(밝히기 vs 어둡게)·그림자 세기·아트 잉크선이 전부 이 하나로 갈린다.
  //     theme-switch.js 가 테마를 적용할 때 갱신한다. 기본(stock)은 어두운 테마다.
  // ───────────────────────────────────────────────────────────────────────
  UI.IS_LIGHT = false;

  // ───────────────────────────────────────────────────────────────────────
  //  1-c. 전투 이펙트 팔레트 (FX)
  //     battle.js 가 하드코딩해 두었던 색을 전부 여기로 끌어냈다.
  //     **기본값은 지금까지 쓰던 값 그대로**라 어두운 테마 3종은 한 픽셀도 안 바뀐다.
  //     라이트 테마(A)만 theme-a.js 에서 이 표를 통째로 갈아끼운다.
  //
  //     라이트 테마에서 이펙트가 안 보이는 이유는 단순하다:
  //     목초지 화면색이 #a6b77f~#c1d493 (상대휘도 0.47~0.61) 인데
  //     기존 이펙트색은 전부 **그보다 밝다**. 밝은 것 위에 밝은 것을 얹었으니 사라진다.
  //     그래서 A안에서는 이펙트를 '빛'이 아니라 '잉크'로 다시 잡고,
  //     에너지감은 ink 윤곽 + 밝은 core 의 2단 구조로 되살린다.
  // ───────────────────────────────────────────────────────────────────────
  var FX = UI.FX = {
    ink:        0x0b0b12,   // 모든 이펙트의 어두운 윤곽 (라이트에서 실루엣을 책임진다)
    inkAlpha:   0.0,        // 어두운 테마에서는 윤곽을 그리지 않는다(0)

    // ── 영웅별 스킬 색 (2026-08-01 사용자 지시: "각 영웅에 맞는 컨셉") ──────────
    //  지금까지 세 영웅의 스킬이 **전부 같은 색**이었다(진영색 하나). 찍어서 나란히
    //  놓고 보니 광전사·사냥꾼·파수꾼의 스킬이 구분이 안 됐다 — 무기 실루엣은
    //  다른데 스킬은 똑같으니 캐릭터의 정체성이 절반만 서 있었던 것이다.
    //  원시 부족 세계관에 맞춰 **자연의 색**으로 나눈다:
    //    광전사 = 불(주황) · 사냥꾼 = 바람(청록) · 파수꾼 = 대지(금빛)
    heroFx: {
      vanguard: 0xff7a3c,     // 불 — 돌격형
      ranger:   0x3ce0c0,     // 바람 — 원거리
      warden:   0xffc94a,     // 대지 — 지속형
      // 2026-09-03 · 주술사 마법구체(평타)·스킬 색. 새 색을 만들지 않고 이미 쓰는
      // 전략가 보라 톤(TXT.accentAlt #b3a8ff)과 같은 계열을 골랐다 — 신비로운 보라.
      shaman:   0xb3a8ff
    },

    telegraph:  0xef4444,   // 예고 원
    blast:      0xffd166,   // 착탄 섬광
    beam:       0xf0a86a,   // 예광
    spark:      0xffffff,   // 타격 불꽃
    sparkCore:  0xffffff,
    heal:       0x7ef0a0,   // 회복 파동
    block:      0x8fa0bb,   // 투사체 차단
    lob:        0x9fd0ff,   // 포물선 구체
    lobCore:    0xffffff,
    trap:       0x7ef0d0,   // 설치 덫 범위
    root:       0x7ef0d0,   // 속박

    projController: 0x7ef0d0,
    projStrategist: 0xffb06a,
    projCore:       0xffffff,

    yolk:       0xffc233,   // 노른자 얼룩
    yolkAlpha:  0.22,

    markerMove: 0x7ed957,
    markerAtk:  0xef4444,

    healRing:   0x7ef0a0,   // 약초꾼 치유 반경
    buffRing:   0xffd166,   // 족장 강화 반경
    mineRing:   0xef4444,   // 가시덫 발동 반경
    guardRing:  0x8fa0bb,   // 방패병 차단 반경
    targetRing: 0xf0a86a,   // 조준 가능 표시
    bossRing:   0xef4444,
    bossRing2:  0xffd166,

    // 지면 위 얇은 링의 알파는 라이트 테마에서 그대로 두면 전부 증발한다.
    // 씬은 `FX.ringAlpha * 기존값` 으로 곱해 쓴다.
    ringAlpha:  1.0,
    fillAlpha:  1.0
  };
  UI.FX_BASE = (function () { var o = {}; for (var k in FX) o[k] = FX[k]; return o; })();

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
    //  '제목급'의 하한 (2026-09-02 W4). 이 크기부터 **간판체(FONT_DISPLAY)** 와 잉크
    //  외곽선이 자동으로 붙는다. 예전엔 finish() 가 `FS.head || 26` 으로 이 토큰을
    //  참조만 하고 정의가 없어서 size:'head' 를 준 씬(rtlobby·rtprep)이 본문 크기로
    //  떨어지고 있었다 — 정의를 채운다. 26 = 예전 하드코딩 하한 그대로(가로도 26 —
    //  올리면 PC 의 26px 글자(draft 골드 등)가 갖고 있던 외곽선을 잃는다).
    head:     [26, 26],   //       24.2px — 소제목·타이머 (제목급 하한)
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

  // ── 큰 수 축약 (2026-08-01 사용자 승인) ────────────────────────────────────
  //  아이템·골드가 지수로 커지면서(v0.88) 전장의 피해 숫자가 "2559!" 처럼 네 자리가
  //  됐고, 여러 개가 한꺼번에 뜨면 서로 겹쳐 전장을 가렸다(겹침 감사 21건).
  //  회피 게임에서 글자가 전장을 가리는 것은 그 자체로 결함이다.
  //
  //  규칙: 1,000 미만은 그대로 · 그 위는 k / M. 소수 한 자리까지만 쓰고 `.0` 은 뗀다.
  //    999 → "999" · 2,559 → "2.6k" · 42,000 → "42k" · 1,350,000 → "1.4M"
  //  ⚠ **반올림한 값을 보여주는 것**이므로 정확한 수치가 필요한 자리
  //    (가격 표시·예산 계산)에는 쓰지 않는다. 그쪽은 원래 숫자를 그대로 둔다.
  UI.numAbbr = function (v) {
    var n = Math.round(Number(v) || 0);
    var s = n < 0 ? -1 : 1;
    var a = Math.abs(n);
    if (a < 1000) return String(n);
    function trim(x) {
      var r = Math.round(x * 10) / 10;
      return (r % 1 === 0) ? String(r) : r.toFixed(1);
    }
    if (a < 1000000) return (s < 0 ? '-' : '') + trim(a / 1000) + 'k';
    return (s < 0 ? '-' : '') + trim(a / 1000000) + 'M';
  };

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

  // ── 글자 테두리 색 고르기 ───────────────────────────────────────────────
  //  전장·게이지 위 글자는 테두리가 있어야 읽힌다. 그런데 테두리를 테마 하나로 고정하면
  //  **밝은 글자에 밝은 테두리**가 붙어 통째로 뭉개진다 — 실제로 보스 체력바의
  //  '보스 처치'(#ffe0e0)에 A안의 크림 테두리(#FFFCF0)가 붙어 글자가 사라졌다.
  //  그래서 테두리는 테마가 아니라 **글자 자신의 밝기**에서 정한다.
  var DARK_OUTLINE = '#14100A';
  function lum(css) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(css || '').trim());
    if (!m) return 1;
    var n = parseInt(m[1], 16);
    var c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) {
      v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  UI.lum = lum;
  UI.outlineFor = function (css) {
    var themed = UI.TXT.textOutline;           // 라이트 테마의 크림 테두리
    if (!themed) return DARK_OUTLINE;
    // 글자가 밝으면 테마 테두리(밝은 크림)와 붙어버린다 → 어두운 테두리로 뒤집는다
    return lum(css) > 0.42 ? DARK_OUTLINE : themed;
  };

  // ── 간판체 확대 (2026-09-02 W4) ─────────────────────────────────────────────
  //  로고·궁극기 배너에만 쓰던 Black Han Sans(CONFIG.FONT_DISPLAY)를 **제목급
  //  (px ≥ FS.head)** 전부에 얹는다. 본문·캡션·버튼 라벨은 Jua 그대로 — 무거운
  //  디스플레이 폰트는 작은 글자에서 가독성이 무너진다(config.js 주석의 그 이유).
  //  폴백 스택은 `간판체, 본문체` 순: 간판체 서브셋에 없는 글자는 그 글자만 Jua 로
  //  그려진다. 그래서 서브셋을 소스 문자열의 한글 835자 전부로 다시 구웠다
  //  (fonts/blackhansans-subset.woff2, 14KB→36KB). 자간·크기는 안 건드린다 —
  //  실측: 간판체 글자 높이 0.978em vs Jua 0.999em(더 작다), 폭은 약 7% 넓다.
  UI.displayFamily = function () {
    return CFG.FONT_DISPLAY ? (CFG.FONT_DISPLAY + ', ' + CFG.FONT) : CFG.FONT;
  };
  UI.isHeadPx = function (px) { return px >= FS.head; };

  function styleOf(px, color, extra) {
    var s = {
      fontFamily: UI.isHeadPx(px) ? UI.displayFamily() : CFG.FONT,
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
    // 전장 위에 얹히는 글자는 외곽선을 줘야 배경 색과 상관없이 읽힌다.
    // 외곽선 색은 글자 밝기에서 정한다(밝은 글자 + 밝은 테두리 = 뭉개짐).
    //  2026-08-31 비주얼 개편: **제목급(head 이상)은 자동으로** 잉크 외곽선+그림자 —
    //  민무늬 큰 글자가 "웹페이지" 느낌의 큰 몫이었다. opts.outline === false 로 끌 수 있다.
    var wantOutline = opts.outline === false ? false
      : (opts.outline || UI.isHeadPx(px));
    if (wantOutline) {
      var oc = UI.outlineFor(t.style && t.style.color);
      t.setStroke(oc, px >= FS.heading ? 4 : 3);
      t.setShadow(0, 1, UI.IS_LIGHT ? 'rgba(60,44,20,0.45)' : 'rgba(0,0,0,0.75)', 2, false, true);
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
  UI.shade = shade;

  // ── 눌림 방향은 **테마 밝기에 따라 뒤집힌다** ────────────────────────────
  //  어두운 테마: 눌리면 밝아진다(빛이 든다).
  //  라이트 테마: 눌리면 **어두워진다**. 크림색 버튼을 더 밝히면 흰 종이에 가까워져
  //               "눌렸다"가 아니라 "비활성"으로 읽힌다 — A안 스스로 지적한 문제다.
  //  밝기 차이만으로는 약해서 눌림에는 세 가지 신호를 함께 준다:
  //    ① 면이 어두워진다  ② 그림자가 사라지고 2px 내려앉는다  ③ 위쪽 안쪽 그늘이 생긴다
  //  ※ 어둡게 하는 폭은 **대비비가 정한다.** 라이트 테마의 파스텔 패널은 이미
  //    글자 대비가 5.5~6.4:1 밖에 없어서, 면을 12% 어둡게 하면 경고 버튼이 4.17:1 로
  //    AA(4.5) 아래로 내려간다(계산 확인). 6개 버튼 조합을 전부 재보니 **-0.08 이 한계**다.
  //    밝기로 못 채우는 만큼은 아래 redraw() 의 기하 신호(2px 침강·그림자·안쪽 그늘·테두리)로 낸다.
  function hoverOf(fill) { return shade(fill, UI.IS_LIGHT ? -0.035 : 0.06); }
  function pressOf(fill) { return shade(fill, UI.IS_LIGHT ? -0.080 : 0.12); }
  UI.hoverShade = hoverOf;
  UI.pressShade = pressOf;

  UI.button = function (scene, x, y, w, h, label, onClick, opts) {
    opts = opts || {};

    var fill  = opts.fill  !== undefined ? opts.fill  : COL.surfaceAlt;
    var line  = opts.line  !== undefined ? opts.line  : COL.borderUi;
    var hover = opts.hover !== undefined ? opts.hover : hoverOf(fill);
    var press = opts.press !== undefined ? opts.press : pressOf(fill);
    var color = opts.color || TXT.text;
    var radius = opts.radius === undefined ? UI.R.md : opts.radius;
    // ⚠ Phaser 의 fillRoundedRect 는 반경이 변의 절반을 넘으면 아크가 성립하지 않아
    //   **렌더 루프가 돌아오지 않는다**(실측: loop.step 20회에 8초 타임아웃).
    //   `UI.R.pill`(999) 처럼 CSS 관용값을 그대로 넘기면 화면이 통째로 멈춘다.
    //   호출부를 전부 믿지 말고 여기서 한 번 자른다.
    radius = _safeR(radius, w, h);
    var px = UI.size(opts.fontSize, FS.button);

    // ── 시각: 라운드 사각형은 Graphics 로 그린다 ──
    var gfx = scene.add.graphics();
    //  ── 생성 돌판 원단 (2026-08-31 태현님: "버튼이 AI스럽다") ────────────────
    //  기본색 버튼만 이미지 밑판을 쓴다 — fill 을 지정한 버튼(진영색 CTA·선택 탭)은
    //  색이 정체성이라 절차 그리기를 유지한다(돌판에 틴트를 곱하면 흙탕이 된다).
    //  opts.skin === false 로 끌 수 있고, 소재가 없으면(uibank not ready) 자동 폴백.
    var skin = null;
    //  ⚠ inset 은 **텍스처 px** 다(화면 px 아님 — 처음에 그걸 착각해 모서리가 리본처럼
    //    뭉개졌다). 원단은 132×100 으로 작게 구워 두었고 inset 20 이 그 기준이다.
    //    높이 44 미만·폭 120 미만 버튼(탭 등)은 모서리가 안 성립해 절차 그리기 유지.
    //  라벨 표기 방식 — `UI.BTN_LABEL` (2026-09-03 태현님 "나무배경 가독성 안 좋아").
    //    'ink'      진한 잉크 글자 + 얇은 크림 후광  (기본 — 아래 근거)
    //    'darkwood' 원단을 어둡게 틴트 + 크림 글자 + 얇은 잉크 윤곽
    //    'legacy'   크림 글자 + 두꺼운 잉크 윤곽 (9/01 판 — 한글 속공간이 막힌다)
    //    'off'      원단을 아예 안 깐다(절차 그리기로 롤백)
    var LBL = UI.BTN_LABEL || 'ink';
    if (LBL !== 'off' && opts.skin !== false && opts.fill === undefined && h >= 44 && w >= 120 &&
        GAME.UIBank && GAME.UIBank.ready(scene, 'texButton') && scene.add.nineslice) {
      //  ⚠ 가로 inset 은 **못(뼈) 장식을 고정칸에 넣는 값**이다(2026-09-03 태현님: "버튼을
      //    늘리면서 못 크기도 늘어난게 별로야"). 격자 실측(scratchpad/tex-button-grid.png):
      //    못이 x 15~33 · 100~118 에 있는데 inset 20 이면 그 대부분이 **늘어나는 위/아래
      //    가장자리 칸**에 걸려 버튼 폭에 비례해 뚱뚱해졌다. 34 면 좌우 고정칸(0~34,
      //    98~132)이 못을 통째로 품는다 → 폭이 얼마든 못은 원본 크기 그대로.
      //    세로는 못이 y 8~19 · 79~90 이라 20 안에 이미 들어간다 — 건드리지 않는다
      //    (세로를 키우면 가운데 띠가 더 눌려 나뭇결이 뭉갠다).
      var _insX = 34, _insY = 20;
      skin = scene.add.nineslice(x, y, 'ui-texButton', undefined, w, h, _insX, _insX, _insY, _insY);
      //  depth 전파 — 호출부는 gfx/rect 만 올린다(모달 1002 등). 스킨이 베일 아래
      //  남으면 버튼 몸통만 사라진다(droppopup 주석의 그 사고 계열).
      var _gsd = gfx.setDepth.bind(gfx);
      gfx.setDepth = function (d) { _gsd(d); if (skin && skin.scene) skin.setDepth(d - 0.5); return gfx; };
    }

    // ── 입력 + 호환: 진짜 Rectangle 을 투명하게 얹는다 ──
    //    (setFillStyle / setStrokeStyle 호출을 가로채 gfx 를 다시 그린다)
    var rect = scene.add.rectangle(x, y, w, h, fill, 0);

    var st = { fill: fill, line: line, lw: 1, over: false, down: false, disabled: !!opts.disabled };

    function redraw() {
      var light = UI.IS_LIGHT;
      if (skin && skin.scene) {
        //  이미지 밑판 모드 — 몸통은 원단이 그리고, 상태는 틴트·침강·테두리로 만든다.
        var sdy = st.down && !st.disabled ? 2 : 0;
        skin.setY(y + sdy);
        skin.setAlpha(st.disabled ? 0.45 : 1);
        //  'darkwood' 는 원단 자체를 어둡게 깔아 크림 글자가 얇은 윤곽만으로 뜨게 한다.
        var _base = LBL === 'darkwood' ? 0x8a6540 : 0xffffff;
        skin.setTint(st.down ? shade(_base, -0.18) : (st.over ? shade(_base, 0.10) : _base));
        gfx.clear();
        //  호출부가 setStrokeStyle 로 준 강조 테두리(선택 표시)는 살린다.
        if (st.lw > 1) {
          gfx.lineStyle(st.lw, st.line, 1);
          gfx.strokeRoundedRect(x - w / 2 + st.lw / 2, y - h / 2 + sdy + st.lw / 2,
            w - st.lw, h - st.lw, radius);
        }
        if (txt) txt.setY(y + sdy).setAlpha(st.disabled ? 0.45 : 1);
        return;
      }
      var f = st.fill;
      if (st.disabled) f = shade(COL.surface, light ? -0.045 : -0.01);
      else if (st.down) f = press;
      else if (st.over) f = hover;

      // 눌림 이동은 2px — 1px 는 라이트 테마의 옅은 명도차와 겹쳐 거의 안 보였다.
      // 그림자 높이(3px)보다 작아야 버튼이 바닥을 뚫고 내려가지 않는다.
      var dy = st.down && !st.disabled ? 2 : 0;
      var lw = Math.max(1, st.lw);
      var x0 = x - w / 2, y0 = y - h / 2;
      gfx.clear();

      // 바닥 그림자 — 눌리면 사라져서 '내려앉은' 느낌이 난다.
      // 라이트 테마의 크림 위에서 순검정 0.35 는 때가 낀 것처럼 보인다 → 웜 그림자를 옅게.
      if (!st.disabled && opts.flat !== true) {
        var shCol = COL.shadow === undefined ? 0x000000 : COL.shadow;
        var shA = light ? 0.20 : 0.35;
        if (st.down) {
          // 눌린 상태에도 얇은 그림자 한 줄만 남긴다 — 완전히 없애면 버튼이 '떠 있는 판'이 아니라
          // 배경에 인쇄된 그림처럼 보인다.
          gfx.fillStyle(shCol, shA * 0.55);
          gfx.fillRoundedRect(x0, y0 + dy + 1, w, h, radius);
        } else {
          gfx.fillStyle(shCol, shA);
          gfx.fillRoundedRect(x0, y0 + 3, w, h, radius);
        }
      }
      gfx.fillStyle(f, st.disabled ? 0.55 : 1);
      gfx.fillRoundedRect(x0, y0 + dy, w, h, radius);

      if (!st.disabled) {
        if (light) {
          // 라이트 — 위쪽에 아주 옅은 흰 김서림, 아래쪽에 웜 그늘.
          // 흰 하이라이트만 쓰면 크림 위에서 아무 일도 일어나지 않는다(대비 1.02).
          gfx.fillStyle(0xffffff, st.down ? 0.10 : 0.34);
          gfx.fillRoundedRect(x0 + 1, y0 + dy + 1, w - 2, Math.max(5, h * 0.34),
            { tl: radius, tr: radius, bl: 0, br: 0 });
          gfx.fillStyle(shade(f, -0.11), st.down ? 0.55 : 0.35);
          gfx.fillRoundedRect(x0 + 1, y0 + dy + h - Math.max(4, h * 0.20) - 1,
            w - 2, Math.max(4, h * 0.20), { tl: 0, tr: 0, bl: radius, br: radius });
          // 눌림 — 위 안쪽 그늘. "손가락에 눌려 안으로 들어갔다"의 결정적 신호다.
          // 면 밝기 변화를 AA 때문에 -0.08 로 묶었으므로 이쪽을 세게 쓴다.
          // 높이의 18% 만 덮으므로 가운데 정렬된 라벨은 이 위에 얹히지 않는다.
          if (st.down) {
            gfx.fillStyle(shade(f, -0.22), 0.7);
            gfx.fillRoundedRect(x0 + 1, y0 + dy + 1, w - 2, Math.max(3, h * 0.18),
              { tl: radius, tr: radius, bl: 0, br: 0 });
          }
        } else {
          gfx.fillStyle(0xffffff, st.down ? 0.03 : 0.06);
          gfx.fillRoundedRect(x0 + 1, y0 + dy + 1, w - 2, Math.max(6, h * 0.42),
            { tl: radius, tr: radius, bl: 0, br: 0 });
        }
      }
      // 눌리면 테두리도 한 단계 진해진다 — 세 번째 신호
      gfx.lineStyle(lw, st.down && !st.disabled ? shade(st.line, light ? -0.10 : 0.10) : st.line,
        st.disabled ? 0.35 : 1);
      gfx.strokeRoundedRect(x0 + lw / 2, y0 + dy + lw / 2, w - lw, h - lw, radius);

      if (txt) txt.setY(y + dy).setAlpha(st.disabled ? 0.45 : 1);
    }

    //  버튼 라벨은 크기와 무관하게 **본문체**다 — 간판체는 제목에만(W4 결정).
    var txt = scene.add.text(x, y, label, styleOf(px, color, { align: 'center', fontFamily: CFG.FONT }))
      .setOrigin(0.5);
    finish(txt, px, { lineSpacing: 0 });
    //  돌판 원단 위 잉크색 라벨은 옹이·나뭇결에 먹힌다(2026-09-01 태현님: "버튼
    //  가독성이 너무 안좋아") — 원단 모드에서는 크림 글자 + 잉크 윤곽으로 새긴다.
    //  색을 명시한 호출부(opts.color)는 그대로 존중한다.
    //  ⚠ 크림 글자(#f7eed8, 상대휘도 0.85)는 밝은 나무 원단(0.53) 위에서 **1.55:1** 이다 —
    //    윤곽이 없으면 아예 안 보여서 9/01 판은 윤곽을 22% 까지 키웠고, 그 두께가 한글
    //    속공간을 메워 "뭉갠 글자"가 됐다(태현님 재신고). 밝은 원단에는 **진한 잉크**가 맞다:
    //    #241a10 대 원단은 9.9:1 이고, 얇은 크림 후광은 나뭇결·옹이와만 떼어 주면 된다.
    if (skin && !opts.color) {
      if (LBL === 'legacy') {
        txt.setColor('#f7eed8');
        txt.setStroke('#241a10', Math.max(3, Math.round(px * 0.22)));
      } else if (LBL === 'darkwood') {
        txt.setColor('#fbf1dd');
        txt.setStroke('#2a1d10', Math.max(2, Math.round(px * 0.12)));
      } else {
        txt.setColor('#241a10');
        txt.setStroke('#f6ead2', Math.max(2, Math.round(px * 0.14)));
        //  아래쪽 한 픽셀만 밝게 — 판에 **새긴** 글자로 읽힌다(그림자를 어둡게 주면
        //  잉크 글자에 잉크 그림자라 진창이 된다).
        txt.setShadow(0, 1, 'rgba(255,246,225,0.55)', 1, false, true);
      }
    }
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
      // 버튼 클릭음 — 모든 버튼에 한 곳에서 붙인다(씬마다 넣으면 빠뜨린다)
      if (GAME.Sound) GAME.Sound.play('click');
      if (opts.fireOnUp) return;
      onClick();
    });
    rect.on('pointerup', function () {
      var was = st.down;
      st.down = false; redraw();
      if (opts.fireOnUp && was && !st.disabled) onClick();
    });

    rect.once('destroy', function () {
      if (gfx && gfx.scene) gfx.destroy();
      if (skin && skin.scene) skin.destroy();      //  스킨 유령 방지(_clearBody 계열)
    });

    // 겹침 감사용 표시 — 버튼과 그 버튼의 라벨은 겹쳐도 정상이다
    rect.__uiBtn = true;
    txt.__btnLabel = rect;
    rect.__uiSkin = !!skin;        // 이미지 원단을 깐 버튼인가 — 가독성 실측 도구가 읽는다
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
    // ⚠ Phaser 의 fillRoundedRect 는 반경이 변의 절반을 넘으면 아크가 성립하지 않아
    //   **렌더 루프가 돌아오지 않는다**(실측: loop.step 20회에 8초 타임아웃).
    //   `UI.R.pill`(999) 처럼 CSS 관용값을 그대로 넘기면 화면이 통째로 멈춘다.
    //   호출부를 전부 믿지 말고 여기서 한 번 자른다.
    radius = _safeR(radius, w, h);
    var g = scene.add.graphics();
    if (opts.shadow !== false) {
      // 라이트 테마에서 순검정 0.28 은 크림 위에 회색 때처럼 앉는다 → 웜 그림자를 옅게.
      g.fillStyle(COL.shadow === undefined ? 0x000000 : COL.shadow, UI.IS_LIGHT ? 0.16 : 0.28);
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

  // 작은 태그(진영/상태) — 텍스트만 있는 것보다 훨씬 빨리 읽힌다.
  //
  //  아기자기함은 세 가지에서 나온다:
  //   ① 완전한 알약(높이의 절반 반경) ② 왼쪽 점 하나 ③ 아래로 1px 웜 그림자
  //  점은 등급 색을 **면이 아니라 점으로** 한 번 더 보여준다. 배지 안 글자는 micro(13~15px)라
  //  색만으로는 등급이 잘 안 읽혔는데, 점을 붙이면 글자를 안 읽어도 색 사다리가 보인다.
  //  opts.dot: false 로 끌 수 있다(폭이 12px 늘어난다).
  UI.chip = function (scene, x, y, text, opts) {
    opts = opts || {};
    var px = UI.size(opts.size, FS.micro);
    var t = scene.add.text(0, 0, text, styleOf(px, opts.color || TXT.text)).setOrigin(0.5);
    finish(t, px, { lineSpacing: 0 });
    var dotOn = opts.dot !== false && opts.line !== undefined && opts.line !== null;
    var padX = 9, padY = 4;
    var dotW = dotOn ? 12 : 0;
    var w = Math.max(opts.minWidth || 0, Math.ceil(t.width) + padX * 2 + dotW);
    var h = Math.ceil(t.height) + padY * 2;
    var r = h / 2;
    var g = scene.add.graphics();
    if (opts.shadow !== false) {
      g.fillStyle(COL.shadow === undefined ? 0x000000 : COL.shadow, UI.IS_LIGHT ? 0.14 : 0.26);
      g.fillRoundedRect(x, y + 2, w, h, r);
    }
    g.fillStyle(opts.fill === undefined ? COL.surfaceAlt : opts.fill, 1);
    g.fillRoundedRect(x, y, w, h, r);
    if (opts.line !== undefined && opts.line !== null) {
      g.lineStyle(UI.IS_LIGHT ? 1.5 : 1, opts.line, 1);
      g.strokeRoundedRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5, r);
    }
    if (dotOn) {
      g.fillStyle(opts.line, 1);
      g.fillCircle(x + padX + 2, y + h / 2, Math.max(2.5, h * 0.16));
    }
    t.setPosition(x + (w + dotW) / 2, y + h / 2);
    // Graphics 를 Text 뒤에 add 했으므로 그대로 두면 **배경이 글자를 덮는다**(실제로 겪음).
    // 폭을 재려면 Text 가 먼저 있어야 해서 순서를 못 바꾸니, 그린 뒤 글자를 위로 올린다.
    if (scene.children && scene.children.bringToTop) scene.children.bringToTop(t);
    return { gfx: g, text: t, w: w, h: h };
  };

  // ───────────────────────────────────────────────────────────────────────
  //  7-b. 리본 띠 (2026-09-02 W4) — 제목·탭 바 뒤에 까는 뼈 리본
  //     UI.ribbon(scene, cx, cy, bandW, bandH, opts)
  //       (cx, cy)      = **띠 몸통(글자가 앉는 면)** 의 중심. 말린 끝은 몸통 밖으로 뻗는다.
  //       bandW/bandH   = 몸통 크기. 반환값의 full 이 말린 끝까지 포함한 실제 상자다 —
  //                       다음 줄은 full.bottom 에서 이어 내릴 것(고정 오프셋 금지).
  //       opts.maxW     = 말린 끝 포함 전체 폭 상한(화면 폭) — 넘으면 몸통을 줄인다.
  //       opts.scale    = 말린 끝 크기 배율(기본 1). 9-slice 모서리는 텍스처 px 로 박히므로
  //                       좁은 자리(상점 탭 바)는 0.5~0.6 으로 끝을 작게 만든다.
  //                       (nineslice 를 1/s 크기로 만들고 setScale(s) — 결과적으로
  //                        더 작게 구운 원단과 같다.)
  //       opts.depth / opts.alpha
  //     inset 은 uibank DATA(texRibbonSm.inset) 의 **텍스처 px 실측치**를 읽는다 —
  //     l/r = 말린 끝 폭, t/b = 몸통 상하 가장자리 + 3(잉크선 보호). 그래서 몸통은
  //     텍스처 세로에서 (t-3) ~ (h-(b-3)) 사이다. 화면 몸통 높이 = 전체 - (t+b-6)·s.
  //     소재가 아직 없으면(로드 전·src null) 같은 상자 규격으로 **절차 그리기**한다 —
  //     몸통 + 제비꼬리 끝. 레이아웃은 두 경우가 완전히 같다(full 이 같다).
  // ───────────────────────────────────────────────────────────────────────
  var RIBBON_EDGE_PAD = 3;   // split-ui-sheets.py measure_ribbon 의 edge_pad 와 같은 값
  UI.ribbon = function (scene, cx, cy, bandW, bandH, opts) {
    opts = opts || {};
    var s = opts.scale || 1;
    var UB = GAME.UIBank;
    var d = UB && UB.DATA && UB.DATA.texRibbonSm;
    var ins = (d && d.inset) || { l: 49, r: 48, t: 35, b: 25 };
    var endL = ins.l * s, endR = ins.r * s;
    var overT = (ins.t - RIBBON_EDGE_PAD) * s, overB = (ins.b - RIBBON_EDGE_PAD) * s;
    if (opts.maxW && bandW + endL + endR > opts.maxW) bandW = Math.max(24, opts.maxW - endL - endR);
    bandH = Math.max(bandH, 12 * s);
    var fullW = bandW + endL + endR, fullH = bandH + overT + overB;
    //  몸통 중심 → 전체 상자 중심 (말린 끝이 비대칭이라 몇 px 어긋난다)
    var fcx = cx + (endR - endL) / 2, fcy = cy + (overB - overT) / 2;
    var full = { left: fcx - fullW / 2, right: fcx + fullW / 2, top: fcy - fullH / 2, bottom: fcy + fullH / 2,
                 w: fullW, h: fullH };
    var band = { left: cx - bandW / 2, right: cx + bandW / 2, top: cy - bandH / 2, bottom: cy + bandH / 2,
                 w: bandW, h: bandH };
    var obj = null, textured = false;
    if (UB && UB.ready(scene, 'texRibbonSm') && scene.add.nineslice) {
      obj = scene.add.nineslice(fcx, fcy, 'ui-texRibbonSm', undefined,
        Math.max(ins.l + ins.r + 2, fullW / s), Math.max(ins.t + ins.b + 2, fullH / s),
        ins.l, ins.r, ins.t, ins.b);
      obj.setScale(s);
      textured = true;
    } else {
      //  절차 폴백 — 가죽색 몸통 + 양끝 제비꼬리. 상자 규격은 텍스처판과 같다.
      var g = scene.add.graphics();
      var leather = UI.IS_LIGHT ? 0xc78a4e : 0x9c6a3a;
      var tail = UI.IS_LIGHT ? 0xa66f38 : 0x7a5029;
      var ink = UI.IS_LIGHT ? 0x3a2414 : 0x1a120a;
      var dy = Math.round(bandH * 0.18);            // 꼬리는 몸통보다 조금 처진다
      var notch = Math.min(endL, endR) * 0.55;
      var by0 = band.top + dy, by1 = band.bottom + dy;
      g.fillStyle(ink, 0.35);
      g.fillRect(band.left + 2, band.top + 4, bandW, bandH);
      g.fillStyle(tail, 1);
      g.fillPoints([
        { x: full.left, y: by0 }, { x: band.left + 6, y: by0 }, { x: band.left + 6, y: by1 },
        { x: full.left, y: by1 }, { x: full.left + notch, y: (by0 + by1) / 2 }], true);
      g.fillPoints([
        { x: full.right, y: by0 }, { x: band.right - 6, y: by0 }, { x: band.right - 6, y: by1 },
        { x: full.right, y: by1 }, { x: full.right - notch, y: (by0 + by1) / 2 }], true);
      g.fillStyle(leather, 1);
      g.fillRoundedRect(band.left, band.top, bandW, bandH, 4);
      g.lineStyle(2, ink, 0.9);
      g.strokeRoundedRect(band.left + 1, band.top + 1, bandW - 2, bandH - 2, 4);
      obj = g;
      obj.__uiBtnGfx = true;     // 감사 도구가 Graphics 를 텍스트로 오인하지 않게
    }
    if (opts.depth !== undefined) obj.setDepth(opts.depth);
    if (opts.alpha !== undefined) obj.setAlpha(opts.alpha);
    return { obj: obj, full: full, band: band, textured: textured,
             destroy: function () { if (obj && obj.scene) obj.destroy(); } };
  };
  //  글자가 앉을 몸통 크기를 글자 실측에서 잡는 도우미 — 제목 하나짜리 띠용.
  //  (txt 는 이미 만든 Text. 띠는 그 **뒤**에 있어야 하므로 만든 뒤 sendToBack 하거나
  //   depth 를 글자보다 낮게 줄 것.)
  UI.ribbonBehind = function (scene, txt, opts) {
    opts = opts || {};
    var padX = opts.padX === undefined ? 22 : opts.padX;
    var padY = opts.padY === undefined ? 6 : opts.padY;
    var b = txt.getBounds();
    var r = UI.ribbon(scene, b.centerX, b.centerY, Math.ceil(b.width) + padX * 2,
      Math.ceil(b.height) + padY * 2, opts);
    if (opts.depth === undefined && scene.children && scene.children.moveBelow) {
      scene.children.moveBelow(r.obj, txt);
    }
    return r;
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
