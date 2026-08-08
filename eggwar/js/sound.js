window.GAME = window.GAME || {};

// ============================================================================
//  사운드 — **파일 없이 WebAudio 로 합성**한다.
//
//  왜 합성인가: 이 게임은 GitHub Pages 정적 배포 + 빌드 단계 없음이 원칙이라
//  오디오 파일을 얹으면 그대로 첫 로딩 지연이 된다(mp3 몇 개면 수백 KB).
//  타격음·발사음 정도는 짧은 노이즈/오실레이터로 충분히 만들 수 있고,
//  자산 0KB 로 "소리가 나는 게임"이 된다.
//
//  정책
//   · 자동재생 정책 때문에 **첫 사용자 입력 뒤에** AudioContext 를 연다.
//   · 같은 소리가 한 프레임에 여러 번 겹치면 귀가 아프다 → 소리별 쿨다운을 둔다.
//   · 설정은 localStorage 에 남는다(껐으면 다음에도 꺼진 채로).
//   · **실패해도 게임은 그대로 돌아간다.** 오디오가 막힌 환경에서 예외가 나면 안 된다.
// ============================================================================
GAME.Sound = {
  KEY: 'asymgame.sound.v1',
  ctx: null,
  master: null,
  enabled: true,
  volume: 0.5,
  _last: {},          // 소리별 마지막 재생 시각 (겹침 방지)
  _ready: false,

  init: function () {
    // 저장된 설정 복원
    try {
      var saved = GAME.Store ? GAME.Store.get(this.KEY, null) : null;
      if (saved) {
        if (saved.enabled !== undefined) this.enabled = !!saved.enabled;
        if (typeof saved.volume === 'number') this.volume = saved.volume;
      }
    } catch (e) {}

    var self = this;
    // 자동재생 정책 — 사용자 제스처가 있어야 소리를 낼 수 있다.
    // 첫 입력에서 한 번만 컨텍스트를 연다.
    function unlock() {
      self._open();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    }
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock, { passive: true });
  },

  _open: function () {
    if (this._ready) return true;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? this.volume : 0;
      this.master.connect(this.ctx.destination);
      this._ready = true;
      return true;
    } catch (e) { return false; }
  },

  setEnabled: function (on) {
    this.enabled = !!on;
    if (this.master) this.master.gain.value = this.enabled ? this.volume : 0;
    this._save();
  },
  setVolume: function (v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master && this.enabled) this.master.gain.value = this.volume;
    this._save();
  },
  toggle: function () { this.setEnabled(!this.enabled); return this.enabled; },
  _save: function () {
    try { if (GAME.Store) GAME.Store.set(this.KEY, { enabled: this.enabled, volume: this.volume }); }
    catch (e) {}
  },

  // 짧은 노이즈 버퍼 — 타격·폭발의 재료
  _noise: function (dur) {
    var n = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    var buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    return buf;
  },

  // 톤 하나 — type/주파수/길이/볼륨, 그리고 주파수 스윕(끝 주파수)
  _tone: function (opt) {
    if (!this._ready || !this.enabled) return;
    var t = this.ctx.currentTime;
    var o = this.ctx.createOscillator();
    var g = this.ctx.createGain();
    o.type = opt.type || 'sine';
    o.frequency.setValueAtTime(opt.f0, t);
    if (opt.f1 && opt.f1 !== opt.f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, opt.f1), t + opt.dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, opt.vol), t + (opt.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + opt.dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + opt.dur + 0.02);
  },

  _burst: function (opt) {
    if (!this._ready || !this.enabled) return;
    var t = this.ctx.currentTime;
    var src = this.ctx.createBufferSource();
    src.buffer = this._noise(opt.dur);
    var f = this.ctx.createBiquadFilter();
    f.type = opt.filter || 'bandpass';
    f.frequency.value = opt.freq || 900;
    f.Q.value = opt.q || 1.2;
    var g = this.ctx.createGain();
    g.gain.setValueAtTime(opt.vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opt.dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + opt.dur + 0.02);
  },

  // 같은 소리가 너무 자주 나지 않게 (ms)
  _gate: function (name, ms) {
    var now = Date.now();
    if (this._last[name] && now - this._last[name] < ms) return false;
    this._last[name] = now;
    return true;
  },

  // ── 실제 효과음 ──────────────────────────────────────────────────────────
  play: function (name) {
    if (!this._ready || !this.enabled) return;
    try {
      switch (name) {
        case 'tap':          // 버튼 누름 — 아주 짧은 '톡'
          //  ⚠ 버튼 소리는 **짧고 작아야** 한다. 길거나 크면 메뉴를 오갈 때마다
          //    귀에 걸려 금방 거슬린다. 40ms · 볼륨 0.10 은 "눌렸다"만 전하는 크기다.
          if (!this._gate('tap', 40)) return;
          this._tone({ type: 'square', f0: 620, f1: 480, dur: 0.04, vol: 0.10 });
          break;
        case 'tapBig':       // 확정·시작 같은 큰 버튼
          if (!this._gate('tapBig', 60)) return;
          this._tone({ type: 'triangle', f0: 420, f1: 700, dur: 0.09, vol: 0.16 });
          break;
        case 'hit':          // 근접 타격 — 짧고 둔탁하게
          if (!this._gate('hit', 45)) return;
          this._burst({ dur: 0.09, freq: 420, q: 0.9, vol: 0.30 });
          this._tone({ type: 'triangle', f0: 180, f1: 90, dur: 0.09, vol: 0.16 });
          break;
        case 'shoot':        // 투사체 발사 — 바람 가르는 소리
          if (!this._gate('shoot', 60)) return;
          this._burst({ dur: 0.07, freq: 1700, q: 2.0, vol: 0.14, filter: 'highpass' });
          break;
        //  ── 활 (2026-08-04 사용자 요청: "화살 효과음") ────────────────────────
        //  예전에는 모든 투사체가 `shoot` 하나였다 — 돌·창·화살이 같은 소리였다.
        //  활은 **두 겹**이다: ① 시위가 튕기는 낮은 '텅' ② 깃이 공기를 가르는 '쉭'.
        //  ⚠ 이 세계에 금속 활시위는 없다. 힘줄과 나무라 **낮고 둔한** 튕김이다 —
        //    높은 '핑' 소리를 넣으면 그 순간 SF 가 된다.
        //  ⚠ `_gate` 는 필수다. 사냥꾼 연사는 초당 여러 발이라 안 막으면 소리가
        //    뭉개져 오히려 안 들린다(이 파일이 hit·yolk 에서 이미 배운 것).
        case 'bow':
          if (!this._gate('bow', 55)) return;
          this._tone({ type: 'triangle', f0: 230, f1: 96, dur: 0.10, vol: 0.17 });
          this._burst({ dur: 0.055, freq: 2300, q: 2.6, vol: 0.10, filter: 'highpass' });
          break;
        //  화살이 박히는 소리 — 짧고 마른 '탁'. 살에 박히는 것이지 금속끼리가 아니다.
        case 'arrowHit':
          if (!this._gate('arrowHit', 60)) return;
          this._burst({ dur: 0.06, freq: 780, q: 1.4, vol: 0.18 });
          this._tone({ type: 'triangle', f0: 300, f1: 140, dur: 0.07, vol: 0.11 });
          break;
        case 'skill':        // 스킬 시전 — 위로 솟는 톤
          this._tone({ type: 'sawtooth', f0: 300, f1: 760, dur: 0.20, vol: 0.20 });
          break;
        case 'boom':         // 광역·폭발
          this._burst({ dur: 0.34, freq: 220, q: 0.6, vol: 0.36, filter: 'lowpass' });
          this._tone({ type: 'sine', f0: 130, f1: 46, dur: 0.34, vol: 0.26 });
          break;
        case 'yolk':         // 유닛 사망(노른자) — 말랑하게 '퐁'
          if (!this._gate('yolk', 70)) return;
          this._tone({ type: 'sine', f0: 700, f1: 240, dur: 0.16, vol: 0.20 });
          break;
        case 'heroHurt':     // 내 영웅이 맞음 — 낮게 경고
          if (!this._gate('heroHurt', 220)) return;
          this._tone({ type: 'square', f0: 190, f1: 120, dur: 0.13, vol: 0.16 });
          break;
        case 'click':        // 버튼
          this._tone({ type: 'square', f0: 620, f1: 880, dur: 0.045, vol: 0.10 });
          break;
        case 'win':          // 승리 — 상행 3음
          this._tone({ type: 'triangle', f0: 523, dur: 0.16, vol: 0.22 });
          this._later(0.13, function (s) { s._tone({ type: 'triangle', f0: 659, dur: 0.16, vol: 0.22 }); });
          this._later(0.27, function (s) { s._tone({ type: 'triangle', f0: 784, dur: 0.30, vol: 0.24 }); });
          break;
        case 'lose':         // 패배 — 하행 2음
          this._tone({ type: 'triangle', f0: 392, dur: 0.22, vol: 0.20 });
          this._later(0.18, function (s) { s._tone({ type: 'triangle', f0: 262, dur: 0.40, vol: 0.20 }); });
          break;
        case 'coin':         // 골드 획득·레벨업
          this._tone({ type: 'square', f0: 880, dur: 0.07, vol: 0.14 });
          this._later(0.07, function (s) { s._tone({ type: 'square', f0: 1320, dur: 0.12, vol: 0.14 }); });
          break;
        case 'coinPick':     // 전장에서 동전을 주움 — '짤랑'
          // 왜 'coin'(레벨업 팡파르)을 재활용하지 않는가: 저건 0.19초짜리 상행 2음이라
          // 전투 중 연속으로 주우면 소리가 서로를 밟고 진행을 방해한다. 줍는 소리는
          // **짧고 밝고 배경으로 물러나야** 한다.
          //
          // '짤랑'의 재료 세 가지
          //  ① 금속 틱 — 아주 짧은 고역 노이즈. 이게 없으면 '삑' 하는 전자음이 된다.
          //  ② 삼각파 2음(≈B6 + 그 위 완전5도)을 **거의 동시에** 겹친다. 완전한 화음이
          //     아니라 살짝 어긋난 배음이 금속의 '짤랑'을 만든다.
          //  ③ 매번 ±5% 피치 지터 — 안 넣으면 연속 획득이 기계 반복음으로 들린다.
          // 쿨다운 45ms 는 'hit' 와 같은 값이다. 동전 여러 개를 한 프레임에 주우면
          // coin.js 가 이미 한 번으로 합쳐 보내지만, 프레임을 걸쳐 들어오는 것은 여기서 막는다.
          if (!this._gate('coinPick', 45)) return;
          var j = 1 + (Math.random() * 2 - 1) * 0.05;
          this._burst({ dur: 0.035, freq: 5200, q: 1.0, vol: 0.10, filter: 'highpass' });
          this._tone({ type: 'triangle', f0: 1980 * j, f1: 1880 * j, dur: 0.075, vol: 0.13, attack: 0.002 });
          this._tone({ type: 'triangle', f0: 2960 * j, f1: 2860 * j, dur: 0.055, vol: 0.07, attack: 0.002 });
          break;
      }
    } catch (e) { /* 소리 때문에 게임이 멈추면 안 된다 */ }
  },

  _later: function (sec, fn) {
    var self = this;
    setTimeout(function () { try { fn(self); } catch (e) {} }, sec * 1000);
  },

  // ══ 유닛 목소리 (2026-08-08, 사용자 지시: "유닛마다 공격음과 피격음, 죽을때
  //    소리가 달랐으면 좋겠음 — 특징이 담기게") ══════════════════════════════
  //
  //  왜 케이스를 60개(20종 × 3) 안 만드나: 이 파일은 샘플이 아니라 **신시사이저**다.
  //  같은 몸짓(때린다·맞는다·죽는다)에 **재료의 음색**만 갈아 끼우면 스무 종이
  //  각자 다르게 들린다. 유닛이 늘어도 표에 한 줄만 더하면 된다.
  //
  //  ⚠ **소리는 겹치면 소리가 아니라 소음이다.** 유닛 스무 기가 동시에 때리므로
  //    ① 재료마다 따로 게이트를 걸고 ② 영웅보다 확실히 작게 낸다(0.4~0.6배).
  //    영웅 소리가 묻히면 "내가 맞고 있다"를 못 듣는다 — 그게 제일 중요한 신호다.
  //  ⚠ 이 세계에 전자음·마법음은 없다(12세 · 원시 부족). 전부 물건이 부딪는 소리다.
  //
  //  atk  = 때릴 때 · hurt = 맞을 때 · die = 죽을 때(노른자 '퐁' 뒤에 재료 꼬리)
  VOICE: {
    blade:  { atk: [{ b: { d: 0.055, f: 1500, q: 2.2, v: 0.16 } }, { t: { w: 'triangle', f0: 620, f1: 300, d: 0.06, v: 0.09 } }],
              hurt: [{ b: { d: 0.05, f: 1100, q: 1.8, v: 0.10 } }],
              die:  [{ t: { w: 'triangle', f0: 520, f1: 170, d: 0.16, v: 0.10 } }] },
    stone:  { atk: [{ b: { d: 0.08, f: 320, q: 0.8, v: 0.20, lp: 1 } }, { t: { w: 'sine', f0: 155, f1: 78, d: 0.09, v: 0.12 } }],
              hurt: [{ b: { d: 0.06, f: 280, q: 0.7, v: 0.11, lp: 1 } }],
              die:  [{ b: { d: 0.20, f: 240, q: 0.5, v: 0.14, lp: 1 } }] },
    wood:   { atk: [{ b: { d: 0.06, f: 640, q: 1.4, v: 0.16 } }, { t: { w: 'triangle', f0: 270, f1: 150, d: 0.07, v: 0.09 } }],
              hurt: [{ b: { d: 0.05, f: 520, q: 1.2, v: 0.09 } }],
              die:  [{ t: { w: 'triangle', f0: 300, f1: 120, d: 0.15, v: 0.09 } }] },
    bone:   { atk: [{ b: { d: 0.04, f: 1600, q: 2.6, v: 0.13, hp: 1 } }],
              hurt: [{ b: { d: 0.04, f: 1300, q: 2.2, v: 0.08, hp: 1 } }],
              die:  [{ b: { d: 0.10, f: 1100, q: 1.6, v: 0.09, hp: 1 } }] },
    rope:   { atk: [{ b: { d: 0.07, f: 2200, q: 2.4, v: 0.12, hp: 1 } }, { t: { w: 'sine', f0: 420, f1: 180, d: 0.06, v: 0.06 } }],
              hurt: [{ b: { d: 0.05, f: 1700, q: 2.0, v: 0.08, hp: 1 } }],
              die:  [{ t: { w: 'sine', f0: 330, f1: 110, d: 0.16, v: 0.08 } }] },
    leather:{ atk: [{ b: { d: 0.06, f: 700, q: 0.9, v: 0.13, lp: 1 } }],
              hurt: [{ b: { d: 0.05, f: 600, q: 0.8, v: 0.08, lp: 1 } }],
              die:  [{ b: { d: 0.14, f: 480, q: 0.6, v: 0.09, lp: 1 } }] },
    clay:   { atk: [{ t: { w: 'sine', f0: 400, f1: 210, d: 0.09, v: 0.12 } }, { b: { d: 0.05, f: 950, q: 1.8, v: 0.10 } }],
              hurt: [{ t: { w: 'sine', f0: 330, f1: 190, d: 0.07, v: 0.08 } }],
              //  옹기가 깨진다 — 조각 소리 두 겹
              die:  [{ b: { d: 0.09, f: 1500, q: 2.2, v: 0.13 } }, { b: { d: 0.16, f: 800, q: 1.2, v: 0.09 } }] },
    shell:  { atk: [{ b: { d: 0.045, f: 1900, q: 2.8, v: 0.12, hp: 1 } }, { t: { w: 'triangle', f0: 720, f1: 400, d: 0.05, v: 0.07 } }],
              hurt: [{ b: { d: 0.04, f: 1600, q: 2.4, v: 0.08, hp: 1 } }],
              die:  [{ b: { d: 0.12, f: 1400, q: 1.8, v: 0.11, hp: 1 } }] },
    goo:    { atk: [{ b: { d: 0.10, f: 270, q: 0.5, v: 0.15, lp: 1 } }, { t: { w: 'sine', f0: 230, f1: 108, d: 0.10, v: 0.09 } }],
              hurt: [{ b: { d: 0.07, f: 240, q: 0.5, v: 0.09, lp: 1 } }],
              die:  [{ t: { w: 'sine', f0: 260, f1: 70, d: 0.20, v: 0.10 } }] },
    ember:  { atk: [{ b: { d: 0.09, f: 1250, q: 0.8, v: 0.13 } }, { t: { w: 'sawtooth', f0: 300, f1: 120, d: 0.08, v: 0.07 } }],
              hurt: [{ b: { d: 0.06, f: 1000, q: 0.7, v: 0.08 } }],
              //  불이 꺼진다 — 치익
              die:  [{ b: { d: 0.24, f: 1800, q: 0.5, v: 0.10, hp: 1 } }] },
    dust:   { atk: [{ b: { d: 0.11, f: 3000, q: 0.6, v: 0.09, hp: 1 } }],
              hurt: [{ b: { d: 0.07, f: 2600, q: 0.6, v: 0.06, hp: 1 } }],
              die:  [{ b: { d: 0.22, f: 2200, q: 0.5, v: 0.08, hp: 1 } }] },
    bronze: { atk: [{ t: { w: 'triangle', f0: 660, f1: 430, d: 0.11, v: 0.13 } }, { b: { d: 0.04, f: 1800, q: 2.4, v: 0.08 } }],
              hurt: [{ t: { w: 'triangle', f0: 520, f1: 380, d: 0.08, v: 0.08 } }],
              die:  [{ t: { w: 'triangle', f0: 600, f1: 200, d: 0.22, v: 0.10 } }] },
    iron:   { atk: [{ b: { d: 0.05, f: 1150, q: 2.0, v: 0.15 } }, { t: { w: 'square', f0: 300, f1: 190, d: 0.05, v: 0.06 } }],
              hurt: [{ b: { d: 0.04, f: 950, q: 1.7, v: 0.09 } }],
              die:  [{ t: { w: 'square', f0: 330, f1: 120, d: 0.16, v: 0.08 } }] }
  },

  //  유닛 하나의 소리. `mat` 은 def.voice, `pitch` 는 def.voicePitch(체급 — 클수록 낮게).
  //  ⚠ 어떤 인자가 이상해도 **조용히 넘어간다.** 소리 때문에 전투가 멈추면 안 된다.
  playUnit: function (kind, mat, pitch) {
    if (!this._ready || !this.enabled) return;
    var v = this.VOICE[mat];
    if (!v || !v[kind]) return;
    //  재료 × 사건마다 따로 막는다. 같은 재료가 동시에 여럿 때려도 한 번만 난다.
    //  ⚠ 죽음은 드물고 중요하므로 게이트를 짧게(겹쳐 죽으면 두 번 들려도 된다).
    var gap = kind === 'die' ? 45 : (kind === 'hurt' ? 130 : 95);
    if (!this._gate('u:' + mat + ':' + kind, gap)) return;
    var p = pitch || 1;
    //  ⚠ 매번 ±4% 흔든다. 안 흔들면 같은 유닛이 연속으로 때릴 때 기계 반복음이 된다
    //    (이 파일이 `coinPick` 에서 이미 배운 것).
    var j = 1 + (Math.random() * 2 - 1) * 0.04;
    var parts = v[kind];
    try {
      for (var i = 0; i < parts.length; i++) {
        var q = parts[i];
        if (q.t) {
          this._tone({ type: q.t.w, f0: q.t.f0 * p * j, f1: (q.t.f1 || q.t.f0) * p * j,
                       dur: q.t.d, vol: q.t.v });
        } else if (q.b) {
          this._burst({ dur: q.b.d, freq: q.b.f * p * j, q: q.b.q, vol: q.b.v,
                        filter: q.b.hp ? 'highpass' : (q.b.lp ? 'lowpass' : 'bandpass') });
        }
      }
    } catch (e) { /* 소리 때문에 게임이 멈추면 안 된다 */ }
  },

  //  def 하나에서 바로 낸다 — 부르는 쪽이 재료를 몰라도 되게.
  playFor: function (kind, def) {
    if (!def || !def.voice) return;
    this.playUnit(kind, def.voice, def.voicePitch);
  }
};
