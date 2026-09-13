window.BO = window.BO || {};

// 소리. 파일을 안 쓴다 — 어둠 게임에 6MB 짜리 mp3 를 들고 다닐 이유가 없고,
// 에그워에서 오디오 자산이 첫 로딩을 제일 많이 잡아먹었다. WebAudio 로 만든다.
// ⚠ 브라우저는 사람이 한 번 건드리기 전에는 소리를 못 낸다. 첫 탭에서 깨운다.
// ⚠ 여기의 Math.random 은 소리 결(노이즈)에만 쓴다. 게임 상태와는 무관하다.
BO.Sfx = (function () {
  var ctx = null, on = true, noiseBuf = null;
  try { on = localStorage.getItem('blackout.mute') !== '1'; } catch (e) {}

  function wake() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (AC) { try { ctx = new AC(); } catch (e) { ctx = null; } }
  }

  //  f0→f1 로 미끄러지는 짧은 음 하나.
  function blip(f0, f1, dur, type, vol, delay) {
    if (!on || !ctx) return;
    var t = ctx.currentTime + (delay || 0);
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol || 0.07, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  //  «철퍽» — 잡음을 저역 필터로 뭉갠 것. 페인트가 튀는 소리는 음이 아니라 결이다.
  function splash(dur, vol, cutoff, delay) {
    if (!on || !ctx) return;
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      var data = noiseBuf.getChannelData(0);
      for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    var t = ctx.currentTime + (delay || 0);
    var src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf;
    f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff || 1200, t);
    f.frequency.exponentialRampToValueAtTime(200, t + dur);
    g.gain.setValueAtTime(vol || 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(ctx.destination);
    src.start(t); src.stop(t + dur + 0.02);
  }

  var BANK = {
    shot:  function () { blip(420, 120, 0.09, 'square', 0.05); },
    splat: function () { splash(0.18, 0.10, 1600); },
    //  맞혔다: 밝게 «띵—철퍽»
    hit:   function () { blip(900, 300, 0.16, 'sawtooth', 0.09); blip(1200, 1800, 0.12, 'sine', 0.06, 0.05); },
    //  맞았다: 무겁게 «쿵—우웅». 소리만으로도 «내가 맞았다»가 구분되어야 한다.
    hurt:  function () { blip(180, 50, 0.35, 'sawtooth', 0.14); splash(0.30, 0.16, 500); blip(90, 40, 0.5, 'triangle', 0.10, 0.03); },
    bump:  function () { blip(140, 70, 0.16, 'triangle', 0.13); splash(0.08, 0.06, 400); },
    clue:  function () { blip(660, 880, 0.10, 'sine', 0.06); },
    spot:  function () { blip(520, 1040, 0.14, 'sine', 0.07); blip(1040, 1300, 0.10, 'sine', 0.05, 0.1); },
    turn:  function () { blip(520, 520, 0.06, 'sine', 0.05); },
    lamp:  function () { blip(300, 1200, 0.22, 'square', 0.08); },   // 딸깍—탁, 불 들어오는 소리
    win:   function () { blip(523, 1046, 0.30, 'triangle', 0.10); },
    lose:  function () { blip(330, 110, 0.45, 'triangle', 0.10); }
  };

  return {
    wake: wake,
    play: function (k) { if (BANK[k]) { wake(); BANK[k](); } },
    muted: function () { return !on; },
    toggle: function () {
      on = !on;
      try { localStorage.setItem('blackout.mute', on ? '0' : '1'); } catch (e) {}
      return on;
    }
  };
})();
