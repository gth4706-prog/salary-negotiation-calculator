window.GAME = window.GAME || {};

// ============================================================================
//  모드별 튜토리얼 카드 (2026-08-21 태현님: "그림 넣고 글자는 최대한 적게")
//
//  구조: 모드 첫 진입 때 카드 1장 — **그림(장면)이 주인공**, 글은 세 줄뿐.
//  · 그림은 전부 벡터(이 게임 규약: 자산 0KB) — eggart 의 계란과 lobbyart 의
//    표식을 재사용해 실제 게임 아트와 같은 재료로 그린다.
//  · 1회 규칙은 GAME.Onboard('tut-<key>-v1') — 본 사람에게 두 번 보여주면 잔소리다.
//  · 메뉴의 ❓ 버튼이 언제든 다시 연다(force) — 스킵한 사람이 돌아올 길.
//  · Modal 을 안 쓴다 — Modal 은 '고르는 창'이고 여기는 고를 게 없다(droppopup 과
//    같은 분류 판단). 렌더 전용: 시뮬·판정에 한 줄도 안 닿는다.
// ============================================================================
GAME.Tutorial = {

  //  글은 "무엇 / 어떻게 / 특이한 것" 세 줄 — 각 줄이 짧아야 그림이 산다.
  DATA: {
    tower: {
      title: '🗼 통곡의 탑',
      lines: ['AI가 당신을 분석해 막아선다',
              '영웅 하나로 진형을 전멸시켜라',
              '10층마다 보스 · 져도 층은 그대로'],
      scene: 'tower'
    },
    dtower: {
      title: '🛡 수성의 탑',
      lines: ['이번엔 당신이 막을 차례',
              '배치가 곧 실력 — 전투는 자동',
              '져도 성장은 남는다 · 회차마다 유닛 해금'],
      scene: 'dtower'
    },
    siege: {
      title: '🏰 공성전',
      lines: ['남의 기지에 도전 · 내 기지도 도전받는다',
              '깨면 트로피 획득 · 깨지면 상실',
              '기지는 최대 2개 · 깬 기지는 하루 뒤 재도전'],
      scene: 'siege'
    },
    rt: {
      title: '⚡ 실시간 대전',
      lines: ['지금 접속한 사람과 바로 붙는다',
              '역할을 고르고 · 세팅하고 · 시작',
              '점수는 공성전과 따로 간다'],
      scene: 'rt'
    }
  },

  _key: function (k) { return 'tut-' + k + '-v1'; },

  //  씬 진입부에서 부른다 — 처음일 때만 뜬다. force 면 무조건(❓ 다시 보기).
  show: function (scene, key, force) {
    var d = this.DATA[key];
    if (!d || !scene || !scene.add) return false;
    if (!force) {
      if (!GAME.Onboard) return false;
      if (GAME.Onboard.seen().indexOf(this._key(key)) >= 0) return false;
    }
    this._open(scene, key, d);
    return true;
  },

  _open: function (scene, key, d) {
    var C = GAME.CONFIG.COLORS, UI = GAME.UI;
    var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
    var PH = GAME.CONFIG.PHONE;
    var self = this;
    var objs = [];

    //  가림막 — Modal 과 같은 층위 규칙(depth 2000+, 뒤 화면과의 겹침은 결함이 아니다)
    var veil = scene.add.rectangle(W / 2, H / 2, W, H, 0x14100a, 0.78)
      .setDepth(2600).setScrollFactor(0).setInteractive();
    objs.push(veil);

    var pw = Math.min(W - 36, PH ? 560 : 620);
    var ph = Math.min(H - 24, PH ? 360 : 560);
    var px = W / 2, py = H / 2;
    var panel = scene.add.rectangle(px, py, pw, ph, 0x2a2114, 0.97)
      .setStrokeStyle(3, 0x8a7550, 1).setDepth(2601).setScrollFactor(0);
    objs.push(panel);

    //  ── 그림 — 카드 위쪽 절반이 통째로 장면이다 ──
    var artH = ph * (PH ? 0.44 : 0.46);
    var g = scene.add.graphics().setDepth(2602).setScrollFactor(0);
    objs.push(g);
    this._scene(g, d.scene, px, py - ph / 2 + 14 + artH / 2, pw - 40, artH);

    //  ── 글 — 제목 + 세 줄 ──
    var ty = py - ph / 2 + artH + (PH ? 30 : 44);
    var title = scene.add.text(px, ty, d.title, {
      fontFamily: (GAME.CONFIG.FONT_DISPLAY || GAME.CONFIG.FONT) + ', ' + GAME.CONFIG.FONT,
      fontSize: (PH ? 24 : 30) + 'px', color: '#fff3d6',
      stroke: '#20180c', strokeThickness: 5
    }).setOrigin(0.5, 0).setDepth(2602).setScrollFactor(0);
    objs.push(title);

    var ly = ty + (PH ? 34 : 46);
    var lineGap = PH ? 24 : 30;
    for (var i = 0; i < d.lines.length; i++) {
      objs.push(scene.add.text(px, ly + i * lineGap, d.lines[i], {
        fontFamily: GAME.CONFIG.FONT, fontSize: (PH ? 15 : 18) + 'px',
        color: i === 0 ? '#ffd9a0' : '#e8dcc2'
      }).setOrigin(0.5, 0).setDepth(2602).setScrollFactor(0));
    }

    //  ── 닫기 ──
    var bh = Math.max(UI.BTN_H_SM || 52, PH ? 48 : 54);
    //  닫기 버튼 — **배경색 내장 텍스트** 하나로 만든다. UI.button(rect+text)을 쓰면
    //  Shape 렌더가 이 깊이에서 프레임에 안 실리는 경우가 있었다(헤드리스 실측:
    //  displayList 에는 있는데 화면에 rect 만 실종). 텍스트 배경은 텍스트와 한 몸이라
    //  같이 그려지거나 같이 빠진다 — 어긋날 자리가 없다.
    var btnTx = scene.add.text(px, py + ph / 2 - bh / 2 - 12, '알겠어요!', {
      fontFamily: GAME.CONFIG.FONT, fontSize: (PH ? 17 : 19) + 'px',
      color: '#33291b', backgroundColor: '#f3e6c8',
      padding: { x: PH ? 46 : 60, y: PH ? 10 : 13 }
    }).setOrigin(0.5).setDepth(2603).setScrollFactor(0);
    btnTx.setInteractive({ useHandCursor: true });
    btnTx.on('pointerdown', function () {
      objs.forEach(function (o) {
        if (o.rect) { o.rect.destroy(); if (o.text) o.text.destroy(); }
        else if (o.destroy) o.destroy();
      });
      if (GAME.Onboard) GAME.Onboard.markSeen(self._key(key));
    });
    objs.push(btnTx);
  },

  //  ── 장면 4종 — 실제 게임 재료(계란·표식)로 그린 미니 일러스트 ──────────────
  //  w×h 상자 안에 그린다. 유닛은 drawUnitFlat(정지 포즈) — 카드 화면들과 같은 방식.
  _scene: function (g, kind, cx, cy, w, h) {
    var C = GAME.CONFIG.COLORS, UI = GAME.UI, LA = GAME.LobbyArt;
    var s = Math.min(w, h);
    var uD = function (key) { return GAME.UNITS[key]; };
    var hD = function (key) { return GAME.HEROES[key]; };
    var egg = function (def, x, y, col, scale, facing) {
      if (!def) return;
      try { UI.drawUnitFlat(g, def, x, y, col, 1, scale, facing || 0); } catch (e) {}
    };
    //  바닥선 — 장면이 허공에 뜨지 않게
    g.fillStyle(0x3a2e1a, 0.55);
    g.fillEllipse(cx, cy + h * 0.34, w * 0.82, h * 0.16);

    if (kind === 'tower') {
      //  탑이 서 있고, 내 영웅이 그 앞에 선다 — "오르는 곳".
      if (LA) LA.mark(g, 'tower', cx + w * 0.2, cy + h * 0.02, s * 0.66);
      egg(hD('vanguard'), cx - w * 0.22, cy + h * 0.26, C.controller, s / 110, 0);
    } else if (kind === 'dtower') {
      //  내 진형 세 개가 아래 줄에, 위에서 적 영웅이 내려온다 — "막는 곳".
      if (LA) LA.mark(g, 'shield', cx - w * 0.3, cy - h * 0.18, s * 0.4);
      egg(uD('bayonet'), cx - w * 0.14, cy + h * 0.26, C.strategist, s / 150, 0);
      egg(uD('shieldman'), cx + w * 0.04, cy + h * 0.28, C.strategist, s / 150, 0);
      egg(uD('rifleman'), cx + w * 0.22, cy + h * 0.26, C.strategist, s / 150, 0);
      egg(hD('vanguard'), cx + w * 0.05, cy - h * 0.2, C.controller, s / 135, Math.PI / 2);
    } else if (kind === 'siege') {
      //  두 기지(깃발 둘)가 마주 본다 — "서로 치는 곳".
      if (LA) {
        LA.mark(g, 'banner', cx - w * 0.3, cy - h * 0.05, s * 0.5);
        LA.mark(g, 'banner', cx + w * 0.3, cy - h * 0.05, s * 0.5);
      }
      egg(uD('bayonet'), cx - w * 0.16, cy + h * 0.24, C.controller, s / 150, 0);
      egg(uD('bayonet'), cx + w * 0.16, cy + h * 0.24, C.strategist, s / 150, Math.PI);
    } else if (kind === 'rt') {
      //  두 계란이 번개를 사이에 두고 대치 — "지금 붙는 곳".
      egg(hD('vanguard'), cx - w * 0.24, cy + h * 0.18, C.controller, s / 115, 0);
      egg(hD('ranger'), cx + w * 0.24, cy + h * 0.18, C.strategist, s / 115, Math.PI);
      //  번개 — 굵은 지그재그 한 획
      var zx = cx, zy = cy - h * 0.24, u2 = s * 0.09;
      g.fillStyle(0xffd24a, 1);
      g.beginPath();
      g.moveTo(zx - u2 * 0.4, zy - u2 * 1.6);
      g.lineTo(zx + u2 * 0.7, zy - u2 * 0.2);
      g.lineTo(zx + u2 * 0.1, zy - u2 * 0.2);
      g.lineTo(zx + u2 * 0.5, zy + u2 * 1.4);
      g.lineTo(zx - u2 * 0.8, zy - u2 * 0.1);
      g.lineTo(zx - u2 * 0.2, zy - u2 * 0.1);
      g.closePath();
      g.fillPath();
    }
  },

  //  ❓ 다시 보기 — 메뉴 버튼이 연다. 모드를 고르는 것뿐이라 여기는 Modal 이 맞다.
  openPicker: function (scene) {
    var self = this;
    if (!GAME.Modal) return;
    GAME.Modal.open(scene, {
      title: '❓ 게임 안내',
      items: [
        { key: 'tower', name: '🗼 통곡의 탑' },
        { key: 'dtower', name: '🛡 수성의 탑' },
        { key: 'siege', name: '🏰 공성전' },
        { key: 'rt', name: '⚡ 실시간 대전' }
      ],
      onPick: function (it) { self.show(scene, it.key, true); }
    });
  }
};
