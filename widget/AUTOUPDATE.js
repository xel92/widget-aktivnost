/* Вкладка JS StreamElements: загрузчик HTML + CSS + JS из GitHub.
 * FIELDS и DATA устанавливаются вручную. HTML и CSS оставьте пустыми.
 * Нужен публичный репозиторий; проверка обновлений каждые 5 минут.
 */
(function (w) {
  'use strict';
  const REPO='xel92/widget-aktivnost';
  const REF='main';
  const REF_URL='https://api.github.com/repos/'+REPO+'/git/ref/heads/'+REF;
  const RAW='https://raw.githubusercontent.com/'+REPO+'/';
  const CACHE='chatthanks:autoupdate:bundle:v1:'+REPO+':'+REF;
  const MARKER='/* CHAT_THANKS_API:1 */';
  const PERIOD=5*60*1000;
  const REQUIRED=['thanks-card','thanks-title','thanks-name','thanks-text','thanks-minutes','thanks-messages'];
  if(w.__chatThanksUpdater)w.__chatThanksUpdater.dispose();
  let stopped=false,checking=false,switching=false,replaying=false;
  let loadDetail=null,source=null,candidate=null;
  let lastApp=w.__chatThanks&&!w.__chatThanks.disposed?w.__chatThanks:null;
  let interval,retry,diagnosticTimer,lastError='',buffer=[];
  const controllers=new Set();
  const warning=msg=>{lastError=msg;console.warn('[ChatThanks updater]',msg);if(document.getElementById('chatthanks-loader-diagnostic'))diagnostic();};
  function diagnostic(){
    let box=document.getElementById('chatthanks-loader-diagnostic');
    if(!box){box=document.createElement('div');box.id='chatthanks-loader-diagnostic';
      box.style.cssText='position:fixed;inset:12px 12px auto;z-index:2147483647;background:#241b36;color:#fff;padding:16px;border:1px solid #a879ff;border-radius:10px;font:16px/1.5 Arial,sans-serif;white-space:pre-wrap';
      (document.body||document.documentElement).appendChild(box);}
    box.textContent=lastError?'Комплект виджета не запустился: '+lastError+'\nДля ручной проверки установите HTML.html, CSS.css и обычный JS.js.':'Загружаются HTML, CSS и JavaScript из GitHub. Подождите до 30 секунд.';
    clearTimeout(diagnosticTimer);diagnosticTimer=setTimeout(()=>box.remove(),15000);
  }
  function parseHTML(html){
    if(typeof html!=='string'||html.length>250000)throw new Error('Некорректный HTML');
    const template=document.createElement('template');template.innerHTML=html;
    const roots=template.content.querySelectorAll('#thanks-root');
    if(roots.length!==1)throw new Error('В HTML должен быть один #thanks-root');
    const root=roots[0];
    for(const id of REQUIRED)if(root.querySelectorAll('#'+id).length!==1)throw new Error('В HTML отсутствует или повторяется #'+id);
    if(!root.querySelector('#thanks-card .thanks-particles'))throw new Error('В HTML отсутствует контейнер частиц');
    if(template.content.querySelector('script,iframe,object,embed,base,link,meta,style'))throw new Error('HTML должен содержать разметку; стили и скрипты устанавливаются отдельно');
    return root;
  }
  function valid(bundle){
    try{
      if(!bundle||bundle.formatVersion!==1||!/^[a-f0-9]{40}$/.test(bundle.commit)||
        typeof bundle.js!=='string'||bundle.js.length>500000||!bundle.js.startsWith(MARKER)||
        typeof bundle.css!=='string'||!bundle.css.trim()||bundle.css.length>250000)return false;
      parseHTML(bundle.html);return true;
    }catch(_){return false;}
  }
  const same=(a,b)=>a&&b&&a.js===b.js&&a.html===b.html&&a.css===b.css;
  function readCache(){try{const bundle=JSON.parse(w.localStorage.getItem(CACHE)||'null');return valid(bundle)?bundle:null;}catch(_){return null;}}
  function cache(bundle){try{w.localStorage.setItem(CACHE,JSON.stringify(bundle));}catch(_){warning('Не удалось сохранить офлайн-копию комплекта.');}}
  function emit(type,detail){replaying=true;try{w.dispatchEvent(new CustomEvent(type,{detail}));}finally{replaying=false;}}
  function onLoad(e){if(replaying)return;loadDetail=e.detail;if(switching||!lastApp)e.stopImmediatePropagation();}
  function onEvent(e){
    if(replaying||!e.detail)return;
    const listener=e.detail.event?.listener==='widget-button'?'widget-button':e.detail.listener;
    if(!['message','widget-button'].includes(listener))return;
    if(switching||!lastApp){
      e.stopImmediatePropagation();
      if(listener==='widget-button'&&['testAlert','testActivity','testRank1','testRank2','testRank3'].includes(e.detail.event?.field))diagnostic();
      if(buffer.length<5000)buffer.push(e.detail);else warning('Буфер обновления заполнен; новые события не принимаются.');
    }
  }
  function replay(){if(stopped)return;const events=buffer;buffer=[];for(const detail of events)emit('onEventReceived',detail);}
  async function request(url,max){
    const controller=new AbortController();controllers.add(controller);
    const timer=setTimeout(()=>controller.abort(),10000);
    try{
      const r=await fetch(url,{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal});
      if(!r.ok)throw new Error('HTTP '+r.status+' при загрузке '+new URL(url).pathname);
      const text=await r.text();if(text.length>max)throw new Error('Файл превышает допустимый размер');return text;
    }finally{clearTimeout(timer);controllers.delete(controller);}
  }
  async function downloadPinned(){
    const ref=JSON.parse(await request(REF_URL+'?t='+Date.now(),50000));
    const commit=ref?.object?.sha;
    if(!/^[a-f0-9]{40}$/.test(commit||''))throw new Error('GitHub не вернул SHA версии');
    if(source?.commit===commit)return source;
    if(candidate?.commit===commit)return candidate;
    // Все три файла читаются по одному SHA, даже если main изменится в процессе.
    const paths=['HTML.html','CSS.css','JS.js'];
    const results=await Promise.allSettled(paths.map((path,i)=>request(RAW+commit+'/widget/'+path,i===2?500000:250000)));
    const failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason;
    const bundle={formatVersion:1,commit,html:results[0].value,css:results[1].value,js:results[2].value};
    if(!valid(bundle))throw new Error('Комплект HTML/CSS/JS повреждён или несовместим с установленными FIELDS/загрузчиком');
    return bundle;
  }
  async function download(){
    try{return await downloadPinned();}
    catch(primary){
      // Один JSON содержит согласованные HTML/CSS/JS без обращения к GitHub API.
      try{
        const bundle=JSON.parse(await request(RAW+REF+'/widget/BUNDLE.json?t='+Date.now(),1200000));
        if(!valid(bundle))throw new Error('Некорректный резервный комплект');
        return bundle;
      }catch(fallback){throw new Error(primary.message+'; резервный комплект: '+fallback.message);}
    }
  }
  function mount(bundle){
    const next=parseHTML(bundle.html);
    const oldRoot=document.getElementById('thanks-root');
    const oldStyle=document.getElementById('chatthanks-auto-style');
    const style=document.createElement('style');style.id='chatthanks-auto-style';style.textContent=bundle.css;
    // Сохраняем реальные узлы для отката, а не только строки с исходниками.
    const rootParent=oldRoot?.parentNode||document.body||document.documentElement;
    const rootAfter=oldRoot?.nextSibling||null;
    const styleParent=oldStyle?.parentNode||document.head;
    const styleAfter=oldStyle?.nextSibling||null;
    const undo=()=>{
      next.remove();style.remove();
      if(oldRoot)rootParent.insertBefore(oldRoot,rootAfter?.parentNode===rootParent?rootAfter:null);
      if(oldStyle)styleParent.insertBefore(oldStyle,styleAfter?.parentNode===styleParent?styleAfter:null);
    };
    try{
      if(oldRoot)oldRoot.remove();if(oldStyle)oldStyle.remove();
      rootParent.insertBefore(next,rootAfter);styleParent.insertBefore(style,styleAfter);
      if(!style.sheet||style.sheet.cssRules.length===0)throw new Error('CSS не применился: проверьте синтаксис и политику браузера');
      return undo;
    }catch(error){undo();throw error;}
  }
  function inject(code){
    return new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'})),script=document.createElement('script');
      const previous=w.__chatThanks;let timer,finished=false;
      function finish(error){if(finished)return;finished=true;clearTimeout(timer);URL.revokeObjectURL(url);script.remove();if(error)reject(error);else resolve();}
      script.src=url;
      script.onload=()=>finish(!w.__chatThanks||w.__chatThanks===previous||w.__chatThanks.disposed||typeof w.ChatThanks?.Engine!=='function'?new Error('Новая версия не запустилась'):null);
      script.onerror=()=>finish(new Error('Браузер заблокировал запуск JS (CSP/blob) или код содержит ошибку'));
      timer=setTimeout(()=>finish(new Error('Тайм-аут запуска JavaScript')),10000);document.head.appendChild(script);
    });
  }
  async function waitReady(app){
    if(!loadDetail)return;
    let confirmed=false;
    await new Promise(resolve=>{
      const ready=()=>{if(w.__chatThanks===app){confirmed=true;cleanup();resolve();}};
      const cleanup=()=>{clearTimeout(timer);w.removeEventListener('chatthanks:ready',ready);};
      const timer=setTimeout(()=>{cleanup();resolve();},15000);
      w.addEventListener('chatthanks:ready',ready);emit('onWidgetLoad',loadDetail);
    });
    if(!confirmed||!app.runtime?.ready)throw new Error('Новый виджет не подтвердил готовность');
  }
  async function apply(){
    if(stopped||switching||!loadDetail||!candidate||same(candidate,source))return;
    const old=w.__chatThanks;
    if(lastApp&&(!old?.runtime?.canUpdate||!old.runtime.canUpdate()))return;
    switching=true;
    let handover=null,undo=null;const next=candidate;
    try{
      if(lastApp){handover=await old.runtime.prepareUpdate();if(!handover)return;w.__CHAT_THANKS_HANDOVER__=handover;}
      if(stopped)return;
      undo=mount(next);
      await inject(next.js);
      const app=w.__chatThanks;await waitReady(app);
      if(stopped)return;
      source=next;candidate=null;lastApp=app;lastError='';cache(source);
      console.info('[ChatThanks updater] HTML, CSS и JS обновлены вместе: '+source.commit.slice(0,7));
    }catch(e){
      warning(e.message);
      // Сначала остановить частично запущенный новый runtime и вернуть оба старых узла.
      if(w.__chatThanks&&w.__chatThanks!==old)w.__chatThanks.dispose();
      if(undo)undo();
      if(old&&!old.disposed){delete w.__CHAT_THANKS_HANDOVER__;lastApp=old;old.runtime?.resumeAfterUpdate();}
      else if(source){
        try{
          if(handover)w.__CHAT_THANKS_HANDOVER__=handover;
          await inject(source.js);lastApp=w.__chatThanks;await waitReady(lastApp);
        }catch(rollback){warning('Не удалось вернуть рабочий комплект: '+rollback.message);lastApp=null;}
      }else{lastApp=null;}
      candidate=null;
    }finally{
      switching=false;
      if(lastApp){document.getElementById('chatthanks-loader-diagnostic')?.remove();replay();}
    }
  }
  async function check(){
    if(stopped||checking)return;checking=true;
    try{
      const bundle=await download();if(stopped)return;
      if(same(bundle,source)){source=bundle;candidate=null;cache(source);}
      else{candidate=bundle;await apply();}
    }catch(e){
      if(stopped)return;
      warning('Не удалось получить обновление: '+e.message+(lastApp?'. Текущая версия продолжает работу.':''));
      if(!source&&!lastApp){const cached=readCache();if(cached){candidate=cached;await apply();}else warning('Ошибка загрузки: '+e.message+'. Нет офлайн-копии комплекта.');}
    }finally{checking=false;}
  }
  const pagehide=()=>w.__chatThanksUpdater?.dispose();
  w.__chatThanksUpdater={check,
    get ready(){return !switching&&!!lastApp;},get updating(){return switching;},get commit(){return source?.commit||null;},
    dispose(){
      stopped=true;clearTimeout(diagnosticTimer);document.getElementById('chatthanks-loader-diagnostic')?.remove();
      clearInterval(interval);clearInterval(retry);for(const controller of controllers)controller.abort();
      w.removeEventListener('onWidgetLoad',onLoad,true);w.removeEventListener('onEventReceived',onEvent,true);w.removeEventListener('pagehide',pagehide);
    }
  };
  w.addEventListener('onWidgetLoad',onLoad,true);w.addEventListener('onEventReceived',onEvent,true);w.addEventListener('pagehide',pagehide);
  interval=setInterval(check,PERIOD);retry=setInterval(()=>{if(!checking)apply().catch(e=>warning(e.message));},2000);check();
})(window);
