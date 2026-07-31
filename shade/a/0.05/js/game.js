/**
 * 메인 루프 — 위 모듈들을 엮는다.
 *
 * 진입 마찰이 0 이어야 한다. 로그인·동의·설명 없이 닉네임 한 칸과 시작 버튼 하나다.
 * 로비 뒤에서는 **이미 살아 있는 아레나가 돌아간다** — 게임이 어떻게 생겼는지
 * 시작을 누르기 전에 이미 보고 있다.
 */
import { C } from '../sim/consts.js';
import { ARENA } from '../sim/arena.js';
import { createWorld, tick as simTick } from '../sim/world.js';
import { ensureBots, driveBots } from '../sim/bots.js';
import { encodeSnapshot, decodeSnapshot } from '../sim/protocol.js';
import { connect } from './net.js';
import { attachInput } from './input.js';
import { createView, applySnapshot, step } from './predict.js';
import { createRenderer } from './render.js';
import {
  createCoach, coachTick, drawCoach, drawCoachLine, deathLine, drawDeath,
  drawHud, drawDashButton, drawJoystick
} from './hud.js';
import { isNoon } from '../sim/sun.js';

const SERVER = 'https://shade-world.gth3941.workers.dev';

const $ = (s) => document.querySelector(s);
const canvas = $('#game');
const renderer = createRenderer(canvas);
const view = createView();
const coach = createCoach();
const roster = new Map();

let net = null, input = null, running = false;

/* ── 로비 뒤의 살아 있는 아레나 ────────────────────────────────────────────
 * 시작을 누르기 전에 게임이 어떻게 생겼는지 이미 보고 있어야 한다. 설명이 필요 없어진다.
 *
 * **서버에 붙이지 않고 브라우저에서 같은 `sim/` 을 로컬로 굴린다.** 구경만 하는 사람까지
 * 서버 월드를 켜면 아무도 안 노는 시간에 무료 한도를 태우게 된다(비용 규칙 4.2절).
 * 서버·클라이언트가 같은 시뮬레이션 파일을 쓰기 때문에 공짜로 얻는 것이다. */
const demo = { world: createWorld((Date.now() ^ 0x5bf03635) >>> 0), acc: 0, snapAcc: 0 };
function demoStep(dt) {
  demo.acc += dt;
  let guard = 0;
  while (demo.acc >= C.TICK_MS && guard++ < 4) {
    demo.acc -= C.TICK_MS;
    ensureBots(demo.world);
    driveBots(demo.world);
    demo.world.events.length = 0;
    simTick(demo.world, C.TICK_MS);
  }
  demo.snapAcc += dt;
  if (demo.snapAcc < C.SNAP_MS) return;
  demo.snapAcc = 0;
  // 실제와 같은 경로를 태운다 — 인코드→디코드→적용. 데모 전용 렌더 경로를 따로 만들면
  // 그 경로만 멀쩡하고 진짜는 깨져 있는 상태를 못 잡는다.
  applySnapshot(view, decodeSnapshot(encodeSnapshot(demo.world)), performance.now());
  view.arena = ARENA;
  roster.clear();
  for (const p of demo.world.players.values()) roster.set(p.id, { id: p.id, name: p.name, bot: p.isBot, skin: p.skin });
  // 가장 큰 놈을 따라다닌다 — 빈 화면 대신 교전이 보인다
  let big = null;
  for (const p of demo.world.players.values()) if (!p.dead && (!big || p.mass > big.mass)) big = p;
  if (big) { view.myId = big.id; view.me = { x: big.x, y: big.y, r: Math.sqrt(big.mass), melting: big.sun > 0, cold: big.cold }; }
}
let death = null, lastFrame = 0, myName = '';
const opts = {
  reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  colorblind: localStorage.getItem('shade.cb') === '1'
};
let dashBtn = { x: 0, y: 0, r: 44 };
let lastDashAt = -9999;

/* ── 닉네임은 미리 채워 둔다. 아무것도 안 해도 시작할 수 있어야 한다 ── */
function randomName() { return '얼음' + Math.floor(1000 + Math.random() * 9000); }
const nameInput = $('#nick');
nameInput.value = localStorage.getItem('shade.name') || randomName();
$('#reroll').addEventListener('click', (e) => { e.preventDefault(); nameInput.value = randomName(); });

function layoutDash() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const safe = parseFloat(getComputedStyle(document.documentElement)
    .getPropertyValue('--safe-bottom')) || 0;
  dashBtn = { x: vw - 74, y: vh - 96 - safe, r: 44 };
}
window.addEventListener('resize', layoutDash);
layoutDash();

/* ── 시작 ── */
function start() {
  myName = (nameInput.value || '').trim() || randomName();
  localStorage.setItem('shade.name', myName);
  $('#lobby').classList.add('gone');
  // 데모가 남긴 상태를 지운다 — 안 지우면 데모의 큰 얼음이 내 얼음으로 남아
  // 첫 스냅샷이 올 때까지 엉뚱한 크기로 그려진다
  view.me = null; view.myId = null;
  view.players.clear();
  roster.clear();
  if (!input) input = attachInput(canvas, { dashButton: dashBtn });
  if (!net) {
    net = connect(SERVER, myName, {
      status: (s) => {
        const el = $('#status');
        if (s === 'connected') el.classList.add('gone');
        else { el.textContent = '다시 붙는 중…'; el.classList.remove('gone'); }
      },
      message: onMessage,
      snapshot: (snap) => applySnapshot(view, snap, performance.now()),
      rtt: (ms) => { view.rtt = ms; }
    });
  }
  running = true;
}
$('#play').addEventListener('click', start);
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });

function onMessage(m) {
  if (m.t === 'welcome') {
    view.myId = m.you;
    view.arena = m.arena;
    roster.clear();
    for (const r of m.roster) roster.set(r.id, r);
    coach.born = performance.now();
    return;
  }
  if (m.t === 'roster') {
    roster.clear();
    for (const r of m.roster) roster.set(r.id, r);
    return;
  }
  if (m.t === 'died') {
    if (m.id === view.myId) {
      const d = deathLine(m);
      death = {
        at: performance.now(), g: d.g, s: d.s,
        receipt: '크기 ' + m.mass + ' · ' + Math.round((performance.now() - (coach.born || 0)) / 1000) + '초'
      };
      coach.born = performance.now();
    }
    return;
  }
  if (m.t === 'error') {
    $('#status').textContent = m.error === 'world-full'
      ? '지금 사람이 너무 많아요. 잠시 뒤 다시 시도해 주세요.'
      : (m.error === 'bad-name' ? '그 이름은 쓸 수 없어요.' : '연결에 문제가 생겼어요.');
    $('#status').classList.remove('gone');
    $('#lobby').classList.remove('gone');
    running = false;
  }
}

/** 지금 뭘 말해 줘야 하는지 판단할 재료. 안내 문구는 hud.js 가 고른다. */
function situation() {
  const me = view.me;
  if (!me || me.dead) return { danger: false, prey: false, cold: false, noon: false };
  let danger = false, prey = false;
  for (const p of view.players.values()) {
    if (p.dead || p.id === view.myId) continue;
    const d = Math.hypot(p.x - me.x, p.y - me.y);
    if (d > 620) continue;
    if (p.r >= me.r * C.EAT_RATIO) danger = true;
    else if (p.r <= me.r / C.EAT_RATIO) prey = true;
  }
  return { danger, prey, cold: !!(me && me.cold), noon: isNoon(view.phase) };
}

/* ── 순위 ── */
function board() {
  const out = [];
  for (const p of view.players.values()) {
    if (p.dead) continue;
    const r = roster.get(p.id) || {};
    out.push({ id: p.id, name: r.name || '?', mass: Math.round(p.r * p.r), bot: !!r.bot });
  }
  out.sort((a, b) => b.mass - a.mass);
  return out;
}

/* ── 루프 ── */
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(50, now - (lastFrame || now));
  lastFrame = now;

  const inp = running && input ? input.read() : { angle: 0, dash: false };
  if (running && net) {
    if (inp.dash) { lastDashAt = now; coach.dashUsed = true; }
    net.send(inp.angle, inp.dash);
    step(view, dt, inp, now);
    coachTick(coach, view, { now, ...situation(now) });
  } else {
    demoStep(dt);
    step(view, dt, { angle: 0, dash: false }, now);
  }

  const b = board();
  const myRank = b.findIndex(x => x.id === view.myId) + 1;
  const info = renderer.draw(view, {
    arena: view.arena, roster, myId: view.myId, input: inp,
    reduced: opts.reduced, colorblind: opts.colorblind,
    dt, now, leaderId: b.length ? b[0].id : null
  }) || {};

  const ctx = canvas.getContext('2d');
  const dpr = info.dpr || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const W = info.W || canvas.width, H = info.H || canvas.height;
  const zoom = info.zoom || 1;
  const toScreen = (x, y) => ({ x: x * zoom + (info.ox || 0), y: y * zoom + (info.oy || 0) });

  drawCoach(ctx, coach, { now, dpr }, toScreen);
  drawCoachLine(ctx, coach, { now, dpr }, W);
  drawHud(ctx, { dpr, board: b, myRank, safeTop: 0, gearW: 44 * dpr }, W, H, view);
  drawDeath(ctx, death, { now, dpr }, W, H);

  if (input && input.isTouch) {
    drawJoystick(ctx, input.ring, input.knob, input.pull, dpr);
    const cd = Math.min(1, (now - lastDashAt) / C.DASH_CD_MS);
    const pulse = coach.pulseDash && now - coach.pulseDash < 600
      ? 1 - (now - coach.pulseDash) / 600 : 0;
    drawDashButton(ctx, dashBtn, { dpr, cdFrac: cd, pulse });
  }
}
requestAnimationFrame(frame);

/* 설정 */
let perfTimer = null;
$('#gear').addEventListener('click', () => {
  const sheet = $('#sheet');
  sheet.classList.toggle('gone');
  clearInterval(perfTimer);
  if (sheet.classList.contains('gone')) return;
  // 열려 있는 동안만 갱신한다 — 닫힌 시트를 위해 초당 두 번씩 DOM 을 만질 이유가 없다
  const tick = () => {
    const s = renderer.stats();
    $('#perf').textContent = s
      ? `${s.fps}fps · 프레임 ${s.p50}ms(느릴 때 ${s.p95}ms) · ${(s.px / 1e6).toFixed(1)}Mpx @${s.dpr}x`
        + (s.lowSpec ? ' · 가볍게 켜짐' : '')
      : '성능 측정 중…';
  };
  tick();
  perfTimer = setInterval(tick, 500);
});
$('#cb').checked = opts.colorblind;
$('#cb').addEventListener('change', (e) => {
  opts.colorblind = e.target.checked;
  localStorage.setItem('shade.cb', e.target.checked ? '1' : '0');
});
$('#lite').checked = localStorage.getItem('shade.lite') === '1';
if ($('#lite').checked) renderer.forceLowSpec(true);
$('#lite').addEventListener('change', (e) => {
  localStorage.setItem('shade.lite', e.target.checked ? '1' : '0');
  renderer.forceLowSpec(e.target.checked);
});
