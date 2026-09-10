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
            : (isStrat ? '🛡 전투 준비 — 배치를 고르세요' : '⚔ 전투 준비 — 영웅과 무기를 고르세요')),
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
    if (GAME.RtFlow._mapBriefAt !== (F.startMsg.seed >>> 0)) {
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
    this._heroBtns = [];
    var hks = GAME.HERO_ORDER || ['vanguard', 'ranger', 'warden'];
    var hbw = Math.min(W - 40, 560), hbh = P ? 46 : 56;
    //  영웅이 넷 이상이면 2열(시즌2 다섯 영웅) — 폰 가로(H 390)에서 한 열 다섯 줄은
    //  다섯째 버튼(중심 338)이 준비 버튼(중심 298)을 덮는다(산수: top 96 + 26 + 4×54).
    //  2열 3행이면 마지막 행 바닥 253 < 준비 버튼 위 272. 문구는 이름·정체성만(폭 276).
    var twoCol = hks.length > 3;
    var hcols = twoCol ? GAME.Layout.cols(2, { gap: 8, width: hbw, left: (W - hbw) / 2, pad: 0 }) : null;
    hks.forEach(function (hk, i) {
      var hd = GAME.HEROES[hk];
      if (!hd) return;
      var bx = twoCol ? hcols[i % 2].cx : W / 2;
      var bwid = twoCol ? hcols[i % 2].w : hbw;
      var brow = twoCol ? Math.floor(i / 2) : i;
      var b = UI.button(self, bx, top + 26 + brow * (hbh + 8), bwid, hbh,
        twoCol ? (hd.name + ' · ' + (hd.trait || ''))
               : (hd.name + '   ·   ' + (hd.tagline || hd.desc || '').slice(0, 26)),
        function () {
          self._pickedHero = hk;
          if (GAME.RtFlow.setHeroPick) GAME.RtFlow.setHeroPick(hk);
          //  영웅을 고르면 **곧장 드래프트로** (2026-08-24 태현님: "준비완료하고
          //  아이템·스킬 고르는 순간이 없어") — 별도 버튼은 폰에서 준비 버튼과
          //  겹쳐 안 보였다. RtFlow 는 전역이라 씬을 떠나도 흐름이 안 죽는다.
          self.scene.start('TowerShop', { mode: 'arena', backTo: 'RtPrep', tab: 'item' });
        }, { fontSize: P ? 14 : 16 });
      self._heroBtns.push(b);
    });
    if (this._pickedHero) this._markHero(hks, this._pickedHero);

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
    var rows = twoCol ? Math.ceil(hks.length / 2) : hks.length;
    var skillY = top + 26 + (rows - 1) * (hbh + 8) + hbh / 2 + (P ? 3 : 8);
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
    UI.button(this, W / 2 - halfW / 2 - 8, readyY, halfW, P ? 52 : 60,
      '🛒 장비 다시', function () {
        if (!self._pickedHero) { self._stateTxt.setText('⚠ 영웅부터 고르세요'); return; }
        self.scene.start('TowerShop', { mode: 'arena', backTo: 'RtPrep', tab: 'item' });
      }, { fontSize: P ? 13 : 15 });
    this._readyBtn = UI.button(this, W / 2 + halfW / 2 + 8, readyY, halfW,
      P ? 52 : 60, '⚔ 전투 준비 완료', function () { self._commit(); }, { fontSize: P ? 13 : 15 });
  }
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

GAME.RtPrepScene.prototype._markHero = function (hks, hk) {
  this._heroBtns.forEach(function (hb, j) {
    hb.rect.setStrokeStyle(hks[j] === hk ? 3 : 1,
      hks[j] === hk ? GAME.CONFIG.COLORS.controller : GAME.UI.COL.borderUi);
  });
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

GAME.RtPrepScene.prototype._refresh = function () {
  var F = GAME.RtFlow;
  if (!F || !F.active) return;                  // Battle 전환 중이면 손대지 않는다
  if (!this._timerTxt || !this._timerTxt.scene) return;
  var s = Math.ceil(F.remainMs() / 1000);
  this._timerTxt.setText('⏳ ' + s + '초' + (this._mapName ? '  ·  🗺 ' + this._mapName : ''));
  var who = F.coop ? '파트너' : '상대';
  var mine = F.mySetup ? '나: 준비 완료 ✓' : '나: 준비 중…';
  var theirs = F.local
    ? (who + ': 🤖 봇(' + ((GAME.RtBot && GAME.RtBot.LEVELS[F.botLevel] || {}).name || F.botLevel) + ')')
    : (F.theirSetup ? who + ': 준비 완료 ✓' : who + ': 준비 중…');
  this._stateTxt.setText(mine + '   ·   ' + theirs +
    (F.mySetup && !F.theirSetup ? '\n' + who + '가 끝나면 바로 시작됩니다' : ''));
  if (F.mySetup && this._readyBtn && this._readyBtn.text) {
    this._readyBtn.text.setText('⌛ ' + who + '를 기다리는 중…');
  }
};

GAME.RtPrepScene.prototype.shutdown = function () {};
