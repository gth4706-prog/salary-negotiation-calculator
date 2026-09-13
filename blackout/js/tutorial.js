window.BO = window.BO || {};

// ============================================================================
//  블랙아웃 — **튜토리얼**. 규칙을 읽게 하지 않고 **손으로 한 번씩 해 보게** 한다.
//
//  숨김 정보 게임은 글로 설명하면 안 와닿는다. 「발자국이 남는다」는 문장보다
//  «맞힌 상대가 한 칸 움직여 발자국이 찍히는 걸 내 눈으로 보는 것»이 낫다.
//  그래서 봇을 가르치는 상대(bot.js 의 tutorial 모드: 안 쏘고, 묻으면 한 칸만
//  움직인다)로 두고, 단계마다 «이걸 해 보세요» 를 띄운 뒤 실제로 그 사건이 나면
//  다음으로 넘긴다. 턴 시계는 끈다 — 읽을 시간을 준다.
//
//  단계는 사건(Core 의 ev)과 화면 상태(view)로만 판정한다. 상태 원본은 안 본다.
// ============================================================================
BO.Tutorial = (function () {
  var SEED = 20260913 >>> 0;       // 판을 고정한다 — 설명이 화면과 늘 맞아야 한다
  var steps = [
    { id: 'intro', text: '불이 꺼졌습니다. 8×8 방. 당신(청록)은 위쪽 2줄, 상대(분홍)는 아래쪽 2줄 어딘가. 보이는 건 손전등 줄기처럼 당신이 바라보는 쪽 앞 두 칸뿐 — 가구도 상대도 그 안에 들어와야 보입니다. 한 턴에 행동 2번.', next: true },
    { id: 'move', text: '① 이동 — [🏃 이동] 상태에서 방향키를 누르거나 옆 칸을 짚고 [이동 확정]. 움직인 방향 앞 두 칸이 보입니다. 모르는 칸으로 가다 가구에 부딪히면 행동 하나를 잃고 그쪽을 보게 됩니다.',
      done: function (ev, byMe, v) { return !!(v && v.myTurn && v.moves > 0); } },
    { id: 'shoot', text: '② 사격 — [🎯 사격]으로 바꾸고 아무 칸이나 짚은 뒤 [발사]. 페인트는 야광이라 판이 끝날 때까지 남고, 튄 자리에 있던 것의 윤곽이 야광선으로 드러납니다. 얼룩을 밟으면 신발에 묻어 발자국을 남기게 됩니다.',
      done: function (ev, byMe) { return !!(ev && byMe && (ev.k === 'miss' || ev.k === 'hit')); } },
    { id: 'lamp', text: '③ 전등 — 바닥의 버튼(🔘)까지 걸어가 밟아 보세요. 불이 켜지고 방 전체와 상대가 보입니다. ⚠ 첫 행동으로 켜야 둘째 행동으로 쏠 수 있습니다.',
      done: function (ev, byMe) { return !!(ev && byMe && ev.k === 'lamp'); } },
    { id: 'lampshot', text: '④ 불빛 아래 — 상대가 보입니다. [🎯 사격]으로 상대 칸을 짚고 [발사]! 행동 하나가 지나면 다시 꺼지지만, 본 가구는 기억합니다.',
      done: function (ev, byMe) { return !!(ev && byMe && ev.k === 'hit'); } },
    { id: 'mark', text: '⑤ 야광과 발자국 — 맞은 순간 상대가 야광에 젖어 보였죠. 다음 턴엔 다시 어둠이지만, 신발의 야광 때문에 한 칸만 움직이면 발을 뗀 칸에 발자국이 남습니다. 턴을 넘기고 지켜보세요.',
      done: function (ev, byMe) { return !!(ev && !byMe && ev.k === 'mark'); } },
    { id: 'track', text: '⑥ 추적 — 발자국 바로 옆 칸 어딘가에 있습니다. 후보를 골라 쏘세요. 맞히면 그 턴 동안 보이니 한 발 더!',
      done: function (ev, byMe) { return !!(ev && byMe && ev.k === 'hit'); } },
    { id: 'end', text: '끝. 핵심 넷 — 바라보는 쪽 두 칸만 보인다 · 야광 얼룩은 지워지지 않는다 · 맞으면 그 턴엔 보이고 다음 턴엔 어둠, 발자국을 조심 · 모르겠으면 버튼. 이제 실전으로.', next: true, final: true }
  ];
  var i = -1, active = false, api = null, els = null;

  function $(id) { return document.getElementById(id); }

  function start(hooks) {
    api = hooks || {};
    els = { box: $('tut'), step: $('tut-step'), text: $('tut-text'), next: $('tut-next'), skip: $('tut-skip') };
    els.next.onclick = function () { if (steps[i].final) finish(true); else advance(); };
    els.skip.onclick = function () { finish(false); };
    active = true; i = -1;
    advance();
  }

  function show() {
    var s = steps[i];
    els.box.classList.remove('hide');
    els.box.querySelector('.tut-card').classList.remove('done');
    els.step.textContent = '튜토리얼 ' + (i + 1) + ' / ' + steps.length;
    els.text.textContent = s.text;
    els.next.textContent = s.final ? '실전으로' : '다음';
    els.next.classList.toggle('hide', !s.next);
    els.skip.textContent = s.final ? '연습 계속' : '건너뛰기';
    if (s.final) els.skip.onclick = function () { finish(false); };
  }

  function advance() {
    i++;
    if (i >= steps.length) { finish(true); return; }
    show();
  }

  //  사건이 «해냈다»에 해당하면 잠깐 ✓ 를 보이고 다음 단계로.
  function done() {
    var card = els.box.querySelector('.tut-card');
    card.classList.add('done');
    els.text.textContent = '✓ ' + els.text.textContent;
    setTimeout(function () { if (active) advance(); }, 900);
    BO.Sfx.play('clue');
  }

  function onEvents(evs, byMe) {
    if (!active || i < 0 || i >= steps.length) return;
    var s = steps[i];
    if (!s.done || s._hit) return;
    for (var k = 0; k < evs.length; k++) {
      if (s.done(evs[k], byMe, null)) { s._hit = true; done(); return; }
    }
  }

  function onRender(v) {
    if (!active || i < 0 || i >= steps.length) return;
    if (v && v.over) { finish(false); return; }
    var s = steps[i];
    if (!s.done || s._hit) return;
    if (s.done(null, true, v)) { s._hit = true; done(); }
  }

  function finish(toLobby) {
    if (!active) return;
    active = false;
    for (var k = 0; k < steps.length; k++) steps[k]._hit = false;
    if (els && els.box) els.box.classList.add('hide');
    BO.Bot.setMode('normal');
    if (api && (toLobby ? api.done : api.keepPlaying)) (toLobby ? api.done : api.keepPlaying)();
  }

  function stop() {
    active = false;
    for (var k = 0; k < steps.length; k++) steps[k]._hit = false;
    if (els && els.box) els.box.classList.add('hide');
  }

  return { SEED: SEED, start: start, stop: stop, onEvents: onEvents, onRender: onRender,
           active: function () { return active; }, stepIndex: function () { return i; } };
})();
