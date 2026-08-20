window.GAME = window.GAME || {};

// ============================================================================
//  Egg War — 스킬 이펙트 A/B 시안  (렌더 전용)
// ============================================================================
//  9가지 스킬 타입(dash·aoeSelf·aoeTarget·projectile·strike·buff·pull·aura·trap)
//  각각에 대해 두 가지 시안을 담는다. `GAME.SkillFX.variant = 'A' | 'B'` 로 런타임 전환.
//
//  ✅ **A 로 확정됐다** (2026-07-30, 사용자 결정). 기본값이 A 이므로 코드 변경은 없다.
//     B 는 지우지 않고 남긴다 — 나중에 이펙트를 손볼 때 '전에 비교했던 다른 안'이
//     같은 파일에 있어야 되돌아가 볼 수 있다. 게임 안에 B 로 바꾸는 UI 는 없다
//     (콘솔에서 `GAME.SkillFX.setVariant('B')` 뿐) → 플레이어에게 노출되지 않는다.
//     ⚠ 다시 물어보지 말 것. 이미 정해졌다.
//
//  ── A / B 를 가른 축 ─────────────────────────────────────────────────────
//   A안 = **재료(材)**. 흙·돌·뼈·나무·밧줄·깃털·조개 같은 **물건이 튀고 쌓이고 끌려온다.**
//         범위는 그 물건이 깔린 자리로 읽힌다. 색은 중립 재질색(MAT)이 주역이고
//         진영색은 얇은 보조선으로만 남는다.
//   B안 = **동작(動)**. 선과 궤적. **힘이 어디로 향하는지**를 테이퍼 리본·쐐기·수축하는
//         호로 보여준다. 범위는 테두리가 전담하고, 색은 진영색(controller/strategist)이 주역.
//
//  ── 왜 이 축인가 ────────────────────────────────────────────────────────
//  이 게임의 규칙은 "논타겟은 피할 수 있다"다. 그래서 이펙트의 본업은 화려함이 아니라
//  **범위와 타이밍을 한눈에 보여주는 것**이다. 두 안 모두 그 의무를 지키되,
//  A 는 '무엇이 날아왔나'(세계관 재료)로, B 는 '어디로 밀리나'(힘의 방향)로 말한다.
//  마법 광선·네온·홀로그램은 이 세계에 없다 — 원시 부족 전쟁이고 12세 이용가다.
//
//  ── 지켜야 하는 규율 ────────────────────────────────────────────────────
//   1) **Text 를 만들지 않는다.** 전부 Graphics 도형이다. (피해 숫자 재래스터로 프레임이
//      떨어졌던 사고를 되풀이하지 않는다 — 22.8 → 9.8회/프레임으로 고친 직후다.)
//   2) **fillEllipse / strokeEllipse 에 분할 수(smoothness)를 반드시 넘긴다.**
//      Phaser 기본값은 32분할이라 지름 20px 짜리 물건이 32각형 경로가 된다.
//      `js/coin.js` 가 같은 이유로 8~10 을 쓴다. 여기서는 반지름에 비례해 8~20 으로 잡는다.
//   3) 색은 **테마 토큰만** 쓴다 — `GAME.UI.FX` / `GAME.UI.MAT` / `GAME.CONFIG.COLORS`.
//      라이트 테마(크림 목장)는 이 표를 통째로 갈아끼우므로 여기서 색을 박으면 증발한다.
//   4) **흑백으로도 범위가 읽혀야 한다.** 그래서 모든 범위는 (a) 테두리 (b) 잉크 윤곽
//      (c) 경계 위의 물건 — 셋 중 둘 이상으로 표시한다. 색은 마지막 신호다.
//   5) **판정·좌표·밸런스에 손대지 않는다.** 이 파일은 state 를 읽기만 한다.
//      같은 state · 같은 t 면 같은 그림이다(순수 함수).
//
//  ── battle.js 와의 계약 ─────────────────────────────────────────────────
//   battle.js 의 draw() 는 네 곳에서 이 파일에 위임한다:
//     traps 루프 · effects 루프 · hero.auras 루프 · projectiles 루프
//   전부 "`true` 를 돌려준 것만 건너뛴다" 규칙이라, 이 파일이 없거나 꺼져 있으면
//   (또는 모르는 kind 를 만나면) **예전 그림이 그대로** 돈다. 회귀 위험 0 이 목표다.
// ============================================================================

(function () {

  var STORE_KEY = 'eggwar.fx.variant';

  // 프레임 단위로 캐시하는 렌더 컨텍스트. 매 도형마다 GAME.UI.FX 를 다시 뒤지지 않는다.
  var S = {
    g: null, FX: null, MAT: null, C: null,
    RA: 1, FA: 1, INK: 0x0b0b12, INKA: 0, T: 1, t: 0, B: false
  };

  // ── 저수준 도구 ───────────────────────────────────────────────────────
  function syy(wy) { return GAME.Iso.toScreenY(wy); }

  // 분할 수. 반지름 20px 짜리 링에 32분할은 낭비고, 반지름 190 짜리 오라에 8분할은 각진다.
  function sm(r) { var n = (r * 0.42) | 0; return n < 8 ? 8 : (n > 20 ? 20 : n); }

  // 지면에 눕힌 원 — 채움
  function gfill(x, wy, r, col, a) {
    if (a <= 0.004 || r <= 0) return;
    S.g.fillStyle(col, a > 1 ? 1 : a);
    S.g.fillEllipse(x, syy(wy), r * 2, r * 2 * S.T, sm(r));
  }
  // 지면에 눕힌 원 — 테두리
  function gline(x, wy, r, w, col, a) {
    if (a <= 0.004 || r <= 0) return;
    S.g.lineStyle(w, col, a > 1 ? 1 : a);
    S.g.strokeEllipse(x, syy(wy), r * 2, r * 2 * S.T, sm(r));
  }
  // 잉크 윤곽을 두른 지면 링. 라이트 테마에서 형태를 붙잡는 건 이 검은 선이다.
  function gink(x, wy, r, w, col, a) {
    if (S.INKA > 0) gline(x, wy, r, w + 2.5, S.INK, a * S.INKA);
    gline(x, wy, r, w, col, a);
  }
  // 공중에 뜬 링(화면 좌표 기준, 지면과 같은 납작함을 유지한다)
  function airRing(sx, sy, r, w, col, a) {
    if (a <= 0.004 || r <= 0) return;
    S.g.lineStyle(w, col, a > 1 ? 1 : a);
    S.g.strokeEllipse(sx, sy, r * 2, r * 2 * S.T, sm(r));
  }
  // 튄 조각 하나 (화면 좌표). 잉크 테두리를 먼저 깔아 밝은 배경에서도 실루엣이 남는다.
  function shard(sx, sy, r, col, a) {
    if (a <= 0.004) return;
    if (S.INKA > 0) { S.g.fillStyle(S.INK, a * 0.75 * S.INKA); S.g.fillCircle(sx, sy, r + 1.2); }
    S.g.fillStyle(col, a > 1 ? 1 : a); S.g.fillCircle(sx, sy, r);
  }
  // 힘의 방향을 가리키는 쐐기 (화면 좌표, ang 은 화면 각도)
  function wedge(sx, sy, ang, len, wid, col, a) {
    if (a <= 0.004) return;
    var cx = Math.cos(ang), cy = Math.sin(ang);
    var tx = sx + cx * len, ty = sy + cy * len;
    var b1x = sx - cy * wid, b1y = sy + cx * wid;
    var b2x = sx + cy * wid, b2y = sy - cx * wid;
    if (S.INKA > 0) {
      S.g.fillStyle(S.INK, a * 0.55 * S.INKA);
      S.g.fillTriangle(b1x - cx * 2, b1y - cy * 2, b2x - cx * 2, b2y - cy * 2, tx + cx * 2, ty + cy * 2);
    }
    S.g.fillStyle(col, a > 1 ? 1 : a);
    S.g.fillTriangle(b1x, b1y, b2x, b2y, tx, ty);
  }
  // 시작이 얇고 끝이 굵은 리본 (화면 좌표) — '가속해서 지나갔다'가 읽힌다
  function ribbon(x1, y1, x2, y2, w0, w1, col, a) {
    if (a <= 0.004) return;
    var dx = x2 - x1, dy = y2 - y1;
    var d = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = -dy / d, ny = dx / d;
    S.g.fillStyle(col, a > 1 ? 1 : a);
    S.g.fillTriangle(x1 + nx * w0, y1 + ny * w0, x1 - nx * w0, y1 - ny * w0, x2 + nx * w1, y2 + ny * w1);
    S.g.fillTriangle(x1 - nx * w0, y1 - ny * w0, x2 - nx * w1, y2 - ny * w1, x2 + nx * w1, y2 + ny * w1);
  }
  // 지면에 눕힌 호 — transform 으로 y 를 눌러 '판정(평면 원)과 그림'을 일치시킨다.
  function groundArc(x, wy, r, a0, a1, w, col, alpha) {
    if (alpha <= 0.004) return;
    var g = S.g;
    g.save();
    g.translateCanvas(x, syy(wy));
    g.scaleCanvas(1, S.T);
    g.lineStyle(w / S.T, col, alpha > 1 ? 1 : alpha);
    g.beginPath(); g.arc(0, 0, r, a0, a1, false); g.strokePath();
    g.restore();
  }
  function groundSlice(x, wy, r, a0, a1, col, alpha) {
    if (alpha <= 0.004) return;
    var g = S.g;
    g.save();
    g.translateCanvas(x, syy(wy));
    g.scaleCanvas(1, S.T);
    g.fillStyle(col, alpha > 1 ? 1 : alpha);
    g.slice(0, 0, r, a0, a1, false); g.fillPath();
    g.restore();
  }
  // 좌표에서 뽑는 고정 난수 — 같은 이펙트는 언제 그려도 같은 모양이다
  function seedOf(x, y) { return ((x * 7.31 + y * 13.07) % 6.2832); }

  // ── 재료 A 안의 공통 부품 ─────────────────────────────────────────────
  // 흙먼지 한 덩이. 두 겹으로 겹쳐 뭉게뭉게 보이게 하되 도형은 2개로 끝낸다.
  function dust(x, wy, r, a) {
    var M = S.MAT;
    gfill(x, wy, r, M.clay, 0.42 * a * S.FA);
    gfill(x - r * 0.22, wy - r * 0.18, r * 0.60, M.clay, 0.34 * a * S.FA);
  }

  // ── 백열 코어 (2026-08-04 아트 개편) ─────────────────────────────────
  //  레퍼런스의 타격은 **3층**이다: 어두운 윤곽 / 색 덩어리 / 흰 코어.
  //  우리는 2층(잉크 윤곽 + 채움)이었고, 흰 코어가 sparkCore·lobCore·projCore
  //  세 군데에만 있었다. 이 헬퍼를 한 곳에 두고 여러 이펙트가 같이 부른다 —
  //  나중에 톤을 바꿀 때 한 줄이면 된다.
  //
  //  ⚠ **A안(재료)을 깨지 않는다.** 빛나는 것은 마법이 아니라 **부딪힌 순간의 백열**
  //    이다. 이 세계에 네온도 마법진도 없다.
  //  ⚠ 코어는 **네 번째 신호**다. 흑백으로도 범위가 읽혀야 한다는 규율은 그대로다 —
  //    테두리·잉크·경계 위 물건 중 둘 이상은 코어와 무관하게 계속 남는다.
  //  ⚠ 영웅별로 코어 색을 미세하게 달리한다. 같은 흰색 셋보다 캐릭터가 산다.
  function core(x, wy, r, a, heroKey) {
    var col = S.FX.sparkCore;
    if (heroKey === 'vanguard') col = 0xfff0c0;        // 불
    else if (heroKey === 'ranger') col = 0xe8fffb;     // 바람
    else if (heroKey === 'warden') col = 0xfff6d0;     // 대지
    gfill(x, wy, r * 0.34, col, 0.9 * a * S.FA);
    gfill(x, wy, r * 0.17, 0xffffff, 0.75 * a * S.FA);
  }

  // ── 초승달 참격 (2026-08-04) ─────────────────────────────────────────
  //  근접 타격이 `wedge`(쐐기)로만 표현돼 "베었다"가 아니라 "찔렀다"로 읽혔다.
  //  두 호의 차집합으로 초승달을 만든다 — 레퍼런스 ③④의 굵은 참격이 이것이다.
  //
  //  ⚠ 각도가 **휘두른 방향으로 흐른다**(spin). 정지한 호는 붙여넣기처럼 보인다.
  //  ⚠ 안쪽을 배경색이 아니라 **지우기**로 파낼 수 없으므로(Graphics 에 destination-out
  //    이 없다) 바깥 호를 채우고 안쪽 호를 **한 번 더 채워 덮는** 방식이 아니라,
  //    호를 여러 갈래로 잘라 그리는 방식을 쓴다 — 배경이 무엇이든 안전하다.
  function crescent(x, wy, ang, r, a, heroKey) {
    var g = S.g, i, n = 12;
    var half = 1.15 / 2;                       // 각폭 1.15 rad
    var spin = (1 - a) * 0.21;                 // 휘두른 방향으로 12° 흐른다
    var rOut = r, rIn = r * 0.62;
    var pts = [];
    for (i = 0; i <= n; i++) {
      var t = ang - half + spin + (2 * half) * (i / n);
      pts.push({ x: x + Math.cos(t) * rOut, y: syy(wy) + Math.sin(t) * rOut * S.T });
    }
    for (i = n; i >= 0; i--) {
      var t2 = ang - half + spin + (2 * half) * (i / n);
      pts.push({ x: x + Math.cos(t2) * rIn, y: syy(wy) + Math.sin(t2) * rIn * S.T });
    }
    //  ① 잉크 윤곽 — 흑백으로도 읽히는 층
    g.lineStyle(Math.max(1.6, r * 0.045), S.FX.ink, 0.55 * a * S.FA);
    g.strokePoints(pts, true, true);
    //  ② 색 덩어리
    g.fillStyle(S.FX.blast, 0.42 * a * S.FA);
    g.fillPoints(pts, true);
    //  ③ 안쪽 가장자리의 백열 — 날이 지나간 자리
    var cc = S.FX.sparkCore;
    if (heroKey === 'vanguard') cc = 0xfff0c0;
    else if (heroKey === 'warden') cc = 0xfff6d0;
    g.lineStyle(Math.max(1.4, r * 0.032), cc, 0.85 * a * S.FA);
    var inner = [];
    for (i = 0; i <= n; i++) {
      var t3 = ang - half + spin + (2 * half) * (i / n);
      inner.push({ x: x + Math.cos(t3) * rIn * 1.03, y: syy(wy) + Math.sin(t3) * rIn * 1.03 * S.T });
    }
    g.strokePoints(inner, false, false);
  }

  // ========================================================================
  //  1. dash — 박치기 / 대검 돌진 / 구르기 / 도약 / 돌진 / 뒷걸음 사격
  //     effect: dashTrail (x1,y1 → x2,y2)
  // ========================================================================
  function dashA(e, col) {
    var a = e.t / e.total, p = 1 - a;
    var M = S.MAT, sd = seedOf(e.x1, e.y1);
    var dx = e.x2 - e.x1, dy = e.y2 - e.y1;

    // 경로에 남은 먼지 — 출발 쪽이 크고 오래 남는다("여기서 튀어나갔다")
    for (var k = 0; k < 5; k++) {
      var f = k / 4;
      var jx = Math.cos(sd + k * 2.1) * 6, jy = Math.sin(sd + k * 2.1) * 4;
      dust(e.x1 + dx * f + jx, e.y1 + dy * f + jy,
        11 + (1 - f) * 13 + p * 11, a * (0.55 + 0.45 * (1 - f)));
    }
    // 출발 자국 · 도착 자국 — 두 개의 링이 '거리'를 말한다
    gink(e.x1, e.y1, 14 + p * 20, 2.5, M.clay, a * 0.75 * S.RA);
    gink(e.x2, e.y2, 9 + p * 15, 3, M.clay, a * 0.95 * S.RA);
    // 경로 뒤로 흩날리는 흙덩이 — 어느 쪽에서 어느 쪽으로 갔는지가 물건으로 읽힌다
    var pl = Math.sqrt(dx * dx + dy * dy) || 1;
    var pux = dx / pl, puy = dy / pl;
    for (var q = 0; q < 4; q++) {
      var qf = 0.15 + q * 0.22;
      var qs = Math.sin(sd + q * 2.4);
      var qx = e.x1 + dx * qf - pux * p * 26 + qs * 13;
      var qy = e.y1 + dy * qf - puy * p * 26 + Math.cos(sd + q * 2.4) * 8;
      shard(qx, syy(qy) - 6 - p * 10, 2.2 + a * 2.2, M.clay, a * 0.9);
    }
    // 도착점에서 튀는 흙덩이
    var by = syy(e.y2);
    for (var n = 0; n < 5; n++) {
      var ang = sd + n * 1.2566, d = 9 + p * 24;
      shard(e.x2 + Math.cos(ang) * d, by + Math.sin(ang) * d * S.T - p * 7,
        1.4 + 2.2 * a, M.clay, a * 0.95);
    }
    //  ⚠ 2026-08-01 — 예전엔 여기서 **알파 0.40 짜리 실선 하나**가 전부였다.
    //    "재료 안에서는 색이 조연"이라는 원칙은 맞지만, 조연이 아예 안 보이면
    //    세 영웅의 돌진이 전부 같은 흙먼지로만 읽힌다(찍어서 확인).
    //    재료(흙·먼지)는 그대로 두고 **궤적과 도착 섬광**만 영웅 색이 맡는다.
    var gy1 = syy(e.y1) - 12, gy2 = syy(e.y2) - 12;
    S.g.lineStyle(6, col, a * 0.30 * S.RA);
    S.g.lineBetween(e.x1, gy1, e.x2, gy2);
    S.g.lineStyle(2.5, col, a * 0.85 * S.RA);
    S.g.lineBetween(e.x1, gy1, e.x2, gy2);
    // 도착 순간의 섬광 — '여기 꽂혔다'
    var dburst = Math.max(0, 1 - p / 0.45);
    if (dburst > 0) {
      gfill(e.x2, e.y2, 14 + p * 40, col, 0.34 * dburst * dburst * S.FA);
      gink(e.x2, e.y2, 16 + p * 38, 2.5 + 3 * dburst, col, 0.95 * dburst * S.RA);
    }
  }

  function dashB(e, col) {
    var a = e.t / e.total;
    var y1 = syy(e.y1) - 14, y2 = syy(e.y2) - 14;
    var ang = Math.atan2(y2 - y1, e.x2 - e.x1);
    // 테이퍼 리본 — 출발은 실처럼 얇고 도착에서 굵어진다. 방향이 그 자체로 읽힌다.
    if (S.INKA > 0) ribbon(e.x1, y1, e.x2, y2, 2.5, 10, S.INK, a * 0.35 * S.INKA);
    ribbon(e.x1, y1, e.x2, y2, 1.5, 7.5, col, a * 0.80);
    // 속도선 3줄 — 뒤쪽 절반에서만 나와 잔상처럼 흩어진다
    var nx = -Math.sin(ang), ny = Math.cos(ang);
    for (var k = -1; k <= 1; k++) {
      if (k === 0) continue;
      var off = k * 8.5;
      S.g.lineStyle(2, col, a * 0.45);
      S.g.lineBetween(e.x1 + (e.x2 - e.x1) * 0.18 + nx * off * 0.4, y1 + (y2 - y1) * 0.18 + ny * off * 0.4,
        e.x1 + (e.x2 - e.x1) * 0.80 + nx * off, y1 + (y2 - y1) * 0.80 + ny * off);
    }
    // 심지 — 아주 얇게만. 두껍게 넣으면 진영색이 씻겨 회색 막대가 된다.
    S.g.lineStyle(1.5, S.FX.projCore, a * 0.55);
    S.g.lineBetween(e.x1, y1 - 2, e.x2, y2 - 2);
    // 도착 쐐기 — 힘이 멈춘 자리
    wedge(e.x2, y2, ang, 17, 9, col, a * 0.95);
  }

  // ========================================================================
  //  2. aoeSelf — 대검 회전 / 모래 뿌리기 / 바위 내리치기 / 방패 밀치기 / 대지 강타
  //     effect: ring (total 320).  radius 80~165 로 크게 갈린다.
  // ========================================================================
  //  ⚠ 2026-08-01 — **영웅 색을 주인공으로 올렸다**(사용자: "각 영웅에 맞는 컨셉").
  //    예전엔 링을 흙색(clay)으로만 그리고 `col` 은 발밑 선에만 썼다. 그 결과
  //    세 영웅의 스킬이 화면에서 **완전히 똑같아 보였다**(나란히 찍어 확인).
  //    무기 실루엣은 다른데 스킬이 같으면 캐릭터가 절반만 서 있는 셈이다.
  //    흙은 '땅이 파였다'는 바닥으로 남기고, **테두리와 섬광이 영웅 색**을 맡는다.
  //  ⚠ 그리고 임팩트를 넣었다 — 터지는 순간(수명의 앞 30%)에 밝은 속심이 확 퍼진다.
  //    예전엔 처음부터 끝까지 같은 밝기라 "터졌다"가 아니라 "원이 있다"로 보였다.
  function aoeSelfA(e, col) {
    var a = e.t / e.total, p = 1 - a;
    var M = S.MAT, r = e.r * (1 + p * 0.10);
    // 바닥 — 흙이 파인 자리. 세계관(원시 부족)의 재질은 여기가 지킨다.
    gfill(e.x, e.y, r, M.clay, 0.13 * a * S.FA);
    // 터지는 순간의 섬광 — 앞 30% 동안만, 안쪽에서 바깥으로.
    //  ⚠ 구간을 0.30 → 0.55 로 늘렸다. 320ms 짜리 이펙트에서 30% 는 **96ms** 라
    //    프레임 두세 장이고, 실제로 찍어 보니 섬광이 이미 사라진 뒤였다.
    //    '터졌다'가 읽히려면 사람 눈이 붙잡을 시간이 있어야 한다.
    var burst = Math.max(0, 1 - p / 0.55);
    if (burst > 0) {
      var bb = burst * burst;
      gfill(e.x, e.y, r * (0.26 + p * 1.9), col, 0.42 * bb * S.FA);
      gink(e.x, e.y, r * (0.30 + p * 1.7), 3 + 5 * burst, col, 1.0 * burst * S.RA);
      //  ── 초승달 참격 (2026-08-04) ────────────────────────────────────────
      //  자기중심 광역기는 "휘둘렀다"인데 원만 그리면 "있다"로 보인다. 두 갈래
      //  호로 베인 자리를 남긴다 — 레퍼런스 ③④의 굵은 참격이 이것이다.
      //  ⚠ 각도는 **좌표에서 뽑은 고정 난수**다. 매 프레임 다시 굴리면 참격이
      //    빙글빙글 돌아 어지럽다(이 파일의 `seedOf` 규율).
      var ca = seedOf(e.x, e.y);
      crescent(e.x, e.y, ca, r * 1.02, burst, e.heroKey);
      crescent(e.x, e.y, ca + Math.PI, r * 0.88, burst * 0.75, e.heroKey);
      //  터진 자리의 백열 — 3층 구조의 마지막 층
      core(e.x, e.y, r * 0.9, bb, e.heroKey);
      // 밖으로 뻗는 살 — 원만 있으면 '퍼졌다'가 아니라 '있다'로 보인다
      var sd0 = seedOf(e.x, e.y), cy0 = syy(e.y);
      for (var q = 0; q < 8; q++) {
        var aq = sd0 + (Math.PI * 2 / 8) * q;
        var r0 = r * 0.30, r1 = r * (0.55 + p * 1.5);
        S.g.lineStyle(2.5 + 2 * burst, col, 0.85 * burst * S.RA);
        S.g.beginPath();
        S.g.moveTo(e.x + Math.cos(aq) * r0, cy0 + Math.sin(aq) * r0 * S.T);
        S.g.lineTo(e.x + Math.cos(aq) * r1, cy0 + Math.sin(aq) * r1 * S.T);
        S.g.strokePath();
      }
    }
    // 경계 — 영웅 색으로, 예전보다 굵게. 안쪽에 흙 테두리를 겹쳐 두께를 만든다.
    gink(e.x, e.y, r, 4.5, col, a * S.RA);
    gink(e.x, e.y, r * 0.94, 2, M.clay, a * 0.7 * S.RA);
    // 경계 밖으로 튀는 흙덩이 — 개수를 반지름에 맞춘다(작은 스킬에 16개는 과하다)
    var n = Math.round(r / 11); if (n < 8) n = 8; if (n > 16) n = 16;
    var sd = seedOf(e.x, e.y), cy = syy(e.y);
    for (var k = 0; k < n; k++) {
      var ang = sd + (Math.PI * 2 / n) * k;
      var d = r * (0.97 + p * 0.20);
      // 절반은 영웅 색으로 튄다 — 흙만이면 색이 테두리에만 갇힌다.
      shard(e.x + Math.cos(ang) * d, cy + Math.sin(ang) * d * S.T - p * 8,
        1.8 + r * 0.030 * a, (k % 2) ? col : M.clay, a * 0.95);
    }
    // 시전자 발밑 — 누구의 범위인지
    gline(e.x, e.y, r * 0.30, 2.5, col, a * 0.65 * S.RA);
  }

  function aoeSelfB(e, col) {
    var a = e.t / e.total, p = 1 - a;
    var r = e.r * (1 + p * 0.12);
    gfill(e.x, e.y, r, col, 0.09 * a * S.FA);
    gink(e.x, e.y, r, 3.5, col, a * S.RA);
    // 밖으로 쓸려나가는 호 3개 — '회전해서 밀어냈다'가 읽힌다
    var base = seedOf(e.x, e.y) + p * 1.1;
    for (var k = 0; k < 3; k++) {
      var a0 = base + (Math.PI * 2 / 3) * k;
      groundArc(e.x, e.y, r * 0.74, a0, a0 + 0.78, 3.5, col, a * 0.85);
    }
    // 짧은 방사선 — 정지 화면에서도 방향이 남는다
    var cy = syy(e.y);
    S.g.lineStyle(2, col, a * 0.55);
    for (var n = 0; n < 6; n++) {
      var ang = base + (Math.PI * 2 / 6) * n + 0.4;
      var c = Math.cos(ang), s2 = Math.sin(ang) * S.T;
      S.g.lineBetween(e.x + c * r * 0.98, cy + s2 * r * 0.98,
        e.x + c * r * 1.14, cy + s2 * r * 1.14);
    }
    // 안쪽에서 수축하는 링 — 시전자 위치가 중심임을 붙잡는다
    gline(e.x, e.y, e.r * (0.22 + a * 0.42), 2.5, col, a * 0.7 * S.RA);
  }

  // ========================================================================
  //  3. aoeTarget — 낙석 유도 / 불화살 / 화살비 / 폭풍 화살
  //     effect: telegraph(예고) → blast(착탄).  이 게임에서 **가장 중요한 이펙트**다.
  //     "논타겟은 피할 수 있다"는 약속이 여기서 지켜진다 — 범위와 남은 시간이 전부다.
  // ========================================================================
  function telegraphA(e) {
    var prog = 1 - e.t / e.total; if (prog < 0) prog = 0;
    var M = S.MAT, FX = S.FX;
    //  급(grade 1~5, combat 이 스킬 가격에서 태깅) — **반경은 절대 안 건드린다**
    //  (예고 반경 = 판정 약속). 굵기·조임돌 수만 급을 따라간다(2026-08-20 급 축).
    var gm = 1 + ((e.grade || 1) - 1) * 0.14;
    // 그림자가 짙어진다 — 위에서 뭔가 떨어지고 있다
    gfill(e.x, e.y, e.r, S.INKA > 0 ? S.INK : 0x000000, (0.05 + prog * 0.15) * S.FA);
    gink(e.x, e.y, e.r, 2.5 * gm, FX.telegraph, (0.45 + prog * 0.55) * S.RA);
    // **돌이 바깥에서 중심으로 조여든다.** 시계가 아니라 물건이 시간을 센다 —
    // 조각이 가운데 모이는 순간 터진다는 게 설명 없이 읽힌다.
    var n = 8 + ((e.grade || 1) >= 4 ? 4 : (e.grade || 1) >= 3 ? 2 : 0);
    var sd = seedOf(e.x, e.y), cy = syy(e.y);
    for (var k = 0; k < n; k++) {
      var ang = sd + (Math.PI * 2 / n) * k;
      var d = e.r * (1.30 - prog * 1.10);
      shard(e.x + Math.cos(ang) * d, cy + Math.sin(ang) * d * S.T - (1 - prog) * 9,
        2.2 + prog * 1.6, M.stone, 0.55 + prog * 0.45);
    }
    // 착탄점 표식
    if (prog > 0.5) {
      var c = (prog - 0.5) * 2;
      S.g.lineStyle(3, FX.telegraph, c);
      S.g.lineBetween(e.x - 7, cy, e.x + 7, cy);
      S.g.lineBetween(e.x, cy - 7 * S.T, e.x, cy + 7 * S.T);
    }
  }

  function telegraphB(e) {
    var prog = 1 - e.t / e.total; if (prog < 0) prog = 0;
    var FX = S.FX;
    gfill(e.x, e.y, e.r, FX.telegraph, (0.06 + prog * 0.09) * S.FA);
    // **파이 게이지가 시계방향으로 차오른다.** 남은 시간이 각도로 그대로 보인다.
    groundSlice(e.x, e.y, e.r * 0.97, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2,
      FX.telegraph, 0.26 * S.FA);
    gink(e.x, e.y, e.r, 2.5, FX.telegraph, (0.5 + prog * 0.5) * S.RA);
    // 조준 십자 — 중심이 어디인지
    var cy = syy(e.y);
    S.g.lineStyle(2, FX.telegraph, 0.45 + prog * 0.45);
    S.g.lineBetween(e.x - e.r * 0.30, cy, e.x - e.r * 0.10, cy);
    S.g.lineBetween(e.x + e.r * 0.10, cy, e.x + e.r * 0.30, cy);
    S.g.lineBetween(e.x, cy - e.r * 0.30 * S.T, e.x, cy - e.r * 0.10 * S.T);
    S.g.lineBetween(e.x, cy + e.r * 0.10 * S.T, e.x, cy + e.r * 0.30 * S.T);
    // 마지막 28% — 테두리에 눈금이 돋는다(초읽기)
    if (prog > 0.72) {
      var tk = (prog - 0.72) / 0.28;
      S.g.lineStyle(3, FX.telegraph, tk);
      for (var n = 0; n < 8; n++) {
        var ang = (Math.PI * 2 / 8) * n;
        var c = Math.cos(ang), s2 = Math.sin(ang) * S.T;
        S.g.lineBetween(e.x + c * e.r, cy + s2 * e.r,
          e.x + c * e.r * (1 + 0.20 * tk), cy + s2 * e.r * (1 + 0.20 * tk));
      }
    }
  }

  //  ⚠ `col` 을 받게 바꿨다(2026-08-01). 예전엔 인자가 없어서 착탄 폭발이 언제나
  //    같은 노란색이었다 — 누가 쏜 폭격인지 화면에서 알 수 없었다.
  function blastA(e, col) {
    var b = e.t / e.total, p = 1 - b;
    var M = S.MAT, FX = S.FX;
    var r = e.r * (1 + p * 0.20);
    var BC = col || FX.blast;
    var gm = 1 + ((e.grade || 1) - 1) * 0.14;   // 급 — 굵기·튀는 돌 수만(반경 불변)
    // 파헤쳐진 흙
    gfill(e.x, e.y, r * 0.92, M.clay, (0.30 * b) * S.FA);
    // 터지는 순간 — 안에서 밖으로 확 퍼진다
    var bburst = Math.max(0, 1 - p / 0.50);
    if (bburst > 0) {
      gfill(e.x, e.y, r * (0.35 + p * 1.6), BC, 0.40 * bburst * bburst * S.FA);
      gink(e.x, e.y, r * (0.40 + p * 1.4), (3 + 4 * bburst) * gm, BC, bburst * S.RA);
      //  백열 코어 — 3층 구조의 마지막 층(2026-08-04). 착탄 순간에만 짧게.
      core(e.x, e.y, r * 0.85, bburst * bburst, e.heroKey);
    }
    gink(e.x, e.y, r, 4 * gm, BC, b * 1.05 * S.RA);
    // 흙기둥 — 지면에서 위로 솟는다. 착탄이 '아래에서 위로' 읽힌다.
    var cy = syy(e.y), h = r * (0.55 + p * 0.55);
    S.g.fillStyle(M.clay, 0.55 * b);
    S.g.fillEllipse(e.x, cy - h * 0.45, r * 0.50, h, 10);
    S.g.fillStyle(M.clay, 0.35 * b);
    S.g.fillEllipse(e.x, cy - h * 0.85, r * 0.32, h * 0.5, 8);
    // 사방으로 튀는 흙·돌
    var sd = seedOf(e.x, e.y);
    var bn = 7 + ((e.grade || 1) >= 4 ? 4 : (e.grade || 1) >= 3 ? 2 : 0);
    for (var k = 0; k < bn; k++) {
      var ang = sd + (Math.PI * 2 / bn) * k;
      var d = r * (0.55 + p * 0.75);
      shard(e.x + Math.cos(ang) * d, cy + Math.sin(ang) * d * S.T - p * r * 0.5,
        1.6 + r * 0.035 * b, k % 2 ? M.stone : M.clay, b * 0.95);
    }
  }

  function blastB(e) {
    var b = e.t / e.total, p = 1 - b;
    var FX = S.FX;
    var r = e.r * (1 + p * 0.26);
    gfill(e.x, e.y, r * 0.85, FX.blast, (0.24 * b) * S.FA);
    gfill(e.x, e.y, r * 0.30 * b, FX.sparkCore, 0.6 * b * b);
    // 확장 이중 고리 — 면이 아니라 고리가 주역이다(큰 원을 칠하면 웅덩이가 생긴다)
    gink(e.x, e.y, r, 4, FX.blast, b * 1.1 * S.RA);
    gline(e.x, e.y, r * 0.60, 2, FX.blast, b * 0.55 * S.RA);
    // 방사 쐐기 6개 — 터진 방향이 정지 화면에도 남는다
    var cy = syy(e.y), sd = seedOf(e.x, e.y);
    for (var k = 0; k < 6; k++) {
      var ang = sd + (Math.PI * 2 / 6) * k;
      var c = Math.cos(ang), s2 = Math.sin(ang) * S.T;
      var sa = Math.atan2(s2, c);
      wedge(e.x + c * r * 1.02, cy + s2 * r * 1.02, sa, r * (0.14 + p * 0.20), 3.5, FX.blast, b * 0.85);
    }
  }

  // ========================================================================
  //  4. projectile — 관통 화살 / 연사 / 일격 화살
  //     비행체는 s.projectiles 의 `big:true` 만(=스킬 투사체) 가져간다.
  //     유닛 평타 투사체는 건드리지 않는다 — 스킬 이펙트 작업이다.
  //     명중 순간은 effects 의 spark 가 담당한다.
  // ========================================================================
  function projA(p, pcol) {
    var M = S.MAT;
    var sx = p.x, sy = syy(p.y) - 12;
    var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1;
    var ux = p.vx / sp, uy = (p.vy / sp) * S.T;
    var ang = Math.atan2(uy, ux);
    var rr = p.radius * 1.5;
    // 지면 그림자 — 날아가는 물건이라는 게 읽힌다
    S.g.fillStyle(S.INKA > 0 ? S.INK : 0x000000, 0.16);
    S.g.fillEllipse(sx, sy + 12, rr * 2.2, rr * 2.2 * S.T, 8);
    // **나무 화살대 + 뼈 촉 + 깃.** 이 세계의 원거리 무기는 활이다.
    var L = 15 + rr * 1.6;
    S.g.lineStyle(3.5, M.woodDark, 0.95);
    S.g.lineBetween(sx - ux * L, sy - uy * L, sx + ux * rr * 0.6, sy + uy * rr * 0.6);
    // 깃 — 뒤쪽에 두 갈래
    var nx = -Math.sin(ang), ny = Math.cos(ang);
    S.g.lineStyle(2.5, M.feather, 0.95);
    for (var k = -1; k <= 1; k += 2) {
      S.g.lineBetween(sx - ux * (L - 9), sy - uy * (L - 9),
        sx - ux * (L + 2) + nx * k * 5.5, sy - uy * (L + 2) + ny * k * 5.5);
    }
    // 촉
    wedge(sx + ux * rr * 0.5, sy + uy * rr * 0.5, ang, 8 + rr * 0.5, 3 + rr * 0.22, M.bone, 1);
    // 관통탄은 진영색 실선이 하나 더 붙어 '뚫고 지나간다'가 남는다
    if (p.pierce) {
      S.g.lineStyle(5, pcol, 0.28);
      S.g.lineBetween(sx - ux * (L + 22), sy - uy * (L + 22), sx - ux * L, sy - uy * L);
      S.g.lineStyle(2, pcol, 0.85);
      S.g.lineBetween(sx - ux * (L + 18), sy - uy * (L + 18), sx - ux * L, sy - uy * L);
    }
  }

  function projB(p, pcol) {
    var sx = p.x, sy = syy(p.y) - 12;
    var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1;
    var ux = p.vx / sp, uy = (p.vy / sp) * S.T;
    var ang = Math.atan2(uy, ux);
    var rr = p.radius * 1.5;
    var tail = p.pierce ? 76 : 46;
    S.g.fillStyle(S.INKA > 0 ? S.INK : 0x000000, 0.16);
    S.g.fillEllipse(sx, sy + 12, rr * 2.2, rr * 2.2 * S.T, 8);
    // 테이퍼 궤적 — 뒤는 실처럼, 앞은 굵게. 속도가 형태로 읽힌다.
    ribbon(sx - ux * tail, sy - uy * tail, sx, sy, 0.6, rr * 0.55 + 1.2, pcol, 0.55);
    S.g.lineStyle(1.6, S.FX.projCore, 0.75);
    S.g.lineBetween(sx - ux * tail * 0.6, sy - uy * tail * 0.6, sx, sy);
    if (S.INKA > 0) { S.g.fillStyle(S.INK, 0.45 * S.INKA); S.g.fillCircle(sx, sy, rr * 0.9); }
    S.g.fillStyle(pcol, 1);
    S.g.fillCircle(sx, sy, rr * 0.78);
    wedge(sx, sy, ang, rr * 2.6 + 6, rr * 0.62, pcol, 0.95);
    S.g.fillStyle(S.FX.projCore, 0.95);
    S.g.fillCircle(sx - ux * rr * 0.15, sy - uy * rr * 0.15, Math.max(1.6, rr * 0.42));
  }

  function sparkA(e, col) {
    var a = e.t / e.total, p = 1 - a;
    var M = S.MAT, sd = seedOf(e.x, e.y);
    var cy = syy(e.y) - 12;
    // 맞은 자리에서 깃털과 나뭇조각이 튄다 — 계란은 피가 아니라 물건이 터진다
    for (var k = 0; k < 6; k++) {
      var ang = sd + (Math.PI * 2 / 6) * k;
      var d = 5 + p * 19;
      var ex = e.x + Math.cos(ang) * d, ey = cy + Math.sin(ang) * d * S.T - p * 4;
      if (k % 2) {
        S.g.lineStyle(3, M.feather, a * 0.95);
        S.g.lineBetween(ex, ey, ex + Math.cos(ang) * 8, ey + Math.sin(ang) * 8 * S.T);
      } else {
        shard(ex, ey, 2 + a * 2, M.wood, a * 0.95);
      }
    }
    dust(e.x, e.y, 9 + p * 10, a * 0.95);
    // 맞은 순간의 짧은 빛 — 누가 때렸는지가 색으로 남는다(2026-08-01)
    if (p < 0.5) {
      var kb = 1 - p / 0.5;
      gfill(e.x, e.y, 7 + p * 22, col, 0.30 * kb * kb * S.FA);
    }
  }

  function sparkB(e, col) {
    var a = e.t / e.total, p = 1 - a;
    var FX = S.FX;
    var cy = syy(e.y) - 12;
    // 충격 고리 + 4갈래. 링이 있어야 '어디에 맞았는지'가 한 점으로 모인다.
    if (S.INKA > 0) airRing(e.x, cy, 5 + p * 15, 4.5, S.INK, a * 0.5 * S.INKA);
    airRing(e.x, cy, 5 + p * 15, 3, FX.spark, a * 0.95);
    var sr = 5 * a + 3, slen = sr * (2.2 + p * 1.4);
    S.g.lineStyle(3.2, FX.spark, a * 0.95);
    for (var k = 0; k < 4; k++) {
      var ang = Math.PI / 4 + (Math.PI / 2) * k;
      S.g.lineBetween(e.x + Math.cos(ang) * sr * 0.5, cy + Math.sin(ang) * sr * 0.5,
        e.x + Math.cos(ang) * slen, cy + Math.sin(ang) * slen);
    }
    S.g.fillStyle(FX.sparkCore, a);
    S.g.fillCircle(e.x, cy, sr);
  }

  // ========================================================================
  //  5. strike — 갈고리 찍기 / 그물 던지기
  //     effect: beam (x1,y1 → x2,y2). 단일 대상 확정타라 '연결'이 보여야 한다.
  // ========================================================================
  function strikeA(e, col) {
    var a = e.t / e.total;
    var M = S.MAT;
    var x1 = e.x1, y1 = syy(e.y1) - 16, x2 = e.x2, y2 = syy(e.y2) - 14;
    var dx = x2 - x1, dy = y2 - y1, d = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / d, uy = dy / d, nx = -uy, ny = ux;
    // **밧줄**. 굵은 심 + 꼬임 눈금 — 이 세계의 '연결'은 줄이지 광선이 아니다.
    if (S.INKA > 0) { S.g.lineStyle(6, S.INK, a * 0.45 * S.INKA); S.g.lineBetween(x1, y1, x2, y2); }
    S.g.lineStyle(4, M.rope, a * 0.95);
    S.g.lineBetween(x1, y1, x2, y2);
    S.g.lineStyle(2, M.leatherDark, a * 0.8);
    for (var k = 1; k < 6; k++) {
      var f = k / 6, cx = x1 + dx * f, cy = y1 + dy * f;
      S.g.lineBetween(cx - nx * 3 - ux * 2, cy - ny * 3 - uy * 2,
        cx + nx * 3 + ux * 2, cy + ny * 3 + uy * 2);
    }
    // 끝의 **갈고리** — 두 갈래 쇠. 대상에 박혔다는 게 실루엣으로 남는다.
    S.g.lineStyle(3, M.iron, a);
    for (var s2 = -1; s2 <= 1; s2 += 2) {
      S.g.lineBetween(x2 - ux * 9, y2 - uy * 9, x2 + nx * s2 * 6, y2 + ny * s2 * 6);
      S.g.lineBetween(x2 + nx * s2 * 6, y2 + ny * s2 * 6, x2 + ux * 4, y2 + uy * 4);
    }
    // 맞은 자리에서 껍질 조각
    for (var n = 0; n < 3; n++) {
      var ang = seedOf(e.x2, e.y2) + n * 2.09, dd = 6 + (1 - a) * 12;
      shard(x2 + Math.cos(ang) * dd, y2 + Math.sin(ang) * dd * S.T, 1.6 + a, M.shell, a * 0.9);
    }
    // 박히는 순간의 섬광 — 갈고리가 '꽂혔다'를 색으로 한 번 더 말한다(2026-08-01)
    var sburst = Math.max(0, 1 - (1 - a) / 0.40);
    if (sburst > 0) {
      gfill(e.x2, e.y2, 10 + (1 - a) * 26, col, 0.34 * sburst * sburst * S.FA);
      gink(e.x2, e.y2, 12 + (1 - a) * 24, 2 + 3 * sburst, col, 0.9 * sburst * S.RA);
    }
  }

  function strikeB(e, col) {
    var a = e.t / e.total, p = 1 - a;
    var FX = S.FX;
    var x1 = e.x1, y1 = syy(e.y1) - 16, x2 = e.x2, y2 = syy(e.y2) - 14;
    var ang = Math.atan2(y2 - y1, x2 - x1);
    // 시전자에서 대상으로 **굵어지는 쐐기** — 힘이 한 점에 꽂혔다
    if (S.INKA > 0) ribbon(x1, y1, x2, y2, 1.2, 7, S.INK, a * 0.4 * S.INKA);
    ribbon(x1, y1, x2, y2, 0.8, 5.2, col, a * 0.85);
    // 대상 위 충격 별 4갈래 + 짧은 되튐 호
    var sr = 5 + p * 9;
    S.g.lineStyle(3, FX.spark, a * 0.9);
    for (var k = 0; k < 4; k++) {
      var sa = ang + Math.PI / 4 + (Math.PI / 2) * k;
      S.g.lineBetween(x2 + Math.cos(sa) * sr * 0.4, y2 + Math.sin(sa) * sr * 0.4,
        x2 + Math.cos(sa) * sr * 1.9, y2 + Math.sin(sa) * sr * 1.9);
    }
    airRing(x2, y2, 6 + p * 12, 2.5, col, a * 0.8);
    S.g.fillStyle(FX.sparkCore, a * 0.9);
    S.g.fillCircle(x2, y2, 3 + a * 2);
  }

  // ========================================================================
  //  6. buff — 가죽 두르기 / 광폭화 / 약초 씹기 / 방패 세우기 / 철벽 자세 / 숨 고르기 / 풀숲 위장
  //     effect: ring (total 400, r = 몸 반지름 + 26)
  //     ※ aoeSelf 와 kind 가 같다. total 로 가른다(320 = 광역 / 400 = 강화).
  //       반지름으로 가르면 방패 밀치기(80) 와 헷갈린다 — 실제로 겹치는 구간이다.
  // ========================================================================
  //  ⚠ 2026-08-01 — 여기도 **영웅 색**을 올렸다(aoeSelfA 와 같은 이유).
  //    조개껍질 색만 쓰면 파수꾼의 버프가 다른 영웅 것과 구분이 안 된다.
  function buffA(e, col) {
    var a = e.t / e.total, p = 1 - a;
    var M = S.MAT;
    // 몸을 감싸며 올라오는 빛 — 터지는 순간에 한 번 크게
    var burst = Math.max(0, 1 - p / 0.45);
    if (burst > 0) {
      gfill(e.x, e.y, e.r * (0.5 + p * 1.1), col, 0.30 * burst * burst * S.FA);
      gink(e.x, e.y, e.r * (0.6 + p * 1.0), 3 + 4 * burst, col, 0.95 * burst * S.RA);
    }
    //  ── 큰 방패 (2026-08-04 사용자 요청: "파수꾼은 방패모양이 크게 나타났으면") ──
    //  파수꾼의 정체성은 '버틴다'인데 버프 이펙트가 잎사귀·링이라 **무엇으로 버티는지**
    //  가 안 보였다. 시전 순간 몸 앞에 **큰 방패 실루엣**을 세운다.
    //  ⚠ `heroKey` 가 파수꾼일 때만. 다른 영웅의 버프에 방패가 뜨면 거짓 신호다.
    //  ⚠ 전장을 가리지 않게 **터지는 앞 45% 구간에만** 뜨고 바로 사라진다.
    //    이 게임의 제1규율(바닥이 시끄러우면 예고 원이 안 보인다)을 지킨다.
    if (e.heroKey === 'warden' && burst > 0) {
      var shX = e.x, shY = syy(e.y) - e.r * 0.30;
      var sw = e.r * (0.78 + p * 0.30), sh = e.r * (1.02 + p * 0.34);
      var out = [
        { x: shX, y: shY - sh * 0.52 },
        { x: shX + sw * 0.52, y: shY - sh * 0.28 },
        { x: shX + sw * 0.52, y: shY + sh * 0.16 },
        { x: shX, y: shY + sh * 0.52 },
        { x: shX - sw * 0.52, y: shY + sh * 0.16 },
        { x: shX - sw * 0.52, y: shY - sh * 0.28 }
      ];
      var ba = burst * 0.85 * S.FA;
      S.g.fillStyle(M.woodDark, ba * 0.9);                 // 테 — 두께
      S.g.fillPoints(out, true);
      var inn = out.map(function (q) {
        return { x: shX + (q.x - shX) * 0.82, y: shY + (q.y - shY) * 0.82 };
      });
      S.g.fillStyle(M.bone, ba);                            // 뼈판
      S.g.fillPoints(inn, true);
      S.g.lineStyle(Math.max(1.5, e.r * 0.035), M.bronze, burst * 0.95);
      S.g.strokePoints(out, true, true);
      S.g.fillStyle(M.bronze, burst * 0.95);                // 방패심
      S.g.fillEllipse(shX, shY, e.r * 0.24, e.r * 0.24, 10);
      S.g.fillStyle(S.FX.sparkCore, burst * 0.7);
      S.g.fillEllipse(shX - e.r * 0.05, shY - e.r * 0.05, e.r * 0.10, e.r * 0.10, 8);
    }

    // 발밑 링 — 영웅 색을 바깥에, 조개껍질을 안쪽에 겹쳐 두께를 만든다
    gink(e.x, e.y, e.r * (0.86 + p * 0.22), 4, col, a * S.RA);
    gink(e.x, e.y, e.r * (0.80 + p * 0.20), 2, M.shell, a * 0.8 * S.RA);
    gfill(e.x, e.y, e.r * 0.9, M.shell, 0.10 * a * S.FA);

    //  ── 포효(warcry)는 잎이 아니라 **퍼지는 소리**다 (2026-08-07) ────────────
    //  족장의 포효가 `ring` total 420 이라 이 함수(buff)로 들어오는데, 그러면 화면에
    //  **잎사귀 세 장이 떠오른다** — 뿔피리를 부는 우두머리 위로 약초가 날리는 그림이다.
    //  이름이 약속한 것을 그림이 안 지키는, 이 파일이 `MOTIF_MAT` 을 만든 것과 같은 종류.
    //  ⚠ `e.owner` 는 `Combat._withAbilFx` 가 심는다. 없으면(영웅 버프) 예전 그림 그대로다.
    var isCry = !!(e.owner && e.owner.def && e.owner.def.ability &&
                   e.owner.def.ability.type === 'warcry');
    var sd = seedOf(e.x, e.y), cy = syy(e.y);
    if (isCry) {
      //  바깥으로 퍼지는 호 세 겹 — 소리는 위로 떠오르지 않고 **번져 나간다.**
      //  세 겹이 시차를 두고 나가야 '한 번 크게 외쳤다'가 읽힌다(동심원 하나는 맥동이다).
      for (var w = 0; w < 3; w++) {
        var wp = p - w * 0.16;
        if (wp <= 0 || wp >= 1) continue;
        gink(e.x, e.y, e.r * (0.35 + wp * 0.80), 3.2 - w * 0.6, col, (1 - wp) * a * 0.9 * S.RA);
      }
      //  뿔피리 쪽으로 튀는 마른 부스러기 — A안(재료)의 문법을 지킨다.
      for (var c2 = 0; c2 < 5; c2++) {
        var ca = sd + (Math.PI * 2 / 5) * c2;
        var cd2 = e.r * (0.50 + p * 0.55);
        shard(e.x + Math.cos(ca) * cd2, cy + Math.sin(ca) * cd2 * S.T - p * 10,
              1.8 + e.r * 0.012, c2 % 2 ? M.stone : M.wood, a * 0.85);
      }
    } else {
      // 잎사귀 세 장이 위로 떠오른다 (약초·가죽·풀숲 — 전부 '두르는' 스킬이다)
      for (var k = 0; k < 3; k++) {
        var ang = sd + (Math.PI * 2 / 3) * k;
        var lx = e.x + Math.cos(ang) * e.r * 0.62;
        var ly = cy + Math.sin(ang) * e.r * 0.62 * S.T - 6 - p * 26;
        if (S.INKA > 0) { S.g.fillStyle(S.INK, a * 0.5 * S.INKA); S.g.fillEllipse(lx, ly, 9.5, 6.5, 8); }
        S.g.fillStyle(k === 1 ? M.leafDark : M.leaf, a * 0.95);
        S.g.fillEllipse(lx, ly, 8, 5, 8);
      }
    }
    dust(e.x, e.y, e.r * 0.55, a * 0.5);
    gline(e.x, e.y, e.r * 0.5, 2, col, a * 0.5 * S.RA);
  }

  function buffB(e, col) {
    var a = e.t / e.total, p = 1 - a;
    var cy = syy(e.y);
    // 지면 링 하나 + **위로 올라가는 링 두 겹**. '감싸 올린다'가 동작으로 읽힌다.
    gink(e.x, e.y, e.r, 2.5, col, a * 0.9 * S.RA);
    for (var k = 0; k < 2; k++) {
      var ph = (p + k * 0.5) % 1;
      airRing(e.x, cy - ph * 36, e.r * (1 - ph * 0.34), 2.5, col, a * (1 - ph) * 0.95);
    }
    // 상승선 4개
    S.g.lineStyle(2, col, a * 0.5);
    for (var n = 0; n < 4; n++) {
      var ang = Math.PI / 4 + (Math.PI / 2) * n;
      var lx = e.x + Math.cos(ang) * e.r * 0.85, ly = cy + Math.sin(ang) * e.r * 0.85 * S.T;
      S.g.lineBetween(lx, ly, lx, ly - 10 - p * 14);
    }
  }

  // ========================================================================
  //  7. pull — 후려치기 / 갈고리 당기기 / 회전 갈고리(360°)
  //     effect: slash (total 260).  ※ 근접 평타도 kind 가 slash 다(total 140) —
  //     그건 스킬이 아니므로 넘기지 않고 battle.js 원래 그림에 맡긴다.
  // ========================================================================
  function pullA(e, col) {
    var a = e.t / e.total, p = 1 - a;
    var M = S.MAT;
    var full = e.half >= Math.PI * 0.98;
    // 부채꼴 = 범위. 흙빛 면 + 잉크 테두리로 흑백에서도 경계가 남는다.
    groundSlice(e.x, e.y, e.range, e.angle - e.half, e.angle + e.half, M.clay, 0.16 * a * S.FA);
    if (S.INKA > 0) groundArc(e.x, e.y, e.range, e.angle - e.half, e.angle + e.half, 5, S.INK, a * 0.45 * S.INKA);
    groundArc(e.x, e.y, e.range, e.angle - e.half, e.angle + e.half, 3, M.clay, a * 0.95);
    // **갈고리에 걸린 것들이 안으로 끌려온다** — 밧줄 꼬리 + 돌조각
    var n = full ? 6 : 5, cy = syy(e.y);
    for (var k = 0; k < n; k++) {
      var f = full ? (k / n) : ((k + 0.5) / n);
      var ang = full ? (e.angle + Math.PI * 2 * f) : (e.angle - e.half + e.half * 2 * f);
      var d = e.range * (0.92 - p * 0.60);
      var c = Math.cos(ang), s2 = Math.sin(ang) * S.T;
      var hx = e.x + c * d, hy = cy + s2 * d;
      S.g.lineStyle(2.5, M.rope, a * 0.8);
      S.g.lineBetween(hx, hy, hx + c * e.range * 0.18, hy + s2 * e.range * 0.18);
      shard(hx, hy, 3, M.stone, a * 0.95);
    }
    // 부채꼴 테두리를 영웅 색으로 한 겹 더 — 흙빛만이면 누가 당겼는지 안 보인다
    groundArc(e.x, e.y, e.range * 1.01, e.angle - e.half, e.angle + e.half, 4, col, a * 0.9);
    var pburst = Math.max(0, 1 - p / 0.40);
    if (pburst > 0) {
      groundArc(e.x, e.y, e.range * (0.6 + p * 0.5), e.angle - e.half, e.angle + e.half,
                2 + 3 * pburst, col, 0.85 * pburst);
    }
    // 시전자 발밑 — 끌려오는 목적지
    gink(e.x, e.y, 14, 3, col, a * 0.9 * S.RA);
    gink(e.x, e.y, 11, 2, M.rope, a * 0.85 * S.RA);
  }

  function pullB(e, col) {
    var a = e.t / e.total, p = 1 - a;
    var full = e.half >= Math.PI * 0.98;
    groundSlice(e.x, e.y, e.range, e.angle - e.half, e.angle + e.half, col, 0.11 * a * S.FA);
    if (S.INKA > 0) groundArc(e.x, e.y, e.range, e.angle - e.half, e.angle + e.half, 5, S.INK, a * 0.45 * S.INKA);
    groundArc(e.x, e.y, e.range, e.angle - e.half, e.angle + e.half, 3, col, a * 0.95);
    // **호가 통째로 중심으로 수축한다.** 세 겹이 시간차를 두고 빨려 들어간다.
    for (var k = 0; k < 3; k++) {
      var ph = (p + k * 0.33) % 1;
      var rr = e.range * (0.92 - ph * 0.72);
      groundArc(e.x, e.y, rr, e.angle - e.half, e.angle + e.half, 3, col, a * (1 - ph) * 0.9);
    }
    // 중심을 향한 쐐기 — 힘의 방향
    var n = full ? 6 : 4, cy = syy(e.y);
    for (var m = 0; m < n; m++) {
      var f = full ? (m / n) : ((m + 0.5) / n);
      var ang = full ? (e.angle + Math.PI * 2 * f) : (e.angle - e.half + e.half * 2 * f);
      var c = Math.cos(ang), s2 = Math.sin(ang) * S.T;
      var d = e.range * (0.62 - p * 0.34);
      wedge(e.x + c * d, cy + s2 * d, Math.atan2(-s2, -c), 15, 6, col, a * 0.9);
    }
  }

  // ========================================================================
  //  8. aura — 파수 구역 / 경계 화톳불
  //     hero.auras (radius, dps, t).  8~10초 지속이라 **정적이면 잊힌다.**
  // ========================================================================
  function auraA(u, au, col) {
    var M = S.MAT, FX = S.FX;
    var r = au.radius;
    gfill(u.x, u.y, r, M.clay, 0.09 * S.FA);
    // **돌로 그은 경계.** 색이 아니라 물건이 선을 그으므로 흑백에서도 범위가 남는다.
    var n = Math.round(r / 14); if (n < 8) n = 8; if (n > 18) n = 18;
    var cy = syy(u.y);
    for (var k = 0; k < n; k++) {
      var ang = (Math.PI * 2 / n) * k;
      shard(u.x + Math.cos(ang) * r, cy + Math.sin(ang) * r * S.T, 4.4, M.stone, 0.98);
    }
    // 경계를 영웅 색으로 또렷하게(예전 1.5px/0.45 는 사실상 안 보였다)
    gink(u.x, u.y, r, 3, col, 0.85 * S.RA);
    gline(u.x, u.y, r * 0.55, 1.5, col, 0.40 * S.RA);
    // 화톳불의 불티 — 안쪽에서 위로 떠오른다. 이 구역이 '살아 있다'는 신호.
    var t = S.t;
    for (var m = 0; m < 4; m++) {
      var ph = ((t / 1100) + m * 0.25) % 1;
      var a2 = (m * 1.9) + t / 2600;
      var d = r * 0.30 * (0.4 + m * 0.2);
      shard(u.x + Math.cos(a2) * d, cy + Math.sin(a2) * d * S.T - ph * 30,
        3 * (1 - ph * 0.6), col, 0.95 * (1 - ph));
    }
  }

  function auraB(u, au, col) {
    var r = au.radius;
    gfill(u.x, u.y, r, col, 0.08 * S.FA);
    gink(u.x, u.y, r, 2.5, col, 0.75 * S.RA);
    // **안에서 밖으로 퍼지는 맥동 두 겹.** 지속 피해 구역이라는 게 시간으로 읽힌다.
    var t = S.t;
    for (var k = 0; k < 2; k++) {
      var ph = ((t / 1200) + k * 0.5) % 1;
      gline(u.x, u.y, r * (0.20 + ph * 0.78), 2.5, col, (1 - ph) * 0.75 * S.RA);
    }
    gline(u.x, u.y, r * 0.20, 2, col, 0.5 * S.RA);
  }

  // ========================================================================
  //  9. trap — 가시 함정 / 올가미 / 끈끈이 덫
  //     s.traps.  "밟으면 안 되는 자리"라는 뜻이 다른 링과 달라야 한다.
  // ========================================================================
  function trapA(tr, col) {
    var M = S.MAT, FX = S.FX;
    var r = tr.radius;
    gfill(tr.x, tr.y, r, M.clay, 0.13 * S.FA);
    gink(tr.x, tr.y, r, 3, col || FX.trap, 0.9 * S.RA);
    // **안쪽을 향한 뼈 가시.** 실루엣만으로 "여기 밟으면 물린다"가 읽힌다.
    var n = 8, cy = syy(tr.y);
    var pulse = 0.75 + 0.25 * Math.sin(S.t / 420);
    for (var k = 0; k < n; k++) {
      var ang = (Math.PI * 2 / n) * k;
      var c = Math.cos(ang), s2 = Math.sin(ang) * S.T;
      var bx = tr.x + c * r * 0.94, by = cy + s2 * r * 0.94;
      wedge(bx, by, Math.atan2(-s2, -c), r * 0.30 * pulse, 4.5, M.bone, 0.95);
    }
    gline(tr.x, tr.y, r * 0.22, 2, FX.trap, 0.6 * S.RA);
  }

  function trapB(tr, col) {
    var FX = S.FX;
    var r = tr.radius;
    gfill(tr.x, tr.y, r, FX.trap, 0.08 * S.FA);
    // **점선 원** — 실선 링(지원 반경)과 뜻이 다르다는 걸 선 종류로 구분한다.
    var seg = 12, cy = syy(tr.y);
    if (S.INKA > 0) {
      for (var i0 = 0; i0 < seg; i0++) {
        var a0 = (Math.PI * 2 / seg) * i0;
        groundArc(tr.x, tr.y, r, a0, a0 + (Math.PI * 2 / seg) * 0.55, 4.5, S.INK, 0.5 * S.INKA);
      }
    }
    for (var i = 0; i < seg; i++) {
      var b0 = (Math.PI * 2 / seg) * i;
      groundArc(tr.x, tr.y, r, b0, b0 + (Math.PI * 2 / seg) * 0.55, 2.5, FX.trap, 0.9 * S.RA);
    }
    // 안쪽으로 조여드는 갈고리 4개 + 느린 맥동 링
    var ph = (S.t / 1400) % 1;
    gline(tr.x, tr.y, r * (0.95 - ph * 0.70), 2, FX.trap, (1 - ph) * 0.7 * S.RA);
    for (var k = 0; k < 4; k++) {
      var ang = Math.PI / 4 + (Math.PI / 2) * k;
      var c = Math.cos(ang), s2 = Math.sin(ang) * S.T;
      var hx = tr.x + c * r * 0.62, hy = cy + s2 * r * 0.62;
      wedge(hx, hy, Math.atan2(-s2, -c), r * 0.26, 4, FX.trap, 0.9);
    }
  }

  // ========================================================================
  //  공개 API — battle.js 는 이 네 개만 부른다.
  // ========================================================================
  var SkillFX = GAME.SkillFX = {

    // 'A' = 재료 중심 / 'B' = 동작 중심. 기본은 A.
    variant: 'A',
    // 끄면 battle.js 가 예전 그림을 그대로 그린다(회귀 확인용 스위치).
    enabled: true,

    setVariant: function (v) {
      this.variant = (v === 'B') ? 'B' : 'A';
      try { if (GAME.Store) GAME.Store.set(STORE_KEY, this.variant); } catch (e) { }
      return this.variant;
    },
    toggle: function () { return this.setVariant(this.variant === 'A' ? 'B' : 'A'); },

    // 프레임 시작. 색 토큰을 한 번만 읽어 캐시한다. 꺼져 있으면 null 을 돌려주고,
    // battle.js 는 그 값이 null 이면 예전 코드로 간다.
    begin: function (g, FX, scene) {
      if (!this.enabled || !GAME.Iso || !GAME.UI) return null;
      S.g = g;
      S.FX = FX || GAME.UI.FX;
      S.MAT = GAME.UI.MAT;
      S.C = GAME.CONFIG.COLORS;
      S.RA = S.FX.ringAlpha === undefined ? 1 : S.FX.ringAlpha;
      S.FA = S.FX.fillAlpha === undefined ? 1 : S.FX.fillAlpha;
      S.INK = S.FX.ink === undefined ? 0x0b0b12 : S.FX.ink;
      S.INKA = S.FX.inkAlpha === undefined ? 0 : S.FX.inkAlpha;
      S.T = GAME.Iso.TILT;
      S.B = (this.variant === 'B');
      S.t = (scene && scene.state && scene.state.elapsed) ||
        (window.performance ? window.performance.now() : Date.now());
      return this;
    },

    // s.effects 한 개. 처리했으면 true.
    // ── 재료(motif) 팔레트 (2026-08-03) ──────────────────────────────────
    //  스킬 이름 60개가 시각 타입 9종을 나눠 쓰다 보니 **모래 뿌리기와 바위 내리치기와
    //  방패 밀치기가 똑같이 그려졌다.** 이름이 약속한 것을 그림이 안 지킨 것이다.
    //
    //  ⚠ **범위와 타이밍은 손대지 않는다.** 그건 타입이 정하고, 이 게임의 계약
    //    ("논타겟은 보고 피할 수 있다")이 거기 걸려 있다. 재료는 **색만** 바꾼다.
    //  ⚠ 여기 없는 키는 원래 MAT 을 그대로 쓴다 — 부분 덮어쓰기다.
    //  ⚠ 값은 전부 이 게임 세계의 물건 색이다. 마법 광선·네온은 이 세계에 없다
    //    (원시 부족 전쟁 · 12세 이용가 — 파일 상단 규율).
    MOTIF_MAT: {
      //  ⚠ **밝기까지 벌린다.** 처음엔 색상만 바꿨더니 부스러기가 알파 0.34~0.42 로
      //    깔려서 어두운 바닥 위에서 여덟 재료가 거의 같아 보였다(실측: 나란히 찍어 확인).
      //    낮은 알파에서는 색상(hue)보다 **명도 차이**가 먼저 읽힌다 — 그래서
      //    모래·뼈는 밝게, 대지·잉걸불은 어둡고 진하게 갈라 놓는다.
      sand:    { clay: 0xefe0b0, stone: 0xf5ecd2, wood: 0xd8bd7e },   // 아주 밝은 모래
      rock:    { clay: 0x8b9099, stone: 0xb9c2cc, wood: 0x5f646c },   // 차가운 회색
      earth:   { clay: 0x6b3f1e, stone: 0x8a6a3f, wood: 0x402a12 },   // 짙은 흙
      shield:  { clay: 0x9c7a52, stone: 0x39414f, wood: 0x6d5233 },   // 가죽+철
      bone:    { clay: 0xf2eddc, stone: 0xffffff, wood: 0xcfc7ae },   // 흰 뼈
      rope:    { clay: 0xd8c08c, stone: 0xe8d9ae, wood: 0x9a7440 },   // 마른 밧줄
      feather: { clay: 0xe8804f, stone: 0xf0a860, wood: 0x9a6030 },   // 따뜻한 깃
      ember:   { clay: 0xd8451a, stone: 0xff8c2e, wood: 0x5e2409 },   // 잉걸불
      frost:   { clay: 0x9fd4ea, stone: 0xe4f6ff, wood: 0x4a7b91 },   // 서리
      //  늪 (2026-08-07) — 늪지기의 수액 단지. 기존 아홉 색에 **늪빛이 없어서**
      //  광역 둔화가 투석꾼의 돌·궁수의 깃털과 같은 진흙색으로 터지고 있었다.
      //  값은 `UI.MAT` 의 goo 계열(gooDark/goo/gooLite)에서 잡았다 — 이 세계의 물건 색이다.
      //  ⚠ 이건 `effects.kind` 가 아니라 **팔레트 표의 키**다("새 kind 금지" 규율 밖).
      bog:     { clay: 0x6c7d24, stone: 0xd0e078, wood: 0x3d4713 },   // 늪 수액
      //  껍질 (2026-08-08) — 껍질장이의 보호막. `bone` 이 이미 흰색이라 그냥 쓰면
      //  둘이 안 갈린다. 껍질은 뼈보다 **살짝 따뜻하고 테가 진하다**(계란 껍질이다).
      //  값은 `UI.MAT` 의 shell/shellLite/shellRim 계열에서 잡았다.
      shell:   { clay: 0xf6ead6, stone: 0xfffaf0, wood: 0xc0ac8c }    // 계란 껍질
      // blade — 기본 MAT 그대로(금속). 표에 없으므로 자동으로 원래 색이다.
    },

    //  이 이펙트가 그려지는 동안만 팔레트를 갈아끼운다.
    _withMotif: function (motif, draw) {
      var over = motif && this.MOTIF_MAT[motif];
      if (!over) { draw(); return; }
      var keep = S.MAT, mixed = {};
      for (var k in keep) mixed[k] = keep[k];
      for (var k2 in over) mixed[k2] = over[k2];
      S.MAT = mixed;
      try { draw(); } finally { S.MAT = keep; }
    },

    //  ── 참격 한 번 (2026-08-04 사용자 요청: "검사는 스킬썼을때 최소한 검
    //     휘두르는게 있으면 좋겠고") ─────────────────────────────────────────
    //  광역기 안에만 있던 초승달을 **밖에서도 부를 수 있게** 연다. 근접 영웅의
    //  평타에도 붙이기 위한 것이다 — 지금은 평타에 그림이 없어 "때렸다"가 안 읽힌다.
    //  ⚠ 호출부(js/scenes/battle.js)는 **렌더 전용 목록**을 따로 들고 여기로 넘긴다.
    //    `state.effects` 에 넣으면 전투 상태를 렌더가 오염시킨다.
    //  ⚠ `begin()` 이 먼저 불려야 한다(S.g 가 그때 꽂힌다) — 호출부가 그 뒤에 부른다.
    swing: function (x, wy, ang, r, a, heroKey) {
      if (!S.g) return false;
      crescent(x, wy, ang, r, a, heroKey);
      return true;
    },

    drawEffect: function (e, col) {
      //  ⚠ 재료는 **여기 한 곳**에서만 갈아끼운다. 그리기 함수 9개는 손대지 않는다 —
      //    거기에 각각 넣으면 새 이펙트가 추가될 때 그것만 무채색으로 빠진다.
      var self = this, out = false;
      this._withMotif(e && e.motif, function () { out = self._drawEffectInner(e, col); });
      return out;
    },

    _drawEffectInner: function (e, col) {
      if (!S.g) return false;
      var k = e.kind;
      if (k === 'dashTrail') { S.B ? dashB(e, col) : dashA(e, col); return true; }
      if (k === 'ring') {
        // total 400 = buff / 320 = aoeSelf. combat.js 가 박아둔 값이라 안전한 구분자다.
        if (e.total >= 380) { S.B ? buffB(e, col) : buffA(e, col); }
        else { S.B ? aoeSelfB(e, col) : aoeSelfA(e, col); }
        return true;
      }
      if (k === 'telegraph') { S.B ? telegraphB(e) : telegraphA(e); return true; }
      if (k === 'blast') { S.B ? blastB(e) : blastA(e, col); return true; }
      if (k === 'beam') { S.B ? strikeB(e, col) : strikeA(e, col); return true; }
      if (k === 'spark') { S.B ? sparkB(e, col) : sparkA(e, col); return true; }
      if (k === 'slash' && e.total > 180) { S.B ? pullB(e, col) : pullA(e, col); return true; }
      return false;   // slashWave · healPulse · block · yolk · lob 등은 원래 그림 그대로
    },

    drawTrap: function (tr, col) {
      if (!S.g) return false;
      S.B ? trapB(tr, col) : trapA(tr, col);
      return true;
    },

    drawAura: function (u, au, col) {
      if (!S.g) return false;
      S.B ? auraB(u, au, col) : auraA(u, au, col);
      return true;
    },

    // 스킬 투사체(big)만 가져간다. 유닛 평타는 원래 그림 그대로.
    drawProjectile: function (p, col) {
      if (!S.g || !p.big) return false;
      S.B ? projB(p, col) : projA(p, col);
      return true;
    }
  };

  // 저장된 선택을 복원한다(기본 A).
  try {
    if (GAME.Store) {
      var saved = GAME.Store.get(STORE_KEY, 'A');
      SkillFX.variant = (saved === 'B') ? 'B' : 'A';
    }
  } catch (e) { }

})();
