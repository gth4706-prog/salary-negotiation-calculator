const { chromium } = require('playwright');
const fs = require('fs');
const URL = process.env.URL || 'http://127.0.0.1:8770/blackout/';
const assert = require('assert');
(async () => {
 const browser = await chromium.launch({executablePath: process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--no-sandbox']});
 try {
  const page = await browser.newPage({viewport:{width:390,height:844}});
  await page.goto(URL,{waitUntil:'networkidle'});
  await page.click('#go-bot');
  await page.waitForTimeout(500);
  if(process.env.SP) await page.screenshot({path:process.env.SP+'/blackout-v09-reviewed.png'});
  const masks = await page.evaluate(() => {
   const sp=document.querySelector('.splat'); sp.style.setProperty('--splat','url("https://example.invalid/mask.png")');
   return {shape:getComputedStyle(sp.querySelector('.shape')).maskImage,paint:getComputedStyle(sp.querySelector('.pic')).maskImage};
  });
  assert(masks.shape.includes('mask.png')); assert.equal(masks.paint,'none');
  console.log('PASS: paint and edge share one parent mask');
  const visibility = await page.evaluate(() => {
   BO.Match.stop();
   const st=BO.Core.create(0);st.side=0;st.ps[0].x=0;st.ps[0].y=0;st.ps[0].face=2;
   st.ps[1].x=7;st.ps[1].y=7;st.glow={side:1,turn:st.turn};
   BO.UI.reset();BO.UI.render(BO.Core.view(st,0));
   const visible=document.querySelector('.cell.foe');
   const source=visible && getComputedStyle(visible,'::after').backgroundImage;
   const glowMask=visible && getComputedStyle(visible.querySelector('.glowfx')).maskImage;
   st.turn++;BO.UI.render(BO.Core.view(st,0));
   return {full:document.body.classList.contains('has-kid-full'),source,glowMask,
     hidden:!document.querySelector('.cell.foe'),leak:!!document.querySelector('.cell.unknown.has-art')};
  });
  assert(visibility.full && visibility.source.includes('kid-full.png'));
  assert(visibility.glowMask.includes('kid-full.png'));
  assert(visibility.hidden && !visibility.leak);
  console.log('PASS: full-body sprite and paint mask obey hit reveal expiration');

  // Delay manifest delivery so a furniture request completes AFTER the cell becomes unknown.
  const delayed = await browser.newPage();
  await delayed.goto(URL);
  const result=await delayed.evaluate(async source => {
   let release;
   window.fetch=()=>new Promise(resolve=>{release=resolve;});
   (0,eval)(source);
   const cell=document.createElement('div');
   BO.Art.tile(cell,{kind:'desk',w:3,h:1,ox:0,oy:0},'office');
   BO.Art.tile(cell,null);
   const board=document.createElement('div');
   BO.Art.floor(board,'office'); BO.Art.floor(board,'bedroom');
   release({ok:true,json:()=>Promise.resolve({files:['furniture/desk-3x1.png','rooms/office.jpg','rooms/bedroom.jpg']})});
   await new Promise(resolve=>setTimeout(resolve,100));
   return {art:cell.style.getPropertyValue('--art'),edge:cell.style.getPropertyValue('--edge'),has:cell.classList.contains('has-art'),floor:board.style.getPropertyValue('--floor')};
  },fs.readFileSync('blackout/js/art.js','utf8'));
  assert.equal(result.art,''); assert.equal(result.edge,''); assert.equal(result.has,false); assert(result.floor.includes('bedroom.jpg'));
  console.log('PASS: delayed furniture cannot restore a now-unknown tile; latest room floor wins');
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1);});
