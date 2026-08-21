// ============================================================================
//  Egg War — 계란 캐릭터 아트 시스템  (v2: 8방향 + 보행 모션)
//  ui.js 의 bodyShape / drawWeapon / drawUnit / drawUnitFlat 를 통째로 대체한다.
//  이미지 애셋 없음. Phaser.GameObjects.Graphics 도형 API 만 사용.
//
//  설계 원칙
//   1) 몸통은 전부 달걀 → 종류 구분은 "투구 + 든 것" 두 레이어가 전담한다.
//   2) 색은 진영 전용. 장비는 나무/뼈/돌/점토 같은 중립색만 쓴다
//      (진영색 teal 0x35d0a5 / violet 0x9b8cf0 와 절대 겹치지 않는 색역).
//   3) r 9~18px 에서 읽혀야 한다 → 투구 실루엣을 계란보다 넓게 뽑고,
//      작아지면 자동으로 디테일을 끈다(LOD).
//
//  v2 에서 추가된 것
//   A) 8방향(45° 스냅) — 연속 facing 을 받아 내부에서 스냅한다. 호출부 변경 없음.
//      · 뒤를 보면 눈이 사라지고 투구 뒷면 / 목가리개가 나온다.
//      · 옆을 보면 실루엣이 좁아지고 뿔·챙·볏이 앞뒤로 겹친다.
//      · 뒤를 보면 무기는 몸통보다 먼저 그려 가려지고, 등짐·망토는 몸통 위로 올라온다.
//   B) 보행 모션 — drawUnit / drawUnitFlat / drawEggChar 마지막 인자에 walk 를 넘긴다.
//      · walk 를 안 넘기면(undefined/null) v1 과 픽셀 단위로 동일하다. 회귀 위험 0.
//      · squat(쇠뇌 진지) / ground(가시덫) 는 걷지 않는다.
//
//  v3 에서 추가된 것
//   C) 아이들 애니메이션 — walk 뒤에 idle(시각 ms) 을 넘기면 그 한 기만 살아 움직인다.
//      호흡은 발밑을 고정한 스쿼시&스트레치, 공격은 무기별로 다른 동작이다.
//      · idle 을 안 넘기면 v2 와 픽셀 단위로 동일하다. → 선택된 카드만 움직인다.
//      · 이 파일은 상태를 만들지 않는다. 같은 t 면 같은 그림(순수 함수).
//   D) 얼굴 가림 완화 — 정면·정배면에서 장비를 측면축으로 벌리고(GEAR_SPREAD),
//      장비 레이어를 **얼굴·투구보다 먼저** 그린다. 눈·볼은 어떤 무기 앞에서도 남는다.
//      옆모습(faceOn=0)은 값이 0 이라 벌림이 없다 — 8방향 실루엣은 그대로다.
// ============================================================================

window.GAME = window.GAME || {};
GAME.UI = GAME.UI || {};
//  ── 타원 분할 수 (2026-08-03 성능) ──────────────────────────────────────────
//  ⚠ Phaser 의 `fillEllipse`/`strokeEllipse` 는 분할 수를 안 넘기면 **32분할**로
//    그린다. 유닛 아트에는 타원이 53개나 있고 이게 **매 프레임 유닛 수만큼** 도니까
//    26기 전투에서 타원만으로 경로 점 수만 개가 나온다(실측: 프레임당 Graphics 호출
//    14,140회 중 lineTo 가 8,446회).
//    이 저장소는 같은 교훈을 이미 적어 뒀다 — js/coin.js: "지름 16px 짜리 물건에
//    32분할은 낭비다. 8~10 분할이면 화면에서 구분되지 않는다." 그런데 정작 가장
//    많이 그려지는 유닛 아트에는 적용이 안 돼 있었다.
//    유닛 반지름은 화면에서 10~16px 라 동전과 같은 근거가 그대로 적용된다.
var SM = 10;


(function (UI) {

  // ── 시안 전환 스위치 ──────────────────────────────────────────
  //  'faction' : 껍질 자체가 진영색            (v1 기본, 안전)
  //  'ivory'   : 껍질은 아이보리, 진영색은 굵은 외곽선 + 목도리 + 발밑 링  ← 확정
  UI.EGG_STYLE = 'ivory';

  // ── 유닛을 '그리는' 크기 배율 (렌더 전용) ───────────────────────────────
  //
  // 세로(폰)에서는 월드가 632→402 로 줄면서 유닛 반지름도 sqrt(0.636)=0.80 배가 된다.
  // 거기에 폰 화면 축소율(≈0.79)까지 겹치면 전사 반지름이 **실제 8px** 밖에 안 된다 —
  // 난전에서 누가 누구인지 구분이 안 된다(실측 신고).
  //
  // 그래서 **그리는 크기만** 키운다. 히트박스(def.radius)는 그대로라 회피·명중 판정과
  // 밸런스가 전혀 움직이지 않는다. 이 프로젝트가 지키는 '렌더와 로직 분리'의 정석 사용이다.
  // 1.30 은 세로에서 잃은 0.80 배를 되돌리고 약간의 여유를 더한 값이다.
  // 폰 가로도 아레나가 작아 유닛이 작게 찍힌다 → 세로와 같은 확대를 준다.
  UI.UNIT_DRAW_SCALE = GAME.CONFIG.SMALL ? 1.30 : 1.0;

  // 중립 재질색 — 진영색과 색역이 겹치지 않는 것만 고른다
  var M = UI.MAT = {
    wood: 0x8a6a45, woodDark: 0x5a452c,
    blade: 0xdfe4ee, bladeDark: 0x757e8e, iron: 0x4b5260,
    bronze: 0xc9993f, leather: 0x8d6b4b, leatherDark: 0x5f4630,
    // 화폐 등급 — 청동 1 · 은 10 · 금 100. 색만으로 갈리면 흑백에서 죽으므로
    // coin.js 가 크기·테두리도 함께 바꾼다(색은 보조 신호다).
    coinBronze: 0xc9993f, coinSilver: 0xc3cbd4, coinGold: 0xe8bf3a,
    bone: 0xeae3cd, leaf: 0x63c26a, leafDark: 0x3f8a4a,
    clay: 0xb5794a, rope: 0xd9c9a2, stone: 0x9aa3ad, goo: 0xa8c14a,
    //  ── 재질 3단 승격 (2026-08-04 아트 개편) ────────────────────────────────
    //  24토큰 중 명암 2단을 가진 것이 wood·blade·leather·leaf·shell 다섯뿐이었다.
    //  나머지(bone·stone·clay·rope·bronze·iron·goo)는 **단일 톤**이라 어떻게 그려도
    //  명암 단계가 안 생긴다 — "재질이 밋밋하다"의 코드상 원인이다.
    //
    //  규칙: Lite 는 명도 +18% + 색상을 노랑 쪽으로(같은 햇빛을 받으니 따뜻해진다).
    //        Dark 는 명도 −32% + 채도를 살짝 빼고 파랑 쪽으로(그늘엔 하늘빛이 든다).
    //  ⚠ `UI.tint()` 처럼 순수 흑백 방향으로만 밀면 **그늘이 회색이 되어 재질이 죽는다.**
    //    그래서 값을 손으로 잡았다.
    //  ⚠ 테마 A/B/C 가 base 토큰을 덮어쓰므로(js/theme-a.js 등), Lite/Dark 만 stock 에
    //    남으면 라이트 테마에서 **밝은 면만 어두운 테마 색으로 튄다.** 아래
    //    `UI.deriveMatTones()` 가 테마 전환 뒤에 3단을 다시 유도해 그 사고를 막는다.
    woodLite: 0xb08c60, bladeLite: 0xf4f7ff,
    ironLite: 0x6d7686, ironDark: 0x2c313c,
    bronzeLite: 0xf0c268, bronzeDark: 0x7d5d20,
    leatherLite: 0xb08a63,
    boneLite: 0xfaf6e6, boneDark: 0xb2a988,
    stoneLite: 0xc2cad2, stoneDark: 0x646c76,
    clayLite: 0xd79c6c, clayDark: 0x7d4f2c,
    ropeLite: 0xf0e4c4, ropeDark: 0xa08f6a,
    leafLite: 0x92e08f,
    gooLite: 0xd0e078, gooDark: 0x6c7d24,
    shellLite: 0xfffaf0,
    yolkDark: 0xc98a10,
    // ── 깃털 두 가지 (2026-07-30 분리) ────────────────────────────────────
    //  `feather` : **비행 중 화살**의 깃(js/skillfx.js). 필드 위 2.5~3px 선이다.
    //     가시성은 화살대 `woodDark`(필드 대비 5.64/4.18)가 담당하고 이 깃은 그 위의
    //     장식이라 밝아야 화살대와 갈린다. 값은 건드리지 않는다 —
    //     `0xd9a05b` 로 바꿔 봤더니 어두운 필드 대비가 1.06(사실상 안 보임)이 됐다.
    //  `quill`   : **유닛 등짐(화살통)의 깃**. 요구가 다르다 — 진영색과 색역이 겹치면
    //     안 된다(원칙 2). `feather`(색상 10°)는 테마 A 의 크림슨(345°)과 **25° 차이**라
    //     양 진영 궁수가 다 '적 색' 깃을 달고 있었다. 여섯 진영색(남색220 · 크림슨345 ·
    //     민트165 · 그레이프285 · 녹청168 · 연지320) 전부에서 40° 이상 떨어진 대역은
    //     따뜻한 황갈뿐이다. `0xd9a05b`(33°)는 최소 색상차 **48°**.
    //  ⚠ 한 토큰으로 합치려 하지 말 것 — 필드 대비와 진영 색역 분리는 서로 다른 요구다.
    //  ⚠ 새 진영색을 도입하면 `quill` 을 다시 검산할 것.
    feather: 0xe0705a,
    quill: 0xd9a05b,
    shell: 0xf6eeda, shellRim: 0xcbb98f,
    yolk: 0xffc233, yolkLite: 0xffe89a, albumen: 0xfff6e2,
    eye: 0x2b2233
  };

  //  ── 3단 재파생 (2026-08-04) ─────────────────────────────────────────────
  //  테마 A/B/C 는 base 토큰(bone·stone·bronze…)을 덮어쓴다. 그때 Lite/Dark 가 stock
  //  값으로 남으면 **밝은 면만 다른 테마 색이 되어** 재질이 두 조각으로 갈라진다.
  //  → 테마를 적용한 **뒤에** 이 함수를 부르면 base 에서 3단을 다시 유도한다.
  //  ⚠ 명도만 미는 것이 아니라 색상도 함께 민다(Lite 는 따뜻하게, Dark 는 차갑게).
  //    회색으로 밀면 재질이 죽는다 — 위 표를 손으로 잡은 것과 같은 이유다.
  UI.deriveMatTones = function () {
    var pairs = [
      ['wood', 'woodLite', 'woodDark'], ['blade', 'bladeLite', 'bladeDark'],
      ['iron', 'ironLite', 'ironDark'], ['bronze', 'bronzeLite', 'bronzeDark'],
      ['leather', 'leatherLite', 'leatherDark'], ['bone', 'boneLite', 'boneDark'],
      ['stone', 'stoneLite', 'stoneDark'], ['clay', 'clayLite', 'clayDark'],
      ['rope', 'ropeLite', 'ropeDark'], ['leaf', 'leafLite', 'leafDark'],
      ['goo', 'gooLite', 'gooDark'], ['shell', 'shellLite', 'shellRim'],
      ['yolk', 'yolkLite', 'yolkDark']
    ];
    var warm = function (c, f) {                 // 밝게 + 노랑 쪽
      var r = (c >> 16) & 255, g2 = (c >> 8) & 255, b = c & 255;
      r += (255 - r) * f; g2 += (255 - g2) * f * 0.92; b += (255 - b) * f * 0.66;
      return ((r | 0) << 16) | ((g2 | 0) << 8) | (b | 0);
    };
    var cool = function (c, f) {                 // 어둡게 + 파랑 쪽
      var r = (c >> 16) & 255, g2 = (c >> 8) & 255, b = c & 255;
      r *= (1 - f); g2 *= (1 - f * 0.94); b *= (1 - f * 0.80);
      return ((r | 0) << 16) | ((g2 | 0) << 8) | (b | 0);
    };
    for (var i = 0; i < pairs.length; i++) {
      var base = M[pairs[i][0]];
      if (typeof base !== 'number') continue;
      M[pairs[i][1]] = warm(base, 0.28);
      M[pairs[i][2]] = cool(base, 0.34);
    }
  };

  //  ── 광원 (2026-08-04 아트 개편 · 이 파일의 새 기준점) ────────────────────────
  //  > 아트 스테이트먼트: "해가 낮게 걸린 들판에서, 껍질 하나짜리 목숨들이
  //  >  뼈와 돌을 들고 서로의 노른자를 터뜨린다."
  //
  //  이 게임이 평평해 보이던 진짜 이유는 그림 실력이 아니라 **광원이 정의된 적이
  //  없다는 것**이었다. `eggBody` 는 좌상단에서 빛을 받게 그려져 있는데 접지 그림자는
  //  발밑 정중앙에 찍혔다 — 둘이 서로 다른 말을 하고 있었다.
  //
  //  ⚠ `dir` 은 **새로 정한 값이 아니다.** 아래 `eggBody` 하이라이트 중심
  //    `(-0.24r, -0.40r)` 을 정규화한 값이다(√(0.24²+0.40²)=0.4665 → -0.51, -0.86).
  //    즉 **게임이 이미 쓰고 있던 방향을 명문화**하는 것이라, 기존 그림은 한 픽셀도
  //    안 바뀌면서 나머지(그림자·리스광)가 여기에 맞춰진다.
  //  ⚠ 예외는 셋뿐 — 불·백열·노른자. **자기가 광원인 것들**은 자기 자리에서 빛난다.
  UI.LIGHT = {
    dir: { x: -0.51, y: -0.86 },
    key: 0xfff3d6, keyA: 0.55,        // 햇빛 — 모든 재질의 리스광이 이 색을 공유한다
    bounceA: 0.22,                     // 지면 반사 세기(색은 아래 `bounce()` 가 유도한다)
    ambient: 0x2a3346,                 // 그늘에 섞는 하늘빛 — 그늘이 회색이 되는 것을 막는다
    //  바운스 색은 **하드코딩하지 않는다.** 목초지 반사광이므로 아레나 색에서 유도해야
    //  테마 4종 × 바이옴 6밴드가 전부 자동으로 따라온다.
    bounce: function () {
      var base = (GAME.CONFIG && GAME.CONFIG.COLORS && GAME.CONFIG.COLORS.arenaFill) || 0x6f7f4a;
      return (typeof UI.mix === 'function') ? UI.mix(base, 0xffffff, 0.28) : 0x8fa06a;
    }
  };

  // 테마가 MAT 을 갈아끼운 뒤 되돌아올 자리. theme-switch.js 가 읽는다.
  // (이 파일은 theme-switch.js **뒤에** 로드되므로 stock 스냅숏에는 못 넣는다)
  UI.MAT_BASE = (function () { var o = {}; for (var k in M) o[k] = M[k]; return o; })();

  // ============================================================================
  //  잉크 윤곽 (artInk)
  // ============================================================================
  //  라이트 테마(A안)에서 장비가 안 보이는 문제의 **구조적 해결**이다.
  //
  //  왜 색만 바꿔서는 안 되는가:
  //    칼날(#dfe4ee)·뼈(#eae3cd)·짚(#d9c9a2)은 **밝아야 그 재질로 읽힌다.**
  //    목초지 대비를 맞추겠다고 회색으로 낮추면 강철은 돌이 되고 뼈는 진흙이 된다.
  //    실제로 낮춰보면 계란들이 전부 칙칙해진다 — 파스텔 테마의 성격을 잃는다.
  //
  //  그래서 대비를 **색이 아니라 선**에 맡긴다. 장비를 한 번 더, 잉크색으로,
  //  조금 부풀려서 뒤에 찍는다(스티커 테두리). 그러면
  //    · 재질색은 밝게 유지되고(강철은 강철로 보이고)
  //    · 실루엣은 잉크(필드 대비 9.88:1)가 책임진다
  //  이것이 A안이 스스로 정한 원칙 — "밝은 면 + 진한 윤곽선" — 을 아트에 적용한 것이다.
  //
  //  구현: Graphics 의 그리기 명령을 가로채는 얇은 프록시를 만들어
  //  **같은 그리기 함수를 두 번** 부른다. 도형 정의를 복제하지 않으므로
  //  나중에 무기 모양을 고쳐도 윤곽이 자동으로 따라온다(두 벌이 생기지 않는다).
  //
  //  비용: 장비·투구·등짐 레이어만 한 번 더 그린다(몸통은 이미 진영색 외곽선이 있다).
  //  r < 8 이면 건너뛴다 — 그 크기에서는 윤곽이 형태를 뭉갠다.
  UI.ART_INK = false;        // theme-switch.js 가 라이트 테마에서 켠다
  UI.ART_INK_COLOR = 0x2A2114;
  UI.ART_INK_ALPHA = 0.9;

  function pushOut(pts, k) {
    var cx = 0, cy = 0, i, n = pts.length;
    for (i = 0; i < n; i++) { cx += pts[i].x; cy += pts[i].y; }
    cx /= n; cy /= n;
    var out = [];
    for (i = 0; i < n; i++) {
      var dx = pts[i].x - cx, dy = pts[i].y - cy;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      out.push({ x: pts[i].x + dx / d * k, y: pts[i].y + dy / d * k });
    }
    return out;
  }

  // g 의 도형 명령을 받아 '잉크색 + k 만큼 부푼' 같은 도형으로 바꿔 흘려보낸다.
  // 색·알파 지정은 전부 무시하고 잉크 하나로 통일한다 → 납작한 그림자 실루엣이 된다.
  function inkProxy(g, col, a, k) {
    var lw = 1;
    function set() { g.fillStyle(col, a); }
    return {
      fillStyle: function () { set(); },
      lineStyle: function (w) { lw = (typeof w === 'number' ? w : 1) + k * 2; g.lineStyle(lw, col, a); },
      fillCircle: function (x, y, r) { set(); g.fillEllipse(x, y, (r + k) * 2, (r + k) * 2, SM); },
      strokeCircle: function (x, y, r) { g.strokeEllipse(x, y, (r) * 2, (r) * 2, SM); },
      fillEllipse: function (x, y, w, h) { set(); g.fillEllipse(x, y, w + k * 2, h + k * 2, SM); },
      strokeEllipse: function (x, y, w, h) { g.strokeEllipse(x, y, w, h, SM); },
      fillRect: function (x, y, w, h) { set(); g.fillRect(x - k, y - k, w + k * 2, h + k * 2); },
      fillRoundedRect: function (x, y, w, h, r) {
        set(); g.fillRoundedRect(x - k, y - k, w + k * 2, h + k * 2, r);
      },
      strokeRoundedRect: function (x, y, w, h, r) {
        g.strokeRoundedRect(x - k, y - k, w + k * 2, h + k * 2, r);
      },
      fillTriangle: function (x1, y1, x2, y2, x3, y3) {
        var p = pushOut([{ x: x1, y: y1 }, { x: x2, y: y2 }, { x: x3, y: y3 }], k);
        set(); g.fillTriangle(p[0].x, p[0].y, p[1].x, p[1].y, p[2].x, p[2].y);
      },
      fillPoints: function (pts, closed) { set(); g.fillPoints(pushOut(pts, k), closed !== false); },
      strokePoints: function (pts, closed, auto) { g.strokePoints(pts, closed, auto); },
      lineBetween: function (x1, y1, x2, y2) { g.lineBetween(x1, y1, x2, y2); }
    };
  }

  // 한 레이어를 잉크로 먼저 찍고, 그 위에 원래대로 그린다.
  //  fn(gfx) 형태로 그리기 호출을 넘긴다.
  UI.inkLayer = function (g, r, fn) {
    if (UI.ART_INK && r >= 8) {
      var k = Math.max(1.15, r * 0.115);
      fn(inkProxy(g, UI.ART_INK_COLOR, UI.ART_INK_ALPHA, k));
    }
    fn(g);
  };

  // ── 색 보정 ───────────────────────────────────────────────────
  UI.tint = function (c, f) {
    var r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    else { r *= (1 + f); g *= (1 + f); b *= (1 + f); }
    return ((r | 0) << 16) | ((g | 0) << 8) | (b | 0);
  };

  // 두 색을 섞는다. `t`=0 이면 a, 1 이면 b.
  // `tint` 는 흰/검 방향으로만 밀 수 있어서, "재질감은 남기고 진영색을 섞는다"를 못 한다
  // (예: 털가죽 갈색에 진영색을 절반 섞기). 그 자리를 위해 둔다.
  UI.mix = function (a, b, t) {
    t = Math.max(0, Math.min(1, t));
    var ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    var br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return ((((ar + (br - ar) * t) | 0) << 16) |
            (((ag + (bg - ag) * t) | 0) << 8) |
            (((ab + (bb - ab) * t) | 0)));
  };

  //  ── 재질 3단을 '색'이 아니라 '이름'으로 찾는다 (2026-08-07) ──────────────────
  //  `UI.tint(c, ±f)` 는 **흑백 축으로만** 민다. 이 파일이 `deriveMatTones` 주석에
  //  스스로 적어 뒀듯 그렇게 밀면 **그늘이 회색이 되어 재질이 죽는다** — 그런데 정작
  //  전략 유닛 장비는 거의 전부 `tint` 로 명암을 만들고 있었다(늪지기 단지 `tint(clay,-0.30)`,
  //  늪지기 삿갓 `tint(rope,-0.22)`, 쇠뇌 방벽 `tint(wood,±)` …).
  //
  //  → 색값이 MAT 토큰이면 그 토큰의 **Lite/Dark 짝**을 돌려주고, 아니면 `deriveMatTones`
  //    와 **같은 계수**로 warm/cool 을 유도한다. 두 벌이 갈라지면 테마를 바꿨을 때
  //    장비만 색이 튄다(이 파일이 이미 겪은 사고다).
  //
  //  ⚠ **진영색에는 쓰지 않는다.** `tint(color, ±)` 자리는 그대로 둔다 — 진영색을
  //    노랑/파랑으로 밀면 아군·적군 구분이 흐려진다. 이건 **재질 축 전용**이다.
  var TONE_CACHE = null, TONE_STAMP = null;
  function toneIndex() {
    //  MAT 은 테마 전환(`deriveMatTones`)으로 갈아끼워진다 → 값이 바뀌면 표를 다시 만든다.
    //  도장(stamp)은 대표 토큰 몇 개면 충분하다(전부 비교하면 매 호출이 비싸진다).
    var stamp = M.wood + ':' + M.bone + ':' + M.stone + ':' + M.iron + ':' + M.blade;
    if (TONE_CACHE && TONE_STAMP === stamp) return TONE_CACHE;
    var idx = {}, k, base, li, dk;
    for (k in M) {
      if (/(Lite|Dark|Rim)$/.test(k)) continue;
      li = M[k + 'Lite']; dk = M[k + 'Dark'];
      if (k === 'shell') { li = M.shellLite; dk = M.shellRim; }
      base = M[k];
      if (typeof base !== 'number') continue;
      //  같은 색값을 쓰는 토큰이 둘 있으면(coinBronze == bronze 등) 먼저 온 쪽이 이긴다.
      if (idx[base] === undefined) idx[base] = { lite: li, dark: dk };
    }
    TONE_CACHE = idx; TONE_STAMP = stamp;
    return idx;
  }
  function warmTone(c, f) {                      // 밝게 + 노랑 쪽 (deriveMatTones 와 동일)
    var r = (c >> 16) & 255, g2 = (c >> 8) & 255, b = c & 255;
    r += (255 - r) * f; g2 += (255 - g2) * f * 0.92; b += (255 - b) * f * 0.66;
    return ((r | 0) << 16) | ((g2 | 0) << 8) | (b | 0);
  }
  function coolTone(c, f) {                      // 어둡게 + 파랑 쪽
    var r = (c >> 16) & 255, g2 = (c >> 8) & 255, b = c & 255;
    r *= (1 - f); g2 *= (1 - f * 0.94); b *= (1 - f * 0.80);
    return ((r | 0) << 16) | ((g2 | 0) << 8) | (b | 0);
  }
  UI.lit = function (col, f) {
    var e = toneIndex()[col];
    if (e && typeof e.lite === 'number' && f === undefined) return e.lite;
    return warmTone(col, f === undefined ? 0.28 : f);
  };
  UI.shade = function (col, f) {
    var e = toneIndex()[col];
    if (e && typeof e.dark === 'number' && f === undefined) return e.dark;
    return coolTone(col, f === undefined ? 0.34 : f);
  };

  //  ── 광원 하이라이트 한 점 (2026-08-07) ──────────────────────────────────────
  //  `UI.LIGHT` 는 좌상단에서 온다고 명문화돼 있는데, 그것을 읽는 곳이 `eggBody` 의
  //  리스광과 접지 그림자 **둘뿐**이었다. 투구·무기·등짐은 광원이 있는 줄도 몰랐다 —
  //  그게 "장비가 평평하다"의 코드상 원인이다.
  //
  //  ⚠ **도형 하나로 끝낸다.** 리스광처럼 호를 그리면 유닛 하나당 호출이 크게 는다
  //    (v1.66 의 결론: 이 게임에서 믿을 지표는 프레임당 그리기 호출 수다).
  //  ⚠ 호출부가 `r < 9` 를 걸러 준다(LOD). 여기서도 한 번 더 막는다.
  //  w/h 는 하이라이트 타원의 **지름**이다(fillEllipse 계약과 같게).
  UI.sheen = function (g, cx, cy, w, h, a, col) {
    if (!(w > 0.8) || !(h > 0.8) || !(a > 0.02)) return;
    var L = UI.LIGHT;
    g.fillStyle(col === undefined ? L.key : col, a);
    g.fillEllipse(cx + L.dir.x * w * 0.22, cy + L.dir.y * h * 0.22, w, h, 8);
  };

  // ── 달걀 외곽선 ───────────────────────────────────────────────
  // 위는 좁고 아래는 넓다. 반높이 r, 최대 반폭 ≈ 1.04 * r * wide
  // lean : 보행 기울기. 발밑을 축으로 꼭대기를 lean 만큼 민다(전단 변형).
  //  ⚠⚠ **버퍼를 돌려 쓴다** (2026-08-04 렉 조사 결과).
  //    예전에는 호출마다 배열 하나 + 점 객체 20개를 **새로** 만들었다. 이 함수는
  //    유닛 하나를 그릴 때 여러 번 불리고(윤곽·밝은 면·리스광), `UI.inkLayer` 가
  //    몸통 그리기를 **두 번** 돌리므로 다시 두 배다. 유닛 26기 × 60fps 면
  //    초당 수십만 개의 단명 객체가 된다.
  //    실측(tools/stall-probe.js): 힙이 프레임마다 ±10~30MB 로 요동쳤고 그 자리에
  //    460~757ms 스톨이 붙어 있었다 — **사용자가 신고한 렉의 정체는 GC 였다.**
  //
  //  ⚠ 풀을 쓰려면 **호출부가 결과를 오래 들고 있으면 안 된다.** 이 함수의 결과는
  //    전부 그 자리에서 `fillPoints`/`strokePoints` 로 넘겨 소비된다(확인함).
  //    한 번에 살아 있어야 하는 최대 개수는 `eggBody` 의 outer + litPts = 2 개인데,
  //    여유를 크게 둬서 **8벌**을 돌린다. 프레임을 넘겨 보관하는 호출부가 새로
  //    생기면 이 전제가 깨진다 — 그럴 땐 `copy: true` 를 넘겨 새 배열을 받을 것.
  var EGG_POOL = [], EGG_AT = 0;
  //  리스광 구간용 스크래치 — 매 프레임 유닛마다 새로 만들지 않는다(위 주석 참조).
  //  길이는 고정이다: 좌상단 호 6점(10~15), 우하단 바운스 5점(1~5).
  var RIM_KEY = [], RIM_BOUNCE = [], _ri;
  for (_ri = 0; _ri < 6; _ri++) RIM_KEY.push({ x: 0, y: 0 });
  for (_ri = 0; _ri < 5; _ri++) RIM_BOUNCE.push({ x: 0, y: 0 });
  UI.eggPoints = function (cx, cy, r, wide, n, lean, copy) {
    var N = n || 20, i, a, y, w, f, pts, p;
    wide = wide || 0.78;
    lean = lean || 0;
    if (copy) {
      pts = [];
      for (i = 0; i < N; i++) pts.push({ x: 0, y: 0 });
    } else {
      //  같은 길이의 버퍼만 재사용한다(길이가 다르면 새로 만들어 자리에 꽂는다).
      pts = EGG_POOL[EGG_AT];
      if (!pts || pts.length !== N) {
        pts = [];
        for (i = 0; i < N; i++) pts.push({ x: 0, y: 0 });
        EGG_POOL[EGG_AT] = pts;
      }
      EGG_AT = (EGG_AT + 1) % 8;
    }
    for (i = 0; i < N; i++) {
      a = (Math.PI * 2 / N) * i;
      y = -Math.cos(a) * r;
      w = 1 - 0.30 * Math.cos(a);
      f = (r - y) / (2 * r);                     // 꼭대기 1 → 바닥 0
      p = pts[i];
      p.x = cx + Math.sin(a) * r * wide * w + lean * f;
      p.y = cy + y;
    }
    return pts;
  };

  // ── 아트 정의표 ───────────────────────────────────────────────
  //  helm  : 머리 위 실루엣 (가장 강한 구분 신호)
  //  gear  : 손에 든 것 / 앞 레이어
  //  back  : 몸 뒤 레이어 (화살통·망토 등)
  //  face  : 'open' | 'slit' | 'none'
  //  wide  : 달걀 가로 비율 (체급 표현)
  //  fam   : 계급(유닛 레벨) 장식의 **재료 계열** [L2~3, L4~5] — 2026-08-07 신설.
  //          ⚠ 예전엔 열 종류가 전부 청동→강철 하나였다. 실측(`tools/unit-art-sheet.js
  //            mode=lv`)에서 L5 가 되면 열 종류가 **같은 은색 관을 쓴 계란**이 되어
  //            "종류는 실루엣이 전담한다"는 제1원칙이 무너졌다. 유닛마다 자기 재료를 준다.
  //          ⚠ 전부 중립 재질색이다. `leaf`(초록)는 **못 쓴다** — 진영색 민트(165°)·
  //            녹청(168°)과 색역이 겹친다(설계 경계 5번).
  UI.ART = {
    // ── 전략가 유닛 10종 ──
    warrior:  { helm: 'pot',     gear: 'sword',      back: null,     face: 'open', wide: 0.80, fam: ['bronze', 'blade'] },
    archer:   { helm: 'band',    gear: 'bow',        back: 'quiver', face: 'open', wide: 0.74, fam: ['bone', 'boneLite'] },
    slinger:  { helm: 'cap',     gear: 'sling',      back: 'pouch',  face: 'open', wide: 0.76, fam: ['stone', 'stoneLite'] },
    spearman: { helm: 'hood',    gear: 'javelin',    back: null,     face: 'open', wide: 0.74, fam: ['bone', 'boneLite'] },
    herbalist:{ helm: 'leaf',    gear: 'leafstaff',  back: 'pack',   face: 'open', wide: 0.76, fam: ['wood', 'bone'] },
    shieldman:{ helm: 'bucket',  gear: 'towerShield',back: null,     face: 'slit', wide: 0.86, fam: ['iron', 'blade'] },
    chieftain:{ helm: 'horns',   gear: 'handaxe',    back: 'cape',   face: 'open', wide: 0.78, fam: ['bronze', 'blade'] },
    bogman:   { helm: 'sedge',   gear: 'sapjar',     back: null,     face: 'open', wide: 0.78, fam: ['stone', 'stoneLite'] },
    ballista: { helm: 'pot',     gear: 'crossbowNest', back: null,   face: 'open', wide: 0.80, squat: true, fam: ['iron', 'blade'] },
    snaretrap:{ ground: 'spiketrap' },

    // ── 수성의 탑 확장 4종 (2026-08-08) ──────────────────────────────────────
    //  ⚠ 넷 다 **투구부터** 기존 열 종과 갈라 놨다(실루엣 제1원칙). 뿔은 족장이,
    //    통투구는 방패병이, 잎은 약초꾼이 이미 쓰고 있어서 쐐기·널빤지·알껍질·천감개로 갔다.
    reflector:  { helm: 'wedge',    gear: 'shellGuard', back: null,    face: 'slit', wide: 0.84, fam: ['iron', 'blade'] },
    palisade:   { helm: 'plank',    gear: 'stakes',     back: null,    face: 'open', wide: 0.84, squat: true, fam: ['wood', 'stone'] },
    shellwright:{ helm: 'shellcap', gear: 'shellPlate', back: 'pack',  face: 'open', wide: 0.76, fam: ['bone', 'boneLite'] },
    hammer:     { helm: 'ragwrap',  gear: 'stoneMaul',  back: null,    face: 'open', wide: 0.80, fam: ['stone', 'stoneLite'] },
    //  ── 확장 2차 (2026-08-08) ──
    hivethrower:{ helm: 'veil',     gear: 'hive',       back: null,    face: 'open', wide: 0.78, fam: ['clay', 'bronze'] },
    vinewhip:   { helm: 'thorncrown', gear: 'vinelash', back: null,    face: 'open', wide: 0.78, fam: ['wood', 'bone'] },
    //  ── 확장 3차 (2026-08-08) ──
    ashthrower: { helm: 'ashhood',  gear: 'ashpouch',   back: 'pouch', face: 'open', wide: 0.76, fam: ['stone', 'stoneLite'] },
    stonepiler: { helm: 'cairnhat', gear: 'cairn',      back: null,    face: 'open', wide: 0.84, fam: ['stone', 'bronze'] },
    knotter:    { helm: 'knothood', gear: 'knotrope',   back: null,    face: 'open', wide: 0.78, fam: ['rope', 'leather'] },
    emberthrower:{ helm: 'sparkcap', gear: 'firepot',  back: 'pouch', face: 'open', wide: 0.76, fam: ['clay', 'bronze'] },

    // ── 영웅 3종 ──
    berserker:{ helm: 'onehorn', gear: 'greatsword', back: 'fur',    face: 'open', wide: 0.82, hero: true },
    hunter:   { helm: 'wolf',    gear: 'longbow',    back: 'quiver', face: 'open', wide: 0.72, hero: true },
    guardian: { helm: 'crest',   gear: 'hookShield', back: 'cape',   face: 'slit', wide: 0.88, hero: true }
  };

  // units.js / heroes.js 에 art 를 아직 안 넣었을 때를 위한 안전망.
  UI.LEGACY_ART = {
    square: 'warrior', triangle: 'archer', diamond: 'slinger', hex: 'spearman',
    cross: 'herbalist', shield: 'shieldman', star: 'chieftain',
    bunker: 'ballista', mine: 'snaretrap'
  };

  UI.artOf = function (def) {
    return UI.ART[def.art] || UI.ART[UI.LEGACY_ART[def.shape]] || UI.ART.warrior;
  };

  // ── 계급(유닛 레벨) ───────────────────────────────────────────────────────
  //  수성의 탑에서 유닛 종류를 1~5 레벨로 키울 수 있다(`js/unitlevel.js`).
  //  아트는 **`def.lv` 만 읽는다** — 호출부(battle/build/draft/versus… 6개 파일)를
  //  하나도 안 건드리기 위해서다. lv 를 안 실은 def 는 전부 1 이라 지금과 픽셀 단위로 같다.
  UI.rankOf = function (def) {
    if (!def) return 1;
    var lv = def.lv;
    if (typeof lv !== 'number' || !isFinite(lv)) return 1;
    if (lv < 1) return 1;
    if (lv > 5) return 5;
    return Math.floor(lv);
  };

  // ============================================================================
  //  8방향
  // ============================================================================
  //  연속 facing(라디안, 로직 평면 기준: 0=우, +PI/2=아래=관객 쪽)을 45° 로 스냅한다.
  //  i : 0 E / 1 SE / 2 S / 3 SW / 4 W / 5 NW / 6 N / 7 NE
  //
  //  D 필드
  //   fx,fy   정면 단위벡터(화면 좌표, y 는 TILT 적용)
  //   px,py   측면 단위벡터(오른손 기준 캐릭터 왼쪽)
  //   lat     화면 좌우 성향  +1 오른쪽 / -1 왼쪽 / 0 정면·정배면
  //   toward  관객 쪽 성향    +1 정면 … -1 정배면
  //   front / back / profile  묶음 판정
  UI.DIR8_NAME = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
  UI.DIR8_KO   = ['우', '우하', '아래', '좌하', '좌', '좌상', '위', '우상'];

  UI.dir8 = function (facing, T) {
    var f = (typeof facing === 'number' && isFinite(facing)) ? facing : Math.PI / 2;
    T = (typeof T === 'number' && isFinite(T)) ? T : 1;
    var i = Math.round(f / (Math.PI / 4));
    i = ((i % 8) + 8) % 8;
    var ang = i * (Math.PI / 4);
    var c = Math.cos(ang), s = Math.sin(ang);
    if (Math.abs(c) < 1e-9) c = 0;
    if (Math.abs(s) < 1e-9) s = 0;
    return {
      i: i, ang: ang,
      fx: c, fy: s * T,
      px: -s, py: c * T,
      lat: c > 0.1 ? 1 : (c < -0.1 ? -1 : 0),
      toward: s,
      front: s > 0.3,
      back: s < -0.3,
      profile: (i === 0 || i === 4)
    };
  };

  // 구버전 호환: 숫자(fx)로 들어와도 죽지 않게 D 로 승격시킨다.
  UI.asDir = function (d, T) {
    if (d && typeof d === 'object' && typeof d.i === 'number') return d;
    if (typeof d === 'number' && isFinite(d)) return UI.dir8(d >= 0 ? 0 : Math.PI, T);
    return UI.dir8(Math.PI / 2, T);
  };

  // ============================================================================
  //  보행 위상
  // ============================================================================
  //  walk : number(위상 라디안) | { phase, amp } | null | undefined
  //  amp 0..1 — 멈출 때 0 으로 수렴시키면 정지 포즈로 부드럽게 돌아온다.
  //  반환 null → v1 과 완전히 동일하게 그린다.
  UI.gait = function (walk, art) {
    if (walk === null || walk === undefined) return null;
    if (art && (art.squat || art.ground)) return null;      // 진지·설치물은 안 걷는다
    var phase, amp = 1;
    if (typeof walk === 'number') { phase = walk; }
    else if (typeof walk === 'object') {
      phase = walk.phase;
      if (walk.amp !== undefined) amp = walk.amp;
    } else return null;
    if (typeof phase !== 'number' || !isFinite(phase)) return null;
    if (typeof amp !== 'number' || !isFinite(amp) || amp <= 0.02) return null;
    if (amp > 1) amp = 1;

    var s = Math.sin(phase), c = Math.cos(phase);
    return {
      phase: phase, amp: amp,
      bob:  -Math.abs(s) * 0.085 * amp,    // 상하 (음수 = 위로)
      sway: -s * 0.055 * amp,              // 지지발 쪽으로 흔들림 (측면축에 곱함)
      lean: -s * 0.10 * amp,               // 상체 좌우 기울기 (측면축)
      pitch: -c * 0.055 * amp,             // 상체 앞뒤 기울기 (정면축)
      arm:  c * 0.10 * amp,                // 팔(무기) 앞뒤
      legFA:   [-c * amp, c * amp],                                  // 다리 앞뒤
      legLift: [Math.max(0, s) * amp, Math.max(0, -s) * amp]         // 다리 들림
    };
  };

  // 호출부 편의 헬퍼 — 유닛의 실제 이동량으로 위상을 굴린다.
  //  battle.js 의 drawWorld 안에서 유닛마다 한 번씩 부르면 된다.
  //    var walk = GAME.UI.updateGait(u, dtMs);
  //    GAME.UI.drawUnit(g, u.def, u.x, u.y, color, 1, u.facing, walk);
  UI.GAIT_PER_PX = 0.055;   // 1px 이동 = 위상 0.055rad → 약 114px 마다 한 걸음
  UI.GAIT_FULL_SPEED = 60;  // 이 속도(px/s) 이상이면 진폭 100%

  UI.updateGait = function (u, dtMs) {
    if (!u) return null;
    var art = u.def ? UI.artOf(u.def) : null;
    if (!art || art.ground || art.squat || (u.def && u.def.immobile)) { u._gaitAmp = 0; return null; }
    if (u.alive === false) { u._gaitAmp = 0; return null; }

    var dt = (typeof dtMs === 'number' && isFinite(dtMs) && dtMs > 0) ? Math.min(dtMs, 200) : 16;
    var d = 0;
    if (typeof u._gaitPX === 'number') {
      var dx = u.x - u._gaitPX, dy = u.y - u._gaitPY;
      d = Math.sqrt(dx * dx + dy * dy);
      if (d > 200) d = 0;                      // 순간이동(리스폰·넉백) 은 걸음으로 안 친다
    }
    u._gaitPX = u.x; u._gaitPY = u.y;

    if (typeof u._gaitPhase !== 'number') u._gaitPhase = Math.random() * 6.283;  // 군중이 로봇처럼 안 맞게
    if (typeof u._gaitAmp !== 'number') u._gaitAmp = 0;

    u._gaitPhase += d * UI.GAIT_PER_PX;
    if (u._gaitPhase > 1e6) u._gaitPhase %= 6.283185307179586;

    var v = d / (dt / 1000);
    var target = Math.min(1, v / UI.GAIT_FULL_SPEED);
    var k = Math.min(1, dt / 90);
    u._gaitAmp += (target - u._gaitAmp) * k;
    if (u._gaitAmp < 0.04) { u._gaitAmp = 0; return null; }
    return { phase: u._gaitPhase, amp: u._gaitAmp };
  };

  // ============================================================================
  //  아이들 애니메이션 — 호흡 + 주기적 공격
  // ============================================================================
  //  캐릭터 선택 화면처럼 **정지한 화면에서 고른 캐릭터만** 살아 있게 하는 포즈다.
  //  걸음걸이(gait)와 같은 규율을 그대로 따른다:
  //   · 상태를 만들지 않는다. 시간 t(ms)를 인자로 받고, 같은 t 면 같은 그림이 나온다.
  //   · idle 을 안 넘기면 null → 지금과 픽셀 단위로 동일하다(회귀 위험 0).
  //
  //  왜 상하 이동만으로는 부족한가:
  //  몸이 달걀이라 **위아래로 통째로 뜨면 "떠 있는 알"** 로 보인다. 실제 호흡은
  //  부피가 유지된 채 형태가 바뀌는 것이라, 발밑을 고정한 스쿼시&스트레치
  //  (세로 ky 배 ↔ 가로 1/ky 배, 면적 보존)에 아주 작은 상하 이동을 얹는다.
  //  머리 장식은 **알 꼭대기가 움직인 만큼** 같이 움직여야 목이 늘어나 보이지 않는다.
  //
  //  공격은 무기마다 다르게 나가야 하므로 여기서는 -1..+1 짜리 스칼라 하나(atk)만 만들고,
  //  그 값을 어떻게 쓸지는 `eggGear` 의 무기별 분기가 정한다
  //  (대검=휘두르는 각도 / 활=시위 당김·발사 / 갈고리창=찔러넣기).
  UI.IDLE_BREATH_MS = 2600;   // 호흡 한 번 (2~3초)
  UI.IDLE_CYCLE_MS  = 2800;   // 공격 주기 — 호흡과 서로소에 가깝게 둬 박자가 겹치지 않는다
  UI.IDLE_SWING_MS  = 820;    // 한 번 휘두르는 데 걸리는 시간

  //  u 0..1 → -1(끝까지 당김) → +1(때린 순간) → 0(회수)
  //  때리는 구간(0.38~0.52)만 짧고 빠르다 — 예비동작이 길고 타격이 빠른 것이 만화 타이밍.
  function swingK(u) {
    if (u < 0.38) return -Math.sin(u / 0.38 * Math.PI * 0.5);
    if (u < 0.52) return -1 + (u - 0.38) / 0.14 * 2;
    return Math.cos((u - 0.52) / 0.48 * Math.PI * 0.5);
  }

  //  idle : number(ms) | { t, seed, amp, attack:false } | null | undefined
  UI.idlePose = function (idle, art) {
    if (idle === null || idle === undefined) return null;
    if (art && (art.ground || art.squat)) return null;   // 설치물·진지는 숨쉬지 않는다
    var t, seed = 0, amp = 1, atkOn = true;
    if (typeof idle === 'number') { t = idle; }
    else if (typeof idle === 'object') {
      t = idle.t;
      if (typeof idle.seed === 'number') seed = idle.seed;
      if (typeof idle.amp === 'number') amp = idle.amp;
      if (idle.attack === false) atkOn = false;
    } else return null;
    if (typeof t !== 'number' || !isFinite(t)) return null;
    if (typeof amp !== 'number' || !isFinite(amp) || amp <= 0.02) return null;
    if (amp > 1) amp = 1;

    var br = Math.sin((t / UI.IDLE_BREATH_MS + seed) * 6.283185307179586);
    var k = 0;
    if (atkOn) {
      var c = t % UI.IDLE_CYCLE_MS;
      if (c < 0) c += UI.IDLE_CYCLE_MS;
      if (c < UI.IDLE_SWING_MS) k = swingK(c / UI.IDLE_SWING_MS);
    }
    var kp = k > 0 ? k : 0, kn = k < 0 ? -k : 0;
    return {
      ky:    1 + 0.065 * br * amp,                              // 세로 배율(발밑 고정)
      rise:  (-0.038 * br + 0.055 * kp - 0.022 * kn) * amp,     // 몸 전체 상하 (음수 = 위)
      lean:  k * 0.10 * amp,                                    // 측면축 기울기
      pitch: k * 0.06 * amp,                                    // 정면축 기울기
      reach: 1 + (kp * 0.16 - kn * 0.08) * amp,                 // 팔 뻗음
      atk:   k * amp
    };
  };

  // ── 전투 모션 (2026-07-31, 사용자 지시: "공격모션과 스킬모션 만들어줘 일단 영웅한테만") ──
  //
  //  `idlePose` 가 **주기함수**(2.8초마다 저절로 휘두른다)라면 이건 **이벤트**다.
  //  둘을 한 함수에 넣지 않은 이유가 그것이다 — 합치면 "선택 화면의 반복 재생"이
  //  전장으로 새어 들어온다. 카드 화면은 지금처럼 idle 만 쓰고, 전장은 여기를 쓴다.
  //
  //  ## 예비 동작을 판정을 안 건드리고 만드는 법
  //  `Combat.fire()` 는 때린 뒤 `u.cd = def.cooldown` 으로 리셋한다. 즉 **남은 쿨타임이
  //  곧 다음 타격까지 남은 시간**이라, 렌더가 그걸 읽기만 해도 진짜 예비 동작이 된다.
  //  `cd <= 0` 이면 감은 채 멈춘다 — "장전됐다, 사거리에 들어오면 친다"가 사실 그대로다.
  //
  //  ⚠ **예비 동작으로 피해를 늦추지 않는다.** `castSkill` 은 시전 프레임에 피해를 넣는데,
  //    거기에 windup 을 넣으면 그건 아트가 아니라 밸런스 변경이다(쿨 경제·회피 판정·
  //    regress.js 의 R-1/R-3/R-4/R-5 기준선이 전부 같이 움직인다). 지연이 이미 있는
  //    타입(aoeTarget 의 telegraph, aura 의 duration, 투사체 비행)에서만 예비가 진짜다.
  //    나머지는 정직하게 짧은 스매어로 두고 공정성 신호는 `skillfx` 에 맡긴다.
  //
  //  ## 기울기(lean/pitch)를 주 신호로 쓰지 않는 이유 — 8방향 중 2방향에서 사라진다
  //  `drawEggChar` 는 `lean_px = r*(lean*D.px + pitch*D.fx)` 로 합치는데
  //  `D.px = -sin θ`, `D.fx = cos θ` 이므로
  //      lean_px = r·k·√(A²+B²)·sin(θ + φ),   φ = atan2(B, A)
  //  **영점이 θ = -φ 와 180°-φ 두 곳에 생긴다.** 8방향은 45° 스냅이라 φ 가 45°의
  //  홀수배 근처면 영점이 스냅각과 정확히 겹쳐 그 두 방향에서 기울기가 0 이 된다.
  //  이건 이 파일이 볏·깃발에서 이미 두 번 겪은 사고(정면에서 신호가 사라짐)와 같은 계열이다.
  //  → **φ 를 67.5° 로 고정**한다(B/A = tan67.5° = 2.414). 그러면 8방향에서
  //    |sin(θ+φ)| ∈ {0.383, 0.924} 이라 최악에서도 진폭의 38.3% 가 남는다.
  //  → 그리고 주 신호는 방향 무관 채널(ky·rise·reach·무기각 atk)이 맡는다.
  var TAN675 = 2.414213562373095;

  //  영웅별 모션 상수. **아트 수치라 heroes.js 가 아니라 여기 둔다** — heroes.js 를
  //  건드리면 통곡의 탑 회귀를 다시 돌려야 한다(CLAUDE.md). 이 값들은 밸런스가 아니다.
  UI.ACT = {
    //  WIND : 예비 동작 길이  ·  DUR : 모션 총 길이  ·  A : 기울기 진폭(측면축)
    //  B = A × TAN675 로 자동 계산한다 — φ 를 손으로 적으면 어긋난다.
    //  kyLo/kyHi : 이 아트의 눌림 한계(생략하면 전역 0.78~1.20).
    berserker: { wind: 240, dur: 600, A: 0.120 },   // 큰 각 — 대검이 주 신호
    hunter:    { wind: 200, dur: 420, A: 0.092 },   // 가장 얕다 — 몸을 안 쓰는 게 정체성
    guardian:  { wind: 300, dur: 620, A: 0.099 },   // 느리게 감고 버틴다
    _default:  { wind: 200, dur: 480, A: 0.100 },

    //  ── 전략 유닛 (2026-08-07) ──────────────────────────────────────────────
    //  실측(`tools/unit-art-sheet.js`)에서 본 것: 유닛은 전장에서 **걸음걸이 말고는
    //  아무것도 안 움직인다.** `updateAct` 가 `!u.isHero` 한 줄로 통째로 막고 있었다.
    //  그래서 영웅 옆에 서면 유닛이 미끄러지는 정물처럼 보인다 — "영웅만 좋아 보인다"의
    //  가장 큰 몫이 여기다(그림 밀도가 아니라 **움직이는가**의 차이).
    //
    //  ⚠⚠ **ky 를 영웅보다 좁게 간다(0.90~1.10).** `eggBody` 는 면적 보존으로 가로를
    //    1/ky 로 늘리는데, 유닛은 진형에서 `spacing` 38~41px 로 붙어 선다. 영웅 폭
    //    (0.84~1.10)을 그대로 주면 폰(`UNIT_DRAW_SCALE` 1.30)에서 옆 유닛과 겹친다 —
    //    이 파일이 KY_MIN/MAX 주석에 적어 둔 그 사고를 유닛 수만큼 반복하게 된다.
    //  ⚠ 진폭(A)도 영웅보다 얕다. 화면에 유닛이 15~25기라, 영웅 한 명과 같은 폭으로
    //    흔들면 전장이 통째로 출렁인다.
    //  ⚠ `dur` 는 여기 값과 **쿨타임의 90%** 중 작은 쪽이다(`updateAct`). 쇠뇌 진지는
    //    쿨이 420ms 뿐이라 이 상한이 없으면 모션이 다음 발사를 덮는다.
    warrior:   { wind: 190, dur: 400, A: 0.085, kyLo: 0.90, kyHi: 1.10 },  // 단검 — 짧고 빠르다
    archer:    { wind: 220, dur: 420, A: 0.060, kyLo: 0.92, kyHi: 1.08 },  // 시위 — 몸을 거의 안 쓴다
    slinger:   { wind: 240, dur: 460, A: 0.090, kyLo: 0.90, kyHi: 1.10 },  // 무릿매 — 크게 돌린다
    spearman:  { wind: 260, dur: 440, A: 0.075, kyLo: 0.92, kyHi: 1.08 },  // 작살 — 길게 겨눈다
    herbalist: { wind: 200, dur: 460, A: 0.055, kyLo: 0.93, kyHi: 1.08 },  // 안 싸운다 — 가장 얕다
    shieldman: { wind: 280, dur: 460, A: 0.070, kyLo: 0.92, kyHi: 1.08 },  // 무겁다
    chieftain: { wind: 200, dur: 430, A: 0.088, kyLo: 0.90, kyHi: 1.10 },  // 손도끼
    bogman:    { wind: 230, dur: 450, A: 0.078, kyLo: 0.92, kyHi: 1.08 },  // 단지를 던진다
    //  ⚠ 쇠뇌 진지는 **고정물**이다. `updateAct` 가 `drift` 를 0 으로 막는다 —
    //    못 움직이는 것이 이 유닛의 값인데 그림이 앞으로 미끄러지면 거짓말이 된다.
    ballista:  { wind: 110, dur: 330, A: 0.050, kyLo: 0.94, kyHi: 1.06 },

    //  ── 3단계 확장 10종 (2026-08-09) ────────────────────────────────────────
    //  ⚠ **여기 항목이 없으면 `updateAct` 가 `!u.isHero && !UI.ACT[art]` 한 줄로
    //    통째로 막는다** — 2026-08-08 에 들어온 열 종이 정확히 그 상태였다(공격 모션이
    //    한 번도 안 떴다). `actPose` 는 `_default` 로 폴백하므로 **에러도 안 나고**
    //    조용히 열 종이 다 똑같이 움직이는(=안 움직이는) 상태가 된다.
    //    유닛을 늘리면 이 표도 같이 늘린다 — `tools/bake-sprites.js` 가 이걸 검사한다.
    //  ⚠ 규율은 위 아홉 종과 같다: `A` 0.055~0.090 · `kyLo/kyHi` 0.90~1.10.
    //  ⚠ **구운 그림에서 실제로 갈라지는 축은 (A, kyLo, kyHi) 셋뿐이다.**
    //    `wind` 는 예비 프레임이 늘 완전히 감긴 상태(w=1)라 안 보이고, `dur` 는
    //    복귀 프레임을 비율(v=0.6)로 잡으면 상쇄돼 사라진다. 그래서 열 종의
    //    (A, kyLo, kyHi) 를 **위 아홉 종까지 포함해 전부 다르게** 잡았다.
    //    (예: 망치 kyHi 를 1.10 이 아니라 1.09 로 둔 것은 투석꾼과 겹치지 않게 하려는 것이다)
    reflector:   { wind: 270, dur: 380, A: 0.062, kyLo: 0.90, kyHi: 1.06 },  // 되받이 — 막았다 튕긴다. 몸은 안 젖히고 눌렸다 편다
    palisade:    { wind: 300, dur: 500, A: 0.058, kyLo: 0.90, kyHi: 1.04 },  // 울짱꾼 — 말뚝을 박는다. 고정물이라 기울기가 가장 작다
    shellwright: { wind: 210, dur: 470, A: 0.056, kyLo: 0.94, kyHi: 1.10 },  // 껍질장이 — 안 싸운다(덧대 준다). 약초꾼 계열로 얕게
    hammer:      { wind: 320, dur: 480, A: 0.090, kyLo: 0.90, kyHi: 1.09 },  // 망치잡이 — 가장 크게 감고 가장 깊게 눌린다. 무거워 위로는 덜 편다
    hivethrower: { wind: 180, dur: 360, A: 0.072, kyLo: 0.91, kyHi: 1.09 },  // 벌집꾼 — 가볍고 빠르다(가장 짧다)
    vinewhip:    { wind: 250, dur: 440, A: 0.086, kyLo: 0.93, kyHi: 1.07 },  // 덩굴채 — 크게 휘두르되 몸은 얇게 쓴다
    ashthrower:  { wind: 200, dur: 400, A: 0.058, kyLo: 0.92, kyHi: 1.10 },  // 잿가루꾼 — 손목으로 뿌린다. 위로 펴는 쪽
    stonepiler:  { wind: 290, dur: 490, A: 0.080, kyLo: 0.90, kyHi: 1.08 },  // 돌쌓이 — 돌을 들었다 내린다. 망치보다 한 단계 아래
    knotter:     { wind: 230, dur: 420, A: 0.055, kyLo: 0.95, kyHi: 1.05 },  // 매듭지기 — 손끝 작업. 열 종 중 가장 얕다
    emberthrower:{ wind: 240, dur: 410, A: 0.076, kyLo: 0.91, kyHi: 1.10 }   // 불씨꾼 — 던진다. 뒤로 젖혔다 앞으로
  };

  //  능력 타입 → 스킬 포즈. 유닛의 능력은 슬롯(QWER)이 아니라 `def.ability.type` 이다.
  //  ⚠ 여기 없는 타입은 **조용히 null** 이 되고 모션이 안 뜬다(에러도 안 난다) —
  //    영웅 슬롯 매핑이 파수꾼 오라를 그렇게 잃었던 그 자리다. 감사가 이 표를 직접 본다.
  UI.ABIL_POSE = {
    charge: 'dash',          // 달려들기 · 방패 돌진 — 몸이 뒤늦게 따라붙는다
    barrage: 'aoeTarget',    // 예고 폭격 — 팔을 든 채 유지(유일하게 진짜 예비가 있는 타입)
    shockwave: 'aoeSelf',    // 자기중심 파동 — 눌렸다 펴진다
    healBurst: 'buff',       // 약초꾼 — 웅크렸다 부풀기
    warcry: 'aura',          // 족장 — 깃대를 땅에 꽂고 버틴다
    //  수성의 탑 신규 유닛 3종 (2026-08-20 — art-motion-audit ⑪-2 가 잡아 둔 누락)
    pull: 'pull',            // 덩굴채 — 팔을 뻗어 끌어당긴다(영웅 당기기와 같은 그림)
    ashcloud: 'aoeTarget',   // 잿가루꾼 — 지정 위치에 뿌린다(팔 든 채 유지)
    ember: 'projectile'      // 불씨꾼 — 던진다(짧고 빠른 무기각)
  };

  //  ky 는 이 범위를 벗어나면 안 된다. `eggBody` 가 면적을 보존하느라 가로를 1/ky 로
  //  늘리므로, 0.70 까지 눌리면 파수꾼 알 폭이 48 → 68.6px 가 되어 폰 근접 거리에서
  //  옆 유닛과 겹친다. 하한 0.78 · 상한 1.20 이 그 선이다.
  var KY_MIN = 0.78, KY_MAX = 1.20;
  function clampKy(v) { return v < KY_MIN ? KY_MIN : (v > KY_MAX ? KY_MAX : v); }
  function ease(u) { return u <= 0 ? 0 : (u >= 1 ? 1 : u * u * (3 - 2 * u)); }
  function clamp01(u) { return u < 0 ? 0 : (u > 1 ? 1 : u); }

  //  기본 공격의 k 곡선. u = 발동 후 경과 / 타격 길이.
  //  광전사는 정점을 **+0.82** 에 둔다 — `bladeDir(1.55 - atk*1.90)` 이 atk=+1 에서
  //  1.55-1.90 = -0.35 라 칼이 아래로 기울어 화면 최원점이 오히려 짧아진다.
  //  앞뒤축과 정확히 나란해지는 값이 1.55/1.90 = 0.816 이다. +1 은 그 뒤 추종에서 지나간다.
  var PEAK = { berserker: 0.82, hunter: 1.0, guardian: 1.0 };

  //  스킬 타입별 모션 길이(ms). 타입이 9종인데 그림이 하나면 "스킬을 썼다"만 알고
  //  **무엇을 썼는지**는 모른다 — 그건 모션이 아니라 깜빡임이다.
  //  ⚠ `castSkill` 은 시전 프레임에 피해를 넣는다. 여기 길이를 늘려도 피해는 안 늦는다
  //    (늦추면 그건 아트가 아니라 밸런스다). 그림만 뒤따라간다.
  UI.SKILL_DUR = {
    dash: 320, aoeSelf: 520, aoeTarget: 620, projectile: 240,
    buff: 520, pull: 520, trap: 460, aura: 480, strike: 560
  };

  //  타입마다 **주 신호를 하나씩** 다르게 잡는다. 셋 다 크게 움직이면 셋 다 안 읽힌다.
  //    돌진 = 몸이 뒤늦게 따라붙음(drift 음수)   ·  광역자기 = 눌렸다 펴짐(ky)
  //    광역지정 = 팔을 든 채 유지(reach·rise)     ·  투사체 = 짧고 빠른 무기각
  //    버프 = 웅크렸다 부풀기(ky 하나가 전부)      ·  당기기 = 팔 뻗음 0.80↔1.42
  //    덫 = 아래로 내려앉기(유일하게 아래로)       ·  오라 = 땅에 꽂고 유지(gearDrop)
  //    강타 = 박은 채 유지(reach 1.46)
  function skillPose(type, u, P) {
    var e = ease(u), fall = Math.cos(u * Math.PI * 0.5);
    if (type === 'dash') {
      var g1 = (1 - u) * (1 - u);
      P.ky = clampKy(1 - 0.14 * g1); P.drift = -1.20 * g1; P.atk = -0.5 * (1 - u);
      P.legF = 1.0 * (1 - u); P.legSpread = 0.50 * (1 - u); P.reach = 1 - 0.06 * g1;
    } else if (type === 'aoeSelf') {
      P.spin = Math.pow(clamp01((u - 0.12) / 0.58), 0.6);
      P.ky = clampKy(1 - 0.14 * Math.sin(Math.PI * P.spin));
      P.atk = u < 0.12 ? -1 : 0.4; P.reach = 1 + 0.18 * Math.sin(Math.PI * P.spin);
      P.rise = -0.06 * Math.sin(Math.PI * P.spin);
    } else if (type === 'aoeTarget') {
      // 유일하게 **진짜 예비**가 있는 타입 — 예고(telegraph)가 실제 지연이라 정직하다.
      var hold = u < 0.22 ? u / 0.22 : (u < 0.80 ? 1 : (1 - u) / 0.20);
      P.reach = 1 + 0.30 * hold; P.rise = -0.10 * hold;
      P.ky = clampKy(1 + 0.08 * hold); P.atk = -0.85 * hold;
    } else if (type === 'projectile') {
      P.atk = u < 0.25 ? -1 : (u < 0.42 ? -1 + 2 * ((u - 0.25) / 0.17) : (1 - (u - 0.42) / 0.58));
      P.reach = u < 0.25 ? 0.90 : 1 + 0.14 * (1 - u); P.drift = -0.12 * (1 - u);
      P.ky = clampKy(1 - 0.05 * Math.sin(Math.PI * u));
    } else if (type === 'buff') {
      P.ky = clampKy(u < 0.18 ? 1 - 0.16 * (u / 0.18)
                   : (u < 0.50 ? 0.84 + 0.34 * ease((u - 0.18) / 0.32)
                               : 1.18 - 0.18 * ease((u - 0.50) / 0.50)));
      P.rise = u < 0.18 ? 0.08 * (u / 0.18) : -0.12 * ease(clamp01((u - 0.18) / 0.32)) * fall;
      P.reach = u < 0.18 ? 0.84 : 1; P.atk = 0;
    } else if (type === 'pull') {
      P.reach = u < 0.14 ? 1 + 0.42 * (u / 0.14)
              : (u < 0.29 ? 1.42 : 1.42 - 0.62 * ease((u - 0.29) / 0.35));
      if (u >= 0.64) P.reach = 0.80 + 0.20 * ease((u - 0.64) / 0.36);
      P.atk = u < 0.29 ? 1 : 1 - 2 * ease((u - 0.29) / 0.71) * 0.6;
      P.ky = clampKy(1 - 0.06 * (u > 0.14 ? 1 : 0)); P.drift = u < 0.29 ? 0.14 : -0.10;
    } else if (type === 'trap') {
      var d = u < 0.26 ? u / 0.26 : (u < 0.52 ? 1 : 1 - ease((u - 0.52) / 0.48));
      P.ky = clampKy(1 - 0.22 * d); P.rise = 0.14 * d;
      P.reach = 1 + 0.36 * d; P.gearDrop = 0.30 * d; P.atk = -0.3 * d;
    } else if (type === 'aura') {
      var s2 = u < 0.33 ? u / 0.33 : 1;
      P.gearDrop = 0.44 * s2; P.reach = 1 + 0.20 * s2 - 0.28 * clamp01((u - 0.33) / 0.67);
      P.ky = clampKy(1 - 0.12 * s2); P.atk = -1 * s2; P.guard = 0.18 * s2;
    } else if (type === 'strike') {
      var h2 = u < 0.09 ? 0 : (u < 0.23 ? (u - 0.09) / 0.14 : (u < 0.54 ? 1 : fall));
      P.atk = -1 + 2 * h2; P.reach = 0.88 + 0.58 * h2;
      P.drift = -0.06 + 0.32 * h2; P.ky = clampKy(1.06 - 0.20 * h2);
    }
    return P;
  }

  //  act 를 포즈로 바꾼다. **순수 함수** — 같은 인자면 같은 반환(gait·idlePose 와 같은 규율).
  //  act : null | { art:'berserker'|…, t:ms(발동 후), wind:0..1, kind:'atk'|'skill', type:… }
  //  반환 키 중 ky/rise/lean/pitch/reach/atk 는 idlePose 와 같은 이름이라 합산할 수 있다.
  //  아트별 눌림 한계. 전략 유닛은 진형에서 붙어 서므로 영웅보다 좁다(`UI.ACT` 주석).
  function clampKyOf(v, C) {
    var lo = (C && C.kyLo) || KY_MIN, hi = (C && C.kyHi) || KY_MAX;
    if (lo < KY_MIN) lo = KY_MIN;
    if (hi > KY_MAX) hi = KY_MAX;
    return v < lo ? lo : (v > hi ? hi : v);
  }

  UI.actPose = function (act) {
    if (!act) return null;

    // ── 스킬 ── 기본 공격과 **다른 곡선**을 쓴다. 기울기(φ 고정)만 공유한다.
    if (act.kind === 'skill') {
      var Cs = UI.ACT[act.art] || UI.ACT._default;
      var ds = act.dur || UI.SKILL_DUR[act.type] || 480;
      if (typeof act.t !== 'number' || !isFinite(act.t) || act.t < 0 || act.t > ds) return null;
      var Ps = { ky: 1, rise: 0, reach: 1, atk: 0, drift: 0,
                 guard: act.art === 'guardian' ? 0.10 : 0,
                 gearDrop: 0, spin: 0, legF: 0, legSpread: 0 };
      skillPose(act.type, clamp01(act.t / ds), Ps);
      Ps.ky = clampKyOf(Ps.ky, Cs);
      if (Ps.drift > 1.4) Ps.drift = 1.4; else if (Ps.drift < -1.4) Ps.drift = -1.4;
      //  고정물은 **절대 안 움직인다.** 그림이 앞으로 미끄러지면 "저기 보이는데
      //  여기서 맞는다"가 되고, 못 움직이는 것이 이 유닛의 값인데 그게 거짓말이 된다.
      if (act.noDrift) Ps.drift = 0;
      Ps.lean = -Cs.A * Ps.atk;
      Ps.pitch = Cs.A * TAN675 * Ps.atk;
      return Ps;
    }
    var C = UI.ACT[act.art] || UI.ACT._default;
    var t = act.t, dur = act.dur || C.dur;
    if (typeof t !== 'number' || !isFinite(t) || t > dur) return null;
    var w = clamp01(act.wind || 0);
    var peak = PEAK[act.art] || 1;

    var k, ky = 1, rise = 0, reach = 1, drift = 0, guard = 0, gearDrop = 0, spin = 0;
    var legF = 0, legSpread = 0;

    if (t < 0) {
      // ── 예비 ── 아직 안 때렸다. w 가 1 에 가까울수록 완전히 감긴 상태.
      k = -Math.pow(w, act.art === 'guardian' ? 1 : 0.7);   // 파수꾼만 선형(느리다=무겁다)
      ky = clampKyOf(1 + 0.10 * w * (act.art === 'hunter' ? 0.5 : 1), C);
      rise = -0.05 * w;
      reach = 1 - 0.12 * w;
      drift = -0.10 * w;
      legF = -0.40 * w;
    } else {
      var strike = act.strike || 90;
      if (t < strike) {
        // ── 타격 ── 짧고 빠르다. 만화 타이밍의 핵심은 여기가 예비의 1/3 이라는 것.
        var u = t / strike;
        k = -1 + (1 + peak) * Math.pow(u, 0.55);
        ky = clampKyOf(1.10 - 0.26 * Math.sqrt(u), C);
        rise = -0.05 + 0.15 * u;
        reach = 1 + 0.34 * u;
        drift = -0.10 + 0.36 * u;
        legF = -0.40 + 0.95 * u;
      } else {
        // ── 추종·복귀 ── cos 로 부드럽게 0 으로. 파수꾼만 중간에 '버티는' 구간이 있다.
        var v = clamp01((t - strike) / (dur - strike));
        var hold = act.art === 'guardian' ? 0.38 : 0;   // 창을 박은 채 유지
        var fall = Math.cos(v * Math.PI * 0.5);
        k = peak * (hold ? (1 - (1 - hold) * ease(v)) : fall);
        ky = clampKyOf(0.84 + 0.16 * ease(v), C);
        rise = 0.10 * fall;
        reach = 1 + 0.34 * fall;
        drift = 0.26 * fall;
        legF = 0.55 * fall;
      }
    }

    // 파수꾼은 방패를 **절대 내리지 않는다**. 하한 0.10 이 그 약속이다.
    if (act.art === 'guardian') guard = 0.10 + 0.20 * (k > 0 ? k : 0);

    // 정면(D.fx≈0)에서는 legFA 가 화면에서 죽는다 — 옆으로 벌려 보완한다.
    legSpread = 0.50 * (legF > 0 ? legF : -legF);

    //  고정물(쇠뇌 진지)은 앞뒤로 미끄러지지 않는다 — 위 스킬 분기와 같은 이유다.
    if (act.noDrift) drift = 0;

    return {
      ky: ky, rise: rise, reach: reach, atk: k,
      lean: -C.A * k, pitch: C.A * TAN675 * k,   // φ = 67.5° 고정 (위 주석)
      drift: drift, guard: guard, gearDrop: gearDrop, spin: spin,
      legF: legF, legSpread: legSpread
    };
  };

  //  `updateGait` 의 형제. **렌더 전용 관측자** — combat 의 값을 읽기만 하고
  //  자기 상태는 `u._act*` 에만 쓴다(battle.js 의 `_juice` 가 `_prevHp` 를 쓰는 것과 같은 패턴).
  //  ⚠ combat 을 한 줄도 안 고친다. 이 경계를 깨면 렌더가 밸런스를 움직이게 된다.
  //  ── 2026-08-07 · **전략 유닛에도 연다** ─────────────────────────────────────
  //  예전 첫 줄은 `if (!u || !u.isHero || !u.alive)` 였다. 그 한 줄 때문에 전장의
  //  유닛 15~25기가 걸음걸이 말고는 아무것도 안 움직였다 — "영웅만 좋아 보인다"의
  //  가장 큰 몫이 그림 밀도가 아니라 **움직이는가**였다(실측 컨택트시트로 확인).
  //
  //  ⚠ **판정은 여전히 한 줄도 안 건드린다.** 이 함수는 `u.cd`/`u.abilCd` 를 **읽기만**
  //    하고 자기 상태는 `u._act*` 에만 쓴다(영웅과 같은 규약).
  //  ⚠ 아트 표(`UI.ACT`)에 항목이 있는 종류만 움직인다. 용 보스(`beast:…`)·가시덫
  //    (`snaretrap`)은 항목이 없어 예전처럼 조용히 null 이다 — 회귀 위험 0.
  UI.updateAct = function (u, dtMs) {
    if (!u || !u.alive) { if (u) u._act = null; return null; }
    // ⚠ `u.def.art` 를 먼저 보면 안 된다 — `createHero` 의 def 는 **화이트리스트**라
    //   `art` 가 거기 없다(CLAUDE.md 가 chargeKnock 으로 이미 경고한 그 함정이다).
    //   영웅의 아트 키는 `u.hero`(원본 HEROES 항목)에만 있다.
    var art = (u.hero && u.hero.art) || (u.def && u.def.art);
    if (!u.isHero && !UI.ACT[art]) { u._act = null; return null; }
    var C = UI.ACT[art] || UI.ACT._default;
    var dt = (typeof dtMs === 'number' && isFinite(dtMs)) ? dtMs : 0;
    //  유닛의 기본 공격 모션은 **쿨의 90% 를 못 넘는다.** 쇠뇌 진지 쿨이 420ms 뿐이라
    //  이 상한이 없으면 모션이 다음 발사를 덮어 "언제 쐈는지"가 안 읽힌다.
    var atkDur = C.dur;
    if (!u.isHero) {
      var cdBase0 = (u.def && u.def.cooldown) || 900;
      atkDur = Math.min(C.dur, Math.max(140, cdBase0 * 0.90));
    }
    //  고정물은 그림이 앞뒤로 미끄러지면 안 된다(`actPose` 의 `noDrift`).
    var noDrift = !!(u.def && u.def.immobile);

    // ① 스킬 슬롯의 쿨이 **올라갔으면** 방금 시전한 것이다(`castSkill` 이 리셋한다).
    //    기본 공격보다 먼저 본다 — 스킬이 곧 그 순간의 주인공이다.
    var skType = null, slot, prev = u._actPrevSkCd || (u._actPrevSkCd = {});
    if (u.skillCd) {
      for (slot in u.skillCd) {
        var sc = u.skillCd[slot] || 0;
        if (prev[slot] !== undefined && sc > prev[slot] + 1) {
          skType = _skillTypeOf(u, slot);
        }
        prev[slot] = sc;
      }
    }
    if (skType) {
      u._actT = 0; u._actOn = true; u._actKind = 'skill'; u._actType = skType;
      u._actDur = UI.SKILL_DUR[skType] || 480;
    }

    // ①-2 유닛의 능력 — 슬롯이 아니라 `u.abilCd` 를 본다(`runAbility` 가 리셋한다).
    //  ⚠ 모션 길이를 **예고(telegraph) 길이에 맞춘다.** 예고는 이 게임에서 유일하게
    //    '진짜 지연'이라 예비 동작이 정직해진다(영웅 aoeTarget 과 같은 논리).
    //    시전 프레임에 피해가 들어가는 것은 그대로다 — 그림만 뒤따라간다.
    if (!skType && !u.isHero) {
      var aCd = u.abilCd || 0;
      if (u._actPrevAbilCd !== undefined && aCd > u._actPrevAbilCd + 1) {
        var ab0 = u._abilCur || (u.def && u.def.ability) ||
                  (u.def && u.def.abilities && u.def.abilities[0]);
        var apose = ab0 && UI.ABIL_POSE[ab0.type];
        if (apose) {
          skType = apose;
          u._actT = 0; u._actOn = true; u._actKind = 'skill'; u._actType = apose;
          u._actDur = Math.max(260, Math.min(900, ((ab0.telegraph || 400) + 200)));
        }
      }
      u._actPrevAbilCd = aCd;
    }

    // ② 쿨타임이 올라갔으면 방금 때린 것이다(fire 가 def.cooldown 으로 리셋한다).
    var cd = u.cd || 0;
    if (!skType && u._actPrevCd !== undefined && cd > u._actPrevCd + 1) {
      u._actT = 0; u._actOn = true; u._actKind = 'atk'; u._actType = null;
      u._actDur = atkDur;
    }
    u._actPrevCd = cd;

    // ③ 진행 중이면 시간을 흘린다.
    if (u._actOn) {
      u._actT = (u._actT || 0) + dt;
      if (u._actT > (u._actDur || atkDur)) { u._actOn = false; u._actT = 0; u._actKind = null; }
    }

    // ④ 예비 — 다음 타격까지 남은 시간이 곧 예비 진행도다.
    //    쿨이 아이템·버프로 짧아질 수 있으므로 쿨의 30% 를 넘지 않게 묶는다.
    var wind = 0, base = (u.def && u.def.cooldown) || 900;
    var W = Math.min(C.wind, base * 0.30);
    if (!u._actOn) {
      // 쿨이 다 찼는데 사거리 밖이면 **얼마든지 오래** 이 상태로 있을 수 있다.
      // 그때 완전히 감은 자세(1.0)로 두면 정지 화면이 몇 초씩 이어져 뻣뻣해 보인다
      // — 200ms 넘게 멈춘 포즈를 만들지 않는다는 규율에 걸린다.
      // 0.65 는 "무기를 들었다"는 읽히되 극단이 아닌 지점이고, 완전히 감기는 것은
      // 타격 직전 W 구간 안에서만 일어난다.
      //  ⚠ **유닛에는 이 상시 0.65 를 주지 않는다.** 유닛은 진형에서 몇십 초씩 가만히
      //    서 있고(사거리 밖·고정물·약초꾼처럼 아예 안 때리는 종류), 그 자세가 굳으면
      //    "쉬는 모습"이 통째로 바뀐다. 유닛은 **실제 쿨이 돌 때만** 감는다.
      if (cd <= 0) { if (u.isHero) wind = 0.65; }
      else if (cd < W) wind = 1 - cd / W;
    }

    if (u._actOn) {
      u._act = { art: art, t: u._actT, dur: u._actDur || atkDur, wind: 0,
                 kind: u._actKind || 'atk', type: u._actType || null, noDrift: noDrift };
    } else if (wind > 0) {
      u._act = { art: art, t: -1, dur: atkDur, wind: wind, kind: 'atk', type: null,
                 noDrift: noDrift };
    } else u._act = null;
    return u._act;
  };

  //  QWER 슬롯 → 스킬 타입. `u.skills` 는 `GAME.buildSkills` 가 만든 배열이고
  //  각 항목이 `slot`('Q'…'R')과 `type` 을 갖는다.
  function _skillTypeOf(u, slot) {
    var list = u.skills;
    if (!list || !list.length) return null;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].slot === slot) return list[i].type || null;
    }
    return null;
  }

  // ── 몸통 ──────────────────────────────────────────────────────
  //  ky : 세로 배율(스쿼시&스트레치). 생략·1 이면 지금과 완전히 같다.
  //       발밑(알 아랫점)을 고정하고 가로를 1/ky 로 줄여 **면적을 보존**한다.
  UI.eggBody = function (g, art, sx, by, r, color, a, lean, ky) {
    var ivory = UI.EGG_STYLE === 'ivory';
    var shell = ivory ? M.shell : color;
    var wide = art.wide || 0.78;
    lean = lean || 0;
    if (ky && ky !== 1) {
      by = by + r * (1 - ky);      // 아랫점 by+r 를 그대로 둔다
      wide = wide / (ky * ky);     // r*ky*wide' = r*wide/ky  → 가로 1/ky 배
      r = r * ky;
    }
    var outer = UI.eggPoints(sx, by, r, wide, 20, lean);

    // 베이스(그늘) → 밝은 안쪽 달걀을 좌상단으로 밀어 우하단에 초승달 그림자를 남긴다
    g.fillStyle(UI.tint(shell, -0.30), a);
    g.fillPoints(outer, true);
    //  ⚠ **한 번만 만든다.** 아래 리스광이 같은 윤곽(좌상단으로 민 밝은 안쪽 달걀)을
    //    쓰는데, 예전에는 거기서 `eggPoints` 를 한 번 더 불러 같은 배열을 두 벌
    //    만들고 있었다(2026-08-04 렉 조사에서 발견). 값이 같으므로 나눠 쓴다.
    g.fillStyle(shell, a);
    var litPts = UI.eggPoints(sx - r * 0.06, by - r * 0.05, r * 0.90, wide, 20, lean * 0.90);
    g.fillPoints(litPts, true);

    // 하이라이트
    if (r >= 8) {
      g.fillStyle(UI.tint(shell, 0.45), a * (ivory ? 0.9 : 0.55));
      g.fillEllipse(sx - r * 0.24 + lean * 0.70, by - r * 0.40, r * 0.36, r * 0.46, SM);
    }

    // ── 리스광 · 바운스 (2026-08-04 아트 개편) ──────────────────────────────
    //  계란은 매끈한 회전체다 — **좌상단 호에 한 줄만 그으면 즉시 구가 된다.**
    //  이 게임은 리스광이 가장 싸게 먹히는 형태를 이미 갖고 있으면서 안 쓰고 있었다.
    //
    //  ⚠ 반대편(우하단)의 **바운스 라이트**가 사실 더 중요하다. 그늘 쪽 실루엣이
    //    배경에 붙어버리는 현상(크림 목초지에서 특히 심하다)을 떼어내는 정공법이다.
    //    색은 지면 반사광이라 `UI.LIGHT.bounce()` 가 아레나 색에서 유도한다 —
    //    하드코딩하면 테마 4종·바이옴 6밴드에서 혼자 안 따라온다.
    //  ⚠ r < 9 이면 **그리지 않는다.** 그 크기에서 선을 하나 더 얹으면 형태가 뭉갠다
    //    (이 파일이 "톱니 2.8px 는 얼룩이 된다"에서 이미 배운 것과 같은 논리).
    //  ⚠⚠ **한 프레임에 객체를 만들지 않는다** (2026-08-04 렉 조사).
    //    처음 판은 유닛마다 프레임마다 ① `eggPoints` 한 벌(20객체) ② 클로저 두 개
    //    ③ `seg()` 가 만드는 배열 두 개를 새로 만들었고, `inkLayer` 가 몸통 그리기를
    //    **두 번** 돌리므로 그게 다시 두 배였다. 유닛 26기면 프레임당 수천 개다.
    //    실측(tools/stall-probe.js): 힙이 프레임마다 ±10~30MB 로 요동쳤고 그 자리에
    //    460~757ms 스톨이 붙어 있었다 — **렉의 정체는 GC 였다.**
    //    → 위에서 이미 만든 `litPts` 를 그대로 쓰고, 구간은 `lineBetween` 으로 긋는다.
    //      배열도 클로저도 안 만든다.
    //  ⚠ **재사용 스크래치 배열**을 쓴다. `lineBetween` 루프로 바꿔 봤더니 할당은
    //    없어졌지만 그리기 호출이 유닛당 57 → 64 회로 **늘었다**(실측 draw-census).
    //    이 저장소가 신뢰하는 지표는 환경에 안 휘둘리는 '프레임당 호출 수'이므로
    //    그건 나쁜 교환이다. 아래처럼 미리 만든 배열을 제자리에서 채우면
    //    **호출 2회 · 할당 0** 으로 둘 다 얻는다.
    if (r >= 9 && UI.LIGHT && litPts) {
      //  eggPoints 는 20 등분이다 — 좌상단 사분면은 대략 10~15, 우하단은 1~5.
      var li, sp, dp;
      for (li = 0; li < 6; li++) { sp = litPts[10 + li]; dp = RIM_KEY[li]; if (sp) { dp.x = sp.x; dp.y = sp.y; } }
      g.lineStyle(Math.max(1.2, r * 0.085), UI.LIGHT.key, UI.LIGHT.keyA * a);
      g.strokePoints(RIM_KEY, false, false);
      for (li = 0; li < 5; li++) { sp = litPts[1 + li]; dp = RIM_BOUNCE[li]; if (sp) { dp.x = sp.x; dp.y = sp.y; } }
      g.lineStyle(Math.max(1.0, r * 0.06), UI.LIGHT.bounce(), UI.LIGHT.bounceA * a);
      g.strokePoints(RIM_BOUNCE, false, false);
    }

    // 외곽선 — ivory 시안에서는 이게 진영 식별의 주역이라 두껍게 간다
    g.lineStyle(ivory ? Math.max(1.8, r * 0.17) : Math.max(1, r * 0.09),
                ivory ? color : UI.tint(color, -0.45), a);
    g.strokePoints(outer, true, true);

    // ── ivory 시안 — 진영색 어깨띠 (2026-07-30 확대, 실측 근거) ──────────────
    //  예전에는 목의 얇은 '목도리'(높이 r*0.30)였고, 그게 **알의 위쪽 절반에서 유일하게
    //  살아남는 진영 신호**인데도 몸통 면적의 11% 밖에 안 됐다. 색상(hue)은 면적을
    //  요구하는 저주파 정보라(명도의 1/3 해상도) 그 크기에서는 색이 안 읽힌다.
    //  → 높이 0.30→0.62r, 폭 1.18→1.30 으로 키워 면적 11%→25% 로 올린다.
    //    전사(그린 반지름 12.6 · wide 0.80) 기준 띠 중심에서 약 **15×7.8px** —
    //    색이 실제로 갈리는 크기다. (알 윤곽을 따라가므로 위쪽은 좁고 아래쪽은 넓다.)
    //
    //  왜 **위쪽**인가: 폰 가로 근접 접촉 거리는 화면 세로차 16px 인데 알의 그린 높이는
    //  25~33px 이다. 즉 앞 유닛이 뒤 유닛의 **아래쪽 44~52%** 를 덮는다. 살아남는 구간은
    //  위쪽 절반이므로 진영 신호는 위에 둬야 한다. (세계관 검토는 '몸통 하반부 부족 염료'를
    //  제안했는데 — 설정으로는 더 좋지만 하반부는 난전에서 가려지는 쪽이라 채택하지 않았다.
    //  대신 이미 있는 '두른 천'을 키우는 쪽으로 갔다. 세계관 검토도 이걸 보조안으로 뒀다.)
    //
    //  ⚠ **잉크 경계선이 필수다.** 진영색 채움만으로는 테마 B/C 에서 껍질에 녹는다
    //    (아이보리 대비 민트 1.73 · 녹청 1.85). 잉크는 아이보리 대비 13.69 이고
    //    **껍질 색은 테마가 안 바꾸므로 이 값은 세 테마 고정**이다. 채움색이 안 보여도
    //    잉크가 띠의 **형태**를 남기고, 형태가 진영을 전달한다(색은 보조로 강등).
    //
    //  ⚠ **띠에 진영별 형태(톱니 등)를 넣는 것은 기각했다.** 처음엔 아래 경계를
    //    매끈한 호 / 톱니로 갈랐는데, 실측하니 톱니 높이가 `r*0.22` = **2.8px** 였다 —
    //    25px 유닛에서 그 크기는 형태로 안 읽히고 지저분한 얼룩이 된다.
    //    색맹용 형태 신호는 **발밑 링(실선/파선)** 이 전담한다. 그쪽은 오버레이 패스라
    //    늘 보이고 조각 길이도 4.3px 로 잡아 뒀다(`UI.footRing`).
    //    한 신호를 두 곳에서 어설프게 내는 것보다 **한 곳에서 확실히** 내는 것이 낫다.
    //    → 띠는 '색을 실을 면적'만 담당한다. 양 진영이 같은 모양이다.
    //
    //  ⚠ **띠 폭은 상수로 두면 안 된다** (2026-07-30 검토에서 잡힘). 처음에
    //    `halfW = r*wide*1.02` 로 박았는데, 알 반폭은 높이에 따라 급히 변한다
    //    (`eggPoints`: `sin(a)·r·wide·(1-0.30cos a)`). 계산하면
    //      띠 위 경계 0.534 · 중심 0.793 · 아래 0.961  (전부 ×r×wide)
    //    즉 **전 구간에서 알 밖으로 튀어나오고 위 경계에서는 알보다 거의 2배 넓었다.**
    //    폰 전사 기준 좌우로 각 6.9px 가 허공에 떠서 '몸에 두른 천'이 아니라
    //    '간판'으로 보인다. 그래서 알 윤곽에서 **높이별로 유도**한다.
    if (ivory && r >= 8) {
      var bh = r * 0.62;                          // 띠 높이
      var bcx = sx + lean * 0.665;
      var bcy = by - r * 0.42;                    // 어깨~목 높이
      var ink = (UI.ART_INK_COLOR !== undefined) ? UI.ART_INK_COLOR : 0x2a2114;
      var top = bcy - bh / 2, bot = bcy + bh / 2;

      // 알 윤곽의 반폭. dy 는 알 중심(by)에서의 y 오프셋이다.
      // `eggPoints` 와 **같은 식**을 쓴다 — 두 벌이 갈라지면 띠가 조용히 어긋난다.
      // INSET: 살짝 안쪽으로 넣어 진영색 외곽선(위에서 이미 그렸다)이 띠에 덮이지 않게 한다.
      var INSET = 0.94;
      function halfAt(dy) {
        var c = -dy / r;
        if (c > 1) c = 1; else if (c < -1) c = -1;
        return Math.sqrt(1 - c * c) * r * wide * (1 - 0.30 * c) * INSET;
      }
      // 띠 = 알의 가로 슬라이스. 오른쪽 변을 위→아래로, 왼쪽 변을 아래→위로 돌아 닫는다.
      var STEP = 6, band = [], k2, dyk, hw;
      for (k2 = 0; k2 <= STEP; k2++) {
        dyk = (top - by) + (bot - top) * (k2 / STEP);
        band.push({ x: bcx + halfAt(dyk), y: by + dyk });
      }
      for (k2 = STEP; k2 >= 0; k2--) {
        dyk = (top - by) + (bot - top) * (k2 / STEP);
        band.push({ x: bcx - halfAt(dyk), y: by + dyk });
      }
      g.fillStyle(color, a);
      g.fillPoints(band, true);

      // 아래쪽에 한 단 어두운 띠 — 천이 접힌 그늘. 입체감을 남긴다.
      var sTop = bot - bh * 0.30, shade = [];
      for (k2 = 0; k2 <= 3; k2++) {
        dyk = (sTop - by) + (bot - sTop) * (k2 / 3);
        shade.push({ x: bcx + halfAt(dyk), y: by + dyk });
      }
      for (k2 = 3; k2 >= 0; k2--) {
        dyk = (sTop - by) + (bot - sTop) * (k2 / 3);
        shade.push({ x: bcx - halfAt(dyk), y: by + dyk });
      }
      g.fillStyle(UI.tint(color, -0.28), a);
      g.fillPoints(shade, true);

      // 잉크 경계 — 위·아래 두 줄. 이제 알 폭에 맞춰 길이가 다르다.
      // **이게 필수인 이유**: 진영색 채움만으로는 테마 B/C 에서 껍질에 녹는다
      // (아이보리 대비 민트 1.73 · 녹청 1.85). 잉크는 아이보리 대비 13.69 이고
      // 껍질 색은 테마가 안 바꾸므로 **세 테마 고정**이다 — 채움이 안 보여도 띠의 존재가 남는다.
      g.lineStyle(Math.max(1.2, r * 0.10), ink, a * 0.9);
      var hwTop = halfAt(top - by), hwBot = halfAt(bot - by);
      g.beginPath();
      g.moveTo(bcx - hwTop, top); g.lineTo(bcx + hwTop, top);
      g.strokePath();
      g.beginPath();
      g.moveTo(bcx - hwBot, bot); g.lineTo(bcx + hwBot, bot);
      g.strokePath();
    }
  };

  // ── 얼굴 ──────────────────────────────────────────────────────
  // 투구 틈(슬릿)의 화면상 높이 — 눈을 정확히 그 안에 넣어야 한다
  UI.SLIT_Y = { bucket: 0.82, crest: 0.84, wedge: 0.80 };

  UI.eggFace = function (g, art, sx, by, r, a, D) {
    if (r < 7 || art.face === 'none') return;
    D = UI.asDir(D);
    var lat = D.lat, prof = D.profile;

    // ── 뒤통수 ── 눈이 없어야 "등을 보이고 있다"가 즉시 읽힌다
    if (D.back) {
      if (art.face === 'slit') return;                 // 통투구는 뒷면 자체가 신호
      g.fillStyle(0x000000, a * 0.12);                 // 뒤통수 그늘
      g.fillEllipse(sx, by - r * 0.24, r * 0.96, r * 0.86, SM);
      if (r >= 11) {                                   // 가마
        g.lineStyle(Math.max(0.8, r * 0.055), 0x000000, a * 0.22);
        g.strokeEllipse(sx + lat * r * 0.10, by - r * 0.40, (r * 0.17) * 2, (r * 0.17) * 2, SM);
      }
      return;
    }

    var ey = by - r * 0.14;

    if (art.face === 'slit') {              // 투구 틈 안에서 빛나는 눈
      var sy = by - r * (UI.SLIT_Y[art.helm] || 0.55);
      var sox = lat * r * 0.10;
      g.fillStyle(0xfff0b0, a * 0.9);
      if (prof) {
        g.fillEllipse(sx + sox + lat * r * 0.13, sy, (Math.max(0.9, r * 0.08)) * 2, (Math.max(0.9, r * 0.08)) * 2, SM);
      } else {
        g.fillEllipse(sx - r * 0.17 + sox, sy, (Math.max(0.9, r * 0.075)) * 2, (Math.max(0.9, r * 0.075)) * 2, SM);
        g.fillEllipse(sx + r * 0.17 + sox, sy, (Math.max(0.9, r * 0.075)) * 2, (Math.max(0.9, r * 0.075)) * 2, SM);
      }
      return;
    }

    if (prof) {                              // ── 옆모습: 눈 하나 + 부리 융기
      var px2 = sx + lat * r * 0.28;
      g.fillStyle(M.eye, a * 0.92);
      g.fillEllipse(px2, ey, (Math.max(1, r * 0.105)) * 2, (Math.max(1, r * 0.105)) * 2, SM);
      if (r >= 10) {                         // 실루엣을 뚫고 나오는 작은 코
        g.fillStyle(UI.tint(UI.EGG_STYLE === 'ivory' ? M.shell : M.shellRim, -0.10), a);
        g.fillTriangle(sx + lat * r * 0.52, ey - r * 0.06,
                       sx + lat * r * 0.74, ey + r * 0.09,
                       sx + lat * r * 0.48, ey + r * 0.16);
      }
      if (r >= 13) {
        g.fillStyle(0xff9a8a, a * 0.30);
        g.fillEllipse(sx + lat * r * 0.46, ey + r * 0.20, (r * 0.13) * 2, (r * 0.13) * 2, SM);
      }
      return;
    }

    // ── 정면 / 3/4 ──
    var ox = lat * r * 0.17;
    var nearIsRight = lat >= 0;
    var rN = Math.max(1, r * (lat === 0 ? 0.095 : 0.105));
    var rF = Math.max(0.9, r * (lat === 0 ? 0.095 : 0.075));
    var xL = sx - r * 0.21 + ox + (lat < 0 ? 0 : lat * r * 0.05);
    var xR = sx + r * 0.21 + ox + (lat > 0 ? 0 : lat * r * 0.05);
    g.fillStyle(M.eye, a * 0.92);
    g.fillEllipse(xL, ey, (nearIsRight ? rF : rN) * 2, (nearIsRight ? rF : rN) * 2, SM);
    g.fillEllipse(xR, ey, (nearIsRight ? rN : rF) * 2, (nearIsRight ? rN : rF) * 2, SM);
    if (r >= 13) {                          // 볼 홍조 — 12세 톤
      g.fillStyle(0xff9a8a, a * 0.30);
      g.fillEllipse(sx - r * 0.40 + ox, ey + r * 0.20, (r * 0.13) * 2, (r * 0.13) * 2, SM);
      g.fillEllipse(sx + r * 0.40 + ox, ey + r * 0.20, (r * 0.13) * 2, (r * 0.13) * 2, SM);
    }
  };

  // ── 투구 ──────────────────────────────────────────────────────
  UI.eggHelm = function (g, kind, sx, by, r, color, a, D) {
    if (!kind) return;
    D = UI.asDir(D);
    var lw = Math.max(1, r * 0.1);
    var lat = D.lat, prof = D.profile, back = D.back;
    var sgn = lat || 1;
    var ivory = UI.EGG_STYLE === 'ivory';
    var cloth = ivory ? color : M.leather;   // ivory 시안은 천을 진영색으로
    var i, hs;

    //  ── 광원 (2026-08-07) ──────────────────────────────────────────────────
    //  `UI.LIGHT` 는 좌상단이라고 이 파일이 명문화해 뒀는데, 투구는 **광원이 있는 줄도
    //  몰랐다** — 그래서 열세 종의 머리가 전부 납작한 색 덩어리로 보였다.
    //  둥근 투구마다 리스광 **하나**만 얹는다(도형 +1, r<9 면 생략).
    var top = function (cx, cy, w, h, col) {
      if (r >= 9) UI.sheen(g, cx, cy, w, h, 0.30 * a, col);
    };

    if (kind === 'pot') {                    // 전사 — 낮고 넓은 냄비투구
      var pw = prof ? 1.06 : 1.24;
      var pcx = sx + lat * r * 0.06;
      g.fillStyle(M.bladeDark, a);
      g.fillEllipse(pcx, by - r * 0.70, r * pw, r * 0.86, SM);
      top(pcx, by - r * 0.78, r * pw * 0.42, r * 0.30, UI.lit(M.bladeDark));
      g.fillStyle(UI.shade(M.bladeDark), a);
      g.fillRect(pcx - r * pw * 0.55, by - r * 0.74, r * pw * 1.10, r * 0.20);
      if (back) {                            // 뒤 — 목가리개 + 리벳
        g.fillStyle(UI.tint(M.bladeDark, -0.14), a);
        g.fillEllipse(sx, by - r * 0.36, r * 1.02, r * 0.44, SM);
        if (r >= 10) {
          g.fillStyle(UI.tint(M.bladeDark, 0.22), a);
          g.fillRect(sx - r * 0.46, by - r * 0.62, r * 0.92, Math.max(1, r * 0.08));
          g.fillEllipse(sx, by - r * 0.86, (Math.max(1, r * 0.09)) * 2, (Math.max(1, r * 0.09)) * 2, SM);
        }
      } else if (r >= 10) {                  // 코가리개
        g.fillStyle(UI.tint(M.bladeDark, -0.15), a);
        if (prof) {
          g.fillTriangle(pcx + lat * r * 0.42, by - r * 0.70,
                         pcx + lat * r * 0.72, by - r * 0.42,
                         pcx + lat * r * 0.38, by - r * 0.24);
        } else {
          g.fillRect(pcx + lat * r * 0.10 - r * 0.08, by - r * 0.62, r * 0.16, r * 0.42);
        }
      }

    } else if (kind === 'band') {            // 궁수 — 머리띠 + 깃털 하나
      g.fillStyle(cloth, a);
      g.fillEllipse(sx, by - r * 0.66, r * (prof ? 0.86 : 1.02), r * 0.30, SM);
      g.fillStyle(M.quill, a);
      if (back) {                            // 뒤 — 깃털 정면 + 매듭 두 가닥
        g.fillTriangle(sx - r * 0.10, by - r * 0.76,
                       sx + r * 0.06, by - r * 1.70,
                       sx + r * 0.42, by - r * 1.02);
        g.fillStyle(cloth, a);
        g.fillTriangle(sx - r * 0.18, by - r * 0.62, sx - r * 0.48, by + r * 0.10, sx - r * 0.02, by - r * 0.50);
        g.fillTriangle(sx + r * 0.18, by - r * 0.62, sx + r * 0.46, by + r * 0.04, sx + r * 0.02, by - r * 0.50);
      } else if (prof) {                     // 옆 — 뒤로 눕는다
        g.fillTriangle(sx - sgn * r * 0.08, by - r * 0.74,
                       sx - sgn * r * 0.96, by - r * 1.24,
                       sx - sgn * r * 0.34, by - r * 1.46);
      } else {
        g.fillTriangle(sx + sgn * r * 0.26, by - r * 0.74,
                       sx + sgn * r * 0.16, by - r * 1.62,
                       sx + sgn * r * 0.66, by - r * 1.02);
      }

    } else if (kind === 'cap') {             // 투석꾼 — 작은 가죽 모자 + 챙
      g.fillStyle(M.leatherDark, a);
      g.fillEllipse(sx, by - r * 0.78, r * (prof ? 0.86 : 0.96), r * 0.62, SM);
      top(sx, by - r * 0.86, r * 0.34, r * 0.22, M.leatherLite);
      if (back) {                            // 뒤 — 챙이 안 보이고 목덜미 천만
        g.fillStyle(UI.tint(M.leather, -0.18), a);
        g.fillRoundedRect(sx - r * 0.44, by - r * 0.64, r * 0.88, r * 0.54, r * 0.14);
      } else if (prof) {                     // 옆 — 챙이 앞으로 튀어나온다
        g.fillStyle(M.leather, a);
        g.fillTriangle(sx + lat * r * 0.08, by - r * 0.82,
                       sx + lat * r * 1.00, by - r * 0.74,
                       sx + lat * r * 0.10, by - r * 0.58);
      } else {                               // 앞 — 챙이 관객 쪽으로 넓게
        g.fillStyle(M.leather, a);
        g.fillEllipse(sx + lat * r * 0.14, by - r * 0.62, r * 1.28, r * 0.30, SM);
      }

    } else if (kind === 'hood') {            // 투창병 — 뒤로 뾰족한 두건
      var hw = prof ? 0.56 : 0.72;
      var hp = [
        { x: sx - r * hw * 0.92, y: by - r * 0.20 },
        { x: sx - r * hw, y: by - r * 0.86 },
        { x: sx - r * 0.26, y: by - r * 1.22 },
        { x: sx + r * 0.26, y: by - r * 1.22 },
        { x: sx + r * hw, y: by - r * 0.86 },
        { x: sx + r * hw * 0.92, y: by - r * 0.20 }
      ];
      if (back) {                            // 뒤 — 두건이 닫혀 얼굴 구멍이 없다
        hp.push({ x: sx + r * 0.36, y: by - r * 0.30 });
        hp.push({ x: sx, y: by - r * 0.12 });
        hp.push({ x: sx - r * 0.36, y: by - r * 0.30 });
      } else {                               // 앞 — 얼굴 구멍
        hp.push({ x: sx + r * 0.30 + lat * r * 0.12, y: by - r * 0.52 });
        hp.push({ x: sx - r * 0.30 + lat * r * 0.12, y: by - r * 0.52 });
      }
      g.fillStyle(M.leatherDark, a);
      g.fillPoints(hp, true);
      g.fillStyle(M.leather, a);             // 늘어진 꼬리
      if (back) {
        g.fillTriangle(sx - r * 0.26, by - r * 0.58, sx + r * 0.26, by - r * 0.58, sx, by + r * 0.64);
      } else if (prof) {
        g.fillTriangle(sx - lat * r * 0.55, by - r * 0.95,
                       sx - lat * r * 1.18, by - r * 0.28,
                       sx - lat * r * 0.50, by - r * 0.28);
      } else if (lat !== 0) {
        g.fillTriangle(sx - lat * r * 0.44, by - r * 0.92,
                       sx - lat * r * 0.94, by - r * 0.34,
                       sx - lat * r * 0.38, by - r * 0.32);
      } else {
        g.fillTriangle(sx - r * 0.60, by - r * 0.74, sx - r * 0.90, by - r * 0.24, sx - r * 0.48, by - r * 0.30);
      }

    } else if (kind === 'leaf') {            // 약초꾼 — 잎사귀 화관
      g.fillStyle(M.leafDark, a);
      g.fillEllipse(sx, by - r * 0.68, r * (prof ? 0.80 : 1.00), r * 0.26, SM);
      g.fillStyle(M.leaf, a);
      if (prof) {                            // 옆 — 잎이 앞뒤로 겹친다
        g.fillEllipse(sx - lat * r * 0.30, by - r * 0.86, r * 0.44, r * 0.20, SM);
        g.fillEllipse(sx + lat * r * 0.36, by - r * 0.98, r * 0.66, r * 0.26, SM);
        g.fillEllipse(sx + lat * r * 0.08, by - r * 1.18, r * 0.28, r * 0.44, SM);
      } else if (back) {                     // 뒤 — 묶음 매듭이 보인다
        g.fillEllipse(sx - r * 0.46, by - r * 0.96, r * 0.58, r * 0.24, SM);
        g.fillEllipse(sx + r * 0.46, by - r * 0.96, r * 0.58, r * 0.24, SM);
        g.fillEllipse(sx, by - r * 1.08, r * 0.26, r * 0.36, SM);
        g.fillStyle(M.rope, a);
        g.fillEllipse(sx, by - r * 0.70, (Math.max(1, r * 0.18)) * 2, (Math.max(1, r * 0.18)) * 2, SM);
      } else {
        g.fillEllipse(sx - r * 0.48, by - r * 1.00, r * 0.62, r * 0.26, SM);
        g.fillEllipse(sx + r * 0.48, by - r * 1.00, r * 0.62, r * 0.26, SM);
        g.fillEllipse(sx + lat * r * 0.10, by - r * 1.20, r * 0.30, r * 0.46, SM);
      }

    } else if (kind === 'wedge') {           // 되받이 — 앞으로 각진 쐐기 투구
      //  통투구(방패병)와 **모양으로** 갈린다: 저쪽은 네모 상자, 이쪽은 앞이 뾰족한
      //  쐐기다. 흑백으로 줄여도 두 실루엣이 안 헷갈린다(컨택트시트 확인).
      g.fillStyle(M.iron, a);
      var wgw = prof ? 0.42 : 0.54;
      g.fillTriangle(sx - r * wgw, by - r * 0.98,
                     sx + r * wgw, by - r * 0.98,
                     sx + lat * r * 0.16, by - r * 1.44);
      g.fillRect(sx - r * wgw, by - r * 1.02, r * wgw * 2, r * 0.22);
      g.fillStyle(UI.tint(M.iron, 0.22), a);   // 좌상단 광원 — 왼쪽 비탈이 밝다
      g.fillTriangle(sx - r * wgw, by - r * 0.98,
                     sx + lat * r * 0.16, by - r * 1.44,
                     sx - r * wgw * 0.10, by - r * 0.98);
      if (back) {
        g.fillStyle(M.ironDark, a);
        g.fillRoundedRect(sx - r * 0.58, by - r * 0.44, r * 1.16, r * 0.44, r * 0.12);
      } else {
        g.fillStyle(0x14161c, a);
        var wsl = prof ? 0.40 : 0.68;
        g.fillRect(sx + lat * r * 0.10 - r * wsl * 0.5, by - r * 0.86, r * wsl, Math.max(1.2, r * 0.14));
      }

    } else if (kind === 'plank') {           // 울짱꾼 — 머리에 가로로 얹은 널빤지
      //  고정물이라 **가만히 서 있는 실루엣**이 종류 신호다. 가로로 길게 뻗은 널빤지는
      //  다른 아홉 종 어디에도 없어서 멀리서도 "저건 안 움직이는 것"으로 읽힌다.
      g.fillStyle(M.wood, a);
      g.fillRoundedRect(sx - r * 0.98, by - r * 1.24, r * 1.96, r * 0.30, r * 0.07);
      g.fillStyle(UI.lit(M.wood), a * 0.55);
      g.fillRect(sx - r * 0.98, by - r * 1.24, r * 0.72, r * 0.30);
      g.fillStyle(M.woodDark, a * 0.45);
      g.fillRect(sx + r * 0.34, by - r * 1.24, r * 0.64, r * 0.30);
      g.fillStyle(M.rope, a);                // 이마에 동여맨 끈 — 널빤지를 붙잡는 물건
      g.fillRect(sx - r * 0.46, by - r * 0.94, r * 0.92, Math.max(1, r * 0.11));

    } else if (kind === 'shellcap') {        // 껍질장이 — 위로 솟은 깨진 껍질 조각
      //  ⚠ 두 번 실패하고 세 번째다. 껍질(shell)은 계란 몸통과 **같은 near-white** 라
      //    머리를 덮는 형태로 그리면 무슨 짓을 해도 흰 덩어리가 된다(테두리를 둘러도
      //    시트에서 안 살아났다). 그래서 **덮지 않고 세운다** — 조각 사이로 배경이
      //    보이니까 실루엣이 몸에서 떨어진다. 위로 솟은 톱니는 다른 열세 종에 없다.
      var band = by - r * 0.86;
      g.fillStyle(M.leatherDark, a);          // 조각을 물린 가죽 띠
      g.fillRoundedRect(sx - r * 0.60, band - r * 0.16, r * 1.20, r * 0.30, r * 0.10);
      var sh = [[-0.44, 0.52], [-0.02, 0.86], [0.42, 0.60]];
      for (var sc = 0; sc < sh.length; sc++) {
        var ox = sx + r * sh[sc][0], oh = r * sh[sc][1];
        g.fillStyle(M.shell, a);
        g.fillTriangle(ox - r * 0.20, band, ox + r * 0.20, band, ox + r * 0.03, band - oh);
        g.fillStyle(UI.lit(M.shell), a * 0.55);
        g.fillTriangle(ox - r * 0.20, band, ox + r * 0.03, band - oh, ox - r * 0.03, band);
        if (r >= 8) {                          // 진한 테 — 흰 조각끼리 안 붙어 보이게
          g.lineStyle(Math.max(0.9, r * 0.08), M.shellRim, a);
          g.lineBetween(ox - r * 0.20, band, ox + r * 0.03, band - oh);
          g.lineBetween(ox + r * 0.03, band - oh, ox + r * 0.20, band);
        }
      }

    } else if (kind === 'ragwrap') {         // 망치잡이 — 천을 둘둘 감은 머리
      //  ⚠ **뿔을 주면 안 된다.** 족장이 이미 뿔이라, 큰 무기를 든 유닛에 뿔까지 얹으면
      //    둘이 같은 실루엣이 된다(설계 경계: 종류는 실루엣이 전담한다).
      //    그래서 머리는 일부러 **가장 낮고 밋밋하게** 두고, 무기가 혼자 말하게 한다.
      g.fillStyle(M.leather, a);
      g.fillRoundedRect(sx - r * 0.62, by - r * 1.10, r * 1.24, r * 0.46, r * 0.20);
      g.fillStyle(M.leatherDark, a * 0.7);   // 감은 자국 두 줄
      g.fillRect(sx - r * 0.62, by - r * 0.98, r * 1.24, Math.max(1, r * 0.08));
      g.fillRect(sx - r * 0.62, by - r * 0.82, r * 1.24, Math.max(1, r * 0.08));
      if (!back) {                           // 이마 위로 삐져나온 천 끝
        g.fillStyle(M.leather, a);
        g.fillTriangle(sx + lat * r * 0.52, by - r * 1.04,
                       sx + lat * r * 0.92, by - r * 0.82,
                       sx + lat * r * 0.54, by - r * 0.74);
      }

    } else if (kind === 'veil') {            // 벌집꾼 — 벌을 막는 망사 두건
      //  ⚠ 늪지기(삿갓)와 **반드시 갈려야 한다.** 저쪽은 넓고 납작한 원뿔이고,
      //    이쪽은 머리에 딱 붙는 둥근 두건 + 얼굴 앞 망사다. 폭으로 갈린다.
      g.fillStyle(M.rope, a);
      g.fillEllipse(sx, by - r * 0.94, r * 1.16, r * 1.04, SM);
      g.fillStyle(UI.tint(M.rope, -0.22), a * 0.6);
      g.fillEllipse(sx + r * 0.24, by - r * 0.88, r * 0.56, r * 0.72, SM);
      if (!back && r >= 8) {                 // 망사 — 가로줄 두 개면 '그물'로 읽힌다
        g.lineStyle(Math.max(0.8, r * 0.07), UI.tint(M.rope, -0.34), a * 0.85);
        g.lineBetween(sx - r * 0.50, by - r * 0.80, sx + r * 0.50, by - r * 0.80);
        g.lineBetween(sx - r * 0.46, by - r * 0.62, sx + r * 0.46, by - r * 0.62);
      }

    } else if (kind === 'thorncrown') {      // 덩굴채 — 머리에 감은 마른 덩굴
      //  가시가 **바깥으로** 뻗는다. 껍질장이(위로 솟은 흰 조각)와 방향으로 갈리고,
      //  족장(위로 선 두 뿔)과도 개수·각도로 갈린다.
      g.fillStyle(M.woodDark, a);
      g.fillRoundedRect(sx - r * 0.58, by - r * 1.00, r * 1.16, r * 0.26, r * 0.11);
      var tk = [[-0.86, -0.28], [-0.55, -0.62], [0.55, -0.62], [0.86, -0.28]];
      g.fillStyle(M.wood, a);
      for (var tc = 0; tc < tk.length; tc++) {
        var bx = sx + r * tk[tc][0] * 0.66, byy = by - r * 0.90;
        g.fillTriangle(bx, byy - r * 0.14, bx, byy + r * 0.14,
                       bx + r * tk[tc][0] * 0.62, byy + r * tk[tc][1] * 0.62);
      }

    } else if (kind === 'ashhood') {         // 잿가루꾼 — 재를 막는 낮은 두건 + 코싸개
      //  ⚠ 벌집꾼(망사 두건)과 갈리는 지점: 저쪽은 얼굴 앞 **가로줄 그물**,
      //    이쪽은 코 아래를 덮는 **삼각 천**이다. 같은 '두건'이라도 덮는 자리가 다르다.
      g.fillStyle(M.stone, a);
      g.fillRoundedRect(sx - r * 0.60, by - r * 1.06, r * 1.20, r * 0.42, r * 0.16);
      g.fillStyle(UI.lit(M.stone), a * 0.5);
      g.fillRect(sx - r * 0.60, by - r * 1.06, r * 0.44, r * 0.42);
      if (!back) {
        g.fillStyle(UI.tint(M.stone, -0.30), a);   // 코싸개 — 아래로 늘어진 삼각 천
        g.fillTriangle(sx - r * 0.40, by - r * 0.70, sx + r * 0.40, by - r * 0.70,
                       sx + lat * r * 0.06, by - r * 0.24);
      }

    } else if (kind === 'cairnhat') {        // 돌쌓이 — 머리에 얹은 돌 세 개
      //  ⚠ 이 게임에서 **성장이 눈에 보이는 유일한 유닛**이다. 겹이 쌓일수록 돌이
      //    늘어나므로(`_stacks`), 기본 모습부터 '쌓는 물건'으로 읽혀야 한다.
      var cs = [[0.00, 1.34, 0.34], [-0.30, 1.02, 0.28], [0.32, 1.00, 0.26]];
      for (var ci = 0; ci < cs.length; ci++) {
        g.fillStyle(M.stone, a);
        g.fillEllipse(sx + r * cs[ci][0], by - r * cs[ci][1], r * cs[ci][2] * 2, r * cs[ci][2] * 1.6, SM);
        g.fillStyle(UI.lit(M.stone), a * 0.5);
        g.fillEllipse(sx + r * cs[ci][0] - r * 0.08, by - r * cs[ci][1] - r * 0.07,
                      r * cs[ci][2] * 1.0, r * cs[ci][2] * 0.7, SM);
      }
      g.lineStyle(Math.max(0.8, r * 0.07), UI.tint(M.stone, -0.38), a * 0.9);
      g.strokeCircle(sx, by - r * 1.34, r * 0.34);

    } else if (kind === 'knothood') {        // 매듭지기 — 이마에 맨 매듭
      //  ⚠ 덩굴채(바깥으로 뻗은 가시)와 갈리는 지점: 이쪽은 **가운데 하나로 뭉친
      //    매듭**이다. 뻗느냐 뭉치느냐로 16px 에서도 갈린다.
      g.fillStyle(M.rope, a);
      g.fillRect(sx - r * 0.62, by - r * 0.98, r * 1.24, r * 0.22);
      g.fillEllipse(sx + lat * r * 0.10, by - r * 1.06, r * 0.46, r * 0.42, SM);
      g.fillStyle(UI.tint(M.rope, -0.30), a * 0.85);
      g.fillRect(sx - r * 0.62, by - r * 0.84, r * 1.24, Math.max(1, r * 0.08));
      if (!back && r >= 9) {                 // 늘어뜨린 두 가닥
        g.lineStyle(Math.max(0.9, r * 0.09), M.rope, a);
        g.lineBetween(sx + lat * r * 0.20, by - r * 0.92, sx + lat * r * 0.46, by - r * 0.56);
        g.lineBetween(sx + lat * r * 0.02, by - r * 0.92, sx + lat * r * 0.22, by - r * 0.50);
      }

    } else if (kind === 'sparkcap') {        // 불씨꾼 — 그을린 가죽 모자 + 불씨 하나
      //  ⚠ 잿가루꾼(회색 낮은 두건)과 **색으로** 갈린다: 이쪽은 그을린 갈색이고
      //    이마에 잉걸불 점이 하나 붙는다. 둘 다 '뿌리는 자'라 형태만으론 안 갈린다.
      g.fillStyle(M.leatherDark, a);
      g.fillEllipse(sx, by - r * 1.02, r * 1.20, r * 0.86, SM);
      g.fillRect(sx - r * 0.60, by - r * 1.02, r * 1.20, r * 0.24);
      g.fillStyle(UI.tint(M.leatherDark, 0.20), a * 0.6);
      g.fillEllipse(sx - r * 0.24, by - r * 1.14, r * 0.48, r * 0.32, SM);
      if (!back) {                           // 이마의 불씨 — 이 유닛의 유일한 붉은 점
        g.fillStyle(0xd8451a, a);
        g.fillEllipse(sx + lat * r * 0.06, by - r * 0.86, r * 0.22, r * 0.20, 8);
        g.fillStyle(0xff8c2e, a * 0.9);
        g.fillEllipse(sx + lat * r * 0.06, by - r * 0.90, r * 0.11, r * 0.10, 8);
      }

    } else if (kind === 'bucket') {          // 방패병 — 통투구
      var bwr = prof ? 0.44 : 0.56;
      g.fillStyle(M.iron, a);
      g.fillRoundedRect(sx - r * bwr, by - r * 1.30, r * bwr * 2, r * 1.06, r * 0.18);
      top(sx - r * bwr * 0.30, by - r * 1.12, r * bwr * 0.66, r * 0.34, M.ironLite);
      if (back) {                            // 뒤 — 틈이 없다. 대신 목가리개 + 리벳
        g.fillStyle(M.ironDark, a);
        g.fillRoundedRect(sx - r * 0.64, by - r * 0.46, r * 1.28, r * 0.48, r * 0.12);
        if (r >= 10) {
          g.fillStyle(UI.tint(M.iron, 0.20), a);
          g.fillRect(sx - r * 0.40, by - r * 1.02, r * 0.80, Math.max(1, r * 0.09));
          g.fillEllipse(sx, by - r * 0.76, (Math.max(1, r * 0.10)) * 2, (Math.max(1, r * 0.10)) * 2, SM);
        }
      } else {
        g.fillStyle(0x14161c, a);
        var slw = prof ? 0.44 : 0.76;
        g.fillRect(sx + lat * r * 0.10 - r * slw * 0.5, by - r * 0.90, r * slw, Math.max(1.2, r * 0.15));
      }
      g.lineStyle(lw, UI.tint(M.iron, 0.25), a);
      g.strokeRoundedRect(sx - r * bwr, by - r * 1.30, r * bwr * 2, r * 1.06, r * 0.18);
      if (prof) {                            // 옆 — 세로 이음매
        g.lineStyle(Math.max(0.8, r * 0.06), UI.tint(M.iron, -0.28), a * 0.9);
        g.lineBetween(sx - lat * r * 0.12, by - r * 1.26, sx - lat * r * 0.12, by - r * 0.30);
      }

    } else if (kind === 'horns') {           // 족장 — 옆으로 뻗다 위로 감기는 소뿔
      // 정면에선 뿔 2개가 좌우로, 옆에선 하나가 앞으로 겹쳐 보인다
      var horn = function (h, sc, col, up) {
        g.fillStyle(col, a);
        g.fillPoints([
          { x: sx + h * r * 0.44 * sc, y: by - r * 1.04 },
          { x: sx + h * r * 1.02 * sc, y: by - r * (1.22 + up) },
          { x: sx + h * r * 1.30 * sc, y: by - r * (1.62 + up) },
          { x: sx + h * r * 1.10 * sc, y: by - r * (1.14 + up) },
          { x: sx + h * r * 0.98 * sc, y: by - r * 0.96 },
          { x: sx + h * r * 0.46 * sc, y: by - r * 0.78 }
        ], true);
      };
      var dome = function () {
        g.fillStyle(M.leatherDark, a);
        g.fillEllipse(sx, by - r * 0.74, r * (prof ? 0.92 : 1.10), r * 0.70, SM);
        top(sx, by - r * 0.84, r * 0.36, r * 0.24, M.leatherLite);
      };
      if (prof) {
        horn(-lat, 0.52, UI.tint(M.bone, -0.38), 0.02);   // 먼 뿔 — 투구 뒤로 가림
        dome();
        horn(lat, 1.18, M.bone, 0.10);                    // 가까운 뿔 — 투구 위로 겹침
        g.fillStyle(M.bronze, a);
        g.fillRect(sx - r * 0.34, by - r * 0.88, r * 0.68, Math.max(1.2, r * 0.14));
      } else if (back) {
        dome();
        horn(-1, 0.84, UI.tint(M.bone, -0.14), 0.22);
        horn(1, 0.84, UI.tint(M.bone, -0.14), 0.22);
        g.fillStyle(M.bronze, a);                         // 뒤통수 잠금쇠
        g.fillRect(sx - r * 0.28, by - r * 0.92, r * 0.56, Math.max(1.2, r * 0.18));
        g.fillEllipse(sx, by - r * 0.56, (Math.max(1, r * 0.12)) * 2, (Math.max(1, r * 0.12)) * 2, SM);
      } else {
        dome();
        horn(-1, lat < 0 ? 1.08 : 0.92, M.bone, 0);
        horn(1, lat > 0 ? 1.08 : 0.92, M.bone, 0);
        g.fillStyle(M.bronze, a);
        g.fillRect(sx - r * 0.52, by - r * 0.88, r * 1.04, Math.max(1.2, r * 0.14));
      }

    } else if (kind === 'sedge') {           // 늪지기 — 삿갓 (게임에서 가장 넓은 실루엣)
      var brim = prof ? 1.10 : 1.34;
      var stip = sx + lat * r * 0.10, sbrim = by - r * 0.52;
      g.fillStyle(M.rope, a);
      g.fillTriangle(stip, by - r * 1.52, sx - r * brim, sbrim, sx + r * brim, sbrim);
      //  짚 골 두 줄 — 삿갓은 이 게임에서 가장 넓은 면이라 단색이면 판때기가 된다.
      //  광원이 좌상단이므로 왼쪽 절반을 밝게, 오른쪽을 어둡게 갈라 원뿔로 읽히게 한다.
      if (r >= 9 && !back) {
        g.fillStyle(M.ropeDark, a * 0.55);
        g.fillTriangle(stip, by - r * 1.52, sx + r * brim * 0.20, sbrim, sx + r * brim, sbrim);
        g.lineStyle(Math.max(0.8, r * 0.045), M.ropeLite, a * 0.7);
        g.lineBetween(stip, by - r * 1.40, sx - r * brim * 0.62, sbrim);
        g.lineStyle(Math.max(0.8, r * 0.045), M.ropeDark, a * 0.6);
        g.lineBetween(stip, by - r * 1.40, sx + r * brim * 0.58, sbrim);
      }
      if (back) {                            // 뒤 — 갓 윗면이 보이고 턱끈 매듭이 등에
        g.fillStyle(M.ropeLite, a);
        g.fillEllipse(sx, by - r * 0.58, r * brim * 1.86, r * 0.30, SM);
        g.fillStyle(M.ropeDark, a);
        g.fillEllipse(sx, by - r * 0.28, r * 0.32, r * 0.24, SM);
      } else {                               // 앞·옆 — 챙 아랫면 그림자
        g.fillStyle(M.ropeDark, a);
        g.fillRect(sx - r * brim, by - r * 0.62, r * brim * 2, Math.max(1.4, r * 0.16));
        if (!prof) {
          g.fillStyle(0x000000, a * 0.16);
          g.fillEllipse(sx + lat * r * 0.10, by - r * 0.46, r * 1.16, r * 0.32, SM);
        }
      }

    } else if (kind === 'onehorn') {         // 광전사 — 뼈 가시 볏 (앞뒤로 선 모히칸)
      g.fillStyle(M.leatherDark, a);
      g.fillEllipse(sx, by - r * 0.78, r * (prof ? 1.00 : 1.18), r * 0.76, SM);
      top(sx, by - r * 0.90, r * 0.38, r * 0.26, M.leatherLite);
      g.fillStyle(M.bone, a);
      var spikes = prof ? [[-0.46, 0.52], [-0.14, 0.86], [0.20, 0.78], [0.50, 0.48]]
                 : (back ? [[-0.12, 0.60], [0.12, 0.88]] : [[-0.12, 0.92], [0.14, 0.64]]);
      for (i = 0; i < spikes.length; i++) {
        var bxo = sx + sgn * r * spikes[i][0], bhh = r * spikes[i][1];
        g.fillTriangle(bxo - r * 0.19, by - r * 1.02,
                       bxo + r * 0.19, by - r * 1.02,
                       bxo + sgn * r * 0.08, by - r * 1.02 - bhh);
      }
      g.fillStyle(UI.tint(M.leather, 0.12), a);
      g.fillEllipse(sx, by - r * 1.00, r * (prof ? 0.90 : 1.04), r * 0.26, SM);
      if (back) {                            // 뒤 — 뒤통수를 덮는 가죽 자락
        g.fillStyle(UI.tint(M.leatherDark, -0.18), a);
        g.fillRoundedRect(sx - r * 0.46, by - r * 0.58, r * 0.92, r * 0.38, r * 0.13);
      }

    } else if (kind === 'wolf') {            // 사냥꾼 — 짐승가죽 두건 + 귀
      var ear = function (es, sc) {
        g.fillStyle(UI.tint(M.leather, 0.30), a);
        g.fillTriangle(sx + es * r * 0.80, by - r * 1.00,
                       sx + es * r * (0.80 + 0.26 * sc), by - r * (1.00 + 0.80 * sc),
                       sx + es * r * 0.22, by - r * (1.00 + 0.30 * sc));
        g.fillStyle(M.leatherDark, a);
        g.fillTriangle(sx + es * r * 0.74, by - r * 1.06,
                       sx + es * r * (0.74 + 0.14 * sc), by - r * (1.06 + 0.48 * sc),
                       sx + es * r * 0.36, by - r * (1.06 + 0.20 * sc));
      };
      if (prof) {
        ear(-lat, 0.50);                     // 먼 귀 먼저 → 두건에 가림
        g.fillStyle(M.leatherDark, a);
        g.fillEllipse(sx, by - r * 0.80, r * 1.00, r * 0.94, SM);
        top(sx, by - r * 0.94, r * 0.34, r * 0.28, M.leatherLite);
        ear(lat, 1.16);
      } else {
        g.fillStyle(M.leatherDark, a);
        g.fillEllipse(sx, by - r * 0.80, r * 1.16, r * 0.94, SM);
        top(sx, by - r * 0.94, r * 0.38, r * 0.30, M.leatherLite);
        ear(-1, lat < 0 ? 1.08 : (lat > 0 ? 0.84 : 1.0));
        ear(1, lat > 0 ? 1.08 : (lat < 0 ? 0.84 : 1.0));
      }
      if (back) {                            // 뒤 — 주둥이 없음. 등을 타고 내려온 가죽 꼬리
        g.fillStyle(UI.tint(M.leatherDark, -0.14), a);
        g.fillRoundedRect(sx - r * 0.19, by - r * 0.56, r * 0.38, r * 0.94, r * 0.18);
        g.fillStyle(UI.tint(M.leather, 0.18), a);
        g.fillEllipse(sx, by + r * 0.34, (Math.max(1, r * 0.17)) * 2, (Math.max(1, r * 0.17)) * 2, SM);
      } else {                               // 앞·옆 — 짐승 주둥이
        g.fillStyle(UI.tint(M.leatherDark, -0.12), a);
        if (prof) {
          g.fillTriangle(sx + lat * r * 0.28, by - r * 0.88,
                         sx + lat * r * 1.18, by - r * 0.60,
                         sx + lat * r * 0.32, by - r * 0.38);
        } else {
          g.fillEllipse(sx + lat * r * 0.14, by - r * 0.54, r * 0.70, r * 0.34, SM);
        }
      }
      g.fillStyle(UI.tint(M.leatherDark, -0.3), a);
      g.fillEllipse(sx, by - r * 0.44, r * (prof ? 0.84 : 0.98), r * 0.30, SM);

    } else if (kind === 'crest') {           // 파수꾼 — 통투구 + 앞뒤로 선 볏
      var cwr = prof ? 0.46 : 0.58;
      g.fillStyle(M.iron, a);
      g.fillRoundedRect(sx - r * cwr, by - r * 1.34, r * cwr * 2, r * 1.10, r * 0.20);
      top(sx - r * cwr * 0.30, by - r * 1.16, r * cwr * 0.66, r * 0.36, M.ironLite);
      if (back) {
        g.fillStyle(M.ironDark, a);
        g.fillRoundedRect(sx - r * 0.66, by - r * 0.50, r * 1.32, r * 0.50, r * 0.12);
        if (r >= 10) {
          g.fillStyle(UI.tint(M.iron, 0.20), a);
          g.fillRect(sx - r * 0.42, by - r * 1.04, r * 0.84, Math.max(1, r * 0.09));
        }
      } else {
        g.fillStyle(0x14161c, a);
        var cslw = prof ? 0.46 : 0.80;
        g.fillRect(sx + lat * r * 0.10 - r * cslw * 0.5, by - r * 0.92, r * cslw, Math.max(1.2, r * 0.15));
      }
      g.fillStyle(M.quill, a);             // 볏
      if (prof) {                            // 옆 — 앞뒤로 길게 눕는다
        g.fillPoints([
          { x: sx + lat * r * 0.36, y: by - r * 1.34 },
          { x: sx + lat * r * 0.12, y: by - r * 1.98 },
          { x: sx - lat * r * 0.48, y: by - r * 1.86 },
          { x: sx - lat * r * 0.90, y: by - r * 1.06 },
          { x: sx - lat * r * 0.40, y: by - r * 1.30 }
        ], true);
      } else {                               // 앞·뒤 — 좁은 세로 지느러미
        g.fillPoints([
          { x: sx - r * 0.16, y: by - r * 1.32 },
          { x: sx - r * 0.06, y: by - r * 1.95 },
          { x: sx + r * 0.16, y: by - r * 1.90 },
          { x: sx + r * 0.22, y: by - r * 1.30 }
        ], true);
      }
      g.lineStyle(lw, UI.tint(M.iron, 0.25), a);
      g.strokeRoundedRect(sx - r * cwr, by - r * 1.34, r * cwr * 2, r * 1.10, r * 0.20);
    }
  };

  // ── 등 뒤 레이어 ──────────────────────────────────────────────
  //  정면·측면일 땐 몸통보다 먼저, 뒤를 보고 있으면 몸통보다 나중에 그린다.
  UI.eggBack = function (g, kind, sx, by, r, color, a, D) {
    if (!kind) return;
    D = UI.asDir(D);
    var ivory = UI.EGG_STYLE === 'ivory';
    var lat = D.lat, prof = D.profile, back = D.back;
    // 등의 화면상 위치 — 정면을 보면 위로, 등을 보이면 아래(우리 쪽)로 온다
    var ox = -D.fx * r * 0.55, oy = -D.fy * r * 0.55;
    var i;

    if (kind === 'quiver') {                 // 화살통 — 등 뒤 대각선 + 화살깃 3개
      // 정배면일 때 정중앙에 오면 두건 자락과 겹치므로 옆으로 조금 비켜 멘다
      var qx = sx + ox + D.px * r * 0.20, qy = by + oy - r * 0.10;
      // 멜빵에 진영색을 섞는다 — 사냥꾼(quiver)은 진영색 천이 아예 없었다(2026-07-30).
      // 가죽 재질감은 남기려고 원색이 아니라 절반만 섞는다.
      g.lineStyle(Math.max(2, r * 0.30),
                  UI.mix(M.leatherDark, color, 0.50), a);
      g.lineBetween(qx - r * 0.35, qy + r * 0.55, qx + r * 0.20, qy - r * 0.90);
      // `quill` — 진영색과 색역이 겹치지 않는 깃(MAT 주석 참조). `feather` 는 비행 화살용이다.
      g.fillStyle(M.quill, a);
      for (i = 0; i < 3; i++) {
        g.fillTriangle(qx + r * 0.18 + i * r * 0.16, qy - r * 0.94,
                       qx + r * 0.02 + i * r * 0.16, qy - r * 1.42,
                       qx + r * 0.34 + i * r * 0.16, qy - r * 1.30);
      }

    } else if (kind === 'cape') {            // 망토 — 뒤를 보이면 펼쳐지되 계란을 다 덮진 않는다
      var cw = back ? 1.16 : (prof ? 0.88 : 1.0);
      var cxo = back ? 0 : -lat * r * 0.10;
      // 정배면에서는 몸통 위에 그려지므로 어깨 아래에서 시작해 계란 실루엣을 살려둔다
      var cTop = back ? r * 0.22 : -r * 0.48;
      g.fillStyle(ivory ? UI.tint(color, -0.20) : UI.tint(color, -0.42), a);
      g.fillPoints([
        { x: sx + cxo - r * 0.86 * cw, y: by + cTop },
        { x: sx + cxo + r * 0.86 * cw, y: by + cTop },
        { x: sx + cxo + r * 1.16 * cw, y: by + r * 1.15 },
        { x: sx + cxo, y: by + r * 0.86 },
        { x: sx + cxo - r * 1.16 * cw, y: by + r * 1.15 }
      ], true);
      if (back && r >= 10) {                 // 뒤 — 중앙 접힘선 + 어깨 걸쇠
        g.lineStyle(Math.max(0.9, r * 0.07), UI.tint(color, -0.45), a * 0.8);
        g.lineBetween(sx, by + cTop + r * 0.10, sx, by + r * 0.82);
        g.fillStyle(M.bronze, a);
        g.fillEllipse(sx - r * 0.60, by + r * 0.16, (Math.max(1, r * 0.13)) * 2, (Math.max(1, r * 0.13)) * 2, SM);
        g.fillEllipse(sx + r * 0.60, by + r * 0.16, (Math.max(1, r * 0.13)) * 2, (Math.max(1, r * 0.13)) * 2, SM);
      }

    } else if (kind === 'fur') {             // 어깨 털가죽
      // ⚠ 여기는 **진영색을 써야 하는 자리다** (2026-07-30).
      //   등 장비 중 진영색을 쓰는 것은 `cape` 하나뿐이었고 그건 파수꾼·족장만 멘다.
      //   광전사(fur)와 사냥꾼(quiver)은 진영색 천이 **아예 없었다** — 컨트롤러가 가장
      //   많이 쓰는 두 영웅에 진영 표식이 제일 적었다는 뜻이다(신고 화면의 영웅이 광전사다).
      //   털가죽이라는 재질감은 남기려고 갈색을 진영색 쪽으로 섞는다(원색이 아니다).
      var fw = prof ? 0.52 : 0.72;
      // `UI.mix` 는 같은 IIFE 안(위쪽)에 정의돼 있으므로 존재 가드가 필요없다.
      // 예전에 둔 `UI.mix ? … : UI.tint(color, -0.34)` 대체값은 가죽 갈색이 아니라
      // **진영색을 어둡게 한 값**이라, 만약 그 길로 갔으면 재질이 통째로 바뀌었다.
      var furC = UI.mix(M.leatherDark, color, 0.55);
      g.fillStyle(furC, a);
      g.fillEllipse(sx - r * 0.78, by - r * 0.02, r * fw, r * 0.54, SM);
      g.fillEllipse(sx + r * 0.78, by - r * 0.02, r * fw, r * 0.54, SM);
      if (back) {
        g.fillStyle(UI.tint(furC, 0.14), a);
        g.fillEllipse(sx, by - r * 0.16, r * 1.30, r * 0.46, SM);
      }

    } else if (kind === 'pack') {            // 등짐
      g.fillStyle(M.leatherDark, a);
      g.fillRoundedRect(sx + ox * 1.72 - r * 0.34, by + oy * 1.20 - r * 0.26, r * 0.68, r * 0.86, r * 0.14);
      g.fillStyle(M.leather, a);
      g.fillRoundedRect(sx + ox * 1.72 - r * 0.34, by + oy * 1.20 - r * 0.30, r * 0.62, r * 0.78, r * 0.14);
      g.fillStyle(M.leafDark, a);
      g.fillEllipse(sx + ox * 1.72, by + oy * 1.20 - r * 0.40, r * 0.44, r * 0.24, SM);
      g.fillStyle(M.leaf, a);
      g.fillEllipse(sx + ox * 1.72 - r * 0.10, by + oy * 1.20 - r * 0.46, r * 0.24, r * 0.14, SM);

    } else if (kind === 'pouch') {           // 돌주머니
      g.fillStyle(M.leatherDark, a);
      g.fillEllipse(sx + ox * 1.55, by + oy * 1.10 + r * 0.36, r * 0.62, r * 0.56, SM);
      g.fillStyle(M.leather, a);
      g.fillEllipse(sx + ox * 1.55, by + oy * 1.10 + r * 0.28, r * 0.56, r * 0.50, SM);
      g.fillStyle(M.stone, a);
      g.fillEllipse(sx + ox * 1.55, by + oy * 1.10 + r * 0.12, (r * 0.17) * 2, (r * 0.17) * 2, SM);
      g.fillStyle(M.stoneLite, a * 0.9);
      g.fillEllipse(sx + ox * 1.55 - r * 0.06, by + oy * 1.10 + r * 0.06, (r * 0.07) * 2, (r * 0.07) * 2, 8);
    }
  };

  // ── 손에 든 것 ────────────────────────────────────────────────
  //  로컬 좌표계: f = 정면 방향, p = 측면 방향. 둘 다 r 배수.
  //  뒤를 보고 있으면 drawEggChar 가 이걸 몸통보다 먼저 불러 가려버린다.
  UI.GEAR_ALWAYS_FRONT = { crossbowNest: 1 };   // 지형 구조물은 늘 몸통 위

  // ── 얼굴 가림 완화 ──────────────────────────────────────────────────────────
  //  "무기·장비가 얼굴을 덮어 계란인지 알아볼 수 없다"는 실측 신고에 대한 대응.
  //
  //  원인은 색이나 크기가 아니라 **투영**이다. 정면(또는 정배면)을 보면 앞뒤축(fx,fy)이
  //  화면에서 거의 0 으로 눌려서, "몸 앞으로 내민 것"이 전부 계란 위에 그대로 겹쳐 쌓인다.
  //  실측: 정면 궁수는 활 전체가 얼굴 정중앙, 투창병은 창이 왼쪽 눈을 세로로 관통,
  //  방패병·파수꾼은 방패가 알을 통째로 덮었다.
  //
  //  두 축으로 푼다. 둘 다 **눌린 정도(faceOn)에 비례**하므로 옆모습은 손대지 않는다.
  //   1) 벌리기(GEAR_SPREAD) — 측면축 p 를 부호 방향으로 밀어 얼굴 앞을 비운다.
  //      **부호를 보존해서 밀기** 때문에 반대손 물건(전사 버클러 p<0)은 반대쪽으로 간다.
  //      통째로 평행이동시키면 버클러가 오히려 얼굴 한가운데로 왔다(그래서 이 방식).
  //   2) 내리기(GEAR_DROP) — 턱 아래로 내려야 하는 것만.
  //  여기에 그리기 순서(장비를 얼굴·투구보다 **먼저**)를 더해 얼굴을 못 덮게 못박는다.
  //
  //  ⚠ 실루엣이 이 파일의 제1원칙이라, 값은 "치웠는데도 종류가 읽히는" 선에서 멈춘다.
  //    전부 흑백 컨택트시트로 확인하고 정했다(가장 넓은 광전사가 중심 ±2.05r 안).
  UI.GEAR_SPREAD = {
    sword: 0.45, bow: 0.95, longbow: 1.02, sling: 0.40, javelin: 0.55,
    leafstaff: 0.20, towerShield: 0.60, handaxe: 0.30, sapjar: 0.35,
    greatsword: 0.35, hookShield: 0.55, crossbowNest: 0,
    shellGuard: 0.58, stakes: 0.30, shellPlate: 0.34, stoneMaul: 0.42,
    hive: 0.44, vinelash: 0.86, ashpouch: 0.44, cairn: 0.38, knotrope: 0.36, firepot: 0.40
  };
  UI.GEAR_DROP = { sapjar: 0.18, sword: 0.10 };
  //  칼류는 정면일수록 **더 세워 든다** — 옆으로만 밀면 눈앞을 가로지르는 각이 남는다.
  UI.GEAR_FACE_UP = 0.85;

  // ── 무기 등급 (2026-07-31, 사용자 지시: "아이템을 장착하면 오른쪽 캐릭터 화면에서도
  //    바뀌고 실제 인게임에서도 그 무기가 보이길 원해. 비싼 무기일수록 화려한 디자인이나
  //    화려한 효과를 넣어줘") ──────────────────────────────────────────────────
  //  바뀌는 것은 **재질(색) · 형태(크기·장식) · 광휘(반짝임)** 셋이다:
  //    돌 → 청동 → 흑요석 → 뼈 → 강철 → 흑철 → 용골 → 여명.
  //    상점 카탈로그(js/towershopitems.js)의 이름 순서 그대로다.
  //
  //  ⚠ **무기 종류 자체는 안 바꾼다** (2026-07-31 사용자 지시: "많이는 아니더라도").
  //    이 파일의 제1원칙이 "종류는 실루엣이 전담한다"라, 광전사가 등급마다 활을 들거나
  //    하면 정체성이 무너지고 색맹 대비 규율도 같이 깨진다. 대신 **같은 무기가 자란다** —
  //    날이 길고 두꺼워지고, 날밑이 커지고, 상위 등급은 날개·보석·톱니가 붙는다.
  //    실루엣의 '종류'는 그대로이면서 '급'은 한눈에 갈린다.
  //
  //  형태 값의 뜻:
  //    len   날/팔 길이 배수      wide  두께 배수
  //    grd   날밑·테두리 배수     orn   장식 단계(0 없음 · 1 보석 · 2 +날개 · 3 +톱니/가시)
  //
  //  ⚠ 등급 0(= 아무것도 안 낌)은 아무것도 안 건드린다 — 대전·수성의 탑·카드 화면이
  //    전부 등급을 안 넘기므로 **픽셀 단위로 예전과 같은 그림**이 나온다.
  //  ⚠ `len` 을 올려도 파수꾼 창끝은 `tipCap`(판정 사거리) 안에 묶인다 — 아래 hookShield
  //    참조. 그림이 사거리보다 길어지면 회피 게임이 거짓말을 한다(v0.81 에서 겪은 사고).
  UI.GEAR_TIERS = [
    // `iron` 도 같이 바꾼다 — 파수꾼의 갈고리 방패(hookShield)는 판을 `iron` 으로 칠하므로
    // 그 키를 빼면 **파수꾼만 등급이 거의 안 보인다**(자루 구슬 색만 바뀐다 — 실측).
    null,                                                                     // 0 · 맨손(기본)
    { mat: { blade: 0x9aa3ad, bladeDark: 0x6d7681, bronze: 0x8a7a5c, iron: 0x6e7681 },    // 1 돌
      len: 0.88, wide: 1.10, grd: 0.80, orn: 0 },
    { mat: { blade: 0xd6a44a, bladeDark: 0x8f6a22, bronze: 0xb07f2e, iron: 0x8a6526 },    // 2 청동
      len: 0.94, wide: 1.04, grd: 0.92, orn: 0 },
    { mat: { blade: 0x585070, bladeDark: 0x2e2942, bronze: 0x8b7ab0, iron: 0x3a3352 },    // 3 흑요석
      len: 1.00, wide: 0.90, grd: 0.96, orn: 1 },
    //  ⚠ 4·6 은 2026-08-03 에 **사다리 중간에 끼운** 단계다(js/towershopitems.js 참조).
    //    카탈로그 배열 순번이 곧 이 배열의 자리다 — 한쪽만 늘리면 등급이 통째로 밀린다.
    { mat: { blade: 0xcfc0a4, bladeDark: 0x5f4a33, bronze: 0x8a6b45, iron: 0x6b533a },    // 4 이빨 박은 나무
      len: 1.03, wide: 1.14, grd: 0.86, orn: 1 },
    { mat: { blade: 0xeae3cd, bladeDark: 0xb3a888, bronze: 0xc0aa72, iron: 0xa89c7e },    // 5 뼈
      len: 1.06, wide: 1.00, grd: 1.00, orn: 1 },
    { mat: { blade: 0xb89a6a, bladeDark: 0x6e5730, bronze: 0xa8863f, iron: 0x7a6134 },    // 6 들소뿔
      len: 1.10, wide: 1.08, grd: 1.04, orn: 1 },
    { mat: {}, len: 1.13, wide: 1.02, grd: 1.10, orn: 1 },                    // 7 강철 = 기본 색
    { mat: { blade: 0x79828f, bladeDark: 0x3a414d, bronze: 0xb3bcc9, iron: 0x2f3640 },    // 8 흑철
      glow: 0xcfe0f5, spark: 2, len: 1.17, wide: 1.10, grd: 1.22, orn: 2 },
    { mat: { blade: 0xf6ecd2, bladeDark: 0xc3a973, bronze: 0xe0b243, iron: 0x9a7f45 },    // 9 용골
      glow: 0xffd98a, spark: 3, len: 1.21, wide: 1.06, grd: 1.32, orn: 2 },
    { mat: { blade: 0xffe6a8, bladeDark: 0xe3a733, bronze: 0xfff3cd, iron: 0xc08c22 },    // 10 여명
      glow: 0xffc94d, spark: 5, len: 1.26, wide: 1.16, grd: 1.45, orn: 3 }
  ];

  // 상점 아이템 키 → 등급 숫자. 무기·방어구·신발·장신구 **네 슬롯 전부**가 이 한 곳을
  // 지나므로, 여기만 맞으면 아트 전체가 사다리를 따라온다(js/scenes/battle.js 참조).
  //
  // ⚠ 예전에는 키의 숫자를 그대로 등급으로 썼다('w4' → 4). 그러면 **사다리 중간에
  //   단계를 끼울 수 없다** — 키를 다시 매겨야 하는데, 그 순간 이미 'w4'(뼈창)를 낀 채
  //   저장된 캐릭터가 말없이 다른 아이템을 낀 것이 된다. 2026-08-03 에 100~380원 공백을
  //   메우려고 두 단계를 끼우면서 **카탈로그의 배열 순번**을 읽도록 바꿨다.
  //   순서를 정하는 것은 키가 아니라 위치다 — 카탈로그(js/towershopitems.js)가 유일한 출처.
  UI.gearTierOf = function (itemKey) {
    if (!itemKey) return 0;
    var CAT = GAME.TowerShopItems;
    if (CAT && CAT.CATALOG) {
      for (var s in CAT.CATALOG) {
        var list = CAT.CATALOG[s];
        for (var i = 0; i < list.length; i++) {
          if (list[i].key === itemKey) return Math.min(UI.GEAR_TIERS.length - 1, i + 1);
        }
      }
    }
    //  카탈로그가 아직 안 실렸을 때만 쓰는 폴백(스크립트 순서 사고 대비).
    var m = /^[a-z](\d+)$/.exec(String(itemKey));
    return m ? Math.max(0, Math.min(UI.GEAR_TIERS.length - 1, parseInt(m[1], 10))) : 0;
  };

  //  atk : -1(끝까지 당김) … 0(정지) … +1(때린 순간). 0 이면 지금과 픽셀 단위로 동일하다.
  //  guard/gearDrop/spin/tipCap 은 **전투 모션 전용 선택 인자**다.
  //  안 넘기면 전부 0/무제한이라 예전과 픽셀 단위로 같은 그림이 나온다(카드 화면 무변경).
  //  ── 계급·정련이 무기에 실린다 (2026-08-07) ─────────────────────────────────
  //  실측(`tools/unit-art-sheet.js mode=lv`)에서 본 것: 레벨을 올려도 **무기는 한 톨도
  //  안 바뀐다.** 계급 장식만 붙으니 "자란 병사"가 아니라 "훈장을 붙인 계란"이 된다.
  //  → 무기의 **금속부만** 계급 재질로 승격한다(`art.fam`). 크기·길이·형태는 안 바꾼다.
  //  ⚠ **`GEAR_TIERS` 의 `len`/`wide`/`grd` 는 안 빌린다.** 무기가 길어지면 `tipCap`
  //    (판정 사거리) 약속이 흔들린다 — v0.81 폰 창끝 26px 초과 사고가 그것이다.
  //  ⚠ `rf`(정련 0~10)는 **불티 개수 하나**로만 말한다. 채워진 광휘 원은 두 번 시도해
  //    두 번 실패했다(라이트 테마 잉크 윤곽이 회갈색 얼룩을 만든다 — 아래 spark 주석).
  UI.REFINE_SPARK = function (rf) {
    if (!(rf > 0)) return 0;
    return rf >= 10 ? 5 : (rf >= 7 ? 3 : (rf >= 4 ? 2 : 0));
  };

  UI.eggGear = function (g, kind, sx, by, r, color, a, D, reach, atk, guard, gearDrop, spin, tipCap, tier, art, lv, rf) {
    if (!kind) return;
    // ⚠ 아래 본문 전체가 `M`(=UI.MAT)을 직접 읽는다. 등급별 재질을 무기 종류마다
    //   손으로 갈아 끼우면 12종 × 8등급을 다 건드려야 하고 한 곳만 빠져도 조용히 어긋난다.
    //   그래서 **이 함수 안에서만 `M` 을 가린다** — 등급이 없으면 원본 그대로다.
    var TI = UI.GEAR_TIERS[tier || 0];
    var M = UI.MAT;
    lv = (typeof lv === 'number' && lv > 1) ? lv : 1;
    rf = (typeof rf === 'number' && rf > 0) ? rf : 0;
    var rankM = (lv > 1 && art && art.fam) ? UI.rankMat(lv, art) : 0;
    if (TI || rankM || rf > 0) {
      M = {};
      for (var mk in UI.MAT) M[mk] = UI.MAT[mk];
      //  ① 계급 — 금속 세 토큰만 그 유닛의 계열로 갈아끼운다.
      //     나무·가죽·밧줄·잎은 **안 건드린다**(활채가 청동이 되면 활이 아니게 된다).
      if (rankM) {
        M.blade = rankM; M.bladeDark = UI.shade(rankM);
        M.bronze = rankM; M.iron = UI.shade(rankM);
      }
      //  ② 정련 — 금속을 한 단 더 밝게. 색만 바뀌고 형태는 그대로다.
      if (rf > 0) {
        M.blade = UI.lit(M.blade); M.bronze = UI.lit(M.bronze); M.iron = UI.lit(M.iron);
      }
      //  ③ 상점 무기 등급(영웅) — 마지막에 덮는다. 영웅에는 lv/rf 가 없으므로 충돌 없다.
      if (TI) for (var tk in TI.mat) M[tk] = TI.mat[tk];
    }
    // 형태 배수 — 등급이 없으면 전부 1(=예전 그림과 픽셀 단위로 동일).
    var tLen = (TI && TI.len) || 1, tWide = (TI && TI.wide) || 1;
    var tGrd = (TI && TI.grd) || 1, tOrn = (TI && TI.orn) || 0;
    D = UI.asDir(D);
    reach = (typeof reach === 'number' && isFinite(reach)) ? reach : 1;
    atk = (typeof atk === 'number' && isFinite(atk)) ? atk : 0;
    guard = (typeof guard === 'number' && isFinite(guard)) ? guard : 0;
    spin = (typeof spin === 'number' && isFinite(spin)) ? spin : 0;
    var fx = D.fx, fy = D.fy, px = D.px, py = D.py;
    var lw = function (m) { return Math.max(1.2, r * m); };
    var faceOn = 1 - Math.abs(fx);              // 0 옆모습 … 1 정면·정배면
    var spread = UI.GEAR_SPREAD[kind] || 0;
    var sprd = spread * faceOn;
    var drop = (UI.GEAR_DROP[kind] || 0) * faceOn * r
             + ((typeof gearDrop === 'number' && isFinite(gearDrop)) ? gearDrop * r : 0);
    var LP = function (p) { return p + (p < 0 ? -sprd : sprd); };
    // 로컬 → 화면
    var X = function (f, p) { return sx + fx * r * f * reach + px * r * LP(p); };
    var Y = function (f, p, up) { return by + drop + fy * r * f * reach + py * r * LP(p) - r * (up || 0); };
    var hx = X(0.82, 0.30), hy = Y(0.82, 0.30, 0.05);   // 주손 위치
    var side = D.lat >= 0 ? 1 : -1;

    // 고급 무기의 광휘 — 무기 종류별 그림을 건드리지 않고 **손 위치에** 얹는다.
    // 종류마다 날 끝 좌표가 다른데 거기에 맞춰 효과를 짜면 12종을 따로 손봐야 하고,
    // 하나만 빠져도 "이 무기만 안 빛난다"가 된다. 손은 모든 무기가 공유하는 한 점이다.
    // 무기 **뒤에** 깔리도록 여기서(본체 그리기 전에) 그린다.
    //  ── 정련 불티 (2026-08-07) ────────────────────────────────────────────
    //  아래 상점 등급 광휘와 **정확히 같은 그림**을 쓴다. 새 그림을 만들면 두 벌이 되고
    //  나중에 톤을 바꿀 때 한쪽만 고쳐진다(이 파일의 상습 사고 패턴).
    //  ⚠ 정련 3 이하는 색만 바뀌고 점은 안 뜬다 — 화면에 점이 늘어나는 것이
    //    난전에서 그대로 노이즈이므로, 값을 실제로 많이 쓴 사람에게만 준다.
    var rfSpark = UI.REFINE_SPARK(rf);
    if (rfSpark > 0 && r >= 9) {
      var rgo = { x: hx - sx, y: hy - by };
      var rgl = Math.sqrt(rgo.x * rgo.x + rgo.y * rgo.y) || 1;
      var rcx = hx + (rgo.x / rgl) * r * 0.30, rcy = hy + (rgo.y / rgl) * r * 0.30 - r * 0.16;
      var rsd = (sx * 0.7 + by * 1.3);
      var rcol = rf >= 10 ? 0xffc94d : (rf >= 7 ? 0xffd98a : 0xf3e6bd);
      for (var ri = 0; ri < rfSpark; ri++) {
        var ra2 = rsd * 0.05 + ri * (Math.PI * 2 / rfSpark);
        var rrr = r * (0.42 + 0.20 * ((ri % 2) ? 1 : 0.35));
        var rdot = Math.max(0.8, r * 0.062);
        g.fillStyle(rcol, (0.78 + 0.18 * (ri % 2)) * a);
        g.fillEllipse(rcx + Math.cos(ra2) * rrr, rcy + Math.sin(ra2) * rrr * 0.8, rdot * 2, rdot * 2, SM);
      }
    }

    if (TI && TI.spark) {
      // ⚠ **채워진 광휘 원은 못 쓴다.** 두 번 시도해서 두 번 다 실패했다:
      //   0.95r 은 계란 몸을 통째로 덮었고, 0.46r 로 줄여도 라이트 테마의 잉크 윤곽
      //   (`UI.inkLayer`)이 그 원에도 테두리를 둘러 **회갈색 얼룩**으로 보였다
      //   (사냥꾼 T6~T8 이 활 위에 때가 묻은 것처럼 나왔다 — 실측 스크린샷).
      //   그래서 면이 아니라 **점**으로만 말한다. 작은 점은 윤곽이 둘려도 구슬로 읽힌다.
      var gox = hx - sx, goy = hy - by;
      var gol = Math.sqrt(gox * gox + goy * goy) || 1;
      var gcx = hx + (gox / gol) * r * 0.30, gcy = hy + (goy / gol) * r * 0.30 - r * 0.16;
      // 반짝이 — 시간이 아니라 **위치**로 흩는다(렌더 전용이라 상태를 안 만든다).
      var sd = (sx * 0.7 + by * 1.3);
      for (var si = 0; si < TI.spark; si++) {
        var sa = sd * 0.05 + si * (Math.PI * 2 / TI.spark);
        var srr = r * (0.42 + 0.20 * ((si % 2) ? 1 : 0.35));
        g.fillStyle(TI.glow, (0.78 + 0.18 * (si % 2)) * a);
        g.fillEllipse(gcx + Math.cos(sa) * srr, gcy + Math.sin(sa) * srr * 0.8, (Math.max(0.8, r * 0.062)) * 2, (Math.max(0.8, r * 0.062)) * 2, SM);
      }
    }

    // ── 칼날 방향 ────────────────────────────────────────────────────────
    //  지면 정면축(fx, fy)만으로 무기를 뻗으면 **관객 쪽·반대쪽을 볼 때 길이가 0 으로 눌린다.**
    //  실제로 광전사 대검이 정면에서 턱 밑의 짧은 막대가 돼 있었다(스크린샷 확인).
    //  정면축에 '화면 위쪽'을 섞어 어느 방향에서도 최소 길이를 확보한다.
    //  up 이 클수록 세워 들고, 작을수록 앞으로 겨눈다.
    //  옆으로도 밀어준다: 정면·정배면일수록 칼이 얼굴 한가운데를 세로로 가른다.
    //  lateral 은 옆모습(|fx|=1)에서 0, 정면(|fx|=0)에서 최대가 된다.
    function bladeDir(up) {
      var lateral = faceOn * 0.55;
      up += faceOn * UI.GEAR_FACE_UP;         // 정면일수록 세워 든다(얼굴 앞을 비운다)
      var dx = fx + px * lateral, dy = fy - up + py * lateral;
      var l = Math.sqrt(dx * dx + dy * dy) || 1;
      return { x: dx / l, y: dy / l };
    }
    // 휘두르는 순간 날을 줄인다.
    //  ⚠ 이건 멋내기가 아니라 **틀 안에 담기 위한 필수 장치**다. 카드가 캐릭터에 주는
    //    폭은 중심 ±2.05r, 아래는 1.9r 뿐인데(`scenes/tower.js` 가 r 을 그렇게 역산한다),
    //    2.15r 짜리 대검을 눕히면 칼끝이 옆 카드까지 3.1r 를 뻗는다(실측 계산).
    //    빠른 동작에서 길이가 줄어드는 건 2D 애니메이션의 표준 관용(속도 단축)이라
    //    140ms 짜리 타격 구간에서는 "빨라 보인다"로 읽힌다.
    var blLen = 1 - 0.32 * (atk > 0 ? atk : 0);

    // 자루→끝까지 좁아지는 사각 날. 어느 각도에서도 '칼'로 읽힌다.
    function taperBlade(x0, y0, dir, len, w0, w1, fill, edge) {
      len *= blLen; w1 *= blLen;
      var nx = -dir.y, ny = dir.x;
      var x1 = x0 + dir.x * len, y1 = y0 + dir.y * len;
      var pts = [
        { x: x0 + nx * w0, y: y0 + ny * w0 },
        { x: x1 + nx * w1, y: y1 + ny * w1 },
        { x: x1 + dir.x * w1 * 1.6, y: y1 + dir.y * w1 * 1.6 },   // 뾰족한 끝
        { x: x1 - nx * w1, y: y1 - ny * w1 },
        { x: x0 - nx * w0, y: y0 - ny * w0 }
      ];
      g.fillStyle(fill, a);
      g.fillPoints(pts, true);
      if (edge !== false && r >= 10) {           // 날 능선 — 강철에 입체감
        g.lineStyle(Math.max(0.9, r * 0.07), UI.tint(fill, -0.30), a * 0.85);
        g.lineBetween(x0, y0, x1 + dir.x * w1, y1 + dir.y * w1);
      }
    }

    if (kind === 'sword') {                  // 전사 — 짧은 청동검 + 나무 버클러
      var bx = X(0.52, -0.62), byy = Y(0.52, -0.62, 0.02);
      g.fillStyle(M.wood, a); g.fillEllipse(bx, byy, (r * 0.50) * 2, (r * 0.50) * 2, SM);
      //  나무 결 두 줄 — 매끈한 껍질 옆에 거친 나무를 세우는 것이 이 게임의 대비축이다
      //  ("매끈함(껍질) vs 거침(뼈·돌)" — docs/proposals/2026-08-04-art-direction.md).
      if (r >= 10) {
        g.lineStyle(Math.max(0.8, r * 0.05), M.woodDark, a * 0.7);
        g.lineBetween(bx - r * 0.34, byy - r * 0.16, bx + r * 0.34, byy - r * 0.16);
        g.lineBetween(bx - r * 0.30, byy + r * 0.18, bx + r * 0.30, byy + r * 0.18);
      }
      g.lineStyle(lw(0.09), M.woodDark, a); g.strokeEllipse(bx, byy, (r * 0.50) * 2, (r * 0.50) * 2, SM);
      if (r >= 9) UI.sheen(g, bx, byy, r * 0.44, r * 0.34, 0.28 * a, UI.lit(M.wood));
      g.fillStyle(M.bronze, a); g.fillEllipse(bx, byy, (r * 0.17) * 2, (r * 0.17) * 2, SM);

      // 자루 — 손 아래로 짧게
      //  atk 가 각도를 바꾼다: -1 머리 위로 치켜듦 → +1 옆으로 후려침
      var swDir = bladeDir(0.95 - atk * 0.85);
      g.lineStyle(lw(0.17), M.woodDark, a);
      g.lineBetween(hx - swDir.x * r * 0.34, hy - swDir.y * r * 0.34, hx, hy);
      // 날 — 손에서 앞·위로. 예전엔 지면축으로만 뻗어 정면에서 사라졌다.
      taperBlade(hx, hy, swDir, r * 1.35, r * 0.24, r * 0.11, M.blade);
      // 날밑(코등이) — 자루와 날 사이 가로 막대. 이게 있어야 '검'으로 읽힌다.
      g.lineStyle(lw(0.15), M.bronze, a);
      g.lineBetween(hx + swDir.y * r * 0.34, hy - swDir.x * r * 0.34,
                    hx - swDir.y * r * 0.34, hy + swDir.x * r * 0.34);
      g.fillStyle(M.bronze, a);              // 자루 끝 구슬
      g.fillEllipse(hx - swDir.x * r * 0.38, hy - swDir.y * r * 0.38, (Math.max(1, r * 0.11)) * 2, (Math.max(1, r * 0.11)) * 2, SM);

    } else if (kind === 'bow' || kind === 'longbow') {   // 궁수/사냥꾼 — 세로 C
      var big = kind === 'longbow' ? 1.30 : 1.0;
      //  이미지 활은 벡터 곡선보다 폭이 넓고 진해서 같은 앵커면 **얼굴을 덮는다**
      //  (2026-08-21 실측 시트: 0/45/135/180/-135도에서 몸 정중앙). 앞(f)·옆(p)으로
      //  더 밀어 몸 밖에 세운다 — 옆모습은 f 가, 정면·배면은 spread(p) 가 민다.
      var cxp = X(0.95, 0.34), cyp = Y(0.95, 0.34, 0.10);
      // 등급이 오르면 활채가 길어지고(len) 굵어지며(wide) 더 깊게 휜다.
      //  1.05 → 0.80 (2026-08-21): 이미지 활은 벡터 선 두 줄과 달리 **면이 있는 검은
      //  물체**라 스팬 2.7r 이면 계란(2r)보다 커져 어느 앵커에서도 몸을 짓누른다.
      var h = r * 0.80 * big * tLen, bulge = r * 0.46 * big * side * (1 + (tLen - 1) * 0.6);
      var arc = [], k, t;
      for (k = 0; k <= 6; k++) {
        t = -1 + (2 / 6) * k;
        arc.push({ x: cxp + bulge * (1 - t * t), y: cyp + h * t });
      }
      //  생성 이미지 활(하이브리드) — 사냥꾼만. 이미지가 그리면 활대·감개·장식은 생략하되
      //  **시위·화살은 계속 절차로 긋는다**(당김 apex 가 사냥꾼의 주 신호 — v0.81 규율).
      //  이미지 활대는 왼쪽으로 굽어 있으므로 bulge 가 +쪽이면 좌우를 뒤집는다.
      //  유닛 궁수(bow)도 같은 이미지 활을 쓴다(2026-08-21 유닛 승급 1차 — 크기는
      //  h 가 유닛 반지름 기준이라 자동으로 작아진다).
      if (GAME.GearBank &&
          GAME.GearBank.drawSpan(g, 'bow', cxp, cyp - h, cxp, cyp + h, a, bulge > 0, D.back)) {
        // 이미지가 활대를 그렸다
      } else {
      //  활채를 **두 줄**로 긋는다 — 어두운 심 위에 얇고 밝은 겉을 얹으면 둥근 나무봉이
      //  된다. 한 줄짜리 `lineBetween` 은 굵기가 일정해서 언제나 납작한 띠로 보인다
      //  (보스 아트가 `ribbon()` 을 만든 것과 같은 이유 — 여기서는 도형 +1 로 끝낸다).
      g.lineStyle(lw(0.13 * big * tWide), M.woodDark, a);
      g.strokePoints(arc, false, false);
      g.lineStyle(Math.max(0.8, r * 0.06 * big * tWide), M.wood, a);
      g.strokePoints(arc, false, false);
      //  손잡이 감개는 **상시**로 바꾼다(예전엔 상점 등급 1 이상에서만 떴다 = 유닛은 영영 못 봤다)
      g.lineStyle(lw(0.15 * big * tWide), M.leatherDark, a);
      g.lineBetween(cxp + bulge * 0.86, cyp - h * 0.14, cxp + bulge * 0.86, cyp + h * 0.14);
      if (tOrn >= 1) {                          // 활채 중앙 손잡이 감개 — 고급은 청동
        g.lineStyle(lw(0.16 * big * tWide), M.bronze, a);
        g.lineBetween(cxp + bulge * 0.86, cyp - h * 0.16, cxp + bulge * 0.86, cyp + h * 0.16);
      }
      if (tOrn >= 2) {                          // 양 끝 고자 장식
        g.fillStyle(M.bronze, a);
        g.fillEllipse(arc[0].x, arc[0].y, (Math.max(0.9, r * 0.10 * tGrd)) * 2, (Math.max(0.9, r * 0.10 * tGrd)) * 2, SM);
        g.fillEllipse(arc[6].x, arc[6].y, (Math.max(0.9, r * 0.10 * tGrd)) * 2, (Math.max(0.9, r * 0.10 * tGrd)) * 2, SM);
      }
      if (tOrn >= 3) {                          // 활채 바깥으로 뻗은 깃 장식(위·아래)
        g.fillStyle(M.blade, a);
        for (var bw = 0; bw <= 6; bw += 6) {
          var bo = bw === 0 ? -1 : 1;
          g.fillTriangle(arc[bw].x, arc[bw].y,
                         arc[bw].x - bulge * 0.62, arc[bw].y + h * 0.20 * bo,
                         arc[bw].x + bulge * 0.16, arc[bw].y + h * 0.30 * bo);
        }
      }
      }  // (하이브리드 폴백 닫기)
      //  활은 휘두르는 게 아니라 **당겼다 놓는다** — atk<0 시위를 끌고, atk>0 화살이 날아간다.
      var pull = atk < 0 ? -atk : 0, shot = atk > 0 ? atk : 0;
      var apex = cxp - bulge * (0.28 + pull * 0.80 - shot * 0.16);
      g.lineStyle(Math.max(0.8, r * 0.05), M.rope, a * 0.9);        // 시위
      g.lineBetween(arc[0].x, arc[0].y, apex, cyp);
      g.lineBetween(apex, cyp, arc[6].x, arc[6].y);
      var alen = Math.max(0.8, r * 0.06);
      //  ⚠ 화살은 **조준 방향(전방축)** 을 따른다 (2026-08-21 실측 수정).
      //    예전엔 양끝 y 가 cyp 로 같아 **어느 방향을 봐도 화면 수평 막대**였다 —
      //    위를 쏘는데 화살이 옆으로 누워 "몸을 관통하는 막대"로 읽혔다(신고의 정체).
      if (shot > 0.02) {
        // 날아가는 화살. ⚠ 진행도는 shot 이 아니라 **1-shot** 이다 —
        //   k 는 놓은 순간 +1 에서 0 으로 되돌아오므로 shot 을 그대로 쓰면 화살이 뒤로 간다.
        var fly = (1 - shot) * 1.6;
        var f0x = cxp + fx * r * (0.30 + fly), f0y = cyp + fy * r * (0.30 + fly);
        g.lineStyle(alen, M.bone, a * Math.min(1, shot * 2.5));
        g.lineBetween(f0x, f0y, f0x + fx * r * 1.10, f0y + fy * r * 1.10);
      }
      var na = (0.35 - shot) / 0.35;                                // 메긴 화살
      if (na > 0) {
        var nockX = cxp - bulge * (0.34 + pull * 0.80);
        g.lineStyle(alen, M.bone, a * Math.min(1, na));
        g.lineBetween(nockX, cyp, nockX + fx * r * 1.10, cyp + fy * r * 1.10);
      }

    } else if (kind === 'sling') {           // 투석꾼 — 머리 위에서 도는 무릿매
      //  고리는 머리 위라 얼굴을 안 가리지만 **끈이 얼굴을 대각으로 가로질렀다**(실측).
      //  고리도 같이 벌리고, 끈을 손과 같은 쪽에 매 얼굴 앞을 지나지 않게 한다.
      var lxp = sx + fx * r * 0.18 + px * r * sprd, lyp = by - r * 1.38 + fy * r * 0.10 + py * r * sprd;
      var ss = px < -0.01 ? -1 : 1;
      //  끈을 두 겹으로 — 어두운 심 + 밝은 겉. 한 겹이면 고리가 허공에 뜬 원으로 보인다.
      g.lineStyle(lw(0.10), M.ropeDark, a * 0.75);
      g.strokeEllipse(lxp, lyp, r * 1.44, r * 0.56, SM);
      g.lineBetween(hx, hy, lxp + ss * r * 0.68, lyp + r * 0.06);
      g.lineStyle(Math.max(0.8, r * 0.055), M.rope, a * 0.9);
      g.strokeEllipse(lxp, lyp, r * 1.44, r * 0.56, SM);
      g.lineBetween(hx, hy, lxp + ss * r * 0.68, lyp + r * 0.06);
      //  돌 — 아랫배를 어둡게 깔고 그 위에 본색, 좌상단에 리스광. 셋이면 구가 된다.
      g.fillStyle(M.stoneDark, a);
      g.fillEllipse(lxp + ss * r * 0.72, lyp + r * 0.10, (r * 0.26) * 2, (r * 0.26) * 2, SM);
      g.fillStyle(M.stone, a);
      g.fillEllipse(lxp + ss * r * 0.72, lyp + r * 0.04, (r * 0.24) * 2, (r * 0.24) * 2, SM);
      g.fillStyle(M.stoneLite, a);
      g.fillEllipse(lxp + ss * r * 0.66, lyp - r * 0.04, (r * 0.09) * 2, (r * 0.09) * 2, SM);

    } else if (kind === 'javelin') {         // 투창병 — 몸의 두 배짜리 긴 작살
      var t0x = X(-1.00, 0.34), t0y = Y(-1.00, 0.34, 0.58);
      var t1x = X(1.72, 0.34), t1y = Y(1.72, 0.34, 0.30);
      var dxn = t1x - t0x, dyn = t1y - t0y, dl = Math.sqrt(dxn * dxn + dyn * dyn) || 1;
      dxn /= dl; dyn /= dl;
      var jnx = -dyn, jny = dxn;             // 자루에 직교하는 축
      //  자루를 **두 줄**로 — 아래 어두운 선 + 위 밝은 선. 한 줄이면 원통이 아니라 막대다.
      //  (이 무기는 몸의 두 배라 화면에서 가장 긴 직선이고, 그래서 가장 납작해 보였다.)
      g.lineStyle(lw(0.19), M.woodDark, a);
      g.lineBetween(t0x, t0y, t1x, t1y);
      g.lineStyle(Math.max(0.9, r * 0.075), UI.lit(M.wood), a);
      g.lineBetween(t0x + jnx * r * 0.05, t0y + jny * r * 0.05,
                    t1x + jnx * r * 0.05, t1y + jny * r * 0.05);
      g.fillStyle(M.blade, a);               // 촉
      g.fillTriangle(t1x + dxn * r * 0.42, t1y + dyn * r * 0.42,
                     t1x - dyn * r * 0.26, t1y + dxn * r * 0.26,
                     t1x + dyn * r * 0.26, t1y - dxn * r * 0.26);
      if (r >= 10) {                         // 촉 능선 — 금속이 각을 갖는다
        g.lineStyle(Math.max(0.8, r * 0.05), M.bladeDark, a * 0.85);
        g.lineBetween(t1x - dxn * r * 0.10, t1y - dyn * r * 0.10,
                      t1x + dxn * r * 0.40, t1y + dyn * r * 0.40);
      }
      if (r >= 9) {                          // 미늘
        g.fillStyle(M.bone, a);
        g.fillTriangle(t1x - dxn * r * 0.30, t1y - dyn * r * 0.30,
                       t1x - dxn * r * 0.62 - dyn * r * 0.22, t1y - dyn * r * 0.62 + dxn * r * 0.22,
                       t1x - dxn * r * 0.62, t1y - dyn * r * 0.62);
      }

    } else if (kind === 'leafstaff') {       // 약초꾼 — 약초 다발 지팡이
      var stx = X(0.30, 0.66);
      g.lineStyle(lw(0.13), M.woodDark, a);
      g.lineBetween(stx, Y(0.30, 0.66, -0.55), stx, Y(0.30, 0.66, 1.55));
      g.lineStyle(Math.max(0.8, r * 0.055), M.wood, a);
      g.lineBetween(stx - r * 0.03, Y(0.30, 0.66, -0.55), stx - r * 0.03, Y(0.30, 0.66, 1.55));
      if (r >= 10) {                         // 다발을 묶은 밧줄 매듭 — '들고 다니는 약초'
        g.lineStyle(Math.max(1, r * 0.09), M.rope, a);
        g.lineBetween(stx - r * 0.18, Y(0.30, 0.66, 1.44), stx + r * 0.18, Y(0.30, 0.66, 1.44));
      }
      //  잎 세 장을 **3단으로 갈라** 다발로 읽히게 한다. 예전엔 leafDark 한 장 + leaf 두 장
      //  이라 겹친 잎이 한 덩어리로 뭉쳤다(실측 시트에서 초록 얼룩으로 보였다).
      g.fillStyle(M.leafDark, a);
      g.fillEllipse(stx, Y(0.30, 0.66, 1.62), r * 0.72, r * 0.34, SM);
      g.fillStyle(M.leaf, a);
      g.fillEllipse(stx - r * 0.24, Y(0.30, 0.66, 1.82), r * 0.50, r * 0.26, SM);
      g.fillStyle(M.leafLite, a);
      g.fillEllipse(stx + r * 0.26, Y(0.30, 0.66, 1.74), r * 0.46, r * 0.24, SM);
      g.fillStyle(0xd8f5c8, a * 0.55);       // 은은한 회복 기운
      g.fillEllipse(stx, Y(0.30, 0.66, 1.72), (r * 0.30) * 2, (r * 0.30) * 2, SM);

    } else if (kind === 'shellGuard') {      // 되받이 — 되받아치는 갑각 방패
      //  ⚠ 대방패(방패병)와 **반드시 달라야 한다.** 저쪽은 세로로 긴 나무 판자문이고,
      //    이쪽은 **둥근 갑각 + 가운데 뾰족 돌기**다. 돌기가 "받아치는 물건"이라는
      //    신호를 혼자 감당한다(반사는 눈에 안 보이는 기제라 형태로 알려야 한다).
      //  ⚠ 처음엔 갑각(shell)으로 그렸다가 **몸통에 먹혔다.** shell 은 계란 몸 색과
      //    같은 near-white 라, 계란 캐릭터가 들면 실루엣이 통째로 사라진다(시트로 확인).
      //    같은 이유로 껍질 재료는 **몸에서 떨어진 부위**에만 써야 한다. 그래서 돌로 갔다.
      var gcx = X(0.96, 0.44), gcy = Y(0.96, 0.44, 0.04);
      g.fillStyle(M.stone, a);
      g.fillEllipse(gcx, gcy, r * 1.30, r * 1.50, SM);
      g.fillStyle(UI.lit(M.stone), a * 0.55);
      g.fillEllipse(gcx - r * 0.18, gcy - r * 0.22, r * 0.68, r * 0.80, SM);
      g.lineStyle(Math.max(0.8, r * 0.07), UI.tint(M.stone, -0.34), a * 0.9);
      for (var rb = -1; rb <= 1; rb++) {     // 갈비 세 줄 — 갑각이라는 재질 신호
        g.lineBetween(gcx + r * rb * 0.24, gcy - r * 0.62, gcx + r * rb * 0.24, gcy + r * 0.62);
      }
      g.lineStyle(lw(0.11), UI.tint(M.stone, -0.42), a);
      g.strokeCircle(gcx, gcy, r * 0.66);
      g.fillStyle(M.bronze, a);              // 가운데 뿔 — 되받아친다는 유일한 형태 신호
      g.fillTriangle(gcx - r * 0.16, gcy - r * 0.17,
                     gcx - r * 0.16, gcy + r * 0.17,
                     gcx + r * 0.62, gcy);

    } else if (kind === 'stakes') {          // 울짱꾼 — 발치에 비스듬히 박은 말뚝
      //  무기가 아니라 **땅에 박힌 것**이다. 그래서 손높이가 아니라 발치에 그리고,
      //  기울기를 서로 다르게 준다(똑같이 세우면 울타리가 아니라 창꽂이로 보인다).
      var stkX = X(0.62, 0.30), stkY = Y(0.62, 0.30, 0.92);
      var tilt = [-0.34, 0.06, 0.40], len = [1.16, 1.44, 1.08];
      for (var si = 0; si < 3; si++) {
        var tx = stkX + r * (si - 1) * 0.52, ty = stkY;
        var hx = tx + r * tilt[si] * 0.86, hy = ty - r * len[si];
        g.lineStyle(Math.max(1.4, r * 0.20), M.wood, a);
        g.lineBetween(tx, ty, hx, hy);
        g.fillStyle(M.woodDark, a);          // 뾰족한 끝 — 찔린다는 신호
        g.fillTriangle(hx - r * 0.15, hy + r * 0.10, hx + r * 0.15, hy + r * 0.10, hx, hy - r * 0.22);
      }
      if (r >= 9) {                          // 말뚝을 묶은 가로 끈
        g.lineStyle(Math.max(0.8, r * 0.08), M.rope, a * 0.9);
        g.lineBetween(stkX - r * 0.62, stkY - r * 0.62, stkX + r * 0.62, stkY - r * 0.58);
      }

    } else if (kind === 'shellPlate') {      // 껍질장이 — 남에게 붙여 줄 껍질 조각
      //  약초꾼(잎지팡이)과 갈리는 지점: 저쪽은 **긴 막대**, 이쪽은 **손바닥만 한 판**이다.
      var pcx = X(0.86, 0.40), pcy = Y(0.86, 0.40, 0.10);
      g.fillStyle(M.shell, a);
      g.fillTriangle(pcx - r * 0.62, pcy + r * 0.52, pcx + r * 0.62, pcy + r * 0.34, pcx + r * 0.10, pcy - r * 0.72);
      g.fillStyle(UI.lit(M.shell), a * 0.55);
      g.fillTriangle(pcx - r * 0.62, pcy + r * 0.52, pcx + r * 0.10, pcy - r * 0.72, pcx - r * 0.10, pcy + r * 0.20);
      g.lineStyle(Math.max(0.9, r * 0.09), M.shellRim, a);
      g.lineBetween(pcx - r * 0.62, pcy + r * 0.52, pcx + r * 0.10, pcy - r * 0.72);
      g.lineBetween(pcx + r * 0.10, pcy - r * 0.72, pcx + r * 0.62, pcy + r * 0.34);
      g.lineBetween(pcx + r * 0.62, pcy + r * 0.34, pcx - r * 0.62, pcy + r * 0.52);
      if (r >= 9) {                          // 손에 쥔 자리
        g.fillStyle(M.leather, a);
        g.fillRect(pcx - r * 0.18, pcy + r * 0.34, r * 0.44, Math.max(1.2, r * 0.16));
      }

    } else if (kind === 'stoneMaul') {       // 망치잡이 — 자루 긴 돌망치
      //  ⚠ 손도끼(족장)와 **크기와 머리 모양**으로 갈린다: 저쪽은 짧은 자루에 초승달
      //    날, 이쪽은 긴 자루에 **네모난 돌덩이**다. 갑옷을 부수는 물건이라는 게
      //    형태에서 읽혀야 관통이라는 눈에 안 보이는 기제가 납득된다.
      var hax = X(0.90, 0.42), hay = Y(0.90, 0.42, -0.16);
      var btx = hax - r * 0.34, bty = hay + r * 1.42;
      g.lineStyle(Math.max(1.6, r * 0.20), M.wood, a);   // 자루
      g.lineBetween(btx, bty, hax, hay);
      g.fillStyle(M.stone, a);                            // 머리 — 네모난 돌덩이
      g.fillRoundedRect(hax - r * 0.60, hay - r * 0.52, r * 1.20, r * 0.92, r * 0.10);
      g.fillStyle(UI.lit(M.stone), a * 0.55);
      g.fillRect(hax - r * 0.60, hay - r * 0.52, r * 1.20, r * 0.30);
      g.fillStyle(UI.tint(M.stone, -0.26), a * 0.6);
      g.fillRect(hax - r * 0.60, hay + r * 0.16, r * 1.20, r * 0.24);
      g.lineStyle(lw(0.09), UI.tint(M.stone, -0.34), a);
      g.strokeRoundedRect(hax - r * 0.60, hay - r * 0.52, r * 1.20, r * 0.92, r * 0.10);
      if (r >= 10) {                          // 자루를 감은 가죽 — 무거운 물건이라는 신호
        g.fillStyle(M.leatherDark, a);
        g.fillRect(btx + r * 0.06, bty - r * 0.52, r * 0.26, r * 0.34);
      }

    } else if (kind === 'hive') {            // 벌집꾼 — 들고 다니는 말벌집
      //  ⚠ 늪지기의 수액 단지와 갈리는 지점: 단지는 **매끈한 항아리**, 벌집은
      //    **층진 원뿔 + 아래 구멍**이다. 죽으면 터지는 물건이라는 걸 형태가 말해야
      //    "왜 이 자리에 세웠나"가 읽힌다.
      //  ⚠ 처음엔 너무 작아 갈색 덩어리로만 읽혔다 — 늪지기의 단지와 구분하려면
      //    **층이 세 겹이라는 게 보일 만큼** 커야 한다.
      var hvx = X(0.86, 0.42), hvy = Y(0.86, 0.42, -0.10);
      g.fillStyle(M.clay, a);
      for (var hl = 0; hl < 3; hl++) {       // 층진 벌집 — 아래로 갈수록 넓다
        var hw = r * (0.52 + hl * 0.22), hy2 = hvy - r * 0.58 + r * hl * 0.44;
        g.fillEllipse(hvx, hy2, hw * 2, r * 0.52, SM);
      }
      g.fillStyle(UI.lit(M.clay), a * 0.5);
      g.fillEllipse(hvx - r * 0.20, hvy - r * 0.56, r * 0.56, r * 0.28, SM);
      g.lineStyle(Math.max(0.8, r * 0.07), UI.tint(M.clay, -0.34), a * 0.9);
      for (var hs = 0; hs < 2; hs++) {       // 층 경계 — '겹겹'이 읽히는 유일한 신호
        g.lineBetween(hvx - r * (0.56 + hs * 0.20), hvy - r * 0.30 + r * hs * 0.44,
                      hvx + r * (0.56 + hs * 0.20), hvy - r * 0.30 + r * hs * 0.44);
      }
      g.fillStyle(0x14161c, a * 0.85);       // 아래 구멍 — 벌이 나오는 자리
      g.fillEllipse(hvx, hvy + r * 0.72, r * 0.40, r * 0.28, SM);
      if (r >= 10) {                         // 벌 두 마리 — 크게 그릴 때만
        g.fillStyle(M.bronze, a);
        g.fillEllipse(hvx + r * 0.72, hvy - r * 0.30, r * 0.16, r * 0.12, 8);
        g.fillEllipse(hvx - r * 0.66, hvy + r * 0.14, r * 0.14, r * 0.11, 8);
      }

    } else if (kind === 'vinelash') {        // 덩굴채 — 늘어뜨린 가시덩굴 채찍
      //  ⚠ 궁수의 활·투창병의 창처럼 **직선**이면 안 된다. 끌어당기는 물건이라
      //    휘어 있어야 한다 — 마디마다 각을 꺾어 늘어뜨린다.
      //  ⚠ 처음엔 마디를 **아래로만** 내렸더니(dy 0.5~0.6 × 4마디) 채찍이 발밑까지
      //    내려가 몸 뒤로 숨어 시트에서 안 보였다. 옆으로 뻗으며 늘어지게 바꿨다.
      var vx = X(0.92, 0.42), vy = Y(0.92, 0.42, -0.52);
      //  ⚠ 두 번째 실패: 방향은 고쳤는데 **너무 짧아서**(총 0.5r) 실물 크기 r=13 에선
      //    손 옆의 얼룩으로만 보였다. 대방패가 2.2r 인 걸 보고 길이를 그 급으로 올렸다.
      var px = vx, py = vy, seg = [[0.74, 0.28], [0.58, 0.44], [0.74, 0.24], [0.52, 0.40]];
      g.lineStyle(Math.max(1.3, r * 0.15), M.wood, a);
      for (var vi = 0; vi < seg.length; vi++) {
        var nx2 = px + r * seg[vi][0], ny2 = py + r * seg[vi][1];
        g.lineBetween(px, py, nx2, ny2);
        px = nx2; py = ny2;
      }
      g.fillStyle(M.woodDark, a);            // 가시 — 마디마다 하나
      var sx2 = vx, sy2 = vy;
      for (var vj = 0; vj < seg.length; vj++) {
        sx2 += r * seg[vj][0]; sy2 += r * seg[vj][1];
        if (r < 9) continue;
        g.fillTriangle(sx2 - r * 0.05, sy2, sx2 + r * 0.05, sy2,
                       sx2 + r * (vj % 2 ? -0.26 : 0.26), sy2 - r * 0.14);
      }

    } else if (kind === 'ashpouch') {        // 잿가루꾼 — 재를 뿌리는 자루
      var apx = X(0.84, 0.40), apy = Y(0.84, 0.40, 0.06);
      g.fillStyle(M.leather, a);
      g.fillEllipse(apx, apy + r * 0.20, r * 0.90, r * 1.02, SM);
      g.fillStyle(M.leatherDark, a * 0.6);
      g.fillEllipse(apx + r * 0.16, apy + r * 0.24, r * 0.40, r * 0.58, SM);
      g.fillStyle(M.rope, a);                // 목을 조인 끈
      g.fillRect(apx - r * 0.30, apy - r * 0.32, r * 0.60, Math.max(1.2, r * 0.14));
      if (r >= 9) {                          // 흩날리는 재 — 이 유닛의 유일한 '무엇을 하나' 신호
        g.fillStyle(M.stone, a * 0.75);
        var ad = [[0.62, -0.52, 0.13], [0.92, -0.26, 0.10], [0.70, -0.02, 0.08]];
        for (var ai2 = 0; ai2 < ad.length; ai2++) {
          g.fillEllipse(apx + r * ad[ai2][0], apy + r * ad[ai2][1],
                        r * ad[ai2][2] * 2, r * ad[ai2][2] * 2, 8);
        }
      }

    } else if (kind === 'cairn') {           // 돌쌓이 — 팔에 안은 돌덩이
      var cnx = X(0.82, 0.40), cny = Y(0.82, 0.40, 0.22);
      g.fillStyle(M.stone, a);
      g.fillRoundedRect(cnx - r * 0.52, cny - r * 0.44, r * 1.04, r * 0.88, r * 0.16);
      g.fillStyle(UI.lit(M.stone), a * 0.55);
      g.fillRect(cnx - r * 0.52, cny - r * 0.44, r * 1.04, r * 0.28);
      g.lineStyle(lw(0.10), UI.tint(M.stone, -0.40), a);
      g.strokeRoundedRect(cnx - r * 0.52, cny - r * 0.44, r * 1.04, r * 0.88, r * 0.16);

    } else if (kind === 'knotrope') {        // 매듭지기 — 매듭 지은 밧줄 뭉치
      //  ⚠ 덩굴채의 채찍과 **길이로** 갈린다: 저쪽은 2.2r 늘어진 선, 이쪽은 손 안에
      //    뭉친 고리 두 개다. 늘어뜨리면 둘이 같아진다.
      var krx = X(0.86, 0.40), kry = Y(0.86, 0.40, 0.04);
      g.lineStyle(Math.max(1.3, r * 0.15), M.rope, a);
      g.strokeCircle(krx - r * 0.26, kry, r * 0.40);
      g.strokeCircle(krx + r * 0.28, kry + r * 0.14, r * 0.34);
      g.fillStyle(UI.tint(M.rope, -0.26), a);  // 가운데 매듭
      g.fillEllipse(krx + r * 0.02, kry + r * 0.06, r * 0.34, r * 0.30, SM);

    } else if (kind === 'firepot') {         // 불씨꾼 — 불씨를 담은 옹기
      //  ⚠ 늪지기의 수액 단지와 **아가리**로 갈린다: 저쪽은 막힌 항아리, 이쪽은
      //    입이 벌어져 있고 그 안이 붉다. 던지는 물건이라는 걸 색이 말한다.
      var fpx = X(0.84, 0.40), fpy = Y(0.84, 0.40, 0.10);
      g.fillStyle(M.clay, a);
      g.fillEllipse(fpx, fpy + r * 0.16, r * 0.94, r * 0.98, SM);
      g.fillStyle(UI.tint(M.clay, -0.28), a * 0.55);
      g.fillEllipse(fpx + r * 0.18, fpy + r * 0.20, r * 0.42, r * 0.62, SM);
      g.fillStyle(UI.tint(M.clay, -0.34), a);   // 벌어진 아가리
      g.fillEllipse(fpx, fpy - r * 0.34, r * 0.60, r * 0.24, SM);
      g.fillStyle(0xd8451a, a);                 // 안의 불
      g.fillEllipse(fpx, fpy - r * 0.36, r * 0.38, r * 0.15, SM);
      if (r >= 9) {                             // 피어오르는 불꽃
        g.fillStyle(0xff8c2e, a * 0.95);
        g.fillTriangle(fpx - r * 0.16, fpy - r * 0.40, fpx + r * 0.16, fpy - r * 0.40,
                       fpx + r * 0.02, fpy - r * 0.86);
      }

    } else if (kind === 'towerShield') {     // 방패병 — 몸을 가리는 나무 대방패
      // 몸 앞으로 충분히 내밀어야 투구가 방패 위로 보인다(가려버리면 종류를 못 읽는다)
      var cx2 = X(1.02, 0.42), cy2 = Y(1.02, 0.42, 0.02);
      //  생성 이미지 방패(2026-08-21 유닛 승급 1차) — 원형 방패를 세로로 살짝 늘려
      //  대방패 실루엣 유지. 준비 전엔 아래 벡터.
      if (GAME.GearBank && GAME.GearBank.place(g, 'roundshield',
            cx2, cy2, r * 1.30, r * 2.10, a)) {
        // 이미지가 그렸다
      } else {
      g.fillStyle(M.wood, a);
      g.fillRoundedRect(cx2 - r * 0.58, cy2 - r * 1.05, r * 1.16, r * 2.20, r * 0.26);
      //  판자 세 장의 **밝기를 다르게** — 광원이 좌상단이므로 왼쪽 판자가 가장 밝다.
      //  예전에는 세 장이 같은 색이고 경계선만 있어서 통짜 나무 문짝으로 보였다.
      g.fillStyle(UI.lit(M.wood), a * 0.55);
      g.fillRect(cx2 - r * 0.58, cy2 - r * 1.05, r * 0.39, r * 2.20);
      g.fillStyle(M.woodDark, a * 0.42);
      g.fillRect(cx2 + r * 0.19, cy2 - r * 1.05, r * 0.39, r * 2.20);
      g.lineStyle(lw(0.11), M.woodDark, a);
      g.strokeRoundedRect(cx2 - r * 0.58, cy2 - r * 1.05, r * 1.16, r * 2.20, r * 0.26);
      g.lineStyle(Math.max(0.8, r * 0.06), M.woodDark, a * 0.8);
      g.lineBetween(cx2 - r * 0.19, cy2 - r * 0.95, cx2 - r * 0.19, cy2 + r * 1.02);
      g.lineBetween(cx2 + r * 0.19, cy2 - r * 0.95, cx2 + r * 0.19, cy2 + r * 1.02);
      if (r >= 10) {                         // 테 리벳 — 판자를 잡아 주는 물건이 보인다
        g.fillStyle(M.bronze, a * 0.95);
        for (var ri2 = -1; ri2 <= 1; ri2++) {
          g.fillEllipse(cx2, cy2 + r * 0.82 * ri2, (Math.max(1, r * 0.075)) * 2, (Math.max(1, r * 0.075)) * 2, 8);
        }
      }
      g.fillStyle(M.bronze, a);              // 방패 배꼽
      g.fillEllipse(cx2, cy2, (r * 0.28) * 2, (r * 0.28) * 2, SM);
      g.fillStyle(UI.lit(M.bronze), a);
      g.fillEllipse(cx2 - r * 0.08, cy2 - r * 0.08, (r * 0.10) * 2, (r * 0.10) * 2, SM);
      }  // (하이브리드 폴백 닫기)

    } else if (kind === 'handaxe') {         // 족장 — 던지는 손도끼 + 깃대
      var pxp = X(0.05, -0.85);
      g.lineStyle(lw(0.10), M.wood, a);      // 등에 세운 깃대
      g.lineBetween(pxp, Y(0.05, -0.85, -0.40), pxp, Y(0.05, -0.85, 2.05));
      g.fillStyle(M.quill, a);
      g.fillTriangle(pxp, Y(0.05, -0.85, 2.10), pxp - r * 0.34, Y(0.05, -0.85, 1.45), pxp + r * 0.34, Y(0.05, -0.85, 1.45));

      g.lineStyle(lw(0.14), M.woodDark, a);
      g.lineBetween(hx, hy, X(1.55, 0.30), Y(1.55, 0.30, 0.05));
      g.lineStyle(Math.max(0.8, r * 0.055), M.wood, a);
      g.lineBetween(hx, hy - r * 0.04, X(1.55, 0.30), Y(1.55, 0.30, 0.09));
      if (r >= 10) {                         // 손잡이 가죽 감기 두 줄
        g.lineStyle(Math.max(0.9, r * 0.08), M.leatherDark, a * 0.9);
        g.lineBetween(X(0.72, 0.24), Y(0.72, 0.24, 0.02), X(0.72, 0.36), Y(0.72, 0.36, 0.02));
        g.lineBetween(X(0.92, 0.24), Y(0.92, 0.24, 0.02), X(0.92, 0.36), Y(0.92, 0.36, 0.02));
      }
      var axeBlade = [
        { x: X(1.14, 0.30), y: Y(1.14, 0.30, 0.10) },
        { x: X(1.52, 0.30), y: Y(1.52, 0.30, 0.14) },
        { x: X(1.62, 0.30), y: Y(1.62, 0.30, 0.72) },
        { x: X(1.30, 0.30), y: Y(1.30, 0.30, 0.88) },
        { x: X(1.06, 0.30), y: Y(1.06, 0.30, 0.60) }
      ];
      g.fillStyle(M.bronze, a);              // 자루 한쪽에만 붙는 반달 날
      g.fillPoints(axeBlade, true);
      if (r >= 10) {                         // 날 능선 — 반달이 판때기가 아니라 날이 된다
        g.lineStyle(Math.max(0.8, r * 0.06), UI.shade(M.bronze), a * 0.9);
        g.lineBetween(X(1.16, 0.30), Y(1.16, 0.30, 0.24), X(1.34, 0.30), Y(1.34, 0.30, 0.74));
      }

    } else if (kind === 'sapjar') {          // 늪지기 — 끈끈한 수액 단지
      var jx = X(0.86, 0.16), jy = Y(0.86, 0.16, 0.05);
      //  ⚠ 예전엔 `UI.tint(M.clay, -0.30)` — 흑백 축으로만 밀어 그늘이 **회색 진흙**이 됐다.
      //    이 파일이 `deriveMatTones` 에 스스로 적어 둔 경고를 유닛 쪽에서 그대로 어기고
      //    있었다. 3단(clayDark / clay / clayLite)으로 바꾼다.
      g.fillStyle(M.clayDark, a);            // 아랫배 그늘
      g.fillEllipse(jx, jy + r * 0.10, r * 1.06, r * 0.82, SM);
      g.fillStyle(M.clay, a);
      g.fillEllipse(jx, jy, r * 1.02, r * 0.78, SM);
      if (r >= 9) UI.sheen(g, jx, jy, r * 0.40, r * 0.30, 0.30 * a, M.clayLite);
      g.fillStyle(M.clayDark, a);
      g.fillRect(jx - r * 0.28, jy - r * 0.58, r * 0.56, r * 0.24);
      g.fillStyle(M.goo, a);                 // 흘러넘치는 수액
      g.fillEllipse(jx, jy - r * 0.52, r * 0.52, r * 0.20, SM);
      g.fillEllipse(jx + r * 0.30, jy + r * 0.06, (r * 0.14) * 2, (r * 0.14) * 2, SM);
      g.fillEllipse(jx + r * 0.40, jy + r * 0.38, (r * 0.10) * 2, (r * 0.10) * 2, SM);
      if (r >= 10) {                         // 수액 윗면 — 끈적한 것은 빛을 받는 면이 넓다
        g.fillStyle(M.gooLite, a * 0.85);
        g.fillEllipse(jx - r * 0.06, jy - r * 0.56, r * 0.30, r * 0.11, SM);
      }

    } else if (kind === 'crossbowNest') {    // 쇠뇌 진지 — 통나무 방벽 + 거치 쇠뇌
      g.lineStyle(lw(0.17), M.woodDark, a);
      g.lineBetween(X(-0.55, 0), Y(-0.55, 0, 0.55), X(1.55, 0), Y(1.55, 0, 0.55));
      g.lineStyle(lw(0.13), M.woodDark, a);  // 활대 (정면 수직)
      g.lineBetween(X(1.05, -1.10), Y(1.05, -1.10, 0.55), X(1.05, 1.10), Y(1.05, 1.10, 0.55));
      g.lineStyle(Math.max(0.8, r * 0.055), UI.lit(M.wood), a);
      g.lineBetween(X(1.05, -1.10), Y(1.05, -1.10, 0.60), X(1.05, 1.10), Y(1.05, 1.10, 0.60));
      g.lineStyle(Math.max(0.8, r * 0.05), M.rope, a);
      g.lineBetween(X(1.05, -1.10), Y(1.05, -1.10, 0.55), X(0.55, 0), Y(0.55, 0, 0.55));
      g.lineBetween(X(0.55, 0), Y(0.55, 0, 0.55), X(1.05, 1.10), Y(1.05, 1.10, 0.55));
      g.fillStyle(M.bone, a);
      g.fillEllipse(X(1.35, 0), Y(1.35, 0, 0.55), (r * 0.16) * 2, (r * 0.16) * 2, SM);

      // 방벽 — 몸통 아래쪽을 가려 "반쯤 숨은 계란" 실루엣을 만든다
      g.fillStyle(M.wood, a);
      g.fillRect(sx - r * 1.32, by + r * 0.04, r * 2.64, r * 1.26);
      g.fillStyle(M.woodDark, a);
      for (var w = 0; w < 4; w++) {
        g.fillRect(sx - r * 1.32 + r * 0.66 * w + r * 0.60, by + r * 0.04, Math.max(1, r * 0.08), r * 1.26);
      }
      g.fillStyle(UI.lit(M.wood), a);
      g.fillRect(sx - r * 1.32, by + r * 0.04, r * 2.64, Math.max(1.4, r * 0.16));
      //  통나무 끝단 — 원 네 개. 이게 없으면 방벽은 **판때기 한 장**이다(실측 시트에서
      //  쇠뇌 진지가 갈색 상자로 보였다). 원 하나로 "통나무를 쌓았다"가 즉시 읽힌다.
      if (r >= 10) {
        for (var wl = 0; wl < 4; wl++) {
          var wlx = sx - r * 1.32 + r * 0.66 * wl + r * 0.33;
          g.fillStyle(M.woodDark, a * 0.9);
          g.fillEllipse(wlx, by + r * 0.72, (r * 0.24) * 2, (r * 0.24) * 2, 8);
          g.fillStyle(UI.lit(M.wood), a * 0.75);
          g.fillEllipse(wlx - r * 0.04, by + r * 0.68, (r * 0.12) * 2, (r * 0.12) * 2, 8);
        }
      }

    } else if (kind === 'greatsword') {      // 광전사 — 양손 대검
      // 영웅 중 가장 큰 무기다. 여기가 눌리면 광전사가 '아무것도 안 든 계란'이 된다
      // — 예전 구현은 정면에서 정확히 그 상태였다(길이 1r 짜리 막대).
      // 어깨 위로 크게 세워 들어 어느 각도에서도 실루엣이 남게 했다.
      //  atk 로 머리 위(-1) ↔ 앞으로 내려찍기(+1) 사이를 쓸어내린다. 대검이라 각이 더 크다.
      var gsDir = bladeDir(1.55 - atk * 1.90);
      var gsGripX = hx - gsDir.x * r * 0.30, gsGripY = hy - gsDir.y * r * 0.30;
      // 자루에 직교하는 축(날밑·날개·톱니가 전부 이 축을 쓴다)
      var gsPx = gsDir.y, gsPy = -gsDir.x;
      // 생성 이미지 대검(하이브리드) — 준비돼 있으면 이미지가 그리고 벡터는 통째로 생략.
      // tipLen 은 벡터판 칼끝과 같은 값(0.34r + 날 길이) — 그림과 판정이 어긋나지 않게.
      //  등급 색을 이미지에도 싣는다 — M.blade 는 이미 등급 재질(청동·흑요석…)이다.
      //  흰색과 절반 섞어 원본 질감을 남기며 물들인다(순색 틴트는 손잡이까지 죽인다).
      if (GAME.GearBank && GAME.GearBank.draw(g, 'greatsword', gsGripX, gsGripY,
            gsDir.x, gsDir.y, r * 0.34 + r * 2.15 * tLen, a,
            (tGrd > 1 || tOrn > 0) ? UI.mix(0xffffff, M.blade, 0.62) : 0)) {
        // 이미지가 그렸다
      } else {
      // 두 손 자루
      g.lineStyle(lw(0.20), M.woodDark, a);
      g.lineBetween(gsGripX - gsDir.x * r * 0.55, gsGripY - gsDir.y * r * 0.55, gsGripX, gsGripY);
      g.fillStyle(M.bronze, a);              // 자루 끝 구슬
      var gsPomX = gsGripX - gsDir.x * r * 0.62, gsPomY = gsGripY - gsDir.y * r * 0.62;
      g.fillEllipse(gsPomX, gsPomY, (Math.max(1.2, r * 0.15 * tGrd)) * 2, (Math.max(1.2, r * 0.15 * tGrd)) * 2, SM);
      // 날 — 몸 높이의 2배 남짓. 등급이 오르면 길고 두꺼워진다.
      var gsLen = r * 2.15 * tLen, gsW0 = r * 0.34 * tWide, gsW1 = r * 0.17 * tWide;
      taperBlade(gsGripX + gsDir.x * r * 0.34, gsGripY + gsDir.y * r * 0.34,
                 gsDir, gsLen, gsW0, gsW1, M.blade);
      // 날밑 — 자루에 직교하는 굵은 막대
      var gsG = r * 0.52 * tGrd;
      g.lineStyle(lw(0.17 * tGrd), M.bronze, a);
      g.lineBetween(gsGripX + gsPx * gsG + gsDir.x * r * 0.30,
                    gsGripY + gsPy * gsG + gsDir.y * r * 0.30,
                    gsGripX - gsPx * gsG + gsDir.x * r * 0.30,
                    gsGripY - gsPy * gsG + gsDir.y * r * 0.30);
      if (tOrn >= 1) {                       // 자루 끝 보석
        g.fillStyle(M.blade, a);
        g.fillEllipse(gsPomX, gsPomY, (Math.max(0.8, r * 0.075 * tGrd)) * 2, (Math.max(0.8, r * 0.075 * tGrd)) * 2, SM);
      }
      if (tOrn >= 2) {                       // 날밑 날개 — 위로 젖혀진 두 갈래
        var gsWx = gsGripX + gsDir.x * r * 0.30, gsWy = gsGripY + gsDir.y * r * 0.30;
        g.fillStyle(M.bronze, a);
        for (var gw = -1; gw <= 1; gw += 2) {
          g.fillTriangle(gsWx + gsPx * gsG * gw, gsWy + gsPy * gsG * gw,
                         gsWx + gsPx * gsG * 1.42 * gw + gsDir.x * r * 0.34,
                         gsWy + gsPy * gsG * 1.42 * gw + gsDir.y * r * 0.34,
                         gsWx + gsPx * gsG * 0.55 * gw + gsDir.x * r * 0.40,
                         gsWy + gsPy * gsG * 0.55 * gw + gsDir.y * r * 0.40);
        }
      }
      if (tOrn >= 3) {                       // 날 한가운데 홈(피홈) + 날끝 가시
        g.lineStyle(Math.max(0.9, r * 0.06), M.bladeDark, a * 0.85);
        g.lineBetween(gsGripX + gsDir.x * r * 0.55, gsGripY + gsDir.y * r * 0.55,
                      gsGripX + gsDir.x * (r * 0.34 + gsLen * 0.82),
                      gsGripY + gsDir.y * (r * 0.34 + gsLen * 0.82));
        var gsTx = gsGripX + gsDir.x * (r * 0.34 + gsLen * 0.55);
        var gsTy = gsGripY + gsDir.y * (r * 0.34 + gsLen * 0.55);
        g.fillStyle(M.bronze, a);
        for (var gs2 = -1; gs2 <= 1; gs2 += 2) {
          g.fillTriangle(gsTx + gsPx * gsW0 * 0.55 * gs2, gsTy + gsPy * gsW0 * 0.55 * gs2,
                         gsTx + gsPx * gsW0 * 1.55 * gs2, gsTy + gsPy * gsW0 * 1.55 * gs2,
                         gsTx + gsPx * gsW0 * 0.55 * gs2 + gsDir.x * r * 0.30,
                         gsTy + gsPy * gsW0 * 0.55 * gs2 + gsDir.y * r * 0.30);
        }
      }
      }  // (하이브리드 폴백 닫기 — 이미지 준비 전에만 위 벡터 대검이 그려진다)

    } else if (kind === 'hookShield') {      // 파수꾼 — 연꼴 방패 + 갈고리 창
      //  휘두르는 무기가 아니라 **찔러 넣었다 당기는** 무기다 → 자기 축으로 늘였다 줄인다.
      //  방패는 같이 나가면 안 되므로(막고 있는 물건이다) 창만 ex 를 곱하고 방패는 살짝 든다.
      //  ⚠ 자루 밑동(f=-0.90, up=0.30)을 축으로 **거기서부터** 늘여야 한다.
      //    f 와 up 을 원점에서 각각 배수하면 정면에서 두 성분이 상쇄돼 창끝이 제자리다(실측 계산).
      // ⚠ **창끝이 판정 사거리를 넘으면 안 된다.** 창끝의 앞뒤축 성분은 유닛 중심에서
      //   `(-0.90 + 2.50·ex)·r` 인데, `UNIT_DRAW_SCALE` 은 폰에서 1.30 배로 키우고
      //   `WORLD_SCALE` 은 폰에서 사거리를 0.556 배로 **줄인다**. 두 배율이 반대로 가서
      //   폰에서 창이 84.6px 그려지는데 판정은 58.7px 까지였다(실측, 26px 초과).
      //   회피 게임에서 "어디까지 닿는가"를 그림으로 배우는데 그 그림이 거짓말을 한다.
      //   → 호출부가 준 `tipCap`(px) 안으로 신장을 묶는다. 안 주면(카드 화면) 무제한이다.
      // ⚠ 등급의 `len` 은 **창을 늘이는 데 쓰지 않는다.** 창끝은 판정 사거리(tipCap)에
      //   묶여 있고 그 약속이 이 게임의 회피 문법이다(v0.81 에서 26px 초과로 겪은 사고).
      //   등급은 방패 크기·장식으로만 드러낸다 — 아래 kite 참조.
      var ex = 1 + (atk > 0 ? atk * 0.60 : atk * 0.25);
      if (typeof tipCap === 'number' && isFinite(tipCap) && tipCap > 0 && r > 0) {
        var exMax = (tipCap / r + 0.90) / 2.50;
        if (exMax < 1) exMax = 1;                  // 쉬는 자세보다 짧아지지는 않는다
        if (ex > exMax) ex = exMax;
      }
      var sh = (atk > 0 ? atk : 0) * 0.26 + guard;
      var hf = function (d) { return -0.90 + d * ex; };            // f 성분
      var hu = function (d) { return 0.30 + d * ex; };             // up 성분
      //  생성 이미지 창(하이브리드) — 창끝(이미지 위)→자루 밑동으로 눕힌다.
      //  찌르기(ex)는 양끝점이 이미 늘어나 있어 이미지가 공짜로 따라간다.
      if (GAME.GearBank && GAME.GearBank.drawSpan(g, 'hookspear',
            X(hf(2.50), -0.55), Y(hf(2.50), -0.55, hu(1.12)),
            X(-0.90, -0.55), Y(-0.90, -0.55, 0.30), a, px < 0)) {
        // 이미지가 창을 그렸다
      } else {
      g.lineStyle(lw(0.13), M.wood, a);      // 갈고리 창 (E = 끌어당김)
      g.lineBetween(X(-0.90, -0.55), Y(-0.90, -0.55, 0.30),
                    X(hf(2.45), -0.55), Y(hf(2.45), -0.55, hu(1.05)));
      g.fillStyle(M.iron, a);
      g.fillTriangle(X(hf(2.50), -0.55), Y(hf(2.50), -0.55, hu(1.12)),
                     X(hf(2.10), -0.55), Y(hf(2.10), -0.55, hu(1.22)),
                     X(hf(2.32), -0.55), Y(hf(2.32), -0.55, hu(0.68)));
      }

      // 방패는 몸 옆·앞으로 크게 빼둔다 — 정면에 붙이면 계란이 통째로 사라진다
      // 때릴 때는 들어올리며 바깥으로 내민다(방패 밀치기) — 창과 같이 나가면 안 된다.
      var kx = X(1.14, 0.66 + sh * 0.7), ky = Y(1.14, 0.66 + sh * 0.7, 0.02 + sh);
      // 방패가 등급을 나른다 — 세로로 길어지고(len) 가로로 두꺼워진다(wide).
      var kV = tLen, kH = tWide;
      //  생성 이미지 방패(하이브리드) — 정면 그림을 세로>가로로 살짝 눌러
      //  "약간 비껴 든" 느낌을 만든다. 준비 전엔 아래 벡터 연꼴 방패.
      if (GAME.GearBank && GAME.GearBank.place(g, 'roundshield',
            kx, ky + r * 0.10, r * 1.50 * kH, r * 1.95 * kV, a)) {
        // 이미지가 방패를 그렸다 — 연꼴·보스·장식 생략
      } else {
      var kite = [
        { x: kx - r * 0.56 * kH, y: ky - r * 0.88 * kV },
        { x: kx + r * 0.56 * kH, y: ky - r * 0.88 * kV },
        { x: kx + r * 0.52 * kH, y: ky + r * 0.52 * kV },
        { x: kx, y: ky + r * 1.20 * kV },
        { x: kx - r * 0.52 * kH, y: ky + r * 0.52 * kV }
      ];
      g.fillStyle(M.iron, a); g.fillPoints(kite, true);
      g.lineStyle(lw(0.11 * tGrd), UI.tint(M.iron, 0.30), a); g.strokePoints(kite, true, true);
      if (tOrn >= 3) {                       // 테두리 한 겹 더 — 두꺼운 판금 느낌
        g.lineStyle(Math.max(0.8, r * 0.05), M.bronze, a * 0.9);
        g.strokePoints([
          { x: kx - r * 0.40 * kH, y: ky - r * 0.66 * kV },
          { x: kx + r * 0.40 * kH, y: ky - r * 0.66 * kV },
          { x: kx + r * 0.37 * kH, y: ky + r * 0.38 * kV },
          { x: kx, y: ky + r * 0.90 * kV },
          { x: kx - r * 0.37 * kH, y: ky + r * 0.38 * kV }
        ], true, true);
      }
      g.fillStyle(M.bronze, a);
      g.fillEllipse(kx, ky - r * 0.10, (r * 0.24 * tGrd) * 2, (r * 0.24 * tGrd) * 2, SM);
      if (tOrn >= 1) {                       // 방패 심 보석
        g.fillStyle(M.blade, a);
        g.fillEllipse(kx, ky - r * 0.10, (r * 0.11 * tGrd) * 2, (r * 0.11 * tGrd) * 2, SM);
      }
      if (tOrn >= 2) {                       // 위 모서리 두 뿔
        g.fillStyle(M.bronze, a);
        for (var kw = -1; kw <= 1; kw += 2) {
          g.fillTriangle(kx + r * 0.56 * kH * kw, ky - r * 0.88 * kV,
                         kx + r * 0.80 * kH * kw, ky - r * 1.16 * kV,
                         kx + r * 0.30 * kH * kw, ky - r * 0.88 * kV);
        }
      }
      }  // (하이브리드 폴백 닫기)
    }
  };

  // ── 다리 ──────────────────────────────────────────────────────
  //  G 가 null 이면 v1 과 완전히 같은 좌표를 그린다.
  //  L : 전투 모션의 발 자세 { f, spread } — 선택 인자다. 안 넘기면 걸음걸이만 그린다.
  //  ⚠ `spread` 가 필요한 이유: 정면(D.fx≈0)에서는 `legFA` 의 앞뒤 변위가 화면에서
  //    통째로 죽는다. 옆으로 벌려야 정면에서도 "발을 내디뎠다"가 남는다.
  UI.eggLegs = function (g, art, sx, by, sy, r, color, a, D, G, L) {
    if (art.squat || art.ground) return;
    D = UI.asDir(D);
    var lw = Math.max(1.4, r * 0.16);
    var swx = 0, swy = 0, bob = 0;
    if (G) { swx = r * G.sway * D.px; swy = r * G.sway * D.py; bob = r * G.bob; }

    var fex = [0, 0], fey = [0, 0], i, s;
    for (i = 0; i < 2; i++) {
      s = i === 0 ? -1 : 1;
      fex[i] = sx + s * r * 0.30;
      fey[i] = sy - r * 0.10;
      if (G) {
        fex[i] += D.fx * r * 0.42 * G.legFA[i];
        fey[i] += D.fy * r * 0.42 * G.legFA[i] - r * 0.30 * G.legLift[i];
      }
      if (L) {
        // 앞발은 내딛고 뒷발은 버틴다. 걸음걸이 위에 **더한 뒤** ±1.2 로 묶는다.
        var lf = (i === 1 ? L.f : -L.f * 0.36);
        if (lf > 1.2) lf = 1.2; else if (lf < -1.2) lf = -1.2;
        fex[i] += D.fx * r * 0.42 * lf + s * r * 0.42 * (L.spread || 0);
        fey[i] += D.fy * r * 0.42 * lf;
      }
    }
    g.lineStyle(lw, UI.tint(color, -0.45), a * 0.9);
    for (i = 0; i < 2; i++) {
      s = i === 0 ? -1 : 1;
      g.lineBetween(sx + swx + s * r * 0.26, by + bob + swy + r * 0.80, fex[i], fey[i]);
    }
    //  발 — 2단. 예전엔 청동 단색 타원 하나라 발이 '바닥에 붙은 색점'이었다.
    //  그늘을 아래에 깔고 본색을 위에 얹으면 그 자체로 접지가 읽힌다.
    for (i = 0; i < 2; i++) {
      s = i === 0 ? -1 : 1;
      g.fillStyle(UI.shade(M.bronze), a);
      g.fillEllipse(fex[i] + s * r * 0.02, fey[i] + r * 0.07, r * 0.40, r * 0.22, SM);
      g.fillStyle(M.bronze, a);
      g.fillEllipse(fex[i] + s * r * 0.02, fey[i] + r * 0.02, r * 0.36, r * 0.19, SM);
    }
  };

  // ── 지면 설치물 (계란이 아닌 것) ──────────────────────────────
  UI.drawGroundArt = function (g, art, sx, sy, r, color, a) {
    var Iso = GAME.Iso, T = Iso ? Iso.TILT : 1;
    if (art.ground === 'spiketrap') {        // 가시덫 — 나무 이빨 덫
      g.fillStyle(M.woodDark, a);
      g.fillEllipse(sx, sy, r * 2.30, r * 2.30 * T, SM);
      g.fillStyle(0x241d16, a);
      g.fillEllipse(sx, sy, r * 1.40, r * 1.40 * T, SM);
      g.fillStyle(M.bone, a);                // 톱니
      for (var i = 0; i < 8; i++) {
        var ang = (Math.PI * 2 / 8) * i + 0.39;
        var ox = Math.cos(ang) * r * 0.92, oy = Math.sin(ang) * r * 0.92 * T;
        g.fillTriangle(sx + ox * 0.78, sy + oy * 0.78,
                       sx + ox * 1.30, sy + oy * 1.30,
                       sx + ox * 1.02 - Math.sin(ang) * r * 0.26,
                       sy + oy * 1.02 + Math.cos(ang) * r * 0.26 * T);
      }
      g.fillStyle(M.leaf, a * 0.55);         // 위장 잎사귀
      g.fillEllipse(sx - r * 0.55, sy - r * 0.18 * T, r * 0.80, r * 0.34 * T, SM);
      g.fillEllipse(sx + r * 0.50, sy + r * 0.30 * T, r * 0.72, r * 0.30 * T, SM);
    }
  };

  // ============================================================================
  //  계급 장식 (유닛 레벨 1~5)
  // ============================================================================
  //  **색이 아니라 실루엣으로** 단계를 읽게 한다. 이 파일의 제1원칙이기도 하고,
  //  애초에 색을 쓸 수가 없다 — 색은 진영 전용이다(설계 경계 5번).
  //
  //   L1 기본   아무 것도 없다. 레벨을 안 올린 사람은 지금과 완전히 동일해야 한다.
  //   L2 +견장  어깨 양쪽 각진 판          → 실루엣이 **옆으로 넓어진다**
  //   L3 +볏    투구 위로 솟는 지느러미     → **위로 길어진다**
  //   L4 +군기  등 뒤 사선 깃대 + 삼각기    → **사선 한 줄이 생긴다**
  //   L5 +뿔관  머리 둘레 뿔 세 개 + 발밑 문양 → **윤곽이 뾰족해진다**
  //  네 단계가 서로 **다른 방향**(가로 / 세로 / 사선 / 뾰족)으로 자란다.
  //  같은 방향으로 커지기만 하면 흑백에서 L3 과 L4 를 구분할 수 없다 — 그래서 축을 나눴다.
  //
  //  재질은 중립색만(진영색 색역 침범 금지). **유닛마다 자기 계열**을 쓴다(`UI.ART.fam`).
  //  이건 **보조 신호**다. 색을 지워도 네 단계가 형태로 남는다.
  //  r < 7 이면 전부 끈다(그 크기에서는 장식이 실루엣을 뭉갠다 — LOD 규칙).
  //
  //  ⚠⚠ **2026-08-07 실측이 바꾼 것 두 가지** (`scratchpad/unit-sheet-lv-before.png`)
  //   ① 열 종류가 전부 청동→강철 하나를 써서 L5 에서 **누가 누구인지 사라졌다.**
  //      → `art.fam` 이 있으면 그것을 쓴다. 없으면(영웅·구버전 def) 예전과 같다.
  //   ② 볏(L3)과 뿔관(L5)이 **투구 한가운데를 가로질러** 늪지기 삿갓·족장 소뿔·궁수
  //      깃털이 통째로 덮였다. 이 파일의 제1원칙("종류는 투구+장비 실루엣이 전담")이
  //      레벨을 올리는 순간 무너지고 있었다 — **키울수록 누구인지 모르게 되는 것**이다.
  //      → 볏은 위로 올려 투구 **꼭대기 위**에만 얹고, 뿔관의 머리 둘레 고리는 지우고
  //        뿔을 바깥·아래로 벌린다. 자라는 방향(세로 / 뾰족)은 그대로다.
  UI.rankMat = function (lv, art) {
    var fam = art && art.fam;
    if (fam) {
      var key = lv >= 4 ? fam[1] : fam[0];
      if (typeof M[key] === 'number') return M[key];
    }
    return lv >= 4 ? M.blade : M.bronze;
  };

  // 어깨 견장 (L2+) — 몸통 위, 투구 아래
  UI.eggRankBody = function (g, art, sx, by, r, color, a, D, lv) {
    if (lv < 2 || r < 7) return;
    D = UI.asDir(D);
    var mat = UI.rankMat(lv, art);
    var ex = r * 1.00 * ((art.wide || 0.78) / 0.78);
    var shy = by - r * 0.30;
    for (var s = -1; s <= 1; s += 2) {
      var hx = sx + D.px * ex * s, hy = shy + D.py * ex * s;
      g.fillStyle(UI.shade(mat), a);
      g.fillTriangle(hx - D.px * s * r * 0.14, hy - D.py * s * r * 0.14 - r * 0.26,
                     hx + D.px * s * r * 0.58, hy + D.py * s * r * 0.58 + r * 0.06,
                     hx - D.px * s * r * 0.06, hy - D.py * s * r * 0.06 + r * 0.30);
      if (r >= 11) {                       // 판 위 굴곡 — 금속으로 읽히게
        g.fillStyle(UI.lit(mat), a * 0.9);
        g.fillTriangle(hx - D.px * s * r * 0.10, hy - D.py * s * r * 0.10 - r * 0.20,
                       hx + D.px * s * r * 0.40, hy + D.py * s * r * 0.40 - r * 0.02,
                       hx + D.px * s * r * 0.04, hy + D.py * s * r * 0.04 - r * 0.02);
      }
    }
  };

  // 등 군기 (L4+) — 몸통 뒤(또는 앞) 레이어
  UI.eggRankBanner = function (g, art, sx, by, r, color, a, D, lv) {
    if (lv < 4 || r < 7) return;
    D = UI.asDir(D);
    //  ⚠ 깃대를 몸 **뒤로 더** 뺀다(0.52 → 0.72). 예전 값은 위를 보고 선 유닛에서
    //    깃대가 투구 바로 위를 지나 볏·소뿔과 겹쳤다(실측 시트에서 확인).
    var bx = sx - D.fx * r * 0.72, byy = by - r * 0.30 - D.fy * r * 0.72;
    var tx = bx - D.fx * r * 0.34, ty = byy - r * 2.05;
    g.lineStyle(Math.max(1.3, r * 0.11), M.wood, a);
    g.lineBetween(bx, byy, tx, ty);
    // 기 — 깃대에서 옆으로 펄럭인다.
    //  ⚠ 앞뒤축(D.fx)만으로 폭을 잡으면 **정면에서 면적이 0** 이 된다(볏에서 이미 겪었다).
    //    깃발은 방향 신호가 아니라 계급 신호라, 화면 기준으로 항상 같은 쪽에 펼친다.
    g.fillStyle(UI.tint(M.leather, 0.10), a);
    g.fillPoints([{ x: tx, y: ty + r * 0.02 },
                  { x: tx + r * 0.95, y: ty + r * 0.30 },
                  { x: tx + r * 0.70, y: ty + r * 0.62 },
                  { x: tx + r * 0.10, y: ty + r * 0.94 }], true);
    if (r >= 11) {                          // 깃대 꼭지 — 뾰족한 실루엣 하나 더
      g.fillStyle(UI.rankMat(lv, art), a);
      g.fillTriangle(tx - r * 0.13, ty + r * 0.02, tx + r * 0.13, ty + r * 0.02, tx, ty - r * 0.36);
    }
  };

  // 볏(L3+) + 뿔 관(L5) — 투구 위
  UI.eggRankHead = function (g, art, sx, by, r, color, a, D, lv) {
    if (lv < 3 || r < 7) return;
    D = UI.asDir(D);
    var mat = UI.rankMat(lv, art);
    //  ⚠ **투구 꼭대기 위로 올린다** (0.98 → 1.24r · 2026-08-07 실측).
    //    예전 값은 투구 한가운데였다 — 늪지기 삿갓·족장 소뿔·궁수 깃털이 볏에 덮여
    //    L3 부터 열 종류가 같아 보였다. 위로 옮겨도 "위로 길어진다"는 축은 그대로다.
    var cy = by - r * 1.24;

    if (lv >= 3) {
      // 볏 — 앞뒤축을 따라 늘어선 뿔 세 개(가운데가 가장 높다).
      // ⚠ 처음엔 앞뒤축만 쓰는 납작한 지느러미였는데, **정면에서 면적이 0 이 되어 사라졌다**
      //   (정면이면 D.fx=0 이라 세 꼭짓점의 x 가 같아진다 — 실측 스크린샷에서 L2 와 구분 불가).
      //   그래서 각 뿔에 가로 두께를 준다. 어느 방향에서 봐도 위로 솟은 실루엣이 남는다.
      var t3 = [-0.36, 0, 0.36];
      for (var j = 0; j < 3; j++) {
        var tt = t3[j];
        var bx3 = sx + D.fx * r * tt, by3 = cy + D.fy * r * tt;
        var hgt = (tt === 0 ? 0.80 : 0.50);
        var wdt = (tt === 0 ? 0.15 : 0.12);
        g.fillStyle(tt === 0 ? UI.lit(mat) : UI.shade(mat), a);
        g.fillTriangle(bx3 - r * wdt, by3 + r * 0.06,
                       bx3 + r * wdt, by3 + r * 0.06,
                       bx3 + D.fx * r * 0.05, by3 - r * hgt);
      }
    }

    if (lv >= 5) {
      //  뿔 관 — 바깥·위로 뻗는 뿔 세 개.
      //  ⚠ **머리 둘레 고리를 지웠다** (2026-08-07). 그 고리(`by-0.74r` 의 타원)가
      //    투구를 가로질러 방패병 통투구·족장 소뿔을 통째로 잘라 먹고 있었다.
      //    뿔만 남기고 **바깥·아래**로 벌리면 "윤곽이 뾰족해진다"는 축은 유지되면서
      //    머리 한가운데가 비어 투구 실루엣이 살아난다.
      var ring = by - r * 0.62;
      var off = [-1, 1];
      for (var i = 0; i < off.length; i++) {
        var o = off[i];
        var hx = sx + D.px * r * 0.86 * o, hy = ring + D.py * r * 0.86 * o;
        g.fillStyle(UI.shade(mat), a);
        g.fillTriangle(hx - r * 0.15, hy + r * 0.10,
                       hx + r * 0.15, hy + r * 0.10,
                       hx + D.px * r * 0.52 * o, hy - r * 0.72);
        g.fillStyle(mat, a);
        g.fillTriangle(hx - r * 0.09, hy + r * 0.06,
                       hx + r * 0.09, hy + r * 0.06,
                       hx + D.px * r * 0.44 * o, hy - r * 0.62);
      }
    }
  };

  // 발밑 계급 눈금 (전장 전용) — 레벨을 **정확히 셀 수 있게** 하는 보조 표시.
  // 실루엣만으로는 "3인가 4인가"가 헷갈릴 수 있고, 전장은 유닛이 수십 기다.
  UI.eggRankGround = function (g, sx, sy, r, color, a, lv, art) {
    if (lv < 2 || r < 8) return;
    var T = (GAME.Iso ? GAME.Iso.TILT : 1);
    var mat = UI.rankMat(lv, art);
    var rx = r * 1.28, ry = r * 1.28 * T;
    for (var i = 0; i < lv; i++) {
      // **발 앞쪽**(+PI/2)에 찍는다. 뒤(-PI/2)에 두면 캐릭터 몸통에 가려 하나도 안 보인다(실측).
      var ang = Math.PI / 2 + (i - (lv - 1) / 2) * 0.42;
      g.fillStyle(mat, a * 0.95);
      g.fillEllipse(sx + Math.cos(ang) * rx, sy + Math.sin(ang) * ry, (Math.max(1, r * 0.13)) * 2, (Math.max(1, r * 0.13)) * 2, SM);
    }
    if (lv >= 5) {                          // 발밑 문양 — 최고 계급만
      g.lineStyle(Math.max(1.2, r * 0.10), mat, a * 0.8);
      g.strokeEllipse(sx, sy, r * 2.5, r * 2.5 * T, SM);
    }
  };

  // ── 캐릭터 한 기 조립 ─────────────────────────────────────────
  //  grounded=true 면 전장(투영 적용), false 면 UI 패널용 평면
  //  walk : number | {phase, amp} | null   ← v2 추가 (생략하면 v1 과 동일)
  //  lv   : 1~5 계급 (생략하면 1 = 장식 없음, v2 와 픽셀 단위로 동일)
  //  gearTier : 1~8 이면 무기 재질·광휘가 등급을 따른다(UI.GEAR_TIERS). 생략하면 무변경.
  // ── 장비 덧그리기 (2026-08-03) ────────────────────────────────────────────
  //  사용자 지시: "방어구하고 신발, 장신구는 어떻게 표현하고 내 캐릭터 꾸미는 재미를 줄지"
  //
  //  문제(실측): 장비 4칸 중 **무기만** 그림에 반영됐다. 돈은 4칸에 쓰는데 보이는 건
  //  1칸이라 꾸미는 재미가 안 생긴다.
  //
  //  ⚠ 기존 부위 함수(eggBody/eggLegs/eggBack)를 고치지 않고 **그 위에 덧그린다.**
  //    깊은 함수를 고치면 적 진형 유닛까지 실루엣이 같이 흔들린다.
  //    `kit` 이 없거나 전부 0 이면 **한 획도 안 그린다** → 지금 모습 그대로다.
  //  ⚠ 색은 재질 토큰(M)만 쓴다. 이 세계에 네온은 없다(원시 부족 전쟁).
  //
  //  kit = { armor: 0~10, boots: 0~10, acc: 0~10 }
  //  ⚠ 자리는 카탈로그(js/towershopitems.js) 배열 순번과 **1:1** 이다. 재질도 그 자리의
  //    아이템 이름과 맞춰 둔다 — '늑대가죽 흉갑'이 철판으로 보이면 이름이 거짓말이 된다.
  UI.KIT_ARMOR = [
    null,                                                    // 0 없음
    { col: 'leather', dark: 'leatherDark', w: 0.30, sh: 0 }, // 1 가죽 갑옷
    { col: 'bone',    dark: 'leatherDark', w: 0.36, sh: 1 }, // 2 뼈 갑옷
    { col: 'stone',   dark: 'leatherDark', w: 0.42, sh: 1 }, // 3 거북등 갑옷
    { col: 'leather', dark: 'stone',       w: 0.48, sh: 2 }, // 4 늑대가죽 흉갑
    { col: 'iron',    dark: 'bladeDark',   w: 0.54, sh: 2 }, // 5 강철 흉갑
    { col: 'bone',    dark: 'stone',       w: 0.59, sh: 2 }, // 6 매머드 뼈 갑주
    { col: 'stone',   dark: 'iron',        w: 0.64, sh: 3 }, // 7 흑요석 판금
    { col: 'bronze',  dark: 'leatherDark', w: 0.69, sh: 3 }, // 8 용비늘 갑옷
    { col: 'blade',   dark: 'iron',        w: 0.74, sh: 4 }, // 9 대지의 갑주
    { col: 'blade',   dark: 'bronze',      w: 0.80, sh: 4 }  // 10 불멸의 등딱지
  ];

  UI.eggKit = function (g, sx, by, r, a, D, kit) {
    if (!kit) return;
    //  ⚠ 상한은 카탈로그 단계 수(10)와 같아야 한다. 8 로 두면 9·10 단계가 8 로 접혀
    //    **최상급 셋이 전부 같은 모습**이 된다 — 비싼 것을 샀는데 안 바뀌는 것이 보인다.
    var A = UI.KIT_ARMOR[Math.max(0, Math.min(10, kit.armor | 0))];
    var b = Math.max(0, Math.min(10, kit.boots | 0));
    var c = Math.max(0, Math.min(10, kit.acc | 0));

    //  ① 방어구 — 가슴 띠 + 어깨. 등급이 오르면 **띠가 두꺼워지고 어깨가 넓어진다**
    //     (실루엣이 바뀌어야 멀리서도 "세졌다"가 읽힌다. 색만 바꾸면 안 보인다.)
    if (A) {
      var bw = r * (0.62 + A.w * 0.30), bh = r * (0.16 + A.w * 0.16);
      var cy = by - r * 0.62;
      g.fillStyle(M[A.dark] || M.iron, a * 0.9);
      g.fillEllipse(sx, cy + bh * 0.22, bw * 2, bh * 2, 10);
      g.fillStyle(M[A.col] || M.leather, a);
      g.fillEllipse(sx, cy, bw * 2, bh * 2, 10);
      //  ── 어깨 3단 (2026-08-04) ───────────────────────────────────────────
      //  예전에는 어두운 타원 하나였다. 재질 3단이 생겼으니 **그늘 → 면 → 빛**을
      //  겹쳐 어깨가 둥근 판으로 읽히게 한다. 광원은 좌상단이므로 빛은 왼쪽 위다.
      //  ⚠ 도형이 어깨당 1개 → 3개로 는다. 어깨는 최대 4개라 +8 도형이고,
      //    26기 기준 +208 — 이 게임 프레임에서 감당 범위다(격자가 그보다 크다).
      var liteKey = A.col + 'Lite';
      for (var i = 0; i < A.sh; i++) {          // 어깨 판 — 등급만큼 늘어난다
        var ox = (i % 2 ? 1 : -1) * bw * (0.86 + Math.floor(i / 2) * 0.16);
        var shy = cy - bh * 0.5;
        g.fillStyle(M[A.dark] || M.iron, a * 0.85);
        g.fillEllipse(sx + ox, shy + bh * 0.10, bh * 1.5, bh * 1.2, 8);
        g.fillStyle(M[A.col] || M.leather, a * 0.95);
        g.fillEllipse(sx + ox, shy, bh * 1.34, bh * 1.05, 8);
        if (bh >= 3) {
          g.fillStyle(M[liteKey] || M[A.col] || M.leather, a * 0.75);
          g.fillEllipse(sx + ox - bh * 0.18, shy - bh * 0.20, bh * 0.72, bh * 0.52, 8);
        }
      }
    }

    //  ② 신발 — 발목 띠. 이 아트는 다리가 짧아 **굵기·높이 변화가 잘 보인다.**
    if (b > 0) {
      //  ⚠ 문턱은 10 단 기준이다(예전 8 단 값 6/4/2 를 그대로 두면 상위 셋이 뭉친다).
      var bootCol = b >= 8 ? M.iron : (b >= 5 ? M.stone : (b >= 3 ? M.leather : M.rope));
      var bwid = r * (0.20 + b * 0.016), bhi = r * (0.10 + b * 0.013);
      for (var k = 0; k < 2; k++) {
        var fx = sx + (k ? 1 : -1) * r * 0.26;
        g.fillStyle(UI.tint(bootCol, -0.25), a);
        g.fillEllipse(fx, by - bhi * 0.2, bwid * 2, bhi * 2, 8);
        g.fillStyle(bootCol, a);
        g.fillEllipse(fx, by - bhi * 0.7, bwid * 1.7, bhi * 1.5, 8);
      }
    }

    //  ③ 장신구 — 목에 건 것. **유일하게 '기능이 아닌 멋'인 슬롯**이라 여기에
    //     개성을 몰아준다. 고등급은 알 하나가 더 달린다.
    if (c > 0) {
      var accCol = c >= 9 ? M.coinGold : (c >= 6 ? M.coinSilver : (c >= 4 ? M.bone : M.rope));
      var ny = by - r * 0.42, nr = r * (0.055 + c * 0.0065);
      g.fillStyle(M.rope, a * 0.8);
      g.fillEllipse(sx, ny - nr * 1.6, r * 0.46, r * 0.14, 10);
      g.fillStyle(UI.tint(accCol, -0.3), a);
      g.fillEllipse(sx, ny + nr * 0.25, nr * 2.1, nr * 2.1, 8);
      g.fillStyle(accCol, a);
      g.fillEllipse(sx, ny, nr * 2, nr * 2, 8);
      if (c >= 8) {
        g.fillStyle(accCol, a * 0.9);
        g.fillEllipse(sx - nr * 2.2, ny + nr * 0.5, nr * 1.2, nr * 1.2, 6);
      }
    }
  };

  //  refine : 수성의 탑 정련 단계(0~10). 생략하면 0 = 예전과 픽셀 단위로 동일.
  UI.drawEggChar = function (g, art, sx, by, r, color, a, facing, grounded, reach, walk, lv, idle, act, tipCap, gearTier, refine) {
    var Iso = GAME.Iso, T = (grounded && Iso) ? Iso.TILT : 1;
    var D = UI.dir8(facing === undefined ? Math.PI / 2 : facing, T);
    var G = UI.gait(walk, art);
    var A = UI.actPose(act);
    // ⚠ **전투 모션이 있으면 idle 의 주기 공격을 끈다.** 둘 다 `atk` 를 만들기 때문에
    //   그대로 두면 칼이 두 번 돈다. 이 판단을 호출부에 맡기면 한 곳만 고쳐져 갈라진다
    //   — 그래서 여기서 한다(이 파일의 상습 사고 패턴이다).
    var I = UI.idlePose(A && idle && typeof idle === 'object' ? { t: idle.t, seed: idle.seed,
                          amp: idle.amp, attack: false }
                        : (A && typeof idle === 'number' ? { t: idle, attack: false } : idle), art);

    var cx = sx, cy = by, lean = 0, rch = (reach === undefined ? 1 : reach);
    if (G) {
      cx += r * G.sway * D.px;
      cy += r * G.sway * D.py + r * G.bob;
      lean = r * (G.lean * D.px + G.pitch * D.fx);
      rch *= (1 + G.arm);
    }

    // 아이들 — 호흡(스쿼시&스트레치)과 공격. 머리 장식은 **알 꼭대기가 움직인 만큼** 따라간다.
    var ky = 1, dyHead = 0, dyFace = 0, dyGear = 0, atk = 0;
    var guard = 0, gearDrop = 0, spin = 0, legF = 0, legSpread = 0;
    if (A) {
      cy += r * A.rise;
      lean += r * (A.lean * D.px + A.pitch * D.fx);
      rch *= A.reach;
      // 앞뒤축 이동. **화면 벡터로 옮긴다** — 정면에서도 TILT(0.60~0.72)가 남아 0 이 안 된다.
      // ⚠ 상한 1.4r. 그림을 판정 위치에서 크게 떼면 "저기 보이는데 여기서 맞는다"가 된다.
      var dr = A.drift; if (dr > 1.4) dr = 1.4; else if (dr < -1.4) dr = -1.4;
      cx += r * dr * D.fx;
      cy += r * dr * D.fy;
      guard = A.guard; gearDrop = A.gearDrop; spin = A.spin;
      legF = A.legF; legSpread = A.legSpread;
    }
    if (I || A) {
      if (I) {
        cy += r * I.rise;
        lean += r * (I.lean * D.px + I.pitch * D.fx);
        rch *= I.reach;
      }
      // 면적 보존이 곱셈이므로 ky 는 곱하고, 나머지는 더한다.
      ky = (I ? I.ky : 1) * (A ? A.ky : 1);
      if (ky < KY_MIN) ky = KY_MIN; else if (ky > KY_MAX) ky = KY_MAX;
      // atk 만 **덮어쓰기**다(위 주석의 '칼이 두 번 돈다').
      atk = A ? A.atk : (I ? I.atk : 0);
      dyHead = 2 * r * (1 - ky);          // 알 꼭대기의 이동량
      // 눈은 몸통 안이라 덜 움직인다. 단 투구 틈(slit) 안의 눈은 투구를 따라가야 어긋나지 않는다.
      dyFace = (art.face === 'slit') ? dyHead : dyHead * 0.45;
      dyGear = dyHead * 0.35;             // 손·어깨 높이
    }

    var backFirst = !D.back;                                     // 등을 보이면 등짐이 앞으로
    var gearBehind = D.back && !UI.GEAR_ALWAYS_FRONT[art.gear];  // 뒤쪽 무기는 몸통에 가린다

    // 잉크 윤곽은 **장비 3층에만** 두른다.
    // 몸통은 ivory 시안에서 이미 진영색 외곽선(r*0.17)이 실루엣을 맡고 있어
    // 잉크를 한 겹 더 두르면 진영색이 눌려 아군/적군 구분이 흐려진다.
    var rank = UI.rankOf({ lv: lv });     // 생략·이상값이면 1 (= 장식 없음)
    var back = function (gg) { UI.eggBack(gg, art.back, cx, cy + dyGear, r, color, a, D); };
    var gear = function (gg) { UI.eggGear(gg, art.gear, cx + lean * 0.5, cy + dyGear, r, color, a, D,
                                          rch, atk, guard, gearDrop, spin, tipCap, gearTier,
                                          art, rank, refine); };
    var helm = function (gg) { UI.eggHelm(gg, art.helm, cx + lean, cy + dyHead, r, color, a, D); };
    // 계급 장식도 장비와 같은 레이어 규칙을 탄다(잉크 윤곽 포함) — 라이트 테마에서
    // 청동/강철이 목초지에 묻히지 않게 하려면 반드시 inkLayer 를 거쳐야 한다.
    var rkBan = function (gg) { UI.eggRankBanner(gg, art, cx, cy + dyGear, r, color, a, D, rank); };
    var rkBody = function (gg) { UI.eggRankBody(gg, art, cx, cy + dyGear, r, color, a, D, rank); };
    var rkHead = function (gg) { UI.eggRankHead(gg, art, cx + lean, cy + dyHead, r, color, a, D, rank); };

    if (backFirst) { UI.inkLayer(g, r, rkBan); UI.inkLayer(g, r, back); }
    if (gearBehind) UI.inkLayer(g, r, gear);
    UI.eggBody(g, art, cx, cy, r, color, a, lean, ky);
    if (!backFirst) { UI.inkLayer(g, r, back); UI.inkLayer(g, r, rkBan); }
    UI.inkLayer(g, r, rkBody);
    // 장비는 **몸통 위·얼굴 아래**. 예전엔 맨 마지막이라 큰 무기가 얼굴을 덮었다(실측 신고).
    // 이 순서면 무기를 아무리 크게 그려도 눈·볼·투구는 반드시 살아남는다.
    if (!gearBehind) UI.inkLayer(g, r, gear);
    // 맨눈은 투구보다 먼저(챙이 이마를 덮게), 투구 틈의 눈은 투구보다 나중에 그린다
    if (art.face !== 'slit') UI.eggFace(g, art, cx + lean * 0.62, cy + dyFace, r, a, D);
    UI.inkLayer(g, r, helm);
    UI.inkLayer(g, r, rkHead);
    if (art.face === 'slit') UI.eggFace(g, art, cx + lean * 0.62, cy + dyFace, r, a, D);
  };

  // ── 전장용 ────────────────────────────────────────────────────
  //  시그니처: 기존 7개 + walk 하나. 반환값 {sx, sy, by} 도 그대로(체력바가 이걸 쓴다).
  // `opts` 는 **맨 뒤 선택 인자**다 — 안 넘기면 예전과 픽셀 단위로 같은 그림이 나오므로
  // 기존 호출부(배치·드래프트·패널 등)를 한 곳도 고치지 않아도 된다.
  //   opts.side     : 'controller' | 'strategist' — 발밑 링의 실선/파선을 가른다
  //   opts.footRing : false 면 발밑 링을 그리지 않는다(전투 화면이 2패스로 따로 그린다)
  //   opts.refine   : 수성의 탑 정련 단계(0~10). 무기 금속이 밝아지고 손끝에 불티가 뜬다.
  //                   ⚠ `def` 에 안 싣는 이유: 정련은 `js/scenes/defend.js` 가 hp/damage
  //                     에 곱하기만 하고 def 에 표식을 안 남긴다. 그 파일을 안 건드리려고
  //                     **호출부가 조회해서 넘기는** 길을 택했다(`js/scenes/battle.js`).
  // ⚠ 색(`color`)에서 진영을 되짚으면 안 된다 — 피격 순간 `color = 0xffffff` 로 덮이므로
  //   그 프레임만 진영이 사라진다(battle.js 의 flash). 그래서 side 를 따로 받는다.
  // ⚠ `opts` 를 `drawEggChar`·`eggBody` 까지 내려보내지 않는다 — 어깨띠는 양 진영이
  //   같은 모양이라 쓸 곳이 없다. 안 쓰는 인자를 남기면 다음 사람이 그게 뭘 한다고 믿는다.
  //   opts.act      : `UI.updateAct` 가 만든 전투 모션. 안 넘기면 예전 그림 그대로다.
  UI.drawUnit = function (g, def, worldX, worldY, color, alpha, facing, walk, idle, opts) {
    var Iso = GAME.Iso;
    var sx = worldX, sy = Iso.toScreenY(worldY);
    // 그리는 크기만 키운다(히트박스는 그대로).
    // `opts.sizeMul` — 탑 전용 정예처럼 **덩치로 존재를 알리는** 경우에 쓴다.
    // ⚠ `def.radius` 자체를 키우면 사거리 판정(`range + 대상반지름`)이 바뀌어 밸런스가
    //   조용히 움직인다(CLAUDE.md 의 파수꾼 radius 18→24 실측이 그 증거다).
    var r = def.radius * (UI.UNIT_DRAW_SCALE || 1) * ((opts && opts.sizeMul) || 1);
    var a = alpha === undefined ? 1 : alpha;
    // ── 계란이 아닌 것들(용 권속)은 별도 파일이 그린다 (2026-08-02) ─────────────
    //  eggart 는 `eggBody` 를 뿌리로 지어져 있어서 용을 여기 끼우면 계란 유닛 60여 종이
    //  같이 위험해진다. 갈래를 하나만 내고 나머지는 손대지 않는다.
    //  ⚠ 2026-08-02 재발견 — 이 분기가 `return;`(반환값 없음)이었다. 호출부
    //    (`js/scenes/battle.js`의 `pos = GAME.UI.drawUnit(...)`)는 보스가 아닌
    //    유닛만 검증하며 짜여서 `pos.sx`를 바로 읽는 줄이 있었다 — 보스 유닛마다
    //    `pos`가 `undefined`라 그 줄에서 매 프레임 예외가 났다. 지면 고정물(`art.ground`)과
    //    같은 계약으로 맞춘다: 배틀 화면이 실제로 이 값을 쓰는 스크린샷 검증
    //    (`scratchpad/boss-shot.js`)에서 처음 잡혔다.
    if (GAME.BossArt && GAME.BossArt.draw(g, def, sx, sy, r, a, idle || (GAME.Iso && GAME.Iso.now) || 0, facing)) {
      return { sx: sx, sy: sy, by: sy };
    }
    var art = UI.artOf(def);
    var f = facing === undefined ? Math.PI / 2 : facing;
    var side = opts && opts.side;

    //  ── 접지 그림자 2겹 (2026-08-04 아트 개편) ────────────────────────────
    //  ⚠ **결함 수정이기도 하다.** 예전에는 `0x000000` 을 하드코딩해 `UI.COL.shadow`
    //    를 무시했다. 테마 A(기본)가 패널 그림자를 `0x6B5433` 으로 바꾼 이유가
    //    "크림 위 순검정은 때가 낀 것처럼 보인다"(js/ui-theme.js)인데, 그 결정이
    //    유닛에는 적용이 안 돼 **크림 목초지에 검은 얼룩 26개**가 찍히고 있었다.
    //  ⚠ 오프셋은 광원(`UI.LIGHT.dir`, 좌상단)의 **반대쪽**이다. 값이 작은 이유:
    //    빛이 낮아도 그림자를 길게 빼면 26기가 서로 겹쳐 바닥이 시커메진다.
    //    0.16r 은 12~16px 유닛에서 2px 남짓 — 있는 줄 모르지만 없으면 평평하다.
    //  ⚠ 2겹인 이유: 넓고 옅은 것(소프트) + 좁고 진한 것(코어)이 같이 있어야
    //    "바닥에 붙어 있다"가 읽힌다. 한 겹은 스티커처럼 보인다.
    var LT = UI.LIGHT || { dir: { x: -0.51, y: -0.86 } };
    var shCol = (UI.COL && UI.COL.shadow) || 0x000000;
    var ox = -LT.dir.x * r * 0.16, oy = -LT.dir.y * r * 0.10 * Iso.TILT;
    //  ⚠ 소프트 겹은 **옅어야 한다.** 0.15 로 뒀더니 유닛 26기가 뭉치는 자리에서
    //    그림자가 서로 겹쳐 바닥이 진흙탕이 됐다(실측 스크린샷). 겹침을 견디는 값은
    //    0.10 이다 — 혼자 있을 때는 거의 안 보이지만 없으면 평평해 보이는 크기다.
    g.fillStyle(shCol, 0.10 * a);
    g.fillEllipse(sx + ox, sy + oy, r * 2.30, r * 2.30 * Iso.TILT, SM);
    g.fillStyle(shCol, 0.40 * a);
    g.fillEllipse(sx + ox * 0.56, sy + oy * 0.5, r * 1.45, r * 1.45 * Iso.TILT, SM);

    if (art.ground) {
      UI.drawGroundArt(g, art, sx, sy, r, color, a);
      return { sx: sx, sy: sy, by: sy };
    }

    var lift = r * Iso.LIFT * (art.squat ? 0.55 : 1);
    var by = sy - lift;
    var D = UI.dir8(f, Iso.TILT);
    var G = UI.gait(walk, art);

    // 다리 두 개 — 계란이 지면에 붙어 있다는 걸 알려준다
    var act = (opts && opts.act) || null;
    var AP = UI.actPose(act);
    UI.eggLegs(g, art, sx, by, sy, r, color, a, D, G,
               AP ? { f: AP.legF, spread: AP.legSpread } : null);
    //  장비 덧그리기 — 다리·몸통이 다 그려진 뒤라야 위에 얹힌다.
    //  ⚠ 여기는 `drawUnit` 이라 `kit` 이라는 지역 변수가 없다. `opts.kit` 을 봐야 한다
    //    (그냥 `kit` 으로 뒀다가 매 프레임 ReferenceError 가 났다 — boss-shot 이 잡았다).
    //  ⚠ **`inkLayer` 를 거친다** (2026-08-04 결함 수정). 이 게임의 다른 그리기 계층은
    //    전부 잉크 윤곽 프록시를 타는데 장비 3칸만 안 탔다. 그 결과 기본 테마(크림
    //    목초지)에서 갑옷·신발·장신구의 대비가 1.25:1 로 떨어져 **산 물건이 화면에서
    //    사라졌다.** 지수 경제로 10단까지 사게 만들어 놓고 안 보이면 살 이유가 없다.
    if (opts && opts.kit) UI.eggKit(g, sx, by, r, a, D, opts.kit);

    // ivory 시안 — 발밑 진영 링으로 아군/적군을 한 번 더 못박는다.
    // ⚠ 전투 화면은 `opts.footRing: false` 로 이걸 끄고 루프 뒤 2패스로 다시 그린다.
    //   이유는 `UI.footRing` 주석에 있다. 배치·드래프트 화면은 겹침이 없어 그대로 그린다.
    //   **전역 플래그가 아니라 인자인 이유**: 전역이면 draw 가 중간에 예외로 죽었을 때
    //   플래그가 false 로 남아 다른 화면의 링이 통째로 사라진다(이 폴더가 겪은 계열의 사고다).
    if (UI.EGG_STYLE === 'ivory' && !(opts && opts.footRing === false)) {
      UI.footRing(g, sx, sy, r, color, a * 0.85, side);
    }

    var lv = UI.rankOf(def);
    UI.eggRankGround(g, sx, sy, r, color, a, lv, art);
    // 무기 그림이 판정 사거리를 넘지 않게 하는 상한(px). `def.range` 는 전투에서
    // 이미 `Combat.scaleDef` 로 WORLD_SCALE 이 곱해진 **실효 사거리**다.
    // 카드 화면의 원본 def 는 사거리가 커서 상한이 사실상 안 걸린다 — 의도한 것이다
    // (카드는 '어디까지 닿는가'를 가르치는 화면이 아니다).
    var tipCap = (typeof def.range === 'number' && def.range > 0) ? def.range + 12 : 0;
    UI.drawEggChar(g, art, sx, by, r, color, a, f, true, 1, walk, lv, idle, act, tipCap,
                   opts && opts.gearTier, opts && opts.refine);
    return { sx: sx, sy: sy, by: by };
  };

  // ── 발밑 진영 링 ────────────────────────────────────────────
  //
  //  전투 화면에서 이 링은 **거의 안 보이고 있었다.** 실측 근거:
  //   · `strokeEllipse` 의 인자는 폭/높이라 세로 반경이 r*TILT ≈ 0.72r 밖에 안 된다
  //   · 링은 `drawUnit` 안에서 몸통보다 **먼저** 그려지고, 유닛은 y 순으로 뒤→앞 그려진다
  //   · 폰 가로 근접 접촉 거리는 화면 세로차 16px, 알의 그린 높이는 25~33px
  //  → 링의 위쪽 절반은 자기 몸통에, 아래쪽 호는 **앞 유닛 몸통에** 덮여 좌우 조각만 남는다.
  //
  //  그래서 전투 화면은 이 함수를 끄고(`opts.footRing: false`) 모든 유닛을 그린 **뒤**
  //  2패스로 다시 부른다. 이미 그리고 있던 200px² 를 **보이게만** 하는 것이라
  //  새 아트 결정도, 화면 위 선 총량 증가도 없다(오히려 아래 반원만 그려 줄어든다).
  //
  //  진영 구분을 **형태**로도 싣는다 — controller 실선 / strategist 파선.
  //  세 테마의 두 진영색은 명암비가 1.45~2.24 로 전부 3:1 미달이라(2형색각 1.37~1.86)
  //  색만으로는 원리상 안 갈린다. 링 색 자체는 필드 위에 있어 대비가 좋다
  //  (필드 대비 A 6.37/4.38 · B 8.59/3.83 · C 5.38/3.10 — 세 테마 전부 3:1 이상).
  //  즉 여기가 진영색을 쓰기에 가장 좋은 자리이고, 형태는 색맹 대비다.
  //
  //  `front` 가 true 면 **앞쪽(아래) 반원만** 그린다. 위쪽 호는 어차피 자기 몸통 뒤라
  //  값어치가 없고, 반원만 그리면 잉크 면적이 절반으로 줄어 노이즈가 안 늘어난다.
  //  (⚠ 잉크 **면적**은 줄지만 draw 명령 수는 늘어난다 — `strokeEllipse` 1개 대신 8조각이다.
  //   유닛 20기 기준 프레임당 +160 path. 표시객체는 0개 증가라 이 프로젝트 원칙은 유지된다.)
  //
  //  ⚠ **형태 신호(실선/파선)는 전투 화면에만 있다.** 파선은 `side === 'strategist'` 일 때만
  //    열리고, `side` 를 넘기는 호출부는 `battle.js` 의 오버레이 2패스 하나뿐이다.
  //    배치·드래프트 화면에서는 양쪽 다 실선이다 — 그 화면들은 한 진영만 나오고 겹침도
  //    없어서 색만으로 충분하다(그리고 예전 그림과 픽셀 단위로 같게 유지된다).
  //    색맹 대비가 필요한 곳은 두 진영이 섞이는 전투 화면이고, 거기에는 있다.
  UI.footRing = function (g, sx, sy, r, color, a, side, front) {
    var T = (GAME.Iso ? GAME.Iso.TILT : 1);
    var rx = r * 1.0, ry = r * 1.0 * T;         // strokeEllipse 는 폭/높이 → 반경의 2배를 넘긴다
    var lw = Math.max(1.5, r * 0.14);
    g.lineStyle(lw, color, a);

    // 실선 전체 원(배치 화면 등) — 예전과 픽셀 단위로 같은 그림이다.
    if (!front && side !== 'strategist') {
      g.strokeEllipse(sx, sy, rx * 2, ry * 2, SM);
      return;
    }

    // 호를 직접 그린다. `front` 면 아래 반원(화면 아래쪽 = 각 0~π)만.
    // 파선은 아래 `SEG` 분할 중 홀수 조각을 건너뛴다.
    // (참고: `battle.js` 의 `mineRing` 은 방식이 다르다 — 16조각을 각각 0.55 길이로 그린다.)
    var a0 = 0;
    var a1 = front ? Math.PI : Math.PI * 2;
    // ⚠ 분할 수는 **실제 조각 길이**로 정한다. 16 분할이면 앞쪽 반원(호 길이 ≈34px)에서
    //   조각이 2.1px 짜리가 되어 파선인지 뭉갠 선인지 구분이 안 된다(실측).
    //   8 분할이면 조각 4.3px — 25px 유닛에서도 '끊긴 선'으로 읽힌다.
    var SEG = front ? 8 : 16;
    var dash = (side === 'strategist');
    var step = (a1 - a0) / SEG;
    for (var i = 0; i < SEG; i++) {
      if (dash && (i % 2)) continue;
      var t0 = a0 + step * i, t1 = t0 + step * (dash ? 1 : 1.02);
      g.beginPath();
      g.moveTo(sx + Math.cos(t0) * rx, sy + Math.sin(t0) * ry);
      // 조각 안을 3등분해 타원 곡률을 따라간다(직선 하나면 작은 원에서 각져 보인다)
      for (var k = 1; k <= 3; k++) {
        var tt = t0 + (t1 - t0) * (k / 3);
        g.lineTo(sx + Math.cos(tt) * rx, sy + Math.sin(tt) * ry);
      }
      g.strokePath();
    }
  };

  // ── 껍질 금 + 피격 번쩍 ──────────────────────────────────────
  //
  // "에그 느낌이 안 든다"는 지적의 핵심 대응.
  // 계란의 정체성은 **깨진다**는 것이다. 지금까지는 체력을 체력바 숫자로만 읽었는데,
  // 체력이 줄수록 껍질에 금이 누적되면 **읽지 않고 보고** 알 수 있다.
  // 금 모양은 유닛마다 고정(seed 기반)이라 프레임마다 튀지 않는다.
  //
  //   g, sx, by : 화면 좌표(drawUnit 이 돌려준 값)
  //   r         : 그린 반지름
  //   hpRatio   : 0~1
  //   seed      : 유닛마다 다른 정수(모양 고정용)
  //   hurt      : 피격 잔여 시간(ms) — 0보다 크면 흰색으로 번쩍인다
  UI.eggDamage = function (g, sx, by, r, hpRatio, seed, hurt) {
    var ink = UI.ART_INK_COLOR !== undefined ? UI.ART_INK_COLOR : 0x2a2114;
    var dmg = 1 - Math.max(0, Math.min(1, hpRatio));
    // 체력이 20% 넘게 깎여야 첫 금이 보인다 — 스치기만 해도 금이 가면 지저분하다
    var cracks = dmg < 0.2 ? 0 : Math.min(4, Math.floor((dmg - 0.2) / 0.2) + 1);

    for (var i = 0; i < cracks; i++) {
      // seed 로 고정된 각도·길이 — 같은 유닛은 항상 같은 자리에 금이 간다
      var a0 = ((seed * 13 + i * 97) % 360) * Math.PI / 180;
      var len = r * (0.5 + ((seed * 7 + i * 31) % 40) / 100);
      var x0 = sx + Math.cos(a0) * r * 0.30;
      var y0 = by + Math.sin(a0) * r * 0.34;
      // 두 번 꺾어 번개 모양으로 — 직선이면 금이 아니라 흠집처럼 보인다
      var bx = x0 + Math.cos(a0) * len * 0.5 + Math.cos(a0 + 1.4) * r * 0.16;
      var byy = y0 + Math.sin(a0) * len * 0.5 + Math.sin(a0 + 1.4) * r * 0.16;
      var ex = x0 + Math.cos(a0) * len, ey = y0 + Math.sin(a0) * len * 0.9;

      // ── 금을 **2톤**으로 그린다 (2026-07-30) ────────────────────────────
      //  금은 잉크 한 색이었다. 아이보리 껍질 위에서는 대비 13.69 로 잘 보이지만,
      //  진영색이 칠해진 자리(어깨띠·외곽선) 위에서는 **어두운 진영색과 붙어 사라진다** —
      //  남색 대비 **1.64** / 크림슨 2.39. 즉 파란 진영만 체력을 시각적으로 못 읽는
      //  **비대칭 결함**이었고, 진영색 면적을 늘리면 그게 더 커진다.
      //  크림을 한 겹 깔고 잉크를 얹으면 실패 구간이 겹치지 않는다:
      //    · 어두운 진영색 위 → 크림이 8.34(남색)/5.74(크림슨) 로 받는다
      //    · 밝은 민트·녹청 위 → 잉크가 7.91/7.39 로 받는다
      //    · 아이보리 껍질 위 → 잉크가 13.69 로 받는다
      //  마커·발밑 링과 같은 상보 원리다.
      var cream = (UI.MAT && UI.MAT.shell) ? UI.MAT.shell : 0xf6eeda;
      g.lineStyle(Math.max(1.8, r * 0.15), cream, 0.55);
      g.beginPath();
      g.moveTo(x0, y0); g.lineTo(bx, byy); g.lineTo(ex, ey);
      g.strokePath();

      g.lineStyle(Math.max(1.2, r * 0.09), ink, 0.72);
      g.beginPath();
      g.moveTo(x0, y0); g.lineTo(bx, byy); g.lineTo(ex, ey);
      g.strokePath();
    }

    // 피격 번쩍 — 맞은 직후 짧게 흰빛이 덮인다(명중했다는 확인)
    if (hurt > 0) {
      var k = Math.min(1, hurt / 220);
      g.fillStyle(0xffffff, 0.55 * k);
      g.fillEllipse(sx, by, r * 1.7, r * 2.0, SM);
    }
  };

  // ── UI 패널용 (투영 없음) ─────────────────────────────────────
  //  기존 시그니처 + walk + idle:
  //    (g, def, sx, sy, color, alpha, scale, facing, walk, idle)
  //  칩·미니맵에 들어가므로 무기 사거리를 줄여(reach 0.72) 박스를 벗어나지 않게 한다.
  //
  //  idle 에 **매 프레임의 시각(ms)** 을 넘기면 그 한 기만 숨쉬고 주기적으로 공격한다.
  //  캐릭터 선택 화면에서 고른 카드에만 넘기면 나머지는 정지 포즈로 남는다.
  //    var t = self.time.now;                       // 씬이 가진 시각
  //    GAME.UI.drawUnitFlat(g, h, cx, feetY, C.controller, 1, sc, Math.PI / 2,
  //                         null, on ? t : undefined);
  //  `act` 는 `drawUnit` 과 **같은 모양**이다({art,t,dur,wind,kind,type}). 상점의 스킬
  //  미리보기가 이 인자로 모션 포즈를 되풀이 재생한다 — 전장이 아니므로 반복이 안전하다.
  //  안 넘기면 예전 그림 그대로다(칩·미니맵은 픽셀 단위로 무변경).
  UI.drawUnitFlat = function (g, def, sx, sy, color, alpha, scale, facing, walk, idle, act, gearTier) {
    var r = def.radius * (scale || 1);
    var a = alpha === undefined ? 1 : alpha;
    // 용 권속은 별도 파일이 그린다(위 `drawUnit` 과 같은 이유).
    if (GAME.BossArt && GAME.BossArt.draw(g, def, sx, sy, r, a, idle || 0, facing)) return;
    var art = UI.artOf(def);
    if (art.ground) { UI.drawGroundArt(g, art, sx, sy, r, color, a); return; }
    UI.drawEggChar(g, art, sx, sy, r, color, a, facing === undefined ? 0 : facing, false, 0.72,
                   walk, UI.rankOf(def), idle, act, 0, gearTier);
  };

  // ── **실제로 칠해지는 범위** (앵커 기준, r 단위) ───────────────────────────
  //  왜 표가 필요한가: 이 파일이 보장하는 "위 3.2r · 아래 1.8r" 은 *안전 상한*이지
  //  실측치가 아니다. 로딩 화면이 그 상한으로 크기를 잡았더니 띠의 30% 가 늘 비었고,
  //  반대로 상한을 믿고 줄였더니 쇠뇌 진지가 진행바를 뚫고 나갔다(둘 다 실측).
  //  아래 값은 유닛 10종을 한 기씩 그려 **화면 픽셀에서 경계 상자를 읽어** 얻었다
  //  (2026-08-01, PC 1340×900 · facing 정면 · 무기 포함 · 모션 없음).
  //  ⚠ 크기를 결정하는 **레이아웃 전용**이다 — 판정에는 절대 쓰지 말 것.
  //    사거리·피격 판정은 `def.radius` 하나만 본다(이 폴더가 이미 겪은 함정).
  //  ⚠ 아트를 고치면 이 숫자도 같이 낡는다. `tools/flat-extents-audit.js` 가
  //    실측과 이 표를 대조하므로, 어긋나면 그 도구가 먼저 알려준다.
  UI.FLAT_EXTENTS = {
    warrior:    { up: 2.15, down: 1.08, halfW: 1.73 },
    archer:     { up: 1.81, down: 1.08, halfW: 1.96 },
    slinger:    { up: 1.92, down: 1.29, halfW: 1.49 },
    spearman:   { up: 2.07, down: 1.08, halfW: 1.24 },
    herbalist:  { up: 2.35, down: 1.33, halfW: 1.46 },
    shieldman:  { up: 2.09, down: 1.08, halfW: 1.88 },
    chieftain:  { up: 2.25, down: 1.18, halfW: 1.58 },
    ballista:   { up: 1.80, down: 1.41, halfW: 1.45 },
    bogman:     { up: 1.63, down: 1.08, halfW: 1.44 },
    snaretrap:  { up: 0.83, down: 0.82, halfW: 1.15 }
  };
  // 표에 없는 아트(새로 넣은 것·보스)는 **최악값**으로 잡는다 — 모르면 크게 잡아
  // 삐져나오지 않게 하는 쪽이 안전하다. 새 아트를 넣으면 위 표에 실측을 추가할 것.
  UI.FLAT_EXTENT_MAX = { up: 2.35, down: 1.41, halfW: 1.96 };
  UI.flatExtents = function (def) {
    var art = def && (def.art || (UI.artOf(def) && UI.artOf(def).key));
    return (art && UI.FLAT_EXTENTS[art]) || UI.FLAT_EXTENT_MAX;
  };

})(GAME.UI);


// ============================================================================
//  죽음 연출 — 노른자 터짐
//  피 대신 노른자. 12세 이용가 톤: 짧고 귀엽게, 얼룩은 금방 사라진다.
// ============================================================================

// ── (1) combat.js — 유닛이 죽는 3곳에서 이펙트를 밀어 넣는다 ────────────────
//
//  GAME.Combat.spawnYolk 를 추가하고, 아래 3곳에서 호출한다.
//    ① applyDamage()   : `unit.hp = 0; unit.alive = false;` 바로 다음
//    ② 지뢰 피해 처리  : `if (vic.hp <= 0) { vic.hp = 0; vic.alive = false; }` 안
//    ③ 지뢰 자폭       : `u.alive = false;   // 1회용` 다음
//
//  GAME.Combat.spawnYolk = function (state, unit) {
//    if (!state) return;
//    var r = unit.def.radius;
//    state.effects.push({
//      kind: 'yolk', x: unit.x, y: unit.y, r: r,
//      hero: !!unit.isHero, seed: Math.random() * 6.283,
//      t: 480, total: 480, side: unit.side
//    });
//    state.effects.push({
//      kind: 'yolkStain', x: unit.x, y: unit.y, r: r,
//      t: 1600, total: 1600, side: unit.side
//    });
//  };

// ── (2) battle.js drawWorld() 의 이펙트 분기에 두 종류를 추가 ────────────────
//     `} else if (e.kind === 'lob') {` 앞에 그대로 끼워 넣으면 된다.
//
//     } else if (e.kind === 'yolkStain') {
//       var st = e.t / e.total;
//       g.fillStyle(0xffc233, 0.22 * st);
//       GAME.UI.groundCircleFill(g, e.x, e.y, e.r * 1.35);
//
//     } else if (e.kind === 'yolk') {
//       GAME.UI.drawYolkBurst(g, e);
//     }

GAME.UI.drawYolkBurst = function (g, e) {
  var Iso = GAME.Iso, M = GAME.UI.MAT, FX = GAME.UI.FX || {};
  var p = 1 - e.t / e.total;                  // 0 → 1
  var r = e.r;
  var gy = Iso.toScreenY(e.y);                // 지면 y
  var i, ang, dist, ex, ey;
  // 밝은 목초지에서는 흰자(#fff6e2)도 껍질(#f6eeda)도 배경과 1.4:1 이라 안 보인다.
  // 죽음이 안 보이면 "몇 기 남았나"를 눈으로 셀 수 없다 — 잉크 테두리로 붙잡는다.
  var ink = (FX.inkAlpha > 0) ? FX.ink : null;

  // ① 흰자 — 지면에 퍼진다
  var wr = r * (0.45 + p * 1.30);
  if (ink !== null) {
    g.lineStyle(2, ink, 0.45 * (1 - p * 0.85));
    GAME.UI.groundCircle(g, e.x, e.y, wr);
  }
  g.fillStyle(M.albumen, 0.85 * (1 - p * 0.85));
  GAME.UI.groundCircleFill(g, e.x, e.y, wr);

  // ② 껍질 조각 — 사방으로 튀며 떨어진다
  var shards = e.hero ? 9 : 6;
  for (i = 0; i < shards; i++) {
    ang = e.seed + (Math.PI * 2 / shards) * i;
    dist = r * (0.5 + p * 2.1);
    ex = e.x + Math.cos(ang) * dist;
    ey = Iso.toScreenY(e.y + Math.sin(ang) * dist) - Math.sin((1 - p) * Math.PI * 0.5) * r * 0.9;
    var sr = Math.max(1, r * 0.19 * (1 - p * 0.4));
    if (ink !== null) {
      g.fillStyle(ink, 0.7 * (1 - p * p));
      g.fillEllipse(ex, ey, (sr + 1.2) * 2, (sr + 1.2) * 2, SM);
    }
    g.fillStyle(M.shell, 0.95 * (1 - p * p));
    g.fillEllipse(ex, ey, (sr) * 2, (sr) * 2, SM);
  }

  // ③ 노른자 — 통 튀어올랐다가 지면에 내려앉는다
  var hop = Math.sin(Math.min(1, p * 1.3) * Math.PI) * r * 1.6;
  var yr = r * (0.58 + p * 0.10);
  var yx = e.x, yy = gy - hop - r * 0.28;
  var yw = yr * 2 * (1 + p * 0.25), yh = yr * 2 * (1 - p * 0.30);
  if (ink !== null) {
    g.fillStyle(ink, 0.8);
    g.fillEllipse(yx, yy, yw + 3, yh + 3, SM);
  }
  g.fillStyle(M.yolk, 0.98);
  g.fillEllipse(yx, yy, yw, yh, SM);
  g.fillStyle(M.yolkLite, 0.9);
  g.fillEllipse(yx - yr * 0.30, yy - yr * 0.32, yr * 0.80, yr * 0.62, SM);

  // ④ 노른자에도 눈 — 이 게임에서 죽음은 아프지 않다.
  //    ×자 눈으로 바꿨다. 점 두 개는 살아 있는 계란의 눈과 같아서
  //    "죽었다"가 아니라 "굴러다닌다"로 읽혔다. 만화 관용이라 12세 톤도 유지된다.
  if (r >= 9 && p < 0.8) {
    var ea = 0.85 * (1 - p / 0.8);
    var ew = Math.max(1.4, yr * 0.30);
    g.lineStyle(Math.max(1.4, yr * 0.15), M.eye, ea);
    for (var s2 = -1; s2 <= 1; s2 += 2) {
      var exx = yx + s2 * yr * 0.32, eyy = yy + yr * 0.02;
      g.lineBetween(exx - ew, eyy - ew, exx + ew, eyy + ew);
      g.lineBetween(exx - ew, eyy + ew, exx + ew, eyy - ew);
    }
  }
};
