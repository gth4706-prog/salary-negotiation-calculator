window.GAME = window.GAME || {};

// 점수와 랭킹.
//
// ── 두 층으로 되어 있다 ──────────────────────────────────────────────────────
// 1) **종합 점수**(`asymgame.scores.v1`, 예전부터 있던 것)
//    한 판의 성과를 하나의 숫자로 압축한다. 메뉴·결과 화면이 이 값을 읽는다.
// 2) **분류별 기록**(`asymgame.ranks.v1`, v0.41 신설)
//    사용자 요구: "통곡의 탑(최대 층 + 어떤 영웅으로) / 수성의 탑(최대 층) / 대전(트로피)"
//    세 가지를 **따로** 세우고, 각각 7일·전체로 본다. 종합 점수 하나로는
//    "탑을 잘 타는 사람"과 "대전을 잘 하는 사람"이 한 줄에 섞여 비교가 안 된다.
//
// ⚠ 1)을 **지우지 않는다.** 기존 기록(누적 점수·격파 수)이 사라지면 유저가 잃는 게 생긴다.
//    2)는 새 키에 따로 쌓고, 최초 1회 1)과 각 탑 저장소에서 **읽어서** 옮긴다(마이그레이션).
//
// ⚠ 씬 파일(battle/defend/tower…)은 다른 에이전트가 동시에 고치고 있어 손대지 않았다.
//    그래서 분류 판별은 **add() 로 들어온 entry + 전역 상태**만으로 한다:
//      통곡의 탑 → entry.tower (층) · 영웅은 GAME.TowerRun.get() (아직 살아 있는 시점이다)
//      수성의 탑 → entry.formationName 의 '수성의 탑 N층'
//      대전     → GAME.Arena 의 트로피를 표본(sample)으로 찍는다
GAME.Score = {
  KEY: 'asymgame.scores.v1',
  RKEY: 'asymgame.ranks.v1',        // 분류별 기록
  MKEY: 'asymgame.ranks.mig.v1',    // 마이그레이션 완료 표식(1회만 돌게)

  // 세 분류. 화면(rank.js)과 서버(worker.js)가 같은 키를 쓴다.
  KINDS: [
    { k: 'tower',  n: '통곡의 탑', short: '통곡의 탑', unit: '층',
      desc: '영웅 하나로 몇 층까지 올랐는가' },
    { k: 'dtower', n: '수성의 탑', short: '수성의 탑', unit: '층',
      desc: '진형 하나로 영웅을 몇 번 막았는가' },
    { k: 'arena',  n: '대전',      short: '대전',      unit: '점',
      desc: '비동기 대전 트로피 점수' }
  ],
  SCOPES: [
    { k: 'week', n: '7일' },
    { k: 'all',  n: '전체' }
  ],
  kindDef: function (k) {
    for (var i = 0; i < this.KINDS.length; i++) if (this.KINDS[i].k === k) return this.KINDS[i];
    return this.KINDS[0];
  },

  EV_MAX: 150,                 // 분류당 보관 표본 수
  EV_TTL: 30 * 864e5,          // 30일보다 오래된 표본은 버린다(7일 창에는 영향 없다)
  ARENA_MIN_GAP: 30000,        // 같은 트로피를 30초 안에 두 번 찍지 않는다

  // 한 판의 점수
  forResult: function (opts) {
    // opts: { won, asStrategist, budget, escalation, secondsLeft, hpPct, tower }
    if (!opts.won) return 0;
    var s = 0;
    // 통곡의 탑 — 층 자체가 성과다. 층수에 가속을 줘서 위층 한 판이
    // 아래층 여러 판보다 확실히 값지게 한다(랭킹이 반복 노가다로 채워지지 않도록).
    if (opts.tower) {
      var f = opts.tower;
      return Math.round(150 + f * 40 + f * f * 3);
    }
    if (opts.asStrategist) {
      // 전략가 승리: AI 컨트롤러를 막아냈다
      s = 120 + (opts.escalation || 0) * 40 + Math.round((opts.budget || 0) / 3);
    } else {
      // 컨트롤러 승리: 진형을 격파했다
      s = 100
        + (opts.escalation || 0) * 60          // 반복 격파로 오른 난이도
        + Math.round((opts.budget || 0) / 2)   // 상대 진형 규모
        + Math.round((opts.secondsLeft || 0) * 2)
        + Math.round((opts.hpPct || 0) * 50);  // 체력을 남기고 이겼는가
    }
    return Math.max(0, Math.round(s));
  },

  _all: function () { return GAME.Store.get(this.KEY, {}); },

  // 기록 추가
  add: function (id, entry) {
    if (!id) return null;
    // 마이그레이션을 **이 판을 쓰기 전에** 끝낸다. 나중에 돌리면 방금 넣은 판까지
    // 옛 기록으로 읽어 들여 층 기록이 먼저 만들어지고, 뒤이은 _push 가
    // "이미 같은 층이 있다"며 영웅·장비를 못 붙인다(실측: 영웅 칸이 빈 채로 떴다).
    this._ranks();
    var all = this._all();
    var rec = all[id] || { id: id, total: 0, best: 0, rounds: 0, towerBest: 0, entries: [] };
    rec.total += entry.score;
    if (entry.score > rec.best) rec.best = entry.score;
    if (entry.won && !entry.asStrategist) rec.rounds++;
    // 통곡의 탑 최고 층 — 랭킹에 함께 보여줄 별도 성과 지표
    if (entry.tower && entry.won && entry.tower > (rec.towerBest || 0)) {
      rec.towerBest = entry.tower;
    }
    rec.entries.push({
      t: Date.now(), score: entry.score, won: !!entry.won,
      role: entry.asStrategist ? 'S' : 'C',
      esc: entry.escalation || 0, formation: entry.formationName || '',
      tower: entry.tower || 0
    });
    // 무한정 쌓이지 않게 최근 200판만
    if (rec.entries.length > 200) rec.entries = rec.entries.slice(-200);
    all[id] = rec;
    GAME.Store.set(this.KEY, all);

    // ── 분류별 기록 ──
    var kinds = this._kindsOf(entry);
    var now = Date.now();
    if (kinds.tower) {
      this._push(id, 'tower', kinds.tower.f, now,
        { hero: kinds.tower.hero, gear: kinds.tower.gear });
    }
    if (kinds.dtower) this._push(id, 'dtower', kinds.dtower.f, now, null);
    var arena = this.sampleArena(id, now);

    // 서버가 켜져 있으면 전역 랭킹에도 올린다. 실패해도 로컬 기록은 남는다.
    // 새 필드(tower/dtower/trophy/hero/gear)는 **옛 Worker 가 그냥 무시**하므로
    // 서버를 배포하기 전에도 이 호출은 안전하다.
    if (GAME.Api && GAME.Api.enabled()) {
      GAME.Api.postScore({
        id: id, score: entry.score, won: !!entry.won,
        role: entry.asStrategist ? 'S' : 'C',
        esc: entry.escalation || 0, formation: entry.formationName || '',
        tower: kinds.tower ? kinds.tower.f : 0,
        hero: kinds.tower ? kinds.tower.hero : '',
        gear: kinds.tower ? kinds.tower.gear : '',
        dtower: kinds.dtower ? kinds.dtower.f : 0,
        trophy: arena || 0
      });
    }
    return rec;
  },

  of: function (id) {
    return this._all()[id] || { id: id, total: 0, best: 0, rounds: 0, towerBest: 0, entries: [] };
  },

  // 기간별 랭킹(종합 점수). scope: 'live' | 'week' | 'all'
  //   live = 최근 1시간(실시간), week = 최근 7일, all = 전체 누적
  board: function (scope) {
    var all = this._all();
    var now = Date.now();
    var cut = scope === 'live' ? now - 3600e3
            : scope === 'week' ? now - 7 * 864e5
            : 0;

    var rows = Object.keys(all).map(function (id) {
      var rec = all[id];
      if (!cut) {
        return { id: id, score: rec.total, rounds: rec.rounds, best: rec.best,
                 tower: rec.towerBest || 0 };
      }
      var sum = 0, rounds = 0, best = 0, tower = 0;
      for (var i = 0; i < rec.entries.length; i++) {
        var e = rec.entries[i];
        if (e.t < cut) continue;
        sum += e.score;
        if (e.won && e.role === 'C') rounds++;
        if (e.score > best) best = e.score;
        if (e.won && (e.tower || 0) > tower) tower = e.tower;
      }
      return { id: id, score: sum, rounds: rounds, best: best, tower: tower };
    }).filter(function (r) { return r.score > 0; });

    // 차단된 닉네임은 랭킹에서 감춘다
    rows = rows.filter(function (r) { return !GAME.Account.isBlocked(r.id); });
    rows.sort(function (a, b) { return b.score - a.score || b.rounds - a.rounds; });
    return rows;
  },

  rankOf: function (id, scope) {
    var b = this.board(scope);
    for (var i = 0; i < b.length; i++) if (b[i].id === id) return i + 1;
    return null;
  },

  // ════════════════════════════════════════════════════════════════════════
  //  분류별 기록 (통곡의 탑 / 수성의 탑 / 대전)
  // ════════════════════════════════════════════════════════════════════════

  _blank: function (id) {
    return {
      id: id,
      tower:  { best: 0, at: 0, hero: '', gear: '', ev: [] },
      dtower: { best: 0, at: 0, ev: [] },
      arena:  { best: 0, at: 0, ev: [] }
    };
  },

  // 저장소를 읽는다. 최초 1회 **기존 데이터에서 옮겨온다**(기존 키는 건드리지 않는다).
  _ranks: function () {
    var all = GAME.Store.get(this.RKEY, null);
    if (!all) all = {};
    if (!GAME.Store.get(this.MKEY, 0)) {
      all = this._migrate(all);
      GAME.Store.set(this.RKEY, all);
      GAME.Store.set(this.MKEY, 1);
    }
    return all;
  },

  _rec: function (all, id) {
    var r = all[id];
    if (!r) { r = this._blank(id); all[id] = r; }
    // 옛 모양이 섞여 들어와도 깨지지 않게 칸을 채운다
    var ks = ['tower', 'dtower', 'arena'];
    for (var i = 0; i < ks.length; i++) {
      if (!r[ks[i]]) r[ks[i]] = { best: 0, at: 0, ev: [] };
      if (!r[ks[i]].ev) r[ks[i]].ev = [];
    }
    return r;
  },

  _prune: function (bucket, now) {
    var cut = now - this.EV_TTL;
    var out = [];
    for (var i = 0; i < bucket.ev.length; i++) if (bucket.ev[i].t >= cut) out.push(bucket.ev[i]);
    if (out.length > this.EV_MAX) out = out.slice(out.length - this.EV_MAX);
    bucket.ev = out;
  },

  // 표본 하나를 넣는다. best 는 전체 기간 최고치(과거 표본이 잘려나가도 남는다).
  _push: function (id, kind, value, at, extra) {
    if (!id || !(value > 0)) return null;
    var all = this._ranks();
    var rec = this._rec(all, id);
    var b = rec[kind];
    var e = { t: at, v: value };
    if (extra) for (var k in extra) if (extra.hasOwnProperty(k) && extra[k]) e[k] = extra[k];
    b.ev.push(e);
    this._prune(b, at);
    if (value > (b.best || 0)) {
      b.best = value; b.at = at;
      if (extra) { b.hero = extra.hero || ''; b.gear = extra.gear || ''; }
    } else if (value === b.best && extra && extra.hero && !b.hero) {
      // 같은 층을 다시 찍었는데 이번엔 영웅 정보가 있다 → 빈 칸을 채운다.
      // (옛 기록에서 옮겨온 최고 기록에는 영웅이 없다)
      b.hero = extra.hero; b.gear = extra.gear || '';
    }
    GAME.Store.set(this.RKEY, all);
    return b;
  },

  // 이 판이 어느 분류에 속하는지 판별한다.
  _kindsOf: function (entry) {
    var out = { tower: null, dtower: null };
    if (entry.tower && entry.won && !entry.asStrategist) {
      var info = { f: Math.round(entry.tower), hero: '', gear: '' };
      // battle.js 는 Score.add **다음에** TowerRun.clear/end 를 부른다 →
      // 여기서는 아직 그 도전(영웅·장비)이 살아 있다. 순서가 바뀌면 영웅이 빈다.
      var run = (GAME.TowerRun && GAME.TowerRun.get) ? GAME.TowerRun.get() : null;
      if (run) { info.hero = run.heroKey || ''; info.gear = this.gearText(run.items); }
      out.tower = info;
    }
    var m = /수성의 탑\s*(\d+)\s*층/.exec(String(entry.formationName || ''));
    if (m && entry.won && entry.asStrategist) out.dtower = { f: parseInt(m[1], 10) };
    return out;
  },

  // 영웅 표시명 — 키가 사라졌거나 옛 기록이면 키를 그대로 보여준다(거짓말보다 낫다)
  heroName: function (key) {
    if (!key) return '';
    var h = GAME.HEROES && GAME.HEROES[key];
    return (h && h.name) || key;
  },

  // 장비 요약. 무기·방어구·신발까지만 쓴다 —
  // 폰 가로 랭킹 열 폭이 240px 이고 micro(13px) 한 줄이라, 4칸 + 스킬 4개는 물리적으로
  // 안 들어간다. "어떤 유닛으로 했는가"의 핵심은 영웅과 무기·방어구다.
  gearText: function (items) {
    if (!items || !GAME.Items) return '';
    var order = ['weapon', 'armor', 'boots'];
    var out = [];
    for (var i = 0; i < order.length; i++) {
      var key = items[order[i]];
      if (!key) continue;
      var it = GAME.Items.find(order[i], key);
      if (it) out.push(it.name);
    }
    return out.join(' · ');
  },

  // 대전 트로피는 '판마다 생기는 기록'이 아니라 **오르내리는 값**이다.
  // 그래서 판별 대신 표본을 찍는다 — 화면에 들어올 때와 판이 끝날 때.
  // (arena.js 를 감싸지 않는다: 그 파일은 내 담당이 아니고, 감싸면 로드 순서에 매인다.)
  sampleArena: function (id, now) {
    if (!GAME.Arena || !GAME.Arena.get) return 0;
    var cur = GAME.Account && GAME.Account.current ? GAME.Account.current() : null;
    if (!cur || (id && id !== cur)) return 0;    // Arena.get() 은 현재 계정 것만 준다
    var ar;
    try { ar = GAME.Arena.get(); } catch (e) { return 0; }
    if (!ar || !(ar.trophy > 0)) return 0;
    now = now || Date.now();

    var all = this._ranks();
    var rec = this._rec(all, cur);
    var b = rec.arena;
    var last = b.ev.length ? b.ev[b.ev.length - 1] : null;
    var changed = !last || last.v !== ar.trophy;
    if (!changed && (now - last.t) < this.ARENA_MIN_GAP) return ar.trophy;

    if (changed) {
      b.ev.push({ t: now, v: ar.trophy });
      this._prune(b, now);
    } else {
      last.t = now;                              // 같은 값이면 시각만 갱신(표본 폭증 방지)
    }
    var best = Math.max(ar.best || 0, ar.trophy);
    if (best > (b.best || 0)) { b.best = best; b.at = now; }
    GAME.Store.set(this.RKEY, all);
    return ar.trophy;
  },

  // 다른 저장소에 이미 있는 '최고 기록'을 끌어온다 —
  // 이 기능이 생기기 전에 세운 기록도 전체 랭킹에 그대로 뜬다.
  _legacyBests: function (kind) {
    var out = {};
    var src = kind === 'tower'  ? (GAME.Tower && GAME.Tower.KEY)
            : kind === 'dtower' ? (GAME.DefendTower && GAME.DefendTower.KEY)
            : (GAME.Arena && GAME.Arena.KEY);
    if (!src) return out;
    var store = GAME.Store.get(src, {}) || {};
    for (var id in store) {
      if (!store.hasOwnProperty(id) || id === 'guest') continue;
      var r = store[id] || {};
      var v = kind === 'arena' ? Math.max(r.best || 0, r.trophy || 0) : (r.best || 0);
      if (v > 0) out[id] = v;
    }
    return out;
  },

  // 분류별 랭킹. kind: 'tower'|'dtower'|'arena' · scope: 'week'|'all'
  // 반환 행: { id, value, at, hero, gear }
  kindBoard: function (kind, scope) {
    kind = this.kindDef(kind).k;
    this.sampleArena(null, Date.now());          // 화면에 들어올 때 트로피를 한 번 찍는다
    var all = this._ranks();
    var now = Date.now();
    var week = (scope !== 'all');
    var cut = now - 7 * 864e5;
    var rows = [];

    for (var id in all) {
      if (!all.hasOwnProperty(id)) continue;
      var b = (all[id] && all[id][kind]) || null;
      if (!b) continue;
      if (week) {
        var v = 0, at = 0, hero = '', gear = '';
        for (var i = 0; i < (b.ev || []).length; i++) {
          var e = b.ev[i];
          if (e.t < cut) continue;
          if (e.v > v) { v = e.v; at = e.t; hero = e.hero || ''; gear = e.gear || ''; }
        }
        if (v > 0) rows.push({ id: id, value: v, at: at, hero: hero, gear: gear });
      } else if (b.best > 0) {
        rows.push({ id: id, value: b.best, at: b.at || 0, hero: b.hero || '', gear: b.gear || '' });
      }
    }

    // 전체 기간은 옛 저장소의 최고 기록도 합친다
    if (!week) {
      var legacy = this._legacyBests(kind);
      for (var lid in legacy) {
        if (!legacy.hasOwnProperty(lid)) continue;
        var hit = null;
        for (var j = 0; j < rows.length; j++) if (rows[j].id === lid) { hit = rows[j]; break; }
        if (!hit) rows.push({ id: lid, value: legacy[lid], at: 0, hero: '', gear: '' });
        else if (legacy[lid] > hit.value) hit.value = legacy[lid];
      }
    }

    rows = rows.filter(function (r) {
      return r.value > 0 && !(GAME.Account && GAME.Account.isBlocked && GAME.Account.isBlocked(r.id));
    });
    return this.sortRows(rows);
  },

  // 정렬 규칙 — **한 곳에만 둔다**(서버도 같은 규칙을 쓴다).
  //   1) 값 내림차순
  //   2) 동률이면 **먼저 도달한 쪽이 위**(기록 시각 오름차순). 나중에 따라잡은 사람이
  //      앞서는 건 리더보드로서 부정직하다. 시각을 모르는(옛) 기록은 뒤로 보낸다.
  //   3) 그래도 같으면 닉네임 — 새로고침할 때마다 순서가 흔들리지 않게(결정적 정렬).
  sortRows: function (rows) {
    rows.sort(function (a, b) {
      if (b.value !== a.value) return b.value - a.value;
      var aa = a.at || Infinity, bb = b.at || Infinity;
      if (aa !== bb) return aa - bb;
      return String(a.id) < String(b.id) ? -1 : (String(a.id) > String(b.id) ? 1 : 0);
    });
    return rows;
  },

  kindRankOf: function (id, kind, scope) {
    if (!id) return null;
    var b = this.kindBoard(kind, scope);
    for (var i = 0; i < b.length; i++) if (b[i].id === id) return i + 1;
    return null;
  },

  // 내 분류별 최고 기록 (화면 하단 '내 기록' 줄)
  myBest: function (id, kind, scope) {
    if (!id) return null;
    var b = this.kindBoard(kind, scope);
    for (var i = 0; i < b.length; i++) if (b[i].id === id) return b[i];
    return null;
  },

  // ── 마이그레이션 ────────────────────────────────────────────────────────
  // 기존 `asymgame.scores.v1` 의 판별 기록에서 층수를 되살린다.
  // **원본은 읽기만 한다** — 실패해도 잃는 게 없어야 한다.
  _migrate: function (all) {
    var src;
    try { src = this._all() || {}; } catch (e) { src = {}; }
    for (var id in src) {
      if (!src.hasOwnProperty(id)) continue;
      var rec = src[id] || {};
      var r = this._rec(all, id);
      var ents = rec.entries || [];
      for (var i = 0; i < ents.length; i++) {
        var e = ents[i];
        if (!e || !e.won) continue;
        if (e.tower && e.role === 'C') {
          r.tower.ev.push({ t: e.t, v: e.tower });
          if (e.tower > r.tower.best) { r.tower.best = e.tower; r.tower.at = e.t; }
        }
        var m = /수성의 탑\s*(\d+)\s*층/.exec(String(e.formation || ''));
        if (m && e.role === 'S') {
          var f = parseInt(m[1], 10);
          r.dtower.ev.push({ t: e.t, v: f });
          if (f > r.dtower.best) { r.dtower.best = f; r.dtower.at = e.t; }
        }
      }
      // 개별 판이 잘려나갔어도 towerBest 는 남아 있다
      if ((rec.towerBest || 0) > r.tower.best) { r.tower.best = rec.towerBest; r.tower.at = 0; }
    }
    return all;
  },

  // 랭킹 범위를 화면에 정확히 알린다. 서버가 실제로 응답했는지로 판단한다
  // (주소만 설정돼 있고 응답이 없으면 '전체'라고 표시하면 거짓말이 된다).
  // serverOk: true=서버 응답 / false=연결 실패 / 'legacy'=서버는 살아 있으나 옛 버전
  scopeNote: function (serverOk) {
    if (serverOk === true) return '전체 플레이어 기준 (서버 연동)';
    if (serverOk === 'legacy') return '이 브라우저 기준 — 서버가 아직 분류별 랭킹을 지원하지 않습니다';
    if (serverOk === false) return '이 브라우저 기준 — 서버에 연결하지 못했습니다';
    return '이 브라우저에 기록된 ID 기준';
  }
};
