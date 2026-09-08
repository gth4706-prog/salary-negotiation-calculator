// ============================================================================
//  SkillIcon — 스킬 **타입** 19종의 아이콘을 벡터로 그린다.
//
//  왜 만들었나 (2026-09-08):
//    조작부의 QWER 버튼이 `scene.add.text` 로 **글자를 원 안에 넣고 줄여 맞추고**
//    있었다. 그것도 스킬 이름이 아니라 `SKILL_TYPE_LABEL` 의 **타입 동사**다
//    (뛰기·쓸기·겨냥·쏘기·때리기·다지기·끌기·덫, R 은 언제나 '궁극기').
//    그래서 광전사의 `대검 돌진` 과 사냥꾼의 `구르기` 가 **둘 다 "뛰기"** 로 떴다.
//    영웅이 다섯인데 전투 중 제일 많이 보는 UI 가 거의 똑같았다 — 특성 격자에서
//    태현님이 지적한 "개성 없다" 가 조작부에서 그대로 재발하고 있었던 것이다.
//
//  왜 **타입** 단위인가 (스킬 이름 단위가 아니라):
//    엔진이 실제로 구별하는 단위가 타입이다(`Combat.SKILL_TYPES`). 스킬 이름마다
//    그림을 두면 60개가 넘고, 그중 다수가 같은 동작이라 서로 구별이 안 되는
//    그림이 대부분이 된다 — 208 전술을 "상황 × 대응" 조합으로 만든 것과 같은 판단.
//    ⚠ 대신 **타입 라벨을 그대로 옮기지 않는다.** 라벨은 거짓이 될 때가 있다
//      (heroes.js 주석: dash 7개 중 3개가 피해 0, 1개는 뒤로 뛴다). 그림은
//      "이 버튼을 누르면 무슨 일이 일어나는가"의 **모양**을 말한다.
//
//  화풍·크기 계약은 js/vecicon.js 머리 주석 참조. 여기 원시함수를 복사하지 말 것.
//  ⚠ 스킬 버튼은 특성 칸보다 작다(폰에서 지름 26~34px). 잔 물건 여럿은 무조건
//    뭉갠다 — 특성 아이콘 초안에서 이미 겪었다(화살 깃 셋 → 갈색 덩어리).
// ============================================================================
(function () {
  'use strict';
  var G = (window.GAME = window.GAME || {});
  var V = G.VecIcon;
  var poly = V.poly, stroke = V.stroke, disc = V.disc, fill = V.fill, line = V.line, head = V.head;

  //  ── 색 ──────────────────────────────────────────────────────────────────
  //  타입의 성격을 색으로도 갈라 둔다(모양이 첫째, 색이 둘째).
  var STEEL = 0xcdd6dc, IRON = 0x8e9aa2, BONE = 0xf0e7d2;
  var EMBER = 0xe0662c, GOLD = 0xf0be4a, BLOOD = 0xc0334a;
  var LEAF = 0x63b061, SKY = 0x63b6df, VIOLET = 0x9b7ad6, MIST = 0x9fb4c4;

  var ICONS = {

    //  뛰기 — 앞으로 기운 쐐기 + 뒤에 남는 속도선 둘. '몸이 앞서고 자취가 남는다'.
    dash: function (g, x, y, h) {
      poly(g, [0.96, 0, 0.10, 0.78, 0.30, 0, 0.10, -0.78], x, y, h, STEEL);
      [-0.34, 0.34].forEach(function (dy) {
        stroke(g, [-0.92, dy, -0.24, dy], x, y, h, MIST, Math.max(1.8, h * 0.15), 0.85);
      });
    },

    //  쓸기 — 제자리에서 사방으로. **닫힌 고리**라 '겨냥'(땅 표적)과 안 겹친다.
    aoeSelf: function (g, x, y, h) {
      line(g, Math.max(2.4, h * 0.22), GOLD, 1);
      g.strokeCircle(x, y, h * 0.74);
      disc(g, x, y, h * 0.24, GOLD);
      var i;
      for (i = 0; i < 4; i++) {
        var a = (Math.PI * 2 * i) / 4 + Math.PI / 4;
        head(g, x, y, h, Math.cos(a), Math.sin(a), 1.04, 0.26, GOLD);
      }
    },

    //  겨냥 — **땅에 그려진 표적 + 위에서 떨어지는 것.** 예고 후 낙하가 이 타입이다.
    aoeTarget: function (g, x, y, h) {
      fill(g, BLOOD, 0.30);
      g.fillEllipse(x, y + h * 0.52, h * 1.66, h * 0.72);
      line(g, Math.max(1.8, h * 0.15), BLOOD, 1);
      g.strokeEllipse(x, y + h * 0.52, h * 1.66, h * 0.72);
      g.strokeEllipse(x, y + h * 0.52, h * 0.76, h * 0.34);
      poly(g, [0, 0.16, 0.30, -0.42, 0.12, -0.42, 0.12, -1, -0.12, -1, -0.12, -0.42, -0.30, -0.42],
        x, y, h, EMBER);
    },

    //  쏘기 — 오른쪽으로 나는 화살 한 대. 촉·대·깃이 다 보여야 화살로 읽힌다.
    projectile: function (g, x, y, h) {
      stroke(g, [-0.52, 0.34, 0.52, -0.34], x, y, h, 0x8a6236, Math.max(2, h * 0.17), 1);
      head(g, x, y, h, 0.83, -0.55, 1.14, 0.34, STEEL);
      poly(g, [-0.52, 0.34, -0.96, 0.52, -0.72, 0.86, -0.30, 0.62], x, y, h, BONE);
    },

    //  때리기 — 한 놈을 내리친다. 쐐기 + 맞은 자리의 스파크.
    strike: function (g, x, y, h) {
      poly(g, [-0.62, -0.98, -0.10, -0.86, 0.34, 0.10, -0.06, 0.26], x, y, h, STEEL);
      var i;
      for (i = 0; i < 5; i++) {
        var a = Math.PI * (0.10 + i * 0.20);
        stroke(g, [0.16 + Math.cos(a) * 0.30, 0.42 + Math.sin(a) * 0.30,
                   0.16 + Math.cos(a) * 0.74, 0.42 + Math.sin(a) * 0.74],
          x, y, h, GOLD, Math.max(1.6, h * 0.13), 0.95);
      }
    },

    //  다지기 — 제 몸을 올린다. 둥근 몸 + 위로 오르는 쐐기 둘.
    buff: function (g, x, y, h) {
      fill(g, LEAF, 0.34);
      g.fillEllipse(x, y + h * 0.24, h * 1.24, h * 1.34);
      line(g, Math.max(1.7, h * 0.13), LEAF, 1);
      g.strokeEllipse(x, y + h * 0.24, h * 1.24, h * 1.34);
      [0.10, -0.44].forEach(function (dy) {
        poly(g, [0, dy - 0.44, 0.52, dy + 0.06, 0.22, dy + 0.06, 0.22, dy + 0.24,
                 -0.22, dy + 0.24, -0.22, dy + 0.06, -0.52, dy + 0.06], x, y, h, LEAF);
      });
    },

    //  끌기 — 갈고리와 팽팽한 줄. 갈고리 끝이 **되돌아 감긴다**(당기는 방향).
    pull: function (g, x, y, h) {
      stroke(g, [-0.96, -0.72, 0.10, -0.18], x, y, h, BONE, Math.max(1.8, h * 0.14), 1);
      line(g, Math.max(2.6, h * 0.24), IRON, 1);
      g.beginPath();
      g.arc(x + h * 0.22, y + h * 0.30, h * 0.56, -Math.PI * 0.85, Math.PI * 0.62, false);
      g.strokePath();
      head(g, x + h * 0.22, y + h * 0.30, h, -0.16, -0.99, 0.72, 0.30, IRON);
    },

    //  구역 — 땅에 남는 자리. 밟으면 아프다 → 타원 + 위로 솟는 획.
    aura: function (g, x, y, h) {
      fill(g, VIOLET, 0.32);
      g.fillEllipse(x, y + h * 0.44, h * 1.72, h * 0.80);
      line(g, Math.max(1.8, h * 0.15), VIOLET, 1);
      g.strokeEllipse(x, y + h * 0.44, h * 1.72, h * 0.80);
      [-0.56, 0, 0.56].forEach(function (dx, i) {
        stroke(g, [dx, 0.30, dx, -0.30 - (i === 1 ? 0.34 : 0)], x, y, h, VIOLET, Math.max(2, h * 0.17), 0.95);
      });
    },

    //  덫 — 마주 문 이빨 턱 둘. 이 세트에서 유일하게 **위아래 대칭**이라 안 헷갈린다.
    trap: function (g, x, y, h) {
      [-1, 1].forEach(function (s) {
        var i, p = [];
        for (i = 0; i <= 6; i++) {
          var t = -0.86 + (i / 6) * 1.72;
          p.push(t, s * (0.16 + (i % 2 ? 0.46 : 0.10)));
        }
        p.push(0.86, s * 0.84, -0.86, s * 0.84);
        poly(g, p, x, y, h, IRON);
      });
      disc(g, x, y, h * 0.16, EMBER, 0);
    },

    //  부르기 — 땅의 원에서 **작은 몸이 솟는다**(계란 실루엣 — 우리 세계의 소환물).
    summon: function (g, x, y, h) {
      fill(g, SKY, 0.30);
      g.fillEllipse(x, y + h * 0.56, h * 1.60, h * 0.66);
      line(g, Math.max(1.7, h * 0.14), SKY, 1);
      g.strokeEllipse(x, y + h * 0.56, h * 1.60, h * 0.66);
      poly(g, [0, -0.92, 0.50, -0.30, 0.44, 0.36, -0.44, 0.36, -0.50, -0.30], x, y, h, BONE);
      disc(g, x - h * 0.18, y - h * 0.24, h * 0.09, 0x2a2418, 0);
      disc(g, x + h * 0.18, y - h * 0.24, h * 0.09, 0x2a2418, 0);
    },

    //  숨기 — **끊긴 윤곽**. 면을 안 채우는 유일한 아이콘이라 한눈에 갈린다.
    stealth: function (g, x, y, h) {
      var i, n = 9;
      line(g, Math.max(2, h * 0.17), MIST, 0.95);
      for (i = 0; i < n; i++) {
        if (i % 2) continue;
        var a0 = (Math.PI * 2 * i) / n, a1 = (Math.PI * 2 * (i + 1)) / n;
        g.beginPath();
        g.arc(x, y, h * 0.86, a0, a1, false);
        g.strokePath();
      }
      disc(g, x - h * 0.26, y - h * 0.14, h * 0.10, MIST, 0);
      disc(g, x + h * 0.26, y - h * 0.14, h * 0.10, MIST, 0);
    },

    //  점멸 — 두 자리에 몸이 있고 사이가 비었다. 왼쪽은 남은 자취(옅다).
    blink: function (g, x, y, h) {
      fill(g, VIOLET, 0.34);
      g.fillEllipse(x - h * 0.60, y, h * 0.62, h * 1.20);
      fill(g, VIOLET, 1);
      g.fillEllipse(x + h * 0.56, y, h * 0.70, h * 1.32);
      line(g, Math.max(1.7, h * 0.13));
      g.strokeEllipse(x + h * 0.56, y, h * 0.70, h * 1.32);
      poly(g, [0.06, -0.62, -0.14, -0.06, 0.02, -0.06, -0.10, 0.62, 0.20, 0.02, 0.02, 0.02],
        x, y, h, GOLD, 0);
    },

    //  표식 — 대상 위에 찍히는 십자 조준. **몸 없이 표시만** 그린다(대상은 적이다).
    mark: function (g, x, y, h) {
      line(g, Math.max(2.2, h * 0.19), BLOOD, 1);
      g.strokeCircle(x, y, h * 0.62);
      [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(function (d) {
        stroke(g, [d[0] * 0.72, d[1] * 0.72, d[0] * 1.06, d[1] * 1.06],
          x, y, h, BLOOD, Math.max(2.2, h * 0.19), 1);
      });
      disc(g, x, y, h * 0.18, BLOOD, 0);
    },

    //  사슬 — 맞물린 고리 셋. 대각으로 놓아 '이어진다'를 만든다.
    chain: function (g, x, y, h) {
      [[-0.54, 0.42], [0, 0], [0.54, -0.42]].forEach(function (d) {
        line(g, Math.max(2.2, h * 0.19), IRON, 1);
        g.strokeEllipse(x + d[0] * h, y + d[1] * h, h * 0.72, h * 0.50);
      });
    },

    //  부르기(큰 것) — 소환과 같은 원이되 **뿔 달린 큰 몸.** 궁극기 자리라 크게.
    summonBoss: function (g, x, y, h) {
      fill(g, BLOOD, 0.26);
      g.fillEllipse(x, y + h * 0.62, h * 1.86, h * 0.66);
      line(g, Math.max(1.7, h * 0.14), BLOOD, 1);
      g.strokeEllipse(x, y + h * 0.62, h * 1.86, h * 0.66);
      poly(g, [0, -0.58, 0.62, -0.06, 0.54, 0.44, -0.54, 0.44, -0.62, -0.06], x, y, h, 0x6b3a3f);
      poly(g, [-0.44, -0.44, -0.92, -1.04, -0.20, -0.72], x, y, h, BONE);
      poly(g, [0.44, -0.44, 0.92, -1.04, 0.20, -0.72], x, y, h, BONE);
      disc(g, x - h * 0.22, y - h * 0.02, h * 0.10, EMBER, 0);
      disc(g, x + h * 0.22, y - h * 0.02, h * 0.10, EMBER, 0);
    },

    //  영역 — **경계가 굵은 원 + 안의 룬.** 표식(십자)과 달리 '안에 들어가는' 것이다.
    markZone: function (g, x, y, h) {
      fill(g, 0xd455a8, 0.22);
      g.fillCircle(x, y, h * 0.94);
      line(g, Math.max(2.6, h * 0.24), 0xd455a8, 1);
      g.strokeCircle(x, y, h * 0.94);
      poly(g, [0, -0.50, 0.44, 0.28, -0.44, 0.28], x, y, h, 0xd455a8, 0);
    },

    //  뿌리기 — 부채꼴로 흩어지는 날붙이 다섯. 하나하나는 작지만 **배열이 부채**다.
    spray: function (g, x, y, h) {
      var i;
      for (i = 0; i < 5; i++) {
        var a = -Math.PI * 0.42 + (i / 4) * Math.PI * 0.84;
        head(g, x - h * 0.70, y, h, Math.cos(a), Math.sin(a), 1.50, 0.22, STEEL);
      }
      disc(g, x - h * 0.70, y, h * 0.18, IRON, 0);
    },

    //  나누기 — 같은 몸 둘. 뒤엣것이 옅어 '진짜와 분신'이 읽힌다.
    clone: function (g, x, y, h) {
      fill(g, SKY, 0.42);
      g.fillEllipse(x - h * 0.40, y - h * 0.10, h * 0.78, h * 1.34);
      line(g, Math.max(1.5, h * 0.11), 0x3a6f8c, 0.7);
      g.strokeEllipse(x - h * 0.40, y - h * 0.10, h * 0.78, h * 1.34);
      fill(g, SKY, 1);
      g.fillEllipse(x + h * 0.40, y + h * 0.10, h * 0.86, h * 1.42);
      line(g, Math.max(1.7, h * 0.13));
      g.strokeEllipse(x + h * 0.40, y + h * 0.10, h * 0.86, h * 1.42);
    },

    //  몰아치기 — 겹쳐 지나간 참격 셋. 길이를 달리해야 '연속'이 된다.
    flurry: function (g, x, y, h) {
      [[-0.34, 1.00], [0.06, 0.80], [0.44, 0.94]].forEach(function (d, i) {
        var w = Math.max(2.2, h * (0.20 - i * 0.02));
        stroke(g, [-0.88 * d[1], d[0] - 0.52 * d[1], 0.88 * d[1], d[0] + 0.52 * d[1]],
          x, y, h, i === 1 ? BONE : STEEL, w, 1);
      });
    }
  };

  //  타입이 없거나 모르는 타입일 때 — 슬롯 글자로 되돌린다(호출부가 판단).
  G.SkillIcon = {
    has: function (type) { return !!ICONS[type]; },

    //  size = 아이콘이 들어갈 정사각 칸의 한 변(보통 버튼 지름 × 0.9).
    draw: function (g, type, cx, cy, size, opts) {
      var fn = ICONS[type];
      if (!fn) return false;
      V.setMono(!!(opts && opts.mono));
      fn(g, cx, cy, size * 0.44);
      V.setMono(false);
      return true;
    }
  };
})();
