'use strict';
// Запуск: сервер на 8080 + CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const url=process.env.PREVIEW_URL||'http://127.0.0.1:8080/preview/';
 try{
  await page.goto(url);await page.waitForFunction(()=>document.getElementById('widget').contentWindow.__chatThanks?.runtime?.ready);
  await page.waitForFunction(()=>!starting);
  const act=async fn=>page.evaluate(fn);
  await act(()=>send('NightWalker',5));
  assert.equal(await act(()=>frame.__chatThanks.runtime.engine.queue.length),0);
  await act(()=>jump(60*60000));
  assert.equal(await act(()=>[...frame.__chatThanks.runtime.engine.users.values()][0].rewarded),false);
  await act(()=>send('NightWalker',1));
  await page.waitForFunction(()=>!document.getElementById('widget').contentDocument.getElementById('thanks-card').hidden);
  assert.equal(await act(()=>frame.document.getElementById('thanks-name').textContent),'NightWalker');
  await page.waitForFunction(()=>document.getElementById('widget').contentDocument.getElementById('thanks-card').classList.contains('hold'));
  await page.screenshot({path:process.env.SCREENSHOT_PATH||'test-results/preview.png',fullPage:true});
  const session=await act(()=>frame.__chatThanks.runtime.engine.sessionId);
  await act(()=>mount());
  assert.equal(await act(()=>frame.__chatThanks.runtime.engine.sessionId),session);
  assert.equal(await act(()=>[...frame.__chatThanks.runtime.engine.users.values()][0].messageCount),6);
  assert.equal(await act(()=>[...frame.__chatThanks.runtime.engine.users.values()][0].rewarded),true);
  console.log('✓ Порог, активность, плашка, сохранение и перезагрузка');
  // Настоящий DOM: payload остаётся текстом, обработчик onerror не выполняется.
  await act(()=>{const r=frame.__chatThanks.runtime;r.renderer.s.displaySeconds=1;return r.renderer.show({displayName:'<img src=x onerror="window.__xss=1">',firstSeenAt:now()-3600000,messageCount:5},now());});
  assert.equal(await act(()=>frame.__xss),undefined);
  assert.equal(await act(()=>frame.document.getElementById('thanks-name').children.length),0);
  assert.match(await act(()=>frame.document.getElementById('thanks-name').textContent),/^<img/);
  console.log('✓ DOM защищён от внедрения HTML и JavaScript');
  // Стресс очереди: короткие реальные таймеры, все 10 показаны последовательно.
  await act(()=>{const r=frame.__chatThanks.runtime;r.s.persistence=false;r.engine.reset();r.s.minMessages=1;r.engine.s.minMessages=1;r.renderer.s.enterSeconds=.01;r.renderer.s.exitSeconds=.01;r.renderer.s.displaySeconds=.02;r.s.gapSeconds=0;
    window.__shown=[];const original=r.renderer.show.bind(r.renderer);window.__concurrent=0;window.__maxConcurrent=0;
    r.renderer.show=async u=>{window.__concurrent++;window.__maxConcurrent=Math.max(window.__maxConcurrent,window.__concurrent);window.__shown.push(u.userId);await original(u,now());window.__concurrent--;};
    for(let i=0;i<10;i++)send('Queue'+i,1);jump(60*60000);for(let i=0;i<10;i++)send('Queue'+i,1);
  });
  await page.waitForFunction(()=>window.__shown?.length===10 && window.__concurrent===0);
  assert.equal(await act(()=>window.__maxConcurrent),1);
  assert.equal(await act(()=>new Set(window.__shown).size),10);
  console.log('✓ 10 благодарностей без наложений и потери');
  // Повторный onWidgetLoad не создаёт дублирующихся message handlers.
  await act(()=>mount());
  await act(()=>send('Handlers',1));
  assert.equal(await act(()=>[...frame.__chatThanks.runtime.engine.users.values()].find(u=>u.username==='handlers').messageCount),1);
  // Сброс действительно удаляет старую сессию из серверного эмулятора.
  const before=await act(()=>frame.__chatThanks.runtime.engine.sessionId);
  await act(()=>event({listener:'widget-button',event:{field:'clearData',value:'clear'}}));
  await page.waitForFunction(old=>{const r=document.getElementById('widget').contentWindow.__chatThanks.runtime;return r.ready&&r.engine.sessionId!==old;},before);
  assert.equal(await act(()=>frame.__chatThanks.runtime.engine.users.size),0);
  await act(()=>mount());
  assert.equal(await act(()=>frame.__chatThanks.runtime.engine.users.size),0);
  console.log('✓ Обработчики и очистка сохранённого состояния');
  await act(()=>{
    delete frame.__CHAT_THANKS_PREVIEW__;
    frame.dispatchEvent(new frame.CustomEvent('onWidgetLoad',{detail:{fieldData:{...defaults,testMode:true,testRewardSeconds:1,checkSeconds:10,storageNamespace:'BrowserIsolatedTest',testName:'Synthetic',displaySeconds:1}}}));
  });
  await page.waitForFunction(()=>{const r=document.getElementById('widget').contentWindow.__chatThanks.runtime;return r.ready&&r.s.testMode;});
  await act(()=>send('RealViewer',5));
  assert.equal(await act(()=>frame.__chatThanks.runtime.engine.users.size),0);
  await act(()=>event({listener:'widget-button',event:{field:'testActivity',value:'messages'}}));
  assert.equal(await act(()=>frame.__chatThanks.runtime.engine.users.size),1);
  await page.waitForTimeout(1050);
  await act(()=>{const r=frame.__chatThanks.runtime;r.engine.tick();return r.pump();});
  assert.equal(await act(()=>[...frame.__chatThanks.runtime.engine.users.values()][0].rewarded),true);
  assert.match(await act(()=>frame.__chatThanks.runtime.storage.key),/Test$/);
  console.log('✓ Тестовая кнопка, короткий порог и изоляция от реального чата');
  assert.deepEqual(errors,[]);console.log('✓ Ошибок JavaScript в Chromium нет');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
