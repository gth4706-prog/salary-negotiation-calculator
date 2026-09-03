window.GAME = window.GAME || {};

// ============================================================================
//  배경음악 — **파일 없이 WebAudio 로 연주한다** (2026-08-01 사용자 지시)
//
//  `js/sound.js` 가 효과음에 대해 세운 정책을 음악까지 그대로 끌고 온다:
//  이 게임은 GitHub Pages 정적 배포 + 빌드 단계 없음이라 mp3 를 얹는 순간
//  그게 곧 첫 로딩 지연이다(4곡이면 저용량으로 눌러도 2~4MB). 그림을 전부
//  Phaser Graphics 로 손으로 그리는 저장소에서 음악만 파일로 사 오는 것도 결이 안 맞는다.
//  → **자산 0KB.** 이 파일 하나가 곧 음원이다.
//
//  ## 세계관 (CLAUDE.md 'Egg War')
//  원시 계란 부족의 전쟁이다. 그래서 악기도 원시적인 것만 쓴다 —
//  **통나무 북 · 가죽 북 · 뼈 피리 · 흔들이(씨앗) · 흙 종 · 부족의 구호.**
//  현대 악기(신시사이저 리드·드럼머신)의 소리를 내지 않도록 파형과 필터를 골랐다.
//  12세 이용가라 무섭게 가지 않는다 — 통곡의 탑조차 '웅장한 슬픔'이지 공포가 아니다.
//
//  ## 왜 스텝 시퀀서인가
//  `setTimeout` 으로 음을 하나씩 울리면 **박자가 무너진다**(타이머 오차가 수십 ms 다).
//  WebAudio 의 표준 해법을 쓴다: 25ms 마다 깨어나 **120ms 앞까지 미리 예약**하고,
//  실제 발음 시각은 `ctx.currentTime` 기준의 절대 시각으로 준다. 타이머가 밀려도
//  소리는 정확한 시각에 난다.
//
//  ## AudioContext 는 하나뿐이다
//  `GAME.Sound` 의 컨텍스트를 **빌려 쓴다.** 모바일에서 컨텍스트를 두 개 열면
//  한쪽이 조용히 죽거나 지연이 생긴다. 대신 음악 전용 게인(`bus`)을 따로 두어
//  **효과음과 음량을 독립**시킨다 — 음악은 배경으로 물러나야 하고 타격음은 들려야 한다.
//
//  ## 실패해도 게임은 돌아간다
//  sound.js 와 같은 원칙이다. 오디오가 막힌 환경에서 예외가 나면 안 된다.
// ============================================================================
GAME.Music = {
  KEY: 'asymgame.music.v1',

  enabled: true,
  // 효과음(0.5)보다 낮게 잡는다. 배경음악이 타격음을 덮으면 회피 게임의 신호가 죽는다.
  volume: 0.34,

  ctx: null,
  bus: null,
  cur: null,          // 지금 틀고 있는 곡 key
  _want: null,        // 아직 컨텍스트가 안 열려서 대기 중인 곡
  _timer: null,
  _nextT: 0,          // 다음에 예약할 스텝의 절대 시각(초)
  _step: 0,
  _ready: false,

  TICK: 25,           // 스케줄러가 깨어나는 주기(ms)
  LOOKAHEAD: 0.12,    // 미리 예약해 두는 길이(초)
  FADE: 0.45,         // 곡을 바꿀 때 겹쳐 넘기는 시간(초)

  //  ── 파일 곡 (2026-08-23 태현님: 수노로 만든 통곡의 탑 곡을 넣어라) ─────────
  //  "자산 0KB" 정책의 **명시적 예외**다 — 태현님이 수노로 직접 만든 곡은
  //  절차 합성으로 대체할 수 없는 자산이라 파일로 얹는다.
  //  · HTMLAudio 로 **스트리밍** 재생(7MB 를 다 받기 전에 소리가 난다)
  //  · MediaElementSource 로 기존 bus 에 물린다 — 페이드·음량·끄기 전부 공용
  //  · 파일이 못 열리면(404·코덱) 같은 key 의 합성곡(SONGS)으로 폴백한다
  //  BGM 풀세트(2026-08-23 태현님 전달, 10파일 실측 후 선정):
  //  로비·수성·통곡 = 본판(길이·피크 여유·루프 꼬리 우위) / 실시간·공성 대기 = alt
  //  (1dB 더 크고 시작 -14.4dB 로 즉각적, 루프 꼬리 -50dB — 대기실 루프에 맞다).
  FILES: {
    lobby: 'assets/bgm/lobby.mp3',
    tower: 'assets/bgm/tower.mp3',
    defend: 'assets/bgm/defend.mp3',
    versus: 'assets/bgm/versus.mp3'
  },
  //  결과 스팅어 — 본곡 컷팅 임시본(전용판이 오면 파일만 교체).
  STING_FILES: { win: 'assets/bgm/sting-win.mp3', lose: 'assets/bgm/sting-lose.mp3' },
  //  ⚠⚠ 파일 URL 의 캐시 키 (2026-09-03 시즌2 버그 수정). 예전엔 `?v=` 에 GAME.VERSION
  //    을 붙여서 **배포마다 21MB 를 다시 받았다**(sw.js 가 URL 을 캐시 키로 쓰고, 같은
  //    경로의 옛 `?v=` 항목은 지운다 → 0.01 올릴 때마다 mp3 4곡 전량 재다운로드).
  //    빌드 단계가 없어 내용 해시를 자동으로 못 박으므로 **고정 값**을 쓴다 —
  //    mp3 를 실제로 갈아끼울 때만 사람이 올린다(sound.js 의 `?v=1` 과 같은 규칙).
  BGM_VER: 1,
  _fileUrl: function (p) { return p + '?v=' + this.BGM_VER; },
  _el: null,          // 재사용하는 오디오 엘리먼트(MediaElementSource 는 1회만 생성 가능)
  _elNode: null,
  _fileKey: null,     // 파일 모드로 울리는 중인 곡 key
  _fileBroken: {},    // key → true (로드 실패 — 합성 폴백 고정)
  _stEl: null, _stGain: null, _stCur: null, _stBroken: {},

  // ── 수명 주기 ─────────────────────────────────────────────────────────────
  init: function () {
    try {
      var saved = GAME.Store ? GAME.Store.get(this.KEY, null) : null;
      if (saved) {
        if (saved.enabled !== undefined) this.enabled = !!saved.enabled;
        if (typeof saved.volume === 'number') this.volume = saved.volume;
      }
    } catch (e) {}
  },

  // `GAME.Sound` 가 첫 사용자 입력에서 컨텍스트를 연다. 우리는 그게 열렸는지만 본다.
  //  ⚠ 여기서 직접 `new AudioContext` 를 하지 않는다 — 두 개가 되면 모바일에서 깨진다.
  _attach: function () {
    if (this._ready) return true;
    var S = GAME.Sound;
    if (!S || !S._ready || !S.ctx) return false;
    try {
      this.ctx = S.ctx;
      this.bus = this.ctx.createGain();
      this.bus.gain.value = 0;          // 항상 0 에서 시작해 페이드로 올린다(툭 튀지 않게)
      this.bus.connect(this.ctx.destination);
      this._buildGraph();
      this._ready = true;
      // ⚠ **여기서 소리를 올려야 한다.** 첫 곡(로비)은 거의 언제나 컨텍스트가 열리기
      //   *전에* 요청된다 — 씬은 바로 뜨는데 오디오는 첫 입력을 기다리기 때문이다.
      //   그때 `_begin` 의 페이드인은 `_ready` 가 false 라 건너뛰어지고, 그 뒤로는
      //   게인을 올려 줄 사람이 아무도 없다. 실제로 그래서 **로비 음악이 소리 없이
      //   연주되고 있었다**(스케줄러는 돌고 게인만 0). 화면에는 아무 증상이 없어서
      //   실시간 검사(`_step` 은 느는데 `bus.gain` 이 0)로만 잡혔다.
      //   소리를 낼 수 있게 된 순간이 곧 페이드인을 걸 순간이다.
      if (this.cur && this.enabled) this._ramp(this.volume, 0.8);
      return true;
    } catch (e) { return false; }
  },

  setEnabled: function (on) {
    this.enabled = !!on;
    if (this._ready) this._ramp(this.enabled ? this.volume : 0, 0.25);
    if (this.enabled && this._want && !this._timer) this.play(this._want, true);
    this._save();
  },
  setVolume: function (v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this._ready && this.enabled) this._ramp(this.volume, 0.15);
    this._save();
  },
  toggle: function () { this.setEnabled(!this.enabled); return this.enabled; },
  _save: function () {
    try { if (GAME.Store) GAME.Store.set(this.KEY, { enabled: this.enabled, volume: this.volume }); }
    catch (e) {}
  },

  _ramp: function (to, sec) {
    if (!this._ready) return;
    try {
      var t = this.ctx.currentTime;
      this.bus.gain.cancelScheduledValues(t);
      this.bus.gain.setValueAtTime(this.bus.gain.value, t);
      this.bus.gain.linearRampToValueAtTime(to, t + sec);
    } catch (e) {}
  },

  // ── 레이어 (2026-09-03 시즌2 S-S) ───────────────────────────────────────────
  //  악기 → 레이어 게인(base|tense) → [전투 EQ] → bus → destination.
  //  · `base` 는 곡의 몸통, `tense` 는 전투 중 영웅 체력·보스 페이즈에 따라 battle.js 가
  //    `setLayer('tense', 0~1)` 로 올리는 **긴장 겹**(저역 bass 맥박 + 고역 tick 만).
  //  · 전투 모드(`playBattle`)에서는 base 를 0.15 로 눕히고, 중역 선율 트랙(`battleMute`)
  //    은 아예 안 예약하며, 타격음 대역을 EQ 로 비운다 — 음악이 회피 신호를 덮으면 안 된다.
  //  ⚠ 그래프는 컨텍스트마다 다시 짓는다(`_buildGraph`) — 감사가 오프라인 ctx 로 갈아끼운다.
  LAYERS: ['base', 'tense'],
  BATTLE_BASE: 0.15,
  //  타격음이 사는 대역 — sound.js 의 hit(420·2600)·heroHurt(190~520)·skillBurst(1600)·
  //  critHit(3600) 이 여기 있다. 전투 중 음악은 이 자리를 비워 둔다.
  BATTLE_EQ: [{ f: 340, q: 0.7, db: -9 }, { f: 1600, q: 2.0, db: -7 },
              { f: 2600, q: 2.0, db: -7 }, { f: 3600, q: 2.0, db: -6 }],
  _layerGain: null,
  _eq: null,
  _battle: false,
  _buildGraph: function () {
    var ctx = this.ctx, self = this;
    this._layerGain = {};
    this.LAYERS.forEach(function (name) {
      var g = ctx.createGain();
      g.gain.value = name === 'base' ? 1 : 0;
      self._layerGain[name] = g;
    });
    //  EQ 사슬 — 첫 필터로 들어가 마지막 필터가 bus 로 나간다.
    var chain = this.BATTLE_EQ.map(function (b) {
      var f = ctx.createBiquadFilter();
      f.type = 'peaking'; f.frequency.value = b.f; f.Q.value = b.q; f.gain.value = b.db;
      return f;
    });
    for (var i = 0; i + 1 < chain.length; i++) chain[i].connect(chain[i + 1]);
    if (chain.length) chain[chain.length - 1].connect(this.bus);
    this._eq = chain;
    this._route(this._battle);
  },
  //  레이어 출력을 EQ 를 거칠지(전투) 바로 bus 로 갈지(평소) 바꿔 꽂는다.
  _route: function (battle) {
    if (!this._layerGain) return;
    var self = this;
    this.LAYERS.forEach(function (name) {
      var g = self._layerGain[name];
      try { g.disconnect(); } catch (e) {}
      if (battle && self._eq && self._eq.length) g.connect(self._eq[0]);
      else g.connect(self.bus);
    });
  },
  //  트랙이 나갈 목적지 — 레이어 이름이 틀리면 base 로(조용히 사라지는 것보다 낫다).
  _dest: function (tr) {
    var lg = this._layerGain;
    if (!lg) return this.bus;
    return lg[tr && tr.layer] || lg.base;
  },
  //  레이어 음량. level 0~1, sec 은 램프 길이(기본 0.4). 전투 중 battle.js 가 부른다.
  setLayer: function (name, level, sec) {
    if (!this._layerGain || !this._layerGain[name]) return false;
    var g = this._layerGain[name].gain;
    var to = Math.max(0, Math.min(1, +level || 0));
    if (this._battle && name === 'base') to = Math.min(to, this.BATTLE_BASE);
    try {
      var t = this.ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(to, t + (sec === undefined ? 0.4 : Math.max(0.01, sec)));
    } catch (e) { return false; }
    return true;
  },
  getLayer: function (name) {
    return (this._layerGain && this._layerGain[name]) ? this._layerGain[name].gain.value : 0;
  },

  //  ── 전투 모드 ──────────────────────────────────────────────────────────────
  //  세계 곡의 base 레이어만 아주 작게(≤0.15) 깔고, tense 는 0 에서 시작한다.
  //  worldKey ∈ meadow|mist|ash|rift|storm — 없거나 모르면 meadow.
  //  ⚠ 세계 곡은 FILES 에 없으므로 언제나 합성이다 — mp3 는 전투 대역을 못 비운다.
  WORLD_SONG: { meadow: 'w_meadow', mist: 'w_mist', ash: 'w_ash', rift: 'w_rift', storm: 'w_storm' },
  //  세계 키 별칭(2026-09-03 2차 S-A) — 정본(js/season.js WORLDS)은 안개늪을 `mire` 라 부르고
  //  이 파일·ui.js 는 `mist` 라 부른다. 두 이름 다 같은 곡·같은 스팅어여야 하므로 **들어오는
  //  키를 여기서 한 번 접는다**(playBattle·stingScore·worldKeyFor 전부). 전장 규칙 키
  //  (fog/swamp/lava/quake/storm)로 불러도 그 세계의 곡이 난다.
  WORLD_ALIAS: { mire: 'mist', fog: 'mist', swamp: 'mist', lava: 'ash', quake: 'rift', grass: 'meadow', sky: 'storm' },
  worldKey: function (k) {
    if (k && typeof k === 'object') k = k.key || k.world || k.kind;
    if (!k) return null;
    k = String(k);
    if (this.WORLD_SONG[k]) return k;
    return this.WORLD_ALIAS[k] || null;
  },
  playBattle: function (worldKey) {
    var key = this.WORLD_SONG[this.worldKey(worldKey) || 'meadow'] || this.WORLD_SONG.meadow;
    this._battle = true;
    if (this._ready) {
      this._route(true);
      this.setLayer('base', this.BATTLE_BASE, 0.3);
      this.setLayer('tense', 0, 0.1);
    }
    this.play(key);
    return key;
  },
  //  층 → 세계 키 폴백. S-W 갈래의 `GAME.TowerCurriculum.worldFor` 가 있으면 그쪽이 정답이고
  //  이 표는 그 전까지의 임시 경계(플랜 §1 S-W: 1~30·31~60·61~100·101~150·151+)다.
  worldKeyFor: function (floor) {
    //  정본 순서: TowerCurriculum.worldFor → TowerWorld.worldFor(S-W) → Season.worldFor(S-F) → 층 경계.
    //  어느 쪽이 `mire` 를 돌려줘도 `worldKey` 가 이 파일의 이름(`mist`)으로 접는다.
    var srcs = [GAME.TowerCurriculum, GAME.TowerWorld, GAME.Season];
    for (var i = 0; i < srcs.length; i++) {
      var TC = srcs[i];
      if (TC && typeof TC.worldFor === 'function') {
        try {
          var w = TC.worldFor(floor);
          var k = this.worldKey(w);
          if (k) return k;
        } catch (e) {}
      }
    }
    var f = +floor || 1;
    return f <= 30 ? 'meadow' : f <= 60 ? 'mist' : f <= 100 ? 'ash' : f <= 150 ? 'rift' : 'storm';
  },
  //  평상 모드로 되돌린다 — play()/stop() 이 부른다.
  _leaveBattle: function () {
    if (!this._battle) return;
    this._battle = false;
    if (this._ready) {
      this._route(false);
      this.setLayer('base', 1, 0.3);
      this.setLayer('tense', 0, 0.3);
    }
  },

  // ── 곡 전환 ───────────────────────────────────────────────────────────────
  //  같은 곡을 다시 요청하면 **아무 일도 안 한다.** 씬을 오갈 때마다 곡이 처음으로
  //  되감기면 그게 더 거슬린다(상점 ↔ 층 화면을 오가는 흐름이 잦다).
  play: function (key, force) {
    if (!this.SONGS[key]) return;
    //  세계 곡이 아닌 곡을 요청하면 전투 모드를 푼다(전투 → 결과/허브 전환).
    if (this._battle && !this._isWorldSong(key)) this._leaveBattle();
    if (this.cur === key && !force) return;
    var self = this;
    this._want = key;
    if (!this.enabled) { this.cur = key; return; }
    if (this._ready && this.cur && !force) {
      // 이미 뭔가 울리고 있으면 **겹쳐 넘긴다.** 뚝 끊으면 화면 전환이 거칠어진다.
      this._ramp(0, this.FADE);
      setTimeout(function () { self._begin(key); }, Math.round(this.FADE * 1000));
    } else {
      this._begin(key);
    }
  },

  _begin: function (key) {
    this.cur = key;
    this._step = 0;
    this._nextT = 0;                 // `_tick` 이 컨텍스트 시각을 보고 다시 잡는다
    this._fileStop();                // 곡이 바뀌면 파일 재생부터 끊는다
    if (this._ready && this.enabled) this._ramp(this.volume, 0.5);
    this._run();
  },

  stop: function () {
    this.cur = null; this._want = null;
    this._fileStop();
    this._ramp(0, 0.35);
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this._leaveBattle();
  },
  _isWorldSong: function (key) {
    for (var w in this.WORLD_SONG) if (this.WORLD_SONG[w] === key) return true;
    return false;
  },

  //  ── 파일 곡 재생부 ────────────────────────────────────────────────────────
  _fileStop: function () {
    if (this._el && this._fileKey) { try { this._el.pause(); } catch (e) {} }
    this._fileKey = null;
  },
  //  true = 파일이 담당한다(스케줄러는 쉬어라) / false = 합성으로 가라
  _fileTick: function (key) {
    if (!this.FILES[key] || this._fileBroken[key]) return false;
    if (this._fileKey === key) return true;         // 이미 울리는 중
    var self = this;
    try {
      if (!this._el) {
        this._el = new Audio();
        this._el.loop = true;
        this._el.crossOrigin = 'anonymous';
        this._el.addEventListener('error', function () {
          //  로드 실패 — 이 곡은 합성으로 폴백하고 다시는 파일을 시도하지 않는다.
          if (self._fileKey) self._fileBroken[self._fileKey] = true;
          self._fileKey = null;
        });
        //  bus 에 물리면 페이드·음량·끄기가 합성곡과 완전히 같은 길을 탄다.
        this._elNode = this.ctx.createMediaElementSource(this._el);
        this._elNode.connect(this.bus);
      }
      var want = this._fileUrl(this.FILES[key]);
      if (!this._el.src || this._el.src.indexOf(this.FILES[key]) < 0) this._el.src = want;
      var p = this._el.play();
      if (p && p.catch) p.catch(function () { /* 제스처 전 — 다음 틱에 재시도 */ });
      this._fileKey = key;
      return true;
    } catch (e) {
      this._fileBroken[key] = true;
      return false;
    }
  },

  _run: function () {
    if (this._timer) return;
    var self = this;
    this._timer = setInterval(function () {
      try { self._tick(); } catch (e) { /* 음악 때문에 게임이 멈추면 안 된다 */ }
    }, this.TICK);
  },

  _tick: function () {
    if (!this.cur || !this.enabled) return;
    if (!this._attach()) return;      // 아직 첫 입력 전 — 계속 기다린다
    //  파일 곡이 있는 key 는 파일이 담당한다 — 성공 시 스케줄러는 이번 틱을 쉰다.
    if (this._fileTick(this.cur)) return;
    var song = this.SONGS[this.cur];
    if (!song) return;
    this._prep(song);
    var ctx = this.ctx;
    var spb = 60 / song.bpm / 4;      // 16분음표 한 칸의 길이(초)

    // ⚠ **밀린 시각을 반드시 따라잡는다.** `_nextT` 가 과거면 while 이 폭주해
    //   한 틱에 수천 개를 예약한다(탭이 백그라운드로 갔다 오면 실제로 그렇게 된다).
    if (this._nextT < ctx.currentTime) this._nextT = ctx.currentTime + 0.05;

    var guard = 0;
    while (this._nextT < ctx.currentTime + this.LOOKAHEAD && guard++ < 64) {
      this._emit(song, this._step % song.len, this._nextT, spb);
      this._nextT += spb;
      this._step++;
    }
  },

  // 곡을 처음 틀 때 한 번 — `seq` 를 스텝→음 배열로 펴 둔다(매 스텝 선형탐색 방지).
  _prep: function (song) {
    if (song._ok) return;
    song.tracks.forEach(function (tr) {
      if (!tr.seq) return;
      tr._map = {};
      tr.seq.forEach(function (n) {
        (tr._map[n[0]] = tr._map[n[0]] || []).push(n);
      });
    });
    song._ok = true;
  },

  _emit: function (song, step, t, spb) {
    for (var i = 0; i < song.tracks.length; i++) {
      var tr = song.tracks[i];
      //  전투 중에는 중역 선율을 아예 안 예약한다 — 게인 0 이 아니라 **침묵**이다.
      if (this._battle && tr.battleMute) continue;
      var dest = this._dest(tr);

      if (tr._map) {                                   // 적어 둔 선율
        var ns = tr._map[step];
        if (ns) for (var k = 0; k < ns.length; k++) {
          this._voice(tr.v, t, this._hz(ns[k][1]), ns[k][2] * spb, tr.gain, dest);
        }
      }

      if (tr.every) {                                  // 되풀이되는 타악
        if ((step - (tr.offset || 0)) % tr.every === 0 && step >= (tr.offset || 0)) {
          if (tr.chance === undefined || Math.random() < tr.chance) {
            this._voice(tr.v, t, tr.hz || 0, (tr.dur || 4) * spb, tr.gain, dest);
          }
        }
      }

      if (tr.arp) {                                    // 화음을 걸어 올라가는 반주
        var a = tr.arp;
        if ((step - (a.offset || 0)) % a.every !== 0 || step < (a.offset || 0)) continue;
        var barLen = song.len / a.chords.length;
        var ch = a.chords[Math.floor(step / barLen) % a.chords.length];
        var idx = Math.floor((step - (a.offset || 0)) / a.every);
        var pos;
        if (a.dir === 'updown') {
          var span = ch.length * 2 - 2;
          var p = idx % span;
          pos = p < ch.length ? p : span - p;
        } else {
          pos = idx % ch.length;
        }
        this._voice(tr.v, t, this._hz(ch[pos] + (a.oct || 0) * 12), (a.dur || 2) * spb, tr.gain, dest);
      }
    }
  },

  // MIDI 번호 → 주파수. 69 = A4 = 440Hz.
  _hz: function (m) { return 440 * Math.pow(2, (m - 69) / 12); },

  // ── 악기 ──────────────────────────────────────────────────────────────────
  //  전부 `this.bus` 로 모인다(효과음 마스터를 거치지 않는다 — 음량이 독립이어야 한다).
  _noise: function (dur) {
    var n = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    var buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  },

  //  `dest` (2026-09-03): 악기가 나갈 노드. 안 주면 bus(스팅어·옛 호출부). 곡 트랙은
  //  `_emit` 이 레이어 게인을 넘긴다. 아래 모든 `connect(bus)` 는 이 변수를 본다 —
  //  필터 악기(pluck/horn/chant/pad/bass)가 bus 직결이던 것을 한 자리에서 통일했다.
  _voice: function (name, t, f, dur, gain, dest) {
    if (!this._ready) return;
    var ctx = this.ctx, bus = dest || this.bus;
    var g = gain === undefined ? 0.2 : gain;
    var self = this;

    // 짧은 도우미들 — 매번 같은 배선을 반복해 쓰기 위한 것이다.
    //  ⚠⚠ 게인은 만들자마자 `gain.value = 0.0001` 로 **초기값부터** 낮춘다 (2026-09-03
    //    실측 결함). 소스가 자동화 이벤트보다 한 표본 먼저 시작하는 시각이 있어(부동소수
    //    시각의 표본 반올림) 그 표본이 기본 게인 1.0 으로 새어 나갔다 — 초침(gain 0.04)이
    //    0.44 로 튀는 스파이크가 곡마다 몇 번씩 있었다. 오실레이터는 첫 표본이 0 이라
    //    안 보였고 노이즈 악기(tick·shaker·hide·kick 채·warDrum·thunder)만 걸렸다.
    //    `setValueAtTime` 만으로는 못 막는다 — 그 이벤트가 바로 "한 표본 늦는" 당사자다.
    function osc(type, freq, at, len, vol, dest) {
      var o = ctx.createOscillator(), e = ctx.createGain();
      e.gain.value = 0.0001;
      o.type = type; o.frequency.setValueAtTime(freq, at);
      e.gain.setValueAtTime(0.0001, at);
      o.connect(e); e.connect(dest || bus);
      o.start(at); o.stop(at + len + 0.05);
      return { o: o, e: e };
    }
    function noiseSrc(at, len, filt, freq, q, dest) {
      var s = ctx.createBufferSource(); s.buffer = self._noise(len);
      var bp = ctx.createBiquadFilter(); bp.type = filt; bp.frequency.value = freq;
      if (q) bp.Q.value = q;
      var e = ctx.createGain(); e.gain.value = 0.0001; e.gain.setValueAtTime(0.0001, at);
      s.connect(bp); bp.connect(e); e.connect(dest || bus);
      s.start(at); s.stop(at + len + 0.02);
      return { s: s, e: e, f: bp };
    }
    // 감쇠형 포락선 — 지수 감쇠라야 자연스럽다(선형은 '뚝' 끊기게 들린다).
    function pluckEnv(e, at, peak, len, atk) {
      e.gain.setValueAtTime(0.0001, at);
      e.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + (atk || 0.005));
      e.gain.exponentialRampToValueAtTime(0.0001, at + len);
    }
    // 지속형 포락선 — 불었다가 멎는 소리(피리·뿔·구호)
    function holdEnv(e, at, peak, len, atk, rel) {
      var a = atk || 0.05, r = rel || 0.12;
      var body = Math.max(0.02, len - a - r);
      e.gain.setValueAtTime(0.0001, at);
      e.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + a);
      e.gain.setValueAtTime(Math.max(0.0002, peak), at + a + body);
      e.gain.exponentialRampToValueAtTime(0.0001, at + a + body + r);
    }

    switch (name) {

      // 뜯는 현(마른 힘줄) — 로비의 반주, 대전 대기실의 스타카토
      case 'pluck': {
        var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
        lp.connect(bus);
        var a1 = osc('triangle', f, t, dur, g, lp);
        pluckEnv(a1.e, t, g, Math.min(dur, 0.5), 0.004);
        var a2 = osc('sine', f * 2, t, dur, g * 0.35, lp);   // 배음 — 뜯는 맛
        pluckEnv(a2.e, t, g * 0.30, Math.min(dur, 0.16), 0.003);
        break;
      }

      // 뼈 피리 — 주선율. 비브라토와 숨소리가 있어야 '피리'로 들린다.
      case 'flute': {
        var fo = osc('sine', f, t, dur, g);
        holdEnv(fo.e, t, g, dur, 0.07, 0.16);
        var lfo = ctx.createOscillator(), lg = ctx.createGain();
        lfo.frequency.value = 5.1; lg.gain.value = f * 0.007;   // 아주 얕게 — 깊으면 취한 소리가 난다
        lfo.connect(lg); lg.connect(fo.o.frequency);
        lfo.start(t); lfo.stop(t + dur + 0.05);
        var br = noiseSrc(t, dur, 'bandpass', f * 2.1, 1.4);    // 숨
        holdEnv(br.e, t, g * 0.09, dur, 0.09, 0.2);
        break;
      }

      // 뿔피리 — 출정 신호. 톱니를 저역통과로 눌러 '나팔'의 두께를 만든다.
      case 'horn': {
        var hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.Q.value = 0.9;
        hf.frequency.setValueAtTime(700, t);
        hf.frequency.linearRampToValueAtTime(2300, t + 0.10);   // 부는 순간 열린다
        hf.connect(bus);
        var h1 = osc('sawtooth', f, t, dur, g, hf);
        holdEnv(h1.e, t, g, dur, 0.035, 0.12);
        var h2 = osc('sawtooth', f * 1.004, t, dur, g, hf);     // 살짝 어긋난 겹침 = 두께
        holdEnv(h2.e, t, g * 0.6, dur, 0.045, 0.12);
        break;
      }

      // 부족의 구호 — 사람 목소리 흉내. 두 개의 포먼트 대역이 '아' 모음을 만든다.
      case 'chant': {
        var vf = ctx.createBiquadFilter(); vf.type = 'bandpass';
        vf.frequency.value = 720; vf.Q.value = 3.2; vf.connect(bus);
        var vf2 = ctx.createBiquadFilter(); vf2.type = 'bandpass';
        vf2.frequency.value = 1180; vf2.Q.value = 4.0; vf2.connect(bus);
        var c1 = osc('sawtooth', f, t, dur, g, vf);
        holdEnv(c1.e, t, g, dur, 0.05, 0.18);
        var c2 = osc('sawtooth', f, t, dur, g, vf2);
        holdEnv(c2.e, t, g * 0.5, dur, 0.06, 0.18);
        break;
      }

      // 두꺼운 지속음(웅장함의 뼈대) — 살짝 어긋난 톱니 셋을 저역통과로 뭉갠다.
      case 'pad': {
        var pf = ctx.createBiquadFilter(); pf.type = 'lowpass';
        pf.frequency.value = 850; pf.Q.value = 0.6; pf.connect(bus);
        [-0.006, 0, 0.006].forEach(function (dt) {
          var p = osc('sawtooth', f * (1 + dt), t, dur, g, pf);
          holdEnv(p.e, t, g * 0.42, dur, 0.55, 0.7);
        });
        break;
      }

      // 저음 — 사인 + 삼각으로 바닥을 깐다. 너무 밝으면 타격음과 다툰다.
      case 'bass': {
        var bf = ctx.createBiquadFilter(); bf.type = 'lowpass'; bf.frequency.value = 420;
        bf.connect(bus);
        var b1 = osc('triangle', f, t, dur, g, bf);
        holdEnv(b1.e, t, g, dur, 0.012, 0.10);
        var b2 = osc('sine', f / 2, t, dur, g, bf);
        holdEnv(b2.e, t, g * 0.5, dur, 0.015, 0.10);
        break;
      }

      // 흙 종 — 배음이 정수배가 아니라야(2.76) '금속/도자기'로 들린다.
      case 'bell': {
        var bl1 = osc('sine', f, t, 1.4, g);
        pluckEnv(bl1.e, t, g, 1.4, 0.006);
        var bl2 = osc('sine', f * 2.76, t, 0.9, g);
        pluckEnv(bl2.e, t, g * 0.32, 0.9, 0.004);
        break;
      }

      // 통나무 북 — 낮고 둥근 '둥'. 음높이가 떨어져야 북이 된다.
      case 'kick': {
        var ko = ctx.createOscillator(), ke = ctx.createGain();
        ke.gain.value = 0.0001;
        ko.type = 'sine';
        ko.frequency.setValueAtTime(f || 150, t);
        ko.frequency.exponentialRampToValueAtTime(46, t + 0.22);
        pluckEnv(ke, t, g, 0.30, 0.004);
        ko.connect(ke); ke.connect(bus);
        ko.start(t); ko.stop(t + 0.34);
        var kc = noiseSrc(t, 0.02, 'highpass', 2200);          // 채가 닿는 소리
        pluckEnv(kc.e, t, g * 0.22, 0.02, 0.001);
        break;
      }

      // 큰 북(통곡의 탑) — 더 낮고 더 길게. '웅장'은 저역의 길이에서 나온다.
      case 'warDrum': {
        var wo = ctx.createOscillator(), we = ctx.createGain();
        we.gain.value = 0.0001;
        wo.type = 'sine';
        wo.frequency.setValueAtTime(f || 108, t);
        wo.frequency.exponentialRampToValueAtTime(34, t + 0.42);
        pluckEnv(we, t, g, 0.62, 0.006);
        wo.connect(we); we.connect(bus);
        wo.start(t); wo.stop(t + 0.7);
        var wn = noiseSrc(t, 0.12, 'lowpass', 320);
        pluckEnv(wn.e, t, g * 0.30, 0.12, 0.002);
        break;
      }

      // 가죽 북 — 행진의 뒷박
      case 'hide': {
        var hn = noiseSrc(t, 0.16, 'bandpass', 1850, 0.8);
        pluckEnv(hn.e, t, g, 0.16, 0.002);
        var ht = osc('triangle', 240, t, 0.09, g);
        pluckEnv(ht.e, t, g * 0.35, 0.09, 0.002);
        break;
      }

      // 씨앗 흔들이 — 박을 잘게 쪼갠다
      case 'shaker': {
        var sn = noiseSrc(t, 0.055, 'highpass', 6200);
        pluckEnv(sn.e, t, g, 0.055, 0.003);
        break;
      }

      // 시계 초침(대전 대기실) — 아주 짧고 아주 작게. 이게 긴장의 정체다.
      case 'tick': {
        var tn = noiseSrc(t, 0.014, 'highpass', 9000);
        pluckEnv(tn.e, t, g, 0.014, 0.001);
        break;
      }

      // 천둥(통곡의 탑) — 부풀었다 굴러가는 저역. 12세 이용가라 '쾅'이 아니라 '우르릉'이다.
      case 'thunder': {
        var th = noiseSrc(t, 2.4, 'lowpass', 400, 0.7);
        th.f.frequency.setValueAtTime(520, t);
        th.f.frequency.exponentialRampToValueAtTime(90, t + 2.2);
        th.e.gain.setValueAtTime(0.0001, t);
        th.e.gain.exponentialRampToValueAtTime(Math.max(0.0002, g), t + 0.45);  // 부풀고
        th.e.gain.exponentialRampToValueAtTime(0.0001, t + 2.3);                // 굴러간다
        var ts = osc('sine', 44, t, 2.0, g);
        pluckEnv(ts.e, t, g * 0.5, 2.0, 0.5);
        break;
      }

      // ── 시즌2 세계 악기 (2026-09-03) ──────────────────────────────────────
      // 안개 바람(안개늪) — 대역이 천천히 오르내리는 긴 노이즈. 피치가 없다(f 무시).
      // 선율이 아니라 **공기**다. 늪의 습기는 저역보다 중고역의 숨에서 난다.
      case 'wind': {
        var wf = noiseSrc(t, dur, 'bandpass', 900, 0.9);
        wf.f.frequency.setValueAtTime(700, t);
        wf.f.frequency.exponentialRampToValueAtTime(1500, t + dur * 0.55);
        wf.f.frequency.exponentialRampToValueAtTime(600, t + dur);
        holdEnv(wf.e, t, g, dur, Math.min(0.6, dur * 0.35), Math.min(0.8, dur * 0.35));
        break;
      }

      // 얼음 종(균열) — 흙 종(bell)보다 배음이 더 어긋나고(2.31·3.87) 더 짧다.
      // 정수배가 아니라야 '깨지는 유리·얼음'으로 들린다. 12세 톤: 날카롭되 시끄럽지 않게.
      case 'ice': {
        var i1 = osc('sine', f, t, 0.9, g);
        pluckEnv(i1.e, t, g, 0.9, 0.003);
        var i2 = osc('sine', f * 2.31, t, 0.5, g);
        pluckEnv(i2.e, t, g * 0.36, 0.5, 0.002);
        var i3 = osc('sine', f * 3.87, t, 0.28, g);
        pluckEnv(i3.e, t, g * 0.18, 0.28, 0.002);
        var ic = noiseSrc(t, 0.012, 'highpass', 7000);       // 부딪는 순간의 서리
        pluckEnv(ic.e, t, g * 0.25, 0.012, 0.001);
        break;
      }

      // 우르릉(균열의 저역) — 천둥보다 낮고 짧고 규칙적. 땅이 떨리는 소리라 '치는'
      // 순간이 없다(어택 0.25). 폰에서는 거의 안 들리고 헤드폰·진동 몫이다.
      case 'rumble': {
        var rn = noiseSrc(t, dur, 'lowpass', 140, 0.8);
        holdEnv(rn.e, t, g, dur, 0.25, Math.min(0.6, dur * 0.4));
        var rs = osc('sine', f || 38, t, dur, g);
        holdEnv(rs.e, t, g * 0.6, dur, 0.25, Math.min(0.6, dur * 0.4));
        break;
      }

      // 미끄러지는 음(패배 스팅어) — f 에서 한 옥타브 아래로 dur 동안 흘러내린다.
      case 'slide': {
        var so = ctx.createOscillator(), se = ctx.createGain();
        se.gain.value = 0.0001;
        so.type = 'sine';
        so.frequency.setValueAtTime(f, t);
        so.frequency.exponentialRampToValueAtTime(Math.max(20, f / 2), t + dur);
        se.gain.setValueAtTime(0.0001, t);
        se.gain.exponentialRampToValueAtTime(Math.max(0.0002, g), t + 0.08);
        se.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
        so.connect(se); se.connect(bus);
        so.start(t); so.stop(t + dur + 0.15);
        break;
      }
    }
  },

  // ==========================================================================
  //  곡 — 스텝은 **16분음표** 한 칸이다. `len` 이 한 바퀴의 칸 수다.
  //  seq 항목: [시작칸, MIDI음, 길이(칸)]
  // ==========================================================================
  //  ── 트랙 음량은 **실측 peak 비율**로 잡았다 (2026-08-01) ─────────────────
  //  귀로 맞추면 재현이 안 되고, 헤드폰/스피커마다 결론이 달라진다. 대신
  //  `node tools/music-audit.js` 가 트랙을 하나씩 솔로로 렌더해 peak 을 뱉으므로
  //  **그 비율**로 맞춘다. 특히 필터를 많이 먹는 악기가 함정이다 —
  //  같은 gain 0.4 에서 뿔피리는 peak 0.599 인데 구호는 0.223 이다(2.7배 차).
  //  구호를 0.085 로 뒀을 때 peak 0.045 vs 뿔피리 0.199 였다: 부르고 답하기로
  //  설계해 놓고 **답이 안 들리는** 상태였다. 숫자를 바꾸면 그 도구를 다시 돌릴 것.
  SONGS: {

    // ── 1. 인트로~로비 — "알을 깨고 나서는 아침" ────────────────────────────
    //  지시: "밝으면서도 앞 내용이 기대되게."
    //  밝음은 **장5음계**(도레미솔라)가 맡는다 — 반음이 없어 어두워질 수가 없다.
    //  기대감은 **화성 진행**이 맡는다: C→G→Am→F 는 마지막 F 에서 으뜸음으로
    //  돌아가지 않고 붕 떠서 다시 처음으로 굴러간다. '아직 안 끝났다'는 느낌이
    //  거기서 나온다. 선율도 매 마디 한 음씩 높은 곳을 찍고 내려온다.
    //  ⚠ 2026-08-01 — 한 바퀴를 **64칸(9.2초) → 128칸(18.5초)** 으로 늘렸다.
    //    이 곡은 인트로·로비·랭킹에서 다 쓰여 **가장 오래 듣는 곡**인데, 9초짜리
    //    같은 마디가 계속 돌아 금방 질렸다. 뒤 네 마디(B단)를 새로 붙였다 —
    //    같은 조성 안에서 화성을 Am–F–C–G 로 뒤집고 선율을 한 옥타브 위로 올린다.
    //    "다른 곡"이 아니라 "같은 곡의 다음 문장"이라야 로비의 분위기가 안 깨진다.
    //  ⚠ B단을 붙이자 소리가 겹쳐 최고치가 **1.112 로 한계를 넘었다**(감사가 잡았다).
    //    소리가 찌그러지면 '풍성해진' 게 아니라 그냥 망가진 것이다 — 전 트랙을
    //    한 단계씩 낮췄다. 트랙을 더할 때는 **반드시 곡 전체 최고치를 다시 잴 것.**
    lobby: {
      bpm: 104, len: 128,
      tracks: [
        { v: 'flute', gain: 0.145, seq: [
          // A단 — 차분하게 오르내린다
          [0, 72, 3], [3, 76, 3], [6, 79, 4], [10, 81, 6],
          [16, 79, 3], [19, 76, 3], [22, 74, 6], [28, 72, 4],
          [32, 76, 3], [35, 79, 3], [38, 81, 4], [42, 84, 6],
          [48, 81, 3], [51, 79, 3], [54, 76, 6], [60, 72, 4],
          // B단 — 한 옥타브 위에서 더 넓게. 여기서 '기대감'이 한 번 더 올라간다.
          [64, 81, 3], [67, 84, 3], [70, 86, 4], [74, 84, 6],
          [80, 81, 4], [84, 79, 4], [88, 76, 8],
          [96, 79, 3], [99, 84, 3], [102, 86, 4], [106, 88, 6],
          [112, 86, 4], [116, 84, 4], [120, 79, 8]
        ] },
        { v: 'pluck', gain: 0.082, arp: {
          chords: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60],
                   [57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]],
          every: 2, dir: 'updown', dur: 2
        } },
        { v: 'bass', gain: 0.135, seq: [
          [0, 36, 6], [8, 43, 4],
          [16, 31, 6], [24, 38, 4],
          [32, 33, 6], [40, 40, 4],
          [48, 29, 6], [56, 36, 4],
          [64, 33, 6], [72, 40, 4],
          [80, 29, 6], [88, 36, 4],
          [96, 36, 6], [104, 43, 4],
          [112, 31, 6], [120, 38, 4]
        ] },
        // B단에만 흙 종을 하나씩 얹어 "여기가 뒷문장"이라는 표시를 준다.
        { v: 'bell', gain: 0.045, seq: [[64, 88, 8], [96, 91, 8]] },
        { v: 'kick',   gain: 0.175, every: 8, offset: 0, hz: 140 },
        { v: 'shaker', gain: 0.045, every: 2, offset: 1 }
      ]
    },

    // ── 2. 통곡의 탑 — "번개 아래의 탑" ────────────────────────────────────
    //  지시: "웅장함, 번개 치는 배경과 어울림."
    //  웅장함은 크기가 아니라 **느림과 저역의 길이**에서 나온다(BPM 72, 큰 북 0.6초).
    //  자연단조(D단조)에 A장3화음을 섞어(화성단조의 V) 마지막에 긴장을 건다 —
    //  '슬프기만 한' 것과 '올라가야만 하는' 것의 차이가 그 한 화음이다.
    //  천둥은 8마디에 한 번, 그것도 **확률적으로** 친다. 규칙적으로 치면 악기가 되고,
    //  악기가 되면 배경이 아니게 된다.
    tower: {
      bpm: 72, len: 64,
      tracks: [
        { v: 'pad', gain: 0.13, seq: [
          [0, 50, 16], [0, 57, 16],
          [16, 46, 16], [16, 53, 16],
          [32, 53, 16], [32, 60, 16],
          [48, 45, 16], [48, 61, 16]        // A장3화음 — 여기서 조여든다
        ] },
        { v: 'flute', gain: 0.15, seq: [
          [0, 74, 6], [8, 77, 8],
          [16, 76, 6], [24, 74, 8],
          [32, 81, 6], [40, 79, 4], [44, 77, 4],
          [48, 76, 8], [56, 74, 8]
        ] },
        { v: 'bass', gain: 0.19, seq: [
          [0, 38, 12], [16, 34, 12], [32, 41, 12], [48, 33, 12]
        ] },
        { v: 'warDrum', gain: 0.30, every: 16, offset: 0, hz: 108 },
        { v: 'warDrum', gain: 0.17, every: 16, offset: 12, hz: 96 },
        { v: 'thunder', gain: 0.09, every: 64, offset: 30, chance: 0.55 }
      ]
    },

    // ── 3. 수성의 탑 — "출정하는 이들에게" ────────────────────────────────
    //  지시: "전투에 나가는 군사를 응원하는 듯한 느낌."
    //  응원은 **규칙적인 걸음**(네 박 모두 북)과 **부르고 답하기**로 만든다.
    //  뿔피리가 한 마디 부르면 다음 마디에서 구호가 받는다 — 혼자 부는 것과
    //  여럿이 배웅하는 것의 차이가 그 주고받음이다.
    //  G장조 I-IV-V-I. 가장 흔한 진행인데, 흔해서 곧바로 '행진'으로 읽힌다.
    defend: {
      bpm: 118, len: 64,
      tracks: [
        { v: 'horn', gain: 0.115, seq: [
          [0, 67, 4], [4, 71, 4], [8, 74, 6],
          [16, 72, 4], [20, 76, 4], [24, 79, 7],
          [32, 81, 4], [36, 78, 4], [40, 74, 7],
          [48, 79, 4], [52, 74, 4], [56, 67, 7]
        ] },
        // 구호는 뿔피리가 쉬는 칸(마디 끝)에서 받는다 — 겹치면 둘 다 안 들린다.
        { v: 'chant', gain: 0.22, seq: [
          [12, 55, 3], [28, 60, 3], [44, 62, 3], [60, 55, 3]
        ] },
        { v: 'bass', gain: 0.17, seq: [
          [0, 43, 4], [8, 43, 4], [16, 48, 4], [24, 48, 4],
          [32, 50, 4], [40, 50, 4], [48, 43, 4], [56, 43, 4]
        ] },
        { v: 'kick',   gain: 0.20, every: 4, offset: 0, hz: 150 },
        { v: 'hide',   gain: 0.18, every: 8, offset: 4 },
        { v: 'shaker', gain: 0.05, every: 2, offset: 2 }
      ]
    },

    // ── 4. 대전 대기실 — "누가 앉아 있는가" ────────────────────────────────
    //  지시: "더 지니어스 메인 음악 같은 느낌."
    //  그 계열의 정체는 화려한 선율이 아니라 **멈추지 않는 맥박 + 최소한의 음**이다.
    //  ① 초침이 8분음표마다 아주 작게 간다(시간이 흐른다)
    //  ② 저음이 박마다 한 번씩 뛴다(심장)
    //  ③ 스타카토 화음이 위아래로 오르내린다 — A단조에 G#(화성단조의 이끔음)을 넣어
    //     **해결되지 않은 채** 계속 돈다. 이게 "아직 아무도 안 졌다"는 소리다.
    //  북은 일부러 없다. 북이 들어오면 '전투'가 되고, 여긴 전투 전이다.
    versus: {
      bpm: 96, len: 64,
      tracks: [
        { v: 'pluck', gain: 0.10, arp: {
          chords: [[57, 60, 64], [57, 60, 64], [53, 57, 60], [52, 56, 59]],
          every: 2, dir: 'updown', dur: 2
        } },
        { v: 'bass', gain: 0.185, seq: [
          [0, 33, 3], [4, 33, 3], [8, 33, 3], [12, 33, 3],
          [16, 33, 3], [20, 33, 3], [24, 33, 3], [28, 33, 3],
          [32, 29, 3], [36, 29, 3], [40, 29, 3], [44, 29, 3],
          [48, 28, 3], [52, 28, 3], [56, 28, 3], [60, 28, 3]
        ] },
        // 흙 종 — 마디에 한 번, 그것도 높은 곳에서. 아무도 말하지 않는 순간을 만든다.
        { v: 'bell', gain: 0.055, seq: [
          [0, 88, 8], [24, 84, 8], [32, 89, 8], [56, 87, 8]
        ] },
        { v: 'tick', gain: 0.055, every: 2, offset: 0 }
      ]
    },

    // ══ 시즌2 「다섯 세계」 전투 곡 (2026-09-03 S-S) ══════════════════════════
    //  전부 **합성**이다(FILES 에 없다). 전투 중에 깔리는 곡이라 규칙이 셋이다:
    //   ① 트랙마다 `layer` — base(몸통) / tense(긴장 겹: 저역 bass 맥박 + 고역 tick 만).
    //      tense 는 0 에서 시작해 battle.js 가 영웅 체력·보스 페이즈로 올린다.
    //   ② 중역 선율(피리·뿔·종·구호·아르페지오)은 `battleMute: true` — 전투 모드에서는
    //      **예약 자체를 안 한다.** 타격음(420·1600·2600Hz)과 같은 대역에서 다투기 때문.
    //      허브·로딩에서 세계 곡을 틀면(전투 모드 아님) 선율이 산다.
    //   ③ 음량은 `node tools/music-audit.js` 의 solo peak 로 잡는다(위 규율 그대로).
    //      레이어 최대치(base 1 · tense 1)에서도 곡 전체 peak < 1 이어야 한다.

    // ── 5. 초원 (1~30층) — "번개 아래의 탑"의 변주. 같은 D단조·같은 뼈대인데
    //  천둥이 없고 선율이 한 걸음 밝다(도리안 B — 첫 세계는 아직 두렵지 않다).
    w_meadow: {
      bpm: 72, len: 64,
      tracks: [
        { v: 'pad', gain: 0.12, layer: 'base', seq: [
          [0, 50, 16], [0, 57, 16], [16, 46, 16], [16, 53, 16],
          [32, 53, 16], [32, 60, 16], [48, 45, 16], [48, 61, 16]
        ] },
        { v: 'flute', gain: 0.14, layer: 'base', battleMute: true, seq: [
          [0, 74, 6], [8, 79, 8], [16, 77, 6], [24, 76, 8],
          [32, 81, 6], [40, 83, 4], [44, 81, 4], [48, 79, 8], [56, 74, 8]
        ] },
        { v: 'bass', gain: 0.18, layer: 'base', seq: [
          [0, 38, 12], [16, 34, 12], [32, 41, 12], [48, 33, 12]
        ] },
        { v: 'warDrum', gain: 0.26, layer: 'base', every: 16, offset: 0, hz: 108 },
        { v: 'hide',    gain: 0.12, layer: 'base', every: 16, offset: 8 },
        { v: 'shaker',  gain: 0.035, layer: 'base', every: 4, offset: 2 },
        // 긴장 겹 — D2 맥박 + 초침
        { v: 'bass', gain: 0.16, layer: 'tense', every: 4, offset: 0, hz: 73.4, dur: 2 },
        { v: 'tick', gain: 0.05, layer: 'tense', every: 2, offset: 1 }
      ]
    },

    // ── 6. 안개늪 (31~60층) — 온음계(C D E F# G# A#). 반음이 없어 조성이 안 잡히고,
    //  증3화음이 계속 떠 있어 "어디가 땅인지 모르겠다"가 된다 = 안개. 종과 바람뿐.
    w_mist: {
      bpm: 66, len: 64,
      tracks: [
        { v: 'pad', gain: 0.11, layer: 'base', seq: [
          [0, 48, 32], [0, 52, 32], [0, 56, 32],
          [32, 50, 32], [32, 54, 32], [32, 58, 32]
        ] },
        { v: 'bell', gain: 0.07, layer: 'base', battleMute: true, seq: [
          [0, 84, 8], [10, 88, 8], [20, 86, 8], [32, 90, 8], [42, 82, 8], [52, 86, 8]
        ] },
        { v: 'wind', gain: 0.05, layer: 'base', every: 16, offset: 0, dur: 18 },
        { v: 'bass', gain: 0.15, layer: 'base', seq: [[0, 36, 24], [32, 38, 24]] },
        { v: 'shaker', gain: 0.025, layer: 'base', every: 8, offset: 6 },
        { v: 'bass', gain: 0.15, layer: 'tense', every: 4, offset: 0, hz: 65.4, dur: 2 },
        { v: 'tick', gain: 0.05, layer: 'tense', every: 2, offset: 0 }
      ]
    },

    // ── 7. 잿더미 (61~100층) — E프리지안(E F G A B C D). 2음이 반음(F)이라 어둡고
    //  뜨겁다. 큰 북이 두 배 잦고 뿔피리(톱니)가 낮게 운다. 저역 우르릉 = 용암.
    w_ash: {
      bpm: 84, len: 64,
      tracks: [
        { v: 'pad', gain: 0.12, layer: 'base', seq: [
          [0, 40, 16], [0, 47, 16], [16, 41, 16], [16, 48, 16],
          [32, 43, 16], [32, 50, 16], [48, 40, 16], [48, 46, 16]
        ] },
        { v: 'horn', gain: 0.10, layer: 'base', battleMute: true, seq: [
          [0, 64, 4], [4, 65, 4], [8, 67, 6], [16, 64, 6],
          [24, 71, 4], [28, 72, 4], [32, 71, 6], [40, 69, 4], [44, 67, 4],
          [48, 65, 6], [56, 64, 7]
        ] },
        { v: 'bass', gain: 0.18, layer: 'base', seq: [
          [0, 28, 12], [16, 29, 12], [32, 31, 12], [48, 28, 12]
        ] },
        { v: 'warDrum', gain: 0.28, layer: 'base', every: 8, offset: 0, hz: 100 },
        { v: 'warDrum', gain: 0.16, layer: 'base', every: 16, offset: 6, hz: 88 },
        { v: 'hide',    gain: 0.13, layer: 'base', every: 8, offset: 4 },
        { v: 'rumble',  gain: 0.06, layer: 'base', every: 32, offset: 20, hz: 40, dur: 10, chance: 0.6 },
        { v: 'bass', gain: 0.14, layer: 'tense', every: 2, offset: 0, hz: 41.2, dur: 1 },
        { v: 'tick', gain: 0.04, layer: 'tense', every: 1, offset: 0 }
      ]
    },

    // ── 8. 균열 (101~150층) — F리디안(F G A B C D E). 4음이 올라간(B) 밝은 이질감 =
    //  땅이 갈라진 자리의 낯섦. 얼음 종(비정수 배음)과 초침, 아래에서 우르릉.
    w_rift: {
      bpm: 78, len: 64,
      tracks: [
        { v: 'ice', gain: 0.09, layer: 'base', battleMute: true, seq: [
          [0, 77, 6], [8, 81, 6], [16, 83, 6], [24, 79, 6],
          [32, 84, 6], [40, 83, 4], [44, 81, 4], [48, 79, 6], [56, 77, 8]
        ] },
        { v: 'pluck', gain: 0.07, layer: 'base', battleMute: true, arp: {
          chords: [[65, 69, 72], [67, 71, 74], [65, 69, 72, 76], [71, 74, 77]],
          every: 2, dir: 'updown', dur: 2
        } },
        { v: 'bass', gain: 0.16, layer: 'base', seq: [
          [0, 41, 12], [16, 43, 12], [32, 41, 12], [48, 47, 12]
        ] },
        { v: 'tick',   gain: 0.05, layer: 'base', every: 2, offset: 0 },
        { v: 'rumble', gain: 0.08, layer: 'base', every: 32, offset: 16, hz: 38, dur: 12, chance: 0.7 },
        { v: 'bass', gain: 0.15, layer: 'tense', every: 4, offset: 2, hz: 43.65, dur: 2 },
        { v: 'tick', gain: 0.05, layer: 'tense', every: 1, offset: 0 }
      ]
    },

    // ── 9. 폭풍 하늘 (151층+) — A화성단조(G# 이끔음). 뿔피리가 부르고 구호가 받는
    //  수성의 탑 구조에 통곡의 탑의 큰 북과 천둥을 얹었다 — 다섯 세계의 합.
    w_storm: {
      bpm: 76, len: 64,
      tracks: [
        { v: 'pad', gain: 0.12, layer: 'base', seq: [
          [0, 45, 16], [0, 52, 16], [16, 41, 16], [16, 48, 16],
          [32, 38, 16], [32, 45, 16], [48, 40, 16], [48, 56, 16]      // E장3화음 — 조여든다
        ] },
        { v: 'horn', gain: 0.11, layer: 'base', battleMute: true, seq: [
          [0, 69, 4], [4, 72, 4], [8, 76, 6], [16, 74, 4], [20, 72, 4], [24, 68, 7],
          [32, 69, 4], [36, 76, 4], [40, 77, 6], [48, 76, 4], [52, 72, 4], [56, 68, 7]
        ] },
        { v: 'chant', gain: 0.20, layer: 'base', battleMute: true, seq: [
          [12, 57, 3], [28, 52, 3], [44, 57, 3], [60, 52, 3]
        ] },
        { v: 'bass', gain: 0.18, layer: 'base', seq: [
          [0, 33, 12], [16, 29, 12], [32, 26, 12], [48, 28, 12]
        ] },
        { v: 'warDrum', gain: 0.30, layer: 'base', every: 16, offset: 0, hz: 108 },
        { v: 'warDrum', gain: 0.17, layer: 'base', every: 16, offset: 12, hz: 96 },
        { v: 'hide',    gain: 0.12, layer: 'base', every: 8, offset: 4 },
        { v: 'thunder', gain: 0.09, layer: 'base', every: 64, offset: 30, chance: 0.6 },
        { v: 'bass', gain: 0.14, layer: 'tense', every: 2, offset: 0, hz: 55, dur: 1 },
        { v: 'tick', gain: 0.05, layer: 'tense', every: 1, offset: 0 }
      ]
    }
  },

  // ── 승리 / 패배 스팅어 ────────────────────────────────────────────────────
  //  ⚠ 이건 `SONGS` 가 아니다. 되풀이되지 않고 **한 번 울리고 끝난다.**
  //  스케줄러를 안 거치고 그 자리에서 예약한다 — 결과 화면은 곡이 아니라 문장이다.
  //
  //  왜 `Sound.play('win')` 을 안 쓰는가: 저건 삼각파 3음짜리 0.4초로, 층을 깬
  //  순간에 비해 너무 가볍다("효과음이 필요하다"는 신고가 그 뜻이었다).
  //  여기서는 뿔피리 팡파르 + 북 + 종으로 **끝났다는 감각**을 만든다.
  //  ── 파일 스팅어 (2026-08-23) — 음악 bus 를 **거치지 않는다.** 스팅 동안 bus 를
  //  0.25 로 눕히는데, 같은 bus 를 타면 스팅어까지 같이 조용해진다. 전용 게인으로
  //  destination 직결하되 음량 설정(volume)은 존중한다.
  _stingFile: function (kind) {
    if (!this.STING_FILES[kind] || this._stBroken[kind]) return false;
    var self = this;
    try {
      if (!this._stEl) {
        this._stEl = new Audio();
        this._stEl.addEventListener('error', function () {
          if (self._stCur) self._stBroken[self._stCur] = true;
          self._stCur = null;
        });
        var node = this.ctx.createMediaElementSource(this._stEl);
        this._stGain = this.ctx.createGain();
        node.connect(this._stGain);
        this._stGain.connect(this.ctx.destination);
      }
      this._stGain.gain.setValueAtTime(Math.min(1, this.volume * 1.8), this.ctx.currentTime);
      this._stCur = kind;
      this._stEl.src = this._fileUrl(this.STING_FILES[kind]);
      var p = this._stEl.play();
      if (p && p.catch) p.catch(function () {});
      return true;
    } catch (e) { this._stBroken[kind] = true; return false; }
  },

  // ── 스팅어 표 (2026-09-03 시즌2 — 하드코딩 두 개를 표로 일반화) ─────────────
  //  항목: { v: 악기, at: 시작(초), m: MIDI | hz: 주파수(타악), d: 길이, g: 게인 }
  //  · `file`   — STING_FILES 의 키. 파일이 살아 있으면 그쪽이 운다.
  //  · `overlay`— true 면 파일 위에 합성 score 도 **겹쳐** 낸다(0.7배). 파일 스팅어는
  //               본곡 컷팅본이라 "협동 승리"처럼 파일과 다른 말을 얹을 때 쓴다.
  //  · `variants` — sting(kind, {world}) 로 고르는 세계별 변주(없는 세계는 meadow).
  //  ⚠ 전부 3초 안에 끝난다(bossAppear 만 2.6 — 인트로 HOLD 와 같은 길이).
  //  ⚠ 악기 이름 오타는 조용히 사라진다 → tools/music-audit.js 가 표 전부를 렌더한다.
  STINGS: {
    win: { file: 'win', score: [
      // G장3화음 위로 도-미-솔-도. 마지막 음을 길게 끌고 종을 얹는다.
      { v: 'horn', at: 0.00, m: 67, d: 0.16, g: 0.26 }, { v: 'horn', at: 0.13, m: 71, d: 0.16, g: 0.26 },
      { v: 'horn', at: 0.26, m: 74, d: 0.16, g: 0.26 }, { v: 'horn', at: 0.39, m: 79, d: 0.85, g: 0.26 },
      { v: 'kick', at: 0.00, hz: 150, d: 0.3, g: 0.30 }, { v: 'kick', at: 0.39, hz: 150, d: 0.3, g: 0.30 },
      { v: 'bell', at: 0.42, m: 91, d: 1.4, g: 0.10 },
      { v: 'shaker', at: 0.30, hz: 0, d: 0.06, g: 0.06 }, { v: 'shaker', at: 0.35, hz: 0, d: 0.06, g: 0.06 }
    ] },
    lose: { file: 'lose', score: [
      // 내려앉는 3음 + 낮은 북. 마지막은 **음이 미끄러진다**(김빠지는 소리) —
      // 계란이 주저앉는 이 게임의 그림과 같은 몸짓이다.
      { v: 'chant', at: 0.00, m: 62, d: 0.22, g: 0.20 }, { v: 'chant', at: 0.20, m: 58, d: 0.22, g: 0.20 },
      { v: 'chant', at: 0.40, m: 53, d: 0.90, g: 0.20 },
      { v: 'warDrum', at: 0.00, hz: 96, d: 0.6, g: 0.26 },
      { v: 'slide', at: 0.40, m: 53, d: 0.85, g: 0.14 }
    ] },
    //  세계 진입 — 로딩 화면(towerloading.js)이 세계 경계 층(31·61·101·151)에서 부른다.
    //  각 세계 곡의 음계·악기로 1.5초 안에 "여기는 다른 곳이다"를 말한다.
    worldEnter: { variants: {
      meadow: [
        { v: 'flute', at: 0.00, m: 74, d: 0.25, g: 0.16 }, { v: 'flute', at: 0.22, m: 77, d: 0.25, g: 0.16 },
        { v: 'flute', at: 0.44, m: 81, d: 0.60, g: 0.16 },
        { v: 'kick', at: 0.00, hz: 150, d: 0.3, g: 0.26 }, { v: 'bell', at: 0.50, m: 86, d: 1.2, g: 0.08 },
        { v: 'shaker', at: 0.22, hz: 0, d: 0.06, g: 0.05 }, { v: 'shaker', at: 0.44, hz: 0, d: 0.06, g: 0.05 }
      ],
      mist: [
        { v: 'bell', at: 0.00, m: 84, d: 1.0, g: 0.09 }, { v: 'bell', at: 0.30, m: 88, d: 1.0, g: 0.09 },
        { v: 'bell', at: 0.60, m: 86, d: 1.2, g: 0.09 },
        { v: 'wind', at: 0.00, hz: 0, d: 1.6, g: 0.07 }, { v: 'bass', at: 0.00, m: 36, d: 1.2, g: 0.14 }
      ],
      ash: [
        { v: 'warDrum', at: 0.00, hz: 100, d: 0.6, g: 0.30 }, { v: 'warDrum', at: 0.35, hz: 88, d: 0.6, g: 0.22 },
        { v: 'horn', at: 0.10, m: 64, d: 0.45, g: 0.12 }, { v: 'horn', at: 0.50, m: 65, d: 0.70, g: 0.12 },
        { v: 'rumble', at: 0.00, hz: 40, d: 1.4, g: 0.06 }
      ],
      rift: [
        { v: 'ice', at: 0.00, m: 89, d: 0.9, g: 0.09 }, { v: 'ice', at: 0.15, m: 93, d: 0.9, g: 0.09 },
        { v: 'ice', at: 0.30, m: 95, d: 0.9, g: 0.09 }, { v: 'ice', at: 0.50, m: 84, d: 1.2, g: 0.09 },
        { v: 'rumble', at: 0.00, hz: 38, d: 1.5, g: 0.08 },
        { v: 'tick', at: 0.00, hz: 0, d: 0.02, g: 0.05 }, { v: 'tick', at: 0.10, hz: 0, d: 0.02, g: 0.05 },
        { v: 'tick', at: 0.20, hz: 0, d: 0.02, g: 0.05 }, { v: 'tick', at: 0.30, hz: 0, d: 0.02, g: 0.05 }
      ],
      storm: [
        { v: 'horn', at: 0.00, m: 69, d: 0.30, g: 0.14 }, { v: 'horn', at: 0.28, m: 68, d: 0.30, g: 0.14 },
        { v: 'horn', at: 0.56, m: 69, d: 0.70, g: 0.14 }, { v: 'chant', at: 0.56, m: 57, d: 0.60, g: 0.18 },
        { v: 'warDrum', at: 0.00, hz: 108, d: 0.6, g: 0.30 }, { v: 'thunder', at: 0.10, hz: 0, d: 2.0, g: 0.09 }
      ]
    } },
    //  보스 등장 — 인트로(_setupBossIntro, 2.6초) 위에 깔린다. 낮은 뿔 두 개가 반음으로
    //  부딪히고(불협) 구호가 받는다. sound.js 의 `bossRoar`(포효)와 역할이 다르다 —
    //  포효는 짐승의 소리, 이건 **북과 뿔이 그 존재를 알리는** 소리다.
    bossAppear: { score: [
      { v: 'warDrum', at: 0.00, hz: 96, d: 0.7, g: 0.32 }, { v: 'warDrum', at: 0.50, hz: 84, d: 0.7, g: 0.28 },
      { v: 'horn', at: 0.05, m: 45, d: 1.0, g: 0.16 }, { v: 'horn', at: 0.05, m: 46, d: 1.0, g: 0.09 },
      { v: 'chant', at: 0.55, m: 45, d: 0.7, g: 0.16 },
      { v: 'thunder', at: 0.20, hz: 0, d: 2.2, g: 0.08 }
    ] },
    //  페이즈 전환 — 얼음 종이 위로 치솟고 큰 북이 받는다. 1.2초.
    phaseShift: { score: [
      { v: 'ice', at: 0.00, m: 88, d: 0.5, g: 0.10 }, { v: 'ice', at: 0.06, m: 91, d: 0.5, g: 0.10 },
      { v: 'ice', at: 0.12, m: 95, d: 0.5, g: 0.10 }, { v: 'ice', at: 0.18, m: 100, d: 0.7, g: 0.10 },
      { v: 'warDrum', at: 0.25, hz: 90, d: 0.7, g: 0.28 }, { v: 'rumble', at: 0.25, hz: 40, d: 0.9, g: 0.07 }
    ] },
    //  협동 승리 — 승리 파일 위에 **두 번째 뿔(3도 위)** 과 구호를 겹친다: 둘이 이겼다.
    coopWin: { file: 'win', overlay: true, score: [
      { v: 'horn', at: 0.00, m: 71, d: 0.16, g: 0.18 }, { v: 'horn', at: 0.13, m: 74, d: 0.16, g: 0.18 },
      { v: 'horn', at: 0.26, m: 78, d: 0.16, g: 0.18 }, { v: 'horn', at: 0.39, m: 83, d: 0.85, g: 0.18 },
      { v: 'chant', at: 0.50, m: 55, d: 0.8, g: 0.18 }, { v: 'chant', at: 0.50, m: 59, d: 0.8, g: 0.12 },
      { v: 'bell', at: 0.60, m: 95, d: 1.2, g: 0.08 }, { v: 'kick', at: 0.00, hz: 150, d: 0.3, g: 0.26 }
    ] }
  },
  //  스팅어 하나의 길이(초) — 음악을 되올릴 시각 계산용.
  _stingLen: function (score) {
    var end = 0;
    for (var i = 0; i < score.length; i++) end = Math.max(end, (score[i].at || 0) + (score[i].d || 0));
    return end;
  },
  //  kind 와 opts 로 실제 score 를 고른다(감사도 이 함수로 표 전부를 렌더한다).
  stingScore: function (kind, opts) {
    var def = this.STINGS[kind];
    if (!def) return null;
    var o = opts || {};
    var wk = this.worldKey(o.world);       // `mire` 등 별칭도 제 세계 변주를 탄다
    var score = def.variants ? (def.variants[wk] || def.variants.meadow) : def.score;
    if (!score) return null;
    score = score.slice();
    //  연승(streak ≥ 2) — 승리 계열에 종을 한 톨씩 더 얹는다(최대 3). 이긴 횟수가
    //  소리로 쌓이는 것이 킬스트릭(sound.js)과 같은 문법이다.
    if ((kind === 'win' || kind === 'coopWin') && o.streak >= 2) {
      var n = Math.min(3, o.streak - 1);
      for (var i = 0; i < n; i++) score.push({ v: 'bell', at: 0.62 + i * 0.13, m: 91 + i * 2, d: 1.0, g: 0.07 });
    }
    return score;
  },

  //  sting(kind, opts) — kind ∈ win|lose|worldEnter|bossAppear|phaseShift|coopWin,
  //  opts = { world, boss, streak } (전부 선택). 되풀이되지 않고 **한 번 울리고 끝난다.**
  //  스케줄러를 안 거치고 그 자리에서 예약한다 — 결과 화면은 곡이 아니라 문장이다.
  //  왜 `Sound.play('win')` 을 안 쓰는가: 저건 삼각파 3음짜리 0.4초로, 층을 깬
  //  순간에 비해 너무 가볍다. 여기서는 뿔피리 팡파르 + 북 + 종으로 **끝났다는 감각**을 만든다.
  sting: function (kind, opts) {
    if (!this._attach() || !this.enabled) return false;
    var def = this.STINGS[kind];
    if (!def) return false;
    var self = this, t = this.ctx.currentTime + 0.02;
    // 스팅어는 배경음악 위에 겹치므로 잠깐 음악을 눕힌다(안 그러면 둘 다 안 들린다).
    var back = this.cur;
    if (back) this._ramp(this.volume * 0.25, 0.15);

    //  파일 스팅어가 있으면 그쪽이 우선 — 끝나는 시각(~7초)에 음악을 되올린다.
    var fileOn = !!(def.file && this._stingFile(def.file));
    if (fileOn && back) setTimeout(function () {
      if (self.cur === back) self._ramp(self.enabled ? self.volume : 0, 0.8);
    }, 7200);
    if (fileOn && !def.overlay) return true;

    var score = this.stingScore(kind, opts) || [];
    var mul = fileOn ? 0.7 : 1;           // 파일 위에 겹칠 때는 한 단계 작게
    try {
      for (var i = 0; i < score.length; i++) {
        var n = score[i];
        var f = n.m !== undefined ? this._hz(n.m) : (n.hz || 0);
        this._voice(n.v, t + (n.at || 0), f, n.d, n.g * mul);
      }
    } catch (e) {}

    // 스팅어가 끝나면 음악을 원래 크기로 되돌린다(파일이 울리는 중이면 그쪽 타이머가 한다).
    if (back && !fileOn) setTimeout(function () {
      if (self.cur === back) self._ramp(self.enabled ? self.volume : 0, 0.6);
    }, Math.round((this._stingLen(score) + 0.4) * 1000));
    return true;
  }
};
