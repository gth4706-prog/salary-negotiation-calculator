window.BO = window.BO || {};

// ============================================================================
//  블랙아웃 — **화면**. 규칙도 네트워크도 모른다.
//
//  ⚠ 여기서는 `Core.view(st, 나)` 가 내준 것만 그린다. 상태 객체를 직접 받지 않는다.
//    숨김 정보 게임에서 제일 흔한 사고가 «화면이 무심코 상대를 그려 버리는 것»인데,
//    받는 물건에 애초에 상대 좌표가 없으면 그 사고가 구조적으로 안 난다.
// ============================================================================
BO.UI = (function () {
  var C = BO.Core;
  var els = {}, cells = [], mode = 'move', aim = null, lastLog = 0, roomKey = '';

  function $(id) { return document.getElementById(id); }

  function init(handlers) {
    els.board = $('board'); els.log = $('log'); els.status = $('status');
    els.hpMe = $('hp-me'); els.hpFoe = $('hp-foe'); els.turn = $('turn-info');
    els.clock = $('clock'); els.clockBar = $('clock-bar'); els.ap = $('ap');
    els.modeMove = $('mode-move'); els.modeShoot = $('mode-shoot');
    els.fire = $('fire'); els.pass = $('pass'); els.pad = $('pad');
    els.sense = $('sense');
    buildBoard(handlers);
    bindControls(handlers);
    return els;
  }

  //  칸 100개는 **한 번만** 만든다. 매 턴 innerHTML 을 새로 쓰면 애니메이션이 끊기고
  //  탭 도중에 DOM 이 갈려서 입력이 씹힌다.
  function buildBoard(h) {
    els.board.innerHTML = '';
    cells = [];
    for (var y = 0; y < C.C.H; y++) for (var x = 0; x < C.C.W; x++) {
      var d = document.createElement('div');
      d.className = 'cell' + ((x + y) % 2 ? ' alt' : '');
      d.dataset.x = x; d.dataset.y = y;
      d.innerHTML = '<span class="paint hide"></span><span class="mark hide"></span>' +
                    '<span class="lamp hide"></span><span class="ghost hide"></span><span class="reaction"></span>';
      (function (px, py, node) {
        node.addEventListener('click', function () { onTile(px, py, h); });
      })(x, y, d);
      els.board.appendChild(d);
      cells.push(d);
    }
  }

  function cellAt(x, y) { return cells[y * C.C.W + x]; }

  // ── 입력 ──────────────────────────────────────────────────────────────────
  function onTile(x, y, h) {
    var v = h.view();
    if (!v || !v.myTurn) return;
    if (!BO.Rooms.inside(v.room, x, y)) { flashHint('여기는 방 밖입니다'); return; }
    if (mode === 'move') {
      if (!BO.Rooms.walkable(v.room, x, y)) { flashHint('가구는 걸어갈 수 없습니다 · 사격으로 맞혀보세요'); return; }
      var d = dirTo(v.me, x, y);
      if (d == null) { flashHint('한 칸씩만 움직일 수 있습니다'); return; }
      h.act(['m', d]);
      return;
    }
    //  사격: 한 번 누르면 조준, 같은 칸을 또 누르면 발사.
    //  ⚠ 한 번에 쏘게 하면 잘못 눌러 행동력을 날린다. 두 번 누르게 하면 신중한 사람이
    //    느려진다. 그래서 **같은 칸 두 번**이 곧 발사다 — 확신 있으면 톡톡, 아니면 보고.
    if (aim && aim.x === x && aim.y === y) { fire(h); return; }
    if (x === v.me.x && y === v.me.y) { flashHint('제 발밑은 쏘지 않습니다'); return; }
    aim = { x: x, y: y };
    render(v);
  }

  function fire(h) {
    if (!aim) { flashHint('쏠 칸을 먼저 고르세요'); return; }
    var t = aim; aim = null;
    h.act(['s', t.x, t.y]);
  }

  function dirTo(me, x, y) {
    for (var d = 0; d < 4; d++) if (me.x + C.DX[d] === x && me.y + C.DY[d] === y) return d;
    return null;
  }

  function setMode(m, h) {
    mode = m;
    if (m === 'move') aim = null;
    els.modeMove.classList.toggle('on', m === 'move');
    els.modeShoot.classList.toggle('on', m === 'shoot');
    els.fire.classList.toggle('hide', m !== 'shoot');
    els.pad.classList.toggle('hide', m !== 'move');
    var v = h.view(); if (v) render(v);
  }

  function bindControls(h) {
    els.modeMove.onclick = function () { setMode('move', h); };
    els.modeShoot.onclick = function () { setMode('shoot', h); };
    els.fire.onclick = function () { fire(h); };
    els.pass.onclick = function () { h.pass(); };
    for (var d = 0; d < 4; d++) (function (dir) {
      $('pad-' + dir).onclick = function () {
        var v = h.view(); if (!v || !v.myTurn) return;
        h.act(['m', dir]);
      };
    })(d);

    //  키보드 — 데스크톱에서 훨씬 빠르다. 방향키/WASD 이동, Space 로 모드, Enter 발사.
    document.addEventListener('keydown', function (e) {
      var v = h.view(); if (!v || !v.myTurn) return;
      var k = e.key.toLowerCase(), d = null;
      if (k === 'arrowup' || k === 'w') d = 0;
      else if (k === 'arrowright' || k === 'd') d = 1;
      else if (k === 'arrowdown' || k === 's') d = 2;
      else if (k === 'arrowleft' || k === 'a') d = 3;
      if (d != null) { e.preventDefault(); h.act(['m', d]); return; }
      if (k === ' ') { e.preventDefault(); setMode(mode === 'move' ? 'shoot' : 'move', h); }
      else if (k === 'enter') { e.preventDefault(); if (mode === 'shoot') fire(h); else h.pass(); }
    });
  }

  // ── 그리기 ────────────────────────────────────────────────────────────────
  function render(v, light) {
    if (!v) return;
    pips(els.hpMe, v.me.hp); pips(els.hpFoe, v.foeHp);
    els.turn.innerHTML = '<b>' + (v.over ? '판 종료' : (v.myTurn ? '내 턴' : '상대 턴')) + '</b>' +
      v.turn + ' / ' + v.maxTurns + '턴';

    var dots = '';
    for (var i = 0; i < C.C.AP; i++) dots += '<span class="dot' + (i < v.ap ? ' on' : '') + '"></span>';
    els.ap.innerHTML = (v.myTurn ? '행동력 ' : '상대 행동력 ') + dots +
      (v.me.painted ? ' <span style="color:var(--foe)">· 페인트 묻음</span>' : '');

    //  불이 켜졌다는 건 **둘 다** 보고 있다는 뜻이다. 그 사실을 크게 말해 준다.
    if (v.lit > 0) {
      els.sense.textContent = '💡 불이 켜졌다 — 서로가 보인다 (행동 ' + v.lit + '번 뒤 꺼짐)';
      els.sense.className = 'lit-badge';
    } else {
      //  인기척은 **양쪽 다** 느낀다 — 내가 들었으면 상대도 들었다는 뜻이다.
      els.sense.textContent = v.room.name + ' · 발자국을 찾아보세요';
      els.sense.className = 'sense-badge off';
    }

    els.modeMove.classList.toggle('on', mode === 'move');
    els.modeShoot.classList.toggle('on', mode === 'shoot');
    els.pass.textContent = v.ap === C.C.AP ? '턴 넘기기' : '남은 행동력 버리고 넘기기';

    //  ⚠ 상대 턴에는 조작부를 **눌리지 않는 모양으로** 만든다. 눌러도 아무 일이
    //    없게 막아 두는 것만으로는 부족하다 — 멀쩡해 보이는 버튼을 눌렀는데
    //    반응이 없으면 사람은 「고장났나?」 하고 또 누른다.
    var lock = !v.myTurn || v.over;
    els.pass.disabled = lock;
    els.fire.disabled = lock;
    els.modeMove.disabled = lock; els.modeShoot.disabled = lock;
    for (var d = 0; d < 4; d++) {
      var b = document.getElementById('pad-' + d);
      if (b) b.disabled = lock || v.legalDirs.indexOf(d) < 0;
    }

    if (light) return;   // 시계만 도는 갱신 — 격자는 안 건드린다(깜빡임 방지)
    paintBoard(v);
  }

  function paintBoard(v) {
    renderRoom(v.room);
    els.board.classList.toggle('moving', mode === 'move' && v.myTurn);
    els.board.classList.toggle('shooting', mode === 'shoot' && v.myTurn);
    var movable = {}, d;
    if (v.myTurn && mode === 'move') {
      for (d = 0; d < 4; d++) {
        var nx = v.me.x + C.DX[d], ny = v.me.y + C.DY[d];
        if (BO.Rooms.walkable(v.room, nx, ny)) movable[nx + ',' + ny] = 1;
      }
    }
    var paint = {}, mark = {};
    v.paint.forEach(function (p) { paint[p.x + ',' + p.y] = p; });
    v.marks.forEach(function (m) { mark[m.x + ',' + m.y] = m; });
    //  불이 켜져 있는 동안에만 상대가 보인다. 꺼져 있으면 v.foe 가 아예 null 이라
    //  화면이 그리고 싶어도 그릴 것이 없다(규칙 엔진이 안 준다).
    els.board.classList.toggle('lit', v.lit > 0);

    for (var y = 0; y < C.C.H; y++) for (var x = 0; x < C.C.W; x++) {
      var key = x + ',' + y, c = cellAt(x, y);
      var isMe = (x === v.me.x && y === v.me.y);
      c.classList.toggle('me', isMe);
      c.classList.toggle('foe', !!(v.foe && v.foe.x === x && v.foe.y === y));
      c.classList.toggle('painted', isMe && v.me.painted);
      c.classList.toggle('movable', !!movable[key]);
      c.classList.toggle('aim', !!(aim && aim.x === x && aim.y === y));
      //  인기척은 **내 주변 반경**을 은은하게 물들일 뿐 방향을 알려 주지 않는다.
      c.classList.toggle('sensed', !!(v.sense && C.dist(x, y, v.me.x, v.me.y) <= v.senseR));

      var sp = c.children[0], sm = c.children[1], sn = c.children[2], sg = c.children[3];
      var p = paint[key];
      sp.className = 'paint material-' + BO.Rooms.material(v.room, x, y) +
        (p ? (p.by === v.mine ? ' mine' : ' foe') + (p.hit ? ' hit' : '') : ' hide');
      if (p) {
        sp.style.opacity = 0.35 + 0.55 * (p.left / C.C.PAINT_TURNS);
        sp.style.setProperty('--b', blob(x, y));
        sp.title = '페인트 ' + p.left + '턴 남음';
      }
      var mk = mark[key];
      sm.className = 'mark' + (mk ? '' : ' hide');
      if (mk) {
        sm.textContent = '';
        sm.style.color = mk.side === v.mine ? 'var(--me)' : 'var(--foe)';
        sm.title = '발자국 ' + mk.left + '턴 남음';
        sm.style.opacity = 0.3 + 0.6 * (mk.left / C.C.MARK_TURNS);
        sm.style.filter = 'none';
      }
      var isLamp = !!(v.lamp && v.lamp.x === x && v.lamp.y === y);
      sn.className = 'lamp' + (isLamp ? (v.lit > 0 ? ' on' : '') : ' hide');
      if (isLamp) sn.textContent = v.lit > 0 ? '💡' : '🔘';

      //  마지막으로 상대가 «확실히» 있었던 자리.
      var seen = v.foeSeen && v.foeSeen.x === x && v.foeSeen.y === y &&
                 (v.turn - v.foeSeen.turn) <= 3;
      sg.className = 'ghost' + (seen ? '' : ' hide');
      if (seen) sg.textContent = '✖';
    }
  }

  function renderRoom(room) {
    if (roomKey === room.id) return;
    roomKey = room.id;
    els.board.setAttribute('data-room', room.id);
    els.board.setAttribute('aria-label', room.name + ' 전장');
    var old = els.board.querySelector('.furniture-layer');
    if (old) els.board.removeChild(old);
    var layer = document.createElement('div');
    layer.className = 'furniture-layer';
    layer.setAttribute('aria-hidden', 'true');
    room.objects.forEach(function (o) {
      var item = document.createElement('div');
      item.className = 'furniture ' + o.kind;
      item.style.left = (o.x * 10) + '%'; item.style.top = (o.y * 10) + '%';
      item.style.width = (o.w * 10) + '%'; item.style.height = (o.h * 10) + '%';
      item.innerHTML = '<i></i><b></b>';
      layer.appendChild(item);
    });
    els.board.appendChild(layer);
    for (var y = 0; y < C.C.H; y++) for (var x = 0; x < C.C.W; x++) {
      var c = cellAt(x, y), obj = BO.Rooms.objectAt(room, x, y);
      var inside = BO.Rooms.inside(room, x, y), walk = BO.Rooms.walkable(room, x, y);
      c.classList.toggle('outside', !inside);
      c.classList.toggle('blocked', inside && !walk);
      c.classList.toggle('rug-floor', !!(obj && obj.kind === 'rug'));
      var label = (x + 1) + ',' + (y + 1) + ' · ' +
        (!inside ? '방 밖' : obj ? obj.name + (walk ? ' · 이동 가능' : ' · 이동 불가, 사격 가능') : '바닥 · 이동 가능');
      c.title = label; c.setAttribute('aria-label', label);
    }
  }

  //  칸마다 다른 얼룩 모양 — 이미지 없이. 좌표로 정하니 다시 그려도 안 흔들린다.
  function blob(x, y) {
    var h = (x * 73856093) ^ (y * 19349663);
    function n(i) { return 30 + ((h >>> (i * 3)) % 45); }
    return n(0) + '% ' + n(1) + '% ' + n(2) + '% ' + n(3) + '% / ' +
           n(4) + '% ' + n(5) + '% ' + n(6) + '% ' + n(7) + '%';
  }

  function pips(el, hp) {
    var s = '';
    for (var i = 0; i < C.C.HP; i++) s += '<span class="pip' + (i < hp ? ' on' : '') + '"></span>';
    el.innerHTML = el.dataset.label + s;
  }

  // ── 시계 ──────────────────────────────────────────────────────────────────
  function clock(msLeft, total, mine) {
    var r = Math.max(0, Math.min(1, msLeft / total));
    els.clockBar.style.width = (r * 100) + '%';
    els.clock.className = 'clock' + (mine ? (r < 0.3 ? ' warn' : '') : ' foe');
  }

  // ── 사건 → 기록 · 효과 ────────────────────────────────────────────────────
  function events(evs, byMe) {
    evs.forEach(function (e) {
      if (e.k === 'hit' || e.k === 'miss') react(e.x, e.y, e.material || 'wood');
      var at = '(' + (e.x + 1) + ',' + (e.y + 1) + ')';
      if (e.k === 'hit') {
        say(byMe ? '🎯 명중! ' + at : '💥 피격! ' + at + ' 에서 맞았다', byMe ? 'me' : 'foe');
        flash(e.x, e.y); BO.Sfx.play(byMe ? 'hit' : 'hurt');
      } else if (e.k === 'miss') {
        say(byMe ? '· ' + at + ' 빗나감' : '상대가 ' + at + ' 을 쐈다', byMe ? '' : 'foe');
        BO.Sfx.play('shot');
      } else if (e.k === 'bump') {
        say('🫨 어둠 속에서 부딪혔다 — 서로 위치가 드러났다', 'hot');
        flash(e.x, e.y); BO.Sfx.play('bump');
      } else if (e.k === 'mark') {
        say(byMe ? '👣 내 발자국이 ' + at + ' 에 남았다' : '👣 상대 발자국 발견 ' + at,
            byMe ? 'foe' : 'me');
        if (!byMe) BO.Sfx.play('clue');
      } else if (e.k === 'lamp') {
        say(byMe ? '💡 불을 켰다! 상대는 (' + (e.fx + 1) + ',' + (e.fy + 1) + ') — 다음 행동 하나까지만 보인다'
                 : '💡 상대가 불을 켰다! 상대는 ' + at + ' — 내 위치도 드러났다', 'hot');
        BO.Sfx.play('lamp');
      } else if (e.k === 'step') {
        say('🎨 페인트를 밟았다 — 다음 턴에 한 칸만 움직이면 발자국이 남는다', 'hot');
        BO.Sfx.play('clue');
      }
    });
  }

  // Target-only animation. No source point, movement event or hidden occupant
  // enters this effect. Papers are decorative: no extra hit cells or damage.
  function react(x, y, material) {
    var c = cellAt(x, y), fx = c.children[4];
    fx.className = 'reaction';
    void fx.offsetWidth;
    fx.className = 'reaction react-' + material;
  }

  function flash(x, y) {
    var c = cellAt(x, y);
    c.classList.remove('flash');
    void c.offsetWidth;            // 리플로우 — 같은 칸에 연속으로 터져도 다시 재생된다
    c.classList.add('flash');
  }

  function say(text, cls) {
    var d = document.createElement('div');
    d.className = cls || '';
    d.textContent = text;
    els.log.appendChild(d);
    while (els.log.children.length > 60) els.log.removeChild(els.log.firstChild);
    els.log.scrollTop = els.log.scrollHeight;
    lastLog = Date.now();
  }

  function status(t, kind) {
    savedStatus = null;            // 새 상태가 오면 잠깐 빌려 준 안내는 버린다
    clearTimeout(flashHint._t);
    els.status.textContent = t || '';
    els.status.className = 'status ' + (kind || '');
  }

  //  짧은 안내는 **상태줄을 잠깐 빌려 쓴다.** 줄을 따로 두면 낮은 화면에서 격자가
  //  그만큼 작아진다 — 늘 비어 있는 줄에 세로 공간을 낼 만큼 중요하지 않다.
  var savedStatus = null;
  function flashHint(t) {
    if (savedStatus === null) savedStatus = { t: els.status.textContent, c: els.status.className };
    els.status.textContent = t;
    els.status.className = 'status warn';
    clearTimeout(flashHint._t);
    flashHint._t = setTimeout(function () {
      if (savedStatus) { els.status.textContent = savedStatus.t; els.status.className = savedStatus.c; }
      savedStatus = null;
    }, 1600);
  }

  function reset() {
    els.log.innerHTML = ''; aim = null; mode = 'move'; roomKey = '';
    els.fire.classList.add('hide'); els.pad.classList.remove('hide');
  }

  return { init: init, render: render, events: events, status: status, clock: clock,
           say: say, reset: reset, setMode: setMode, hint: flashHint };
})();
