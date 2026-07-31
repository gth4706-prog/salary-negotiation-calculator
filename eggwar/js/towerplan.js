window.GAME = window.GAME || {};

// ============================================================================
//  통곡의 탑 — 층 배치 원형 (2026-07-30 대개편)
//
//  ## 왜 만들었나 — 진단이 먼저다
//
//  사용자 신고: "층별로 난이도를 주는 게 너무 비슷해서 재미가 없다 / 컨트롤이 매번 똑같은
//  구조에 층 구조도 매번 똑같다 / 결국 똑같은 진형 반복일 뿐이다."
//
//  `tools/formation-diversity.js` 를 돌려 보면 **구성 다양성은 이미 높다** —
//  5층에서 아키타입 17/20, 교리 5종이 골고루 나오고 유닛 수도 11~16 으로 흔들린다.
//  즉 **지금 재고 있던 지표가 플레이어가 느끼는 것과 달랐다.**
//
//  플레이어는 "전사 6기 + 궁수 4기(swarm)" 와 "전사 5기 + 궁수 5기(spearhead)" 를
//  구분하지 못한다. 플레이어가 실제로 만지는 것은 세 가지다:
//    ① **공간** — 어디에 서면 안전한가, 어디를 뚫어야 하는가
//    ② **규칙** — 무엇이 허용되고 무엇이 벌받는가
//    ③ **목표** — 무엇을 하면 이기는가
//  그런데 `AutoFormation.generate` 는 **세 가지 다 고정**이었다:
//    · 배치는 언제나 band 별 균등 가로 분포 + ny 를 28%/72% 로 번갈아 (autoformation.js)
//    · 규칙은 언제나 같다(전멸시키면 승리)
//    · 목표도 언제나 같다
//  구성만 흔들고 공간을 고정했으니 "매번 똑같다"가 맞는 관찰이다. 지표가 틀렸던 것이다.
//
//  ## 이 파일이 하는 일
//
//  구성(무엇을 세우나)은 `AutoFormation` 이 계속 담당하고, 이 파일은 **공간(어디에 세우나)**
//  만 다시 정한다. 두 축을 분리했기 때문에:
//    · 기존 교리·성향·영웅 카운터 로직을 한 줄도 안 건드린다
//    · 원형을 추가하는 것이 곧 새 층 경험을 추가하는 것이다(유닛도 아트도 안 늘린다)
//    · 밸런스 시뮬(`tools/sim.js`)이 그대로 돈다 — 좌표만 바뀌므로
//
//  ## 원형을 고를 때 지킨 규율
//
//  1. **근접이 원거리보다 앞에 선다.** 이걸 깨면 원거리가 먼저 녹아 층이 통째로 쉬워진다.
//     원형은 '얼마나 앞에' 를 바꿀 수 있지만 순서를 뒤집지는 않는다.
//  2. **각 원형은 서로 다른 답을 요구한다.** 같은 답이 통하는 두 원형은 하나로 합쳤다.
//     예: 요새(뭉침)는 광역기가 답이고, 산개(퍼짐)는 광역기가 무용지물이다.
//  3. **화면이 이름을 말해 준다.** 이름 없는 변화는 플레이어에게 '그냥 어려워짐' 이다
//     (이 폴더가 층별 전술에서 이미 배운 것 — tower.js 의 NEW_TACTIC_LABEL 참조).
//  4. **좌표 범위를 벗어나지 않는다.** nx 0.06~0.94, ny 0.03~0.46.
//     ny 가 작을수록 플레이어에게서 멀다(플레이어는 아래에서 올라온다).
//
//  ⚠ 아직 안 한 것: 원형별 밸런스 미세조정. 원형은 난이도를 **바꾼다** — 요새는 광역기가
//    있으면 쉽고 없으면 어렵다. 그래서 `tools/regress.js` 로 층별 돌파율을 다시 재고,
//    특정 원형이 곡선을 깨면 그 원형의 밀도·전진량만 손댈 것. 유닛 스탯은 건드리지 않는다.
// ============================================================================

GAME.TowerPlan = (function () {

  // ── 좌표 한계 ──────────────────────────────────────────────────────────────
  //  전략가 구역은 ny 0 ~ 0.47 이다(autoformation.js 의 band 표가 그 안에 있다).
  //  0.46 을 넘기면 중립지대로 나가 첫 교전이 즉시 벌어져 어떤 원형이든 뭉텅이 돌격이 된다.
  var NX_MIN = 0.06, NX_MAX = 0.94;
  var NY_MIN = 0.03, NY_MAX = 0.46;

  function cx(v) { return Math.max(NX_MIN, Math.min(NX_MAX, v)); }
  function cy(v) { return Math.max(NY_MIN, Math.min(NY_MAX, v)); }
  function put(out, key, nx, ny) {
    out.push({ type: key, nx: Math.round(cx(nx) * 1000) / 1000,
               ny: Math.round(cy(ny) * 1000) / 1000 });
  }

  // 결정적 난수(xorshift). 같은 시드 → 같은 배치. 도구가 재현할 수 있어야 한다.
  function rng(seed) {
    var s = seed | 0; if (!s) s = 1;
    return function () {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s |= 0;
      return ((s >>> 0) % 100000) / 100000;
    };
  }

  // ── 역할 분류 ──────────────────────────────────────────────────────────────
  //  `AutoFormation.bandOf` 의 ny 대역을 역할로 접는다. 원형은 역할만 보고 배치한다 —
  //  유닛 종류가 늘어도 이 파일을 안 고치게 하려는 것이다.
  function roleOf(key) {
    var b = GAME.AutoFormation.bandOf(key);
    if (b[0] >= 0.35) return 'trap';    // 지뢰 — 지나가는 길에 둔다
    if (b[0] >= 0.24) return 'wall';    // 앞 벽 (근접)
    if (b[0] >= 0.11) return 'mid';     // 중거리
    return 'back';                      // 뒤 (저격·지원)
  }

  // 역할별로 나눈다. 순서는 항상 wall → mid → back (앞에서 뒤로).
  function split(list) {
    var g = { wall: [], mid: [], back: [], trap: [] };
    for (var i = 0; i < list.length; i++) g[roleOf(list[i])].push(list[i]);
    return g;
  }

  // 한 줄에 n 기를 가로로 편다. `c` 중심, `w` 폭(정규화).
  function row(out, keys, ny, c, w, jitterY, rand) {
    var n = keys.length;
    for (var i = 0; i < n; i++) {
      var f = n === 1 ? 0.5 : i / (n - 1);
      var jy = jitterY ? (rand() - 0.5) * jitterY : 0;
      put(out, keys[i], c - w / 2 + w * f, ny + jy);
    }
  }

  // ── 원형 목록 ──────────────────────────────────────────────────────────────
  //  `place(g, ctx)` — g 는 역할별 배열, ctx = { bias, rand, floor }.
  //  bias 는 플레이어가 자주 들어오는 쪽(−1 왼쪽 ~ +1 오른쪽)이다.
  var PLANS = [
    {
      key: 'line', label: '줄벽',
      hint: '가로로 늘어선 벽 — 어느 쪽이든 뚫는 값이 같다',
      why: '기준 원형. 1~3층 연습 구간은 항상 이것이다.',
      place: function (g, ctx) {
        var out = [];
        row(out, g.wall, 0.27, 0.5 + ctx.bias * 0.08, 0.76, 0.03, ctx.rand);
        row(out, g.mid, 0.18, 0.5 + ctx.bias * 0.06, 0.70, 0.03, ctx.rand);
        row(out, g.back, 0.08, 0.5, 0.54, 0.02, ctx.rand);
        row(out, g.trap, 0.40, 0.5, 0.60, 0.03, ctx.rand);
        return out;
      }
    },
    {
      key: 'pincer', label: '집게',
      hint: '양 날개에 뭉쳐 있고 가운데가 비었다 — 한쪽을 골라 먼저 부숴야 한다',
      why: '가운데로 들어가면 양쪽에서 맞는다. **어느 쪽을 먼저 지울지** 고르게 만든다.',
      place: function (g, ctx) {
        var out = [];
        // 두 날개로 반씩 쪼갠다. 플레이어가 자주 오는 쪽 날개를 조금 더 두껍게.
        var heavy = ctx.bias >= 0 ? 1 : 0;
        function wing(keys, side, ny0) {
          var c = side ? 0.80 : 0.20;
          var n = keys.length;
          for (var i = 0; i < n; i++) {
            var f = n === 1 ? 0 : (i / (n - 1)) - 0.5;
            put(out, keys[i], c + f * 0.20, ny0 + (i % 2 ? 0.05 : 0));
          }
        }
        function halve(arr) {
          var a = [], b = [];
          for (var i = 0; i < arr.length; i++) ((i % 2) === heavy ? a : b).push(arr[i]);
          return [a, b];
        }
        var w = halve(g.wall), m = halve(g.mid), k = halve(g.back);
        wing(w[0], 1, 0.29); wing(w[1], 0, 0.29);
        wing(m[0], 1, 0.19); wing(m[1], 0, 0.19);
        wing(k[0], 1, 0.08); wing(k[1], 0, 0.08);
        row(out, g.trap, 0.40, 0.5, 0.24, 0.02, ctx.rand);   // 빈 가운데에 덫
        return out;
      }
    },
    {
      key: 'keep', label: '요새',
      hint: '뒤쪽에 빽빽하게 뭉쳐 있다 — 광역기가 값을 하고, 파고들면 둘러싸인다',
      why: '뭉침을 벌주는 광역기와, 뭉친 곳에 들어가지 않는 절제를 동시에 시험한다.',
      place: function (g, ctx) {
        var out = [];
        var c = 0.5 + ctx.bias * 0.05;
        // 뒤쪽 블록 — 격자로 촘촘히
        var inner = g.mid.concat(g.back);
        var cols = Math.max(2, Math.ceil(Math.sqrt(inner.length)));
        for (var i = 0; i < inner.length; i++) {
          var r2 = Math.floor(i / cols), cc = i % cols;
          put(out, inner[i], c - 0.13 + (cols === 1 ? 0 : (cc / (cols - 1)) * 0.26),
              0.06 + r2 * 0.055);
        }
        // 근접은 그 블록 앞을 두 겹으로 막는다
        for (var j = 0; j < g.wall.length; j++) {
          var lane = j % 2;
          put(out, g.wall[j], c - 0.16 + (g.wall.length <= 1 ? 0.16 :
              (Math.floor(j / 2) / Math.max(1, Math.ceil(g.wall.length / 2) - 1)) * 0.32),
              lane ? 0.30 : 0.24);
        }
        row(out, g.trap, 0.38, c, 0.30, 0.02, ctx.rand);
        return out;
      }
    },
    {
      key: 'scatter', label: '산개',
      hint: '넓게 흩어져 있다 — 광역기가 헛돌고, 하나씩 떼어내야 한다',
      why: '요새의 정반대 답. 광역기에 의존하던 플레이를 무력화해 단일 대상 처리를 시험한다.',
      place: function (g, ctx) {
        var out = [];
        // 층 전체에 균등 격자 + 지터. 역할 순서는 지키되 대역을 넓게 쓴다.
        function spread(keys, y0, y1) {
          var n = keys.length;
          for (var i = 0; i < n; i++) {
            var f = n === 1 ? 0.5 : i / (n - 1);
            // 지그재그로 y 를 흔들어 '줄' 로 보이지 않게 한다
            var yy = y0 + (y1 - y0) * ((i % 2) ? 0.75 : 0.25) + (ctx.rand() - 0.5) * 0.04;
            put(out, keys[i], 0.10 + f * 0.80 + (ctx.rand() - 0.5) * 0.05, yy);
          }
        }
        spread(g.wall, 0.24, 0.36);
        spread(g.mid, 0.13, 0.24);
        spread(g.back, 0.04, 0.13);
        row(out, g.trap, 0.42, 0.5, 0.80, 0.04, ctx.rand);
        return out;
      }
    },
    {
      key: 'wedge', label: '쐐기',
      hint: '앞으로 뾰족한 쐐기 — 정면은 두껍고 옆구리는 얇다',
      why: '정면으로 받으면 최악, 옆으로 돌면 최선. **각도**를 고르게 만드는 원형이다.',
      place: function (g, ctx) {
        var out = [];
        var c = 0.5 + ctx.bias * 0.06;
        // 근접이 꼭짓점(가장 앞), 뒤로 갈수록 좌우로 벌어진다
        function vee(keys, yTip, dy, dx) {
          var n = keys.length;
          for (var i = 0; i < n; i++) {
            var side = (i % 2) ? 1 : -1;
            var step = Math.floor(i / 2);
            put(out, keys[i], c + side * step * dx * (n > 1 ? 1 : 0),
                yTip - step * dy);
          }
        }
        vee(g.wall, 0.34, 0.035, 0.11);
        vee(g.mid, 0.20, 0.030, 0.13);
        vee(g.back, 0.09, 0.025, 0.15);
        row(out, g.trap, 0.42, c, 0.20, 0.02, ctx.rand);
        return out;
      }
    },
    {
      key: 'ambush', label: '매복',
      hint: '앞에 미끼 몇 기, 본진은 저 뒤에 — 미끼를 물면 끌려간다',
      why: '"보이는 것만 치면 된다"는 습관을 벌준다. 전진 시점을 고르게 만든다.',
      place: function (g, ctx) {
        var out = [];
        var c = 0.5 + ctx.bias * 0.10;
        // 미끼 — 근접 중 최대 3기를 아주 앞으로
        var bait = g.wall.slice(0, Math.min(3, Math.max(1, Math.floor(g.wall.length / 3))));
        var rest = g.wall.slice(bait.length);
        row(out, bait, 0.43, c, bait.length > 1 ? 0.30 : 0, 0.02, ctx.rand);
        // 본진 — 뒤쪽에 압축
        row(out, rest, 0.14, c, 0.52, 0.03, ctx.rand);
        row(out, g.mid, 0.09, c, 0.56, 0.03, ctx.rand);
        row(out, g.back, 0.05, c, 0.44, 0.02, ctx.rand);
        // 덫은 미끼와 본진 **사이**에 — 물고 들어오는 길이다
        row(out, g.trap, 0.31, c, 0.44, 0.03, ctx.rand);
        return out;
      }
    },
    {
      key: 'doubleWall', label: '이중벽',
      hint: '근접이 두 줄 — 첫 줄을 넘어도 두 번째가 기다린다',
      why: '한 번의 돌파로 끝나지 않는다. 자원(쿨타임·물약) 배분을 시험한다.',
      place: function (g, ctx) {
        var out = [];
        var c = 0.5 + ctx.bias * 0.07;
        var half = Math.ceil(g.wall.length / 2);
        row(out, g.wall.slice(0, half), 0.33, c, 0.72, 0.02, ctx.rand);
        row(out, g.wall.slice(half), 0.23, c, 0.64, 0.02, ctx.rand);
        row(out, g.mid, 0.14, c, 0.62, 0.02, ctx.rand);
        row(out, g.back, 0.06, c, 0.48, 0.02, ctx.rand);
        row(out, g.trap, 0.42, c, 0.56, 0.03, ctx.rand);
        return out;
      }
    },
    {
      key: 'echelon', label: '사선',
      hint: '한쪽 날개가 훨씬 앞으로 나와 있다 — 얇은 쪽으로 돌면 길이 열린다',
      why: '좌우가 비대칭이라 **어느 쪽으로 도는가**가 그대로 승패가 된다.',
      place: function (g, ctx) {
        var out = [];
        // 두꺼운 쪽을 플레이어가 자주 오는 쪽에 둔다(그쪽으로 오면 벌받게)
        var dir = ctx.bias >= 0 ? 1 : -1;
        function diag(keys, y0, y1) {
          var n = keys.length;
          for (var i = 0; i < n; i++) {
            var f = n === 1 ? 0.5 : i / (n - 1);
            var nx = dir > 0 ? (0.12 + f * 0.76) : (0.88 - f * 0.76);
            put(out, keys[i], nx, y0 + (y1 - y0) * f);
          }
        }
        diag(g.wall, 0.20, 0.38);
        diag(g.mid, 0.10, 0.26);
        diag(g.back, 0.04, 0.14);
        row(out, g.trap, 0.42, dir > 0 ? 0.72 : 0.28, 0.30, 0.03, ctx.rand);
        return out;
      }
    },
    {
      key: 'ring', label: '고리',
      hint: '둥글게 둘러싼 진형 — 안으로 들어가면 사방에서 맞는다',
      why: '"뒤로 돌아 들어간다"는 답을 막는다. 바깥에서 갉아내는 인내를 시험한다.',
      place: function (g, ctx) {
        var out = [];
        var ccx = 0.5 + ctx.bias * 0.04, ccy = 0.23;
        var all = g.wall.concat(g.mid);
        var n = all.length;
        for (var i = 0; i < n; i++) {
          // 플레이어를 향한 아래쪽 호에 근접이 먼저 오도록 각도를 배치한다
          var ang = Math.PI * 0.5 + (n === 1 ? 0 : (i / n) * Math.PI * 2);
          put(out, all[i], ccx + Math.cos(ang) * 0.30, ccy + Math.sin(ang) * 0.17);
        }
        // 뒤 유닛은 고리 **안쪽**에 — 뚫고 들어가야 닿는다
        row(out, g.back, ccy, ccx, 0.22, 0.03, ctx.rand);
        row(out, g.trap, 0.42, ccx, 0.40, 0.03, ctx.rand);
        return out;
      }
    }
  ];

  // ── 층 → 원형 ──────────────────────────────────────────────────────────────
  //  같은 9층 구간 안에서 **9종이 한 번씩** 나오게 시드로 섞는다. 순수 난수로 뽑으면
  //  같은 원형이 연달아 나와 "또 이거야"가 되고, 고정 순서면 외워진다.
  //  1~3층은 연습 구간이라 늘 `line` 이다(CLAUDE.md 의 "1~3층은 쉬워도 된다" 약속).
  var CYCLE = PLANS.length;
  var PRACTICE_FLOORS = 3;

  function shuffledCycle(seed, cycleIdx) {
    var r = rng((seed ^ (cycleIdx * 0x9e3779b1)) | 0);
    var a = [];
    for (var i = 0; i < CYCLE; i++) a.push(i);
    for (var j = CYCLE - 1; j > 0; j--) {
      var k = Math.floor(r() * (j + 1));
      var t = a[j]; a[j] = a[k]; a[k] = t;
    }
    return a;
  }

  // ⚠ 2026-08-01 — 영구 캐릭터(js/towerchar.js)의 `climbSeed` 를 먼저 본다.
  //   `climbSeed` 는 캐릭터 자체의 시드(고정)가 아니라 **등반 시도마다 재롤되는**
  //   값이다 — 캐릭터가 영구화된 지금 `heroKey` 처럼 고정된 값을 쓰면 "이 캐릭터에게
  //   7층은 평생 같은 배치"가 되어 이 파일이 이미 경고한 실패 모드로 되돌아간다.
  //   옛 `TowerRun.seed`(도전 단위)는 폴백으로만 남긴다 — 대전이 그 파일을 계속
  //   쓰므로 삭제하지 않았을 뿐, 탑은 더 이상 이 경로를 타지 않는다.
  function seedNow() {
    var tc = GAME.TowerChar && GAME.TowerChar.get();
    if (tc && tc.climbSeed) return tc.climbSeed | 0;
    var run = GAME.TowerRun && GAME.TowerRun.get();
    if (run && run.seed) return run.seed | 0;
    // 캐릭터도 도전도 없을 때(단층 도전·도구)는 결정적으로 고정한다 — 측정이 재현돼야 한다.
    return 0x5eed;
  }

  return {
    PLANS: PLANS,
    PRACTICE_FLOORS: PRACTICE_FLOORS,

    // ── 측정용 강제 지정 ──────────────────────────────────────────────────
    //  `GAME.TowerPlan.FORCE = 'keep'` 로 두면 모든 층이 그 원형이 된다.
    //  **원형별 돌파율을 따로 재기 위한 노브**다(tools/tower-plan-curve.js).
    //  원형은 난이도를 바꾸므로 층 곡선을 원형 평균으로 보면 어느 원형이 곡선을 깼는지
    //  알 수 없다 — 이 폴더가 "원형 하나로 층별 곡선을 판정하지 말 것"(수성의 탑 절)에서
    //  이미 배운 것과 같은 함정이다. 게임 안에서 이 값을 세우는 코드는 없다.
    FORCE: null,

    // 이 층의 원형. `seed` 를 주면 그걸 쓴다(도구·테스트용).
    planFor: function (floor, seed) {
      if (this.FORCE) {
        for (var fi = 0; fi < PLANS.length; fi++) {
          if (PLANS[fi].key === this.FORCE) return PLANS[fi];
        }
      }
      if (floor <= PRACTICE_FLOORS) return PLANS[0];
      var s = (seed === undefined) ? seedNow() : (seed | 0);
      var n = floor - PRACTICE_FLOORS - 1;          // 0부터
      var cycleIdx = Math.floor(n / CYCLE);
      var order = shuffledCycle(s, cycleIdx);
      return PLANS[order[n % CYCLE]];
    },

    // 진형의 좌표만 다시 정한다. 구성(units 의 type 목록)은 손대지 않는다.
    // ⚠ 보스를 얹기 **전에** 부를 것 — 보스는 진형 한가운데 뒤쪽이라는 자기 규칙이 있다.
    apply: function (formation, floor, seed) {
      if (!formation || !formation.units || !formation.units.length) return formation;
      var plan = this.planFor(floor, seed);
      var keys = formation.units.map(function (u) { return u.type; });
      var s = (seed === undefined) ? seedNow() : (seed | 0);
      var ctx = {
        floor: floor,
        bias: 0,
        rand: rng((s ^ (floor * 2654435761)) | 0)
      };
      // 플레이어가 자주 들어오는 쪽 — 있으면 쓴다(없으면 0).
      if (GAME.Profile && GAME.Profile.read) {
        var p = GAME.Profile.read();
        if (p && typeof p.side === 'number') ctx.bias = p.side;
      }
      var placed = plan.place(split(keys), ctx);
      // 원형이 유닛을 흘리면 층이 조용히 쉬워진다 — 반드시 같은 수여야 한다.
      if (placed.length !== keys.length) {
        if (window.console) {
          console.warn('[towerplan] ' + plan.key + ' 가 유닛을 흘렸다: ' +
                       keys.length + ' → ' + placed.length + ' (줄벽으로 되돌린다)');
        }
        placed = PLANS[0].place(split(keys), ctx);
      }
      formation.units = placed;
      formation.plan = plan.key;
      formation.planLabel = plan.label;
      formation.planHint = plan.hint;
      return formation;
    }
  };
})();
