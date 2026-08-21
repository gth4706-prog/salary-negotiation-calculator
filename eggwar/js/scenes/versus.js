window.GAME = window.GAME || {};

// 대전 로비 — 비동기 PvP 의 집. 여기서 세 가지를 한다.
//   1) 내 트로피/리그를 본다 (성장 지표)
//   2) 상대를 골라 공격한다 (트로피 획득)
//   3) 내가 없는 동안 당한 방어 기록을 본다 (돌아올 이유)
//
// 근거: docs/PERSONAS.md — "겨룰 상대가 없음"이 최대 이탈 사유(11/50),
// 숙련 유저 잔존 0%. 이 화면이 그 구멍을 메운다.
GAME.VersusScene = function () {
  Phaser.Scene.call(this, { key: 'Versus' });
};
GAME.VersusScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.VersusScene.prototype.constructor = GAME.VersusScene;

// ── 폰 가로(820×390) 전용 좌표 — 배치 화면(build.js)과 같은 3단 구성 ───────────
//  0..56    상단 바 : 🏅 트로피 · 리그 · 전적 · [☰]
//  62..320  본문    : **상대 카드 3장을 가로로 편다.** 이 화면의 주인공이다.
//                     카드마다 그 배치도의 미니 진형도가 들어간다 — 이름·숫자만으로는
//                     "어느 쪽이 만만한가"를 고를 수 없다(그게 이 화면의 유일한 결정이다).
//  326..382 하단 줄 : 내 기지 요약 + [기지 만들기/바꾸기]

// 씬 재진입 때 캐시한 표시객체는 이미 파괴돼 있다 — 참조를 반드시 비운다.
GAME.VersusScene.prototype.init = function (data) {
  this._refreshed = false;
  this._note = null;
  this._noteW = 0;
  // 대전 이원화(2026-08-21 태현님): mode 없음 = 실시간/공성 **선택 화면**,
  // 'siege' = 공성전(기존 전장 목록 화면).
  this.mode = (data && data.mode) || null;
  // ⚠ Phaser 는 data 를 주지 않으면 **이전 settings.data 를 그대로 둔다.**
  //   읽었으면 비운다 — 안 그러면 메뉴를 거쳐 다시 들어와도 모드가 남아
  //   선택 화면을 영원히 건너뛴다(tower.js 가 같은 함정을 겪었다).
  if (this.scene && this.scene.settings) this.scene.settings.data = {};
};

// ── 전장 목록 (2026-07-30, 사용자 지시 2·3번) ───────────────────────────────
// "각자가 저장한 배치는 대전에 접속하면 **방 목록처럼 전장 목록이 먼저**."
//
// 지난 판(v0.58)에는 '컨트롤러/전략가' 를 먼저 묻는 화면이 있었다. 그 화면을 이 목록이
// 대신한다 — **목록이 곧 선택**이다: 전장을 누르면 컨트롤러로 도전하고, 아래 버튼을
// 누르면 전략가로 내 전장을 세운다. 한 화면에 두 입구가 있으니 묻는 단계가 필요없다.
// (한쪽은 반드시 전략가라는 규칙은 그대로다 — 컨트롤러끼리 붙을 경로가 없다.)
//
// 각 줄에 적는 네 가지(지시 3번): 만든 사람 · 만든 시각 · 시도 수 · 막은 수.
// 만든 시각이 없으면 **빈 문자열**을 준다 — '시각 모름' 이라고 적으면 없는 정보를 위해
// 한 칸을 쓰는 셈이고, v0.61 이전에 저장한 배치도는 전부 그 상태다(사용자 화면에
// "5기 · 시각 모름" 으로 떴다). 붙이는 쪽에서 빈 값이면 구분자까지 같이 뺀다.
GAME.VersusScene.prototype._fmtAgo = function (at) {
  if (!at) return '';
  var m = Math.floor((Date.now() - at) / 60000);
  if (m < 1) return '방금';
  if (m < 60) return m + '분 전';
  var h = Math.floor(m / 60);
  if (h < 24) return h + '시간 전';
  return Math.floor(h / 24) + '일 전';
};

// 한 전장의 설명 두 줄. 서버가 전적을 주면 그 값을, 없으면 이 기기 기록으로 대신한다.
GAME.VersusScene.prototype._fieldLines = function (f, o) {
  var tried, blocked;
  if (typeof f.defTry === 'number') {
    tried = f.defTry; blocked = (typeof f.defWin === 'number') ? f.defWin : 0;
  } else {
    var st = GAME.Formations.getStats(f.id);
    tried = st.win + st.loss + st.draw; blocked = st.win;
  }
  var br = GAME.Arena.breachRate(f);

  // ⚠ **작성자를 맨 앞에 둔다** (2026-07-30, 사용자 신고).
  //   예전에는 `이름 · 작성자 · 시각` 순서였는데, 배치도 이름이 "내 전장" 같은 1인칭이면
  //   목록에서 **남의 전장이 자기 것처럼 읽힌다**(실제로 그 혼동이 신고로 들어왔다).
  //   이름은 사용자가 아무렇게나 정할 수 있으므로 '누구 것인지'를 이름에 맡길 수 없다.
  //   맨 앞에 남의 닉네임이 보이면 그 순간 자기 것이 아님이 드러난다.
  var who = (f.author || '작성자 모름') + '의 전장';
  var ago = this._fmtAgo(f.at);
  var head = who + (f.name ? ('   ·   ' + f.name) : '') + (ago ? ('   ·   ' + ago) : '');

  return head + '\n' +
    f.units.length + '기   ·   시도 ' + tried + '명   ·   막음 ' + blocked + '명' +
    (br === null ? '   ·   도전 기록 없음' : ('   ·   격파율 ' + br + '%'));
};

// 목록이 비었을 때 위쪽에 적을 한 줄 — **서버 조회 상태만** 말한다.
// '없다'는 사실은 목록 자리 한가운데 안내가 이미 말하므로 여기서 반복하지 않는다.
GAME.VersusScene.prototype._emptyNote = function () {
  if (GAME.Arena.remoteState === 'loading') return '전장을 찾는 중…';
  if (GAME.Arena.remoteState === 'fail') return '전장 목록을 받지 못했습니다 (연결을 확인하세요)';
  return '';
};

// ── 모드 선택 (2026-08-21) — ⚡ 실시간 대전 / 🏰 공성전 ─────────────────────────
//  카드마다 그 모드의 **자기 점수**를 적는다 — 두 점수는 서로 다른 축이다
//  (실시간 = RtScore, 공성 = Arena 트로피·리그).
GAME.VersusScene.prototype._createModePick = function () {
  var C = GAME.CONFIG.COLORS, UI = GAME.UI;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var PH = GAME.CONFIG.PHONE;
  var self = this;
  var u = H / 100;

  UI.text(this, W / 2, u * 5, '⚔ 대전',
    { size: PH ? 'subhead' : 'title', color: C.accent, origin: 0.5, originY: 0 });

  var rec = GAME.Arena.get();
  var lg = GAME.Arena.leagueOf(rec.trophy);
  var rt = GAME.RtScore ? GAME.RtScore.get() : { score: 0, wins: 0, losses: 0 };

  var cw = Math.min(W * 0.42, PH ? 340 : 400);
  var ch = Math.max((UI.BTN_H || 58) * 2, u * (PH ? 42 : 30));
  var cy = H * 0.46;
  var rtOn = GAME.NetRoom && GAME.NetRoom.enabled();

  var b1 = UI.button(this, W / 2 - cw / 2 - 12, cy, cw, ch,
    '⚡ 실시간 대전\n방을 만들어 지금 붙는다\n실시간 점수 ' + rt.score +
      '  ·  ' + rt.wins + '승 ' + rt.losses + '패',
    function () {
      if (!rtOn) return;
      self.scene.start('RtLobby');
    },
    { fill: UI.COL.panelTeal, line: GAME.CONFIG.COLORS.controller,
      hover: UI.COL.panelTealHi, color: C.accent, fontSize: PH ? 14 : 16 });
  b1.text.setAlign('center');

  var b2 = UI.button(this, W / 2 + cw / 2 + 12, cy, cw, ch,
    '🏰 공성전\n올려 둔 기지에 도전이 온다\n트로피 ' + rec.trophy + '  ·  ' + lg.name,
    function () { self.scene.start('Versus', { mode: 'siege' }); },
    { fill: UI.COL.panelPurple, line: GAME.CONFIG.COLORS.strategist,
      hover: UI.COL.panelPurpleHi, color: C.accentAlt, fontSize: PH ? 14 : 16 });
  b2.text.setAlign('center');

  UI.text(this, W / 2, cy + ch / 2 + u * 4,
    '두 점수는 따로 갑니다 — 실시간에서 잃어도 공성 트로피는 그대로입니다',
    { size: 'micro', color: C.textDim, origin: 0.5 });

  var mh = Math.max(UI.BTN_H_SM || 52, u * 7);
  var mw = Math.max(96, Math.min(140, W * 0.14));
  UI.button(this, mw / 2 + 10, Math.max(mh / 2 + 6, u * 3.4), mw, mh, '← 메뉴',
    function () { self.scene.start('Menu'); }, { fontSize: 14 });
};

GAME.VersusScene.prototype._createRolePick = function () {
  var C = GAME.CONFIG.COLORS, UI = GAME.UI;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var PH = GAME.CONFIG.PHONE;
  var self = this;
  var u = H / 100;

  this._kickRemote();      // 서버에서 남의 전장을 받아온다(기다리지 않는다)

  UI.text(this, W / 2, u * 3, '🏰 공성전  —  전장 목록',
    { size: PH ? 'subhead' : 'title', color: C.accent, origin: 0.5, originY: 0 });

  var opps = GAME.Arena.findOpponents(PH ? 3 : 5);
  var mi = GAME.Arena.matchInfo(opps);
  // ⚠ 목록이 비었을 때 `mi.note` 를 그대로 쓰면 안 된다 — 그 문구 안에 이미
  //   "아직 겨룰 진형이 없습니다…" 가 들어 있어서, 아래 빈 목록 안내와 **같은 말이 두 번**
  //   나온다(실기기 스크린샷에서 확인. 처음 고칠 때 이걸 놓쳐 두 번 잡았다).
  //   비었을 때는 **서버 조회 상태만** 짧게 말하고, 없으면 아무것도 말하지 않는다.
  this._note = UI.text(this, W / 2, u * 3 + (PH ? 30 : 54),
    opps.length ? mi.note : this._emptyNote(),
    { size: 'micro', color: C.textDim, origin: 0.5, originY: 0 });
  this._noteW = 0;

  var listTop = u * 3 + (PH ? 54 : 84);
  var rowH = Math.max(UI.BTN_H || 58, u * (PH ? 15 : 11));
  var rowW = Math.min(W - 30, PH ? 780 : 720);
  var gap = 8;
  // 아래 '내 전장' 버튼의 위쪽 경계 — 빈 목록 문구를 그 사이 한가운데에 놓기 위해 먼저 잡는다.
  var myBtnH = Math.max(UI.BTN_H || 58, u * (PH ? 14 : 10));
  // 시험 버튼이 붙으면 목록이 쓸 수 있는 아래 경계가 그만큼 올라간다.
  var hasBase = !!GAME.Arena.baseFormation();
  var listBottom = H - u * (PH ? 13 : 11) - myBtnH / 2 - u * 1.5 -
                   (hasBase ? Math.max(UI.BTN_H_SM || 52, u * (PH ? 11 : 8)) + u * 2 : 0);

  if (!opps.length) {
    // 목록이 차지할 자리의 **한가운데**에 둔다. 위쪽에 붙여 놓으면 아래가 통째로 비어
    // 화면이 잘린 것처럼 보인다(실기기 스크린샷의 큰 빈 공간이 그 증상이었다).
    UI.text(this, W / 2, listTop + (listBottom - listTop) * 0.42,
      '아직 만들어진 전장이 없습니다.\n' +
      '아래 버튼으로 내 전장을 세우면 목록에 뜨고,\n' +
      '다른 사람이 도전할 수 있습니다.',
      { size: PH ? 'caption' : 'body', color: C.textDim, origin: 0.5 })
      .setAlign('center').setLineSpacing(PH ? 4 : 6);
  } else {
    opps.forEach(function (o, i2) {
      var f = o.formation;
      var ry = listTop + i2 * (rowH + gap);
      var b = UI.button(self, W / 2, ry + rowH / 2, rowW, rowH, '', function () {
        // 전장을 고르면 **컨트롤러로 도전**한다(한쪽은 반드시 전략가다).
        GAME.Arena.pendingOpponent = { formationId: f.id, trophy: o.trophy };
        GAME.ArenaBuild.setRole('controller');
        self.scene.start('TowerShop', { mode: 'arena', formationId: f.id });
      }, { fill: UI.COL.panelTeal, line: GAME.CONFIG.COLORS.controller,
           hover: UI.COL.panelTealHi, color: C.accent, fontSize: PH ? 13 : 15 });
      b.text.setText(self._fieldLines(f, o));
      b.text.setAlign('center');
    });
  }

  // ── 내 기지 2슬롯 (2026-08-21 태현님: "사람당 최대 2개") ────────────────────
  //  기지 1 = 기존 배치 편집 흐름(Build). 기지 2 = 저장 배치 중에서 지정(Modal).
  //  두 기지 모두 서버에 올라가 남의 도전 대상이 된다(깨지면 트로피를 잃는다).
  var base = GAME.Arena.baseFormation();
  var base2 = GAME.Arena.baseFormation2();
  var bh = myBtnH;
  var byB = H - u * (PH ? 13 : 11);
  var slotW = Math.min((W - 46) / 2, 300);
  UI.button(this, W / 2 - slotW / 2 - 6, byB, slotW, bh,
    (base ? '🛡 기지 1 고치기' : '🛡 기지 1 만들기') +
      // 시각이 없으면(v0.61 이전 저장) 구분자까지 같이 뺀다 — "5기 · 시각 모름" 방지.
      '\n' + (base ? (base.units.length + '기' +
                      (self._fmtAgo(base.at) ? (' · ' + self._fmtAgo(base.at)) : ''))
                   : '전략가로 참여합니다'),
    function () {
      GAME.ArenaBuild.setRole('strategist');
      self.scene.start('Build', { pickBase: true, arena: true });
    },
    { fill: UI.COL.panelPurple, line: GAME.CONFIG.COLORS.strategist,
      hover: UI.COL.panelPurpleHi, color: C.accentAlt, fontSize: PH ? 12 : 14 }
  ).text.setAlign('center');
  UI.button(this, W / 2 + slotW / 2 + 6, byB, slotW, bh,
    (base2 ? '🏰 기지 2 바꾸기' : '🏰 기지 2 지정하기') +
      '\n' + (base2 ? (base2.name || '(이름 없음)') + ' · ' + base2.units.length + '기'
                    : '저장한 배치 중에서 고릅니다'),
    function () { self._pickBase2(); },
    { fill: UI.COL.panelPurple, line: GAME.CONFIG.COLORS.strategist,
      hover: UI.COL.panelPurpleHi, color: C.accentAlt, fontSize: PH ? 12 : 14 }
  ).text.setAlign('center');

  // ── 아래에서 위로 쌓는다 ────────────────────────────────────────────────────
  // ⚠ 각 요소에 y 를 따로 계산해 주면 크기가 바뀔 때 조용히 겹친다. 실제로 겹쳤다 —
  //   시험 버튼과 예산 문구가 폰 가로에서 7px 물렸다. 그래서 **만든 것의 실제 경계**를
  //   읽어 그 위에 다음 것을 얹는다(이 저장소가 반복해 배운 규칙: 좌표를 손으로 박지 말 것).
  //   아래에 두면 화면 밖으로 나가므로 방향은 위쪽뿐이다.
  var hint = UI.text(this, W / 2, byB - bh * 0.5 - u * 1.0,
    '예산 ' + GAME.Arena.BUDGET + ' 동일  ·  기지는 최대 2개  ·  내 기지가 깨지면 트로피를 잃습니다',
    { size: 'micro', color: C.textDim, origin: 0.5, originY: 1 });

  // ── 내 전장 시험 (2026-07-30, 사용자 지시 3번) ─────────────────────────────
  // "본인도 본인 진지에 테스트해볼 수 있게, 이 과정은 점수에 반영되지 않게."
  // 대전 목록에서는 내 전장을 일부러 뺀다(자기랑 붙어 트로피를 벌 수 없어야 한다).
  // 그래서 **시험용 입구를 따로** 둔다 — `test:true` 가 붙으면 전투가 끝나도
  // 점수·트로피·전적·격파율에 아무것도 기록하지 않는다(battle.js 에서 한 번에 걸러낸다).
  if (base) {
    var th = Math.max(UI.BTN_H_SM || 52, u * (PH ? 11 : 8));
    var topOfHint = hint.getBounds().top;
    UI.button(this, W / 2, topOfHint - u * 1.0 - th / 2, Math.min(W - 30, 460), th,
      '🧪 내 전장 시험해보기   (점수에 반영되지 않습니다)',
      function () {
        GAME.ArenaBuild.setRole('controller');
        GAME.Arena.pendingOpponent = null;          // 트로피 정산을 아예 걸지 않는다
        self.scene.start('TowerShop', { mode: 'arena', formationId: base.id, test: true });
      }, { fontSize: PH ? 12 : 14 });
  }

  // ⚠ 버튼의 y 는 **중심**이다. `u * 3.4`(폰 가로에서 13px)를 주면 높이 52 의 절반이
  //   위로 삐져나가 화면 밖으로 잘린다 — 실기기 스크린샷에서 모서리가 잘려 있었다.
  //   '반높이 + 여백'을 하한으로 잡아 화면 크기가 바뀌어도 안 잘리게 한다.
  //  ← 는 모드 선택 화면으로 — 실시간 입구는 그쪽에 있다(2026-08-21 이원화).
  var mh = Math.max(UI.BTN_H_SM || 52, u * 7);
  var mw = Math.max(96, Math.min(140, W * 0.14));
  UI.button(this, mw / 2 + 10, Math.max(mh / 2 + 6, u * 3.4), mw, mh, '← 대전',
    function () { self.scene.start('Versus'); }, { fontSize: 14 });
};

//  기지 2 지정 — 저장한 배치 중에서 고른다. 기지 1(baseId)과 같은 것은 뺀다
//  (같은 배치 둘을 올리면 슬롯 2개의 뜻이 없다).
GAME.VersusScene.prototype._pickBase2 = function () {
  var self = this;
  var baseId = GAME.Arena.get().baseId;
  var list = GAME.Formations.loadSaved().filter(function (f) { return f.id !== baseId; });
  if (!list.length) {
    if (this._note && this._note.scene)
      this._note.setText('기지 2로 쓸 저장 배치가 없습니다 — 기지 1 만들기에서 새로 저장하세요');
    return;
  }
  GAME.Modal.open(this, {
    title: '🏰 기지 2로 올릴 배치',
    items: list.map(function (f) {
      return { key: f.id, name: f.name || '(이름 없음)',
               note: (f.units ? f.units.length : 0) + '기' };
    }),
    onPick: function (it) {
      GAME.Arena.setBase2(it.key);
      GAME.Arena.syncBase(true);
      self.scene.restart({ mode: 'siege' });
    }
  });
};

// 매칭 종류 한 줄('사람 진형' / '랜덤매칭' / '찾는 중')을 다시 쓴다.
// 서버 응답이 늦게 와도 **문구는 반드시 최종 상태로 남아야 한다** — 안 그러면
// 이미 끝난 조회가 화면에서는 영원히 '상대를 찾는 중…' 으로 남는다(실제로 그랬다).
GAME.VersusScene.prototype._refreshNote = function () {
  if (!this._note || !this._note.scene) return;
  // ⚠ 여기서도 **비었을 때 규칙**을 지켜야 한다. 이 함수는 서버 응답이 오면 나중에
  //   불려서 문구를 다시 쓰는데, `mi.note` 를 그대로 쓰면 화면 한가운데 안내와
  //   같은 말이 두 번 남는다 — 목록을 만들 때만 고쳤더니 PC 에서 그대로 재발했다.
  var oppsNow = GAME.Arena.findOpponents(GAME.Arena.OPP_SLOTS);
  if (!oppsNow.length) {
    this._note.setColor(GAME.CONFIG.COLORS.textDim);
    this._note.setText(this._emptyNote());
    return;
  }
  var mi = GAME.Arena.matchInfo(oppsNow);
  this._note.setColor(mi.mode === 'random' ? GAME.CONFIG.COLORS.warn : GAME.CONFIG.COLORS.accentAlt);
  if (this._noteW) this._fit(this._note, mi.note, this._noteW);
  else this._note.setText(mi.note);
};

// 서버에서 '다른 사람의 기지'를 받아온다. 화면은 **기다리지 않는다** —
// 먼저 지금 아는 것으로 그리고, 사람 상대가 새로 들어왔을 때만 한 번 다시 그린다.
// (기다리게 하면 서버가 죽어 있을 때 대전 화면이 통째로 멈춘다.)
GAME.VersusScene.prototype._kickRemote = function () {
  var self = this;
  if (!GAME.Arena || !GAME.Arena.fetchOpponents) return;
  GAME.Arena.syncBase();
  var before = GAME.Arena.humanCount();
  GAME.Arena.fetchOpponents().then(function () {
    if (self._refreshed) return;
    if (!self.scene || !self.scene.isActive || !self.scene.isActive()) return;
    if (GAME.Arena.humanCount() === before) { self._refreshNote(); return; }  // 목록이 그대로면 문구만
    self._refreshed = true;
    self.scene.restart();
  })['catch'](function () { /* 실패는 matchInfo 가 화면에 적는다 */ });
};

GAME.VersusScene.prototype.create = function () {
  if (GAME.Music) GAME.Music.play('versus');
  var C = GAME.CONFIG.COLORS;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var P = GAME.CONFIG.PORTRAIT;
  var self = this;
  var u = H / 100;

  if (!GAME.Account.current()) { this.scene.start('Login'); return; }

  this.cameras.main.setBackgroundColor(C.bg);
  GAME.Iso.setMode('default');

  // ── 대전 이원화 (2026-08-21 태현님) ────────────────────────────────────────
  // 첫 화면은 **실시간 대전 / 공성전 선택**. 두 모드의 점수가 서로 다른 축이라는
  // 것을 여기서부터 보여 준다(각 카드에 자기 점수를 적는다).
  if (this.mode !== 'siege') return this._createModePick();
  return this._createRolePick();
  //  ⚠ 여기서 끝난다. 예전에는 아래로 **옛 로비 화면**(트로피·리그·방어기록을
  //    쌓아 올리고 상대 목록은 그 아래 셋이던 구조)이 수백 줄 더 있었는데,
  //    2026-07-30 에 '전장 목록이 주인공' 으로 뒤집으면서 도달 불가가 됐다.
  //    주석만 '안 쓴다'고 적어 두고 코드를 남겨 두니 어느 쪽이 진짜인지
  //    읽을 수 없었다 — 2026-08-03 에 걷어냈다(폰 전용 시트·PHONE 상수 포함).
  //  ⚠ 다만 `_fit` 은 그 구간 안에 있었지만 **살려 뒀다** — `_refreshNote` 가
  //    쓴다. 도달 불가 구간이라고 통째로 자르면 살아 있는 경로가 깨진다.
};

GAME.VersusScene.prototype._fit = function (txt, s, maxW) {
  if (!txt) return txt;
  txt.setText(s);
  var guard = 0;
  while (txt.width > maxW && guard++ < 60) {
    var t = txt.text;
    txt.setText(t.slice(0, Math.max(4, t.length - 2 - (t.slice(-1) === '…' ? 1 : 0))) + '…');
  }
  return txt;
};
