window.GAME = window.GAME || {};

// ============================================================================
//  용 몸 — 래스터 자산 (2026-08-02 3차, 사용자 지시)
//
//  "벡터를 떠나서 너무 구리긴 한데" — 맞는 말이었다. 좌표를 아무리 옮겨도
//  **삽화를 그리는 실력 자체**는 안 생긴다. `js/bossart.js` 의 곡선·그라디언트
//  버전(3차까지 다듬음)도 "유아용 책 수준"을 못 벗어났다. 그래서 실제로 그려진
//  자산으로 간다 — CC0(저작자 표시 불필요, 상업적 이용 가능) 라이선스만 찾았다
//  (`../CLAUDE.md` 의 "AI 생성이 면죄부가 아니다"와 같은 결로, 라이선스 없는
//  자산은 안 쓴다). 이 프로젝트 전체에서 **유일한 비트맵 게임 아트**다.
//
//  출처: OpenGameArt "Pixel Bosses. Yes!"(세 머리 용 부분만 오려 씀)
//  https://opengameart.org/content/pixel-bosses-yes — CC0 1.0 Universal.
//
//  ## 왜 별도 파일이고 왜 영속 Image 인가
//  이 게임의 모든 아트는 Phaser **Graphics** 로 매 프레임 새로 그린다("자산 0KB").
//  Graphics 는 벡터 전용이라 비트맵을 못 그린다 — 그래서 이것만은 **영속
//  Phaser.Image**(한 번 만들고 위치만 갱신)를 쓴다. `js/bossart.js` 의 `BA.draw` 가
//  용 몸 종류(foot/claw/wingpart/halfface/waking/dragon)일 때만 이리로 넘긴다.
//
//  ## 부위 자르기 — "잘라서 보여주다가 300층에서 실제 용과" (사용자 2차 지시)
//  한 원본 그림 안에서 사각형만 다르게 잘라 쓴다. **같은 그림의 일부**라는 것이
//  크롭 좌표 하나로 보장된다 — 따로 그린 그림이면 "저게 다 한 마리였다"는
//  느낌이 안 산다. 좌표는 `tools/dragon-parts-grid.js` 로 실측했다(격자 이미지에
//  자를 사각형을 겹쳐 그리고 눈으로 확인 — `scratchpad/partgrid.png`).
//
//  ## 부위전은 크기가 정체다 — "부위랑 싸울 땐 크기를 크게 키워도 된다" (3차 지시)
//  50~250층은 이기는 게 아니라 크기를 먼저 보여주는 것이다(js/bossart.js 헤더 참조).
//  그래서 부위별 배율(`PARTS[k].scale`)을 판정 반지름(`def.radius`)보다 훨씬
//  크게 잡는다 — 화면을 압도해야 그 목적이 산다. 300층 본체는 상대적으로 낮춰
//  실제 회피 전투가 가능한 크기로 둔다.
// ============================================================================
(function () {
  var DA = GAME.DragonAsset = {};

  DA.KEY = 'dragonBossRaster';
  DA.URL = 'assets/dragon-boss.png';   // 1000×605, 알파 투명, 37KB
  DA.SRC_W = 1000; DA.SRC_H = 605;

  //  원본 이미지 안에서 부위별 사각형 [x, y, w, h](px) — `tools/dragon-parts-grid.js`
  //  로 실측. `scale` 은 그리는 배율의 배수(아래 `draw()` 의 `HEIGHT_BASE` 에 곱한다).
  DA.PARTS = {
    foot:     { rect: [365, 395, 130, 135], scale: 1.35 },
    claw:     { rect: [655, 375, 145, 155], scale: 1.30 },
    wingpart: { rect: [115,  20, 530, 330], scale: 0.85 },
    halfface: { rect: [735, 220, 245, 190], scale: 1.15 },
    waking:   { rect: [330, 145, 420, 300], scale: 0.78 },
    dragon:   { rect: [  0,   0,1000, 605], scale: 0.62 }
  };

  //  ⚠ 이 값을 실측 없이 크게 잡았다가 40층 녹이는 시간이 341초가 나온 적이 있다
  //    (전투 밸런스 얘기지만 같은 교훈: **과보정도 버그다**). 화면을 실제로 찍어
  //    보고 정했다 — `scratchpad/rasterboss-*.png`.
  DA.HEIGHT_BASE = 7.0;

  DA._loading = false;
  DA._ready = false;

  //  텍스처를 아직 못 읽었으면 로드를 건다. 여러 보스가 동시에 물어봐도
  //  `_loading` 으로 한 번만 돌게 막는다.
  DA.ensure = function (scene) {
    if (!scene) return;
    if (DA._ready || scene.textures.exists(DA.KEY)) { DA._ready = true; return; }
    if (DA._loading) return;
    DA._loading = true;
    scene.load.image(DA.KEY, DA.URL);
    scene.load.once('complete', function () { DA._ready = true; DA._loading = false; });
    // ⚠ 실패해도 게임이 멈추면 안 된다 — 텍스처가 없으면 draw() 가 조용히
    //   아무것도 안 그리고(그림자만 남는다), 전투는 그대로 진행된다.
    scene.load.once('loaderror', function () { DA._loading = false; });
    scene.load.start();
  };

  //  이 게임의 보스 층은 **한 번에 하나**만 나온다(설계 전제 — `Tower.bossFor`
  //  참조). 그래서 유닛마다 이미지를 따로 두지 않고 **슬롯 하나만 재사용**한다.
  //  씬이 바뀌면(전투 종료→다음 화면) 이전 씬 소속 Image 는 죽은 참조가 되므로
  //  `.scene` 을 비교해 다시 만든다.
  DA._img = null;

  DA.draw = function (scene, kind, sx, sy, r0, alpha, facing, depthHint) {
    var part = DA.PARTS[kind];
    if (!part || !scene) return false;
    DA.ensure(scene);
    if (!DA._ready) return false;   // 로딩 중 — 이번 프레임은 건너뛴다(그림자만 남는다)

    if (!DA._img || DA._img.scene !== scene) {
      if (DA._img) { try { DA._img.destroy(); } catch (e) {} }
      DA._img = scene.add.image(0, 0, DA.KEY);
    }
    var img = DA._img, rect = part.rect;
    img.setCrop(rect[0], rect[1], rect[2], rect[3]);
    // ⚠ **`setCrop` 은 GameObject 의 width/height 를 안 줄인다** — 원본 텍스처
    //   전체(1000×605) 기준으로 남는다(실측: origin(0.5,1) 을 줬더니 화면 완전히
    //   엉뚱한 자리에 나왔다). 그래서 origin 을 "잘라낸 사각형이 전체 텍스처의
    //   어디쯤인가"로 직접 계산한다 — 그래야 setPosition 이 크롭된 부위의
    //   발밑(가로 가운데·세로 아래)에 정확히 맞는다.
    img.setOrigin((rect[0] + rect[2] / 2) / DA.SRC_W, (rect[1] + rect[3]) / DA.SRC_H);
    var targetH = r0 * DA.HEIGHT_BASE * part.scale;
    img.setScale(targetH / rect[3]);
    img.setPosition(sx, sy);
    img.setFlipX(facing !== undefined && Math.cos(facing) < 0);
    img.setAlpha(alpha === undefined ? 1 : alpha);
    // ⚠ 표시목록 삽입 순서에 기대면 안 된다(실측: 잔디 배경 밑에 깔려 안 보였다).
    //   호출부(js/bossart.js) 가 넘긴 Graphics 의 depth 바로 위에 고정한다.
    img.setDepth((depthHint || 0) + 0.5);
    img.setVisible(true);
    return true;
  };

  //  전투가 끝나거나 다른 보스로 바뀔 때 슬롯을 숨긴다. 지우지는 않는다 —
  //  다음 보스가 바로 이어 나오면(예: 연속 도전) 또 로드를 기다릴 필요가 없다.
  DA.hide = function () { if (DA._img) DA._img.setVisible(false); };
})();
