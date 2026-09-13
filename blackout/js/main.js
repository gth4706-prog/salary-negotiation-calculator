window.BO = window.BO || {};

// ============================================================================
//  블랙아웃 — **화면 전환과 연결**. 메뉴 → 로비 → 방 → 대전 → 결과.
//
//  로비 설계의 전제는 에그워에서 배운 그대로다: **빈 방이 기본 상태다.**
//   · "아직 아무도 없습니다"를 숨기지 않는다. 공개 목록이 비어 있는 건 고장이 아니다.
//   · 상대를 기다리는 화면에서 **언제나 빠져나갈 길**을 준다.
//   · 혼자서도 지금 당장 한 판 할 수 있어야 한다(연습).
// ============================================================================
(function () {
  var C = BO.Core, Net = BO.Net, Match = BO.Match, UI = BO.UI;
  var scr = {}, myRoom = null, mine = 0, started = false, vsBot = false, lastResult = null;

  function $(id) { return document.getElementById(id); }
  function show(name) {
    Object.keys(scr).forEach(function (k) { scr[k].classList.toggle('hide', k !== name); });
    document.body.classList.toggle('in-game', name === 'game');   // PC 에서 전장만 넓게
  }

  // ── 시작 ──────────────────────────────────────────────────────────────────
  function boot() {
    ['menu', 'lobby', 'room', 'game', 'rules'].forEach(function (k) { scr[k] = $('s-' + k); });
    $('ver').textContent = BO.VERSION;

    UI.init({ view: function () { return Match.view(); },
              act: doAct, pass: function () { Match.pass(); } });

    $('nick').value = Net.nick();
    $('nick').onchange = function () { $('nick').value = Net.setNick(this.value); };

    $('go-pvp').onclick = function () { BO.Sfx.wake(); openLobby(); };
    $('go-bot').onclick = function () { BO.Sfx.wake(); startBot(); };
    $('go-tutorial').onclick = function () { BO.Sfx.wake(); startTutorial(); };
    $('go-rules').onclick = function () { show('rules'); };
    $('rules-back').onclick = function () { show('menu'); };
    $('mute').onclick = function () { this.textContent = BO.Sfx.toggle() ? '🔊' : '🔇'; };

    $('make-room').onclick = makeRoom;
    $('join-code').onclick = function () {
      var code = ($('code').value || '').trim().toUpperCase();
      if (code.length < 3) { UI.hint('방 코드를 입력하세요'); return; }
      enter(code);
    };
    $('refresh').onclick = listRooms;
    $('lobby-back').onclick = function () { show('menu'); };
    $('room-leave').onclick = function () { Net.leave(); show('lobby'); listRooms(); };
    $('share').onclick = shareRoom;
    $('ready').onclick = onReady;
    $('quit').onclick = quitMatch;

    wireNet();
    watchDesync();
    show('menu');

    //  ── 링크로 바로 입장 ─────────────────────────────────────────────────
    //  친구가 보낸 `?room=코드` 링크를 열면 메뉴를 건너뛰고 그 방으로 들어간다.
    //  폰에서 「코드를 받아 적고 → 게임 열고 → 로비 가서 → 입력」은 네 단계다.
    //  링크 하나면 한 번이다. 실제 대전이 성사되느냐는 여기서 갈린다.
    var qs = /[?&]room=([A-Za-z0-9]{3,8})/.exec(location.search || '');
    if (qs && Net.enabled()) { show('lobby'); enter(qs[1].toUpperCase()); }
    if (location.hostname !== 'joeltool.com' && Net.BASE === 'https://arena-room.gth3941.workers.dev') {
      $('preview-note').textContent = '미리보기에서는 봇 연습을 이용하세요. 기존 온라인 서버는 joeltool.com에서의 접속을 허용합니다.';
      $('preview-note').classList.remove('hide');
    }
    if (!Net.enabled()) $('go-pvp').textContent = '실시간 대전 (서버 미설정)';
  }

  // ── 연습 ──────────────────────────────────────────────────────────────────
  function startBot() {
    vsBot = true; mine = 0;
    BO.Tutorial.stop(); BO.Bot.setMode('normal');
    beginMatch((Math.random() * 0xffffffff) >>> 0, '연습 상대');
  }

  //  튜토리얼 = 가르치는 봇 + 시계 없음 + 고정 판. 안내판은 tutorial.js 가 띄운다.
  function startTutorial() {
    vsBot = true; mine = 0;
    BO.Bot.setMode('tutorial');
    beginMatch(BO.Tutorial.SEED, '연습 상대', { noTimer: true });
    BO.Tutorial.start({
      done: function () { Match.stop(); BO.Bot.setMode('normal'); show('menu'); if (Net.enabled()) openLobby(); },
      keepPlaying: function () { BO.Bot.setMode('normal'); UI.say('연습을 이어갑니다 — 이제 상대도 쏩니다', 'hot'); }
    });
  }

  // ── 로비 ──────────────────────────────────────────────────────────────────
  //  로비에 있는 동안만 10초마다 목록을 다시 읽는다. 모르는 사람과 붙으려면 «누가
  //  방을 열었는지»가 손대지 않아도 보여야 한다. 10초인 이유: 무료 플랜의 DO 요청
  //  한도(하루 10만) 안에서 사람 몇 명이 로비에 머물러도 넉넉한 간격이다.
  var lobbyPoll = null;
  function openLobby() {
    if (!Net.enabled()) { UI.hint('방 서버 주소가 설정되지 않았습니다'); return; }
    show('lobby');
    listRooms();
    if (lobbyPoll) clearInterval(lobbyPoll);
    lobbyPoll = setInterval(function () {
      if (scr.lobby.classList.contains('hide') || document.visibilityState !== 'visible') return;
      listRooms();
    }, 10000);
  }

  function listRooms() {
    $('rooms').innerHTML = '<div class="muted">불러오는 중…</div>';
    Net.listRooms(function (err, res) {
      if (err) { $('rooms').innerHTML = '<div class="muted">목록을 못 불러왔습니다 — ' +
        esc(err.message) + '</div>'; $('rooms-count').textContent = ''; return; }
      var rooms = (res.rooms || []).slice();
      //  ⚠ 아무것도 숨기지 않는다. 우리 방을 앞에, 다른 게임 방은 뒤에 흐리게.
      //    (처음엔 mode 로 걸렀다가 실서버에서 방이 통째로 안 보였다.)
      rooms.sort(function (a, b) { return (b.ours ? 1 : 0) - (a.ours ? 1 : 0); });
      var ours = rooms.filter(function (r) { return r.ours; }).length;
      $('rooms-count').textContent = rooms.length
        ? '서버에 방 ' + rooms.length + '개 · 이 게임 ' + ours + '개'
        : '';
      if (/[?&]diag=1/.test(location.search)) {
        $('lobby-diag').classList.remove('hide');
        $('lobby-diag').textContent = JSON.stringify(res.raw).slice(0, 800);
      }
      if (!rooms.length) {
        //  ⚠ 빈 목록은 **고장이 아니다.** 그렇게 말해 주고, 할 수 있는 일을 옆에 둔다.
        $('rooms').innerHTML = '<div class="muted">지금 열린 방이 없습니다. ' +
          '방을 만들어 초대 링크를 친구에게 보내거나, 연습으로 한 판 하세요.</div>';
        return;
      }
      $('rooms').innerHTML = '';
      rooms.slice(0, 12).forEach(function (r) {
        var b = document.createElement('button');
        b.className = 'room' + (r.ours ? '' : ' other');
        //  ⚠ 인원수 필드는 `members` 다 — 에그워 로비(rtlobby.js)가 그렇게 읽는다.
        var n = r.members != null ? r.members : (r.count != null ? r.count : 1);
        b.innerHTML = '<span class="code">' + esc(r.code) + '</span>' +
                      '<span class="who">' + esc(r.name || r.host || '') +
                      (r.ours ? '' : ' <em>(다른 게임의 방)</em>') + '</span>' +
                      '<span>' + n + '/2' + (n >= 2 ? ' · 진행 중' : '') + '</span>';
        b.onclick = function () { enter(r.code); };
        $('rooms').appendChild(b);
      });
    });
  }

  function makeRoom() {
    $('make-room').disabled = true;
    $('lobby-status').textContent = '방을 만드는 중…';
    Net.createRoom({}, function (err, room) {
      $('make-room').disabled = false;
      if (err) { $('lobby-status').textContent = '방을 못 만들었습니다 — ' + err.message; return; }
      $('lobby-status').textContent = '';
      enter(room.code);
    });
  }

  //  방 링크를 공유한다. 폰이면 공유 시트(카톡·문자), 아니면 클립보드.
  function shareRoom() {
    if (!myRoom) return;
    var url = location.origin + location.pathname + '?room=' + myRoom;
    var text = '블랙아웃 한 판 하자 — 방 코드 ' + myRoom;
    if (navigator.share) {
      navigator.share({ title: '블랙아웃', text: text, url: url })['catch'](function () {});
      return;
    }
    var done = function () { $('share').textContent = '복사됐습니다 ✓';
      setTimeout(function () { $('share').textContent = '초대 링크 복사'; }, 1800); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () { prompt('이 링크를 보내세요', url); });
    } else { prompt('이 링크를 보내세요', url); }
  }

  function enter(code) {
    vsBot = false; started = false;
    myRoom = code;
    show('room');
    $('room-code').textContent = code;
    $('room-status').textContent = '접속 중…';
    $('ready').disabled = true;
    $('ready').textContent = '준비';
    Net.join(code);
  }

  // ── 연결 이벤트 ───────────────────────────────────────────────────────────
  function wireNet() {
    Net.on.open  = function () { roomInfo(); };
    Net.on.peers = function (peers) { roomInfo(); watchLeave(peers); };
    Net.on.rtt   = function () { roomInfo(); };
    Net.on.rtc   = function () { roomInfo(); };
    Net.on.message = function (from, d) { Match.onMessage(from, d); };
    Net.on.reopen  = function () { roomInfo(); Match.onReopen(); };

    //  ⚠ `drop` 은 **판을 끝내지 않는다.** 폰 화면이 꺼지거나 탭을 바꾸면 늘 뜬다.
    Net.on.drop = function () {
      if (Match.active()) UI.status('연결이 끊겼습니다 — 다시 붙는 중…', 'warn');
      else $('room-status').textContent = '다시 붙는 중…';
    };
    Net.on.error = function (msg) {
      if (Match.active()) UI.status(String(msg), 'warn');
      else $('room-status').textContent = String(msg);
    };
    Net.on.close = function (info) {
      if (Match.active()) {
        UI.status('상대와 연결이 끊어졌습니다', 'bad');
        endScreen(null, '연결 끊김', info && info.byUser ? '방에서 나왔습니다.'
          : '상대와의 연결이 끊어졌습니다. 다시 방을 잡아 보세요.');
      } else {
        //  ⚠ 조용히 로비로 돌아가면 **왜** 튕겼는지 아무도 모른다. 실제 서버와 처음
        //    붙을 때 제일 필요한 게 이 한 줄이다 — 서버가 의도를 갖고 거절한 코드는
        //    사람이 읽을 말로 바꿔 보여 준다. 이 문구를 그대로 전달받으면 고칠 수 있다.
        var code = info && info.code, why = '';
        if (code === 4009) why = '이 방은 다른 버전의 게임 방입니다 (4009). 같은 주소에서 새로 만든 방으로 들어가세요.';
        else if (code === 4004) why = '없는 방 코드입니다 (4004). 코드를 다시 확인하세요.';
        else if (code === 4008) why = '같은 이름으로 다른 기기가 들어와 이 연결이 밀려났습니다 (4008). 이름을 바꿔 보세요.';
        else if (info && !info.byUser) why = '연결이 끊겼습니다' + (code ? ' (코드 ' + code + ')' : '') +
          (Net.lastError ? ' — ' + Net.lastError : '') + '. 다시 시도하세요.';
        show('lobby'); listRooms();
        if (why) $('lobby-status').textContent = why;
      }
    };
    //  서버가 씨앗과 시작을 정한다. 클라이언트가 정하면 둘이 다른 판을 연다.
    Net.on.start = function (msg) {
      if (started) return;
      started = true;
      //  방장이 0번(위 구역), 손님이 1번(아래 구역). 서버가 방장을 확정해 주므로
      //  둘이 같은 답을 낸다.
      mine = (Net.me === Net.host) ? 0 : 1;
      var foe = (Net.peers || []).filter(function (p) {
        return (p.id || p) !== Net.me;
      }).map(function (p) { return p.id || p; })[0];
      beginMatch(msg.seed >>> 0, foe || '상대');
    };
  }

  //  ── 대전 중 상대가 사라졌다 ────────────────────────────────────────────
  //  폰 화면이 꺼진 것일 수 있다(그러면 곧 돌아온다). 그래서 바로 끝내지 않는다.
  //  ⚠ 이게 없으면 상대가 앱을 닫아 버렸을 때 내 화면은 영원히 「상대 턴」이다.
  //
  //  ⚠ 처음엔 「서버가 1명이라 하는 순간 직결이 살아 있나」로 한 번 판단했는데
  //    그건 틀렸다 — 그 순간엔 살아 있다가 몇 초 뒤 죽으면 아무도 다시 안 본다
  //    (테스트가 실제로 그렇게 멈췄다). 서버가 1명이라 하는 **동안 계속** 지켜보며
  //    «상대가 없는 초»를 센다. 직결 핑에 답하면 0으로 되돌리고, 30초가 쌓이면 끝낸다.
  var leaveTimer = null, LEAVE_SEC = 30;
  function watchLeave(peers) {
    if (!Match.active() || vsBot) { stopLeaveTimer(); return; }
    var n = (peers || Net.peers || []).length;
    if (n >= 2) { if (leaveTimer) { stopLeaveTimer(); UI.status('상대가 돌아왔습니다', 'ok'); } return; }
    if (leaveTimer) return;                       // 이미 지켜보는 중
    var absent = 0;
    leaveTimer = setInterval(function () {
      if (!Match.active()) { stopLeaveTimer(); return; }
      if ((Net.peers || []).length >= 2) { stopLeaveTimer(); UI.status('상대가 돌아왔습니다', 'ok'); return; }
      //  서버 소켓은 끊겼지만 직결로 핑이 오간다 — 상대는 있다. 세지 않는다.
      if (BO.Rtc.alive()) {
        if (absent > 0) UI.status('직결로 이어져 있습니다', 'ok');
        absent = 0; return;
      }
      absent++;
      if (absent < LEAVE_SEC) {
        UI.status('상대 연결이 끊겼습니다 — ' + (LEAVE_SEC - absent) + '초 안에 돌아오지 않으면 끝납니다', 'warn');
        return;
      }
      stopLeaveTimer();
      Match.stop();
      BO.Sfx.play('win');
      endScreen(true, '상대 퇴장', '상대가 ' + LEAVE_SEC + '초 안에 돌아오지 않아 판이 끝났습니다. 기권승입니다.');
    }, 1000);
  }
  function stopLeaveTimer() { if (leaveTimer) { clearInterval(leaveTimer); leaveTimer = null; } }

  function roomInfo() {
    if (Match.active()) { UI.status(Net.statusText(), Net.connected ? '' : 'warn'); return; }
    var n = (Net.peers || []).length;
    $('room-status').textContent = Net.statusText();
    $('ready').disabled = n < 2;
    $('room-hint').textContent = n < 2
      ? '이 코드를 상대에게 보내세요. 상대가 들어오면 [준비]가 켜집니다.'
      : '둘 다 [준비]를 누르면 시작합니다.';
  }

  function onReady() {
    $('ready').disabled = true;
    $('ready').textContent = '상대를 기다리는 중…';
    Net.setReady(true);
  }

  // ── 대전 ──────────────────────────────────────────────────────────────────
  function beginMatch(seed, foeName, extra) {
    stopLeaveTimer();
    UI.reset();
    show('game');
    BO.Sfx.play('turn');
    Match.start({
      seed: seed, mine: mine, vsBot: vsBot, foeName: foeName,
      noTimer: !!(extra && extra.noTimer),
      on: {
        render: function (v, light) {
          UI.render(v, light);
          UI.clock(Match.timeLeft(), Match.turnMs(), v.myTurn);
          if (!light && v.myTurn && v.ap === C.C.AP) BO.Sfx.play('turn');
          if (!light) BO.Tutorial.onRender(v);
        },
        events: function (evs, by) { UI.events(evs, by === mine); BO.Tutorial.onEvents(evs, by === mine); },
        status: function (t, k) { UI.status(t, k); },
        end: function (v) {
          var win = v.winner === -1 ? null : (v.winner === mine);
          BO.Sfx.play(win === null ? 'turn' : (win ? 'win' : 'lose'));
          endScreen(win, win === null ? '무승부' : (win ? '승리' : '패배'),
            v.reason === 'timeup'
              ? '제한 ' + v.maxTurns + '턴이 지났습니다. 체력 ' + v.me.hp + ' 대 ' + v.foeHp + '.'
              : (win ? '상대를 다섯 번 맞혔습니다.' : '다섯 번 맞았습니다.'));
        }
      }
    });
    UI.say('🔦 불이 꺼졌습니다. ' +
      (mine === 0 ? '당신은 위쪽 2줄' : '당신은 아래쪽 2줄') + '에서 시작합니다. 보이는 건 바라보는 쪽뿐.', 'hot');
    UI.say('상대는 반대쪽 2줄 어딘가에 있습니다. 야광 페인트로 어둠을 긁어내세요.', '');
    UI.status(vsBot ? '연습 — 봇과 대전' : Net.statusText(), '');
  }

  function doAct(a) {
    var err = Match.doAct(a);
    if (err) UI.hint(err);
    else BO.Sfx.wake();
  }

  function quitMatch() {
    if (!confirm('판을 포기하고 나갈까요?')) return;
    stopLeaveTimer();
    BO.Tutorial.stop(); BO.Bot.setMode('normal');
    Match.stop();
    if (!vsBot) Net.leave();
    show('menu');
  }

  // ── 결과 ──────────────────────────────────────────────────────────────────
  function endScreen(win, title, detail) {
    stopLeaveTimer();
    BO.Tutorial.stop(); BO.Bot.setMode('normal');
    lastResult = win;
    var over = $('over');
    over.classList.remove('hide');
    $('over-title').textContent = title;
    $('over-title').className = 'big ' + (win === null ? '' : (win ? 'win' : 'lose'));
    $('over-detail').textContent = detail || '';
    $('over-again').textContent = vsBot ? '한 판 더' : '한 판 더 (준비)';
    $('over-again').onclick = function () {
      over.classList.add('hide');
      Match.stop();
      if (vsBot) { startBot(); return; }
      //  재대결: 둘 다 다시 준비를 누르면 서버가 새 씨앗으로 start 를 보낸다.
      started = false;
      show('room');
      $('ready').textContent = '준비';
      roomInfo();
      Net.setReady(true);
      $('ready').disabled = true;
      $('ready').textContent = '상대를 기다리는 중…';
    };
    $('over-menu').onclick = function () {
      over.classList.add('hide');
      Match.stop();
      if (!vsBot) Net.leave();
      show('menu');
    };
  }

  // ── 어긋남 안내 ───────────────────────────────────────────────────────────
  //  ⚠ 조용히 넘어가지 않는다. 두 사람이 서로 다른 판을 보면서 싸우는 것보다
  //    "어긋났습니다" 를 보여 주고 멈추는 편이 훨씬 낫다.
  function watchDesync() {
    $('resync').onclick = function () { Match.resync(); };
    setInterval(function () {
      var d = Match.desync();
      $('desync').classList.toggle('hide', !d);
      if (d) $('desync-why').textContent = d;
    }, 500);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
