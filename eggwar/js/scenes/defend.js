window.GAME = window.GAME || {};

// 전략가 방어전. 플레이어가 짠 진형을 AI 컨트롤러가 공격하고, 플레이어는 지켜본다.
// (전략가의 본질이 '배치하고 지켜보는 것'이라 조작이 없다 — 배치가 곧 실력이다.)
// AI 컨트롤러는 막힐수록 숙련도를 배워 다음 판이 더 어려워진다.
GAME.DefendScene = function () {
  Phaser.Scene.call(this, { key: 'Defend' });
};
GAME.DefendScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.DefendScene.prototype.constructor = GAME.DefendScene;

GAME.DefendScene.prototype.init = function (data) {
  this.placed = data.placed;          // [{type,x,y}] 아래 구역 좌표
  this.tier = data.tier;
  this.budget = data.budget;
  this.defendTower = data.defendTower || 0;   // 수성의 탑 층수(0이면 일반 방어전)
  this.ended = false;
  this.speed = 2;          // create() 에서 저장된 값으로 덮어쓴다
  this.markers = [];      // BattleScene.draw 가 참조한다
};

GAME.DefendScene.prototype.create = function () {
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

  // 내 진형을 위쪽(전투 기준)으로 뒤집어 배치한다 — 배치 화면과 같은 규칙
  for (var i = 0; i < this.placed.length; i++) {
    var p = this.placed[i];
    if (!GAME.UNITS[p.type]) continue;
    this.state.units.push(GAME.Combat.createUnit(p.type, p.x, GAME.mirrorY(p.y), 'strategist'));
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

  var Z = GAME.CONFIG.ZONE_CONTROLLER;
  this.hero = GAME.Combat.createHero(heroKey, Z.x + Z.w / 2, Z.y + Z.h * 0.55, 'controller', items, picks);
  // 층 강화 — 통곡의 탑이 진형을 강화하듯, 수성의 탑은 공격 영웅을 강화한다.
  if (heroMods) {
    this.hero.def.hp = Math.round(this.hero.def.hp * (heroMods.hp || 1));
    this.hero.def.damage = Math.round(this.hero.def.damage * (heroMods.damage || 1));
    this.hero.maxHp = this.hero.def.hp;
    this.hero.hp = this.hero.def.hp;
  }
  this.state.units.push(this.hero);
  this.ai = new GAME.AIHero(this.state, this.hero, this.aiSkill);

  // 전략가는 조작하지 않지만, 특정 유닛을 눌러 추적할 수는 있어야 한다.
  // 누르면 빨간 화살표가 그 유닛을 따라다니고 체력바가 굵게 표시된다.
  this.arrowOn = null;
  this.input.on('pointerdown', function (p) {
    if (p.y > GAME.Iso.screenRect().bottom) return;
    var w = GAME.Iso.toWorld(p.x, p.y);
    var hit = GAME.Combat.unitAt(self.state, w.x, w.y, 'strategist');
    self.arrowOn = (hit && hit === self.arrowOn) ? null : hit;
  });

  this.state.adapt = { medicFollow: 0, guardFollow: 0, kite: 0, rallyBias: 0 };
  this.state.telemetry.medicPlaced = true;
  this.state.telemetry.guardPlaced = true;

  // HUD
  var hud = L.hud();
  var rows = L.rows([
    { name: 'a', h: P ? 22 : 26, gap: 6 },
    { name: 'b', h: P ? 22 : 24, gap: 10 },
    { name: 'c', h: P ? 42 : 46, gap: 0 }
  ]);

  this.hudTop = GAME.UI.label(this, hud.pad, rows.a.y, '', P ? 17 : 18, C.accentAlt, 0);
  this.hudTimer = GAME.UI.label(this, W - hud.pad, rows.a.y, '', P ? 17 : 22, C.text, 1).setOrigin(1, 0);
  // 왼쪽 문구가 **오른쪽 정렬된 타이머 자리까지 밀고 들어가 겹쳤다**(세로, 실측 74px).
  // 타이머('88.8초')가 쓸 폭을 미리 떼어놓고, 넘치면 잘라 넣는다.
  this.hudTopMaxW = W - hud.pad * 2 - (P ? 62 : 96);
  this.hudSub = GAME.UI.label(this, hud.pad, rows.b.y, '', P ? 15 : 14, C.textDim, 0);

  var bc = L.cols(3, { gap: 10 });

  // 방어전은 조작이 없어서 실측 60~68초를 그냥 지켜봐야 한다(컨트롤러 판은 19~32초).
  // 그래서 **2배속을 기본값**으로 두고, 고른 배속은 다음 판에도 기억한다.
  var SPEEDS = [1, 2, 4];
  this.speed = GAME.Store.get('asymgame.defendSpeed', 2);
  if (SPEEDS.indexOf(this.speed) === -1) this.speed = 2;

  function speedLabel() { return '▶ ' + self.speed + '배속  (탭/스페이스)'; }
  function cycleSpeed() {
    self.speed = SPEEDS[(SPEEDS.indexOf(self.speed) + 1) % SPEEDS.length];
    GAME.Store.set('asymgame.defendSpeed', self.speed);
    self.speedBtn.text.setText(speedLabel());
  }

  this.speedBtn = GAME.UI.button(this, bc[0].cx, rows.c.cy, bc[0].w, rows.c.h,
    speedLabel(), cycleSpeed,
    { fontSize: P ? 15 : 15, line: GAME.CONFIG.COLORS.controller, color: C.accent });
  this.input.keyboard.on('keydown-SPACE', cycleSpeed);
  GAME.UI.button(this, bc[1].cx, rows.c.cy, bc[1].w, rows.c.h, '배치 다시', function () {
    self.scene.start('Build', self.defendTower ? { defendTower: self.defendTower } : undefined);
  }, { fontSize: P ? 15 : 15 });
  GAME.UI.button(this, bc[2].cx, rows.c.cy, bc[2].w, rows.c.h, '메뉴', function () {
    self.scene.start('Menu');
  }, { fontSize: P ? 15 : 15 });

  // 피해 숫자 풀 (전투 화면과 동일하게 보여준다)
  // 흰 글자+검정 테두리는 어두운 배경 전제라 크림 목초지에서 안 읽힌다 → battle.js 와 같이 뒤집는다.
  var numLight = GAME.UI.IS_LIGHT;
  var numFill = numLight ? '#2A2114' : '#ffffff';
  var numStroke = numLight ? (GAME.UI.TXT.textOutline || '#FFFCF0') : '#000000';
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
  var left = budget - GAME.HEROES[heroKey].cost;
  var plan = [['armor', ['a3', 'a2', 'a1']], ['weapon', ['w3', 'w2', 'w1']],
              ['boots', ['b3', 'b2', 'b1']], ['potion', ['p3', 'p2', 'p1']]];
  var share = [0.42, 0.34, 0.14, 0.10];
  for (var i = 0; i < plan.length; i++) {
    var cap = left * share[i] + 6;
    var list = plan[i][1];
    for (var k = 0; k < list.length; k++) {
      var it = GAME.Items.find(plan[i][0], list[k]);
      if (it.cost <= cap &&
          GAME.HEROES[heroKey].cost + GAME.Items.totalCost(items) + it.cost <= budget) {
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
      this.ai.update(dt);
      GAME.Combat.update(this.state, dt);
    }
  }

  this._dt = dt;          // 걸음걸이 위상 (draw 는 BattleScene 것을 빌려 쓴다)
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
        ? GAME.DefendTower.clear(this.defendTower, this.placed.slice(), this.tier)
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

GAME.DefendScene.prototype.updateHud = function () {
  var C = GAME.CONFIG.COLORS;
  var remain = Math.max(0, GAME.CONFIG.BATTLE_TIME - this.state.elapsed / 1000);
  this.hudTimer.setText(remain.toFixed(1) + '초');
  this.hudTimer.setColor(remain < 15 ? C.warn : C.text);

  // 세로는 폭이 420 뿐이라 '숙련도'는 아랫줄로 내린다 — 윗줄은 타이머와 자리를 나눠 쓴다.
  var P = GAME.CONFIG.PORTRAIT;
  var hp = (this.hero.alive ? Math.ceil(this.hero.hp) : 0) + '/' + this.hero.maxHp;
  this.hudTop.setText(P
    ? ('내 진형 ' + GAME.Combat.aliveCount(this.state, 'strategist') + '기  ·  ' +
       this.hero.hero.name + '  HP ' + hp)
    : ('내 진형 ' + GAME.Combat.aliveCount(this.state, 'strategist') + '기  vs  AI ' +
       this.hero.hero.name + ' (숙련도 ' + Math.round(this.aiSkill * 100) + '%)  HP ' + hp));
  // 그래도 넘치면 잘라낸다 — 문구·폰트가 바뀌어도 겹치지 않는다는 보장은 여기서 나온다.
  // (보통 한 번도 안 돈다)
  var guard = 0;
  while (this.hudTop.width > this.hudTopMaxW && guard++ < 40) {
    var s = this.hudTop.text;
    this.hudTop.setText(s.slice(0, Math.max(4, s.length - 2 - (s.slice(-1) === '…' ? 1 : 0))) + '…');
  }
  this.hudSub.setText(P
    ? ('AI 숙련도 ' + Math.round(this.aiSkill * 100) + '%  ·  배치로 싸웁니다 — 지켜보세요  ·  ' +
       this.speed + '배속')
    : ('전략가는 배치로 싸웁니다 — 지켜보세요. AI는 막힐수록 다음 판에 더 잘합니다.  ·  현재 ' +
       this.speed + '배속'));
  var subMax = GAME.CONFIG.WIDTH - (P ? 24 : 48);
  var guard2 = 0;
  while (this.hudSub.width > subMax && guard2++ < 60) {
    var s2 = this.hudSub.text;
    this.hudSub.setText(s2.slice(0, Math.max(4, s2.length - 2 - (s2.slice(-1) === '…' ? 1 : 0))) + '…');
  }
};

GAME.DefendScene.prototype.showMarker = function () { };

// 전투 렌더·피해 숫자는 BattleScene 과 동일한 규칙을 그대로 쓴다
GAME.DefendScene.prototype.draw = function () {
  GAME.BattleScene.prototype.draw.call(this);
};

GAME.DefendScene.prototype.drawNumbers = function () {
  GAME.BattleScene.prototype.drawNumbers.call(this);
};
