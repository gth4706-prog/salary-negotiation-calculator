window.GAME = window.GAME || {};

// ============================================================================
//  보스 관절 리깅 (2026-08-22 태현님 지시)
//
//  "외부에서 넣은 이미지들이 실제 움직이는가? 움직이지 않으면 판넬 세워놓은 것과
//   다름없다. 이미지를 관절마다 쪼개 애니메이션화하되, 쪼개진 부분이 빈 공간으로
//   붕 뜨면 안 되고 몸을 벗어나도 안 된다. 실제 보스몹이 살아있다고 느끼게."
//
//  ## 빈 공간·이탈이 구조적으로 안 생기는 설계
//  ① 몸통(base)은 **원본 전체에서 부위의 바깥 영역만** 지운 층이다 — 지운 자리는
//     언제나 그 부위의 움직이는 사본이 뒤(또는 앞)에서 채운다.
//  ② 부위 사본은 관절 반경(eraseR) 안쪽을 base 에 **남겨 두고** 지우므로, 사본이
//     회전해도 관절 뿌리는 base 가 항상 덮는다 → 이음새·구멍이 없다.
//  ③ 회전 진폭을 작게(±3~8°) 제한한다 — 부위 바깥은 투명 배경 위라 어디로 돌아도
//     허공이고, 몸 위 겹침부는 뿌리 반경 안이라 base 가 가린다.
//  ④ 부위 캔버스는 원본과 **같은 크기**다 — 회전 0 이면 base 와 픽셀 단위로 정렬
//     (원점을 관절 좌표 비율로 두고 base 와 같은 표시 크기를 쓰면 좌표 계산이 없다).
//
//  ## 데이터를 늘리는 법
//  RIGS 에 보스 키 하나를 더 적으면 된다: poly(이미지 좌표 다각형) · joint(관절) ·
//  eraseR(뿌리 보호 반경) · behind(몸 뒤에 그릴지) · anim(모션 종류) · phase(위상).
//  좌표는 tools 격자(scratchpad/dragon-grid.png 방식)로 실측해서 적는다.
// ============================================================================
GAME.BossRig = (function () {
  'use strict';

  var RIGS = {
    bossDragonLord: {
      parts: [
        //  왼쪽(화면) 날개 — 몸 뒤 층. 바깥은 전부 투명 배경 위라 크게 돌 수 있다.
        { name: 'wingL', behind: true, joint: [565, 345], eraseR: 215,
          anim: 'wing', phase: 0, amp: 0.10, speed: 2.1,
          poly: [[0, 0], [600, 0], [600, 300], [555, 365], [430, 430], [300, 420], [110, 330], [0, 235]] },
        //  오른쪽 날개 — 반대 위상(교차 날갯짓이 '살아있음'을 만든다).
        { name: 'wingR', behind: true, joint: [830, 330], eraseR: 215,
          anim: 'wing', phase: 2.7, amp: 0.085, speed: 2.1,
          poly: [[598, 0], [1322, 0], [1322, 315], [1150, 340], [975, 315], [830, 355], [700, 335], [635, 300], [598, 195]] },
        //  꼬리 — 몸 뒤. 곤봉 끝이 느리게 휘청인다. 뒷다리(x>500, y>560)는 안 건드린다.
        { name: 'tail', behind: true, joint: [548, 492], eraseR: 150,
          anim: 'tail', phase: 1.1, amp: 0.075, speed: 1.35,
          poly: [[0, 375], [552, 400], [556, 520], [470, 556], [372, 636], [140, 655], [0, 555]] },
        //  머리+목 — 몸 앞 층. 숨쉬듯 끄덕이고, 공격 예고에서 젖혔다가 내리꽂는다.
        { name: 'head', behind: false, joint: [905, 452], eraseR: 175,
          anim: 'head', phase: 0.4, amp: 0.035, speed: 1.7,
          poly: [[858, 295], [1010, 268], [1130, 320], [1230, 396], [1258, 470], [1226, 575], [1090, 648], [948, 606], [872, 522], [856, 415]] }
      ]
    },

    //  ── 전 보스 리깅 확장 (2026-08-22 태현님: "늘였다 줄이는 수준은 안 된다. 싹 다") ──
    //  좌표는 전부 scratchpad/rigid/*-grid.png 격자 실측. 둥지 포탑은 고정 포탑이라
    //  일부러 없다(태현님: "둥지포탑은 안움직이는게 맞고") — bossbank 가 정지 처리한다.
    bossChief: {
      parts: [
        //  등 뒤 깃발 묶음 — 몸 뒤 층, 바람에 흔들린다. 오른변은 투구 해골 돔(x470~)
        //  앞에서 멈춘다(돔이 깃발을 따라 돌면 안 된다).
        { name: 'banner', behind: true, joint: [470, 320], eraseR: 150,
          anim: 'sway', phase: 0.5, amp: 0.035, speed: 1.1,
          poly: [[0, 0], [640, 0], [640, 110], [520, 180], [470, 300], [300, 350], [80, 340], [0, 300]] },
        //  뼈몽둥이 팔 — 예고에서 들었다가 발사에 내리친다. 뼈 능선만 따라 딴다
        //  (가슴 벨트·갈라진 배는 몸이다). 배 위 겹침은 eraseR 260 디스크가 전부 덮는다.
        { name: 'club', behind: false, joint: [560, 590], eraseR: 260,
          anim: 'arm', phase: 0, amp: 0.028, speed: 1.5,
          poly: [[430, 510], [600, 530], [880, 460], [940, 425], [1096, 440], [1096, 660], [1000, 655], [820, 625], [620, 650], [560, 690], [450, 680], [415, 600]] }
      ]
    },
    bossShell: {
      parts: [
        { name: 'banner', behind: true, joint: [450, 310], eraseR: 150,
          anim: 'sway', phase: 1.3, amp: 0.032, speed: 1.05,
          poly: [[0, 0], [600, 0], [600, 110], [500, 180], [450, 300], [300, 340], [80, 330], [0, 300]] },
        { name: 'club', behind: false, joint: [570, 600], eraseR: 260,
          anim: 'arm', phase: 0.6, amp: 0.026, speed: 1.4,
          poly: [[430, 510], [600, 530], [880, 450], [940, 415], [1055, 430], [1055, 660], [1000, 660], [820, 630], [620, 660], [560, 700], [450, 690], [415, 610]] }
      ]
    },
    bossAshSentry: {
      parts: [
        //  꼬리 — 위 갑주 능선까지 포함(y230). 앞다리(x340~)는 안 건드린다.
        { name: 'tail', behind: true, joint: [330, 370], eraseR: 130,
          anim: 'tail', phase: 0.8, amp: 0.07, speed: 1.2,
          poly: [[0, 260], [160, 230], [330, 280], [320, 460], [140, 500], [0, 460]] },
        //  머리 — 뿔 포함. 어깨 혹 판(x<950)은 몸에 남긴다. 앞다리 상단 겹침은 디스크 안.
        { name: 'head', behind: false, joint: [990, 340], eraseR: 170,
          anim: 'head', phase: 0.3, amp: 0.035, speed: 1.5,
          poly: [[950, 130], [1080, 130], [1216, 190], [1216, 500], [1080, 510], [980, 460], [930, 300]] }
      ]
    },
    bossDrakeAsh: {
      parts: [
        { name: 'wingL', behind: true, joint: [730, 300], eraseR: 150,
          anim: 'wing', phase: 0, amp: 0.09, speed: 2.0,
          poly: [[0, 0], [660, 0], [700, 120], [790, 270], [720, 340], [560, 400], [300, 380], [100, 340], [0, 240]] },
        //  아랫변 y300 — 머리 볏뿔(y330~)을 침범하지 않는 선. x>1120 은 y330 까지 내려
        //  막 아랫단을 같이 데려간다(반만 남기면 정지된 띠가 이음새로 보인다).
        { name: 'wingR', behind: true, joint: [960, 290], eraseR: 160,
          anim: 'wing', phase: 2.6, amp: 0.08, speed: 2.0,
          poly: [[900, 0], [1438, 0], [1438, 340], [1120, 330], [1000, 300], [920, 280], [900, 260]] },
        //  꼬리 — 뒷다리 앞선(x560)에서 멈춘다.
        { name: 'tail', behind: true, joint: [540, 470], eraseR: 130,
          anim: 'tail', phase: 1.0, amp: 0.06, speed: 1.3,
          poly: [[50, 380], [540, 410], [560, 540], [380, 590], [140, 560], [40, 480]] },
        { name: 'head', behind: false, joint: [990, 420], eraseR: 130,
          anim: 'head', phase: 0.4, amp: 0.03, speed: 1.7,
          poly: [[960, 350], [1100, 340], [1180, 400], [1160, 500], [1080, 540], [980, 520], [940, 440]] }
      ]
    },
    bossDrakeFrost: {
      parts: [
        { name: 'wingL', behind: true, joint: [690, 260], eraseR: 160,
          anim: 'wing', phase: 0, amp: 0.09, speed: 2.0,
          poly: [[0, 0], [700, 0], [700, 330], [560, 380], [380, 340], [150, 300], [0, 220]] },
        //  목 가시(780~950, y220~) 겹침은 디스크(er150)가 덮는다.
        { name: 'wingR', behind: true, joint: [830, 230], eraseR: 150,
          anim: 'wing', phase: 2.7, amp: 0.08, speed: 2.0,
          poly: [[760, 0], [1412, 0], [1412, 330], [1250, 300], [1100, 260], [950, 270], [800, 250], [760, 180]] },
        //  왼쪽 시작을 y390 으로 — 왼날개 고드름 끝(y300~380)과 픽셀이 겹치면 두 부위가
        //  같은 픽셀을 서로 다르게 움직여 이중상이 된다.
        { name: 'tail', behind: true, joint: [620, 440], eraseR: 130,
          anim: 'tail', phase: 1.1, amp: 0.06, speed: 1.3,
          poly: [[0, 390], [600, 400], [620, 530], [380, 540], [100, 520], [0, 470]] },
        { name: 'head', behind: false, joint: [1010, 410], eraseR: 130,
          anim: 'head', phase: 0.5, amp: 0.03, speed: 1.6,
          poly: [[970, 330], [1120, 320], [1290, 400], [1290, 520], [1150, 560], [1020, 520], [950, 430]] }
      ]
    },
    bossDrakeStorm: {
      parts: [
        { name: 'wingL', behind: true, joint: [670, 270], eraseR: 160,
          anim: 'wing', phase: 0, amp: 0.09, speed: 2.1,
          poly: [[0, 0], [680, 0], [700, 340], [560, 400], [350, 380], [120, 300], [0, 180]] },
        { name: 'wingR', behind: true, joint: [860, 280], eraseR: 150,
          anim: 'wing', phase: 2.5, amp: 0.08, speed: 2.1,
          poly: [[780, 0], [1411, 0], [1411, 230], [1240, 230], [1100, 260], [980, 300], [880, 300], [790, 250]] },
        { name: 'tail', behind: true, joint: [540, 470], eraseR: 130,
          anim: 'tail', phase: 1.2, amp: 0.06, speed: 1.35,
          poly: [[0, 390], [540, 410], [540, 540], [380, 560], [100, 530], [0, 470]] },
        { name: 'head', behind: false, joint: [1020, 430], eraseR: 130,
          anim: 'head', phase: 0.6, amp: 0.03, speed: 1.6,
          poly: [[990, 340], [1140, 340], [1270, 430], [1260, 560], [1130, 590], [1020, 540], [970, 450]] }
      ]
    },
    //  용의 손 — 손가락 넷+엄지가 위상차로 꿈틀거린다(북 치듯 물결). 예고에 오므리고
    //  발사에 펼친다. 관절은 각 손가락 뿌리 마디.
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

  var R = {
    RIGS: RIGS,
    _baked: {},
    _img: {},          //  key:part → 영속 이미지 (bossbank 과 같은 규율 — 매 프레임 생성 금지)

    has: function (key) { return !!RIGS[key]; },

    //  한 번만 굽는다 — 부위 캔버스 N 장 + 바깥이 뚫린 base 한 장.
    bake: function (scene, key, texKey) {
      if (this._baked[key]) return true;
      var rig = RIGS[key];
      var tex = scene.textures.get(texKey);
      if (!tex || texKey === '__MISSING') return false;
      var src = tex.getSourceImage();
      if (!src || !src.width) return false;
      var W = src.width, H = src.height;

      for (var i = 0; i < rig.parts.length; i++) {
        var p = rig.parts[i];
        var pc = scene.textures.createCanvas('rig:' + key + ':' + p.name, W, H);
        var pctx = pc.getContext();
        pctx.save();
        pathPoly(pctx, p.poly);
        pctx.clip();
        pctx.drawImage(src, 0, 0);
        pctx.restore();
        pc.refresh();
      }

      var bc = scene.textures.createCanvas('rig:' + key + ':base', W, H);
      var ctx = bc.getContext();
      ctx.drawImage(src, 0, 0);
      for (var j = 0; j < rig.parts.length; j++) {
        var q = rig.parts[j];
        //  부위의 바깥 영역을 지운다…
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        pathPoly(ctx, q.poly);
        ctx.fill();
        ctx.restore();
        //  …단 관절 뿌리(disk ∩ poly)는 되살린다 — 구멍 금지 규칙의 본체.
        ctx.save();
        ctx.beginPath();
        ctx.arc(q.joint[0], q.joint[1], q.eraseR, 0, Math.PI * 2);
        ctx.clip();
        pathPoly(ctx, q.poly);
        ctx.clip();
        ctx.drawImage(src, 0, 0);
        ctx.restore();
      }
      bc.refresh();
      this._baked[key] = true;
      return true;
    },

    //  부위별 모션(라디안·시간초) — 전부 렌더 전용. 시뮬은 모른다.
    _animRot: function (p, t, atk) {
      var s = Math.sin(t * p.speed + p.phase);
      if (p.anim === 'wing') {
        //  날갯짓 — 공격 중엔 빠르고 크게(위협)
        var boost = 1 + atk.threat * 0.9;
        return s * p.amp * boost;
      }
      if (p.anim === 'tail') return s * p.amp;
      if (p.anim === 'head') {
        //  끄덕임 + 공격 예고(젖힘, 음수) → 발사(내리꽂기, 양수 임펄스)
        return s * p.amp - atk.wind * 0.16 + atk.strike * 0.24;
      }
      if (p.anim === 'arm') {
        //  무기 팔 — 예고에서 들었다가(음수=끝이 위로) 발사에 내리친다.
        //  진폭을 크게 못 잡는 이유: 몽둥이가 배 위를 지나가 큰 회전은 뿌리 디스크
        //  밖에서 구멍을 판다(bossChief 주석). 부족한 타격감은 몸통 런지가 채운다.
        return s * p.amp - atk.wind * 0.07 + atk.strike * 0.12;
      }
      if (p.anim === 'finger') {
        //  손가락 — 위상차 꿈틀거림, 예고에 오므리고(+) 발사에 살짝 펼친다(−)
        return s * p.amp + atk.wind * 0.06 - atk.strike * 0.05;
      }
      return s * p.amp;
    },

    /**
     * 리깅 보스 그리기. bossbank 의 단일 이미지 자리를 대체한다.
     * 반환 false 면 호출부가 단일 이미지로 폴백(굽기 전 화면이 비면 안 된다).
     * geom: { sx, sy, w, h, px, py, flip, alpha, depth }  atk: { wind, strike, threat }
     */
    draw: function (scene, key, texKey, geom, atk) {
      if (!this.bake(scene, key, texKey)) return false;
      var rig = RIGS[key];
      var t = scene.time.now / 1000;
      var W = scene.textures.get(texKey).getSourceImage().width;
      var H = scene.textures.get(texKey).getSourceImage().height;

      //  숨 — 몸 전체가 바닥 기준으로 미세하게 오르내린다(스케일이 아니라 봅 —
      //  스케일은 부위 관절과 어긋난다).
      var bob = Math.sin(t * 1.6) * geom.h * 0.006 - atk.wind * geom.h * 0.012 +
                atk.strike * geom.h * 0.02;
      var lunge = (atk.strike * 0.045 - atk.wind * 0.02) * geom.w * (geom.flip ? -1 : 1);

      var order = [];
      for (var i = 0; i < rig.parts.length; i++) if (rig.parts[i].behind) order.push(rig.parts[i]);
      order.push(null);                                    // null = base
      for (var j = 0; j < rig.parts.length; j++) if (!rig.parts[j].behind) order.push(rig.parts[j]);

      for (var k2 = 0; k2 < order.length; k2++) {
        var p = order[k2];
        var id = key + ':' + (p ? p.name : 'base');
        var img = this._img[id];
        var tkey = 'rig:' + key + ':' + (p ? p.name : 'base');
        if (!img || !img.scene || img.scene !== scene) {
          if (img && img.destroy) { try { img.destroy(); } catch (e) {} }
          img = scene.add.image(0, 0, tkey);
          this._img[id] = img;
        }
        img.setVisible(true);
        img._bbStamp = scene.game.loop.frame;
        var ox, oy, rot = 0;
        if (p) {
          ox = p.joint[0] / W; oy = p.joint[1] / H;
          rot = this._animRot(p, t, atk) * (geom.flip ? -1 : 1);
          if (geom.flip) ox = 1 - ox;
        } else {
          ox = geom.flip ? 1 - geom.px : geom.px; oy = geom.py;
        }
        img.setOrigin(ox, oy);
        img.setDisplaySize(geom.w, geom.h);
        //  원점이 저마다 달라도 **이미지 좌상단이 일치**하면 픽셀이 정렬된다.
        //  base 좌상단 = (sx - px*w, sy - py*h). 각자 원점만큼 되돌려 놓는다.
        var baseLeft = geom.sx - (geom.flip ? 1 - geom.px : geom.px) * geom.w + lunge;
        var baseTop = geom.sy - geom.py * geom.h + bob;
        img.setPosition(baseLeft + ox * geom.w, baseTop + oy * geom.h);
        img.setRotation(rot);
        img.setFlipX(!!geom.flip);
        img.setAlpha(geom.alpha);
        img.setDepth(geom.depth + (p ? (p.behind ? 0.49 : 0.51) : 0.5));
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
