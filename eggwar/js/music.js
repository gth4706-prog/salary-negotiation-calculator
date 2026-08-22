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
  FILES: { tower: 'assets/bgm/tower.mp3' },
  _el: null,          // 재사용하는 오디오 엘리먼트(MediaElementSource 는 1회만 생성 가능)
  _elNode: null,
  _fileKey: null,     // 파일 모드로 울리는 중인 곡 key
  _fileBroken: {},    // key → true (로드 실패 — 합성 폴백 고정)

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

  // ── 곡 전환 ───────────────────────────────────────────────────────────────
  //  같은 곡을 다시 요청하면 **아무 일도 안 한다.** 씬을 오갈 때마다 곡이 처음으로
  //  되감기면 그게 더 거슬린다(상점 ↔ 층 화면을 오가는 흐름이 잦다).
  play: function (key, force) {
    if (!this.SONGS[key]) return;
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
      var want = this.FILES[key] + '?v=' + ((GAME.VERSION || '').replace('v', ''));
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

      if (tr._map) {                                   // 적어 둔 선율
        var ns = tr._map[step];
        if (ns) for (var k = 0; k < ns.length; k++) {
          this._voice(tr.v, t, this._hz(ns[k][1]), ns[k][2] * spb, tr.gain);
        }
      }

      if (tr.every) {                                  // 되풀이되는 타악
        if ((step - (tr.offset || 0)) % tr.every === 0 && step >= (tr.offset || 0)) {
          if (tr.chance === undefined || Math.random() < tr.chance) {
            this._voice(tr.v, t, tr.hz || 0, (tr.dur || 4) * spb, tr.gain);
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
        this._voice(tr.v, t, this._hz(ch[pos] + (a.oct || 0) * 12), (a.dur || 2) * spb, tr.gain);
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

  _voice: function (name, t, f, dur, gain) {
    if (!this._ready) return;
    var ctx = this.ctx, bus = this.bus;
    var g = gain === undefined ? 0.2 : gain;
    var self = this;

    // 짧은 도우미들 — 매번 같은 배선을 반복해 쓰기 위한 것이다.
    function osc(type, freq, at, len, vol, dest) {
      var o = ctx.createOscillator(), e = ctx.createGain();
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
      var e = ctx.createGain(); e.gain.setValueAtTime(0.0001, at);
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
    }
  },

  // ── 승리 / 패배 스팅어 ────────────────────────────────────────────────────
  //  ⚠ 이건 `SONGS` 가 아니다. 되풀이되지 않고 **한 번 울리고 끝난다.**
  //  스케줄러를 안 거치고 그 자리에서 예약한다 — 결과 화면은 곡이 아니라 문장이다.
  //
  //  왜 `Sound.play('win')` 을 안 쓰는가: 저건 삼각파 3음짜리 0.4초로, 층을 깬
  //  순간에 비해 너무 가볍다("효과음이 필요하다"는 신고가 그 뜻이었다).
  //  여기서는 뿔피리 팡파르 + 북 + 종으로 **끝났다는 감각**을 만든다.
  sting: function (kind) {
    if (!this._attach() || !this.enabled) return;
    var self = this, t = this.ctx.currentTime + 0.02;
    // 스팅어는 배경음악 위에 겹치므로 잠깐 음악을 눕힌다(안 그러면 둘 다 안 들린다).
    var back = this.cur;
    if (back) this._ramp(this.volume * 0.25, 0.15);

    try {
      if (kind === 'win') {
        // G장3화음 위로 도-미-솔-도. 마지막 음을 길게 끌고 종을 얹는다.
        var w = [[67, 0.00, 0.16], [71, 0.13, 0.16], [74, 0.26, 0.16], [79, 0.39, 0.85]];
        w.forEach(function (n) {
          self._voice('horn', t + n[1], self._hz(n[0]), n[2], 0.26);
        });
        self._voice('kick', t, 150, 0.3, 0.30);
        self._voice('kick', t + 0.39, 150, 0.3, 0.30);
        self._voice('bell', t + 0.42, self._hz(91), 1.4, 0.10);
        self._voice('shaker', t + 0.30, 0, 0.06, 0.06);
        self._voice('shaker', t + 0.35, 0, 0.06, 0.06);
      } else {
        // 내려앉는 3음 + 낮은 북. 마지막은 **음이 미끄러진다**(김빠지는 소리) —
        // 계란이 주저앉는 이 게임의 그림과 같은 몸짓이다.
        var l = [[62, 0.00, 0.22], [58, 0.20, 0.22], [53, 0.40, 0.9]];
        l.forEach(function (n) {
          self._voice('chant', t + n[1], self._hz(n[0]), n[2], 0.20);
        });
        self._voice('warDrum', t, 96, 0.6, 0.26);
        var o = self.ctx.createOscillator(), g = self.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(self._hz(53), t + 0.40);
        o.frequency.exponentialRampToValueAtTime(self._hz(41), t + 1.25);   // 미끄러진다
        g.gain.setValueAtTime(0.0001, t + 0.40);
        g.gain.exponentialRampToValueAtTime(0.14, t + 0.48);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.30);
        o.connect(g); g.connect(self.bus);
        o.start(t + 0.40); o.stop(t + 1.4);
      }
    } catch (e) {}

    // 스팅어가 끝나면 음악을 원래 크기로 되돌린다.
    if (back) setTimeout(function () {
      if (self.cur === back) self._ramp(self.enabled ? self.volume : 0, 0.6);
    }, 1500);
  }
};
