window.GAME = window.GAME || {};

GAME.VERSION = 'v0.19';

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
      GAME.LoginScene,
      GAME.MenuScene,
      GAME.SelectScene,
      GAME.BuildScene,
      GAME.DraftScene,
      GAME.TowerScene,
      GAME.BattleScene,
      GAME.DefendScene,
      GAME.ResultScene,
      GAME.RankScene,
      GAME.AdminScene
    ]
  });

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
  // 모바일은 뷰포트가 '늦게' 정착한다 — 부팅 순간엔 주소창이 펼쳐져 있거나 레이아웃이
  // 덜 잡혀서 잘못된 크기로 fit 될 수 있고, 그 값이 그대로 굳으면 캔버스가 작게 뜬다.
  // 그래서 resize 뿐 아니라 방향전환·탭 복귀·로드 완료에도 다시 맞추고,
  // 부팅 직후 몇 차례 지연 refresh 로 늦게 오는 최종 뷰포트까지 잡는다.
  function refit() {
    if (GAME.game && GAME.game.scale) GAME.game.scale.refresh();
    updateDiag();
  }
  window.addEventListener('resize', refit);
  window.addEventListener('orientationchange', function () { refit(); setTimeout(refit, 300); });
  window.addEventListener('pageshow', refit);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refit(); });
  [120, 400, 900].forEach(function (ms) { setTimeout(refit, ms); });
  if (diag) setInterval(updateDiag, 500);
});
