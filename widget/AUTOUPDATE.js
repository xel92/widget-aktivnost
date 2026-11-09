/* Вставьте ЭТОТ файл вместо JS.js во вкладку JS StreamElements.
 * HTML, CSS, FIELDS и DATA устанавливаются обычным способом.
 * Репозиторий должен оставаться публичным. Проверка обновлений каждые 5 минут.
 */
(function (w) {
  'use strict';
  const SOURCE='https://raw.githubusercontent.com/xel92/widget-aktivnost/main/widget/JS.js';
  const CACHE='chatthanks:autoupdate:'+SOURCE;
  const MARKER='/* CHAT_THANKS_API:1 */';
  const PERIOD=5*60*1000;
  if(w.__chatThanksUpdater)w.__chatThanksUpdater.dispose();
  let stopped=false, checking=false, switching=false, replaying=false;
  let loadDetail=null, source='', candidate='', fallback='';
  let lastApp=w.__chatThanks&&!w.__chatThanks.disposed?w.__chatThanks:null;
  let interval, retry, controller, buffer=[];
  const warning=msg=>console.warn('[ChatThanks updater]',msg);
  function compatible(code){return typeof code==='string'&&code.length<500000&&code.startsWith(MARKER);}
  function readCache(){try{const code=w.localStorage.getItem(CACHE);return compatible(code)?code:'';}catch(_){return '';}}
  function cache(code){try{w.localStorage.setItem(CACHE,code);}catch(_){warning('Не удалось сохранить офлайн-копию JavaScript.');}}
  function emit(type,detail){replaying=true;try{w.dispatchEvent(new CustomEvent(type,{detail}));}finally{replaying=false;}}
  function onLoad(e){
    if(replaying)return;
    loadDetail=e.detail;
    if(switching||!lastApp)e.stopImmediatePropagation();
  }
  function onEvent(e){
    if(replaying||!e.detail)return;
    // Подтверждения хранилища всегда проходят в действующий runtime.
    if(!['message','widget-button'].includes(e.detail.listener))return;
    if(switching||!lastApp){
      e.stopImmediatePropagation();
      if(buffer.length<5000)buffer.push(e.detail);
      else warning('Буфер обновления заполнен; новые события не принимаются.');
    }
  }
  function replay(){
    if(stopped)return;
    const events=buffer;buffer=[];
    for(const detail of events)emit('onEventReceived',detail);
  }
  async function download(){
    controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),10000);
    try{
      const r=await fetch(SOURCE+'?t='+Date.now(),{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal});
      if(!r.ok)throw new Error('HTTP '+r.status);
      const code=await r.text();
      if(!compatible(code))throw new Error('Версия JS требует ручного обновления HTML/CSS/FIELDS или ответ некорректен');
      return code;
    }finally{clearTimeout(timer);controller=null;}
  }
  function inject(code){
    return new Promise((resolve,reject)=>{
      const blob=new Blob([code],{type:'text/javascript'});
      const url=URL.createObjectURL(blob),script=document.createElement('script');
      const previous=w.__chatThanks;
      let timer;
      function finish(error){
        clearTimeout(timer);URL.revokeObjectURL(url);script.remove();
        if(error)reject(error);else resolve();
      }
      script.src=url;
      script.onload=()=>finish(!w.__chatThanks||w.__chatThanks===previous||w.__chatThanks.disposed||typeof w.ChatThanks?.Engine!=='function' ? new Error('Новая версия не запустилась') : null);
      script.onerror=()=>finish(new Error('Браузер заблокировал загрузку JS (CSP/blob) или код содержит ошибку'));
      timer=setTimeout(()=>finish(new Error('Тайм-аут запуска JavaScript')),10000);
      document.head.appendChild(script);
    });
  }
  async function waitReady(app){
    if(!loadDetail)return; // onWidgetLoad ещё не пришёл: обычный обработчик увидит его позже.
    await new Promise(resolve=>{
        const ready=()=>{if(w.__chatThanks===app){cleanup();resolve();}};
        const timer=setTimeout(()=>{cleanup();resolve();},15000);
        const cleanup=()=>{clearTimeout(timer);w.removeEventListener('chatthanks:ready',ready);};
        w.addEventListener('chatthanks:ready',ready);
        emit('onWidgetLoad',loadDetail);
    });
    if(!app.runtime?.ready)throw new Error('Новый виджет не подтвердил готовность');
  }
  async function apply(){
    if(stopped||switching||!candidate||candidate===source)return;
    const old=w.__chatThanks;
    if(lastApp && (!old?.runtime?.canUpdate || !old.runtime.canUpdate()))return;
    switching=true;
    let handover=null;
    const next=candidate;
    try{
      if(lastApp){
        handover=await old.runtime.prepareUpdate();
        if(!handover)return;
        w.__CHAT_THANKS_HANDOVER__=handover;
      }
      if(stopped)return;
      await inject(next);
      const app=w.__chatThanks;
      await waitReady(app);
      if(stopped)return;
      fallback=source;source=next;candidate='';lastApp=app;
      cache(source);
      console.info('[ChatThanks updater] JavaScript загружен из GitHub; следующая проверка через 5 минут.');
    }catch(e){
      warning(e.message);
      // Если ошибка произошла до исполнения нового файла, старый обработчик ещё жив.
      if(old&&!old.disposed){lastApp=old;old.runtime?.resumeAfterUpdate();}
      else if(source||fallback){
        try{
          if(handover)w.__CHAT_THANKS_HANDOVER__=handover;
          await inject(source||fallback);lastApp=w.__chatThanks;await waitReady(lastApp);
        }catch(rollback){warning('Не удалось вернуть рабочую версию: '+rollback.message);lastApp=null;}
      }else{lastApp=null;}
      // Повторная загрузка той же неудачной версии только на следующем сетевом опросе.
      candidate='';
    }finally{
      switching=false;
      if(lastApp)replay();
    }
  }
  async function check(){
    if(stopped||checking)return;
    checking=true;
    try{const code=await download();if(!stopped&&code!==source){candidate=code;await apply();}}
    catch(e){
      if(stopped)return;
      warning('Не удалось получить обновление: '+e.message+'. Текущая версия продолжает работу.');
      if(!source&&!lastApp){const cached=readCache();if(cached){candidate=cached;await apply();}else warning('Нет офлайн-копии. Нужна сеть или установка обычного JS.js.');}
    }finally{checking=false;}
  }
  const pagehide=()=>w.__chatThanksUpdater?.dispose();
  w.__chatThanksUpdater={check,
    get ready(){return !switching&&!!lastApp;},
    get updating(){return switching;},
    dispose(){stopped=true;clearInterval(interval);clearInterval(retry);if(controller)controller.abort();w.removeEventListener('onWidgetLoad',onLoad,true);w.removeEventListener('onEventReceived',onEvent,true);w.removeEventListener('pagehide',pagehide);}
  };
  // Захватываем события до обработчиков удалённого скрипта и не теряем onWidgetLoad.
  w.addEventListener('onWidgetLoad',onLoad,true);
  w.addEventListener('onEventReceived',onEvent,true);
  w.addEventListener('pagehide',pagehide);
  interval=setInterval(check,PERIOD);
  retry=setInterval(()=>{if(!checking)apply().catch(e=>warning(e.message));},2000);
  check();
})(window);
