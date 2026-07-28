window.GAME = window.GAME || {};

// 터치 기기 판별 — 조작 스킴이 완전히 달라진다(마우스+QWER vs 탭+스킬버튼)
GAME.isTouch = (function () {
  return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
})();

// 세로 화면이면 클래시로얄처럼 위아래로 긴 전장을 쓴다.
// 배치도는 정규화 좌표(0~1)로 저장되므로 두 레이아웃 사이에서 호환된다.
// ?portrait=1 / ?portrait=0 으로 강제할 수 있다(개발·검증용).
GAME.isPortrait = (function () {
  var q = (location.search || '').match(/[?&]portrait=([01])/);
  if (q) return q[1] === '1';

  // 물리적 세로 방향이 1차 신호다. 폭 조건은 '진짜 큰 화면(데스크톱/태블릿 가로)'만
  // 거르는 보조로만 쓴다.
  //
  // 왜 이렇게까지 하나(실측 신고): 어떤 폰은 CSS 뷰포트 폭을 물리 픽셀에 가깝게(예 1080)
  // 보고한다 — 디스플레이 배율/줌 설정으로 devicePixelRatio 가 낮게 잡히는 경우다.
  // 그때 예전 `w < 900` 조건이 깨져 **세로 폰이 가로 레이아웃(1340×900)으로 굳고**,
  // 그 가로 캔버스가 세로 화면에 폭 기준으로 욱여넣어져 화면 한가운데 작게 떠 버렸다.
  // 폭 보고값에 기대지 말고, 터치 기기가 세로 방향이면 무조건 세로로 간다.
  var mqPortrait = window.matchMedia && window.matchMedia('(orientation: portrait)').matches;
  var d = document.documentElement || {};
  var w = d.clientWidth || window.innerWidth || 1200;
  var h = d.clientHeight || window.innerHeight || 800;

  // 터치 기기(폰·태블릿)가 세로 방향 → 무조건 세로 레이아웃.
  if (GAME.isTouch && (mqPortrait || h > w)) return true;
  // 비터치(데스크톱) → 창이 세로로 길고 좁을 때만 세로.
  return h > w && w < 900;
})();

// 지금 기기를 세로로 들고 있는가 — **레이아웃 판단이 아니라 '돌려주세요' 안내용**이다.
// (레이아웃은 아래 PROFILE 이 정한다. 모바일은 가로 전용이다.)
GAME.heldPortrait = function () {
  var d = document.documentElement || {};
  var w = d.clientWidth || window.innerWidth || 1200;
  var h = d.clientHeight || window.innerHeight || 800;
  var mq = window.matchMedia && window.matchMedia('(orientation: portrait)').matches;
  return !!(mq || h > w);
};

GAME.CONFIG = (function () {
  // ── 레이아웃 프로필 ───────────────────────────────────────────────────────
  //  'pc'    데스크톱 · 태블릿 가로   1340×900
  //  'phone' 폰 가로 (터치)           820×390
  //  'tall'  세로 (은퇴 예정)          420×900   — ?portrait=1 로만 진입한다
  //
  //  2026-07-28 결정: **모바일은 가로 전용**(롤토체스와 같은 방식).
  //  근거(실측):
  //   · 세로 전장은 면적이 46% 라 기동 공간이 없어 **같은 층이 두 배 어렵다**
  //     (1층 무조작 88%→50%, 프로 20층 50%→25%). 논타겟을 피하는 게 이 게임의
  //     핵심인데 피할 자리가 없다.
  //   · 회귀 스위트가 `?portrait=0`(가로)만 봐 왔다 → 폰 사용자는 측정된 적 없는
  //     더 어려운 게임을 하고 있었다. 가로로 통일하면 측정과 실제가 일치한다.
  //  세로로 든 폰에는 '돌려주세요' 안내를 띄운다(index.html #rotate).
  //  판별에 `isTouch` 만 쓰면 **터치 노트북**이 폰으로 잡힌다(윈도우 터치 랩톱에서
  //  창을 반만 띄우면 max 변이 1100 미만이 된다). `(pointer: coarse)` 를 함께 본다 —
  //  손가락이 주 포인터인 기기만 true 다. 마우스가 달린 터치 랩톱은 fine 이라 걸러진다.
  //  이 조건이 틀리면 기기별로 화면이 통째로 어긋나므로, `?diag=1` 에 PROFILE 을 찍는다.
  var forced = (location.search || '').match(/[?&]portrait=([01])/);
  var coarse = !(window.matchMedia && window.matchMedia('(pointer: fine)').matches);
  var maxDim = Math.max(window.innerWidth || 0, window.innerHeight || 0,
                        // ⚠ 선언되지 않은 식별자는 `screen && ...` 로도 ReferenceError 가 난다.
                        //   이 한 줄 때문에 헤드리스 시뮬(tools/sim.js)이 통째로 죽었다 —
                        //   게임 코드는 window 가 없는 환경에서도 로드될 수 있어야 한다.
                        (typeof screen !== 'undefined' && screen.width) || 0,
                        (typeof screen !== 'undefined' && screen.height) || 0);
  var PROFILE;
  if (forced) PROFILE = forced[1] === '1' ? 'tall' : 'pc';
  else if (GAME.isTouch && coarse && maxDim < 1100) PROFILE = 'phone';
  else PROFILE = 'pc';

  var P = (PROFILE === 'tall');

  // 설계 해상도.
  //
  // 세로는 **폰 화면 크기에 가깝게** 잡는다. 예전 660×1160 은 폰 뷰포트(390×844)보다
  // 훨씬 커서 Phaser FIT 이 0.59 배로 줄여버렸고, 그 결과 설계 10px 글자가 화면에서
  // 5.9px 로 찍혀 아무것도 안 보였다(실측). 비율도 안 맞아 위아래 159px 가 버려졌다.
  //
  // 420×900 은 폰 비율(≈0.46)에 맞아 letterbox 가 8px 로 줄고 축소율이 0.93 이 된다
  // → 설계 px 가 거의 그대로 화면 px 다. **세로 폰트는 이 전제 위에서 잡는다.**
  // 이 값을 다시 키우려면 폰에서 실측한 글자 크기부터 확인할 것.
  //
  // 폰 가로(820×390)는 실제 폰 가로 뷰포트에 맞춰 잡았다. FIT 배율 실측:
  //   iPhone 14 844×390 → 1.00 · 15 Pro Max 932×430 → 1.10
  //   iPhone SE 667×375 → 0.81 (최악) · iPad 1024×768 → 1.25
  // 1340×900 을 그대로 쓰면 폰 가로에서 배율 0.43 이라 13px 글자가 5.6px 이 된다(실측).
  var PHONE = (PROFILE === 'phone');
  var W = P ? 420 : (PHONE ? 820 : 1340);
  var H = P ? 900 : (PHONE ? 390 : 900);
  // 폰 가로는 HUD·조작을 전장 **위에 겹쳐** 올린다(롤토체스 방식) — 높이 390 에
  // 막대를 쌓을 여유가 없다. 그래서 아레나가 캔버스를 거의 다 쓴다.
  var arena = P
    ? { x: 9, y: 9, w: 402, h: 694 }
    : (PHONE ? { x: 6, y: 6, w: 808, h: 378 }
             : { x: 20, y: 20, w: 1300, h: 760 });

  // 배치 구역: 위 30%가 전략가, 아래 30%가 컨트롤러
  var zoneH = Math.round(arena.h * 0.30);

  return {
    PROFILE: PROFILE,
    PORTRAIT: P,
    // '작은 화면' — 글자를 상대적으로 크게, 터치 타깃을 두껍게 가져가야 하는가.
    // PORTRAIT 와 분리한 이유: 폰 가로는 **세로 레이아웃이 아니지만 작은 화면**이다.
    // 예전엔 이 둘이 한 플래그(PORTRAIT)에 뭉쳐 있어서, 가로로 바꾸는 순간
    // 폰이 데스크톱용 글자 크기를 받게 된다.
    SMALL: P || PHONE,
    PHONE: PHONE,
    WIDTH: W,
    HEIGHT: H,
    ARENA: arena,

    ZONE_STRATEGIST: { x: arena.x, y: arena.y, w: arena.w, h: zoneH },
    ZONE_CONTROLLER: { x: arena.x, y: arena.y + arena.h - zoneH, w: arena.w, h: zoneH },

    BATTLE_TIME: 90,

    // 예산은 전략가가 배치도를 만들 때 고른다.
    // 컨트롤러는 그 배치도와 '같은 예산'으로 영웅+아이템을 산다 → 항상 동등한 조건.
    BUDGETS: { '저예산': 120, '중예산': 160, '고예산': 220 },
    BUDGET_TIERS: ['저예산', '중예산', '고예산'],
    DEFAULT_TIER: '중예산',

    // 배치 지점에서 벗어날 수 있는 기본 거리(유닛별 chase 가 있으면 그걸 쓴다)
    LEASH: 115,

    // 월드 거리 배율.
    //
    // 이 게임은 월드 좌표 = 화면 좌표라, **설계 해상도를 줄이면 전장도 같이 줄어든다.**
    // 세로를 660→420 으로 줄였을 때 아레나 면적이 46% 가 됐고, 투창병 사거리(420)가
    // 아레나 폭(402)을 통째로 덮어버렸다 — 도망칠 공간이 사라지는 것이다.
    // 그래서 거리성 스탯(사거리·이동속도·추격·범위)에 이 배율을 곱해
    // **아레나 대비 상대 기하를 예전 그대로 보존**한다. 밸런스 수치를 다시 안 뽑아도 된다.
    // 기준은 예전 세로 아레나 폭 632.
    // 폰 가로 아레나(808×378)는 PC(1300×760)보다 **면적이 31%** 다. 폭만 보고 환산하면
    // (808/1300 = 0.62) 세로 방향 여유가 실제보다 크게 잡혀 접근 거리가 짧아진다.
    // 면적의 제곱근으로 환산해 상대 기하를 보존한다 → 0.556.
    // ⚠ 가로세로 비(2.14 vs 1.71)까지 같아지는 건 아니다. 이 프로필의 곡선은
    //   `SIM_PHONE=1 node tools/regress.js` 로 **따로 측정해야 한다.**
    WORLD_SCALE: P ? arena.w / 632
                   : (PHONE ? Math.sqrt((arena.w * arena.h) / (1300 * 760)) : 1),

    // 맵 대각선 = '맵 끝까지 닿는다'의 기준값.
    // 원칙: **영웅에게 쉬는 시간도 사각지대도 없다.** 모든 전략가 유닛은 둘 중 하나여야 한다
    //   · 영웅에게 접근할 수 있다 (압박이 차오르면 추격 범위가 이 값까지 늘어난다)
    //   · 고정이라면 사거리가 이 값이라 맵 어디든 닿는다
    // 지뢰만 예외다 — 밟아야 터지는 게 지뢰의 정체성이라 추격도 사거리도 없다.
    MAP_SPAN: Math.ceil(Math.sqrt(arena.w * arena.w + arena.h * arena.h)),

    // 크리티컬 — 모든 공격에 적용된다
    CRIT_CHANCE: 0.25,
    CRIT_MULT: 1.5,

    // 광역 흡혈 감쇠 — 한 번의 공격이 여러 기를 때릴 때 **두 번째 대상부터** 흡혈에 곱해진다.
    // 1.0 이면 명중 수만큼 흡혈이 그대로 곱해져서, 진형이 촘촘할수록 영웅이 더 회복한다
    // (= 전략가의 물량이 영웅의 밥이 된다). 그 역전을 막는 값이다.
    AOE_LIFESTEAL: 0.25,

    // 흡혈 스윙 총량 상한 — **한 번 휘두르기(부채꼴·광역 스킬)에서 회복할 수 있는 총량**을
    // 최대체력의 이 비율로 묶는다. 배선은 `Combat._lsBudget` / `applyDamage(opts.lsBudget)` 에
    // 살아 있고 값만 0(=상한 없음)이다.
    //
    // ⚠ **0 은 "아직 안 정했다"가 아니라 실측으로 고른 값이다. 올리지 말 것.**
    //
    // 원래 의도: "흡혈이 명중 대상 수에 비례해 증폭된다"는 증폭을 끊는 장치.
    // 2026-07-28 계측 결과 **그 증폭은 이미 없다.** AOE_LIFESTEAL(0.25) 감쇠와
    // 파수꾼 부채꼴 너프(120°/72 → 90°/64)가 합쳐져 이미 잡혀 있었다.
    // 파수꾼 스윙별 회복 분포(수성의 탑 8·15·30층, 최대체력 대비):
    //     명중 1기  → 평균 0.33~0.53%   ← 가장 크다
    //     명중 6~11기 → 평균 0.09~0.15%  ← **오히려 더 작다**
    // 다중 명중 스윙은 근접 부채꼴이 아니라 '파수 구역'(aura, dps 21) 틱이라
    // 대상당 피해가 작아 총 회복도 작다. 스윙당 회복은 최대 0.92% 를 넘지 않았다.
    //
    // 그래서 상한을 걸 **창이 없다**: 0.008 이상은 어떤 스윙도 건드리지 못하고(무효),
    // 실제로 물리려면 단일 대상 회복(0.33~0.53%)보다 낮게 잡아야 하는데 그러면
    // 증폭 차단이 아니라 그냥 흡혈 너프다. 실측(수성의 탑, 파수꾼 고정, rep=16,
    // '제대로 배치' 방어율 4·6·8·10·15·20·30·40층):
    //     cap=0     : 13 0 0 0 0 0 0 0
    //     cap=0.008 : 13 0 0 0 0 0 0 0   ← 완전 무효
    //     cap=0.004 : 13 0 0 0 0 0 0 0   ← 완전 무효
    //     cap=0.002 : 31 0 0 0 0 0 0 0   ← 4층만 흔들고 곡선은 그대로
    //     흡혈 전면 제거: 63 6 0 0 44 6 44 0   ← 이래도 곡선이 안 잡힌다
    // 즉 **흡혈은 수성의 탑 난이도 곡선의 원인이 아니다.** 진짜 원인은 따로 있다
    // (영웅별 유효 내구도 격차 ≈ 2.7배, 그리고 쇠뇌 진지 편중) — docs 의 조사 기록 참조.
    //
    // 다시 켤 조건: **넓은 부채꼴 + 대상당 높은 피해**를 가진 영웅/스킬이 새로 들어올 때.
    // 그때는 위 분포를 다시 뽑아 '단일 대상 회복 < cap < 다중 합계'인 창이 생겼는지 확인하고,
    // 창이 있을 때만 값을 넣는다. 창이 없으면 상한은 흡혈 너프일 뿐이다.
    LIFESTEAL_SWING_CAP: 0,

    // 게임 폰트 — 아래 GAME.Font 가 Jua(구글 폰트, 정확 서브셋 1파일)를 미리 받아둔다.
    // Jua 가 못 오면 이 스택의 다음 후보로 자동 폴백하므로 화면이 깨지지 않는다.
    FONT: '"Jua", "Malgun Gothic", "Apple SD Gothic Neo", "맑은 고딕", sans-serif',

    COLORS: {
      bg: 0x101018,
      arenaFill: 0x1e1e2c,
      arenaLine: 0x3a3a52,
      zoneStrategist: 0x2a2440,
      zoneController: 0x1c3038,
      controller: 0x35d0a5,
      strategist: 0x9b8cf0,
      selectBox: 0x7ed957,
      hpGood: 0x4ade80,
      hpBad: 0xef4444,
      text: '#e8e8f0',
      textDim: '#9a9ab0',
      accent: '#35d0a5',
      accentAlt: '#9b8cf0',
      warn: '#f0a86a',
      crit: '#ffd166'
    }
  };
})();

GAME.CONFIG.ARENA.right = GAME.CONFIG.ARENA.x + GAME.CONFIG.ARENA.w;
GAME.CONFIG.ARENA.bottom = GAME.CONFIG.ARENA.y + GAME.CONFIG.ARENA.h;

// 아레나 수직 중심을 기준으로 y를 뒤집는다.
// 전략가가 아래(사람 자리)에서 만든 배치도를 위쪽(전투 기준)으로 변환할 때 쓴다.
GAME.mirrorY = function (y) {
  var A = GAME.CONFIG.ARENA;
  return Math.round(2 * (A.y + A.h / 2) - y);
};

// ═══════════════════════════════════════════════════════════════════════════
//  게임 폰트 — Jua (구글 폰트, 정확 서브셋)
//  ---------------------------------------------------------------------------
//  왜 웹폰트인가: 기본값이던 "Malgun Gothic" 은 윈도우의 **문서용** UI 폰트다.
//  캐주얼 게임 톤과 안 맞는다는 지적이 실제로 나왔다.
//
//  왜 Jua 인가: 둥근 종결·두툼한 획이라 계란 아트와 톤이 맞고, 같은 px 에서
//  Malgun 보다 **줄 폭이 0.81 배**로 좁아 좁은 세로 화면에서 줄바꿈이 줄어든다
//  (실측: '예산 유닛 배치' 100px 기준 advance 670→544). 메뉴 설명문이 2줄로
//  넘쳐 다음 버튼을 덮던 겹침 3건이 이 폭 차이만으로 사라진다.
//
//  왜 text= 정확 서브셋인가 (빌드 단계 없이 GitHub Pages 로 나가는 게임이라 중요):
//    · 동적 서브셋(unicode-range)  = woff2 25개 / 491 KB
//    · text= 정확 서브셋           = woff2  1개 / 146 KB   ← 이걸 쓴다
//  캔버스(Phaser) 텍스트는 폰트가 늦게 와도 **다시 그려지지 않는다.** 그래서 어차피
//  화면에 쓸 글자를 전부 미리 받아둬야 하고, 그러면 동적 서브셋의 이점이 사라진다.
//  (실측치는 dz2-fontsize2.js. 게임 자체 첫 로딩이 약 3 MB(인트로 영상)라 5% 수준.)
//
//  SUBSET 구성: 소스 문자열 리터럴의 글자 610자 + 남는 자리에 흔한 받침 없는 조합 190자.
//  ⚠ **구글 폰트 text= 는 고유 800자까지만 파일 하나로 준다**(실측: 800 → @font-face 1개,
//    802 → 87개로 동적 서브셋 복귀). 지금이 정확히 800자로 꽉 찬 상태다.
//    글자를 더 넣으려면 다른 글자를 빼거나, @font-face 수가 1인지 반드시 확인할 것.
//  여기 없는 글자(예: 사용자 닉네임의 드문 음절)는 **그 글자만** 폴백 폰트로 그려진다
//  — 깨지지 않는다. 재생성: scratchpad/dz2-mksubset.js
// ═══════════════════════════════════════════════════════════════════════════
GAME.Font = (function () {
  var FAMILY = 'Jua';
  var SUBSET =
    ', KEY_RG:MINL2AX1BD[oieast$.gWr]k-Uhp/jlcmwPSOT()bd?=u&y>0*;}fHv' +
    'x3+64#895<7{q!%QF|"@zCVZ~닉네임을입력해주세요자이상하로한글영문숫만쓸수있습니다사용할없는표현포함돼차단' +
    '된신고생성최근접속횟여부됨미설정점전송실패컬기록은유지흙바닥풀숲돌담청동벽황금알의둥떠광웃족냥꾼늪약탈언덕파름도붉목리깨진껍질흡' +
    '혈버틴뭉치않넓게벌려붙에원거녹인든가시덫투석으응징방병막를린창과화망칠곳앤예산당궁배대아직보어균형조합했드두쇠뇌멀서명중물량둔회' +
    '피능숙공격비올림논타겟늘좌측우많그쪽강닛크덜줄폰너무작면뭘안율교맞았충분히위협받퐁절계쓰적순간날닿구루각집갈저래스넉백걸음친통나' +
    '십봉쇄뼈볏뛰양손검꺼워관박먼후모뿌죽르폭초씹내낙살연불뒷끈장풍일프헌련축였체채꼴긴싼낮페널티야데값라오됐효었남되씩떼낸핵심찍밀던' +
    '철숨역경톳발칼끼흑갑옷북등짚깃털킬쿨옹달샘복말열매머압못따웅앞러제뱅잡반더극난랐왼른들와향빠승률렸험추뚫웠퇴활컨트롤선택닫브감필' +
    '총개메뉴엇급탑층칸터같둘좁큼번탭며튼클릭키본략겼호처준짐디까탁베밟눈갖뜨운것온길놓깝소옵랭킹켜싸웁힐판잘재확눌변착범학찰람뒤춰슬' +
    '롯즉끌김촘쏜곡곧끊깎건됩란칭토누짠센겨룰깰짜꾸렬침외골꿉락끝났새팅쳐봅텼노섬멸결획득솔랜덤왜졌첫빌때께읽마종냈냄삼플레랑뜻텔빛블' +
    '딸색테월캔팝탕젤굵곽큰쑥펠흰잉덮엄틱얼셋존앉갔텍군킨맵식움렘쉬쏘댄쟁카띠삐씨찌코꼬또뽀쪼쿠푸뚜쑤쭈허커퍼뻐써쩌느므즈흐츠끄쁘쯔애' +
    '캐태빼쌔째헤케뻬쎄쩨녀뎌벼셔져혀텨펴껴뗘쎠쪄뇨됴료묘뵤쇼죠쵸쿄툐꾜뚀뾰쑈쬬갸냐댜랴먀뱌샤쟈햐챠캬탸퍄꺄땨뺘쌰쨔규듀류뮤뷰슈쥬휴츄' +
    '큐튜퓨뀨뜌쀼쓔쮸괴뢰뫼뵈죄쾨푀꾀뙤뾔쐬쬐놔돠롸뫄봐솨촤콰톼퐈꽈똬뽜쏴쫘귀뉘뤼뮈뷔쥐휘취퀴튀퓌뀌쀠쒸쮜궈눠둬뤄뭐붜숴줘훠쿼퉈풔꿔뚸' +
    '뿨쒀쭤긔늬듸릐믜븨싀즤희츼킈틔픠끠띄쁴씌쯰녜뎨례몌볘셰졔혜쳬켸톄';


  var d = document, head = d.head || d.getElementsByTagName('head')[0];

  function addLink(rel, href, cross) {
    var l = d.createElement('link');
    l.rel = rel; l.href = href;
    if (cross) l.crossOrigin = 'anonymous';
    head.appendChild(l);
    return l;
  }

  // 핸드셰이크를 미리 열어둔다 — 첫 화면(인트로 영상)이 도는 동안 폰트가 도착하게.
  addLink('preconnect', 'https://fonts.googleapis.com');
  addLink('preconnect', 'https://fonts.gstatic.com', true);

  var href = 'https://fonts.googleapis.com/css2?family=' + FAMILY.replace(/ /g, '+') +
    '&display=swap&text=' + encodeURIComponent(SUBSET);
  var sheet = addLink('stylesheet', href);

  // 준비 완료 약속. **절대 영원히 pending 이 되지 않는다** — 오프라인이거나 구글이
  // 막힌 망(사내망 등)에서 게임이 통째로 안 뜨는 게 최악이므로 상한을 둔다.
  var ready = new Promise(function (resolve) {
    var settled = false;
    function done(why) { if (!settled) { settled = true; GAME.Font.state = why; resolve(why); } }
    setTimeout(function () { done('timeout'); }, 2500);
    sheet.onerror = function () { done('error'); };
    sheet.onload = function () {
      if (!d.fonts || !d.fonts.load) return done('no-font-api');
      // 서브셋이 파일 하나라 글자 몇 개만 요청해도 통째로 받아진다.
      d.fonts.load('16px "' + FAMILY + '"', '가나다ABC123')
        .then(function () { done('ok'); })
        .catch(function () { done('load-failed'); });
    };
  });

  return { FAMILY: FAMILY, SUBSET: SUBSET, ready: ready, state: 'pending' };
})();

// 문서 루트에 상태 클래스를 심는다 — CSS 가 '터치 기기인가'를 알 방법이 없기 때문.
//   .touch          터치 기기 (폰·태블릿)
//   .allow-portrait 세로 레이아웃을 명시적으로 허용(?portrait=1) — 회전 안내를 띄우지 않는다
// 이 두 클래스로 index.html 의 #rotate(가로로 돌려주세요) 노출을 제어한다.
(function () {
  var el = document.documentElement;
  if (!el || !el.classList) return;
  if (GAME.isTouch) el.classList.add('touch');
  if (GAME.CONFIG.PORTRAIT) el.classList.add('allow-portrait');
})();
