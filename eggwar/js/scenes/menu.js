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

  //  로고 — 화면 이름 정책은 「계란들의 전쟁」 하나다(스토어·타이틀과 통일, 2026-08-21).
  //  간판체: 굵은 잉크 테두리 + 낙하 그림자. UI.label 은 스트로크가 없어 직접 만든다.
  var titleTx = this.add.text(W / 2, u * 12, '계란들의 전쟁', {
    fontFamily: (GAME.CONFIG.FONT_DISPLAY || GAME.CONFIG.FONT) + ', ' + GAME.CONFIG.FONT,
    fontSize: (P ? 30 : 52) + 'px', color: '#fff6df',
    stroke: '#3a2c16', strokeThickness: P ? 7 : 10
  }).setOrigin(0.5);
  titleTx.setShadow(0, P ? 4 : 6, 'rgba(46,32,14,0.45)', 6, false, true);
  //  타이틀 옆 계란 — 이모지(🥚) 대신 이 게임의 재료로 그린다.
  if (GAME.LobbyArt) {
    var tg = this.add.graphics().setDepth((titleTx.depth || 0) + 1);
    var ts = (P ? 28 : 50) * 1.15;
    GAME.LobbyArt.mark(tg, 'egg', titleTx.x - titleTx.width / 2 - ts * 0.62, titleTx.y, ts);
  }
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
  //  ── 이어하기를 **찾을 수 있게** 한다 (2026-08-05 사용자 지시) ────────────────
  //  기능을 만들어 두고 탑 허브 안쪽에만 두면 아무도 못 찾는다. 닉네임 바로 아래가
  //  "이 계정은 이 기기 것"이라는 사실을 읽는 자리라, 그 한계를 말할 자리도 여기다.
  GAME.UI.label(this, W / 2, u * 28,
    '기기를 바꾸려면  통곡의 탑 → 이어하기', P ? 13 : 13, C.textFaint, 0.5);
  this._carryNotice();
  this._dailyReward();

  var bw = Math.min(W - 60, 440);

  var tower = GAME.Tower.get();
  var dtower = GAME.DefendTower.get();

  // 두 탑(컨트롤러/전략가)이 나란히 서고 그 아래 자유 모드 둘.
  // 버튼이 4개로 늘어 고정 좌표(u*34/49/63)로는 아래 안내문과 겹친다
  // → **위에서 아래로 흐르는 배치**로 바꾼다. 버튼 높이가 바뀌어도 안 겹친다.
  var BH = GAME.UI.BTN_H || 58;            // 설계 px
  var SUB = u * 4.6;                       // 버튼 아래 설명 한 줄이 차지하는 여백
  var by = u * 31 + BH / 2;
  //  ⚠ 만든 버튼을 **돌려준다**. 표식(js/lobbyart.js `markFor`)이 라벨 폭을 읽어
  //    왼쪽에 붙는데, 그러려면 버튼을 만든 뒤의 `text` 를 잡을 수 있어야 한다.
  function modeButton(label, desc, opts, onTap, mark) {
    var btn = GAME.UI.button(self, W / 2, by, bw, BH, label, onTap, opts);
    if (mark && GAME.LobbyArt) GAME.LobbyArt.markFor(self, btn, mark, 1);
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

  modeButton('통곡의 탑  ' + tower.floor + '층',
    'AI가 당신을 분석해 배치를 짠다 — ' + (GAME.Tower.EARLY_FLOORS + 1) + '층부터는 조작 없이 못 이긴다' +
    (tower.best ? '   (최고 ' + tower.best + '층)' : ''),
    // line 을 0xf0a86a 로 박아뒀더니 크림 배경에서 1.08:1 로 사라졌다 → focus 토큰(테마별 값)
    { fill: GAME.UI.COL.panelAmber, line: GAME.UI.COL.focus, hover: GAME.UI.COL.panelAmberHi,
      color: C.warn, fontSize: P ? 17 : 21 },
    function () { self.scene.start('Tower'); }, 'tower');

  // 통곡의 탑 바로 아래 — 전략가판 거울 모드
  modeButton('수성의 탑  ' + dtower.floor + '층',
    '진형으로 영웅을 막아라 — 층이 오를수록 더 센 영웅이 온다' +
    (dtower.best ? '   (최고 ' + dtower.best + '층)' : ''),
    { fill: GAME.UI.COL.panelPurple, line: GAME.CONFIG.COLORS.strategist,
      hover: GAME.UI.COL.panelPurpleHi, color: C.accentAlt, fontSize: P ? 17 : 21 },
    function () { self.scene.start('DefendTower'); }, 'shield');

  // 대전 — 이 게임의 본체. 솔로(탑)는 연습장이고 여기가 목적지다.
  // 근거: 페르소나 리포트에서 "겨룰 상대가 없음"이 최대 이탈 사유(11/50)였다.
  var arena = GAME.Arena ? GAME.Arena.get() : null;
  var unseen = GAME.Arena ? GAME.Arena.unseenCount() : 0;
  modeButton('대전' + (arena ? ('   ' + arena.trophy) : '') + (unseen ? ('   ● ' + unseen) : ''),
    '내 진형을 기지로 두고 서로 공격 — 자리를 비운 사이에도 싸운다',
    { fill: GAME.UI.COL.panelTeal, line: GAME.CONFIG.COLORS.controller,
      hover: GAME.UI.COL.panelTealHi, color: C.accent, fontSize: P ? 17 : 21 },
    function () { self.scene.start('Versus'); }, 'spears');

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
    '연습이 끝나면 대전에서 사람과 싸운다',
    { size: P ? 'micro' : 'caption', color: C.textDim, origin: 0.5, originY: 0 });
  by = guideY + (P ? 30 : 36);

  //  왕좌 한 줄 (2026-08-21 태현님) — 각 모드의 전체 1위. 서버 응답이 오면 채워진다.
  var crownTxt = GAME.UI.text(this, W / 2, by - (P ? 8 : 10), '',
    { size: P ? 'micro' : 'caption', color: C.warn, origin: 0.5, originY: 0 });
  this._loadRankers(function (map) {
    if (!self.scene || !self.scene.isActive() || !crownTxt.scene) return;
    if (!map) return;
    var parts = [];
    if (map.tower) parts.push('통곡 👑 ' + String(map.tower.id).slice(0, 7) + ' ' + map.tower.value + '층');
    if (map.dtower) parts.push('수성 👑 ' + String(map.dtower.id).slice(0, 7) + ' ' + map.dtower.value + '회차');
    if (map.arena) parts.push('공성 👑 ' + String(map.arena.id).slice(0, 7) + ' ' + map.arena.value + '점');
    if (parts.length) crownTxt.setText(parts.join('   ·   '));
  });
  by += (P ? 22 : 26);

  var rc = GAME.Layout.cols(GAME.isAdmin ? 4 : 3, {
    gap: 10, width: bw, left: (W - bw) / 2, pad: 0
  });
  var smallH = GAME.UI.BTN_H_SM || 52;
  var ry = by + smallH / 2 - u * 1.4;
  // 랭킹은 3분류(통곡의 탑 / 수성의 탑 / 대전) × 2기간이다.
  // 첫 화면은 **통곡의 탑 · 전체** — 이 게임에서 가장 많이 쌓이는 기록이다.
  var rkb = GAME.UI.button(this, rc[0].cx, ry, rc[0].w, smallH, '랭킹', function () {
    self.scene.start('Rank', { kind: 'tower', scope: 'all' });
  }, { fontSize: P ? 15 : 15 });
  //  깃발 꽂힌 뼈 기둥 — 이긴 자가 꽂는 것이다(옛 🏅 을 대신한다).
  if (GAME.LobbyArt) GAME.LobbyArt.markFor(self, rkb, 'banner', 1);
  GAME.UI.button(this, rc[1].cx, ry, rc[1].w, smallH, '닉네임 변경', function () {
    GAME.Account.logout();
    self.scene.start('Login');
  }, { fontSize: P ? 15 : 14 });
  GAME.UI.button(this, rc[2].cx, ry, rc[2].w, smallH, '❓ 안내', function () {
    if (GAME.Tutorial) GAME.Tutorial.openPicker(self);
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
    var sndLbl = function () { return GAME.Sound.enabled ? '효과음 켜짐' : '효과음 꺼짐'; };
    var sb = GAME.UI.button(this, scol.cx, utilY, scol.w, utilH, sndLbl(), function () {
      GAME.Sound.toggle();
      sb.text.setText(sndLbl());
    }, { fontSize: P ? 13 : 13 });
    //  뿔피리 — 옛 🔊(현대 스피커)을 대신한다. 켜짐/꺼짐은 **글자가 계속 말한다**
    //  (표식만으로 상태를 나타내면 두 갈래가 똑같아진다 — 이모지를 걷다가 이미 겪었다).
    if (GAME.LobbyArt) GAME.LobbyArt.markFor(self, sb, 'horn', 1);
    this._soundBtnBottom = utilY + utilH / 2;
  }

  if (GAME.Music) {
    var mcol = uAt('music');
    var musLbl = function () { return GAME.Music.enabled ? '음악 켜짐' : '음악 꺼짐'; };
    var mb = GAME.UI.button(this, mcol.cx, utilY, mcol.w, utilH, musLbl(), function () {
      GAME.Music.toggle();
      mb.text.setText(musLbl());
    }, { fontSize: P ? 13 : 13 });
    //  북 — 이 게임의 음악은 북에서 시작한다(옛 🎵 을 대신한다).
    if (GAME.LobbyArt) GAME.LobbyArt.markFor(self, mb, 'drum', 1);
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
//  ── 폰 가로 로비 (A안, 2026-08-21 태현님 확정) ─────────────────────────────
//  "영웅이 주인공" — 좌상단 간판+칩, 왼쪽에 걸어다니는 내 영웅(parade 재사용),
//  하단 한 줄에 모드 카드 3장(대전이 가장 큼), 우상단에 랭킹·설정.
//  소리/음악/닉네임/전체화면은 ⚙ 설정 팝업(GAME.Modal)으로 한 단계 안으로 —
//  버튼 일곱 개가 늘어서던 유틸 줄이 사라져 화면이 게임 로비로 읽힌다.
GAME.MenuScene.prototype._buildPhone = function () {
  var C = GAME.CONFIG.COLORS;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var UI = GAME.UI;
  var self = this;
  var PAD = 16;

  // ── 좌상단 간판 ──
  var title = this.add.text(PAD + 6, 14, '계란들의 전쟁', {
    fontFamily: (GAME.CONFIG.FONT_DISPLAY || GAME.CONFIG.FONT) + ', ' + GAME.CONFIG.FONT,
    fontSize: '30px', color: '#fff6df', stroke: '#3a2c16', strokeThickness: 7
  }).setOrigin(0, 0);
  title.setShadow(0, 4, 'rgba(46,32,14,0.45)', 5, false, true);

  var me = GAME.Account.current();
  var rec = GAME.Score.of(me);
  var rank = GAME.Score.rankOf(me, 'all');
  var arena = GAME.Arena ? GAME.Arena.get() : null;
  //  칩 한 줄 — 닉네임(강조) + 기록. 값이 길어질 수 있어 한 텍스트로 흘린다.
  var chipY = title.y + title.height + 6;
  UI.text(this, PAD + 8, chipY, me,
    { size: 18, color: C.accent, origin: 0, originY: 0 });
  UI.text(this, PAD + 8, chipY + 24,
    '누적 ' + rec.total.toLocaleString('ko-KR') + '점  ·  격파 ' + rec.rounds + '회' +
    (rank ? ('  ·  ' + rank + '위') : '') +
    (arena ? ('  ·  🏅 ' + arena.trophy) : ''),
    { size: 13, color: C.textDim, origin: 0, originY: 0 });
  this._carryNotice();
  this._dailyReward();

  // ── 우상단: 랭킹 · 설정 ──
  var topH = Math.max(UI.BTN_H_SM || 52, 48), topW = 108;
  var rkb = UI.button(this, W - PAD - topW / 2, 14 + topH / 2, topW, topH, '랭킹', function () {
    self.scene.start('Rank', { kind: 'tower', scope: 'all' });
  }, { fontSize: 16 });
  if (GAME.LobbyArt) GAME.LobbyArt.markFor(self, rkb, 'banner', 1);
  UI.button(this, W - PAD - topW - 10 - topW / 2, 14 + topH / 2, topW, topH, '⚙ 설정', function () {
    self._openSettings();
  }, { fontSize: 16 });
  //  ❓ 게임 안내 다시 보기 (2026-08-21 태현님: "메인화면에 버튼 추가")
  UI.button(this, W - PAD - topW * 2 - 20 - 30, 14 + topH / 2, 60, topH, '❓', function () {
    if (GAME.Tutorial) GAME.Tutorial.openPicker(self);
  }, { fontSize: 18 });

  // ── 하단 모드 카드 한 줄 — 대전이 가장 크다 ──
  var cardH = 96, cy = H - PAD - cardH / 2;
  var gap = 10;
  var wBig = Math.round((W - PAD * 2 - gap * 2) * 0.40);
  var wSm = Math.round((W - PAD * 2 - gap * 2 - wBig) / 2);
  var x1 = PAD + wSm / 2;
  var x2 = PAD + wSm + gap + wSm / 2;
  var x3 = PAD + wSm + gap + wSm + gap + wBig / 2;

  var tower = GAME.Tower.get();
  var dtower = GAME.DefendTower.get();
  var unseen = GAME.Arena ? GAME.Arena.unseenCount() : 0;

  var pbC = UI.button(this, x1, cy, wSm, cardH,
    '수성의 탑\n' + dtower.floor + '회차' + (dtower.best ? ('  ·  최고 ' + dtower.best) : ''),
    function () { self.scene.start('DefendTower'); },
    { fill: UI.COL.panelPurple, line: GAME.CONFIG.COLORS.strategist,
      hover: UI.COL.panelPurpleHi, color: C.accentAlt, fontSize: 18 });
  if (GAME.LobbyArt) GAME.LobbyArt.markFor(self, pbC, 'shield', 1);

  var pbB = UI.button(this, x2, cy, wSm, cardH,
    '통곡의 탑\n' + tower.floor + '층' + (tower.best ? ('  ·  최고 ' + tower.best) : ''),
    function () { self.scene.start('Tower'); },
    { fill: UI.COL.panelAmber, line: UI.COL.focus, hover: UI.COL.panelAmberHi,
      color: C.warn, fontSize: 18 });
  if (GAME.LobbyArt) GAME.LobbyArt.markFor(self, pbB, 'tower', 1);

  var pbA = UI.button(this, x3, cy, wBig, cardH,
    '⚔ 대전' + (arena ? ('   ' + arena.trophy) : '') + (unseen ? ('   ● ' + unseen) : '') +
    '\n실시간 대결 · 사람과 싸운다',
    function () { self.scene.start('Versus'); },
    { fill: UI.COL.panelTeal, line: GAME.CONFIG.COLORS.controller,
      hover: UI.COL.panelTealHi, color: C.accent, fontSize: 20 });
  if (GAME.LobbyArt) GAME.LobbyArt.markFor(self, pbA, 'spears', 1);

  //  조작 안내는 로비에서 뺐다(A안 — 온보딩·전투 화면이 이미 가르친다).
  //  퍼레이드가 지나는 들판을 글자가 가로지르던 것도 함께 해결된다.

  //  ── 왕좌 줄 (2026-08-21 태현님: "각 랭커들을 보여줘서 점수 올리라는 자극") ──
  //  카드 바로 위에 그 모드의 **전체 1위**를 적는다. 서버 응답이 오면 채워진다 —
  //  화면은 기다리지 않는다(서버가 죽어 있으면 그냥 빈 줄이다).
  var ry = cy - cardH / 2 - 6;
  var mkCrown = function (x, w) {
    return UI.text(self, x, ry, '', { size: 12, color: C.warn, origin: 0.5, originY: 1 });
  };
  var crowns = { dtower: mkCrown(x1, wSm), tower: mkCrown(x2, wSm), arena: mkCrown(x3, wBig) };
  this._loadRankers(function (map) {
    if (!self.scene || !self.scene.isActive()) return;
    var unitOf = { tower: '층', dtower: '회차', arena: '점' };
    ['tower', 'dtower', 'arena'].forEach(function (k) {
      var top = map && map[k];
      var t = crowns[k];
      if (!top || !t || !t.scene) return;
      var nick = String(top.id || '').slice(0, 7);
      t.setText('👑 ' + (top.id === me ? '나 — 왕좌 방어 중' : (nick + ' ' + top.value + unitOf[k])));
      if (top.id === me) t.setColor(C.accent);
    });
  });
};

//  각 분야 전체 1위 — 5분 캐시(메뉴 재진입이 잦다). 실패한 분야는 그냥 빈다.
GAME.MenuScene.prototype._loadRankers = function (cb) {
  var cache = GAME.__rankers;
  if (cache && Date.now() - cache.t < 300e3) { cb(cache.map); return; }
  if (!GAME.Api || !GAME.Api.enabled || !GAME.Api.enabled()) { cb(null); return; }
  var kinds = ['tower', 'dtower', 'arena'];
  var map = {}, left = kinds.length;
  kinds.forEach(function (k) {
    GAME.Api.board(k, 'all').then(function (res) {
      if (res && res.rows && res.rows.length) map[k] = res.rows[0];
    })['catch'](function () { return null; }).then(function () {
      if (--left === 0) { GAME.__rankers = { t: Date.now(), map: map }; cb(map); }
    });
  });
};

//  ⚙ 설정 팝업 — 유틸 줄을 대체한다(A안). Modal 은 고르면 닫히므로 토글은
//  현재 상태를 이름에 적어 "누르면 반대로 된다"가 읽히게 한다.
//  🎁 일일 보상 — 하루 첫 접속에 골드 60 (2026-08-21 태현님 지시).
//  잔존 장치의 최소 단위다: 받는 행동(버튼)을 시켜야 보상이 몸에 남는다(구슬의 교훈).
//  날짜는 기기 로컬 기준(KST 사용자 전제) · 계정별로 따로 센다.
GAME.MenuScene.prototype._dailyReward = function () {
  if (!GAME.TowerChar || !GAME.TowerChar.exists || !GAME.TowerChar.exists()) return;
  if (!GAME.Modal) return;
  var me = GAME.Account.current();
  if (!me) return;
  var d = new Date();
  var stamp = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  var key = 'eggwar.daily.' + me;
  try { if (GAME.Store.get(key, '') === stamp) return; } catch (e) { return; }
  var AMT = 60;
  var self = this;
  //  씬이 그려진 뒤에 띄운다(_carryNotice 와 같은 이유). 이어하기 안내와 겹치면
  //  Modal.open 이 기존 것을 닫고 열므로 순서 충돌은 없다.
  this.time.delayedCall(600, function () {
    if (!self.scene.isActive() || GAME.Modal.isOpen()) return;
    //  2026-08-21 태현님: "어느 쪽으로 들어가는지 알아야 하고 선택해서 받는 게 좋다."
    //  예전엔 말없이 통곡의 탑 지갑으로만 들어갔다. 두 지갑은 경제가 분리돼 있어
    //  (통곡=TowerChar.gold, 수성=DefendTower.gold) 받는 쪽을 고르게 한다.
    //  금액은 양쪽 같게 둔다 — 초반 몇 판 어치라는 체감이 양쪽에서 비슷하다
    //  (통곡 초반 판당 11~30골드, 수성 판당 34+층당 6골드).
    GAME.Modal.open(self, {
      title: '🎁 오늘의 접속 보상 — 받을 곳을 고르세요',
      items: [
        { key: 'tower', name: '⚔ 통곡의 탑 골드 +' + AMT },
        { key: 'dtower', name: '🛡 수성의 탑 골드 +' + AMT }
      ],
      onPick: function (it) {
        try { GAME.Store.set(key, stamp); } catch (e) {}
        if (it.key === 'dtower' && GAME.DefendTower && GAME.DefendTower.addGold)
          GAME.DefendTower.addGold(AMT);
        else
          GAME.TowerChar.addGold(AMT);
        if (GAME.Sound) GAME.Sound.play('coin');
      }
    });
  });
};

GAME.MenuScene.prototype._openSettings = function () {
  var self = this;
  if (!GAME.Modal) return;
  var items = [];
  if (GAME.Sound) items.push({ key: 'sound',
    name: GAME.Sound.enabled ? '🔊 소리 끄기' : '🔈 소리 켜기' });
  if (GAME.Music) items.push({ key: 'music',
    name: GAME.Music.enabled ? '🥁 음악 끄기' : '🥁 음악 켜기' });
  items.push({ key: 'nick', name: '✏ 닉네임 변경' });
  var hasFs = GAME.PWA && GAME.PWA.canFullscreen() && !GAME.PWA.isStandalone();
  if (hasFs) items.push({ key: 'fs',
    name: GAME.PWA.isFullscreen() ? '⤡ 전체화면 해제' : '⛶ 전체화면' });
  else if (GAME.PWA && GAME.PWA.isIOS() && !GAME.PWA.isStandalone())
    items.push({ key: 'iosfs', name: '⛶ 전체화면 방법(홈 화면 추가)' });
  if (GAME.isAdmin) items.push({ key: 'admin', name: '관리자' });

  GAME.Modal.open(this, {
    title: '설정',
    items: items,
    onPick: function (it) {
      if (it.key === 'padflip') {
        GAME.TouchPad.setCfg({ flip: !GAME.TouchPad.cfg().flip });
        self._openSettings();                    // 바뀐 문구로 다시 연다
        return;
      }
      if (it.key === 'padscale') {
        var cur = GAME.TouchPad.cfg().scale;
        GAME.TouchPad.setCfg({ scale: cur === 1 ? 1.18 : (cur === 1.18 ? 0.85 : 1) });
        self._openSettings();
        return;
      }
      if (it.key === 'sound') GAME.Sound.toggle();
      else if (it.key === 'music') GAME.Music.toggle();
      else if (it.key === 'nick') { GAME.Account.logout(); self.scene.start('Login'); }
      else if (it.key === 'fs') GAME.PWA.toggleFullscreen(function () {});
      else if (it.key === 'iosfs') GAME.PWA.showHomeScreenGuide();
      else if (it.key === 'admin') self.scene.start('Admin');
    }
  });
};

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

// ── 이어하기 한 번 안내 (2026-08-05 사용자 지시: "옮기기 시스템 알려주거나") ──────
//  기능을 만들어 놓고 안 알리면 없는 것과 같다. 다만 **한 번만** 말한다 —
//  들어올 때마다 팝업이 뜨면 그건 안내가 아니라 방해다.
//  ⚠ '봤음' 표시는 `GAME.Onboard` 의 저장소를 **그대로 빌려 쓴다**. 같은 성격의
//    기록을 키 두 개로 나눠 두면 계정을 지울 때 한쪽만 남는다.
//  ⚠ **이미 진행이 있는 사람에게만** 띄운다. 방금 시작한 사람에게 "옮기는 법"은
//    아직 아무 뜻이 없다.
//  ⚠ PIN(비밀번호) 은 **아직 서버에 없다.** 없는 기능을 안내하지 않는다 —
//    올라가면 그때 이 문구에 덧붙인다.
GAME.MenuScene.prototype._carryNotice = function () {
  var ID = 'carry-code-v1';
  if (!GAME.Onboard || !GAME.Modal) return;
  if (GAME.Onboard.seen().indexOf(ID) >= 0) return;
  var t = GAME.Tower && GAME.Tower.get ? GAME.Tower.get() : null;
  var hasProgress = !!(t && ((t.best || 0) > 1 || (t.floor || 1) > 1));
  if (!hasProgress) return;

  var self = this;
  //  씬이 다 그려진 뒤에 띄운다 — create 도중에 열면 뒤 화면이 아직 없어 어색하다.
  this.time.delayedCall(400, function () {
    if (!self.scene.isActive()) return;
    GAME.Onboard.markSeen(ID);
    GAME.Modal.open(self, {
      title: '기기를 바꿔도 이어서 할 수 있습니다',
      items: [
        { key: 'go', name: '지금 코드 만들기',
          note: '통곡의 탑 → 이어하기 에서 언제든 다시 열 수 있습니다' },
        { key: 'no', name: '나중에',
          note: '골드·장비·능력치·층은 이 기기에만 저장됩니다' }
      ],
      onPick: function (it) {
        if (it && it.key === 'go') self.scene.start('Tower', {});
      }
    });
  });
};
