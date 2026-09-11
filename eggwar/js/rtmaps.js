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
    //  ── 2026-09-11 태현님 «전장이 너무 진부해» — 일\곱 종으로 재생성 ─────
    //  ⚠⚠ 받은 확률의 합이 **140%** 다(30+20+20+20+10+20+20).
    //    그래서 그대로 확률로 쓰지 않고 **가중치**로 읽어 140 으로 나눔다 —
    //    순서와 상대 비율은 지시 그대로고(평범 최다 · 화살비 최소), 합만 100% 가 된다.
    //    실제 확률: 평원 21.4% · 나머지 각 14.3% · 화살비 7.1%.
    //  ⚠ 좌표는 여전히 아레나 비율이고 지형은 180° 회전 대칭이다(위 머릿글).
    LIST: [
      { key: 'plain', name: '평원', w: 30,
        desc: '아무것도 없는 순수한 결투장',
        rules: ['장애물 없음 — 실력만으로 갈린다'] },

      //  ② 방해꾼 — 어느 편도 아닌 짐승이 가운데 서서 둘 다 때린다.
      //  ⚠ 어렵게 죽는다(체력 배수) — "죽이기 어려운 보스몹"이라 하셨다.
      //    죽일 수 있긴 하되 그걸 하는 동안 상대가 나를 친다 — 그게 이 맵의 질문이다.
      { key: 'beast', name: '야수의 터', w: 20,
        desc: '가운데 짐승이 산다 — 눈이 마주치면 둘 다 물린다',
        rules: ['중립 짐승 1기 — 양쪽을 다 공격한다',
                '매우 단단하다 — 잡는 동안 등을 내주게 된다'],
        //  ⚠ 키를 박지 않는다 — **보스 전체에서 시드로 하나**를 고른다(2026-09-11 ③).
        //    고르는 것은 build() 가 한다 — 시드가 거기까지 가야 양쪽이 같은 놈을 본다.
        //  ⚠ 크기는 20% 더 줄인다(drawMul 0.8) — 그리는 크기만, 반지름은 원본.
        beast: { pick: 'boss', hpMul: 2.2, dmgMul: 0.55, drawMul: 0.8, x: 0.5, y: 0.5 } },

      //  ③ 회복의 샘 — 주기적으로 샘이 솔아난다. 먼저 밟는 쪽이 먹는다.
      { key: 'spring', name: '회복의 샘', w: 20,
        desc: '샘이 솔는다 — 먼저 닿는 쪽이 마신다',
        rules: ['8초마다 샘이 하나씩 · 동시에 최대 4개',
                '가운데에서 멀리 솔는다 — 가지러 가야 한다'],
        spring: { everyMs: 8000, max: 4, firstMs: 4000 } },

      //  ④ 벼락 벌판 — 낙뢰가 **점점 자주** 떨어진다.
      //  ⚠ 기제는 이미 있었다(전장 규칙 storm, side 'field' 라 양편 다 맞는다).
      //    여기서 새로 만든 것은 **램프**(boltRampMs) 하나뿐이다.
      { key: 'bolt', name: '벼락 벌판', w: 20,
        desc: '하늘이 점점 사나워진다 — 한자리에 오래 서 있지 말 것',
        rules: ['낙뢰가 예고 뒤 떨어진다 — 걸어 나가면 피한다',
                '시간이 갈수록 간격이 짧아진다'],
        field: { kind: 'storm', windPx: 0, boltEveryMs: 5200, boltFirst: 3000,
                 boltRampMs: 320, boltMinMs: 1300,
                 boltRadius: 0.062, boltTelegraph: 2000, boltPct: 0.11 } },

      //  ⑤ 화살비 — 위와 같은 «점점 많아진다» 이지만 한 발이 약고 수가 많다.
      { key: 'arrowrain', name: '화살비', w: 10,
        desc: '화살이 쌀아진다 — 멈춰 서 있으면 쌀인다',
        rules: ['예고 뒤 화살이 떨어진다 · 한 발은 약하다',
                '시간이 갈수록 더 많이 쌀아진다'],
        field: { kind: 'arrows', everyMs: 2600, firstMs: 2500, rampMs: 95, minMs: 620,
                 radius: 0.038, telegraph: 1050, pct: 0.045, count: 2 } },

      //  ⑥ 황금알 — 서로의 알을 깨면 이긴다(영웅을 잡아도 이긴다).
      //  ⚠ 크기는 기존보다 줄였다(태현님 지시) — drawMul 0.58.
      { key: 'goldenegg', name: '황금알', w: 20,
        desc: '서로의 황금알을 깨면 이긴다',
        rules: ['내 알이 깨지면 그 자리에서 진다',
                '영웅을 잡아도 이긴다 — 길이 둘이다'],
        //  ⚠⚠ **진짜 황금알을 쓴다**(2026-09-11 ④: "보스몹이 나와 엉망이야").
        //    `bonusEggBreak` 은 보너스 판용 황금알이고 전용 벡터 아트(`goldegg`)가 있다 —
        //    내가 처음에 `bossShell`(껍질 골렘, 진짜 보스)을 박아서 보스몹이 서 있었다.
        egg: { key: 'bonusEggBreak', hpMul: 1.6, drawMul: 0.72, yRatio: 0.12 } },

      //  ⑦ 십자 성벽 — 가운데가 십자로 막혀 네 칸이 된다.
      //  ⚠ 가운데를 통째 막으면 서로 만날 수가 없다 — **네 끝에 틈**을 둠다.
      { key: 'cross', name: '십자 성벽', w: 20,
        desc: '가운데 십자 벙이 전장을 네 칸으로 가른다',
        rules: ['몸도 화살도 못 지나간다', '뒤로 돌아 가야 만난다'],
        //  ⚠⚠ 세로 막대는 **y 0.32~0.68 안에만** 둔다. 처음엔 0.10~0.40 으로
        //    길게 뽑았는데 그건 **진형 배치 구역(위아래 각 30%)을 침범**한다 —
        //    유닛이 벙 안에 배치되고 밀려나가서 진형이 무너진다.
        //    `rt-map-audit` 의 스폰 안전선이 이걸 그 자리에서 잡았다(침범 2개).
        walls: [
          { x: 0.475, y: 0.325, w: 0.05, h: 0.145 },
          { x: 0.475, y: 0.530, w: 0.05, h: 0.145 },
          { x: 0.14, y: 0.475, w: 0.29, h: 0.05 },
          { x: 0.57, y: 0.475, w: 0.29, h: 0.05 }
        ] }
    ],

    //  시드 → 맵. **월드 좌표로 환산된 사본**을 돌려준다(원본 LIST 는 불변).
    //  ⚠ 환산은 이 시점의 GAME.CONFIG.ARENA 기준이다 — 배틀 진입(create)에서
    //    부르므로 프로필이 이미 확정돼 있다.
    //  ⚠⚠ **가중치 추첨이고 반드시 결정적이어야 한다.** 서버가 뿌린 시드 하나로
    //    양쪽 클라이언트가 같은 맵을 뽑아야 한다 — `Math.random` 을 쓰면 그 자리에서
    //    두 사람이 다른 전장을 보게 된다(룰렛이 돌아도 결과는 이미 정해져 있다).
    //  ⚠ 시드를 그대로 쓰지 않고 한 번 섮는다 — 서버 시드는 방 코드에서 오므로
    //    낮은 비트가 고르게 퍼져 있다는 보장이 없다.
    weightTotal: function () {
      var t = 0;
      for (var i = 0; i < this.LIST.length; i++) t += (this.LIST[i].w || 1);
      return t;
    },
    defForSeed: function (seed) {
      var x = (seed >>> 0);
      x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
      var total = this.weightTotal();
      var pick = x % total, acc = 0;
      for (var i = 0; i < this.LIST.length; i++) {
        acc += (this.LIST[i].w || 1);
        if (pick < acc) return this.LIST[i];
      }
      return this.LIST[0];
    },
    forSeed: function (seed) {
      return this.build(this.defForSeed(seed));
    },
    //  화면에 띄울 확률(%) — 룰렛이 칸 크기를 여기서 얻는다.
    pctOf: function (def) {
      return (def.w || 1) / this.weightTotal() * 100;
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
      //  ⚠ 새 기제들도 **여기서 월드 좌표로 풀어야** 한다 — 비율로 둔 채로
      //    넘기면 폰과 PC 에서 다른 자리가 된다(이 파일 머릿글의 이유 그대로).
      function pt(o) {
        if (!o) return null;
        var c = {}, k;
        for (k in o) c[k] = o[k];
        if (o.x !== undefined) c.x = A.x + o.x * A.w;
        if (o.y !== undefined) c.y = A.y + o.y * A.h;
        return c;
      }
      return {
        key: def.key, name: def.name, desc: def.desc,
        rules: (def.rules || []).slice(),
        pct: RM.pctOf(def),
        walls: toWorld(def.walls),
        thorns: toWorld(def.thorns),
        pits: toWorld(def.pits),
        beast: pt(def.beast),   //  key 는 applyRtMap 이 시드로 고른다(pick:'boss')
        spring: def.spring ? pt(def.spring) : null,
        egg: def.egg ? pt(def.egg) : null,
        field: def.field || null
      };
    }
  };
  GAME.RtMaps = RM;
})();
