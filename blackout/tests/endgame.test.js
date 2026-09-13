// 판 종료 → 결과 화면 → [한 판 더] → 새 판, 그리고 턴 시간 초과 자동 넘김.
const { chromium } = require('playwright');
const BASE = 'http://localhost:8765/blackout/', RT = 'http://localhost:8767';
async function mk(b, nick) {
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 } });
  const p = await ctx.newPage(); p._errs = [];
  p.on('pageerror', e => p._errs.push(nick + ': ' + e.message));
  await p.goto(BASE);
  await p.evaluate(([n, rt]) => { localStorage.setItem('blackout.rtbase', rt);
    localStorage.setItem('blackout.nick', n); localStorage.setItem('blackout.cid', n + '-cid'); }, [nick, RT]);
  await p.reload({ waitUntil: 'networkidle' });
  return p;
}
const turnOf = async p => (await p.textContent('#turn-info')).replace(/\s+/g, ' ').trim();
const isMine = async p => (await turnOf(p)).includes('내 턴');
async function pair(b, maxTurns) {
  const A = await mk(b, '가영'), B = await mk(b, '나연');
  //  양쪽이 똑같이 눈금을 바꾼다 — 상태가 같으니 해시도 같다. (제한 턴을 짧게 해 종료 흐름을 본다)
  if (maxTurns) for (const p of [A, B]) await p.evaluate(n => { BO.Core.C.MAX_TURNS = n; }, maxTurns);
  await A.click('#go-pvp'); await A.waitForTimeout(200); await A.click('#make-room');
  await A.waitForFunction(() => document.getElementById('room-code').textContent.length >= 3);
  const code = (await A.textContent('#room-code')).trim();
  await B.click('#go-pvp'); await B.waitForTimeout(200); await B.fill('#code', code); await B.click('#join-code');
  await A.waitForFunction(() => !document.getElementById('ready').disabled, null, { timeout: 8000 });
  await A.click('#ready'); await B.click('#ready');
  await A.waitForSelector('#s-game:not(.hide)', { timeout: 8000 });
  await B.waitForSelector('#s-game:not(.hide)', { timeout: 8000 });
  return [A, B];
}
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  let fail = 0; const ok = (c, n, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + n + (x ? ' → ' + x : '')); if (!c) fail++; };

  console.log('① 판 종료 → 결과 → 한 판 더');
  {
    const [A, B] = await pair(b, 4);
    for (let i = 0; i < 12; i++) {
      const me = (await isMine(A)) ? A : ((await isMine(B)) ? B : null);
      if (await A.locator('#over').isVisible()) break;
      if (!me) { await A.waitForTimeout(250); continue; }
      await me.click('#pass'); await me.waitForTimeout(400);
    }
    await A.waitForSelector('#over:not(.hide)', { timeout: 8000 });
    await B.waitForSelector('#over:not(.hide)', { timeout: 8000 });
    const tA = (await A.textContent('#over-title')).trim(), tB = (await B.textContent('#over-title')).trim();
    ok(true, '양쪽 다 결과 화면', tA + ' / ' + tB);
    ok((tA === '무승부' && tB === '무승부') || (tA !== tB), '결과가 서로 맞물린다(둘 다 무승부거나 승/패가 갈린다)');
    const dA = (await A.textContent('#over-detail')).trim();
    ok(/턴이 지났/.test(dA), '사유가 «제한 턴 초과»로 나온다', dA);

    // 한 판 더 — 둘 다 누르면 새 판이 시작돼야 한다
    await A.click('#over-again'); await B.click('#over-again');
    await A.waitForSelector('#s-game:not(.hide)', { timeout: 10000 });
    await B.waitForSelector('#s-game:not(.hide)', { timeout: 10000 });
    ok(!(await A.locator('#over').isVisible()) && !(await B.locator('#over').isVisible()), '한 판 더 → 결과 화면이 닫히고');
    const t2A = await turnOf(A), t2B = await turnOf(B);
    ok(/1 \//.test(t2A) && /1 \//.test(t2B), '새 판이 1턴부터 시작한다', t2A + ' | ' + t2B);
    ok((await isMine(A)) !== (await isMine(B)), '턴 주인이 한쪽에만 있다');
    const errs = [...A._errs, ...B._errs]; ok(!errs.length, 'JS 오류 없음', errs.join(' / '));
    await A.context().close(); await B.context().close();
  }

  console.log('② 턴 제한시간 초과 → 자동 넘김');
  {
    const [A, B] = await pair(b);
    const active = (await isMine(A)) ? A : B, other = active === A ? B : A;
    ok(!(await isMine(other)), '처음엔 상대 턴');
    await active.waitForTimeout(21500);           // 20초 제한 + 여유
    ok(await isMine(other), '20초 지나면 턴이 자동으로 넘어간다', await turnOf(other));
    ok(!(await isMine(active)), '넘긴 쪽은 상대 턴이 된다');
    const errs = [...A._errs, ...B._errs]; ok(!errs.length, 'JS 오류 없음', errs.join(' / '));
    await A.context().close(); await B.context().close();
  }
  await b.close(); console.log(fail ? '\n✗ ' + fail + '개 실패' : '\n✓ 종료·재대결·시간초과 전부 동작'); process.exit(fail ? 1 : 0);
})();
