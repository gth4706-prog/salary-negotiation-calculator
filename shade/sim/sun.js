/**
 * 태양과 그림자 — 이 게임의 심장
 *
 * 세계는 계속 돌아간다. 라운드도 대기실도 없다. 대신 태양이 240초에 180° 스윕한다.
 * 정오가 되면 그림자가 0.35배로 줄어 **그늘이 사라지고 모두가 부딪힌다.**
 *
 * 이게 소재를 폭염으로 고른 진짜 이유다. 접속자가 적은 넓은 맵에서 서로 못 만나는 것이
 * .io 게임의 사망 원인인데, 배틀로얄의 자기장 같은 인위적 장치 대신
 * **"정오엔 그늘이 없다"는 사실**이 같은 일을 한다. 규칙 설명이 필요 없다.
 *
 * 이 파일은 DOM 도 Cloudflare API 도 참조하지 않는다 — 서버와 브라우저가 같이 쓴다.
 */
import { C } from './consts.js';

/** 0~1. 0=새벽, 0.5=정오, 1=해질녘(그리고 다시 새벽) */
export function sunPhase(tMs) {
  const p = ((tMs % C.SUN_PERIOD_MS) + C.SUN_PERIOD_MS) % C.SUN_PERIOD_MS;
  return p / C.SUN_PERIOD_MS;
}

/** 태양 높이 0~1 */
export const sunHeight = (p) => Math.sin(Math.PI * p);

/**
 * 정오는 **별도 규칙이 아니라 곡선의 꼭대기 12초 구간**이다.
 * 그림자 길이는 같은 식이 계속 계산하고, 이 구간에서만 화면이 표백과 카운트다운을 얹는다.
 */
export const isNoon = (p) => Math.abs(p - 0.5) <= C.NOON_HALF;

/** 정오 남은 시간(ms). 정오가 아니면 0 */
export function noonLeftMs(p) {
  if (!isNoon(p)) return 0;
  return (0.5 + C.NOON_HALF - p) * C.SUN_PERIOD_MS;
}

/** 그림자가 뻗는 방향(라디안). 해가 동→서로 가면 그림자는 서→동 */
export const shadowDir = (p) => Math.PI + Math.PI * p;

/** 물체 높이에 곱할 배수. 정오 0.35 ~ 새벽 2.95 */
export const shadowLenMul = (p) => C.SHADOW_MIN_MUL + C.SHADOW_MAX_ADD * (1 - sunHeight(p));

/* ── 볼록 껍질 (monotone chain) ─────────────────────────────────────────────
 * block 의 그림자는 "원래 사각형"과 "밀어낸 사각형"을 함께 감싼 도형이다.
 * 두 사각형을 따로 그리면 사이가 비어 그림자에 구멍이 생긴다. */
function hull(pts) {
  const p = pts.slice().sort((a, b) => (a.x - b.x) || (a.y - b.y));
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = [], up = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  lo.pop(); up.pop();
  return lo.concat(up);
}

/**
 * 지금 위상의 그림자 도형들.
 *
 * **태양이 움직인 만큼만 다시 계산한다** — 매 프레임이 아니다.
 * 캐스터 수 × 프레임으로 돌리면 저사양 폰에서 이것만으로 예산을 다 쓴다.
 *
 * @returns {Array} `{kind:'poly', pts, sun}` 또는 `{kind:'disc', cx, cy, r, sun}`
 *   `sun` 은 그 안에 있을 때의 **햇볕 노출 계수**다(0=안 녹음, 0.35=나무, 1=햇볕).
 */
export function buildShadows(arena, p) {
  const dir = shadowDir(p);
  const mul = shadowLenMul(p);
  const cx = Math.cos(dir), cy = Math.sin(dir);
  /**
   * 원형 차양(파라솔·잎)의 그림자는 해가 낮을수록 **햇빛 방향으로 늘어난 타원**이 된다.
   * 원판을 비스듬히 투영하면 한 축만 1/sin(고도) 배로 늘어나기 때문이다.
   * `mul = cot(고도)` 이므로 늘어나는 배수는 `1/sin = √(1+mul²)` 이다.
   *
   * 이걸 안 넣고 크기 고정 원으로 두면 **정오에 그늘 면적이 안 줄어든다** —
   * 그림자가 발밑으로 옮겨 올 뿐이라서. 그러면 "정오엔 그늘이 없다"는
   * 이 게임의 심장이 화면에서 일어나지 않는다. (실측으로 잡은 문제다: 0.64배에 그쳤다)
   */
  const stretch = Math.sqrt(1 + mul * mul);
  const out = [];

  for (const o of arena.obstacles) {
    const d = o.height * mul;
    const ox = cx * d, oy = cy * d;

    if (o.type === 'block') {
      const hw = o.w / 2, hh = o.h / 2;
      const base = [
        { x: o.x - hw, y: o.y - hh }, { x: o.x + hw, y: o.y - hh },
        { x: o.x + hw, y: o.y + hh }, { x: o.x - hw, y: o.y + hh }
      ];
      // 건물은 자기 몸도 그늘이다 → 원래 자리와 밀어낸 자리를 함께 감싼다
      const moved = base.map(q => ({ x: q.x + ox, y: q.y + oy }));
      out.push({ kind: 'poly', pts: hull(base.concat(moved)), sun: 0 });

    } else if (o.type === 'parasol') {
      // 파라솔은 떠 있는 천이라 그림자만 옮겨 간다(기둥 밑은 그늘이 아니다)
      out.push(ellipse(o.x + ox, o.y + oy, o.r, stretch, cx, cy, 0));

    } else if (o.type === 'tree') {
      // 잎 사이로 빛이 샌다 → 완전 차단이 아니라 35%
      for (const c of o.canopy) {
        out.push(ellipse(o.x + c.dx + ox, o.y + c.dy + oy, c.r, stretch, cx, cy, C.TREE_SUN));
      }
    }
  }
  return out;
}

/** 햇빛 방향(ux,uy)으로 늘어난 타원. `a` 가 장축(그림자 방향), `b` 가 단축. */
function ellipse(cx, cy, r, stretch, ux, uy, sun) {
  return { kind: 'ellipse', cx, cy, a: r * stretch, b: r, ux, uy, sun };
}

function inPoly(pts, x, y) {
  // 볼록 도형이라 외적 부호만 보면 된다
  let neg = false, pos = false;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const c = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (c < 0) neg = true; else if (c > 0) pos = true;
    if (neg && pos) return false;
  }
  return true;
}

/**
 * 이 점의 햇볕 노출 계수. 0=완전 그늘, 0.35=나무 그늘, 1=땡볕.
 * 여러 그림자가 겹치면 **가장 짙은 쪽**을 따른다(나무 밑 + 정자 그늘 = 완전 그늘).
 */
export function shadeAt(shadows, x, y) {
  let best = 1;
  for (const s of shadows) {
    if (s.sun >= best) continue;              // 이미 더 짙은 걸 찾았다
    if (s.kind === 'ellipse') {
      const dx = x - s.cx, dy = y - s.cy;
      // 타원 축으로 회전시켜 단위원 안인지 본다
      const u = (dx * s.ux + dy * s.uy) / s.a;
      const v = (-dx * s.uy + dy * s.ux) / s.b;
      if (u * u + v * v <= 1) best = s.sun;
    } else if (s.kind === 'disc') {
      const dx = x - s.cx, dy = y - s.cy;
      if (dx * dx + dy * dy <= s.r * s.r) best = s.sun;
    } else if (inPoly(s.pts, x, y)) {
      best = s.sun;
    }
    if (best === 0) return 0;
  }
  return best;
}
