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
  this.startPos = data.startPos || { x: 600, y: 590 };
  this.ended = false;
  this.markers = [];
};

GAME.BattleScene.prototype.create = function () {
  var C = GAME.CONFIG.COLORS;
  var self = this;

  this.cameras.main.setBackgroundColor(C.bg);
  this.g = this.add.graphics();

  this.state = GAME.Combat.createState();

  // 난이도 — 탑은 층수로, 일반 대전은 격파 횟수(escalation)로 강해진다
  var lrec = GAME.Learn.get(this.formation.id);
  this.escalation = this.tower ? (this.tower - 1) : (lrec.escalation || 0);
  var mods = this.tower ? GAME.Tower.modsFor(this.tower)
                        : GAME.Learn.escalationMods(this.escalation);
  var bias = (lrec.adapt && lrec.adapt.rallyBias) || 0;

  for (var i = 0; i < this.formation.units.length; i++) {
    var e = this.formation.units[i];
    if (!GAME.UNITS[e.type]) continue;
    var w = GAME.Formations.toWorld(e);
    // 학습(rallyBias): 영웅이 자주 들어오던 쪽으로 진형을 조금 기울인다
    var wx = w.x + bias * GAME.CONFIG.ARENA.w * 0.06;
    wx = Math.max(GAME.CONFIG.ARENA.x + 20, Math.min(GAME.CONFIG.ARENA.right - 20, wx));
    this.state.units.push(GAME.Combat.createUnit(e.type, wx, w.y, 'strategist', mods));
  }

  this.hero = GAME.Combat.createHero(
    this.heroKey, this.startPos.x, this.startPos.y, 'controller', this.items, this.picks);
  this.state.units.push(this.hero);
  this.arrowOn = this.hero;      // 내가 모는 유닛 위에 빨간 화살표

  // 학습형 AI: 이 배치도가 지금까지 배운 적응값을 전투에 적용한다
  this.state.adapt = GAME.Learn.get(this.formation.id).adapt;
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
  var L = GAME.Layout;
  var hud = L.hud();
  var P = GAME.CONFIG.PORTRAIT;
  var W = GAME.CONFIG.WIDTH;

  // 이번 판의 '등급'. 뽑기가 없는 게임이라 등급은 **난이도**에 붙인다.
  var tierObj = this.tower
    ? GAME.UI.tierForFloor(this.tower, !!this.formation.boss)
    : GAME.UI.tierForEscalation(this.escalation);
  var tierLabel = this.tower
    ? ('탑 ' + this.tower + '층 · ' + tierObj.name)
    : ('난이도 ' + this.escalation + '단계 · ' + tierObj.name);

  this.hud = GAME.UI.battleHud(this, {
    top: hud.top,
    boss: !!this.formation.boss,
    tierIndex: tierObj.i,
    tierLabel: tierLabel
  });

  // HUD 높이는 보스 유무로 달라진다 → **실측 높이**를 첫 행으로 넣어 아래를 밀어낸다.
  // 손으로 y 를 박으면 보스 층에서만 조용히 겹친다.
  //
  // padMode(세로 터치)는 스킬바를 안 만드므로 **높이를 예약하지도 않는다.**
  // 예약해 두는 바람에 힌트가 조작 패드 쪽으로 102px 밀려 있었다.
  var padMode = GAME.isTouch && P;
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
      self.skillBoxes.push({
        slot: slot, rect: rect,
        key: GAME.UI.label(self, c.x + 6, rows.skills.y + 4, GAME.isTouch ? '' : slot, 14, C.accent, 0),
        name: GAME.UI.label(self, c.cx, rows.skills.bottom - 14, '', P ? 13 : 12, C.text, 0.5).setOrigin(0.5),
        cd: GAME.UI.label(self, c.cx, cy, '', P ? 17 : 20, C.text, 0.5).setOrigin(0.5)
      });
    })(slots[s], s);
  }

  if (!padMode) {
    var pc = cols[4];
    var prect = this.add.rectangle(pc.cx, rows.skills.cy, pc.w, boxH, GAME.UI.COL.surface).setStrokeStyle(1, GAME.UI.COL.border);
    prect.setInteractive({ useHandCursor: true });
    prect.on('pointerdown', function () { GAME.Combat.usePotion(self.hero); });
    GAME.UI.label(this, pc.x + 6, rows.skills.y + 4, GAME.isTouch ? '' : 'F', 14, C.accent, 0);
    this.potionText = GAME.UI.label(this, pc.cx, rows.skills.cy, '', P ? 17 : 15, C.text, 0.5).setOrigin(0.5);
    GAME.UI.label(this, pc.cx, rows.skills.bottom - 14, '물약', P ? 13 : 12, C.text, 0.5).setOrigin(0.5);
  }

  this.hintText = GAME.UI.label(this, W / 2, rows.hint.y, this._hintDefault(), P ? 13 : 13, GAME.CONFIG.COLORS.textFaint, 0.5)
    .setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(W - hud.pad * 2);

  // 떠오르는 피해 숫자 — Text 를 미리 만들어 돌려 쓴다(매 프레임 생성은 비싸다).
  // 흰 글자 + 검정 테두리는 어두운 배경 전제였다. 밝은 목초지 위에서는
  // 흰 글자가 배경과 2.1:1 밖에 안 나와 테두리만 보이고 숫자가 안 읽혔다.
  // → 라이트 테마에서는 **어두운 글자 + 밝은 테두리**로 뒤집는다(만화 말풍선과 같은 원리).
  var numLight = GAME.UI.IS_LIGHT;
  this.numFill = numLight ? '#2A2114' : '#ffffff';
  this.numStroke = numLight ? (GAME.UI.TXT.textOutline || '#FFFCF0') : '#000000';
  this.numHeroFill = numLight ? '#8E1520' : '#ff8f8f';
  this.numPool = [];
  for (var n = 0; n < 26; n++) {
    this.numPool.push(this.add.text(0, 0, '', {
      fontFamily: GAME.CONFIG.FONT, fontSize: '18px', color: this.numFill,
      stroke: this.numStroke, strokeThickness: 4
    }).setOrigin(0.5).setVisible(false));
  }

  // 모바일 세로 — 로블록스식 조작 패드(왼쪽 스틱 + 오른쪽 원형 버튼).
  // 가로에서는 마우스+키보드가 더 정확하므로 띄우지 않는다.
  if (GAME.isTouch && P) {
    this.pad = new GAME.TouchPad(this, this.ctrl);
    this.ctrl.pad = this.pad;
  }

  this.events.on('shutdown', function () {
    if (self.ctrl) self.ctrl.destroy();
    if (self.pad) { self.pad.destroy(); self.pad = null; }
    if (self.hud) { self.hud.destroy(); self.hud = null; }
  });
};

GAME.BattleScene.prototype._hintDefault = function () {
  // 세로 터치에서는 상시 안내를 두지 않는다. 버튼에 '공격/Q/W/E/R/물약' 이 이미 적혀 있고,
  // 보스 층은 HUD 가 158px 로 커져서 이 문구가 스킬 버튼 위로 내려앉는다.
  // (조준 대기 같은 **일시적 안내**는 계속 이 라벨을 쓴다)
  if (GAME.isTouch && GAME.CONFIG.PORTRAIT) return '';
  return GAME.isTouch
    ? '한 번 탭: 이동하며 교전   ·   두 번 탭: 이동만   ·   스킬 버튼: 바라보는 방향 시전'
    : '우클릭 이동 / 적 클릭 공격   ·   방향키 직접 이동   ·   Q W E R 바라보는 방향 시전   ·   F 물약   ·   Space 기본공격';
};

GAME.BattleScene.prototype.showMarker = function (x, y, type) {
  this.markers.push({ x: x, y: y, type: type, t: 450, total: 450 });
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
    t.setFontSize(n.crit ? (GAME.CONFIG.PORTRAIT ? 30 : 28) : (GAME.CONFIG.PORTRAIT ? 20 : 18));
    t.setColor(n.crit ? C.crit : (n.onHero ? this.numHeroFill : this.numFill));
    t.setAlpha(Math.max(0, 1 - prog * prog));
    t.setPosition(n.x + (n.drift || 0) * prog, Iso.toScreenY(n.y) - 26 - prog * 46);
  }
  for (; used < pool.length; used++) pool[used].setVisible(false);
};

GAME.BattleScene.prototype.update = function (time, delta) {
  var dt = Math.min(delta, 50);

  if (!this.state.over) {
    this.ctrl.update(dt);
    GAME.Combat.update(this.state, dt);
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
    var self = this;

    // 학습형 AI: 이 판의 관측치를 배치도에 기록한다.
    // '전략가가 이겼는가' 기준이므로 컨트롤러 승리는 진형의 패배다.
    var t = this.state.telemetry;
    var xs = t.heroXSamples;
    var learnRec = GAME.Learn.record(this.formation.id, this.state.winner === 'strategist', {
      medicPlaced: t.medicPlaced, medicHealed: t.medicHealed,
      guardPlaced: t.guardPlaced, guardBlocked: t.guardBlocked,
      rangedDiedInMelee: t.rangedDiedInMelee,
      strategistUnits: t.strategistUnits, engagedUnits: t.engagedUnits,
      heroSideAvg: xs.length ? xs.reduce(function (a, b) { return a + b; }, 0) / xs.length : undefined
    });

    // 이 배치도의 방어 전적 — 진형 선택·준비·결과 화면이 이 값을 읽는다.
    // 여기서 기록하지 않으면 세 화면 모두 영원히 '전적 없음'으로 남는다(실제로 그랬다).
    // 기준은 winRate 와 같은 '전략가(방어) 승률'이다.
    GAME.Formations.recordResult(this.formation.id,
      this.state.winner === 'strategist' ? 'win'
        : (this.state.winner === 'controller' ? 'loss' : 'draw'));

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
    if (id && score > 0) {
      GAME.Score.add(id, {
        score: score, won: won, asStrategist: false,
        escalation: this.escalation, formationName: this.formation.name,
        tower: this.tower
      });
    }

    // 플레이어 성향 누적 — AI 전략가가 다음 배치를 짤 때 쓴다
    GAME.Profile.record(this.heroKey, t);

    // 통곡의 탑 진행 처리
    var towerRec = null;
    if (this.tower) {
      towerRec = won ? GAME.Tower.clear(this.tower) : GAME.Tower.fail();
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
        learnNotes: learnRec.lastNotes || []
      });
    });
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
    var cd = h.skillCd[b.slot];
    var ready = cd <= 0;
    b.cd.setText(ready ? '준비' : (cd / 1000).toFixed(1));
    b.cd.setColor(ready ? C.accent : C.textDim);
    b.rect.setStrokeStyle(1, GAME.UI.COL.border);
    b.rect.setFillStyle(GAME.UI.COL.surface);
  }

  this.hintText.setText(this._hintDefault());
  this.hintText.setColor(GAME.CONFIG.COLORS.textFaint);

  // 세로 터치에서는 하단 스킬바를 안 만든다 → 물약 표시도 없다(원형 패드가 대신한다)
  if (this.potionText) this.potionText.setText(h.potionCharges > 0 ? h.potionCharges + '회' : '없음');
  if (this.potionText) this.potionText.setColor(h.potionCharges > 0 ? C.text : C.textDim);
};

GAME.BattleScene.prototype.draw = function () {
  var C = GAME.CONFIG.COLORS;
  var Iso = GAME.Iso;
  var g = this.g;
  var s = this.state;
  var i;

  g.clear();
  GAME.UI.drawArena(g, { zones: false });

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

  // ── 지면 레이어: 마커·덫·이펙트 ──
  for (i = 0; i < this.markers.length; i++) {
    var mk = this.markers[i];
    var a = mk.t / mk.total;
    ringInk(mk.x, mk.y, 8 + (1 - a) * 16, 2.5,
      mk.type === 'attack' ? FX.markerAtk : FX.markerMove, a * RA);
  }

  for (i = 0; i < s.traps.length; i++) {
    var tr = s.traps[i];
    g.fillStyle(FX.trap, 0.12 * FA);
    GAME.UI.groundCircleFill(g, tr.x, tr.y, tr.radius);
    ringInk(tr.x, tr.y, tr.radius, 2, FX.trap, 0.85 * RA);
  }

  for (i = 0; i < s.effects.length; i++) {
    var e = s.effects[i];
    var col = e.side === 'controller' ? C.controller : C.strategist;

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
    g.fillStyle(C.controller, Math.min(0.22, 0.10 * FA));
    GAME.UI.groundCircleFill(g, this.hero.x, this.hero.y, au.radius);
    ringInk(this.hero.x, this.hero.y, au.radius, 2.5, C.controller, 0.65 * RA);
  }

  // ── 유닛: 뒤(위)에서 앞(아래) 순으로 그려 겹침이 자연스럽게 ──
  var alive = [];
  for (i = 0; i < s.units.length; i++) if (s.units[i].alive) alive.push(s.units[i]);
  alive.sort(function (a, b) { return a.y - b.y; });

  for (i = 0; i < alive.length; i++) {
    var u = alive[i];
    var color = GAME.UI.sideColor(u.side);
    if (u.flash > 0) color = 0xffffff;

    if (u.isHero) {
      g.lineStyle(2.5, C.controller, Math.min(1, 0.55 * RA));
      GAME.UI.groundCircle(g, u.x, u.y, u.def.radius + 10);
    }

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

    // 이동량으로 보행 위상을 굴린다 — 걷는 동안만 다리가 움직인다
    var walk = GAME.UI.updateGait(u, this._dt || 16);
    var pos = GAME.UI.drawUnit(g, u.def, u.x, u.y, color, 1, u.facing, walk);

    if (!u.isHero && !GAME.isNonTarget(u.def)) {
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

    // 체력 바 — 라이트 테마에서는 크림 캡슐 + 잉크 테두리로 그려진다.
    // (초록 채움이 초록 들판과 대비 1.02:1 이라 그냥은 보이지 않는다 — ui.js 참고)
    var bw = u.isHero ? 64 : Math.max(22, u.def.radius * 2.3);
    var ratio = u.hp / u.maxHp;
    var by = pos.by - u.def.radius - 10;
    GAME.UI.fieldHpBar(g, pos.sx - bw / 2, by, bw, u.isHero ? 7 : 4, ratio,
      { shield: u.shield > 0 ? Math.min(1, u.shield / u.maxHp) : 0 });

    // 선택 표시. 전투에서는 내가 모는 영웅, 방어전에서는 전략가가 고른 유닛이다.
    // (방어전의 this.hero 는 **적** AI 영웅이라 여기서 hero 를 직접 쓰면 안 된다)
    if (u === this.arrowOn && u.alive) {
      GAME.UI.selectArrow(g, pos.sx, by - 8, u.def.radius, s.elapsed);
    }
  }

  // ── 투사체 ──
  //  "모든 공격은 눈에 보이는 투사체를 갖는다"가 이 게임의 규칙인데, 라이트 테마에서는
  //  기존 색(민트 #7ef0d0 1.16:1 / 살구 #ffb06a 1.12:1)이 들판에 그대로 녹아
  //  그 규칙이 무너져 있었다. 몸통을 잉크 톤으로 내리고 **심지를 밝게** 남겨
  //  '작지만 뜨거운 것이 날아온다'를 유지한다.
  for (i = 0; i < s.projectiles.length; i++) {
    var p = s.projectiles[i];
    var pcol = p.side === 'controller' ? FX.projController : FX.projStrategist;
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
