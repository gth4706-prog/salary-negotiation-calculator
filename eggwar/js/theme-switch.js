window.GAME = window.GAME || {};
GAME.UI = GAME.UI || {};

// 테마 전환 장치.
//
// A·B·C 세 안이 `GAME.UI.THEMES.X` 에 **같은 토큰 이름**으로 등록되고,
// 여기서 그중 하나를 골라 실제 색으로 밀어 넣는다. 고르는 값 하나만 바꾸면
// 화면 전체가 그 테마로 덮인다 — 씬 코드는 한 줄도 안 바뀐다.
//
// 적용 대상 4곳:
//   1) GAME.UI.COL   — Graphics/Rectangle 이 쓰는 숫자 색
//   2) GAME.UI.TXT   — Text 가 쓰는 CSS 색
//   3) GAME.UI.TIER  — 등급 6단계 (ui-hud.js 가 쓴다)
//   4) GAME.CONFIG.COLORS / ARENA 계열 — 옛 씬들이 직접 참조하는 값
//
// 주의: ui-theme.js 와 ui-hud.js 뒤, 씬들보다 **먼저** 로드해야 한다.
(function (UI) {
  if (!UI || !UI.COL) {
    if (window.console) console.error('[theme-switch] ui-theme.js 뒤에 로드해야 합니다.');
    return;
  }

  UI.THEMES = UI.THEMES || {};
  var KEY = 'asymgame.theme';

  // 지금 화면(=기본값)을 'stock' 으로 등록해 둔다.
  // 어떤 테마를 골랐다가 되돌리고 싶을 때 돌아올 자리가 있어야 한다.
  UI.THEMES.stock = {
    name: '기본 (현재)',
    desc: '어두운 남색 바탕 · 청록/보라 진영색',
    dark: true,
    COL: shallow(UI.COL),
    TXT: shallow(UI.TXT),
    TIER: (UI.TIER || []).map(shallow),
    R: shallow(UI.R),
    // FX/MAT 은 여기서 스냅숏을 뜨지 않는다 — eggart.js 가 **이 파일보다 뒤에** 로드돼
    // 등록 시점에는 UI.MAT 이 아직 없다. 되돌리기는 UI.FX_BASE / UI.MAT_BASE 를 쓴다.
    strokeWidth: 2,
    // 진영색은 **글자 강조색과 다른 값**이다. ui-theme.js 가 글자용으로 더 밝은
    // #4fdcb4 를 쓰는데, 계란 아트는 0x35d0a5 로 칠해진다. 유도하지 말고 따로 저장한다.
    factionController: GAME.CONFIG.COLORS.controller,
    factionStrategist: GAME.CONFIG.COLORS.strategist,
    arena: {
      fill: GAME.CONFIG.COLORS.arenaFill,
      line: GAME.CONFIG.COLORS.arenaLine,
      zoneStrategist: GAME.CONFIG.COLORS.zoneStrategist,
      zoneController: GAME.CONFIG.COLORS.zoneController
    }
  };

  function shallow(o) {
    var out = {};
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) out[k] = o[k];
    return out;
  }

  UI.themeList = function () {
    var out = [];
    for (var k in UI.THEMES) {
      if (!Object.prototype.hasOwnProperty.call(UI.THEMES, k)) continue;
      out.push({ key: k, name: UI.THEMES[k].name || k, desc: UI.THEMES[k].desc || '' });
    }
    return out;
  };

  // 확정된 기본 테마. 저장된 선택이 있으면 그게 우선한다.
  UI.DEFAULT_THEME = 'A';

  UI.currentTheme = function () {
    var d = UI.THEMES[UI.DEFAULT_THEME] ? UI.DEFAULT_THEME : 'stock';
    var k = GAME.Store ? GAME.Store.get(KEY, d) : d;
    return UI.THEMES[k] ? k : d;
  };

  // 테마 적용. 씬이 이미 떠 있으면 다시 그려야 반영된다(applyTheme 이 알아서 재시작).
  UI.applyTheme = function (key, opts) {
    opts = opts || {};
    var t = UI.THEMES[key];
    if (!t) { if (window.console) console.warn('[theme-switch] 없는 테마: ' + key); return false; }

    // **먼저 기본값(stock)으로 되돌린 뒤** 테마를 얹는다.
    // 그냥 병합하면 이전 테마가 정의했는데 다음 테마가 안 정의한 키가 그대로 남는다.
    // 실제로 A(밝은 테마)의 흰 글자 테두리가 B·C(어두운 테마)까지 따라가서
    // 흰 글자에 흰 테두리가 붙었다.
    var base = (key === 'stock') ? null : UI.THEMES.stock;
    var k;
    if (base) {
      if (base.COL) for (k in base.COL) UI.COL[k] = base.COL[k];
      if (base.TXT) for (k in base.TXT) UI.TXT[k] = base.TXT[k];
      if (base.R)   for (k in base.R)   UI.R[k]   = base.R[k];
      UI.STROKE = base.strokeWidth;
    }
    // ── 테마 전용 키 청소 ────────────────────────────────────────────────
    //  테마가 **새로 들여온 키**는 stock 스냅숏에 없어서 위의 복원 루프가 못 지운다.
    //  그대로 두면 다음 테마까지 따라간다. 두 번 겪었다:
    //   · A안의 크림 글자테두리(#FFFCF0)가 stock 으로 넘어가 흰 글자에 흰 테두리가 붙었다
    //   · A안의 체력바 잉크 테두리(hpCasing)가 남아 **어두운 테마 전장 체력바가
    //     크림 캡슐로 그려졌다**(스크린샷 확인)
    //  키 하나씩 손으로 지우면 또 놓친다 → stock 에 없는 키는 전부 지운다.
    function prune(live, stockSnap, incoming) {
      if (!live || !stockSnap) return;
      var keys = [], kk;
      for (kk in live) if (Object.prototype.hasOwnProperty.call(live, kk)) keys.push(kk);
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (Object.prototype.hasOwnProperty.call(stockSnap, key)) continue;   // 원래 있던 키
        if (incoming && incoming[key] !== undefined) continue;                // 이번 테마가 쓰는 키
        delete live[key];
      }
    }
    var S = UI.THEMES.stock;
    prune(UI.TXT, S && S.TXT, t.TXT);
    prune(UI.COL, S && S.COL, t.COL);
    // 이펙트 팔레트·아트 재질색은 항상 기본값으로 되돌린 뒤 테마를 얹는다.
    // (COL/TXT 와 같은 이유 — 앞 테마가 남기면 어두운 테마에 잉크색 이펙트가 따라간다)
    if (UI.FX && UI.FX_BASE) for (k in UI.FX_BASE) UI.FX[k] = UI.FX_BASE[k];
    if (UI.MAT && UI.MAT_BASE) for (k in UI.MAT_BASE) UI.MAT[k] = UI.MAT_BASE[k];

    // **라이트 테마 여부를 먼저 정한다** — 아래의 hover 짝 생성과 UI.button 의
    // 눌림 방향이 이 값을 본다. 나중에 정하면 첫 렌더가 반대로 나간다.
    UI.IS_LIGHT = (t.dark === false);
    // 라이트 테마에서는 아트에 잉크 윤곽을 두른다(eggart.js 가 읽는다).
    UI.ART_INK = (t.artInk !== undefined) ? t.artInk : UI.IS_LIGHT;

    if (t.COL) for (k in t.COL) if (t.COL[k] !== undefined) UI.COL[k] = t.COL[k];
    // hover 짝을 테마가 안 주면 패널색에서 만든다 — 세 안이 매번 6개를 다 채우게 하지 않는다.
    // **라이트 테마에서는 어둡게** 만든다. 밝히면 눌림이 '비활성'처럼 읽힌다.
    ['Teal', 'Purple', 'Amber'].forEach(function (n) {
      if (!t.COL || t.COL['panel' + n + 'Hi'] === undefined) {
        var pbase = UI.COL['panel' + n];
        if (typeof pbase === 'number') {
          UI.COL['panel' + n + 'Hi'] = UI.IS_LIGHT ? darken(pbase, 0.10) : lighten(pbase, 0.28);
        }
      }
    });
    if (t.FX)  for (k in t.FX)  if (t.FX[k]  !== undefined && UI.FX)  UI.FX[k]  = t.FX[k];
    if (t.MAT) for (k in t.MAT) if (t.MAT[k] !== undefined && UI.MAT) UI.MAT[k] = t.MAT[k];
    //  ⚠ 재질 3단(Lite/Dark)을 **base 에서 다시 유도한다** (2026-08-04).
    //    테마는 base 만 덮어쓰므로, 안 다시 뽑으면 밝은 면만 stock 색으로 남아
    //    재질이 두 조각으로 갈라진다. 위 MAT 적용 **뒤**여야 한다.
    if (UI.deriveMatTones) UI.deriveMatTones();
    // 아트 윤곽선 색은 이펙트 잉크와 같은 값을 쓴다 — 화면 전체가 한 벌의 잉크로 그려진다
    if (UI.FX && UI.FX.ink !== undefined) UI.ART_INK_COLOR = UI.FX.ink;
    if (t.TXT) for (k in t.TXT) if (t.TXT[k] !== undefined) UI.TXT[k] = t.TXT[k];
    if (t.R)   for (k in t.R)   if (t.R[k]   !== undefined) UI.R[k]   = t.R[k];
    if (typeof t.strokeWidth === 'number') UI.STROKE = t.strokeWidth;

    // 등급 — 이름은 게임 쪽 개념이라 유지하고 색만 갈아끼운다
    if (t.TIER && t.TIER.length && UI.TIER) {
      for (var i = 0; i < UI.TIER.length && i < t.TIER.length; i++) {
        var src = t.TIER[i], dst = UI.TIER[i];
        if (src.hex !== undefined) dst.hex = src.hex;
        if (src.css !== undefined) dst.css = src.css;
        if (src.panel !== undefined) dst.panel = src.panel;
        if (src.name !== undefined) dst.name = src.name;
      }
    }

    // 전장 색
    var C = GAME.CONFIG.COLORS;
    if (t.arena) {
      if (t.arena.fill !== undefined) C.arenaFill = t.arena.fill;
      if (t.arena.line !== undefined) C.arenaLine = t.arena.line;
      if (t.arena.zoneStrategist !== undefined) C.zoneStrategist = t.arena.zoneStrategist;
      if (t.arena.zoneController !== undefined) C.zoneController = t.arena.zoneController;
    }

    // 진영색 — 계란 아트가 이 두 값으로 칠해진다.
    // **글자 강조색(TXT.accent)에서 유도하지 않는다.** 둘은 의도적으로 다른 값이라
    // 유도하면 원래 색으로 되돌아가지 못한다(실제로 겪음).
    // 테마가 명시하지 않으면 지금 값을 그대로 둔다.
    var fc = (t.factionController !== undefined) ? t.factionController
           : (t.COL && t.COL.factionController);
    var fs = (t.factionStrategist !== undefined) ? t.factionStrategist
           : (t.COL && t.COL.factionStrategist);
    if (fc !== undefined) C.controller = fc;
    if (fs !== undefined) C.strategist = fs;

    if (t.COL && t.COL.bg !== undefined) C.bg = t.COL.bg;

    // 체력·선택 표시 — ui.js 의 체력바와 battle.js 의 마커가 직접 참조한다.
    // 밝은 테마에서는 기존 빨강이 배경에 묻혀서 반드시 갈아끼워야 한다.
    ['hpGood', 'hpBad', 'selectBox'].forEach(function (k2) {
      var v = (t[k2] !== undefined) ? t[k2] : (t.COL && t.COL[k2]);
      if (v !== undefined) C[k2] = v;
    });

    // ui-theme.js 가 CONFIG.COLORS 로 다시 밀어 넣는다(문자열 키 갱신)
    if (UI.applyColors) UI.applyColors();

    // 배경(DOM)도 맞춰준다 — 캔버스 밖 letterbox 가 안 튀게
    if (t.COL && t.COL.bg !== undefined && document && document.body) {
      document.body.style.background = '#' + ('000000' + t.COL.bg.toString(16)).slice(-6);
    }

    if (GAME.Store && opts.remember !== false) GAME.Store.set(KEY, key);

    // 이미 떠 있는 씬을 다시 그린다
    if (opts.restart !== false && GAME.game && GAME.game.scene) {
      var live = GAME.game.scene.getScenes(true);
      for (var s = 0; s < live.length; s++) live[s].scene.restart();
    }
    return true;
  };

  // 색을 흰쪽으로 f 만큼 당긴다 (0~1)
  function lighten(hex, f) {
    var r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
    r = Math.round(r + (255 - r) * f);
    g = Math.round(g + (255 - g) * f);
    b = Math.round(b + (255 - b) * f);
    return (r << 16) | (g << 8) | b;
  }
  UI.lighten = lighten;

  // 색을 검정쪽으로 f 만큼 당긴다 (0~1) — 라이트 테마의 hover/눌림에 쓴다
  function darken(hex, f) {
    var r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
    return ((Math.round(r * (1 - f)) << 16) | (Math.round(g * (1 - f)) << 8) | Math.round(b * (1 - f)));
  }
  UI.darken = darken;

  function cssToHex(css, fallback) {
    if (typeof css !== 'string') return fallback;
    var m = /^#([0-9a-f]{6})$/i.exec(css.trim());
    if (m) return parseInt(m[1], 16);
    var m3 = /^#([0-9a-f]{3})$/i.exec(css.trim());
    if (m3) {
      var c = m3[1];
      return parseInt(c[0] + c[0] + c[1] + c[1] + c[2] + c[2], 16);
    }
    return fallback;
  }
  UI.cssToHex = cssToHex;

  // 저장된 선택을 부팅 시 한 번 적용 (씬 재시작 없이 — 아직 씬이 없다)
  UI.bootTheme = function () {
    var k = UI.currentTheme();
    if (k !== 'stock') UI.applyTheme(k, { restart: false, remember: false });
    return k;
  };
})(GAME.UI);
