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

    // ── 세계 바닥 (시즌2 「다섯 세계」, 2026-09-03 S-A) ───────────────────────
    //  바닥색 자체는 BIOMES 의 hue/sat/dark 가 이미 세계마다 갈라 놓았다(잿더미=붉은 흙 ·
    //  균열=갈라진 회색 · 폭풍=어두운 하늘). 여기서는 **원경 띠(상단 10%) 안에서만**
    //  세계의 한 획을 더 얹는다 — 유닛이 서는 구간은 조용히(v1.6x 함정 1: 그 띠에도
    //  유닛이 서므로 전부 저알파·저대비다).
    var world = B && B.world;

    // ── 층대 (2026-09-09) ──────────────────────────────────────────────────
    //  같은 세계 안에서 1층과 30층이 **픽셀 단위로 같았다** — 배경이 세계로만 갈리고
    //  층을 안 봤다(2026-07-29 의 "1층과 30층이 같다"가 세계 단위로 되풀이된 것).
    //  `UI.worldDepth` 가 세계 안의 진행도 t(0..1)와 3단(초입·중반·심부)을 준다.
    //  ⚠ **도형을 늘리지 않는 축이다.** 능선 높이·원경 획 세기·세계 물건의 구성만
    //    바꾼다 — 예산(세계당 21~29 도형)은 이 축으로 한 톨도 안 는다.
    //  ⚠ 층이 없는 모드(대전·도전)는 t=0(초입)이다. 거기서 층대를 지어내면
    //    "탑을 오르는 감각"이 탑 밖으로 새어 나간다(biomeFor 의 중립 규율과 같다).
    var depFloor = Math.max(0, Math.round(Number(opts.floor) || 0));
    var dep = UI.worldDepth(depFloor > 0 ? depFloor : 1);
    //  원경의 한 획은 세계 심부로 갈수록 진해진다(0.82 → 1.24). 알파만 곱한다.
    var depA = 0.82 + dep.t * 0.42;

    if (world === 'ash') {
      //  잿더미 — 지평선 아래 잉걸 기운 한 줄(붉은 흙이 달아오른다)
      g.fillStyle(UI.mix(baseFill, 0xff6a2e, 0.35), 0.22 * depA);
      g.fillRect(R.x, R.y + farH * 0.55, R.w, farH * 0.45);
    } else if (world === 'rift') {
      //  균열 — 원경에 가로로 갈라진 실금 두 줄(회색 판이 쪼개진다)
      g.lineStyle(1.4, UI.mix(baseFill, 0x000000, 0.42), 0.32 * depA);
      g.lineBetween(R.x + R.w * 0.08, R.y + farH * 0.62, R.x + R.w * 0.41, R.y + farH * 0.74);
      g.lineBetween(R.x + R.w * 0.41, R.y + farH * 0.74, R.x + R.w * 0.53, R.y + farH * 0.58);
      g.lineBetween(R.x + R.w * 0.60, R.y + farH * 0.80, R.x + R.w * 0.93, R.y + farH * 0.66);
    } else if (world === 'storm') {
      //  폭풍 하늘 — 원경 띠를 밝히지 않고 **먹구름 결**로 갈아 낀다(유일하게 어두운 원경).
      //  단, 어두운 정도는 바닥보다 10% 만 — 그 띠에도 유닛이 선다.
      //  ⚠ 심부로 갈수록 구름이 두꺼워진다 — 알파가 아니라 **먹구름 섞는 비율**이다
      //    (알파를 키우면 유닛 자리가 어두워진다. 이 파일의 제1규율).
      g.fillStyle(UI.mix(baseFill, 0x1c1830, 0.24 + dep.t * 0.12), 1);
      g.fillRect(R.x, R.y, R.w, farH);
      g.fillStyle(UI.mix(baseFill, 0xffffff, 0.16), 0.55 * depA);
      g.fillEllipse(R.x + R.w * 0.22, R.y + farH * 0.5, R.w * 0.34, farH * 0.55, 12);
      g.fillEllipse(R.x + R.w * 0.66, R.y + farH * 0.42, R.w * 0.40, farH * 0.50, 12);
    } else if (world === 'mist') {
      //  안개늪 — 원경 띠를 한 번 더 밝힌다(안개 = 공기원근의 극단)
      g.fillStyle(UI.mix(baseFill, 0xffffff, 0.30), 0.55 * depA);
      g.fillRect(R.x, R.y, R.w, farH * (0.72 + dep.t * 0.20));
    } else if (world === 'meadow') {
      //  평원 — 여기만 **분기가 아예 없었다**(2026-09-08). 낮게 걸린 햇빛 한 겹.
      //  ⚠ 어둡게가 아니라 **더 밝게** 얹는다 — 이 띠는 통째로 유닛 자리다(위 함정 1).
      //  해는 층대가 오를수록 낮게 걸린다(띠가 얇아지고 색이 붉어진다).
      g.fillStyle(UI.mix(baseFill, dep.stage >= 2 ? 0xffc98a : 0xffe6a8, 0.24), 0.30 * depA);
      g.fillRect(R.x, R.y, R.w, farH * (0.66 - dep.t * 0.16));
    }

    //  먼 능선 — 톱니 실루엣. **좌표를 캐시한다**: 매 프레임 새로 뽑으면 언덕이 춤춘다
    //  (`drawBiomeProps` 가 같은 이유로 캐시한다).
    //  ⚠ 층대(`dep.stage`)를 키에 넣는다 — 안 넣으면 세계 안에서 능선이 안 바뀐다.
    //    심부로 갈수록 능선이 **높고 거칠어진다**(산이 다가온다). 점 개수는 그대로라
    //    도형 수는 한 톨도 안 는다.
    var ridgeKey = (B ? B.key || B.name || '' : '') + '|' + Math.round(R.w) + '|'
                 + Math.round(farH) + '|' + dep.stage;
    if (UI._ridgeKey !== ridgeKey) {
      var seed = 0, si;
      for (si = 0; si < ridgeKey.length; si++) seed = (seed * 31 + ridgeKey.charCodeAt(si)) >>> 0;
      var rnd = function () { seed ^= seed << 13; seed >>>= 0; seed ^= seed >> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
      //  y 는 위에서 잰 값이라 **작을수록 높은 능선**이다. 심부일수록 바닥값을 낮추고
      //  폭을 넓혀 톱니를 굵게 만든다. 상한 0.96 은 원경 띠 안에 가두는 값.
      var rLo = 0.62 - dep.stage * 0.11, rSp = 0.30 + dep.stage * 0.13;
      var pts = [], step = Math.max(26, R.w / 26), x;
      for (x = -step; x <= R.w + step; x += step) {
        pts.push({ x: x, y: farH * (rLo + rnd() * rSp) });
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

    // ── 세계 장면 (2026-09-08) ──────────────────────────────────────────────
    //  다섯 세계가 색만 다르고 **물건이 같아** 한 장소로 보였다. 세계마다 큰 물건을
    //  놓는다. 두 층으로 나누는데, 그 경계는 **유닛이 서는가**로 정한다:
    //    · 원경/중경(`drawWorldMid`)  — 유닛이 그 위에 선다 → 능선(mix 0.14 × α0.85)
    //      보다 **더 조용하게**(mix ≤0.16 × α ≤0.52). 크기로 읽히게 하고 대비로 읽히게
    //      하지 않는다. 이 파일의 제1규율(v1.6x 함정 1) 그대로다.
    //    · 근경(`drawWorldNear`) — 아래 앞마당 IIFE 안, **아무도 안 서는 띠**에서만
    //      진하게 그린다.
    //  ⚠ 좌표는 `_worldScene` 이 캐시한다 — 매 프레임 새로 뽑으면 물건이 춤춘다
    //    (능선 `ridgeKey` · `drawBiomeProps` 와 같은 규율).
    var quietS = UI.quietLine(R);

    // ── 층 이야기 (2026-09-09) ─────────────────────────────────────────────
    //  이 층의 **원형·조건·전장 규칙**을 배경이 말한다(아래 「층 이야기」 절).
    //  좌표는 층에서 유도해 캐시하고, 층이 아닌 모드(대전·배치·수성의 탑)에는
    //  아예 안 생긴다 — 없는 층의 이야기를 하면 화면이 거짓말을 한다.
    var story = UI.floorStory(opts, R, farH, quietS, dep);
    //  ① 원형 자국은 **가장 아래**다. 적이 서기 전의 땅이라 물건보다 밑에 깔린다.
    if (story.plan) UI.drawPlanTrace(g, story, baseFill);
    if (world && UI._worldScene) {
      UI.drawWorldMid(g, UI._worldScene(world, R, farH, quietS, story), baseFill);
    }
    //  ② 전장 규칙의 **정지 흔적** — 늪·용암은 규칙이 준 좌표 그대로 그린다.
    //     그래야 살아 움직이는 `FXS.drawField` 와 같은 자리에 놓인다.
    if (story.field) UI.drawFieldGround(g, story, baseFill);

    // 지형지물 — **거리 그림자(아래 그라디언트)보다 먼저** 그린다.
    // 그래야 안쪽 소품이 같이 어두워져 원근을 거스르지 않는다.
    if (B) UI.drawBiomeProps(g, B);

    // ── 근경 띠 ────────────────────────────────────────────────────────────
    //  하단 안쪽 6%. 명도차 10% 뿐이다 — 더 벌리면 바닥이 두 동강 나 보인다.
    var nearH = R.h * 0.06;
    g.fillStyle(UI.mix(baseFill, 0xffffff, 0.10), 1);
    g.fillRect(R.x, R.bottom - nearH, R.w, nearH);

    // ── 빈 앞마당 (2026-09-08 태현님: "보여주기 창피해") ─────────────────────
    //  실측(폰, 24층): 아레나 808×378 · 적 배치 구역 높이 113 = **아레나의 30%** ·
    //  적은 y 10~38% · 영웅 48%. 즉 **아래 절반에는 아무도 안 선다.**
    //  화면의 절반 이상이 평평한 단색이라 "미완성"으로 읽혔다 — 그게 가장 큰
    //  싸구려 신호였다.
    //
    //  ⚠⚠ 이 파일의 제1규율("유닛이 서는 구간은 가장 조용해야 한다")은 **그대로
    //    지킨다.** 그 규율은 예고 원·투사체가 안 보이게 되는 것을 막으려는 것이고,
    //    유닛이 서지 않는 구간에는 해당되지 않는다. 그래서 경계를 **눈대중이 아니라
    //    `CONFIG` 에서 역산**한다 — 배치 구역이 바뀌면 이 선도 따라 움직인다.
    (function () {
      //  조용해야 하는 선은 **위에서 한 번만 잰다**(`UI.quietLine`) — 세계 장면이
      //  같은 값을 본다. 두 곳에서 따로 계산하면 배치 구역이 바뀔 때 한쪽만 따라간다
      //  (이 폴더의 `_hasDemo` 사고와 같은 계열).
      if (quietS < 0 || quietS >= R.bottom - 12) return;    // 꾸밀 자리가 없으면 그만둔다
      var band = R.bottom - quietS;

      //  ① 가까울수록 진해진다(공기원근의 반대쪽) — 위 원경이 밝아지는 것과 짝이다.
      var steps = 14;
      for (var i = 0; i < steps; i++) {
        var t = i / steps;
        g.fillStyle(0x000000, 0.05 * t * t);
        g.fillRect(R.x, quietS + band * t, R.w, band / steps + 1);
      }
      //  ② 풀·돌 — **여기서는 진하게 깔아도 된다**(아무도 안 선다).
      //    자리는 고정 난수다: 판마다 바닥이 달라지면 어지럽다(위 얼룩과 같은 규율).
      var dark = UI.mix(baseFill, 0x000000, 0.30);
      var lite = UI.mix(baseFill, 0xffffff, 0.16);
      //  ⚠ 세계 장면이 이 띠에 큰 물건을 놓는 판에서는 얼룩을 **줄인다**. 큰 물건
      //    옆에 잔 얼룩까지 그대로 두면 (a) 바닥이 지저분해지고 (b) 호출 수가 순증한다.
      //    90 → 66 이면 호출이 ~69회 줄어 이번에 얹은 도형(세계당 ≤30)보다 크다.
      //  ⚠ 2026-09-09 — 「층 이야기」(원형·조건·전장)가 얹히는 판에서는 **더 줄인다.**
      //    얼룩 하나가 4~5 호출이라 이야기 한 개(≤4 도형 ≈ 7 호출)당 다섯만 빼도
      //    호출이 순감한다. 예산을 늘리지 않고 물건을 늘리는 유일한 길이다.
      //    실측(1~260층 평균, 대조군은 이야기를 끈 같은 코드):
      //      이야기 끔 653 호출 / 408 도형 → **이야기 켬 598 호출 / 377 도형**
      //    큰 물건이 들어온 만큼 잔 얼룩을 빼는 것이라 바닥이 더 지저분해지지도 않는다.
      var nSpeck = world ? Math.max(50, 66 - 5 * story.n) : 90;
      for (var k2 = 0; k2 < nSpeck; k2++) {
        var px = R.x + ((k2 * 137 + 31) % Math.max(1, Math.round(R.w - 16))) + 8;
        var pt = ((k2 * 89) % 100) / 100;
        var py = quietS + band * (0.06 + pt * 0.90);
        var near = (py - quietS) / band;                    // 아래로 갈수록 크고 진하게
        var sc = 0.6 + near * 1.5;
        if (k2 % 7 === 0) {                                 // 돌
          g.fillStyle(dark, 0.20 + near * 0.16);
          g.fillEllipse(px, py, 7 * sc, 3.4 * sc, 6);
          g.fillStyle(lite, 0.18 + near * 0.14);
          g.fillEllipse(px - 1.2 * sc, py - 1.2 * sc, 4.2 * sc, 1.9 * sc, 6);
        } else {                                            // 풀포기
          g.fillStyle(dark, 0.13 + near * 0.15);
          g.fillEllipse(px, py, 6.5 * sc, 2.4 * sc, 6);
          g.fillEllipse(px + 3.4 * sc, py - 1.1 * sc, 4.2 * sc, 1.7 * sc, 6);
          g.fillStyle(lite, 0.12 + near * 0.12);
          g.fillEllipse(px - 2.6 * sc, py - 0.8 * sc, 3.6 * sc, 1.5 * sc, 6);
        }
      }
      //  ③ 세계의 근경 물건 — **여기가 이 파일에서 유일하게 진하게 그려도 되는 자리**다.
      //     얼룩(②) 위에 얹어야 물건이 땅에 놓인 것으로 읽힌다.
      if (world && UI.drawWorldNear) {
        UI.drawWorldNear(g, UI._worldScene(world, R, farH, quietS), baseFill);
      }
      //  ④ 아래 모서리 비네트 — 화면 끝이 '잘린 종이'로 보이지 않게 한다.
      for (var v = 0; v < 8; v++) {
        g.fillStyle(0x000000, 0.030);
        g.fillRect(R.x, R.bottom - (8 - v) * (band * 0.045), R.w, band * 0.045 + 1);
      }
    })();

    //  ③ 층 조건의 표식 — 앞마당 위에 얹는다(근경에 놓이는 것들이 얼룩에 안 묻히게).
    //     조건은 층마다 바뀌는 **유일한 축**이라 이야기 셋 중 가장 눈에 띄어도 된다.
    if (story.rule) UI.drawRuleMark(g, story, baseFill);

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

    // ── 격자 제거 (2026-08-20 태현님: "전장 배경에 이상한 격자 보이는데 바꿔줘") ──
    //  80px 그리드는 원근 보조선이었는데 실기기에서 '모눈종이'로 읽혔다.
    //  원근은 위의 밴드가 이미 맡고 있으므로 선 대신 **성긴 풀 얼룩**만 남긴다
    //  (자리 고정 — 위치를 난수로 뽑으면 판마다 바닥이 달라져 어지럽다).
    g.fillStyle(C.arenaLine, B ? 0.10 : 0.16);
    for (var tk = 0; tk < 40; tk++) {
      var tx = A.x + ((tk * 197) % (A.right - A.x - 20)) + 10;
      var tyW = A.y + ((tk * 311) % (A.bottom - A.y - 20)) + 10;
      var tsy = Iso.toScreenY(tyW);
      g.fillEllipse(tx, tsy, 7, 2.6, 6);
      g.fillEllipse(tx + 4, tsy - 1.4, 4.4, 1.8, 6);
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
//  층 배지가 이미 쓰는 `UI.tierForFloor` 의 구간을 그대로 쓴다. 즉 화면의 등급 배지와
//  바닥이 **같은 순간에** 바뀐다. 새 사다리를 만들면 "이 층은 정예인데 바닥은 아직
//  늪"처럼 두 사다리가 어긋난다.
//  시즌2 「다섯 세계」(2026-09-03)부터 그 구간 = **세계 경계** `UI.WORLD_BOUNDS` [31,61,101,151]:
//    0: 1~30   초원        3: 101~150 균열
//    1: 31~60  안개늪      4: 151+    폭풍 하늘
//    2: 61~100 잿더미
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
  //  ── 시즌2 「다섯 세계」 (2026-09-03 S-A) — 밴드 = 세계 ────────────────────────
  //  경계는 `UI.tierForFloor`/`UI.WORLD_BOUNDS`([31,61,101,151]) 한 곳이다. 여기 순서는
  //  그 인덱스(0..4)와 같아야 한다. 옛 6밴드(풀숲·돌담·늪·잿바닥·모래벌)는 폐기 —
  //  40층 이후가 평평했고(플랜 §0), 세계는 층대가 아니라 **규칙**이 바뀌는 단위다.
  //  kind: 0 풀 다발 · 5 늪 갈대 · 6 잿더미 돌 · 7 균열 바위 · 8 폭풍 깃발 (1~4 는 옛 소품 — 남겨 둔다)
  //  ⚠ 유닛 자리는 조용히 — 소품 알파·개수 상한은 옛 밴드와 같은 급이다(v1.6x 함정 1).
  var BIOMES = [
    { key: 'meadow', hue: 104, sat: 1.00, dark: 1.06, light: 1.00, kind: 0, n: 12 },  // 1~30   초원
    { key: 'mist',   hue: 178, sat: 0.80, dark: 0.92, light: 0.88, kind: 5, n: 12 },  // 31~60  안개늪(청록 이끼물)
    { key: 'ash',    hue:  14, sat: 0.62, dark: 0.90, light: 0.86, kind: 6, n: 13 },  // 61~100 잿더미(붉은 흙)
    { key: 'rift',   hue: 222, sat: 0.22, dark: 0.84, light: 0.82, kind: 7, n: 13 },  // 101~150 균열(갈라진 회색)
    { key: 'storm',  hue: 246, sat: 0.55, dark: 0.78, light: 0.80, kind: 8, n: 11 }   // 151+   폭풍 하늘(어두운 하늘)
  ];
  UI.BIOMES = BIOMES;

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
      world: S.key,              // 'meadow'|'mist'|'ash'|'rift'|'storm' — drawArena 의 세계 바닥 분기
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

      } else if (B.kind === 4) {
        // 모래 결 + 껍질 조각
        g.lineStyle(1.6, B.lite, 0.34);
        g.lineBetween(x - s * 2.7, y, x - s * 0.9, y - s * 0.6);
        g.lineBetween(x - s * 0.9, y - s * 0.6, x + s * 0.9, y - s * 0.6);
        g.lineBetween(x + s * 0.9, y - s * 0.6, x + s * 2.7, y);
        if (p.v > 0.45) {
          g.fillStyle(B.dark, 0.30);
          g.fillEllipse(x + s * 1.1, y + s * 1.0, s * 1.2, s * 0.6, 7);
        }

      // ── 시즌2 다섯 세계 소품 (2026-09-03 S-A) — 알파는 옛 소품과 같은 급(0.28~0.44) ──
      } else if (B.kind === 5) {
        // 늪 갈대 — 물웅덩이 가장자리에 세 가닥, 이삭 하나
        g.fillStyle(B.dark, 0.36);
        g.fillEllipse(x, y, s * 3.0, s * 1.3, 10);
        g.lineStyle(1.5, B.lite, 0.40);
        g.lineBetween(x + s * 1.2, y + s * 0.2, x + s * 1.4, y - s * 2.4);
        g.lineBetween(x + s * 1.7, y + s * 0.3, x + s * 2.1, y - s * 1.9);
        if (p.v > 0.4) {
          g.lineBetween(x + s * 0.8, y + s * 0.1, x + s * 0.7, y - s * 2.0);
          g.fillStyle(B.dark, 0.44);
          g.fillEllipse(x + s * 1.42, y - s * 2.4, s * 0.5, s * 1.0, 6);   // 이삭
        }

      } else if (B.kind === 6) {
        // 잿더미 돌 — 그을린 돌 두 개 + 잉걸 실금 하나(아주 옅게)
        g.fillStyle(B.dark, 0.40);
        g.fillEllipse(x, y, s * 2.4, s * 1.3, 8);
        g.fillStyle(B.lite, 0.26);
        g.fillEllipse(x - s * 0.5, y - s * 0.35, s * 1.2, s * 0.6, 8);
        g.fillStyle(B.dark, 0.34);
        g.fillEllipse(x + s * 1.9, y + s * 0.5, s * 1.1, s * 0.6, 7);
        if (p.v > 0.6) {
          g.lineStyle(1.2, 0xff8c2e, 0.22);
          g.lineBetween(x - s * 0.6, y + s * 0.2, x + s * 0.4, y + s * 0.45);
        }

      } else if (B.kind === 7) {
        // 균열 바위 — 각진 돌판 + 사이로 갈라진 실금
        g.fillStyle(B.dark, 0.40);
        g.fillTriangle(x - s * 1.6, y + s * 0.5, x + s * 0.2, y - s * 1.1, x + s * 1.8, y + s * 0.4);
        g.fillStyle(B.lite, 0.24);
        g.fillTriangle(x - s * 0.9, y + s * 0.2, x + s * 0.2, y - s * 0.9, x + s * 0.9, y + s * 0.1);
        g.lineStyle(1.6, B.crack, 0.30);
        g.lineBetween(x - s * 2.6, y + s * 0.9, x - s * 1.0, y + s * 0.6);
        if (p.v > 0.5) g.lineBetween(x + s * 1.8, y + s * 0.4, x + s * 3.0, y + s * 1.0);

      } else {
        // 폭풍 깃발 — 꺾인 장대에 바람에 찢긴 천 조각. 장대는 어둡고 천은 밝게
        g.lineStyle(1.8, B.dark, 0.46);
        g.lineBetween(x, y, x + s * 0.3, y - s * 3.0);
        g.fillStyle(B.lite, 0.34);
        g.fillTriangle(x + s * 0.3, y - s * 3.0, x + s * 2.4, y - s * 2.5, x + s * 0.25, y - s * 2.0);
        if (p.v > 0.45) {
          g.fillStyle(B.dark, 0.32);
          g.fillEllipse(x, y + s * 0.2, s * 1.4, s * 0.6, 7);           // 발밑 돌무더기
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

// ═══════════════════════════════════════════════════════════════════════════
//  세계 장면 — 다섯 세계를 **한눈에 다른 장소**로 (2026-09-08)
//
//  왜 필요했나: 시즌2 「다섯 세계」는 바닥 색(BIOMES 의 hue/sat)과 소품 한 종류,
//  그리고 원경 띠의 획 하나로만 갈렸다. 평원은 그 획조차 없었다. 전장은 화면에서
//  가장 큰 면적인데 다섯이 거의 같은 장소로 보였다.
//
//  ── 이 파일의 제1규율을 어떻게 지키는가 ────────────────────────────────────
//  「유닛이 서는 구간은 가장 조용해야 한다」(v1.6x 함정 1). 실측으로 다시 확인했다
//  (`CONFIG` 역산, 폰 가로 · 아레나 808×272px):
//     전략가 배치 구역   아레나 맨 위 0% ~ 30%
//     영웅 스폰          아래 30% 구역 안(월드 y 333)
//     아무도 안 서는 띠  화면 y 294~312 = **18px 뿐**
//  즉 "아래는 마음대로 해도 된다"는 실제로는 18px 짜리 띠다. 그래서 두 층으로 나눈다:
//    · `drawWorldMid`  — 원경/중경. **유닛이 그 위에 선다.** 그래서 대비 예산을
//      능선(mix 0.14 × α0.85 = 명도차 약 12%)보다 **낮게** 잡았다: mix ≤0.16 × α ≤0.52
//      = 명도차 약 8%. 세계는 **크기와 실루엣**으로 읽히게 하고 대비로 읽히게 하지
//      않는다. 큰 도형은 작은 예고 원·투사체와 공간 주파수가 달라 서로 안 가린다.
//    · `drawWorldNear` — 그 18px 띠 안에서만 진하게(mix 0.42 × α0.62). 이미
//      「여기서는 진하게 깔아도 된다」고 적혀 있는 자리다.
//
//  ── 규율 ────────────────────────────────────────────────────────────────
//  · 좌표는 **캐시한다**(`_wsKey`). 매 프레임 새로 뽑으면 물건이 춤춘다 — 능선
//    `ridgeKey` · `drawBiomeProps` 가 같은 이유로 캐시한다.
//  · 난수는 `Math.random` 이 아니라 **키에서 유도한 xorshift** 다(같은 화면이면
//    언제나 같은 그림 — 재도전 때 배경이 바뀌면 산만하다).
//  · 색은 전부 `baseFill` 과 `UI.MAT` 토큰에서 유도한다. 하드코딩 색을 넣으면
//    테마 4종 × 세계 5종이 거기서 깨진다.
//  · **세계당 도형 30개 이내**. 큰 도형 위주로 가고 잔 도형을 늘리지 않는다.
//    대신 앞마당 얼룩을 90 → 66 으로 줄여 호출 수의 순증을 막았다.
//  · 판정 좌표·히트박스는 한 톨도 안 건드린다 — 전부 화면 좌표로만 그린다.
// ═══════════════════════════════════════════════════════════════════════════
(function (UI) {

  //  조용해야 하는 선(화면 y). 배치 구역에서 역산하므로 구역이 바뀌면 따라 움직인다.
  //  ⚠ `drawArena` 의 앞마당과 세계 장면이 **같은 함수**를 본다. 두 벌로 두면
  //    한쪽만 고쳐져 조용히 어긋난다(이 폴더의 `_hasDemo` 사고와 같은 계열).
  UI.quietLine = function (R) {
    var zs = GAME.CONFIG.ZONE_STRATEGIST, zc = GAME.CONFIG.ZONE_CONTROLLER;
    if (!zs || !zc || !GAME.Iso) return -1;
    var heroY = zc.y + zc.h * 0.55;                     // 영웅 스폰까지 포함한다
    return GAME.Iso.toScreenY(Math.max(zs.y + zs.h, heroY) + 26);
  };

  //  n 개를 가로로 고르게 흩되 가장자리(목책)와 정중앙(영웅이 올라오는 길)은 피한다.
  function spreadX(R, n, i, rnd) {
    var t = (i + 0.5) / n + (rnd() - 0.5) * (0.8 / n);
    if (t > 0.44 && t < 0.56) t += (t < 0.5 ? -0.09 : 0.09);   // 한가운데를 비운다
    return R.x + R.w * Math.max(0.06, Math.min(0.94, t));
  }

  //  ── 물건마다 s 의 몇 배까지 뻗는가 (왼/오른/위/아래) ──────────────────────
  //  ⚠⚠ 이 표가 없으면 **전장 밖으로 새어 나간다.** 이 폴더가 이미 겪은 사고다
  //    (보스 균열이 화면 전체를 가로질러 HUD·조작 패드 위까지 그어졌다 — `biomeFor`
  //    의 `cracks` 주석). 원경 물건은 위로 s 의 2.5배까지 뻗는데 원경 띠는 아레나의
  //    10% 뿐이라, 안 가두면 아레나 **위**(= HUD 띠)에 그려진다. 실측으로 확인했다.
  //  ⚠ 손으로 적는 표라 그림을 고치면 여기도 같이 고쳐야 한다. `_wsBoundsCheck` 가
  //    표와 실제 그림이 어긋나면 알려 준다(감사용, 게임은 안 부른다).
  var EXT = {
    tree:      { l: 1.05, r: 1.05, up: 1.75, dn: 0.10 },
    deadtree:  { l: 0.80, r: 1.00, up: 2.05, dn: 0.10 },
    fogbank:   { l: 3.55, r: 5.45, up: 0.85, dn: 1.20 },
    volcano:   { l: 3.45, r: 3.05, up: 2.30, dn: 0.10 },
    smoke:     { l: 1.35, r: 2.05, up: 2.55, dn: 0.10 },
    monolith:  { l: 1.35, r: 1.55, up: 2.35, dn: 0.10 },
    rain:      { l: 0.75, r: 1.55, up: 2.45, dn: 0.25 },
    thicket:   { l: 1.65, r: 1.65, up: 2.35, dn: 0.80 },
    stake:     { l: 0.35, r: 1.60, up: 2.65, dn: 0.10 },
    pool:      { l: 2.35, r: 2.35, up: 1.15, dn: 1.05 },
    stump:     { l: 0.60, r: 1.50, up: 2.30, dn: 0.10 },
    lavacrack: { l: 2.75, r: 2.95, up: 0.55, dn: 0.65 },
    ashmound:  { l: 1.50, r: 2.30, up: 0.70, dn: 0.70 },
    fissure:   { l: 3.25, r: 3.45, up: 1.00, dn: 0.40 },
    shard:     { l: 1.20, r: 1.30, up: 1.55, dn: 1.80 },
    sheen:     { l: 2.20, r: 2.20, up: 0.50, dn: 0.55 },
    bentgrass: { l: 0.10, r: 2.95, up: 1.05, dn: 0.15 },
    tuft:      { l: 1.55, r: 1.55, up: 0.70, dn: 0.65 },
    shore:     { l: 2.65, r: 2.65, up: 0.70, dn: 0.80 },
    embers:    { l: 1.85, r: 1.85, up: 0.75, dn: 0.70 },
    rubble:    { l: 2.15, r: 1.95, up: 1.05, dn: 0.55 },
    puddle:    { l: 2.35, r: 2.35, up: 0.60, dn: 0.75 }
  };

  //  ⚠⚠ **좌우로 뒤집히는 물건은 이 표에 적힌 것뿐이다.** `d`(바람 방향)를 아무
  //    물건에나 달면 `fit` 은 l/r 을 뒤집는데 `item` 은 안 뒤집어 **그 물건만 전장
  //    밖으로 샌다**(세로 화면에서 안개 둑이 68px 새는 것을 `_wsBoundsCheck` 가 잡았다).
  //    뒤집는 그림을 새로 넣으면 여기에도 반드시 한 줄 넣을 것.
  var MIRROR = { rain: 1, bentgrass: 1 };

  //  전장 안으로 **가둔다**. 크기를 먼저 줄이고(위/아래), 그 다음 가로로 민다.
  //  ⚠ 순서가 중요하다 — x 를 먼저 밀면 줄어든 s 로 다시 밀 자리가 생겨 한쪽에 몰린다.
  function fit(R, it, topLimit, botLimit) {
    var e = EXT[it.k] || { l: 1, r: 1, up: 1, dn: 1 };
    //  ⚠ 좌우로 뒤집힌 물건(바람 방향을 따르는 빗줄기·눕는 풀)은 **표의 l/r 도 뒤집힌다.**
    //    안 뒤집으면 뒤집힌 쪽만 전장 밖으로 샌다(`_wsBoundsCheck` 가 잡는 계열).
    if (it.d < 0) e = { l: e.r, r: e.l, up: e.up, dn: e.dn };
    var pad = 10;                                        // 세로 목책 폭(최대 9)보다 크게
    if (e.up > 0) it.s = Math.min(it.s, Math.max(2, (it.y - topLimit) / e.up));
    //  ⚠ 가로도 **크기부터** 줄인다. 세로만 줄이고 x 로 밀면 아레나보다 넓은 물건이
    //    영원히 안 들어간다 — 세로 화면(폭 402)에서 안개 둑이 실제로 58px 새어 나갔다
    //    (`_wsBoundsCheck` 가 잡았다. 그래서 그 검사가 표가 아니라 그림을 본다).
    var room = Math.max(1, R.w - pad * 2);
    if (e.l + e.r > 0) it.s = Math.min(it.s, room / (e.l + e.r));
    if (e.dn > 0) it.y = Math.min(it.y, botLimit - e.dn * it.s);
    var lo = R.x + pad + e.l * it.s, hi = R.right - pad - e.r * it.s;
    it.x = (lo > hi) ? (R.x + R.w / 2) : Math.max(lo, Math.min(hi, it.x));
    return it;
  }

  //  ── 좌표 만들기 (한 번만) ────────────────────────────────────────────────
  //  story: 「층 이야기」(아래 절). `stage`(0 초입 · 1 중반 · 2 심부)와 `wind`(-1/+1)만
  //         읽는다. 없으면 초입·오른쪽 바람으로 본다 — 옛 호출(4인자)이 그대로 산다.
  //  ⚠⚠ **stage 를 키에 넣는다.** 안 넣으면 같은 세계 안에서 장면이 영영 안 바뀐다
  //     — 이 캐시가 바로 "1층과 30층이 같다"를 만드는 자리다.
  UI._worldScene = function (world, R, farH, quietS, story) {
    //  조용선을 못 재는 화면(배치 구역이 없는 씬)이 있어도 좌표는 만들어야 한다 —
    //  안 그러면 근경 물건이 아레나 밖 좌표로 생긴다. 그때는 근경 띠(6%)를 쓴다.
    if (!(quietS > 0)) quietS = R.bottom - Math.max(8, R.h * 0.06);
    var st = (story && story.stage) | 0;
    var wind = (story && story.wind < 0) ? -1 : 1;
    var key = world + '|' + Math.round(R.x) + ',' + Math.round(R.y) + ','
            + Math.round(R.w) + ',' + Math.round(R.h) + '|' + Math.round(quietS)
            + '|' + st + '|' + wind;
    if (UI._wsKey === key && UI._ws) return UI._ws;

    var seed = 2166136261, i;
    for (i = 0; i < key.length; i++) seed = ((seed ^ key.charCodeAt(i)) * 16777619) >>> 0;
    if (!seed) seed = 1;
    var rnd = function () {
      seed ^= seed << 13; seed >>>= 0;
      seed ^= seed >> 17;
      seed ^= seed << 5;  seed >>>= 0;
      return seed / 4294967296;
    };

    var S = { far: [], mid: [], near: [], stage: st, wind: wind };
    var band = Math.max(0, R.bottom - quietS);

    //  원경 물건은 능선 바로 앞(원경 띠 아래끝)에 발을 붙인다.
    //  ⚠ 위로 뻗는 총량이 원경 띠(아레나의 10%)보다 크므로 `fit` 이 반드시 가둔다.
    function far(kind, n, sMul) {
      for (var k = 0; k < n; k++) {
        S.far.push(fit(R, { k: kind, d: MIRROR[kind] ? wind : 1, x: spreadX(R, n, k, rnd),
                            y: R.y + farH * (1.14 + rnd() * 0.24),
                            s: farH * sMul * (0.82 + rnd() * 0.42) },
                       R.y + 2, R.bottom - 2));
      }
    }
    //  중경은 아레나 세로 38~66% — 배치 구역(0~30%)과 영웅 스폰(73%+) 사이다.
    //  아래로 갈수록 크게(원근). 여기도 유닛이 지나가므로 **대비는 위 규율대로 낮게**.
    function mid(kind, n, sMul) {
      for (var k = 0; k < n; k++) {
        var ty = 0.38 + rnd() * 0.28;
        S.mid.push(fit(R, { k: kind, d: MIRROR[kind] ? wind : 1, x: spreadX(R, n, k, rnd),
                            y: R.y + R.h * ty,
                            s: R.h * 0.052 * sMul * (0.80 + ty * 0.55) },
                       R.y + farH * 0.9, R.bottom - 2));
      }
    }
    //  근경은 조용선 아래 띠 안에만 — 폰에서 18px 뿐이라 **납작하고 넓은 것**만 둔다.
    function near(kind, n, sMul) {
      for (var k = 0; k < n; k++) {
        S.near.push(fit(R, { k: kind, x: spreadX(R, n, k, rnd),
                             y: quietS + band * (0.30 + rnd() * 0.46),
                             s: Math.max(3, band * 0.52) * sMul * (0.85 + rnd() * 0.35) },
                        quietS + 1, R.bottom - 2));
      }
    }

    //  ── 층대별 구성 (2026-09-09) ──────────────────────────────────────────
    //  같은 세계인데 초입과 심부가 같은 장소일 이유가 없다. **물건 총수는 8~11 로
    //  거의 고정**하고 무엇이 몇 개인지·얼마나 큰지만 옮긴다 — 그래야 도형 예산이
    //  안 는다(세계당 21~29). 한 세계를 오르는 동안 이야기가 하나씩 진행된다:
    //    평원   나무가 줄고 **부족 말뚝이 는다**(사람이 사는 들판 → 적진 언저리)
    //    안개늪 안개 둑이 늘고 물이 깊어진다
    //    잿더미 화산이 가까워지고(크기) 연기·용암 자국이 는다
    //    균열   하늘에 뜬 돌이 늘고 지면이 더 갈라진다
    //    폭풍   비가 굵어지고 젖은 자국이 넓어진다
    var A2 = [0, 1, 2][st] || 0;       // 0 초입 · 1 중반 · 2 심부
    if (world === 'meadow') {          // 평원 — 나무 능선 · 풀숲 · 부족 말뚝
      far('tree', 3 - (A2 === 2 ? 1 : 0), 0.52 + A2 * 0.04);
      mid('thicket', 2, 1.05);
      mid('stake', 1 + A2, 1.05 + A2 * 0.10);
      near('tuft', 2, 1.0);
    } else if (world === 'mist') {     // 안개늪 — 죽은 나무 · 수면 웅덩이 · 밑동
      far('deadtree', 2 + (A2 > 0 ? 1 : 0), 0.62);
      far('fogbank', A2 === 2 ? 2 : 1, 0.86 + A2 * 0.08);
      mid('pool', 2 + (A2 === 2 ? 1 : 0), 1.10 + A2 * 0.06);
      mid('stump', A2 === 2 ? 2 : 3, 0.95);
      near('shore', 1, 1.15);
    } else if (world === 'ash') {      // 잿더미 — 화산 능선 · 식은 용암 균열 · 재 무더기
      far('volcano', 1, 0.62 + A2 * 0.15);            // 심부로 갈수록 봉우리가 다가온다
      far('smoke', 1 + (A2 === 2 ? 1 : 0), 0.6);
      mid('lavacrack', 1 + A2, 1.15 + A2 * 0.06);
      mid('ashmound', 3 - (A2 === 2 ? 1 : 0), 0.95);
      near('embers', 1, 1.05);
    } else if (world === 'rift') {     // 균열 — 떠 있는 돌 · 갈라진 지면 · 돌조각
      far('monolith', 1 + A2, 0.66 + A2 * 0.04);
      mid('fissure', 1 + A2, 1.20 + A2 * 0.05);
      mid('shard', 3, 0.9);
      near('rubble', 1, 1.0);
    } else {                           // 폭풍 — 빗줄기 · 젖은 반사 · 바람에 눕는 풀
      far('rain', 2 + A2, 0.66 + A2 * 0.05);
      mid('sheen', 2 + (A2 === 2 ? 1 : 0), 1.05 + A2 * 0.06);
      mid('bentgrass', 3, 0.95);
      near('puddle', 1, 1.2);
    }

    UI._wsKey = key; UI._ws = S;
    return S;
  };

  //  ── 그리기 ──────────────────────────────────────────────────────────────
  //  화풍: 만화풍 2단 음영 + 어두운 윤곽. 사실적 텍스처는 안 쓴다(도형 하나가
  //  '물건 하나'로 읽혀야 작게 줄어도 살아남는다).
  function item(g, it, P) {
    var x = it.x, y = it.y, s = it.s, k = it.k;
    //  바람 방향(+1 오른쪽 / -1 왼쪽). 폭풍 세계의 **전장 규칙이 정한 값**을 그대로 쓴다
    //  — 배경의 비와 눕는 풀이 실제로 미는 방향과 반대면 화면이 거짓말을 한다.
    //  ⚠ 좌우 대칭인 물건에는 아무 영향이 없다(부호를 안 곱한다).
    var d = (it.d < 0) ? -1 : 1;

    if (k === 'tree') {                       // 평원 원경 — 둥근 나무
      g.fillStyle(P.ink, P.a * 0.66);
      g.fillRect(x - s * 0.10, y - s * 0.55, s * 0.20, s * 0.60);
      g.fillEllipse(x, y - s * 1.05, s * 2.0, s * 1.30, 10);
      g.fillStyle(P.lit, P.a * 0.50);
      g.fillEllipse(x - s * 0.40, y - s * 1.35, s * 1.05, s * 0.62, 8);

    } else if (k === 'deadtree') {            // 안개늪 원경 — 잎 없는 죽은 나무
      g.lineStyle(Math.max(1.4, s * 0.16), P.ink, P.a * 0.80);
      g.lineBetween(x, y, x + s * 0.20, y - s * 2.0);
      g.lineBetween(x + s * 0.11, y - s * 1.05, x - s * 0.75, y - s * 1.60);
      g.lineBetween(x + s * 0.15, y - s * 1.50, x + s * 0.95, y - s * 1.90);

    } else if (k === 'fogbank') {             // 안개늪 — 낮게 깔린 안개 둑(밝게)
      g.fillStyle(P.lit, P.a * 0.58);
      g.fillEllipse(x, y, s * 7.0, s * 1.5, 12);
      g.fillEllipse(x + s * 3.2, y + s * 0.55, s * 4.4, s * 1.1, 10);

    } else if (k === 'volcano') {             // 잿더미 원경 — 연기 뿜는 봉우리
      g.fillStyle(P.ink, P.a * 0.62);
      g.fillTriangle(x - s * 3.4, y, x + s * 0.1, y - s * 2.2, x + s * 3.0, y);
      g.fillStyle(P.ember, 0.20);
      g.fillEllipse(x + s * 0.1, y - s * 2.05, s * 1.15, s * 0.46, 8);

    } else if (k === 'smoke') {
      g.fillStyle(P.lit, P.a * 0.48);
      g.fillEllipse(x, y - s * 1.2, s * 2.6, s * 1.1, 10);
      g.fillEllipse(x + s * 1.1, y - s * 2.1, s * 1.8, s * 0.85, 8);

    } else if (k === 'monolith') {            // 균열 원경 — 하늘에 뜬 큰 돌
      g.fillStyle(P.ink, P.a * 0.56);
      g.fillTriangle(x - s * 1.3, y - s * 0.6, x + s * 0.2, y - s * 2.3, x + s * 1.5, y - s * 0.8);
      g.fillStyle(P.lit, P.a * 0.42);
      g.fillTriangle(x - s * 0.4, y - s * 0.9, x + s * 0.2, y - s * 1.9, x + s * 0.8, y - s * 1.0);

    } else if (k === 'rain') {                // 폭풍 원경 — 비스듬한 빗줄기(바람 방향)
      g.lineStyle(Math.max(1, s * 0.10), P.lit, P.a * 0.44);
      g.lineBetween(x, y - s * 2.4, x - d * s * 0.7, y);
      g.lineBetween(x + d * s * 1.5, y - s * 2.0, x + d * s * 0.9, y + s * 0.2);

    } else if (k === 'thicket') {             // 평원 중경 — 풀숲
      g.fillStyle(P.ink, P.a * 0.66);
      g.fillEllipse(x, y, s * 3.2, s * 1.5, 10);
      g.fillStyle(P.mid, P.a * 0.80);
      g.fillEllipse(x - s * 0.30, y - s * 0.45, s * 2.4, s * 1.15, 10);
      g.lineStyle(Math.max(1.2, s * 0.14), P.lit, P.a * 0.66);
      g.lineBetween(x - s * 0.9, y - s * 0.4, x - s * 1.3, y - s * 2.1);
      g.lineBetween(x + s * 0.6, y - s * 0.4, x + s * 1.1, y - s * 2.3);

    } else if (k === 'stake') {               // 평원 중경 — 부족 말뚝(뼈·나무·밧줄)
      var M = UI.MAT || {};
      g.fillStyle(P.ink, P.a * 0.86);
      g.fillRect(x - s * 0.24, y - s * 2.6, s * 0.48, s * 2.6);
      g.fillStyle(UI.mix(P.base, M.wood === undefined ? 0x8a6a45 : M.wood, 0.30), P.a * 0.86);
      g.fillRect(x - s * 0.16, y - s * 2.5, s * 0.24, s * 2.4);
      g.fillStyle(UI.mix(P.base, M.rope === undefined ? 0xd9c9a2 : M.rope, 0.34), P.a * 0.80);
      g.fillRect(x - s * 0.32, y - s * 2.0, s * 0.64, s * 0.22);
      g.fillStyle(UI.mix(P.base, M.bone === undefined ? 0xeae3cd : M.bone, 0.30), P.a * 0.74);
      g.fillTriangle(x + s * 0.22, y - s * 2.62, x + s * 1.55, y - s * 2.20, x + s * 0.22, y - s * 1.82);

    } else if (k === 'pool') {                // 안개늪 중경 — 수면 웅덩이
      g.fillStyle(P.ink, P.a * 0.76);
      g.fillEllipse(x, y, s * 4.6, s * 2.0, 12);
      g.fillStyle(UI.mix(P.base, 0xbfe8e4, 0.30), P.a * 0.80);
      g.fillEllipse(x, y - s * 0.10, s * 3.9, s * 1.55, 12);
      g.fillStyle(P.lit, P.a * 0.66);
      g.fillEllipse(x - s * 0.85, y - s * 0.32, s * 1.7, s * 0.42, 8);

    } else if (k === 'stump') {               // 안개늪 중경 — 죽은 나무 밑동
      g.fillStyle(P.ink, P.a * 0.84);
      g.fillRect(x - s * 0.58, y - s * 1.5, s * 1.16, s * 1.5);
      g.fillStyle(P.mid, P.a * 0.84);
      g.fillEllipse(x, y - s * 1.5, s * 1.16, s * 0.44, 8);
      g.lineStyle(Math.max(1.2, s * 0.16), P.ink, P.a * 0.76);
      g.lineBetween(x + s * 0.35, y - s * 1.35, x + s * 1.45, y - s * 2.25);

    } else if (k === 'lavacrack') {           // 잿더미 중경 — 식은 용암 균열
      g.lineStyle(Math.max(2.2, s * 0.50), P.ink, P.a * 0.80);
      g.lineBetween(x - s * 2.7, y - s * 0.5, x + s * 0.2, y);
      g.lineBetween(x + s * 0.2, y, x + s * 2.9, y + s * 0.6);
      g.lineStyle(Math.max(1, s * 0.16), P.ember, 0.24);
      g.lineBetween(x - s * 2.3, y - s * 0.42, x + s * 2.5, y + s * 0.50);

    } else if (k === 'ashmound') {            // 잿더미 중경 — 재 무더기
      g.fillStyle(P.ink, P.a * 0.70);
      g.fillEllipse(x, y, s * 2.9, s * 1.25, 10);
      g.fillStyle(P.lit, P.a * 0.58);
      g.fillEllipse(x - s * 0.42, y - s * 0.36, s * 1.65, s * 0.66, 8);
      g.fillStyle(P.ink, P.a * 0.58);
      g.fillEllipse(x + s * 1.75, y + s * 0.36, s * 1.0, s * 0.50, 7);

    } else if (k === 'fissure') {             // 균열 중경 — 갈라진 지면
      g.fillStyle(P.ink, P.a * 0.82);
      g.fillTriangle(x - s * 3.2, y, x + s * 0.4, y - s * 0.95, x + s * 3.4, y + s * 0.3);
      g.fillStyle(P.deep, P.a * 0.70);
      g.fillTriangle(x - s * 2.4, y + s * 0.05, x + s * 0.3, y - s * 0.52, x + s * 2.6, y + s * 0.26);
      g.lineStyle(Math.max(1, s * 0.14), P.glow, 0.18);
      g.lineBetween(x - s * 2.2, y + s * 0.05, x + s * 2.4, y + s * 0.22);

    } else if (k === 'shard') {               // 균열 중경 — 떠 있는 돌조각(+ 아래 그림자)
      g.fillStyle(P.ink, P.a * 0.42);
      g.fillEllipse(x, y + s * 1.5, s * 1.7, s * 0.52, 8);
      g.fillStyle(P.ink, P.a * 0.86);
      g.fillTriangle(x - s * 1.15, y - s * 0.2, x + s * 0.1, y - s * 1.5, x + s * 1.25, y + s * 0.1);
      g.fillStyle(P.lit, P.a * 0.58);
      g.fillTriangle(x - s * 0.30, y - s * 0.4, x + s * 0.1, y - s * 1.15, x + s * 0.65, y - s * 0.3);

    } else if (k === 'sheen') {               // 폭풍 중경 — 젖은 바닥의 반사
      g.fillStyle(P.ink, P.a * 0.58);
      g.fillEllipse(x, y, s * 4.3, s * 1.0, 12);
      g.fillStyle(P.lit, P.a * 0.66);
      g.fillEllipse(x + s * 0.3, y - s * 0.16, s * 3.0, s * 0.52, 10);

    } else if (k === 'bentgrass') {           // 폭풍 중경 — 바람에 한쪽으로 눕는 풀
      g.lineStyle(Math.max(1.2, s * 0.15), P.ink, P.a * 0.70);
      g.lineBetween(x, y, x + d * s * 2.3, y - s * 1.0);
      g.lineBetween(x + d * s * 0.5, y + s * 0.1, x + d * s * 2.9, y - s * 0.55);

    // ── 여기부터는 근경(조용선 아래) 전용 ──────────────────────────────────
    } else if (k === 'tuft') {                // 평원 근경 — 굵은 풀포기
      g.fillStyle(P.ink, P.a);
      g.fillEllipse(x, y, s * 3.0, s * 1.2, 9);
      g.fillStyle(P.lit, P.a * 0.70);
      g.fillEllipse(x - s * 0.40, y - s * 0.34, s * 1.7, s * 0.68, 8);

    } else if (k === 'shore') {               // 안개늪 근경 — 물가
      g.fillStyle(P.ink, P.a);
      g.fillEllipse(x, y, s * 5.2, s * 1.5, 12);
      g.fillStyle(UI.mix(P.base, 0xbfe8e4, 0.40), P.a * 0.90);
      g.fillEllipse(x, y - s * 0.14, s * 4.4, s * 1.05, 12);

    } else if (k === 'embers') {              // 잿더미 근경 — 식은 재와 잉걸 실금
      g.fillStyle(P.ink, P.a);
      g.fillEllipse(x, y, s * 3.6, s * 1.3, 10);
      g.fillStyle(P.lit, P.a * 0.70);
      g.fillEllipse(x - s * 0.5, y - s * 0.36, s * 2.0, s * 0.70, 8);
      g.lineStyle(Math.max(1.2, s * 0.20), P.ember, 0.34);
      g.lineBetween(x - s * 1.5, y + s * 0.5, x + s * 1.7, y + s * 0.2);

    } else if (k === 'rubble') {              // 균열 근경 — 깨진 돌판
      g.fillStyle(P.ink, P.a);
      g.fillTriangle(x - s * 2.1, y + s * 0.4, x - s * 0.2, y - s * 1.0, x + s * 1.9, y + s * 0.5);
      g.fillStyle(P.lit, P.a * 0.68);
      g.fillTriangle(x - s * 0.9, y + s * 0.1, x - s * 0.2, y - s * 0.68, x + s * 0.6, y + s * 0.15);

    } else {                                  // 폭풍 근경 — 빗물 웅덩이
      g.fillStyle(P.ink, P.a);
      g.fillEllipse(x, y, s * 4.6, s * 1.4, 12);
      g.fillStyle(P.lit, P.a * 0.78);
      g.fillEllipse(x + s * 0.2, y - s * 0.18, s * 3.5, s * 0.80, 10);
      g.lineStyle(Math.max(1, s * 0.14), P.lit, P.a * 0.56);
      g.lineBetween(x - s * 1.7, y + s * 0.36, x + s * 1.9, y + s * 0.14);
    }
  }

  //  원경·중경 — **유닛이 그 위에 선다.** 대비 예산은 능선보다 낮게(위 절 참조).
  function quietPalette(baseFill) {
    return {
      base: baseFill,
      ink:  UI.mix(baseFill, 0x000000, 0.16),
      mid:  UI.mix(baseFill, 0x000000, 0.07),
      lit:  UI.mix(baseFill, 0xffffff, 0.16),
      deep: UI.mix(baseFill, 0x000000, 0.30),
      glow: UI.mix(baseFill, 0x8fd8ff, 0.50),
      ember: UI.mix(baseFill, 0xff8c2e, 0.55),
      a: 0.52
    };
  }

  //  근경 — 아무도 안 서는 띠. 여기만 진하게(앞마당 얼룩과 같은 급 이상).
  function boldPalette(baseFill) {
    return {
      base: baseFill,
      ink:  UI.mix(baseFill, 0x000000, 0.42),
      mid:  UI.mix(baseFill, 0x000000, 0.22),
      lit:  UI.mix(baseFill, 0xffffff, 0.24),
      deep: UI.mix(baseFill, 0x000000, 0.55),
      glow: UI.mix(baseFill, 0x8fd8ff, 0.55),
      ember: UI.mix(baseFill, 0xff8c2e, 0.65),
      a: 0.62
    };
  }

  UI.drawWorldMid = function (g, S, baseFill) {
    if (!S) return;
    var P = quietPalette(baseFill), i;
    for (i = 0; i < S.far.length; i++) item(g, S.far[i], P);
    for (i = 0; i < S.mid.length; i++) item(g, S.mid[i], P);
  };

  UI.drawWorldNear = function (g, S, baseFill) {
    if (!S) return;
    var P = boldPalette(baseFill), i;
    for (i = 0; i < S.near.length; i++) item(g, S.near[i], P);
  };

  //  ── 감사용: 그린 것이 전장 밖으로 새는가 (게임은 안 부른다) ────────────────
  //  ⚠ `EXT` 표를 믿지 않는다 — **실제로 그려진 좌표**를 받아 적어 R 과 맞댄다.
  //    표를 검사하면 표가 틀렸을 때 표대로 통과한다(이 폴더의 "도구가 자기 답을
  //    오염시킨다" 계열). 넘침이 0 보다 크면 어딘가 화면 밖으로 나간 것이다.
  //  ⚠ 2026-09-09 — 층대(stage 3)·바람(wind ±1)·「층 이야기」(원형 11 · 조건 표식 9 ·
  //    전장 5)까지 전부 돈다. 축이 늘었는데 검사가 안 늘면 **늘어난 축만 검사 밖**이
  //    된다(이 폴더의 "감사가 안 보는 자리는 구조로 정해진다").
  UI._wsBoundsCheck = function (R, farH, quietS) {
    var out = [], names = ['meadow', 'mist', 'ash', 'rift', 'storm'];
    var b, rec;
    function fresh() {
      b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, lw: 1 };
      rec = {
        fillStyle: function () { return rec; },
        lineStyle: function (t) { b.lw = t || 1; return rec; },
        //  ⚠ 굵기 여유는 **선에만** 준다. 채우기까지 lw/2 를 얹으면 전장을 꽉 채우는
        //    fillRect(원경 띠·앞마당 장막)가 언제나 0.5 를 내 **거짓 경보**가 된다.
        _pt: function (x, y, h) {
          h = h || 0;
          if (x - h < b.x0) b.x0 = x - h;
          if (y - h < b.y0) b.y0 = y - h;
          if (x + h > b.x1) b.x1 = x + h;
          if (y + h > b.y1) b.y1 = y + h;
        },
        fillRect: function (x, y, ww, hh) { rec._pt(x, y); rec._pt(x + ww, y + hh); return rec; },
        fillEllipse: function (x, y, ww, hh) { rec._pt(x - ww / 2, y - hh / 2); rec._pt(x + ww / 2, y + hh / 2); return rec; },
        strokeEllipse: function (x, y, ww, hh) { var h = b.lw / 2; rec._pt(x - ww / 2, y - hh / 2, h); rec._pt(x + ww / 2, y + hh / 2, h); return rec; },
        fillTriangle: function (a, c, d, e, f, h2) { rec._pt(a, c); rec._pt(d, e); rec._pt(f, h2); return rec; },
        lineBetween: function (a, c, d, e) { var h = b.lw / 2; rec._pt(a, c, h); rec._pt(d, e, h); return rec; }
      };
    }
    function over(label) {
      out.push({
        world: label,
        over: (b.x0 === Infinity) ? 0
            : Math.max(0, R.x - b.x0, R.y - b.y0, b.x1 - R.right, b.y1 - R.bottom)
      });
    }
    var w, st, wd, S;
    for (w = 0; w < names.length; w++) {
      for (st = 0; st < 3; st++) {
        for (wd = 0; wd < 2; wd++) {
          fresh();
          UI._wsKey = null;
          S = UI._worldScene(names[w], R, farH, quietS, { stage: st, wind: wd ? -1 : 1 });
          UI.drawWorldMid(rec, S, 0x6d8a4e);
          UI.drawWorldNear(rec, S, 0x6d8a4e);
          over(names[w] + '/' + st + (wd ? '/←' : '/→'));
        }
      }
    }
    //  ── 층 이야기 ──────────────────────────────────────────────────────────
    var planKeys = ['line', 'doubleWall', 'pincer', 'keep', 'lavaPress', 'scatter',
                    'wedge', 'ambush', 'echelon', 'ring', 'bulwarkRing'];
    var ruleKeys = [], rk;
    for (rk in UI.RULE_MOTIF) ruleKeys.push(rk);
    var base = { R: R, farH: farH, quietS: quietS, wind: 1 };
    var p, r;
    for (p = 0; p < planKeys.length; p++) {
      fresh();
      base.plan = planKeys[p]; base.rule = null; base.field = null;
      UI.drawPlanTrace(rec, base, 0x6d8a4e);
      over('plan:' + planKeys[p]);
    }
    base.plan = null;
    for (r = 0; r < ruleKeys.length; r++) {
      for (wd = 0; wd < 2; wd++) {
        fresh();
        base.rule = ruleKeys[r]; base.wind = wd ? -1 : 1;
        UI.drawRuleMark(rec, base, 0x6d8a4e);
        over('rule:' + ruleKeys[r] + (wd ? '/←' : '/→'));
      }
    }
    base.rule = null; base.wind = 1;
    //  전장 규칙은 **극단값**으로 민다 — 규칙이 낼 수 있는 가장 큰 반경·가장 바깥 자리.
    var fields = [
      { kind: 'swamp', zones: [{ x: 0.02, y: 0.02, r: 0.15 }, { x: 0.98, y: 0.98, r: 0.15 }] },
      { kind: 'lava', zones: [{ x: 0.02, y: 0.02, r: 0.06, maxR: 0.22 }, { x: 0.98, y: 0.98, r: 0.06, maxR: 0.22 }] },
      { kind: 'fog' }, { kind: 'quake' },
      { kind: 'storm', windDir: 0 }, { kind: 'storm', windDir: Math.PI }
    ];
    for (r = 0; r < fields.length; r++) {
      fresh();
      base.field = fields[r];
      base.wind = (fields[r].windDir === Math.PI) ? -1 : 1;
      UI.drawFieldGround(rec, base, 0x6d8a4e);
      over('field:' + fields[r].kind + (base.wind < 0 ? '/←' : ''));
    }
    UI._wsKey = null;
    return out;
  };

})(GAME.UI);

// ═══════════════════════════════════════════════════════════════════════════
//  층 이야기 — 배경이 **이 층이 어떤 층인지** 말한다 (2026-09-09)
//
//  왜: 층마다 달라지는 축이 이미 셋 있는데 화면은 **글자로만** 알렸다.
//     · `towerplan` 배치 원형 9+2종 — 적이 어떤 모양으로 서는가
//     · `towerrule` 층 조건 7+4+3종 — 이 층의 규칙이 무엇인가
//     · `towercurriculum.fieldFor` 전장 규칙 5종 — 땅이 무엇을 하는가
//     전장은 화면에서 가장 큰 면적인데 셋 중 무엇도 안 말하고 있었다. 로딩 화면의
//     `◈ 원형` / `⚠ 조건` 이 사라지는 순간 그 정보가 통째로 없어진다.
//
//  ── 어떻게 알아내는가 ────────────────────────────────────────────────────
//  `drawArena` 는 **층 번호만** 받는다. 그걸로 충분하다 — 세 모듈이 전부
//  `(floor, seed?)` 순수 함수이고 seed 기본값이 `climbSeed` 라, 여기서 부른 값이
//  로딩 화면·전투가 쓰는 값과 **같은 값**이다. 씬에서 인자를 더 받아 오면 화면과
//  전투가 갈라질 자리가 하나 더 생긴다(이 폴더가 `_hasDemo`·`quietLine` 에서
//  이미 배운 것 — 두 벌로 두면 한쪽만 고쳐진다).
//
//  ── 켜지는 자리 ──────────────────────────────────────────────────────────
//  통곡의 탑 **전투**에서만. 배치 화면(`opts.zones`)·수성의 탑(`opts.defend`)·
//  층이 없는 모드(대전·도전)는 이야기가 없다. 수성의 탑의 `floor` 는 회차라
//  거기에 통곡의 탑 원형·조건을 그리면 **화면이 거짓말을 한다.**
//
//  ── 대비 예산 (이 절이 지켜야 하는 제1규율) ──────────────────────────────
//  「유닛이 서는 구간은 가장 조용해야 한다」(v1.6x 함정 1).
//   · **원형 자국**은 적 배치 구역(아레나 0~30%) 한복판에 그린다 → 이 파일에서
//     가장 조용하다: mix 0.10 × α 0.24 ≈ 명도차 2.4%. 능선(12%)·세계 중경(8%)보다
//     낮다. 큰 도형 하나로만 말한다 — 잔 도형은 예고 원과 공간 주파수가 겹친다.
//   · **조건 표식**·**전장 흔적**은 중경(38~70%)에 둔다. 거기는 유닛이 서지 않고
//     지나만 간다 → 세계 중경과 같은 급(mix ≤0.22 × α ≤0.42).
//   · 원경 띠(위 10%)에 얹는 것은 조건 둘(광란의 열기·폭풍의 관)뿐이고 색만 얹는다.
//
//  ── 예산 ────────────────────────────────────────────────────────────────
//  이야기 하나당 **도형 ≤4**. 한 판에 최대 셋(원형·조건·전장) = ≤12 도형.
//  대신 `drawArena` 의 앞마당 얼룩을 이야기 하나당 7개씩 줄인다(얼룩 하나가
//  4~5 호출이라 순감이다).
//
//  ⚠ 판정·밸런스와 무관하다. 전부 화면 좌표이고 `state` 를 한 톨도 안 읽는다.
// ═══════════════════════════════════════════════════════════════════════════
(function (UI) {

  var WB_FALLBACK = [31, 61, 101, 151];

  //  세계 안에서 지금 얼마나 깊이 왔는가.
  //    i     세계 인덱스 0..4 (UI.worldIndexForFloor 와 같은 경계)
  //    t     그 세계 안의 진행도 0..1
  //    stage 0 초입 · 1 중반 · 2 심부
  //  ⚠ 마지막 세계(151+)는 **끝이 없다.** 100층 폭으로 잡아 251층부터는 심부에
  //    머문다 — 끝없는 축을 0..1 로 억지로 정규화하면 300층과 900층이 또 같아진다.
  //  ⚠ 경계는 `UI.WORLD_BOUNDS`(ui-hud.js) 한 곳이다. 그 파일이 없는 도구에서도
  //    돌아야 하므로 같은 값을 폴백으로 둔다 — 값이 갈리면 배지와 바닥이 어긋난다.
  UI.worldDepth = function (floor) {
    var b = (UI.WORLD_BOUNDS && UI.WORLD_BOUNDS.length) ? UI.WORLD_BOUNDS : WB_FALLBACK;
    var f = Math.max(1, Math.round(Number(floor) || 0));
    var i = 0;
    for (; i < b.length; i++) if (f < b[i]) break;
    var from = (i === 0) ? 1 : b[i - 1];
    var to = (i < b.length) ? b[i] : (from + 100);
    var t = (f - from) / Math.max(1, to - from);
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    return { i: i, t: t, stage: t < 0.34 ? 0 : (t < 0.70 ? 1 : 2) };
  };

  //  원형·조건이 쓰는 것과 **같은 시드**. 없으면 0 — 그때는 모듈 기본값이 쓰인다.
  function seedOf() {
    try {
      if (GAME.TowerCurriculum && GAME.TowerCurriculum._seedNow) {
        return GAME.TowerCurriculum._seedNow() | 0;
      }
    } catch (e) { /* 저장소가 없는 도구 환경 */ }
    return 0;
  }

  //  ── 이 층의 이야기 (한 번만 뽑아 캐시) ───────────────────────────────────
  UI.floorStory = function (opts, R, farH, quietS, dep) {
    opts = opts || {};
    var floor = Math.max(0, Math.round(Number(opts.floor) || 0));
    if (!dep) dep = UI.worldDepth(floor > 0 ? floor : 1);
    //  통곡의 탑 전투에서만. (위 「켜지는 자리」)
    var on = floor > 0 && !opts.zones && !opts.defend;
    var key = floor + '|' + (on ? 1 : 0) + '|' + seedOf() + '|' + dep.stage + '|'
            + Math.round(R.x) + ',' + Math.round(R.y) + ','
            + Math.round(R.w) + ',' + Math.round(R.h) + '|'
            + Math.round(quietS) + '|' + Math.round(farH);
    if (UI._storyKey === key && UI._story) return UI._story;

    var ST = {
      key: key, floor: floor, stage: dep.stage, t: dep.t,
      wind: 1, n: 0, plan: null, rule: null, field: null,
      R: R, farH: farH, quietS: quietS
    };
    if (on) {
      try {
        if (GAME.TowerPlan && GAME.TowerPlan.planFor) {
          var p = GAME.TowerPlan.planFor(floor);
          if (p && p.key) ST.plan = p.key;
        }
      } catch (e) { /* 모듈이 없으면 이야기 하나가 없을 뿐이다 */ }
      try {
        if (GAME.TowerRule) {
          //  층 조건이 먼저다 — 그것만이 **층마다 바뀌는** 축이다. 없는 층
          //  (쉬어 가는 층·보스 층)에서는 세계 조건이 대신 말한다. 둘 다 그리면
          //  같은 화면에 표식이 둘이 되어 어느 것이 이번 층 것인지 안 읽힌다.
          var r = GAME.TowerRule.ruleFor ? GAME.TowerRule.ruleFor(floor) : null;
          if (!r && GAME.TowerRule.worldRuleFor) r = GAME.TowerRule.worldRuleFor(floor);
          if (r && r.key) ST.rule = r.key;
        }
      } catch (e) { /* 위와 같다 */ }
      try {
        if (GAME.TowerCurriculum && GAME.TowerCurriculum.fieldFor) {
          ST.field = GAME.TowerCurriculum.fieldFor(floor) || null;
        }
      } catch (e) { /* 위와 같다 */ }
    }
    //  폭풍의 바람 방향 — 배경의 비·눕는 풀이 **실제로 미는 방향**을 따라간다.
    //  이게 어긋나면 화면이 공략을 거꾸로 가르친다(바람 방향이 곧 폭풍 세계의 답이다).
    if (ST.field && ST.field.kind === 'storm' && typeof ST.field.windDir === 'number') {
      ST.wind = (Math.cos(ST.field.windDir) < 0) ? -1 : 1;
    }
    ST.n = (ST.plan ? 1 : 0) + (ST.rule ? 1 : 0) + (ST.field ? 1 : 0);
    UI._storyKey = key; UI._story = ST;
    return ST;
  };

  // ── 팔레트 ────────────────────────────────────────────────────────────────
  //  trace : 적 배치 구역(유닛 자리) — 이 파일에서 가장 조용하다.
  //  ink/lit: 중경 — 세계 중경과 같은 급.
  //  ember/glow: 색으로만 말하는 것(열기·번개) — 알파를 0.22 이하로 묶는다.
  function pal(baseFill) {
    return {
      base: baseFill,
      //  원형 자국 — 실효 명도차 0.10 × 0.24 = **2.4%**.
      //  (능선 0.14×0.85 = 11.9% · 세계 중경 0.16×0.52 = 8.3% · 앞마당 얼룩 0.30×0.36 = 10.8%)
      //  즉 이 파일에서 가장 조용하다. 유닛 자리에 그리는 유일한 물건이라 그래야 한다.
      trace: UI.mix(baseFill, 0x000000, 0.10),
      traceL: UI.mix(baseFill, 0xffffff, 0.10),
      ta: 0.24,
      //  조건 표식 — 실효 0.20 × 0.40 = **8.0%**. 세계 중경(8.3%)과 같은 급이고
      //  자리도 같다(중경 띠 38~70% — 유닛이 서지 않고 지나만 간다).
      ink: UI.mix(baseFill, 0x000000, 0.20),
      lit: UI.mix(baseFill, 0xffffff, 0.18),
      a: 0.40,
      ember: UI.mix(baseFill, 0xff6a2e, 0.50),
      glow: UI.mix(baseFill, 0x8fd8ff, 0.50),
      wet: UI.mix(baseFill, 0x2c4a52, 0.42)
    };
  }

  // ── ① 원형 자국 — 적이 서기 전의 땅 ──────────────────────────────────────
  //  `towerplan` 의 배치 원형을 **지면에 눌린 자국**으로 옮긴다. 원형마다 요구하는
  //  답이 다르므로(요새=뭉침→광역기 · 산개=퍼짐 · 고리=파고들면 포위) 모양만 봐도
  //  "무엇을 준비해야 하는지"가 읽힌다.
  //  ⚠ 이 구역은 통째로 유닛 자리다. 그래서 **도형 하나가 크게**, α 0.24, 잔 도형 금지.
  //  ⚠ 모르는 원형 키가 오면 아무것도 안 그린다 — 아무 모양이나 그리면 그림이
  //    거짓말을 한다(새 원형을 넣으면 여기에도 한 줄 넣을 것).
  UI.drawPlanTrace = function (g, ST, baseFill) {
    if (!ST || !ST.plan) return 0;
    var P = pal(baseFill), R = ST.R, k = ST.plan, n = 0, i;
    var cx = R.x + R.w * 0.5;
    var yT = R.y + R.h * 0.060, yM = R.y + R.h * 0.160, yB = R.y + R.h * 0.255;
    var hh = R.h * 0.060;
    g.fillStyle(P.trace, P.ta);
    if (k === 'line') {                                   // 줄벽 — 가로로 긴 한 줄
      g.fillEllipse(cx, yM, R.w * 0.80, hh * 1.1, 12); n = 1;
    } else if (k === 'doubleWall') {                      // 이중벽 — 두 줄
      g.fillEllipse(cx, yT + hh * 0.3, R.w * 0.78, hh * 0.8, 12);
      g.fillEllipse(cx, yB, R.w * 0.64, hh * 0.8, 12); n = 2;
    } else if (k === 'pincer') {                          // 집게 — 좌우 두 덩이
      g.fillEllipse(R.x + R.w * 0.21, yM, R.w * 0.30, hh * 1.7, 12);
      g.fillEllipse(R.x + R.w * 0.79, yM, R.w * 0.30, hh * 1.7, 12); n = 2;
    } else if (k === 'keep' || k === 'lavaPress') {       // 요새 · 용암 밀집 — 뭉친다
      g.fillEllipse(cx, yM, R.w * 0.34, hh * 2.1, 14);
      g.fillStyle(P.traceL, P.ta * 0.8);
      g.fillEllipse(cx, yM - hh * 0.35, R.w * 0.21, hh * 1.2, 12); n = 2;
    } else if (k === 'scatter') {                         // 산개 — 흩어진 넷
      for (i = 0; i < 4; i++) {
        g.fillEllipse(R.x + R.w * (0.16 + i * 0.226), i % 2 ? yT + hh : yB - hh * 0.4,
                      R.w * 0.15, hh * 1.0, 10);
      }
      n = 4;
    } else if (k === 'wedge') {                           // 쐐기 — 앞으로 뾰족하다
      g.fillTriangle(cx, yB, R.x + R.w * 0.24, yT, R.x + R.w * 0.76, yT); n = 1;
    } else if (k === 'ambush') {                          // 매복 — 가장자리 둘, 가운데는 빈다
      g.fillEllipse(R.x + R.w * 0.11, yM, R.w * 0.19, hh * 2.0, 12);
      g.fillEllipse(R.x + R.w * 0.89, yM, R.w * 0.19, hh * 2.0, 12); n = 2;
    } else if (k === 'echelon') {                         // 사선 — 비스듬히 물러난다
      for (i = 0; i < 3; i++) {
        g.fillEllipse(R.x + R.w * (0.24 + i * 0.26), yT + (yB - yT) * (i / 2),
                      R.w * 0.26, hh * 0.9, 12);
      }
      n = 3;
    } else if (k === 'ring' || k === 'bulwarkRing') {     // 고리 · 원형 방벽 — 파고들면 포위
      g.lineStyle(Math.max(2, R.h * 0.012), P.trace, P.ta * 1.3);
      g.strokeEllipse(cx, yM, R.w * 0.44, hh * 2.8, 16);
      g.strokeEllipse(cx, yM, R.w * 0.25, hh * 1.6, 14); n = 2;
    }
    return n;
  };

  // ── ② 층 조건의 표식 ─────────────────────────────────────────────────────
  //  조건은 난이도 장치가 아니라 **답을 바꾸는 장치**다(towerrule.js 설계 기준).
  //  그러니 전장이 그것을 미리 말해 주는 것이 옳다. 표식은 하나뿐이다.
  //  ⚠ 모르는 키는 아무것도 안 그린다 — 조건을 늘리면 이 표에도 한 줄 넣을 것.
  var RULE_MOTIF = {
    frenzy: 'heat', ashFrenzy: 'heat',          // 시간이 갈수록 세진다 → 땅이 달아오른다
    ironclad: 'wall', bulwarkElite: 'wall',     // 단단하다 → 돌담
    gale: 'wind',                               // 빠르다 → 바람 줄기
    bond: 'bind', riftBond: 'bind',             // 곁이 세진다 → 서로 묶인 자국
    nosupply: 'empty',                          // 물약이 없다 → 엎어진 빈 항아리
    tenacious: 'tracks',                        // 끝까지 쫓는다 → 길게 끌린 자국
    narrow: 'narrow', mireNarrow: 'narrow',     // 시야가 좁다 → 좌우에서 스미는 어둠
    warlord: 'totem',                           // 두령이 있다 → 세워 둔 토템
    bomber: 'scorch',                           // 죽으면 터진다 → 미리 난 그을음
    stormCrown: 'crown'                         // 폭풍의 관 → 지평선의 번개 갈래
  };
  UI.RULE_MOTIF = RULE_MOTIF;

  UI.drawRuleMark = function (g, ST, baseFill) {
    var m = (ST && ST.rule) ? RULE_MOTIF[ST.rule] : null;
    if (!m) return 0;
    var P = pal(baseFill), R = ST.R, farH = ST.farH, n = 0, i;
    var d = ST.wind < 0 ? -1 : 1;
    //  중경 띠 — 유닛이 서지 않고 지나만 간다(38~70%).
    var y0 = R.y + R.h * 0.44, y1 = R.y + R.h * 0.66;

    if (m === 'heat') {
      //  지평선 바로 아래가 달아오른다 + 지면에 붉은 실금 둘.
      g.fillStyle(P.ember, 0.15);
      g.fillRect(R.x, R.y + farH * 0.84, R.w, farH * 0.52);
      g.lineStyle(Math.max(1.4, R.h * 0.006), P.ember, 0.18);
      g.lineBetween(R.x + R.w * 0.14, y0, R.x + R.w * 0.42, y0 + R.h * 0.03);
      g.lineBetween(R.x + R.w * 0.60, y1 - R.h * 0.02, R.x + R.w * 0.88, y1);
      n = 3;

    } else if (m === 'wall') {
      //  낮은 돌담 세 토막(끊겨 있어야 '지나간 자리'로 읽힌다) + 윗면 하이라이트.
      var bw = R.w * 0.19, bh = Math.max(3, R.h * 0.030), by = y0 + R.h * 0.04;
      g.fillStyle(P.ink, P.a);
      for (i = 0; i < 3; i++) g.fillRect(R.x + R.w * (0.13 + i * 0.29), by, bw, bh);
      g.fillStyle(P.lit, P.a * 0.55);
      g.fillRect(R.x + R.w * 0.13, by, bw, Math.max(1, bh * 0.34));
      n = 4;

    } else if (m === 'wind') {
      //  길고 얇은 바람 줄기 셋. 바람 방향을 따른다.
      g.lineStyle(Math.max(1.2, R.h * 0.005), P.lit, P.a * 0.62);
      for (i = 0; i < 3; i++) {
        var wy = y0 + (y1 - y0) * (i / 2);
        g.lineBetween(R.x + R.w * (d > 0 ? 0.10 : 0.90), wy,
                      R.x + R.w * (d > 0 ? 0.62 : 0.38), wy - R.h * 0.018);
      }
      n = 3;

    } else if (m === 'bind') {
      //  두 무리를 묶은 옅은 고리 둘.
      g.lineStyle(Math.max(1.4, R.h * 0.006), P.ink, P.a * 0.66);
      g.strokeEllipse(R.x + R.w * 0.30, y0 + R.h * 0.05, R.w * 0.20, R.h * 0.070, 14);
      g.strokeEllipse(R.x + R.w * 0.70, y0 + R.h * 0.07, R.w * 0.20, R.h * 0.070, 14);
      n = 2;

    } else if (m === 'empty') {
      //  엎어진 빈 항아리 둘 — 보급이 끊긴 자리.
      var jr = Math.max(4, R.h * 0.026);
      for (i = 0; i < 2; i++) {
        var jx = R.x + R.w * (0.26 + i * 0.44), jy = y1 - R.h * 0.02;
        g.fillStyle(P.ink, P.a);
        g.fillEllipse(jx, jy, jr * 2.2, jr * 1.2, 9);
        g.fillStyle(P.lit, P.a * 0.60);
        g.fillEllipse(jx + jr * 0.9, jy - jr * 0.2, jr * 0.8, jr * 0.9, 8);
      }
      n = 4;

    } else if (m === 'tracks') {
      //  끌린 자국 넷 — 여기서 누군가 끝까지 쫓겼다.
      g.lineStyle(Math.max(1.2, R.h * 0.005), P.ink, P.a * 0.52);
      for (i = 0; i < 4; i++) {
        var tx = R.x + R.w * (0.18 + i * 0.21);
        g.lineBetween(tx, y0, tx + R.w * 0.05 * d, y1);
      }
      n = 4;

    } else if (m === 'narrow') {
      //  좌우에서 안으로 스미는 어둠 — 두 겹씩(한 겹이면 '막대'로 보인다).
      var nw = R.w * 0.055;
      for (i = 0; i < 2; i++) {
        g.fillStyle(P.ink, P.a * (i === 0 ? 0.34 : 0.20));
        g.fillRect(R.x, R.y, nw * (i + 1), R.h);
        g.fillRect(R.right - nw * (i + 1), R.y, nw * (i + 1), R.h);
      }
      n = 4;

    } else if (m === 'totem') {
      //  세워 둔 토템 — 두령이 여기 있다.
      var tw = Math.max(3, R.w * 0.008), th = R.h * 0.13, ty = y0 + R.h * 0.06;
      g.fillStyle(P.ink, P.a * 0.90);
      g.fillRect(R.x + R.w * 0.50 - tw * 0.5, ty - th, tw, th);
      g.fillRect(R.x + R.w * 0.50 - tw * 2.6, ty - th * 0.72, tw * 5.2, Math.max(2, tw * 0.7));
      g.fillStyle(P.lit, P.a * 0.55);
      g.fillEllipse(R.x + R.w * 0.50, ty - th, tw * 2.0, tw * 1.6, 8);
      n = 3;

    } else if (m === 'scorch') {
      //  이미 한 번 터진 자리 — 그을음.
      for (i = 0; i < 2; i++) {
        var sxp = R.x + R.w * (0.32 + i * 0.36), syp = y0 + R.h * (0.03 + i * 0.09);
        g.fillStyle(P.ink, P.a * 0.72);
        g.fillEllipse(sxp, syp, R.w * 0.11, R.h * 0.038, 12);
        g.fillStyle(P.ember, 0.14);
        g.fillEllipse(sxp, syp, R.w * 0.06, R.h * 0.020, 10);
      }
      n = 4;

    } else if (m === 'crown') {
      //  지평선 위 번개 갈래 둘 — 폭풍의 관.
      g.lineStyle(Math.max(1.2, R.h * 0.005), P.glow, 0.20);
      g.lineBetween(R.x + R.w * 0.26, R.y + farH * 0.20, R.x + R.w * 0.31, R.y + farH * 0.72);
      g.lineBetween(R.x + R.w * 0.31, R.y + farH * 0.72, R.x + R.w * 0.27, R.y + farH * 1.05);
      g.lineBetween(R.x + R.w * 0.72, R.y + farH * 0.16, R.x + R.w * 0.68, R.y + farH * 0.80);
      n = 3;
    }
    return n;
  };

  // ── ③ 전장 규칙의 정지 흔적 ──────────────────────────────────────────────
  //  `state.towerField` 는 `FXS.drawField` 가 **살아 움직이게** 그린다(안개 마스크·
  //  늪 물결·용암 성장·낙뢰). 배경은 그 위가 아니라 **밑**을 맡는다 — 규칙이 오기
  //  전부터 거기 있던 땅의 흔적.
  //  ⚠⚠ **좌표를 지어내지 않는다.** 늪·용암은 규칙이 준 정규 좌표(0..1)를 그대로
  //    아레나에 옮긴다(`Combat._buildField` 와 같은 산수: A.x + nx*A.w · A.y + ny*A.h).
  //    그래야 살아 있는 이펙트와 같은 자리에 놓인다 — 자리가 다르면 따로 논다.
  //  ⚠ 그리는 순서: 세계 중경 **뒤**, 소품 **앞**. 땅의 일부지 물건이 아니다.
  UI.drawFieldGround = function (g, ST, baseFill) {
    var F = ST && ST.field;
    if (!F || !F.kind) return 0;
    var A = GAME.CONFIG && GAME.CONFIG.ARENA, Iso = GAME.Iso;
    if (!A || !Iso) return 0;
    var P = pal(baseFill), R = ST.R, n = 0, i;
    var d = ST.wind < 0 ? -1 : 1;
    function sx(nx) { return A.x + nx * A.w; }
    function sy(ny) { return Iso.toScreenY(A.y + ny * A.h); }
    //  전장 밖으로 새지 않게 가둔다(보스 균열이 HUD 위까지 그어진 사고와 같은 규율).
    function inx(v, half) { return Math.max(R.x + half + 4, Math.min(R.right - half - 4, v)); }
    function iny(v, half) { return Math.max(R.y + half + 2, Math.min(R.bottom - half - 2, v)); }

    if (F.kind === 'swamp' && F.zones && F.zones.length) {
      for (i = 0; i < Math.min(2, F.zones.length); i++) {
        var z = F.zones[i];
        var zr = Math.min((z.r || 0.1) * A.w, R.w * 0.22);
        var zh = zr * Iso.TILT;
        var zx = inx(sx(z.x === undefined ? 0.5 : z.x), zr);
        var zy = iny(sy(z.y === undefined ? 0.5 : z.y), zh);
        g.fillStyle(P.wet, P.a * 0.60);                     // 젖어 검게 죽은 땅
        g.fillEllipse(zx, zy, zr * 2, zh * 2, 14);
        g.fillStyle(P.lit, P.a * 0.34);                     // 가장자리에 고인 물빛
        g.fillEllipse(zx - zr * 0.22, zy - zh * 0.26, zr * 1.2, zh * 0.9, 12);
        n += 2;
      }

    } else if (F.kind === 'lava' && F.zones && F.zones.length) {
      for (i = 0; i < Math.min(2, F.zones.length); i++) {
        var l = F.zones[i];
        //  용암이 **끝내 차오를 자리**(maxR)를 그을린 분지로 미리 남긴다.
        //  예고를 보고 피하는 게임이니 자리를 미리 말하는 것이 이 게임의 문법이다.
        var lr = Math.min((l.maxR || l.r || 0.12) * A.w, R.w * 0.24);
        var lh = lr * Iso.TILT;
        var lx = inx(sx(l.x === undefined ? 0.5 : l.x), lr);
        var ly = iny(sy(l.y === undefined ? 0.5 : l.y), lh);
        g.fillStyle(P.ink, P.a * 0.66);
        g.fillEllipse(lx, ly, lr * 2, lh * 2, 14);
        g.lineStyle(Math.max(1.2, R.h * 0.005), P.ember, 0.20);
        g.strokeEllipse(lx, ly, lr * 1.4, lh * 1.4, 14);
        n += 2;
      }

    } else if (F.kind === 'fog') {
      //  낮게 깔린 안개 — 세계 소품보다 **넓고 밝게**. "원거리 사거리가 준다"는
      //  규칙을 "멀리가 안 보인다"로 옮긴다.
      g.fillStyle(P.lit, P.a * 0.52);
      g.fillEllipse(R.x + R.w * 0.34, R.y + R.h * 0.42, R.w * 0.60, R.h * 0.075, 14);
      g.fillEllipse(R.x + R.w * 0.68, R.y + R.h * 0.52, R.w * 0.56, R.h * 0.065, 14);
      n = 2;

    } else if (F.kind === 'quake') {
      //  이미 한 번 흔들린 땅 — 실금 셋(예고 원과 안 겹치게 아주 얇게).
      g.lineStyle(Math.max(1.2, R.h * 0.005), P.ink, P.a * 0.50);
      for (i = 0; i < 3; i++) {
        var qy = R.y + R.h * (0.40 + i * 0.10);
        g.lineBetween(R.x + R.w * 0.08, qy, R.x + R.w * 0.46, qy + R.h * 0.022);
        n++;
      }

    } else if (F.kind === 'storm') {
      //  바람이 쓸고 간 결 셋 — 방향은 규칙이 정한 `windDir` 그대로다.
      g.lineStyle(Math.max(1.2, R.h * 0.005), P.lit, P.a * 0.46);
      for (i = 0; i < 3; i++) {
        var gy = R.y + R.h * (0.40 + i * 0.09);
        g.lineBetween(R.x + R.w * (d > 0 ? 0.12 : 0.88), gy,
                      R.x + R.w * (d > 0 ? 0.70 : 0.30), gy + R.h * 0.014);
        n++;
      }
    }
    return n;
  };

})(GAME.UI);
