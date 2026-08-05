window.GAME = window.GAME || {};

// ============================================================================
//  이어하기 화면 (2026-08-05)
//
//  Phaser 캔버스에는 **텍스트 입력이 없다.** 그래서 `js/scenes/login.js` 와 같은 방식
//  으로 캔버스 위에 DOM 판을 겹친다. 여기서는 긴 코드를 통째로 보여 주고 받아야 해서
//  `<textarea>` 가 꼭 필요하다 — Modal(버튼 목록)로는 안 된다.
//
//  ⚠ 색은 **테마 토큰에서 가져온다**. 하드코딩하면 라이트 테마(크림)에서 이 판만
//    홀로 검게 뜬다(login.js 가 같은 이유로 그렇게 한다).
//  ⚠ 씬을 떠날 때 반드시 지운다. 안 지우면 DOM 판이 다음 화면 위에 그대로 남는다.
// ============================================================================
GAME.TransferUI = {
  _wrap: null,

  _hx: function (n) { return '#' + ('000000' + (n >>> 0).toString(16)).slice(-6); },

  close: function () {
    if (this._wrap && this._wrap.parentNode) this._wrap.parentNode.removeChild(this._wrap);
    this._wrap = null;
    if (this._onResize) { window.removeEventListener('resize', this._onResize); this._onResize = null; }
  },

  //  mode: 'export' | 'import'
  open: function (scene, mode, onDone) {
    this.close();
    var self = this;
    var C = GAME.CONFIG.COLORS, COL = GAME.UI.COL, hx = this._hx;
    var bg = hx(COL.surface), line = hx(COL.borderUi), text = C.text;
    var inBg = hx(COL.surfaceAlt);
    var btnBg = hx(COL.panelTeal), btnLine = hx(C.controller || COL.controller), btnText = C.accent;

    var wrap = document.createElement('div');
    wrap.id = 'transfer-ui';
    wrap.style.cssText =
      'position:fixed;z-index:40;box-sizing:border-box;display:flex;flex-direction:column;' +
      'background:' + bg + ';border:2px solid ' + line + ';border-radius:12px;' +
      'font-family:var(--egg-font);color:' + text + ';overflow:hidden;';

    var title = document.createElement('div');
    var body = document.createElement('div');
    var area = document.createElement('textarea');
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;';

    area.style.cssText =
      'font-family:ui-monospace,Menlo,Consolas,monospace;box-sizing:border-box;width:100%;' +
      'border-radius:8px;border:1px solid ' + line + ';background:' + inBg + ';color:' + text +
      ';outline:none;resize:none;word-break:break-all;';

    function mkBtn(label, primary) {
      var b = document.createElement('button');
      b.textContent = label;
      b.style.cssText =
        'font-family:var(--egg-font);box-sizing:border-box;white-space:nowrap;flex:1;' +
        'border-radius:8px;cursor:pointer;border:1px solid ' +
        (primary ? btnLine : line) + ';background:' + (primary ? btnBg : inBg) +
        ';color:' + (primary ? btnText : text) + ';';
      return b;
    }

    var note = document.createElement('div');
    note.style.cssText = 'opacity:0.75;line-height:1.5;';

    if (mode === 'export') {
      var code = GAME.Transfer.make();
      title.textContent = '이어하기 코드';
      if (!code) {
        body.textContent = '옮길 진행이 없습니다.';
        area.style.display = 'none';
      }
      area.value = code || '';
      area.readOnly = true;
      //  ⚠ 코드를 가진 사람은 이 진행을 그대로 가져간다. 반드시 말해 준다.
      note.textContent = '다른 기기의 「코드 붙여넣기」에 넣으세요. ' +
                         '이 코드를 가진 사람은 누구나 이 진행을 가져갈 수 있으니 남에게 보이지 마세요.';
      var copyBtn = mkBtn('복사', true);
      copyBtn.onclick = function () {
        area.focus(); area.select();
        var done = function () { copyBtn.textContent = '복사됨'; };
        //  ⚠ `navigator.clipboard` 는 안전한 문맥에서만 되고 거부될 수 있다.
        //    실패하면 옛 방식으로 한 번 더 — 여기서 못 복사하면 기능 자체가 무의미하다.
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(area.value).then(done, function () {
            try { document.execCommand('copy'); done(); }
            catch (e) { copyBtn.textContent = '길게 눌러 복사'; }
          });
        } else {
          try { document.execCommand('copy'); done(); }
          catch (e) { copyBtn.textContent = '길게 눌러 복사'; }
        }
      };
      var closeBtn = mkBtn('닫기');
      closeBtn.onclick = function () { self.close(); if (onDone) onDone(false); };
      row.appendChild(copyBtn); row.appendChild(closeBtn);
    } else {
      title.textContent = '코드 붙여넣기';
      area.placeholder = 'EGGWAR1:... 로 시작하는 코드를 붙여넣으세요';
      note.textContent = '이 기기의 같은 닉네임 진행은 덮어써집니다.';
      var okBtn = mkBtn('불러오기', true);
      okBtn.onclick = function () {
        var r = GAME.Transfer.read(area.value);
        if (!r.ok) { note.textContent = '⚠ ' + r.why; note.style.opacity = '1'; return; }
        //  ⚠ **덮어쓰기 전에 무엇이 들어오는지 보여 주고 확인을 받는다.**
        //    이 기기에 같은 닉네임 진행이 있으면 그대로 사라진다.
        note.textContent = '';
        body.textContent = r.data && GAME.Transfer.summary(r.data);
        area.style.display = 'none';
        row.innerHTML = '';
        var yes = mkBtn('이 진행으로 덮어쓰기', true);
        yes.onclick = function () {
          GAME.Transfer.apply(r.data);
          self.close();
          if (onDone) onDone(true);
        };
        var no = mkBtn('취소');
        no.onclick = function () { self.close(); if (onDone) onDone(false); };
        row.appendChild(yes); row.appendChild(no);
        place();
      };
      var cancelBtn = mkBtn('닫기');
      cancelBtn.onclick = function () { self.close(); if (onDone) onDone(false); };
      row.appendChild(okBtn); row.appendChild(cancelBtn);
    }

    wrap.appendChild(title); wrap.appendChild(body);
    wrap.appendChild(area); wrap.appendChild(note); wrap.appendChild(row);
    document.body.appendChild(wrap);
    this._wrap = wrap;

    //  설계 px → 캔버스 실제 배율로 굴린다(login.js 와 같은 규율).
    //  고정 px 를 쓰면 폰마다 캔버스 배율과 따로 놀아 판이 화면을 넘친다.
    function place() {
      var canvas = document.querySelector('#game canvas');
      if (!canvas) return;
      var r = canvas.getBoundingClientRect();
      var sx = r.width / GAME.CONFIG.WIDTH;
      function px(v) { return Math.round(v * sx) + 'px'; }
      var w = Math.min(GAME.CONFIG.WIDTH - 40, 520);
      wrap.style.width = px(w);
      wrap.style.padding = px(16);
      wrap.style.gap = px(10);
      wrap.style.fontSize = px(15);
      title.style.fontSize = px(20);
      body.style.fontSize = px(15);
      note.style.fontSize = px(13);
      area.style.height = px(area.style.display === 'none' ? 0 : 96);
      area.style.fontSize = px(12);
      area.style.padding = px(8);
      var bs = row.querySelectorAll('button');
      for (var i = 0; i < bs.length; i++) {
        bs[i].style.height = px(46);
        bs[i].style.fontSize = px(15);
      }
      //  판 크기가 정해진 뒤에 가운데로. 먼저 놓으면 높이를 몰라 위로 쏠린다.
      var rect = wrap.getBoundingClientRect();
      wrap.style.left = Math.round(r.left + (r.width - rect.width) / 2) + 'px';
      wrap.style.top = Math.round(r.top + Math.max(8 * sx, (r.height - rect.height) / 2)) + 'px';
    }
    place();
    //  두 번 부른다 — 첫 호출 때는 아직 글자 줄바꿈이 안 잡혀 높이가 덜 나온다.
    setTimeout(place, 0);
    this._onResize = place;
    window.addEventListener('resize', place);

    //  씬을 떠나면 같이 사라진다(남으면 다음 화면 위에 떠 있다).
    if (scene && scene.events) scene.events.once('shutdown', function () { self.close(); });
  }
};
