window.GAME = window.GAME || {};

GAME.CONFIG = {
  WIDTH: 1200,
  HEIGHT: 820,

  // 아레나: 더 넓게. 위/아래 배치 구역 사이 중립지대를 크게 둬서
  // 컨트롤러가 날아오는 논타겟 공격을 보고 반응할 시간을 준다.
  ARENA: { x: 20, y: 20, w: 1160, h: 680 },

  // 전투 기준 좌표계: 전략가는 항상 위, 컨트롤러는 항상 아래.
  ZONE_STRATEGIST: { x: 20, y: 20, w: 1160, h: 230 },
  ZONE_CONTROLLER: { x: 20, y: 470, w: 1160, h: 230 },

  BATTLE_TIME: 90,

  // 예산은 전략가가 배치도를 만들 때 고른다.
  // 컨트롤러는 그 배치도와 '같은 예산'으로 영웅+아이템을 산다 → 항상 동등한 조건.
  BUDGETS: { '저예산': 120, '중예산': 160, '고예산': 220 },
  BUDGET_TIERS: ['저예산', '중예산', '고예산'],
  DEFAULT_TIER: '중예산',

  // 전략가 유닛이 배치 지점에서 벗어날 수 있는 최대 거리(px).
  LEASH: 115,

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
    warn: '#f0a86a'
  }
};

GAME.CONFIG.ARENA.right = GAME.CONFIG.ARENA.x + GAME.CONFIG.ARENA.w;
GAME.CONFIG.ARENA.bottom = GAME.CONFIG.ARENA.y + GAME.CONFIG.ARENA.h;

// 아레나 수직 중심을 기준으로 y를 뒤집는다.
// 전략가가 아래(사람 자리)에서 만든 배치도를 위쪽(전투 기준)으로 변환할 때 쓴다.
GAME.mirrorY = function (y) {
  var A = GAME.CONFIG.ARENA;
  return Math.round(2 * (A.y + A.h / 2) - y);
};
