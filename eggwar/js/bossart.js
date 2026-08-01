window.GAME = window.GAME || {};

// ============================================================================
//  보스 아트 — **계란이 아닌 것들** (2026-08-02 사용자 지시)
//
//  "보스전은 에그가 꼭 아니어도 되니까 정말 강력해 보이는 몬스터를 디자인하고 만들어줘.
//   올라갈수록 세계관과 연결된 강한 몹이 나왔으면 좋겠고 최종 보스는 정말 큰 용이야.
//   50, 100 정도엔 용의 부하나 용의 몸 일부하고 싸우면서 그 강함의 크기를 미리 느꼈으면."
//
//  ## 왜 별도 파일인가
//  `js/eggart.js` 는 **계란 몸통**을 전제로 지어졌다(`eggBody` 가 모든 것의 뿌리다).
//  용을 거기에 끼워 넣으면 그 전제가 깨지고, 계란 유닛 60여 종이 같이 위험해진다.
//  그래서 갈래를 하나만 낸다 — `art.beast` 인 def 만 이 파일로 온다.
//
//  ## 세계관 연결 (CLAUDE.md 'Egg War')
//  계란 부족의 전쟁 위에 **더 오래된 것**이 있다는 층위를 얹는다:
//    1~30층  계란 부족의 강자   (기존 셋 — 족장·골렘·둥지)
//    40층    재를 뒤집어쓴 파수병 — 계란 부족의 마지막. 처음으로 '용의 재'가 나온다
//    50층    용의 부하(잿날개)  — 용이 실재한다는 첫 증거
//    60~90층 권속들             — 서리·폭풍으로 결이 갈린다
//    100층   용의 발톱          — **몸의 일부**. 발톱 하나가 화면을 덮는다
//    150층~  용 본체
//  50·100 층의 목적은 이기는 것이 아니라 **크기를 먼저 보여주는 것**이다.
//
//  ## 그리기 규율 (이 저장소의 아트 원칙을 그대로 따른다)
//  · 색이 아니라 **물건**이 실루엣을 만든다 — 뿔·비늘·발톱·뼈
//  · 판을 겹쳐 두께를 만든다(그라디언트 없음 — Phaser Graphics 로 그린다)
//  · 히트박스는 `def.radius` 그대로 두고 **그리는 크기만** 키운다(`SCALE`)
//    ⚠ radius 를 키우면 사거리 판정이 바뀌어 밸런스가 조용히 움직인다
//      (CLAUDE.md 의 파수꾼 radius 18→24 실측이 그 증거다)
// ============================================================================
(function () {
  var BA = GAME.BossArt = {};

  // 종류별 **그리는 배율**. 히트박스와 무관하다 — 용은 크게 보여야 용이다.
  BA.SCALE = { sentry: 1.50, drake: 1.60, claw: 2.10, dragon: 2.60 };

  // 결(속성)별 색. 같은 골격에 색만 갈아 끼워 권속을 여러 종으로 늘린다.
  BA.TONE = {
    ash:   { scale: 0x4a4750, dark: 0x24222a, belly: 0x6f6a74, glow: 0xff7a3c, horn: 0xd9cfc0 },
    frost: { scale: 0x4a6a7e, dark: 0x243743, belly: 0x7fa0b3, glow: 0x8fe0ff, horn: 0xdfeef5 },
    storm: { scale: 0x574a7e, dark: 0x2a2343, belly: 0x8a7ab0, glow: 0xffe066, horn: 0xe6dcff },
    ember: { scale: 0x6e3a2c, dark: 0x3a1c14, belly: 0xa8624a, glow: 0xffb03c, horn: 0xf0dcc0 }
  };

  // ── 기본 도형 ──────────────────────────────────────────────────────────────
  function tri(g, x1, y1, x2, y2, x3, y3, col, a) {
    g.fillStyle(col, a === undefined ? 1 : a);
    g.fillTriangle(x1, y1, x2, y2, x3, y3);
  }
  function poly(g, pts, col, a) {
    g.fillStyle(col, a === undefined ? 1 : a);
    g.fillPoints(pts, true);
  }

  //  2차 베지에 표본. 목과 꼬리가 **곡선**이라야 뱀도 막대기도 아닌 용이 된다.
  function bez(x0, y0, x1, y1, x2, y2, n) {
    var p = [], i, t, u;
    for (i = 0; i <= n; i++) {
      t = i / n; u = 1 - t;
      p.push({ x: u * u * x0 + 2 * u * t * x1 + t * t * x2,
               y: u * u * y0 + 2 * u * t * y1 + t * t * y2 });
    }
    return p;
  }

  //  굵기가 변하는 띠.
  //  ⚠ `lineBetween` 은 굵기가 일정해서 **꼬리가 안 가늘어지고 목이 안 굵어진다.**
  //    첫 판이 그래서 통째로 '나무 막대에 붙은 타원'으로 보였다. 어깨에서 굵고
  //    머리에서 가늘다는 것 하나가 실루엣의 절반이다.
  function ribbon(g, pts, w0, w1, col, a) {
    g.fillStyle(col, a === undefined ? 1 : a);
    var n = pts.length - 1, i, p, q, dx, dy, L, nx, ny, a0, a1;
    for (i = 0; i < n; i++) {
      p = pts[i]; q = pts[i + 1];
      dx = q.x - p.x; dy = q.y - p.y; L = Math.sqrt(dx * dx + dy * dy) || 1;
      nx = -dy / L; ny = dx / L;
      a0 = (w0 + (w1 - w0) * (i / n)) * 0.5;
      a1 = (w0 + (w1 - w0) * ((i + 1) / n)) * 0.5;
      g.fillTriangle(p.x + nx * a0, p.y + ny * a0, p.x - nx * a0, p.y - ny * a0,
                     q.x + nx * a1, q.y + ny * a1);
      g.fillTriangle(p.x - nx * a0, p.y - ny * a0, q.x - nx * a1, q.y - ny * a1,
                     q.x + nx * a1, q.y + ny * a1);
      g.fillCircle(q.x, q.y, a1);   // 마디 이음매 — 없으면 꺾이는 곳이 끊겨 보인다
    }
  }

  //  등줄기 가시 — 곡선의 법선 방향으로 세우고 진행 반대쪽으로 눕힌다.
  //  **머리부터 꼬리 끝까지 하나로 이어야** 한 마리로 읽힌다(부위별로 따로 붙이면 조각난다).
  function ridge(g, pts, from, to, size, col, sign) {
    g.fillStyle(col, 1);
    var n = pts.length - 1, i, f, p, q, c, dx, dy, L, ux, uy, nx, ny, s;
    for (i = 1; i < n; i++) {
      if (i % 2) continue;
      f = i / n; if (f < from || f > to) continue;
      p = pts[i - 1]; q = pts[i + 1]; c = pts[i];
      dx = q.x - p.x; dy = q.y - p.y; L = Math.sqrt(dx * dx + dy * dy) || 1;
      ux = dx / L; uy = dy / L; nx = -uy * sign; ny = ux * sign;
      s = size * (0.40 + 0.60 * Math.sin(((f - from) / Math.max(0.001, to - from)) * Math.PI));
      g.fillTriangle(c.x - ux * s * 0.60, c.y - uy * s * 0.60,
                     c.x + ux * s * 0.60, c.y + uy * s * 0.60,
                     c.x + nx * s * 1.75 - ux * s * 0.55, c.y + ny * s * 1.75 - uy * s * 0.55);
    }
  }

  //  갈래 발톱 — 발끝에서 셋으로 갈라진다. 발이 있어야 '땅을 딛고 선 짐승'이 된다.
  function talons(g, fx, fy, r, dir, tone, n, len) {
    var i, f, ax, ay;
    for (i = 0; i < n; i++) {
      f = n === 1 ? 0.5 : i / (n - 1);
      ax = fx + dir * r * (0.06 + f * 0.46);
      ay = fy + r * (0.08 - f * 0.05);
      tri(g, ax - r * 0.07, ay - r * 0.11, ax + r * 0.07, ay - r * 0.01,
             ax + dir * r * len, ay + r * 0.11, tone.horn, 1);
    }
  }

  //  다리 — 넓적다리(덩어리) + 정강이(띠) + 발. 세 마디가 다 있어야 무게가 실린다.
  //  ⚠ 사지를 몸통과 **같은 색**으로 칠했더니 통째로 묻혀서 용이 다리 없는
  //    자루처럼 보였다(실측). 팔다리는 언제나 어두운 실루엣으로 두고, 넓적다리
  //    근육만 몸통색으로 남긴다 — 그래야 '몸통에서 뻗어 나온 것'이 된다.
  function leg(g, hx, hy, kx, ky, fx, fy, w, tone, dir, r, back) {
    g.fillStyle(tone.dark, 1);
    g.fillEllipse(hx, hy, w * 2.1, w * 2.4, 12);
    if (!back) { g.fillStyle(tone.scale, 1); g.fillEllipse(hx, hy - w * 0.18, w * 1.5, w * 1.7, 12); }
    ribbon(g, [{ x: hx, y: hy }, { x: kx, y: ky }], w * 1.28, w * 0.78, tone.dark);
    ribbon(g, [{ x: kx, y: ky }, { x: fx, y: fy }], w * 0.78, w * 0.48, tone.dark);
    g.fillStyle(back ? tone.dark : tone.scale, 1); g.fillCircle(kx, ky, w * 0.40);
    g.fillStyle(tone.dark, 1);
    g.fillEllipse(fx + dir * w * 0.26, fy, w * 1.7, w * 0.66, 10);
    talons(g, fx, fy, r * 0.72, dir, tone, 3, 0.30);
  }

  //  머리 — 레퍼런스에서 가장 강한 신호 셋이 전부 여기 있다:
  //    ① 뒤로 부챗살처럼 뻗은 **뿔 왕관**  ② 긴 주둥이와 턱 둘레의 **볼 가시**
  //    ③ 눈두덩이 위를 덮어 만드는 **노려보는 눈**
  //  셋 다 실루엣에 남는 물건이다 — 색으로는 하나도 안 만들어진다.
  var HORN_DIR = [[-0.52, -1.00], [-0.88, -0.66], [-1.04, -0.22], [-0.94, 0.20], [-0.70, 0.54]];
  var HORN_LEN = [1.02, 1.26, 1.14, 0.88, 0.62];
  function head(g, hx, hy, r, tone, open, d, t) {
    var i, f, bx, by, ex, ey, px, py, nn, L, ux, uy, lx, ly;
    // ① 뿔 왕관 — 머리보다 먼저 그려 뒤로 간다
    for (i = 0; i < HORN_DIR.length; i++) {
      bx = hx - d * r * 0.24 + d * r * 0.05 * i;
      by = hy - r * 0.20 + r * 0.11 * i;
      L = r * HORN_LEN[i];
      ex = bx + d * HORN_DIR[i][0] * L; ey = by + HORN_DIR[i][1] * L;
      px = -(ey - by); py = (ex - bx);
      nn = Math.sqrt(px * px + py * py) || 1;
      px = px / nn * r * 0.12; py = py / nn * r * 0.12;
      tri(g, bx + px, by + py, bx - px, by - py, ex, ey, tone.horn, 1);
      tri(g, bx + px * 0.55, by + py * 0.55, bx - px * 0.55, by - py * 0.55,
             bx + (ex - bx) * 0.52, by + (ey - by) * 0.52, tone.dark, 0.5);
    }
    // ② 볼 가시 — 뒤아래로 눕는다
    for (i = 0; i < 3; i++) {
      bx = hx - d * r * (0.02 + i * 0.17); by = hy + r * (0.26 + i * 0.05);
      tri(g, bx, by - r * 0.11, bx, by + r * 0.11,
             bx - d * r * 0.46, by + r * (0.28 + i * 0.11), tone.horn, 1);
    }
    // 두개골
    g.fillStyle(tone.dark, 1);  g.fillEllipse(hx, hy, r * 1.18, r * 0.94, 14);
    g.fillStyle(tone.scale, 1); g.fillEllipse(hx, hy - r * 0.05, r * 1.00, r * 0.78, 14);
    // 주둥이 — 앞으로 길게 좁아진다
    var snout = [{ x: hx + d * r * 0.16, y: hy + r * 0.02 },
                 { x: hx + d * r * 0.70, y: hy + r * 0.11 },
                 { x: hx + d * r * 1.18, y: hy + r * 0.19 }];
    ribbon(g, snout, r * 0.78, r * 0.32, tone.scale);
    ribbon(g, snout, r * 0.32, r * 0.13, tone.dark, 0.42);
    // 아래턱
    var jy = r * (0.26 + open * 0.66);
    ribbon(g, [{ x: hx + d * r * 0.12, y: hy + r * 0.20 },
               { x: hx + d * r * 0.66, y: hy + jy * 0.80 },
               { x: hx + d * r * 1.06, y: hy + jy }], r * 0.54, r * 0.22, tone.dark);
    // 목구멍의 불
    g.fillStyle(tone.glow, 0.50 + 0.35 * Math.sin(t / 240));
    g.fillTriangle(hx + d * r * 0.20, hy + r * 0.14, hx + d * r * 0.98, hy + r * 0.19,
                   hx + d * r * 0.60, hy + jy * 0.84);
    // 이빨 — 위아래 엇갈리게
    for (i = 0; i < 6; i++) {
      f = i / 5;
      ux = hx + d * r * (0.24 + f * 0.84); uy = hy + r * (0.14 + f * 0.05);
      tri(g, ux - r * 0.05, uy, ux + r * 0.05, uy, ux + d * r * 0.02, uy + r * 0.19 * (1 - f * 0.4), tone.horn, 1);
      lx = hx + d * r * (0.20 + f * 0.80); ly = hy + jy * (0.70 + f * 0.30) - r * 0.02;
      tri(g, lx - r * 0.05, ly, lx + r * 0.05, ly, lx + d * r * 0.02, ly - r * 0.17 * (1 - f * 0.4), tone.horn, 1);
    }
    // ③ 눈 + 눈두덩
    g.fillStyle(tone.glow, 1);
    g.fillEllipse(hx + d * r * 0.18, hy - r * 0.14, r * 0.32, r * 0.21, 10);
    g.fillStyle(0x120c0c, 1);
    g.fillEllipse(hx + d * r * 0.18, hy - r * 0.14, r * 0.075, r * 0.18, 8);
    g.fillStyle(tone.dark, 1);
    g.fillTriangle(hx - d * r * 0.06, hy - r * 0.36, hx + d * r * 0.48, hy - r * 0.28,
                   hx - d * r * 0.02, hy - r * 0.08);
  }

  //  날개 — 막 + 손가락뼈 + 끝의 갈고리.
  //  ⚠ 두 번 실패했다. ① 삼각형 한 장 → 박쥐 스티커. ② 손목에서 부채꼴 삼각형
  //    여러 장 + 뼈를 크림색으로 긋기 → **막이 판때기가 되고 뼈만 가시처럼 튀어나왔다**
  //    (실측 렌더). 원인 둘 — 막 색이 몸통과 같아 덩어리로 붙었고, 뼈가 막보다 밝았다.
  //  지금은 ① 막을 **몸통보다 어둡게** 다각형 한 장으로 그리고
  //         ② 손가락 사이를 손목 쪽으로 당겨 **가리비처럼 판다**(그게 용 날개 윤곽이다)
  //         ③ 뼈는 막보다 한 단계만 밝게, 크림색은 갈고리에만 남긴다.
  function wing(g, sx, sy, r, tone, spread, flap, back, d) {
    var memA = back ? 0.66 : 1;
    var bone = back ? tone.dark : tone.scale, boneA = back ? 0.9 : 1;
    var lift = r * (1.02 + 0.18 * flap) * spread;
    var ex = sx - d * r * 0.32 * spread, ey = sy - lift;            // 팔꿈치(위·살짝 뒤)
    var wx = sx - d * r * 1.22 * spread, wy = sy - lift * 1.34;     // 손목(더 위뒤)
    var tips = [], i, f, phi, len, a, b, ux, uy, Ln;
    // ⚠ 손가락 **차례**가 곧 윤곽선의 차례다. 박쥐·용의 날개는 앞가장자리가
    //   어깨→팔꿈치→손목→'가장 바깥 손가락 끝'으로 이어지고, 거기서부터 나머지
    //   손가락 끝을 훑으며 몸 쪽으로 돌아온다. 앞뒤를 뒤집었더니 다각형이 스스로
    //   교차해 **접힌 종이 같은 형상**이 나왔다(실측). 바깥(=뒤)에서 몸 쪽(=앞)으로.
    for (i = 0; i < 4; i++) {
      f = i / 3;
      phi = -1.18 + f * 1.76;
      len = r * (1.62 - f * 0.40) * spread;
      tips.push({ x: wx + d * Math.sin(phi) * len, y: wy + Math.cos(phi) * len });
    }
    var P = [{ x: sx, y: sy }, { x: ex, y: ey }, { x: wx, y: wy }];
    for (i = 0; i < 4; i++) {
      P.push(tips[i]);
      if (i < 3) {
        a = tips[i]; b = tips[i + 1];
        P.push({ x: wx + ((a.x + b.x) * 0.5 - wx) * 0.74,
                 y: wy + ((a.y + b.y) * 0.5 - wy) * 0.74 });
      }
    }
    P.push({ x: sx + d * r * 0.26, y: sy + r * 0.52 });   // 옆구리에서 닫는다
    poly(g, P, tone.dark, memA);
    ribbon(g, [{ x: sx, y: sy }, { x: ex, y: ey }, { x: wx, y: wy }], r * 0.26, r * 0.14, bone, boneA);
    for (i = 0; i < 4; i++) {
      ribbon(g, [{ x: wx, y: wy }, tips[i]], r * 0.11, r * 0.045, bone, boneA);
      ux = tips[i].x - wx; uy = tips[i].y - wy;
      Ln = Math.sqrt(ux * ux + uy * uy) || 1; ux /= Ln; uy /= Ln;
      tri(g, tips[i].x - uy * r * 0.07, tips[i].y + ux * r * 0.07,
             tips[i].x + uy * r * 0.07, tips[i].y - ux * r * 0.07,
             tips[i].x + ux * r * 0.15 - uy * r * 0.10,
             tips[i].y + uy * r * 0.15 + ux * r * 0.10, tone.horn, boneA);
    }
    // 손목의 엄지 갈고리 — 날개를 접어도 남는 신호
    tri(g, wx - d * r * 0.09, wy - r * 0.02, wx + d * r * 0.07, wy + r * 0.10,
           wx + d * r * 0.20 * spread, wy - r * 0.30 * spread, tone.horn, boneA);
  }

  //  몸통 — 가슴(높고 두껍다) → 허리(잘록) → 엉덩이(둥글다).
  //  타원 하나로는 이 세 마디가 안 나오고, 안 나오면 **알로 돌아간다.**
  function torso(g, cx, cy, r, T, tone, d) {
    var P = [
      { x: cx + d * r * 1.06, y: cy - r * 0.50 },
      { x: cx + d * r * 1.24, y: cy + r * 0.14 },
      { x: cx + d * r * 0.88, y: cy + r * 0.64 },
      { x: cx - d * r * 0.32, y: cy + r * 0.74 },
      { x: cx - d * r * 1.16, y: cy + r * 0.50 },
      { x: cx - d * r * 1.42, y: cy - r * 0.12 },
      { x: cx - d * r * 1.00, y: cy - r * 0.60 },
      { x: cx - d * r * 0.10, y: cy - r * 0.74 },
      { x: cx + d * r * 0.72, y: cy - r * 0.76 }
    ];
    poly(g, P, tone.dark, 1);
    var Q = [], i;
    for (i = 0; i < P.length; i++)
      Q.push({ x: cx + (P[i].x - cx) * 0.86, y: cy + (P[i].y - cy) * 0.83 });
    poly(g, Q, tone.scale, 1);
    g.fillStyle(tone.belly, 0.9);
    g.fillEllipse(cx + d * r * 0.18, cy + r * 0.52, r * 1.62, r * 0.44, 14);
    g.lineStyle(Math.max(1, r * 0.05), tone.dark, 0.32);
    for (i = -1; i <= 2; i++)
      g.lineBetween(cx + d * r * (0.18 + i * 0.34) - r * 0.14, cy + r * 0.32,
                    cx + d * r * (0.18 + i * 0.34) - r * 0.08, cy + r * 0.70);
    // 옆구리 비늘 결 — 어깨에서 엉덩이로 흐르는 호 세 줄
    g.lineStyle(Math.max(1, r * 0.045), tone.dark, 0.28);
    for (i = 0; i < 3; i++)
      g.lineBetween(cx + d * r * (0.62 - i * 0.30), cy - r * (0.56 - i * 0.06),
                    cx - d * r * (0.30 + i * 0.32), cy - r * (0.30 - i * 0.10));
  }

  // ── 종류별 ────────────────────────────────────────────────────────────────

  //  재를 뒤집어쓴 파수병 — 계란 부족의 마지막. 이미 짐승 쪽으로 기울었다
  //  (짧은 꼬리·등가시). 웅크린 두 발 짐승이라 어깨가 실루엣의 폭을 만든다.
  function sentry(g, cx, cy, r, T, tone, t) {
    var d = 1, br = r * 0.80, i, s, ax, ay, ex, ey, fx, fy, ph;
    var sway = Math.sin(t / 760) * br * 0.04;
    var tail = bez(cx - br * 0.70, cy + br * 0.42, cx - br * 1.75, cy + br * 0.95 * T,
                   cx - br * 2.00, cy + br * 0.02, 10);
    ribbon(g, tail, br * 0.36, br * 0.05, tone.dark);
    ribbon(g, tail, br * 0.24, br * 0.03, tone.scale);
    ridge(g, tail, 0.05, 0.92, br * 0.13, tone.dark, -1);
    leg(g, cx - br * 0.48, cy + br * 0.54, cx - br * 0.70, cy + br * 1.12 * T,
           cx - br * 0.36, cy + br * 1.54 * T, br * 0.25, tone, d, br * 0.92, true);
    leg(g, cx + br * 0.46, cy + br * 0.54, cx + br * 0.70, cy + br * 1.12 * T,
           cx + br * 1.00, cy + br * 1.52 * T, br * 0.27, tone, d, br * 0.98, false);
    var P = [
      { x: cx + br * 0.94, y: cy - br * 0.52 }, { x: cx + br * 1.04, y: cy + br * 0.38 },
      { x: cx + br * 0.60, y: cy + br * 0.88 }, { x: cx - br * 0.60, y: cy + br * 0.88 },
      { x: cx - br * 1.04, y: cy + br * 0.38 }, { x: cx - br * 0.94, y: cy - br * 0.52 },
      { x: cx - br * 0.42, y: cy - br * 0.94 }, { x: cx + br * 0.42, y: cy - br * 0.94 }
    ];
    poly(g, P, tone.dark, 1);
    var Q = [];
    for (i = 0; i < P.length; i++) Q.push({ x: cx + (P[i].x - cx) * 0.84, y: cy + (P[i].y - cy) * 0.84 });
    poly(g, Q, tone.scale, 1);
    // 가슴 균열에서 새는 불 — '재를 뒤집어썼다'가 색이 아니라 물건이 된다
    g.fillStyle(tone.glow, 0.42 + 0.26 * Math.sin(t / 420));
    for (i = 0; i < 3; i++)
      g.fillTriangle(cx - br * 0.32 + i * br * 0.30, cy - br * 0.14,
                     cx - br * 0.22 + i * br * 0.30, cy - br * 0.10,
                     cx - br * 0.20 + i * br * 0.30, cy + br * 0.40);
    for (s = -1; s <= 1; s += 2) {
      g.fillStyle(tone.dark, 1);  g.fillEllipse(cx + s * br * 1.02, cy - br * 0.44, br * 0.66, br * 0.48, 12);
      g.fillStyle(tone.scale, 1); g.fillEllipse(cx + s * br * 1.00, cy - br * 0.50, br * 0.52, br * 0.36, 12);
      for (i = 0; i < 3; i++)
        tri(g, cx + s * br * (0.70 + i * 0.24), cy - br * 0.74,
               cx + s * br * (0.86 + i * 0.24), cy - br * 0.64,
               cx + s * br * (0.80 + i * 0.28), cy - br * (1.32 - i * 0.18), tone.horn, 1);
      ax = cx + s * br * 1.12; ay = cy - br * 0.36;
      ex = cx + s * br * 1.44; ey = cy + br * 0.48;
      fx = cx + s * br * 1.28; fy = cy + br * 1.30 * T;
      ribbon(g, [{ x: ax, y: ay }, { x: ex, y: ey }], br * 0.44, br * 0.34, tone.dark);
      ribbon(g, [{ x: ex, y: ey }, { x: fx, y: fy }], br * 0.36, br * 0.24, tone.scale);
      g.fillStyle(tone.dark, 1); g.fillCircle(ex, ey, br * 0.20);
      talons(g, fx, fy, br * 0.95, s, tone, 3, 0.40);
    }
    ribbon(g, [{ x: cx, y: cy - br * 0.80 }, { x: cx + br * 0.22, y: cy - br * 1.16 }],
           br * 0.52, br * 0.40, tone.dark);
    head(g, cx + br * 0.52 + sway, cy - br * 1.30, br * 0.56, tone,
         0.22 + 0.20 * Math.sin(t / 500), d, t);
    g.fillStyle(tone.glow, 0.26);
    for (i = 0; i < 5; i++) {
      ph = ((t / 1100) + i * 0.2) % 1;
      g.fillCircle(cx + Math.sin(t / 620 + i * 2) * br * 0.7,
                   cy - br * 1.5 - ph * br * 1.5, br * 0.13 * (1 - ph));
    }
  }

  //  드레이크(권속) — 같은 골격을 작고 낮게. 날개를 접고 목을 앞으로 뻗어
  //  '달려든다'가 읽히게 한다. 용과 같은 종족이라는 것이 자세로 전달돼야 한다.
  function drake(g, cx, cy, r, T, tone, t, flap) {
    var d = 1, f = 0.44 + 0.10 * Math.sin(t / 420);
    var sx = cx + r * 0.54, sy = cy - r * 0.36;
    var tail = bez(cx - r * 0.88, cy + r * 0.20, cx - r * 2.10, cy + r * 0.74 * T,
                   cx - r * 2.42, cy - r * 0.42, 12);
    ribbon(g, tail, r * 0.48, r * 0.06, tone.dark);
    ribbon(g, tail, r * 0.32, r * 0.03, tone.scale);
    ridge(g, tail, 0.05, 0.94, r * 0.13, tone.dark, -1);
    wing(g, sx - r * 0.18, sy - r * 0.04, r * 0.82, tone, f, -flap, true, d);
    leg(g, cx - r * 0.74, cy + r * 0.28, cx - r * 0.96, cy + r * 0.82 * T,
           cx - r * 0.60, cy + r * 1.16 * T, r * 0.21, tone, d, r * 0.80, true);
    leg(g, cx + r * 0.56, cy + r * 0.32, cx + r * 0.74, cy + r * 0.84 * T,
           cx + r * 0.94, cy + r * 1.14 * T, r * 0.17, tone, d, r * 0.70, true);
    torso(g, cx, cy, r * 0.88, T, tone, d);
    leg(g, cx - r * 0.50, cy + r * 0.32, cx - r * 0.78, cy + r * 0.90 * T,
           cx - r * 0.20, cy + r * 1.28 * T, r * 0.24, tone, d, r * 0.88, false);
    leg(g, cx + r * 0.76, cy + r * 0.34, cx + r * 0.96, cy + r * 0.92 * T,
           cx + r * 1.18, cy + r * 1.26 * T, r * 0.19, tone, d, r * 0.76, false);
    var neck = bez(sx - r * 0.06, sy + r * 0.12, sx + r * 0.72, sy - r * 0.46,
                   sx + r * 1.34, sy - r * 0.34, 10);
    ribbon(g, neck, r * 0.66, r * 0.34, tone.dark);
    ribbon(g, neck, r * 0.46, r * 0.21, tone.scale);
    ridge(g, neck, 0.10, 0.96, r * 0.12, tone.dark, -1);
    head(g, sx + r * 1.66, sy - r * 0.30, r * 0.58, tone, 0.34 + 0.28 * Math.sin(t / 280), d, t);
    wing(g, sx - r * 0.04, sy - r * 0.14, r * 0.94, tone, f + 0.08, flap, false, d);
  }

  //  용의 발톱 — **몸의 일부만** 땅을 뚫고 나와 있다. 나머지는 화면 밖이라는 게 요점이다.
  //  ⚠ 첫 판은 손가락을 한 점에서 부채처럼 위로 뻗었더니 **팔과 떨어진 가시 다발**로
  //    보였다(실측 렌더로 확인). 손으로 읽히려면 ① 손등이 있어야 하고 ② 마디에서
  //    한 번 꺾여야 하고 ③ 끝의 갈고리가 **아래를 향해야** 한다 — 움켜쥐려는 손이다.
  function claw(g, cx, cy, r, T, tone, t) {
    var sway = Math.sin(t / 700) * r * 0.05;
    var gy = cy + r * 1.05 * T, i, k, a, s, bx, by, mx, my, ex, ey;
    g.fillStyle(0x241d16, 0.92); g.fillEllipse(cx, gy, r * 3.1, r * 0.88 * T, 18);
    g.fillStyle(0x3a3024, 0.92); g.fillEllipse(cx, gy - r * 0.08, r * 2.4, r * 0.62 * T, 16);
    for (k = 0; k < 5; k++) {          // 솟구친 땅조각
      a = -0.35 + k * 0.92;
      tri(g, cx + Math.cos(a) * r * 1.45, gy + Math.sin(a) * r * 0.42 * T,
             cx + Math.cos(a) * r * 2.05, gy + Math.sin(a) * r * 0.52 * T,
             cx + Math.cos(a) * r * 1.72, gy - r * 0.50, 0x4a3d2c, 0.95);
    }
    ribbon(g, [{ x: cx + sway * 0.3, y: cy + r * 1.35 }, { x: cx + sway, y: cy - r * 0.28 }],
           r * 1.60, r * 1.22, tone.dark);
    ribbon(g, [{ x: cx + sway * 0.3, y: cy + r * 1.35 }, { x: cx + sway, y: cy - r * 0.28 }],
           r * 1.24, r * 0.94, tone.scale);
    for (k = 0; k < 4; k++) {          // 겹친 비늘판
      g.fillStyle(tone.dark, 0.5);
      g.fillEllipse(cx + sway * 0.5, cy + r * (0.95 - k * 0.42), r * (1.04 - k * 0.06), r * 0.20, 12);
    }
    for (s = -1; s <= 1; s += 2)       // 손목 가시
      tri(g, cx + sway + s * r * 0.54, cy - r * 0.16, cx + sway + s * r * 0.64, cy + r * 0.12,
             cx + sway + s * r * 1.30, cy - r * 0.56, tone.horn, 1);
    g.fillStyle(tone.dark, 1);  g.fillEllipse(cx + sway, cy - r * 0.52, r * 1.48, r * 0.88, 14);
    g.fillStyle(tone.scale, 1); g.fillEllipse(cx + sway, cy - r * 0.58, r * 1.28, r * 0.72, 14);
    var SPR = [-1.12, -0.60, 0.0, 0.58, 1.08], LEN = [0.90, 1.18, 1.34, 1.16, 0.86];
    for (i = 0; i < 5; i++) {
      bx = cx + sway + SPR[i] * r * 0.56; by = cy - r * 0.64;
      mx = cx + sway * 1.3 + SPR[i] * r * 1.18; my = by - r * LEN[i] * 0.80;
      ex = mx + SPR[i] * r * 0.32; ey = my - r * LEN[i] * 0.28;
      ribbon(g, [{ x: bx, y: by }, { x: mx, y: my }], r * 0.42, r * 0.31, tone.dark);
      ribbon(g, [{ x: bx, y: by }, { x: mx, y: my }], r * 0.28, r * 0.20, tone.scale);
      ribbon(g, [{ x: mx, y: my }, { x: ex, y: ey }], r * 0.29, r * 0.20, tone.dark);
      g.fillStyle(tone.dark, 1); g.fillCircle(mx, my, r * 0.17);
      tri(g, ex - r * 0.13, ey - r * 0.04, ex + r * 0.13, ey + r * 0.04,
             ex - SPR[i] * r * 0.52, ey + r * 0.30, tone.horn, 1);
    }
    g.fillStyle(tone.glow, 0.18 + 0.10 * Math.sin(t / 500));
    g.fillEllipse(cx + sway, cy - r * 0.50, r * 0.94, r * 0.34, 12);
  }

  //  태초의 용 — 같은 골격의 완성형. 목이 S자로 서고 날개를 다 편다.
  //  등줄기 가시가 머리→목→등→꼬리 끝까지 **한 줄로** 이어지는 것이 핵심이다.
  function dragon(g, cx, cy, r, T, tone, t) {
    var d = 1, flap = Math.sin(t / 620), br = Math.sin(t / 1400);
    var sx = cx + r * 0.60, sy = cy - r * 0.46;
    var tail = bez(cx - r * 0.92, cy + r * 0.22, cx - r * 2.70, cy + r * 1.00 * T,
                   cx - r * 2.95, cy - r * 1.05, 14);
    ribbon(g, tail, r * 0.64, r * 0.07, tone.dark);
    ribbon(g, tail, r * 0.44, r * 0.04, tone.scale);
    ridge(g, tail, 0.05, 0.95, r * 0.17, tone.dark, -1);
    wing(g, sx - r * 0.22, sy - r * 0.08, r * 1.06, tone, 0.92, -flap, true, d);
    leg(g, cx - r * 0.84, cy + r * 0.32, cx - r * 1.08, cy + r * 0.94 * T,
           cx - r * 0.70, cy + r * 1.34 * T, r * 0.27, tone, d, r * 0.92, true);
    leg(g, cx + r * 0.64, cy + r * 0.38, cx + r * 0.84, cy + r * 0.96 * T,
           cx + r * 1.06, cy + r * 1.32 * T, r * 0.22, tone, d, r * 0.80, true);
    torso(g, cx, cy, r, T, tone, d);
    leg(g, cx - r * 0.56, cy + r * 0.36, cx - r * 0.88, cy + r * 1.02 * T,
           cx - r * 0.26, cy + r * 1.48 * T, r * 0.31, tone, d, r, false);
    leg(g, cx + r * 0.88, cy + r * 0.40, cx + r * 1.10, cy + r * 1.04 * T,
           cx + r * 1.36, cy + r * 1.46 * T, r * 0.24, tone, d, r * 0.86, false);
    var neck = bez(sx - r * 0.12, sy + r * 0.12, sx + r * 0.88, sy - r * 0.44,
                   sx + r * 0.80, sy - r * 1.22, 8)
      .concat(bez(sx + r * 0.80, sy - r * 1.22, sx + r * 0.74, sy - r * 1.90,
                  sx + r * 1.36, sy - r * 2.06, 8).slice(1));
    ribbon(g, neck, r * 0.90, r * 0.40, tone.dark);
    ribbon(g, neck, r * 0.62, r * 0.26, tone.scale);
    ridge(g, neck, 0.08, 0.98, r * 0.15, tone.dark, -1);
    head(g, sx + r * 1.68, sy - r * 2.14, r * 0.78, tone, 0.38 + 0.30 * Math.sin(t / 300), d, t);
    wing(g, sx - r * 0.06, sy - r * 0.20, r * 1.22, tone, 0.98, flap, false, d);
    g.fillStyle(tone.glow, 0.16 + 0.12 * Math.abs(br));
    g.fillEllipse(sx + r * 0.06, sy + r * 0.34, r * 0.72, r * 0.52, 12);
  }

  // ── 바깥 문 ───────────────────────────────────────────────────────────────
  //  `def.art` 가 `beast:종류:결` 형태다(예: `beast:drake:frost`).
  //  eggart 의 ART 표를 안 건드리려고 문자열에 실어 보낸다 — 그 표는 계란 전용이다.
  BA.parse = function (art) {
    if (typeof art !== 'string' || art.indexOf('beast:') !== 0) return null;
    var p = art.split(':');
    return { kind: p[1] || 'drake', tone: BA.TONE[p[2]] || BA.TONE.ash };
  };

  //  `UI.drawUnit` 이 이 함수로 넘긴다. sx/sy 는 **화면 좌표**(투영 끝난 값)다.
  //  ⚠ facing 을 무시하면 보스가 **어느 쪽으로 움직이든 오른쪽만 본다.**
  //    계란 유닛은 8방향 스냅이 있지만 이 아트는 옆모습 한 장이라, 최소한
  //    좌우는 뒤집어야 '쫓아온다'가 읽힌다. 좌표를 통째로 미러링하지 않고
  //    `d` 한 값으로만 뒤집는다 — 미러링하면 그림자와 지면까지 따라 뒤집힌다.
  BA.draw = function (g, def, sx, sy, r0, alpha, t, facing) {
    var info = BA.parse(def.art);
    if (!info) return false;
    var T = (GAME.Iso && GAME.Iso.TILT) || 0.72;
    var r = r0 * (BA.SCALE[info.kind] || 1.6);
    var a = alpha === undefined ? 1 : alpha;
    var tt = t || 0;
    g.fillStyle(0x000000, 0.30 * a);
    g.fillEllipse(sx, sy, r * 2.0, r * 2.0 * T, 14);
    // ⚠ Phaser Graphics 는 알파를 인자로 받는 API 가 제각각이라, 통째로 반투명하게
    //   그리려면 컨테이너 알파를 쓰는 게 맞다. 여기서는 보스가 늘 불투명하므로
    //   알파는 그림자에만 쓴다(로비 등 반투명 호출은 계란 아트만 한다).
    //  좌우 반전은 **캔버스 변환**으로 한다. `d` 를 함수마다 실어 나르면 좌표
    //  수십 개를 전부 고쳐야 하고 하나만 빠뜨려도 몸이 갈라진다(꼬리만 반대로
    //  붙는 식으로). 그림자는 변환 밖에서 이미 찍었으므로 지면은 그대로다.
    var flip = facing !== undefined && Math.cos(facing) < 0;
    if (flip) { g.save(); g.translateCanvas(sx * 2, 0); g.scaleCanvas(-1, 1); }
    if (info.kind === 'sentry') sentry(g, sx, sy - r * 0.55, r, T, info.tone, tt);
    else if (info.kind === 'claw') claw(g, sx, sy - r * 0.30, r, T, info.tone, tt);
    else if (info.kind === 'dragon') dragon(g, sx, sy - r * 0.70, r, T, info.tone, tt);
    else drake(g, sx, sy - r * 0.55, r, T, info.tone, tt, Math.sin(tt / 520));
    if (flip) g.restore();
    return true;
  };
})();
