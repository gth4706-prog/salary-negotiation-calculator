// ============================================================================
//  GearBank — 생성 이미지 무기 파츠를 벡터 계란 몸에 얹는다 (2026-08-19 하이브리드)
//
//  방향(태현님 확정): 몸은 기존 벡터 유지, **무기만** 생성 이미지로 덮어씌운다.
//  구조는 bossbank 와 같은 계약이다:
//    - 비동기 로드, 준비 전엔 false 를 돌려줘 호출부가 벡터 무기로 폴백한다.
//    - Image 는 영속(프레임마다 만들지 않는다 — v1.66 타원 GC 사고의 규율).
//    - postupdate 스윕이 이번 프레임에 도장 안 찍힌 이미지를 숨긴다
//      (죽은 유닛의 무기가 화면에 남는 유령 방지 — bossbank 와 같은 함정 대책).
//  각도는 호출부(eggart)가 이미 계산한 무기 방향 벡터를 그대로 받는다 —
//  모션(예비·타격·8방향)이 공짜로 따라오는 이유다.
// ============================================================================
(function () {
  'use strict';
  var G = (window.GAME = window.GAME || {});

  var DATA = {
    //  gripF: 이미지 세로에서 손잡이 중심 위치(0=칼끝, 1=자루끝) — 실측값.
    //  tipF : 칼끝까지의 비율(= gripF). 표시는 grip→tip 길이를 게임 쪽 길이에 맞춘다.
    greatsword: { src: 'assets/gear/greatsword.png?v=1.97', gripF: 0.80 }
  };

  G.GearBank = {
    _pool: {},          // key -> [{img, stamp}]
    _loading: {},
    _frame: 0,
    _scene: null,

    ready: function (key, scene) {
      var d = DATA[key];
      if (!d) return false;
      if (scene && scene.textures && scene.textures.exists('gear-' + key)) return true;
      this._ensure(key, scene);
      return false;
    },

    _ensure: function (key, scene) {
      if (!scene || !scene.load || this._loading[key]) return;
      this._loading[key] = true;
      scene.load.image('gear-' + key, DATA[key].src);
      scene.load.start();
    },

    _acquire: function (key, scene) {
      var list = this._pool[key] || (this._pool[key] = []);
      for (var i = 0; i < list.length; i++) {
        if (list[i].stamp !== this._frame && list[i].img.scene === scene) {
          list[i].stamp = this._frame;
          return list[i].img;
        }
      }
      var img = scene.add.image(0, 0, 'gear-' + key);
      list.push({ img: img, stamp: this._frame });
      this._hook(scene);
      return img;
    },

    //  postupdate 스윕 — 이번 프레임에 안 쓰인 이미지를 숨긴다. 씬마다 한 번만 건다.
    _hook: function (scene) {
      if (this._scene === scene) return;
      this._scene = scene;
      var self = this;
      scene.events.on('postupdate', function () {
        for (var k in self._pool) {
          var list = self._pool[k];
          for (var i = 0; i < list.length; i++) {
            if (list[i].stamp !== self._frame) list[i].img.setVisible(false);
          }
        }
        self._frame++;
      });
      scene.events.once('shutdown', function () {
        self._pool = {}; self._scene = null; self._loading = {};
      });
    },

    /**
     * 무기 이미지를 얹는다. 준비 안 됐으면 false(→ 호출부가 벡터로 그린다).
     * @param g       Phaser Graphics (scene·depth 를 여기서 얻는다)
     * @param key     'greatsword' …
     * @param gripX/Y 손잡이 중심(월드 좌표)
     * @param dirX/Y  자루→칼끝 단위 벡터 (eggart 의 무기 방향 그대로)
     * @param tipLen  grip→칼끝 표시 길이(px) — 벡터판과 같은 값을 넘겨 판정 사거리와
     *                그림이 어긋나지 않게 한다(파수꾼 tipCap 사고의 교훈).
     * @param alpha
     */
    draw: function (g, key, gripX, gripY, dirX, dirY, tipLen, alpha) {
      var scene = g.scene;
      if (!this.ready(key, scene)) return false;
      var d = DATA[key];
      var img = this._acquire(key, scene);
      var tex = scene.textures.get('gear-' + key).getSourceImage();
      var gripPx = tex.height * d.gripF;               // 이미지에서 grip→칼끝 픽셀
      var s = tipLen / gripPx;
      img.setVisible(true)
         .setOrigin(0.5, d.gripF)
         .setPosition(gripX, gripY)
         .setScale(s)
         .setRotation(Math.atan2(dirY, dirX) + Math.PI / 2)
         .setAlpha(alpha == null ? 1 : alpha)
         .setDepth(g.depth || 0);
      return true;
    }
  };
})();
