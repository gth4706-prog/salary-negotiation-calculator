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
    var listH = items.length * rowH + (items.length - 1) * gap;
    var panelH = titleH + listH + closeH + 34;
    var panelY = Math.max(20, (H - panelH) / 2);
    var px = (W - panelW) / 2;

    // 배경 — 뒤 화면을 눌러도 팝업이 먹는다(오조작 방지)
    var veil = scene.add.rectangle(W / 2, H / 2, W, H, 0x05050a, 0.78).setDepth(1000);
    veil.setInteractive();
    veil.on('pointerdown', function () { self.close(); });
    objs.push(veil);

    var panel = scene.add.rectangle(W / 2, panelY, panelW, panelH, 0x1a1a26)
      .setOrigin(0.5, 0).setStrokeStyle(2, 0x4a4a68).setDepth(1001);
    objs.push(panel);

    objs.push(UI.label(scene, W / 2, panelY + 12, opts.title || '선택',
      'subhead', C.text, 0.5).setOrigin(0.5, 0).setDepth(1002));

    var y = panelY + titleH;
    items.forEach(function (it, i) {
      var ry = y + i * (rowH + gap);
      var fill = it.selected ? 0x1c3a34 : 0x242433;
      var line = it.selected ? 0x35d0a5 : 0x3a3a52;
      var row = scene.add.rectangle(W / 2, ry + rowH / 2, panelW - 24, rowH, fill)
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

      var lx = px + 24;
      objs.push(UI.label(scene, lx, ry + (it.note ? 8 : rowH / 2 - 12), it.name,
        'subhead', it.disabled ? C.textDim : C.text, 0).setDepth(1003));
      if (it.note) {
        objs.push(UI.label(scene, lx, ry + rowH - 26, it.note, 'caption', C.textDim, 0)
          .setDepth(1003).setWordWrapWidth(panelW - 120));
      }
      if (it.cost !== undefined && it.cost !== null) {
        objs.push(UI.label(scene, px + panelW - 24, ry + rowH / 2, String(it.cost),
          'num', it.disabled ? C.textDim : C.accent, 1).setOrigin(1, 0.5).setDepth(1003));
      }
    });

    var cy = y + listH + 16;
    var cb = UI.button(scene, W / 2, cy + closeH / 2, Math.min(panelW - 24, 260), closeH,
      '닫기', function () { self.close(); }, { fontSize: 'button' });
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
