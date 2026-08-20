window.GAME = window.GAME || {};

GAME.VERSION = 'v2.14';

// 주소에 ?admin=1 을 붙이면 닉네임 관리 화면에 들어갈 수 있다
GAME.isAdmin = /[?&]admin=1/.test(location.search || '');

window.addEventListener('load', function () {
  if (typeof Phaser === 'undefined') {
    document.getElementById('game').innerHTML =
      '<p style="color:#f0a86a;font-family:sans-serif;padding:2rem">' +
      'Phaser를 불러오지 못했습니다. 인터넷 연결을 확인하세요.</p>';
    return;
  }

  var badge = document.getElementById('ver');
  if (badge) badge.textContent = GAME.VERSION;

  // 저장된 테마 선택을 씬이 만들어지기 **전에** 적용한다.
  // 씬이 생긴 뒤에 바꾸면 이미 그려진 색이 남는다.
  if (GAME.UI && GAME.UI.bootTheme) GAME.UI.bootTheme();

  // 사운드 — 자동재생 정책 때문에 첫 사용자 입력에서 열린다(init 은 리스너만 건다)
  if (GAME.Sound) GAME.Sound.init();
  if (GAME.Music) GAME.Music.init();

  // ── 폰트가 도착한 뒤에 게임을 만든다 ──────────────────────────────────────
  //  Phaser 의 Text 는 캔버스에 **한 번 구워지고 다시 안 그려진다.** 웹폰트가 늦게
  //  오면 첫 화면 글자가 폴백 폰트로 굳어버린다(스크롤로 고칠 수 있는 DOM 과 다르다).
  //  그래서 만들기 전에 기다리되, **기다림에 상한을 둔다** — 구글이 막힌 망에서
  //  게임이 통째로 안 뜨는 것보다 폴백 폰트로라도 뜨는 게 낫다.
  //  config.js 가 스크립트 파싱 시점에 이미 요청을 걸어뒀으므로 보통은 즉시 통과한다.
  var fontGate = (GAME.Font && GAME.Font.ready) ? GAME.Font.ready : Promise.resolve('none');
  Promise.race([
    fontGate,
    new Promise(function (r) { setTimeout(function () { r('cap'); }, 1200); })
  ]).then(boot);

  function boot() {
  GAME.game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#101018',
    scale: {
      mode: Phaser.Scale.FIT,
      // 중앙정렬은 여기서만 한다 (CSS 에서 또 하면 이중으로 밀린다)
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME.CONFIG.WIDTH,
      height: GAME.CONFIG.HEIGHT,
      // expandParent 를 켜면 Phaser 가 부모(#game/body)를 캔버스에 맞춰 부풀리는데,
      // 모바일에서 그 되먹임 때문에 부모 높이가 실제 가시 영역보다 커져 캔버스가
      // 절반 크기로 위쪽에 떠 버렸다(실측 신고). CSS 로 #game 을 가시 뷰포트에
      // 못박았으므로 Phaser 는 부모를 건드리지 말고 그 크기에 맞추기만 하면 된다.
      expandParent: false
    },
    scene: [
      // 첫 화면 = 로딩(3초, 탭하면 건너뜀). 모바일 뷰포트가 정착할 시간을 벌어주기도 한다.
      GAME.LoadingScene,
      GAME.LoginScene,
      GAME.MenuScene,
      GAME.SelectScene,
      GAME.BuildScene,
      GAME.DraftScene,
      GAME.TowerScene,
      GAME.BattleScene,
      GAME.DefendScene,
      GAME.DefendTowerScene,
      GAME.VersusScene,
      GAME.RtLobbyScene,
      GAME.ResultScene,
      GAME.TowerShopScene,
      GAME.TowerLoadingScene,
      GAME.RankScene,
      GAME.AdminScene
    ]
  });

  // ── 화면 전환 애니메이션 + 씬 이력 (전역) ───────────────────────────────
  // 씬이 바뀔 때마다 짧게 페이드인시킨다. 씬 코드는 한 줄도 안 바꾸고
  // Phaser 의 씬 생명주기 이벤트에 한 번만 걸어 전 화면에 적용한다.
  // 값이 크면 조작이 굼떠 보인다 — 160ms 가 '부드럽지만 안 답답한' 선.
  //
  // 같은 훅에서 **뒤로가기용 씬 이력**도 쌓는다(`js/pwa.js` 의 GAME.Nav).
  // 씬마다 코드를 넣지 않는 이유가 그대로다 — 전이를 한 곳에서만 관찰한다.
  (function () {
    var FADE = 160;
    GAME.game.events.on('ready', function () { hook(); });
    function hook() {
      GAME.game.scene.scenes.forEach(function (sc) {
        if (sc.__fadeHooked) return;
        sc.__fadeHooked = true;
        sc.events.on('create', function () {
          if (sc.cameras && sc.cameras.main) sc.cameras.main.fadeIn(FADE, 0, 0, 0);
          if (GAME.Nav) GAME.Nav.onScene(sc);
        });
      });
    }
    hook();
  })();

  // 설치본(standalone)에서만 하드웨어 뒤로가기를 가로챈다.
  // 일반 브라우저 탭에서는 아무것도 하지 않는다 — 켜면 사이트를 못 떠나는 함정이 된다.
  if (GAME.Nav) GAME.Nav.enable();
  }   // ── boot() 끝 ──

  // ?diag=1 진단 오버레이 — 실기기(폰) 값을 눈으로 받기 위한 것.
  //   평상시엔 만들지 않는다. 실측 신고(캔버스가 작게 뜬다)의 원인을 폰에서 직접
  //   확인하려고, innerW/H · clientW/H · DPR · isPortrait · 설계 W×H · 캔버스 실제 px
  //   (getBoundingClientRect) · fitScale 을 화면 좌상단에 실시간으로 띄운다.
  var diag = /[?&]diag=1/.test(location.search || '') ? (function () {
    var el = document.createElement('div');
    el.id = 'diag';
    el.style.cssText =
      'position:fixed;top:0;left:0;z-index:9999;margin:4px;padding:6px 8px;' +
      'font:11px/1.65 ui-monospace,Menlo,Consolas,monospace;white-space:pre;' +
      'color:#7ef0d0;background:rgba(8,8,14,0.82);border:1px solid #35d0a5;' +
      'border-radius:6px;pointer-events:none;max-width:60vw;';
    document.body.appendChild(el);
    return el;
  })() : null;

  function updateDiag() {
    if (!diag) return;
    var d = document.documentElement || {};
    var cv = document.querySelector('#game canvas');
    var r = cv ? cv.getBoundingClientRect() : { width: 0, height: 0, left: 0, top: 0 };
    var iw = window.innerWidth, ih = window.innerHeight;
    var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
    var fit = Math.min(iw / W, ih / H);
    diag.textContent =
      'ver ' + GAME.VERSION + '  ' + GAME.CONFIG.PROFILE +
        '  P=' + GAME.CONFIG.PORTRAIT + ' S=' + GAME.CONFIG.SMALL + '\n' +
      // 프로필 판별이 틀리면 화면이 통째로 어긋난다 → 판별에 쓴 입력값을 그대로 노출한다.
      'touch   ' + GAME.isTouch + '  coarse=' +
        !(window.matchMedia && window.matchMedia('(pointer: fine)').matches) + '\n' +
      'screen  ' + ((screen && screen.width) || 0) + ' x ' + ((screen && screen.height) || 0) + '\n' +
      'inner   ' + iw + ' x ' + ih + '\n' +
      'client  ' + (d.clientWidth || 0) + ' x ' + (d.clientHeight || 0) + '\n' +
      'dpr     ' + (window.devicePixelRatio || 1) + '\n' +
      'design  ' + W + ' x ' + H + '\n' +
      'canvas  ' + Math.round(r.width) + ' x ' + Math.round(r.height) +
        '  @' + Math.round(r.left) + ',' + Math.round(r.top) + '\n' +
      'fill    ' + Math.round(r.width / iw * 100) + '% x ' + Math.round(r.height / ih * 100) + '%\n' +
      'fitScale ' + fit.toFixed(3) + '\n' +
      //  ── 랭킹 서버 (2026-08-05) ────────────────────────────────────────────
      //  "아이폰에서 서버 랭킹에 연결이 안돼" 를 **그 아이폰에서** 확인하기 위한 두 줄.
      //  이 값이 없으면 원격 진단이 불가능하다 — 안 되는 기기가 내 손에 없기 때문에
      //  지금까지 추측(서드파티 차단? CORS? 타임아웃?)만 늘어놨다.
      //  · api    지금 어느 경로로 붙었나. `/api` 면 같은 오리진(라우트가 살아 있다),
      //           `https://arena-api...` 면 예전 주소로 되돌아간 것이다.
      //  · apiErr 마지막 실패 사유. '경로 없음'·'응답 없음(8000ms 초과)'·'연결 실패' 를
      //           구분해서 보여 준다 — 셋의 원인이 서로 다르다.
      'api     ' + (GAME.Api ? GAME.Api.activeBase() : '-') + '\n' +
      'apiErr  ' + ((GAME.Api && GAME.Api.lastError) || '-') + '\n' +
      //  ── 프레임 (2026-08-07) ───────────────────────────────────────────────
      //  이 PC 로는 실사용자 프레임을 못 잰다(vsync 로 창이 1fps 로 스로틀된다 —
      //  CLAUDE.md). 그래서 렉 조사가 계속 "정황상 괜찮다"에서 멈췄다.
      //  **재는 자리를 사람 손에 쥐어 준다** — 폰에서 `?diag=1` 로 열고 난전을 한 판
      //  치른 뒤 이 줄을 읽으면, 추측 없이 어디를 깎을지 정할 수 있다.
      //  p95·최악을 같이 내는 이유: 평균은 스톨을 숨긴다(이 저장소가 이미 겪은 것 —
      //  "느린 프레임의 부하 지표가 평균과 같다"였다).
      'frame   ' + FrameMeter.line() + '\n' +
      //  ── 입력 (2026-08-20) ────────────────────────────────────────────────
      //  "조이스틱은 움직이는데 캐릭터가 안 움직인다"(영상 신고)를 **그 기기에서**
      //  가르기 위한 줄. 스틱값·이동속도·묶임·히트스톱이 그 순간 무엇이었는지가
      //  전부 여기 나온다 — 시뮬은 헤드리스 실측으로 결백이 확인된 상태다.
      'input   ' + (function () {
        try {
          var sc = GAME.game && GAME.game.scene && GAME.game.scene.getScene('Battle');
          if (!sc || !sc.scene.isActive() || !sc.hero) return '-';
          var p = sc.pad && sc.pad.stick;
          return 'stick=' + (p ? (p.dx.toFixed(2) + ',' + p.dy.toFixed(2) + (p.active ? '*' : '')) : 'none') +
                 ' spd=' + Math.round(GAME.Combat.effSpeed(sc.hero)) +
                 ' root=' + Math.max(0, Math.round(sc.hero.rootedFor || 0)) +
                 ' stop=' + Math.max(0, Math.round(sc._hitStop || 0)) +
                 ' armed=' + ((sc.ctrl && sc.ctrl.armedSkill) || '-') +
                 ' pos=' + Math.round(sc.hero.x) + ',' + Math.round(sc.hero.y);
        } catch (e) { return 'err'; }
      })();
  }

  // ── 프레임 계측기 — `?diag=1` 일 때만 돈다 ────────────────────────────────
  //  ⚠ 꺼져 있으면 **비용이 정확히 0** 이다(rAF 조차 안 건다). 계측이 게임에 남으면
  //    그게 다음 사람의 함정이 된다는 이 저장소 규율(`tools/stall-probe.js`)을 지킨다.
  //  ⚠ Phaser 의 loop 에 끼어들지 않고 별도 rAF 로 **벽시계 간격**만 본다. 게임이
  //    멈춘 것(스톨)을 재려면 게임 밖에서 봐야 한다 — 안에서 재면 멈춘 동안은
  //    아무 표본도 안 남는다.
  var FrameMeter = (function () {
    var on = false, last = 0, n = 0, slow = 0, worst = 0;
    //  히스토그램으로 쌓는다(1ms 칸 × 200). 표본 배열을 계속 늘리면 그 자체가
    //  쓰레기를 만들어 재려던 것을 망친다.
    var H = new Uint32Array(201);
    function tick(t) {
      if (!on) return;
      if (last) {
        var dt = t - last;
        var b = dt < 0 ? 0 : (dt > 200 ? 200 : (dt | 0));
        H[b]++; n++;
        if (dt > 33.4) slow++;             // 30fps 미만 프레임
        if (dt > worst) worst = dt;
      }
      last = t;
      requestAnimationFrame(tick);
    }
    function pct(p) {
      if (!n) return 0;
      var need = n * p, acc = 0;
      for (var i = 0; i <= 200; i++) { acc += H[i]; if (acc >= need) return i; }
      return 200;
    }
    return {
      start: function () { if (on) return; on = true; requestAnimationFrame(tick); },
      reset: function () { H = new Uint32Array(201); n = 0; slow = 0; worst = 0; last = 0; },
      line: function () {
        if (!n) return '재는 중…';
        return 'p50 ' + pct(0.5) + 'ms · p95 ' + pct(0.95) + 'ms · 최악 ' +
               Math.round(worst) + 'ms · 30fps미만 ' +
               (slow / n * 100).toFixed(1) + '% (' + n + '프레임)';
      }
    };
  })();
  //  화면을 탭하면 다시 센다 — "지금부터 이 구간" 을 사람이 정할 수 있어야 한다.
  if (diag) {
    FrameMeter.start();
    window.addEventListener('pointerdown', function () { FrameMeter.reset(); }, true);
  }

  // 창 크기·방향이 바뀌면 다시 맞춘다.
  //
  // 모바일은 뷰포트가 '늦게' 정착한다 — 부팅 순간엔 주소창이 펼쳐져 있어서 보이는 높이가
  // 작고, 스크롤/로딩 뒤에 주소창이 접히며 높이가 커진다. 처음의 작은 값으로 fit 되면
  // 캔버스가 화면 한가운데 작게 떴다가, 뒤늦은 refit 에서야 커진다(실측 신고: "로딩 지나니 확대됨").
  //
  // 해법 둘:
  //  1) #game 을 **실제 보이는 뷰포트**(visualViewport)에 매번 맞춰 못박는다.
  //     CSS 의 100dvh 는 '주소창 접힌 최대 높이'라 주소창이 보일 땐 실제보다 커서 어긋난다.
  //  2) visualViewport 의 resize/scroll(=주소창 접힘 이벤트)에 바로 다시 맞추고,
  //     부팅 직후 ~3초간 크기 변화를 폴링해 즉시 따라잡는다.
  function pinGame() {
    var g = document.getElementById('game');
    if (!g) return;
    var vv = window.visualViewport;
    var w = vv ? Math.round(vv.width) : window.innerWidth;
    var h = vv ? Math.round(vv.height) : window.innerHeight;
    //  rot90(세로에서 게임을 90° 눕힘, js/rot90.js) — 레이아웃 상자는 가로세로를
    //  **바꿔** 잡아야 회전 후 화면을 꽉 채운다. 여기서 안 바꾸면 이 함수가
    //  rot90 의 크기를 매 리핏마다 도로 덮어쓴다(실제 충돌 지점).
    var rot = document.documentElement.classList.contains('rot90');
    g.style.width = (rot ? h : w) + 'px';
    g.style.height = (rot ? w : h) + 'px';
  }
  function refit() {
    pinGame();
    if (GAME.game && GAME.game.scale) GAME.game.scale.refresh();
    //  전투 배경은 성능 때문에 텍스처로 **한 번만 구워** 둔다(js/scenes/battle.js).
    //  화면 크기가 바뀌면 아레나 좌표가 달라지므로 다시 구워야 한다 —
    //  안 그러면 회전하거나 주소창이 접힐 때 배경만 옛 크기로 남는다.
    try {
      var bs = GAME.game && GAME.game.scene && GAME.game.scene.getScene('Battle');
      if (bs && bs._arenaBaked) {
        if (bs._arenaRT) { bs._arenaRT.destroy(); bs._arenaRT = null; }
        bs._arenaBaked = false;
      }
    } catch (e) { /* 씬이 아직 없으면 아무 일도 아니다 */ }
    updateDiag();
    try { checkSmallWindow(); } catch (e) {}
  }
  // ── 좁은 데스크톱 창 안내 (2026-08-03 QA 지적) ────────────────────────────
  //  PC 설계 크기가 1340×900 고정이고 Phaser 는 FIT 이라, 창이 작으면 **화면 전체가
  //  같은 비율로 줄어든다.** 1366×768 노트북(주소창 빼면 세로 ~650)에서 배율이
  //  0.72 까지 떨어져 가장 작은 글자가 11px 가 된다(QA 실측). 폰에는 "가로로
  //  돌려주세요" 안내가 있는데 데스크톱에는 아무 안내가 없었다.
  //
  //  ⚠ **브라우저 확대/축소는 해결책이 아니다.** FIT 캔버스는 CSS 픽셀이 줄면
  //    그만큼 배율이 올라가 물리적 글자 크기가 그대로다 — "축소해서 보세요"는
  //    틀린 안내다. 실제로 효과가 있는 것은 **전체화면**이다(브라우저 크롬이
  //    사라져 세로가 650 → 768 로 늘고 배율이 0.72 → 0.85 로 오른다).
  //
  //  설계 크기를 줄이는 방법도 있지만 그쪽은 **전장 크기가 바뀌어 회피 거리에
  //  영향**을 준다(이 저장소는 WORLD_SCALE 을 건드렸다 겪은 전례가 있다).
  //  그래서 게임 값은 손대지 않고 안내만 띄운다.
  var SMALL_KEY = 'asymgame.smallwin.dismissed';
  var smallBar = null;
  function fitScale() {
    var vv = window.visualViewport;
    var w = vv ? vv.width : window.innerWidth;
    var h = vv ? vv.height : window.innerHeight;
    return Math.min(w / GAME.CONFIG.WIDTH, h / GAME.CONFIG.HEIGHT);
  }
  function checkSmallWindow() {
    // 터치 기기는 이미 방향 안내가 담당한다 — 여기는 데스크톱만.
    if (GAME.isTouch) return;
    var dismissed = false;
    try { dismissed = !!GAME.Store.get(SMALL_KEY, false); } catch (e) {}
    //  가장 작은 글자(micro 15px)가 12.5px 밑으로 내려가면 알린다.
    var tooSmall = fitScale() * 15 < 12.5;
    if (!tooSmall || dismissed) {
      if (smallBar) { smallBar.remove(); smallBar = null; }
      return;
    }
    if (smallBar) return;
    smallBar = document.createElement('div');
    smallBar.style.cssText =
      'position:fixed;left:50%;transform:translateX(-50%);bottom:12px;z-index:9998;' +
      'display:flex;gap:10px;align-items:center;padding:9px 14px;border-radius:10px;' +
      'font:13px/1.4 system-ui,-apple-system,"Malgun Gothic",sans-serif;' +
      'color:#f4ead6;background:rgba(18,12,8,0.92);border:1px solid #6b5535;' +
      'box-shadow:0 3px 14px rgba(0,0,0,0.4);max-width:92vw;';
    var msg = document.createElement('span');
    msg.textContent = '창이 작아 글자가 작게 보입니다. 전체화면으로 보면 커집니다.';
    var go = document.createElement('button');
    go.textContent = '전체화면';
    go.style.cssText = 'cursor:pointer;border:0;border-radius:7px;padding:6px 12px;' +
      'font:inherit;font-weight:700;color:#1b1208;background:#ffbf5a;';
    go.onclick = function () {
      var el = document.documentElement;
      var fn = el.requestFullscreen || el.webkitRequestFullscreen;
      if (fn) { try { fn.call(el); } catch (e) {} }
    };
    var no = document.createElement('button');
    no.textContent = '괜찮아요';
    no.style.cssText = 'cursor:pointer;border:0;border-radius:7px;padding:6px 10px;' +
      'font:inherit;color:#d8c9ac;background:transparent;text-decoration:underline;';
    no.onclick = function () {
      try { GAME.Store.set(SMALL_KEY, true); } catch (e) {}
      if (smallBar) { smallBar.remove(); smallBar = null; }
    };
    smallBar.appendChild(msg); smallBar.appendChild(go); smallBar.appendChild(no);
    document.body.appendChild(smallBar);
  }

  window.__eggRefit = refit;   // rot90.js 가 회전 전환 직후 부른다
  window.addEventListener('resize', refit);
  window.addEventListener('orientationchange', function () { refit(); setTimeout(refit, 300); });
  window.addEventListener('pageshow', refit);
  window.addEventListener('scroll', refit, { passive: true });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refit(); });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', refit);
    window.visualViewport.addEventListener('scroll', refit);
  }
  // 부팅 직후 뷰포트가 정착할 때까지(주소창 접힘 등) 크기 변화를 감지해 즉시 다시 맞춘다.
  (function settle() {
    var lastW = -1, lastH = -1, until = Date.now() + 3000;
    (function tick() {
      var vv = window.visualViewport;
      var w = vv ? Math.round(vv.width) : window.innerWidth;
      var h = vv ? Math.round(vv.height) : window.innerHeight;
      if (w !== lastW || h !== lastH) { lastW = w; lastH = h; refit(); }
      if (Date.now() < until) setTimeout(tick, 100);
    })();
  })();
  if (diag) setInterval(updateDiag, 500);
});
