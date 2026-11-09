const {test}=require('node:test');const assert=require('node:assert/strict');
const {AvatarLookup,avatarURL}=require('../widget/JS.js');
const url='https://static-cdn.jtvnw.net/jtv_user_pictures/avatar-profile_image-300x300.png';
test('Принимаются только HTTPS-адреса аватаров Twitch CDN',()=>{
 assert.equal(avatarURL(url),url);
 for(const v of ['javascript:alert(1)','https://evil.com/x.png','https://static-cdn.jtvnw.net@evil.com/jtv_user_pictures/x.png','http://static-cdn.jtvnw.net/jtv_user_pictures/x.png','https://static-cdn.jtvnw.net:444/jtv_user_pictures/x.png','https://static-cdn.jtvnw.net/other/x.png',null])assert.equal(avatarURL(v),null);
});
test('Логин нормализуется; запрос анонимный; повторная награда использует кеш',async()=>{
 let calls=0,clock=0;const lookup=new AvatarLookup(async (endpoint,options)=>{calls++;assert.equal(endpoint,'https://decapi.me/twitch/avatar/xelennum');assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');return {ok:true,text:async()=>url};},()=>clock);
 assert.equal(await lookup.get('@XeLeNnUm'),url);assert.equal(await lookup.get('xelennum'),url);assert.equal(calls,1);
 clock=16*60000;assert.equal(await lookup.get('xelennum'),url);assert.equal(calls,2);
});
test('Неподходящий логин не отправляется внешнему сервису',async()=>{let calls=0;const lookup=new AvatarLookup(async()=>{calls++;});for(const v of ['../x','a b','<script>','x'.repeat(26),''])assert.equal(await lookup.get(v),null);assert.equal(calls,0);});
test('Ошибки HTTP и неверный ответ кешируются на пять минут',async()=>{
 let calls=0;const lookup=new AvatarLookup(async()=>{calls++;return {ok:false};});assert.equal(await lookup.get('viewer'),null);assert.equal(await lookup.get('viewer'),null);assert.equal(calls,1);
 const bad=new AvatarLookup(async()=>({ok:true,text:async()=>'<img src=x onerror=alert(1)>'}));assert.equal(await bad.get('viewer'),null);
});
test('Тайм-аут отменяет запрос без зависания',async()=>{
 const lookup=new AvatarLookup((_,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true})));lookup.timeoutMs=15;assert.equal(await lookup.get('viewer'),null);assert.ok(lookup.cache.has('viewer'));
});
test('Смена пользователя/закрытие отменяет запрос без записи испорченного кеша',async()=>{
 const lookup=new AvatarLookup((_,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true})));
 const controller=new AbortController();const pending=lookup.get('viewer',controller.signal);controller.abort();assert.equal(await pending,null);assert.equal(lookup.cache.has('viewer'),false);
});
test('Кеш ограничен ста пользователями',()=>{const lookup=new AvatarLookup();for(let i=0;i<150;i++)lookup.remember('u'+i,url,60000);assert.equal(lookup.cache.size,100);assert.equal(lookup.cache.has('u0'),false);});
