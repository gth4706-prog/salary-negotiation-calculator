window.GAME = window.GAME || {};

// ID(닉네임)만 입력하는 로그인. 비밀번호 없음.
// Phaser 캔버스에는 텍스트 입력이 없으므로 DOM input 을 캔버스 위에 겹쳐 쓴다.
GAME.LoginScene = function () {
  Phaser.Scene.call(this, { key: 'Login' });
};
GAME.LoginScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.LoginScene.prototype.constructor = GAME.LoginScene;

GAME.LoginScene.prototype.create = function () {
  var C = GAME.CONFIG.COLORS;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var P = GAME.CONFIG.PORTRAIT;
  var self = this;
  var u = H / 100;

  this.cameras.main.setBackgroundColor(C.bg);

  GAME.UI.label(this, W / 2, u * 18, '🥚 EGG WAR', P ? 28 : 50, C.text, 0.5);
  GAME.UI.label(this, W / 2, u * 26, '계란 부족 비대칭 실시간 대전', P ? 15 : 18, C.textDim, 0.5);
  GAME.UI.label(this, W / 2, u * 38, '닉네임을 입력하고 시작하세요', P ? 17 : 18, C.text, 0.5);
  GAME.UI.label(this, W / 2, u * 43,
    '비밀번호는 없습니다. 닉네임이 그대로 랭킹에 표시됩니다.', P ? 13 : 13, C.textDim, 0.5);

  this.msg = GAME.UI.label(this, W / 2, u * 62, '', P ? 15 : 14, C.warn, 0.5)
    .setAlign('center').setWordWrapWidth(W - 60);

  // 최근에 쓴 닉네임 빠른 선택
  var recent = GAME.Account.list().filter(function (r) { return !r.blocked; }).slice(0, 3);
  if (recent.length) {
    GAME.UI.label(this, W / 2, u * 70, '최근 사용', P ? 13 : 13, C.textDim, 0.5);
    var cols = GAME.Layout.cols(recent.length, { gap: 10, width: Math.min(W, 520), left: (W - Math.min(W, 520)) / 2 });
    for (var i = 0; i < recent.length; i++) {
      (function (rec, idx) {
        GAME.UI.button(self, cols[idx].cx, u * 76, cols[idx].w, u * 5.5, rec.id, function () {
          self._submit(rec.id);
        }, { fontSize: P ? 15 : 15 });
      })(recent[i], i);
    }
  }

  GAME.UI.label(this, W / 2, u * 92,
    '닉네임은 관리자가 검토할 수 있으며, 부적절한 닉네임은 차단됩니다.',
    P ? 13 : 12, '#6f6f88', 0.5).setWordWrapWidth(W - 60);
  // 버전 표시는 DOM 배지(#ver) 하나로 통일했다 — 캔버스에도 그리면 우하단에서 겹친다.

  this._makeInput();

  this.events.on('shutdown', function () { self._removeInput(); });
};

// 캔버스 스케일에 맞춰 DOM input 을 정확한 위치에 띄운다
GAME.LoginScene.prototype._makeInput = function () {
  var self = this;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;

  var wrap = document.createElement('div');
  wrap.id = 'login-ui';
  wrap.style.cssText = 'position:fixed;z-index:20;display:flex;gap:8px;align-items:center;';

  var input = document.createElement('input');
  input.type = 'text';
  input.maxLength = GAME.Account.MAX_LEN;
  input.placeholder = '닉네임 (2~12자)';
  input.style.cssText =
    'font:16px "Malgun Gothic",sans-serif;padding:10px 12px;border-radius:8px;' +
    'border:1px solid #4a4a68;background:#1c1c28;color:#e8e8f0;outline:none;width:220px;';

  var btn = document.createElement('button');
  btn.textContent = '시작';
  btn.style.cssText =
    'font:16px "Malgun Gothic",sans-serif;padding:10px 20px;border-radius:8px;cursor:pointer;' +
    'border:1px solid #35d0a5;background:#1c3a34;color:#35d0a5;';

  wrap.appendChild(input); wrap.appendChild(btn);
  document.body.appendChild(wrap);
  this._wrap = wrap;

  function place() {
    var canvas = document.querySelector('#game canvas');
    if (!canvas) return;
    var r = canvas.getBoundingClientRect();
    // 캔버스 좌표 (W/2, H*0.52) 위치로 옮긴다
    var sx = r.width / W, sy = r.height / H;
    wrap.style.left = (r.left + (W / 2) * sx) + 'px';
    wrap.style.top = (r.top + (H * 0.52) * sy) + 'px';
    wrap.style.transform = 'translate(-50%, -50%)';
  }
  place();
  this._place = place;
  window.addEventListener('resize', place);

  btn.addEventListener('click', function () { self._submit(input.value); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') self._submit(input.value);
    e.stopPropagation();     // 게임 키 핸들러로 새지 않게
  });
  input.focus();
};

GAME.LoginScene.prototype._removeInput = function () {
  if (this._place) window.removeEventListener('resize', this._place);
  if (this._wrap && this._wrap.parentNode) this._wrap.parentNode.removeChild(this._wrap);
  this._wrap = null;
};

GAME.LoginScene.prototype._submit = function (value) {
  var r = GAME.Account.login(value);
  if (!r.ok) { this.msg.setText(r.reason); return; }
  this._removeInput();
  this.scene.start('Menu');
};
