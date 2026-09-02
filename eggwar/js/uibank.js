// ============================================================================
//  UIBank — 생성 UI 일러스트(메뉴 배경·모드 카드·배너·도장)를 화면에 얹는다.
//
//  2026-08-31 비주얼 개편 2차의 **미리 깔아 두는 배선**이다. 소재는 태현님이
//  브리프(아티팩트 2ef58bdd)대로 생성해 art/drop/ui/ 에 넣고, tools/import-ui.py
//  가 assets/ui/ 로 이식하며 아래 DATA 의 src 를 채운다.
//
//  계약(gearbank/bossbank 와 동일):
//    - src 가 null 이면 그 소재는 "아직 없음" — ready() 가 false 를 돌려주고
//      호출부는 기존 절차(벡터) 그리기로 폴백한다. **화면 변화 0.**
//    - 비동기 로드. LoadingScene 이 preload 한다(gear 와 같은 자리).
//    - 이 은행의 이미지는 메뉴·상점·결과처럼 **씬과 함께 사는 정적 화면**용이라
//      gearbank 의 postupdate 스윕(전투 유령 방지)은 필요 없다 — 씬이 내려가면
//      Phaser 가 같이 지운다.
//  ⚠ 404 프로브 금지: src 를 채우기 전에는 네트워크 요청 자체를 안 한다.
//    (새 파일 URL 을 배포 전에 GET 하면 CDN 에 404 가 눌어붙는 함정 — CLAUDE.md)
// ============================================================================
(function () {
  'use strict';
  var G = (window.GAME = window.GAME || {});

  var DATA = {
    //  ── 브리프 5종 — 도착하면 src 만 채운다 (예: 'assets/ui/bg-menu.png?v=2.91') ──
    bgMenu:     { src: 'assets/ui/bg-menu.png?v=2.93' },   // 1688×780 메뉴 배경 일러스트
    cardTower:  { src: 'assets/ui/card-tower.png?v=2.93' },   // 800×480 통곡의 탑 카드
    cardDefend: { src: 'assets/ui/card-defend.png?v=2.93' },   // 800×480 수성의 탑 카드
    cardVersus: { src: 'assets/ui/card-versus.png?v=2.93' },   // 800×480 대전 카드
    bannerShop: { src: 'assets/ui/banner-shop.png?v=2.93' },   // 1600×240 상점 배너
    texButton:  { src: 'assets/ui/tex-button-stone.png?v=2.93' },   // 600×240 돌판 버튼 원단 (9-slice)
    texPanel:   { src: 'assets/ui/tex-panel-leather.png?v=2.93' },   // 355×486 가죽 패널 원단 (9-slice, inset ~55)
    texPanelCard: { src: 'assets/ui/tex-panel-card.png?v=2.96' },    // 178×244 카드용 저해상판 (inset 28 — 폰 카드 폭 110 에서도 모서리 성립)
    texRibbon:  { src: 'assets/ui/tex-ribbon-bone.png?v=2.93' },   // 440×205 뼈 리본 원단 (원본 — 큰 띠용)
    //  리본 저해상판 (2026-09-02 W4) — 랭킹 제목·상점 탭 바·로딩 제목 뒤 띠. 폭 220.
    //  inset 은 **텍스처 px** 이고 tools/split-ui-sheets.py 가 알파에서 실측해 적는다
    //  (l/r = 말린 끝 폭, t/b = 띠 몸통 상하 가장자리 + 3px). 손으로 고치지 말 것.
    //  ⚠ 한 줄에 둘 것 — 굽기 스크립트가 이 줄의 inset 을 정규식으로 갈아끼운다.
    texRibbonSm: { src: 'assets/ui/tex-ribbon-sm.png?v=3.00', inset: { l: 49, r: 48, t: 35, b: 25 } },
    stampWin:   { src: 'assets/ui/stamp-win.png?v=2.93' },   // 700×700 승리 도장
    stampLose:  { src: 'assets/ui/stamp-lose.png?v=2.93' }    // 700×700 패배 도장
  };

  G.UIBank = {
    DATA: DATA,

    //  LoadingScene 의 preload 에서 부른다. src 없는 키는 건드리지 않는다.
    preload: function (scene) {
      for (var k in DATA) {
        if (!DATA.hasOwnProperty(k) || !DATA[k].src) continue;
        if (scene.textures.exists('ui-' + k)) continue;
        scene.load.image('ui-' + k, DATA[k].src);
      }
    },

    ready: function (scene, key) {
      var d = DATA[key];
      if (!d || !d.src) return false;
      var tm = (scene && scene.textures) || (G.game && G.game.textures);
      return !!(tm && tm.exists('ui-' + key));
    },

    //  지정 상자를 **가득 덮게**(cover) 놓는다 — 배경·배너용. 비율은 유지하고
    //  넘치는 쪽이 잘려 보이게 스케일한다(레터박스 없음).
    cover: function (scene, key, cx, cy, w, h, opts) {
      if (!this.ready(scene, key)) return null;
      opts = opts || {};
      var img = scene.add.image(cx, cy, 'ui-' + key);
      var iw = img.width, ih = img.height;
      var s = Math.max(w / iw, h / ih);
      img.setScale(s);
      //  상자 밖으로 넘친 부분은 crop 으로 잘라 이웃 UI 를 침범하지 않게 한다.
      var cw = Math.min(iw, w / s), ch = Math.min(ih, h / s);
      img.setCrop((iw - cw) / 2, (ih - ch) / 2, cw, ch);
      if (opts.depth !== undefined) img.setDepth(opts.depth);
      if (opts.alpha !== undefined) img.setAlpha(opts.alpha);
      return img;
    },

    //  9-slice — 버튼/패널 원단(texButton 등)을 임의 크기로 늘린다.
    //  inset 은 네 변에서 안 늘어나는 테두리 폭(px, 원본 기준). 소재가 오면
    //  ui-theme 버튼 redraw 가 이걸 밑판으로 쓰고 절차 그리기는 폴백으로 남는다.
    //  inset 은 숫자(네 변 동일) 또는 { l, r, t, b }(리본처럼 비대칭인 원단).
    nineSlice: function (scene, key, cx, cy, w, h, inset, opts) {
      if (!this.ready(scene, key)) return null;
      opts = opts || {};
      var ins = inset || 24;
      var img = (typeof ins === 'object')
        ? scene.add.nineslice(cx, cy, 'ui-' + key, undefined, w, h, ins.l, ins.r, ins.t, ins.b)
        : scene.add.nineslice(cx, cy, 'ui-' + key, undefined, w, h, ins, ins, ins, ins);
      if (opts.depth !== undefined) img.setDepth(opts.depth);
      if (opts.alpha !== undefined) img.setAlpha(opts.alpha);
      return img;
    },

    //  지정 상자 **안에 들어가게**(contain) 놓는다 — 도장·카드 그림용.
    place: function (scene, key, cx, cy, w, h, opts) {
      if (!this.ready(scene, key)) return null;
      opts = opts || {};
      var img = scene.add.image(cx, cy, 'ui-' + key);
      var s = Math.min(w / img.width, h / img.height);
      img.setScale(s);
      if (opts.depth !== undefined) img.setDepth(opts.depth);
      if (opts.alpha !== undefined) img.setAlpha(opts.alpha);
      return img;
    }
  };
})();
