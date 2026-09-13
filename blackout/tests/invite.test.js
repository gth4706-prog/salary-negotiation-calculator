// 초대 링크(?room=코드)로 바로 입장 → 준비 → 시작까지, 브라우저 둘로.
const { chromium } = require('playwright');
const BASE = 'http://localhost:8765/blackout/', RT = 'http://localhost:8767';
async function mk(b, nick, url) {
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 } });
  const p = await ctx.newPage(); p._errs = [];
  p.on('pageerror', e => p._errs.push(nick + ': ' + e.message));
  await p.goto(BASE);
  await p.evaluate(([n, rt]) => { localStorage.setItem('blackout.rtbase', rt);
    localStorage.setItem('blackout.nick', n); localStorage.setItem('blackout.cid', n + '-cid'); }, [nick, RT]);
  await p.goto(url || BASE, { waitUntil: 'networkidle' });
  return p;
}
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  let fail = 0; const ok = (c, n, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + n + (x ? ' → ' + x : '')); if (!c) fail++; };

  const A = await mk(b, '가영');
  await A.click('#go-pvp'); await A.waitForTimeout(200); await A.click('#make-room');
  await A.waitForFunction(() => document.getElementById('room-code').textContent.length >= 3);
  const code = (await A.textContent('#room-code')).trim();
  ok(/^[A-Z0-9]{3,8}$/.test(code), '방 코드 발급', code);

  // 공유 버튼: 클립보드에 링크가 들어가는가
  await A.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await A.click('#share'); await A.waitForTimeout(300);
  const clip = await A.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  ok(clip.indexOf('?room=' + code) > 0, '[초대 링크 복사] 가 링크를 복사한다', clip);
  ok(/복사됐/.test(await A.textContent('#share')), '버튼이 «복사됐습니다» 로 바뀐다');

  // B 는 그 링크로 바로 연다 — 메뉴·로비 없이 방으로 들어가야 한다
  const B = await mk(b, '나연', BASE + '?room=' + code.toLowerCase());
  await B.waitForSelector('#s-room:not(.hide)', { timeout: 8000 });
  ok(true, '링크만 열었는데 방 화면으로 바로 들어간다');
  ok((await B.textContent('#room-code')).trim() === code, '소문자 링크도 대문자 코드로 정규화');
  await A.waitForFunction(() => !document.getElementById('ready').disabled, null, { timeout: 8000 });
  ok(true, 'A 화면에 「상대 입장」이 반영돼 [준비] 가 켜진다');

  await A.click('#ready'); await B.click('#ready');
  await A.waitForSelector('#s-game:not(.hide)', { timeout: 8000 });
  await B.waitForSelector('#s-game:not(.hide)', { timeout: 8000 });
  ok(true, '둘 다 준비 → 같은 판 시작');
  const rA = await A.evaluate(() => document.getElementById('board').getAttribute('data-room'));
  const rB = await B.evaluate(() => document.getElementById('board').getAttribute('data-room'));
  ok(rA === rB && !!rA, '양쪽이 같은 방(맵)을 본다', rA + ' / ' + rB);

  // 새로고침해도 ?room= 덕에 같은 방으로 다시 들어가는가
  await B.reload({ waitUntil: 'networkidle' });
  await B.waitForSelector('#s-room:not(.hide), #s-game:not(.hide)', { timeout: 8000 });
  ok(true, '새로고침해도 링크 덕에 방으로 되돌아온다');

  const errs = [...A._errs, ...B._errs];
  ok(errs.length === 0, 'JS 오류 없음', errs.join(' / '));
  await b.close(); console.log(fail ? '\n✗ ' + fail + '개 실패' : '\n✓ 초대 링크 흐름 전부 동작'); process.exit(fail ? 1 : 0);
})();
