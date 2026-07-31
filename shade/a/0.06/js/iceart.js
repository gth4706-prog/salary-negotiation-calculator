/**
 * 얼음 한 덩이를 그린다 — 이 게임의 모든 정보가 여기 실린다
 *
 * 목표: 화면에 20명일 때도 **0.2초 안에** 네 가지가 읽혀야 한다.
 *   (a) 내가 누구인가  (b) 누가 나보다 큰가  (c) 그늘 안인가  (d) 녹고 있는가
 *
 * **색은 어느 항목에서도 주 채널이 아니다.** 전부 형태로 실린다 —
 * 색각 이상에서도 갈리고, 20명이 겹쳐도 살아남는다.
 */
import { C } from '../sim/consts.js';

export const PAL = {
  iceFill: 'rgba(230,246,253,0.82)',
  iceFillOther: 'rgba(230,246,253,0.72)',
  facet: 'rgba(255,255,255,0.55)',
  rimLight: '#FFFFFF',
  rimDark: '#16283F',
  shard: '#B9E8F7',
  drip: '#7FC4DE',
  wet: 'rgba(30,40,60,0.18)',
  crown: '#FFC53D',
  danger: '#E0341F',
  ink: '#10202F',
  paper: 'rgba(255,255,255,0.92)'
};

/** 정체성 색 8종 — 색상환 간격과 **명도 간격을 같이** 벌렸다 */
export const IDENT = ['#FF4D3D', '#FFB01F', '#F5E663', '#4FCB6B',
  '#12B5C9', '#3D7BFF', '#A45BFF', '#FF6FC2'];

/** 봉입물 12종. **모양이 주 채널**이라 파랑/보라처럼 명도가 겹쳐도 갈린다 */
const SHAPES = ['star', 'heart', 'moon', 'tri', 'drop', 'leaf',
  'ring', 'cross', 'hex', 'rhomb', 'bolt', 'square'];

export const shapeOf = (skin) => SHAPES[(skin | 0) % SHAPES.length];
export const colorOf = (skin) => IDENT[((skin | 0) / SHAPES.length | 0) % IDENT.length];

/** 정팔각형. 꼭짓점 8개가 전부 충돌 반지름 위에 정확히 놓인다 — 크기 판단이 흔들리면 안 된다 */
function octPath(ctx, x, y, r, round) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 8;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (round > 0.001) {
      // 녹으면 꼭짓점이 둥글어진다. **꼭짓점은 여전히 r 위에 있다**(크기 판정 보호)
      const a2 = ((i + 1) / 8) * Math.PI * 2 - Math.PI / 8;
      const nx = x + Math.cos(a2) * r, ny = y + Math.sin(a2) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      ctx.quadraticCurveTo((px + nx) / 2 + (x - (px + nx) / 2) * round * 0.35,
        (py + ny) / 2 + (y - (py + ny) / 2) * round * 0.35, nx, ny);
    } else {
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
}

function inclusion(ctx, kind, x, y, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  switch (kind) {
    case 'star': {
      for (let i = 0; i < 10; i++) {
        const a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? s * 0.45 : s;
        i ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
          : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      break;
    }
    case 'heart':
      ctx.moveTo(x, y + s * 0.75);
      ctx.bezierCurveTo(x - s * 1.5, y - s * 0.3, x - s * 0.4, y - s, x, y - s * 0.35);
      ctx.bezierCurveTo(x + s * 0.4, y - s, x + s * 1.5, y - s * 0.3, x, y + s * 0.75);
      break;
    case 'moon':
      ctx.arc(x, y, s, Math.PI * 0.35, Math.PI * 1.65);
      ctx.arc(x + s * 0.45, y, s * 0.85, Math.PI * 1.5, Math.PI * 0.5, true);
      break;
    case 'tri':
      ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.9, y + s * 0.7); ctx.lineTo(x - s * 0.9, y + s * 0.7);
      break;
    case 'drop':
      ctx.moveTo(x, y - s);
      ctx.bezierCurveTo(x + s, y, x + s * 0.75, y + s, x, y + s);
      ctx.bezierCurveTo(x - s * 0.75, y + s, x - s, y, x, y - s);
      break;
    case 'leaf':
      ctx.ellipse(x, y, s * 0.6, s, Math.PI / 4, 0, Math.PI * 2);
      break;
    case 'ring':
      ctx.arc(x, y, s, 0, Math.PI * 2);
      ctx.arc(x, y, s * 0.5, 0, Math.PI * 2, true);
      break;
    case 'cross':
      ctx.rect(x - s * 0.3, y - s, s * 0.6, s * 2);
      ctx.rect(x - s, y - s * 0.3, s * 2, s * 0.6);
      break;
    case 'hex':
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        i ? ctx.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s)
          : ctx.moveTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
      }
      break;
    case 'rhomb':
      ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.7, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.7, y);
      break;
    case 'bolt':
      ctx.moveTo(x + s * 0.2, y - s); ctx.lineTo(x - s * 0.6, y + s * 0.1);
      ctx.lineTo(x - s * 0.05, y + s * 0.1); ctx.lineTo(x - s * 0.2, y + s);
      ctx.lineTo(x + s * 0.6, y - s * 0.15); ctx.lineTo(x + s * 0.05, y - s * 0.15);
      break;
    default:
      ctx.rect(x - s * 0.8, y - s * 0.8, s * 1.6, s * 1.6);
  }
  ctx.closePath();
  ctx.fill();
}

/**
 * @param {object} o
 *   x,y,r        화면 좌표·반지름
 *   skin         정체성
 *   isMe         나인가 (사방 노치 + 진한 몸통)
 *   rel          'bigger' | 'even' | 'smaller' — 나 대비 크기 (isMe 면 무시)
 *   melting      녹는 중인가 (0=아님, 1=땡볕, 0.35=나무)
 *   sunDir       그림자 방향 (라디안). null 이면 그림자를 안 그린다 = 그늘 안
 *   crown        1위인가
 *   invuln       무적인가
 *   dashing, t   연출용
 *   reduced      prefers-reduced-motion
 *   lowSpec      저사양 모드
 */
export function drawIce(ctx, o) {
  const { x, y, r } = o;
  const melt = o.melting || 0;

  /* (c) 그늘 안인가 — **햇볕에 있을 때만 그림자가 생긴다.**
   *     내 몸에 붙어 있어서 20명이 겹쳐도 살아남는 신호다. */
  if (o.sunDir != null && !o.lowSpec) {
    const off = r * 0.22;
    ctx.fillStyle = 'rgba(20,32,60,0.22)';
    octPath(ctx, x + Math.cos(o.sunDir) * off, y + Math.sin(o.sunDir) * off, r, 0);
    ctx.fill();
  }

  /* 몸통 — 반투명이라 바닥색이 비친다.
   * 햇볕 위의 얼음은 저절로 따뜻하게, 그늘 안의 얼음은 저절로 차갑게 보인다. 공짜 신호다. */
  const round = melt > 0 ? Math.min(1, melt) : 0;
  octPath(ctx, x, y, r, o.lowSpec ? 0 : round);
  ctx.fillStyle = o.lowSpec ? '#DCF0F9' : (o.isMe ? PAL.iceFill : PAL.iceFillOther);
  ctx.fill();

  /* 단면 하이라이트 — 광원이 하나뿐인 세계라 각도를 고정한다 */
  if (!o.lowSpec && r > 10) {
    ctx.save();
    octPath(ctx, x - r * 0.18, y - r * 0.22, r * 0.62, 0);
    ctx.fillStyle = PAL.facet;
    ctx.fill();
    ctx.restore();
  }

  /* (d) 녹고 있는가 — 테두리 실선/점선. 행진 속도가 3단계(땡볕·나무·그늘)를 다 담는다.
   * 이중 스트로크인 이유: 바닥이 어두운 청회색부터 백열까지 변해서
   * 단색 테두리는 **어느 한쪽에서 반드시 사라진다.** 밝은 선+어두운 선은 하나가 살아남는다. */
  const dash = melt > 0;
  ctx.save();
  if (dash) {
    const sp = o.reduced ? 0.4 : 1;
    ctx.setLineDash([Math.max(4, r * 0.28), Math.max(3, r * 0.20)]);
    ctx.lineDashOffset = -((o.t || 0) * 0.045 * melt * sp) % 1000;
  }
  octPath(ctx, x, y, r, o.lowSpec ? 0 : round);
  ctx.lineWidth = 2;
  ctx.strokeStyle = PAL.rimLight;
  ctx.stroke();
  octPath(ctx, x, y, r - 1.8, o.lowSpec ? 0 : round);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = PAL.rimDark;
  ctx.stroke();
  ctx.restore();

  /* (b) 누가 나보다 큰가 — **연속값에 안 기댄다.** 임계를 도형으로 못 박는다.
   * 대부분의 .io 가 '대등' 구간을 비워 둬서 "왜 죽었는지 모르겠다"가 나온다. */
  if (!o.isMe) {
    if (o.rel === 'bigger') {
      /* 나를 먹는 놈. 가시만으로는 **못 알아봤다**(사용자 신고: "왜 내가 잡아먹히는지 모르겠다").
       * 가시는 테두리에 붙은 작은 돌기라 멀리서·작게 보일 때 사라진다.
       * 그래서 몸 전체를 감싸는 붉은 고리를 하나 더 두른다 — 이건 크기와 무관하게 보인다. */
      ctx.save();
      ctx.strokeStyle = 'rgba(224,52,31,0.85)';
      ctx.lineWidth = Math.max(2.5, r * 0.10);
      ctx.beginPath();
      ctx.arc(x, y, r + ctx.lineWidth * 0.9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // 가시 5개 — 가까이서 보면 방향까지 읽힌다
      ctx.fillStyle = PAL.danger;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.3;
        const h = r * 0.14 + 3;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        ctx.lineTo(x + Math.cos(a + 0.16) * (r - 2), y + Math.sin(a + 0.16) * (r - 2));
        ctx.lineTo(x + Math.cos(a + 0.08) * (r + h), y + Math.sin(a + 0.08) * (r + h));
        ctx.closePath();
        ctx.fill();
      }
    } else if (o.rel === 'even') {
      // `=` 눈금 — 아무도 못 먹는다. 이 구간을 명시하는 게 핵심이다
      ctx.strokeStyle = PAL.rimDark;
      ctx.lineWidth = 2;
      const ex = x + r * 0.72, ey = y - r * 0.72, w = Math.max(4, r * 0.22);
      ctx.beginPath();
      ctx.moveTo(ex - w, ey - 2); ctx.lineTo(ex + w, ey - 2);
      ctx.moveTo(ex - w, ey + 2); ctx.lineTo(ex + w, ey + 2);
      ctx.stroke();
    }
    // 'smaller' 는 위에서 테두리를 얇게 그리는 것으로 이미 표현됐다(아래 참조)
  }

  /* (a) 내가 누구인가 — 봉입물.
   * **크기가 체력 표시를 겸한다**: 몸통이 크면 점 하나, 녹아 작아지면 몸통을 꽉 채운다.
   * HUD 를 한 픽셀도 안 쓰고 "나 얼마 안 남았다"가 몸으로 읽힌다. */
  const incR = Math.max(6, Math.min(o.colorblind ? 18 : 14, r * 0.55));
  if (r > 7) inclusion(ctx, shapeOf(o.skin), x, y, incR, colorOf(o.skin));

  /* 나임을 못 놓치게 — 사방 노치. 다른 신호와 절대 안 겹치는 형태 */
  if (o.isMe) {
    ctx.strokeStyle = PAL.rimDark;
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * (r + 5), y + Math.sin(a) * (r + 5));
      ctx.lineTo(x + Math.cos(a) * (r + 10), y + Math.sin(a) * (r + 10));
      ctx.stroke();
    }
  }

  /* 1위 — 서리 왕관. 모양 + 색 이중 채널 */
  if (o.crown) {
    ctx.fillStyle = PAL.crown;
    ctx.beginPath();
    const cy = y - r - 6, w = Math.max(10, r * 0.5);
    ctx.moveTo(x - w, cy + 7);
    ctx.lineTo(x - w * 0.55, cy - 4); ctx.lineTo(x - w * 0.15, cy + 3);
    ctx.lineTo(x, cy - 8);
    ctx.lineTo(x + w * 0.15, cy + 3); ctx.lineTo(x + w * 0.55, cy - 4);
    ctx.lineTo(x + w, cy + 7);
    ctx.closePath();
    ctx.fill();
  }

  /* 무적 — 맥동하는 점선 링(형태 신호). 색 틴트가 아니다.
   * 3Hz 미만으로 돈다 — 광과민성 때문에 빠른 점멸은 금지다. */
  if (o.invuln) {
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.lineDashOffset = -((o.t || 0) * 0.03) % 1000;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r + 7 + Math.sin((o.t || 0) * 0.004) * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * 냉기 지대 — 쿨링포그. **여기 있으면 가만히 있어도 커진다.**
 *
 * 세 가지 자리 중 유일하게 좋은 것이므로 화면에서 **가장 알아보기 쉬워야** 한다.
 * 그래서 색(차가운 하늘색)에만 기대지 않고 **테두리 + 안쪽 고리 + 눈 결정 십자**를
 * 같이 쓴다. 저사양·모션 감소에서는 고리가 멈출 뿐 사라지지 않는다 — 상태 신호라서.
 */
export function drawCold(ctx, x, y, r, t, still) {
  ctx.save();
  ctx.fillStyle = 'rgba(150,225,245,0.30)';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();

  ctx.lineWidth = Math.max(2, r * 0.045);
  ctx.strokeStyle = 'rgba(226,250,255,0.92)';
  ctx.stroke();
  ctx.lineWidth = Math.max(1.2, r * 0.02);
  ctx.strokeStyle = 'rgba(24,80,110,0.45)';
  ctx.beginPath(); ctx.arc(x, y, r - Math.max(2, r * 0.05), 0, Math.PI * 2); ctx.stroke();

  // 안쪽에서 퍼져 나가는 고리 — 여기가 '나오는 곳'임을 움직임으로 말한다
  const k = still ? 0.5 : ((t || 0) % 2600) / 2600;
  ctx.globalAlpha = 0.55 * (1 - k);
  ctx.lineWidth = Math.max(1.5, r * 0.03);
  ctx.strokeStyle = '#EAFBFF';
  ctx.beginPath(); ctx.arc(x, y, r * (0.25 + 0.7 * k), 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;

  // 눈 결정 — 색을 못 봐도 이 자리가 무엇인지 알 수 있게
  ctx.strokeStyle = 'rgba(240,253,255,0.75)';
  ctx.lineWidth = Math.max(1.5, r * 0.035);
  const s = r * 0.30;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI / 3;
    ctx.moveTo(x - Math.cos(a) * s, y - Math.sin(a) * s);
    ctx.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
  }
  ctx.stroke();
  ctx.restore();
}

/** 월드 텍스트 — 바닥 밝기가 요동쳐서 **어떤 단색 글자도 4.5:1 을 못 지킨다.**
 *  흰 외곽 + 진한 잉크로 배경과 무관한 고정 대비를 만든다. */
export function worldText(ctx, s, x, y, size, align) {
  ctx.font = '800 ' + size + 'px "Gothic A1", "Malgun Gothic", system-ui, sans-serif';
  ctx.textAlign = align || 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size * 0.22);
  ctx.strokeStyle = PAL.paper;
  ctx.strokeText(s, x, y);
  ctx.fillStyle = PAL.ink;
  ctx.fillText(s, x, y);
}
