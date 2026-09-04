window.GAME = window.GAME || {};

GAME.BattleScene = function () {
  Phaser.Scene.call(this, { key: 'Battle' });
};
GAME.BattleScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.BattleScene.prototype.constructor = GAME.BattleScene;

GAME.BattleScene.prototype.init = function (data) {
  //  ⚠⚠ **씬 인스턴스는 재사용된다** — 여기서 안 지우면 지난 판의 값이 그대로 남는다.
  //    콤보가 정확히 그 사고였다(2026-08-04 사용자 신고: "다른 디바이스에서 진행
  //    시작할때 콤보글자가 화면 크게떠서 화면을 가리는 버그"):
  //    `state.elapsed` 는 새 판에서 0 부터 시작하는데 `_comboAt` 은 지난 판의 큰 값이
  //    남아 `since = elapsed - _comboAt` 이 **음수**가 되고, 등장 팝 계산
  //    `1 + (1 - since/140) * 0.42` 가 폭주해 글자가 화면만 하게 떴다.
  //  ⚠ 아래 `drawNumbers` 의 팝에도 하한을 뒀지만, **근본은 여기서 지우는 것**이다.
  //    이 저장소의 '지연생성 가드' 함정과 같은 계열 — 상태를 씬에 두면 init 에서 되돌린다.
  this._combo = 0;
  this._comboAt = -9999;
  //  ping 감시 필드도 판마다 되돌린다 — 새 판의 카운터는 0에서 시작하는데 지난 판
  //  값이 남으면 시작하자마자 유령 알림(콤보 사고와 같은 계열)이 뜬다.
  this._reflectSeen = 0; this._comboSeen = 0; this._ksSeen = 0; this._ubSeen = 0;

  //  상하반전은 판마다 다시 정한다 — 리셋 없이는 RT 다음의 일반 전투가 뒤집혀 나온다.
  if (GAME.Iso) GAME.Iso.rtFlip = false;
  this._comboTier = -1;      // 색 단계 캐시 — 안 지우면 지난 판의 빨강이 남는다
  this._swings = null;
  this._prevCd = undefined;
  this._prevHp = null;

  //  실시간 대전(P3, 2026-08-20) — 진형은 서버 릴레이로 받은 스냅샷이다(저장소에 없음).
  //  ⚠ 시뮬에 닿는 모든 것(시드·진형·영웅)이 양쪽 클라이언트에서 같아야 한다.
  this.rt = data.rt || null;
  if (this.rt) {
    //  스폰은 _rtCompose 가 양측 세팅(rt.my/rt.their)으로 직접 한다 — 표준 진형
    //  루프는 빈 스텁으로 무력화(2026-08-21 개편: 역할 조합 자유).
    this.formation = { id: '__rt', name: '실시간 전장', units: [], author: '', at: 0 };
  } else {
    this.formation = GAME.Formations.getById(data.formationId);
  }
  this.heroKey = data.heroKey;
  this.items = data.items || {};
  this.picks = data.picks || GAME.defaultSkillPicks();
  this.tower = data.tower || 0;      // 통곡의 탑 층수 (0이면 일반 대전)
  //  지난 층 다시(2026-08-31) — 층 전진·기록·드랍·점수 없는 연습 판 표식.
  this.towerReplay = !!data.replay;
  this.versus = !!data.versus;       // 대전(비동기 PvP) 공격 — 승패로 트로피가 오간다
  // ── 시험 판 (2026-07-30, 사용자 지시) ─────────────────────────────────────
  //  내 전장을 내가 쳐 보는 연습이다. **아무것도 기록하지 않는다** —
  //  점수·트로피·배치도 전적·서버 격파율 넷 다. 자기 전장을 상대로 기록이 쌓이면
  //  격파율·랭킹이 통째로 거짓이 되기 때문이다(혼자서 무한히 올릴 수 있다).
  //  기록을 거르는 곳을 **한 군데로 모은다** — 갈라놓으면 하나를 빼먹는다.
  this.test = !!data.test;
  //  ⚠ 기본 스폰을 PC 좌표(600,590)로 박으면 폰 프로필(아레나 bottom 384)에서
  //    **아레나 밖**에 선다 — 탄막 판에서 화살이 경계 소멸로 영웅을 못 맞추는
  //    유령 현상의 진범이었다(2026-08-23 실측). 컨트롤러 구역에서 계산한다.
  this.startPos = data.startPos || (function () {
    var Z = GAME.CONFIG.ZONE_CONTROLLER;
    return { x: Z.x + Z.w / 2, y: Z.y + Z.h * 0.55 };
  })();
  this.ended = false;
  //  ⚠ 씬 인스턴스는 재사용된다 — [한판 더] 재대결에서 안 되돌리면 두 판째부터
  //  실시간 점수 정산이 조용히 빠지고(_rtScored 잔류) 방 유지 플래그가 샌다.
  this._rtScored = false;
  this._rtKeepRoom = false;
  //  협동(S-C) — 피해 추적 원복 함수·파트너 체력바. 씬 재사용이라 여기서 되돌린다.
  this._coopRestore = null;
  this._coopBar = null;
  this._coopFormation = null;
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
  //  토스트 큐 — 씬 인스턴스가 재사용되므로 여기서 되돌린다(이 파일의 상습 사고 계열).
  this._toasts = null;      //  크레딧 스택 자막 — 씬 재사용 대비 초기화

  //  ── 게임필 (2026-09-02 C 갈래) — 슬로모·이모트·햅틱 상태, 전부 판마다 되돌린다 ──
  this._slowmo = 0;             //  남은 슬로모(ms). 지난 판 값이 남으면 새 판이 느리게 시작한다
  this._slowmoFired = false;    //  한 판에 한 번 — _endGate 와 ended 블록이 둘 다 부른다
  this._emoteLastAt = -1e9;     //  스팸 방지 쿨의 기준 시각(performance.now)
  this._emoteBar = null;        //  파괴된 버튼을 붙들지 않게(지연생성 가드 함정)
  //  ⚠ 힌트·물약 라벨은 **레이아웃에 따라 안 만드는 판**이 있다(폰 가로·실시간). 안 되돌리면
  //    직전 판의 파괴된 Text 를 updateHud 가 setColor 해 Phaser 안에서 터진다
  //    (v3.0 실측: 연습 대전 → 탑 1층 진입에서 `reading 'cut'`).
  this.hintText = null;
  this.potionText = null;
  this._bubbles = [];           //  떠 있는 말풍선 — 지난 판 것이 파괴된 채 남으면 setPos 에서 터진다
  this._hapKillAt = -1e9;       //  처치 진동 간격(난전에서 연속으로 울리지 않게)
};

GAME.BattleScene.prototype.create = function () {
  //  ── 전투 음악 (2026-09-03 시즌2 S-S/S-A) ─────────────────────────────────────
  //  통곡의 탑은 **세계 곡의 base 레이어만 0.15** 로 깔고(playBattle — 타격 대역은 EQ 로
  //  비운다), 긴장 겹(tense)은 updateHud 가 영웅 체력·보스 페이즈로 올린다. 협동 판은
  //  S-C 가 `coop.world` 를 들고 온다. 그 밖(대전·수성·실시간)은 예전대로 음악을 끈다 —
  //  타격·경고음이 이 게임의 신호다.
  if (GAME.Music) {
    var _wk = this.tower ? GAME.Music.worldKeyFor(this.tower)
            : (this.rt && this.rt.coop && this.rt.coop.world) ? this.rt.coop.world : null;
    if (_wk && GAME.Music.playBattle) GAME.Music.playBattle(_wk); else GAME.Music.stop();
  }
  //  보스 포효는 `_setupBossIntro` 한 곳에서만 낸다(예전엔 여기서도 불러 같은 프레임에
  //  두 번 울렸다 — sound.js 가 1.2초 게이트로 막고 있었지만 호출부를 하나로 정리했다).
  var C = GAME.CONFIG.COLORS;
  var self = this;

  this.cameras.main.setBackgroundColor(C.bg);
  this.g = this.add.graphics();

  // ── 줌용 '전장 레이어' ──────────────────────────────────────────────────
  // 전장 그림만 한 겹(worldLayer)에 담는다. 확대는 이 레이어의 스케일·오프셋으로만
  // 일어나므로 HUD·스킬바·사이렌·종료막은 **구조적으로** 같이 커질 수 없다.
  // 2026-08-23 4차: 레이어를 **전 프로필**에 만든다 — 보스 인트로 줌이 폰에서도
  // 필요해서다. 휠 줌 입력만 PC 전용으로 남는다(핀치 줌은 여전히 범위 밖).
  // z=1 에서는 마스크도 안 걸려 예전과 같은 렌더 경로다(setZoom 주석 참조).
  this._zoomOn = !GAME.isTouch;
  this.worldLayer = this.add.container(0, 0);
  this.worldLayer.add(this.g);
  //  전장 규칙의 **유닛 위** 겹(시즌2 S-A) — 안개 마스크·바람 줄기·낙뢰 번쩍. 유닛 g 뒤에
  //  더해 위에 오게 하고, draw 의 마지막에서 bringToTop 으로 매 프레임 맨 위를 보증한다
  //  (보스 시트 Image 가 나중에 worldLayer 에 mount 되므로 순서만으로는 못 지킨다).
  this._overG = this.add.graphics();
  this.worldLayer.add(this._overG);
  this._fieldOpts = { focus: { x: 0, y: 0 }, sightR: 0 };   // drawField 에 넘길 모듈 버퍼(매 프레임 할당 금지)
  this._tenseAt = 0;

  this.state = GAME.Combat.createState();
  //  전투 속도(PACE)는 통곡의 탑 전용 — createState 가 끄고, 여기서만 켠다.
  GAME.Combat.paceOn = !!this.tower;
  //  슬로모가 걸어 둔 시계 배율을 되돌린다 — 씬 플러그인(time/tweens)은 인스턴스와 함께
  //  살아남으므로 지난 판이 슬로모 중에 끝났으면 새 판의 트윈·타이머가 0.35배로 돈다.
  this._setTimeScale(1);

  //  실시간: 시뮬 난수를 서버 시드로 고정 + 승패 규칙 전환(P1 의 pvpRealtime).
  //  ⚠ 유닛 생성 **전에** 걸어야 한다 — 생성 순서·초기값까지 결정론에 들어간다.
  if (this.rt) {
    GAME.Combat.seedRng(this.rt.seed);
    this.state.pvpRealtime = true;
    //  맵 변형(2026-08-31 태현님 ④) — 같은 시드라 양쪽이 같은 맵을 고른다.
    //  협동(S-C)은 세계 보스 층 전장이라 대전 맵을 안 깐다(전장 규칙은 RtCoop.spawn 이 얹는다).
    if (GAME.RtMaps && !this.rt.coop) this.state.rtMap = GAME.RtMaps.forSeed(this.rt.seed);
    if (this.rt.coop) this._rtComposeCoop(); else this._rtCompose();
  }

  // 난이도 — 탑은 층수로, 일반 대전은 격파 횟수(escalation)로 강해진다
  var lrec = this.rt ? { escalation: 0 } : GAME.Learn.get(this.formation.id);
  this.escalation = this.tower ? (this.tower - 1) : (lrec.escalation || 0);
  var mods = this.tower ? GAME.Tower.modsFor(this.tower)
                        : GAME.Learn.escalationMods(this.escalation);

  //  ── 보너스 판 (2026-08-23 태현님) — 20% 확률, 알지키기('guard')/알깨기('break') ──
  //  결정은 tower.js `bonusFor`(결정적 난수)가 한다. 여기서는 판을 꾸밀 뿐이다.
  //  지난 층 다시(2026-08-31 태현님) — 막간(보너스 판)을 섞지 않는다.
  //  ⚠ towerReplay 플래그는 init 이 세운다(여기는 create — data 가 없다.
  //    실제로 여기서 data.replay 를 읽다가 전투가 통째로 죽었다, 감사가 잡음).
  this.towerBonus = (this.tower && !this.towerReplay) ? GAME.Tower.bonusFor(this.tower) : null;

  // ── 층 조건 훅을 state 에 싣는다 (2026-07-30 대개편) ─────────────────────
  //  배수로 표현되는 조건(철벽·질풍·좁은눈)은 위 `mods` 에 이미 곱해져 있고,
  //  **시간·처치순서·추격·물약** 처럼 배수로 못 쓰는 것은 전투가 매 프레임 읽어야 한다.
  //  `state.towerRule` 이 그 통로다 — 없으면 combat.js 는 아무 일도 하지 않는다.
  //  ⚠ 탑이 아닌 모드(대전·방어전)에는 절대 싣지 않는다. 조건은 탑의 것이다.
  this.towerRule = this.tower && GAME.TowerRule
    ? GAME.TowerRule.hooksFor(this.tower) : null;
  this.state.towerRule = this.towerRule;
  // 치유 구역 — 통곡의 탑 전투에서만 켠다(물약을 대신하는 자리라 탑 전용이다).
  this.state.towerHealOn = !!this.tower;
  // 보스 층은 회복을 **시간으로** 뿌린다(js/healzone.js `tickBoss`).
  // 처치 기반 드랍은 보스 층에서 사실상 0개라 근접 영웅이 버틸 방법이 없었다.
  this.state.bossHealOn = !!(this.tower && GAME.Tower.isBossFloor &&
                             GAME.Tower.isBossFloor(this.tower));
  //  ── 소환수 층 추종 (2026-09-04 태현님: "주술사 유닛이 너무 약해 나오자마자 1방에 죽어") ──
  //  적 유닛은 `unitModsFor` 로 층·성장 배수를 받는데 **내 소환수는 UNITS 원본 그대로**였다.
  //  실측(고성장 90층): 적 한 대가 195, 소환한 전사 체력이 192 — 정확히 한 대에 죽는다.
  //  적 체력은 13.3배로 자라는 동안 소환수는 1.0배에 묶여 있었다.
  //  ⚠ **두 축을 엇갈려 곱한다.** 소환수 체력은 `적 공격 배수`를, 소환수 공격은 `적 체력
  //    배수`를 따라간다 — 그래야 "몇 대 버티는가 / 몇 대에 죽이는가"가 층·성장과 무관하게
  //    보존된다(js/tower.js 의 hpMul/dmgMul 이 적을 나에게 맞추는 것의 거울). 같은 축끼리
  //    곱하면(체력↔체력) 한쪽으로 몰아준 빌드에서 소환수가 같이 기울어 무의미해진다.
  //  ⚠ 층수·질 배수를 **안 넘긴다.** 태현님 지시대로 소환수는 층이 아니라 내 능력치를
  //    따라간다(js/tower.js `summonModsFor` — atkIndex·ehpIndex 만 본다).
  //  ⚠ 계산식은 `js/tower.js summonModsFor` 한 곳에만 둔다 — 여기와 tools/sim.js 가
  //    같은 함수를 부른다. 손으로 베끼면 도구가 실제 게임과 다른 것을 재게 된다.
  //  ⚠ 탑에서만 싣는다. 실시간·대전은 이 값이 없으면 combat.js 가 1 로 본다 — 록스텝은
  //    양쪽이 같은 값을 봐야 하는데 캐릭터 성장은 사람마다 달라 끼면 즉시 갈라진다.
  if (this.tower && GAME.Tower.summonModsFor) {
    this.state.summonMods = GAME.Tower.summonModsFor();
  }
  this.towerRuleInfo = this.tower && GAME.TowerRule
    ? GAME.TowerRule.ruleFor(this.tower) : null;
  //  전장 규칙(시즌2 S-W · 다섯 세계) — 세계마다 다른 `state.towerField`. 초원은 null,
  //  보너스 판은 싣지 않는다. 그리기는 S-A(`state.fieldFx`), 갱신은 Combat.update 가 한다.
  if (this.tower && !this.towerBonus && GAME.TowerCurriculum && GAME.TowerCurriculum.fieldFor) {
    var fdW = GAME.TowerCurriculum.fieldFor(this.tower);
    if (fdW) GAME.Combat.setField(this.state, fdW);
  }
  // 층 목표는 **유닛이 다 만들어진 뒤** 붙여야 한다(우두머리를 고르려면 적이 있어야 한다).
  // → 아래 진형 생성이 끝난 자리에서 `TowerObjective.attach` 를 부른다.
  var bias = (lrec.adapt && lrec.adapt.rallyBias) || 0;

  // 이 배치도의 유닛 등급 — 내 기지면 내 기록, 남의 기지면 서버가 실어 준 값.
  var fUnitLv = this.formation.unitLv ||
    ((this.versus && GAME.ArenaBuild &&
      this.formation.id === (GAME.Arena.get() || {}).baseId)
      ? GAME.ArenaBuild.get().unitLv : null) || {};

  for (var i = 0; i < this.formation.units.length; i++) {
    //  알깨기·탄막 판은 적 유닛이 없다 — 진형은 만들어졌지만 스폰하지 않는다.
    if (this.towerBonus === 'break' || this.towerBonus === 'dodge') break;
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
    // 보스는 **자기 성장 곡선**을 쓴다(js/tower.js 의 bossModsFor) — 일반 유닛과
    // 같은 선형 배수로는 지수로 자라는 영웅 화력을 못 따라간다.
    var uMods = mods;
    if (this.tower && GAME.UNITS[e.type] && GAME.UNITS[e.type].isBoss && GAME.Tower.bossModsFor) {
      uMods = GAME.Tower.bossModsFor(this.tower);
    } else if (this.tower && GAME.Tower.unitModsFor) {
      // 진형 전체가 똑같이 세지지 않도록 **유닛 자리마다** 성향을 다르게 뽑는다
      // (js/tower.js `UNIT_PROFILES` 참조 — 사용자 지시: "두 축을 분리하여 따라가는게
      // 전부다 그렇지않게해줘 … 결국 사용자입장에서 변칙적이어야해"). 평균은
      // `mods`(균일 modsFor)와 같아서 예산·곡선 실측은 그대로 유효하다.
      uMods = GAME.Tower.unitModsFor(this.tower, i);
      //  질 배수 (2026-08-22 태현님: "유닛 수가 많아지기만 한다") — 머릿수 상한으로
      //  줄어든 수(n0→n)만큼 유닛을 세게 만든다. 총력은 란체스터식(Σdps×Σehp ∝ n²hd)
      //  이라 √분배로는 n² 손실을 못 메운다(실측: R-1 이 12층 42% 로 터졌다) —
      //  지수 합이 2 여야 총력이 보존된다. 체력에 1.25·공격에 0.75 를 주는 이유:
      //  공격에 절반(1.0)을 다 주면 저층에서 한 방이 너무 매워진다(4층 q≈2.7).
      //  보스는 제외 — 자기 곡선이 이미 캡과 무관하다.
      var qM = this.formation.qualityMul > 1 ? this.formation.qualityMul : 1;
      if (qM > 1) {
        var qm2 = {};                        // 규칙 훅이 얹은 다른 키를 잃지 않는다
        for (var qk in uMods) qm2[qk] = uMods[qk];
        qm2.hp = (qm2.hp || 1) * Math.pow(qM, 1.25);
        qm2.damage = (qm2.damage || 1) * Math.pow(qM, 0.75);
        uMods = qm2;
      }
    }
    this.state.units.push(GAME.Combat.createUnit(e.type, wx, w.y, 'strategist', uMods));
  }

  // ── 통곡의 탑: 영구 캐릭터(js/towerchar.js)에서 영웅을 만든다 (2026-08-01) ──
  //  ⚠ **아이템은 `createHero` 에 안 넘긴다.** `GAME.Items.applyTo`(combat.js 가 부름)는
  //    `GAME.ITEMS`(대전·수성탑 공용, w1~w3 등)만 알고, 탑의 새 카탈로그
  //    (`GAME.TowerShopItems`, w1~w8 + accessory)는 키 이름부터 다르다 — 그대로
  //    넘기면 `Items.find` 가 못 찾아 **조용히 보정 0** 이 된다(에러도 없다).
  //    그래서 빈 아이템으로 영웅을 만들고, 아래에서 `TowerChar.itemBonus` 를
  //    스탯 레벨업과 같은 방식으로 **직접 def 에 더한다**(대전의 ArenaBuild.statBonus
  //    와 완전히 같은 패턴 — CLAUDE.md: "두 곳이 갈라지면 강화가 모드마다 다른 값이 된다").
  var towerItems = this.tower ? {} : this.items;
  if (!this.rt) {
    this.hero = GAME.Combat.createHero(
      this.heroKey, this.startPos.x, this.startPos.y, 'controller', towerItems, this.picks);
  }

  if (this.tower && GAME.TowerChar && GAME.TowerChar.exists()) {
    var tc = GAME.TowerChar.get();
    var bonus = GAME.TowerChar.statBonus(tc);
    var ib = GAME.TowerChar.itemBonus(tc);
    var d = this.hero.def;
    d.damage += bonus.damage + ib.damage;
    d.armor += bonus.armor + ib.armor;
    d.speed += bonus.speed + ib.speed;
    d.lifesteal = (d.lifesteal || 0) + ib.lifesteal;
    this.hero.cdrMul = (this.hero.cdrMul || 1) * ib.cdrMul;
    //  공격속도 — **평타 간격만** 줄인다(스킬 쿨은 cdrMul 축이 따로 있다).
    //  능력치 + 아이템(atkspeedAdd)이 한 축으로 합산된다(2026-08-22 아이템 확장).
    //  하한 250ms: 넘어가면 타격음·모션이 뭉개져 연타가 아니라 소음이 된다.
    var asTotal = (bonus.atkspeed || 0) + (ib.atkspeed || 0);
    if (asTotal > 0) {
      d.cooldown = Math.max(250, Math.round(d.cooldown / (1 + asTotal / 100)));
    }
    //  치명타 — 기본(전 유닛 25%·×1.5) 위에 얹는다. 확률 50% 상한, 넘치면 피해로
    //  전환(TowerChar.critOf). **탑에서만** 붙는다 — 실시간 대전은 이 분기를 안 지나
    //  critChance 가 없고, combat 은 없으면 CONFIG 기본값으로 구른다.
    var critTotal = (bonus.crit || 0) + (ib.crit || 0);
    if (critTotal > 0 && GAME.TowerChar.critOf) {
      var critEff = GAME.TowerChar.critOf(critTotal);
      this.hero.critChance = critEff.chance / 100;
      this.hero.critMul = critEff.mul;
    }
    var hpBonus = bonus.hp + ib.hp;
    if (hpBonus) {
      d.hp += hpBonus;
      this.hero.maxHp = d.hp;
      this.hero.hp = d.hp;
    }
    this.runBonus = bonus;
    // 장착한 무기가 **전장에서도 보인다**(2026-07-31 사용자 지시). 실루엣은 그대로 두고
    // 재질·광휘만 등급을 따른다 — 이유는 js/eggart.js 의 `UI.GEAR_TIERS` 주석 참조.
    // 렌더 전용 값이라 `_hurt` 처럼 유닛에 얹어 둔다(combat 은 이 키를 모른다).
    this.hero._gearTier = GAME.UI.gearTierOf(tc.items && tc.items.weapon);
    //  방어구·신발·장신구도 그림에 반영한다(2026-08-03). 무기와 **같은 등급 함수**를
    //  쓴다 — 아이템 키에서 단계를 읽는 규칙이 하나여야 표가 갈라지지 않는다.
    this.hero._kit = {
      armor: GAME.UI.gearTierOf(tc.items && tc.items.armor),
      boots: GAME.UI.gearTierOf(tc.items && tc.items.boots),
      acc:   GAME.UI.gearTierOf(tc.items && tc.items.accessory)
    };
    // 비싼 스킬이 실제로 더 세다 — **탑에서만**(대전은 이 줄을 안 지난다).
    // 근거와 배수는 js/heroes.js 의 `GAME.SKILL_PRICE_SCALE` 주석 참조.
    GAME.scaleSkillsByPrice(this.hero.skills);
    // 구슬(js/orb.js)은 그대로 쓴다 — **이번 전투 안에서만** 적용된다.
    // 옛 방식은 `TowerRun.boons` 에 쌓아 다음 층까지 이어 붙였지만, 도전(run)이라는
    // 단위 자체가 없어졌으니 "이번 판에서 주운 것만 이번 판에 듣는다"로 자연히
    // 단순해졌다 — orb.js/towerboon.js 는 한 줄도 안 건드렸다.
    if (GAME.TowerBoon) this.state.boons = GAME.TowerBoon.hooksFor({ boons: [] });
    // 시즌2 특성(js/traits.js) — 축복과 같은 훅 묶음에 영구로 얹는다(S-H 통합 항목).
    if (GAME.Traits && GAME.Traits.attach) GAME.Traits.attach(this.state, tc);
    // 유틸 특성 「속도·쿨감」(haste) — combat.js 가 모르는 훅이라 **탑 전투에서만**
    // (tc 는 TowerChar 레코드 — 대전/RT 는 이 줄을 안 지난다) 여기서 직접 곱한다.
    // `hero.cdrMul` 을 곱하는 패턴은 282·343번째 줄의 아이템 보정과 같다.
    var hst = this.state.boons && this.state.boons.haste;
    if (hst) {
      if (hst.speedMul) this.hero.speed = Math.round(this.hero.speed * hst.speedMul);
      if (hst.cdrMul) this.hero.cdrMul = (this.hero.cdrMul || 1) * hst.cdrMul;
    }
  }
  // ── 대전 컨트롤러 (2026-08-01 개편) ────────────────────────────────────────
  //  **능력치 강화는 없앴다**(사용자 지시). 강해지는 길은 아이템 하나뿐이다.
  //  아이템은 탑과 **같은 카탈로그**(`GAME.TowerShopItems`)를 쓰는데,
  //  `Combat.createHero` 는 옛 표(`GAME.ITEMS`, 3단계)로 해석하므로 그쪽에는
  //  `{}` 를 넘기고 보정을 여기서 직접 얹는다 — 탑이 쓰는 방식과 똑같다.
  //  ⚠ 두 모드가 **같은 itemBonus 규칙**을 쓴다(TowerChar.itemBonus ↔ ArenaBuild.itemBonus).
  //    갈라지면 같은 아이템이 모드마다 다른 값이 된다.
  if (this.versus && GAME.ArenaBuild) {
    var ab = GAME.ArenaBuild.get();
    var aib = GAME.ArenaBuild.itemBonus(ab);
    var ad = this.hero.def;
    ad.damage += aib.damage;
    ad.armor += aib.armor;
    ad.speed += aib.speed;
    ad.lifesteal = (ad.lifesteal || 0) + aib.lifesteal;
    this.hero.cdrMul = (this.hero.cdrMul || 1) * aib.cdrMul;
    if (aib.hp) {
      ad.hp += aib.hp;
      this.hero.maxHp = ad.hp;
      this.hero.hp = ad.hp;
    }
    // 장착 무기가 전장에서도 보인다(탑과 같은 등급 아트).
    this.hero._gearTier = GAME.UI.gearTierOf(ab.items && ab.items.weapon);
    this.hero._kit = {
      armor: GAME.UI.gearTierOf(ab.items && ab.items.armor),
      boots: GAME.UI.gearTierOf(ab.items && ab.items.boots),
      acc:   GAME.UI.gearTierOf(ab.items && ab.items.accessory)
    };
    // ⚠ `GAME.scaleSkillsByPrice` 는 **부르지 않는다** — 대전은 모든 스킬이
    //   표에 적힌 값 그대로다(사용자 지시: "모든 스킬은 유사한 밸런스를 가진다").
  }

  if (!this.rt) this.state.units.push(this.hero);
  //  ── 황금알 스폰 (2026-08-23 보너스 판) ────────────────────────────────────
  //  알깨기: 적 없는 전장 한가운데(전략가 진형 자리). 알지키기: 영웅 진영 쪽.
  //  체력은 층 배수(mods)를 태워 성장을 따라간다 — TTK 가 층과 무관하게 비슷해진다.
  if (this.towerBonus && this.towerBonus !== 'dodge') {
    var A = GAME.CONFIG.ARENA;
    var eggKey = this.towerBonus === 'break' ? 'bonusEggBreak' : 'bonusEggGuard';
    var zs = GAME.CONFIG.ZONE_STRATEGIST, zc = GAME.CONFIG.ZONE_CONTROLLER;
    var ex = A.x + A.w / 2;
    var ey = this.towerBonus === 'break' ? (zs.y + zs.h * 0.72)
                                         : (zc.y + zc.h * 0.34);
    var eggSide = this.towerBonus === 'break' ? 'strategist' : 'controller';
    this._egg = GAME.Combat.createUnit(eggKey, ex, ey, eggSide, mods);
    this.state.units.push(this._egg);
    //  알깨기 골드 풀 — "때린 피해만큼": 총액 = 층 골드의 3배(태현님: "후하게").
    //  12조각으로 나눠 피해 진행률을 따라 동전으로 떨어뜨린다(coin.js 파이프라인 재사용).
    if (this.towerBonus === 'break' && GAME.TowerRun) {
      this._eggPool = Math.round(GAME.TowerRun.goldFor(this.tower) * 3);
      this._eggChunks = 0;
    }
    //  ── 알 체력은 그 판의 **실효 DPS 에서 역산**한다 (2026-08-23 태현님:
    //  "3대만 맞으면 깨져 지킬 수가 없어" · "최소 30초는 때려야 모든 보상") ────────
    //  고정 체력(900/1000)은 층 배수·PACE 를 거치며 수명이 층마다 널뛰었다.
    //  목표는 체력이 아니라 **시간**이다 — 초를 정하고 DPS 를 곱해 체력을 만든다.
    var PB = GAME.CONFIG.PACE || {};
    if (this.towerBonus === 'guard') {
      //  방치하면 GUARD_SEC 만에 깨진다 — 그 안에 달라붙는 적을 걷어내는 것이 게임.
      //  armor 12(비율 경감 ~11%)가 별도로 있어 실제 수명은 이보다 조금 길다.
      var GUARD_SEC = 16;
      var edps = 0;
      for (var gi = 0; gi < this.state.units.length; gi++) {
        var gu = this.state.units[gi];
        if (gu.side !== 'strategist' || !gu.alive || !gu.def || !gu.def.damage) continue;
        edps += gu.def.damage * 1000 / Math.max(400, gu.def.cooldown || 1000);
      }
      this._egg.hp = this._egg.maxHp =
        Math.max(900, Math.round(edps * (PB.DMG || 1) * GUARD_SEC));
    } else if (this._egg) {
      //  풀보상까지 BREAK_SEC — 평타 기대 DPS(치명 포함)×스킬 여유 1.5로 나눈 시간.
      var BREAK_SEC = 31;
      var hd2 = this.hero.def;
      var cc2 = this.hero.critChance !== undefined ? this.hero.critChance
                                                   : (GAME.CONFIG.CRIT_CHANCE || 0);
      var cm2 = this.hero.critMul !== undefined ? this.hero.critMul
                                                : (GAME.CONFIG.CRIT_MULT || 1.5);
      var hdps = hd2.damage * 1000 / Math.max(250, hd2.cooldown || 1000);
      hdps *= (1 + cc2 * (cm2 - 1)) * (PB.HERO_DMG || 1) * 1.5;
      this._egg.hp = this._egg.maxHp = Math.max(1000, Math.round(hdps * BREAK_SEC));
    }
    //  시작 배너 — 타임 오버 배너와 같은 문법(2.2초 뒤 스스로 사라진다).
    var bnW = GAME.CONFIG.WIDTH, bnH = GAME.CONFIG.HEIGHT;
    var bnTxt = this.add.text(bnW / 2, bnH * 0.30,
      this.towerBonus === 'break' ? '🥚 보너스! 황금알을 깨라!' : '🥚 보너스! 황금알을 지켜라!', {
        fontFamily: GAME.CONFIG.FONT, fontSize: (GAME.CONFIG.SMALL ? 30 : 44) + 'px',
        fontStyle: 'bold', color: '#ffd54a', stroke: '#4d3305',
        strokeThickness: GAME.CONFIG.SMALL ? 5 : 7
      }).setOrigin(0.5).setDepth(3001);
    var bnSub = this.add.text(bnW / 2, bnTxt.y + bnTxt.height * 0.5 + 10,
      this.towerBonus === 'break' ? '때린 피해만큼 골드가 쏟아진다'
                                  : '판이 끝날 때까지 살아 있으면 큰 보상!', {
        fontFamily: GAME.CONFIG.FONT, fontSize: (GAME.CONFIG.SMALL ? 13 : 16) + 'px',
        color: '#ffedb8'
      }).setOrigin(0.5, 0).setDepth(3001);
    bnTxt.setScale(1.8).setAlpha(0);
    this.tweens.add({ targets: bnTxt, scale: 1, alpha: 1, duration: 340, ease: 'Back.easeOut' });
    this.tweens.add({ targets: bnSub, alpha: { from: 0, to: 1 }, duration: 300 });
    this.tweens.add({ targets: [bnTxt, bnSub], alpha: 0, delay: 2200, duration: 400,
      onComplete: function () { bnTxt.destroy(); bnSub.destroy(); } });
  }

  //  ── 탄막 보너스 판 (2026-08-23 태현님: "쇠뇌진지가 전장 전체에 쫙 둘러있고
  //  내가 공격할 순 없는데 피하기만 — 시간이 갈수록 많아지고, 버틸 때마다 골드가
  //  바닥에서 계속 나오는 거지") ─────────────────────────────────────────────
  //  포탑은 유닛이 아니라 **씬이 그리는 장식**이고 투사체만 진짜다 — 유닛으로
  //  만들면 조준·전멸 판정·정예 승격까지 전부 예외 처리해야 한다(가시덫 규율).
  //  승패는 combat 의 dodgeMode 분기: 영웅 사망 = 패배 · 45초 버티면 승리.
  if (this.towerBonus === 'dodge') {
    this.state.dodgeMode = true;
    this.state.dodgeUntil = 45000;
    this._dodge = { turrets: [], coins: [], fireMs: 1450, nextTurret: 8000,
                    nextCoin: 1600, nextBomb: 800, shotN: 0,   //  폭격은 15초 게이트(elapsed) 뒤 곧바로 시작
                    gold: 0, hx: 0, hy: 0, hvx: 0, hvy: 0 };
    for (var dti = 0; dti < 6; dti++) this._dodgeAddTurret();
    this._dodgeG = this.add.graphics().setDepth(30);
    if (this.worldLayer) this.worldLayer.add(this._dodgeG);
    var dnW = GAME.CONFIG.WIDTH, dnH = GAME.CONFIG.HEIGHT;
    var dnTxt = this.add.text(dnW / 2, dnH * 0.30, '🏹 보너스! 화살비를 피하라!', {
      fontFamily: GAME.CONFIG.FONT, fontSize: (GAME.CONFIG.SMALL ? 30 : 44) + 'px',
      fontStyle: 'bold', color: '#ffd54a', stroke: '#4d3305',
      strokeThickness: GAME.CONFIG.SMALL ? 5 : 7
    }).setOrigin(0.5).setDepth(3001);
    var dnSub = this.add.text(dnW / 2, dnTxt.y + dnTxt.height * 0.5 + 10,
      '45초 버티면 승리 — 바닥의 금화를 주우면 전부 내 것!', {
        fontFamily: GAME.CONFIG.FONT, fontSize: (GAME.CONFIG.SMALL ? 13 : 16) + 'px',
        color: '#ffedb8'
      }).setOrigin(0.5, 0).setDepth(3001);
    dnTxt.setScale(1.8).setAlpha(0);
    this.tweens.add({ targets: dnTxt, scale: 1, alpha: 1, duration: 340, ease: 'Back.easeOut' });
    this.tweens.add({ targets: dnSub, alpha: { from: 0, to: 1 }, duration: 300 });
    this.tweens.add({ targets: [dnTxt, dnSub], alpha: 0, delay: 2200, duration: 400,
      onComplete: function () { dnTxt.destroy(); dnSub.destroy(); } });
  }

  // 처치 보상 골드 — **영웅까지 units 에 들어간 뒤에** 훅을 건다.
  // 훅을 걸었는데 한 번도 안 불리면 towerrun.js 가 경고를 내고 옛 방식(층 총액)으로 돌아간다.
  // ⚠ `TowerRun.attachKillGold`/`goldGainFor` 는 **순수 계산**이라 `TowerRun.get()` 이
  //   null(도전이라는 개념이 없어졌으므로 항상 null) 이어도 안전하게 동작한다 —
  //   가격표만 빌려 쓰고 실제 지급은 `TowerChar.addGold` 가 한다(아래 승패 블록).
  if (this.tower && GAME.TowerChar && GAME.TowerChar.exists() && GAME.TowerRun) {
    GAME.TowerRun.attachKillGold(this.state, this.tower);
  }
  //  예측 사격 계수(2026-08-23) — 층이 깊을수록 원거리 유닛이 영웅의 진행 방향을
  //  읽는다. 9층부터 시작해 층당 +3%p, 상한 85%. 탑 전용(combat.fire 가 읽는다) —
  //  실시간 대전·수성의 탑에는 이 필드가 없어 예전 그대로다.
  if (this.tower && !this.rt) {
    this.state.towerPredict = Math.min(0.85, Math.max(0, (this.tower - 8) * 0.03));
  }
  // 층 목표 — **유닛이 다 만들어진 지금** 붙인다('우두머리'를 고르려면 적이 있어야 한다).
  // 목표가 없는 층이면 null 이라 전투는 예전처럼 전멸 판정만 쓴다.
  if (this.tower && GAME.TowerObjective) {
    GAME.TowerObjective.attach(this.state, this.tower);
  }
  // 탑 전용 정예 — 조건이 `elite` 훅을 켰으면 적 한 기를 승격한다.
  if (this.tower && GAME.TowerElite && this.towerBonus !== 'break' && this.towerBonus !== 'dodge') {
    //  알깨기 판은 전략가 쪽에 황금알뿐이라 정예 승격이 알을 잡는다 — 잠근다.
    GAME.TowerElite.attach(this.state, this.towerRule);
  }
  // 내가 모는 유닛 — 머리 위 표식과 발밑 링의 대상이고, y 정렬에서도 빼 맨 위에 그린다.
  // (색은 더 이상 빨강이 아니다 — 흰 채움 + 잉크 테두리 2톤이다. `UI.selectArrow` 주석 참조)
  this.arrowOn = this.hero;

  // 학습형 AI: 이 배치도가 지금까지 배운 적응값을 전투에 적용한다
  // 학습값(배치도별로 쌓인 것) + 층 전술(통곡의 탑 전용). 큰 쪽을 쓴다 —
  // 곱하면 고층에서 두 배로 세져 곡선이 통제 불능이 된다(tower.js mergeTactics 참조).
  //  ⚠ 실시간: 학습 적응값은 기기마다 달라 **시뮬을 가른다** — 반드시 빈 값으로 통일.
  this.state.adapt = this.rt ? null : GAME.Tower.mergeTactics(
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
  //  ── 실시간 대전 배선 (P3-2) ─────────────────────────────────────────────
  //  입력은 시뮬에 직접 닿지 않는다 — **그림자 영웅**에 쌓고, 프레임마다 변화를
  //  록스텝 큐로 보낸다. 시뮬 영웅은 양쪽 클라이언트 모두 록스텝 _apply 로만 움직인다.
  //  전략가는 관전(입력 전송 없음) — 그림자에 쓰여도 버려진다.
  if (this.rt && this._heroIsPlayer) {
    var rtSelf = this;
    this._rtShadow = {
      //  side 는 내 영웅의 팀을 따른다 — 손님(위쪽 팀) 컨트롤러면 'strategist' 다.
      //  rtProxy: 방향키·스틱의 **직접 이동**을 좌표 변경이 아니라 이동 명령으로
      //  바꾸라는 표식(input.js·touchpad.js). 그림자 좌표를 고쳐 봤자 시뮬에 안 간다 —
      //  실기기에서 "움직여지지 않는다"(2026-08-22 태현님)의 원인이 이것이었다.
      rtProxy: true, rtHero: this.hero,
      x: this.hero.x, y: this.hero.y, alive: true, isHero: true, side: this.hero.side,
      //  ⚠ rootedFor 가 없으면 skillReady 의 `rootedFor <= 0` 이 undefined 비교로
      //  **항상 false** — 스킬 버튼 전체가 무반응이 된다(2026-08-24 태현님 신고).
      //  시전 정당성은 어차피 시뮬 쪽 castSkill 이 다시 검사한다.
      rootedFor: 0,
      order: null, facing: this.hero.facing,
      def: this.hero.def, hero: this.hero.hero, skills: this.hero.skills,
      skillCd: this.hero.skillCd, cdrMul: this.hero.cdrMul,
      potionCharges: this.hero.potionCharges, buffs: [], auras: [], shield: 0
    };
    this._rtSentOrder = null;
    this.ctrl = new GAME.InputController(this, this.state, this._rtShadow);

    this._rtSession = GAME.Lockstep.create({
      state: this.state,
      mySide: this.rt.meTeam,
      delay: this.rt.delay,
      send: function (msg) {
        if (rtSelf.rt.local) return;               //  연습 대전 — 보낼 상대가 없다
        //  ── 이중 전송 (2026-08-23 실기기 신고: "서버 연결 기다린다는 표시가 계속") ──
        //  P2P 직결(DC)이 모바일 NAT 재바인딩 등으로 **조용히** 죽으면 readyState 는
        //  'open' 인 채 패킷만 사라진다 — 폴백 판정이 ICE 실패 이벤트에만 걸려 있어
        //  상대 입력이 끊긴 채 판이 영구 스톨했다. 그래서 DC 와 WS 에 **같이** 보낸다:
        //  어느 한쪽만 살아 있으면 판이 돈다. 수신은 일련번호(q)·max 병합·digest
        //  재비교가 전부 멱등이라 중복이 무해하다. inputsFinal(초당 30개)만 5틱마다
        //  걸러 WS 로 보낸다(DO 무료 플랜 요청 비용 — 복구 정밀도 165ms 로 충분).
        var pkt = { lk: msg };
        var rc9 = GAME.NetRtc;
        var viaDc = !!(rc9 && rc9.ready && rc9.ready() && rc9.send(pkt));
        //  적응형 (2026-08-23 태현님: "연결 끊겼다는 알람 반복") — 상시 이중화가
        //  DO 무료 플랜의 분당 한도를 건드려 WS 가 잘리고 재접속 알람이 돌았다.
        //  DC 로 1.6초 안에 **받은 게 있으면** 살아 있는 것 — WS 는 침묵한다.
        //  DC 가 조용하면 그때만 WS 로(그리고 inputsFinal 은 4틱마다 — 초당 7.5개).
        var nowMs = (window.performance && performance.now) ? performance.now() : Date.now();
        var dcLive = viaDc && rc9.lastRecvAt && (nowMs - rc9.lastRecvAt < 1600);
        if (!dcLive && (msg.type !== 'inputsFinal' || (msg.upto % 4) === 0)) {
          GAME.NetRoom.send({ t: 'relay', data: pkt });
        }
      },
      //  팀 라벨(controller/strategist)마다 그 팀의 영웅 — 없으면 null(진형만인 팀).
      //  협동은 자리(seat)+영웅 번호(h)로 고른다(_rtHeroOf 주석).
      heroOf: function (side, h) { return rtSelf._rtHeroOf(side, h); },
      onDesync: function (t) {
        rtSelf.state.over = true; rtSelf.state.winner = null;
        rtSelf._rtNote = '동기화가 어긋나 판이 무효가 되었습니다';
      }
    });
    //  협동(S-C) — 내 입력에는 언제나 내 영웅 번호를 싣는다(입력 경로 셋: order·skill·potion).
    //  1:1 판은 이 줄을 안 지나므로 queueLocal 이 예전과 한 비트도 안 다르다.
    if (this.rt.coop) {
      var ql0 = this._rtSession.queueLocal.bind(this._rtSession), myHid = this._rtMyHeroId;
      this._rtSession.queueLocal = function (cmd, h) { return ql0(cmd, h === undefined ? myHid : h); };
    }
    //  order.target 은 유닛 참조라 직렬화 불가 — 인덱스로 보내고 여기서 되살린다.
    var apply0 = this._rtSession._apply.bind(this._rtSession);
    this._rtSession._apply = function (hero, cmd) {
      //  방향 시전(2026-08-31 태현님: "스킬이 바라보는 방향으로 나가지 않는다") —
      //  좌표를 큐 시점에 굳히면 지연 틱 동안 영웅이 움직여 방향이 뒤틀린다.
      //  슬롯만 보내고 **적용 시점의 시뮬 영웅 facing/이동 방향**으로 계산한다
      //  (castSkillFacing 은 상태만 읽는 결정론 — 양쪽 같은 답).
      if (cmd.kind === 'skillF') {
        if (hero) GAME.Combat.castSkillFacing(hero, cmd.slot, rtSelf.state);
        return;
      }
      if (cmd.kind === 'order' && cmd.order && cmd.order.ti !== undefined) {
        var tgt = rtSelf.state.units[cmd.order.ti];
        cmd = { kind: 'order', order: { type: cmd.order.type, x: cmd.order.x, y: cmd.order.y,
                                        target: tgt && tgt.alive ? tgt : null } };
        if (!cmd.order.target && cmd.order.x === undefined) return;   // 대상이 죽었으면 버린다
      }
      apply0(hero, cmd);
    };
    if (this.rt.local && this.rt.coop) {
      //  협동 봇 파트너(S-C) — 같은 팀 영웅 h:1 을 'controller' 자리 큐에 h 를 실어 조종한다.
      this._rtBot = GAME.RtBot.create(this.state, this._rtSession, 'controller', this.rt.botLevel,
                                      { coop: true, heroId: 1 });
    } else if (this.rt.local) {
      //  연습 대전(봇, v3.0) — 네트워크 콜백을 걸지 않는다. 상대 영웅은 봇 두뇌가
      //  록스텝 명령 큐로 조종하고, update 가 매 프레임 상대 확정 틱을 밀어 준다.
      var botTeam = this.rt.meTeam === 'controller' ? 'strategist' : 'controller';
      this._rtBot = GAME.RtBot.create(this.state, this._rtSession, botTeam, this.rt.botLevel);
    } else {
      GAME.NetRoom.on.message = function (from, data) {
        if (data && data.lk) rtSelf._rtSession.onMessage(data.lk);
        //  이모트(렌더 전용) — 록스텝(lk)과는 별개 메시지. 시뮬에 닿지 않는다.
        if (data && data.type === 'emote') rtSelf._onEmote(data.k);
      };
      GAME.NetRoom.on.close = function (info) {
        if (!rtSelf.state.over) {
          rtSelf.state.over = true;
          //  상대가 나가면 남은 쪽(내 팀) 승리. 협동은 파트너가 나가면 판이 안 선다 — 패(보상 없음).
          rtSelf.state.winner = rtSelf.rt.coop ? 'strategist' : rtSelf.rt.meTeam;
          rtSelf._rtNote = rtSelf.rt.coop ? '파트너의 연결이 끊겼습니다' : '상대의 연결이 끊겼습니다';
        }
      };
    }
    //  실시간 상태 배너 — 스톨("상대 대기")·데싱크·관전 표시. 없으면 화면이 왜
    //  멈췄는지 아무도 모른다(코드만 있고 표시가 없던 것을 2026-08-20 보완).
    //  시작 카운트다운 — 두 클라이언트가 거의 동시에 3초를 세고 출발한다.
    //  정확히 같을 필요는 없다: 한쪽이 먼저 출발해도 록스텝이 상대 확정 틱까지만
    //  달리므로(스톨) 시뮬은 어긋나지 않는다. 렌더 전용 지연이다.
    this._rtCountdown = 3000;
    this._rtCdTxt = this.add.text(GAME.CONFIG.WIDTH / 2, GAME.CONFIG.HEIGHT * 0.38, '', {
      fontFamily: (GAME.CONFIG.FONT_DISPLAY || GAME.CONFIG.FONT) + ', ' + GAME.CONFIG.FONT,
      fontSize: (GAME.CONFIG.SMALL ? 64 : 84) + 'px', color: '#ffd24a',
      stroke: '#3a2a10', strokeThickness: 10
    }).setOrigin(0.5).setDepth(9400).setScrollFactor(0);

    this._rtTxt = this.add.text(GAME.CONFIG.WIDTH / 2, 86, '', {
      fontFamily: GAME.CONFIG.FONT, fontSize: (GAME.CONFIG.SMALL ? 13 : 15) + 'px',
      color: '#fff4d8', backgroundColor: 'rgba(24,20,12,0.62)',
      padding: { x: 12, y: 6 }
    }).setOrigin(0.5, 0).setDepth(9300).setScrollFactor(0).setVisible(false);

    //  씬이 내려가면 콜백·참조를 정리한다. 방은 **정상 종료면 유지**한다 —
    //  결과 화면의 [한판 더]가 같은 방에서 재대결한다(2026-08-31 태현님 ①).
    //  데싱크·상대 이탈이면 방이 의미 없으니 나간다.
    this.events.once('shutdown', function () {
      if (!rtSelf.rt.local) {
        GAME.NetRoom.on.message = null;
        GAME.NetRoom.on.close = null;
        if (!rtSelf._rtKeepRoom) GAME.NetRoom.leave(true);
      }
      rtSelf._rtBot = null;
      rtSelf._rtShadow = null;
      rtSelf._rtSession = null;
      if (rtSelf._coopRestore) { rtSelf._coopRestore(); rtSelf._coopRestore = null; }
    });
    //  스킬·물약 — 그림자를 겨눈 호출만 큐로 돌린다(락스텝 _apply 의 진짜 호출은 통과).
    if (!GAME.Combat._rtWrapped) {
      GAME.Combat._rtWrapped = true;
      var cast0 = GAME.Combat.castSkill.bind(GAME.Combat);
      GAME.Combat.castSkill = function (u, slot, tx, ty, state) {
        var sc = GAME.game && GAME.game.scene.getScene('Battle');
        if (sc && sc._rtShadow && u === sc._rtShadow) {
          if (sc._heroIsPlayer && sc._rtSession)
            sc._rtSession.queueLocal({ kind: 'skill', slot: slot, x: tx, y: ty });
          return;
        }
        return cast0(u, slot, tx, ty, state);
      };
      //  방향 시전은 좌표가 아니라 **슬롯만** 보낸다 — 방향은 적용 틱의 시뮬 영웅이
      //  스스로 계산한다(위 _apply 의 skillF). 좌표를 지금 굳히면 록스텝 지연(수 틱)
      //  동안 이동한 만큼 방향이 뒤틀린다 — "바라보는 방향으로 안 나간다"의 원인.
      var castF0 = GAME.Combat.castSkillFacing.bind(GAME.Combat);
      GAME.Combat.castSkillFacing = function (u, slot, state) {
        var sc = GAME.game && GAME.game.scene.getScene('Battle');
        if (sc && sc._rtShadow && u === sc._rtShadow) {
          if (sc._heroIsPlayer && sc._rtSession && GAME.Combat.skillReady(u, slot))
            sc._rtSession.queueLocal({ kind: 'skillF', slot: slot });
          return true;
        }
        return castF0(u, slot, state);
      };
      var pot0 = GAME.Combat.usePotion ? GAME.Combat.usePotion.bind(GAME.Combat) : null;
      if (pot0) GAME.Combat.usePotion = function (u, state) {
        var sc = GAME.game && GAME.game.scene.getScene('Battle');
        if (sc && sc._rtShadow && u === sc._rtShadow) {
          if (sc._heroIsPlayer && sc._rtSession)
            sc._rtSession.queueLocal({ kind: 'potion' });
          return;
        }
        return pot0(u, state);
      };
    }
  } else if (this.rt) {
    //  관전(전략가 시점) — 입력은 없지만 **세션은 있어야** 시뮬이 록스텝으로 돈다.
    var rtSelf2 = this;
    this.ctrl = null;
    this._rtSession = GAME.Lockstep.create({
      state: this.state,
      mySide: this.rt.meTeam,
      delay: this.rt.delay,
      send: function (msg) {
        //  ── 이중 전송 (2026-08-23 실기기 신고: "서버 연결 기다린다는 표시가 계속") ──
        //  P2P 직결(DC)이 모바일 NAT 재바인딩 등으로 **조용히** 죽으면 readyState 는
        //  'open' 인 채 패킷만 사라진다 — 폴백 판정이 ICE 실패 이벤트에만 걸려 있어
        //  상대 입력이 끊긴 채 판이 영구 스톨했다. 그래서 DC 와 WS 에 **같이** 보낸다:
        //  어느 한쪽만 살아 있으면 판이 돈다. 수신은 일련번호(q)·max 병합·digest
        //  재비교가 전부 멱등이라 중복이 무해하다. inputsFinal(초당 30개)만 5틱마다
        //  걸러 WS 로 보낸다(DO 무료 플랜 요청 비용 — 복구 정밀도 165ms 로 충분).
        var pkt = { lk: msg };
        var rc9 = GAME.NetRtc;
        var viaDc = !!(rc9 && rc9.ready && rc9.ready() && rc9.send(pkt));
        //  적응형 (2026-08-23 태현님: "연결 끊겼다는 알람 반복") — 상시 이중화가
        //  DO 무료 플랜의 분당 한도를 건드려 WS 가 잘리고 재접속 알람이 돌았다.
        //  DC 로 1.6초 안에 **받은 게 있으면** 살아 있는 것 — WS 는 침묵한다.
        //  DC 가 조용하면 그때만 WS 로(그리고 inputsFinal 은 4틱마다 — 초당 7.5개).
        var nowMs = (window.performance && performance.now) ? performance.now() : Date.now();
        var dcLive = viaDc && rc9.lastRecvAt && (nowMs - rc9.lastRecvAt < 1600);
        if (!dcLive && (msg.type !== 'inputsFinal' || (msg.upto % 4) === 0)) {
          GAME.NetRoom.send({ t: 'relay', data: pkt });
        }
      },
      heroOf: function (side, h) { return rtSelf2._rtHeroOf(side, h); },
      onDesync: function () {
        rtSelf2.state.over = true; rtSelf2.state.winner = null;
        rtSelf2._rtNote = '동기화가 어긋나 판이 무효가 되었습니다';
      }
    });
    GAME.NetRoom.on.message = function (from, data) {
      if (data && data.lk) rtSelf2._rtSession.onMessage(data.lk);
      //  관전자도 상대 이모트는 본다(보내지만 못한다 — 버튼이 없다).
      if (data && data.type === 'emote') rtSelf2._onEmote(data.k);
    };
    GAME.NetRoom.on.close = function () {
      if (!rtSelf2.state.over) {
        rtSelf2.state.over = true;
        rtSelf2.state.winner = rtSelf2.rt.meTeam;
        rtSelf2._rtNote = '상대의 연결이 끊겼습니다';
      }
    };
    this._rtTxt = this.add.text(GAME.CONFIG.WIDTH / 2, 86, '', {
      fontFamily: GAME.CONFIG.FONT, fontSize: (GAME.CONFIG.SMALL ? 13 : 15) + 'px',
      color: '#fff4d8', backgroundColor: 'rgba(24,20,12,0.62)', padding: { x: 12, y: 6 }
    }).setOrigin(0.5, 0).setDepth(9300).setScrollFactor(0).setVisible(false);
    this._rtCountdown = 3000;
    this._rtCdTxt = this.add.text(GAME.CONFIG.WIDTH / 2, GAME.CONFIG.HEIGHT * 0.38, '', {
      fontFamily: (GAME.CONFIG.FONT_DISPLAY || GAME.CONFIG.FONT) + ', ' + GAME.CONFIG.FONT,
      fontSize: (GAME.CONFIG.SMALL ? 64 : 84) + 'px', color: '#ffd24a',
      stroke: '#3a2a10', strokeThickness: 10
    }).setOrigin(0.5).setDepth(9400).setScrollFactor(0);
    this.events.once('shutdown', function () {
      GAME.NetRoom.on.message = null;
      GAME.NetRoom.on.close = null;
      GAME.NetRoom.leave(true);
      rtSelf2._rtSession = null;
    });
  } else {
    this.ctrl = new GAME.InputController(this, this.state, this.hero);
  }

  //  ── 첫 전투 온보딩 코치 (2026-08-21 태현님 지시 "온보딩 넣어줘") ─────────────
  //  통곡의 탑 첫 판(계정당 1회)에만 3단계: 이동 → 스킬 → 회피.
  //  각 단계는 **실제로 그 행동을 하면** 넘어간다 — 읽는 온보딩은 안 남는다(구슬의 교훈).
  //  렌더 전용: 시뮬·판정에 한 줄도 안 닿는다. 실시간(rt)에는 안 띄운다(상대가 기다린다).
  this._coach = null;
  if (this.tower && !this.rt && GAME.Onboard &&
      GAME.Onboard.seen().indexOf('battle-coach-v1') < 0) {
    this._coach = { step: 0, x0: this.hero.x, y0: this.hero.y, t: 0 };
    this._coachTxt = this.add.text(GAME.CONFIG.WIDTH / 2, GAME.CONFIG.HEIGHT * 0.20, '', {
      fontFamily: GAME.CONFIG.FONT, fontSize: (GAME.CONFIG.SMALL ? 16 : 19) + 'px',
      color: '#fff6df', backgroundColor: 'rgba(30,24,12,0.72)', padding: { x: 14, y: 8 }
    }).setOrigin(0.5, 0).setDepth(9350).setScrollFactor(0);
  }

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
  //  협동(S-C) — 파트너 영웅 체력바(내 것 옆 작게). 자리는 updateHud 가 실측한다.
  if (this.rt && this.rt.coop) this._buildCoopHud();

  // HUD 를 위에 깔았으니 그 **실측 바닥** 아래부터 아레나를 펼친다.
  // 보스 층은 HUD 가 30px 더 높다 — 고정값으로 잡으면 그때만 전장이 HUD 를 파고든다.
  if (padMode0) GAME.Iso.setMode('full', this.hud.bottom + (PHONE ? 4 : 8));

  // HUD 높이는 보스 유무로 달라진다 → **실측 높이**를 첫 행으로 넣어 아래를 밀어낸다.
  // 손으로 y 를 박으면 보스 층에서만 조용히 겹친다.
  //
  // padMode(세로 터치)는 스킬바를 안 만드므로 **높이를 예약하지도 않는다.**
  // 예약해 두는 바람에 힌트가 조작 패드 쪽으로 102px 밀려 있었다.
  var padMode = GAME.isTouch && (P || PHONE);
  //  관전(실시간 전략가)은 조작면이 없어야 한다 — 스킬바가 있으면 "누르는데 왜 안
  //  나가"가 된다(2026-08-22 태현님 ③: 전략가는 지켜보기만).
  var spectator = this.rt && !this._heroIsPlayer;
  if (spectator) padMode = true;
  var rowSpec = [{ name: 'hudBlock', h: this.hud.height, gap: P ? 10 : 12 }];
  if (!padMode) rowSpec.push({ name: 'skills', h: P ? 92 : 96, gap: P ? 10 : 12 });
  rowSpec.push({ name: 'hint', h: P ? 34 : 20, gap: 0 });
  var rows = L.rows(rowSpec);

  // 스킬 바 4~5칸(QWER + 물약).
  // **세로 터치에서는 만들지 않는다** — 오른쪽 원형 패드가 같은 역할을 하고,
  // 둘 다 두면 좁은 세로 화면에서 전장이 그만큼 줄어든다(중복 조작면).
  // ⚠ 통곡의 탑은 물약 슬롯이 없다(js/towershopitems.js 카탈로그에 물약 자체가 없다).
  //   5칸 그대로 두고 물약 칸만 안 그리면 빈 칸이 남아 "지웠는데 왜 자리가 남지"로 보인다
  //   (사용자 신고: "물약은 삭제됐는데 왜 아직도 보이는거지"). QWER 4칸으로 폭을 다시 나눈다.
  var noPotion = this.tower || this.versus;
  var cols = L.cols(noPotion ? 4 : 5, { gap: P ? 6 : 10, max: 104 });
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

  if (!padMode && !noPotion) {
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
  // ⚠ 실시간은 _rtCompose 가 위에서 이미 정했다(전략가 시점=false) — 덮으면 안 된다.
  if (!this.rt) this._heroIsPlayer = true;
  //  타격 파티클 — `worldLayer` 가 만들어진 뒤라야 거기 담을 수 있다(전장과 같이 움직인다).
  if (GAME.HitFX) GAME.HitFX.init(this);

  //  ── 피해 숫자 그라디언트 (2026-08-04 아트 개편 · 1순위) ────────────────────
  //  전투 화면에서 **가장 자주, 가장 크게 움직이는 것이 숫자다**(초당 수십 개).
  //  그것이 18~34px 단색 텍스트라는 사실 하나가 "조잡함"의 최대 단일 지분이었다.
  //  레퍼런스(액션 RPG)가 이기고 있는 지점을 정확히 같은 수단으로 따라잡는다:
  //  세로 그라디언트 + 굵은 외곽선 + 등장 팝 + 크기 변주.
  //
  //  ⚠ 색은 **자기가 광원인 것**의 색이다(불·백열·노른자). 이 세계에 네온은 없다.
  //  ⚠ 그라디언트는 Text **자기 캔버스 컨텍스트**에서 만들어야 한다. 그리고
  //    `setFill` 은 캔버스를 다시 굽는 비싼 호출이라, 아래 `drawNumbers` 에서
  //    **키(종류:크기)가 바뀔 때만** 부른다(기존 setFontSize/setColor 캐시와 같은 규율).

  //  ── COMBO 표시 (2026-08-04) ─────────────────────────────────────────────
  //  레퍼런스 ③④가 연타의 쾌감을 만드는 장치다. 두 겹(숫자 + 'COMBO')으로 두는 이유:
  //  숫자만 크게 키우면 피해 숫자와 헷갈린다.
  //  ⚠ 자리를 **왼쪽 중단**으로 잡는다. 처음엔 오른쪽 위에 뒀는데 거기는 골드 표시가
  //    이미 쓰고 있어 숫자 둘이 겹쳤다(실측 스크린샷). 오른쪽은 위부터 '남은 적 →
  //    골드 → 스킬 버튼'으로 꽉 차 있고, 왼쪽은 체력 패널 아래가 비어 있다.
  //  ⚠ 겹침 감사(tools/overlap-audit.js)는 이걸 **못 잡는다** — 콤보는 3연타 이상일
  //    때만 뜨는데 감사는 전투를 진행시키지 않는다. 스크린샷으로만 확인 가능하다.
  //  ⚠ `setScrollFactor(0)` — 전장이 확대돼도 따라 움직이면 안 된다(HUD 다).
  var SM = GAME.CONFIG.SMALL;
  var cbX = 26, cbY = GAME.CONFIG.HEIGHT * (P ? 0.30 : 0.34);
  this.comboNum = this.add.text(cbX, cbY, '', {
    fontFamily: (GAME.CONFIG.FONT_DISPLAY || GAME.CONFIG.FONT) + ', ' + GAME.CONFIG.FONT,
    fontSize: (SM ? 40 : 46) + 'px', color: '#ffd24a',
    stroke: '#3a2a10', strokeThickness: 7
  }).setOrigin(0, 0.5).setDepth(9200).setScrollFactor(0).setVisible(false);
  this.comboNum.setShadow(0, 4, 'rgba(40,26,10,0.5)', 4, false, true);
  this.comboLbl = this.add.text(cbX + 3, cbY + (SM ? 22 : 26), 'COMBO', {
    fontFamily: GAME.CONFIG.FONT, fontSize: (SM ? 13 : 15) + 'px',
    color: '#ffe9a8', stroke: '#3a2a10', strokeThickness: 4
  }).setOrigin(0, 0.5).setDepth(9200).setScrollFactor(0).setVisible(false);

  //  ── 저체력 경고 비네트 (2026-08-20 비주얼 승급) ──────────────────────────
  //  실기기 영상에서 체력 860→123 으로 녹는 동안 화면 경고가 전혀 없었다 —
  //  체력바는 좌상단 구석이라 난전 중엔 아무도 못 본다. 25% 미만(저체력 경고음과
  //  같은 문턱)이면 화면 가장자리가 붉게 고동친다. 렌더 전용.
  this._lowHpG = this.add.graphics().setDepth(9100).setScrollFactor(0).setAlpha(0);
  (function (g, W2, H2) {
    var th = Math.max(10, Math.min(22, H2 * 0.03));
    for (var e = 0; e < 4; e++) {
      g.fillStyle(0xd83a2e, 0.30 - e * 0.062);
      var o = th * e;
      g.fillRect(o, o, W2 - o * 2, th);
      g.fillRect(o, H2 - o - th, W2 - o * 2, th);
      g.fillRect(o, o + th, th, H2 - (o + th) * 2);
      g.fillRect(W2 - o - th, o + th, th, H2 - (o + th) * 2);
    }
  })(this._lowHpG, GAME.CONFIG.WIDTH, GAME.CONFIG.HEIGHT);

  this.numPool = [];
  for (var n = 0; n < 26; n++) {
    var numTxt = this.add.text(0, 0, '', {
      fontFamily: GAME.CONFIG.FONT, fontSize: '18px', color: this.numFill,
      stroke: this.numStroke, strokeThickness: 4
    }).setOrigin(0.5).setVisible(false);
    //  드롭섀도 — 캔버스 기본 기능이라 preFX(셰이더)보다 훨씬 싸다. 숫자 26개에
    //  셰이더를 걸면 그게 곧 프레임이다. 배경이 밝든 어둡든 숫자가 뜬다.
    numTxt.setShadow(0, 3, 'rgba(40,26,10,0.45)', 3, false, true);
    // ⚠ **떠서 흘러가는 글자**라고 표시해 둔다. 겹침 감사(tools/overlap-audit.js)는
    //   좌표를 손으로 박아 생기는 '고정 라벨 겹침'을 잡으려고 만든 도구인데,
    //   피해 숫자는 일부러 무작위로 흩어 놓고 0.75초 만에 사라지는 연출이라
    //   순간적으로 스치는 것을 결함으로 셀 이유가 없다. 안 걸러 두면 전투 화면이
    //   찍는 순간마다 4~16건씩 흔들려서, 그 소음이 **진짜 겹침을 가린다.**
    numTxt.__floating = true;
    // 피해 숫자는 전장의 일부다 — 확대하면 전장과 같이 움직여야 한다.
    // (drawNumbers 는 그대로 둔다. 레이어가 좌표를 대신 변환한다)
    if (this.worldLayer) this.worldLayer.add(numTxt);
    this.numPool.push(numTxt);
  }

  // 모바일 조작 패드(왼쪽 스틱 + 오른쪽 원형 버튼) — 세로와 **폰 가로** 둘 다.
  // 데스크톱 가로에서는 마우스+키보드가 더 정확하므로 띄우지 않는다.
  if (GAME.isTouch && (P || PHONE) && this.ctrl && !(this.rt && !this._heroIsPlayer)) {
    this.pad = new GAME.TouchPad(this, this.ctrl);
    this.ctrl.pad = this.pad;
  }

  //  ── 실시간 이모트 버튼 (2026-09-02 C 갈래) — RT 판, 내 영웅이 있을 때만 ──────
  //  관전(전략가)은 버튼이 없다(받기만 한다). 봇 판(rt.local)은 릴레이 없이 내 것만.
  //  자리: 터치 프로필은 touchpad.emoteAnchor(조작부와 안 겹치는 곳), PC 는 스킬 바
  //  오른쪽 빈자리(스킬 열이 가운데 560px 만 쓴다).
  if (this.rt && this._heroIsPlayer && GAME.UI.emoteBar) {
    var eaSelf = this;
    var ea;
    if (GAME.isTouch && (P || PHONE) && GAME.TouchPad.emoteAnchor) {
      ea = GAME.TouchPad.emoteAnchor(this.hud.bottom);
    } else {
      var lastCol = cols[cols.length - 1];
      var eaR = 17, eaSpan = (eaR * 2 + 10) * 3;
      ea = { x: lastCol.cx + lastCol.w / 2 + 40 + eaSpan / 2,
             y: rows.skills ? rows.skills.cy : (GAME.CONFIG.HEIGHT - 40), r: eaR, gap: 10, dir: 'row' };
    }
    ea.onPick = function (k) { eaSelf._sendEmote(k); };
    this._emoteBar = GAME.UI.emoteBar(this, ea);
  }

  // ── 동전 밭 ──────────────────────────────────────────────────────────────
  // `state.killGoldEvents` 가 있을 때만(= 통곡의 탑 도전 중) 만든다. 일반 대전에는
  // 처치 골드 자체가 없으므로 동전도 없어야 한다 — 없는 보상을 뿌리면 거짓말이 된다.
  if (this.state.killGoldEvents && GAME.Coins) {
    this._coins = GAME.Coins.create(this, this.state);
    this._goldBase = (GAME.TowerChar && GAME.TowerChar.get() || {}).gold || 0;
    this._buildGoldHud();
  }

  // 휠 줌은 **모든 배치가 끝난 뒤** 붙인다 — 아레나 사각형(Iso.setMode 반영본)이 필요하다.
  this._setupZoom();

  //  보스 층 인트로 — 줌 준비(_zoomRect)가 끝난 뒤에만 성립한다.
  this._setupBossIntro();

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
    //  구운 배경도 씬을 떠날 때 버린다. 안 버리면 다음 전투가 **이전 층의 바닥**을
    //  깔고 시작한다(층마다 바이옴이 다르다).
    if (self._arenaRT) { self._arenaRT.destroy(); self._arenaRT = null; }
    self._arenaBaked = false;
    self._arenaFallback = false;
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
//     → 그 빈 띠 안에 그대로 둔다. 여기는 전장을 안 가린다.
//   · 폰 가로(820×390)·세로 터치 — HUD 가 **화면 맨 위**를 띠로 덮고 전장은 그
//     **바로 아래**에서 시작한다.
//  두 경우를 한 식으로 쓰면 반드시 한쪽이 겹친다(이 저장소가 반복해서 겪은 사고다).
//
//  ── 2026-08-04 · 전장을 가리던 배지를 띠 안으로 올렸다 ──────────────────────
//  사용자: "전장위에 떠있는 골드와 버튼이 전장을 가려서 불편해 / 골드는 남은적 옆,
//  상단으로 올려주고". 예전 값은 `hud.bottom + 3` — **전장이 시작되는 바로 그 줄**이라
//  배지가 전장 오른쪽 위를 통째로 덮고 있었다. 이제 HUD 가 돌려주는 자리
//  (`hud.goldSlot()` = '남은 적' 글자 왼쪽)에 붙인다.
//  ⚠ 그 자리는 **글자 폭에 따라 움직인다**(적이 줄면 '남은 적 3기'로 짧아진다).
//    그래서 배지는 매 프레임 자리를 다시 읽고, 실제로 달라졌을 때만 다시 그린다.
GAME.BattleScene.prototype._buildGoldHud = function () {
  var SM = GAME.CONFIG.SMALL;
  this._goldH = SM ? 28 : 32;
  this._goldG = this.add.graphics().setDepth(8000);
  if (this._goldG.setScrollFactor) this._goldG.setScrollFactor(0);
  this._goldTxt = GAME.UI.text(this, 0, 0, '0', {
    size: SM ? 'subhead' : 'num', color: GAME.UI.TXT.crit,
    origin: 1, originY: 0.5, outline: true, lineSpacing: 0
  }).setDepth(8001);
  this._goldShown = this._goldBase;
  this._goldTxt.setText(String(this._goldBase));
  this._drawGoldBadge();
};

// 배지의 **오른쪽 끝**을 어디에 둘지. 폰/세로 터치는 HUD 띠 안('남은 적' 왼쪽),
// 그 밖에는 예전처럼 아레나 위 빈 띠.
GAME.BattleScene.prototype._goldAnchor = function () {
  var W = GAME.CONFIG.WIDTH, SM = GAME.CONFIG.SMALL, h = this._goldH;
  var topHud = GAME.isTouch && (GAME.CONFIG.PORTRAIT || GAME.CONFIG.PHONE);
  if (topHud && this.hud && this.hud.goldSlot) {
    var s = this.hud.goldSlot();
    // 글자가 아직 비어 있으면(첫 프레임) 자리가 화면 오른쪽 끝에 붙는다 — 그래도
    // 띠 **안**이라 전장을 안 가린다. 다음 프레임에 제자리를 찾는다.
    if (s) return { right: s.right, y: Math.round(s.cy - h / 2) };
  }
  return {
    right: W - (SM ? 12 : 24),
    y: Math.max(4, Math.round((GAME.Iso.screenRect().y - h) / 2))
  };
};

// 배지 판은 **글자 폭이나 자리가 바뀔 때만** 다시 그린다(매 프레임 clear+fill 은 낭비다)
GAME.BattleScene.prototype._drawGoldBadge = function () {
  var g = this._goldG;
  if (!g || !g.scene) return;
  var a = this._goldAnchor();
  this._goldRight = a.right;
  this._goldY = a.y;
  this._goldTxt.setPosition(a.right - 10, a.y + this._goldH / 2);
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
  //  관전(실시간 전략가) — 조작 안내 대신 관전 안내 한 줄.
  if (this.rt && !this._heroIsPlayer) return '👁 관전 중 — 내 진형이 상대 영웅을 막고 있습니다';
  // 세로 터치에서는 상시 안내를 두지 않는다. 버튼에 '공격/Q/W/E/R/물약' 이 이미 적혀 있고,
  // 보스 층은 HUD 가 158px 로 커져서 이 문구가 스킬 버튼 위로 내려앉는다.
  // (조준 대기 같은 **일시적 안내**는 계속 이 라벨을 쓴다)
  if (GAME.isTouch && (GAME.CONFIG.PORTRAIT || GAME.CONFIG.PHONE)) return '';
  // 통곡의 탑은 물약이 없다 — 'F 물약' 을 그대로 두면 없는 조작을 안내하게 된다.
  if (GAME.isTouch) return '한 번 탭: 이동하며 교전   ·   두 번 탭: 이동만   ·   스킬 버튼: 바라보는 방향 시전';
  return '우클릭 이동 / 적 클릭 공격   ·   방향키 직접 이동   ·   Q W E R 바라보는 방향 시전' +
    ((this.tower || this.versus) ? '' : '   ·   F 물약');
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
  if (!this.worldLayer) return;
  var self = this;
  var R = GAME.Iso.screenRect();
  this._zoomRect = { x: R.x, y: R.y, w: R.w, h: R.h };

  // 확대하면 전장 그림이 아레나 밖(HUD 자리)으로 삐져나온다 → 아레나 사각형으로 잘라낸다.
  var mg = this.make.graphics({ x: 0, y: 0, add: false });
  mg.fillStyle(0xffffff, 1);
  mg.fillRect(R.x, R.y, R.w, R.h);
  this._zoomMaskG = mg;
  this._zoomMask = mg.createGeometryMask();

  //  휠 줌 입력은 PC 전용 — 레이어·마스크는 인트로 줌 때문에 전 프로필에 만든다.
  if (!this._zoomOn) return;
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

//  ── 보스 인트로 (2026-08-23 4차 — 태현님: "보스만의 대사와 소리 재생하고
//  확대했다가 다시 전장 풀화면으로, 긴장감 조성") ─────────────────────────────
//  보스 층 진입 순간: 시뮬 정지(update 의 _introHold 게이트) + 시네마 바 +
//  보스 이름·대사 + 포효 + 보스 확대 → 풀화면 복귀. 총 2.6초. 타이머도 같이
//  멈추므로 손해 보는 시간이 아니다. ⚠ 실시간(rt)은 제외 — 시뮬을 멈추면
//  상대를 스톨로 끌고 간다(히트스톱과 같은 이유).
GAME.BattleScene.prototype._setupBossIntro = function () {
  this._introHold = 0;                 //  씬 인스턴스 재사용 대비 — 반드시 되돌린다
  if (!this.tower || this.rt || !this._zoomRect) return;
  var boss = null;
  for (var i = 0; i < this.state.units.length; i++) {
    var u = this.state.units[i];
    if (u.alive && u.def && u.def.isBoss) { boss = u; break; }
  }
  if (!boss) return;
  var self = this;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT, P = GAME.CONFIG.SMALL;
  var HOLD = 2600;
  this._introHold = HOLD;

  if (GAME.Sound) GAME.Sound.play('bossRoar');
  //  보스 등장 스팅어(시즌2 S-S) — 포효(짐승의 소리) 위에 북과 뿔이 그 존재를 알린다. 2.6초 = HOLD.
  if (GAME.Music && GAME.Music.sting) { try { GAME.Music.sting('bossAppear'); } catch (e) {} }

  //  줌 — 보스의 화면 좌표를 닻으로 확대했다가 돌아온다. worldLayer 밖(HUD·바·
  //  글자)은 구조적으로 같이 커질 수 없다(휠 줌과 같은 경로).
  //  닻은 "확대가 끝났을 때 보스 접지점이 화면 62% 높이·가운데에 오는 점"을
  //  역산한다: setZoom 은 닻 아래 화면 자리를 고정하므로 o = a(1-z), 원하는
  //  o = T - z·bp 에서 a = (z·bp - T) / (z - 1).
  var bp = GAME.Iso.toScreen(boss.x, boss.y);
  var Z1 = 1.55;
  var tx = W / 2, ty = H * 0.62;
  var zx = (Z1 * bp.x - tx) / (Z1 - 1);
  var zy = (Z1 * bp.y - ty) / (Z1 - 1);
  var prox = { z: 1 };
  this._introNoMask = true;
  this.tweens.add({ targets: prox, z: 1.55, duration: 600, ease: 'Cubic.easeOut',
    onUpdate: function () { if (self.worldLayer && self.worldLayer.scene) self.setZoom(prox.z, zx, zy); } });
  this.time.delayedCall(HOLD - 700, function () {
    self.tweens.add({ targets: prox, z: 1, duration: 640, ease: 'Cubic.easeInOut',
      onUpdate: function () { if (self.worldLayer && self.worldLayer.scene) self.setZoom(prox.z, zx, zy); },
      onComplete: function () {
        self._introNoMask = false;
        if (self.worldLayer && self.worldLayer.scene) self.resetZoom();
      } });
  });

  //  시네마 바(위·아래 검은 띠) + 보스 이름·대사.
  var objs = [];
  var barH = Math.round(H * 0.11);
  var top = this.add.rectangle(W / 2, -barH / 2, W, barH, 0x07060a, 0.92).setDepth(4000);
  var bot = this.add.rectangle(W / 2, H + barH / 2, W, barH, 0x07060a, 0.92).setDepth(4000);
  this.tweens.add({ targets: top, y: barH / 2, duration: 420, ease: 'Cubic.easeOut' });
  this.tweens.add({ targets: bot, y: H - barH / 2, duration: 420, ease: 'Cubic.easeOut' });
  objs.push(top, bot);
  var line = (GAME.BossBank && GAME.BossBank.LINES && GAME.BossBank.LINES[boss.def.key]) ||
             boss.def.desc || '';
  var nm = this.add.text(W / 2, barH / 2, '— ' + boss.def.name + ' —', {
    fontFamily: GAME.CONFIG.FONT, fontSize: (P ? 22 : 30) + 'px', fontStyle: 'bold',
    color: '#ffd9a0', stroke: '#1a0f06', strokeThickness: 5
  }).setOrigin(0.5).setDepth(4001).setAlpha(0);
  var ln = this.add.text(W / 2, H - barH / 2, '“' + line + '”', {
    fontFamily: GAME.CONFIG.FONT, fontSize: (P ? 14 : 18) + 'px',
    color: '#e8dcc8', stroke: '#1a0f06', strokeThickness: 4,
    wordWrap: { width: W - 60 }, align: 'center'
  }).setOrigin(0.5).setDepth(4001).setAlpha(0);
  this.tweens.add({ targets: [nm, ln], alpha: 1, delay: 240, duration: 380 });
  //  전투 연출 글자 — 겹침 감사 제외 표식(피해 숫자와 같은 규칙)
  nm.__floating = true; ln.__floating = true;
  objs.push(nm, ln);

  this.time.delayedCall(HOLD - 260, function () {
    objs.forEach(function (o) {
      if (o && o.scene) self.tweens.add({ targets: o, alpha: 0, duration: 240,
        onComplete: function () { if (o && o.scene) o.destroy(); } });
    });
  });
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
  //  ⚠ 보스 인트로는 예외 — 보스가 진형 맨 위라 화면 가운데로 데려오려면 아레나
  //    위 빈 공간이 보여야 한다(시네마 바가 그 자리를 덮는다). 인트로가 끝나면
  //    z 가 1 로 돌아와 오프셋도 0 이므로 클램프 부재가 남지 않는다.
  if (!this._introNoMask) {
    ox = Math.min(R.x * (1 - z), Math.max((R.x + R.w) * (1 - z), ox));
    oy = Math.min(R.y * (1 - z), Math.max((R.y + R.h) * (1 - z), oy));
  }

  this._zoom = z;
  o.x = ox; o.y = oy;
  this.worldLayer.setScale(z);
  this.worldLayer.setPosition(ox, oy);

  // 마스크는 확대 중에만 건다 — 1.0 에서는 예전과 완전히 같은 렌더 경로여야 한다
  // (전투 종료 검은 막이 화면 전체를 덮는 것도 이 덕분에 그대로다).
  //  ⚠ 보스 인트로 중에는 안 건다 — 보스는 진형 맨 위라 아레나 사각형으로 자르면
  //    상반신이 잘린다(실측). 넘친 가장자리는 시네마 바가 가린다.
  if (z > 1.0001 && !this._introNoMask) {
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
// ── 구슬 (2026-07-31, 사용자 지시) ────────────────────────────────────────────
//  적을 잡으면 확률로 떨어지고(combat.js), 지나가면 줍는다. 동전과 **같은 문법**이라
//  플레이어가 새로 배울 것이 없다. 주우면 능력이 그 자리에서 붙고 한 줄이 뜬다.
//  ⚠ 줍기 판정은 **월드 좌표**에서만 한다 — 줌·투영과 무관해야 한다(동전과 같은 규율).
GAME.BattleScene.prototype._updateOrbs = function (dt) {
  var st = this.state;
  if (!st || !st.orbs || !st.orbs.length || !GAME.Orb) return;
  //  ── 실시간(rt) — 줍기는 **시뮬이** 한다(combat update, 양쪽 동일 판정).
  //  여기서는 taken 전환만 감지해 토스트를 띄우고 목록에서 걷는다.
  if (this.rt) {
    var RT = GAME.Combat.RT_ORBS || {};
    for (var ri = st.orbs.length - 1; ri >= 0; ri--) {
      var ro = st.orbs[ri];
      ro.t += dt;
      if (!ro.taken) continue;
      st.orbs.splice(ri, 1);
      var fx = RT[ro.key];
      if (fx && this.rt.meTeam === ro.owner) {
        this._orbToast(fx.name + ' — ' + fx.desc + '!');
      }
    }
    return;
  }
  var h = this.hero;
  if (!h || !h.alive) return;
  var pickR = (h.def ? h.def.radius : 17) + 34;
  for (var i = st.orbs.length - 1; i >= 0; i--) {
    var o = st.orbs[i];
    o.t += dt;
    // 떨어진 직후 짧게는 못 줍는다 — 튀어나오는 것이 눈에 보여야 '떨어졌다'가 읽힌다.
    if (o.t < 220) continue;
    var dx = h.x - o.x, dy = h.y - o.y;
    if (dx * dx + dy * dy > pickR * pickR) continue;
    st.orbs.splice(i, 1);
    if (GAME.Orb.take(st, o.key)) this._orbToast(GAME.Orb.lineFor(o.key));
  }
};

// ── 영웅 발견 연출 (2026-08-22 태현님 지시) ─────────────────────────────────
//  combat 은 판정만 남긴다(state.spots) — 여기서 소비해 ① 빨간 느낌표(발견한 유닛
//  전부) ② 말풍선(GAME.Banter 가 쿨다운·확률로 거른 한 줄, 닉네임 언급)을 띄운다.
//  ⚠ worldLayer 에 담는다 — PC 줌·폰 확대에서 전장과 같이 움직여야 한다(피해 숫자 규율).
GAME.BattleScene.prototype._updateSpots = function () {
  var st = this.state;
  if (!st || !st.banterEv || !st.banterEv.length) return;
  for (var i = 0; i < st.banterEv.length; i++) {
    this._spawnSpotFx(st.banterEv[i].u, st.banterEv[i].ev);
  }
  st.banterEv.length = 0;
};

GAME.BattleScene.prototype._spawnSpotFx = function (u, ev) {
  //  죽는 유닛의 유언(ev 'death')은 alive 검사를 건너뛴다 — 죽어서 말하는 대사다.
  if (!u || (!u.alive && ev !== 'death')) return;
  var Iso = GAME.Iso, C = GAME.CONFIG;
  var sx = u.x, sy = Iso.toScreenY(u.y);
  var self = this;

  // ① 빨간 느낌표 — **발견(첫 공격 개시)에만** 뜬다(태님 2차: 감지→공격 시작 시).
  if (ev === 'spot') {
  var ex = this.add.text(sx, sy - (C.PHONE ? 34 : 46), '!', {
    fontFamily: C.FONT, fontSize: (C.PHONE ? 22 : 30) + 'px', fontStyle: 'bold',
    color: '#ff3030', stroke: '#4a0808', strokeThickness: 4
  }).setOrigin(0.5, 1);
  ex.__floating = true;   // 0.8초짜리 연출 — 겹침 감사 제외(피해 숫자와 같은 규칙)
  if (this.worldLayer) this.worldLayer.add(ex);
  ex.setScale(0.2);
  this.tweens.add({ targets: ex, scale: 1.15, duration: 140, ease: 'Back.easeOut' });
  this.tweens.add({ targets: ex, y: ex.y - 10, alpha: 0, delay: 420, duration: 360,
                    onComplete: function () { ex.destroy(); } });
  }

  // ② 말풍선 — 한 번에 하나만, Banter 가 상황(이벤트·층·보스·체력·유닛)을 보고 고른다.
  if (!GAME.Banter || (this._bubble && this._bubble.scene)) return;
  var base = (GAME.UnitLevel && GAME.UnitLevel.baseKeyOf)
             ? GAME.UnitLevel.baseKeyOf(u.def.key || '') : (u.def.key || '');
  var line = GAME.Banter.pick({
    ev: ev,
    nick: (GAME.Account && GAME.Account.current && GAME.Account.current()) || '',
    unitKey: base,
    floor: this.tower || 0,
    boss: !!(this.tower && GAME.Tower && GAME.Tower.isBossFloor &&
             GAME.Tower.isBossFloor(this.tower)),
    heroKey: this.heroKey,
    heroHpFrac: (this.hero && this.hero.maxHp) ? this.hero.hp / this.hero.maxHp : undefined,
    selfHpFrac: u.maxHp ? u.hp / u.maxHp : undefined
  });
  if (!line) return;
  var bub = this.add.text(sx, sy - (C.PHONE ? 42 : 56), line, {
    fontFamily: C.FONT, fontSize: (C.PHONE ? 12 : 14) + 'px',
    color: '#fff6df', backgroundColor: 'rgba(24,18,10,0.86)',
    padding: { x: 8, y: 5 }, align: 'center',
    wordWrap: { width: C.PHONE ? 190 : 240 }
  }).setOrigin(0.5, 1);
  bub.__floating = true;  // 2.5초짜리 연출 — 겹침 감사 제외
  //  전장 밖으로 나가지 않게 가로만 가둔다 — 위쪽 유닛의 긴 대사가 잘리는 것을 막는다.
  var hw = bub.width / 2;
  bub.x = Math.max(hw + 6, Math.min(C.WIDTH - hw - 6, bub.x));
  if (bub.y - bub.height < 4) bub.y = 4 + bub.height;
  if (this.worldLayer) this.worldLayer.add(bub);
  this._bubble = bub;
  bub.setAlpha(0);
  this.tweens.add({ targets: bub, alpha: 1, duration: 160 });
  this.tweens.add({ targets: bub, y: bub.y - 8, delay: 300, duration: 1900 });
  this.tweens.add({ targets: bub, alpha: 0, delay: 2200, duration: 380,
                    onComplete: function () { bub.destroy(); if (self._bubble === bub) self._bubble = null; } });
};

//  주웠을 때 뜨는 한 줄. 사용자 예시 형식 그대로:
//    "회피의 구슬 — 이동 중 받는 피해 18% 감소!"
//  ⚠ **전장 안쪽 아래**에 띄운다(2026-07-31 사용자 지시: "필드 바깥에서 뜨니까 글자를
//    읽기 힘들어"). 예전엔 HUD 바닥 바로 아래였는데 그 자리는 전장 **밖**의 배경색
//    구간이라 글자가 배경에 묻혔다. 전장 안이면 목초지 위라 잉크 테두리가 살아난다.
//    가운데가 아니라 아래쪽인 이유는 그대로다 — 가운데면 회피해야 할 투사체를 가린다.
//  ── 궁극기 연출 (2026-08-03 사용자 지시) ────────────────────────────────────
//  "궁극기는 정말 화려했으면 좋겠고 … 텍스트 이쁘게 꾸민 것도 위에 강조하면서
//   애니메이션으로 지나가고 진동 울리면서"
//
//  궁극기는 30초에 한 번뿐이다 — **그 한 번이 사건처럼 보여야** 30초를 기다린 값을 한다.
//  ⚠ 그래서 이건 `_orbToast`(작은 안내)와 **다른 물건**이다. 토스트는 정보를 전하고,
//    이건 순간을 기념한다. 같은 자리에 겹치지 않게 위쪽 띠를 쓴다.
//  ⚠ 이 게임은 논타겟 회피 게임이다 — 연출이 **전장을 가리면 안 된다.**
//    그래서 배너는 화면 최상단 띠에만 살고, 아래 전장은 한 픽셀도 안 덮는다.
GAME.BattleScene.prototype._ultBanner = function (name) {
  if (!name) return;
  var W = GAME.CONFIG.WIDTH, C = GAME.CONFIG.COLORS, UI = GAME.UI;
  var SM = GAME.CONFIG.SMALL;
  var y = SM ? 26 : 34;

  //  이전 것이 남아 있으면 지운다 — 겹치면 읽히지 않는다.
  if (this._ultObjs) { this._ultObjs.forEach(function (o) { try { o.destroy(); } catch (e) {} }); }
  this._ultObjs = [];
  var self = this;
  function keep(o) { self._ultObjs.push(o); return o; }

  //  ── 뼈 명패 (2026-08-03 사용자 지시: "세계관에 맞는 글자 디자인") ─────────
  //  앞선 두 판은 **글자 문제**로 접근했다 — 색을 바꾸고(v1.36 검은 띠),
  //  폰트를 바꾸고(v1.37 검은고딕), 판을 밝게 했다(v1.38 리본). 전부 UI 였지
  //  **이 세계의 물건이 아니었다.** 여기는 원시 부족 전쟁이다 — 종이도 잉크도
  //  네온도 없다. 있는 것은 뼈·나무·돌·밧줄·청동뿐이다(js/eggart.js 의 MAT).
  //  그래서 배너를 "화면 위젯"이 아니라 **뼈를 깎아 밧줄로 묶어 내건 명패**로 만든다.
  //
  //  ⚠ 색은 전부 MAT 토큰이다. 하드코딩하면 테마를 바꿀 때 여기만 안 따라온다.
  //  ⚠ 전장은 여전히 한 픽셀도 안 가린다 — 명패는 최상단 띠 안에서만 산다.
  var M = UI.MAT;
  var g = keep(this.add.graphics().setDepth(9500).setScrollFactor(0));
  var h = SM ? 42 : 56;
  var midW = Math.min(W * 0.66, SM ? 460 : 720), x0 = (W - midW) / 2;
  var top = y - h / 2, bot = y + h / 2;

  //  ① 매달린 밧줄 두 가닥 — 명패가 "걸려 있다"는 것을 먼저 읽힌다.
  g.lineStyle(3, M.rope, 0.9);
  g.lineBetween(x0 + midW * 0.22, 0, x0 + midW * 0.26, top + 2);
  g.lineBetween(x0 + midW * 0.78, 0, x0 + midW * 0.74, top + 2);

  //  ② 뼈판 — 위아래가 **손으로 깎은 듯 불규칙**하다. 직선이면 종이가 된다.
  //     양끝은 뼈 마디처럼 둥글게 부풀린다.
  var pts = [];
  var STEP = 8;
  for (var px = 0; px <= midW; px += STEP) {
    var t = px / midW;
    //  가장자리로 갈수록 살짝 좁아지고, 결 때문에 미세하게 물결친다.
    var taper = 1 - Math.pow(Math.abs(t - 0.5) * 2, 3) * 0.18;
    var wob = Math.sin(px * 0.11 + 1.3) * 1.6;
    pts.push({ x: x0 + px, y: top + (h * (1 - taper)) / 2 + wob });
  }
  for (var qx = midW; qx >= 0; qx -= STEP) {
    var t2 = qx / midW;
    var taper2 = 1 - Math.pow(Math.abs(t2 - 0.5) * 2, 3) * 0.18;
    var wob2 = Math.sin(qx * 0.13 + 4.1) * 1.6;
    pts.push({ x: x0 + qx, y: bot - (h * (1 - taper2)) / 2 + wob2 });
  }
  //  그늘 → 뼈 → 위쪽 광
  g.fillStyle(M.shellRim, 1);
  g.fillPoints(pts.map(function (p) { return { x: p.x, y: p.y + 3 }; }), true);
  g.fillStyle(M.bone, 1);
  g.fillPoints(pts, true);
  g.fillStyle(M.shell, 0.55);
  g.fillPoints(pts.filter(function (p) { return p.y < y; })
                  .map(function (p) { return { x: p.x, y: p.y + 4 }; }), true);

  //  ③ 뼈 마디 — 양끝을 둥근 혹 두 개로 마감한다(뼈처럼 보이게 하는 핵심).
  [x0, x0 + midW].forEach(function (ex) {
    var d = (ex === x0) ? -1 : 1;
    g.fillStyle(M.shellRim, 1);
    g.fillEllipse(ex + d * h * 0.16, y - h * 0.22, h * 0.52, h * 0.50, 10);
    g.fillEllipse(ex + d * h * 0.16, y + h * 0.22, h * 0.52, h * 0.50, 10);
    g.fillStyle(M.bone, 1);
    g.fillEllipse(ex + d * h * 0.14, y - h * 0.24, h * 0.44, h * 0.42, 10);
    g.fillEllipse(ex + d * h * 0.14, y + h * 0.24, h * 0.44, h * 0.42, 10);
  });

  //  ④ 밧줄 감기 — 마디 안쪽을 두 번 동여맨다.
  [x0 + h * 0.46, x0 + midW - h * 0.46].forEach(function (rx) {
    g.fillStyle(M.rope, 1);
    g.fillRect(rx - 4, top + 2, 8, h - 4);
    g.fillStyle(M.woodDark, 0.5);
    g.fillRect(rx - 4, top + 2, 2, h - 4);
  });

  //  ⑤ 부족 문양 — ★ 대신 새김. 좌우 대칭 쐐기 셋(청동으로 박아 넣은 못처럼).
  [-1, 1].forEach(function (d) {
    var bx = W / 2 + d * (midW * 0.5 - h * 0.95);
    for (var k = 0; k < 3; k++) {
      var oy = (k - 1) * (h * 0.22);
      g.fillStyle(M.bronze, 0.95);
      g.fillTriangle(bx - d * 5, y + oy - 4, bx - d * 5, y + oy + 4, bx + d * 5, y + oy);
    }
  });

  //  이름 — 왼쪽 밖에서 들어와 가운데 멈췄다 오른쪽으로 빠진다.
  //  ⚠ 배너만 **디스플레이 폰트**(검은고딕)를 쓴다. 본문 폰트(Jua)는 둥글고 귀여워서
  //    "사건"이라는 인상이 안 선다. 없으면 기본 폰트로 조용히 떨어진다.
  var FD = (GAME.CONFIG.FONT_DISPLAY || GAME.CONFIG.FONT) + ', ' + GAME.CONFIG.FONT;
  //  ⚠ 장식 기호(★)를 뺐다. 별은 이 세계의 물건이 아니고, 위에서 청동 쐐기로
  //    같은 역할을 이미 한다. 글자만 남겨야 이름이 주인공이 된다.
  //  ── 새김 글자 ──────────────────────────────────────────────────────────
  //  뼈에 파낸 글자는 **아래로 파여** 위쪽 모서리에 그늘이, 아래쪽에 빛이 앉는다.
  //  그래서 같은 글자를 두 겹으로 놓는다: 뒤에 밝은 결(1px 아래), 앞에 어두운 본체.
  var mk = function (dy, col, alpha) {
    return keep(self.add.text(-W * 0.4, y + dy, name, {
      fontFamily: FD,
      fontSize: (SM ? 24 : 34) + 'px',
      color: col
    }).setOrigin(0.5).setAlpha(alpha).setDepth(9501).setScrollFactor(0));
  };
  var lite = mk(2, '#ffffff', 0.55);      // 파인 자국 아래에 앉는 빛
  var txt = mk(0, '#3a2a14', 1);          // 본체 — 뼈보다 어두운 흙빛

  this.tweens.add({ targets: [txt, lite], x: W / 2, duration: 260, ease: 'Back.easeOut' });
  this.tweens.add({ targets: [txt, lite], scaleX: 1.06, scaleY: 1.06, duration: 180,
                    yoyo: true, repeat: 2, delay: 260 });
  this.tweens.add({ targets: [txt, lite, g], alpha: 0, duration: 260, delay: 1100,
    onComplete: function () {
      if (!self._ultObjs) return;
      self._ultObjs.forEach(function (o) { try { o.destroy(); } catch (e) {} });
      self._ultObjs = null;
    } });
  this.tweens.add({ targets: [txt, lite], x: W * 1.4, duration: 300, delay: 1100, ease: 'Back.easeIn' });

  //  화면·소리·손 — 셋이 같이 와야 '사건'이 된다.
  if (this.cameras && this.cameras.main) this.cameras.main.shake(220, 0.006);
  if (GAME.Sound) GAME.Sound.play('boom');
  //  ⚠ 진동은 **중요할 때만**이라는 규칙이 있다(v1.31). 30초에 한 번인 궁극기는
  //    그 기준에 맞는다. 두 번 끊어 평소 피격(한 번)과 구분한다.
  //    2026-09-02: sound.js 의 HAPTIC 표('ultBanner')로 — 📳 토글을 따르게.
  if (GAME.Sound && GAME.Sound.haptic) GAME.Sound.haptic('ultBanner');
};

//  ── 토스트 (2026-08-05: 큐 신설) ────────────────────────────────────────────
//  예전에는 새 토스트가 앞의 것을 **즉시 지웠다**. 구슬을 줍는 순간 회복 구역이
//  나타나거나 공격반사 경고가 겹치면 첫 줄을 **읽을 새도 없이** 사라졌다 —
//  이 저장소가 구슬·축복에서 두 번 겪은 "받은 줄도 몰랐다"와 같은 계열이다.
//  ⚠ 뒤에 밀린 것이 있으면 **짧게** 보여 준다. 4초씩 쌓으면 전투가 끝나도 안내가
//    남아 흐른다 — 큐는 밀리는 것을 없애려고 두는 것이지 늘리려는 게 아니다.
//  ⚠ 큐 길이를 막는다. 난전에서 수십 개가 밀리면 그건 안내가 아니라 소음이다.
//  ⚠ `DefendScene` 은 자기 `init` 을 따로 갖는다 → 여기서 **게으르게 초기화**한다
//    (프로토타입을 빌려 쓰는 씬이 undefined 를 만나 터지는 사고가 이미 있었다).
GAME.BattleScene.prototype.TOAST_MAX = 4;
//  획득 알람 (2026-08-22 태현님: "전투중에는 알람만") — 구슬 토스트와 같은 자리·문법.
//  팝업·빵빠레는 여기서 절대 안 연다. 큐에 넣어 두면 등반이 멈추는 화면이 연다.
GAME.BattleScene.prototype._dropAlert = function (drop) {
  if (GAME.DropPopup) GAME.DropPopup.enqueue(drop);
  this._orbToast((drop.kind === 'item' ? '🎁 ' : '📖 ') + drop.name + ' 획득!');
  if (GAME.Sound) { try { GAME.Sound.play('coin'); } catch (e) {} }
};

GAME.BattleScene.prototype._orbToast = function (text) {
  //  ── 크레딧 스택 (2026-08-23 태현님: "겹치면 뒤엣게 늦게 떠 — 영화 크레딧처럼
  //  밀고 올라가서 위엣것부터 사라지게") ──────────────────────────────────────
  //  예전엔 한 줄짜리 직렬 큐라 구슬→연계가 연달아 오면 두 번째가 1.7초를 기다렸다.
  //  이제 새 자막은 즉시 바닥 줄에 뜨고, 있던 자막들이 위로 밀려 올라간다.
  if (!text) return;
  var C = GAME.CONFIG.COLORS, W = GAME.CONFIG.WIDTH;
  var r = GAME.Iso.screenRect();
  var baseY = r.bottom - (GAME.CONFIG.SMALL ? 34 : 46);
  if (!this._toasts) this._toasts = [];
  var m = GAME.UI.label(this, W / 2, baseY, text,
    GAME.CONFIG.SMALL ? 17 : 20, C.accent, 0.5).setOrigin(0.5, 1).setDepth(60).setAlpha(0);
  m.setAlign('center').setWordWrapWidth(Math.min(W - 60, r.w - 40));
  this._toasts.push(m);
  this.tweens.add({ targets: m, alpha: 1, duration: 160 });
  //  상한을 넘치면 **위(가장 오래된 것)부터** 지운다.
  while (this._toasts.length > this.TOAST_MAX) this._toastDrop(this._toasts[0]);
  this._toastFlow();
  var self = this;
  this.time.delayedCall(3400, function () { self._toastDrop(m); });
};

//  자막 하나를 떠나보낸다 — 위로 흘러가며 사라지고, 남은 줄들이 자리를 당긴다.
GAME.BattleScene.prototype._toastDrop = function (m) {
  if (!this._toasts) return;
  var i = this._toasts.indexOf(m);
  if (i < 0) return;
  this._toasts.splice(i, 1);
  if (m && m.scene) {
    this.tweens.add({ targets: m, alpha: 0, y: m.y - 16, duration: 260,
      onComplete: function () { if (m && m.scene) m.destroy(); } });
  }
  this._toastFlow();
};

//  바닥 기준으로 다시 쌓는다 — 최신이 맨 아래, 오래된 것일수록 위.
GAME.BattleScene.prototype._toastFlow = function () {
  if (!this._toasts) return;
  var r = GAME.Iso.screenRect();
  var y = r.bottom - (GAME.CONFIG.SMALL ? 34 : 46);
  for (var i = this._toasts.length - 1; i >= 0; i--) {
    var m = this._toasts[i];
    if (!m || !m.scene) continue;
    this.tweens.add({ targets: m, y: y, duration: 200, ease: 'Cubic.easeOut' });
    y -= (m.height + 6);
  }
};

GAME.BattleScene.prototype._drawOrbs = function (g) {
  var st = this.state;
  if (!st || !st.orbs || !st.orbs.length) return;
  var Iso = GAME.Iso, C = GAME.CONFIG.COLORS;
  for (var i = 0; i < st.orbs.length; i++) {
    var o = st.orbs[i];
    var sx = o.x, sy = Iso.toScreenY(o.y);
    // 위아래로 살짝 떠 있다 — 바닥에 붙은 동전과 구분되는 신호다.
    var bob = Math.sin((o.t || 0) / 260) * 3;
    var r = GAME.CONFIG.SMALL ? 7 : 9;
    // 그림자(바닥에 있다는 표시)
    g.fillStyle(0x000000, 0.22);
    g.fillEllipse(sx, sy, r * 2.0, r * 2.0 * Iso.TILT);
    // 구슬 — 잉크 테두리 + 밝은 알맹이. 어떤 바닥에서도 한쪽은 살아남는다
    // (마커·발밑 링과 같은 2톤 원리).
    var ink = (GAME.UI.ART_INK_COLOR !== undefined) ? GAME.UI.ART_INK_COLOR : 0x2a2114;
    g.fillStyle(ink, 0.85);
    g.fillCircle(sx, sy - r - bob, r + 2);
    g.fillStyle(C.accent, 1);
    g.fillCircle(sx, sy - r - bob, r);
    g.fillStyle(0xffffff, 0.75);
    g.fillCircle(sx - r * 0.3, sy - r - bob - r * 0.3, r * 0.34);
  }
};

// ── 치유 구역 (2026-08-01, 물약을 대신한다) ────────────────────────────────
//  구슬과 완전히 같은 문법이다(지나가면 줍는다) — 아래 세 함수는 `_updateOrbs`/
//  `_orbToast`/`_drawOrbs` 를 그대로 본떴다.
GAME.BattleScene.prototype._updateHealZones = function (dt) {
  var st = this.state;
  if (!st || !st.healZones || !st.healZones.length || !GAME.HealZone) return;
  var h = this.hero;
  if (!h || !h.alive) return;
  var pickR = (h.def ? h.def.radius : 17) + 34;
  for (var i = st.healZones.length - 1; i >= 0; i--) {
    var z = st.healZones[i];
    z.t += dt;
    //  수명이 붙은 것(보스전)은 시간이 다하면 **안 주워도** 사라진다.
    if (z.ttl && z.t >= z.ttl) { st.healZones.splice(i, 1); continue; }
    if (z.t < 220) continue;
    var dx = h.x - z.x, dy = h.y - z.y;
    if (dx * dx + dy * dy > pickR * pickR) continue;
    st.healZones.splice(i, 1);
    var msg = GAME.HealZone.applyKind(st, h, z.kind || 'heal');
    if (msg) this._orbToast(msg);
    //  주운 순간은 **드물고 중요하다** — 5초 안에 갈지 말지 판단해서 얻어낸 결과다.
    if (GAME.Sound && GAME.Sound.haptic) GAME.Sound.haptic('pickup');
  }
};

//  ── 잉걸불 구역 (2026-08-08 · 불씨꾼) ───────────────────────────────────────
//  ⚠ **그리기만** 한다. 갱신·피해는 `Combat.update` 안에 있다 — 씬에 두면 헤드리스
//    도구(sim·회귀·곡선)에서 이 피해가 안 보여 밸런스 숫자가 거짓말이 된다.
//  ⚠ 색은 이 세계의 물건 색(잉걸불)이다. 마법 광선·네온은 이 게임에 없다.
GAME.BattleScene.prototype._drawEmberZones = function (g) {
  var st = this.state;
  if (!st || !st.emberZones || !st.emberZones.length) return;
  var Iso = GAME.Iso;
  for (var i = 0; i < st.emberZones.length; i++) {
    var z = st.emberZones[i];
    var sy = Iso.toScreenY(z.y);
    //  남은 시간이 짧아질수록 옅어진다 — 언제 꺼지는지를 숫자 없이 알린다.
    var life = Math.max(0, Math.min(1, z.t / 5000));
    var a = 0.16 + 0.22 * life;
    g.fillStyle(0xd8451a, a);
    g.fillEllipse(z.x, sy, z.r * 2, z.r * 1.1, 24);
    g.lineStyle(2, 0xff8c2e, 0.30 + 0.35 * life);
    g.strokeEllipse ? g.strokeEllipse(z.x, sy, z.r * 2, z.r * 1.1, 24)
                    : g.strokeCircle(z.x, sy, z.r);
    //  일렁이는 불씨 몇 점 — 정지한 원이면 '바닥 무늬'로 읽힌다.
    var ph = (st.elapsed || 0) / 220 + i;
    for (var k = 0; k < 4; k++) {
      var ang = ph + k * 1.57;
      var rr = z.r * (0.30 + 0.42 * ((k % 3) / 2));
      g.fillStyle(k % 2 ? 0xff8c2e : 0xd8451a, 0.35 + 0.35 * life);
      g.fillEllipse(z.x + Math.cos(ang) * rr, sy + Math.sin(ang) * rr * 0.55,
                    z.r * 0.15, z.r * 0.11, 8);
    }
  }
};

GAME.BattleScene.prototype._drawHealZones = function (g) {
  var st = this.state;
  if (!st || !st.healZones || !st.healZones.length) return;
  var Iso = GAME.Iso, C = GAME.CONFIG.COLORS;
  for (var i = 0; i < st.healZones.length; i++) {
    var z = st.healZones[i];
    var sx = z.x, sy = Iso.toScreenY(z.y);
    var bob = Math.sin((z.t || 0) / 300) * 3;
    var r = GAME.CONFIG.SMALL ? 9 : 12;

    //  ── 사라지기 전 깜빡임 (사용자 지시: "반짝이다가 사라지면돼") ────────────
    //  남은 시간이 짧아질수록 **더 빨리** 깜빡인다 — 남은 시간을 숫자 없이 알린다.
    var a = 1;
    var HZ = GAME.HealZone;
    if (z.ttl && HZ) {
      var left = z.ttl - z.t;
      if (left < HZ.BLINK_MS) {
        var urg = 1 - Math.max(0, left) / HZ.BLINK_MS;      // 0 → 1 로 급해진다
        var hz = 6 + urg * 16;
        a = 0.30 + 0.70 * (0.5 + 0.5 * Math.sin(z.t / 1000 * hz));
      }
    }

    //  종류마다 **색과 속기호**를 다르게 준다(색만 다르면 색맹에서 구분이 안 된다).
    var kind = z.kind || 'heal', body = 0x4fd07a;
    if (HZ && HZ.KINDS) {
      for (var k = 0; k < HZ.KINDS.length; k++) {
        if (HZ.KINDS[k].key === kind) { body = HZ.KINDS[k].color; break; }
      }
    }

    g.fillStyle(0x000000, 0.20 * a);
    g.fillEllipse(sx, sy, r * 2.4, r * 2.4 * Iso.TILT);
    var ink = (GAME.UI.ART_INK_COLOR !== undefined) ? GAME.UI.ART_INK_COLOR : 0x2a2114;
    g.fillStyle(ink, 0.85 * a);
    g.fillCircle(sx, sy - bob, r + 3);
    g.fillStyle(body, a);
    g.fillCircle(sx, sy - bob, r + 1);
    g.fillStyle(0xffffff, 0.9 * a);
    if (kind === 'rage') {
      // 분노 — 위를 향한 쐐기 둘(공격력)
      g.fillTriangle(sx, sy - bob - r * 0.75, sx - r * 0.62, sy - bob + r * 0.12, sx + r * 0.62, sy - bob + r * 0.12);
      g.fillRect(sx - r * 0.62, sy - bob + r * 0.34, r * 1.24, r * 0.34);
    } else if (kind === 'edge') {
      // 벼려진 일격 — 비스듬한 날 하나
      g.fillTriangle(sx - r * 0.62, sy - bob + r * 0.70, sx + r * 0.70, sy - bob - r * 0.70, sx + r * 0.20, sy - bob + r * 0.16);
      g.fillRect(sx - r * 0.72, sy - bob + r * 0.48, r * 0.62, r * 0.30);
    } else {
      // 회복 — 십자
      g.fillRect(sx - r * 0.32, sy - bob - r * 0.7, r * 0.64, r * 1.4);
      g.fillRect(sx - r * 0.7, sy - bob - r * 0.32, r * 1.4, r * 0.64);
    }
  }
};

//  ── 피해 숫자 그라디언트 (2026-08-04) ────────────────────────────────────────
//  ⚠⚠ **인스턴스가 아니라 프로토타입에 둔다.** 처음엔 `create()` 안에서
//    `this.NUM_GRAD = {...}` 로 만들었는데, **수성의 탑(`GAME.DefendScene`)은
//    `BattleScene.create` 를 부르지 않고 자기 `create` 를 따로 갖는다.** 그래서
//    거기서는 이 값이 `undefined` 였고, 아래 `drawNumbers` 가 첫 피해 숫자를 그리는
//    순간 TypeError 를 던져 **Phaser 업데이트 루프가 죽었다** — 타이머가 멈추고
//    전투가 정지한다(사용자 리포트: "수성의탑에서 이 상태에서 게임이 멈췄다").
//    이 저장소가 CLAUDE.md "반복해서 터졌던 함정" 에 적어 둔 바로 그 사고다:
//    "'씬이 뜬다' 와 '게임이 돌아간다' 는 다르다 … updateHud 예외 → 루프 사망".
//  ⚠ **남의 draw 를 빌려 쓰는 씬이 있는 한, 그 draw 가 읽는 값은 프로토타입에 둔다.**
//    인스턴스에 두면 빌려 쓰는 쪽에서 조용히 비어 있고, 그 빈 값은 첫 프레임이
//    아니라 **조건이 맞는 순간**(여기서는 첫 피해)에 터져서 더 늦게 발견된다.
GAME.BattleScene.prototype.NUM_GRAD = {
  mine:  ['#fff8d2', '#ffd24a', '#d9700f'],   // 내가 준 피해 — 햇빛에서 불로
  crit:  ['#ffffff', '#ffcf8a', '#d8341a'],   // 치명타 — 백열 코어에서 불꽃으로
  taken: ['#cfc2ad', '#8a7a63'],              // 내가 맞은 것 — 흙색, 일부러 덜 튄다
  heal:  ['#eaffee', '#7ef0a0', '#2c9a5e']
};

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
    // 큰 수는 축약한다("2559!" → "2.6k!") — 아이템이 지수로 세지며 네 자리 숫자가
    // 여러 개 겹쳐 전장을 가렸다(사용자 승인). 자릿수가 줄면 겹칠 확률도 같이 준다.
    var nTxt = GAME.UI.numAbbr(n.value);
    t.setText(n.crit ? nTxt + '!' : nTxt);

    // 요청: "데미지도 플레이어가 입히는 게 더 중요하니 그 부분을 강조하고,
    //        맞는 건 조금 더 조그맣게 / 눈에 덜 띄는 색으로."
    // `onHero` 는 '영웅이 맞았다'는 뜻이지 '내가 맞았다'가 아니다 —
    // 방어전에서는 영웅이 적이라 의미가 뒤집힌다. 그래서 시점 플래그로 한 번 접는다.
    var heroIsPlayer = (this._heroIsPlayer === undefined) ? true : this._heroIsPlayer;
    var mine = heroIsPlayer ? !n.onHero : !!n.onHero;
    var SM = GAME.CONFIG.SMALL;
    var size;
    if (n.crit) size = mine ? (SM ? 40 : 38) : (SM ? 22 : 21);
    else        size = mine ? (SM ? 30 : 28) : (SM ? 17 : 16);
    //  ── 크기 변주 (2026-08-04) ────────────────────────────────────────────
    //  레퍼런스는 **크기로 정보를 준다** — 2242 와 388 이 같은 크기로 뜨면 화면이
    //  "무엇이 큰 한 방이었나"를 말해주지 않는다. 자릿수(log)로 재는 이유는 이 게임의
    //  피해가 지수로 자라기 때문이다(고층에서 선형으로 재면 전부 최대치에 붙는다).
    //  ⚠ 내가 준 피해에만 적용한다. 맞은 쪽까지 커지면 "덜 튀게 한다"는 결정과 어긋난다.
    //  ⚠ 크기는 `setFontSize` 를 부르므로 값이 잘게 흔들리면 매 프레임 재래스터가 된다
    //    → **4px 격자로 양자화**해 캐시가 실제로 듣게 한다.
    var mag = Math.min(1, Math.log(Math.max(1, n.value)) / Math.log(10000));
    if (mine) {
      size = Math.round((size * (1 + mag * 0.42)) / 4) * 4;
    }
    //  ── 무게 팝 (2026-08-23 태현님 ③) — 큰 피해일수록 태어날 때 크게 튀었다
    //  줄어든다. setScale 은 변환이라 재래스터가 없다(위 세터 캐시 규율과 무관).
    var popK = mine ? (0.18 + mag * 0.55) : 0.08;
    t.setScale(1 + popK * Math.max(0, 1 - prog * 5));
    // ⚠ Phaser 의 Text 스타일 세터(setFontSize/setColor/setStroke)는 값이 같아도
    //   **매번 캔버스를 다시 굽는다**(updateText). 매 프레임 부르면 숫자 하나당
    //   프레임마다 3~4회 재래스터가 일어난다 — 실측: 숫자 4개에서 22.8회/프레임,
    //   세터를 빼면 7.4회/프레임. 사냥꾼 연사처럼 숫자가 한꺼번에 뜨면 이게 곧 렉이다.
    //   스타일은 **숫자가 새로 뜰 때만** 바뀌므로 슬롯별로 캐시해 달라질 때만 부른다.
    //  ⚠ 외곽선을 두껍게 간다(내 피해 7px). 그라디언트는 밝은 색을 쓰므로 크림
    //    목초지 위에서 테두리가 없으면 글자가 배경에 녹는다 — 이 파일이 이미
    //    "흰 글자가 배경과 2.1:1" 로 겪은 문제와 같은 계열이다.
    var sw = mine ? (n.crit ? 8 : 7) : 4;
    if (t.__sz !== size) { t.setFontSize(size); t.__sz = size; }
    if (t.__sw !== sw) { t.setStroke(this.numStroke, sw); t.__sw = sw; }
    //  종류·크기가 바뀔 때만 그라디언트를 다시 굽는다(`setFill` 은 재래스터를 부른다).
    //  치명타는 맞은 쪽이어도 불색을 남긴다 — '치명타를 맞았다'는 알아야 할 정보다.
    var gk = (n.crit ? 'crit' : (mine ? 'mine' : 'taken')) + ':' + size;
    if (t.__gk !== gk) {
      var stops = this.NUM_GRAD[n.crit ? 'crit' : (mine ? 'mine' : 'taken')];
      try {
        var grd = t.context.createLinearGradient(0, 0, 0, size * 1.12);
        for (var gi = 0; gi < stops.length; gi++) {
          grd.addColorStop(gi / (stops.length - 1), stops[gi]);
        }
        t.setFill(grd);
      } catch (e) {
        t.setColor(stops[1] || stops[0]);      // 캔버스가 없으면 단색으로 물러선다
      }
      t.__gk = gk;
    }
    //  ── 등장 팝 ──────────────────────────────────────────────────────────
    //  ⚠ 트윈을 쓰지 않는다. 숫자는 초당 수십 개가 뜨고 사라지는데 그때마다
    //    트윈 객체를 만들면 그게 곧 GC 압력이다. **이미 있는 진행도(prog)에서
    //    곡선을 계산**하면 비용이 0 이다.
    //  처음 18% 구간에서 1.55배 → 1배로 내려앉는다. 그 뒤 마지막에 살짝 줄어든다.
    var pop = prog < 0.18 ? (1 + (1 - prog / 0.18) * 0.55) : (1 - (prog - 0.18) * 0.18);
    t.setScale(Math.max(0.55, pop));
    t.setAlpha(Math.max(0, 1 - prog * prog) * (mine ? 1 : 0.78));
    t.setPosition(n.x + (n.drift || 0) * prog, Iso.toScreenY(n.y) - 26 - (n.yOff || 0) - prog * 46);
  }
  for (; used < pool.length; used++) pool[used].setVisible(false);

  //  ── COMBO 갱신 (2026-08-04) ─────────────────────────────────────────────
  //  ⚠ 트윈을 안 쓴다. 숫자 풀과 같은 규율 — **경과 시간에서 곡선을 계산**하면
  //    비용이 0 이고 GC 압력도 없다.
  //  ⚠ 3연타부터 보여 준다. 1~2 타에 뜨면 상시 표시가 되어 특별함을 잃는다.
  if (this.comboNum) {
    var since = this.state.elapsed - (this._comboAt || -9999);
    var on = (this._combo || 0) >= 3 && since < 1200;
    if (!on) {
      if (this.comboNum.visible) { this.comboNum.setVisible(false); this.comboLbl.setVisible(false); }
    } else {
      var fade = since > 900 ? Math.max(0, 1 - (since - 900) / 300) : 1;
      //  방금 맞은 순간(140ms)에 튀어오른다 — '한 대 더 들어갔다'가 몸에 남는다.
      //  ⚠ **위아래로 막는다.** `since` 가 음수면(씬 재사용으로 옛 값이 남는 경우)
      //    이 식이 폭주해 글자가 화면만 해진다 — 실제로 그 사고가 있었다.
      //    `init` 에서 상태를 지우는 것이 근본 수정이고, 이건 두 번째 방어선이다.
      var punch = (since >= 0 && since < 140) ? 1 + (1 - since / 140) * 0.42 : 1;
      punch = Math.max(1, Math.min(1.42, punch));
      //  단계 색 — 쌓일수록 뜨거워진다(금 → 주황 → 빨강). 숫자만 커지는 것보다
      //  "지금 잘 되고 있다"가 색 온도로 먼저 읽힌다(2026-08-20 가독성 승급).
      //  10단위 돌파 순간에는 펀치를 더 준다. 전부 렌더 전용 — 판정 무관.
      if (this._comboTier !== (this._combo >= 20 ? 2 : this._combo >= 10 ? 1 : 0)) {
        this._comboTier = this._combo >= 20 ? 2 : this._combo >= 10 ? 1 : 0;
        this.comboNum.setColor(['#ffd24a', '#ff9038', '#ff5540'][this._comboTier]);
        this.comboLbl.setColor(['#ffe9a8', '#ffc79a', '#ffb0a0'][this._comboTier]);
      }
      if (this._combo >= 10 && this._combo % 10 === 0 && since >= 0 && since < 140) {
        punch = Math.min(1.75, punch + 0.3);
      }
      if (this.comboNum.text !== String(this._combo)) this.comboNum.setText(String(this._combo));
      this.comboNum.setVisible(true).setAlpha(fade).setScale(punch);
      this.comboLbl.setVisible(true).setAlpha(fade * 0.9);
    }
  }
};

GAME.BattleScene.prototype.update = function (time, delta) {
  //  렌더 시계(GAME.Iso.now) — eggart 의 벡터 보스 애니·방어 태세 맥동·표식 부적이 읽는다.
  //  시즌2 S-E 버그 수정: 지금까지 아무도 대입하지 않아 0 에 멈춰 있었다. Phaser `time`
  //  (단조 증가)을 넣는다 — 씬을 오가도 뒤로 안 간다. 시뮬·록스텝에는 안 닿는다.
  if (GAME.Iso && GAME.Iso.tick) GAME.Iso.tick(time);
  var dt = Math.min(delta, 50);

  //  ── 결정타 슬로모 (2026-09-02 C 갈래) ──────────────────────────────────────
  //  판이 끝나는 순간(_cinematicEnd) 0.45초 동안 **렌더 시간(dt)** 만 0.35배로.
  //  ⚠ `delta` 는 건드리지 않는다 — 실시간의 록스텝 틱(`_rtSession.advance(delta)`)과
  //    히트스톱 카운트다운은 실제 시간으로 흘러야 한다(내 쪽만 늦어지면 상대를 스톨로
  //    끌고 간다). 남은 슬로모도 실제 delta 로 줄인다(배율 걸린 dt 로 줄이면 3배 길어진다).
  //  씬 시계(this.time)·트윈도 같은 배율로 — 동전 비·종료 배너가 같이 늘어져야 한 장면이다.
  if (this._slowmo > 0 && GAME.Feel) {
    var smK = GAME.Feel.slowmoScale(this._slowmo);
    this._slowmo = GAME.Feel.slowmoStep(this._slowmo, delta);
    dt *= smK;
    this._setTimeScale(this._slowmo > 0 ? smK : 1);
  }

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

  //  ── 알깨기 골드 적립 (2026-08-23) — 때린 피해 진행률만큼 동전을 떨군다.
  //  coin.js 파이프라인(killGoldEvents → 동전 → killGold = 주운 골드)을 그대로 탄다.
  if (this.towerBonus === 'break' && this._egg && this._eggPool &&
      this.state.killGoldEvents) {
    var eggDone = 1 - Math.max(0, this._egg.hp) / this._egg.maxHp;
    var owed = Math.floor(eggDone * 12);
    while (this._eggChunks < owed) {
      this._eggChunks++;
      var give = Math.round(this._eggPool / 12);
      this.state.killGold = (this.state.killGold || 0) + give;
      this.state.killGoldEvents.push({
        x: this._egg.x + (Math.random() - 0.5) * 40,
        y: this._egg.y + (Math.random() - 0.5) * 24, gold: give, boss: false });
    }
  }

  //  ── 보스 인트로 (2026-08-23 4차 — 태현님: "확대했다가 전장 풀화면으로") ────
  //  히트스톱과 같은 문법: 시뮬은 멈추고 렌더만 돈다. 그 사이 보스는 기상 연출
  //  (atk.intro)을 하고 카메라(worldLayer 줌)가 보스를 당겨 보여준다.
  //  타이머(state.elapsed)도 같이 멈추므로 플레이어가 손해 보는 시간이 아니다.
  if (this._introHold > 0 && !this.rt) {
    this._introHold -= delta;
    this._dt = 0;
    this.draw();
    this.drawNumbers();
    this.updateHud();
    return;
  }

  // 히트스톱 중에는 시뮬을 진행시키지 않는다 — 화면이 '멎었다가' 터지는 느낌을 만든다
  //  ⚠ 실시간에서는 히트스톱으로 시뮬을 멈추면 안 된다 — 내 쪽만 늦어져
  //    상대까지 스톨로 끌고 간다. 흔들림·플래시는 그대로 두고 멈춤만 끈다.
  if (this._hitStop > 0 && !this.rt) {
    this._hitStop -= delta;
    this._dt = 0;
    this.draw();
    this.drawNumbers();
    this.updateHud();
    return;
  }

  if (!this.state.over) {
    if (this.ctrl) this.ctrl.update(dt);
    if (this.rt) {
      //  실시간 — 시뮬은 록스텝 틱으로만 흐른다(가변 dt 금지, P2 규약).
      var sh = this._rtShadow;
      if (sh && this._heroIsPlayer && sh.order && sh.order !== this._rtSentOrder) {
        this._rtSentOrder = sh.order;
        var o = sh.order, so = { type: o.type };
        if (o.x !== undefined) { so.x = o.x; so.y = o.y; }
        if (o.target) so.ti = this.state.units.indexOf(o.target);
        this._rtSession.queueLocal({ kind: 'order', order: so });
      }
      if (this._rtCountdown > 0) {
        this._rtCountdown -= delta;
        if (this._rtCdTxt && this._rtCdTxt.scene) {
          var cdN = Math.ceil(this._rtCountdown / 1000);
          this._rtCdTxt.setText(this._rtCountdown > 0 ? String(Math.max(1, cdN)) : '');
          var cdF = (this._rtCountdown % 1000) / 1000;
          this._rtCdTxt.setScale(1 + cdF * 0.25).setAlpha(0.45 + cdF * 0.55);
          if (this._rtCountdown <= 0) this._rtCdTxt.setVisible(false);
        }
        this.draw(); this.drawNumbers(); this.updateHud();
        return;
      }
      if (this._rtBot) {
        //  연습 대전 — 봇이 명령을 큐에 넣고, 상대 확정 틱을 항상 앞으로 밀어 스톨 0.
        this._rtBot.update(delta);
        this._rtSession.remoteTick = this._rtSession.tick + this._rtSession.delay;
      }
      var ran = this._rtSession.advance(delta);
      this._rtStall = (ran === 0);
      //  ── 스톨 탈출구 (2026-08-22 태현님 ⑤: "멈춰서 뒤로가기도 못 쓴다") ──────
      //  상대가 10초 넘게 응답 없으면 나가기 버튼을 띄운다 — 강제종료 말고 출구를 준다.
      this._rtStallMs = this._rtStall ? (this._rtStallMs || 0) + delta : 0;
      if (this._rtStallMs > 10000 && !this._rtExitBtn && !this.state.over) {
        var exSelf = this;
        this._rtExitBtn = GAME.UI.button(this, GAME.CONFIG.WIDTH / 2, GAME.CONFIG.HEIGHT * 0.30,
          Math.min(GAME.CONFIG.WIDTH - 60, 360), 54, '🚪 대전 나가기 (상대 응답 없음)', function () {
            if (exSelf.state.over) return;
            exSelf.state.over = true;
            //  잠수는 남은 쪽 승리 — 연결 끊김과 같은 규칙. 협동은 파트너 잠수 = 판 불성립(패).
            exSelf.state.winner = exSelf.rt.coop ? 'strategist' : exSelf.rt.meTeam;
            exSelf._rtNote = '상대가 응답하지 않아 판을 끝냈습니다';
          });
        [this._rtExitBtn.gfx, this._rtExitBtn.rect, this._rtExitBtn.text].forEach(function (e) {
          if (e && e.setDepth) e.setDepth(9500);
        });
      }
      if (this._rtExitBtn && (!this._rtStall || this.state.over)) {
        [this._rtExitBtn.gfx, this._rtExitBtn.rect, this._rtExitBtn.text].forEach(function (e) {
          if (e && e.destroy) e.destroy();
        });
        this._rtExitBtn = null;
      }
      //  그림자는 렌더·조준용 — 시뮬 영웅 위치를 따라간다
      if (sh && this.hero) {
        sh.x = this.hero.x; sh.y = this.hero.y; sh.facing = this.hero.facing;
        sh.alive = this.hero.alive;
      }
      //  상태 배너: 사고 > 스톨 > 관전 순으로 하나만 말한다
      if (this._rtTxt && this._rtTxt.scene) {
        //  ⚠ 스톨 배너는 **연속 1.5초 이상** 막혔을 때만 (2026-08-24 태현님 ②).
        //  록스텝은 상대 확정을 기다리는 0틱 프레임이 정상적으로 자주 생긴다 —
        //  프레임 단위로 띄우면 멀쩡한 판에서도 배너가 상시 노출된다(2계정 실측 28/30).
        var msg = this._rtNote ? ('⚠ ' + this._rtNote)
          : (this._rtStall && this._rtStallMs > 1500 && this.state.elapsed > 400 ? '⏳ 상대 연결을 기다리는 중…'
          : (!this._heroIsPlayer ? '👁 관전 — 내 진형이 싸우는 중입니다 (내 영웅 시점 아님)' : ''));
        if (msg) { this._rtTxt.setText(msg); this._rtTxt.setVisible(true); }
        else this._rtTxt.setVisible(false);
      }
    } else {
      GAME.Combat.update(this.state, dt);
      if (this._dodge) this._dodgeUpdate(dt);
    }
  }

  // 라운드 종료를 **씬에서** 3초 붙잡는다. combat.js 는 건드리지 않는다.
  //  ⚠ 슬로모(dt ×0.35, v3.0)에 유예까지 늘어지면 3초가 8.5초가 된다 — 실시간 잠수 탈출이
  //    결과 화면까지 못 가는 것으로 감사에 잡혔다. 유예는 **실제 경과(delta)**로 센다.
  this._endGate(delta);

  //  온보딩 코치 진행 — 행동을 감지해 다음 단계로
  if (this._coach && this._coachTxt && this._coachTxt.scene) {
    var ch = this._coach, hh2 = this.hero;
    ch.t += dt;
    if (ch.step === 0) {
      this._coachTxt.setText(GAME.isTouch
        ? '① 왼쪽 스틱을 끌어 움직여 보세요'
        : '① 우클릭 또는 방향키로 움직여 보세요');
      var mv = Math.abs(hh2.x - ch.x0) + Math.abs(hh2.y - ch.y0);
      if (mv > 70) { ch.step = 1; ch.t = 0; }
    } else if (ch.step === 1) {
      this._coachTxt.setText(GAME.isTouch
        ? '② 오른쪽 스킬 버튼을 눌러 보세요'
        : '② Q W E R 로 스킬을 써 보세요');
      var used = false;
      for (var ck in hh2.skillCd) if (hh2.skillCd[ck] > 0) used = true;
      if (used) { ch.step = 2; ch.t = 0; }
    } else if (ch.step === 2) {
      this._coachTxt.setText('③ 빨간 예고 원은 밖으로 걸어 나가면 안 맞습니다!');
      if (ch.t > 5000) {
        ch.step = 3;
        this._coachTxt.setText('준비 끝 — 영웅이 죽지 않게 탑을 오르세요!');
        if (GAME.Onboard) GAME.Onboard.markSeen('battle-coach-v1');
      }
    } else if (ch.step === 3 && ch.t > 2600) {
      this._coachTxt.setVisible(false);
      this._coach = null;
    }
  }

  //  저체력 비네트 — 내가 모는 영웅이 25% 미만이면 가장자리가 고동친다.
  //  (방어전에서는 영웅이 적이라 뜻이 뒤집힌다 — 시점 플래그로 접는다)
  if (this._lowHpG) {
    var lhHero = ((this._heroIsPlayer === undefined) ? true : this._heroIsPlayer) ? this.hero : null;
    var lhOn = lhHero && lhHero.alive && lhHero.maxHp && lhHero.hp / lhHero.maxHp < 0.25;
    this._lowHpG.setAlpha(lhOn
      ? 0.55 + Math.sin(this.state.elapsed / 210) * 0.30
      : 0);
  }

  // 동전 — 줍기 판정은 월드 좌표에서만 한다(줌·투영과 무관)
  if (this._coins) {
    this._coins.update(dt, this.hero);
    this._updateGoldHud(dt);
  }
  // 구슬 줍기 — 동전과 **같은 문법**이다(지나가면 줍는다). 플레이어가 새로 배울 것이 없다.
  this._updateOrbs(dt);
  // 영웅 발견 연출 — combat 이 남긴 state.spots 를 소비한다(느낌표 + 말풍선).
  this._updateSpots();
  // 치유 구역 — 통곡의 탑 전투에서만 존재한다(state.towerHealOn).
  this._updateHealZones(dt);
  //  ── 궁극기 배너 — 엔진이 남긴 신호를 씬이 읽어 띄운다 ────────────────────
  var uc = this.state.ultCast;
  if (uc && uc.n !== (this._ultSeen || 0)) {
    this._ultSeen = uc.n;
    this._ultBanner(uc.name);
  }

  //  ── 공격반사 알림 (2026-08-03 사용자 지시) ────────────────────────────────
  //  전투 엔진은 문구를 만들지 않는다 — `state.reflectPing` 이 늘어난 것을 씬이
  //  보고 띄운다. 매 반사마다 띄우면 글자가 도배되므로 **0.8초에 한 번만** 낸다.
  var ping = this.state.reflectPing || 0;
  if (ping !== (this._reflectSeen || 0)) {
    this._reflectSeen = ping;
    if (!this._reflectMute || this._reflectMute <= 0) {
      this._orbToast('공격반사! — 방어 태세엔 때리지 마라');
      if (GAME.Sound) GAME.Sound.play('hit');
      //  "때리면 안 되는 때 때렸다"는 **배워야 하는 실수**다. 손으로도 알려 준다 —
      //  두 번 짧게 끊어 평소 피격(한 번)과 구분되게 한다.
      if (GAME.Sound && GAME.Sound.haptic) GAME.Sound.haptic('reflect');
      this._reflectMute = 800;
    }
  }
  if (this._reflectMute > 0) this._reflectMute -= dt;

  //  ── 연계 콤보 알림 (2026-08-23) — reflectPing 과 같은 문법 ─────────────────
  var cping = this.state.comboPing || 0;
  if (cping !== (this._comboSeen || 0)) {
    this._comboSeen = cping;
    if (!this._comboMute || this._comboMute <= 0) {
      this._orbToast('⚡ 연계!');
      this._comboMute = 600;
    }
  }
  if (this._comboMute > 0) this._comboMute -= dt;

  //  ── 킬스트릭 (2026-08-23 태현님 ④) — 2연킬부터 톤 계단 + 짧은 문구 ─────────
  var ksp = this.state.killStreakPing;
  if (ksp && ksp.seq !== (this._ksSeen || 0)) {
    this._ksSeen = ksp.seq;
    if (GAME.Sound && GAME.Sound.killStreak) GAME.Sound.killStreak(ksp.n);
    //  자막은 뺐다(2026-08-23 태현님: "무의미해") — 톤 계단만 남긴다.
  }

  //  ── 궁극 착탄 (2026-08-23 태현님 ⑤) — 흰 섬광 1프레임 + 이중 충격파 ────────
  var ub = this.state.ultBlast || 0;
  if (ub !== (this._ubSeen || 0)) {
    this._ubSeen = ub;
    var ubAt = this.state.ultBlastAt;
    //  흰 섬광은 뺐다(2026-08-23 태현님: "과하다 — 없애고 떨림만 약하게").
    if (ubAt) {
      //  이중 충격파 — 시뮬 상태가 아니라 씬 트윈으로 그린다(RT 안전·잔재 걱정 없음).
      for (var ubi = 0; ubi < 2; ubi++) {
        var ubc = this.add.circle(ubAt.x, GAME.Iso.toScreenY(ubAt.y), 12)
          .setStrokeStyle(5 - ubi * 2, 0xe8b23a, 0.85).setDepth(80).setScale(1);
        if (this.worldLayer) this.worldLayer.add(ubc);
        this.tweens.add({ targets: ubc, radius: 150 + ubi * 90, alpha: 0,
          delay: ubi * 110, duration: 380, ease: 'Cubic.easeOut',
          onComplete: (function (o9) { return function () { o9.destroy(); }; })(ubc) });
      }
    }
    if (this.cameras && this.cameras.main) this.cameras.main.shake(130, 0.0035);
  }

  if (this.state.bossHealOn && GAME.HealZone && GAME.HealZone.tickBoss) {
    var bu = null;
    for (var bi = 0; bi < this.state.units.length; bi++) {
      if (this.state.units[bi].alive && this.state.units[bi].def &&
          this.state.units[bi].def.isBoss) { bu = this.state.units[bi]; break; }
    }
    if (GAME.HealZone.tickBoss(this.state, dt, GAME.CONFIG.ARENA, bu)) {
      //  ⚠ **방금 놓인 것의 이름을 말해야 한다.** 예전에는 종류와 무관하게
      //    "회복의 샘"이라고 알렸다 — 절반(분노 30% + 일격 20%)이 거짓 안내였다.
      //    5초 안에 "위험을 무릅쓰고 주우러 갈까"를 판단하라는 설계인데, 그
      //    판단의 근거가 틀려 있으면 기제 자체가 무의미해진다.
      var z = this.state.healZones[this.state.healZones.length - 1];
      var kn = (z && z.kind) || 'heal';
      var lbl = '회복의 샘';
      var KS = GAME.HealZone.KINDS || [];
      for (var ki = 0; ki < KS.length; ki++) if (KS[ki].key === kn) lbl = KS[ki].label;
      this._orbToast(lbl + '이(가) 나타났다!');
    }
  }

  for (var i = this.markers.length - 1; i >= 0; i--) {
    this.markers[i].t -= dt;
    if (this.markers[i].t <= 0) this.markers.splice(i, 1);
  }

  //  이모트 말풍선·쿨 표시(렌더 전용, 2026-09-02)
  if (this._bubbles && this._bubbles.length) this._updateBubbles(dt);
  if (this._emoteBar && GAME.Feel) {
    var enow = (window.performance && performance.now) ? performance.now() : Date.now();
    this._emoteBar.setCooling(!GAME.Feel.emoteAllowed(this._emoteLastAt, enow));
  }

  this._dt = dt;          // 걸음걸이·공격 모션 위상 계산용 (렌더에서만 쓴다)
  this._seasonFx();       // 시즌2 렌더 관측 — 페이즈 핑·전장 규칙 사건의 소리·흔들림·리본(렌더 전용)
  this.draw();
  this.drawNumbers();
  this.updateHud();

  if (this.state.over && !this.ended) {
    this.ended = true;

    //  ── 결정타 (2026-09-02 C 갈래) — 슬로모 + 승패 진동 ─────────────────────
    //  타임 오버·연결 끊김·데싱크는 '결정타'가 아니다 — 슬로모 없이 그대로 간다.
    if (!this.state.timeUp && !this._rtNote) this._cinematicEnd();
    if (GAME.Sound && GAME.Sound.haptic) {
      var wn = this.state.winner;
      if (wn === 'controller' || wn === 'strategist') {
        //  협동은 둘 다 'controller' 팀(meTeam 은 록스텝 자리).
        var mySide = this.rt ? (this.rt.coop ? 'controller' : this.rt.meTeam) : 'controller';
        GAME.Sound.haptic(wn === mySide ? 'win' : 'lose');
      }
    }

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

    //  ── 타임 오버 연출 (2026-08-22 태현님: "왜 졌는지는 알아야지") ────────────
    //  시간을 다 써서 진 판만 — 영웅이 죽은 판은 이미 죽음 연출이 사유를 말한다.
    //  모래시계 + 큰 글자, 결과 화면 전환(holdMs) 동안 화면 중앙에 박힌다.
    if (this.state.timeUp && this.state.winner !== 'controller' && !this.rt) {
      var toW = GAME.CONFIG.WIDTH, toH = GAME.CONFIG.HEIGHT;
      var toVeil = this.add.rectangle(toW / 2, toH / 2, toW, toH, 0x1a0808, 0.42).setDepth(3000);
      var toTxt = this.add.text(toW / 2, toH * 0.38, '⏳ 타임 오버', {
        fontFamily: GAME.CONFIG.FONT, fontSize: (GAME.CONFIG.SMALL ? 40 : 56) + 'px',
        fontStyle: 'bold', color: '#ff5a4e', stroke: '#3d0a05',
        strokeThickness: GAME.CONFIG.SMALL ? 6 : 8
      }).setOrigin(0.5).setDepth(3001);
      var toSub = this.add.text(toW / 2, toTxt.y + toTxt.height * 0.5 + 14,
        '제한 시간 안에 진형을 뚫지 못했습니다', {
          fontFamily: GAME.CONFIG.FONT, fontSize: (GAME.CONFIG.SMALL ? 14 : 17) + 'px',
          color: '#ffd9c9'
        }).setOrigin(0.5, 0).setDepth(3001);
      toTxt.setScale(2.4).setAlpha(0);
      this.tweens.add({ targets: toTxt, scale: 1, alpha: 1, duration: 380, ease: 'Back.easeOut' });
      this.tweens.add({ targets: [toVeil, toSub], alpha: { from: 0, to: 1 }, duration: 300 });
      this.cameras.main.shake(220, 0.004);
      if (GAME.Sound) { try { GAME.Sound.play('heroLowHp'); } catch (e) {} }
    }

    // 학습형 AI: 이 판의 관측치를 배치도에 기록한다.
    // '전략가가 이겼는가' 기준이므로 컨트롤러 승리는 진형의 패배다.
    var t = this.state.telemetry;
    var xs = t.heroXSamples;
    // ⚠ **시험 판은 학습시키지도 않는다.** 여기까지 막지 않아 실측에서 결과 화면에
    //   "격파당해 난이도가 1단계로 올랐습니다 / 시험 시작 — …" 이 떴다. 내 전장을
    //   내가 시험할 때마다 그 전장의 난이도(escalation)가 올라가면, 남이 도전할 때의
    //   난이도가 내 연습 횟수로 정해진다 — 격파율이 통째로 거짓이 된다.
    //   기록을 막는 곳은 넷이다: 배치도 전적 · 점수 · 트로피 · **학습**.
    //  ⚠ 실시간(rt) 판도 시험과 같은 급으로 **기록 4종을 전부 막는다** — 진형이
    //    '__rt' 가짜 id 인 데다, 상대가 사람이라 학습·전적·점수 축이 전부 오염된다.
    var noRec = this.test || !!this.rt;
    var learnRec = noRec
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
    if (!noRec) {
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
    //  사이드 판(알깨기·탄막)은 층수도 점수도 반영하지 않는다 (2026-08-23 태현님).
    //  지난 층 다시(replay)도 같다 — 이미 깬 층으로 점수를 또 벌면 랭킹이 거짓이 된다.
    var scoreSide = !!(this.towerBonus && this.towerBonus !== 'guard') || !!this.towerReplay;
    if (id && score > 0 && !noRec && !scoreSide) {
      GAME.Score.add(id, {
        score: score, won: won, asStrategist: false,
        escalation: this.escalation, formationName: this.formation.name,
        tower: this.tower
      });
    }

    // 플레이어 성향 누적 — AI 전략가가 다음 배치를 짤 때 쓴다
    if (!this.rt) GAME.Profile.record(this.heroKey, t);

    // 통곡의 탑 진행 처리
    // ⚠ `bossDrop` 이라는 이름이지만 2026-08-02 부터 **일반 층 드랍도 여기 담긴다.**
//   이름을 바꾸지 않은 이유는 `result.js`·`tower.js` 가 같은 키로 받고 있어서다.
var towerRec = null, runRec = null, goldGained = 0, bossDrop = null, bonusShown = 0;
    if (this.tower) {
      // 탑 학습 — **이긴 판·진 판 모두** 기록한다. 진 판에서만 배우면 가설을 세울 수는
      // 있어도 그것이 통했는지 확인할 수가 없다(확인은 이긴 판에서 나온다).
      if (GAME.TowerLearn && !this.towerReplay) {
        GAME.TowerLearn.record(this.tower, this.state, this.state.winner === 'strategist');
      }
      // ⚠ 2026-08-01 — **패배해도 층이 안 돌아간다.** `Tower.fail()` 은 이제 `runs++`
      //   만 하고 `floor` 는 그대로 둔다(사용자 지시: "실패해도 1층으로 안 돌아가게").
      //  ── 사이드 판 (2026-08-23 태현님: "보너스판들은 알지키기 말고는 층수에 반영
      //  안 되게") — 알깨기·탄막은 층이 오르지도 완화가 쌓이지도 않는 막간이다.
      //  한 번 놀면 소모 표시를 남겨 그 층이 실전으로 바뀐다(골드 농사 차단).
      var sideRound = !!(this.towerBonus && this.towerBonus !== 'guard');
      //  지난 층 다시(replay) — 사이드 판과 같은 레일: 층 전진도 실패 기록도 없다.
      var replay = !!this.towerReplay;
      towerRec = (sideRound || replay) ? null
                                       : (won ? GAME.Tower.clear(this.tower) : GAME.Tower.fail());
      if (sideRound && GAME.TowerChar && GAME.TowerChar.exists()) {
        GAME.TowerChar.markBonusDone(this.tower);
      }
      // 영구 캐릭터 — 이기면 골드를 적립한다. **지든 이기든 캐릭터는 그대로 남는다**
      // (예전 `TowerRun.end()` 처럼 지워지지 않는다 — 그게 이번 개편의 핵심이다).
      // ── 전투 양상을 압박 계수에 기록한다 (2026-08-02) ────────────────────
      //  승패만이 아니라 **얼마나 여유로웠나**를 남긴다 — 남은 체력과 걸린 시간.
      //  이 값이 다음 층부터 진형 유닛의 체력·공격에 곱해진다(js/tower.js).
      //  ⚠ 이기든 지든 부른다. 지는 판만 보면 값이 한쪽으로만 흐른다.
      if (GAME.TowerChar && GAME.TowerChar.exists() && !sideRound && !replay) {
        var heroU = null;
        for (var hi = 0; hi < this.state.units.length; hi++) {
          if (this.state.units[hi].isHero) { heroU = this.state.units[hi]; break; }
        }
        var hpFrac = heroU && heroU.maxHp ? Math.max(0, heroU.hp) / heroU.maxHp : 0;
        GAME.TowerChar.notePressure(won, hpFrac, (this.state.elapsed || 0) / 1000);
        //  막힌 층은 그 층만 조금씩 약해진다(2026-08-03 사용자 지시). 깨면 지워진다.
        if (won) GAME.TowerChar.clearFloorFail(this.tower);
        else GAME.TowerChar.noteFloorFail(this.tower);
      }
      if (GAME.TowerChar && GAME.TowerChar.exists()) {
        //  replay 승리도 사이드 판과 같은 보상 규칙 — **처치 골드만**(층 보상·드랍 없음).
        //  층 골드는 층 번호에 비례하므로 저층 반복은 애초에 벌이가 안 된다(농사 무해).
        if (won && (sideRound || replay)) {
          //  사이드 판 승리 — 층을 깬 게 아니므로 층 보상은 없다. 알깨기는 전투 중
          //  주운 동전만(이미 코인 파이프라인이 셌다), 탄막은 주운 금화(실시간
          //  적립됨 — 여기서는 표시 합산만)다.
          var pk2 = GAME.TowerRun ? GAME.TowerRun.earnedFrom(this.state) : 0;
          if (pk2 > 0) {
            goldGained = Math.round(pk2 * GAME.TowerRun.ruleGoldMul(this.tower) *
                                    GAME.TowerChar.luckGoldMul());
            if (goldGained > 0) runRec = GAME.TowerChar.addGold(goldGained);
          }
          if (this.towerBonus === 'dodge' && this._dodge) {
            goldGained += this._dodge.gold;      //  적립은 주운 순간 끝났다 — 표시만
            runRec = GAME.TowerChar.get();
          }
        } else if (won) {
          var rawGold = GAME.TowerRun ? GAME.TowerRun.goldGainFor(this.tower, this.state) : 0;
          // ── 층 돌파 보상 골드 (2026-07-31 사용자 지시: "라운드를 깨면 라운드 보상
          //    골드도 랜덤하게 조금씩 줬으면") ─────────────────────────────────
          //  처치 골드(rawGold)와 **별개의 축**이다. 처치 골드는 "얼마나 많이 잡았나"의
          //  보상이라 잘 싸울수록 커지는데, 그러면 고전한 판일수록 다음 층 준비가
          //  빈약해져 벽이 벽을 부른다. 층 보상은 **깼다는 사실 자체**에 붙는 바닥이라
          //  그 악순환을 끊는다. 층이 오를수록 조금씩 커지고 ±25% 로 흔들린다
          //  (매번 같은 숫자면 보상이 아니라 그냥 정산이다).
          // ⚠ 2026-08-01 — 층 보상을 **절반으로** 줄였다(사용자: "지금 라운드 끝났을 때
          //   주는 골드가 너무 많다고 생각해 절반 정도로 줄여"). 처치 골드가 지수로
          //   커졌으므로 '깼다는 사실'에 붙는 바닥은 작아도 된다.
          // ⚠ 2026-08-02 · 골드 25% 너프(0.5→0.375)에 이어 추가 20% 너프
          //   (0.375×0.8=0.3) — towerrun.js GOLD_BASE 와 같은 비율로 짝을 맞춘다.
          var floorBase = (12 + this.tower * 3) * 0.3;
          var floorBonus = Math.round(floorBase * (0.75 + Math.random() * 0.5));
          goldGained = Math.round((rawGold + floorBonus) * GAME.TowerChar.luckGoldMul());
          runRec = GAME.TowerChar.addGold(goldGained);
          // 층 보상은 **영웅 머리 위로 쏟아지는 동전**으로 보여준다 (2026-07-31 사용자
          // 지시: "라운드 끝났다고 돈 더 받았단 걸 모르겠어"). 숫자만 허브에 적어 두면
          // 그 사이 화면이 두 번 바뀌어 인과가 끊긴다 — 받은 순간이 손에 남아야 한다.
          // ⚠ 회계와 무관한 **순수 연출**이다(js/coin.js 의 `rain` 주석 참조).
          bonusShown = Math.round(floorBonus * GAME.TowerChar.luckGoldMul());
          //  ── 알지키기 성공 보상 (2026-08-23) — 층 골드 2배 + 확정 드랍 ─────────
          //  "지켜내면 무수한 보상": 골드 소나기(동전 비 연출 합산) + 보스와 같은
          //  경로의 확정 드랍(줄 게 없으면 골드 갈음 — grantBossDrop 규칙 재사용).
          if (this.towerBonus === 'guard' && this._egg && this._egg.alive) {
            //  2026-08-23 태현님: "골드를 주려고도 해야 해" — 2배 → **3배**(알깨기
            //  총액과 같은 급). 드랍(스킬/아이템)과 골드가 **둘 다** 나온다.
            var guardGold = Math.round(GAME.TowerRun.goldFor(this.tower) * 3 *
                                       GAME.TowerChar.luckGoldMul());
            goldGained += guardGold;
            GAME.TowerChar.addGold(guardGold);
            bonusShown += guardGold;
            var guardDrop = GAME.TowerChar.grantBossDrop();
            if (guardDrop) this._dropAlert(guardDrop);
            else {
              var gSolace = 60 + this.tower * 4;
              goldGained += gSolace;
              GAME.TowerChar.addGold(gSolace);
            }
            runRec = GAME.TowerChar.get();
          }
          // 보스 층은 세 결과 중 **하나만** 낸다(2026-09-03 사용자 지시: "아이템 필수지급은
          // 없애고 30%확률로 주거나 보스 잡을때만 특성포인트 주는 방식으로 하자 나머지는
          // 돈을 더 주는 방식으로 하자 아이템 너무 많이준다"). 확률·골드식은 전부
          // `TowerChar.grantBossOutcome` 안에 있다 — 여기서는 kind 로 연출만 고른다.
          if (GAME.Tower.bossFor(this.tower)) {
            // 보스 격파 스팅어 — 이겼을 때만(진 판엔 안 운다). 승리 화면으로 넘어가기
            // 전, 동전 비가 뿌려지는 것과 같은 자리에서 운다.
            if (GAME.Sound) GAME.Sound.play('bossDown');
            var bossOutcome = GAME.TowerChar.grantBossOutcome(this.tower);
            if (bossOutcome.kind === 'item') {
              bossDrop = bossOutcome.drop;
              this._dropAlert(bossDrop);
            } else if (bossOutcome.kind === 'point') {
              //  ✦ 는 이 프로젝트에서 세계 포인트/특성을 가리키는 정본 아이콘이다
              //  (towershop.js 특성 탭·진화 문구가 전부 ✦). 🔮 는 "구슬"(축복 드랍)
              //  개념이라 여기 쓰면 다른 보상과 헷갈린다(통합 시 발견해 수정).
              this._orbToast('✦ 세계 포인트 +1');
              if (GAME.Sound) { try { GAME.Sound.play('coin'); } catch (e) {} }
            } else {
              // 'gold' — 아이템 후보가 없어 갈음한 경우도 같은 분기로 들어온다.
              goldGained += bossOutcome.gold;
              bonusShown += bossOutcome.gold;
            }
            runRec = GAME.TowerChar.get();
          } else {
            // 일반 층 — **낮은 확률로** 하나 떨어진다(2026-08-02 사용자 지시).
            // 확률·후보 규칙은 전부 `TowerChar` 안에 있다. 여기서 숫자를 또 쓰면
            // 두 벌이 되어 조용히 갈라진다(이 폴더가 반복해서 겪은 실패).
            bossDrop = GAME.TowerChar.rollFloorDrop();
            if (bossDrop) { runRec = GAME.TowerChar.get(); this._dropAlert(bossDrop); }
          }
        } else {
          // ── 져도 **주운 동전은 내 것이다** (2026-08-01 사용자 신고) ──────────
          //  "라운드가 끝나고 상점으로 바로 이동했더니 골드가 저장이 안 돼."
          //  버그가 맞다. 전투 중 HUD 는 `_goldBase + _coins.collected` 를 띄워
          //  **골드가 올라가는 걸 눈앞에서 세어 보여 준다.** 그런데 적립은 `if (won)`
          //  안에만 있어서, 지면 그 숫자가 통째로 사라졌다. 화면이 거짓말을 한 것이다.
          //
          //  왜 주는 게 맞는가: `js/coin.js` 의 계약이 "`state.killGold` = **주운** 골드"다
          //  (죽인 만큼이 아니라 발로 밟아 주운 만큼). 즉 이건 이미 플레이어가 몸으로
          //  번 돈이다. 게다가 이번 개편에서 **패배해도 층이 안 돌아가고 캐릭터도 남는데**
          //  주운 동전만 빼앗는 것은 그 설계와 어긋난다.
          //
          //  ⚠ 다만 **층 돌파 보너스는 안 준다.** 그건 '깼다는 사실'에 붙는 값이라
          //    지면 안 붙는 게 맞다. 여기서 주는 것은 딱 주운 만큼이다.
          //  ⚠ `goldGainFor` 를 쓰지 않는 이유: 그 함수에는 훅이 안 불렸을 때 층 총액을
          //    통째로 주는 안전망이 있다. 이긴 판에서는 타당하지만 진 판에 그게 걸리면
          //    **져서 오히려 많이 받는** 역전이 생긴다.
          var picked = GAME.TowerRun ? GAME.TowerRun.earnedFrom(this.state) : 0;
          if (picked > 0) {
            goldGained = Math.round(picked * GAME.TowerRun.ruleGoldMul(this.tower) *
                                    GAME.TowerChar.luckGoldMul());
            if (goldGained > 0) runRec = GAME.TowerChar.addGold(goldGained);
          }
          if (this.towerBonus === 'dodge' && this._dodge && this._dodge.gold > 0) {
            goldGained += this._dodge.gold;      //  적립은 주운 순간 끝났다 — 표시만
            runRec = GAME.TowerChar.get();
          }
        }
      }
    }

    //  실시간 대전 — 점수를 정산한다(공성 트로피와 **다른 축**, 2026-08-21).
    //  데싱크(승자 null)는 판 무효 = 무정산. 상대 점수는 로비 세팅 교환값.
    //  정상 종료 + 방 연결 생존이면 결과 화면에서 재대결할 수 있게 방을 넘긴다.
    if (this.rt && this.state.winner !== null && GAME.NetRoom.connected) {
      this._rtKeepRoom = true;
    }
    var rtResult = null;
    if (this.rt && this.rt.coop && !this._rtScored) {
      //  ── 협동 보스전 (S-C) — 실시간 점수와 다른 축. 승 = 세계 포인트 + 골드 ─────
      //  둘 다 'controller' 팀이라 승패는 팀으로 본다(meTeam 은 록스텝 자리).
      //  데싱크(승자 null)는 무효 — 보상 없음. 봇 파트너 판도 정식 협동 승이다(태현님: 혼자여도 됨).
      this._rtScored = true;
      var coopHs = (this._rtHeroes && this._rtHeroes.controller) || [];
      var coopWon = this.state.winner === 'controller';
      var coopInvalid = this.state.winner === null;
      var dealt = [];
      for (var chi = 0; chi < coopHs.length; chi++) dealt.push(Math.round(coopHs[chi]._coopDealt || 0));
      rtResult = {
        coop: true, won: coopWon && !coopInvalid, invalid: coopInvalid,
        world: this.rt.coop.world, floor: this.rt.coop.floor,
        sec: Math.round((this.state.elapsed || 0) / 1000),
        timeUp: !!this.state.timeUp,
        mine: this._rtMyHeroId || 0, dealt: dealt,
        heroKeys: coopHs.map(function (hh) { return hh.hero ? hh.hero.key : ''; }),
        partnerBot: !!this.rt.local, botLevel: this.rt.local ? (this.rt.botLevel || 'normal') : null,
        gold: 0, points: 0, delta: 0, note: this._rtNote || null
      };
      if (rtResult.won) {
        //  골드 — TowerChar 가 있을 때만(캐릭터가 없으면 줄 곳이 없다 — 결과가 그렇게 말한다).
        try {
          if (GAME.RtCoop && GAME.TowerChar && GAME.TowerChar.exists && GAME.TowerChar.exists()) {
            rtResult.gold = GAME.RtCoop.goldFor(this.rt.coop.floor);
            if (rtResult.gold > 0) GAME.TowerChar.addGold(rtResult.gold);
          }
        } catch (e) { rtResult.gold = 0; }
        rtResult.points = (GAME.Season && GAME.Season.POINTS) ? (GAME.Season.POINTS.coop || 0) : 0;
      }
      if (GAME.RtScore && GAME.RtScore.coopRecord && !coopInvalid) {
        try { rtResult.best = GAME.RtScore.coopRecord(this.rt.coop.world, rtResult.won, rtResult.sec); } catch (e2) {}
      }
    } else if (this.rt && this.rt.local && !this._rtScored) {
      //  연습 대전 — 점수 무정산. 결과 화면이 "연습" 으로 말하고 [다시] 를 준다.
      this._rtScored = true;
      rtResult = { won: this.state.winner === this.rt.meTeam, delta: 0,
                   score: GAME.RtScore ? GAME.RtScore.get().score : 0,
                   practice: this.rt.botLevel || 'normal' };
      if (GAME.Achievements && GAME.Achievements.emit)
        GAME.Achievements.emit('rtResult', { won: rtResult.won, practice: true });
      if (GAME.Progress && GAME.Progress.emit)
        GAME.Progress.emit('rtResult', { won: rtResult.won, practice: true });
    } else if (this.rt && !this.test && GAME.RtScore && !this._rtScored) {
      this._rtScored = true;
      if (this.state.winner === null) {
        rtResult = { invalid: true };
      } else {
        var rtWon = this.state.winner === this.rt.meTeam;
        var rr = GAME.RtScore.record(rtWon, (this.rt.their && this.rt.their.rtScore) || 0);
        rtResult = { won: rtWon, delta: rr.delta, score: rr.score };
      }
    }

    // 대전(비동기 PvP) — 트로피를 정산한다
    var arenaResult = null;
    if (this.versus && !this.test && GAME.Arena) {
      arenaResult = GAME.Arena.recordAttack(GAME.Arena.pendingOpponent, won);
      // 격파율의 근거를 서버에 남긴다 — **그 진형의 주인 닉네임**으로 보고한다.
      // 내 기기 기록만으로는 남의 진형이 대부분 '기록 없음'으로 남아 정렬이 의미를 잃는다.
      // 원격 배치도의 author 가 곧 그 사람의 닉네임이다(formations.fromRemote 참조).
      //  2026-08-21: /siegeresult 로 갈아탐 — 격파율에 더해 **방어자 점수를 서버가
      //  정산**한다(깨지면 방어자 -18 · 막으면 +12). 옛 /defresult 는 서버에 남아 있다.
      if (GAME.Api && GAME.Api.siegeResult && this.formation.remote && this.formation.author) {
        GAME.Api.siegeResult(GAME.Account.current(), this.formation.author,
                             this.formation.slot || 1, won);
        //  깨는 데 성공하면 이 기지는 24시간 재도전 금지(어뷰징 차단 — 서버도 같은 규칙).
        if (won) GAME.Arena.recordSiegeWin(this.formation.author, this.formation.slot || 1);
      }
      GAME.Arena.pendingOpponent = null;
    }

    // 층 보상 동전을 영웅 머리 위로 쏟는다. **화면을 넘기기 전에** 뿌려야 보인다.
    // ⚠ `forfeit()` 은 위에서 이미 불렸다 — 그건 `list`(주울 동전)만 비우고
    //   `rainList`(연출 전용)는 안 건드리므로 순서가 안전하다.
    //  ── 메타 이벤트 (v3.0 업적·일일 과제, js/achievements.js · js/daily.js) ──────
    //  판이 끝난 자리에서 한 번만 발행한다. 조건 판정은 Achievements 가 한다.
    if (GAME.Achievements && GAME.Achievements.emit && !this.test) {
      try {
        var AE = GAME.Achievements, st0 = this.state, kills = 0, bossDead = false;
        for (var ai = 0; ai < st0.units.length; ai++) {
          var au = st0.units[ai];
          if (au.side !== 'strategist' || au.alive || GAME.Combat.isHazard(au)) continue;
          kills++;
          if (au.def && au.def.isBoss) bossDead = true;
        }
        if (kills > 0) AE.emit('kill', { n: kills });
        if (bossDead && won) AE.emit('bossKill', { floor: this.tower });
        var orbN = 0;
        if (st0.orbs) for (var oi2 = 0; oi2 < st0.orbs.length; oi2++) if (st0.orbs[oi2].taken) orbN++;
        if (st0.orbTaken && st0.orbTaken.length) orbN += st0.orbTaken.length;
        if (orbN > 0) AE.emit('orb', { n: orbN });
        if (this.tower && won && !this.towerReplay) AE.emit('towerClear', { floor: this.tower });
        if (this.versus && won) AE.emit('siegeWin', {});
        if (rtResult && !rtResult.invalid && !rtResult.practice && !rtResult.coop)
          AE.emit('rtResult', { won: !!rtResult.won, practice: false });
        //  ── 시즌 2 (S-C 배선) — 같은 자리에서 한 번. Season.emit 이 세계 포인트를 스스로
        //  적립한다(towerClear → 진입/보스, coopWin → +POINTS.coop) — earnWorldPoint 를
        //  따로 부르면 두 번 센다(season-audit 가 +1 을 못박는다).
        if (this.tower && won && !this.towerReplay && GAME.Season && GAME.Season.emit)
          GAME.Season.emit('towerClear', { floor: this.tower });
        if (rtResult && rtResult.coop && rtResult.won && !rtResult.invalid) {
          AE.emit('coopWin', { world: rtResult.world });
          if (GAME.Season && GAME.Season.emit) GAME.Season.emit('coopWin', { world: rtResult.world });
        }
        if (GAME.Daily && GAME.Daily.emit) {
          if (kills > 0) GAME.Daily.emit('kill', { n: kills });
          if (bossDead && won) GAME.Daily.emit('bossKill', {});
          if (orbN > 0) GAME.Daily.emit('orb', { n: orbN });
          if (this.tower && won && !this.towerReplay) GAME.Daily.emit('towerClear', { floor: this.tower });
          if (rtResult && !rtResult.invalid && !rtResult.coop) GAME.Daily.emit('rtResult', { won: !!rtResult.won, practice: !!rtResult.practice });
          if (rtResult && rtResult.coop && rtResult.won && !rtResult.invalid) GAME.Daily.emit('coopWin', { world: rtResult.world });
        }
        //  플레이어 XP(v3.0 A) — 같은 이벤트를 나란히.
        if (GAME.Progress && GAME.Progress.emit) {
          var PG = GAME.Progress;
          if (kills > 0) PG.emit('kill', { n: kills });
          if (bossDead && won) PG.emit('bossKill', { n: 1 });
          if (orbN > 0) PG.emit('orb', { n: orbN });
          if (this.tower && won && !this.towerReplay) PG.emit('towerClear', { floor: this.tower });
          if (this.versus && won) PG.emit('siegeWin', {});
          if (rtResult && !rtResult.invalid && !rtResult.practice && !rtResult.coop)
            PG.emit('rtResult', { won: !!rtResult.won, practice: false });
          if (rtResult && rtResult.coop && rtResult.won && !rtResult.invalid) PG.emit('coopWin', { world: rtResult.world });
        }
      } catch (e) { /* 메타는 전투를 절대 막지 않는다 */ }
    }

    var holdMs = 1100;
    //  타임 오버 배너는 읽을 시간이 필요하다 — 지는 판이라 동전 비도 없다.
    if (this.state.timeUp && this.state.winner !== 'controller' && !this.rt) holdMs = Math.max(holdMs, 2400);
    if (bonusShown > 0 && this._coins && this.hero) {
      this._coins.rain(this.hero.x, this.hero.y, bonusShown);
      holdMs = 2300;                 // 떨어지고 튀고 사라지는 데 필요한 시간
      // 동전만으로는 "얼마"인지 안 읽힌다 — 액수를 글로 한 번 더 못박는다.
      // 동전 줍기 팝업(+N)과 달리 이건 **한 판에 한 번**이라 크게 띄워도 시끄럽지 않다.
      // ⚠ `toScreenY` 는 **발밑**을 준다. 계란 몸통은 거기서 위로 3.2r 뻗으므로
      //   -74 로는 글자가 가슴께에 걸린다(실측 스크린샷). 머리 위로 확실히 띄운다.
      var hr = (this.hero.def && this.hero.def.radius) || 17;
      var bx = this.hero.x, by = GAME.Iso.toScreenY(this.hero.y) - hr * 3.6 - 34;
      var blbl = GAME.UI.label(this, bx, by, '층 보상  +' + bonusShown + ' 골드',
        GAME.CONFIG.SMALL ? 20 : 24, GAME.CONFIG.COLORS.accent, 0.5).setOrigin(0.5).setDepth(70);
      if (this.worldLayer) this.worldLayer.add(blbl);
      this.tweens.add({ targets: blbl, y: by - 34, duration: 900, ease: 'Cubic.easeOut' });
      this.tweens.add({ targets: blbl, scale: { from: 0.6, to: 1 }, duration: 320, ease: 'Back.easeOut' });
      this.tweens.add({ targets: blbl, alpha: 0, delay: 1500, duration: 600 });
    }

    this.time.delayedCall(holdMs, function () {
      self.scene.start('Result', {
        winner: self.state.winner,
        formationId: self.formation.id,
        heroKey: self.heroKey,
        towerReplay: !!self.towerReplay,
        escalation: self.escalation,
        score: score,
        tower: self.tower,
        towerRec: towerRec,
        runRec: runRec,
        goldGained: goldGained,
        bossDrop: bossDrop,
        versus: self.versus,
        test: self.test,
        arenaResult: arenaResult,
        rtResult: rtResult,
        //  재대결용 — 방이 살아 있을 때만. 역할은 지난 판 그대로 잇는다(협동은 세계·층도).
        rtLive: (self._rtKeepRoom && self.rt && self.rt.my) ? {
          myRole: self.rt.my.role, theirRole: self.rt.their.role,
          coop: self.rt.coop ? { world: self.rt.coop.world, floor: self.rt.coop.floor } : null
        } : null,
        //  ⚠ 이 콜백의 this 는 씬이 아니라 타이머다 — this.state 로 썼다가 결과 전환이
        //  통째로 죽어 **모든 전투가 끝나는 순간 얼어붙었다**(v2.43~46 회귀, RT 실측이 잡음).
        timeUp: !!self.state.timeUp,
        //  전투 보고(2026-08-23) — Result 가 탭·게이지로 요약해 보여준다.
        report: self.state.report,
        battleSec: Math.round((self.state.elapsed || 0) / 1000),
        //  사이드 판 표식 — 결과·도전 화면이 "층 돌파"가 아니라 "보너스 종료"로 말한다.
        bonusRound: (self.towerBonus && self.towerBonus !== 'guard') ? self.towerBonus : null,
        //  ── 탑에서는 학습 문구를 안 보여 준다 (2026-08-05 사용자 신고) ────────
        //  > "못깨고나서 7단계 올라갔다는 표현이보여서"
        //
        //  그 문구는 `js/learn.js` 의 **대전용 난이도 단계**다("격파당해 난이도가
        //  N단계로 올랐습니다"). 탑 진형도 id 가 `tower-<층>` 으로 고정이라 Learn 이
        //  층마다 단계를 쌓고, 그게 결과 화면에 그대로 떴다.
        //
        //  ⚠ **탑 난이도는 그 값을 안 쓴다.** 탑은 `Tower.modsFor`(층 곡선 + 막힌 층
        //    완화)로 굴러간다 — 즉 화면에 뜬 "올랐습니다"는 탑에서 아무 뜻이 없고,
        //    하필 **완화(난이도가 내려간다)와 정반대로 읽힌다.** 사용자가 "완화가
        //    도는 게 맞냐"고 물은 이유가 정확히 이것이다.
        //  ⚠ 기록 자체(`Learn.record`)는 **안 건드린다.** `Learn.get(id).adapt` 를
        //    탑 전투가 실제로 쓰고 있어서(이 파일 위쪽), 지우면 탑 AI 의 적응이
        //    조용히 달라진다 — 표시 문제를 밸런스 변경으로 갚지 않는다.
        learnNotes: self.tower ? [] : (learnRec.lastNotes || [])
      });
    });
  }
};

// 이 프레임에 애니메이션이 흘러야 할 시간(ms).
// **히트스톱 중에는 0 이다** — 시뮬이 멎었는데 그림만 움직이면 '멎었다가 터진다'는
// 연출 자체가 성립하지 않는다. 예전 `this._dt || 16` 은 0 을 16 으로 되돌려 놓아
// 그 약속을 조용히 깨고 있었다(0 은 falsy 다).
GAME.BattleScene.prototype._frameDt = function () {
  return (typeof this._dt === 'number' && isFinite(this._dt)) ? this._dt : 16;
};

// 체력이 줄어든 유닛을 찾아 타격 연출을 붙인다. **렌더 전용** — 상태를 읽기만 한다.
GAME.BattleScene.prototype._juice = function (dt) {
  if (this._hitStop === undefined) this._hitStop = 0;
  if (!this._prevHp) this._prevHp = {};

  //  ── 근접 평타 참격 (2026-08-04 사용자 요청) ─────────────────────────────
  //  > "검사는 스킬썼을때 최소한 검 휘두르는게 있으면 좋겠고"
  //  광역기에는 초승달을 넣었지만(v1.51) **평타에는 그림이 없어** 붙어서 때리는
  //  동안 화면이 조용했다. 근접 영웅은 대부분의 시간을 평타로 보낸다.
  //
  //  ⚠ **렌더 전용으로 관찰한다.** `combat.js` 에 훅을 만들지 않는다 — 발사 순간은
  //    쿨타임이 0 근처에서 최대치로 **되감기는 것**으로 알 수 있다(`fire()` 가
  //    `u.cd = cooldown` 으로 리셋한다). 체력 감소를 프레임 간 비교로 잡는
  //    바로 아래 방식과 같은 계열이라 새 계약이 안 생긴다.
  //  ⚠ 참격은 `state.effects` 가 아니라 **씬의 목록**에 쌓는다. 전투 상태에 렌더용
  //    데이터를 넣으면 시뮬 결정성·저장·재현이 전부 그것을 끌고 다니게 된다.
  var h = this.hero;
  if (!this._swings) this._swings = [];
  if (h && h.alive && h.def && h.def.attack === 'melee') {
    var cd = h.cd || 0;
    if (this._prevCd !== undefined && cd > this._prevCd + 1) {
      //  얼굴 방향으로 벤다. 8방향 스냅은 그림용이고 여기는 연속값이 자연스럽다.
      this._swings.push({
        x: h.x, y: h.y, ang: (h.facing === undefined ? -Math.PI / 2 : h.facing),
        r: ((GAME.Combat.effRange ? GAME.Combat.effRange(h, this.state) : h.def.range) || 90) * 1.30,
        t: 170, total: 170, key: h.type
      });
      if (this._swings.length > 4) this._swings.shift();   // 연타에서 쌓이지 않게
    }
    this._prevCd = cd;
  }
  for (var sw = this._swings.length - 1; sw >= 0; sw--) {
    this._swings[sw].t -= dt;
    if (this._swings[sw].t <= 0) this._swings.splice(sw, 1);
  }

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
      //  ── COMBO (2026-08-04) ────────────────────────────────────────────
      //  **내가 때린 것만** 센다. 이 화면에서 '영웅 = 플레이어'인지는 모드마다
      //  다르다(수성의 탑은 영웅이 적이다) — 피해 숫자가 쓰는 그 판단을 그대로 빌린다.
      //  ⚠ 새 트리거를 안 만든다. 여기가 이미 "누가 얼마나 맞았나"를 아는 자리다.
      var mineHit = ((this._heroIsPlayer === undefined) ? true : this._heroIsPlayer)
                    ? (u !== this.hero) : (u === this.hero);
      if (mineHit) {
        //  1.2초 안에 다음 타격이 없으면 끊긴다 — 연타의 쾌감이지 누적 점수가 아니다.
        if (this.state.elapsed - (this._comboAt || -9999) > 1200) this._combo = 0;
        this._combo = (this._combo || 0) + 1;
        this._comboAt = this.state.elapsed;
      }
      //  ── 타격 파티클 (2026-08-04) ────────────────────────────────────────
      //  ⚠ **새 트리거를 안 만든다.** 여기는 이미 "체력이 줄었다"를 프레임 간
      //    비교로 잡아내는 자리다. 별도 훅을 만들면 두 기준이 갈라져 언젠가
      //    어긋난다(히트스톱이 같은 이유로 이 값을 빌려 쓴다).
      //  단단한 것(방어력이 높은 유닛·보스 껍질)은 노른자가 아니라 불똥이 튄다 —
      //  방패병을 때렸는데 노른자가 나오면 '뚫었다'는 거짓 신호가 된다.
      if (GAME.HitFX) {
        //  ⚠ 문턱을 40 으로 잡는다. 30 으로 뒀더니 **전사(방어력 30)** 가 걸려서
        //    가장 흔한 유닛이 전부 불똥으로 빠졌고 노른자가 거의 안 튀었다(실측:
        //    노른자 살아있는 수가 대부분 0). 이 게임의 피는 노른자다 — 방패를
        //    든 것(방패병 45)만 '단단한 것'이어야 한다.
        var hardHit = (u.def && (u.def.armor || 0) >= 40) || !!u.isBoss;
        GAME.HitFX.hit(this, u.x, GAME.Iso.toScreenY(u.y) - (u.radius || 14) * 0.5,
                       pct, hardHit ? 'hard' : 'soft');
      }
    }
    //  죽는 순간 노른자가 크게 터진다(combat.js 의 바닥 얼룩과 짝을 이룬다).
    if (prev !== undefined && prev > 0 && !u.alive && !u.__fxDead) {
      u.__fxDead = true;
      if (GAME.HitFX) {
        GAME.HitFX.death(this, u.x, GAME.Iso.toScreenY(u.y) - (u.radius || 14) * 0.4, u.radius);
      }
      //  처치 진동(2026-09-02) — **내가 적을 잡았을 때만**, 250ms 에 한 번(광역기로
      //  넷이 한 번에 죽으면 한 번만 울린다). 내 영웅의 죽음은 lose 가 담당한다.
      var mineKill = ((this._heroIsPlayer === undefined) ? true : this._heroIsPlayer) &&
                     this.hero && u !== this.hero && u.side !== this.hero.side;
      if (mineKill && GAME.Sound && GAME.Sound.haptic &&
          this.state.elapsed - (this._hapKillAt || -1e9) >= 250) {
        this._hapKillAt = this.state.elapsed;
        GAME.Sound.haptic('kill');
      }
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
    //  ── 손 감각 (2026-08-03) ─────────────────────────────────────────────
    //  ⚠ **새 트리거를 만들지 않는다.** 히트스톱이 이미 "멈출 만큼 큰 타격"을
    //    문턱·간격까지 실측으로 걸러 두었으므로, 그 판단을 그대로 빌려 쓴다.
    //    여기서 따로 조건을 만들면 두 기준이 갈라져 언젠가 어긋난다.
    //  ⚠ **내가 맞았을 때만.** 내가 때리는 건 이미 소리·숫자·정지로 알려준다 —
    //    손까지 울리면 난전 내내 진동이 이어져 '중요할 때만'이 무너진다.
    //  2026-09-02: 길이는 sound.js 의 HAPTIC 표('hit' 8ms)가 정한다 — 세기 비례를
    //  버렸다. 8ms 는 '톡'이고 그 이상은 난전에서 손이 계속 떨린다. 토글(📳)도 거기서.
    if (heroHit && biggest >= 0.10 && GAME.Sound && GAME.Sound.haptic) GAME.Sound.haptic('hit');
    //  ── 내 큰 한 방 — 마이크로 셰이크 (2026-08-23 태현님: 타격감 보강) ─────────
    //  히트스톱이 이미 "멈출 만큼 큰 타격"을 걸렀으므로 그 판정을 그대로 빌린다.
    //  내가 맞은 쪽은 다굴 셰이크(아래 ②)가 담당 — 여기서는 **때린 쪽**만, 아주 짧게.
    if (!heroHit && this.cameras && this.cameras.main) {
      this.cameras.main.shake(90, 0.003);
    }
  }

  // ② 화면 흔들림 — **아껴 쓴다.**
  // 예전엔 피해가 들어올 때마다 흔들었더니 난전에서 화면이 계속 떨렸다.
  // 요청대로 두 순간에만, 그것도 5초에 한 번만 흔든다:
  //   · 내가 스킬을 썼을 때        — 내 행동의 무게
  //   · 3기 이상에게 둘러싸여 맞을 때 — 위기 신호
  var h = this.hero;

  // 시전 감지: 쿨다운이 '올라가는' 순간이 곧 시전이다. 로직에 손대지 않고 읽기만 한다.
  var cast = false, castUlt = false;
  if (h && h.skillCd) {
    if (!this._prevCd) this._prevCd = {};
    for (var s = 0; s < GAME.SKILL_SLOTS.length; s++) {
      var sl = GAME.SKILL_SLOTS[s];
      var cd = h.skillCd[sl] || 0;
      if (this._prevCd[sl] !== undefined && cd > this._prevCd[sl] + 1) {
        cast = true;
        if (sl === 'R') castUlt = true;
      }
      this._prevCd[sl] = cd;
    }
  }
  //  궁극(R) 시전 — 30초+ 쿨이라 '중요할 때만' 진동 규칙(v1.31)에 맞는다.
  //  피해 하한(평타 10대)으로 세진 만큼 손에도 무게가 실려야 한다.
  //  2026-09-02: 일반 스킬도 짧게(15ms) — 눌린 것을 손이 안다. 내 영웅일 때만
  //  (수성·관전에서 h 는 남의 영웅이다).
  var mineCast = ((this._heroIsPlayer === undefined) ? true : this._heroIsPlayer);
  if (cast && mineCast && GAME.Sound && GAME.Sound.haptic) GAME.Sound.haptic(castUlt ? 'ult' : 'skill');

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
      //  궁극은 판을 바꾸는 한 방 — 화면도 한 단계 크게 운다.
      this.cameras.main.shake(cast ? 150 : 220, cast ? 0.005 : 0.008);
    }
  }
  //  궁극(R)은 5초 간격 규칙 **밖**이다(2026-09-02 C 갈래) — 30초+ 쿨의 한 방이 방금
  //  일반 스킬이 흔든 탓에 조용히 나가면 무게가 없다. 위 GAP 셰이크가 이미 도는 중이면
  //  Phaser 가 이 호출을 무시하므로(force 없음) 큰 쪽이 살아남는다. 렌더 전용.
  if (castUlt && mineCast && this.cameras && this.cameras.main) this.cameras.main.shake(120, 0.004);

  // ③ 저체력 경고 — 사이렌처럼 붉은 테두리가 몇 번 번쩍인다
  this._lowHpWarn();
};

// ═══ 게임필 보조 (2026-09-02 C 갈래) — 전부 렌더 전용, 시뮬·록스텝에 안 닿는다 ═══

//  씬 시계·트윈 배율 — 슬로모가 걸고 풀며, create 가 되돌린다(플러그인은 씬 재사용을 따라 살아남는다).
GAME.BattleScene.prototype._setTimeScale = function (k) {
  if (this._timeScaleK === k) return;
  this._timeScaleK = k;
  try { if (this.time) this.time.timeScale = k; } catch (e) {}
  try { if (this.tweens && typeof this.tweens.timeScale === 'number') this.tweens.timeScale = k; } catch (e) {}
};

//  판이 끝나는 순간 — 한 판에 한 번만 슬로모를 건다(_endGate 진입과 ended 블록이 둘 다 부른다).
GAME.BattleScene.prototype._cinematicEnd = function () {
  if (this._slowmoFired || !GAME.Feel) return;
  this._slowmoFired = true;
  this._slowmo = GAME.Feel.SLOWMO_MS;
};

//  내 이모트 — 쿨(2초)을 넘겼을 때만. 봇 판(rt.local)은 상대가 없으니 릴레이 없이 내 것만.
GAME.BattleScene.prototype._sendEmote = function (k) {
  var F = GAME.Feel;
  if (!F || !F.emoteValid(k) || !this.rt) return false;
  var now = (window.performance && performance.now) ? performance.now() : Date.now();
  if (!F.emoteAllowed(this._emoteLastAt, now)) return false;
  this._emoteLastAt = now;
  if (!this.rt.local && GAME.NetRoom && GAME.NetRoom.relay) {
    try { GAME.NetRoom.relay({ type: 'emote', k: k }); } catch (e) {}
  }
  this._showBubble(this.hero, F.EMOTES[k]);
  return true;
};

//  상대 이모트 — 값은 믿지 않는다(0..3 정수만). 상대 팀 영웅 머리 위, 영웅이 없는 팀(진형만)이면
//  전장 위쪽 가운데.
GAME.BattleScene.prototype._onEmote = function (k) {
  var F = GAME.Feel;
  if (!F || !F.emoteValid(k) || !this.rt) return;
  var theirs = this.rt.meTeam === 'controller' ? 'strategist' : 'controller';
  var hero = this._rtHeroOf(theirs);
  this._showBubble(hero, F.EMOTES[k]);
};

//  자리(seat)·영웅 번호(h) → 시뮬 영웅. 록스텝 heroOf(side, heroId) 계약의 battle 쪽 구현.
//  1:1 판: `_rtHeroes[seat]`(예전 그대로 — h 는 안 실린다). 협동: `_rtHeroes.controller` 가
//  [방장 영웅, 손님/봇 영웅] 배열이고 h 로 고른다. h 가 없으면 자리로 — 'controller' 자리 = 0,
//  'strategist' 자리 = 1(손님). 모르는 h 는 첫 영웅(엔진 계약).
GAME.BattleScene.prototype._rtHeroOf = function (seat, h) {
  var H = this._rtHeroes;
  if (!H) return null;
  if (H.coop) {
    var arr = H.controller || [];
    var idx = (h === undefined || h === null) ? (seat === 'controller' ? 0 : 1) : (h | 0);
    return arr[idx] || arr[0] || null;
  }
  return H[seat] || null;
};

//  말풍선 하나를 띄운다. 같은 주인의 것이 떠 있으면 바꿔 단다(겹쳐 쌓이지 않게).
GAME.BattleScene.prototype._showBubble = function (owner, text) {
  if (!GAME.UI.emoteBubble || !this.scene || !this.scene.isActive()) return;
  if (!this._bubbles) this._bubbles = [];
  for (var i = this._bubbles.length - 1; i >= 0; i--) {
    if (this._bubbles[i].owner === owner) { this._bubbles[i].b.destroy(); this._bubbles.splice(i, 1); }
  }
  var r = (owner && owner.def && owner.def.radius) || 17;
  var b = GAME.UI.emoteBubble(this, text, { r: r });
  if (this.worldLayer) b.addTo(this.worldLayer);
  var e = { owner: owner, b: b, t: GAME.Feel ? GAME.Feel.EMOTE_SHOW : 1600, total: GAME.Feel ? GAME.Feel.EMOTE_SHOW : 1600 };
  this._placeBubble(e);
  this._bubbles.push(e);
};

GAME.BattleScene.prototype._placeBubble = function (e) {
  var o = e.owner;
  var x, y;
  if (o) {
    var r = (o.def && o.def.radius) || 17;
    x = o.x; y = GAME.Iso.toScreenY(o.y) - r * 3.4 - 6;   //  머리 위(계란 몸통은 발밑에서 3.2r)
  } else {
    var R = GAME.Iso.screenRect();
    x = R.x + R.w / 2; y = R.y + 44;
  }
  e.b.setPos(x, y);
};

GAME.BattleScene.prototype._updateBubbles = function (dt) {
  for (var i = this._bubbles.length - 1; i >= 0; i--) {
    var e = this._bubbles[i];
    e.t -= dt;
    if (e.t <= 0) { e.b.destroy(); this._bubbles.splice(i, 1); continue; }
    this._placeBubble(e);
    var fin = e.total - e.t;                              //  지난 시간
    var pop = fin < 160 ? (0.6 + 0.4 * (fin / 160)) : 1;   //  등장 팝
    e.b.setScale(pop);
    e.b.setAlpha(e.t < 300 ? e.t / 300 : 1);               //  마지막 0.3초 페이드
  }
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
  //  실시간 대전은 유예 없음(v3.0) — 결착 순간의 슬로모(0.45초)와 결과 화면 전환(1.1초)이
  //  이미 '끝났다'를 말한다. 3초 유예까지 얹으면 잠수 탈출·상대 이탈 뒤 결과가 4초 넘게
  //  안 떠서 멈춘 것처럼 보인다(rt-audit 실측).
  if (this.rt) return;
  var s = this.state;
  if (this._endHold === undefined) this._endHold = -1;

  if (this._endHold < 0) {
    if (s.over && s.winner === 'controller' && this.ROUND_END_MS > 0) {
      this._endHold = this.ROUND_END_MS;
      this._endElapsed = s.elapsed;
      s.over = false;
      this._showEndBanner();
      //  마지막 처치의 순간은 **여기**다 — 유예가 끝나 ended 블록이 도는 3초 뒤가 아니라.
      if (!s.timeUp) this._cinematicEnd();
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
  }
  // 배지 자리는 '남은 적' 글자 폭을 따라 움직인다(적이 줄면 글자가 짧아진다).
  // **달라졌을 때만** 다시 그린다 — 매 프레임 clear+fill 은 그 자체가 프레임이다.
  var a = this._goldAnchor();
  if (Math.ceil(this._goldTxt.width) !== this._goldW || a.right !== this._goldRight) {
    this._drawGoldBadge();
  }

  if (this._goldPop > 0) {
    this._goldPop = Math.max(0, this._goldPop - dt / 260);
    var k = 1 + 0.20 * this._goldPop;
    this._goldTxt.setScale(k);
  } else if (this._goldTxt.scaleX !== 1) {
    this._goldTxt.setScale(1);
  }
};

//  ── 탄막 판 런타임 (2026-08-23) ────────────────────────────────────────────
//  포탑은 그리기 전용(전투 유닛 아님) — 발사한 투사체만 combat 이 판정한다.
//  탑 전용·비실시간이라 Math.random 을 써도 안전하다(동기화 대상 아님).
GAME.BattleScene.prototype._dodgeAddTurret = function () {
  var A = GAME.CONFIG.ARENA, d = this._dodge;
  //  둘레를 황금비 간격으로 돈다 — 몇 기를 더해도 뭉치지 않고 고르게 퍼진다.
  var t = (d.turrets.length * 0.618034) % 1;
  var per = 2 * (A.w + A.h), s = t * per, inset = 18, x, y;
  if (s < A.w) { x = A.x + s; y = A.y + inset; }
  else if (s < A.w + A.h) { x = A.right - inset; y = A.y + (s - A.w); }
  else if (s < A.w * 2 + A.h) { x = A.right - (s - A.w - A.h); y = A.bottom - inset; }
  else { x = A.x + inset; y = A.bottom - (s - A.w * 2 - A.h); }
  d.turrets.push({ x: x, y: y, cd: 500 + (d.turrets.length * 173) % 900 });
};

GAME.BattleScene.prototype._dodgeUpdate = function (dt) {
  var d = this._dodge, st = this.state, h = this.hero;
  var g = this._dodgeG;
  if (!d || !st || !h) return;
  if (st.over) { if (g) g.clear(); return; }
  var ws = GAME.CONFIG.WORLD_SCALE || 1;

  //  영웅 속도 추정(예측 사격용) — 유닛에 vx 가 없어 지난 프레임과의 차로 만든다.
  if (dt > 0) {
    d.hvx = (h.x - d.hx) / dt * 1000; d.hvy = (h.y - d.hy) / dt * 1000;
  }
  d.hx = h.x; d.hy = h.y;

  //  증원 — 8초마다 포탑 +1(상한 16) + 발사 간격 7% 단축. "시간이 갈수록 많아진다".
  d.nextTurret -= dt;
  if (d.nextTurret <= 0) {
    d.nextTurret = 8000;
    if (d.turrets.length < 16) this._dodgeAddTurret();
    d.fireMs = Math.max(430, d.fireMs * 0.93);
  }

  //  발사 — 포탑별 개별 쿨. 진행 방향 예측 사격(리드 55%) — "예상 공격" 문법 재사용.
  //  2026-08-23 태현님 2차: "너무 약해 — 10대 맞으면 죽게, 더 다양한 공격으로 압박."
  //  피해 10%(10대 사망) + 세 번째 발마다 **부채꼴 3연발** + 15초부터 **투석 폭격**.
  var spd = 300 * ws;
  var dodgeDmg = Math.max(1, Math.round(h.maxHp * 0.10 /
                 ((GAME.CONFIG.PACE && GAME.CONFIG.PACE.DMG) || 1)));
  for (var i = 0; i < d.turrets.length; i++) {
    var tr = d.turrets[i];
    tr.cd -= dt;
    if (tr.cd > 0) continue;
    tr.cd = d.fireMs;
    d.shotN++;
    var fx = h.x, fy = h.y;
    var pdx = fx - tr.x, pdy = fy - tr.y;
    var pd = Math.sqrt(pdx * pdx + pdy * pdy) || 1;
    var lead = (pd / spd) * 0.55;
    fx += d.hvx * lead; fy += d.hvy * lead;
    var baseAng = Math.atan2(fy - tr.y, fx - tr.x);
    //  세 발마다 부채꼴(±0.24rad) — 옆걸음 회피를 좁힌다. 나머지는 단발 예측탄.
    var fans = (d.shotN % 3 === 0) ? [-0.24, 0, 0.24] : [0];
    for (var fi = 0; fi < fans.length; fi++) {
      var fa = baseAng + fans[fi];
      st.projectiles.push({
        x: tr.x, y: tr.y, vx: Math.cos(fa) * spd, vy: Math.sin(fa) * spd,
        damage: dodgeDmg,
        side: 'strategist', radius: 7 * ws, life: 5200, owner: null, hitSet: [], big: true
      });
    }
  }

  //  투석 폭격 — 15초부터 4.5초마다, 영웅 예측 지점 주변에 예고 원 3개(투석꾼 문법).
  //  예고 900ms 를 보고 걸어 나가면 피해진다 — 직선탄을 피하는 동선을 꺾게 만든다.
  if (st.elapsed > 15000) {
    d.nextBomb -= dt;
    if (d.nextBomb <= 0) {
      d.nextBomb = 4500;
      var bombR = 74 * ws;
      for (var bi = 0; bi < 3; bi++) {
        var bx2 = h.x + d.hvx * 0.5 + (Math.random() - 0.5) * 170 * ws;
        var by2 = h.y + d.hvy * 0.5 + (Math.random() - 0.5) * 130 * ws;
        var A3 = GAME.CONFIG.ARENA;
        bx2 = Math.max(A3.x + 20, Math.min(A3.right - 20, bx2));
        by2 = Math.max(A3.y + 20, Math.min(A3.bottom - 20, by2));
        st.effects.push({
          kind: 'telegraph', x: bx2, y: by2, r: bombR,
          t: 900 + bi * 160, total: 900,
          damage: Math.round(dodgeDmg * 1.4), side: 'strategist', owner: null
        });
      }
    }
  }

  //  금화 — 주기적으로 바닥에 떨어지고 9초 뒤 사라진다. 주우러 가는 발걸음이
  //  곧 위험이다("버틸 때마다 골드가 바닥에서 계속 나오는 거지").
  d.nextCoin -= dt;
  if (d.nextCoin <= 0) {
    d.nextCoin = 2100;
    var A2 = GAME.CONFIG.ARENA, m = 70;
    d.coins.push({
      x: A2.x + m + Math.random() * (A2.w - m * 2),
      y: A2.y + m + Math.random() * (A2.h - m * 2),
      born: st.elapsed,
      gold: Math.max(4, Math.round((GAME.TowerRun ? GAME.TowerRun.goldFor(this.tower) : 30)
                                   * 0.07 * (1 + st.elapsed / 45000)))
    });
  }
  for (var ci = d.coins.length - 1; ci >= 0; ci--) {
    var cn = d.coins[ci];
    if (st.elapsed - cn.born > 9000) { d.coins.splice(ci, 1); continue; }
    var cdx = h.x - cn.x, cdy = h.y - cn.y;
    if (cdx * cdx + cdy * cdy < 34 * 34) {
      var got = Math.round(cn.gold * (GAME.TowerChar ? GAME.TowerChar.luckGoldMul() : 1));
      if (GAME.TowerChar && GAME.TowerChar.exists()) GAME.TowerChar.addGold(got);
      d.gold += got;
      if (GAME.Sound) GAME.Sound.play('coin');
      var cl = GAME.UI.label(this, cn.x, GAME.Iso.toScreenY(cn.y) - 18, '+' + got,
        GAME.CONFIG.SMALL ? 14 : 16, GAME.CONFIG.COLORS.accent, 0.5).setOrigin(0.5).setDepth(60);
      if (this.worldLayer) this.worldLayer.add(cl);
      this.tweens.add({ targets: cl, y: cl.y - 26, alpha: 0, duration: 700,
        onComplete: function () { cl.destroy(); } });
      d.coins.splice(ci, 1);
    }
  }

  //  그리기 — 포탑(쇠뇌 진지 아트 재사용, 영웅을 향해 조준)과 금화.
  if (!g || !g.scene) return;
  g.clear();
  var nest = GAME.UNITS.mgnest;
  for (var ti2 = 0; ti2 < d.turrets.length; ti2++) {
    var t2 = d.turrets[ti2];
    var sy = GAME.Iso.toScreenY(t2.y);
    g.fillStyle(0x000000, 0.20);
    g.fillEllipse(t2.x, sy + 4, 34, 13, 10);
    try {
      GAME.UI.drawUnitFlat(g, nest, t2.x, sy, GAME.CONFIG.COLORS.strategist, 1, 0.95,
                           Math.atan2(h.y - t2.y, h.x - t2.x), 0, 0);
    } catch (e) { g.fillStyle(0x8a4b2d, 1); g.fillCircle(t2.x, sy, 12); }
  }
  var blink = Math.sin(st.elapsed / 220) * 0.5 + 0.5;
  for (var ci2 = 0; ci2 < d.coins.length; ci2++) {
    var c2 = d.coins[ci2];
    var cy2 = GAME.Iso.toScreenY(c2.y);
    var age = st.elapsed - c2.born;
    var fade = age > 7000 ? (0.35 + blink * 0.65) : 1;   // 사라지기 전 깜빡임
    g.fillStyle(0x000000, 0.18 * fade);
    g.fillEllipse(c2.x, cy2 + 4, 16, 6, 8);
    g.fillStyle(0xd9a13c, fade); g.fillCircle(c2.x, cy2, 8);
    g.fillStyle(0xffd166, fade); g.fillCircle(c2.x, cy2 - 1, 6);
    g.fillStyle(0xfff3c4, fade * 0.9); g.fillCircle(c2.x - 2, cy2 - 3, 2);
  }
};

GAME.BattleScene.prototype.updateHud = function () {
  var C = GAME.CONFIG.COLORS;
  var h = this.hero;
  var TOTAL = this.state.dodgeMode
    ? (this.state.dodgeUntil || 45000) / 1000
    : (this.state.coop ? (this.state.coopTimeMs || 180000) / 1000 : GAME.CONFIG.BATTLE_TIME);
  var remain = Math.max(0, TOTAL - this.state.elapsed / 1000);
  if (this._coopBar) this._updateCoopHud();

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
    hpText:     h.alive ? (GAME.UI.numAbbr(Math.ceil(h.hp)) + ' / ' + GAME.UI.numAbbr(h.maxHp)) : '전사',
    shieldText: h.shield > 0 ? ('보호막 +' + Math.ceil(h.shield)) : '',

    timeFrac:   TOTAL ? remain / TOTAL : 0,
    timeText:   remain.toFixed(1) + '초',
    timeLow:    remain < 15,

    enemyText:  '남은 적 ' + GAME.Combat.aliveCount(this.state, 'strategist') + '기',

    bossName:   bossAlive ? bossU.def.name : '보스 처치',
    bossFrac:   (bossAlive && bossU.maxHp) ? bossU.hp / bossU.maxHp : 0,
    bossText:   bossAlive ? (GAME.UI.numAbbr(Math.ceil(bossU.hp)) + ' / ' + GAME.UI.numAbbr(bossU.maxHp)) : '처치'
  });

  //  ── 긴장 겹(시즌2 S-S) — 영웅 체력이 깎일수록·보스가 2페이즈 이후면 tense 레이어를 올린다.
  //  250ms 스로틀(램프 0.6초라 더 자주 불러도 뜻이 없다). 전투 곡이 도는 판(playBattle)에서만.
  if (GAME.Music && GAME.Music._battle && GAME.Music.setLayer) {
    var _tn = (GAME.Iso && GAME.Iso.now) || 0;
    if (_tn - (this._tenseAt || 0) >= 250) {
      this._tenseAt = _tn;
      var _hf = (h.alive && h.maxHp) ? h.hp / h.maxHp : 0;
      var _bp = (bossAlive && bossU._phaseIdx > 0) ? 0.6 : 0;
      GAME.Music.setLayer('tense', Math.max(1 - _hf, _bp), 0.6);
    }
  }

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

//  ── 배경 굽기 (2026-08-03) ──────────────────────────────────────────────────
//  전투 배경(바닥·바이옴 소품·원근 밴드·격자·테두리)은 전투 내내 불변이다.
//  한 번 RenderTexture 에 그려 두고 그 뒤로는 텍스처 한 장만 붙인다.
//
//  ⚠ 깊이 순서가 생명이다. 배경은 `this.g`(전장 그림 전부)보다 **뒤**에 있어야
//    하고, PC 휠 줌은 `worldLayer` 의 스케일로 일어나므로 배경도 **같은 레이어
//    안에** 들어가야 한다 — 밖에 두면 줌할 때 배경만 안 따라와 어긋난다.
//  ⚠ 창 크기가 바뀌면 아레나 좌표가 달라지므로 다시 구워야 한다.
GAME.BattleScene.prototype._bakeArena = function () {
  this._arenaBaked = true;
  var Iso = GAME.Iso, R = Iso.screenRect();
  var w = Math.max(1, Math.ceil(this.scale.width));
  var h = Math.max(1, Math.ceil(this.scale.height));
  try {
    if (this._arenaRT) { this._arenaRT.destroy(); this._arenaRT = null; }
    var rt = this.add.renderTexture(0, 0, w, h).setOrigin(0, 0);
    var tmp = this.make.graphics({ x: 0, y: 0, add: false });
    GAME.UI.drawArena(tmp, {
      zones: false,
      floor: this.tower || this.defendTower || 0,
      //  수성전인지 알려 준다 — 배경이 '지키는 싸움'의 물건(방어벽·침입구)을 그린다.
      defend: !!this.defendTower,
      tier: this.versus ? 1 : GAME.UI.tierForEscalation(this.escalation).i
    });
    rt.draw(tmp);
    tmp.destroy();
    //  `this.g` 보다 뒤. 같은 컨테이너에 넣되 **맨 앞**(=가장 아래)로 보낸다.
    if (this.worldLayer) { this.worldLayer.add(rt); this.worldLayer.sendToBack(rt); }
    else rt.setDepth((this.g.depth || 0) - 1);
    this._arenaRT = rt;
  } catch (e) {
    //  RenderTexture 가 안 되는 환경이면 **예전처럼 매 프레임 그린다.**
    //  최적화가 실패해도 화면이 비면 안 된다.
    if (window.console) console.warn('[battle] 배경 굽기 실패 — 매 프레임 그리기로 되돌린다', e);
    this._arenaRT = null;
    this._arenaFallback = true;
  }
};

GAME.BattleScene.prototype.draw = function () {
  var C = GAME.CONFIG.COLORS;
  var Iso = GAME.Iso;
  var g = this.g;
  var s = this.state;
  var i;

  g.clear();
  //  무기 이미지 유령 스윕은 매 프레임 다시 그리는 이 화면에서만 무장한다(gearbank 주석).
  if (GAME.GearBank) GAME.GearBank.begin();
  // 층 분위기 — 통곡의 탑/수성의 탑은 층수로, 층이 없는 모드는 등급으로 바닥이 갈린다.
  // 대전(비동기 PvP)만 중립(밴드 1 풀숲)이다 — 남의 기지를 치는 것이지 탑이 아니다.
  //
  //  ⚠ **이 배경은 전투 내내 한 픽셀도 안 변한다.** 그런데 예전에는 매 프레임
  //    다시 그렸다 — 바이옴 소품 수십 개(하나당 도형 2~5개) + 원근 밴드 6장 +
  //    격자선 + 테두리. 프로파일 상위가 전부 `batchFillPath`/`batchLine` 이었던
  //    이유가 이것이다(2026-08-03 사용자 신고: "액션이 겹치면 프레임저하").
  //    그래서 **한 번만 구워** 텍스처로 붙인다. 매 프레임 수백 번의 경로 연산이
  //    드로우콜 하나가 된다. `_bakeArena` 가 굽고 여기서는 아무것도 안 한다.
  if (!this._arenaBaked) this._bakeArena();
  if (this._arenaFallback) {
    GAME.UI.drawArena(g, {
      zones: false,
      floor: this.tower || this.defendTower || 0,
      //  수성전인지 알려 준다 — 배경이 '지키는 싸움'의 물건(방어벽·침입구)을 그린다.
      defend: !!this.defendTower,
      tier: this.versus ? 1 : GAME.UI.tierForEscalation(this.escalation).i
    });
  }

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

  // 용 보스 텔레그래프 원소색 — `owner.def.art` 가 `beast:종류:결` 이면 그
  // 결의 발광색(`BA.TONE[결].glow`)을 돌려준다. 계란 유닛·영웅 스킬 등
  // `art` 가 없거나 형식이 다르면 null(호출부가 기존 진영색으로 대체한다).
  function bossGlowOf(e) {
    var u = e.owner;
    if (!u || !u.def || typeof u.def.art !== 'string') return null;
    var info = GAME.BossArt && GAME.BossArt.parse && GAME.BossArt.parse(u.def.art);
    return (info && info.tone && info.tone.glow) || null;
  }

  // ── 스킬 이펙트 A/B 시안 (js/skillfx.js) ─────────────────────────────
  //  파일이 없거나 꺼져 있으면 FXS 가 null 이 되고, 아래 네 루프는 **예전 그림 그대로**
  //  돈다. 위임 규칙은 전부 "true 를 돌려준 것만 건너뛴다" 하나뿐이라,
  //  시안이 모르는 kind(검기·회복·차단·노른자·구체)는 자동으로 원래 코드로 떨어진다.
  var FXS = (GAME.SkillFX && GAME.SkillFX.begin) ? GAME.SkillFX.begin(g, FX, this) : null;

  //  근접 평타 참격 — `_juice` 가 쌓아 둔 렌더 전용 목록을 여기서 비운다.
  //  ⚠ `begin()` **뒤**여야 한다(S.g 가 그때 꽂힌다). 앞에 두면 조용히 아무 일도 안 한다.
  //  ⚠ 유닛보다 **먼저** 그린다 — 참격이 영웅을 덮으면 내가 어디 있는지 안 보인다.
  if (FXS && FXS.swing && this._swings) {
    for (var swi = 0; swi < this._swings.length; swi++) {
      var sg = this._swings[swi];
      FXS.swing(sg.x, sg.y, sg.ang, sg.r, Math.max(0, sg.t / sg.total), sg.key);
    }
  }

  // ── 실시간 맵 지형 (js/rtmaps.js) — 유닛·이펙트보다 먼저(지면) ──
  if (s.rtMap) this._drawRtMap(g, s.rtMap);

  // ── 전장 규칙 지면 겹 (시즌2 S-A) — 늪 구역·용암 링·지진 예고/균열·용암 불티 ──
  //  반환의 shake 는 지진 충격(fieldFx quake) 감쇠값 — 카메라를 그만큼 흔든다(렌더 전용).
  var tRender = (GAME.Iso && GAME.Iso.now) || this.time.now || 0;
  if (FXS && FXS.drawField) {
    var fOut = FXS.drawField(g, s, tRender, Iso, 'ground', this._fieldOptsFor());
    if (fOut && fOut.shake > 0.03 && this.cameras && this.cameras.main) {
      this.cameras.main.shake(80, 0.002 + fOut.shake * 0.007);
    }
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
    if (FXS && FXS.drawTrap(tr, tr.side === 'controller' ? C.controller : C.strategist)) continue;
    g.fillStyle(FX.trap, 0.12 * FA);
    GAME.UI.groundCircleFill(g, tr.x, tr.y, tr.radius);
    ringInk(tr.x, tr.y, tr.radius, 2, FX.trap, 0.85 * RA);
  }

  for (i = 0; i < s.effects.length; i++) {
    var e = s.effects[i];
    // 영웅이 쓴 스킬이면 **그 영웅의 색**으로 그린다(불·바람·대지). 진영색 하나로는
    // 세 영웅의 스킬이 구분이 안 됐다 — ui-theme.js 의 `FX.heroFx` 주석 참조.
    // 용 보스도 같은 문제를 겪는다(2026-08-02 세계관 검토서 제안) — 지금은 전부
    // 진영색 하나뿐이라 서리·폭풍·불(ash/ember) 보스가 텔레그래프로는 안 갈린다.
    // 새 색 표를 또 만들지 않는다 — `js/bossart.js` 의 `BA.TONE[결].glow` 를
    // 그대로 재사용한다(결마다 이미 정해진 색이 있다: ash 주황·frost 하늘색·
    // storm 노랑·ember 주황). 표가 두 벌이 되면 조용히 갈라진다.
    var col = (e.heroKey && FX.heroFx && FX.heroFx[e.heroKey])
      ? FX.heroFx[e.heroKey]
      : (bossGlowOf(e) || (e.side === 'controller' ? C.controller : C.strategist));
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
      //  이미지 임팩트(a-3 시트) — 벡터 판정 그림 위에 얹는 질감 한 겹(2026-08-22).
      if (GAME.GearBank) {
        GAME.GearBank.place(g, 'impact', e.x, Iso.toScreenY(e.y),
          e.r * 2.0 * bx, e.r * 2.0 * bx, Math.min(0.85, b2 * 1.1), FX.blast, true);
      }
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
      //  이미지 링(a-3 시트) — 지면에 눕혀(TILT) 가산으로 얹는다(2026-08-22).
      if (GAME.GearBank) {
        var rw2 = e.r * 2.35 * (1.15 - r2 * 0.15);
        GAME.GearBank.place(g, 'ring', e.x, Iso.toScreenY(e.y),
          rw2, rw2 * Iso.TILT, Math.min(0.7, r2 * 0.9), col, true);
      }

    } else if (e.kind === 'slash') {
      if (GAME.Iso.rtFlip) e = Object.assign({}, e, { angle: -e.angle });
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
      if (GAME.Iso.rtFlip) e = Object.assign({}, e, { angle: -e.angle });
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
      //  이미지 참격(a-3 시트) — 진행 방향에 직교로 눕힌 흰 붓질 아크(2026-08-22).
      //  ⚠ 금속 낫(slash2)은 뺐다(태현님: "서로 다르지 않은가 — 어울리는 것만 남겨라").
      //    뼈·돌 무기의 세계에서 금속 낫 재질은 혼자 딴 게임이었다. 강타는 같은
      //    아크를 더 크게 — 재질은 하나, 크기가 무게를 말한다.
      if (GAME.GearBank) {
        var swL = e.range * (e.charged ? 1.6 : 1.2);
        var swdx = -Math.sin(e.angle) * swL / 2;
        var swdy = Math.cos(e.angle) * swL / 2 * Iso.TILT;
        GAME.GearBank.drawSpan(g, 'slash',
          wx + swdx, wy + swdy, wx - swdx, wy - swdy,
          Math.min(0.9, wAlpha), false);
      }
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
      //  ── 약초 잎이 위로 떠오른다 (2026-08-07) ──────────────────────────────
      //  ⚠ `healPulse` 는 `SkillFX._drawEffectInner` 가 false 를 돌려주는 kind 라
      //    재료(motif)를 붙여도 그 파일이 안 읽는다. 그래서 여기서 층을 하나 더 얹는다
      //    — **새 kind 를 만들지 않는다**(렌더러가 모르는 kind 는 조용히 안 그려진다).
      //  ⚠ 약초꾼 능력(healBurst)일 때만이다. 상시 회복(`healRadius`)까지 잎을 띄우면
      //    1초마다 화면에 잎이 깔려 예고 원을 가린다 — 이 게임 제1규율(바닥이 시끄러우면
      //    회피가 안 된다)에 걸린다. `owner` 는 combat 의 `_withAbilFx` 가 심는다.
      var _hb = e.owner && e.owner.def && e.owner.def.ability &&
                e.owner.def.ability.type === 'healBurst';
      if (_hb) {
        var hly = Iso.toScreenY(e.y), hsd = (e.x * 7.31 + e.y * 13.07) % 6.2832;
        for (var hl = 0; hl < 3; hl++) {
          var hla = hsd + (Math.PI * 2 / 3) * hl;
          var hlx = e.x + Math.cos(hla) * e.r * 0.58;
          var hlyy = hly + Math.sin(hla) * e.r * 0.58 * Iso.TILT - 6 - (1 - ha) * 26;
          if (INKA > 0) { g.fillStyle(INK, ha * 0.5 * INKA); g.fillEllipse(hlx, hlyy, 11, 7.5, 8); }
          g.fillStyle(hl === 1 ? GAME.UI.MAT.leafDark : GAME.UI.MAT.leaf, ha * 0.95);
          g.fillEllipse(hlx, hlyy, 9, 5.5, 8);
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

  // 영웅 오라 — 링을 두 겹(잉크 + 색)으로 두르고 안쪽 면은 옅게.
  // 밝은 목초지에서 0.10 알파 면은 아예 안 보였다 → 경계선이 오라를 대신 알려준다.
  //  ⚠ 색은 진영색이 아니라 **영웅 고유색**(불/바람/대지) — 진영 파랑으로 두면
  //    선택 링·발밑 링·조준 링과 파란 동심원 4겹이 되어 뜻이 안 갈렸다
  //    (2026-08-20 태현님 "오라 가독성" 지적의 실측 원인).
  var auCol = (FX.heroFx && FX.heroFx[this.hero.def.key]) || C.controller;
  for (i = 0; i < this.hero.auras.length; i++) {
    var au = this.hero.auras[i];
    if (FXS && FXS.drawAura(this.hero, au, auCol)) continue;
    g.fillStyle(auCol, Math.min(0.22, 0.10 * FA));
    GAME.UI.groundCircleFill(g, this.hero.x, this.hero.y, au.radius);
    ringInk(this.hero.x, this.hero.y, au.radius, 2.5, auCol, 0.65 * RA);
    //  (2026-08-22) 마법진 이미지(shieldaura)를 얹었다가 **뺐다** — 태현님 판정대로
    //  파란 판타지 마법진은 원시 부족의 흙·먼지 문법과 딴 게임이었다. 재생성 대상.

  }

  // ── 유닛: 뒤(위)에서 앞(아래) 순으로 그려 겹침이 자연스럽게 ──
  var alive = [];
  for (i = 0; i < s.units.length; i++) if (s.units[i].alive) alive.push(s.units[i]);
  //  반전 화면에서는 앞뒤가 뒤집힌다 — 정렬도 같이 뒤집어야 겹침이 자연스럽다.
  alive.sort(GAME.Iso.rtFlip ? function (a, b) { return b.y - a.y; }
                             : function (a, b) { return a.y - b.y; });

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

  // 내 편은 어느 쪽인가 — 가시덫을 숨길지 판단하는 기준이다.
  // (`_heroIsPlayer` 는 방어전에서 뒤집힌다: 거기서는 영웅이 적이고 내가 전략가다.)
  var myMineSide = ((this._heroIsPlayer === undefined) ? true : this._heroIsPlayer)
    ? 'controller' : 'strategist';
  //  은신 판정의 '내 편' — 실시간은 내 팀(rt.meTeam), 그 외는 가시덫과 같은 기준.
  var stealthSide = (this.rt && this.rt.meTeam) ? this.rt.meTeam : myMineSide;

  for (i = 0; i < alive.length; i++) {
    var u = alive[i];
    var color = GAME.UI.sideColor(u.side);
    if (u.flash > 0) color = 0xffffff;

    // ── 남의 가시덫은 **보이지 않는다** (2026-08-01 사용자 지시) ─────────────────
    //  "지뢰는 상대방 눈에 안 보이게 하고, 대신 밟으면 …"
    //  밟기 전까지는 유닛도 링도 안 그린다. **도화선이 켜지면**(u.fuse >= 0) 그때부터
    //  폭발 범위를 크게 보여준다 — 그 원이 곧 "여기서 나가라"는 유일한 안내다.
    //  ⚠ 내 가시덫(대전·수성의 탑에서 내가 놓은 것)은 그대로 보인다. 내가 놓은 함정의
    //    위치를 나도 모르면 배치라는 행위 자체가 성립하지 않는다.
    if (u.def.isMine && u.side !== myMineSide) {
      var armed = (u.fuse !== undefined && u.fuse >= 0);
      if (!armed) continue;                        // 안 밟았으면 통째로 안 그린다
      // 도화선 진행도(1 → 0). 남을수록 옅고, 터지기 직전에 가장 진하다.
      var fp = 1 - Math.max(0, u.fuse) / (u.def.fuseMs || 450);
      g.fillStyle(FX.mineRing, 0.10 + 0.22 * fp);
      GAME.UI.groundCircleFill(g, u.x, u.y, u.def.blastRadius);
      g.lineStyle(3, FX.mineRing, 0.55 + 0.45 * fp);
      GAME.UI.groundCircle(g, u.x, u.y, u.def.blastRadius);
      // 안쪽에서 바깥으로 차오르는 링 — 남은 시간이 눈으로 읽힌다.
      g.lineStyle(2, FX.mineRing, 0.85);
      GAME.UI.groundCircle(g, u.x, u.y, u.def.blastRadius * fp);
      continue;                                    // 함정 본체는 끝까지 안 보인다
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
    // ⚠ `this._dt || 16` 은 **히트스톱을 무시한다.** 히트스톱 중에는 위 697행이
    //   `this._dt = 0` 으로 두는데 `0 || 16` 은 16 이라, 시뮬이 멎은 프레임에도
    //   애니메이션만 계속 흘렀다. 걸음걸이는 45ms 라 눈에 안 띄었지만 **공격 모션은
    //   타격 순간과 히트스톱이 정확히 겹치므로** 거기서는 진짜로 보인다.
    var fdt = this._frameDt();
    var walk = GAME.UI.updateGait(u, fdt);
    // 전투 모션 — 영웅과 **전략 유닛**(2026-08-07 확대). 렌더 전용 관측자라
    // combat 을 읽기만 하고 한 줄도 안 바꾼다.
    var act = GAME.UI.updateAct(u, fdt);

    //  ── 정련(수성의 탑)이 무기에 실린다 (2026-08-07) ────────────────────────
    //  ⚠ `def` 에는 정련 표식이 없다 — `js/scenes/defend.js` 가 `refineMods` 로 hp/damage
    //    에 곱하기만 하고 def 에 아무것도 안 남긴다. 그래서 **호출부가 조회해서 넘긴다.**
    //  ⚠ **유닛당 한 번만** 읽는다. `DefendTower.refineOf` 는 `get()` → 저장소 읽기라
    //    매 프레임 부르면 한 프레임에 저장소를 20번 두드리게 된다.
    //  ⚠ `u.type` 은 원본 키가 아닐 수 있다(탑 정예 파생 `shieldman#6+charge`) —
    //    `UnitLevel.baseKeyOf` 로 되돌려야 한다. 이 저장소가 로딩 공략에서 이미 겪은
    //    사고의 같은 얼굴이다(안 되돌리면 조용히 undefined → 0 이 된다).
    if (u._rfStep === undefined) {
      u._rfStep = 0;
      if (this.defendTower && u.side === 'strategist' &&
          GAME.DefendTower && GAME.DefendTower.refineOf) {
        var _bk = GAME.UnitLevel ? GAME.UnitLevel.baseKeyOf(u.type) : u.type;
        u._rfStep = GAME.DefendTower.refineOf(_bk) || 0;
      }
    }
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
    //  반전 화면에서는 바라보는 방향의 세로 성분도 거울이어야 한다 — 안 뒤집으면
    //  위로 걸어가는 유닛이 아래를 보며 걷는다(각 부호 반전 = y 성분만 거울).
    var drawFacing = GAME.Iso.rtFlip ? -u.facing : u.facing;
    //  은신 알파(시즌2 S-A) — 내 편(내 팀)은 반투명 일렁임, 적 눈에는 0.10. 은신이 아니면 정확히 1.
    var uAlpha = (FXS && FXS.stealthAlpha && u.buffs && u.buffs.length)
      ? FXS.stealthAlpha(u, tRender, u.side === stealthSide) : 1;
    var pos = GAME.UI.drawUnit(g, u.def, u.x + dx, u.y + dy, color, uAlpha, drawFacing, walk,
                               undefined, { footRing: false, sizeMul: u.eliteDraw || 1,
                                            act: act, gearTier: u._gearTier, kit: u._kit,
                                            refine: u._rfStep,
                                            //  보스 생동화(2026-08-22) — 공격 위상 읽기용 렌더 참조
                                            unit: u });

    //  ── 방어 태세 표시 (2026-08-03) ──────────────────────────────────────────
    //  "때리면 안 되는 시간"을 **글자 없이** 알려야 한다. 두 단계로 보여준다:
    //    예고(warn) — 노란 링이 빠르게 조여든다 → "곧 들어간다, 손 떼라"
    //    태세(on)   — 두꺼운 링이 유닛을 감싼다 → "지금 때리면 반사다"
    //  ⚠ 이 표시가 없으면 반사는 그냥 함정이다(용의 알 껍질 깨기에서 이미 배운 것:
    //    큰 피해가 문제가 아니라 '못 피하는' 것이 문제다).
    if (pos && u.def && u.def.guard && u._guardPhase && u._guardPhase !== 'idle') {
      var gOn = (u._guardPhase === 'on');
      var gr = (u.def.radius || 20) * 2.05;
      var gt = (GAME.Iso && GAME.Iso.now) || 0;
      if (gOn) {
        // 태세 — 굵은 고리 + 은은한 맥동
        var pulse = 1 + Math.sin(gt / 130) * 0.05;
        g.lineStyle(5, 0xffd257, 0.95);
        g.strokeEllipse(pos.sx, pos.sy, gr * 2 * pulse, gr * 2 * pulse * GAME.Iso.TILT);
        g.lineStyle(2, 0x8a5a12, 0.85);
        g.strokeEllipse(pos.sx, pos.sy, gr * 2.28 * pulse, gr * 2.28 * pulse * GAME.Iso.TILT);
      } else {
        // 예고 — 바깥에서 안으로 조여드는 고리(남은 시간이 그대로 보인다)
        var gdef = u.def.guard;
        var total = (gdef.warn === undefined ? 900 : gdef.warn);
        var left = Math.max(0, Math.min(1, (u._guardT || 0) / total));
        var rr = gr * (1 + left * 1.5);
        g.lineStyle(3, 0xffd257, 0.35 + (1 - left) * 0.6);
        g.strokeEllipse(pos.sx, pos.sy, rr * 2, rr * 2 * GAME.Iso.TILT);
      }
    }

    // 껍질 금 + 피격 번쩍 — 체력을 '읽지 않고 보게' 한다
    // ⚠ **여기 가드가 틀려 있었다** (2026-07-30 실측). 옛 코드는 `!GAME.isNonTarget(u.def)`
    //   였는데 그 함수는 "공격 방식이 targeted 인가"를 묻는 것이고 그건 **투창병 한 기뿐**이다
    //   (게임 전체에서 `attack:'targeted'` 1건). 즉 "체력이 줄면 껍질에 금이 간다"는 이 게임의
    //   문법이 **투창병에게만 작동하고 있었다**(호출 1 → 14 로 회복).
    //   원인은 이름이 "조준 대상이 아니다"로 읽히는 것이었고, 그래서 그 함수는 뜻대로
    //   `GAME.isAutoHit` 으로 뒤집어 이름을 바꿨다(units.js 주석 참조).
    //   금이 필요 없는 것은 '체력 개념이 없는 지면 고정물'이므로 아트로 판정한다.
    if (pos && GAME.UI.eggDamage && !GAME.UI.artOf(u.def).ground && u.def.art !== 'goldegg') {
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

    //  보스 발밑 상시 이중 고리는 **제거했다** (2026-08-23 태현님: "발옆에 실선으로
    //  남아있는 효과 잔상 깔끔하게 없애줘"). 인트로·크기·이름표가 이미 정체를 말하고,
    //  상시 링은 이펙트 잔상처럼 읽혔다. 정예 링(작은 유닛 구분용)은 남긴다.

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
      //  황금알(noHpBar): 체력바 대신 균열 5단계가 상태를 말한다(태현님 지시).
      noBar: !!u.def.noHpBar,
      ratio: u.hp / u.maxHp,
      shield: u.shield > 0 ? Math.min(1, u.shield / u.maxHp) : 0,
      unit: u                    // 시즌2 표식·소환 수명·페이즈 링이 오버레이에서 읽는다
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
    if (marks[i].noBar) continue;   // 황금알 — 균열 5단계가 체력바를 대신한다
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

  // ── ⑤ 시즌2 표식 (S-A) — 표식 부적(머리 위) · 소환수 수명 호(발밑) · 보스 페이즈 링 ──
  //  전부 오버레이 층이다 — 몸통이 덮으면 "찍혔다"를 못 본다. 좌표는 marks 의 값(휘청임 반영).
  if (FXS) {
    for (i = 0; i < marks.length; i++) {
      var mk3 = marks[i], mu = mk3.unit;
      if (!mu) continue;
      if (mu._markUntil && mu._markUntil > s.elapsed && FXS.drawMark) {
        FXS.drawMark(g, mk3.sx, mk3.by - (mk3.mine ? 14 : 4), mk3.r, tRender);
      }
      if (mu.summoned && mu.lifeMs > 0 && FXS.lifeRing) FXS.lifeRing(g, mu, mk3.wx, mk3.wy, mk3.r);
      if (mu._phaseIdx !== undefined && mu._phaseIdx >= 0 && FXS.phaseRing) FXS.phaseRing(g, mu, mk3.wx, mk3.wy, mk3.r, tRender);
    }
  }

  // ── 동전 ──
  //  유닛 **뒤**가 아니라 앞에 그린다. 동전은 유닛이 죽은 자리에 떨어지므로 뒤에 그리면
  //  다음 유닛이 그 위에 서는 순간 통째로 가려진다 — 주우라고 만든 물건이 안 보인다.
  //  대신 지면 그림자를 함께 찍어 '떠 있는 것'이 아니라 '바닥에 놓인 것'으로 읽히게 했다.
  //  표시객체는 0개다 — 전부 이 Graphics 한 장에 들어간다.
  if (this._coins) this._coins.draw(g, this._frameDt());
  this._drawOrbs(g);
  this._drawHealZones(g);
  this._drawEmberZones(g);

  // ── 투사체 ──
  //  "모든 공격은 눈에 보이는 투사체를 갖는다"가 이 게임의 규칙인데, 라이트 테마에서는
  //  기존 색(민트 #7ef0d0 1.16:1 / 살구 #ffb06a 1.12:1)이 들판에 그대로 녹아
  //  그 규칙이 무너져 있었다. 몸통을 잉크 톤으로 내리고 **심지를 밝게** 남겨
  //  '작지만 뜨거운 것이 날아온다'를 유지한다.
  for (i = 0; i < s.projectiles.length; i++) {
    var p = s.projectiles[i];
    var pcol = p.side === 'controller' ? FX.projController : FX.projStrategist;
    //  적 투사체 = 위험 신호 (2026-08-21 태현님 "적 투사체 가시성"). 따뜻한 배경에
    //  주황 계열이 묻힌다 — 잉크 링 + 흰 심 + 진한 글로우로 실루엣을 세운다.
    var danger = p.side !== 'controller';
    // 스킬 투사체(big)만 시안이 가져간다 — 유닛 평타 화살은 예전 그림 그대로다.
    if (FXS && FXS.drawProjectile(p, pcol)) continue;

    // ── 주술사 마법구체 (2026-09-03) ────────────────────────────────────────
    //  def.projStyle:'orb' 인 평타 전용(js/combat.js 의 발사 코드가 플래그를 싣는다).
    //  화살촉·깃 실루엣을 그리는 아래 분기를 건너뛰고 발광구 하나로 그린다 —
    //  주술사는 "마법사 개념"이라 화살이 아니라 순수한 빛의 구체여야 한다.
    //  색은 진영색(pcol)이 아니라 신비로운 보라 톤(FX.heroFx.shaman) — 새 색을
    //  만들지 않고 이미 쓰는 전략가 보라 계열(#b3a8ff, ui-theme.js accentAlt)과
    //  같은 톤을 골랐다. 판정(radius·damage)은 위 발사 코드와 완전히 같다 — 렌더 전용.
    if (p.orb) {
      var osx = p.x, osy = Iso.toScreenY(p.y) - 12;
      var orr = p.radius * (p.big ? 1.5 : 1) + 3;
      var ocol = (FX.heroFx && FX.heroFx.shaman) || 0xb3a8ff;
      var osp = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1;
      var oux = p.vx / osp, ouy = (p.vy / osp) * Iso.TILT;
      // 지면 그림자 — 다른 투사체와 같은 언어(떠 있는 게 아니라 지면 위를 난다)
      g.fillStyle(INKA > 0 ? INK : 0x000000, 0.14);
      g.fillEllipse(osx, osy + 10, orr * 2.0, orr * 2.0 * Iso.TILT);
      // 옅은 궤적(화살 잔상과 같은 역산 기법 — 상태에 필드를 안 만든다)
      g.lineStyle(Math.max(1.5, orr * 0.7), ocol, 0.16);
      g.lineBetween(osx - oux * 24, osy - ouy * 24, osx, osy);
      // 발광구 2~3겹 — 촉·깃 없이 순수 발광
      g.fillStyle(ocol, 0.22);
      g.fillCircle(osx, osy, orr * 2.1);
      g.fillStyle(ocol, 0.48);
      g.fillCircle(osx, osy, orr * 1.35);
      g.fillStyle(0xffffff, 0.88);
      g.fillCircle(osx, osy, orr * 0.5);
      continue;
    }

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
    //  ── 잔상 3점 (2026-08-04 사용자 요청: "화살과 날아가는 이펙트") ──────────
    //  빠른 투사체는 프레임 사이를 순간이동하는 것처럼 보인다. 진행 반대 방향의
    //  **직전 위치**에 점을 세 개 남기면 "어디서 와서 어디로 가는지"가 한 프레임에 읽힌다.
    //  ⚠ 렌더 전용이다 — `combat.js` 의 투사체 객체에 필드를 안 만든다. 속도 벡터로
    //    과거 위치를 **역산**하므로 히스토리를 보관할 필요도 없다(로직/렌더 분리).
    var ghost = [[0.85, 0.42, 0.030], [0.65, 0.24, 0.060], [0.42, 0.11, 0.090]];
    for (var gi2 = 0; gi2 < ghost.length; gi2++) {
      var gs = ghost[gi2];
      g.fillStyle(pcol, gs[1]);
      g.fillCircle(psx - ux * sp * gs[2], psy - uy * sp * gs[2], Math.max(1.2, (rr + 1) * gs[0]));
    }

    //  화살(비추적 투사체)에는 원형 글로우를 씌우지 않는다 — 2026-08-21 태현님
    //  "원형 모양 없애줘, 괜히 못생겼네". 촉·대·깃 실루엣이 이미 정체를 말한다.
    //  예광탄(tracer)은 점 그림이 정체성이라 그대로 둔다.
    if (p.tracer) {
      if (danger) {
        g.lineStyle(2.4, INKA > 0 ? INK : 0x1c1410, 0.85);
        g.strokeCircle(psx, psy, rr + 7);
      }
      g.fillStyle(pcol, danger ? 0.50 : 0.28);
      g.fillCircle(psx, psy, rr + 6);
      if (danger) {
        g.fillStyle(0xffffff, 0.9);
        g.fillCircle(psx, psy, Math.max(1.6, rr * 0.55));
      }
    }

    //  ── 화살촉 · 깃 (2026-08-04) ────────────────────────────────────────────
    //  예전에는 **색 점 하나**였다. 이 게임의 규율이 "모든 공격은 눈에 보이는
    //  투사체를 갖는다" 인데, 점은 '무엇이' 날아오는지는 말해주지 않는다.
    //  촉(앞) + 대(중간) + 깃(뒤) 셋이면 원시 부족의 화살이 된다.
    //  ⚠ 저격 예광탄(`tracer`)은 유도라 **곡선**으로 난다 — 방향이 계속 바뀌므로
    //    각진 촉을 붙이면 꺾여 보인다. 예광탄은 예전 점 그림 그대로 둔다.
    if (!p.tracer) {
      //  (2026-08-22) 불화살 이미지를 붙였다가 **뺐다** — 리얼풍 화풍이 벡터 화살과
      //  딴 게임이었다(태현님 판정). 붓질 화풍으로 재생성 후 다시 붙인다.
      var M2 = GAME.UI.MAT;
      var nx2 = -uy, ny2 = ux;
      var hl = rr + 5, hw = rr * 0.72 + 1.4;
      //  대 — 나무
      g.lineStyle(Math.max(1.6, rr * 0.42), M2.woodDark, 0.95);
      g.lineBetween(psx - ux * (rr + 9), psy - uy * (rr + 9), psx + ux * rr * 0.4, psy + uy * rr * 0.4);
      //  깃 — 뒤쪽 양옆
      g.fillStyle(M2.feather, 0.9);
      g.fillTriangle(psx - ux * (rr + 9), psy - uy * (rr + 9),
                     psx - ux * (rr + 3) + nx2 * hw * 0.9, psy - uy * (rr + 3) + ny2 * hw * 0.9,
                     psx - ux * (rr + 2), psy - uy * (rr + 2));
      g.fillTriangle(psx - ux * (rr + 9), psy - uy * (rr + 9),
                     psx - ux * (rr + 3) - nx2 * hw * 0.9, psy - uy * (rr + 3) - ny2 * hw * 0.9,
                     psx - ux * (rr + 2), psy - uy * (rr + 2));
      //  촉 — 돌. 잉크 한 겹을 뒤에 깔아 밝은 목초지에서도 실루엣이 남는다.
      if (INKA > 0) {
        g.fillStyle(INK, 0.5);
        g.fillTriangle(psx + ux * (hl + 1.2), psy + uy * (hl + 1.2),
                       psx + nx2 * (hw + 1.2), psy + ny2 * (hw + 1.2),
                       psx - nx2 * (hw + 1.2), psy - ny2 * (hw + 1.2));
      }
      g.fillStyle(M2.stone, 1);
      g.fillTriangle(psx + ux * hl, psy + uy * hl,
                     psx + nx2 * hw, psy + ny2 * hw,
                     psx - nx2 * hw, psy - ny2 * hw);
      g.fillStyle(M2.stoneLite || M2.bone, 0.85);       // 갈아 놓은 날 — 좌상단 광원
      g.fillTriangle(psx + ux * hl * 0.92, psy + uy * hl * 0.92,
                     psx + nx2 * hw * 0.45, psy + ny2 * hw * 0.45,
                     psx, psy);
    } else {
      g.fillStyle(pcol, 1);
      g.fillCircle(psx, psy, rr + 1);
      g.fillStyle(FX.projCore, 0.95);
      g.fillCircle(psx - rr * 0.18, psy - rr * 0.18, Math.max(1.8, rr - 3));
    }
  }

  // ── 전장 규칙 위 겹 (시즌2 S-A) — 안개 마스크·바람 줄기·돌풍·규칙 교체 물듦·낙뢰 번쩍 ──
  //  유닛·투사체 **위**의 별도 Graphics. 매 프레임 비우고, 그릴 것이 있을 때만 맨 위로 올린다.
  if (this._overG) {
    var og = this._overG;
    og.clear();
    if (FXS && FXS.drawField) {
      var oOut = FXS.drawField(og, s, tRender, Iso, 'over', this._fieldOptsFor());
      if (oOut && this.worldLayer && og.parentContainer === this.worldLayer) this.worldLayer.bringToTop(og);
    }
  }

  if (this.state.over) {
    g.fillStyle(0x000000, 0.45);
    g.fillRect(0, 0, GAME.CONFIG.WIDTH, GAME.CONFIG.HEIGHT);
  }
};

//  ── 시즌2 렌더 보조 (2026-09-03 S-A) — 전부 렌더 전용, 시뮬·록스텝에 안 닿는다 ─────────

//  안개 시야의 초점 — 내가 모는 유닛(없으면 플레이어 영웅). 반지름은 아레나 폭 30% 와
//  실효 사거리×1.15 중 큰 쪽(원거리 영웅은 제 사거리만큼은 본다). 버퍼를 돌려 쓴다.
GAME.BattleScene.prototype._fieldOptsFor = function () {
  var o = this._fieldOpts;
  if (!o) o = this._fieldOpts = { focus: { x: 0, y: 0 }, sightR: 0 };
  var fu = this.arrowOn || (this._heroIsPlayer === false ? null : this.hero);
  if (!fu || !fu.alive) { o.focus = null; return o; }
  if (!o.focus) o.focus = { x: 0, y: 0 };
  o.focus.x = fu.x; o.focus.y = fu.y;
  var A = GAME.CONFIG.ARENA;
  var er = (GAME.Combat.effRange ? GAME.Combat.effRange(fu, this.state) : (fu.def.range || 0));
  o.sightR = Math.max(A ? A.w * 0.22 : 160, er * 1.1);
  return o;
};

//  페이즈 핑·전장 규칙 사건의 소리·흔들림·리본. **관측만 한다** — state 는 phasePing 을
//  소비(null)하는 것과 렌더 캐시 플래그(__sfx) 외에 안 건드린다(엔진 계약: ping 은 소비 후 null).
//  헤드리스(도구)에서는 GAME.Sound/Music 이 없을 수 있다 — 전부 가드.
GAME.BattleScene.prototype._seasonFx = function () {
  var s = this.state;
  if (!s) return;
  var Snd = GAME.Sound, Mus = GAME.Music, cam = this.cameras && this.cameras.main;
  var i;
  //  ① 보스 페이즈 진입 — 흔들림 + 이름 리본 + 스팅어 + 차징음
  if (s.phasePing) {
    var pp = s.phasePing; s.phasePing = null;
    if (cam) cam.shake(280, 0.007);
    if (Mus && Mus.sting) { try { Mus.sting('phaseShift'); } catch (e) {} }
    if (Snd) { try { Snd.play('bossCharge'); Snd.play('phaseShift'); } catch (e2) {} }
    var bossNm = (pp.unit && pp.unit.def && pp.unit.def.name) || '보스';
    this._seasonRibbon((pp.name ? pp.name : (bossNm + ' · ' + (pp.phase + 1) + '단계')), 0xff8c2e);
  }
  //  ② 전장 규칙 사건(fieldFx) — 처음 본 프레임에 한 번
  var fx = s.fieldFx;
  if (fx && fx.length) {
    for (i = 0; i < fx.length; i++) {
      var f = fx[i];
      if (!f.__sfx) {
        f.__sfx = true;
        if (f.kind === 'quake') {
          if (Snd) { try { Snd.play('quake'); } catch (e3) {} }
          if (cam) cam.shake(420, 0.009);
        } else if (f.kind === 'fieldShift') {
          var nm = GAME.BattleScene.FIELD_NAMES[f.field] || f.field;
          if (nm) this._seasonRibbon('전장 규칙 · ' + nm, 0xdfe8e4);
        } else if (f.kind === 'quakeWarn') {
          if (Snd) { try { Snd.play('bossCharge'); } catch (e4) {} }
        }
      }
      //  낙뢰 — 예고가 끝나는 순간(마지막 90ms)에 한 번
      if (f.kind === 'boltWarn' && !f.__bolt && f.t <= 90) {
        f.__bolt = true;
        if (Snd) { try { Snd.play('bolt'); } catch (e5) {} }
        if (cam) cam.shake(140, 0.004);
      }
    }
  }
  //  ③ 사슬이 옮겨 붙는 소리 — beam.chain 이펙트가 새로 생긴 프레임(hop 0 은 시전음이 맡는다)
  var ef = s.effects;
  if (ef && ef.length) {
    for (i = 0; i < ef.length; i++) {
      var e = ef[i];
      if (e.__sfx) continue;
      e.__sfx = true;
      if (e.kind === 'beam' && e.chain && e.hop > 0 && Snd) { try { Snd.play('chainHop'); } catch (e6) {} }
    }
  }
  //  ④ 표식 적중 — 표식이 살아 있는 유닛의 체력이 줄어든 프레임
  var us = s.units;
  for (i = 0; i < us.length; i++) {
    var u = us[i];
    if (u._markUntil && u._markUntil > s.elapsed && u.alive) {
      if (u.__mkHp !== undefined && u.hp < u.__mkHp - 0.01 && Snd) { try { Snd.play('markHit'); } catch (e7) {} }
      u.__mkHp = u.hp;
    } else if (u.__mkHp !== undefined) u.__mkHp = undefined;
  }
};

GAME.BattleScene.FIELD_NAMES = { fog: '안개', swamp: '늪', lava: '용암', quake: '지진', storm: '폭풍' };

//  화면 상단 리본 한 줄(1.5초) — 페이즈 이름·전장 규칙 교체. 타임 오버 연출과 같은 문법.
//  Text 하나뿐이라 겹침 감사 대상이 아니고, 끝나면 스스로 파괴된다.
GAME.BattleScene.prototype._seasonRibbon = function (text, color) {
  if (!this.add || !this.tweens) return;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT, P = GAME.CONFIG.SMALL;
  var hex = '#' + ('000000' + ((color === undefined ? 0xffffff : color) >>> 0).toString(16)).slice(-6);
  if (this._seasonRib && this._seasonRib.scene) { try { this._seasonRib.destroy(); } catch (e) {} }
  var txt = this.add.text(W / 2, H * (P ? 0.30 : 0.26), text, {
    fontFamily: GAME.CONFIG.FONT, fontSize: (P ? 26 : 34) + 'px', fontStyle: 'bold',
    color: hex, stroke: '#1a1208', strokeThickness: P ? 5 : 7
  }).setOrigin(0.5).setDepth(3001).setAlpha(0).setScale(1.6);
  this._seasonRib = txt;
  var self = this;
  this.tweens.add({ targets: txt, alpha: 1, scale: 1, duration: 260, ease: 'Back.easeOut' });
  this.tweens.add({ targets: txt, alpha: 0, y: txt.y - 18, delay: 1150, duration: 380,
    onComplete: function () { if (self._seasonRib === txt) self._seasonRib = null; try { txt.destroy(); } catch (e) {} } });
};


//  ── 실시간 편성 (2026-08-21) — 역할 조합 자유(혼합·컨vs컨; 전vs전은 다음 증분) ──
//  결정적 생성 순서: 팀 고정 순서(controller→strategist) × [진형 유닛들 → 영웅].
//  양쪽 클라이언트가 같은 rt.my/their 를 받아 같은 순서로 만들면 비트가 같다.
//  ── 실시간 맵 지형 그리기 (js/rtmaps.js, 2026-08-31 태현님 ④) ────────────────
//  판정은 combat.js 가 월드 좌표로 한다 — 여기는 그 사각형을 화면에 옮길 뿐이다.
//  ⚠ rtFlip(상하반전) 중에는 toScreenY(y) 가 아래 모서리를 줄 수 있다 —
//    iso.js screenRect 주석과 같은 함정. min/max 로 접는다.
GAME.BattleScene.prototype._drawRtMap = function (g, M) {
  var Iso = GAME.Iso, i, j;
  function sy(rc) {
    var y1 = Iso.toScreenY(rc.y), y2 = Iso.toScreenY(rc.y + rc.h);
    return { x: rc.x, y: Math.min(y1, y2), w: rc.w, h: Math.abs(y2 - y1) };
  }
  //  균열(낙사) — 어둠으로 꺼진 바닥 + 가장자리 균열선.
  for (i = 0; i < M.pits.length; i++) {
    var P = sy(M.pits[i]);
    g.fillStyle(0x120d08, 0.88); g.fillRect(P.x, P.y, P.w, P.h);
    g.lineStyle(2, 0x3a2c1c, 0.9); g.strokeRect(P.x + 1, P.y + 1, P.w - 2, P.h - 2);
  }
  //  가시밭 — 이끼빛 바닥 + 가시 삼각형(좌표에서 결정적으로 배치).
  for (i = 0; i < M.thorns.length; i++) {
    var T = sy(M.thorns[i]);
    g.fillStyle(0x37421f, 0.5); g.fillRect(T.x, T.y, T.w, T.h);
    g.lineStyle(1.5, 0x2a3317, 0.8); g.strokeRect(T.x, T.y, T.w, T.h);
    g.fillStyle(0x252d12, 0.9);
    for (var tx = T.x + 9; tx < T.x + T.w - 9; tx += 24) {
      for (var ty = T.y + 8; ty < T.y + T.h - 6; ty += 18) {
        var ox = ((tx * 7 + ty * 13) % 11) - 5;   //  결정적 흔들림(난수 아님)
        g.fillTriangle(tx + ox - 4, ty + 6, tx + ox + 4, ty + 6, tx + ox, ty - 5);
      }
    }
  }
  //  벽·바위 — 윗면을 위로 띄운 가짜 입체(윗면 밝게, 앞면 어둡게).
  var LIFT = 13;
  for (i = 0; i < M.walls.length; i++) {
    var W = sy(M.walls[i]);
    g.fillStyle(0x4a3f31, 1); g.fillRect(W.x, W.y + W.h - LIFT, W.w, LIFT);        //  앞면
    g.fillStyle(0x6d5f4b, 1); g.fillRect(W.x, W.y - LIFT, W.w, W.h);               //  윗면
    g.lineStyle(1.5, 0x2e2417, 0.9); g.strokeRect(W.x, W.y - LIFT, W.w, W.h);
    //  돌 이음매 — 윗면에 세로선 몇 개.
    g.lineStyle(1, 0x574a39, 0.8);
    for (j = W.x + 18; j < W.x + W.w - 6; j += 22) {
      g.lineBetween(j, W.y - LIFT + 3, j, W.y - LIFT + W.h - 3);
    }
  }
};

GAME.BattleScene.prototype._rtCompose = function () {
  var rt = this.rt;
  var A = GAME.CONFIG.ARENA;
  var setups = {};
  setups[rt.meTeam] = rt.my;
  setups[rt.meTeam === 'controller' ? 'strategist' : 'controller'] = rt.their;
  this._rtHeroes = {};
  var order = ['controller', 'strategist'];
  for (var si = 0; si < 2; si++) {
    var team = order[si], su = setups[team] || {};
    var top = team === 'strategist';              // strategist 팀 라벨 = 위쪽 진영
    if (su.role === 'strategist') {
      var units = (su.formation && su.formation.units) || [];
      for (var i = 0; i < units.length; i++) {
        var e = units[i];
        if (!GAME.UNITS[e.type]) continue;
        var w = GAME.Formations.toWorld(e);
        //  저장 배치는 위쪽 기준 — 아래 팀이면 세로로 거울.
        var wy = top ? w.y : (A.y + A.bottom - w.y);
        this.state.units.push(GAME.Combat.createUnit(e.type, w.x, wy, team));
      }
    } else {
      var sy = top ? (A.y + 62) : this.startPos.y;
      var hu = GAME.Combat.createHero(su.heroKey || 'vanguard',
        this.startPos.x, sy, team, {}, su.picks || GAME.defaultSkillPicks());
      this._rtApplyItems(hu, su);
      if (top) hu.facing = Math.PI / 2;
      this._rtHeroes[team] = hu;
      this.state.units.push(hu);
    }
  }
  //  내 시점 영웅: 내 팀 영웅 > 상대 영웅(관전). (전vs전은 아직 입구에서 막는다)
  var myHero = this._rtHeroes[rt.meTeam] || null;
  this.hero = myHero || this._rtHeroes[rt.meTeam === 'controller' ? 'strategist' : 'controller'];
  this._heroIsPlayer = !!myHero;
  //  내 진형이 밑에 보이게(2026-08-22 태현님 ④) — 내 팀이 위쪽 자리면 화면만 뒤집는다.
  if (GAME.Iso) GAME.Iso.rtFlip = (rt.meTeam === 'strategist');
};

//  준비 단계에서 산 장비를 영웅에 얹는다 — **양쪽이 같은 setup 으로 같은 계산**을
//  하므로 결정론이 유지된다(itemBonus 는 items 맵의 순수 함수).
GAME.BattleScene.prototype._rtApplyItems = function (hu, su) {
  if (!su || !su.items || !GAME.ArenaBuild || !GAME.ArenaBuild.applyToHeroRt) return;
  //  스탯 적용은 ArenaBuild.applyToHeroRt 한 곳이 한다 — 실시간 전용 효과 배율
  //  (RT_ITEM_EFF, 2026-08-31 무조작 50% 기준)을 감사 도구와 같은 식으로 태운다.
  GAME.ArenaBuild.applyToHeroRt(hu, su.items, su.stats || null);
  hu._gearTier = GAME.UI.gearTierOf(su.items.weapon);
  hu._kit = { armor: GAME.UI.gearTierOf(su.items.armor),
              boots: GAME.UI.gearTierOf(su.items.boots),
              acc: GAME.UI.gearTierOf(su.items.accessory) };
};

// ── 협동 보스전 조립 (시즌 2 S-C) ──────────────────────────────────────────────
//  전략가 편 = 세계 보스 층 진형(`RtCoop.formationFor` — 시드 결정적, 양쪽 같은 진형).
//  컨트롤러 편 = 영웅 둘(같은 팀). `_rtHeroes.controller` 가 **배열** [h0, h1] 이 되고
//  `coop:true` 표식으로 `_rtHeroOf` 가 h 로 고른다. 1:1 경로(_rtCompose)는 한 줄도 안 바뀐다.
//  자리: 방장(로컬은 나) = 'controller' 자리 = h0 · 손님/봇 = 'strategist' 자리 = h1.
GAME.BattleScene.prototype._rtComposeCoop = function () {
  var rt = this.rt, CO = rt.coop, RC = GAME.RtCoop;
  var f = RC.formationFor(CO.world, CO.floor, rt.seed);
  this._coopFormation = f;
  //  진형 스텁은 비워 둔다(공용 진형 루프가 다시 세우지 않게) — 보스 키만 HUD 를 위해 싣는다.
  this.formation.boss = f.boss;
  this.formation.name = RC.label(CO.world) + ' 협동 보스전';
  RC.spawn(this.state, f);
  if (GAME.Sound && this.formation.boss) { try { GAME.Sound.play('bossRoar'); } catch (e) {} }

  var setups = {};
  setups[rt.meTeam] = rt.my;
  setups[rt.meTeam === 'controller' ? 'strategist' : 'controller'] = rt.their;
  var seats = ['controller', 'strategist'];
  var arr = [];
  for (var i = 0; i < 2; i++) {
    var su = setups[seats[i]] || {};
    var hx = this.startPos.x + (i === 0 ? -54 : 54);
    var hu = GAME.Combat.createHero(su.heroKey || 'vanguard', hx, this.startPos.y, 'controller',
                                    {}, su.picks || GAME.defaultSkillPicks());
    this._rtApplyItems(hu, su);
    RC.scaleHero(hu, CO.world);     //  세계 배율(RtCoop.HERO_WORLD_MUL) — 양쪽 같은 상수라 결정론 무관
    hu._coopIdx = i;                //  봇·HUD 가 영웅을 찾는 표식(렌더/조종용, 시뮬 무관)
    hu._sfxPartner = (i !== (rt.meTeam === 'controller' ? 0 : 1));  //  파트너 영웅 소리 0.6 (S-A 배선)
    arr.push(hu);
    this.state.units.push(hu);
  }
  this._rtHeroes = { controller: arr, strategist: null, coop: true };
  this._rtMyHeroId = rt.meTeam === 'controller' ? 0 : 1;
  this.hero = arr[this._rtMyHeroId];
  this._heroIsPlayer = true;
  if (GAME.Iso) GAME.Iso.rtFlip = false;          //  둘 다 아래 진영 — 뒤집지 않는다
  //  피해 기여(결과 화면) — applyDamage 를 감싼다. shutdown 이 원복한다.
  this._coopRestore = RC.trackDamage();
};

//  파트너 체력바 — HUD 띠 안, '남은 적' 글자 왼쪽(hud.goldSlot 실측 자리). 골드 배지는
//  탑 전용이라 협동에서는 그 자리가 비어 있다. 타이머 글자와 겹칠 폭이면 안 그린다(세로 420).
GAME.BattleScene.prototype._buildCoopHud = function () {
  var SM = GAME.CONFIG.SMALL, P = GAME.CONFIG.PORTRAIT;
  var w = P ? 72 : (SM ? 124 : 168), h = SM ? 14 : 16;
  var partner = this._rtHeroOf(this.rt.meTeam === 'controller' ? 'strategist' : 'controller');
  var name = partner && partner.hero ? partner.hero.name : '파트너';
  this._coopBar = GAME.UI.meter(this, -999, -999, w, h, {
    color: GAME.UI.COL.hpGood, seg: 2, danger: 0.3, radius: 5,
    label: { size: 'micro', align: 'center' }
  });
  this._coopBar.setText('🤝 ' + GAME.UI.ellipsize(name, P ? 4 : 6));
  if (this._coopBar.gfx && this._coopBar.gfx.setDepth) this._coopBar.gfx.setDepth(8000);
  if (this._coopBar.text && this._coopBar.text.setDepth) this._coopBar.text.setDepth(8001);
  this._coopBarW = w; this._coopBarH = h; this._coopBarX = -1;
  this._coopPartner = partner;
};

GAME.BattleScene.prototype._updateCoopHud = function () {
  var bar = this._coopBar, p = this._coopPartner;
  if (!bar || !bar.gfx || !bar.gfx.scene || !p) return;
  var slot = this.hud && this.hud.goldSlot ? this.hud.goldSlot() : null;
  if (slot) {
    var x = slot.right - this._coopBarW, y = Math.round(slot.cy - this._coopBarH / 2);
    //  타이머(정중앙 큰 숫자) 오른쪽 여백 안에 들어갈 때만 — 아니면 숨긴다(겹침보다 낫다).
    var minX = GAME.CONFIG.WIDTH / 2 + (GAME.CONFIG.SMALL ? 62 : 84);
    var ok = x >= minX;
    if (bar.gfx.setVisible) bar.gfx.setVisible(ok);
    if (bar.text && bar.text.setVisible) bar.text.setVisible(ok);
    if (ok && x !== this._coopBarX) { this._coopBarX = x; bar.setPosition(x, y); }
  }
  bar.set(p.alive && p.maxHp ? p.hp / p.maxHp : 0, p.maxHp ? (p.shield || 0) / p.maxHp : 0);
};
