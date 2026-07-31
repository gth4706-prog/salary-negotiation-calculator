/**
 * 세계 시뮬레이션 — 유일한 진실
 *
 * 서버가 이걸 20Hz로 굴리고, 클라이언트는 같은 파일로 **자기 얼음만** 예측한다.
 * 그래서 이 파일은 DOM 도 Cloudflare API 도 참조하지 않는다.
 *
 * **`Math.random()` 을 쓰지 않는다.** 상태 안의 PRNG 만 쓴다 —
 * 안 그러면 같은 시드로 같은 판을 재현할 수 없고, desync 가 났을 때 쫓아갈 방법이 사라진다.
 */
import { C } from './consts.js';
import { ARENA, SPAWNS } from './arena.js';
import { buildShadows, shadeAt, sunPhase, sunHeight } from './sun.js';

export const radiusOf = (m) => Math.sqrt(m);
export const speedOf = (r) => C.BASE_SPEED * Math.pow(C.START_R / r, C.SPEED_POW);

const MELT_K = Math.LN2 / C.MELT_HALFLIFE_MS;

/** mulberry32 — 작고 재현되는 난수 */
function rngFrom(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createWorld(seed = 1, opts = {}) {
  const s = {
    t: 0,
    seed: seed >>> 0,
    rng: rngFrom(seed),
    players: new Map(),
    food: new Map(),
    nextId: 1,
    nextFoodId: 1,
    phase: 0,
    shadows: [],
    shadowPhase: -1,
    events: [],                       // 서버가 소비하고 비운다
    opts: { food: opts.food !== false, bots: opts.bots !== false }
  };
  refreshShadows(s);
  if (s.opts.food) while (s.food.size < C.FOOD_TARGET) spawnFood(s);
  return s;
}

/**
 * 그림자는 **태양이 움직인 만큼만** 다시 만든다.
 * 매 틱 새로 만들면 장애물 수 × 20Hz 가 되고, 그게 서버 CPU 의 대부분을 먹는다.
 */
function refreshShadows(s) {
  const p = sunPhase(s.t);
  s.phase = p;
  // 정오에 더 뜨겁다 — 그림자 길이뿐 아니라 **햇볕의 세기**도 하루를 따라 움직인다
  s.heat = C.MELT_DAWN + C.MELT_NOON_ADD * sunHeight(p);
  if (s.shadowPhase < 0 || Math.abs(p - s.shadowPhase) > 0.0008) {   // 약 0.2초마다
    s.shadows = buildShadows(ARENA, p);
    s.shadowPhase = p;
  }
}

function spawnFood(s, x, y) {
  const id = s.nextFoodId++;
  if (s.nextFoodId > 65000) s.nextFoodId = 1;
  s.food.set(id, {
    id,
    x: x != null ? x : s.rng() * C.WORLD,
    y: y != null ? y : s.rng() * C.WORLD,
    life: C.FOOD_LIFE_MS,
    sun: 1
  });
  return id;
}

/** 그늘 안 스폰 지점 하나. 신규·부활 둘 다 여기로 간다. */
function shadeSpawn(s) {
  for (let tryN = 0; tryN < 40; tryN++) {
    const sp = SPAWNS[Math.floor(s.rng() * SPAWNS.length)];
    const a = s.rng() * Math.PI * 2;
    const d = s.rng() * 90;
    const x = Math.max(60, Math.min(C.WORLD - 60, sp.x + Math.cos(a) * d));
    const y = Math.max(60, Math.min(C.WORLD - 60, sp.y + Math.sin(a) * d));
    if (shadeAt(s.shadows, x, y) < 1) return { x, y };
  }
  // 그늘을 못 찾으면(정오 극단) 그림자 도형 중심을 쓴다 — 빈손으로 돌려보내지 않는다
  const sh = s.shadows[Math.floor(s.rng() * s.shadows.length)];
  if (sh) {
    const x = sh.kind === 'poly' ? sh.pts[0].x : sh.cx;
    const y = sh.kind === 'poly' ? sh.pts[0].y : sh.cy;
    return { x: Math.max(60, Math.min(C.WORLD - 60, x)), y: Math.max(60, Math.min(C.WORLD - 60, y)) };
  }
  return { x: C.WORLD / 2, y: C.WORLD / 2 };
}

function uniqueName(s, name) {
  const taken = new Set([...s.players.values()].map(p => p.name));
  if (!taken.has(name)) return name;
  for (let i = 2; i < 100; i++) if (!taken.has(name + i)) return name + i;
  return name + '_';
}

export function join(s, name, isBot = false) {
  if (s.players.size >= C.CAPACITY) return null;
  const id = s.nextId++;
  if (s.nextId > 250) s.nextId = 1;
  const sp = shadeSpawn(s);
  s.players.set(id, {
    id,
    name: uniqueName(s, String(name || '얼음').slice(0, 12)),
    isBot: !!isBot,
    x: sp.x, y: sp.y,
    mass: C.START_MASS,
    angle: s.rng() * Math.PI * 2,
    wantAngle: 0,
    wantDash: false,
    dashUntil: 0,
    dashCdUntil: 0,
    dashDir: 0,
    invulnUntil: 0,
    dead: false,
    respawnAt: 0,
    killedBy: null,
    killerName: null,
    best: C.START_MASS,
    bornAt: s.t,
    frozen: false,                 // 테스트에서 이동을 끌 때만 쓴다
    skin: Math.floor(s.rng() * 96) // 봉입물 모양 12종 × 색 8종
  });
  return id;
}

export function leave(s, id) { s.players.delete(id); }

export function setInput(s, id, angle, dash) {
  const p = s.players.get(id);
  if (!p) return;
  p.wantAngle = angle;
  if (dash) p.wantDash = true;      // 한 번 눌린 건 다음 틱까지 살려 둔다
}

function scatter(s, p) {
  // 죽으면 내 몸이 먹이가 된다 — 연출이 아니라 실제 기제다
  const n = C.CORPSE_PIECES;
  const r = radiusOf(p.mass);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + s.rng() * 0.5;
    const d = r * (0.3 + s.rng() * 0.9);
    spawnFood(s,
      Math.max(4, Math.min(C.WORLD - 4, p.x + Math.cos(a) * d)),
      Math.max(4, Math.min(C.WORLD - 4, p.y + Math.sin(a) * d)));
  }
}

function kill(s, p, cause, killerName) {
  if (p.dead) return;
  p.dead = true;
  p.killedBy = cause;
  p.killerName = killerName || null;
  p.respawnAt = s.t + C.RESPAWN_MS;
  scatter(s, p);
  s.events.push({ e: 'died', id: p.id, cause, by: killerName || null, mass: Math.round(p.mass) });
}

function respawn(s, p) {
  const sp = shadeSpawn(s);
  p.x = sp.x; p.y = sp.y;
  p.mass = C.START_MASS;
  p.dead = false;
  p.killedBy = null;
  p.killerName = null;
  p.invulnUntil = s.t + C.INVULN_MS;
  p.dashUntil = 0;
  p.dashCdUntil = 0;
  p.bornAt = s.t;
  p.best = C.START_MASS;
  s.events.push({ e: 'spawn', id: p.id });
}

export function tick(s, dtMs) {
  const dt = dtMs;
  s.t += dt;
  refreshShadows(s);

  /* ── 부활 ── */
  for (const p of s.players.values()) {
    if (p.dead && s.t >= p.respawnAt) respawn(s, p);
  }

  /* ── 이동 · 녹기 ── */
  for (const p of s.players.values()) {
    if (p.dead) continue;

    // 대시 — 눌린 순간 방향이 잠긴다. 그래서 엄지를 떼고 버튼을 눌러도 잃는 게 없다
    if (p.wantDash) {
      p.wantDash = false;
      if (s.t >= p.dashCdUntil) {
        p.mass *= (1 - C.DASH_COST);
        p.dashUntil = s.t + C.DASH_MS;
        p.dashCdUntil = s.t + C.DASH_CD_MS;
        p.angle = p.wantAngle;
        p.dashDir = p.wantAngle;
        p.dashLockUntil = s.t + C.DASH_LOCK_MS;
      }
    }

    const locked = s.t < (p.dashLockUntil || 0);
    if (!locked) p.angle = p.wantAngle;

    if (!p.frozen) {
      const r = radiusOf(p.mass);
      let v = speedOf(r);
      if (s.t < p.dashUntil) v *= C.DASH_MUL;
      p.x += Math.cos(p.angle) * v * dt / 1000;
      p.y += Math.sin(p.angle) * v * dt / 1000;
      const m = r * 0.5;
      p.x = Math.max(m, Math.min(C.WORLD - m, p.x));
      p.y = Math.max(m, Math.min(C.WORLD - m, p.y));
    }

    // 녹기 — 지수 감소. sun 은 0(그늘)·0.35(나무)·1(땡볕)
    const sun = shadeAt(s.shadows, p.x, p.y);
    p.sun = sun;
    if (sun > 0) p.mass *= Math.exp(-MELT_K * sun * s.heat * dt);

    if (p.mass > p.best) p.best = p.mass;
    if (p.mass <= C.MIN_MASS) {
      kill(s, p, s.t < p.dashCdUntil && s.t - (p.dashCdUntil - C.DASH_CD_MS) < 200 ? 'dash' : 'sun');
    }
  }

  /* ── 조각 녹기 ──
   * 조각의 그늘 판정은 **태양이 움직였을 때만** 다시 한다. 400개 × 20Hz 로 매 틱 재면
   * 서버 CPU 의 대부분을 여기서 쓴다. 태양은 초당 0.75° 라 0.2초 갱신으로 충분하다. */
  if (s.opts.food) {
    const recheck = s.shadowPhase !== s._foodSunPhase;
    if (recheck) s._foodSunPhase = s.shadowPhase;
    for (const f of s.food.values()) {
      if (recheck) f.sun = shadeAt(s.shadows, f.x, f.y);
      f.life -= dt * (f.sun * C.FOOD_SUN_MUL + C.FOOD_LIFE_SHADE);
      if (f.life <= 0) {
        s.food.delete(f.id);
        s.events.push({ e: 'gone', f: f.id });
      }
    }
  }

  /* ── 먹이 ──
   * 전수 비교는 400개 × 24명 = 9,600 회/틱. 격자 없이도 여유롭다.
   * 사람이 늘면 그때 격자를 넣는다(지금 넣으면 안 쓰는 코드를 유지하게 된다). */
  for (const p of s.players.values()) {
    if (p.dead) continue;
    const r = radiusOf(p.mass);
    const rr = r * r;
    for (const f of s.food.values()) {
      const dx = f.x - p.x, dy = f.y - p.y;
      if (dx * dx + dy * dy <= rr) {
        p.mass += C.FOOD_MASS;
        s.food.delete(f.id);
        s.events.push({ e: 'ate', f: f.id });
      }
    }
  }

  /* ── 잡아먹기 ── */
  const alive = [...s.players.values()].filter(p => !p.dead);
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i], b = alive[j];
      if (a.dead || b.dead) continue;
      const ra = radiusOf(a.mass), rb = radiusOf(b.mass);
      const dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      let big = null, small = null, bigR = 0;
      if (ra > rb * C.EAT_RATIO) { big = a; small = b; bigR = ra; }
      else if (rb > ra * C.EAT_RATIO) { big = b; small = a; bigR = rb; }
      if (!big) continue;
      if (d2 > bigR * bigR) continue;
      if (s.t < small.invulnUntil) continue;
      big.mass += small.mass * C.ABSORB;
      kill(s, small, 'eaten', big.name);
    }
  }

  /* ── 먹이 보충 ── */
  if (s.opts.food) {
    let guard = 0;
    while (s.food.size < C.FOOD_TARGET && guard++ < 40) spawnFood(s);
  }

  return s;
}
