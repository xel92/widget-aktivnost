'use strict';
const $=id=>document.getElementById(id);
let frame, defaults, files, sequence=0, starting=false;
let offset=Number(sessionStorage.getItem('chatthanks-preview-offset')||0), rate=1, anchor=Date.now();
const now=()=>offset+(Date.now()-anchor)*rate;
function jump(ms){offset=now()+ms;anchor=Date.now();sessionStorage.setItem('chatthanks-preview-offset',String(offset));tick();}
// Начало условного времени основано на реальной дате, чтобы проходить валидацию snapshot.
if(!offset)offset=Date.now();
function log(s){const box=$('log');box.textContent=new Date(now()).toLocaleTimeString('ru-RU')+' · '+s+'\n'+box.textContent.slice(0,4000);}
function event(detail){frame.dispatchEvent(new frame.CustomEvent('onEventReceived',{detail}));}
function send(name,count=1){for(let i=0;i<count;i++)event({listener:'message',event:{data:{nick:name.toLowerCase(),displayName:name,userId:'preview-'+name.toLowerCase(),msgId:'p-'+Date.now()+'-'+(++sequence),text:'Сообщение локального теста',tags:{}}}});log(name+': '+count+' сообщ.');tick();}
function tick(){if(frame?.__chatThanks?.runtime?.ready){frame.__chatThanks.runtime.engine.tick();frame.__chatThanks.runtime.pump();}render();}
function render(){
 const r=frame?.__chatThanks?.runtime;if(!r?.ready)return;
 const e=r.engine, rows=$('rows');rows.replaceChildren();
 for(const u of [...e.users.values()].slice(0,30)){
  const tr=document.createElement('tr');
  for(const value of [u.displayName,u.messageCount,Math.floor((now()-u.firstSeenAt)/60000),Math.floor((now()-u.lastMessageAt)/60000)+' мин',u.rewarded?'✓ Выдана':e.pending.has(e.key(u))?'В очереди':'Ожидает']){const td=document.createElement('td');td.textContent=value;tr.append(td);}rows.append(tr);
 }
 $('users').textContent=e.users.size;$('queue').textContent=e.queue.length;$('awarded').textContent=[...e.users.values()].filter(u=>u.rewarded).length;
 $('session').textContent='Сессия: '+e.sessionId+' · показаны первые 30 зрителей';
 $('clock').textContent=new Date(now()).toLocaleTimeString('ru-RU')+' · ×'+rate;
}
async function mount(){
 if(starting)return;starting=true;
 try{
  if(frame?.__chatThanks){await frame.__chatThanks.runtime?.flush(true);frame.__chatThanks.dispose();}
  const doc=$('widget').contentDocument;doc.open();doc.write('<!doctype html><html lang="ru"><head><meta charset="utf-8"></head><body></body></html>');doc.close();frame=$('widget').contentWindow;
  frame.__CHAT_THANKS_PREVIEW__={now};
  // Эмулятор только для preview. Это не заявление о серверном API localStorage.
  frame.SE_API={store:{get:key=>Promise.resolve(JSON.parse(localStorage.getItem('chatthanks-preview:'+key)||'null')),set(key,value){
    localStorage.setItem('chatthanks-preview:'+key,JSON.stringify(value));
    setTimeout(()=>event({listener:'kvstore:update',event:{data:{key:'customWidget.'+key,value}}}),10);
  }}};
  const style=doc.createElement('style');style.textContent=files[1];doc.head.append(style);
  doc.body.innerHTML=files[0]; // Только статический HTML из widget/HTML.html.
  const script=doc.createElement('script');script.textContent=files[2];doc.body.append(script);
  frame.addEventListener('chatthanks:status',e=>log(e.detail));
  const ready=new Promise(resolve=>frame.addEventListener('chatthanks:ready',resolve,{once:true}));
  frame.dispatchEvent(new frame.CustomEvent('onWidgetLoad',{detail:{fieldData:{...defaults,storageNamespace:'PreviewOnly',allowRepeat:$('repeat').checked,displaySeconds:3,gapSeconds:.4}}}));
  await ready;log('Виджет загружен; хранилище preview изолировано');render();
 }catch(e){$('error').textContent=e.message;}finally{starting=false;}
}
async function main(){
 const paths=['../widget/HTML.html','../widget/CSS.css','../widget/JS.js','../widget/DATA.json'];
 files=await Promise.all(paths.map(async p=>{const r=await fetch(p);if(!r.ok)throw new Error('Не удалось загрузить '+p);return r.text();}));defaults=JSON.parse(files[3]);
 await mount();
 $('send').onclick=()=>send($('name').value||'NightWalker',Math.max(1,Math.min(100,Number($('count').value)||1)));
 $('demo').onclick=()=>event({listener:'widget-button',event:{field:'testAlert',value:'test'}});
 for(const b of document.querySelectorAll('[data-jump]'))b.onclick=()=>{jump(Number(b.dataset.jump)*60000);log('Время +'+b.dataset.jump+' мин');};
 $('speed').onchange=()=>{offset=now();anchor=Date.now();rate=Number($('speed').value);};
 $('reload').onclick=mount;$('repeat').onchange=mount;
 $('reset').onclick=()=>event({listener:'widget-button',event:{field:'resetSession',value:'reset'}});
 $('clear').onclick=async()=>{if(frame?.__chatThanks)frame.__chatThanks.dispose();localStorage.removeItem('chatthanks-preview:PreviewOnlyLive');localStorage.removeItem('chatthanks:PreviewOnlyLive');await mount();};
 $('ten').onclick=()=>{for(let i=1;i<=10;i++)send('Legend'+i,5);jump(60*60000);for(let i=1;i<=10;i++)send('Legend'+i,1);log('10 зрителей выполнили условия');};
 setInterval(render,500);setInterval(tick,1000);
}
main().catch(e=>{$('error').textContent='Запустите HTTP-сервер из корня проекта. '+e.message;});
