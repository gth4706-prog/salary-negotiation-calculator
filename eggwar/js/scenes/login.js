window.GAME = window.GAME || {};

// ID(닉네임)만 입력하는 로그인. 비밀번호 없음.
// Phaser 캔버스에는 텍스트 입력이 없으므로 DOM input 을 캔버스 위에 겹쳐 쓴다.
GAME.LoginScene = function () {
  Phaser.Scene.call(this, { key: 'Login' });
};
GAME.LoginScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.LoginScene.prototype.constructor = GAME.LoginScene;

GAME.LoginScene.prototype.create = function () {
  if (GAME.Music) GAME.Music.play('lobby');
  var C = GAME.CONFIG.COLORS;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var P = GAME.CONFIG.PORTRAIT;
  var self = this;
  var u = H / 100;   // 세로 1%

  this.cameras.main.setBackgroundColor(C.bg);

  // ── 상단: 간판 ──────────────────────────────────────────────────────────
  //    12%~92% 를 고른 리듬으로 채운다 — 예전엔 상단·중앙에 큰 빈 띠가 남았다.
  // ⚠ **폰 가로(H=390)는 여기서 PC 분기를 타고 있었다.** `P` 는 PORTRAIT 이라
  //   폰 가로면 false → 제목이 50px 로 그려진다. 390px 화면에서 그 크기면 부제와
  //   11px 겹친다(실측). 세로 리듬(u = H/100)도 900px 기준이라 같이 어긋난다.
  //   → 화면이 작으면(SMALL) 제목을 줄이고 부제를 한 칸 내린다.
  var S = GAME.CONFIG.SMALL;
  GAME.UI.label(this, W / 2, u * 15, '🥚 EGG WAR',
    P ? 'display' : (S ? 30 : 50), C.text, 0.5);
  GAME.UI.label(this, W / 2, u * (S ? 24 : 22), '계란 부족 비대칭 실시간 대전',
    P ? 'caption' : (S ? 14 : 18), C.textDim, 0.5);
  if (GAME.UI.titleRule) GAME.UI.titleRule(this, W / 2, u * (S ? 29 : 26), P ? 170 : 240);

  // ── 중앙: 핵심 상호작용 (입력 + 시작) ────────────────────────────────────
  //    입력창은 DOM 이라 캔버스 밖에서 논다. 캔버스 스케일에 맞춰 크기/위치를 잡는다.
  //    아래 안내문은 입력 바로 위에 붙여 '무엇을 하는 칸인지'를 명확히 한다.
  this.inputY = 0.51;      // 캔버스 세로 비율 (place() 와 공유)
  GAME.UI.label(this, W / 2, u * 38, '닉네임을 입력하고 시작하세요', P ? 'subhead' : 18, C.text, 0.5);
  GAME.UI.label(this, W / 2, u * 43,
    '비밀번호는 없습니다. 닉네임이 그대로 랭킹에 표시됩니다.', P ? 'micro' : 13, C.textDim, 0.5)
    .setAlign('center').setWordWrapWidth(W - 48);

  this.msg = GAME.UI.label(this, W / 2, u * 61, '', P ? 'caption' : 14, C.warn, 0.5)
    .setAlign('center').setWordWrapWidth(W - 48);

  // ── 하단: 최근 닉네임 빠른 선택 ──────────────────────────────────────────
  var recent = GAME.Account.list().filter(function (r) { return !r.blocked; }).slice(0, 3);
  if (recent.length) {
    // 버튼(u*78, 높이 52)의 위쪽 경계는 폰에서 y≈278 이다. 라벨을 u*71(=277)에 두면
    // 정확히 물린다(실측 8px) — 한 칸 위로 올린다.
    GAME.UI.label(this, W / 2, u * (S ? 66 : 71), '최근 사용', P ? 'micro' : 13, C.textDim, 0.5);
    // 화면 좌우 여백(pagePad)을 두고 균등 분할 — 예전엔 가장자리에 딱 붙어 잘려 보였다.
    var pad = (GAME.UI.SP && GAME.UI.SP.pagePad) || 16;
    var cols = GAME.Layout.cols(recent.length, { gap: 10, width: W, left: 0, pad: pad });
    var rowH = (GAME.UI.BTN_H_SM || 52);
    for (var i = 0; i < recent.length; i++) {
      (function (rec, idx) {
        GAME.UI.button(self, cols[idx].cx, u * 78, cols[idx].w, rowH, rec.id, function () {
          self._submit(rec.id);
        }, { fontSize: P ? 'buttonSm' : 15 });
      })(recent[i], i);
    }
  }

  // ── 푸터: 안내문 ────────────────────────────────────────────────────────
  GAME.UI.label(this, W / 2, u * 92,
    '닉네임은 관리자가 검토할 수 있으며, 부적절한 닉네임은 차단됩니다.',
    P ? 'micro' : 12, C.textFaint || C.textDim, 0.5)
    .setAlign('center').setWordWrapWidth(W - 48);
  // 버전 표시는 DOM 배지(#ver) 하나로 통일했다 — 캔버스에도 그리면 우하단에서 겹친다.

  this._makeInput();

  this.events.on('shutdown', function () { self._removeInput(); });
};

// 캔버스 스케일에 맞춰 DOM input 을 정확한 위치·크기로 띄운다.
//  고정 220px 를 쓰면 폰마다 캔버스 배율과 따로 놀아 너무 크거나 작아 보였다
//  (시작 버튼이 '시/작' 으로 줄바꿈되던 것도 이 어긋남 때문). 그래서 크기까지
//  캔버스 렌더 배율(sx)로 함께 굴린다 — 설계 px 가 캔버스 글자와 같은 비율로 찍힌다.
GAME.LoginScene.prototype._makeInput = function () {
  var self = this;

  // DOM 입력창/버튼도 활성 테마를 따라간다. Phaser 캔버스 밖(HTML)이라
  // 하드코딩하면 라이트 테마(크림)에서 홀로 검게 뜬다 → 토큰을 CSS 문자열로 변환해 쓴다.
  var C = GAME.CONFIG.COLORS, COL = GAME.UI.COL;
  function hx(n) { return '#' + ('000000' + (n >>> 0).toString(16)).slice(-6); }
  var inBg = hx(COL.surfaceAlt), inLine = hx(COL.borderUi), inText = C.text;
  var btnBg = hx(COL.panelTeal), btnLine = hx(C.controller || COL.controller), btnText = C.accent;

  var wrap = document.createElement('div');
  wrap.id = 'login-ui';
  wrap.style.cssText = 'position:fixed;z-index:20;display:flex;align-items:stretch;box-sizing:border-box;';

  var input = document.createElement('input');
  input.type = 'text';
  input.maxLength = GAME.Account.MAX_LEN;
  input.placeholder = '닉네임 (2~12자)';
  input.style.cssText =
    'font-family:var(--egg-font);box-sizing:border-box;' +
    'border-radius:8px;border:1px solid ' + inLine + ';background:' + inBg + ';color:' + inText + ';outline:none;';

  var btn = document.createElement('button');
  btn.textContent = '시작';
  btn.style.cssText =
    'font-family:var(--egg-font);box-sizing:border-box;white-space:nowrap;' +
    'border-radius:8px;cursor:pointer;border:1px solid ' + btnLine + ';background:' + btnBg + ';color:' + btnText + ';';

  wrap.appendChild(input); wrap.appendChild(btn);
  document.body.appendChild(wrap);
  this._wrap = wrap;

  // 설계 px 기준 크기 — place() 에서 캔버스 배율(sx)을 곱한다.
  var DESIGN = { inputW: 214, btnW: 96, gap: 10, h: 56, font: 19, radius: 10 };

  function place() {
    var canvas = document.querySelector('#game canvas');
    if (!canvas) return;
    var r = canvas.getBoundingClientRect();
    var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
    var sx = r.width / W;               // 캔버스가 화면에서 얼마나 커졌나
    function px(v) { return Math.round(v * sx) + 'px'; }

    wrap.style.gap = px(DESIGN.gap);
    input.style.width = px(DESIGN.inputW);
    input.style.height = px(DESIGN.h);
    input.style.padding = '0 ' + px(12);
    input.style.fontSize = px(DESIGN.font);
    input.style.borderRadius = px(DESIGN.radius);
    btn.style.minWidth = px(DESIGN.btnW);
    btn.style.height = px(DESIGN.h);
    btn.style.padding = '0 ' + px(16);
    btn.style.fontSize = px(DESIGN.font);
    btn.style.borderRadius = px(DESIGN.radius);

    // 캔버스 좌표 (W/2, H*inputY) 로 옮긴다.
    wrap.style.left = (r.left + (W / 2) * sx) + 'px';
    wrap.style.top = (r.top + (H * self.inputY) * sx) + 'px';
    wrap.style.transform = 'translate(-50%, -50%)';
  }
  place();
  this._place = place;
  window.addEventListener('resize', place);
  window.addEventListener('orientationchange', place);

  btn.addEventListener('click', function () { self._submit(input.value); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') self._submit(input.value);
    e.stopPropagation();     // 게임 키 핸들러로 새지 않게
  });
  input.focus();
};

GAME.LoginScene.prototype._removeInput = function () {
  if (this._place) {
    window.removeEventListener('resize', this._place);
    window.removeEventListener('orientationchange', this._place);
  }
  if (this._wrap && this._wrap.parentNode) this._wrap.parentNode.removeChild(this._wrap);
  this._wrap = null;
};

GAME.LoginScene.prototype._submit = function (value) {
  var self = this;
  //  ⚠ 닉네임 검사를 **먼저** 통과시킨다(길이·금지어). 서버에 물어보기 전에
  //    거를 수 있는 건 여기서 거른다.
  var id = String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
  var pre = GAME.Account.validate ? GAME.Account.validate(id) : null;
  if (pre && !pre.ok) { this.msg.setText(pre.reason); return; }
  if (pre && pre.id) id = pre.id;      // 다듬어진 형태를 쓴다(공백 정리 등)

  //  ── PIN 이 걸린 닉네임인가 (2026-08-05) ─────────────────────────────────
  //  ⚠ 서버가 이 기능을 모르면(`supported:false`) **예전과 똑같이** 그냥 들어간다.
  //    워커 배포는 사람이 대시보드에서 해야 해서 게임보다 늦을 수 있는데,
  //    그때 로그인이 막히면 아무도 게임을 못 한다.
  if (!GAME.Auth) { this._enter(id); return; }
  this.msg.setText('확인 중…');
  GAME.Auth.status(id).then(function (st) {
    if (!self.scene.isActive()) return;
    self.msg.setText('');
    if (!st.supported || !st.hasPin) { self._enter(id); return; }
    self._askPin(id);
  });
};

//  닉네임 확정 → 메뉴로.
GAME.LoginScene.prototype._enter = function (id) {
  var r = GAME.Account.login(id);
  if (!r.ok) { this.msg.setText(r.reason); return; }
  this._removeInput();
  this.scene.start('Menu');
};

//  PIN 입력을 받는다. DOM 판을 쓰는 이유는 `js/transferui.js` 와 같다
//  (Phaser 캔버스에 텍스트 입력이 없다).
GAME.LoginScene.prototype._askPin = function (id) {
  var self = this;
  this._removeInput();
  GAME.PinUI.open(this, {
    title: id + ' — PIN 입력',
    note: '이 닉네임은 PIN(숫자 4자리)으로 잠겨 있습니다.',
    confirm: '들어가기',
    onSubmit: function (pin, say, done) {
      say('확인 중…');
      GAME.Auth.verify(id, pin).then(function (r) {
        if (r.ok) { done(); self._enter(id); return; }
        say('⚠ ' + (r.why || 'PIN 이 다릅니다.'));
      });
    },
    onCancel: function () {
      //  취소하면 닉네임부터 다시 — 입력창을 되살린다.
      if (self.scene.isActive()) self._makeInput();
    }
  });
};
