window.GAME = window.GAME || {};

// ============================================================================
//  통곡의 탑 — 도전 진입 로딩 (2026-08-01, 요청 12·13)
//
//  "도전을 들어가면 항상 의도적으로 3초 정도의 로딩 시간이 걸리게 하고, 로딩 바가
//   진척되면서 이번 진형은 어떻게 배치되었는지, 그리고 각 전략 유닛마다 특징을
//   1줄씩 랜덤으로 띄워줘. 예를 들면 '투창병의 공격은 피할 수 없으니, 먼저
//   제거를 추천드립니다' 이런 식으로."
//
//  필요한 정보는 전투 시작 전에 **이미 다 준비돼 있다** — `formation.planLabel/
//  planHint`(배치 원형), `formation.ruleLabel/ruleDesc`(층 조건), `formation.units`
//  (이 층 적 구성). 유닛별 전술 팁만 새로 저작했다(`js/units.js` 에는 세계관 설명만
//  있고 전술 조언이 없었다).
//
//  ⚠ **영웅/스킬은 `js/towerchar.js` 에서 직접 읽는다.** `js/scenes/tower.js` 의
//    `_enterBattle` 은 formationId/tower/heroKey 만 넘긴다 — Battle 씬 진입 계약을
//    두 곳에 복제하지 않기 위해서다(그 파일의 상습 사고 경고 참조).
// ============================================================================

// 유닛 키 → 전술 팁 후보(2개씩). `js/units.js` 의 desc/ability 를 근거로 새로 썼다.
GAME.TOWER_UNIT_TIPS = {
  bayonet: [
    '전사는 뭉쳐서 벽을 만드니, 벽을 허물 한 방이 필요합니다.',
    '전사의 돌진은 짧은 예비 동작이 있으니, 미리 피하면 무력화됩니다.'
  ],
  rifleman: [
    '궁수의 화살은 직선으로만 날아가니, 좌우로 움직이면 피할 수 있습니다.',
    '궁수는 한 자리에 오래 서 있으면 정조준에 맞으니, 계속 움직이는 것이 좋습니다.'
  ],
  grenadier: [
    '투석꾼의 돌은 예고 뒤에 터지니, 그림자가 보이면 그 자리를 벗어나세요.',
    '투석꾼은 사거리가 길지 않으니, 먼저 접근해 끊는 것도 방법입니다.'
  ],
  sniper: [
    '투창병의 공격은 피할 수 없으니, 먼저 제거를 추천드립니다.',
    '투창병은 다시 던지기까지 오래 걸리니, 첫 발만 버티면 여유가 생깁니다.'
  ],
  medic: [
    '약초꾼을 먼저 끊으면 진형이 무너집니다.',
    '약초꾼은 스스로 싸우지 않으니, 원거리 공격으로 먼저 지우는 것이 효율적입니다.'
  ],
  shieldman: [
    '방패병은 날아가는 공격을 대신 맞아주니, 먼저 지우면 뒤가 뚫립니다.',
    '방패병의 돌진은 준비 동작이 보이니, 미리 피하면 거리를 벌릴 수 있습니다.'
  ],
  sergeant: [
    '족장이 살아있으면 주변이 강해지니, 먼저 노리는 것이 좋습니다.',
    '족장의 포효가 터지면 진형 전체가 강해지니, 그 순간에는 거리를 두세요.'
  ],
  chemtrooper: [
    '늪지기에게 맞으면 느려지니, 거리를 유지하는 전략은 오히려 위험할 수 있습니다.',
    '늪지기의 둔화는 넓게 퍼지니, 뭉쳐 있지 않는 것이 좋습니다.'
  ],
  mgnest: [
    '쇠뇌 진지는 움직이지 않으니, 위치만 바꿔도 피할 수 있습니다.',
    '쇠뇌 진지는 맵 어디든 닿으니, 숨을 곳을 찾기보다 빠르게 접근하는 것이 낫습니다.'
  ],
  mine: [
    '가시덫은 밟기 전까지 보이지 않으니, 급하게 뛰어들지 마세요.',
    '가시덫은 배치도당 하나뿐이니, 한 번 확인하면 그 자리만 피하면 됩니다.'
  ]
};

GAME.TowerLoadingScene = function () {
  Phaser.Scene.call(this, { key: 'TowerLoading' });
};
GAME.TowerLoadingScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.TowerLoadingScene.prototype.constructor = GAME.TowerLoadingScene;

GAME.TowerLoadingScene.DURATION = 3000;

GAME.TowerLoadingScene.prototype.init = function (data) {
  this.formationId = data.formationId;
  this.tower = data.tower || 0;
  this.heroKey = data.heroKey;
  this._t = 0;
  this._meter = null;
};

GAME.TowerLoadingScene.prototype.create = function () {
  var C = GAME.CONFIG.COLORS;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var self = this;
  this.cameras.main.setBackgroundColor(C.bg);

  var formation = GAME.Formations.getById(this.formationId);
  var hero = GAME.HEROES[this.heroKey];
  var bossDef = formation && formation.boss ? GAME.UNITS[formation.boss] : null;

  // 보스 층 강조(디자인 검토 #5) — 이 게임은 이미 어디서나 `bossDef ? 위험색 : 본문색`
  // 규칙을 쓴다(tower.js 의 여러 화면). 로딩 화면만 그 규칙이 빠져 있었다 — 전투가
  // 시작되기도 전에 "이번 층은 다르다"가 읽혀야 그 규칙이 완성된다.
  var bossNumeric = bossDef ? (GAME.UI.IS_LIGHT ? 0xB01F35 : 0xef4444) : C.controller;
  var titleColor = bossDef ? GAME.UI.TXT.danger : C.text;

  var titleLbl = GAME.UI.label(this, W / 2, H * 0.10, this.tower + '층 진입', GAME.CONFIG.SMALL ? 26 : 34,
    titleColor, 0.5).setOrigin(0.5, 0);
  var subLbl = GAME.UI.label(this, W / 2, titleLbl.y + titleLbl.height + 6,
    hero ? hero.name + ' 출전' : '', GAME.CONFIG.SMALL ? 15 : 17, C.textDim, 0.5).setOrigin(0.5, 0);

  var lines = [];
  if (bossDef) lines.push('☠ ' + bossDef.name + ' — ' + bossDef.desc);
  if (formation && formation.planLabel) lines.push('◈ ' + formation.planLabel + ' — ' + formation.planHint);
  if (formation && formation.ruleLabel) lines.push('⚠ ' + formation.ruleLabel + ' — ' + formation.ruleDesc);

  // 이 층에 나오는 유닛 종류 중 하나를 랜덤으로 골라 전술 팁을 띄운다.
  if (formation && formation.units && formation.units.length) {
    var kinds = [];
    formation.units.forEach(function (u) {
      if (kinds.indexOf(u.type) < 0 && GAME.TOWER_UNIT_TIPS[u.type]) kinds.push(u.type);
    });
    if (kinds.length) {
      var pick = kinds[Math.floor(Math.random() * kinds.length)];
      var tips = GAME.TOWER_UNIT_TIPS[pick];
      lines.push('💡 ' + tips[Math.floor(Math.random() * tips.length)]);
    }
  }

  var infoLbl = GAME.UI.label(this, W / 2, subLbl.y + subLbl.height + 18, lines.join('\n\n'),
    GAME.CONFIG.SMALL ? 14 : 16, C.textDim, 0.5).setOrigin(0.5, 0).setAlign('center').setLineSpacing(8)
    .setWordWrapWidth(Math.min(W - 60, 640));

  // 이 층 적 실루엣(디자인 검토 #3) — formation.units 는 이미 읽어 온 데이터라
  // 텍스트로만 쓰고 버리고 있었다. 보스가 있으면 보스를, 없으면 가장 많이 나오는
  // 유닛을 세 마리 정도 흐릿하게 세워 "무엇과 싸우는지"를 로딩 중에도 보여준다.
  // ⚠ 실루엣 크기·위치를 **실제로 잰 텍스트 높이**에서 역산한다 — 고정 비율(H*0.62 등)로
  //   박았더니 문구가 1~3줄로 늘어나는 층에서 위 정보 문단과 겹쳤다(실측으로 잡음,
  //   eggart 의 "몸통은 sy 기준 위로 3.2r·아래로 1.8r 뻗는다" 규칙을 거꾸로 쓴 것).
  var barW = Math.min(W - 80, 480), barH = 14, barY = H - Math.max(60, H * 0.10);
  var bandTop = infoLbl.y + infoLbl.height + 14;
  var bandBottom = barY - 16;
  var bandH = Math.max(20, bandBottom - bandTop);
  var r = bandH / 5;
  var silY = bandTop + r * 3.2;
  if (bossDef) {
    GAME.UI.drawUnitFlat(this.add.graphics().setAlpha(0.92), bossDef,
      W / 2, silY, GAME.CONFIG.COLORS.strategist, 1, r / (bossDef.radius || 27), -Math.PI / 2);
  } else if (formation && formation.units && formation.units.length) {
    var counts = {};
    formation.units.forEach(function (u) { counts[u.type] = (counts[u.type] || 0) + 1; });
    var top3 = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 3);
    var silG = this.add.graphics().setAlpha(0.55);
    var spread = Math.min(W * 0.22, r * 3.6);
    top3.forEach(function (k, i) {
      var def = GAME.UNITS[k];
      if (!def || def.isMine) return;                            // 지뢰류는 서 있는 실루엣이 없다
      var sx = W / 2 + (i - (top3.length - 1) / 2) * spread;
      GAME.UI.drawUnitFlat(silG, def, sx, silY, GAME.CONFIG.COLORS.strategist, 1,
        r * 0.82 / (def.radius || 12), -Math.PI / 2);
    });
  }

  this._meter = GAME.UI.meter(this, (W - barW) / 2, barY, barW, barH, {
    color: bossNumeric, frac: 0
  });

  this._done = false;
};

GAME.TowerLoadingScene.prototype.update = function (time, delta) {
  if (this._done) return;
  this._t += delta;
  if (this._meter) this._meter.set(Math.min(1, this._t / GAME.TowerLoadingScene.DURATION));
  if (this._t >= GAME.TowerLoadingScene.DURATION) {
    this._done = true;
    var Z = GAME.CONFIG.ZONE_CONTROLLER;
    var picks = (GAME.TowerChar && GAME.TowerChar.get() && GAME.TowerChar.get().picks) ||
                GAME.defaultSkillPicks();
    this.scene.start('Battle', {
      formationId: this.formationId,
      heroKey: this.heroKey,
      items: {},
      picks: picks,
      tower: this.tower,
      startPos: { x: Z.x + Z.w / 2, y: Z.y + Z.h * 0.55 }
    });
  }
};
