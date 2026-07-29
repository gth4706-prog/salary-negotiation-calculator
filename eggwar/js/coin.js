window.GAME = window.GAME || {};

// ============================================================================
//  전투 동전 (조개 화폐) — 처치 골드를 **주워야 얻는 수집물**로 바꾸는 계층
//  ---------------------------------------------------------------------------
//  요청: "유닛을 잡을 때마다 골드를 동전 형태로 떨궈서 그걸 먹어야만 골드가 늘어난다.
//         1골드당 동전 1개, 제자리가 아니라 무작위로 근처에 흩어지게."
//
//  **순수 렌더 + 수집 계층이다.** 전투 판정(combat.js)에는 한 줄도 손대지 않는다.
//  입력은 `state.killGoldEvents`([{x,y,gold,boss}]) 하나뿐이고, 출력은 `state.killGold`
//  (= towerrun.js 의 `earnedFrom` 이 읽는 값)를 **주운 만큼으로 다시 쓰는 것**이다.
//
//  회계 규칙 (여기가 요청의 핵심이다)
//   · towerrun 의 `_onKill` 은 처치 즉시 `state.killGold` 에 골드를 더한다.
//   · 이 파일은 동전을 뿌리면서 **그만큼 도로 뺀다**(= 아직 안 번 돈).
//   · 동전을 주울 때 다시 더한다. → 어느 시점에도 `state.killGold` = **주운 골드**.
//   · 사라진 동전은 영영 안 더해진다 = 못 먹은 골드는 잃는다.
//  towerrun.js 는 한 글자도 고치지 않았다(다른 에이전트 담당).
//
//  성능 규율 (이 저장소는 피해 숫자 재래스터로 프레임이 떨어진 신고를 받았다)
//   · 동전은 **Text 가 아니라 Graphics 한 장**(전장 g)에 모아 그린다 → 표시객체 0개.
//   · 동시에 떠 있는 동전은 MAX 개로 상한. 넘치면 **여러 골드를 한 동전에 묶는다**
//     (골드 총액은 보존되고, 묶음 동전은 겹쳐 그려 '더 많다'가 그대로 읽힌다).
//   · '+N' 팝업은 6개짜리 Text 풀이고, 한 프레임에 여러 개를 주우면 **하나로 합친다**
//     → setText(재래스터)는 줍는 순간에만, 그것도 프레임당 최대 1회.
// ============================================================================
(function () {
  var CFG = GAME.CONFIG;

  // ── 튜닝 상수 (거리는 전부 월드px, WORLD_SCALE 로 프로필별 환산한다) ──────
  var K = {
    MAX:        40,      // 동시에 존재할 수 있는 동전 수 (성능 상한)
    PER_KILL:   14,      // 한 기 처치가 뿌릴 수 있는 최대 동전 수 (보스 대비)
    LIFE:      14000,    // 수명 ms
    BLINK:      3500,    // 사라지기 전 깜빡이는 구간 ms
    HOP:         380,    // 튀어나가는 시간 ms (이 동안은 못 줍는다)
    HOP_H:        15,    // 튀어오르는 높이(화면px)
    // ── 줍는 반경 · 자석 ───────────────────────────────────────────────────
    //  이 두 값이 "못 먹고 잃는 골드"의 양을 정한다. 눈대중으로 고르지 않았다 —
    //  AIHero(숙련 0.9)가 실제로 판을 굴리게 두고 층별 수거율을 쟀다
    //  (`scratchpad/coin-rate.js`, 층당 6판). AI 는 동전을 **주우러 가지 않는다**
    //  (동전을 모르는 코드다) → 이 숫자는 사람의 **하한선**이다.
    //      자석/줍기      1층    4층    10층   20층
    //       96 / 26      73.4%  85.0%  81.0%  77.7%
    //      130 / 32      88.6%  93.0%  85.6%  90.9%   ← 채택
    //      170 / 40      84.4%  96.3%  96.6%  96.9%
    //      220 / 48      93.3%  99.1%  100%   98.9%   ← 사실상 자동 수거(기각)
    //  220 은 동전이 알아서 오므로 '줍는 행위'가 사라진다 — 요청의 핵심이 죽는다.
    //  130 은 아레나 폭의 약 10%(PC 1300px 기준)라 **동전 더미까지는 걸어가야** 하고,
    //  그러고도 10% 안팎은 못 먹는다. 손실감과 조작감이 둘 다 남는 지점이다.
    PICK_PAD:     32,    // 영웅 반경 + 이만큼이면 줍는다
    MAGNET:      130,    // 이 안에 들어오면 영웅 쪽으로 끌려온다
    MAG_V0:       70,    // 자석 최소 속도 (월드px/s)
    MAG_V1:      430,    // 자석 최대 속도
    SPREAD_MIN:   14,    // 흩어지는 반경
    SPREAD_MAX:   46,
    POP_POOL:      6,    // '+N' 팝업 풀 크기
    POP_LIFE:    640
  };
  var R_BASE = 6.2;      // 동전 반지름(화면px) — 유닛 확대율에 맞춰 곱한다

  // ── 동전 하나 그리기 ─────────────────────────────────────────────────────
  //  **조개(cowrie) 화폐**다. 금화가 아니라 원시 부족 화폐를 쓴 이유는 보고서에 적었다.
  //  형태는 색이 아니라 실루엣으로 읽혀야 한다(이 프로젝트의 설계 경계 5번과 같은 규율):
  //    어두운 테두리 → 청동빛 몸통 → 가운데 톱니 갈라짐 → 밝은 반사점
  //  이 3단 명암 덕분에 밝은 목초지(A안)에서도 어두운 배경에서도, 흑백으로 봐도 뜬다.
  //  ⚠ **매끄러움(smoothness)을 반드시 넘긴다.** Phaser 의 `fillEllipse` 는 기본값이
  //    32분할이라 타원 하나가 32각형 경로가 된다. 처음엔 안 넘겼더니 동전 40개에서
  //    draw() 가 1.3ms → 3.0ms 로 뛰었다(실측). 지름 16px 짜리 물건에 32분할은 낭비다 —
  //    8~10 분할이면 화면에서 구분되지 않는다. 아래 숫자는 그렇게 잡은 값이다.
  var SM_SHADOW = 8, SM_BODY = 10, SM_HILITE = 6;

  // 화폐 등급 — 청동 1 · 은 10 · 금 100.
  //  요청: "동전 10개 단위가 넘는 건 브론즈·실버·골드 색상으로 치환".
  //  단위로 쪼개면 개수가 줄어(70골드 = 은 7개) 화면도 성능도 같이 좋아진다.
  //  ⚠ **색만으로 갈리면 흑백에서 죽는다**(은 0.63 vs 금 0.65 로 회색값이 거의 같다).
  //    그래서 등급마다 **크기와 무늬**를 함께 바꾼다 — 색은 보조 신호다.
  var DENOM = [100, 10, 1];
  function _sum(a) { var t = 0; for (var i = 0; i < a.length; i++) t += a[i]; return t; }
  function tierOf(v) { return v >= 100 ? 2 : (v >= 10 ? 1 : 0); }
  GAME.coinTierOf = tierOf;

  function drawCoin(g, sx, sy, r0, value, alpha, INK, INKA) {
    var M = GAME.UI.MAT;                       // 테마가 제자리에서 갈아끼우므로 **그릴 때 읽는다**
    var tier = tierOf(value);
    var body = tier === 2 ? (M.coinGold || 0xe8bf3a)
             : tier === 1 ? (M.coinSilver || 0xc3cbd4)
                          : (M.coinBronze || M.bronze);
    var rim = M.leatherDark, slit = M.woodDark, hi = M.bone;

    // 묶음 동전의 '더 많다'는 **크기**가 먼저 말한다.
    //  겹쳐 쌓기만으로는 실측(시안판 스크린샷)에서 값 1과 3이 구분되지 않았다 —
    //  뒷장이 앞장에 거의 다 가려 어두운 초승달만 남기 때문이다.
    //  크기는 그리기 비용이 **0** 이면서 가장 멀리서도 읽히는 신호다. 1.55배에서 멈춘다
    //  (더 키우면 유닛만 해져서 '바닥의 물건'이 아니라 '적'처럼 보인다).
    //  등급이 크기의 1차 신호다(1.00 / 1.18 / 1.36). 상한을 넘겨 묶인 동전만
    //  그 위에 로그로 조금 더 커진다 — 1.55 에서 멈춘다(더 키우면 '적'처럼 보인다).
    var TIER_R = [1, 1.18, 1.36];
    var over = value / DENOM[2 - tier];
    var r = r0 * TIER_R[tier] * (over > 1 ? Math.min(1.15, 1 + Math.log(over) / Math.LN2 * 0.08) : 1);
    var w = r * 2, h = r * 1.42;               // 지면에 누운 타원

    // 지면 그림자 — '떠 있는 것'이 아니라 '떨어져 있는 것'으로 읽히게
    g.fillStyle(INK, 0.20 * alpha);
    g.fillEllipse(sx, sy + r * 0.72, w * 0.96, h * 0.58, SM_SHADOW);

    // 그 위에 겹쳐 쌓기 — 크기 신호를 보조한다(가까이서 '여러 개'가 보이게)
    if (value >= 2) {
      g.fillStyle(rim, 0.95 * alpha);
      g.fillEllipse(sx - r * 0.52, sy - r * 0.22, w * 0.90, h * 0.90, SM_SHADOW);
      if (value >= 5) g.fillEllipse(sx + r * 0.50, sy - r * 0.40, w * 0.90, h * 0.90, SM_SHADOW);
    }

    // 몸통 — 어두운 테두리 위에 청동빛 면.
    //  라이트 테마에서는 테두리를 아예 **잉크색으로 갈아끼운다.** 처음엔 관례대로
    //  strokeEllipse 로 잉크 윤곽을 하나 더 둘렀는데, 10각형 스트로크(경로+조인)가
    //  동전 40개에서 draw p95 를 +0.9ms 더 먹었다(실측 Δp95 1.8 → 0.9).
    //  이미 있는 테두리 타원의 **색만 바꾸면** 비용 0 으로 같은 실루엣을 얻는다.
    g.fillStyle(INKA > 0 ? INK : rim, alpha);
    g.fillEllipse(sx, sy, w, h, SM_BODY);
    g.fillStyle(body, alpha);
    g.fillEllipse(sx, sy, w * 0.80, h * 0.76, SM_BODY);

    // 조개의 갈라진 틈 + 톱니 — 이 무늬가 '동전'이 아니라 '조개'로 읽히게 한다.
    //  ⚠ 선(lineBetween)이 아니라 **사각형 채움**으로 그린다. 무늬가 전부 축에 나란해서
    //    같은 그림이 나오는데, 스트로크 경로(경로 생성 + 조인 계산)보다 쿼드 하나가 훨씬 싸다.
    //    동전 하나당 선 4개를 사각형 4개로 바꿔 draw() 를 실측 0.9ms → 0.5ms 로 줄였다.
    //  등급 신호 ②: 갈라진 틈의 개수. 청동 1줄 · 은 2줄 · 금 2줄 + 가운데 점.
    //  회색값이 겹치는 은/금을 **형태로** 가른다.
    var lw = Math.max(1, r * 0.20);
    g.fillStyle(slit, 0.92 * alpha);
    g.fillRect(sx - r * 0.54, sy + r * 0.04 - lw / 2, r * 1.08, lw);
    if (tier >= 1) g.fillRect(sx - r * 0.44, sy - r * 0.30 - lw / 2, r * 0.88, lw);
    for (var i = -1; i <= 1; i++) {
      g.fillRect(sx + i * r * 0.34 - lw / 2, sy - r * 0.16, lw, r * 0.40);
    }
    if (tier >= 2) {
      g.fillStyle(slit, 0.92 * alpha);
      g.fillEllipse(sx, sy + r * 0.04, r * 0.30, r * 0.24, SM_HILITE);
    }

    // 반사점 — 흑백에서 '밝은 점'이 하나 있어야 금속/광택으로 읽힌다
    g.fillStyle(hi, 0.85 * alpha);
    g.fillEllipse(sx - r * 0.34, sy - r * 0.36, r * 0.52, r * 0.32, SM_HILITE);
  }
  GAME.drawCoinGlyph = drawCoin;      // HUD 배지가 같은 그림을 재사용한다

  // ── 동전 밭 ──────────────────────────────────────────────────────────────
  function CoinField(scene, state) {
    this.scene = scene;
    this.state = state;
    this.ws = CFG.WORLD_SCALE || 1;
    this.r = R_BASE * (GAME.UI.UNIT_DRAW_SCALE || 1);
    this.list = [];
    this._ev = 0;            // state.killGoldEvents 를 어디까지 읽었나
    this.collected = 0;      // 주운 골드
    this.dropped = 0;        // 바닥에 뿌린 총 골드
    this.lost = 0;           // 못 먹고 사라진 골드
    this.peakCoins = 0;      // 동시 최대 동전 수 (성능 실측용)
    this.gotThisFrame = 0;   // 이번 프레임에 주운 골드 (씬이 읽는다)
    this._pops = [];
  }

  CoinField.prototype.remaining = function () { return this.list.length; };
  CoinField.prototype.remainingGold = function () {
    var s = 0;
    for (var i = 0; i < this.list.length; i++) s += this.list[i].v;
    return s;
  };

  // 새 처치 이벤트를 동전으로 바꾼다
  CoinField.prototype._drain = function () {
    var evs = this.state.killGoldEvents;
    if (!evs) return;
    while (this._ev < evs.length) {
      var e = evs[this._ev++];
      if (!e || !(e.gold > 0)) continue;
      // 아직 안 번 돈이다 — 주울 때 다시 더한다
      this.state.killGold -= e.gold;
      this.dropped += e.gold;
      this._scatter(e.x, e.y, e.gold);
    }
  };

  CoinField.prototype._scatter = function (x, y, gold) {
    var room = K.MAX - this.list.length;
    if (room <= 0) {
      // 상한에 걸렸다 — **골드를 버리지 않는다.** 가장 가까운 동전에 얹는다(묶음).
      var best = null, bd = Infinity;
      for (var b = 0; b < this.list.length; b++) {
        var c0 = this.list[b];
        var dx0 = c0.x - x, dy0 = c0.y - y, d0 = dx0 * dx0 + dy0 * dy0;
        if (d0 < bd) { bd = d0; best = c0; }
      }
      if (best) { best.v += gold; return; }
      room = 1;                                  // 리스트가 비어 있을 리는 없지만 방어
    }
    //  화폐 단위로 쪼갠다 — 47골드 = 은 4 + 청동 7 (11개). 골드 수만큼 뿌리던
    //  예전 방식은 보스(70골드)에서 동전이 수십 개가 됐고, 상한에 걸려 묶이면
    //  '값이 큰 동전'을 크기로만 알려야 해서 값 1과 3이 구분되지 않았다(실측).
    var units = [], left = gold;
    for (var di = 0; di < DENOM.length; di++) {
      var d = DENOM[di], cnt = Math.floor(left / d);
      left -= cnt * d;
      for (var ci = 0; ci < cnt && units.length < K.PER_KILL && units.length < room; ci++) units.push(d);
    }
    // 상한 때문에 못 뿌린 몫은 **버리지 않고** 마지막 동전에 얹는다(등급이 자동으로 올라간다).
    // 총액 보존이 이 함수의 계약이다 — 골드가 조용히 사라지면 성장 곡선이 어긋난다.
    if (units.length === 0) units.push(gold);
    else {
      var spilled = gold - _sum(units);
      if (spilled > 0) units[units.length - 1] += spilled;
    }
    var n = units.length;
    var A = CFG.ARENA, ws = this.ws;
    for (var i = 0; i < n; i++) {
      var ang = Math.random() * Math.PI * 2;
      var rad = (K.SPREAD_MIN + Math.random() * (K.SPREAD_MAX - K.SPREAD_MIN)) * ws;
      var tx = Math.max(A.x + 6, Math.min(A.right - 6, x + Math.cos(ang) * rad));
      var ty = Math.max(A.y + 6, Math.min(A.bottom - 6, y + Math.sin(ang) * rad * 0.8));
      this.list.push({
        x: x, y: y, x0: x, y0: y, tx: tx, ty: ty,
        v: units[i],
        t: 0, life: K.LIFE, hop: 0
      });
    }
    if (this.list.length > this.peakCoins) this.peakCoins = this.list.length;
  };

  // dt(ms), hero — 줍기 판정은 월드 좌표에서만 한다(투영과 무관 = 줌과도 무관)
  CoinField.prototype.update = function (dt, hero) {
    this.gotThisFrame = 0;
    this._drain();

    var ws = this.ws;
    var pickR = hero ? ((hero.def ? hero.def.radius : 17) + K.PICK_PAD * ws) : 0;
    var magR = K.MAGNET * ws;
    var got = 0, gotN = 0, gx = 0, gy = 0;
    var alive = hero && hero.alive;

    for (var i = this.list.length - 1; i >= 0; i--) {
      var c = this.list[i];
      c.t += dt;

      if (c.t < K.HOP) {
        // 튀어나가는 동안 — 아직 못 줍는다(그래야 '흩어짐'이 눈에 보인다)
        var p = c.t / K.HOP;
        var e = 1 - (1 - p) * (1 - p);            // easeOutQuad
        c.x = c.x0 + (c.tx - c.x0) * e;
        c.y = c.y0 + (c.ty - c.y0) * e;
        c.hop = Math.sin(p * Math.PI);
        continue;
      }
      c.hop = 0;

      if (alive) {
        var dx = hero.x - c.x, dy = hero.y - c.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d <= pickR) {
          got += c.v; gotN++; gx += c.x; gy += c.y;
          this.list.splice(i, 1);
          continue;
        }
        if (d < magR && d > 0.001) {
          // 가까울수록 빠르게 빨려온다 — '줍는 조작'을 없애지 않으면서 손맛을 준다
          var k = 1 - d / magR;
          var v = (K.MAG_V0 + (K.MAG_V1 - K.MAG_V0) * k * k) * ws * (dt / 1000);
          if (v > d) v = d;
          c.x += dx / d * v;
          c.y += dy / d * v;
        }
      }

      if (c.t >= c.life) {
        this.lost += c.v;
        this.list.splice(i, 1);
      }
    }

    if (gotN > 0) {
      // 회계: 주운 만큼만 state.killGold 로 되돌린다
      this.state.killGold += got;
      this.collected += got;
      this.gotThisFrame = got;
      this._popup(gx / gotN, gy / gotN, got);
      if (GAME.Sound) GAME.Sound.play('coinPick');
    }
    return got;
  };

  // 라운드가 끝날 때 바닥에 남은 것 — **버린다**(자동 수거하지 않는다).
  // 근거는 보고서에 적었다. 여기서는 손실을 기록만 한다(디버그·검증용).
  CoinField.prototype.forfeit = function () {
    var g = this.remainingGold();
    this.lost += g;
    this.list.length = 0;
    return g;
  };

  // ── '+N' 팝업 (Text 풀. 한 프레임에 하나만 뜬다) ──────────────────────────
  CoinField.prototype._popup = function (x, y, v) {
    var sc = this.scene;
    if (!sc || !sc.add) return;
    var slot = null, i;
    for (i = 0; i < this._pops.length; i++) {
      if (this._pops[i].t <= 0) { slot = this._pops[i]; break; }
    }
    if (!slot) {
      if (this._pops.length >= K.POP_POOL) slot = this._pops[0];   // 가장 오래된 것 재사용
      else {
        var TXT = GAME.UI.TXT;
        var t = sc.add.text(0, 0, '', {
          fontFamily: CFG.FONT, fontSize: (CFG.SMALL ? 17 : 16) + 'px',
          color: TXT.crit, stroke: GAME.UI.outlineFor(TXT.crit), strokeThickness: 4
        }).setOrigin(0.5);
        if (t.setResolution && GAME.UI.TEXT_RES > 1) t.setResolution(GAME.UI.TEXT_RES);
        // 전장의 일부다 — 확대하면 같이 움직여야 한다(피해 숫자와 같은 취급)
        if (sc.worldLayer) sc.worldLayer.add(t);
        slot = { txt: t, t: 0, x: 0, y: 0 };
        this._pops.push(slot);
      }
    }
    slot.x = x; slot.y = y; slot.t = K.POP_LIFE;
    slot.txt.setText('+' + v);                  // 재래스터는 **줍는 순간에만** 일어난다
    slot.txt.setVisible(true);
  };

  CoinField.prototype._updatePops = function (dt) {
    var Iso = GAME.Iso;
    for (var i = 0; i < this._pops.length; i++) {
      var p = this._pops[i];
      if (p.t <= 0) continue;
      p.t -= dt;
      if (p.t <= 0) { p.txt.setVisible(false); continue; }
      var prog = 1 - p.t / K.POP_LIFE;
      p.txt.setAlpha(Math.max(0, 1 - prog * prog));
      p.txt.setPosition(p.x, Iso.toScreenY(p.y) - 22 - prog * 34);
    }
  };

  // ── 그리기 — 전장 Graphics 한 장에 전부 모아 그린다(표시객체 0개) ────────
  CoinField.prototype.draw = function (g, dt) {
    this._updatePops(dt || 16);
    var Iso = GAME.Iso, FX = GAME.UI.FX;
    var INK = FX.ink, INKA = FX.inkAlpha;
    var r = this.r;
    for (var i = 0; i < this.list.length; i++) {
      var c = this.list[i];
      var rem = c.life - c.t;
      var a = 1;
      // 사라지기 전 깜빡여 알린다 — "곧 없어진다"가 손실 전에 보여야 한다
      if (rem < K.BLINK) a = 0.34 + 0.66 * Math.abs(Math.sin(rem * 0.011));
      var sy = Iso.toScreenY(c.y) - c.hop * K.HOP_H - r * 0.35;
      drawCoin(g, c.x, sy, r, c.v, a, INK, INKA);
    }
  };

  CoinField.prototype.destroy = function () {
    for (var i = 0; i < this._pops.length; i++) {
      if (this._pops[i].txt && this._pops[i].txt.destroy) this._pops[i].txt.destroy();
    }
    this._pops.length = 0;
    this.list.length = 0;
    this.scene = null;
    this.state = null;
  };

  GAME.Coins = {
    K: K,
    create: function (scene, state) { return new CoinField(scene, state); }
  };
})();
