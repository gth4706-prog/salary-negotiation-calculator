window.GAME = window.GAME || {};

// HUD 좌표를 계산으로 만든다. 좌표를 손으로 박아넣으면 화면 크기가 바뀌거나
// 문구가 길어질 때 겹침이 반복해서 생긴다 — 그래서 '행'과 '열'을 여기서 배분한다.
GAME.Layout = {
  // 아레나 아래에서 시작하는 HUD 영역
  hud: function () {
    var top = GAME.Iso.screenRect().bottom + 8;
    return {
      top: top,
      h: GAME.CONFIG.HEIGHT - top,
      w: GAME.CONFIG.WIDTH,
      pad: GAME.CONFIG.PORTRAIT ? 12 : 24
    };
  },

  // 세로로 쌓이는 행. 각 행은 높이 + 아래 여백을 갖고, 다음 행은 그만큼 밀린다.
  rows: function (specs) {
    var y = this.hud().top;
    var out = {};
    for (var i = 0; i < specs.length; i++) {
      var s = specs[i];
      out[s.name] = { y: y, h: s.h, cy: y + s.h / 2, bottom: y + s.h };
      y += s.h + (s.gap === undefined ? 8 : s.gap);
    }
    out._end = y;
    return out;
  },

  // 가로로 균등 분할된 칸. 폭이 좁으면 자동으로 칸 크기를 줄인다.
  cols: function (count, opts) {
    opts = opts || {};
    var hud = this.hud();
    var pad = opts.pad === undefined ? hud.pad : opts.pad;
    var gap = opts.gap === undefined ? 8 : opts.gap;
    var avail = (opts.width === undefined ? hud.w : opts.width) - pad * 2;
    var w = Math.floor((avail - gap * (count - 1)) / count);
    if (opts.max && w > opts.max) w = opts.max;
    var total = w * count + gap * (count - 1);
    var startX = (opts.left === undefined)
      ? Math.round(((opts.width === undefined ? hud.w : opts.width) - total) / 2)
      : opts.left;
    var out = [];
    for (var i = 0; i < count; i++) {
      var x = startX + i * (w + gap);
      out.push({ x: x, w: w, cx: x + w / 2, right: x + w });
    }
    out.itemW = w;
    return out;
  }
};
