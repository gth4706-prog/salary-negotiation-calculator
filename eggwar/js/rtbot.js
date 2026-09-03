window.GAME = window.GAME || {};

// ============================================================================
//  실시간 대전 봇 — 연습 대전(상대가 없어도 실시간 규칙으로 싸운다) (v3.0, 2026-09-02)
//
//  왜 있나: 방 목록이 비면 실시간 대전은 **할 수 있는 게 없었다.** 게임이 성립하려면
//  언제나 한 판은 돌아야 한다. 봇은 실제 대전과 **같은 전투 코드**(록스텝·맵·능력치·
//  구슬·회복 배율)를 탄다 — 연습이 곧 실전의 예고편이어야 한다.
//
//  구조:
//   · 세팅(botSetup) — 상대 클라이언트가 보내던 rtSetup 스냅샷과 같은 모양을 만든다.
//     Battle 은 그것이 사람인지 봇인지 모른다(_rtCompose 가 그대로 스폰).
//   · 두뇌(create) — 상대 팀 영웅을 **록스텝 명령 큐로** 조종한다. AIHero 처럼
//     hero.order 를 직접 쓰지 않는다 — 록스텝 _apply 와 이중 조종이 되고, 스킬은
//     시뮬 영웅이 아니라 큐를 통해야 방향 시전(skillF)이 같은 길을 탄다.
//   · 판정은 전부 시뮬 상태만 읽는다. 난수는 Math.random(로컬 판이라 결정론 무관).
//
//  난이도 3단 — 반응 지연·스킬 사용률·장비 단계. "쉬움"은 초보처럼 늦고 서투르다.
// ============================================================================
GAME.RtBot = {
  LEVELS: {
    easy:   { name: '쉬움',   react: 300, skillRate: 0.40, tier: 1, statBudget: 0,   note: '느리고 서투른 상대' },
    normal: { name: '보통',   react: 150, skillRate: 0.70, tier: 2, statBudget: 90,  note: '실전 감각을 익히기 좋은 상대' },
    hard:   { name: '어려움', react: 50,  skillRate: 0.95, tier: 3, statBudget: 200, note: '카이팅·회복 타이밍까지 챙기는 상대' }
  },
  ORDER: ['easy', 'normal', 'hard'],

  //  ── 봇 세팅 — rtSetup 스냅샷과 같은 모양 ──────────────────────────────────
  botSetup: function (level, seed, avoidHero) {
    var L = this.LEVELS[level] || this.LEVELS.normal;
    var heroes = (GAME.HERO_ORDER || ['vanguard', 'ranger', 'warden']).slice();
    //  같은 영웅 거울전은 재미가 덜하다 — 다른 영웅을 우선하되 하나뿐이면 그대로.
    var pool = heroes.filter(function (h) { return h !== avoidHero; });
    if (!pool.length) pool = heroes;
    var r = this._rng(seed);
    var heroKey = pool[Math.floor(r() * pool.length) % pool.length];
    var HERO = GAME.HEROES && GAME.HEROES[heroKey];
    //  스킬 픽 — 슬롯마다 0..n-1 중 무작위(전부 열려 있다 — 대전 규칙).
    var picks = GAME.defaultSkillPicks ? GAME.defaultSkillPicks() : { Q: 0, W: 0, E: 0, R: 0 };
    if (HERO && HERO.skillOptions) {
      ['Q', 'W', 'E', 'R'].forEach(function (s) {
        var list = HERO.skillOptions[s] || [];
        if (list.length) picks[s] = Math.floor(r() * list.length) % list.length;
      });
    }
    //  장비 — 난이도 단계(tier)까지, 슬롯마다 그 단계 아이템(예산 무시 — 봇은 상점을 안 거친다).
    var items = { weapon: null, armor: null, boots: null, accessory: null };
    var CAT = GAME.TowerShopItems;
    if (CAT && L.tier > 0) {
      ['weapon', 'armor', 'boots', 'accessory'].forEach(function (slot) {
        var list = CAT.CATALOG[slot] || [];
        var idx = Math.min(L.tier, list.length) - 1;
        if (idx >= 0 && r() < 0.85) items[slot] = list[idx].key;
      });
    }
    //  능력치 — 어려움만 조금(탑 방식 굴림 대신 평균 기대치로 고정, 로컬이라 무방).
    var stats = { lv: {}, gain: {}, burn: 0 };
    if (L.statBudget > 0 && GAME.ArenaBuild && GAME.ArenaBuild.RtStats) {
      var RS = GAME.ArenaBuild.RtStats, left = L.statBudget;
      var keys = ['damage', 'hp', 'armor'];
      for (var guard = 0; guard < 40 && left > 0; guard++) {
        var k = keys[guard % keys.length];
        var d = RS.statDef(k);
        if (!d) break;
        var lv = stats.lv[k] || 0, cost = RS.costOf(k, lv);
        if (cost > left) break;
        left -= cost;
        stats.lv[k] = lv + 1;
        stats.gain[k] = (stats.gain[k] || 0) + d.add;
      }
    }
    return { role: 'controller', heroKey: heroKey, picks: picks, items: items, stats: stats,
             rtt: 0, rtScore: 600, bot: level };
  },

  //  결정적 난수(xorshift) — 시드가 같으면 같은 봇 구성(재대결 '다시' 가 같은 상대).
  _rng: function (seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      return (s >>> 0) / 4294967296;
    };
  },

  //  ── 두뇌 ──────────────────────────────────────────────────────────────────
  //  state: 시뮬 상태 · session: Lockstep 세션 · side: 봇 팀 라벨 · level: 난이도
  //  opts(협동, 시즌 2 S-C): { coop: true, heroId: 1 } — `side` 는 록스텝 **자리**(큐 라벨)이고
  //  영웅은 같은 팀('controller')의 `_coopIdx === heroId` 인 영웅이다. 명령마다 h 를 싣는다.
  create: function (state, session, side, level, opts) {
    var L = this.LEVELS[level] || this.LEVELS.normal;
    return new GAME.RtBot.Brain(state, session, side, L, opts);
  }
};

//  협동 파트너 봇 상수 — 예고 반경 회피·후퇴 문턱. tools/rt-coop-audit.js 가 회피 횟수를 센다.
GAME.RtBot.COOP = {
  DODGE_PAD: 26,        //  예고 원 밖으로 얼마나 더 나가나(px)
  ESCORT_NEAR: 150,     //  호위가 이 거리 안이면 호위 먼저
  RETREAT_HP: 0.30,     //  체력 비율 미만이면 후퇴
  RETREAT_UNTIL: 0.45,  //  이 비율까지 회복(물약·회복)되거나 RETREAT_MS 가 지나면 복귀
  RETREAT_MS: 3200,
  RETREAT_DIST: 170
};

GAME.RtBot.Brain = function (state, session, side, L, opts) {
  this.state = state;
  this.session = session;
  this.side = side;
  this.L = L;
  this.reactT = 0;
  this.lastMove = null;        //  마지막으로 보낸 이동 목표(같은 자리 재전송 억제)
  this.casts = 0;              //  진단용 — 스킬 시전 횟수
  this.moves = 0;
  this.fleeUntil = 0;
  //  협동(같은 팀 영웅을 조종) — 없으면 예전 1:1 두뇌 그대로.
  this.coop = !!(opts && opts.coop);
  this.heroId = (opts && opts.heroId !== undefined) ? opts.heroId : 1;
  this.team = this.coop ? 'controller' : side;
  this.dodges = 0;             //  진단용 — 예고 반경 회피 명령 횟수
  this.retreats = 0;           //  진단용 — 저체력 후퇴 진입 횟수
  this._retreatUntil = 0;
};

GAME.RtBot.Brain.prototype._hero = function () {
  var us = this.state.units;
  if (this.coop) {
    for (var j = 0; j < us.length; j++) {
      if (us[j].isHero && us[j].side === 'controller' && us[j]._coopIdx === this.heroId) return us[j];
    }
    return null;
  }
  for (var i = 0; i < us.length; i++) if (us[i].isHero && us[i].side === this.side) return us[i];
  return null;
};

GAME.RtBot.Brain.prototype._enemy = function (h) {
  var us = this.state.units, best = null, bd = Infinity, bestHero = null, bhd = Infinity;
  var boss = null, bossD = Infinity, escort = null, escortD = Infinity;
  var team = this.team;
  for (var i = 0; i < us.length; i++) {
    var u = us[i];
    if (!u.alive || u.side === team || (GAME.Combat.isHazard && GAME.Combat.isHazard(u))) continue;
    if (GAME.Combat.isStealthed && GAME.Combat.isStealthed(u)) continue;   // 은신(시즌2) — 조준 제외
    var d = GAME.Combat.dist(h, u);
    if (u.isHero) { if (d < bhd) { bhd = d; bestHero = u; } }
    if (u.def && u.def.isBoss) { if (d < bossD) { bossD = d; boss = u; } }
    else if (d < escortD) { escortD = d; escort = u; }
    if (d < bd) { bd = d; best = u; }
  }
  if (this.coop) {
    //  협동 — 목표는 보스. 호위가 코앞이면 호위 먼저(등 뒤에 두면 맞기만 한다).
    if (escort && escortD <= GAME.RtBot.COOP.ESCORT_NEAR) return escort;
    return boss || best;
  }
  //  영웅이 있으면 영웅을 노린다(사람 상대와 같다) — 없으면 가장 가까운 유닛.
  return bestHero || best;
};

//  협동 — 적 예고(telegraph) 원 안에 서 있으면 가장 가까운 밖으로 나가는 점. 없으면 null.
//  예고 이펙트는 combat 이 `{kind:'telegraph', x, y, r, t, side}` 로 남긴다(렌더 데이터지만
//  시뮬 상태라 양쪽 같다). 남은 시간이 아주 짧으면(맞기 직전) 어차피 못 나간다 — 건너뛴다.
GAME.RtBot.Brain.prototype._dodgePoint = function (h) {
  var fx = this.state.effects;
  if (!fx || !fx.length) return null;
  var pad = GAME.RtBot.COOP.DODGE_PAD, r0 = (h.def.radius || 16);
  var worst = null, worstT = Infinity;
  for (var i = 0; i < fx.length; i++) {
    var e = fx[i];
    if (!e || e.kind !== 'telegraph' || e.side === this.team) continue;
    if (!(e.t > 90)) continue;
    var dx = h.x - e.x, dy = h.y - e.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d > (e.r || 0) + r0) continue;
    if (e.t < worstT) { worstT = e.t; worst = e; }
  }
  if (!worst) return null;
  var ddx = h.x - worst.x, ddy = h.y - worst.y;
  var dl = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
  //  중심에 서 있으면(dl≈0) 아래쪽(내 진영)으로 나간다.
  var ux = dl < 1 ? 0 : ddx / dl, uy = dl < 1 ? 1 : ddy / dl;
  var want = (worst.r || 0) + r0 + pad;
  return { x: worst.x + ux * want, y: worst.y + uy * want };
};

//  지형 회피 — 목표점이 가시밭/균열 안이면 가장 가까운 밖으로 밀어낸다.
GAME.RtBot.Brain.prototype._safePoint = function (x, y, r) {
  var M = this.state.rtMap;
  if (!M) return { x: x, y: y };
  var rects = (M.thorns || []).concat(M.pits || []);
  for (var i = 0; i < rects.length; i++) {
    var R = rects[i], pad = r + 6;
    if (x > R.x - pad && x < R.x + R.w + pad && y > R.y - pad && y < R.y + R.h + pad) {
      var toL = x - (R.x - pad), toR = (R.x + R.w + pad) - x;
      var toT = y - (R.y - pad), toB = (R.y + R.h + pad) - y;
      var m = Math.min(toL, toR, toT, toB);
      if (m === toL) x = R.x - pad; else if (m === toR) x = R.x + R.w + pad;
      else if (m === toT) y = R.y - pad; else y = R.y + R.h + pad;
    }
  }
  var A = GAME.CONFIG.ARENA;
  x = Math.max(A.x + r + 2, Math.min(A.right - r - 2, x));
  y = Math.max(A.y + r + 2, Math.min(A.bottom - r - 2, y));
  return { x: x, y: y };
};

GAME.RtBot.Brain.prototype._queue = function (cmd) {
  var s = this.session;
  var at = s.tick + s.delay;
  var q = s.cmdsBySide[this.side];
  if (!q[at]) q[at] = [];
  if (this.coop) cmd.h = this.heroId;          //  협동 — 내 영웅 번호(heroOf(seat, h) 라우팅)
  q[at].push(cmd);
};

GAME.RtBot.Brain.prototype.update = function (dtMs) {
  if (this.state.over) return;
  this.reactT -= dtMs;
  if (this.reactT > 0) return;
  this.reactT = this.L.react;

  var h = this._hero();
  if (!h || !h.alive) return;
  var e = this._enemy(h);
  if (!e) return;
  var C = GAME.Combat;
  var d = C.dist(h, e);
  //  실효 사거리 — 세계 전장 규칙(안개 fog 등, 시즌2 S-E `effRange`)이 사거리를 깎으면
  //  봇도 그 사거리로 싸운다. 없으면 def.range 그대로.
  var range = (C.effRange ? C.effRange(h, this.state) : h.def.range) || 60;
  var ranged = range >= 150;
  var hpPct = h.hp / h.maxHp;
  var now = this.state.elapsed;

  //  ── 협동 파트너 — 예고 반경 밖으로 · 저체력 후퇴 (스킬보다 먼저) ─────────────
  if (this.coop) {
    var CO = GAME.RtBot.COOP;
    var dp = this._dodgePoint(h);
    if (dp) {
      var sp = this._safePoint(dp.x, dp.y, h.def.radius || 16);
      this.dodges++;
      this.lastMove = { x: sp.x, y: sp.y };
      this._queue({ kind: 'order', order: { type: 'move', x: sp.x, y: sp.y } });
      this.moves++;
      return;
    }
    if (now < this._retreatUntil && hpPct < CO.RETREAT_UNTIL) {
      //  후퇴 중 — 적에게서 멀어지되 아레나 안에서.
      var rdx = h.x - e.x, rdy = h.y - e.y, rl = Math.sqrt(rdx * rdx + rdy * rdy) || 1;
      var rp = this._safePoint(h.x + rdx / rl * CO.RETREAT_DIST, h.y + rdy / rl * CO.RETREAT_DIST, h.def.radius || 16);
      if (!this.lastMove || Math.abs(this.lastMove.x - rp.x) > 12 || Math.abs(this.lastMove.y - rp.y) > 12) {
        this.lastMove = { x: rp.x, y: rp.y };
        this._queue({ kind: 'order', order: { type: 'move', x: rp.x, y: rp.y } });
        this.moves++;
      }
      //  후퇴 중에도 회복/보호막·물약은 쓴다.
      if (h.potionCharges > 0 && C.usePotion) { this._queue({ kind: 'potion' }); }
      return;
    }
    if (hpPct < CO.RETREAT_HP && now >= this._retreatUntil) {
      this._retreatUntil = now + CO.RETREAT_MS;
      this.retreats++;
    }
  }

  //  ── 스킬 ──────────────────────────────────────────────────────────────
  var slots = ['Q', 'W', 'E', 'R'];
  for (var i = 0; i < slots.length; i++) {
    var slot = slots[i];
    if (!C.skillReady(h, slot)) continue;
    var sk = null;
    for (var j = 0; j < h.skills.length; j++) if (h.skills[j].slot === slot) { sk = h.skills[j]; break; }
    if (!sk) continue;
    if (Math.random() > this.L.skillRate) continue;
    var sustain = !!(sk.healNow || sk.shield);
    if (sk.type === 'buff') {
      //  회복/보호막은 체력 60% 이하에서, 강화 버프는 교전 거리에서.
      if (sustain ? hpPct <= 0.6 : d <= range * 1.3) { this._queue({ kind: 'skillF', slot: slot }); this.casts++; }
      continue;
    }
    var reach = (C.skillReach && C.skillReach(sk)) || range;
    if (sk.type === 'strike' || sk.type === 'pull') reach = Math.max(reach, range);
    if (d <= reach * 1.05) {
      //  좌표 지정형은 적 위치로, 방향형(대시·원뿔)은 skillF(적용 틱의 시선) — 봇은
      //  이동 명령으로 시선이 적을 향해 있으므로 skillF 가 그대로 적을 향한다.
      if (sk.type === 'aoeTarget' || sk.type === 'projectile' || sk.type === 'trap')
        this._queue({ kind: 'skill', slot: slot, x: e.x, y: e.y });
      else this._queue({ kind: 'skillF', slot: slot });
      this.casts++;
    }
  }

  //  ── 이동 ──────────────────────────────────────────────────────────────
  var tx, ty;
  var dx = e.x - h.x, dy = e.y - h.y;
  var len = Math.sqrt(dx * dx + dy * dy) || 1;
  var ux = dx / len, uy = dy / len;
  //  45초가 넘으면 공격적으로 — 서로 물러나기만 하는 교착(실측 6판 중 2판 90초
  //  무승부)을 끊는다. 후퇴·카이팅 후퇴를 접고 붙어서 끝낸다(광란 조건과 같은 발상).
  //  협동은 45초 규칙이 없다 — 상대는 보스라 교착이 아니라 정면 승부고, 후퇴는 위에서 따로 한다.
  var late = !this.coop && now > 45000;
  if (!this.coop && !late && hpPct < 0.35 && now - (this.lastFlee || -99999) > 8000 && Math.random() < 0.7) {
    this.fleeUntil = now + 1800; this.lastFlee = now;
  }
  var flee = !late && now < this.fleeUntil;
  if (flee) {
    tx = h.x - ux * 140; ty = h.y - uy * 140;
  } else if (ranged) {
    //  카이팅 — 사거리의 85% 를 유지, 너무 붙으면 물러난다(후반엔 안 물러난다).
    var want = range * 0.85;
    if (!late && d < range * 0.55) { tx = h.x - ux * 120; ty = h.y - uy * 120; }
    else if (d > want) { tx = e.x - ux * want; ty = e.y - uy * want; }
    else { tx = h.x + uy * 40; ty = h.y - ux * 40; }          //  옆걸음(정지 표적 회피)
  } else {
    //  근접 — 붙는다. 붙었으면 옆돌기.
    if (d > range * 0.8) { tx = e.x - ux * (range * 0.6); ty = e.y - uy * (range * 0.6); }
    else { tx = h.x + uy * 30; ty = h.y - ux * 30; }
  }
  var p = this._safePoint(tx, ty, h.def.radius || 16);
  if (!this.lastMove || Math.abs(this.lastMove.x - p.x) > 12 || Math.abs(this.lastMove.y - p.y) > 12) {
    this.lastMove = { x: p.x, y: p.y };
    this._queue({ kind: 'order', order: { type: 'move', x: p.x, y: p.y } });
    this.moves++;
  }
};
