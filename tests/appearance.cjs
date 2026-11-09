'use strict';
const {chromium}=require('playwright');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:960,height:640}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.setContent('<!doctype html><html><head><style>'+read('widget/CSS.css')+'</style></head><body>'+read('widget/HTML.html')+'</body></html>');
  await page.addScriptTag({content:read('widget/JS.js')});
  await page.evaluate(()=>{
   window.user={displayName:'NightWalker',messageCount:6,firstSeenAt:Date.now()-3600000};
   window.r=new ChatThanks.Renderer(ChatThanks.settings({position:'center',titleFont:'Courier New',titleFontSize:16,nameFontSize:44,messageFontSize:26,fontSize:35,displaySeconds:2}),document);
   r.show(user,Date.now());window.icon=document.querySelector('.thanks-icon');window.first=icon.getAnimations()[0];first.pause();
  });
  assert.match(await page.locator('#thanks-title').evaluate(e=>getComputedStyle(e).fontFamily),/Courier New/);
  assert.doesNotMatch(await page.locator('#thanks-name').evaluate(e=>getComputedStyle(e).fontFamily),/Courier New/);
  assert.equal(await page.locator('#thanks-title').evaluate(e=>getComputedStyle(e).fontSize),'16px');
  assert.equal(await page.locator('#thanks-name').evaluate(e=>getComputedStyle(e).fontSize),'44px');
  assert.equal(await page.locator('#thanks-text').evaluate(e=>getComputedStyle(e).fontSize),'26px');
  console.log('✓ Заголовок, имя и благодарность имеют независимые размеры; шрифт заголовка меняется отдельно');
  const timing=await page.evaluate(()=>first.effect.getTiming());assert.equal(timing.delay,900);assert.equal(timing.duration,450);
  await page.evaluate(()=>first.currentTime=899);assert.equal(await page.evaluate(()=>Number(getComputedStyle(icon).opacity)),0);
  await page.evaluate(()=>first.currentTime=1351);assert.equal(await page.evaluate(()=>Number(getComputedStyle(icon).opacity)),1);
  await page.waitForFunction(()=>document.getElementById('thanks-card').classList.contains('hold'));
  assert.equal(await page.evaluate(()=>icon.getAnimations()[0]===first),true);
  console.log('✓ Эмблема появляется через 0,25 с после выезда; переход enter → hold не сбрасывает задержку');
  await page.evaluate(()=>{r.dispose();r=new ChatThanks.Renderer(ChatThanks.settings({displaySeconds:2}),document);r.show(user,Date.now());});
  assert.equal(await page.evaluate(()=>icon.getAnimations()[0]===first),false);
  assert.equal(await page.evaluate(()=>Number(getComputedStyle(icon).opacity)),0);
  console.log('✓ Следующая плашка заново запускает появление эмблемы');
  await page.evaluate(()=>{
   r.dispose();r=new ChatThanks.Renderer(ChatThanks.settings({enterSeconds:.1,displaySeconds:1,iconDelaySeconds:2}),document);r.show(user,Date.now());
  });
  const short=await page.evaluate(()=>icon.getAnimations()[0].effect.getTiming());
  assert.ok(short.delay+short.duration<=1100.001);assert.equal(short.duration,450);
  console.log('✓ При коротком показе эмблема успевает проявиться до исчезновения');
  await page.evaluate(()=>r.dispose());await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(()=>{r=new ChatThanks.Renderer(ChatThanks.settings({}),document);r.show(user,Date.now());});
  assert.equal(await page.evaluate(()=>getComputedStyle(icon).animationName),'thanks-icon-fade');
  assert.equal(await page.evaluate(()=>icon.getAnimations()[0].effect.getKeyframes().every(f=>!f.transform||f.transform==='none')),true);
  await page.evaluate(()=>r.dispose());assert.deepEqual(errors,[]);
  console.log('✓ Reduced motion сохраняет мягкое появление без перемещения');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
