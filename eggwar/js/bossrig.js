window.GAME = window.GAME || {};

// ============================================================================
//  보스 관절 리깅 (2026-08-22 태현님 지시 → 2026-08-23 3차 확장)
//
//  "이미지를 관절마다 쪼개 애니메이션화하되, 쪼개진 부분이 빈 공간으로 붕 뜨면
//   안 되고 몸을 벗어나도 안 된다. 실제 보스몹이 살아있다고 느끼게."
//
//  ## 구멍·이탈이 구조적으로 없는 3중 설계
//  ① base = 원본에서 부위 바깥만 지운 층. eraseR 디스크 안쪽은 남겨 관절 뿌리를
//     항상 덮는다.
//  ② filler = **부위 픽셀의 정지 사본 ∩ 몸 근처(base 팽창 마스크)** 를 모든 층
//     아래에 깐다. 부위가 회전해 비켜난 자리(등가시 틈, 폴리곤 초승달)를 원래
//     그림이 채운다 — 몸에서 먼 날개 바깥은 마스크가 걸러 이중상이 안 생긴다.
//     (3차 신설 — 태현님: "관절 움직일 때 투명 보이는 것도 중간을 알아서 메꿔라")
//  ③ 회전 진폭 제한(±3~8°). 부위 캔버스는 원본과 같은 크기(회전 0 = 픽셀 정렬).
//
//  ## 3차에서 들어간 것
//  · parent 체인 — 자식 부위는 부모 회전을 물려받아 관절이 2단으로 접힌다.
//  · tipSplit — 날개 부위에 표시만 하면 바깥 45% 를 자동으로 잘라 손목 자식
//    부위를 만든다(수동 실측 불필요, 8장 날개 공통).
//  · anim 'leg' — 걷기. bossbank 가 유닛 이동량에서 만든 위상(atk.walk)과
//    이동 게이트(atk.moving)를 받아 다리가 실제 이동 중에만 번갈아 흔들린다.
//  · 공격 스타일(atk.style: breath/slam/spread) — 같은 젖힘→내리꽂기라도
//    브레스형은 머리가 크게, 내리찍기형은 팔이 크게, 소환형은 날개가 크게.
//  · 등장 연출(atk.intro 0→1) — 부위가 순차적으로 깨어난다(wake 게이트).
// ============================================================================
GAME.BossRig = (function () {
  'use strict';

  var RIGS = {
    bossDragonLord: {
      parts: [
        { name: 'wingL', behind: true, joint: [565, 345], eraseR: 215, tipSplit: true,
          anim: 'wing', phase: 0, amp: 0.10, speed: 2.1,
          poly: [[0, 0], [600, 0], [600, 300], [555, 365], [430, 430], [300, 420], [110, 330], [0, 235]] },
        { name: 'wingR', behind: true, joint: [830, 330], eraseR: 215, tipSplit: true,
          anim: 'wing', phase: 2.7, amp: 0.085, speed: 2.1,
          poly: [[598, 0], [1322, 0], [1322, 315], [1150, 340], [975, 315], [830, 355], [700, 335], [635, 300], [598, 195]] },
        //  꼬리 밑변을 들어올렸다(556→540, 636→600) — 뒷다리 부위와 픽셀이 겹치면
        //  같은 픽셀이 두 속도로 움직여 이중상이 된다.
        { name: 'tail', behind: true, joint: [548, 492], eraseR: 150,
          anim: 'tail', phase: 1.1, amp: 0.075, speed: 1.35,
          poly: [[0, 375], [552, 400], [556, 520], [460, 540], [360, 600], [140, 655], [0, 555]] },
        { name: 'legRear', behind: true, joint: [510, 590], eraseR: 80,
          anim: 'leg', phase: 0, amp: 0.10, speed: 1,
          poly: [[460, 555], [575, 565], [565, 713], [440, 713], [435, 645]] },
        { name: 'legFront', behind: false, joint: [700, 580], eraseR: 90,
          anim: 'leg', phase: 3.14, amp: 0.10, speed: 1,
          poly: [[620, 540], [790, 555], [790, 713], [620, 713]] },
        { name: 'head', behind: false, joint: [940, 462], eraseR: 150,
          anim: 'head', phase: 0.4, amp: 0.035, speed: 1.7,
          poly: [[858, 295], [1010, 268], [1130, 320], [1230, 396], [1258, 470], [1226, 575], [1090, 648], [948, 606], [872, 522], [856, 415]] }
      ]
    },

    bossChief: {
      parts: [
        { name: 'banner', behind: true, joint: [470, 320], eraseR: 150,
          anim: 'sway', phase: 0.5, amp: 0.035, speed: 1.1,
          poly: [[0, 0], [640, 0], [640, 110], [520, 180], [470, 300], [300, 350], [80, 340], [0, 300]] },
        { name: 'club', behind: false, joint: [560, 590], eraseR: 285,
          anim: 'arm', phase: 0, amp: 0.028, speed: 1.5,
          poly: [[430, 510], [600, 530], [880, 460], [940, 425], [1096, 440], [1096, 660], [1000, 655], [820, 625], [620, 650], [560, 690], [450, 680], [415, 600]] },
        //  다리 — 몽둥이 폴리곤 아랫변(y~690)과 안 겹치게 y700 부터.
        { name: 'legL', behind: false, joint: [455, 720], eraseR: 70,
          anim: 'leg', phase: 0, amp: 0.09, speed: 1,
          poly: [[390, 700], [530, 700], [530, 861], [380, 861]] },
        { name: 'legR', behind: false, joint: [740, 700], eraseR: 70,
          anim: 'leg', phase: 3.14, amp: 0.09, speed: 1,
          poly: [[670, 680], [815, 680], [820, 855], [680, 855]] }
      ]
    },
    bossShell: {
      parts: [
        { name: 'banner', behind: true, joint: [450, 310], eraseR: 150,
          anim: 'sway', phase: 1.3, amp: 0.032, speed: 1.05,
          poly: [[0, 0], [600, 0], [600, 110], [500, 180], [450, 300], [300, 340], [80, 330], [0, 300]] },
        { name: 'club', behind: false, joint: [570, 600], eraseR: 285,
          anim: 'arm', phase: 0.6, amp: 0.026, speed: 1.4,
          poly: [[430, 510], [600, 530], [880, 450], [940, 415], [1055, 430], [1055, 660], [1000, 660], [820, 630], [620, 660], [560, 700], [450, 690], [415, 610]] },
        { name: 'legL', behind: false, joint: [455, 730], eraseR: 70,
          anim: 'leg', phase: 0, amp: 0.09, speed: 1,
          poly: [[380, 710], [540, 710], [540, 856], [370, 856]] },
        { name: 'legR', behind: false, joint: [770, 710], eraseR: 70,
          anim: 'leg', phase: 3.14, amp: 0.09, speed: 1,
          poly: [[690, 690], [850, 690], [850, 850], [690, 850]] }
      ]
    },
    bossAshSentry: {
      parts: [
        { name: 'tail', behind: true, joint: [330, 370], eraseR: 130,
          anim: 'tail', phase: 0.8, amp: 0.07, speed: 1.2,
          poly: [[0, 260], [160, 230], [330, 280], [320, 460], [140, 500], [0, 460]] },
        { name: 'head', behind: false, joint: [990, 340], eraseR: 205,
          anim: 'head', phase: 0.3, amp: 0.035, speed: 1.5,
          poly: [[985, 145], [1090, 130], [1216, 190], [1216, 500], [1080, 510], [980, 460], [935, 300]] },
        //  다리 — 검은 사지가 회색 몸과 색으로 갈라져 상자 폴리곤이 안전하다.
        { name: 'legFront', behind: false, joint: [400, 420], eraseR: 80,
          anim: 'leg', phase: 0, amp: 0.09, speed: 1,
          poly: [[330, 380], [475, 395], [475, 611], [330, 611]] },
        { name: 'legRear', behind: false, joint: [900, 450], eraseR: 80,
          anim: 'leg', phase: 3.14, amp: 0.08, speed: 1,
          poly: [[820, 430], [1005, 445], [1010, 611], [820, 611]] }
      ]
    },
    bossDrakeAsh: {
      parts: [
        { name: 'wingL', behind: true, joint: [730, 300], eraseR: 150, tipSplit: true,
          anim: 'wing', phase: 0, amp: 0.09, speed: 2.0,
          poly: [[0, 0], [660, 0], [700, 120], [790, 270], [720, 340], [560, 400], [300, 380], [100, 340], [0, 240]] },
        { name: 'wingR', behind: true, joint: [960, 290], eraseR: 160, tipSplit: true,
          anim: 'wing', phase: 2.6, amp: 0.08, speed: 2.0,
          poly: [[900, 0], [1438, 0], [1438, 340], [1120, 330], [1000, 300], [920, 280], [900, 260]] },
        { name: 'tail', behind: true, joint: [540, 470], eraseR: 130,
          anim: 'tail', phase: 1.0, amp: 0.06, speed: 1.3,
          poly: [[50, 380], [540, 410], [560, 540], [380, 590], [140, 560], [40, 480]] },
        { name: 'head', behind: false, joint: [990, 420], eraseR: 130,
          anim: 'head', phase: 0.4, amp: 0.03, speed: 1.7,
          poly: [[960, 350], [1100, 340], [1180, 400], [1160, 500], [1080, 540], [980, 520], [940, 440]] },
        //  꼬리 폴리곤 오른변(x560)과 안 겹치게 x585 부터.
        { name: 'legRear', behind: false, joint: [630, 480], eraseR: 70,
          anim: 'leg', phase: 0, amp: 0.09, speed: 1,
          poly: [[585, 450], [690, 460], [695, 612], [585, 612]] },
        { name: 'legFront', behind: false, joint: [730, 480], eraseR: 70,
          anim: 'leg', phase: 3.14, amp: 0.09, speed: 1,
          poly: [[695, 455], [795, 465], [800, 612], [695, 612]] }
      ]
    },
    bossDrakeFrost: {
      parts: [
        { name: 'wingL', behind: true, joint: [690, 260], eraseR: 160, tipSplit: true,
          anim: 'wing', phase: 0, amp: 0.09, speed: 2.0,
          poly: [[0, 0], [700, 0], [700, 330], [560, 380], [380, 340], [150, 300], [0, 220]] },
        { name: 'wingR', behind: true, joint: [830, 230], eraseR: 150, tipSplit: true,
          anim: 'wing', phase: 2.7, amp: 0.08, speed: 2.0,
          poly: [[760, 0], [1412, 0], [1412, 330], [1250, 300], [1100, 260], [950, 270], [800, 250], [760, 180]] },
        { name: 'tail', behind: true, joint: [620, 440], eraseR: 130,
          anim: 'tail', phase: 1.1, amp: 0.06, speed: 1.3,
          poly: [[0, 390], [600, 400], [620, 530], [380, 540], [100, 520], [0, 470]] },
        { name: 'head', behind: false, joint: [1010, 410], eraseR: 130,
          anim: 'head', phase: 0.5, amp: 0.03, speed: 1.6,
          poly: [[970, 330], [1120, 320], [1290, 400], [1290, 520], [1150, 560], [1020, 520], [950, 430]] },
        { name: 'legRear', behind: false, joint: [690, 480], eraseR: 75,
          anim: 'leg', phase: 0, amp: 0.09, speed: 1,
          poly: [[628, 450], [770, 465], [770, 640], [628, 640]] },
        { name: 'legFront', behind: false, joint: [880, 500], eraseR: 80,
          anim: 'leg', phase: 3.14, amp: 0.09, speed: 1,
          poly: [[790, 465], [1000, 485], [1000, 640], [790, 640]] }
      ]
    },
    bossDrakeStorm: {
      parts: [
        { name: 'wingL', behind: true, joint: [670, 270], eraseR: 160, tipSplit: true,
          anim: 'wing', phase: 0, amp: 0.09, speed: 2.1,
          poly: [[0, 0], [680, 0], [700, 340], [560, 400], [350, 380], [120, 300], [0, 180]] },
        { name: 'wingR', behind: true, joint: [860, 280], eraseR: 150, tipSplit: true,
          anim: 'wing', phase: 2.5, amp: 0.08, speed: 2.1,
          poly: [[780, 0], [1411, 0], [1411, 230], [1240, 230], [1100, 260], [980, 300], [880, 300], [790, 250]] },
        { name: 'tail', behind: true, joint: [540, 470], eraseR: 130,
          anim: 'tail', phase: 1.2, amp: 0.06, speed: 1.35,
          poly: [[0, 390], [540, 410], [540, 540], [380, 560], [100, 530], [0, 470]] },
        { name: 'head', behind: false, joint: [1020, 430], eraseR: 130,
          anim: 'head', phase: 0.6, amp: 0.03, speed: 1.6,
          poly: [[990, 340], [1140, 340], [1270, 430], [1260, 560], [1130, 590], [1020, 540], [970, 450]] },
        { name: 'legRear', behind: false, joint: [560, 510], eraseR: 75,
          anim: 'leg', phase: 0, amp: 0.09, speed: 1,
          poly: [[545, 470], [640, 485], [640, 660], [545, 660]] },
        { name: 'legFront', behind: false, joint: [790, 510], eraseR: 80,
          anim: 'leg', phase: 3.14, amp: 0.09, speed: 1,
          poly: [[700, 475], [900, 495], [900, 660], [700, 660]] }
      ]
    },
    bossDragonClaw: {
      parts: [
        { name: 'finger1', behind: false, joint: [850, 120], eraseR: 90,
          anim: 'finger', phase: 0, amp: 0.02, speed: 1.6,
          poly: [[820, 60], [1000, 70], [1170, 110], [1170, 220], [1000, 190], [830, 180]] },
        { name: 'finger2', behind: false, joint: [880, 230], eraseR: 90,
          anim: 'finger', phase: 0.7, amp: 0.02, speed: 1.6,
          poly: [[850, 190], [1050, 220], [1180, 250], [1180, 350], [1030, 330], [860, 290]] },
        { name: 'finger3', behind: false, joint: [880, 320], eraseR: 90,
          anim: 'finger', phase: 1.4, amp: 0.02, speed: 1.6,
          poly: [[850, 300], [1000, 330], [1120, 350], [1110, 450], [990, 430], [860, 380]] },
        { name: 'finger4', behind: false, joint: [860, 380], eraseR: 85,
          anim: 'finger', phase: 2.1, amp: 0.02, speed: 1.6,
          poly: [[840, 360], [960, 400], [1000, 470], [990, 540], [920, 540], [850, 450]] },
        { name: 'thumb', behind: false, joint: [640, 390], eraseR: 80,
          anim: 'finger', phase: 2.8, amp: 0.018, speed: 1.6,
          poly: [[520, 380], [700, 400], [700, 540], [580, 545], [510, 470]] }
      ]
    }
  };

  function pathPoly(ctx, poly) {
    ctx.beginPath();
    ctx.moveTo(poly[0][0], poly[0][1]);
    for (var i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
    ctx.closePath();
  }

  //  tipSplit 자동 자식: 관절→최원점 벡터의 45% 지점부터 바깥을 손목 부위로.
  //  수동 실측이 필요 없고, 어느 날개에든 같은 규칙이 걸린다.
  function makeTip(p) {
    var far = null, best = -1;
    for (var i = 0; i < p.poly.length; i++) {
      var dx = p.poly[i][0] - p.joint[0], dy = p.poly[i][1] - p.joint[1];
      var d = dx * dx + dy * dy;
      if (d > best) { best = d; far = p.poly[i]; }
    }
    var dist = Math.sqrt(best);
    var ux = (far[0] - p.joint[0]) / dist, uy = (far[1] - p.joint[1]) / dist;
    return {
      name: p.name + 'Tip', behind: p.behind, parent: p.name,
      joint: [p.joint[0] + ux * dist * 0.5, p.joint[1] + uy * dist * 0.5],
      eraseR: 0, anim: 'wingtip', phase: p.phase + 0.55,
      amp: p.amp * 0.55, speed: p.speed,
      _half: { x: p.joint[0] + ux * dist * 0.38, y: p.joint[1] + uy * dist * 0.38, ux: ux, uy: uy },
      poly: p.poly            //  클리핑은 부모 폴리곤 ∩ 반평면
    };
  }

  function partsOf(key) {
    var rig = RIGS[key];
    if (rig._exp) return rig._exp;
    var out = [];
    for (var i = 0; i < rig.parts.length; i++) {
      out.push(rig.parts[i]);
      if (rig.parts[i].tipSplit) out.push(makeTip(rig.parts[i]));
    }
    rig._exp = out;
    return out;
  }

  var R = {
    RIGS: RIGS,
    _baked: {},
    _img: {},

    has: function (key) { return !!RIGS[key]; },

    bake: function (scene, key, texKey) {
      if (this._baked[key]) return true;
      var tex = scene.textures.get(texKey);
      if (!tex || texKey === '__MISSING') return false;
      var src = tex.getSourceImage();
      if (!src || !src.width) return false;
      var W = src.width, H = src.height;
      var parts = partsOf(key);

      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        var pc = scene.textures.createCanvas('rig:' + key + ':' + p.name, W, H);
        var pctx = pc.getContext();
        pctx.save();
        pathPoly(pctx, p.poly);
        pctx.clip();
        if (p._half) {
          //  반평면(분할선 바깥)을 추가로 클립 — 거대한 사각형을 분할선에 맞춰 놓는다.
          var h2 = p._half, L = 4000;
          pctx.beginPath();
          pctx.moveTo(h2.x - h2.uy * L, h2.y + h2.ux * L);
          pctx.lineTo(h2.x + h2.uy * L, h2.y - h2.ux * L);
          pctx.lineTo(h2.x + h2.uy * L + h2.ux * L, h2.y - h2.ux * L + h2.uy * L);
          pctx.lineTo(h2.x - h2.uy * L + h2.ux * L, h2.y + h2.ux * L + h2.uy * L);
          pctx.closePath();
          pctx.clip();
        }
        pctx.drawImage(src, 0, 0);
        pctx.restore();
        if (p._half) {
          //  분할선 쪽 가장자리를 60px 선형 페이드 — 손목이 부모 날개에 녹아들어
          //  추가 회전 때 직선 이음새가 안 보인다(부모가 아래에서 이어 준다).
          var h3 = p._half;
          var lg = pctx.createLinearGradient(h3.x, h3.y,
                                             h3.x + h3.ux * 60, h3.y + h3.uy * 60);
          lg.addColorStop(0, 'rgba(0,0,0,0)');
          lg.addColorStop(1, 'rgba(0,0,0,1)');
          pctx.save();
          pctx.globalCompositeOperation = 'destination-in';
          pctx.fillStyle = lg;
          pctx.fillRect(0, 0, W, H);
          pctx.restore();
        }
        pc.refresh();
      }

      //  base — 원본 부위(자동 손목 제외: 부모 폴리곤이 이미 지운다)만 지운다.
      var bc = scene.textures.createCanvas('rig:' + key + ':base', W, H);
      var ctx = bc.getContext();
      ctx.drawImage(src, 0, 0);
      for (var j = 0; j < parts.length; j++) {
        var q = parts[j];
        if (q.parent) continue;
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        pathPoly(ctx, q.poly);
        ctx.fill();
        ctx.restore();
        //  뿌리 복원 — 디스크 가장자리를 방사형 페이드로 깎는다. 경계가 또렷하면
        //  부위가 크게 돌 때 정지 사본이 '두 번째 머리'로 보인다(용 머리 실측).
        var tmp = document.createElement('canvas');
        tmp.width = W; tmp.height = H;
        var tctx = tmp.getContext('2d');
        tctx.save();
        tctx.beginPath();
        tctx.arc(q.joint[0], q.joint[1], q.eraseR, 0, Math.PI * 2);
        tctx.clip();
        pathPoly(tctx, q.poly);
        tctx.clip();
        tctx.drawImage(src, 0, 0);
        tctx.restore();
        var grad = tctx.createRadialGradient(q.joint[0], q.joint[1], q.eraseR * 0.55,
                                             q.joint[0], q.joint[1], q.eraseR);
        grad.addColorStop(0, 'rgba(0,0,0,1)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        tctx.save();
        tctx.globalCompositeOperation = 'destination-in';
        tctx.fillStyle = grad;
        tctx.fillRect(0, 0, W, H);
        tctx.restore();
        ctx.drawImage(tmp, 0, 0);
      }
      bc.refresh();

      //  filler — 부위 픽셀의 정지 사본을 몸 근처에만 남겨 모든 층 아래에 깐다.
      //  마스크 = base 실루엣을 원형으로 흩뿌린 팽창(반경 ~34px).
      var mask = document.createElement('canvas');
      mask.width = W; mask.height = H;
      var mctx = mask.getContext('2d');
      for (var r = 10; r <= 34; r += 12) {
        for (var aStep = 0; aStep < 8; aStep++) {
          var ang = aStep * Math.PI / 4;
          mctx.drawImage(bc.canvas, Math.cos(ang) * r, Math.sin(ang) * r);
        }
      }
      mctx.drawImage(bc.canvas, 0, 0);
      var fc = scene.textures.createCanvas('rig:' + key + ':filler', W, H);
      var fctx = fc.getContext();
      for (var j2 = 0; j2 < parts.length; j2++) {
        if (parts[j2].parent) continue;
        //  ⚠ 크게 도는 앞층 부위(머리·팔)는 필러에서 뺀다 — 정지 사본이 회전한
        //  부위 뒤로 비쳐 **잔상**이 된다(태초의 용 머리 실측). 이 부위들의 몸 쪽
        //  뿌리는 eraseR 디스크가 base 에 남겨 두므로 구멍도 안 생긴다.
        if (parts[j2].anim === 'head' || parts[j2].anim === 'arm') continue;
        fctx.save();
        pathPoly(fctx, parts[j2].poly);
        fctx.clip();
        fctx.drawImage(src, 0, 0);
        fctx.restore();
      }
      fctx.save();
      fctx.globalCompositeOperation = 'destination-in';
      fctx.drawImage(mask, 0, 0);
      fctx.restore();
      fc.refresh();

      this._baked[key] = true;
      return true;
    },

    //  스타일 배수 — 공격 타입이 어느 부위를 크게 쓰는가 (2026-08-23 4차: 전부 증폭 +
    //  body* 신설 — 몸통 전체가 접지점 둘레로 젖혔다 꽂힌다. 부위 회전과 달리 모든
    //  층이 함께 돌아 **틈이 구조적으로 안 생기는** 가장 싼 큰 모션이다).
    //  crouch(5차): 웅크림 동안 몸이 내려앉는(+) / 부풀어 오르는(−) 세로 이동 비율.
    //  내리찍기는 깊게 웅크리고, 소환·포효는 가슴을 편다 — 스킬의 '자세'가 갈린다.
    _STYLE: {
      breath: { headWind: 0.24, headStrike: 0.34, armWind: 0.10, armStrike: 0.16, wingThreat: 1.3, fingerWind: 0.08, bodyWind: 0.030, bodyStrike: 0.048, crouch: 0.008 },
      slam:   { headWind: 0.14, headStrike: 0.22, armWind: 0.22, armStrike: 0.34, wingThreat: 1.1, fingerWind: 0.16, bodyWind: 0.055, bodyStrike: 0.085, crouch: 0.024 },
      spread: { headWind: 0.20, headStrike: 0.30, armWind: 0.10, armStrike: 0.16, wingThreat: 2.4, fingerWind: 0.08, bodyWind: 0.026, bodyStrike: 0.040, crouch: -0.012 }
    },
    _styleOf: function (atk) {
      return this._STYLE[atk.style] ||
        { headWind: 0.18, headStrike: 0.26, armWind: 0.08, armStrike: 0.13, wingThreat: 1.0, fingerWind: 0.06, bodyWind: 0.024, bodyStrike: 0.038, crouch: 0.010 };
    },

    _animRot: function (p, t, atk) {
      var s = Math.sin(t * p.speed + p.phase);
      var st = this._styleOf(atk);
      var gait = atk.moving || 0;
      //  5차 — 자연스러움의 재료 셋(bossbank._atkOf 가 만든다):
      //  windE(빠르게 감고 유지) · tremble(감긴 뒤 떨림) · spring(발사 오버슈트 진동).
      var wE = atk.windE !== undefined ? atk.windE : atk.wind;
      var sp = atk.spring !== undefined ? atk.spring : atk.strike;
      var tr = atk.tremble || 0;
      if (p.anim === 'wing' || p.anim === 'wingtip') {
        //  걸을 때 날개가 걸음 박자로 살짝 퍼덕인다 — 몸이 무거워 보이는 비결.
        var boost = 1 + atk.threat * st.wingThreat;
        return s * p.amp * boost + Math.sin(atk.walk + p.phase) * 0.030 * gait;
      }
      if (p.anim === 'tail') {
        //  꼬리는 걸음의 **반박자 뒤**를 따라온다(관성) + 발사 때 채찍처럼 진동한다.
        return s * p.amp + Math.sin(atk.walk * 0.5 + p.phase + 1.2) * 0.055 * gait
               - sp * 0.05;
      }
      if (p.anim === 'head') {
        //  걸음마다 고개가 까딱인다 — "사진이 미끄러진다"를 깨는 가장 큰 신호.
        return s * p.amp - wE * st.headWind + sp * st.headStrike + tr
               + Math.sin(atk.walk + 0.9) * 0.024 * gait;
      }
      if (p.anim === 'arm') {
        return s * p.amp - wE * st.armWind + sp * st.armStrike + tr * 0.7
               + Math.sin(atk.walk + 3.14) * 0.045 * gait;
      }
      if (p.anim === 'finger') return s * p.amp + wE * st.fingerWind - sp * 0.05;
      if (p.anim === 'leg') {
        //  걷기 — 비대칭 걸음(5차): 2차 고조파를 섞어 스윙은 빠르고 디딤은 느리다.
        //  사인 하나면 다리가 '진자'처럼 보인다 — 생물의 다리는 앞으로 차고 천천히 민다.
        var wph = atk.walk + p.phase;
        var sw = Math.sin(wph) + 0.35 * Math.sin(wph * 2);
        return sw * p.amp * 1.45 * gait + sp * 0.02;
      }
      return s * p.amp;   // sway
    },

    draw: function (scene, key, texKey, geom, atk) {
      if (!this.bake(scene, key, texKey)) return false;
      var parts = partsOf(key);
      var t = scene.time.now / 1000;
      var W = scene.textures.get(texKey).getSourceImage().width;
      var H = scene.textures.get(texKey).getSourceImage().height;

      //  걸음 바운스 — 다리 위상과 같은 시계(atk.walk)를 쓰므로 발과 몸이 맞물린다.
      var gait = atk.moving || 0;
      var stBody = this._styleOf(atk);
      var wEb = atk.windE !== undefined ? atk.windE : atk.wind;
      var spb = atk.spring !== undefined ? atk.spring : atk.strike;
      //  crouch — 스킬 자세(5차): 내리찍기는 웅크리고(+), 소환·포효는 편다(−).
      var bob = Math.sin(t * 1.6) * geom.h * 0.006 +
                wEb * geom.h * stBody.crouch +
                atk.strike * geom.h * 0.02 +
                Math.abs(Math.sin(atk.walk)) * geom.h * 0.013 * gait;
      var lunge = (spb * 0.045 - wEb * 0.02) * geom.w * (geom.flip ? -1 : 1);
      //  몸통 전체 회전 — 전진 기울기(걸음) + 스킬 젖힘(windE)/발사 스프링(spring).
      //  접지점 둘레로 모든 층이 함께 돌아 부위 사이에 틈이 생길 수 없다.
      var bodyRot = (gait * 0.045 - wEb * stBody.bodyWind +
                     spb * stBody.bodyStrike) * (geom.flip ? -1 : 1);
      var ax = geom.sx + lunge, ay = geom.sy + bob;
      var baseLeft = geom.sx - (geom.flip ? 1 - geom.px : geom.px) * geom.w + lunge;
      var baseTop = geom.sy - geom.py * geom.h + bob;
      var intro = atk.intro === undefined ? 1 : atk.intro;

      //  그리는 순서: filler(맨 아래) → behind 부위(부모 먼저) → base → 앞 부위
      var order = [{ name: 'filler' }];
      for (var i = 0; i < parts.length; i++) if (parts[i].behind) order.push(parts[i]);
      order.push(null);
      for (var j = 0; j < parts.length; j++) if (!parts[j].behind) order.push(parts[j]);

      var rotMap = {}, posMap = {};
      //  부위 순차 기상 — 원본 부위 수 기준으로 인덱스를 매긴다.
      var wakeIdx = 0, nOrig = 0;
      for (var c = 0; c < parts.length; c++) if (!parts[c].parent) nOrig++;

      for (var k2 = 0; k2 < order.length; k2++) {
        var p = order[k2];
        var isFiller = p && p.name === 'filler';
        var id = key + ':' + (p ? p.name : 'base');
        var img = this._img[id];
        var tkey = 'rig:' + key + ':' + (p ? p.name : 'base');
        if (!img || !img.scene || img.scene !== scene) {
          if (img && img.destroy) { try { img.destroy(); } catch (e) {} }
          img = scene.add.image(0, 0, tkey);
          this._img[id] = img;
        }
        //  전장 레이어 탑승 — 줌(인트로·휠)이 보스만 빼놓고 확대하지 않게(bossbank 참조).
        //  생성이 그리기 순서(filler→behind→base→front)라 컨테이너 add 순서 = 층이 된다.
        if (scene.worldLayer && img.parentContainer !== scene.worldLayer)
          scene.worldLayer.add(img);
        img.setVisible(true);
        img._bbStamp = scene.game.loop.frame;
        var ox, oy, rot = 0;
        if (p && !isFiller) {
          ox = p.joint[0] / W; oy = p.joint[1] / H;
          //  기상 게이트: 자기 차례가 오기 전엔 안 움직인다(0), 차례가 오면 0→1.
          var wk = 1;
          if (intro < 1 && !p.parent) {
            wk = Math.max(0, Math.min(1, intro * (nOrig + 1) - wakeIdx));
            wakeIdx++;
          } else if (intro < 1) {
            wk = Math.max(0, Math.min(1, intro * (nOrig + 1) - nOrig));
          }
          rot = this._animRot(p, t, atk) * wk * (geom.flip ? -1 : 1);
          if (geom.flip) ox = 1 - ox;
        } else {
          ox = geom.flip ? 1 - geom.px : geom.px; oy = geom.py;
        }
        img.setOrigin(ox, oy);
        img.setDisplaySize(geom.w, geom.h);
        var px0 = baseLeft + ox * geom.w, py0 = baseTop + oy * geom.h;
        //  스윙 중인 다리는 살짝 들린다(5차) — 회전만으로는 발끝이 땅에 끌린다.
        //  들려서 빈 자리는 filler(정지 사본)가 밑에서 받친다.
        if (p && p.anim === 'leg') {
          py0 -= Math.max(0, Math.sin(atk.walk + p.phase + 1.35)) *
                 geom.h * 0.010 * (atk.moving || 0);
        }
        //  parent 체인 — 부모 회전을 물려받고, 관절 위치도 부모 둘레를 돈다.
        if (p && p.parent && rotMap[p.parent] !== undefined) {
          var pr = rotMap[p.parent], pp = posMap[p.parent];
          var dx = px0 - pp.x, dy = py0 - pp.y;
          var cs = Math.cos(pr), sn = Math.sin(pr);
          px0 = pp.x + dx * cs - dy * sn;
          py0 = pp.y + dx * sn + dy * cs;
          rot += pr;
        }
        if (p && !isFiller) { rotMap[p.name] = rot; posMap[p.name] = { x: px0, y: py0 }; }
        //  몸통 전체 회전은 **가장 바깥 변환**이다 — 부모 체인 계산(rotMap/posMap)은
        //  회전 전 좌표로 하고, 화면에 놓을 때만 접지점(ax,ay) 둘레로 함께 돌린다.
        var fx0 = px0, fy0 = py0, frot = rot;
        if (bodyRot) {
          var bdx = px0 - ax, bdy = py0 - ay;
          var bcs = Math.cos(bodyRot), bsn = Math.sin(bodyRot);
          fx0 = ax + bdx * bcs - bdy * bsn;
          fy0 = ay + bdx * bsn + bdy * bcs;
          frot = rot + bodyRot;
        }
        img.setPosition(fx0, fy0);
        img.setRotation(frot);
        img.setFlipX(!!geom.flip);
        img.setAlpha(geom.alpha);
        img.setDepth(geom.depth + (isFiller ? 0.47 :
          p ? (p.behind ? (p.parent ? 0.495 : 0.49) : (p.parent ? 0.515 : 0.51)) : 0.5));
      }
      return true;
    },

    reset: function () {
      for (var k in this._img) {
        var im = this._img[k];
        if (im && im.destroy) { try { im.destroy(); } catch (e) {} }
      }
      this._img = {};
    }
  };
  return R;
})();
