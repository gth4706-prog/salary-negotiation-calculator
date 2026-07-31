/**
 * 서버 연결 — 붙이고, 끊기면 다시 붙이고, 스냅샷을 풀어 준다.
 *
 * **보내는 것은 각도와 대시뿐이다.** 위치는 절대 안 보낸다(sim/protocol.js 참조).
 *
 * 끊겼을 때 **상태를 복원하지 않는다.** 복원하면 불리할 때 일부러 끊어 위기를 넘기는
 * 치트가 생긴다. 다시 붙으면 작은 얼음으로 새로 시작한다 — 비용이 1초라 감수할 만하다.
 */
import { decodeSnapshot, encodeInput } from '../sim/protocol.js';

const MIN_SEND_MS = 100;            // 초당 10회 상한
const ANGLE_EPS = 4 * Math.PI / 180; // 4° 이상 바뀔 때만

export function connect(base, name, on) {
  let ws = null;
  let closed = false;
  let retry = 0;
  let lastSentAngle = null;
  let lastSentAt = 0;
  let pingTimer = null;
  const rtts = [];

  function open() {
    if (closed) return;
    const url = base.replace(/^http/, 'ws') + '/ws?name=' + encodeURIComponent(name);
    try { ws = new WebSocket(url); } catch (e) { return schedule(); }
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      retry = 0;
      on.status && on.status('connected');
      clearInterval(pingTimer);
      pingTimer = setInterval(() => {
        if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'ping', n: Date.now() }));
      }, 3000);
    };

    ws.onmessage = (ev) => {
      if (ev.data instanceof ArrayBuffer) {
        const snap = decodeSnapshot(ev.data);
        if (snap) on.snapshot && on.snapshot(snap);
        return;
      }
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === 'pong') {
        const r = Date.now() - m.n;
        rtts.push(r);
        if (rtts.length > 12) rtts.shift();
        on.rtt && on.rtt(median(rtts));
        return;
      }
      on.message && on.message(m);
    };

    ws.onclose = () => { clearInterval(pingTimer); if (!closed) schedule(); };
    ws.onerror = () => { try { ws.close(); } catch (e) {} };
  }

  /** 지수 백오프. 서버가 죽었을 때 브라우저 수백 개가 초당 한 번씩 두드리면 안 된다. */
  function schedule() {
    on.status && on.status('reconnecting');
    const wait = Math.min(8000, 400 * Math.pow(1.8, retry++));
    setTimeout(open, wait + Math.random() * 200);
  }

  open();

  return {
    /** 각도가 4° 넘게 바뀌었거나 대시를 눌렀을 때만 보낸다 */
    send(angle, dash) {
      if (!ws || ws.readyState !== 1) return false;
      const now = Date.now();
      const moved = lastSentAngle == null ||
        Math.abs(Math.atan2(Math.sin(angle - lastSentAngle), Math.cos(angle - lastSentAngle))) > ANGLE_EPS;
      if (!dash && (!moved || now - lastSentAt < MIN_SEND_MS)) return false;
      ws.send(encodeInput(angle, dash));
      lastSentAngle = angle;
      lastSentAt = now;
      return true;
    },
    get rtt() { return rtts.length ? median(rtts) : null; },
    close() { closed = true; clearInterval(pingTimer); try { ws && ws.close(); } catch (e) {} }
  };
}

function median(a) {
  const s = a.slice().sort((x, y) => x - y);
  return s[s.length >> 1];
}
