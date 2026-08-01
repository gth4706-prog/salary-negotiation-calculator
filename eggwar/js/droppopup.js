window.GAME = window.GAME || {};

// ============================================================================
//  획득 팝업 (2026-08-02 사용자 지시)
//
//  "보스전이나 일반전에서 스킬북이나 아이템을 획득하면 라운드 끝나고 나서 그거에
//   대해 좀 더 자세히 알려줬으면 좋겠어. 팝업으로 띄워서 알려준다거나 매우 축하해줬으면."
//
//  ## 왜 `js/modal.js` 를 안 쓰는가
//  `Modal` 은 **고르는 창**이다(목록 + onPick). 여기는 고를 것이 없다 — 이미 받았고,
//  알려주는 것이 전부다. 목록 UI 에 한 줄만 넣으면 "왜 선택지가 하나지"가 된다.
//
//  ## 이 화면이 반드시 말해야 하는 것 (구슬·축복에서 두 번 실패한 지점)
//  이 폴더의 축복은 두 번 죽었다. **받은 줄을 몰라서**다. 그때 얻은 규율이
//  `js/orb.js` 주석에 있다 — *언제 무엇을 얻었는지가 몸에 남아야 한다.*
//  그래서 네 가지를 한 화면에 같이 둔다:
//    ① 축하 — 화면을 멈추고 소리를 내고 튕긴다(그냥 한 줄이면 안 읽고 넘긴다)
//    ② 무엇을 — 이름과 등급(3/8단계 같은 자리)
//    ③ **얼마나 좋아지는가** — 지금 낀 것 대비 증가분. 카탈로그의 `note` 는
//       절대값이라 그대로 쓰면 거짓이 된다(`TowerChar._itemGain` 주석 참조)
//    ④ 다음에 뭘 하면 되는가 — 아이템은 이미 장착, 스킬북은 장착 안내
//
//  ## 규율
//  · 이 파일은 **읽기만 한다.** 지급은 이미 `TowerChar` 가 끝냈다(전투 종료 시점).
//    여기서 다시 지급하면 팝업을 두 번 띄웠을 때 두 번 받는다.
//  · 레이아웃은 `GAME.Layout`/`UI.TAP` 규격을 따르고 세로·폰가로에서 폭을 줄인다.
// ============================================================================
GAME.DropPopup = {
  active: null,

  isOpen: function () { return !!this.active; },

  //  drop = { kind:'item'|'skill', name, slotName, tier, total, gain:[], desc, prevName, from }
  open: function (scene, drop, onClose) {
    if (!drop) { if (onClose) onClose(); return null; }
    if (this.active) this.close();

    var UI = GAME.UI, C = GAME.CONFIG.COLORS;
    var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
    var self = this;
    var isItem = drop.kind === 'item';
    var pw = Math.min(W - 40, GAME.CONFIG.PORTRAIT ? 380 : 460);
    var cx = W / 2, cy = H / 2;

    var els = [];
    var veil = scene.add.rectangle(cx, cy, W, H, 0x000000, 0.68)
      .setDepth(4000).setInteractive();
    els.push(veil);

    // 본문 줄을 먼저 조립해야 패널 높이를 정할 수 있다 — 높이를 손으로 박으면
    // 문구가 길어지는 순간 글자가 패널 밖으로 나간다(이 폴더의 상습 함정).
    var lines = [];
    if (isItem) {
      lines.push({ t: (drop.slotName || '장비') + '  ·  ' + (drop.tier || '?') + '/' +
                      (drop.total || 8) + '단계', s: 'caption', c: C.textDim });
      if (drop.prevName) lines.push({ t: drop.prevName + '  →  ' + drop.name, s: 'caption', c: C.textDim });
      (drop.gain || []).forEach(function (g) { lines.push({ t: '▲ ' + g, s: 'body', c: C.accent }); });
      lines.push({ t: '이미 장착했습니다 — 다음 층부터 바로 적용됩니다.', s: 'caption', c: C.textDim });
    } else {
      lines.push({ t: (drop.slot || '') + ' 슬롯 스킬북', s: 'caption', c: C.textDim });
      if (drop.desc) lines.push({ t: drop.desc, s: 'body', c: C.text });
      lines.push({ t: '상점 → 스킬 탭에서 장착할 수 있습니다.', s: 'caption', c: C.textDim });
    }

    var titleH = 44, nameH = 40, gap = 8, btnH = UI.TAP || 52;
    var bodyH = lines.length * 26 + (lines.length - 1) * 2;
    var ph = titleH + nameH + bodyH + btnH + 78;
    var top = cy - ph / 2;

    var panel = scene.add.rectangle(cx, cy, pw, ph, UI.COL.surface)
      .setStrokeStyle(2, C.accent).setDepth(4001);
    els.push(panel);

    // ① 축하 — 소리 + 반짝임 + 튕김. 셋 다 없으면 그냥 안내문이 된다.
    if (GAME.Sound) { try { GAME.Sound.play('win'); } catch (e) {} }
    // 반짝임은 **패널 뒤**에 둔다(장막과 같은 깊이, 나중에 추가되어 위로 온다).
    // 패널 위에 두면 글자 위에 얼룩이 앉아 읽기를 방해한다.
    var spark = scene.add.graphics().setDepth(4000);
    els.push(spark);
    var t0 = 0;
    var sparkEvt = scene.time.addEvent({
      delay: 33, loop: true, callback: function () {
        t0 += 33;
        spark.clear();
        for (var i = 0; i < 14; i++) {
          var a = (i / 14) * Math.PI * 2 + t0 / 900;
          var ph2 = ((t0 / 1200) + i * 0.07) % 1;
          var rr = pw * 0.46 + ph2 * pw * 0.40;
          spark.fillStyle(i % 3 ? 0xffd35c : 0xffffff, (1 - ph2) * 0.6);
          spark.fillCircle(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.62,
                           2 + (1 - ph2) * 4);
        }
      }
    });

    var y = top + 26;
    var title = UI.label(scene, cx, y, isItem ? '🎁  아이템 획득!' : '📖  스킬북 획득!',
                         'heading', C.accent, 0.5).setDepth(4003);
    els.push(title);
    title.setScale(0.4);
    scene.tweens.add({ targets: title, scale: 1, duration: 420, ease: 'Back.easeOut' });
    y += titleH;

    var name = UI.label(scene, cx, y, drop.name, 'title', C.text, 0.5).setDepth(4003);
    els.push(name);
    name.setAlpha(0);
    scene.tweens.add({ targets: name, alpha: 1, duration: 300, delay: 160 });
    y += nameH + gap;

    lines.forEach(function (ln) {
      var e = UI.label(scene, cx, y, ln.t, ln.s, ln.c, 0.5).setDepth(4003);
      e.setWordWrapWidth(pw - 40);
      els.push(e);
      y += 26;
    });

    // 어디서 나왔는지 — 보스 확정분과 일반 층 행운을 구분해 준다.
    // 같은 팝업이 뜨는데 하나는 확정이고 하나는 10% 라면, 그 사실이 화면에 없으면
    // "일반 층에서도 나온다"는 것을 영영 모른다.
    y += 6;
    var fromTxt = drop.from === 'floor' ? '✨ 일반 층에서 떨어졌습니다 (낮은 확률)'
                                        : '☠ 보스 처치 확정 보상';
    var fr = UI.label(scene, cx, y, fromTxt, 'micro', C.textDim, 0.5).setDepth(4003);
    els.push(fr);

    var btn = UI.button(scene, cx, top + ph - btnH / 2 - 18, Math.min(pw - 60, 220), btnH,
      '좋아!', function () { self.close(); if (onClose) onClose(); }, { fontSize: 'button' });
    // ⚠ `UI.button` 은 rect 말고 **gfx** 로 둥근 모서리를 그리는 경우가 있다.
    //   rect 만 depth 를 올리면 배경 판이 장막 뒤에 남아 버튼이 반쯤 사라진다.
    [btn.gfx, btn.rect].forEach(function (e) { if (e && e.setDepth) e.setDepth(4003); });
    btn.text.setDepth(4004);
    if (btn.gfx) els.push(btn.gfx);
    els.push(btn.rect, btn.text);

    // 배경 탭으로도 닫힌다 — 팝업이 진행을 막고 있으므로 출구가 둘이어야 한다.
    veil.setDepth(4000).on('pointerdown', function () {
      self.close(); if (onClose) onClose();
    });

    this.active = { els: els, evt: sparkEvt, scene: scene };
    return this.active;
  },

  close: function () {
    var a = this.active;
    this.active = null;
    if (!a) return;
    if (a.evt) a.evt.remove(false);
    a.els.forEach(function (e) { if (e && e.destroy) e.destroy(); });
  }
};
