window.GAME = window.GAME || {};

// ============================================================================
//  로비 아트 — **영웅이 지키고 서 있는 첫 화면** (2026-08-01 사용자: "로비화면도 좀 구려")
//
//  ## 진단
//  로비를 찍어 보니 크림색 빈 배경에 글자와 버튼만 있었다. 이 게임의 가장 좋은 자산인
//  **계란 아트(js/eggart.js)가 로비에 하나도 안 나온다.** 8방향 걸음걸이·투구 실루엣·
//  무기까지 다 그려 놓고, 처음 들어온 사람은 전투에 들어가야만 그걸 본다.
//  "이게 무슨 게임인지"를 첫 화면이 말해 주지 않고 있었다.
//
//  ## 왜 '행렬' 이 아니라 '영웅' 인가 — 한 번 실패하고 고친 것
//  처음엔 유닛 여러 기를 화면 아래로 지나가게 했다. 찍어 보니 **어두운 점 아홉 개**로
//  보였다. 이유는 둘이다:
//   ① 작게 그리면 계란의 매력(둥근 몸·투구·표정)이 다 사라지고 실루엣만 남는다
//   ② 로비는 아래쪽이 버튼과 글자로 꽉 차 있어서, 지나갈 빈 띠 자체가 없었다
//  반면 **양옆은 통째로 비어 있었다**(PC 기준 좌우 각 450px). 그래서 그 자리에
//  영웅을 **크게** 세운다. 타이틀 화면이 캐릭터로 자기소개를 하는 흔한 문법이고,
//  이 게임에는 그럴 만한 영웅이 셋 있다.
//
//  ## 지키는 선
//  ⚠ **순수 렌더다.** 전투 로직·저장·밸런스에 아무것도 안 건드린다.
//  ⚠ 씬을 다시 들어오면 표시객체가 이미 파괴돼 있다(이 저장소가 반복해 겪은 사고).
//    상태를 씬에 캐시하지 않고 `start()` 가 매번 새로 만든다.
//  ⚠ 좁은 화면(폰 가로·세로)에서는 **아예 안 그린다.** 거기엔 여백이 없어서
//    뭘 그려도 글자와 겹친다 — 겹치느니 없는 게 낫다.
// ============================================================================
GAME.LobbyArt = {

  // 옆에 세울 영웅. `heroes.js` 의 키다. 좌/우 한 기씩.
  GUARDS: [
    { key: 'vanguard', side: -1 },     // 왼쪽 — 광전사(근접)
    { key: 'ranger',   side:  1 }      // 오른쪽 — 사냥꾼(원거리)
  ],

  // ⚠ 처음엔 배경이라고 0.38 로 깔았는데 **물 빠진 워터마크**로 보였다(실측).
  //   이 그림이 서는 자리는 좌우 여백이라 **글자와 겹칠 일이 아예 없다** —
  //   흐리게 할 이유가 없었던 것이다. 또렷하게 세워야 '캐릭터'로 읽힌다.
  ALPHA: 0.88,

  // 이 폭보다 좁으면 그리지 않는다(양옆 여백이 안 나온다).
  MIN_W: 1100,

  // ── 로비 배경 (2026-08-04 사용자: "이 로비배경부터 진행해") ──────────────────
  //  로비는 크림색 단색이었다. 오늘 전장에 넣은 세계의 물건(원경 안개·능선·부족
  //  목책)이 정작 **처음 보는 화면**에는 하나도 없었다 — 게임이 무슨 세계인지
  //  첫 화면이 말해 주지 않는다.
  //
  //  ⚠ **전 프로필에서 그린다.** 옆의 영웅 아트(`start`)는 좁은 화면에서 꺼지지만
  //    (여백이 없어 글자와 겹친다) 배경은 글자 **뒤**라 겹칠 일이 없다. 실제로
  //    사람들이 보는 화면이 폰 가로인데 거기서만 빠지면 하나 마나다.
  //  ⚠ **글자 대비를 해치지 않는다.** 이 로비의 글자는 어두운 색이고 배경은 크림이다.
  //    그래서 지평선 아래만 살짝 눕히고 위쪽(제목·버튼이 앉는 자리)은 거의 안 건드린다.
  //    값을 키우고 싶어지면 먼저 그 위에 글자가 앉는지부터 볼 것 —
  //    전장 배경에서 똑같은 실수를 한 번 했다(v1.50 → v1.52 수정).
  //  ⚠ 색은 전부 토큰에서 유도한다. 하드코딩하면 테마 4종에서 혼자 안 따라온다.
  backdrop: function (scene) {
    var UI = GAME.UI, C = GAME.CONFIG.COLORS, M = UI.MAT;
    var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
    var g = scene.add.graphics();
    g.setDepth(-60);                       // 영웅 아트(-50)보다도 뒤

    var field = C.arenaFill || 0x6f7f4a;
    var bg = (UI.COL && UI.COL.bg) || 0xfbf2df;
    var horizon = H * 0.62;

    //  ① 하늘 — 크림에서 아주 옅은 들판색으로. 12단이면 밴딩이 안 보인다.
    var i, t;
    for (i = 0; i < 12; i++) {
      t = i / 12;
      g.fillStyle(UI.mix(bg, field, 0.05 + t * 0.10), 1);
      g.fillRect(0, horizon * t, W, horizon / 12 + 1);
    }

    //  ② 먼 능선 — 톱니 실루엣. 좌표는 화면 폭으로 해시해 **캐시한다**
    //     (매 프레임 새로 뽑으면 언덕이 춤춘다 — 전장에서 배운 것).
    var key = 'lobby|' + Math.round(W) + '|' + Math.round(H);
    if (this._ridgeKey !== key) {
      var seed = 0, si;
      for (si = 0; si < key.length; si++) seed = (seed * 31 + key.charCodeAt(si)) >>> 0;
      var rnd = function () {
        seed ^= seed << 13; seed >>>= 0; seed ^= seed >> 17; seed ^= seed << 5; seed >>>= 0;
        return seed / 4294967296;
      };
      var pts = [], step = Math.max(30, W / 22), x;
      for (x = -step; x <= W + step; x += step) pts.push({ x: x, y: rnd() });
      this._ridge = pts; this._ridgeKey = key;
    }
    var rid = this._ridge, poly = [], k;
    var rh = H * 0.13;
    for (k = 0; k < rid.length; k++) {
      poly.push({ x: rid[k].x, y: horizon - rh * (0.35 + rid[k].y * 0.65) });
    }
    poly.push({ x: W + 60, y: horizon }); poly.push({ x: -60, y: horizon });
    g.fillStyle(UI.mix(bg, field, 0.26), 1);
    g.fillPoints(poly, true);

    //  ③ 들판 — 지평선 아래. 여기가 이 화면에서 유일하게 진한 면이다.
    g.fillStyle(UI.mix(bg, field, 0.40), 1);
    g.fillRect(0, horizon, W, H - horizon);
    g.fillStyle(UI.mix(bg, field, 0.52), 1);          // 앞쪽이 조금 더 진하다
    g.fillRect(0, H * 0.86, W, H - H * 0.86);

    //  ④ 부족 목책 — 지평선 위에 늘어선 기둥. 이 세계가 어디인지 한 줄로 말한다.
    //     ⚠ 실루엣만 낸다(면 없이). 진하게 칠하면 그 위 버튼 글자와 싸운다.
    var postW = Math.max(5, W * 0.006), gap = Math.max(34, W / 22);
    var ph = H * 0.075;
    for (x = gap * 0.5; x < W; x += gap) {
      g.fillStyle(UI.mix(bg, M.woodDark, 0.42), 1);
      g.fillRect(x, horizon - ph, postW, ph);
      g.fillStyle(UI.mix(bg, M.wood, 0.34), 1);       // 광원 좌상단 — 왼쪽 면만
      g.fillRect(x, horizon - ph, Math.max(1, postW * 0.34), ph);
      g.fillStyle(UI.mix(bg, M.bone, 0.50), 1);       // 기둥 끝 뼈 마디
      g.fillEllipse(x + postW / 2, horizon - ph, postW * 1.7, postW * 1.1, 8);
    }
    //  가로로 묶은 밧줄 두 줄
    g.fillStyle(UI.mix(bg, M.rope, 0.38), 1);
    g.fillRect(0, horizon - ph * 0.72, W, Math.max(1.5, ph * 0.045));
    g.fillRect(0, horizon - ph * 0.34, W, Math.max(1.5, ph * 0.045));

    return g;
  },

  start: function (scene) {
    if (!GAME.UI || !GAME.UI.drawUnitFlat || !GAME.HEROES) return null;
    if (GAME.CONFIG.PHONE || GAME.CONFIG.PORTRAIT) return null;
    var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
    if (W < this.MIN_W) return null;

    var C = GAME.CONFIG.COLORS;
    var g = scene.add.graphics();
    g.setDepth(-50);                       // 무조건 글자 뒤로

    var guards = [];
    this.GUARDS.forEach(function (spec, i) {
      var def = GAME.HEROES[spec.key];
      if (!def) return;
      // 좌우 여백의 한가운데. 버튼 띠(가운데 약 440px)를 절대 안 넘어간다.
      var margin = (W - 460) / 2;
      var cx = (spec.side < 0) ? margin * 0.52 : W - margin * 0.52;
      guards.push({
        def: def,
        x: cx,
        y: H * 0.58,
        // 여백 폭에 맞춰 키운다 — 계란의 생김새가 읽히는 크기라야 뜻이 있다.
        scale: Math.max(1.9, Math.min(3.1, margin / 140)),
        // ⚠ **둘 다 정면을 본다.** 처음엔 서로 마주 보게 0 / π 를 줬는데, eggart 는
        //   뒤를 보면 얼굴을 지우고 무기를 몸통 뒤로 감춘다 — 오른쪽 영웅이 활
        //   부스러기 뭉치처럼 보였다(실측). 간판에 세우는 그림은 정면이어야 한다.
        facing: -Math.PI / 2,
        color: (i === 0) ? C.controller : C.strategist,
        phase: i * 900                             // 숨쉬기 위상을 어긋내 쌍둥이처럼 안 보이게
      });
    });
    if (!guards.length) { try { g.destroy(); } catch (e) {} return null; }
    return { g: g, guards: guards, t: 0 };
  },

  // 매 프레임. `dtMs` 는 씬이 준 델타다.
  update: function (state, dtMs) {
    if (!state || !state.g || !state.g.scene) return;    // 씬이 바뀌면 조용히 멈춘다
    var dt = (typeof dtMs === 'number' && dtMs > 0) ? Math.min(dtMs, 100) : 16;
    state.t += dt;
    var g = state.g;
    g.clear();
    for (var i = 0; i < state.guards.length; i++) {
      var h = state.guards[i];
      try {
        // `idle` 에 시각을 넘기면 그 한 기가 숨 쉬고 가끔 무기를 휘두른다(eggart 규약).
        GAME.UI.drawUnitFlat(g, h.def, h.x, h.y, h.color, this.ALPHA,
                             h.scale, h.facing, null, state.t + h.phase);
      } catch (e) { /* 아트 하나가 실패해도 로비는 떠 있어야 한다 */ }
    }
  },

  stop: function (state) {
    if (state && state.g && state.g.scene) { try { state.g.destroy(); } catch (e) {} }
  }
};
