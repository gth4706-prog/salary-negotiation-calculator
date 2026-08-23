window.GAME = window.GAME || {};

// ═══════════════════════════════════════════════════════════════════════════
//  전투 요약 오버레이 (2026-08-23 태현님 지시)
//  "내가 입힌 피해량과 몇 초 동안 입혔는지, 흡혈로 얼마나 회복했는지, 적군별로
//   나에게 얼마나 데미지를 줬는지(같은 유형끼리 묶어서) 게이지로 각각 보여주고,
//   승리하면 입힌 피해·패배하면 입은 피해를 기본으로, 탭으로 눌러 바꿔 볼 수 있게."
//
//  데이터는 combat.js 가 전투 중 모은 state.report 다(렌더·판정 무관 부기).
//  Result 씬(패배·대전)과 통곡의 탑 도전 화면(승리 — Result 를 건너뛰므로)이
//  같은 오버레이를 연다. 두 벌로 그리면 조용히 갈라진다 — 한 벌만 둔다.
// ═══════════════════════════════════════════════════════════════════════════
GAME.BattleReport = {
  _objs: null,

  isOpen: function () { return !!this._objs; },

  close: function () {
    if (!this._objs) return;
    for (var i = 0; i < this._objs.length; i++) {
      var o = this._objs[i];
      if (o && o.destroy) { try { o.destroy(); } catch (e) {} }
    }
    this._objs = null;
  },

  //  rep: { dealt, taken:{키:피해}, lsHeal, t0, t1 } · opts: { win, sec, onClose }
  open: function (scene, rep, opts) {
    this.close();
    opts = opts || {};
    if (!rep) return;
    var C = GAME.CONFIG.COLORS;
    var UI = GAME.UI;
    var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
    var P = GAME.CONFIG.SMALL;
    var self = this;
    var objs = this._objs = [];

    var panelW = Math.min(W - (P ? 24 : 80), 560);
    var panelH = Math.min(H - (P ? 20 : 90), P ? 350 : 480);
    var px = (W - panelW) / 2, py = (H - panelH) / 2;
    var D = 6000;

    var veil = scene.add.rectangle(W / 2, H / 2, W, H, 0x05050a, 0.72).setDepth(D);
    veil.setInteractive();
    veil.on('pointerdown', function () { self.close(); if (opts.onClose) opts.onClose(); });
    objs.push(veil);
    objs.push(UI.panel(scene, px, py, panelW, panelH, { level: 1 }).setDepth(D + 1));
    //  제목 글자는 없다 — 여는 버튼이 이미 '📊 전투 요약'이고, 탭 세 개가 곧
    //  이 패널의 제목 역할을 한다(제목을 넣었더니 겹침 감사에 걸렸다).

    //  ── 탭 — 승리는 '입힌 피해', 패배는 '받은 피해'가 기본이다 ────────────────
    var tabs = [
      { key: 'dealt', name: '⚔ 입힌 피해' },
      { key: 'taken', name: '🛡 받은 피해' },
      { key: 'heal', name: '💚 회복' }
    ];
    var cur = opts.win === false ? 'taken' : 'dealt';
    var tabW = Math.floor((panelW - 24 - 16) / 3);
    var tabH = P ? 34 : 40;
    var tabY = py + (P ? 30 : 40);
    var bodyTop = tabY + tabH / 2 + (P ? 10 : 14);
    var bodyObjs = [];

    function clearBody() {
      for (var i = 0; i < bodyObjs.length; i++) {
        var o = bodyObjs[i];
        if (o && o.destroy) { try { o.destroy(); } catch (e) {} }
        var oi = objs.indexOf(o);
        if (oi >= 0) objs.splice(oi, 1);
      }
      bodyObjs = [];
    }
    function add(o) { objs.push(o); bodyObjs.push(o); return o; }

    //  게이지 한 줄 — 이름(왼) · 막대 · 값(오). 막대 폭 = 값/최댓값.
    function gaugeRow(y, name, val, maxVal, color) {
      var gx = px + (P ? 14 : 22), gw = panelW - (P ? 28 : 44);
      var barX = gx + (P ? 96 : 130), barW = gw - (P ? 96 : 130) - (P ? 64 : 84);
      var bh = P ? 14 : 18;
      add(UI.text(scene, gx, y, name,
        { size: P ? 13 : 'caption', color: C.text, origin: 0, originY: 0.5 }).setDepth(D + 2));
      var g = scene.add.graphics().setDepth(D + 2);
      g.fillStyle(GAME.UI.COL.surfaceHi, 1);
      g.fillRoundedRect(barX, y - bh / 2, barW, bh, bh / 2);
      var frac = maxVal > 0 ? Math.max(0.03, Math.min(1, val / maxVal)) : 0;
      if (val > 0) {
        g.fillStyle(color, 1);
        g.fillRoundedRect(barX, y - bh / 2, Math.max(bh, barW * frac), bh, bh / 2);
      }
      add(g);
      add(UI.text(scene, gx + gw, y, UI.numAbbr(Math.round(val)),
        { size: P ? 13 : 'caption', color: C.text, origin: 1, originY: 0.5 }).setDepth(D + 2));
    }

    function nameOf(key) {
      var d = (GAME.UNITS && GAME.UNITS[key]) || (GAME.HEROES && GAME.HEROES[key]);
      return (d && d.name) || key;
    }

    function renderBody() {
      clearBody();
      var y = bodyTop + (P ? 14 : 20);
      var rowGap = P ? 26 : 34;
      if (cur === 'dealt') {
        var secs = Math.max(1, Math.round(((rep.t1 || 0) - (rep.t0 || 0)) / 1000)) || 1;
        var totalSec = opts.sec || secs;
        add(UI.text(scene, W / 2, y, UI.numAbbr(Math.round(rep.dealt)),
          { size: P ? 26 : 34, color: C.accent, origin: 0.5, originY: 0 }).setDepth(D + 2));
        add(UI.text(scene, W / 2, y + (P ? 30 : 40),
          '교전 ' + secs + '초 동안  ·  초당 ' + UI.numAbbr(Math.round(rep.dealt / secs)) +
          '  ·  판 전체 ' + totalSec + '초',
          { size: P ? 12 : 'caption', color: C.textDim, origin: 0.5, originY: 0 }).setDepth(D + 2));
        //  ── 출처 분해 (2026-08-23 태현님: "기본공격과 스킬별로 나눠서, 기본공격은
        //  치명타와 아닌 거 비교") — 평타 두 줄이 항상 맨 위, 스킬은 피해 순. ────────
        var dRows = [];
        var accHex = GAME.UI.cssToHex(C.accent, 0x35d0a5);
        if (rep.basicCrit || rep.basicNorm) {
          dRows.push({ n: '평타 · 치명타', v: rep.basicCrit || 0, col: 0xffd166 });
          dRows.push({ n: '평타 · 일반', v: rep.basicNorm || 0, col: accHex });
        }
        var skRows = [];
        var sks = rep.skills || {};
        for (var sk2 in sks) skRows.push({ n: sk2, v: sks[sk2], col: 0x6ea8fe });
        skRows.sort(function (a, b) { return b.v - a.v; });
        var dMaxRows = P ? 5 : 7;
        var over = dRows.length + skRows.length - dMaxRows;
        if (over > 0) {
          var restV = 0, restN = 0;
          while (skRows.length && dRows.length + skRows.length > dMaxRows) {
            restV += skRows.pop().v; restN++;
          }
          if (restV > 0) skRows.push({ n: '그 외 스킬 ' + restN + '종', v: restV, col: 0x9a9cb6 });
        }
        dRows = dRows.concat(skRows);
        if (rep.etc > 0) dRows.push({ n: '기타(오라 등)', v: rep.etc, col: 0x9a9cb6 });
        var dy = y + (P ? 52 : 72);
        if (!dRows.length) {
          //  구버전 판(분해 수집 이전)의 저장 데이터 — 총량 한 줄로 정직하게.
          gaugeRow(dy + (P ? 14 : 20), '내 피해', rep.dealt, rep.dealt, accHex);
        } else {
          var dMax = 0;
          for (var dm = 0; dm < dRows.length; dm++) dMax = Math.max(dMax, dRows[dm].v);
          for (var dr = 0; dr < dRows.length; dr++) {
            gaugeRow(dy + dr * rowGap, dRows[dr].n, dRows[dr].v, dMax, dRows[dr].col);
          }
        }
      } else if (cur === 'taken') {
        var rows = [];
        for (var k in rep.taken) rows.push({ k: k, v: rep.taken[k] });
        rows.sort(function (a, b) { return b.v - a.v; });
        var maxV = rows.length ? rows[0].v : 0;
        var maxRows = P ? 6 : 8;
        if (!rows.length) {
          add(UI.text(scene, W / 2, y + 10, '받은 피해가 없습니다 — 완벽한 회피!',
            { size: P ? 14 : 'body', color: C.textDim, origin: 0.5 }).setDepth(D + 2));
        }
        for (var r = 0; r < rows.length && r < maxRows; r++) {
          gaugeRow(y + r * rowGap, nameOf(rows[r].k), rows[r].v, maxV,
            GAME.UI.cssToHex(C.danger, 0xef4444));
        }
        //  넘친 유형은 한 줄로 합쳐 정직하게 남긴다.
        if (rows.length > maxRows) {
          var rest = 0;
          for (var r2 = maxRows; r2 < rows.length; r2++) rest += rows[r2].v;
          gaugeRow(y + maxRows * rowGap, '그 외 ' + (rows.length - maxRows) + '종', rest, maxV,
            GAME.UI.cssToHex(C.textFaint, 0x9a9cb6));
        }
      } else {
        add(UI.text(scene, W / 2, y, UI.numAbbr(Math.round(rep.lsHeal)),
          { size: P ? 30 : 40, color: C.good, origin: 0.5, originY: 0 }).setDepth(D + 2));
        add(UI.text(scene, W / 2, y + (P ? 34 : 46), '흡혈로 회복한 체력',
          { size: P ? 12 : 'caption', color: C.textDim, origin: 0.5, originY: 0 }).setDepth(D + 2));
        gaugeRow(y + (P ? 66 : 92), '흡혈 회복', rep.lsHeal, Math.max(rep.lsHeal, 1),
          GAME.UI.cssToHex(C.good, 0x4ade80));
      }
    }

    var tabBtns = [];
    function syncTabs() {
      for (var i = 0; i < tabs.length; i++) {
        var on = tabs[i].key === cur;
        tabBtns[i].rect.setFillStyle(on ? GAME.UI.COL.panelTeal : GAME.UI.COL.surfaceAlt);
        tabBtns[i].rect.setStrokeStyle(on ? 2 : 1,
          on ? GAME.CONFIG.COLORS.controller : GAME.UI.COL.borderUi);
      }
    }
    tabs.forEach(function (tb, i) {
      var bx = px + 12 + tabW / 2 + i * (tabW + 8);
      var b = UI.button(scene, bx, tabY, tabW, tabH, tb.name, function () {
        cur = tb.key; syncTabs(); renderBody();
      }, { fontSize: P ? 12 : 14 });
      b.setDepth(D + 2);
      objs.push(b.gfx, b.rect, b.text);
      tabBtns.push(b);
    });

    var cb = UI.button(scene, W / 2, py + panelH - (P ? 24 : 34),
      Math.min(panelW - 40, 220), P ? 38 : 46, '닫기', function () {
        self.close(); if (opts.onClose) opts.onClose();
      }, { fontSize: P ? 14 : 'buttonSm' });
    cb.setDepth(D + 2);
    objs.push(cb.gfx, cb.rect, cb.text);

    syncTabs();
    renderBody();
    //  씬이 바뀌면 잔재 참조를 끊는다(씬 인스턴스 캐시 함정).
    scene.events.once('shutdown', function () { self._objs = null; });
  }
};
