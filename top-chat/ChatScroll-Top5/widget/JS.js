/* CHATSCROLL_API:1 */
(function(global){
'use strict';
const VERSION=1, MINUTE=60000;
const DEFAULTS={enabled:true,title:'ТОП-5 ЧАТЕРОВ',subtitle:'Самые активные за стрим',width:520,scale:100,position:'right',offsetX:28,offsetY:28,fontSize:18,autoFit:true,
 paper:'#FFF9ED',paperSecondary:'#F8EEDC',gold:'#C49A47',ink:'#34251D',muted:'#86745F',leaderColor:'#F2E2B7',upColor:'#36805A',downColor:'#B54A43',
 count:5,excludeBots:true,excludedUsers:'',countCommands:false,spamProtection:true,minGapSeconds:.5,duplicateSeconds:8,avatars:true,avatarProvider:'decapi',titles:true,movement:true,progress:true,
 title1:'Голос дракона',title2:'Мастер беседы',title3:'Хранитель чата',title4:'Ученик свитка',title5:'Пробуждённый слушатель',
 firstEnabled:true,firstHeading:'ПОСЛЕДНИЙ FIRST MESSAGE',firstFontSize:17,firstAuthor:true,firstAnimate:true,saveFirst:true,firstDiagnostics:false,
 popupSeconds:300,displaySeconds:15,enterSeconds:.8,exitSeconds:.8,direction:'right',animations:true,listAnimation:true,rankAnimation:true,newAnimation:true,refreshSeconds:15,
 persistence:true,saveSeconds:15,storageNamespace:'ChatScrollTop5',instanceRole:'writer',resetMode:'manual',idleHours:6,retentionHours:48,resetToken:'initial',debug:false,
 maxUsers:3000,testMode:false,pinPreview:false};
const RANGES={width:[280,1000],scale:[20,200],offsetX:[0,1000],offsetY:[0,1000],fontSize:[12,32],count:[1,5],minGapSeconds:[0,10],duplicateSeconds:[0,120],firstFontSize:[12,32],popupSeconds:[5,7200],displaySeconds:[1,300],enterSeconds:[0,5],exitSeconds:[0,5],refreshSeconds:[1,120],saveSeconds:[5,300],idleHours:[1,168],retentionHours:[1,720],maxUsers:[10,10000]};
const BOTS=new Set(['streamelements','streamlabs','nightbot','moobot','fossabot','sery_bot','wizebot','botisimo']);
const clean=(v,max=120)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,max):'';
const login=v=>clean(v).trim().replace(/^@/,'').toLowerCase();
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const id=()=>global.crypto?.randomUUID?global.crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
function settings(raw={}){const s={...DEFAULTS};for(const k of Object.keys(s)){if(!(k in raw))continue;if(RANGES[k]){const n=Number(raw[k]);if(Number.isFinite(n))s[k]=Math.max(RANGES[k][0],Math.min(RANGES[k][1],n));}else if(typeof s[k]==='boolean')s[k]=raw[k]===true||raw[k]==='true';else s[k]=clean(raw[k],k==='excludedUsers'?10000:300);}s.count=Math.floor(s.count);s.maxUsers=Math.floor(s.maxUsers);
for(const k of ['paper','paperSecondary','gold','ink','muted','leaderColor','upColor','downColor'])if(!/^#[\da-f]{6}$/i.test(s[k]))s[k]=DEFAULTS[k];
for(const [k,values] of Object.entries({position:['right','left','center','top-right','top-left','bottom-right','bottom-left'],direction:['right','left','up','down'],resetMode:['manual','idle'],instanceRole:['writer','observer'],avatarProvider:['decapi','fallback']}))if(!values.includes(s[k]))s[k]=DEFAULTS[k];
s.storageNamespace=s.storageNamespace.replace(/[^a-z\d]/gi,'').slice(0,48)||DEFAULTS.storageNamespace;s.exclusions=new Set(s.excludedUsers.split(/[,;\s]+/).map(login).filter(Boolean));return s;}
function normalize(detail){return detail?.event?.listener==='widget-button'?{...detail,listener:'widget-button'}:detail;}
function parseMessage(detail){if(detail?.listener!=='message')return null;const d=detail.event?.data;if(!d||typeof d!=='object'||d.kind==='youtube#liveChatMessage')return null;
const tags=d.tags&&typeof d.tags==='object'&&!Array.isArray(d.tags)?d.tags:{};
const username=login(d.nick),userId=clean(String(d.userId||tags['user-id']||''));if(!username&&!userId)return null;
const flag=tags['first-msg'];return {userId,username,displayName:clean(d.displayName||tags['display-name']||username||userId),text:typeof d.text==='string'?d.text:'',messageId:clean(String(d.msgId||tags.id||''),160),first:flag==='1'||flag===1?true:flag==='0'||flag===0?false:null,source:tags['source-room-id']&&tags['room-id']&&tags['source-room-id']!==tags['room-id']?'shared':'channel'};}
function digest(text){let h=2166136261;for(const c of text){h^=c.codePointAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(16)+':'+text.length;}
const compare=(a,b)=>b.messageCount-a.messageCount||a.firstSeenAt-b.firstSeenAt||(a.key<b.key?-1:a.key>b.key?1:0);
class Engine{
 constructor(raw={},now=Date.now){this.s=settings(raw);this.now=now;this.reset();}
 reset(){const now=this.now();this.sessionId=id();this.startedAt=now;this.lastActivityAt=now;this.users=new Map();this.seen=new Map();this.previous=new Map();this.lastFirst=null;this.revision=1;this.lastMaintenance=now;this.diag={received:0,confirmed:0,ordinary:0,unknown:0,duplicate:0,filtered:0,capacity:0,oversize:0};}
 key(m){return m.userId?'id:'+m.userId:'login:'+m.username;}
 excluded(m){return this.s.exclusions.has(m.username)||this.s.exclusions.has(login(m.userId))||(this.s.excludeBots&&BOTS.has(m.username));}
 maintain(){const now=this.now();this.lastMaintenance=now;if(this.s.resetMode==='idle'&&now-this.lastActivityAt>=this.s.idleHours*3600000)this.reset();for(const [k,u]of this.users)if(now-u.lastMessageAt>this.s.retentionHours*3600000){this.users.delete(k);this.previous.delete(k);this.revision++;}for(const [k,t]of this.seen)if(now-t>this.s.retentionHours*3600000)this.seen.delete(k);}
 message(m){if(!m)return false;const now=this.now();if(now-this.lastMaintenance>=15000)this.maintain();this.diag.received++;
 if(m.messageId&&this.seen.has(m.messageId)){this.diag.duplicate++;return false;}
 if(m.messageId){this.seen.set(m.messageId,now);if(this.seen.size>5000)this.seen.delete(this.seen.keys().next().value);this.revision++;}
 if(this.excluded(m)||m.source==='shared'){this.diag.filtered++;return false;}
 this.diag[m.first===true?'confirmed':m.first===false?'ordinary':'unknown']++;
 // Keep complete first-message text, including line breaks. Reject malformed oversized input instead of truncating.
 if(m.first===true){if(m.text.length<=65536){this.lastFirst={username:m.username,displayName:m.displayName,userId:m.userId,text:m.text,messageId:m.messageId,at:now,confirmed:true};this.revision++;}else this.diag.oversize++;}
 if(!this.s.countCommands&&m.text.trimStart().startsWith('!')){this.diag.filtered++;return false;}
 this.lastActivityAt=now;
 let key=this.key(m),u=this.users.get(key);
 if(!u&&m.userId&&m.username){const fallback='login:'+m.username;u=this.users.get(fallback);if(u){this.users.delete(fallback);u.key=key;u.userId=m.userId;this.users.set(key,u);if(this.previous.has(fallback)){this.previous.set(key,this.previous.get(fallback));this.previous.delete(fallback);}}}
 if(!u&&!m.userId)for(const [k,v]of this.users)if(v.username===m.username){key=k;u=v;break;}
 if(!u){if(this.users.size>=this.s.maxUsers){this.diag.capacity++;return false;}u={key,userId:m.userId,username:m.username,displayName:m.displayName,messageCount:0,firstSeenAt:now,lastMessageAt:now,lastAcceptedAt:null,lastDigest:'',lastDigestAt:0};this.users.set(key,u);}
 u.username=m.username||u.username;u.displayName=m.displayName||u.displayName;u.lastMessageAt=now;this.revision++;
 const hash=digest(m.text);
 if(this.s.spamProtection&&u.lastAcceptedAt!==null&&((now-u.lastAcceptedAt<this.s.minGapSeconds*1000)||(hash===u.lastDigest&&now-u.lastDigestAt<this.s.duplicateSeconds*1000))){this.diag.filtered++;return false;}
 u.messageCount=Math.min(Number.MAX_SAFE_INTEGER,u.messageCount+1);u.lastAcceptedAt=now;u.lastDigest=hash;u.lastDigestAt=now;return true;
 }
 rank(){return [...this.users.values()].filter(u=>u.messageCount>0&&!this.excluded(u)).sort(compare).slice(0,this.s.count);}
 view(commit=true){const users=this.rank(),old=this.previous;const rows=users.map((u,i)=>{const place=i+1,prev=old.get(u.key);const above=users[i-1];const tieWin=above&&(u.firstSeenAt<above.firstSeenAt||(u.firstSeenAt===above.firstSeenAt&&u.key<above.key));const gap=above?Math.max(0,above.messageCount-u.messageCount+(tieWin?0:1)):0;return {...u,place,title:this.s['title'+place],change:prev===undefined?null:prev-place,gap,progress:above?Math.min(1,u.messageCount/(u.messageCount+gap||1)):1};});if(commit){this.previous=new Map(rows.map(u=>[u.key,u.place]));this.revision++;}return {rows,first:this.lastFirst,sessionId:this.sessionId};}
 snapshot(){return {schemaVersion:VERSION,sessionId:this.sessionId,startedAt:this.startedAt,lastActivityAt:this.lastActivityAt,updatedAt:this.now(),resetToken:this.s.resetToken,users:[...this.users.values()].map(u=>({...u})),previous:[...this.previous],seen:[...this.seen],lastFirst:this.s.saveFirst?this.lastFirst:null};}
 restore(d){const now=this.now();if(!d||d.schemaVersion!==VERSION||typeof d.sessionId!=='string'||!d.sessionId||d.sessionId.length>160||!finite(d.startedAt)||!finite(d.lastActivityAt)||!finite(d.updatedAt)||d.startedAt<0||d.startedAt>d.lastActivityAt||d.lastActivityAt>now+MINUTE||d.updatedAt<d.startedAt||d.updatedAt>now+MINUTE||now-d.updatedAt>this.s.retentionHours*3600000||d.resetToken!==this.s.resetToken||!Array.isArray(d.users)||(this.s.resetMode==='idle'&&now-d.lastActivityAt>=this.s.idleHours*3600000))return false;
 const users=new Map();for(const v of d.users.slice(0,this.s.maxUsers)){if(!v||!Number.isSafeInteger(v.messageCount)||v.messageCount<1||!finite(v.firstSeenAt)||!finite(v.lastMessageAt)||v.firstSeenAt<d.startedAt||v.lastMessageAt<v.firstSeenAt||v.lastMessageAt>now+MINUTE||now-v.lastMessageAt>this.s.retentionHours*3600000)continue;const u={userId:clean(v.userId),username:login(v.username),displayName:clean(v.displayName),messageCount:v.messageCount,firstSeenAt:v.firstSeenAt,lastMessageAt:v.lastMessageAt,lastAcceptedAt:finite(v.lastAcceptedAt)&&v.lastAcceptedAt<=now?v.lastAcceptedAt:null,lastDigest:clean(v.lastDigest,40),lastDigestAt:finite(v.lastDigestAt)&&v.lastDigestAt<=now?v.lastDigestAt:0};if(!u.userId&&!u.username)continue;u.key=this.key(u);users.set(u.key,u);}
 this.users=users;this.sessionId=d.sessionId;this.startedAt=d.startedAt;this.lastActivityAt=d.lastActivityAt;this.previous=new Map();for(const pair of (Array.isArray(d.previous)?d.previous:[]).slice(0,5))if(Array.isArray(pair)&&users.has(pair[0])&&Number.isInteger(pair[1])&&pair[1]>=1&&pair[1]<=5)this.previous.set(pair[0],pair[1]);
 // The first visual baseline after restore is neutral, never invented movement.
 this.previous=new Map(this.rank().map((u,i)=>[u.key,i+1]));
 this.seen=new Map();for(const pair of (Array.isArray(d.seen)?d.seen:[]).slice(-5000))if(Array.isArray(pair)&&typeof pair[0]==='string'&&pair[0].length<=160&&finite(pair[1])&&pair[1]<=now+MINUTE&&now-pair[1]<=this.s.retentionHours*3600000)this.seen.set(pair[0],pair[1]);
 const f=d.lastFirst;this.lastFirst=this.s.saveFirst&&f?.confirmed===true&&typeof f.text==='string'&&f.text.length<=65536&&finite(f.at)&&f.at>=d.startedAt&&f.at<=now+MINUTE?{username:login(f.username),userId:clean(f.userId),displayName:clean(f.displayName),text:f.text,messageId:clean(f.messageId,160),at:f.at,confirmed:true}:null;this.revision++;return true;}
 deleteMessage(detail){const e=detail?.event;if(!this.lastFirst)return;const d=e?.data||e;if(detail.listener==='delete-message'&&d?.msgId===this.lastFirst.messageId||detail.listener==='delete-messages'&&String(d?.userId)===this.lastFirst.userId){this.lastFirst=null;this.revision++;}}
}
  class Persistence {
    constructor(s, api, local, notify=()=>{}) {
      this.s=s; this.api=api; this.local=local; this.notify=notify; this.writerId=id();
      this.key=s.storageNamespace+(s.testMode?'Test':'Live'); this.backupKey=`chatthanks:${this.key}`;
      this.enabled=s.persistence && s.instanceRole==='writer'; this.remote=!!(api && api.store && typeof api.store.get==='function' && typeof api.store.set==='function');
      this.blocked=false; this.base=null; this.inflight=null; this.disposed=false; this.pendingAck=null; this.failed=false;
    }
    warn(message) { this.notify(message); }
    localGet() { try { return JSON.parse(this.local.getItem(this.backupKey)||'null'); } catch (_) { return null; } }
    localSet(v) { try { this.local.setItem(this.backupKey,JSON.stringify(v)); } catch (_) { this.warn('Локальный резерв недоступен. После закрытия прогресс может потеряться.'); } }
    async timed(p,ms=5000) {
      let timer;
      try { return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Тайм-аут хранилища')),ms);})]); }
      finally { clearTimeout(timer); }
    }
    async load() {
      if (!this.s.persistence) return null;
      if (this.remote) {
        try {
          const data=await this.timed(Promise.resolve(this.api.store.get(this.key)));
          if (this.disposed) return null;
          this.base=data || null;
          // Неизвестную новую схему нельзя затирать старым клиентом.
          if (data && data.schemaVersion>VERSION) { this.blocked=true;this.warn('Новая версия схемы: запись остановлена. Обновите виджет.'); }
          return data;
        } catch (_) { this.remote=false; this.failed=true; }
      }
      this.warn('Серверное хранилище недоступно. Только локальный резерв Browser Source; другие браузеры его не видят.');
      const backup=this.localGet();if(backup&&backup.schemaVersion>VERSION){this.blocked=true;this.warn('Новая версия локальных данных: запись остановлена.');}return backup;
    }
    conflict() {
      this.blocked=true;
      this.warn('Обнаружен другой экземпляр. Награды и запись остановлены. Оставьте один активный виджет и перезагрузите его.');
      if (this.pendingAck) this.pendingAck.reject(new Error('Конфликт экземпляров'));
    }
    observe(detail) {
      const d=detail && detail.event && detail.event.data;
      if (!this.enabled || !detail || detail.listener!=='kvstore:update' || !d || d.key!==`customWidget.${this.key}`) return;
      const value=d.value;
      if (!value || typeof value!=='object') return;
      if (value.writerId!==this.writerId) { this.conflict(); return; }
      if (this.pendingAck && value.writeId===this.pendingAck.writeId) {
        this.base=value; this.pendingAck.resolve();
      }
    }
    save(data) {
      if (!this.enabled || this.blocked || this.disposed) return Promise.resolve(false);
      // Не объединяем устаревшие snapshot: вызывающая сторона повторит запись при dirty.
      if (this.inflight) return this.inflight.then(()=>false);
      this.inflight=this.write(data).finally(()=>{this.inflight=null;});
      return this.inflight;
    }
    async write(data) {
      const value={...data,writerId:this.writerId,writeId:id()};
      if (!this.remote) { this.localSet(value); return true; }
      try {
        const current=await this.timed(Promise.resolve(this.api.store.get(this.key)));
        if (this.disposed || this.blocked) return false;
        // Read-before-write: это обнаружение конфликта, а не атомарная блокировка.
        if ((current && current.writeId)!==(this.base && this.base.writeId)) { this.conflict();return false; }
        let resolve,reject;
        const ack=new Promise((yes,no)=>{resolve=yes;reject=no;});
        this.pendingAck={writeId:value.writeId,resolve,reject};
        try {
          // Некоторые реализации возвращают Promise: учитываем reject, но не считаем resolve подтверждением.
          const result=this.api.store.set(this.key,value);
          if (result && typeof result.catch==='function') result.catch(reject);
        } catch (e) { reject(e); }
        await this.timed(ack);
        if (this.disposed || this.blocked) return false;
        this.localSet(value); return true;
      } catch (_) {
        if (this.blocked || this.disposed) return false;
        this.remote=false; this.failed=true; this.localSet(value);
        this.warn('Запись SE_API не подтверждена. Используется локальный резерв; проверьте сеть и перезагрузите виджет.');
        return true;
      } finally { this.pendingAck=null; }
    }
    dispose() { this.disposed=true;if(this.pendingAck)this.pendingAck.reject(new Error('Остановлено')); }
  }
  function avatarURL(value){
    try{
      if(typeof value!=='string'||value.length>2048)return null;
      const url=new URL(value.trim());
      if(url.protocol!=='https:'||url.hostname!=='static-cdn.jtvnw.net'||url.port||url.username||url.password||!url.pathname.startsWith('/jtv_user_pictures/'))return null;
      url.hash='';return url.href;
    }catch(_){return null;}
  }
  class AvatarLookup {
    constructor(fetcher=(...args)=>global.fetch(...args),now=Date.now){this.fetcher=fetcher;this.now=now;this.cache=new Map();this.timeoutMs=2500;}
    remember(username,url,ttl){
      this.cache.delete(username);this.cache.set(username,{url,until:this.now()+ttl});
      if(this.cache.size>100)this.cache.delete(this.cache.keys().next().value);
    }
    markFailed(username){this.remember(login(username),null,5*MINUTE);}
    async get(username,signal){
      username=login(username);
      if(!/^[a-z0-9_]{1,25}$/.test(username)||signal?.aborted)return null;
      const cached=this.cache.get(username);
      if(cached&&cached.until>this.now())return cached.url;
      const controller=new AbortController(),abort=()=>controller.abort();
      signal?.addEventListener('abort',abort,{once:true});
      const timer=setTimeout(abort,this.timeoutMs);
      try{
        const response=await this.fetcher('https://decapi.me/twitch/avatar/'+encodeURIComponent(username),{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
        if(!response.ok)throw new Error('Avatar lookup failed');
        const url=avatarURL(await response.text());
        if(signal?.aborted)return null;
        this.remember(username,url,url?15*MINUTE:5*MINUTE);return url;
      }catch(_){if(!signal?.aborted)this.markFailed(username);return null;}
      finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
    }
  }

const SAMPLES={short:'Всем привет! Я здесь впервые 👋',medium:'Всем привет! Я здесь впервые, случайно нашёл ваш стрим и решил остаться посмотреть!',long:'Всем привет! Я впервые в этом чате. Очень нравится атмосфера, спокойное общение и оформление трансляции.\n\nДавно искал место, где можно обсуждать любимые истории, делиться впечатлениями и просто отдыхать после рабочего дня. Спасибо за тёплый приём!\n\nНадеюсь, впереди ещё много интересных эфиров. Буду рад познакомиться со всеми, послушать ваши рекомендации и присоединиться к обсуждению. Пусть сегодняшний вечер получится уютным и запоминающимся! 🌿✨',emoji:'Привет, чат! 👋🏽 🐉✨🍵 Спасибо за компанию! Семья: 👨‍👩‍👧‍👦 — всем уютного вечера 💛',link:'Привет! Делюсь длинной ссылкой:\nhttps://example.org/'+ 'длинный-путь-'.repeat(24)+'?message=hello'};
function demoView(s,kind='medium'){const names=['NightWalker','MiraFox','RoninArt','JadeStorm','Kitsu'],counts=[124,103,95,87,74];return {demo:true,rows:names.slice(0,s.count).map((name,i)=>({key:'demo:'+i,username:name.toLowerCase(),displayName:name,place:i+1,title:s['title'+(i+1)],messageCount:counts[i],change:[1,2,0,-1,1][i],gap:i?counts[i-1]-counts[i]+1:0,progress:i?counts[i]/(counts[i-1]+1):1})),first:{displayName:'NewWanderer',username:'newwanderer',text:SAMPLES[kind]||SAMPLES.medium,confirmed:true}};}
class Renderer{
 constructor(s,doc,notify=()=>{}){this.s=s;this.doc=doc;this.notify=notify;this.root=doc.getElementById('cs-root');this.shell=doc.getElementById('cs-shell');this.scroll=doc.getElementById('cs-scroll');if(!this.root||!this.shell||!this.scroll)throw new Error('Нет HTML ChatScroll: установите HTML.html');this.list=doc.getElementById('cs-list');this.nodes=new Map();this.avatars=new AvatarLookup();this.controllers=new Set();this.timers=new Map();this.epoch=0;this.disposed=false;this.visible=false;this.pinned=false;this.lastFirst='';
 const vars={paper:s.paper,'paper-secondary':s.paperSecondary,gold:s.gold,ink:s.ink,muted:s.muted,leader:s.leaderColor,up:s.upColor,down:s.downColor,font:s.fontSize+'px','first-font':s.firstFontSize+'px',enter:s.enterSeconds+'s',exit:s.exitSeconds+'s',dx:s.direction==='left'?'-45px':s.direction==='right'?'45px':'0px',dy:s.direction==='up'?'-30px':s.direction==='down'?'30px':'0px'};for(const [k,v]of Object.entries(vars))this.root.style.setProperty('--'+k,v);this.root.classList.toggle('no-motion',!s.animations);this.scroll.style.width=s.width+'px';this.doc.getElementById('cs-title').textContent=s.title;this.doc.getElementById('cs-subtitle').textContent=s.subtitle;this.doc.getElementById('cs-first-heading').textContent=s.firstHeading;
 this.resize=()=>this.fit();global.addEventListener('resize',this.resize);this.observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(()=>this.fit()):null;this.observer?.observe(this.scroll);
 }
 el(tag,cls,text){const e=this.doc.createElement(tag);e.className=cls;if(text!==undefined)e.textContent=text;return e;}
 makeRow(){const li=this.el('li','cs-row');const place=this.el('span','cs-place');const avatar=this.el('div','cs-avatar');avatar.append(this.el('span','','◇'));const img=this.el('img','');img.alt='';img.hidden=true;img.referrerPolicy='no-referrer';avatar.append(img);const detail=this.el('div','cs-detail'),top=this.el('div','cs-topline'),name=this.el('span','cs-name'),count=this.el('span','cs-count'),title=this.el('p','cs-title'),meta=this.el('div','cs-meta'),change=this.el('span','cs-change'),gap=this.el('span','cs-gap'),track=this.el('div','cs-track'),bar=this.el('i','');top.append(name,count);meta.append(change,gap);track.append(bar);detail.append(top,title,meta,track);li.append(place,avatar,detail);return {li,place,avatar,img,name,count,title,change,gap,track,bar,login:null};}
 loadAvatar(node,u,demo){const who=this.s.avatars&&!demo&&this.s.avatarProvider==='decapi'?u?.username:null;if(node.login===who)return;node.login=who;node.controller?.abort();clearTimeout(node.avatarTimer);node.img.onload=node.img.onerror=null;node.img.removeAttribute('src');node.img.hidden=true;if(!who)return;const c=new AbortController();node.controller=c;this.controllers.add(c);node.avatarTimer=setTimeout(()=>{c.abort();node.img.removeAttribute('src');node.img.hidden=true;this.controllers.delete(c);},3500);
 const failed=()=>{clearTimeout(node.avatarTimer);node.img.hidden=true;node.img.removeAttribute('src');this.avatars.markFailed(who);this.controllers.delete(c);};this.avatars.get(who,c.signal).then(url=>{if(c.signal.aborted||this.disposed||node.login!==who)return;if(!url){failed();return;}node.img.onload=()=>{if(!c.signal.aborted&&node.login===who)node.img.hidden=false;clearTimeout(node.avatarTimer);this.controllers.delete(c);};node.img.onerror=failed;node.img.src=url;}).catch(failed);}
 render(view){if(this.disposed)return;const s=this.s,positions=new Map([...this.nodes].map(([k,n])=>[k,n.li.getBoundingClientRect().top])),keep=new Set();this.doc.getElementById('cs-test-label').hidden=!view.demo;
 for(let i=0;i<s.count;i++){const u=view.rows[i],key=u?.key||'empty:'+i;keep.add(key);let n=this.nodes.get(key),fresh=!n;if(!n){n=this.makeRow();this.nodes.set(key,n);}n.li.style.setProperty('--index',i);n.li.classList.toggle('empty',!u);n.li.classList.toggle('no-avatar',!s.avatars);n.place.textContent=String(i+1);n.name.textContent=u?.displayName||'Место ждёт участника';n.count.textContent=u?u.messageCount+' сообщ.':'';n.title.textContent=u?.title||'Присоединяйтесь к беседе';n.title.hidden=!s.titles;n.avatar.hidden=!s.avatars;n.change.textContent=u?(u.change===null?'Новый':u.change>0?'↑ +'+u.change:u.change<0?'↓ −'+Math.abs(u.change):'Без изменений'):'';n.change.className='cs-change'+(u?.change>0?' up':u?.change<0?' down':'');n.change.hidden=!s.movement;n.gap.textContent=u?(i?'До #'+i+': '+u.gap:'Лидер чата'):'';n.track.hidden=!s.progress||!u;n.bar.style.transform='scaleX('+(u?.progress||0)+')';this.loadAvatar(n,u,view.demo);this.list.append(n.li);
 if(this.visible&&s.animations&&!global.matchMedia?.('(prefers-reduced-motion: reduce)').matches){if(fresh&&s.newAnimation)n.li.animate?.([{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:350});else if(!fresh&&s.rankAnimation){const dy=positions.get(key)-n.li.getBoundingClientRect().top;if(dy)n.li.animate?.([{transform:'translateY('+dy+'px)'},{transform:'none'}],{duration:350,easing:'ease-out'});}}
 }
 for(const [key,n]of this.nodes)if(!keep.has(key)){n.controller?.abort();this.controllers.delete(n.controller);clearTimeout(n.avatarTimer);n.li.remove();this.nodes.delete(key);}
 const first=this.doc.getElementById('cs-first'),author=this.doc.getElementById('cs-first-author'),text=this.doc.getElementById('cs-first-text');first.hidden=!s.firstEnabled;author.hidden=!s.firstAuthor||!view.first;author.textContent=view.first?.displayName||'';text.textContent=view.first?.text??'Пока никто не написал своё первое сообщение';const signature=JSON.stringify(view.first);if(signature!==this.lastFirst&&this.visible&&s.animations&&s.firstAnimate&&!global.matchMedia?.('(prefers-reduced-motion: reduce)').matches)first.animate?.([{opacity:.25,transform:'translateY(4px)'},{opacity:1,transform:'none'}],{duration:400});this.lastFirst=signature;this.fit();
 }
 fit(){if(this.disposed||this.shell.hidden)return;const s=this.s,w=global.innerWidth,h=global.innerHeight;const height=this.scroll.offsetHeight;let scale=s.scale/100;if(s.autoFit)scale=Math.min(scale,Math.max(.01,(w-2*s.offsetX)/s.width),Math.max(.01,(h-2*s.offsetY)/height));this.scroll.style.transform='scale('+scale+')';this.shell.style.width=s.width*scale+'px';this.shell.style.height=height*scale+'px';const x=s.position.includes('left')?s.offsetX:s.position==='center'?(w-s.width*scale)/2:w-s.offsetX-s.width*scale;const y=s.position.startsWith('top')?s.offsetY:s.position.startsWith('bottom')?h-s.offsetY-height*scale:Math.max(s.offsetY,(h-height*scale)/2);Object.assign(this.shell.style,{left:Math.max(0,x)+'px',top:Math.max(0,y)+'px',right:'auto'});this.requiredHeight=Math.ceil(height*s.scale/100+2*s.offsetY);if(!s.autoFit&&(height*scale>h-2*s.offsetY||s.width*scale>w-2*s.offsetX))this.notify('Свиток больше источника. Увеличьте размер Browser Source или включите «Вписывать в источник». Нужная высота: '+this.requiredHeight+' px.');}
 delay(ms){return new Promise(resolve=>{const timer=setTimeout(()=>{this.timers.delete(timer);resolve();},ms);this.timers.set(timer,resolve);});}
 cancel(){this.epoch++;for(const [t,resolve]of this.timers){clearTimeout(t);resolve();}this.timers.clear();}
 async show(view,pinned=false){this.cancel();const epoch=this.epoch;if(!this.s.enabled){this.hide();return;}this.pinned=pinned;this.visible=true;this.shell.hidden=false;this.render(view);this.shell.className='';void this.shell.offsetWidth;this.shell.className='enter'+(this.s.listAnimation?' list-motion':'');this.fit();const animated=this.s.animations&&!global.matchMedia?.('(prefers-reduced-motion: reduce)').matches;await this.delay(animated?Math.max(this.s.enterSeconds*1000,950):0);if(this.disposed||epoch!==this.epoch)return;this.shell.className='hold';if(pinned)return;
 // Full hold begins after the last row/first-message animation; long scrolls get extra reading time.
 const hold=this.s.displaySeconds+Math.max(0,Math.ceil((this.scroll.offsetHeight-850)/100))*2;await this.delay(hold*1000);if(this.disposed||epoch!==this.epoch)return;this.shell.className='exit';await this.delay(animated?this.s.exitSeconds*1000:0);if(epoch===this.epoch)this.hide();}
 hide(){this.cancel();this.visible=false;this.pinned=false;this.shell.hidden=true;this.shell.className='';}
 dispose(){this.disposed=true;this.hide();this.observer?.disconnect();global.removeEventListener('resize',this.resize);for(const c of this.controllers)c.abort();for(const n of this.nodes.values())clearTimeout(n.avatarTimer);this.nodes.clear();}
}
const exported={DEFAULTS,settings,parseMessage,normalize,Engine,Persistence,Renderer,AvatarLookup,avatarURL,demoView,SAMPLES,compare};
if(typeof module!=='undefined'&&module.exports)module.exports=exported;
if(!global.document)return;global.ChatScroll=exported;
if(global.__chatScroll)global.__chatScroll.dispose();
const app={runtime:null,disposed:false,chain:Promise.resolve(),pending:[]};let statusTimer;
function status(message,persistent=false){const node=global.document.getElementById('cs-status');if(node){node.hidden=false;node.textContent=message;clearTimeout(statusTimer);if(!persistent)statusTimer=setTimeout(()=>node.hidden=true,12000);}console.warn('[ChatScroll]',message);}
async function boot(raw){const s=settings(raw),engine=new Engine(s);let local;try{local=global.localStorage;}catch(_){local=null;}const store=new Persistence(s,global.SE_API,local,msg=>status(msg));const renderer=new Renderer(s,global.document,msg=>status(msg));let stopped=false,ready=false,saving=false,savedRevision=0,visualTimer,saveTimer,popupTimer,idleTimer,resetArmed=0;let demo=s.testMode,demoKind='medium',lastDiagnostic=0;
const alive=()=>!stopped&&!app.disposed;const writer=()=>alive()&&ready&&!store.blocked&&s.instanceRole==='writer';
const view=()=>demo?demoView(s,demoKind):engine.view();
const show=(pin=false)=>renderer.show(view(),pin).catch(e=>status('Ошибка показа: '+e.message,true));
const schedule=()=>{clearTimeout(popupTimer);popupTimer=setTimeout(()=>{if(!alive())return;if(!renderer.visible)show();schedule();},s.popupSeconds*1000);};
const runtime={s,engine,store,renderer,get ready(){return ready;},
 async flush(force=false){if(!writer()||!s.persistence||saving||(!force&&engine.revision===savedRevision))return;saving=true;const rev=engine.revision;try{if(await store.save(engine.snapshot()))savedRevision=rev;}finally{saving=false;}},
 show, event(detail){store.observe(detail);if(!alive())return;
 if(detail.listener==='widget-button'){const field=detail.event?.field;
 if(field==='testRanking'||field==='testFirst'||field==='testLong'||field==='testEmoji'||field==='testLink'){demo=true;demoKind=field==='testLong'?'long':field==='testEmoji'?'emoji':field==='testLink'?'link':field==='testFirst'?'short':'medium';show(renderer.pinned);return;}
 if(field==='showScroll'){show();return;}if(field==='pinScroll'){show(true);return;}if(field==='hideScroll'){renderer.hide();return;}
 if(field==='liveData'){demo=s.testMode;if(s.testMode)status('Для реального чата выключите тестовый режим и сохраните настройки.');show(renderer.pinned);return;}
 if(field==='diagnostics'){status(runtime.diagnostics(),true);return;}
 if(field==='resetSession'){if(!writer()){status('Сброс недоступен: дождитесь загрузки и оставьте один активный экземпляр.');return;}if(Date.now()>resetArmed){resetArmed=Date.now()+8000;status('Нажмите «Сбросить сессию» повторно в течение 8 секунд для подтверждения.');return;}resetArmed=0;runtime.reset();return;}
 }
 if(!ready){if(app.pending.length<5000)app.pending.push(detail);return;}
 if(detail.listener==='message'&&writer()&&!s.testMode){const before=engine.lastFirst;engine.message(parseMessage(detail));if(engine.lastFirst!==before&&renderer.visible&&!demo)renderer.render(view());if(s.firstDiagnostics&&Date.now()-lastDiagnostic>3000){lastDiagnostic=Date.now();status(runtime.diagnostics());}}
 if(['delete-message','delete-messages'].includes(detail.listener)&&writer()){engine.deleteMessage(detail);if(!demo&&renderer.visible)renderer.render(view());}
 if(s.instanceRole==='observer'&&detail.listener==='kvstore:update'&&detail.event?.data?.key==='customWidget.'+store.key){if(engine.restore(detail.event.data.value)&&!demo&&renderer.visible)renderer.render(view());}
 },diagnostics(){const d=engine.diag;return 'ChatScroll 1.0 · '+(ready?'готов':'загрузка')+' · '+(s.testMode?'ТЕСТ':s.instanceRole)+'\nСобытий: '+d.received+'; first-msg=1: '+d.confirmed+'; =0: '+d.ordinary+'; неизвестно: '+d.unknown+'\nДубли: '+d.duplicate+'; фильтр: '+d.filtered+'; лимит участников: '+d.capacity+'; слишком длинных: '+d.oversize+'\nХранилище: '+(store.blocked?'конфликт — учёт остановлен':store.remote?'SE_API':'локальный резерв')+'\nБезопасная высота источника: '+(renderer.requiredHeight||'—')+' px. Отсутствие first-msg не означает первое сообщение.';},
 async reset(){ready=false;if(store.inflight)await store.inflight;if(!alive()||store.blocked)return;engine.reset();ready=true;await runtime.flush(true);if(renderer.visible)renderer.render(view());status('Новая сессия начата.');},
 dispose(){stopped=true;ready=false;clearTimeout(popupTimer);clearInterval(visualTimer);clearInterval(saveTimer);clearInterval(idleTimer);renderer.dispose();store.dispose();}
};app.runtime=runtime;
// Preview is independent of network persistence. Real chat waits for restoration.
renderer.render(view());if(s.pinPreview)show(true);
const data=await store.load();if(!alive())return;if(data&&!engine.restore(data))status('Старая/повреждённая сессия не восстановлена; начата новая.');ready=true;
if(writer())await runtime.flush(true);if(!alive())return;
for(const detail of app.pending.splice(0))runtime.event(detail);
if(renderer.visible&&!demo)renderer.render(view());
visualTimer=setInterval(()=>{if(alive()&&renderer.visible)renderer.render(view());},s.refreshSeconds*1000);
saveTimer=setInterval(()=>runtime.flush(),s.saveSeconds*1000);
idleTimer=setInterval(()=>{if(writer())engine.maintain();},30000);schedule();if(s.debug)status(runtime.diagnostics());global.dispatchEvent(new CustomEvent('chatscroll:ready'));
}
const onLoad=e=>{const raw=e.detail?.fieldData||{};app.chain=app.chain.then(async()=>{const old=app.runtime;if(old){await old.flush(true);old.dispose();if(old.store.inflight)await old.store.inflight;}if(!app.disposed)await boot(raw);}).catch(e=>status('Ошибка запуска ChatScroll: '+e.message,true));};
const onEvent=e=>{const detail=normalize(e.detail);if(!detail)return;if(app.runtime)app.runtime.event(detail);else if(app.pending.length<5000)app.pending.push(detail);};
const onHide=()=>app.runtime?.flush(true);
app.dispose=()=>{app.disposed=true;app.runtime?.dispose();clearTimeout(statusTimer);global.removeEventListener('onWidgetLoad',onLoad);global.removeEventListener('onEventReceived',onEvent);global.removeEventListener('pagehide',onHide);};global.addEventListener('onWidgetLoad',onLoad);global.addEventListener('onEventReceived',onEvent);global.addEventListener('pagehide',onHide);global.__chatScroll=app;
})(typeof window!=='undefined'?window:globalThis);
