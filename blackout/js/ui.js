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
    els.modeMove = $('mode-move'); els.modeShoot = $('mode-shoot'); els.modeItem = $('mode-item');
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
      //  얼룩 = 어둠을 긁어낸 창. 글로우(.splat) > 번진 테(.halo) + 마스크(.shape) >
      //  그림(.pic) + 페인트 색(.tint) + 윤곽선(.edge). 자세한 건 css/rooms.css.
      d.innerHTML = '<span class="art"></span><span class="fog"></span>' +
                    '<span class="splat hide"><i class="halo"></i>' +
                    '<i class="shape"><b class="pic"></b><b class="tint"></b><b class="edge"></b></i></span>' +
                    '<span class="mark hide"><i></i></span><span class="lamp hide"></span>' +
                    '<span class="dir hide"></span><span class="ghost hide"></span><span class="reaction"></span>' +
                    '<span class="glowfx"></span><span class="memo"></span>' +
                    '<span class="box hide"><i></i></span>';
      //  ⚠ 아래 그리기 코드가 층을 **번호로** 찾는다(children[7] 등). 새 층은 반드시
      //    끝에 붙이고, 끝에 붙인 것은 번호 대신 이름표로 잡아 둔다.
      d._box = d.lastChild;
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
    } else if (mode === 'item') {
      if (!v.item) { flashHint('가진 도구가 없습니다'); return; }
      //  반창고는 겨냥이 없다 — 어디를 짚어도 제자리에서 쓴다.
      if (v.item === 'heal') { x = v.me.x; y = v.me.y; }
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
    } else if (mode === 'item' && v.item === 'heal') { flashHint('반창고는 제자리에서 씁니다 — [쓰기]'); return; }
    else if (!C.inBoard(nx, ny)) { flashHint('격자 밖입니다'); return; }
    sel = { x: nx, y: ny };
    render(v);
  }

  // ── 입력: 확정 ────────────────────────────────────────────────────────────
  function confirm(h) {
    var v = h.view();
    if (!v || !v.myTurn) return;
    if (!sel) { flashHint(mode === 'move' ? '갈 칸을 먼저 고르세요'
                        : (mode === 'item' ? '던질 칸을 먼저 고르세요' : '쏠 칸을 먼저 고르세요')); return; }
    var t = sel; sel = null;
    if (mode === 'move') {
      var d = dirTo(v.me, t.x, t.y);
      if (d == null) { render(v); return; }
      h.act(['m', d]);
    } else if (mode === 'item') {
      if (!v.item) { flashHint('가진 도구가 없습니다'); render(v); return; }
      h.act(['u', t.x, t.y]);
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
    var v = h.view();
    if (m === 'item' && v && !v.item) { flashHint('가진 도구가 없습니다 — 📦 상자를 밟아 주우세요'); return; }
    mode = m; sel = null;
    //  반창고는 겨냥할 게 없다. 바로 제자리를 골라 두고 [쓰기] 한 번이면 끝.
    if (m === 'item' && v && v.item === 'heal') sel = { x: v.me.x, y: v.me.y };
    if (v) render(v);
  }

  function bindControls(h) {
    els.modeMove.onclick = function () { setMode('move', h); };
    els.modeShoot.onclick = function () { setMode('shoot', h); };
    els.modeItem.onclick = function () { setMode('item', h); };
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
      if (k === ' ') {
        e.preventDefault();
        //  이동 → 사격 → (도구가 있으면) 도구 → 이동
        setMode(mode === 'move' ? 'shoot' : (mode === 'shoot' && v.item ? 'item' : 'move'), h);
      }
      else if (k === 'e') { e.preventDefault(); setMode('item', h); }
      else if (k === 'enter') { e.preventDefault(); confirm(h); }
      else if (k === 'escape') { sel = null; render(v); }
    });
  }

  // ── 그리기 ────────────────────────────────────────────────────────────────
  function render(v, light) {
    if (!v) return;
    if (!v.myTurn) sel = null;             // 내 턴이 아니면 고른 것도 없다
    //  도구를 써 버렸으면 손이 비었다 — 모드를 이동으로 되돌린다(빈손 모드는 함정이다)
    if (mode === 'item' && !v.item) { mode = 'move'; sel = null; }
    pips(els.hpMe, v.me.hp); pips(els.hpFoe, v.foeHp);
    els.turn.innerHTML = '<b>' + (v.over ? '판 종료' : (v.myTurn ? '내 턴' : '상대 턴')) + '</b>' +
      v.turn + ' / ' + v.maxTurns + '턴';

    var dots = '';
    for (var i = 0; i < C.C.AP; i++) dots += '<span class="dot' + (i < v.ap ? ' on' : '') + '"></span>';
    var it = v.item ? C.ITEMS[v.item] : null;
    els.ap.innerHTML = (v.myTurn ? '행동력 ' : '상대 행동력 ') + dots +
      (it ? ' <span class="held">· ' + it.icon + ' ' + it.name + ' — ' +
            (v.item === 'heal' && v.me.hp >= C.C.HP ? '체력이 가득이다. 버리면 다음 상자를 주울 수 있다' : it.tip) +
            '</span>' : '') +
      (v.me.painted ? ' <span class="glowing">· 신발이 젖었다 — 다음 걸음에 발자국이 찍힌다</span>' : '');

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
    els.modeItem.classList.toggle('on', mode === 'item');
    els.modeItem.classList.toggle('has', !!it);
    els.modeItem.textContent = it ? it.icon + ' ' + (it.short || it.name) : '📦 도구';
    els.modeItem.title = it ? it.tip : '보급 상자를 밟으면 줍습니다';
    els.pass.textContent = v.ap === C.C.AP ? '턴 넘기기' : '남은 행동력 버리고 넘기기';

    var lock = !v.myTurn || v.over;
    els.pass.disabled = lock;
    els.modeMove.disabled = lock; els.modeShoot.disabled = lock;
    els.modeItem.disabled = lock || !it;
    els.confirm.disabled = lock || !sel;
    els.confirm.textContent =
      mode === 'move' ? (sel ? '이동 확정' : '갈 칸을 고르세요')
      : mode === 'item' ? (v.item === 'heal'
            ? (v.me.hp >= C.C.HP ? '🩹 반창고 버리기 (체력 가득)' : '🩹 반창고 쓰기')
            : (sel ? (it ? it.icon + ' 던지기' : '던지기') : '던질 칸을 고르세요'))
      : (sel ? '발사' : '쏠 칸을 고르세요');
    els.confirm.classList.toggle('shoot', mode === 'shoot');
    els.confirm.classList.toggle('item', mode === 'item');
    for (var d = 0; d < 4; d++) {
      var b = $('pad-' + d);
      if (!b) continue;
      b.disabled = lock || (mode === 'move' && v.legalDirs.indexOf(d) < 0) ||
                   (mode === 'item' && v.item === 'heal');
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
    els.board.classList.toggle('throwing', mode === 'item' && v.myTurn);
    els.board.classList.toggle('lit', v.lit > 0);
    var movable = {}, d;
    if (v.myTurn && mode === 'move') {
      for (d = 0; d < 4; d++) if (v.legalDirs.indexOf(d) >= 0)
        movable[(v.me.x + C.DX[d]) + ',' + (v.me.y + C.DY[d])] = 1;
    }
    //  칠한 만큼 방이 드러난다 — 아는 칸의 안개가 옅어지고 전체가 아주 조금 밝아진다(«전개»).
    //  ⚠ 루프 **전에** 구해야 한다. var 는 끌어올려지니 뒤에 두면 루프 안에서 undefined 다.
    var cov = Math.min(1, v.paint.length / 24);
    els.board.style.setProperty('--reveal', cov.toFixed(3));
    //  기억 칸은 이제 «선»이라 안개를 많이 씌울 필요가 없다 — 선 자체가 흐리다.
    var knownFog = (0.5 - 0.12 * cov).toFixed(3);
    var paint = {}, mark = {}, seen = {}, box = {}, blast = {};
    v.paint.forEach(function (p) { paint[p.x + ',' + p.y] = p; });
    v.marks.forEach(function (m) { mark[m.x + ',' + m.y] = m; });
    v.seen.forEach(function (s) { seen[s.x + ',' + s.y] = 1; });
    (v.drops || []).forEach(function (b) { box[b.x + ',' + b.y] = b; });
    //  ── 도구 미리보기 ──────────────────────────────────────────────────────
    //  「어디가 칠해지는지」를 던지기 **전에** 보여 준다. 모양이 세 가지라 안 보여 주면
    //  매번 헛던진다(2×2 는 오른쪽·아래로 자란다 — 말로 설명해서는 안 읽힌다).
    if (mode === 'item' && v.myTurn && sel && v.item && v.item !== 'heal') {
      C.shapeTiles(v.item, sel.x, sel.y).forEach(function (t) { blast[t.x + ',' + t.y] = 1; });
    }

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
      c.classList.toggle('blast', !!blast[key]);               // 도구가 칠할 칸(미리보기)
      c.classList.toggle('sensed', !!(v.sense && C.dist(x, y, v.me.x, v.me.y) <= v.senseR));

      //  어둠의 두께(안개 SVG) · 시야의 빛(빛 SVG)
      var fi = y * C.C.W + x;
      if (fogRects[fi]) fogRects[fi].setAttribute('opacity', v.lit > 0 ? '0' : (!t ? '1' : (seen[key] ? '0.05' : knownFog)));
      if (beamRects[fi]) beamRects[fi].setAttribute('opacity', seen[key] && v.lit <= 0 ? '0.17' : '0');

      var sp = c.children[2], sm = c.children[3], sn = c.children[4], sd = c.children[5], sg = c.children[6];
      var p = paint[key];
      if (p) {
        sp.className = 'splat' + (p.by === v.mine ? ' mine' : ' foe') +
          (p.hit ? ' hit' : '') + (p.age === 0 ? ' fresh' : '');
        sp.style.setProperty('--sv', 'var(--splat-' + (1 + ((x * 7 + y * 13) % 4)) + ')');
        //  크기를 칸마다 흔든다 — 회전을 뺀 대신의 변화(회전하면 안쪽 그림이 칸과 어긋난다).
        sp.style.setProperty('--sz', (92 + ((x * 11 + y * 19) % 5) * 5) + '%');
        sp.style.setProperty('--splat', 'url(' + BO.Art.BASE + BO.Art.splat(x, y) + ')');
        sp.title = (p.by === v.mine ? '내' : '상대') + ' 페인트' + (p.hit ? ' · 여기서 맞았다' : '');
      } else sp.className = 'splat hide';

      var mk = mark[key];
      sm.className = 'mark' + (mk ? (mk.side === v.mine ? ' mine' : ' foe') + (mk.age === 0 ? ' fresh' : '') : ' hide');
      if (mk) {
        //  발자국은 **간 쪽**을 향해 돌아 있다. 화살표 끝 칸이 그 걸음의 도착 칸이다.
        sm.style.setProperty('--mrot', (mk.dir * 90) + 'deg');
        sm.title = (mk.side === v.mine ? '내' : '상대') + ' 발자국 — 여기서 ' + DIRNAME[mk.dir] + '으로 갔다';
      }

      var isLamp = !!(v.lamp && v.lamp.x === x && v.lamp.y === y);
      sn.className = 'lamp' + (isLamp ? (v.lit > 0 ? ' on' : '') : ' hide');

      //  내가 바라보는 방향 — 시야각이 어디로 열렸는지 한눈에
      sd.className = 'dir' + (isMe ? ' f' + v.me.face : ' hide');

      //  ── 보급 상자 — **둘 다 본다.** 어둠을 뚫고 보이는 유일한 «약속된 자리»다.
      var bx = box[key];
      if (bx) {
        var bi = C.ITEMS[bx.kind] || {};
        c._box.className = 'box k-' + bx.kind + (bx.age === 0 ? ' fresh' : '');
        if (c._box.dataset.kind !== bx.kind) {
          c._box.dataset.kind = bx.kind;
          c._box.firstChild.innerHTML = itemGlyph(bx.kind);
        }
        c._box.title = '보급 상자 · ' + (bi.name || bx.kind) + ' — ' + (bi.tip || '');
      } else c._box.className = 'box hide';

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
    if (byMe && BO.Motion && evs.some(function (e) { return e.k === 'hit' || e.k === 'miss'; })) BO.Motion.shoot(els.board);
    evs.forEach(function (e) {
      if (e.k === 'hit' || e.k === 'miss') react(e.x, e.y, e.material || 'wood', byMe);
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
        //  방향이 정보의 전부다 — 기록에도 반드시 적는다.
        var way = DIRNAME[e.dir] + '으로';
        var to = '(' + (e.x + C.DX[e.dir] + 1) + ',' + (e.y + C.DY[e.dir] + 1) + ')';
        say(byMe ? '👣 내 발자국이 ' + at + ' 에 남았다 — ' + way + ' 간 게 보인다'
                 : '👣 상대 발자국! ' + at + ' 에서 ' + way + ' — ' + to + ' 로 갔다', byMe ? 'foe' : 'me');
        if (!byMe) { toast('👣 ' + way + '!', 'spot'); BO.Sfx.play('clue'); }
      } else if (e.k === 'step') {
        //  ⚠ **밟은 본인만 아는 사건**이다. 예전엔 양쪽 기록에 다 찍혀서, 상대가
        //    「지금 얼룩 위에 있다」를 공짜로 알았다(얼룩 칸은 공개라 후보가 확 줄어든다).
        if (!byMe) return;
        say('🎨 얼룩을 밟았다 — 신발이 젖었다. 다음 걸음에 발자국이 찍힌다', 'hot');
        toast('얼룩을 밟았다', 'bump');
        BO.Sfx.play('clue');

      // ── 보급 상자 ─────────────────────────────────────────────────────────
      } else if (e.k === 'drop') {
        //  ⚠ 양쪽이 **똑같이** 보는 사건이다 — byMe 로 갈리지 않는다. 그게 요점이다:
        //    어둠 속에서 둘 다 아는 목적지가 하나 생기면 만날 이유가 생긴다.
        var di = C.ITEMS[e.kind] || {};
        say('📦 보급 상자가 떨어졌다 — ' + at + ' · ' + di.icon + ' ' + di.name + '(' + di.tip + ')', 'hot');
        toast('📦 보급 상자', 'lamp');
        BO.Sfx.play('drop');
      } else if (e.k === 'take') {
        var ti = C.ITEMS[e.kind] || {};
        if (byMe) {
          say('📦 ' + ti.icon + ' ' + ti.name + ' 획득 — ' + ti.tip +
              '. ⚠ 상자가 사라졌으니 이 자리가 상대에게 드러났다', 'hot');
          toast('📦 ' + ti.name, 'bump'); BO.Sfx.play('clue'); buzz([25]);
        } else {
          //  상자가 사라졌다 = 상대가 **방금 저 칸에 있었다**. 어둠에서 제일 비싼 정보다.
          say('📦 상대가 ' + at + ' 의 상자를 가져갔다 — 거기 있다! 들고 있는 것: ' + ti.name, 'me');
          toast('📦 상대 발견!', 'spot'); flash(e.x, e.y); BO.Sfx.play('spot');
        }
      } else if (e.k === 'use') {
        var ui2 = C.ITEMS[e.kind] || {};
        (e.tiles || []).forEach(function (t) { flash(t.x, t.y); });
        BO.Sfx.play('burst');
        if (e.hit) {
          if (byMe) {
            say('🎯 ' + ui2.name + ' 명중! ' + at + ' 주변 ' + (e.tiles || []).length + '칸 — 윤곽이 보인다, 한 발 더!', 'me');
            toast('명중!', 'hitme'); burst(e.x, e.y, 'me'); shake('sm');
            BO.Sfx.play('hit'); buzz([40]);
          } else {
            say('💥 피격! ' + at + ' 주변이 ' + ui2.name + '에 통째로 칠해졌다 — 야광이 묻었다, 움직여라', 'foe');
            toast('맞았다! −1', 'hurt'); burst(e.x, e.y, 'foe'); shake('big'); hurtFlash(); jolt(e.x, e.y);
            BO.Sfx.play('hurt'); buzz([90, 50, 130]);
          }
        } else {
          //  ⚠ 쓴 사람의 자리는 **안 나간다**(사격과 같은 규칙). 칠해진 칸만 보인다.
          say(byMe ? '· ' + ui2.name + ' — ' + at + ' 주변 ' + (e.tiles || []).length + '칸을 칠했다'
                   : '🎨 어딘가에서 ' + ui2.name + ' — ' + at + ' 주변이 통째로 칠해졌다', byMe ? '' : 'foe');
          if (!byMe) { toast('🎨 ' + ui2.name, 'foeshot'); shake('sm'); }
        }
      } else if (e.k === 'heal') {
        //  ⚠ 이 사건엔 좌표가 없다(core.js) — 반창고로 자리가 드러나면 안 된다.
        say(byMe ? '🩹 반창고 — 체력 ' + e.hp + ' 로 돌아왔다'
                 : '🩹 상대가 반창고를 썼다 — 상대 체력 ' + e.hp + ' (자리는 알 수 없다)', byMe ? 'me' : 'foe');
        if (byMe) { toast('🩹 +' + e.gain, 'hitme'); BO.Sfx.play('clue'); }
      }
    });
  }

  //  방향 이름 — 기록과 도움말이 같은 말을 쓴다(0=위 1=오른쪽 2=아래 3=왼쪽).
  var DIRNAME = ['위쪽', '오른쪽', '아래쪽', '왼쪽'];

  //  상자 라벨 — **글꼴에 기대지 않는다.** 도구가 칠할 자리를 3×3 점판에 그대로 그린다
  //  (가운데가 겨눈 칸). 이모지로 하면 기기마다 모양·색이 달라 같은 상자가 다르게 읽힌다.
  //  반창고만 모양이 없으니 «+» 하나 — 어느 글꼴에나 있는 글자다.
  function itemGlyph(kind) {
    var g = C.ITEMS[kind] && C.ITEMS[kind].grid;
    if (!g) return '<b class="plus">+</b>';
    var s = '';
    for (var i = 0; i < 9; i++) s += '<s' + (g.charAt(i) === '#' ? ' class="on"' : '') + '></s>';
    return s;
  }

  function kindName(k) {
    return { floor: '바닥', desk: '책상', chair: '의자', cabinet: '수납장', papers: '서류', shelf: '책장',
             bed: '침대', nightstand: '협탁', rug: '러그', basket: '바구니', sofa: '소파', plant: '화분' }[k] || '무언가';
  }

  //  표적 칸에서만 나는 연출. 쏜 자리·이동·숨은 상대 어느 것도 여기 안 들어온다.
  function react(x, y, material, mine) {
    var c = cellAt(x, y);
    if (BO.Motion) { BO.Motion.impact(c, material, mine); return; }
    var fx = c.children[7];
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
    if (BO.Motion) BO.Motion.clear(els.board);
    els.log.innerHTML = ''; sel = null; mode = 'move'; roomKey = ''; lastFoeKey = '';
    els.hpMe._hp = null; els.hpFoe._hp = null;
    els.log.classList.remove('open');
    if (els.logToggle) els.logToggle.textContent = '더 보기';
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      if (c.dataset.kind) c.classList.remove('k-' + c.dataset.kind);
      c.dataset.kind = ''; c.className = 'cell unknown';
      BO.Art.tile(c, null);
      if (c._box) c._box.className = 'box hide';
      c.style.removeProperty('--art'); c.style.removeProperty('--edge');
    }
  }

  return { init: init, render: render, events: events, status: status, clock: clock,
           say: say, reset: reset, setMode: setMode, hint: flashHint, toast: toast,
           mode: function () { return mode; } };
})();
