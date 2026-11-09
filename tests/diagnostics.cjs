'use strict';
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const js=read('widget/JS.js'), loader=read('widget/AUTOUPDATE.js');
const html=read('widget/HTML.html'),css=read('widget/CSS.css');
const defaults=JSON.parse(read('widget/DATA.json'));
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
 const page=await browser.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 async function setup(raw={},markup=html){
   await page.goto('http://127.0.0.1:8080/');
   await page.setContent('<!doctype html><html><head><style>'+css+'</style></head><body>'+markup+'</body></html>');
   await page.addScriptTag({content:js});
   await page.evaluate(fields=>dispatchEvent(new CustomEvent('onWidgetLoad',{detail:{fieldData:fields}})),{...defaults,persistence:false,displaySeconds:1,enterSeconds:.1,exitSeconds:.1,gapSeconds:0,...raw});
 }
 async function demo(nested=false){
   await page.evaluate(n=>dispatchEvent(new CustomEvent('onEventReceived',{detail:n?{listener:'event:test',event:{listener:'widget-button',field:'testAlert',value:'test'}}:{listener:'widget-button',event:{field:'testAlert',value:'test'}}})),nested);
 }
 try{
   await setup({instanceRole:'observer'});
   await page.waitForFunction(()=>window.__chatThanks.runtime?.ready);
   await demo(true);await page.waitForFunction(()=>!document.getElementById('thanks-card').hidden);
   assert.equal(await page.evaluate(()=>window.__chatThanks.runtime.engine.users.size),0);
   console.log('✓ Тестовая плашка работает у наблюдателя и с вложенным listener кнопки');
   await setup();await page.waitForFunction(()=>window.__chatThanks.runtime?.ready);
   await page.evaluate(()=>window.__chatThanks.runtime.storage.blocked=true);
   await demo();await page.waitForFunction(()=>!document.getElementById('thanks-card').hidden);
   assert.equal(await page.evaluate(()=>window.__chatThanks.runtime.engine.users.size),0);
   await page.evaluate(()=>dispatchEvent(new CustomEvent('onEventReceived',{detail:{listener:'message',event:{data:{nick:'real',userId:'1',displayName:'Real'}}}})));
   assert.equal(await page.evaluate(()=>window.__chatThanks.runtime.engine.users.size),0);
   console.log('✓ Конфликт записи не блокирует безопасную проверку оформления');
   // Немедленная кнопка до готовности runtime не теряется.
   await setup();await demo();await page.waitForFunction(()=>!document.getElementById('thanks-card').hidden);
   console.log('✓ Тестовая кнопка при ранней инициализации обрабатывается');
   await setup({},'');
   await page.waitForTimeout(100);await demo();
   assert.match(await page.locator('#chatthanks-diagnostic').textContent(),/Нет HTML виджета/);
   console.log('✓ Отсутствующий HTML даёт видимую причину вместо молчания');
   // Нет GitHub и нет офлайн-копии: запрос теста показывает сообщение загрузчика.
   await page.goto('http://127.0.0.1:8080/');
   await page.setContent('<!doctype html><html><head></head><body></body></html>');
   await page.evaluate(()=>localStorage.clear());
   await page.route('https://raw.githubusercontent.com/xel92/widget-aktivnost/main/widget/JS.js*',route=>route.abort('internetdisconnected'));
   await page.addScriptTag({content:loader});
   await page.waitForTimeout(200);await demo(true);
   assert.match(await page.locator('#chatthanks-loader-diagnostic').textContent(),/Нет офлайн-копии|Не удалось получить обновление/);
   console.log('✓ Незагруженный скрипт показывает сетевую причину при тесте');
   assert.deepEqual(errors,[]);console.log('✓ Неожиданных ошибок JavaScript нет');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
