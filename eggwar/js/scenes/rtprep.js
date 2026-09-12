window.GAME = window.GAME || {};

// ============================================================================
//  실시간 대전 — 전투 준비 화면 (2026-08-22 태현님 사양 ②)
//
//  60초 준비: 전략가 = 저장 배치 중 하나 선택 · 컨트롤러 = 대전 준비창(예산 500)에서
//  영웅·아이템·스킬 구매 → [전투 준비 완료] → 양쪽 세팅이 모이면 전투.
//
//  ⚠ 교환 상태·타이머는 GAME.RtFlow(전역)가 쥔다 — 이 씬은 그리기와 버튼만.
//    컨트롤러가 상점(TowerShop)을 다녀오는 동안에도 흐름이 살아 있어야 하기 때문.
// ============================================================================
GAME.RtPrepScene = function () {
  Phaser.Scene.call(this, { key: 'RtPrep' });
};
GAME.RtPrepScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.RtPrepScene.prototype.constructor = GAME.RtPrepScene;

GAME.RtPrepScene.prototype.init = function () {
  this._timerTxt = null;
  this._stateTxt = null;
  this._readyBtn = null;
  this._pickedFormation = null;
  this._loadoutTxt = null;      // 씬 인스턴스는 재사용된다 — 파괴된 Text 참조 방지
  this._skillTxt = null;
  this._heroBtns = null;
  this._brief = null;         //  전장 브리핑 카드(씨 재사용 — 파괴된 객체 참조 방지)
};

GAME.RtPrepScene.prototype.create = function () {
  var C = GAME.CONFIG.COLORS, UI = GAME.UI;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var P = GAME.CONFIG.PHONE || GAME.CONFIG.PORTRAIT;
  var self = this;
  var F = GAME.RtFlow;

  this.cameras.main.setBackgroundColor(C.bg);
  if (GAME.Music) GAME.Music.play('versus');

  //  흐름이 죽어 있으면(뒤로가기 복원 등) 대전 화면으로 — 유령 준비 화면 방지.
  if (!F || !F.active) { this.scene.start('Versus'); return; }

  var isStrat = F.myRole === 'strategist';
  //  협동(S-C) — 둘 다 컨트롤러라 역할 분기를 안 탄다. 제목이 세계를 말한다.
  var coopLbl = (F.coop && GAME.RtCoop) ? GAME.RtCoop.label(F.coop.world) : '';
  UI.text(this, W / 2, P ? 10 : 26,
    F.coop ? ('🤝 협동 보스전 — ' + coopLbl + (P ? '' : ' · 영웅과 무기를 고르세요'))
           : (F.local ? '🤖 연습 대전 — 영웅과 무기를 고르세요'
            : (isStrat ? '🛡 전투 준비 — 배치를 고르세요'
                       //  ⚠ 단계를 제목이 말한다 — 10초짜리 영웅 단계는 «서로 보이는» 구간이고
                       //    상점 단계는 «서로 모르는» 구간이다. 섞이면 사람이 손해를 본다.
                       : (F.phase === 'hero' ? '⚔ 영웅 선택 — 서로 보입니다'
                                             : '🛒 장비 구매 — 서로 보이지 않습니다'))),
    { size: P ? 'subhead' : 'head', color: C.accent, origin: 0.5, originY: 0 });

  this._timerTxt = UI.text(this, W / 2, P ? 44 : 78, '', {
    size: P ? 'subhead' : 'title', color: C.accentAlt, origin: 0.5, originY: 0 });   //  폰: head(26px)는 아래 장비요약과 8px 겹친다(감사 실측)

  //  이번 판의 맵(2026-08-31 ④) — 시드는 서버 start 가 배포했고 양쪽이 같은 맵을 본다.
  //  ⚠ 이름은 타이머 줄에 붙인다(update 가 매 틱 읽는 this._mapName) — 별도 줄로
  //    두면 컨트롤러 장비요약(P 70 / PC 124)과 정확히 겹친다(감사 실측 2026-08-31).
  //    설명(desc)은 자리가 남는 전략가 쪽에만 한 줄 띄운다.
  this._mapName = '';
  if (F.coop) {
    //  협동 — 맵 대신 세계 보스 층. 보스 이름은 시드 없이도 층에서 정해진다.
    var cbk = GAME.RtCoop ? GAME.RtCoop.bossKeyFor(F.coop.floor) : null;
    var cbd = cbk && GAME.UNITS[cbk];
    var hm = (GAME.RtCoop && GAME.RtCoop.HERO_WORLD_MUL[F.coop.world]) || 1;
    this._mapName = F.coop.floor + '층 ' + (cbd ? cbd.name : '보스') + (hm > 1 ? ' · 영웅 ×' + hm : '');
  } else if (GAME.RtMaps && F.startMsg && F.startMsg.seed !== undefined) {
    var mp = GAME.RtMaps.forSeed(F.startMsg.seed >>> 0);
    this._mapName = mp.name;
    if (isStrat) {
      UI.text(this, W / 2, P ? 70 : 124, '🗺 ' + mp.name + ' — ' + mp.desc,
        { size: 'caption', color: C.textDim, origin: 0.5, originY: 0 });
    }
    //  ── 전장 브리핑 (2026-09-10 태현님 ④) ──────────────────────
    //  ⚠⚠ 줄로 늘리지 않는다. 컨트롤러 쪽은 폰(H 390)에서 이미 꿉찬 차 있어
    //    (영웅 6버튼 + 장비요약 + 스킬줄 + 하단 두 버튼) 그래서 **desc 가 전략가
    //    쪽에만** 있었다 — 정작 태현님이 잡는 컨트롤러가 설명을 못 보던 것이 신고의 정체다.
    //  ⚠ 준비 화면에 둔 이유 — 여기는 60초가 있고 **록스텝 밖**이다. 전투 시작을
    //    늦추면 양쪽 시계가 갈라진다 — 그건 이 저장소가 이미 약속한 경계다.
    //  ⚠⚠ **1:1 에서는 안 띄운다.** v3.46 에 넣을 땐 이게 유일한 안내였지만,
    //    2026-09-11 순서가 «영웅 → 상점 → 맵» 으로 정해졌고 설명은 룰렛이 맡는다.
    //    둘 다 띄우면 룰렛이 «이미 아는 것» 을 돌리는 장치가 된다.
    if (false && GAME.RtFlow._mapBriefAt !== (F.startMsg.seed >>> 0)) {
      GAME.RtFlow._mapBriefAt = (F.startMsg.seed >>> 0);   //  상점 왜복에는 다시 안 뜼다
      this._showBrief(mp);
    }
  }

  var top = P ? 96 : 150;

  if (isStrat) {
    //  저장 배치 목록 — 누르면 그 자리에서 선택 표시, [준비 완료]로 확정.
    var list = GAME.Formations.loadSaved().slice(0, P ? 3 : 5);
    if (!list.length) {
      UI.text(this, W / 2, top + 30,
        '저장된 배치가 없습니다 — 대전 → 내 전장 만들기에서 먼저 만들어 두세요',
        { size: 'caption', color: C.textDim, origin: 0.5 });
    }
    //  재대결 — 지난 판 배치를 미리 고른 채로 둔다(2026-09-10 태현님 ①).
    //  ⚠ 그 배치가 사라졌으면(삭제·이름 변경) 그냥 안 고른 상태다 — 없는 배치로
    //    확정되어 빈 진형으로 들어가는 것보다 낫다.
    var keepId = GAME.RtFlow.lastFormation;
    if (keepId) {
      for (var ki = 0; ki < list.length; ki++)
        if ((list[ki].id || list[ki].name) === keepId) { this._pickedFormation = list[ki]; break; }
    }
    this._formBtns = [];
    var bw = Math.min(W - 40, 560), bh = P ? 46 : 56;
    list.forEach(function (f, i) {
      var b = UI.button(self, W / 2, top + 26 + i * (bh + 8), bw, bh,
        (f.name || '(이름 없음)') + '   ·   ' + (f.units ? f.units.length : 0) + '기',
        function () {
          self._pickedFormation = f;
          GAME.RtFlow.lastFormation = f.id || f.name || null;   //  재대결이 이어받는다(①)
          self._formBtns.forEach(function (fb, j) {
            fb.rect.setStrokeStyle(list[j] === f ? 3 : 1,
              list[j] === f ? GAME.CONFIG.COLORS.strategist : UI.COL.borderUi);
          });
        }, { fontSize: P ? 13 : 15 });
      self._formBtns.push(b);
    });
    //  미리 고른 것을 **화면에도** 표시한다 — 고른 것과 보이는 것이 다르면
    //  사람은 안 고른 줄 알고 다시 누른다(같은 것을 다시 고르게 만드는 셀).
    if (this._pickedFormation) {
      this._formBtns.forEach(function (fb, j) {
        fb.rect.setStrokeStyle(list[j] === self._pickedFormation ? 3 : 1,
          list[j] === self._pickedFormation ? GAME.CONFIG.COLORS.strategist : UI.COL.borderUi);
      });
    }
  } else {
    //  컨트롤러 — 영웅 3종을 **초기화된 스펙으로 새로 고른다** (2026-08-23 태현님).
    //  2026-08-24 ④: 영웅을 고른 뒤 **무기·스킬 드래프트**(예산 500)를 되살렸다 —
    //  단 이월 없는 임시 빌드다(ArenaBuild._rtRec, 판마다 DEFAULT 에서 시작).
    //  상점을 안 다녀오면 기본 스펙 그대로 = "초기화된 상태" 약속 유지.
    this._pickedHero = GAME.RtFlow.myHeroPick || null;   // 상점 왕복 후 선택 복원
    //  상점 영웅 탭에서 영웅을 바꿔 돌아왔으면 그쪽이 최신이다(이미 골랐던 경우만 —
    //  DEFAULT 의 vanguard 가 "안 골랐는데 골라진" 것으로 새지 않게).
    var AB0 = GAME.ArenaBuild;
    if (this._pickedHero && AB0 && AB0._rtRec && AB0._rtRec.heroKey &&
        AB0._rtRec.heroKey !== this._pickedHero) {
      this._pickedHero = AB0._rtRec.heroKey;
      if (GAME.RtFlow.setHeroPick) GAME.RtFlow.setHeroPick(this._pickedHero);
    }
    //  ── 영웅 카드 (2026-09-12 태현님 ③) ─────────────────────────
    //  > "단순 버튼이 아니라 각 영웅의 그림과 각 능력치를 게이지로 보여줬으면"
    //  ⚠ 게이지는 **다섯 영웅 사이의 상대값**이다 — 절대치를 보여 줘봐야
    //    «체력 2000» 이 많은 건지 알 수 없다. 최대인 영웅이 꿉 차고 나머지는 그 비율이다.
    //  ⚠ 카드 크기를 화면에서 역산하되 **글자 하한**을 먼저 지킨다 — 폰(H 390)에서
    //    다섯 칸을 족히려다 글자가 막 눈는 사고를 이 저장소가 두 번 겪었다.
    this._heroBtns = [];
    var hks = GAME.HERO_ORDER || ['vanguard', 'ranger', 'warden'];
    //  게이지 축 — 다섯 사이의 최댓값으로 정규화한다.
    var AXES = [
      { k: '체력', f: function (d) { return d.hp * (1 + (d.armor || 0) / 100); } },
      { k: '공격', f: function (d) { return d.damage / (d.cooldown / 1000); } },
      { k: '방어', f: function (d) { return d.armor || 0; } },
      { k: '이속', f: function (d) { return d.speed; } },
      { k: '사거리', f: function (d) { return d.range; } }
    ];
    var mx = AXES.map(function (ax) {
      var m = 0;
      hks.forEach(function (k) { var v = ax.f(GAME.HEROES[k]); if (v > m) m = v; });
      return m || 1;
    });

    var cols = GAME.Layout.cols(hks.length, { gap: P ? 6 : 10, width: W - (P ? 20 : 40),
                                              left: (P ? 10 : 20), pad: 0 });
    //  ⚠ 자리를 위에서 부터 쌓는다 — 제목(10) · 시계(44) · 안내(70) 아래가 카드의 자리다.
    //    아래로는 스킬 줄·버튼(298)을 비워 둔다 — 처음엔 64/196 으로 잡았다가
    //    시계·안내·스킬 줄이 전부 카드에 묻혔다(실측 스크린샷).
    var cTop = P ? 88 : 116;
    var cH = P ? 150 : 200;
    var self2 = this;
    hks.forEach(function (hk, i) {
      var hd = GAME.HEROES[hk];
      if (!hd) return;
      var cx = cols[i].cx, cw = cols[i].w;
      var g = self2.add.graphics();
      var box = { x: cx - cw / 2, y: cTop, w: cw, h: cH };

      //  카드 판 + 테두리(고른 것은 굵게)
      function paint(on) {
        g.clear();
        g.fillStyle(0xf6ead2, on ? 0.98 : 0.88).fillRoundedRect(box.x, box.y, box.w, box.h, 8);
        g.lineStyle(on ? 3 : 1, on ? GAME.CONFIG.COLORS.controller : 0x8a6a3a, 1)
         .strokeRoundedRect(box.x, box.y, box.w, box.h, 8);
        //  초상 — 카드 위쪽. facing +PI/2 가 정면이다(defend-tower 와 같은 규약).
        //  ⚠ `drawUnitFlat` 은 **발 위치**를 받아 몸을 그 위로 그린다 — 카드 위쪽에
        //    바짝 붙이면 머리가 카드 밖으로 솔아오른다(실측).
        var pr = P ? 14 : 20;
        UI.drawUnitFlat(g, hd, cx, box.y + (P ? 36 : 50), GAME.CONFIG.COLORS.controller,
                        on ? 1 : 0.55, pr / (hd.radius || 17), Math.PI / 2, null, 0);
        //  게이지
        var gy = box.y + (P ? 62 : 84);
        var gw = cw - (P ? 18 : 26);
        var gx = cx - gw / 2;
        for (var a2 = 0; a2 < AXES.length; a2++) {
          var frac = Math.max(0.06, Math.min(1, AXES[a2].f(hd) / mx[a2]));
          var bh = P ? 5 : 7;
          g.fillStyle(0x000000, 0.10).fillRoundedRect(gx, gy + 1, gw, bh, bh / 2);
          g.fillStyle(on ? 0xd88a2a : 0xa08050, on ? 0.95 : 0.6)
           .fillRoundedRect(gx, gy + 1, gw * frac, bh, bh / 2);
          gy += (P ? 17 : 22);
        }
      }
      paint(self2._pickedHero === hk);

      //  글자는 Graphics 위에 따로 — 다시 그릴 때 매번 만들지 않는다.
      var nameT = UI.text(self2, cx, box.y + (P ? 44 : 60), hd.name,
        { size: P ? 'caption' : 'body', color: '#241a10', origin: 0.5 });
      nameT.__box = box;
      var labs = [];
      var ly = box.y + (P ? 58 : 79);
      for (var a3 = 0; a3 < AXES.length; a3++) {
        var lt = UI.text(self2, box.x + (P ? 9 : 13), ly, AXES[a3].k,
          { size: 'micro', color: '#6b5a44', origin: 0, originY: 0 });
        lt.__box = box;
        labs.push(lt);
        ly += (P ? 17 : 22);
      }

      //  탭 — Graphics 에 직접 건다(버튼 원단을 안 쓰므로 내가 잡는다).
      g.setInteractive(new Phaser.Geom.Rectangle(box.x, box.y, box.w, box.h),
                       Phaser.Geom.Rectangle.Contains);
      g.on('pointerdown', function () {
        if (GAME.RtFlow.phase !== 'hero') return;   //  상점 단계에서는 잠긴다
        self2._pickedHero = hk;
        if (GAME.RtFlow.setHeroPick) GAME.RtFlow.setHeroPick(hk);
        if (GAME.RtFlow.sendPick) GAME.RtFlow.sendPick(hk, false);
        self2._heroBtns.forEach(function (c) { c.paint(c.key === hk); });
        self2._refreshLoadout();
        self2._refresh();
      });
      self2._heroBtns.push({ key: hk, g: g, paint: paint, rect: g, text: nameT });
    });
    if (F.phase !== 'hero') {
      //  상점 단계 — 고른 것만 선명하게 남기고 나머지는 흐린다(숨기지 않는다).
      this._heroBtns.forEach(function (c) {
        if (c.key !== self2._pickedHero && c.g.setAlpha) c.g.setAlpha(0.45);
        if (c.key !== self2._pickedHero && c.text && c.text.setAlpha) c.text.setAlpha(0.45);
      });
    }

    //  장비 요약은 타이머 아래 빈 줄에 — 영웅 목록 아래는 폰(H 390)에서 하단
    //  버튼 줄과 겹친다(스크린샷 실측 2026-08-24).
    this._loadoutTxt = UI.text(this, W / 2, P ? 70 : 124, '', {
      size: 'caption', color: C.textDim, origin: 0.5, originY: 0 });
    this._loadoutTxt.setAlign('center');
    //  ── 무작위로 받은 스킬 (2026-09-04 태현님 ①) ─────────────────────────────
    //  ⚠ 장비 요약에 **붙이면 안 된다.** 두 줄이 되는 순간 폰에서 영웅 버튼 윗변
    //    (96+26-23 = 99)을 1px 침범한다(overlap-audit 실측 겹침 2건). 자리는
    //    **영웅 버튼 블록 바로 아래**의 빈 띠 — 마지막 행 바닥에서 역산한다
    //    (고정 y 를 박으면 영웅 수가 늘 때 또 겹친다, 이 폴더의 반복 함정).
    //  ⚠ 카드 블록 **바로 아래**에서 시작한다 — 고정 y 를 박으면 카드 높이가
    //    바뀌는 순간 겹친다(이 파일이 반복해서 겪은 함정).
    var skillY = cTop + cH + (P ? 4 : 8);
    this._skillTxt = UI.text(this, W / 2, skillY, '', {
      size: 'micro', color: C.textDim, origin: 0.5, originY: 0 });
    this._skillTxt.setAlign('center');
    this._skillTxt.setWordWrapWidth(W - 24);
    this._refreshLoadout();
  }

  var byBottom = P ? H - 40 : H - 90;
  var readyY = byBottom - (P ? 52 : 66);
  if (isStrat) {
    this._readyBtn = UI.button(this, W / 2, readyY, Math.min(W - 40, 380),
      P ? 52 : 60, '⚔ 전투 준비 완료', function () { self._commit(); });
  } else {
    //  컨트롤러 — 하단 한 줄에 [🛒 장비 다시] [⚔ 준비 완료] 나란히 (폰 겹침 방지)
    var halfW = Math.min((W - 60) / 2, 260);
    //  ⚠ 라벨이 둘이다 — 아직 상점을 안 다녀왔으면 «상점으로», 다녀왔으면 «장비 다시».
    //    같은 버튼이지만 말을 바꿔야 «지금 뭐할 차례인가» 가 읽힌다.
    //  ⚠ 단계마다 아래 버튼이 다르다(2026-09-11 ①):
    //    · 영웅 단계 — [상점으로] 하나. 여기서 준비 완료를 누를 수 있으면
    //      장비를 안 사고 전투로 가는 길이 생겨 «10초 + 60초» 순서가 무너진다.
    //    · 상점 단계 — [장비 다시] + [준비 완료].
    if (F.phase === 'hero') {
      this._shopBtn = UI.button(this, W / 2, readyY, Math.min(W - 40, 380), P ? 52 : 60,
        '🛒 상점으로', function () {
          if (!self._pickedHero) { self._stateTxt.setText('⚠ 영웅부터 고르세요'); return; }
          //  상점으로 넘어가는 순간이 «영웅 확정» 이다 — 상대 화면에 ✓ 로 뜼다.
          if (GAME.RtFlow.sendPick) GAME.RtFlow.sendPick(self._pickedHero, true);
          GAME.RtFlow.toShop();
          self.scene.start('TowerShop', { mode: 'arena', backTo: 'RtPrep', tab: 'item' });
        }, { fontSize: P ? 14 : 16 });
    } else {
      this._shopBtn = UI.button(this, W / 2 - halfW / 2 - 8, readyY, halfW, P ? 52 : 60,
        '🛒 장비 다시', function () {
          if (!self._pickedHero) { self._stateTxt.setText('⚠ 영웅부터 고르세요'); return; }
          self.scene.start('TowerShop', { mode: 'arena', backTo: 'RtPrep', tab: 'item' });
        }, { fontSize: P ? 13 : 15 });
      this._readyBtn = UI.button(this, W / 2 + halfW / 2 + 8, readyY, halfW,
        P ? 52 : 60, '⚔ 전투 준비 완료', function () { self._commit(); }, { fontSize: P ? 13 : 15 });
    }
  }
  var _self = this;
  GAME.RtFlow.onPick = function () { if (_self.scene && _self.scene.isActive()) _self._refresh(); };
  //  ⚠ 단계가 바뀌면 **화면을 다시 짓는다** — 영웅 단계와 상점 단계는 보여 주는
  //    것이 아예 다르다. 줄만 바꾸려고 하면 안 쓰는 버튼이 남아 오작동한다.
  GAME.RtFlow.onPhase = function () { if (_self.scene && _self.scene.isActive()) _self.scene.restart(); };
  this.events.once('shutdown', function () {
    if (GAME.RtFlow.onPick) GAME.RtFlow.onPick = null;
    if (GAME.RtFlow.onPhase) GAME.RtFlow.onPhase = null;
  });
  this._stateTxt = UI.text(this, W / 2, byBottom, '', {
    size: 'caption', color: C.textDim, origin: 0.5 });
  this._stateTxt.setAlign('center');

  UI.button(this, P ? 64 : 76, P ? 26 : 34, P ? 100 : 120, P ? 40 : 48, '🚪 나가기',
    function () { GAME.RtFlow.abort(); }, { fontSize: P ? 12 : 14 });

  //  Battle 전환은 RtFlow.maybeBattle 이 한다 — 이 씬은 0.4초마다 상태만 다시 그린다.
  this._pump = this.time.addEvent({
    delay: 400, loop: true, callback: function () { self._refresh(); }
  });
  this._refresh();
};

//  ⚠ 상대 선택이 오면 **그 자리에서** 줄을 고친다. 0.5초 틱을 기다리면
//    «실시간으로 보인다» 가 아니라 «잠시 뒤에 보인다» 가 된다.
//  ⚠ 씨를 떠날 때 반드시 떼다 — 상점을 다녀오는 사이에 파괴된 씨의 Text 를
//    건드리면 그 자리에서 터진다(이 저장소의 «씨 재사용» 계열 사고).

//  전장 브리핑 카드 — 탭하면 즉시 닫히고, 안 눈르면 스스로 사라진다.
//  ⚠ 준비 버튼을 막지 않는 것이 이 카드의 유일한 제약이다 — 60초 시계가 돌고 있다.
GAME.RtPrepScene.prototype._showBrief = function (mp) {
  var UI = GAME.UI;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT, P = !!GAME.CONFIG.PHONE;
  var self = this;
  var isNew = GAME.RtMaps.isNew(mp.key);
  GAME.RtMaps.markSeen(mp.key);

  //  ⚠⚠ 색은 `UI.COL` 을 안 쓴다 — 첫 판이 그걸 썼다가 실측 스크린샷에서
  //    **흰 판**으로 떴다(값이 없어 NaN → 흰색). 이 게임의 판은 양피지색이고,
  //    v3.11 이 이미 결론을 내 둑다 — **밝은 판에는 진한 글자**(잍크 라벨).
  var PAPER = 0xf6ead2, INK = '#241a10', EDGE = 0x5a4632, HI = '#8a3b12';

  //  ⚠ 칸을 먼저 잡고 글자를 넣지 않는다 — **글자를 먼저 지어 재고** 그 크기로
  //    칸을 그린다. 고정 높이를 박았더니 규칙줄이 칸 밖으로 샐다(실측).
  //    이 저장소가 반복해서 적은 «고정 오프셋을 박지 말고 실측 높이에서 역산하라» 그대로다.
  var cw = Math.min(W - 28, P ? 380 : 520);
  var wrap = cw - (P ? 24 : 32);
  var objs = [], texts = [], y = 0;
  function put(t, o) {
    o.origin = 0.5; o.originY = 0;
    var x = UI.text(self, W / 2, y, t, o);
    x.setAlign('center'); x.setWordWrapWidth(wrap);
    x.setDepth(9001); x.__overlay = 1;
    texts.push(x); objs.push(x);
    y += x.height + (P ? 4 : 6);
    return x;
  }
  put((isNew ? '✦ 새 전장 · ' : '전장 · ') + mp.name,
      { size: P ? 'subhead' : 'head', color: isNew ? HI : INK });
  put(mp.desc, { size: 'caption', color: INK });
  GAME.RtMaps.rulesOf(mp).forEach(function (ln) { put(ln, { size: 'micro', color: INK }); });
  put('화면을 한 번 탭하면 닫힙니다', { size: 'micro', color: INK });

  var pad = P ? 12 : 16;
  var ch = y + pad * 2 - (P ? 4 : 6);
  var cy = H / 2, top = cy - ch / 2;
  for (var i = 0; i < texts.length; i++) texts[i].y += top + pad;

  var g = this.add.graphics();
  g.fillStyle(0x1a140c, 0.55).fillRect(0, 0, W, H);                 //  장막 — 탭 받이도 겸한다
  g.fillStyle(PAPER, 0.99).fillRoundedRect(W / 2 - cw / 2, top, cw, ch, 10);
  g.lineStyle(2, EDGE, 1).strokeRoundedRect(W / 2 - cw / 2, top, cw, ch, 10);
  g.setDepth(9000);
  //  ⚠ 감사에게 «나는 덮개다» 를 알린다(tools/overlap-audit.js `ovl`).
  //    이게 없으면 아래 버튼과의 겹침이 전부 결함으로 잡힌다.
  g.__overlay = 1;
  objs.push(g);

  this._brief = objs;
  function close() {
    if (!self._brief) return;
    self._brief.forEach(function (o) { try { if (o && o.destroy) o.destroy(); } catch (e) {} });
    self._brief = null;
  }
  //  탭 — 장막이 전체를 덮으므로 아래 버튼이 오작동하지 않는다.
  //  ⚠ 준비 버튼을 오래 막지 않는 것이 이 카드의 유일한 제약이다 — 60초 시계가 돌고 있다.
  g.setInteractive(new Phaser.Geom.Rectangle(0, 0, W, H), Phaser.Geom.Rectangle.Contains);
  g.once('pointerdown', close);
  this.time.delayedCall(isNew ? 6500 : 4200, close);
};

//  ⚠ 영웅 카드는 버튼 원단이 아니라 Graphics 다 — 표시는 각 카드의 paint() 가 한다.
//  ⚠ 예전에는 `rect.setStrokeStyle` 로 테두리만 바꿔지만, 카드는 초상·게이지도
//    같이 진해져야 해서 통째 다시 그린다.
GAME.RtPrepScene.prototype._markHero = function (hks, hk) {
  if (!this._heroBtns) return;
  this._heroBtns.forEach(function (c) { if (c.paint) c.paint(c.key === hk); });
};

GAME.RtPrepScene.prototype._refreshLoadout = function () {
  if (!this._loadoutTxt || !this._loadoutTxt.scene) return;
  var rec = GAME.ArenaBuild ? GAME.ArenaBuild.get() : {};
  var CAT = GAME.TowerShopItems;
  var parts = [];
  if (CAT && rec.items) {
    ['weapon', 'armor', 'boots', 'accessory'].forEach(function (k) {
      var it = rec.items[k] ? CAT.find(k, rec.items[k]) : null;
      if (it) parts.push(CAT.nameFor(it, rec.heroKey));
    });
  }
  //  "산 만큼 실제로 얼마가 붙는가" (2026-08-31 태현님) — 실시간 효과 배율이
  //  반영된 실효값을 같이 적는다. 상점 표기(원값)와 다른 것이 정상이다.
  var eff = parts.length && GAME.ArenaBuild.rtBonusText
    ? GAME.ArenaBuild.rtBonusText(rec.items, rec.rtStats, rec.heroKey) : '';
  //  ⚠ 4슬롯 풀장비 + 실효까지 이름을 다 적으면 PC 에서 타이머와 스친다(감사 실측).
  //    3종 이상은 개수로 접는다 — 이름은 상점(장비 다시)에서 어차피 보인다.
  var head = parts.length <= 2 ? '장비: ' + parts.join(' · ')
                               : '장비 ' + parts.length + '종';
  this._loadoutTxt.setText(parts.length
    ? head + (eff ? '  →  실효 ' + eff : '')
    : '(장비 없음 — 안 사도 됩니다. 기본 스펙으로 출전)');
  //  ── 무작위로 받은 스킬 (2026-09-04 태현님 ①) ────────────────────────────────
  //  고르는 화면이 없어졌으니 **여기서 반드시 말해 줘야 한다.** 받은 줄 모르는 기제는
  //  없는 것과 같다(구슬·축복에서 두 번 배운 것).
  //  ⚠ 장비 요약에 붙여 두 줄로 만들면 폰에서 영웅 버튼 윗변을 침범한다
  //    (overlap-audit 실측 겹침 2건) — 그래서 **자기 줄**을 쓴다.
  if (this._skillTxt && this._skillTxt.scene) {
    var hk = GAME.RtFlow.myHeroPick || rec.heroKey;
    var sn = (hk && GAME.skillPickNames) ? GAME.skillPickNames(hk, GAME.RtFlow.myPicks || rec.picks) : [];
    this._skillTxt.setText(sn.length
      ? ('🎲 이번 판 스킬  ' + sn.map(function (s) { return s.slot + ' ' + s.name; }).join('  ·  '))
      : '');
  }
};

GAME.RtPrepScene.prototype._commit = function () {
  var F = GAME.RtFlow;
  if (!F.active || F.mySetup) return;
  if (F.myRole === 'strategist') {
    var f = this._pickedFormation || GAME.Formations.loadSaved()[0];
    if (!f) { this._stateTxt.setText('⚠ 저장된 배치가 없습니다'); return; }
    F.commitMine(F.buildStrategistSetup(f));
  } else {
    if (!this._pickedHero && !F.myHeroPick) {
      this._stateTxt.setText('⚠ 영웅을 고르세요'); return;
    }
    F.commitMine(F.buildControllerSetup(this._pickedHero));
  }
  this._refresh();
};

//  영웅 키 → 보이는 이름. 없거나 모르는 키면 null(화면은 «고르는 중» 으로 말한다).
function _heroName(k) {
  if (!k) return null;
  var d = GAME.HEROES && GAME.HEROES[k];
  return d ? d.name : null;
}

GAME.RtPrepScene.prototype._refresh = function () {
  var F = GAME.RtFlow;
  if (!F || !F.active) return;                  // Battle 전환 중이면 손대지 않는다
  if (!this._timerTxt || !this._timerTxt.scene) return;
  var s = Math.ceil(F.remainMs() / 1000);
  //  ⚠ 맵 이름을 **안 띄운다**(2026-09-11 태현님 ① 순서) — 전장은 상점이 끝난 뒤
  //    룰렛이 보여 준다. 여기서 미리 띄우면 룰렛이 이미 아는 것을 돌리는 장치가 된다.
  //  ⚠ 협동은 룰렛을 안 돌린다 — 거긴 계속 층·보스를 띄운다.
  this._timerTxt.setText('⏳ ' + s + '초'
    + ((F.coop && this._mapName) ? ('  ·  ' + this._mapName) : ''));
  var who = F.coop ? '파트너' : '상대';
  var mine = F.mySetup ? '나: 준비 완료 ✓' : '나: 준비 중…';
  var theirs = F.local
    ? (who + ': 🤖 봇(' + ((GAME.RtBot && GAME.RtBot.LEVELS[F.botLevel] || {}).name || F.botLevel) + ')')
    : (F.theirSetup ? who + ': 준비 완료 ✓' : who + ': 준비 중…');
  //  ── 서로 어디 고르는가 (2026-09-11 태현님) ──────────────────────
  //  ⚠ **줄을 따로 늘리지 않는다.** 폰(H 390)에는 빈 줄이 없고, 이 줄이 이미
  //    «상대가 뭐 하는가» 를 말하는 자리다. 새 줄을 놓으면 버튼과 겹친다.
  //  ⚠ 상대가 고르는 중이면 «고르는 중» 으로 보여 준다 — **바뀌는 것까지 보이는 것**이
  //    이 단계의 재미라고 태현님이 직접 짚었다("서로 어디고르는지 보이게").
  var pickLine = '';
  if (!F.coop) {
    //  ⚠ 전략가는 영웅을 안 고른다 — 그쪽에 «나: 고르는 중» 을 띄우면 거짓말이다.
    //    대신 **상대(컨트롤러)가 뭔 고르는지**만 보여 준다 — 그게 전략가에게는
    //    배치를 고르는 정보기도 하다("서로 어디 고르는지 보이게" 의 절반).
    var iAmCtrl = (F.myRole !== 'strategist');
    var myH = iAmCtrl ? _heroName(this._pickedHero) : null;
    var thH = F.local ? null : _heroName(F.theirPick);
    if (myH || thH) {
      pickLine = String.fromCharCode(10)
        + (iAmCtrl ? ('⚔ 나: ' + (myH || '고르는 중…') + '   ·   ') : '⚔ ')
        + who + ': '
        + (F.local ? '🤖 봇'
                   : ((thH || '고르는 중…') + (F.theirPickReady ? ' ✓' : '')));
    }
  }
  this._stateTxt.setText(mine + '   ·   ' + theirs + pickLine +
    (F.mySetup && !F.theirSetup ? (String.fromCharCode(10) + who + '가 끝나면 바로 시작됩니다') : ''));

  if (F.mySetup && this._readyBtn && this._readyBtn.text) {
    this._readyBtn.text.setText('⌛ ' + who + '를 기다리는 중…');
  }
};

GAME.RtPrepScene.prototype.shutdown = function () {};
