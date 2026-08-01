window.GAME = window.GAME || {};

// 컨트롤러 준비 화면.
// 컨트롤러는 유닛을 배치하지 않으므로 배치 UI가 필요 없다.
//
// ── 가로(PC) 구성 (2026-07-28 개편) ──────────────────────────────────────────
//  왼쪽  = **적 편성표**. 예전에는 아레나 축소 미니맵이었는데, 준비 화면에서 정말
//          필요한 정보는 "어디에 서 있나"가 아니라 "무엇이 몇 기 있나"다.
//          미니맵은 좌표를 보여주지만 그 좌표는 전투가 시작되면 바로 무너진다.
//  오른쪽 = 영웅 확인 띠(클릭 불가) + 능력치 + 장비 + 스킬 + **스킬 미리보기 무대**.
//          영웅은 탑 로비/진형 선택에서 이미 확정됐으므로 여기서 다시 고르지 않는다.
//          그래서 영웅 카드 3장이 빠졌고, 그 자리를 미리보기 무대가 채운다.
//
// ── 세로(모바일) ─────────────────────────────────────────────────────────────
//  기존 그대로다. `_buildPanelCompact` / `js/scenes/draft-mobile.js` 로 분기하고,
//  정찰 미니맵도 세로에서는 예전 코드(`_drawScoutMap`)를 그대로 쓴다.
//
// ── 비용 체계 ────────────────────────────────────────────────────────────────
//  영웅 비용은 화면에 노출하지 않는다. 예산에서 영웅 몫(GAME.HERO_BASE_COST)을
//  미리 떼고 **'장비 예산'** 하나만 보여준다. 고를 수 없는 값을 보여주면
//  화면의 예산 표시가 거짓말이 된다(이 저장소에서 이미 겪은 함정이다).
GAME.DraftScene = function () {
  Phaser.Scene.call(this, { key: 'Draft' });
};
GAME.DraftScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.DraftScene.prototype.constructor = GAME.DraftScene;

// ── 한 줄에 반드시 들어가게 만드는 헬퍼 ──────────────────────────────────────
//  글자 겹침은 이 저장소에서 반복해서 터진 사고다. wordWrap 으로 두면 줄이 늘어나
//  아래 줄을 침범하므로, 목록 항목은 **폰트를 줄이고 그래도 넘치면 잘라서** 한 줄로 묶는다.
//  full 을 매번 받으므로 반복 호출해도 계속 작아지지 않는다(멱등).
//  ※ 폰트 하한(UI.FS.MIN)은 절대 뚫지 않는다 — setFontSize 는 UI.label 의 clamp 를
//    지나치므로 여기서 다시 막아야 한다(1280×720 에서 9.6px 로 찍힌 적이 있다).
GAME.DraftScene.fitText = function (t, full, maxW, basePx, minPx) {
  if (!t) return t;
  var floor = (GAME.UI.FS && GAME.UI.FS.MIN) || 11;
  minPx = Math.max(floor, minPx || floor);
  var px = Math.max(minPx, basePx);
  t.setFontSize(px);
  t.setText(full);
  while (t.width > maxW && px > minPx) { px -= 1; t.setFontSize(px); }
  var s = full;
  while (t.width > maxW && s.length > 2) { s = s.slice(0, -1); t.setText(s + '…'); }
  return t;
};

GAME.DraftScene.prototype.init = function (data) {
  this.formation = GAME.Formations.getById(data.formationId);
  this.tower = (data && data.tower) || 0;    // 통곡의 탑 층수 (0이면 일반 대전)
  this.versus = !!(data && data.versus);     // 대전(비동기 PvP) 공격인가 — 트로피가 걸린다
  // 내 전장 시험 — 아무것도 기록하지 않는 연습 판이다(사용자 지시 3번).
  this.test = !!(data && data.test);
  // 탑은 **도전 시작 예산**으로 한 번만 세팅한다(이후 성장은 골드로).
  // 일반 대전은 배치도가 선언한 예산을 그대로 쓴다(양쪽 동일 조건).
  // 대전은 **양쪽 300 고정**(2026-07-30 사용자 지시). 배치도가 선언한 예산을 쓰던
  // 예전 방식은 상대가 짠 예산이 내 예산이 되는 구조라, 상대를 고르는 것이 곧
  // 내 강함을 고르는 일이 됐다. 이제 누구를 고르든 내 몫은 같다.
  this.totalBudget = this.versus
    ? GAME.Arena.BUDGET
    : (this.tower
        ? (GAME.TowerRun ? GAME.TowerRun.START_BUDGET : GAME.Tower.heroBudgetFor(this.tower))
        : GAME.Formations.budgetOf(this.formation));
  // 탑에서는 로비에서 이미 영웅을 골랐다(AI 가 그 영웅을 보고 배치를 짰으므로
  // 여기서 바꾸면 카운터가 어긋난다). 그래서 넘어온 영웅을 그대로 쓴다.
  this.heroKey = (data && data.heroKey && GAME.HEROES[data.heroKey])
    ? data.heroKey
    : GAME.Store.get('asymgame.lastHero', 'vanguard');
  if (!GAME.HEROES[this.heroKey]) this.heroKey = 'vanguard';
  this.heroLocked = !!(this.tower && data && data.heroKey);

  // ── 대전: 영웅 선택 단계 (2026-07-31, 사용자 지시) ────────────────────────
  //  신고: "대전은 궁수가 기본선택이던데 통곡의 탑처럼 캐릭터 선택창을 넣어 달라."
  //  맞는 지적이었다 — 대전은 `lastHero`(마지막에 쓴 영웅)를 **묻지 않고** 그대로 썼다.
  //  탑은 로비에서 고르고 오는데 대전만 그 단계가 없었다.
  //  `heroPicked` 가 서기 전까지는 화면을 만들기 전에 선택창을 띄운다.
  //  ⚠ 탑은 건드리지 않는다 — 거기는 **AI 가 그 영웅을 보고 배치를 짰으므로** 여기서
  //    바꾸면 카운터가 어긋난다(위 주석). 대전은 상대 배치가 고정이라 바꿔도 된다.
  this.needHeroPick = !!(this.versus && !(data && data.heroPicked));

  // 영웅 몫을 뗀 **장비 예산**. 화면·판정이 전부 이 값 하나를 본다.
  // this.budget 도 같은 값으로 맞춰 둔다 — 세로 패널(draft-mobile.js)이 this.budget 을
  // 직접 읽는데, 그쪽에서만 총예산을 쓰면 세로에서 장비를 두 배로 살 수 있게 된다.
  // 대전에서는 **능력치 강화**(통곡의 탑에서 가져온 것)도 같은 예산에서 산다.
  // 이미 산 강화의 값을 먼저 떼야 장비 예산이 거짓말을 하지 않는다.
  // ⚠ 2026-08-01 — **대전은 더 이상 이 화면을 쓰지 않는다.** 대전 준비는 통곡의 탑
  //   상점과 같은 화면(`TowerShop`, mode:'arena')으로 옮겼고, 능력치 강화도 없앴다
  //   (사용자 지시). 그래서 여기서 강화 지출을 뗄 이유가 사라졌다.
  //   이 화면은 이제 **일반 대전(Select → Draft)** 전용이다.
  this.itemBudget = Math.max(0, this.totalBudget - this._heroBaseCost());
  this.budget = this.itemBudget;

  this.items = { weapon: null, armor: null, boots: null, potion: null };
  this.picks = GAME.defaultSkillPicks();
  this.editSlot = 'Q';
  this.hoverItem = null;
  // 씬을 다시 들어오면 이전 표시객체는 이미 파괴돼 있다. 참조를 지우지 않으면
  // redraw 의 `if (!this.scoutSummary)` 가 파괴된 객체를 재사용해 터진다.
  this.scoutSummary = null;
  this.compact = false;
  this._warnOn = false;
  // 폰 가로 2단계 레이아웃 상태 (씬 재진입 시 반드시 되돌린다)
  this.phone = false;
  this._phObjs = [];
  this._phStepIdx = 0;
  this._phCells = [];
  this._phTabs = [];
  this._phOpts = [];
  this._phRail = null;
  this._phBtnL = null;
  this._phBtnR = null;

  // 미리보기 / 골드 롤링 상태 (씬 재진입 시 반드시 초기화)
  this.pg = null;
  this.pvStage = null;
  this.goldText = null;
  this._pvSkill = null;
  this._pvT = 0;
  this._pvAcc = 0;
  this._pvHover = false;
  this._goldShown = null;
  this._goldTween = null;
  this._goldPopTween = null;
  this._goldColorEv = null;
  this._pvMask = null;
};

// 영웅 몫. heroes.js 가 `cost` 를 버리고 GAME.HERO_BASE_COST 로 옮겨가는 중이라
// 양쪽 모두에서 옳은 값이 나오도록 방어적으로 읽는다.
GAME.DraftScene.prototype._heroBaseCost = function () {
  if (typeof GAME.HERO_BASE_COST === 'number') return GAME.HERO_BASE_COST;
  var h = GAME.HEROES[this.heroKey];
  return (h && typeof h.cost === 'number') ? h.cost : 0;
};

// ── 대전 영웅 선택 (2026-07-31) ──────────────────────────────────────────────
//  탑의 전용 선택 화면을 그대로 쓸 수 없어(TowerScene 의 메서드다) 같은 정보를
//  `GAME.Modal` 로 낸다. 문 선택 팝업과 같은 부품이라 겹침·크기 규율이 이미 검증돼 있다.
//  ⚠ `note` 는 **한 줄 슬롯**이다(modal.js). 설명을 문장으로 넣으면 행 밖으로 흘러
//    화면을 덮는다 — 두 갈래 문에서 이미 겪었다. 숫자만 짧게 적는다.
GAME.DraftScene.prototype._pickHero = function () {
  var self = this;
  var items = GAME.HERO_ORDER.map(function (k) {
    var h = GAME.HEROES[k];
    return {
      key: k,
      name: h.name + '  ·  ' + h.trait,
      note: '체력 ' + h.hp + '  ·  공격 ' + h.damage + '  ·  방어 ' + h.armor +
            '  ·  속도 ' + h.speed + '  ·  사거리 ' + h.range,
      selected: k === self.heroKey
    };
  });
  GAME.Modal.open(this, {
    title: '⚔ 대전 — 어떤 영웅으로 갈 것인가',
    items: items,
    onPick: function (it) {
      GAME.Modal.close();
      GAME.Store.set('asymgame.lastHero', it.key);
      // 같은 씬을 다시 시작한다. `heroPicked` 가 서 있으니 이번엔 선택창을 건너뛴다.
      self.scene.restart({
        formationId: self.formation && self.formation.id,
        heroKey: it.key, versus: true, test: self.test, heroPicked: true
      });
    }
  });
};

GAME.DraftScene.prototype.create = function () {
  if (GAME.Music) GAME.Music.play('versus');
  var C = GAME.CONFIG.COLORS;
  var self = this;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var P = GAME.CONFIG.PORTRAIT;

  this.cameras.main.setBackgroundColor(C.bg);
  // 준비 화면은 정찰도를 축소해 그리므로 전투용 전체화면 투영이 새어 들어오면 안 된다.
  GAME.Iso.setMode('default');

  // 대전 — 영웅부터 고르게 한다. 고르면 같은 씬을 `heroPicked` 로 다시 시작한다.
  // (씬을 다시 시작하는 이유: 영웅이 바뀌면 예산·아이템·스킬 목록이 전부 달라지므로
  //  부분 갱신보다 다시 만드는 쪽이 안전하다 — 이 씬은 캐시한 표시객체가 많다.)
  if (this.needHeroPick) { this._pickHero(); return; }

  // 폰 가로(820×390)는 PC 도 세로도 아니다 — 높이 390 에 PC 구성을 그대로 쓰면
  // 아이템 줄 아래가 통째로 화면 밖으로 나간다(실측: 요소 50개 화면 밖).
  // 전용 2단계 레이아웃으로 간다(js/scenes/draft-mobile.js 아래쪽).
  if (GAME.CONFIG.PHONE) {
    this.events.once('shutdown', function () { self._teardown(); self._phClearStep(); });
    this._createPhone();
    return;
  }

  // ── 화면 분할 ──
  // 세로 모바일은 폭이 좁아 좌우 분할이 안 되므로 위(정찰)/아래(설정)로 나눈다.
  // 정찰도 아래의 '적 구성 요약'은 유닛 종류가 많으면 두 줄이 된다.
  // 그 높이를 명시적으로 잡아두지 않으면 아래 패널의 첫 줄(예산)과 겹친다(실제로 겪음).
  var SUMMARY_H = P ? 48 : 20;
  this.split = P
    ? { scoutX: 10, scoutY: 40, scoutW: W - 20, scoutH: Math.round(H * 0.20),
        panelX: 10, panelY: 40 + Math.round(H * 0.20) + 4 + SUMMARY_H, panelW: W - 20 }
    : { scoutX: 16, scoutY: 52, scoutW: Math.round(W * 0.34), scoutH: H - 116,
        panelX: Math.round(W * 0.34) + 32, panelY: 52, panelW: W - Math.round(W * 0.34) - 48 };

  this.g = this.add.graphics();

  // 오른쪽 학습 표시를 먼저 그려 실제 왼쪽 끝을 재고, 제목을 그 앞까지만 쓴다.
  // 배치도 이름이 20자까지 되는데 제목을 그냥 이어붙였더니 화면 밖으로 나가면서
  // 오른쪽 표시와 겹쳤다(세로 411px, 화면 420px).
  var learned = GAME.Learn.summary(this.formation.id);
  var learnLbl = GAME.UI.label(this, W - 16, 14,
    learned ? ('학습 ' + learned.battles + '전' + (learned.learned.length ? ' · ' + learned.learned.join(', ') : ''))
            : '학습 기록 없음',
    P ? 13 : 13, learned && learned.learned.length ? C.crit : C.textDim, 1).setOrigin(1, 0);

  var head = (P ? '상대 진형 정찰 — ' : '적 편성 확인 — ') + this.formation.name +
    (this.formation.isAI ? ' (AI)' : ' (사람)');
  // 가로에서는 제목 줄을 2줄로 쓰는데 y=14/32 로는 글자 상자가 2px 겹친다(실측).
  // 패널 위쪽(52) 안에 두 줄이 들어가도록 위로 올린다.
  var headLbl = GAME.UI.label(this, 16, P ? 14 : 8, head, P ? 15 : 16, C.accentAlt, 0);
  var headMax = learnLbl.getBounds().x - 10 - 16;
  if (headLbl.width > headMax && headMax > 40) {
    var hs = head;
    while (hs.length > 1 && headLbl.width > headMax) { hs = hs.slice(0, -1); headLbl.setText(hs + '…'); }
  }
  GAME.UI.label(this, 16, P ? 36 : 30, GAME.UI.winRateText(this.formation.id), P ? 13 : 13, C.warn, 0);

  if (!P) this._buildRoster();
  this._buildPanel();

  // 세로에서는 패널이 화면 아래까지 꽉 차서 '뒤로' 를 따로 아래에 둘 자리가 없다
  // (실제로 '전투 시작' 버튼과 겹쳤다). 같은 줄 왼쪽에 나란히 놓는다.
  var backLabel = this.tower ? '← 탑으로' : (this.versus ? '← 대전' : '← 진형 선택');
  if (P) {
    var ra = this._rAct;
    GAME.UI.button(this, this.split.panelX + this._backW / 2, ra.cy, this._backW, ra.h,
      backLabel, function () {
        self.scene.start(self.tower ? 'Tower' : (self.versus ? 'Versus' : 'Select'));
      }, { fontSize: 15 });
    if (this.versus) {
      // '⚒ 능력치' 버튼은 제거했다(2026-08-01) — 대전에 능력치 강화가 없다.
      GAME.UI.button(this, this.split.panelX + this._backW * 1.6, ra.cy, this._backW, ra.h,
        '↩ 영웅', function () { self.needHeroPick = true; self._pickHero(); }, { fontSize: 15 });
    }
  } else {
    // 우하단 끝에 붙이면 DOM 버전 배지(#ver)와 겹친다(실측) → 배지 폭만큼 왼쪽·위로 뗀다
    GAME.UI.button(this, W - 190, H - 34, 160, 36, backLabel, function () {
      self.scene.start(self.tower ? 'Tower' : (self.versus ? 'Versus' : 'Select'));
    }, { fontSize: 14 });
    if (this.versus) {
      // '⚒ 능력치' 버튼은 제거했다(2026-08-01) — 대전에 능력치 강화가 없다.
      GAME.UI.button(this, W - 360, H - 34, 160, 36, '↩ 영웅 다시', function () {
        self.needHeroPick = true; self._pickHero();
      }, { fontSize: 14 });
    }
  }

  // 능력치 강화 패널은 **제거했다**(2026-08-01) — 대전에 능력치 강화가 없어졌고,
  // 이 화면은 일반 대전 전용이 되어 애초에 그 개념이 없다.
  this._openArenaUpgrades = null;

  // 씬을 떠날 때 트윈·타이머·마스크가 남지 않게 한다.
  this.events.once('shutdown', function () { self._teardown(); });

  this.redraw();
  this._pvSyncPick();
  if (this.pg) this._drawPreview();

  // 탑(세로): 영웅은 로비에서 이미 확정됐으니, 예산 → 장비(한 번에) → 스킬 QWER(하나씩)
  // 순서의 가이드 팝업을 그 위에 띄운다. 요약 패널은 뒤에 그대로 있어(닫으면 폴백) 동기화된다.
  if (this.tower && P && this._towerWizard) this._towerWizard();
};

GAME.DraftScene.prototype._teardown = function () {
  if (this._goldTween) { this._goldTween.remove(); this._goldTween = null; }
  if (this._goldPopTween) { this._goldPopTween.remove(); this._goldPopTween = null; }
  if (this._goldColorEv) { this._goldColorEv.remove(false); this._goldColorEv = null; }
  if (this.tweens) this.tweens.killAll();
  if (this.pg && this.pg.clearMask) this.pg.clearMask(true);
  if (this._pvMask && this._pvMask.destroy) this._pvMask.destroy();
  this._pvMask = null;
  this.pg = null;
  this.pvStage = null;
  this.goldText = null;
  this._pvSkill = null;
};

// 매 프레임 미리보기만 다시 그린다. 세로(compact)에는 무대가 없어 그냥 빠져나간다.
GAME.DraftScene.prototype.update = function (time, delta) {
  if (!this.pg || !this.pvStage) return;
  var dt = delta || 16;
  this._pvT += dt;
  this._pvAcc += dt;
  if (this._pvAcc < 33) return;          // 30fps 로 충분하다 — 매 프레임 그릴 이유가 없다
  this._pvAcc = 0;
  this._drawPreview();
};

// ════════════════════════════════════════════════════════════════════════════
//  왼쪽 — 적 편성표 (가로 전용)
// ════════════════════════════════════════════════════════════════════════════
// 적 편성표의 원자료 — 가로(PC)와 폰 가로가 같은 집계를 쓴다.
// 두 곳에서 따로 세면 "PC 는 7종인데 폰은 6종" 같은 어긋남이 조용히 생긴다.
GAME.DraftScene.prototype._rosterData = function () {
  var counts = {}, i;
  for (i = 0; i < this.formation.units.length; i++) {
    var ty = this.formation.units[i].type;
    counts[ty] = (counts[ty] || 0) + 1;
  }
  var rows = [];
  var totHp = 0, totDps = 0, bossN = 0;
  for (var k in counts) {
    if (!counts.hasOwnProperty(k)) continue;
    var def = GAME.UNITS[k];
    if (!def) continue;
    rows.push({ def: def, n: counts[k] });
    totHp += def.hp * counts[k];
    if (def.damage && def.cooldown) totDps += (def.damage * 1000 / def.cooldown) * counts[k];
    if (GAME.isBoss(def)) bossN += counts[k];
  }
  rows.sort(function (a, b) {
    if (GAME.isBoss(b.def) !== GAME.isBoss(a.def)) return GAME.isBoss(b.def) ? 1 : -1;
    if (b.n !== a.n) return b.n - a.n;
    return (b.def.cost || 0) - (a.def.cost || 0);
  });
  return { rows: rows, hp: Math.round(totHp), dps: Math.round(totDps),
           boss: bossN, total: this.formation.units.length };
};

GAME.DraftScene.prototype._buildRoster = function () {
  var C = GAME.CONFIG.COLORS;
  var S = this.split;
  var i;

  var rd = this._rosterData();
  var rows = rd.rows;
  var totHp = rd.hp, totDps = rd.dps, bossN = rd.boss;

  var pad = 12;
  var x0 = S.scoutX + pad, rw = S.scoutW - pad * 2;
  var y = S.scoutY + 12;

  GAME.UI.label(this, x0, y, '적 편성', 18, C.accentAlt, 0);
  y += 24;
  GAME.UI.label(this, x0, y,
    '총 ' + this.formation.units.length + '기 · ' + rows.length + '종' +
    (bossN ? '  · 보스 ' + bossN : ''), 13, bossN ? C.crit : C.textDim, 0);
  y += 19;
  GAME.UI.label(this, x0, y,
    '합계 체력 ' + Math.round(totHp) + ' · 화력 ' + Math.round(totDps) + '/초', 13, C.textDim, 0);
  y += 24;

  this.rosterTop = y;
  // 행 높이는 남은 높이에서 역산한다. 고정값을 박으면 종류가 많을 때 아래로 넘친다.
  var avail = (S.scoutY + S.scoutH - 34) - y;
  var rowH = rows.length ? Math.floor(avail / rows.length) - 5 : 52;
  rowH = Math.max(38, Math.min(56, rowH));
  // 패널 높이도 내용에서 정한다 — 종류가 적을 때 아래로 빈 상자가 길게 남으면
  // "뭔가 빠진 화면"으로 읽힌다.
  this.rosterH = Math.min(S.scoutH,
    (y - S.scoutY) + Math.max(1, rows.length) * (rowH + 5) + 34);

  this.rosterRows = [];
  for (i = 0; i < rows.length; i++) {
    var r = rows[i], d = r.def;
    var ry = y + i * (rowH + 5);
    if (ry + rowH > S.scoutY + this.rosterH - 30) break;
    var boss = GAME.isBoss(d);
    var auto = GAME.isAutoHit(d);
    var tone = boss ? C.crit : (auto ? (C.danger || C.warn) : C.text);

    var nm = GAME.UI.label(this, x0 + 54, ry + Math.round(rowH * 0.10),
      (boss ? '★ ' : '') + d.name, 16, tone, 0);
    GAME.DraftScene.fitText(nm, (boss ? '★ ' : '') + d.name, rw - 54 - 54, 16, 13);

    GAME.UI.label(this, x0 + rw - 6, ry + Math.round(rowH * 0.10),
      '×' + r.n, 17, C.accent, 0).setOrigin(1, 0);

    var st = GAME.UI.label(this, x0 + 54, ry + Math.round(rowH * 0.52), '', 13, C.textDim, 0);
    GAME.DraftScene.fitText(st, this._unitLine(d), rw - 58, 13, 11);

    this.rosterRows.push({
      def: d, n: r.n, y: ry, h: rowH, x: x0, w: rw,
      tone: boss ? GAME.UI.COL.focus : (auto ? GAME.UI.COL.hpBad : GAME.UI.COL.controller),
      boss: boss, auto: auto
    });
  }

  // 범례 — 색이 무슨 뜻인지 안 적으면 색은 장식일 뿐이다.
  GAME.UI.label(this, x0, S.scoutY + this.rosterH - 24,
    '붉은 띠 = 자동명중(회피 불가) · 금색 = 보스', 13, C.textDim, 0);
};

// 한 유닛의 핵심 스탯 한 줄
GAME.DraftScene.prototype._unitLine = function (d) {
  var b = [];
  b.push('체력 ' + d.hp);
  if (d.damage && d.cooldown) b.push('공격 ' + d.damage + '(' + (1000 / d.cooldown).toFixed(1) + '/s)');
  else b.push('공격 없음');
  if (d.rangeSpan) b.push('사거리 전장');
  else if (d.range >= 100) b.push('원거리 ' + d.range);
  else if (d.range > 0) b.push('근접 ' + d.range);
  if (d.immobile && !d.isMine) b.push('고정');
  if (d.attack === 'targeted') b.push('자동명중');
  else if (d.attack !== 'none') b.push('논타겟');
  if (d.healRadius) b.push('치유 ' + d.healRadius);
  if (d.buffRadius) b.push('강화 ' + d.buffRadius);
  if (d.intercept) b.push('투사체 차단');
  if (d.slowMul) b.push('둔화');
  if (d.isMine) b.push('밟으면 폭발');
  return b.join(' · ');
};

// 편성표의 그래픽 부분(패널·띠·아이콘). redraw 마다 g 가 지워지므로 여기서 다시 그린다.
GAME.DraftScene.prototype._drawRoster = function () {
  var C = GAME.CONFIG.COLORS, COL = GAME.UI.COL;
  var g = this.g, S = this.split;
  var i;

  var ph = this.rosterH || S.scoutH;
  g.fillStyle(COL.surface, 1);
  g.fillRoundedRect(S.scoutX, S.scoutY, S.scoutW, ph, 12);
  g.lineStyle(1, COL.border, 1);
  g.strokeRoundedRect(S.scoutX + 0.5, S.scoutY + 0.5, S.scoutW - 1, ph - 1, 12);
  g.fillStyle(COL.divider, 1);
  g.fillRect(S.scoutX + 12, this.rosterTop - 10, S.scoutW - 24, 1);

  if (!this.rosterRows) return;
  for (i = 0; i < this.rosterRows.length; i++) {
    var r = this.rosterRows[i], d = r.def;
    g.fillStyle(COL.surfaceAlt, 1);
    g.fillRoundedRect(r.x, r.y, r.w, r.h, 8);
    g.fillStyle(r.tone, r.boss || r.auto ? 0.95 : 0.55);
    g.fillRoundedRect(r.x, r.y + 4, 3, r.h - 8, 2);

    var sc = (r.boss ? 17 : 15) / d.radius;
    GAME.UI.drawUnitFlat(g, d, r.x + 30, r.y + r.h / 2, C.strategist, 1, sc);
  }
};

// ════════════════════════════════════════════════════════════════════════════
//  오른쪽 패널 (가로)
// ════════════════════════════════════════════════════════════════════════════
GAME.DraftScene.prototype._buildPanel = function () {
  // 세로 폰은 목록을 전부 펼칠 높이가 없다 → 요약 행 + 팝업(js/scenes/draft-mobile.js)
  if (GAME.CONFIG.PORTRAIT) return this._buildPanelCompact();
  var C = GAME.CONFIG.COLORS;
  var COL = GAME.UI.COL;
  var self = this;
  var S = this.split;
  var px = S.panelX, pw = S.panelW;
  var y = S.panelY;
  var i;

  function row(h, gap) { var r = { y: y, h: h, cy: y + h / 2, bottom: y + h }; y += h + (gap === undefined ? 8 : gap); return r; }
  function cols(n, gap, left, width) {
    gap = gap === undefined ? 8 : gap;
    left = left === undefined ? px : left;
    width = width === undefined ? pw : width;
    var w = Math.floor((width - gap * (n - 1)) / n);
    var out = [];
    for (var c = 0; c < n; c++) { var x = left + c * (w + gap); out.push({ x: x, w: w, cx: x + w / 2 }); }
    return out;
  }

  // 가로에서는 영웅 카드를 만들지 않는다. 공용 redraw 루프가 안전하게 비도록 빈 배열.
  this.heroCards = [];

  // ── 영웅 확인 띠 (클릭 불가) ────────────────────────────────────────────
  //  영웅은 이전 화면에서 이미 확정됐다. 여기서 다시 고르게 하면 '영웅을 보고 배치한다'는
  //  탑 규칙이 깨진다. 그래서 고르는 UI 가 아니라 **확인용 한 줄**만 남긴다.
  var rHero = row(38, 6);
  this.rHero = rHero;
  this.heroStripL = GAME.UI.label(this, px + 14, rHero.cy, '', 17, C.accentAlt, 0).setOrigin(0, 0.5);
  this.heroStripR = GAME.UI.label(this, px + pw - 14, rHero.cy, '', 14, C.textDim, 0).setOrigin(1, 0.5);

  // ── 장비 예산 + 남은 골드(롤링 숫자) ────────────────────────────────────
  var rB = row(36, 2);
  this.budgetText = GAME.UI.label(this, px, rB.cy, '', 15, C.textDim, 0).setOrigin(0, 0.5);
  GAME.UI.label(this, px + pw - 72, rB.cy, '남은 골드', 13, C.textDim, 0).setOrigin(1, 0.5);
  this.goldText = GAME.UI.label(this, px + pw - 8, rB.cy, '0', 26, C.accent, 0).setOrigin(1, 0.5);

  var rWarn = row(20, 4);
  this.warnText = GAME.UI.label(this, px, rWarn.y, '', 13, C.warn, 0);

  // ── 능력치 (장비가 실시간 반영된다) ─────────────────────────────────────
  GAME.UI.label(this, px, y, '능력치 — 장비를 고르면 바로 움직입니다', 13, C.textDim, 0);
  y += 18;
  var rStat = row(56, 8);
  var sc5 = cols(5, 10);
  this.statRows = [];
  this.statCols = [];
  for (i = 0; i < GAME.HERO_STAT_DEFS.length; i++) {
    var c5 = sc5[i];
    this.statRows.push({
      name: GAME.UI.label(this, c5.cx, rStat.y, GAME.HERO_STAT_DEFS[i].key, 12, C.textDim, 0.5).setOrigin(0.5, 0),
      val: GAME.UI.label(this, c5.cx, rStat.y + 36, '', 14, C.text, 0.5).setOrigin(0.5, 0),
      cy: rStat.y + 27
    });
    this.statCols.push({ x: c5.x + 10, w: c5.w - 20, cy: rStat.y + 27 });
  }

  // ── 장비 ────────────────────────────────────────────────────────────────
  //  칸(무기·방어구·신발·물약)을 **열**로 세우고 등급 3단을 **행**으로 쌓는다.
  //  예전엔 반대(칸=행, 등급=열)였는데, 같은 줄에 서로 다른 칸의 장비가 나란히 놓여
  //  "지금 무엇들 중에 고르는 것인가"가 안 읽혔다(가독성 신고).
  //  세로로 세우면 한 열이 곧 하나의 선택지 묶음이라 눈이 위아래로만 움직인다.
  GAME.UI.label(this, px, y, '장비 — 칸마다 하나씩. 같은 것을 다시 누르면 해제됩니다', 13, C.textDim, 0);
  y += 18;
  this.itemCells = [];
  var slotCols = cols(GAME.ITEM_SLOTS.length, 8);
  var ITEM_H = 60, ITEM_GAP = 6;
  for (var hk = 0; hk < GAME.ITEM_SLOTS.length; hk++) {
    GAME.UI.label(this, slotCols[hk].x + 2, y, GAME.ITEM_SLOTS[hk].name, 14, C.accentAlt, 0);
  }
  var gridTop = y + 19;
  for (var k = 0; k < GAME.ITEM_SLOTS.length; k++) {
    (function (slot, si) {
      var col = slotCols[si];
      var list = GAME.ITEMS[slot.key];
      for (var m = 0; m < list.length; m++) {
        (function (item, mi) {
          var cy = gridTop + mi * (ITEM_H + ITEM_GAP) + ITEM_H / 2;
          // 카드 배경은 depth -1 로 내려 this.g(아이콘)보다 아래에 오게 한다.
          var rect = self.add.rectangle(col.cx, cy, col.w, ITEM_H, COL.surfaceAlt)
            .setStrokeStyle(1, COL.border).setDepth(-1);
          rect.setInteractive({ useHandCursor: true });
          rect.on('pointerover', function () { self.hoverItem = item; self.redraw(); });
          rect.on('pointerout', function () { if (self.hoverItem === item) { self.hoverItem = null; self.redraw(); } });
          rect.on('pointerdown', function () { self.hoverItem = item; self._toggleItem(slot.key, item); });

          var textX = col.x + 58;
          var nm = GAME.UI.label(self, textX, cy - 21, item.name, 15, C.text, 0);
          var cs = GAME.UI.label(self, col.x + col.w - 8, cy - 21, String(item.cost), 15, C.accent, 0)
            .setOrigin(1, 0);
          var nt = GAME.UI.label(self, textX, cy + 5, '', 13, C.textDim, 0);
          GAME.DraftScene.fitText(nm, item.name, col.w - 58 - 42, 15, 13);
          GAME.DraftScene.fitText(nt, item.note, col.w - 64, 13, 13);

          self.itemCells.push({
            slot: slot.key, item: item, rect: rect, name: nm, cost: cs, note: nt,
            ix: col.x + 30, iy: cy, isz: 44,
            x: col.x, y: cy - ITEM_H / 2, w: col.w, h: ITEM_H
          });
        })(list[m], m);
      }
    })(GAME.ITEM_SLOTS[k], k);
  }
  y = gridTop + 3 * (ITEM_H + ITEM_GAP) + 4;

  // ── 스킬(왼쪽) + 미리보기 무대(오른쪽) ──────────────────────────────────
  var bandTop = y;
  var LW = Math.round(pw * 0.52);
  var RW = pw - LW - 20;
  var lx = px, rx = px + LW + 20;

  GAME.UI.label(this, lx, bandTop, '스킬 — 슬롯을 고르고 아래에서 선택 (올려두면 미리보기)', 13, C.textDim, 0);
  var ly = bandTop + 18;

  this.slotTabs = [];
  var tc = cols(4, 6, lx, LW);
  for (var t = 0; t < GAME.SKILL_SLOTS.length; t++) {
    (function (slot, idx) {
      var c = tc[idx];
      var rect = self.add.rectangle(c.cx, ly + 17, c.w, 34, COL.surfaceAlt)
        .setStrokeStyle(1, COL.border).setDepth(-1);
      rect.setInteractive({ useHandCursor: true });
      rect.on('pointerdown', function () { self.editSlot = slot; self._pvHover = false; self.redraw(); });
      rect.on('pointerover', function () {
        var o = GAME.HEROES[self.heroKey].skillOptions[slot];
        self._pvHover = true;
        self._pvSet(o[self.picks[slot] || 0]);
      });
      rect.on('pointerout', function () { self._pvHover = false; self._pvSyncPick(); });
      var lbl = GAME.UI.label(self, c.cx, ly + 17, slot, 13, C.accent, 0.5).setOrigin(0.5);
      self.slotTabs.push({ slot: slot, rect: rect, label: lbl, w: c.w });
    })(GAME.SKILL_SLOTS[t], t);
  }
  ly += 40;

  this.optionRows = [];
  for (var o = 0; o < 3; o++) {
    var rect2 = this.add.rectangle(lx + LW / 2, ly + 25, LW, 50, COL.surfaceAlt)
      .setStrokeStyle(1, COL.border).setDepth(-1);
    rect2.setInteractive({ useHandCursor: true });
    (function (idx, rr) {
      rr.on('pointerdown', function () { self.picks[self.editSlot] = idx; self._pvHover = false; self.redraw(); });
      rr.on('pointerover', function () {
        var opts = GAME.HEROES[self.heroKey].skillOptions[self.editSlot];
        if (!opts[idx]) return;
        self._pvHover = true;
        self._pvSet(opts[idx]);
      });
      rr.on('pointerout', function () { self._pvHover = false; self._pvSyncPick(); });
    })(o, rect2);
    this.optionRows.push({
      rect: rect2,
      name: GAME.UI.label(this, lx + 12, ly + 4, '', 15, C.text, 0),
      desc: GAME.UI.label(this, lx + 12, ly + 27, '', 12, C.textDim, 0).setWordWrapWidth(LW - 24)
    });
    ly += 56;
  }

  // 미리보기 무대 — 영웅 카드가 빠져 생긴 자리다.
  GAME.UI.label(this, rx, bandTop, '스킬 미리보기 — 반복 재생', 13, C.textDim, 0);
  var stY = bandTop + 18, stH = 184;
  this.pvStage = { x: rx, y: stY, w: RW, h: stH, cx: rx + RW / 2, cy: stY + stH / 2 };
  this.pg = this.add.graphics();
  // 이펙트가 무대를 넘어 스킬 목록 위로 새지 않게 잘라낸다.
  var mg = this.make.graphics({ add: false });
  mg.fillStyle(0xffffff, 1);
  mg.fillRoundedRect(this.pvStage.x, this.pvStage.y, this.pvStage.w, this.pvStage.h, 10);
  this._pvMask = mg;
  this.pg.setMask(mg.createGeometryMask());

  this.pvName = GAME.UI.label(this, rx, stY + stH + 8, '', 15, C.accent, 0);
  this.pvDesc = GAME.UI.label(this, rx, stY + stH + 30, '', 12, C.textDim, 0).setWordWrapWidth(RW);
  var ry2 = stY + stH + 30 + 20;

  y = Math.max(ly, ry2) + 8;

  // ── 설명 + 시작 ─────────────────────────────────────────────────────────
  var rNote = row(22, 6);
  this.noteText = GAME.UI.label(this, px, rNote.y, '', 12, C.textDim, 0).setWordWrapWidth(pw);

  var rAct = row(50, 0);
  this._rAct = rAct;
  this._backW = 0;
  var startW = Math.min(pw, 320);
  GAME.UI.button(this, px + pw / 2, rAct.cy, startW, rAct.h, '전투 시작', function () {
    self._start();
  }, { fill: GAME.UI.COL.panelTeal, line: GAME.CONFIG.COLORS.controller, hover: GAME.UI.COL.panelTealHi, color: C.accent, fontSize: 20 });

  this.panelEnd = y;
};

// ════════════════════════════════════════════════════════════════════════════
//  예산 · 아이템
// ════════════════════════════════════════════════════════════════════════════

// 영웅 비용은 예산에서 이미 떼어 두었다 → 여기서는 **장비 총액만** 센다.
GAME.DraftScene.prototype.spent = function () {
  return GAME.Items.totalCost(this.items);
};

// 경고 줄. 폰 가로는 경고와 설명이 **같은 객체**를 쓰므로(겹침 방지),
// 지금 찍힌 글자가 경고인지 설명인지 이 플래그로 구분한다.
GAME.DraftScene.prototype._warn = function (msg) {
  this._warnOn = !!msg;
  if (this.warnText) this.warnText.setText(msg || '');
};

GAME.DraftScene.prototype._toggleItem = function (slotKey, item) {
  if (this.items[slotKey] === item.key) {
    this.items[slotKey] = null;
  } else {
    var prev = this.items[slotKey];
    this.items[slotKey] = item.key;
    if (this.spent() > this.itemBudget) {
      this.items[slotKey] = prev;
      this._warn('장비 예산이 부족합니다.');
      this.redraw();
      return;
    }
  }
  this._warn('');
  this.redraw();
};

GAME.DraftScene.prototype._trim = function () {
  var order = ['potion', 'boots', 'armor', 'weapon'];
  var guard = 0;
  while (this.spent() > this.itemBudget && guard++ < 10) {
    var dropped = false;
    for (var i = 0; i < order.length; i++) {
      if (this.items[order[i]]) { this.items[order[i]] = null; dropped = true; break; }
    }
    if (!dropped) break;
  }
};

GAME.DraftScene.prototype._start = function () {
  if (this.spent() > this.itemBudget) {
    this._warn('장비 예산을 초과했습니다.');
    return;
  }
  // 통곡의 탑: 여기서 고른 것이 **도전 내내 유지되는 세팅**이다.
  // 이 뒤로는 층마다 다시 고르지 않고, 골드로 능력치를 올리거나 장비를 보강한다.
  if (this.tower && GAME.TowerRun && !GAME.TowerRun.get()) {
    GAME.TowerRun.start(this.heroKey, this.items, this.picks);
  }
  var Z = GAME.CONFIG.ZONE_CONTROLLER;
  this.scene.start('Battle', {
    formationId: this.formation.id,
    heroKey: this.heroKey,
    items: this.items,
    picks: this.picks,
    tower: this.tower,
    versus: this.versus,
      test: this.test,
    startPos: { x: Z.x + Z.w / 2, y: Z.y + Z.h * 0.55 }
  });
};

// 남은 골드를 주가처럼 굴린다. 올라가면 초록, 내려가면 빨강으로 잠깐 물들었다가
// 원래 색으로 돌아온다. 값이 그대로면 아무 일도 하지 않는다(스킬만 바꿔도 튀면 산만하다).
GAME.DraftScene.prototype._rollGold = function (target) {
  var C = GAME.CONFIG.COLORS;
  var self = this;
  if (!this.goldText || !this.goldText.scene) return;

  var normal = target < 0 ? (C.danger || '#ff7b7b') : C.accent;
  if (this._goldTween) { this._goldTween.remove(); this._goldTween = null; }
  if (this._goldPopTween) { this._goldPopTween.remove(); this._goldPopTween = null; }
  if (this._goldColorEv) { this._goldColorEv.remove(false); this._goldColorEv = null; }

  var from = (typeof this._goldShown === 'number') ? this._goldShown : target;
  if (from === target) {
    this._goldShown = target;
    this.goldText.setText(String(target));
    this.goldText.setColor(normal);
    return;
  }

  var up = target > from;
  this.goldText.setColor(up ? (C.good || '#4ade80') : (C.danger || '#ff7b7b'));
  this._goldTween = this.tweens.addCounter({
    from: from, to: target, duration: 360, ease: 'Cubic.easeOut',
    onUpdate: function (tw) {
      if (!self.goldText || !self.goldText.scene) return;
      var v = Math.round(tw.getValue());
      self._goldShown = v;
      self.goldText.setText(String(v));
    },
    onComplete: function () {
      self._goldShown = target;
      if (self.goldText && self.goldText.scene) self.goldText.setText(String(target));
    }
  });
  // 숫자가 한 번 튀어오르는 것까지 있어야 '빠졌다/들어왔다'가 눈에 잡힌다.
  // 이 트윈도 반드시 참조를 들고 있어야 한다 — 안 그러면 빠르게 연타할 때
  // 앞 트윈이 안 죽고 **1.16 에서 시작해 1.16 으로 yoyo** 해서, 트윈이 다 끝난 뒤에도
  // 숫자가 1.16 배로 커진 채 남는다(실측: 130ms 간격 6연타 → scale 1.16 고착).
  if (this._goldPopTween) this._goldPopTween.stop();
  this.goldText.setScale(1);
  this._goldPopTween = this.tweens.add({
    targets: this.goldText, scaleX: 1.16, scaleY: 1.16,
    duration: 110, yoyo: true, ease: 'Quad.easeOut',
    onComplete: function () {
      if (self.goldText && self.goldText.scene) self.goldText.setScale(1);
      self._goldPopTween = null;
    }
  });
  this._goldColorEv = this.time.delayedCall(430, function () {
    if (self.goldText && self.goldText.scene) self.goldText.setColor(normal);
  });
};

// ════════════════════════════════════════════════════════════════════════════
//  스킬 설명 · 미리보기
// ════════════════════════════════════════════════════════════════════════════
GAME.DraftScene.prototype._skillDesc = function (sk) {
  var cd = '쿨 ' + (sk.cooldown / 1000).toFixed(0) + '초';
  var t = '';
  switch (sk.type) {
    case 'dash': t = (sk.damage ? (sk.backward ? '물러나며 ' : '') + '돌진 + 경로 피해 ' + sk.damage : '순간 이동 ' + sk.dist); break;
    case 'aoeSelf': t = '주변 ' + sk.radius + ' 광역 ' + sk.damage + (sk.knockback ? ' + 넉백' : '') + (sk.rootMs ? ' + 속박' : ''); break;
    case 'aoeTarget': t = '지정 위치 ' + (sk.repeat || 1) + '회 폭격, 회당 ' + sk.damage; break;
    case 'projectile': t = (sk.burst ? sk.burst + '연사 ' : '') + (sk.pierce ? '관통 ' : '') + '투사체 ' + sk.damage; break;
    case 'strike': t = '단일 강타 ' + sk.damage + (sk.rootMs ? ' + 속박' : '') + (sk.lifestealMul > 1 ? ' (흡혈 강화)' : ''); break;
    case 'buff': t = [sk.shield ? '보호막 ' + sk.shield : null, sk.armorAdd ? '방어력 +' + sk.armorAdd : null,
                      sk.damageMul ? '공격력 x' + sk.damageMul : null, sk.healNow ? '즉시 회복 ' + sk.healNow : null,
                      sk.speedMul && sk.speedMul !== 1 ? '이동 x' + sk.speedMul : null].filter(Boolean).join(', '); break;
    case 'pull': t = (sk.coneDeg >= 360 ? '주변' : '전방') + ' 적을 끌어당김 + ' + sk.damage; break;
    case 'aura': t = '주변 ' + sk.radius + ' 지속 피해 ' + sk.dps + '/초, ' + (sk.duration / 1000) + '초'; break;
    case 'trap': t = '설치 ' + sk.damage + ' + 속박'; break;
  }
  return t + ' · ' + cd;
};

GAME.DraftScene.prototype._pvSet = function (sk) {
  if (!this.pvStage || this._pvSkill === sk) return;
  this._pvSkill = sk;
  this._pvT = 0;
  if (this.pvName) this.pvName.setText(sk ? sk.name : '');
  if (this.pvDesc) this.pvDesc.setText(sk ? this._skillDesc(sk) : '');
  this._drawPreview();
};

GAME.DraftScene.prototype._pvSyncPick = function () {
  if (!this.pvStage || this._pvHover) return;
  var hero = GAME.HEROES[this.heroKey];
  var opts = hero.skillOptions[this.editSlot];
  this._pvSet(opts[this.picks[this.editSlot] || 0]);
};

// 미리보기 무대 — 이미지 자산 없이 Graphics 로만 그린다.
// 수치는 무대 크기에 맞춰 비례 축소한다. 전장 좌표를 그대로 쓰면 무대를 넘친다.
GAME.DraftScene.prototype._drawPreview = function () {
  var g = this.pg, st = this.pvStage;
  if (!g || !g.scene || !st) return;
  var C = GAME.CONFIG.COLORS, COL = GAME.UI.COL, FX = GAME.UI.FX;
  var i, a, gx, gy;

  g.clear();
  g.fillStyle(COL.surface, 1);
  g.fillRoundedRect(st.x, st.y, st.w, st.h, 10);
  g.fillStyle(C.arenaFill, 1);
  g.fillRoundedRect(st.x + 5, st.y + 5, st.w - 10, st.h - 10, 8);
  g.lineStyle(1, C.arenaLine, 0.30);
  for (gx = st.x + 34; gx < st.x + st.w - 8; gx += 30) g.lineBetween(gx, st.y + 8, gx, st.y + st.h - 8);
  for (gy = st.y + 34; gy < st.y + st.h - 8; gy += 30) g.lineBetween(st.x + 8, gy, st.x + st.w - 8, gy);
  g.lineStyle(1, COL.border, 1);
  g.strokeRoundedRect(st.x + 0.5, st.y + 0.5, st.w - 1, st.h - 1, 10);

  var sk = this._pvSkill;
  var hero = GAME.HEROES[this.heroKey];
  if (!sk || !hero) return;

  var hdef = { radius: hero.radius, shape: hero.shape, art: hero.art };
  var edef = GAME.UNITS.bayonet;
  var T = this._pvT || 0;
  var t = (T % 2200) / 2200;

  function eo(x) { x = Math.max(0, Math.min(1, x)); return 1 - Math.pow(1 - x, 3); }
  function foe(x, y, hit) {
    GAME.UI.drawUnitFlat(g, edef, x, y, hit ? C.hpBad : C.strategist, 1, 1.05);
  }
  function me(x, y, alpha, s) {
    GAME.UI.drawUnitFlat(g, hdef, x, y, C.controller, alpha === undefined ? 1 : alpha, s || 1);
  }

  // 무대 대비 축척 — 가장 멀리 뻗는 값이 무대의 40% 안에 들어오게 맞춘다.
  var reachX = Math.max(sk.dist || 0, sk.radius || 0, 150);
  var reachY = Math.max(sk.radius || 0, 80);
  var k = Math.min((st.w * 0.40) / reachX, (st.h * 0.38) / reachY);
  k = Math.max(0.10, Math.min(1.1, k));

  var hx, hy, R, ph, cur, n, seg, idx, lt, tx, ty, bp, prog, travel, half, pts, ang, d2, ex, ey;

  switch (sk.type) {

    // 미끄러지듯 이동. 경로에 잔상이 남고, 끝까지 갔다가 되감아 반복한다.
    case 'dash':
      var back = !!sk.backward;
      hx = back ? st.x + st.w * 0.70 : st.x + st.w * 0.24;
      hy = st.cy + 18;
      travel = (sk.dist || 200) * k * (back ? -1 : 1);
      if (sk.damage) {
        var bw = Math.max(9, (sk.radius || 55) * k * 0.5);
        g.fillStyle(C.controller, 0.12);
        g.fillRect(Math.min(hx, hx + travel), hy - bw, Math.abs(travel), bw * 2);
      }
      g.lineStyle(1, C.controller, 0.45);
      g.strokeCircle(hx + travel, hy, 9);
      prog = t < 0.42 ? eo(t / 0.42) : (t < 0.62 ? 1 : 1 - eo((t - 0.62) / 0.38));
      foe(hx + travel * 0.55, hy - 28, sk.damage && prog > 0.55);
      foe(hx + travel * 0.88, hy + 24, sk.damage && prog > 0.88);
      // 잔상은 **실루엣 타원**으로 찍는다. 계란 아트를 그대로 반투명하게 겹치면
      // (라이트 테마의 잉크 윤곽은 alpha 를 그대로 따르지 않아) 흐린 잔상이 아니라
      // '여러 명이 서 있는 것'으로 읽힌다.
      for (i = 3; i >= 1; i--) {
        g.fillStyle(C.controller, 0.30 - i * 0.075);
        g.fillEllipse(hx + travel * Math.max(0, prog - i * 0.22), hy,
          hero.radius * 1.7, hero.radius * 2.1);
      }
      me(hx + travel * prog, hy);
      break;

    // 영웅 중심에서 파동이 퍼진다.
    case 'aoeSelf':
      hx = st.cx; hy = st.cy + 10;
      R = (sk.radius || 90) * k;
      ph = (t % 0.5) / 0.5;
      cur = R * eo(ph);
      g.lineStyle(1, C.controller, 0.28);
      g.strokeCircle(hx, hy, R);
      var ring = [[-0.66, -0.32], [0.70, -0.14], [0.12, 0.66]];
      for (i = 0; i < 3; i++) {
        ex = hx + ring[i][0] * R; ey = hy + ring[i][1] * R;
        foe(ex, ey, cur >= Math.sqrt((ex - hx) * (ex - hx) + (ey - hy) * (ey - hy)) - 6);
      }
      g.fillStyle(C.controller, 0.22 * (1 - ph));
      g.fillCircle(hx, hy, cur);
      g.lineStyle(3, C.controller, 1 - ph);
      g.strokeCircle(hx, hy, cur);
      if (sk.rootMs) {
        g.lineStyle(2, FX.root, 0.55 + 0.35 * Math.sin(T / 120));
        g.strokeCircle(hx, hy, R * 0.55);
      }
      if (sk.knockback) {
        g.lineStyle(2, FX.blast, 0.7 * (1 - ph));
        for (i = 0; i < 8; i++) {
          a = i * Math.PI / 4;
          g.lineBetween(hx + Math.cos(a) * cur, hy + Math.sin(a) * cur,
            hx + Math.cos(a) * (cur + 12), hy + Math.sin(a) * (cur + 12));
        }
      }
      me(hx, hy);
      break;

    // 지정 위치에 예고 원이 뜬 뒤 폭발. repeat 만큼 반복한다.
    case 'aoeTarget':
      hx = st.x + st.w * 0.18; hy = st.cy + 22;
      tx = st.x + st.w * 0.62; ty = st.cy - 6;
      R = (sk.radius || 100) * k;
      n = Math.max(1, sk.repeat || 1);
      seg = 1 / n;
      idx = Math.min(n - 1, Math.floor(t / seg));
      lt = (t - idx * seg) / seg;
      g.lineStyle(1, C.controller, 0.22);
      g.lineBetween(hx, hy, tx, ty);
      foe(tx - R * 0.45, ty + 12, lt > 0.62);
      foe(tx + R * 0.50, ty - 14, lt > 0.62);
      if (lt < 0.62) {
        a = 0.22 + 0.30 * Math.abs(Math.sin(lt * 12));
        g.fillStyle(FX.telegraph, 0.10);
        g.fillCircle(tx, ty, R);
        g.lineStyle(2, FX.telegraph, a + 0.35);
        g.strokeCircle(tx, ty, R);
      } else {
        bp = (lt - 0.62) / 0.38;
        cur = R * (0.55 + 0.45 * eo(bp));
        g.fillStyle(FX.blast, 0.50 * (1 - bp));
        g.fillCircle(tx, ty, cur);
        g.lineStyle(3, FX.blast, 1 - bp);
        g.strokeCircle(tx, ty, cur);
      }
      if (n > 1) {
        for (i = 0; i < n; i++) {
          g.fillStyle(i <= idx ? FX.blast : COL.border, 1);
          g.fillCircle(tx - (n - 1) * 6 + i * 12, ty + R + 14, 3.5);
        }
      }
      me(hx, hy);
      break;

    // 투사체 — burst 면 연사, pierce 면 첫 대상을 뚫고 지나간다.
    case 'projectile':
      hx = st.x + st.w * 0.15; hy = st.cy + 6;
      n = Math.max(1, sk.burst || 1);
      var span = st.w * 0.70;
      var e1 = hx + span * 0.55, e2 = hx + span * 0.88;
      var pr = Math.max(3, (sk.radius || 8) * 0.65);
      foe(e1, hy - 2, t * 1.6 > 0.55);
      foe(e2, hy + 6, !!sk.pierce && t * 1.6 > 0.88);
      for (i = 0; i < n; i++) {
        lt = t * 1.6 - i * 0.13;
        if (lt < 0 || lt > 1) continue;
        var bx = hx + 20 + span * lt;
        if (!sk.pierce && bx > e1) bx = e1;
        g.lineStyle(2, FX.projController, 0.30);
        g.lineBetween(Math.max(hx + 20, bx - 18), hy, bx, hy);
        g.fillStyle(FX.projController, 0.9);
        g.fillCircle(bx, hy, pr);
        g.fillStyle(FX.projCore, 0.95);
        g.fillCircle(bx, hy, pr * 0.45);
      }
      me(hx, hy);
      break;

    // 단일 강타 — 파고들었다가 물러난다.
    case 'strike':
      hx = st.cx - 48; hy = st.cy + 10;
      ex = st.cx + 44;
      var lunge = t < 0.22 ? eo(t / 0.22) * 20 : (t < 0.46 ? 20 * (1 - eo((t - 0.22) / 0.24)) : 0);
      var hit = t > 0.20 && t < 0.48;
      foe(ex, hy, hit);
      if (hit) {
        var hp = (t - 0.20) / 0.28;
        g.fillStyle(FX.blast, 0.45 * (1 - hp));
        g.fillCircle(ex, hy, 14 + 20 * hp);
        g.lineStyle(3, FX.spark, 1 - hp);
        for (i = 0; i < 6; i++) {
          a = i * Math.PI / 3 + 0.4;
          g.lineBetween(ex + Math.cos(a) * 11, hy + Math.sin(a) * 11,
            ex + Math.cos(a) * (17 + 20 * hp), hy + Math.sin(a) * (17 + 20 * hp));
        }
      }
      if (sk.rootMs) { g.lineStyle(2, FX.root, 0.75); g.strokeCircle(ex, hy + 12, 19); }
      if (sk.lifestealMul > 1) {
        g.fillStyle(FX.heal, 0.75);
        for (i = 0; i < 3; i++) {
          g.fillCircle(hx + lunge + 12 - i * 7, hy - 16 - ((T / 6 + i * 40) % 34), 2.6);
        }
      }
      me(hx + lunge, hy);
      break;

    // 보호막 / 오라 링
    case 'buff':
      hx = st.cx; hy = st.cy + 8;
      ph = (t % 0.5) / 0.5;
      if (sk.shield) {
        g.fillStyle(FX.block, 0.12); g.fillCircle(hx, hy, 34);
        g.lineStyle(3, FX.block, 0.95 - 0.6 * ph); g.strokeCircle(hx, hy, 32 + 16 * ph);
      }
      if (sk.armorAdd) {
        g.lineStyle(2, FX.guardRing, 0.55 + 0.35 * Math.sin(T / 150));
        pts = [];
        for (i = 0; i < 6; i++) {
          a = T / 900 + i * Math.PI / 3;
          pts.push({ x: hx + Math.cos(a) * 38, y: hy + Math.sin(a) * 38 });
        }
        g.strokePoints(pts, true, true);
      }
      if (sk.damageMul) {
        g.lineStyle(2, FX.blast, 0.85 - 0.5 * ph);
        g.strokeCircle(hx, hy, 26 + 18 * ph);
        for (i = 0; i < 5; i++) {
          a = T / 400 + i * (Math.PI * 2 / 5);
          g.fillStyle(FX.blast, 0.8);
          g.fillCircle(hx + Math.cos(a) * 42, hy + Math.sin(a) * 42, 3);
        }
      }
      if (sk.healNow) {
        g.fillStyle(FX.heal, 0.85);
        for (i = 0; i < 5; i++) {
          g.fillCircle(hx - 24 + i * 12, hy + 18 - ((T / 5 + i * 30) % 52), 3);
        }
      }
      if (sk.speedMul && sk.speedMul !== 1) {
        var fast = sk.speedMul > 1;
        g.lineStyle(2, fast ? C.controller : FX.block, 0.65);
        for (i = 0; i < 3; i++) {
          var ax = hx + (fast ? 44 : -44) + i * (fast ? 12 : -12);
          g.lineBetween(ax, hy - 8, ax + (fast ? 8 : -8), hy);
          g.lineBetween(ax + (fast ? 8 : -8), hy, ax, hy + 8);
        }
      }
      me(hx, hy);
      break;

    // 부채꼴 안의 적이 영웅 쪽으로 빨려온다.
    case 'pull':
      R = (sk.dist || 200) * k;
      half = Math.min(Math.PI, (sk.coneDeg || 120) * Math.PI / 360);
      // 360°(주변 전체)는 부채꼴이 아니라 원이다 — 왼쪽 1/4 지점에 두면 원이 무대를
      // 왼쪽으로 42px 뚫고 나간다(실측). 원일 때만 무대 한가운데에 놓고 반경을 가둔다.
      if ((sk.coneDeg || 0) >= 360) {
        hx = st.cx; hy = st.cy;
        R = Math.min(R, st.w * 0.42, st.h * 0.42);
      } else {
        hx = st.x + st.w * 0.24; hy = st.cy + 8;
        // 부채꼴의 세로 반높이는 R·sin(half) 다. PC 무대는 높이 184 뿐이라 이걸 안 가두면
        // 위아래로 14~48px 잘려 나간다(실측). 마스크가 가려줄 뿐 그림은 잘린 채다.
        var vh = Math.abs(Math.sin(half)) || 1;
        R = Math.min(R, (st.h * 0.42) / vh, st.w * 0.68);
      }
      if ((sk.coneDeg || 0) >= 360) {
        g.fillStyle(C.controller, 0.10); g.fillCircle(hx, hy, R);
        g.lineStyle(1, C.controller, 0.45); g.strokeCircle(hx, hy, R);
      } else {
        pts = [{ x: hx, y: hy }];
        for (i = 0; i <= 18; i++) {
          a = -half + 2 * half * (i / 18);
          pts.push({ x: hx + Math.cos(a) * R, y: hy + Math.sin(a) * R });
        }
        g.fillStyle(C.controller, 0.12); g.fillPoints(pts, true);
        g.lineStyle(1, C.controller, 0.45); g.strokePoints(pts, true, true);
      }
      ph = eo((t % 0.55) / 0.55);
      ang = (sk.coneDeg || 0) >= 360 ? [-2.2, 0.2, 2.6] : [-half * 0.7, 0, half * 0.66];
      for (i = 0; i < 3; i++) {
        d2 = R * (1 - 0.72 * ph);
        ex = hx + Math.cos(ang[i]) * d2;
        ey = hy + Math.sin(ang[i]) * d2;
        g.lineStyle(2, C.controller, 0.55 * (1 - ph));
        g.lineBetween(hx, hy, ex, ey);
        foe(ex, ey, ph > 0.82);
      }
      me(hx, hy);
      break;

    // 지속 링 + 안쪽 점멸
    case 'aura':
      hx = st.cx; hy = st.cy + 8;
      R = (sk.radius || 130) * k;
      g.fillStyle(C.controller, 0.10); g.fillCircle(hx, hy, R);
      g.lineStyle(2, C.controller, 0.55 + 0.35 * Math.sin(T / 170));
      g.strokeCircle(hx, hy, R);
      for (i = 0; i < 12; i++) {
        a = T / 800 + i * Math.PI / 6;
        g.lineStyle(2, C.controller, 0.65);
        g.lineBetween(hx + Math.cos(a) * (R - 8), hy + Math.sin(a) * (R - 8),
          hx + Math.cos(a) * R, hy + Math.sin(a) * R);
      }
      var tick = (T % 700) / 700;
      var ap = [[-0.58, -0.36], [0.62, -0.10], [0.06, 0.62]];
      for (i = 0; i < 3; i++) {
        ex = hx + ap[i][0] * R; ey = hy + ap[i][1] * R;
        if (tick < 0.30) { g.fillStyle(C.controller, 0.30 * (1 - tick / 0.30)); g.fillCircle(ex, ey, 16); }
        foe(ex, ey, tick < 0.30);
      }
      me(hx, hy);
      break;

    // 설치 → 점멸 → 발동
    case 'trap':
      hx = st.x + st.w * 0.24; hy = st.cy + 16;
      tx = st.x + st.w * 0.62; ty = st.cy;
      R = (sk.radius || 70) * k;
      if (t < 0.55) {
        a = Math.sin(t * 30) > 0 ? 0.9 : 0.30;
        g.fillStyle(FX.trap, 0.08); g.fillCircle(tx, ty, R);
        g.lineStyle(2, FX.trap, a); g.strokeCircle(tx, ty, R);
        g.fillStyle(FX.trap, a); g.fillCircle(tx, ty, 5);
        foe(tx + R * (1 - t / 0.55) * 0.9 + 6, ty - 6, false);
      } else {
        bp = (t - 0.55) / 0.45;
        cur = R * (0.6 + 0.4 * eo(bp));
        g.fillStyle(FX.blast, 0.50 * (1 - bp)); g.fillCircle(tx, ty, cur);
        g.lineStyle(3, FX.blast, 1 - bp); g.strokeCircle(tx, ty, cur);
        foe(tx + 6, ty - 6, true);
        if (sk.rootMs) {
          g.lineStyle(2, FX.root, 0.8 * (1 - bp));
          g.strokeCircle(tx + 6, ty + 8, 18);
        }
      }
      me(hx, hy);
      break;

    default:
      me(st.cx, st.cy + 8);
      break;
  }
};

// ════════════════════════════════════════════════════════════════════════════
//  redraw
// ════════════════════════════════════════════════════════════════════════════
GAME.DraftScene.prototype.redraw = function () {
  if (this.phone) return this._redrawPhone();
  if (this.compact) return this._redrawCompact();
  var C = GAME.CONFIG.COLORS;
  var COL = GAME.UI.COL;
  var g = this.g;
  var S = this.split;
  var i;
  g.clear();

  this.drawScout();

  var hero = GAME.HEROES[this.heroKey];
  var st = GAME.Items.applyTo(hero, this.items);
  var px = S.panelX, pw = S.panelW;

  // ── 영웅 확인 띠 ──
  var rh = this.rHero;
  g.fillStyle(COL.surfaceAlt, 1);
  g.fillRoundedRect(px, rh.y, pw, rh.h, 8);
  g.fillStyle(C.controller, 0.9);
  g.fillRoundedRect(px, rh.y, 4, rh.h, { tl: 8, bl: 8, tr: 0, br: 0 });
  this.heroStripL.setText('영웅 확정 — ' + hero.name + ' · ' + hero.trait);
  this.heroStripR.setText('공격 ' + st.damage + ' · 체력 ' + st.hp + ' · 방어 ' + st.armor +
    ' · 이동 ' + st.speed + (st.lifesteal > 0 ? ' · 흡혈 ' + Math.round(st.lifesteal * 100) + '%' : ''));

  // ── 능력치 막대 ──
  var live = { damage: st.damage, cooldown: hero.cooldown, hp: st.hp, armor: st.armor, speed: st.speed };
  for (i = 0; i < this.statRows.length; i++) {
    var sd = GAME.HERO_STAT_DEFS[i];
    var frac = Math.max(0, Math.min(1, sd.get(live) / sd.max));
    var bc = this.statCols[i], bh = 12;
    g.fillStyle(COL.surfaceHi, 1);
    g.fillRoundedRect(bc.x, bc.cy - bh / 2, bc.w, bh, 6);
    if (frac > 0) {
      g.fillStyle(C.controller, 1);
      g.fillRoundedRect(bc.x, bc.cy - bh / 2, Math.max(bh, bc.w * frac), bh, 6);
    }
    g.lineStyle(1, COL.border, 1);
    g.strokeRoundedRect(bc.x + 0.5, bc.cy - bh / 2 + 0.5, bc.w - 1, bh - 1, 6);
    this.statRows[i].val.setText(sd.fmt(live));
  }

  // ── 장비 카드 ──
  var left = this.itemBudget - this.spent();
  for (i = 0; i < this.itemCells.length; i++) {
    var cell = this.itemCells[i];
    var picked = this.items[cell.slot] === cell.item.key;
    var afford = picked || (cell.item.cost <= left);
    var hov = this.hoverItem === cell.item;
    cell.rect.setStrokeStyle(picked ? 2 : 1, picked ? C.controller : (hov ? COL.borderUi : COL.border));
    cell.rect.setFillStyle(picked ? COL.panelTeal : (afford ? (hov ? COL.surfaceHi : COL.surfaceAlt) : COL.bg));

    // 아이콘은 카드 위(this.g, depth 0)에 그린다 — 카드 사각형은 depth -1 이다.
    if (GAME.UI.drawItem) {
      GAME.UI.drawItem(g, cell.slot, cell.item.key, cell.ix, cell.iy, cell.isz);
    }
    if (!afford) {
      // 살 수 없는 칸은 통째로 흐리게 — 아이콘까지 함께 덮어야 '못 산다'가 읽힌다.
      g.fillStyle(COL.bg, 0.58);
      g.fillRoundedRect(cell.x + 1, cell.y + 1, cell.w - 2, cell.h - 2, 6);
    }
    cell.name.setAlpha(afford ? 1 : 0.42);
    cell.cost.setAlpha(afford ? 1 : 0.42);
    cell.note.setAlpha(afford ? 1 : 0.35);
    cell.cost.setColor(picked ? C.accent : (afford ? C.crit : C.textDim));
    if (picked) {
      g.lineStyle(2, C.controller, 0.9);
      g.strokeRoundedRect(cell.x + 1, cell.y + 1, cell.w - 2, cell.h - 2, 7);
    }
  }

  // ── 스킬 탭 + 선택지 ──
  for (i = 0; i < this.slotTabs.length; i++) {
    var tab = this.slotTabs[i];
    var active = tab.slot === this.editSlot;
    tab.rect.setStrokeStyle(active ? 2 : 1, active ? C.controller : COL.border);
    tab.rect.setFillStyle(active ? COL.panelTeal : COL.surfaceAlt);
    var pickIdx = this.picks[tab.slot] || 0;
    GAME.DraftScene.fitText(tab.label,
      tab.slot + ' · ' + hero.skillOptions[tab.slot][pickIdx].name, tab.w - 10, 13, 11);
  }

  var opts = hero.skillOptions[this.editSlot];
  for (i = 0; i < this.optionRows.length; i++) {
    var r = this.optionRows[i];
    if (i >= opts.length) { r.rect.setVisible(false); r.name.setText(''); r.desc.setText(''); continue; }
    r.rect.setVisible(true);
    var sel = (this.picks[this.editSlot] || 0) === i;
    r.rect.setStrokeStyle(sel ? 2 : 1, sel ? C.controller : COL.border);
    r.rect.setFillStyle(sel ? COL.panelTeal : COL.surfaceAlt);
    r.name.setText((sel ? '● ' : '○ ') + opts[i].name);
    r.desc.setText(this._skillDesc(opts[i]));
  }
  this._pvSyncPick();

  // ── 설명 · 예산 ──
  var note = hero.desc + (hero.hint ? '   ·   ' + hero.hint : '');
  if (this.hoverItem) note = this.hoverItem.name + '  ' + this.hoverItem.cost + ' — ' + this.hoverItem.note;
  this.noteText.setText(note);

  this.budgetText.setText('장비 예산  ' + this.spent() + ' / ' + this.itemBudget + '   ·   상대와 동일 조건');
  this.budgetText.setColor(left < 0 ? (C.danger || C.hpBad) : C.textDim);
  this._rollGold(left);
};


// 정찰 — 가로는 편성표, 세로는 예전 미니맵 그대로.
GAME.DraftScene.prototype.drawScout = function () {
  if (GAME.CONFIG.PORTRAIT) return this._drawScoutMap();
  return this._drawRoster();
};

// 정찰도(상대 진형 축소도) — **세로 전용**. 세로 compact 패널이 이걸 그대로 쓴다.
GAME.DraftScene.prototype._drawScoutMap = function () {
  var C = GAME.CONFIG.COLORS;
  var g = this.g;
  var S = this.split;
  var i;
  // 아레나 전체를 이 사각형에 맞춰 축소해 그린다. 세로 비율을 유지한다.
  var A = GAME.CONFIG.ARENA;
  var sc = Math.min(S.scoutW / A.w, S.scoutH / A.h);
  var dw = A.w * sc, dh = A.h * sc;
  var ox = S.scoutX + (S.scoutW - dw) / 2;
  var oy = S.scoutY + (S.scoutH - dh) / 2;

  g.fillStyle(C.arenaFill, 1);
  g.fillRect(ox, oy, dw, dh);
  // 전략가/컨트롤러 구역
  var zs = GAME.CONFIG.ZONE_STRATEGIST, zc = GAME.CONFIG.ZONE_CONTROLLER;
  g.fillStyle(C.zoneStrategist, 0.5);
  g.fillRect(ox, oy + (zs.y - A.y) * sc, dw, zs.h * sc);
  g.fillStyle(C.zoneController, 0.5);
  g.fillRect(ox, oy + (zc.y - A.y) * sc, dw, zc.h * sc);
  g.lineStyle(1, C.arenaLine, 0.35);
  for (var gy = A.y + 100; gy < A.bottom; gy += 100) {
    g.lineBetween(ox, oy + (gy - A.y) * sc, ox + dw, oy + (gy - A.y) * sc);
  }
  g.lineStyle(2, C.arenaLine, 1);
  g.strokeRect(ox, oy, dw, dh);

  // 적 유닛 (축소 좌표, 위에서 아래 순서로)
  var enemies = this.formation.units.map(function (u) {
    var w = GAME.Formations.toWorld(u);
    return { type: u.type, x: w.x, y: w.y };
  }).sort(function (a, b) { return a.y - b.y; });

  for (i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    var def = GAME.UNITS[e.type];
    if (!def) continue;
    var sx = ox + (e.x - A.x) * sc, sy = oy + (e.y - A.y) * sc;
    // 지원 유닛 범위
    var FX = GAME.UI.FX;
    if (def.healRadius) { g.lineStyle(1, FX.healRing, 0.35); g.strokeCircle(sx, sy, def.healRadius * sc); }
    if (def.buffRadius) { g.lineStyle(1, FX.buffRing, 0.35); g.strokeCircle(sx, sy, def.buffRadius * sc); }
    if (def.isMine) { g.lineStyle(1, FX.mineRing, 0.6); g.strokeCircle(sx, sy, def.triggerRadius * sc); }
    if (def.intercept) { g.lineStyle(1, FX.guardRing, 0.4); g.strokeCircle(sx, sy, def.intercept * sc); }
    GAME.UI.drawUnitFlat(g, def, sx, sy, C.strategist, 1, Math.max(0.62, sc * 1.15));
    if (GAME.isAutoHit(def)) { g.lineStyle(1.5, FX.targetRing, 0.9); g.strokeCircle(sx, sy, def.radius * sc + 4); }
  }

  // 내 시작 위치 표시
  var Z = GAME.CONFIG.ZONE_CONTROLLER;
  var hx = ox + (Z.x + Z.w / 2 - A.x) * sc, hy = oy + (Z.y + Z.h * 0.55 - A.y) * sc;
  var hero = GAME.HEROES[this.heroKey];
  g.lineStyle(1.5, C.controller, 0.6);
  g.strokeCircle(hx, hy, hero.range * sc);
  // art 를 같이 넘겨야 한다 — 영웅과 유닛이 shape 를 공유해서, 빼먹으면
  // 정찰도의 내 영웅이 엉뚱한 유닛 모양으로 그려진다.
  GAME.UI.drawUnitFlat(g, { radius: hero.radius, shape: hero.shape, art: hero.art },
    hx, hy, C.controller, 1, Math.max(0.7, sc * 1.2));

  // 적 구성 요약
  var counts = {};
  this.formation.units.forEach(function (u) { counts[u.type] = (counts[u.type] || 0) + 1; });
  var summary = Object.keys(counts).map(function (k) {
    return (GAME.UNITS[k] ? GAME.UNITS[k].name : k) + ' ' + counts[k];
  }).join(' · ');
  if (!this.scoutSummary) {
    this.scoutSummary = GAME.UI.label(this, S.scoutX, S.scoutY + S.scoutH + 6, '',
      GAME.CONFIG.PORTRAIT ? 13 : 12, C.textDim, 0).setWordWrapWidth(S.scoutW);
  }
  this.scoutSummary.setText('적 ' + this.formation.units.length + '기 — ' + summary);
};
