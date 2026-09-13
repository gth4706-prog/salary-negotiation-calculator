// 밸런스 실측 — 봇끼리 N판. 규칙이 「맞긴 맞는 게임」인지 숫자로 본다.
globalThis.window = globalThis;
require('../js/core.js');

//  눈금을 환경변수로 돌린다 — 규칙 하나하나가 판을 어떻게 바꾸는지 재려고 만들었다.
//    RANGE=0 SENSE=2 BLUR=1 NOISE=2 node blackout/tests/balance.js 2000
if (process.env.RANGE !== undefined) BO.Core.C.RANGE = +process.env.RANGE;
if (process.env.SENSE !== undefined) BO.Core.C.SENSE = +process.env.SENSE;
if (process.env.BLUR  !== undefined) BO.Core.C.NOISE_BLUR = +process.env.BLUR;
if (process.env.NOISE !== undefined) BO.Core.C.NOISE_TURNS = +process.env.NOISE;
if (process.env.MAXT  !== undefined) BO.Core.C.MAX_TURNS = +process.env.MAXT;

require('../js/bot.js');
var C = BO.Core;

function game(seed) {
  var st = C.create(seed);
  var shots = 0, hits = 0, bumps = 0, marks = 0, steps = 0, firstHit = null;
  var guard = 0;
  while (!st.over && guard++ < 400) {
    var side = st.side, ev = [];
    st.ev = [];
    //  실전(match.js)과 같은 리듬: 한 수 두고, 결과를 보고, 다음 수를 정한다.
    var inner = 0;
    while (st.ap > 0 && !st.over && inner++ < 8) {
      var a = BO.Bot.think(st, side);
      if (!a) break;
      var err = C.act(st, side, a);
      if (err) return { err: err + ' (' + JSON.stringify(a) + ')' };
    }
    ev = st.ev.slice();
    C.endTurn(st);
    ev = ev.concat(st.ev.slice(ev.length));
    var r = { ok: true, ev: ev };
    for (var i = 0; i < r.ev.length; i++) {
      var e = r.ev[i];
      if (e.k === 'hit') { hits++; shots++; if (firstHit === null) firstHit = st.turn; }
      else if (e.k === 'miss') shots++;
      else if (e.k === 'bump') bumps++;
      else if (e.k === 'mark') marks++;
      else if (e.k === 'step') steps++;
    }
  }
  return { turns: st.turn, reason: st.reason, winner: st.winner,
           hp: [st.ps[0].hp, st.ps[1].hp], shots: shots, hits: hits,
           bumps: bumps, marks: marks, steps: steps, firstHit: firstHit };
}

var N = parseInt(process.argv[2] || '2000', 10);
var agg = { kill: 0, timeup: 0, shots: 0, hits: 0, bumps: 0, marks: 0, steps: 0,
            turns: 0, draws: 0, w0: 0, firstHits: [], dmgTotal: 0, err: 0 };
for (var s = 1; s <= N; s++) {
  var g = game(s * 7919);
  //  ⚠ 규칙 오류는 **크게** 실패한다. 조용히 세고 넘어가면 「오류가 난 판은 통계에서
  //    빠진다」가 되어 숫자가 거짓말을 한다(실제로 한 번 그렇게 속았다).
  if (g.err) { console.error('규칙 오류 — 씨앗 ' + (s * 7919) + ': ' + g.err); process.exit(1); }
  agg[g.reason]++;
  agg.shots += g.shots; agg.hits += g.hits; agg.bumps += g.bumps;
  agg.marks += g.marks; agg.steps += g.steps; agg.turns += g.turns;
  agg.dmgTotal += (10 - g.hp[0] - g.hp[1]);
  if (g.winner === -1) agg.draws++; else if (g.winner === 0) agg.w0++;
  if (g.firstHit !== null) agg.firstHits.push(g.firstHit);
}
function pct(a, b) { return (100 * a / b).toFixed(1) + '%'; }
var fh = agg.firstHits.slice().sort(function (a, b) { return a - b; });
console.log('규칙            ', '사거리 ' + (C.C.RANGE || '무제한') + ' · 인기척 ' + C.C.SENSE +
            ' · 총성 ' + C.C.NOISE_TURNS + '턴/흐림 ' + C.C.NOISE_BLUR + ' · 제한 ' + C.C.MAX_TURNS + '턴');
console.log('판수            ', N);
console.log('격추로 끝난 판  ', agg.kill, pct(agg.kill, N));
console.log('시간초과로 끝난 판', agg.timeup, pct(agg.timeup, N));
console.log('무승부          ', agg.draws, pct(agg.draws, N));
console.log('선공 승률       ', pct(agg.w0, N), '(무승부 포함 전체 대비)');
console.log('평균 턴수       ', (agg.turns / N).toFixed(1));
console.log('평균 사격/판    ', (agg.shots / N).toFixed(1));
console.log('명중률          ', pct(agg.hits, agg.shots));
console.log('평균 피해량/판  ', (agg.dmgTotal / N).toFixed(2), '(둘 합쳐 최대 10)');
console.log('첫 명중 턴 중앙값', fh.length ? fh[fh.length >> 1] : '—',
            '· 한 번도 못 맞힌 판', pct(N - fh.length, N));
console.log('평균 발자국/판  ', (agg.marks / N).toFixed(2));
console.log('평균 페인트밟기/판', (agg.steps / N).toFixed(2));
console.log('평균 충돌/판    ', (agg.bumps / N).toFixed(2));
