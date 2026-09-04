window.GAME = window.GAME || {};

// ============================================================================
//  2인 협동 보스전 — 순수 조립 계층 (시즌 2 S-C, 2026-09-03)
//
//  둘 다 컨트롤러, 같은 팀('controller')으로 **세계 보스 층**(호위 진형 포함)을 친다.
//  승 = 보스 사망 · 패 = 둘 다 사망 또는 TIME_MS. 판정은 combat.js `state.coop` 이 한다.
//
//  ## 왜 tower.js `formationFor` 를 그대로 못 쓰나
//  그 함수는 **내 계정**을 읽는다 — Profile(성향), TowerChar(climbSeed·성장 추종),
//  AutoFormation._recent(교리 기억). 두 클라이언트가 각자 부르면 서로 다른 진형이 나와
//  첫 digest 부터 갈린다. 여기서는 같은 부품(AutoFormation.generate · TowerPlan.apply ·
//  Tower.budgetFor/modsFor · 보스 사다리)을 **시드만으로** 부른다:
//   · 예산·배수는 `skipPower=true`(신선한 캐릭터 기준) — 협동 영웅은 탑 성장이 아니라
//     실시간 빌드(ArenaBuild/RtStats)를 쓰므로 그게 맞는 기준이다.
//   · AutoFormation 의 Math.random 은 generate 동안만 시드 난수로 갈아 끼운다(동기,
//     finally 복구). 교리는 시드로 고른다(_recent 기억을 안 탄다).
//   · 보스 층은 층 조건이 없다(towerrule.ruleFor 가 보스 층에 null) — 그대로 따른다.
//   · 세계 전장 규칙은 S-W 의 `TowerCurriculum.fieldFor(floor, seed)` 가 있으면 얹는다.
//
//  ## 록스텝 자리(seat)와 영웅 번호(h)
//  두 사람이 같은 팀이라도 록스텝 큐는 **자리**로 갈린다(방장 = 'controller' 자리 ·
//  손님 = 'strategist' 자리 — 1:1 대전의 팀 라벨과 같은 값이라 전송 계층이 한 비트도
//  안 바뀐다). 명령마다 `h`(0=방장 영웅, 1=손님/봇 영웅)를 실어 `heroOf(seat, h)` 가
//  영웅을 고른다. 봇 파트너(로컬)는 'controller' 자리 큐에 h:1 로 넣는다.
//
//  ⚠ Phaser·씬에 의존하지 않는다 — tools/rt-coop-audit.js 가 sim 샌드박스에 얹어 잰다.
// ============================================================================
GAME.RtCoop = {
  TIME_MS: 180000,
  //  보스 체력 배수(2인 기준). tools/rt-coop-audit.js 가 봇 둘의 승률(목표 60~80%)로 잰다.
  COOP_BOSS_HP_MUL: 1.0,
  COOP_BOSS_DMG_MUL: 1.0,
  //  호위 예산 배율 — 협동 영웅은 신선한 실시간 빌드라 고층 호위를 원래 예산대로 세우면
  //  보스에 닿기도 전에 녹는다. 세계가 올라갈수록 호위를 조금 눌러 "보스전"으로 남긴다.
  ESCORT_MUL: 0.35,
  //  호위 배수는 층 곡선(1+0.012t)을 이 층까지만 태운다 — 200층 폭풍 보스의 호위가
  //  ×3.4 면 실시간 빌드로는 성립하지 않는다(실측은 감사가 찍는다).
  ESCORT_FLOOR_CAP: 40,
  //  호위 공격 배율 — 신선한 실시간 영웅(체력 ~900) 기준. 감사가 승률로 잰다.
  ESCORT_DMG_MUL: 1.0,
  //  보상 골드 = 그 층 골드(TowerRun.goldFor, 보스 배수 포함) × 이 비율.
  GOLD_SHARE: 0.4,
  BOT_LEVEL: 'normal',
  //  ── 영웅 세계 배율 — "그 세계까지 올라온 영웅"으로 세운다 ──────────────────────
  //  협동 영웅은 실시간 빌드(예산 500 드래프트, 성장 없음)라 그대로 두면 60층 보스의
  //  탄막 한 발(120~190)이 체력의 15~20% 다 — 세계 보스·전장 규칙은 그 세계까지 **성장한**
  //  영웅을 전제로 설계됐다(탑은 boss hp 가 atkIndex 를 따라간다). 세계 내용(보스 능력·
  //  전장 규칙·호위)을 깎는 대신 영웅 체력·공격을 세계별 상수로 올린다. 값은
  //  tools/rt-coop-audit.js 가 봇 둘 승률 60~80% 로 잰다. 세계별 스윕(2026-09-03, rep=4)에서
  //  0→100% 가 0.5 폭 안에서 뒤집히므로 그 중간값을 택했다(초원 1.5→25%·2.0→100% 등).
  //  2026-09-03 통합: RT_HERO_MOD 재조정(파수꾼 hp 0.95·ls 0.4·R 오라 0.4) 뒤 봇 둘 승률이
  //  73%→55% 로 내려와 다섯 값을 약 10% 올렸다(rt-coop-audit (f) 로 재확인).
  //  +10% 는 85%(초원·폭풍 8/8) 로 넘쳐서 절반만(+5%) → 65%(26/40), 세계마다 승·패 다 있음.
  //  2026-09-04 재조정: 암살자·주술사 개편(v3.20/3.21)과 아이템 렌즈로 승률이 다시
  //  85%(34/40) 로 올라 게이트가 빨개졌다. 다섯 값을 일괄 −8% 해 목표 대역으로 되돌린다
  //  (개별 세계를 손대면 세계 간 상대 난이도가 흐트러진다 — 일괄이 맞다).
  //  일괄 −8% 뒤 균열·폭풍만 8/8 로 남아(그 둘은 원래 여유가 컸다) 두 값만 한 번 더
  //  −8% 했다 — 「세계마다 승·패가 다 있어야 한다」는 게이트가 그 둘을 지목한다.
  HERO_WORLD_MUL: { meadow: 1.75, mire: 2.25, ash: 3.31, rift: 3.30, storm: 3.09 },
  scaleHero: function (hu, world) {
    var m = this.HERO_WORLD_MUL[world];
    if (!(m > 0) || m === 1 || !hu || !hu.def) return hu;
    hu.def.damage = Math.round(hu.def.damage * m);
    hu.def.hp = Math.round(hu.def.hp * m);
    hu.maxHp = hu.def.hp;
    hu.hp = hu.def.hp;
    return hu;
  },

  // ── 세계 표 — 열린 세계까지만 고를 수 있다(잠긴 것은 숨기지 않는다) ─────────
  //  ⚠ 해금 기준이 바뀌었다 (2026-09-04 태현님 ⑥): "보스를 고르는 기준은 통곡의탑 깬
  //  기준이 아니라 그냥 협동보스전에서 깼다면 다음꺼 도전할수있게해주면돼."
  //  → **앞 세계를 협동으로 한 번이라도 이기면 다음 세계가 열린다.** 탑 기록·시즌
  //  진입은 지우지 않고 **또 하나의 길**로 남긴다 — 이미 200층을 오른 사람에게
  //  협동을 처음부터 다시 밟게 하는 것은 벌이지 보상이 아니다.
  //  기록은 `RtScore.coopGet(world).wins`(로컬, 세계별). 서버 필드는 아직 없다.
  worlds: function () {
    var S = GAME.Season;
    if (!S || !S.WORLDS) return [];
    var best = 0;
    try { best = (GAME.Tower && GAME.Tower.get && GAME.Tower.get().best) || 0; } catch (e) {}
    var prog = null;
    try { prog = S.progress(1); } catch (e2) {}
    function coopWins(key) {
      if (!GAME.RtScore || !GAME.RtScore.coopGet) return 0;
      try { return (GAME.RtScore.coopGet(key) || {}).wins || 0; } catch (e3) { return 0; }
    }
    var out = [];
    for (var i = 0; i < S.WORLDS.length; i++) {
      var w = S.WORLDS[i], p = prog && prog[i];
      var prev = i > 0 ? S.WORLDS[i - 1] : null;
      var byCoop = i === 0 || (prev && coopWins(prev.key) > 0);
      out.push({
        key: w.key, name: w.name, icon: w.icon || '', from: w.from, floor: w.boss, index: i,
        prevName: prev ? (prev.icon + ' ' + prev.name) : null,
        wins: coopWins(w.key),
        open: byCoop || best >= w.from || !!(p && p.entered)
      });
    }
    return out;
  },
  worldOf: function (key) {
    var ws = this.worlds();
    for (var i = 0; i < ws.length; i++) if (ws[i].key === key) return ws[i];
    return null;
  },
  floorOf: function (key) { var w = this.worldOf(key); return w ? w.floor : 30; },
  label: function (key) {
    var w = this.worldOf(key);
    return w ? (w.icon + ' ' + w.name) : String(key || '');
  },

  //  세계 보스 키 — S-W 가 `TowerCurriculum.worldBossKeyFor(floor)` 를 주면 그것,
  //  없으면 탑 보스 사다리(tower.js BOSS_SCHEDULE).
  bossKeyFor: function (floor) {
    var TC = GAME.TowerCurriculum;
    if (TC && typeof TC.worldBossKeyFor === 'function') {
      try { var k = TC.worldBossKeyFor(floor); if (k && GAME.UNITS[k]) return k; } catch (e) {}
    }
    if (GAME.Tower && GAME.Tower.bossKeyFor) {
      var k2 = GAME.Tower.bossKeyFor(floor);
      if (k2 && GAME.UNITS[k2]) return k2;
    }
    return 'bossChief';
  },
  fieldFor: function (floor, seed) {
    var TC = GAME.TowerCurriculum;
    if (TC && typeof TC.fieldFor === 'function') {
      try { return TC.fieldFor(floor, seed) || null; } catch (e) { return null; }
    }
    return null;
  },

  //  방 이름 페이로드 — 서버(arena-room)는 name 을 24자까지 그대로 보관·목록에 싣는다.
  roomName: function (world, floor) { return 'coop:' + world + ':' + floor; },
  parseRoomName: function (name) {
    var m = /^coop:([a-z]+):(\d+)$/.exec(String(name || ''));
    return m ? { world: m[1], floor: parseInt(m[2], 10) } : null;
  },

  //  결정적 난수(xorshift) — 시드가 같으면 같은 진형.
  _rng: function (seed) {
    var s = (seed | 0) || 1;
    return function () {
      s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      return (s >>> 0) / 4294967296;
    };
  },

  // ── 진형 — 그 층의 호위 + 세계 보스 (시드 결정적) ─────────────────────────
  formationFor: function (world, floor, seed) {
    var T = GAME.Tower, AF = GAME.AutoFormation, TC = GAME.TowerCurriculum;
    seed = seed >>> 0;
    var budget = Math.round(T.budgetFor(floor, true) * T.BOSS_ESCORT * this.ESCORT_MUL);
    var unitCap = T.unitCapFor(floor);
    var allowTypes = null, maxUnits = 0;
    if (TC && TC.fullFloor && floor <= TC.fullFloor()) {
      allowTypes = TC.typesFor(floor);
      maxUnits = TC.maxUnitsFor(floor);
    }
    if (!maxUnits || maxUnits > unitCap) maxUnits = unitCap;
    var docs = Object.keys(AF.DOCTRINES || {}).sort();
    var dr = this._rng(seed ^ 0x5eed);
    var doctrine = docs.length ? docs[Math.floor(dr() * docs.length) % docs.length] : undefined;
    var origRandom = Math.random, f;
    Math.random = this._rng(seed);
    try {
      f = AF.generate(budget, null, {
        id: 'coop-' + world + '-' + floor, name: this.label(world) + ' 보스',
        tier: '협동 ' + floor + '층', heroKey: null,
        allowTypes: allowTypes, maxUnits: maxUnits, capUnits: unitCap,
        readMul: 1, doctrine: doctrine
      });
    } finally { Math.random = origRandom; }
    if (GAME.TowerPlan && GAME.TowerPlan.apply) GAME.TowerPlan.apply(f, floor, seed);
    //  질 배수 — tower.js formationFor 와 같은 식(머릿수 상한이 남긴 예산을 스탯으로).
    var spent = 0;
    for (var i = 0; i < f.units.length; i++) {
      var d = GAME.UNITS[f.units[i].type];
      if (d && d.cost) spent += d.cost;
    }
    var qCap = floor <= 10 ? 1.6 : 5;
    f.qualityMul = Math.max(1, Math.min(qCap, budget / Math.max(1, spent)));
    var bossKey = this.bossKeyFor(floor);
    f.units.push({ type: bossKey, nx: 0.5, ny: 0.13 });
    f.boss = bossKey;
    f.field = this.fieldFor(floor, seed);
    f.world = world; f.floor = floor; f.seed = seed; f.coop = true;
    f.escortBudget = budget;
    return f;
  },

  //  호위 배수 — 신선 기준·조건 없음(보스 층). 층은 ESCORT_FLOOR_CAP 까지만.
  escortMods: function (floor) {
    return GAME.Tower.modsFor(Math.min(floor, this.ESCORT_FLOOR_CAP), true, true);
  },
  bossMods: function () {
    var T = GAME.Tower;
    return { hp: T.BOSS_HP_PREMIUM * this.COOP_BOSS_HP_MUL,
             damage: T.BOSS_DMG_PREMIUM * this.COOP_BOSS_DMG_MUL };
  },

  //  진형을 state 에 세운다(전략가 편) + 협동 판정 스위치. 반환: 보스 유닛.
  //  ⚠ 유닛 생성 순서가 곧 결정론이다 — 양쪽이 같은 f 를 같은 순서로 민다.
  spawn: function (state, f) {
    var C = GAME.Combat, mods = this.escortMods(f.floor), boss = null;
    var q = f.qualityMul > 1 ? f.qualityMul : 1;
    var qm = { hp: mods.hp * Math.pow(q, 1.25), damage: mods.damage * Math.pow(q, 0.75) * this.ESCORT_DMG_MUL };
    for (var i = 0; i < f.units.length; i++) {
      var e = f.units[i], def = GAME.UNITS[e.type];
      if (!def) continue;
      var w = GAME.Formations.toWorld(e);
      var u = C.createUnit(e.type, w.x, w.y, 'strategist', def.isBoss ? this.bossMods() : qm);
      state.units.push(u);
      if (def.isBoss) boss = u;
    }
    state.coop = true;
    state.coopTimeMs = this.TIME_MS;
    state.coopWorld = f.world;
    state.coopFloor = f.floor;
    if (f.field && C.setField) C.setField(state, f.field);
    return boss;
  },

  //  피해 기여 추적 — applyDamage 를 감싸 영웅별 `_coopDealt` 를 쌓는다(결과 화면용).
  //  상태를 바꾸지 않는다(결정론 무관). 반환: 원복 함수.
  trackDamage: function () {
    var C = GAME.Combat;
    if (C._coopDmgWrapped) return function () {};
    var orig = C.applyDamage;
    C._coopDmgWrapped = true;
    C.applyDamage = function (unit, dmg, source, state) {
      var before = unit ? Math.max(0, unit.hp) : 0;
      var r = orig.apply(this, arguments);
      if (state && state.coop && source && source.isHero && source.side === 'controller' &&
          unit && unit.side !== source.side) {
        source._coopDealt = (source._coopDealt || 0) + Math.max(0, before - Math.max(0, unit.hp));
      }
      return r;
    };
    return function () { C.applyDamage = orig; C._coopDmgWrapped = false; };
  },

  //  보상 골드(승리 시). 캐릭터가 없으면 0(줄 곳이 없다 — 결과 화면이 그렇게 말한다).
  goldFor: function (floor) {
    if (!GAME.TowerRun || !GAME.TowerRun.goldFor) return 0;
    return Math.max(1, Math.round(GAME.TowerRun.goldFor(floor) * this.GOLD_SHARE));
  }
};

// ============================================================================
//  실시간 대전 준비 흐름 (2026-08-22 태현님 사양)
//
//  "각각 컨트롤러할지 전략가할지 고른 다음, 둘 다 준비 완료하면 같은 골드 수준에서
//   전략가는 배치를 고르고 컨트롤러는 영웅·아이템·스킬을 사는 시간을 1분 줘야 해.
//   그다음 전투 준비 완료하면 게임으로 들어가는 거야."
//
//  ## 왜 씬이 아니라 전역 모듈인가
//  준비 단계에서 컨트롤러는 **상점(TowerShop)을 다녀온다** — 씬이 바뀌는 동안에도
//  상대의 세팅(rtSetup)이 도착할 수 있다. 씬에 상태를 두면 상점을 다녀오는 사이
//  받은 세팅이 유실된다(씬 shutdown 이 NetRoom 콜백을 뗀다). 그래서 교환 상태와
//  타이머를 여기(전역)에 두고, 씬(RtPrep)은 그리기만 한다.
//
//  ## 흐름
//  로비: 역할 선택 → [준비 완료] → 서버 start(seed) → RtFlow.begin() → RtPrep 씬
//  RtPrep: 60초 안에 전략가 = 배치 선택 / 컨트롤러 = 대전 준비창(예산 500)
//          → [전투 준비 완료] → commitMine() → 양쪽 세팅이 모이면 Battle
//  시간이 다 되면 자동 확정(컨트롤러 = 대전 준비창 마지막 구성 · 전략가 = 첫 저장 배치).
// ============================================================================
GAME.RtFlow = {
  PREP_MS: 60000,

  active: false,
  myRole: null,
  theirRole: null,
  startMsg: null,
  mySetup: null,
  theirSetup: null,
  deadline: 0,
  _started: false,
  _rttFrozen: null,
  _tickId: null,

  begin: function (myRole, theirRole, startMsg) {
    this.active = true;
    this.local = false;
    this.coop = null;
    this.botLevel = null;
    this.myRole = myRole;
    this.theirRole = theirRole;
    this.startMsg = startMsg;
    this.mySetup = null;
    this.theirSetup = null;
    this.myHeroPick = null;     //  지난 판의 영웅 선택이 새 판에 새지 않게
    this.myRollFor = null; this.myPicks = null;   //  스킬도 판마다 새로 굴린다
    //  컨트롤러 — 판마다 **초기화된** 임시 빌드(예산 500 드래프트, 2026-08-24 태현님 ④).
    //  이월 없음 · 저장 안 됨. TowerShop(mode:'arena') 왕복이 전부 여기에 쌓인다.
    if (GAME.ArenaBuild) {
      if (myRole === 'controller') GAME.ArenaBuild.rtBegin();
      else GAME.ArenaBuild.rtEnd();
    }
    this._started = false;
    this._rttFrozen = null;
    this.deadline = Date.now() + this.PREP_MS;
    var self = this;
    //  ⚠ NetRoom 콜백을 **여기서 쥔다** — RtPrep 이 상점을 다녀와도 안 끊긴다.
    //    Battle 이 시작되면 battle.js 가 다시 가져간다(교대 계약).
    GAME.NetRoom.on.message = function (from, data) {
      if (data && data.type === 'rtSetup' && data.setup) {
        self.theirSetup = data.setup;
        self.maybeBattle();
      }
    };
    //  ⚠ 준비 화면은 최대 60초 머무는 자리다 — 폰은 그 사이 화면이 꺼지고 소켓이
    //  끊긴다. 예전에는 그 한 번의 깜빡임으로 판을 통째로 물렀다(협동 "시작하자마자
    //  파트너가 떠났다"의 절반). 되붙는 중(`drop`)이면 기다리고, 정말 끝났을 때만 무른다.
    GAME.NetRoom.on.drop = function () { self._netDrop = true; };
    GAME.NetRoom.on.reopen = function () {
      self._netDrop = false;
      //  끊긴 동안 보낸 내 세팅이 유실됐을 수 있다 — 값 불변으로 다시 보낸다(멱등).
      self.resend();
    };
    GAME.NetRoom.on.close = function (info) {
      if (!info || !info.byUser) self.abort('상대의 연결이 끊겼습니다');
    };
    if (this._tickId) clearInterval(this._tickId);
    this._tickId = setInterval(function () { self._check(); }, 500);
  },

  //  ── 연습 대전(봇) — 방·서버 없이 같은 준비 흐름을 탄다 (v3.0, 2026-09-02) ──
  //  NetRoom 콜백을 **하나도 안 건다.** 상대 세팅은 commitMine 이 봇 세팅으로 채운다.
  local: false,
  botLevel: null,
  beginLocal: function (level) {
    this.active = true;
    this.local = true;
    this.coop = null;
    this.botLevel = level || 'normal';
    this.myRole = 'controller';
    this.theirRole = 'controller';
    this.startMsg = { seed: (Math.floor(Math.random() * 0xffffffff) >>> 0) };
    this.mySetup = null;
    this.theirSetup = null;
    this.myHeroPick = null;
    this.myRollFor = null; this.myPicks = null;
    if (GAME.ArenaBuild) GAME.ArenaBuild.rtBegin();
    this._started = false;
    this._rttFrozen = 0;
    this.deadline = Date.now() + this.PREP_MS;
    var self = this;
    if (this._tickId) clearInterval(this._tickId);
    this._tickId = setInterval(function () { self._check(); }, 500);
  },

  //  ── 협동 보스전 (시즌 2 S-C) — 둘 다 컨트롤러, 같은 준비 흐름 ──────────────
  //  coop = { world, floor }. 방 판은 서버 start(seed) 를, 봇 판은 로컬 시드를 쓴다 —
  //  진형은 `RtCoop.formationFor(world, floor, seed)` 가 그 시드로 결정적으로 만든다.
  coop: null,
  _netDrop: false,          //  준비 화면에서 소켓이 끊겼다 되붙는 중인가(화면 문구용)
  beginCoop: function (coop, startMsg) {
    this.begin('controller', 'controller', startMsg);
    this.coop = { world: coop.world, floor: coop.floor || GAME.RtCoop.floorOf(coop.world) };
  },
  beginLocalCoop: function (coop, level) {
    this.beginLocal(level || GAME.RtCoop.BOT_LEVEL);
    this.coop = { world: coop.world, floor: coop.floor || GAME.RtCoop.floorOf(coop.world) };
  },

  remainMs: function () { return Math.max(0, this.deadline - Date.now()); },

  _check: function () {
    if (!this.active) { this._stopTick(); return; }
    //  시간이 다 되면 내 세팅을 자동 확정한다 — 상대만 기다리는 상태로는 안 넘어간다.
    if (!this.mySetup && this.remainMs() <= 0) this.commitDefault();
  },

  _stopTick: function () {
    if (this._tickId) { clearInterval(this._tickId); this._tickId = null; }
  },

  //  자동 확정 — 컨트롤러: 대전 준비창의 마지막 구성. 전략가: 첫 저장 배치.
  commitDefault: function () {
    if (this.mySetup || !this.active) return;
    if (this.myRole === 'strategist') {
      var list = GAME.Formations.loadSaved();
      var f = list && list[0];
      if (!f) { this.abort('저장된 배치가 없습니다'); return; }
      this.commitMine(this.buildStrategistSetup(f));
    } else {
      this.commitMine(this.buildControllerSetup());
    }
  },

  //  세팅 조립 — 양쪽 클라이언트가 이 스냅샷만으로 같은 영웅/진형을 만든다(결정론).
  //  2026-08-23 태현님: "영웅은 모두 초기화된 상태로 서로 골라야 한다" —
  //  대전 상점(예산·아이템)을 접고, 준비 화면에서 고른 영웅 + 기본 스킬픽만.
  myHeroPick: null,
  setHeroPick: function (k) {
    this.myHeroPick = k;
    //  스킬은 **고르는 게 아니라 받는다**(2026-09-04 태현님 ①) — 영웅을 고르는 그
    //  순간 굴려서 준비 화면이 바로 보여 준다. 확정 때 굴리면 무엇을 받았는지 모르는
    //  채로 전투에 들어간다. 같은 영웅을 다시 눌러도 다시 굴리지 않는다(리롤 금지).
    if (this.myRollFor !== k) {
      this.myRollFor = k;
      this.myPicks = GAME.randomSkillPicks ? GAME.randomSkillPicks(k) : GAME.defaultSkillPicks();
    }
    //  임시 빌드에도 같은 영웅을 — 상점(TowerShop)이 rec.heroKey 를 보고 그린다.
    if (GAME.ArenaBuild && GAME.ArenaBuild._rtRec) {
      GAME.ArenaBuild._rtRec.heroKey = k;
      GAME.ArenaBuild._rtRec.picks = this.myPicks;
    }
  },
  myRollFor: null,
  myPicks: null,
  buildControllerSetup: function (heroKey) {
    //  드래프트 반영(2026-08-24 태현님 ④) — 준비 중 상점에서 산 아이템·스킬픽을
    //  세팅 스냅샷에 싣는다. 상점을 안 다녀왔으면 DEFAULT 그대로 = 기본 스펙.
    var rec = (GAME.ArenaBuild && GAME.ArenaBuild._rtRec) || null;
    return {
      role: 'controller',
      heroKey: heroKey || this.myHeroPick || (rec && rec.heroKey) || 'vanguard',
      picks: (rec && rec.picks) || GAME.defaultSkillPicks(),
      items: (rec && rec.items) || {},
      stats: (rec && rec.rtStats) || {}      //  실시간 능력치(행운 포함) — 2026-08-31
    };
  },
  buildStrategistSetup: function (f) {
    return { role: 'strategist',
             formation: { name: f.name || '', units: f.units } };
  },

  commitMine: function (setup) {
    if (!this.active || this.mySetup) return;
    //  입력 지연은 여기서 얼리는 rtt 로 정해진다. P2P 직결이 아직 안 붙었으면 서버
    //  경유 rtt(수백 ms)가 판 내내 굳는다 — "렉" 신고의 한 축(2026-09-02). 직결이
    //  붙을 때까지 **최대 1.5초**만 기다렸다가 얼린다(양쪽 같은 규칙이라 안전하고,
    //  기다리는 동안도 준비 시간은 흐른다).
    //  ⚠⚠ 기다리는 시간을 1.5 → **4초**로 늘렸다 (2026-09-04 태현님 ⑧).
    //  실측(두 브라우저): 직결이 붙은 뒤 왕복은 2ms 인데 `delay` 는 6틱(200ms)으로
    //  굳어 있었다 — 확정 시점에 직결이 아직 안 붙어 **서버 경유 왕복(126ms)** 을 얼린
    //  것이다. ICE 협상은 흔히 2~3초가 걸리므로 1.5초는 거의 언제나 짧다. 그 한 번의
    //  이른 확정이 판 전체의 입력 지연을 정한다(얼린 값은 결정론 때문에 못 바꾼다).
    //  준비 화면은 60초라 4초를 더 기다려도 사람에게 비용이 없다.
    if (!this.local && this._rttFrozen == null && GAME.NetRtc && !GAME.NetRtc.ready() &&
        GAME.NetRoom.peers && GAME.NetRoom.peers.length >= 2 && !this._rttWaiting) {
      var selfW = this, waited = 0;
      this._rttWaiting = true;
      var iv = setInterval(function () {
        waited += 100;
        if (GAME.NetRtc.ready() || waited >= 4000 || !selfW.active) {
          clearInterval(iv);
          selfW._rttWaiting = false;
          if (selfW.active) selfW.commitMine(setup);
        }
      }, 100);
      return;
    }
    //  rtt 는 한 번만 얼린다 — 양쪽이 (내 rtt, 상대 rtt)의 같은 쌍으로 같은 지연을
    //  계산해야 한다. 재전송 때 값이 바뀌면 세션 지연이 갈라져 desync 다.
    if (this._rttFrozen == null)
      this._rttFrozen = Math.round(GAME.NetRoom.bestRtt() || 180);
    setup.rtt = this._rttFrozen;
    setup.rtScore = GAME.RtScore ? GAME.RtScore.get().score : 0;
    this.mySetup = setup;
    if (this.local) {
      //  연습 대전 — 상대는 봇. 내 영웅과 다른 영웅을 우선 고른다(시드 결정적).
      this.theirSetup = GAME.RtBot.botSetup(this.botLevel, this.startMsg.seed, setup.heroKey);
      this.maybeBattle();
      return;
    }
    GAME.NetRoom.relay({ type: 'rtSetup', setup: setup });
    this.maybeBattle();
  },

  //  유실 대비 재전송 — 값 불변으로 그대로 다시.
  resend: function () {
    if (this.mySetup) GAME.NetRoom.relay({ type: 'rtSetup', setup: this.mySetup });
  },

  maybeBattle: function () {
    if (this._started || !this.active) return;
    if (!this.mySetup || !this.theirSetup || !this.startMsg) return;
    this._started = true;
    this._stopTick();
    //  세팅 스냅샷에 이미 실렸다 — 임시 빌드는 여기서 닫는다(전투·일반 대전 오염 방지).
    if (GAME.ArenaBuild) GAME.ArenaBuild.rtEnd();
    var NR = GAME.NetRoom;
    //  팀 라벨: 방장 = 'controller' 팀 · 손님 = 'strategist' 팀 (역할과 무관한 자리 이름).
    //  연습 대전은 언제나 내가 'controller' 팀 · 지연 2틱(네트워크 없음).
    var meTeam = this.local ? 'controller' : ((NR.me === NR.host) ? 'controller' : 'strategist');
    var oneWay = ((this.mySetup.rtt || 180) + (this.theirSetup.rtt || 180)) / 2;
    var delay = this.local ? 2 : Math.max(3, Math.min(24, Math.ceil(oneWay * 1.15 / 33.4) + 2));
    var heroKey = this.mySetup.heroKey || this.theirSetup.heroKey || 'vanguard';
    var rt = {
      seed: this.startMsg.seed >>> 0,
      meTeam: meTeam,
      delay: delay,
      my: this.mySetup,
      their: this.theirSetup,
      local: !!this.local,
      botLevel: this.local ? this.botLevel : null,
      //  협동(S-C) — 세계·층·시드. meTeam 은 여기서 **록스텝 자리**다(둘 다 같은 팀).
      coop: this.coop ? { world: this.coop.world, floor: this.coop.floor,
                          seed: this.startMsg.seed >>> 0 } : null
    };
    this.coop = null;
    this.active = false;
    var sm = GAME.game.scene;
    sm.getScenes(true).forEach(function (s) { sm.stop(s.scene.key); });
    sm.start('Battle', { rt: rt, heroKey: heroKey, formationId: null });
  },

  abort: function (msg) {
    this._stopTick();
    if (GAME.ArenaBuild) GAME.ArenaBuild.rtEnd();
    if (!this.active) return;
    this.active = false;
    this.coop = null;
    if (!this.local) {
      GAME.NetRoom.on.message = null;
      GAME.NetRoom.on.close = null;
      GAME.NetRoom.on.drop = null;
      GAME.NetRoom.on.reopen = null;
      GAME.NetRoom.leave(true);
    }
    this.local = false;
    var sm = GAME.game && GAME.game.scene;
    if (sm) {
      var prep = sm.getScene('RtPrep');
      if (prep && prep.scene.isActive()) {
        sm.getScenes(true).forEach(function (s) { sm.stop(s.scene.key); });
        sm.start('Versus');
      }
    }
    this.lastAbort = msg || null;
  }
};
