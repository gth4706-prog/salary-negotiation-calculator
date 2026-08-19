window.GAME = window.GAME || {};
// ============================================================================
//  보스 시트 은행 — 태현님이 생성기로 만들어 온 보스 그림(유니티에서 검증된 그
//  자산)을 웹에서 그대로 재생한다. (2026-08-19 아트 승급 1단계)
//
//  · 메타는 유니티 bossmeta JSON 을 그대로 옮긴 표다(도구: 이 파일 상단 생성 주석).
//    drawScale = px ÷ 게임px (유니티 pixelsPerUnit 과 같은 뜻) —
//    표시 크기 = 타일px ÷ drawScale × (지금 반지름 ÷ 기본 반지름).
//    기본 반지름은 GAME.UNITS 의 원본 radius(프로필 축척 전)다. 세로/폰에서
//    WORLD_SCALE 로 반지름이 줄면 그림도 같은 비율로 준다.
//  · 접지점 앵커 = 타일 아래-가운데(유니티 기본과 동일. pivot 메타가 오면 그 값).
//  · 로드는 판마다 필요한 한 장만(scene.load.image, 비동기) — 준비 전엔 호출부가
//    벡터 폴백으로 그린다(화면이 비지 않는 것이 우선).
//  · phases>1(애니메이션 시트)은 아직 전부 1 이라 정지 프레임만 그린다. 다칸이
//    들어오면 왕복 재생(pingpong)을 여기 더한다 — 유니티 BossView 와 같은 규칙.
// ============================================================================
GAME.BossBank = (function () {
  'use strict';
  var DATA = {
    "bossAshSentry": {"art":"beast:sentry:ash","tileW":1216,"tileH":651,"cols":1,"rows":1,"phases":1,"loopMs":0,"drawScale":3.7849},
    "bossChief": {"art":"chieftain","tileW":1096,"tileH":863,"cols":1,"rows":1,"phases":1,"loopMs":0,"drawScale":5.0174},
    "bossDragonAwakened": {"art":"beast:awakened:ember","tileW":1324,"tileH":711,"cols":1,"rows":1,"phases":1,"loopMs":0,"drawScale":4.1337},
    "bossDragonClaw": {"art":"beast:claw:ember","tileW":1212,"tileH":670,"cols":1,"rows":1,"phases":1,"loopMs":0,"drawScale":3.8953},
    "bossDragonCrack": {"art":"beast:eggeye:ember","tileW":949,"tileH":801,"cols":1,"rows":1,"phases":1,"loopMs":0,"drawScale":4.657},
    "bossDragonEgg": {"art":"beast:egg:ember","tileW":1098,"tileH":790,"cols":1,"rows":1,"phases":1,"loopMs":0,"drawScale":4.593},
    "bossDragonEggCracked": {"art":"beast:eggcrack:ember","tileW":1096,"tileH":865,"cols":1,"rows":1,"phases":1,"loopMs":0,"drawScale":5.0291},
    "bossDragonLord": {"art":"beast:dragon:ember","tileW":1322,"tileH":713,"cols":1,"rows":1,"phases":1,"loopMs":0,"drawScale":4.1453},
    "bossDragonTail": {"art":"beast:tail:ember","tileW":1383,"tileH":481,"cols":1,"rows":1,"phases":1,"loopMs":0,"drawScale":2.7965},
    "bossDrakeAsh": {"art":"beast:drake:ash","tileW":1438,"tileH":654,"cols":1,"rows":1,"phases":1,"loopMs":0,"drawScale":3.8023},
    "bossDrakeFrost": {"art":"beast:drake:frost","tileW":1412,"tileH":642,"cols":1,"rows":1,"phases":1,"loopMs":0,"drawScale":3.7326},
    "bossDrakeStorm": {"art":"beast:drake:storm","tileW":1411,"tileH":671,"cols":1,"rows":1,"phases":1,"loopMs":0,"drawScale":3.9012},
    "bossNest": {"art":"ballista","tileW":1298,"tileH":734,"cols":1,"rows":1,"phases":1,"loopMs":0,"drawScale":4.2674},
    "bossShell": {"art":"guardian","tileW":1055,"tileH":874,"cols":1,"rows":1,"phases":1,"loopMs":0,"drawScale":5.0814}
  };

  var B = {
    DATA: DATA,
    _img: {},          // unit키 → 영속 Phaser.Image (매 프레임 재생성 금지 — v1.66 규율)

    metaOf: function (def) {
      if (!def) return null;
      if (def.key && DATA[def.key]) return { key: def.key, m: DATA[def.key] };
      //  키가 없으면 art 문자열로 찾는다(파생 def 대비).
      if (def.art) {
        for (var k in DATA) if (DATA[k].art === def.art) return { key: k, m: DATA[k] };
      }
      return null;
    },

    //  이 판의 보스 시트를 미리 불러 둔다 — battle 씬 create 에서 부른다.
    ensure: function (scene, def) {
      var e = this.metaOf(def);
      if (!e || !scene || !scene.load) return;
      var texKey = 'bossbank:' + e.key;
      if (scene.textures.exists(texKey)) return;
      scene.load.image(texKey, 'assets/boss/' + e.key + '.png?v=' + (GAME.VERSION || '').replace('v', ''));
      scene.load.start();
    },

    //  준비됐는가 — 그림자를 먼저 그릴지 판단할 때 쓴다(로드 전이면 벡터 폴백).
    ready: function (scene, def) {
      var e = this.metaOf(def);
      return !!(e && scene && scene.textures && scene.textures.exists('bossbank:' + e.key));
    },

    //  씬마다 한 번, 매 프레임 끝에 「이번 프레임에 안 그린 시트」를 숨기는 스윕을
    //  건다. 보스가 죽으면 drawUnit 이 더는 안 불리는데, 영속 Image 는 스스로 안
    //  사라진다 — 이 스윕이 없으면 죽은 보스 그림이 화면에 박제된다(DragonAsset
    //  계열의 알려진 함정).
    _hookSweep: function (scene) {
      if (scene._bossbankSweep) return;
      scene._bossbankSweep = true;
      var self = this;
      scene.events.on('postupdate', function () {
        var fr = scene.game.loop.frame;
        for (var k in self._img) {
          var im = self._img[k];
          if (im && im.visible && im._bbStamp !== undefined && fr - im._bbStamp > 1)
            im.setVisible(false);
        }
      });
      scene.events.once('shutdown', function () { scene._bossbankSweep = false; });
    },

    //  그린다 — 준비돼 있으면 true(호출부는 벡터를 건너뛴다), 아니면 false.
    draw: function (scene, def, sx, sy, rScaled, alpha, facing, depth) {
      var e = this.metaOf(def);
      if (!e) return false;
      var texKey = 'bossbank:' + e.key;
      if (!scene.textures.exists(texKey)) { this.ensure(scene, def); return false; }

      var m = e.m;
      var base = (GAME.UNITS && GAME.UNITS[e.key] && GAME.UNITS[e.key].radius) || rScaled;
      var k = (rScaled / base) / m.drawScale;
      var w = m.tileW * k, h = m.tileH * k;

      var img = this._img[e.key];
      if (!img || !img.scene || img.scene !== scene) {
        if (img && img.destroy) { try { img.destroy(); } catch (err) {} }
        img = scene.add.image(0, 0, texKey);
        this._img[e.key] = img;
      }
      img.setVisible(true);
      img._bbStamp = scene.game.loop.frame;
      this._hookSweep(scene);
      //  접지점: 아래-가운데(피벗 메타가 있으면 그 지점).
      var px = m.pivotX !== undefined ? m.pivotX / m.tileW : 0.5;
      var py = m.pivotY !== undefined ? m.pivotY / m.tileH : 1.0;
      img.setOrigin(px, py);
      img.setDisplaySize(w, h);
      //  화면 위로 넘치면 아래로 민다(용 본체 클램프와 같은 규칙 — 렌더 보정일 뿐
      //  판정 좌표는 안 건드린다).
      var top = sy - h * py;
      var yFix = top < 4 ? (4 - top) : 0;
      img.setPosition(sx, sy + yFix);
      img.setFlipX(facing !== undefined && Math.cos(facing) < 0);
      img.setAlpha(alpha === undefined ? 1 : alpha);
      img.setDepth((depth || 0) + 0.5);
      return true;
    },

    //  씬이 바뀔 때 잔상 정리(씬 인스턴스 캐시 함정 — init 에서 부른다).
    reset: function () {
      for (var k in this._img) {
        var im = this._img[k];
        if (im && im.destroy) { try { im.destroy(); } catch (err) {} }
      }
      this._img = {};
    }
  };
  return B;
})();
