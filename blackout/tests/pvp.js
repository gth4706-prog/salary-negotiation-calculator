// 브라우저 둘을 실제로 붙여 한 판 둔다.
const { chromium } = require('playwright');
// 벽 쪽 방향키는 **정상적으로 비활성**이다. 눌리는 것 중 하나를 고른다.
async function stepAny(p) {
  for (let d = 0; d < 4; d++) {
    const b = p.locator('#pad-' + d);
    if (await b.isEnabled().catch(() => false)) { await b.click(); return true; }
  }
  return false;
}

const BASE = 'http://localhost:8765/blackout/';

async function mk(b, nick) {
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(nick + ' PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(nick + ' CONSOLE: ' + m.text()); });
  await p.goto(BASE);
  await p.evaluate(n => {
    localStorage.setItem('blackout.rtbase', 'http://localhost:8767');
    localStorage.setItem('blackout.nick', n);
    localStorage.setItem('blackout.cid', n + '-cid');
  }, nick);
  await p.reload({ waitUntil: 'networkidle' });
  p._errs = errs; p._nick = nick;
  return p;
}
const turnOf = async p => (await p.textContent('#turn-info')).replace(/\s+/g, ' ').trim();
const isMine = async p => (await turnOf(p)).includes('내 턴');

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const A = await mk(b, '가영'), B = await mk(b, '나연');

  await A.click('#go-pvp'); await A.waitForTimeout(300);
  await A.click('#make-room');
  await A.waitForSelector('#s-room:not(.hide)');
  await A.waitForFunction(() => document.getElementById('room-code').textContent.length >= 3);
  const code = (await A.textContent('#room-code')).trim();
  console.log('방 코드:', code);

  await B.click('#go-pvp'); await B.waitForTimeout(300);
  await B.fill('#code', code);
  await B.click('#join-code');
  await B.waitForSelector('#s-room:not(.hide)');
  await A.waitForFunction(() => !document.getElementById('ready').disabled, null, { timeout: 8000 });
  console.log('A 방 상태:', (await A.textContent('#room-status')).trim());
  console.log('B 방 상태:', (await B.textContent('#room-status')).trim());

  await A.click('#ready'); await B.click('#ready');
  await A.waitForSelector('#s-game:not(.hide)', { timeout: 8000 });
  await B.waitForSelector('#s-game:not(.hide)', { timeout: 8000 });
  console.log('양쪽 대전 화면 진입 ✓');
  console.log('A:', await turnOf(A), '| B:', await turnOf(B));

  // 한쪽이 내 턴이면 두고, 상대가 받는지 확인
  let turns = 0, desync = false;
  for (let t = 0; t < 14; t++) {
    const me = (await isMine(A)) ? A : ((await isMine(B)) ? B : null);
    if (!me) { await A.waitForTimeout(300); continue; }
    const other = me === A ? B : A;
    const beforeOther = await turnOf(other);
    // 한 발 쏘고 한 칸 이동
    await me.click('#mode-shoot'); await me.waitForTimeout(60);
    const i = (17 + t * 11) % 100;
    await me.locator('.cell').nth(i).click(); await me.waitForTimeout(50);
    await me.locator('.cell').nth(i).click(); await me.waitForTimeout(150);
    await me.click('#mode-move'); await me.waitForTimeout(60);
    await stepAny(me);
    await me.waitForTimeout(500);
    const afterOther = await turnOf(other);
    if (beforeOther !== afterOther) turns++;
    if (await A.locator('#desync').isVisible() || await B.locator('#desync').isVisible()) { desync = true; break; }
    if (await A.locator('#over').isVisible()) break;
  }
  console.log('상대 화면까지 넘어간 턴 수:', turns);
  console.log('어긋남 배너:', desync);
  console.log('A 로그 마지막:', (await A.locator('#log div').allTextContents()).slice(-3).join(' / '));
  console.log('B 로그 마지막:', (await B.locator('#log div').allTextContents()).slice(-3).join(' / '));
  const hpA = await A.locator('#hp-me .pip.on').count(), hpFoeA = await A.locator('#hp-foe .pip.on').count();
  const hpB = await B.locator('#hp-me .pip.on').count(), hpFoeB = await B.locator('#hp-foe .pip.on').count();
  console.log('체력 — A가 보는(나/적):', hpA + '/' + hpFoeA, '| B가 보는(나/적):', hpB + '/' + hpFoeB);
  console.log('두 화면 체력 일치:', hpA === hpFoeB && hpB === hpFoeA ? '✓' : '✗ 어긋남!');
  if (process.env.SP) await A.screenshot({ path: process.env.SP + '/pvp-a.png' });

  const errs = [...A._errs, ...B._errs];
  console.log(errs.length ? '\n!! 오류 !!\n' + errs.join('\n') : '\n오류 없음');
  await b.close();
  process.exit(errs.length || desync || turns < 4 ? 1 : 0);
})();
