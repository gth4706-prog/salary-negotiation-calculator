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
  BA.SCALE = { sentry: 1.50, drake: 1.60, claw: 2.10,
               foot: 1.55, wingpart: 1.30, halfface: 1.25, waking: 1.50,
               dragon: 2.60 };

  // 결(속성)별 색. 같은 골격에 색만 갈아 끼워 권속을 여러 종으로 늘린다.
  //  ⚠ **네 톤이 필요하다.** 처음엔 dark/scale/belly 셋이었는데, 그러면 위에서
  //    빛을 받는 면(등·어깨·주둥이 윗면)을 표현할 색이 없어 몸이 통째로 평평해진다.
  //    `lit`(등광)을 넣고 나서야 덩어리에 부피가 생겼다 — 레퍼런스 조각의
  //    '깎여 있다'는 인상은 결국 윗면과 옆면의 밝기 차이다.
  BA.TONE = {
    ash:   { scale: 0x4a4750, dark: 0x24222a, lit: 0x6b6772, belly: 0x8f8a95, glow: 0xff7a3c, horn: 0xd9cfc0 },
    frost: { scale: 0x4a6a7e, dark: 0x243743, lit: 0x6d92a8, belly: 0x9fc0d3, glow: 0x8fe0ff, horn: 0xdfeef5 },
    storm: { scale: 0x574a7e, dark: 0x2a2343, lit: 0x7a6ba6, belly: 0xa89ad0, glow: 0xffe066, horn: 0xe6dcff },
    ember: { scale: 0x6e3a2c, dark: 0x381911, lit: 0x9a5238, belly: 0xc07a52, glow: 0xffb03c, horn: 0xf0dcc0 }
  };

  // ── 기본 도형 ──────────────────────────────────────────────────────────────
  //  ⚠ 뒤쪽 날개를 **알파로** 어둡게 했더니 잔디색이 그대로 비쳐 막이 유리처럼
  //    보였다(실측). 뒤에 있는 것은 투명한 게 아니라 **어두운** 것이다 — 색을 섞는다.
  function mix(a, b, t) {
    var ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    var br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return (((ar + (br - ar) * t) | 0) << 16) |
           (((ag + (bg - ag) * t) | 0) << 8) | ((ab + (bb - ab) * t) | 0);
  }

  function tri(g, x1, y1, x2, y2, x3, y3, col, a) {
    g.fillStyle(col, a === undefined ? 1 : a);
    g.fillTriangle(x1, y1, x2, y2, x3, y3);
  }
  function poly(g, pts, col, a) {
    g.fillStyle(col, a === undefined ? 1 : a);
    g.fillPoints(pts, true);
  }

  //  ══ 곡선 외곽선 — 이 파일에서 가장 중요한 함수 ══════════════════════════
  //  사용자 신고(2026-08-02): "어디 유아용 책에 나올 법한 삼각형 사각형 모음이야."
  //  맞는 지적이었고 **도구의 한계가 아니라 내 선택 실수**였다. 실측으로 확인:
  //    · `fillPoints` 에 표본을 조밀하게 주면 **완전히 매끄러운 곡선**이 나온다
  //    · `fillGradientStyle` 은 사각형·삼각형에서 진짜 그라디언트로 칠해진다
  //    · 다만 `fillPoints` + 그라디언트는 **삼각형마다 따로 칠해져 깨진다**(쓰면 안 된다)
  //  (`scratchpad/gradtest.js` 로 실측. 결과: WEBGL · hasGradient true · hasBezier false)
  //
  //  그래서 규율이 바뀐다 — **덩어리는 조종점 몇 개로 잡고 곡선으로 채운다.**
  //  타원을 겹치거나 다각형을 늘리는 것으로는 유기적인 형태가 안 나온다.
  function smooth(pts, per) {
    var out = [], n = pts.length, i, j, p0, p1, p2, p3, t, t2, t3;
    per = per || 10;
    for (i = 0; i < n; i++) {
      p0 = pts[(i - 1 + n) % n]; p1 = pts[i]; p2 = pts[(i + 1) % n]; p3 = pts[(i + 2) % n];
      for (j = 0; j < per; j++) {
        t = j / per; t2 = t * t; t3 = t2 * t;
        out.push({
          x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t +
                    (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
                    (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t +
                    (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
                    (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
        });
      }
    }
    return out;
  }

  //  같은 모양을 한 겹 안쪽으로 — 층을 쌓아 부피를 만든다.
  //  ⚠ 중심에서 균일하게 줄이면 가늘고 긴 부분이 먼저 사라진다. 그래서
  //    **밝은 쪽으로 치우쳐** 줄인다(빛이 위에서 온다 = 위쪽 테두리가 얇다).
  function inset(pts, k, ox, oy) {
    var cx = 0, cy = 0, i, out = [];
    for (i = 0; i < pts.length; i++) { cx += pts[i].x; cy += pts[i].y; }
    cx /= pts.length; cy /= pts.length;
    for (i = 0; i < pts.length; i++)
      out.push({ x: cx + (pts[i].x - cx) * k + (ox || 0), y: cy + (pts[i].y - cy) * k + (oy || 0) });
    return out;
  }

  //  조종점 → 매끄러운 덩어리 하나.
  function blob(g, ctrl, col, alpha, per) {
    g.fillStyle(col, alpha === undefined ? 1 : alpha);
    g.fillPoints(smooth(ctrl, per || 10), true);
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

  //  비늘 — 타원 안쪽에 작은 호를 줄지어 깐다.
  //  ⚠ 넓은 단색 면이 이 아트가 '자루처럼' 보이던 가장 큰 이유였다. 실루엣이
  //    아무리 좋아도 안쪽이 비면 종이 오리기가 된다. Phaser Graphics 에는 클립이
  //    없으므로 타원 방정식으로 **안에 드는 것만** 그린다(마스크 없이 같은 효과).
  function scalePatch(g, cx, cy, rx, ry, step, col, alpha, rot) {
    g.fillStyle(col, alpha);
    var c = Math.cos(rot || 0), sn = Math.sin(rot || 0);
    for (var y = -ry + step * 0.5; y < ry; y += step * 0.86) {
      var odd = Math.round((y + ry) / (step * 0.86)) % 2;
      for (var x = -rx + step * 0.5; x < rx; x += step) {
        var px = x + (odd ? step * 0.5 : 0);
        if ((px * px) / (rx * rx) + (y * y) / (ry * ry) > 0.94) continue;
        g.fillEllipse(cx + px * c - y * sn, cy + px * sn + y * c,
                      step * 0.92, step * 0.34, 7);
      }
    }
  }

  //  날개막의 힘줄 — 손목에서 가장자리로 뻗는 가는 선. 막이 '펴져 있다'가 된다.
  function veins(g, wx, wy, tips, r, col, alpha) {
    g.lineStyle(Math.max(0.8, r * 0.030), col, alpha);
    for (var i = 0; i < tips.length; i++) {
      for (var k = 1; k <= 2; k++) {
        var f = k / 3;
        var nx = tips[i].x + (i < tips.length - 1
          ? (tips[i + 1].x - tips[i].x) * f : (tips[i - 1].x - tips[i].x) * f);
        var ny = tips[i].y + (i < tips.length - 1
          ? (tips[i + 1].y - tips[i].y) * f : (tips[i - 1].y - tips[i].y) * f);
        g.lineBetween(wx, wy, wx + (nx - wx) * 0.80, wy + (ny - wy) * 0.80);
      }
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
      //  ⚠ 밑동이 좁고 많이 튀어나오면 **몸에서 떨어진 삼각형**으로 보인다(실측).
      //    가시는 등에서 자라난 것이라 밑동이 넓고 낮아야 붙어 보인다.
      g.fillTriangle(c.x - ux * s * 1.05 + nx * s * 0.25, c.y - uy * s * 1.05 + ny * s * 0.25,
                     c.x + ux * s * 1.05 + nx * s * 0.25, c.y + uy * s * 1.05 + ny * s * 0.25,
                     c.x + nx * s * 1.35 - ux * s * 0.45, c.y + ny * s * 1.35 - uy * s * 0.45);
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
    if (!back) {
      g.fillStyle(tone.scale, 1); g.fillEllipse(hx, hy - w * 0.18, w * 1.5, w * 1.7, 12);
      g.fillStyle(tone.lit, 0.6); g.fillEllipse(hx - dir * w * 0.30, hy - w * 0.55, w * 0.78, w * 0.62, 10);
    }
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
  //  뿔 — 곡선으로 휘어야 뿔이다. 삼각형 하나는 '가시'지 뿔이 아니다.
  //  밑동이 굵고 끝으로 갈수록 가늘어지며 바깥으로 휜다.
  function horn(g, bx, by, ax, ay, curve, w, tone, back) {
    var i, pts = [], t, mx, my;
    var dx = ax - bx, dy = ay - by;
    var nx = -dy, ny = dx, L = Math.sqrt(nx * nx + ny * ny) || 1;
    nx /= L; ny /= L;
    for (i = 0; i <= 10; i++) {
      t = i / 10;
      mx = bx + dx * t + nx * curve * Math.sin(t * Math.PI) * L;
      my = by + dy * t + ny * curve * Math.sin(t * Math.PI) * L;
      pts.push({ x: mx, y: my });
    }
    //  `back=true` 는 '몸에 가까운 색' 이라는 뜻이다 — 뿔·볏처럼 실루엣을
    //  만들되 주인공이 되면 안 되는 것에 쓴다.
    ribbon(g, pts, w, w * 0.10, back ? mix(tone.horn, tone.dark, 0.62) : tone.horn, 1);
    ribbon(g, pts, w * 0.42, w * 0.05,
           back ? mix(tone.dark, 0x000000, 0.3) : mix(tone.horn, tone.dark, 0.45), 0.55);
  }

  //  머리 — 이 아트에서 사람이 가장 오래 보는 곳이다.
  //  ⚠ 예전엔 타원 세 장(두개골) + 띠(주둥이) + 삼각형(뿔·이빨)이었다. 그래서
  //    "삼각형 사각형 모음"이라는 말을 들었고, 맞는 말이었다. 지금은 **두개골과
  //    아래턱을 각각 하나의 닫힌 곡선**으로 잡는다 — 눈두덩·볼·주둥이가 한 덩어리로
  //    이어져야 짐승의 머리가 된다(레퍼런스의 조각들이 전부 그렇다).
  //  ⚠ 뿔을 다섯 개 · 크림색 · 길게 했더니 **갈기**로 보였다(실측). 뿔은
  //    머리보다 눈에 덜 띄어야 한다 — 주인공은 눈과 아가리다. 셋으로 줄이고
  //    몸통색에 가깝게(뿔색을 어둡게 섞어) 짧고 두껍게 간다.
  var HORN_DIR = [[-0.74, -0.82], [-1.00, -0.34], [-0.86, 0.24]];
  var HORN_LEN = [0.86, 0.96, 0.70];
  function head(g, hx, hy, r, tone, open, d, t) {
    var i, f, bx, by, ex, ey, L, ux, uy, lx, ly;
    // ① 뿔 왕관 — 머리보다 먼저 그려 뒤로 간다. 곡선으로 휜다.
    //  ⚠ 뿔 밑동을 두개골 **안쪽**에 두었더니 굵은 부분이 통째로 가려져
    //    가느다란 끝만 삐져나왔다 — 메기수염처럼 보였다(실측). 밑동은 두개골
    //    **바깥 테두리 위**에 놓아야 굵기가 보이고, 그래야 뿔이 된다.
    for (i = 0; i < HORN_DIR.length; i++) {
      bx = hx - d * r * (0.44 - i * 0.06);
      by = hy - r * (0.40 - i * 0.22);
      L = r * HORN_LEN[i] * 0.82;
      ex = bx + d * HORN_DIR[i][0] * L; ey = by + HORN_DIR[i][1] * L;
      horn(g, bx, by, ex, ey, (i - 1) * 0.06 - 0.06, r * 0.46, tone, true);
    }
    // ② 볼 판 — 예전엔 '볼 가시' 셋이었는데, 턱 아래로 휜 크림색 곡선이라
    //    **메기수염**으로 보였다(실측). 레퍼런스의 턱 둘레는 가시가 아니라
    //    **겹친 판**이다 — 실루엣을 늘리지 않고 두께만 준다.
    for (i = 0; i < 3; i++) {
      bx = hx - d * r * (0.10 + i * 0.16); by = hy + r * (0.14 + i * 0.07);
      g.fillStyle(i % 2 ? tone.dark : tone.scale, 0.9);
      g.fillEllipse(bx, by, r * (0.40 - i * 0.06), r * (0.22 - i * 0.03), 10);
    }

    // ③ 두개골 + 주둥이 — **하나의 곡선**. 눈두덩이 튀어나오고 코끝이 뾰족하다.
    var jy = r * (0.24 + open * 0.68);
    var S = [
      { x: hx - d * r * 0.62, y: hy - r * 0.22 },   // 뒤통수
      { x: hx - d * r * 0.30, y: hy - r * 0.56 },   // 정수리
      { x: hx + d * r * 0.10, y: hy - r * 0.52 },   // 눈두덩 앞
      { x: hx + d * r * 0.44, y: hy - r * 0.34 },   // 콧등 시작
      { x: hx + d * r * 0.92, y: hy - r * 0.22 },
      { x: hx + d * r * 1.26, y: hy - r * 0.02 },   // 코끝
      { x: hx + d * r * 1.14, y: hy + r * 0.20 },
      { x: hx + d * r * 0.66, y: hy + r * 0.24 },   // 윗턱 아랫선
      { x: hx + d * r * 0.16, y: hy + r * 0.30 },
      { x: hx - d * r * 0.34, y: hy + r * 0.34 }    // 볼
    ];
    blob(g, S, tone.dark, 1, 12);
    blob(g, inset(S, 0.88, d * r * 0.02, -r * 0.03), tone.scale, 1, 12);
    blob(g, inset(S, 0.52, d * r * 0.16, -r * 0.16), tone.lit, 0.85, 12);

    // ④ 아래턱 — 따로 하나의 곡선. open 만큼 벌어진다.
    var J = [
      { x: hx - d * r * 0.30, y: hy + r * 0.22 },
      { x: hx + d * r * 0.20, y: hy + jy * 0.72 },
      { x: hx + d * r * 0.74, y: hy + jy * 0.96 },
      { x: hx + d * r * 1.06, y: hy + jy * 0.88 },
      { x: hx + d * r * 0.92, y: hy + jy * 0.60 },
      { x: hx + d * r * 0.30, y: hy + jy * 0.36 }
    ];
    blob(g, J, tone.dark, 1, 12);
    blob(g, inset(J, 0.82, 0, -r * 0.02), tone.scale, 1, 12);

    // ⑤ 목구멍의 불 — 벌어진 틈 안쪽
    g.fillStyle(0x1a0d08, 1);
    g.fillTriangle(hx + d * r * 0.18, hy + r * 0.20, hx + d * r * 1.02, hy + r * 0.16,
                   hx + d * r * 0.60, hy + jy * 0.72);
    g.fillStyle(tone.glow, 0.55 + 0.35 * Math.sin(t / 240));
    g.fillTriangle(hx + d * r * 0.24, hy + r * 0.20, hx + d * r * 0.86, hy + r * 0.18,
                   hx + d * r * 0.54, hy + jy * 0.62);

    // ⑥ 이빨 — 곡선으로 휜 송곳니. 앞니가 가장 길다.
    for (i = 0; i < 5; i++) {
      f = i / 4;
      ux = hx + d * r * (0.30 + f * 0.76); uy = hy + r * (0.20 + f * 0.02);
      horn(g, ux, uy - r * 0.04, ux + d * r * 0.05, uy + r * (0.22 - f * 0.05), -0.10 * d, r * 0.14, tone, false);
      lx = hx + d * r * (0.40 + f * 0.62); ly = hy + jy * (0.72 + f * 0.22);
      horn(g, lx, ly + r * 0.04, lx + d * r * 0.04, ly - r * (0.20 - f * 0.04), 0.10 * d, r * 0.13, tone, false);
    }

    // ⑦ 콧구멍 + 눈. 눈두덩이 위를 덮어 '노려본다'가 된다.
    g.fillStyle(0x120c0c, 0.9);
    g.fillEllipse(hx + d * r * 1.02, hy - r * 0.10, r * 0.13, r * 0.08, 8);
    g.fillStyle(tone.glow, 1);
    g.fillEllipse(hx + d * r * 0.20, hy - r * 0.16, r * 0.34, r * 0.22, 12);
    g.fillStyle(0x120c0c, 1);
    g.fillEllipse(hx + d * r * 0.20, hy - r * 0.16, r * 0.08, r * 0.19, 10);
    blob(g, [
      { x: hx - d * r * 0.16, y: hy - r * 0.44 },
      { x: hx + d * r * 0.34, y: hy - r * 0.44 },
      { x: hx + d * r * 0.50, y: hy - r * 0.22 },
      { x: hx + d * r * 0.10, y: hy - r * 0.24 },
      { x: hx - d * r * 0.18, y: hy - r * 0.28 }
    ], tone.dark, 1, 10);
  }

  //  날개 — 막 + 손가락뼈 + 끝의 갈고리.
  //  ⚠ 두 번 실패했다. ① 삼각형 한 장 → 박쥐 스티커. ② 손목에서 부채꼴 삼각형
  //    여러 장 + 뼈를 크림색으로 긋기 → **막이 판때기가 되고 뼈만 가시처럼 튀어나왔다**
  //    (실측 렌더). 원인 둘 — 막 색이 몸통과 같아 덩어리로 붙었고, 뼈가 막보다 밝았다.
  //  지금은 ① 막을 **몸통보다 어둡게** 다각형 한 장으로 그리고
  //         ② 손가락 사이를 손목 쪽으로 당겨 **가리비처럼 판다**(그게 용 날개 윤곽이다)
  //         ③ 뼈는 막보다 한 단계만 밝게, 크림색은 갈고리에만 남긴다.
  function wing(g, sx, sy, r, tone, spread, flap, back, d) {
    var memCol = back ? mix(tone.dark, 0x000000, 0.42) : tone.dark;
    var bone = back ? mix(tone.scale, 0x000000, 0.45) : tone.scale;
    var litCol = back ? mix(tone.lit, 0x000000, 0.45) : tone.lit;
    var memA = 1, boneA = 1;
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
      phi = -1.30 + f * 1.34;
      len = r * (1.58 - f * 0.44) * spread;
      tips.push({ x: wx + d * Math.sin(phi) * len, y: wy + Math.cos(phi) * len });
    }
    //  ⚠ 막을 **다각형 한 장**으로 칠했더니 단색 판때기가 됐다(사용자 신고의 절반이
    //    이것이다). `fillPoints` 는 그라디언트를 못 받지만(삼각형마다 깨진다)
    //    **`fillTriangle` 은 받는다** — 그래서 막을 부챗살 삼각형으로 나눠 칠하면
    //    손목은 어둡고 가장자리는 밝은 진짜 명암이 생긴다(실측으로 확인).
    var P = [{ x: sx, y: sy }, { x: ex, y: ey }, { x: wx, y: wy }];
    for (i = 0; i < 4; i++) {
      P.push(tips[i]);
      if (i < 3) {
        a = tips[i]; b = tips[i + 1];
        P.push({ x: wx + ((a.x + b.x) * 0.5 - wx) * 0.74,
                 y: wy + ((a.y + b.y) * 0.5 - wy) * 0.74 });
      }
    }
    //  ⚠ 옆구리(어깨보다 아래·앞)에서 닫았더니 막이 **등 위를 덮어 검은 구멍**처럼
    //    보였다(실측). 날개는 어깨에서 나와 뒤로 뻗는 것이라 닫는 점도 어깨여야 한다.
    P.push({ x: sx + d * r * 0.06, y: sy + r * 0.16 });
    poly(g, P, memCol, memA);
    // 진짜 명암 — 손목(어둡다) → 가장자리(밝다). 그라디언트 삼각형이라야 나온다.
    var deep = mix(memCol, 0x000000, 0.35), edge = mix(memCol, litCol, 0.55);
    for (i = 0; i < 3; i++) {
      g.fillGradientStyle(deep, edge, deep, edge, 1);
      g.fillTriangle(wx, wy,
        wx + (tips[i].x - wx) * 0.97, wy + (tips[i].y - wy) * 0.97,
        wx + (tips[i + 1].x - wx) * 0.97, wy + (tips[i + 1].y - wy) * 0.97);
    }
    g.fillGradientStyle(deep, edge, deep, edge, 1);
    g.fillTriangle(sx, sy, wx, wy, wx + (tips[3].x - wx) * 0.97, wy + (tips[3].y - wy) * 0.97);
    g.fillGradientStyle(deep, deep, edge, edge, 1);
    g.fillTriangle(sx, sy, ex, ey, wx, wy);
    g.fillStyle(0xffffff, 0);   // 그라디언트 상태를 초기화한다(다음 도형에 새면 안 된다)
    veins(g, wx, wy, tips, r, litCol, 0.40);
    //  어깨막 — 팔뼈 안쪽의 넓은 면. 여기가 비면 **단색 오각형**이 하나 남는다(실측).
    g.fillStyle(litCol, 0.16);
    g.fillTriangle(sx, sy, ex, ey, wx, wy);
    g.lineStyle(Math.max(0.9, r * 0.035), litCol, 0.30);
    for (i = 1; i <= 2; i++) {
      var ff = i / 3;
      g.lineBetween(sx + (wx - sx) * ff * 0.35, sy + (wy - sy) * ff * 0.35,
                    ex + (wx - ex) * ff, ey + (wy - ey) * ff);
    }
    // 앞가장자리 빛 — 위에서 빛을 받는 뼈대 위쪽
    ribbon(g, [{ x: sx, y: sy }, { x: ex, y: ey }, { x: wx, y: wy }], r * 0.10, r * 0.05,
           litCol, 0.55);
    ribbon(g, [{ x: sx, y: sy }, { x: ex, y: ey }, { x: wx, y: wy }], r * 0.26, r * 0.14, bone, boneA);
    for (i = 0; i < 4; i++) {
      ribbon(g, [{ x: wx, y: wy }, tips[i]], r * 0.11, r * 0.045, bone, boneA);
      ux = tips[i].x - wx; uy = tips[i].y - wy;
      Ln = Math.sqrt(ux * ux + uy * uy) || 1; ux /= Ln; uy /= Ln;
      tri(g, tips[i].x - uy * r * 0.07, tips[i].y + ux * r * 0.07,
             tips[i].x + uy * r * 0.07, tips[i].y - ux * r * 0.07,
             tips[i].x + ux * r * 0.15 - uy * r * 0.10,
             tips[i].y + uy * r * 0.15 + ux * r * 0.10,
             back ? mix(tone.horn, 0x000000, 0.45) : tone.horn, 1);
    }
    // 손목의 엄지 갈고리 — 날개를 접어도 남는 신호
    tri(g, wx - d * r * 0.09, wy - r * 0.02, wx + d * r * 0.07, wy + r * 0.10,
           wx + d * r * 0.20 * spread, wy - r * 0.30 * spread,
           back ? mix(tone.horn, 0x000000, 0.45) : tone.horn, 1);
  }

  //  몸통 — 가슴(높고 두껍다) → 허리(잘록) → 엉덩이(둥글다).
  //  몸통 — 가슴(높고 두껍다) → 허리(잘록) → 엉덩이(둥글다).
  //  ⚠ 다각형으로 그리면 점을 아무리 늘려도 **각이 남는다**(16각형까지 해 봤다).
  //    조종점 9 개 + Catmull-Rom 이면 각이 아예 없다 — 유기적인 형태의 조건이다.
  function torso(g, cx, cy, r, T, tone, d) {
    var C = [
      { x: cx + d * r * 1.14, y: cy - r * 0.46 },
      { x: cx + d * r * 1.26, y: cy + r * 0.20 },
      { x: cx + d * r * 0.86, y: cy + r * 0.70 },
      { x: cx - d * r * 0.20, y: cy + r * 0.80 },
      { x: cx - d * r * 1.02, y: cy + r * 0.62 },
      { x: cx - d * r * 1.44, y: cy + r * 0.06 },
      { x: cx - d * r * 1.10, y: cy - r * 0.58 },
      { x: cx - d * r * 0.14, y: cy - r * 0.80 },
      { x: cx + d * r * 0.72, y: cy - r * 0.74 }
    ];
    blob(g, C, tone.dark, 1, 12);                                  // 윤곽
    blob(g, inset(C, 0.90, 0, r * 0.03), tone.scale, 1, 12);       // 옆면
    blob(g, inset(C, 0.62, -d * r * 0.10, -r * 0.26), tone.lit, 0.9, 12);  // 등광
    // 배 — 아래쪽만 밝게. 층을 겹치는 것으로 부피를 만든다(그라디언트는 다각형에서 깨진다).
    var B = [
      { x: cx + d * r * 0.96, y: cy + r * 0.22 },
      { x: cx + d * r * 0.72, y: cy + r * 0.70 },
      { x: cx - d * r * 0.20, y: cy + r * 0.80 },
      { x: cx - d * r * 0.92, y: cy + r * 0.60 },
      { x: cx - d * r * 0.60, y: cy + r * 0.34 },
      { x: cx + d * r * 0.40, y: cy + r * 0.32 }
    ];
    blob(g, B, tone.belly, 0.92, 12);
    // 배 판 — 가로줄. 곡선 덩어리 위에서만 '비늘판'으로 읽힌다.
    g.lineStyle(Math.max(1, r * 0.055), tone.dark, 0.28);
    for (var i = -2; i <= 2; i++)
      g.lineBetween(cx + d * r * (0.12 + i * 0.30) - r * 0.10, cy + r * 0.34,
                    cx + d * r * (0.12 + i * 0.30) - r * 0.02, cy + r * 0.74);
    scalePatch(g, cx - d * r * 0.05, cy - r * 0.16, r * 1.06, r * 0.44, r * 0.115, tone.dark, 0.13, 0);
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
    wing(g, sx - r * 0.74, sy - r * 0.10, r * 1.06, tone, 0.94, -flap, true, d);
    leg(g, cx - r * 0.84, cy + r * 0.32, cx - r * 1.08, cy + r * 0.94 * T,
           cx - r * 0.70, cy + r * 1.34 * T, r * 0.27, tone, d, r * 0.92, true);
    leg(g, cx + r * 0.64, cy + r * 0.38, cx + r * 0.84, cy + r * 0.96 * T,
           cx + r * 1.06, cy + r * 1.32 * T, r * 0.22, tone, d, r * 0.80, true);
    torso(g, cx, cy, r, T, tone, d);
    leg(g, cx - r * 0.56, cy + r * 0.36, cx - r * 0.88, cy + r * 1.02 * T,
           cx - r * 0.26, cy + r * 1.48 * T, r * 0.31, tone, d, r, false);
    leg(g, cx + r * 0.88, cy + r * 0.40, cx + r * 1.10, cy + r * 1.04 * T,
           cx + r * 1.36, cy + r * 1.46 * T, r * 0.24, tone, d, r * 0.86, false);
    //  ⚠ 목을 곧추세웠더니 **브론토사우루스**로 보였다(실측). 레퍼런스 넉 장은
    //    전부 머리를 낮추고 앞으로 내밀고 있다 — 그게 '덤빈다'는 자세다.
    //    S 자의 윗마디를 앞으로 눕히고 머리를 한 뼘 내린다.
    var neck = bez(sx - r * 0.12, sy + r * 0.12, sx + r * 0.86, sy - r * 0.50,
                   sx + r * 0.72, sy - r * 1.28, 8)
      .concat(bez(sx + r * 0.72, sy - r * 1.28, sx + r * 0.86, sy - r * 1.92,
                  sx + r * 1.70, sy - r * 1.82, 8).slice(1));
    ribbon(g, neck, r * 0.90, r * 0.40, tone.dark);
    ribbon(g, neck, r * 0.62, r * 0.26, tone.scale);
    ribbon(g, neck, r * 0.24, r * 0.10, tone.lit, 0.75);       // 목 윗면의 빛
    ridge(g, neck, 0.08, 0.98, r * 0.15, tone.dark, -1);
    // 목주름 — 굵기가 변하는 띠 위에 가로선을 얹으면 '마디'가 생긴다
    g.lineStyle(Math.max(1, r * 0.045), tone.dark, 0.30);
    for (var ni = 2; ni < neck.length - 1; ni += 2) {
      var np = neck[ni - 1], nq = neck[ni + 1];
      var ndx = nq.x - np.x, ndy = nq.y - np.y;
      var nL = Math.sqrt(ndx * ndx + ndy * ndy) || 1;
      var nw = r * (0.44 - 0.24 * (ni / neck.length));
      g.lineBetween(neck[ni].x + ndy / nL * nw, neck[ni].y - ndx / nL * nw,
                    neck[ni].x - ndy / nL * nw, neck[ni].y + ndx / nL * nw);
    }
    head(g, sx + r * 2.10, sy - r * 1.78, r * 0.84, tone, 0.38 + 0.30 * Math.sin(t / 300), d, t);
    wing(g, sx - r * 0.52, sy - r * 0.24, r * 1.22, tone, 0.98, flap, false, d);
    //  ⚠ 가슴에 빛 덩어리를 놓았더니 실제 크기에서 **옆구리의 얼룩**으로 보였다(실측).
    //    이 그림에서 불은 이미 목구멍에 있다(head 의 아가리) — 그 하나로 충분하고,
    //    두 군데면 어디가 위험한지가 흐려진다. 대신 목 아래에 아주 옅게만 남긴다.
    var gl = 0.30 + 0.22 * Math.abs(br);
    //  ⚠ 처음엔 중심에서 방사로 그었더니 **폭죽**이 됐다(실측). 균열은 중심이
    //    없다 — 짧은 선분들이 서로 어긋나 있어야 갈라진 것으로 읽힌다.
    //  ⚠ 균열을 선으로 그었더니 실제 게임 크기에서는 **낙서**로 보였다(실측).
    //    이 아트가 화면에서 차지하는 폭은 200px 남짓이다 — 그 안에서 읽히는
    //    빛은 '번지는 덩어리'지 '가는 선'이 아니다.
    g.fillStyle(tone.glow, gl * 0.16);
    g.fillEllipse(sx + r * 0.62, sy - r * 0.22, r * 0.34, r * 0.46, 10);
  }

  // ══ 용의 부위 — 50층마다 하나씩 (2026-08-02 사용자 지시) ══════════════════
  //  "50 · 100 · 150 · 200 · 250 에서 각각 용의 발, 손, 날개, 반쪽 얼굴 등으로
  //   보여주다가 결국 300에서 실제 용과."
  //
  //  넷을 관통하는 규칙 — **틀 밖으로 이어져 있어야 한다.** 부위가 화면 안에서
  //  깔끔하게 끝나면 그건 작은 괴물이지 큰 것의 일부가 아니다. 그래서 전부
  //  위쪽(또는 땅)으로 잘려 나가고, 잘린 자리에 파헤쳐진 땅을 깐다.
  //  본체와 **같은 helper**(head/wing/leg/ribbon)를 쓴다 — 같은 손이 그린 것이어야
  //  300층에서 "저게 다 한 마리였다"가 성립한다.

  //  갈라진 땅 — 부위가 뚫고 나온 자리. 넷이 공유한다.
  function crater(g, cx, gy, r, T, wide) {
    var k, a;
    g.fillStyle(0x241d16, 0.92); g.fillEllipse(cx, gy, r * wide, r * 0.86 * T, 18);
    g.fillStyle(0x3a3024, 0.92); g.fillEllipse(cx, gy - r * 0.08, r * wide * 0.78, r * 0.60 * T, 16);
    for (k = 0; k < 6; k++) {
      a = -0.3 + k * 0.78;
      tri(g, cx + Math.cos(a) * r * wide * 0.46, gy + Math.sin(a) * r * 0.40 * T,
             cx + Math.cos(a) * r * wide * 0.66, gy + Math.sin(a) * r * 0.50 * T,
             cx + Math.cos(a) * r * wide * 0.55, gy - r * 0.52, 0x4a3d2c, 0.95);
    }
  }

  //  50층 · 용의 발 — 위에서 내려온 뒷발.
  //  ⚠ 두 번 실패했다. ① 굵기가 안 변하는 띠 → **나무 기둥**. ② 다리를 발보다
  //    굵게 만들고 발가락을 발등 안에 두었더니 → **쐐기에 얹힌 혹**(실측 렌더).
  //    발로 읽히려면 규칙은 하나다: **발이 다리보다 넓어야 한다.** 사람 발도,
  //    새 발도, 도마뱀 발도 전부 그렇다. 발가락은 그 넓이를 만드는 물건이지
  //    발등에 붙은 장식이 아니다.
  function foot(g, cx, cy, r, T, tone, t) {
    var sway = Math.sin(t / 820) * r * 0.03, i, bx, by, mx, my, ex, ey, dir;
    crater(g, cx, cy + r * 0.95 * T, r, T, 3.4);

    // 정강이 — 위(틀 밖)에서 내려오며 발목으로 갈수록 **가늘어진다**
    var shin = [{ x: cx + sway - r * 0.42, y: cy - r * 2.90 },
                { x: cx + sway - r * 0.16, y: cy - r * 1.40 },
                { x: cx + sway, y: cy - r * 0.34 }];
    ribbon(g, shin, r * 1.30, r * 0.66, tone.dark);
    ribbon(g, shin, r * 0.98, r * 0.46, tone.scale);
    ribbon(g, shin, r * 0.30, r * 0.14, tone.lit, 0.7);
    scalePatch(g, cx + sway - r * 0.16, cy - r * 1.40, r * 0.36, r * 1.05, r * 0.15,
               tone.dark, 0.16, 0);
    // 발목
    g.fillStyle(tone.dark, 1);  g.fillCircle(cx + sway, cy - r * 0.26, r * 0.48);
    g.fillStyle(tone.scale, 1); g.fillCircle(cx + sway, cy - r * 0.30, r * 0.35);

    // 발가락 넷 — **발등보다 먼저** 그려 뿌리가 발등 밑으로 들어가게 한다.
    //  가운데 둘은 앞으로 길게, 바깥 둘은 옆으로 벌린다. 이 벌어짐이 곧 '발'이다.
    var SPR = [-1.15, -0.42, 0.42, 1.18], LEN = [0.86, 1.20, 1.20, 0.84];
    for (i = 0; i < 4; i++) {
      dir = SPR[i] >= 0 ? 1 : -1;
      bx = cx + sway + SPR[i] * r * 0.30; by = cy + r * 0.06;
      mx = cx + sway + SPR[i] * r * 1.20; my = cy + r * (0.42 + LEN[i] * 0.42) * T;
      ex = cx + sway + SPR[i] * r * 1.80; ey = cy + r * (0.52 + LEN[i] * 0.58) * T;
      ribbon(g, [{ x: bx, y: by }, { x: mx, y: my }], r * 0.66, r * 0.48, tone.dark);
      ribbon(g, [{ x: bx, y: by }, { x: mx, y: my }], r * 0.44, r * 0.31, tone.scale);
      ribbon(g, [{ x: mx, y: my }, { x: ex, y: ey }], r * 0.46, r * 0.32, tone.dark);
      ribbon(g, [{ x: mx, y: my }, { x: ex, y: ey }], r * 0.30, r * 0.20, tone.scale);
      g.fillStyle(tone.lit, 0.6); g.fillCircle(mx, my - r * 0.06, r * 0.18);
      // 발톱 — 앞아래로 파고든다
      tri(g, ex - r * 0.17, ey - r * 0.16, ex + r * 0.17, ey - r * 0.08,
             ex + dir * r * 0.34 + r * 0.10, ey + r * 0.54, tone.horn, 1);
    }

    // 발등 — 발가락 뿌리를 덮는다(발가락보다 좁아야 발가락이 살아난다)
    g.fillStyle(tone.dark, 1);  g.fillEllipse(cx + sway, cy + r * 0.06, r * 1.42, r * 0.86, 14);
    g.fillStyle(tone.scale, 1); g.fillEllipse(cx + sway, cy - r * 0.02, r * 1.18, r * 0.68, 14);
    g.fillStyle(tone.lit, 0.7);  g.fillEllipse(cx + sway - r * 0.06, cy - r * 0.18, r * 0.84, r * 0.26, 12);
    // 뒤쪽 며느리발톱 — '뒷발'이라는 것을 알려 주는 물건
    tri(g, cx + sway - r * 0.86, cy - r * 0.06, cx + sway - r * 0.74, cy + r * 0.26,
           cx + sway - r * 1.86, cy - r * 0.34, tone.horn, 1);
  }

  //  150층 · 용의 날개 — 손목을 땅에 박은 한쪽 날개. 팔은 틀 위로 나간다.
  function wingpart(g, cx, cy, r, T, tone, t) {
    var flap = Math.sin(t / 900) * 0.10;
    crater(g, cx + r * 0.20, cy + r * 1.30 * T, r, T, 2.2);
    //  ⚠ 몸으로 이어지는 팔을 **수직 막대**로 세웠더니 날개 옆에 기둥이 하나 서
    //    있는 그림이 됐다(실측). 팔은 날개의 앞가장자리가 **그대로 이어진 것**이라
    //    같은 방향(위-뒤)으로 나가야 하고, 날개보다 **먼저** 그려 뒤로 가야 한다.
    ribbon(g, [{ x: cx + r * 0.34, y: cy + r * 0.95 },
               { x: cx - r * 0.55, y: cy - r * 1.30 },
               { x: cx - r * 1.05, y: cy - r * 3.00 }], r * 0.98, r * 0.58, tone.dark);
    ribbon(g, [{ x: cx + r * 0.34, y: cy + r * 0.92 },
               { x: cx - r * 0.52, y: cy - r * 1.30 },
               { x: cx - r * 1.02, y: cy - r * 3.00 }], r * 0.66, r * 0.38, tone.scale);
    // 본체와 **같은 함수**로 그린다 — 같은 한 마리라는 것이 형태로 전달돼야 한다.
    wing(g, cx + r * 0.30, cy + r * 1.05, r * 1.42, tone, 1.00 + flap, flap, false, 1);
    tri(g, cx + r * 0.02, cy + r * 0.86, cx + r * 0.56, cy + r * 0.96,
           cx + r * 0.32, cy + r * 1.66 * T, tone.horn, 1);
  }

  //  200층 · 용의 반쪽 얼굴 — 무너진 자리에서 얼굴 절반만 나와 있다.
  //  ⚠ '반쪽'은 **잘라서** 만든다. 머리를 통째로 그리고 지면 판으로 아래 절반을
  //    덮으면, 나머지가 아직 안에 있다는 것이 그림 자체로 전달된다.
  function halfface(g, cx, cy, r, T, tone, t) {
    var breathe = Math.sin(t / 1300) * r * 0.05, k, bw, ph, gy;
    head(g, cx - r * 0.30, cy - r * 0.20 + breathe, r * 2.05, tone,
         0.30 + 0.22 * Math.sin(t / 520), 1, t);
    //  ⚠ 덮개를 크게 잡았더니 **타일을 통째로 덮는 검은 판**이 됐다(실측).
    //    가려야 하는 것은 얼굴의 아래 절반뿐이다 — 딱 그만큼만 덮는다.
    gy = cy + r * 0.85;
    g.fillStyle(0x241d16, 1);
    g.fillRect(cx - r * 2.6, gy, r * 5.2, r * 1.15);
    g.fillStyle(0x3a3024, 1);
    g.fillEllipse(cx, gy + r * 0.10, r * 5.0, r * 0.70 * T, 18);
    for (k = 0; k < 7; k++) {
      bw = r * (0.34 + (k % 3) * 0.16);
      tri(g, cx - r * 2.3 + k * r * 0.68, gy, cx - r * 2.3 + k * r * 0.68 + bw, gy,
             cx - r * 2.3 + k * r * 0.68 + bw * 0.5, gy - r * (0.24 + (k % 4) * 0.18),
             0x3a3024, 1);
    }
    g.fillStyle(0x6b5b45, 0.35);
    for (k = 0; k < 5; k++) {
      ph = ((t / 1500) + k * 0.2) % 1;
      g.fillCircle(cx - r * 2.2 + k * r * 1.1 + Math.sin(t / 700 + k) * r * 0.3,
                   gy - ph * r * 1.4, r * 0.30 * (1 - ph));
    }
  }

  //  250층 · 깨어나는 용 — 목·가슴·앞다리 하나가 산을 밀어내고 나왔다.
  function waking(g, cx, cy, r, T, tone, t) {
    var flap = Math.sin(t / 760), i, ph;
    crater(g, cx - r * 0.20, cy + r * 1.35 * T, r, T, 3.2);
    wing(g, cx - r * 1.05, cy - r * 0.30, r * 1.05, tone, 0.62, flap, true, 1);
    g.fillStyle(tone.dark, 1);  g.fillEllipse(cx, cy + r * 0.34, r * 2.45, r * 1.52, 18);
    g.fillStyle(tone.scale, 1); g.fillEllipse(cx, cy + r * 0.24, r * 2.16, r * 1.30, 18);
    g.fillStyle(tone.lit, 0.75); g.fillEllipse(cx - r * 0.24, cy - r * 0.24, r * 1.62, r * 0.50, 14);
    scalePatch(g, cx, cy + r * 0.28, r * 1.80, r * 1.00, r * 0.16, tone.dark, 0.14, 0);
    leg(g, cx + r * 1.30, cy + r * 0.40, cx + r * 1.75, cy + r * 1.05 * T,
           cx + r * 2.10, cy + r * 1.50 * T, r * 0.36, tone, 1, r, false);
    var neck = bez(cx + r * 0.20, cy - r * 0.10, cx + r * 1.05, cy - r * 1.05,
                   cx + r * 1.95, cy - r * 1.55, 10);
    ribbon(g, neck, r * 1.10, r * 0.52, tone.dark);
    ribbon(g, neck, r * 0.78, r * 0.34, tone.scale);
    ribbon(g, neck, r * 0.30, r * 0.13, tone.lit, 0.7);
    ridge(g, neck, 0.08, 0.96, r * 0.19, tone.dark, -1);
    head(g, cx + r * 2.55, cy - r * 1.62, r * 1.02, tone, 0.42 + 0.30 * Math.sin(t / 330), 1, t);
    g.fillStyle(0x6b5b45, 0.32);
    for (i = 0; i < 6; i++) {
      ph = ((t / 1200) + i * 0.17) % 1;
      g.fillCircle(cx - r * 1.4 + i * r * 0.6, cy + r * (0.4 + ph * 1.2) * T, r * 0.18 * (1 - ph));
    }
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
    else if (info.kind === 'foot') foot(g, sx, sy - r * 0.45, r, T, info.tone, tt);
    else if (info.kind === 'wingpart') wingpart(g, sx, sy - r * 0.70, r, T, info.tone, tt);
    else if (info.kind === 'halfface') halfface(g, sx, sy - r * 0.30, r, T, info.tone, tt);
    else if (info.kind === 'waking') waking(g, sx, sy - r * 0.60, r, T, info.tone, tt);
    else if (info.kind === 'dragon') dragon(g, sx, sy - r * 0.70, r, T, info.tone, tt);
    else drake(g, sx, sy - r * 0.55, r, T, info.tone, tt, Math.sin(tt / 520));
    if (flip) g.restore();
    return true;
  };
})();
