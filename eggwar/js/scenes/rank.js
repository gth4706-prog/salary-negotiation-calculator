window.GAME = window.GAME || {};

// 랭킹 — **3분류 × 2기간 = 6개 보드.**
//
//   1단계(분류) 통곡의 탑 / 수성의 탑 / 대전     ← 큰 탭. 색이 다르다.
//   2단계(기간) 7일 / 전체                       ← 작은 알약 토글. 단색이다.
//
// 두 단계를 한 줄에 6개로 늘어놓으면 폰 가로(820×390)에서 목록이 두 줄밖에 안 남는다.
// 그래서 **폰 가로는 왼쪽 세로 레일**(분류 3 → 기간 2 → 메뉴)로 접고 오른쪽 전부를
// 목록에 준다(2열 × 5행 = 10등까지 보인다. 예전 1분류 레이아웃이 8등이었다).
// PC·세로는 세로 여유가 있으므로 가운데 정렬 2줄(분류 줄 → 기간 줄)로 둔다.
//
// 서버(Worker)가 살아 있으면 전역 랭킹을, 아니면 로컬 기록을 보여준다.
// 어느 쪽인지 화면에 정확히 표시한다 — 로컬인데 '전체'라고 하면 거짓이 된다.
// ⚠ 서버가 **옛 버전**이면 분류를 모른 채 종합 점수를 돌려준다. 그걸 '탑 랭킹'이라고
//    붙이면 층수 자리에 점수가 뜬다 → `GAME.Api.board` 가 거절하고 여기서 로컬로 폴백한다.
GAME.RankScene = function () {
  Phaser.Scene.call(this, { key: 'Rank' });
};
GAME.RankScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.RankScene.prototype.constructor = GAME.RankScene;

GAME.RankScene.prototype.init = function (data) {
  data = data || {};
  this.kind = GAME.Score.kindDef(data.kind).k;
  // 예전 진입점이 넘기던 'live' 는 이제 없는 기간이다 → 전체로 받는다
  this.scope = (data.scope === 'week') ? 'week' : 'all';
  this.rowObjects = [];
  this.scopeLabel = null;
  this.myLabel = null;
};

// ── 공용 조각 ──────────────────────────────────────────────────────────────

// 분류별 색 — 탑은 호박색, 수성(전략가)은 보라, 대전(컨트롤러)은 청록.
// 게임 안에서 이미 그 역할에 쓰는 색을 그대로 가져와야 탭이 '기능'으로 읽힌다.
GAME.RankScene.prototype._kindStyle = function (k) {
  var UI = GAME.UI, C = GAME.CONFIG.COLORS;
  // 테두리 색은 **숫자 토큰**에서만 가져온다(하드코딩하면 라이트 테마에서 안 보인다).
  // 호박색 계열의 숫자 토큰은 UI.COL.focus 하나뿐이라 그걸 쓴다 — 네 테마 모두 대비 검증된 값.
  if (k === 'tower')  return { fill: UI.COL.panelAmber,  hover: UI.COL.panelAmberHi,  line: UI.COL.focus, text: C.crit };
  if (k === 'dtower') return { fill: UI.COL.panelPurple, hover: UI.COL.panelPurpleHi, line: C.strategist, text: C.accentAlt };
  return { fill: UI.COL.panelTeal, hover: UI.COL.panelTealHi, line: C.controller, text: C.accent };
};

// 1단계 탭
GAME.RankScene.prototype._kindTab = function (k, name, cx, cy, w, h, fs) {
  var self = this;
  var on = (k === this.kind);
  var st = this._kindStyle(k);
  var b = GAME.UI.button(this, cx, cy, w, h, name, function () {
    if (k === self.kind) return;
    self.scene.start('Rank', { kind: k, scope: self.scope });
  }, on ? { fill: st.fill, hover: st.hover, color: st.text, fontSize: fs }
        : { fontSize: fs });
  if (on) b.rect.setStrokeStyle(2, st.line);
  return b;
};

// 2단계 토글 — 알약 모양·단색. 1단계와 **모양부터 다르게** 해서 층이 눈에 보이게 한다.
GAME.RankScene.prototype._scopePill = function (s, name, cx, cy, w, h, fs) {
  var self = this;
  var UI = GAME.UI, C = GAME.CONFIG.COLORS;
  var on = (s === this.scope);
  // ⚠ 반경은 **실제 픽셀**로 준다. `UI.R.pill`(999) 같은 CSS 관용 값을 Phaser
  //   Graphics 의 fillRoundedRect 에 그대로 넘기면 헤드리스에서 프레임이 돌아오지 않는다
  //   (실측: loop.step 20회에서 8초 타임아웃). 알약 모양은 반경 = 높이/2 다.
  var rad = Math.max(4, Math.floor(h / 2) - 1);
  var b = UI.button(this, cx, cy, w, h, name, function () {
    if (s === self.scope) return;
    self.scene.start('Rank', { kind: self.kind, scope: s });
  }, on ? { fill: UI.COL.surfaceHi, color: C.text, radius: rad, fontSize: fs, flat: true }
        : { fill: UI.COL.bg, color: C.textDim, radius: rad, fontSize: fs, flat: true });
  b.rect.setStrokeStyle(on ? 2 : 1, on ? UI.COL.borderUi : UI.COL.border);
  return b;
};

GAME.RankScene.prototype._load = function () {
  var self = this;
  var local = GAME.Score.kindBoard(this.kind, this.scope);
  this._renderRows(local);

  if (!GAME.Api.enabled()) return;
  GAME.Api.board(this.kind, this.scope).then(function (res) {
    if (!self.scene.isActive()) return;
    self._setNote(GAME.Score.scopeNote(true));
    self._renderRows((res && res.rows) || []);
  }).catch(function (e) {
    // 서버가 죽었거나 아직 분류를 모르는 옛 버전 → 로컬 기록을 그대로 둔다
    if (!self.scene.isActive()) return;
    self._setNote(GAME.Score.scopeNote(e && e.legacy ? 'legacy' : false));
  });
};

GAME.RankScene.prototype._setNote = function (s) {
  if (this.scopeLabel && this.scopeLabel.setText) this.scopeLabel.setText(s);
};

// '내 기록' 한 줄 — 분류마다 단위가 다르다
GAME.RankScene.prototype._myText = function () {
  var me = GAME.Account.current();
  if (!me) return '로그인하지 않았습니다';
  var d = GAME.Score.kindDef(this.kind);
  var mine = GAME.Score.myBest(me, this.kind, this.scope);
  var rank = GAME.Score.kindRankOf(me, this.kind, this.scope);
  if (!mine) return me + ' · ' + d.n + ' 기록 없음';
  return me + ' · ' + d.n + ' ' + mine.value.toLocaleString('ko-KR') + d.unit +
    (rank ? ' · ' + rank + '위' : '');
};

// ── PC(1340×900) · 세로(420×900) ───────────────────────────────────────────
GAME.RankScene.prototype.create = function () {
  if (GAME.Music) GAME.Music.play('lobby');
  var C = GAME.CONFIG.COLORS;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var P = GAME.CONFIG.PORTRAIT;
  var self = this;

  this.cameras.main.setBackgroundColor(C.bg);
  if (GAME.CONFIG.PHONE) { this._buildPhone(); return; }

  GAME.UI.label(this, W / 2, P ? 20 : 30, '랭킹', P ? 26 : 34, C.text, 0.5);
  this.scopeLabel = GAME.UI.label(this, W / 2, P ? 48 : 68,
    GAME.Api.enabled() ? '서버 확인 중…' : GAME.Score.scopeNote(),
    'micro', C.textDim, 0.5).setWordWrapWidth(W - 40);

  // ── 1단계: 분류 ──
  var kinds = GAME.Score.KINDS;
  // 탭·버튼 높이는 어느 화면에서도 56 — 폰(설계px×0.929=52 CSS px)과 PC 모두
  // 모바일 최소 규격 위에 둔다. 세로 900 이라 데스크톱도 높이가 아깝지 않다.
  var th = 56;
  var tw = Math.min(W - 24, P ? 396 : 640);
  var tcy = (P ? 66 : 86) + th / 2;
  var tc = GAME.Layout.cols(3, { gap: 8, width: tw, left: (W - tw) / 2, pad: 0 });
  for (var i = 0; i < kinds.length; i++) {
    this._kindTab(kinds[i].k, kinds[i].n, tc[i].cx, tcy, tc[i].w, th, P ? 16 : 17);
  }

  // ── 2단계: 기간 ──
  var sh = 56;
  var sw = Math.min(W - 140, 264);
  var scy = tcy + th / 2 + 10 + sh / 2;
  var sLeft = (W - sw) / 2;
  var sc = GAME.Layout.cols(2, { gap: 8, width: sw, left: sLeft, pad: 0 });
  GAME.UI.label(this, sLeft - 10, scy, '기간', 'micro', C.textFaint || C.textDim, 1)
    .setOrigin(1, 0.5);
  for (var s = 0; s < GAME.Score.SCOPES.length; s++) {
    this._scopePill(GAME.Score.SCOPES[s].k, GAME.Score.SCOPES[s].n,
      sc[s].cx, scy, sc[s].w, sh, P ? 16 : 16);
  }

  // 목록 — 1줄 정체(순위·닉네임·값), 2줄 부연(영웅/장비·리그)
  this.geo = {
    top: scy + sh / 2 + 30,
    rowH: GAME.UI.RANK_ROW_H + 6,
    pad: P ? 16 : 60
  };
  this.geo.maxRows = Math.max(3, Math.floor((H - this.geo.top - (P ? 100 : 112)) / this.geo.rowH));

  this._load();

  // 버튼 줄 **위쪽 끝**을 기준으로 아래에서 위로 자란다. 고정 오프셋으로 두면
  // 문구가 2줄이 되는 순간 버튼을 파고들었다(실측 세로 420×900, 겹침 2건).
  var btnH0 = 56;
  var btnCy = H - (P ? 32 : 34);            // 세로 900 에서 바닥이 정확히 896 (밖으로 안 나간다)
  this.myLabel = GAME.UI.label(this, W / 2, btnCy - btnH0 / 2 - 8,
    this._myText(), P ? 15 : 15, C.text, 0.5)
    .setWordWrapWidth(W - 40).setOrigin(0.5, 1);

  var bw = Math.min(W - 24, 420);
  var bc = GAME.Layout.cols(2, { gap: 10, width: bw, left: (W - bw) / 2, pad: 0 });
  GAME.UI.button(this, bc[0].cx, btnCy, bc[0].w, btnH0, '← 메뉴', function () {
    self.scene.start('Menu');
  }, { fontSize: P ? 17 : 16 });
  GAME.UI.button(this, bc[1].cx, btnCy, bc[1].w, btnH0, '닉네임 바꾸기', function () {
    GAME.Account.logout();
    self.scene.start('Login');
  }, { fontSize: P ? 15 : 15 });
};

// ── 폰 가로 (820×390) ──────────────────────────────────────────────────────
// 왼쪽 레일에 조작을 전부 접고 오른쪽을 목록에 준다.
GAME.RankScene.prototype._buildPhone = function () {
  var C = GAME.CONFIG.COLORS;
  var UI = GAME.UI;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var self = this;
  var PAD = 14;
  var RAILW = 186;
  var TH = 56;                     // 탭·버튼 높이 (터치 타깃 55 이상)

  UI.label(this, PAD, 6, '랭킹', 22, C.text, 0).setOrigin(0, 0);

  // 1단계 — 분류 3개를 세로로 쌓는다
  var kinds = GAME.Score.KINDS;
  var y = 36;
  for (var i = 0; i < kinds.length; i++) {
    this._kindTab(kinds[i].k, kinds[i].n, PAD + RAILW / 2, y + TH / 2, RAILW, TH, 17);
    y += TH + 5;
  }

  // 2단계 — 기간. 레일 안에서 알약 두 개.
  UI.label(this, PAD, y + 3, '기간', 'micro', C.textFaint || C.textDim, 0).setOrigin(0, 0);
  y += 20;
  var pw = Math.floor((RAILW - 8) / 2);
  for (var s = 0; s < GAME.Score.SCOPES.length; s++) {
    this._scopePill(GAME.Score.SCOPES[s].k, GAME.Score.SCOPES[s].n,
      PAD + pw / 2 + s * (pw + 8), y + TH / 2, pw, TH, 16);
  }
  y += TH + 8;

  // 레일 바닥 — 메뉴 / 닉네임
  UI.button(this, PAD + pw / 2, y + TH / 2, pw, TH, '← 메뉴', function () {
    self.scene.start('Menu');
  }, { fontSize: 16 });
  UI.button(this, PAD + pw + 8 + pw / 2, y + TH / 2, pw, TH, '닉네임', function () {
    GAME.Account.logout();
    self.scene.start('Login');
  }, { fontSize: 16 });

  // ── 오른쪽: 안내 한 줄 + 목록 2열 ──
  var lx = PAD + RAILW + 12;
  var lw = W - PAD - lx;
  var colW = Math.floor((lw - 12) / 2);

  this.scopeLabel = UI.label(this, lx, 8,
    GAME.Api.enabled() ? '서버 확인 중…' : GAME.Score.scopeNote(), 'micro', C.textDim, 0)
    .setWordWrapWidth(Math.floor(lw * 0.52));
  this.myLabel = UI.label(this, W - PAD, 8, this._myText(), 'micro', C.text, 1)
    .setOrigin(1, 0).setAlign('right').setWordWrapWidth(Math.floor(lw * 0.44));

  // 안내 두 줄(각 18px)이 들어갈 자리를 미리 비운다. 한 줄로 가정하고 32 로 잡으면
  // 문구가 길어져 두 줄이 되는 순간 1위 행을 파고든다(같은 사고를 이 화면에서 겪었다).
  this.geo = {
    top: 52, rowH: 62, h: 56, colW: colW,
    colX: [lx, lx + colW + 12], perCol: 0
  };
  this.geo.perCol = Math.max(1, Math.floor((H - 8 - this.geo.top) / this.geo.rowH));
  this.geo.maxRows = this.geo.perCol * 2;

  this._load();
};

// ── 행 그리기 ──────────────────────────────────────────────────────────────

// 값 표시 — 분류마다 단위가 다르다. 대전은 자릿수가 커서 콤마를 넣는다.
// 단위를 **같은 줄에 붙인다**: 큰 숫자 아래에 작은 단위를 따로 두면 두 글자상자가
// 세로로 7px 겹친다(실측, 폰 가로 행 높이 56). 붙이면 겹침이 구조적으로 사라진다.
GAME.RankScene.prototype._valueOf = function (r) {
  var d = GAME.Score.kindDef(this.kind);
  return {
    value: Math.round(r.value || 0).toLocaleString('ko-KR') + (d.unit || ''),
    unit: ''
  };
};

// 부연 한 줄. **통곡의 탑은 여기에 영웅·장비가 들어간다**(사용자 요구).
GAME.RankScene.prototype._metaOf = function (r) {
  if (this.kind === 'tower') {
    var hero = GAME.Score.heroName(r.hero);
    if (hero) return hero + (r.gear ? ' · ' + r.gear : '');
    return r.at ? this._ago(r.at) : '영웅 미기록';
  }
  if (this.kind === 'arena') {
    var lg = (GAME.Arena && GAME.Arena.leagueOf) ? GAME.Arena.leagueOf(r.value) : null;
    return (lg ? lg.name : '대전') + (r.at ? ' · ' + this._ago(r.at) : '');
  }
  return r.at ? this._ago(r.at) : '이전 기록';
};

GAME.RankScene.prototype._ago = function (t) {
  if (!t) return '이전 기록';
  var d = Math.floor((Date.now() - t) / 864e5);
  // 서버가 이상한 시각을 주면(0 에 가까운 값, 미래) '20662일 전' 같은 게 뜬다.
  // 표시는 데이터를 신뢰하지 않는 쪽으로 — 말이 안 되면 그냥 '이전 기록'.
  if (d < 0 || d > 3650) return '이전 기록';
  if (d === 0) return '오늘';
  if (d === 1) return '어제';
  return d + '일 전';
};

GAME.RankScene.prototype._empty = function () {
  var d = GAME.Score.kindDef(this.kind);
  var how = this.kind === 'tower' ? '통곡의 탑에서 한 층이라도 오르면'
          : this.kind === 'dtower' ? '수성의 탑에서 한 층이라도 막아내면'
          : '대전에서 한 판이라도 겨루면';
  return '아직 ' + d.n + ' 기록이 없습니다.\n' + how + ' 여기에 올라갑니다.';
};

GAME.RankScene.prototype._clearRows = function () {
  for (var d = 0; d < this.rowObjects.length; d++) {
    if (this.rowObjects[d] && this.rowObjects[d].destroy) this.rowObjects[d].destroy();
  }
  this.rowObjects = [];
};

GAME.RankScene.prototype._renderRows = function (rows) {
  rows = rows || [];
  if (GAME.CONFIG.PHONE) { this._renderRowsPhone(rows); return; }

  var C = GAME.CONFIG.COLORS;
  var W = GAME.CONFIG.WIDTH;
  var P = GAME.CONFIG.PORTRAIT;
  var g = this.geo;
  var me = GAME.Account.current();
  var d = GAME.Score.kindDef(this.kind);

  this._clearRows();
  var keep = this.rowObjects;
  function add(o) { keep.push(o); return o; }

  if (!rows.length) {
    add(GAME.UI.label(this, W / 2, g.top + 40, this._empty(), 'caption', C.textDim, 0.5)
      .setAlign('center').setLineSpacing(8));
    return;
  }

  var rowW = W - g.pad * 2;
  add(GAME.UI.label(this, g.pad + 4, g.top - 22, '순위 · 닉네임', 'micro', C.textDim, 0));
  add(GAME.UI.label(this, W - g.pad - 4, g.top - 22, d.n + ' 기록', 'micro', C.textDim, 1)
    .setOrigin(1, 0));

  for (var i = 0; i < Math.min(rows.length, g.maxRows); i++) {
    var r = rows[i];
    var v = this._valueOf(r);
    var row = GAME.UI.rankRow(this, g.pad, g.top + i * g.rowH, rowW, {
      rank: i + 1,
      id: r.id,
      valueText: v.value,
      unitText: v.unit,
      metaText: this._metaOf(r),
      mine: r.id === me
    });
    for (var q = 0; q < row.objs.length; q++) keep.push(row.objs[q]);
  }

  if (rows.length > g.maxRows) {
    add(GAME.UI.label(this, W / 2, g.top + g.maxRows * g.rowH + 4,
      '외 ' + (rows.length - g.maxRows) + '명 더 있음', 'micro', C.textDim, 0.5));
  }
};

// 폰 가로 — 같은 2줄 행을 **2열**로 흘린다. 1~N 위가 왼쪽 열, 그 다음이 오른쪽 열이라
// 위에서 아래로 읽는 순서가 유지된다(행 우선으로 채우면 1위 옆에 2위가 와 순위가 꼬인다).
GAME.RankScene.prototype._renderRowsPhone = function (rows) {
  var C = GAME.CONFIG.COLORS;
  var UI = GAME.UI;
  var g = this.geo;
  var me = GAME.Account.current();

  this._clearRows();
  var keep = this.rowObjects;

  if (!rows.length) {
    keep.push(UI.label(this, g.colX[0], g.top + 40, this._empty(), 'micro', C.textDim, 0)
      .setLineSpacing(8).setWordWrapWidth(g.colW * 2));
    return;
  }

  var n = Math.min(rows.length, g.maxRows);
  for (var i = 0; i < n; i++) {
    var col = i < g.perCol ? 0 : 1;
    var idx = i - col * g.perCol;
    var r = rows[i];
    var v = this._valueOf(r);
    var row = UI.rankRow(this, g.colX[col], g.top + idx * g.rowH, g.colW, {
      rank: i + 1,
      id: r.id,
      valueText: v.value,
      unitText: v.unit,
      metaText: this._metaOf(r),
      mine: r.id === me
    }, { height: g.h });
    for (var q = 0; q < row.objs.length; q++) keep.push(row.objs[q]);
  }
};
