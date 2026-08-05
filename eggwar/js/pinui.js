window.GAME = window.GAME || {};

// ============================================================================
//  PIN 입력 판 (2026-08-05)
//
//  Phaser 캔버스에 텍스트 입력이 없어 DOM 을 겹친다(`js/transferui.js` 와 같은 이유).
//  ⚠ 색은 테마 토큰에서 가져온다(하드코딩하면 라이트 테마에서 이 판만 검게 뜬다).
//  ⚠ 크기를 캔버스 배율로 굴린다(고정 px 면 폰마다 판이 화면을 넘친다).
//  ⚠ 씬을 떠날 때 지운다.
//
//  ⚠ `inputmode="numeric"` + `type="tel"` 을 쓴다. `type="number"` 는 스피너가
//    붙고 앞자리 0 을 흘리며(0012 → 12) 브라우저마다 다르게 군다 — PIN 에는 최악이다.
// ============================================================================
GAME.PinUI = {
  _wrap: null,

  close: function () {
    if (this._wrap && this._wrap.parentNode) this._wrap.parentNode.removeChild(this._wrap);
    this._wrap = null;
    if (this._onResize) { window.removeEventListener('resize', this._onResize); this._onResize = null; }
  },

  //  opts: { title, note, confirm, second(두 번째 칸 라벨), onSubmit(pin, say, done, pin2), onCancel }
  open: function (scene, opts) {
    this.close();
    var self = this;
    opts = opts || {};
    var C = GAME.CONFIG.COLORS, COL = GAME.UI.COL;
    function hx(n) { return '#' + ('000000' + (n >>> 0).toString(16)).slice(-6); }
    var bg = hx(COL.surface), line = hx(COL.borderUi), text = C.text;
    var inBg = hx(COL.surfaceAlt);
    var btnBg = hx(COL.panelTeal), btnLine = hx(C.controller || COL.controller), btnText = C.accent;

    var wrap = document.createElement('div');
    wrap.id = 'pin-ui';
    wrap.style.cssText =
      'position:fixed;z-index:45;box-sizing:border-box;display:flex;flex-direction:column;' +
      'background:' + bg + ';border:2px solid ' + line + ';border-radius:12px;' +
      'font-family:var(--egg-font);color:' + text + ';';

    var title = document.createElement('div');
    title.textContent = opts.title || 'PIN';
    var note = document.createElement('div');
    note.textContent = opts.note || '';
    note.style.cssText = 'opacity:0.78;line-height:1.5;';

    function mkInput(ph) {
      var i = document.createElement('input');
      i.type = 'tel';
      i.inputMode = 'numeric';
      i.autocomplete = 'off';
      i.maxLength = 4;
      i.placeholder = ph;
      i.style.cssText =
        'font-family:ui-monospace,Menlo,Consolas,monospace;box-sizing:border-box;width:100%;' +
        'letter-spacing:0.4em;text-align:center;' +
        'border-radius:8px;border:1px solid ' + line + ';background:' + inBg + ';color:' + text + ';outline:none;';
      //  숫자만 남긴다 — 붙여넣기·한글 IME 로 다른 글자가 들어올 수 있다.
      i.addEventListener('input', function () { i.value = i.value.replace(/[^0-9]/g, '').slice(0, 4); });
      i.addEventListener('keydown', function (e) { e.stopPropagation(); });   // 게임 키로 안 새게
      return i;
    }
    var in1 = mkInput('숫자 4자리');
    var in2 = opts.second ? mkInput(opts.second) : null;

    var say = document.createElement('div');
    say.style.cssText = 'min-height:1.4em;line-height:1.4;color:' + (C.warn || '#f0a86a') + ';';

    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;';
    function mkBtn(label, primary) {
      var b = document.createElement('button');
      b.textContent = label;
      b.style.cssText =
        'font-family:var(--egg-font);box-sizing:border-box;white-space:nowrap;flex:1;' +
        'border-radius:8px;cursor:pointer;border:1px solid ' + (primary ? btnLine : line) +
        ';background:' + (primary ? btnBg : inBg) + ';color:' + (primary ? btnText : text) + ';';
      return b;
    }
    function setSay(t) { say.textContent = t || ''; }
    var okBtn = mkBtn(opts.confirm || '확인', true);
    okBtn.onclick = function () {
      var a = in1.value, b = in2 ? in2.value : null;
      if (!GAME.Auth.isPin(a) || (in2 && !GAME.Auth.isPin(b))) {
        setSay('⚠ 숫자 4자리를 입력해 주세요.'); return;
      }
      if (in2 && a !== b) { setSay('⚠ 두 칸이 서로 다릅니다.'); return; }
      if (opts.onSubmit) opts.onSubmit(a, setSay, function () { self.close(); }, b);
    };
    var noBtn = mkBtn('취소');
    noBtn.onclick = function () { self.close(); if (opts.onCancel) opts.onCancel(); };
    row.appendChild(okBtn); row.appendChild(noBtn);

    in1.addEventListener('keydown', function (e) { if (e.key === 'Enter') okBtn.click(); });
    if (in2) in2.addEventListener('keydown', function (e) { if (e.key === 'Enter') okBtn.click(); });

    wrap.appendChild(title); wrap.appendChild(note); wrap.appendChild(in1);
    if (in2) wrap.appendChild(in2);
    wrap.appendChild(say); wrap.appendChild(row);
    document.body.appendChild(wrap);
    this._wrap = wrap;

    function place() {
      var canvas = document.querySelector('#game canvas');
      if (!canvas) return;
      var r = canvas.getBoundingClientRect();
      var sx = r.width / GAME.CONFIG.WIDTH;
      function px(v) { return Math.round(v * sx) + 'px'; }
      var w = Math.min(GAME.CONFIG.WIDTH - 40, 400);
      wrap.style.width = px(w);
      wrap.style.padding = px(16);
      wrap.style.gap = px(9);
      title.style.fontSize = px(19);
      note.style.fontSize = px(13);
      say.style.fontSize = px(13);
      [in1, in2].forEach(function (i) {
        if (!i) return;
        i.style.height = px(46); i.style.fontSize = px(20);
      });
      var bs = row.querySelectorAll('button');
      for (var k = 0; k < bs.length; k++) { bs[k].style.height = px(46); bs[k].style.fontSize = px(15); }
      var rect = wrap.getBoundingClientRect();
      wrap.style.left = Math.round(r.left + (r.width - rect.width) / 2) + 'px';
      wrap.style.top = Math.round(r.top + Math.max(8 * sx, (r.height - rect.height) / 2)) + 'px';
    }
    place();
    setTimeout(place, 0);
    this._onResize = place;
    window.addEventListener('resize', place);
    setTimeout(function () { try { in1.focus(); } catch (e) {} }, 30);

    if (scene && scene.events) scene.events.once('shutdown', function () { self.close(); });
  }
};
