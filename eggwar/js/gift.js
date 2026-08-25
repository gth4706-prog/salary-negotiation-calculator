window.GAME = window.GAME || {};

// ============================================================================
//  운영 지급(선물) — 지급 표에 적힌 계정이 접속하면 자동으로 지급한다.
//
//  통곡의 탑 골드는 서버가 아니라 **이 기기의 캐릭터(TowerChar)** 에 있다.
//  그래서 지급도 클라이언트에서 하고, 수령 표시를 캐릭터 레코드에 남긴다 —
//  골드와 같은 저장소라 같이 살고 같이 죽는다(캐릭터를 지우면 표시도 골드도
//  함께 사라지니 이중 지급 걱정이 없다).
//
//  ⚠ 캐릭터가 없으면 지급을 미룬다 — 골드를 담을 곳이 없다. 메뉴에 들어올
//    때마다 다시 확인하므로 캐릭터를 만든 다음 방문에 지급된다.
//  ⚠ 닉네임에 비밀번호(PIN)가 없으면 누구나 그 이름으로 로그인할 수 있다 —
//    지급 대상 계정은 PIN 을 걸어 두는 것이 안전하다.
// ============================================================================
GAME.Gift = {
  TABLE: [
    { id: 'g20260825-joel-5000', name: 'joel', towerGold: 5000, note: '운영 지급' }
  ],

  _me: function () {
    var me = GAME.Account && GAME.Account.current && GAME.Account.current();
    return me ? String(me).trim().toLowerCase() : null;
  },

  pendingFor: function () {
    var me = this._me();
    if (!me || !GAME.TowerChar) return null;
    var rec = GAME.TowerChar.get();
    if (!rec) return null;
    for (var i = 0; i < this.TABLE.length; i++) {
      var g = this.TABLE[i];
      if (g.name === me && !(rec.gifts && rec.gifts[g.id])) return g;
    }
    return null;
  },

  //  지급 + 수령 표시 + 안내 팝업. 지급했으면 내역을, 아니면 null 을 돌려준다.
  claim: function (scene) {
    var g = this.pendingFor();
    if (!g) return null;
    var rec = GAME.TowerChar.get();
    if (!rec.gifts) rec.gifts = {};
    rec.gifts[g.id] = 1;
    rec.gold += g.towerGold;
    GAME.TowerChar._save(rec);
    if (scene && GAME.Modal && !GAME.Modal.isOpen()) {
      GAME.Modal.open(scene, {
        title: '🎁 ' + (g.note || '지급'),
        items: [{ key: 'ok',
                  name: '💰 통곡의 탑 골드 +' + g.towerGold.toLocaleString(),
                  note: '지금 보유: ' + rec.gold.toLocaleString() + ' 골드' }],
        onPick: function () {}, onClose: function () {}
      });
    }
    return g;
  }
};
