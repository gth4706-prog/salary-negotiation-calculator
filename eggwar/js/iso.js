window.GAME = window.GAME || {};

// 투영 레이어 — 이 파일이 이 게임의 "입체감"을 전담한다.
//
// 원칙: 전투 로직은 전부 평면(world) 좌표에서 돌아간다. 거리·히트박스·투사체 경로 계산은
// 기울임을 전혀 모른다. 화면에 그릴 때만 여기를 거쳐 좌표를 변환하고,
// 마우스 입력은 역변환해서 다시 평면 좌표로 되돌린다.
// → 롤토체스식 비스듬한 뷰를 얻으면서도 논타겟 회피 판정의 공정성은 손상되지 않는다.
GAME.Iso = {
  // y축 압축 비율. 1이면 정탑다운, 작을수록 더 눕는다.
  TILT: GAME.CONFIG.PORTRAIT ? 0.72 : 0.60,

  // 아레나 상단이 화면에서 시작하는 y 좌표
  SCREEN_TOP: GAME.CONFIG.PORTRAIT ? 40 : 66,

  // 유닛이 지면에서 떠 보이는 정도(빌보드 높이 배율)
  LIFT: 1.15,

  toScreenY: function (worldY) {
    var A = GAME.CONFIG.ARENA;
    return this.SCREEN_TOP + (worldY - A.y) * this.TILT;
  },

  toWorldY: function (screenY) {
    var A = GAME.CONFIG.ARENA;
    return A.y + (screenY - this.SCREEN_TOP) / this.TILT;
  },

  // x는 변환하지 않는다(순수 y 압축). 좌우 이동이 화면에서도 그대로 좌우로 보여
  // WASD/마우스 조작 직관성이 유지된다.
  toScreen: function (x, y) {
    return { x: x, y: this.toScreenY(y) };
  },

  toWorld: function (sx, sy) {
    return { x: sx, y: this.toWorldY(sy) };
  },

  // 화면상 아레나 사각형
  screenRect: function () {
    var A = GAME.CONFIG.ARENA;
    return {
      x: A.x,
      y: this.toScreenY(A.y),
      w: A.w,
      h: A.h * this.TILT,
      right: A.right,
      bottom: this.toScreenY(A.bottom)
    };
  },

  // 깊이 정렬용 키 — 큰 값일수록 화면 앞쪽(나중에 그린다)
  depth: function (worldY) {
    return worldY;
  }
};
