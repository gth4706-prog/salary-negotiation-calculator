// 화면이 **넘치지 않는지** 실제 브라우저로 잰다.
//   node blackout/tests/layout.js            (http://localhost:8765 가 떠 있어야 함)
// 왜 있나: 「작은 폰에서 버튼이 화면 밖으로 나간다」는 눈으로는 놓치기 쉽고,
// 조작부를 한 줄 늘릴 때마다 다시 나는 종류의 사고다. 숫자로 잡는다.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8765/blackout/';
const SIZES = [
  { w: 320, h: 568, n: '아이폰SE 1세대' },
  { w: 375, h: 667, n: '아이폰SE 2·3세대' },
  { w: 360, h: 640, n: '보급형 안드로이드' },
  { w: 390, h: 844, n: '아이폰 14' },
  { w: 412, h: 915, n: '픽셀' },
  { w: 820, h: 1180, n: '아이패드' },
  { w: 900, h: 500, n: '가로로 눕힌 폰' }
];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.BROWSER_PATH || (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
  let bad = 0;
  for (const s of SIZES) {
    const p = await b.newPage({ viewport: { width: s.w, height: s.h } });
    await p.goto(URL, { waitUntil: 'networkidle' });
    await p.click('#go-bot');
    await p.waitForTimeout(400);
    const m = await p.evaluate(() => {
      const r = document.documentElement;
      const board = document.getElementById('board').getBoundingClientRect();
      //  «맨 아래»는 실제로 **보이는** 것 중 마지막이다. 숨겨진 요소는 0을 돌려줘서
      //  통과처럼 보인다(처음에 그렇게 속았다).
      var vis = Array.prototype.filter.call(
        document.querySelectorAll('#s-game > *'),
        function (e) { return e.getBoundingClientRect().height > 0; });
      const last = vis[vis.length - 1] || document.getElementById('status');
      return { over: r.scrollHeight - window.innerHeight,
               overX: r.scrollWidth - window.innerWidth,
               board: Math.round(board.width),
               square: Math.abs(board.width - board.height) < 2,
               lastBottom: Math.round(last.getBoundingClientRect().bottom),
               winH: window.innerHeight };
    });
    const ok = m.over <= 0 && m.overX <= 0 && m.square && m.board >= 150 && m.lastBottom <= m.winH + 1;
    if (!ok) bad++;
    console.log((ok ? '  ✓ ' : '  ✗ ') + s.n.padEnd(16) + s.w + '×' + s.h +
      ' · 격자 ' + m.board + (m.square ? '(정사각)' : '(찌그러짐!)') +
      ' · 세로넘침 ' + m.over + ' · 가로넘침 ' + m.overX +
      ' · 맨아래 ' + m.lastBottom + '/' + m.winH);
    await p.close();
  }
  await b.close();
  console.log(bad ? '\n✗ ' + bad + '개 화면에서 안 맞음' : '\n✓ 모든 화면에서 안 넘침');
  process.exit(bad ? 1 : 0);
})();
