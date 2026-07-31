/**
 * 화면 — 정오의 아파트 단지 놀이터
 *
 * ── 그늘을 반투명 검정으로 칠하지 않는 이유 ───────────────────────────────
 * 흔한 구현은 그림자 폴리곤을 rgba(0,0,0,0.35) 로 덮는 것이다. 세 가지로 기각했다.
 *
 *  1. 물리적으로 틀렸다. 한낮의 그늘은 회색이 아니라 **파랗다** — 직사광이 막히면
 *     그 자리를 하늘 산란광(10000K+)이 채운다. 진짜 차이는 명도가 아니라 색온도이고,
 *     이걸 쓰면 명도 채널을 통째로 게임 정보용으로 아낄 수 있다.
 *  2. 게임적으로 거꾸로다. 그늘은 안전지대라 사람이 몰리고 교전이 일어난다.
 *     **가장 붐비는 곳을 가장 어둡게 만드는 건 가독성 예산을 정확히 반대로 쓰는 것이다.**
 *  3. 이 게임에서 유일하게 좋은 곳이 음침해 보이면 안 된다.
 *
 * 그래서 **역전 합성**을 쓴다. 바닥을 그늘 색(= 진짜 색)으로 전부 그린 뒤,
 * 햇볕 영역에만 따뜻한 표백을 얹는다. `evenodd` 덕분에 "전체에서 그림자를 뺀 영역"을
 * 역계산 없이 드로우콜 **한 번**에 칠한다.
 */
import { C } from '../sim/consts.js';
import { buildShadows, shadowDir, isNoon, noonLeftMs, sunHeight } from '../sim/sun.js';
import { drawIce, drawShard, worldText, PAL, colorOf } from './iceart.js';

/**
 * 바닥 — **명도를 거의 붙여 놓았다.**
 *
 * 처음엔 고무포장·콘크리트·잔디·흙을 명확히 다른 색으로 칠했다. 그랬더니 사용자가
 * **"바닥 색깔이 왜 다른지 모르겠다"**고 했다. 맞는 지적이다 — 그 색들은 아무 뜻도 없는데
 * 화면에서 가장 눈에 띄니까, 플레이어가 **없는 규칙을 읽으려고 애쓴다.**
 * 진짜 정보인 그늘/햇볕은 그 아래 깔려서 묻혔다.
 *
 * 그래서 바닥은 **질감**으로 내리고(색상만 조금 다르고 밝기는 거의 같다),
 * 명도 채널은 통째로 그늘/햇볕에 준다. 장소감은 남기되 정보인 척은 안 하게.
 */
const GROUND = {
  rubber: '#7A5A52', concrete: '#6E6A6E', grass: '#5A6A54',
  water: '#3E6A78', dirt: '#6E6152'
};
const OBST = { block: '#4A5568', parasol: '#7A4A52', tree: '#2F4A38' };

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  let shadows = null, shadowPhase = -1;
  /** 카메라 상태 — 목표를 부드럽게 따라간다. `lx/ly` 는 진행 방향으로 앞서 보는 양 */
  const cam = { x: null, y: null, lx: 0, ly: 0 };
  let dpr = 1;
  const frames = [];
  let lowSpec = false;

  function resize() {
    // **DPR 상한 1.5.** 2.0 으로 두면 픽셀이 1.8배가 되는데, 이 게임 화면은
    // 큰 색면과 굵은 도형이라 그만큼의 선명함을 못 돌려받는다.
    // 햇볕 합성이 화면 전체를 한 번 훑기 때문에 픽셀 수가 곧 프레임 시간이다.
    const want = Math.min(window.devicePixelRatio || 1, lowSpec ? 1.25 : 1.5);
    dpr = want;
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
  }
  window.addEventListener('resize', resize);

  /** 프레임 시간이 22ms 를 넘으면 저사양 모드로 자동 전환 */
  function watchPerf(dt) {
    frames.push(dt);
    if (frames.length > 120) frames.shift();
    if (frames.length === 120 && !lowSpec) {
      const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
      if (avg > 22) { lowSpec = true; resize(); }
    }
  }

  function shadowsFor(arena, phase) {
    // 태양이 움직인 만큼만 다시 만든다. 매 프레임 만들면 저사양 폰에서 이것만으로 예산을 다 쓴다
    if (!shadows || Math.abs(phase - shadowPhase) > 0.0012) {
      shadows = buildShadows(arena, phase);
      shadowPhase = phase;
    }
    return shadows;
  }

  /**
   * 화면에 걸리는 그림자만 경로에 넣는다.
   *
   * 가로수길을 넣으면서 장애물이 18 → 63개가 됐고 그림자 도형이 250개를 넘었다.
   * 그걸 매 프레임 전부 경로로 만들어 채우기 1번 + 테두리 2번, 즉 **세 번** 훑으면
   * 프레임이 끊긴다(사용자가 실제로 느꼈다). 줌이 3.6배까지 가므로 화면에 걸리는 것은
   * 보통 열 개 남짓이다 — 나머지는 그릴 이유가 없다.
   *
   * 바깥 사각형도 월드 전체(3000×3000)가 아니라 **보이는 만큼만** 잡는다.
   * evenodd 로 뒤집을 면적 자체가 줄어든다.
   */
  /**
   * 경로를 **매 프레임 다시 만들지 않는다.**
   *
   * 그림자 도형은 월드 좌표라 카메라가 움직여도 모양이 안 바뀐다. 바뀌는 건
   * "어디까지 걸러낼까"뿐이므로, 컬링 범위를 넉넉히 잡아 두면 카메라가 조금 움직이는 동안
   * 같은 경로를 계속 쓸 수 있다. 태양이 움직였거나 카메라가 많이 옮겨 갔을 때만 다시 만든다.
   */
  let pathCache = null, pcPhase = -1, pcX = 0, pcY = 0;
  function cachedPath(list, phase, cx, cy, halfW, halfH) {
    const grow = 420;
    if (pathCache && Math.abs(phase - pcPhase) < 0.0012 &&
        Math.abs(cx - pcX) < grow * 0.6 && Math.abs(cy - pcY) < grow * 0.6) {
      return pathCache;
    }
    pcPhase = phase; pcX = cx; pcY = cy;
    pathCache = shadowPath(list, cx - halfW - grow, cy - halfH - grow,
      cx + halfW + grow, cy + halfH + grow);
    return pathCache;
  }

  function shadowPath(list, vx0, vy0, vx1, vy1) {
    const p = new Path2D();
    p.rect(vx0, vy0, vx1 - vx0, vy1 - vy0);
    for (const s of list) {
      if (s.cx + s.hx < vx0 || s.cx - s.hx > vx1 ||
          s.cy + s.hy < vy0 || s.cy - s.hy > vy1) continue;
      if (s.kind === 'ellipse') {
        p.moveTo(s.cx + s.a, s.cy);
        p.ellipse(s.cx, s.cy, s.a, s.b, Math.atan2(s.uy, s.ux), 0, Math.PI * 2);
      } else if (s.kind === 'disc') {
        p.moveTo(s.cx + s.r, s.cy);
        p.arc(s.cx, s.cy, s.r, 0, Math.PI * 2);
      } else {
        p.moveTo(s.pts[0].x, s.pts[0].y);
        for (let i = 1; i < s.pts.length; i++) p.lineTo(s.pts[i].x, s.pts[i].y);
        p.closePath();
      }
    }
    return p;
  }

  /**
   * @param {object} v   view (predict.js)
   * @param {object} o   { arena, roster, myId, input, reduced, colorblind, dt, now, leaderId }
   */
  function draw(v, o) {
    watchPerf(o.dt);
    if (canvas.width !== Math.round(canvas.clientWidth * dpr)) resize();

    const W = canvas.width, H = canvas.height;
    const portrait = H > W;
    const me = v.me;
    const myR = me ? me.r : C.START_R;

    /* ── 카메라 ────────────────────────────────────────────────────────────
     * 처음엔 "내 반지름을 항상 화면 46px 로 고정"했다. 화면상 크기가 곧 상대 크기가 되니까.
     * 그런데 실제로 해보니 **너무 가까웠다**(사용자 신고). 폰에서 보이는 월드가 폭 177칸,
     * 맵 전체의 6% 였다. 내 몸이 화면 폭의 20% 를 먹으니 앞이 안 보인다.
     *
     * 그리고 크기가 고정이면 **커진 게 안 느껴진다.** 커질수록 화면이 물러나되
     * 내 몸도 조금씩은 커 보여야 한다. 그래서 화면상 반지름을 **r^0.35 로 천천히** 키운다.
     *   r=18  → 약 15px (폭의 8%)  ·  r=45 → 21px  ·  r=100 → 27px
     * 보이는 월드는 반대로 460칸 → 1,440칸으로 넓어진다.
     *
     * 크기 비교가 화면 크기만으로는 안 되는 대신, 가시·`=`·얇은 테가 그 일을 한다(8.3절). */
    const onScreen = 5.4 * Math.pow(myR, 0.35) * (portrait ? 0.92 : 1);
    const zoom = Math.max(0.18, Math.min(2.2, onScreen * dpr / myR));

    /* 카메라를 목표에 **부드럽게 따라가게** 한다.
     * 예전엔 진행 방향으로 60px 앞선 지점을 매 프레임 그대로 썼다. 방향이 바뀔 때마다
     * 화면이 통째로 튀어서 폰에서 어지러웠다(사용자 신고). 앞서 보는 건 유지하되
     * 그 지점 자체를 이징으로 따라간다. */
    const tgtX = me ? me.x : C.WORLD / 2;
    const tgtY = me ? me.y : C.WORLD / 2;
    const leadLen = (portrait ? 34 : 58);
    const la = o.input ? o.input.angle : 0;
    const wantLX = Math.cos(la) * leadLen, wantLY = Math.sin(la) * leadLen;
    const k = 1 - Math.pow(0.001, (o.dt || 16) / 1000);   // 프레임률과 무관한 이징
    cam.lx += (wantLX - cam.lx) * k * 0.35;
    cam.ly += (wantLY - cam.ly) * k * 0.35;
    if (cam.x == null || Math.hypot(tgtX - cam.x, tgtY - cam.y) > 420) { cam.x = tgtX; cam.y = tgtY; }
    cam.x += (tgtX - cam.x) * k;
    cam.y += (tgtY - cam.y) * k;

    const camX = cam.x + cam.lx, camY = cam.y + cam.ly;
    const ox = W / 2 - camX * zoom;
    const oy = H * (portrait ? 0.46 : 0.5) - camY * zoom;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#FFF3DC';                    // 아레나 밖 = 눈부신 백열
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.setTransform(zoom, 0, 0, zoom, ox, oy);

    const arena = o.arena;
    if (!arena) { ctx.restore(); return; }

    // 보이는 월드 범위 — 그림자·물체·먹이를 전부 이걸로 걸러낸다
    const pad = 80;
    const vx0 = (-ox) / zoom - pad, vy0 = (-oy) / zoom - pad;
    const vx1 = (W - ox) / zoom + pad, vy1 = (H - oy) / zoom + pad;

    /* 1) 바닥을 **그늘 색**(진짜 색)으로 전부 그린다 */
    ctx.fillStyle = '#7C6F6A';
    ctx.fillRect(0, 0, C.WORLD, C.WORLD);
    for (const g of arena.ground) {
      ctx.fillStyle = GROUND[g.kind] || '#6E7488';
      ctx.fillRect(g.x, g.y, g.w, g.h);
    }
    ctx.strokeStyle = '#9AA0AE';
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (const l of arena.lines) { ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); }
    ctx.stroke();

    /* 2) 햇볕만 표백한다 — 드로우콜 한 번 */
    const sh = shadowsFor(arena, v.phase);
    const noon = isNoon(v.phase);
    const path = cachedPath(sh, v.phase, (vx0 + vx1) / 2, (vy0 + vy1) / 2,
      (vx1 - vx0) / 2, (vy1 - vy0) / 2);
    /* 그늘을 **먼저 차갑게** 깐다. 햇볕을 밝게 하는 것만으로는 부족했다 —
     * 사용자가 자기가 그늘 안인지 밖인지도 몰랐다. 이제 양쪽에서 벌린다:
     * 그늘은 푸르게 가라앉고(한낮 그늘은 실제로 하늘빛이라 파랗다), 햇볕은 하얗게 날아간다. */
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(120,150,205,0.55)';
    ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    // 표백 세기를 **실제 녹는 세기와 같은 곡선**으로 움직인다.
    // 화면이 "지금 얼마나 뜨거운지"를 말해 주지 않으면 규칙과 그림이 따로 논다.
    const heat = C.MELT_DAWN + C.MELT_NOON_ADD * sunHeight(v.phase);
    const glare = 0.52 + 0.26 * Math.min(1, heat / (C.MELT_DAWN + C.MELT_NOON_ADD));
    ctx.fillStyle = 'rgba(255,226,176,' + (noon ? Math.min(0.88, glare + 0.10) : glare).toFixed(3) + ')';
    ctx.fill(path, 'evenodd');

    /* 그늘 경계 — 이 게임에서 가장 중요한 선.
     *
     * 부드러운 반그림자가 물리적으로는 맞지만 **판정선을 흐린다.** 여기서 한 발 차이로
     * 녹느냐 마느냐가 갈리므로 경계는 칼같아야 한다. 그래서 바깥(햇볕 쪽)으로만
     * 열기를 번지게 하고, 경계선 자체는 1px 하드 라인으로 둔다.
     *
     * 이걸 빼고 한 번 돌려봤더니 그늘 얼룩이 **물체처럼 보였다** — 바닥색만 다른
     * 평평한 면이라 파라솔인지 파라솔 그림자인지 구분이 안 됐다. */
    ctx.lineWidth = 7 * dpr / zoom;
    ctx.strokeStyle = 'rgba(255,214,150,0.55)';
    ctx.stroke(path);
    ctx.restore();

    ctx.save();
    ctx.lineWidth = Math.max(0.6, 1.4 * dpr / zoom);
    ctx.strokeStyle = 'rgba(20,32,60,0.42)';
    ctx.stroke(path);
    ctx.restore();

    /* 3) 물체 자체 — 화면에 걸리는 것만 */
    for (const b of arena.obstacles) {
      const br = b.r != null ? b.r : Math.max(b.w, b.h) / 2;
      if (b.x + br < vx0 || b.x - br > vx1 || b.y + br < vy0 || b.y - br > vy1) continue;
      ctx.fillStyle = OBST[b.type] || '#555';
      if (b.type === 'block') {
        ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 3;
        ctx.strokeRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
      } else if (b.type === 'parasol') {
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.28, 0, Math.PI * 2); ctx.fill();
      } else {
        for (const c of b.canopy) {
          ctx.beginPath(); ctx.arc(b.x + c.dx, b.y + c.dy, c.r, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    /* 4) 얼음조각 — 화면 안만 그린다 */
    for (const f of v.food.values()) {
      if (f.x < vx0 || f.x > vx1 || f.y < vy0 || f.y > vy1) continue;
      drawShard(ctx, f.x, f.y, o.now);
    }

    /* 5) 사람 — **작은 것부터 큰 것 순.** 위험한 것이 절대 안 가려진다.
     *    로컬 플레이어는 크기와 무관하게 맨 위(내가 사라지면 게임이 끝난다) */
    const sunDir = shadowDir(v.phase);
    const list = [...v.players.values()]
      .filter(p => !p.dead && p.id !== o.myId)
      .filter(p => p.x > vx0 - p.r && p.x < vx1 + p.r && p.y > vy0 - p.r && p.y < vy1 + p.r)
      .sort((a, b) => a.r - b.r);

    const info = (id) => (o.roster && o.roster.get(id)) || {};
    const relOf = (r) => r >= myR * C.EAT_RATIO ? 'bigger'
      : (r <= myR / C.EAT_RATIO ? 'smaller' : 'even');

    for (const p of list) {
      const nfo = info(p.id);
      drawIce(ctx, {
        x: p.x, y: p.y, r: p.r, skin: nfo.skin || 0,
        isMe: false, rel: relOf(p.r),
        melting: p.melting ? 1 : 0,
        sunDir: p.melting ? sunDir : null,
        crown: o.leaderId === p.id,
        invuln: p.invuln, dashing: p.dashing,
        t: o.now, reduced: o.reduced, lowSpec, colorblind: o.colorblind
      });
    }

    if (me && !me.dead) {
      drawIce(ctx, {
        x: me.x, y: me.y, r: me.r, skin: (o.roster.get(o.myId) || {}).skin || 0,
        isMe: true, melting: me.melting ? 1 : 0,
        sunDir: me.melting ? sunDir : null,
        crown: o.leaderId === o.myId,
        invuln: me.invuln, dashing: me.dashing,
        t: o.now, reduced: o.reduced, lowSpec, colorblind: o.colorblind
      });
    }

    /* 6) 이름표 — 20명 전원을 그리면 글자 벽이 된다.
     *    화면상 22px 이상 + 최대 8개, 우선순위는 ①나를 먹을 수 있는 것 ②가까운 것 */
    const labels = list
      .filter(p => p.r * zoom > 22 * dpr)
      .map(p => ({ p, danger: p.r >= myR * C.EAT_RATIO, d: Math.hypot(p.x - camX, p.y - camY) }))
      .sort((a, b) => (b.danger - a.danger) || (a.d - b.d))
      .slice(0, 8);

    ctx.save();
    for (const { p } of labels) {
      const nfo = info(p.id);
      const size = Math.max(14 * dpr, 15 * dpr) / zoom;
      let nx = p.x;
      if (nfo.bot) {
        // 봇 칩 — **사람인 척하지 않는다**
        const chipW = size * 1.5;
        ctx.fillStyle = 'rgba(16,32,47,0.55)';
        const cy = p.y + p.r + size * 0.9;
        roundRect(ctx, p.x - chipW - size * 0.2, cy - size * 0.55, chipW, size * 1.1, size * 0.55);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '700 ' + (size * 0.72) + 'px system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('봇', p.x - chipW / 2 - size * 0.2, cy);
        nx = p.x + size * 0.6;
      }
      worldText(ctx, nfo.name || '?', nx, p.y + p.r + size * 0.9, size, nfo.bot ? 'left' : 'center');
    }
    if (me && !me.dead) {
      const size = 15 * dpr / zoom;
      worldText(ctx, (o.roster.get(o.myId) || {}).name || '나', me.x, me.y + me.r + size * 0.9, size);
    }
    ctx.restore();

    ctx.restore();

    /* 7) 화면 밖 지시 — **최대 2개만.** 항상 떠 있으면 잡음이 된다 */
    if (me && !me.dead) {
      const cx = W / 2, cy = H * (portrait ? 0.44 : 0.5);
      const lead2 = v.players.get(o.leaderId);
      if (lead2 && o.leaderId !== o.myId) chevron(ctx, cx, cy, W, H, dpr, lead2, me, zoom, PAL.crown, true);
      let near = null, nd = Infinity;
      for (const p of v.players.values()) {
        if (p.dead || p.id === o.myId) continue;
        if (p.r < myR * C.EAT_RATIO) continue;
        const d = Math.hypot(p.x - me.x, p.y - me.y);
        if (d < nd) { nd = d; near = p; }
      }
      if (near && nd < 900) {
        const onScreen = Math.abs((near.x - camX) * zoom) < W / 2 && Math.abs((near.y - camY) * zoom) < H / 2;
        if (!onScreen) chevron(ctx, cx, cy, W, H, dpr, near, me, zoom, PAL.danger, false);
      }
    }

    /* 8) 녹는 중이면 화면 테두리가 달아오른다 — 딴 데 봐도 주변시로 잡힌다 */
    if (me && me.melting && !me.dead) {
      const a = o.reduced ? 0.22 : 0.30;
      const g = ctx.createLinearGradient(0, 0, 0, H);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = 'rgba(255,190,120,' + a + ')';
      const t = 26 * dpr;
      ctx.fillRect(0, 0, W, t); ctx.fillRect(0, H - t, W, t);
      ctx.fillRect(0, 0, t, H); ctx.fillRect(W - t, 0, t, H);
      ctx.restore();
    }

    /* 9) 정오 — 라운드 없는 게임에 공유되는 리듬을 만드는 12초 */
    if (noon) {
      const left = Math.ceil(noonLeftMs(v.phase) / 1000);
      ctx.save();
      worldText(ctx, '정오 ' + left, W / 2, 92 * dpr, 34 * dpr);
      ctx.restore();
    }

    // 화면 변환을 그대로 돌려준다 — 부르는 쪽이 같은 계산을 또 하면
    // 카메라 이징이 들어간 순간 둘이 어긋나 월드 텍스트가 엉뚱한 자리에 찍힌다
    return { lowSpec, zoom, dpr, ox, oy, W, H };
  }

  function chevron(ctx, cx, cy, W, H, dpr, target, me, zoom, color, showDist) {
    const dx = (target.x - me.x) * zoom, dy = (target.y - me.y) * zoom;
    const a = Math.atan2(dy, dx);
    const m = 40 * dpr;
    const rx = Math.min(W / 2 - m, H / 2 - m);
    const px = cx + Math.cos(a) * rx, py = cy + Math.sin(a) * rx;
    const dist = Math.hypot(target.x - me.x, target.y - me.y);
    const alpha = Math.max(0, Math.min(1, (2500 - dist) / 900));
    if (alpha <= 0.02) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(px, py); ctx.rotate(a);
    ctx.fillStyle = color;
    const s = 15 * dpr;
    ctx.beginPath();
    ctx.moveTo(s, 0); ctx.lineTo(-s * 0.7, -s * 0.75); ctx.lineTo(-s * 0.7, s * 0.75);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    if (showDist) {
      ctx.save();
      worldText(ctx, Math.round(dist / 10) + 'm', px - Math.cos(a) * 26 * dpr, py - Math.sin(a) * 26 * dpr, 15 * dpr);
      ctx.restore();
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** 설정 시트에 띄운다 — 끊긴다는 신고를 숫자로 받기 위해서다.
   *  개발자가 자기 PC 에서만 재면 사용자의 기기에서 무슨 일이 나는지 영영 모른다. */
  function stats() {
    if (frames.length < 20) return null;
    const s = frames.slice().sort((a, b) => a - b);
    const p50 = s[s.length >> 1];
    return {
      fps: Math.round(1000 / p50),
      p50: +p50.toFixed(1),
      p95: +s[Math.floor(s.length * 0.95)].toFixed(1),
      dpr: +dpr.toFixed(2),
      px: canvas.width * canvas.height,
      lowSpec
    };
  }

  function forceLowSpec(on) {
    lowSpec = !!on;
    frames.length = 0;
    pathCache = null;
    resize();
  }

  resize();
  return {
    draw, resize, stats, forceLowSpec,
    get dpr() { return dpr; }, get lowSpec() { return lowSpec; }
  };
}
