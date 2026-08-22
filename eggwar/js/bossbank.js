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
    //  pivotY: 바닥 효과(먼지·흙판)를 시트에서 지우며 실측한 **새 접지선**(px).
    //  안 주면 타일 바닥 — 지운 시트는 바닥에 투명 띠가 남아 발이 떠 보인다.
    "bossAshSentry": {"art":"beast:sentry:ash","tileW":1216,"tileH":651,"cols":1,"rows":1,"phases":1,"loopMs":0,"drawScale":3.7849,"pivotY":609},
    "bossChief": {"art":"chieftain","tileW":1096,"tileH":863,"cols":1,"rows":1,"phases":1,"loopMs":0,"drawScale":5.0174},
    "bossDragonAwakened": {"art":"beast:awakened:ember","tileW":1324,"tileH":711,"cols":1,"rows":1,"phases":1,"loopMs":0,"drawScale":4.1337},
    "bossDragonClaw": {"art":"beast:claw:ember","tileW":1212,"tileH":670,"cols":1,"rows":1,"phases":1,"loopMs":0,"drawScale":3.8953},
    "bossDragonCrack": {"art":"beast:eggeye:ember","tileW":949,"tileH":801,"cols":1,"rows":1,"phases":1,"loopMs":0,"drawScale":4.657},
    "bossDragonEgg": {"art":"beast:egg:ember","tileW":1098,"tileH":790,"cols":1,"rows":1,"phases":1,"loopMs":0,"drawScale":4.593},
    "bossDragonEggCracked": {"art":"beast:eggcrack:ember","tileW":1096,"tileH":865,"cols":1,"rows":1,"phases":1,"loopMs":0,"drawScale":5.0291},
    "bossDragonLord": {"art":"beast:dragon:ember","tileW":1322,"tileH":713,"cols":1,"rows":1,"phases":1,"loopMs":0,"drawScale":4.1453,"sizeMul":1.4},
    "bossDragonTail": {"art":"beast:tail:ember","tileW":1383,"tileH":481,"cols":1,"rows":1,"phases":1,"loopMs":0,"drawScale":2.7965},
    "bossDrakeAsh": {"art":"beast:drake:ash","tileW":1438,"tileH":654,"cols":1,"rows":1,"phases":1,"loopMs":0,"drawScale":3.8023,"pivotY":612},
    "bossDrakeFrost": {"art":"beast:drake:frost","tileW":1412,"tileH":642,"cols":1,"rows":1,"phases":1,"loopMs":0,"drawScale":3.7326,"pivotY":628},
    "bossDrakeStorm": {"art":"beast:drake:storm","tileW":1411,"tileH":671,"cols":1,"rows":1,"phases":1,"loopMs":0,"drawScale":3.9012,"pivotY":658},
    "bossNest": {"art":"ballista","tileW":1298,"tileH":734,"cols":1,"rows":1,"phases":1,"loopMs":0,"drawScale":4.2674},
    "bossShell": {"art":"guardian","tileW":1055,"tileH":874,"cols":1,"rows":1,"phases":1,"loopMs":0,"drawScale":5.0814,"pivotY":858}
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
        //  리그 부위 이미지도 같은 규칙으로 거둔다(죽은 보스의 날개가 남으면 유령).
        if (GAME.BossRig) {
          for (var rk in GAME.BossRig._img) {
            var rim = GAME.BossRig._img[rk];
            if (rim && rim.visible && rim._bbStamp !== undefined && fr - rim._bbStamp > 1)
              rim.setVisible(false);
          }
        }
        //  발사 이펙트 그래픽도 — 죽은 보스의 불티가 남으면 유령.
        for (var fk in self._fxg) {
          var fg = self._fxg[fk] && self._fxg[fk].g;
          if (fg && fg.visible && fg._bbStamp !== undefined && fr - fg._bbStamp > 1)
            fg.setVisible(false);
        }
      });
      scene.events.once('shutdown', function () { scene._bossbankSweep = false; });
    },

    //  그린다 — 준비돼 있으면 true(호출부는 벡터를 건너뛴다), 아니면 false.
    //  ── 공격 신호 (2026-08-22 생동화) — 시뮬 상태를 **읽기만** 해서 모션 위상을 만든다.
    //  wind: 예고 중 0→1 (몸을 젖힌다) · strike: 발사 직후 1→0 (내리꽂는 임펄스) ·
    //  threat: 날갯짓 가속용 합성값. 전부 렌더 전용 — 유닛에 남기는 필드도 렌더 캐시다.
    //  공격 타입 → 모션 스타일. 같은 젖힘이라도 어느 부위가 주역인지가 갈린다.
    _STYLE_OF_TYPE: { barrage: 'breath', shockwave: 'slam', charge: 'slam',
                      healBurst: 'spread', warcry: 'spread' },
    _styleOf: function (def) {
      var ab = (def && def.ability) || (def && def.abilities && def.abilities[0]) || null;
      return (ab && this._STYLE_OF_TYPE[ab.type]) || null;
    },

    _atkOf: function (scene, u, def) {
      if (!u) return { wind: 0, strike: 0, threat: 0, walk: 0, moving: 0, intro: 1, struck: false };
      var now = scene.time.now;
      var st = u._bbAtk || (u._bbAtk = { prevAbil: 0, prevCd: 0, strikeAt: -1e9,
        px: u.x, py: u.y, walk: 0, mv: 0, introAt: now });
      var abilT = u.abilT || 0;
      //  예고 총 길이 — def 에서 읽는다(복수 스킬이면 붙잡힌 현재 스킬).
      var ab = u._abilCur || (u.def && u.def.ability) || null;
      var tel = (ab && ab.telegraph) || 600;
      var wind = abilT > 0 ? Math.max(0, Math.min(1, 1 - abilT / tel)) : 0;
      var struck = false;
      if (st.prevAbil > 0 && abilT <= 0) { st.strikeAt = now; struck = true; }   // 스킬 발사 순간
      if ((u.cd || 0) > st.prevCd + 200) { st.strikeAt = now; struck = true; }   // 평타 발사 순간
      st.prevAbil = abilT;
      st.prevCd = u.cd || 0;
      var strike = Math.max(0, 1 - (now - st.strikeAt) / 420);
      //  걷기 위상 — 시뮬 좌표의 **이동량**만 읽는다(렌더 전용). 멈추면 다리가
      //  중립으로 돌아오도록 이동 게이트(mv)를 부드럽게 붙였다 뗀다.
      var dx = (u.x || 0) - st.px, dy = (u.y || 0) - st.py;
      st.px = u.x; st.py = u.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0.05 && dist < 200) st.walk += dist * 0.055;      // 200+ 는 순간이동(스폰)
      st.mv += ((dist > 0.05 && dist < 200 ? 1 : 0) - st.mv) * 0.22;
      //  등장 연출 — 처음 그려진 순간부터 1.1초.
      var intro = Math.max(0, Math.min(1, (now - st.introAt) / 1100));
      return { wind: wind, strike: strike,
               threat: Math.min(1, wind * 0.7 + strike),
               walk: st.walk, moving: st.mv, intro: intro, struck: struck,
               style: this._styleOf(def || u.def) };
    },

    //  그린다 — 준비돼 있으면 true(호출부는 벡터를 건너뛴다), 아니면 false.
    //  unit: 렌더 전용 참조(공격 모션 위상) — 없으면(카드·로딩 화면) 숨쉬기만 한다.
    draw: function (scene, def, sx, sy, rScaled, alpha, facing, depth, unit) {
      var e = this.metaOf(def);
      if (!e) return false;
      var texKey = 'bossbank:' + e.key;
      if (!scene.textures.exists(texKey)) { this.ensure(scene, def); return false; }

      var m = e.m;
      var base = (GAME.UNITS && GAME.UNITS[e.key] && GAME.UNITS[e.key].radius) || rScaled;
      //  sizeMul: 표시 전용 확대(태초의 용 1.4 — 태현님: "화면에 잘려도 된다").
      //  판정 반지름은 안 건드린다.
      var k = (rScaled / base) / m.drawScale * (m.sizeMul || 1);
      var w = m.tileW * k, h = m.tileH * k;
      var px = m.pivotX !== undefined ? m.pivotX / m.tileW : 0.5;
      var py = m.pivotY !== undefined ? m.pivotY / m.tileH : 1.0;
      var flip = facing !== undefined && Math.cos(facing) < 0;
      var a = alpha === undefined ? 1 : alpha;
      var atk = this._atkOf(scene, unit, def);
      this._hookSweep(scene);

      //  화면 위 넘침 보정(렌더 전용) — 확대 보스는 잘리는 것이 의도라 안 민다.
      var top0 = sy - h * py;
      var yFix = (top0 < 4 && !m.sizeMul) ? (4 - top0) : 0;

      //  발사 순간 이펙트(불티·먼지) — 리그/단일 공통, 렌더 전용.
      this._strikeFx(scene, e.key, def, sx, sy + yFix, w, h, py, flip, depth || 0, atk);

      //  ── 관절 리깅 보스(태초의 용 등) — 부위 층으로 그린다 ──────────────────
      if (GAME.BossRig && GAME.BossRig.has(e.key)) {
        if (GAME.BossRig.draw(scene, e.key, texKey,
              { sx: sx, sy: sy + yFix, w: w, h: h, px: px, py: py,
                flip: flip, alpha: a, depth: (depth || 0) }, atk)) {
          var old2 = this._img[e.key];
          if (old2) old2.setVisible(false);
          return true;
        }
      }

      var img = this._img[e.key];
      if (!img || !img.scene || img.scene !== scene) {
        if (img && img.destroy) { try { img.destroy(); } catch (err) {} }
        img = scene.add.image(0, 0, texKey);
        this._img[e.key] = img;
      }
      img.setVisible(true);
      img._bbStamp = scene.game.loop.frame;
      img.setOrigin(px, py);

      //  ── 절차 모션 (2026-08-22 태현님: "판넬이면 안 된다") ────────────────────
      //  리깅이 없는 보스도 전원 살아 숨쉰다: 호흡(바닥 기준 세로 맥동 + 부피 보존
      //  가로 역맥동) · 미세 흔들림 · 공격 예고 젖힘 → 발사 런지. 알 3종은 심장처럼
      //  더 크게 두근거린다(세계관: 안에서 뭔가 산다).
      var t = scene.time.now / 1000;
      var seed = (e.key.charCodeAt(4) || 0) * 0.7;       // 보스마다 위상이 다르게
      var isEgg = /Egg|Crack/.test(e.key);
      var isTurret = e.key === 'bossNest';
      //  등장 팝 — 처음 1.1초 동안 0.92 → 1.0 (포탑은 구조물이라 제외).
      var introPop = isTurret ? 1 : (0.92 + 0.08 * (1 - Math.pow(1 - atk.intro, 2)));
      var ky, kx, rot;
      if (isTurret) {
        //  둥지 포탑은 고정 구조물 — 숨쉬지 않는다(태현님: "안 움직이는 게 맞고").
        //  살아있는 건 발사 반동뿐이다(아래 lunge/strike 항만 남는다).
        ky = 1 + atk.strike * 0.02;
        kx = 1;
        rot = 0;
      } else if (isEgg) {
        //  알 3종 — 좌우로 '늘어나는' 게 아니라 **심장이 친다**: sin 을 5제곱해
        //  두근-쉼-두근의 뾰족한 박동파를 만들고, 박동 순간에만 위로 부푼다.
        //  껍질이 흔들리는 미세 락킹(저주파 회전)이 "안에서 뭔가 민다"를 만든다.
        var raw = Math.sin(t * 3.1 + seed);
        var th = Math.max(0, raw); th = th * th * th * th * th;
        ky = 1 + th * 0.055 + atk.strike * 0.02;
        kx = 1 - th * 0.028;
        rot = Math.sin(t * 1.15 + seed) * 0.014 + th * 0.006;
      } else {
        //  그 외(리깅 없는 예비 자산 폴백) — 호흡 + 스웨이.
        var br = Math.sin(t * 1.8 + seed);
        ky = 1 + br * 0.016 + atk.strike * 0.03 - atk.wind * 0.02;
        kx = 1 - br * 0.016 * 0.55 + atk.wind * 0.015;
        rot = Math.sin(t * 0.9 + seed) * 0.010 + (atk.strike * 0.025 - atk.wind * 0.015);
      }
      img.setDisplaySize(w * kx * introPop, h * ky * introPop);
      img.setRotation(rot * (flip ? -1 : 1));
      var lunge = isTurret ? 0 :
        (atk.strike * 0.05 - atk.wind * 0.022) * w * (flip ? -1 : 1);
      img.setPosition(sx + lunge, sy + yFix);
      img.setFlipX(flip);
      img.setAlpha(a);
      img.setDepth((depth || 0) + 0.5);
      return true;
    },

    //  ── 발사 순간 이펙트 (2026-08-23 3차: "이펙트 동기화") ────────────────────
    //  렌더 전용 파티클 — strike 전이 프레임에 입가에서 불티, slam 스타일은 바닥
    //  먼지. Math.random 을 써도 되는 곳이다(시뮬 무접촉·digest 무관).
    _fxg: {},           // key → { g: Graphics, ps: [...] }
    _strikeFx: function (scene, key, def, sx, syG, w, h, py, flip, depth, atk) {
      var fx = this._fxg[key];
      if (!fx || !fx.g || !fx.g.scene || fx.g.scene !== scene) {
        if (fx && fx.g && fx.g.destroy) { try { fx.g.destroy(); } catch (e) {} }
        fx = this._fxg[key] = { g: scene.add.graphics(), ps: [] };
      }
      var g = fx.g;
      g.setDepth(depth + 0.62);
      g.setVisible(true);
      g._bbStamp = scene.game.loop.frame;
      var now = scene.time.now;
      if (atk.struck) {
        var dir = flip ? -1 : 1;
        var isEgg = /Egg|Crack/.test(key);
        //  입(머리 쪽) 위치 근사 — 시트가 전부 오른쪽을 보므로 앞쪽 1/3 지점.
        var mx = sx + dir * w * 0.34, my = syG - h * py + h * 0.34;
        if (isEgg) { mx = sx; my = syG - h * py + h * 0.5; }
        var glow = 0xffa243;
        try {
          if (GAME.BossArt && GAME.BossArt.TONE && def && def.art) {
            var kind = def.art.split(':')[2];
            if (GAME.BossArt.TONE[kind] && GAME.BossArt.TONE[kind].glow)
              glow = GAME.BossArt.TONE[kind].glow;
          }
        } catch (e2) {}
        for (var i = 0; i < 10; i++) {
          var an = (Math.random() - 0.5) * 1.6 + (dir > 0 ? 0 : Math.PI);
          var sp = 60 + Math.random() * 160;
          fx.ps.push({ x: mx, y: my, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - 40,
                       t0: now, life: 380 + Math.random() * 240, r: 2 + Math.random() * 3, col: glow });
        }
        //  내리찍기형은 바닥 먼지도 — 발치에서 옆으로 퍼진다.
        if (atk.style === 'slam') {
          for (var d2 = 0; d2 < 8; d2++) {
            var side = d2 % 2 ? 1 : -1;
            fx.ps.push({ x: sx + side * (10 + Math.random() * w * 0.2), y: syG - 4,
                         vx: side * (40 + Math.random() * 90), vy: -(20 + Math.random() * 50),
                         t0: now, life: 460 + Math.random() * 200, r: 3 + Math.random() * 4, col: 0x9b8f7c });
          }
        }
      }
      g.clear();
      if (!fx.ps.length) return;
      var keep = [];
      for (var j = 0; j < fx.ps.length; j++) {
        var p = fx.ps[j];
        var age = (now - p.t0) / p.life;
        if (age >= 1) continue;
        keep.push(p);
        var dt2 = (now - p.t0) / 1000;
        var x2 = p.x + p.vx * dt2, y2 = p.y + p.vy * dt2 + 90 * dt2 * dt2;
        g.fillStyle(p.col, 0.85 * (1 - age));
        g.fillCircle(x2, y2, p.r * (1 - age * 0.5));
      }
      fx.ps = keep;
    },

    //  씬이 바뀔 때 잔상 정리(씬 인스턴스 캐시 함정 — init 에서 부른다).
    reset: function () {
      for (var k in this._img) {
        var im = this._img[k];
        if (im && im.destroy) { try { im.destroy(); } catch (err) {} }
      }
      this._img = {};
      for (var k2 in this._fxg) {
        var f2 = this._fxg[k2];
        if (f2 && f2.g && f2.g.destroy) { try { f2.g.destroy(); } catch (err2) {} }
      }
      this._fxg = {};
      if (GAME.BossRig) GAME.BossRig.reset();
    }
  };
  return B;
})();
