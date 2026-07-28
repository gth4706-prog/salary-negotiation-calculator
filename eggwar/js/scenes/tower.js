window.GAME = window.GAME || {};

// 통곡의 탑 — 두 단계로 나뉜다.
//   1) **랜딩** — 처음 눌렀을 때. 탑 일러스트(이번 층 적 에그가 앞에 서 있다),
//      현재/최고 층, 규칙 설명, 그리고 '도전'·'랭킹'·'메뉴' 만 보여준다.
//      영웅 선택은 여기서 하지 않는다(요청 반영) — 정보를 보고 마음의 준비만 하는 자리다.
//   2) **도전 화면** — '도전'을 누르면 넘어간다. 새 도전이면 영웅을 고르고,
//      진행 중인 도전이면 골드 상점(능력치 레벨업)과 '전투 시작'을 보여준다.
// 두 단계 전환은 scene.restart({step}) 로 한다 — 이 파일이 이미 '1층부터 다시'에서
// 쓰던 방식과 같다(Phaser 가 이전 화면의 표시객체를 통째로 정리해 주므로 안전하다).
GAME.TowerScene = function () {
  Phaser.Scene.call(this, { key: 'Tower' });
};
GAME.TowerScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.TowerScene.prototype.constructor = GAME.TowerScene;

GAME.TowerScene.prototype.create = function (data) {
  var C = GAME.CONFIG.COLORS;

  if (!GAME.Account.current()) { this.scene.start('Login'); return; }

  // 배경색은 각 단계가 스스로 정한다 — 랜딩은 어두운 연출용 배경을 따로 쓴다(아래 참조).

  // ── 공통 상태 (두 단계 모두 여기서부터 시작한다) ──
  var rec = GAME.Tower.get();
  var floor = rec.floor;
  this._rec = rec;
  this._floor = floor;
  this._prof = GAME.Profile.read();

  // 진행 중인 도전이 있으면 그 세팅을 그대로 쓴다(층마다 다시 고르지 않는다).
  this.run = (GAME.TowerRun && GAME.TowerRun.get()) || null;
  this.heroKey = this.run ? this.run.heroKey
                          : GAME.Store.get('asymgame.lastHero', GAME.HERO_ORDER[0]);
  if (!GAME.HEROES[this.heroKey]) this.heroKey = GAME.HERO_ORDER[0];
  this.formation = GAME.Tower.formationFor(floor, this.heroKey);

  // scene.restart 는 표시객체는 정리하지만 **인스턴스 프로퍼티는 그대로 남긴다.**
  // 랜딩 ↔ 도전 화면을 오갈 때 이전 단계의 버튼 참조(이미 파괴된 객체)가 남아 있으면
  // 안 되므로 매번 비운다.
  this.heroBtns = [];
  this.statBtns = [];
  this.goldLabel = null;
  this.runHint = null;
  // 캐릭터 선택 화면·랜딩 연출이 만든 것들도 반드시 함께 비운다.
  // 파괴된 Phaser 객체는 여전히 truthy 라 `if (!g) return` 가드를 통과해 버린다 —
  // 이 저장소에서 이미 한 번 터진 유형이다.
  this._heroCardG = null;
  this._heroCards = [];
  this._heroDesc = null;
  this._heroStats = null;
  this._startBtn = null;
  this._hoverHero = null;
  this._lightningG = null;
  this._flashRect = null;

  var step = (data && data.step) || 'landing';
  // Phaser 의 `Systems.start(data)` 는 data 가 없으면 **이전 settings.data 를 그대로 둔다.**
  // 그래서 `restart({step:'challenge'})` 뒤에 메뉴를 거쳐 인자 없는 `scene.start('Tower')`
  // 로 돌아오면 step 이 'challenge' 로 남아 랜딩(탑 일러스트·세계관 문단)을 건너뛴다(실측).
  // 읽었으면 비운다 — 다음 진입의 기본값은 언제나 랜딩이다.
  if (this.scene && this.scene.settings) this.scene.settings.data = {};
  if (step === 'challenge') {
    // 새 도전 + PC → 캐릭터 아트를 보여주는 전용 선택 화면.
    // 진행 중인 도전(골드 상점)과 세로 화면은 기존 흐름을 그대로 쓴다.
    if (!this.run && !GAME.CONFIG.PORTRAIT) this._buildHeroSelect();
    else this._buildChallenge();
  } else this._buildLanding();
};

// ═══════════════════════════════════════════════════════════════════════
//  1) 랜딩 — "통곡의 탑" 이라는 이름 그대로의 장면.
//
//  요청 반영: 이 화면은 게임 나머지의 밝은 크림 톤을 의도적으로 깬다.
//  어둡고 사실적인 탑이 번개 아래 서 있고, 플레이어의 영웅이 **등을 보인 채**
//  그 앞에 서서 함께 올려다본다(오버더숄더 구도) — 도전이 시작되기 전 마지막 정적.
//  전부 Phaser Graphics 벡터로 그린다(이 프로젝트는 이미지 자산을 늘리지 않는다).
//  버튼은 '도전 / 랭킹 / 메뉴' 셋뿐이고, 영웅 선택은 여기서 하지 않는다.
// ═══════════════════════════════════════════════════════════════════════
GAME.TowerScene.prototype._buildLanding = function () {
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var P = GAME.CONFIG.PORTRAIT;
  // 폰 가로 — PC 와 **같은 구도**(좌 버튼 기둥 / 우 계란전사)가 성립한다. 비율만 다르다.
  var PH = GAME.CONFIG.PHONE;
  var self = this;
  var u = H / 100;
  var rec = this._rec, floor = this._floor;

  // 이 화면 전용 팔레트 — 테마 토큰(C.text 등)은 밝은 배경을 전제하므로 여기서는 안 쓴다.
  var INK = { sky1: 0x03040a, sky2: 0x0d1020, sky3: 0x171b2e, ground: 0x07080c,
              stone1: 0x1b1c24, stone2: 0x232430, window: 0xffb066, crack: 0x0a0a10,
              parchment: '#ece3cf', dim: '#9a9488', gold: '#ffd166' };
  this.cameras.main.setBackgroundColor(INK.sky1);
  this._landingDark = true;

  var g = this.add.graphics();

  // ── 하늘 ── 위로 갈수록 짙어지는 밤하늘(밴드로 그라디언트를 흉내)
  var groundY = H * (P ? 0.70 : (PH ? 0.74 : 0.66));
  var skyBands = 14;
  for (var i = 0; i < skyBands; i++) {
    var t = i / (skyBands - 1);
    g.fillStyle(this._lerpColor(INK.sky1, INK.sky3, t), 1);
    g.fillRect(0, (groundY * t), W, groundY / skyBands + 1);
  }
  // 지면
  g.fillStyle(INK.ground, 1);
  g.fillRect(0, groundY, W, H - groundY);
  // 안개 — 지면 위로 옅게 깔린 여러 겹
  for (var m = 0; m < 4; m++) {
    g.fillStyle(0x30333f, 0.10 - m * 0.015);
    g.fillEllipse(W * 0.5, groundY - m * 10, W * 1.3, 34 + m * 10);
  }

  // ── 탑 — 피사의 사탑처럼 살짝 기운 채, 밑동을 축으로 회전한 컨테이너에 그린다 ──
  // 폰 가로는 왼쪽 버튼 기둥이 화면 폭의 절반을 넘게 차지한다 → 탑을 오른쪽으로 밀어
  // 기둥과 계란전사 사이 틈에 세운다(기둥 뒤에 숨으면 '탑 랜딩'이 아니게 된다).
  var pivotX = W * (PH ? 0.62 : 0.5), pivotY = groundY + 4;
  var towerCont = this.add.container(pivotX, pivotY);
  var tg = this.add.graphics();
  towerCont.add(tg);
  towerCont.setRotation(Phaser.Math.DegToRad(4.2));   // 살짝 왼쪽으로 기욺 — 불안정하고 오래된 느낌
  this._towerCont = towerCont;

  var towerH = H * (P ? 0.60 : (PH ? 0.50 : 0.56));
  var baseW = PH ? Math.min(W * 0.20, 118) : Math.min(W * 0.30, 172);
  var topW = baseW * 0.5;
  var segs = 8;
  for (var s = 0; s < segs; s++) {
    var frac = s / (segs - 1);              // 0 = 밑동, 1 = 꼭대기
    var segW = baseW - (baseW - topW) * frac;
    var segH = towerH / segs;
    var segTopY = -(s + 1) * segH;
    var shade = (s % 2 === 0) ? INK.stone1 : INK.stone2;
    tg.fillStyle(shade, 1);
    tg.fillRect(-segW / 2, segTopY - 1, segW, segH + 2);
    // 가는 균열 — 결정론적으로(세션마다 안 바뀌게) sin 값으로 위치를 정한다
    tg.lineStyle(1, 0x000000, 0.35);
    var crackX = Math.sin(s * 2.7) * segW * 0.28;
    tg.lineBetween(crackX, segTopY, crackX + Math.cos(s) * 10, segTopY + segH);
    // 창 — 한 층 걸러 하나, 침침한 주황 불빛(탑 안에 뭔가 있다는 암시).
    // 광륜 반지름은 창 자체보다 살짝만 커야 한다 — segW*0.5 로 뒀더니 탑을 통째로
    // 덮는 거대한 원이 되어(실측 확인) 벽돌이 아니라 풍선처럼 보였다.
    if (s > 0 && s < segs - 1 && s % 2 === 1) {
      var winW = segW * 0.18, winH = segH * 0.34;
      var winCy = segTopY + segH * 0.5;
      tg.fillStyle(INK.window, 0.14);
      tg.fillCircle(0, winCy, winW * 1.6);        // 광륜 먼저(창보다 살짝만 크게)
      tg.fillStyle(INK.window, 0.9);
      tg.fillRect(-winW / 2, segTopY + segH * 0.32, winW, winH);   // 창은 그 위에
    }
  }
  // 꼭대기 흉벽(성가퀴)
  var topY = -segs * (towerH / segs);
  var crenN = 5;
  var lastW = topW;
  var toothW = lastW / (crenN * 2 - 1);
  tg.fillStyle(INK.stone2, 1);
  for (var c = 0; c < crenN; c++) {
    var tx = -lastW / 2 + c * toothW * 2;
    tg.fillRect(tx, topY - toothW * 1.1, toothW, toothW * 1.1);
  }

  // ── 영웅 — 등을 보인 채(오버더숄더) 탑을 올려다본다. 실제 게임 캐릭터 아트를 그대로 쓴다.
  //
  // PC 와 세로의 구도가 다르다.
  //  · 세로: 폭이 없어 예전대로 화면 아래 가운데에 반쯤 잘리게 세운다.
  //  · PC: 예전엔 여기도 가운데·화면 밖이라, 아래 스크림과 버튼이 인물을 통째로
  //    덮어 "이미지가 다 잘린다"는 신고가 나왔다(실측: 스크림 시작 592px, 인물은
  //    550px 부터라 사실상 전신이 가려짐). 인물을 **오른쪽으로 옮기고 더 키워서**
  //    버튼 기둥과 아예 겹치지 않게 한다 — 가리지 않으니 크게 키울 수 있다.
  var heroKey = this.heroKey || 'vanguard';
  var heroDef = GAME.HEROES[heroKey] || GAME.HEROES.vanguard;
  // 크기·높이는 실측(스크린샷)으로 맞췄다. 캐릭터는 sy 기준으로 **위로 약 3.2r,
  // 아래로 약 1.8r** 만큼 뻗는다(치켜든 무기 끝 ~ 알 몸통 바닥) — 총 높이가 5r 이다.
  // 0.235/1.00 → 머리와 검만, 0.21/0.845 → 몸통 바닥이 화면 밖. 두 번 다 잘렸다.
  // 5r + 위쪽 제목 자리(~150px)가 H 안에 들어가야 한다 → r ≤ 0.15·min(W,H).
  //
  // 폰 가로(820×390)는 높이가 곧 한계다. 위 3.2r + 아래 1.8r = 5r 을 **화면 안에 그대로**
  // 넣으려면 r 을 세로 여유에서 역산해야 한다(비율로 잡으면 발밑이 잘린다 — 실측).
  var heroR, heroX, heroY;
  if (PH) {
    var bandTop = 96, bandBot = H - 16;
    heroR = (bandBot - bandTop) / 5;                 // 390 에서 56.8
    heroY = bandTop + heroR * 3.2;
    heroX = W * 0.80;                                // 가로 반폭 2.1r 이 화면 안에 들어간다
  } else {
    heroR = Math.min(W, H) * (P ? 0.20 : 0.15);
    heroX = W * (P ? 0.50 : 0.755);
    heroY = H * (P ? 1.00 : 0.72);
  }
  // 인물은 탑(towerCont)보다 **뒤에 만든 그래픽스**에 그려야 앞에 선다.
  // g 는 towerCont 보다 먼저 만들어졌으므로 g 에 그리면 탑에 가린다.
  var hg = this.add.graphics();
  // 발밑 진영 링 — 컨트롤러 색으로 '이게 내 영웅' 을 표시
  hg.lineStyle(3, GAME.CONFIG.COLORS.controller, 0.55);
  hg.strokeEllipse(heroX, heroY + heroR * 0.35, heroR * 2.3, heroR * 0.62);
  hg.fillStyle(0x000000, 0.4);
  hg.fillEllipse(heroX, heroY + heroR * 0.35, heroR * 2.1, heroR * 0.5);
  // facing = -PI/2 → dir8.back === true → 얼굴이 안 보이고 무기가 몸에 가려진다(등 뒤 시점)
  GAME.UI.drawUnitFlat(hg, heroDef, heroX, heroY, GAME.CONFIG.COLORS.controller, 1,
    heroR / (heroDef.radius || 17), -Math.PI / 2);

  // ── 번개 ──
  this._lightningG = this.add.graphics();
  this._flashRect = this.add.rectangle(W / 2, H / 2, W, H, 0xffffff, 1).setAlpha(0);
  this._scheduleLightning();
  this.events.once('shutdown', function () { self._stopLightning(); });

  // ── 텍스트(양피지 톤) ──
  var y = u * 4;
  if (PH) y = 6;
  var title = GAME.UI.text(this, W / 2, y, '통곡의 탑',
    { size: P ? 'display' : 'display', color: INK.parchment, origin: 0.5 }).setOrigin(0.5, 0);
  title.setFontSize(P ? 30 : (PH ? 28 : 44));
  title.setShadow(0, 3, '#000000', 6, false, true);
  y = title.y + title.height + u * 0.6;
  var sub = GAME.UI.text(this, W / 2, y,
    floor + '층' + (rec.best ? ('  ·  최고 ' + rec.best + '층') : '  ·  첫 도전'),
    { size: 'body', color: INK.gold, origin: 0.5 }).setOrigin(0.5, 0);
  sub.setShadow(0, 2, '#000000', 5, false, true);

  // 규칙 설명 — 짧은 한 줄로 못박는다. 두 줄로 늘어나면 아래 버튼과 겹쳤다(실측 확인) —
  // 그래서 길이를 아예 한 줄에 들어가는 짧은 문장으로 줄였다(줄바꿈 여지를 없앰).
  var E = GAME.Tower.EARLY_FLOORS;
  var ruleTxt = (floor <= E)
    ? ('1~' + E + '층 연습 구간 · ' + (E + 1) + '층부터 조작 필수')
    : ('영웅·장비 유지 · 골드로 능력치 성장');

  // ── 버튼 기둥 ──
  // PC 는 인물을 오른쪽에 크게 세웠으므로 버튼을 **왼쪽 기둥**으로 몰아 겹침을 없앤다.
  // 세로는 폭이 없으니 예전처럼 화면 폭 전체를 쓴다.
  //
  // 폰 가로: 세로로 3단을 쌓으면 한 칸이 27px(화면 27px)이 되어 손가락이 안 들어간다
  // (실측: 430×27.3). '랭킹·메뉴'를 **한 줄 2칸**으로 접어 높이를 도전 버튼에 몰아준다.
  var bw = P ? Math.min(W - 30, 420) : (PH ? 420 : 430);
  var colCx = P ? (W / 2) : (PH ? (36 + bw / 2) : (56 + bw / 2));
  var bh = PH ? 58 : u * 7;
  var gap = PH ? 10 : u * 1.4;
  var byBottom = H - (PH ? 10 : u * 2);
  var bigH = PH ? 64 : bh + u * 0.8;
  var challengeCy = PH ? (byBottom - bh - gap - bigH / 2)
                       : (byBottom - bh * 2.5 - gap * 2);
  var textBottom = challengeCy - bigH / 2 - (PH ? 12 : u * 1.6);

  // ── 세계관 + 이 모드가 무엇인지 (버튼 바로 위) ──
  // 요청: "통곡의 탑 설명에 세계관 + 진화하는 AI 전장에서 컨트롤러 훈련하라는 문구".
  // 아래에서 위로 쌓는다 — 문장이 길어져 줄이 늘어도 버튼을 밀지 않는다.
  var textW = P ? (W - 40) : bw;
  var ruleLbl = GAME.UI.text(this, colCx, 0, ruleTxt,
    { size: P ? 'caption' : 'caption', color: INK.dim, origin: 0.5, align: P ? 'center' : 'left', wrap: textW });
  ruleLbl.setOrigin(P ? 0.5 : 0, 0);
  if (!P) ruleLbl.setX(colCx - bw / 2);
  ruleLbl.setY(textBottom - ruleLbl.height);

  var ctaLbl = GAME.UI.text(this, colCx, 0,
    '진화하는 AI 전장에서 컨트롤러의 손을 훈련하라.',
    { size: P ? 'caption' : 'body', color: INK.gold, origin: 0.5, align: P ? 'center' : 'left', wrap: textW });
  ctaLbl.setOrigin(P ? 0.5 : 0, 0);
  if (!P) ctaLbl.setX(colCx - bw / 2);
  ctaLbl.setY(ruleLbl.y - ctaLbl.height - u * 1.1);
  ctaLbl.setShadow(0, 2, '#000000', 5, false, true);

  var loreTop = ctaLbl.y;
  var loreLbl = null;
  if (!P) {
    // 세로에서는 이 문단이 들어갈 세로 여유가 없다(버튼 4줄이 이미 화면을 채운다).
    // 폰 가로도 4줄은 사치다 — 같은 내용을 **2줄로 축약**한다.
    loreLbl = GAME.UI.text(this, colCx - bw / 2, 0,
      PH
        ? ('알에서 깨어난 자들의 전쟁 — 패배한 부족의 울음으로 쌓아 올린 탑.\n' +
           '탑은 당신의 싸움을 기억한다. 오를수록 더 잘 아는 진형이 내려온다.')
        : ('알에서 깨어난 자들의 전쟁.\n' +
           '통곡의 탑은 패배한 부족의 울음으로 쌓아 올린 탑이다.\n' +
           '탑은 당신의 싸움을 기억한다 — 한 층을 오를 때마다,\n' +
           '당신을 더 잘 아는 진형이 내려온다.'),
      { size: 'caption', color: INK.parchment, origin: 0, align: 'left', wrap: textW });
    loreLbl.setOrigin(0, 0).setAlpha(0.86).setLineSpacing(5);
    loreLbl.setY(ctaLbl.y - loreLbl.height - u * 1.4);
    loreTop = loreLbl.y;
  }

  // ── 스크림 ──
  // 인물(hg)보다 **나중에 만든 그래픽스**에 그려야 인물을 덮을 수 있다.
  // 세로: 예전처럼 화면 폭 전체를 아래에서 위로 어둡게.
  // PC: 왼쪽 기둥만 덮는다. 오른쪽 인물은 가리지 않는 게 이번 수정의 목적이다.
  var sg = this.add.graphics();
  var scrimTop = loreTop - u * 2.5;
  var scrimBands = 10;
  var sb, st;
  if (P) {
    for (sb = 0; sb < scrimBands; sb++) {
      st = sb / (scrimBands - 1);
      // 선형 램프는 시작 지점 불투명도가 0 이라 '도전' 버튼 바로 위 틈에서
      // 실루엣이 비쳤다(실측 2회) → 시작부터 0.38 로 깔고 가파르게 올린다.
      sg.fillStyle(0x000000, Math.min(0.95, 0.38 + st * 2.4));
      sg.fillRect(0, scrimTop + (H - scrimTop) * (sb / scrimBands), W, (H - scrimTop) / scrimBands + 1);
    }
  } else {
    // 왼쪽 끝은 진하게, 기둥 오른쪽 끝에서 0 으로 사라지는 가로 그라디언트.
    // 위쪽도 부드럽게 열려야 잘라낸 사각형처럼 보이지 않는다.
    var panelR = colCx + bw / 2 + 90;
    var hSteps = 12, vSteps = 8;
    var cw = panelR / hSteps, chh = (H - scrimTop) / vSteps;
    for (var hx2 = 0; hx2 < hSteps; hx2++) {
      var hf = 1 - Math.pow(hx2 / (hSteps - 1), 1.7);     // 오른쪽으로 갈수록 옅게
      for (var vy = 0; vy < vSteps; vy++) {
        var vf = Math.min(1, 0.35 + (vy / (vSteps - 1)) * 1.9);
        sg.fillStyle(0x000000, Math.min(0.9, 0.9 * hf * vf));
        sg.fillRect(hx2 * cw, scrimTop + vy * chh, cw + 1, chh + 1);
      }
    }
  }
  // 텍스트는 스크림보다 먼저 만들어져 뒤에 깔린다 → 앞으로 끌어올린다.
  if (loreLbl) loreLbl.setDepth(2);
  ctaLbl.setDepth(2);
  ruleLbl.setDepth(2);

  var darkBtnOpts = {
    fill: 0x14141c, line: 0xffd166, hover: 0x1e1e28, press: 0x0e0e14,
    color: INK.parchment, radius: GAME.UI.R ? GAME.UI.R.md : 10
  };

  if (PH) {
    // 두 보조 버튼을 한 줄 2칸으로 — 높이를 아껴 터치 타깃(58)을 확보한다.
    var sc = GAME.Layout.cols(2, { gap: 10, width: bw, left: colCx - bw / 2, pad: 0 });
    GAME.UI.button(this, sc[0].cx, byBottom - bh * 0.5, sc[0].w, bh, '🏆 랭킹', function () {
      self.scene.start('Rank', { scope: 'live' });
    }, Object.assign({ fontSize: 17 }, darkBtnOpts));
    GAME.UI.button(this, sc[1].cx, byBottom - bh * 0.5, sc[1].w, bh, '← 메뉴', function () {
      self.scene.start('Menu');
    }, Object.assign({ fontSize: 17 }, darkBtnOpts));
  } else {
    GAME.UI.button(this, colCx, byBottom - bh * 0.5, bw, bh, '← 메뉴', function () {
      self.scene.start('Menu');
    }, Object.assign({ fontSize: P ? 15 : 15 }, darkBtnOpts));

    GAME.UI.button(this, colCx, byBottom - bh * 1.5 - gap, bw, bh, '🏆 랭킹', function () {
      self.scene.start('Rank', { scope: 'live' });
    }, Object.assign({ fontSize: P ? 17 : 16 }, darkBtnOpts));
  }

  var challengeLabel = this.run ? ('도전 계속하기  —  ' + floor + '층') : '도전';
  GAME.UI.button(this, colCx, challengeCy, bw, bigH, challengeLabel,
    function () { self.scene.restart({ step: 'challenge' }); },
    { fill: 0x2a2016, line: 0xffd166, hover: 0x352a1e, press: 0x1e1710,
      color: '#ffd166', fontSize: P ? 20 : (PH ? 21 : 22), radius: GAME.UI.R ? GAME.UI.R.md : 10 });
};

// 두 색을 f(0~1) 비율로 섞는다 — 하늘 그라디언트용
GAME.TowerScene.prototype._lerpColor = function (a, b, f) {
  var ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  var br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  var r = Math.round(ar + (br - ar) * f), gg = Math.round(ag + (bg - ag) * f), bl = Math.round(ab + (bb - ab) * f);
  return (r << 16) | (gg << 8) | bl;
};

// 번개 — 무작위 간격(2.5~7초)으로 한 번씩. 씬을 나가면 타이머가 자동으로 멎도록
// this.time(씬 전용 타임 시스템)만 쓴다.
GAME.TowerScene.prototype._scheduleLightning = function () {
  var self = this;
  var delay = 2500 + Math.random() * 4500;
  this._boltTimer = this.time.delayedCall(delay, function () {
    self._strikeLightning();
    if (self._landingDark) self._scheduleLightning();
  });
};

GAME.TowerScene.prototype._stopLightning = function () {
  if (this._boltTimer) { this._boltTimer.remove(false); this._boltTimer = null; }
  this._landingDark = false;
};

GAME.TowerScene.prototype._strikeLightning = function () {
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var g = this._lightningG;
  if (!g) return;
  g.clear();
  var x = W * (0.28 + Math.random() * 0.44);
  var segs = 6, px = x, py = 0;
  var pts = [[px, py]];
  for (var i = 0; i < segs; i++) {
    px += (Math.random() - 0.5) * 60;
    py += (H * 0.5) / segs;
    pts.push([px, py]);
  }
  g.lineStyle(8, 0xeaf2ff, 0.16);
  drawPolyline(g, pts);
  g.lineStyle(3, 0xf4f8ff, 0.95);
  drawPolyline(g, pts);

  if (this._flashRect) {
    this._flashRect.setAlpha(0.5);
    this.tweens.add({ targets: this._flashRect, alpha: 0, duration: 300, ease: 'Quad.easeOut' });
  }
  var self = this;
  this.time.delayedCall(180, function () { if (g) g.clear(); });

  function drawPolyline(gr, points) {
    gr.beginPath();
    gr.moveTo(points[0][0], points[0][1]);
    for (var k = 1; k < points.length; k++) gr.lineTo(points[k][0], points[k][1]);
    gr.strokePath();
  }
};

// ═══════════════════════════════════════════════════════════════════════
//  1.5) 캐릭터 선택 (PC · 새 도전일 때만)
//
//  예전에는 '도전' 을 누르면 이름과 특성만 적힌 작은 버튼 3개가 나왔다.
//  이 도전 내내 함께 갈 영웅을 고르는 자리인데, **정작 그 영웅이 어떻게 생겼는지**
//  볼 수가 없었다. 실제 게임에서 쓰는 캐릭터 아트를 카드에 크게 그린다.
//  (요청 원문: "처음 영웅 선택화면에서 캐릭터 디자인도 보여주는 캐릭터 선택화면
//   정도로 꾸려주고 탑에 대한 설명 넣어줘")
//
//  세로는 이 화면을 쓰지 않는다 — 폭 420px 에 카드 4장이 안 들어간다.
//  모바일은 따로 설계하기로 했다(사용자 지시).
// ═══════════════════════════════════════════════════════════════════════
GAME.TowerScene.prototype._buildHeroSelect = function () {
  var C = GAME.CONFIG.COLORS;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var self = this;
  var u = H / 100;
  var rec = this._rec, floor = this._floor;

  if (GAME.CONFIG.PHONE) { this._buildHeroSelectPhone(); return; }

  this.cameras.main.setBackgroundColor(C.bg);

  var PAD = 56;
  var bossDef = GAME.Tower.bossFor(floor);
  var E = GAME.Tower.EARLY_FLOORS;

  // ── 머리 ──
  GAME.UI.label(this, PAD, u * 3.0, '←  탑 소개', 14, C.textDim, 0)
    .setInteractive({ useHandCursor: true })
    .on('pointerdown', function () { self.scene.restart({ step: 'landing' }); });

  var title = GAME.UI.label(this, W / 2, u * 2.2, '캐릭터 선택', 38, C.text, 0.5).setOrigin(0.5, 0);
  var sub = GAME.UI.label(this, W / 2, title.y + title.height + 4,
    '이 도전이 끝날 때까지 함께 갈 영웅을 선택해주세요.', 15, C.textDim, 0.5).setOrigin(0.5, 0);

  var slots = GAME.HERO_ORDER.length + 1;   // +1 = 준비 중 슬롯
  GAME.UI.label(this, W - PAD, u * 3.0,
    GAME.HERO_ORDER.length + ' / ' + slots, 20, C.accent, 1).setOrigin(1, 0);

  // ── 탑 설명 패널 ──
  var panelY = sub.y + sub.height + u * 1.8;
  var panelW = W - PAD * 2;
  var pg = this.add.graphics();

  // floorBadge 는 PC 에서 폭 168 을 cx 기준 좌우로 반씩 쓴다 → 왼쪽 여백 안에 들어오게 둔다
  var badgeCx = PAD + 88;
  var badge = GAME.UI.floorBadge(this, badgeCx, panelY + 14, floor, { boss: !!bossDef });

  var tx = PAD + 196;
  var l1 = GAME.UI.label(this, tx, panelY + 14,
    '통곡의 탑 ' + floor + '층' + (bossDef ? ('   ☠ ' + bossDef.name) : '') +
    (rec.best ? ('      최고 ' + rec.best + '층') : '      첫 도전'),
    19, bossDef ? GAME.UI.TXT.danger : C.text, 0);
  var l2 = GAME.UI.label(this, tx, l1.y + l1.height + 5,
    '탑은 당신의 싸움을 기억한다 — 층이 오를수록 당신을 더 잘 아는 진형이 내려온다.' +
    (floor <= E ? ('  1~' + E + '층은 연습 구간, ' + (E + 1) + '층부터는 조작 없이 이길 수 없다.') : ''),
    14, C.textDim, 0).setWordWrapWidth(panelW - 160);
  var l3 = GAME.UI.label(this, tx, l2.y + l2.height + 5,
    '영웅·장비·스킬은 도전 시작에 한 번만 고른다. 이후로는 층을 깰 때마다 받는 골드로 성장한다.' +
    '   ·   ' + GAME.Tower.CHECKPOINT_EVERY + '층마다 체크포인트',
    14, GAME.UI.TXT.crit, 0).setWordWrapWidth(panelW - 160);

  var panelH = (l3.y + l3.height + 14) - panelY;
  panelH = Math.max(panelH, badge.bottom - panelY + 12);
  pg.fillStyle(GAME.UI.COL.surfaceAlt, 1);
  pg.fillRoundedRect(PAD, panelY, panelW, panelH, 12);
  pg.lineStyle(1, GAME.UI.COL.border, 1);
  pg.strokeRoundedRect(PAD, panelY, panelW, panelH, 12);
  pg.setDepth(-1);

  // ── 아래 버튼 줄 (먼저 자리를 잡아야 카드 높이를 정할 수 있다) ──
  var actH = u * 7.2;
  var actCy = H - u * 2 - actH / 2;
  var startW = Math.min(560, panelW * 0.44);

  // ── 카드 ──
  var gap = 18;
  var cardsTop = panelY + panelH + u * 2.2;
  var detailH = u * 7;                       // 카드 아래 선택 영웅 상세 한 덩이
  var cardsBottom = actCy - actH / 2 - u * 1.6 - detailH;
  var cardH = cardsBottom - cardsTop;
  var cardW = Math.floor((panelW - gap * (slots - 1)) / slots);

  var cg = this.add.graphics();
  this._heroCardG = cg;
  this._heroCards = [];

  for (var i = 0; i < slots; i++) {
    var cx = PAD + i * (cardW + gap);
    var locked = i >= GAME.HERO_ORDER.length;
    var key = locked ? null : GAME.HERO_ORDER[i];
    var card = { key: key, locked: locked, x: cx, y: cardsTop, w: cardW, h: cardH,
                 cx: cx + cardW / 2 };
    if (!locked) {
      (function (k) {
        var zone = self.add.zone(card.cx, cardsTop + cardH / 2, cardW, cardH)
          .setInteractive({ useHandCursor: true });
        zone.on('pointerover', function () { self._hoverHero = k; self._refreshHeroSelect(); });
        zone.on('pointerout', function () {
          if (self._hoverHero === k) { self._hoverHero = null; self._refreshHeroSelect(); }
        });
        zone.on('pointerdown', function () {
          if (self.heroKey === k) return;
          self.heroKey = k;
          GAME.Store.set('asymgame.lastHero', k);
          // 배치도를 **반드시 다시 짠다.** formationFor 는 새 도전일 때 영웅 카운터로
          // 진형을 구성하는데, 여기서 갱신하지 않으면 고르지도 않은 영웅용 카운터와
          // 싸우게 된다(실측: 사냥꾼을 골랐는데 rationale 이 "광전사 상대 —").
          self.formation = GAME.Tower.formationFor(self._floor, k);
          if (GAME.Sound && GAME.Sound.play) GAME.Sound.play('click');
          self._refreshHeroSelect();
        });
      })(key);
    }
    this._heroCards.push(card);
  }

  // 카드 위 글자는 Graphics 보다 나중에 만들어야 위에 올라온다
  for (var j = 0; j < this._heroCards.length; j++) {
    var c = this._heroCards[j];
    var h = c.locked ? null : GAME.HEROES[c.key];
    c.role = GAME.UI.label(this, c.x + 12, c.y + 12, h ? ('Lv.1  ' + h.trait) : '준비 중',
      13, h ? C.accent : C.textFaint, 0);
    c.name = GAME.UI.label(this, c.cx, c.y + c.h - 34, h ? h.name : '???',
      21, h ? C.text : C.textFaint, 0.5).setOrigin(0.5, 0);
  }

  // ── 선택 영웅 상세 ──
  var dy = cardsBottom + u * 1.2;
  this._heroDesc = GAME.UI.label(this, W / 2, dy, '', 15, C.text, 0.5)
    .setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(panelW - 60);
  this._heroStats = GAME.UI.label(this, W / 2, dy + 24, '', 14, C.textDim, 0.5)
    .setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(panelW - 60);

  // ── 버튼 ──
  GAME.UI.button(this, PAD + 110, actCy, 220, actH * 0.78, '← 탑 소개', function () {
    self.scene.restart({ step: 'landing' });
  }, { fontSize: 15 });

  this._startBtn = GAME.UI.button(this, W / 2, actCy, startW, actH, '', function () {
    GAME.Tower.pending = self.formation;
    self.scene.start('Draft', {
      formationId: self.formation.id, tower: floor, heroKey: self.heroKey
    });
  }, { fill: GAME.UI.COL.panelTeal, line: GAME.CONFIG.COLORS.controller,
       hover: GAME.UI.COL.panelTealHi, color: C.accent, fontSize: 22 });

  if (floor > 1) {
    GAME.UI.button(this, W - PAD - 110, actCy, 220, actH * 0.78, '1층부터 다시', function () {
      GAME.Tower.fail();
      if (GAME.TowerRun && GAME.TowerRun.get()) GAME.TowerRun.end();
      self.scene.restart({ step: 'landing' });
    }, { fontSize: 14 });
  }

  this._refreshHeroSelect();
};

// ── 폰 가로 전용 캐릭터 선택 (820×390) ──────────────────────────────────
//  PC 판은 [머리 / 설명 패널 / 카드 4장 / 상세 2줄 / 버튼줄] 5단이라 높이 390 에서
//  아래 3단이 통째로 겹쳤다(실측 겹침 10건). 폰에서는 단을 3개로 줄인다:
//    ① 한 줄 머리(뒤로·제목·슬롯수) + 한 줄 정보(층·보스·규칙)
//    ② 카드 4장 — 화면 높이의 절반 이상을 여기에 준다
//    ③ 상세 2줄 + 버튼 한 줄
//  설명 패널(3문장)은 오른쪽 정렬 한 줄로 접었다.
GAME.TowerScene.prototype._buildHeroSelectPhone = function () {
  var C = GAME.CONFIG.COLORS;
  var UI = GAME.UI;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var self = this;
  var rec = this._rec, floor = this._floor;

  this.cameras.main.setBackgroundColor(C.bg);

  var PAD = 20;
  var panelW = W - PAD * 2;
  var bossDef = GAME.Tower.bossFor(floor);
  var E = GAME.Tower.EARLY_FLOORS;
  var slots = GAME.HERO_ORDER.length + 1;

  // ── ① 머리 ──
  UI.label(this, PAD, 12, '←  탑 소개', 15, C.textDim, 0)
    .setInteractive({ useHandCursor: true })
    .on('pointerdown', function () { self.scene.restart({ step: 'landing' }); });

  UI.label(this, W / 2, 6, '캐릭터 선택', 26, C.text, 0.5).setOrigin(0.5, 0);
  UI.label(this, W - PAD, 12, GAME.HERO_ORDER.length + ' / ' + slots, 17, C.accent, 1)
    .setOrigin(1, 0);

  var infoY = 44;
  UI.label(this, PAD, infoY,
    '통곡의 탑 ' + floor + '층' + (bossDef ? ('   ☠ ' + bossDef.name) : '') +
    (rec.best ? ('   ·   최고 ' + rec.best + '층') : '   ·   첫 도전'),
    15, bossDef ? UI.TXT.danger : C.text, 0);
  UI.label(this, W - PAD, infoY,
    (floor <= E ? ('1~' + E + '층 연습 · ' + (E + 1) + '층부터 조작 필수   ·   ')
                : '영웅·장비는 도전 시작에 한 번만   ·   ') +
    GAME.Tower.CHECKPOINT_EVERY + '층마다 체크포인트',
    15, UI.TXT.crit, 1).setOrigin(1, 0);

  // ── ② 카드 ──
  var actH = 56;
  var actCy = H - 10 - actH / 2;
  var cardsTop = 68;
  var cardsBottom = actCy - actH / 2 - 8 - 44;      // 상세 2줄(44) 자리를 빼둔다
  var cardH = cardsBottom - cardsTop;
  var gap = 10;
  var cardW = Math.floor((panelW - gap * (slots - 1)) / slots);

  var cg = this.add.graphics();
  this._heroCardG = cg;
  this._heroCards = [];

  for (var i = 0; i < slots; i++) {
    var cx = PAD + i * (cardW + gap);
    var locked = i >= GAME.HERO_ORDER.length;
    var key = locked ? null : GAME.HERO_ORDER[i];
    var card = { key: key, locked: locked, x: cx, y: cardsTop, w: cardW, h: cardH,
                 cx: cx + cardW / 2, artTop: cardsTop + 28, artBot: cardsTop + cardH - 42 };
    if (!locked) {
      (function (k) {
        var zone = self.add.zone(card.cx, cardsTop + cardH / 2, cardW, cardH)
          .setInteractive({ useHandCursor: true });
        zone.on('pointerover', function () { self._hoverHero = k; self._refreshHeroSelect(); });
        zone.on('pointerout', function () {
          if (self._hoverHero === k) { self._hoverHero = null; self._refreshHeroSelect(); }
        });
        zone.on('pointerdown', function () {
          if (self.heroKey === k) return;
          self.heroKey = k;
          GAME.Store.set('asymgame.lastHero', k);
          self.formation = GAME.Tower.formationFor(self._floor, k);
          if (GAME.Sound && GAME.Sound.play) GAME.Sound.play('click');
          self._refreshHeroSelect();
        });
      })(key);
    }
    this._heroCards.push(card);
  }

  for (var j = 0; j < this._heroCards.length; j++) {
    var c = this._heroCards[j];
    var h = c.locked ? null : GAME.HEROES[c.key];
    c.role = UI.label(this, c.x + 10, c.y + 8, h ? h.trait : '준비 중',
      15, h ? C.accent : C.textFaint, 0);
    c.name = UI.label(this, c.cx, c.y + c.h - 30, h ? h.name : '???',
      19, h ? C.text : C.textFaint, 0.5).setOrigin(0.5, 0);
  }

  // ── ③ 상세 2줄 ──
  var dy = cardsBottom + 6;
  this._heroDesc = UI.label(this, W / 2, dy, '', 15, C.text, 0.5)
    .setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(panelW);
  this._heroStats = UI.label(this, W / 2, dy + 22, '', 15, C.textDim, 0.5)
    .setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(panelW);

  // ── 버튼 한 줄 ──
  UI.button(this, PAD + 70, actCy, 140, actH, '← 탑 소개', function () {
    self.scene.restart({ step: 'landing' });
  }, { fontSize: 16 });

  this._startBtn = UI.button(this, W / 2, actCy, 380, actH, '', function () {
    GAME.Tower.pending = self.formation;
    self.scene.start('Draft', {
      formationId: self.formation.id, tower: floor, heroKey: self.heroKey
    });
  }, { fill: UI.COL.panelTeal, line: GAME.CONFIG.COLORS.controller,
       hover: UI.COL.panelTealHi, color: C.accent, fontSize: 19 });

  if (floor > 1) {
    UI.button(this, W - PAD - 80, actCy, 160, actH, '1층부터 다시', function () {
      GAME.Tower.fail();
      if (GAME.TowerRun && GAME.TowerRun.get()) GAME.TowerRun.end();
      self.scene.restart({ step: 'landing' });
    }, { fontSize: 16 });
  }

  this._refreshHeroSelect();
};

GAME.TowerScene.prototype._refreshHeroSelect = function () {
  var C = GAME.CONFIG.COLORS;
  var g = this._heroCardG;
  if (!g) return;
  var self = this;
  g.clear();

  for (var i = 0; i < this._heroCards.length; i++) {
    var c = this._heroCards[i];
    var on = !c.locked && c.key === this.heroKey;
    var hov = !c.locked && c.key === this._hoverHero;
    var R = 14;

    // 카드 판
    g.fillStyle(c.locked ? GAME.UI.COL.bg
                         : (on ? GAME.UI.COL.panelTeal : (hov ? GAME.UI.COL.surfaceHi : GAME.UI.COL.surfaceAlt)), 1);
    g.fillRoundedRect(c.x, c.y, c.w, c.h, R);

    if (c.locked) {
      // 자물쇠 슬롯 — 실루엣만
      g.fillStyle(GAME.UI.COL.surfaceHi, 0.55);
      g.fillEllipse(c.cx, c.y + c.h * 0.52, c.w * 0.34, c.h * 0.42);
      g.lineStyle(2, GAME.UI.COL.border, 0.7);
      g.strokeRoundedRect(c.x, c.y, c.w, c.h, R);
      c.name.setColor(C.textFaint);
      continue;
    }

    var h = GAME.HEROES[c.key];

    // 캐릭터가 카드 밖으로 넘치지 않게 **실측한 비율**로 크기를 정한다.
    //  · 세로: sy 기준 위 3.2r ~ 아래 1.8r → 총 5r (치켜든 무기 끝 ~ 알 몸통 바닥)
    //  · 가로: 대검을 든 광전사가 가장 넓다 — 중심에서 약 2.2r
    // 처음엔 r 을 카드 높이의 20% 로 뒀다가 이름·설명문을 통째로 덮었다(실측 확인).
    // 폰 가로는 카드가 납작해 위/아래 여백 규칙이 달라진다 → 카드가 직접 지정할 수 있게 한다.
    var artTop = (c.artTop === undefined) ? c.y + 36 : c.artTop;
    var artBot = (c.artBot === undefined) ? c.y + c.h - 50 : c.artBot;
    var r = Math.min((artBot - artTop) / 5.2, (c.w * 0.5 - 8) / 2.05);
    var feetY = (artTop + artBot) / 2 + r * 0.7;   // 도형 중심이 sy - 0.7r 이라 되돌린다

    // 무대 — 인물 뒤에 옅은 원반을 깔아 카드가 '전시대'처럼 보이게
    var shadow = (GAME.UI.COL.shadow === undefined) ? 0x000000 : GAME.UI.COL.shadow;
    g.fillStyle(GAME.UI.COL.surfaceHi, on ? 0.45 : 0.3);
    g.fillEllipse(c.cx, feetY + r * 0.3, r * 2.6, r * 0.9);
    g.fillStyle(shadow, GAME.UI.IS_LIGHT ? 0.13 : 0.28);
    g.fillEllipse(c.cx, feetY + r * 0.34, r * 1.7, r * 0.4);

    // facing = +PI/2 면 dir8.front, 즉 정면(얼굴이 보인다)
    GAME.UI.drawUnitFlat(g, h, c.cx, feetY, C.controller, 1,
      r / (h.radius || 17), Math.PI / 2);

    g.lineStyle(on ? 4 : (hov ? 3 : 2), on ? C.controller : GAME.UI.COL.border, 1);
    g.strokeRoundedRect(c.x, c.y, c.w, c.h, R);

    c.name.setColor(on ? C.accent : C.text);
    c.role.setColor(on ? C.accent : C.textDim);
  }

  var sel = GAME.HEROES[this.heroKey];
  if (sel) {
    this._heroDesc.setText(sel.name + ' — ' + sel.desc);
    this._heroStats.setText(
      '체력 ' + sel.hp + '   ·   공격력 ' + sel.damage + '   ·   방어력 ' + sel.armor +
      '   ·   이동 ' + sel.speed + '   ·   사거리 ' + sel.range +
      (sel.lifesteal ? ('   ·   흡혈 ' + Math.round(sel.lifesteal * 100) + '%') : ''));
  }
  if (this._startBtn) {
    this._startBtn.text.setText(GAME.CONFIG.PHONE
      ? (this._floor + '층 도전  —  장비 세팅')
      : (this._floor + '층 도전  —  장비 & 스킬 세팅'));
  }
};

// ═══════════════════════════════════════════════════════════════════════
//  2) 도전 화면 — 예전 로비 전체(영웅 선택 / 골드 상점 / 전투 시작)
// ═══════════════════════════════════════════════════════════════════════
GAME.TowerScene.prototype._buildChallenge = function () {
  var C = GAME.CONFIG.COLORS;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var P = GAME.CONFIG.PORTRAIT;
  var self = this;
  var u = H / 100;

  if (GAME.CONFIG.PHONE) {
    // 새 도전이면 캐릭터 선택 화면이 담당한다(create 에서 이미 갈라지지만, 안전망).
    if (!this.run) { this._buildHeroSelectPhone(); return; }
    this._buildChallengePhone();
    return;
  }

  // 랜딩은 연출용 어두운 배경을 쓴다 — 여기서는 게임 본연의 테마로 되돌린다.
  this.cameras.main.setBackgroundColor(C.bg);

  var rec = this._rec, floor = this._floor, prof = this._prof;
  var budget = GAME.Tower.budgetFor(floor);

  var y = u * 5;
  function stack(label, gap) {
    y = label.y + label.height + (gap === undefined ? u * 1.6 : gap);
    return label;
  }

  var heroBudget = GAME.Tower.heroBudgetFor(floor);
  var bossDef = GAME.Tower.bossFor(floor);

  // 뒤로 — 랜딩(탑 소개 화면)으로
  GAME.UI.label(this, u * 3, u * 2.2, '←  탑 소개', P ? 13 : 13, C.textDim, 0)
    .setInteractive({ useHandCursor: true })
    .on('pointerdown', function () { self.scene.restart({ step: 'landing' }); });

  stack(GAME.UI.label(this, W / 2, y, '통곡의 탑', P ? 26 : 40, C.text, 0.5)
    .setOrigin(0.5, 0), u * 1.0);

  // 층수 배지 — 등급 색이 곧 난이도다(운빨존많겜의 등급 색 사다리를 난이도에 옮긴 것)
  var badge = GAME.UI.floorBadge(this, W / 2, y, floor, { boss: !!bossDef });
  y = badge.bottom + u * 1.2;

  // 다음 보스까지 — "10층마다 보스"라는 규칙이 눈에 보인다
  var band = GAME.UI.bandMeter(this, W / 2 - Math.min(W - 60, 300) / 2, y,
    Math.min(W - 60, 300), floor, GAME.Tower.BOSS_EVERY);
  y = band.bounds().bottom + u * 1.4;

  if (bossDef) {
    stack(GAME.UI.label(this, W / 2, y, '☠  ' + bossDef.name,
      P ? 19 : 22, GAME.UI.TXT.danger, 0.5).setOrigin(0.5, 0), u * 1.0);
  }

  stack(GAME.UI.label(this, W / 2, y,
    this.run
      ? ('적 진형 ' + budget + '   ·   내 빌드 유지 중   ·   최고 ' + (rec.best || 0) + '층')
      : ('적 진형 ' + budget + '   vs   시작 예산 ' + GAME.TowerRun.START_BUDGET +
         '   ·   최고 ' + (rec.best || 0) + '층'),
    P ? 15 : 19, C.text, 0.5)
    .setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(W - 30));

  // 연습 구간 안내는 **1~3층에서만** 보여준다.
  var E = GAME.Tower.EARLY_FLOORS;
  if (floor <= E) {
    stack(GAME.UI.label(this, W / 2, y,
      '1~' + E + '층은 연습 구간. ' + (E + 1) + '층부터는 조작 없이는 이길 수 없습니다.',
      P ? 13 : 14, C.textDim, 0.5)
      .setOrigin(0.5, 0).setAlign('center').setLineSpacing(4).setWordWrapWidth(W - 40));
  }

  var pw = Math.min(W - 30, 640);
  this.heroBtns = [];

  if (this.run) {
    // ── 도전 진행 중: 골드로 능력치를 올린다 ──
    var hero = GAME.HEROES[this.heroKey];
    stack(GAME.UI.label(this, W / 2, y,
      '내 영웅  ' + hero.name + '  (' + hero.trait + ')  —  도전 내내 유지됩니다',
      P ? 14 : 16, GAME.UI.TXT.crit, 0.5).setOrigin(0.5, 0).setWordWrapWidth(W - 30), u * 0.8);

    this.goldLabel = GAME.UI.label(this, W / 2, y, '', P ? 20 : 24, C.accent, 0.5).setOrigin(0.5, 0);
    y = this.goldLabel.y + this.goldLabel.height + u * 1.2;

    var sc = GAME.Layout.cols(2, { gap: 8, width: pw, left: (W - pw) / 2, pad: 0 });
    var rowH = Math.max(GAME.UI.BTN_H_SM || 52, u * 6);
    this.statBtns = [];
    GAME.TowerRun.STATS.forEach(function (d, i) {
      var col = sc[i % 2];
      var ry = y + Math.floor(i / 2) * (rowH + 8);
      var b = GAME.UI.button(self, col.cx, ry + rowH / 2, col.w, rowH, '', function () {
        if (GAME.TowerRun.levelUp(d.key)) {
          self.run = GAME.TowerRun.get();
          self._refreshRun(true);
        }
      }, { fontSize: P ? 13 : 14 });
      b.text.setAlign('center');
      self.statBtns.push({ def: d, btn: b });
    });
    y += Math.ceil(GAME.TowerRun.STATS.length / 2) * (rowH + 8) + u * 0.6;

    this.runHint = GAME.UI.label(this, W / 2, y,
      this._runHintText(), P ? 13 : 13, C.textDim, 0.5).setOrigin(0.5, 0).setWordWrapWidth(W - 40);
    y = this.runHint.y + this.runHint.height + u * 1.6;
  } else {
    // ── 새 도전: 영웅을 먼저 고른다 ──
    stack(GAME.UI.label(this, W / 2, y,
      '영웅을 고르세요 — 이 도전이 끝날 때까지 함께 갑니다',
      P ? 13 : 13, C.text, 0.5).setOrigin(0.5, 0).setWordWrapWidth(W - 30), u * 1.0);

    var hc = GAME.Layout.cols(GAME.HERO_ORDER.length, {
      gap: 8, width: pw, left: (W - pw) / 2, pad: 0
    });
    var heroH = u * 7;
    GAME.HERO_ORDER.forEach(function (hk, i) {
      var h = GAME.HEROES[hk];
      var b = GAME.UI.button(self, hc[i].cx, y + heroH / 2, hc[i].w, heroH,
        h.name + '\n' + h.trait, function () {
          self.heroKey = hk;
          GAME.Store.set('asymgame.lastHero', hk);
          self._refresh();
        }, { fontSize: P ? 13 : 13 });
      b.text.setAlign('center');
      self.heroBtns.push({ key: hk, btn: b });
    });
    y += heroH + u * 1.8;
  }

  // AI가 읽은 내 성향 + 이 영웅에 대한 대응 (내용 길이에 맞춰 패널을 그린다)
  var panelTop = y;
  var lx = W / 2 - pw / 2 + 14;
  var profLine = this.run
    ? (prof.battles ? ('내 성향 — ' + prof.styleLabel + ' · ' + prof.dodgeLabel)
                    : '내 성향 — 아직 기록 없음')
    : (prof.battles ? ('AI가 읽은 당신 — ' + prof.styleLabel + ' · ' + prof.dodgeLabel +
                       ' (교전거리 ' + prof.avgDist + ', ' + prof.battles + '전)')
                    : 'AI가 읽은 당신 — 아직 분석할 기록이 없습니다');
  var l1 = GAME.UI.label(this, lx, y + 10, profLine,
    P ? 13 : 13, C.crit, 0).setWordWrapWidth(pw - 28);
  this.rationaleText = GAME.UI.label(this, lx, l1.y + l1.height + 6,
    '', P ? 13 : 12, C.textDim, 0).setWordWrapWidth(pw - 28);
  this.compText = GAME.UI.label(this, lx, 0, '', P ? 13 : 12, C.accentAlt, 0)
    .setWordWrapWidth(pw - 28);
  this.panelGeo = { top: panelTop, x: W / 2, w: pw, lx: lx };
  this.panelRect = this.add.rectangle(W / 2, panelTop, pw, 10, GAME.UI.COL.surfaceAlt)
    .setStrokeStyle(1, GAME.UI.COL.border).setOrigin(0.5, 0);
  this.panelRect.setDepth(-1);

  var bw = Math.min(W - 30, 420);
  var bh = u * 7;
  var gap = u * 1.4;
  var restH = floor > 1 ? (u * 5 + gap) : 0;
  var byBottom = H - u * 2 - restH;

  if (floor > 1) {
    GAME.UI.button(this, W / 2, H - u * 2 - u * 2.5, Math.min(W - 60, 240), u * 5, '1층부터 다시', function () {
      GAME.Tower.fail();
      if (GAME.TowerRun && GAME.TowerRun.get()) GAME.TowerRun.end();
      self.scene.restart({ step: 'landing' });
    }, { fontSize: P ? 13 : 13 });
  }
  GAME.UI.button(this, W / 2, byBottom - bh * 0.5, bw, bh, '← 메뉴', function () {
    self.scene.start('Menu');
  }, { fontSize: P ? 15 : 15 });
  GAME.UI.button(this, W / 2, byBottom - bh * 1.5 - gap, bw, bh, '🏆 랭킹', function () {
    self.scene.start('Rank', { scope: 'live' });
  }, { fontSize: P ? 17 : 16 });
  this.panelMaxBottom = byBottom - bh * 2.5 - gap * 2 - (bh + u * 0.8) / 2 - 8;
  GAME.UI.button(this, W / 2, byBottom - bh * 2.5 - gap * 2, bw, bh + u * 0.8,
    this.run ? (floor + '층 전투 시작') : (floor + '층 도전 — 장비 & 스킬 세팅'), function () {
    GAME.Tower.pending = self.formation;
    if (self.run) {
      var Z = GAME.CONFIG.ZONE_CONTROLLER;
      self.scene.start('Battle', {
        formationId: self.formation.id,
        heroKey: self.run.heroKey,
        items: self.run.items,
        picks: self.run.picks,
        tower: floor,
        startPos: { x: Z.x + Z.w / 2, y: Z.y + Z.h * 0.55 }
      });
    } else {
      self.scene.start('Draft', {
        formationId: self.formation.id, tower: floor, heroKey: self.heroKey
      });
    }
  }, { fill: GAME.UI.COL.panelTeal, line: GAME.CONFIG.COLORS.controller, hover: GAME.UI.COL.panelTealHi, color: C.accent, fontSize: P ? 20 : 22 });

  this._refresh();
};

// ── 폰 가로 전용 도전 화면 (820×390, 도전 진행 중) ───────────────────────
//  PC 판은 [제목·배지·게이지·예산·영웅·골드·능력치4·힌트·성향패널·버튼3] 을 한 기둥에
//  세로로 쌓는다. 높이 390 에서는 절반이 화면 밖으로 나갔다(실측 겹침 26 · 화면밖 7).
//  좌우로 나눈다: **왼쪽 = 이번 층이 무엇인가(읽는 것), 오른쪽 = 무엇을 할 것인가(누르는 것).**
GAME.TowerScene.prototype._buildChallengePhone = function () {
  var C = GAME.CONFIG.COLORS;
  var UI = GAME.UI;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var self = this;
  var rec = this._rec, floor = this._floor;
  var budget = GAME.Tower.budgetFor(floor);
  var bossDef = GAME.Tower.bossFor(floor);

  this.cameras.main.setBackgroundColor(C.bg);

  var PAD = 18;
  var LW = 250;                        // 왼쪽 정보 기둥
  var rx = PAD + LW + 20, rw = W - PAD - rx;
  var lcx = PAD + LW / 2;

  // ── 왼쪽: 이번 층 ──
  UI.label(this, PAD, 8, '←  탑 소개', 15, C.textDim, 0)
    .setInteractive({ useHandCursor: true })
    .on('pointerdown', function () { self.scene.restart({ step: 'landing' }); });

  var badge = UI.floorBadge(this, lcx, 32, floor, { boss: !!bossDef });
  var ly = badge.bottom + 8;
  var band = UI.bandMeter(this, PAD, ly, LW, floor, GAME.Tower.BOSS_EVERY);
  ly = band.bounds().bottom + 8;

  if (bossDef) {
    var bl = UI.label(this, lcx, ly, '☠  ' + bossDef.name, 17, UI.TXT.danger, 0.5)
      .setOrigin(0.5, 0).setWordWrapWidth(LW);
    ly = bl.y + bl.height + 4;
  }
  var bl2 = UI.label(this, lcx, ly,
    '적 진형 ' + budget + '   ·   최고 ' + (rec.best || 0) + '층',
    15, C.text, 0.5).setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(LW);
  ly = bl2.y + bl2.height + 4;

  // 적 구성 — _refresh 가 채운다. rationale 은 도전 중에는 빈 문자열이라 자리만 잡아둔다.
  this.rationaleText = UI.label(this, PAD, ly, '', 15, C.textDim, 0).setWordWrapWidth(LW);
  this.compText = UI.label(this, PAD, ly, '', 15, C.accentAlt, 0).setWordWrapWidth(LW);
  this.panelGeo = null;
  this.panelRect = null;
  this.panelMaxBottom = H - 10;

  // ── 오른쪽: 무엇을 할 것인가 ──
  var hero = GAME.HEROES[this.heroKey];
  UI.label(this, rx, 10,
    '내 영웅  ' + hero.name + '  (' + hero.trait + ')  —  도전 내내 유지', 15, UI.TXT.crit, 0)
    .setWordWrapWidth(rw);

  this.goldLabel = UI.label(this, rx, 32, '', 24, C.accent, 0);
  this.runHint = UI.label(this, W - PAD, 40, '', 15, C.textDim, 1).setOrigin(1, 0);

  var secH = 56, secTop = H - 12 - secH;
  var mainH = 66, mainTop = secTop - 10 - mainH;
  var rowH = 62, rowGap = 10;
  var gridTop = mainTop - 12 - (rowH * 2 + rowGap);
  var sc = GAME.Layout.cols(2, { gap: 12, width: rw, left: rx, pad: 0 });

  this.statBtns = [];
  GAME.TowerRun.STATS.forEach(function (d, i) {
    var col = sc[i % 2];
    var ry = gridTop + Math.floor(i / 2) * (rowH + rowGap);
    var b = UI.button(self, col.cx, ry + rowH / 2, col.w, rowH, '', function () {
      if (GAME.TowerRun.levelUp(d.key)) {
        self.run = GAME.TowerRun.get();
        self._refreshRun(true);
      }
    }, { fontSize: 15 });
    b.text.setAlign('center');
    self.statBtns.push({ def: d, btn: b });
  });

  UI.button(this, rx + rw / 2, mainTop + mainH / 2, rw, mainH, floor + '층 전투 시작', function () {
    GAME.Tower.pending = self.formation;
    var Z = GAME.CONFIG.ZONE_CONTROLLER;
    self.scene.start('Battle', {
      formationId: self.formation.id,
      heroKey: self.run.heroKey,
      items: self.run.items,
      picks: self.run.picks,
      tower: floor,
      startPos: { x: Z.x + Z.w / 2, y: Z.y + Z.h * 0.55 }
    });
  }, { fill: UI.COL.panelTeal, line: GAME.CONFIG.COLORS.controller,
       hover: UI.COL.panelTealHi, color: C.accent, fontSize: 21 });

  var keys = ['rank', 'menu'];
  if (floor > 1) keys.push('reset');
  var bc = GAME.Layout.cols(keys.length, { gap: 10, width: rw, left: rx, pad: 0 });
  for (var i = 0; i < keys.length; i++) {
    (function (k, col) {
      if (k === 'rank') {
        UI.button(self, col.cx, secTop + secH / 2, col.w, secH, '🏆 랭킹', function () {
          self.scene.start('Rank', { scope: 'live' });
        }, { fontSize: 16 });
      } else if (k === 'menu') {
        UI.button(self, col.cx, secTop + secH / 2, col.w, secH, '← 메뉴', function () {
          self.scene.start('Menu');
        }, { fontSize: 16 });
      } else {
        UI.button(self, col.cx, secTop + secH / 2, col.w, secH, '1층부터 다시', function () {
          GAME.Tower.fail();
          if (GAME.TowerRun && GAME.TowerRun.get()) GAME.TowerRun.end();
          self.scene.restart({ step: 'landing' });
        }, { fontSize: 16 });
      }
    })(keys[i], bc[i]);
  }

  this._refresh();
};

// 도전 중 골드·능력치 표시 갱신. bump=true 면 골드 숫자가 튕기는 연출을 준다.
GAME.TowerScene.prototype._refreshRun = function (bump) {
  if (!this.run || !this.goldLabel) return;
  var C = GAME.CONFIG.COLORS;
  var self = this;
  var TR = GAME.TowerRun;

  this.goldLabel.setText('💰 골드  ' + this.run.gold);
  if (bump) {
    this.goldLabel.setScale(1.25);
    this.tweens.add({ targets: this.goldLabel, scale: 1, duration: 260, ease: 'Back.easeOut' });
  }

  var bonus = TR.statBonus(this.run);
  this.statBtns.forEach(function (s) {
    var d = s.def;
    var lv = self.run.levels[d.key] || 0;
    var maxed = lv >= d.max;
    var cost = TR.costOf(d.key, lv);
    var can = !maxed && self.run.gold >= cost;
    s.btn.text.setText(d.name + '  Lv.' + lv + (maxed ? ' (최대)' : '')
      + '\n' + (maxed ? ('+' + bonus[d.key]) : ('+' + bonus[d.key] + '  →  ' + cost + '골드')));
    s.btn.text.setColor(can ? C.accent : C.textDim);
    s.btn.rect.setStrokeStyle(can ? 2 : 1, can ? C.controller : GAME.UI.COL.borderUi);
    s.btn.rect.setFillStyle(can ? GAME.UI.COL.panelTeal : GAME.UI.COL.surfaceAlt);
  });

  if (this.runHint) this.runHint.setText(this._runHintText());
};

// 도전 중 장비 요약 한 줄
GAME.TowerScene.prototype._runHintText = function () {
  var rec = this.run || (GAME.TowerRun && GAME.TowerRun.get());
  if (!rec) return '';
  var it = rec.items || {};
  var worn = GAME.ITEM_SLOTS.map(function (s) {
    var k = it[s.key];
    return k ? GAME.Items.find(s.key, k).name : null;
  }).filter(Boolean);
  return '장비 ' + (worn.length ? worn.join(' · ') : '없음') + '  ·  층을 깰 때마다 골드 획득';
};

GAME.TowerScene.prototype._refresh = function () {
  var C = GAME.CONFIG.COLORS;
  var self = this;

  if (this.run) { this._refreshRun(false); }

  this.heroBtns.forEach(function (h) {
    var on = h.key === self.heroKey;
    h.btn.rect.setStrokeStyle(on ? 2 : 1, on ? GAME.CONFIG.COLORS.controller : GAME.UI.COL.borderUi);
    h.btn.rect.setFillStyle(on ? GAME.UI.COL.panelTeal : GAME.UI.COL.surfaceAlt);
    h.btn.text.setColor(on ? C.accent : C.text);
  });

  this.rationaleText.setText(this.run ? '' : ('이 층의 대응: ' + this.formation.rationale));

  var counts = {};
  this.formation.units.forEach(function (x) { counts[x.type] = (counts[x.type] || 0) + 1; });
  var keys = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
  function compFor(n) {
    var t = keys.slice(0, n).map(function (k) {
      return GAME.UNITS[k].name + ' ×' + counts[k];
    }).join('   ');
    if (keys.length > n) t += '  외 ' + (keys.length - n) + '종';
    return t;
  }
  var comp = compFor(keys.length);
  // 빈 라벨도 Phaser 에서는 한 줄 높이를 갖는다 — 도전 중(rationale 없음)에 그 25px 가
  // 그대로 빈 띠로 남았다. 내용이 있을 때만 밀어낸다.
  var ratH = String(this.rationaleText.text) ? (this.rationaleText.height + 6) : 0;
  this.compText.setY(this.rationaleText.y + ratH);
  this.compText.setText('적 ' + this.formation.units.length + '기 — ' + comp);

  if (this.panelMaxBottom) {
    var n = keys.length;
    while (n > 1 && this.compText.getBounds().bottom > this.panelMaxBottom) {
      n--;
      this.compText.setText('적 ' + this.formation.units.length + '기 — ' + compFor(n));
    }
    var guard = 0;
    while (this.compText.getBounds().bottom > this.panelMaxBottom && guard++ < 80) {
      var s = String(this.rationaleText.text).replace(/…$/, '');
      if (s.length <= 16) break;
      this.rationaleText.setText(s.slice(0, -4) + '…');
      this.compText.setY(this.rationaleText.y + this.rationaleText.height + 6);
    }
  }

  if (this.panelRect && this.panelGeo) {
    var bottom = this.compText.getBounds().bottom + 10;
    this.panelRect.setSize(this.panelGeo.w, Math.max(20, bottom - this.panelGeo.top));
  }
};
