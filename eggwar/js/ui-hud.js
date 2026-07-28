window.GAME = window.GAME || {};

// ═══════════════════════════════════════════════════════════════════════════
//  Egg War · UI HUD 확장 (v1) — ui-theme.js 의 **뒤**에 로드한다
//    <script src="js/ui-theme.js?v=0.13"></script>
//    <script src="js/ui-hud.js?v=0.13"></script>   ← 여기
//    <script src="js/modal.js?v=0.13"></script>
//
//  ui-theme.js 는 손대지 않는다. 여기서 GAME.UI 에 **추가만** 한다.
//  기존 label / button / panel / chip 시그니처는 그대로다.
//
//  ── 이 파일이 하는 일 ──────────────────────────────────────────────────
//   1) TIER  — 6단계 등급 색 사다리. 색=거친 등급, 숫자=세부 등급.
//   2) meter — 라운드 게이지(트랙/필/보조필/칸막이/오버레이 글자).
//              전투 HP·시간·보스 체력이 전부 이 하나를 쓴다.
//   3) battleHud — 전투 상단 HUD 한 덩어리. update(info) 만 매 프레임 부른다.
//   4) rankRow  — 랭킹 2줄 행 (420 폭에 5열을 욱여넣지 않는다).
//   5) verdictPlate / rewardRow / countUp / revealIn — 결과 화면 위계·연출.
//   6) floorBadge / bandMeter — 통곡의 탑 층수 표현.
//
//  ── 설계 근거(레퍼런스에서 **구조만** 가져왔다) ────────────────────────
//   · 탕탕특공대(Survivor.io): 화면 상단 중앙에 **큰 타이머 + 바로 밑 진행 바**.
//     플레이어가 조작하는 건 이동뿐이라 나머지 정보를 HUD가 전담한다.
//     장비 등급이 회색→초록→파랑→보라→노랑→빨강 6단계이고, 같은 색 안에서
//     숫자로 세부 등급을 나눈다(보라1/보라2, 노랑1~3, 빨강1~4).
//   · 운빨존많겜(Lucky Defense): 등급이 곧 유닛의 이름처럼 쓰인다("블루/레어를 팔아라").
//     화면은 버튼·수치로 압도하지 않는다. 유닛을 누르면 **필드 위에 사거리 링**을 그린다.
//   ⚠ 색값 자체는 어느 쪽에서도 베끼지 않았다. 아래 HEX 는 전부 ui-theme.js 의
//     기존 팔레트 토큰(good/accentAlt/crit/danger/textDim)이고, 부족한 파랑 한 칸만
//     같은 대비 기준(#101018 대비 8.9:1)으로 새로 만들었다.
//     회색→초록→파랑→보라→주황→빨강 사다리는 특정 게임 것이 아니라 장르 관용이다.
// ═══════════════════════════════════════════════════════════════════════════

(function () {
  var UI = GAME.UI = GAME.UI || {};
  var CFG = GAME.CONFIG;
  // ui-theme.js 와 같은 이유로 SMALL(작은 화면)을 본다 — 폰 가로도 포함된다.
  var P = CFG.SMALL !== undefined ? CFG.SMALL : CFG.PORTRAIT;

  // ui-theme.js 가 먼저 로드됐는지 확인 — 순서가 뒤집히면 조용히 이상해진다
  if (!UI.FS || !UI.COL) {
    if (window.console) console.error('[ui-hud] ui-theme.js 를 먼저 로드해야 합니다.');
    return;
  }
  var COL = UI.COL, TXT = UI.TXT, FS = UI.FS;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : (d || 0); }

  // 긴 문자열을 잘라 옆 칸을 침범하지 않게 한다.
  // setFixedSize 는 경계만 속이고 실제로 자르지 않는다 — 문자열에서 자르는 게 확실하다.
  UI.ellipsize = function (s, maxChars) {
    s = String(s === undefined || s === null ? '' : s);
    if (!maxChars || s.length <= maxChars) return s;
    return s.slice(0, Math.max(1, maxChars - 1)) + '…';
  };

  // ───────────────────────────────────────────────────────────────────────
  //  1. 등급 사다리
  //     이 게임엔 뽑기가 없다. 그래서 등급은 **난이도**에 붙인다
  //     (탑 층수 / 격파 반복으로 오르는 escalation / 유닛 비용).
  //     원리만 가져온다: "색으로 즉시 읽히고, 숫자로 세부를 읽는다."
  // ───────────────────────────────────────────────────────────────────────
  var TIER = UI.TIER = [
    { i: 0, name: '입문', hex: 0xa8a8c2, css: '#a8a8c2', panel: 0x24242f },  //  8.15:1
    { i: 1, name: '기본', hex: 0x4ade80, css: '#4ade80', panel: 0x182c22 },  // 10.86:1
    { i: 2, name: '숙련', hex: 0x6bb8ff, css: '#6bb8ff', panel: 0x152535 },  //  8.95:1
    { i: 3, name: '정예', hex: 0xb3a8ff, css: '#b3a8ff', panel: 0x241f38 },  //  8.98:1
    { i: 4, name: '전설', hex: 0xffd166, css: '#ffd166', panel: 0x33281a },  // 13.13:1
    { i: 5, name: '초월', hex: 0xff7b7b, css: '#ff7b7b', panel: 0x351d1d }   //  7.55:1
  ];
  UI.tier = function (i) { return TIER[clamp(Math.round(num(i, 0)), 0, TIER.length - 1)]; };

  // 구간 배열에서 등급을 찾는다. bands = [경계값…] (오름차순)
  function band(v, bands) {
    var i = 0;
    for (; i < bands.length; i++) if (v < bands[i]) return i;
    return bands.length;
  }

  // 통곡의 탑 — CLAUDE.md 의 실측 곡선을 그대로 구간으로 옮겼다.
  //   1~3 연습 / 4~9 진짜 시작 / 10·20·30… 보스
  UI.tierForFloor = function (floor, isBoss) {
    var f = Math.max(1, num(floor, 1));
    var t = band(f, [4, 10, 20, 30, 40]);        // 0..5
    if (isBoss) t = Math.min(TIER.length - 1, t + 1);
    return UI.tier(t);
  };
  // 반복 격파로 오르는 난이도(0~12단계)
  UI.tierForEscalation = function (n) {
    return UI.tier(band(Math.max(0, num(n, 0)), [1, 3, 5, 8, 11]));
  };
  // 유닛·영웅 비용 (예산 120~260 범위에서 의미가 갈린다)
  UI.tierForCost = function (cost) {
    return UI.tier(band(Math.max(0, num(cost, 0)), [12, 20, 30, 45, 70]));
  };

  // ───────────────────────────────────────────────────────────────────────
  //  2. meter — 이 파일의 심장. 전투 HUD 게이지가 전부 이걸 쓴다.
  //
  //     opts: color, color2(보조/보호막), track, seg(칸 수), radius,
  //           danger(이 비율 이하에서 색이 바뀐다), dangerColor,
  //           label(오버레이 글자 옵션 {size,color,align:'center'|'left'|'right'})
  //     반환: { set(frac, frac2), setText, setColor, setPosition, destroy, gfx, text }
  //
  //     매 프레임 set() 을 불러도 값이 실제로 바뀐 프레임에만 다시 그린다.
  // ───────────────────────────────────────────────────────────────────────
  UI.meter = function (scene, x, y, w, h, opts) {
    opts = opts || {};
    var gfx = scene.add.graphics();
    var st = {
      x: num(x), y: num(y), w: Math.max(2, num(w, 2)), h: Math.max(2, num(h, 2)),
      frac: clamp(num(opts.frac, 1), 0, 1),
      frac2: 0,
      color: opts.color === undefined ? COL.hpGood : opts.color,
      color2: opts.color2 === undefined ? 0x7ec8f0 : opts.color2,
      // 트랙을 순검정으로 박아두면 크림 패널에 구멍이 뚫린 것처럼 보인다(라이트 테마).
      // COL.meterTrack 을 테마가 채우고, 없으면 예전 값 그대로.
      track: opts.track === undefined
        ? (COL.meterTrack === undefined ? 0x0b0b12 : COL.meterTrack) : opts.track,
      line: opts.line === undefined ? COL.border : opts.line,
      seg: Math.max(0, num(opts.seg, 0)),
      danger: clamp(num(opts.danger, -1), -1, 1),
      dangerColor: opts.dangerColor === undefined ? COL.hpBad : opts.dangerColor,
      gloss: opts.gloss !== false
    };
    var radius = opts.radius === undefined ? Math.min(st.h / 2, 8) : num(opts.radius, 4);
    var last = { frac: -1, frac2: -1, color: -1 };

    var text = null;
    if (opts.label) {
      var lp = opts.label;
      var px = UI.size(lp.size, FS.micro);
      text = scene.add.text(0, 0, '', {
        fontFamily: CFG.FONT, fontSize: px + 'px', color: lp.color || TXT.text
      });
      if (text.setResolution && UI.TEXT_RES > 1) text.setResolution(UI.TEXT_RES);
      if (text.setLineSpacing) text.setLineSpacing(0);
      // 게이지 위 글자는 채워진 색 위에 얹히므로 외곽선이 없으면 안 읽힌다.
      // 단, 테두리를 테마값으로 고정하면 밝은 글자에 밝은 테두리가 붙어 사라진다
      // (보스 바의 '보스 처치' 가 크림 테두리에 먹혀 실제로 안 보였다) → 글자색에서 정한다.
      if (lp.outline !== false) {
        text.setStroke(UI.outlineFor(lp.color || TXT.text), 3);
        text.setShadow(0, 1, UI.IS_LIGHT ? 'rgba(50,36,16,0.55)' : 'rgba(0,0,0,0.8)', 2, false, true);
      }
      st.align = lp.align || 'center';
      placeText();
    }

    function placeText() {
      if (!text) return;
      if (st.align === 'left') text.setOrigin(0, 0.5).setPosition(st.x + 8, st.y + st.h / 2);
      else if (st.align === 'right') text.setOrigin(1, 0.5).setPosition(st.x + st.w - 8, st.y + st.h / 2);
      else text.setOrigin(0.5).setPosition(st.x + st.w / 2, st.y + st.h / 2);
    }

    function draw() {
      var col = (st.danger >= 0 && st.frac <= st.danger) ? st.dangerColor : st.color;
      gfx.clear();

      // 트랙
      gfx.fillStyle(st.track, 1);
      gfx.fillRoundedRect(st.x, st.y, st.w, st.h, radius);

      // 필 — 라운드 반경이 폭의 절반을 넘으면 Phaser 가 이상하게 그린다. 여기서 가둔다.
      if (st.frac > 0) {
        var fw = Math.max(st.h * 0.6, st.w * st.frac);
        if (fw > st.w) fw = st.w;
        var fr = Math.min(radius, fw / 2, st.h / 2);
        gfx.fillStyle(col, 1);
        gfx.fillRoundedRect(st.x, st.y, fw, st.h, fr);
        if (st.gloss && st.h >= 8) {
          gfx.fillStyle(0xffffff, 0.16);
          gfx.fillRoundedRect(st.x + 1, st.y + 1, Math.max(2, fw - 2),
            Math.max(3, st.h * 0.40), { tl: fr, tr: fr, bl: 0, br: 0 });
        }
      }

      // 보조 필(보호막) — 본 필의 오른쪽 끝에서 이어 붙는다
      if (st.frac2 > 0) {
        var sx = st.x + st.w * clamp(st.frac, 0, 1);
        var sw = Math.min(st.w - (sx - st.x), st.w * st.frac2);
        if (sw > 1) {
          var sr = Math.min(radius, sw / 2, st.h / 2);
          gfx.fillStyle(st.color2, 0.95);
          gfx.fillRoundedRect(sx, st.y, sw, st.h, sr);
        }
      }

      // 칸막이 — "몇 칸 남았나"가 한눈에 읽힌다.
      // 트랙색을 따라가야 라이트 테마에서 검은 빗금이 튀지 않는다.
      if (st.seg > 1 && st.h >= 8) {
        gfx.fillStyle(st.track, 0.85);
        for (var i = 1; i < st.seg; i++) {
          gfx.fillRect(st.x + (st.w / st.seg) * i - 1, st.y + 1, 2, st.h - 2);
        }
      }

      gfx.lineStyle(1, st.line, 0.9);
      gfx.strokeRoundedRect(st.x + 0.5, st.y + 0.5, st.w - 1, st.h - 1, radius);
    }

    draw();

    var api = {
      gfx: gfx, text: text,
      set: function (frac, frac2) {
        var f = clamp(num(frac, 0), 0, 1);
        var f2 = clamp(num(frac2, 0), 0, 1);
        // 0(비었다)·1(가득)은 상태 변화라 엡실론으로 뭉개면 안 된다.
        // 체력이 0.06% 남았다가 죽으면 변화량이 0.0015 미만이라 다시 그리지 않았고,
        // 필 최소 폭(높이의 60%) 때문에 **죽은 뒤에도 게이지 조각이 남아 있었다**
        // (보스 처치 후 보스 바에 빨간 조각이 계속 보였다 — 실측).
        var edge = (f === 0 && last.frac !== 0) || (f === 1 && last.frac !== 1)
                || (f2 === 0 && last.frac2 !== 0) || (f2 === 1 && last.frac2 !== 1);
        if (!edge && Math.abs(f - last.frac) < 0.0015 && Math.abs(f2 - last.frac2) < 0.0015
            && st.color === last.color) return api;
        st.frac = f; st.frac2 = f2;
        last.frac = f; last.frac2 = f2; last.color = st.color;
        draw();
        return api;
      },
      setColor: function (c) { if (c !== undefined) { st.color = c; last.color = -1; draw(); } return api; },
      setText: function (s) { if (text) text.setText(s === undefined ? '' : String(s)); return api; },
      setTextColor: function (c) { if (text && c) text.setColor(c); return api; },
      setPosition: function (nx, ny) {
        st.x = num(nx, st.x); st.y = num(ny, st.y);
        placeText(); last.frac = -1; draw(); return api;
      },
      setDepth: function (d) { gfx.setDepth(d); if (text) text.setDepth(d + 1); return api; },
      bounds: function () { return { x: st.x, y: st.y, w: st.w, h: st.h, bottom: st.y + st.h }; },
      destroy: function () { if (gfx) gfx.destroy(); if (text) text.destroy(); }
    };
    return api;
  };

  // ───────────────────────────────────────────────────────────────────────
  //  3. battleHud — 전투 상단 HUD 한 덩어리
  //
  //     레퍼런스 구조 차용:
  //       · 타이머를 가장 큰 숫자로 중앙에 두고 **바로 밑에 진행 바**를 깐다.
  //       · 체력은 글자가 아니라 **칸막이 있는 두꺼운 게이지**로 읽는다.
  //       · 보스는 별도 바를 갖는다(무엇을 죽여야 하는지가 목표가 된다).
  //       · 나머지는 억제한다 — 전장을 가리면 회피 게임이 성립하지 않는다.
  //
  //     opts: { top, boss(boolean — 높이가 달라진다), tierLabel, tierIndex }
  //     반환: { update(info), height, bottom, destroy }
  //     info: { hpFrac, shieldFrac, hpText, heroName, shieldText,
  //             timeFrac, timeText, timeLow, enemyText,
  //             bossFrac, bossText, bossName }
  // ───────────────────────────────────────────────────────────────────────
  // 보스 바 색 — 라이트 테마에서 밝은 빨강(#ef4444)에 밝은 분홍 글자(#ffe0e0)를 올려
  // 두 값이 붙어 있었다(대비 2.0:1). 아래 헬퍼가 테마에 맞는 짝을 돌려준다.
  function bossPalette() {
    if (!UI.IS_LIGHT) return { fill: 0xef4444, line: 0xff7b7b, css: '#ffe0e0' };
    // 크림 패널 위 — 딸기 진영과 같은 계열의 깊은 붉은색 + 크림 글자(5.9:1)
    return { fill: 0xB01F35, line: 0x7A1224, css: '#FFF0E4' };
  }

  UI.battleHud = function (scene, opts) {
    opts = opts || {};
    var W = CFG.WIDTH;
    var BOSS = bossPalette();
    var hud = GAME.Layout.hud();
    var pad = hud.pad;
    var top = opts.top === undefined ? hud.top : num(opts.top, hud.top);
    var boss = !!opts.boss;
    var objs = [];
    function keep(o) { objs.push(o); return o; }

    var px = pad, pw = W - pad * 2;
    var ix = px + (P ? 14 : 24);            // 내용 왼쪽
    var iw = pw - (P ? 28 : 48);            // 내용 폭
    var ir = px + pw - (P ? 14 : 24);       // 내용 오른쪽

    // 폰 가로(820×390)는 **쌓을 자리가 없다** → 화면 위 모서리에 얹는 얇은 띠.
    // 높이는 아래에서 만든 부품의 **실측 바닥**으로 다시 잡는다(고정값 금지).
    var PHONE = !!CFG.PHONE;
    var H = PHONE ? 58 : (P ? (boss ? 158 : 128) : 112);

    // ── 패널 ──
    // 폰 가로는 전면 패널을 깔지 않는다 — 전장이 이 띠 **아래**에서 시작하므로
    // 뒤가 이미 비어 있고, 큰 판을 하나 더 깔면 좁은 화면이 더 답답해진다.
    if (!PHONE) keep(UI.panel(scene, px, top, pw, H, { level: 1, radius: UI.R.lg }));

    var tier = UI.tier(opts.tierIndex === undefined ? 0 : opts.tierIndex);

    var timer, timeBar, heroName, shieldTag, hpBar, enemyTxt, bossBar, chip;

    if (PHONE) {
      // ── 폰 가로 820×390 — 쌓지 말고 겹친다(롤토체스/와일드리프트 방식) ──
      //   좌상: 층 배지 + 영웅 체력바   중상: 남은 시간(가장 큰 숫자)   우상: 남은 적 · 보스 바
      //   하단 좌우 모서리는 **엄지가 점유**하므로(touchpad.js) 정보는 위로만 올린다.
      //   전장은 api.bottom 아래에서 시작한다 — battle.js 가 Iso.setMode('full', bottom) 로 맞춘다.
      //   영웅 이름은 폰에서 뺐다: 방금 고른 영웅이라 정보 가치가 낮은데 한 줄을 통째로 먹는다.
      var lpx = 10, lpw = 274, lpy = top + 2, lph = 54;
      keep(UI.panel(scene, lpx, lpy, lpw, lph, {
        level: 1, radius: UI.R.md, alpha: 0.88, shadow: false
      }));
      var lin = lpx + 8;
      // 글자 크기는 micro(15)가 아니라 caption(16)을 쓴다.
      // 폰 가로의 최악 배율은 **아이폰 SE 의 0.813** 이라 micro 15 는 화면 12.2px 로 떨어진다
      // (설계 하한 13px 미만). caption 16 이면 13.0px 로 딱 하한에 선다.
      if (opts.tierLabel) {
        chip = UI.chip(scene, lin, lpy + 3, UI.ellipsize(opts.tierLabel, 11), {
          size: 'caption', color: tier.css, fill: tier.panel, line: tier.hex, shadow: false
        });
        keep(chip.gfx); keep(chip.text);
      }
      shieldTag = keep(UI.text(scene, lpx + lpw - 8, lpy + 6, '', {
        size: 'caption', color: UI.IS_LIGHT ? TXT.accent : '#7ec8f0',
        origin: 1, originY: 0, lineSpacing: 0
      }));
      hpBar = UI.meter(scene, lin, lpy + 34, lpw - 16, 18, {
        color: COL.hpGood, seg: 4, danger: 0.3,
        label: { size: 'caption', align: 'center' }
      });
      objs.push(hpBar);

      // 남은 시간 — 이 화면에서 가장 자주 보는 숫자라 가장 크게, 정중앙에.
      timer = keep(UI.text(scene, W / 2, top, '', {
        size: 34, color: TXT.text, origin: 0.5, originY: 0, outline: true, lineSpacing: 0
      }));
      // 시간 바는 타이머의 **실측 바닥** 아래에 붙인다(고정 y 를 박으면 폰트가 바뀔 때 겹친다)
      var tbY = top + Math.max(30, Math.ceil(timer.height)) + 2;
      timeBar = UI.meter(scene, W / 2 - 100, tbY, 200, 5, {
        color: COL.controller, danger: 0.17,
        dangerColor: 0xf0a86a, radius: 2.5, gloss: false
      });
      objs.push(timeBar);

      var rrx = W - 14;
      enemyTxt = keep(UI.text(scene, rrx, top + 4, '', {
        size: 'subhead', color: TXT.textMid, origin: 1, originY: 0, outline: true, lineSpacing: 0
      }));
      // 보스 바는 오른쪽 묶음에 **끼워 넣는다** — 아래로 쌓으면 보스 층만 전장이 줄어든다.
      var rBottom = top + 4 + Math.max(20, Math.ceil(enemyTxt.height));
      if (boss) {
        var bbw = 250, bbx = rrx - bbw, bby = rBottom + 3;
        bossBar = UI.meter(scene, bbx, bby, bbw, 20, {
          color: BOSS.fill, seg: 5, danger: -1, line: BOSS.line,
          label: { size: 'caption', align: 'left', color: BOSS.css }
        });
        objs.push(bossBar);
        bossBar.hpText = keep(UI.text(scene, bbx + bbw - 8, bby + 10, '', {
          size: 'caption', color: BOSS.css, origin: 1, originY: 0.5, outline: true, lineSpacing: 0
        }));
        rBottom = bby + 20;
      }
      // 실측 바닥으로 높이를 확정한다 → 아레나가 이 아래에서 시작한다
      H = Math.max(lpy + lph, tbY + 5, rBottom) - top + 2;

    } else if (P) {
      // ── 세로 420 ──
      if (opts.tierLabel) {
        chip = UI.chip(scene, ix, top + 10, UI.ellipsize(opts.tierLabel, 10), {
          size: 'micro', color: tier.css, fill: tier.panel, line: tier.hex
        });
        keep(chip.gfx); keep(chip.text);
      }
      timer = keep(UI.text(scene, W / 2, top + 4, '', {
        size: 'numLg', color: TXT.text, origin: 0.5, originY: 0, outline: true
      }));
      enemyTxt = keep(UI.text(scene, ir, top + 14, '', {
        size: 'caption', color: TXT.textMid, origin: 1, originY: 0
      }));
      timeBar = UI.meter(scene, ix, top + 50, iw, 6, {
        color: COL.controller, danger: 0.17,
        dangerColor: 0xf0a86a, radius: 3, gloss: false
      });
      objs.push(timeBar);
      heroName = keep(UI.text(scene, ix, top + 66, '', {
        size: 'subhead', color: TXT.accent, origin: 0, originY: 0
      }));
      shieldTag = keep(UI.text(scene, ir, top + 70, '', {
        size: 'caption', color: UI.IS_LIGHT ? TXT.accent : '#7ec8f0', origin: 1, originY: 0
      }));
      hpBar = UI.meter(scene, ix, top + 96, iw, 20, {
        color: COL.hpGood, seg: 4, danger: 0.3,
        label: { size: 'micro', align: 'center' }
      });
      objs.push(hpBar);
      if (boss) {
        bossBar = UI.meter(scene, ix, top + 124, iw, 22, {
          color: BOSS.fill, seg: 5, danger: -1, line: BOSS.line,
          label: { size: 'micro', align: 'left', color: BOSS.css }
        });
        objs.push(bossBar);
        bossBar.hpText = keep(UI.text(scene, ir - 8, top + 135, '', {
          size: 'micro', color: BOSS.css, origin: 1, originY: 0.5, outline: true
        }));
      }
    } else {
      // ── 가로 1340 — 같은 부품을 가로로 편다 ──
      var half = Math.floor((iw - 40) / 2);
      if (opts.tierLabel) {
        chip = UI.chip(scene, ix, top + 12, UI.ellipsize(opts.tierLabel, 16), {
          size: 'micro', color: tier.css, fill: tier.panel, line: tier.hex
        });
        keep(chip.gfx); keep(chip.text);
      }
      timer = keep(UI.text(scene, W / 2, top + 6, '', {
        size: 'numLg', color: TXT.text, origin: 0.5, originY: 0, outline: true
      }));
      enemyTxt = keep(UI.text(scene, ir, top + 16, '', {
        size: 'caption', color: TXT.textMid, origin: 1, originY: 0
      }));
      timeBar = UI.meter(scene, W / 2 - 260, top + 52, 520, 6, {
        color: COL.controller, danger: 0.17,
        dangerColor: 0xf0a86a, radius: 3, gloss: false
      });
      objs.push(timeBar);
      heroName = keep(UI.text(scene, ix, top + 48, '', {
        size: 'subhead', color: TXT.accent, origin: 0, originY: 0
      }));
      shieldTag = keep(UI.text(scene, ix + half, top + 50, '', {
        size: 'caption', color: UI.IS_LIGHT ? TXT.accent : '#7ec8f0', origin: 1, originY: 0
      }));
      hpBar = UI.meter(scene, ix, top + 78, half, 20, {
        color: COL.hpGood, seg: 4, danger: 0.3,
        label: { size: 'micro', align: 'center' }
      });
      objs.push(hpBar);
      if (boss) {
        bossBar = UI.meter(scene, ix + half + 40, top + 78, half, 20, {
          color: BOSS.fill, seg: 5, danger: -1, line: BOSS.line,
          label: { size: 'micro', align: 'left', color: BOSS.css }
        });
        objs.push(bossBar);
        bossBar.hpText = keep(UI.text(scene, ix + half * 2 + 32, top + 88, '', {
          size: 'micro', color: BOSS.css, origin: 1, originY: 0.5, outline: true
        }));
      }
    }

    var api = {
      height: H,
      top: top,
      bottom: top + H,
      update: function (info) {
        info = info || {};
        timer.setText(info.timeText === undefined ? '' : String(info.timeText));
        timer.setColor(info.timeLow ? TXT.warn : TXT.text);
        timeBar.set(num(info.timeFrac, 0));

        // 폰 가로는 영웅 이름을 두지 않는다(자리가 없다) → 있을 때만 쓴다
        if (heroName) heroName.setText(info.heroName === undefined ? '' : String(info.heroName));
        shieldTag.setText(info.shieldText === undefined ? '' : String(info.shieldText));

        hpBar.set(num(info.hpFrac, 0), num(info.shieldFrac, 0));
        hpBar.setText(info.hpText === undefined ? '' : String(info.hpText));

        enemyTxt.setText(info.enemyText === undefined ? '' : String(info.enemyText));

        if (bossBar) {
          bossBar.set(num(info.bossFrac, 0));
          bossBar.setText(UI.ellipsize(info.bossName || '', PHONE ? 8 : (P ? 12 : 20)));
          if (bossBar.hpText) bossBar.hpText.setText(info.bossText || '');
        }
        return api;
      },
      destroy: function () {
        for (var i = 0; i < objs.length; i++) if (objs[i] && objs[i].destroy) objs[i].destroy();
        objs = [];
      }
    };
    return api;
  };

  // ───────────────────────────────────────────────────────────────────────
  //  4. rankRow — 랭킹 2줄 행
  //     세로 420 에 [순위·닉네임·탑·격파·점수] 5열은 물리적으로 안 들어간다.
  //     "1줄에 정체(순위+닉네임+점수), 2줄에 부연(탑·격파)" 로 나눈다.
  //     행 높이는 UI.TAP(52) 이상 — 손가락으로 누를 수 있는 크기.
  // ───────────────────────────────────────────────────────────────────────
  UI.RANK_ROW_H = P ? 64 : 62;

  UI.rankRow = function (scene, x, y, w, d, opts) {
    opts = opts || {};
    d = d || {};
    var h = num(opts.height, UI.RANK_ROW_H);
    var mine = !!d.mine;
    var rank = num(d.rank, 0);
    var objs = [];
    function keep(o) { objs.push(o); return o; }

    // 1~3위는 등급 색으로 띠를 준다 — 색만으로 상위권이 읽힌다
    var stripe = rank === 1 ? 0xffd166 : rank === 2 ? 0xc6c6d8 : rank === 3 ? 0xf0a86a : null;
    if (mine) stripe = COL.controller;

    keep(UI.panel(scene, x, y, w, h, {
      level: mine ? 3 : 2,
      fill: mine ? COL.panelTeal : COL.surfaceAlt,
      line: mine ? COL.controller : COL.border,
      lineWidth: mine ? 2 : 1,
      radius: UI.R.md,
      shadow: false,
      accent: stripe === null ? undefined : stripe
    }));

    var padL = 12, rankW = P ? 40 : 48;
    var lx = x + padL + rankW;
    var rx = x + w - padL;
    var y1 = y + h * 0.32, y2 = y + h * 0.72;

    var medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : String(rank || '-');
    keep(UI.text(scene, x + padL + rankW / 2, y + h / 2, medal, {
      size: rank <= 3 ? 'subhead' : 'body',
      color: rank <= 3 ? TXT.text : TXT.textDim, origin: 0.5
    }));

    // 점수를 먼저 만들어 실제 폭을 재고, 닉네임은 **그 왼쪽 끝까지만** 쓴다.
    // (CLAUDE.md: 오른쪽 정렬 열은 x 에서 왼쪽으로 뻗는다 — 옆 칸을 피하려면 열폭만큼 물러난다)
    // d.valueText / d.unitText / d.metaText 를 주면 그 문자열을 그대로 쓴다.
    // (분류별 랭킹은 '점'이 아니라 '층'·트로피를 세운다. 안 주면 지금까지와 동일하다.)
    var valStr = d.valueText !== undefined ? String(d.valueText)
               : (num(d.score, 0)).toLocaleString('ko-KR');
    var unitStr = d.unitText !== undefined ? String(d.unitText) : '점';
    // 단위를 따로 안 쓰면 숫자를 세로 가운데로 — 위쪽에 치우쳐 두면 아래가 비어 보인다.
    var scoreTxt = keep(UI.text(scene, rx, unitStr ? y1 : y + h / 2, valStr, {
      size: 'num', color: TXT.crit, origin: 1, originY: 0.5
    }));
    if (unitStr) keep(UI.text(scene, rx, y2, unitStr, {
      size: 'micro', color: TXT.textFaint, origin: 1, originY: 0.5
    }));

    var nameMax = Math.max(40, (rx - Math.ceil(scoreTxt.width) - 14) - lx);
    var nameTxt = keep(UI.text(scene, lx, y1, String(d.id === undefined ? '?' : d.id), {
      size: 'subhead', color: mine ? TXT.accent : TXT.text, origin: 0, originY: 0.5
    }));
    if (nameTxt.width > nameMax) {
      // 실제 폭으로 자른다 — 글자수 기준으로만 자르면 한글/영문 폭 차이로 또 삐져나온다
      var s = String(d.id), cut = s.length;
      while (cut > 1 && nameTxt.width > nameMax) { cut--; nameTxt.setText(s.slice(0, cut) + '…'); }
    }
    nameTxt.setFixedSize(Math.max(40, nameMax), 0);   // 감사 도구용 경계 고정

    var metaStr, metaCol;
    if (d.metaText !== undefined) {
      metaStr = String(d.metaText); metaCol = TXT.warn;
    } else {
      var meta = [];
      if (d.tower) meta.push('탑 ' + d.tower + '층');
      meta.push('격파 ' + num(d.rounds, 0) + '회');
      metaStr = meta.join('  ·  '); metaCol = d.tower ? TXT.warn : TXT.textFaint;
    }
    var metaTxt = keep(UI.text(scene, lx, y2, metaStr, {
      size: 'micro', color: metaCol, origin: 0, originY: 0.5
    }));
    // 부연도 닉네임과 같은 폭 안에서 실측으로 자른다 — 영웅+장비는 쉽게 길어진다
    if (metaTxt.width > nameMax) {
      var ms = metaStr, mc = ms.length;
      while (mc > 1 && metaTxt.width > nameMax) { mc--; metaTxt.setText(ms.slice(0, mc) + '…'); }
    }
    metaTxt.setFixedSize(Math.max(40, nameMax), 0);

    return {
      objs: objs,
      destroy: function () {
        for (var i = 0; i < objs.length; i++) if (objs[i] && objs[i].destroy) objs[i].destroy();
        objs = [];
      }
    };
  };

  // ───────────────────────────────────────────────────────────────────────
  //  5. 결과 화면 — 위계와 단계적 공개
  //     운빨존많겜의 룰렛 연출에서 가져온 건 **한 번에 다 보여주지 않는다**는 원리 하나뿐이다.
  //     (뽑기 UI 자체는 우리 게임에 대응물이 없다 — 껍데기만 남는다)
  //     구현은 "먼저 다 만들고 alpha 0 으로 두었다가 tween 으로 들여보낸다".
  //     나중에 생성하면 씬이 이미 종료된 뒤 파괴된 객체를 건드리게 된다(전에 겪은 사고).
  // ───────────────────────────────────────────────────────────────────────
  UI.verdictPlate = function (scene, cx, y, w, title, sub, opts) {
    opts = opts || {};
    var tier = opts.tier || UI.tier(opts.tierIndex === undefined ? 3 : opts.tierIndex);
    var accent = opts.accentHex === undefined ? tier.hex : opts.accentHex;
    var accentCss = opts.accentCss || tier.css;
    var objs = [];
    function keep(o) { objs.push(o); return o; }

    var titlePx = UI.size(opts.titleSize || 'display');
    var plateH = num(opts.height, titlePx + (P ? 34 : 40));
    var x = cx - w / 2;

    // ── 리본 꼬리 — 판을 '현수막'으로 만드는 한 수 ──────────────────────
    //  판 좌우로 삼각 꼬리가 삐져나오게 그린다. 패널보다 먼저 그려야 뒤로 깔린다.
    //  꼬리는 판 밖 12px 까지만 나가므로 감사(겹침 검사) 경계에 걸리지 않는다.
    var tail = keep(scene.add.graphics());
    var ty = y + plateH * 0.30, th = plateH * 0.40, tw = P ? 14 : 18;
    tail.fillStyle(UI.COL.shadow === undefined ? 0x000000 : UI.COL.shadow, UI.IS_LIGHT ? 0.14 : 0.26);
    tail.fillTriangle(x - tw, ty + 3, x + 6, ty + 3, x + 6, ty + th + 3);
    tail.fillTriangle(x + w + tw, ty + 3, x + w - 6, ty + 3, x + w - 6, ty + th + 3);
    tail.fillStyle(accent, 0.9);
    tail.fillTriangle(x - tw, ty, x + 6, ty, x + 6, ty + th);
    tail.fillTriangle(x + w + tw, ty, x + w - 6, ty, x + w - 6, ty + th);

    keep(UI.panel(scene, x, y, w, plateH, {
      fill: opts.panelHex === undefined ? tier.panel : opts.panelHex,
      line: accent, lineWidth: 2, radius: UI.R.lg
    }));
    // 위아래 얇은 광선 + 귀퉁이 못 — 이미지 없이 '판정'의 무게를 만든다
    var g = keep(scene.add.graphics());
    g.fillStyle(accent, 0.85);
    g.fillRect(x + w * 0.14, y + plateH - 3, w * 0.72, 3);
    g.fillStyle(accent, 0.35);
    g.fillRect(x + w * 0.28, y, w * 0.44, 2);
    g.fillStyle(accent, 0.7);
    var pn = P ? 10 : 13;
    [[x + pn, y + pn], [x + w - pn, y + pn], [x + pn, y + plateH - pn], [x + w - pn, y + plateH - pn]]
      .forEach(function (p) { g.fillCircle(p[0], p[1], 2.6); });

    var t = keep(UI.text(scene, cx, y + plateH / 2, String(title || ''), {
      size: opts.titleSize || 'display', color: accentCss, origin: 0.5, outline: true
    }));

    var subTxt = null;
    if (sub) {
      subTxt = keep(UI.text(scene, cx, y + plateH + (P ? 14 : 18), String(sub), {
        size: 'caption', color: TXT.textDim, origin: 0.5, originY: 0,
        align: 'center', wrap: w
      }));
    }

    // bottom 은 **부제의 실제 높이**에서 계산한다. 부제는 길이에 따라 2~3줄로 갈리는데
    // 고정값으로 잡으면 3줄일 때 다음 블록이 부제 위로 올라탄다(실제로 겹쳤다).
    var subGap = P ? 14 : 18;
    return {
      objs: objs, title: t, sub: subTxt,
      bottom: subTxt ? (subTxt.y + subTxt.height + subGap)
                     : (y + plateH + (P ? 12 : 16)),
      destroy: function () {
        for (var i = 0; i < objs.length; i++) if (objs[i] && objs[i].destroy) objs[i].destroy();
        objs = [];
      }
    };
  };

  // 보상/지표 한 줄 — 라벨 왼쪽, 값 오른쪽. 값이 주인공이라 크고 밝다.
  UI.rewardRow = function (scene, x, y, w, label, value, opts) {
    opts = opts || {};
    var h = num(opts.height, P ? 46 : 48);
    var objs = [];
    function keep(o) { objs.push(o); return o; }

    keep(UI.panel(scene, x, y, w, h, {
      level: 2, radius: UI.R.md, shadow: false,
      line: opts.line === undefined ? COL.divider : opts.line,
      accent: opts.accent
    }));
    // 진영 띠(accent)는 폭 4px 다. 라벨을 x+14 에 두면 띠 바로 옆에 붙어 갑갑했다
    // (결과 화면에서 'AI가 읽은 당신' 이 띠에 올라탄 것처럼 보였다) → 띠가 있으면 4px 더 민다.
    var lx = x + (opts.accent === undefined ? 14 : 18);
    var lab = keep(UI.text(scene, lx, y + h / 2, String(label || ''), {
      size: 'caption', color: opts.labelColor || TXT.textDim, origin: 0, originY: 0.5
    }));
    var v = keep(UI.text(scene, x + w - 14, y + h / 2, String(value === undefined ? '' : value), {
      size: opts.valueSize || 'num', color: opts.valueColor || TXT.crit, origin: 1, originY: 0.5
    }));
    // 값은 오른쪽에서 왼쪽으로 뻗는다 — 길면 왼쪽 라벨을 파고든다.
    // (배치도 이름은 20자까지 가능해서 결과 화면에서 실제로 겹쳤다)
    var limit = (x + w - 14) - (lx + lab.width + 12);
    if (limit > 24 && v.width > limit) {
      var s = String(value);
      while (s.length > 1 && v.width > limit) { s = s.slice(0, -1); v.setText(s + '…'); }
    }
    return {
      objs: objs, value: v, bottom: y + h,
      destroy: function () {
        for (var i = 0; i < objs.length; i++) if (objs[i] && objs[i].destroy) objs[i].destroy();
        objs = [];
      }
    };
  };

  // 숫자 카운트업. 씬이 죽은 뒤 setText 하지 않도록 매 스텝 확인한다.
  UI.countUp = function (scene, txt, to, opts) {
    opts = opts || {};
    var target = num(to, 0);
    if (!txt || !scene.tweens || !scene.tweens.addCounter) {
      if (txt && txt.setText) txt.setText((opts.prefix || '') + target.toLocaleString('ko-KR') + (opts.suffix || ''));
      return null;
    }
    var prefix = opts.prefix || '', suffix = opts.suffix || '';
    txt.setText(prefix + '0' + suffix);
    return scene.tweens.addCounter({
      from: num(opts.from, 0), to: target,
      duration: Math.max(120, num(opts.duration, 700)),
      delay: Math.max(0, num(opts.delay, 0)),
      ease: 'Cubic.easeOut',
      onUpdate: function (tw) {
        if (!txt.scene) return;                    // 씬이 내려갔다
        txt.setText(prefix + Math.round(tw.getValue()).toLocaleString('ko-KR') + suffix);
      },
      onComplete: function () {
        if (!txt.scene) return;
        txt.setText(prefix + target.toLocaleString('ko-KR') + suffix);
      }
    });
  };

  // 단계적 등장. **객체는 이미 다 만들어져 있어야 한다**(생성은 create 에서 끝낸다).
  // groups: [[obj…], [obj…], …] — 그룹 단위로 순서대로 들어온다.
  UI.revealIn = function (scene, groups, opts) {
    opts = opts || {};
    var step = Math.max(0, num(opts.stagger, 130));
    var dur = Math.max(60, num(opts.duration, 260));
    var rise = num(opts.rise, 10);
    var base = Math.max(0, num(opts.delay, 60));
    var canTween = scene.tweens && scene.tweens.add;

    for (var gi = 0; gi < groups.length; gi++) {
      var list = groups[gi] || [];
      // {objs:[…]} 래퍼도 받아준다
      if (list.objs) list = list.objs;
      if (!list.length && list.setAlpha) list = [list];
      for (var i = 0; i < list.length; i++) {
        var o = list[i];
        if (!o || !o.setAlpha) continue;
        if (!canTween) { o.setAlpha(1); continue; }
        var y0 = (typeof o.y === 'number') ? o.y : 0;
        o.setAlpha(0);
        if (typeof o.y === 'number') o.y = y0 + rise;
        scene.tweens.add({
          targets: o, alpha: 1, y: y0,
          duration: dur, delay: base + gi * step, ease: 'Quad.easeOut'
        });
      }
    }
  };

  // ───────────────────────────────────────────────────────────────────────
  //  6. 통곡의 탑 — 층수 배지 + 보스 구간 진행 바
  //     운빨존많겜의 '웨이브/보스 웨이브' 구조에서 가져온 건
  //     "지금 어느 구간의 몇 번째인지, 다음 이벤트까지 얼마나 남았는지"를
  //     한 덩어리로 보여준다는 점이다.
  // ───────────────────────────────────────────────────────────────────────
  //  층수 배지 — 밋밋한 사각 패널이었다. 세 가지를 얹어 '현판'처럼 만든다:
  //   ① 위쪽 어깨 리본 — 등급색 띠가 배지 위로 살짝 튀어나온다
  //   ② 네 귀퉁이 못 — 나무 현판에 박힌 징. 목장/원시 세계관과 붙는다
  //   ③ 숫자 뒤 옅은 원반 — 큰 숫자가 허공에 뜨지 않고 자리를 잡는다
  //  전부 Graphics 도형이라 애셋이 늘지 않는다.
  UI.floorBadge = function (scene, cx, y, floor, opts) {
    opts = opts || {};
    var f = Math.max(1, num(floor, 1));
    var isBoss = !!opts.boss;
    var tier = UI.tierForFloor(f, isBoss);
    var w = num(opts.width, P ? 132 : 168);
    // display(세로 42px) 숫자 + micro 라벨이 둘 다 들어가야 한다.
    // 74 로 두면 숫자 아랫단과 라벨이 9px 겹친다(실측).
    var h = num(opts.height, P ? 84 : 94);
    var x = cx - w / 2;
    var objs = [];
    function keep(o) { objs.push(o); return o; }

    // ① 어깨 리본 — 배지보다 먼저 그려야 뒤로 깔린다
    var rib = keep(scene.add.graphics());
    var rw = w * 0.52, rh = 10;
    rib.fillStyle(tier.hex, 1);
    rib.fillRoundedRect(cx - rw / 2, y - rh + 4, rw, rh + 10, { tl: 6, tr: 6, bl: 0, br: 0 });
    rib.fillStyle(UI.COL.shadow === undefined ? 0x000000 : UI.COL.shadow, UI.IS_LIGHT ? 0.16 : 0.3);
    rib.fillRect(cx - rw / 2, y + 2, rw, 3);

    keep(UI.panel(scene, x, y, w, h, {
      fill: tier.panel, line: tier.hex, lineWidth: 2, radius: UI.R.lg
    }));

    // ③ 숫자 자리 원반 + ② 귀퉁이 못
    var deco = keep(scene.add.graphics());
    deco.fillStyle(tier.hex, UI.IS_LIGHT ? 0.14 : 0.16);
    deco.fillCircle(cx, y + h * 0.36, Math.min(w, h) * 0.30);
    deco.fillStyle(tier.hex, 0.85);
    var nx = 11, ny = 11;
    [[x + nx, y + ny], [x + w - nx, y + ny], [x + nx, y + h - ny], [x + w - nx, y + h - ny]]
      .forEach(function (p) { deco.fillCircle(p[0], p[1], 2.4); });

    keep(UI.text(scene, cx, y + h * 0.36, String(f), {
      size: 'display', color: tier.css, origin: 0.5, outline: true
    }));
    keep(UI.text(scene, cx, y + h - (P ? 12 : 14), (isBoss ? '☠ 보스 층' : '층 · ' + tier.name), {
      size: 'micro', color: isBoss ? TXT.danger : TXT.textDim, origin: 0.5
    }));

    return {
      objs: objs, tier: tier, bottom: y + h,
      destroy: function () {
        for (var i = 0; i < objs.length; i++) if (objs[i] && objs[i].destroy) objs[i].destroy();
        objs = [];
      }
    };
  };

  // 다음 보스까지의 진행 — every 층마다 보스라는 규칙을 눈으로 보여준다.
  //
  //  ※ 여기 글자가 **완전히 안 읽히고 있었다.** 라벨색이 '#e8e8f0'(거의 흰색)로 박혀 있는데
  //    A안의 글자 테두리는 크림(#FFFCF0)이라 흰 글자에 흰 테두리가 붙었고,
  //    바탕은 금색(#ffd166) 게이지였다 — 세 색이 전부 밝아 글자가 사라졌다(스크린샷 확인).
  //    게다가 높이 12px 안에 micro(가로 13 / 세로 15px) 글자를 넣어 위아래가 잘렸다.
  //  → 글자는 게이지 **밖 아래**로 빼고, 색은 테마 본문색을 쓴다. 높이도 14 로 올렸다.
  UI.bandMeter = function (scene, x, y, w, floor, every, opts) {
    opts = opts || {};
    var f = Math.max(1, num(floor, 1));
    var e = Math.max(2, num(every, 10));
    var into = ((f - 1) % e);
    var h = num(opts.height, 14);
    var m = UI.meter(scene, x, y, w, h, {
      color: UI.tier(4).hex, seg: e, danger: -1, radius: h / 2
    });
    m.set(into / e);

    var cap = UI.text(scene, x + w / 2, y + h + 5,
      opts.text === undefined ? ('다음 보스까지 ' + (e - into) + '층') : opts.text, {
        size: 'micro', color: TXT.textMid, origin: 0.5, originY: 0
      });
    var baseDestroy = m.destroy;
    var bottom = y + h + 5 + cap.height;
    m.caption = cap;
    m.bottom = bottom;
    // 호출부(tower.js)는 bounds().bottom 으로 다음 블록 y 를 잡는다.
    // 글자를 게이지 밖으로 뺐으니 bounds 도 그만큼 늘려야 아래 문구와 겹치지 않는다.
    m.bounds = function () { return { x: x, y: y, w: w, h: bottom - y, bottom: bottom }; };
    m.setText = function (s) { cap.setText(s === undefined ? '' : String(s)); return m; };
    m.destroy = function () { baseDestroy(); if (cap) cap.destroy(); };
    return m;
  };

  // ───────────────────────────────────────────────────────────────────────
  //  7. 구역 제목 — 밋밋한 텍스트 줄 대신 좌측 등급 바 + 제목
  // ───────────────────────────────────────────────────────────────────────
  //  씬 제목 밑 장식 — 짧은 선 · 마름모 · 짧은 선.
  //  큰 제목만 덩그러니 있으면 '앱 화면'이지 '게임 간판'이 아니다. 애셋 없이
  //  기울인 사각형 하나로 목판 간판 느낌을 낸다. Graphics 뿐이라 글자 겹침 감사에 안 걸린다.
  UI.titleRule = function (scene, cx, y, w, opts) {
    opts = opts || {};
    var color = opts.hex === undefined ? COL.borderUi : opts.hex;
    var g = scene.add.graphics();
    var half = Math.max(18, num(w, 120) / 2);
    var gap = 11, th = 2;
    g.fillStyle(color, opts.alpha === undefined ? 0.55 : opts.alpha);
    g.fillRoundedRect(cx - half, y, half - gap, th, th / 2);
    g.fillRoundedRect(cx + gap, y, half - gap, th, th / 2);
    // 가운데 마름모 (45° 회전한 정사각형을 점 4개로)
    var d = 4.5;
    g.fillStyle(color, opts.alpha === undefined ? 0.85 : opts.alpha);
    g.fillPoints([{ x: cx, y: y + th / 2 - d }, { x: cx + d, y: y + th / 2 },
                  { x: cx, y: y + th / 2 + d }, { x: cx - d, y: y + th / 2 }], true);
    return { gfx: g, bottom: y + th, destroy: function () { g.destroy(); } };
  };

  //  구역 제목 — 왼쪽 막대 하나였다. 막대를 **알약**으로 바꾸고 그 아래 옅은 밑줄을 깐다.
  //  밑줄은 제목 폭에 정확히 맞춰 그린다(고정 폭으로 그리면 짧은 제목에서 혼자 튀어나온다).
  //  글자를 먼저 만들어 폭을 재고, Graphics 는 그 뒤에 만들되 **글자를 위로 올려** 덮이지 않게 한다
  //  (Graphics 를 Text 뒤에 add 하면 배경이 글자를 덮는 문제 — 이 파일 chip 에서 이미 겪었다).
  UI.sectionTitle = function (scene, x, y, text, opts) {
    opts = opts || {};
    var color = opts.hex === undefined ? COL.controller : opts.hex;
    var barH = UI.size(opts.size || 'heading');
    var t = UI.text(scene, x + 14, y, String(text || ''), {
      size: opts.size || 'heading', color: opts.color || TXT.text, origin: 0, originY: 0
    });
    var g = scene.add.graphics();
    // 알약 막대
    g.fillStyle(color, 1);
    g.fillRoundedRect(x, y + 3, 5, Math.max(8, barH - 4), 2.5);
    // 밑줄 — 제목 실제 폭 + 막대까지
    if (opts.rule !== false) {
      g.fillStyle(color, UI.IS_LIGHT ? 0.28 : 0.22);
      g.fillRoundedRect(x, y + t.height + 3, Math.max(24, t.width + 14), 2, 1);
    }
    if (scene.children && scene.children.bringToTop) scene.children.bringToTop(t);
    return { gfx: g, text: t, bottom: y + t.height + (opts.rule === false ? 0 : 5),
      destroy: function () { g.destroy(); t.destroy(); } };
  };
})();
