window.GAME = window.GAME || {};

GAME.VERSION = 'v0.08';

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
      expandParent: true
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

  // 창 크기·방향이 바뀌면 다시 맞춘다
  window.addEventListener('resize', function () {
    if (GAME.game && GAME.game.scale) GAME.game.scale.refresh();
  });
});
