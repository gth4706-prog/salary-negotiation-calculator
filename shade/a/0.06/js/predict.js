/**
 * 예측과 보간 — 266ms 를 가린다
 *
 * 실측 왕복지연이 p50 266ms 다. 그대로 그리면 손가락을 움직이고 4분의 1초 뒤에 반응한다.
 * 그래서 **내 얼음만 즉시 예측해 그리고**, 남들은 스냅샷 사이를 보간한다.
 *
 * 서버 값과 어긋났을 때 **순간이동시키지 않는다.** 몇 프레임에 걸쳐 당긴다 —
 * 순간이동은 "게임이 고장났다"로 보이지만 부드러운 보정은 아무도 눈치채지 못한다.
 */
import { C } from '../sim/consts.js';
import { radiusOf, speedOf } from '../sim/world.js';

const LERP_MS = 120;          // 남들을 이만큼 과거에 그린다(스냅샷 간격보다 조금 크게)
const SNAP_DIST = 260;        // 이보다 크게 벌어지면 그냥 맞춘다(순간이동·부활)
const PULL = 0.16;            // 프레임당 보정 비율

export function createView() {
  return {
    me: null,                 // {x,y,r} 예측 좌표
    players: new Map(),       // id → {x,y,r,...,ax,ay,bx,by,t0,t1}
    phase: 0,
    serverT: 0,
    myId: null
  };
}

export function applySnapshot(view, snap, now) {
  view.serverT = snap.t;
  view.phase = snap.phase;

  for (const p of snap.players) {
    let e = view.players.get(p.id);
    if (!e) {
      e = { id: p.id, x: p.x, y: p.y, r: p.r, ax: p.x, ay: p.y, bx: p.x, by: p.y, ar: p.r, br: p.r, t0: now, t1: now };
      view.players.set(p.id, e);
    }
    e.ax = e.x; e.ay = e.y; e.ar = e.r;
    e.bx = p.x; e.by = p.y; e.br = p.r;
    e.t0 = now; e.t1 = now + LERP_MS;
    e.melting = p.melting; e.dashing = p.dashing;
    e.isBot = p.isBot; e.invuln = p.invuln; e.dead = p.dead;
    e.seen = now;
  }
  // 스냅샷에 없는 사람은 나갔다
  for (const [id, e] of view.players) if (e.seen !== now) view.players.delete(id);


  /* 내 얼음 — 서버가 진실이다. 예측과 어긋난 만큼을 목표로 잡고 부드럽게 당긴다 */
  const srv = snap.players.find(p => p.id === view.myId);
  if (srv) {
    if (!view.me) {
      view.me = { x: srv.x, y: srv.y, r: srv.r };
    } else {
      const d = Math.hypot(srv.x - view.me.x, srv.y - view.me.y);
      if (d > SNAP_DIST || srv.dead) { view.me.x = srv.x; view.me.y = srv.y; }
      view.me.tx = srv.x; view.me.ty = srv.y;
    }
    view.me.r = srv.r;
    view.me.dead = srv.dead;
    view.me.melting = srv.melting;
    view.me.invuln = srv.invuln;
    view.me.dashing = srv.dashing;
  }
}

/**
 * 프레임마다. 내 얼음은 입력대로 굴리고, 남들은 보간한다.
 * **서버와 같은 수식을 쓴다**(`sim/world.js` 의 `speedOf`) — 다른 수식으로 예측하면 계속 어긋난다.
 */
export function step(view, dtMs, input, now) {
  const me = view.me;
  if (me && !me.dead) {
    let v = speedOf(me.r);
    if (me.dashing) v *= C.DASH_MUL;
    me.x += Math.cos(input.angle) * v * dtMs / 1000;
    me.y += Math.sin(input.angle) * v * dtMs / 1000;
    const m = me.r * 0.5;
    me.x = Math.max(m, Math.min(C.WORLD - m, me.x));
    me.y = Math.max(m, Math.min(C.WORLD - m, me.y));
    if (me.tx != null) {
      me.x += (me.tx - me.x) * PULL;
      me.y += (me.ty - me.y) * PULL;
    }
  }

  for (const e of view.players.values()) {
    const k = e.t1 > e.t0 ? Math.min(1, (now - e.t0) / (e.t1 - e.t0)) : 1;
    e.x = e.ax + (e.bx - e.ax) * k;
    e.y = e.ay + (e.by - e.ay) * k;
    e.r = e.ar + (e.br - e.ar) * k;
  }
}

export { radiusOf };
