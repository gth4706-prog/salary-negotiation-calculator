// ============================================================================
//  Egg War — 아이템 아이콘 아트
//  (무기 8 · 방어구 8 · 신발 8 · 물약 3 · 장신구 8 — 2026-08-01 통곡의 탑 상점
//   확충 때 각 4~8단계 및 장신구 슬롯을 새로 추가했다. 물약 3종은 대전·수성의
//   탑이 쓰는 옛 카탈로그 그대로다.)
//  이미지 애셋 없음. Phaser.GameObjects.Graphics 도형 API 만 쓴다.
//  eggart.js 와 같은 손맛: 재질 팔레트(UI.MAT) + 라이트 테마 잉크 윤곽(UI.inkLayer).
//
//  API
//    GAME.UI.drawItem(g, slotKey, itemKey, cx, cy, size)
//      g       : Phaser Graphics (또는 eggart 의 잉크 프록시)
//      slotKey : 'weapon' | 'armor' | 'boots' | 'potion' | 'accessory' (없어도 동작 — itemKey 로 찾는다)
//      itemKey : 'w1'~'w8' | 'a1'~'a8' | 'b1'~'b8' | 'p1'~'p3' | 'c1'~'c8'
//      cx, cy  : 아이콘 중심
//      size    : 아이콘 한 변(px). 권장 40~80. 모든 좌표가 이 값의 비율이다.
//    → 알 수 없는 키는 나무 상자 아이콘을 그린다(빈 칸이 생기지 않게).
//
//  ⚠ 4~8단계·장신구는 기존 12종보다 장식 레이어(바느질·잔짚 등 미세 디테일)를
//    줄였다 — 32칸을 다 감당하면서 실루엣+2톤 대비는 그대로 지키는 선에서 밀도를
//    낮춘 것이다(디자인 검토 의견 #1·#12). 새 재질색은 이 파일 상단의 `C` 객체
//    후반부(steel·darkIron·fang·dawnGold·scaleTeal·earthBrown·gilt·fur·windPale·
//    ghostPale·stormDark·shadowInk·swampGreen)에 몰아 뒀다 — `UI.MAT`(eggart.js
//    공용 재질)에는 안 더했다. 이 아이템들만 쓰는 색이라 공용 팔레트를 늘리면
//    다른 화면에 영향이 갈 수 있기 때문이다.
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
    cloth:        0xC9B487,   // 삼베 주머니

    // ── 2026-08-01 · 통곡의 탑 상점 확장(4~8단계 + 장신구) 전용 색 ──────────────
    //  기존 12종(물약 포함)과 같은 원칙: 재질이 등급을 말한다. 상위 재질일수록
    //  1~3단계보다 채도·명도 대비를 키워 "더 좋아 보인다"가 실루엣 없이도 읽히게 했다.
    steel:        0x9AA4B4,   // 강철 — bronze(청동)보다 차갑고 밝다
    steelDark:    0x5C6675,
    darkIron:     0x2E3138,   // 흑철 — iron(0x4b5260)보다 더 어둡다
    fang:         0xEFE6C8,   // 용골(뼈보다 상아빛이 강하다)
    fangEdge:     0xC9BB8E,
    dawnGold:     0xF2B24A,   // '여명' 계열 아이템 공통 강조색(장식용, 실루엣은 재질이 담당)
    dawnGlow:     0xFFE1A6,
    scaleTeal:    0x2E6B5E,   // 용비늘
    scaleTealLite:0x59A38C,
    earthBrown:   0x6B5230,   // 대지의 갑주
    earthMoss:    0x7C8F4A,
    gilt:         0xE8C25A,   // 불멸의 등딱지 금테
    fur:          0xD9B98A,   // 여우가죽
    furDark:      0xB08F5E,
    windPale:     0xE6F3F2,   // 바람 신발
    ghostPale:    0xD8D6EC,   // 유령 걸음(옅은 보랏빛 흰색)
    stormDark:    0x2B2E45,   // 폭풍 딛기
    stormBolt:    0xF4E86A,
    shadowInk:    0x2A2338,   // 그림자 반지
    swampGreen:   0x4C6B3A,   // 늪지 정수병
    swampGlow:    0x9ED14E
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
  //  무기 4~8단계 (2026-08-01, 통곡의 탑 상점 확충) — 뼈창 → 강철 손도끼 →
  //  흑철 대검 → 용골 단검 → 여명의 창.
  //  ⚠ 기존 12종보다 장식 레이어를 줄였다(디자인 검토 의견 #1 — 실루엣+2톤 우선,
  //    바느질·잔짚 같은 미세 디테일은 뺐다) — 32칸을 감당할 수 있는 밀도로 낮춘 것이다.
  // ============================================================================

  // w4 뼈창 : 창이라 실루엣이 검·도끼보다 훨씬 길고 가늘다(축 하나 + 좁은 촉).
  function w4(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var wood = mat('wood', 0x8a6a45), woodD = mat('woodDark', 0x5a452c);
    var bone = mat('bone', 0xeae3cd), rope = mat('rope', 0xd9c9a2);
    var A = ax(-0.40, 0.40, 0.30, -0.40);

    c.line(0.058, wood); c.segP(A(0, 0), A(0.78, 0));           // 긴 자루
    c.fill(woodD); c.circ(A(0, 0)[0], A(0, 0)[1], 0.045);
    c.line(0.040, rope); c.segP(A(0.60, -0.02), A(0.68, 0.02)); // 결속

    c.fill(bone);                                                // 뼈 촉(좁고 긴 삼각)
    c.fillP([A(0.72, -0.075), A(1, 0), A(0.72, 0.075), A(0.80, 0)]);
    c.line(0.020, tint(bone, -0.30), 0.9); c.segP(A(0.74, 0), A(0.98, 0));
  }

  // w5 강철 손도끼 : w2(청동 도끼)와 같은 관용이지만 더 넓은 날 + 리벳으로 상급을 낸다.
  function w5(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var wood = mat('wood', 0x8a6a45), woodD = mat('woodDark', 0x5a452c);
    var st = C.steel, stD = C.steelDark;

    c.line(0.082, wood); c.seg(-0.34, 0.40, 0.22, -0.34);
    c.fill(woodD); c.circ(-0.35, 0.41, 0.058);

    var head = [[0.00, -0.10], [0.20, -0.36], [0.46, -0.32], [0.52, -0.06], [0.32, 0.09], [0.10, 0.03]];
    c.fill(stD); c.fillP(head);
    c.fill(st);
    c.fillP([[0.10, -0.12], [0.24, -0.30], [0.40, -0.26], [0.44, -0.09], [0.28, 0.01], [0.14, -0.03]]);
    c.fill(tint(st, 0.45));                                      // 갈아 놓은 날
    c.seg(0.46, -0.32, 0.52, -0.06); c.seg(0.52, -0.06, 0.32, 0.09);
    c.fill(mat('bronze', 0xc9993f));                              // 리벳 2개(강철=상급 표식)
    c.circ(0.18, -0.16, 0.026); c.circ(0.30, -0.10, 0.026);
    c.line(0.024, stD); c.strokeP(head);
  }

  // w6 흑철 대검 : 셋 중 가장 넓고 두꺼운 양날. 검게 벼린 철이라 광택이 거의 없다.
  function w6(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var leD = mat('leatherDark', 0x5f4630), br = mat('bronze', 0xc9993f);
    var di = C.darkIron;

    c.line(0.090, leD); c.seg(-0.38, 0.40, -0.20, 0.22);         // 두꺼운 자루
    c.fill(br); c.circ(-0.40, 0.41, 0.058);
    c.line(0.075, br); c.seg(-0.29, 0.11, -0.09, 0.31);          // 코등이

    var A = ax(-0.16, 0.14, 0.46, -0.44);
    var blade = [A(0, 0.130), A(0.50, 0.115), A(0.86, 0.062), A(1, 0),
                 A(0.86, -0.062), A(0.50, -0.115), A(0, -0.130)];
    c.fill(di); c.fillP(blade);
    c.fill(tint(di, 0.20));                                      // 무딘 반광
    c.fillP([A(0.06, -0.095), A(0.80, -0.045), A(0.42, -0.010), A(0.10, -0.020)]);
    c.line(0.026, tint(di, 0.60), 0.85); c.strokeP(blade);        // 밝은 테두리(다크테마 대비)
    c.line(0.022, tint(di, -0.40), 0.9); c.segP(A(0.08, 0), A(0.92, 0));
  }

  // w7 용골 단검 : 짧고 휘어진 어금니 모양 — 검·도끼·창과 실루엣이 확실히 다르다.
  function w7(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var leD = mat('leatherDark', 0x5f4630), br = mat('bronze', 0xc9993f);
    var fg = C.fang, fgE = C.fangEdge;

    c.line(0.060, leD); c.seg(-0.30, 0.34, -0.13, 0.16);
    c.fill(br); c.circ(-0.31, 0.35, 0.045);
    c.line(0.055, br); c.seg(-0.22, 0.07, -0.06, 0.23);

    // 완만히 휜 어금니 실루엣(직선 대신 이차곡선을 짧은 폴리라인으로 근사)
    c.fill(fg);
    c.fillP([[-0.12, 0.10], [0.02, -0.08], [0.20, -0.28], [0.34, -0.40],
             [0.30, -0.30], [0.16, -0.14], [0.02, 0.04], [-0.06, 0.14]]);
    c.fill(tint(fg, -0.14));
    c.fillP([[-0.05, 0.06], [0.10, -0.14], [0.24, -0.32], [0.16, -0.16], [0.02, 0.00]]);
    c.line(0.020, fgE, 0.9); c.seg(0.30, -0.30, 0.34, -0.40); c.seg(-0.12, 0.10, -0.06, 0.14);
  }

  // w8 여명의 창 : w4 뼈창의 확대판 + 청동 소켓·금빛 장식(최상급 표식, 색만이 아니라
  // 촉 형태를 더 크고 겹장식으로 키워 실루엣으로도 구분된다).
  function w8(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var wood = mat('wood', 0x8a6a45), br = mat('bronze', 0xc9993f);
    var fe = mat('feather', 0xe0705a);
    var A = ax(-0.42, 0.40, 0.28, -0.42);

    c.line(0.062, wood); c.segP(A(0, 0), A(0.66, 0));
    c.fill(br); c.circ(A(0, 0)[0], A(0, 0)[1], 0.048);
    featherAt(c, A(0.30, 0)[0], A(0.30, 0)[1], A(0.30, 0)[0] - 0.10, A(0.30, 0)[1] - 0.16, 0.05, fe);

    c.fill(br); c.rrect(A(0.60, -0.05)[0], A(0.60, -0.05)[1], 0.10, 0.10, 0.02); // 청동 소켓
    c.fill(C.dawnGold);                                          // 넓은 촉
    c.fillP([A(0.62, -0.11), A(0.98, -0.03), A(1, 0), A(0.98, 0.03), A(0.62, 0.11), A(0.72, 0)]);
    c.fill(C.dawnGlow, 0.9);
    c.fillP([A(0.66, -0.06), A(0.92, -0.015), A(0.66, 0.01)]);
    c.line(0.020, tint(C.dawnGold, -0.35), 0.9); c.segP(A(0.64, 0), A(0.97, 0));
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
  //  방어구 4~8단계 — 강철 흉갑 → 흑요석 판금 → 용비늘 갑옷 → 대지의 갑주 →
  //  불멸의 등딱지. VEST(조끼) 실루엣을 4~5단계까지 이어 쓰고(재질로 등급),
  //  6~7단계에서 거북등(a3)과 다른 새 실루엣으로 넘어간다(대지·불멸은 등껍질류).
  // ============================================================================

  // a4 강철 흉갑 : 조끼 위에 판금 두 장(가슴판). 뼈갑옷보다 매끈하고 각지다.
  function a4(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var le = mat('leather', 0x8d6b4b), leD = mat('leatherDark', 0x5f4630);
    var st = C.steel, stD = C.steelDark;

    c.fill(tint(le, -0.20)); c.fillP(VEST);
    c.fill(stD);                                                 // 가슴판 2장
    c.fillP([[-0.24, -0.24], [-0.02, -0.16], [-0.02, 0.22], [-0.24, 0.16]]);
    c.fillP([[0.24, -0.24], [0.02, -0.16], [0.02, 0.22], [0.24, 0.16]]);
    c.fill(st);
    c.fillP([[-0.20, -0.20], [-0.05, -0.14], [-0.05, 0.10], [-0.20, 0.06]]);
    c.fillP([[0.20, -0.20], [0.05, -0.14], [0.05, 0.10], [0.20, 0.06]]);
    c.fill(mat('bronze', 0xc9993f));                              // 중앙 죔쇠 3개
    c.circ(0, -0.10, 0.030); c.circ(0, 0.03, 0.030); c.circ(0, 0.16, 0.030);
    c.line(0.028, stD); c.seg(-0.02, -0.16, -0.02, 0.22); c.seg(0.02, -0.16, 0.02, 0.22);
    c.line(0.032, leD); c.strokeP(VEST);
  }

  // a5 흑요석 판금 : 강철 흉갑보다 더 넓은 판 + 유리질 광택(무기 w3 와 같은 재질 언어).
  function a5(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var ob = C.obsidian, obE = C.obsidianEdge;

    c.fill(tint(ob, 0.12)); c.fillP(VEST);
    var PL = shrink(VEST, 0.90, 0, -0.02);
    c.fill(ob); c.fillP(PL);
    c.fill(C.obsidianLite, 0.55);                                // 광택 밴드
    c.fillP([[-0.20, -0.16], [0.20, -0.16], [0.16, -0.02], [-0.16, -0.02]]);
    c.fill(tint(ob, 0.20));
    c.fillP([[-0.14, 0.02], [0.14, 0.02], [0.11, 0.22], [-0.11, 0.22]]);
    c.line(0.026, obE, 0.95); c.strokeP(PL);                      // 밝은 테두리(다크테마 대비)
    c.line(0.018, obE, 0.7); c.seg(0, -0.28, 0, 0.28);
  }

  // a6 용비늘 갑옷 : 겹친 비늘 — hexAt 을 작은 반원 형태로 눕혀 비늘 열을 만든다.
  function a6(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var teal = C.scaleTeal, tealL = C.scaleTealLite;
    var row, col, y, x, w;

    c.fill(tint(teal, -0.35)); c.fillP(VEST);
    for (row = 0; row < 4; row++) {
      y = -0.20 + row * 0.135;
      w = 0.30 - row * 0.02;
      for (col = -1; col <= 1; col++) {
        x = col * 0.16 + (row % 2 ? 0.08 : 0);
        if (Math.abs(x) > w) continue;
        c.fill(row % 2 ? tealL : teal);
        c.ell(x, y, 0.11, 0.075);
        c.line(0.014, tint(teal, -0.45), 0.8); c.scirc(x, y, 0.055);
      }
    }
    c.line(0.030, tint(teal, -0.5)); c.strokeP(VEST);
  }

  // a7 대지의 갑주 : 두꺼운 돌·이끼 판. 거북등(a3)과 다르게 사각 판을 이어붙인 갑주다.
  function a7(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var eb = C.earthBrown, mo = C.earthMoss;
    var i, y;

    c.fill(tint(eb, -0.30)); c.fillP(VEST);
    for (i = 0; i < 3; i++) {                                    // 가로 판 3단
      y = -0.18 + i * 0.155;
      c.fill(tint(eb, i * 0.06));
      c.fillP([[-0.28 + i * 0.02, y], [0.28 - i * 0.02, y], [0.24 - i * 0.02, y + 0.13], [-0.24 + i * 0.02, y + 0.13]]);
      c.line(0.020, tint(eb, -0.4), 0.85);
      c.seg(-0.28 + i * 0.02, y, 0.28 - i * 0.02, y);
    }
    c.fill(mo, 0.85);                                            // 이끼 얼룩
    c.ell(-0.16, -0.10, 0.10, 0.06); c.ell(0.14, 0.10, 0.09, 0.055); c.ell(-0.05, 0.22, 0.08, 0.05);
    c.line(0.032, tint(eb, -0.5)); c.strokeP(VEST);
  }

  // a8 불멸의 등딱지 : a3(거북등)의 확대·도금판 — 같은 실루엣 계열의 최상급으로
  // 이어지되 금테와 중앙 보석으로 '불멸'급임을 표시한다.
  function a8(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var rope = mat('rope', 0xd9c9a2);
    var gilt = C.gilt;
    var i, a;

    var SH = [[-0.42, 0.12], [-0.38, -0.15], [-0.21, -0.32], [0, -0.38], [0.21, -0.32],
              [0.38, -0.15], [0.42, 0.12], [0.23, 0.25], [0, 0.28], [-0.23, 0.25]];
    c.fill(gilt); c.fillP(SH);                                    // 금테(가장 두껍다)
    c.fill(C.shellDark); c.fillP(shrink(SH, 0.90, 0, -0.03));
    c.fill(C.shellGreen); c.fillP(shrink(SH, 0.78, 0, -0.05));
    hexAt(c, 0, -0.06, 0.145, C.shellLite, C.shellDark);
    hexAt(c, -0.23, -0.02, 0.11, tint(C.shellLite, -0.12), C.shellDark);
    hexAt(c, 0.23, -0.02, 0.11, tint(C.shellLite, -0.12), C.shellDark);
    for (i = -2; i <= 2; i++) {                                  // 금박 테두리 갑판
      a = i * 0.15;
      c.fill(tint(gilt, -0.15));
      c.fillP([[a - 0.06, 0.14], [a + 0.06, 0.14], [a + 0.048, 0.235], [a - 0.048, 0.235]]);
    }
    c.fill(mat('bronze', 0xc9993f));                              // 중앙 보석
    c.circ(0, -0.06, 0.05);
    c.fill(tint(mat('bronze', 0xc9993f), 0.5)); c.circ(-0.012, -0.075, 0.02);
    c.line(0.028, tint(gilt, -0.3)); c.strokeP(SH);
    c.fill(rope); c.circ(-0.42, 0.11, 0.045); c.circ(0.42, 0.11, 0.045);
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
  //  신발 4~8단계 — 여우가죽 장화 → 바람 신발 → 유령 걸음 → 폭풍 딛기 →
  //  시간을 앞선 신. b2(장화)의 L자 실루엣을 재질만 바꿔 잇다가(b4),
  //  b3(날개깃)의 '가벼움' 계열로 갈라져(b5~b8) 최상급으로 갈수록 판타지 색이 짙어진다.
  // ============================================================================

  var BOOT2 = [[-0.14, -0.32], [0.14, -0.32], [0.15, 0.01], [0.36, 0.07], [0.40, 0.20],
               [-0.18, 0.20], [-0.16, -0.08]];

  // b4 여우가죽 장화 : b2 와 같은 장화 실루엣 + 목에 두른 털.
  function b4(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var le = mat('leather', 0x8d6b4b), leD = mat('leatherDark', 0x5f4630);
    var fur = C.fur, furD = C.furDark;

    c.fill(le); c.fillP(BOOT2);
    c.fill(tint(le, 0.18));
    c.fillP([[-0.02, -0.28], [0.12, -0.28], [0.13, 0.02], [0.33, 0.07], [0.34, 0.16], [-0.02, 0.16]]);
    c.fill(fur);                                                  // 털 목
    c.ell(0, -0.35, 0.22, 0.075);
    c.fill(furD, 0.6); c.ell(-0.05, -0.36, 0.12, 0.05); c.ell(0.08, -0.34, 0.10, 0.045);
    c.fill(leD);
    c.fillP([[-0.19, 0.145], [0.40, 0.185], [0.42, 0.28], [-0.21, 0.28]]);
    c.line(0.026, leD); c.strokeP(BOOT2);
  }

  // b5 바람 신발 : 가볍고 트인 샌들형 — 장화보다 실루엣이 훨씬 얇다.
  function b5(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var le = mat('leather', 0x8d6b4b);
    var pale = C.windPale, br = mat('bronze', 0xc9993f);

    var SOLE = [[-0.30, 0.14], [0.30, 0.10], [0.34, 0.22], [-0.32, 0.26]];
    c.fill(tint(le, -0.2)); c.fillP(SOLE);
    c.line(0.030, br); c.seg(0.02, -0.20, 0.02, 0.12);            // 발등 끈
    c.seg(-0.14, -0.02, 0.18, -0.06); c.seg(-0.16, 0.06, 0.20, 0.02);
    featherAt(c, 0.02, -0.20, -0.20, -0.42, 0.045, pale);         // 발목 날개 한 쌍
    featherAt(c, 0.02, -0.20, 0.24, -0.40, 0.045, tint(pale, -0.1));
    c.line(0.018, tint(pale, -0.3), 0.85); c.scirc(0.02, -0.20, 0.035);
  }

  // b6 유령 걸음 : 옅은 반투명 톤 — 발이 아니라 '자국'처럼 보이게 알파를 낮춘다.
  function b6(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var ph = C.ghostPale;

    c.fill(tint(ph, -0.1), 0.55); c.fillP(BOOT2);
    c.fill(ph, 0.35);
    c.fillP([[-0.02, -0.24], [0.11, -0.24], [0.12, 0.04], [0.30, 0.09], [0.31, 0.16], [-0.02, 0.16]]);
    c.line(0.022, ph, 0.9); c.strokeP(BOOT2);                     // 실선 테두리만으로 실루엣 유지
    c.fill(ph, 0.5); c.ell(-0.30, 0.24, 0.10, 0.035); c.ell(-0.10, 0.27, 0.08, 0.03); // 흐릿한 발자국
  }

  // b7 폭풍 딛기 : 어두운 장화 + 번개 자국(2톤 대비가 확실한 밝은 지그재그).
  function b7(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var sd = C.stormDark, bolt = C.stormBolt;

    c.fill(sd); c.fillP(BOOT2);
    c.fill(tint(sd, 0.22));
    c.fillP([[-0.02, -0.28], [0.12, -0.28], [0.13, 0.02], [0.33, 0.07], [0.34, 0.16], [-0.02, 0.16]]);
    c.line(0.026, bolt, 0.95);                                    // 번개 지그재그
    c.segP([-0.02, -0.24], [0.06, -0.06]); c.segP([0.06, -0.06], [-0.02, 0.02]); c.segP([-0.02, 0.02], [0.08, 0.16]);
    c.line(0.024, tint(sd, 0.5), 0.9); c.strokeP(BOOT2);          // 밝은 테두리(다크테마 대비)
  }

  // b8 시간을 앞선 신 : b3(깃털 장화)의 확대판 — 깃털 5장을 부채꼴로 펼치고 금테로
  // 최상급을 표시한다(b3 은 3장 + 청동테).
  function b8(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var le = mat('leather', 0x8d6b4b);
    var gilt = C.gilt, fe = C.dawnGold;
    var tips = [[-0.50, -0.22], [-0.50, -0.02], [-0.46, 0.16], [-0.38, 0.32], [-0.26, 0.42]];
    var i;

    for (i = 0; i < tips.length; i++) {
      featherAt(c, -0.11, 0.05, tips[i][0], tips[i][1], 0.052, i % 2 ? fe : tint(fe, -0.2));
    }
    c.fill(tint(le, 0.14)); c.fillP(BOOT2);
    c.fill(gilt); c.rrect(-0.16, -0.36, 0.32, 0.10, 0.032);       // 금테
    c.fill(tint(gilt, 0.4)); c.circ(0, -0.31, 0.028);
    c.line(0.026, tint(gilt, -0.3), 0.9); c.strokeP(BOOT2);
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

  // ============================================================================
  //  장신구 — 완전히 새로운 슬롯(2026-08-01, 통곡의 탑 상점). 무기/방어구/신발과
  //  달리 이어받을 실루엣이 없어서 **목에 거는 부적** 계열을 새 기본형으로 잡았다
  //  (c6 만 반지라 예외 — 걸 곳이 없는 물건이라 실루엣 자체를 바꿨다).
  //  공통 부위: 끈(rope) + 매듭 하나 + 늘어진 부적/이빨/깃 — 무엇이 붙었는지만 바뀐다.
  // ============================================================================

  function cordAt(c, rope) {
    c.line(0.040, rope);                                         // V자 끈
    c.seg(0, -0.30, -0.22, -0.10); c.seg(0, -0.30, 0.22, -0.10);
    c.fill(tint(rope, -0.25)); c.circ(0, -0.30, 0.032);           // 목뒤 매듭
  }

  // c1 부적 목걸이 : 가장 낮은 등급 — 나무 원판 부적 하나.
  function c1(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var rope = mat('rope', 0xd9c9a2), wood = mat('wood', 0x8a6a45), woodD = mat('woodDark', 0x5a452c);
    cordAt(c, rope);
    c.fill(wood); c.circ(0, 0.10, 0.16);
    c.fill(tint(wood, 0.22)); c.circ(-0.03, 0.07, 0.11);
    c.line(0.020, woodD, 0.9); c.scirc(0, 0.10, 0.16);
    c.line(0.016, woodD, 0.8); c.seg(-0.08, 0.02, 0.08, 0.18); c.seg(0.08, 0.02, -0.08, 0.18); // 새김
  }

  // c2 늑대 이빨 목걸이 : 나란히 매단 이빨 3개 — 실루엣이 뾰족뾰족하다.
  function c2(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var rope = mat('rope', 0xd9c9a2), bone = mat('bone', 0xeae3cd);
    var i, x;
    cordAt(c, rope);
    for (i = -1; i <= 1; i++) {
      x = i * 0.13;
      c.fill(bone);
      c.fillP([[x - 0.055, 0.03], [x + 0.055, 0.03], [x + 0.025, 0.24 - Math.abs(i) * 0.05], [x, 0.28 - Math.abs(i) * 0.05], [x - 0.025, 0.24 - Math.abs(i) * 0.05]]);
      c.line(0.016, tint(bone, -0.3), 0.85);
      c.seg(x - 0.04, 0.06, x - 0.01, 0.20 - Math.abs(i) * 0.05);
    }
  }

  // c3 매의 깃털 장식 : featherAt 재사용 — 이 슬롯에서 유일하게 깃털이 실루엣을 정한다.
  function c3(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var rope = mat('rope', 0xd9c9a2), fe = mat('feather', 0xe0705a);
    cordAt(c, rope);
    featherAt(c, 0, 0.02, -0.08, 0.30, 0.075, tint(fe, -0.15));
    featherAt(c, 0, 0.02, 0.10, 0.34, 0.08, fe);
    c.fill(tint(rope, -0.2)); c.circ(0, 0.02, 0.028);
  }

  // c4 곰 발톱 부적 : 굽은 발톱 3개를 부채꼴로 매단다 — 늑대 이빨보다 굵고 휘었다.
  function c4(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var rope = mat('rope', 0xd9c9a2), bone = mat('bone', 0xeae3cd);
    var claws = [[-0.15, 0.30], [0, 0.34], [0.15, 0.30]];
    var i, p;
    cordAt(c, rope);
    for (i = 0; i < claws.length; i++) {
      p = claws[i];
      c.fill(tint(bone, -0.06));
      c.fillP([[0, 0.02], [p[0] * 0.6, p[1] * 0.55], [p[0], p[1]], [p[0] * 0.75, p[1] * 0.7]]);
      c.line(0.016, tint(bone, -0.35), 0.85); c.segP([p[0] * 0.7, p[1] * 0.62], [p[0], p[1]]);
    }
  }

  // c5 심장 조각 : 붉은 결정 조각 — 무기/방어구에 없는 '보석' 실루엣을 처음 도입한다.
  function c5(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var rope = mat('rope', 0xd9c9a2);
    var red = C.berry, redL = C.berryLite;
    cordAt(c, rope);
    c.fill(tint(red, -0.2));
    c.fillP([[0, 0.00], [0.13, 0.10], [0.09, 0.30], [0, 0.38], [-0.09, 0.30], [-0.13, 0.10]]);
    c.fill(red);
    c.fillP([[0, 0.03], [0.09, 0.11], [0.06, 0.27], [0, 0.32], [-0.06, 0.27], [-0.09, 0.11]]);
    c.fill(redL, 0.85); c.fillP([[0, 0.05], [0.05, 0.12], [0.01, 0.22], [-0.03, 0.14]]);  // 결정 광택
    c.line(0.018, tint(red, 0.4), 0.9); c.seg(0, 0.00, 0, 0.38);   // 밝은 능선(다크테마 대비)
  }

  // c6 그림자 반지 : 이 슬롯의 유일한 예외 — 목걸이가 아니라 고리. 실루엣부터 다르다.
  // ⚠ `strokeCircle`(두꺼운 선)로 띠를 그린다 — `fillCircle` 두 겹으로 '구멍'을 내려면
  //   배경색을 알아야 하는데(다크/라이트 테마마다 다르다), 굵은 원 테두리는 안쪽이
  //   원래 배경 그대로 비쳐서 테마와 무관하게 항상 고리로 보인다.
  function c6(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var sh = C.shadowInk;
    c.line(0.115, sh, 1); c.scirc(0, 0.06, 0.18);                 // 띠(두꺼운 원)
    c.line(0.030, tint(sh, 0.55), 0.7); c.scirc(-0.03, 0.01, 0.16); // 옅은 광택 테
    c.fill(mat('bronze', 0xc9993f)); c.circ(0, -0.15, 0.040);     // 반지 위 보석
    c.fill(tint(mat('bronze', 0xc9993f), 0.5)); c.circ(-0.01, -0.16, 0.015);
    c.line(0.018, tint(sh, -0.3), 0.9); c.scirc(0, -0.15, 0.040);
  }

  // c7 늪지 정수병 : 물약 p1(옹달샘)과 같은 호리병 문법이되 늪지색으로 슬롯을 구분한다
  // (장신구 칸에 있으므로 물약과 헷갈리지 않게 끈으로 매단다 — 손에 드는 물건이 아니다).
  function c7(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var rope = mat('rope', 0xd9c9a2), clay = mat('clay', 0xb5794a);
    var sw = C.swampGreen, swG = C.swampGlow;
    cordAt(c, rope);
    c.fill(tint(clay, -0.3)); c.rect(-0.045, 0.00, 0.09, 0.10);
    c.fill(clay); c.circ(0, 0.24, 0.145);
    c.fill(sw); c.circ(-0.02, 0.20, 0.09);
    c.fill(swG, 0.7); c.ell(-0.05, 0.15, 0.04, 0.03);
    c.line(0.026, tint(rope, 0.1)); c.seg(-0.06, 0.00, 0.06, 0.00);
  }

  // c8 여명의 인장 : 가장 화려하다 — 둥근 인장(도장) 펜던트 + 광선 장식, 금테.
  function c8(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var rope = mat('rope', 0xd9c9a2);
    var gilt = C.gilt, gold = C.dawnGold, glow = C.dawnGlow;
    var i, a;
    cordAt(c, rope);
    c.fill(gilt); c.circ(0, 0.16, 0.185);                         // 금테
    c.fill(gold); c.circ(0, 0.16, 0.135);
    for (i = 0; i < 8; i++) {                                     // 광선 장식(여명 = 새벽빛)
      a = (Math.PI * 2 / 8) * i;
      c.line(0.020, glow, 0.85);
      c.seg(Math.cos(a) * 0.09, 0.16 + Math.sin(a) * 0.09, Math.cos(a) * 0.16, 0.16 + Math.sin(a) * 0.16);
    }
    c.fill(glow); c.circ(0, 0.16, 0.05);
    c.line(0.022, tint(gilt, -0.3), 0.9); c.scirc(0, 0.16, 0.185);
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
  // ══ 2026-08-03 사용자 지시로 늘린 것들 ═══════════════════════════════════════
  // > "추가된 아이템도 아이콘이랑 장착했을때 모델링 추가해줘 /
  // >  광전사,사냥꾼,파수꾼 아이템이 다 달라야해"

  //  ── 사다리 중간에 끼운 4단·6단 (js/towershopitems.js) ────────────────────────
  //  ⚠ 이 여섯이 없으면 `DRAW[key] || box` 가 **갈색 네모**로 떨어진다. v1.46 배포본이
  //    실제로 그랬다(상점 스크린샷에서 +38 · +88 짜리가 상자로 떴다). 아이콘 표는
  //    카탈로그와 짝이니 단계를 늘릴 때 반드시 같이 늘릴 것.

  // a9 늑대가죽 흉갑 : 거북등(a3)과 강철 흉갑(a4) 사이 — 털을 덧댄 가죽.
  function a9(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var le = mat('leather', 0x8d6b4b), leD = mat('leatherDark', 0x5f4630);
    var fur = C.fur, furD = C.furDark;

    c.fill(le); c.fillP(VEST);
    c.fill(fur); c.ell(0, -0.24, 0.44, 0.13);                     // 어깨를 덮은 털깃
    c.fill(furD, 0.55); c.ell(-0.13, -0.26, 0.16, 0.07); c.ell(0.12, -0.23, 0.14, 0.06);
    c.fill(tint(le, -0.18));                                       // 앞섶 두 장
    c.fillP([[-0.23, -0.14], [-0.03, -0.09], [-0.03, 0.24], [-0.23, 0.18]]);
    c.fillP([[0.23, -0.14], [0.03, -0.09], [0.03, 0.24], [0.23, 0.18]]);
    if (c.fine) {                                                  // 엮은 끈
      c.line(0.020, mat('rope', 0xd9c9a2));
      c.seg(-0.03, -0.04, 0.03, 0.02); c.seg(0.03, -0.04, -0.03, 0.02);
      c.seg(-0.03, 0.08, 0.03, 0.14); c.seg(0.03, 0.08, -0.03, 0.14);
    }
    c.fill(mat('bone', 0xeae3cd));                                 // 이빨 장식
    c.fillP([[-0.14, 0.24], [-0.11, 0.34], [-0.08, 0.24]]);
    c.fillP([[0.10, 0.24], [0.13, 0.34], [0.16, 0.24]]);
    c.line(0.030, leD); c.strokeP(VEST);
  }

  // a10 매머드 뼈 갑주 : 강철 흉갑(a4) 위 단계 — 굵은 뼈판을 갈비처럼 덧댄다.
  function a10(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var leD = mat('leatherDark', 0x5f4630);
    var bone = mat('bone', 0xeae3cd), st = mat('stone', 0x8b8578);

    c.fill(tint(leD, 0.10)); c.fillP(VEST);
    c.fill(st);                                                    // 그늘진 뒷판
    c.fillP([[-0.26, -0.22], [0.26, -0.22], [0.24, 0.26], [-0.24, 0.26]]);
    c.fill(bone);                                                  // 갈비뼈 판 4단
    var i, yy;
    for (i = 0; i < 4; i++) {
      yy = -0.17 + i * 0.115;
      c.fillP([[-0.245, yy], [0.245, yy], [0.225, yy + 0.075], [-0.225, yy + 0.075]]);
    }
    c.fill(tint(st, -0.25), 0.55);                                 // 판 사이 그늘
    for (i = 0; i < 3; i++) { yy = -0.086 + i * 0.115; c.rect(-0.235, yy, 0.47, 0.014); }
    c.fill(tint(bone, 0.30)); c.circ(0, -0.02, 0.055);             // 가운데 이음쇠
    c.fill(st); c.circ(0, -0.02, 0.026);
    c.line(0.030, leD); c.strokeP(VEST);
  }

  // b9 이끼 감은 신 : 깃털 장화(b3)와 여우가죽(b4) 사이 — 덩굴·이끼로 감았다.
  function b9(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var le = mat('leather', 0x8d6b4b), leD = mat('leatherDark', 0x5f4630);
    var moss = mat('moss', 0x6f7f4a);

    c.fill(le); c.fillP(BOOT2);
    c.fill(tint(le, 0.16));
    c.fillP([[-0.02, -0.28], [0.12, -0.28], [0.13, 0.02], [0.32, 0.07], [0.33, 0.16], [-0.02, 0.16]]);
    c.line(0.036, moss);                                           // 감아 올린 덩굴
    c.seg(-0.16, -0.20, 0.10, -0.13); c.seg(-0.17, -0.07, 0.11, 0.00);
    c.seg(-0.18, 0.06, 0.24, 0.11);
    if (c.fine) {                                                  // 삐져나온 이끼
      c.fill(tint(moss, 0.28));
      c.circ(-0.10, -0.17, 0.030); c.circ(0.04, -0.10, 0.026); c.circ(-0.12, 0.03, 0.028);
      c.circ(0.16, 0.09, 0.024);
    }
    c.fill(leD);                                                   // 밑창
    c.fillP([[-0.19, 0.145], [0.39, 0.185], [0.41, 0.28], [-0.21, 0.28]]);
    c.line(0.026, leD); c.strokeP(BOOT2);
  }

  // b10 사슴 힘줄 신 : 여우가죽(b4) 위 — 힘줄을 X 로 동여매 가볍고 빠르다.
  function b10(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var le = mat('leather', 0x8d6b4b), leD = mat('leatherDark', 0x5f4630);
    var sin = mat('rope', 0xd9c9a2), bone = mat('bone', 0xeae3cd);

    c.fill(tint(le, -0.10)); c.fillP(BOOT2);
    c.fill(tint(le, 0.20));
    c.fillP([[-0.02, -0.28], [0.12, -0.28], [0.13, 0.02], [0.32, 0.07], [0.33, 0.16], [-0.02, 0.16]]);
    c.line(0.024, sin);                                            // X 결속 세 단
    var i, yy;
    for (i = 0; i < 3; i++) {
      yy = -0.20 + i * 0.115;
      c.seg(-0.16, yy, 0.10, yy + 0.055); c.seg(0.10, yy, -0.16, yy + 0.055);
    }
    c.fill(bone);                                                  // 발목 뼈 고리
    c.circ(-0.02, -0.30, 0.040);
    c.fill(tint(bone, -0.30)); c.circ(-0.02, -0.30, 0.018);
    c.fill(leD);
    c.fillP([[-0.19, 0.145], [0.40, 0.185], [0.42, 0.28], [-0.21, 0.28]]);
    c.line(0.026, leD); c.strokeP(BOOT2);
  }

  // c9 멧돼지 송곳니 팔찌 : 매의 깃털(c3)과 곰 발톱(c4) 사이 — 굽은 엄니 한 쌍.
  function c9(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var rope = mat('rope', 0xd9c9a2), bone = mat('bone', 0xeae3cd);
    cordAt(c, rope);
    var d, i;
    for (i = 0; i < 2; i++) {
      d = i ? 1 : -1;
      c.fill(tint(bone, -0.04));                                   // 바깥으로 휜 엄니
      c.fillP([[d * 0.03, 0.03], [d * 0.20, 0.14], [d * 0.28, 0.33],
               [d * 0.19, 0.30], [d * 0.10, 0.15]]);
      c.line(0.014, tint(bone, -0.34), 0.85);
      c.segP([d * 0.07, 0.08], [d * 0.26, 0.31]);
    }
    c.fill(tint(rope, -0.22)); c.circ(0, 0.05, 0.048);             // 가운데 매듭
    c.fill(tint(bone, 0.30)); c.circ(0, 0.04, 0.022);
  }

  // c10 조상의 뼈 고리 : 곰 발톱(c4) 위 — 작은 뼈마디를 둥글게 꿰었다.
  function c10(g, cx, cy, U) {
    var c = ctx(g, cx, cy, U);
    var rope = mat('rope', 0xd9c9a2), bone = mat('bone', 0xeae3cd);
    var br = mat('bronze', 0xc9993f);
    cordAt(c, rope);
    var n = 7, i, th, bx, by;
    c.line(0.016, tint(rope, -0.18)); c.scirc(0, 0.16, 0.20);      // 꿴 줄
    for (i = 0; i < n; i++) {                                       // 뼈마디
      th = Math.PI * (0.15 + 1.70 * (i / (n - 1)));
      bx = Math.cos(th) * 0.20; by = 0.16 + Math.sin(th) * 0.20;
      c.fill(tint(bone, -0.16)); c.circ(bx, by + 0.012, 0.045);
      c.fill(bone); c.circ(bx, by, 0.040);
      if (c.fine) { c.fill(tint(bone, 0.34)); c.circ(bx - 0.011, by - 0.011, 0.016); }
    }
    c.fill(br); c.circ(0, -0.04, 0.042);                            // 이마 쪽 청동 인장
    c.fill(tint(br, 0.40)); c.circ(-0.011, -0.052, 0.017);
  }

  //  ── 영웅별 무기 — **형태는 영웅이, 재질은 등급이 정한다** ────────────────────
  //  예전에는 무기 아이콘이 키 하나에 그림 하나였다. 그런데 이름은 **이미 영웅마다
  //  달랐다**(`TowerShopItems.WEAPON_NAMES`: 돌 대검 / 나무 활 / 나무 방패) — 그래서
  //  사냥꾼이 '나무 활'을 사는데 화면에는 도끼가 떴다. 이름과 그림이 어긋나 있었다.
  //
  //  ⚠ 색·길이·장식은 `UI.GEAR_TIERS`(js/eggart.js)를 **그대로 읽는다.** 전장에서
  //    실제로 든 무기(`UI.eggGear`)가 쓰는 바로 그 표다 — 여기에 표를 복제하면
  //    상점에서 본 것과 손에 든 것이 조용히 갈라진다(이 폴더가 반복해서 겪은 사고).
  //    덤으로 단계를 더 늘려도 아이콘이 저절로 따라온다.
  function tierPal(tier) {
    var T = (UI.GEAR_TIERS && UI.GEAR_TIERS[tier]) || null;
    var m = (T && T.mat) || {};
    return {
      blade: m.blade || C.steel, dark: m.bladeDark || C.steelDark,
      bronze: m.bronze || mat('bronze', 0xc9993f),
      iron: m.iron || mat('iron', 0x6e7681),
      glow: (T && T.glow) || 0, len: (T && T.len) || 1,
      wide: (T && T.wide) || 1, grd: (T && T.grd) || 1, orn: (T && T.orn) || 0
    };
  }
  function pline(c, pts) { for (var i = 1; i < pts.length; i++) c.segP(pts[i - 1], pts[i]); }
  //  광휘는 8단 이상만 갖는다(GEAR_TIERS 의 glow).
  //  ⚠ **큰 원반으로 그리지 말 것.** 처음엔 반투명 원을 뒤에 깔았는데, 라이트 테마의
  //    `UI.inkLayer` 가 같은 그림을 잉크색으로 한 번 더 부풀려 찍는 탓에 그 원이
  //    **검은 원반**이 되어 무기를 통째로 덮었다(상위 3단이 전부 까맣게 나왔다 — 실측).
  //    잉크가 덧씌워도 해롭지 않게 **작은 점 몇 개**로만 낸다.
  function auraOf(c, P) {
    if (!P.glow) return;
    var pts = [[-0.34, -0.30], [0.33, -0.34], [0.36, 0.29], [-0.30, 0.33]];
    for (var i = 0; i < pts.length; i++) {
      c.fill(P.glow, 0.85); c.circ(pts[i][0], pts[i][1], 0.026);
      c.fill(tint(P.glow, 0.45), 0.9); c.circ(pts[i][0] - 0.007, pts[i][1] - 0.007, 0.011);
    }
  }

  function wpSword(c, P) {                       // 광전사 — 대검
    auraOf(c, P);
    var A = ax(-0.33, 0.35, 0.36 * P.len, -0.40 * P.len);
    var w = 0.100 * P.wide, leD = mat('leatherDark', 0x5f4630);
    c.line(0.064, leD); c.segP(A(-0.34, 0), A(0.02, 0));                    // 감은 자루
    if (c.fine) {
      c.line(0.016, tint(leD, 0.30));
      c.segP(A(-0.28, -0.05), A(-0.24, 0.05));
      c.segP(A(-0.20, -0.05), A(-0.16, 0.05));
      c.segP(A(-0.12, -0.05), A(-0.08, 0.05));
    }
    c.fill(P.bronze);
    c.circ(A(-0.38, 0)[0], A(-0.38, 0)[1], 0.052 * P.grd);                  // 자루 끝 구슬
    c.line(0.052 * P.grd, P.bronze);                                         // 날밑
    c.segP(A(0.05, -0.19 * P.grd), A(0.05, 0.19 * P.grd));
    c.fill(P.dark);
    c.fillP([A(0.09, -w), A(0.86, -w * 0.44), A(1.0, 0), A(0.86, w * 0.44), A(0.09, w)]);
    c.fill(P.blade);
    c.fillP([A(0.13, -w * 0.60), A(0.83, -w * 0.27), A(0.95, 0), A(0.83, w * 0.27), A(0.13, w * 0.60)]);
    c.line(0.013, tint(P.blade, 0.45), 0.9); c.segP(A(0.17, 0), A(0.88, 0)); // 피홈
    if (P.orn >= 1) { c.fill(tint(P.bronze, 0.36)); c.circ(A(0.05, 0)[0], A(0.05, 0)[1], 0.036); }
    if (P.orn >= 2) {                                                        // 날밑 날개
      c.fill(P.bronze);
      c.fillP([A(0.05, -0.19), A(-0.07, -0.31), A(0.00, -0.15)]);
      c.fillP([A(0.05, 0.19), A(-0.07, 0.31), A(0.00, 0.15)]);
    }
    if (P.orn >= 3) {                                                        // 등날 톱니
      c.fill(tint(P.blade, 0.50));
      c.fillP([A(0.40, -w * 0.55), A(0.47, -w * 1.10), A(0.54, -w * 0.55)]);
      c.fillP([A(0.58, -w * 0.50), A(0.65, -w * 1.02), A(0.72, -w * 0.50)]);
    }
  }

  function wpBow(c, P) {                         // 사냥꾼 — 활
    auraOf(c, P);
    var L = 0.43 * P.len, th = 0.048 * P.wide;
    var belly = [[0.12, -L], [-0.09, -L * 0.70], [-0.23, -L * 0.33], [-0.26, 0],
                 [-0.23, L * 0.33], [-0.09, L * 0.70], [0.12, L]];
    c.line(th * 1.8, P.dark); pline(c, belly);                               // 활대 겉
    c.line(th * 0.85, P.blade); pline(c, belly);                             // 안쪽 심
    c.line(0.015, P.bronze, 0.95);                                           // 고자 결속
    c.seg(0.12, -L, 0.03, -L * 0.88); c.seg(0.12, L, 0.03, L * 0.88);
    c.line(0.012, mat('rope', 0xd9c9a2)); c.seg(0.12, -L, 0.12, L);          // 시위
    c.line(0.066, mat('leatherDark', 0x5f4630)); c.seg(-0.26, -0.11, -0.26, 0.11);
    if (P.orn >= 1) { c.fill(tint(P.bronze, 0.36)); c.circ(-0.26, 0, 0.038 * P.grd); }
    c.line(0.022, mat('wood', 0x8a6a45)); c.seg(0.10, 0, 0.42, 0);           // 메긴 화살
    c.fill(P.blade); c.fillP([[0.42, -0.052], [0.54, 0], [0.42, 0.052]]);
    if (c.fine) {
      c.fill(C.fur);
      c.fillP([[0.10, -0.048], [0.20, -0.016], [0.10, 0.016]]);
    }
    if (P.orn >= 2) {                                                        // 고자 깃 장식
      c.fill(P.bronze);
      c.fillP([[0.12, -L], [0.26, -L - 0.05], [0.17, -L + 0.06]]);
      c.fillP([[0.12, L], [0.26, L + 0.05], [0.17, L - 0.06]]);
    }
    if (P.orn >= 3) {
      c.fill(tint(P.blade, 0.48)); c.circ(-0.24, -0.20, 0.026); c.circ(-0.24, 0.20, 0.026);
    }
  }

  function wpShield(c, P) {                      // 파수꾼 — 방패
    auraOf(c, P);
    var w = 0.33 * P.wide, h = 0.42 * P.len;
    var out = [[0, -h], [w, -h * 0.58], [w, h * 0.28], [0, h], [-w, h * 0.28], [-w, -h * 0.58]];
    c.fill(P.dark); c.fillP(out);                                            // 테
    var iw = w * 0.80, ih = h * 0.82;
    var inn = [[0, -ih], [iw, -ih * 0.58], [iw, ih * 0.28], [0, ih], [-iw, ih * 0.28], [-iw, -ih * 0.58]];
    c.fill(P.blade); c.fillP(inn);                                           // 판
    c.line(0.018, tint(P.blade, -0.28), 0.8); c.seg(0, -ih, 0, ih);          // 이음매
    if (c.fine) {                                                            // 리벳
      c.fill(P.iron);
      c.circ(-iw * 0.62, -ih * 0.34, 0.020); c.circ(iw * 0.62, -ih * 0.34, 0.020);
      c.circ(-iw * 0.52, ih * 0.30, 0.020); c.circ(iw * 0.52, ih * 0.30, 0.020);
    }
    c.fill(P.bronze); c.circ(0, -0.02, 0.090 * P.grd);                       // 방패심
    c.fill(tint(P.bronze, 0.42)); c.circ(-0.022, -0.046, 0.034);
    c.line(0.020, P.iron, 0.9); c.strokeP(out);
    if (P.orn >= 1) { c.fill(tint(P.bronze, 0.32)); c.circ(0, -h * 0.70, 0.028); }
    if (P.orn >= 2) {                                                        // 어깨 뿔
      c.fill(P.bronze);
      c.fillP([[-w, -h * 0.58], [-w - 0.10, -h * 0.84], [-w * 0.70, -h * 0.70]]);
      c.fillP([[w, -h * 0.58], [w + 0.10, -h * 0.84], [w * 0.70, -h * 0.70]]);
    }
    if (P.orn >= 3) {                                                        // 아래 가시
      c.fill(tint(P.blade, 0.50));
      c.fillP([[0, h], [-0.065, h + 0.09], [0.065, h + 0.09]]);
    }
  }

  var HERO_FORM = { vanguard: wpSword, ranger: wpBow, warden: wpShield };

  var DRAW = {
    w1: w1, w2: w2, w3: w3, w4: w4, w5: w5, w6: w6, w7: w7, w8: w8,
    a1: a1, a2: a2, a3: a3, a4: a4, a5: a5, a6: a6, a7: a7, a8: a8,
    a9: a9, a10: a10,
    b1: b1, b2: b2, b3: b3, b4: b4, b5: b5, b6: b6, b7: b7, b8: b8,
    b9: b9, b10: b10,
    p1: p1, p2: p2, p3: p3,
    c1: c1, c2: c2, c3: c3, c4: c4, c5: c5, c6: c6, c7: c7, c8: c8,
    c9: c9, c10: c10
  };

  UI.ITEM_ART_KEYS = [
    'w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9', 'w10',
    'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10',
    'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9', 'b10',
    'p1', 'p2', 'p3',
    'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10'
  ];

  //  g 에만 그린다. 반환값 없음 · 상태 없음.
  //  `heroKey` 는 **선택 인자**다 — 안 넘기면 예전과 픽셀 단위로 같은 그림이 나온다.
  UI.drawItem = function (g, slotKey, itemKey, cx, cy, size, heroKey) {
    if (!g) return;
    var U = (typeof size === 'number' && isFinite(size) && size > 4) ? size : 48;
    if (typeof cx !== 'number' || !isFinite(cx)) cx = 0;
    if (typeof cy !== 'number' || !isFinite(cy)) cy = 0;
    var fn = DRAW[itemKey] || box;

    //  ── 무기는 영웅 형태로 그린다 ──────────────────────────────────────────
    //  ⚠ 두 갈래가 있는 이유: 영웅을 아는 자리(상점·준비 화면)는 이름과 맞는 그림을
    //    보여 주고, 영웅이 없는 자리는 예전 손그림을 그대로 쓴다.
    //    그리고 사다리 중간에 끼운 무기(w9·w10)는 손그림이 없으므로, 영웅을 몰라도
    //    **상자로 떨어지지 않게** 기본 형태로 보낸다.
    if (slotKey === 'weapon') {
      var form = HERO_FORM[heroKey] || (DRAW[itemKey] ? null : wpSword);
      if (form) {
        var P = tierPal(UI.gearTierOf ? UI.gearTierOf(itemKey) : 0);
        fn = function (gg, x, y, u) { form(ctx(gg, x, y, u), P); };
      }
    }

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
