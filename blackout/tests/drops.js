// 보급 상자·도구가 **화면에서** 실제로 도는지(v1.2).
//
// 규칙은 core.test.js 가 지킨다. 여기서 보는 건 그 규칙이 손에 닿느냐다 —
// 상자가 어둠을 뚫고 보이는가 · 걸어가서 밟으면 손에 들어오는가 · [📦 도구] 가
// 던질 칸을 미리 보여 주는가 · 던지면 그 모양대로 칠해지는가 · 쓰고 나면 모드가 돌아오는가.
//
// ⚠ 규칙 엔진에 손을 넣어 물건을 «쥐여 주지» 않는다. 그런 뒷문을 만들면 그 뒷문으로
//   상대 좌표도 새어 나간다(이 게임의 전체 설계가 그걸 막는 데 걸려 있다).
//   그래서 여기서는 사람이 하는 그대로 — **걸어가서 줍는다.**
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.BROWSER_PATH || (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test((m.location() && m.location().url) || '')) errs.push(m.text()); });
  let fail = 0; const ok = (c, n, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + n + (x ? ' → ' + x : '')); if (!c) fail++; };
  const view = () => p.evaluate(() => BO.Match.view());
  const mine = async () => (await p.textContent('#turn-info')).includes('내 턴');
  const waitMine = async () => { for (let i = 0; i < 100 && !(await mine()); i++) await p.waitForTimeout(150); return mine(); };

  await p.goto((process.env.URL || 'http://localhost:8765/blackout/') + '?x=' + Date.now(), { waitUntil: 'networkidle' });
  await p.click('#go-bot'); await p.waitForTimeout(600);
  await waitMine();
  ok(await p.locator('#mode-item').isDisabled(), '빈손이면 [📦 도구] 버튼이 꺼져 있다');

  //  ── 상자가 떨어질 때까지 ─────────────────────────────────────────────────
  for (let i = 0; i < 10 && (await view()).drops.length === 0; i++) {
    if (!await waitMine()) break;
    await p.click('#pass'); await p.waitForTimeout(350);
  }
  const v0 = await view();
  ok(v0.drops.length >= 1, '몇 턴 지나면 상자가 떨어진다', v0.drops.length + '개');
  ok(await p.locator('.cell .box:not(.hide)').count() === v0.drops.length,
     '화면의 상자 수 = view 의 상자 수 (상자는 공개다)');
  ok(await p.evaluate(() => {
    const d = BO.Match.view().drops[0];
    const c = document.querySelectorAll('.cell')[d.y * BO.Core.C.W + d.x];
    const box = c.querySelector('.box');
    return !box.classList.contains('hide') && /보급 상자/.test(box.title);
  }), '상자가 제 칸에 그려지고 내용물 설명이 붙는다');

  //  ── 걸어가서 줍는다 ──────────────────────────────────────────────────────
  //  욕심내서 한 칸씩 다가간다. 가구에 막히면 아무 쪽이나 한 걸음(그게 어둠이다).
  let picked = null;
  for (let turn = 0; turn < 26 && !picked; turn++) {
    if (!await waitMine()) break;
    const v = await view();
    if (v.over) break;
    if (v.item) { picked = v.item; break; }
    if (!v.drops.length) { await p.click('#pass'); await p.waitForTimeout(300); continue; }
    if (await p.locator('#mode-move').isEnabled()) { await p.click('#mode-move'); await p.waitForTimeout(50); }
    for (let a = 0; a < 2; a++) {
      const d = await p.evaluate(() => {
        const v = BO.Match.view(), C = BO.Core;
        if (!v.drops.length || !v.legalDirs.length) return null;
        let tgt = v.drops[0], td = 1e9;
        v.drops.forEach(function (b) {
          const q = Math.abs(b.x - v.me.x) + Math.abs(b.y - v.me.y);
          if (q < td) { td = q; tgt = b; }
        });
        let best = null, bd = 1e9;
        v.legalDirs.forEach(function (d) {
          const nx = v.me.x + C.DX[d], ny = v.me.y + C.DY[d];
          const q = Math.abs(nx - tgt.x) + Math.abs(ny - tgt.y) + Math.random() * 0.4;
          if (q < bd) { bd = q; best = d; }
        });
        return best;
      });
      if (d == null) break;
      await p.click('#pad-' + d); await p.waitForTimeout(60);
      await p.click('#confirm'); await p.waitForTimeout(220);
      const now = await view();
      if (now.item) { picked = now.item; break; }
      if (!now.myTurn || now.over) break;
    }
    if (!picked && await mine()) { await p.click('#pass'); await p.waitForTimeout(300); }
  }
  ok(!!picked, '걸어가서 상자를 밟으면 손에 들어온다', picked || '26턴 안에 못 주웠다');
  if (!picked) { ok(!errs.length, 'JS 오류 없음', errs.join(' / ')); await b.close(); process.exit(1); }

  ok((await p.textContent('#log')).includes('획득'), '기록에 「획득」이 남는다');
  ok((await p.textContent('#log')).includes('드러났다'), '⚠ 자리가 드러났다는 경고도 같이 남는다');
  await waitMine();
  ok(await p.locator('#mode-item').isEnabled(), '도구를 들면 [📦 도구] 버튼이 켜진다');
  const label = (await p.textContent('#mode-item')).trim();
  ok(label !== '📦 도구' && label.length > 2, '버튼에 든 물건 이름이 뜬다', label);
  ok((await p.textContent('#ap')).includes('—'), '행동력 줄에도 든 물건이 보인다');

  //  ── 던진다 ───────────────────────────────────────────────────────────────
  await p.click('#mode-item'); await p.waitForTimeout(120);
  const held = (await view()).item;
  if (held === 'heal') {
    const hpBefore = (await view()).me.hp;
    ok((await p.textContent('#confirm')).includes('반창고'), '반창고는 겨냥 없이 바로 쓴다');
    await p.click('#confirm'); await p.waitForTimeout(350);
    const vh = await view();
    ok(vh.me.hp >= hpBefore, '반창고를 쓰면 체력이 줄지 않는다', hpBefore + ' → ' + vh.me.hp);
  } else {
    const aim = await p.evaluate(() => {
      const v = BO.Match.view();
      return { x: v.me.x < 4 ? 5 : 2, y: v.me.y < 4 ? 5 : 2 };
    });
    await p.locator('.cell').nth(aim.y * 8 + aim.x).click(); await p.waitForTimeout(150);
    const n = await p.locator('.cell.blast').count();
    ok(n >= 3, '던질 칸이 모양대로 미리 표시된다', n + '칸 (' + held + ')');
    ok((await p.textContent('#confirm')).includes('던지기'), '[확정] 라벨이 던지기로 바뀐다',
       await p.textContent('#confirm'));
    const before = (await view()).paint.length;
    await p.click('#confirm'); await p.waitForTimeout(450);
    const after = (await view()).paint.length;
    ok(after - before >= 3, '던지면 모양대로 여러 칸이 칠해진다', before + ' → ' + after);
    ok(await p.locator('.cell.blast').count() === 0, '던지고 나면 미리보기가 사라진다');
  }
  ok((await view()).item == null, '쓰고 나면 손이 빈다');
  ok(await p.evaluate(() => BO.UI.mode() === 'move'), '빈손이 되면 모드가 이동으로 돌아온다');

  await p.screenshot({ path: (process.env.SP || '/tmp') + '/v12-drops.png' });
  ok(!errs.length, 'JS 오류 없음', errs.join(' / '));
  await b.close(); process.exit(fail ? 1 : 0);
})();
