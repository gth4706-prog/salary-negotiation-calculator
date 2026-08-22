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
//    1~30층   계란 부족의 강자   (기존 셋 — 족장·골렘·둥지)
//    40층     재를 뒤집어쓴 파수병 — 계란 부족의 마지막. 처음으로 '용의 재'가 나온다
//    60~90층  권속들 — 서리·폭풍으로 결이 갈린다(계속 벡터로 그린다, 아래 참조)
//    50/100/150/200/250층  용의 부위(발·손·날개·반쪽 얼굴·상반신) — **몸의 일부**
//    300층~   태초의 용 본체(50층 주기로 다시 나온다)
//  50~250 층의 목적은 이기는 것이 아니라 **크기를 먼저 보여주는 것**이다.
//  자세한 층 배정은 `js/tower.js` 의 `BOSS_SCHEDULE`.
//
//  ## 그리기 규율 — **두 갈래로 갈린다** (2026-08-02 3차)
//  재 파수병·잿날개 등(ash/frost/storm 결)은 이 파일에서 계속 **벡터**로 그린다
//  (Phaser Graphics, 자산 0KB 원칙). 색이 아니라 물건이 실루엣을 만든다 — 뿔·비늘·
//  발톱·뼈. 판을 겹쳐 두께를 만든다(그라디언트는 못 쓴다).
//
//  반면 **용의 몸(발·손·날개·반쪽 얼굴·상반신·본체) 여섯 종류는 래스터다**
//  (`js/dragonasset.js`). 사용자 판정: "벡터를 떠나서 너무 구리다 — 좌표를 아무리
//  옮겨도 삽화 실력 자체는 안 생긴다." 실제로 그려진 CC0 픽셀아트(OpenGameArt
//  "Pixel Bosses. Yes!")로 바꿨다. 이 파일 안의 `RASTER_KINDS` 표가 그 갈림길이다.
//
//  히트박스는 두 갈래 다 `def.radius` 그대로 두고 **그리는 크기만** 키운다.
//  ⚠ radius 를 키우면 사거리 판정이 바뀌어 밸런스가 조용히 움직인다
//    (CLAUDE.md 의 파수꾼 radius 18→24 실측이 그 증거다)
// ============================================================================
(function () {
  var BA = GAME.BossArt = {};

  // 종류별 **그리는 배율**. 히트박스와 무관하다 — 짐승은 크게 보여야 짐승이다.
  //  ⚠ 용 **본체**(dragon)만 래스터 경로
  //    (`GAME.DragonAsset`)로 옮겨서 여기 없다 — 그쪽은 배율을 자체 계산한다
  //    (`js/dragonasset.js` 의 `PARTS[kind].scale`). foot/claw 는 6차에서 다시
  //    벡터로 돌아왔다(작은 크롭이 배율을 키우면 픽셀이 깨져서 — 아래 `footPart`/
  //    `clawPart` 주석 참조) — 그래서 여기 배율표에 다시 있다.
  //  ⚠ 부위는 "크기가 곧 정체"라 일반 짐승보다 훨씬 크게 잡는다(50~250층은 이기는
  //    게 아니라 크기를 먼저 보여주는 층이다 — 이 파일 헤더 참조). 다만 아레나
  //    밖으로 넘치면 안 되므로 전부 `tools/boss-shot.js` 로 찍어 보고 정했다.
  //  알은 부화가 진행될수록 조금씩 커진다(껍질이 벌어지니 실루엣도 커진다).
  BA.SCALE = { sentry: 1.50, drake: 1.60, foot: 2.35, claw: 2.15,
               wingpart: 1.85, egg: 1.26, eggcrack: 1.32, eggeye: 1.38 };

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


  //  용의 발/손 — **크롭이 아니라 이 파일의 나머지 짐승과 같은 재료로 그린 부위
  //  단독 렌더** (2026-08-02 6차, 사용자 재지시: "너가봤을때도 괜찮은지 보고 게임과
  //  어울리게해줘"). 래스터 크롭(5차)을 실제로 띄워 보니 작은 부위일수록 배율을
  //  키우다 픽셀이 굵어져 "잘 그린 부위"가 아니라 "깨진 텍스처"로 보였다(직접
  //  스크린샷으로 확인) — 반면 이 파일의 벡터 짐승(재 파수병·잿날개 등)은 같은
  //  화면에서 멀쩡했다. 그래서 **작은 부위 둘만** 벡터로 되돌린다. 300층 본체와
  //  150/200/250층(날개/얼굴/상반신)은 크롭이 커서 배율이 작아도 되므로 래스터로
  //  그대로 둔다(300층은 사용자가 "변함없이 진행"이라고 명시했다).
  //  `leg()` 하나로 몸 전체를 표현한다 — 넓적다리·정강이·발톱 세 마디가 이미 있어
  //  "짐승의 팔다리"로 충분히 읽힌다(이 파일 `leg()` 주석 참조).

  //  발(50층) — 하늘에서 짓밟듯 내려온다. 갈래 발톱 3개, 정강이에 불(ember) 균열.
  function footPart(g, cx, cy, r, T, tone, t) {
    var sway = Math.sin(t / 900) * r * 0.05;
    var hip = { x: cx + sway * 0.4, y: cy - r * 2.7 };
    var knee = { x: cx + r * 0.30 + sway, y: cy - r * 1.30 };
    var foot = { x: cx, y: cy };
    // 정강이 위쪽을 옅게 지워 "위가 안 보인다"(화면 밖에서 내려온다)를 만든다 —
    // 완전히 지우면 다리가 끊겨 보이므로 알파만 낮춘다.
    ribbon(g, [hip, knee], r * 1.55, r * 1.05, mix(tone.dark, 0x000000, 0.25), 0.55);
    leg(g, hip.x, hip.y, knee.x, knee.y, foot.x, foot.y, r * 1.02, tone, 1, r * 1.15, false);
    // 정강이의 불 균열 — 재 계열 보스들과 같은 신호(사용자 세계관: '용의 재').
    g.fillStyle(tone.glow, 0.5 + 0.3 * Math.sin(t / 260));
    g.fillTriangle(knee.x - r * 0.10, knee.y + r * 0.05,
                   knee.x + r * 0.06, knee.y + r * 0.15,
                   foot.x - r * 0.04, foot.y - r * 0.30);
  }

  //  손(100층) — 옆에서 뻗어와 움켜쥔다. 갈래 발톱 5개(손가락), 갈고리 큼직하게.
  function clawPart(g, cx, cy, r, T, tone, t) {
    var reach = 0.92 + 0.06 * Math.sin(t / 700);   // 아주 느리게 쥐었다 폈다
    var shoulder = { x: cx - r * 1.86, y: cy - r * 2.35 };
    var elbow = { x: cx - r * 0.62 * reach, y: cy - r * 1.10 };
    var hand = { x: cx, y: cy };
    ribbon(g, [shoulder, elbow], r * 1.30, r * 1.02, mix(tone.dark, 0x000000, 0.30), 0.5);
    ribbon(g, [shoulder, elbow], r * 0.98, r * 0.74, tone.dark, 1);
    ribbon(g, [elbow, hand], r * 0.74, r * 0.50, tone.dark, 1);
    g.fillStyle(tone.scale, 1); g.fillCircle(elbow.x, elbow.y, r * 0.34);
    g.fillStyle(tone.dark, 1);
    g.fillEllipse(hand.x + r * 0.10, hand.y, r * 0.62, r * 0.30, 10);
    // 손가락 다섯 — "다섯 손가락이 전장을 통째로 움켜쥔다"(units.js desc)를 그대로 그린다.
    talons(g, hand.x, hand.y, r * 0.98 * reach, 1, tone, 5, 0.46);
  }

  //  잔해 — 부위가 **어디를 뚫고 나왔는지**를 만드는 공통 재료(2026-08-02 7차).
  //  발/손의 `groundFrame` 과 같은 목적이지만, 얼굴·상반신처럼 큰 부위는 덩어리진
  //  바위가 있어야 규모가 산다(작은 자갈만 깔면 오히려 부위가 떠 보인다).
  function rubble(g, cx, cy, w, h, seed, tone) {
    var i, f, rx, ry, rw;
    // 뒤쪽(어두운) 층 — 부위 뒤로 물러나 깊이를 만든다
    for (i = 0; i < 7; i++) {
      f = frameSeed('rub' + seed, i);
      rx = cx + (f - 0.5) * w * 1.5;
      ry = cy - h * 0.02 - f * h * 0.06;
      rw = w * (0.10 + f * 0.14);
      g.fillStyle(0x1d1409, 0.9);
      g.fillEllipse(rx, ry, rw, rw * 0.52, 8);
    }
    // 앞쪽(밝은) 층 — 부위의 아랫변을 실제로 덮어 경계선을 지운다
    for (i = 0; i < 9; i++) {
      f = frameSeed('rub2' + seed, i);
      rx = cx + (f - 0.5) * w * 1.7;
      ry = cy + h * 0.012 + f * h * 0.04;
      rw = w * (0.09 + f * 0.16);
      g.fillStyle(i % 3 ? 0x584028 : 0x33240f, 1);
      g.fillEllipse(rx, ry, rw, rw * 0.46, 8);
      g.fillStyle(0x6d5133, 0.55);
      g.fillEllipse(rx - rw * 0.12, ry - rw * 0.10, rw * 0.55, rw * 0.20, 8);
    }
    // 잉걸불 — 방금 뚫고 나왔다는 신호. 용 계열 공통(tone.glow).
    for (i = 0; i < 5; i++) {
      f = frameSeed('emb' + seed, i);
      g.fillStyle(tone.glow, 0.30 + f * 0.35);
      g.fillCircle(cx + (f - 0.5) * w * 1.3, cy - f * h * 0.05, w * (0.008 + f * 0.014));
    }
  }

  //  날개(150층) — **한 짝만** 화면을 가로지른다. 어깨는 화면 밖(왼쪽)에 있고
  //  막이 오른쪽 위로 크게 펼쳐진다. 기존 `wing()` 을 그대로 쓰되 배율을 크게
  //  잡고, 어깨 쪽에 근육 덩어리를 붙여 "몸에서 뻗어 나온 것"으로 읽히게 한다.
  //  ⚠ 5차 래스터판은 원본에서 날개 사각형을 그대로 오려 붙여서 **잘린 사진**처럼
  //    보였다(사용자 지적). 벡터로 그리면 실루엣이 화면 밖으로 자연스럽게 이어진다.
  //  ⚠ 첫 판은 `wing()` 만 크게 그렸다가 **갈색 부채**처럼 보였다(실측). 원래
  //    `wing()` 은 드레이크 몸에 붙어 있을 때를 전제로 만든 부품이라, 혼자 크게
  //    띄우면 붙어 있을 몸이 없어 막만 남는다. 그래서 **등·어깨를 먼저 그리고
  //    그 위에 날개를 얹는다** — 등줄기 가시(ridge)가 "화면 밖으로 이어지는 거대한
  //    몸"을 만들어 주는 것이 이 부위의 핵심이다.
  function wingPart(g, cx, cy, r, T, tone, t) {
    var flap = Math.sin(t / 900);
    var sx0 = cx - r * 0.55, sy0 = cy - r * 0.35;
    // ① 등 — 화면 왼쪽 밖에서 어깨까지 이어지는 굵은 띠. 이게 있어야 날개가
    //    "몸에서 자란 것"이 된다.
    var back = bez(sx0 - r * 3.4, cy + r * 0.75, sx0 - r * 1.5, cy + r * 0.10,
                   sx0 + r * 0.25, sy0 + r * 0.30, 12);
    ribbon(g, back, r * 1.85, r * 1.30, tone.dark, 1);
    ribbon(g, back, r * 1.30, r * 0.88, tone.scale, 1);
    scalePatch(g, sx0 - r * 1.1, cy + r * 0.30, r * 1.5, r * 0.52, r * 0.17, tone.dark, 0.15, -0.22);
    // ② 등줄기 가시 — 머리 쪽(화면 밖)으로 이어진다는 신호.
    ridge(g, back, 0.06, 0.96, r * 0.30, tone.dark, -1);
    // ③ 어깨 관절 — 날개가 박혀 있는 자리.
    g.fillStyle(tone.dark, 1); g.fillEllipse(sx0, sy0 + r * 0.10, r * 1.15, r * 0.95, 12);
    g.fillStyle(tone.scale, 1); g.fillEllipse(sx0, sy0 + r * 0.04, r * 0.86, r * 0.70, 12);
    g.fillStyle(tone.lit, 0.6); g.fillEllipse(sx0 - r * 0.16, sy0 - r * 0.18, r * 0.48, r * 0.32, 10);
    // ④ 날개 — `wing()` 의 막은 손목이 어깨보다 `lift`(= r*1.02*spread) 위로 올라가고
    //    손가락이 거기서 또 1.58r 뻗는다. spread 가 1.0 근처면 위로만 2.6r 을 먹어
    //    화면 밖으로 나간다(세로 예산 함정) — 0.78 로 묶었다.
    wing(g, sx0, sy0, r * 1.68, tone, 0.78 + 0.04 * flap, flap, false, 1);
  }

  // ── 용의 알 두 단계 (2026-08-02 8차, 사용자 지시) ────────────────────────────
  //  "에그워와 맞게 드래곤 알도 보스에 추가하고, 알이 깨어져서 깨어지는 알(균열
  //   안에서 반짝이는 눈만 보임)도 과정에 추가하는게 오히려 낫겠다 싶다."
  //  이 게임의 모든 유닛은 **아이보리 계란**이다(js/eggart.js). 용의 알은 그
  //  문법을 따르되 **정반대로** 칠한다 — 아이보리가 아니라 돌처럼 식은 검은
  //  껍질에 잉걸불 결이 흐른다. 나란히 놓으면 "같은 알인데 다른 층위"가 된다.

  //  알 껍질 — 두 단계가 공유하는 실루엣. 계란이므로 위가 좁고 아래가 넓다.
  //  `crack`(0~1)이 0이면 멀쩡한 알, 1이면 다 갈라진 알.
  //  ⚠ 첫 판은 조종점을 대충 잡았다가 **알이 아니라 항아리**로 보였다(실측 —
  //    위가 넓고 평평했다). 계란은 "가장 넓은 곳이 아래쪽 40% 지점, 위로 갈수록
  //    빠르게 좁아진다"가 전부다. 아래 좌표는 그 비례를 그대로 옮긴 것이다.
  //    `h` 는 **알 전체 높이**다(예전엔 반높이여서 세로가 두 배로 튀었다).
  function eggShell(g, cx, cy, r, tone, t, crack) {
    var pulse = 1 + Math.sin(t / (crack > 0 ? 380 : 900)) * (0.012 + crack * 0.02);
    var w = r * 1.02 * pulse, h = r * 2.30 * pulse;
    var i, f;
    // 바닥 그림자 — 알이 놓여 있다는 접지 신호.
    g.fillStyle(0x000000, 0.28);
    g.fillEllipse(cx, cy, w * 2.30, w * 0.60, 14);
    // 껍질 — 계란 실루엣. 위가 좁고 아래 40% 지점이 가장 넓다.
    var S = [
      { x: cx,             y: cy - h * 1.00 },   // 꼭대기(뾰족한 쪽)
      { x: cx + w * 0.34,  y: cy - h * 0.90 },
      { x: cx + w * 0.72,  y: cy - h * 0.70 },
      { x: cx + w * 0.96,  y: cy - h * 0.42 },   // 가장 넓은 곳
      { x: cx + w * 0.90,  y: cy - h * 0.15 },
      { x: cx + w * 0.52,  y: cy - h * 0.01 },
      { x: cx,             y: cy + h * 0.02 },   // 바닥(둥근 쪽)
      { x: cx - w * 0.52,  y: cy - h * 0.01 },
      { x: cx - w * 0.90,  y: cy - h * 0.15 },
      { x: cx - w * 0.96,  y: cy - h * 0.42 },
      { x: cx - w * 0.72,  y: cy - h * 0.70 },
      { x: cx - w * 0.34,  y: cy - h * 0.90 }
    ];
    blob(g, S, tone.dark, 1, 14);
    blob(g, inset(S, 0.90, 0, -h * 0.01), mix(tone.scale, 0x000000, 0.30), 1, 14);
    // 위에서 받는 빛 — 이게 없으면 알이 납작한 원판으로 보인다.
    blob(g, inset(S, 0.54, -w * 0.20, -h * 0.10), mix(tone.lit, 0x000000, 0.30), 0.8, 14);
    // 껍질 결 — 계란 유닛의 '금'과 같은 문법이되 훨씬 굵고 오래돼 보이게.
    g.lineStyle(Math.max(1.2, r * 0.030), mix(tone.dark, 0x000000, 0.45), 0.5);
    for (i = 0; i < 5; i++) {
      f = frameSeed('shell', i);
      var yy = cy - h * (0.14 + f * 0.70);
      var ww = w * (0.42 + Math.sin(f * 3.1) * 0.28);
      g.lineBetween(cx - ww, yy, cx + ww, yy - h * 0.03);
    }
    scalePatch(g, cx, cy - h * 0.44, w * 0.82, h * 0.40, r * 0.13, tone.dark, 0.13, 0);
    return { w: w, h: h };
  }

  //  용의 알(200층) — **아직 안 깨졌다.** 안에서 두근거리는 것만 보인다.
  //  얼굴은 절대 안 보여준다(300층까지 아껴 둔다 — js/tower.js BOSS_SCHEDULE 주석).
  function eggPart(g, cx, cy, r, T, tone, t) {
    var sz = eggShell(g, cx, cy, r, tone, t, 0);
    // 안에서 새어 나오는 빛 — 껍질 **아래쪽 배**에서만 은은하게. 심장처럼 뛴다.
    var beat = 0.16 + 0.20 * Math.pow(Math.max(0, Math.sin(t / 900)), 3);
    g.fillStyle(tone.glow, beat);
    g.fillEllipse(cx, cy - sz.h * 0.34, sz.w * 0.90, sz.h * 0.34, 14);
    g.fillStyle(tone.glow, beat * 0.5);
    g.fillEllipse(cx, cy - sz.h * 0.34, sz.w * 1.35, sz.h * 0.52, 14);
    // 둥지 잔해 — 알이 놓인 자리.
    rubble(g, cx, cy, r * 3.0, r * 1.5, 'egg', tone);
  }

  //  금 간 알(100층) / 깨어지는 알(150층) — 같은 그림에 **눈만 켜고 끈다**.
  //  100층은 균열만 있고 안이 안 보이고(showEye=false), 150층에서 그 틈으로
  //  눈이 나타난다(사용자 지시 그대로: "균열 안에서 반짝이는 눈만 보임").
  //  한 함수로 둔 이유: 두 단계가 **같은 알**이어야 "같은 것이 계속 깨지고 있다"가
  //  된다. 그림을 따로 그리면 100층 알과 150층 알이 다른 알로 보인다.
  function crackEggPart(g, cx, cy, r, T, tone, t, showEye) {
    var sz = eggShell(g, cx, cy, r, tone, t, 1);
    var i, f;
    // ① 균열 — 알 배 부분에서 크게 갈라진다. 눈은 그 안쪽에 있다.
    var eyeX = cx + r * 0.04, eyeY = cy - sz.h * 0.50;
    // 갈라진 틈(어두운 안쪽) — 위아래로 벌어진 렌즈 모양. 톱니로 꺾어야 '깨졌다'가 된다.
    var C = [], seg = 10, halfW = sz.w * 0.86;
    for (i = 0; i <= seg; i++) {                       // 윗변
      f = frameSeed('crk', i);
      var u = i / seg;
      C.push({ x: eyeX - halfW + halfW * 2 * u + (f - 0.5) * sz.w * 0.10,
               y: eyeY - Math.sin(u * Math.PI) * sz.h * 0.17 + (f - 0.5) * sz.h * 0.03 });
    }
    for (i = seg; i >= 0; i--) {                       // 아랫변
      f = frameSeed('crk2', i);
      var v = i / seg;
      C.push({ x: eyeX - halfW + halfW * 2 * v + (f - 0.5) * sz.w * 0.10,
               y: eyeY + Math.sin(v * Math.PI) * sz.h * 0.16 + (f - 0.5) * sz.h * 0.03 });
    }
    g.fillStyle(0x0a0603, 1);
    g.fillPoints(C, true);
    // 균열에서 뻗어 나간 실금 — 틈에서 껍질 전체로 번진다.
    g.lineStyle(Math.max(1.4, r * 0.035), 0x0a0603, 0.85);
    for (i = 0; i < 6; i++) {
      f = frameSeed('crkline', i);
      var a0 = -Math.PI * 0.5 + (i - 2.5) * 0.42;
      var L = sz.h * (0.20 + f * 0.26) * (i % 2 ? -1 : 1);
      g.lineBetween(eyeX + (f - 0.5) * halfW * 1.4, eyeY,
                    eyeX + (f - 0.5) * halfW * 1.4 + Math.cos(a0) * sz.w * 0.30,
                    eyeY + Math.sin(a0) * L);
    }
    // ② 균열에서 새는 빛 — 틈 둘레로 번진다. 눈이 없는 단계(100층)는 훨씬 옅게:
    //    "아직 안은 안 보이지만 열기는 샌다"가 그 층의 전부다.
    var flare = 0.42 + 0.30 * Math.sin(t / 300);
    g.fillStyle(tone.glow, flare * (showEye ? 0.30 : 0.16));
    g.fillEllipse(eyeX, eyeY, sz.w * 1.70, sz.h * 0.36, 14);
    // ③ **눈** — 150층의 전부다. 세로 동공이 균열 안쪽에서 이쪽을 본다.
    //    100층은 여기를 통째로 건너뛴다(틈 안이 그냥 어둡다).
    if (showEye) {
      var blink = Math.sin(t / 2600);
      var eh = r * 0.30 * (blink > 0.93 ? 0.15 : 1);   // 아주 가끔 깜빡인다
      g.fillStyle(tone.glow, 1);
      g.fillEllipse(eyeX, eyeY, r * 0.62, eh, 14);
      g.fillStyle(0xfff3d0, 0.75);
      g.fillEllipse(eyeX - r * 0.06, eyeY - eh * 0.22, r * 0.30, eh * 0.42, 12);
      g.fillStyle(0x140a04, 1);
      g.fillEllipse(eyeX + r * 0.02, eyeY, r * 0.11, eh * 0.92, 12);
    }
    // ④ 떨어져 나온 껍질 조각 — 발밑에 흩어진다(눈이 보이는 단계가 더 많이 깨졌다).
    for (i = 0; i < (showEye ? 7 : 4); i++) {
      f = frameSeed('shard', i);
      var sxp = cx + (f - 0.5) * sz.w * 2.4;
      var syp = cy + f * r * 0.16;
      tri(g, sxp - r * 0.16, syp, sxp + r * 0.14, syp - r * 0.10,
             sxp + r * 0.04, syp + r * 0.12, mix(tone.dark, 0x000000, 0.2), 1);
    }
    rubble(g, cx, cy, r * 3.2, r * 1.6, 'crack', tone);
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
  //  ⚠ 2026-08-02 3차 — **용 몸(발·손·날개·반쪽 얼굴·깨어나는 용·본체) 여섯 종류는
  //    이제 벡터가 아니라 래스터**(`js/dragonasset.js`)로 그린다. "벡터를 떠나서
  //    너무 구리다"(사용자) — 좌표를 아무리 옮겨도 삽화 실력 자체는 안 생긴다는
  //    결론 끝에, 실제로 그려진 CC0 픽셀아트(OpenGameArt "Pixel Bosses. Yes!")로
  //    바꿨다. 아래 목록에 없는 sentry/drake(재 파수병·잿날개 등, ash/frost/storm
  //    결)는 계속 벡터로 그린다 — 그쪽은 이미 합격점을 받았다.
  // 2026-08-02 7차 — **부위는 전부 벡터로 돌아왔다.** 6차에서 foot/claw 를 옮겼고,
  // 7차에서 wingpart/halfface/waking 까지 옮겼다(사용자 지적: "그냥 짤라서 붙여넣은
  // 것 같다" — 맞는 말이었다. 원본 사각형을 그대로 오려 쓰니 어느 배율에서도
  // '잘린 사진'이었다). 래스터로 남는 것은 **300층 본체 하나뿐**이고, 그건 원본
  // 그림 전체를 통째로 쓰기 때문에 잘린 곳이 없어서 원래부터 멀쩡했다
  // (사용자 지시: "태초의 용 전체 모습은 변함없이 진행").
  var RASTER_KINDS = { dragon: 1 };

  // 문자열+색인을 결정적 0~1 값으로 접는다(Math.random 은 매 프레임 다시 굴러
  // 돌무더기가 깜빡인다 — 같은 부위는 항상 같은 자리에 돌이 있어야 한다).
  function frameSeed(kind, i) {
    var s = 0, str = kind + '#' + i;
    for (var k = 0; k < str.length; k++) s = (s * 31 + str.charCodeAt(k)) | 0;
    return ((s >>> 0) % 1000) / 1000;
  }

  // ── 경계 마감 — "잘린 크롭"이 아니라 "땅을 뚫고 나왔다"로 읽히게 ────────────
  //  2026-08-02 5차: `DA.PARTS` 의 `frame`/`edges` 는 4차부터 있었는데 이걸
  //  그리는 코드가 없었다(세계관 검토서 지적 — "데이터만 있고 그리는 코드가
  //  없다"). 여기서 배선한다. 원본 픽셀은 안 건드리고(3차례 벡터 리디자인
  //  실패 전례) **덧대는 흙더미만 벡터로** 그린다 — 이 파일의 다른 짐승들과
  //  같은 재료(fillEllipse/fillTriangle/lineBetween)라 화풍이 섞이지 않는다.
  //  히트박스(`def.radius`)는 안 건드린다 — 순수 렌더 장식이다.
  function groundFrame(g, kind, sx, sy, w, h, edges) {
    var i, f;
    g.fillStyle(0x241708, 0.55);
    g.fillEllipse(sx, sy + h * 0.02, w * 0.72, h * 0.16, 14);
    g.fillStyle(0x3a2a18, 0.65);
    g.fillEllipse(sx, sy - h * 0.01, w * 0.60, h * 0.12, 14);
    g.lineStyle(Math.max(1.5, w * 0.014), 0x160d06, 0.55);
    for (i = 0; i < 7; i++) {
      f = frameSeed(kind, i);
      var ang = -Math.PI * 0.5 + (f - 0.5) * Math.PI * 0.9;
      var len = w * (0.18 + f * 0.26);
      g.lineBetween(sx, sy, sx + Math.sin(ang) * len, sy + h * 0.06 - Math.cos(ang) * len * 0.30);
    }
    // 위쪽 절단면 옆으로 튀어나온 돌 — 완전히 못 가려도 "흙더미에서 자란다"는
    // 맥락을 준다(요청한 변에만 그린다).
    if (edges.indexOf('top') >= 0 || edges.indexOf('left') >= 0) {
      for (i = 0; i < 4; i++) {
        f = frameSeed(kind, 10 + i);
        var rx = sx - w * (0.28 + f * 0.20), ry = sy - h * (0.06 + f * 0.30);
        g.fillStyle(i % 2 ? 0x5c4128 : 0x2e2010, 0.8);
        g.fillEllipse(rx, ry, w * (0.09 + f * 0.07), h * (0.045 + f * 0.03), 8);
      }
    }
    if (edges.indexOf('top') >= 0 || edges.indexOf('right') >= 0) {
      for (i = 0; i < 4; i++) {
        f = frameSeed(kind, 20 + i);
        var rx2 = sx + w * (0.28 + f * 0.20), ry2 = sy - h * (0.06 + f * 0.30);
        g.fillStyle(i % 2 ? 0x5c4128 : 0x2e2010, 0.8);
        g.fillEllipse(rx2, ry2, w * (0.09 + f * 0.07), h * (0.045 + f * 0.03), 8);
      }
    }
  }

  BA.draw = function (g, def, sx, sy, r0, alpha, t, facing, unit) {
    var info = BA.parse(def.art);
    if (!info) return false;
    var T = (GAME.Iso && GAME.Iso.TILT) || 0.72;
    var a = alpha === undefined ? 1 : alpha;
    var tt = t || 0;

    //  ── 보스 시트 은행(태현님 생성 그림 — 유니티 검증 자산) 이 최우선이다 ──
    //  2026-08-19 아트 승급 1단계. 로드 전이면 아래 벡터/용 래스터가 폴백으로
    //  그린다(화면이 비지 않는 것이 우선 — ensure 가 비동기로 채운다).
    if (GAME.BossBank) {
      if (GAME.BossBank.ready(g.scene, def)) {
        var bbR = r0 * (BA.SCALE[info.kind] || 1.6);
        g.fillStyle(0x000000, 0.30 * a);
        g.fillEllipse(sx, sy, bbR * 1.6, bbR * 1.6 * T, 14);
        if (GAME.BossBank.draw(g.scene, def, sx, sy, r0, a, facing, g.depth, unit))
          return true;
      } else if (GAME.BossBank.metaOf(def)) {
        GAME.BossBank.ensure(g.scene, def);
      }
    }

    if (RASTER_KINDS[info.kind]) {
      // 래스터 경로 — 그림자만 Graphics 로 찍고, 몸은 GAME.DragonAsset 이
      // **영속 Phaser.Image**(매 프레임 새로 만들지 않는다)로 따로 그린다.
      // Graphics 는 벡터 전용이라 비트맵을 못 그리기 때문이다.
      var sr = r0 * 2.2;
      g.fillStyle(0x000000, 0.30 * a);
      g.fillEllipse(sx, sy, sr * 2.0, sr * 2.0 * T, 14);
      // 경계 마감 — 이미지보다 먼저(=아래) 그린다. Image 는 항상 `g.depth+0.5`
      // 라 그 위에 앉으므로, 여기 그리는 흙더미는 크롭 실루엣 **주위 여백**
      // (알파 투명 구간)에서만 보인다 — 그래도 "허공에 뜬 크롭"보다는
      // 훨씬 자연스럽다.
      var part = GAME.DragonAsset && GAME.DragonAsset.PARTS[info.kind];
      if (part && part.frame === 'ground') {
        var sz = GAME.DragonAsset.targetSize(info.kind, r0);
        if (sz) groundFrame(g, info.kind, sx, sy, sz.w, sz.h, part.edges || []);
      }
      if (GAME.DragonAsset) GAME.DragonAsset.draw(g.scene, info.kind, sx, sy, r0, a, facing, g.depth);
      return true;
    }

    var r = r0 * (BA.SCALE[info.kind] || 1.6);
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
    if (info.kind === 'foot') {
      // 접지점 그대로 쓴다(허리를 들어 올리는 sentry/drake 와 달리, 발 자체가
      // 발끝=접지점이라 들어 올리면 허공에 뜬다). 땅에서 솟은 맥락은 groundFrame
      // 그대로 재사용 — 크롭이 벡터로 바뀌었을 뿐 "잘린 경계를 흙으로 가린다"는
      // 목적은 같다.
      groundFrame(g, 'foot', sx, sy, r * 1.6, r * 2.2, ['top', 'left', 'right']);
      footPart(g, sx, sy, r, T, info.tone, tt);
    } else if (info.kind === 'claw') {
      clawPart(g, sx, sy, r, T, info.tone, tt);
    } else if (info.kind === 'wingpart') {
      wingPart(g, sx, sy, r, T, info.tone, tt);
    } else if (info.kind === 'egg') {
      eggPart(g, sx, sy, r, T, info.tone, tt);
    } else if (info.kind === 'eggcrack') {
      crackEggPart(g, sx, sy, r, T, info.tone, tt, false);   // 100층 — 눈 없음
    } else if (info.kind === 'eggeye') {
      crackEggPart(g, sx, sy, r, T, info.tone, tt, true);    // 150층 — 눈 보임
    } else if (info.kind === 'sentry') {
      sentry(g, sx, sy - r * 0.55, r, T, info.tone, tt);
    } else {
      drake(g, sx, sy - r * 0.55, r, T, info.tone, tt, Math.sin(tt / 520));
    }
    if (flip) g.restore();
    return true;
  };
})();


// ============================================================================
//  황금알 (2026-08-23 태현님 F안 채택) — 보너스 판 전용 벡터.
//  · 이중 후광 + 흰 반짝이(맥동: 작아졌다 커졌다) + 심장 박동 스쿼시
//  · 체력바 대신 **5단계 균열**(hp 비율 → 0~4단계, def.noHpBar 와 짝)
//  · 시트(bossGoldEgg.png) 리컬러는 폐기 — "디자인이 구려서 벡터로" 지시.
// ============================================================================
GAME.GoldEgg = (function () {
  'use strict';
  function eggPts(cx, cy, r, wMul) {
    var pts = [];
    for (var i = 0; i <= 40; i++) {
      var t = i / 40 * Math.PI * 2;
      var s2 = Math.sin(t), c2 = Math.cos(t);
      var w = r * (wMul || 1.0) * (1.02 - 0.14 * c2);
      var h = r * (1.14 + 0.30 * Math.max(0, c2));
      pts.push({ x: cx + s2 * w, y: cy - c2 * h });
    }
    return pts;
  }
  return {
    //  unit: 균열 단계(hp 비율)와 박동 위상에 쓴다. 없으면 멀쩡한 알.
    draw: function (g, sx, sy, r0, alpha, t, unit) {
      var a = alpha === undefined ? 1 : alpha;
      var R = r0 * 1.3;                       //  40% 축소 지시 반영(시트 172px → ~104px)
      var cy = sy - R * 1.14;                 //  바닥 접지(아랫점이 sy)
      var T = (GAME.Iso && GAME.Iso.TILT) || 0.72;
      //  심장 박동 — 뾰족한 두근 파형(sin^5), 부피 보존 역맥동.
      var raw = Math.sin(t * 3.1);
      var th = Math.max(0, raw); th = th * th * th * th * th;
      var ky = 1 + th * 0.05, kx = 1 - th * 0.026;
      //  접지 그림자
      g.fillStyle(0x000000, 0.25 * a);
      g.fillEllipse(sx, sy, R * 2.3 * kx, R * 0.62 * T);
      //  이중 후광 — 숨쉬듯 아주 천천히 부푼다.
      var halo = 1 + Math.sin(t * 1.4) * 0.03;
      for (var i = 5; i >= 1; i--) {
        g.fillStyle(i % 2 ? 0xffe27a : 0xfff6c9, 0.09 * a);
        g.fillPoints(eggPts(sx, cy, R * (1 + i * 0.12) * halo, 1.14 * kx), true);
      }
      //  몸통 3톤
      g.fillStyle(0xb17a20, a); g.fillPoints(eggPts(sx, cy, R * ky, kx), true);
      g.fillStyle(0xeab63f, a); g.fillPoints(eggPts(sx, cy - R * 0.06, R * 0.94 * ky, kx * 0.98), true);
      g.fillStyle(0xffe58c, a); g.fillPoints(eggPts(sx - R * 0.10, cy - R * 0.16, R * 0.74 * ky, kx), true);
      //  스페큘러(좌상단 광원)
      g.fillStyle(0xfff7d9, 0.9 * a);
      g.fillEllipse(sx - R * 0.38, cy - R * 0.62, R * 0.42, R * 0.66);
      g.fillStyle(0xffffff, 0.85 * a);
      g.fillEllipse(sx - R * 0.44, cy - R * 0.74, R * 0.18, R * 0.28);
      //  ── 균열 5단계 (0=멀쩡 … 4=만신창이) — 체력바를 대신한다 ────────────
      //  레퍼런스(태현님 제공: 실금이 가지 치며 껍질 전체로 번지는 사진)를 따른다.
      //  가는 검붉은 실금 + 반 픽셀 밝은 모서리(깊이감), 단계가 오를수록 새 계통이
      //  번지고 기존 금은 굵어진다. 좌표는 알 좌표계(x=±R, y=cy 기준 비율) 수작업.
      var stage = 0;
      if (unit && unit.maxHp) {
        stage = Math.min(4, Math.floor((1 - Math.max(0, unit.hp) / unit.maxHp) * 5));
      }
      if (stage >= 1) {
        //  균열 계통 — [단계, [x,y 비율 꺾은선]] . 가지들이 본줄기 중간에서 튄다.
        var CR = [
          [1, [[0.12, -1.32], [0.2, -1.05], [0.08, -0.82], [0.22, -0.55], [0.1, -0.3]]],
          [1, [[0.2, -1.05], [0.38, -0.9], [0.32, -0.7]]],
          [2, [[0.1, -0.3], [0.28, -0.1], [0.2, 0.18], [0.36, 0.44]]],
          [2, [[-0.5, -0.72], [-0.34, -0.5], [-0.44, -0.26], [-0.28, -0.04]]],
          [2, [[-0.34, -0.5], [-0.16, -0.42]]],
          [3, [[-0.28, -0.04], [-0.4, 0.26], [-0.26, 0.52], [-0.36, 0.78]]],
          [3, [[0.08, -0.82], [-0.08, -0.62], [0.02, -0.4], [-0.12, -0.16]]],
          [3, [[0.28, -0.1], [0.5, -0.02]]],
          [4, [[-0.12, -0.16], [-0.02, 0.12], [-0.14, 0.4], [-0.04, 0.68], [-0.16, 0.92]]],
          [4, [[0.2, 0.18], [0.04, 0.34]]],
          [4, [[-0.44, -0.26], [-0.62, -0.1]]],
          [4, [[0.36, 0.44], [0.5, 0.66], [0.42, 0.88]]]
        ];
        var lw = Math.max(1.5, R * (stage >= 4 ? 0.045 : 0.03));
        for (var ci = 0; ci < CR.length; ci++) {
          if (CR[ci][0] > stage) continue;
          var pl = CR[ci][1];
          //  밝은 모서리(우하단으로 반 획) 먼저 → 그 위에 검붉은 실금
          g.lineStyle(lw, 0xfff0b3, 0.5 * a);
          for (var pi = 0; pi < pl.length - 1; pi++) {
            g.lineBetween(sx + pl[pi][0] * R + lw * 0.8, cy + pl[pi][1] * R + lw * 0.8,
                          sx + pl[pi + 1][0] * R + lw * 0.8, cy + pl[pi + 1][1] * R + lw * 0.8);
          }
          g.lineStyle(lw, 0x5c3708, 0.88 * a);
          for (pi = 0; pi < pl.length - 1; pi++) {
            g.lineBetween(sx + pl[pi][0] * R, cy + pl[pi][1] * R,
                          sx + pl[pi + 1][0] * R, cy + pl[pi + 1][1] * R);
          }
        }
        if (stage >= 4) {
          //  껍질 조각 — 떨어져 나가기 직전의 삼각 파편 틈
          g.fillStyle(0x5c3708, 0.6 * a);
          g.fillTriangle(sx + 0.2 * R, cy - 0.56 * R, sx + 0.3 * R, cy - 0.48 * R,
                         sx + 0.16 * R, cy - 0.42 * R);
          g.fillTriangle(sx - 0.36 * R, cy + 0.3 * R, sx - 0.26 * R, cy + 0.42 * R,
                         sx - 0.42 * R, cy + 0.46 * R);
        }
      }
      //  ── 반짝이 3개 — **맥동**(작아졌다 커졌다, 위상 제각각) ───────────────
      var SP = [[0.52, -0.9, 0.16, 0], [-0.62, 0.1, 0.11, 2.1], [0.3, 0.62, 0.09, 4.2]];
      for (var si = 0; si < SP.length; si++) {
        var p2 = SP[si];
        var pulse = 0.55 + 0.5 * (0.5 + 0.5 * Math.sin(t * 3.0 + p2[3]));
        var sr = p2[2] * R * pulse;
        var sx2 = sx + p2[0] * R, sy2 = cy + p2[1] * R;
        g.fillStyle(0xffffff, (0.55 + 0.45 * pulse) * a);
        g.fillTriangle(sx2 - sr, sy2, sx2, sy2 - sr * 3, sx2 + sr, sy2);
        g.fillTriangle(sx2 - sr, sy2, sx2, sy2 + sr * 3, sx2 + sr, sy2);
        g.fillTriangle(sx2, sy2 - sr, sx2 - sr * 3, sy2, sx2, sy2 + sr);
        g.fillTriangle(sx2, sy2 - sr, sx2 + sr * 3, sy2, sx2, sy2 + sr);
      }
      return true;
    }
  };
})();
