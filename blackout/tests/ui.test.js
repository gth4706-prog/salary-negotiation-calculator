const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test((m.location() && m.location().url) || '')) errs.push(m.text()); });   // 막힌 글꼴 서버는 게임 오류가 아니다
  let fail = 0; const ok = (c, n, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + n + (x ? ' → ' + x : '')); if (!c) fail++; };
  await p.goto('http://localhost:8765/blackout/?x=' + Date.now(), { waitUntil: 'networkidle' });
  await p.screenshot({ path: (process.env.SP || '/tmp') + '/v04-menu.png' });
  await p.click('#go-bot'); await p.waitForTimeout(600);
  for (let i = 0; i < 40 && !(await p.textContent('#turn-info')).includes('내 턴'); i++) await p.waitForTimeout(200);
  ok(await p.evaluate(() => document.body.classList.contains('in-game')), 'body.in-game');
  ok(await p.locator('#confirm').isDisabled(), '고르기 전엔 [확정] 꺼짐');
  let dir = -1; for (let d = 0; d < 4; d++) if (await p.locator('#pad-' + d).isEnabled()) { dir = d; break; }
  await p.click('#pad-' + dir); await p.waitForTimeout(100);
  ok(await p.locator('.cell.step').count() === 1, '방향키 → 갈 칸이 표시된다');
  ok((await p.textContent('#confirm')).trim() === '이동 확정', '[확정] 라벨 = 이동 확정');
  const before = await p.evaluate(() => { const v = BO.Match.view(); return v.me.x + ',' + v.me.y; });
  await p.click('#confirm'); await p.waitForTimeout(150);
  const after = await p.evaluate(() => { const v = BO.Match.view(); return v.me.x + ',' + v.me.y; });
  ok(before !== after, '[이동 확정] 을 눌러야 움직인다', before + ' → ' + after);
  await p.click('#mode-shoot'); await p.waitForTimeout(80);
  const cells = p.locator('.cell:not(.outside):not(.me)');
  await cells.nth(33).click(); await p.waitForTimeout(80);
  ok(await p.locator('.cell.aim').count() === 1, '칸을 짚으면 조준점이 표시된다');
  ok((await p.textContent('#confirm')).trim() === '발사', '[확정] 라벨 = 발사');
  await p.click('#confirm'); await p.waitForTimeout(300);
  ok(await p.locator('.cell .splat.mine:not(.hide)').count() >= 1, '[발사] 뒤 내 얼룩이 생긴다');
  await p.click('#log-toggle'); await p.waitForTimeout(100);
  ok(await p.evaluate(() => document.getElementById('log').classList.contains('open')), '기록 [더 보기] 가 펼쳐진다');
  await p.click('#log-toggle');
  await p.screenshot({ path: (process.env.SP || '/tmp') + '/v04-game.png' });
  ok(!errs.length, 'JS 오류 없음', errs.join(' / '));
  await b.close(); process.exit(fail ? 1 : 0);
})();
