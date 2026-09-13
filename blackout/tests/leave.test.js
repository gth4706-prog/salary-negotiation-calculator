// 대전 중 상대가 앱을 닫으면: 카운트다운 → 30초 뒤 기권승 화면
const { chromium } = require('playwright');
const BASE = 'http://localhost:8765/blackout/', RT = 'http://localhost:8767';
async function mk(b, nick) {
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 } });
  const p = await ctx.newPage(); p._errs = [];
  p.on('pageerror', e => p._errs.push(nick + ': ' + e.message));
  await p.goto(BASE);
  await p.evaluate(([n, rt]) => { localStorage.setItem('blackout.rtbase', rt);
    localStorage.setItem('blackout.nick', n); localStorage.setItem('blackout.cid', n + '-cid'); }, [nick, RT]);
  await p.reload({ waitUntil: 'networkidle' }); return p;
}
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  let fail = 0; const ok = (c, n, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + n + (x ? ' → ' + x : '')); if (!c) fail++; };
  const A = await mk(b, '가영'), B = await mk(b, '나연');
  await A.click('#go-pvp'); await A.waitForTimeout(200); await A.click('#make-room');
  await A.waitForFunction(() => document.getElementById('room-code').textContent.length >= 3);
  const code = (await A.textContent('#room-code')).trim();
  await B.click('#go-pvp'); await B.waitForTimeout(200); await B.fill('#code', code); await B.click('#join-code');
  await A.waitForFunction(() => !document.getElementById('ready').disabled, null, { timeout: 8000 });
  await A.click('#ready'); await B.click('#ready');
  await A.waitForSelector('#s-game:not(.hide)', { timeout: 8000 });
  await B.waitForSelector('#s-game:not(.hide)', { timeout: 8000 });

  // B 가 앱을 닫는다(컨텍스트 종료 = 소켓·직결 모두 끊김)
  await B.context().close();
  await A.waitForFunction(() => /돌아오지 않으면/.test(document.getElementById('status').textContent), null, { timeout: 15000 });
  const s1 = (await A.textContent('#status')).trim();
  ok(/\d+초/.test(s1), '상대가 나가면 카운트다운이 뜬다', s1);
  ok(!(await A.locator('#over').isVisible()), '바로 끝내지는 않는다(돌아올 수 있으니)');
  await A.waitForSelector('#over:not(.hide)', { timeout: 50000 });
  const t = (await A.textContent('#over-title')).trim(), d = (await A.textContent('#over-detail')).trim();
  ok(t === '상대 퇴장', '30초 뒤 결과 화면', t);
  ok(/기권승/.test(d), '기권승으로 처리', d);
  ok(!A._errs.length, 'JS 오류 없음', A._errs.join(' / '));
  await b.close(); console.log(fail ? '\n✗ ' + fail + '개 실패' : '\n✓ 상대 퇴장 처리 동작'); process.exit(fail ? 1 : 0);
})();
