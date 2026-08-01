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
    '가시덫은 보이지 않습니다. 밟으면 붉은 원이 뜨고 잠깐 뒤 터지니, 그때 이동 스킬로 빠져나가세요.',
    '가시덫은 걸어서는 못 벗어납니다 — 붉은 원이 보이면 곧바로 이동 스킬을 쓰세요.'
  ]
};

GAME.TowerLoadingScene = function () {
  Phaser.Scene.call(this, { key: 'TowerLoading' });
};
GAME.TowerLoadingScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.TowerLoadingScene.prototype.constructor = GAME.TowerLoadingScene;

// 기본 3초. **새 유닛 데뷔 층은 여기에 더 준다**(사용자 지시: "로딩을 1초 정도 더
// 길게 해서 사용자가 읽을 수 있게") — 읽을 것이 늘었는데 시간이 그대로면 못 읽는다.
GAME.TowerLoadingScene.DURATION = 3000;
GAME.TowerLoadingScene.DEBUT_EXTRA = 1600;

GAME.TowerLoadingScene.prototype.init = function (data) {
  this.formationId = data.formationId;
  this.tower = data.tower || 0;
  this.heroKey = data.heroKey;
  this._t = 0;
  this._meter = null;
  // 데뷔 층이면 읽을 시간을 더 준다.
  this._dur = GAME.TowerLoadingScene.DURATION +
    ((GAME.TowerCurriculum && GAME.TowerCurriculum.debutOf(this.tower)) ? GAME.TowerLoadingScene.DEBUT_EXTRA : 0);
};

// 유닛 def → "어떤 공격을 하는가" 한 줄. `js/units.js` 의 값만 읽어 만든다
// (설명을 손으로 또 쓰면 스탯을 바꿨을 때 조용히 거짓말이 된다).
GAME.TowerLoadingScene.prototype._attackLineOf = function (d) {
  if (!d) return '';
  var W = GAME.CONFIG.WORLD_SCALE || 1;
  var rng = Math.round((d.range || 0) / W);
  var parts = [];
  if (d.isMine) parts.push('밟으면 터지는 함정 — 먼저 공격하지 않는다');
  else if (d.rangeSpan) parts.push('맵 전체에 닿는 사거리');
  else if (d.attack === 'melee') parts.push('근접 ' + rng + ' 부채꼴 ' + (d.coneDeg || 90) + '°');
  else if (d.attack === 'targeted') parts.push('사거리 ' + rng + ' · **자동 명중**(피할 수 없다)');
  else if (d.attack === 'projectile') parts.push('사거리 ' + rng + ' 직선 투사체(피할 수 있다)');
  else if (d.attack === 'lob') parts.push('사거리 ' + rng + ' 곡사 — 예고 뒤 착탄');
  else parts.push('사거리 ' + rng);
  if (d.damage) parts.push('피해 ' + d.damage);
  if (d.cooldown) parts.push('간격 ' + (Math.round(d.cooldown / 100) / 10) + '초');
  if (d.healRadius) parts.push('주변 아군 회복');
  if (d.buffRadius) parts.push('주변 아군 강화');
  if (d.intercept) parts.push('날아오는 공격을 대신 막는다');
  if (d.slowMul) parts.push('맞으면 느려진다');
  if (d.immobile) parts.push('움직이지 않는다');
  return parts.join('  ·  ');
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

  var debut = GAME.TowerCurriculum && GAME.TowerCurriculum.debutOf(this.tower);
  var debutDef = debut && GAME.UNITS[debut.type];

  // ── 데뷔 층은 **그 유닛만** 보여준다 (2026-08-01 사용자 지시) ─────────────────
  //  "새로운 적 유닛이 나올 때는 다른 설명 다 빼고 그 적 유닛에 대한 설명만 띄우고,
  //   실루엣이랍시고 억지로 불투명도 주지 말고 그냥 유닛하고 어떤 유닛이고 어떤 공격을
  //   하는지 자세히 보여줘. 로딩을 1초 정도 더 길게 해서 읽을 수 있게."
  //
  //  맞는 지적이다. 예전엔 데뷔 문구가 배치 원형·층 조건·랜덤 팁과 **같은 문단에
  //  섞여** 넷 중 하나로 흘러갔고, 정작 새 유닛은 알파 0.55~0.92 로 흐리게 그려
  //  "무엇이 새로 왔는가"가 화면에서 가장 약한 신호였다. 소개하는 층이면 소개만 한다.
  var lines = [];
  if (debutDef) {
    lines.push('🆕 새로운 적  ·  ' + debutDef.name);
    lines.push(debutDef.desc || '');
    lines.push('▶ 공격 방식 — ' + this._attackLineOf(debutDef));
    lines.push('▶ 대처 — ' + debut.lesson);
  } else {
    if (bossDef) lines.push('☠ ' + bossDef.name + ' — ' + bossDef.desc);
    // 테마 층이면 그 사실이 가장 먼저 읽혀야 한다 — 판의 성격이 통째로 다르다.
    if (formation && formation.themeLabel) {
      lines.push('🎪 ' + formation.themeLabel + ' — ' + (formation.themeHint || ''));
    }
    // 탑이 나를 어떻게 읽었는지. 이게 이 모드의 정체성이다.
    if (formation && formation.readNote) lines.push(formation.readNote);
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
  }
  lines = lines.filter(function (s) { return s; });

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
  } else if (debutDef) {
    // 데뷔 층에서는 **그 유닛 하나만, 또렷하게** 세운다.
    // ⚠ 알파를 주지 않는다(사용자 지시: "실루엣이랍시고 억지로 불투명도 주지 마").
    //   소개하는 화면에서 흐리게 그리는 것은 그 자체로 모순이다 — 외우라고 띄운 그림이다.
    //   지면 고정물(가시덫)도 `drawUnitFlat` 이 알아서 접지 아트로 그린다.
    GAME.UI.drawUnitFlat(this.add.graphics(), debutDef,
      W / 2, silY, GAME.CONFIG.COLORS.strategist, 1, r / (debutDef.radius || 12), -Math.PI / 2);
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
  var dur = this._dur || GAME.TowerLoadingScene.DURATION;
  if (this._meter) this._meter.set(Math.min(1, this._t / dur));
  if (this._t >= dur) {
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
