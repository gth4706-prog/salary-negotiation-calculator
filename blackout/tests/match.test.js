// A terminal shot must reach the other client, including the first action.
var vm = require('vm'), fs = require('fs'), path = require('path'), assert = require('assert');
function client(mine) {
  var box = { console: console, setInterval: function () { return 1; },
    clearInterval: function () {}, setTimeout: function () { return 1; }, clearTimeout: function () {} };
  box.window = box; vm.createContext(box);
  ['rooms', 'core', 'match'].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/' + f + '.js'), 'utf8'), box);
  });
  var rawCreate = box.BO.Core.create;
  box.BO.Core.create = function (seed) {
    var st = rawCreate(seed); st.room.rows = Array(10).fill('..........'); st.room.objects = [];
    st.ps = [{ x: 0, y: 0, hp: 5, painted: false }, { x: 5, y: 5, hp: 1, painted: false }];
    st.side = 0; st.lamp = null; return st;
  };
  box.sent = []; box.ended = 0;
  box.BO.Net = { relay: function (message) { box.sent.push(JSON.parse(JSON.stringify(message))); } };
  box.BO.Match.start({ seed: 1, mine: mine, vsBot: false,
    on: { end: function () { box.ended++; } } });
  return box;
}
var a = client(0), b = client(1);
assert.strictEqual(a.BO.Match.doAct(['s', 5, 5]), null);
//  v0.4: 행동 하나는 그 즉시 `a` 로 나가고, 턴 확정이 `t` 로 한 번 더 나간다(해시 포함).
//  이기는 한 발이면 둘 다 나가야 한다 — `a` 는 상대 화면에 바로 보이기 위해,
//  `t` 는 턴을 닫고 해시를 맞추기 위해.
assert.strictEqual(a.sent.length, 2, 'Final shot sends the action and then the turn');
assert.strictEqual(a.sent[0].t, 'a'); assert.strictEqual(a.sent[1].t, 't');
b.BO.Match.onMessage('a', a.sent[0]);
assert.strictEqual(b.BO.Match.view().foeHp, 5, 'action alone does not end the turn on the receiver');
assert.strictEqual(b.BO.Match.view().me.hp, 0, 'but the hit is applied immediately');
b.BO.Match.onMessage('a', a.sent[1]);
assert.strictEqual(a.ended, 1); assert.strictEqual(b.ended, 1);
assert.strictEqual(a.BO.Match.view().winner, 0); assert.strictEqual(b.BO.Match.view().winner, 0);
assert.strictEqual(b.BO.Match.desync(), null);
a.BO.Match.pass(); assert.strictEqual(a.sent.length, 2, 'No duplicate terminal turn');

//  같은 턴을 `a` 없이 `t` 로만 받아도(끊겼다 붙은 쪽) 결과가 같아야 한다.
var c = client(1);
c.BO.Match.onMessage('a', a.sent[1]);
assert.strictEqual(c.ended, 1); assert.strictEqual(c.BO.Match.view().winner, 0);
assert.strictEqual(c.BO.Match.desync(), null);
console.log('✓ Killing shot reaches both clients exactly once, with matching state (streamed and whole-turn)');
