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
      { key: 'rift', name: '균열 지대', desc: '가장자리 균열에 떨어지면 그대로 끝이다',
        pits: [
          { x: 0, y: 0, w: 1, h: 0.055 }, { x: 0, y: 0.945, w: 1, h: 0.055 },
          { x: 0, y: 0, w: 0.075, h: 1 }, { x: 0.925, y: 0, w: 0.075, h: 1 }
        ] },
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
