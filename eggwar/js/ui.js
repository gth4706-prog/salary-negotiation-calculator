window.GAME = window.GAME || {};

GAME.UI = {

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
    rect.on('pointerover', function () { rect.setFillStyle(opts.hover !== undefined ? opts.hover : 0x33334a); });
    rect.on('pointerout', function () { rect.setFillStyle(fill); });
    rect.on('pointerdown', function () { onClick(); });

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

    // 지형지물 — **거리 그림자(아래 bands)보다 먼저** 그린다.
    // 그래야 안쪽 소품이 같이 어두워져 원근을 거스르지 않는다.
    if (B) UI.drawBiomeProps(g, B);

    // 안쪽으로 갈수록(위쪽) 어둡게 — 거리감
    var bands = 6;
    for (var b = 0; b < bands; b++) {
      var y0 = A.y + (A.h / bands) * b;
      var alpha = 0.16 * (1 - b / bands);
      g.fillStyle(0x000000, alpha);
      g.fillRect(A.x, Iso.toScreenY(y0), A.w, (A.h / bands) * Iso.TILT + 1);
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

    g.lineStyle(2, C.arenaLine, 1);
    g.strokeRect(R.x, R.y, R.w, R.h);

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
  groundCircle: function (g, worldX, worldY, radius) {
    var Iso = GAME.Iso;
    g.strokeEllipse(worldX, Iso.toScreenY(worldY), radius * 2, radius * 2 * Iso.TILT);
  },

  groundCircleFill: function (g, worldX, worldY, radius) {
    var Iso = GAME.Iso;
    g.fillEllipse(worldX, Iso.toScreenY(worldY), radius * 2, radius * 2 * Iso.TILT);
  },

  // 선택 표시 — 캐릭터 머리 위에 떠서 아래를 가리키는 빨간 화살표.
  // 진영색(청록/보라)과 겹치지 않는 빨강이라 "내가 고른 것"이 한눈에 읽힌다.
  // sx/by 는 drawUnit 이 돌려주는 화면 좌표(발밑 sx, 몸통 기준 by)를 그대로 넣는다.
  selectArrow: function (g, sx, by, radius, timeMs) {
    var bob = Math.sin((timeMs || 0) / 260) * 3;
    var tipY = by - radius - 12 + bob;     // 화살촉 끝(아래를 가리킨다)
    var w = Math.max(7, radius * 0.62);
    var h = Math.max(9, radius * 0.78);

    g.fillStyle(0x000000, 0.35);
    g.fillTriangle(sx - w, tipY - h + 2, sx + w, tipY - h + 2, sx, tipY + 2);
    g.fillStyle(0xff3b30, 1);
    g.fillTriangle(sx - w, tipY - h, sx + w, tipY - h, sx, tipY);
    g.fillStyle(0xff8a80, 1);
    g.fillTriangle(sx - w * 0.42, tipY - h, sx + w * 0.42, tipY - h, sx, tipY - h * 0.32);
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
