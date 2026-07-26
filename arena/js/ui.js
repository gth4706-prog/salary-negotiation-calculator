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

  // 몸통 실루엣. 유닛 종류를 형태로 구분한다(색은 진영을 나타내므로 쓸 수 없다).
  // fillStyle 은 호출부에서 미리 지정해둔 상태로 들어온다.
  bodyShape: function (g, shape, sx, by, r) {
    var i, ang, pts;

    if (shape === 'square') {
      g.fillRect(sx - r, by - r, r * 2, r * 2);

    } else if (shape === 'triangle') {
      g.fillTriangle(sx, by - r, sx - r, by + r * 0.8, sx + r, by + r * 0.8);

    } else if (shape === 'diamond') {
      g.fillPoints([
        { x: sx, y: by - r }, { x: sx + r, y: by },
        { x: sx, y: by + r }, { x: sx - r, y: by }
      ], true);

    } else if (shape === 'cross') {
      // 위생병 — 십자
      var t = r * 0.42;
      g.fillRect(sx - t, by - r, t * 2, r * 2);
      g.fillRect(sx - r, by - t, r * 2, t * 2);

    } else if (shape === 'shield') {
      // 방탄병 — 아래가 뾰족한 방패꼴
      g.fillPoints([
        { x: sx - r, y: by - r * 0.85 }, { x: sx + r, y: by - r * 0.85 },
        { x: sx + r * 0.8, y: by + r * 0.45 }, { x: sx, y: by + r },
        { x: sx - r * 0.8, y: by + r * 0.45 }
      ], true);

    } else if (shape === 'star') {
      // 분대장 — 계급장 느낌의 별
      pts = [];
      for (i = 0; i < 10; i++) {
        ang = (Math.PI / 5) * i - Math.PI / 2;
        var rr = (i % 2 === 0) ? r : r * 0.45;
        pts.push({ x: sx + Math.cos(ang) * rr, y: by + Math.sin(ang) * rr });
      }
      g.fillPoints(pts, true);

    } else if (shape === 'bunker') {
      // 기관총 진지 — 낮고 넓은 사대
      g.fillRect(sx - r * 1.15, by - r * 0.5, r * 2.3, r * 1.5);
      g.fillRect(sx - r * 0.5, by - r, r, r * 0.6);

    } else if (shape === 'mine') {
      // 발목지뢰 — 납작한 원반에 신관
      g.fillEllipse(sx, by + r * 0.3, r * 2, r * 1.1);
      g.fillRect(sx - r * 0.14, by - r * 0.5, r * 0.28, r * 0.8);

    } else {
      pts = [];
      for (i = 0; i < 6; i++) {
        ang = (Math.PI / 3) * i - Math.PI / 2;
        pts.push({ x: sx + Math.cos(ang) * r, y: by + Math.sin(ang) * r });
      }
      g.fillPoints(pts, true);
    }
  },

  // 무기 실루엣 — 유닛이 뭘 들었는지 한눈에 보이게. facing 방향으로 뻗는다.
  drawWeapon: function (g, kind, sx, by, r, facing, color, alpha) {
    if (!kind) return;
    var a = alpha === undefined ? 1 : alpha;
    var Iso = GAME.Iso;
    // 화면상 방향 — y는 압축되어 있으므로 같은 비율로 눕힌다
    var fx = Math.cos(facing), fy = Math.sin(facing) * Iso.TILT;
    var px = -fy, py = fx;   // 수직 방향
    var hx = sx + fx * r * 0.85, hy = by + fy * r * 0.85;   // 손 위치

    if (kind === 'bayonet') {
      // 대검 — 짧고 굵은 칼
      g.lineStyle(4, 0xdfe4ee, a);
      g.lineBetween(hx, hy, hx + fx * r * 1.25, hy + fy * r * 1.25);
      g.lineStyle(3, 0x6b7280, a);
      g.lineBetween(hx - px * r * 0.3, hy - py * r * 0.3, hx + px * r * 0.3, hy + py * r * 0.3);

    } else if (kind === 'rifle') {
      // K2 소총 — 총열 + 개머리판
      g.lineStyle(3.5, 0x3d4350, a);
      g.lineBetween(hx - fx * r * 0.6, hy - fy * r * 0.6, hx + fx * r * 1.7, hy + fy * r * 1.7);
      g.lineStyle(3, 0x2a2f3a, a);
      g.lineBetween(hx - fx * r * 0.9 - px * r * 0.25, hy - fy * r * 0.9 - py * r * 0.25,
                    hx - fx * r * 0.3, hy - fy * r * 0.3);

    } else if (kind === 'sniperRifle') {
      // K14 저격총 — 길고 조준경
      g.lineStyle(3.5, 0x2f3442, a);
      g.lineBetween(hx - fx * r * 0.7, hy - fy * r * 0.7, hx + fx * r * 2.3, hy + fy * r * 2.3);
      g.fillStyle(0xf0a86a, a);
      g.fillCircle(hx + fx * r * 0.5, hy + fy * r * 0.5 - r * 0.4, r * 0.22);
      g.lineStyle(2, 0x555b6a, a);
      g.lineBetween(hx + fx * r * 1.2, hy + fy * r * 1.2 + r * 0.3,
                    hx + fx * r * 1.5, hy + fy * r * 1.5 + r * 0.7);

    } else if (kind === 'launcher') {
      // K201 유탄발사기 — 굵은 통
      g.lineStyle(6, 0x4a5540, a);
      g.lineBetween(hx - fx * r * 0.3, hy - fy * r * 0.3, hx + fx * r * 1.4, hy + fy * r * 1.4);
      g.fillStyle(0x9fd0ff, a);
      g.fillCircle(hx + fx * r * 1.5, hy + fy * r * 1.5, r * 0.28);

    } else if (kind === 'mg') {
      // K3 경기관총 — 총열 + 삼각대
      g.lineStyle(5, 0x33384a, a);
      g.lineBetween(hx - fx * r * 0.5, hy - fy * r * 0.5, hx + fx * r * 2.0, hy + fy * r * 2.0);
      g.lineStyle(2.5, 0x4a5060, a);
      g.lineBetween(hx + fx * r * 0.6, hy + fy * r * 0.6, hx + fx * r * 0.6 - px * r * 0.6, hy + fy * r * 0.6 + r * 0.8);
      g.lineBetween(hx + fx * r * 0.6, hy + fy * r * 0.6, hx + fx * r * 0.6 + px * r * 0.6, hy + fy * r * 0.8 + r * 0.8);

    } else if (kind === 'pistol') {
      g.lineStyle(3.5, 0x3d4350, a);
      g.lineBetween(hx, hy, hx + fx * r * 0.9, hy + fy * r * 0.9);

    } else if (kind === 'riotShield') {
      // 방탄 방패 — 몸 앞을 가리는 판
      var shx = sx + fx * r * 0.75, shy = by + fy * r * 0.75;
      g.fillStyle(0x5a6478, a);
      g.fillRoundedRect(shx - r * 0.55, shy - r * 1.0, r * 1.1, r * 2.0, r * 0.25);
      g.lineStyle(2, 0x8fa0bb, a);
      g.strokeRoundedRect(shx - r * 0.55, shy - r * 1.0, r * 1.1, r * 2.0, r * 0.25);

    } else if (kind === 'aidkit') {
      // 위생병 구급낭 — 흰 가방에 적십자
      g.fillStyle(0xf2f5f8, a);
      g.fillRect(hx - r * 0.4, hy - r * 0.35, r * 0.8, r * 0.7);
      g.lineStyle(2.5, 0xe24b4a, a);
      g.lineBetween(hx, hy - r * 0.25, hx, hy + r * 0.25);
      g.lineBetween(hx - r * 0.25, hy, hx + r * 0.25, hy);
    }
  },

  // ── 유닛 (지면 그림자 + 세워진 몸통) ────────────────────────
  // worldX/worldY 는 평면 좌표. 변환은 여기서만 일어난다.
  drawUnit: function (g, def, worldX, worldY, color, alpha, facing) {
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

    // 무기는 몸통 뒤에서 먼저 그려 겹침이 자연스럽게
    if (def.weapon !== undefined && facing !== undefined) {
      this.drawWeapon(g, def.weapon, sx, by, r, facing, color, a);
    }

    g.fillStyle(color, a);
    this.bodyShape(g, def.shape, sx, by, r);

    // 머리 — 도형만으로는 사람처럼 안 보여서 실루엣을 잡아준다
    g.fillStyle(color, a);
    g.fillCircle(sx, by - r * 1.35, r * 0.42);

    return { sx: sx, sy: sy, by: by };
  },

  // 팔레트/상점처럼 화면 좌표에 바로 그려야 할 때(투영 없음)
  drawUnitFlat: function (g, def, sx, sy, color, alpha, scale) {
    var r = def.radius * (scale || 1);
    g.fillStyle(color, alpha === undefined ? 1 : alpha);
    this.bodyShape(g, def.shape, sx, sy, r);
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
