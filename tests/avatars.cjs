const {chromium}=require('playwright');
const fs=require('fs');const assert=require('node:assert/strict');
const root=require('node:path').join(__dirname,'..');const read=p=>fs.readFileSync(root+'/'+p,'utf8');
const profileURL='https://static-cdn.jtvnw.net/jtv_user_pictures/fixture-profile_image-300x300.png',profile=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR4nGMIWNXzH4QZYAwAVugKFaV8OQIAAAAASUVORK5CYII=','base64');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:760,height:430},deviceScaleFactor:2});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));let mode='ok',calls=0;
 await page.route('https://decapi.me/twitch/avatar/**',async route=>{
  calls++;if(mode==='slow')await new Promise(r=>setTimeout(r,1700));
  try{await route.fulfill({status:mode==='failed'?503:200,headers:{'access-control-allow-origin':'*','content-type':'text/plain'},body:profileURL+(mode==='image-failed'?'?broken=1':'')});}catch(_){/* Запрос уже отменён при закрытии плашки. */}
 });
 await page.route('https://static-cdn.jtvnw.net/jtv_user_pictures/**',route=>route.fulfill({status:mode==='image-failed'?404:200,contentType:'image/png',body:mode==='image-failed'?Buffer.alloc(0):profile}));
 try{
  await page.setContent('<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>'+read('widget/CSS.css')+'html,body{background:#0c141c!important}</style></head><body>'+read('widget/HTML.html')+'</body></html>');
  await page.addScriptTag({content:read('widget/JS.js')});
  const data=JSON.parse(read('widget/DATA.json'));
  await page.evaluate(data=>{window.base=data;window.user={username:'viewer',displayName:'Viewer',messageCount:6,firstSeenAt:Date.now()-3600000};window.r=new ChatThanks.Renderer(ChatThanks.settings({...base,position:'center',displaySeconds:60}),document);r.show(user,Date.now());},data);
  await page.waitForFunction(()=>document.querySelector('.thanks-icon').dataset.avatar==='ready'&&Number(getComputedStyle(document.querySelector('.thanks-icon')).opacity)===1);
  assert.equal(await page.locator('.thanks-avatar-image').evaluate(e=>e.naturalWidth),2);
  assert.equal(await page.locator('.thanks-seal-caption').textContent(),'ГЕРОЙ ЧАТА');
  const geometry=await page.locator('.thanks-avatar-shell').boundingBox();assert.ok(Math.abs(geometry.width-geometry.height)<1);
  console.log('✓ Аватар отображается в круге; задержка эмблемы сохранена');
  await page.evaluate(()=>{r.dispose();r=new ChatThanks.Renderer(ChatThanks.settings({...base,position:'center',avatarEnabled:false,displaySeconds:60}),document);r.show(user,Date.now());});
  const before=calls;await page.waitForTimeout(100);assert.equal(calls,before);assert.equal(await page.locator('.thanks-avatar-shell').evaluate(e=>e.hidden),true);
  assert.equal(await page.locator('.thanks-seal-caption').textContent(),'ПЕЧАТЬ ЧЕСТИ');
  console.log('✓ Переключатель возвращает печать без внешнего запроса');
  mode='failed';await page.evaluate(()=>{r.dispose();r=new ChatThanks.Renderer(ChatThanks.settings({...base,position:'center',displaySeconds:60}),document);r.show(user,Date.now());});
  await page.waitForFunction(()=>document.querySelector('.thanks-icon').dataset.avatar==='fallback');
  assert.equal(await page.locator('.thanks-avatar-shell').evaluate(e=>e.hidden),true);assert.equal(await page.locator('.thanks-seal svg').evaluate(e=>getComputedStyle(e).opacity),'1');
  console.log('✓ При недоступности сервиса возвращается печать');
  mode='image-failed';await page.evaluate(()=>{r.dispose();r=new ChatThanks.Renderer(ChatThanks.settings({...base,position:'center',displaySeconds:60}),document);r.show(user,Date.now());});
  await page.waitForFunction(()=>document.querySelector('.thanks-icon').dataset.avatar==='fallback');
  assert.equal(await page.locator('.thanks-avatar-shell').evaluate(e=>e.hidden),true);
  console.log('✓ При ошибке картинки также возвращается печать');
  mode='slow';await page.evaluate(async()=>{r.dispose();r=new ChatThanks.Renderer(ChatThanks.settings({...base,position:'center',enterSeconds:.1,displaySeconds:1,exitSeconds:.1}),document);const start=performance.now();await r.show(user,Date.now());window.elapsed=performance.now()-start;});
  assert.ok(await page.evaluate(()=>elapsed<1600));
  await page.evaluate(()=>{r.dispose();r=new ChatThanks.Renderer(ChatThanks.settings({...base,avatarEnabled:false,displaySeconds:60}),document);r.show({...user,displayName:'Следующий зритель'},Date.now());});
  await page.waitForTimeout(700);assert.equal(await page.locator('.thanks-icon').getAttribute('data-avatar'),'seal');assert.equal(await page.locator('.thanks-avatar-image').getAttribute('src'),null);
  assert.equal(await page.locator('#thanks-name').textContent(),'Следующий зритель');
  console.log('✓ Медленный ответ не задерживает очередь и не подставляет аватар предыдущего зрителя');
  await page.evaluate(()=>r.dispose());
  mode='ok';
  await page.evaluate(()=>{
   window.clock=Date.now();window.__CHAT_THANKS_PREVIEW__={now:()=>window.clock};
   dispatchEvent(new CustomEvent('onWidgetLoad',{detail:{fieldData:{...base,persistence:false,avatarEnabled:true,rewardMinutes:1,minMessages:1,displaySeconds:1}}}));
  });
  await page.waitForFunction(()=>window.__chatThanks.runtime?.ready);
  await page.evaluate(()=>{
   const send=id=>dispatchEvent(new CustomEvent('onEventReceived',{detail:{listener:'message',event:{data:{userId:'viewer-id',nick:'viewer',displayName:'LiveViewer',msgId:id}}}}));
   send('live-1');clock+=60000;send('live-2');
  });
  await page.waitForFunction(()=>document.querySelector('.thanks-icon').dataset.avatar==='ready');
  assert.equal(await page.locator('#thanks-name').textContent(),'LiveViewer');
  assert.equal(await page.evaluate(()=>window.__chatThanks.runtime.engine.users.get('id:viewer-id').rewarded),true);
  await page.evaluate(()=>window.__chatThanks.dispose());
  console.log('✓ Аватар автоматически загружается по логину из сообщения чата при реальной выдаче награды');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
