// ============================================================================
//  VecIcon — 벡터 아이콘 공용 원시함수. TraitIcon(특성) · SkillIcon(스킬)이 쓴다.
//
//  왜 뽑아냈나: 특성 아이콘(2026-09-08)을 만들 때 여기 있는 함수들을 traiticon.js
//  안에 뒀는데, 스킬 아이콘을 만들면서 그대로 복사할 뻔했다. 이 저장소는 이미
//  `eggart.js` 통합 때 "두 벌이 있으면 어느 쪽이 쓰이는지 알 수 없어진다"를
//  규율로 정했다. 그림 언어를 두 벌 두면 두 화면의 화풍이 조용히 갈라진다.
//
//  화풍 계약 (eggart.js 와 같은 언어 — 새 아이콘을 그릴 때 지킬 것):
//    · 굵은 잉크 윤곽 + 2단 음영. 3단 이상 쓰지 않는다
//    · 재료는 뼈·돌·가죽·불
//    · **26~44px 에서 읽혀야 한다.** 디테일보다 실루엣. 잔 물건 여럿보다 큰 도형 둘
//    · 좌표는 -1~1 정규화. 호출부가 반경(h)만 준다
//
//  ⚠ 흑백(mono)은 **투명도가 아니라 채도**를 뺀다. 이모지로는 못 하던 것이고,
//    잠김/비활성을 색으로 말하려고 만든 것이다. 휘도 보존식이라 실루엣이 안 뭉갠다.
// ============================================================================
(function () {
  'use strict';
  var G = (window.GAME = window.GAME || {});

  var INK = 0x1d1509;
  var INK_A = 0.92;
  var mono = false;

  function C(hex) {
    if (!mono) return hex;
    var r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
    var y = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    var w = Math.min(255, Math.round(y * 1.04));   // 완전 회색은 납작하다 — 살짝 따뜻하게
    return (w << 16) | (y << 8) | Math.round(y * 0.94);
  }

  var V = {
    INK: INK,

    setMono: function (v) { mono = !!v; },
    color: C,

    fill: function (g, hex, a) { g.fillStyle(C(hex), a === undefined ? 1 : a); },
    line: function (g, w, hex, a) {
      g.lineStyle(w, hex === undefined ? INK : C(hex), a === undefined ? INK_A : a);
    },

    //  다각형 채우기 + 윤곽. pts 는 [x,y,x,y,…] 정규화 좌표. lw:0 이면 윤곽 없음.
    poly: function (g, pts, cx, cy, h, hex, lw) {
      var i;
      V.fill(g, hex);
      g.beginPath();
      g.moveTo(cx + pts[0] * h, cy + pts[1] * h);
      for (i = 2; i < pts.length; i += 2) g.lineTo(cx + pts[i] * h, cy + pts[i + 1] * h);
      g.closePath();
      g.fillPath();
      if (lw !== 0) { V.line(g, lw || Math.max(1.5, h * 0.10)); g.strokePath(); }
    },

    //  열린 선 — 속도선·균열·사슬용.
    stroke: function (g, pts, cx, cy, h, hex, lw, a) {
      var i;
      V.line(g, lw, hex, a);
      g.beginPath();
      g.moveTo(cx + pts[0] * h, cy + pts[1] * h);
      for (i = 2; i < pts.length; i += 2) g.lineTo(cx + pts[i] * h, cy + pts[i + 1] * h);
      g.strokePath();
    },

    disc: function (g, cx, cy, r, hex, lw) {
      V.fill(g, hex); g.fillCircle(cx, cy, r);
      if (lw !== 0) { V.line(g, lw || Math.max(1.4, r * 0.22)); g.strokeCircle(cx, cy, r); }
    },

    //  호 — 열린 곡선(고리·음파·덫의 턱).
    arc: function (g, cx, cy, r, a0, a1, hex, lw, a) {
      V.line(g, lw, hex, a);
      g.beginPath();
      g.arc(cx, cy, r, a0, a1, false);
      g.strokePath();
    },

    //  화살촉 — 방향 u(단위벡터)를 향해. 여러 아이콘이 공유한다.
    head: function (g, cx, cy, h, ux, uy, len, wide, hex) {
      var px = -uy, py = ux;
      V.poly(g, [ux * len, uy * len,
                 ux * (len - wide) + px * wide * 0.86, uy * (len - wide) + py * wide * 0.86,
                 ux * (len - wide) - px * wide * 0.86, uy * (len - wide) - py * wide * 0.86],
        cx, cy, h, hex, 0);
    }
  };

  G.VecIcon = V;
})();
