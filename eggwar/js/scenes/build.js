window.GAME = window.GAME || {};

// 전략가 — 진형을 짜서 배치도로 저장한다.
// 사람이 배치하는 유닛은 항상 화면 아래에 놓고, 저장할 때 위쪽(전투 기준)으로 뒤집는다.
// 좌표는 정규화(0~1)로 저장되므로 세로/가로 어느 쪽에서 만들어도 호환된다.
//
// ── 이 화면이 왜 이렇게 생겼는가 (v0.32 개편) ────────────────────────────────
// 예전 화면의 실측된 문제 넷을 각각 겨냥해 고쳤다.
//  ① **팔레트 아이콘이 아예 안 보였다.** 유닛 그림을 `this.g` 에 그렸는데 그 Graphics 가
//     칩 사각형보다 **먼저** 만들어져 있어서 칩이 그림을 덮었다. 그래서 유닛 구분이
//     오로지 이름 글자에만 의존했다("어떤 유닛인지 알기 어렵다"의 진짜 원인).
//     → 칩 뒤에 별도 Graphics(`palG`)를 칩 **다음에** 만들어 아이콘을 위로 올렸다.
//  ② **경고문과 유닛 설명이 같은 줄에 겹쳐 찍혔다**(세로, AABB 교차로 확인).
//     → 둘을 **한 줄(statusText)로 합쳤다.** 같은 객체면 겹칠 수가 없다.
//  ③ **안내 문구가 전장 위에 얹혀 유닛 그림과 겹쳤다.**
//     → 전장 안 글자를 전부 없애고 아레나 위 한 줄 + HUD 안내로 옮겼다.
//  ④ **잘못 놓은 유닛을 지울 방법이 사실상 없었다.** 길게 누르기(450ms)는 발견이 안 되고
//     우클릭은 폰에 없다. → 유닛을 탭하면 머리 위에 **✕ 배지**가 떠서 한 번 더 탭하면
//     지워진다. 되돌리기 버튼도 넣었다(전부 지우기밖에 없던 것이 가혹했다).
// 여기에 탭 왕복을 줄이는 두 가지를 더 넣었다.
//  ⑤ **못 사는 유닛은 팔레트에서 미리 흐려진다** — 눌러보고 경고를 읽는 왕복이 사라진다.
//  ⑥ **좌우 대칭 배치** — 진형은 대개 대칭이라 탭 한 번이 두 기가 된다(전장 탭 절반).
//
// ── 폰 가로 전면 개편 (TFT 전투화면 구성) ───────────────────────────────────
// 실기기 신고: "배치하는 땅이 너무 안 보인다. 적진은 안 보여도 된다. 메뉴는 상단 버튼으로
// 숨기고 유닛은 아래에." 실측 원인은 명확했다 — HUD 오버레이가 y −14~172 를 덮어
// 화면의 44% 를 먹었고, 정작 배치 구역은 **82px 짜리 얇은 띠**였다.
//
// 고친 방법은 '이 씬에서만 투영을 다시 잡는 것'이다. `GAME.Iso` 는 y 만 압축하므로
//     TILT       = (보드높이) / zone.h
//     SCREEN_TOP = 보드바닥 − (zone.바닥 − ARENA.y) × TILT
// 로 두면 **배치 구역을 화면의 원하는 띠에 정확히 앉힐 수 있고**, 아레나 위쪽(적진)은
// 자연히 화면 밖으로 밀려난다. `toWorldY` 가 정확한 역변환이라 탭→월드 좌표도 그대로 맞다.
// 월드 좌표는 한 픽셀도 안 건드리므로 밸런스·저장 배치도에는 영향이 없다.
// **씬을 떠날 때 `Iso.setMode('default')` 로 반드시 되돌린다** — 안 그러면 전투가 깨진다.
//
// ── PC(1340×900)도 같은 방식으로 (2026-07-28) ───────────────────────────────
// 사용자 지시: "PC 도 배치할 곳 화면만 보여주고, 2배로 복사되는 버그를 없애라."
// 두 가지가 한 번에 풀린다.
//  · PC 에서 유닛이 두 벌로 보이던 진짜 원인은 대칭 배치가 아니라 `redraw()` 의
//    **'상대가 볼 모습' 반투명 미리보기**였다(놓인 유닛을 `mirrorY` 자리에 한 번 더 그렸다).
//    적진을 화면 밖으로 밀어내면 그릴 이유 자체가 사라진다 → 미리보기 삭제.
//  · 배치 구역이 화면에서 137px(기본 투영 TILT 0.60) 밖에 안 됐다. 보드 띠를 그대로 두고
//    TILT 만 올리면 **같은 자리에서 구역만 커진다** — 그래서 HUD 행을 한 줄도 안 옮겼다.
// 보드 바닥을 기본 투영의 아레나 바닥에 맞추는 것이 그 요령이다(아래 `_boardBand`).
// 세로(`?portrait=1`)는 은퇴 예정 프로필이라 손대지 않았다 — 예전 투영과 미리보기 그대로다.
GAME.BuildScene = function () {
  Phaser.Scene.call(this, { key: 'Build' });
};
GAME.BuildScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.BuildScene.prototype.constructor = GAME.BuildScene;

// 길게 눌러 제거로 판정하는 시간. ✕ 배지가 생긴 뒤로는 보조 수단이지만,
// 이미 손에 익은 사람을 위해 남겨둔다.
GAME.BuildScene.HOLD_MS = 450;
// 경고를 띄운 뒤 설명으로 되돌아가는 시간
GAME.BuildScene.WARN_MS = 2200;
// 첫 진입 안내를 띄워두는 시간
GAME.BuildScene.HINT_MS = 4200;

// ── 배치 보드 압축비 상한 ────────────────────────────────────────────────────
//  TILT 가 1.0(정탑다운)을 넘으면 지면 원이 **세로로 늘어난 타원**이 된다
//  (치유·강화·지뢰 반경을 `UI.groundCircle` 로 그리기 때문). 그래서 상한을 둔다.
//
//  실측 비교(844×390, 전사6+궁수4+약초꾼1 배치, 스크린샷 u1.0 / u1.4 / u1.8-units.png):
//    1.0 → 배치 구역 화면 113px. 원은 정확한 원이지만 **세 줄이 37px 간격이라
//          뒷줄 유닛이 앞줄에 2/3 가려진다.** 위쪽 중립 지대가 121px 로 절반을 먹는다.
//    1.4 → 158px. 줄 간격 52px 로 세 줄이 다 읽힌다. 중립 지대 76px 로 접근 거리도 남는다.
//          원이 1.4 배 세로로 늘어나지만 유닛 발밑 '웅덩이'로 읽히는 수준.
//    1.8 → 203px. 중립 지대가 31px 뿐이라 맥락이 사라지고 타원이 확실히 거슬린다.
//  → **1.4 채택.** 기준선(82px)의 1.93 배다. 정확한 원을 원하면 1.0 으로 내리면 된다
//    (이 한 줄만 바꾸면 되고 다른 코드는 그대로 동작한다).
//  ⚠ 대가: 전투 화면은 TILT 0.72 라 배치 때보다 세로가 절반으로 보인다(상대 배치는 보존).
GAME.BuildScene.TILT_CAP = 1.4;

// ── PC(1340×900) 배치 보드 ──────────────────────────────────────────────────
//  폰과 달리 세로 여유가 크다. 폰 아레나는 zone.h 가 113(월드)뿐이라 TILT 1.0 이면
//  화면 113px 밖에 안 나와 3줄 배치가 안 읽혔지만, PC 는 zone.h 가 **228**이라
//  1.0(정탑다운)만으로도 화면 228px 이 나온다 — 기본 투영(0.60, 137px)의 1.66 배다.
//
//  실측 비교(1340×900, 전사 3줄 + 궁수 + 약초꾼, 스크린샷 pc-tilt10.png / pc-tilt14.png):
//    1.0 → 배치 구역 228px. 줄 간격 76px 로 세 줄이 완전히 분리돼 읽힌다.
//          **지면 원(치유·강화·차단 반경)이 정확한 원**이라 반경 판단이 정직하다.
//          위쪽 중립 지대 228px — 영웅이 달려올 접근로가 보인다.
//    1.4 → 319px. 줄 간격 106px 로 더 시원하지만 원이 세로로 1.4 배 늘어난 타원이 되고
//          (약초꾼 치유 반경 150 → 300×420), 중립 지대가 137px 로 줄어 맥락이 얇아진다.
//  → **1.0 채택.** 폰에서 1.4 가 필요했던 이유(줄이 겹쳐 안 읽힘)가 PC 에는 없다.
//    타원 왜곡이라는 대가만 남으므로 정확한 원을 택한다.
GAME.BuildScene.PC = {
  // 보드 위 여백 — 안내 한 줄이 들어가는 자리. 여기 위쪽은 배경으로 덮어 전장을 자른다.
  BOARD_TOP: 62,
  TILT_CAP: 1.0
};

// 툴팁(PC 전용) 치수 — 전장을 과하게 가리지 않는 선.
//  1340×900 에서 폭 320 은 화면의 24%, 높이는 내용에 따라 150~210(17~23%).
GAME.BuildScene.TIP = { W: 320, PAD: 12, GAP: 5, OFF: 18, MARGIN: 8 };

// ── 폰 가로(820×390) 전용 좌표 — TFT 전투화면 구성 ──────────────────────────
//  0..60    상단 바   : 예산 요약 · 선택 유닛 · [방어전 시작] [☰]
//  66..300  배치 보드 : 화면에서 가장 큰 요소. 적진은 화면 밖.
//  306..380 팔레트    : 유닛 10칸 한 줄(TFT 상점 줄)
//  오른쪽 끝 VER_W 는 DOM 버전 배지(#ver) 자리라 비운다.
//  터치 타깃은 전부 설계 55px 이상 — SE(667×375, FIT 0.813)에서 화면 44px 를 넘어야 한다.
GAME.BuildScene.PHONE = {
  PAD: 10,
  BAR_H: 60,
  METER_X: 10, METER_Y: 15, METER_W: 300, METER_H: 30,
  INFO_X: 320,
  // 48 로 뒀더니 아이폰 SE(FIT 0.813)에서 화면 39px 이라 터치 하한(44)에 미달했다(실측).
  // 55 × 0.813 = 44.7 → 상단 바(60) 안에 2.5~57.5 로 들어가고 보드(66~)를 안 밀어낸다.
  BTN_H: 55, BTN_CY: 30,
  // 대칭 토글을 없앤 자리(2026-07-30)를 **주 버튼이 물려받는다.**
  // 빈칸으로 두면 상단 바가 오른쪽으로 쏠려 보이고, 주 버튼은 원래 138px 로
  // '내 배치 저장' 같은 긴 라벨이 빡빡했다 — 넓히는 데 쓰는 것이 맞다.
  START_CX: 610, START_W: 268,
  MENU_CX: 782, MENU_W: 56,
  //  ── 초록 접근 지대를 줄였다 (2026-08-08, 사용자 지시) ────────────────────
  //  실측: 보드 66~300 중 **위쪽 초록이 76px**(3분의 1)이었고 파란 배치 구역은 123px 뿐이었다.
  //  ⚠ 투영(`_applyBoardProjection`)은 **바닥 기준**이라 `TILT` 가 상한(1.4)에 걸린
  //    동안에는 보드 위를 잘라도 파란 구역이 그대로다 — 초록만 줄어든다.
  //    (상한 아래로 내려가면 파란 구역까지 같이 줄어드니 이 값을 더 키우지 말 것)
  //  ⚠ 초록을 **0 으로 만들지 않는다.** 적이 어디서 오는지 보여 주는 맥락이라,
  //    다 지우면 배치가 '어느 방향을 막는 일'이라는 게 화면에서 사라진다. 24px 남긴다.
  BOARD_TOP: 118,
  BOARD_BOTTOM: 300,
  //  줄인 자리를 쓴다: 왼쪽은 고른 유닛 설명, 오른쪽은 배치 초기화.
  INFO_Y: 64, INFO_H: 48,
  RESET_W: 150,
  PAL_Y: 306, PAL_H: 74, PAL_GAP: 3,
  VER_W: 60
};

GAME.BuildScene.prototype.init = function (data) {
  this.placed = [];
  this.history = [];         // 되돌리기 — 한 번의 배치가 만든 유닛들을 묶어 쌓는다
  this.selected = null;      // ✕ 배지를 띄울 유닛
  // ⚠ 씬을 다시 들어오면 이 버튼은 이미 파괴돼 있다(파괴된 Phaser 객체도 truthy 다).
  //   비우지 않으면 `if (!this.upPop)` 가드를 통과해 죽은 객체를 만진다.
  // 씬을 다시 들어오면 이 객체들은 이미 파괴돼 있다(파괴된 Phaser 객체도 truthy 다).
  this.upPop = null;
  this.picked = 'bayonet';
  // ── 좌우 대칭 배치는 **없앴다** (2026-07-30, 사용자 지시) ──────────────────
  // 이력: 처음엔 "진형은 대개 대칭이라 탭이 절반으로 준다"는 편의 기능이었다.
  //   그런데 켜 두면 한 번 탭에 2기가 놓이는 것을 아무도 기능으로 읽지 않고
  //   "2배로 복사되는 버그"로 신고했다(2026-07-28). 그래서 기본을 끄고 토글을 상단에
  //   올려 상태를 보이게 했는데, 그래도 쓰이지 않았다 → 이번에 통째로 제거한다.
  //   **토글 하나를 남겨 두는 비용**이 이 기능의 값어치보다 컸다:
  //   상단 바 한 칸, ☰ 한 칸, 안내 문구 한 줄, 그리고 "왜 2기가 놓이나"라는 오해.
  // `GAME.mirrorY` 는 지우지 않는다 — 그건 대칭 배치가 아니라
  //   **저장할 때 위아래를 뒤집는** 별개의 규칙이다(전혀 다른 일이다).
  this.tier = GAME.CONFIG.DEFAULT_TIER;
  // 수성의 탑에서 들어오면 그 층의 고정 예산을 쓰고, 승패가 층에 반영된다.
  this.defendTower = (data && data.defendTower) || 0;
  // ⚠ **모드 플래그는 그것을 읽는 코드보다 먼저 정해야 한다.**
  //   `this.arena` 를 아래 '내 배치 불러오기' 블록 **뒤에서** 대입하고 있었다.
  //   Phaser 씬은 하나뿐이라 `init` 이 다시 돌 때 지난 판의 값이 남아 있어서,
  //   처음 들어갈 때는 undefined(→ 안 불러옴)이고 두 번째부터는 **지난 판의 모드**로
  //   판단했다. 실제 증상: 저장해 둔 5기가 있는데 판이 비어 있고(0기) 예산만
  //   등급 구매분이 빠진 165 로 떴다(사용자 신고 화면).
  this.arena = !!(data && data.arena);
  // 대전에서 '기지 만들기'로 들어왔는가 — 저장 시 그 배치도를 내 기지로 삼는다
  this.pickBase = !!(data && data.pickBase);
  //  ── '그대로 재도전' 착지점 (2026-08-07) ──────────────────────────────────
  //  결과 화면에서 배치를 안 고치고 바로 다시 붙는 길. 통곡의 탑의 `instantRetry`
  //  (js/scenes/result.js)와 같은 문법이다 — 허브를 한 번 더 거치지 않는다.
  //  ⚠ 씬 인스턴스는 재사용되므로 **매번 여기서 되돌린다.** 안 그러면 한 번 켠 뒤
  //    배치 화면에 영영 못 머문다(이 저장소에서 세 번 겪은 계열의 사고다).
  this.instantStart = !!(data && data.instantStart);
  //  해금 판정기는 create 가 매번 다시 만든다 — 씬을 재사용할 때 지난 판의
  //  모드(수성의 탑 ↔ 대전)가 남아 있으면 안 되므로 여기서 비운다.
  this._lockOf = null;
  //  ⚠⚠ **일회성 플래그를 씬 인자에서 지운다.** Phaser 는 `scene.start(key)` 를 인자
  //    없이 부르면 이전 `settings.data` 를 그대로 두고, `js/pwa.js` 의 `GAME.Nav` 는
  //    뒤로가기에서 **진입 당시 인자를 그대로 다시 넘긴다.** 안 지우면 설치본에서:
  //      진다 → '그대로 재도전' → 전투 → 안드로이드 뒤로가기 → [나가기]
  //      → Nav 가 `{instantStart:true}` 로 Build 를 되살림 → **같은 전투가 재시작된다**
  //    (포기했는데 다시 싸우게 된다. 뒤로가기로는 배치 화면에 영영 못 간다.)
  //    `js/scenes/tower.js:92` · `js/scenes/versus.js:35` 가 같은 이유로 같은 일을 한다.
  //  ⚠ 통째로 비우면 Nav 가 `defendTower` 를 잃어 뒤로가기가 대전 배치로 간다 —
  //    **오래 가는 인자는 남기고 일회성만 턴다.**
  if (this.scene && this.scene.settings) {
    this.scene.settings.data = { defendTower: this.defendTower,
                                 arena: this.arena, pickBase: this.pickBase };
  }
  // ── 지난 층의 배치를 그대로 불러온다 (2026-07-29, 사용자 지시) ──────────────
  // 수성의 탑은 같은 진형으로 층을 이어 오르는 모드다. 매 층 빈 판에서 다시 짜게 하면
  // 층수가 오를수록 '같은 배치를 다시 그리는 노동'만 늘어난다.
  // 불러온 뒤 고칠 수 있으므로 선택지를 뺏지도 않는다.
  // ⚠ 2026-08-07 — 진 판에서도 `placed` 가 남는다(영구 성장). 그래서 재도전은 **지난
  //   배치를 그대로 들고** 시작하고, 사용자가 고칠 자리를 여기서 연다. 이것이 이번
  //   변경의 핵심 동선이다 — 매 패배의 질문이 "무엇을 고칠까"가 된다.
  if (this.arena) {
    // 대전 배치도는 id 당 하나다 → 들어오면 **내 것을 불러와 고치는** 것이 기본이다.
    var myBase = GAME.Arena.baseFormation();
    if (myBase && myBase.units) {
      for (var ai = 0; ai < myBase.units.length; ai++) {
        var au = myBase.units[ai];
        if (!GAME.UNITS[au.type]) continue;
        var w = GAME.Formations.toWorld(au);
        // 저장본은 전투 기준(위쪽)이라 배치 화면 좌표로 되돌린다 — 저장할 때 뒤집는 것의 역이다.
        this.placed.push({ type: au.type, x: w.x, y: GAME.mirrorY(w.y) });
      }
    }
  }
  if (this.defendTower) {
    var prev = (GAME.DefendTower.get() || {}).placed;
    if (prev && prev.length) {
      for (var pi = 0; pi < prev.length; pi++) {
        var pp = prev[pi];
        if (pp && GAME.UNITS[pp.type]) this.placed.push({ type: pp.type, x: pp.x, y: pp.y });
      }
    }
  }
  // (this.arena / this.pickBase 는 위에서 정한다 — 불러오기 블록이 그 값을 읽는다)
  // 씬을 다시 들어오면 이전 타이머는 이미 죽어 있다 — 참조를 반드시 비운다
  this._holdTimer = null;
  this._warnTimer = null;
  this._hintTimer = null;
  this.delBadge = null;
  // ☰ 시트(폰 가로) — 캐시한 표시객체는 재진입 때 이미 파괴돼 있다. 반드시 비운다.
  this.sheet = null;
  this._eatTap = false;
  this.powerText = null;
  this.infoText = null;
  this.phMirrorBtn = null;
  this.tierButtons = [];
  // 보드 띠(top/bottom/cap) — create 에서 프로필별로 정한다. 세로는 null(예전 투영 유지).
  this.board = null;
  // 호버 툴팁(PC 전용). 캐시한 표시객체는 재진입 때 이미 파괴돼 있다 → 반드시 비운다.
  this.tip = null;
  this._tipDef = null;
  // 들어온 순간의 배치 지문 — 나갈 때 이것과 다르면 '저장 안 함' 경고를 한 번 낸다.
  // ⚠ 불러오기 블록보다 **뒤에서** 재야 한다(위에서 placed 를 채운 뒤의 상태가 기준이다).
  //  ⚠ 대전뿐 아니라 **수성의 탑 배치**에서도 잡는다. 예전에는 여기가 대전 전용이라
  //    탑 경로에서 나갈 때 비교할 기준이 없었고, 그래서 짜 놓은 배치가 경고 한 줄
  //    없이 사라졌다(QA 실측: 10기 → 3기). `_arenaSig` 은 배치 유닛을 해싱하므로
  //    모드와 무관하게 그대로 쓸 수 있다.
  this._entrySig = (this.arena || this.defendTower) ? this._arenaSig() : undefined;
  this._exitArmed = false;
};

// ── 이 씬 전용 투영 ─────────────────────────────────────────────────────────
//  배치 구역(zone)의 **바닥을 보드 바닥에**, 나머지 높이는 위쪽으로 펼친다.
//  남는 위쪽은 중립 지대로 보이고, 적진(아레나 위 30%)은 화면 밖으로 나간다.
//  월드 좌표는 손대지 않는다 — 순수 렌더 계층 변경이라 밸런스가 움직이지 않는다.
//  프로필별 보드 띠. **기본 투영 상태에서 호출해야 한다**(create 가 setMode('default') 직후 부른다).
//   · 폰 가로 : 손으로 잡은 띠(상단 바 아래 ~ 팔레트 위)
//   · PC      : 바닥을 **기본 투영의 아레나 바닥**에 맞춘다. 그러면 `L.hud()` 가 예전과
//               똑같은 top 을 돌려주므로 팔레트·도구·액션 줄을 한 픽셀도 안 옮겨도 된다.
//               (아래 식은 고정점이다 — 투영을 바꿔도 screenRect().bottom 이 다시 bottom 이 된다:
//                zone 바닥 == 아레나 바닥이라 SCREEN_TOP + A.h×TILT = bottom.)
//   · 세로    : null — 은퇴 예정 프로필이라 예전 투영·미리보기를 그대로 둔다.
GAME.BuildScene.prototype._boardBand = function () {
  var K = GAME.BuildScene.PHONE;
  if (GAME.CONFIG.PHONE) {
    return { top: K.BOARD_TOP, bottom: K.BOARD_BOTTOM, cap: GAME.BuildScene.TILT_CAP };
  }
  if (GAME.CONFIG.PORTRAIT) return null;
  return {
    top: GAME.BuildScene.PC.BOARD_TOP,
    bottom: Math.round(GAME.Iso.screenRect().bottom),
    cap: GAME.BuildScene.PC.TILT_CAP
  };
};

GAME.BuildScene.prototype._applyBoardProjection = function () {
  var A = GAME.CONFIG.ARENA;
  var B = this.board;
  var Z = this.zone;
  var tilt = Math.min(B.cap, (B.bottom - B.top) / Z.h);
  GAME.Iso.TILT = tilt;
  GAME.Iso.SCREEN_TOP = B.bottom - (Z.y + Z.h - A.y) * tilt;
};

//  배치 자원의 이름. 수성의 탑에서는 **인구**다(골드와 헷갈리지 않게).
//  ⚠ 대전은 예전 그대로 '예산' 이다 — 거기엔 골드가 같이 안 나와 혼동이 없다.
//  ── 인구 환산 (2026-08-03) ──────────────────────────────────────────────────
//  사용자 지시: "인구수 1로 하고 그 비율에 맞게 비용책정해"
//  기존 비용(전사 10 · 궁수 15 · … · 쇠뇌 45)을 10 으로 나눠 **1~5 인구**로 만든다.
//    전사 1 · 궁수 2 · 투석꾼/방패병/약초꾼 3 · 족장/덫/늪지기/투창병 4 · 쇠뇌 5
//  ⚠ `def.cost` 원본은 **안 건드린다.** 그 값은 대전·통곡의 탑이 같이 쓰므로
//    나누는 순간 두 모드의 진형 구성이 통째로 바뀐다. 여기서 환산만 한다.
//  ⚠ 반올림 때문에 비율이 조금 어긋난다(궁수 1.5 → 2). 그 대가로 "전사 1명"이라는
//    읽기 쉬운 척도를 얻는다 — 사용자가 요구한 것이 그 척도다.
//  ⚠ 예산도 **같은 비율로** 나눠야 살 수 있는 양이 유지된다. 한쪽만 나누면
//    인구가 10배 부족해져 배치를 아예 못 하게 된다.
GAME.BuildScene.POP_DIV = 10;
//  ⚠ **반올림하지 않는다** (2026-08-03 사용자 지시: "소수점 들어가도되니까 기존
//    밸런스에 따라가줘"). 정수로 맞추면 궁수(1.5 → 2)처럼 값이 올라가 배치 총량이
//    달라진다 — 실제로 궁수 도배가 10기에서 8기로 줄었다. 소수를 허용하면
//    원가 비율이 **그대로** 보존되어 기존 밸런스와 완전히 같아진다.
//  ⚠ 이제 **표에서 읽는다**(`js/units.js` 의 `pop`). 계산으로 뽑던 시절에는
//    원가가 10 의 배수가 아니라 소수가 나왔고(궁수 1.5), 사용자가 "구분이 어렵다"고
//    신고했다. 그래서 유닛 표를 정수 인구에 맞춰 **전면 재조정**하고, 화면은
//    계산 대신 읽기만 한다 — 두 곳이 갈라질 자리가 없어진다.
GAME.BuildScene.popOf = function (def) {
  if (!def) return 0;
  if (typeof def.pop === 'number') return def.pop;
  return Math.max(1, Math.round((def.cost || 0) / GAME.BuildScene.POP_DIV));
};

//  화면 표기 — 정수는 그대로, 소수는 한 자리까지(1 · 1.5 · 4.5).
//  ⚠ toFixed(1) 을 그냥 쓰면 전사가 "1.0명" 이 되어 지저분하다.
GAME.BuildScene.popText = function (v) { return String(Math.round(v)); };

//  이 화면에서 유닛 하나가 먹는 값(모드에 따라 인구 또는 원본 비용).
GAME.BuildScene.prototype._costOf = function (def) {
  return this.defendTower ? GAME.BuildScene.popOf(def) : (def.cost || 0);
};
//  이 화면의 총량.
GAME.BuildScene.prototype._budgetOf = function () {
  //  예산도 같은 척도로. 유닛이 전부 10 의 배수가 되었으므로 나누어떨어진다.
  return this.defendTower
    ? Math.round(this.budget / GAME.BuildScene.POP_DIV)
    : this.budget;
};

//  이 화면 기준으로 지금까지 쓴 양.
GAME.BuildScene.prototype._spentOf = function () {
  if (!this.defendTower) return this.spent();
  var t = 0;
  for (var i = 0; i < this.placed.length; i++) {
    var d = GAME.UNITS[this.placed[i].type];
    if (d) t += GAME.BuildScene.popOf(d);
  }
  return t;
};

GAME.BuildScene.prototype._resName = function () {
  return this.defendTower ? '인구' : '예산';
};
//  유닛 한 기가 먹는 값의 단위. 예전에는 '원' 이라 전투 보상 골드와 같은 말이었다.
GAME.BuildScene.prototype._resUnit = function () {
  return this.defendTower ? '명' : '원';
};

GAME.BuildScene.prototype.create = function () {
  // 배치 화면은 두 갈래다 — 수성의 탑이면 출정 행진, 대전이면 대기실.
  if (GAME.Music) GAME.Music.play(this.defendTower ? 'defend' : 'versus');
  var C = GAME.CONFIG.COLORS;
  var UI = GAME.UI;
  var self = this;
  var P = GAME.CONFIG.PORTRAIT;
  // 폰 가로(820×390)는 아레나 아래에 78px 밖에 안 남는다(실측: 기본 투영 아레나 바닥 312).
  // 폰 가로와 PC 는 투영을 다시 잡아 배치 구역을 화면의 주인공으로 만든다(_boardBand).
  var PH = GAME.CONFIG.PHONE;
  var SM = P || PH;                       // 칩을 세로형(아이콘 위·이름 아래)으로 그리는가
  var W = GAME.CONFIG.WIDTH;
  var H = GAME.CONFIG.HEIGHT;
  var L = GAME.Layout;
  var PHL = GAME.BuildScene.PHONE;

  this.cameras.main.setBackgroundColor(C.bg);
  // 배치 화면은 팔레트·버튼이 아레나 **아래**에 있다 → 전투용 전체화면 투영이 새어 들어오면
  // 아레나가 화면을 다 먹어 팔레트가 잘린다. 진입할 때마다 기본 투영으로 확정한다.
  GAME.Iso.setMode('default');
  // 수성의 탑은 층 고정 예산, 일반 방어전은 티어 예산.
  // 수성의 탑은 골드로 산 '증원 예산'이 얹힌다 → placeBudgetFor 를 써야 배치 화면에 반영된다.
  // 대전은 **300 고정**이고, 그 안에서 유닛 등급(수성의 탑에서 가져온 것)까지 산다.
  // 등급에 쓴 만큼 배치에 쓸 돈이 줄어드는 것이 이 모드의 선택이다 —
  // 적은 수를 세게 굴릴 것인가, 많은 수를 그대로 세울 것인가.
  if (this.arena) GAME.ArenaBuild.setPlacedCost(0);   // 판을 그리기 전이라 0 에서 시작한다

  //  ── 수성의 탑 첫 배치 코치 (2026-08-21) — 행동하면 넘어간다(읽는 안내는 안 남는다) ──
  //  렌더 전용: 상단 한 줄 + 500ms 폴링으로 배치 수만 본다. 시뮬에 닿지 않는다.
  if (this.defendTower && GAME.Onboard &&
      GAME.Onboard.seen().indexOf('build-coach-v1') < 0) {
    var _cSelf = this;
    //  y 0.27H — 0.16 은 상단 바(0..60), 0.20 은 유닛 정보줄('전사 · 인구 …', y~70)과
    //  스쳤다(감사 실측 각 1회). 상단 글줄 전부의 아래로 내린다.
    var _coachTxt = this.add.text(GAME.CONFIG.WIDTH / 2, GAME.CONFIG.HEIGHT * 0.27,
      '① 아래 유닛을 골라 전장에 놓아 보세요', {
        fontFamily: GAME.CONFIG.FONT, fontSize: (GAME.CONFIG.SMALL ? 15 : 18) + 'px',
        color: '#fff6df', backgroundColor: 'rgba(30,24,12,0.72)', padding: { x: 12, y: 7 }
      }).setOrigin(0.5, 0).setDepth(2500).setScrollFactor(0);
    var _coachStep = 0;
    var _coachEv = this.time.addEvent({ delay: 500, loop: true, callback: function () {
      if (!_coachTxt.scene) { _coachEv.remove(); return; }
      if (_coachStep === 0 && _cSelf.placed && _cSelf.placed.length > 0) {
        _coachStep = 1;
        _coachTxt.setText('② 좋아요! 다 놓았으면 [방어전 시작]');
      } else if (_coachStep === 1 && _cSelf.placed && _cSelf.placed.length >= 3) {
        _coachStep = 2;
        _coachTxt.setText('막으면 다음 회차 — 져도 성장은 남습니다');
        GAME.Onboard.markSeen('build-coach-v1');
        _cSelf.time.delayedCall(4000, function () {
          if (_coachTxt.scene) _coachTxt.destroy();
          _coachEv.remove();
        });
      }
    } });
    this.events.once('shutdown', function () {
      if (_coachEv) _coachEv.remove();
      if (GAME.Onboard.seen().indexOf('build-coach-v1') < 0)
        GAME.Onboard.markSeen('build-coach-v1');   // 나가면 그만 잔소리한다
    });
  }
  this.budget = this.arena
    ? Math.max(0, GAME.Arena.BUDGET - GAME.ArenaBuild.unitLvSpent(GAME.ArenaBuild.get()))
    : (this.defendTower
        ? ((GAME.DefendTower.placeBudgetFor || GAME.DefendTower.budgetFor).call(
            GAME.DefendTower, this.defendTower))
        : GAME.CONFIG.BUDGETS[this.tier]);
  this.zone = GAME.CONFIG.ZONE_CONTROLLER;
  this.myColor = C.strategist;
  // ★ 반드시 setMode('default') 뒤에 — PC 보드 바닥을 기본 투영에서 읽어 온다.
  this.board = this._boardBand();
  if (this.board) this._applyBoardProjection();

  var hud = L.hud();

  this.g = this.add.graphics();

  this.dtHeroName = '';
  if (this.defendTower) {
    var dtHeroKey = GAME.DefendTower.heroKeyFor(this.defendTower, GAME.DefendTower.skillFor(this.defendTower));
    this.dtHeroName = GAME.HEROES[dtHeroKey].name;
  }

  // ── 아레나 위 한 줄 안내 ────────────────────────────────────────────────
  //  예전에는 이 안내가 전장 **안**에 있어서 유닛 그림 위에 얹혔다. 밖으로 뺀다.
  //  폰 가로에서는 상단 바가 이미 그 자리를 쓰므로 두지 않는다(안내는 ☰ 안으로).
  if (!PH) {
    // PC 는 이제 적진이 화면 밖이다 → '위 = 상대가 보게 될 모습' 은 거짓말이 된다.
    // 대신 저장 시 뒤집힌다는 사실과, 새로 생긴 호버 정보를 알려준다.
    var topLabel = P ? '위 = 상대가 보는 모습  ·  아래 파란 칸 = 내 진형'
                     : '파란 칸이 내 진형 배치 구역  ·  유닛 위에 마우스를 올리면 상세 정보  ·  저장하면 상대에게는 위아래가 뒤집혀 보입니다';
    if (this.defendTower) topLabel = this.defendTower + '층 방어 — 오는 영웅: ' + this.dtHeroName;
    UI.text(this, hud.pad, 16, topLabel, { size: 'caption', color: C.accentAlt });
  }

  // ── 행 배분 ────────────────────────────────────────────────────────────
  //  손으로 좌표를 박지 않는다. 세로는 HUD 352px 안에 342px 를 쓴다(여유 10).
  //  ⚠ 폰 가로는 예전에 칩 하나가 **팔레트 띠(PAL_H=74) 전체**를 먹었다 —
  //    한 줄 배치였기 때문이다. 두 줄로 나눈 지금 그대로 두면 둘째 줄이 화면
  //    밖으로 나간다(잘림 감사가 14건으로 잡았다). 띠 안에서 반씩 나눠 쓴다.
  var chipH = PH ? Math.floor((PHL.PAL_H - PHL.PAL_GAP) / 2) : 62;
  var rows = PH ? {
    budget: { y: PHL.METER_Y, h: PHL.METER_H, cy: PHL.METER_Y + PHL.METER_H / 2,
              bottom: PHL.METER_Y + PHL.METER_H },
    //  ⚠ 폰 가로는 예전에 **한 줄에 전부** 넣어서 pal0/pal1 이 같은 y 였다.
    //    14종을 한 줄에 밀면 칸이 50px 밑으로 떨어져 글자가 잘린다 — 두 줄로 나눈다.
    pal0:   { y: PHL.PAL_Y, h: chipH, cy: PHL.PAL_Y + chipH / 2, bottom: PHL.PAL_Y + chipH },
    pal1:   { y: PHL.PAL_Y + chipH + PHL.PAL_GAP, h: chipH,
              cy: PHL.PAL_Y + chipH + PHL.PAL_GAP + chipH / 2,
              bottom: PHL.PAL_Y + chipH * 2 + PHL.PAL_GAP }
  } : L.rows(P ? [
    { name: 'budget', h: 26, gap: 4 },
    { name: 'power',  h: 19, gap: 3 },
    { name: 'status', h: 20, gap: 5 },
    { name: 'pal0',   h: chipH, gap: 5 },
    { name: 'pal1',   h: chipH, gap: 7 },
    { name: 'tools',  h: 38, gap: 5 },
    { name: 'tier',   h: 36, gap: 5 },
    { name: 'act',    h: 44, gap: 0 }
  ] : [
    { name: 'budget', h: 30, gap: 6 },
    { name: 'power',  h: 22, gap: 6 },
    { name: 'status', h: 22, gap: 10 },
    { name: 'pal0',   h: chipH, gap: 8 },
    { name: 'pal1',   h: chipH, gap: 12 },
    // 가로는 폭이 넓다 — 도구(왼쪽)와 예산 티어(오른쪽)를 한 줄에 나눠 담는다
    { name: 'tools',  h: 44, gap: 12 },
    { name: 'act',    h: 48, gap: 0 }
  ]);
  this.rowsRef = rows;
  if (!PH) rows.tier = rows.tier || rows.tools;

  // 폰 가로: 한 띠를 n 칸으로 정확히 나눈다(L.cols 는 HUD 폭을 기준으로 잡아 안 맞는다).
  function phSlots(n, left, total, gap) {
    var w = Math.floor((total - gap * (n - 1)) / n);
    var out = [];
    for (var i = 0; i < n; i++) { var x = left + i * (w + gap); out.push({ x: x, w: w, cx: x + w / 2 }); }
    return out;
  }

  // ── 예산 게이지 ─────────────────────────────────────────────────────────
  //  "예산이 얼마 남았는지 감이 안 온다"는 지적. 숫자만으로는 남은 양이 안 읽힌다.
  var pad = PH ? PHL.PAD : hud.pad;
  var meterW = PH ? PHL.METER_W : Math.min(hud.w - hud.pad * 2, P ? 396 : 620);
  this.budgetMeter = UI.meter(this, PH ? PHL.METER_X : pad, rows.budget.y, meterW, rows.budget.h, {
    frac: 0, color: C.strategist, track: UI.COL.meterTrack,
    label: { size: PH ? 'micro' : (SM ? 'caption' : 'body'), color: C.text, align: 'center' }
  });

  // ── 진형 전력 요약 ──────────────────────────────────────────────────────
  //  "지금 진형이 얼마나 센지 감이 안 온다" → 체력 총합·초당 피해·구성 세 가지.
  //  전투 로직은 손대지 않는다. units.js 의 값을 읽어 **보여주기만** 한다.
  //  폰 가로에서는 이 두 줄이 자리를 크게 먹어 상단 바에서 빼고 ☰ 시트로 옮겼다.
  if (!PH) {
    this.powerText = UI.text(this, pad, rows.power.y, '', {
      size: SM ? 'micro' : 'caption', color: C.textMid
    });
  }

  // ── 상태 한 줄 (안내 ↔ 유닛 설명 ↔ 경고 겸용) ───────────────────────────
  //  예전에는 설명과 경고가 **다른 두 객체로 같은 줄에** 찍혀 겹쳤다. 하나로 합쳤다.
  //  폰 가로에서는 보드 바닥에 떠 있는 토스트다 — 첫 진입 안내와 경고에만 나타난다.
  if (PH) {
    this.statusText = UI.text(this, W / 2, PHL.BOARD_BOTTOM - 5, '', {
      size: 'micro', color: C.textDim, origin: 0.5, originY: 1, outline: true
    });
    this.statusText.setVisible(false);
    this.lineMaxW = W - 40;
  } else {
    this.statusText = UI.text(this, pad, rows.status.y, '', {
      size: SM ? 'micro' : 'caption', color: C.textDim
    });
    // 줄바꿈을 허용하면 두 번째 줄이 팔레트를 덮는다(예전 화면이 정확히 그 상태였다).
    // 대신 **한 줄에 맞게 잘라 넣는다** — 웹폰트가 안 와서 폭 넓은 폴백으로 그려져도 안전하다.
    this.lineMaxW = hud.w - pad * 2;
  }

  // ── 상단 바: 선택 유닛 / 수성의 탑 정보 ─────────────────────────────────
  if (PH) {
    this.infoMaxW = (PHL.START_CX - PHL.START_W / 2) - 8 - PHL.INFO_X;
    this.infoText = UI.text(this, PHL.INFO_X, PHL.BTN_CY, '', {
      size: 'micro', color: C.accentAlt, origin: 0, originY: 0.5
    });
  }

  // ── 유닛 팔레트 ─────────────────────────────────────────────────────────
  //  폰 가로는 **한 줄 10칸**(TFT 상점 줄). 오른쪽 VER_W 는 DOM 버전 배지 자리라 비운다.
  // ── 해금 (2026-08-07 · 2단계) ─────────────────────────────────────────────
  //  ⚠ 잠긴 것을 **숨기지 않는다.** 숨기면 "이게 전부"로 읽혀 오를 이유가 안 생긴다.
  //    회색으로 두고 몇 회차에 열리는지 적어 두면 그 자체가 목표가 된다
  //    (통곡의 탑 상점이 못 사는 아이템을 지우지 않는 것과 같은 이유).
  //  ⚠ 수성의 탑에서만 건다 — 대전 배치는 예전 그대로 전부 열려 있다.
  var lockOn = !!this.defendTower && !!GAME.DefendTower.isUnlocked;
  this._lockOf = function (key) {
    if (!lockOn) return 0;
    return GAME.DefendTower.isUnlocked(key) ? 0 : GAME.DefendTower.unlockAt(key);
  };

  //  ⚠ 예전엔 `PH ? 전체 : 5` 였다. 유닛이 10종일 때만 맞는 값이라, 14종으로 늘리자
  //    3행째가 생기고 아래 `r0 === 0 ? pal0 : pal1` 이 **2행과 3행을 같은 자리에 겹쳐**
  //    그렸다(겹침 감사가 16건으로 잡았다). 행 수는 두 줄로 고정이니 개수에서 역산한다.
  var perRow = Math.ceil(GAME.UNIT_ORDER.length / 2);
  this.chips = [];
  var cols = PH ? phSlots(perRow, PHL.PAD, W - PHL.PAD - PHL.VER_W, PHL.PAL_GAP)
                : L.cols(perRow, { gap: (P ? 5 : 8), pad: pad });
  var chipRects = [];
  for (var i = 0; i < GAME.UNIT_ORDER.length; i++) {
    var key = GAME.UNIT_ORDER[i];
    var r0 = Math.floor(i / perRow), c0 = cols[i % perRow];
    var rowY = (r0 === 0 ? rows.pal0 : rows.pal1);
    var rect = this.add.rectangle(c0.cx, rowY.cy, c0.w, chipH, UI.COL.surfaceAlt)
      .setStrokeStyle(1, UI.COL.border);
    rect.setInteractive({ useHandCursor: true });
    //  ⚠ 잠긴 칩도 **누를 수 있게 둔다.** 눌러도 아무 일이 없으면 "고장"으로 읽힌다 —
    //    대신 몇 회차에 열리는지 말해 준다(`_pick` 이 판정한다).
    (function (k) { rect.on('pointerdown', function () { self._pick(k); }); })(key);
    chipRects.push({ key: key, rect: rect, x: c0.x, w: c0.w, cx: c0.cx, y: rowY.y, cy: rowY.cy, h: chipH,
                     lock: this._lockOf(key) });
  }
  // ★ 아이콘 Graphics 는 칩 사각형 **다음에** 만든다. 이 한 줄이 예전 버그의 수정이다.
  this.palG = this.add.graphics();
  // 모서리 숫자 뒤에 깔 알약 — 아이콘이 커서 모서리까지 뻗어도 숫자가 안 묻히게 한다.
  // 순서가 전부다: 칩(사각형) → 아이콘 → 알약 → 글자.
  this.chipTagG = this.add.graphics();

  // 칩 위 글자 — Graphics 다음에 만들어야 아이콘에 안 묻힌다
  for (var j = 0; j < chipRects.length; j++) {
    var ch = chipRects[j];
    var def = GAME.UNITS[ch.key];
    if (SM) {
      // 세로(칸 75×62) · 폰 가로(칸 72×74): 아이콘이 칸을 거의 다 쓰고 이름은 바닥에, 숫자는 모서리에.
      // **그림이 1순위 식별자**다 — 좁은 칸에서 이름 4~5글자보다 실루엣이 빨리 읽힌다.
      // drawUnitFlat 의 y 는 '발밑'이라 이름 윗줄에 발이 닿게 잡는다.
      ch.iconX = ch.cx;
      ch.iconY = ch.y + chipH - 20;
      ch.iconScale = PH ? 1.0 : 0.86;
      ch.tile = { x: ch.x + 3, y: ch.y + 2, w: ch.w - 6, h: chipH - 22 };
      // 이름표 띠 — 유닛이 이름판 뒤에 서 있는 카드 모양. 좁은 칸에서 아이콘을
      // 크게 두면서 이름도 읽히게 하는 유일한 방법이다(둘 다 크게는 물리적으로 불가).
      //  ⚠ 칩이 두 줄이 되며 높이가 74 → 35 로 반이 됐다. 예전 오프셋(-21/-20)은
      //    74px 칩 기준이라 이름 띠가 위쪽 값/자물쇠와 5px 겹쳤다(감사가 잡았다).
      //    이름을 아래로 더 붙여 값과 3px 벌린다.
      ch.bar = { x: ch.x + 3, y: ch.y + chipH - 18, w: ch.w - 6, h: 17 };
      ch.nameTxt = UI.text(this, ch.cx, ch.y + chipH - 17, def.name,
        { size: 'micro', color: C.text, origin: 0.5, originY: 0 });
      ch.costTxt = UI.text(this, ch.x + ch.w - 5, ch.y + 2, GAME.BuildScene.popText(this._costOf(def)),
        { size: 'micro', color: C.accent, origin: 1, originY: 0 });
      ch.countTxt = UI.text(this, ch.x + 5, ch.y + 2, '', {
        size: 'micro', color: C.crit, origin: 0, originY: 0
      });
    } else {
      // 가로(칸 252×62): 아이콘 왼쪽, 이름·가격 오른쪽 — 폭이 넉넉해 겹칠 일이 없다
      ch.iconX = ch.x + 34;
      ch.iconY = ch.cy + 20;
      ch.iconScale = 1.05;
      ch.tile = { x: ch.x + 6, y: ch.cy - 28, w: 58, h: 56 };
      ch.nameTxt = UI.text(this, ch.x + 68, ch.cy - 13, def.name,
        { size: 'subhead', color: C.text });
      ch.costTxt = UI.text(this, ch.x + 68, ch.cy + 9, GAME.BuildScene.popText(this._costOf(def)) + ' ' + this._resUnit(),
        { size: 'caption', color: C.accent });
      ch.countTxt = UI.text(this, ch.x + ch.w - 8, ch.cy, '', {
        size: 'caption', color: C.crit, origin: 1, originY: 0.5
      });
    }
    ch.countTxt.setVisible(false);
    this.chips.push(ch);
  }

  if (PH) {
    // ── 상단 바 버튼 두 개가 전부다 ───────────────────────────────────────
    //  주 행동(방어전 시작)은 크게, 나머지 도구는 ☰ 시트로 접었다.
    // 대전 전략가는 **싸우러 온 게 아니라 전장을 세우러 온 것**이다(2026-07-30 지시).
    // 방어전은 여기서 시작하지 않는다 — 내 전장은 남이 도전할 때 싸운다.
    // ── 대전에는 ☰ 가 없다 (2026-07-30, 사용자 지시) ─────────────────────
    // "삼선을 없애고 그냥 거기에 이전 버튼 하나만 넣으면 돼."
    // 대전 배치에서 할 일은 '세우고 나가기' 둘뿐이라 접어 둘 도구가 없다.
    // 유닛 삭제는 유닛을 탭하면 뜨는 ✕ 배지가, 등급은 같은 자리의 레벨업 팝업이 한다.
    // 그래서 ☰ 자리를 출구가 물려받는다 — ☰ 는 56px 정사각이라 '← 대전' 이 안 들어가므로
    // 설계폭 820 안에서 폭을 나눠 준다(주 버튼 476..704 / 출구 714..810, 여백 10).
    var sCx = PHL.START_CX, sW = PHL.START_W, mCx = PHL.MENU_CX, mW = PHL.MENU_W;
    if (this.arena) { sW = 228; sCx = 590; mW = 96; mCx = 762; }
    this.startBtn = UI.button(this, sCx, PHL.BTN_CY, sW, PHL.BTN_H,
      this.arena ? '내 배치 저장' : '방어전 시작',
      function () { if (self.arena) self._saveArena(); else self._defend(); },
      { fill: UI.COL.panelTeal, line: C.controller, hover: UI.COL.panelTealHi,
        color: C.accent, fontSize: 'buttonSm', hitPad: 4 });
    // ── 고른 유닛 설명 줄 + 배치 초기화 (2026-08-08, 사용자 지시) ─────────
    //  ⚠ 유닛이 20종이 되면서 **이름만으로는 무엇인지 알 수 없게** 됐다.
    //    칩을 누르면 그 자리에서 능력치 한 줄 + 특징 한 줄을 보여 준다 —
    //    설명을 보러 다른 화면으로 갔다 오게 하면 배치하던 손이 끊긴다.
    var infoW = W - PHL.PAD * 2 - PHL.RESET_W - 8;
    this.infoBg = this.add.rectangle(PHL.PAD + infoW / 2, PHL.INFO_Y + PHL.INFO_H / 2,
      infoW, PHL.INFO_H, UI.COL.surfaceAlt).setStrokeStyle(1, UI.COL.border);
    this.infoLine1 = UI.text(this, PHL.PAD + 10, PHL.INFO_Y + 6, '', {
      size: 'caption', color: C.text, originY: 0
    });
    this.infoLine2 = UI.text(this, PHL.PAD + 10, PHL.INFO_Y + 26, '', {
      size: 'micro', color: UI.COL.textDim, originY: 0
    });
    //  ⚠ **확인을 받는다.** 스무 기를 세운 판을 한 번의 오탭으로 날리면
    //    되돌리기(한 묶음씩)로는 복구가 사실상 불가능하다.
    UI.button(this, W - PHL.PAD - PHL.RESET_W / 2, PHL.INFO_Y + PHL.INFO_H / 2,
      PHL.RESET_W, PHL.INFO_H, '배치 초기화', function () {
        if (!self.placed.length) { if (self._warn) self._warn('아직 놓은 유닛이 없습니다.'); return; }
        //  ⚠ `Modal.confirm` 은 이 저장소에 없다 — 확인은 **항목 두 개짜리
        //    `Modal.open`** 으로 받는다(수성의 탑 '1회차부터 다시'와 같은 모양).
        //    없는 API 를 부르면 조용히 아무 일도 안 일어난다.
        if (!GAME.Modal) {          // 모달이 없으면 조용히 지우지 않는다
          if (self._warn) self._warn('지금은 초기화할 수 없습니다.');
          return;
        }
        GAME.Modal.open(self, {
          title: '배치를 전부 지울까요?',
          items: [
            { key: 'no', name: '아니요 — 그대로 둡니다',
              note: '놓은 유닛 ' + self.placed.length + '기 유지' },
            { key: 'yes', name: '네, 전부 지웁니다',
              note: '되돌리기로는 복구할 수 없습니다' }
          ],
          onPick: function (it) {
            if (!it || it.key !== 'yes') return;
            self.placed = []; self.history = []; self.selected = null;
            if (GAME.Sound && GAME.Sound.play) GAME.Sound.play('click');
            self._status(); self.redraw();
          }
        });
      }, { fontSize: 'buttonSm', color: C.crit });

    this.menuBtn = UI.button(this, mCx, PHL.BTN_CY, mW, PHL.BTN_H,
      this.arena ? '← 대전' : '☰',
      function () { if (self.arena) self._arenaExit(); else self._toggleSheet(); },
      { fontSize: this.arena ? 'buttonSm' : 'button', hitPad: 4 });
  } else {
    // ── 도구: 되돌리기 · 대칭 · 전부 지우기 ───────────────────────────────
    var toolW = P ? hud.w : Math.round(hud.w * 0.52);
    // 대칭 칸이 사라져 2칸이 된다(되돌리기 · 전부 지우기).
    var tcols = L.cols(2, { gap: 8, width: toolW, left: hud.pad });
    UI.button(this, tcols[0].cx, rows.tools.cy, tcols[0].w, rows.tools.h, '되돌리기',
      function () { self._undo(); }, { fontSize: 'buttonSm' });
    UI.button(this, tcols[1].cx, rows.tools.cy, tcols[1].w, rows.tools.h, '전부 지우기', function () {
      self.placed = []; self.history = []; self.selected = null;
      self._status(); self.redraw();
    }, { fontSize: 'buttonSm' });

    // ── 예산 티어 ─────────────────────────────────────────────────────────
    //  수성의 탑은 층 고정 예산이라 티어 선택을 숨기고 층 정보를 보여준다.
    //  ⚠ **대전도 고정 예산이다**(양쪽 300). 그런데 티어 버튼이 그대로 떠 있어서
    //    누르면 budget 을 120/160/220 으로 덮어쓰고 `_trimToBudget()` 이 초과분을
    //    **뒤에서부터 잘라냈다**(유닛이 사라진다). 남은 예산은 등급 구매에 쓴 만큼
    //    빠지는 값이라 티어로 고를 대상이 아니다 → 정보 한 줄로 바꾼다.
    var tierLeft = P ? hud.pad : (toolW + hud.pad);
    var tierW = P ? hud.w : (hud.w - toolW - hud.pad);
    if (this.arena) {
      // ⚠ 이 줄에 **변하는 숫자를 넣지 않는다.** create 에서 한 번 그리고 redraw 가
      //   다시 만들지 않으므로, 등급을 사서 예산이 줄면 그 자리만 옛 값으로 남는다.
      //   지금 남은 예산은 상단 바가 실시간으로 말해 준다 — 여기는 규칙만 적는다.
      UI.text(this, tierLeft, rows.tier.cy,
        '대전  ·  양쪽 예산 ' + GAME.Arena.BUDGET +
        ' 고정  ·  유닛 등급에 쓴 만큼 배치 예산이 줄어듭니다',
        { size: 'caption', color: C.accentAlt, origin: 0, originY: 0.5 });
    } else if (this.defendTower) {
      UI.text(this, tierLeft, rows.tier.cy,
        '수성의 탑 ' + this.defendTower + '회차  ·  인구 ' + GAME.BuildScene.popText(this._budgetOf()) + '명',
        { size: 'caption', color: C.accentAlt, origin: 0, originY: 0.5 });
    } else {
      var tcols2 = L.cols(3, { gap: 8, width: tierW, left: tierLeft });
      var tiers = GAME.CONFIG.BUDGET_TIERS;
      for (var t = 0; t < tiers.length; t++) {
        (function (tier, idx) {
          var cc = tcols2[idx];
          var b = UI.button(self, cc.cx, rows.tier.cy, cc.w, rows.tier.h,
            tier.replace('예산', '') + ' ' + GAME.CONFIG.BUDGETS[tier], function () {
              self.tier = tier;
              self.budget = GAME.CONFIG.BUDGETS[tier];
              self._trimToBudget();
              self.redraw();
            }, { fontSize: 'buttonSm' });
          self.tierButtons.push({ tier: tier, ui: b });
        })(tiers[t], t);
      }
    }

    // ── 액션 ──────────────────────────────────────────────────────────────
    var acols = L.cols(3, { gap: 8 });
    // 대전 전략가는 **전장을 세우러 온 것**이라 '방어전 시작'이 없다(2026-07-30 지시).
    // 두 칸을 하나로 합쳐 '내 배치 저장'만 남긴다 — 여기서 할 일이 그것 하나뿐이다.
    if (this.arena) {
      var sw = acols[0].w + acols[1].w + 8;
      UI.button(this, acols[0].x + sw / 2, rows.act.cy, sw, rows.act.h,
        '내 배치 저장', function () { self._saveArena(); },
        { fill: UI.COL.panelPurple, line: C.strategist, hover: UI.COL.panelPurpleHi,
          color: C.accentAlt, fontSize: 'button' });
    } else {
      UI.button(this, acols[0].cx, rows.act.cy, acols[0].w, rows.act.h, '방어전 시작', function () {
        self._defend();
      }, { fill: UI.COL.panelTeal, line: C.controller, hover: UI.COL.panelTealHi,
           color: C.accent, fontSize: 'button' });
      //  ⚠ **수성의 탑에서는 이 버튼을 안 만든다.** `_save()` 는 대전용 배치도 목록에
      //    저장하는 기능이고 끝나면 메인 메뉴로 나간다 — 탑에서 누르면 탑 진행과
      //    무관한 저장을 한 뒤 메뉴로 튕겨 나간다(QA 실측). 탑 배치는 층을 막아내면
      //    자동으로 남으므로 사용자가 따로 저장할 것이 없다.
      if (!this.defendTower) {
        UI.button(this, acols[1].cx, rows.act.cy, acols[1].w, rows.act.h, '배치도 저장', function () {
          self._save();
        }, { fill: UI.COL.panelPurple, line: C.strategist, hover: UI.COL.panelPurpleHi,
             color: C.accentAlt, fontSize: 'button' });
      }
    }
    // 3번째 칸 = **나가는 길**. 대전에서는 예전에 이 자리가 '⚒ 유닛 등급' 이어서
    // 배치 화면을 나갈 방법이 아예 없었다(사용자가 ☰ 를 열어 길을 찾다 신고했다).
    // 등급 구매는 v0.64 부터 '유닛을 탭하면 하단 레벨업 팝업'이 담당하므로 여기 있을 이유가 없다.
    UI.button(this, acols[2].cx, rows.act.cy, acols[2].w, rows.act.h,
      this.arena ? '← 대전' : (this.defendTower ? '← 탑' : '메뉴'), function () {
        if (self.arena) { self._arenaExit(); return; }
        self._exitGuard(self.defendTower ? 'DefendTower' : 'Menu');
      }, { fontSize: 'button' });
  }

  // ── 삭제 배지(✕) 글자 — 맨 위에 얹히도록 마지막에 만든다 ────────────────
  this.delTxt = UI.text(this, 0, 0, '✕', {
    size: P ? 'subhead' : 'heading', color: '#ffffff', origin: 0.5
  }).setVisible(false);

  // ── 입력 ────────────────────────────────────────────────────────────────
  // 상·하단 바 위의 탭은 전장 탭이 아니다. 이 가드가 없으면 팔레트를 누를 때마다
  // '아래 파란 칸 안에만…' 경고가 같이 뜬다.
  this.hudTopBand = this.board ? this.board.top : 0;
  this.hudBotBand = PH ? PHL.PAL_Y : H;

  // ── 호버 툴팁 (PC 전용) ─────────────────────────────────────────────────
  //  터치에는 '올려놓기'가 없다 — 폰/세로는 만들지 않는다(칩 탭이 곧 선택이라 방해만 된다).
  if (this._tipEnabled()) {
    this._tipCreate();
    this.input.on('pointermove', function (p) { self._hover(p.x, p.y); });
    // 창 밖으로 나가면 마지막 위치에 툴팁이 남는다
    this.input.on('gameout', function () { self._tipHide(); });
  }

  this.input.on('pointerdown', function (p) {
    // ☰ 시트가 열려 있으면 전장은 잠긴다. 시트를 막 닫은 탭도 전장으로 새면 안 된다.
    if (self.sheet) return;
    if (self._eatTap) { self._eatTap = false; return; }
    // ① ✕ 배지가 먼저다 — 배지를 눌렀는데 그 아래 유닛이 다시 선택되면 안 된다
    if (self._hitDelete(p.x, p.y)) {
      self._removeUnit(self.selected);
      return;
    }
    if (p.y < self.hudTopBand) return;
    if (p.y >= self.hudBotBand) return;
    if (p.y > GAME.Iso.screenRect().bottom) return;
    var wpt = GAME.Iso.toWorld(p.x, p.y);
    if (p.rightButtonDown()) { self._removeAt(wpt.x, wpt.y); return; }
    // 이미 놓은 유닛을 누르면 '선택'이다 — ✕ 배지와 체력바를 보여준다.
    // 빈 자리를 누르면 새로 배치한다.
    var hit = self._unitAt(wpt.x, wpt.y);
    if (hit) {
      self.selected = (self.selected === hit) ? null : hit;
      // 폰에는 마우스 호버가 없어 툴팁을 못 쓴다 → **유닛을 탭하면 그 유닛의 세계관 한 줄**을
      // 상태 줄에 띄운다. 세계관 텍스트가 모바일에서 전혀 노출되지 않던 것을 메운다
      // (스토어 타깃이 모바일인데 lore 노출이 0이었다).
      // 새 문구를 만들지 않고 이미 있는 def.lore 를 쓰므로 폰트 서브셋 비용이 0이다.
      if (self.selected) self._loreLine(self.selected.type);
      self.redraw();
      // 길게 눌러도 지워진다 — 예전부터 쓰던 사람을 위한 보조 수단.
      self._cancelHold();
      self._holdTimer = self.time.delayedCall(GAME.BuildScene.HOLD_MS, function () {
        self._holdTimer = null;
        self._removeAt(wpt.x, wpt.y);
      });
      return;
    }
    self.selected = null;
    self._placeAt(wpt.x, wpt.y);
  });

  var cancelHold = function () { self._cancelHold(); self._eatTap = false; };
  this.input.on('pointerup', cancelHold);
  this.input.on('pointerupoutside', cancelHold);
  this.events.on('shutdown', function () {
    self._cancelHold();
    if (self._warnTimer) { self._warnTimer.remove(false); self._warnTimer = null; }
    if (self._hintTimer) { self._hintTimer.remove(false); self._hintTimer = null; }
    self._closeSheet();
    // ★ 이 씬은 투영을 직접 바꿔 쓴다 — 되돌리지 않으면 전투 화면이 통째로 깨진다.
    GAME.Iso.setMode('default');
  });

  this.input.mouse.disableContextMenu();
  //  ⚠ 들어오자마자 이미 한 종류가 골라져 있다(`init` 의 `picked`). 그런데 설명 줄을
  //    탭할 때만 채우면 **처음 화면이 빈 상자로** 보인다 — 고장으로 읽힌다.
  if (this._showInfo) this._showInfo(this.picked);
  this._status();
  this.redraw();
  if (PH) {
    this._hint('아래 파란 칸을 탭하면 배치  ·  놓인 유닛을 탭하면 삭제(✕)와 강화가 뜬다',
      GAME.BuildScene.HINT_MS);
  }

  //  불러온 배치가 실제로 있을 때만 곧장 붙는다. 비었으면 그냥 배치 화면에 머문다
  //  — 빈 배치로 들어가면 `_defend()` 가 경고만 내고 아무 일도 안 일어나, 사용자
  //    입장에서는 버튼이 죽은 것처럼 보인다.
  if (this.instantStart && this.defendTower && this.placed.length) {
    this.instantStart = false;
    this._defend();
  }
};

GAME.BuildScene.prototype._cancelHold = function () {
  if (this._holdTimer) { this._holdTimer.remove(false); this._holdTimer = null; }
};

// 한 줄에 맞을 때까지 뒤에서 잘라낸다. 보통 한 번도 안 돈다.
GAME.BuildScene.prototype._fitLine = function (txt, s, maxW) {
  if (!txt) return txt;
  var lim = maxW || this.lineMaxW;
  txt.setText(s);
  var guard = 0;
  while (txt.width > lim && guard++ < 60) {
    var t = txt.text;
    txt.setText(t.slice(0, Math.max(4, t.length - 2 - (t.slice(-1) === '…' ? 1 : 0))) + '…');
  }
  return txt;
};

// ── 상태 줄 ─────────────────────────────────────────────────────────────────
//  경고와 설명이 **같은 객체**를 쓴다. 두 객체로 나뉘어 있던 것이 겹침의 원인이었다.
//  폰 가로에서는 평소에 숨어 있다(보드를 가리지 않게) — 경고·첫 안내에만 뜬다.
GAME.BuildScene.prototype._status = function () {
  if (!this.statusText) return;
  var C = GAME.CONFIG.COLORS;
  if (GAME.CONFIG.PHONE) { this.statusText.setVisible(false); return; }
  var def = GAME.UNITS[this.picked];
  var msg = this.placed.length
    ? (def.name + ' (' + GAME.BuildScene.popText(this._costOf(def)) + ') — ' + def.desc)
    : '아래 파란 칸을 탭하면 배치, 놓인 유닛을 탭하면 ✕ 로 삭제';
  this.statusText.setColor(C.textDim);
  this._fitLine(this.statusText, msg);
};

// 유닛을 탭했을 때의 세계관 한 줄. 상태 줄을 잠깐 빌려 쓴다.
// lore 가 없으면 조용히 아무것도 안 한다(units.js 에 아직 안 들어간 유닛 대비).
GAME.BuildScene.prototype._loreLine = function (typeKey) {
  var def = GAME.UNITS[typeKey];
  if (!def || !def.lore || !this.statusText) return;
  if (this._warnTimer) return;              // 경고가 떠 있으면 덮지 않는다
  this._hint(def.name + ' — ' + def.lore, 3600);
};

// 첫 진입 안내 — 잠깐 떴다가 사라진다(상시로 두면 보드를 먹는다)
GAME.BuildScene.prototype._hint = function (msg, ms) {
  var self = this;
  if (!this.statusText) return;
  this.statusText.setColor(GAME.CONFIG.COLORS.textDim).setVisible(true);
  this._fitLine(this.statusText, msg);
  if (this._hintTimer) this._hintTimer.remove(false);
  this._hintTimer = this.time.delayedCall(ms || GAME.BuildScene.HINT_MS, function () {
    self._hintTimer = null;
    if (!self._warnTimer) self._status();
  });
};

GAME.BuildScene.prototype._warn = function (msg) {
  var self = this;
  if (!this.statusText) return;
  this.statusText.setColor(GAME.CONFIG.COLORS.warn).setVisible(true);
  this._fitLine(this.statusText, msg);
  if (this._warnTimer) this._warnTimer.remove(false);
  this._warnTimer = this.time.delayedCall(GAME.BuildScene.WARN_MS, function () {
    self._warnTimer = null;
    self._status();
  });
};

GAME.BuildScene.prototype._pick = function (key) {
  this.picked = key;
  //  ⚠ 잠긴 유닛을 골랐으면 **그 자리에서** 말해 준다. 안 그러면 전장을 탭해 봐야
  //    경고가 뜨는데, 그 왕복이 이 화면에서 가장 흔한 헛수고다(칩 흐리기 주석 참조).
  var lockAt = this._lockOf ? this._lockOf(key) : 0;
  if (lockAt && this._warn) {
    var d = GAME.UNITS[key];
    this._warn(d.name + GAME.UI.josa(d.name, 'eun') + ' ' + lockAt + '회차를 깨면 열립니다.');
  }
  this._showInfo(key);
  this._status();
  this.redraw();
};

//  고른 유닛이 무엇인지 두 줄로 말한다(2026-08-08, 사용자 지시).
//  ⚠ 유닛 표에 이미 `desc`(한 줄 설명)가 있다 — 새로 쓰지 않고 그걸 쓴다.
//    새로 쓰면 표와 화면이 서로 다른 말을 하기 시작한다.
GAME.BuildScene.prototype._showInfo = function (key) {
  if (!this.infoLine1) return;
  var d = GAME.UNITS[key];
  if (!d) { this.infoLine1.setText(''); this.infoLine2.setText(''); return; }
  var dps = d.damage > 0 ? Math.round(d.damage / Math.max(0.2, (d.cooldown || 1000) / 1000)) : 0;
  var bits = [d.name, '인구 ' + (d.pop || 1)];
  bits.push('체력 ' + d.hp);
  if (d.armor) bits.push('방어 ' + d.armor);
  if (dps > 0) bits.push('초당 ' + dps);
  else bits.push('공격 없음');
  //  ⚠ 사거리는 **숫자를 안 쓴다.** 아레나 단위라 '원거리 1436' 같은 값이 나오는데
  //    그건 사람에게 아무 뜻이 없다 — 멀리 치느냐 붙어서 치느냐만 알면 된다.
  if ((d.range || 0) > 150) bits.push('원거리');
  //  이 유닛만의 특성 — 능력치로는 안 보이는 것들.
  var tag = [];
  if (d.ability) tag.push('스킬');
  if (d.guard) tag.push('되받기');
  if (d.armorPen) tag.push('방어 관통');
  if (d.auraAlways) tag.push('상시 오라');
  if (d.deathBlast) tag.push('사망 폭발');
  if (d.knotRadius) tag.push('피해 분담');
  if (d.stackOnAllyDeath) tag.push('사망마다 성장');
  if (d.immobile) tag.push('고정');
  //  ⚠ 특성을 다 늘어놓으면 한 줄이 56자가 되어 상자(≈47자)를 넘는다(계산으로 확인).
  //    둘까지만 적는다 — 셋째부터는 어차피 안 읽힌다.
  if (tag.length) bits.push(tag.slice(0, 2).join('·'));
  //  ⚠ **자르지 말고 덜 중요한 것부터 뺀다.** 그냥 46자에서 자르면 '쇠뇌 진지'처럼
  //    이름이 긴 유닛은 하필 **특성**('스킬·고정')이 잘려 나간다 — 가장 알고 싶은 것이
  //    사라지는 셈이다. 방어 → 체력 순으로 빼면 51자가 42자가 되어 다 들어간다.
  function cut(str, n) { return str.length > n ? (str.slice(0, n - 1) + '…') : str; }
  var DROP = ['방어 ', '체력 '];
  for (var di = 0; di < DROP.length && bits.join(' · ').length > 46; di++) {
    for (var bi = bits.length - 1; bi >= 0; bi--) {
      if (bits[bi].indexOf(DROP[di]) === 0) { bits.splice(bi, 1); break; }
    }
  }
  this.infoLine1.setText(cut(bits.join(' · '), 46));
  var lock = this._lockOf ? this._lockOf(key) : 0;
  //  ⚠ **스킬이 있다고만 적으면 아무 정보가 아니다**(사용자 지시). 무엇을 하는지
  //    한 마디로 말한다. 설명(`desc`)보다 스킬이 우선인 이유: 설명은 생김새를
  //    말하지만 스킬은 **이 유닛 앞에서 무슨 일이 일어나는지**를 말한다.
  //  ⚠ 문구는 능력의 실제 값에서 만든다 — 손으로 적어 두면 값을 바꿨을 때
  //    화면만 옛말을 하게 된다(이 저장소가 반복해서 겪은 종류).
  this.infoLine2.setText(lock ? ('🔒 ' + lock + '회차를 깨면 열립니다')
                              : cut(this._skillLine(d) || d.desc || d.lore || '', 46));
};

//  능력 하나를 한 마디로. 없으면 빈 문자열(그러면 `desc` 가 대신 나온다).
GAME.BuildScene.prototype._skillLine = function (d) {
  var a = d.ability || (d.abilities && d.abilities[0]);
  if (!a) return '';
  var cd = Math.round((a.cooldown || 0) / 1000);
  var tail = cd ? ('  (' + cd + '초마다)') : '';
  var t = a.type;
  if (t === 'charge')    return '⚔ 돌진 — 달려들어 밀쳐낸다' + tail;
  if (t === 'barrage')   return '☄ 폭격 — 바닥에 예고 원, 피하면 안 맞는다' + tail;
  if (t === 'shockwave') return '💥 충격파 — 제 주위를 한 번에 친다' + tail;
  if (t === 'warcry')    return '📣 함성 — 주변 아군 공격력을 올린다' + tail;
  if (t === 'pull')      return '🪢 끌어당기기 — 거리를 벌려도 붙잡는다' + tail;
  if (t === 'ashcloud')  return '🌫 잿가루 — 영웅 스킬이 늦게 돌아온다' + tail;
  if (t === 'ember')     return '🔥 불씨 — 그 자리를 몇 초간 못 쓰게 만든다' + tail;
  if (t === 'healBurst') {
    if (a.shield) return '🛡 보호막 — 아군이 맞기 전에 미리 막아 준다' + tail;
    return '✚ 회복 — 주변 아군을 한 번에 되살린다' + tail;
  }
  return '';
};

GAME.BuildScene.prototype.spent = function () {
  var t = 0;
  for (var i = 0; i < this.placed.length; i++) t += GAME.UNITS[this.placed[i].type].cost;
  return t;
};

// 이 유닛을 지금 놓을 수 있는가 — 팔레트를 미리 흐리게 하는 판단에도, 배치에도 같이 쓴다.
// (판단을 한 곳에 모아둬야 "흐린데 눌러보니 놓아진다" 같은 어긋남이 안 생긴다)
GAME.BuildScene.prototype._blockedReason = function (key) {
  var def = GAME.UNITS[key];
  //  ── 해금 (2026-08-07) ──────────────────────────────────────────────────
  //  ⚠ **여기에 넣는 것이 중요하다.** 팔레트에서만 막으면 다른 배치 경로(불러온
  //    배치도·드래그·단축키)로 잠긴 유닛이 들어온다. 이 함수가 배치의 단일 관문이라
  //    표시와 판정이 갈라지지 않는다(이 함수 위 주석이 그 이유를 이미 적어 두었다).
  var lockAt = this._lockOf ? this._lockOf(key) : 0;
  if (lockAt) {
    return def.name + GAME.UI.josa(def.name, 'eun') + ' ' + lockAt +
           '회차를 깨면 열립니다.';
  }
  if (def.maxPerFormation && this._countOf(key) >= def.maxPerFormation) {
    return def.name + GAME.UI.josa(def.name, 'eun') + ' 배치도당 ' +
           def.maxPerFormation + '개까지만 놓을 수 있습니다.';
  }
  //  ⚠ 판정도 **표시와 같은 단위**로 해야 한다. 표시만 인구로 바꾸면
  //    "인구 20/16" 처럼 앞뒤가 안 맞는 화면이 나온다(궁수 원가 15 → 인구 2).
  //    그 대가로 수성의 탑 배치 총량이 반올림만큼 달라진다 — 인구 척도를
  //    쓰기로 한 이상 피할 수 없는 결과이고, 대전·통곡의 탑은 원본 단위 그대로다.
  if (this._spentOf() + this._costOf(def) > this._budgetOf() + 1e-6) {
    return this._resName() + '이(가) 부족합니다. (' + def.name + ' ' + GAME.BuildScene.popText(this._costOf(def)) +
           this._resUnit() + ' · 남은 ' + GAME.BuildScene.popText(this._budgetOf() - this._spentOf()) + ')';
  }
  return null;
};

// 배치된 유닛 중 이 좌표를 누른 것 (가장 가까운 것 하나)
GAME.BuildScene.prototype._unitAt = function (x, y) {
  var best = null, bestD = Infinity;
  for (var i = 0; i < this.placed.length; i++) {
    var p = this.placed[i];
    var def = GAME.UNITS[p.type];
    var dx = p.x - x, dy = p.y - y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d <= def.radius + 10 && d < bestD) { bestD = d; best = p; }
  }
  return best;
};

GAME.BuildScene.prototype._trimToBudget = function () {
  while (this.spent() > this.budget && this.placed.length) {
    var gone = this.placed.pop();
    if (this.selected === gone) this.selected = null;
  }
  this.history = [];   // 잘라낸 뒤의 되돌리기는 의미가 없다
};

GAME.BuildScene.prototype._countOf = function (type) {
  var n = 0;
  for (var i = 0; i < this.placed.length; i++) if (this.placed[i].type === type) n++;
  return n;
};

// 겹치지 않는 자리인가
GAME.BuildScene.prototype._tooClose = function (x, y) {
  for (var i = 0; i < this.placed.length; i++) {
    var p = this.placed[i];
    var dx = p.x - x, dy = p.y - y;
    if (Math.sqrt(dx * dx + dy * dy) < 30) return true;
  }
  return false;
};

// 한 기만 놓는다. 성공하면 놓인 객체, 실패하면 사유 문자열.
GAME.BuildScene.prototype._putOne = function (x, y) {
  if (!GAME.UI.inZone(this.zone, x, y)) return '아래 파란 칸 안에만 놓을 수 있습니다.';
  var blocked = this._blockedReason(this.picked);
  if (blocked) return blocked;
  if (this._tooClose(x, y)) return '유닛이 너무 가깝습니다.';
  var u = { type: this.picked, x: Math.round(x), y: Math.round(y) };
  this.placed.push(u);
  return u;
};

GAME.BuildScene.prototype._placeAt = function (x, y) {
  var A = GAME.CONFIG.ARENA;
  var first = this._putOne(x, y);
  if (typeof first === 'string') { this._warn(first); return; }

  // 되돌리기는 여전히 '묶음' 단위로 쌓는다 — 대칭이 사라져 지금은 늘 1기지만,
  // 나중에 여러 기를 한 번에 놓는 도구가 생기면 그대로 쓰인다.
  var group = [first];
  this.history.push(group);
  this._status();
  this.redraw();
};

GAME.BuildScene.prototype._undo = function () {
  if (!this.history.length) { this._warn('되돌릴 배치가 없습니다.'); return; }
  var group = this.history.pop();
  for (var i = 0; i < group.length; i++) {
    var idx = this.placed.indexOf(group[i]);
    if (idx >= 0) this.placed.splice(idx, 1);
    if (this.selected === group[i]) this.selected = null;
  }
  this._status();
  this.redraw();
};

GAME.BuildScene.prototype._clearAll = function () {
  this.placed = []; this.history = []; this.selected = null;
  this._status(); this.redraw();
};

GAME.BuildScene.prototype._removeUnit = function (u) {
  if (!u) return;
  var idx = this.placed.indexOf(u);
  if (idx < 0) return;
  this.placed.splice(idx, 1);
  if (this.selected === u) this.selected = null;
  // 되돌리기 기록에서도 지운다 — 안 그러면 이미 없는 유닛을 되돌리려 한다
  for (var i = this.history.length - 1; i >= 0; i--) {
    var g = this.history[i];
    var k = g.indexOf(u);
    if (k >= 0) g.splice(k, 1);
    if (!g.length) this.history.splice(i, 1);
  }
  this._status();
  this.redraw();
};

GAME.BuildScene.prototype._removeAt = function (x, y) {
  for (var i = this.placed.length - 1; i >= 0; i--) {
    var p = this.placed[i];
    var dx = p.x - x, dy = p.y - y;
    if (Math.sqrt(dx * dx + dy * dy) <= GAME.UNITS[p.type].radius + 12) {
      this._removeUnit(p);
      return;
    }
  }
};

// ✕ 배지를 눌렀는가 (화면 좌표)
GAME.BuildScene.prototype._hitDelete = function (sx, sy) {
  var b = this.delBadge;
  if (!b || !this.selected) return false;
  var dx = sx - b.x, dy = sy - b.y;
  return Math.sqrt(dx * dx + dy * dy) <= b.r + 8;
};

// 진형 전력 — units.js 값을 **읽기만** 한다(밸런스 수치는 건드리지 않는다).
GAME.BuildScene.prototype._power = function () {
  var hp = 0, dps = 0, melee = 0, ranged = 0, support = 0;
  for (var i = 0; i < this.placed.length; i++) {
    var d = GAME.UNITS[this.placed[i].type];
    hp += d.hp;
    if (d.damage > 0 && d.cooldown > 0 && d.cooldown < 100000) dps += d.damage / (d.cooldown / 1000);
    if (d.attack === 'none') support++;
    else if (d.attack === 'melee') melee++;
    else ranged++;
  }
  return { hp: Math.round(hp), dps: Math.round(dps), melee: melee, ranged: ranged, support: support };
};

GAME.BuildScene.prototype._powerLine = function (short) {
  if (!this.placed.length) {
    return short ? '전력  —  유닛을 배치하면 진형의 세기가 여기 나옵니다'
                 : '전력  —  유닛을 배치하면 체력 총합 · 초당 피해 · 구성이 여기 나옵니다';
  }
  var pw = this._power();
  return '전력  체력 ' + pw.hp + '  ·  초당 피해 ' + pw.dps
    + '  ·  근접 ' + pw.melee + ' / 원거리 ' + pw.ranged + ' / 지원 ' + pw.support;
};

// ═══════════════════════════════════════════════════════════════════════════
//  유닛 정보 툴팁 (PC 전용)
//  ---------------------------------------------------------------------------
//  "무엇을 사는지 모르겠다"가 이 화면의 남은 마지막 구멍이었다. 칩에는 이름·가격만 있고
//  설명 한 줄은 상태 줄에 **고른 뒤에야** 뜬다 — 비교하려면 열 번을 눌러봐야 했다.
//  그래서 마우스를 올린 것(팔레트 칸이든, 이미 놓인 유닛이든)의 정보를 그 자리에 띄운다.
//
//  담는 순서에 이유가 있다:
//   ① 이름·가격        — 예산이 이 화면의 통화다
//   ② 세계관 한 줄     — `def.lore` (units.js 담당이 넣기 전이면 **조용히 생략**한다)
//   ③ 쓰임새 한 줄     — `def.desc`
//   ④ **논타겟/자동명중** — 이 게임의 핵심 규칙이라 스탯보다 위에 둔다.
//      "싸고 다수지만 피할 수 있다 / 비싸고 소수지만 피할 수 없다"가 배치의 근본 선택이다.
//   ⑤ 스탯 3줄(2열)   ⑥ 특수 능력(반경·둔화·제한)
//  터치에는 '올려놓기'가 없다 → `GAME.isTouch`/`PHONE`/`PORTRAIT` 를 모두 걸러 PC 만 켠다.
// ═══════════════════════════════════════════════════════════════════════════
GAME.BuildScene.prototype._tipEnabled = function () {
  return !GAME.isTouch && !GAME.CONFIG.PHONE && !GAME.CONFIG.PORTRAIT;
};

GAME.BuildScene.prototype._tipCreate = function () {
  var UI = GAME.UI;
  var C = GAME.CONFIG.COLORS;
  var T = GAME.BuildScene.TIP;
  var wrap = T.W - T.PAD * 2;
  // 툴팁은 모든 것 위에 뜬다(전장·팔레트·버튼). 시트(900~902)보다도 위.
  var D = 1200;
  this.tip = {
    g:     this.add.graphics().setDepth(D),
    title: UI.text(this, 0, 0, '', { size: 'subhead', color: C.text }).setDepth(D + 1),
    lore:  UI.text(this, 0, 0, '', { size: 'caption', color: C.accentAlt, wrap: wrap }).setDepth(D + 1),
    desc:  UI.text(this, 0, 0, '', { size: 'caption', color: C.textMid, wrap: wrap }).setDepth(D + 1),
    rule:  UI.text(this, 0, 0, '', { size: 'caption', color: C.accent }).setDepth(D + 1),
    body:  UI.text(this, 0, 0, '', { size: 'caption', color: C.text }).setDepth(D + 1),
    extra: UI.text(this, 0, 0, '', { size: 'caption', color: C.crit, wrap: wrap }).setDepth(D + 1),
    on: false
  };
  this._tipHide();
};

// 논타겟/자동명중 — 한 줄과 그 색.
GAME.BuildScene.prototype._tipRule = function (def) {
  var C = GAME.CONFIG.COLORS;
  if (def.attack === 'none') {
    return { s: '비전투 지원 — 스스로 공격하지 않는다', c: C.accentAlt };
  }
  if (GAME.isAutoHit(def)) {
    return { s: '자동명중 — 던지면 반드시 맞는다 (회피 불가)', c: C.crit };
  }
  return { s: '논타겟 — 보고 피할 수 있다 (회피 가능)', c: C.accent };
};

// 스탯 3줄(2열). 표를 흉내내지 않는다 — 비례폭 글꼴에서 칸을 맞추려다 어긋나느니
// 가운뎃점으로 나누는 편이 정직하다.
GAME.BuildScene.prototype._tipStats = function (def) {
  var atkSpd = (def.damage && def.cooldown && def.cooldown < 100000)
    ? (1000 / def.cooldown).toFixed(2) + '/초' : '—';
  var range = def.rangeSpan ? '맵 전체' : (def.range ? String(def.range) : '—');
  return [
    '체력 ' + def.hp + '   ·   방어력 ' + def.armor,
    '공격력 ' + (def.damage ? def.damage : '—') + '   ·   공격속도 ' + atkSpd,
    '사거리 ' + range + '   ·   이동속도 ' + (def.speed ? def.speed : '고정')
  ].join('\n');
};

// 특수 능력 — 반경을 가진 것은 전장에 원으로도 보이므로 숫자를 같이 준다.
GAME.BuildScene.prototype._tipExtra = function (def) {
  var out = [];
  if (def.healRadius) {
    out.push('치유 반경 ' + def.healRadius + ' — ' + (def.healInterval / 1000).toFixed(0)
      + '초마다 아군 ' + def.healPerTick + ' 회복');
  }
  if (def.buffRadius) {
    out.push('강화 반경 ' + def.buffRadius + ' — 아군 공격력 +'
      + Math.round((def.buffDamageMul - 1) * 100) + '%');
  }
  if (def.intercept) out.push('차단 반경 ' + def.intercept + ' — 아군에게 갈 투사체를 대신 맞는다');
  if (def.aoeRadius) {
    out.push('광역 반경 ' + def.aoeRadius
      + (def.telegraph ? ' — ' + (def.telegraph / 1000).toFixed(1) + '초 예고 후 폭발' : ''));
  }
  if (def.slowMul) {
    out.push('명중하면 이동속도 ' + Math.round((1 - def.slowMul) * 100) + '% 감소 ('
      + (def.slowMs / 1000).toFixed(1) + '초)');
  }
  if (def.isMine) {
    out.push('발동 반경 ' + def.triggerRadius + ' — 밟으면 최대 체력의 '
      + Math.round(def.pctMaxHp * 100) + '% 가 날아간다');
  }
  if (def.immobile) out.push('고정 — 움직이지 않는다');
  if (def.maxPerFormation) out.push('배치도당 ' + def.maxPerFormation + '개까지');
  return out.join('\n');
};

// 내용을 채우고 크기를 잰다. 같은 유닛이면 다시 만들지 않는다(마우스 이동마다 재생성 금지).
GAME.BuildScene.prototype._tipFill = function (def) {
  var T = GAME.BuildScene.TIP;
  var t = this.tip;
  var rule = this._tipRule(def);
  // ★ 세 줄은 항상 뜬다. **크기를 재기 전에** 보이게 해야 한다 — 예전엔 _tipHide 가 꺼둔
  //   상태로 재는 바람에 패널 높이가 두 줄치(50px)로 나와 내용이 판 밖으로 흘렀다(실측).
  t.title.setVisible(true);
  t.rule.setVisible(true);
  t.body.setVisible(true);
  t.title.setText(def.name + '   ' + def.cost + '원');
  // ★ lore 는 units.js 담당이 아직 안 넣었을 수 있다 — 없으면 조용히 생략한다.
  t.lore.setText(def.lore ? def.lore : '').setVisible(!!def.lore);
  t.desc.setText(def.desc || '').setVisible(!!def.desc);
  t.rule.setText(rule.s).setColor(rule.c);
  t.body.setText(this._tipStats(def));
  var ex = this._tipExtra(def);
  t.extra.setText(ex).setVisible(!!ex);

  var order = [t.title, t.lore, t.desc, t.rule, t.body, t.extra];
  var w = 0, h = 0, i;
  for (i = 0; i < order.length; i++) {
    if (!order[i].visible) continue;
    if (order[i].width > w) w = order[i].width;
    h += order[i].height + T.GAP;
  }
  // 마지막 줄 뒤의 GAP 은 빼고(안 그러면 아래 여백만 두툼해진다), 규칙 줄 밑 구분선 3px 을 더한다
  t.w = Math.max(200, Math.min(T.W, Math.ceil(w) + T.PAD * 2));
  t.h = Math.ceil(h) - T.GAP + T.PAD * 2 + 3;
  t.order = order;
  this._tipDef = def;
};

// 커서를 따라다니되 화면 밖으로 나가지 않는다.
GAME.BuildScene.prototype._tipPlace = function (sx, sy) {
  var T = GAME.BuildScene.TIP;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var UI = GAME.UI;
  var t = this.tip;
  var x = sx + T.OFF, y = sy + T.OFF;
  // 오른쪽/아래로 넘치면 커서 반대편으로 뒤집는다(커서를 덮지 않게)
  if (x + t.w > W - T.MARGIN) x = sx - T.OFF - t.w;
  if (y + t.h > H - T.MARGIN) y = sy - T.OFF - t.h;
  x = Math.max(T.MARGIN, Math.min(W - T.MARGIN - t.w, x));
  y = Math.max(T.MARGIN, Math.min(H - T.MARGIN - t.h, y));

  var g = t.g;
  g.clear();
  g.fillStyle(UI.COL.shadow === undefined ? 0x000000 : UI.COL.shadow, 0.4);
  g.fillRoundedRect(x + 2, y + 4, t.w, t.h, UI.R.md);
  g.fillStyle(UI.COL.surface, 0.97);
  g.fillRoundedRect(x, y, t.w, t.h, UI.R.md);
  g.lineStyle(1, this.myColor, 0.9);
  g.strokeRoundedRect(x + 0.5, y + 0.5, t.w - 1, t.h - 1, UI.R.md);

  var cy = y + T.PAD;
  for (var i = 0; i < t.order.length; i++) {
    var o = t.order[i];
    if (!o.visible) continue;
    o.setPosition(x + T.PAD, Math.round(cy));
    cy += o.height + T.GAP;
    // 규칙 줄 아래에 얇은 구분선 — 스탯 덩어리와 시선을 분리한다
    if (o === t.rule) {
      g.lineStyle(1, UI.COL.divider, 1);
      g.lineBetween(x + T.PAD, Math.round(cy) - 2, x + t.w - T.PAD, Math.round(cy) - 2);
      cy += 3;
    }
  }
  t.on = true;
};

GAME.BuildScene.prototype._tipShow = function (def, sx, sy) {
  if (!this.tip) return;
  // 보이기/크기는 _tipFill 한 곳에서 정한다(두 곳에서 정하면 잰 크기와 그린 것이 어긋난다).
  if (this._tipDef !== def) this._tipFill(def);
  this._tipPlace(sx, sy);
};

GAME.BuildScene.prototype._tipHide = function () {
  var t = this.tip;
  if (!t) return;
  t.g.clear();
  t.title.setVisible(false); t.lore.setVisible(false); t.desc.setVisible(false);
  t.rule.setVisible(false); t.body.setVisible(false); t.extra.setVisible(false);
  t.on = false;
  this._tipDef = null;
};

// 팔레트 칸 히트 테스트 (화면 좌표)
GAME.BuildScene.prototype._chipAt = function (sx, sy) {
  for (var i = 0; i < this.chips.length; i++) {
    var c = this.chips[i];
    if (sx >= c.x && sx <= c.x + c.w && sy >= c.y && sy <= c.y + c.h) return c;
  }
  return null;
};

// 지금 커서 아래에 무엇이 있는가 — 팔레트 칸이 먼저, 그 다음 놓인 유닛.
GAME.BuildScene.prototype._hover = function (sx, sy) {
  if (!this.tip) return;
  this._hoverX = sx; this._hoverY = sy;
  var chip = this._chipAt(sx, sy);
  if (chip) { this._tipShow(GAME.UNITS[chip.key], sx, sy); return; }
  if (this.board && sy >= this.board.top && sy <= this.board.bottom) {
    var w = GAME.Iso.toWorld(sx, sy);
    var u = this._unitAt(w.x, w.y);
    if (u) { this._tipShow(GAME.UNITS[u.type], sx, sy); return; }
  }
  this._tipHide();
};

// ═══════════════════════════════════════════════════════════════════════════
//  ☰ 시트 (폰 가로 전용)
//  ---------------------------------------------------------------------------
//  되돌리기 · 대칭 · 전부 지우기 · 예산 티어 · 배치도 저장 · 메뉴로 를 여기 접었다.
//  `GAME.Modal` 은 못 쓴다 — 항목 8개면 패널 높이가 644px 라 390px 화면을 넘는다(계산).
//  그래서 3×3 격자 시트를 이 씬 안에서 만든다.
// ═══════════════════════════════════════════════════════════════════════════
GAME.BuildScene.prototype._toggleSheet = function () {
  if (this.sheet) this._closeSheet(); else this._openSheet();
};

GAME.BuildScene.prototype._closeSheet = function () {
  if (!this.sheet) return;
  var o = this.sheet;
  this.sheet = null;
  for (var i = 0; i < o.length; i++) {
    if (o[i] && o[i].destroy) o[i].destroy();
  }
  // 시트를 닫은 그 탭이 전장 탭으로 새면 유닛이 놓인다 — 한 번 먹는다.
  this._eatTap = true;
};

// 대전 전략가 — 유닛 등급 패널. **배치에 놓인 종류만** 보여준다:
// 안 쓰는 유닛의 등급을 사는 것은 예산을 버리는 일이라 선택지로 둘 이유가 없다.
// 산 뒤에는 예산이 줄었으므로 배치 예산을 다시 계산하고 화면을 새로 그린다.
// ── 선택한 유닛의 강화 줄 (2026-07-30, 사용자 지시 5번) ─────────────────────
// 신고: "배치하는 과정에서 유닛을 업그레이드하는 기능이 보이지 않는다."
// 맞다 — 등급 구매가 상단 버튼(PC)·☰(폰) 안에 있어서 **배치하는 손의 동선 밖**이었다.
// 이제 놓인 유닛을 누르면 삭제 배지(✕)와 함께 **그 종류의 강화 버튼이 하단에 뜬다.**
// 지금 만지고 있는 유닛에 대한 값이라, 무엇을 올리는지 헷갈릴 여지가 없다.
GAME.BuildScene.prototype._syncUpgradeBar = function () {
  if (!this.arena) return;
  var C = GAME.CONFIG.COLORS, UI = GAME.UI;
  var sel = this.selected;

  if (!sel || !GAME.UNITS[sel.type]) { this._hideUpPop(); return; }

  var AB = GAME.ArenaBuild, rec = AB.get();
  // 버튼의 '살 수 있나' 판정은 **구매와 같은 숫자**를 봐야 한다 —
  // 다르면 눌러도 안 되는 버튼이 밝게 켜져 있게 된다.
  AB.setPlacedCost(this.spent());
  var MAXL = (GAME.UnitLevel && GAME.UnitLevel.MAX) || 5;
  var lv = rec.unitLv[sel.type] || 1;
  var maxed = lv >= MAXL;
  var cost = AB.unitLvCost(lv + 1);
  var can = !maxed && cost <= AB.left(rec);
  var def = GAME.UNITS[sel.type];

  var label = maxed
    ? (def.name + '  Lv.' + lv + '  ·  최고 등급')
    //  ⚠ 골드는 **💰** 로 통일한다 (2026-08-08 사용자 신고: "마름모가 골드라는 게
    //    잘 안 읽혀"). `◈` 는 이 게임에서 **층 원형**(towerloading)과 **남은 예산**
    //    (대전 상점)에도 쓰여 뜻이 셋으로 겹쳐 있었다. 통곡의 탑은 처음부터 💰 였다.
    : ('⚒ 레벨업  ' + def.name + '  Lv.' + lv + ' → ' + (lv + 1) + '      💰 ' + cost);

  // ── 팝업을 만든다(한 번만) ────────────────────────────────────────────────
  // 사용자 지시(2026-07-30): "✕ 버튼처럼, 유닛을 클릭하면 하단에 레벨업과 필요한 골드가
  //   뜨고 다른 데 클릭하면 사라지는 팝업."
  // ⚠ 예전 구현은 `UI.button` 하나를 **배치판 위 좌표**(폰: 팔레트 y − 20 = 286,
  //   판 바닥이 300)에 띄웠다. 판 안이라 전장 탭을 삼키고, 배경이 없어 유닛과 섞여
  //   "작동하지 않는다"로 보였다. 이제 **판 배경을 깐 팝업**으로 만들고 깊이를 올린다.
  // 자리는 판의 아래쪽 안 — 폰 가로는 판 아래에 팔레트가 붙어 여유가 0 이라
  //   팝업이 판 위에 얹히는 것이 유일한 선택이다(그래서 배경이 꼭 필요하다).
  if (!this.upPop) {
    var self2 = this;
    var g = this.add.graphics().setDepth(880);
    var txt = UI.text(this, 0, 0, '', { size: 'body', color: C.text, origin: 0.5 })
      .setDepth(882);
    // 히트 영역은 별도 사각형 — Graphics 는 입력을 받기가 번거롭다.
    var hit = this.add.rectangle(0, 0, 10, 10, 0x000000, 0.001).setDepth(881);
    hit.setInteractive({ useHandCursor: true });
    hit.on('pointerdown', function (p) {
      // 이 탭이 아래 전장으로 새면 유닛이 하나 더 놓인다 → 다음 한 번을 먹는다.
      self2._eatTap = true;
      self2._buySelectedLevel();
    });
    this.upPop = { g: g, txt: txt, hit: hit };
  }

  var pop = this.upPop;
  pop.txt.setText(label);
  pop.txt.setColor(can ? C.accent : (maxed ? C.textDim : UI.TXT.crit));

  var padX = 18, padY = 12;
  var w = Math.min(GAME.CONFIG.WIDTH - 24, pop.txt.width + padX * 2);
  var h = pop.txt.height + padY * 2;
  var cx = GAME.CONFIG.WIDTH / 2;
  var bottom = this.board ? this.board.bottom
    : (GAME.CONFIG.PHONE || GAME.CONFIG.PORTRAIT
        ? GAME.BuildScene.PHONE.BOARD_BOTTOM : GAME.CONFIG.HEIGHT - 130);
  var cy = bottom - h / 2 - 8;

  pop.g.clear();
  pop.g.fillStyle(UI.COL.surface === undefined ? UI.COL.surfaceAlt : UI.COL.surface, 0.97);
  pop.g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 12);
  pop.g.lineStyle(2, can ? C.strategist : UI.COL.borderUi, 1);
  pop.g.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 12);
  pop.txt.setPosition(cx, cy);
  pop.hit.setPosition(cx, cy).setSize(w, h);
  if (pop.hit.input) pop.hit.input.hitArea.setTo(0, 0, w, h);

  pop.g.setVisible(true);
  pop.txt.setVisible(true);
  pop.hit.setVisible(true);
  pop.hit.setInteractive({ useHandCursor: true });
};

// 팝업을 감춘다. **입력도 같이 끈다** — 안 끄면 보이지 않는 판이 전장 탭을 계속 먹는다.
GAME.BuildScene.prototype._hideUpPop = function () {
  var pop = this.upPop;
  if (!pop) return;
  pop.g.clear();
  pop.g.setVisible(false);
  pop.txt.setVisible(false);
  pop.hit.setVisible(false);
  pop.hit.disableInteractive();
};

GAME.BuildScene.prototype._buySelectedLevel = function () {
  if (!this.arena || !this.selected) return;
  var AB = GAME.ArenaBuild;
  var t = this.selected.type;
  var MAXL = (GAME.UnitLevel && GAME.UnitLevel.MAX) || 5;
  var lv = AB.get().unitLv[t] || 1;
  if (lv >= MAXL) { this._warn('이미 최고 등급입니다.'); return; }

  // ⚠ **놓인 유닛 값을 먼저 알려준 뒤에** 산다. 이 한 줄이 없으면 판이 가득 찼는데도
  //   구매가 통과하고, 줄어든 예산 때문에 유닛이 잘려 나간다(신고된 버그의 원인).
  AB.setPlacedCost(this.spent());
  var cost = AB.unitLvCost(lv + 1);
  if (cost > AB.left()) {
    this._warn('예산이 ' + cost + ' 필요합니다 — 유닛을 줄이거나 다른 종류를 고르세요.');
    return;
  }
  if (AB.buyUnitLv(t) === null) { this._warn('강화하지 못했습니다.'); return; }

  // 위에서 들어맞는 것을 확인했으므로 **자르지 않는다.** 예전에는 여기서
  // `_trimToBudget()` 을 불러 배치를 뜯어냈다 — 그게 "유닛이 사라진다"의 정체다.
  this.budget = Math.max(0, GAME.Arena.BUDGET - AB.unitLvSpent(AB.get()));
  this._warn('');
  this._status();
  this.redraw();
};

// (`_openArenaUpgrades` 는 제거했다 — 2026-07-30)
//  대전의 유닛 등급 구매 경로가 두 개였다: 이 패널과 '유닛을 탭하면 뜨는 하단 레벨업 팝업'.
//  후자가 사용자 지시로 만들어진 정식 경로이고(배치하는 손의 동선 위에 있다),
//  이 패널은 상단 버튼·☰ 안에 숨어 있어 신고의 원인이었다. 두 벌을 남겨 두면
//  어느 쪽이 실제로 쓰이는지 알 수 없어진다(이 폴더가 반복해 겪은 함정이다).
//  등급 값 계산은 `GAME.ArenaBuild` 에 있으므로 로직이 사라진 것은 아니다.

GAME.BuildScene.prototype._openSheet = function () {
  // 대전에는 시트가 없다 — ☰ 자리를 '← 대전' 출구가 대신한다(2026-07-30 지시).
  // 부를 곳이 없어졌지만 가드를 남긴다: 나중에 누가 이 함수를 다시 부르면
  // 대전 화면에 예산 티어·중복 저장 버튼이 되살아난다(둘 다 유닛을 잘라내던 버그다).
  if (this.arena) return;

  var self = this;
  var C = GAME.CONFIG.COLORS;
  var UI = GAME.UI;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  this._closeSheet();
  this._eatTap = false;

  var objs = [];
  var pw = 640, px0 = Math.round((W - pw) / 2), py0 = 44, phh = 290;
  var bw = Math.floor((pw - 40 - 24) / 3), bh = 56;
  var bx = [px0 + 20 + bw / 2, px0 + 20 + bw + 12 + bw / 2, px0 + 20 + (bw + 12) * 2 + bw / 2];
  var cyA = py0 + 110, cyB = py0 + 176, cyC = py0 + 242;

  var veil = this.add.rectangle(W / 2, H / 2, W, H, UI.COL.bg, 0.74).setDepth(900);
  veil.setInteractive();
  veil.on('pointerdown', function () { self._closeSheet(); });
  objs.push(veil);

  objs.push(UI.panel(this, px0, py0, pw, phh, { level: 1 }).setDepth(901));

  objs.push(UI.text(this, W / 2, py0 + 10, '배치 도구',
    { size: 'subhead', color: C.text, origin: 0.5, originY: 0 }).setDepth(902));
  objs.push(this._fitLine(UI.text(this, px0 + 20, py0 + 42, '',
    { size: 'micro', color: C.textMid }).setDepth(902), this._powerLine(false), pw - 40));
  objs.push(this._fitLine(UI.text(this, px0 + 20, py0 + 64, '',
    { size: 'micro', color: C.textDim }).setDepth(902),
    '아래 파란 칸을 탭하면 배치  ·  놓인 유닛을 탭하면 ✕ 로 삭제', pw - 40));

  function mk(cx, cy, label, fn, opts) {
    var b = UI.button(self, cx, cy, bw, bh, label, fn, opts);
    b.setDepth(902);
    objs.push(b);
    return b;
  }

  // 1행 — 되돌리기 · 대칭 · 전부 지우기 (누른 뒤에도 시트를 열어둔다: 연속 조작)
  mk(bx[0], cyA, '되돌리기', function () { self._undo(); self._openSheet(); },
    { fontSize: 'buttonSm' });
  // 대칭 칸이 사라져 이 행은 두 칸이다. bx[2] 자리는 비워 두지 않고 그대로 쓴다 —
  // 칸을 하나 줄이려면 위 cols() 개수도 같이 줄여야 하는데, 그러면 2·3행 정렬이 어긋난다.
  mk(bx[2], cyA, '전부 지우기', function () { self._clearAll(); self._openSheet(); },
    { fontSize: 'buttonSm' });

  // 2행 — 예산 티어 (수성의 탑은 층 고정 예산이라 정보만)
  if (this.defendTower) {
    objs.push(this._fitLine(UI.text(this, W / 2, cyB, '',
      { size: 'caption', color: C.accentAlt, origin: 0.5 }).setDepth(902),
      '수성의 탑 ' + this.defendTower + '층  ·  고정 예산 ' + this.budget
      + '  ·  오는 영웅 ' + this.dtHeroName, pw - 40));
  } else {
    var tiers = GAME.CONFIG.BUDGET_TIERS;
    for (var t = 0; t < tiers.length; t++) {
      (function (tier, idx) {
        var b = mk(bx[idx], cyB, tier.replace('예산', '') + ' ' + GAME.CONFIG.BUDGETS[tier],
          function () {
            self.tier = tier;
            self.budget = GAME.CONFIG.BUDGETS[tier];
            self._trimToBudget();
            self.redraw();
            self._openSheet();
          }, { fontSize: 'buttonSm' });
        if (tier === self.tier) {
          b.rect.setStrokeStyle(2, self.myColor);
          b.rect.setFillStyle(UI.COL.surfaceHi);
        }
      })(tiers[t], t);
    }
  }

  // 3행 — 저장 · 나가기 · 닫기
  //  수성의 탑에서는 저장 버튼을 안 만든다(PC 쪽과 같은 이유 — 위 주석 참조).
  if (!this.defendTower) {
    mk(bx[0], cyC, '배치도 저장', function () { self._closeSheet(); self._save(); },
      { fill: UI.COL.panelPurple, line: C.strategist, hover: UI.COL.panelPurpleHi,
        color: C.accentAlt, fontSize: 'buttonSm' });
  }
  // 대전은 위에서 이미 돌아갔다 — 여기는 방어전·수성의 탑 경로뿐이다.
  mk(bx[1], cyC, this.defendTower ? '← 탑' : '메뉴로', function () {
      self._closeSheet();
      self._exitGuard(self.defendTower ? 'DefendTower' : 'Menu');
    }, { fontSize: 'buttonSm' });
  mk(bx[2], cyC, '닫기', function () { self._closeSheet(); }, { fontSize: 'buttonSm' });

  this.sheet = objs;
};

// 방어전 — AI 컨트롤러가 이 진형을 공격한다
GAME.BuildScene.prototype._defend = function () {
  if (!this.placed.length) {
    this._warn('유닛을 최소 1기 배치해야 합니다.');
    return;
  }
  this.scene.start('Defend', {
    placed: this.placed.slice(), tier: this.tier, budget: this.budget,
    defendTower: this.defendTower
  });
};

// ── 대전: 내 전장 저장 ──────────────────────────────────────────────────────
// 일반 저장(`_save`)은 이름과 '어떤 영웅을 상대로 짰나'를 물어본다. 대전은 다르다 —
// **id 당 전장이 하나**라 고를 것이 없고, 물어볼수록 저장이 멀어진다.
// 이름은 닉네임에서 만들고, 저장하는 순간 내 기지로 세우고 서버에 올린다.
GAME.BuildScene.prototype._saveArena = function () {
  if (!this.placed.length) { this._warn('유닛을 최소 1기 배치해야 합니다.'); return; }
  var me = GAME.Account.current() || '나';

  // 내가 전에 올린 것은 지운다(id 당 1개 — v0.53 규칙과 같다).
  var old = GAME.Formations.loadSaved().filter(function (f) {
    return !f.isAI && (f.author === me || f.author === '나');
  });
  for (var i = 0; i < old.length; i++) GAME.Formations.remove(old[i].id);

  // 아래에서 짠 것을 전투 기준(위쪽)으로 뒤집어 정규화 좌표로 저장한다.
  var units = this.placed.map(function (p) {
    var n = GAME.Formations.normalize(p.x, GAME.mirrorY(p.y));
    return { type: p.type, nx: n.nx, ny: n.ny };
  });
  var id = GAME.Formations.newId();
  GAME.Formations.save({
    id: id, name: me + '의 전장', author: me, isAI: false,
    // `at` 이 없으면 목록이 '시각 모름' 으로 뜬다(실기기 스크린샷에서 확인).
    // 서버 행은 at 을 실어 주는데 **로컬 저장에는 아무도 안 넣고 있었다.**
    at: Date.now(),
    tier: this.tier, budget: GAME.Arena.BUDGET, v: 2, vsHero: null, units: units
  });
  GAME.Arena.setBase(id);
  // 서버에 올린다 — 이게 되어야 남의 대전 목록에 내 전장이 뜬다.
  // 실패해도 로컬에는 남으므로 저장 자체는 성공이다(문구로 구분해 준다).
  var self = this;
  // ⚠ `_hint(msg, ms)` 의 두 번째 인자는 **표시 시간**이지 색이 아니다.
  //   색을 넘기면 문구가 몇 밀리초 뒤에 사라진다(= 안 보인다).
  //   실패는 경고 줄(`_warn`)로, 성공은 안내 줄(`_hint`)로 나눠 말한다.
  var done = function (ok) {
    if (ok) { self._warn(''); self._hint('내 전장을 올렸습니다 — 다른 사람의 대전 목록에 뜹니다', 4000); }
    else { self._warn('저장했습니다. 다만 서버에 올리지 못했습니다(연결을 확인하세요).'); }
    self.redraw();
  };
  // 저장한 뒤에는 지금 상태가 새 기준이다 — 안 그러면 저장 직후 나가도 경고가 뜬다.
  this._entrySig = this._arenaSig();
  this._exitArmed = false;
  // `syncBase(true)` — force 를 줘야 10분 쿨다운을 건너뛴다. 저장 버튼을 눌렀는데
  // "방금 올렸으니 안 올린다"로 조용히 넘어가면 사용자는 저장이 안 된 줄 안다.
  GAME.Arena.syncBase(true)
    .then(function (r) { done(!!r); })['catch'](function () { done(false); });
};

// ── 대전 배치를 나간다 ──────────────────────────────────────────────────────
// 저장은 자동으로 하지 않는다 — 잘못 만지다 나가는 것까지 내 전장으로 올려버리면
// 남들이 도전하는 배치가 사고로 바뀐다(전장은 id 당 하나뿐이라 되돌릴 원본이 없다).
// 대신 **저장 안 한 변경이 있으면 한 번 경고**하고, 다시 누르면 버린다.
// window.confirm 을 쓰지 않는 이유: 브라우저 모달이 Phaser 입력 루프를 멈춘다.
GAME.BuildScene.prototype._arenaSig = function () {
  var lv = (GAME.ArenaBuild && GAME.ArenaBuild.get().unitLv) || {};
  var units = this.placed.map(function (p) {
    return p.type + ':' + Math.round(p.x) + ',' + Math.round(p.y);
  }).sort().join('|');
  return units + '#' + Object.keys(lv).sort().map(function (k) { return k + lv[k]; }).join(',');
};

//  나갈 때 미저장 변경이 있으면 **한 번 막고 알린다.** 두 번째 누르면 나간다.
//  ⚠ 확인 팝업(window.confirm)을 쓰지 않는 이유는 이 파일 위쪽 주석에 적힌 그대로다 —
//    브라우저 모달이 Phaser 입력 루프를 멈춘다. 그래서 '두 번 누르기'로 푼다.
GAME.BuildScene.prototype._exitGuard = function (target) {
  if (this._entrySig !== undefined && this._arenaSig() !== this._entrySig && !this._exitArmed) {
    this._exitArmed = true;
    this._warn('저장하지 않은 변경이 있습니다 — 다시 누르면 저장하지 않고 나갑니다.');
    return;
  }
  this.scene.start(target);
};

GAME.BuildScene.prototype._arenaExit = function () {
  this._exitGuard('Versus');
};

GAME.BuildScene.prototype._save = function () {
  if (!this.placed.length) {
    this._warn('유닛을 최소 1기 배치해야 합니다.');
    return;
  }
  var name = window.prompt('배치도 이름을 입력하세요', '내 진형');
  if (!name) return;

  // 한 배치가 모든 영웅을 커버할 수는 없다 → 이 배치도가 **어떤 영웅을 상대로 짠 것인지**
  // 지정해 저장한다. 매칭할 때 그 영웅으로 오는 상대에게 우선 출전한다.
  var order = GAME.HERO_ORDER;
  var menu = order.map(function (k, i) {
    return (i + 1) + '. ' + GAME.HEROES[k].name + ' (' + GAME.HEROES[k].trait + ')';
  }).join('\n');
  var ans = window.prompt(
    '이 배치도는 어떤 영웅을 상대로 짠 것인가요?\n\n' + menu + '\n0. 특정 영웅 없음 (범용)\n\n번호 입력', '0');
  if (ans === null) return;
  var idx = parseInt(ans, 10);
  var vsHero = (idx >= 1 && idx <= order.length) ? order[idx - 1] : null;

  // 아래에서 만든 걸 위쪽(전투 기준)으로 뒤집고, 정규화 좌표로 저장
  var units = this.placed.map(function (p) {
    var n = GAME.Formations.normalize(p.x, GAME.mirrorY(p.y));
    return { type: p.type, nx: n.nx, ny: n.ny };
  });
  // ── 닉네임 당 배치도는 하나 (2026-07-29, 사용자 지시 3번) ─────────────────
  // 새로 저장하면 내가 전에 올린 것은 지운다. 여러 개를 두면 대전 목록이
  // 한 사람으로 채워지고, "누구의 진형을 뚫었나"가 의미를 잃는다.
  // ⚠ 작성자를 **계정 id** 로 적는다. 예전에는 `'나'` 라는 고정 문자열이라
  //   내 것과 남의 것을 구분할 수 없었고(arena.js 에 그 한계가 주석으로 남아 있었다),
  //   같은 닉네임을 묶을 방법도 없었다.
  var meId = GAME.Account.current() || '나';
  var mineOld = GAME.Formations.loadSaved().filter(function (f) {
    return !f.isAI && (f.author === meId || f.author === '나');
  });
  for (var mi = 0; mi < mineOld.length; mi++) GAME.Formations.remove(mineOld[mi].id);

  var newId = GAME.Formations.newId();
  GAME.Formations.save({
    id: newId,
    name: name.slice(0, 20),
    author: meId, isAI: false,
    tier: this.tier, budget: this.budget, v: 2,
    vsHero: vsHero,
    at: Date.now(),
    units: units
  });
  // 대전에서 '기지 만들기'로 들어왔으면 방금 저장한 배치도를 내 기지로 삼고 돌아간다.
  // 저장만 하고 끝내면 유저가 기지를 지정하는 단계를 또 밟아야 한다.
  if (this.pickBase && GAME.Arena) {
    GAME.Arena.setBase(newId);
    this.scene.start('Versus');
    return;
  }
  this.scene.start('Menu');
};

GAME.BuildScene.prototype.redraw = function () {
  var C = GAME.CONFIG.COLORS;
  var UI = GAME.UI;
  var g = this.g;
  var Iso = GAME.Iso;
  var P = GAME.CONFIG.PORTRAIT;
  var PH = GAME.CONFIG.PHONE;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var K = GAME.BuildScene.PHONE;
  var B = this.board;
  var i, def;
  g.clear();

  // 수성의 탑에서 들어왔으면 그 층의 분위기로 배치한다(싸울 자리를 미리 본다).
  // 그 외 배치는 중립(밴드 1 풀숲).
  UI.drawArena(g, { zones: true, floor: this.defendTower || 0, tier: 1 });

  // 보드 밖으로 삐져나온 아레나를 덮는다(폰 가로·PC 공통).
  if (B) {
    g.fillStyle(C.bg, 1);
    g.fillRect(0, 0, W, B.top);
    g.fillRect(0, B.bottom, W, H - B.bottom);
  }

  // 폰 가로 — 상단 바를 깐다.
  if (PH) {
    g.fillStyle(UI.COL.surface, 1);
    g.fillRect(0, 0, W, K.BAR_H);
    g.lineStyle(1, UI.COL.border, 1);
    g.lineBetween(0, K.BAR_H - 0.5, W, K.BAR_H - 0.5);
  }

  g.lineStyle(2, this.myColor, 0.85);
  g.strokeRect(this.zone.x + 2, Iso.toScreenY(this.zone.y) + 2,
    this.zone.w - 4, this.zone.h * Iso.TILT - 4);


  // 위쪽: 상대가 볼 모습(뒤집힌 미리보기)
  // ★ 보드 투영을 쓰는 프로필(폰 가로·PC)에서는 적진이 화면 밖이다 → 그리지 않는다.
  //   PC 에서 "유닛이 2배로 복사된다"는 신고의 진짜 원인이 이 미리보기였다
  //   (놓은 유닛이 mirrorY 자리에 반투명으로 한 번 더 그려졌다). 세로만 남긴다.
  if (!B) {
    for (i = 0; i < this.placed.length; i++) {
      var pv = this.placed[i];
      UI.drawUnit(g, GAME.UNITS[pv.type], pv.x, GAME.mirrorY(pv.y), C.strategist, 0.3, Math.PI / 2);
    }
  }

  // 아래쪽: 내가 놓은 것 (깊이 정렬)
  var sorted = this.placed.slice().sort(function (a, b) { return a.y - b.y; });
  var selPos = null;
  for (i = 0; i < sorted.length; i++) {
    var p = sorted[i];
    def = GAME.UNITS[p.type];
    // 지원 유닛의 영향 범위를 배치 중에 보여준다
    var FX = UI.FX;
    if (def.healRadius) { g.lineStyle(1.5, FX.healRing, 0.3); UI.groundCircle(g, p.x, p.y, def.healRadius); }
    if (def.buffRadius) { g.lineStyle(1.5, FX.buffRing, 0.3); UI.groundCircle(g, p.x, p.y, def.buffRadius); }
    if (def.isMine) { g.lineStyle(1.5, FX.mineRing, 0.5); UI.groundCircle(g, p.x, p.y, def.triggerRadius); }
    if (def.intercept) { g.lineStyle(1.5, FX.guardRing, 0.35); UI.groundCircle(g, p.x, p.y, def.intercept); }
    var pos = UI.drawUnit(g, def, p.x, p.y, this.myColor, 1, -Math.PI / 2);
    if (GAME.isAutoHit(def)) {
      g.lineStyle(2, FX.targetRing, 0.9);
      UI.groundCircle(g, p.x, p.y, def.radius + 7);
    }
    if (this.selected === p && pos) {
      UI.hpBar(g, pos.sx, pos.by, def.radius, 1, { width: Math.max(30, def.radius * 2.6) });
      selPos = { pos: pos, def: def };
    }
  }

  // 지면 원은 보드 밖으로 새어 나간다 — 약초꾼 치유 반경 150 은 TILT 1.0 에서 화면 150px 라
  // 구역 맨 아래에 놓으면 HUD 자리까지 내려온다. 유닛을 다 그린 **뒤에** 다시 덮는다.
  // (폰 가로는 아래를 팔레트 판이, 위를 상단 바가 이미 덮으므로 다시 칠하지 않는다.)
  if (B && !PH) {
    g.fillStyle(C.bg, 1);
    g.fillRect(0, 0, W, B.top);
    g.fillRect(0, B.bottom, W, H - B.bottom);
  }

  // ── ✕ 삭제 배지 ────────────────────────────────────────────────────────
  //  길게 누르기는 아무도 못 찾는다(그리고 폰에는 우클릭이 없다).
  //  선택한 유닛 머리 위에 눌러서 지우는 표적을 띄운다. 탭 두 번이면 삭제다.
  this.delBadge = null;
  if (selPos) {
    var br = P ? 15 : 17;
    var bx = selPos.pos.sx + selPos.def.radius + br * 0.8;
    var by = selPos.pos.by - selPos.def.radius * 1.9 - br * 0.6;
    // 화면(보드) 밖으로 나가지 않게 가둔다 — 바 뒤로 숨으면 "지울 수 없는 유닛"이 된다.
    var rect = Iso.screenRect();
    var topLimit = Math.max(rect.y, this.hudTopBand || 0);
    var botLimit = Math.min(rect.bottom, this.hudBotBand || rect.bottom);
    bx = Math.max(rect.x + br + 2, Math.min(rect.right - br - 2, bx));
    by = Math.max(topLimit + br + 2, Math.min(botLimit - br - 2, by));
    g.fillStyle(UI.COL.shadow === undefined ? 0x000000 : UI.COL.shadow, 0.3);
    g.fillCircle(bx, by + 2, br);
    g.fillStyle(C.hpBad, 1);
    g.fillCircle(bx, by, br);
    g.lineStyle(2, 0xffffff, 0.9);
    g.strokeCircle(bx, by, br);
    this.delBadge = { x: bx, y: by, r: br };
    this.delTxt.setPosition(bx, by).setVisible(true);
  } else {
    this.delTxt.setVisible(false);
  }

  // 폰 가로 — 팔레트 판은 유닛보다 **나중에** 깔아야 발밑 그림자가 안 새어 나온다
  if (PH) {
    g.fillStyle(UI.COL.surface, 1);
    g.fillRoundedRect(4, K.PAL_Y - 5, W - 8, K.PAL_H + 10, 12);
    g.lineStyle(1, UI.COL.border, 1);
    g.strokeRoundedRect(4.5, K.PAL_Y - 5, W - 9, K.PAL_H + 10, 12);
  }

  // ── 팔레트 ──────────────────────────────────────────────────────────────
  this.palG.clear();
  this.chipTagG.clear();
  var tagG = this.chipTagG;
  function tagPill(txt, fill) {
    if (!txt.visible) return;
    var b = txt.getBounds();
    var pad = 4, rr = (b.height + 2) / 2;
    tagG.fillStyle(fill, 0.88);
    tagG.fillRoundedRect(b.x - pad, b.y - 1, b.width + pad * 2, b.height + 2, rr);
  }
  for (var c = 0; c < this.chips.length; c++) {
    var chip = this.chips[c];
    var cdef = GAME.UNITS[chip.key];
    var on = chip.key === this.picked;
    var blocked = !!this._blockedReason(chip.key);
    var n = this._countOf(chip.key);

    chip.rect.setStrokeStyle(on ? 2 : 1, on ? this.myColor : UI.COL.border);
    chip.rect.setFillStyle(on ? UI.COL.surfaceHi : UI.COL.surfaceAlt);
    chip.rect.setAlpha(blocked && !on ? 0.5 : 1);

    // 예산이 모자라거나 개수 상한에 닿은 유닛은 **눌러보기 전에** 알 수 있어야 한다.
    // 예전에는 눌러야 경고가 떴다 — 그 왕복이 이 화면에서 가장 흔한 헛수고였다.
    chip.nameTxt.setColor(blocked ? C.textFaint : C.text).setAlpha(blocked ? 0.6 : 1);
    chip.costTxt.setColor(blocked ? C.danger : C.accent).setAlpha(blocked ? 0.85 : 1);
    //  ── 잠긴 칩 (2026-08-07) ────────────────────────────────────────────
    //  ⚠ **여기서 덮어써야 한다.** 이 루프가 매번 색과 글자를 다시 쓰므로 create 에서
    //    한 번 칠해 두면 첫 프레임에 지워진다.
    //  ⚠ **이름은 남긴다** — 무엇이 열리는지 모르면 목표가 안 된다. 자리 문제로
    //    이름을 회차로 바꿨다가, 그러면 "5회차"라는 이름의 유닛처럼 보여서 되돌렸다.
    //  ⚠ 값 대신 `🔒N` 을 적는다. 못 놓는 것에 가격을 적으면 "돈이 모자란가"로 읽힌다.
    //  (`chip.lock` 은 씬을 만들 때 한 번 정해지고 그 안에서 안 바뀐다 — 해금은
    //   회차를 깨야 일어나고 그때는 씬이 다시 만들어진다. 되돌리는 분기가 필요 없다.)
    if (chip.lock) {
      chip.costTxt.setText('🔒' + chip.lock).setColor(C.textDim).setAlpha(0.95);
      chip.nameTxt.setColor(C.textDim).setAlpha(0.75);
      chip.rect.setAlpha(on ? 1 : 0.42);
    }
    //  ⚠ `×2` 배지는 뺐다(2026-08-03 사용자 지시: "괜히 더 헷갈려").
    //    같은 화면에 인구 숫자가 이미 있어서 두 숫자가 서로 다른 뜻으로 읽혔다.
    chip.countTxt.setVisible(false).setText('');

    // 아이콘 받침 — **몸통이 아이보리 달걀이라 크림색 칩 위에서는 안 보인다.**
    // 전장 바닥색(arenaFill)을 깔아준다. 계란 아트는 원래 그 색 위에서 읽히도록 그려졌다.
    if (chip.tile) {
      this.palG.fillStyle(C.arenaFill, blocked ? 0.55 : 1);
      this.palG.fillRoundedRect(chip.tile.x, chip.tile.y, chip.tile.w, chip.tile.h, 6);
    }
    UI.drawUnitFlat(this.palG, cdef, chip.iconX, chip.iconY,
      this.myColor, blocked ? 0.45 : 1, chip.iconScale);

    // 아이콘을 크게 그렸으니 이름·숫자는 바닥을 깔아 자리를 확보한다
    var base = on ? UI.COL.surfaceHi : UI.COL.surfaceAlt;
    if (chip.bar) {
      tagG.fillStyle(base, 1);
      tagG.fillRoundedRect(chip.bar.x, chip.bar.y, chip.bar.w, chip.bar.h,
        { tl: 0, tr: 0, bl: 5, br: 5 });
    }
    tagPill(chip.costTxt, base);
    tagPill(chip.countTxt, base);
  }

  for (var b2 = 0; b2 < this.tierButtons.length; b2++) {
    var tb = this.tierButtons[b2];
    var active = tb.tier === this.tier;
    tb.ui.rect.setStrokeStyle(active ? 2 : 1, active ? this.myColor : UI.COL.borderUi);
    tb.ui.rect.setFillStyle(active ? UI.COL.surfaceHi : UI.COL.surfaceAlt);
  }


  // ── 예산 게이지 · 전력 요약 ─────────────────────────────────────────────
  var spent = this.spent();
  var left = this.budget - spent;
  this.budgetMeter.setColor(left <= 0 ? C.crit : this.myColor);
  this.budgetMeter.set(this.budget ? spent / this.budget : 0);
  this.budgetMeter.setText(PH
    ? (this._resName() + ' ' + GAME.BuildScene.popText(this._spentOf()) + '/' +
       GAME.BuildScene.popText(this._budgetOf()) + ' · 남은 ' +
       GAME.BuildScene.popText(this._budgetOf() - this._spentOf()) + ' · 유닛 ' + this.placed.length + '기')
    : (this._resName() + ' ' + spent + ' / ' + this.budget + '   ·   남은 ' + left
       + '   ·   유닛 ' + this.placed.length + '기'));

  if (this.powerText) this._fitLine(this.powerText, this._powerLine(P));

  // 상단 바 한 줄 — 수성의 탑이면 층·영웅, 아니면 지금 고른 유닛
  if (this.infoText) {
    var pdef = GAME.UNITS[this.picked];
    this._fitLine(this.infoText, this.defendTower
      ? ('탑 ' + this.defendTower + '층 · 오는 영웅 ' + this.dtHeroName)
      : ('선택  ' + pdef.name + ' · ' + pdef.cost), this.infoMaxW);
  }

  // 배치·삭제로 커서 아래의 것이 바뀌었을 수 있다 — 마우스를 안 움직여도 맞춰준다.
  // (지운 유닛의 툴팁이 남아 있으면 "지웠는데 아직 있다"로 읽힌다.)
  if (this.tip && typeof this._hoverX === 'number') this._hover(this._hoverX, this._hoverY);
  // 선택한 유닛이 바뀌면 강화 줄도 따라 바뀐다(대전에서만 보인다).
  this._syncUpgradeBar();
};
