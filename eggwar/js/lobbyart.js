window.GAME = window.GAME || {};

// ============================================================================
//  로비 아트 — **영웅이 지키고 서 있는 첫 화면** (2026-08-01 사용자: "로비화면도 좀 구려")
//
//  ## 진단
//  로비를 찍어 보니 크림색 빈 배경에 글자와 버튼만 있었다. 이 게임의 가장 좋은 자산인
//  **계란 아트(js/eggart.js)가 로비에 하나도 안 나온다.** 8방향 걸음걸이·투구 실루엣·
//  무기까지 다 그려 놓고, 처음 들어온 사람은 전투에 들어가야만 그걸 본다.
//  "이게 무슨 게임인지"를 첫 화면이 말해 주지 않고 있었다.
//
//  ## 왜 '행렬' 이 아니라 '영웅' 인가 — 한 번 실패하고 고친 것
//  처음엔 유닛 여러 기를 화면 아래로 지나가게 했다. 찍어 보니 **어두운 점 아홉 개**로
//  보였다. 이유는 둘이다:
//   ① 작게 그리면 계란의 매력(둥근 몸·투구·표정)이 다 사라지고 실루엣만 남는다
//   ② 로비는 아래쪽이 버튼과 글자로 꽉 차 있어서, 지나갈 빈 띠 자체가 없었다
//  반면 **양옆은 통째로 비어 있었다**(PC 기준 좌우 각 450px). 그래서 그 자리에
//  영웅을 **크게** 세운다. 타이틀 화면이 캐릭터로 자기소개를 하는 흔한 문법이고,
//  이 게임에는 그럴 만한 영웅이 셋 있다.
//
//  ## 지키는 선
//  ⚠ **순수 렌더다.** 전투 로직·저장·밸런스에 아무것도 안 건드린다.
//  ⚠ 씬을 다시 들어오면 표시객체가 이미 파괴돼 있다(이 저장소가 반복해 겪은 사고).
//    상태를 씬에 캐시하지 않고 `start()` 가 매번 새로 만든다.
//  ⚠ 좁은 화면(폰 가로·세로)에서는 **아예 안 그린다.** 거기엔 여백이 없어서
//    뭘 그려도 글자와 겹친다 — 겹치느니 없는 게 낫다.
// ============================================================================
GAME.LobbyArt = {

  // 옆에 세울 영웅. `heroes.js` 의 키다. 좌/우 한 기씩.
  GUARDS: [
    { key: 'vanguard', side: -1 },     // 왼쪽 — 광전사(근접)
    { key: 'ranger',   side:  1 }      // 오른쪽 — 사냥꾼(원거리)
  ],

  // ⚠ 처음엔 배경이라고 0.38 로 깔았는데 **물 빠진 워터마크**로 보였다(실측).
  //   이 그림이 서는 자리는 좌우 여백이라 **글자와 겹칠 일이 아예 없다** —
  //   흐리게 할 이유가 없었던 것이다. 또렷하게 세워야 '캐릭터'로 읽힌다.
  ALPHA: 0.88,

  // 이 폭보다 좁으면 그리지 않는다(양옆 여백이 안 나온다).
  MIN_W: 1100,

  // ── 표식 (2026-08-04) — 이모지를 대신한다 ────────────────────────────────────
  //  로비 버튼에 이모지가 박혀 있었다. 그중 `🗼` 의 유니코드 공식 이름은 문자 그대로
  //  **TOKYO TOWER** 다 — 원시 부족이 뼈와 돌로 싸우는 세계의 탑 이름표에 20세기
  //  일본의 강철 전파탑이 붙어 있었다. `🏅`(올림픽 메달) · `🔊`(현대 스피커) ·
  //  `🎵`(서양 음표) · `🏆`(트로피)도 전부 이 세계에 없는 물건이다.
  //
  //  이모지는 **어느 게임에나 붙일 수 있는 기성품**이라, 화면에 있으면 "직접 만든 것"이
  //  아니라 "가져다 붙인 것"으로 읽힌다. 배경을 목책과 능선으로 채운 뒤에는 그 대비가
  //  더 커졌다 — 세계는 원시 부족인데 버튼만 이모티콘 키보드였다.
  //
  //  ⚠ 색은 전부 `UI.MAT` 토큰이다. 테마 4종이 자동으로 따라온다.
  //  ⚠ 크기 `s` 는 **글자 높이 기준**으로 받는다. 버튼마다 폰트가 달라서 고정 px 로
  //    두면 어떤 버튼에서는 크고 어떤 버튼에서는 점이 된다.
  //  ⚠ 분할 수를 반드시 넘긴다(이 저장소 규율 — 안 넘기면 Phaser 기본 32분할이다).
  mark: function (g, kind, cx, cy, s) {
    var M = GAME.UI.MAT, L = GAME.UI.LIGHT;
    var lit = function (c) { return GAME.UI.mix(c, (L && L.key) || 0xfff3d6, 0.35); };
    var dark = function (c) { return GAME.UI.mix(c, 0x000000, 0.32); };

    if (kind === 'tower') {
      //  돌을 쌓아 올린 탑 — 위로 갈수록 좁아진다. 통곡의 탑.
      var rows = 4, i, rw, ry;
      for (i = 0; i < rows; i++) {
        rw = s * (0.92 - i * 0.17);
        ry = cy + s * 0.46 - i * s * 0.27;
        g.fillStyle(dark(M.stone), 1);
        g.fillRect(cx - rw / 2, ry - s * 0.13, rw, s * 0.26);
        g.fillStyle(i % 2 ? M.stone : lit(M.stone), 1);
        g.fillRect(cx - rw / 2, ry - s * 0.13, rw, s * 0.17);
      }
      g.fillStyle(M.bone, 1);                       // 꼭대기 뼈 깃대
      g.fillRect(cx - s * 0.05, cy - s * 0.72, s * 0.10, s * 0.30);
      g.fillStyle(M.feather, 1);
      g.fillTriangle(cx + s * 0.04, cy - s * 0.70, cx + s * 0.40, cy - s * 0.58,
                     cx + s * 0.04, cy - s * 0.44);
      return;
    }
    if (kind === 'shield') {
      //  뼈 테를 두른 방패 — 수성의 탑. 조작 버튼의 뼈 테와 같은 문법.
      var w = s * 0.78, h = s * 0.94;
      var pts = [
        { x: cx, y: cy - h * 0.54 }, { x: cx + w * 0.52, y: cy - h * 0.30 },
        { x: cx + w * 0.52, y: cy + h * 0.16 }, { x: cx, y: cy + h * 0.56 },
        { x: cx - w * 0.52, y: cy + h * 0.16 }, { x: cx - w * 0.52, y: cy - h * 0.30 }
      ];
      g.fillStyle(M.woodDark, 1); g.fillPoints(pts, true);
      var inn = pts.map(function (p) {
        return { x: cx + (p.x - cx) * 0.78, y: cy + (p.y - cy) * 0.78 };
      });
      g.fillStyle(M.bone, 1); g.fillPoints(inn, true);
      g.fillStyle(M.bronze, 1); g.fillEllipse(cx, cy - s * 0.02, s * 0.24, s * 0.24, 10);
      g.fillStyle(lit(M.bronze), 1); g.fillEllipse(cx - s * 0.04, cy - s * 0.06, s * 0.10, s * 0.10, 8);
      return;
    }
    if (kind === 'spears') {
      //  교차한 뼈창 — 대전. 두 부족이 맞붙는다.
      var d, k2;
      for (k2 = 0; k2 < 2; k2++) {
        d = k2 ? 1 : -1;
        g.lineStyle(Math.max(1.6, s * 0.11), M.woodDark, 1);
        g.lineBetween(cx - d * s * 0.46, cy + s * 0.46, cx + d * s * 0.40, cy - s * 0.34);
        g.fillStyle(M.bone, 1);                     // 뼈 촉
        g.fillTriangle(cx + d * s * 0.52, cy - s * 0.52,
                       cx + d * s * 0.22, cy - s * 0.28,
                       cx + d * s * 0.46, cy - s * 0.14);
      }
      g.fillStyle(M.rope, 1);                       // 묶은 자리
      g.fillEllipse(cx, cy + s * 0.06, s * 0.20, s * 0.14, 8);
      return;
    }
    if (kind === 'banner') {
      //  깃발 꽂힌 뼈 기둥 — 랭킹. 이긴 자가 꽂는 것이다.
      g.fillStyle(M.bone, 1);
      g.fillRect(cx - s * 0.07, cy - s * 0.56, s * 0.14, s * 1.06);
      g.fillStyle(dark(M.bone), 1);
      g.fillRect(cx - s * 0.07, cy - s * 0.56, s * 0.05, s * 1.06);
      g.fillStyle(M.feather, 1);                    // 천
      g.fillTriangle(cx + s * 0.05, cy - s * 0.52, cx + s * 0.56, cy - s * 0.30,
                     cx + s * 0.05, cy - s * 0.06);
      g.fillStyle(M.stone, 1);                      // 발밑 돌무더기
      g.fillEllipse(cx, cy + s * 0.52, s * 0.62, s * 0.20, 10);
      return;
    }
    if (kind === 'horn') {
      //  뿔피리 — 소리. `js/music.js` 가 실제로 뿔피리를 연주한다.
      g.lineStyle(Math.max(2, s * 0.15), M.bone, 1);
      g.beginPath();
      g.arc(cx - s * 0.06, cy + s * 0.04, s * 0.40, -0.5, 2.1, false);
      g.strokePath();
      g.fillStyle(lit(M.bone), 1);
      g.fillEllipse(cx + s * 0.30, cy - s * 0.24, s * 0.34, s * 0.28, 10);
      g.fillStyle(M.rope, 1);
      g.fillRect(cx - s * 0.34, cy + s * 0.16, s * 0.22, s * 0.09);
      return;
    }
    if (kind === 'drum') {
      //  북 — 음악. 이 게임의 음악은 북에서 시작한다.
      g.fillStyle(M.woodDark, 1);
      g.fillEllipse(cx, cy + s * 0.10, s * 0.86, s * 0.62, 12);
      g.fillStyle(M.shell, 1);
      g.fillEllipse(cx, cy - s * 0.06, s * 0.82, s * 0.52, 12);
      g.lineStyle(Math.max(1.4, s * 0.08), M.rope, 1);
      g.strokeEllipse(cx, cy - s * 0.06, s * 0.82, s * 0.52, 12);
      g.fillStyle(M.bone, 1);                       // 북채
      g.fillRect(cx + s * 0.16, cy - s * 0.56, s * 0.08, s * 0.42);
      return;
    }
    //  egg — 타이틀 옆. 이 게임의 주인공은 계란이다.
    g.fillStyle(M.shellRim, 1);
    g.fillEllipse(cx, cy + s * 0.06, s * 0.72, s * 0.92, 14);
    g.fillStyle(M.shell, 1);
    g.fillEllipse(cx - s * 0.03, cy + s * 0.02, s * 0.62, s * 0.80, 14);
    g.fillStyle(lit(M.shell), 1);
    g.fillEllipse(cx - s * 0.14, cy - s * 0.20, s * 0.20, s * 0.26, 10);
  },

  // ── 로비 데모 (2026-08-04) ──────────────────────────────────────────────────
  //  적으로 쓸 유닛. **다양하게** 보이는 것이 목적이라 실루엣이 서로 다른 것만 고른다
  //  (사용자: "유닛들은 다양하게해주고").
  //  ⚠ 키는 표시 이름이 아니다(전사=bayonet · 궁수=rifleman …). 실제 키로 적을 것.
  //    고정물(가시덫·쇠뇌 진지)은 뺀다 — 걸어오지 않으므로 데모가 성립하지 않는다.
  DEMO_FOES: ['bayonet', 'rifleman', 'grenadier', 'sniper', 'shieldman', 'sergeant', 'chemtrooper'],
  DEMO_SPAWN: 1500,          // 적이 나오는 간격(ms)
  DEMO_SKILL_EVERY: 4,       // 몇 번째 처치마다 스킬을 쓰는가

  //  band: { x0, x1, spawnX, delay, mute } — 데모가 살 수 있는 **가로 구간**.
  //  ⚠ 없으면 화면 전체다(폰 가로가 그렇다 — 거기는 글자가 전부 지평선 **위**에 있어
  //    목책이 화면을 가로질러도 아무것도 안 가린다).
  //  ⚠ PC 는 다르다. **버튼 띠가 화면 정중앙**이라, 구간을 안 나누면 흐르는 목책이
  //    버튼 한가운데를 관통한다. 그래서 PC 는 좌우 여백을 각각 하나의 구간으로 준다.
  _newDemo: function (W, H, band) {
    band = band || {};
    return {
      scroll: 0,             // 목책이 왼쪽으로 흐른 거리
      foes: [],
      spawnAt: band.delay === undefined ? 600 : band.delay,
      kills: 0,
      act: null,             // 지금 재생 중인 공격/스킬 포즈
      actAt: -9999,
      skillFx: null,         // 스킬 파문(반경만 가진 단순 연출)
      slash: null,           // 칼이 지나간 자리(초승달 호)
      W: W, H: H,
      x0: band.x0 === undefined ? 0 : band.x0,
      x1: band.x1 === undefined ? W : band.x1,
      //  적이 걸어 들어오기 시작하는 x. 폰 가로의 기존 값(W*0.455)이 기본이다.
      spawnX: band.spawnX === undefined ? W * 0.455 : band.spawnX,
      //  ⚠ 소리를 내는 데모는 **하나뿐이어야 한다.** PC 는 좌우 둘이 동시에 도는데
      //    둘 다 울리면 같은 타격음이 겹쳐 두 번 난다.
      mute: !!band.mute,
      //  목책이 서는 줄. 안 주면 **영웅 크기에서 역산**한다(폰 가로가 그렇게 잡혀
      //  있고 그 화면은 이미 승인된 그림이다).
      //  ⚠ PC 는 반드시 줘야 한다. 거기 영웅은 폰보다 훨씬 크게(3.1배) 서기 때문에
      //    역산값이 배경의 들판 경계보다 100px 넘게 위로 뜬다 → 목책이 허공에 뜬다.
      line: band.line
    };
  },

  _demoUpdate: function (d, hero, dt) {
    if (!d) return;
    var SPD = 46;                                  // 걷는 속도(px/s) — 목책이 이만큼 흐른다
    d.scroll += (SPD * dt) / 1000;

    //  적 소환 — 오른쪽 끝에서 걸어 들어온다.
    d.spawnAt -= dt;
    if (d.spawnAt <= 0 && d.foes.length < 3) {
      d.spawnAt = this.DEMO_SPAWN + Math.random() * 700;
      var keys = this.DEMO_FOES, k = keys[(Math.random() * keys.length) | 0];
      var fd = GAME.UNITS && GAME.UNITS[k];
      if (fd) {
        d.foes.push({
          def: fd, x: d.spawnX, y: hero.y + (Math.random() * 12 - 6),
          vx: 0, hurt: 0, gone: 0, walk: Math.random() * 6
        });
      }
    }

    //  적 전진 · 맞은 뒤 날아감 · 퇴장
    var reach = (hero.def.radius || 16) * hero.scale * 2.1;
    var i, f, hit = false;
    for (i = d.foes.length - 1; i >= 0; i--) {
      f = d.foes[i];
      if (f.gone > 0) {                            // 나가떨어지는 중
        f.gone += dt;
        f.x += (f.vx * dt) / 1000;
        f.vx *= 0.985;
        if (f.gone > 620) d.foes.splice(i, 1);
        continue;
      }
      f.x -= ((SPD + 26) * dt) / 1000;             // 걸어오는 속도 = 내 걸음 + 자기 걸음
      f.walk += dt * 0.012;
      //  사거리에 들면 **때린다.** 판정이 아니라 연출이라 조건이 이것뿐이다.
      if (f.x <= hero.x + reach && d.t0 - d.actAt > 520) {
        hit = true;
        d.kills++;
        d.actAt = d.t0;
        var skill = (d.kills % this.DEMO_SKILL_EVERY) === 0;
        //  ⚠ **예비 동작부터 재생한다.** actPose 는 t<0 을 "칼을 치켜드는 구간"으로
        //    쓰는데(js/eggart.js), t:0 에서 시작하면 그 구간을 통째로 건너뛴다 —
        //    칼이 가장 크게 움직이는 자리가 바로 거기다. 길이도 표에서 읽는다
        //    (광전사 wind 240 · dur 600). 340 으로 잘랐더니 본동작도 57%에서 끊겼다.
        var AC = (GAME.UI.ACT && (GAME.UI.ACT[hero.def.art] || GAME.UI.ACT._default)) || { wind: 200, dur: 480 };
        d.act = { art: (hero.def.art || 'berserker'), t: -AC.wind, wind: 1, dur: AC.dur,
                  kind: skill ? 'skill' : 'atk', type: skill ? 'aoeSelf' : undefined };
        if (skill) d.skillFx = { t: 0, total: 460, x: hero.x, y: hero.y };
        //  ── 참격 + 소리 (2026-08-04 사용자: "칼 휘두르는 모션 + 이펙트 + 효과음") ──
        //  칼이 지나간 자리를 초승달로 남긴다. 포즈만으로는 "휘둘렀다"가 한 프레임에
        //  안 읽힌다 — 전장에서 배운 것과 같다(v1.51 초승달 참격).
        d.slash = { t: 0, total: skill ? 300 : 220, x: hero.x, y: hero.y, big: skill };
        //  ⚠ 소리는 **로비에서도 조용해야 할 이유가 없다** — 이미 로비 음악이 돈다.
        //    다만 `Sound` 가 없거나 꺼져 있으면 조용히 지나간다(sound.js 계약).
        //  ⚠ 스킬은 `boom`, 평타는 `hit` — 전투에서 쓰는 그 소리 그대로다. 로비에만
        //    다른 소리를 만들면 "이 게임의 소리"가 두 벌이 된다.
        if (GAME.Sound && !d.mute) { try { GAME.Sound.play(skill ? 'boom' : 'hit'); } catch (e) {} }
        //  맞은 놈은 날아가고, 스킬이면 **앞의 것들이 다 같이** 날아간다.
        var j, ff;
        for (j = 0; j < d.foes.length; j++) {
          ff = d.foes[j];
          if (ff.gone > 0) continue;
          if (!skill && ff !== f) continue;
          ff.gone = 1;
          //  ⚠ 너무 멀리 날면 오른쪽 안내문 자리까지 들어간다(실측). 짧게 날고
          //    빨리 사라지게 해 글자 위로 안 넘어가게 한다.
          ff.vx = 120 + Math.random() * 90;
          ff.hurt = 1;
        }
      }
    }

    //  ── 쉬지 않고 휘두른다 (2026-08-04 사용자: "실제 칼은 움직이질않아") ────────
    //  예전에는 **적이 사거리에 닿는 순간에만** 포즈를 잡았다. 그런데 그건 1.5초에
    //  한 번, 340ms 만 지속된다 — 실측 표본 4회 중 3회가 "포즈 없음" 이었다.
    //  즉 로비를 보고 있는 대부분의 시간 동안 칼이 **정지**해 있었다.
    //  → 적이 없어도 주기적으로 휘두른다. 걸어가며 칼을 휘두르는 그림이 되어야
    //    "이 게임은 이런 게임이다"가 첫 화면에서 전해진다.
    //  ⚠ 적을 때리는 쪽이 우선이다 — 이미 포즈 중이면 새로 시작하지 않는다.
    if (!d.act && d.t0 - d.actAt > 900) {
      d.actAt = d.t0;
      var AC2 = (GAME.UI.ACT && (GAME.UI.ACT[hero.def.art] || GAME.UI.ACT._default)) || { wind: 200, dur: 480 };
      d.act = { art: (hero.def.art || 'berserker'), t: -AC2.wind, wind: 1, dur: AC2.dur, kind: 'atk' };
      d.slash = { t: 0, total: 220, x: hero.x, y: hero.y, big: false };
      //  ⚠ **여기서는 소리를 내지 않는다.** 0.9초마다 울리면 로비에 있는 내내
      //    타격음이 이어져 시끄럽다. 소리는 **적을 실제로 때렸을 때만** 낸다
      //    (이 파일의 위쪽 분기). 허공을 가르는 데는 소리가 없는 것이 맞기도 하다.
    }

    //  포즈 진행
    if (d.act) {
      d.act.t += dt;
      if (d.act.t > (d.act.dur || 480)) d.act = null;
    }
    if (d.skillFx) {
      d.skillFx.t += dt;
      if (d.skillFx.t > d.skillFx.total) d.skillFx = null;
    }
    if (d.slash) {
      d.slash.t += dt;
      if (d.slash.t > d.slash.total) d.slash = null;
    }
  },

  //  데모를 그린다. 목책은 **이 레이어가** 그려서 흐르게 한다(배경은 정지화면이다).
  _demoDraw: function (g, d, hero) {
    if (!d) return;
    var M = GAME.UI.MAT, mix = GAME.UI.mix;
    var bg = (GAME.UI.COL && GAME.UI.COL.bg) || 0xfbf2df;
    var W = d.W, H = d.H;
    var line = (d.line === undefined)
      ? hero.y - (hero.def.radius || 16) * hero.scale * 1.5
      : d.line;

    //  생성 배경 일러스트가 깔린 화면(menu._bgImg)에서는 절차 능선·목책을 접는다 —
    //  그림 위에 흰 말뚝이 이중으로 뜬다(2026-08-31 실측). 영웅·적 데모는 그대로.
    var skipScenery = !!GAME.LobbyArt.noScenery;
    //  ① 흐르는 **원경 능선** (2026-08-04 사용자: "배경이 전체 오른쪽에서 왼쪽으로")
    //  ⚠ 하늘·들판은 가로로 균일해서 밀어도 안 보인다 — 그건 `backdrop` 이 한 번 굽고
    //    끝낸다. **움직임을 만드는 것은 능선과 목책뿐**이므로 그 둘만 여기서 흐른다.
    //  ⚠ 이어 붙이려면 **한 주기를 두 번** 그려야 한다. 한 번만 그리면 왼쪽 끝에서
    //    끊겨 화면이 비는 순간이 생긴다.
    //  구간 폭 기준으로 잰다 — PC 는 좌우 여백 하나가 곧 이 데모의 세계다.
    var bx0 = d.x0, bx1 = d.x1, bw = Math.max(1, bx1 - bx0);
    var span = bw * 0.62;                           // 능선 한 주기
    if (skipScenery) span = 0;                      // (아래 두 루프를 통째로 건너뛴다)
    if (!skipScenery) {
    var rOff = d.scroll * 0.42;                     // 원경은 느리게 — 시차(parallax)
    var rp, seg, sx0;
    for (seg = 0; seg < 2; seg++) {
      sx0 = bx0 - (rOff % span) + seg * span;
      var poly = [], n = 9, q;
      //  ⚠ 한 주기가 구간 밖으로 **넘칠 수 있다**(스크롤 위상에 따라 오른쪽으로 최대
      //    0.24 폭). 폰 가로는 구간이 화면 전체라 아무 일도 안 생기지만, PC 는 그
      //    넘친 만큼이 그대로 **버튼 띠 위에 얹힌다.** 그래서 x 를 구간에 가둔다 —
      //    경계에서 언덕이 수직으로 잘리는데, 이건 원경 안개 띠라 그렇게 보여도 된다.
      var cl = function (v) { return v < bx0 ? bx0 : (v > bx1 ? bx1 : v); };
      for (q = 0; q <= n; q++) {
        //  ⚠ 좌표를 난수로 매 프레임 뽑지 않는다 — 언덕이 춤춘다. 주기 안에서
        //    결정적인 사인 합성으로 만든다(같은 x 면 언제나 같은 높이).
        var u2 = q / n, ax = cl(sx0 + span * u2);
        var hh = H * (0.055 + 0.030 * Math.sin(u2 * 6.283 + seg * 1.7)
                             + 0.018 * Math.sin(u2 * 15.7 + 2.1));
        poly.push({ x: ax, y: line - hh });
      }
      poly.push({ x: cl(sx0 + span), y: line }); poly.push({ x: cl(sx0), y: line });
      g.fillStyle(mix(bg, (GAME.CONFIG.COLORS.arenaFill || 0x6f7f4a), 0.22), 1);
      g.fillPoints(poly, true);
    }

    //  ② 흐르는 목책 — "걷고 있다"를 만드는 가장 강한 신호다(근경이라 빠르다).
    var gap = Math.max(46, bw / 13), pw = Math.max(4, bw * 0.005), ph = H * 0.085;
    var off = d.scroll % gap;
    //  ⚠ 말뚝 꼭대기 뼈는 x 보다 `pw*0.85` 더 넓다 → 오른쪽 끝을 그만큼 앞에서 끊는다.
    //    안 그러면 마지막 말뚝의 뼈만 구간 밖으로 삐져나온다.
    for (var x = bx0 - off; x < bx1 - pw * 1.35; x += gap) {
      if (x < bx0) continue;
      g.fillStyle(mix(bg, M.woodDark, 0.34), 1);
      g.fillRect(x, line - ph, pw, ph);
      g.fillStyle(mix(bg, M.bone, 0.42), 1);
      g.fillEllipse(x + pw / 2, line - ph, pw * 1.7, pw * 1.1, 8);
    }
    g.fillStyle(mix(bg, M.rope, 0.30), 1);
    g.fillRect(bx0, line - ph * 0.66, bw, Math.max(1.4, ph * 0.04));
    }

    //  ② 스킬 파문 — 땅에 퍼지는 고리 하나. 화려함보다 **읽히는 것**이 먼저다.
    if (d.skillFx) {
      var p = d.skillFx.t / d.skillFx.total, ia = 1 - p;
      var rr = (hero.def.radius || 16) * hero.scale * (1.2 + p * 2.4);
      g.lineStyle(Math.max(2, rr * 0.09), (GAME.UI.FX && GAME.UI.FX.blast) || 0xffb347, 0.75 * ia);
      g.strokeEllipse(d.skillFx.x, d.skillFx.y, rr * 2, rr * 2 * 0.42, 16);
      g.fillStyle((GAME.UI.FX && GAME.UI.FX.sparkCore) || 0xfff3cd, 0.5 * ia * ia);
      g.fillEllipse(d.skillFx.x, d.skillFx.y, rr * 1.1, rr * 1.1 * 0.42, 14);
    }

    //  ③ 참격 — 칼이 지나간 자리. 두 호의 차집합으로 만든 초승달이다.
    //     ⚠ 앞으로 **휘두른 방향**(오른쪽)을 향한다. 영웅이 오른쪽을 보고 걷는다.
    if (d.slash) {
      var sp2 = d.slash.t / d.slash.total, sa = 1 - sp2;
      var rO = (hero.def.radius || 16) * hero.scale * (d.slash.big ? 3.0 : 2.2);
      //  ⚠ 두께·호 길이는 **비율**이라 반지름이 커지면 같이 커진다. PC 영웅은 폰보다
      //    1.8배 크게 서는데(3.1배 대 1.72배), 예전 값(0.60 / 0.62rad)이면 두께 44px
      //    짜리 짧은 띠가 되어 **초승달이 아니라 베이지색 판때기**로 보였다(실측
      //    스크린샷). 얇고 길게 만들면 두 크기 모두에서 '지나간 자국'으로 읽힌다.
      var rI = rO * 0.72;
      var half = 0.80, spin = sp2 * 0.5 - 0.25;     // 위에서 아래로 훑는다
      var pts2 = [], nn = 10, ii, tt;
      for (ii = 0; ii <= nn; ii++) {
        tt = -0.05 + spin - half + (2 * half) * (ii / nn);
        pts2.push({ x: d.slash.x + Math.cos(tt) * rO, y: d.slash.y + Math.sin(tt) * rO * 0.62 });
      }
      for (ii = nn; ii >= 0; ii--) {
        tt = -0.05 + spin - half + (2 * half) * (ii / nn);
        pts2.push({ x: d.slash.x + Math.cos(tt) * rI, y: d.slash.y + Math.sin(tt) * rI * 0.62 });
      }
      g.fillStyle((GAME.UI.FX && GAME.UI.FX.blast) || 0xffb347, 0.55 * sa);
      g.fillPoints(pts2, true);
      g.lineStyle(Math.max(1.6, rO * 0.035), (GAME.UI.FX && GAME.UI.FX.sparkCore) || 0xfff3cd, 0.9 * sa);
      g.strokePoints(pts2.slice(nn + 1), false, false);
    }

    //  ④ 적 — 나가떨어지는 놈은 기울고 옅어진다.
    for (var i = 0; i < d.foes.length; i++) {
      var f = d.foes[i];
      var a = f.gone > 0 ? Math.max(0, 1 - f.gone / 900) : 1;
      var sc = hero.scale * 0.78;
      var rr2 = (f.def.radius || 14) * sc;
      var shc = (GAME.UI.COL && GAME.UI.COL.shadow) || 0x000000;
      g.fillStyle(shc, 0.22 * a);
      g.fillEllipse(f.x, f.y, rr2 * 1.7, rr2 * 1.7 * 0.42, 12);
      try {
        GAME.UI.drawUnitFlat(g, f.def, f.x, f.y - (f.gone > 0 ? Math.min(26, f.gone * 0.05) : 0),
                             GAME.CONFIG.COLORS.strategist, a * this.ALPHA, sc,
                             Math.PI / 2, f.gone > 0 ? 0 : f.walk, 0);
      } catch (e) { /* 하나가 실패해도 로비는 떠 있어야 한다 */ }
    }
  },

  //  버튼 라벨 **왼쪽**에 표식을 놓는다. 라벨이 가운데 정렬이라 그 폭에서 역산한다.
  //  ⚠ 버튼을 만든 **뒤**에 불러야 한다(그때라야 text.width 가 정해진다).
  markFor: function (scene, btn, kind, depthAbove) {
    if (!btn || !btn.text) return null;
    var t = btn.text;
    var s = (parseInt(t.style && t.style.fontSize, 10) || 18) * 1.15;
    var cx = t.x - t.width / 2 - s * 0.72;
    //  ⚠ **자리가 없으면 안 그린다.** 표식은 버튼 왼쪽 여백에 얹는 것이라, 라벨이
    //    칸을 거의 채운 좁은 버튼(폰 가로 유틸 줄은 최대 6칸이다)에서는 테두리를
    //    넘어 잘린다. 그런데 **칸 수가 기기마다 다르다** — 전체화면 API 가 없는
    //    아이폰은 칸이 하나 빠지고, 관리자면 하나 는다. 즉 "어느 버튼이 좁은지"를
    //    손으로 고를 수가 없다. 잴 수 있으니 여기서 잰다(이 저장소의 '좌표를 손으로
    //    박지 않는다' 규율과 같은 이유다).
    var r = btn.rect;
    if (r && r.width) {
      if (cx - s * 0.5 < r.x - r.width / 2 + s * 0.35) return null;
    }
    var g = scene.add.graphics().setDepth((t.depth || 0) + (depthAbove || 0));
    this.mark(g, kind, cx, t.y, s);
    return g;
  },

  //  markFor 의 **이미지판** — A-2 아이콘 시트(assets/icon)를 버튼 왼쪽 여백에 얹는다.
  //  기하·자리 검사는 markFor 와 같다(자리가 없으면 안 그린다). 텍스처가 아직 없으면
  //  (콜드 캐시 첫 부팅 등) fallbackKind 의 벡터 표식으로 대신한다 — 이미지가 그리기의
  //  전제조건이 되면 로드 타이밍에 따라 표식이 통째로 사라진다.
  //  반환: Phaser Image(이미지가 섰을 때) / Graphics(벡터 폴백) / null(자리 없음).
  iconFor: function (scene, btn, iconKey, fallbackKind) {
    if (!btn || !btn.text) return null;
    var t = btn.text;
    var s = (parseInt(t.style && t.style.fontSize, 10) || 18) * 1.5;
    var cx = t.x - t.width / 2 - s * 0.62;
    var r = btn.rect;
    if (r && r.width) {
      if (cx - s * 0.5 < r.x - r.width / 2 + s * 0.35) return null;
    }
    //  ⚠ 원본(260px+)을 그대로 27px 로 내리면 NPOT 밉맵 부재로 검은 얼룩이 된다
    //    (2026-08-23 실사고) — 단계 축소로 구운 thumb 텍스처를 쓴다.
    var tkey = GAME.GearBank && GAME.GearBank.thumb && GAME.GearBank.thumb(scene, iconKey, s);
    if (tkey) {
      var img = scene.add.image(cx, t.y, tkey);
      var sc = s / Math.max(1, Math.max(img.width, img.height));
      img.setScale(sc).setDepth((t.depth || 0) + 1);
      return img;
    }
    return fallbackKind ? this.markFor(scene, btn, fallbackKind, 1) : null;
  },

  // ── 로비 배경 (2026-08-04 사용자: "이 로비배경부터 진행해") ──────────────────
  //  로비는 크림색 단색이었다. 오늘 전장에 넣은 세계의 물건(원경 안개·능선·부족
  //  목책)이 정작 **처음 보는 화면**에는 하나도 없었다 — 게임이 무슨 세계인지
  //  첫 화면이 말해 주지 않는다.
  //
  //  ⚠ **전 프로필에서 그린다.** 옆의 영웅 아트(`start`)는 좁은 화면에서 꺼지지만
  //    (여백이 없어 글자와 겹친다) 배경은 글자 **뒤**라 겹칠 일이 없다. 실제로
  //    사람들이 보는 화면이 폰 가로인데 거기서만 빠지면 하나 마나다.
  //  ⚠ **글자 대비를 해치지 않는다.** 이 로비의 글자는 어두운 색이고 배경은 크림이다.
  //    그래서 지평선 아래만 살짝 눕히고 위쪽(제목·버튼이 앉는 자리)은 거의 안 건드린다.
  //    값을 키우고 싶어지면 먼저 그 위에 글자가 앉는지부터 볼 것 —
  //    전장 배경에서 똑같은 실수를 한 번 했다(v1.50 → v1.52 수정).
  //  ⚠ 색은 전부 토큰에서 유도한다. 하드코딩하면 테마 4종에서 혼자 안 따라온다.
  //  이 화면에 자동 재생 데모가 서는가. **`start()` 와 `backdrop()` 이 같은 답을
  //  봐야 한다** — 한쪽만 그린다고 판단하면 목책이 두 겹이 되거나 아예 사라진다.
  //  조건은 `start()` 의 분기와 정확히 같다: 폰 가로거나, 세로가 아니면서 충분히 넓은 PC.
  _hasDemo: function () {
    if (GAME.CONFIG.PHONE) return true;
    if (GAME.CONFIG.PORTRAIT) return false;
    return GAME.CONFIG.WIDTH >= this.MIN_W;
  },

  //  지평선 — 배경(들판 경계)과 데모(목책이 서는 줄)가 **같은 값을 봐야** 한다.
  LOBBY_HORIZON: 0.62,

  backdrop: function (scene) {
    var UI = GAME.UI, C = GAME.CONFIG.COLORS, M = UI.MAT;
    var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
    var g = scene.add.graphics();
    g.setDepth(-60);                       // 영웅 아트(-50)보다도 뒤

    var field = C.arenaFill || 0x6f7f4a;
    var bg = (UI.COL && UI.COL.bg) || 0xfbf2df;
    var horizon = H * this.LOBBY_HORIZON;

    //  ① 하늘 — 크림에서 아주 옅은 들판색으로. 12단이면 밴딩이 안 보인다.
    var i, t;
    for (i = 0; i < 12; i++) {
      t = i / 12;
      g.fillStyle(UI.mix(bg, field, 0.05 + t * 0.10), 1);
      g.fillRect(0, horizon * t, W, horizon / 12 + 1);
    }

    //  ② 먼 능선 — 톱니 실루엣. 좌표는 화면 폭으로 해시해 **캐시한다**
    //     (매 프레임 새로 뽑으면 언덕이 춤춘다 — 전장에서 배운 것).
    var key = 'lobby|' + Math.round(W) + '|' + Math.round(H);
    if (this._ridgeKey !== key) {
      var seed = 0, si;
      for (si = 0; si < key.length; si++) seed = (seed * 31 + key.charCodeAt(si)) >>> 0;
      var rnd = function () {
        seed ^= seed << 13; seed >>>= 0; seed ^= seed >> 17; seed ^= seed << 5; seed >>>= 0;
        return seed / 4294967296;
      };
      var pts = [], step = Math.max(30, W / 22), x;
      for (x = -step; x <= W + step; x += step) pts.push({ x: x, y: rnd() });
      this._ridge = pts; this._ridgeKey = key;
    }
    //  ⚠ 데모가 도는 화면에서는 **데모 레이어가 흐르는 능선·목책을 그린다.** 여기서
    //    또 그리면 정지한 것과 흐르는 것이 겹쳐 **두 겹**으로 보인다.
    //  ⚠ 예전엔 이 판정이 `CONFIG.PHONE` 이었다. 데모가 폰에만 있었기 때문이다.
    //    PC 에도 데모를 세우자(2026-08-05) 곧바로 목책이 두 줄로 겹쳤다(실측 스크린샷)
    //    — 높이가 서로 달라서 울타리가 두 개 있는 것처럼 보였다.
    //    → 판정을 **데모가 실제로 도는 조건**과 같은 식으로 맞춘다. 한쪽만 고치면
    //      다시 어긋나므로 `_hasDemo` 하나를 양쪽이 같이 본다.
    var anim = this._hasDemo();
    var rid = this._ridge, poly = [], k;
    if (anim) rid = [];
    var rh = H * 0.13;
    for (k = 0; k < rid.length; k++) {
      poly.push({ x: rid[k].x, y: horizon - rh * (0.35 + rid[k].y * 0.65) });
    }
    poly.push({ x: W + 60, y: horizon }); poly.push({ x: -60, y: horizon });
    g.fillStyle(UI.mix(bg, field, 0.26), 1);
    g.fillPoints(poly, true);

    //  ③ 들판 — 지평선 아래. 여기가 이 화면에서 유일하게 진한 면이다.
    g.fillStyle(UI.mix(bg, field, 0.40), 1);
    g.fillRect(0, horizon, W, H - horizon);
    g.fillStyle(UI.mix(bg, field, 0.52), 1);          // 앞쪽이 조금 더 진하다
    g.fillRect(0, H * 0.86, W, H - H * 0.86);

    //  ④ 부족 목책 — 지평선 위에 늘어선 기둥. 이 세계가 어디인지 한 줄로 말한다.
    //     ⚠ 실루엣만 낸다(면 없이). 진하게 칠하면 그 위 버튼 글자와 싸운다.
    var postW = Math.max(5, W * 0.006), gap = anim ? W * 9 : Math.max(34, W / 22);
    var ph = H * 0.075;
    for (x = gap * 0.5; x < W; x += gap) {
      g.fillStyle(UI.mix(bg, M.woodDark, 0.42), 1);
      g.fillRect(x, horizon - ph, postW, ph);
      g.fillStyle(UI.mix(bg, M.wood, 0.34), 1);       // 광원 좌상단 — 왼쪽 면만
      g.fillRect(x, horizon - ph, Math.max(1, postW * 0.34), ph);
      g.fillStyle(UI.mix(bg, M.bone, 0.50), 1);       // 기둥 끝 뼈 마디
      g.fillEllipse(x + postW / 2, horizon - ph, postW * 1.7, postW * 1.1, 8);
    }
    //  가로로 묶은 밧줄 두 줄
    g.fillStyle(UI.mix(bg, M.rope, 0.38), 1);
    g.fillRect(0, horizon - ph * 0.72, W, Math.max(1.5, ph * 0.045));
    g.fillRect(0, horizon - ph * 0.34, W, Math.max(1.5, ph * 0.045));

    return g;
  },

  start: function (scene) {
    if (!GAME.UI || !GAME.UI.drawUnitFlat || !GAME.HEROES) return null;
    var self = this;
    var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
    var C = GAME.CONFIG.COLORS;

    // ── 폰 가로 (2026-08-04 사용자: "로비에 영웅 세워줘 · 멋있게") ──────────────
    //  예전에는 폰에서 **아예 안 그렸다**("여백이 없어 글자와 겹친다"). 그런데 이
    //  게임의 실제 플레이는 전부 폰 가로다 — 가장 좋은 자산이 정작 사람들이 보는
    //  화면에서만 빠져 있었다.
    //
    //  다시 재 보니 여백이 **있다.** 폰 가로 로비는 왼쪽 열에 제목(위 ~37%)과
    //  도움말(아래 ~80%)만 있고 그 사이가 통째로 빈다. 오른쪽은 버튼이 다 쓴다.
    //  → 그 빈 구간에 **한 기를 크게** 세운다. 둘을 세우면 각각이 작아져 계란의
    //    생김새(투구·무기·표정)가 다시 사라진다 — 이 파일이 '행렬'에서 이미 배운 것이다.
    //  ⚠ 세로(PORTRAIT)는 여전히 안 그린다. 거기는 위아래로 꽉 차 정말로 자리가 없다.
    if (GAME.CONFIG.PHONE) {
      var pg = scene.add.graphics();
      pg.setDepth(-50);
      //  ⚠ **레이어 알파를 걸지 않는다** (2026-08-04, 한 번 넣었다가 되돌렸다).
      //    0.45 를 걸어 봤더니 **경계선이 보였다** — 레이어 알파는 '그려진 픽셀'만
      //    반투명하게 만들어서 도형의 가장자리가 그대로 남는다(화면 전체가 균일하게
      //    물러나는 것이 아니다). 실제 게임에서 확인하니 100% 로도 메뉴를 안 가린다
      //    (데모는 지평선 아래에 있고 글자는 그 위·옆에 있다) → 그대로 둔다.
      var pdef = GAME.HEROES[(GAME.TowerChar && GAME.TowerChar.exists && GAME.TowerChar.exists()
                              && GAME.TowerChar.get().heroKey) || 'vanguard']
                 || GAME.HEROES.vanguard;
      if (!pdef) { try { pg.destroy(); } catch (e) {} return null; }
      // ── 자동 재생 데모 (2026-08-04 사용자 지시) ─────────────────────────────
      //  > "제자리에서 오른쪽으로 걸어가는 모션 / 배경이 오른쪽에서 왼쪽으로 움직이면서
      //  >  적유닛이 나오고 전사가 공격모션해서 유닛이 나가떨어지는 애니메이션 /
      //  >  유닛들은 다양하게 / 가끔 스킬도"
      //
      //  로비가 **게임을 보여 준다.** 정지 화면이 아니라 짧은 시연이다.
      //  ⚠ **전투 로직을 안 쓴다.** `js/combat.js` 를 부르면 밸런스·저장·시드가 로비에
      //    끌려 들어온다. 여기는 좌표와 타이머만 있는 **연출**이고, 죽고 사는 판정도
      //    없다(적은 맞으면 무조건 날아간다). 순수 렌더라는 이 파일의 약속을 지킨다.
      //  ⚠ 배경은 **`backdrop` 이 그린 것을 밀지 않는다** — 그건 한 번 구운 정지화면이다.
      //    대신 이 레이어가 자기 목책을 스크롤해 "걷고 있다"를 만든다.
      return {
        g: pg, t: 0, demos: [this._newDemo(W, H)],
        guards: [{
          def: pdef,
          //  A안 로비(2026-08-21): 좌상단 칩(~y90)과 하단 카드(y278~) 사이의
          //  왼쪽 들판이 영웅의 무대다. 예전 좌표(0.68H)는 새 카드 줄에 반쯤 먹혔다
          //  (태현님 "로비 유닛이 잘 안 보임"). 중단으로 올리고 한 단계 키운다.
          x: W * 0.16,
          y: H * 0.56,
          scale: Math.min(2.15, H / 181),
          facing: -Math.PI / 2,            // 정면. 뒤를 보면 eggart 가 얼굴을 지운다
          color: C.controller,
          phase: 0
        }]
      };
    }
    if (GAME.CONFIG.PORTRAIT) return null;
    if (W < this.MIN_W) return null;

    var g = scene.add.graphics();
    g.setDepth(-50);                       // 무조건 글자 뒤로

    var guards = [];
    this.GUARDS.forEach(function (spec, i) {
      var def = GAME.HEROES[spec.key];
      if (!def) return;
      // 좌우 여백의 한가운데. 버튼 띠(가운데 약 440px)를 절대 안 넘어간다.
      var margin = (W - 460) / 2;
      var cx = (spec.side < 0) ? margin * 0.52 : W - margin * 0.52;
      guards.push({
        def: def,
        x: cx,
        y: H * 0.58,
        // 여백 폭에 맞춰 키운다 — 계란의 생김새가 읽히는 크기라야 뜻이 있다.
        scale: Math.max(1.9, Math.min(3.1, margin / 140)),
        // ⚠ **둘 다 정면을 본다.** 처음엔 서로 마주 보게 0 / π 를 줬는데, eggart 는
        //   뒤를 보면 얼굴을 지우고 무기를 몸통 뒤로 감춘다 — 오른쪽 영웅이 활
        //   부스러기 뭉치처럼 보였다(실측). 간판에 세우는 그림은 정면이어야 한다.
        facing: -Math.PI / 2,
        color: (i === 0) ? C.controller : C.strategist,
        phase: i * 900                             // 숨쉬기 위상을 어긋내 쌍둥이처럼 안 보이게
      });
    });
    if (!guards.length) { try { g.destroy(); } catch (e) {} return null; }

    // ── PC 로비 데모 (2026-08-05) ────────────────────────────────────────────
    //  폰 가로에만 있던 자동 재생 시연을 PC 에도 세운다. 첫 화면이 "이 게임은 이런
    //  게임이다"를 말해 주는 것이 목적이므로 큰 화면에서 빠질 이유가 없다.
    //
    //  ⚠ **폰과 자리 잡는 방식이 완전히 다르다.** 폰은 버튼이 오른쪽 절반이라 데모가
    //    화면 전체를 써도 되지만, PC 는 **버튼 띠가 정중앙**이다. 그대로 옮기면
    //    흐르는 목책이 버튼 한가운데를 관통한다 → 좌우 여백을 각각 하나의 구간으로
    //    주고 그 안에서만 돌린다(`_newDemo` 의 band).
    //  ⚠ 구간은 **영웅이 실제로 선 자리에서 역산한다.** 위 `margin` 을 그대로 쓰면
    //    영웅이 구간 밖에 설 수 있다(여백 폭이 화면 폭에 따라 변한다).
    //  ⚠ 소리는 왼쪽 하나만 낸다 — 둘 다 울리면 같은 타격음이 겹쳐 두 번 난다.
    var mg = (W - 460) / 2;
    var hz = H * this.LOBBY_HORIZON;
    var demos = guards.map(function (h, gi) {
      var left = (gi === 0);
      //  ⚠ 영웅을 **지평선 위에 세운다.** 그대로 두면(H*0.58) 배경의 들판 경계보다
      //    위에 떠서, 흐르는 목책과 발밑이 따로 논다.
      h.y = hz + (h.def.radius || 16) * h.scale * 0.28;
      return self._newDemo(W, H, {
        x0: left ? 0 : W - mg,
        x1: left ? mg : W,
        //  적은 구간의 바깥쪽 끝에서 걸어 들어온다(영웅 쪽으로).
        spawnX: left ? mg * 0.96 : W - mg * 0.04,
        //  목책은 배경의 들판 경계에 세운다 — 배경과 데모가 **같은 지평선**을 본다.
        line: hz,
        //  시작 시각을 어긋내 좌우가 **한 몸처럼** 움직이지 않게 한다
        //  (숨쉬기 위상을 어긋낸 것과 같은 이유다).
        delay: 600 + gi * 1100,
        mute: !left
      });
    });
    return { g: g, guards: guards, t: 0, demos: demos };
  },

  // 매 프레임. `dtMs` 는 씬이 준 델타다.
  update: function (state, dtMs) {
    if (!state || !state.g || !state.g.scene) return;    // 씬이 바뀌면 조용히 멈춘다
    var dt = (typeof dtMs === 'number' && dtMs > 0) ? Math.min(dtMs, 100) : 16;
    state.t += dt;
    var g = state.g;
    g.clear();

    //  ── 공기 (2026-08-23) — 로비가 정물이라 "게임이 살아 있다"는 인상이 약했다.
    //  떠다니는 민들레 씨·재티 몇 점이 들판에 바람을 만든다. 전부 벡터(자산 0KB),
    //  개수 상한 14 라 그리기 비용은 무시할 수준. 글자 대비를 해치지 않게 아주 옅다.
    if (!state.motes) {
      state.motes = [];
      var mW = GAME.CONFIG.WIDTH, mH = GAME.CONFIG.HEIGHT;
      for (var mi = 0; mi < 14; mi++) {
        state.motes.push({
          x: Math.random() * mW, y: Math.random() * mH * 0.72,
          r: 1.4 + Math.random() * 2.2,
          vx: 8 + Math.random() * 14,          //  왼→오른쪽으로 흐르는 미풍
          ph: Math.random() * Math.PI * 2,     //  둥실거림 위상
          warm: Math.random() < 0.35           //  따뜻한 점(불티) / 밝은 점(씨앗)
        });
      }
    }
    var mW2 = GAME.CONFIG.WIDTH, mH2 = GAME.CONFIG.HEIGHT;
    for (var mj = 0; mj < state.motes.length; mj++) {
      var mo = state.motes[mj];
      mo.x += mo.vx * dt / 1000;
      var my = mo.y + Math.sin(state.t / 1400 + mo.ph) * 9;
      if (mo.x > mW2 + 8) { mo.x = -8; mo.y = Math.random() * mH2 * 0.72; }
      var tw = 0.10 + 0.08 * Math.sin(state.t / 900 + mo.ph * 2);
      g.fillStyle(mo.warm ? 0xd99b5a : 0xfff6e0, Math.max(0.05, tw));
      g.fillEllipse(mo.x, my, mo.r * 2, mo.r * 2, 8);
    }
    //  데모 — 적을 굴리고 목책을 흘린 뒤, 영웅은 아래 루프가 그 위에 그린다.
    //  ⚠ **영웅과 짝을 맞춰 돈다**(PC 는 좌우 둘이다). 배열 길이가 어긋나도
    //    조용히 건너뛴다 — 아트 하나 때문에 로비가 안 뜨면 안 된다.
    if (state.demos) {
      for (var di = 0; di < state.demos.length; di++) {
        if (!state.guards[di]) continue;
        state.demos[di].t0 = state.t;
        this._demoUpdate(state.demos[di], state.guards[di], dt);
        this._demoDraw(g, state.demos[di], state.guards[di]);
      }
    }
    for (var i = 0; i < state.guards.length; i++) {
      var h = state.guards[i];
      try {
        //  ── 발밑 (2026-08-04) ────────────────────────────────────────────
        //  그림자가 없으면 영웅이 배경 위에 **떠 있다.** 전장에서 잡은 규칙과 같이
        //  간다: 넓고 옅은 겹 + 좁고 진한 겹, 오프셋은 광원(좌상단)의 반대쪽.
        //  ⚠ 숨쉬기로 몸이 오르내려도 그림자는 **제자리**다. 같이 움직이면 발이
        //    바닥에서 떨어졌다 붙었다 하는 것으로 보인다.
        var M = GAME.UI.MAT, L = GAME.UI.LIGHT;
        var rr = (h.def.radius || 16) * h.scale;
        var shc = (GAME.UI.COL && GAME.UI.COL.shadow) || 0x000000;
        var ox = L ? -L.dir.x * rr * 0.16 : 0, oy = L ? -L.dir.y * rr * 0.10 * 0.72 : 0;
        g.fillStyle(shc, 0.13);
        g.fillEllipse(h.x + ox, h.y + oy, rr * 2.5, rr * 2.5 * 0.42, 14);
        g.fillStyle(shc, 0.30);
        g.fillEllipse(h.x + ox * 0.6, h.y + oy * 0.5, rr * 1.5, rr * 1.5 * 0.42, 12);
        //  진영 링 — 전장에서 내 영웅을 가리키는 그 표식이다. 로비에서도 같은 말을 한다.
        g.lineStyle(Math.max(2, rr * 0.10), h.color, 0.75);
        g.strokeEllipse(h.x, h.y, rr * 1.9, rr * 1.9 * 0.42, 14);
        g.lineStyle(Math.max(1.2, rr * 0.05), M.bone, 0.55);
        g.strokeEllipse(h.x, h.y, rr * 2.2, rr * 2.2 * 0.42, 14);

        // `idle` 에 시각을 넘기면 그 한 기가 숨 쉬고 가끔 무기를 휘두른다(eggart 규약).
        //  ⚠ 데모가 돌 때는 **걸음걸이와 공격 포즈**를 같이 넘긴다. `walk` 는 위상이라
        //    제자리에서도 다리가 움직이고, 흐르는 목책이 "앞으로 간다"를 만든다.
        var dm = state.demos && state.demos[i];
        GAME.UI.drawUnitFlat(g, h.def, h.x, h.y, h.color, this.ALPHA,
                             h.scale, h.facing,
                             dm ? state.t * 0.011 : null,
                             state.t + h.phase,
                             dm ? dm.act : null);
      } catch (e) { /* 아트 하나가 실패해도 로비는 떠 있어야 한다 */ }
    }
  },

  stop: function (state) {
    if (state && state.g && state.g.scene) { try { state.g.destroy(); } catch (e) {} }
  }
};
