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
