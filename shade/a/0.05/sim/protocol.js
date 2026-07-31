/**
 * 스냅샷 인코딩 — 서버와 클라이언트가 **같은 이 파일**을 쓴다.
 * 두 벌로 베껴 쓰면 한쪽만 고쳐져도 아무 에러 없이 좌표가 어긋난다.
 *
 * JSON 이 아니라 바이너리인 이유: 플레이어 1명당 8바이트라 24명이 헤더 포함 250바이트 미만이다.
 * JSON 이면 5~10배가 된다. 나가는 메시지는 요금이 안 붙지만, 폰의 하위 회선에서는 크기가 곧 지연이다.
 *
 * **이름·색·봉입물은 스냅샷에 안 싣는다.** 입퇴장 JSON 이벤트로 한 번만 보낸다 —
 * 초당 10번 보내야 할 이유가 없는 값이다.
 */
import { C } from './consts.js';

export const MSG_SNAPSHOT = 1;

const POS = 65535 / C.WORLD;      // 좌표 → uint16. 해상도 0.046px
const R10 = 10;                   // 반지름 ×10

export const FLAG_MELT = 1;
export const FLAG_DASH = 2;
export const FLAG_BOT = 4;
export const FLAG_INVULN = 8;
export const FLAG_DEAD = 16;
export const FLAG_COLD = 32;   // 냉기 지대 안 — 커지는 중

/**
 * @param {object} s   월드 상태
 */
export function encodeSnapshot(s) {
  const players = [...s.players.values()];
  const n = Math.min(players.length, 255);

  const size = 1 + 4 + 2 + 1 + n * 8;
  const buf = new ArrayBuffer(size);
  const v = new DataView(buf);
  let o = 0;

  v.setUint8(o, MSG_SNAPSHOT); o += 1;
  v.setUint32(o, s.t >>> 0); o += 4;
  v.setUint16(o, Math.round(s.phase * 65535)); o += 2;
  v.setUint8(o, n); o += 1;

  for (let i = 0; i < n; i++) {
    const p = players[i];
    let f = 0;
    if (p.sun > 0 && !p.dead) f |= FLAG_MELT;
    if (s.t < p.dashUntil) f |= FLAG_DASH;
    if (p.isBot) f |= FLAG_BOT;
    if (s.t < p.invulnUntil) f |= FLAG_INVULN;
    if (p.dead) f |= FLAG_DEAD;
    if (p.cold && !p.dead) f |= FLAG_COLD;
    v.setUint8(o, p.id); o += 1;
    v.setUint16(o, Math.max(0, Math.min(65535, Math.round(p.x * POS)))); o += 2;
    v.setUint16(o, Math.max(0, Math.min(65535, Math.round(p.y * POS)))); o += 2;
    v.setUint16(o, Math.max(0, Math.min(65535, Math.round(Math.sqrt(p.mass) * R10)))); o += 2;
    v.setUint8(o, f); o += 1;
  }

  return buf;
}

export function decodeSnapshot(buf) {
  const v = new DataView(buf);
  let o = 0;
  const type = v.getUint8(o); o += 1;
  if (type !== MSG_SNAPSHOT) return null;
  const t = v.getUint32(o); o += 4;
  const phase = v.getUint16(o) / 65535; o += 2;
  const n = v.getUint8(o); o += 1;

  const players = [];
  for (let i = 0; i < n; i++) {
    const id = v.getUint8(o); o += 1;
    const x = v.getUint16(o) / POS; o += 2;
    const y = v.getUint16(o) / POS; o += 2;
    const r = v.getUint16(o) / R10; o += 2;
    const f = v.getUint8(o); o += 1;
    players.push({
      id, x, y, r,
      melting: !!(f & FLAG_MELT),
      dashing: !!(f & FLAG_DASH),
      isBot: !!(f & FLAG_BOT),
      invuln: !!(f & FLAG_INVULN),
      dead: !!(f & FLAG_DEAD),
      cold: !!(f & FLAG_COLD)
    });
  }

  return { t, phase, players };
}

/* ── 입력 ──────────────────────────────────────────────────────────────────
 * 각도와 버튼뿐이다. **위치는 절대 안 보낸다** — 서버가 전부 계산하므로
 * 클라이언트를 뜯어고쳐도 순간이동·무적·원격 흡수가 성립하지 않는다.
 * 크기가 작아 JSON 으로 둔다(요금은 개수로 매겨지지 크기로 매겨지지 않는다). */

export function encodeInput(angle, dash) {
  const a = Math.round(((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2) * 256) & 255;
  return JSON.stringify(dash ? { a, d: 1 } : { a });
}

export function decodeInput(str) {
  let m;
  try { m = JSON.parse(str); } catch (e) { return null; }
  if (!m || typeof m !== 'object') return null;
  if (typeof m.a !== 'number' || !Number.isFinite(m.a)) return null;
  const a = ((m.a | 0) % 256 + 256) % 256;
  return { angle: a / 256 * Math.PI * 2, dash: m.d === 1 };
}
