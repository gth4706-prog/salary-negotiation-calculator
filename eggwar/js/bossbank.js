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
//  · phases>1(애니메이션 시트)은 **왕복 재생**(pingpong, 2026-09-03 시즌2 S-A) —
//    유니티 BossView 와 같은 규칙: 한 바퀴 = 2×(N−1) 칸, loopMs 가 한 바퀴 길이.
//    시계는 **렌더 시계**(scene.time.now)다. 시뮬 시계(state.elapsed)를 쓰면 배속·
//    히트스톱·록스텝 지연이 그림에 섞이고, 시뮬이 멈춘 프레임(결과 화면 직전)에
//    그림도 얼어붙는다 — 이 게임의 절차 모션(호흡·걸음)이 렌더 시계를 쓰는 것과 같다.
//    칸은 텍스처 **프레임**으로 등록한다(`_ensureFrames`) — `setCrop` 은 표시 크기를
//    안 줄이는 함정(CLAUDE.md, dragonasset 사고)이라 쓰지 않는다.
//    ⚠ 관절 리깅(BossRig)은 시트 **전체**를 굽는다 — 다칸 시트는 리그를 타지 않는다
//      (칸 재생이 리그를 대신한다). 두 개를 겹치면 부위마다 이웃 칸이 비친다.
// ============================================================================
GAME.BossBank = (function () {
  'use strict';
  var DATA = {
    //  pivotY: 바닥 효과(먼지·흙판)를 시트에서 지우며 실측한 **새 접지선**(px).
    //  안 주면 타일 바닥 — 지운 시트는 바닥에 투명 띠가 남아 발이 떠 보인다.
    //  sizeMul 0.8 — 2026-08-23 태현님: "40층 재파수병 크기를 20% 정도 줄여줘".
    "bossAshSentry": {"art":"beast:sentry:ash","tileW":1216,"tileH":651,"cols":1,"rows":1,"phases":1,"loopMs":0,"drawScale":3.7849,"pivotY":609,"sizeMul":0.8},
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
    "bossShell": {"art":"guardian","tileW":1055,"tileH":874,"cols":1,"rows":1,"phases":1,"loopMs":0,"drawScale":5.0814,"pivotY":858},

    //  ── 시즌2 「다섯 세계」 세계 보스 (2026-09-03 S-A) ─────────────────────────
    //  초원(1~30)은 현행 셋(bossChief·bossShell·bossNest)이 그대로 맡는다.
    //  아래 넷은 **자리만** 잡아 둔 것이다 — `pending: true` 인 동안은 ensure() 가
    //  파일을 요청하지 않는다(없는 URL 을 매 프레임 GET 하면 404 가 CDN 에 눌어붙는다 —
    //  CLAUDE.md 배포 함정). 그동안은 bossart 벡터 폴백이 그린다(화면이 비지 않는다).
    //  규격(브리프 docs/proposals/2026-09-03-season2-art-brief.md §2): 시트 1행 × 3칸
    //  왕복, 1536×512 검은 배경, 옆모습 1방향. 도착하면
    //    tools/import-boss-art.ps1 -In <파일> -Key w_mist_boss -Cols 3 -Web
    //  가 잘라 assets/boss/ 에 넣고 **이 줄을 실측값으로 덮어쓴다**(pending 이 빠진다).
    //  tileW/tileH/drawScale 은 그때까지 브리프 규격의 계산값(512×512, 512/172).
    //  ⚠ art 문자열은 S-W(units.js)가 def.art 에 적는 값과 같아야 벡터 폴백이 결을 탄다
    //    (bossart.parse 가 모르는 결은 ash 로, 모르는 종류는 drake 골격으로 그린다)
    //  2차 S-A(2026-09-03) 대조 — units.js 의 세계 보스 키 ↔ 이 표의 키(metaOf 는 def.key 가
    //  표에 없으면 **art 문자열**로 찾는다 — 그래서 units 키와 표 키가 달라도 시트가 붙는다):
    //    bossSwampMother(늪의 어미)  → w_mist_boss  (beast:bogmother:frost)
    //    bossAshLord(재의 군주)      → w_ash_boss   (beast:ashlord:ember)
    //    bossRiftGiant(균열 거인)    → w_rift_boss  (beast:riftgiant:ash)
    //    bossStormKing(폭풍의 왕)    → w_storm_boss (beast:stormking:storm)
    //    초원(1~30) 보스 셋은 위 bossChief/bossShell/bossNest 그대로.
    //  boss-shot 35/60/100/150 실측(2026-09-03): pending 넷은 drake 골격 벡터 폴백으로 뜬다(예외 0).
    //  phases>1 왕복 재생은 `frameIndex` 를 tools/render-audit.js 가 0 1 2 1 0… 으로 검사한다 —
    //  실제 시트가 오면 `-Cols 3 -Phases 3 -Web` 로 들여온 뒤 boss-shot 으로 칸이 도는지 다시 볼 것..
    "w_mist_boss":  {"art":"beast:bogmother:frost","tileW":512,"tileH":512,"cols":3,"rows":1,"phases":3,"loopMs":900,"play":"pingpong","drawScale":2.977,"pending":true},
    "w_ash_boss":   {"art":"beast:ashlord:ember","tileW":512,"tileH":512,"cols":3,"rows":1,"phases":3,"loopMs":820,"play":"pingpong","drawScale":2.977,"pending":true},
    "w_rift_boss":  {"art":"beast:riftgiant:ash","tileW":512,"tileH":512,"cols":3,"rows":1,"phases":3,"loopMs":1100,"play":"pingpong","drawScale":2.977,"pending":true},
    "w_storm_boss": {"art":"beast:stormking:storm","tileW":512,"tileH":512,"cols":3,"rows":1,"phases":3,"loopMs":700,"play":"pingpong","drawScale":2.977,"pending":true}
  };

  //  보스 인트로 대사 (2026-08-23 4차 — battle._setupBossIntro 가 읽는다).
  //  ⚠ 12세 이용가 톤 — 위협은 하되 잔혹 묘사는 없다. 없는 키는 def.desc 폴백.
  var LINES = {
    bossChief: '내 부족의 알들을 밟고 여기까지 왔느냐.',
    bossShell: '……단단한 것만이, 남는다.',
    bossNest: '둥지가 침입자를 겨눈다 — 화살이 쏟아진다!',
    bossAshSentry: '잿길을 밟은 값은, 재가 되어 치르는 법.',
    bossDrakeAsh: '하늘이 어두워진다 — 잿날개가 내려앉는다.',
    bossDrakeFrost: '숨이 얼어붙는다…… 느려진 발은 먹잇감일 뿐.',
    bossDrakeStorm: '바람이 운다. 서 있는 것부터 날려주마.',
    bossDragonFoot: '이것은 겨우…… 발끝이다.',
    bossDragonClaw: '다섯 손가락이 전장을 통째로 움켜쥔다.',
    bossDragonWing: '날갯짓 한 번에 하늘이 접힌다.',
    bossDragonEgg: '알 속에서 무언가 뛰고 있다…… 두근. 두근.',
    bossDragonEggCracked: '껍질에 금이 갔다. 안의 것이 밀어내고 있다.',
    bossDragonCrack: '틈새의 눈이 — 너를 보았다.',
    bossDragonLord: '태초의 용이 눈을 떴다. 모든 알의 어버이가.'
  };

  //  ── 전장 레이어 탑승 (2026-08-23 4차) ─────────────────────────────────────
  //  전투 씬은 전장 그림을 worldLayer 컨테이너에 담아 줌을 건다. 보스 이미지가
  //  씬 직속으로 남으면 **줌과 따로 놀아** 확대 중 보스만 제자리에 남는다
  //  (인트로 실측 — PC 휠 줌에도 있던 잠복 버그다). 컨테이너는 자식 depth 를
  //  무시하고 add 순서로 그리므로(v2.41 규율), 넣는 순서가 곧 층이다.
  function mount(scene, img) {
    if (scene.worldLayer && img.parentContainer !== scene.worldLayer)
      scene.worldLayer.add(img);
  }

  var B = {
    DATA: DATA,
    LINES: LINES,
    _img: {},          // unit키 → 영속 Phaser.Image (매 프레임 재생성 금지 — v1.66 규율)

    //  ── 아직 그림이 없는 세계 보스의 **대역** (2026-09-04 태현님 ⑤) ──────────────
    //  "주술사 궁극기나 협동보스전에서 옛날 보스이미지가 나와 — 새로 추가했던
    //   보스이미지만 나오게해"
    //  시즌2 세계 보스 넷은 아직 시트가 없어(`pending`) 벡터 폴백(옛 그림)으로 떴다.
    //  능력·페이즈·이름은 그대로 두고 **그리는 시트만** 결이 맞는 실물로 대신 세운다.
    //  ⚠ 용의 얼굴 계열은 안 쓴다 — 「얼굴은 300층에서 처음」이라는 사다리를 깨면
    //    안 된다(v1.10 결정). 권속(드레이크)·발톱만 쓴다.
    //  ⚠ 진짜 시트가 도착해 `pending` 이 빠지면 이 표는 **저절로 안 쓰인다.**
    STANDIN: {
      "w_mist_boss":  "bossDrakeFrost",   // 늪의 어미 — 서리 권속
      "w_ash_boss":   "bossDrakeAsh",     // 재의 군주 — 재 권속
      "w_rift_boss":  "bossDragonClaw",   // 균열 거인 — 거대한 손(얼굴 없음)
      "w_storm_boss": "bossDrakeStorm"    // 폭풍의 왕 — 폭풍 권속
    },
    _resolve: function (key) {
      var m = DATA[key];
      if (m && m.pending) {
        var alt = this.STANDIN[key];
        if (alt && DATA[alt] && !DATA[alt].pending) return { key: alt, m: DATA[alt], standIn: key };
      }
      return { key: key, m: m };
    },

    metaOf: function (def) {
      if (!def) return null;
      if (def.key && DATA[def.key]) return this._resolve(def.key);
      //  키가 없으면 art 문자열로 찾는다(파생 def 대비).
      if (def.art) {
        for (var k in DATA) if (DATA[k].art === def.art) return this._resolve(k);
      }
      return null;
    },

    //  파일이 없어 로드에 실패한 키. **한 번 실패하면 다시 안 묻는다** — 안 그러면
    //  draw() 가 매 프레임 ensure() 를 불러 같은 URL 을 초당 60번 GET 한다.
    _missing: {},
    _hookLoadError: function (scene) {
      if (scene._bossbankLoadErr || !scene.load || !scene.load.on) return;
      scene._bossbankLoadErr = true;
      var self = this;
      scene.load.on('loaderror', function (file) {
        if (file && file.key && String(file.key).indexOf('bossbank:') === 0) self._missing[file.key] = true;
      });
      scene.events.once('shutdown', function () { scene._bossbankLoadErr = false; });
    },

    //  이 판의 보스 시트를 미리 불러 둔다 — battle 씬 create 에서 부른다.
    ensure: function (scene, def) {
      var e = this.metaOf(def);
      if (!e || !scene || !scene.load) return;
      //  자리만 잡힌 키(pending) — 파일이 아직 없다. 요청 자체를 안 한다(벡터 폴백).
      if (e.m.pending) return;
      var texKey = 'bossbank:' + e.key;
      if (scene.textures.exists(texKey) || this._missing[texKey]) return;
      this._hookLoadError(scene);
      scene.load.image(texKey, 'assets/boss/' + e.key + '.png?v=' + (GAME.VERSION || '').replace('v', ''));
      scene.load.start();
    },

    //  준비됐는가 — 그림자를 먼저 그릴지 판단할 때 쓴다(로드 전이면 벡터 폴백).
    ready: function (scene, def) {
      var e = this.metaOf(def);
      return !!(e && !e.m.pending && scene && scene.textures && scene.textures.exists('bossbank:' + e.key));
    },

    //  ── 다칸 시트의 칸을 텍스처 프레임으로 등록한다 (시즌2 S-A) ────────────────
    //  프레임 이름 'p0'..'p{N-1}'. 한 텍스처에 한 번만. cols×rows 격자, 위상 i 는
    //  (i % cols, floor(i / cols)) 칸 — bake-boss-art.js `tileRect` 와 같은 식이다.
    //  ⚠ 시트 실물 크기가 표(tileW×cols)와 안 맞으면 등록하지 않고 정지 그림으로 둔다
    //    (잘못 잘린 칸이 번갈아 나오는 것보다 한 장이 낫다). 콘솔에 한 번만 알린다.
    _ensureFrames: function (scene, texKey, m) {
      var tex = scene.textures.get(texKey);
      if (!tex || tex.frames.p0) return !!(tex && tex.frames.p0);
      var src = tex.getSourceImage();
      var cols = m.cols || 1, rows = m.rows || 1, n = m.phases || 1;
      if (!src || src.width < m.tileW * cols - 1 || src.height < m.tileH * rows - 1) {
        if (!m._sizeWarned && window.console) {
          m._sizeWarned = true;
          console.warn('[bossbank] ' + texKey + ' 시트 크기가 표와 다르다 — 정지 그림으로 둔다',
                       src && (src.width + 'x' + src.height), '표 ' + (m.tileW * cols) + 'x' + (m.tileH * rows));
        }
        return false;
      }
      for (var i = 0; i < n; i++) {
        tex.add('p' + i, 0, (i % cols) * m.tileW, Math.floor(i / cols) * m.tileH, m.tileW, m.tileH);
      }
      return true;
    },

    //  왕복 재생 위상 → 칸 번호. 순수 함수(도구가 직접 검사한다).
    //    nowMs  렌더 시계 · loopMs 한 바퀴(0..N-1..1) · n 칸 수 · play 'pingpong'|'once'|'static'
    //    offset 보스마다 다른 위상 시작(둘이 같은 박자로 움직이면 인형극이 된다)
    frameIndex: function (nowMs, loopMs, n, play, offset) {
      if (!n || n <= 1 || !loopMs || play === 'static') return 0;
      var t = (nowMs + (offset || 0)) / loopMs;
      if (play === 'once') return Math.min(n - 1, Math.floor(Math.max(0, t) * n));
      var seq = 2 * (n - 1);
      var k = Math.floor(t * seq) % seq;
      if (k < 0) k += seq;
      return k < n ? k : seq - k;
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
      //  ── 발이 땅을 딛는 순간 (2026-08-23 4차 — 먼지·발구름 소리의 근원) ────────
      //  다리 위상 sin(walk) 이 마루/골을 지날 때가 곧 착지다(다리 둘이 반대 위상이라
      //  마루=앞다리, 골=뒷다리). 이동 중일 때만 센다.
      var ph = Math.sin(st.walk);
      var step = 0;
      if (st.mv > 0.45 && st.phPrev !== undefined) {
        if (st.phPrev < 0.72 && ph >= 0.72) step = 1;          // 앞다리 착지
        else if (st.phPrev > -0.72 && ph <= -0.72) step = -1;  // 뒷다리 착지
      }
      st.phPrev = ph;
      //  스킬 모으기 시작(예고 점화) 순간 — 소리·집속 이펙트의 트리거.
      var charge = wind > 0 && !(st.windPrev > 0);
      st.windPrev = wind;
      //  ── 자연스러운 곡선 (2026-08-23 5차) ──────────────────────────────────
      //  windE: 빠르게 감고 → 팽팽하게 유지(easeOut). 맹수의 웅크림은 천천히
      //    깊어지는 게 아니라 순간에 감기고 터질 때까지 긴장을 유지한다.
      //  tremble: 완전히 감긴 뒤의 미세 떨림 — "곧 터진다"의 몸 신호.
      //  spring: 발사 = 감쇠 진동. 목표를 지나쳤다가 되돌아와 잦아든다(오버슈트).
      //    선형 감쇠(strike)는 fx 트리거·게이지용으로 남긴다.
      var iw = 1 - wind;
      var windE = 1 - iw * iw * iw;
      var tremble = windE > 0.85 ? Math.sin(now * 0.05) * 0.012 : 0;
      var tSt = Math.max(0, now - st.strikeAt) / 1000;
      var spring = tSt < 0.62 ? Math.exp(-tSt * 5.2) * Math.cos(tSt * 16) : 0;
      //  등장 연출 — 처음 그려진 순간부터 1.1초.
      var intro = Math.max(0, Math.min(1, (now - st.introAt) / 1100));
      //  스타일은 **이번에 붙잡힌 스킬**(_abilCur — 궁극기 포함)을 우선한다.
      //  def 의 첫 능력만 보면 궁극기를 쓰는 순간에도 평소 자세로 움직인다.
      var styleNow = (ab && this._STYLE_OF_TYPE[ab.type]) || this._styleOf(def || u.def);
      return { wind: wind, windE: windE, tremble: tremble, spring: spring,
               strike: strike,
               threat: Math.min(1, wind * 0.7 + strike),
               walk: st.walk, moving: st.mv, intro: intro, struck: struck,
               step: step, charge: charge,
               style: styleNow };
    },

    //  그린다 — 준비돼 있으면 true(호출부는 벡터를 건너뛴다), 아니면 false.
    //  unit: 렌더 전용 참조(공격 모션 위상) — 없으면(카드·로딩 화면) 숨쉬기만 한다.
    draw: function (scene, def, sx, sy, rScaled, alpha, facing, depth, unit) {
      var e = this.metaOf(def);
      if (!e || e.m.pending) return false;
      var texKey = 'bossbank:' + e.key;
      if (!scene.textures.exists(texKey)) { this.ensure(scene, def); return false; }

      var m = e.m;
      //  다칸 시트인가 — 프레임이 등록돼야 참이다(크기가 어긋나면 정지 그림으로 남는다).
      var multi = (m.phases || 1) > 1 && this._ensureFrames(scene, texKey, m);
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
      //  ⚠ 다칸 시트는 리그를 타지 않는다(파일 머리 주석) — 칸 재생이 리그를 대신한다.
      if (!multi && GAME.BossRig && GAME.BossRig.has(e.key)) {
        if (GAME.BossRig.draw(scene, e.key, texKey,
              { sx: sx, sy: sy + yFix, w: w, h: h, px: px, py: py,
                flip: flip, alpha: a, depth: (depth || 0) }, atk)) {
          var old2 = this._img[e.key];
          if (old2) old2.setVisible(false);
          //  발사 이펙트는 리그 부위들 위로 — 컨테이너 순서 보증(add 순서가 층이다).
          if (scene.worldLayer && this._fxg[e.key] && this._fxg[e.key].g &&
              this._fxg[e.key].g.parentContainer === scene.worldLayer)
            scene.worldLayer.bringToTop(this._fxg[e.key].g);
          return true;
        }
      }

      var img = this._img[e.key];
      if (!img || !img.scene || img.scene !== scene) {
        if (img && img.destroy) { try { img.destroy(); } catch (err) {} }
        img = scene.add.image(0, 0, texKey);
        this._img[e.key] = img;
      }
      mount(scene, img);
      //  발사 이펙트는 언제나 보스 위 — 컨테이너 순서를 매 프레임 보증한다.
      if (scene.worldLayer && this._fxg[e.key] && this._fxg[e.key].g &&
          this._fxg[e.key].g.parentContainer === scene.worldLayer)
        scene.worldLayer.bringToTop(this._fxg[e.key].g);
      img.setVisible(true);
      img._bbStamp = scene.game.loop.frame;
      //  ── 왕복 재생 (시즌2 S-A) — 렌더 시계로 칸을 고른다. 절차 모션(아래 호흡·
      //  젖힘·런지)은 그 위에 그대로 얹힌다 — 칸이 셋뿐이어도 그래서 살아 보인다.
      //  이동 중에는 걸음 위상(atk.walk)에 맞춰 조금 빨리 돈다(발과 그림이 맞물리게).
      if (multi) {
        var seedMs = ((e.key.charCodeAt(2) || 0) * 37 + (e.key.charCodeAt(e.key.length - 1) || 0) * 11) % 700;
        var loopNow = m.loopMs * (1 - 0.25 * (atk.moving || 0));
        var fi = this.frameIndex(scene.time.now, loopNow, m.phases, m.play || 'pingpong', seedMs);
        var fname = 'p' + fi;
        if (!img.frame || img.frame.name !== fname) img.setFrame(fname);
      }
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
        //  5차: 예고 중에는 **심박이 세진다**(안의 것이 흥분한다) + 미세 떨림.
        var raw = Math.sin(t * 3.1 + seed);
        var th = Math.max(0, raw); th = th * th * th * th * th;
        var race = 1 + (atk.windE !== undefined ? atk.windE : atk.wind) * 1.2;
        ky = 1 + th * 0.055 * race + atk.strike * 0.02;
        kx = 1 - th * 0.028 * race;
        rot = Math.sin(t * 1.15 + seed) * 0.014 + th * 0.006 + (atk.tremble || 0);
      } else {
        //  그 외(리깅 없는 폴백) — 호흡 + 스웨이 + 걸음 바운스·전진 기울기(4차)
        //  + windE/spring 곡선(5차 — 리깅 보스와 같은 성격의 감기·튕김).
        var br = Math.sin(t * 1.8 + seed);
        var gwk = atk.moving || 0;
        var wEf = atk.windE !== undefined ? atk.windE : atk.wind;
        var spf = atk.spring !== undefined ? atk.spring : atk.strike;
        ky = 1 + br * 0.016 + spf * 0.03 - wEf * 0.02 +
             Math.abs(Math.sin(atk.walk)) * 0.022 * gwk;
        kx = 1 - br * 0.016 * 0.55 + wEf * 0.015;
        rot = Math.sin(t * 0.9 + seed) * 0.010 + (spf * 0.035 - wEf * 0.020) +
              gwk * 0.045 + (atk.tremble || 0);
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
      mount(scene, fx.g);
      var g = fx.g;
      g.setDepth(depth + 0.62);
      g.setVisible(true);
      g._bbStamp = scene.game.loop.frame;
      var now = scene.time.now;
      var dir = flip ? -1 : 1;
      var isEgg = /Egg|Crack/.test(key);
      //  입 위치 — 턱 리그가 있는 보스는 **턱 관절(경첩) 좌표가 곧 입가**다
      //  (2026-08-23 태현님: "브레스는 입에서 나오게"). 관절에서 앞으로 6% 밀어
      //  벌어진 입끝에 맞춘다. 리그 없는 보스만 기존 근사(앞쪽 1/3)로 남는다.
      var mx = sx + dir * w * 0.34, my = syG - h * py + h * 0.34;
      var mMeta = DATA[key];
      var mRig = GAME.BossRig && GAME.BossRig.RIGS && GAME.BossRig.RIGS[key];
      if (mRig && mRig.parts && mMeta && mMeta.tileW) {
        for (var mj = 0; mj < mRig.parts.length; mj++) {
          if (!mRig.parts[mj].jaw) continue;
          var ju = mRig.parts[mj].joint[0] / mMeta.tileW + 0.06;
          var jv = mRig.parts[mj].joint[1] / mMeta.tileH;
          mx = sx + dir * w * (ju - 0.5);
          my = (syG - h * py) + h * jv;
          break;
        }
      }
      if (isEgg) { mx = sx; my = syG - h * py + h * 0.5; }
      var glow = 0xffa243;
      try {
        if (GAME.BossArt && GAME.BossArt.TONE && def && def.art) {
          var kind = def.art.split(':')[2];
          if (GAME.BossArt.TONE[kind] && GAME.BossArt.TONE[kind].glow)
            glow = GAME.BossArt.TONE[kind].glow;
        }
      } catch (e2) {}

      //  ── 발이 땅을 딛는 순간 — 발치 먼지 + 낮은 발구름 (2026-08-23 4차) ──────
      //  step: +1 앞다리 / -1 뒷다리. 발 위치는 접지선 위 몸 폭의 ±15% 근사.
      if (atk.step) {
        var fxx = sx + dir * atk.step * w * 0.15;
        for (var s2 = 0; s2 < 4; s2++) {
          var sd = s2 % 2 ? 1 : -1;
          fx.ps.push({ x: fxx + sd * Math.random() * 8, y: syG - 3,
                       vx: sd * (26 + Math.random() * 60), vy: -(14 + Math.random() * 34),
                       t0: now, life: 380 + Math.random() * 160,
                       r: 2 + Math.random() * 3, col: 0x9b8f7c });
        }
        if (GAME.Sound) GAME.Sound.play('bossStep');
      }
      //  ── 스킬 모으기 — 예고 동안 입가로 **모여드는** 불티(밖→안). 시작 순간 소리 ──
      if (atk.charge && GAME.Sound) GAME.Sound.play('bossCharge');
      if (atk.wind > 0 && !isEgg) {
        var ca = Math.random() * Math.PI * 2;
        var cr = 26 + Math.random() * 30;
        var cx0 = mx + Math.cos(ca) * cr, cy0 = my + Math.sin(ca) * cr;
        fx.ps.push({ x: cx0, y: cy0, vx: (mx - cx0) * 3.2, vy: (my - cy0) * 3.2,
                     t0: now, life: 300, r: 1.6 + Math.random() * 2, col: glow, noGrav: true });
      }

      //  원소 결 — 파티클의 **물성**이 갈린다(5차: 색만 다른 건 개성이 아니다).
      //  서리 = 무겁게 깔려 떨어진다 · 폭풍 = 지그재그로 튄다 · 불/재 = 떠오른다.
      var kindStr = '';
      try { kindStr = (def && def.art) ? String(def.art).split(':')[2] || '' : ''; } catch (e3) {}
      var pGrav = kindStr === 'frost' ? 55 : (kindStr === 'storm' ? 0 : -25);

      if (atk.struck) {
        //  ── 발사 순간 — 스타일마다 다른 그림 (태현님: "스킬이 각각 개성이 있어야") ──
        if (atk.style === 'breath' && !isEgg) {
          //  브레스: 한 방 터짐이 아니라 **0.4초 지속 분사**(아래 스트림이 잇는다).
          fx.breathUntil = now + 400;
          fx.ps.push({ kind: 'ring', x: mx, y: my, r0: 8, r1: h * 0.30,
                       t0: now, life: 340, col: glow });
          if (GAME.Sound) GAME.Sound.play('bossBreath');
        } else if (atk.style === 'slam') {
          //  내리찍기: 먼지 + 땅 균열 + **이중 충격파**(본파 뒤 0.15초에 잔파).
          for (var d2 = 0; d2 < 12; d2++) {
            var side = d2 % 2 ? 1 : -1;
            fx.ps.push({ x: sx + side * (10 + Math.random() * w * 0.22), y: syG - 4,
                         vx: side * (50 + Math.random() * 110), vy: -(24 + Math.random() * 60),
                         t0: now, life: 480 + Math.random() * 220, r: 3 + Math.random() * 4, col: 0x9b8f7c });
          }
          for (var c3 = 0; c3 < 6; c3++) {
            var ca3 = (c3 / 6) * Math.PI + Math.PI * 0.06 * (Math.random() - 0.5);
            fx.ps.push({ kind: 'crack', x: sx, y: syG - 2, ang: ca3,
                         len: 30 + Math.random() * w * 0.30, t0: now, life: 520, col: 0x2b241c });
          }
          fx.ps.push({ kind: 'ring', x: sx, y: syG - 3, r0: 10, r1: w * 0.42,
                       t0: now, life: 380, col: 0xcbbfa5, flat: true });
          fx.ps.push({ kind: 'ring', x: sx, y: syG - 3, r0: 8, r1: w * 0.28,
                       t0: now + 150, life: 320, col: 0xcbbfa5, flat: true });
          if (GAME.Sound) GAME.Sound.play('bossSlam');
        } else {
          //  소환/포효(spread)·알·기본: 방사 불티 + **삼중 파동**(북소리처럼 밀려난다).
          for (var i = 0; i < 12; i++) {
            var an = isEgg ? Math.random() * Math.PI * 2
                           : (Math.random() - 0.5) * 1.6 + (dir > 0 ? 0 : Math.PI);
            var sp = 60 + Math.random() * 160;
            fx.ps.push({ x: mx, y: my, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - 40,
                         t0: now, life: 380 + Math.random() * 240, r: 2 + Math.random() * 3,
                         col: glow, mode: kindStr, grav: kindStr ? pGrav : undefined,
                         jit: kindStr === 'storm' ? 1 : 0 });
          }
          if (atk.style === 'spread') {
            var scy = syG - h * py + h * 0.5;
            fx.ps.push({ kind: 'ring', x: sx, y: scy, r0: 12, r1: w * 0.5, t0: now, life: 420, col: glow });
            fx.ps.push({ kind: 'ring', x: sx, y: scy, r0: 10, r1: w * 0.42, t0: now + 160, life: 380, col: glow });
            fx.ps.push({ kind: 'ring', x: sx, y: scy, r0: 8, r1: w * 0.34, t0: now + 320, life: 340, col: glow });
          }
        }
      }
      //  ── 브레스 스트림 — 발사 후 0.4초간 원소 물성대로 뿜는다 ──────────────────
      if (fx.breathUntil && now < fx.breathUntil && !isEgg) {
        for (var bi2 = 0; bi2 < 3; bi2++) {
          var ba2 = (Math.random() - 0.5) * 0.8 + (dir > 0 ? 0 : Math.PI);
          var spd2 = (kindStr === 'frost' ? 90 : 140) + Math.random() * (kindStr === 'frost' ? 140 : 240);
          fx.ps.push({ x: mx, y: my, vx: Math.cos(ba2) * spd2, vy: Math.sin(ba2) * spd2 * 0.5 - 10,
                       t0: now, life: 380 + Math.random() * 240, r: 2.5 + Math.random() * 3.5,
                       col: glow, mode: kindStr, grav: pGrav,
                       jit: kindStr === 'storm' ? 1 : 0 });
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
        if (age < 0) continue;          //  잔파(t0 미래) — 태어날 때까지 기다린다
        if (p.kind === 'ring') {
          //  확장 링 — flat 이면 지면(눕힌 타원), 아니면 정면 원.
          var rr = p.r0 + (p.r1 - p.r0) * age;
          g.lineStyle(2.5 * (1 - age) + 0.5, p.col, 0.7 * (1 - age));
          if (p.flat) g.strokeEllipse(p.x, p.y, rr * 2, rr * 0.66);
          else g.strokeCircle(p.x, p.y, rr);
          continue;
        }
        if (p.kind === 'crack') {
          //  땅 균열 — 지면에 방사형 실금(원근으로 세로를 눌러 그린다).
          var cl = p.len * Math.min(1, age * 3);
          g.lineStyle(2, p.col, 0.8 * (1 - age));
          g.lineBetween(p.x, p.y, p.x + Math.cos(p.ang) * cl, p.y - Math.sin(p.ang) * cl * 0.30);
          g.lineBetween(p.x, p.y, p.x - Math.cos(p.ang) * cl * 0.8, p.y - Math.sin(p.ang) * cl * 0.22);
          continue;
        }
        var dt2 = (now - p.t0) / 1000;
        var grav = p.grav !== undefined ? p.grav : (p.noGrav ? 0 : 90);
        //  폭풍 결 — 직선이 아니라 지그재그로 튄다(전하가 튀는 느낌).
        var jx = p.jit ? Math.sin((now + j * 137) * 0.045) * 6 : 0;
        var x2 = p.x + p.vx * dt2 + jx, y2 = p.y + p.vy * dt2 + grav * dt2 * dt2;
        g.fillStyle(p.col, 0.85 * (1 - age));
        g.fillCircle(x2, y2, p.r * (1 - age * 0.5));
        //  서리 결 — 흰 심이 박힌다(찬 입김의 결정).
        if (p.mode === 'frost') {
          g.fillStyle(0xffffff, 0.5 * (1 - age));
          g.fillCircle(x2, y2, p.r * 0.45 * (1 - age * 0.5));
        }
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
