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
  //  `frame` 은 아래 "찢긴 테두리" 연출에 쓰는 종류(ground/wall)와 어느 변에
  //  테두리를 그릴지(top/left/right/bottom) — 사용자 지시(2026-08-02 4차):
  //  "그대로 크롭해서 오는 게 아니라 참고해서 몬스터 형태로 만들어 보여주길
  //  원해." 직사각형을 그냥 잘라 붙이면 팔·머리가 사고로 잘린 스크린샷처럼
  //  보인다 — 잘린 자리를 흙/돌무더기로 덮어 "땅·벽을 뚫고 나왔다"로 읽히게 한다.
  //  ⚠ 2026-08-02 5차 재크롭 — 이전엔 앞다리 두 짝이 한 사각형에 같이 걸려
  //    **다리 두 짝이 따로 노는 것**처럼 보였다(사용자 신고: "팔이 이상하게
  //    짤린것같다"). `tools/dragon-parts-grid.js` 로 원본 전체를 다시 실측해
  //    **서로 다른, 겹치지 않는 다리 두 개**를 새로 찾았다(뒷다리 한 쌍, 몸통
  //    중앙 기준 좌/우) — foot 은 왼쪽 것, claw 는 오른쪽 것. 이제 한쪽이
  //    잘려도 다른 쪽 실루엣이 섞여 들지 않는다.
  //  ⚠ 발/손 연출이 5차에서 뒤바뀌었다(사용자 재지시) — 발(50층)은 **땅속에서
  //    튀어나온 모습**(frame:'ground'), 손(100층)은 **위에서 시작해 화면 위가
  //    잘려 안 보이는** 모습(정적 크롭이 아니라 스킬 windup 문제로 재분류 —
  //    `js/units.js` bossDragonClaw 의 shockwave 참조. 그래서 frame 없음).
  DA.PARTS = {
    // ⚠ scale 은 처음 1.75/1.65 로 잡았다가 실측(스크린샷)에서 아레나 밖으로
    //   완전히 넘쳐버렸다 — 크롭이 작을수록(=rect[3] 이 작을수록) 같은 배수라도
    //   targetH 가 훨씬 커진다는 걸 숫자로만 계산하고 화면으로 확인 안 해서 생긴
    //   사고다. 화면에 실제로 띄워 보고 다시 잡았다(`scratchpad/boss-shot.js`).
    foot:     { rect: [600, 448, 76, 92], scale: 0.85, frame: 'ground', edges: ['top', 'left', 'right'] },
    claw:     { rect: [686, 450, 90, 88], scale: 0.80, frame: null,     edges: [] },
    wingpart: { rect: [115,  20, 530, 330], scale: 0.85, frame: 'ground', edges: ['right'] },
    halfface: { rect: [735, 220, 245, 190], scale: 1.15, frame: 'wall',   edges: ['left', 'bottom'] },
    waking:   { rect: [330, 145, 420, 300], scale: 0.78, frame: 'ground', edges: ['top', 'right'] },
    // 300층 본체 — "원래 보스보다 좀 더 큰 크기로 진행해도 충분해"(사용자 지시).
    dragon:   { rect: [  0,   0,1000, 605], scale: 0.72, frame: null,     edges: [] }
  };

  //  경계 마감(흙더미/돌무더기)을 그리려면 부위가 화면에 실제로 얼마나 크게
  //  그려지는지가 필요하다(`js/bossart.js` 가 소비). `draw()` 안의 스케일 계산과
  //  갈라지면 프레임이 몸과 안 맞게 되므로, 계산을 여기 한 곳에만 둔다.
  DA.targetSize = function (kind, r0) {
    var part = DA.PARTS[kind];
    if (!part) return null;
    var h = r0 * DA.HEIGHT_BASE * part.scale;
    var w = h * (part.rect[2] / part.rect[3]);
    return { w: w, h: h };
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

  //  ⚠ 2026-08-02 5차 — **`setCrop` 만으로는 작은 부위를 못 키운다.** `setCrop`
  //  은 GameObject 의 width/height 를 안 줄인다(원본 텍스처 1000×605 기준 그대로
  //  남는다) — 그래서 `setScale(targetH/rect[3])` 이 크롭 사각형이 아니라 **원본
  //  전체**에 곱해진다. 발(rect 높이 92)처럼 크롭이 작을수록 같은 targetH 를
  //  내려면 배율이 커지고, 원본 전체가 가로 4000px 넘게 부풀어(실측: 4030×2438)
  //  렌더러가 그 크기를 그냥 통째로 못 그린다(스크린샷엔 그림자만 남고 몸이
  //  안 보였다 — 발/손 둘 다 재현). 날개(rect 530)처럼 큰 크롭은 우연히
  //  안전 범위 안이라 멀쩡했다.
  //  → 해법: 부위마다 **크롭 크기만큼의 작은 텍스처를 한 번 구워** 둔다
  //  (`RenderTexture.saveTexture`). 그 작은 텍스처에 배율을 곱하면 커져도
  //  가로 수백~천 px 대라 안전하다. 원본 픽셀은 안 건드린다 — 그냥 오려서
  //  저장할 뿐이다.
  DA._partTexReady = {};
  DA._ensurePartTexture = function (scene, kind) {
    var texKey = DA.KEY + ':' + kind;
    if (DA._partTexReady[texKey] && scene.textures.exists(texKey)) return texKey;
    var part = DA.PARTS[kind];
    var rect = part.rect;
    var rt = scene.add.renderTexture(0, 0, rect[2], rect[3]);
    rt.setVisible(false);
    // RenderTexture 좌표계는 자기 캔버스의 (0,0)이 좌상단이다 — 원본에서
    // (rect[0],rect[1])이 그 자리에 오도록 원본 전체를 반대 방향으로 밀어서 그린다.
    rt.draw(DA.KEY, -rect[0], -rect[1]);
    rt.saveTexture(texKey);
    rt.destroy();
    DA._partTexReady[texKey] = true;
    return texKey;
  };

  DA.draw = function (scene, kind, sx, sy, r0, alpha, facing, depthHint) {
    var part = DA.PARTS[kind];
    if (!part || !scene) return false;
    DA.ensure(scene);
    if (!DA._ready) return false;   // 로딩 중 — 이번 프레임은 건너뛴다(그림자만 남는다)

    var texKey = DA._ensurePartTexture(scene, kind);
    if (!DA._img || DA._img.scene !== scene) {
      if (DA._img) { try { DA._img.destroy(); } catch (e) {} }
      DA._img = scene.add.image(0, 0, texKey);
    }
    var img = DA._img;
    if (img.texture.key !== texKey) img.setTexture(texKey);
    // 부위 텍스처가 곧 크롭 그 자체라 원본 좌표를 안 나눠도 된다 — 발밑
    // 가로가운데·세로아래가 그냥 (0.5, 1)이다.
    img.setOrigin(0.5, 1);
    var targetH = r0 * DA.HEIGHT_BASE * part.scale;
    img.setScale(targetH / part.rect[3]);
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
