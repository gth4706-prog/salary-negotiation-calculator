window.BO = window.BO || {};

// 소리. 파일을 안 쓴다 — 어둠 게임에 6MB 짜리 mp3 를 들고 다닐 이유가 없고,
// 에그워에서 오디오 자산이 첫 로딩을 제일 많이 잡아먹었다. WebAudio 로 만든다.
// ⚠ 브라우저는 사람이 한 번 건드리기 전에는 소리를 못 낸다. 첫 탭에서 깨운다.
BO.Sfx = (function () {
  var ctx = null, on = true;
  try { on = localStorage.getItem('blackout.mute') !== '1'; } catch (e) {}

  function wake() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (AC) { try { ctx = new AC(); } catch (e) { ctx = null; } }
  }

  //  f0→f1 로 미끄러지는 짧은 음 하나. 이 게임의 소리는 전부 이것의 조합이다.
  function blip(f0, f1, dur, type, vol) {
    if (!on || !ctx) return;
    var t = ctx.currentTime;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol || 0.07, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  var BANK = {
    shot:  function () { blip(420, 120, 0.09, 'square', 0.05); },
    hit:   function () { blip(900, 300, 0.16, 'sawtooth', 0.09); },
    hurt:  function () { blip(200,  70, 0.30, 'sawtooth', 0.11); },
    bump:  function () { blip(140, 200, 0.14, 'triangle', 0.10); },
    clue:  function () { blip(660, 880, 0.10, 'sine', 0.06); },
    turn:  function () { blip(520, 520, 0.06, 'sine', 0.05); },
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
