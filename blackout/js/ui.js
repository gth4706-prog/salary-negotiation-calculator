window.BO = window.BO || {};

// ============================================================================
//  블랙아웃 — **화면**. 규칙도 네트워크도 모른다.
//
//  ⚠ 여기서는 `Core.view(st, 나)` 가 내준 것만 그린다. 상태 객체를 직접 받지 않는다.
//    숨김 정보 게임에서 제일 흔한 사고가 «화면이 무심코 상대나 안 본 가구를 그려
//    버리는 것»인데, 받는 물건에 애초에 그게 없으면 그 사고가 구조적으로 안 난다.
//
//  ── v0.5 그림의 원리: 스크래치 아트 ────────────────────────────────────────
//  칸마다 층이 있다. 맨 아래 «그림»(바닥·가구 조각) → 그 위 «어둠»(fog) →
//  그 위 «야광 얼룩»(splat). 얼룩은 그림을 얼룩 모양으로 뚫어 보여 준다 — 검은
//  크레파스를 긁어내면 밑의 색이 나오듯. 어둠은 칸을 아느냐(known)·지금 보느냐(seen)에
//  따라 두께가 다르다. 불이 켜지면 어둠이 전부 걷힌다.
//
//  ── 조작은 「고르고 → 확정」이다 ─────────────────────────────────────────
//  이동이든 사격이든 방향키·터치로 **대상 칸을 먼저 짚고**, [확정]을 눌러야 행동한다.
//  같은 칸을 두 번 짚는 것도 확정으로 친다.
// ============================================================================
BO.UI = (function () {
  var C = BO.Core;
  var els = {}, cells = [], mode = 'move', sel = null, roomKey = '', lastFoeKey = '';
  var fogRects = [], beamRects = [], glowDot = null;

  function $(id) { return document.getElementById(id); }

  function init(handlers) {
    els.board = $('board'); els.log = $('log'); els.status = $('status');
    els.hpMe = $('hp-me'); els.hpFoe = $('hp-foe'); els.turn = $('turn-info');
    els.clock = $('clock'); els.clockBar = $('clock-bar'); els.ap = $('ap');
    els.modeMove = $('mode-move'); els.modeShoot = $('mode-shoot');
    els.confirm = $('confirm'); els.pass = $('pass'); els.pad = $('pad');
    els.sense = $('sense'); els.logToggle = $('log-toggle');
    els.toast = $('toast'); els.hurt = $('hurt');
    if (BO.SvgArt) BO.SvgArt.install(document.body);   // 내장 그림(얼룩 마스크·전등·바닥)을 CSS 변수로
    buildBoard(handlers);
    bindControls(handlers);
    BO.Art.globals();
    return els;
  }

  //  칸은 **한 번만** 만든다. 매 턴 innerHTML 을 새로 쓰면 애니메이션이 끊기고
  //  탭 도중에 DOM 이 갈려서 입력이 씹힌다.
  function buildBoard(h) {
    var W = C.C.W, H = C.C.H;
    els.board.innerHTML = '';
    els.board.style.gridTemplateColumns = 'repeat(' + W + ',1fr)';
    els.board.style.gridTemplateRows = 'repeat(' + H + ',1fr)';
    cells = [];
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var d = document.createElement('div');
      d.className = 'cell unknown';
      d.dataset.x = x; d.dataset.y = y;
      //  바닥 그림을 칸 단위로 잘라 붙일 때의 위치(art.js / rooms.css 의 has-floor)
      d.style.setProperty('--fx', (W > 1 ? x / (W - 1) * 100 : 0) + '%');
      d.style.setProperty('--fy', (H > 1 ? y / (H - 1) * 100 : 0) + '%');
      //  내장 마루: 3칸짜리 널빤지의 몇 번째 조각인가(줄마다 한 칸씩 어긋난다) · 톤 차이
      d.style.setProperty('--px', (((x + y) % 3) * 50) + '%');
      d.style.setProperty('--fb', (0.93 + ((x * 3 + y * 7) % 5) * 0.035).toFixed(3));
      //  얼룩은 세 겹: 빛(.splat, 글로우) > 모양(.shape, 얼룩 마스크) > 그림(.paint) + 윤곽(.edge)
      d.innerHTML = '<span class="art"></span><span class="fog"></span>' +
                    '<span class="splat hide"><i class="shape"><b class="paint"></b><b class="edge"></b></i></span>' +
                    '<span class="mark hide"></span><span class="lamp hide"></span>' +
                    '<span class="dir hide"></span><span class="ghost hide"></span><span class="reaction"></span>' +
                    '<span class="glowfx"></span>';
      (function (px, py, node) {
        node.addEventListener('click', function () { onTile(px, py, h); });
      })(x, y, d);
      els.board.appendChild(d);
      cells.push(d);
    }
    buildOverlays();
  }

  //  ── 어둠과 빛은 칸이 아니라 **한 장의 SVG** 로 ───────────────────────────
  //  칸마다 검은 사각형을 두면 안개가 격자무늬로 보인다. 사각형 64개를 한 SVG 에 넣고
  //  통째로 흐리면(blur) 가장자리가 부드러운 «안개»가 되고, 시야는 따뜻한 빛 웅덩이가
  //  된다. 컨셉의 스탠드 불빛이 이것이다. 격자선은 흐리면 안 되니 세 번째 SVG 에 따로.
  function buildOverlays() {
    var W = C.C.W, H = C.C.H, NS = 'http://www.w3.org/2000/svg';
    function mk(cls) {
      var v = document.createElementNS(NS, 'svg');
      v.setAttribute('viewBox', '0 0 ' + W + ' ' + H); v.setAttribute('preserveAspectRatio', 'none');
      v.setAttribute('class', cls); v.setAttribute('aria-hidden', 'true');
      return v;
    }
    function rect(svg, x, y, fill) {
      var q = document.createElementNS(NS, 'rect');
      //  가장자리 칸은 바깥으로 넉넉히 — 흐림이 격자 테두리 안쪽을 밝히지 않게
      var x0 = x === 0 ? -1 : x - 0.02, y0 = y === 0 ? -1 : y - 0.02;
      var x1 = x === W - 1 ? W + 1 : x + 1.02, y1 = y === H - 1 ? H + 1 : y + 1.02;
      q.setAttribute('x', x0); q.setAttribute('y', y0);
      q.setAttribute('width', x1 - x0); q.setAttribute('height', y1 - y0);
      q.setAttribute('fill', fill);
      svg.appendChild(q);
      return q;
    }
    var old = els.board.querySelectorAll('svg'); for (var i = 0; i < old.length; i++) els.board.removeChild(old[i]);
    els.fogsvg = mk('fogsvg'); els.beam = mk('beam'); els.grid = mk('gridsvg');
    fogRects = []; beamRects = [];
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      fogRects.push(rect(els.fogsvg, x, y, '#040507'));
      var b = rect(els.beam, x, y, '#ffd28a'); b.setAttribute('opacity', '0'); beamRects.push(b);
    }
    //  내 주위의 은은한 빛(손전등을 든 사람 주변은 조금 밝다)
    var defs = document.createElementNS(NS, 'defs');
    defs.innerHTML = '<radialGradient id="bo-pglow"><stop offset="0" stop-color="#ffe2b0" stop-opacity=".55"/>' +
                     '<stop offset=".55" stop-color="#ffd28a" stop-opacity=".18"/><stop offset="1" stop-color="#ffd28a" stop-opacity="0"/></radialGradient>';
    els.beam.appendChild(defs);
    glowDot = document.createElementNS(NS, 'circle');
    glowDot.setAttribute('r', '0.75');   // 내 주위 빛은 반 칸 남짓 — 어둠이 먼저다
    glowDot.setAttribute('fill', 'url(#bo-pglow)');
    els.beam.appendChild(glowDot);
    //  격자선 — 컨셉의 점선 칸. 어둠 위에 아주 옅게.
    var path = '';
    for (var gx = 1; gx < W; gx++) path += 'M' + gx + ' 0V' + H;
    for (var gy = 1; gy < H; gy++) path += 'M0 ' + gy + 'H' + W;
    var gp = document.createElementNS(NS, 'path');
    gp.setAttribute('d', path); gp.setAttribute('stroke', '#ffffff'); gp.setAttribute('stroke-opacity', '.09');
    gp.setAttribute('stroke-width', '1'); gp.setAttribute('stroke-dasharray', '0.09 0.07'); gp.setAttribute('fill', 'none');
    gp.setAttribute('vector-effect', 'non-scaling-stroke');   // 굵기는 화면 픽셀, 점선 간격은 칸 단위
    els.grid.appendChild(gp);
    els.board.appendChild(els.fogsvg); els.board.appendChild(els.beam); els.board.appendChild(els.grid);
  }

  function cellAt(x, y) { return cells[y * C.C.W + x]; }
  function tileOf(v, x, y) { return v.tiles[y * C.C.W + x]; }

  // ── 입력: 고르기 ──────────────────────────────────────────────────────────
  function onTile(x, y, h) {
    var v = h.view();
    if (!v || !v.myTurn) return;
    if (mode === 'move') {
      var d = dirTo(v.me, x, y);
      if (d == null) { flashHint('한 칸씩만 움직일 수 있습니다'); return; }
      if (v.legalDirs.indexOf(d) < 0) { flashHint('가구가 있는 칸 — 못 갑니다. 사격으로 칠할 수는 있습니다'); return; }
    } else if (x === v.me.x && y === v.me.y) { flashHint('제 발밑은 쏘지 않습니다'); return; }
    if (sel && sel.x === x && sel.y === y) { confirm(h); return; }   // 같은 칸 두 번 = 확정
    sel = { x: x, y: y };
    render(v);
  }

  //  방향키: 이동 모드면 «그쪽 옆 칸»을 고르고, 사격 모드면 조준점을 한 칸 옮긴다.
  function pad(d, h) {
    var v = h.view();
    if (!v || !v.myTurn) return;
    var from = (mode === 'move' || !sel) ? v.me : sel;
    var nx = from.x + C.DX[d], ny = from.y + C.DY[d];
    if (mode === 'move') {
      if (v.legalDirs.indexOf(d) < 0) { flashHint(C.inBoard(nx, ny) ? '가구가 있는 칸 — 못 갑니다' : '벽입니다'); return; }
    } else if (!C.inBoard(nx, ny)) { flashHint('격자 밖입니다'); return; }
    sel = { x: nx, y: ny };
    render(v);
  }

  // ── 입력: 확정 ────────────────────────────────────────────────────────────
  function confirm(h) {
    var v = h.view();
    if (!v || !v.myTurn) return;
    if (!sel) { flashHint(mode === 'move' ? '갈 칸을 먼저 고르세요' : '쏠 칸을 먼저 고르세요'); return; }
    var t = sel; sel = null;
    if (mode === 'move') {
      var d = dirTo(v.me, t.x, t.y);
      if (d == null) { render(v); return; }
      h.act(['m', d]);
    } else {
      if (t.x === v.me.x && t.y === v.me.y) { flashHint('제 발밑은 쏘지 않습니다'); render(v); return; }
      h.act(['s', t.x, t.y]);
    }
  }

  function dirTo(me, x, y) {
    for (var d = 0; d < 4; d++) if (me.x + C.DX[d] === x && me.y + C.DY[d] === y) return d;
    return null;
  }

  function setMode(m, h) {
    mode = m; sel = null;
    var v = h.view(); if (v) render(v);
  }

  function bindControls(h) {
    els.modeMove.onclick = function () { setMode('move', h); };
    els.modeShoot.onclick = function () { setMode('shoot', h); };
    els.confirm.onclick = function () { confirm(h); };
    els.pass.onclick = function () { sel = null; h.pass(); };
    for (var d = 0; d < 4; d++) (function (dir) {
      $('pad-' + dir).onclick = function () { pad(dir, h); };
    })(d);
    if (els.logToggle) els.logToggle.onclick = function () {
      var open = els.log.classList.toggle('open');
      els.logToggle.textContent = open ? '접기' : '더 보기';
    };
    //  키보드 — 방향키/WASD 고르기, Enter 확정, Space 모드 전환, Esc 취소.
    document.addEventListener('keydown', function (e) {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      var v = h.view(); if (!v || !v.myTurn) return;
      var k = e.key.toLowerCase(), d = null;
      if (k === 'arrowup' || k === 'w') d = 0;
      else if (k === 'arrowright' || k === 'd') d = 1;
      else if (k === 'arrowdown' || k === 's') d = 2;
      else if (k === 'arrowleft' || k === 'a') d = 3;
      if (d != null) { e.preventDefault(); pad(d, h); return; }
      if (k === ' ') { e.preventDefault(); setMode(mode === 'move' ? 'shoot' : 'move', h); }
      else if (k === 'enter') { e.preventDefault(); confirm(h); }
      else if (k === 'escape') { sel = null; render(v); }
    });
  }

  // ── 그리기 ────────────────────────────────────────────────────────────────
  function render(v, light) {
    if (!v) return;
    if (!v.myTurn) sel = null;             // 내 턴이 아니면 고른 것도 없다
    pips(els.hpMe, v.me.hp); pips(els.hpFoe, v.foeHp);
    els.turn.innerHTML = '<b>' + (v.over ? '판 종료' : (v.myTurn ? '내 턴' : '상대 턴')) + '</b>' +
      v.turn + ' / ' + v.maxTurns + '턴';

    var dots = '';
    for (var i = 0; i < C.C.AP; i++) dots += '<span class="dot' + (i < v.ap ? ' on' : '') + '"></span>';
    els.ap.innerHTML = (v.myTurn ? '행동력 ' : '상대 행동력 ') + dots +
      (v.me.painted ? ' <span class="glowing">· 신발에 야광 — 한 칸만 움직이면 발자국이 남는다</span>' : '');

    if (v.lit > 0) {
      els.sense.textContent = '💡 불이 켜졌다 — 방 전체가 보인다 (행동 ' + v.lit + '번 뒤 꺼짐)';
      els.sense.className = 'lit-badge';
    } else if (v.foe && v.foe.why === 'seen') {
      els.sense.textContent = '👀 시야에 상대가 있다!';
      els.sense.className = 'sense-badge';
    } else if (v.foe && v.foe.why === 'glow') {
      els.sense.textContent = '✨ 맞았다! 야광에 젖은 상대가 이 턴 동안 보인다';
      els.sense.className = 'sense-badge';
    } else {
      els.sense.textContent = v.sense
        ? '👂 인기척 — 바로 옆에 있다 (상대도 나를 느낀다)'
        : '어둠 · 바라보는 쪽만 보인다 · 인기척 없음';
      els.sense.className = 'sense-badge' + (v.sense ? '' : ' off');
    }

    els.modeMove.classList.toggle('on', mode === 'move');
    els.modeShoot.classList.toggle('on', mode === 'shoot');
    els.pass.textContent = v.ap === C.C.AP ? '턴 넘기기' : '남은 행동력 버리고 넘기기';

    var lock = !v.myTurn || v.over;
    els.pass.disabled = lock;
    els.modeMove.disabled = lock; els.modeShoot.disabled = lock;
    els.confirm.disabled = lock || !sel;
    els.confirm.textContent = mode === 'move' ? (sel ? '이동 확정' : '갈 칸을 고르세요')
                                              : (sel ? '발사' : '쏠 칸을 고르세요');
    els.confirm.classList.toggle('shoot', mode === 'shoot');
    for (var d = 0; d < 4; d++) {
      var b = $('pad-' + d);
      if (!b) continue;
      b.disabled = lock || (mode === 'move' && v.legalDirs.indexOf(d) < 0);
    }

    if (light) return;   // 시계만 도는 갱신 — 격자는 안 건드린다(깜빡임 방지)
    paintBoard(v);
  }

  function paintBoard(v) {
    if (roomKey !== v.room.id) {
      roomKey = v.room.id;
      els.board.setAttribute('data-room', v.room.id);
      els.board.setAttribute('aria-label', '어두운 방 전장');
      BO.Art.floor(els.board, v.room.id);
      BO.Art.floorEdgesBuiltin(els.board, v.room.id);
    }
    els.board.classList.toggle('moving', mode === 'move' && v.myTurn);
    els.board.classList.toggle('shooting', mode === 'shoot' && v.myTurn);
    els.board.classList.toggle('lit', v.lit > 0);
    var movable = {}, d;
    if (v.myTurn && mode === 'move') {
      for (d = 0; d < 4; d++) if (v.legalDirs.indexOf(d) >= 0)
        movable[(v.me.x + C.DX[d]) + ',' + (v.me.y + C.DY[d])] = 1;
    }
    var paint = {}, mark = {}, seen = {};
    v.paint.forEach(function (p) { paint[p.x + ',' + p.y] = p; });
    v.marks.forEach(function (m) { mark[m.x + ',' + m.y] = m; });
    v.seen.forEach(function (s) { seen[s.x + ',' + s.y] = 1; });

    //  상대가 새로 «보이게» 된 순간 — 발견을 알린다(놓치면 게임이 안 된다)
    var foeKey = v.foe ? v.foe.why + v.foe.x + ',' + v.foe.y : '';
    if (foeKey && foeKey !== lastFoeKey && (v.foe.why === 'seen' || v.foe.why === 'lit')) {
      if (!lastFoeKey || lastFoeKey.charAt(0) !== v.foe.why.charAt(0)) { toast('👀 상대 발견!', 'spot'); BO.Sfx.play('spot'); }
    }
    lastFoeKey = foeKey;

    for (var y = 0; y < C.C.H; y++) for (var x = 0; x < C.C.W; x++) {
      var key = x + ',' + y, c = cellAt(x, y), t = tileOf(v, x, y);
      var isMe = (x === v.me.x && y === v.me.y);
      var isFoe = !!(v.foe && v.foe.x === x && v.foe.y === y);
      var isSel = !!(sel && sel.x === x && sel.y === y);

      //  어둠의 두께: 모르는 칸 / 아는 칸(기억) / 지금 보는 칸
      c.classList.toggle('unknown', !t);
      c.classList.toggle('known', !!t && !seen[key]);
      c.classList.toggle('seen', !!seen[key]);
      c.classList.toggle('blocked', !!(t && !t.walk));
      var kind = t ? t.kind : '';
      if (c.dataset.kind !== kind) {
        if (c.dataset.kind) c.classList.remove('k-' + c.dataset.kind);
        c.dataset.kind = kind;
        if (kind) { c.classList.add('k-' + kind); c.classList.add('reveal'); }
        BO.Art.tile(c, t, v.room.id);
        var label = (x + 1) + ',' + (y + 1) + ' · ' + (!t ? '모르는 칸' :
          (t.kind === 'floor' ? '바닥' : t.name + (t.walk ? ' · 밟을 수 있다' : ' · 못 지나간다, 사격은 된다')));
        c.title = label; c.setAttribute('aria-label', label);
      }

      c.classList.toggle('me', isMe);
      c.classList.toggle('foe', isFoe);
      c.classList.toggle('foe-glow', isFoe && !!(v.foe.glow || v.foe.why === 'glow'));
      c.classList.toggle('foe-seen', isFoe && v.foe.why === 'seen');
      c.classList.toggle('foe-lit', isFoe && v.foe.why === 'lit');
      c.classList.toggle('painted', isMe && v.me.painted);
      c.classList.toggle('movable', !!movable[key]);
      c.classList.toggle('step', isSel && mode === 'move');    // 갈 칸
      c.classList.toggle('aim', isSel && mode === 'shoot');    // 쏠 칸
      c.classList.toggle('sensed', !!(v.sense && C.dist(x, y, v.me.x, v.me.y) <= v.senseR));

      //  어둠의 두께(안개 SVG) · 시야의 빛(빛 SVG)
      var fi = y * C.C.W + x;
      if (fogRects[fi]) fogRects[fi].setAttribute('opacity', v.lit > 0 ? '0' : (!t ? '1' : (seen[key] ? '0.05' : '0.84')));
      if (beamRects[fi]) beamRects[fi].setAttribute('opacity', seen[key] && v.lit <= 0 ? '0.17' : '0');

      var sp = c.children[2], sm = c.children[3], sn = c.children[4], sd = c.children[5], sg = c.children[6];
      var p = paint[key];
      if (p) {
        sp.className = 'splat' + (p.by === v.mine ? ' mine' : ' foe') +
          (p.hit ? ' hit' : '') + (p.age === 0 ? ' fresh' : '');
        sp.style.setProperty('--rot', ((x * 37 + y * 91) % 360) + 'deg');
        sp.style.setProperty('--sv', 'var(--splat-' + (1 + ((x * 7 + y * 13) % 4)) + ')');
        sp.style.setProperty('--splat', 'url(' + BO.Art.BASE + BO.Art.splat(x, y) + ')');
        sp.title = (p.by === v.mine ? '내' : '상대') + ' 페인트' + (p.hit ? ' · 여기서 맞았다' : '');
      } else sp.className = 'splat hide';

      var mk = mark[key];
      sm.className = 'mark' + (mk ? (mk.side === v.mine ? ' mine' : ' foe') : ' hide');
      if (mk) sm.title = (mk.side === v.mine ? '내' : '상대') + ' 발자국 — 여기서 발을 뗐다';

      var isLamp = !!(v.lamp && v.lamp.x === x && v.lamp.y === y);
      sn.className = 'lamp' + (isLamp ? (v.lit > 0 ? ' on' : '') : ' hide');

      //  내가 바라보는 방향 — 시야각이 어디로 열렸는지 한눈에
      sd.className = 'dir' + (isMe ? ' f' + v.me.face : ' hide');

      var ghost = v.foeSeen && v.foeSeen.x === x && v.foeSeen.y === y &&
                  (v.turn - v.foeSeen.turn) <= 3 && !isFoe;
      sg.className = 'ghost' + (ghost ? '' : ' hide');
      if (ghost) sg.textContent = '✖';
    }
    if (glowDot) {
      glowDot.setAttribute('cx', v.me.x + 0.5); glowDot.setAttribute('cy', v.me.y + 0.5);
      glowDot.setAttribute('opacity', v.lit > 0 ? '0' : '1');
    }
  }

  function pips(el, hp) {
    var s = '', was = el._hp;
    for (var i = 0; i < C.C.HP; i++) s += '<span class="pip' + (i < hp ? ' on' : (was != null && i < was ? ' lost' : '')) + '"></span>';
    el.innerHTML = el.dataset.label + s;
    el._hp = hp;
  }

  // ── 시계 ──────────────────────────────────────────────────────────────────
  function clock(msLeft, total, mine) {
    var r = Math.max(0, Math.min(1, msLeft / total));
    els.clockBar.style.width = (r * 100) + '%';
    els.clock.className = 'clock' + (mine ? (r < 0.3 ? ' warn' : '') : ' foe');
  }

  // ── 사건 → 기록 · 효과 ────────────────────────────────────────────────────
  //  ⚠ 「맞았는지 맞혔는지 모르겠다」(실서버 2판째). 타격은 **네 겹**으로 알린다:
  //    큰 글자(toast) · 화면 흔들림·번쩍임 · 소리 · 진동. 하나만으로는 놓친다.
  function events(evs, byMe) {
    evs.forEach(function (e) {
      if (e.k === 'hit' || e.k === 'miss') react(e.x, e.y, e.material || 'wood');
      var at = '(' + (e.x + 1) + ',' + (e.y + 1) + ')';
      if (e.k === 'hit') {
        if (byMe) {
          say('🎯 명중! ' + at + ' — 윤곽이 보인다, 한 발 더!', 'me');
          toast('명중!', 'hitme'); burst(e.x, e.y, 'me'); shake('sm');
          BO.Sfx.play('hit'); BO.Sfx.play('splat'); buzz([40]);
        } else {
          say('💥 피격! ' + at + ' 에서 맞았다 — 야광이 묻었다, 움직여라', 'foe');
          toast('맞았다! −1', 'hurt'); burst(e.x, e.y, 'foe'); shake('big'); hurtFlash(); jolt(e.x, e.y);
          BO.Sfx.play('hurt'); BO.Sfx.play('splat'); buzz([90, 50, 130]);
        }
      } else if (e.k === 'miss') {
        if (byMe) { say('· ' + at + ' 빗나감 — ' + kindName(e.kind) + '에 얼룩', ''); }
        else { say('상대가 ' + at + ' 을 쐈다 — 어딘가에서 한 발', 'foe'); flash(e.x, e.y); toast('어딘가에서 한 발', 'foeshot'); }
        BO.Sfx.play('shot'); BO.Sfx.play('splat');
      } else if (e.k === 'bump') {
        if (byMe) {
          say('🫨 쿵! ' + kindName(e.kind) + '에 부딪혔다 — 이제 그쪽이 보인다', 'hot');
          toast('쿵! ' + kindName(e.kind), 'bump'); shake('sm'); flash(e.x, e.y);
          BO.Sfx.play('bump'); buzz([30]);
        }
      } else if (e.k === 'lamp') {
        say(byMe ? '💡 불을 켰다! 상대는 (' + (e.fx + 1) + ',' + (e.fy + 1) + ') — 다음 행동 하나까지만 보인다'
                 : '💡 상대가 불을 켰다! 상대는 ' + at + ' — 내 위치도 드러났다', 'hot');
        toast(byMe ? '💡 불을 켰다' : '💡 상대가 불을 켰다', 'lamp');
        BO.Sfx.play('lamp');
      } else if (e.k === 'mark') {
        say(byMe ? '👣 내 발자국이 ' + at + ' 에 남았다' : '👣 상대 발자국 발견 ' + at, byMe ? 'foe' : 'me');
        if (!byMe) { toast('👣 발자국!', 'spot'); BO.Sfx.play('clue'); }
      } else if (e.k === 'step') {
        say('🎨 얼룩을 밟았다 — 야광이 묻어 상대에게 윤곽이 보인다. 다음 턴에 움직여라', 'hot');
        if (byMe) toast('얼룩을 밟았다', 'bump');
        BO.Sfx.play('clue');
      }
    });
  }

  function kindName(k) {
    return { floor: '바닥', desk: '책상', chair: '의자', cabinet: '수납장', papers: '서류', shelf: '책장',
             bed: '침대', nightstand: '협탁', rug: '러그', basket: '바구니', sofa: '소파', plant: '화분' }[k] || '무언가';
  }

  //  표적 칸에서만 나는 연출. 쏜 자리·이동·숨은 상대 어느 것도 여기 안 들어온다.
  function react(x, y, material) {
    var c = cellAt(x, y), fx = c.children[7];
    fx.className = 'reaction';
    void fx.offsetWidth;
    fx.className = 'reaction react-' + material;
  }
  function flash(x, y) { replay(cellAt(x, y), 'flash'); }
  function burst(x, y, who) { replay(cellAt(x, y), 'burst-' + who); }
  function jolt(x, y) { replay(cellAt(x, y), 'jolt'); }
  function shake(kind) { replay(els.board, kind === 'big' ? 'shake' : 'shake-sm'); }
  function hurtFlash() { if (els.hurt) replay(els.hurt, 'on'); }
  //  같은 효과가 연달아 터져도 다시 재생되게 — 클래스를 뗐다 붙인다(리플로우 한 번)
  function replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }
  function buzz(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {}
  }
  //  격자 한가운데 큰 글자. 한 줄만, 잠깐.
  function toast(text, cls) {
    if (!els.toast) return;
    els.toast.textContent = text;
    els.toast.className = 'toast ' + (cls || '');
    void els.toast.offsetWidth;
    els.toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { els.toast.classList.remove('show'); }, cls === 'hurt' || cls === 'hitme' ? 1100 : 850);
  }

  function say(text, cls) {
    var d = document.createElement('div');
    d.className = cls || '';
    d.textContent = text;
    els.log.appendChild(d);
    while (els.log.children.length > 60) els.log.removeChild(els.log.firstChild);
    els.log.scrollTop = els.log.scrollHeight;
  }

  function status(t, kind) {
    savedStatus = null;
    clearTimeout(flashHint._t);
    els.status.textContent = t || '';
    els.status.className = 'status ' + (kind || '');
  }

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
    els.log.innerHTML = ''; sel = null; mode = 'move'; roomKey = ''; lastFoeKey = '';
    els.hpMe._hp = null; els.hpFoe._hp = null;
    els.log.classList.remove('open');
    if (els.logToggle) els.logToggle.textContent = '더 보기';
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      if (c.dataset.kind) c.classList.remove('k-' + c.dataset.kind);
      c.dataset.kind = ''; c.className = 'cell unknown';
      c.style.removeProperty('--art');
    }
  }

  return { init: init, render: render, events: events, status: status, clock: clock,
           say: say, reset: reset, setMode: setMode, hint: flashHint, toast: toast,
           mode: function () { return mode; } };
})();
