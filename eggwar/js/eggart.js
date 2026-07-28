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
// ============================================================================

window.GAME = window.GAME || {};
GAME.UI = GAME.UI || {};

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
    bone: 0xeae3cd, leaf: 0x63c26a, leafDark: 0x3f8a4a,
    clay: 0xb5794a, rope: 0xd9c9a2, stone: 0x9aa3ad, goo: 0xa8c14a,
    feather: 0xe0705a,
    shell: 0xf6eeda, shellRim: 0xcbb98f,
    yolk: 0xffc233, yolkLite: 0xffe89a, albumen: 0xfff6e2,
    eye: 0x2b2233
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
      fillCircle: function (x, y, r) { set(); g.fillCircle(x, y, r + k); },
      strokeCircle: function (x, y, r) { g.strokeCircle(x, y, r); },
      fillEllipse: function (x, y, w, h) { set(); g.fillEllipse(x, y, w + k * 2, h + k * 2); },
      strokeEllipse: function (x, y, w, h) { g.strokeEllipse(x, y, w, h); },
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

  // ── 달걀 외곽선 ───────────────────────────────────────────────
  // 위는 좁고 아래는 넓다. 반높이 r, 최대 반폭 ≈ 1.04 * r * wide
  // lean : 보행 기울기. 발밑을 축으로 꼭대기를 lean 만큼 민다(전단 변형).
  UI.eggPoints = function (cx, cy, r, wide, n, lean) {
    var pts = [], N = n || 20, i, a, y, w, f;
    wide = wide || 0.78;
    lean = lean || 0;
    for (i = 0; i < N; i++) {
      a = (Math.PI * 2 / N) * i;
      y = -Math.cos(a) * r;
      w = 1 - 0.30 * Math.cos(a);
      f = (r - y) / (2 * r);                     // 꼭대기 1 → 바닥 0
      pts.push({ x: cx + Math.sin(a) * r * wide * w + lean * f, y: cy + y });
    }
    return pts;
  };

  // ── 아트 정의표 ───────────────────────────────────────────────
  //  helm  : 머리 위 실루엣 (가장 강한 구분 신호)
  //  gear  : 손에 든 것 / 앞 레이어
  //  back  : 몸 뒤 레이어 (화살통·망토 등)
  //  face  : 'open' | 'slit' | 'none'
  //  wide  : 달걀 가로 비율 (체급 표현)
  UI.ART = {
    // ── 전략가 유닛 10종 ──
    warrior:  { helm: 'pot',     gear: 'sword',      back: null,     face: 'open', wide: 0.80 },
    archer:   { helm: 'band',    gear: 'bow',        back: 'quiver', face: 'open', wide: 0.74 },
    slinger:  { helm: 'cap',     gear: 'sling',      back: 'pouch',  face: 'open', wide: 0.76 },
    spearman: { helm: 'hood',    gear: 'javelin',    back: null,     face: 'open', wide: 0.74 },
    herbalist:{ helm: 'leaf',    gear: 'leafstaff',  back: 'pack',   face: 'open', wide: 0.76 },
    shieldman:{ helm: 'bucket',  gear: 'towerShield',back: null,     face: 'slit', wide: 0.86 },
    chieftain:{ helm: 'horns',   gear: 'handaxe',    back: 'cape',   face: 'open', wide: 0.78 },
    bogman:   { helm: 'sedge',   gear: 'sapjar',     back: null,     face: 'open', wide: 0.78 },
    ballista: { helm: 'pot',     gear: 'crossbowNest', back: null,   face: 'open', wide: 0.80, squat: true },
    snaretrap:{ ground: 'spiketrap' },

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

  // ── 몸통 ──────────────────────────────────────────────────────
  UI.eggBody = function (g, art, sx, by, r, color, a, lean) {
    var ivory = UI.EGG_STYLE === 'ivory';
    var shell = ivory ? M.shell : color;
    var wide = art.wide || 0.78;
    lean = lean || 0;
    var outer = UI.eggPoints(sx, by, r, wide, 20, lean);

    // 베이스(그늘) → 밝은 안쪽 달걀을 좌상단으로 밀어 우하단에 초승달 그림자를 남긴다
    g.fillStyle(UI.tint(shell, -0.30), a);
    g.fillPoints(outer, true);
    g.fillStyle(shell, a);
    g.fillPoints(UI.eggPoints(sx - r * 0.06, by - r * 0.05, r * 0.90, wide, 20, lean * 0.90), true);

    // 하이라이트
    if (r >= 8) {
      g.fillStyle(UI.tint(shell, 0.45), a * (ivory ? 0.9 : 0.55));
      g.fillEllipse(sx - r * 0.24 + lean * 0.70, by - r * 0.40, r * 0.36, r * 0.46);
    }

    // 외곽선 — ivory 시안에서는 이게 진영 식별의 주역이라 두껍게 간다
    g.lineStyle(ivory ? Math.max(1.8, r * 0.17) : Math.max(1, r * 0.09),
                ivory ? color : UI.tint(color, -0.45), a);
    g.strokePoints(outer, true, true);

    // ivory 시안 — 진영색 목도리
    if (ivory && r >= 8) {
      g.fillStyle(color, a);
      g.fillEllipse(sx + lean * 0.665, by - r * 0.33, r * 1.18 * (wide / 0.78), r * 0.30);
      g.fillStyle(UI.tint(color, -0.28), a);
      g.fillEllipse(sx + lean * 0.63, by - r * 0.26, r * 1.18 * (wide / 0.78), r * 0.14);
    }
  };

  // ── 얼굴 ──────────────────────────────────────────────────────
  // 투구 틈(슬릿)의 화면상 높이 — 눈을 정확히 그 안에 넣어야 한다
  UI.SLIT_Y = { bucket: 0.82, crest: 0.84 };

  UI.eggFace = function (g, art, sx, by, r, a, D) {
    if (r < 7 || art.face === 'none') return;
    D = UI.asDir(D);
    var lat = D.lat, prof = D.profile;

    // ── 뒤통수 ── 눈이 없어야 "등을 보이고 있다"가 즉시 읽힌다
    if (D.back) {
      if (art.face === 'slit') return;                 // 통투구는 뒷면 자체가 신호
      g.fillStyle(0x000000, a * 0.12);                 // 뒤통수 그늘
      g.fillEllipse(sx, by - r * 0.24, r * 0.96, r * 0.86);
      if (r >= 11) {                                   // 가마
        g.lineStyle(Math.max(0.8, r * 0.055), 0x000000, a * 0.22);
        g.strokeCircle(sx + lat * r * 0.10, by - r * 0.40, r * 0.17);
      }
      return;
    }

    var ey = by - r * 0.14;

    if (art.face === 'slit') {              // 투구 틈 안에서 빛나는 눈
      var sy = by - r * (UI.SLIT_Y[art.helm] || 0.55);
      var sox = lat * r * 0.10;
      g.fillStyle(0xfff0b0, a * 0.9);
      if (prof) {
        g.fillCircle(sx + sox + lat * r * 0.13, sy, Math.max(0.9, r * 0.08));
      } else {
        g.fillCircle(sx - r * 0.17 + sox, sy, Math.max(0.9, r * 0.075));
        g.fillCircle(sx + r * 0.17 + sox, sy, Math.max(0.9, r * 0.075));
      }
      return;
    }

    if (prof) {                              // ── 옆모습: 눈 하나 + 부리 융기
      var px2 = sx + lat * r * 0.28;
      g.fillStyle(M.eye, a * 0.92);
      g.fillCircle(px2, ey, Math.max(1, r * 0.105));
      if (r >= 10) {                         // 실루엣을 뚫고 나오는 작은 코
        g.fillStyle(UI.tint(UI.EGG_STYLE === 'ivory' ? M.shell : M.shellRim, -0.10), a);
        g.fillTriangle(sx + lat * r * 0.52, ey - r * 0.06,
                       sx + lat * r * 0.74, ey + r * 0.09,
                       sx + lat * r * 0.48, ey + r * 0.16);
      }
      if (r >= 13) {
        g.fillStyle(0xff9a8a, a * 0.30);
        g.fillCircle(sx + lat * r * 0.46, ey + r * 0.20, r * 0.13);
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
    g.fillCircle(xL, ey, nearIsRight ? rF : rN);
    g.fillCircle(xR, ey, nearIsRight ? rN : rF);
    if (r >= 13) {                          // 볼 홍조 — 12세 톤
      g.fillStyle(0xff9a8a, a * 0.30);
      g.fillCircle(sx - r * 0.40 + ox, ey + r * 0.20, r * 0.13);
      g.fillCircle(sx + r * 0.40 + ox, ey + r * 0.20, r * 0.13);
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

    if (kind === 'pot') {                    // 전사 — 낮고 넓은 냄비투구
      var pw = prof ? 1.06 : 1.24;
      var pcx = sx + lat * r * 0.06;
      g.fillStyle(M.bladeDark, a);
      g.fillEllipse(pcx, by - r * 0.70, r * pw, r * 0.86);
      g.fillStyle(UI.tint(M.bladeDark, -0.25), a);
      g.fillRect(pcx - r * pw * 0.55, by - r * 0.74, r * pw * 1.10, r * 0.20);
      if (back) {                            // 뒤 — 목가리개 + 리벳
        g.fillStyle(UI.tint(M.bladeDark, -0.14), a);
        g.fillEllipse(sx, by - r * 0.36, r * 1.02, r * 0.44);
        if (r >= 10) {
          g.fillStyle(UI.tint(M.bladeDark, 0.22), a);
          g.fillRect(sx - r * 0.46, by - r * 0.62, r * 0.92, Math.max(1, r * 0.08));
          g.fillCircle(sx, by - r * 0.86, Math.max(1, r * 0.09));
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
      g.fillEllipse(sx, by - r * 0.66, r * (prof ? 0.86 : 1.02), r * 0.30);
      g.fillStyle(M.feather, a);
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
      g.fillEllipse(sx, by - r * 0.78, r * (prof ? 0.86 : 0.96), r * 0.62);
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
        g.fillEllipse(sx + lat * r * 0.14, by - r * 0.62, r * 1.28, r * 0.30);
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
      g.fillEllipse(sx, by - r * 0.68, r * (prof ? 0.80 : 1.00), r * 0.26);
      g.fillStyle(M.leaf, a);
      if (prof) {                            // 옆 — 잎이 앞뒤로 겹친다
        g.fillEllipse(sx - lat * r * 0.30, by - r * 0.86, r * 0.44, r * 0.20);
        g.fillEllipse(sx + lat * r * 0.36, by - r * 0.98, r * 0.66, r * 0.26);
        g.fillEllipse(sx + lat * r * 0.08, by - r * 1.18, r * 0.28, r * 0.44);
      } else if (back) {                     // 뒤 — 묶음 매듭이 보인다
        g.fillEllipse(sx - r * 0.46, by - r * 0.96, r * 0.58, r * 0.24);
        g.fillEllipse(sx + r * 0.46, by - r * 0.96, r * 0.58, r * 0.24);
        g.fillEllipse(sx, by - r * 1.08, r * 0.26, r * 0.36);
        g.fillStyle(M.rope, a);
        g.fillCircle(sx, by - r * 0.70, Math.max(1, r * 0.18));
      } else {
        g.fillEllipse(sx - r * 0.48, by - r * 1.00, r * 0.62, r * 0.26);
        g.fillEllipse(sx + r * 0.48, by - r * 1.00, r * 0.62, r * 0.26);
        g.fillEllipse(sx + lat * r * 0.10, by - r * 1.20, r * 0.30, r * 0.46);
      }

    } else if (kind === 'bucket') {          // 방패병 — 통투구
      var bwr = prof ? 0.44 : 0.56;
      g.fillStyle(M.iron, a);
      g.fillRoundedRect(sx - r * bwr, by - r * 1.30, r * bwr * 2, r * 1.06, r * 0.18);
      if (back) {                            // 뒤 — 틈이 없다. 대신 목가리개 + 리벳
        g.fillStyle(UI.tint(M.iron, -0.24), a);
        g.fillRoundedRect(sx - r * 0.64, by - r * 0.46, r * 1.28, r * 0.48, r * 0.12);
        if (r >= 10) {
          g.fillStyle(UI.tint(M.iron, 0.20), a);
          g.fillRect(sx - r * 0.40, by - r * 1.02, r * 0.80, Math.max(1, r * 0.09));
          g.fillCircle(sx, by - r * 0.76, Math.max(1, r * 0.10));
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
        g.fillEllipse(sx, by - r * 0.74, r * (prof ? 0.92 : 1.10), r * 0.70);
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
        g.fillCircle(sx, by - r * 0.56, Math.max(1, r * 0.12));
      } else {
        dome();
        horn(-1, lat < 0 ? 1.08 : 0.92, M.bone, 0);
        horn(1, lat > 0 ? 1.08 : 0.92, M.bone, 0);
        g.fillStyle(M.bronze, a);
        g.fillRect(sx - r * 0.52, by - r * 0.88, r * 1.04, Math.max(1.2, r * 0.14));
      }

    } else if (kind === 'sedge') {           // 늪지기 — 삿갓 (게임에서 가장 넓은 실루엣)
      var brim = prof ? 1.10 : 1.34;
      g.fillStyle(M.rope, a);
      g.fillTriangle(sx + lat * r * 0.10, by - r * 1.52,
                     sx - r * brim, by - r * 0.52,
                     sx + r * brim, by - r * 0.52);
      if (back) {                            // 뒤 — 갓 윗면이 보이고 턱끈 매듭이 등에
        g.fillStyle(UI.tint(M.rope, 0.20), a);
        g.fillEllipse(sx, by - r * 0.58, r * brim * 1.86, r * 0.30);
        g.fillStyle(UI.tint(M.rope, -0.34), a);
        g.fillEllipse(sx, by - r * 0.28, r * 0.32, r * 0.24);
      } else {                               // 앞·옆 — 챙 아랫면 그림자
        g.fillStyle(UI.tint(M.rope, -0.22), a);
        g.fillRect(sx - r * brim, by - r * 0.62, r * brim * 2, Math.max(1.4, r * 0.16));
        if (!prof) {
          g.fillStyle(0x000000, a * 0.16);
          g.fillEllipse(sx + lat * r * 0.10, by - r * 0.46, r * 1.16, r * 0.32);
        }
      }

    } else if (kind === 'onehorn') {         // 광전사 — 뼈 가시 볏 (앞뒤로 선 모히칸)
      g.fillStyle(M.leatherDark, a);
      g.fillEllipse(sx, by - r * 0.78, r * (prof ? 1.00 : 1.18), r * 0.76);
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
      g.fillEllipse(sx, by - r * 1.00, r * (prof ? 0.90 : 1.04), r * 0.26);
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
        g.fillEllipse(sx, by - r * 0.80, r * 1.00, r * 0.94);
        ear(lat, 1.16);
      } else {
        g.fillStyle(M.leatherDark, a);
        g.fillEllipse(sx, by - r * 0.80, r * 1.16, r * 0.94);
        ear(-1, lat < 0 ? 1.08 : (lat > 0 ? 0.84 : 1.0));
        ear(1, lat > 0 ? 1.08 : (lat < 0 ? 0.84 : 1.0));
      }
      if (back) {                            // 뒤 — 주둥이 없음. 등을 타고 내려온 가죽 꼬리
        g.fillStyle(UI.tint(M.leatherDark, -0.14), a);
        g.fillRoundedRect(sx - r * 0.19, by - r * 0.56, r * 0.38, r * 0.94, r * 0.18);
        g.fillStyle(UI.tint(M.leather, 0.18), a);
        g.fillCircle(sx, by + r * 0.34, Math.max(1, r * 0.17));
      } else {                               // 앞·옆 — 짐승 주둥이
        g.fillStyle(UI.tint(M.leatherDark, -0.12), a);
        if (prof) {
          g.fillTriangle(sx + lat * r * 0.28, by - r * 0.88,
                         sx + lat * r * 1.18, by - r * 0.60,
                         sx + lat * r * 0.32, by - r * 0.38);
        } else {
          g.fillEllipse(sx + lat * r * 0.14, by - r * 0.54, r * 0.70, r * 0.34);
        }
      }
      g.fillStyle(UI.tint(M.leatherDark, -0.3), a);
      g.fillEllipse(sx, by - r * 0.44, r * (prof ? 0.84 : 0.98), r * 0.30);

    } else if (kind === 'crest') {           // 파수꾼 — 통투구 + 앞뒤로 선 볏
      var cwr = prof ? 0.46 : 0.58;
      g.fillStyle(M.iron, a);
      g.fillRoundedRect(sx - r * cwr, by - r * 1.34, r * cwr * 2, r * 1.10, r * 0.20);
      if (back) {
        g.fillStyle(UI.tint(M.iron, -0.24), a);
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
      g.fillStyle(M.feather, a);             // 볏
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
      g.lineStyle(Math.max(2, r * 0.30), M.leatherDark, a);
      g.lineBetween(qx - r * 0.35, qy + r * 0.55, qx + r * 0.20, qy - r * 0.90);
      g.fillStyle(M.feather, a);
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
        g.fillCircle(sx - r * 0.60, by + r * 0.16, Math.max(1, r * 0.13));
        g.fillCircle(sx + r * 0.60, by + r * 0.16, Math.max(1, r * 0.13));
      }

    } else if (kind === 'fur') {             // 어깨 털가죽
      var fw = prof ? 0.52 : 0.72;
      g.fillStyle(M.leatherDark, a);
      g.fillEllipse(sx - r * 0.78, by - r * 0.02, r * fw, r * 0.54);
      g.fillEllipse(sx + r * 0.78, by - r * 0.02, r * fw, r * 0.54);
      if (back) {
        g.fillStyle(UI.tint(M.leatherDark, 0.14), a);
        g.fillEllipse(sx, by - r * 0.16, r * 1.30, r * 0.46);
      }

    } else if (kind === 'pack') {            // 등짐
      g.fillStyle(M.leather, a);
      g.fillRoundedRect(sx + ox * 1.72 - r * 0.34, by + oy * 1.20 - r * 0.30, r * 0.68, r * 0.86, r * 0.14);
      g.fillStyle(M.leafDark, a);
      g.fillEllipse(sx + ox * 1.72, by + oy * 1.20 - r * 0.40, r * 0.44, r * 0.24);

    } else if (kind === 'pouch') {           // 돌주머니
      g.fillStyle(M.leather, a);
      g.fillEllipse(sx + ox * 1.55, by + oy * 1.10 + r * 0.30, r * 0.62, r * 0.56);
      g.fillStyle(M.stone, a);
      g.fillCircle(sx + ox * 1.55, by + oy * 1.10 + r * 0.12, r * 0.17);
    }
  };

  // ── 손에 든 것 ────────────────────────────────────────────────
  //  로컬 좌표계: f = 정면 방향, p = 측면 방향. 둘 다 r 배수.
  //  뒤를 보고 있으면 drawEggChar 가 이걸 몸통보다 먼저 불러 가려버린다.
  UI.GEAR_ALWAYS_FRONT = { crossbowNest: 1 };   // 지형 구조물은 늘 몸통 위

  UI.eggGear = function (g, kind, sx, by, r, color, a, D, reach) {
    if (!kind) return;
    D = UI.asDir(D);
    reach = (typeof reach === 'number' && isFinite(reach)) ? reach : 1;
    var fx = D.fx, fy = D.fy, px = D.px, py = D.py;
    var lw = function (m) { return Math.max(1.2, r * m); };
    // 로컬 → 화면
    var X = function (f, p) { return sx + fx * r * f * reach + px * r * p; };
    var Y = function (f, p, up) { return by + fy * r * f * reach + py * r * p - r * (up || 0); };
    var hx = X(0.82, 0.30), hy = Y(0.82, 0.30, 0.05);   // 주손 위치
    var side = D.lat >= 0 ? 1 : -1;

    // ── 칼날 방향 ────────────────────────────────────────────────────────
    //  지면 정면축(fx, fy)만으로 무기를 뻗으면 **관객 쪽·반대쪽을 볼 때 길이가 0 으로 눌린다.**
    //  실제로 광전사 대검이 정면에서 턱 밑의 짧은 막대가 돼 있었다(스크린샷 확인).
    //  정면축에 '화면 위쪽'을 섞어 어느 방향에서도 최소 길이를 확보한다.
    //  up 이 클수록 세워 들고, 작을수록 앞으로 겨눈다.
    //  옆으로도 밀어준다: 정면·정배면일수록 칼이 얼굴 한가운데를 세로로 가른다.
    //  lateral 은 옆모습(|fx|=1)에서 0, 정면(|fx|=0)에서 최대가 된다.
    function bladeDir(up) {
      var lateral = (1 - Math.abs(fx)) * 0.55;
      var dx = fx + px * lateral, dy = fy - up + py * lateral;
      var l = Math.sqrt(dx * dx + dy * dy) || 1;
      return { x: dx / l, y: dy / l };
    }
    // 자루→끝까지 좁아지는 사각 날. 어느 각도에서도 '칼'로 읽힌다.
    function taperBlade(x0, y0, dir, len, w0, w1, fill, edge) {
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
      g.fillStyle(M.wood, a); g.fillCircle(bx, byy, r * 0.50);
      g.lineStyle(lw(0.09), M.woodDark, a); g.strokeCircle(bx, byy, r * 0.50);
      g.fillStyle(M.bronze, a); g.fillCircle(bx, byy, r * 0.17);

      // 자루 — 손 아래로 짧게
      var swDir = bladeDir(0.95);
      g.lineStyle(lw(0.17), M.woodDark, a);
      g.lineBetween(hx - swDir.x * r * 0.34, hy - swDir.y * r * 0.34, hx, hy);
      // 날 — 손에서 앞·위로. 예전엔 지면축으로만 뻗어 정면에서 사라졌다.
      taperBlade(hx, hy, swDir, r * 1.35, r * 0.24, r * 0.11, M.blade);
      // 날밑(코등이) — 자루와 날 사이 가로 막대. 이게 있어야 '검'으로 읽힌다.
      g.lineStyle(lw(0.15), M.bronze, a);
      g.lineBetween(hx + swDir.y * r * 0.34, hy - swDir.x * r * 0.34,
                    hx - swDir.y * r * 0.34, hy + swDir.x * r * 0.34);
      g.fillStyle(M.bronze, a);              // 자루 끝 구슬
      g.fillCircle(hx - swDir.x * r * 0.38, hy - swDir.y * r * 0.38, Math.max(1, r * 0.11));

    } else if (kind === 'bow' || kind === 'longbow') {   // 궁수/사냥꾼 — 세로 C
      var big = kind === 'longbow' ? 1.30 : 1.0;
      var cxp = X(0.72, 0.10), cyp = Y(0.72, 0.10, 0.10);
      var h = r * 1.05 * big, bulge = r * 0.46 * big * side;
      var arc = [], k, t;
      for (k = 0; k <= 6; k++) {
        t = -1 + (2 / 6) * k;
        arc.push({ x: cxp + bulge * (1 - t * t), y: cyp + h * t });
      }
      g.lineStyle(lw(0.13 * big), M.wood, a);
      g.strokePoints(arc, false, false);
      g.lineStyle(Math.max(0.8, r * 0.05), M.rope, a * 0.9);        // 시위
      g.lineBetween(arc[0].x, arc[0].y, cxp - bulge * 0.28, cyp);
      g.lineBetween(cxp - bulge * 0.28, cyp, arc[6].x, arc[6].y);
      g.lineStyle(Math.max(0.8, r * 0.06), M.bone, a);              // 메긴 화살
      g.lineBetween(cxp - bulge * 0.34, cyp, cxp + bulge * 2.0, cyp);

    } else if (kind === 'sling') {           // 투석꾼 — 머리 위에서 도는 무릿매
      var lxp = sx + fx * r * 0.18, lyp = by - r * 1.38 + fy * r * 0.10;
      g.lineStyle(lw(0.08), M.rope, a * 0.85);
      g.strokeEllipse(lxp, lyp, r * 1.44, r * 0.56);
      g.lineBetween(hx, hy, lxp + r * 0.68, lyp + r * 0.06);
      g.fillStyle(M.stone, a);
      g.fillCircle(lxp + r * 0.72, lyp + r * 0.04, r * 0.26);
      g.fillStyle(UI.tint(M.stone, 0.35), a);
      g.fillCircle(lxp + r * 0.66, lyp - r * 0.04, r * 0.09);

    } else if (kind === 'javelin') {         // 투창병 — 몸의 두 배짜리 긴 작살
      var t0x = X(-1.00, 0.34), t0y = Y(-1.00, 0.34, 0.58);
      var t1x = X(1.72, 0.34), t1y = Y(1.72, 0.34, 0.30);
      g.lineStyle(lw(0.19), UI.tint(M.wood, 0.18), a);   // 어두운 지면에서 긴 직선이 죽지 않게 밝게
      g.lineBetween(t0x, t0y, t1x, t1y);
      var dxn = t1x - t0x, dyn = t1y - t0y, dl = Math.sqrt(dxn * dxn + dyn * dyn) || 1;
      dxn /= dl; dyn /= dl;
      g.fillStyle(M.blade, a);               // 촉
      g.fillTriangle(t1x + dxn * r * 0.42, t1y + dyn * r * 0.42,
                     t1x - dyn * r * 0.26, t1y + dxn * r * 0.26,
                     t1x + dyn * r * 0.26, t1y - dxn * r * 0.26);
      if (r >= 9) {                          // 미늘
        g.fillStyle(M.bone, a);
        g.fillTriangle(t1x - dxn * r * 0.30, t1y - dyn * r * 0.30,
                       t1x - dxn * r * 0.62 - dyn * r * 0.22, t1y - dyn * r * 0.62 + dxn * r * 0.22,
                       t1x - dxn * r * 0.62, t1y - dyn * r * 0.62);
      }

    } else if (kind === 'leafstaff') {       // 약초꾼 — 약초 다발 지팡이
      var stx = X(0.30, 0.66);
      g.lineStyle(lw(0.12), M.wood, a);
      g.lineBetween(stx, Y(0.30, 0.66, -0.55), stx, Y(0.30, 0.66, 1.55));
      g.fillStyle(M.leafDark, a);
      g.fillEllipse(stx, Y(0.30, 0.66, 1.62), r * 0.72, r * 0.34);
      g.fillStyle(M.leaf, a);
      g.fillEllipse(stx - r * 0.24, Y(0.30, 0.66, 1.82), r * 0.50, r * 0.26);
      g.fillEllipse(stx + r * 0.26, Y(0.30, 0.66, 1.74), r * 0.46, r * 0.24);
      g.fillStyle(0xd8f5c8, a * 0.55);       // 은은한 회복 기운
      g.fillCircle(stx, Y(0.30, 0.66, 1.72), r * 0.30);

    } else if (kind === 'towerShield') {     // 방패병 — 몸을 가리는 나무 대방패
      // 몸 앞으로 충분히 내밀어야 투구가 방패 위로 보인다(가려버리면 종류를 못 읽는다)
      var cx2 = X(1.02, 0.42), cy2 = Y(1.02, 0.42, 0.02);
      g.fillStyle(M.wood, a);
      g.fillRoundedRect(cx2 - r * 0.58, cy2 - r * 1.05, r * 1.16, r * 2.20, r * 0.26);
      g.lineStyle(lw(0.11), M.woodDark, a);
      g.strokeRoundedRect(cx2 - r * 0.58, cy2 - r * 1.05, r * 1.16, r * 2.20, r * 0.26);
      g.lineStyle(Math.max(0.8, r * 0.06), M.woodDark, a * 0.8);
      g.lineBetween(cx2 - r * 0.19, cy2 - r * 0.95, cx2 - r * 0.19, cy2 + r * 1.02);
      g.lineBetween(cx2 + r * 0.19, cy2 - r * 0.95, cx2 + r * 0.19, cy2 + r * 1.02);
      g.fillStyle(M.bronze, a);              // 방패 배꼽
      g.fillCircle(cx2, cy2, r * 0.28);
      g.fillStyle(UI.tint(M.bronze, 0.4), a);
      g.fillCircle(cx2 - r * 0.08, cy2 - r * 0.08, r * 0.10);

    } else if (kind === 'handaxe') {         // 족장 — 던지는 손도끼 + 깃대
      var pxp = X(0.05, -0.85);
      g.lineStyle(lw(0.10), M.wood, a);      // 등에 세운 깃대
      g.lineBetween(pxp, Y(0.05, -0.85, -0.40), pxp, Y(0.05, -0.85, 2.05));
      g.fillStyle(M.feather, a);
      g.fillTriangle(pxp, Y(0.05, -0.85, 2.10), pxp - r * 0.34, Y(0.05, -0.85, 1.45), pxp + r * 0.34, Y(0.05, -0.85, 1.45));

      g.lineStyle(lw(0.13), M.wood, a);
      g.lineBetween(hx, hy, X(1.55, 0.30), Y(1.55, 0.30, 0.05));
      g.fillStyle(M.bronze, a);              // 자루 한쪽에만 붙는 반달 날
      g.fillPoints([
        { x: X(1.14, 0.30), y: Y(1.14, 0.30, 0.10) },
        { x: X(1.52, 0.30), y: Y(1.52, 0.30, 0.14) },
        { x: X(1.62, 0.30), y: Y(1.62, 0.30, 0.72) },
        { x: X(1.30, 0.30), y: Y(1.30, 0.30, 0.88) },
        { x: X(1.06, 0.30), y: Y(1.06, 0.30, 0.60) }
      ], true);

    } else if (kind === 'sapjar') {          // 늪지기 — 끈끈한 수액 단지
      var jx = X(0.86, 0.16), jy = Y(0.86, 0.16, 0.05);
      g.fillStyle(M.clay, a);
      g.fillEllipse(jx, jy, r * 1.06, r * 0.82);
      g.fillStyle(UI.tint(M.clay, -0.30), a);
      g.fillRect(jx - r * 0.28, jy - r * 0.58, r * 0.56, r * 0.24);
      g.fillStyle(M.goo, a);                 // 흘러넘치는 수액
      g.fillEllipse(jx, jy - r * 0.52, r * 0.52, r * 0.20);
      g.fillCircle(jx + r * 0.30, jy + r * 0.06, r * 0.14);
      g.fillCircle(jx + r * 0.40, jy + r * 0.38, r * 0.10);

    } else if (kind === 'crossbowNest') {    // 쇠뇌 진지 — 통나무 방벽 + 거치 쇠뇌
      g.lineStyle(lw(0.17), M.woodDark, a);
      g.lineBetween(X(-0.55, 0), Y(-0.55, 0, 0.55), X(1.55, 0), Y(1.55, 0, 0.55));
      g.lineStyle(lw(0.13), M.wood, a);      // 활대 (정면 수직)
      g.lineBetween(X(1.05, -1.10), Y(1.05, -1.10, 0.55), X(1.05, 1.10), Y(1.05, 1.10, 0.55));
      g.lineStyle(Math.max(0.8, r * 0.05), M.rope, a);
      g.lineBetween(X(1.05, -1.10), Y(1.05, -1.10, 0.55), X(0.55, 0), Y(0.55, 0, 0.55));
      g.lineBetween(X(0.55, 0), Y(0.55, 0, 0.55), X(1.05, 1.10), Y(1.05, 1.10, 0.55));
      g.fillStyle(M.bone, a);
      g.fillCircle(X(1.35, 0), Y(1.35, 0, 0.55), r * 0.16);

      // 방벽 — 몸통 아래쪽을 가려 "반쯤 숨은 계란" 실루엣을 만든다
      g.fillStyle(M.wood, a);
      g.fillRect(sx - r * 1.32, by + r * 0.04, r * 2.64, r * 1.26);
      g.fillStyle(UI.tint(M.wood, -0.28), a);
      for (var w = 0; w < 4; w++) {
        g.fillRect(sx - r * 1.32 + r * 0.66 * w + r * 0.60, by + r * 0.04, Math.max(1, r * 0.08), r * 1.26);
      }
      g.fillStyle(UI.tint(M.wood, 0.18), a);
      g.fillRect(sx - r * 1.32, by + r * 0.04, r * 2.64, Math.max(1.4, r * 0.16));

    } else if (kind === 'greatsword') {      // 광전사 — 양손 대검
      // 영웅 중 가장 큰 무기다. 여기가 눌리면 광전사가 '아무것도 안 든 계란'이 된다
      // — 예전 구현은 정면에서 정확히 그 상태였다(길이 1r 짜리 막대).
      // 어깨 위로 크게 세워 들어 어느 각도에서도 실루엣이 남게 했다.
      var gsDir = bladeDir(1.55);
      var gsGripX = hx - gsDir.x * r * 0.30, gsGripY = hy - gsDir.y * r * 0.30;
      // 두 손 자루
      g.lineStyle(lw(0.20), M.woodDark, a);
      g.lineBetween(gsGripX - gsDir.x * r * 0.55, gsGripY - gsDir.y * r * 0.55, gsGripX, gsGripY);
      g.fillStyle(M.bronze, a);              // 자루 끝 구슬
      g.fillCircle(gsGripX - gsDir.x * r * 0.62, gsGripY - gsDir.y * r * 0.62, Math.max(1.2, r * 0.15));
      // 날 — 몸 높이의 2배 남짓
      taperBlade(gsGripX + gsDir.x * r * 0.34, gsGripY + gsDir.y * r * 0.34,
                 gsDir, r * 2.15, r * 0.34, r * 0.17, M.blade);
      // 날밑 — 자루에 직교하는 굵은 막대
      g.lineStyle(lw(0.17), M.bronze, a);
      g.lineBetween(gsGripX + gsDir.y * r * 0.52 + gsDir.x * r * 0.30,
                    gsGripY - gsDir.x * r * 0.52 + gsDir.y * r * 0.30,
                    gsGripX - gsDir.y * r * 0.52 + gsDir.x * r * 0.30,
                    gsGripY + gsDir.x * r * 0.52 + gsDir.y * r * 0.30);

    } else if (kind === 'hookShield') {      // 파수꾼 — 연꼴 방패 + 갈고리 창
      g.lineStyle(lw(0.13), M.wood, a);      // 갈고리 창 (E = 끌어당김)
      g.lineBetween(X(-0.90, -0.55), Y(-0.90, -0.55, 0.30), X(1.55, -0.55), Y(1.55, -0.55, 1.35));
      g.fillStyle(M.iron, a);
      g.fillTriangle(X(1.60, -0.55), Y(1.60, -0.55, 1.42),
                     X(1.20, -0.55), Y(1.20, -0.55, 1.52),
                     X(1.42, -0.55), Y(1.42, -0.55, 0.98));

      // 방패는 몸 옆·앞으로 크게 빼둔다 — 정면에 붙이면 계란이 통째로 사라진다
      var kx = X(1.14, 0.66), ky = Y(1.14, 0.66, 0.02);
      var kite = [
        { x: kx - r * 0.56, y: ky - r * 0.88 },
        { x: kx + r * 0.56, y: ky - r * 0.88 },
        { x: kx + r * 0.52, y: ky + r * 0.52 },
        { x: kx, y: ky + r * 1.20 },
        { x: kx - r * 0.52, y: ky + r * 0.52 }
      ];
      g.fillStyle(M.iron, a); g.fillPoints(kite, true);
      g.lineStyle(lw(0.11), UI.tint(M.iron, 0.30), a); g.strokePoints(kite, true, true);
      g.fillStyle(M.bronze, a);
      g.fillCircle(kx, ky - r * 0.10, r * 0.24);
    }
  };

  // ── 다리 ──────────────────────────────────────────────────────
  //  G 가 null 이면 v1 과 완전히 같은 좌표를 그린다.
  UI.eggLegs = function (g, art, sx, by, sy, r, color, a, D, G) {
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
    }
    g.lineStyle(lw, UI.tint(color, -0.45), a * 0.9);
    for (i = 0; i < 2; i++) {
      s = i === 0 ? -1 : 1;
      g.lineBetween(sx + swx + s * r * 0.26, by + bob + swy + r * 0.80, fex[i], fey[i]);
    }
    g.fillStyle(M.bronze, a);
    for (i = 0; i < 2; i++) {
      s = i === 0 ? -1 : 1;
      g.fillEllipse(fex[i] + s * r * 0.02, fey[i] + r * 0.04, r * 0.40, r * 0.22);
    }
  };

  // ── 지면 설치물 (계란이 아닌 것) ──────────────────────────────
  UI.drawGroundArt = function (g, art, sx, sy, r, color, a) {
    var Iso = GAME.Iso, T = Iso ? Iso.TILT : 1;
    if (art.ground === 'spiketrap') {        // 가시덫 — 나무 이빨 덫
      g.fillStyle(M.woodDark, a);
      g.fillEllipse(sx, sy, r * 2.30, r * 2.30 * T);
      g.fillStyle(0x241d16, a);
      g.fillEllipse(sx, sy, r * 1.40, r * 1.40 * T);
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
      g.fillEllipse(sx - r * 0.55, sy - r * 0.18 * T, r * 0.80, r * 0.34 * T);
      g.fillEllipse(sx + r * 0.50, sy + r * 0.30 * T, r * 0.72, r * 0.30 * T);
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
  //  재질은 중립색만(진영색 색역 침범 금지): L2~3 청동, L4~5 강철.
  //  이건 **보조 신호**다. 색을 지워도 네 단계가 형태로 남는다.
  //  r < 7 이면 전부 끈다(그 크기에서는 장식이 실루엣을 뭉갠다 — LOD 규칙).
  UI.rankMat = function (lv) { return lv >= 4 ? M.blade : M.bronze; };

  // 어깨 견장 (L2+) — 몸통 위, 투구 아래
  UI.eggRankBody = function (g, art, sx, by, r, color, a, D, lv) {
    if (lv < 2 || r < 7) return;
    D = UI.asDir(D);
    var mat = UI.rankMat(lv);
    var ex = r * 1.00 * ((art.wide || 0.78) / 0.78);
    var shy = by - r * 0.30;
    for (var s = -1; s <= 1; s += 2) {
      var hx = sx + D.px * ex * s, hy = shy + D.py * ex * s;
      g.fillStyle(UI.tint(mat, -0.12), a);
      g.fillTriangle(hx - D.px * s * r * 0.14, hy - D.py * s * r * 0.14 - r * 0.26,
                     hx + D.px * s * r * 0.58, hy + D.py * s * r * 0.58 + r * 0.06,
                     hx - D.px * s * r * 0.06, hy - D.py * s * r * 0.06 + r * 0.30);
      if (r >= 11) {                       // 판 위 굴곡 — 금속으로 읽히게
        g.fillStyle(UI.tint(mat, 0.28), a * 0.9);
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
    var bx = sx - D.fx * r * 0.52, byy = by - r * 0.30 - D.fy * r * 0.52;
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
      g.fillStyle(UI.rankMat(lv), a);
      g.fillTriangle(tx - r * 0.13, ty + r * 0.02, tx + r * 0.13, ty + r * 0.02, tx, ty - r * 0.36);
    }
  };

  // 볏(L3+) + 뿔 관(L5) — 투구 위
  UI.eggRankHead = function (g, art, sx, by, r, color, a, D, lv) {
    if (lv < 3 || r < 7) return;
    D = UI.asDir(D);
    var mat = UI.rankMat(lv);
    var cy = by - r * 1.02;

    if (lv >= 3) {
      // 볏 — 앞뒤축을 따라 늘어선 뿔 세 개(가운데가 가장 높다).
      // ⚠ 처음엔 앞뒤축만 쓰는 납작한 지느러미였는데, **정면에서 면적이 0 이 되어 사라졌다**
      //   (정면이면 D.fx=0 이라 세 꼭짓점의 x 가 같아진다 — 실측 스크린샷에서 L2 와 구분 불가).
      //   그래서 각 뿔에 가로 두께를 준다. 어느 방향에서 봐도 위로 솟은 실루엣이 남는다.
      var t3 = [-0.42, 0, 0.42];
      for (var j = 0; j < 3; j++) {
        var tt = t3[j];
        var bx3 = sx + D.fx * r * tt, by3 = cy + D.fy * r * tt;
        var hgt = (tt === 0 ? 0.92 : 0.58);
        var wdt = (tt === 0 ? 0.17 : 0.14);
        g.fillStyle(UI.tint(mat, tt === 0 ? 0.16 : -0.16), a);
        g.fillTriangle(bx3 - r * wdt, by3 + r * 0.06,
                       bx3 + r * wdt, by3 + r * 0.06,
                       bx3 + D.fx * r * 0.05, by3 - r * hgt);
      }
    }

    if (lv >= 5) {                          // 뿔 관 — 머리 둘레에서 바깥·위로 뻗는 뿔 세 개
      var ring = by - r * 0.74;
      g.lineStyle(Math.max(1.4, r * 0.13), mat, a);
      g.strokeEllipse(sx, ring, r * 1.34 * ((art.wide || 0.78) / 0.78), r * 0.40);
      var off = [-1, 0, 1];
      for (var i = 0; i < 3; i++) {
        var o = off[i];
        var hx = sx + D.px * r * 0.62 * o, hy = ring + D.py * r * 0.62 * o;
        g.fillStyle(mat, a);
        g.fillTriangle(hx - r * 0.13, hy,
                       hx + r * 0.13, hy,
                       hx + D.px * r * 0.30 * o, hy - r * (o === 0 ? 0.86 : 0.62));
      }
    }
  };

  // 발밑 계급 눈금 (전장 전용) — 레벨을 **정확히 셀 수 있게** 하는 보조 표시.
  // 실루엣만으로는 "3인가 4인가"가 헷갈릴 수 있고, 전장은 유닛이 수십 기다.
  UI.eggRankGround = function (g, sx, sy, r, color, a, lv) {
    if (lv < 2 || r < 8) return;
    var T = (GAME.Iso ? GAME.Iso.TILT : 1);
    var mat = UI.rankMat(lv);
    var rx = r * 1.28, ry = r * 1.28 * T;
    for (var i = 0; i < lv; i++) {
      // **발 앞쪽**(+PI/2)에 찍는다. 뒤(-PI/2)에 두면 캐릭터 몸통에 가려 하나도 안 보인다(실측).
      var ang = Math.PI / 2 + (i - (lv - 1) / 2) * 0.42;
      g.fillStyle(mat, a * 0.95);
      g.fillCircle(sx + Math.cos(ang) * rx, sy + Math.sin(ang) * ry, Math.max(1, r * 0.13));
    }
    if (lv >= 5) {                          // 발밑 문양 — 최고 계급만
      g.lineStyle(Math.max(1.2, r * 0.10), mat, a * 0.8);
      g.strokeEllipse(sx, sy, r * 2.5, r * 2.5 * T);
    }
  };

  // ── 캐릭터 한 기 조립 ─────────────────────────────────────────
  //  grounded=true 면 전장(투영 적용), false 면 UI 패널용 평면
  //  walk : number | {phase, amp} | null   ← v2 추가 (생략하면 v1 과 동일)
  //  lv   : 1~5 계급 (생략하면 1 = 장식 없음, v2 와 픽셀 단위로 동일)
  UI.drawEggChar = function (g, art, sx, by, r, color, a, facing, grounded, reach, walk, lv) {
    var Iso = GAME.Iso, T = (grounded && Iso) ? Iso.TILT : 1;
    var D = UI.dir8(facing === undefined ? Math.PI / 2 : facing, T);
    var G = UI.gait(walk, art);

    var cx = sx, cy = by, lean = 0, rch = (reach === undefined ? 1 : reach);
    if (G) {
      cx += r * G.sway * D.px;
      cy += r * G.sway * D.py + r * G.bob;
      lean = r * (G.lean * D.px + G.pitch * D.fx);
      rch *= (1 + G.arm);
    }

    var backFirst = !D.back;                                     // 등을 보이면 등짐이 앞으로
    var gearBehind = D.back && !UI.GEAR_ALWAYS_FRONT[art.gear];  // 뒤쪽 무기는 몸통에 가린다

    // 잉크 윤곽은 **장비 3층에만** 두른다.
    // 몸통은 ivory 시안에서 이미 진영색 외곽선(r*0.17)이 실루엣을 맡고 있어
    // 잉크를 한 겹 더 두르면 진영색이 눌려 아군/적군 구분이 흐려진다.
    var rank = UI.rankOf({ lv: lv });     // 생략·이상값이면 1 (= 장식 없음)
    var back = function (gg) { UI.eggBack(gg, art.back, cx, cy, r, color, a, D); };
    var gear = function (gg) { UI.eggGear(gg, art.gear, cx + lean * 0.5, cy, r, color, a, D, rch); };
    var helm = function (gg) { UI.eggHelm(gg, art.helm, cx + lean, cy, r, color, a, D); };
    // 계급 장식도 장비와 같은 레이어 규칙을 탄다(잉크 윤곽 포함) — 라이트 테마에서
    // 청동/강철이 목초지에 묻히지 않게 하려면 반드시 inkLayer 를 거쳐야 한다.
    var rkBan = function (gg) { UI.eggRankBanner(gg, art, cx, cy, r, color, a, D, rank); };
    var rkBody = function (gg) { UI.eggRankBody(gg, art, cx, cy, r, color, a, D, rank); };
    var rkHead = function (gg) { UI.eggRankHead(gg, art, cx + lean, cy, r, color, a, D, rank); };

    if (backFirst) { UI.inkLayer(g, r, rkBan); UI.inkLayer(g, r, back); }
    if (gearBehind) UI.inkLayer(g, r, gear);
    UI.eggBody(g, art, cx, cy, r, color, a, lean);
    if (!backFirst) { UI.inkLayer(g, r, back); UI.inkLayer(g, r, rkBan); }
    UI.inkLayer(g, r, rkBody);
    // 맨눈은 투구보다 먼저(챙이 이마를 덮게), 투구 틈의 눈은 투구보다 나중에 그린다
    if (art.face !== 'slit') UI.eggFace(g, art, cx + lean * 0.62, cy, r, a, D);
    UI.inkLayer(g, r, helm);
    UI.inkLayer(g, r, rkHead);
    if (art.face === 'slit') UI.eggFace(g, art, cx + lean * 0.62, cy, r, a, D);
    if (!gearBehind) UI.inkLayer(g, r, gear);
  };

  // ── 전장용 ────────────────────────────────────────────────────
  //  시그니처: 기존 7개 + walk 하나. 반환값 {sx, sy, by} 도 그대로(체력바가 이걸 쓴다).
  UI.drawUnit = function (g, def, worldX, worldY, color, alpha, facing, walk) {
    var Iso = GAME.Iso;
    var sx = worldX, sy = Iso.toScreenY(worldY);
    var r = def.radius * (UI.UNIT_DRAW_SCALE || 1);   // 그리는 크기만 키운다(히트박스는 그대로)
    var a = alpha === undefined ? 1 : alpha;
    var art = UI.artOf(def);
    var f = facing === undefined ? Math.PI / 2 : facing;

    g.fillStyle(0x000000, 0.32 * a);
    g.fillEllipse(sx, sy, r * 2.1, r * 2.1 * Iso.TILT);

    if (art.ground) {
      UI.drawGroundArt(g, art, sx, sy, r, color, a);
      return { sx: sx, sy: sy, by: sy };
    }

    var lift = r * Iso.LIFT * (art.squat ? 0.55 : 1);
    var by = sy - lift;
    var D = UI.dir8(f, Iso.TILT);
    var G = UI.gait(walk, art);

    // 다리 두 개 — 계란이 지면에 붙어 있다는 걸 알려준다
    UI.eggLegs(g, art, sx, by, sy, r, color, a, D, G);

    // ivory 시안 — 발밑 진영 링으로 아군/적군을 한 번 더 못박는다
    if (UI.EGG_STYLE === 'ivory') {
      g.lineStyle(Math.max(1.5, r * 0.14), color, a * 0.85);
      g.strokeEllipse(sx, sy, r * 2.0, r * 2.0 * Iso.TILT);
    }

    var lv = UI.rankOf(def);
    UI.eggRankGround(g, sx, sy, r, color, a, lv);
    UI.drawEggChar(g, art, sx, by, r, color, a, f, true, 1, walk, lv);
    return { sx: sx, sy: sy, by: by };
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
      g.lineStyle(Math.max(1.2, r * 0.09), ink, 0.72);
      g.beginPath();
      g.moveTo(x0, y0);
      // 두 번 꺾어 번개 모양으로 — 직선이면 금이 아니라 흠집처럼 보인다
      var bx = x0 + Math.cos(a0) * len * 0.5 + Math.cos(a0 + 1.4) * r * 0.16;
      var byy = y0 + Math.sin(a0) * len * 0.5 + Math.sin(a0 + 1.4) * r * 0.16;
      g.lineTo(bx, byy);
      g.lineTo(x0 + Math.cos(a0) * len, y0 + Math.sin(a0) * len * 0.9);
      g.strokePath();
    }

    // 피격 번쩍 — 맞은 직후 짧게 흰빛이 덮인다(명중했다는 확인)
    if (hurt > 0) {
      var k = Math.min(1, hurt / 220);
      g.fillStyle(0xffffff, 0.55 * k);
      g.fillEllipse(sx, by, r * 1.7, r * 2.0);
    }
  };

  // ── UI 패널용 (투영 없음) ─────────────────────────────────────
  //  기존 시그니처 + walk: (g, def, sx, sy, color, alpha, scale, facing, walk)
  //  칩·미니맵에 들어가므로 무기 사거리를 줄여(reach 0.72) 박스를 벗어나지 않게 한다.
  UI.drawUnitFlat = function (g, def, sx, sy, color, alpha, scale, facing, walk) {
    var r = def.radius * (scale || 1);
    var a = alpha === undefined ? 1 : alpha;
    var art = UI.artOf(def);
    if (art.ground) { UI.drawGroundArt(g, art, sx, sy, r, color, a); return; }
    UI.drawEggChar(g, art, sx, sy, r, color, a, facing === undefined ? 0 : facing, false, 0.72,
                   walk, UI.rankOf(def));
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
      g.fillCircle(ex, ey, sr + 1.2);
    }
    g.fillStyle(M.shell, 0.95 * (1 - p * p));
    g.fillCircle(ex, ey, sr);
  }

  // ③ 노른자 — 통 튀어올랐다가 지면에 내려앉는다
  var hop = Math.sin(Math.min(1, p * 1.3) * Math.PI) * r * 1.6;
  var yr = r * (0.58 + p * 0.10);
  var yx = e.x, yy = gy - hop - r * 0.28;
  var yw = yr * 2 * (1 + p * 0.25), yh = yr * 2 * (1 - p * 0.30);
  if (ink !== null) {
    g.fillStyle(ink, 0.8);
    g.fillEllipse(yx, yy, yw + 3, yh + 3);
  }
  g.fillStyle(M.yolk, 0.98);
  g.fillEllipse(yx, yy, yw, yh);
  g.fillStyle(M.yolkLite, 0.9);
  g.fillEllipse(yx - yr * 0.30, yy - yr * 0.32, yr * 0.80, yr * 0.62);

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
