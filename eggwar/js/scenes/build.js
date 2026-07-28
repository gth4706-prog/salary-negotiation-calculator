window.GAME = window.GAME || {};

// 전략가 — 진형을 짜서 배치도로 저장한다.
// 사람이 배치하는 유닛은 항상 화면 아래에 놓고, 저장할 때 위쪽(전투 기준)으로 뒤집는다.
// 좌표는 정규화(0~1)로 저장되므로 세로/가로 어느 쪽에서 만들어도 호환된다.
//
// ── 이 화면이 왜 이렇게 생겼는가 (v0.32 개편) ────────────────────────────────
// 예전 화면의 실측된 문제 넷을 각각 겨냥해 고쳤다.
//  ① **팔레트 아이콘이 아예 안 보였다.** 유닛 그림을 `this.g` 에 그렸는데 그 Graphics 가
//     칩 사각형보다 **먼저** 만들어져 있어서 칩이 그림을 덮었다. 그래서 유닛 구분이
//     오로지 이름 글자에만 의존했다("어떤 유닛인지 알기 어렵다"의 진짜 원인).
//     → 칩 뒤에 별도 Graphics(`palG`)를 칩 **다음에** 만들어 아이콘을 위로 올렸다.
//  ② **경고문과 유닛 설명이 같은 줄에 겹쳐 찍혔다**(세로, AABB 교차로 확인).
//     → 둘을 **한 줄(statusText)로 합쳤다.** 같은 객체면 겹칠 수가 없다.
//  ③ **안내 문구가 전장 위에 얹혀 유닛 그림과 겹쳤다.**
//     → 전장 안 글자를 전부 없애고 아레나 위 한 줄 + HUD 안내로 옮겼다.
//  ④ **잘못 놓은 유닛을 지울 방법이 사실상 없었다.** 길게 누르기(450ms)는 발견이 안 되고
//     우클릭은 폰에 없다. → 유닛을 탭하면 머리 위에 **✕ 배지**가 떠서 한 번 더 탭하면
//     지워진다. 되돌리기 버튼도 넣었다(전부 지우기밖에 없던 것이 가혹했다).
// 여기에 탭 왕복을 줄이는 두 가지를 더 넣었다.
//  ⑤ **못 사는 유닛은 팔레트에서 미리 흐려진다** — 눌러보고 경고를 읽는 왕복이 사라진다.
//  ⑥ **좌우 대칭 배치** — 진형은 대개 대칭이라 탭 한 번이 두 기가 된다(전장 탭 절반).
GAME.BuildScene = function () {
  Phaser.Scene.call(this, { key: 'Build' });
};
GAME.BuildScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.BuildScene.prototype.constructor = GAME.BuildScene;

// 길게 눌러 제거로 판정하는 시간. ✕ 배지가 생긴 뒤로는 보조 수단이지만,
// 이미 손에 익은 사람을 위해 남겨둔다.
GAME.BuildScene.HOLD_MS = 450;
// 경고를 띄운 뒤 설명으로 되돌아가는 시간
GAME.BuildScene.WARN_MS = 2200;

// ── 폰 가로(820×390) 전용 좌표 ──────────────────────────────────────────────
//  아레나 화면 사각형은 y 40..312 (실측), 아래에 남는 건 78px 뿐이다.
//  그래서 정보·팔레트는 전장 **위에 겹치고**(OVERLAY_H 까지), 액션만 아래에 둔다.
//  터치 타깃은 전부 설계 55px 이상 — SE(667×375, FIT 0.813)에서 화면 44px 를 넘어야 한다.
GAME.BuildScene.PHONE = {
  PAD: 12,
  POWER_Y: 3, STATUS_Y: 24,
  CTRL_Y: 47, CTRL_H: 56,        // 예산 게이지 + 티어 버튼이 같은 줄
  METER_Y: 62, METER_W: 466,
  PAL_Y: 107,
  OVERLAY_H: 172,                // 여기까지는 HUD 다 — 전장 탭으로 오인하면 안 된다
  ACT_Y: 318, ACT_H: 56,
  VER_W: 52                      // 우하단 DOM 버전 배지(#ver) 자리
};

GAME.BuildScene.prototype.init = function (data) {
  this.placed = [];
  this.history = [];         // 되돌리기 — 한 번의 배치가 만든 유닛들을 묶어 쌓는다
  this.selected = null;      // ✕ 배지를 띄울 유닛
  this.picked = 'bayonet';
  this.mirror = true;        // 좌우 대칭 배치 (기본 켬 — 대부분의 진형이 대칭이다)
  this.tier = GAME.CONFIG.DEFAULT_TIER;
  // 수성의 탑에서 들어오면 그 층의 고정 예산을 쓰고, 승패가 층에 반영된다.
  this.defendTower = (data && data.defendTower) || 0;
  // 대전에서 '기지 만들기'로 들어왔는가 — 저장 시 그 배치도를 내 기지로 삼는다
  this.pickBase = !!(data && data.pickBase);
  // 씬을 다시 들어오면 이전 타이머는 이미 죽어 있다 — 참조를 반드시 비운다
  this._holdTimer = null;
  this._warnTimer = null;
  this.delBadge = null;
};

GAME.BuildScene.prototype.create = function () {
  var C = GAME.CONFIG.COLORS;
  var UI = GAME.UI;
  var self = this;
  var P = GAME.CONFIG.PORTRAIT;
  // 폰 가로(820×390)는 아레나 아래에 78px 밖에 안 남는다(실측: 아레나 바닥 312).
  // 예전 가로 배치(행 합계 344px)를 그대로 쓰면 팔레트부터 전부 화면 밖이었다.
  // 롤토체스처럼 **HUD 를 전장 위에 겹쳐** 올리고, 아래 78px 은 액션 줄에만 쓴다.
  var PH = GAME.CONFIG.PHONE;
  var SM = P || PH;                       // 칩을 세로형(아이콘 위·이름 아래)으로 그리는가
  var W = GAME.CONFIG.WIDTH;
  var L = GAME.Layout;
  var hud = L.hud();

  this.cameras.main.setBackgroundColor(C.bg);
  // 배치 화면은 팔레트·버튼이 아레나 **아래**에 있다 → 전투용 전체화면 투영이 새어 들어오면
  // 아레나가 화면을 다 먹어 팔레트가 잘린다. 진입할 때마다 기본 투영으로 확정한다.
  GAME.Iso.setMode('default');
  // 수성의 탑은 층 고정 예산, 일반 방어전은 티어 예산.
  this.budget = this.defendTower ? GAME.DefendTower.budgetFor(this.defendTower)
                                 : GAME.CONFIG.BUDGETS[this.tier];
  this.zone = GAME.CONFIG.ZONE_CONTROLLER;
  this.myColor = C.strategist;

  this.g = this.add.graphics();

  var dtHeroName = '';
  if (this.defendTower) {
    var dtHeroKey = GAME.DefendTower.heroKeyFor(this.defendTower, GAME.DefendTower.skillFor(this.defendTower));
    dtHeroName = GAME.HEROES[dtHeroKey].name;
  }

  // ── 아레나 위 한 줄 안내 ────────────────────────────────────────────────
  //  예전에는 이 안내가 전장 **안**에 있어서 유닛 그림 위에 얹혔다. 밖으로 뺀다.
  //  폰 가로에서는 HUD 가 이미 전장 위를 덮으므로 이 줄을 따로 두지 않는다
  //  (덮인 위쪽에 '상대가 보게 될 모습'을 안내해봐야 볼 수가 없다).
  if (!PH) {
    var topLabel = P ? '위 = 상대가 보는 모습  ·  아래 파란 칸 = 내 진형'
                     : '위 = 상대가 보게 될 모습  ·  아래 파란 칸이 내 진형 배치 구역';
    if (this.defendTower) topLabel = this.defendTower + '층 방어 — 오는 영웅: ' + dtHeroName;
    UI.text(this, hud.pad, 16, topLabel, { size: 'caption', color: C.accentAlt });
  }

  // ── 행 배분 ────────────────────────────────────────────────────────────
  //  손으로 좌표를 박지 않는다. 세로는 HUD 352px 안에 342px 를 쓴다(여유 10).
  var chipH = 62;
  var PHL = GAME.BuildScene.PHONE;
  var rows = PH ? {
    power:  { y: PHL.POWER_Y,  h: 19, cy: PHL.POWER_Y + 9.5,  bottom: PHL.POWER_Y + 19 },
    status: { y: PHL.STATUS_Y, h: 19, cy: PHL.STATUS_Y + 9.5, bottom: PHL.STATUS_Y + 19 },
    budget: { y: PHL.METER_Y,  h: 26, cy: PHL.METER_Y + 13,   bottom: PHL.METER_Y + 26 },
    tier:   { y: PHL.CTRL_Y,   h: PHL.CTRL_H, cy: PHL.CTRL_Y + PHL.CTRL_H / 2, bottom: PHL.CTRL_Y + PHL.CTRL_H },
    tools:  { y: PHL.ACT_Y,    h: PHL.ACT_H,  cy: PHL.ACT_Y + PHL.ACT_H / 2,   bottom: PHL.ACT_Y + PHL.ACT_H },
    act:    { y: PHL.ACT_Y,    h: PHL.ACT_H,  cy: PHL.ACT_Y + PHL.ACT_H / 2,   bottom: PHL.ACT_Y + PHL.ACT_H },
    pal0:   { y: PHL.PAL_Y,    h: chipH, cy: PHL.PAL_Y + chipH / 2, bottom: PHL.PAL_Y + chipH },
    pal1:   { y: PHL.PAL_Y,    h: chipH, cy: PHL.PAL_Y + chipH / 2, bottom: PHL.PAL_Y + chipH }
  } : L.rows(P ? [
    { name: 'budget', h: 26, gap: 4 },
    { name: 'power',  h: 19, gap: 3 },
    { name: 'status', h: 20, gap: 5 },
    { name: 'pal0',   h: chipH, gap: 5 },
    { name: 'pal1',   h: chipH, gap: 7 },
    { name: 'tools',  h: 38, gap: 5 },
    { name: 'tier',   h: 36, gap: 5 },
    { name: 'act',    h: 44, gap: 0 }
  ] : [
    { name: 'budget', h: 30, gap: 6 },
    { name: 'power',  h: 22, gap: 6 },
    { name: 'status', h: 22, gap: 10 },
    { name: 'pal0',   h: chipH, gap: 8 },
    { name: 'pal1',   h: chipH, gap: 12 },
    // 가로는 폭이 넓다 — 도구(왼쪽)와 예산 티어(오른쪽)를 한 줄에 나눠 담는다
    { name: 'tools',  h: 44, gap: 12 },
    { name: 'act',    h: 48, gap: 0 }
  ]);
  this.rowsRef = rows;
  rows.tier = rows.tier || rows.tools;

  // ── 예산 게이지 ─────────────────────────────────────────────────────────
  //  "예산이 얼마 남았는지 감이 안 온다"는 지적. 숫자만으로는 남은 양이 안 읽힌다.
  var pad = PH ? PHL.PAD : hud.pad;
  var meterW = PH ? PHL.METER_W : Math.min(hud.w - hud.pad * 2, P ? 396 : 620);
  this.budgetMeter = UI.meter(this, pad, rows.budget.y, meterW, rows.budget.h, {
    frac: 0, color: C.strategist, track: UI.COL.meterTrack,
    label: { size: SM ? 'caption' : 'body', color: C.text, align: 'center' }
  });

  // ── 진형 전력 요약 ──────────────────────────────────────────────────────
  //  "지금 진형이 얼마나 센지 감이 안 온다" → 체력 총합·초당 피해·구성 세 가지.
  //  전투 로직은 손대지 않는다. units.js 의 값을 읽어 **보여주기만** 한다.
  this.powerText = UI.text(this, pad, rows.power.y, '', {
    size: SM ? 'micro' : 'caption', color: C.textMid, outline: PH
  });

  // ── 상태 한 줄 (안내 ↔ 유닛 설명 ↔ 경고 겸용) ───────────────────────────
  //  예전에는 설명과 경고가 **다른 두 객체로 같은 줄에** 찍혀 겹쳤다. 하나로 합쳤다.
  this.statusText = UI.text(this, pad, rows.status.y, '', {
    size: SM ? 'micro' : 'caption', color: C.textDim, outline: PH
  });
  // 줄바꿈을 허용하면 두 번째 줄이 팔레트를 덮는다(예전 화면이 정확히 그 상태였다).
  // 대신 **한 줄에 맞게 잘라 넣는다** — 웹폰트가 안 와서 폭 넓은 폴백으로 그려져도 안전하다.
  this.lineMaxW = hud.w - pad * 2;

  // ── 유닛 팔레트 ─────────────────────────────────────────────────────────
  //  폰 가로는 **한 줄 10칸**이다. 두 줄로 쌓으면 전장을 62px 더 덮는데,
  //  칸 폭 76 이면 세로형 칩(아이콘 위·이름 아래)이 그대로 들어간다.
  var perRow = PH ? GAME.UNIT_ORDER.length : 5;
  this.chips = [];
  var cols = L.cols(perRow, { gap: PH ? 4 : (P ? 5 : 8), pad: pad });
  var chipRects = [];
  for (var i = 0; i < GAME.UNIT_ORDER.length; i++) {
    var key = GAME.UNIT_ORDER[i];
    var r0 = Math.floor(i / perRow), c0 = cols[i % perRow];
    var rowY = (r0 === 0 ? rows.pal0 : rows.pal1);
    var rect = this.add.rectangle(c0.cx, rowY.cy, c0.w, chipH, UI.COL.surfaceAlt)
      .setStrokeStyle(1, UI.COL.border);
    rect.setInteractive({ useHandCursor: true });
    (function (k) { rect.on('pointerdown', function () { self._pick(k); }); })(key);
    chipRects.push({ key: key, rect: rect, x: c0.x, w: c0.w, cx: c0.cx, y: rowY.y, cy: rowY.cy, h: chipH });
  }
  // ★ 아이콘 Graphics 는 칩 사각형 **다음에** 만든다. 이 한 줄이 예전 버그의 수정이다.
  this.palG = this.add.graphics();
  // 모서리 숫자 뒤에 깔 알약 — 아이콘이 커서 모서리까지 뻗어도 숫자가 안 묻히게 한다.
  // 순서가 전부다: 칩(사각형) → 아이콘 → 알약 → 글자.
  this.chipTagG = this.add.graphics();

  // 칩 위 글자 — Graphics 다음에 만들어야 아이콘에 안 묻힌다
  for (var j = 0; j < chipRects.length; j++) {
    var ch = chipRects[j];
    var def = GAME.UNITS[ch.key];
    if (SM) {
      // 세로(칸 75×62) · 폰 가로(칸 76×62): 아이콘이 칸을 거의 다 쓰고 이름은 바닥에, 숫자는 모서리에.
      // **그림이 1순위 식별자**다 — 좁은 칸에서 이름 4~5글자보다 실루엣이 빨리 읽힌다.
      // drawUnitFlat 의 y 는 '발밑'이라 이름 윗줄에 발이 닿게 잡는다.
      ch.iconX = ch.cx;
      ch.iconY = ch.y + 42;
      ch.iconScale = 0.86;
      ch.tile = { x: ch.x + 3, y: ch.y + 2, w: ch.w - 6, h: 40 };
      // 이름표 띠 — 유닛이 이름판 뒤에 서 있는 카드 모양. 62px 칸에서 아이콘을
      // 크게 두면서 이름도 읽히게 하는 유일한 방법이다(둘 다 크게는 물리적으로 불가).
      ch.bar = { x: ch.x + 3, y: ch.y + 41, w: ch.w - 6, h: 19 };
      ch.nameTxt = UI.text(this, ch.cx, ch.y + 42, def.name,
        { size: 'micro', color: C.text, origin: 0.5, originY: 0 });
      ch.costTxt = UI.text(this, ch.x + ch.w - 5, ch.y + 2, String(def.cost),
        { size: 'micro', color: C.accent, origin: 1, originY: 0 });
      ch.countTxt = UI.text(this, ch.x + 5, ch.y + 2, '', {
        size: 'micro', color: C.crit, origin: 0, originY: 0
      });
    } else {
      // 가로(칸 252×62): 아이콘 왼쪽, 이름·가격 오른쪽 — 폭이 넉넉해 겹칠 일이 없다
      ch.iconX = ch.x + 34;
      ch.iconY = ch.cy + 20;
      ch.iconScale = 1.05;
      ch.tile = { x: ch.x + 6, y: ch.cy - 28, w: 58, h: 56 };
      ch.nameTxt = UI.text(this, ch.x + 68, ch.cy - 13, def.name,
        { size: 'subhead', color: C.text });
      ch.costTxt = UI.text(this, ch.x + 68, ch.cy + 9, String(def.cost) + ' 원',
        { size: 'caption', color: C.accent });
      ch.countTxt = UI.text(this, ch.x + ch.w - 8, ch.cy, '', {
        size: 'caption', color: C.crit, origin: 1, originY: 0.5
      });
    }
    ch.countTxt.setVisible(false);
    this.chips.push(ch);
  }

  // 폰 가로: 아래 78px 한 줄에 도구 3 + 액션 3 = 6칸을 나눠 담는다.
  // 오른쪽 끝은 DOM 버전 배지 자리라 비운다.
  function phSlots(n, left, total, gap) {
    var w = Math.floor((total - gap * (n - 1)) / n);
    var out = [];
    for (var i = 0; i < n; i++) { var x = left + i * (w + gap); out.push({ x: x, w: w, cx: x + w / 2 }); }
    return out;
  }
  var phBar = PH ? phSlots(6, PHL.PAD, W - PHL.PAD - PHL.VER_W, 6) : null;

  // ── 도구: 되돌리기 · 대칭 · 전부 지우기 ─────────────────────────────────
  var toolW = P ? hud.w : Math.round(hud.w * 0.52);
  var tcols = PH ? [phBar[0], phBar[1], phBar[2]]
                 : L.cols(3, { gap: 8, width: toolW, left: hud.pad });
  UI.button(this, tcols[0].cx, rows.tools.cy, tcols[0].w, rows.tools.h, '되돌리기',
    function () { self._undo(); }, { fontSize: 'buttonSm' });
  this.mirrorBtn = UI.button(this, tcols[1].cx, rows.tools.cy, tcols[1].w, rows.tools.h, '',
    function () { self.mirror = !self.mirror; self.redraw(); },
    { fontSize: 'buttonSm' });
  UI.button(this, tcols[2].cx, rows.tools.cy, tcols[2].w, rows.tools.h, '전부 지우기', function () {
    self.placed = []; self.history = []; self.selected = null;
    self._status(); self.redraw();
  }, { fontSize: 'buttonSm' });

  // ── 예산 티어 ───────────────────────────────────────────────────────────
  //  수성의 탑은 층 고정 예산이라 티어 선택을 숨기고 층 정보를 보여준다.
  this.tierButtons = [];
  var tierLeft = PH ? (PHL.PAD + PHL.METER_W + 12) : (P ? hud.pad : (toolW + hud.pad));
  var tierW = PH ? (W - tierLeft - PHL.PAD) : (P ? hud.w : (hud.w - toolW - hud.pad));
  if (this.defendTower) {
    if (PH) {
      // 폰은 이 자리가 좁다 — 층·예산과 '오는 영웅'을 두 줄로 나눈다(전략가가 보고 배치한다).
      UI.text(this, tierLeft, rows.tier.y + 6,
        '수성의 탑 ' + this.defendTower + '층 · 예산 ' + this.budget,
        { size: 'micro', color: C.accentAlt, outline: true });
      UI.text(this, tierLeft, rows.tier.y + 28, '오는 영웅 — ' + dtHeroName,
        { size: 'micro', color: C.crit, outline: true });
    } else {
      UI.text(this, tierLeft, rows.tier.cy, '수성의 탑 ' + this.defendTower + '층  ·  고정 예산 ' + this.budget,
        { size: 'caption', color: C.accentAlt, origin: 0, originY: 0.5 });
    }
  } else {
    var tcols2 = PH ? phSlots(3, tierLeft, tierW, 6)
                    : L.cols(3, { gap: 8, width: tierW, left: tierLeft });
    var tiers = GAME.CONFIG.BUDGET_TIERS;
    for (var t = 0; t < tiers.length; t++) {
      (function (tier, idx) {
        var cc = tcols2[idx];
        var b = UI.button(self, cc.cx, rows.tier.cy, cc.w, rows.tier.h,
          tier.replace('예산', '') + ' ' + GAME.CONFIG.BUDGETS[tier], function () {
            self.tier = tier;
            self.budget = GAME.CONFIG.BUDGETS[tier];
            self._trimToBudget();
            self.redraw();
          }, { fontSize: 'buttonSm' });
        self.tierButtons.push({ tier: tier, ui: b });
      })(tiers[t], t);
    }
  }

  // ── 액션 ────────────────────────────────────────────────────────────────
  //  '전부 지우기'를 도구 줄로 옮겨 세 칸이 됐다 → 버튼이 넓어져 오탭이 준다.
  var acols = PH ? [phBar[3], phBar[4], phBar[5]] : L.cols(3, { gap: 8 });
  var actFs = PH ? 'buttonSm' : 'button';
  UI.button(this, acols[0].cx, rows.act.cy, acols[0].w, rows.act.h, '방어전 시작', function () {
    self._defend();
  }, { fill: UI.COL.panelTeal, line: C.controller, hover: UI.COL.panelTealHi,
       color: C.accent, fontSize: actFs });
  UI.button(this, acols[1].cx, rows.act.cy, acols[1].w, rows.act.h, '배치도 저장', function () {
    self._save();
  }, { fill: UI.COL.panelPurple, line: C.strategist, hover: UI.COL.panelPurpleHi,
       color: C.accentAlt, fontSize: actFs });
  UI.button(this, acols[2].cx, rows.act.cy, acols[2].w, rows.act.h,
    this.defendTower ? '← 탑' : '메뉴', function () {
      self.scene.start(self.defendTower ? 'DefendTower' : 'Menu');
    }, { fontSize: actFs });

  // ── 삭제 배지(✕) 글자 — 맨 위에 얹히도록 마지막에 만든다 ────────────────
  this.delTxt = UI.text(this, 0, 0, '✕', {
    size: P ? 'subhead' : 'heading', color: '#ffffff', origin: 0.5
  }).setVisible(false);

  // ── 입력 ────────────────────────────────────────────────────────────────
  // 폰 가로는 HUD 가 전장 **위에** 얹혀 있다 → 그 띠 안의 탭은 전장 탭이 아니다.
  // 이 가드가 없으면 팔레트를 누를 때마다 '아래 파란 칸 안에만…' 경고가 같이 뜬다.
  this.hudTopBand = PH ? PHL.OVERLAY_H : 0;

  this.input.on('pointerdown', function (p) {
    // ① ✕ 배지가 먼저다 — 배지를 눌렀는데 그 아래 유닛이 다시 선택되면 안 된다
    if (self._hitDelete(p.x, p.y)) {
      self._removeUnit(self.selected);
      return;
    }
    if (p.y < self.hudTopBand) return;
    if (p.y > GAME.Iso.screenRect().bottom) return;
    var wpt = GAME.Iso.toWorld(p.x, p.y);
    if (p.rightButtonDown()) { self._removeAt(wpt.x, wpt.y); return; }
    // 이미 놓은 유닛을 누르면 '선택'이다 — ✕ 배지와 체력바를 보여준다.
    // 빈 자리를 누르면 새로 배치한다.
    var hit = self._unitAt(wpt.x, wpt.y);
    if (hit) {
      self.selected = (self.selected === hit) ? null : hit;
      self.redraw();
      // 길게 눌러도 지워진다 — 예전부터 쓰던 사람을 위한 보조 수단.
      self._cancelHold();
      self._holdTimer = self.time.delayedCall(GAME.BuildScene.HOLD_MS, function () {
        self._holdTimer = null;
        self._removeAt(wpt.x, wpt.y);
      });
      return;
    }
    self.selected = null;
    self._placeAt(wpt.x, wpt.y);
  });

  var cancelHold = function () { self._cancelHold(); };
  this.input.on('pointerup', cancelHold);
  this.input.on('pointerupoutside', cancelHold);
  this.events.on('shutdown', function () {
    self._cancelHold();
    if (self._warnTimer) { self._warnTimer.remove(false); self._warnTimer = null; }
  });

  this.input.mouse.disableContextMenu();
  this._status();
  this.redraw();
};

GAME.BuildScene.prototype._cancelHold = function () {
  if (this._holdTimer) { this._holdTimer.remove(false); this._holdTimer = null; }
};

// 한 줄에 맞을 때까지 뒤에서 잘라낸다. 보통 한 번도 안 돈다.
GAME.BuildScene.prototype._fitLine = function (txt, s) {
  txt.setText(s);
  var guard = 0;
  while (txt.width > this.lineMaxW && guard++ < 60) {
    var t = txt.text;
    txt.setText(t.slice(0, Math.max(4, t.length - 2 - (t.slice(-1) === '…' ? 1 : 0))) + '…');
  }
  return txt;
};

// ── 상태 줄 ─────────────────────────────────────────────────────────────────
//  경고와 설명이 **같은 객체**를 쓴다. 두 객체로 나뉘어 있던 것이 겹침의 원인이었다.
GAME.BuildScene.prototype._status = function () {
  if (!this.statusText) return;
  var C = GAME.CONFIG.COLORS;
  var def = GAME.UNITS[this.picked];
  var msg = this.placed.length
    ? (def.name + ' (' + def.cost + ') — ' + def.desc)
    : '아래 파란 칸을 탭하면 배치, 놓인 유닛을 탭하면 ✕ 로 삭제';
  this.statusText.setColor(C.textDim);
  this._fitLine(this.statusText, msg);
};

GAME.BuildScene.prototype._warn = function (msg) {
  var self = this;
  if (!this.statusText) return;
  this.statusText.setColor(GAME.CONFIG.COLORS.warn);
  this._fitLine(this.statusText, msg);
  if (this._warnTimer) this._warnTimer.remove(false);
  this._warnTimer = this.time.delayedCall(GAME.BuildScene.WARN_MS, function () {
    self._warnTimer = null;
    self._status();
  });
};

GAME.BuildScene.prototype._pick = function (key) {
  this.picked = key;
  this._status();
  this.redraw();
};

GAME.BuildScene.prototype.spent = function () {
  var t = 0;
  for (var i = 0; i < this.placed.length; i++) t += GAME.UNITS[this.placed[i].type].cost;
  return t;
};

// 이 유닛을 지금 놓을 수 있는가 — 팔레트를 미리 흐리게 하는 판단에도, 배치에도 같이 쓴다.
// (판단을 한 곳에 모아둬야 "흐린데 눌러보니 놓아진다" 같은 어긋남이 안 생긴다)
GAME.BuildScene.prototype._blockedReason = function (key) {
  var def = GAME.UNITS[key];
  if (def.maxPerFormation && this._countOf(key) >= def.maxPerFormation) {
    return def.name + '은(는) 배치도당 ' + def.maxPerFormation + '개까지만 놓을 수 있습니다.';
  }
  if (this.spent() + def.cost > this.budget) {
    return '예산이 부족합니다. (' + def.name + ' ' + def.cost + ' · 남은 ' + (this.budget - this.spent()) + ')';
  }
  return null;
};

// 배치된 유닛 중 이 좌표를 누른 것 (가장 가까운 것 하나)
GAME.BuildScene.prototype._unitAt = function (x, y) {
  var best = null, bestD = Infinity;
  for (var i = 0; i < this.placed.length; i++) {
    var p = this.placed[i];
    var def = GAME.UNITS[p.type];
    var dx = p.x - x, dy = p.y - y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d <= def.radius + 10 && d < bestD) { bestD = d; best = p; }
  }
  return best;
};

GAME.BuildScene.prototype._trimToBudget = function () {
  while (this.spent() > this.budget && this.placed.length) {
    var gone = this.placed.pop();
    if (this.selected === gone) this.selected = null;
  }
  this.history = [];   // 잘라낸 뒤의 되돌리기는 의미가 없다
};

GAME.BuildScene.prototype._countOf = function (type) {
  var n = 0;
  for (var i = 0; i < this.placed.length; i++) if (this.placed[i].type === type) n++;
  return n;
};

// 겹치지 않는 자리인가
GAME.BuildScene.prototype._tooClose = function (x, y) {
  for (var i = 0; i < this.placed.length; i++) {
    var p = this.placed[i];
    var dx = p.x - x, dy = p.y - y;
    if (Math.sqrt(dx * dx + dy * dy) < 30) return true;
  }
  return false;
};

// 한 기만 놓는다. 성공하면 놓인 객체, 실패하면 사유 문자열.
GAME.BuildScene.prototype._putOne = function (x, y) {
  if (!GAME.UI.inZone(this.zone, x, y)) return '아래 파란 칸 안에만 놓을 수 있습니다.';
  var blocked = this._blockedReason(this.picked);
  if (blocked) return blocked;
  if (this._tooClose(x, y)) return '유닛이 너무 가깝습니다.';
  var u = { type: this.picked, x: Math.round(x), y: Math.round(y) };
  this.placed.push(u);
  return u;
};

GAME.BuildScene.prototype._placeAt = function (x, y) {
  var A = GAME.CONFIG.ARENA;
  var first = this._putOne(x, y);
  if (typeof first === 'string') { this._warn(first); return; }

  var group = [first];
  // ── 좌우 대칭 배치 ────────────────────────────────────────────────────
  //  진형은 거의 항상 좌우 대칭이다. 대칭이면 전장 탭이 절반으로 준다.
  //  가운데(대칭축) 근처는 짝을 놓으면 서로 겹치므로 한 기만 둔다.
  if (this.mirror) {
    var cx = A.x + A.w / 2;
    var mx = 2 * cx - x;
    if (Math.abs(mx - x) >= 34) {
      var twin = this._putOne(mx, y);
      if (typeof twin !== 'string') group.push(twin);
      // 짝을 못 놓는 흔한 이유는 예산이다 — 굳이 경고까지 띄우면 시끄럽다.
    }
  }
  this.history.push(group);
  this._status();
  this.redraw();
};

GAME.BuildScene.prototype._undo = function () {
  if (!this.history.length) { this._warn('되돌릴 배치가 없습니다.'); return; }
  var group = this.history.pop();
  for (var i = 0; i < group.length; i++) {
    var idx = this.placed.indexOf(group[i]);
    if (idx >= 0) this.placed.splice(idx, 1);
    if (this.selected === group[i]) this.selected = null;
  }
  this._status();
  this.redraw();
};

GAME.BuildScene.prototype._removeUnit = function (u) {
  if (!u) return;
  var idx = this.placed.indexOf(u);
  if (idx < 0) return;
  this.placed.splice(idx, 1);
  if (this.selected === u) this.selected = null;
  // 되돌리기 기록에서도 지운다 — 안 그러면 이미 없는 유닛을 되돌리려 한다
  for (var i = this.history.length - 1; i >= 0; i--) {
    var g = this.history[i];
    var k = g.indexOf(u);
    if (k >= 0) g.splice(k, 1);
    if (!g.length) this.history.splice(i, 1);
  }
  this._status();
  this.redraw();
};

GAME.BuildScene.prototype._removeAt = function (x, y) {
  for (var i = this.placed.length - 1; i >= 0; i--) {
    var p = this.placed[i];
    var dx = p.x - x, dy = p.y - y;
    if (Math.sqrt(dx * dx + dy * dy) <= GAME.UNITS[p.type].radius + 12) {
      this._removeUnit(p);
      return;
    }
  }
};

// ✕ 배지를 눌렀는가 (화면 좌표)
GAME.BuildScene.prototype._hitDelete = function (sx, sy) {
  var b = this.delBadge;
  if (!b || !this.selected) return false;
  var dx = sx - b.x, dy = sy - b.y;
  return Math.sqrt(dx * dx + dy * dy) <= b.r + 8;
};

// 진형 전력 — units.js 값을 **읽기만** 한다(밸런스 수치는 건드리지 않는다).
GAME.BuildScene.prototype._power = function () {
  var hp = 0, dps = 0, melee = 0, ranged = 0, support = 0;
  for (var i = 0; i < this.placed.length; i++) {
    var d = GAME.UNITS[this.placed[i].type];
    hp += d.hp;
    if (d.damage > 0 && d.cooldown > 0 && d.cooldown < 100000) dps += d.damage / (d.cooldown / 1000);
    if (d.attack === 'none') support++;
    else if (d.attack === 'melee') melee++;
    else ranged++;
  }
  return { hp: Math.round(hp), dps: Math.round(dps), melee: melee, ranged: ranged, support: support };
};

// 방어전 — AI 컨트롤러가 이 진형을 공격한다
GAME.BuildScene.prototype._defend = function () {
  if (!this.placed.length) {
    this._warn('유닛을 최소 1기 배치해야 합니다.');
    return;
  }
  this.scene.start('Defend', {
    placed: this.placed.slice(), tier: this.tier, budget: this.budget,
    defendTower: this.defendTower
  });
};

GAME.BuildScene.prototype._save = function () {
  if (!this.placed.length) {
    this._warn('유닛을 최소 1기 배치해야 합니다.');
    return;
  }
  var name = window.prompt('배치도 이름을 입력하세요', '내 진형');
  if (!name) return;

  // 한 배치가 모든 영웅을 커버할 수는 없다 → 이 배치도가 **어떤 영웅을 상대로 짠 것인지**
  // 지정해 저장한다. 매칭할 때 그 영웅으로 오는 상대에게 우선 출전한다.
  var order = GAME.HERO_ORDER;
  var menu = order.map(function (k, i) {
    return (i + 1) + '. ' + GAME.HEROES[k].name + ' (' + GAME.HEROES[k].trait + ')';
  }).join('\n');
  var ans = window.prompt(
    '이 배치도는 어떤 영웅을 상대로 짠 것인가요?\n\n' + menu + '\n0. 특정 영웅 없음 (범용)\n\n번호 입력', '0');
  if (ans === null) return;
  var idx = parseInt(ans, 10);
  var vsHero = (idx >= 1 && idx <= order.length) ? order[idx - 1] : null;

  // 아래에서 만든 걸 위쪽(전투 기준)으로 뒤집고, 정규화 좌표로 저장
  var units = this.placed.map(function (p) {
    var n = GAME.Formations.normalize(p.x, GAME.mirrorY(p.y));
    return { type: p.type, nx: n.nx, ny: n.ny };
  });
  var newId = GAME.Formations.newId();
  GAME.Formations.save({
    id: newId,
    name: name.slice(0, 20),
    author: '나', isAI: false,
    tier: this.tier, budget: this.budget, v: 2,
    vsHero: vsHero,
    units: units
  });
  // 대전에서 '기지 만들기'로 들어왔으면 방금 저장한 배치도를 내 기지로 삼고 돌아간다.
  // 저장만 하고 끝내면 유저가 기지를 지정하는 단계를 또 밟아야 한다.
  if (this.pickBase && GAME.Arena) {
    GAME.Arena.setBase(newId);
    this.scene.start('Versus');
    return;
  }
  this.scene.start('Menu');
};

GAME.BuildScene.prototype.redraw = function () {
  var C = GAME.CONFIG.COLORS;
  var UI = GAME.UI;
  var g = this.g;
  var Iso = GAME.Iso;
  var P = GAME.CONFIG.PORTRAIT;
  var PH = GAME.CONFIG.PHONE;
  var i, def;
  g.clear();

  UI.drawArena(g, { zones: true });

  // 폰 가로 — HUD 를 전장 위에 겹치므로 그 띠에 불투명 판을 깐다.
  // 판이 없으면 전장 격자 위에 글자가 얹혀 읽히지 않는다.
  if (PH) {
    var K = GAME.BuildScene.PHONE;
    g.fillStyle(UI.COL.surface, 0.94);
    g.fillRoundedRect(4, -14, GAME.CONFIG.WIDTH - 8, K.OVERLAY_H + 8, 12);
    g.lineStyle(1, UI.COL.border, 1);
    g.strokeRoundedRect(4.5, -14, GAME.CONFIG.WIDTH - 9, K.OVERLAY_H + 8, 12);
  }

  g.lineStyle(2, this.myColor, 0.85);
  g.strokeRect(this.zone.x + 2, Iso.toScreenY(this.zone.y) + 2,
    this.zone.w - 4, this.zone.h * Iso.TILT - 4);

  // 대칭 배치가 켜져 있으면 대칭축을 보여준다 — 어디를 누르면 짝이 생기는지 알 수 있게
  if (this.mirror) {
    var A = GAME.CONFIG.ARENA;
    var axis = A.x + A.w / 2;
    g.lineStyle(1, this.myColor, 0.35);
    g.lineBetween(axis, Iso.toScreenY(this.zone.y) + 4, axis, Iso.toScreenY(this.zone.y + this.zone.h) - 4);
  }

  // 위쪽: 상대가 볼 모습(뒤집힌 미리보기)
  // 폰 가로에서는 이 구역이 HUD 판 아래로 완전히 들어간다 → 그리지 않는다(가려서 안 보인다).
  if (!PH) {
    for (i = 0; i < this.placed.length; i++) {
      var pv = this.placed[i];
      UI.drawUnit(g, GAME.UNITS[pv.type], pv.x, GAME.mirrorY(pv.y), C.strategist, 0.3, Math.PI / 2);
    }
  }

  // 아래쪽: 내가 놓은 것 (깊이 정렬)
  var sorted = this.placed.slice().sort(function (a, b) { return a.y - b.y; });
  var selPos = null;
  for (i = 0; i < sorted.length; i++) {
    var p = sorted[i];
    def = GAME.UNITS[p.type];
    // 지원 유닛의 영향 범위를 배치 중에 보여준다
    var FX = UI.FX;
    if (def.healRadius) { g.lineStyle(1.5, FX.healRing, 0.3); UI.groundCircle(g, p.x, p.y, def.healRadius); }
    if (def.buffRadius) { g.lineStyle(1.5, FX.buffRing, 0.3); UI.groundCircle(g, p.x, p.y, def.buffRadius); }
    if (def.isMine) { g.lineStyle(1.5, FX.mineRing, 0.5); UI.groundCircle(g, p.x, p.y, def.triggerRadius); }
    if (def.intercept) { g.lineStyle(1.5, FX.guardRing, 0.35); UI.groundCircle(g, p.x, p.y, def.intercept); }
    var pos = UI.drawUnit(g, def, p.x, p.y, this.myColor, 1, -Math.PI / 2);
    if (!GAME.isNonTarget(def)) {
      g.lineStyle(2, FX.targetRing, 0.9);
      UI.groundCircle(g, p.x, p.y, def.radius + 7);
    }
    if (this.selected === p && pos) {
      UI.hpBar(g, pos.sx, pos.by, def.radius, 1, { width: Math.max(30, def.radius * 2.6) });
      selPos = { pos: pos, def: def };
    }
  }

  // ── ✕ 삭제 배지 ────────────────────────────────────────────────────────
  //  길게 누르기는 아무도 못 찾는다(그리고 폰에는 우클릭이 없다).
  //  선택한 유닛 머리 위에 눌러서 지우는 표적을 띄운다. 탭 두 번이면 삭제다.
  this.delBadge = null;
  if (selPos) {
    var br = P ? 15 : 17;
    var bx = selPos.pos.sx + selPos.def.radius + br * 0.8;
    var by = selPos.pos.by - selPos.def.radius * 1.9 - br * 0.6;
    // 화면(아레나) 밖으로 나가지 않게 가둔다.
    // 폰 가로는 아레나 위쪽이 HUD 판에 덮여 있으므로 그 아래로도 가둔다 — 안 그러면
    // 배지가 판 뒤로 숨어 "지울 수 없는 유닛"이 된다.
    var rect = Iso.screenRect();
    var topLimit = Math.max(rect.y, this.hudTopBand || 0);
    bx = Math.max(rect.x + br + 2, Math.min(rect.right - br - 2, bx));
    by = Math.max(topLimit + br + 2, Math.min(rect.bottom - br - 2, by));
    g.fillStyle(UI.COL.shadow === undefined ? 0x000000 : UI.COL.shadow, 0.3);
    g.fillCircle(bx, by + 2, br);
    g.fillStyle(C.hpBad, 1);
    g.fillCircle(bx, by, br);
    g.lineStyle(2, 0xffffff, 0.9);
    g.strokeCircle(bx, by, br);
    this.delBadge = { x: bx, y: by, r: br };
    this.delTxt.setPosition(bx, by).setVisible(true);
  } else {
    this.delTxt.setVisible(false);
  }

  // ── 팔레트 ──────────────────────────────────────────────────────────────
  this.palG.clear();
  this.chipTagG.clear();
  var tagG = this.chipTagG;
  function tagPill(txt, fill) {
    if (!txt.visible) return;
    var b = txt.getBounds();
    var pad = 4, rr = (b.height + 2) / 2;
    tagG.fillStyle(fill, 0.88);
    tagG.fillRoundedRect(b.x - pad, b.y - 1, b.width + pad * 2, b.height + 2, rr);
  }
  for (var c = 0; c < this.chips.length; c++) {
    var chip = this.chips[c];
    var cdef = GAME.UNITS[chip.key];
    var on = chip.key === this.picked;
    var blocked = !!this._blockedReason(chip.key);
    var n = this._countOf(chip.key);

    chip.rect.setStrokeStyle(on ? 2 : 1, on ? this.myColor : UI.COL.border);
    chip.rect.setFillStyle(on ? UI.COL.surfaceHi : UI.COL.surfaceAlt);
    chip.rect.setAlpha(blocked && !on ? 0.5 : 1);

    // 예산이 모자라거나 개수 상한에 닿은 유닛은 **눌러보기 전에** 알 수 있어야 한다.
    // 예전에는 눌러야 경고가 떴다 — 그 왕복이 이 화면에서 가장 흔한 헛수고였다.
    chip.nameTxt.setColor(blocked ? C.textFaint : C.text).setAlpha(blocked ? 0.6 : 1);
    chip.costTxt.setColor(blocked ? C.danger : C.accent).setAlpha(blocked ? 0.85 : 1);
    chip.countTxt.setVisible(n > 0).setText(n > 0 ? '×' + n : '');

    // 아이콘 받침 — **몸통이 아이보리 달걀이라 크림색 칩 위에서는 안 보인다.**
    // 전장 바닥색(arenaFill)을 깔아준다. 계란 아트는 원래 그 색 위에서 읽히도록 그려졌다.
    if (chip.tile) {
      this.palG.fillStyle(C.arenaFill, blocked ? 0.55 : 1);
      this.palG.fillRoundedRect(chip.tile.x, chip.tile.y, chip.tile.w, chip.tile.h, 6);
    }
    UI.drawUnitFlat(this.palG, cdef, chip.iconX, chip.iconY,
      this.myColor, blocked ? 0.45 : 1, chip.iconScale);

    // 아이콘을 크게 그렸으니 이름·숫자는 바닥을 깔아 자리를 확보한다
    var base = on ? UI.COL.surfaceHi : UI.COL.surfaceAlt;
    if (chip.bar) {
      tagG.fillStyle(base, 1);
      tagG.fillRoundedRect(chip.bar.x, chip.bar.y, chip.bar.w, chip.bar.h,
        { tl: 0, tr: 0, bl: 5, br: 5 });
    }
    tagPill(chip.costTxt, base);
    tagPill(chip.countTxt, base);
  }

  for (var b2 = 0; b2 < this.tierButtons.length; b2++) {
    var tb = this.tierButtons[b2];
    var active = tb.tier === this.tier;
    tb.ui.rect.setStrokeStyle(active ? 2 : 1, active ? this.myColor : UI.COL.borderUi);
    tb.ui.rect.setFillStyle(active ? UI.COL.surfaceHi : UI.COL.surfaceAlt);
  }

  if (this.mirrorBtn) {
    this.mirrorBtn.setLabel(this.mirror ? '대칭 켬' : '대칭 끔');
    this.mirrorBtn.rect.setStrokeStyle(this.mirror ? 2 : 1,
      this.mirror ? this.myColor : UI.COL.borderUi);
    this.mirrorBtn.rect.setFillStyle(this.mirror ? UI.COL.surfaceHi : UI.COL.surfaceAlt);
  }

  // ── 예산 게이지 · 전력 요약 ─────────────────────────────────────────────
  var spent = this.spent();
  var left = this.budget - spent;
  this.budgetMeter.setColor(left <= 0 ? C.crit : this.myColor);
  this.budgetMeter.set(this.budget ? spent / this.budget : 0);
  this.budgetMeter.setText('예산 ' + spent + ' / ' + this.budget + '   ·   남은 ' + left
    + '   ·   유닛 ' + this.placed.length + '기');

  var pw = this._power();
  this._fitLine(this.powerText, this.placed.length
    ? ('전력  체력 ' + pw.hp + '  ·  초당 피해 ' + pw.dps
       + '  ·  근접 ' + pw.melee + ' / 원거리 ' + pw.ranged + ' / 지원 ' + pw.support)
    : (P ? '전력  —  유닛을 배치하면 진형의 세기가 여기 나옵니다'
         : '전력  —  유닛을 배치하면 체력 총합 · 초당 피해 · 구성이 여기 나옵니다'));
};
