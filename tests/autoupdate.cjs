'use strict';
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const js=fs.readFileSync(path.join(root,'widget/JS.js'),'utf8');
const loader=fs.readFileSync(path.join(root,'widget/AUTOUPDATE.js'),'utf8');
const html=fs.readFileSync(path.join(root,'widget/HTML.html'),'utf8');
const css=fs.readFileSync(path.join(root,'widget/CSS.css'),'utf8');
const data=JSON.parse(fs.readFileSync(path.join(root,'widget/DATA.json'),'utf8'));
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let version=1, offline=false, bad=false, hold=false, release=null;
 const source='https://raw.githubusercontent.com/xel92/widget-aktivnost/main/widget/JS.js';
 await page.route(source+'*',async route=>{
   if(offline)return route.abort('internetdisconnected');
   if(hold)await new Promise(resolve=>{release=resolve;});
   await new Promise(resolve=>setTimeout(resolve,50));
   await route.fulfill({status:200,headers:{'content-type':'text/plain','access-control-allow-origin':'*'},body:bad?'/* CHAT_THANKS_API:1 */\nthrow new Error("broken release");':js+`\nwindow.__testVersion=${version};`});
 });
 async function setup(clear=false){
   await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:8080/');
   await page.setContent('<!doctype html><html><head><style>'+css+'</style></head><body>'+html+'</body></html>');
   if(clear)await page.evaluate(()=>localStorage.clear());
   await page.evaluate(()=>{window.__testNow=Date.now();window.__CHAT_THANKS_PREVIEW__={now:()=>window.__testNow};window.__writes=0;
     window.SE_API={store:{get:async key=>JSON.parse(localStorage.getItem('mock:'+key)||'null'),set(key,value){window.__writes++;localStorage.setItem('mock:'+key,JSON.stringify(value));setTimeout(()=>dispatchEvent(new CustomEvent('onEventReceived',{detail:{listener:'kvstore:update',event:{data:{key:'customWidget.'+key,value}}}})),5);}}};
   });
   await page.addScriptTag({content:loader});
   await page.evaluate(raw=>{
     window.__raw=raw;
     dispatchEvent(new CustomEvent('onWidgetLoad',{detail:{fieldData:raw}}));
     window.send=(name='viewer',count=1)=>{for(let i=0;i<count;i++)dispatchEvent(new CustomEvent('onEventReceived',{detail:{listener:'message',event:{data:{nick:name,userId:name,displayName:name,tags:{}}}}}));};
   },{...data,displaySeconds:1,enterSeconds:.1,exitSeconds:.1,gapSeconds:0});
 }
 try{
   hold=true;await setup(true);await page.evaluate(()=>send('viewer',4));
   await page.waitForFunction(()=>!window.__chatThanks);
   hold=false;while(!release)await new Promise(resolve=>setTimeout(resolve,10));release();
   await page.waitForFunction(()=>window.__chatThanksUpdater?.ready&&window.__chatThanks?.runtime?.ready&&window.__testVersion===1);
   assert.equal(await page.evaluate(()=>window.__chatThanks.runtime.engine.users.get('id:viewer').messageCount),4);
   const session=await page.evaluate(()=>window.__chatThanks.runtime.engine.sessionId);
   console.log('✓ Поздняя загрузка JS не теряет onWidgetLoad и ранние сообщения');
   // Изменённый JS устанавливается и сохраняет прогресс без перезагрузки документа.
   version=2;
   await page.evaluate(()=>{
     const original=window.SE_API.store.get;
     window.SE_API.store.get=async key=>{await new Promise(resolve=>setTimeout(resolve,150));return original(key);};
     window.__updatePromise=window.__chatThanksUpdater.check();
   });
   await page.waitForFunction(()=>window.__chatThanks?.runtime?.ready&&!window.__chatThanks.runtime.canUpdate());
   await page.evaluate(()=>send('during-update',2));
   await page.evaluate(()=>window.__updatePromise);
   assert.equal(await page.evaluate(()=>window.__chatThanks.runtime.engine.users.get('id:during-update').messageCount),2);
   assert.equal(await page.evaluate(()=>window.__testVersion),2);
   assert.equal(await page.evaluate(()=>window.__chatThanks.runtime.engine.sessionId),session);
   assert.equal(await page.evaluate(()=>window.__chatThanks.runtime.engine.users.get('id:viewer').messageCount),4);
   console.log('✓ Горячее обновление сохраняет сессию, счётчики, FIELDS и сообщения во время замены');
   // Активная анимация откладывает обновление до освобождения очереди.
   await page.evaluate(()=>{window.__testNow+=3600000;send();});
   await page.waitForFunction(()=>!document.getElementById('thanks-card').hidden);
   version=3;await page.evaluate(()=>window.__chatThanksUpdater.check());
   assert.equal(await page.evaluate(()=>window.__testVersion),2);
   await page.waitForFunction(()=>window.__chatThanksUpdater.ready&&window.__testVersion===3);
   assert.equal(await page.evaluate(()=>window.__chatThanks.runtime.engine.users.get('id:viewer').rewarded),true);
   console.log('✓ Обновление ждёт завершения благодарности; награда не повторяется');
   // Неудачная загрузка не убивает действующую версию.
   offline=true;await page.evaluate(()=>window.__chatThanksUpdater.check());
   assert.equal(await page.evaluate(()=>window.__testVersion),3);
   await page.evaluate(()=>send('offline',1));
   assert.equal(await page.evaluate(()=>window.__chatThanks.runtime.engine.users.get('id:offline').messageCount),1);
   console.log('✓ При сбое сети текущий виджет продолжает учитывать чат');
   // Повторная загрузка без сети исполняет последнюю успешно проверенную копию.
   await setup();await page.waitForFunction(()=>window.__chatThanks?.runtime?.ready&&window.__chatThanksUpdater.ready&&window.__testVersion===3);
   console.log('✓ Последняя рабочая копия запускается офлайн');
   offline=false;bad=true;await page.evaluate(()=>window.__chatThanksUpdater.check());
   assert.equal(await page.evaluate(()=>window.__testVersion),3);
   await page.evaluate(()=>send('after-bad',1));
   assert.equal(await page.evaluate(()=>window.__chatThanks.runtime.engine.users.get('id:after-bad').messageCount),1);
   assert.equal(await page.evaluate(()=>window.__chatThanks.runtime.canUpdate()),true);
   console.log('✓ Ошибочная новая версия отклоняется, обработка чата возобновляется');
   // Потеря сервера/выключенное сохранение не мешают передаче в памяти при обновлении.
   bad=false;
   await page.evaluate(()=>{window.__raw.persistence=false;dispatchEvent(new CustomEvent('onWidgetLoad',{detail:{fieldData:window.__raw}}));});
   await page.waitForFunction(()=>window.__chatThanks?.runtime?.ready&&!window.__chatThanks.runtime.s.persistence);
   await page.evaluate(()=>send('memory',3));
   const writes=await page.evaluate(()=>window.__writes);
   version=4;await page.evaluate(()=>window.__chatThanksUpdater.check());
   assert.equal(await page.evaluate(()=>window.__testVersion),4);
   assert.equal(await page.evaluate(()=>window.__chatThanks.runtime.engine.users.get('id:memory').messageCount),3);
   assert.equal(await page.evaluate(()=>window.__writes),writes);
   console.log('✓ Передача в памяти работает и при отключённом сохранении');
   assert.ok(errors.every(e=>e==='broken release'),errors.join('\n'));
   console.log('✓ Нет неожиданных ошибок JavaScript');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
