// 튜토리얼을 처음부터 끝까지 사람처럼 밟는다.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  let fail = 0; const ok = (c, n, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + n + (x ? ' → ' + x : '')); if (!c) fail++; };
  const view = () => p.evaluate(() => BO.Match.view());
  const step = async () => (await p.textContent('#tut-step')).trim();
  const waitStep = async (n) => { for (let i = 0; i < 100; i++) { if ((await step()).indexOf(n + ' /') > 0) return true; await p.waitForTimeout(200); } return false; };
  const waitMine = async () => { for (let i = 0; i < 60; i++) { const v = await view(); if (v && v.myTurn) return v; await p.waitForTimeout(200); } return null; };
  const shootAt = async (x, y) => { await p.click('#mode-shoot'); await p.waitForTimeout(60);
    await p.locator(`.cell[data-x="${x}"][data-y="${y}"]`).click(); await p.waitForTimeout(60); await p.click('#confirm'); await p.waitForTimeout(250); };
  const stepDir = async (d) => { await p.click('#mode-move'); await p.waitForTimeout(40); await p.click('#pad-' + d); await p.waitForTimeout(60); await p.click('#confirm'); await p.waitForTimeout(250); };

  await p.goto('http://localhost:8765/blackout/?x=' + Date.now(), { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.setItem('blackout.rtbase', 'http://localhost:8767'));
  await p.click('#go-tutorial'); await p.waitForTimeout(500);
  ok(await p.locator('#tut').isVisible(), '안내판이 뜬다');
  ok((await step()).indexOf('1 /') > 0, '1단계(소개)', await step());
  ok(await p.evaluate(() => BO.Bot.getMode() === 'tutorial'), '봇이 가르치는 모드');
  await p.click('#tut-next');
  ok(await waitStep(2), '2단계 이동');
  let v = await waitMine();
  await stepDir(v.legalDirs[0]);
  ok(await waitStep(3), '한 칸 움직이니 3단계 사격으로');
  v = await waitMine();
  const tgt = v.me.y < 5 ? { x: v.me.x, y: 9 } : { x: v.me.x, y: 0 };
  // 방 안 칸으로 보정
  const inside = await p.evaluate(t => { const v = BO.Match.view(); const W = BO.Core.C.W, H = BO.Core.C.H; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (!(x === v.me.x && y === v.me.y) && Math.abs(y - v.me.y) >= 3) return { x, y }; } return null; });
  await shootAt(inside.x, inside.y);
  //  v1.2: 사격 다음이 «보급 상자» 단계다. 주우러 가는 건 판마다 거리가 달라 여기서는
  //  설명만 확인하고 [다음]으로 넘긴다(단계 자체가 next:true 로 건너뛸 수 있게 돼 있다).
  ok(await waitStep(4), '한 발 쏘니 4단계 보급 상자로');
  ok((await p.textContent('#tut-text')).includes('보급 상자'), '보급 상자를 설명한다');
  await p.click('#tut-next');
  ok(await waitStep(5), '5단계 전등으로');
  // 전등까지 걷기 (공개 정보만: 내 위치·버튼·방 구조)
  for (let guard = 0; guard < 40; guard++) {
    v = await waitMine(); if (!v) break;
    if (v.me.x === v.lamp.x && v.me.y === v.lamp.y) break;
    //  사람처럼: 아는 칸만으로 길을 잡는다(모르는 칸은 갈 수 있다고 치고, 부딪히면 다시 잡는다)
    const d = await p.evaluate(() => { const v = BO.Match.view(); const dist = BO.Bot.paths(v, v.lamp.x, v.lamp.y);
      const DX = [0,1,0,-1], DY = [-1,0,1,0]; let best = null, bd = 1e9;
      for (const d of v.legalDirs) { const nx = v.me.x + DX[d], ny = v.me.y + DY[d]; const k = nx + ',' + ny; if (dist[k] != null && dist[k] < bd) { bd = dist[k]; best = d; } }
      return best; });
    if (d == null) break;
    await stepDir(d);
    if (await p.evaluate(() => BO.Match.view().lit > 0)) break;
  }
  ok(await waitStep(6), '버튼을 밟으니 6단계(불빛 아래)로');
  // 보이는 상대를 쏜다 — 보일 때까지 기다린다(내 턴에)
  let foe = null;
  for (let i = 0; i < 60 && !foe; i++) { v = await waitMine(); if (v && v.foe) foe = v.foe; else await p.waitForTimeout(200); }
  ok(!!foe, '불빛 아래 상대 좌표가 보인다', JSON.stringify(foe));
  await shootAt(foe.x, foe.y);
  ok(await waitStep(7), '맞히니 7단계(발자국)로');
  // 남은 행동력 버리고 넘겨 상대가 움직이게
  v = await waitMine(); if (v && v.ap > 0) { await p.click('#pass'); }
  ok(await waitStep(8), '상대가 한 칸 움직여 발자국 → 8단계(추적)');
  // 발자국 옆 칸들을 쏜다
  let hitDone = false;
  for (let round = 0; round < 6 && !hitDone; round++) {
    v = await waitMine();
    const cand = await p.evaluate(() => { const v = BO.Match.view(); const m = v.marks.filter(m => m.side !== v.mine)[0]; if (!m) return [];
      const DX = [0,1,0,-1], DY = [-1,0,1,0]; const out = []; for (let d = 0; d < 4; d++) { const x = m.x + DX[d], y = m.y + DY[d]; const t = BO.Core.inBoard(x, y) ? v.tiles[y * BO.Core.C.W + x] : { walk: false }; if ((!t || t.walk) && !(x === v.me.x && y === v.me.y)) out.push({ x, y }); } return out; });
    for (const c of cand.slice(round * 2, round * 2 + 2)) { await shootAt(c.x, c.y); if ((await step()).indexOf('9 /') > 0) { hitDone = true; break; } }
    if (!hitDone && cand.length <= (round + 1) * 2) { round = 0; }
    if (!hitDone) { const vv = await view(); if (vv && vv.myTurn && vv.ap > 0) await p.click('#pass'); }
  }
  ok(await waitStep(9), '맞히니 9단계(끝)로');
  ok((await p.textContent('#tut-next')).trim() === '실전으로', '마지막 버튼 = 실전으로');
  await p.click('#tut-next'); await p.waitForTimeout(600);
  ok(!(await p.locator('#tut').isVisible()), '안내판이 닫힌다');
  ok(await p.evaluate(() => BO.Bot.getMode() === 'normal'), '봇 모드가 실전으로 돌아온다');
  ok(!errs.length, 'JS 오류 없음', errs.join(' / '));
  await b.close(); console.log(fail ? '\n✗ ' + fail + '개 실패' : '\n✓ 튜토리얼 끝까지 진행'); process.exit(fail ? 1 : 0);
})();
