window.GAME = window.GAME || {};

// 전체 화면 선택 팝업.
//
// 왜 필요한가: 세로 폰(420×900)에 영웅 3종 + 장비 12종 + 스킬 12종을 한 화면에 쌓으면
// 행 높이가 20px 대로 내려가 글자가 서로 붙는다. 폰트를 읽히는 크기(설계 18px)로 올리면
// 물리적으로 안 들어간다. 그래서 **한 번에 하나씩 팝업으로 고르게** 한다.
//
// 규격 근거: Material 탭 타깃 48dp, Apple HIG 44pt → 큰 쪽을 따라 행 높이를 잡는다.
GAME.Modal = {
  active: null,

  isOpen: function () { return !!this.active; },

  // items: [{ key, name, note, cost, disabled, selected }]
  // opts.onPick(it) — 항목을 골랐을 때만. opts.onClose() — 닫기/배경 탭으로 **고르지 않고**
  // 닫았을 때만(둘 다 안 겹친다). 순차 팝업 체인(도전 진입 스킬 선택 등)이 "안 골라도
  // 다음 단계로 진행"하려면 onClose 도 반드시 넘길 것 — 안 그러면 사용자가 팝업을 닫는
  // 순간 흐름이 거기서 멈춘다.
  open: function (scene, opts) {
    this.close();
    var C = GAME.CONFIG.COLORS;
    var UI = GAME.UI;
    var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
    var P = GAME.CONFIG.PORTRAIT;
    var self = this;
    var objs = [];

    var items = opts.items || [];
    var rowH = Math.max(UI.TAP || 52, P ? 64 : 56);
    var gap = 8;
    var pad = P ? 14 : 24;
    var panelW = Math.min(W - pad * 2, 520);
    var titleH = P ? 44 : 48;
    var closeH = UI.BTN_H || 52;
    //  ── 세로로 안 들어가면 **2열로 접는다** (2026-08-23) ────────────────────────
    //  폰 가로(높이 390)에서 설정 항목이 5개가 되자 '닫기'가 화면 밖으로 밀렸다
    //  (겹침 감사 '잘림'이 잡음). 행 높이를 깎는 길은 터치 타깃 44px 를 깨므로
    //  높이 대신 **폭**을 쓴다 — 폰 가로는 옆이 남는 화면이다.
    var cols = 1;
    var rows = items.length;
    var fitH = function (r) { return titleH + r * rowH + (r - 1) * gap + closeH + 34 <= H - 24; };
    if (items.length > 1 && !fitH(rows)) {
      cols = 2;
      rows = Math.ceil(items.length / 2);
      panelW = Math.min(W - pad * 2, 820);
    }
    var listH = rows * rowH + (rows - 1) * gap;
    var panelH = titleH + listH + closeH + 34;
    var panelY = Math.max(12, (H - panelH) / 2);
    var px = (W - panelW) / 2;
    var colW = (panelW - 24 - (cols - 1) * 10) / cols;

    // 배경 — 뒤 화면을 눌러도 팝업이 먹는다(오조작 방지)
    var veil = scene.add.rectangle(W / 2, H / 2, W, H, 0x05050a, 0.78).setDepth(1000);
    veil.setInteractive();
    veil.on('pointerdown', function () { self.close(); if (opts.onClose) opts.onClose(); });
    objs.push(veil);

    //  ── 양피지 패널 (2026-08-31 비주얼 개편) — 버튼과 같은 언어: 그림자·투톤·
    //  잉크 테두리·제목 띠. 평면 사각형이 "웹페이지" 느낌의 뿌리였다.
    var pg = scene.add.graphics().setDepth(1001);
    //  ⚠ UI.shade 를 쓰면 안 된다 — 테마가 톤표 조회형으로 덮어써서 표에 없는 색은
    //    범위 밖 값(7자리 hex)이 나온다(실측: 형광 청록 패널 사고). 순수 산수로 계산.
    var msh = function (c, amt) {
      var r = Math.max(0, Math.min(255, ((c >> 16) & 255) + Math.round(255 * amt)));
      var g = Math.max(0, Math.min(255, ((c >> 8) & 255) + Math.round(255 * amt)));
      var b = Math.max(0, Math.min(255, (c & 255) + Math.round(255 * amt)));
      return (r << 16) | (g << 8) | b;
    };
    var pBase = UI.IS_LIGHT ? 0xf2e6c6 : UI.COL.surface;
    var pInk = UI.IS_LIGHT ? 0x3a2c18 : 0x07070d;
    var pl = W / 2 - panelW / 2;
    pg.fillStyle(pInk, 0.40);
    pg.fillRoundedRect(pl + 3, panelY + 5, panelW, panelH, 14);
    pg.fillStyle(msh(pBase, -0.06), 1);
    pg.fillRoundedRect(pl, panelY, panelW, panelH, 14);
    pg.fillStyle(msh(pBase, 0.08), 1);
    pg.fillRoundedRect(pl, panelY, panelW, Math.max(28, panelH * 0.16),
      { tl: 14, tr: 14, bl: 0, br: 0 });
    //  제목 띠 — 현수막처럼 어두운 가죽색 밴드
    pg.fillStyle(UI.IS_LIGHT ? 0x6b543a : 0x2e2e40, 1);
    pg.fillRoundedRect(pl, panelY, panelW, titleH - 4, { tl: 14, tr: 14, bl: 0, br: 0 });
    pg.lineStyle(2, msh(pInk, 0.12), 1);
    pg.strokeRoundedRect(pl, panelY, panelW, panelH, 14);
    objs.push(pg);

    objs.push(UI.label(scene, W / 2, panelY + 12, opts.title || '선택',
      'subhead', UI.IS_LIGHT ? '#fff6e2' : C.text, 0.5)
      .setOrigin(0.5, 0).setDepth(1002));

    var y = panelY + titleH;
    items.forEach(function (it, i) {
      //  2열이면 읽는 순서대로 좌→우, 위→아래로 놓는다.
      var ci = i % cols, rI = Math.floor(i / cols);
      var cellW = cols === 1 ? panelW - 24 : colW;
      var cx = cols === 1 ? W / 2 : px + 12 + ci * (colW + 10) + colW / 2;
      var ry = y + rI * (rowH + gap);
      var fill = it.selected ? UI.COL.panelTeal : UI.COL.surfaceAlt;
      var line = it.selected ? C.controller : UI.COL.borderUi;
      var row = scene.add.rectangle(cx, ry + rowH / 2, cellW, rowH, fill)
        .setStrokeStyle(it.selected ? 2 : 1, line).setDepth(1002);
      if (it.disabled) row.setAlpha(0.4);
      else {
        row.setInteractive({ useHandCursor: true });
        row.on('pointerdown', function (p) {
          if (p && p.event && p.event.stopPropagation) p.event.stopPropagation();
          self.close();
          if (opts.onPick) opts.onPick(it);
        });
      }
      objs.push(row);

      var lx = cx - cellW / 2 + (cols === 1 ? 12 : 14);
      objs.push(UI.label(scene, lx, ry + (it.note ? 8 : rowH / 2 - 12), it.name,
        'subhead', it.disabled ? C.textDim : C.text, 0).setDepth(1003));
      if (it.note) {
        objs.push(UI.label(scene, lx, ry + rowH - 26, it.note, 'caption', C.textDim, 0)
          .setDepth(1003).setWordWrapWidth(cellW - 96));
      }
      if (it.cost !== undefined && it.cost !== null) {
        objs.push(UI.label(scene, cx + cellW / 2 - 12, ry + rowH / 2, String(it.cost),
          'num', it.disabled ? C.textDim : C.accent, 1).setOrigin(1, 0.5).setDepth(1003));
      }
    });

    var cy = y + listH + 16;
    var cb = UI.button(scene, W / 2, cy + closeH / 2, Math.min(panelW - 24, 260), closeH,
      '닫기', function () { self.close(); if (opts.onClose) opts.onClose(); }, { fontSize: 'button' });
    cb.rect.setDepth(1002); cb.text.setDepth(1003);
    if (cb.gfx) cb.gfx.setDepth(1002);
    objs.push(cb.rect, cb.text);
    if (cb.gfx) objs.push(cb.gfx);

    this.active = { scene: scene, objs: objs };
    return this.active;
  },

  close: function () {
    if (!this.active) return;
    var o = this.active.objs;
    for (var i = 0; i < o.length; i++) if (o[i] && o[i].destroy) o[i].destroy();
    this.active = null;
  }
};
