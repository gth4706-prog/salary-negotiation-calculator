/**
 * HUD · 온보딩 · 사망 — 화면을 최대한 안 만든다
 *
 * HUD 는 **세 개뿐**이다: 내 크기 / 1위 한 줄 / 설정.
 *
 * 일부러 뺀 것과 이유
 *   녹는 속도 바   체력바로 오해되어 **월드 대신 바를 보게 만든다.** 월드가 이미 4중으로 말한다
 *   접속자 수      어떤 결정도 안 바꾼다
 *   타이머         끝나는 판이 없다
 *   미니맵         정자·파라솔 열이 정적 랜드마크다. 길을 잃으면 그때 넣는다(실측 필요)
 *   대시 쿨다운 숫자  버튼 링이 이미 아날로그로 보여 준다
 *
 * **화면 하단 180px 에는 어떤 정보도 두지 않는다** — 엄지와 손날이 가린다.
 */
import { C } from '../sim/consts.js';
import { worldText } from './iceart.js';

/**
 * 지금 해야 할 일 한 줄 — **계속 떠 있는다**
 *
 * 처음엔 "규칙은 필요해지는 순간에 그 자리에 한 번만" 원칙으로 짧게 띄우고 지웠다.
 * 그런데 만든 사람조차 **"뭘 해야 하는지 모르겠다"**고 했다. 한 번 스쳐 간 문구는
 * 규칙이 안 된다. 특히 .io 는 죽고 다시 시작하는 게 기본이라, 매번 새 상황이 온다.
 *
 * 그래서 **지금 상황에 맞는 한 줄**을 상단에 계속 둔다. 배운 뒤에는(각 상황을 몇 번
 * 겪고 나면) 그 줄은 다시 안 나온다 — 익숙해진 사람 화면을 잡음으로 덮지 않기 위해서다.
 */
const LESSONS = {
  danger: { s: '빨간 고리 = 나를 먹는다. 도망!', cap: 6 },
  melting: { s: '햇볕 — 녹는 중. 그늘로!', cap: 5 },
  shade: { s: '그늘 안 — 안 녹는다', cap: 3 },
  eat: { s: '얼음조각을 먹으면 커진다', cap: 4 },
  hunt: { s: '얇은 테 = 내가 먹을 수 있다', cap: 3 },
  noon: { s: '정오 — 그늘이 사라진다', cap: 99 }
};

export function createCoach() {
  let seen = {};
  try { seen = JSON.parse(localStorage.getItem('shade.learned') || '{}'); } catch (e) {}
  return { born: 0, seen, dashUsed: false, notes: [], line: null, lineAt: 0, lastKey: null };
}

function learn(coach, key) {
  coach.seen[key] = (coach.seen[key] || 0) + 1;
  try { localStorage.setItem('shade.learned', JSON.stringify(coach.seen)); } catch (e) {}
}

/**
 * @param {object} o { now, noon, danger, prey, foodNear }
 */
export function coachTick(coach, v, o) {
  const me = v.me;
  if (!me) { coach.line = null; return; }
  if (!coach.born) coach.born = o.now;
  coach.notes = coach.notes.filter(n => n.until > o.now);
  if (me.dead) { coach.line = null; return; }

  // 위가 급한 순서다. 위험이 있으면 다른 건 말하지 않는다.
  let key = null;
  if (o.danger) key = 'danger';
  else if (o.noon) key = 'noon';
  else if (me.melting) key = 'melting';
  else if (o.prey) key = 'hunt';
  else if (!me.melting && (coach.seen.shade || 0) < LESSONS.shade.cap) key = 'shade';
  else if (o.foodNear) key = 'eat';

  if (key && (coach.seen[key] || 0) < LESSONS[key].cap) {
    if (coach.lastKey !== key) { coach.lastKey = key; coach.lineAt = o.now; learn(coach, key); }
    coach.line = LESSONS[key].s;
  } else {
    coach.line = null;
    if (coach.lastKey !== key) coach.lastKey = key;
  }

  if (!coach.pulseDash && !coach.dashUsed && o.now - coach.born > 9000) coach.pulseDash = o.now;
}

/** 상단 안내 한 줄. HUD 아래, 전장 위. */
export function drawCoachLine(ctx, coach, o, W) {
  if (!coach.line) return;
  const d = o.dpr;
  const y = 62 * d;
  const size = 17 * d;
  ctx.save();
  ctx.font = '800 ' + size + 'px "Gothic A1","Malgun Gothic",system-ui,sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(coach.line).width + 26 * d;
  ctx.globalAlpha = Math.min(1, (o.now - coach.lineAt) / 180);
  ctx.fillStyle = 'rgba(16,32,47,0.72)';
  const h = 30 * d, x = (W - w) / 2;
  ctx.beginPath();
  ctx.moveTo(x + h / 2, y - h / 2);
  ctx.arcTo(x + w, y - h / 2, x + w, y + h / 2, h / 2);
  ctx.arcTo(x + w, y + h / 2, x, y + h / 2, h / 2);
  ctx.arcTo(x, y + h / 2, x, y - h / 2, h / 2);
  ctx.arcTo(x, y - h / 2, x + w, y - h / 2, h / 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(coach.line, W / 2, y);
  ctx.restore();
}

export function drawCoach(ctx, coach, o, toScreen) {
  for (const n of coach.notes) {
    const p = toScreen(n.x, n.y);
    ctx.save();
    ctx.globalAlpha = Math.min(1, (n.until - o.now) / 600);
    worldText(ctx, n.s, p.x, p.y, 22 * o.dpr);
    ctx.restore();
  }
}

/**
 * 사망 — **화면을 안 만든다.** 화면을 띄우면 1초 안에 못 돌아간다.
 * 글리프가 있어서 **글을 안 읽어도 사인이 읽힌다.**
 */
const GLYPH = { sun: '☀', eaten: '▲', dash: '⟫' };
export function deathLine(ev) {
  if (!ev) return null;
  const g = GLYPH[ev.cause] || '☀';
  if (ev.cause === 'eaten') return { g, s: (ev.by || '누군가') + '에게 먹혔다' };
  if (ev.cause === 'dash') return { g, s: '대시하다 녹았다' };
  return { g, s: '녹아버렸다' };
}

export function drawDeath(ctx, death, o, W, H) {
  if (!death) return;
  const age = o.now - death.at;
  if (age > 2600) return;
  const a = age < 200 ? age / 200 : Math.max(0, Math.min(1, (2600 - age) / 500));
  ctx.save();
  ctx.globalAlpha = a;
  const cx = W / 2, cy = H * 0.36;
  worldText(ctx, death.g, cx, cy - 44 * o.dpr, 46 * o.dpr);
  worldText(ctx, death.s, cx, cy + 6 * o.dpr, 27 * o.dpr);
  worldText(ctx, death.receipt, cx, cy + 44 * o.dpr, 17 * o.dpr);
  ctx.restore();
}

/** 상단 40px 띠. 이게 전부다. */
export function drawHud(ctx, o, W, H, v) {
  const dpr = o.dpr;
  const top = 14 * dpr + (o.safeTop || 0);
  ctx.save();

  // 내 크기 — 모든 교전 판단이 이 숫자 하나로 끝난다. 화면에서 유일하게 큰 숫자
  const mass = v.me ? Math.round(v.me.r * v.me.r) : 0;
  worldText(ctx, String(mass), 18 * dpr, top + 14 * dpr, 28 * dpr, 'left');

  // 1위 한 줄. 내가 5위 안이면 내 순위 한 줄 더 — **최대 2줄**
  if (o.board && o.board.length) {
    const first = o.board[0];
    worldText(ctx, '1위 ' + first.name + ' ' + first.mass,
      W - 18 * dpr - (o.gearW || 0), top + 10 * dpr, 15 * dpr, 'right');
    if (o.myRank && o.myRank <= 5 && o.myRank > 1) {
      worldText(ctx, o.myRank + '위 ' + mass,
        W - 18 * dpr - (o.gearW || 0), top + 30 * dpr, 15 * dpr, 'right');
    }
  }
  ctx.restore();
}

/**
 * 대시 버튼 — 지름 88 CSS px(약 23mm). 성인 엄지 접촉면보다 약간 크다.
 * 속을 비운 링이라 아래 전장이 보이고, 쿨다운은 링이 시계 방향으로 채워진다.
 * **깜빡이지 않는다** — 3Hz 이상 점멸은 광과민성 때문에 금지다.
 */
export function drawDashButton(ctx, btn, o) {
  const { x, y, r } = btn;
  const d = o.dpr;
  ctx.save();
  ctx.lineWidth = 3 * d;
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.arc(x * d, y * d, r * d, 0, Math.PI * 2); ctx.stroke();

  if (o.cdFrac > 0 && o.cdFrac < 1) {
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(x * d, y * d, r * d, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * o.cdFrac);
    ctx.stroke();
  } else {
    ctx.strokeStyle = 'rgba(190,235,255,0.95)';
    ctx.beginPath(); ctx.arc(x * d, y * d, r * d, 0, Math.PI * 2); ctx.stroke();
  }

  // 최초 한 번만 맥동한다. 다시는 안 한다
  if (o.pulse) {
    ctx.globalAlpha = o.pulse;
    ctx.strokeStyle = '#fff';
    ctx.beginPath(); ctx.arc(x * d, y * d, r * d * (1 + (1 - o.pulse) * 0.35), 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // 눈 결정 글리프
  ctx.strokeStyle = 'rgba(235,250,255,0.92)';
  ctx.lineWidth = 2.4 * d;
  const s = r * d * 0.42;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI / 3;
    ctx.moveTo(x * d - Math.cos(a) * s, y * d - Math.sin(a) * s);
    ctx.lineTo(x * d + Math.cos(a) * s, y * d + Math.sin(a) * s);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * 조이스틱 — **누른 자리에 생긴다**(플로팅). 고정 스틱은 엄지를 정확히 그 자리에
 * 올려야 해서 "조작이 어렵다"는 평의 가장 큰 원인이다.
 *
 * 처음엔 원판 없이 얇은 링만 그렸다. 전장을 덜 가리기 때문인데, 사용자가 직접
 * "클릭하는 곳에 조이스틱을 만들어달라"고 했다. 손가락이 지금 어디를 가리키는지
 * 눈으로 확인되는 편이 낫다는 판단이고, 그래서 **밑판은 비우고 테두리만** 그려
 * 가림을 줄이는 선에서 절충했다.
 *
 * @param {object} ring   {x,y} 원점(CSS px)
 * @param {object} knob   {x,y} 손가락 현재 위치(CSS px)
 */
export function drawJoystick(ctx, ring, knob, pull, dpr) {
  if (!ring) return;
  const BASE = 46, KNOB = 26;
  const bx = ring.x * dpr, by = ring.y * dpr;
  ctx.save();

  // 밑판 — 속을 아주 옅게만 채운다(완전히 비우면 어디가 중심인지 안 읽힌다)
  ctx.fillStyle = 'rgba(16,32,47,0.13)';
  ctx.beginPath(); ctx.arc(bx, by, BASE * dpr, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 2 * dpr;
  ctx.stroke();

  // 중심 십자 — 원점이 어디인지 한 눈에
  ctx.strokeStyle = 'rgba(255,255,255,0.30)';
  ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath();
  ctx.moveTo(bx - 7 * dpr, by); ctx.lineTo(bx + 7 * dpr, by);
  ctx.moveTo(bx, by - 7 * dpr); ctx.lineTo(bx, by + 7 * dpr);
  ctx.stroke();

  // 손잡이 — 밑판 안으로 물린다. 최고속이면 테두리가 밝아진다
  let kx = bx, ky = by;
  if (knob) {
    const dx = (knob.x - ring.x) * dpr, dy = (knob.y - ring.y) * dpr;
    const d = Math.hypot(dx, dy);
    const max = (BASE - KNOB * 0.55) * dpr;
    const k = d > max ? max / d : 1;
    kx = bx + dx * k; ky = by + dy * k;
  }
  ctx.fillStyle = 'rgba(240,250,255,0.80)';
  ctx.beginPath(); ctx.arc(kx, ky, KNOB * dpr, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = pull >= 0.99 ? 'rgba(255,255,255,0.95)' : 'rgba(22,40,63,0.55)';
  ctx.lineWidth = (pull >= 0.99 ? 3 : 2) * dpr;
  ctx.stroke();

  ctx.restore();
}
