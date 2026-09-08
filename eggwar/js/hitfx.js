// ============================================================================
//  js/hitfx.js — 타격 파티클 (2026-08-04 디자인 대개편 1단계)
//
//  ## 왜 만드나
//  사용자 진단: "지금은 그냥 ai 조금 건드려서 만든 조잡한 게임느낌".
//  레퍼런스(브롤스타즈·세븐나이츠급)와 우리 화면을 나란히 놓고 실측한 결과, 가장 큰
//  차이는 그림 실력이 아니라 **피드백의 부재**였다. 때려도 아무것도 튀지 않는다.
//  이 저장소에는 히트스톱·화면 흔들림·피격 플래시가 이미 있는데(js/scenes/battle.js
//  `_juice`), **파티클만 통째로 없었다**(`add.particles` 검색 결과 0건).
//
//  ## 자산 0KB 를 어떻게 지키나
//  Phaser 파티클은 텍스처가 필요하다. 그런데 이 프로젝트는 그림 파일을 안 쓴다
//  (유일한 예외가 300층 용 한 장이고, 그건 CLAUDE.md 에 따로 적힌 의식적 예외다).
//  → **런타임에 Graphics 로 그려 `generateTexture` 로 굽는다.** 파일이 안 늘고,
//    색은 `tint` 로 갈아 끼우므로 점 하나짜리 텍스처 셋이면 전부 커버된다.
//
//  ## 이 파일이 지키는 경계
//  ⚠ **렌더 전용이다.** `js/combat.js` 를 한 줄도 안 건드린다 — 전투 판정·밸런스가
//    움직이면 CLAUDE.md 가 실측으로 잡아 둔 회귀 기준선(R-1/R-3/R-4/R-5)이 전부
//    같이 흔들린다. 여기는 이미 일어난 일을 **그리기만** 한다.
//  ⚠ 파티클은 `worldLayer` 에 넣는다 — 전장이 확대/이동하면 같이 따라가야 한다
//    (피해 숫자가 같은 이유로 거기 들어가 있다).
//  ⚠ 거리·속도는 `WORLD_SCALE` 을 곱한다. 폰 세로는 전장이 0.556 배라, 안 곱하면
//    같은 튀김이 화면의 두 배를 덮는다(이 폴더가 사거리에서 이미 겪은 함정).
// ============================================================================
(function () {
  'use strict';

  var HitFX = {
    //  텍스처 키 — 텍스처 매니저는 게임당 하나라 씬을 옮겨도 다시 안 굽는다.
    T_DOT: 'eggfx-dot',
    T_CHIP: 'eggfx-chip',
    T_RING: 'eggfx-ring',

    //  한 판에 살아 있을 수 있는 파티클 총량. 난전에서 수천 개가 뜨면 그게 곧 렉이다.
    //
    //  ⚠⚠ **모바일 상한을 따로 둔다** (2026-08-04 사용자 리포트: "보통 모바일에서
    //    렉 발생"). CPU 4배 스로틀(중급 안드로이드 재현)로 측정하니, 느린 프레임
    //    (p95 이상)과 빠른 프레임(p50 이하)을 가른 지표 중 **파티클이 2.31배**로
    //    가장 강한 상관이었다(이펙트 1.53배 · 유닛 0.99배 · Text 재굽기 0.65배).
    //    즉 유닛 수나 글자 재굽기가 아니라 **파티클이 모바일 프레임을 먹는다.**
    //  ⚠ 데스크톱 값을 낮추지는 않는다 — 거기서는 문제가 관측되지 않았고,
    //    한 값으로 합치면 잘 도는 기기의 연출까지 같이 깎인다.
    //  ⚠ 판정은 **`CONFIG.PHONE`(폰 가로)** 이 기준이다. 이 게임은 모바일에서
    //    가로 전용이고(index.html 의 `#rotate` 가 세로면 회전을 요구한다) 실제
    //    플레이는 전부 820×390 폰 가로 프로필로 돈다. `PORTRAIT` 는 회전 안내가
    //    뜨는 동안의 프로필이라 전투가 돌지 않지만, 태블릿 등 회전 안내를 안 띄우는
    //    경우를 대비해 같이 걸어 둔다(있어도 해롭지 않고, 빠지면 그 기기만 샌다).
    get MAX_ALIVE() {
      var C = GAME.CONFIG;
      return (C && (C.PHONE || C.PORTRAIT)) ? 110 : 260;
    },

    _tex: function (scene) {
      if (scene.textures.exists(this.T_DOT)) return;
      var g = scene.make.graphics({ x: 0, y: 0, add: false });

      //  ① 둥근 점 — 노른자 방울·불똥의 기본. 가장자리를 한 겹 흐려 각이 안 진다.
      g.clear();
      g.fillStyle(0xffffff, 0.35); g.fillCircle(8, 8, 8);
      g.fillStyle(0xffffff, 1);    g.fillCircle(8, 8, 5.2);
      g.generateTexture(this.T_DOT, 16, 16);

      //  ② 조각 — 돌·뼈·나무가 깨질 때. 삼각형이라 회전이 눈에 보인다.
      g.clear();
      g.fillStyle(0xffffff, 1);
      g.fillTriangle(1, 11, 6, 1, 11, 9);
      g.generateTexture(this.T_CHIP, 12, 12);

      //  ③ 고리 — 충격파 한 겹. 크게 키워 얇게 퍼지는 데 쓴다.
      g.clear();
      g.lineStyle(3, 0xffffff, 1); g.strokeCircle(16, 16, 13);
      g.generateTexture(this.T_RING, 32, 32);

      g.destroy();
    },

    //  씬마다 한 번. 방출기는 **종류당 하나만** 만들고 `explode` 로 쏜다 —
    //  타격마다 새로 만들면 GC 가 전투 중에 튄다.
    init: function (scene) {
      this._tex(scene);
      var S = (GAME.CONFIG && GAME.CONFIG.WORLD_SCALE) || 1;
      var M = GAME.UI && GAME.UI.MAT ? GAME.UI.MAT : {};
      var mk = function (tex, cfg) {
        cfg.emitting = false;
        var e = scene.add.particles(0, 0, tex, cfg);
        e.setDepth(620);                       // 유닛 위, HUD 아래
        if (scene.worldLayer) scene.worldLayer.add(e);
        return e;
      };

      //  노른자 — 이 게임의 피다. 무거워서 아래로 떨어지고 금방 사라진다.
      scene._fxYolk = mk(this.T_DOT, {
        speed: { min: 30 * S, max: 130 * S },
        angle: { min: 200, max: 340 },          // 위쪽으로 튄다
        gravityY: 420 * S,
        scale: { start: 1.05, end: 0.10 },
        alpha: { start: 1, end: 0.1 },
        lifespan: { min: 240, max: 460 },
        tint: [M.yolk || 0xffc233, M.yolkLite || 0xffe89a, 0xffb01f],
        rotate: { min: 0, max: 360 }
      });

      //  불똥 — 금속·돌에 부딪힐 때. 가볍고 빠르고 밝다(ADD 로 겹치면 하얘진다).
      scene._fxSpark = mk(this.T_DOT, {
        speed: { min: 90 * S, max: 260 * S },
        angle: { min: 0, max: 360 },
        gravityY: 60 * S,
        scale: { start: 0.62, end: 0 },
        alpha: { start: 1, end: 0 },
        lifespan: { min: 110, max: 240 },
        tint: [0xfff3cd, 0xffd98a, 0xffffff],
        blendMode: 'ADD'
      });

      //  조각 — 방패·껍질·나무가 깨질 때. 회전하며 떨어진다.
      scene._fxChip = mk(this.T_CHIP, {
        speed: { min: 40 * S, max: 170 * S },
        angle: { min: 190, max: 350 },
        gravityY: 520 * S,
        scale: { start: 1.5, end: 0.7 },
        alpha: { start: 1, end: 0 },
        lifespan: { min: 300, max: 620 },
        rotate: { start: 0, end: 360 },
        tint: [M.bone || 0xeae3cd, M.stone || 0x8b8578, M.woodDark || 0x5a452c]
      });

      //  먼지 — 발밑·착지. 옆으로 낮게 퍼진다.
      scene._fxDust = mk(this.T_DOT, {
        speed: { min: 20 * S, max: 90 * S },
        angle: { min: 240, max: 300 },
        gravityY: -20 * S,
        scale: { start: 0.9, end: 2.0 },
        alpha: { start: 0.42, end: 0 },
        lifespan: { min: 260, max: 520 },
        tint: [0xd8cbb0, 0xbfae90]
      });

      //  ── 충격 고리 (2026-09-09 신설) ─────────────────────────────────────
      //  ⚠ **텍스처(`T_RING`)는 2026-08-04 부터 구워지고 있었는데 쓰는 방출기가
      //    하나도 없었다**(실측: `_fxRing` 검색 0건). 즉 매 씬마다 32×32 를 굽고
      //    버리고 있었다 — 이 저장소가 `LobbyArt.mark`·`GfxPool.verify` 에서 두 번
      //    겪은 "그리는 코드는 있는데 붙이는 사람이 없다"의 세 번째 판이다.
      //  왜 고리인가: 지금 타격은 **양**으로만 세기를 말한다(같은 알갱이가 더 많이).
      //  그래서 큰 타격과 작은 타격이 난전에서 구분이 안 된다. 고리는 **한 개**로
      //  "여기서 뭔가 터졌다"를 말하므로 파티클 예산을 거의 안 쓰고 세기를 만든다.
      //  ⚠ 큰 타격·처치에만, **한 번에 하나**. 매 타격에 붙이면 화면이 고리밭이 되고
      //    그건 전장을 가려 회피를 망친다(이 게임의 제1규율).
      //  ⚠ 크기는 **`WORLD_SCALE` 을 탄다.** 폰은 전장이 0.556 배라, 안 곱하면 같은
      //    고리가 화면에서 두 배로 커져 전장을 가린다(이 파일 머리의 규율 그대로).
      //  ⚠ 색은 테마 토큰에서 뽑는다(`FX.blast`/`FX.sparkCore`). 흰색을 박으면
      //    라이트 테마(크림 목장)에서 밝은 바닥 위에 밝은 것이 얹혀 증발한다 —
      //    ui-theme.js 가 FX 표를 통째로 갈아끼우는 이유가 그것이다.
      var FXc = (GAME.UI && GAME.UI.FX) || {};
      scene._fxRing = mk(this.T_RING, {
        speed: 0,
        scale: { start: 0.35 * S, end: 1.9 * S },
        alpha: { start: 0.75, end: 0 },
        lifespan: 260,
        blendMode: 'ADD',
        tint: [FXc.sparkCore || 0xffffff, FXc.blast || 0xffd166]
      });

      scene._fxReady = true;
    },

    //  살아 있는 파티클이 상한을 넘으면 새로 안 쏜다.
    //  ⚠ 상한을 안 두면 난전에서 파티클이 프레임을 잡아먹는다 — 이 프로젝트가
    //    이미 "액션이 겹치면 프레임 저하"로 신고받은 자리다.
    _room: function (scene, want) {
      var n = 0, k = ['_fxYolk', '_fxSpark', '_fxChip', '_fxDust', '_fxRing'];
      for (var i = 0; i < k.length; i++) {
        var e = scene[k[i]];
        if (e && e.getAliveParticleCount) n += e.getAliveParticleCount();
      }
      if (n >= this.MAX_ALIVE) return 0;
      return Math.min(want, this.MAX_ALIVE - n);
    },

    //  ── 타격 ──────────────────────────────────────────────────────────────
    //  pct: 최대체력 대비 피해 비율(0~1). 크기·개수를 여기에 비례시킨다 —
    //  스치는 화살과 궁극기가 같은 양으로 튀면 정보가 사라진다.
    hit: function (scene, x, y, pct, kind) {
      if (!scene || !scene._fxReady) return;
      var big = Math.max(0, Math.min(1, pct || 0));
      //  ⚠ 한 번에 터지는 양도 모바일에서 줄인다. 상한만 낮추면 **큰 타격 한 번**에
      //    예산이 다 차서, 정작 그 뒤의 여러 타격이 통째로 안 튀는 역효과가 난다
      //    (상한은 총량 제한이지 분배 규칙이 아니다).
      var C = GAME.CONFIG, mob = !!(C && (C.PHONE || C.PORTRAIT));
      var want = mob ? (2 + Math.round(big * 6)) : (3 + Math.round(big * 12));
      var n = this._room(scene, want);
      if (n <= 0) return;
      //  '단단한 것'(방패·껍질·돌 유닛)은 노른자가 아니라 불똥과 조각이 튄다.
      if (kind === 'hard') {
        if (scene._fxSpark) scene._fxSpark.explode(n, x, y);
        if (big > 0.10 && scene._fxChip) scene._fxChip.explode(Math.max(1, (n / 3) | 0), x, y);
      } else {
        if (scene._fxYolk) scene._fxYolk.explode(n, x, y);
        if (big > 0.18 && scene._fxSpark) scene._fxSpark.explode(Math.max(1, (n / 4) | 0), x, y);
      }
      //  ── 큰 타격의 고리 (2026-09-09) ────────────────────────────────────
      //  ⚠ **문턱을 둔다(최대체력의 12%).** 매 타격에 붙이면 난전에서 고리가 겹쳐
      //    전장을 덮는다 — 예고 원이 안 보이면 그건 연출이 아니라 사고다.
      //    12% 는 평타로는 거의 안 닿고 스킬 한 방에는 닿는 선이다.
      //  ⚠ 하나만 쏜다. 세기는 이미 알갱이 **양**이 말하고 있고, 고리는 "지금 이건
      //    큰 것이었다"는 **한 번의 신호**여야 한다.
      if (big >= 0.12 && scene._fxRing && this._room(scene, 1) > 0) {
        scene._fxRing.explode(1, x, y);
      }
    },

    //  치명타 — 불똥을 한 겹 더 얹는다. 색이 아니라 **양**으로 구분한다
    //  (색으로만 구분하면 색맹 사용자에게 정보가 사라진다).
    //  ⚠ 지금 이 함수를 부르는 곳은 없다(실측: 호출 0건). 지우지 않는 이유는
    //    `js/scenes/battle.js` 가 치명타를 아는 자리를 이미 갖고 있어서(피해 숫자
    //    색) 붙이는 것이 한 줄이기 때문이다 — 붙이는 쪽은 그 파일 소유자의 몫이다.
    crit: function (scene, x, y) {
      if (!scene || !scene._fxReady) return;
      var n = this._room(scene, 14);
      if (n > 0 && scene._fxSpark) scene._fxSpark.explode(n, x, y);
      if (scene._fxRing && this._room(scene, 1) > 0) scene._fxRing.explode(1, x, y);
    },

    //  죽음 — 노른자가 크게 터진다. combat.js 의 `spawnYolk`(얼룩)과 **역할이 다르다**:
    //  저쪽은 바닥에 남는 자국, 이쪽은 튀는 방울이다. 둘이 같이 있어야 '터졌다'가 된다.
    death: function (scene, x, y, r) {
      if (!scene || !scene._fxReady) return;
      var n = this._room(scene, 16 + Math.round((r || 16) * 0.5));
      if (n <= 0) return;
      //  ── 껍질 조각 (2026-09-09) ─────────────────────────────────────────
      //  ⚠ 이 게임에서 죽는 것은 **껍질 하나짜리 목숨**인데, 지금까지 죽음은
      //    노른자와 먼지뿐이었다 — 알이 깨졌는데 껍질이 안 나왔다. 아트 디렉션
      //    ("매끈함(껍질) vs 거침(뼈·돌)") 이 정확히 이 대비를 요구한다.
      //  ⚠ 노른자 **예산을 나눠 쓴다** — 조각 수만큼 노른자를 뺀다. 모바일 상한(110)
      //    안에서 종류만 늘어나고 총량은 그대로다(파티클이 폰 프레임을 먹는다는
      //    2026-08-04 실측이 이 규율의 근거다).
      var chips = Math.min(n - 1, Math.max(2, (n / 5) | 0));
      var yolks = n - chips;
      if (scene._fxYolk) scene._fxYolk.explode(yolks, x, y);
      if (scene._fxChip) scene._fxChip.explode(chips, x, y);
      if (scene._fxDust) scene._fxDust.explode(Math.max(2, (yolks / 4) | 0), x, y);
      //  처치의 고리 — 한 개. "저기서 하나 죽었다"가 난전에서도 읽힌다.
      if (scene._fxRing && this._room(scene, 1) > 0) scene._fxRing.explode(1, x, y);
    },

    //  발밑 먼지 — 돌진·착지·시전 시작.
    dust: function (scene, x, y, amount) {
      if (!scene || !scene._fxReady) return;
      var n = this._room(scene, amount || 6);
      if (n > 0 && scene._fxDust) scene._fxDust.explode(n, x, y);
    }
  };

  GAME.HitFX = HitFX;
})();
