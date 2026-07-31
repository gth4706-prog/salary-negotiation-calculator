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

/** 온보딩 — 튜토리얼 화면 없이. 규칙은 **필요해지는 순간에 그 자리에** 7자 이하로 */
export function createCoach() {
  return {
    born: 0, shownShade: false, shownSun: false, shownDash: false, dashUsed: false,
    notes: []
  };
}

export function coachTick(coach, v, o) {
  const me = v.me;
  if (!me || me.dead) return;
  const age = o.now - (coach.born || (coach.born = o.now));

  if (!coach.shownShade && !me.melting && age < 4000) {
    coach.shownShade = true;
    coach.notes.push({ x: me.x, y: me.y + me.r + 34, s: '그늘 안 — 안 녹는다', until: o.now + 3000 });
  }
  if (!coach.shownSun && me.melting && age < 40000) {
    coach.shownSun = true;
    coach.notes.push({ x: me.x, y: me.y - me.r - 34, s: '햇볕 — 녹는 중', until: o.now + 3000 });
  }
  if (!coach.shownDash && !coach.dashUsed && age > 9000 && age < 40000) {
    coach.shownDash = true;
    coach.pulseDash = o.now;
  }
  coach.notes = coach.notes.filter(n => n.until > o.now);
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

/** 드래그 원점 링 — 원판을 안 그린다. 전장을 가리는 면적이 사실상 0 */
export function drawDragRing(ctx, ring, pull, dpr) {
  if (!ring) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath(); ctx.arc(ring.x * dpr, ring.y * dpr, 22 * dpr, 0, Math.PI * 2); ctx.stroke();
  if (pull > 0.05) {
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.arc(ring.x * dpr, ring.y * dpr, (8 + 14 * pull) * dpr, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}
