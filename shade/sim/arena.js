/**
 * 무대 — 정오의 아파트 단지 놀이터
 *
 * .io 게임이 촌스러워지는 진짜 이유는 색이 아니라 **장소가 없어서**다.
 * 검은 배경 + 원색 원은 "아무 데도 아닌 곳"이라 아트를 정할 근거 자체가 없다.
 * 그래서 장소를 먼저 못 박았다. 한국 사람이면 설명 없이 아는 곳이고,
 * 파라솔·정자·가로수가 원래 거기 있는 것들이라 그늘 물체를 억지로 배치할 필요가 없다.
 *
 * 장애물 세 종류는 성질이 다르다 — 이게 그늘을 이진에서 3단계로 늘린다.
 *   block   정자·창고·벽. 완전 차단. 자기 몸도 그늘이다
 *   parasol 파라솔. 완전 차단. 지름이 작아 자리싸움이 난다
 *   tree    가로수. 원 여러 개가 겹쳐 구멍이 뚫린다 → 35%로 녹는다
 *
 * `height` 가 그림자 길이를 정한다(sun.js). 높을수록 아침·저녁에 길게 눕는다.
 */
import { C } from './consts.js';

/**
 * 바닥 구역 — 렌더 전용. 시뮬레이션은 이걸 안 본다.
 *
 * **빈 곳을 남기지 않는다.** 처음엔 구역 6개만 두고 나머지를 기본 회갈색으로 덮었는데,
 * 그 기본색이 맵의 60% 를 차지해서 화면이 온통 단조로운 회갈색이 됐다(실제로 보고 고쳤다).
 * "정오의 아파트 단지 놀이터"라는 장소가 안 읽히면 이 게임은 다시 '아무 데도 아닌 곳'이 된다.
 */
const GROUND = [
  /* 광장 — 바탕 */
  { kind: 'concrete', x: 0,    y: 0,    w: 3000, h: 3000 },

  /* 놀이터 고무 포장 — 주황빛. 화면에서 가장 눈에 띄는 면 */
  { kind: 'rubber',   x: 240,  y: 240,  w: 1020, h: 900 },
  { kind: 'rubber',   x: 1680, y: 1820, w: 1080, h: 900 },
  { kind: 'rubber',   x: 1180, y: 1160, w: 760,  h: 700 },

  /* 화단·잔디 — 한낮엔 카키로 바랜다 */
  { kind: 'grass',    x: 120,  y: 1420, w: 780,  h: 700 },
  { kind: 'grass',    x: 2060, y: 260,  w: 720,  h: 680 },
  { kind: 'grass',    x: 2280, y: 1380, w: 600,  h: 380 },
  { kind: 'grass',    x: 900,  y: 2420, w: 640,  h: 460 },

  /* 흙길 — 구역을 잇는다 */
  { kind: 'dirt',     x: 1260, y: 240,  w: 340,  h: 900 },
  { kind: 'dirt',     x: 120,  y: 2200, w: 700,  h: 300 },

  /* 수돗가 — 유일하게 그늘보다 햇볕이 예쁜 것 */
  { kind: 'water',    x: 1420, y: 2540, w: 260,  h: 210 },
  { kind: 'water',    x: 2500, y: 940,  w: 200,  h: 170 }
];

/** 페인트 라인 — 렌더 전용 장식. 사방치기·주차선 */
const LINES = [
  { x1: 380,  y1: 1180, x2: 1120, y2: 1180 },
  { x1: 1250, y1: 1220, x2: 1250, y2: 1820 },
  { x1: 1850, y1: 2000, x2: 2600, y2: 2000 },
  { x1: 700,  y1: 380,  x2: 700,  y2: 1020 }
];

/**
 * 장애물 18개. 맵 네 귀퉁이는 일부러 비웠다 —
 * 어디든 그늘이면 "그늘을 찾아간다"는 행동 자체가 사라진다.
 */
const OBSTACLES = [
  /* 정자 — 큰 완전 그늘. 랜드마크 역할도 한다(미니맵을 안 넣는 근거) */
  { type: 'block', x: 760,  y: 700,  w: 210, h: 210, height: 120, name: '정자' },
  { type: 'block', x: 2240, y: 2260, w: 200, h: 200, height: 118, name: '정자' },
  /* 창고·벽 */
  { type: 'block', x: 1560, y: 520,  w: 320, h: 130, height: 96,  name: '창고' },
  { type: 'block', x: 420,  y: 2280, w: 140, h: 340, height: 88,  name: '벽' },
  { type: 'block', x: 2560, y: 1220, w: 130, h: 300, height: 88,  name: '벽' },
  { type: 'block', x: 1180, y: 2600, w: 300, h: 120, height: 78,  name: '자전거 보관소' },

  /* 파라솔 — 작고 완전한 그늘이라 자리싸움이 난다 */
  { type: 'parasol', x: 500,  y: 480,  r: 74, height: 132 },
  { type: 'parasol', x: 1020, y: 300,  r: 70, height: 128 },
  { type: 'parasol', x: 1420, y: 1480, r: 78, height: 134 },
  { type: 'parasol', x: 2020, y: 1720, r: 72, height: 130 },
  { type: 'parasol', x: 860,  y: 1760, r: 70, height: 128 },
  { type: 'parasol', x: 2420, y: 700,  r: 74, height: 132 },

  /* 가로수 — 원 뭉치라 구멍이 뚫린다. 넓지만 천천히 녹는다 */
  { type: 'tree', x: 1750, y: 1050, r: 96, height: 170, seed: 11 },
  { type: 'tree', x: 640,  y: 1420, r: 104, height: 176, seed: 23 },
  { type: 'tree', x: 2300, y: 1620, r: 92, height: 166, seed: 37 },
  { type: 'tree', x: 1120, y: 2180, r: 100, height: 172, seed: 41 },
  { type: 'tree', x: 2700, y: 2000, r: 88, height: 162, seed: 53 },
  { type: 'tree', x: 300,  y: 900,  r: 90, height: 164, seed: 67 }
];

/** 가로수 뭉치를 이루는 작은 원들. 시드로 고정 — 매번 달라지면 맵이 아니다. */
function canopy(o) {
  const out = [];
  let s = o.seed >>> 0;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const n = 5 + Math.floor(rnd() * 5);          // 5~9개
  out.push({ dx: 0, dy: 0, r: o.r * 0.62 });
  for (let i = 1; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.7;
    const d = o.r * (0.34 + rnd() * 0.34);
    out.push({ dx: Math.cos(a) * d, dy: Math.sin(a) * d, r: o.r * (0.34 + rnd() * 0.22) });
  }
  return out;
}
for (const o of OBSTACLES) if (o.type === 'tree') o.canopy = canopy(o);

export const ARENA = {
  w: C.WORLD,
  h: C.WORLD,
  ground: GROUND,
  lines: LINES,
  obstacles: OBSTACLES
};

/**
 * 스폰 후보 — 전부 그늘을 만드는 물체 **곁**이다.
 * 신규 플레이어는 반드시 그늘 안에서 시작한다(온보딩이 "그늘=안전"을 대비로 가르친다).
 * 물체 위가 아니라 곁인 이유: block 은 자기 몸이 그늘이라 그 위에 놓으면 겹친다.
 */
export const SPAWNS = OBSTACLES.map(o => ({ x: o.x, y: o.y, ref: o }));
