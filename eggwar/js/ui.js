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
  drawArena: function (g, opts) {
    opts = opts || {};
    var C = GAME.CONFIG.COLORS;
    var A = GAME.CONFIG.ARENA;
    var Iso = GAME.Iso;
    var R = Iso.screenRect();

    g.fillStyle(C.arenaFill, 1);
    g.fillRect(R.x, R.y, R.w, R.h);

    if (opts.zones) {
      var zs = GAME.CONFIG.ZONE_STRATEGIST;
      var zc = GAME.CONFIG.ZONE_CONTROLLER;
      g.fillStyle(C.zoneStrategist, 0.55);
      g.fillRect(zs.x, Iso.toScreenY(zs.y), zs.w, zs.h * Iso.TILT);
      g.fillStyle(C.zoneController, 0.55);
      g.fillRect(zc.x, Iso.toScreenY(zc.y), zc.w, zc.h * Iso.TILT);
    }

    // 안쪽으로 갈수록(위쪽) 어둡게 — 거리감
    var bands = 6;
    for (var b = 0; b < bands; b++) {
      var y0 = A.y + (A.h / bands) * b;
      var alpha = 0.16 * (1 - b / bands);
      g.fillStyle(0x000000, alpha);
      g.fillRect(A.x, Iso.toScreenY(y0), A.w, (A.h / bands) * Iso.TILT + 1);
    }

    // 격자 — y 간격이 압축되어 자연히 원근처럼 보인다
    g.lineStyle(1, C.arenaLine, 0.3);
    for (var gx = A.x + 80; gx < A.right; gx += 80) {
      g.lineBetween(gx, R.y, gx, R.bottom);
    }
    for (var gy = A.y + 80; gy < A.bottom; gy += 80) {
      var sy = Iso.toScreenY(gy);
      g.lineBetween(A.x, sy, A.right, sy);
    }

    g.lineStyle(2, C.arenaLine, 1);
    g.strokeRect(R.x, R.y, R.w, R.h);
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
