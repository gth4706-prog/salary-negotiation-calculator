/**
 * 봇 — 빈 맵을 막는 장치
 *
 * 접속자가 나 혼자인 상태가 이 게임의 기본값이다. 빈 맵을 보여주면 그대로 나간다.
 *
 * **봇은 이름표에 봇이라고 표시한다.** 사람 수를 부풀려 보이는 건 사용자를 속이는 것이고,
 * 한 번 들키면 게임 전체의 신뢰가 깨진다. 봇이라고 밝혀도 움직이는 상대가 있으면 화면은 산다.
 *
 * 판단 순서(위가 우선):
 *   1. 녹는 중이고 질량이 얼마 안 남았다        → 가장 가까운 그늘
 *   2. 나를 먹을 수 있는 놈이 가깝다             → 반대로 (급하면 대시)
 *   3. 내가 먹을 수 있는 놈이 가깝다             → 추격 (붙었으면 대시)
 *   4. 아니면                                    → 가장 가까운 먹이
 */
import { C } from './consts.js';
import { shadeAt } from './sun.js';
import { join, leave, setInput, radiusOf } from './world.js';

const FLEE_R = 900;
const HUNT_R = 700;

/**
 * 그늘로 도망칠지는 **질량이 아니라 남은 시간**으로 판단한다.
 *
 * 처음엔 "질량 900 미만이면 그늘로"였는데, 시작 질량이 324 라서 봇이 평생 숨기만 하고
 * 먹이를 하나도 안 먹었다(테스트가 잡았다). 324 는 위험한 값이 아니다 —
 * 그 질량으로도 땡볕에서 61초를 버틴다. 위험한 건 작은 게 아니라 **곧 사라지는 것**이다.
 */
const MELT_K = Math.LN2 / C.MELT_HALFLIFE_MS;
const ttlMs = (mass) => Math.log(mass / C.MIN_MASS) / MELT_K;
const FLEE_TTL = 12000;      // 12초 남으면 그늘로
const PANIC_TTL = 4000;      // 4초 남으면 대시까지
const CEILING = 1200;        // 이 위로 크려면 그늘이 필요하다(먹이만으로는 평형)

const NAMES = ['각얼음', '살얼음', '동동이', '빙수', '얼음땡', '슬러시', '고드름',
  '팥빙수', '냉동실', '아이스', '설빙', '차가움'];

/** 봇 이름. 사람이 이 이름을 못 쓰게 막는 건 서버 쪽 책임이다. */
export function botName(s) {
  const base = NAMES[Math.floor(s.rng() * NAMES.length)];
  return base + Math.floor(s.rng() * 90 + 10);
}

/**
 * 그늘을 격자로 미리 찾아 둔다. 매 틱 전 맵을 훑으면 봇 수 × 격자 = 서버가 죽는다.
 * 태양이 움직인 만큼만 다시 만든다.
 */
function shadeIndex(s) {
  if (s._shadeIdxPhase === s.shadowPhase && s._shadeIdx) return s._shadeIdx;
  const pts = [];
  const step = 100;
  for (let x = step / 2; x < C.WORLD; x += step) {
    for (let y = step / 2; y < C.WORLD; y += step) {
      if (shadeAt(s.shadows, x, y) < 1) pts.push({ x, y });
    }
  }
  s._shadeIdx = pts;
  s._shadeIdxPhase = s.shadowPhase;
  return pts;
}

function nearestShade(s, p) {
  const pts = shadeIndex(s);
  let best = null, bd = Infinity;
  for (const q of pts) {
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}

/** 이 봇이 이번 틱에 뭘 할지. 순수 함수 — 상태를 안 바꾼다. */
export function botInput(s, bot) {
  const r = radiusOf(bot.mass);
  let angle = bot.angle, dash = false;

  // 1. 곧 사라진다면 그늘이 먼저다
  const inSun = (bot.sun == null ? shadeAt(s.shadows, bot.x, bot.y) : bot.sun) > 0;
  const ttl = ttlMs(bot.mass);
  if (inSun && ttl < FLEE_TTL) {
    const sh = nearestShade(s, bot);
    if (sh) {
      return { angle: Math.atan2(sh.y - bot.y, sh.x - bot.x), dash: ttl < PANIC_TTL };
    }
  }

  // 2·3. 주변 사람
  let threat = null, td = Infinity, prey = null, pd = Infinity;
  for (const o of s.players.values()) {
    if (o === bot || o.dead) continue;
    const dx = o.x - bot.x, dy = o.y - bot.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const ro = radiusOf(o.mass);
    if (ro > r * C.EAT_RATIO) { if (d < td) { td = d; threat = o; } }
    else if (r > ro * C.EAT_RATIO) { if (d < pd) { pd = d; prey = o; } }
  }

  if (threat && td < FLEE_R) {
    angle = Math.atan2(bot.y - threat.y, bot.x - threat.x);
    if (td < r * 3) dash = true;
    return { angle, dash };
  }
  if (prey && pd < HUNT_R) {
    angle = Math.atan2(prey.y - bot.y, prey.x - bot.x);
    if (pd < r * 2.5) dash = true;
    return { angle, dash };
  }

  // 4. 천장에 닿았으면 그늘로. 먹이만으로는 여기서 평형이라 더 못 큰다(실측 1,200~1,500)
  if (inSun && bot.mass > CEILING) {
    const sh = nearestShade(s, bot);
    if (sh) return { angle: Math.atan2(sh.y - bot.y, sh.x - bot.x), dash: false };
  }

  // 5. 먹이. **그늘에 있는 조각을 더 쳐준다** — 조각도 햇볕에서 녹으니 그늘 쪽이 오래 남고,
  //    거기서 먹으면 나도 안 녹는다. 사람이라면 당연히 그렇게 논다.
  let best = null, bd = Infinity;
  for (const f of s.food.values()) {
    const d = ((f.x - bot.x) ** 2 + (f.y - bot.y) ** 2) * (0.45 + 0.55 * (f.sun == null ? 1 : f.sun));
    if (d < bd) { bd = d; best = f; }
  }
  if (best) angle = Math.atan2(best.y - bot.y, best.x - bot.x);
  else angle = bot.angle + (s.rng() - 0.5) * 0.4;

  return { angle, dash: false };
}

/** 사람 수가 적으면 봇으로 채우고, 사람이 들어오면 뺀다. */
export function ensureBots(s) {
  if (!s.opts.bots) return;
  const list = [...s.players.values()];
  const humans = list.filter(p => !p.isBot).length;
  const bots = list.filter(p => p.isBot);
  const want = Math.max(0, Math.min(C.BOT_FLOOR - humans, C.CAPACITY - humans));

  for (let i = bots.length; i < want; i++) join(s, botName(s), true);
  // 가장 늦게 들어온 봇부터 뺀다 — 오래 큰 봇을 지우면 화면에서 갑자기 사라진다
  for (let i = bots.length - 1; i >= want; i--) leave(s, bots[i].id);
}

/** 서버가 매 틱 부른다. 봇 입력을 세계에 밀어 넣는다. */
export function driveBots(s) {
  for (const p of s.players.values()) {
    if (!p.isBot || p.dead) continue;
    const { angle, dash } = botInput(s, p);
    setInput(s, p.id, angle, dash);
  }
}
