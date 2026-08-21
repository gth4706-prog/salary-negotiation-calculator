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
    this.syncedAt = 0;                 // 다음 syncBase 가 즉시 올리게
  },

  //  ── 공성 2번째 기지 (2026-08-21 태현님: "사람당 최대 2개") ────────────────
  setBase2: function (formationId) {
    var rec = this.get();
    rec.baseId2 = formationId;
    this._save(rec);
    this.syncedAt = 0;
  },
  baseFormation2: function () {
    var id = this.get().baseId2;
    return id ? GAME.Formations.getById(id) : null;
    // 기지를 정한 그 순간이 서버에 올릴 시점이다 — 여기서 안 올리면
    // 남의 상대 목록에 내가 영영 안 나타난다. 실패해도 로컬 기지는 그대로다.
    try { this.syncBase(true); } catch (e) { /* 서버 없이도 게임은 돈다 */ }
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

  // ── 상대 목록 구성 (2026-07-29) ──────────────────────────────────────────
  //  사용자 지시: "가능한 **실제 사람이 만든 진형**과 싸우게 하고, 1개도 없을 경우
  //  '랜덤매칭'으로 진행하자."
  //
  //  현실을 먼저 적는다: 라이브 실사용자는 3명이고 누적 30판 남짓이다.
  //  즉 **사람 진형이 0~2개인 상태가 기본값**이다. "AI 를 없앤다"를 문자 그대로
  //  적용하면 대전 화면에 카드가 0~2장만 남아 게임 모드 하나가 죽는다.
  //  그래서 두 경로를 다 세운다 — 우선순위는 이렇게 고정한다:
  //
  //    ① human  다른 플레이어가 서버에 올린 기지        ← 있으면 **무조건 먼저**
  //    ② mine   이 기기에서 내가 만든 배치도            ← 사람이 만들었지만 내 것
  //    ③ random AI 시드 진형 = '랜덤매칭'               ← 빈 칸만 채운다
  //
  //  사람 진형이 1~2개면 같은 상대만 반복하게 되는데, 그 반복 자체는 **막지 않는다.**
  //  그 사람이 유일한 진짜 상대이기 때문이다(숨기면 사람과 싸울 기회가 사라진다).
  //  대신 남는 칸을 ②③ 으로 채워 화면이 비지 않게 하고, **카드마다 출처를 표시**해
  //  랜덤 진형을 사람인 척 내보내지 않는다(matchInfo / sourceLabel).
  // ── 대전 예산은 **양쪽 고정·동일** (2026-07-30, 사용자 지시) ────────────────
  // 탑은 층마다 예산이 달라 '올라갈수록 세진다'가 성립하지만, 대전은 사람 대 사람이라
  // 예산이 다르면 그게 곧 실력 차로 읽힌다. 같은 돈으로 무엇을 사느냐만 남긴다.
  // 이 하나의 예산에서 유닛·영웅·아이템·유닛 등급을 **전부** 산다(js/arenabuild.js).
  //
  // ── 300 → 500 (2026-08-01) ────────────────────────────────────────────────
  //  대전이 통곡의 탑의 8단계 카탈로그를 쓰게 되면서 올렸다(사용자 확인).
  //
  //  실측한 근거:
  //   · 탑 카탈로그의 **1~3단계는 옛 대전 아이템과 완전히 동일**하다(이름·값·효과).
  //     즉 이 카탈로그는 옛 표의 상위 확장이고, 300 이면 예전과 같은 것만 살 수 있다
  //     (영웅 78 + 무기50 + 방어구50 + 신발40 = 218, 남는 82 로 장신구 3단계 70).
  //     → 예산을 안 올리면 4~8단계는 **존재만 하고 영원히 못 사는 장식**이 된다.
  //   · 예산별 진형 두께(AutoFormation 실측): 300→15.8기 · 450→22.4기 ·
  //     500→약 25기 · 650→31.8기 · 900→43.0기.
  //   · 500 이면 컨트롤러가 4~5단계를 고루 갖추거나 한 칸만 6단계로 몰 수 있다.
  //     "고루 vs 한 방"이라는 선택이 생기는 최소 지점이다.
  //
  //  ⚠ **이 값은 잠정이다.** 이 저장소는 가상 컨트롤러 기반 합격 판정을 폐기했고
  //    (CLAUDE.md), 실제로 재 보니 예산 300(현행)에서도 에이전트 승률이 0% 로 나와
  //    균형 판정에 쓸 수 없었다 — 그건 게임이 아니라 에이전트의 실력을 잰 값이다.
  //    게다가 이 폴더에 이미 적힌 경고가 있다: **"고예산일수록 컨트롤러가 유리하다"**
  //    (아이템 효율이 유닛 추가보다 좋다). 즉 올릴수록 컨트롤러 쪽으로 기운다.
  //    → 실제 플레이로 판정하고, 기울면 이 한 줄만 고친다.
  BUDGET: 500,

  OPP_SLOTS: 3,

  // 상대 후보를 출처별로 나눈다. kind 는 그대로 화면에 표시된다.
  candidates: function () {
    var rec = this.get();
    var me = this._key();
    var out = { human: [], mine: [], random: [] };
    var seen = {};
    function push(list, f) {
      if (!f || !f.units || !f.units.length) return;
      if (f.id === rec.baseId) return;                 // 내 기지는 제외
      if (seen[f.id]) return;
      seen[f.id] = 1;
      list.push(f);
    }

    var remote = GAME.Formations.remoteList();
    for (var i = 0; i < remote.length; i++) {
      if (remote[i].author === me) continue;           // 내가 올린 기지는 제외
      push(out.human, remote[i]);
    }
    // 이 기기에 저장된 배치도. build.js 는 작성자를 `'나'` 라는 **고정 문자열**로
    // 저장한다(계정 id 가 아니다) — 그래서 '남이 만든 것'과 구분할 수 없다.
    // 구분이 안 되는 것을 사람 상대로 세면 거짓말이 되므로 ② 칸으로 내린다.
    var saved = GAME.Formations.loadSaved();
    for (var j = 0; j < saved.length; j++) {
      var f = saved[j];
      if (f.isAI) { push(out.random, f); continue; }
      if (f.author && f.author !== '나' && f.author !== me) push(out.human, f);
      else push(out.mine, f);
    }
    // ── AI 시드 진형은 **대전에 내보내지 않는다** (2026-07-29, 사용자 지시) ────
    // "대전에서는 사람이 만든 진형만 나오게." 시드는 콜드스타트용이었지만,
    // 사람이 만든 것과 섞여 나오면 "누구와 싸운 것인지"가 흐려진다.
    // 시드는 솔로 진형 선택(select.js)과 회귀 R-5 에서 계속 쓰이므로 지우지 않고,
    // **여기서만** 빼낸다.
    // ⚠ 그래서 상대가 0명인 상태가 정상적으로 생긴다 — 화면이 그걸 정직하게 말해야 한다.
    return out;
  },

  // ── 진형 순서: 방어 성적이 좋은 것부터 (2026-07-29, 사용자 지시) ────────────
  // "도전 대비 못 깬 횟수, 즉 방어 횟수가 높은 진형을 위에."
  // 표본이 적을수록 확률은 요동친다(1전 1승 = 100%). 그대로 정렬하면 **한 판 이긴
  // 진형이 100전 80승 진형보다 위로 간다.** 그래서 베이지안 보정을 쓴다 —
  // 가상의 무승부 판(PRIOR_N 판, 승률 PRIOR_P)을 섞어 표본이 쌓일수록 실제값에 수렴시킨다.
  DEF_PRIOR_N: 4,
  DEF_PRIOR_P: 0.35,

  // 격파율(%) — **도전당 뚫린 비율**. 낮을수록 단단한 진형이다.
  // 화면에는 이 값을 적고 정렬도 이 값의 오름차순으로 한다(사용자 지시 5번).
  // `Formations.winRate` 는 방어 승률(= 100 − 격파율)이라 뜻이 반대다 —
  // 두 값을 한 화면에 같이 쓰면 반드시 헷갈리므로 대전에서는 격파율만 쓴다.
  breachRate: function (f) {
    if (!f) return null;
    if (typeof f.defTry === 'number' && f.defTry > 0 && typeof f.defWin === 'number') {
      return Math.round((1 - f.defWin / f.defTry) * 100);
    }
    var s = GAME.Formations.getStats(f.id);
    var tot = s.win + s.loss + s.draw;
    if (!tot) return null;
    return Math.round(((s.loss + s.draw * 0.5) / tot) * 100);
  },

  defenseRate: function (f) {
    if (!f) return 0;
    // 서버가 전적을 함께 주면 그것을 쓴다(다른 사람들이 도전한 결과다).
    // 없으면 이 기기의 기록으로 대신한다 — 내가 도전해 본 결과라 표본은 작지만 사실이다.
    var win = (typeof f.defWin === 'number') ? f.defWin : null;
    var tot = (typeof f.defTry === 'number') ? f.defTry : null;
    if (win === null || tot === null) {
      var st = GAME.Formations.getStats(f.id);
      win = st.win; tot = st.win + st.loss + st.draw;
    }
    return (win + this.DEF_PRIOR_N * this.DEF_PRIOR_P) / (tot + this.DEF_PRIOR_N);
  },

  // 같은 닉네임은 하나만 남긴다(사용자 지시 3번). 최신 것을 남긴다 —
  // 진형을 고쳐 올렸으면 옛 것이 목록을 차지하면 안 된다.
  _onePerAuthor: function (list) {
    var byAuthor = {}, out = [];
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      var a = f.author || ('#' + f.id);
      var prev = byAuthor[a];
      if (!prev || (f.at || 0) > (prev.at || 0)) byAuthor[a] = f;
    }
    for (var k in byAuthor) out.push(byAuthor[k]);
    return out;
  },

  humanCount: function () { return this.candidates().human.length; },

  findOpponents: function (n) {
    n = n || this.OPP_SLOTS;
    var rec = this.get();
    var self = this;
    var cand = this.candidates();
    var out = [];

    function take(list, kind) {
      if (out.length >= n) return;
      var scored = self._onePerAuthor(list).map(function (f) {
        return { formation: f, trophy: self.ratingOf(f), def: self.defenseRate(f),
                 kind: kind, human: kind !== 'random', author: f.author || null };
      });
      // **격파율이 낮은 진형이 위**로 온다(2026-07-30 사용자 지시 5번).
      // 격파율 = 도전당 뚫린 비율. 낮다 = 아무도 못 깬 진형 = 도전할 값어치가 크다.
      // `defenseRate` 는 그 반대 방향의 같은 값이고 표본 보정(베이지안)이 들어 있어
      // **정렬은 이쪽으로 한다** — 1전 1승이 100전 80승을 이기지 않게.
      // 화면에 적는 숫자는 `breachRate`(보정 없는 날것)다: 정렬은 공정해야 하지만
      // 표시는 정직해야 하기 때문이다.
      scored.sort(function (a, b) { return b.def - a.def; });
      for (var i = 0; i < scored.length && out.length < n; i++) out.push(scored[i]);
    }

    take(cand.human, 'human');
    take(cand.mine, 'mine');
    return out;
  },

  // 화면이 "지금 누구와 붙는지"를 정직하게 말할 수 있게 요약을 준다.
  matchInfo: function (opps) {
    var n = { human: 0, mine: 0, random: 0 };
    for (var i = 0; i < (opps || []).length; i++) {
      if (n[opps[i].kind] !== undefined) n[opps[i].kind]++;
    }
    // AI 시드를 후보에서 뺐으므로(candidates 참조) 'random' 은 이제 0 이다.
    // 상대가 아예 없는 상태가 정상적으로 생기고, 그때는 **없다고 말해야 한다** —
    // 예전처럼 AI 진형을 채워 넣고 '랜덤매칭'이라 부르면 사람과 겨룬 것처럼 읽힌다.
    var mode = n.human > 0 ? (n.mine > 0 ? 'mixed' : 'human') : (n.mine > 0 ? 'mine' : 'none');
    var note;
    if (mode === 'human') {
      // 화면의 다른 곳은 전부 '격파율'로 말한다 — 여기만 '방어 성적'이면 같은 값을
      // 두 이름으로 부르는 셈이다(사용자가 헷갈릴 첫 지점).
      note = '🧑 다른 사람이 만든 전장 ' + n.human + '개  ·  격파율이 낮은 순서';
    } else if (mode === 'mixed') {
      note = '🧑 남의 전장 ' + n.human + '개  ·  내 전장 ' + n.mine + '개';
    } else if (mode === 'mine') {
      //  ⚠ Phaser Text 는 마크다운을 해석하지 않는다 — 별표가 그대로 글자로 찍힌다.
      note = '아직 다른 사람의 진형이 없어 내 배치도와 겨룹니다';
    } else {
      note = '아직 겨룰 진형이 없습니다 — 배치도를 만들어 기지로 올리면 상대가 생깁니다';
    }
    if (this.remoteState === 'loading') note = '상대를 찾는 중…   ' + note;
    // '왜' 못 받았는지(옛 서버 / 네트워크)는 유저에게 의미가 없다 — 사실만 적는다.
    else if (this.remoteState === 'fail') note += '   (상대 목록을 받지 못했습니다)';
    return { counts: n, mode: mode, note: note };
  },

  // 카드에 붙는 출처 표시 — 이게 "AI 를 사람인 척 내보내지 않는다"의 실물이다.
  sourceLabel: function (o) {
    if (!o) return '';
    if (o.kind === 'human') return '🧑 ' + (o.author || '다른 플레이어');
    if (o.kind === 'mine') return '📕 내 배치도';
    return '🎲 랜덤 진형';
  },

  // ── 서버와 주고받기 ──────────────────────────────────────────────────────
  //  ⚠ 서버가 옛 버전이거나 네트워크가 끊겨도 **여기서 끝난다.** 실패는 상태 표시로만
  //    남고 상대 목록은 ②③ 으로 채워진다 — 대전 화면이 비지 않는 것이 최우선이다.
  REMOTE_TTL: 45000,
  remoteState: 'idle',     // idle | loading | ok | fail | off
  remoteAt: 0,
  syncedAt: 0,
  _pending: null,

  fetchOpponents: function (force) {
    var self = this;
    var now = Date.now();
    if (this._pending) return this._pending;
    if (!force && this.remoteState !== 'idle' && (now - this.remoteAt) < this.REMOTE_TTL) {
      return Promise.resolve(GAME.Formations.remoteList());
    }
    if (!GAME.Api || !GAME.Api.enabled || !GAME.Api.enabled()) {
      this.remoteState = 'off'; this.remoteAt = now;
      return Promise.resolve(GAME.Formations.remoteList());
    }
    this.remoteState = 'loading';
    this._pending = GAME.Api.bases(this._key(), 12).then(function (rows) {
      self._pending = null;
      self.remoteState = 'ok'; self.remoteAt = Date.now();
      return GAME.Formations.setRemote(rows);
    }).catch(function (e) {
      self._pending = null;
      self.remoteState = 'fail'; self.remoteAt = Date.now();
      if (window.console) console.warn('전장 목록을 못 받았습니다(대전은 사람이 만든 전장만 씁니다):', e && e.message);
      return GAME.Formations.remoteList();
    });
    return this._pending;
  },

  // 내 기지를 서버에 올린다 — 남이 나를 상대로 만나려면 이게 있어야 한다.
  // 대전 화면에 들어올 때마다 부르되 10분에 한 번만 실제로 나간다.
  syncBase: function (force) {
    var now = Date.now();
    if (!force && (now - (this.syncedAt || 0)) < 600000) return Promise.resolve(null);
    if (!GAME.Api || !GAME.Api.enabled || !GAME.Api.enabled()) return Promise.resolve(null);
    var base = this.baseFormation();
    if (!base || !base.units || !base.units.length) return Promise.resolve(null);
    if (base.remote) return Promise.resolve(null);     // 남의 기지를 되올리지 않는다
    this.syncedAt = now;
    //  슬롯 2 도 지정돼 있으면 같이 올린다(실패해도 슬롯 1 과 독립).
    var b2 = this.baseFormation2();
    if (b2 && b2.units && b2.units.length && !b2.remote) {
      GAME.Api.postBase(this._key(), b2, this.get().trophy, 2)['catch'](function () { return null; });
    }
    return GAME.Api.postBase(this._key(), base, this.get().trophy, 1);
  },

  // ── 공성 재도전 쿨다운 (2026-08-21 태현님) ─────────────────────────────────
  //  같은 기지를 **깨는 데 성공하면** 24시간 재도전 금지 — 약한 기지 하나로 트로피를
  //  무한 수급하는 어뷰징 차단. 실패 후 재도전(복수전)은 허용 — 도전자가 점수를
  //  거는 쪽이라 어뷰징이 아니다. 서버(/siegeresult)도 같은 규칙으로 이중 차단한다.
  SIEGE_CD_MS: 24 * 3600e3,
  CDKEY: 'eggwar.siegecd',
  _cdAll: function () { return GAME.Store.get(this.CDKEY, {}); },
  _cdMap: function () {
    var all = this._cdAll();
    var m = all[this._key()] || {};
    //  지난 것은 청소한다 — 안 하면 계정당 무한히 쌓인다.
    var now = Date.now(), dirty = false;
    for (var k in m) {
      if (m.hasOwnProperty(k) && now - m[k] > this.SIEGE_CD_MS) { delete m[k]; dirty = true; }
    }
    if (dirty) { all[this._key()] = m; GAME.Store.set(this.CDKEY, all); }
    return m;
  },
  recordSiegeWin: function (author, slot) {
    if (!author) return;
    var all = this._cdAll();
    var m = all[this._key()] || {};
    m[author + '#' + (slot === 2 ? 2 : 1)] = Date.now();
    all[this._key()] = m;
    GAME.Store.set(this.CDKEY, all);
  },
  siegeCdLeft: function (author, slot) {
    if (!author) return 0;
    var t = this._cdMap()[author + '#' + (slot === 2 ? 2 : 1)];
    if (!t) return 0;
    return Math.max(0, this.SIEGE_CD_MS - (Date.now() - t));
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
