window.GAME = window.GAME || {};

GAME.UI = {

  // ── 햅틱 (2026-08-03) ─────────────────────────────────────────────────────
  //  모바일 게임 UX 조사의 공통 결론: **입력에 즉각 반응이 없으면 사용자는 눌렸는지
  //  모른다.** 데스크톱은 hover 로 알지만 **터치에는 hover 가 없다** — 그래서
  //  이 게임은 폰에서 버튼을 눌러도 아무 신호가 없었다(시각·소리·진동 전부 0).
  //  진동은 그 셋 중 화면을 안 가리고 가장 확실한 신호다.
  //  ⚠ iOS 사파리는 `navigator.vibrate` 를 지원하지 않는다 — 없으면 조용히 넘어간다.
  //  ⚠ 값이 크면 '싸구려 진동'이 된다. 10ms 는 '톡' 하는 정도다.
  haptic: function (ms) {
    try {
      if (navigator && typeof navigator.vibrate === 'function') navigator.vibrate(ms || 10);
    } catch (e) { /* 지원 안 하면 그만이다 */ }
  },

  button: function (scene, x, y, w, h, label, onClick, opts) {
    opts = opts || {};
    var C = GAME.CONFIG.COLORS;
    var fill = opts.fill !== undefined ? opts.fill : 0x262637;
    var line = opts.line !== undefined ? opts.line : 0x4a4a68;
    var color = opts.color || C.text;

    var rect = scene.add.rectangle(x, y, w, h, fill).setStrokeStyle(1, line);
    var txt = scene.add.text(x, y, label, {
      fontFamily: GAME.CONFIG.FONT,
      fontSize: (opts.fontSize || 17) + 'px',
      color: color,
      align: 'center'
    }).setOrigin(0.5);

    rect.setInteractive({ useHandCursor: true });

    //  ── 누름 피드백 (2026-08-03) ────────────────────────────────────────────
    //  예전에는 `pointerdown` 에서 곧장 onClick 만 불렀다. hover 색 변화가 있었지만
    //  **터치에는 hover 가 없다** — 폰에서는 버튼을 눌러도 시각·소리·진동이 하나도
    //  없었다(모바일 게임 후기에서 가장 많이 나오는 불만이 정확히 이것이다:
    //  "눌렀는데 반응이 없어 두 번 누르게 된다").
    //  세 가지를 같이 준다 — 눈(살짝 눌림) · 귀(짧은 톡) · 손(10ms 진동).
    //  ⚠ 실행은 **여전히 pointerdown** 에서 한다. 게임 화면은 반응이 빨라야 하고,
    //    pointerup 으로 옮기면 기존 화면들의 동작 순서가 조용히 바뀐다.
    var pressT = null;
    function press(on) {
      if (!rect.scene) return;                       // 이미 파괴된 버튼
      rect.setFillStyle(on ? (opts.press !== undefined ? opts.press : line)
                           : fill);
      var k = on ? 0.96 : 1;
      rect.setScale(k); txt.setScale(k);
    }
    rect.on('pointerover', function () {
      rect.setFillStyle(opts.hover !== undefined ? opts.hover : 0x33334a);
    });
    rect.on('pointerout', function () { press(false); });
    rect.on('pointerup', function () { press(false); });
    rect.on('pointerdown', function () {
      press(true);
      if (GAME.Sound) GAME.Sound.play(opts.big ? 'tapBig' : 'tap');
      //  ⚠ **진동은 아무 버튼에서나 울리면 안 된다**(2026-08-03 사용자 지시:
      //    "진동은 너무 자주 일어나지 않게끔 중요할때만"). 메뉴를 오갈 때마다
      //    손이 울리면 신호가 아니라 소음이 된다 — 신호는 드물어야 신호다.
      //    그래서 **큰 버튼(opts.big)에만** 준다: 도전 시작·구매 확정 같은 것.
      if (opts.big) GAME.UI.haptic(14);
      //  눌린 모양을 **눈에 보이게** 잠깐 유지한다. 씬이 바로 바뀌는 버튼이 많아
      //  pointerup 을 못 받는 경우가 흔하기 때문이다.
      if (pressT) clearTimeout(pressT);
      pressT = setTimeout(function () { press(false); }, 110);
      onClick();
    });

    // 겹침 감사용 표시 — 버튼과 그 버튼의 라벨은 겹쳐도 정상이다.
    // 이 표시가 없으면 감사에서 버튼-라벨 쌍을 손으로 걸러내다 진짜 겹침을 놓친다(실제로 겪음).
    rect.__uiBtn = true;
    txt.__btnLabel = rect;

    return { rect: rect, text: txt };
  },

  label: function (scene, x, y, text, size, color, origin) {
    return scene.add.text(x, y, text, {
      fontFamily: GAME.CONFIG.FONT,
      fontSize: (size || 16) + 'px',
      color: color || GAME.CONFIG.COLORS.text
    }).setOrigin(origin === undefined ? 0 : origin);
  },

  // ── 아레나 (기울어진 지면) ──────────────────────────────────
  //  opts
  //    zones  배치 구역을 칠한다(배치 화면)
  //    floor  탑 층수 — 통곡의 탑·수성의 탑 공통. 0/미지정이면 탑이 아니다.
  //    tier   층이 없는 모드에서 쓸 등급 인덱스 0..5 (일반 대전은 escalation 등급)
  //    boss   보스 층 여부. 안 주면 floor 와 Tower.BOSS_EVERY 로 유도한다.
  //  floor/tier 를 아무것도 안 주면 **예전과 픽셀 단위로 동일하게** 그린다.
  drawArena: function (g, opts) {
    opts = opts || {};
    var UI = GAME.UI;
    var C = GAME.CONFIG.COLORS;
    var A = GAME.CONFIG.ARENA;
    var Iso = GAME.Iso;
    var R = Iso.screenRect();
    var B = UI.biomeFor(opts, R);          // null 이면 분위기 없음

    g.fillStyle(B ? B.fill : C.arenaFill, 1);
    g.fillRect(R.x, R.y, R.w, R.h);

    if (opts.zones) {
      var zs = GAME.CONFIG.ZONE_STRATEGIST;
      var zc = GAME.CONFIG.ZONE_CONTROLLER;
      g.fillStyle(C.zoneStrategist, 0.55);
      g.fillRect(zs.x, Iso.toScreenY(zs.y), zs.w, zs.h * Iso.TILT);
      g.fillStyle(C.zoneController, 0.55);
      g.fillRect(zc.x, Iso.toScreenY(zc.y), zc.w, zc.h * Iso.TILT);
    }

    // ── 원경 (2026-08-04 아트 개편) ────────────────────────────────────────
    //  배경이 사실상 **1층**이었다: 단색 하나 + 검정 6밴드 + 격자. 레퍼런스의
    //  "겹겹이 쌓인 깊이"가 구조적으로 나올 수 없었다. 원경/중경/근경 3층으로 나눈다.
    //
    //  ⚠ 색은 **전부 `fill` 에서 유도한다.** 하드코딩이 하나라도 있으면 테마 4종 ×
    //    바이옴 6밴드가 거기서 깨진다(이 파일의 기존 규율).
    //  ⚠ 원경 띠는 전장 **상단 14%** 에만 둔다. 유닛이 서는 구간에 들어가면 바닥이
    //    시끄러워져 예고 원과 투사체가 안 보인다 — 이 게임의 제1규율이다.
    //  ⚠⚠ **유닛이 이 띠 안에 선다** (2026-08-04 사용자 신고: "전장배경이 들어가면
    //    잘 안보이는거같아"). 실측: 전략가 배치 구역이 아레나 y=20 = **맨 위 0%** 에서
    //    시작해 아레나 높이의 30% 를 차지한다. 즉 상단 14% 는 통째로 유닛 자리다.
    //    아트 디렉션 문서는 "원경 띠는 유닛이 서는 구간에 안 들어간다"를 전제했는데
    //    이 게임에서는 그 전제가 틀렸다 — 검증 없이 구현한 것이 원인이다.
    //
    //  고침: **어둡게 까는 대신 밝게 깐다.** 멀리 있는 것은 실제로 대기 때문에 밝고
    //  대비가 낮아진다(공기원근). 그리고 이 게임의 유닛 디테일은 대부분 어두운 색
    //  (투구·무기·잉크 윤곽)이라 **밝은 배경에서 더 잘 읽힌다.** 깊이도 얻고
    //  가독성도 지키는 유일한 방향이다.
    //  ⚠ 유닛이 서는 구간은 **가장 조용해야 한다.** 값을 키우고 싶어지면 먼저
    //    거기에 유닛이 서는지부터 재라.
    var baseFill = B ? B.fill : C.arenaFill;
    var farH = R.h * 0.10;
    g.fillStyle(UI.mix(baseFill, 0xffffff, 0.14), 1);
    g.fillRect(R.x, R.y, R.w, farH);

    //  먼 능선 — 톱니 실루엣. **좌표를 캐시한다**: 매 프레임 새로 뽑으면 언덕이 춤춘다
    //  (`drawBiomeProps` 가 같은 이유로 캐시한다).
    var ridgeKey = (B ? B.key || B.name || '' : '') + '|' + Math.round(R.w) + '|' + Math.round(farH);
    if (UI._ridgeKey !== ridgeKey) {
      var seed = 0, si;
      for (si = 0; si < ridgeKey.length; si++) seed = (seed * 31 + ridgeKey.charCodeAt(si)) >>> 0;
      var rnd = function () { seed ^= seed << 13; seed >>>= 0; seed ^= seed >> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
      var pts = [], step = Math.max(26, R.w / 26), x;
      for (x = -step; x <= R.w + step; x += step) {
        pts.push({ x: x, y: farH * (0.55 + rnd() * 0.45) });
      }
      UI._ridge = pts; UI._ridgeKey = ridgeKey;
    }
    if (UI._ridge && UI._ridge.length > 1) {
      var rp = UI._ridge, poly = [], k;
      for (k = 0; k < rp.length; k++) poly.push({ x: R.x + rp[k].x, y: R.y + rp[k].y });
      poly.push({ x: R.x + R.w + 40, y: R.y - 8 });
      poly.push({ x: R.x - 40, y: R.y - 8 });
      //  능선도 **연하게**. 진하면 유닛 뒤에서 톱니가 춤춰 시선을 잡아먹는다.
      //  안개 띠보다 조금만 어두우면 "저 멀리 능선이 있다"는 충분히 읽힌다.
      g.fillStyle(UI.mix(baseFill, 0x000000, 0.14), 0.85);
      g.fillPoints(poly, true);
    }

    // 지형지물 — **거리 그림자(아래 그라디언트)보다 먼저** 그린다.
    // 그래야 안쪽 소품이 같이 어두워져 원근을 거스르지 않는다.
    if (B) UI.drawBiomeProps(g, B);

    // ── 근경 띠 ────────────────────────────────────────────────────────────
    //  하단 안쪽 6%. 명도차 10% 뿐이다 — 더 벌리면 바닥이 두 동강 나 보인다.
    var nearH = R.h * 0.06;
    g.fillStyle(UI.mix(baseFill, 0xffffff, 0.10), 1);
    g.fillRect(R.x, R.bottom - nearH, R.w, nearH);

    // ── 거리 그라디언트 ────────────────────────────────────────────────────
    //  ⚠ 예전에는 **6밴드**였다. 폰 가로에서 밴드 하나가 45px 라 계단(밴딩)으로 보였다.
    //    셰이더(`addGradient`)를 쓰는 방법도 있지만 `Phaser.AUTO` 라 Canvas 폴백에서
    //    **에러 없이 아무 일도 안 한다** — 그래서 밴드 수를 28 로 올려 같은 결과를
    //    렌더러와 무관하게 얻는다. fillRect 28 번은 이 게임 프레임에서 무시할 수 있다.
    //  ⚠ 세기를 0.20 → **0.07** 로 낮췄다(2026-08-04 사용자 신고). 위쪽 30% 가
    //    유닛 자리이므로 거기를 어둡게 하면 그게 곧 가독성 손실이다. 원근은 위의
    //    안개 띠와 능선이 이미 만든다 — 이 그라디언트는 **거드는 역할**이면 충분하다.
    var bands = 28;
    for (var b = 0; b < bands; b++) {
      var t = b / bands;
      var alpha = 0.07 * (1 - t) * (1 - t);      // 제곱 감쇠 — 위쪽만 살짝, 매끄럽게
      g.fillStyle(0x000000, alpha);
      g.fillRect(R.x, R.y + R.h * t, R.w, R.h / bands + 1);
    }

    // 격자 — y 간격이 압축되어 자연히 원근처럼 보인다.
    // 소품이 들어오면 바닥이 시끄러워지므로 격자를 0.3 → 0.12 로 낮춘다.
    g.lineStyle(1, C.arenaLine, B ? 0.12 : 0.3);
    for (var gx = A.x + 80; gx < A.right; gx += 80) {
      g.lineBetween(gx, R.y, gx, R.bottom);
    }
    for (var gy = A.y + 80; gy < A.bottom; gy += 80) {
      var sy = Iso.toScreenY(gy);
      g.lineBetween(A.x, sy, A.right, sy);
    }

    // ── 액자 — 경계가 '선'이 아니라 '물건'이다 (2026-08-04) ────────────────
    //  레퍼런스 ①의 액자 구조를 우리 세계관으로 번역한다: 나무 캐노피가 아니라
    //  **부족 목책**이다. 이 세계에 있는 재료는 뼈·돌·나무·가죽·청동뿐이다.
    //  ⚠ 안쪽으로 그린다. 바깥으로 그리면 폰 가로에서 여백이 6px 뿐이라 잘린다.
    var M = UI.MAT, LT = UI.LIGHT;
    var postW = Math.max(5, Math.min(9, R.w * 0.006));
    var postGap = Math.max(34, R.h * 0.16);
    g.fillStyle(M.woodDark, 1);
    g.fillRect(R.x, R.y, postW, R.h);
    g.fillRect(R.right - postW, R.y, postW, R.h);
    //  광원이 좌상단이므로 **왼쪽 면만** 밝다. 양쪽 다 밝히면 광원이 두 개가 된다.
    g.fillStyle(M.wood, 1);
    g.fillRect(R.x, R.y, Math.max(1, postW * 0.34), R.h);
    g.fillRect(R.right - postW, R.y, Math.max(1, postW * 0.34), R.h);
    //  세로 기둥의 마디 — 밧줄로 동여맨 자리
    g.fillStyle(M.rope, 0.75);
    for (var py = R.y + postGap; py < R.bottom - 6; py += postGap) {
      g.fillRect(R.x - 1, py, postW + 2, 3);
      g.fillRect(R.right - postW - 1, py, postW + 2, 3);
    }
    //  위·아래 가로대 — 전장이 그 뒤로 들어가는 것처럼 보이게 그림자를 한 줄 깐다.
    var railH = Math.max(4, R.h * 0.018);
    g.fillStyle(M.woodDark, 1);
    g.fillRect(R.x, R.y, R.w, railH);
    g.fillRect(R.x, R.bottom - railH, R.w, railH);
    g.fillStyle(M.wood, 1);
    g.fillRect(R.x, R.y, R.w, Math.max(1, railH * 0.3));
    g.fillStyle((UI.COL && UI.COL.shadow) || 0x000000, 0.28);
    g.fillRect(R.x, R.y + railH, R.w, Math.max(2, railH * 0.6));
    //  네 귀퉁이의 뼈 마디 — 목책이 '묶여 있다'를 말한다.
    g.fillStyle(M.bone, 1);
    var bn = Math.max(4, postW * 0.9);
    [[R.x + postW / 2, R.y + railH], [R.right - postW / 2, R.y + railH],
     [R.x + postW / 2, R.bottom - railH], [R.right - postW / 2, R.bottom - railH]]
      .forEach(function (p) { g.fillEllipse(p[0], p[1], bn * 1.6, bn * 1.2, 8); });

    // ── 수성전 전용 (2026-08-04 사용자: "이 화면도 좀 매력있게 꾸며줘") ────────
    //  수성의 탑은 **지키는 싸움**인데 화면에 그 정체성이 하나도 없었다. 통곡의 탑과
    //  달리 조이스틱·스킬 버튼이 없어 아래 2/3 가 통째로 비어 더 단조로워 보인다.
    //  → 아래에는 **방어벽**, 위에는 적이 밀고 들어오는 **침입구**를 세운다.
    //
    //  ⚠ **유닛이 안 서는 가장자리에만** 그린다. 내 진형은 아래 15~30% 에 서고
    //    침입 영웅은 위에서 내려온다 — 그 사이(전장 본체)는 한 획도 안 건드린다.
    //    "바닥이 시끄러우면 예고 원과 투사체가 안 보인다" 는 이 게임의 제1규율이다.
    //  ⚠ 색은 전부 MAT 토큰이다. 이 세계의 성벽은 돌과 통나무지 벽돌이 아니다.
    if (opts.defend) {
      //  ① 방어벽 — 바닥 가로대 위에 얹힌 돌 흉벽. 톱니(총안)로 '벽'이 읽힌다.
      var wallH = Math.max(10, R.h * 0.055);
      var wy0 = R.bottom - railH - wallH;
      g.fillStyle(UI.mix(M.stone, 0x000000, 0.30), 1);
      g.fillRect(R.x + postW, wy0 + wallH * 0.42, R.w - postW * 2, wallH * 0.58);
      g.fillStyle(M.stone, 1);
      g.fillRect(R.x + postW, wy0 + wallH * 0.30, R.w - postW * 2, wallH * 0.34);
      g.fillStyle(M.stoneLite || UI.mix(M.stone, 0xffffff, 0.25), 1);   // 광원은 좌상단
      g.fillRect(R.x + postW, wy0 + wallH * 0.30, R.w - postW * 2, Math.max(1, wallH * 0.10));
      //  총안(crenellation) — 이가 빠진 자리가 있어야 성벽이지 담이 아니다.
      var merW = Math.max(16, R.w / 26), mx;
      for (mx = R.x + postW; mx < R.right - postW; mx += merW * 2) {
        var mw = Math.min(merW, R.right - postW - mx);
        g.fillStyle(UI.mix(M.stone, 0x000000, 0.18), 1);
        g.fillRect(mx, wy0, mw, wallH * 0.34);
        g.fillStyle(M.stoneLite || UI.mix(M.stone, 0xffffff, 0.25), 1);
        g.fillRect(mx, wy0, mw, Math.max(1, wallH * 0.09));
      }
      //  벽에 기대 세운 통나무 말뚝 — 원시 부족의 방어선은 돌만으로 안 선다.
      g.fillStyle(M.woodDark, 0.9);
      for (mx = R.x + postW + merW; mx < R.right - postW; mx += merW * 3) {
        g.fillRect(mx, wy0 + wallH * 0.20, Math.max(2, merW * 0.13), wallH * 0.95);
      }

      //  ② 침입구 — 위 가로대가 **부서져 벌어진 자리**. 적이 여기로 들어온다.
      //     가운데에 두는 이유: 침입 영웅이 화면 위 가운데에서 내려온다(defend.js).
      var gw = Math.max(46, R.w * 0.11), gx = R.x + R.w / 2 - gw / 2;
      g.fillStyle(baseFill, 1);                       // 가로대를 도려낸다
      g.fillRect(gx, R.y, gw, railH);
      g.fillStyle(UI.mix(M.woodDark, 0x000000, 0.25), 1);   // 부러진 단면 두 개
      g.fillTriangle(gx, R.y, gx - railH * 0.9, R.y + railH, gx, R.y + railH);
      g.fillTriangle(gx + gw, R.y, gx + gw + railH * 0.9, R.y + railH, gx + gw, R.y + railH);
      //  발밑에 흩어진 돌조각 — '뚫렸다'가 바닥에도 남는다.
      g.fillStyle(UI.mix(M.stone, 0x000000, 0.12), 0.75);
      for (var ri2 = 0; ri2 < 5; ri2++) {
        var rr2 = Math.max(2, railH * 0.22);
        g.fillEllipse(gx + gw * (0.12 + ri2 * 0.19), R.y + railH * (1.6 + (ri2 % 2) * 0.9),
                      rr2 * 2, rr2 * 1.3, 8);
      }
    }

    // 보스 층 테두리 — 전장 안이 아니라 **가장자리**에만 칠한다.
    // 논타겟 회피 게임이라 바닥 한가운데를 물들이면 예고 원이 죽는다.
    if (B && B.boss) {
      g.lineStyle(3, B.edge, 0.8);
      g.strokeRect(R.x + 2.5, R.y + 2.5, R.w - 5, R.h - 5);
    }
  },

  // 캐릭터 그리기(bodyShape / drawWeapon / drawUnit / drawUnitFlat)는
  // js/eggart.js 로 옮겼다 — Egg War 계란 아트 + 8방향 + 걸음걸이.
  // 여기 남겨두면 두 벌이 생겨 어느 쪽이 실제로 쓰이는지 알 수 없어진다.

  // 지면에 눕힌 원 (스킬 범위·예고·덫 표시)
  //
  //  ⚠ **분할 수를 반드시 넘긴다** (2026-08-04 프레임 저하 조사). 예전에는 안 넘겨
  //    Phaser 기본값 **32분할**이 걸렸다. 이 게임은 지면 링을 한 프레임에 수십 개
  //    그리고(예고·범위·발밑·죽음 연출), `ringInk` 는 잉크까지 **두 번** 그린다 —
  //    링 하나가 정점 64개다. 실측에서 프레임당 `lineTo` 가 6,349회였고 CPU 의
  //    25.6%가 정점 버퍼 업로드(`bufferData`)였다.
  //  ⚠ 반지름에 비례해 늘린다. 작은 링에 32분할은 낭비고, 큰 예고 원(반지름 235)에
  //    12분할은 각져 보인다. 지면 링은 TILT(0.72)로 눌려 세로가 짧으니 같은 반지름
  //    기준으로 원보다 적은 분할이어도 매끄럽게 보인다.
  _gseg: function (radius) {
    var n = Math.round(Math.abs(radius) * 0.22);
    return Math.max(10, Math.min(26, n));
  },
  groundCircle: function (g, worldX, worldY, radius) {
    var Iso = GAME.Iso;
    g.strokeEllipse(worldX, Iso.toScreenY(worldY), radius * 2, radius * 2 * Iso.TILT,
                    GAME.UI._gseg(radius));
  },

  groundCircleFill: function (g, worldX, worldY, radius) {
    var Iso = GAME.Iso;
    g.fillEllipse(worldX, Iso.toScreenY(worldY), radius * 2, radius * 2 * Iso.TILT,
                  GAME.UI._gseg(radius));
  },

  // 선택 표시 — 캐릭터 머리 위에 떠서 아래를 가리키는 화살표.
  //
  // ⚠ **예전 주석("진영색 청록/보라와 겹치지 않는 빨강")은 낡았다.** 그 주석이 쓰인 뒤
  //   테마 A 가 전략가(적) 진영색을 크림슨 `#AF2447` 로 바꿨고, 화살표의 `#FF3B30` 은
  //   그것과 **색상차 18° · 명암비 1.87** 이다. 즉 "내가 모는 놈"을 알려주는 표식이
  //   적 무리와 같은 색으로 칠해져 있었다 — 사용자 신고("난전에서 내 유닛을 못 찾는다")의
  //   직접 원인이다. 실측: 크림슨 전사 5기 사이의 영웅을 스크린샷에서 찾을 수 없었다.
  //
  // 왜 **단색이 아니라 2톤**인가 (계산으로 고른 것이다):
  //   진영색으로 바꾸는 것은 오히려 나쁘다 — 남색 vs 크림슨은 1.45 로 지금(1.87)보다 낮다.
  //   두 진영색이 다 어둡기 때문이다. 그리고 어떤 **단색**도 세 테마를 못 덮는다:
  //   후보별 최저 명암비가 빨강 1.05 · 노른자금 1.01 · 흰색 1.60 · 잉크 1.64 로 전부 3:1 미달.
  //   흰 채움 + 잉크 테두리는 **실패 구간이 겹치지 않는다**:
  //     · 흰색이 약한 곳은 밝은 필드(1.60)뿐 → 거기서 잉크가 9.88
  //     · 잉크가 약한 곳은 어두운 진영색(1.64~2.39)뿐 → 거기서 흰색이 6.6~9.7
  //   결과 최악 **4.26:1** (단색 최선의 2.6배), 세 테마·2형·1형색각 전부 통과.
  //
  // 색에 의존하지 않는 신호도 함께 싣는다 — 아래를 가리키는 삼각형(형태),
  // 느린 크기 펄스(운동), 화면에 하나뿐(유일성). 색맹에서도 그대로 작동한다.
  //
  // `tipY` 는 **화살촉 끝의 y 를 그대로** 받는다(bob 만 더해진다).
  // ⚠ 예전 시그니처는 `by` 를 받아 안에서 `- radius - 12` 를 뺐는데, 호출부가 넘기던 `by` 는
  //   몸통이 아니라 **체력바 줄**(`pos.by - radius - 10`)이었다. 두 오프셋이 겹쳐
  //   화살표가 몸통보다 **50px 넘게** 위로 떠 유닛과 분리돼 보였다(실측 스크린샷).
  //   숨은 산술을 함수 안에 두면 호출부가 무엇을 넘기는지 알 수 없게 된다 → 좌표를 직접 받는다.
  // ⚠ **y 정렬 루프 밖에서 부를 것.** 루프 안에서 부르면 뒤에 그려지는(더 앞에 있는)
  //   유닛 몸통이 화살표를 덮는다 — 발밑 링이 당하는 가림과 똑같은 일이 머리 위에서 난다.
  selectArrow: function (g, sx, tipY0, radius, timeMs) {
    var t = timeMs || 0;
    var bob = Math.sin(t / 260) * 3;
    // 크기 펄스 ±8% · 약 0.6Hz. 정적인 난전에서 운동은 가장 강한 단일 신호이고
    // 색·크기와 독립이라 색맹에서도 남는다.
    var pulse = 1 + 0.08 * Math.sin(t / 265);
    // 하한을 올렸다(7x9 → 11x14). 전사 몸통 413px² 대비 37% 급이 되어야 난전에서 보인다.
    var w = Math.max(11, radius * 0.62) * pulse;
    var h = Math.max(14, radius * 0.78) * pulse;
    var tipY = tipY0 + bob;                // 화살촉 끝(아래를 가리킨다)

    // ⚠ 이 파일은 `GAME.UI = { ... }` 객체 리터럴이라 **지역 `UI` 가 없다**(eggart.js 와 다르다).
    //   `UI.ART_INK_COLOR` 로 쓰면 ReferenceError 가 나고, 이 함수는 draw 안에서 불리므로
    //   Phaser 업데이트 루프가 죽어 **전투가 통째로 멈춘다**(이 폴더가 겪은 계열의 사고다).
    var ink = (GAME.UI.ART_INK_COLOR !== undefined) ? GAME.UI.ART_INK_COLOR : 0x2a2114;

    // ① 잉크 테두리 — 삼각형을 한 겹 크게 깔아 윤곽을 만든다.
    //    stroke 가 아니라 확대 채움인 이유: Graphics 한 장에 담는 원칙을 지키면서
    //    꼭짓점이 뾰족하게 남는다(선 조인이 작은 삼각형에서 뭉개지지 않는다).
    var o = Math.max(2, radius * 0.16);
    g.fillStyle(ink, 1);
    g.fillTriangle(sx - w - o, tipY - h - o, sx + w + o, tipY - h - o, sx, tipY + o * 1.2);

    // ② 흰 채움 — 어두운 진영색 위에서 이쪽이 신호를 낸다.
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(sx - w, tipY - h, sx + w, tipY - h, sx, tipY);

    // ③ 안쪽 잉크 쐐기 — 흰 면 안에 형태를 한 번 더 새겨, 흰 배경(아이보리 껍질·밝은 필드)
    //    위에서도 '삼각형'이라는 형태가 읽히게 한다.
    g.fillStyle(ink, 0.85);
    g.fillTriangle(sx - w * 0.34, tipY - h * 0.86, sx + w * 0.34, tipY - h * 0.86,
                   sx, tipY - h * 0.20);
  },

  // ── 전장 위 체력 바 ─────────────────────────────────────────
  //  전투 화면과 배치 화면이 같은 모양을 쓰도록 한 곳에 둔다.
  //  battle.js / defend.js 의 인라인 렌더도 GAME.UI.fieldHpBar 를 거쳐 같은 그림을 그린다.
  //
  //  ※ 라이트 테마(목장)에서 이 바가 **초록 들판에 통째로 묻히는** 문제가 있었다.
  //    hpGood(#9CDE33) 상대휘도 0.596 vs 목초지 0.605 → 대비 1.02:1. 같은 밝기다.
  //    어떤 초록을 골라도 초록 위에서는 이길 수 없어서 구조를 바꿨다:
  //      크림 트랙 + 잉크 테두리 + 진한 채움 (아래 casing 분기)
  //    어두운 테마는 casing 토큰이 없으므로 **예전과 픽셀 단위로 동일**하게 그려진다.
  hpBar: function (g, sx, by, radius, ratio, opts) {
    opts = opts || {};
    var bw = opts.width || Math.max(26, radius * 2.3);
    var bh = opts.height || 5;
    var y = by - radius - (opts.lift === undefined ? 10 : opts.lift);
    GAME.UI.fieldHpBar(g, sx - bw / 2, y, bw, bh, ratio, opts);
    return y;
  },

  // 좌상단 기준 체력 바. shield(0~1)를 주면 바로 위에 보호막 줄이 붙는다.
  fieldHpBar: function (g, x, y, bw, bh, ratio, opts) {
    opts = opts || {};
    var C = GAME.CONFIG.COLORS;
    var COL = (GAME.UI && GAME.UI.COL) || {};
    ratio = Math.max(0, Math.min(1, ratio));

    var casing = COL.hpCasing;
    if (casing === undefined) {
      // ── 어두운 테마 (기존 그대로) ──
      g.fillStyle(0x000000, 0.6);
      g.fillRect(x, y, bw, bh);
      g.fillStyle(ratio > 0.35 ? C.hpGood : C.hpBad, 1);
      g.fillRect(x, y, bw * ratio, bh);
      if (opts.shield > 0) {
        g.fillStyle(0x7ec8f0, 1);
        g.fillRect(x, y - bh - 1, bw * Math.min(1, opts.shield), Math.max(3, bh - 1));
      }
      return y;
    }

    // ── 라이트 테마 — 크림 캡슐 + 잉크 테두리 ──
    var track = COL.hpTrack === undefined ? 0xF7EEDA : COL.hpTrack;
    var good = COL.hpFieldGood === undefined ? C.hpGood : COL.hpFieldGood;
    var bad = COL.hpFieldBad === undefined ? C.hpBad : COL.hpFieldBad;
    var r = Math.min(bh, bw) / 2;
    var t = Math.max(1, Math.round(bh * 0.30));      // 테두리 두께

    g.fillStyle(casing, 0.95);
    g.fillRoundedRect(x - t, y - t, bw + t * 2, bh + t * 2, r + t);
    g.fillStyle(track, 1);
    g.fillRoundedRect(x, y, bw, bh, r);
    if (ratio > 0) {
      var fw = Math.max(bh, bw * ratio);
      g.fillStyle(ratio > 0.35 ? good : bad, 1);
      g.fillRoundedRect(x, y, Math.min(fw, bw), bh, Math.min(r, fw / 2));
    }
    if (opts.shield > 0) {
      var sh = Math.max(3, bh - 1), sy = y - t - sh - 1;
      var sw = bw * Math.min(1, opts.shield);
      g.fillStyle(casing, 0.95);
      g.fillRoundedRect(x - t, sy - t, sw + t * 2, sh + t * 2, sh / 2 + t);
      g.fillStyle(COL.hpFieldShield === undefined ? 0x1B6FA8 : COL.hpFieldShield, 1);
      g.fillRoundedRect(x, sy, sw, sh, sh / 2);
    }
    return y;
  },

  sideColor: function (side) {
    return side === 'controller' ? GAME.CONFIG.COLORS.controller : GAME.CONFIG.COLORS.strategist;
  },

  inZone: function (zone, x, y) {
    return x >= zone.x && x <= zone.x + zone.w && y >= zone.y && y <= zone.y + zone.h;
  },

  winRateText: function (id) {
    var rate = GAME.Formations.winRate(id);
    var s = GAME.Formations.getStats(id);
    var total = s.win + s.loss + s.draw;
    if (rate === null) return '전적 없음 — 첫 도전자';
    return '방어 승률 ' + rate + '%  (' + total + '전 ' + s.win + '승 ' + s.loss + '패 ' + s.draw + '무)';
  },

  // 좁은 목록 행(세로 420) 전용 짧은 형태.
  // 긴 형태는 229px 라 420 폭 행의 절반을 넘게 먹어서 옆 칸(유닛·예산)이 통째로 잘렸다.
  winRateShort: function (id) {
    var rate = GAME.Formations.winRate(id);
    var s = GAME.Formations.getStats(id);
    var total = s.win + s.loss + s.draw;
    if (rate === null) return '첫 도전자';
    return '방어 ' + rate + '% · ' + total + '전';
  },

  // 가로 스탯 막대 (영웅/유닛 공용)
  statBars: function (g, defs, obj, x, y, barW, rowGap, color) {
    for (var i = 0; i < defs.length; i++) {
      var sd = defs[i];
      var frac = Math.max(0, Math.min(1, sd.get(obj) / sd.max));
      var ry = y + i * rowGap;
      g.fillStyle(0x2a2a3a, 1);
      g.fillRect(x, ry - 8, barW, 16);
      g.fillStyle(color, 1);
      g.fillRect(x, ry - 8, barW * frac, 16);
      g.lineStyle(1, 0x3a3a52, 1);
      g.strokeRect(x, ry - 8, barW, 16);
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════
//  층 분위기(biome) — 전장이 "어디인지"를 말하게 한다
//  ---------------------------------------------------------------------------
//  왜: drawArena 가 층을 인자로 안 받아 **1층과 30층이 픽셀 단위로 같았다**.
//      무한의 탑을 오른다는 감각을 지탱할 시각 장치가 코드상 없었다.
//      (근거: docs/proposals/2026-07-29-worldbuilding-review.md 3-1 / 6장)
//
//  ── 구간을 새로 발명하지 않았다 ──────────────────────────────────────────
//  층 배지가 이미 쓰는 `UI.tierForFloor` 의 구간 [4,10,20,30,40] 을 그대로 쓴다.
//  즉 화면의 등급 배지와 바닥이 **같은 순간에** 바뀐다. 새 사다리를 만들면
//  "이 층은 정예인데 바닥은 아직 늪"처럼 두 사다리가 어긋난다.
//    0: 1~3   여린 풀숲 (연습 구간)      3: 20~29 늪
//    1: 4~9   풀숲                        4: 30~39 잿바닥
//    2: 10~19 돌담                        5: 40+   모래벌
//  보스 층은 `Tower.BOSS_EVERY` 로 유도해 **밴드 위에 덧칠**한다(밴드를 건너뛰지 않는다).
//
//  ── 모드별 판단 ──────────────────────────────────────────────────────────
//  · 통곡의 탑 / 수성의 탑 : 층수 그대로. 둘은 같은 탑의 거울이라 같은 사다리를 쓴다.
//  · 일반 대전(도전)       : 층이 없다 → `tierForEscalation` 등급을 그대로 넘긴다.
//                            반복 격파로 난이도가 오르면 바닥도 같이 거칠어진다.
//  · 대전(비동기 PvP)      : **중립**(밴드 1 풀숲 고정). 남의 기지를 치는 것이지
//                            탑을 오르는 게 아니라 층 감각을 주면 거짓말이 된다.
//
//  ── 읽기를 방해하지 않기 위한 규율 (이게 제일 중요하다) ──────────────────
//  이 게임은 논타겟을 눈으로 피하는 게임이다. 바닥이 시끄러우면 예고 원과
//  투사체가 안 보인다. 그래서:
//    · 소품 색은 지면색에서 흑/백으로 t=0.20 섞은 값 + 알파 0.24~0.42
//      → 실효 명도차 5~9%. "있는 줄 알겠지만 눈이 안 가는" 수준.
//    · 개수 상한 `UI.BIOME_PROPS_MAX`(14). 0 을 주면 소품이 통째로 꺼진다(성능 측정용).
//    · 격자 알파를 0.3 → 0.12 로 내려 소품이 들어온 만큼 다른 것을 뺀다.
//    · 소품은 항상 유닛보다 먼저 그려진다(drawArena 가 draw() 첫 줄이다).
//
//  ── 성능 ────────────────────────────────────────────────────────────────
//  바닥은 매 프레임 다시 그려진다. 그래서
//    · 좌표는 `Math.random()` 이 아니라 **층 번호 해시**로 만든다(매 프레임 춤추면 안 된다).
//    · 그 좌표를 캐시한다 — 테마·해상도·층이 그대로면 다시 계산하지 않는다.
//    · fillEllipse/strokeEllipse 에 **분할 수를 반드시 넘긴다**(기본 32는 낭비).
//  색은 전부 테마 토큰(arenaFill / arenaLine / FX.ink / FX.bossRing)에서 유도한다 —
//  하드코딩 색이 하나도 없어야 테마 4종이 전부 성립한다.
// ═══════════════════════════════════════════════════════════════════════════
(function (UI) {

  // 소품 개수 상한. 0 이면 소품 없이 색만 바뀐다.
  UI.BIOME_PROPS_MAX = 14;

  //  hue  : 지면 색상을 이쪽으로 끌어온다(완전히 갈아엎지 않고 HUE_PULL 만큼만 —
  //         테마 B(포도)·C(크라프트지)의 정체성을 지우면 안 된다)
  //  sat  : 채도 배수     dark/light : 명도 배수(어두운 테마 / 라이트 테마)
  //  kind : 소품 종류     n : 소품 개수
  var HUE_PULL = 0.78;
  var BIOMES = [
    { hue:  96, sat: 1.00, dark: 1.18, light: 1.07, kind: 0, n:  8 },  // 1~3   여린 풀숲
    { hue: 108, sat: 1.00, dark: 1.04, light: 1.00, kind: 0, n: 12 },  // 4~9   풀숲
    { hue:  92, sat: 0.40, dark: 0.96, light: 0.89, kind: 1, n: 12 },  // 10~19 돌담(회녹)
    { hue: 192, sat: 1.05, dark: 0.90, light: 0.85, kind: 2, n: 11 },  // 20~29 늪(청록)
    { hue:  20, sat: 0.42, dark: 0.86, light: 0.83, kind: 3, n: 13 },  // 30~39 잿바닥
    { hue:  40, sat: 0.70, dark: 1.00, light: 0.94, kind: 4, n: 13 }   // 40+   모래벌
  ];

  // 어두운 테마(stock·B·C)는 전장 명도가 0.17~0.25 밖에 안 된다.
  // 거기서 명도를 더 깎으면 여섯 구간이 전부 '검정'으로 수렴한다 — 실측으로 확인했다.
  // 그래서 어두운 테마는 **채도로** 구간을 만든다. 라이트 테마(A)는 명도 여유가 있어
  // 그대로 둔다. 어느 쪽이든 색은 테마의 arenaFill 에서 유도한 값이다.
  var DARK_SAT_BOOST = 1.5;
  var DARK_V = 0.34;          // 이 명도 아래를 '어두운 전장'으로 본다

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function toHsv(c) {
    var r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
    if (d > 0) {
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return { h: h, s: mx > 0 ? d / mx : 0, v: mx };
  }

  function toRgb(h, s, v) {
    h = ((h % 360) + 360) % 360;
    s = clamp(s, 0, 1); v = clamp(v, 0, 1);
    var c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
    var r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return (Math.round((r + m) * 255) << 16) | (Math.round((g + m) * 255) << 8) | Math.round((b + m) * 255);
  }

  // 흑/백을 t 만큼 섞는다. 배수(shade)를 쓰면 아주 어두운 테마에서 차이가 0 이 된다
  // — 0x1e1e2c 를 1.2배 해도 사람 눈에는 그대로다. 절대량으로 섞어야 4테마가 다 성립한다.
  function mixTo(c, target, t) {
    var r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    var tr = (target >> 16) & 255, tg = (target >> 8) & 255, tb = target & 255;
    return (Math.round(r + (tr - r) * t) << 16)
         | (Math.round(g + (tg - g) * t) << 8)
         | Math.round(b + (tb - b) * t);
  }

  function hueToward(from, to, t) {
    var d = ((to - from + 540) % 360) - 180;   // 최단 회전
    return from + d * t;
  }

  // 결정론적 해시. 같은 층은 언제나 같은 그림이다 — 재도전 때 배경이 바뀌면 산만하다.
  function hash(n) {
    var x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  var cache = null;

  // opts → 이번 판의 분위기. 아무 단서가 없으면 null(= 예전 그림 그대로).
  UI.biomeFor = function (opts, R) {
    var C = GAME.CONFIG.COLORS;
    var idx = -1;
    var floor = Math.max(0, Math.round(Number(opts.floor) || 0));

    if (typeof opts.biome === 'number') idx = opts.biome;
    else if (floor > 0) {
      // 층 배지와 **같은 구간표**를 쓴다. 보스 가산(+1)은 일부러 뺀다 —
      // 10층 보스가 20층대 바닥으로 보이면 구간이 어긋난다.
      if (!UI.tierForFloor) return null;
      idx = UI.tierForFloor(floor).i;
    } else if (typeof opts.tier === 'number') idx = opts.tier;
    if (idx < 0) return null;
    idx = clamp(Math.round(idx), 0, BIOMES.length - 1);

    var every = (GAME.Tower && GAME.Tower.BOSS_EVERY) || 10;
    var boss = (opts.boss !== undefined) ? !!opts.boss : (floor > 0 && floor % every === 0);
    var seed = floor > 0 ? floor : (100 + idx);
    var nMax = Math.max(0, UI.BIOME_PROPS_MAX | 0);

    var key = idx + '|' + (boss ? 1 : 0) + '|' + seed + '|' + nMax + '|'
            + C.arenaFill + '|' + (UI.IS_LIGHT ? 1 : 0) + '|'
            + Math.round(R.x) + ',' + Math.round(R.y) + ',' + Math.round(R.w) + ',' + Math.round(R.h);
    if (cache && cache.key === key) return cache;

    var S = BIOMES[idx];
    var base = toHsv(C.arenaFill);
    var vmul = UI.IS_LIGHT ? S.light : S.dark;
    var smul = S.sat * (base.v < DARK_V ? DARK_SAT_BOOST : 1);
    var fill = toRgb(hueToward(base.h, S.hue, HUE_PULL), base.s * smul, base.v * vmul);
    if (boss) fill = toRgb(toHsv(fill).h, toHsv(fill).s * 1.12, toHsv(fill).v * 0.86);

    var FX = UI.FX || {};
    var B = {
      key: key,
      i: idx,
      boss: boss,
      kind: S.kind,
      fill: fill,
      dark: mixTo(fill, 0x000000, 0.24),
      lite: mixTo(fill, 0xffffff, 0.24),
      crack: mixTo(fill, FX.ink === undefined ? 0x000000 : FX.ink, 0.45),
      edge: FX.bossRing === undefined ? GAME.CONFIG.COLORS.arenaLine : FX.bossRing,
      props: []
    };

    // ── 소품 좌표 (한 번만 계산한다) ─────────────────────────────────────
    var n = Math.min(S.n, nMax);
    var mx = R.w * 0.05, my = R.h * 0.08;
    for (var i = 0; i < n; i++) {
      var h1 = hash(seed * 977 + i * 31.7);
      var h2 = hash(seed * 613 + i * 57.3 + 11);
      var h3 = hash(seed * 419 + i * 13.9 + 97);
      // 크기와 변형은 **다른 해시**로 뽑는다. 같은 값을 쓰면 "큰 것은 언제나 바위,
      // 작은 것은 언제나 조약돌"처럼 규칙이 드러나 인공물로 보인다.
      var h4 = hash(seed * 271 + i * 91.1 + 53);
      B.props.push({
        x: R.x + mx + h1 * (R.w - mx * 2),
        y: R.y + my + h2 * (R.h - my * 2),
        s: 4.2 + h3 * 3.6,          // 크기 4.2~7.8 — 유닛(반지름 10~16)보다 확실히 작게
        v: h4                        // 변형(어느 소품을 쓸지)
      });
    }

    // 보스 층 균열 — 중앙에서 뻗어 나간다. 밝기차는 소품보다도 낮게 잡는다.
    // **반드시 전장 안에 가둔다** — 안 가두면 화면 전체를 가로지르는 실금이 되어
    // HUD·조작 패드 위까지 그어진다(첫 시안에서 실제로 그랬다).
    B.cracks = [];
    if (boss) {
      var cx = R.x + R.w / 2, cy = R.y + R.h / 2;
      var lx0 = R.x + 6, lx1 = R.x + R.w - 6, ly0 = R.y + 6, ly1 = R.y + R.h - 6;
      for (var k = 0; k < 6; k++) {
        var a0 = (k / 6) * Math.PI * 2 + hash(seed + k) * 0.7;
        var len = (R.w * 0.085) * (0.6 + hash(seed * 7 + k) * 0.8);
        var pts = [], px = cx, py = cy, ang = a0;
        for (var sgm = 0; sgm < 3; sgm++) {
          ang += (hash(seed * 3 + k * 5 + sgm) - 0.5) * 0.9;
          px = clamp(px + Math.cos(ang) * len, lx0, lx1);
          py = clamp(py + Math.sin(ang) * len * GAME.Iso.TILT, ly0, ly1);
          pts.push({ x: px, y: py });
        }
        B.cracks.push({ x: cx, y: cy, p: pts });
      }
    }

    cache = B;
    return B;
  };

  // 지형지물. 소품 하나당 그리기 명령 5개 이하로 묶는다.
  UI.drawBiomeProps = function (g, B) {
    var p, i, s, x, y;

    for (i = 0; i < B.props.length; i++) {
      p = B.props[i]; x = p.x; y = p.y; s = p.s;

      if (B.kind === 0) {
        // 풀 다발 — 세 가닥. 셋 중 하나는 조약돌로 바꿔 단조로움을 없앤다.
        if (p.v < 0.28) {
          g.fillStyle(B.dark, 0.34);
          g.fillEllipse(x, y, s * 1.7, s * 0.9, 7);
        } else {
          g.lineStyle(1.8, B.lite, 0.46);
          g.lineBetween(x, y, x - s * 0.55, y - s * 1.5);
          g.lineBetween(x, y, x + s * 0.10, y - s * 1.9);
          g.lineBetween(x, y, x + s * 0.60, y - s * 1.4);
        }

      } else if (B.kind === 1) {
        // 무너진 돌무더기 + 마른 풀
        g.fillStyle(B.dark, 0.38);
        g.fillEllipse(x, y, s * 2.6, s * 1.3, 8);
        g.fillStyle(B.lite, 0.28);
        g.fillEllipse(x - s * 0.45, y - s * 0.30, s * 1.5, s * 0.75, 8);
        if (p.v > 0.55) {
          g.lineStyle(1.5, B.lite, 0.36);
          g.lineBetween(x + s * 1.6, y + s * 0.3, x + s * 1.9, y - s * 1.1);
        }

      } else if (B.kind === 2) {
        // 물웅덩이 + 갈대
        g.fillStyle(B.dark, 0.40);
        g.fillEllipse(x, y, s * 3.4, s * 1.5, 10);
        g.lineStyle(1.5, B.lite, 0.38);
        g.strokeEllipse(x, y, s * 3.4, s * 1.5, 10);
        if (p.v > 0.5) {
          g.lineStyle(1.6, B.dark, 0.42);
          g.lineBetween(x + s * 2.0, y + s * 0.2, x + s * 2.3, y - s * 2.2);
        }

      } else if (B.kind === 3) {
        // 지면 균열 + 뼈 조각
        g.lineStyle(1.8, B.dark, 0.42);
        g.lineBetween(x - s * 1.9, y - s * 0.4, x, y);
        g.lineBetween(x, y, x + s * 1.6, y + s * 0.5);
        if (p.v > 0.6) g.lineBetween(x, y, x + s * 0.9, y - s * 0.9);
        g.fillStyle(B.lite, 0.30);
        g.fillEllipse(x + s * 2.4, y + s * 1.0, s * 1.3, s * 0.55, 7);

      } else {
        // 모래 결 + 껍질 조각
        g.lineStyle(1.6, B.lite, 0.34);
        g.lineBetween(x - s * 2.7, y, x - s * 0.9, y - s * 0.6);
        g.lineBetween(x - s * 0.9, y - s * 0.6, x + s * 0.9, y - s * 0.6);
        g.lineBetween(x + s * 0.9, y - s * 0.6, x + s * 2.7, y);
        if (p.v > 0.45) {
          g.fillStyle(B.dark, 0.30);
          g.fillEllipse(x + s * 1.1, y + s * 1.0, s * 1.2, s * 0.6, 7);
        }
      }
    }

    if (!B.cracks || !B.cracks.length) return;
    g.lineStyle(1.5, B.crack, 0.13);
    for (i = 0; i < B.cracks.length; i++) {
      var cr = B.cracks[i], px = cr.x, py = cr.y;
      for (var j = 0; j < cr.p.length; j++) {
        g.lineBetween(px, py, cr.p[j].x, cr.p[j].y);
        px = cr.p[j].x; py = cr.p[j].y;
      }
    }
  };

})(GAME.UI);
