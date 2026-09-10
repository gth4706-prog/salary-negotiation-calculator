// ── 실시간 대전 맵 변형 (2026-08-31 태현님 ④) ──────────────────────────────
//  "맵밖으로 벗어나면 죽는 맵, 가시밭이 있어서 밟으면 피가 다는 맵,
//   중간에 벽이 있는맵, 구조물 뒤에 숨을 수 있는맵 등등"
//
//  설계 원칙 (록스텝 결정론):
//  · 맵은 **서버 시드**로 고른다(forSeed) — 양쪽 클라이언트가 같은 판을 본다.
//  · 좌표는 아레나 **비율**로 적는다. 프로필(세로 402×694 / PC)마다 아레나
//    크기가 달라도 상대 기하가 같아야 한다 — WORLD_SCALE 과 같은 이유.
//  · 모든 지형은 **180° 회전 대칭**(x'=1-x-w, y'=1-y-h)이다. 위/아래 진영이
//    같은 지형 조건에서 싸워야 공정하다.
//  · 판정은 전부 js/combat.js 가 한다(시뮬 소유) — 이 파일은 데이터 + 좌표 환산.
//
//  ⚠ 비율 좌표를 잡을 때 지켜야 하는 안전선(어기면 스폰킬이 난다):
//    · ZONE(진형 배치 구역)은 위아래 각 ~30% — **thorns/walls 는 y 0.32~0.68 안에만**
//    · 영웅 스폰: 위 y≈0.09 / 아래 y≈0.86 — pits 가장자리 띠(0.055)와 안 겹친다
//    · pits 는 **영웅만** 죽인다(combat.js) — 진형 유닛이 가장자리에 배치되는
//      경우가 있어 유닛까지 죽이면 배치 자체가 자살이 된다.
(function () {
  'use strict';
  var RM = {
    //  key/name/desc + walls(이동 불가·투사체 차단) / thorns(밟으면 도트) /
    //  pits(영웅 즉사) — 전부 {x,y,w,h} 비율 사각형.
    LIST: [
      { key: 'plain', name: '초원', desc: '아무것도 없는 순수한 결투장' },
      //  ⚠⚠ '균열 지대'(사방 낭떠러지)는 **지웠다** — 2026-09-10 태현님:
      //    "사방이 낭떠러지인맵은 없애자". 네 변이 전부 즉사이면 물러날 곳이 없어
      //    밀어내기·돌진이 «피해» 가 아니라 «처형» 이 된다 — 이 게임이 약속한
      //    "논타겟은 피할 곳이 있어야 한다"와 같은 종류의 위반이다.
      //  ⚠ 그래서 지금 `pits`(영웅 즉사)를 쓰는 맵이 **하나도 없다.** 판정 코드는
      //    js/combat.js 에 그대로 남겨 둔다 — 두 변짜리 낭떠러지로 되살리려면
      //    여기 항목을 다시 넣는 것만으로 된다(태현님 결정).
      { key: 'thorn', name: '가시밭', desc: '가시덤불을 밟으면 피가 마른다',
        thorns: [
          { x: 0.14, y: 0.32, w: 0.28, h: 0.15 },
          { x: 0.58, y: 0.53, w: 0.28, h: 0.15 },
          { x: 0.40, y: 0.425, w: 0.20, h: 0.15 }
        ] },
      { key: 'wall', name: '외벽 협곡', desc: '중앙 돌벽 — 가운데 틈으로만 오간다',
        walls: [
          { x: 0.00, y: 0.47, w: 0.34, h: 0.06 },
          { x: 0.66, y: 0.47, w: 0.34, h: 0.06 }
        ] },
      { key: 'cover', name: '바위 엄폐지', desc: '바위 뒤에 숨으면 화살이 닿지 않는다',
        walls: [
          { x: 0.20, y: 0.34, w: 0.13, h: 0.07 },
          { x: 0.67, y: 0.34, w: 0.13, h: 0.07 },
          { x: 0.20, y: 0.59, w: 0.13, h: 0.07 },
          { x: 0.67, y: 0.59, w: 0.13, h: 0.07 }
        ] }
    ],

    //  시드 → 맵. **월드 좌표로 환산된 사본**을 돌려준다(원본 LIST 는 불변).
    //  ⚠ 환산은 이 시점의 GAME.CONFIG.ARENA 기준이다 — 배틀 진입(create)에서
    //    부르므로 프로필이 이미 확정돼 있다.
    forSeed: function (seed) {
      var def = this.LIST[(seed >>> 0) % this.LIST.length];
      return this.build(def);
    },

    //  ── 이 전장을 본 적 있나 (2026-09-10 태현님 ④) ───────────────
    //  "새로운 전장이 나왔을때 설명이 부족해 어떤 전장인지는 알고 들어가야할듯해"
    //  ⚠ 기록이 없어도 **설명은 매번 띄운다** — 이 값은 «새 전장» 배지만 정한다.
    //    본 적 있다고 설명을 안 보여 주면 몇 판 뒤에 다시 만났을 때 같은 신고가 돌아온다.
    //  ⚠ 저장소가 막혀 있을 수 있다(사상 모드 등) — 못 읽으면 «새 전장» 으로 본다.
    SEEN_KEY: 'eggwar.rtmap.seen',
    isNew: function (key) {
      try {
        var raw = window.localStorage.getItem(this.SEEN_KEY) || '';
        return raw.split(',').indexOf(key) < 0;
      } catch (e) { return true; }
    },
    markSeen: function (key) {
      try {
        var raw = window.localStorage.getItem(this.SEEN_KEY) || '';
        var a = raw ? raw.split(',') : [];
        if (a.indexOf(key) < 0) { a.push(key); window.localStorage.setItem(this.SEEN_KEY, a.join(',')); }
      } catch (e) { /* 못 적어도 해로운 일은 없다 */ }
    },

    //  지형을 **문장으로** 설명한다. desc 는 분위기고 이것은 규칙이다 —
    //  둘을 같이 보여 주어야 "알고 들어간다"가 된다.
    //  ⚠ **이모지를 안 쓴다.** 이 게임은 글꼴 서브셋을 굽어 쓰고 거기 없는 글자는
    //    **두부**로 뜼다 — 첫 판 실측 스크린샷에서 실제로 '?????' 가 찍혔다.
    rulesOf: function (def) {
      var out = [];
      if (def.walls && def.walls.length)
        out.push('돌벽 ' + def.walls.length + '개 — 몸도 화살도 못 지나간다');
      if (def.thorns && def.thorns.length)
        out.push('가시밭 ' + def.thorns.length + '군데 — 밟고 서 있으면 깎인다');
      if (def.pits && def.pits.length)
        out.push('낭떠러지 — 영웅만 떨어지면 즉사한다');
      if (!out.length) out.push('장애물 없음 — 실력만으로 갈린다');
      return out;
    },

    byKey: function (key) {
      for (var i = 0; i < this.LIST.length; i++)
        if (this.LIST[i].key === key) return this.build(this.LIST[i]);
      return null;
    },

    build: function (def) {
      var A = GAME.CONFIG.ARENA;
      function toWorld(list) {
        var out = [];
        for (var i = 0; i < (list || []).length; i++) {
          var r = list[i];
          out.push({ x: A.x + r.x * A.w, y: A.y + r.y * A.h,
                     w: r.w * A.w, h: r.h * A.h });
        }
        return out;
      }
      return {
        key: def.key, name: def.name, desc: def.desc,
        walls: toWorld(def.walls),
        thorns: toWorld(def.thorns),
        pits: toWorld(def.pits)
      };
    }
  };
  GAME.RtMaps = RM;
})();
