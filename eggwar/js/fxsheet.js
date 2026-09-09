window.GAME = window.GAME || {};
// ============================================================================
//  스킬 이펙트 **스프라이트 시트** (2026-09-09)
//
//  왜 있나: 보스를 힉스필드 그림으로 갈아엎고 나니 이펙트만 벡터 도형으로 남아
//  격이 안 맞았다. 태현님 신고 "스킬이펙트도 그대로임 하나도 바뀐게없음".
//  실측(시전 후 시점별 촬영): 이펙트 존재감이 화면의 1.6~20.3% 로 열세 배 차이가
//  나고, 굵기·채움이 아니라 **선 몇 겹**이라 그림 옆에서 초라했다.
//
//  ⚠⚠ `js/skillfx.js` 는 **Graphics 전용**이다(이미지 호출 0건). 그래서 이 파일이
//    따로 있다 — skillfx 를 이미지까지 알게 고치면 그 파일이 두 언어를 쓰게 되고,
//    이 저장소가 `eggart`/`ui` 에서 이미 겪은 "두 벌이 조용히 갈라진다"가 재발한다.
//    여기는 **덧그리는 층**이다: 벡터는 그대로 두고 그 위에 그림 한 장을 얹는다.
//    시트가 없으면 아무 일도 안 일어난다(opt-in) — 벡터만 그려지던 예전 그대로다.
//
//  ⚠ 보스(`bossbank`)와 다른 점 둘:
//    ① 보스는 한 번에 하나지만 **이펙트는 동시에 여럿**이다 → Image 풀을 돌려 쓴다.
//       매 프레임 만들면 v1.66 이 확정한 GC 렉이 그대로 재발한다.
//    ② 보스는 발이 땅에 닿아야 하지만 이펙트는 **터지는 자리가 중심**이다
//       → origin(0.5, 0.5). 시트도 가운데 정렬로 굽는다(`tools/fx-sheet.sh`).
//
//  ⚠ 재생은 **한 방향**이다(왕복 금지). 터졌다가 사그라드는 것이라 되감으면
//    폭발이 빨려 들어간다.
//
//  ES5 · 콜백만(게임 클라이언트 규약).
// ============================================================================
GAME.FxSheet = (function () {
  'use strict';

  //  시트 표. 키가 곧 파일명이다(`assets/fxsheet/<키>.png`).
  //  ⚠ 여기 없는 종류는 **아무 일도 안 한다** — 벡터가 그대로 그린다.
  var SHEETS = {
    blast:  { frames: 12, tile: 192, ms: 520, add: 1 },      // 폭발 — 광역기가 터지는 순간
    impact: { frames: 12, tile: 192, ms: 420, add: 1 },      // 충격 — 강타·내리찍기
    circle: { frames: 12, tile: 192, ms: 900, ground: 1 },   // 마법진 — 영역·오라
    aura:   { frames: 12, tile: 192, ms: 700, add: 1 }       // 상승 오라 — 버프
  };

  //  ⚠⚠ `add: 1` — **더하기 합성**이다. 두 가지를 한 번에 푼다:
  //    ① 크로마키가 남긴 어두운 테두리가 **저절로 사라진다**(검정은 더해도 0).
  //       실측 스크린샷에서 폭발이 「검은 판 위의 파란 덩어리」로 읽히던 것이 그것이다.
  //    ② 폭발·충격·오라는 **빛**이다. 곱하기로 얹으면 밝을수록 배경을 어둡게 만들어
  //       "터졌다"가 아니라 "얼룩이 졌다"가 된다.
  //  ⚠ 마법진(circle)만 보통 합성이다 — 그건 **땅에 그린 잉크**라 더하면 통째로 날아간다.
  //    합성 방식은 그림의 성질이 정한다. 표를 넓힐 때 여기부터 정할 것.

  //  ⚠ `ground: 1` 은 **지면에 눕힌다**(세로를 Iso.TILT 로 누른다). 마법진은 땅에
  //    그린 것이라 정원으로 두면 이 게임의 기울인 화면에서 혼자 서 있는 판이 된다.
  //    폭발·오라는 위로 솟는 것이라 누르면 안 된다 — 벡터 고리와 같은 규율이다.

  var POOL_MAX = 8;          // 동시에 뜨는 이펙트 상한(폰 예산)
  var _pool = [];            // {img, until, kind}
  var _loaded = {};
  var _missing = {};
  var _hooked = false;

  function texKey(kind) { return 'fxsheet:' + kind; }

  //  ⚠ 없는 파일을 매 프레임 GET 하면 404 가 CDN 에 눌어붙는다(CLAUDE.md 배포 함정).
  //    한 번 실패하면 그 키는 영영 다시 요청하지 않는다.
  function hookErr(scene) {
    if (_hooked || !scene.load) return;
    _hooked = true;
    scene.load.on('loaderror', function (f) {
      if (f && f.key && f.key.indexOf('fxsheet:') === 0) _missing[f.key] = true;
    });
  }

  //  칸을 텍스처 프레임으로 등록한다. `setCrop` 은 표시 크기를 안 줄이는 함정이라 쓰지 않는다
  //  (bossbank 와 같은 규율 — dragonasset 사고).
  function ensureFrames(scene, kind) {
    var m = SHEETS[kind], k = texKey(kind);
    if (!scene.textures.exists(k)) return false;
    var tex = scene.textures.get(k);
    if (tex.has('f0')) return true;
    var src = tex.getSourceImage();
    //  ⚠ 실물이 표와 안 맞으면 등록하지 않는다 — 어긋난 채 그리면 이웃 칸이 비친다.
    if (src.width !== m.tile * m.frames || src.height !== m.tile) return false;
    for (var i = 0; i < m.frames; i++) tex.add('f' + i, 0, i * m.tile, 0, m.tile, m.tile);
    return true;
  }

  function ensure(scene, kind) {
    if (!SHEETS[kind] || !scene || !scene.load) return;
    var k = texKey(kind);
    if (scene.textures.exists(k) || _missing[k] || _loaded[k]) return;
    _loaded[k] = true;
    hookErr(scene);
    scene.load.image(k, 'assets/fxsheet/' + kind + '.png?v=' + (GAME.VERSION || '').replace('v', ''));
    scene.load.start();
  }

  //  판마다 처음 한 번 — 쓸 시트를 미리 부른다(전투 중 로딩 튐 방지).
  function preload(scene) {
    for (var k in SHEETS) ensure(scene, k);
  }

  function take(scene) {
    var now = scene.time.now, i;
    for (i = 0; i < _pool.length; i++) {
      var e = _pool[i];
      if (!e.img || !e.img.scene) { _pool.splice(i, 1); i--; continue; }
      if (e.until <= now) return e;
    }
    if (_pool.length >= POOL_MAX) return null;
    var img = scene.add.image(0, 0, '__DEFAULT');
    img.setOrigin(0.5, 0.5).setVisible(false);
    var slot = { img: img, until: 0, kind: null };
    _pool.push(slot);
    return slot;
  }

  return {
    SHEETS: SHEETS,
    preload: preload,
    ensure: ensure,

    //  이펙트 한 장을 그 자리에 재생한다.
    //    kind — SHEETS 의 키. 없으면 조용히 false(벡터가 그린다).
    //    x,y  — 화면 좌표(호출부가 Iso 로 이미 옮긴 값)
    //    r    — 반지름(화면px). 시트를 이 지름에 맞춘다.
    //    tint — 재료 색(0xRRGGBB). 주면 곱연산으로 물들인다.
    //  반환 true 면 그렸다.
    play: function (scene, kind, x, y, r, tint) {
      if (!scene || !SHEETS[kind]) return false;
      var k = texKey(kind);
      if (!scene.textures.exists(k)) { this.ensure(scene, kind); return false; }
      if (!ensureFrames(scene, kind)) return false;
      var slot = take(scene);
      if (!slot) return false;                    // 상한 초과 — 벡터만 그린다
      var m = SHEETS[kind];
      slot.kind = kind;
      slot.until = scene.time.now + m.ms;
      slot.startedAt = scene.time.now;
      var img = slot.img;
      img.setTexture(k, 'f0');
      img.setPosition(x, y);
      //  ⚠ 지름 = 반지름 × 2. 시트 타일이 정사각이므로 한 변으로 맞춘다.
      //    지면에 눕는 것만 세로를 눌러 기울인 화면에 붙인다.
      var ty = m.ground ? ((GAME.Iso && GAME.Iso.TILT) || 0.72) : 1;
      img.setDisplaySize(r * 2, r * 2 * ty);
      img.setVisible(true);
      //  ⚠ tint 는 **밝은 픽셀만** 물든다 — 흰 섬광이 재료 색(영웅·보스 결)을 받는다.
      if (tint) img.setTint(tint); else img.clearTint();
      var BM = (window.Phaser && Phaser.BlendModes) || null;
      img.setBlendMode(m.add && BM ? BM.ADD : (BM ? BM.NORMAL : 0));
      //  전장 컨테이너에 태운다 — 안 그러면 줌과 따로 논다(bossbank 와 같은 함정).
      if (scene.worldLayer && img.parentContainer !== scene.worldLayer) scene.worldLayer.add(img);
      return true;
    },

    //  매 프레임 — 칸을 넘기고 수명이 끝난 것을 숨긴다.
    //  ⚠ 시계는 **렌더 시계**(scene.time.now)다. 시뮬 시계를 쓰면 배속·히트스톱에
    //    그림이 끌려간다(bossbank 규율 그대로).
    update: function (scene) {
      if (!scene) return;
      var now = scene.time.now;
      for (var i = 0; i < _pool.length; i++) {
        var e = _pool[i];
        if (!e.img || !e.img.scene) { _pool.splice(i, 1); i--; continue; }
        if (!e.kind) continue;
        if (e.until <= now) { if (e.img.visible) e.img.setVisible(false); continue; }
        var m = SHEETS[e.kind];
        var p = (now - e.startedAt) / m.ms;        // 0..1 — **한 방향**(왕복 금지)
        var fi = Math.min(m.frames - 1, Math.max(0, Math.floor(p * m.frames)));
        var fn = 'f' + fi;
        if (!e.img.frame || e.img.frame.name !== fn) e.img.setFrame(fn);
        //  꼬리에서 서서히 사그라든다 — 뚝 끊기면 "사라졌다"가 아니라 "끊겼다"로 읽힌다.
        e.img.setAlpha(p > 0.72 ? Math.max(0, (1 - p) / 0.28) : 1);
      }
    },

    //  씬을 나갈 때 — 풀을 비운다.
    //  ⚠ 씬 인스턴스는 재사용된다. 안 비우면 파괴된 Image 를 다시 만지고
    //    Phaser 내부에서 터진다(이 저장소가 세 번 겪은 계열).
    reset: function () {
      for (var i = 0; i < _pool.length; i++) {
        var im = _pool[i].img;
        if (im && im.destroy) { try { im.destroy(); } catch (e) {} }
      }
      _pool = [];
      _loaded = {};
      _hooked = false;
    }
  };
})();
