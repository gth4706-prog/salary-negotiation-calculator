/**
 * 조작 — 딱 두 개. 이동(방향)과 버튼 하나.
 *
 * ── 모바일에서 왜 "화면 어디서든 드래그"인가 ──────────────────────────────
 *   터치 지점으로 이동(절대)  기각 — 손가락이 목적지를 덮는다. 세로 화면은 폭이 좁아 최악
 *   고정 가상 조이스틱        기각 — 엄지를 정확히 그 자리에 올려야 한다.
 *                                   "조작이 어렵다" 평의 최대 원인(Egg War 가 이미 겪었다)
 *   화면 어디서든 상대 드래그  채택 — 원판을 안 그리므로 전장을 가리는 면적이 0
 *
 * ── 버튼 하나를 한 손으로 누르는 근거 ─────────────────────────────────────
 * 대시는 발동 순간 방향을 0.25초 잠근다(sim/world.js). 그동안 조향이 필요 없으니
 * **엄지를 떼고 버튼을 눌러도 잃는 것이 없다.** 타협이 아니라 정답이다.
 */

const DRAG_TOP = 0.38;      // 화면 위 38% 는 드래그 영역이 아니다(HUD·전장)
const FULL_AT = 44;         // 44px 끌면 최고속

export function attachInput(canvas, opts) {
  const st = {
    angle: 0,
    dash: false,
    active: false,
    originX: 0, originY: 0, curX: 0, curY: 0,
    pointerId: null,
    /** 화면에 그릴 드래그 원점 링. 없으면 null */
    ring: null,
    isTouch: false
  };
  const dashBtn = opts && opts.dashButton;

  /* ── 마우스(PC) ── */
  canvas.addEventListener('mousemove', (e) => {
    if (st.isTouch) return;
    const r = canvas.getBoundingClientRect();
    st.angle = Math.atan2(e.clientY - r.top - r.height / 2, e.clientX - r.left - r.width / 2);
  });
  canvas.addEventListener('mousedown', (e) => { if (!st.isTouch && e.button === 0) st.dash = true; });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { st.dash = true; e.preventDefault(); }
    const k = { ArrowUp: -Math.PI / 2, ArrowDown: Math.PI / 2, ArrowLeft: Math.PI, ArrowRight: 0 }[e.key];
    if (k != null) { st.angle = k; e.preventDefault(); }
  });

  /* ── 터치(모바일) ── */
  function start(e) {
    st.isTouch = true;
    const tch = e.changedTouches[0];
    if (dashBtn && hitDash(tch, dashBtn)) { st.dash = true; return; }
    if (tch.clientY < window.innerHeight * DRAG_TOP) return;
    st.active = true;
    st.pointerId = tch.identifier;
    st.originX = st.curX = tch.clientX;
    st.originY = st.curY = tch.clientY;
    st.ring = { x: st.originX, y: st.originY };
  }
  function move(e) {
    if (!st.active) return;
    for (const tch of e.changedTouches) {
      if (tch.identifier !== st.pointerId) continue;
      st.curX = tch.clientX; st.curY = tch.clientY;
      const dx = st.curX - st.originX, dy = st.curY - st.originY;
      if (dx * dx + dy * dy > 25) st.angle = Math.atan2(dy, dx);
      // 손가락이 너무 멀어지면 원점을 끌고 온다 — 안 그러면 화면 밖에서 조향이 뻣뻣해진다
      const d = Math.hypot(dx, dy);
      if (d > FULL_AT * 2.2) {
        st.originX = st.curX - dx / d * FULL_AT * 2.2;
        st.originY = st.curY - dy / d * FULL_AT * 2.2;
        st.ring = { x: st.originX, y: st.originY };
      }
    }
  }
  function end(e) {
    for (const tch of e.changedTouches) {
      if (tch.identifier === st.pointerId) { st.active = false; st.pointerId = null; st.ring = null; }
    }
  }
  const o = { passive: false };
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); start(e); }, o);
  canvas.addEventListener('touchmove', (e) => { e.preventDefault(); move(e); }, o);
  canvas.addEventListener('touchend', (e) => { e.preventDefault(); end(e); }, o);
  canvas.addEventListener('touchcancel', (e) => { end(e); }, o);

  function hitDash(t, b) {
    return Math.hypot(t.clientX - b.x, t.clientY - b.y) <= b.r * 1.15;
  }

  return {
    /** 이번 프레임의 입력. 대시는 읽으면 소모된다(한 번 누르면 한 번만 나간다). */
    read() {
      const out = { angle: st.angle, dash: st.dash };
      st.dash = false;
      return out;
    },
    get ring() { return st.ring; },
    /** 손가락 현재 위치 — 조이스틱 손잡이를 그리는 데 쓴다 */
    get knob() { return st.active ? { x: st.curX, y: st.curY } : null; },
    get isTouch() { return st.isTouch; },
    /** 드래그 세기 0~1. 화면 링 크기에만 쓴다(속도는 서버가 크기로 정한다) */
    get pull() {
      if (!st.active) return 0;
      return Math.min(1, Math.hypot(st.curX - st.originX, st.curY - st.originY) / FULL_AT);
    },
    pressDash() { st.dash = true; },
    setTouch() { st.isTouch = true; }
  };
}
