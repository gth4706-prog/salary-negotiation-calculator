window.GAME = window.GAME || {};

GAME.BattleScene = function () {
  Phaser.Scene.call(this, { key: 'Battle' });
};
GAME.BattleScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.BattleScene.prototype.constructor = GAME.BattleScene;

GAME.BattleScene.prototype.init = function (data) {
  this.formation = GAME.Formations.getById(data.formationId);
  this.heroKey = data.heroKey;
  this.items = data.items || {};
  this.picks = data.picks || GAME.defaultSkillPicks();
  this.tower = data.tower || 0;      // 통곡의 탑 층수 (0이면 일반 대전)
  this.versus = !!data.versus;       // 대전(비동기 PvP) 공격 — 승패로 트로피가 오간다
  // ── 시험 판 (2026-07-30, 사용자 지시) ─────────────────────────────────────
  //  내 전장을 내가 쳐 보는 연습이다. **아무것도 기록하지 않는다** —
  //  점수·트로피·배치도 전적·서버 격파율 넷 다. 자기 전장을 상대로 기록이 쌓이면
  //  격파율·랭킹이 통째로 거짓이 되기 때문이다(혼자서 무한히 올릴 수 있다).
  //  기록을 거르는 곳을 **한 군데로 모은다** — 갈라놓으면 하나를 빼먹는다.
  this.test = !!data.test;
  this.startPos = data.startPos || { x: 600, y: 590 };
  this.ended = false;
  this.markers = [];

  // 휠 줌 상태 — **씬 인스턴스는 재사용된다.** 여기서 되돌리지 않으면 다음 판이
  // 확대된 채로 시작하고, 파괴된 컨테이너/마스크를 참조하게 된다(이 저장소의 단골 사고).
  this._zoom = 1;
  this._zoomOff = { x: 0, y: 0 };
  this._zoomRect = null;
  this.worldLayer = null;
  this._zoomMask = null;
  this._zoomMaskG = null;
  this._onWheel = null;

  // ── 동전·라운드 종료 유예 (씬 인스턴스는 재사용된다 → 여기서 전부 되돌린다) ──
  // 파괴된 Text/Graphics 는 여전히 truthy 라 `if (!this.x)` 지연생성 가드를 통과한다.
  // 이 저장소에서 이미 여러 번 터진 유형이다.
  this._coins = null;
  this._goldG = null;
  this._goldTxt = null;
  this._goldShown = null;
  this._goldBase = 0;
  this._goldPop = 0;
  this._goldW = -1;
  this._endBanner = null;
  this._endHold = -1;        // -1 = 아직 유예에 안 들어감
  this._endElapsed = 0;
  this._endShown = -1;
};

GAME.BattleScene.prototype.create = function () {
  var C = GAME.CONFIG.COLORS;
  var self = this;

  this.cameras.main.setBackgroundColor(C.bg);
  this.g = this.add.graphics();

  // ── 휠 줌용 '전장 레이어' (PC 전용) ────────────────────────────────────
  // 전장 그림만 한 겹(worldLayer)에 담는다. 확대는 이 레이어의 스케일·오프셋으로만
  // 일어나므로 HUD·스킬바·사이렌·종료막은 **구조적으로** 같이 커질 수 없다.
  // 터치 기기는 아무것도 만들지 않는다 — 핀치 줌은 이번 범위가 아니다.
  this._zoomOn = !GAME.isTouch;
  if (this._zoomOn) {
    this.worldLayer = this.add.container(0, 0);
    this.worldLayer.add(this.g);
  }

  this.state = GAME.Combat.createState();

  // 난이도 — 탑은 층수로, 일반 대전은 격파 횟수(escalation)로 강해진다
  var lrec = GAME.Learn.get(this.formation.id);
  this.escalation = this.tower ? (this.tower - 1) : (lrec.escalation || 0);
  var mods = this.tower ? GAME.Tower.modsFor(this.tower)
                        : GAME.Learn.escalationMods(this.escalation);

  // ── 층 조건 훅을 state 에 싣는다 (2026-07-30 대개편) ─────────────────────
  //  배수로 표현되는 조건(철벽·질풍·좁은눈)은 위 `mods` 에 이미 곱해져 있고,
  //  **시간·처치순서·추격·물약** 처럼 배수로 못 쓰는 것은 전투가 매 프레임 읽어야 한다.
  //  `state.towerRule` 이 그 통로다 — 없으면 combat.js 는 아무 일도 하지 않는다.
  //  ⚠ 탑이 아닌 모드(대전·방어전)에는 절대 싣지 않는다. 조건은 탑의 것이다.
  this.towerRule = this.tower && GAME.TowerRule
    ? GAME.TowerRule.hooksFor(this.tower) : null;
  this.state.towerRule = this.towerRule;
  this.towerRuleInfo = this.tower && GAME.TowerRule
    ? GAME.TowerRule.ruleFor(this.tower) : null;
  // 층 목표는 **유닛이 다 만들어진 뒤** 붙여야 한다(우두머리를 고르려면 적이 있어야 한다).
  // → 아래 진형 생성이 끝난 자리에서 `TowerObjective.attach` 를 부른다.
  var bias = (lrec.adapt && lrec.adapt.rallyBias) || 0;

  // 이 배치도의 유닛 등급 — 내 기지면 내 기록, 남의 기지면 서버가 실어 준 값.
  var fUnitLv = this.formation.unitLv ||
    ((this.versus && GAME.ArenaBuild &&
      this.formation.id === (GAME.Arena.get() || {}).baseId)
      ? GAME.ArenaBuild.get().unitLv : null) || {};

  for (var i = 0; i < this.formation.units.length; i++) {
    var e = this.formation.units[i];
    if (!GAME.UNITS[e.type]) continue;
    var w = GAME.Formations.toWorld(e);
    // 학습(rallyBias): 영웅이 자주 들어오던 쪽으로 진형을 조금 기울인다
    var wx = w.x + bias * GAME.CONFIG.ARENA.w * 0.06;
    wx = Math.max(GAME.CONFIG.ARENA.x + 20, Math.min(GAME.CONFIG.ARENA.right - 20, wx));
    // 대전 진형은 **그 사람이 예산으로 산 등급**으로 선다(js/arenabuild.js).
    // 원격 행이 unitLv 를 안 실어 보내면(옛 서버) 전부 Lv.1 이라 예전과 같다.
    var ulv = fUnitLv[e.type] || 1;
    if (ulv > 1 && GAME.UnitLevel && GAME.UnitLevel.createUnitAt) {
      // 레벨 배수와 층 강화(mods)를 **곱해서** 한 번에 만든다(createUnitAt 참조).
      this.state.units.push(
        GAME.UnitLevel.createUnitAt(e.type, wx, w.y, 'strategist', ulv, mods));
      continue;
    }
    this.state.units.push(GAME.Combat.createUnit(e.type, wx, w.y, 'strategist', mods));
  }

  this.hero = GAME.Combat.createHero(
    this.heroKey, this.startPos.x, this.startPos.y, 'controller', this.items, this.picks);

  // 통곡의 탑 도전 중이면 **층을 깨며 올린 능력치 레벨**을 얹는다.
  // 장비(items)는 이미 createHero 가 반영했고, 레벨업은 그 위에 더해지는 성장분이다.
  if (this.tower && GAME.TowerRun && GAME.TowerRun.get()) {
    var bonus = GAME.TowerRun.statBonus();
    var d = this.hero.def;
    if (bonus.damage) d.damage += bonus.damage;
    if (bonus.armor) d.armor += bonus.armor;
    if (bonus.speed) d.speed += bonus.speed;
    if (bonus.hp) {
      d.hp += bonus.hp;
      this.hero.maxHp = d.hp;
      this.hero.hp = d.hp;
    }
    this.runBonus = bonus;
    // ── 축복 (towerboon.js) ────────────────────────────────────────────────
    //  레벨업(위)이 숫자를 키운다면 축복은 **행동을 바꾼다**. 둘은 다른 축이다.
    //  스탯 배수는 여기서 def 에 얹고, 행동 훅은 state 를 통해 전투가 매 프레임 읽는다.
    if (GAME.TowerBoon) {
      GAME.TowerBoon.applyDefMods(this.hero, GAME.TowerRun.get());
      this.state.boons = GAME.TowerBoon.hooksFor(GAME.TowerRun.get());
      this.boonList = GAME.TowerBoon.owned(GAME.TowerRun.get());
    }
  }
  // 대전 컨트롤러 — 같은 예산에서 산 능력치 강화를 같은 규칙으로 얹는다.
  // ⚠ 탑과 **같은 계산식**(add × 레벨)을 쓴다. 두 곳이 갈라지면 같은 이름의 강화가
  //   모드마다 다른 값이 되어 플레이어가 배운 것이 거짓이 된다.
  if (this.versus && GAME.ArenaBuild) {
    var ab = GAME.ArenaBuild.statBonus();
    var ad = this.hero.def;
    if (ab.damage) ad.damage += ab.damage;
    if (ab.armor) ad.armor += ab.armor;
    if (ab.speed) ad.speed += ab.speed;
    if (ab.hp) {
      ad.hp += ab.hp;
      this.hero.maxHp = ad.hp;
      this.hero.hp = ad.hp;
    }
    this.runBonus = ab;
  }

  this.state.units.push(this.hero);
  // 처치 보상 골드 — **영웅까지 units 에 들어간 뒤에** 훅을 건다.
  // 훅을 걸었는데 한 번도 안 불리면 towerrun.js 가 경고를 내고 옛 방식(층 총액)으로 돌아간다.
  if (this.tower && GAME.TowerRun && GAME.TowerRun.get()) {
    GAME.TowerRun.attachKillGold(this.state, this.tower);
  }
  // 층 목표 — **유닛이 다 만들어진 지금** 붙인다('우두머리'를 고르려면 적이 있어야 한다).
  // 목표가 없는 층이면 null 이라 전투는 예전처럼 전멸 판정만 쓴다.
  if (this.tower && GAME.TowerObjective) {
    GAME.TowerObjective.attach(this.state, this.tower);
  }
  // 탑 전용 정예 — 조건이 `elite` 훅을 켰으면 적 한 기를 승격한다.
  if (this.tower && GAME.TowerElite) {
    GAME.TowerElite.attach(this.state, this.towerRule);
  }
  // 내가 모는 유닛 — 머리 위 표식과 발밑 링의 대상이고, y 정렬에서도 빼 맨 위에 그린다.
  // (색은 더 이상 빨강이 아니다 — 흰 채움 + 잉크 테두리 2톤이다. `UI.selectArrow` 주석 참조)
  this.arrowOn = this.hero;

  // 학습형 AI: 이 배치도가 지금까지 배운 적응값을 전투에 적용한다
  // 학습값(배치도별로 쌓인 것) + 층 전술(통곡의 탑 전용). 큰 쪽을 쓴다 —
  // 곱하면 고층에서 두 배로 세져 곡선이 통제 불능이 된다(tower.js mergeTactics 참조).
  this.state.adapt = GAME.Tower.mergeTactics(
    GAME.Learn.get(this.formation.id).adapt, this.formation.tactics);
  // 탑이 **나를 상대로 배운 것**을 한 겹 더 얹는다(계정별로 쌓인다).
  // 층 전술은 누구에게나 같지만 이건 나에게만 맞춰진 값이다.
  if (this.tower && GAME.TowerLearn) {
    this.state.adapt = GAME.Tower.addTactics(this.state.adapt, GAME.TowerLearn.adaptFor());
  }
  this.state.telemetry.medicPlaced = this.formation.units.some(function (u) {
    return GAME.UNITS[u.type] && GAME.UNITS[u.type].healRadius;
  });
  this.state.telemetry.guardPlaced = this.formation.units.some(function (u) {
    return GAME.UNITS[u.type] && GAME.UNITS[u.type].intercept;
  });
  // 교전 가능한 전략가 유닛 수 — 몇 기가 실제로 영웅을 때렸는지와 비교해 학습한다
  this.state.telemetry.strategistUnits =
    GAME.Combat.aliveCount(this.state, 'strategist');

  this.input.mouse.disableContextMenu();
  this.ctrl = new GAME.InputController(this, this.state, this.hero);

  // ── HUD ──
  // 레퍼런스(탕탕특공대)의 구조: **타이머를 가장 큰 숫자로 두고 그 아래 진행 바**,
  // 체력은 글자가 아니라 칸막이 게이지로 읽는다. 보스가 있으면 전용 바가 하나 더 붙어
  // "무엇을 죽여야 하는지"가 목표로 보인다.
  var P = GAME.CONFIG.PORTRAIT;
  // 폰 가로(820×390). 세로와 **같은 겹침 구성**을 쓰지만 배치가 다르다 —
  // 높이 390 에는 아레나 아래로 HUD 를 쌓을 자리가 아예 없다(체력바가 화면 밖으로 잘렸다).
  var PHONE = GAME.CONFIG.PHONE;
  var padMode0 = GAME.isTouch && (P || PHONE);

  // 세로 터치: 전장을 화면 거의 전체로 키우고(HUD 위 · 버튼은 전장 위에 겹침),
  // 손가락 두 개 이상을 동시에 받도록 포인터를 늘린다(이동+스킬 동시 입력).
  // 씬을 나갈 때 반드시 되돌린다 — 배치 화면은 HUD 가 아레나 아래에 있어 이 모드면 깨진다.
  // (아레나 시작 y 는 HUD 를 만든 뒤 **실측 바닥**으로 다시 잡는다 — 아래 참조)
  GAME.Iso.setMode('default');
  if (padMode0) {
    this.events.once('shutdown', function () { GAME.Iso.setMode('default'); });
    this.input.addPointer(2);          // 기본 1개 + 2개 = 스틱 + 버튼 2개 동시
  }

  var L = GAME.Layout;
  var hud = L.hud();
  var W = GAME.CONFIG.WIDTH;

  // 이번 판의 '등급'. 뽑기가 없는 게임이라 등급은 **난이도**에 붙인다.
  var tierObj = this.tower
    ? GAME.UI.tierForFloor(this.tower, !!this.formation.boss)
    : GAME.UI.tierForEscalation(this.escalation);
  var tierLabel = this.tower
    ? ('탑 ' + this.tower + '층 · ' + tierObj.name)
    : ('난이도 ' + this.escalation + '단계 · ' + tierObj.name);
  // ── 층 조건·목표를 배지에 붙인다 (2026-07-30 대개편) ─────────────────────
  //  싸우는 **중에** 규칙을 모르면 배울 수 없다. "왜 갑자기 아프지"로 끝나면
  //  조건은 난이도일 뿐이고, 이름이 보여야 다음 판에 대응이 된다.
  //  ⚠ 짧게 — 이름만 붙인다. 설명은 층 화면에서 이미 읽었다.
  if (this.towerRuleInfo) tierLabel += ' · ⚠' + this.towerRuleInfo.label;
  //  목표는 **조건보다 중요하다** — 무엇을 해야 이기는지 모르면 아무것도 못 한다.
  //  그래서 이름만이 아니라 설명까지 붙인다(짧게 유지되도록 desc 를 그렇게 썼다).
  if (this.state.objective) tierLabel += ' · 🎯' + this.state.objective.label;

  // 세로 터치·폰 가로에서는 HUD 를 **맨 위**에 둔다(아레나는 그 아래에서 시작).
  this.hud = GAME.UI.battleHud(this, {
    top: PHONE ? 2 : (padMode0 ? 6 : hud.top),
    boss: !!this.formation.boss,
    tierIndex: tierObj.i,
    tierLabel: tierLabel
  });

  // HUD 를 위에 깔았으니 그 **실측 바닥** 아래부터 아레나를 펼친다.
  // 보스 층은 HUD 가 30px 더 높다 — 고정값으로 잡으면 그때만 전장이 HUD 를 파고든다.
  if (padMode0) GAME.Iso.setMode('full', this.hud.bottom + (PHONE ? 4 : 8));

  // HUD 높이는 보스 유무로 달라진다 → **실측 높이**를 첫 행으로 넣어 아래를 밀어낸다.
  // 손으로 y 를 박으면 보스 층에서만 조용히 겹친다.
  //
  // padMode(세로 터치)는 스킬바를 안 만드므로 **높이를 예약하지도 않는다.**
  // 예약해 두는 바람에 힌트가 조작 패드 쪽으로 102px 밀려 있었다.
  var padMode = GAME.isTouch && (P || PHONE);
  var rowSpec = [{ name: 'hudBlock', h: this.hud.height, gap: P ? 10 : 12 }];
  if (!padMode) rowSpec.push({ name: 'skills', h: P ? 92 : 96, gap: P ? 10 : 12 });
  rowSpec.push({ name: 'hint', h: P ? 34 : 20, gap: 0 });
  var rows = L.rows(rowSpec);

  // 스킬 바 5칸(QWER + 물약).
  // **세로 터치에서는 만들지 않는다** — 오른쪽 원형 패드가 같은 역할을 하고,
  // 둘 다 두면 좁은 세로 화면에서 전장이 그만큼 줄어든다(중복 조작면).
  var cols = L.cols(5, { gap: P ? 6 : 10, max: 104 });
  var boxH = rows.skills ? rows.skills.h : 0;
  this.skillBoxes = [];
  var slots = padMode ? [] : ['Q', 'W', 'E', 'R'];
  for (var s = 0; s < slots.length; s++) {
    (function (slot, idx) {
      var c = cols[idx], cy = rows.skills.cy;
      var rect = self.add.rectangle(c.cx, cy, c.w, boxH, GAME.UI.COL.surface).setStrokeStyle(1, GAME.UI.COL.border);
      rect.setInteractive({ useHandCursor: true });
      rect.on('pointerdown', function () { self.ctrl.armSkill(slot); });
      // PC 는 키보드가 있으니 슬롯 글자(QWER)를 **그대로 둔다**(사용자 지시).
      // 대신 설명을 얹는다 — 칸 오른쪽 위에 성격 한 낱말(폰 버튼과 같은 어휘),
      // 자세한 문장은 마우스를 올렸을 때만.
      rect.on('pointerover', function () { self._showSkillTip(slot); });
      rect.on('pointerout', function () { self._hideSkillTip(); });
      // 쿨다운 시계 — 폰 원형 버튼과 **같은 그림**을 PC 에도 둔다(사용자 지시 3번).
      // 칸이 네모라 부채꼴만 따로 원으로 그린다. 숫자(0.1초 단위) 바로 뒤에 겹쳐
      // 두므로 '숫자를 감싼 시계'로 읽힌다. 깊이는 칸과 글자 사이.
      var clockR = Math.min(c.w, boxH) * 0.34;
      var clock = self.add.graphics().setDepth((rect.depth || 0) + 1);
      self.skillBoxes.push({
        slot: slot, rect: rect, clock: clock, clockR: clockR, clockX: c.cx, clockY: cy,
        key: GAME.UI.label(self, c.x + 6, rows.skills.y + 4, GAME.isTouch ? '' : slot, 14, C.accent, 0),
        kind: GAME.UI.label(self, c.x + c.w - 6, rows.skills.y + 4, '', P ? 13 : 12, C.textDim, 0).setOrigin(1, 0),
        name: GAME.UI.label(self, c.cx, rows.skills.bottom - 14, '', P ? 13 : 12, C.text, 0.5)
          .setOrigin(0.5).setDepth((rect.depth || 0) + 2),
        // ⚠ 시계(Graphics)가 깊이 +1 이라 **글자를 덮는다.** 라벨을 그 위로 올린다 —
        //   안 올리면 쿨 중에 숫자가 부채꼴 뒤로 사라진다.
        cd: GAME.UI.label(self, c.cx, cy, '', P ? 17 : 20, C.text, 0.5)
          .setOrigin(0.5).setDepth((rect.depth || 0) + 2)
      });
    })(slots[s], s);
  }

  // 마우스를 올렸을 때 뜨는 스킬 설명. 칸 너비가 104px 뿐이라 설명 문장
  // ("주변 88 광역 50 + 넉백 · 쿨 11초" = 실측 약 170px)은 상시로는 물리적으로 안 들어간다.
  // → 스킬바 **위쪽**에 한 줄로 띄우고 평소에는 숨긴다(숨김 상태라 겹침 감사에도 안 걸린다).
  // 설명 문장은 준비 화면과 **같은 함수**를 쓴다(GAME.skillDesc). 복제하면 두 곳이 어긋난다.
  if (!padMode) {
    // ⚠ 스킬바 **바로 위**는 HUD(체력 막대)다 — 거기 띄우면 체력 위에 겹친다(실측으로 겪음).
    //   HUD 블록보다 더 위, 전장 아래 끝에 붙인다.
    this._skillTipY = Math.max(40, rows.hudBlock.y - 6);
    this.skillTipBg = this.add.rectangle(W / 2, this._skillTipY, 10, 10, GAME.UI.COL.surfaceAlt)
      .setStrokeStyle(1, GAME.UI.COL.borderUi).setOrigin(0.5, 1).setDepth(960).setVisible(false);
    // 세로(420px)에서는 한 줄이 화면보다 길다 → 줄바꿈시키고 배경 높이를 글자에 맞춘다.
    this.skillTipText = GAME.UI.label(this, W / 2, this._skillTipY - 6, '', P ? 13 : 14, C.text, 0.5)
      .setOrigin(0.5, 1).setDepth(961).setVisible(false)
      .setAlign('center').setWordWrapWidth(W - 32);
  }

  if (!padMode) {
    var pc = cols[4];
    var prect = this.add.rectangle(pc.cx, rows.skills.cy, pc.w, boxH, GAME.UI.COL.surface).setStrokeStyle(1, GAME.UI.COL.border);
    prect.setInteractive({ useHandCursor: true });
    prect.on('pointerdown', function () { GAME.Combat.usePotion(self.hero, self.state); });
    GAME.UI.label(this, pc.x + 6, rows.skills.y + 4, GAME.isTouch ? '' : 'F', 14, C.accent, 0);
    this.potionText = GAME.UI.label(this, pc.cx, rows.skills.cy, '', P ? 17 : 15, C.text, 0.5).setOrigin(0.5);
    GAME.UI.label(this, pc.cx, rows.skills.bottom - 14, '물약', P ? 13 : 12, C.text, 0.5).setOrigin(0.5);
  }

  // 폰 가로에서는 상시 안내를 아예 만들지 않는다. 아레나가 화면을 다 쓰므로
  // rows.hint 는 화면 밖(y≈440)이고, 버튼에 '공격/Q/W/E/R/물약' 이 이미 적혀 있다.
  if (!PHONE) {
    this.hintText = GAME.UI.label(this, W / 2, rows.hint.y, this._hintDefault(), P ? 13 : 13, GAME.CONFIG.COLORS.textFaint, 0.5)
      .setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(W - hud.pad * 2);
  }

  // 떠오르는 피해 숫자 — Text 를 미리 만들어 돌려 쓴다(매 프레임 생성은 비싸다).
  // 흰 글자 + 검정 테두리는 어두운 배경 전제였다. 밝은 목초지 위에서는
  // 흰 글자가 배경과 2.1:1 밖에 안 나와 테두리만 보이고 숫자가 안 읽혔다.
  // → 라이트 테마에서는 **어두운 글자 + 밝은 테두리**로 뒤집는다(만화 말풍선과 같은 원리).
  var numLight = GAME.UI.IS_LIGHT;
  this.numFill = numLight ? '#2A2114' : '#ffffff';
  this.numStroke = numLight ? (GAME.UI.TXT.textOutline || '#FFFCF0') : '#000000';
  this.numHeroFill = numLight ? '#8E1520' : '#ff8f8f';
  // **내가 맞은 피해**는 일부러 눈에 덜 띄게 한다(요청). 읽히기는 해야 하므로
  // 크림 배경 대비 4.6:1 을 유지하는 선에서 채도를 뺀 흙색을 쓴다.
  this.numTakenFill = numLight ? '#7A6A58' : '#9a8f8c';
  // 이 화면에서 '영웅'이 곧 플레이어인가. 수성의 탑/방어전은 플레이어가 전략가라
  // 영웅이 적이다 → 강조 대상이 뒤집힌다(defend.js 가 false 로 덮어쓴다).
  this._heroIsPlayer = true;
  this.numPool = [];
  for (var n = 0; n < 26; n++) {
    var numTxt = this.add.text(0, 0, '', {
      fontFamily: GAME.CONFIG.FONT, fontSize: '18px', color: this.numFill,
      stroke: this.numStroke, strokeThickness: 4
    }).setOrigin(0.5).setVisible(false);
    // 피해 숫자는 전장의 일부다 — 확대하면 전장과 같이 움직여야 한다.
    // (drawNumbers 는 그대로 둔다. 레이어가 좌표를 대신 변환한다)
    if (this.worldLayer) this.worldLayer.add(numTxt);
    this.numPool.push(numTxt);
  }

  // 모바일 조작 패드(왼쪽 스틱 + 오른쪽 원형 버튼) — 세로와 **폰 가로** 둘 다.
  // 데스크톱 가로에서는 마우스+키보드가 더 정확하므로 띄우지 않는다.
  if (GAME.isTouch && (P || PHONE)) {
    this.pad = new GAME.TouchPad(this, this.ctrl);
    this.ctrl.pad = this.pad;
  }

  // ── 동전 밭 ──────────────────────────────────────────────────────────────
  // `state.killGoldEvents` 가 있을 때만(= 통곡의 탑 도전 중) 만든다. 일반 대전에는
  // 처치 골드 자체가 없으므로 동전도 없어야 한다 — 없는 보상을 뿌리면 거짓말이 된다.
  if (this.state.killGoldEvents && GAME.Coins) {
    this._coins = GAME.Coins.create(this, this.state);
    this._goldBase = (GAME.TowerRun.get() || {}).gold || 0;
    this._buildGoldHud();
  }

  // 휠 줌은 **모든 배치가 끝난 뒤** 붙인다 — 아레나 사각형(Iso.setMode 반영본)이 필요하다.
  this._setupZoom();

  this.events.on('shutdown', function () {
    // 파괴된 Phaser 객체는 여전히 truthy 라 `_sirenG || _buildSiren()` 가드를 통과한다.
    // 이 저장소에서 이미 한 번 터진 유형이라 참조를 반드시 끊는다.
    self._sirenG = null;
    self._sirenArmed = undefined;
    self._shakeAt = undefined;
    self._stopAt = undefined;
    self._prevCd = null;
    // 줌은 씬을 떠날 때 반드시 1.0 으로 되돌린다(투영을 안 되돌려 겪은 사고가 이미 있다).
    self.resetZoom();
    if (self._onWheel) { self.input.off('wheel', self._onWheel); self._onWheel = null; }
    if (self._zoomMaskG) { self._zoomMaskG.destroy(); self._zoomMaskG = null; }
    self._zoomMask = null;
    self.worldLayer = null;
    self._zoomRect = null;
    if (self.cameras && self.cameras.main) self.cameras.main.setZoom(1);
    // 동전 계층 — 팝업 Text 까지 전부 파괴하고 참조를 끊는다
    if (self._coins) { self._coins.destroy(); self._coins = null; }
    if (self._goldG) { self._goldG.destroy(); self._goldG = null; }
    if (self._goldTxt) { self._goldTxt.destroy(); self._goldTxt = null; }
    if (self._endBanner) { self._endBanner.destroy(); self._endBanner = null; }
    self._goldShown = null;
    self._endHold = -1;
    self._endShown = -1;
    if (self.ctrl) self.ctrl.destroy();
    if (self.pad) { self.pad.destroy(); self.pad = null; }
    if (self.hud) { self.hud.destroy(); self.hud = null; }
  });
};

// ── 우상단 총 골드 배지 ─────────────────────────────────────────────────────
//  "우측 상단에 총 골드도 보이게 해줘"(요청).
//
//  자리 잡기가 이 화면의 함정이다. 프로필마다 HUD 가 있는 곳이 다르다:
//   · PC(1340×900)·세로 비터치 — HUD 는 **아레나 아래**에 있고 화면 맨 위(0~66)가 비어 있다.
//   · 폰 가로(820×390)·세로 터치 — HUD 가 **화면 맨 위**를 띠로 덮고 '남은 적 N기'와
//     보스 바가 이미 우상단에 있다. → 그 실측 바닥(hud.bottom) **아래**로 내려간다.
//  두 경우를 한 식으로 쓰면 반드시 한쪽이 겹친다(이 저장소가 반복해서 겪은 사고다).
GAME.BattleScene.prototype._buildGoldHud = function () {
  var W = GAME.CONFIG.WIDTH;
  var SM = GAME.CONFIG.SMALL;
  var topHud = GAME.isTouch && (GAME.CONFIG.PORTRAIT || GAME.CONFIG.PHONE);
  var h = SM ? 28 : 32;
  var y = topHud
    ? (this.hud.bottom + 3)                                        // HUD 띠 바로 아래
    : Math.max(4, Math.round((GAME.Iso.screenRect().y - h) / 2));   // 아레나 위 빈 띠 안
  this._goldRight = W - (SM ? 12 : 24);
  this._goldY = y;
  this._goldH = h;
  this._goldG = this.add.graphics().setDepth(8000);
  if (this._goldG.setScrollFactor) this._goldG.setScrollFactor(0);
  this._goldTxt = GAME.UI.text(this, this._goldRight - 10, y + h / 2, '0', {
    size: SM ? 'subhead' : 'num', color: GAME.UI.TXT.crit,
    origin: 1, originY: 0.5, outline: true, lineSpacing: 0
  }).setDepth(8001);
  this._goldShown = this._goldBase;
  this._goldTxt.setText(String(this._goldBase));
  this._drawGoldBadge();
};

// 배지 판은 **글자 폭이 바뀔 때만** 다시 그린다(매 프레임 clear+fill 은 낭비다)
GAME.BattleScene.prototype._drawGoldBadge = function () {
  var g = this._goldG;
  if (!g || !g.scene) return;
  var tw = Math.ceil(this._goldTxt.width);
  var h = this._goldH, r = h / 2;
  var w = tw + h + 26;                               // 글자 + 동전 아이콘 + 여백
  var x = this._goldRight - w, y = this._goldY;
  g.clear();
  g.fillStyle(GAME.UI.COL.shadow === undefined ? 0x000000 : GAME.UI.COL.shadow,
    GAME.UI.IS_LIGHT ? 0.16 : 0.28);
  g.fillRoundedRect(x, y + 2, w, h, r);
  g.fillStyle(GAME.UI.COL.surface, 0.92);
  g.fillRoundedRect(x, y, w, h, r);
  g.lineStyle(1, GAME.UI.COL.border, 1);
  g.strokeRoundedRect(x + 0.5, y + 0.5, w - 1, h - 1, r);
  // 전장의 동전과 **같은 그림**을 쓴다 — 배지와 바닥의 물건이 같은 것임이 바로 읽힌다
  if (GAME.drawCoinGlyph) {
    GAME.drawCoinGlyph(g, x + h * 0.62, y + h / 2, h * 0.30, 1, 1,
      GAME.UI.FX.ink, GAME.UI.FX.inkAlpha);
  }
  this._goldW = tw;
};

GAME.BattleScene.prototype._hintDefault = function () {
  // 세로 터치에서는 상시 안내를 두지 않는다. 버튼에 '공격/Q/W/E/R/물약' 이 이미 적혀 있고,
  // 보스 층은 HUD 가 158px 로 커져서 이 문구가 스킬 버튼 위로 내려앉는다.
  // (조준 대기 같은 **일시적 안내**는 계속 이 라벨을 쓴다)
  if (GAME.isTouch && (GAME.CONFIG.PORTRAIT || GAME.CONFIG.PHONE)) return '';
  return GAME.isTouch
    ? '한 번 탭: 이동하며 교전   ·   두 번 탭: 이동만   ·   스킬 버튼: 바라보는 방향 시전'
    : '우클릭 이동 / 적 클릭 공격   ·   방향키 직접 이동   ·   Q W E R 바라보는 방향 시전   ·   F 물약';
};

GAME.BattleScene.prototype.showMarker = function (x, y, type) {
  this.markers.push({ x: x, y: y, type: type, t: 450, total: 450 });
};

// ── 마우스 휠 확대/축소 (PC 전용) ──────────────────────────────────────────
// 조건 셋을 전부 만족할 때만 동작한다: **비터치 · 전투 중 · 커서가 전장 위**.
//
// **순수 렌더다.** 확대는 전장 그림을 담은 컨테이너의 스케일·오프셋으로만 일어나고
// 월드 좌표(u.x/u.y)는 한 픽셀도 움직이지 않는다 → 거리·회피·밸런스 불변.
// 마우스 입력은 같은 변환을 역으로 풀어(screenToWorld) 평면 좌표로 되돌린다.
// `js/iso.js` 는 한 줄도 고치지 않았다 — 투영 경계를 그대로 둔다.
//
// 왜 카메라 줌(`cameras.main.setZoom`)이 아닌가 — 실측 근거:
//  ① `setScrollFactor(0)` 은 스크롤만 상쇄할 뿐 **줌 스케일은 그대로 먹는다.**
//     zoom 2 에서 하단 힌트가 화면 y 762 → 1074(화면 밖)로 밀려났다. HUD 가 같이 커진다.
//  ② 전장 전용 카메라를 하나 더 두고 ignore 로 가르면 화면은 나오지만 세 가지가 깨진다:
//     · 전장 카메라가 나중에 그려져 저체력 사이렌 비네트가 전장 위에서 사라지고
//     · 전투 종료 검은 막이 아레나 안쪽만 덮으며(실측 스크린샷)
//     · **나중에** 만들어지는 객체(사이렌 그래픽스)는 ignore 목록에 없어 같이 확대된다(실측).
//  컨테이너 방식은 빠뜨린 것이 있어도 '확대되지 않을' 뿐이라 **안전한 방향으로 실패**한다.
GAME.BattleScene.prototype.ZOOM_MIN = 1;
GAME.BattleScene.prototype.ZOOM_MAX = 2.5;
GAME.BattleScene.prototype.ZOOM_STEP = 1.18;      // 휠 한 칸

GAME.BattleScene.prototype._setupZoom = function () {
  if (!this._zoomOn || !this.worldLayer) return;
  var self = this;
  var R = GAME.Iso.screenRect();
  this._zoomRect = { x: R.x, y: R.y, w: R.w, h: R.h };

  // 확대하면 전장 그림이 아레나 밖(HUD 자리)으로 삐져나온다 → 아레나 사각형으로 잘라낸다.
  var mg = this.make.graphics({ x: 0, y: 0, add: false });
  mg.fillStyle(0xffffff, 1);
  mg.fillRect(R.x, R.y, R.w, R.h);
  this._zoomMaskG = mg;
  this._zoomMask = mg.createGeometryMask();

  // Phaser 3.80 의 씬 휠 이벤트: (pointer, currentlyOver, dx, dy, dz)
  this._onWheel = function (pointer, over, dx, dy) {
    if (!self._zoomOn || !self.worldLayer) return;
    if (self.ended || !self.state || self.state.over) return;      // 전투 중에만
    if (!self._overArena(pointer.x, pointer.y)) return;            // 커서가 전장 위일 때만
    if (!dy) return;
    self.setZoom(self._zoom * (dy < 0 ? self.ZOOM_STEP : 1 / self.ZOOM_STEP),
                 pointer.x, pointer.y);                            // 위로 굴리면 확대
  };
  this.input.on('wheel', this._onWheel);
};

GAME.BattleScene.prototype._overArena = function (sx, sy) {
  var R = this._zoomRect;
  if (!R) return false;
  return sx >= R.x && sx <= R.x + R.w && sy >= R.y && sy <= R.y + R.h;
};

// 화면 좌표 → 평면(월드) 좌표. 확대 변환을 먼저 풀고 Iso 역투영에 넘긴다.
// 줌이 1이면 예전과 **완전히 같은 식**이다(오차 0).
GAME.BattleScene.prototype.screenToWorld = function (sx, sy) {
  var z = this._zoom || 1;
  var o = this._zoomOff || { x: 0, y: 0 };
  return GAME.Iso.toWorld((sx - o.x) / z, (sy - o.y) / z);
};

// (ax,ay) 화면 지점 아래에 있던 전장이 제자리에 남도록 확대한다(anchor zoom).
GAME.BattleScene.prototype.setZoom = function (z, ax, ay) {
  if (!this.worldLayer || !this._zoomRect) return;
  var R = this._zoomRect;
  z = Math.max(this.ZOOM_MIN, Math.min(this.ZOOM_MAX, z));
  var z0 = this._zoom || 1;
  var o = this._zoomOff;
  if (ax === undefined) { ax = R.x + R.w / 2; ay = R.y + R.h / 2; }

  // 커서 아래의 '기준 화면 좌표'를 구해, 확대 후에도 같은 화면 자리에 오게 오프셋을 잡는다
  var bx = (ax - o.x) / z0, by = (ay - o.y) / z0;
  var ox = ax - bx * z, oy = ay - by * z;

  // 아레나 밖(빈 공간)이 보이지 않게 — 확대된 아레나가 창(R)을 항상 덮어야 한다.
  // z=1 이면 두 경계가 모두 0 이라 오프셋이 정확히 0 으로 돌아온다.
  ox = Math.min(R.x * (1 - z), Math.max((R.x + R.w) * (1 - z), ox));
  oy = Math.min(R.y * (1 - z), Math.max((R.y + R.h) * (1 - z), oy));

  this._zoom = z;
  o.x = ox; o.y = oy;
  this.worldLayer.setScale(z);
  this.worldLayer.setPosition(ox, oy);

  // 마스크는 확대 중에만 건다 — 1.0 에서는 예전과 완전히 같은 렌더 경로여야 한다
  // (전투 종료 검은 막이 화면 전체를 덮는 것도 이 덕분에 그대로다).
  if (z > 1.0001) {
    if (this.worldLayer.mask !== this._zoomMask) this.worldLayer.setMask(this._zoomMask);
  } else if (this.worldLayer.mask) {
    this.worldLayer.clearMask();
  }
};

GAME.BattleScene.prototype.resetZoom = function () {
  if (this.worldLayer && this.worldLayer.scene) this.setZoom(1);
  this._zoom = 1;
  this._zoomOff.x = 0; this._zoomOff.y = 0;
};

// 피해 숫자 렌더 — 위로 떠오르며 사라진다. 크리티컬은 크고 노랗고 '!' 가 붙는다.
GAME.BattleScene.prototype.drawNumbers = function () {
  var C = GAME.CONFIG.COLORS;
  var Iso = GAME.Iso;
  var nums = this.state.numbers;
  var pool = this.numPool;
  // 최신 것부터 풀 크기만큼만 보여준다
  var start = Math.max(0, nums.length - pool.length);
  var used = 0;
  for (var i = start; i < nums.length; i++) {
    var n = nums[i];
    var t = pool[used++];
    var prog = 1 - n.t / n.total;
    t.setVisible(true);
    t.setText(n.crit ? n.value + '!' : String(n.value));

    // 요청: "데미지도 플레이어가 입히는 게 더 중요하니 그 부분을 강조하고,
    //        맞는 건 조금 더 조그맣게 / 눈에 덜 띄는 색으로."
    // `onHero` 는 '영웅이 맞았다'는 뜻이지 '내가 맞았다'가 아니다 —
    // 방어전에서는 영웅이 적이라 의미가 뒤집힌다. 그래서 시점 플래그로 한 번 접는다.
    var heroIsPlayer = (this._heroIsPlayer === undefined) ? true : this._heroIsPlayer;
    var mine = heroIsPlayer ? !n.onHero : !!n.onHero;
    var SM = GAME.CONFIG.SMALL;
    var size;
    if (n.crit) size = mine ? (SM ? 34 : 32) : (SM ? 21 : 20);
    else        size = mine ? (SM ? 25 : 23) : (SM ? 16 : 15);
    // ⚠ Phaser 의 Text 스타일 세터(setFontSize/setColor/setStroke)는 값이 같아도
    //   **매번 캔버스를 다시 굽는다**(updateText). 매 프레임 부르면 숫자 하나당
    //   프레임마다 3~4회 재래스터가 일어난다 — 실측: 숫자 4개에서 22.8회/프레임,
    //   세터를 빼면 7.4회/프레임. 사냥꾼 연사처럼 숫자가 한꺼번에 뜨면 이게 곧 렉이다.
    //   스타일은 **숫자가 새로 뜰 때만** 바뀌므로 슬롯별로 캐시해 달라질 때만 부른다.
    var color = n.crit ? C.crit : (mine ? this.numFill : this.numTakenFill);
    var sw = mine ? 5 : 3;
    if (t.__sz !== size) { t.setFontSize(size); t.__sz = size; }
    // 크리티컬은 맞은 쪽이어도 색을 남긴다 — '치명타를 맞았다'는 건 알아야 할 정보다.
    if (t.__col !== color) { t.setColor(color); t.__col = color; }
    if (t.__sw !== sw) { t.setStroke(this.numStroke, sw); t.__sw = sw; }
    t.setAlpha(Math.max(0, 1 - prog * prog) * (mine ? 1 : 0.78));
    t.setPosition(n.x + (n.drift || 0) * prog, Iso.toScreenY(n.y) - 26 - prog * 46);
  }
  for (; used < pool.length; used++) pool[used].setVisible(false);
};

GAME.BattleScene.prototype.update = function (time, delta) {
  var dt = Math.min(delta, 50);

  // ── 타격감(juice) ──────────────────────────────────────────────────────
  // "타격감이 없다"는 실측 신고에 대한 대응. 지금 공격은 예비동작·타격·여파가 없이
  // 즉발이라 데미지 숫자만 뜨고 끝난다. 아래 세 가지를 **렌더 계층에서만** 붙인다:
  //   ① 히트스톱 — 맞는 순간 게임을 아주 잠깐 멈춘다(가장 큰 한 방)
  //   ② 화면 흔들림 — 무게감
  //   ③ 피격 플래시 + 휘청임 — eggart 가 그린다(u._hurt 를 읽는다)
  //
  // **체력 감소를 프레임 간 비교로 감지**한다. combat.js 를 건드리지 않으므로
  // 전투 판정·밸런스가 전혀 움직이지 않는다(이 프로젝트의 렌더/로직 분리 원칙).
  this._juice(dt);

  // 히트스톱 중에는 시뮬을 진행시키지 않는다 — 화면이 '멎었다가' 터지는 느낌을 만든다
  if (this._hitStop > 0) {
    this._hitStop -= delta;
    this._dt = 0;
    this.draw();
    this.drawNumbers();
    this.updateHud();
    return;
  }

  if (!this.state.over) {
    this.ctrl.update(dt);
    GAME.Combat.update(this.state, dt);
  }

  // 라운드 종료를 **씬에서** 3초 붙잡는다. combat.js 는 건드리지 않는다.
  this._endGate(dt);

  // 동전 — 줍기 판정은 월드 좌표에서만 한다(줌·투영과 무관)
  if (this._coins) {
    this._coins.update(dt, this.hero);
    this._updateGoldHud(dt);
  }

  for (var i = this.markers.length - 1; i >= 0; i--) {
    this.markers[i].t -= dt;
    if (this.markers[i].t <= 0) this.markers.splice(i, 1);
  }

  this._dt = dt;          // 걸음걸이 위상 계산용 (렌더에서만 쓴다)
  this.draw();
  this.drawNumbers();
  this.updateHud();

  if (this.state.over && !this.ended) {
    this.ended = true;

    // 바닥에 남은 동전은 **버린다**(자동 수거하지 않는다 — 근거는 js/coin.js 머리말).
    if (this._coins) {
      this._coins.forfeit();
      // ⚠ towerrun.js 의 `goldGainFor` 는 killGold 가 **0 이면** "훅이 안 불렸다"로 보고
      //   옛 방식(층 총액 전부)으로 되돌린다. 한 개도 못 주웠을 때 그 폴백이 걸리면
      //   **하나도 안 주운 쪽이 더 많이 받는 역전**이 생긴다. 1 로 바닥을 깔아 막는다
      //   (towerrun.js 는 다른 에이전트 담당이라 이쪽에서 흡수한다).
      if (this._coins.dropped > 0 && !(this.state.killGold > 0)) this.state.killGold = 1;
    }
    // 전투가 끝나면 즉시 원래 배율로 — 결과 화면으로 넘어가는 1.1초 동안
    // 검은 막과 전장이 확대된 채로 남지 않게 한다.
    this.resetZoom();
    var self = this;

    // 학습형 AI: 이 판의 관측치를 배치도에 기록한다.
    // '전략가가 이겼는가' 기준이므로 컨트롤러 승리는 진형의 패배다.
    var t = this.state.telemetry;
    var xs = t.heroXSamples;
    // ⚠ **시험 판은 학습시키지도 않는다.** 여기까지 막지 않아 실측에서 결과 화면에
    //   "격파당해 난이도가 1단계로 올랐습니다 / 시험 시작 — …" 이 떴다. 내 전장을
    //   내가 시험할 때마다 그 전장의 난이도(escalation)가 올라가면, 남이 도전할 때의
    //   난이도가 내 연습 횟수로 정해진다 — 격파율이 통째로 거짓이 된다.
    //   기록을 막는 곳은 넷이다: 배치도 전적 · 점수 · 트로피 · **학습**.
    var learnRec = this.test
      ? { lastNotes: [] }
      : GAME.Learn.record(this.formation.id, this.state.winner === 'strategist', {
          medicPlaced: t.medicPlaced, medicHealed: t.medicHealed,
          guardPlaced: t.guardPlaced, guardBlocked: t.guardBlocked,
          rangedDiedInMelee: t.rangedDiedInMelee,
          strategistUnits: t.strategistUnits, engagedUnits: t.engagedUnits,
          heroSideAvg: xs.length ? xs.reduce(function (a, b) { return a + b; }, 0) / xs.length : undefined
        });

    // 이 배치도의 방어 전적 — 진형 선택·준비·결과 화면이 이 값을 읽는다.
    // 여기서 기록하지 않으면 세 화면 모두 영원히 '전적 없음'으로 남는다(실제로 그랬다).
    // 기준은 winRate 와 같은 '전략가(방어) 승률'이다.
    if (!this.test) {
      GAME.Formations.recordResult(this.formation.id,
        this.state.winner === 'strategist' ? 'win'
          : (this.state.winner === 'controller' ? 'loss' : 'draw'));
    }

    // 점수 — 격파한 난이도 단계가 클수록, 체력·시간을 남길수록 높다
    var won = this.state.winner === 'controller';
    var secondsLeft = Math.max(0, GAME.CONFIG.BATTLE_TIME - this.state.elapsed / 1000);
    var score = GAME.Score.forResult({
      won: won, asStrategist: false,
      budget: GAME.Formations.budgetOf(this.formation),
      escalation: this.escalation,
      secondsLeft: secondsLeft,
      hpPct: this.hero.maxHp ? this.hero.hp / this.hero.maxHp : 0,
      tower: this.tower
    });
    var id = GAME.Account.current();
    if (id && score > 0 && !this.test) {
      GAME.Score.add(id, {
        score: score, won: won, asStrategist: false,
        escalation: this.escalation, formationName: this.formation.name,
        tower: this.tower
      });
    }

    // 플레이어 성향 누적 — AI 전략가가 다음 배치를 짤 때 쓴다
    GAME.Profile.record(this.heroKey, t);

    // 통곡의 탑 진행 처리
    var towerRec = null, runRec = null, goldGained = 0;
    if (this.tower) {
      // 탑 학습 — **이긴 판·진 판 모두** 기록한다. 진 판에서만 배우면 가설을 세울 수는
      // 있어도 그것이 통했는지 확인할 수가 없다(확인은 이긴 판에서 나온다).
      if (GAME.TowerLearn) {
        GAME.TowerLearn.record(this.tower, this.state, this.state.winner === 'strategist');
      }
      towerRec = won ? GAME.Tower.clear(this.tower) : GAME.Tower.fail();
      // 도전(run) — 이기면 골드를 주고, 지면 도전이 끝난다(다음엔 처음부터 고른다)
      if (GAME.TowerRun && GAME.TowerRun.get()) {
        if (won) {
          goldGained = GAME.TowerRun.goldGainFor(this.tower, this.state);
          runRec = GAME.TowerRun.clear(this.tower, this.state);
        } else {
          GAME.TowerRun.end();
        }
      }
    }

    // 대전(비동기 PvP) — 트로피를 정산한다
    var arenaResult = null;
    if (this.versus && !this.test && GAME.Arena) {
      arenaResult = GAME.Arena.recordAttack(GAME.Arena.pendingOpponent, won);
      // 격파율의 근거를 서버에 남긴다 — **그 진형의 주인 닉네임**으로 보고한다.
      // 내 기기 기록만으로는 남의 진형이 대부분 '기록 없음'으로 남아 정렬이 의미를 잃는다.
      // 원격 배치도의 author 가 곧 그 사람의 닉네임이다(formations.fromRemote 참조).
      if (GAME.Api && GAME.Api.defResult && this.formation.remote && this.formation.author) {
        GAME.Api.defResult(this.formation.author, !won);
      }
      GAME.Arena.pendingOpponent = null;
    }

    this.time.delayedCall(1100, function () {
      self.scene.start('Result', {
        winner: self.state.winner,
        formationId: self.formation.id,
        heroKey: self.heroKey,
        escalation: self.escalation,
        score: score,
        tower: self.tower,
        towerRec: towerRec,
        runRec: runRec,
        goldGained: goldGained,
        versus: self.versus,
        test: self.test,
        arenaResult: arenaResult,
        learnNotes: learnRec.lastNotes || []
      });
    });
  }
};

// 체력이 줄어든 유닛을 찾아 타격 연출을 붙인다. **렌더 전용** — 상태를 읽기만 한다.
GAME.BattleScene.prototype._juice = function (dt) {
  if (this._hitStop === undefined) this._hitStop = 0;
  if (!this._prevHp) this._prevHp = {};

  var units = this.state.units;
  var biggest = 0, heroHit = false;

  for (var i = 0; i < units.length; i++) {
    var u = units[i];
    var key = u.__jid;
    if (key === undefined) { key = u.__jid = 'u' + i + '-' + (u.type || '') + '-' + Math.random().toString(36).slice(2, 7); }

    // 피격 타이머는 매 프레임 줄인다(eggart 가 이걸 보고 흔들고 번쩍인다)
    if (u._hurt > 0) u._hurt = Math.max(0, u._hurt - dt);

    var prev = this._prevHp[key];
    if (prev !== undefined && u.alive && u.hp < prev - 0.01) {
      var dmg = prev - u.hp;
      var pct = u.maxHp ? dmg / u.maxHp : 0;
      // 맞은 정도에 비례해 휘청임 시간을 준다(최소 120ms, 최대 320ms)
      u._hurt = Math.min(320, 120 + pct * 900);
      u._hurtDir = (u.facing === undefined ? 0 : u.facing) + Math.PI;   // 맞은 반작용 방향
      if (pct > biggest) biggest = pct;
      if (u === this.hero) heroHit = true;
    }
    this._prevHp[key] = u.alive ? u.hp : 0;
  }

  // ① 히트스톱 — 큰 타격일수록 길게. 너무 길면 조작이 끊겨 답답하다(최대 70ms).
  //
  // **아껴 쓴다.** 예전엔 피해가 들어올 때마다 걸었더니, 사냥꾼 연사(3연사)나
  // 광역 폭격처럼 짧은 사이에 여러 번 맞히는 조작에서 정지가 연달아 재장전되어
  // 프레임의 14%에서 시뮬이 멎었다(실측). 플레이어에게는 '렉'으로 느껴진다.
  //  · 작은 타격(최대체력 4% 미만)은 건너뛴다 — 스치는 화살까지 멈출 이유가 없다
  //  · 내가 맞은 건 예외 — 그건 알아야 할 정보다
  //  · 최소 간격 220ms — 연사가 정지를 사슬처럼 잇지 못하게
  //  실측: 문턱 0.04 · 간격 220 · 최대 70ms 에서도 시뮬 정지 프레임이 12% 였다.
  //  정지 '횟수'보다 '길이'가 지배적이라 최대 길이를 함께 줄인다.
  var HITSTOP_MIN_PCT = 0.06;
  var HITSTOP_GAP = 300;
  var HITSTOP_MAX = 45;
  if (this._stopAt === undefined) this._stopAt = -HITSTOP_GAP;
  if (biggest > 0 && (heroHit || biggest >= HITSTOP_MIN_PCT) &&
      this.state.elapsed - this._stopAt >= HITSTOP_GAP) {
    this._stopAt = this.state.elapsed;
    var stop = Math.min(HITSTOP_MAX, 14 + biggest * 300);
    if (stop > this._hitStop) this._hitStop = stop;
  }

  // ② 화면 흔들림 — **아껴 쓴다.**
  // 예전엔 피해가 들어올 때마다 흔들었더니 난전에서 화면이 계속 떨렸다.
  // 요청대로 두 순간에만, 그것도 5초에 한 번만 흔든다:
  //   · 내가 스킬을 썼을 때        — 내 행동의 무게
  //   · 3기 이상에게 둘러싸여 맞을 때 — 위기 신호
  var h = this.hero;

  // 시전 감지: 쿨다운이 '올라가는' 순간이 곧 시전이다. 로직에 손대지 않고 읽기만 한다.
  var cast = false;
  if (h && h.skillCd) {
    if (!this._prevCd) this._prevCd = {};
    for (var s = 0; s < GAME.SKILL_SLOTS.length; s++) {
      var sl = GAME.SKILL_SLOTS[s];
      var cd = h.skillCd[sl] || 0;
      if (this._prevCd[sl] !== undefined && cd > this._prevCd[sl] + 1) cast = true;
      this._prevCd[sl] = cd;
    }
  }

  // 다굴 판정: **가까이 붙은** 적만 센다. 사거리로 세면 고층에서 원거리 유닛이
  // 항상 조건을 채워 5초마다 계속 흔들린다 — 그건 '다굴'이 아니다.
  var gang = 0;
  if (h && h.alive) {
    for (var gi = 0; gi < units.length; gi++) {
      var e = units[gi];
      if (!e.alive || e === h || e.side === h.side) continue;
      var near = ((h.radius || 17) + (e.radius || 10)) * 2.2;
      var ex = e.x - h.x, ey = e.y - h.y;
      if (ex * ex + ey * ey <= near * near) gang++;
    }
  }

  var GAP = 5000;
  if (this._shakeAt === undefined) this._shakeAt = -GAP;
  var now = this.state.elapsed;
  if ((cast || (gang >= 3 && heroHit)) && now - this._shakeAt >= GAP) {
    this._shakeAt = now;
    if (this.cameras && this.cameras.main) {
      this.cameras.main.shake(cast ? 150 : 220, cast ? 0.005 : 0.008);
    }
  }

  // ③ 저체력 경고 — 사이렌처럼 붉은 테두리가 몇 번 번쩍인다
  this._lowHpWarn();
};

// 체력이 30% 밑으로 **떨어지는 순간** 붉은 비네트를 2~3번 번쩍인다.
// 상시 표시가 아니다 — 계속 깔려 있으면 화면을 읽는 데 방해가 된다(요청).
// 회복해서 38% 위로 올라가면 다시 무장한다(히스테리시스 — 경계선에서 깜빡이지 않게).
GAME.BattleScene.prototype._lowHpWarn = function () {
  var h = this.hero;
  if (!h || !h.maxHp) return;
  if (this._sirenArmed === undefined) this._sirenArmed = true;
  var r = h.alive ? (h.hp / h.maxHp) : 1;
  if (this._sirenArmed && h.alive && r < 0.30) {
    this._sirenArmed = false;
    this._sirenPulse(3);
  } else if (!this._sirenArmed && r > 0.38) {
    this._sirenArmed = true;
  }
};

// 화면 가장자리에서 안쪽으로 옅어지는 붉은 테두리. 가운데(전장)는 건드리지 않는다.
GAME.BattleScene.prototype._buildSiren = function () {
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var g = this.add.graphics().setDepth(9000).setAlpha(0);
  if (g.setScrollFactor) g.setScrollFactor(0);
  // FX.telegraph 는 '예고 원'에 쓰는 경고 적색이다(테마별 값, 숫자형).
  // TXT.danger 는 CSS 문자열이라 Graphics.fillStyle 에 넣으면 안 된다.
  var red = (GAME.UI.FX && GAME.UI.FX.telegraph) || 0xB3161C;
  // 띠 폭과 단계 수는 실측으로 잡았다. 0.26 / 14단계는 **동심 사각형이 눈에 보였다**
  // (계단처럼 층이 짐). 띠를 좁히고 단계를 늘려 한 단계당 알파를 낮춘다.
  var band = Math.min(W, H) * 0.13;
  var steps = 30;
  for (var i = 0; i < steps; i++) {
    var inset = band * i / steps;
    var th = band / steps + 1.2;              // 살짝 겹쳐 단계 사이 이음매를 없앤다
    g.fillStyle(red, 0.075 * Math.pow(1 - i / steps, 1.5));
    g.fillRect(inset, inset, W - inset * 2, th);                 // 위
    g.fillRect(inset, H - inset - th, W - inset * 2, th);         // 아래
    g.fillRect(inset, inset, th, H - inset * 2);                  // 왼쪽
    g.fillRect(W - inset - th, inset, th, H - inset * 2);         // 오른쪽
  }
  this._sirenG = g;
  return g;
};

GAME.BattleScene.prototype._sirenPulse = function (times) {
  var g = this._sirenG || this._buildSiren();
  this.tweens.killTweensOf(g);
  g.setAlpha(0);
  this.tweens.add({
    targets: g, alpha: 1, duration: 240, ease: 'Sine.easeInOut',
    yoyo: true, hold: 80, repeatDelay: 200, repeat: Math.max(0, times - 1),
    onComplete: function () { if (g && g.setAlpha) g.setAlpha(0); }
  });
};

// ── 라운드 종료 3초 유예 ────────────────────────────────────────────────────
//  요청: "적 유닛을 다 잡고 나면 바로 라운드 종료가 아니라 '라운드가 종료됩니다' 문구와
//         3초를 센 다음 종료."
//
//  ⚠ `state.over` 판정은 `js/combat.js`(다른 에이전트 담당) 안에 있다. **거기는 안 고친다.**
//  대신 combat 이 켠 플래그를 씬이 3초 동안 도로 내려준다. 판정 자체는 부작용이 없는
//  (생존 수 비교 → over/winner 대입) 순수 계산이라 매 프레임 다시 켜지고, 다시 내려도
//  전투 상태가 어긋나지 않는다. 그동안 `Combat.update` 가 정상적으로 계속 돌기 때문에
//  **영웅이 실제로 걸어다니며 남은 동전을 주울 수 있다** — 이게 3초를 두는 실질적 이유다.
//
//  두 가지를 함께 지킨다:
//   · `state.elapsed` 를 그 순간 값으로 고정한다 → 3초가 제한시간·점수를 갉아먹지 않는다.
//     (동시에 HUD 타이머가 멈춰 "전투는 끝났다"가 눈으로 읽힌다)
//   · 유예 중 다른 결말이 나와도(가시덫이 남아 영웅을 잡는 등) 이미 이긴 판이므로
//     승리로 확정하고 즉시 끝낸다. 시간초과·패배는 유예 없이 지금처럼 즉시다.
GAME.BattleScene.prototype.ROUND_END_MS = 3000;

GAME.BattleScene.prototype._endGate = function (dt) {
  var s = this.state;
  if (this._endHold === undefined) this._endHold = -1;

  if (this._endHold < 0) {
    if (s.over && s.winner === 'controller' && this.ROUND_END_MS > 0) {
      this._endHold = this.ROUND_END_MS;
      this._endElapsed = s.elapsed;
      s.over = false;
      this._showEndBanner();
    }
    return;
  }
  if (this._endHold === 0) return;        // 이미 유예를 끝냈다

  this._endHold -= dt;
  // ⚠ combat 은 매 프레임 승패를 **다시 계산해 다시 켠다**(적이 0기이므로 계속 승리).
  //   그래서 `s.over` 만 보고 끝내면 유예가 한 프레임 만에 무너진다(실측으로 잡았다).
  //   유예를 깨는 건 **결말이 승리가 아닐 때**뿐이다 — 남은 가시덫이 영웅을 잡는 경우 등.
  var upset = s.over && s.winner !== 'controller';
  var done = this._endHold <= 0 || upset;
  s.elapsed = this._endElapsed;           // 타이머 정지
  if (done) {
    this._endHold = 0;
    s.over = true;
    s.winner = 'controller';
    if (this._endBanner) this._endBanner.setVisible(false);
    return;
  }
  s.over = false;
  this._updateEndBanner();
};

GAME.BattleScene.prototype._showEndBanner = function () {
  var R = GAME.Iso.screenRect();
  if (!this._endBanner || !this._endBanner.scene) {
    this._endBanner = GAME.UI.text(this, R.x + R.w / 2, R.y + R.h * 0.26, '', {
      size: GAME.CONFIG.SMALL ? 'heading' : 'title', color: GAME.UI.TXT.crit,
      origin: 0.5, align: 'center', outline: true
    }).setDepth(8600);
  }
  this._endShown = -1;
  this._endBanner.setVisible(true);
  this._updateEndBanner();
};

GAME.BattleScene.prototype._updateEndBanner = function () {
  var b = this._endBanner;
  if (!b || !b.scene) return;
  var sec = Math.max(1, Math.ceil(this._endHold / 1000));
  // 남은 동전 수를 같이 보여준다 — 못 먹으면 사라지는 돈이라 **손실이 보여야** 뛴다.
  var left = this._coins ? this._coins.remaining() : 0;
  var line = '라운드가 종료됩니다  ' + sec;
  if (left > 0) line += '\n남은 동전 ' + left + '개';
  // setText 는 재래스터다 → 문구가 실제로 바뀔 때만 부른다(초가 바뀔 때 = 3회)
  if (this._endShown !== line) { b.setText(line); this._endShown = line; }
};

// ── 우상단 총 골드 갱신 ─────────────────────────────────────────────────────
//  draft.js 의 골드 롤링과 **같은 문법**(목표값으로 굴러가며 커졌다 돌아온다)이되
//  구현은 다르다. 저쪽은 tween + delayedCall 을 매번 만들고 지운다 — 전투 루프에서
//  초당 몇 번씩 주우면 트윈이 쌓이고, 씬을 나갈 때 정리할 것도 늘어난다.
//  여기서는 트윈 없이 프레임마다 값을 좁힌다. **정수가 바뀔 때만** setText 를 부르므로
//  재래스터가 굴러가는 동안만 프레임당 1회로 묶인다.
GAME.BattleScene.prototype._updateGoldHud = function (dt) {
  if (!this._goldTxt || !this._goldTxt.scene) return;
  var target = this._goldBase + this._coins.collected;
  if (this._coins.gotThisFrame > 0) this._goldPop = 1;

  var shown = this._goldShown;
  if (shown !== target) {
    var step = Math.max(1, Math.ceil((target - shown) / 5));
    shown = (shown < target) ? Math.min(target, shown + step) : target;
    this._goldShown = shown;
    this._goldTxt.setText(String(shown));
    if (Math.ceil(this._goldTxt.width) !== this._goldW) this._drawGoldBadge();
  }

  if (this._goldPop > 0) {
    this._goldPop = Math.max(0, this._goldPop - dt / 260);
    var k = 1 + 0.20 * this._goldPop;
    this._goldTxt.setScale(k);
  } else if (this._goldTxt.scaleX !== 1) {
    this._goldTxt.setScale(1);
  }
};

GAME.BattleScene.prototype.updateHud = function () {
  var C = GAME.CONFIG.COLORS;
  var h = this.hero;
  var TOTAL = GAME.CONFIG.BATTLE_TIME;
  var remain = Math.max(0, TOTAL - this.state.elapsed / 1000);

  // 보스가 살아 있으면 전용 바로 보여준다 — 보스 층의 목표가 눈에 박힌다
  var bossU = null;
  if (this.formation.boss) {
    for (var bi = 0; bi < this.state.units.length; bi++) {
      if (this.state.units[bi].def.isBoss) { bossU = this.state.units[bi]; break; }
    }
  }
  var bossAlive = !!(bossU && bossU.alive);

  this.hud.update({
    heroName:   h.hero.name,
    hpFrac:     (h.alive && h.maxHp) ? h.hp / h.maxHp : 0,
    shieldFrac: h.maxHp ? (h.shield || 0) / h.maxHp : 0,
    hpText:     h.alive ? (Math.ceil(h.hp) + ' / ' + h.maxHp) : '전사',
    shieldText: h.shield > 0 ? ('보호막 +' + Math.ceil(h.shield)) : '',

    timeFrac:   TOTAL ? remain / TOTAL : 0,
    timeText:   remain.toFixed(1) + '초',
    timeLow:    remain < 15,

    enemyText:  '남은 적 ' + GAME.Combat.aliveCount(this.state, 'strategist') + '기',

    bossName:   bossAlive ? bossU.def.name : '보스 처치',
    bossFrac:   (bossAlive && bossU.maxHp) ? bossU.hp / bossU.maxHp : 0,
    bossText:   bossAlive ? (Math.ceil(bossU.hp) + ' / ' + bossU.maxHp) : '처치'
  });

  for (var i = 0; i < this.skillBoxes.length; i++) {
    var b = this.skillBoxes[i];
    var sk = h.skills[i];
    // 스킬 이름 + 예상 사거리(있을 때만). 방향으로 즉시 시전하므로 사거리를 감으로 맞춘다.
    var reach = GAME.Combat.skillReach(sk);
    b.name.setText(reach > 0 ? (sk.name + '  ' + reach) : sk.name);
    // 성격 한 낱말 — 폰 원형 버튼과 **같은 어휘**를 쓴다(R 은 '궁극기').
    // 폰에서 배운 말이 PC 에서 그대로 보여야 두 화면이 같은 게임으로 읽힌다.
    if (b.kind) b.kind.setText(GAME.skillLabel ? GAME.skillLabel(sk, b.slot) : '');
    var cd = h.skillCd[b.slot];
    var ready = cd <= 0;
    b.cd.setText(ready ? '준비' : (cd / 1000).toFixed(1));
    b.cd.setColor(ready ? C.accent : C.text);
    // 시계 — 12시에서 시계방향으로 **남은 만큼** 회색이 남고, 다 돌면 흰 원이 된다.
    if (b.clock) {
      var total = 1;
      for (var si = 0; si < h.skills.length; si++) {
        if (h.skills[si].slot === b.slot) {
          total = Math.max(1, h.skills[si].cooldown * (h.cdrMul || 1));
          break;
        }
      }
      b.clock.clear();
      var a0 = -Math.PI / 2;
      if (ready) {
        b.clock.fillStyle(0xffffff, 0.90);
        b.clock.fillCircle(b.clockX, b.clockY, b.clockR);
      } else {
        var frac = Math.max(0, Math.min(1, cd / total));
        b.clock.fillStyle(0xffffff, 0.14);
        b.clock.fillCircle(b.clockX, b.clockY, b.clockR);
        b.clock.fillStyle(GAME.UI.COL.borderUi, 0.55);
        b.clock.slice(b.clockX, b.clockY, b.clockR, a0, a0 + Math.PI * 2 * frac, false);
        b.clock.fillPath();
      }
    }
    b.rect.setStrokeStyle(1, GAME.UI.COL.border);
    b.rect.setFillStyle(GAME.UI.COL.surface);
  }

  // 폰 가로에서는 힌트 라벨 자체를 만들지 않는다
  if (this.hintText) {
    this.hintText.setText(this._hintDefault());
    this.hintText.setColor(GAME.CONFIG.COLORS.textFaint);
  }

  // 세로 터치에서는 하단 스킬바를 안 만든다 → 물약 표시도 없다(원형 패드가 대신한다)
  if (this.potionText) this.potionText.setText(h.potionCharges > 0 ? h.potionCharges + '회' : '없음');
  if (this.potionText) this.potionText.setColor(h.potionCharges > 0 ? C.text : C.textDim);
};

// ── PC 스킬바 설명 말풍선 ──────────────────────────────────────────────────
// 사용자 지시: "PC 는 QWER 유지하되 설명만 추가". 칸 안에는 자리가 없어서
// 마우스를 올렸을 때만 스킬바 위에 한 줄로 띄운다.
GAME.BattleScene.prototype._showSkillTip = function (slot) {
  if (!this.skillTipText) return;
  var h = this.hero, sk = null, i;
  if (h && h.skills) for (i = 0; i < h.skills.length; i++) if (h.skills[i].slot === slot) sk = h.skills[i];
  if (!sk) return;
  var kind = GAME.skillLabel ? GAME.skillLabel(sk, slot) : '';
  var desc = GAME.skillDesc ? GAME.skillDesc(sk) : '';
  this.skillTipText.setText(slot + ' · ' + sk.name + (kind ? ' (' + kind + ')' : '') + (desc ? ' — ' + desc : ''));
  // 배경은 글자를 재서 맞춘다. 손으로 폭을 박으면 조합에 따라 글자가 삐져나온다.
  var W = GAME.CONFIG.WIDTH;
  var w = Math.min(this.skillTipText.width + 20, W - 16), hgt = this.skillTipText.height + 10;
  var cx = Math.max(w / 2 + 8, Math.min(W - w / 2 - 8, W / 2));
  this.skillTipBg.setSize(w, hgt).setPosition(cx, this._skillTipY).setVisible(true);
  this.skillTipText.setPosition(cx, this._skillTipY - 5).setVisible(true);
};

GAME.BattleScene.prototype._hideSkillTip = function () {
  if (!this.skillTipText) return;
  this.skillTipText.setVisible(false);
  this.skillTipBg.setVisible(false);
};

GAME.BattleScene.prototype.draw = function () {
  var C = GAME.CONFIG.COLORS;
  var Iso = GAME.Iso;
  var g = this.g;
  var s = this.state;
  var i;

  g.clear();
  // 층 분위기 — 통곡의 탑/수성의 탑은 층수로, 층이 없는 모드는 등급으로 바닥이 갈린다.
  // 대전(비동기 PvP)만 중립(밴드 1 풀숲)이다 — 남의 기지를 치는 것이지 탑이 아니다.
  GAME.UI.drawArena(g, {
    zones: false,
    floor: this.tower || this.defendTower || 0,
    tier: this.versus ? 1 : GAME.UI.tierForEscalation(this.escalation).i
  });

  // ── 이펙트 팔레트 ────────────────────────────────────────────────────
  //  색을 여기서 직접 박지 않고 GAME.UI.FX 를 거친다. 라이트 테마(목장)에서
  //  기존 색이 전부 배경보다 밝아 증발했기 때문이다(실측: 예광 1.25:1, 불꽃 1.60:1,
  //  회복 1.13:1, 구체 1.01:1 — 전부 3:1 미만). 어두운 테마 3종은 기본값이 그대로라
  //  한 픽셀도 안 바뀐다.
  //  · FX.ink       : 밝은 배경에서 형태를 붙잡아 주는 어두운 윤곽
  //  · FX.ringAlpha : 얇은 지면 링의 알파 증폭 (밝은 배경에서 반투명은 그냥 사라진다)
  var FX = GAME.UI.FX;
  var RA = FX.ringAlpha, FA = FX.fillAlpha;
  var INK = FX.ink, INKA = FX.inkAlpha;
  // 잉크 윤곽을 두른 지면 링. inkAlpha 가 0(어두운 테마)이면 링 하나만 그린다.
  function ringInk(x, y, rad, w, col, alpha) {
    if (INKA > 0) {
      g.lineStyle(w + 2.5, INK, Math.min(1, alpha * INKA));
      GAME.UI.groundCircle(g, x, y, rad);
    }
    g.lineStyle(w, col, Math.min(1, alpha));
    GAME.UI.groundCircle(g, x, y, rad);
  }

  // ── 스킬 이펙트 A/B 시안 (js/skillfx.js) ─────────────────────────────
  //  파일이 없거나 꺼져 있으면 FXS 가 null 이 되고, 아래 네 루프는 **예전 그림 그대로**
  //  돈다. 위임 규칙은 전부 "true 를 돌려준 것만 건너뛴다" 하나뿐이라,
  //  시안이 모르는 kind(검기·회복·차단·노른자·구체)는 자동으로 원래 코드로 떨어진다.
  var FXS = (GAME.SkillFX && GAME.SkillFX.begin) ? GAME.SkillFX.begin(g, FX, this) : null;

  // ── 지면 레이어: 마커·덫·이펙트 ──
  for (i = 0; i < this.markers.length; i++) {
    var mk = this.markers[i];
    var a = mk.t / mk.total;
    ringInk(mk.x, mk.y, 8 + (1 - a) * 16, 2.5,
      mk.type === 'attack' ? FX.markerAtk : FX.markerMove, a * RA);
  }

  for (i = 0; i < s.traps.length; i++) {
    var tr = s.traps[i];
    if (FXS && FXS.drawTrap(tr, tr.side === 'controller' ? C.controller : C.strategist)) continue;
    g.fillStyle(FX.trap, 0.12 * FA);
    GAME.UI.groundCircleFill(g, tr.x, tr.y, tr.radius);
    ringInk(tr.x, tr.y, tr.radius, 2, FX.trap, 0.85 * RA);
  }

  for (i = 0; i < s.effects.length; i++) {
    var e = s.effects[i];
    var col = e.side === 'controller' ? C.controller : C.strategist;
    if (FXS && FXS.drawEffect(e, col)) continue;

    if (e.kind === 'telegraph') {
      // 예고 원 — 바깥 테두리는 고정, 안쪽 원이 차오르며 "언제 터지는지"를 센다.
      var prog = 1 - e.t / e.total;
      if (prog < 0) prog = 0;
      g.fillStyle(FX.telegraph, (0.10 + prog * 0.20) * FA);
      GAME.UI.groundCircleFill(g, e.x, e.y, e.r);
      ringInk(e.x, e.y, e.r, 2.5, FX.telegraph, (0.5 + prog * 0.5) * RA);
      g.lineStyle(2.5, FX.telegraph, Math.min(1, 0.85 * RA));
      GAME.UI.groundCircle(g, e.x, e.y, e.r * prog);
      // 터지기 직전 — 테두리에 짧은 눈금이 돋는다(카운트다운이 눈에 보이게)
      if (prog > 0.72) {
        var tk = (prog - 0.72) / 0.28;
        g.lineStyle(3, FX.telegraph, tk);
        for (var tn = 0; tn < 8; tn++) {
          var ta = (Math.PI * 2 / 8) * tn;
          var t1 = e.r * 1.0, t2 = e.r * (1.0 + 0.18 * tk);
          g.lineBetween(e.x + Math.cos(ta) * t1, Iso.toScreenY(e.y) + Math.sin(ta) * t1 * Iso.TILT,
                        e.x + Math.cos(ta) * t2, Iso.toScreenY(e.y) + Math.sin(ta) * t2 * Iso.TILT);
        }
      }

    } else if (e.kind === 'blast') {
      // 착탄 섬광 — **면이 아니라 확장하는 고리**가 주역이다.
      // 큰 원을 통째로 칠하면 밝은 들판에 진흙 웅덩이가 하나 생긴다(실제로 그렇게 보였다).
      var b2 = e.t / e.total;              // 1 → 0
      var bx = 1 + (1 - b2) * 0.22;        // 고리가 바깥으로 번진다
      g.fillStyle(FX.blast, Math.min(0.34, 0.30 * b2 * FA));
      GAME.UI.groundCircleFill(g, e.x, e.y, e.r * bx * 0.92);
      g.fillStyle(FX.sparkCore, 0.60 * b2 * b2);
      GAME.UI.groundCircleFill(g, e.x, e.y, e.r * 0.34 * b2);
      ringInk(e.x, e.y, e.r * bx, 3.5, FX.blast, Math.min(1, b2 * 1.1 * RA));
      // 사방으로 뻗는 짧은 불티 — 정지 화면에서도 '터짐'의 방향성이 생긴다
      g.lineStyle(2.5, FX.blast, b2 * 0.8);
      var bsy = Iso.toScreenY(e.y);
      for (var bk = 0; bk < 6; bk++) {
        var bka = (Math.PI * 2 / 6) * bk + 0.4;
        var br0 = e.r * bx * 1.02, br1 = e.r * bx * (1.12 + (1 - b2) * 0.22);
        g.lineBetween(e.x + Math.cos(bka) * br0, bsy + Math.sin(bka) * br0 * Iso.TILT,
                      e.x + Math.cos(bka) * br1, bsy + Math.sin(bka) * br1 * Iso.TILT);
      }

    } else if (e.kind === 'ring') {
      var r2 = e.t / e.total;
      ringInk(e.x, e.y, e.r * (1.15 - r2 * 0.15), 4, col, r2 * RA);

    } else if (e.kind === 'slash') {
      // 근접 부채꼴.
      //  ※ 예전엔 화면 좌표에 정원(正圓) 부채꼴을 그렸다 — 기울인 뷰에서 혼자 서 있어
      //    "어디까지 닿았는지"가 실제 판정(평면 원)과 어긋나 보였다.
      //    transform 으로 y 를 TILT 만큼 눌러 **지면에 눕힌다**. 판정과 그림이 일치한다.
      var sa = e.t / e.total;
      var ssy = Iso.toScreenY(e.y);
      g.save();
      g.translateCanvas(e.x, ssy);
      g.scaleCanvas(1, Iso.TILT);
      if (INKA > 0) {
        g.lineStyle(3.5 / Iso.TILT, INK, Math.min(1, sa * 0.5 * INKA));
        g.beginPath();
        g.arc(0, 0, e.range, e.angle - e.half, e.angle + e.half, false);
        g.strokePath();
      }
      g.fillStyle(col, Math.min(0.5, 0.26 * sa * FA));
      g.slice(0, 0, e.range, e.angle - e.half, e.angle + e.half, false);
      g.fillPath();
      g.lineStyle(3 / Iso.TILT, col, Math.min(1, sa * 0.9 * RA));
      g.beginPath();
      g.arc(0, 0, e.range, e.angle - e.half, e.angle + e.half, false);
      g.strokePath();
      // 달려들며 친 타격 — 바깥으로 한 겹 더 밀려나는 흙먼지 선.
      // **이 그림이 기제의 전부다**: 밀어내기는 승률을 안 바꾸므로(계측),
      // 플레이어가 "움직이며 치는 게 다르다"를 눈으로 배우지 못하면 아무 의미가 없다.
      // 세계관대로 번쩍이는 마법이 아니라 마른 땅에서 이는 먼지로 그린다.
      if (e.charged) {
        g.lineStyle(2.5 / Iso.TILT, col, Math.min(1, sa * 0.45 * RA));
        g.beginPath();
        g.arc(0, 0, e.range * 1.16, e.angle - e.half * 0.82, e.angle + e.half * 0.82, false);
        g.strokePath();
        for (var pk = -1; pk <= 1; pk++) {
          var pka = e.angle + pk * e.half * 0.55;
          g.lineStyle(2 / Iso.TILT, col, Math.min(1, sa * 0.55 * RA));
          g.lineBetween(Math.cos(pka) * e.range * 1.02, Math.sin(pka) * e.range * 1.02,
                        Math.cos(pka) * e.range * 1.26, Math.sin(pka) * e.range * 1.26);
        }
      }
      g.restore();

    } else if (e.kind === 'dashTrail') {
      // 잔상 — 굵은 잉크 심 위에 진영색. 밝은 심지는 아주 얇게만 남긴다
      // (두껍게 넣었더니 진영색이 씻겨 회색 막대가 됐다).
      var da = e.t / e.total;
      var dy1 = Iso.toScreenY(e.y1) - 14, dy2 = Iso.toScreenY(e.y2) - 14;
      if (INKA > 0) {
        g.lineStyle(12, INK, 0.28 * da * INKA);
        g.lineBetween(e.x1, dy1, e.x2, dy2);
      }
      g.lineStyle(9, col, 0.80 * da);
      g.lineBetween(e.x1, dy1, e.x2, dy2);
      g.lineStyle(1.6, FX.projCore, 0.55 * da);
      g.lineBetween(e.x1, dy1 - 2.5, e.x2, dy2 - 2.5);

    } else if (e.kind === 'beam') {
      var ba = e.t / e.total;
      var by1 = Iso.toScreenY(e.y1) - 14, by2 = Iso.toScreenY(e.y2) - 14;
      if (INKA > 0) {
        g.lineStyle(5, INK, 0.45 * ba * INKA);
        g.lineBetween(e.x1, by1, e.x2, by2);
      }
      g.lineStyle(3, FX.beam, ba);
      g.lineBetween(e.x1, by1, e.x2, by2);

    } else if (e.kind === 'spark') {
      // 타격 불꽃 — 4갈래 별. 흰 점 하나는 크림/연둣빛 위에서 안 보이고,
      // 십자 두 줄만으로는 조준 표식처럼 읽혔다. 갈래를 밖으로 뻗어 '탁' 하고 터지게.
      var pa = e.t / e.total;
      var spy = Iso.toScreenY(e.y) - 12;
      var sr = 5 * pa + 3;
      var slen = sr * (2.4 + (1 - pa) * 1.4);
      g.lineStyle(3.5, FX.spark, pa * 0.95);
      for (var sn = 0; sn < 4; sn++) {
        var sang = Math.PI / 4 + (Math.PI / 2) * sn;
        g.lineBetween(e.x + Math.cos(sang) * sr * 0.5, spy + Math.sin(sang) * sr * 0.5,
                      e.x + Math.cos(sang) * slen, spy + Math.sin(sang) * slen);
      }
      g.fillStyle(FX.spark, pa);
      g.fillCircle(e.x, spy, sr + 1.5);
      g.fillStyle(FX.sparkCore, pa);
      g.fillCircle(e.x, spy, sr);

    } else if (e.kind === 'slashWave') {
      // 근접 공격도 뭔가 날아가는 게 보이게 — 짧은 검기가 **호를 그리며** 뻗어나간다.
      // 예전엔 직선 하나였다. 호로 바꾸니 '베었다'가 훨씬 명확해진다.
      var wp = 1 - e.t / e.total;
      var wd = e.range * (0.35 + wp * 0.85);
      var wx = e.x + Math.cos(e.angle) * wd;
      var wy = Iso.toScreenY(e.y + Math.sin(e.angle) * wd) - 14;
      var wspan = 0.62;
      var wr = e.range * 0.55;
      var wa0 = e.angle + Math.PI - wspan, wa1 = e.angle + Math.PI + wspan;
      var wAlpha = (1 - wp);
      if (INKA > 0) {
        g.lineStyle(6, INK, wAlpha * 0.45 * INKA);
        g.beginPath(); g.arc(wx, wy, wr, wa0, wa1, false); g.strokePath();
      }
      g.lineStyle(4.5, col, wAlpha * 0.95);
      g.beginPath(); g.arc(wx, wy, wr, wa0, wa1, false); g.strokePath();
      g.lineStyle(1.6, FX.projCore, wAlpha * 0.7);
      g.beginPath(); g.arc(wx, wy, wr * 0.94, wa0 + 0.08, wa1 - 0.08, false); g.strokePath();

    } else if (e.kind === 'healPulse') {
      // 회복 — 파동 링 + 안쪽 옅은 면. 파스텔 민트는 밝은 들판에서 1.13:1 로 사라진다.
      var ha = e.t / e.total;
      g.fillStyle(FX.heal, Math.min(0.3, ha * 0.07 * FA * 2));
      GAME.UI.groundCircleFill(g, e.x, e.y, e.r);
      ringInk(e.x, e.y, e.r * (1.02 - ha * 0.12), 2.5, FX.heal, ha * 0.85 * RA);
      // 작은 십자 두 개 — '회복'이라는 뜻이 색 없이도 읽힌다
      if (ha > 0.25) {
        var hc = Math.min(1, (ha - 0.25) * 2);
        g.lineStyle(3, FX.heal, hc);
        var hy = Iso.toScreenY(e.y);
        for (var hn = -1; hn <= 1; hn += 2) {
          var hx = e.x + hn * e.r * 0.52, hyy = hy - (1 - ha) * 14;
          g.lineBetween(hx - 5, hyy, hx + 5, hyy);
          g.lineBetween(hx, hyy - 5, hx, hyy + 5);
        }
      }

    } else if (e.kind === 'block') {
      // 방패병이 투사체를 막았다 — 링 + 짧은 파편 4개
      var bl = e.t / e.total;
      var bcy = Iso.toScreenY(e.y) - 14, brd = 12 + (1 - bl) * 10;
      if (INKA > 0) {
        g.lineStyle(5.5, INK, bl * 0.45 * INKA);
        g.strokeCircle(e.x, bcy, brd);
      }
      g.lineStyle(3, FX.block, bl);
      g.strokeCircle(e.x, bcy, brd);
      g.lineStyle(2, FX.block, bl * 0.8);
      for (var bn = 0; bn < 4; bn++) {
        var ba2 = Math.PI / 4 + (Math.PI / 2) * bn;
        g.lineBetween(e.x + Math.cos(ba2) * brd, bcy + Math.sin(ba2) * brd,
                      e.x + Math.cos(ba2) * (brd + 6), bcy + Math.sin(ba2) * (brd + 6));
      }

    } else if (e.kind === 'yolkStain') {
      // 노른자 얼룩 — 잠깐 남았다 사라진다
      var yst = e.t / e.total;
      g.fillStyle(FX.yolk, FX.yolkAlpha * yst);
      GAME.UI.groundCircleFill(g, e.x, e.y, e.r * 1.35);
      g.fillStyle(FX.yolk, FX.yolkAlpha * yst * 0.9);
      GAME.UI.groundCircleFill(g, e.x + e.r * 0.9, e.y + e.r * 0.5, e.r * 0.42);

    } else if (e.kind === 'yolk') {
      GAME.UI.drawYolkBurst(g, e);

    } else if (e.kind === 'lob') {
      // 마법사 구체 — 예고 시간 동안 착탄점으로 날아간다.
      // 지면에 그림자를 같이 찍어 '떠 있다'가 읽히게 한다.
      var lp = 1 - e.t / e.total;
      var lx = e.x1 + (e.x2 - e.x1) * lp;
      var lyw = e.y1 + (e.y2 - e.y1) * lp;
      var ly = Iso.toScreenY(lyw);
      var arc = Math.sin(lp * Math.PI) * 46;      // 포물선
      g.fillStyle(INKA > 0 ? INK : 0x000000, 0.22);
      g.fillEllipse(lx, ly, 20, 20 * Iso.TILT);
      g.fillStyle(FX.lob, 0.30);
      g.fillCircle(lx, ly - arc, 13);
      g.fillStyle(FX.lob, 1);
      g.fillCircle(lx, ly - arc, 7);
      g.fillStyle(FX.lobCore, 0.95);
      g.fillCircle(lx - 1.5, ly - arc - 1.5, 3);
    }
  }

  // 영웅 오라 — 링을 두 겹(잉크 + 진영색)으로 두르고 안쪽 면은 옅게.
  // 밝은 목초지에서 0.10 알파 면은 아예 안 보였다 → 경계선이 오라를 대신 알려준다.
  for (i = 0; i < this.hero.auras.length; i++) {
    var au = this.hero.auras[i];
    if (FXS && FXS.drawAura(this.hero, au, C.controller)) continue;
    g.fillStyle(C.controller, Math.min(0.22, 0.10 * FA));
    GAME.UI.groundCircleFill(g, this.hero.x, this.hero.y, au.radius);
    ringInk(this.hero.x, this.hero.y, au.radius, 2.5, C.controller, 0.65 * RA);
  }

  // ── 유닛: 뒤(위)에서 앞(아래) 순으로 그려 겹침이 자연스럽게 ──
  var alive = [];
  for (i = 0; i < s.units.length; i++) if (s.units[i].alive) alive.push(s.units[i]);
  alive.sort(function (a, b) { return a.y - b.y; });

  // ⚠ **내가 모는 유닛은 y 정렬에서 빼 맨 위에 그린다** (2026-07-30, 실측 근거).
  //   폰 가로에서 근접 접촉 거리는 화면 세로차 16px 인데 알의 그린 높이는 25~33px 이다.
  //   즉 바로 앞 한 기가 뒤 유닛 몸통의 **아래쪽 44~52%** 를 덮는다. 난전에서 내 영웅이
  //   적 몸통에 통째로 파묻히는 것이 그래서다(스크린샷으로 확인).
  //   깊이감을 조금 잃지만, 회피 게임에서 **조작 대상의 위치를 잃는 비용이 훨씬 크다** —
  //   못 찾으면 회피도 스킬 조준도 성립하지 않는다.
  //   되돌릴 지점은 이 한 줄이다. `arrowOn` 을 쓰는 이유: 방어전의 `this.hero` 는 **적**
  //   AI 영웅이라 hero 를 직접 쓰면 모드에 따라 적을 맨 위로 올린다.
  var mine = this.arrowOn;
  if (mine && mine.alive) {
    var mi = alive.indexOf(mine);
    if (mi >= 0) { alive.splice(mi, 1); alive.push(mine); }
  }
  // 표식 오버레이용 좌표 모음. **지역 배열**이다 — 씬 인스턴스에 캐시하면 재진입 때
  // 죽은 유닛의 옛 좌표가 남는다(이 폴더가 겪은 계열의 함정). 매 프레임 새로 만든다.
  var marks = [];

  for (i = 0; i < alive.length; i++) {
    var u = alive[i];
    var color = GAME.UI.sideColor(u.side);
    if (u.flash > 0) color = 0xffffff;

    // 지원 유닛의 영향 범위를 보여준다 — 뭘 해야 할지 판단할 수 있게.
    // 알파 0.28~0.5 짜리 얇은 링은 밝은 들판에서 전부 증발했다 → FX.ringAlpha 로 증폭.
    // (지원 반경은 참고 정보다. 알파를 너무 올리면 큰 원 두 개가 전장을 뒤덮어
    //  정작 봐야 할 투사체·예고 원을 가린다 — 0.30 은 과했다.)
    if (u.def.healRadius) {
      g.lineStyle(1.5, FX.healRing, Math.min(1, 0.26 * RA));
      GAME.UI.groundCircle(g, u.x, u.y, u.def.healRadius);
    }
    if (u.def.buffRadius) {
      g.lineStyle(1.5, FX.buffRing, Math.min(1, 0.24 * RA));
      GAME.UI.groundCircle(g, u.x, u.y, u.def.buffRadius);
    }
    if (u.def.isMine) {
      // 가시덫만은 점선으로 — "밟으면 안 되는 선"이 다른 링과 뜻이 달라야 한다
      g.lineStyle(2, FX.mineRing, Math.min(1, 0.62 * RA));
      var mr = u.def.triggerRadius, myy = Iso.toScreenY(u.y);
      for (var dn = 0; dn < 16; dn++) {
        var da0 = (Math.PI * 2 / 16) * dn, da1 = da0 + (Math.PI * 2 / 16) * 0.55;
        g.beginPath();
        g.moveTo(u.x + Math.cos(da0) * mr, myy + Math.sin(da0) * mr * Iso.TILT);
        g.lineTo(u.x + Math.cos(da1) * mr, myy + Math.sin(da1) * mr * Iso.TILT);
        g.strokePath();
      }
    }
    if (u.def.intercept) {
      g.lineStyle(1.5, FX.guardRing, Math.min(1, 0.34 * RA));
      GAME.UI.groundCircle(g, u.x, u.y, u.def.intercept);
    }
    // 상시 오라(파수꾼의 '무게') — 피해 숫자를 안 띄우기로 했으므로(숫자 폭주 방지)
    // **이 고리가 유일한 안내다.** 사거리 표시가 아니라 "여기 서 있으면 갉힌다"는
    // 구역 표시라, 얇게 숨 쉬듯 흔들리게만 그린다. 전장을 가리면 회피 게임이 아니다.
    // 이동 조건부 오라(파수꾼의 '무게') — 피해 숫자를 안 띄우므로 **이 고리가 유일한 안내다.**
    // 걸을 때만 작동하는 기제라 켜짐/꺼짐이 보여야 배울 수 있다:
    //   멈춰 있으면 아주 흐린 점선 같은 고리(= 여기가 범위다),
    //   걸으면 또렷하게 살아난다(= 지금 갉고 있다).
    // 사거리 표시가 아니라 구역 표시라 어느 쪽이든 얇게만 그린다 — 전장을 가리면 회피 게임이 아니다.
    if (u.def.auraDps && u.def.auraRadius) {
      var aOn = GAME.Combat.isCharging(u);
      var abr = 1 + Math.sin(this.state.elapsed / 620) * (aOn ? 0.05 : 0.02);
      g.lineStyle(aOn ? 2.5 : 1.5, FX.guardRing, Math.min(1, (aOn ? 0.55 : 0.16) * RA));
      GAME.UI.groundCircle(g, u.x, u.y, u.def.auraRadius * abr);
    }

    // 이동량으로 보행 위상을 굴린다 — 걷는 동안만 다리가 움직인다
    var walk = GAME.UI.updateGait(u, this._dt || 16);
    // 피격 휘청임 — 계란은 무게중심이 위에 있는 오뚝이라 맞으면 흔들려야 한다.
    // 맞은 반대 방향으로 밀렸다가 감쇠 진동으로 돌아온다. **그리는 좌표만** 흔들고
    // 월드 좌표(u.x/u.y)는 건드리지 않는다 — 판정·밸런스 불변.
    var hurt = u._hurt || 0;
    var dx = 0, dy = 0;
    if (hurt > 0) {
      var k = hurt / 320;                                  // 1 → 0 으로 잦아든다
      var amp = u.def.radius * 0.42 * k;
      var osc = Math.sin(hurt / 26);                       // 감쇠 진동
      var hd = u._hurtDir || 0;
      dx = Math.cos(hd) * amp * osc;
      dy = Math.sin(hd) * amp * osc * 0.5;                 // 세로는 절반(투영 때문)
    }

    // `footRing: false` — 발밑 링은 루프 뒤 오버레이에서 그린다(여기서 그리면 앞 유닛에
    // 덮인다). `side` 는 **넘기지 않는다** — `drawUnit` 안에서 side 를 쓰는 유일한 자리가
    // 그 발밑 링이라, 링을 끈 상태에서 side 는 아무 일도 하지 않는 죽은 인자다.
    // (어깨띠는 양 진영 같은 모양이므로 side 를 필요로 하지 않는다.)
    var pos = GAME.UI.drawUnit(g, u.def, u.x + dx, u.y + dy, color, 1, u.facing, walk,
                               undefined, { footRing: false, sizeMul: u.eliteDraw || 1 });

    // 껍질 금 + 피격 번쩍 — 체력을 '읽지 않고 보게' 한다
    // ⚠ **여기 가드가 틀려 있었다** (2026-07-30 실측). 옛 코드는 `!GAME.isNonTarget(u.def)`
    //   였는데 그 함수는 "공격 방식이 targeted 인가"를 묻는 것이고 그건 **투창병 한 기뿐**이다
    //   (게임 전체에서 `attack:'targeted'` 1건). 즉 "체력이 줄면 껍질에 금이 간다"는 이 게임의
    //   문법이 **투창병에게만 작동하고 있었다**(호출 1 → 14 로 회복).
    //   원인은 이름이 "조준 대상이 아니다"로 읽히는 것이었고, 그래서 그 함수는 뜻대로
    //   `GAME.isAutoHit` 으로 뒤집어 이름을 바꿨다(units.js 주석 참조).
    //   금이 필요 없는 것은 '체력 개념이 없는 지면 고정물'이므로 아트로 판정한다.
    if (pos && GAME.UI.eggDamage && !GAME.UI.artOf(u.def).ground) {
      if (u.__crackSeed === undefined) u.__crackSeed = Math.floor(Math.random() * 997);
      GAME.UI.eggDamage(g, pos.sx, pos.by,
        u.def.radius * (GAME.UI.UNIT_DRAW_SCALE || 1),
        u.maxHp ? u.hp / u.maxHp : 1, u.__crackSeed, hurt);
    }

    // ⚠ 이름이 오해를 부른다. `FX.targetRing` 이지만 여기서 하는 일은 '조준 가능 표시'가
    //   아니라 **"이 놈의 공격은 회피 불가"** 경고다(`GAME.isAutoHit` = attack === 'targeted').
    //   그래서 실제로 링이 붙는 것은 투창병 한 종류뿐이고, 그건 의도한 동작이다
    //   — 자동명중 유닛을 눈에 띄게 하는 것. 링을 전 유닛에 붙이려면 여기가 아니라
    //   진영 표식(발밑 링 2패스)이 담당한다. **두 링을 헷갈리지 말 것.**
    if (!u.isHero && GAME.isAutoHit(u.def)) {
      g.lineStyle(2, FX.targetRing, Math.min(1, 0.9 * RA));
      GAME.UI.groundCircle(g, u.x, u.y, u.def.radius + 6);
    }

    // 보스 — 발밑에 붉은 이중 고리를 둘러 한눈에 구분되게 한다
    if (GAME.isBoss(u.def)) {
      var pulse = 0.55 + 0.25 * Math.sin(s.elapsed / 280);
      ringInk(u.x, u.y, u.def.radius + 12, 3.5, FX.bossRing, Math.min(1, pulse * RA));
      g.lineStyle(2, FX.bossRing2, Math.min(1, pulse * 0.9 * RA));
      GAME.UI.groundCircle(g, u.x, u.y, u.def.radius + 20);
    }

    if (u.rootedFor > 0) {
      ringInk(u.x, u.y, u.def.radius + 12, 2.5, FX.root, Math.min(1, 0.95 * RA));
    }

    // 바라보는 방향
    g.lineStyle(2.5, color, 0.75);
    g.lineBetween(pos.sx, pos.by,
      pos.sx + Math.cos(u.facing) * (u.def.radius + 9),
      pos.by + Math.sin(u.facing) * (u.def.radius + 9) * Iso.TILT);

    // 조준선 — **내가 모는 영웅**에만. 준비된 스킬 중 가장 긴 사거리만큼 facing 방향으로
    // 옅게 뻗어, 스킬이 바라보는 방향으로 어디까지 닿는지 감으로 조준하게 한다.
    // (조준 탭이 없어졌으므로 이 선이 '예상 사거리'를 알려주는 역할)
    if (this.ctrl && this.ctrl.hero === u && u.alive && u.rootedFor <= 0) {
      var aimReach = 0;
      for (var si = 0; si < u.skills.length; si++) {
        if (u.skillCd[u.skills[si].slot] <= 0) {
          aimReach = Math.max(aimReach, GAME.Combat.skillReach(u.skills[si]));
        }
      }
      if (aimReach < 60) aimReach = 60;
      var aex = pos.sx + Math.cos(u.facing) * aimReach;
      var aey = pos.by + Math.sin(u.facing) * aimReach * Iso.TILT;
      g.lineStyle(2, color, 0.22);
      g.lineBetween(pos.sx, pos.by, aex, aey);
      // 끝에 작은 조준 눈금
      g.lineStyle(2, color, 0.45);
      GAME.UI.groundCircle(g, u.x + Math.cos(u.facing) * aimReach,
        u.y + Math.sin(u.facing) * aimReach, 7);
    }

    // ── 여기서는 아무 표식도 그리지 않는다 — 전부 루프 뒤 오버레이로 모았다 ──
    //  체력바·발밑 링·머리 마커를 루프 안에서 그리면 **뒤에 그려지는(= 더 앞에 있는)
    //  유닛 몸통이 그것들을 덮는다.** 폰 가로 근접 접촉 거리는 화면 세로차 16px 인데
    //  알의 그린 높이는 25~33px 이라, 바로 앞 한 기가 뒤 유닛의 아래쪽 절반을 가린다.
    //  내가 모는 유닛을 맨 위로 올린 뒤에는 **그 몸통이 남의 체력바를 덮는** 문제까지
    //  생기므로(검토에서 지적), 세 표식을 다 같은 오버레이 층으로 옮긴다.
    //
    //  ⚠ 좌표는 반드시 `pos`(drawUnit 이 돌려준 값)를 쓴다 — 걸음걸이·피격 휘청임(dx/dy)이
    //    반영된 값이다. 원좌표 `u.x/u.y` 를 쓰면 맞은 뒤 320ms 동안 링이 발밑에서 떨어진다.
    // ── 정예 표시 (2026-07-31) ────────────────────────────────────────────
    //  정예는 **눈에 띄어야 기제가 성립한다** — "두령을 먼저 끊어라"는 두령이 누군지
    //  보일 때만 요구가 된다. 보스와 같은 문법(발밑 이중 고리)을 쓰되 색을 달리한다.
    if (u.elite) {
      var epulse = 0.5 + 0.25 * Math.sin(s.elapsed / 300);
      ringInk(u.x, u.y, u.def.radius + 14, 3, FX.bossRing2 || FX.bossRing,
              Math.min(1, epulse * RA));
    }

    marks.push({
      // sx/sy = 화면 좌표(footRing 용), wx/wy = 월드 좌표(groundCircle 용).
      // 둘 다 휘청임(dx/dy)이 반영된 값이어야 한다 — 섞으면 맞은 동안 표식이 어긋난다.
      sx: pos.sx, sy: pos.sy, wx: u.x + dx, wy: u.y + dy,
      by: pos.by - u.def.radius - 10,
      r: u.def.radius * (u.eliteDraw || 1),
      drawR: u.def.radius * (GAME.UI.UNIT_DRAW_SCALE || 1) * (u.eliteDraw || 1),
      side: u.side, isHero: u.isHero, mine: (u === this.arrowOn),
      ground: GAME.UI.artOf(u.def).ground,
      bw: u.isHero ? 64 : Math.max(22, u.def.radius * 2.3),
      barH: u.isHero ? 7 : 4,
      ratio: u.hp / u.maxHp,
      shield: u.shield > 0 ? Math.min(1, u.shield / u.maxHp) : 0
    });
  }

  // ═══ 오버레이 층 — 어떤 몸통도 이 위에 오지 않는다 ═══════════════════════
  var ink = (GAME.UI.ART_INK_COLOR !== undefined) ? GAME.UI.ART_INK_COLOR : 0x2a2114;

  // ── ① 발밑 진영 링 — 앞쪽(아래) 반원만 ──────────────────────────────────
  //  앞쪽만 그리는 이유: 위쪽 호는 어차피 자기 몸통 뒤라 값어치가 없고, 반원만 그리면
  //  잉크 면적이 절반으로 줄어 노이즈가 안 늘어난다.
  //  형태로도 갈린다 — controller 실선 / strategist 파선(색맹 대비).
  //  ⚠ 지면 고정물(함정)은 건너뛴다. 여기 가드로 예전 `isNonTarget`(지금 `isAutoHit`) 을 쓰면 **아무것도
  //    안 그려진다** — 그 함수는 이름과 달리 `def.attack !== 'targeted'` 이고 해당 유닛은
  //    투창병 한 기뿐이다(실측으로 잡았다: 호출 0). 아트로 판정하는 것이 맞다.
  if (GAME.UI.EGG_STYLE === 'ivory' && GAME.UI.footRing) {
    for (i = 0; i < marks.length; i++) {
      if (marks[i].ground) continue;
      GAME.UI.footRing(g, marks[i].sx, marks[i].sy, marks[i].drawR,
                       GAME.UI.sideColor(marks[i].side), Math.min(1, 0.85 * RA),
                       marks[i].side, true);
    }
  }

  // ── ② 영웅 강조 링 ──────────────────────────────────────────────────────
  //  ⚠ **모든 영웅에게** 그린다. 예전에 루프 안에 있던 `if (u.isHero)` 링을 '내가 모는
  //    유닛' 전용으로 좁혔더니, 방어전에서 **쳐들어오는 AI 영웅의 표식이 통째로
  //    사라졌다**(defend.js 는 `arrowOn` 이 null 로 시작하고 자기 유닛만 고를 수 있다).
  //    그게 방어전에서 "적 영웅이 어디 있나"의 유일한 신호였다 — 검토에서 잡혔다.
  for (i = 0; i < marks.length; i++) {
    if (!marks[i].isHero || marks[i].mine) continue;
    g.lineStyle(2.5, GAME.UI.sideColor(marks[i].side), Math.min(1, 0.55 * RA));
    GAME.UI.groundCircle(g, marks[i].wx, marks[i].wy, marks[i].r + 10);
  }

  // ── ③ 체력 바 ───────────────────────────────────────────────────────────
  //  라이트 테마에서는 크림 캡슐 + 잉크 테두리로 그려진다
  //  (초록 채움이 초록 들판과 대비 1.02:1 이라 그냥은 보이지 않는다 — ui.js 참고)
  for (i = 0; i < marks.length; i++) {
    GAME.UI.fieldHpBar(g, marks[i].sx - marks[i].bw / 2, marks[i].by,
                       marks[i].bw, marks[i].barH, marks[i].ratio,
                       { shield: marks[i].shield });
  }

  // ── ④ 내가 모는 유닛 — 이중 링 + 머리 마커 ──────────────────────────────
  //  이게 "난전에서 내 유닛을 못 찾는다"는 신고의 물리적 원인(가림)을 **제거**하는 부분이다.
  for (i = 0; i < marks.length; i++) {
    var mk2 = marks[i];
    if (!mk2.mine) continue;
    // 발밑 이중 링: 잉크를 먼저 굵게 깔고 진영색을 얹는다. 밝은 목초지에서도
    // 어두운 필드에서도 두 톤 중 한쪽이 살아남는다(마커와 같은 상보 원리).
    g.lineStyle(4, ink, Math.min(1, 0.45 * RA));
    GAME.UI.groundCircle(g, mk2.wx, mk2.wy, mk2.r + 10);
    g.lineStyle(2.5, GAME.UI.sideColor(mk2.side), Math.min(1, 0.75 * RA));
    GAME.UI.groundCircle(g, mk2.wx, mk2.wy, mk2.r + 10);
    // 머리 위 마커 — 화살촉이 **체력바 바로 위**를 찍게 한다. 4px 만 띄우면 체력바를
    // 안 덮고, 알과 붙어 있어 '누구 것인지' 헷갈리지 않는다.
    GAME.UI.selectArrow(g, mk2.sx, mk2.by - 4, mk2.r, s.elapsed);
  }

  // ── 동전 ──
  //  유닛 **뒤**가 아니라 앞에 그린다. 동전은 유닛이 죽은 자리에 떨어지므로 뒤에 그리면
  //  다음 유닛이 그 위에 서는 순간 통째로 가려진다 — 주우라고 만든 물건이 안 보인다.
  //  대신 지면 그림자를 함께 찍어 '떠 있는 것'이 아니라 '바닥에 놓인 것'으로 읽히게 했다.
  //  표시객체는 0개다 — 전부 이 Graphics 한 장에 들어간다.
  if (this._coins) this._coins.draw(g, this._dt || 16);

  // ── 투사체 ──
  //  "모든 공격은 눈에 보이는 투사체를 갖는다"가 이 게임의 규칙인데, 라이트 테마에서는
  //  기존 색(민트 #7ef0d0 1.16:1 / 살구 #ffb06a 1.12:1)이 들판에 그대로 녹아
  //  그 규칙이 무너져 있었다. 몸통을 잉크 톤으로 내리고 **심지를 밝게** 남겨
  //  '작지만 뜨거운 것이 날아온다'를 유지한다.
  for (i = 0; i < s.projectiles.length; i++) {
    var p = s.projectiles[i];
    var pcol = p.side === 'controller' ? FX.projController : FX.projStrategist;
    // 스킬 투사체(big)만 시안이 가져간다 — 유닛 평타 화살은 예전 그림 그대로다.
    if (FXS && FXS.drawProjectile(p, pcol)) continue;
    var psx = p.x, psy = Iso.toScreenY(p.y) - 12;
    var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1;
    var ux = p.vx / sp, uy = (p.vy / sp) * Iso.TILT;
    var rr = p.radius * (p.big ? 1.5 : 1);
    // 저격탄은 길게 늘어진 예광탄으로 — 유도라 피할 순 없지만 날아오는 게 보인다
    var tail = p.tracer ? 60 : 22;
    // 지면 그림자 — 투사체가 지면 위를 난다는 게 읽힌다(작아도 위치가 잡힌다)
    g.fillStyle(INKA > 0 ? INK : 0x000000, 0.16);
    g.fillEllipse(psx, psy + 12, rr * 2.2, rr * 2.2 * Iso.TILT);
    g.lineStyle(p.tracer ? 3.5 : 4.5, pcol, p.tracer ? 0.45 : 0.22);
    g.lineBetween(psx - ux * tail, psy - uy * tail, psx, psy);
    g.lineStyle(p.tracer ? 2 : 2.5, pcol, p.tracer ? 0.9 : 0.5);
    g.lineBetween(psx - ux * tail * 0.7, psy - uy * tail * 0.7, psx, psy);
    g.fillStyle(pcol, 0.28);
    g.fillCircle(psx, psy, rr + 6);
    g.fillStyle(pcol, 1);
    g.fillCircle(psx, psy, rr + 1);
    g.fillStyle(FX.projCore, 0.95);
    g.fillCircle(psx - rr * 0.18, psy - rr * 0.18, Math.max(1.8, rr - 3));
  }

  if (this.state.over) {
    g.fillStyle(0x000000, 0.45);
    g.fillRect(0, 0, GAME.CONFIG.WIDTH, GAME.CONFIG.HEIGHT);
  }
};
