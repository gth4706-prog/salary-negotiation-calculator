window.GAME = window.GAME || {};

GAME.MenuScene = function () {
  Phaser.Scene.call(this, { key: 'Menu' });
};
GAME.MenuScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.MenuScene.prototype.constructor = GAME.MenuScene;

GAME.MenuScene.prototype.create = function () {
  if (GAME.Music) GAME.Music.play('lobby');
  var C = GAME.CONFIG.COLORS;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var P = GAME.CONFIG.PORTRAIT;
  var self = this;

  // 로그인하지 않았으면 로그인 화면으로 보낸다
  if (!GAME.Account.current()) { this.scene.start('Login'); return; }

  this.cameras.main.setBackgroundColor(C.bg);

  // ── 로비 배경: 계란들이 걸어다닌다 (2026-08-01) ─────────────────────────────
  //  이 게임의 아트를 첫 화면이 하나도 안 보여 주고 있었다. 순수 렌더라 다른 데는
  //  아무 영향이 없다(js/lobbyart.js 주석 참조).
  //  ⚠ 씬 인스턴스는 재사용된다 — 매번 새로 만들고, 나갈 때 반드시 지운다.
  //  배경은 **전 프로필**에서 그린다(영웅 아트와 달리 글자 뒤라 겹칠 일이 없다).
  //  ⚠ `start` 보다 먼저 불러야 depth 순서가 맞는다(배경 -60 → 영웅 -50).
  this._backdrop = GAME.LobbyArt ? GAME.LobbyArt.backdrop(this) : null;
  this._parade = GAME.LobbyArt ? GAME.LobbyArt.start(this) : null;
  this.events.off('shutdown', this._paradeStop, this);
  this.events.once('shutdown', this._paradeStop, this);

  // 폰 가로(820×390)는 세로로 쌓을 높이가 없다 → 좌(간판)/우(모드 그리드)로 펼친다.
  if (GAME.CONFIG.PHONE) { this._buildPhone(); this._tail(); return; }

  var u = H / 100;

  GAME.UI.label(this, W / 2, u * 12, '🥚 EGG WAR', P ? 28 : 50, C.text, 0.5);
  GAME.UI.label(this, W / 2, u * 18, '계란 부족 비대칭 실시간 대전', P ? 15 : 18, C.textDim, 0.5);
  // 제목 밑 작은 장식 — 간판처럼 보이게. Graphics 라 글자 겹침에 영향이 없다.
  GAME.UI.titleRule(this, W / 2, u * 21, P ? 170 : 240);

  var me = GAME.Account.current();
  var rec = GAME.Score.of(me);
  var rank = GAME.Score.rankOf(me, 'all');
  GAME.UI.label(this, W / 2, u * 25,
    me + '  ·  누적 ' + rec.total.toLocaleString('ko-KR') + '점  ·  격파 ' + rec.rounds + '회' +
    (rank ? '  ·  ' + rank + '위' : ''),
    P ? 15 : 15, C.accent, 0.5);

  var bw = Math.min(W - 60, 440);

  var tower = GAME.Tower.get();
  var dtower = GAME.DefendTower.get();

  // 두 탑(컨트롤러/전략가)이 나란히 서고 그 아래 자유 모드 둘.
  // 버튼이 4개로 늘어 고정 좌표(u*34/49/63)로는 아래 안내문과 겹친다
  // → **위에서 아래로 흐르는 배치**로 바꾼다. 버튼 높이가 바뀌어도 안 겹친다.
  var BH = GAME.UI.BTN_H || 58;            // 설계 px
  var SUB = u * 4.6;                       // 버튼 아래 설명 한 줄이 차지하는 여백
  var by = u * 31 + BH / 2;
  function modeButton(label, desc, opts, onTap) {
    GAME.UI.button(self, W / 2, by, bw, BH, label, onTap, opts);
    // 설명문은 **위 기준(origin y=0)**으로 버튼 바로 아래에 붙이고, **반드시 한 줄**로 둔다.
    // 두 줄이 되면 아래 버튼을 덮었다(세로에서 3건 실측). 행 간격(SUB)은 한 줄 기준이라
    // 줄이 늘어나는 순간 그만큼 그대로 겹친다 → 넘치면 줄을 늘리지 말고 잘라 넣는다.
    var lbl = GAME.UI.label(self, W / 2, by + BH / 2 + 6, desc, P ? 13 : 13, C.textDim, 0.5)
      .setOrigin(0.5, 0);
    var maxW = W - 40, guard = 0;
    while (lbl.width > maxW && guard++ < 80) {
      var t = lbl.text;
      lbl.setText(t.slice(0, Math.max(6, t.length - 2 - (t.slice(-1) === '…' ? 1 : 0))) + '…');
    }
    by += BH + SUB;
  }

  modeButton('🗼 통곡의 탑  ' + tower.floor + '층',
    'AI가 당신을 분석해 배치를 짠다 — ' + (GAME.Tower.EARLY_FLOORS + 1) + '층부터는 조작 없이 못 이긴다' +
    (tower.best ? '   (최고 ' + tower.best + '층)' : ''),
    // line 을 0xf0a86a 로 박아뒀더니 크림 배경에서 1.08:1 로 사라졌다 → focus 토큰(테마별 값)
    { fill: GAME.UI.COL.panelAmber, line: GAME.UI.COL.focus, hover: GAME.UI.COL.panelAmberHi,
      color: C.warn, fontSize: P ? 17 : 21 },
    function () { self.scene.start('Tower'); });

  // 통곡의 탑 바로 아래 — 전략가판 거울 모드
  modeButton('🛡 수성의 탑  ' + dtower.floor + '층',
    '진형으로 영웅을 막아라 — 층이 오를수록 더 센 영웅이 온다' +
    (dtower.best ? '   (최고 ' + dtower.best + '층)' : ''),
    { fill: GAME.UI.COL.panelPurple, line: GAME.CONFIG.COLORS.strategist,
      hover: GAME.UI.COL.panelPurpleHi, color: C.accentAlt, fontSize: P ? 17 : 21 },
    function () { self.scene.start('DefendTower'); });

  // 대전 — 이 게임의 본체. 솔로(탑)는 연습장이고 여기가 목적지다.
  // 근거: 페르소나 리포트에서 "겨룰 상대가 없음"이 최대 이탈 사유(11/50)였다.
  var arena = GAME.Arena ? GAME.Arena.get() : null;
  var unseen = GAME.Arena ? GAME.Arena.unseenCount() : 0;
  modeButton('⚔ 대전' + (arena ? ('   🏅 ' + arena.trophy) : '') + (unseen ? ('   ● ' + unseen) : ''),
    '내 진형을 기지로 두고 서로 공격 — 자리를 비운 사이에도 싸운다',
    { fill: GAME.UI.COL.panelTeal, line: GAME.CONFIG.COLORS.controller,
      hover: GAME.UI.COL.panelTealHi, color: C.accent, fontSize: P ? 17 : 21 },
    function () { self.scene.start('Versus'); });

  // ── '컨트롤러로 도전' · '전략가로 방어전' 을 뺐다 (2026-07-29, 사용자 지시) ──
  // 다섯 개 모드가 나란히 서 있으니 **무엇부터 눌러야 하는지**가 안 보였다.
  // 둘 다 대전(⚔)이 하는 일과 겹친다 — 남의 진형을 치고, 내 진형이 방어한다.
  // 자리는 비우지 않고 **두 탑이 무엇을 연습하는 곳인지** 알리는 데 쓴다.
  // ⚠ 문구의 모든 글자는 config.js 의 800자 서브셋 안이어야 한다(확인함).
  //   '익혔으면 · 겨룬다' 는 익·혔·룬 이 밖이라 '연습이 끝나면 · 싸운다' 로 바꿨다.
  //   (씬 자체는 남아 있다. Build 는 수성의 탑·기지 만들기가 계속 쓰고,
  //    Select 는 나중에 대전이 다듬어질 때 다시 붙일 수 있다.)
  //  ⚠ 2026-08-01 — 여기 있던 **설명 두 줄을 지웠다**(사용자: "로비화면도 좀 구려").
  //    "🗼 통곡의 탑은 컨트롤러 연습장 — 영웅 하나로 진형을 뚫는다" 는 바로 위
  //    버튼 밑에 이미 붙어 있는 말이다. 같은 말을 두 번 하면 화면이 설명서가 되고,
  //    글이 늘어날수록 **정작 눌러야 할 버튼이 안 보인다.**
  //    남긴 한 줄은 중복이 아니다 — 두 탑과 대전의 **관계**를 말하는 유일한 줄이다.
  var guideY = by + u * 0.6;
  GAME.UI.text(this, W / 2, guideY,
    '연습이 끝나면 ⚔ 대전에서 사람과 싸운다',
    { size: P ? 'micro' : 'caption', color: C.textDim, origin: 0.5, originY: 0 });
  by = guideY + (P ? 30 : 36);

  var rc = GAME.Layout.cols(GAME.isAdmin ? 3 : 2, {
    gap: 10, width: bw, left: (W - bw) / 2, pad: 0
  });
  var smallH = GAME.UI.BTN_H_SM || 52;
  var ry = by + smallH / 2 - u * 1.4;
  // 랭킹은 3분류(통곡의 탑 / 수성의 탑 / 대전) × 2기간이다.
  // 첫 화면은 **통곡의 탑 · 전체** — 이 게임에서 가장 많이 쌓이는 기록이다.
  GAME.UI.button(this, rc[0].cx, ry, rc[0].w, smallH, '🏆 랭킹', function () {
    self.scene.start('Rank', { kind: 'tower', scope: 'all' });
  }, { fontSize: P ? 15 : 15 });
  GAME.UI.button(this, rc[1].cx, ry, rc[1].w, smallH, '닉네임 변경', function () {
    GAME.Account.logout();
    self.scene.start('Login');
  }, { fontSize: P ? 15 : 14 });

  // 사운드 켜기/끄기 + 전체화면. 버튼 줄 아래에 작게 둔다(주요 동선을 밀어내지 않게).
  //
  // 전체화면은 **보조 수단**이다. 지원하지 않는 브라우저에서는 버튼을 아예 만들지 않고,
  // 눌렀는데 실패하면 조용히 지운다 — 에러를 띄우지 않는다. iOS 사파리는 이 API 가
  // 부분 지원이고 입력창 포커스에서 풀리는 문제가 있어, 닉네임 입력이 끝난
  // **메뉴 이후에만** 노출한다(이 화면이 그 첫 지점이다).
  // 자세한 근거: docs/proposals/2026-07-28-mobile-strategy.md
  var utilY = ry + smallH + u * 1.4;
  var utilH = smallH * 0.86;
  var hasFs = GAME.PWA && GAME.PWA.canFullscreen() && !GAME.PWA.isStandalone();
  // 아이폰은 전체화면 API 가 (일반 요소에 대해) 없어서 위 버튼이 아예 안 만들어진다.
  // 빈자리로 두면 "내 폰만 버튼이 없다"가 되므로, 같은 칸에 **가는 길**을 넣는다.
  var iosGuide = !hasFs && GAME.PWA && GAME.PWA.isIOS() && !GAME.PWA.isStandalone();
  //  ⚠ 칸 수를 손으로 박지 않는다. 예전엔 `(hasFs||iosGuide) ? 2 : 1` 이라
  //    버튼이 하나 늘 때마다 이 식을 같이 고쳐야 했고, 안 고치면 두 버튼이
  //    같은 칸에 겹쳐 그려진다(이 저장소가 반복해 겪은 '좌표를 손으로 박기' 계열).
  //    이제 **있는 버튼을 세어** 배분한다.
  var uslots = [];
  if (GAME.Sound) uslots.push('sound');
  if (GAME.Music) uslots.push('music');
  if (hasFs || iosGuide) uslots.push('fs');
  var utilW = Math.min(W - 40, [200, 320, 430][Math.min(uslots.length, 3) - 1] || 200);
  var uc = GAME.Layout.cols(Math.max(1, uslots.length),
    { gap: 10, width: utilW, left: (W - utilW) / 2, pad: 0 });
  var uAt = function (k) { var i = uslots.indexOf(k); return i < 0 ? null : uc[i]; };

  if (GAME.Sound) {
    var scol = uAt('sound');
    // 라벨이 짧아졌다 — 세 칸이 되면 '소리 켜짐'은 폭을 넘긴다(세로 420px 기준).
    var sndLbl = function () { return GAME.Sound.enabled ? '🔊 효과음' : '🔈 효과음'; };
    var sb = GAME.UI.button(this, scol.cx, utilY, scol.w, utilH, sndLbl(), function () {
      GAME.Sound.toggle();
      sb.text.setText(sndLbl());
    }, { fontSize: P ? 13 : 13 });
    this._soundBtnBottom = utilY + utilH / 2;
  }

  if (GAME.Music) {
    var mcol = uAt('music');
    var musLbl = function () { return GAME.Music.enabled ? '🎵 음악' : '🔕 음악'; };
    var mb = GAME.UI.button(this, mcol.cx, utilY, mcol.w, utilH, musLbl(), function () {
      GAME.Music.toggle();
      mb.text.setText(musLbl());
    }, { fontSize: P ? 13 : 13 });
    this._soundBtnBottom = utilY + utilH / 2;
  }

  if (hasFs) {
    var fsLbl = function () { return GAME.PWA.isFullscreen() ? '⤡ 전체화면 해제' : '⛶ 전체화면'; };
    var fb = GAME.UI.button(this, uAt('fs').cx, utilY, uAt('fs').w, utilH, fsLbl(), function () {
      GAME.PWA.toggleFullscreen(function (ok) {
        if (!fb.text || !fb.text.scene) return;
        // 껐다 켜기 둘 다 실패(= 브라우저가 거부)면 이 버튼은 쓸모가 없다 → 치운다.
        if (!ok && !fb._everOn) { fb.rect.destroy(); fb.text.destroy(); return; }
        fb._everOn = fb._everOn || ok;
        fb.text.setText(fsLbl());
      });
    }, { fontSize: P ? 13 : 13 });
    this._soundBtnBottom = utilY + utilH / 2;
  } else if (iosGuide) {
    // 아이폰 — 누르면 '홈 화면에 추가' 방법을 띄운다. 한 번 눌러 설치시키는 API 가
    // 아이폰에는 없으므로(beforeinstallprompt 부재) 안내가 최선이다.
    GAME.UI.button(this, uAt('fs').cx, utilY, uAt('fs').w, utilH, '⛶ 전체화면 방법', function () {
      GAME.PWA.showHomeScreenGuide();
    }, { fontSize: P ? 13 : 13 });
    this._soundBtnBottom = utilY + utilH / 2;
  }
  if (GAME.isAdmin) {
    GAME.UI.button(this, rc[2].cx, ry, rc[2].w, smallH, '닉네임 관리', function () {
      self.scene.start('Admin', { page: 0 });
    }, { fontSize: P ? 15 : 14, line: GAME.UI.COL.focus, color: C.warn });
  }
  this._menuBottom = this._soundBtnBottom || (ry + smallH / 2);

  var hint = GAME.isTouch
    ? '조작  ─  한 번 탭: 이동하며 교전   |   두 번 탭: 이동만   |   스킬 버튼: 바라보는 방향 시전'
    : '조작  ─  우클릭: 이동 / 적 클릭 공격   |   방향키: 직접 이동   |   Q W E R: 바라보는 방향 시전';
  // 버튼 흐름 바닥 아래에 붙인다(고정 u*86 이면 모드 버튼이 늘어날 때 겹친다)
  var hy = Math.max((this._menuBottom || u * 80) + u * 3, u * 82);
  var hintLbl = GAME.UI.label(this, W / 2, hy, hint, P ? 13 : 13, C.textDim, 0.5)
    .setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(W - 40);

  var tagLbl = GAME.UI.label(this, W / 2, hintLbl.y + hintLbl.height + u * 1.6,
    P ? '논타겟은 피할 수 있고, 타겟은 피할 수 없다.'
      : '논타겟 공격은 피할 수 있고, 타겟 공격은 피할 수 없다. 그것이 이 게임의 균형이다.',
    P ? 13 : 13, GAME.CONFIG.COLORS.textFaint, 0.5)
    .setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(W - 40);

  // 흐름의 끝이 바닥을 넘으면 두 줄을 통째로 위로 당긴다.
  // (실측 1340×900: 마지막 줄 바닥이 904.5 로 4.5px 삐져나와 있었다)
  // 단 **버튼 줄 아래로만** 당긴다 — 더 올리면 넘침이 겹침으로 바뀔 뿐이다
  // (세로 420×900 에서 실제로 그렇게 됐다: 화면밖 4건 → 겹침 6건).
  var over = (tagLbl.y + tagLbl.height) - (H - 6);
  var room = hy - ((this._menuBottom || 0) + 6);
  over = Math.min(over, room);
  if (over > 0) { hintLbl.setY(hintLbl.y - over); tagLbl.setY(tagLbl.y - over); }

  // 버전 표시는 DOM 배지(#ver) 하나로 통일했다 — 캔버스에도 그리면 우하단에서 겹친다.

  this._tail();
};

// 설치 유도 배너 — 인트로·닉네임 입력을 가로막지 않도록 여기서 처음 띄운다.
// 잠깐 뜸을 들여야 화면 전환과 겹쳐 튀지 않는다. 메뉴를 떠날 때 반드시 걷어낸다.
GAME.MenuScene.prototype._tail = function () {
  if (!GAME.PWA) return;
  this.time.delayedCall(1400, function () { GAME.PWA.maybeShowInstall(); });
  this.events.once('shutdown', function () {
    GAME.PWA.hideInstall();
    // 안내창은 DOM 이라 씬이 바뀌어도 남는다 — 배너와 같은 이유로 반드시 걷어낸다.
    if (GAME.PWA.hideHomeScreenGuide) GAME.PWA.hideHomeScreenGuide();
  });
};

// ═══════════════════════════════════════════════════════════════════════
//  폰 가로 전용 메뉴 (820×390)
//
//  높이 390 에 [제목 + 설명 + 모드 5개 + 유틸 4개 + 안내 2줄] 을 세로로 쌓으면
//  실측 화면밖 15건 · 겹침 5건이 났다(844×390). 롤토체스처럼 **가로로 펼친다**:
//   · 왼쪽 = 간판(로고·닉네임·전적·조작 안내) — 정적인 정보
//   · 오른쪽 = 모드 그리드 3줄 + 유틸 한 줄  — 손가락이 가는 곳
//  버튼 밑 한 줄 설명은 전부 뺐다. 높이 390 에서 그 한 줄이 곧 겹침이었다.
// ═══════════════════════════════════════════════════════════════════════
GAME.MenuScene.prototype._buildPhone = function () {
  var C = GAME.CONFIG.COLORS;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var UI = GAME.UI;
  var self = this;

  var PAD = 16;
  var LW = 258;                       // 왼쪽 간판 폭
  var rx = PAD + LW + 26;             // 오른쪽 그리드 왼쪽 끝
  var rw = W - PAD - rx;
  var lcx = PAD + LW / 2;

  // ── 왼쪽 간판 ──
  var y = 24;
  var title = UI.text(this, lcx, y, '🥚 EGG WAR',
    { size: 34, color: C.text, origin: 0.5, originY: 0 });
  y = title.y + title.height + 1;
  var sub = UI.text(this, lcx, y, '계란 부족 비대칭 실시간 대전',
    { size: 15, color: C.textDim, origin: 0.5, originY: 0 });
  y = sub.y + sub.height + 7;
  UI.titleRule(this, lcx, y, 186);
  y += 13;

  var me = GAME.Account.current();
  var rec = GAME.Score.of(me);
  var rank = GAME.Score.rankOf(me, 'all');
  var nick = UI.text(this, lcx, y, me,
    { size: 20, color: C.accent, origin: 0.5, originY: 0, align: 'center', wrap: LW });
  y = nick.y + nick.height + 2;
  UI.text(this, lcx, y,
    '누적 ' + rec.total.toLocaleString('ko-KR') + '점  ·  격파 ' + rec.rounds + '회' +
    (rank ? ('  ·  ' + rank + '위') : ''),
    { size: 15, color: C.textDim, origin: 0.5, originY: 0, align: 'center', wrap: LW });

  // 조작 안내는 간판 기둥 **바닥에서 위로** 쌓는다 — 위 문구가 길어져도 안 밀린다.
  var by = H - 14;
  var tagline = UI.text(this, lcx, by, '논타겟은 피할 수 있고, 타겟은 피할 수 없다.',
    { size: 15, color: C.textFaint, origin: 0.5, originY: 1, align: 'center', wrap: LW });
  // originY=1 이라 tagline.y 는 **아래쪽 끝**이다 — 위로 쌓으려면 높이를 빼야 한다.
  UI.text(this, lcx, tagline.y - tagline.height - 6,
    GAME.isTouch ? '한 번 탭 이동+교전 · 두 번 탭 이동만 · 스킬 버튼 시전'
                 : '우클릭 이동 · 방향키 · QWER 스킬',
    { size: 15, color: C.textDim, origin: 0.5, originY: 1, align: 'center', wrap: LW });

  // ── 오른쪽 모드 그리드 ──
  var top = 20, bot = H - 16;
  var rowH = 80, stripH = 58;
  var gap = Math.floor((bot - top - rowH * 3 - stripH) / 3);
  var r1 = top, r2 = r1 + rowH + gap, r3 = r2 + rowH + gap;
  var sy = bot - stripH;
  var c2 = GAME.Layout.cols(2, { gap: 12, width: rw, left: rx, pad: 0 });

  var tower = GAME.Tower.get();
  var dtower = GAME.DefendTower.get();
  var arena = GAME.Arena ? GAME.Arena.get() : null;
  var unseen = GAME.Arena ? GAME.Arena.unseenCount() : 0;

  // 대전이 이 게임의 목적지다 — 한 줄을 통째로 준다.
  UI.button(this, rx + rw / 2, r1 + rowH / 2, rw, rowH,
    '⚔ 대전' + (arena ? ('   🏅 ' + arena.trophy) : '') + (unseen ? ('   ● ' + unseen) : ''),
    function () { self.scene.start('Versus'); },
    { fill: UI.COL.panelTeal, line: GAME.CONFIG.COLORS.controller,
      hover: UI.COL.panelTealHi, color: C.accent, fontSize: 24 });

  UI.button(this, c2[0].cx, r2 + rowH / 2, c2[0].w, rowH,
    '🗼 통곡의 탑\n' + tower.floor + '층' + (tower.best ? ('  ·  최고 ' + tower.best) : ''),
    function () { self.scene.start('Tower'); },
    { fill: UI.COL.panelAmber, line: UI.COL.focus, hover: UI.COL.panelAmberHi,
      color: C.warn, fontSize: 19 });

  UI.button(this, c2[1].cx, r2 + rowH / 2, c2[1].w, rowH,
    '🛡 수성의 탑\n' + dtower.floor + '층' + (dtower.best ? ('  ·  최고 ' + dtower.best) : ''),
    function () { self.scene.start('DefendTower'); },
    { fill: UI.COL.panelPurple, line: GAME.CONFIG.COLORS.strategist,
      hover: UI.COL.panelPurpleHi, color: C.accentAlt, fontSize: 19 });

  // ⚠ 여기 있던 설명 세 줄을 **지웠다** (2026-08-01, 사용자: "로비화면도 좀 구려").
  //   "🗼 통곡의 탑은 컨트롤러 연습장 — 영웅 하나로 진형을 뚫는다" 는 바로 위
  //   버튼 밑에 이미 붙어 있는 말이었다. 같은 말을 두 번 하면 화면이 설명서가 되고,
  //   글자가 많아질수록 **정작 눌러야 할 버튼이 안 보인다.**
  //   비운 자리는 걸어다니는 계란들(js/lobbyart.js)이 채운다 — 글보다 그림이 낫다.
  UI.text(this, rx + rw / 2, r3 + rowH * 0.16,
    '연습이 끝나면 ⚔ 대전에서 사람과 싸웁니다',
    { size: 'caption', color: C.textDim, origin: 0.5, originY: 0 });

  // ── 유틸 줄 ──
  var hasFs = GAME.PWA && GAME.PWA.canFullscreen() && !GAME.PWA.isStandalone();
  var slots = [];
  slots.push('rank');
  slots.push('nick');
  if (GAME.Sound) slots.push('sound');
  if (GAME.Music) slots.push('music');
  // 아이폰은 전체화면 API 가 없어 'fs' 칸이 통째로 빠진다 → 같은 자리에 안내를 넣는다.
  var iosGuide = !hasFs && GAME.PWA && GAME.PWA.isIOS() && !GAME.PWA.isStandalone();
  if (hasFs) slots.push('fs');
  else if (iosGuide) slots.push('iosfs');
  if (GAME.isAdmin) slots.push('admin');
  var uc = GAME.Layout.cols(slots.length, { gap: 8, width: rw, left: rx, pad: 0 });

  for (var i = 0; i < slots.length; i++) {
    (function (kind, col) {
      if (kind === 'rank') {
        UI.button(self, col.cx, sy + stripH / 2, col.w, stripH, '🏆 랭킹', function () {
          self.scene.start('Rank', { kind: 'tower', scope: 'all' });
        }, { fontSize: 17 });
      } else if (kind === 'nick') {
        UI.button(self, col.cx, sy + stripH / 2, col.w, stripH, '닉네임 변경', function () {
          GAME.Account.logout();
          self.scene.start('Login');
        }, { fontSize: 16 });
      } else if (kind === 'music') {
        var musLbl = function () { return GAME.Music.enabled ? '🎵 음악' : '🔕 음악'; };
        var mb = UI.button(self, col.cx, sy + stripH / 2, col.w, stripH, musLbl(), function () {
          GAME.Music.toggle();
          mb.text.setText(musLbl());
        }, { fontSize: 16 });
      } else if (kind === 'sound') {
        var sndLbl = function () { return GAME.Sound.enabled ? '🔊 켜짐' : '🔈 꺼짐'; };
        var sb = UI.button(self, col.cx, sy + stripH / 2, col.w, stripH, sndLbl(), function () {
          GAME.Sound.toggle();
          sb.text.setText(sndLbl());
        }, { fontSize: 16 });
      } else if (kind === 'iosfs') {
        UI.button(self, col.cx, sy + stripH / 2, col.w, stripH, '⛶ 전체화면 방법',
          function () { GAME.PWA.showHomeScreenGuide(); }, { fontSize: 14 });
      } else if (kind === 'fs') {
        var fsLbl = function () { return GAME.PWA.isFullscreen() ? '⤡ 해제' : '⛶ 전체화면'; };
        var fb = UI.button(self, col.cx, sy + stripH / 2, col.w, stripH, fsLbl(), function () {
          GAME.PWA.toggleFullscreen(function (ok) {
            if (!fb.text || !fb.text.scene) return;
            if (!ok && !fb._everOn) { fb.rect.destroy(); fb.text.destroy(); return; }
            fb._everOn = fb._everOn || ok;
            fb.text.setText(fsLbl());
          });
        }, { fontSize: 16 });
      } else if (kind === 'admin') {
        UI.button(self, col.cx, sy + stripH / 2, col.w, stripH, '닉네임 관리', function () {
          self.scene.start('Admin', { page: 0 });
        }, { fontSize: 16, line: UI.COL.focus, color: C.warn });
      }
    })(slots[i], uc[i]);
  }
};

// 로비 행렬을 굴린다. 씬이 바뀌면 `_parade` 가 없어져 조용히 멈춘다.
GAME.MenuScene.prototype.update = function (time, delta) {
  if (this._parade && GAME.LobbyArt) GAME.LobbyArt.update(this._parade, delta);
};
GAME.MenuScene.prototype._paradeStop = function () {
  if (this._parade && GAME.LobbyArt) GAME.LobbyArt.stop(this._parade);
  this._parade = null;
  //  ⚠ 배경도 반드시 지운다. 씬 인스턴스는 재사용되는데 표시객체는 씬을 나갈 때
  //    파괴되므로, 참조를 들고 있으면 다시 들어왔을 때 죽은 객체를 만진다
  //    (이 저장소가 '지연생성 가드'에서 반복해 겪은 사고).
  if (this._backdrop && this._backdrop.destroy) this._backdrop.destroy();
  this._backdrop = null;
};
