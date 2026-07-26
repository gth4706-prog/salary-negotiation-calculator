window.GAME = window.GAME || {};

// 배치도 = { id, name, author, isAI, units:[{type,x,y}] }
// AI 시드 배치도: 유저가 0명이어도 즉시 플레이 가능하게 만드는 콜드스타트 해결책.
GAME.SEED_FORMATIONS = [
  {
    id: 'seed-wall',
    name: '방벽',
    author: 'AI',
    isAI: true,
    tier: '중예산',
    budget: 160,
    units: [
      { type: 'warrior', x: 300, y: 228 }, { type: 'warrior', x: 386, y: 236 },
      { type: 'warrior', x: 472, y: 240 }, { type: 'warrior', x: 558, y: 242 },
      { type: 'warrior', x: 644, y: 240 }, { type: 'warrior', x: 730, y: 236 },
      { type: 'warrior', x: 816, y: 228 }, { type: 'warrior', x: 902, y: 220 },
      { type: 'archer', x: 420, y: 138 }, { type: 'archer', x: 520, y: 128 },
      { type: 'archer', x: 620, y: 128 }, { type: 'archer', x: 720, y: 138 },
      { type: 'archer', x: 600, y: 66 }
    ]
  },
  {
    id: 'seed-crossfire',
    name: '십자포화',
    author: 'AI',
    isAI: true,
    tier: '중예산',
    budget: 160,
    units: [
      { type: 'archer', x: 120, y: 150 }, { type: 'archer', x: 190, y: 96 },
      { type: 'archer', x: 300, y: 78 }, { type: 'archer', x: 900, y: 78 },
      { type: 'archer', x: 1010, y: 96 }, { type: 'archer', x: 1080, y: 150 },
      { type: 'warrior', x: 520, y: 246 }, { type: 'warrior', x: 620, y: 246 },
      { type: 'mage', x: 470, y: 120 }, { type: 'mage', x: 690, y: 120 }
    ]
  },
  {
    id: 'seed-sniper-nest',
    name: '저격 둥지',
    author: 'AI',
    isAI: true,
    tier: '중예산',
    budget: 160,
    units: [
      { type: 'sniper', x: 500, y: 66 }, { type: 'sniper', x: 600, y: 62 },
      { type: 'sniper', x: 700, y: 66 },
      { type: 'warrior', x: 470, y: 242 }, { type: 'warrior', x: 560, y: 246 },
      { type: 'warrior', x: 650, y: 246 }, { type: 'warrior', x: 740, y: 242 }
    ]
  },
  {
    id: 'seed-zone-lock',
    name: '봉쇄진',
    author: 'AI',
    isAI: true,
    tier: '중예산',
    budget: 160,
    units: [
      { type: 'mage', x: 360, y: 116 }, { type: 'mage', x: 520, y: 92 },
      { type: 'mage', x: 680, y: 92 }, { type: 'mage', x: 840, y: 116 },
      { type: 'warrior', x: 430, y: 246 }, { type: 'warrior', x: 540, y: 250 },
      { type: 'warrior', x: 660, y: 250 }, { type: 'warrior', x: 770, y: 246 },
      { type: 'archer', x: 600, y: 190 }
    ]
  }
];

GAME.Formations = {
  STORE_KEY: 'asymgame.formations.v1',
  STATS_KEY: 'asymgame.stats.v1',

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

  // 사용자가 저장한 배치도만
  loadSaved: function () {
    var list = this._safeRead(this.STORE_KEY, []);
    return Array.isArray(list) ? list : [];
  },

  // AI 시드 + 사용자 저장분 전체
  loadAll: function () {
    return GAME.SEED_FORMATIONS.concat(this.loadSaved());
  },

  getById: function (id) {
    var all = this.loadAll();
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === id) return all[i];
    }
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

  // 전적: 전략가 배치도 기준 { win, loss, draw }
  // win = 배치도가 이김(컨트롤러 격퇴), loss = 컨트롤러에게 뚫림
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

  // 컨트롤러는 배치도와 같은 예산을 받는다 (동등 조건)
  budgetOf: function (formation) {
    if (formation && formation.budget) return formation.budget;
    return GAME.CONFIG.BUDGETS[GAME.CONFIG.DEFAULT_TIER];
  },

  random: function () {
    var all = this.loadAll();
    if (!all.length) return null;
    return all[Math.floor(Math.random() * all.length)];
  }
};
