window.GAME = window.GAME || {};

GAME.VERSION = 'v0.05';

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
      GAME.MenuScene,
      GAME.SelectScene,
      GAME.BuildScene,
      GAME.DraftScene,
      GAME.BattleScene,
      GAME.ResultScene
    ]
  });

  // 창 크기·방향이 바뀌면 다시 맞춘다
  window.addEventListener('resize', function () {
    if (GAME.game && GAME.game.scale) GAME.game.scale.refresh();
  });
});
