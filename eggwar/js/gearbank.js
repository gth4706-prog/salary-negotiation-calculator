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
    greatsword:  { src: 'assets/gear/greatsword.png?v=1.99', gripF: 0.80 },
    //  bow 는 2026-08-21 재생성분(bow2)으로 갈아탔다 — 옛 활은 시위·음영이 검은
    //  면으로 뭉쳐 있었다(태현님 신고). 새 활은 **오른쪽으로 굽는다**(옛 활은 왼쪽).
    bow:         { src: 'assets/gear/bow2.png?v=2.27' },
    hookspear:   { src: 'assets/gear/hookspear.png?v=1.99' },
    roundshield: { src: 'assets/gear/roundshield.png?v=1.99' },
    //  유닛 무기 (2026-08-21 시트 1차분) — 전사·족장·투창병·방패병
    stonesword:  { src: 'assets/gear/stonesword.png?v=2.27', gripF: 0.72 },
    handaxe:     { src: 'assets/gear/handaxe.png?v=2.27', gripF: 0.86 },
    javelin:     { src: 'assets/gear/javelin.png?v=2.27' },
    towershield: { src: 'assets/gear/towershield.png?v=2.27' },
    //  상점 아이콘 3종 (등급색은 place 의 tint)
    armor:       { src: 'assets/gear/armor.png?v=2.27' },
    boots:       { src: 'assets/gear/boots.png?v=2.27' },
    amulet:      { src: 'assets/gear/amulet.png?v=2.27' },
    //  활 마감·유닛 도구·등짐 (2026-08-21 시트 2차분)
    bowstring:   { src: 'assets/gear/bowstring.png?v=2.30' },
    arrow2:      { src: 'assets/gear/arrow2.png?v=2.30' },
    arrowbundle: { src: 'assets/gear/arrowbundle.png?v=2.30' },
    slingimg:    { src: 'assets/gear/slingimg.png?v=2.30' },
    leafstaffimg:{ src: 'assets/gear/leafstaff.png?v=2.30', gripF: 0.62 },
    sapjarimg:   { src: 'assets/gear/sapjar.png?v=2.30' },
    ballistaimg: { src: 'assets/gear/ballista.png?v=2.30' },
    quiverimg:   { src: 'assets/gear/quiverimg.png?v=2.30' },
    capeimg:     { src: 'assets/gear/capeimg.png?v=2.30' },
    furimg:      { src: 'assets/gear/furimg.png?v=2.30' },
    packimg:     { src: 'assets/gear/packimg.png?v=2.30' },
    //  영웅 투구 3종 (2026-08-21 시트 1차분 — 정면 단독컷)
    helmVanguard: { src: 'assets/helm/vanguard2.png?v=2.38' },
    helmPot:    { src: 'assets/helm/pot.png?v=2.38' },
    helmBand:   { src: 'assets/helm/band.png?v=2.38' },
    helmCap:    { src: 'assets/helm/cap.png?v=2.38' },
    helmHood:   { src: 'assets/helm/hood.png?v=2.38' },
    helmLeaf:   { src: 'assets/helm/leaf.png?v=2.38' },
    helmBucket: { src: 'assets/helm/bucket.png?v=2.38' },
    helmHorns:  { src: 'assets/helm/horns.png?v=2.38' },
    helmSedge:  { src: 'assets/helm/sedge.png?v=2.38' },
    helmPot2:   { src: 'assets/helm/pot2.png?v=2.38' },
    helmRanger:   { src: 'assets/helm/ranger.png?v=2.38' },
    helmWarden:   { src: 'assets/helm/warden.png?v=2.29' },
    //  이펙트 (흰색 원본 — 코드가 틴트·블렌드로 색을 입힌다)
    flame:       { src: 'assets/fx/flame.png?v=2.27' },
    glow:        { src: 'assets/fx/glow.png?v=2.27' },
    slash:       { src: 'assets/fx/slash.png?v=2.27' },
    impact:      { src: 'assets/fx/impact.png?v=2.27' },
    ring:        { src: 'assets/fx/ring.png?v=2.27' }
  };

  G.GearBank = {
    _pool: {},          // key -> [{img, stamp}]
    _loading: {},
    _frame: 0,
    _scene: null,

    //  ⚠ 텍스처는 **전역**(TextureManager)이라 씬이 없어도 존재 여부를 알 수 있다.
    //  eggart 의 잉크 윤곽 패스는 프록시 Graphics(scene 없음)로 같은 분기를 한 번 더
    //  도는데, 거기서 false 를 돌려주면 이미지 밑에 벡터 무기의 잉크 실루엣이
    //  이중으로 깔린다 — 텍스처가 있으면 true 를 주되 그리기는 실제 패스에서만 한다.
    ready: function (key, scene) {
      var d = DATA[key];
      if (!d) return false;
      var tm = (scene && scene.textures) || (G.game && G.game.textures);
      if (tm && tm.exists('gear-' + key)) return true;
      this._ensure(key, scene);
      return false;
    },

    _ensure: function (key, scene) {
      if (!scene || !scene.load || this._loading[key]) return;
      this._loading[key] = true;
      scene.load.image('gear-' + key, DATA[key].src);
      scene.load.start();
    },

    //  g 가 컨테이너 안이면 이미지도 같은 컨테이너로 — 상점 미리보기(패널 컨테이너)와
    //  PC 전투 줌(worldLayer)에서 좌표가 어긋나던 원인(2026-08-21 "무기 사니까 안 보여").
    _mount: function (img, g) {
      var pc = g.parentContainer || null;
      if (img.parentContainer !== pc) {
        if (img.parentContainer) img.parentContainer.remove(img);
        if (pc) pc.add(img);
      }
    },

    //  ── 이미지를 자기 Graphics 의 "바로 위 / 바로 아래"에 세운다 (2026-08-22) ──
    //  왜 depth 로 못 하나: ① **컨테이너(전투 worldLayer)는 자식 depth 를 무시**하고
    //  add 순서로 그린다 ② 씬 직속(상점·로비)은 depth 동률이면 생성 순서인데, 풀에서
    //  **재사용된 이미지는 옛날에 만들어진 것**이라 나중에 만든 패널 배경 밑에 깔린다
    //  (사냥꾼 상점 미리보기에서 활이 통째로 사라진 실제 사고 — 태현님 신고).
    //  ⚠ 이미 옳은 쪽에 있으면 건드리지 않는다 — 매 프레임 전부 옮기면 같은 쪽
    //    이미지들끼리의 그리기 순서(투구가 무기 위)가 뒤집힌다.
    _order: function (img, g, behind) {
      var pc = img.parentContainer;
      if (pc) {
        var gi = pc.getIndex(g), ii = pc.getIndex(img);
        if (gi < 0 || ii < 0) return;
        if (behind) { if (ii > gi) pc.moveTo(img, gi); }
        else if (ii < gi) pc.moveTo(img, gi);
      } else if (img.scene) {
        img.setDepth(g.depth || 0);
        var dl = img.scene.children;
        if (dl.getIndex(g) < 0) return;
        if (behind) { if (dl.getIndex(img) > dl.getIndex(g)) dl.moveBelow(img, g); }
        else if (dl.getIndex(img) < dl.getIndex(g)) dl.moveAbove(img, g);
      }
    },

    //  정적 화면(상점 등)이 화면을 통째로 다시 지을 때 부른다 — 스윕이 안 도는
    //  화면에서는 이걸 안 부르면 옛 탭의 아이콘이 유령으로 남는다.
    hideAll: function () {
      for (var k in this._pool) {
        var list = this._pool[k];
        for (var i = 0; i < list.length; i++) list[i].img.setVisible(false);
      }
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

    //  ── 스윕은 **begin() 을 부르는 씬(전투)에서만** 돈다 (2026-08-21) ──────────
    //  캐릭터 선택 같은 정적 화면은 한 번만 그린다 — 거기서 스윕이 돌면 이미지가
    //  다음 프레임에 사라지고, 벡터 폴백은 이미 생략돼 **무기가 통째로 실종**된다
    //  (실기기 신고: 카드에 무기가 안 뜸). 유령(죽은 유닛의 무기)은 매 프레임
    //  다시 그리는 전투에서만 생기는 문제라, 전투 draw() 가 begin() 으로 무장할
    //  때만 스윕한다. 정적 화면의 이미지는 씬 shutdown 정리로 충분하다.
    _sweepArmed: false,
    begin: function () { this._sweepArmed = true; },

    //  부팅 때 전부 선적재 — 카드 화면이 텍스처보다 먼저 그려져 옛 벡터로 박제되는
    //  문제를 근본에서 없앤다(용량 수백 KB, SW 캐시가 흡수).
    preload: function (scene) {
      for (var k in DATA) this._ensure(k, scene);
    },

    //  postupdate 스윕 — 이번 프레임에 안 쓰인 이미지를 숨긴다. 씬마다 한 번만 건다.
    _hook: function (scene) {
      if (this._scene === scene) return;
      this._scene = scene;
      var self = this;
      scene.events.on('postupdate', function () {
        if (self._sweepArmed) {
          for (var k in self._pool) {
            var list = self._pool[k];
            for (var i = 0; i < list.length; i++) {
              if (list[i].stamp !== self._frame) list[i].img.setVisible(false);
            }
          }
          self._sweepArmed = false;
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
    draw: function (g, key, gripX, gripY, dirX, dirY, tipLen, alpha, tint) {
      var scene = g.scene;
      if (!this.ready(key, scene)) return false;
      if (!scene || !scene.add) return true;   // 잉크 프록시 패스 — 실루엣 생략
      var d = DATA[key];
      var img = this._acquire(key, scene);
      this._mount(img, g);
      if (tint) img.setTint(tint); else img.clearTint();
      var tex = scene.textures.get('gear-' + key).getSourceImage();
      var gripPx = tex.height * d.gripF;               // 이미지에서 grip→칼끝 픽셀
      var s = tipLen / gripPx;
      img.setVisible(true)
         .setOrigin(0.5, d.gripF)
         .setPosition(gripX, gripY)
         .setScale(s)
         .setRotation(Math.atan2(dirY, dirX) + Math.PI / 2)
         .setAlpha(alpha == null ? 1 : alpha);
      this._order(img, g, false);
      return true;
    },

    /**
     * 이미지 세로축을 (x0,y0)→(x1,y1) 구간에 눕힌다. x0/y0 = 이미지 **위쪽 끝**
     * (활 위 고자·창끝), x1/y1 = 아래쪽 끝. flipX 는 좌우 거울(활대 방향 등).
     */
    //  behind: 뒤를 보는 방향에서는 이미지를 Graphics(몸)보다 반 단계 아래에 둔다 —
    //  벡터 시절엔 "먼저 그려서" 가려졌지만 이미지는 별도 객체라 순서가 안 통한다.
    drawSpan: function (g, key, x0, y0, x1, y1, alpha, flipX, behind) {
      var scene = g.scene;
      if (!this.ready(key, scene)) return false;
      if (!scene || !scene.add) return true;   // 잉크 프록시 패스 — 실루엣 생략
      var img = this._acquire(key, scene);
      this._mount(img, g);
      var tex = scene.textures.get('gear-' + key).getSourceImage();
      var dx = x1 - x0, dy = y1 - y0;
      var s = Math.sqrt(dx * dx + dy * dy) / tex.height;
      img.setVisible(true)
         .setOrigin(0.5, 0)
         .setPosition(x0, y0)
         .setScale(flipX ? -s : s, s)
         .setRotation(Math.atan2(dy, dx) - Math.PI / 2)
         .setAlpha(alpha == null ? 1 : alpha);
      this._order(img, g, !!behind);
      return true;
    },

    /** 중심 (x,y) 에 w×h 로 얹는다(방패처럼 축이 없는 물건). tint 는 등급색.
     *  behind: 몸(Graphics)보다 반 단계 아래 — 망토·화살통이 정면에서 등 뒤로 가는 길.
     *  벡터 시절엔 "먼저 그려서" 가려졌지만 이미지는 별도 객체라 순서가 안 통한다. */
    place: function (g, key, x, y, w, h, alpha, tint, add, behind) {
      var scene = g.scene;
      if (!this.ready(key, scene)) return false;
      if (!scene || !scene.add) return true;   // 잉크 프록시 패스 — 실루엣 생략
      var img = this._acquire(key, scene);
      this._mount(img, g);
      var tex = scene.textures.get('gear-' + key).getSourceImage();
      img.setVisible(true)
         .setOrigin(0.5, 0.5)
         .setPosition(x, y)
         .setScale(w / tex.width, h / tex.height)
         .setRotation(0)
         .setAlpha(alpha == null ? 1 : alpha);
      this._order(img, g, !!behind);
      //  ⚠ 풀 재사용 — 틴트·블렌드를 안 지우면 다른 자리가 이전 상태로 물든다.
      if (tint != null) img.setTint(tint); else img.clearTint();
      img.setBlendMode(add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
      return true;
    }
  };
})();
