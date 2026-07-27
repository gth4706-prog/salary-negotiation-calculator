window.GAME = window.GAME || {};

// ============================================================================
//  대전(Arena) — **비동기 PvP**. 클래시 오브 클랜 구조를 이 게임에 옮긴 것.
//
//  왜 이게 필요한가 (근거: docs/PERSONAS.md 1차 리포트)
//    50명 중 11명이 **"겨룰 상대가 없다"** 로 떠났다 — 최대 이탈 사유다.
//    숙련 유저는 6명 전원(100%) 이탈했다. 솔로 탑만으로는 13판쯤에서 바닥이 난다.
//    즉 대전은 기능 추가가 아니라 **생존 조건**이다.
//
//  구조 (CoC 대응)
//    내 마을      = 내가 저장한 배치도 하나 (기지). 내가 접속하지 않아도 남이 공격한다.
//    공격         = 남의 배치도를 골라 영웅 하나로 돌파. 성공하면 트로피를 얻는다.
//    방어         = 내 기지가 공격당한 기록. 돌아왔을 때 결과를 본다.
//    트로피       = 승패로 오르내리는 점수. 매칭은 비슷한 트로피끼리.
//
//  ⚠ 서버가 없어도 성립해야 한다(GitHub Pages 정적 배포).
//    그래서 상대는 **저장된 배치도 + AI 시드**에서 고르고, 내가 없는 동안의 방어전은
//    다음 접속 때 **결정론적으로 시뮬**해서 기록으로 만든다. 유저가 늘면 이 자리에
//    서버(Worker+KV)에서 받은 실제 상대·실제 공격 로그를 끼워 넣으면 된다 —
//    화면과 규칙은 그대로 두고 데이터 출처만 바뀐다.
// ============================================================================
GAME.Arena = {
  KEY: 'asymgame.arena.v1',

  // 시작 트로피는 **시드 배치도들의 평균 근처**여야 한다.
  // 300 으로 뒀더니 상대가 전부 500대라 이겨도 +40 / 져도 -6 이 나와서
  // 오르기만 하는 구조가 됐다(실측). 비슷한 상대와 붙어야 승패가 의미를 갖는다.
  START_TROPHY: 500,
  // 트로피 변동 — 상대가 나보다 강할수록 많이 얻고 적게 잃는다(엘로 축약형)
  BASE_GAIN: 22,
  BASE_LOSS: 16,

  // 내가 없는 동안 벌어지는 방어전 — 접속 간격에 비례해 늘리되 상한을 둔다.
  // 너무 많으면 복귀할 때마다 트로피가 폭락해서 돌아올 마음이 사라진다.
  DEFENSE_PER_HOUR: 0.8,
  DEFENSE_MAX: 4,

  _all: function () { return GAME.Store.get(this.KEY, {}); },
  _key: function () { return GAME.Account.current() || 'guest'; },

  get: function () {
    var rec = this._all()[this._key()];
    if (!rec) {
      rec = {
        trophy: this.START_TROPHY,
        best: this.START_TROPHY,
        baseId: null,          // 내 마을로 쓰는 배치도 id
        attacks: 0, attackWins: 0,
        defenses: 0, defenseWins: 0,
        log: [],               // 방어 기록(최근 것이 앞)
        lastSeen: Date.now()
      };
    }
    if (rec.trophy === undefined) rec.trophy = this.START_TROPHY;
    if (!rec.log) rec.log = [];
    return rec;
  },

  _save: function (rec) {
    var all = this._all();
    all[this._key()] = rec;
    GAME.Store.set(this.KEY, all);
  },

  // ── 내 마을(기지) ────────────────────────────────────────────────────────
  setBase: function (formationId) {
    var rec = this.get();
    rec.baseId = formationId;
    this._save(rec);
    return rec;
  },
  baseFormation: function () {
    var rec = this.get();
    if (!rec.baseId) return null;
    return GAME.Formations.getById(rec.baseId);
  },

  // ── 트로피 ───────────────────────────────────────────────────────────────
  // 리그 이름 — 숫자만 보면 성장이 안 느껴진다. 구간에 이름을 붙여 목표를 만든다.
  LEAGUES: [
    { at: 0,    name: '흙바닥',   hex: 0xa8a8c2 },
    { at: 400,  name: '풀숲',     hex: 0x4ade80 },
    { at: 700,  name: '돌담',     hex: 0x6bb8ff },
    { at: 1000, name: '청동벽',   hex: 0xb3a8ff },
    { at: 1400, name: '황금알',   hex: 0xffd166 },
    { at: 1900, name: '전설의 둥지', hex: 0xff7b7b }
  ],
  leagueOf: function (trophy) {
    var out = this.LEAGUES[0];
    for (var i = 0; i < this.LEAGUES.length; i++) {
      if (trophy >= this.LEAGUES[i].at) out = this.LEAGUES[i];
    }
    return out;
  },
  nextLeague: function (trophy) {
    for (var i = 0; i < this.LEAGUES.length; i++) {
      if (trophy < this.LEAGUES[i].at) return this.LEAGUES[i];
    }
    return null;
  },

  // 상대 트로피를 기준으로 한 변동폭
  gainFor: function (myTrophy, oppTrophy) {
    var d = (oppTrophy - myTrophy) / 100;              // 상대가 강할수록 +
    return Math.max(8, Math.round(this.BASE_GAIN * (1 + d * 0.35)));
  },
  lossFor: function (myTrophy, oppTrophy) {
    var d = (myTrophy - oppTrophy) / 100;              // 내가 강한데 지면 더 잃는다
    return Math.max(6, Math.round(this.BASE_LOSS * (1 + d * 0.35)));
  },

  // ── 상대 찾기 ────────────────────────────────────────────────────────────
  // 저장된 배치도 + AI 시드에서 내 트로피 근처의 상대를 고른다.
  // 배치도마다 트로피가 없으므로 **예산과 방어 전적으로 추정**한다 —
  // 강한 배치도(예산 큼·방어 승률 높음)일수록 높은 트로피로 친다.
  ratingOf: function (f) {
    if (!f) return this.START_TROPHY;
    // 선언 예산이 아니라 **실제로 쓴 비용**을 본다 — 시드가 전부 같은 예산(220)이라
    // 선언값만 쓰면 상대 셋이 전부 같은 트로피로 나와 고를 이유가 없어진다(실측).
    var cost = GAME.Formations.cost(f);
    var units = (f.units || []).length;
    var kinds = {};
    (f.units || []).forEach(function (u) { kinds[u.type] = 1; });
    var variety = Object.keys(kinds).length;

    var wr = GAME.Formations.winRate(f.id);            // 방어 승률(%) 또는 null
    // 비싼 유닛 위주(cost 높고 수는 적음)와 물량형(수 많음)이 서로 다른 값을 갖도록
    // 세 축을 따로 더한다. 구성이 다양할수록 대응이 어려우니 가산.
    var base = 120 + cost * 1.35 + units * 7 + variety * 12;
    if (wr !== null) base += (wr - 50) * 3.2;
    return Math.max(100, Math.round(base));
  },

  findOpponents: function (n) {
    n = n || 3;
    var rec = this.get();
    var me = this._key();
    var self = this;
    var pool = GAME.Formations.loadAll().filter(function (f) {
      if (f.id === rec.baseId) return false;           // 내 기지는 제외
      if (f.author === me) return false;               // 내가 만든 것도 제외
      return f.units && f.units.length;
    });
    var scored = pool.map(function (f) {
      var r = self.ratingOf(f);
      return { formation: f, trophy: r, gap: Math.abs(r - rec.trophy) };
    });
    // 트로피가 가까운 순 — 다만 완전히 같은 상대만 나오면 지루하니 약간 섞는다
    scored.sort(function (a, b) { return (a.gap + Math.random() * 90) - (b.gap + Math.random() * 90); });
    return scored.slice(0, n);
  },

  // ── 공격 결과 ────────────────────────────────────────────────────────────
  recordAttack: function (opponent, won, detail) {
    var rec = this.get();
    var oppTrophy = opponent && opponent.trophy !== undefined
      ? opponent.trophy : this.ratingOf(opponent && opponent.formation);
    var delta = won ? this.gainFor(rec.trophy, oppTrophy) : -this.lossFor(rec.trophy, oppTrophy);
    rec.trophy = Math.max(0, rec.trophy + delta);
    if (rec.trophy > rec.best) rec.best = rec.trophy;
    rec.attacks++;
    if (won) rec.attackWins++;
    this._save(rec);
    return { delta: delta, trophy: rec.trophy, league: this.leagueOf(rec.trophy) };
  },

  // ── 내가 없는 동안의 방어전 ──────────────────────────────────────────────
  // 접속할 때 한 번 호출한다. 마지막 접속 이후 흐른 시간만큼 공격을 '받아' 두고
  // 결과를 기록으로 남긴다. 전투는 게임과 **같은 엔진**으로 돌려서 결과가 거짓이 아니다.
  //
  // 전투 시뮬을 여기서 직접 돌리려면 combat 을 프레임 루프로 굴려야 한다 —
  // 화면 없이 수백 프레임을 도는 건 씬 진입을 늦추므로, **간이 판정**을 쓴다:
  //   AI 공격자의 예산·숙련 대비 내 진형의 예산·구성으로 승률을 계산해 주사위를 굴린다.
  // (정확한 전투가 필요하면 플레이어가 리플레이를 눌렀을 때 실제로 돌린다.)
  ATTACKER_NAMES: ['떠돌이 광전사', '이웃 부족 사냥꾼', '늪지 약탈자', '언덕의 파수꾼',
                   '이름 없는 도전자', '붉은 목도리단', '깨진 껍질단'],

  simulateOfflineDefenses: function () {
    var rec = this.get();
    var base = this.baseFormation();
    var now = Date.now();
    var hours = Math.max(0, (now - (rec.lastSeen || now)) / 3600000);
    rec.lastSeen = now;

    if (!base) { this._save(rec); return []; }         // 기지를 안 정했으면 공격받지 않는다

    var count = Math.min(this.DEFENSE_MAX, Math.floor(hours * this.DEFENSE_PER_HOUR));
    if (count <= 0) { this._save(rec); return []; }

    var myPower = GAME.Formations.budgetOf(base) + base.units.length * 6;
    var fresh = [];
    for (var i = 0; i < count; i++) {
      var attTrophy = Math.max(100, Math.round(rec.trophy + (Math.random() - 0.45) * 220));
      var attPower = 90 + attTrophy * 0.42;
      // 방어 성공 확률 — 내 진형이 셀수록 높다. 0.15~0.85 로 묶어 극단을 막는다.
      var p = 1 / (1 + Math.exp(-(myPower - attPower) / 42));
      p = Math.max(0.15, Math.min(0.85, p));
      var defended = Math.random() < p;
      var delta = defended ? this.gainFor(rec.trophy, attTrophy)
                           : -this.lossFor(rec.trophy, attTrophy);
      rec.trophy = Math.max(0, rec.trophy + delta);
      if (rec.trophy > rec.best) rec.best = rec.trophy;
      rec.defenses++;
      if (defended) rec.defenseWins++;

      var entry = {
        at: now - Math.round(Math.random() * hours * 3600000),
        attacker: this.ATTACKER_NAMES[Math.floor(Math.random() * this.ATTACKER_NAMES.length)],
        attackerTrophy: attTrophy,
        defended: defended,
        delta: delta,
        baseId: base.id,
        baseName: base.name
      };
      rec.log.unshift(entry);
      fresh.push(entry);
    }
    rec.log = rec.log.slice(0, 20);                    // 오래된 기록은 버린다
    this._save(rec);
    return fresh;
  },

  // 아직 안 본 방어 기록 수 (배지용)
  unseenCount: function () {
    var rec = this.get();
    var n = 0;
    for (var i = 0; i < rec.log.length; i++) if (!rec.log[i].seen) n++;
    return n;
  },
  markLogSeen: function () {
    var rec = this.get();
    rec.log.forEach(function (e) { e.seen = true; });
    this._save(rec);
  },

  reset: function () {
    var all = this._all();
    delete all[this._key()];
    GAME.Store.set(this.KEY, all);
  }
};
