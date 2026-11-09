'use strict';
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const js=read('widget/JS.js'),loader=read('widget/AUTOUPDATE.js');
const html=read('widget/HTML.html'),css=read('widget/CSS.css');
const defaults=JSON.parse(read('widget/DATA.json'));
const sha=n=>n.toString(16).padStart(40,'0');
const release=n=>({
 'HTML.html':html.replace('id="thanks-root"','id="thanks-root" data-release="'+n+'"'),
 'CSS.css':css+'\n#thanks-root { --release: '+n+'; } #thanks-root #thanks-name { letter-spacing: '+n+'px; }',
 'JS.js':js+'\nwindow.__testVersion='+n+';'
});
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const releases=new Map();for(let n=1;n<=10;n++)releases.set(sha(n),release(n));
 let head=sha(1),offline=false,failedAsset='',hold=false,releaseRequest=null,changeHeadDuringAssets=null;
 const requested=[];
 const ref='https://api.github.com/repos/xel92/widget-aktivnost/git/ref/heads/main';
 const raw='https://raw.githubusercontent.com/xel92/widget-aktivnost/';
 await page.route(ref+'*',async route=>{
   if(offline)return route.abort('internetdisconnected');
   if(hold)await new Promise(resolve=>{releaseRequest=resolve;});
   await route.fulfill({status:200,headers:{'content-type':'application/json','access-control-allow-origin':'*'},body:JSON.stringify({object:{sha:head}})});
 });
 await page.route(raw+'**',async route=>{
   if(offline)return route.abort('internetdisconnected');
   const [commit,folder,file]=new URL(route.request().url()).pathname.split('/').slice(3);
   requested.push({commit,file});
   if(changeHeadDuringAssets){head=changeHeadDuringAssets;changeHeadDuringAssets=null;}
   await new Promise(resolve=>setTimeout(resolve,40));
   const body=releases.get(commit)?.[file];
   await route.fulfill({status:folder==='widget'&&body&&file!==failedAsset?200:503,headers:{'content-type':'text/plain','access-control-allow-origin':'*'},body:body||'missing'});
 });
 async function setup(clear=false){
   const clock=await page.evaluate(()=>window.__testNow||Date.now());
   await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:8080/');
   // Проверяем запуск с ПУСТЫМИ вкладками HTML и CSS.
   await page.setContent('<!doctype html><html><head></head><body></body></html>');
   if(clear)await page.evaluate(()=>localStorage.clear());
   await page.evaluate(clock=>{
     window.__testNow=clock;window.__CHAT_THANKS_PREVIEW__={now:()=>window.__testNow};window.__writes=0;
     window.SE_API={store:{get:async key=>JSON.parse(localStorage.getItem('mock:'+key)||'null'),set(key,value){window.__writes++;localStorage.setItem('mock:'+key,JSON.stringify(value));setTimeout(()=>dispatchEvent(new CustomEvent('onEventReceived',{detail:{listener:'kvstore:update',event:{data:{key:'customWidget.'+key,value}}}})),5);}}};
   },clock);
   await page.addScriptTag({content:loader});
   await page.evaluate(raw=>{
     window.__raw=raw;dispatchEvent(new CustomEvent('onWidgetLoad',{detail:{fieldData:raw}}));
     window.send=(name='viewer',count=1)=>{for(let i=0;i<count;i++)dispatchEvent(new CustomEvent('onEventReceived',{detail:{listener:'message',event:{data:{nick:name,userId:name,displayName:name,tags:{}}}}}));};
   },{...defaults,title:'Мой заголовок',displaySeconds:1,enterSeconds:.1,exitSeconds:.1,gapSeconds:0});
 }
 async function installed(n){
   await page.waitForFunction(n=>window.__chatThanksUpdater?.ready&&window.__chatThanks?.runtime?.ready&&window.__testVersion===n,n);
   assert.equal(await page.locator('#thanks-root').getAttribute('data-release'),String(n));
   assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('thanks-root')).getPropertyValue('--release').trim()),String(n));
   assert.equal(await page.locator('#thanks-name').evaluate(node=>getComputedStyle(node).letterSpacing),n+'px');
   assert.equal(await page.locator('#thanks-root').count(),1);assert.equal(await page.locator('#chatthanks-auto-style').count(),1);
 }
 const check=()=>page.evaluate(()=>window.__chatThanksUpdater.check());
 try{
   hold=true;await setup(true);await page.evaluate(()=>send('viewer',4));
   while(!releaseRequest)await new Promise(resolve=>setTimeout(resolve,10));hold=false;releaseRequest();
   await installed(1);
   assert.equal(await page.evaluate(()=>window.__chatThanks.runtime.engine.users.get('id:viewer').messageCount),4);
   const session=await page.evaluate(()=>window.__chatThanks.runtime.engine.sessionId);
   console.log('✓ Пустые HTML/CSS заполняются автоматически; ранние сообщения не потеряны');
   head=sha(2);
   await page.evaluate(()=>{
     const original=window.SE_API.store.get;window.SE_API.store.get=async key=>{await new Promise(resolve=>setTimeout(resolve,150));return original(key);};
     window.__updatePromise=window.__chatThanksUpdater.check();
   });
   await page.waitForFunction(()=>window.__chatThanksUpdater.updating);
   await page.evaluate(()=>send('during-update',2));await page.evaluate(()=>window.__updatePromise);await installed(2);
   assert.equal(await page.evaluate(()=>window.__chatThanks.runtime.engine.users.get('id:during-update').messageCount),2);
   assert.equal(await page.evaluate(()=>window.__chatThanks.runtime.engine.sessionId),session);
   assert.equal(await page.evaluate(()=>window.__chatThanks.runtime.engine.users.get('id:viewer').messageCount),4);
   assert.equal(await page.evaluate(()=>window.__chatThanks.runtime.s.title),'Мой заголовок');
   console.log('✓ HTML/CSS/JS заменяются вместе; сессия, FIELDS и сообщения во время замены сохраняются');
   await page.evaluate(()=>{window.__testNow+=3600000;send();});
   await page.waitForFunction(()=>!document.getElementById('thanks-card').hidden);
   head=sha(3);await check();await installed(2);
   await installed(3);
   assert.equal(await page.evaluate(()=>window.__chatThanks.runtime.engine.users.get('id:viewer').rewarded),true);
   console.log('✓ Изменение оформления ждёт завершения анимации и не повторяет награду');
   // Смена main в процессе скачивания не смешивает файлы из двух коммитов.
   head=sha(4);changeHeadDuringAssets=sha(5);const before=requested.length;
   await check();await installed(4);
   assert.ok(requested.slice(before).every(r=>r.commit===sha(4)));
   assert.equal(await page.evaluate(()=>window.__chatThanksUpdater.commit),sha(4));
   console.log('✓ Все файлы привязаны к одному SHA при смене main во время загрузки');
   // Падение одного запроса оставляет весь прежний комплект, включая DOM и CSS.
   failedAsset='CSS.css';await check();await installed(4);failedAsset='';
   releases.get(sha(5))['HTML.html']='<div id="thanks-root"></div>';
   await check();await installed(4);releases.set(sha(5),release(5));
   console.log('✓ Ошибка CSS/неполный HTML не заменяют действующий комплект частично');
   // Новый код успевает остановить старый runtime и затем падает: нужен полный откат.
   releases.get(sha(5))['JS.js']='/* CHAT_THANKS_API:1 */\nwindow.__chatThanks.dispose();throw new Error("broken release");';
   await check();await installed(4);
   assert.equal(await page.evaluate(()=>window.__chatThanks.runtime.engine.sessionId),session);
   await page.evaluate(()=>send('after-rollback',1));
   assert.equal(await page.evaluate(()=>window.__chatThanks.runtime.engine.users.get('id:after-rollback').messageCount),1);
   console.log('✓ При сбое нового JS возвращаются прежние HTML, CSS, логика и прогресс');
   releases.set(sha(5),release(5));offline=true;await check();await installed(4);
   await page.evaluate(()=>send('offline',1));
   assert.equal(await page.evaluate(()=>window.__chatThanks.runtime.engine.users.get('id:offline').messageCount),1);
   // После закрытия сети оформление тоже берётся из полного кеша, а не старых вкладок.
   await setup();await installed(4);
   assert.equal(await page.evaluate(()=>window.__chatThanks.runtime.engine.sessionId),session);
   console.log('✓ Без сети работают прежний комплект и его полный офлайн-кеш');
   offline=false;
   await page.evaluate(()=>{window.__raw.persistence=false;dispatchEvent(new CustomEvent('onWidgetLoad',{detail:{fieldData:window.__raw}}));});
   await page.waitForFunction(()=>window.__chatThanks?.runtime?.ready&&!window.__chatThanks.runtime.s.persistence);
   await page.evaluate(()=>send('memory',3));const writes=await page.evaluate(()=>window.__writes);
   await check();await installed(5);
   assert.equal(await page.evaluate(()=>window.__chatThanks.runtime.engine.users.get('id:memory').messageCount),3);
   assert.equal(await page.evaluate(()=>window.__writes),writes);
   console.log('✓ Состояние передаётся и при выключенном постоянном сохранении');
   const requestsBefore=requested.length;await check();assert.equal(requested.length,requestsBefore);
   // Только CSS изменился: JS тот же, но комплект всё равно должен обновиться.
   const onlyCSS={...releases.get(sha(5)),'CSS.css':css+'\n#thanks-root { --release: 55; } #thanks-root #thanks-name { letter-spacing: 55px; }'};
   releases.set(sha(6),onlyCSS);head=sha(6);await check();
   assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('thanks-root')).getPropertyValue('--release').trim()),'55');
   assert.equal(await page.evaluate(()=>window.__chatThanksUpdater.commit),sha(6));
   assert.equal(await page.evaluate(()=>window.__testVersion),5);
   assert.equal(await page.locator('#thanks-name').evaluate(node=>getComputedStyle(node).letterSpacing),'55px');
   console.log('✓ Отдельная правка CSS меняет оформление без изменения JS; неизменный SHA не скачивает файлы снова');
   const onlyHTML={...onlyCSS,'HTML.html':onlyCSS['HTML.html'].replace('<div class="thanks-copy">','<div class="thanks-copy"><span id="new-decoration">Новое оформление</span>')};
   releases.set(sha(7),onlyHTML);head=sha(7);await check();
   assert.equal(await page.locator('#new-decoration').textContent(),'Новое оформление');
   assert.equal(await page.locator('#thanks-name').evaluate(node=>getComputedStyle(node).letterSpacing),'55px');
   assert.equal(await page.evaluate(()=>window.__chatThanks.runtime.engine.users.get('id:memory').messageCount),3);
   assert.equal(await page.evaluate(()=>window.__chatThanksUpdater.commit),sha(7));
   console.log('✓ Отдельная правка HTML добавляет элементы, сохраняя CSS и прогресс');
   assert.ok(errors.every(e=>e==='broken release'),errors.join('\n'));console.log('✓ Нет неожиданных ошибок JavaScript');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
