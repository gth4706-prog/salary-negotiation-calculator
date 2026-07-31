window.GAME = window.GAME || {};

// 배치도는 **정규화 좌표(nx, ny: 0~1)** 로 저장한다.
// 세로 모바일과 가로 PC의 아레나 비율이 달라서, 절대 좌표로 저장하면
// 한쪽에서 만든 배치도가 다른 쪽에서 화면 밖으로 나간다.
GAME.SEED_FORMATIONS = [
  {
    id: 'seed-wall', name: '통나무 방벽', author: 'AI', isAI: true,
    tier: '중예산', budget: 160, v: 2,
    units: [
      { type: 'rifleman', nx: 0.24, ny: 0.31 }, { type: 'rifleman', nx: 0.38, ny: 0.33 },
      { type: 'rifleman', nx: 0.50, ny: 0.33 }, { type: 'rifleman', nx: 0.62, ny: 0.33 },
      { type: 'rifleman', nx: 0.76, ny: 0.31 },
      { type: 'bayonet', nx: 0.34, ny: 0.21 }, { type: 'bayonet', nx: 0.50, ny: 0.22 },
      { type: 'bayonet', nx: 0.66, ny: 0.21 },
      { type: 'shieldman', nx: 0.50, ny: 0.11 },
      { type: 'medic', nx: 0.38, ny: 0.07 }
    ]
  },
  {
    id: 'seed-crossfire', name: '십자 사격', author: 'AI', isAI: true,
    tier: '고예산', budget: 220, v: 2,
    units: [
      { type: 'rifleman', nx: 0.08, ny: 0.19 }, { type: 'rifleman', nx: 0.15, ny: 0.11 },
      { type: 'rifleman', nx: 0.26, ny: 0.07 }, { type: 'rifleman', nx: 0.74, ny: 0.07 },
      { type: 'rifleman', nx: 0.85, ny: 0.11 }, { type: 'rifleman', nx: 0.92, ny: 0.19 },
      { type: 'bayonet', nx: 0.50, ny: 0.34 },
      { type: 'grenadier', nx: 0.38, ny: 0.15 }, { type: 'grenadier', nx: 0.62, ny: 0.15 },
      { type: 'sergeant', nx: 0.50, ny: 0.23 },
      { type: 'mine', nx: 0.50, ny: 0.44 }
    ]
  },
  {
    id: 'seed-sniper-nest', name: '투창 언덕', author: 'AI', isAI: true,
    tier: '고예산', budget: 220, v: 2,
    units: [
      { type: 'sniper', nx: 0.42, ny: 0.07 }, { type: 'sniper', nx: 0.58, ny: 0.07 },
      { type: 'bayonet', nx: 0.26, ny: 0.32 }, { type: 'bayonet', nx: 0.38, ny: 0.34 },
      { type: 'bayonet', nx: 0.50, ny: 0.35 }, { type: 'bayonet', nx: 0.62, ny: 0.34 },
      { type: 'bayonet', nx: 0.74, ny: 0.32 },
      { type: 'rifleman', nx: 0.32, ny: 0.22 }, { type: 'rifleman', nx: 0.68, ny: 0.22 },
      { type: 'shieldman', nx: 0.50, ny: 0.21 },
      { type: 'medic', nx: 0.66, ny: 0.13 }
    ]
  },
  {
    id: 'seed-zone-lock', name: '늪지 봉쇄', author: 'AI', isAI: true,
    tier: '고예산', budget: 220, v: 2,
    units: [
      { type: 'grenadier', nx: 0.28, ny: 0.13 }, { type: 'grenadier', nx: 0.50, ny: 0.08 },
      { type: 'grenadier', nx: 0.72, ny: 0.13 },
      { type: 'chemtrooper', nx: 0.38, ny: 0.24 }, { type: 'chemtrooper', nx: 0.62, ny: 0.24 },
      { type: 'bayonet', nx: 0.30, ny: 0.33 }, { type: 'bayonet', nx: 0.43, ny: 0.35 },
      { type: 'bayonet', nx: 0.57, ny: 0.35 }, { type: 'bayonet', nx: 0.70, ny: 0.33 },
      { type: 'bayonet', nx: 0.50, ny: 0.29 }
      // ⚠ 가시덫을 뺐다 (2026-07-31). 늪지기 비용이 30→38 로 오르면서 이 시드가
      //   예산 220 을 236 으로 넘겼다(R-4 가 잡았다). 뺄 것을 고를 때 가시덫을 골랐다 —
      //   기여도 실측에서 뺑뺑이 상대 못때림 100% 로 가장 값을 못 하는 칸이었다.
      //   합계 198 (투석꾼 25×3 + 늪지기 38×2 + 전사 10×5 = 75+76+50 = 201… 실제 201)
    ]
  },
  {
    id: 'seed-mg-nest', name: '쇠뇌 둥지', author: 'AI', isAI: true,
    tier: '고예산', budget: 220, v: 2,
    units: [
      { type: 'mgnest', nx: 0.32, ny: 0.17 }, { type: 'mgnest', nx: 0.68, ny: 0.17 },
      { type: 'shieldman', nx: 0.42, ny: 0.30 }, { type: 'shieldman', nx: 0.58, ny: 0.30 },
      { type: 'medic', nx: 0.50, ny: 0.09 },
      { type: 'bayonet', nx: 0.26, ny: 0.33 },
      { type: 'sergeant', nx: 0.50, ny: 0.22 }
    ]
  }
];

GAME.Formations = {
  STORE_KEY: 'asymgame.formations.v1',
  STATS_KEY: 'asymgame.stats.v1',

  // 구버전 절대좌표가 만들어졌던 아레나(가로 PC 기준) — 마이그레이션용
  LEGACY_ARENA: { x: 20, y: 20, w: 1160, h: 680 },

  _safeRead: function (key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return this._mem && this._mem[key] !== undefined ? this._mem[key] : fallback;
    }
  },

  _safeWrite: function (key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      this._mem = this._mem || {};
      this._mem[key] = value;
    }
  },

  // 정규화 좌표 ↔ 현재 아레나 좌표
  toWorld: function (u) {
    var A = GAME.CONFIG.ARENA;
    return { x: A.x + u.nx * A.w, y: A.y + u.ny * A.h };
  },

  normalize: function (x, y) {
    var A = GAME.CONFIG.ARENA;
    return {
      nx: Math.round(((x - A.x) / A.w) * 1000) / 1000,
      ny: Math.round(((y - A.y) / A.h) * 1000) / 1000
    };
  },

  // 옛 절대좌표 배치도를 정규화 좌표로 올린다
  _migrate: function (f) {
    if (f.v === 2) return f;
    var L = this.LEGACY_ARENA;
    var renames = {
      warrior: 'bayonet', archer: 'rifleman', mage: 'grenadier', sniper: 'sniper'
    };
    f.units = (f.units || []).map(function (u) {
      if (u.nx !== undefined) return u;
      return {
        type: renames[u.type] || u.type,
        nx: Math.round(((u.x - L.x) / L.w) * 1000) / 1000,
        ny: Math.round(((u.y - L.y) / L.h) * 1000) / 1000
      };
    });
    f.v = 2;
    return f;
  },

  loadSaved: function () {
    var list = this._safeRead(this.STORE_KEY, []);
    if (!Array.isArray(list)) return [];
    var self = this;
    var migrated = false;
    list = list.map(function (f) {
      if (f.v !== 2) { migrated = true; return self._migrate(f); }
      return f;
    });
    if (migrated) this._safeWrite(this.STORE_KEY, list);
    return list;
  },

  loadAll: function () {
    return GAME.SEED_FORMATIONS.concat(this.loadSaved());
  },

  // ── 서버에서 받아온 '다른 사람의 기지' ─────────────────────────────────
  // **일부러 loadAll() 에 넣지 않는다.** 넣으면 솔로 진형 선택(select.js)과
  // 회귀 R-5(tools/regress.js 가 loadAll 의 레이팅 범위를 본다)까지 남의 데이터에
  // 흔들린다. 원격 진형은 대전에서만 쓰고, 씬 전환용으로 **id 로 찾히기만** 하면 된다.
  REMOTE_PREFIX: 'srv-',
  _remote: [],

  setRemote: function (rows) {
    var out = [];
    for (var i = 0; i < (rows || []).length; i++) {
      var f = this.fromRemote(rows[i]);
      if (f) out.push(f);
    }
    this._remote = out;
    return out;
  },
  remoteList: function () { return this._remote || []; },

  // 서버 행 → 이 클라이언트가 아는 배치도.
  //  · 닉네임 필터는 **양쪽에서** 돈다. 서버가 통과시킨 이름이라도 여기서 다시 본다
  //    (금칙어 목록이 서버보다 클라이언트에 더 많고, 로컬 차단도 반영해야 한다).
  //  · 모르는 유닛 타입은 버린다. 서버가 새 유닛을 아는데 이 클라이언트가 모를 수
  //    있고, 그때 전투에서 터지면 화면이 통째로 죽는다.
  fromRemote: function (row) {
    if (!row || !row.id || !(row.units instanceof Array) || !row.units.length) return null;
    if (GAME.Account && GAME.Account.validate && !GAME.Account.validate(row.id).ok) return null;
    var units = [];
    for (var i = 0; i < row.units.length; i++) {
      var u = row.units[i];
      if (!u || !u.type || !GAME.UNITS[u.type]) continue;
      var nx = Number(u.nx), ny = Number(u.ny);
      if (!isFinite(nx) || !isFinite(ny)) continue;
      units.push({
        type: u.type,
        nx: Math.min(1, Math.max(0, nx)),
        ny: Math.min(1, Math.max(0, ny))
      });
    }
    if (!units.length) return null;
    return {
      id: this.REMOTE_PREFIX + row.id,
      name: String(row.name || row.id).slice(0, 20),
      author: String(row.id),
      isAI: false, remote: true, v: 2,
      tier: row.tier || GAME.CONFIG.DEFAULT_TIER,
      budget: Number(row.budget) || 0,
      at: Number(row.at) || 0,
      // 그 사람이 예산으로 산 유닛 등급. 없으면 전부 Lv.1 이다(옛 서버 호환).
      unitLv: (row.unitLv && typeof row.unitLv === 'object') ? row.unitLv : null,
      // 서버가 모은 방어 전적 — 격파율 정렬의 근거. 없으면 내 기기 기록으로 대신한다
      // (arena.js `breachRate` 가 그 폴백을 갖고 있다).
      defWin: typeof row.defWin === 'number' ? row.defWin : undefined,
      defTry: typeof row.defTry === 'number' ? row.defTry : undefined,
      units: units
    };
  },

  getById: function (id) {
    // 통곡의 탑 배치도는 그 층에서만 쓰는 임시 배치라 저장소에 넣지 않는다
    if (GAME.Tower && GAME.Tower.pending && GAME.Tower.pending.id === id) {
      return GAME.Tower.pending;
    }
    var rem = this.remoteList();
    for (var r = 0; r < rem.length; r++) if (rem[r].id === id) return rem[r];
    var all = this.loadAll();
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  },

  save: function (formation) {
    var list = this.loadSaved();
    list.push(formation);
    this._safeWrite(this.STORE_KEY, list);
  },

  remove: function (id) {
    var list = this.loadSaved().filter(function (f) { return f.id !== id; });
    this._safeWrite(this.STORE_KEY, list);
  },

  getStats: function (id) {
    var all = this._safeRead(this.STATS_KEY, {});
    return all[id] || { win: 0, loss: 0, draw: 0 };
  },

  recordResult: function (id, outcome) {
    var all = this._safeRead(this.STATS_KEY, {});
    var s = all[id] || { win: 0, loss: 0, draw: 0 };
    if (outcome === 'win') s.win++;
    else if (outcome === 'loss') s.loss++;
    else s.draw++;
    all[id] = s;
    this._safeWrite(this.STATS_KEY, all);
    return s;
  },

  // 배치도의 방어 승률 (%) — 도전 의식을 자극하기 위해 솔직히 공개한다
  winRate: function (id) {
    var s = this.getStats(id);
    var total = s.win + s.loss + s.draw;
    if (total === 0) return null;
    return Math.round((s.win / total) * 100);
  },

  cost: function (formation) {
    var total = 0;
    for (var i = 0; i < formation.units.length; i++) {
      var def = GAME.UNITS[formation.units[i].type];
      if (def) total += def.cost;
    }
    return total;
  },

  newId: function () {
    return 'f-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  },

  // 컨트롤러는 이 예산을 그대로 받는다. 배치도가 선언 예산보다 더 썼다면
  // 그건 진형이 몰래 이득을 본 것이므로, 실제 비용을 예산으로 올려 공정성을 지킨다.
  budgetOf: function (formation) {
    var declared = (formation && formation.budget) || GAME.CONFIG.BUDGETS[GAME.CONFIG.DEFAULT_TIER];
    if (!formation) return declared;
    var actual = this.cost(formation);
    return Math.max(declared, actual);
  },

  // 시드 데이터가 선언 예산을 넘지 않는지 개발 중 확인용
  validateSeeds: function () {
    var bad = [];
    for (var i = 0; i < GAME.SEED_FORMATIONS.length; i++) {
      var f = GAME.SEED_FORMATIONS[i];
      var c = this.cost(f);
      if (c > f.budget) bad.push(f.name + ': 비용 ' + c + ' > 예산 ' + f.budget);
    }
    return bad;
  },

  random: function () {
    var all = this.loadAll();
    if (!all.length) return null;
    return all[Math.floor(Math.random() * all.length)];
  }
};
