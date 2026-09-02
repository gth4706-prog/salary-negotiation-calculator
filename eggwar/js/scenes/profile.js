window.GAME = window.GAME || {};

// ============================================================================
//  프로필 화면 (대격변 v3 · W2 메타 시스템, 2026-09-02)
//  ---------------------------------------------------------------------------
//  닉네임 + 칭호(탭하면 고르기) · 통계 4칸 · 오늘의 과제 3줄 · 업적 격자.
//  · PC(1340×900)/세로(420×900): 위에서 아래로 **흐르는 배치** — 격자 행 수는 남는
//    높이에서 역산한다(고정 좌표 금지, CLAUDE.md 함정 목록).
//  · 폰 가로(820×390): 랭킹 화면처럼 **왼쪽 레일**(탭 2개 + 쪽 넘김 + 메뉴)과 오른쪽 내용.
//    탭 1 = 과제·통계, 탭 2 = 업적(3×4 격자, 쪽 넘김).
//  · 탭·쪽·칭호 변경은 `scene.start('Profile', {tab, page})` 로 다시 그린다(랭킹과 같은
//    방식 — 씬 인스턴스가 재사용되므로 상태는 init 에서 되돌린다).
//  · 데이터는 읽기만: GAME.Score / GAME.Tower / GAME.DefendTower / GAME.RtScore /
//    GAME.Achievements / GAME.Daily. 없는 모듈은 '-' 로 표시한다.
// ============================================================================
GAME.ProfileScene = function () {
  Phaser.Scene.call(this, { key: 'Profile' });
};
GAME.ProfileScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.ProfileScene.prototype.constructor = GAME.ProfileScene;

GAME.ProfileScene.prototype.init = function (data) {
  data = data || {};
  this.tab = data.tab === 'ach' ? 'ach' : 'main';
  this.page = Math.max(0, data.page | 0);
  this.pageCount = 1;
  //  씬 인스턴스는 재사용된다 — 표시객체 참조는 여기서 반드시 비운다.
  this._pageBtns = null;
  this._pageLbl = null;
};

GAME.ProfileScene.prototype.create = function () {
  if (GAME.Music) GAME.Music.play('lobby');
  var C = GAME.CONFIG.COLORS;
  this.cameras.main.setBackgroundColor(C.bg);
  var self = this;

  //  보류된 과제 보상은 이 화면에 들어올 때 정산한다(캐릭터가 생긴 뒤 처음 보는 화면일 수 있다).
  if (GAME.Daily && GAME.Daily.settle) { try { GAME.Daily.settle(); } catch (e) {} }
  //  진행(A 트랙, js/progress.js) — 오늘 출석 + 보류된 레벨·출석 골드. 화면을 그리기 **전에**
  //  정산해야 스트릭 줄이 오늘 칸을 채운 채로 뜬다.
  if (GAME.Progress && GAME.Progress.settle) { try { GAME.Progress.settle(); } catch (e2) {} }

  if (GAME.CONFIG.PHONE) this._buildPhone(); else this._buildPc();

  //  다른 화면에서 달성하고 아직 못 띄운 알림을 여기서 흘린다.
  this.time.delayedCall(350, function () {
    if (!self.scene.isActive()) return;
    if (GAME.Achievements) GAME.Achievements.flush(self);
    if (GAME.Progress && GAME.Progress.flush) GAME.Progress.flush(self);
  });
};

// ── 데이터 ─────────────────────────────────────────────────────────────────
GAME.ProfileScene.prototype._me = function () {
  return (GAME.Account && GAME.Account.current()) || 'guest';
};

//  통계 4칸. 값이 없으면 '-'.
GAME.ProfileScene.prototype._stats = function () {
  var me = this._me();
  var towerBest = 0, dtowerBest = 0;
  try { if (GAME.Tower && GAME.Tower.get) towerBest = GAME.Tower.get().best || 0; } catch (e) {}
  try { if (GAME.DefendTower && GAME.DefendTower.get) dtowerBest = GAME.DefendTower.get().best || 0; } catch (e) {}
  try {
    if (GAME.Score && GAME.Score.myBest) {
      var tb = GAME.Score.myBest(me, 'tower', 'all');
      if (tb && tb.value > towerBest) towerBest = tb.value;
      var db = GAME.Score.myBest(me, 'dtower', 'all');
      if (db && db.value > dtowerBest) dtowerBest = db.value;
    }
  } catch (e2) {}
  var rt = null;
  try { if (GAME.RtScore && GAME.RtScore.get) rt = GAME.RtScore.get(); } catch (e3) {}
  var played = rt ? ((rt.wins || 0) + (rt.losses || 0)) : 0;
  return [
    { label: '탑 최고층',   value: towerBest ? towerBest + '층' : '-' },
    { label: '수성 최고회차', value: dtowerBest ? dtowerBest + '회차' : '-' },
    { label: '실시간 점수', value: played ? Math.round(rt.score).toLocaleString('ko-KR') + '점' : '-' },
    { label: '실시간 전적', value: played ? (rt.wins || 0) + '승 ' + (rt.losses || 0) + '패' : '-' }
  ];
};

GAME.ProfileScene.prototype._achList = function () {
  return (GAME.Achievements && GAME.Achievements.list) ? GAME.Achievements.list() : [];
};
GAME.ProfileScene.prototype._dailyList = function () {
  try { return (GAME.Daily && GAME.Daily.tasks) ? GAME.Daily.tasks() : []; } catch (e) { return []; }
};

GAME.ProfileScene.prototype._restart = function (patch) {
  var d = { tab: this.tab, page: this.page };
  if (patch) for (var k in patch) if (patch.hasOwnProperty(k)) d[k] = patch[k];
  this.scene.start('Profile', d);
};

// ── 칭호 고르기 ────────────────────────────────────────────────────────────
//  업적 칭호 + 레벨·출석 칭호(js/progress.js)를 **한 목록**으로 합친다. Progress 가 없으면
//  업적 칭호만(예전 동작 그대로).
GAME.ProfileScene.prototype._titleCurKey = function () {
  if (GAME.Progress && GAME.Progress.currentTitleAnyKey) return GAME.Progress.currentTitleAnyKey();
  return GAME.Achievements ? GAME.Achievements.currentTitleKey() : null;
};
GAME.ProfileScene.prototype._titleDisplay = function () {
  if (GAME.Progress && GAME.Progress.displayTitle) return GAME.Progress.displayTitle();
  return GAME.Achievements ? GAME.Achievements.currentTitle() : '';
};
GAME.ProfileScene.prototype._titleChoose = function (key) {
  if (GAME.Progress && GAME.Progress.chooseTitle) return GAME.Progress.chooseTitle(key || null);
  if (GAME.Achievements) return GAME.Achievements.setTitle(key || null);
  return false;
};
GAME.ProfileScene.prototype._titleList = function () {
  if (GAME.Progress && GAME.Progress.allTitles) return GAME.Progress.allTitles();
  if (GAME.Achievements) {
    return GAME.Achievements.earnedTitles().map(function (e) {
      return { key: e.key, title: e.title, name: e.name, at: e.at, src: 'ach' };
    });
  }
  return [];
};

GAME.ProfileScene.prototype._pickTitle = function () {
  if (!GAME.Modal || !(GAME.Achievements || GAME.Progress)) return;
  var self = this;
  var cur = this._titleCurKey();
  var earned = this._titleList();
  var items = [{ key: '', name: '칭호 없음', selected: !cur }];
  for (var i = 0; i < earned.length; i++) {
    items.push({ key: earned[i].key, name: earned[i].title,
      note: (earned[i].src === 'lv' ? '진행: ' : '업적: ') + earned[i].name,
      selected: earned[i].key === cur });
  }
  if (!earned.length) items.push({ key: '__none', name: '아직 얻은 칭호가 없습니다',
    note: '업적 달성·레벨 5·7일 연속 출석으로 칭호가 열립니다', disabled: true });
  GAME.Modal.open(this, {
    title: '칭호 고르기',
    items: items,
    onPick: function (it) {
      if (!it || it.key === '__none') return;
      self._titleChoose(it.key || null);
      self._restart();
    }
  });
};

//  업적 칸을 탭하면 상세 + (달성했으면) 칭호 쓰기.
GAME.ProfileScene.prototype._achDetail = function (a) {
  if (!GAME.Modal) return;
  var self = this;
  var prog = a.done ? '달성' : (a.cur + ' / ' + a.goal);
  var items = [{ key: 'info', name: a.desc, note: '칭호: ' + a.title + '   ·   진행 ' + prog, disabled: true }];
  if (a.done) items.push({ key: 'use', name: '이 칭호 쓰기 — ' + a.title,
    selected: self._titleCurKey() === a.key });
  GAME.Modal.open(this, {
    title: a.name,
    items: items,
    onPick: function (it) {
      if (it && it.key === 'use') { self._titleChoose(a.key); self._restart(); }
    }
  });
};

// ── 조각 ───────────────────────────────────────────────────────────────────
//  닉네임 + 칭호 버튼. 왼쪽 닉네임, 오른쪽 끝 칭호 버튼. 반환: 아래 끝 y.
GAME.ProfileScene.prototype._nameRow = function (x, y, w, h, small) {
  var C = GAME.CONFIG.COLORS, UI = GAME.UI, self = this;
  var me = this._me();
  var title = this._titleDisplay();
  var btnW = Math.min(Math.round(w * 0.46), small ? 250 : 340);
  var nameMaxW = w - btnW - 16;
  var t = UI.text(this, x, y + h / 2, me, { size: small ? 'subhead' : 'heading', color: C.accent,
    origin: 0, originY: 0.5 });
  //  닉네임은 12자 상한(account.js)이라 좁은 칸에서만 넘친다 → 넘치면 축소.
  if (t.width > nameMaxW) t.setScale(nameMaxW / t.width);
  var lbl = title ? ('칭호: ' + title) : '칭호 고르기';
  UI.button(this, x + w - btnW / 2, y + h / 2, btnW, h, lbl, function () { self._pickTitle(); },
    { fontSize: small ? 15 : 16, fill: UI.COL.panelAmber, hover: UI.COL.panelAmberHi,
      line: UI.COL.focus, color: C.crit });
  return y + h;
};

//  통계 카드 1장.
GAME.ProfileScene.prototype._statCard = function (x, y, w, h, st, small) {
  var C = GAME.CONFIG.COLORS, UI = GAME.UI;
  UI.panel(this, x, y, w, h, { level: 2 });
  UI.text(this, x + w / 2, y + (small ? 10 : 14), st.label,
    { size: 'micro', color: C.textDim, origin: 0.5, originY: 0 });
  var v = UI.text(this, x + w / 2, y + h - (small ? 12 : 16), st.value,
    { size: small ? 'subhead' : 'heading', color: C.text, origin: 0.5, originY: 1 });
  if (v.width > w - 16) v.setScale((w - 16) / v.width);
};

//  통계 4칸 한 줄(세로 화면은 2×2). 반환: 아래 끝 y.
GAME.ProfileScene.prototype._statsBlock = function (x, y, w, small, twoRows) {
  var stats = this._stats();
  var h = small ? 72 : 84;
  var per = twoRows ? 2 : 4;
  var cols = GAME.Layout.cols(per, { gap: 10, width: w, left: x, pad: 0 });
  for (var i = 0; i < stats.length; i++) {
    var r = Math.floor(i / per), c = i % per;
    this._statCard(cols[c].x, y + r * (h + 10), cols[c].w, h, stats[i], small);
  }
  return y + Math.ceil(stats.length / per) * (h + 10) - 10;
};

//  오늘의 과제 3줄. 반환: 아래 끝 y.
GAME.ProfileScene.prototype._dailyBlock = function (x, y, w, rowH, small) {
  var C = GAME.CONFIG.COLORS, UI = GAME.UI;
  var tasks = this._dailyList();
  var dateKey = (GAME.Daily && GAME.Daily.dateKey) ? GAME.Daily.dateKey() : '';
  var owed = (GAME.Daily && GAME.Daily.owed) ? GAME.Daily.owed() : 0;
  var head = '오늘의 과제' + (dateKey ? '  ·  ' + dateKey : '') +
    (owed ? '  ·  보류 보상 ' + owed + ' 골드(캐릭터를 만들면 지급)' : '');
  var ht = UI.text(this, x, y, head, { size: small ? 'micro' : 'caption', color: C.textDim, origin: 0 });
  if (ht.width > w) ht.setScale(w / ht.width);
  y += ht.height + (small ? 6 : 8);
  if (!tasks.length) {
    UI.text(this, x, y, '과제 시스템이 아직 준비되지 않았습니다', { size: 'caption', color: C.textFaint, origin: 0 });
    return y + rowH;
  }
  var gap = small ? 6 : 8;
  for (var i = 0; i < tasks.length; i++) {
    var t = tasks[i];
    var ry = y + i * (rowH + gap);
    UI.panel(this, x, ry, w, rowH, { level: t.done ? 3 : 2,
      accent: t.done ? UI.COL.controller : null,
      line: t.done ? UI.COL.controller : UI.COL.border });
    //  왼쪽: 이름 · 오른쪽: 상태(완료 / 진행 · 보상). 오른쪽은 x 에서 **왼쪽으로** 뻗는다.
    var right = t.done ? ('✓ 완료  +' + t.reward + ' 골드')
                       : (t.cur + ' / ' + t.goal + '   ·   +' + t.reward + ' 골드');
    var rt = UI.text(this, x + w - 12, ry + rowH / 2 - (small ? 0 : 5), right,
      { size: small ? 'micro' : 'caption', color: t.done ? C.good : C.crit, origin: 1, originY: 0.5 });
    var nameMax = w - 24 - rt.width - 12;
    var nt = UI.text(this, x + 14, ry + rowH / 2 - (small ? 0 : 5), t.name,
      { size: small ? 'caption' : 'body', color: t.done ? C.text : C.text, origin: 0, originY: 0.5 });
    if (nt.width > nameMax) nt.setScale(Math.max(0.6, nameMax / nt.width));
    //  진행 막대(얇게, 바닥에). 완료면 꽉 찬다.
    if (!small) {
      var g = this.add.graphics();
      var bw = w - 28, bh = 6, bx = x + 14, by = ry + rowH - 12;
      g.fillStyle(UI.COL.meterTrack, 1); g.fillRoundedRect(bx, by, bw, bh, 3);
      var frac = t.done ? 1 : Math.max(0, Math.min(1, t.goal ? t.cur / t.goal : 0));
      if (frac > 0) { g.fillStyle(t.done ? UI.COL.controller : UI.COL.focus, 1); g.fillRoundedRect(bx, by, Math.max(bh, bw * frac), bh, 3); }
    }
  }
  return y + tasks.length * (rowH + gap) - gap;
};

//  업적 칸 하나.
GAME.ProfileScene.prototype._achCell = function (x, y, w, h, a, small) {
  var C = GAME.CONFIG.COLORS, UI = GAME.UI, self = this;
  var done = a.done;
  UI.panel(this, x, y, w, h, { level: done ? 3 : 1,
    line: done ? UI.COL.focus : UI.COL.border, lineWidth: done ? 2 : 1 });
  var padX = 10, top = small ? 7 : 8;
  var nameSz = small ? 15 : 'caption';
  var subSz = small ? 15 : 'micro';
  //  1줄: 이름(왼쪽) · 진행(오른쪽, 큰 수는 축약 — 칸 폭이 한정돼 있다)
  var prog = done ? '✓' : (UI.numAbbr(a.cur) + '/' + UI.numAbbr(a.goal));
  var pt = UI.text(this, x + w - padX, y + top, prog,
    { size: subSz, color: done ? C.good : C.textDim, origin: 1, originY: 0 });
  var nt = UI.text(this, x + padX, y + top, a.name,
    { size: nameSz, color: done ? C.crit : C.text, origin: 0, originY: 0 });
  var nameMax = w - padX * 2 - pt.width - 8;
  if (nt.width > nameMax) nt.setScale(Math.max(0.5, nameMax / nt.width));
  //  2줄: 칭호
  var tt = UI.text(this, x + padX, y + top + nt.height + (small ? 2 : 3), a.title,
    { size: subSz, color: done ? C.accent : C.textFaint, origin: 0, originY: 0 });
  if (tt.width > w - padX * 2) tt.setScale((w - padX * 2) / tt.width);
  //  막대(미달성만 — 달성은 테두리·색이 말한다)
  var g = this.add.graphics();
  var bh = 5, bx = x + padX, by = y + h - bh - 8, bw = w - padX * 2;
  g.fillStyle(UI.COL.meterTrack, 1); g.fillRoundedRect(bx, by, bw, bh, 2);
  var frac = done ? 1 : Math.max(0, Math.min(1, a.pct || 0));
  if (frac > 0) { g.fillStyle(done ? UI.COL.focus : UI.COL.borderUi, 1); g.fillRoundedRect(bx, by, Math.max(bh, bw * frac), bh, 2); }
  if (!done) { nt.setAlpha(0.8); tt.setAlpha(0.8); }
  //  탭 → 상세 팝업. 보이지 않는 사각형 하나로 칸 전체를 받는다.
  var hit = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x000000, 0).setInteractive({ useHandCursor: true });
  hit.on('pointerdown', function () { self._achDetail(a); });
};

//  업적 격자. cols × rows 만큼 이번 쪽을 그린다. 반환: 아래 끝 y.
GAME.ProfileScene.prototype._achGrid = function (x, y, w, cols, rows, cellH, gap, small) {
  var list = this._achList();
  var per = Math.max(1, cols * rows);
  this.pageCount = Math.max(1, Math.ceil(list.length / per));
  if (this.page >= this.pageCount) this.page = this.pageCount - 1;
  var start = this.page * per;
  var cc = GAME.Layout.cols(cols, { gap: gap, width: w, left: x, pad: 0 });
  var n = 0;
  for (var i = start; i < Math.min(list.length, start + per); i++, n++) {
    var r = Math.floor(n / cols), c = n % cols;
    this._achCell(cc[c].x, y + r * (cellH + gap), cc[c].w, cellH, list[i], small);
  }
  var usedRows = Math.max(1, Math.ceil(n / cols));
  return y + usedRows * (cellH + gap) - gap;
};

//  업적 머리글 + 쪽 넘김 버튼. 반환: 아래 끝 y.
GAME.ProfileScene.prototype._achHeader = function (x, y, w, small) {
  var C = GAME.CONFIG.COLORS, UI = GAME.UI, self = this;
  var total = this._achList().length;
  var done = (GAME.Achievements && GAME.Achievements.doneCount) ? GAME.Achievements.doneCount() : 0;
  var bh = small ? 40 : 36, bw = small ? 64 : 60;
  var ht = UI.text(this, x, y + bh / 2, '업적  ' + done + ' / ' + total + ' 달성',
    { size: small ? 'caption' : 'caption', color: C.textDim, origin: 0, originY: 0.5 });
  //  쪽 표시·버튼은 오른쪽 끝에서 왼쪽으로 뻗는다.
  var nx = x + w - bw / 2;
  var nb = UI.button(this, nx, y + bh / 2, bw, bh, '▶', function () {
    if (self.page + 1 < self.pageCount) self._restart({ page: self.page + 1 });
  }, { fontSize: 15, skin: false });
  var pb = UI.button(this, nx - bw - 8, y + bh / 2, bw, bh, '◀', function () {
    if (self.page > 0) self._restart({ page: self.page - 1 });
  }, { fontSize: 15, skin: false });
  this._pageBtns = { prev: pb, next: nb };
  this._pageLbl = UI.text(this, nx - bw * 1.5 - 20, y + bh / 2, '',
    { size: 'micro', color: C.textDim, origin: 1, originY: 0.5 });
  if (ht.width > (nx - bw * 1.5 - 20) - x - 80) ht.setScale(((nx - bw * 1.5 - 20) - x - 80) / ht.width);
  return y + bh;
};
GAME.ProfileScene.prototype._syncPager = function () {
  if (this._pageLbl && this._pageLbl.scene) this._pageLbl.setText((this.page + 1) + ' / ' + this.pageCount + ' 쪽');
  if (this._pageBtns) {
    this._pageBtns.prev.setDisabled(this.page <= 0);
    this._pageBtns.next.setDisabled(this.page + 1 >= this.pageCount);
  }
};

// ── 진행(A 트랙, js/progress.js): 레벨·XP 바 · 출석 스트릭 ─────────────────
//  ⚠ Progress 가 안 실려 있으면(통합 전) 아무것도 안 그리고 y 를 그대로 돌려준다 —
//    기존 배치가 한 픽셀도 안 움직인다.

//  XP 바 하나. 반환: 막대 아래 끝 y.
GAME.ProfileScene.prototype._xpBar = function (x, y, w, h, frac, done) {
  var UI = GAME.UI;
  var g = this.add.graphics();
  g.fillStyle(UI.COL.meterTrack, 1); g.fillRoundedRect(x, y, w, h, h / 2);
  frac = Math.max(0, Math.min(1, frac || 0));
  if (frac > 0) { g.fillStyle(done ? UI.COL.controller : UI.COL.focus, 1); g.fillRoundedRect(x, y, Math.max(h, w * frac), h, h / 2); }
  return y + h;
};

//  레벨 카드: 「Lv.N」 왼쪽 · 「into / need XP」 오른쪽 · 아래에 막대.
GAME.ProfileScene.prototype._xpCard = function (x, y, w, h, small) {
  var C = GAME.CONFIG.COLORS, UI = GAME.UI;
  var P = GAME.Progress.get();
  UI.panel(this, x, y, w, h, { level: 2, accent: UI.COL.focus, line: UI.COL.border });
  var padX = small ? 12 : 16, top = small ? 8 : 10;
  var lv = UI.text(this, x + padX, y + top, 'Lv.' + P.lv,
    { size: small ? 'subhead' : 'heading', color: C.crit, origin: 0, originY: 0 });
  var xpTxt = UI.numAbbr(P.into) + ' / ' + UI.numAbbr(P.need) + ' XP';
  var rt = UI.text(this, x + w - padX, y + top + lv.height / 2, xpTxt,
    { size: small ? 'micro' : 'caption', color: C.textDim, origin: 1, originY: 0.5 });
  var maxRt = w - padX * 2 - lv.width - 10;
  if (rt.width > maxRt) rt.setScale(Math.max(0.5, maxRt / rt.width));
  var bh = small ? 8 : 10;
  this._xpBar(x + padX, y + h - bh - (small ? 9 : 8), w - padX * 2, bh, P.frac, false);
};

//  출석 카드: 「연속 출석 N일」 · 「오늘 +G 골드」 · 7칸 점(채움 = 이번 주기에서 받은 날).
GAME.ProfileScene.prototype._attCard = function (x, y, w, h, small) {
  var C = GAME.CONFIG.COLORS, UI = GAME.UI;
  var A = GAME.Progress.attendance();
  UI.panel(this, x, y, w, h, { level: 2, accent: UI.COL.controller, line: UI.COL.border });
  var padX = small ? 12 : 16, top = small ? 8 : 10;
  var head = UI.text(this, x + padX, y + top, '연속 출석 ' + A.streak + '일',
    { size: small ? 'caption' : 'body', color: C.text, origin: 0, originY: 0 });
  var right = A.todayDone ? ('오늘 +' + A.todayGold + ' 골드 ✓') : ('오늘 +' + A.todayGold + ' 골드');
  var rt = UI.text(this, x + w - padX, y + top + head.height / 2, right,
    { size: small ? 'micro' : 'caption', color: A.todayDone ? C.good : C.crit, origin: 1, originY: 0.5 });
  var maxRt = w - padX * 2 - head.width - 10;
  if (rt.width > maxRt) rt.setScale(Math.max(0.5, maxRt / rt.width));
  //  점 7개 — 칸 폭에서 간격을 역산한다(고정 간격이면 좁은 카드에서 넘친다).
  var n = A.rewards.length;
  var r = small ? 6 : 7;
  var rowY = y + h - r - (small ? 10 : 10);
  var span = w - padX * 2;
  var step = span / n;
  var g = this.add.graphics();
  for (var i = 0; i < n; i++) {
    var cx = x + padX + step * (i + 0.5);
    var got = i < A.day && (A.todayDone || i < A.day - 1);
    var isToday = i === A.day - 1;
    g.fillStyle(got ? UI.COL.controller : UI.COL.meterTrack, 1);
    g.fillCircle(cx, rowY, r);
    if (isToday) { g.lineStyle(2, UI.COL.focus, 1); g.strokeCircle(cx, rowY, r + 2); }
    else if (i === n - 1) { g.lineStyle(1, UI.COL.focus, 0.7); g.strokeCircle(cx, rowY, r + 1); }
  }
};

//  PC/세로: 두 카드를 한 줄에(Layout.cols 2). 반환: 아래 끝 y.
//  ⚠ PC 높이 52 는 계산값이다 — 업적 격자가 남는 높이에서 행 수를 역산하므로 이 줄이
//    60 을 넘으면 PC 격자가 3행에서 2행으로 떨어진다(15칸/쪽 → 10칸/쪽).
GAME.ProfileScene.prototype._progressRow = function (x, y, w, small) {
  if (!GAME.Progress || !GAME.Progress.get) return y;
  var h = small ? 64 : 52;
  var cols = GAME.Layout.cols(2, { gap: 10, width: w, left: x, pad: 0 });
  this._xpCard(cols[0].x, y, cols[0].w, h, small);
  this._attCard(cols[1].x, y, cols[1].w, h, small);
  return y + h;
};

//  폰 가로: 왼쪽 레일의 빈 구간(탭 아래 ~ 메뉴 버튼 위)에 세로로 쌓는다. 반환: 아래 끝 y.
GAME.ProfileScene.prototype._railProgress = function (x, y, w, bottom) {
  if (!GAME.Progress || !GAME.Progress.get) return y;
  var C = GAME.CONFIG.COLORS, UI = GAME.UI;
  var P = GAME.Progress.get(), A = GAME.Progress.attendance();
  var padX = 8;
  //  1. Lv + XP 막대
  var lv = UI.text(this, x + padX, y, 'Lv.' + P.lv, { size: 'caption', color: C.crit, origin: 0, originY: 0 });
  var xt = UI.text(this, x + w - padX, y + lv.height / 2, UI.numAbbr(P.into) + '/' + UI.numAbbr(P.need),
    { size: 'micro', color: C.textDim, origin: 1, originY: 0.5 });
  var maxXt = w - padX * 2 - lv.width - 6;
  if (xt.width > maxXt) xt.setScale(Math.max(0.5, maxXt / xt.width));
  y += lv.height + 4;
  if (y + 8 > bottom) return y;
  y = this._xpBar(x + padX, y, w - padX * 2, 8, P.frac, false) + 10;
  //  2. 출석
  if (y + 40 > bottom) return y;
  var head = UI.text(this, x + padX, y, '출석 ' + A.streak + '일째', { size: 'micro', color: C.text, origin: 0, originY: 0 });
  var rt = UI.text(this, x + w - padX, y + head.height / 2, '+' + A.todayGold + (A.todayDone ? ' ✓' : ''),
    { size: 'micro', color: A.todayDone ? C.good : C.crit, origin: 1, originY: 0.5 });
  var maxRt = w - padX * 2 - head.width - 6;
  if (rt.width > maxRt) rt.setScale(Math.max(0.5, maxRt / rt.width));
  y += head.height + 4;
  var n = A.rewards.length, r = 6;
  var step = (w - padX * 2) / n;
  var g = this.add.graphics();
  var rowY = y + r + 2;
  for (var i = 0; i < n; i++) {
    var cx = x + padX + step * (i + 0.5);
    var got = i < A.day && (A.todayDone || i < A.day - 1);
    g.fillStyle(got ? UI.COL.controller : UI.COL.meterTrack, 1);
    g.fillCircle(cx, rowY, r);
    if (i === A.day - 1) { g.lineStyle(2, UI.COL.focus, 1); g.strokeCircle(cx, rowY, r + 2); }
  }
  return rowY + r + 2;
};

GAME.ProfileScene.prototype._backButton = function (cx, cy, w, h, fs) {
  var self = this;
  var b = GAME.UI.button(this, cx, cy, w, h, '메뉴', function () { self.scene.start('Menu'); },
    { fontSize: fs });
  if (!(GAME.LobbyArt && GAME.LobbyArt.iconFor(self, b, 'iconBack'))) b.setLabel('← 메뉴');
  return b;
};

// ── PC(1340×900) · 세로(420×900) ──────────────────────────────────────────
GAME.ProfileScene.prototype._buildPc = function () {
  var C = GAME.CONFIG.COLORS, UI = GAME.UI;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var P = GAME.CONFIG.PORTRAIT;
  var small = !!GAME.CONFIG.SMALL;

  UI.label(this, W / 2, P ? 20 : 30, '프로필', P ? 26 : 34, C.text, 0.5);

  var CW = Math.min(W - (P ? 24 : 80), 1100);
  var L = (W - CW) / 2;
  var y = P ? 58 : 84;

  //  1. 닉네임 · 칭호
  y = this._nameRow(L, y, CW, P ? 48 : 48, small) + (P ? 12 : 16);
  //  1-b. 레벨·XP · 출석 (A 트랙) — Progress 가 없으면 y 그대로.
  var y1 = this._progressRow(L, y, CW, small);
  if (y1 !== y) y = y1 + 12;
  //  2. 통계
  y = this._statsBlock(L, y, CW, small, P) + (P ? 12 : 18);
  //  3. 오늘의 과제
  y = this._dailyBlock(L, y, CW, P ? 48 : 56, small) + (P ? 12 : 18);
  //  4. 업적 — 머리글 뒤 남는 높이에서 행 수를 역산한다.
  y = this._achHeader(L, y, CW, small) + 8;
  var btnH = 56, btnCy = H - (P ? 32 : 34);
  var bottom = btnCy - btnH / 2 - 12;
  var cellH = P ? 66 : 70, gap = P ? 8 : 10;
  var rows = Math.max(1, Math.floor((bottom - y + gap) / (cellH + gap)));
  var cols = P ? 2 : 5;
  this._achGrid(L, y, CW, cols, rows, cellH, gap, small);
  this._syncPager();

  //  메뉴 버튼
  this._backButton(W / 2, btnCy, Math.min(W - 24, 260), btnH, P ? 17 : 16);
};

// ── 폰 가로(820×390) — 왼쪽 레일 + 오른쪽 내용 ───────────────────────────
GAME.ProfileScene.prototype._buildPhone = function () {
  var C = GAME.CONFIG.COLORS, UI = GAME.UI;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var self = this;
  var PAD = 14, RAILW = 186, TH = 52;

  UI.label(this, PAD, 6, '프로필', 22, C.text, 0).setOrigin(0, 0);

  //  레일: 탭 2개(세로) → 쪽 넘김(업적 탭만) → 바닥에 메뉴.
  var y = 40;
  var tabs = [{ k: 'main', n: '과제 · 통계' }, { k: 'ach', n: '업적' }];
  for (var i = 0; i < tabs.length; i++) {
    (function (t) {
      var on = t.k === self.tab;
      var b = UI.button(self, PAD + RAILW / 2, y + TH / 2, RAILW, TH, t.n, function () {
        if (t.k !== self.tab) self._restart({ tab: t.k, page: 0 });
      }, on ? { fill: UI.COL.panelAmber, hover: UI.COL.panelAmberHi, color: C.crit, fontSize: 16 }
            : { fontSize: 16 });
      if (on) b.rect.setStrokeStyle(2, UI.COL.focus);
    })(tabs[i]);
    y += TH + 6;
  }
  var backCy = H - PAD - TH / 2;
  this._backButton(PAD + RAILW / 2, backCy, RAILW, TH, 16);
  //  레일의 빈 구간(탭 아래 ~ 메뉴 위)에 레벨·출석(A 트랙). 실측 높이로 쌓고 넘치면 멈춘다.
  this._railProgress(PAD, y + 6, RAILW, backCy - TH / 2 - 8);

  var lx = PAD + RAILW + 12;
  var lw = W - PAD - lx;

  if (this.tab === 'main') {
    var cy = 8;
    cy = this._nameRow(lx, cy, lw, 48, true) + 10;
    cy = this._statsBlock(lx, cy, lw, true, false) + 10;
    this._dailyBlock(lx, cy, lw, 46, true);
    return;
  }

  //  업적 탭 — 머리글(쪽 넘김 포함) + 3열 격자, 행 수는 남는 높이에서.
  var gy = this._achHeader(lx, 6, lw, true) + 6;
  var cellH = 74, gap = 8;
  var rows = Math.max(1, Math.floor((H - 8 - gy + gap) / (cellH + gap)));
  this._achGrid(lx, gy, lw, 3, rows, cellH, gap, true);
  this._syncPager();
};
