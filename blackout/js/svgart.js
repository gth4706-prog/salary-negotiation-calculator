window.BO = window.BO || {};

// ============================================================================
//  블랙아웃 — **내장 그림**. 파일 없이도 방이 «방»처럼 보이게.
//
//  컨셉아트(assets/concept/concept-01.jpg)의 팔레트로 위에서 내려다본 가구·바닥·
//  얼룩·전등을 SVG 로 그린다. 그림 파일(assets/…png)이 들어오면 art.js 가 그걸로
//  갈아끼우고, 없으면 이게 보인다. 그러니 «CSS 사각형 시험 자산»은 이제 없다.
//
//  전부 **칸 단위 좌표(칸 = 100)** 로 그리고, art.js 가 칸마다 잘라 붙인다. 가구는
//  종류(kind)뿐 아니라 크기(w×h)와 id 에 따라 모양을 바꾼다 — 같은 'cabinet' 이라도
//  사무실 서랍장(1×2, 초록 철제)·침실 옷장(3×1)·거실 TV 장(2×1)이 다르다.
//  ES5 · 의존성 없음 · DOM 을 만지지 않는다(문자열만 만든다).
// ============================================================================
BO.SvgArt = (function () {
  var P = {                     // 컨셉 팔레트
    wood1: '#8b6242', wood2: '#6f4b31', wood3: '#55381f', woodLine: '#3a2414', woodHi: '#b08560',
    floor1: '#5a3f2c', floor2: '#664834', floor3: '#4e3626', floorGap: '#2b1c12', floorHi: '#7a583f',
    metal: '#4f5e46', metal2: '#65765a', metalDark: '#34412e',
    dark: '#1b2230', screen: '#28364a', screenHi: '#3c5470',
    cloth: '#e9dfc9', clothShade: '#cbbfa5', blanket: '#6f8a8c', blanket2: '#5b7476',
    rug: '#4d4864', rug2: '#5c5578', rugLine: '#7a72a0',
    gray: '#3f4a4f', gray2: '#5a686f', grayHi: '#7d8b93',
    green: '#4f7f45', green2: '#3a6332', pot: '#8f5b3a',
    paper: '#f0ead8', paperShade: '#cfc7ae',
    sofa: '#4e7f7b', sofa2: '#3d6764', sofaHi: '#6a9d98',
    warm: '#ffd08a', pink: '#ff5aa0', cyan: '#4ff0dc'
  };

  function esc(s) { return encodeURIComponent(s).replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29'); }
  function uri(svg) { return 'url("data:image/svg+xml;utf8,' + esc(svg) + '")'; }
  function head(w, h, defs) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '">' +
      '<defs>' +
      '<filter id="sh" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="4" stdDeviation="3.5" flood-color="#000" flood-opacity=".6"/></filter>' +
      '<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2"/></filter>' +
      '<linearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + P.wood1 + '"/><stop offset="1" stop-color="' + P.wood2 + '"/></linearGradient>' +
      '<linearGradient id="mg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + P.metal2 + '"/><stop offset="1" stop-color="' + P.metal + '"/></linearGradient>' +
      '<linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + P.cloth + '"/><stop offset="1" stop-color="' + P.clothShade + '"/></linearGradient>' +
      '<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + P.blanket + '"/><stop offset="1" stop-color="' + P.blanket2 + '"/></linearGradient>' +
      '<radialGradient id="glow"><stop offset="0" stop-color="#fff2c8" stop-opacity=".95"/><stop offset=".45" stop-color="' + P.warm + '" stop-opacity=".55"/><stop offset="1" stop-color="' + P.warm + '" stop-opacity="0"/></radialGradient>' +
      (defs || '') + '</defs>';
  }
  function tail() { return '</svg>'; }
  function r(x, y, w, h, fill, rx, extra) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (rx || 0) + '" fill="' + fill + '"' + (extra || '') + '/>';
  }
  function c(cx, cy, rad, fill, extra) { return '<circle cx="' + cx + '" cy="' + cy + '" r="' + rad + '" fill="' + fill + '"' + (extra || '') + '/>'; }
  function e(cx, cy, rx, ry, fill, extra) { return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + fill + '"' + (extra || '') + '/>'; }
  function grain(x, y, w, h, n, color) {   // 나뭇결 — 가는 선 몇 개
    var s = '';
    for (var i = 1; i <= n; i++) {
      var yy = y + h * i / (n + 1);
      s += '<path d="M' + (x + 6) + ' ' + yy + ' q ' + (w / 3) + ' -3 ' + (w - 12) + ' 0" stroke="' + (color || P.woodLine) + '" stroke-opacity=".35" fill="none" stroke-width="1.5"/>';
    }
    return s;
  }

  // ── 바닥: 3칸 길이 널빤지 한 장(300×100). 칸마다 1/3 씩 보여 이어진 마루가 된다.
  //  이음매는 3칸마다, 줄마다 한 칸씩 어긋난다(ui.js 가 --px 로). 톤은 --fb 로 살짝씩 다르게.
  function floor(roomId) {
    var base = roomId === 'bedroom' ? '#6a4a34' : roomId === 'living' ? '#5c4738' : P.floor1;
    var s = head(300, 100);
    s += r(0, 0, 300, 100, P.floorGap);
    s += r(3, 4, 294, 92, base, 3);
    s += grain(3, 4, 294, 92, 3, '#2a1a10');
    s += r(3, 4, 294, 3, '#ffffff', 2, ' fill-opacity=".05"');
    s += r(3, 93, 294, 3, '#000', 2, ' fill-opacity=".28"');
    s += r(40, 30, 3, 40, '#000', 1, ' fill-opacity=".12"'); s += r(220, 45, 4, 30, '#000', 1, ' fill-opacity=".10"');   // 옹이
    return s + tail();
  }

  // ── 가구 ──────────────────────────────────────────────────────────────────
  function desk(w, h, id) {
    var W = w * 100, H = h * 100, s = head(W, H);
    s += r(5, 8, W - 10, H - 16, 'url(#wg)', 10, ' filter="url(#sh)" stroke="' + P.woodHi + '" stroke-width="2"');
    s += grain(5, 8, W - 10, H - 16, 4);
    if (id === 'table') {                       // 거실 탁자: 책 한 권 + 컵
      s += r(18, 26, 44, 48, '#5b6f8a', 3, ' transform="rotate(-8 40 50)"');
      s += r(22, 30, 36, 40, '#7b8fa8', 2, ' transform="rotate(-8 40 50)"');
      s += c(W - 36, 52, 15, '#e9e2d0'); s += c(W - 36, 52, 10, '#6b4a2a');
      s += c(W - 20, 52, 6, 'none', ' stroke="#e9e2d0" stroke-width="4"');
    } else {
      var mx = w >= 3 ? W * 0.36 : W * 0.4;   // 모니터
      s += r(mx - 30, 14, 60, 42, P.dark, 6, ' filter="url(#sh)"');
      s += r(mx - 26, 18, 52, 32, P.screen, 3);
      s += r(mx - 22, 21, 22, 6, P.screenHi, 2, ' fill-opacity=".8"');
      s += r(mx - 6, 56, 12, 8, P.dark, 2);
      s += r(mx - 24, 66, 48, 14, '#cfc9b8', 3);  // 키보드
      for (var k = 0; k < 6; k++) s += r(mx - 21 + k * 8, 69, 6, 3, '#9b968a', 1);
      s += c(W - 30, 44, 12, '#e9e2d0'); s += c(W - 30, 44, 8, '#5b3a1e');   // 머그
      s += c(W - 17, 44, 5, 'none', ' stroke="#e9e2d0" stroke-width="3.5"');
      if (w >= 3) {                              // 서류 두 장
        s += r(W * 0.66, 24, 30, 40, P.paper, 2, ' transform="rotate(12 ' + (W * 0.66 + 15) + ' 44)"');
        s += r(W * 0.62, 30, 30, 40, '#e4ddc5', 2, ' transform="rotate(-6 ' + (W * 0.62 + 15) + ' 50)"');
      }
    }
    return s + tail();
  }
  function chair() {
    var s = head(100, 100);
    for (var i = 0; i < 5; i++) {               // 바퀴 다리
      var a = -Math.PI / 2 + i * Math.PI * 2 / 5;
      s += '<line x1="50" y1="52" x2="' + (50 + Math.cos(a) * 40) + '" y2="' + (52 + Math.sin(a) * 40) + '" stroke="' + P.gray + '" stroke-width="6" stroke-linecap="round"/>';
      s += c(50 + Math.cos(a) * 40, 52 + Math.sin(a) * 40, 5, P.dark);
    }
    s += r(18, 6, 64, 22, P.gray, 10, ' filter="url(#sh)"');        // 등받이
    s += r(22, 9, 56, 14, P.gray2, 8);
    s += c(50, 54, 30, P.gray, ' filter="url(#sh)"');                // 좌석
    s += c(50, 54, 24, P.gray2); s += c(44, 48, 10, P.grayHi, ' fill-opacity=".35"');
    return s + tail();
  }
  function cabinet(w, h, id) {
    var W = w * 100, H = h * 100, s = head(W, H), i;
    if (id === 'tv') {                          // 거실 TV 장 + TV
      s += r(5, 20, W - 10, H - 30, 'url(#wg)', 8, ' filter="url(#sh)" stroke="' + P.woodHi + '" stroke-width="2"');
      s += r(W * 0.2, 30, W * 0.6, H - 50, P.dark, 6, ' filter="url(#sh)"');
      s += r(W * 0.22, 34, W * 0.56, H - 58, P.screen, 3);
      s += r(W * 0.24, 38, W * 0.2, 8, P.screenHi, 2, ' fill-opacity=".7"');
      s += c(W * 0.1, H * 0.5, 8, '#c9c1a8'); s += c(W * 0.9, H * 0.5, 8, '#c9c1a8');
    } else if (id === 'dresser') {              // 침실 옷장: 문 둘 + 손잡이
      s += r(4, 6, W - 8, H - 12, 'url(#wg)', 8, ' filter="url(#sh)" stroke="' + P.woodHi + '" stroke-width="2"');
      s += grain(4, 6, W - 8, H - 12, 3);
      var doors = w >= 3 ? 3 : 2, dw = (W - 16) / doors;
      for (i = 0; i < doors; i++) {
        s += r(8 + i * dw + 3, 12, dw - 6, H - 24, P.wood2, 5, ' stroke="' + P.wood3 + '" stroke-width="2"');
        s += c(8 + i * dw + dw / 2, H / 2, 5, '#d9c48a');
      }
    } else {                                    // 사무실 철제 서랍장(초록)
      s += r(8, 6, W - 16, H - 12, 'url(#mg)', 6, ' filter="url(#sh)" stroke="' + P.metalDark + '" stroke-width="2"');
      var n = h >= 2 ? 4 : 2, dh = (H - 24) / n;
      for (i = 0; i < n; i++) {
        s += r(14, 12 + i * dh + 3, W - 28, dh - 6, P.metal, 4, ' stroke="' + P.metalDark + '" stroke-width="1.5"');
        s += r(W / 2 - 14, 12 + i * dh + dh / 2 - 3, 28, 6, '#c9c1a8', 3);
      }
      s += c(W - 18, 18, 7, P.green); s += c(W - 18, 18, 5, P.green2);   // 위의 작은 화분
    }
    return s + tail();
  }
  function papers(w, h) {
    var W = w * 100, H = h * 100, s = head(W, H);
    s += r(10, 18, W - 20, H - 32, P.dark, 6, ' filter="url(#sh)"');          // 서류함
    s += r(16, 24, W - 32, H - 44, '#2a3340', 4);
    for (var i = 0; i < 4; i++) {
      s += r(22 + i * 3, 30 - i * 2, W * 0.55, H - 56, i % 2 ? P.paperShade : P.paper, 2,
             ' transform="rotate(' + (i * 4 - 6) + ' ' + (22 + W * 0.28) + ' ' + (H / 2) + ')"');
    }
    s += r(W * 0.62, 26, W * 0.3, H - 50, P.paper, 2, ' transform="rotate(14 ' + (W * 0.77) + ' ' + (H / 2) + ')"');
    for (var k = 0; k < 4; k++) s += r(W * 0.65, 34 + k * 9, W * 0.2, 2, '#b9b19a', 1, ' transform="rotate(14 ' + (W * 0.77) + ' ' + (H / 2) + ')"');
    return s + tail();
  }
  function shelf(w, h) {
    var W = w * 100, H = h * 100, s = head(W, H);
    s += r(4, 6, W - 8, H - 12, 'url(#wg)', 6, ' filter="url(#sh)" stroke="' + P.woodHi + '" stroke-width="2"');
    var cols = ['#5b7f78', '#b08a4e', '#7a5c7c', '#3f5f88', '#a4634e', '#8a9a5b', '#c9c1a8', '#6a4a7a'];
    var x = 12, i = 0;
    while (x < W - 20) {
      var bw = 10 + ((i * 7) % 9), col = cols[i % cols.length];
      s += r(x, 14 + ((i * 5) % 7), bw, H - 28 - ((i * 5) % 7), col, 2, ' stroke="#00000055" stroke-width="1"');
      s += r(x + 2, 22, bw - 4, 3, '#ffffff', 1, ' fill-opacity=".25"');
      x += bw + 3; i++;
    }
    return s + tail();
  }
  function bed(w, h) {
    var W = w * 100, H = h * 100, s = head(W, H);
    s += r(4, 2, W - 8, 26, 'url(#wg)', 8, ' filter="url(#sh)" stroke="' + P.woodHi + '" stroke-width="2"');   // 머리판
    s += r(10, 22, W - 20, H - 32, 'url(#cg)', 10, ' filter="url(#sh)"');                                       // 매트리스
    s += r(10, H * 0.42, W - 20, H * 0.58 - 10, 'url(#bg)', 10);                                                 // 이불
    s += '<path d="M10 ' + (H * 0.42) + ' q ' + (W / 2 - 10) + ' 14 ' + (W - 20) + ' 0 v 16 q -' + (W / 2 - 10) + ' 14 -' + (W - 20) + ' 0 z" fill="' + P.blanket2 + '" fill-opacity=".8"/>';
    for (var i = 0; i < 4; i++) s += '<path d="M' + (18 + i * (W - 36) / 3) + ' ' + (H * 0.55) + ' q 8 20 0 40" stroke="#ffffff" stroke-opacity=".12" stroke-width="3" fill="none"/>';
    var pw = (W - 40) / 2;                                                                                        // 베개 둘
    s += r(16, 30, pw, 30, '#f6f1e4', 12, ' filter="url(#sh)"'); s += r(24 + pw, 30, pw, 30, '#f6f1e4', 12, ' filter="url(#sh)"');
    s += r(W / 2 - 22, H * 0.45, 44, 18, '#6c8ec0', 6, ' filter="url(#sh)"');                                     // 작은 쿠션(컨셉의 파란 쿠션)
    return s + tail();
  }
  function nightstand() {
    var s = head(100, 100);
    s += r(10, 12, 80, 76, 'url(#wg)', 8, ' filter="url(#sh)" stroke="' + P.woodHi + '" stroke-width="2"');
    s += grain(10, 12, 80, 76, 3);
    s += r(20, 56, 36, 24, '#5b6f8a', 3, ' transform="rotate(-6 38 68)"');
    s += c(62, 40, 26, 'url(#glow)'); s += c(62, 40, 14, '#e7d8b0'); s += c(62, 40, 6, '#fff3d0');   // 스탠드
    return s + tail();
  }
  function rug(w, h) {
    var W = w * 100, H = h * 100, s = head(W, H);
    s += r(6, 6, W - 12, H - 12, P.rug, 6);
    s += r(16, 16, W - 32, H - 32, 'none', 3, ' stroke="' + P.rugLine + '" stroke-width="3" stroke-opacity=".6"');
    for (var y = 36; y < H - 26; y += 30) for (var x = 36; x < W - 26; x += 30) {               // 꽃무늬
      s += c(x, y, 9, P.rug2); s += c(x, y, 4, P.rugLine, ' fill-opacity=".7"');
      s += c(x + 15, y + 15, 3, P.rugLine, ' fill-opacity=".4"');
    }
    for (var k = 8; k < H - 8; k += 8) {                                                        // 술
      s += '<line x1="1" y1="' + k + '" x2="6" y2="' + k + '" stroke="' + P.rugLine + '" stroke-width="2"/>';
      s += '<line x1="' + (W - 6) + '" y1="' + k + '" x2="' + (W - 1) + '" y2="' + k + '" stroke="' + P.rugLine + '" stroke-width="2"/>';
    }
    return s + tail();
  }
  function basket() {
    var s = head(100, 100);
    s += c(50, 52, 40, '#7a5c36', ' filter="url(#sh)"');
    for (var i = 0; i < 4; i++) s += c(50, 52, 38 - i * 4, 'none', ' stroke="' + (i % 2 ? '#a88a58' : '#5e4527') + '" stroke-width="3.5" stroke-dasharray="7 4"');
    s += c(50, 52, 22, '#e6e0d2'); s += e(42, 46, 12, 9, '#c9d4e8'); s += e(58, 56, 11, 8, '#f3efe5');   // 빨래
    return s + tail();
  }
  function sofa(w, h) {
    var W = w * 100, H = h * 100, s = head(W, H);
    s += r(4, 6, W - 8, H - 10, P.sofa2, 12, ' filter="url(#sh)"');                        // 몸통(등받이 포함)
    s += r(4, 6, W - 8, 22, P.sofa, 10);                                                     // 등받이
    var n = w >= 3 ? 3 : 2, cw = (W - 24 - (n - 1) * 6) / n;
    for (var i = 0; i < n; i++) {
      s += r(12 + i * (cw + 6), 32, cw, H - 44, P.sofa, 8, ' stroke="' + P.sofa2 + '" stroke-width="2"');
      s += r(16 + i * (cw + 6), 36, cw - 8, 10, P.sofaHi, 5, ' fill-opacity=".35"');
    }
    s += r(4, 6, 14, H - 10, P.sofaHi, 8, ' fill-opacity=".35"'); s += r(W - 18, 6, 14, H - 10, P.sofaHi, 8, ' fill-opacity=".35"');   // 팔걸이
    s += r(W * 0.62, 40, 30, 26, '#c9a15a', 6, ' transform="rotate(-10 ' + (W * 0.62 + 15) + ' 53)"');     // 쿠션 하나
    return s + tail();
  }
  function plant() {
    var s = head(100, 100);
    s += c(50, 56, 24, P.pot, ' filter="url(#sh)"'); s += c(50, 56, 18, '#3a2a1c');
    for (var i = 0; i < 7; i++) {
      var a = i * Math.PI * 2 / 7 - 0.4;
      s += '<ellipse cx="' + (50 + Math.cos(a) * 22) + '" cy="' + (52 + Math.sin(a) * 22) + '" rx="17" ry="9" fill="' + (i % 2 ? P.green : P.green2) + '" transform="rotate(' + (a * 180 / Math.PI) + ' ' + (50 + Math.cos(a) * 22) + ' ' + (52 + Math.sin(a) * 22) + ')" stroke="#22421f" stroke-width="1"/>';
    }
    s += c(50, 50, 9, '#6aa25c');
    return s + tail();
  }

  // ── 전등 버튼 · 얼룩 ─────────────────────────────────────────────────────
  function lamp(on) {
    var s = head(100, 100);
    if (on) s += c(50, 50, 48, 'url(#glow)');
    s += c(50, 54, 30, '#2a2f38', ' filter="url(#sh)"');
    s += c(50, 52, 26, '#c9c1a8'); s += c(50, 52, 20, '#b3ab92');
    s += c(50, 52, 9, on ? '#fff0c0' : '#4a4f58', on ? ' stroke="#ffcc4d" stroke-width="4"' : ' stroke="#8a8474" stroke-width="3"');
    return s + tail();
  }
  //  얼룩: 흰 실루엣 4종(마스크). 방울·흘러내림이 있어야 «페인트»로 읽힌다.
  var SPLATS = [
    '<path d="M50 12c9 0 14 6 19 12l9-6c3 6-2 12 3 18 6 2 12 8 8 16-4 5-1 12-6 16-6 2-8 9-14 10s-11-4-17-3c-5 4-12 3-17-2-5-4-13-3-15-10-1-6 3-11 1-17-3-6-8-11-5-17 3-5 9-4 13-9 4-6 11-8 21-8z"/><circle cx="86" cy="30" r="4"/><circle cx="16" cy="74" r="3"/><circle cx="78" cy="82" r="2.5"/><circle cx="30" cy="14" r="2"/><path d="M56 74c0 8 2 14 2 22a2.5 2.5 0 0 1-5 0c0-8 3-14 3-22z"/>',
    '<path d="M46 16c8-3 15 2 20 8 7-2 13 3 14 10 6 3 9 10 6 16 5 6 2 14-5 16-1 7-8 11-15 9-4 6-12 7-18 3-7 3-14-1-16-8-7-1-11-8-9-15-6-4-7-12-2-17-1-8 4-14 11-15 3-5 8-7 14-7z"/><circle cx="84" cy="58" r="3.5"/><circle cx="12" cy="38" r="3"/><circle cx="70" cy="14" r="2.5"/><circle cx="36" cy="88" r="3"/><path d="M40 78c0 7 1 12 1 19a2.5 2.5 0 0 1-5 0c0-7 4-12 4-19z"/><path d="M66 80c0 5 1 9 1 14a2 2 0 0 1-4 0c0-5 3-9 3-14z"/>',
    '<path d="M52 10c6 4 6 12 12 16 8-4 16 0 18 8 6 4 12 10 8 18-4 4 0 12-6 16-2 8-10 10-16 8-6 6-14 8-20 2-8 4-16 0-18-8-8-2-12-10-8-16-6-6-4-14 2-18 0-8 6-14 14-12 4-6 10-10 14-14z"/><circle cx="90" cy="70" r="4"/><circle cx="10" cy="60" r="3"/><circle cx="60" cy="92" r="3"/><circle cx="22" cy="20" r="2.5"/><path d="M30 76c0 9 2 16 2 26a2.5 2.5 0 0 1-5 0c0-10 3-17 3-26z"/>',
    '<path d="M48 14c10-2 18 4 22 12 8 0 14 6 14 14 6 6 6 14 0 20 2 8-4 14-12 14-4 8-12 10-20 6-8 4-16 0-18-8-8-2-12-10-8-18-6-6-4-16 4-18 0-8 8-14 18-22z"/><circle cx="82" cy="24" r="3"/><circle cx="14" cy="84" r="3.5"/><circle cx="88" cy="86" r="2.5"/><circle cx="8" cy="30" r="2"/><path d="M74 70c0 6 2 12 2 20a2.5 2.5 0 0 1-5 0c0-8 3-14 3-20z"/><path d="M50 86c0 4 1 7 1 11a2 2 0 0 1-4 0c0-4 3-7 3-11z"/>'
  ];
  function splat(i) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="#fff">' + SPLATS[i % SPLATS.length] + '</g></svg>';
  }

  // ── 조회 ──────────────────────────────────────────────────────────────────
  var cache = {};
  function furniture(t) {                       // t = tileInfo 의 kind/id/w/h
    var key = t.kind + ':' + t.id + ':' + t.w + 'x' + t.h;
    if (cache[key]) return cache[key];
    var svg;
    switch (t.kind) {
      case 'desk': svg = desk(t.w, t.h, t.id); break;
      case 'chair': svg = chair(); break;
      case 'cabinet': svg = cabinet(t.w, t.h, t.id); break;
      case 'papers': svg = papers(t.w, t.h); break;
      case 'shelf': svg = shelf(t.w, t.h); break;
      case 'bed': svg = bed(t.w, t.h); break;
      case 'nightstand': svg = nightstand(); break;
      case 'rug': svg = rug(t.w, t.h); break;
      case 'basket': svg = basket(); break;
      case 'sofa': svg = sofa(t.w, t.h); break;
      case 'plant': svg = plant(); break;
      default: svg = null;
    }
    cache[key] = svg ? uri(svg) : null;
    return cache[key];
  }
  //  몸통(body)에 CSS 변수로 심는다 — rooms.css 가 var(--splat-1) 처럼 읽는다.
  function install(body) {
    for (var i = 0; i < SPLATS.length; i++) body.style.setProperty('--splat-' + (i + 1), uri(splat(i)));
    body.style.setProperty('--lamp-off', uri(lamp(false)));
    body.style.setProperty('--lamp-on', uri(lamp(true)));
    ['office', 'bedroom', 'living'].forEach(function (id) { body.style.setProperty('--floor-' + id, uri(floor(id))); });
  }

  return { uri: uri, floor: floor, furniture: furniture, lamp: lamp, splat: splat, install: install, P: P };
})();
