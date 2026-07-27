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
        case 'hit':          // 근접 타격 — 짧고 둔탁하게
          if (!this._gate('hit', 45)) return;
          this._burst({ dur: 0.09, freq: 420, q: 0.9, vol: 0.30 });
          this._tone({ type: 'triangle', f0: 180, f1: 90, dur: 0.09, vol: 0.16 });
          break;
        case 'shoot':        // 투사체 발사 — 바람 가르는 소리
          if (!this._gate('shoot', 60)) return;
          this._burst({ dur: 0.07, freq: 1700, q: 2.0, vol: 0.14, filter: 'highpass' });
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
      }
    } catch (e) { /* 소리 때문에 게임이 멈추면 안 된다 */ }
  },

  _later: function (sec, fn) {
    var self = this;
    setTimeout(function () { try { fn(self); } catch (e) {} }, sec * 1000);
  }
};
