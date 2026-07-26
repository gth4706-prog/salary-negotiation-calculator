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

  // ── 유닛 (지면 그림자 + 세워진 몸통) ────────────────────────
  // worldX/worldY 는 평면 좌표. 변환은 여기서만 일어난다.
  drawUnit: function (g, def, worldX, worldY, color, alpha) {
    var Iso = GAME.Iso;
    var sx = worldX;
    var sy = Iso.toScreenY(worldY);
    var r = def.radius;
    var lift = r * Iso.LIFT;
    var a = alpha === undefined ? 1 : alpha;

    // 지면 그림자
    g.fillStyle(0x000000, 0.32 * a);
    g.fillEllipse(sx, sy, r * 2.1, r * 2.1 * Iso.TILT);

    var by = sy - lift;

    // 몸통을 지면과 잇는 기둥 — 높이감
    g.fillStyle(color, 0.28 * a);
    g.fillRect(sx - r * 0.30, by, r * 0.60, lift);

    g.fillStyle(color, a);
    if (def.shape === 'square') {
      g.fillRect(sx - r, by - r, r * 2, r * 2);
    } else if (def.shape === 'triangle') {
      g.fillTriangle(sx, by - r, sx - r, by + r * 0.8, sx + r, by + r * 0.8);
    } else if (def.shape === 'diamond') {
      g.fillPoints([
        { x: sx, y: by - r }, { x: sx + r, y: by },
        { x: sx, y: by + r }, { x: sx - r, y: by }
      ], true);
    } else {
      var pts = [];
      for (var i = 0; i < 6; i++) {
        var ang = (Math.PI / 3) * i - Math.PI / 2;
        pts.push({ x: sx + Math.cos(ang) * r, y: by + Math.sin(ang) * r });
      }
      g.fillPoints(pts, true);
    }

    return { sx: sx, sy: sy, by: by };
  },

  // 팔레트/상점처럼 화면 좌표에 바로 그려야 할 때(투영 없음)
  drawUnitFlat: function (g, def, sx, sy, color, alpha) {
    var r = def.radius;
    g.fillStyle(color, alpha === undefined ? 1 : alpha);
    if (def.shape === 'square') {
      g.fillRect(sx - r, sy - r, r * 2, r * 2);
    } else if (def.shape === 'triangle') {
      g.fillTriangle(sx, sy - r, sx - r, sy + r * 0.8, sx + r, sy + r * 0.8);
    } else if (def.shape === 'diamond') {
      g.fillPoints([
        { x: sx, y: sy - r }, { x: sx + r, y: sy },
        { x: sx, y: sy + r }, { x: sx - r, y: sy }
      ], true);
    } else {
      var pts = [];
      for (var i = 0; i < 6; i++) {
        var ang = (Math.PI / 3) * i - Math.PI / 2;
        pts.push({ x: sx + Math.cos(ang) * r, y: sy + Math.sin(ang) * r });
      }
      g.fillPoints(pts, true);
    }
  },

  // 지면에 눕힌 원 (스킬 범위·예고·덫 표시)
  groundCircle: function (g, worldX, worldY, radius) {
    var Iso = GAME.Iso;
    g.strokeEllipse(worldX, Iso.toScreenY(worldY), radius * 2, radius * 2 * Iso.TILT);
  },

  groundCircleFill: function (g, worldX, worldY, radius) {
    var Iso = GAME.Iso;
    g.fillEllipse(worldX, Iso.toScreenY(worldY), radius * 2, radius * 2 * Iso.TILT);
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
