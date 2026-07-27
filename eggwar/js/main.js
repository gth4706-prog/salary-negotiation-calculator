window.GAME = window.GAME || {};

GAME.VERSION = 'v0.30';

// 주소에 ?admin=1 을 붙이면 닉네임 관리 화면에 들어갈 수 있다
GAME.isAdmin = /[?&]admin=1/.test(location.search || '');

window.addEventListener('load', function () {
  if (typeof Phaser === 'undefined') {
    document.getElementById('game').innerHTML =
      '<p style="color:#f0a86a;font-family:sans-serif;padding:2rem">' +
      'Phaser를 불러오지 못했습니다. 인터넷 연결을 확인하세요.</p>';
    return;
  }

  var badge = document.getElementById('ver');
  if (badge) badge.textContent = GAME.VERSION;

  // 저장된 테마 선택을 씬이 만들어지기 **전에** 적용한다.
  // 씬이 생긴 뒤에 바꾸면 이미 그려진 색이 남는다.
  if (GAME.UI && GAME.UI.bootTheme) GAME.UI.bootTheme();

  GAME.game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#101018',
    scale: {
      mode: Phaser.Scale.FIT,
      // 중앙정렬은 여기서만 한다 (CSS 에서 또 하면 이중으로 밀린다)
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME.CONFIG.WIDTH,
      height: GAME.CONFIG.HEIGHT,
      // expandParent 를 켜면 Phaser 가 부모(#game/body)를 캔버스에 맞춰 부풀리는데,
      // 모바일에서 그 되먹임 때문에 부모 높이가 실제 가시 영역보다 커져 캔버스가
      // 절반 크기로 위쪽에 떠 버렸다(실측 신고). CSS 로 #game 을 가시 뷰포트에
      // 못박았으므로 Phaser 는 부모를 건드리지 말고 그 크기에 맞추기만 하면 된다.
      expandParent: false
    },
    scene: [
      // 첫 화면 = 로딩(3초, 탭하면 건너뜀). 모바일 뷰포트가 정착할 시간을 벌어주기도 한다.
      GAME.LoadingScene,
      GAME.LoginScene,
      GAME.MenuScene,
      GAME.SelectScene,
      GAME.BuildScene,
      GAME.DraftScene,
      GAME.TowerScene,
      GAME.BattleScene,
      GAME.DefendScene,
      GAME.DefendTowerScene,
      GAME.VersusScene,
      GAME.ResultScene,
      GAME.RankScene,
      GAME.AdminScene
    ]
  });

  // ── 화면 전환 애니메이션 (전역) ─────────────────────────────────────────
  // 씬이 바뀔 때마다 짧게 페이드인시킨다. 씬 코드는 한 줄도 안 바꾸고
  // Phaser 의 씬 생명주기 이벤트에 한 번만 걸어 전 화면에 적용한다.
  // 값이 크면 조작이 굼떠 보인다 — 160ms 가 '부드럽지만 안 답답한' 선.
  (function () {
    var FADE = 160;
    GAME.game.events.on('ready', function () { hook(); });
    function hook() {
      GAME.game.scene.scenes.forEach(function (sc) {
        if (sc.__fadeHooked) return;
        sc.__fadeHooked = true;
        sc.events.on('create', function () {
          if (sc.cameras && sc.cameras.main) sc.cameras.main.fadeIn(FADE, 0, 0, 0);
        });
      });
    }
    hook();
  })();

  // ?diag=1 진단 오버레이 — 실기기(폰) 값을 눈으로 받기 위한 것.
  //   평상시엔 만들지 않는다. 실측 신고(캔버스가 작게 뜬다)의 원인을 폰에서 직접
  //   확인하려고, innerW/H · clientW/H · DPR · isPortrait · 설계 W×H · 캔버스 실제 px
  //   (getBoundingClientRect) · fitScale 을 화면 좌상단에 실시간으로 띄운다.
  var diag = /[?&]diag=1/.test(location.search || '') ? (function () {
    var el = document.createElement('div');
    el.id = 'diag';
    el.style.cssText =
      'position:fixed;top:0;left:0;z-index:9999;margin:4px;padding:6px 8px;' +
      'font:11px/1.45 ui-monospace,Menlo,Consolas,monospace;white-space:pre;' +
      'color:#7ef0d0;background:rgba(8,8,14,0.82);border:1px solid #35d0a5;' +
      'border-radius:6px;pointer-events:none;max-width:60vw;';
    document.body.appendChild(el);
    return el;
  })() : null;

  function updateDiag() {
    if (!diag) return;
    var d = document.documentElement || {};
    var cv = document.querySelector('#game canvas');
    var r = cv ? cv.getBoundingClientRect() : { width: 0, height: 0, left: 0, top: 0 };
    var iw = window.innerWidth, ih = window.innerHeight;
    var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
    var fit = Math.min(iw / W, ih / H);
    diag.textContent =
      'ver ' + GAME.VERSION + '  P=' + GAME.CONFIG.PORTRAIT + '\n' +
      'inner   ' + iw + ' x ' + ih + '\n' +
      'client  ' + (d.clientWidth || 0) + ' x ' + (d.clientHeight || 0) + '\n' +
      'dpr     ' + (window.devicePixelRatio || 1) + '\n' +
      'design  ' + W + ' x ' + H + '\n' +
      'canvas  ' + Math.round(r.width) + ' x ' + Math.round(r.height) +
        '  @' + Math.round(r.left) + ',' + Math.round(r.top) + '\n' +
      'fill    ' + Math.round(r.width / iw * 100) + '% x ' + Math.round(r.height / ih * 100) + '%\n' +
      'fitScale ' + fit.toFixed(3);
  }

  // 창 크기·방향이 바뀌면 다시 맞춘다.
  //
  // 모바일은 뷰포트가 '늦게' 정착한다 — 부팅 순간엔 주소창이 펼쳐져 있어서 보이는 높이가
  // 작고, 스크롤/로딩 뒤에 주소창이 접히며 높이가 커진다. 처음의 작은 값으로 fit 되면
  // 캔버스가 화면 한가운데 작게 떴다가, 뒤늦은 refit 에서야 커진다(실측 신고: "로딩 지나니 확대됨").
  //
  // 해법 둘:
  //  1) #game 을 **실제 보이는 뷰포트**(visualViewport)에 매번 맞춰 못박는다.
  //     CSS 의 100dvh 는 '주소창 접힌 최대 높이'라 주소창이 보일 땐 실제보다 커서 어긋난다.
  //  2) visualViewport 의 resize/scroll(=주소창 접힘 이벤트)에 바로 다시 맞추고,
  //     부팅 직후 ~3초간 크기 변화를 폴링해 즉시 따라잡는다.
  function pinGame() {
    var g = document.getElementById('game');
    if (!g) return;
    var vv = window.visualViewport;
    var w = vv ? Math.round(vv.width) : window.innerWidth;
    var h = vv ? Math.round(vv.height) : window.innerHeight;
    g.style.width = w + 'px';
    g.style.height = h + 'px';
  }
  function refit() {
    pinGame();
    if (GAME.game && GAME.game.scale) GAME.game.scale.refresh();
    updateDiag();
  }
  window.addEventListener('resize', refit);
  window.addEventListener('orientationchange', function () { refit(); setTimeout(refit, 300); });
  window.addEventListener('pageshow', refit);
  window.addEventListener('scroll', refit, { passive: true });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refit(); });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', refit);
    window.visualViewport.addEventListener('scroll', refit);
  }
  // 부팅 직후 뷰포트가 정착할 때까지(주소창 접힘 등) 크기 변화를 감지해 즉시 다시 맞춘다.
  (function settle() {
    var lastW = -1, lastH = -1, until = Date.now() + 3000;
    (function tick() {
      var vv = window.visualViewport;
      var w = vv ? Math.round(vv.width) : window.innerWidth;
      var h = vv ? Math.round(vv.height) : window.innerHeight;
      if (w !== lastW || h !== lastH) { lastW = w; lastH = h; refit(); }
      if (Date.now() < until) setTimeout(tick, 100);
    })();
  })();
  if (diag) setInterval(updateDiag, 500);
});
