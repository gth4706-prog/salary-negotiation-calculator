// ============================================================================
//  Egg War — 아이템 아이콘 아트  (무기 3 · 방어구 3 · 신발 3 · 물약 3)
//  이미지 애셋 없음. Phaser.GameObjects.Graphics 도형 API 만 쓴다.
//  eggart.js 와 같은 손맛: 재질 팔레트(UI.MAT) + 라이트 테마 잉크 윤곽(UI.inkLayer).
//
//  API
//    GAME.UI.drawItem(g, slotKey, itemKey, cx, cy, size)
//      g       : Phaser Graphics (또는 eggart 의 잉크 프록시)
//      slotKey : 'weapon' | 'armor' | 'boots' | 'potion'   (없어도 동작 — itemKey 로 찾는다)
//      itemKey : 'w1'~'w3' | 'a1'~'a3' | 'b1'~'b3' | 'p1'~'p3'
//      cx, cy  : 아이콘 중심
//      size    : 아이콘 한 변(px). 권장 40~80. 모든 좌표가 이 값의 비율이다.
//    → 알 수 없는 키는 나무 상자 아이콘을 그린다(빈 칸이 생기지 않게).
//
//  설계 원칙 (eggart.js 의 제1원칙과 같다)
//   1) **흑백으로 봐도 구분된다.** 같은 칸의 3종은 실루엣부터 다르게 잡았다.
//      무기: 짧은 격지 / 한쪽에만 날이 붙은 도끼 / 가장 긴 직선 양날검
//      방어구: 조끼 / 조끼+뼈가시(더 넓다) / 둥근 등껍질
//      신발: 납작한 짚신 / L자 장화 / 장화+날개깃
//      물약: 작은 호리병 / 열매 세 알 / 큰 주머니
//   2) 1→3단계는 재질·장식으로 등급이 올라간다(돌→청동→흑요석 / 가죽→뼈→껍질 …).
//   3) 라이트 테마(크림 배경)에서는 UI.inkLayer 가 잉크 윤곽을 뒤에 한 겹 찍는다.
//      **어두운 테마에는 잉크가 없다** → 본디 어두운 재질(흑요석·열매)에는 항상
//      밝은 테두리를 하나 넣어 어두운 패널(0x242433)에서도 실루엣이 남게 했다.
//   4) 상태를 만들지 않는다. g 에만 그리고 Text 는 만들지 않는다(이름은 호출부가 쓴다).
// ============================================================================

window.GAME = window.GAME || {};
GAME.UI = GAME.UI || {};

(function (UI) {

  // ── 재질색 ────────────────────────────────────────────────────
  //  테마가 UI.MAT 을 제자리에서 갈아끼우므로 **그릴 때마다 읽는다**(로드 시점 캐시 금지).
  //  eggart.js 가 아직 안 올라왔어도 죽지 않게 기본값을 함께 준다.
  function mat(n, fb) {
    var M = UI.MAT;
    return (M && typeof M[n] === 'number') ? M[n] : fb;
  }

  // 아이템 고유색 — MAT 에 없는 것만 여기서 정한다.
  // 라이트(크림 0xFBF2DF)·다크(패널 0x242433) 양쪽에서 형태가 남는 값으로 골랐다.
  var C = {
    obsidian:     0x2B2438,   // 흑요석 몸통 — 크림에서는 잉크처럼 진하다
    obsidianLite: 0x7E72AE,   // 유리질 광택
    obsidianEdge: 0xD8DCF2,   // 밝은 날 테두리 ← 어두운 테마에서 실루엣을 담당한다
    water:        0x3E9BD8,
    waterLite:    0xB6E3F8,
    berry:        0xA83A46,
    berryLite:    0xD9756A,
    shellGreen:   0x5F7C3E,   // 거북 등껍질
    shellLite:    0x8FAE5E,
    shellDark:    0x37471F,
    cloth:        0xC9B487    // 삼베 주머니
  };

  function tint(c, f) {
    var r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    else { r *= (1 + f); g *= (1 + f); b *= (1 + f); }
    return ((r | 0) << 16) | ((g | 0) << 8) | (b | 0);
  }

  // ── 정규화 좌표계 ─────────────────────────────────────────────
  //  모든 도형을 -0.5 ~ +0.5 (아이콘 한 변 = 1) 로 적고 여기서 픽셀로 바꾼다.
  //  → size 를 바꿔도 그림이 그대로 확대/축소된다(고정 픽셀 없음).
  //  주의: 잉크 프록시가 지원하는 명령만 쓴다
  //        (fillStyle/lineStyle/fillCircle/strokeCircle/fillEllipse/strokeEllipse/
  //         fillRect/fillRoundedRect/strokeRoundedRect/fillTriangle/fillPoints/
  //         strokePoints/lineBetween). beginPath·arc 류는 프록시에 없어 잉크가 깨진다.
  function ctx(g, cx, cy, U) {
    var c = {
      g: g, U: U,
      fine: U >= 34,                   // 잔디테일 LOD — 작아지면 끈다
      x: function (n) { return cx + n * U; },
      y: function (n) { return cy + n * U; },
      fill: function (col, a) { g.fillStyle(col, a === undefined ? 1 : a); },
      line: function (n, col, a) { g.lineStyle(Math.max(1, n * U), col, a === undefined ? 1 : a); },
      poly: function (arr) {
        var o = [], i;
        for (i = 0; i < arr.length; i++) o.push({ x: cx + arr[i][0] * U, y: cy + arr[i][1] * U });
        return o;
      },
      seg: function (x1, y1, x2, y2) { g.lineBetween(cx + x1 * U, cy + y1 * U, cx + x2 * U, cy + y2 * U); },
      segP: function (p, q) { g.lineBetween(cx + p[0] * U, cy + p[1] * U, cx + q[0] * U, cy + q[1] * U); },
      circ: function (a1, b1, r) { g.fillCircle(cx + a1 * U, cy + b1 * U, r * U); },
      scirc: function (a1, b1, r) { g.strokeCircle(cx + a1 * U, cy + b1 * U, r * U); },
      ell: function (a1, b1, w, h) { g.fillEllipse(cx + a1 * U, cy + b1 * U, w * U, h * U); },
      rect: function (a1, b1, w, h) { g.fillRect(cx + a1 * U, cy + b1 * U, w * U, h * U); },
      rrect: function (a1, b1, w, h, r) { g.fillRoundedRect(cx + a1 * U, cy + b1 * U, w * U, h * U, r * U); },
      tri: function (a1, b1, a2, b2, a3, b3) {
        g.fillTriangle(cx + a1 * U, cy + b1 * U, cx + a2 * U, cy + b2 * U, cx + a3 * U, cy + b3 * U);
      }
    };
    c.fillP = function (arr) { g.fillPoints(c.poly(arr), true); };
    c.strokeP = function (arr) { g.strokePoints(c.poly(arr), true, true); };
    return c;
  }

  // 축 위의 점 — t 0..1 은 자루→끝, o 는 축에 수직인 옆폭. 칼·창처럼 기울어진 것에 쓴다.
  function ax(x0, y0, x1, y1) {
    var dx = x1 - x0, dy = y1 - y0, L = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    return function (t, o) { return [x0 + ux * L * t + nx * o, y0 + uy * L * t + ny * o]; };
  }

  // 좌우 반전
  function flipX(arr) {
    var o = [], i;
    for (i = 0; i < arr.length; i++) o.push([-arr[i][0], arr[i][1]]);
    return o;
  }
  // 한 점을 중심으로 축소 (등껍질 테두리 만들기)
  function shrink(arr, k, ox, oy) {
    var o = [], i;
    for (i = 0; i < arr.length; i++) o.push([ox + (arr[i][0] - ox) * k, oy + (arr[i][1] - oy) * k]);
    return o;
  }

  // 잎사귀 — 밑동에서 끝으로 뾰족해지는 타원형
  function leafAt(c, bx, by, tx, ty, w, col, spine) {
    var A = ax(bx, by, tx, ty);
    c.fill(col);
    c.fillP([A(0, 0), A(0.32, w), A(0.70, w * 0.72), A(1, 0), A(0.70, -w * 0.72), A(0.32, -w)]);
    if (spine !== undefined && c.fine) {
      c.line(0.018, spine, 0.85);
      c.segP(A(0.04, 0), A(0.94, 0));
    }
  }

  // 깃털 — 잎사귀보다 갈라지고 한쪽으로 휜다
  function featherAt(c, bx, by, tx, ty, w, col) {
    var A = ax(bx, by, tx, ty);
    c.fill(col);
    c.fillP([A(0, 0), A(0.28, w), A(0.66, w * 0.86), A(1, 0.02), A(0.70, -w * 0.5), A(0.30, -w * 0.66)]);
    if (c.fine) {
      c.line(0.016, tint(col, -0.35), 0.9);
      c.segP(A(0.03, 0), A(0.96, 0.01));
    }
    c.fill(tint(col, 0.34));
    c.fillP([A(0.10, 0.01), A(0.40, w * 0.62), A(0.72, w * 0.42), A(0.92, 0.02)]);
  }

  // 육각 갑판 — 거북등
  function hexAt(c, hx, hy, r, col, edge) {
    var pts = [], i, a;
    for (i = 0; i < 6; i++) {
      a = Math.PI / 6 + i * Math.PI / 3;
      pts.push([hx + Math.cos(a) * r, hy + Math.sin(a) * r * 0.92]);
    }
    c.fill(col); c.fillP(pts);
    if (edge !== undefined) { c.line(0.022, edge, 0.9); c.strokeP(pts); }
  }

  // ============================================================================
  //  무기 — 돌 → 청동 → 흑요석
  // ============================================================================

  // w1 돌칼 : 짧다. 회색 격지(깨진 돌)에 나무자루를 밧줄로 묶었다.
  function w1(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var wood = mat('wood', 0x8a6a45), woodD = mat('woodDark', 0x5a452c);
    var st = mat('stone', 0x9aa3ad), rope = mat('rope', 0xd9c9a2);

    c.line(0.085, wood); c.seg(-0.40, 0.40, -0.05, 0.05);      // 자루
    c.fill(woodD); c.circ(-0.41, 0.41, 0.055);                 // 자루 끝

    var A = ax(-0.06, 0.06, 0.36, -0.36);
    // 한쪽은 매끄러운 날, 반대쪽은 톱니처럼 떨어져 나간 박리면 → '깨진 돌'로 읽힌다
    c.fill(st);
    c.fillP([A(0, -0.085), A(0.30, -0.118), A(0.66, -0.085), A(1, 0),
             A(0.80, 0.055), A(0.66, 0.118), A(0.50, 0.058),
             A(0.34, 0.125), A(0.16, 0.068), A(0, 0.10)]);
    c.fill(tint(st, 0.32));                                    // 넓은 박리면 (밝은 면)
    c.fillP([A(0.05, -0.062), A(0.92, -0.012), A(0.44, 0.030), A(0.10, 0.052)]);
    c.line(0.030, tint(st, -0.38)); c.segP(A(0.05, -0.075), A(0.95, -0.012));   // 날 능선

    c.line(0.055, rope);                                       // 결합부 밧줄 2줄
    c.seg(-0.135, 0.065, -0.065, 0.135);
    c.seg(-0.055, -0.015, 0.015, 0.055);
  }

  // w2 청동 도끼 : 자루 한쪽에만 붙은 넓은 반달 날 (eggart 손도끼와 같은 관용)
  function w2(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var wood = mat('wood', 0x8a6a45), woodD = mat('woodDark', 0x5a452c);
    var br = mat('bronze', 0xc9993f), rope = mat('rope', 0xd9c9a2);

    c.line(0.078, wood); c.seg(-0.36, 0.40, 0.24, -0.36);      // 긴 자루
    c.fill(woodD); c.circ(-0.37, 0.41, 0.055);

    var head = [[0.02, -0.08], [0.18, -0.29], [0.40, -0.26], [0.46, -0.06], [0.30, 0.06], [0.12, 0.02]];
    c.fill(br); c.fillP(head);
    c.fill(tint(br, 0.30));                                    // 날 안쪽 사면
    c.fillP([[0.10, -0.10], [0.22, -0.24], [0.35, -0.21], [0.40, -0.075], [0.28, 0.005], [0.16, -0.02]]);
    c.line(0.038, tint(br, 0.55));                             // 갈아 놓은 날
    c.seg(0.40, -0.26, 0.46, -0.06); c.seg(0.46, -0.06, 0.30, 0.06);
    c.line(0.026, tint(br, -0.38)); c.strokeP(head);

    c.line(0.048, rope);                                       // 자루-날 결속
    c.seg(-0.043, -0.134, 0.043, -0.066);
    c.seg(0.087, -0.274, 0.173, -0.206);
    if (c.fine) {                                              // 손잡이 감기
      c.line(0.040, rope);
      c.seg(-0.336, 0.363, -0.264, 0.307);
      c.seg(-0.281, 0.293, -0.209, 0.237);
      c.seg(-0.226, 0.223, -0.154, 0.167);
    }
  }

  // w3 흑요석 검 : 가장 길다. 검은 유리질 양날 + 청동 코등이·자루끝 구슬.
  function w3(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var br = mat('bronze', 0xc9993f), leD = mat('leatherDark', 0x5f4630);

    c.line(0.078, leD); c.seg(-0.36, 0.38, -0.19, 0.21);       // 가죽 감은 자루
    if (c.fine) {
      c.line(0.022, tint(leD, 0.30));
      c.seg(-0.345, 0.305, -0.285, 0.365);
      c.seg(-0.295, 0.255, -0.235, 0.315);
      c.seg(-0.245, 0.205, -0.185, 0.265);
    }
    c.fill(br); c.circ(-0.39, 0.41, 0.062);                    // 자루 끝 구슬
    c.fill(tint(br, 0.42)); c.circ(-0.405, 0.395, 0.024);

    c.line(0.072, br);                                         // 코등이 (날밑)
    c.seg(-0.263, 0.097, -0.077, 0.281);
    c.fill(tint(br, 0.35)); c.circ(-0.17, 0.19, 0.045);

    var A = ax(-0.14, 0.16, 0.44, -0.44);
    var blade = [A(0, 0.100), A(0.55, 0.085), A(0.88, 0.048), A(1, 0),
                 A(0.88, -0.048), A(0.55, -0.085), A(0, -0.100)];
    c.fill(C.obsidian); c.fillP(blade);
    c.fill(C.obsidianLite);                                    // 유리질 광택 (한쪽 면)
    c.fillP([A(0.03, -0.082), A(0.90, -0.040), A(0.58, -0.012), A(0.12, -0.020)]);
    c.fill(tint(C.obsidian, 0.10));                            // 박리 조각면
    c.fillP([A(0.20, 0.088), A(0.62, 0.072), A(0.44, 0.014), A(0.24, 0.020)]);
    // 밝은 테두리 — 어두운 테마에서 이 선이 검을 배경에서 떼어낸다
    c.line(0.028, C.obsidianEdge, 0.95); c.strokeP(blade);
    c.line(0.020, tint(C.obsidian, -0.40), 0.9);               // 중앙 홈
    c.segP(A(0.06, 0), A(0.94, 0));
  }

  // ============================================================================
  //  방어구 — 가죽 → 뼈 → 거북등
  // ============================================================================

  // 세 방어구가 공유하는 조끼 실루엣 (a3 만 껍질로 갈아탄다)
  var VEST = [[-0.29, -0.26], [-0.13, -0.31], [0, -0.20], [0.13, -0.31], [0.29, -0.26],
              [0.35, -0.06], [0.26, 0.00], [0.29, 0.30], [-0.29, 0.30], [-0.26, 0.00], [-0.35, -0.06]];

  // a1 가죽 갑옷 : 민무늬 조끼 + 허리띠. 가장 단순하다.
  function a1(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var le = mat('leather', 0x8d6b4b), leD = mat('leatherDark', 0x5f4630);
    var br = mat('bronze', 0xc9993f);

    c.fill(le); c.fillP(VEST);
    c.fill(tint(le, 0.20));                                    // 가슴 밝은 면
    c.fillP([[-0.20, -0.20], [0, -0.12], [0.20, -0.20], [0.22, 0.04], [-0.22, 0.04]]);
    c.fill(leD); c.rect(-0.30, 0.13, 0.60, 0.085);             // 허리띠
    c.fill(br); c.rrect(-0.055, 0.122, 0.11, 0.098, 0.024);    // 버클
    c.fill(tint(le, 0.24));                                    // 어깨 덧댐
    c.rrect(-0.27, -0.29, 0.14, 0.105, 0.035);
    c.rrect(0.13, -0.29, 0.14, 0.105, 0.035);
    if (c.fine) {                                              // 바느질 자국
      c.line(0.020, tint(le, 0.45), 0.9);
      c.seg(-0.15, -0.08, -0.15, 0.06);
      c.seg(0.15, -0.08, 0.15, 0.06);
    }
    c.line(0.034, leD); c.strokeP(VEST);
  }

  // a2 뼈 갑옷 : 어두운 가죽 위에 등뼈+갈비 뼈판, 어깨에 뼈가시 → 실루엣이 넓어진다.
  function a2(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var le = mat('leather', 0x8d6b4b), bone = mat('bone', 0xeae3cd);
    var rope = mat('rope', 0xd9c9a2);
    var i, y, ex;

    c.fill(bone);                                              // 어깨 뼈가시 (몸통보다 먼저)
    c.tri(-0.27, -0.20, -0.47, -0.40, -0.14, -0.29);
    c.tri(0.27, -0.20, 0.47, -0.40, 0.14, -0.29);
    c.fill(tint(le, -0.34)); c.fillP(VEST);                    // 어두운 가죽 바탕

    c.fill(bone); c.rrect(-0.05, -0.24, 0.10, 0.46, 0.028);    // 등뼈
    for (i = 0; i < 3; i++) {                                  // 갈비 3쌍
      y = -0.16 + i * 0.125;
      ex = [0.30, 0.335, 0.25][i];
      c.fill(bone);
      c.fillP([[-0.045, y - 0.030], [-ex, y + 0.020], [-ex, y + 0.078], [-0.045, y + 0.036]]);
      c.fillP([[0.045, y - 0.030], [ex, y + 0.020], [ex, y + 0.078], [0.045, y + 0.036]]);
      if (c.fine) {
        c.line(0.018, tint(bone, -0.32), 0.85);
        c.seg(-0.05, y + 0.074, -ex, y + 0.074);
        c.seg(0.05, y + 0.074, ex, y + 0.074);
      }
    }
    c.fill(rope); c.circ(0, -0.245, 0.052);                    // 목 밑 결속
    c.line(0.034, tint(le, -0.55)); c.strokeP(VEST);
  }

  // a3 거북등 갑옷 : 조끼가 아니라 둥근 등껍질. 육각 갑판 + 두꺼운 테두리.
  function a3(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var le = mat('leather', 0x8d6b4b), rope = mat('rope', 0xd9c9a2);
    var i, a;

    var SH = [[-0.40, 0.11], [-0.36, -0.14], [-0.20, -0.30], [0, -0.36], [0.20, -0.30],
              [0.36, -0.14], [0.40, 0.11], [0.22, 0.23], [0, 0.26], [-0.22, 0.23]];
    c.fill(le); c.rrect(-0.46, 0.02, 0.13, 0.17, 0.04);        // 어깨끈 (껍질보다 먼저)
    c.rrect(0.33, 0.02, 0.13, 0.17, 0.04);

    c.fill(C.shellDark); c.fillP(SH);                          // 두꺼운 테두리
    c.fill(C.shellGreen); c.fillP(shrink(SH, 0.82, 0, -0.04)); // 등판
    hexAt(c, 0, -0.07, 0.135, C.shellLite, C.shellDark);       // 중앙 갑판
    hexAt(c, -0.225, -0.03, 0.105, tint(C.shellLite, -0.16), C.shellDark);
    hexAt(c, 0.225, -0.03, 0.105, tint(C.shellLite, -0.16), C.shellDark);
    hexAt(c, 0, -0.255, 0.088, tint(C.shellLite, -0.24), C.shellDark);
    for (i = -2; i <= 2; i++) {                                // 아래 테두리 갑판
      a = i * 0.145;
      c.fill(tint(C.shellDark, 0.30));
      c.fillP([[a - 0.058, 0.135], [a + 0.058, 0.135], [a + 0.046, 0.225], [a - 0.046, 0.225]]);
    }
    c.fill(tint(C.shellLite, 0.40), 0.45);                     // 광택
    c.ell(-0.13, -0.21, 0.26, 0.11);
    c.line(0.030, C.shellDark); c.strokeP(SH);
    c.fill(rope); c.circ(-0.40, 0.10, 0.045); c.circ(0.40, 0.10, 0.045);
  }

  // ============================================================================
  //  신발 — 짚신 → 가죽 장화 → 깃털 장화
  // ============================================================================

  // b1 짚신 : 납작하다. 짜인 밑창 + Y자 끈. 장화들과 높이부터 다르다.
  function b1(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var rope = mat('rope', 0xd9c9a2), woodD = mat('woodDark', 0x5a452c);
    var i, t;

    var SOLE = [[-0.36, 0.10], [-0.27, -0.02], [0.16, -0.05], [0.33, 0.05],
                [0.35, 0.19], [0.16, 0.30], [-0.21, 0.30], [-0.36, 0.21]];
    c.fill(tint(rope, -0.30)); c.fillP(SOLE);                  // 밑창 그늘
    c.fill(rope); c.fillP(shrink(SOLE, 0.88, -0.02, 0.11));    // 짚 바닥

    if (c.fine) {                                              // 엮은 짚 무늬
      c.line(0.024, tint(rope, -0.34), 0.9);
      for (i = 0; i < 6; i++) {
        t = -0.26 + i * 0.105;
        c.seg(t, 0.00, t - 0.045, 0.26);
      }
      c.line(0.022, tint(rope, -0.34), 0.9);
      c.seg(-0.30, 0.13, 0.33, 0.10);
    }
    c.line(0.048, tint(rope, 0.22));                           // Y자 끈
    c.seg(0.03, -0.15, 0.24, 0.045);
    c.seg(0.03, -0.15, -0.05, 0.10);
    c.seg(0.03, -0.15, -0.26, 0.02);
    c.fill(woodD); c.circ(0.03, -0.16, 0.048);                 // 매듭
    if (c.fine) {                                              // 삐져나온 짚
      c.line(0.018, tint(rope, -0.20), 0.9);
      c.seg(0.33, 0.06, 0.44, 0.01);
      c.seg(0.34, 0.13, 0.46, 0.13);
      c.seg(0.33, 0.19, 0.43, 0.24);
    }
  }

  // b2 가죽 장화 : L자 실루엣. 목 있는 장화 + 두꺼운 밑창 + 끈.
  function b2(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var le = mat('leather', 0x8d6b4b), leD = mat('leatherDark', 0x5f4630);
    var rope = mat('rope', 0xd9c9a2);
    var i, y;

    var BOOT = [[-0.14, -0.32], [0.14, -0.32], [0.15, 0.01], [0.36, 0.07], [0.40, 0.20],
                [-0.18, 0.20], [-0.16, -0.08]];
    c.fill(le); c.fillP(BOOT);
    c.fill(tint(le, 0.20));                                    // 앞면 밝은 면
    c.fillP([[-0.02, -0.28], [0.12, -0.28], [0.13, 0.02], [0.33, 0.07], [0.34, 0.16], [-0.02, 0.16]]);
    c.fill(tint(le, 0.30));                                    // 목 접힌 부분
    c.rrect(-0.18, -0.38, 0.35, 0.115, 0.036);
    c.fill(leD);                                               // 밑창
    c.fillP([[-0.19, 0.145], [0.40, 0.185], [0.42, 0.28], [-0.21, 0.28]]);
    c.line(0.022, rope, 0.9); c.seg(-0.19, 0.155, 0.40, 0.195);   // 웰트 박음질
    if (c.fine) {                                              // 끈 X 3개
      c.line(0.026, rope);
      for (i = 0; i < 3; i++) {
        y = -0.21 + i * 0.095;
        c.seg(-0.075, y, 0.085, y + 0.055);
        c.seg(0.085, y, -0.075, y + 0.055);
      }
    }
    c.fill(tint(le, -0.28));                                   // 발등 덧가죽
    c.fillP([[0.16, 0.03], [0.35, 0.085], [0.37, 0.15], [0.16, 0.14]]);
    c.line(0.030, leD); c.strokeP(BOOT);
  }

  // b3 깃털 장화 : 장화 + 발목 날개깃. 청동 테를 둘러 최상급 티가 나게.
  function b3(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var le = mat('leather', 0x8d6b4b), leD = mat('leatherDark', 0x5f4630);
    var br = mat('bronze', 0xc9993f), fe = mat('feather', 0xe0705a);

    featherAt(c, -0.11, -0.02, -0.45, -0.16, 0.055, tint(fe, -0.18));   // 날개깃 3장
    featherAt(c, -0.11, 0.045, -0.48, 0.03, 0.062, fe);
    featherAt(c, -0.11, 0.11, -0.42, 0.19, 0.052, tint(fe, 0.14));

    var BOOT = [[-0.12, -0.28], [0.13, -0.28], [0.14, 0.03], [0.33, 0.08], [0.37, 0.20],
                [-0.16, 0.20], [-0.14, -0.06]];
    c.fill(tint(le, 0.12)); c.fillP(BOOT);
    c.fill(tint(le, 0.32));
    c.fillP([[-0.01, -0.24], [0.11, -0.24], [0.12, 0.04], [0.30, 0.09], [0.31, 0.16], [-0.01, 0.16]]);
    c.fill(br); c.rrect(-0.16, -0.36, 0.32, 0.105, 0.034);     // 청동 테
    c.fill(tint(br, 0.45)); c.circ(0, -0.308, 0.030);
    featherAt(c, 0.05, -0.28, 0.24, -0.46, 0.045, fe);         // 목에 꽂은 깃 하나
    c.fill(leD);                                               // 밑창
    c.fillP([[-0.17, 0.15], [0.37, 0.19], [0.39, 0.28], [-0.19, 0.28]]);
    c.line(0.024, br, 0.95); c.seg(-0.17, 0.16, 0.37, 0.20);   // 청동 웰트
    c.line(0.028, leD); c.strokeP(BOOT);
  }

  // ============================================================================
  //  물약 — 옹달샘 물 → 말린 열매 → 약초 주머니
  // ============================================================================

  // p1 옹달샘 물 : 작은 점토 호리병. 물방울 표식으로 '물'을 못박는다.
  function p1(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var clay = mat('clay', 0xb5794a), rope = mat('rope', 0xd9c9a2);
    var leaf = mat('leaf', 0x63c26a);

    c.fill(tint(clay, -0.22)); c.rect(-0.062, -0.24, 0.124, 0.20);   // 목
    c.fill(tint(clay, -0.32)); c.rrect(-0.105, -0.29, 0.21, 0.075, 0.026);  // 아귀
    leafAt(c, 0, -0.28, 0.13, -0.44, 0.055, leaf, tint(leaf, -0.35));       // 잎 마개
    c.fill(clay); c.circ(0, 0.10, 0.215);                      // 몸통
    c.fill(tint(clay, 0.24)); c.circ(-0.045, 0.065, 0.165);
    c.fill(C.water);                                           // 물방울 표식
    c.fillP([[0, -0.045], [0.062, 0.055], [0.100, 0.135], [0.062, 0.205],
             [0, 0.230], [-0.062, 0.205], [-0.100, 0.135], [-0.062, 0.055]]);
    c.fill(C.waterLite); c.ell(-0.035, 0.105, 0.070, 0.048);
    c.line(0.034, rope); c.seg(-0.115, -0.115, 0.115, -0.115); // 목에 감은 끈
    c.fill(tint(rope, -0.28)); c.circ(0.115, -0.112, 0.036);
    if (c.fine) {                                              // 샘물 반짝임
      c.line(0.024, C.waterLite, 0.9);
      c.seg(0.215, -0.29, 0.285, -0.22);
      c.seg(0.285, -0.29, 0.215, -0.22);
    }
  }

  // p2 말린 열매 : 그릇이 아니다 — 열매 세 알 덩어리. 실루엣이 완전히 다르다.
  function p2(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var wood = mat('wood', 0x8a6a45), leaf = mat('leaf', 0x63c26a);
    var i, b;

    c.line(0.036, wood); c.seg(0.02, -0.36, -0.01, -0.05);     // 줄기
    leafAt(c, -0.03, -0.30, -0.28, -0.36, 0.075, leaf, tint(leaf, -0.35));
    leafAt(c, 0.02, -0.27, 0.26, -0.30, 0.070, tint(leaf, -0.14), tint(leaf, -0.40));
    c.line(0.024, wood);                                       // 열매 꼭지
    c.seg(-0.01, -0.06, -0.15, 0.00); c.seg(-0.01, -0.06, 0.15, -0.01); c.seg(-0.01, -0.06, 0.00, 0.10);

    var BB = [[-0.16, 0.07, 0.150], [0.16, 0.05, 0.140], [0.00, 0.235, 0.135]];
    for (i = 0; i < 3; i++) {
      b = BB[i];
      c.fill(C.berry); c.circ(b[0], b[1], b[2]);
      c.fill(tint(C.berry, -0.35));                            // 말라서 쭈그러든 면
      c.circ(b[0] + b[2] * 0.30, b[1] + b[2] * 0.34, b[2] * 0.52);
      c.fill(C.berryLite); c.circ(b[0] - b[2] * 0.30, b[1] - b[2] * 0.34, b[2] * 0.30);
      // 밝은 테두리 — 어두운 테마에서 열매가 패널에 묻히지 않게
      c.line(0.022, tint(C.berry, 0.40), 0.95); c.scirc(b[0], b[1], b[2]);
      if (c.fine) { c.line(0.018, tint(C.berry, -0.50), 0.8); c.seg(b[0] - b[2] * 0.1, b[1] - b[2] * 0.65, b[0] + b[2] * 0.15, b[1] - b[2] * 0.2); }
    }
  }

  // p3 약초 주머니 : 가장 크다. 아귀를 묶은 삼베 주머니 + 삐져나온 약초.
  function p3(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var rope = mat('rope', 0xd9c9a2), leaf = mat('leaf', 0x63c26a);
    var leafD = mat('leafDark', 0x3f8a4a), wood = mat('wood', 0x8a6a45);

    // 약초 다발 — 주머니보다 먼저 그려 아귀에 물린 것처럼 보이게
    c.line(0.026, leafD); c.seg(-0.06, -0.10, -0.17, -0.33);
    c.seg(0.00, -0.10, 0.02, -0.40); c.seg(0.06, -0.10, 0.18, -0.31);
    leafAt(c, -0.14, -0.26, -0.30, -0.40, 0.062, leaf, tint(leaf, -0.35));
    leafAt(c, -0.15, -0.30, -0.05, -0.42, 0.052, tint(leaf, -0.18));
    leafAt(c, 0.01, -0.31, -0.08, -0.46, 0.055, leaf, tint(leaf, -0.35));
    leafAt(c, 0.02, -0.33, 0.14, -0.45, 0.050, tint(leaf, -0.18));
    leafAt(c, 0.15, -0.25, 0.32, -0.34, 0.058, leaf, tint(leaf, -0.35));

    var BAG = [[-0.16, -0.09], [0.16, -0.09], [0.31, 0.03], [0.35, 0.18],
               [0.22, 0.31], [-0.22, 0.31], [-0.35, 0.18], [-0.31, 0.03]];
    c.fill(tint(C.cloth, -0.26)); c.fillP(BAG);
    c.fill(C.cloth); c.fillP(shrink(BAG, 0.86, -0.03, 0.10));  // 천 밝은 면
    if (c.fine) {                                              // 주름
      c.line(0.020, tint(C.cloth, -0.34), 0.9);
      c.seg(-0.12, 0.00, -0.17, 0.24);
      c.seg(0.04, -0.02, 0.06, 0.27);
      c.seg(0.19, 0.02, 0.24, 0.22);
    }
    c.fill(tint(rope, -0.34)); c.rrect(-0.175, -0.145, 0.35, 0.095, 0.030);  // 아귀 묶음
    c.line(0.034, rope);                                       // 늘어진 끈
    c.seg(0.15, -0.10, 0.32, -0.02); c.seg(0.15, -0.10, 0.30, 0.09);
    c.fill(wood); c.circ(0.155, -0.105, 0.048);                // 매듭
    c.line(0.030, tint(C.cloth, -0.45)); c.strokeP(BAG);
  }

  // ── 알 수 없는 키 — 나무 상자 ────────────────────────────────
  function box(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var wood = mat('wood', 0x8a6a45), woodD = mat('woodDark', 0x5a452c);
    var br = mat('bronze', 0xc9993f);
    c.fill(wood); c.rrect(-0.34, -0.28, 0.68, 0.58, 0.055);
    c.fill(tint(wood, 0.22)); c.rect(-0.30, -0.24, 0.60, 0.14);
    c.fill(woodD); c.rect(-0.30, 0.02, 0.60, 0.075);
    c.line(0.030, woodD); c.seg(-0.26, -0.24, 0.26, 0.26); c.seg(0.26, -0.24, -0.26, 0.26);
    c.fill(br); c.rect(-0.34, -0.28, 0.09, 0.09); c.rect(0.25, -0.28, 0.09, 0.09);
    c.rect(-0.34, 0.21, 0.09, 0.09); c.rect(0.25, 0.21, 0.09, 0.09);
  }

  // ============================================================================
  //  진입점
  // ============================================================================
  var DRAW = { w1: w1, w2: w2, w3: w3, a1: a1, a2: a2, a3: a3,
               b1: b1, b2: b2, b3: b3, p1: p1, p2: p2, p3: p3 };

  UI.ITEM_ART_KEYS = ['w1', 'w2', 'w3', 'a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'p1', 'p2', 'p3'];

  //  g 에만 그린다. 반환값 없음 · 상태 없음.
  UI.drawItem = function (g, slotKey, itemKey, cx, cy, size) {
    if (!g) return;
    var U = (typeof size === 'number' && isFinite(size) && size > 4) ? size : 48;
    if (typeof cx !== 'number' || !isFinite(cx)) cx = 0;
    if (typeof cy !== 'number' || !isFinite(cy)) cy = 0;
    var fn = DRAW[itemKey] || box;

    // 라이트 테마에서는 eggart 의 inkLayer 가 같은 그림을 잉크색으로 한 번 더,
    // 조금 부풀려 뒤에 찍는다(스티커 테두리). 어두운 테마에서는 그냥 지나간다.
    // r 로 U*0.38 을 넘긴다 → size 56 에서 윤곽 두께 k ≈ 2.4px (계란과 같은 비율).
    if (typeof UI.inkLayer === 'function') {
      UI.inkLayer(g, U * 0.38, function (gg) { fn(gg, cx, cy, U); });
    } else {
      fn(g, cx, cy, U);
    }
  };

})(GAME.UI);
