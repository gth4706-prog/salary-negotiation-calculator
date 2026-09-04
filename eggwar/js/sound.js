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
    this._loadPrefs();

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
      this._loadFiles();
      return true;
    } catch (e) { return false; }
  },

  //  ── 파일 효과음 (2026-08-23 — 19종 도착, assets/sfx/*.wav 총 1.1MB) ─────────
  //  wav 를 쓴다: 무압축 = 인코더 지연 없음(README 실측 — OGG 는 20ms 어택이
  //  -12dB 로 뭉개진다). ⚠ ogg 단독 배포 금지(iOS Safari 재생 불가).
  //  로딩은 오디오 잠금 해제 뒤 비동기 — 못/안 받은 키는 아래 절차 합성이 그대로
  //  낸다(파일이 그리기의 전제조건이 되면 로드 타이밍에 소리가 통째로 사라진다).
  //  같은 키의 변주는 랜덤 + 재생속도 미세 변주(±3%) — 연타가 기계음이 안 되게.
  FILES: {
    hit: ['hit_0', 'hit_1', 'hit_2'],
    critHit: ['critHit_0', 'critHit_1'],
    //  bow 파일은 뺐다(2026-08-23 태현님: 고공속 연사에서 시위 '텅'이 거북)
    //  — 아래 절차 합성 '슝'(바람 가르는 소리)이 담당한다. wav 는 assets 에 남아 있다.
    arrowHit: ['arrowHit_0', 'arrowHit_1'],
    skill: ['skillCast'],
    skillBurst: ['skillBurst_0', 'skillBurst_1'],
    boom: ['boom'],
    bossRoar: ['bossRoar'], bossStep: ['bossStep'], bossSlam: ['bossSlam'],
    bossCharge: ['bossCharge'], bossBreath: ['bossBreath'], bossDown: ['bossDown']
  },
  //  파일 재생도 절차 합성과 **같은 쿨다운**을 지킨다(_gate 값 미러 — 파일이라고
  //  겹쳐 재생하면 더 지저분하다). 표에 없는 키는 게이트 없이 낸다(원래도 없었다).
  FILE_GATES: { hit: 45, critHit: 90, arrowHit: 60, skillBurst: 120,
                bossStep: 230, bossBreath: 300, bossSlam: 300, bossCharge: 500,
                bossRoar: 1200 },
  _fbuf: null,

  _loadFiles: function () {
    if (this._fbuf || !this.ctx) return;
    this._fbuf = {};
    var self = this;
    for (var key in this.FILES) {
      (function (k) {
        self.FILES[k].forEach(function (fname) {
          //  ⚠ 캐시버스터를 버전에 안 묶는다 — 소리 파일은 배포마다 안 바뀌는데
          //    ?v= 를 올리면 폰이 매번 1.1MB 를 다시 받는다.
          fetch('assets/sfx/' + fname + '.wav?v=1')
            .then(function (r) { return r.ok ? r.arrayBuffer() : Promise.reject(); })
            .then(function (ab) { return self.ctx.decodeAudioData(ab); })
            .then(function (buf) {
              if (!self._fbuf[k]) self._fbuf[k] = [];
              self._fbuf[k].push(buf);
            })
            .catch(function () { /* 못 받으면 절차 합성이 대신 낸다 */ });
        });
      })(key);
    }
  },

  //  파일별 상대 음량 — 잦은 소리는 눌러 둔다(2026-08-23 태현님: "시끄럽다").
  FILE_VOL: { skillBurst: 0.55, boom: 0.8 },
  _playFile: function (name) {
    var list = this._fbuf && this._fbuf[name];
    if (!list || !list.length) return false;
    try {
      var t = this.ctx.currentTime;
      var src = this.ctx.createBufferSource();
      src.buffer = list[Math.floor(Math.random() * list.length)];
      src.playbackRate.value = 0.97 + Math.random() * 0.06;
      var vol = this.FILE_VOL[name];
      if (vol !== undefined && vol !== 1) {
        var g = this.ctx.createGain();
        g.gain.value = vol;
        src.connect(g); g.connect(this.master);
      } else {
        src.connect(this.master);
      }
      src.start(t);
      return true;
    } catch (e) { return false; }
  },

  //  저장된 설정 복원 — init 과 감사(tools/feel-audit.js)가 같이 부른다.
  //  init 은 window 리스너까지 거므로 헤드리스에서는 못 부른다 → 복원만 떼어 둔다.
  _loadPrefs: function () {
    try {
      var saved = GAME.Store ? GAME.Store.get(this.KEY, null) : null;
      if (saved) {
        if (saved.enabled !== undefined) this.enabled = !!saved.enabled;
        if (typeof saved.volume === 'number') this.volume = saved.volume;
      }
    } catch (e) {}
    try {
      var h = GAME.Store ? GAME.Store.get(this.HAPTIC_KEY, null) : null;
      this.hapticOn = (h === null || h === undefined) ? true : !!h;
    } catch (e) { this.hapticOn = true; }
  },

  // ══ 햅틱 (2026-09-02 C 갈래 — 게임필) ═══════════════════════════════════════
  //  소리와 같은 자리에서 관리한다: 켜고 끄는 설정·저장 키·"실패해도 게임은 돈다".
  //  종류를 이름으로 부른다(길이를 호출부에 박지 않는다) — 손맛의 단계가 한 표에
  //  모여 있어야 '중요할 때만 울린다'(v1.31 규칙)를 한눈에 지킬 수 있다.
  //  ⚠ iOS 사파리는 navigator.vibrate 가 없다 — 그때는 조용히 아무 일도 안 한다.
  //  ⚠ 값이 크면 싸구려 진동이 된다. 피격 8ms 는 '톡', 궁극 40ms 가 상한.
  HAPTIC_KEY: 'eggwar.haptic',
  HAPTIC: {
    hit: 8, skill: 15, kill: 25, ult: 40,
    win: [30, 40, 60], lose: 80,
    //  battle.js 가 예전부터 쓰던 두 자리 — 표로 끌어와 같은 토글을 따르게 한다.
    reflect: [14, 40, 14], pickup: 18,
    ultBanner: [22, 50, 30]      //  궁극기 배너(_ultBanner) — 두 번 끊어 피격과 구분
  },
  hapticOn: true,

  //  순수 함수 — 종류 → 진동 패턴(ms 또는 ms 배열). 모르는 종류는 null.
  hapticPattern: function (kind) {
    var p = this.HAPTIC[kind];
    if (p === undefined) return null;
    return Array.isArray(p) ? p.slice() : p;
  },
  hapticSupported: function () {
    try { return typeof navigator !== 'undefined' && !!navigator && typeof navigator.vibrate === 'function'; }
    catch (e) { return false; }
  },
  //  실제로 울렸으면 true. 꺼져 있거나·지원 안 하거나·모르는 종류면 false(예외 없음).
  haptic: function (kind) {
    if (!this.hapticOn) return false;
    var p = this.hapticPattern(kind);
    if (p === null) return false;
    if (!this.hapticSupported()) return false;
    try { return !!navigator.vibrate(p); } catch (e) { return false; }
  },
  setHaptic: function (on) {
    this.hapticOn = !!on;
    try { if (GAME.Store) GAME.Store.set(this.HAPTIC_KEY, this.hapticOn); } catch (e) {}
    return this.hapticOn;
  },
  toggleHaptic: function () { return this.setHaptic(!this.hapticOn); },

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

  // ── 노이즈 — 타격·폭발·바람의 재료 (2026-09-03 시즌2: **캐시 버퍼**) ────────
  //  예전엔 소리마다 버퍼를 새로 만들었다(`createBuffer` + 표본 채우기). 난전에서
  //  초당 수십 번이라 GC 쓰레기가 됐다(v1.66 타원 할당과 같은 계열). 이제 2초짜리
  //  백색 노이즈 하나를 컨텍스트마다 한 번만 만들고, 재생할 때 **랜덤 오프셋**에서
  //  잘라 쓴다 — 같은 구간이 반복되면 귀가 패턴을 잡는데, 오프셋이 그걸 흩는다.
  //  ⚠ 버퍼는 컨텍스트에 묶어 둔다(bake·감사가 ctx 를 오프라인으로 갈아끼운다).
  //  ⚠ 예전 버퍼의 선형 페이드(1 - i/n)는 없앴다 — 포락선은 게인이 맡는다.
  NOISE_SEC: 2,
  _noiseBuf: null, _noiseCtx: null,
  _noise: function () {
    if (this._noiseBuf && this._noiseCtx === this.ctx) return this._noiseBuf;
    var n = Math.max(1, Math.floor(this.ctx.sampleRate * this.NOISE_SEC));
    var buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this._noiseBuf = buf; this._noiseCtx = this.ctx;
    return buf;
  },
  //  캐시 버퍼를 물린 소스 + 시작 오프셋. 호출부가 `src.start(t, off, len)` 한다.
  _noiseSrc: function (dur) {
    var src = this.ctx.createBufferSource();
    src.buffer = this._noise();
    var span = Math.max(0, this.NOISE_SEC - dur - 0.05);
    return { src: src, off: Math.random() * span };
  },

  // 톤 하나 — type/주파수/길이/볼륨, 그리고 주파수 스윕(끝 주파수)
  //  `at`: 시작 오프셋(초, ctx.currentTime 기준). `_later`(setTimeout)와 달리
  //  오디오 시계에 예약되므로 박자가 안 밀리고 오프라인 렌더(감사)에도 잡힌다.
  //  `bp`: {f, q} 대역필터 — 구호(chant) 모음 흉내 등 포먼트가 필요할 때만.
  _tone: function (opt) {
    if (!this._ready || !this.enabled) return;
    var t = this.ctx.currentTime + (opt.at || 0);
    var o = this.ctx.createOscillator();
    var g = this.ctx.createGain();
    g.gain.value = 0.0001;             // ⚠ 아래 `_burst` 주석 — 첫 표본 누수 방지
    o.type = opt.type || 'sine';
    o.frequency.setValueAtTime(opt.f0, t);
    if (opt.f1 && opt.f1 !== opt.f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, opt.f1), t + opt.dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, opt.vol), t + (opt.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + opt.dur);
    if (opt.bp) {
      var bf = this.ctx.createBiquadFilter();
      bf.type = 'bandpass'; bf.frequency.value = opt.bp.f; bf.Q.value = opt.bp.q || 3;
      o.connect(bf); bf.connect(g);
    } else {
      o.connect(g);
    }
    g.connect(this.master);
    o.start(t); o.stop(t + opt.dur + 0.02);
  },

  _burst: function (opt) {
    if (!this._ready || !this.enabled) return;
    var t = this.ctx.currentTime + (opt.at || 0);
    var ns = this._noiseSrc(opt.dur);
    var f = this.ctx.createBiquadFilter();
    f.type = opt.filter || 'bandpass';
    f.frequency.value = opt.freq || 900;
    f.Q.value = opt.q || 1.2;
    var g = this.ctx.createGain();
    //  ⚠⚠ **게인의 초기값을 먼저 박는다** (2026-09-03 실측 결함). 노이즈 소스가 자동화
    //    이벤트(setValueAtTime)보다 **한 표본 먼저** 시작하는 시각이 있다(부동소수 시각의
    //    표본 반올림). 그 한 표본이 기본 게인 1.0 으로 새어 나가 vol 의 5~10배 스파이크가
    //    됐다(오프라인 렌더 63회 중 11회, 최고 0.96 — 오실레이터는 위상 0 에서 시작해
    //    첫 표본이 0 이라 안 보였고 노이즈만 걸렸다). 초기값을 vol 로 두면 새어도 vol 이다.
    g.gain.value = opt.vol;
    g.gain.setValueAtTime(opt.vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opt.dur);
    ns.src.connect(f); f.connect(g); g.connect(this.master);
    ns.src.start(t, ns.off, opt.dur + 0.02);
  },

  //  스윕 — 노이즈를 대역필터로 **훑어 내리는/올리는** 소리. 화살 '슝'(3.2k→700),
  //  바람, 암살자의 그림자 걸음(올라가는 스윕)이 전부 이 하나다.
  //  예전엔 `bow` 케이스 안에 인라인이었다 — 두 번째 사용처(사냥꾼 팔레트)가 생기며
  //  함수로 뺐다. {dur, f0, f1, q, vol, at, filter}
  _sweep: function (opt) {
    if (!this._ready || !this.enabled) return;
    var t = this.ctx.currentTime + (opt.at || 0);
    var ns = this._noiseSrc(opt.dur);
    var f = this.ctx.createBiquadFilter();
    f.type = opt.filter || 'bandpass'; f.Q.value = opt.q || 1.6;
    f.frequency.setValueAtTime(opt.f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, opt.f1), t + Math.max(0.01, opt.dur - 0.01));
    var g = this.ctx.createGain();
    g.gain.value = opt.vol;            // ⚠ `_burst` 주석 — 첫 표본 누수 방지
    g.gain.setValueAtTime(opt.vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opt.dur);
    ns.src.connect(f); f.connect(g); g.connect(this.master);
    ns.src.start(t, ns.off, opt.dur + 0.02);
  },

  //  ── 킬스트릭 (2026-08-23 태현님 승인 ④) — 2연킬부터, 톤이 한 단계씩 오른다.
  //  ⚠ 세계관: 금속·전자음 금지 → 사각파 대신 triangle + sine 겹으로 부드럽게.
  killStreak: function (n) {
    if (!this._ready || !this.enabled) return;
    if (!this._gate('killStreak', 200)) return;
    var base = 300 * Math.pow(1.22, Math.min(5, n) - 1);
    this._tone({ type: 'triangle', f0: base, f1: base * 1.34, dur: 0.16, vol: 0.16, attack: 0.01 });
    this._tone({ type: 'sine', f0: base * 2, f1: base * 2.6, dur: 0.12, vol: 0.07, attack: 0.01 });
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
      //  파일이 있으면 파일 우선(변주 랜덤) — 게이트는 절차 합성과 같은 값을 지킨다.
      if (this._fbuf && this._fbuf[name] && this._fbuf[name].length) {
        var fg = this.FILE_GATES[name];
        if (fg !== undefined && !this._gate(name, fg)) return;
        if (this._playFile(name)) return;
      }
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
        //  ── 근접 타격 — 짧고 둔탁하게 ────────────────────────────────────────
        //  ⚠⚠ **폰 스피커는 이 소리의 절반을 못 낸다**(2026-08-11 조사). 실측 자료:
        //    모바일 스피커는 100Hz 아래가 사실상 없고 220~1000Hz 구간에서 롤오프가
        //    진행된다. 즉 180→90Hz 톤은 폰에서 거의 안 들리고 420Hz 버스트도
        //    감쇠 구간에 있다 — **PC 브라우저에서 맞춘 소리를 그대로 폰에 실은 것**이다.
        //    사용자가 「때려도 소리가 없다」고 느낀 것은 안 울려서가 아니라 안 들려서다.
        //  ⚠ 그래서 **고역 트랜지언트 한 겹을 앞에 붙인다.** 3레이어 구조에서
        //    고역은 「즉각 신호」를 맡고, 폰에서 실제로 들리는 유일한 대역이다.
        //    저역(서브)은 지우지 않는다 — 헤드폰·진동과 합쳐질 때 몫이 있다.
        //  ⚠ 아주 짧아야 한다(14ms). 길면 「탁」이 아니라 「치익」이 되어 둔탁함을 깬다.
        //    `bow`(2300Hz)·`shoot`(1700Hz)이 이미 같은 재료를 쓰는데 **가장 자주 나는
        //    `hit` 에만 없었다.**
        case 'hit':          // 근접 타격 — 짧고 둔탁하게
          if (!this._gate('hit', 45)) return;
          this._burst({ dur: 0.014, freq: 2600, q: 2.2, vol: 0.13, filter: 'highpass' });
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
        case 'bow': {
          if (!this._gate('bow', 55)) return;
          //  2026-08-23 태현님: "공격속도 높아지니 거북 — 얇고 작은 '슝'으로."
          //  시위 '텅'(저역 튕김)을 버리고 **바람 가르는 소리**만 남긴다: 노이즈를
          //  대역필터로 3.2k→700Hz 훑어 내리면 화살이 지나가는 결이 된다.
          //  작게(0.13) · 짧게(0.11s) — 연사로 깔려도 안 쌓인다.
          //  (2026-09-03 인라인 → `_sweep`. 값은 그대로다.)
          this._sweep({ dur: 0.11, f0: 3200, f1: 700, q: 1.6, vol: 0.13 });
          break;
        }
        //  화살이 박히는 소리 — 짧고 마른 '탁'. 살에 박히는 것이지 금속끼리가 아니다.
        case 'arrowHit':
          if (!this._gate('arrowHit', 60)) return;
          this._burst({ dur: 0.06, freq: 780, q: 1.4, vol: 0.18 });
          this._tone({ type: 'triangle', f0: 300, f1: 140, dur: 0.07, vol: 0.11 });
          break;
        case 'skill':        // 스킬 시전 — 위로 솟는 톤
          this._tone({ type: 'sawtooth', f0: 300, f1: 760, dur: 0.20, vol: 0.20 });
          break;
        //  ── 광역·폭발 ──────────────────────────────────────────────────────
        //  ⚠⚠ 이 소리는 **통째로 폰이 못 내는 대역**에 있었다(220Hz 로우패스 + 130→46Hz).
        //    폰 스피커는 100Hz 아래가 사실상 없고 220~1000Hz 는 감쇠한다 —
        //    즉 폭발이 헤드폰에서만 들렸다. 게다가 이 소리는 이제 **스킬 시전음**으로도
        //    쓰여서(광역·덫 계열) 가장 자주 나는 소리 중 하나가 됐다.
        //  ⚠ 저역을 지우지 않는다 — 그게 「묵직함」의 정체이고 헤드폰·진동에서 산다.
        //    대신 **앞에 짧은 고역 한 겹**을 얹어 폰에서도 「터졌다」가 전해지게 한다.
        case 'trapSet':      // 덫 설치 — 말뚝 박는 낮은 '턱'. 폭발음이 아니다.
          if (!this._gate('trapSet', 200)) return;
          this._tone({ type: 'triangle', f0: 190, f1: 90, dur: 0.09, vol: 0.16 });
          this._burst({ dur: 0.05, freq: 700, q: 1.4, vol: 0.10 });
          break;
        case 'skillBurst':   // 스킬 착탄(예고 원이 터지는 순간) — boom 보다 가볍게
          if (!this._gate('skillBurst', 120)) return;
          this._burst({ dur: 0.05, freq: 1600, q: 1.1, vol: 0.14, filter: 'highpass' });
          this._burst({ dur: 0.20, freq: 480, q: 0.9, vol: 0.26 });
          break;
        case 'boom':         // 광역·폭발
          this._burst({ dur: 0.03, freq: 1900, q: 1.2, vol: 0.16, filter: 'highpass' });
          this._burst({ dur: 0.34, freq: 220, q: 0.6, vol: 0.36, filter: 'lowpass' });
          this._tone({ type: 'sine', f0: 130, f1: 46, dur: 0.34, vol: 0.26 });
          break;
        case 'yolk':         // 유닛 사망(노른자) — 말랑하게 '퐁'
          if (!this._gate('yolk', 70)) return;
          this._tone({ type: 'sine', f0: 700, f1: 240, dur: 0.16, vol: 0.20 });
          break;
        //  ── 내 영웅이 맞음 — 낮게 경고 ─────────────────────────────────────
        //  ⚠⚠ 190→120Hz 는 **폰에서 거의 안 들린다**. 이건 연출이 아니라 **경고**라
        //    안 들리면 기능을 통째로 잃는다 — 회피가 전부인 게임에서 「지금 맞고 있다」를
        //    모르는 것이 가장 나쁘다.
        //  ⚠ 성격(낮고 둔한 경고)은 지킨다. 높은 「삑」을 넣으면 그 순간 다른 게임이 된다 —
        //    중역(520Hz)에 **작게** 겹쳐 존재만 알린다. 저역이 여전히 주인공이다.
        case 'heroHurt':     // 내 영웅이 맞음 — 낮게 경고
          if (!this._gate('heroHurt', 220)) return;
          this._tone({ type: 'square', f0: 190, f1: 120, dur: 0.13, vol: 0.16 });
          this._tone({ type: 'triangle', f0: 520, f1: 300, dur: 0.10, vol: 0.09 });
          break;
        //  ── 크게 맞았다 — 기존 타격음 위에 얹는 강조음 (2026-08-12) ──────────────
        //  ⚠ 이건 **대체가 아니라 오버레이**다. `hit`/`heroHurt`/유닛 목소리는 그대로
        //    나고, 그 위에 이 소리가 겹쳐서 "이번 건 크다"만 더한다. 그래서 짧고
        //    날카로운 고역(순간성) + 굵게 떨어지는 저역(무게)의 2겹으로 짧게 끝낸다 —
        //    `hit`의 3레이어보다 단순한 이유는 이미 울리고 있는 `hit`와 겹쳐 죽음을
        //    피하려는 것이다(둘 다 저역 톤을 길게 깔면 뭉갠다).
        //  ⚠ 게이트 90ms — 큰 피해가 연속으로 들어와도(광역기 다단히트 등) 뭉개지지
        //    않을 만큼만 막는다. `hit`(45ms)보다 넓게 잡은 이유는 이 소리가 이미
        //    `hit` 위에 얹히므로 지나치게 잦으면 배경음처럼 흔해져 "크다"는 뜻을 잃는다.
        case 'critHit':
          if (!this._gate('critHit', 90)) return;
          this._burst({ dur: 0.045, freq: 3600, q: 2.4, vol: 0.15, filter: 'highpass' });
          this._tone({ type: 'sawtooth', f0: 260, f1: 55, dur: 0.14, vol: 0.20 });
          break;
        //  ── 보스 등장 — 짧고 압도적인 포효 (2026-08-12) ──────────────────────
        //  ⚠ 용에게는 성대가 없다(래스터 자산일 뿐)지만, 소리는 "이 존재는 격이
        //    다르다"를 전해야 한다. 저역 스윕(70→40Hz, 0.5초)이 몸통, 고역 버스트가
        //    발톱이 긁는 순간의 트랜지언트, 중역 사각파가 포효의 거친 결이다.
        //    `boom`(폭발)과 겹치지 않도록 스윕 길이를 훨씬 길게(0.34→0.5) 잡아
        //    "터진다"가 아니라 "울린다"로 다르게 읽히게 했다.
        //  ⚠ 게이트 1200ms (2026-09-03) — battle.js 가 `create`(L113)와 `_setupBossIntro`
        //    (L1197)에서 **같은 프레임에 두 번** 부른다. 호출부가 하나로 정리되기 전까지
        //    여기서 막는다(파일 재생도 FILE_GATES 로 같은 값을 지킨다). 포효는 한 판에
        //    한 번이라 1.2초 게이트가 정상 재생을 막을 일은 없다.
        case 'bossRoar':
          if (!this._gate('bossRoar', 1200)) return;
          this._burst({ dur: 0.09, freq: 1500, q: 1.0, vol: 0.18, filter: 'highpass' });
          this._tone({ type: 'sawtooth', f0: 70, f1: 38, dur: 0.50, vol: 0.30 });
          this._later(0.05, function (s) {
            s._tone({ type: 'square', f0: 130, f1: 85, dur: 0.28, vol: 0.13 });
          });
          break;
        //  ── 보스 발구름 — 걸을 때마다 땅이 운다 (2026-08-23 생동화 4차) ────────
        //  ⚠ 걷는 내내 반복되므로 게이트 230ms + 짧게. 저역이 무게를, 짧은 중역
        //    버스트가 폰에서 들리는 몫을 맡는다(이 파일의 폰 스피커 규율 그대로).
        case 'bossStep':
          if (!this._gate('bossStep', 230)) return;
          this._burst({ dur: 0.03, freq: 900, q: 1.1, vol: 0.10 });
          this._tone({ type: 'sine', f0: 95, f1: 48, dur: 0.13, vol: 0.20 });
          break;
        //  ── 브레스 발사 — '분다'가 아니라 '뿜는다'. 거친 고역 바람 + 낮은 으르렁 ──
        case 'bossBreath':
          if (!this._gate('bossBreath', 300)) return;
          this._burst({ dur: 0.26, freq: 1200, q: 0.8, vol: 0.22, filter: 'highpass' });
          this._tone({ type: 'sawtooth', f0: 160, f1: 90, dur: 0.24, vol: 0.14 });
          break;
        //  ── 내리찍기 착지 — boom 보다 낮고 무겁게, 잔진동이 길게 남는다 ─────────
        case 'bossSlam':
          if (!this._gate('bossSlam', 300)) return;
          this._burst({ dur: 0.04, freq: 2100, q: 1.3, vol: 0.16, filter: 'highpass' });
          this._burst({ dur: 0.30, freq: 180, q: 0.7, vol: 0.34, filter: 'lowpass' });
          this._tone({ type: 'sine', f0: 95, f1: 34, dur: 0.40, vol: 0.26 });
          break;
        //  ── 스킬 모으기 — 예고가 켜지는 순간 낮게 차오른다(피하라는 신호이기도 하다) ──
        case 'bossCharge':
          if (!this._gate('bossCharge', 500)) return;
          this._tone({ type: 'sawtooth', f0: 60, f1: 120, dur: 0.42, vol: 0.15 });
          this._burst({ dur: 0.30, freq: 700, q: 1.6, vol: 0.08, filter: 'bandpass' });
          break;
        //  ── 시즌2 「다섯 세계」 사건음 (2026-09-03 2차 S-A) ─────────────────────
        //  시전음은 `playHeroFor('skill')` 로 통일됐다 — 여기는 **사건**(표식이 맞았다·
        //  사슬이 옮겨 붙었다·보스가 변했다·하늘이 쳤다·땅이 울렸다)만. 전부 합성이며
        //  tools/sfx-audit.js 규격(peak 0.05~0.29 · ≤0.7초) 안이다. 세계관 규율대로
        //  전자음 없음 — 뼈·바람·북·번개·흙.
        //  ⚠ 부르는 쪽은 battle.js 의 **렌더 관측**(이펙트·fieldFx 가 새로 생긴 프레임)이다.
        //    combat.js 에 호출을 심지 않는다 — 록스텝 시뮬은 소리를 몰라야 한다.
        case 'markHit':      // 표식 대상 적중 — 뼈 틱 + 짧은 하강 바람(찍힌 자리가 '터진다')
          if (!this._gate('markHit', 110)) return;
          this._burst({ dur: 0.035, freq: 1900, q: 2.4, vol: 0.13, filter: 'highpass' });
          this._sweep({ dur: 0.12, f0: 2600, f1: 900, q: 1.6, vol: 0.10 });
          this._tone({ type: 'triangle', f0: 420, f1: 210, dur: 0.08, vol: 0.08 });
          break;
        case 'chainHop':     // 영혼 사슬이 다음 대상으로 — 방울 한 톨 + 올라가는 바람(옮겨 붙었다)
          if (!this._gate('chainHop', 60)) return;
          this._tone({ type: 'triangle', f0: 1480, f1: 1400, dur: 0.06, vol: 0.07, attack: 0.002 });
          this._sweep({ dur: 0.09, f0: 900, f1: 2600, q: 1.8, vol: 0.09 });
          break;
        case 'phaseShift':   // 보스 페이즈 전환 — 낮은 북 + 위로 긁는 결(Music.sting 이 화음을 맡는다)
          if (!this._gate('phaseShift', 900)) return;
          this._burst({ dur: 0.05, freq: 1700, q: 1.2, vol: 0.14, filter: 'highpass' });
          this._tone({ type: 'sine', f0: 110, f1: 44, dur: 0.42, vol: 0.22 });
          this._sweep({ dur: 0.30, f0: 400, f1: 2400, q: 1.4, vol: 0.09, at: 0.05 });
          break;
        case 'bolt':         // 낙뢰 — 찢는 고역 트랜지언트 + 우르릉(폰에서는 앞 겹만 들린다)
          if (!this._gate('bolt', 300)) return;
          this._burst({ dur: 0.03, freq: 4200, q: 1.0, vol: 0.20, filter: 'highpass' });
          this._burst({ dur: 0.12, freq: 1300, q: 0.8, vol: 0.16 });
          this._burst({ dur: 0.42, freq: 140, q: 0.6, vol: 0.20, filter: 'lowpass', at: 0.06 });
          break;
        case 'quake':        // 지진 — 낮게 굴러가는 땅 + 돌 부딪는 고역 알갱이 둘
          if (!this._gate('quake', 700)) return;
          this._burst({ dur: 0.05, freq: 900, q: 1.2, vol: 0.12 });
          this._tone({ type: 'sine', f0: 70, f1: 38, dur: 0.48, vol: 0.22 });
          this._burst({ dur: 0.40, freq: 160, q: 0.5, vol: 0.14, filter: 'lowpass' });
          this._burst({ dur: 0.04, freq: 1500, q: 2.0, vol: 0.09, at: 0.18 });
          this._burst({ dur: 0.04, freq: 1200, q: 2.0, vol: 0.08, at: 0.31 });
          break;
        //  ── 보스 격파 — 크게 터진 뒤 상행 팡파르 (2026-08-12) ────────────────
        //  ⚠ `win`(일반 승리, 최고음 784Hz)과 **일부러 다르게** 잡았다 — 보스를
        //    잡았다는 특별함이 승리 팡파르에 묻히면 안 된다. 앞에 `boom` 재료를
        //    깔고 팡파르를 한 음(880Hz) 더 높고 한 박 느리게 얹어 "더 크다"를
        //    체감으로 준다. 다른 에이전트가 만드는 보스 처치 연출 화면이
        //    `SfxBank.Play("bossDown")` 으로 직접 부른다(보고서 참조).
        case 'bossDown':
          this._burst({ dur: 0.05, freq: 2200, q: 1.1, vol: 0.18, filter: 'highpass' });
          this._burst({ dur: 0.38, freq: 200, q: 0.6, vol: 0.32, filter: 'lowpass' });
          this._tone({ type: 'sine', f0: 120, f1: 40, dur: 0.38, vol: 0.22 });
          this._later(0.22, function (s) { s._tone({ type: 'triangle', f0: 523, dur: 0.16, vol: 0.20 }); });
          this._later(0.36, function (s) { s._tone({ type: 'triangle', f0: 659, dur: 0.16, vol: 0.20 }); });
          this._later(0.50, function (s) { s._tone({ type: 'triangle', f0: 880, dur: 0.36, vol: 0.25 }); });
          break;
        //  ── 저체력 긴박감 — 짧은 심장박동 (2026-08-12) ──────────────────────
        //  ⚠⚠ **반복 재생이라 게이트를 크게 잡는다**(950ms). 안 그러면 다른 소리를
        //    뭉갠다 — 이 파일 머리 규율("같은 소리가 한 프레임에 여러 번 겹치면
        //    귀가 아프다") 그대로다. 매 프레임 부르는 쪽(combat.js)에서 문턱만
        //    걸고 게이트는 여기서 건다 — 부르는 쪽이 쿨다운까지 챙기면 두 군데서
        //    따로 재는 시계가 어긋난다.
        //  ⚠ 전자음이 아니라 **낮은 사인파 두 번**(둥·둥)으로 심장박동을 흉내낸다.
        //    `heroHurt`(경고)와 같은 저역 대역이라 서로 헷갈리지 않는다 — 이건
        //    "맞았다"가 아니라 "위험하다"를 알리는 다른 신호다.
        case 'heroLowHp':
          if (!this._gate('heroLowHp', 950)) return;
          this._tone({ type: 'sine', f0: 92, f1: 55, dur: 0.09, vol: 0.18 });
          this._later(0.15, function (s) {
            s._tone({ type: 'sine', f0: 92, f1: 55, dur: 0.11, vol: 0.22 });
          });
          break;
        case 'click':        // 버튼
          this._tone({ type: 'square', f0: 620, f1: 880, dur: 0.045, vol: 0.10 });
          break;
        case 'win':          // 승리 — 상행 3음
          this._tone({ type: 'triangle', f0: 523, dur: 0.16, vol: 0.22 });
          this._later(0.13, function (s) { s._tone({ type: 'triangle', f0: 659, dur: 0.16, vol: 0.22 }); });
          this._later(0.27, function (s) { s._tone({ type: 'triangle', f0: 784, dur: 0.30, vol: 0.24 }); });
          break;
        //  ── 빵빠레 (2026-08-22 태현님: "드랍 얻으면 좀 더 축하하는 느낌") ──────────
        //  `win`(상행 3음)보다 길고 화려한 나팔식 팡파레: 따-따-따-딴~ + 화음 마무리.
        //  나팔 흉내는 sawtooth(배음 풍부) + 살짝 어긋난 옥타브 겹침이 만든다.
        //  ⚠ 1.1초로 끊는다 — 팝업 애니메이션(튕김 0.42s + 색종이)과 같이 끝나야
        //    "축하가 끝났는데 소리만 남는" 어색함이 없다.
        case 'fanfare':
          if (!this._gate('fanfare', 900)) return;
          this._tone({ type: 'sawtooth', f0: 523, dur: 0.11, vol: 0.15 });
          this._later(0.12, function (s) { s._tone({ type: 'sawtooth', f0: 523, dur: 0.09, vol: 0.13 }); });
          this._later(0.24, function (s) { s._tone({ type: 'sawtooth', f0: 659, dur: 0.11, vol: 0.15 }); });
          this._later(0.38, function (s) {
            //  마무리 화음(C-E-G) — 세 음을 동시에, 옥타브 위 반짝이 한 톨.
            s._tone({ type: 'sawtooth', f0: 523, dur: 0.55, vol: 0.12 });
            s._tone({ type: 'sawtooth', f0: 659, dur: 0.55, vol: 0.10 });
            s._tone({ type: 'sawtooth', f0: 784, dur: 0.55, vol: 0.12 });
            s._tone({ type: 'triangle', f0: 1568, dur: 0.40, vol: 0.08 });
          });
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
    this._parts(v[kind], p * j, 1, 0);
  },

  //  parts 해석기 — VOICE 와 HERO 가 **같은 문법**을 쓴다(두 벌이면 조용히 갈라진다).
  //   { t: { w, f0, f1, d, v, a(attack), at, bp:{f,q} } }   톤
  //   { b: { d, f, q, v, hp|lp, at } }                        버스트(노이즈+필터)
  //   { s: { d, f0, f1, q, v, at, hp|lp } }                   스윕(노이즈+필터 훑기)
  //  `pm` 은 피치 배수(체급 × 지터), `vm` 은 음량 배수, `at0` 은 전체 시작 오프셋.
  //  ⚠ 어떤 항목이 이상해도 조용히 넘어간다 — 소리 때문에 전투가 멈추면 안 된다.
  _parts: function (parts, pm, vm, at0) {
    if (!parts) return;
    var p = pm || 1, vmul = vm || 1, a0 = at0 || 0;
    try {
      for (var i = 0; i < parts.length; i++) {
        var q = parts[i];
        if (q.t) {
          this._tone({ type: q.t.w, f0: q.t.f0 * p, f1: (q.t.f1 || q.t.f0) * p,
                       dur: q.t.d, vol: q.t.v * vmul, attack: q.t.a, at: a0 + (q.t.at || 0),
                       bp: q.t.bp ? { f: q.t.bp.f * p, q: q.t.bp.q } : undefined });
        } else if (q.b) {
          this._burst({ dur: q.b.d, freq: q.b.f * p, q: q.b.q, vol: q.b.v * vmul, at: a0 + (q.b.at || 0),
                        filter: q.b.hp ? 'highpass' : (q.b.lp ? 'lowpass' : 'bandpass') });
        } else if (q.s) {
          this._sweep({ dur: q.s.d, f0: q.s.f0 * p, f1: q.s.f1 * p, q: q.s.q, vol: q.s.v * vmul,
                        at: a0 + (q.s.at || 0),
                        filter: q.s.hp ? 'highpass' : (q.s.lp ? 'lowpass' : 'bandpass') });
        }
      }
    } catch (e) { /* 소리 때문에 게임이 멈추면 안 된다 */ }
  },

  //  def 하나에서 바로 낸다 — 부르는 쪽이 재료를 몰라도 되게.
  playFor: function (kind, def) {
    if (!def || !def.voice) return;
    this.playUnit(kind, def.voice, def.voicePitch);
  },

  // ══ 영웅 팔레트 (2026-09-03 시즌2 S-S) ═══════════════════════════════════════
  //
  //  지금까지 영웅은 `hit`/`skill`/`heroHurt` 하나씩을 셋이 나눠 썼다 — 광전사의 대검과
  //  파수꾼의 창이 같은 '탁'이었다. 시즌2 에서 영웅이 다섯이 되며, **영웅 × 사건**
  //  25칸을 표로 갖는다. VOICE 와 같은 parts 문법이라 `_parts` 하나가 다 낸다.
  //
  //  재료 배정(영웅의 정체성이 소리에서도 읽혀야 한다):
  //   berserker 광전사 — stone/leather 둔탁. 돌이 살을 치는 '쿵'과 가죽의 '퍽'.
  //   hunter    사냥꾼 — 활 스윕. 시위 '텅' 없이(2026-08-23 결정) 바람만 겹으로.
  //   guardian  파수꾼 — bronze. 청동 창날·방패의 '텅~' 삼각파.
  //   shaman    주술사 — kick 형 sine 피치드롭(북) + 짧은 구호(포먼트) + 방울(고역 삼각파).
  //   stalker   암살자 — bone 고역 틱 + `_sweep` 바람(그림자 걸음은 **올라가는** 스윕).
  //
  //  ⚠ 폰 스피커 규율(위 `hit` 주석): 모든 칸에 **고역 트랜지언트 한 겹**이 있고,
  //    100Hz 아래는 헤드폰·진동 몫이지 폰에서 들릴 것으로 기대하지 않는다.
  //  ⚠ 길이 ≤0.9초(궁극 포함) — 전투 중 소리가 화면보다 오래 남으면 다음 사건을 덮는다.
  //  ⚠ hurt 의 주역 음량은 유닛 최대 v(0.20)÷1.35 이상이어야 한다 — "내가 맞고 있다"가
  //    유닛 소리에 묻히면 안 된다(tools/sfx-audit.js 가 잰다).
  //  ⚠ 게이트 키는 `h:art:kind` — `play()` 의 이름·FILES 와 절대 안 겹친다(파일이 합성을
  //    덮는 경로는 `play()` 뿐이고 playHero 는 그 경로를 안 탄다).
  HERO: {
    berserker: {
      hit:  [{ b: { d: 0.014, f: 2600, q: 2.2, v: 0.13, hp: 1 } },
             { b: { d: 0.09, f: 360, q: 0.8, v: 0.28, lp: 1 } },
             { t: { w: 'sine', f0: 155, f1: 70, d: 0.10, v: 0.16 } }],
      skill:[{ b: { d: 0.03, f: 1900, q: 1.2, v: 0.14, hp: 1 } },
             { b: { d: 0.16, f: 300, q: 0.7, v: 0.26, lp: 1 } },
             { t: { w: 'triangle', f0: 190, f1: 95, d: 0.18, v: 0.16 } }],
      //  궁극 — 돌 한 방 뒤에 가죽 북이 한 번 더 받는다(두 박)
      ult:  [{ b: { d: 0.04, f: 2100, q: 1.3, v: 0.16, hp: 1 } },
             { b: { d: 0.30, f: 220, q: 0.6, v: 0.30, lp: 1 } },
             { t: { w: 'sine', f0: 120, f1: 40, d: 0.36, v: 0.22 } },
             { b: { d: 0.12, f: 700, q: 0.9, v: 0.12, lp: 1, at: 0.18 } },
             { t: { w: 'triangle', f0: 160, f1: 80, d: 0.14, v: 0.12, at: 0.34 } }],
      hurt: [{ t: { w: 'square', f0: 190, f1: 120, d: 0.13, v: 0.16 } },
             { t: { w: 'triangle', f0: 520, f1: 300, d: 0.10, v: 0.09 } },
             { b: { d: 0.05, f: 600, q: 0.8, v: 0.08, lp: 1 } }],
      die:  [{ t: { w: 'sine', f0: 320, f1: 90, d: 0.30, v: 0.16 } },
             { b: { d: 0.20, f: 240, q: 0.5, v: 0.14, lp: 1 } },
             { b: { d: 0.08, f: 1400, q: 2.0, v: 0.06, at: 0.12 } }]
    },
    hunter: {
      hit:  [{ s: { d: 0.11, f0: 3200, f1: 700, q: 1.6, v: 0.13 } }],
      skill:[{ s: { d: 0.18, f0: 2400, f1: 900, q: 1.4, v: 0.14 } },
             { t: { w: 'triangle', f0: 480, f1: 720, d: 0.14, v: 0.09 } }],
      //  궁극 — 화살비: 스윕 세 겹이 시차를 두고 떨어진다
      ult:  [{ b: { d: 0.05, f: 1600, q: 1.1, v: 0.12, hp: 1 } },
             { s: { d: 0.30, f0: 4200, f1: 600, q: 1.2, v: 0.16 } },
             { s: { d: 0.26, f0: 3600, f1: 500, q: 1.4, v: 0.12, at: 0.10 } },
             { s: { d: 0.24, f0: 3000, f1: 450, q: 1.4, v: 0.10, at: 0.20 } },
             { t: { w: 'triangle', f0: 330, f1: 140, d: 0.12, v: 0.10, at: 0.30 } }],
      hurt: [{ t: { w: 'square', f0: 190, f1: 120, d: 0.13, v: 0.16 } },
             { t: { w: 'triangle', f0: 560, f1: 320, d: 0.09, v: 0.09 } },
             { s: { d: 0.06, f0: 2000, f1: 900, q: 1.6, v: 0.07 } }],
      die:  [{ t: { w: 'triangle', f0: 520, f1: 170, d: 0.22, v: 0.14 } },
             { s: { d: 0.24, f0: 1800, f1: 300, q: 1.2, v: 0.09 } }]
    },
    guardian: {
      hit:  [{ t: { w: 'triangle', f0: 660, f1: 430, d: 0.11, v: 0.15 } },
             { b: { d: 0.03, f: 1800, q: 2.4, v: 0.10, hp: 1 } },
             { t: { w: 'sine', f0: 160, f1: 90, d: 0.08, v: 0.10 } }],
      skill:[{ t: { w: 'triangle', f0: 520, f1: 380, d: 0.20, v: 0.14 } },
             { b: { d: 0.03, f: 2200, q: 2.0, v: 0.10, hp: 1 } },
             { t: { w: 'sine', f0: 260, f1: 130, d: 0.18, v: 0.10 } }],
      //  궁극 — 청동이 크게 울리고 두 번 되울린다
      ult:  [{ b: { d: 0.04, f: 2000, q: 1.3, v: 0.14, hp: 1 } },
             { t: { w: 'triangle', f0: 600, f1: 200, d: 0.34, v: 0.16 } },
             { b: { d: 0.28, f: 200, q: 0.7, v: 0.26, lp: 1 } },
             { t: { w: 'triangle', f0: 660, f1: 430, d: 0.12, v: 0.10, at: 0.16 } },
             { t: { w: 'triangle', f0: 660, f1: 430, d: 0.12, v: 0.10, at: 0.30 } }],
      hurt: [{ t: { w: 'square', f0: 190, f1: 120, d: 0.13, v: 0.16 } },
             { t: { w: 'triangle', f0: 520, f1: 380, d: 0.08, v: 0.09 } },
             { b: { d: 0.03, f: 1900, q: 2.0, v: 0.06, hp: 1 } }],
      die:  [{ t: { w: 'triangle', f0: 600, f1: 200, d: 0.30, v: 0.14 } },
             { b: { d: 0.20, f: 260, q: 0.6, v: 0.12, lp: 1 } },
             { t: { w: 'triangle', f0: 400, f1: 150, d: 0.16, v: 0.07, at: 0.14 } }]
    },
    shaman: {
      //  북(sine 피치드롭) + 방울 한 톨. 마법음이 아니라 **물건 소리**여야 한다.
      hit:  [{ t: { w: 'sine', f0: 150, f1: 46, d: 0.14, v: 0.18 } },
             { b: { d: 0.02, f: 2200, q: 1.0, v: 0.10, hp: 1 } },
             { t: { w: 'triangle', f0: 1980, f1: 1880, d: 0.05, v: 0.06, a: 0.002 } }],
      //  스킬 — 북 + 짧은 구호('아' 포먼트 720Hz) + 방울 둘
      skill:[{ t: { w: 'sine', f0: 140, f1: 50, d: 0.18, v: 0.16 } },
             { b: { d: 0.02, f: 2400, q: 1.0, v: 0.08, hp: 1 } },
             { t: { w: 'sawtooth', f0: 196, d: 0.18, v: 0.10, a: 0.04, bp: { f: 720, q: 3.0 } } },
             { t: { w: 'triangle', f0: 2960, f1: 2860, d: 0.06, v: 0.06, a: 0.002, at: 0.06 } },
             { t: { w: 'triangle', f0: 1980, f1: 1900, d: 0.06, v: 0.05, a: 0.002, at: 0.11 } }],
      //  궁극 — 큰 북 + 두 포먼트 구호 + 방울 셋 + 북 되울림
      ult:  [{ t: { w: 'sine', f0: 130, f1: 40, d: 0.36, v: 0.22 } },
             { b: { d: 0.03, f: 1900, q: 1.2, v: 0.14, hp: 1 } },
             { t: { w: 'sawtooth', f0: 165, d: 0.40, v: 0.12, a: 0.05, bp: { f: 720, q: 3.0 } } },
             { t: { w: 'sawtooth', f0: 165, d: 0.40, v: 0.06, a: 0.05, bp: { f: 1180, q: 4.0 } } },
             { t: { w: 'triangle', f0: 1980, f1: 1900, d: 0.07, v: 0.06, a: 0.002, at: 0.18 } },
             { t: { w: 'triangle', f0: 2960, f1: 2860, d: 0.07, v: 0.06, a: 0.002, at: 0.30 } },
             { t: { w: 'triangle', f0: 2480, f1: 2400, d: 0.07, v: 0.05, a: 0.002, at: 0.42 } },
             { t: { w: 'sine', f0: 110, f1: 40, d: 0.30, v: 0.16, at: 0.40 } }],
      hurt: [{ t: { w: 'square', f0: 190, f1: 120, d: 0.13, v: 0.16 } },
             { t: { w: 'triangle', f0: 520, f1: 300, d: 0.10, v: 0.09 } },
             { t: { w: 'triangle', f0: 2400, f1: 2100, d: 0.04, v: 0.05, a: 0.002 } }],
      //  죽음 — 북이 미끄러지고 구호가 꺼지고 방울이 흩어진다
      die:  [{ t: { w: 'sine', f0: 400, f1: 70, d: 0.32, v: 0.14 } },
             { t: { w: 'sawtooth', f0: 147, f1: 110, d: 0.30, v: 0.09, a: 0.03, bp: { f: 720, q: 3.0 } } },
             { t: { w: 'triangle', f0: 2600, f1: 2500, d: 0.06, v: 0.05, a: 0.002, at: 0.10 } },
             { t: { w: 'triangle', f0: 2100, f1: 2000, d: 0.06, v: 0.05, a: 0.002, at: 0.18 } },
             { t: { w: 'triangle', f0: 1700, f1: 1600, d: 0.06, v: 0.04, a: 0.002, at: 0.28 } }]
    },
    stalker: {
      hit:  [{ b: { d: 0.03, f: 1600, q: 2.6, v: 0.14, hp: 1 } },
             { s: { d: 0.07, f0: 2600, f1: 1200, q: 1.8, v: 0.10 } },
             { t: { w: 'triangle', f0: 300, f1: 140, d: 0.06, v: 0.09 } }],
      //  그림자 걸음 — **올라가는** 바람. 내려가는 것(화살)과 반대라 서로 안 헷갈린다.
      skill:[{ s: { d: 0.16, f0: 900, f1: 4200, q: 1.6, v: 0.13 } },
             { b: { d: 0.02, f: 3000, q: 2.0, v: 0.08, hp: 1 } }],
      //  처형 — 뼈 틱 → 바람 → 한 방(critHit 재료) → 바람 꼬리
      ult:  [{ b: { d: 0.04, f: 1600, q: 2.6, v: 0.16, hp: 1 } },
             { s: { d: 0.12, f0: 3800, f1: 800, q: 1.6, v: 0.14 } },
             { t: { w: 'sawtooth', f0: 260, f1: 55, d: 0.16, v: 0.18, at: 0.08 } },
             { b: { d: 0.045, f: 3600, q: 2.4, v: 0.14, hp: 1, at: 0.08 } },
             { s: { d: 0.20, f0: 1800, f1: 400, q: 1.2, v: 0.09, at: 0.20 } }],
      hurt: [{ t: { w: 'square', f0: 190, f1: 120, d: 0.13, v: 0.16 } },
             { b: { d: 0.04, f: 1300, q: 2.2, v: 0.08, hp: 1 } },
             { t: { w: 'triangle', f0: 520, f1: 300, d: 0.08, v: 0.08 } }],
      die:  [{ b: { d: 0.10, f: 1100, q: 1.6, v: 0.10, hp: 1 } },
             { s: { d: 0.30, f0: 2400, f1: 300, q: 1.2, v: 0.11 } },
             { t: { w: 'triangle', f0: 420, f1: 120, d: 0.22, v: 0.11 } }]
    }
  },
  //  사건별 게이트(ms) — hit/hurt 는 기존 `hit`(45)·`heroHurt`(220)와 같은 값.
  //  ult 는 한 판에 몇 번 안 나오지만 다단히트 예고가 겹쳐 두 번 부를 수 있어 400.
  HERO_GATES: { hit: 45, skill: 120, ult: 400, hurt: 220, die: 300 },

  //  영웅 소리. kind ∈ hit|skill|ult|hurt|die, art = def.art(berserker|hunter|guardian|
  //  shaman|stalker). `extra` = { pitch, vol, at } (전부 선택 — 협동전에서 파트너 영웅을
  //  vol 0.6 으로 낮추는 식). 모르는 art·kind 는 **조용히** 무시한다(폴백 없음 —
  //  폴백을 두면 새 영웅에 표를 안 채워도 소리가 나서 누락을 못 잡는다; sfx-audit 가 센다).
  playHero: function (kind, art, extra) {
    if (!this._ready || !this.enabled) return false;
    var h = this.HERO[art];
    if (!h || !h[kind]) return false;
    var gap = this.HERO_GATES[kind] || 100;
    if (!this._gate('h:' + art + ':' + kind, gap)) return false;
    var x = extra || {};
    //  ±3% 지터 — 영웅은 유닛(±4%)보다 살짝 덜 흔든다(주인공 소리는 안정감이 있어야 한다).
    var j = 1 + (Math.random() * 2 - 1) * 0.03;
    this._parts(h[kind], (x.pitch || 1) * j, x.vol || 1, x.at || 0);
    return true;
  },

  //  유닛 def 에서 바로 — `playFor` 의 영웅판. def.art 가 HERO 에 없으면 false.
  playHeroFor: function (kind, def, extra) {
    if (!def || !def.art) return false;
    return this.playHero(kind, def.art, extra);
  }
};

// ============================================================================
//  GAME.Feel — 게임필 **순수 함수** 모음 (2026-09-02 C 갈래)
//
//  battle.js(슬로모·이모트)·main.js(에러 오버레이)가 쓰는 판정을 씬 밖으로 뺀 것이다.
//  두 파일은 Phaser 없이는 안 실리므로 헤드리스(tools/feel-audit.js)가 이 판정을
//  경계값까지 검사할 수 있는 유일한 길이 여기다. 상태를 갖지 않는다(errorGate 만
//  자기 클로저를 만든다) — 씬에 얹는 상태는 씬이 init 에서 되돌린다.
// ============================================================================
GAME.Feel = {
  //  ── 결정타 슬로모 ─────────────────────────────────────────────────────────
  //  판이 끝나는 순간(마지막 처치·영웅 사망) 0.45초 동안 렌더 시간을 0.35배로.
  //  ⚠ 실시간(록스텝)은 시뮬 틱에 **원래 delta** 를 넘긴다 — 여기 배율은 렌더·이펙트용.
  SLOWMO_MS: 450,
  SLOWMO_SCALE: 0.35,
  //  ── 마무리 슬로모 (2026-09-05 태현님 ①) ──────────────────────────────────
  //  "때리는 모션부터 슬로우가 더 걸리면서 확대되고 … 여기에 1.5초정도를 슬로우로 써도돼"
  //  마지막 한 기를 잡는 순간은 판에서 **딱 한 번뿐인 장면**이라 일반 슬로모(0.45초·0.35배)
  //  보다 길고 깊게 간다. 막타는 타격 순간에 잡히므로 이 시점부터 늦추면 휘두른 무기의
  //  잔여 동작·노른자·폭발이 전부 느리게 흐른다(= "때리는 모션부터").
  //  ⚠ **이긴 판에서만** 건다(태현님: "졌을땐 없애"). 부르는 쪽이 거른다.
  FINISH_SLOWMO_MS: 1500,
  FINISH_SLOWMO_SCALE: 0.22,
  //  남은 슬로모(ms) → 이번 프레임 배율. 0 이하·NaN 이면 정상 속도.
  //  `scale` 을 주면 그 값을 쓴다(마무리용 — 안 주면 예전 그대로).
  slowmoScale: function (remainMs, scale) {
    if (!(typeof remainMs === 'number' && remainMs > 0)) return 1;
    return (typeof scale === 'number' && scale > 0 && scale < 1) ? scale : this.SLOWMO_SCALE;
  },
  //  남은 슬로모를 **실제 경과 시간**으로 줄인다(배율이 걸린 dt 로 줄이면 3배 길어진다).
  slowmoStep: function (remainMs, realDelta) {
    var r = (typeof remainMs === 'number' && remainMs > 0) ? remainMs : 0;
    var d = (typeof realDelta === 'number' && realDelta > 0) ? realDelta : 0;
    return Math.max(0, r - d);
  },

  //  ── 실시간 이모트 ─────────────────────────────────────────────────────────
  EMOTES: ['😀', '👍', '😱', '🔥'],
  EMOTE_COOL: 2000,     // 스팸 방지 — 한 사람이 2초에 하나
  EMOTE_SHOW: 1600,     // 말풍선이 떠 있는 시간
  //  상대가 보낸 값은 믿지 않는다 — 0..3 정수만 이모트다.
  emoteValid: function (k) {
    return typeof k === 'number' && isFinite(k) && k === Math.floor(k) &&
           k >= 0 && k < this.EMOTES.length;
  },
  //  쿨 판정 — 마지막 전송 시각과 지금(둘 다 같은 시계, ms).
  emoteAllowed: function (lastAt, now, cool) {
    var c = (typeof cool === 'number') ? cool : this.EMOTE_COOL;
    if (typeof lastAt !== 'number' || !isFinite(lastAt)) return true;
    return (now - lastAt) >= c;
  },

  //  ── 에러 오버레이 "같은 에러는 1회만" ──────────────────────────────────────
  //  서명은 문구·파일·줄 번호로 만든다. 루프가 살아 있는 채 같은 자리가 매 프레임
  //  터지면 오버레이가 프레임마다 다시 뜨는 것을 이 게이트가 막는다.
  errorSig: function (msg, src, line) {
    return String(msg === undefined || msg === null ? '' : msg).slice(0, 200) + '|' +
           String(src === undefined || src === null ? '' : src).slice(-80) + '|' +
           String(line === undefined || line === null ? '' : line);
  },
  //  게이트 하나를 만든다: 처음 보는 서명이면 true, 이미 봤으면 false.
  errorGate: function () {
    var seen = {};
    return function (sig) {
      if (seen[sig]) return false;
      seen[sig] = true;
      return true;
    };
  }
};
