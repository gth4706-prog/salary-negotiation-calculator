// 튜토리얼 중에도 화면이 안 넘치는지 · 안내판 밑 칸이 눌리는지
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.BROWSER_PATH || (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
  let bad = 0;
  for (const [w, h, n] of [[320,568,'SE1'],[375,667,'SE2'],[390,844,'14'],[820,1180,'iPad']]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto((process.env.URL || 'http://localhost:8765/blackout/') + '?x=' + Date.now(), { waitUntil: 'networkidle' });
    await p.click('#go-tutorial'); await p.waitForTimeout(700);
    const m = await p.evaluate(() => {
      const r = document.documentElement;
      const vis = Array.from(document.querySelectorAll('#s-game > *')).filter(e => e.getBoundingClientRect().height > 0);
      const last = vis[vis.length - 1];
      // 안내판 밑 칸이 실제로 눌리는가 — 카드 한가운데 좌표에서 무엇이 잡히나
      const card = document.querySelector('.tut-card').getBoundingClientRect();
      const hit = document.elementFromPoint(card.left + card.width / 2, card.top + card.height / 2);
      return { over: r.scrollHeight - window.innerHeight, overX: r.scrollWidth - window.innerWidth,
               board: Math.round(document.getElementById('board').getBoundingClientRect().width),
               lastBottom: Math.round(last.getBoundingClientRect().bottom), winH: window.innerHeight,
               under: hit ? (hit.closest('.cell') ? '칸(' + hit.closest('.cell').dataset.x + ',' + hit.closest('.cell').dataset.y + ')' : (hit.className || hit.tagName)) : 'none' };
    });
    const ok = m.over <= 0 && m.overX <= 0 && m.lastBottom <= m.winH + 1 && /^칸\(/.test(String(m.under));
    if (!ok) bad++;
    console.log((ok ? '  ✓ ' : '  ✗ ') + n.padEnd(6) + w + '×' + h + ' · 격자 ' + m.board +
      ' · 넘침 ' + m.over + '/' + m.overX + ' · 맨아래 ' + m.lastBottom + '/' + m.winH + ' · 안내판 밑: ' + m.under);
    await p.close();
  }
  await b.close();
  console.log(bad ? '\n✗ ' + bad + '개 실패' : '\n✓ 튜토리얼 화면 · 안내판 통과 확인');
  process.exit(bad ? 1 : 0);
})();
