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
    $('ready').onclick = onReady;
    $('quit').onclick = quitMatch;

    wireNet();
    watchDesync();
    show('menu');
    if (location.hostname !== 'joeltool.com' && Net.BASE === 'https://arena-room.gth3941.workers.dev') {
      $('preview-note').textContent = '미리보기에서는 봇 연습을 이용하세요. 기존 온라인 서버는 joeltool.com에서의 접속을 허용합니다.';
      $('preview-note').classList.remove('hide');
    }
    if (!Net.enabled()) $('go-pvp').textContent = '실시간 대전 (서버 미설정)';
  }

  // ── 연습 ──────────────────────────────────────────────────────────────────
  function startBot() {
    vsBot = true; mine = 0;
    beginMatch((Math.random() * 0xffffffff) >>> 0, '연습 상대');
  }

  // ── 로비 ──────────────────────────────────────────────────────────────────
  function openLobby() {
    if (!Net.enabled()) { UI.hint('방 서버 주소가 설정되지 않았습니다'); return; }
    show('lobby');
    listRooms();
  }

  function listRooms() {
    $('rooms').innerHTML = '<div class="muted">불러오는 중…</div>';
    Net.listRooms(function (err, res) {
      if (err) { $('rooms').innerHTML = '<div class="muted">목록을 못 불러왔습니다 — ' +
        esc(err.message) + '</div>'; return; }
      var rooms = res.rooms || [];
      if (!rooms.length) {
        //  ⚠ 빈 목록은 **고장이 아니다.** 그렇게 말해 주고, 할 수 있는 일을 옆에 둔다.
        $('rooms').innerHTML = '<div class="muted">지금 열린 방이 없습니다. ' +
          '방을 만들어 코드를 친구에게 보내거나, 연습으로 한 판 하세요.</div>';
        return;
      }
      $('rooms').innerHTML = '';
      rooms.slice(0, 12).forEach(function (r) {
        var b = document.createElement('button');
        b.className = 'room';
        b.innerHTML = '<span class="code">' + esc(r.code) + '</span>' +
                      '<span class="who">' + esc(r.name || r.host || '') + '</span>' +
                      '<span>' + (r.count || 1) + '/2</span>';
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
    Net.on.peers = function () { roomInfo(); };
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
        show('lobby'); listRooms();
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
  function beginMatch(seed, foeName) {
    UI.reset();
    show('game');
    BO.Sfx.play('turn');
    Match.start({
      seed: seed, mine: mine, vsBot: vsBot, foeName: foeName,
      on: {
        render: function (v, light) {
          UI.render(v, light);
          UI.clock(Match.timeLeft(), Match.TURN_MS, v.myTurn);
          if (!light && v.myTurn && v.ap === C.C.AP) BO.Sfx.play('turn');
        },
        events: function (evs, by) { UI.events(evs, by === mine); },
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
      (mine === 0 ? '당신은 위쪽 3줄' : '당신은 아래쪽 3줄') + '에서 시작합니다.', 'hot');
    UI.say('상대는 반대쪽 3줄 어딘가에 있습니다.', '');
    UI.status(vsBot ? '연습 — 봇과 대전' : Net.statusText(), '');
  }

  function doAct(a) {
    var err = Match.doAct(a);
    if (err) UI.hint(err);
    else BO.Sfx.wake();
  }

  function quitMatch() {
    if (!confirm('판을 포기하고 나갈까요?')) return;
    Match.stop();
    if (!vsBot) Net.leave();
    show('menu');
  }

  // ── 결과 ──────────────────────────────────────────────────────────────────
  function endScreen(win, title, detail) {
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
