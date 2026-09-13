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
assert.strictEqual(a.sent.length, 1, 'Final shot sends a turn');
b.BO.Match.onMessage('a', a.sent[0]);
assert.strictEqual(a.ended, 1); assert.strictEqual(b.ended, 1);
assert.strictEqual(a.BO.Match.view().winner, 0); assert.strictEqual(b.BO.Match.view().winner, 0);
assert.strictEqual(b.BO.Match.desync(), null);
a.BO.Match.pass(); assert.strictEqual(a.sent.length, 1, 'No duplicate terminal turn');
console.log('✓ Killing shot reaches both clients exactly once, with matching state');
