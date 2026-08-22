window.GAME = window.GAME || {};

// 투영 레이어 — 이 파일이 이 게임의 "입체감"을 전담한다.
//
// 원칙: 전투 로직은 전부 평면(world) 좌표에서 돌아간다. 거리·히트박스·투사체 경로 계산은
// 기울임을 전혀 모른다. 화면에 그릴 때만 여기를 거쳐 좌표를 변환하고,
// 마우스 입력은 역변환해서 다시 평면 좌표로 되돌린다.
// → 롤토체스식 비스듬한 뷰를 얻으면서도 논타겟 회피 판정의 공정성은 손상되지 않는다.
GAME.Iso = {
  // y축 압축 비율. 1이면 정탑다운, 작을수록 더 눕는다.
  // 작은 화면(세로·폰 가로)은 덜 눕혀야 유닛이 크게 보이고 겹침도 덜하다.
  //
  // ⚠ 2026-07-31 — **PC 도 폰과 같은 0.72 를 쓴다.** 전장(ARENA)을 폰 기준으로 통일하면서
  //   PC 아레나가 760 → 608 로 낮아졌는데, 옛 0.60 을 그대로 두니 그려지는 높이가
  //   456 → 365px 로 줄어 화면 아래가 220px 비었다(실측 스크린샷). 압축비를 폰과 맞추면
  //   438px 로 돌아오면서 **두 프로필이 같은 전장을 같은 각도로** 보게 된다.
  //   TILT 는 렌더 전용이라(이 파일 상단 원칙) 밸런스는 한 톨도 안 움직인다.
  TILT: 0.72,

  // 아레나 상단이 화면에서 시작하는 y 좌표
  SCREEN_TOP: GAME.CONFIG.SMALL ? 40 : 66,

  // ── 전투 전용 '전체 화면' 배치 ──────────────────────────────────────────
  // 세로 폰에서 전장을 화면 거의 전체로 키운다. HUD 는 위로 올리고 조작 버튼은
  // 전장 위에 겹쳐 놓으므로, 아레나가 쓸 수 있는 세로가 훨씬 넓어진다.
  //
  // **월드 좌표는 건드리지 않는다.** 여기서 바꾸는 건 압축비(TILT)와 시작 y 뿐이라
  // 순수 렌더 계층 변경이다(거리·회피 판정은 그대로). 그래서 밸런스가 움직이지 않는다.
  // 배치·준비 화면은 HUD 를 아레나 **아래**에 두므로 이 모드를 쓰면 안 된다 → 씬별로 켠다.
  FULL_TOP: 96,          // 기본값 — 실제로는 위쪽 HUD 의 **실측 바닥**을 받아 쓴다
  // 폰 하단바와 띄우는 간격(설계 px). 가로에서는 화면 높이가 390 뿐이라 96 이면
  // 화면의 25% 를 버린다 → 엄지 조작 버튼이 전장 위에 겹치는 구성이므로 짧게 잡는다.
  BOTTOM_GAP: (GAME.CONFIG.PHONE ? 24 : 96),

  _base: {
    tilt: 0.72,                      // 위 TILT 주석 참조 — 전 프로필 공통
    top: GAME.CONFIG.SMALL ? 40 : 66
  },

  // mode: 'full' = 전투용 전체화면(세로 전용) / 그 외 = 기본
  // topY: HUD 바닥(여기부터 아레나가 시작한다). 안 주면 FULL_TOP.
  //   HUD 높이는 보스 유무로 128↔158 로 달라진다 → **실측값을 받아야** 겹치지 않는다.
  setMode: function (mode, topY) {
    var A = GAME.CONFIG.ARENA;
    // 폰 가로도 이 모드를 쓴다 — 높이 390 에 HUD 를 쌓을 자리가 없어 전장 위에 겹친다.
    if (mode === 'full' && GAME.CONFIG.SMALL) {
      this.SCREEN_TOP = (topY === undefined) ? this.FULL_TOP : Math.round(topY);
      // 남은 세로를 꽉 채우되 1.0(정탑다운)을 넘지 않는다 — 넘기면 원이 세로로 늘어난다.
      var avail = GAME.CONFIG.HEIGHT - this.SCREEN_TOP - this.BOTTOM_GAP;
      this.TILT = Math.max(0.45, Math.min(1, avail / A.h));
    } else {
      this.SCREEN_TOP = this._base.top;
      this.TILT = this._base.tilt;
    }
    return this;
  },

  // 유닛이 지면에서 떠 보이는 정도(빌보드 높이 배율)
  LIFT: 1.15,

  //  ── 실시간 대전 상하반전 (2026-08-22 태현님: "각자 본인의 진형이 밑에 있게") ──
  //  내 팀이 위쪽(strategist 자리)이면 **화면만** 뒤집는다. 시뮬 좌표는 양쪽이
  //  동일해야 하므로(록스텝) 월드는 절대 안 건드린다 — 투영과 역투영만 거울이다.
  //  거울은 자기역원이라 toWorldY 도 같은 함수로 풀린다.
  rtFlip: false,
  _fy: function (worldY) {
    if (!this.rtFlip) return worldY;
    var A = GAME.CONFIG.ARENA;
    return A.y + A.bottom - worldY;
  },

  toScreenY: function (worldY) {
    var A = GAME.CONFIG.ARENA;
    return this.SCREEN_TOP + (this._fy(worldY) - A.y) * this.TILT;
  },

  toWorldY: function (screenY) {
    var A = GAME.CONFIG.ARENA;
    return this._fy(A.y + (screenY - this.SCREEN_TOP) / this.TILT);
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
  //  ⚠ 반전(rtFlip) 중에는 toScreenY(A.y) 가 **아래 모서리**를 준다 — 사각형은
  //    대칭이라 min/max 로 접어야 배경·테두리가 제자리에 남는다(실측: 반전 화면에서
  //    유닛은 맞는데 테두리만 화면 밖 아래로 내려가 있었다).
  screenRect: function () {
    var A = GAME.CONFIG.ARENA;
    var y1 = this.toScreenY(A.y), y2 = this.toScreenY(A.bottom);
    return {
      x: A.x,
      y: Math.min(y1, y2),
      w: A.w,
      h: A.h * this.TILT,
      right: A.right,
      bottom: Math.max(y1, y2)
    };
  },

  // 깊이 정렬용 키 — 큰 값일수록 화면 앞쪽(나중에 그린다)
  depth: function (worldY) {
    return worldY;
  }
};
