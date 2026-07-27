window.GAME = window.GAME || {};

// 터치 기기 판별 — 조작 스킴이 완전히 달라진다(마우스+QWER vs 탭+스킬버튼)
GAME.isTouch = (function () {
  return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
})();

// 세로 화면이면 클래시로얄처럼 위아래로 긴 전장을 쓴다.
// 배치도는 정규화 좌표(0~1)로 저장되므로 두 레이아웃 사이에서 호환된다.
// ?portrait=1 / ?portrait=0 으로 강제할 수 있다(개발·검증용).
GAME.isPortrait = (function () {
  var q = (location.search || '').match(/[?&]portrait=([01])/);
  if (q) return q[1] === '1';
  var w = window.innerWidth || 1200, h = window.innerHeight || 800;
  return h > w && w < 900;
})();

GAME.CONFIG = (function () {
  var P = GAME.isPortrait;

  // 맵을 조금 넓혔다 — 영웅이 도망칠 공간이 늘어나는 만큼 진형도 넓게 펼 수 있다.
  var W = P ? 660 : 1340;
  var H = P ? 1160 : 900;
  var arena = P
    ? { x: 14, y: 14, w: 632, h: 950 }
    : { x: 20, y: 20, w: 1300, h: 760 };

  // 배치 구역: 위 30%가 전략가, 아래 30%가 컨트롤러
  var zoneH = Math.round(arena.h * 0.30);

  return {
    PORTRAIT: P,
    WIDTH: W,
    HEIGHT: H,
    ARENA: arena,

    ZONE_STRATEGIST: { x: arena.x, y: arena.y, w: arena.w, h: zoneH },
    ZONE_CONTROLLER: { x: arena.x, y: arena.y + arena.h - zoneH, w: arena.w, h: zoneH },

    BATTLE_TIME: 90,

    // 예산은 전략가가 배치도를 만들 때 고른다.
    // 컨트롤러는 그 배치도와 '같은 예산'으로 영웅+아이템을 산다 → 항상 동등한 조건.
    BUDGETS: { '저예산': 120, '중예산': 160, '고예산': 220 },
    BUDGET_TIERS: ['저예산', '중예산', '고예산'],
    DEFAULT_TIER: '중예산',

    // 배치 지점에서 벗어날 수 있는 기본 거리(유닛별 chase 가 있으면 그걸 쓴다)
    LEASH: 115,

    // 맵 대각선 = '맵 끝까지 닿는다'의 기준값.
    // 원칙: **영웅에게 쉬는 시간도 사각지대도 없다.** 모든 전략가 유닛은 둘 중 하나여야 한다
    //   · 영웅에게 접근할 수 있다 (압박이 차오르면 추격 범위가 이 값까지 늘어난다)
    //   · 고정이라면 사거리가 이 값이라 맵 어디든 닿는다
    // 지뢰만 예외다 — 밟아야 터지는 게 지뢰의 정체성이라 추격도 사거리도 없다.
    MAP_SPAN: Math.ceil(Math.sqrt(arena.w * arena.w + arena.h * arena.h)),

    // 크리티컬 — 모든 공격에 적용된다
    CRIT_CHANCE: 0.25,
    CRIT_MULT: 1.5,

    // 광역 흡혈 감쇠 — 한 번의 공격이 여러 기를 때릴 때 **두 번째 대상부터** 흡혈에 곱해진다.
    // 1.0 이면 명중 수만큼 흡혈이 그대로 곱해져서, 진형이 촘촘할수록 영웅이 더 회복한다
    // (= 전략가의 물량이 영웅의 밥이 된다). 그 역전을 막는 값이다.
    AOE_LIFESTEAL: 0.25,

    FONT: '"Malgun Gothic", "맑은 고딕", sans-serif',

    COLORS: {
      bg: 0x101018,
      arenaFill: 0x1e1e2c,
      arenaLine: 0x3a3a52,
      zoneStrategist: 0x2a2440,
      zoneController: 0x1c3038,
      controller: 0x35d0a5,
      strategist: 0x9b8cf0,
      selectBox: 0x7ed957,
      hpGood: 0x4ade80,
      hpBad: 0xef4444,
      text: '#e8e8f0',
      textDim: '#9a9ab0',
      accent: '#35d0a5',
      accentAlt: '#9b8cf0',
      warn: '#f0a86a',
      crit: '#ffd166'
    }
  };
})();

GAME.CONFIG.ARENA.right = GAME.CONFIG.ARENA.x + GAME.CONFIG.ARENA.w;
GAME.CONFIG.ARENA.bottom = GAME.CONFIG.ARENA.y + GAME.CONFIG.ARENA.h;

// 아레나 수직 중심을 기준으로 y를 뒤집는다.
// 전략가가 아래(사람 자리)에서 만든 배치도를 위쪽(전투 기준)으로 변환할 때 쓴다.
GAME.mirrorY = function (y) {
  var A = GAME.CONFIG.ARENA;
  return Math.round(2 * (A.y + A.h / 2) - y);
};
