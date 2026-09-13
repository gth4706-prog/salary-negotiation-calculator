// 안전장치 두 개를 **실제로 발동시켜** 본다.
//  ① 판이 어긋나면 조용히 계속되지 않고 멈추고 알리는가 · 다시 맞출 수 있는가
//  ② 소켓이 끊겼다 붙으면 밀린 턴을 따라잡는가
// 안 터지는 안전장치는 없는 것과 같다. 그래서 일부러 터뜨린다.
const { chromium } = require('playwright');
const BASE = 'http://localhost:8765/blackout/';
const RT = 'http://localhost:8767';

async function mk(b, nick) {
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 } });
  const p = await ctx.newPage();
  p._errs = [];
  p.on('pageerror', e => p._errs.push(nick + ' PAGEERROR: ' + e.message));
  await p.goto(BASE);
  await p.evaluate(([n, rt]) => {
    localStorage.setItem('blackout.rtbase', rt);
    localStorage.setItem('blackout.nick', n);
    localStorage.setItem('blackout.cid', n + '-cid');
  }, [nick, RT]);
  await p.reload({ waitUntil: 'networkidle' });
  return p;
}
const turnOf = async p => (await p.textContent('#turn-info')).replace(/\s+/g, ' ').trim();
const isMine = async p => (await turnOf(p)).includes('내 턴');

async function pair(b) {
  const A = await mk(b, '가영'), B = await mk(b, '나연');
  await A.click('#go-pvp'); await A.waitForTimeout(200); await A.click('#make-room');
  await A.waitForFunction(() => document.getElementById('room-code').textContent.length >= 3);
  const code = (await A.textContent('#room-code')).trim();
  await B.click('#go-pvp'); await B.waitForTimeout(200);
  await B.fill('#code', code); await B.click('#join-code');
  await A.waitForFunction(() => !document.getElementById('ready').disabled, null, { timeout: 8000 });
  await A.click('#ready'); await B.click('#ready');
  await A.waitForSelector('#s-game:not(.hide)', { timeout: 8000 });
  await B.waitForSelector('#s-game:not(.hide)', { timeout: 8000 });
  return [A, B];
}
// 한 턴 둔다(사격 한 발 + 넘기기)
async function playTurn(p) {
  await p.click('#mode-shoot'); await p.waitForTimeout(60);
  const i = Math.floor(Math.random() * 100);
  await p.locator('.cell').nth(i).click(); await p.waitForTimeout(50);
  await p.locator('.cell').nth(i).click(); await p.waitForTimeout(120);
  await p.click('#mode-move'); await p.waitForTimeout(50);
  await p.click('#pass'); await p.waitForTimeout(400);
}
async function waitMine(p, ms) {
  for (let i = 0; i < (ms || 8000) / 200; i++) { if (await isMine(p)) return true; await p.waitForTimeout(200); }
  return false;
}

(async () => {
  const b = await chromium.launch({ executablePath: process.env.BROWSER_PATH || (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
  let fail = 0;
  const ok = (c, n, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + n + (x ? ' → ' + x : '')); if (!c) fail++; };

  // ── ① 어긋남 ────────────────────────────────────────────────────────────
  console.log('\n① 판이 어긋나면 멈추고 알리는가');
  {
    const [A, B] = await pair(b);
    const shooter = (await isMine(A)) ? A : B, other = shooter === A ? B : A;
    // 보내는 턴의 해시를 딱 한 번 망가뜨린다 — 「둘이 다른 판을 보고 있다」의 재현.
    await shooter.evaluate(() => {
      const real = BO.Net.relay.bind(BO.Net);
      let done = false;
      BO.Net.relay = function (d) {
        if (!done && d && d.t === 't') { done = true; d = Object.assign({}, d, { h: (d.h ^ 0x1234) >>> 0 }); }
        return real(d);
      };
    });
    await playTurn(shooter);
    await other.waitForTimeout(700);
    ok(await other.locator('#desync').isVisible(), '받는 쪽이 어긋남을 잡아내고 멈춘다');
    ok(!(await shooter.locator('#desync').isVisible()), '보낸 쪽은 제 판을 그대로 본다');
    const why = (await other.textContent('#desync-why')).trim();
    ok(/어긋/.test(why), '사유를 사람이 읽을 수 있게 보여 준다', why.slice(0, 60));
    // 다시 맞추기
    await other.click('#resync');
    await other.waitForTimeout(900);
    ok(!(await other.locator('#desync').isVisible()), '[다시 맞추기] 로 복구된다');
    const hpA = await A.locator('#hp-me .pip.on').count(), hpFoeB = await B.locator('#hp-foe .pip.on').count();
    ok(hpA === hpFoeB, '복구 뒤 두 화면이 같은 판을 본다', hpA + ' vs ' + hpFoeB);
    await A.context().close(); await B.context().close();
  }

  // ── ② 재접속 ────────────────────────────────────────────────────────────
  console.log('\n② 끊겼다 붙으면 밀린 턴을 따라잡는가');
  {
    const [A, B] = await pair(b);
    const first = (await isMine(A)) ? A : B, second = first === A ? B : A;
    // 기다리는 쪽(second)의 소켓을 끊는다 — 폰 화면이 꺼진 상황 그대로.
    // ⚠ 재접속이 0.5초 만에 붙어 버려서 처음엔 «끊긴 동안»이 만들어지지 않았다.
    //   다시 붙는 길을 잠깐 막아 두고, 밀린 턴을 만든 다음 열어 준다.
    // ⚠⚠ 소켓만 끊으면 안 끊긴다 — **P2P 직결이 살아 있어서 턴이 그대로 온다.**
    //   (설계대로다. 실전에서는 이게 그대로 장점이다.) 두 경로를 다 끊어야
    //   「밀린 턴을 따라잡는」 길이 실제로 밟힌다.
    const p2p = await second.evaluate(() => BO.Rtc.ready());
    console.log('      (직결 상태: ' + (p2p ? '붙어 있음 — 같이 끊는다' : '없음') + ')');
    await second.evaluate(() => {
      BO.Net._realOpen = BO.Net._openSocket;
      BO.Net._openSocket = function () {};
      if (BO.Rtc.dc) { try { BO.Rtc.dc.close(); } catch (e) {} }
      if (BO.Rtc.pc) { try { BO.Rtc.pc.close(); } catch (e) {} }
      BO.Rtc._open = false; BO.Rtc._dead = true;
      BO.Net.ws.close(3000, 'test');
    });
    await second.waitForTimeout(1200);
    const before = await second.evaluate(() => BO.Match.logLength());
    // 보내는 쪽의 직결도 같이 죽인다(한쪽만 닫으면 상대는 아직 열린 줄 안다)
    await first.evaluate(() => {
      if (BO.Rtc.dc) { try { BO.Rtc.dc.close(); } catch (e) {} }
      BO.Rtc._open = false; BO.Rtc._dead = true;
    });
    // 끊긴 동안 상대가 한 턴 둔다
    await playTurn(first);
    await second.waitForTimeout(600);
    const during = await second.evaluate(() => BO.Match.logLength());
    ok(during === before, '끊긴 동안에는 그 턴을 못 받는다(전제 확인)', before + '→' + during);
    ok(await second.evaluate(() => !BO.Net.connected), '끊긴 상태가 유지된다');
    // 이제 다시 붙게 열어 준다 → reopen → need → log 로 따라잡아야 한다
    await second.evaluate(() => {
      BO.Net._openSocket = BO.Net._realOpen;
      BO.Net._retry = 0;
      BO.Net._openSocket();
    });
    let after = during;
    for (let i = 0; i < 40; i++) {
      await second.waitForTimeout(400);
      after = await second.evaluate(() => BO.Match.logLength());
      if (after > during) break;
    }
    ok(after > during, '되붙은 뒤 밀린 턴을 따라잡는다', during + '→' + after);
    ok(!(await second.locator('#desync').isVisible()), '따라잡는 과정에서 어긋나지 않는다');
    ok(await waitMine(second, 6000), '따라잡은 뒤 제 턴이 돌아온다');
    await A.context().close(); await B.context().close();
  }

  await b.close();
  console.log(fail ? '\n✗ ' + fail + '개 실패' : '\n✓ 안전장치 둘 다 실제로 동작한다');
  process.exit(fail ? 1 : 0);
})();
