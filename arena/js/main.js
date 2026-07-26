window.GAME = window.GAME || {};

window.addEventListener('load', function () {
  if (typeof Phaser === 'undefined') {
    document.getElementById('game').innerHTML =
      '<p style="color:#f0a86a;font-family:sans-serif;padding:2rem">' +
      'Phaser를 불러오지 못했습니다. 인터넷 연결을 확인하세요.</p>';
    return;
  }

  GAME.game = new Phaser.Game({
    type: Phaser.AUTO,
    width: GAME.CONFIG.WIDTH,
    height: GAME.CONFIG.HEIGHT,
    parent: 'game',
    backgroundColor: '#151520',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
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
});
