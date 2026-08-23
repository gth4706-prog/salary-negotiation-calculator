window.GAME = window.GAME || {};

// ============================================================================
//  실시간 대전 — 전투 준비 화면 (2026-08-22 태현님 사양 ②)
//
//  60초 준비: 전략가 = 저장 배치 중 하나 선택 · 컨트롤러 = 대전 준비창(예산 500)에서
//  영웅·아이템·스킬 구매 → [전투 준비 완료] → 양쪽 세팅이 모이면 전투.
//
//  ⚠ 교환 상태·타이머는 GAME.RtFlow(전역)가 쥔다 — 이 씬은 그리기와 버튼만.
//    컨트롤러가 상점(TowerShop)을 다녀오는 동안에도 흐름이 살아 있어야 하기 때문.
// ============================================================================
GAME.RtPrepScene = function () {
  Phaser.Scene.call(this, { key: 'RtPrep' });
};
GAME.RtPrepScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.RtPrepScene.prototype.constructor = GAME.RtPrepScene;

GAME.RtPrepScene.prototype.init = function () {
  this._timerTxt = null;
  this._stateTxt = null;
  this._readyBtn = null;
  this._pickedFormation = null;
};

GAME.RtPrepScene.prototype.create = function () {
  var C = GAME.CONFIG.COLORS, UI = GAME.UI;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var P = GAME.CONFIG.PHONE || GAME.CONFIG.PORTRAIT;
  var self = this;
  var F = GAME.RtFlow;

  this.cameras.main.setBackgroundColor(C.bg);
  if (GAME.Music) GAME.Music.play('versus');

  //  흐름이 죽어 있으면(뒤로가기 복원 등) 대전 화면으로 — 유령 준비 화면 방지.
  if (!F || !F.active) { this.scene.start('Versus'); return; }

  var isStrat = F.myRole === 'strategist';
  UI.text(this, W / 2, P ? 10 : 26,
    isStrat ? '🛡 전투 준비 — 배치를 고르세요' : '⚔ 전투 준비 — 영웅을 고르세요 (기본 스펙 대전)',
    { size: P ? 'subhead' : 'head', color: C.accent, origin: 0.5, originY: 0 });

  this._timerTxt = UI.text(this, W / 2, P ? 44 : 78, '', {
    size: P ? 'head' : 'title', color: C.accentAlt, origin: 0.5, originY: 0 });

  var top = P ? 96 : 150;

  if (isStrat) {
    //  저장 배치 목록 — 누르면 그 자리에서 선택 표시, [준비 완료]로 확정.
    var list = GAME.Formations.loadSaved().slice(0, P ? 3 : 5);
    if (!list.length) {
      UI.text(this, W / 2, top + 30,
        '저장된 배치가 없습니다 — 대전 → 내 전장 만들기에서 먼저 만들어 두세요',
        { size: 'caption', color: C.textDim, origin: 0.5 });
    }
    this._formBtns = [];
    var bw = Math.min(W - 40, 560), bh = P ? 46 : 56;
    list.forEach(function (f, i) {
      var b = UI.button(self, W / 2, top + 26 + i * (bh + 8), bw, bh,
        (f.name || '(이름 없음)') + '   ·   ' + (f.units ? f.units.length : 0) + '기',
        function () {
          self._pickedFormation = f;
          self._formBtns.forEach(function (fb, j) {
            fb.rect.setStrokeStyle(list[j] === f ? 3 : 1,
              list[j] === f ? GAME.CONFIG.COLORS.strategist : UI.COL.borderUi);
          });
        }, { fontSize: P ? 13 : 15 });
      self._formBtns.push(b);
    });
  } else {
    //  컨트롤러 — 영웅 3종을 **초기화된 스펙으로 새로 고른다** (2026-08-23 태현님:
    //  "영웅은 모두 초기화된 상태로 서로 골라야 한다"). 상점·예산·아이템은 접었다 —
    //  실시간은 실력전이지 장비전이 아니다. 스킬은 기본 픽.
    this._pickedHero = null;
    this._heroBtns = [];
    var hks = GAME.HERO_ORDER || ['vanguard', 'ranger', 'warden'];
    var hbw = Math.min(W - 40, 560), hbh = P ? 52 : 62;
    hks.forEach(function (hk, i) {
      var hd = GAME.HEROES[hk];
      if (!hd) return;
      var b = UI.button(self, W / 2, top + 26 + i * (hbh + 10), hbw, hbh,
        hd.name + '   ·   ' + (hd.tagline || hd.desc || '').slice(0, 26),
        function () {
          self._pickedHero = hk;
          if (GAME.RtFlow.setHeroPick) GAME.RtFlow.setHeroPick(hk);
          self._heroBtns.forEach(function (hb, j) {
            hb.rect.setStrokeStyle(hks[j] === hk ? 3 : 1,
              hks[j] === hk ? GAME.CONFIG.COLORS.controller : UI.COL.borderUi);
          });
        }, { fontSize: P ? 14 : 16 });
      self._heroBtns.push(b);
    });
  }

  var byBottom = P ? H - 40 : H - 90;
  this._readyBtn = UI.button(this, W / 2, byBottom - (P ? 52 : 66), Math.min(W - 40, 380),
    P ? 52 : 60, '⚔ 전투 준비 완료', function () { self._commit(); });
  this._stateTxt = UI.text(this, W / 2, byBottom, '', {
    size: 'caption', color: C.textDim, origin: 0.5 });
  this._stateTxt.setAlign('center');

  UI.button(this, P ? 64 : 76, P ? 26 : 34, P ? 100 : 120, P ? 40 : 48, '🚪 나가기',
    function () { GAME.RtFlow.abort(); }, { fontSize: P ? 12 : 14 });

  //  Battle 전환은 RtFlow.maybeBattle 이 한다 — 이 씬은 0.4초마다 상태만 다시 그린다.
  this._pump = this.time.addEvent({
    delay: 400, loop: true, callback: function () { self._refresh(); }
  });
  this._refresh();
};

GAME.RtPrepScene.prototype._refreshLoadout = function () {
  if (!this._loadoutTxt || !this._loadoutTxt.scene) return;
  var rec = GAME.ArenaBuild ? GAME.ArenaBuild.get() : {};
  var hero = GAME.HEROES[rec.heroKey || 'vanguard'];
  var CAT = GAME.TowerShopItems;
  var parts = [];
  if (CAT && rec.items) {
    ['weapon', 'armor', 'boots', 'accessory'].forEach(function (k) {
      var it = rec.items[k] ? CAT.find(k, rec.items[k]) : null;
      if (it) parts.push(CAT.nameFor(it, rec.heroKey));
    });
  }
  this._loadoutTxt.setText('현재 구성: ' + (hero ? hero.name : '?') +
    (parts.length ? '\n' + parts.join(' · ') : '\n(장비 없음 — 준비창에서 사세요)'));
};

GAME.RtPrepScene.prototype._commit = function () {
  var F = GAME.RtFlow;
  if (!F.active || F.mySetup) return;
  if (F.myRole === 'strategist') {
    var f = this._pickedFormation || GAME.Formations.loadSaved()[0];
    if (!f) { this._stateTxt.setText('⚠ 저장된 배치가 없습니다'); return; }
    F.commitMine(F.buildStrategistSetup(f));
  } else {
    if (!this._pickedHero && !F.myHeroPick) {
      this._stateTxt.setText('⚠ 영웅을 고르세요'); return;
    }
    F.commitMine(F.buildControllerSetup(this._pickedHero));
  }
  this._refresh();
};

GAME.RtPrepScene.prototype._refresh = function () {
  var F = GAME.RtFlow;
  if (!F || !F.active) return;                  // Battle 전환 중이면 손대지 않는다
  if (!this._timerTxt || !this._timerTxt.scene) return;
  var s = Math.ceil(F.remainMs() / 1000);
  this._timerTxt.setText('⏳ ' + s + '초');
  var mine = F.mySetup ? '나: 준비 완료 ✓' : '나: 준비 중…';
  var theirs = F.theirSetup ? '상대: 준비 완료 ✓' : '상대: 준비 중…';
  this._stateTxt.setText(mine + '   ·   ' + theirs +
    (F.mySetup && !F.theirSetup ? '\n상대가 끝나면 바로 시작됩니다' : ''));
  if (F.mySetup && this._readyBtn && this._readyBtn.text) {
    this._readyBtn.text.setText('⌛ 상대를 기다리는 중…');
  }
};

GAME.RtPrepScene.prototype.shutdown = function () {};
