window.GAME = window.GAME || {};

// 전략가 방어전. 플레이어가 짠 진형을 AI 컨트롤러가 공격하고, 플레이어는 지켜본다.
// (전략가의 본질이 '배치하고 지켜보는 것'이라 조작이 없다 — 배치가 곧 실력이다.)
// AI 컨트롤러는 막힐수록 숙련도를 배워 다음 판이 더 어려워진다.
GAME.DefendScene = function () {
  Phaser.Scene.call(this, { key: 'Defend' });
};
// ── ⚠ BattleScene 을 **상속한다** (2026-08-03, 치명 결함 수정) ────────────────
//  사용자 신고: "수성의탑에서 배치도만들고 방어전시작눌러도 시작이 안 된다."
//
//  원인: 이 씬은 `Phaser.Scene` 만 상속하면서 전투 렌더는 아래처럼 **한 개씩 손으로**
//  빌려 쓰고 있었다 — `BattleScene.prototype.draw.call(this)`.
//  그런데 그 `draw` 는 **BattleScene 에만 있는 보조 메서드**를 부른다:
//    `_bakeArena` · `_frameDt` · `_drawOrbs` · `_drawHealZones`
//  DefendScene 에는 그 넷이 없으니 첫 프레임에서 TypeError 가 나고, 그 예외가
//  Phaser 의 rAF 콜백을 뚫고 나가 **다음 프레임이 예약되지 않는다** → 게임 루프가
//  통째로 죽는다. 입력도 게임 스텝 안에서 돌기 때문에 같이 멈춘다(새로고침 외 복구 불가).
//
//  ⚠ 이건 **다섯 번째로 재발할 구조**였다. `BattleScene.draw` 에 `this._xxx()` 가
//    하나 추가될 때마다 이 씬이 조용히 죽는다 — 실제로 v0.80 `_drawOrbs`,
//    v0.81 `_frameDt`, v1.20 `_bakeArena` 로 세 겹이 쌓였다(QA 이분 탐색으로 확인).
//    그래서 메서드를 네 개 채우는 땜질이 아니라 **프로토타입 체인을 잇는다.**
//    앞으로 BattleScene 에 무엇이 추가되어도 자동으로 따라온다.
//
//  안전한 이유: 이 파일이 `create`·`update`·`init`·`draw`·`drawNumbers`·`showMarker`
//  를 전부 **직접 정의**하므로 생명주기는 그대로 자기 것이 쓰인다(체인은 정의가
//  없는 보조 메서드에만 걸린다). index.html 에서 battle.js 가 먼저 로드된다.
GAME.DefendScene.prototype = Object.create(GAME.BattleScene.prototype);
GAME.DefendScene.prototype.constructor = GAME.DefendScene;

// ── 폰 가로(820×390) 전용 좌표 — 전투 화면 문법(battle.js 와 같다) ────────────
//  전장이 화면을 채우고 정보는 **가장자리에 겹친다.** 다만 전략가는 조작하지 않으므로
//  조이스틱·스킬 버튼이 없다 → 그 자리를 전부 전장에 내줬다.
//   0..56    상단 얇은 띠 : [내 진형 잔존] [남은 시간] [적 영웅 체력]
//   58..366  전장         : Iso.setMode('full') 로 남은 세로를 다 쓴다(272px → 308px)
//   328..378 왼쪽 아래    : [▶ N배속] [☰]  — 전장 위에 겹치는 두 칸이 전부다.
//                           배속은 '지금 상태를 바꾸는 토글'이라 시트에 숨기지 않는다.
//  오른쪽 아래는 DOM 버전 배지(#ver) 자리라 비운다.
GAME.DefendScene.PHONE = {
  PAD: 10,
  BAR_H: 56,
  FIELD_TOP: 58,
  SIDE_W: 252, SIDE_Y: 2, SIDE_H: 52,
  // 버튼 56 → 아이폰 SE(FIT 0.813)에서 화면 45.5px. 50 이면 40.7px 로 미달한다(실측).
  BTN_Y: 322, BTN_H: 56,
  SPEED_W: 132, MENU_W: 56
};

GAME.DefendScene.prototype.init = function (data) {
  this.placed = data.placed;          // [{type,x,y}] 아래 구역 좌표
  this.tier = data.tier;
  this.budget = data.budget;
  this.defendTower = data.defendTower || 0;   // 수성의 탑 층수(0이면 일반 방어전)
  this.ended = false;
  this.speed = 2;          // create() 에서 저장된 값으로 덮어쓴다
  this.markers = [];      // BattleScene.draw 가 참조한다
  // 재진입 때 이미 파괴된 객체를 참조하지 않도록 캐시를 전부 비운다.
  this.sheet = null;
  this.hudTop = null;
  this.hudSub = null;
  this.hudTimer = null;
  this.phTimer = null;
  this.phTimeBar = null;
  this.phUnits = null;
  this.phHeroBar = null;
  this.speedBtn = null;
};

GAME.DefendScene.prototype.create = function () {
  if (GAME.Music) GAME.Music.stop();
  var C = GAME.CONFIG.COLORS;
  var self = this;
  var W = GAME.CONFIG.WIDTH;
  var P = GAME.CONFIG.PORTRAIT;
  var L = GAME.Layout;

  this.cameras.main.setBackgroundColor(C.bg);
  // 방어전 HUD·버튼은 아레나 **아래**에 있으므로 전투용 전체화면 모드를 쓰면 안 된다.
  // 전투 씬에서 켠 모드가 새어 들어오지 않게 여기서 기본값을 확정한다.
  GAME.Iso.setMode('default');
  this.g = this.add.graphics();
  this.state = GAME.Combat.createState();

  // ── 내 영역은 **언제나 화면 아래**다 (2026-07-29, 사용자 지시) ─────────────
  // 예전에는 배치를 mirrorY 로 뒤집어 위쪽에 세우고 AI 영웅이 아래에서 올라왔다.
  // 배치 화면에서는 아래에 놓고 전투에서는 위에 서니 **같은 진형이 뒤집혀 보였다.**
  // 이제 놓은 그대로 아래에 세우고 침입 영웅이 위에서 내려온다.
  //   · 배치 화면 ↔ 전투 화면의 그림이 일치한다(머릿속에서 뒤집을 필요가 없다)
  //   · 나중에 실시간 대전이 붙어도 규칙이 하나다 — **내 쪽이 아래**
  // 저장 포맷(Formations)은 건드리지 않는다. 뒤집기는 저장할 때만 한다.
  for (var i = 0; i < this.placed.length; i++) {
    var p = this.placed[i];
    if (!GAME.UNITS[p.type]) continue;
    // 수성의 탑에서 올린 유닛 레벨(1~5)을 반영해 만든다.
    // 레벨 1이면 Combat.createUnit 을 그대로 부르는 것과 완전히 동일하다(실측 확인).
    var mine = GAME.UnitLevel
      ? GAME.UnitLevel.createUnit(p.type, p.x, p.y, 'strategist')
      : GAME.Combat.createUnit(p.type, p.x, p.y, 'strategist');
    // 아래에 섰으니 위를 본다. `_baseUnit` 은 side 로만 시선을 정하므로 여기서 바로잡는다 —
    // 안 고치면 전 유닛이 등을 보이고 서 있다(무기도 몸통에 가려진다).
    mine.facing = -Math.PI / 2;
    this.state.units.push(mine);
  }

  // AI 컨트롤러가 공격해 온다.
  //  · 일반 방어전 : 이 ID 가 학습시킨 숙련도로.
  //  · 수성의 탑   : 그 층의 숙련·영웅·예산·강화 배수로(층이 오를수록 세짐).
  var heroMods = null;
  if (this.defendTower) {
    var DT = GAME.DefendTower;
    this.aiSkill = DT.skillFor(this.defendTower);
    this.budget = DT.heroBudgetFor(this.defendTower);      // 층 고정 영웅 예산
    heroMods = DT.heroModsFor(this.defendTower);
  } else {
    var ctrl = GAME.Learn.getCtrl();
    this.aiSkill = ctrl.skill || 0;
  }

  // 숙련도가 오르면 더 좋은 영웅·장비를 골라 온다.
  // 수색대(원거리)는 얇아서 숙련도가 충분히 높을 때만 쓴다 — 어설프게 들면
  // 오히려 낮은 숙련도보다 약해지는 역전이 생긴다(실측으로 확인).
  var heroKey = this.defendTower
    ? GAME.DefendTower.heroKeyFor(this.defendTower, this.aiSkill)
    : (this.aiSkill < 0.3 ? 'vanguard' : (this.aiSkill < 0.78 ? 'warden' : 'ranger'));
  var items = this._pickItems(heroKey, this.budget);
  var picks = { Q: 0, W: 0, E: 0, R: 0 };
  if (this.aiSkill > 0.5) { picks.Q = 1; picks.R = 1; }

  // 침입 영웅은 **위에서** 내려온다(내 영역이 아래이므로).
  var Z = GAME.CONFIG.ZONE_STRATEGIST;
  //  ── 10층마다 보스 (2026-08-03 사용자 지시) ────────────────────────────────
  //  "수성의탑 10층마다 보스는 통곡의탑하고 동일한 보스가 나오게 해줘.
  //   당연히 주변유닛은 없겠지. 용의알 같은 경우 통곡의탑에선 움직이지 않는건
  //   수성의탑에선 움직이게해줘"
  //
  //  통곡의 탑과 **같은 표**(GAME.Tower.BOSS_SCHEDULE)를 쓴다 — 두 탑에서 같은
  //  층에 같은 얼굴이 나와야 "10층엔 거대 족장" 같은 기억이 생긴다.
  //  ⚠ 호위는 없다. 여기서 진형은 **내 것**이고 쳐들어오는 쪽이 보스 하나다.
  //  ⚠ 보스는 혼자 오므로 **반드시 움직여야 한다.** 통곡의 탑에서는 내가 다가가지만
  //    여기서는 보스가 내 진형까지 와야 싸움이 시작된다 — 용의 알처럼
  //    `immobile: true, speed: 0` 인 보스를 그대로 두면 90초 내내 아무 일도 안 일어난다.
  var bossKey = (this.defendTower && GAME.DefendTower.isBossFloor(this.defendTower) &&
                 GAME.Tower.BOSS_SCHEDULE) ? GAME.Tower.BOSS_SCHEDULE[this.defendTower] : null;
  if (bossKey && GAME.UNITS[bossKey]) {
    //  진형 강화 배수를 그대로 태운다(층이 오를수록 세진다). createUnit 이 def 를
    //  복제하므로 아래 덮어쓰기가 통곡의 탑 쪽으로 새지 않는다.
    this.hero = GAME.Combat.createUnit(bossKey, Z.x + Z.w / 2, Z.y + Z.h * 0.45,
                                       'controller', heroMods || null);
    var bd = this.hero.def;
    //  걸어오게 만든다. 원래 값이 0 이면 이 게임의 근접 유닛 정도 속도를 준다.
    if (!(bd.speed > 0)) bd.speed = 96;
    bd.immobile = false;
    bd.chase = 4000;        // 맵 어디든 쫓아온다 — 자기 자리를 지킬 이유가 없다
    bd.aggro = 4000;
    //  ⚠ **보스 기본 스탯을 그대로 쓰면 안 된다.** 그 값들은 통곡의 탑의
    //    거대한 추종 배수(hpMul, 수십~수백 배)에 곱해질 것을 전제로 잡은
    //    작은 숫자다(기본 체력 150~300). 수성의 탑에는 그 배수가 없어서
    //    그대로 두면 10층 보스가 전사 6기에게 죽는다(실측: 체력 499, 40초에 사망).
    //
    //    그래서 **이 층에 원래 올 영웅을 기준으로 정규화**한다. 보스는 혼자
    //    오므로 영웅보다 확실히 두꺼워야 하고, 대신 수가 없으니 화력은 조금만 위다.
    //    이렇게 두면 통곡의 탑 쪽 기본값을 나중에 다시 잡아도 여기가 안 흔들린다.
    var rh = GAME.HEROES[heroKey];
    if (rh) {
      //  ⚠ **층 강화를 기준값에도 태워야 한다.** 보스에는 `heroModsFor` 를 이미
      //    곱해 놓고 기준을 영웅의 *기본* 스탯으로 잡으면 그 배수가 그대로 상쇄되어
      //    보스 체력이 층과 무관하게 고정된다(실측: 10~50층 내내 2,100~3,500).
      //    그 사이 내 진형은 예산 196→366, 8기→17기로 자라므로 **뒤로 갈수록 쉬워진다**
      //    (방어 성공률 10층 75% → 50층 100%). 기준에도 같은 강화를 태워 상쇄를 없앤다.
      var hm = heroMods || { hp: 1, damage: 1 };
      var refEhp = (rh.hp || 1) * (hm.hp || 1) * (1 + (rh.armor || 0) / 100);
      var bEhp = (bd.hp || 1) * (1 + (bd.armor || 0) / 100);
      var hpMul = (refEhp * this.DEFEND_BOSS_EHP) / Math.max(1, bEhp);
      bd.hp = Math.max(1, Math.round(bd.hp * hpMul));
      var refDps = ((rh.damage || 1) * (hm.damage || 1)) / ((rh.cooldown || 1000) / 1000);
      var bDps = (bd.damage || 1) / ((bd.cooldown || 1000) / 1000);
      var dmgMul = (refDps * this.DEFEND_BOSS_DMG) / Math.max(0.01, bDps);
      bd.damage = Math.max(1, Math.round(bd.damage * dmgMul));
      //  스킬도 같은 배수로 옮겨 설계된 비율(평타 1 : 스킬 2 : 궁극기 5)을 지킨다.
      var scaleAb = function (a) {
        if (!a) return;
        if (a.damage) a.damage = Math.max(1, Math.round(a.damage * dmgMul));
        if (a.dps) a.dps = Math.max(1, Math.round(a.dps * dmgMul));
      };
      scaleAb(bd.ability);
      (bd.abilities || []).forEach(scaleAb);
    }
    this.hero.maxHp = bd.hp; this.hero.hp = bd.hp;
    this.hero.isBoss = true;
    this.bossKey = bossKey;
  } else {
    this.hero = GAME.Combat.createHero(heroKey, Z.x + Z.w / 2, Z.y + Z.h * 0.45, 'controller', items, picks);
  }
  this.hero.facing = Math.PI / 2;
  // 층 강화 — 통곡의 탑이 진형을 강화하듯, 수성의 탑은 공격 영웅을 강화한다.
  //  ⚠ 보스는 `createUnit(…, heroMods)` 로 이미 강화를 받았다 — 여기서 또 곱하면 두 번 센다.
  if (heroMods && !this.bossKey) {
    this.hero.def.hp = Math.round(this.hero.def.hp * (heroMods.hp || 1));
    this.hero.def.damage = Math.round(this.hero.def.damage * (heroMods.damage || 1));
    this.hero.maxHp = this.hero.def.hp;
    this.hero.hp = this.hero.def.hp;
  }
  this.state.units.push(this.hero);
  // 수성의 탑 골드 — 영웅 체력을 조각낼 때마다 보상한다(적이 1기뿐이라 '처치 단위'가 없다).
  if (this.defendTower && GAME.DefendTower && GAME.DefendTower.attachKillGold) {
    GAME.DefendTower.attachKillGold(this.state, this.defendTower);
    // 동전을 눈에 보이게 뿌린다. 전략가는 유닛을 조작하지 않아 **주우러 갈 수가 없으므로**
    // 자동 수거로 둔다(통곡의 탑은 주우러 가는 것 자체가 조작이라 수동이 맞다).
    // 수거 지점은 내 진형의 한복판 — 돈이 '내 쪽으로' 흘러오는 게 보여야 한다.
    if (GAME.Coins) {
      // 이름을 `_coins` 로 맞춘다 — 그리기는 BattleScene.draw 를 빌려 쓰는데
      // 그쪽이 `this._coins` 를 본다. 다른 이름으로 두면 동전이 안 보인다.
      this._coins = GAME.Coins.create(this, this.state);
      var CZ = GAME.CONFIG.ZONE_STRATEGIST;
      this._coins.setAuto(GAME.CONFIG.ARENA.x + GAME.CONFIG.ARENA.w / 2,
                         GAME.mirrorY(CZ.y + CZ.h * 0.5));
      this._segShown = 0;
    }
  }
  //  ⚠ 보스는 영웅이 아니라 유닛이라 `skills`/`skillCd` 가 없다 — AIHero 를 붙이면
  //    없는 것을 만지다 죽는다. 보스는 `Combat.update` 의 일반 유닛 AI(chase/aggro)가
  //    몰고 오고, 자기 `ability`/`abilities` 도 그쪽에서 그대로 돈다.
  this.ai = this.bossKey ? null : new GAME.AIHero(this.state, this.hero, this.aiSkill);

  // 전략가는 조작하지 않지만, 특정 유닛을 눌러 추적할 수는 있어야 한다.
  // 누르면 그 유닛 머리 위에 **흰 채움 + 잉크 테두리** 마커가 뜨고 발밑에 이중 링이 생긴다.
  // (체력바 굵기는 선택과 무관하다 — `u.isHero ? 7 : 4` 다. 옛 주석이 그렇게 적고 있었다.)
  // 쳐들어오는 AI 영웅은 고를 수 없지만, 영웅 강조 링은 `battle.js` 오버레이가 따로 그린다.
  this.arrowOn = null;
  this.input.on('pointerdown', function (p) {
    // ☰ 시트가 열려 있으면 전장은 잠긴다. 상단 띠·좌하단 버튼 위의 탭도 전장 탭이 아니다.
    if (self.sheet) return;
    if (self._hudEats(p.x, p.y)) return;
    if (p.y > GAME.Iso.screenRect().bottom) return;
    var w = GAME.Iso.toWorld(p.x, p.y);
    var hit = GAME.Combat.unitAt(self.state, w.x, w.y, 'strategist');
    self.arrowOn = (hit && hit === self.arrowOn) ? null : hit;
  });

  this.state.adapt = { medicFollow: 0, guardFollow: 0, kite: 0, rallyBias: 0 };
  this.state.telemetry.medicPlaced = true;
  this.state.telemetry.guardPlaced = true;

  // ── HUD ────────────────────────────────────────────────────────────────
  var PH = GAME.CONFIG.PHONE;
  var UI = GAME.UI;
  var K = GAME.DefendScene.PHONE;
  var hud = L.hud();
  var pad = PH ? K.PAD : hud.pad;

  // 방어전은 조작이 없어서 실측 60~68초를 그냥 지켜봐야 한다(컨트롤러 판은 19~32초).
  // 그래서 **2배속을 기본값**으로 두고, 고른 배속은 다음 판에도 기억한다.
  var SPEEDS = [1, 2, 4];
  this.speed = GAME.Store.get('asymgame.defendSpeed', 2);
  if (SPEEDS.indexOf(this.speed) === -1) this.speed = 2;

  function speedLabel() {
    // 작은 화면(폰 가로·세로)은 짧게. 세로에서 '(탭/스페이스)'까지 넣으면 라벨이
    // 버튼(125px)을 넘어 삐져나온다(실측 — 예전부터 그랬다).
    return (PH || P) ? ('▶ ' + self.speed + '배속') : ('▶ ' + self.speed + '배속  (탭/스페이스)');
  }
  function cycleSpeed() {
    self.speed = SPEEDS[(SPEEDS.indexOf(self.speed) + 1) % SPEEDS.length];
    GAME.Store.set('asymgame.defendSpeed', self.speed);
    if (self.speedBtn) self.speedBtn.text.setText(speedLabel());
  }

  if (PH) {
    // ── 폰 가로 — 전장이 주인공. 정보는 위 띠에 겹치고, 버튼은 좌하단 두 칸뿐 ──
    // 내 진형 총원(전투 시작 시점) — '몇 기 남았나'를 비율로 읽게 한다.
    this.myTotal = Math.max(1, GAME.Combat.aliveCount(this.state, 'strategist'));

    UI.panel(this, 8, K.SIDE_Y, K.SIDE_W, K.SIDE_H,
      { level: 1, radius: UI.R.md, alpha: 0.9, shadow: false });
    UI.text(this, 18, K.SIDE_Y + 4,
      '내 진형' + (this.defendTower ? ('  ·  수성의 탑 ' + this.defendTower + '층') : ''),
      { size: 'caption', color: C.accentAlt });
    this.phUnits = UI.meter(this, 18, K.SIDE_Y + 28, K.SIDE_W - 20, 20, {
      color: C.strategist, seg: Math.min(12, this.myTotal), danger: 0.25,
      label: { size: 'caption', align: 'center' }
    });

    var rx = GAME.CONFIG.WIDTH - 8 - K.SIDE_W;
    UI.panel(this, rx, K.SIDE_Y, K.SIDE_W, K.SIDE_H,
      { level: 1, radius: UI.R.md, alpha: 0.9, shadow: false });
    UI.text(this, rx + 10, K.SIDE_Y + 4,
      '침입 ' + this._attackerName() + '  ·  숙련 ' + Math.round(this.aiSkill * 100) + '%',
      { size: 'caption', color: UI.TXT.danger });
    this.phHeroBar = UI.meter(this, rx + 10, K.SIDE_Y + 28, K.SIDE_W - 20, 20, {
      color: UI.COL.hpBad, danger: -1, label: { size: 'caption', align: 'center' }
    });

    // 남은 시간 — 이 화면에서 가장 자주 보는 숫자라 가장 크게, 정중앙에(battle.js 와 동일).
    this.phTimer = UI.text(this, GAME.CONFIG.WIDTH / 2, 1, '', {
      size: 'numLg', color: C.text, origin: 0.5, originY: 0, outline: true, lineSpacing: 0
    });
    this.phTimeBar = UI.meter(this, GAME.CONFIG.WIDTH / 2 - 100,
      1 + Math.max(34, Math.ceil(this.phTimer.height)) + 3, 200, 5, {
        color: UI.COL.controller, danger: 0.17, dangerColor: 0xf0a86a,
        radius: 2.5, gloss: false
      });

    // 좌하단 두 칸 — 배속(모드 토글이라 항상 보인다)과 ☰
    var bcy = K.BTN_Y + K.BTN_H / 2;
    this.speedBtn = UI.button(this, K.PAD + K.SPEED_W / 2, bcy, K.SPEED_W, K.BTN_H,
      speedLabel(), cycleSpeed,
      { fontSize: 'buttonSm', line: C.controller, color: C.accent, hitPad: 6 });
    UI.button(this, K.PAD + K.SPEED_W + 8 + K.MENU_W / 2, bcy, K.MENU_W, K.BTN_H, '☰',
      function () { self._toggleSheet(); }, { fontSize: 'button', hitPad: 6 });

    // 전장을 남은 세로 전부로 넓힌다 — 조작 패드가 없으니 아래를 비워둘 이유가 없다.
    // **씬을 떠날 때 반드시 되돌린다**(아래 shutdown) — 안 그러면 배치 화면이 깨진다.
    GAME.Iso.setMode('full', K.FIELD_TOP);
  } else {
    var rows = L.rows([
      { name: 'a', h: P ? 22 : 26, gap: 6 },
      { name: 'b', h: P ? 22 : 24, gap: 10 },
      { name: 'c', h: P ? 42 : 46, gap: 0 }
    ]);

    this.hudTop = UI.label(this, pad, rows.a.y, '', P ? 17 : 18, C.accentAlt, 0);
    this.hudTimer = UI.label(this, W - pad, rows.a.y, '', P ? 17 : 22, C.text, 1).setOrigin(1, 0);
    // 왼쪽 문구가 **오른쪽 정렬된 타이머 자리까지 밀고 들어가 겹쳤다**(세로, 실측 74px).
    // 타이머('88.8초')가 쓸 폭을 미리 떼어놓고, 넘치면 잘라 넣는다.
    this.hudTopMaxW = W - pad * 2 - (P ? 62 : 96);
    this.hudSub = UI.label(this, pad, rows.b.y, '', P ? 15 : 14, C.textDim, 0);
    this.hudSubMaxW = W - pad * 2;

    var bc = L.cols(3, { gap: 10 });
    this.speedBtn = UI.button(this, bc[0].cx, rows.c.cy, bc[0].w, rows.c.h,
      speedLabel(), cycleSpeed,
      { fontSize: 15, line: GAME.CONFIG.COLORS.controller, color: C.accent });
    UI.button(this, bc[1].cx, rows.c.cy, bc[1].w, rows.c.h, '배치 다시', function () {
      self.scene.start('Build', self.defendTower ? { defendTower: self.defendTower } : undefined);
    }, { fontSize: 15 });
    UI.button(this, bc[2].cx, rows.c.cy, bc[2].w, rows.c.h, '메뉴', function () {
      self.scene.start('Menu');
    }, { fontSize: 15 });
  }
  this.input.keyboard.on('keydown-SPACE', cycleSpeed);

  this.events.on('shutdown', function () {
    self._closeSheet();
    // ★ 폰 가로에서 이 씬은 투영을 직접 바꿔 쓴다 — 되돌리지 않으면 배치 화면이 깨진다.
    GAME.Iso.setMode('default');
  });

  // 피해 숫자 풀 (전투 화면과 동일하게 보여준다)
  // 흰 글자+검정 테두리는 어두운 배경 전제라 크림 목초지에서 안 읽힌다 → battle.js 와 같이 뒤집는다.
  var numLight = GAME.UI.IS_LIGHT;
  var numFill = numLight ? '#2A2114' : '#ffffff';
  var numStroke = numLight ? (GAME.UI.TXT.textOutline || '#FFFCF0') : '#000000';
  // drawNumbers 는 BattleScene 것을 그대로 쓴다(defend.js:292) — 그런데 그 함수는
  // `this.numFill` 을 읽는다. 여기서는 지역변수로만 두고 있어서 실제로는
  // setColor(undefined) 가 호출되고 있었다(풀 기본색이라 티가 안 났을 뿐).
  this.numFill = numFill;
  this.numStroke = numStroke;
  this.numHeroFill = numLight ? '#8E1520' : '#ff8f8f';
  this.numTakenFill = numLight ? '#7A6A58' : '#9a8f8c';
  // 방어전의 플레이어는 **전략가**다 — 영웅은 적이므로 강조 대상이 뒤집힌다.
  this._heroIsPlayer = false;
  this.numPool = [];
  for (var n = 0; n < 26; n++) {
    this.numPool.push(this.add.text(0, 0, '', {
      fontFamily: GAME.CONFIG.FONT, fontSize: '18px', color: numFill,
      stroke: numStroke, strokeThickness: 4
    }).setOrigin(0.5).setVisible(false));
  }
};

GAME.DefendScene.prototype._pickItems = function (heroKey, budget) {
  var items = { weapon: null, armor: null, boots: null, potion: null };
  var left = budget - GAME.HERO_BASE_COST;
  var plan = [['armor', ['a3', 'a2', 'a1']], ['weapon', ['w3', 'w2', 'w1']],
              ['boots', ['b3', 'b2', 'b1']], ['potion', ['p3', 'p2', 'p1']]];
  var share = [0.42, 0.34, 0.14, 0.10];
  for (var i = 0; i < plan.length; i++) {
    var cap = left * share[i] + 6;
    var list = plan[i][1];
    for (var k = 0; k < list.length; k++) {
      var it = GAME.Items.find(plan[i][0], list[k]);
      if (it.cost <= cap &&
          GAME.HERO_BASE_COST + GAME.Items.totalCost(items) + it.cost <= budget) {
        items[plan[i][0]] = it.key; break;
      }
    }
  }
  return items;
};

GAME.DefendScene.prototype.update = function (time, delta) {
  var dt = Math.min(delta, 50);
  if (!this.state.over) {
    for (var s = 0; s < this.speed; s++) {
      if (this.state.over) break;
      if (this.ai) this.ai.update(dt);
      GAME.Combat.update(this.state, dt);
    }
  }

  this._dt = dt;          // 걸음걸이 위상 (draw 는 BattleScene 것을 빌려 쓴다)
  this._tickCoins(dt);
  this.draw();
  this.drawNumbers();
  this.updateHud();

  if (this.state.over && !this.ended) {
    this.ended = true;
    var self = this;
    // AI 컨트롤러가 이겼는가 = 내 진형이 뚫렸는가
    var aiWon = this.state.winner === 'controller';
    var defended = !aiWon;   // 무승부(시간초과)도 방어 성공으로 본다

    // 수성의 탑: 승패를 층에 반영한다. 숙련도는 층이 정하므로 Learn 은 건드리지 않는다.
    var towerRec = null, learnNotes = [];
    if (this.defendTower) {
      towerRec = defended
        ? GAME.DefendTower.clear(this.defendTower, this.placed.slice(), this.tier, this.state)
        : GAME.DefendTower.fail();
    } else {
      var rec = GAME.Learn.recordCtrl(aiWon, { timedOut: this.state.winner === 'draw' });
      this.aiSkill = rec.skill;
      learnNotes = rec.lastNotes || [];
    }

    var id = GAME.Account.current();
    // 수성의 탑은 층수를, 일반 방어전은 AI 숙련을 난이도(escalation)로 점수에 반영한다.
    var esc = this.defendTower ? this.defendTower : Math.round((this.aiSkill || 0) * 10);
    var score = GAME.Score.forResult({
      won: defended, asStrategist: true, budget: this.budget, escalation: esc
    });
    if (id) {
      GAME.Score.add(id, {
        score: score, won: defended, asStrategist: true,
        escalation: esc,
        formationName: this.defendTower ? ('수성의 탑 ' + this.defendTower + '층') : '내 진형(방어)'
      });
    }

    this.time.delayedCall(1100, function () {
      self.scene.start('Result', {
        winner: self.state.winner,
        defendMode: true,
        defendTower: self.defendTower,
        towerRec: towerRec,
        aiSkill: self.aiSkill,
        score: score,
        learnNotes: learnNotes
      });
    });
  }
};

// 영웅 체력이 한 조각(GOLD_SEGMENTS 분의 1) 깎일 때마다 동전을 떨군다.
// ⚠ 회계의 주인은 여전히 `DefendTower.earnedFrom` 이다. 여기서 뿌리는 동전은
//   **그 값의 예고편**이지 별도 통장이 아니다 — 두 벌이 되면 화면과 기록이 어긋난다.
//   그래서 동전 액수는 표시용으로만 쓰고, 층 보상은 전투가 끝난 뒤 한 번 계산한다.
GAME.DefendScene.prototype._tickCoins = function (dt) {
  if (!this._coins) return;
  var DT = GAME.DefendTower, st = this.state;
  var maxHp = st._dgHeroMaxHp || 0;
  if (maxHp > 0 && this.hero) {
    var lost = Math.max(0, 1 - Math.max(0, this.hero.hp) / maxHp);
    var seg = Math.floor(lost * DT.GOLD_SEGMENTS);
    while (this._segShown < seg) {
      this._segShown++;
      var per = (st._dgPool || 0) * DT.GOLD_DAMAGE_SHARE / DT.GOLD_SEGMENTS;
      st.killGoldEvents = st.killGoldEvents || [];
      st.killGoldEvents.push({ x: this.hero.x, y: this.hero.y, gold: Math.max(1, Math.round(per)) });
      st.killGold = (st.killGold || 0) + Math.max(1, Math.round(per));
    }
  }
  this._coins.update(dt, null);
};

GAME.DefendScene.prototype.updateHud = function () {
  var C = GAME.CONFIG.COLORS;
  var remain = Math.max(0, GAME.CONFIG.BATTLE_TIME - this.state.elapsed / 1000);
  var P = GAME.CONFIG.PORTRAIT;
  var PH = GAME.CONFIG.PHONE;
  var SM = P || PH;

  // ── 폰 가로 — 상단 얇은 띠 세 칸(내 진형 / 남은 시간 / 적 영웅) ──────────
  if (PH) {
    var alive = GAME.Combat.aliveCount(this.state, 'strategist');
    this.phUnits.set(alive / this.myTotal).setText(alive + ' / ' + this.myTotal + '기');
    this.phTimer.setText(remain.toFixed(1) + '초');
    this.phTimer.setColor(remain < 15 ? C.warn : C.text);
    this.phTimeBar.set(GAME.CONFIG.BATTLE_TIME ? remain / GAME.CONFIG.BATTLE_TIME : 0);
    var hAlive = this.hero.alive;
    this.phHeroBar.set(hAlive && this.hero.maxHp ? this.hero.hp / this.hero.maxHp : 0);
    this.phHeroBar.setText(hAlive ? (Math.ceil(this.hero.hp) + ' / ' + this.hero.maxHp) : '격퇴');
    return;
  }

  this.hudTimer.setText(remain.toFixed(1) + '초');
  this.hudTimer.setColor(remain < 15 ? C.warn : C.text);

  // 세로는 폭이 420 뿐이라 '숙련도'는 아랫줄로 내린다 — 윗줄은 타이머와 자리를 나눠 쓴다.
  var hp = (this.hero.alive ? Math.ceil(this.hero.hp) : 0) + '/' + this.hero.maxHp;
  this.hudTop.setText(SM
    ? ('내 진형 ' + GAME.Combat.aliveCount(this.state, 'strategist') + '기  ·  ' +
       this._attackerName() + '  HP ' + hp)
    : ('내 진형 ' + GAME.Combat.aliveCount(this.state, 'strategist') + '기  vs  AI ' +
       this._attackerName() + ' (숙련도 ' + Math.round(this.aiSkill * 100) + '%)  HP ' + hp));
  // 그래도 넘치면 잘라낸다 — 문구·폰트가 바뀌어도 겹치지 않는다는 보장은 여기서 나온다.
  // (보통 한 번도 안 돈다)
  var guard = 0;
  while (this.hudTop.width > this.hudTopMaxW && guard++ < 40) {
    var s = this.hudTop.text;
    this.hudTop.setText(s.slice(0, Math.max(4, s.length - 2 - (s.slice(-1) === '…' ? 1 : 0))) + '…');
  }
  this.hudSub.setText(SM
    ? ('AI 숙련도 ' + Math.round(this.aiSkill * 100) + '%  ·  배치로 싸웁니다 — 지켜보세요  ·  ' +
       this.speed + '배속')
    : ('전략가는 배치로 싸웁니다 — 지켜보세요. AI는 막힐수록 다음 판에 더 잘합니다.  ·  현재 ' +
       this.speed + '배속'));
  var subMax = this.hudSubMaxW || (GAME.CONFIG.WIDTH - (P ? 24 : 48));
  var guard2 = 0;
  while (this.hudSub.width > subMax && guard2++ < 60) {
    var s2 = this.hudSub.text;
    this.hudSub.setText(s2.slice(0, Math.max(4, s2.length - 2 - (s2.slice(-1) === '…' ? 1 : 0))) + '…');
  }
};

// 상단 띠·좌하단 버튼 위의 탭은 전장 탭이 아니다.
// 이 가드가 없으면 배속을 누를 때마다 그 아래 유닛이 같이 선택된다.
GAME.DefendScene.prototype._hudEats = function (x, y) {
  if (!GAME.CONFIG.PHONE) return false;
  var K = GAME.DefendScene.PHONE;
  if (y < K.FIELD_TOP) return true;
  if (y >= K.BTN_Y - 6 && x <= K.PAD + K.SPEED_W + 8 + K.MENU_W + 6) return true;
  return false;
};

// ═══════════════════════════════════════════════════════════════════════════
//  ☰ 시트 (폰 가로 전용) — 배치 다시 · 메뉴
//  배속은 여기 넣지 않는다. 지금 상태를 바꾸는 토글은 항상 보여야 한다.
// ═══════════════════════════════════════════════════════════════════════════
GAME.DefendScene.prototype._toggleSheet = function () {
  if (this.sheet) this._closeSheet(); else this._openSheet();
};

GAME.DefendScene.prototype._closeSheet = function () {
  if (!this.sheet) return;
  var o = this.sheet;
  this.sheet = null;
  for (var i = 0; i < o.length; i++) if (o[i] && o[i].destroy) o[i].destroy();
};

GAME.DefendScene.prototype._openSheet = function () {
  var self = this;
  var C = GAME.CONFIG.COLORS, UI = GAME.UI;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  this._closeSheet();

  var objs = [];
  var pw = 520, px0 = Math.round((W - pw) / 2), py0 = 74, phh = 190;
  var bw = Math.floor((pw - 40 - 24) / 3), bh = 56;
  var cy = py0 + phh - 42;

  var veil = this.add.rectangle(W / 2, H / 2, W, H, UI.COL.bg, 0.74).setDepth(900);
  veil.setInteractive();
  veil.on('pointerdown', function () { self._closeSheet(); });
  objs.push(veil);
  objs.push(UI.panel(this, px0, py0, pw, phh, { level: 1 }).setDepth(901));

  objs.push(UI.text(this, W / 2, py0 + 12, '방어전',
    { size: 'subhead', color: C.text, origin: 0.5, originY: 0 }).setDepth(902));
  objs.push(UI.text(this, W / 2, py0 + 46,
    '전략가는 배치로 싸웁니다 — 지켜보세요.',
    { size: 'micro', color: C.textDim, origin: 0.5, originY: 0 }).setDepth(902));
  objs.push(UI.text(this, W / 2, py0 + 70,
    this.defendTower
      ? ('수성의 탑 ' + this.defendTower + '층  ·  막아내면 다음 층')
      : ('AI는 막힐수록 다음 판에 더 잘합니다  ·  숙련도 ' +
         Math.round((this.aiSkill || 0) * 100) + '%'),
    { size: 'micro', color: UI.TXT.crit, origin: 0.5, originY: 0 }).setDepth(902));

  function mk(i, label, fn, opts) {
    var b = UI.button(self, px0 + 20 + i * (bw + 12) + bw / 2, cy, bw, bh, label, fn, opts);
    b.setDepth(902);
    objs.push(b);
    return b;
  }
  mk(0, '배치 다시', function () {
    self._closeSheet();
    self.scene.start('Build', self.defendTower ? { defendTower: self.defendTower } : undefined);
  }, { fontSize: 'buttonSm' });
  mk(1, '← 메뉴', function () {
    self._closeSheet(); self.scene.start('Menu');
  }, { fontSize: 'buttonSm' });
  mk(2, '닫기', function () { self._closeSheet(); }, { fontSize: 'buttonSm' });

  this.sheet = objs;
};

//  보스는 혼자 온다 — 영웅 대비 유효체력 배수와 초당 피해 배수.
//  실측으로 잡았다(tools/defend-boss-sim.js) — 1.4배/0.9배에서 방어 성공률이
//  50~83% 구간에 들어온다. 3.2배는 전층 0%, 1.8배도 대부분 0% 였다. 한 마리가 너무 아프면
//  진형이 손쓸 새 없이 녹고, 그러면 '배치로 막는다'는 이 모드의 축이 무너진다.
GAME.DefendScene.prototype.DEFEND_BOSS_EHP = 1.4;
GAME.DefendScene.prototype.DEFEND_BOSS_DMG = 0.9;

//  공격자 이름 — 영웅이면 영웅 이름, 보스면 유닛 이름.
//  ⚠ `createHero` 는 `unit.hero` 를 붙이지만 `createUnit` 은 안 붙인다.
//    보스 층에서 `this._attackerName()` 을 그냥 읽으면 매 프레임 TypeError 가 난다
//    (v1.23 에서 고친 '빌려 쓴 것이 없어서 죽는' 사고와 같은 종류다).
GAME.DefendScene.prototype._attackerName = function () {
  var h = this.hero;
  if (!h) return '';
  return (h.hero && h.hero.name) || (h.def && h.def.name) || '침입자';
};

GAME.DefendScene.prototype.showMarker = function () { };

// 전투 렌더·피해 숫자는 BattleScene 과 동일한 규칙을 그대로 쓴다
GAME.DefendScene.prototype.draw = function () {
  GAME.BattleScene.prototype.draw.call(this);
};

GAME.DefendScene.prototype.drawNumbers = function () {
  GAME.BattleScene.prototype.drawNumbers.call(this);
};
