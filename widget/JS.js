/* CHAT_THANKS_API:1 */
/* StreamElements Chat Thanks — автономный ES6+, без внешних зависимостей. */
(function (global) {
  'use strict';
  const VERSION = 2;
  const MINUTE = 60000;
  const DEFAULTS = {
    ranksEnabled:true, rank1Enabled:true, showPosition:true, rank2Enabled:true, rank3Enabled:true, rank2Minutes:120, rank3Minutes:180,
    rank1Name:'Адепт', rank2Name:'Мастер', rank3Name:'Небожитель',
    rank1Text:'Твой путь в нашей обители начался.', rank2Text:'Твоё присутствие придаёт чату силу.', rank3Text:'Твоё имя вписано в легенды нашего чата.', testRank:1,
    rewardMinutes:60, minMessages:5, recentMinutes:10, checkSeconds:15,
    excludeBots:true, excludedUsers:'', allowRepeat:false, maxUsers:2000, maxQueue:50,
    title:'ЛЕГЕНДА ЧАТА', thankText:'Спасибо, что провёл с нами целый час! 💜',
    primaryColor:'#a879ff', secondaryColor:'#f1cc79', backgroundColor:'#151123', textColor:'#fff7ed',
    statsFont:'Segoe UI', statsFontSize:11, titleFont:'Segoe UI', titleFontSize:12, nameFontSize:38, messageFontSize:22, iconDelaySeconds:.25, fontSize:22, cardWidth:580, cornerRadius:24, position:'bottom-right',
    enterSeconds:.65, displaySeconds:7, exitSeconds:.55, gapSeconds:1,
    particles:true, avatarEnabled:true, showMessages:true, showMinutes:true, soundEnabled:false, soundFile:'', volume:50,
    persistence:true, saveSeconds:15, retentionHours:48, resetMode:'idle', idleHours:6,
    storageNamespace:'ChatThanksV1', instanceRole:'writer', resetToken:'initial',
    testMode:false, testRewardSeconds:10, testName:'NightWalker', testMessages:5
  };
  const RANGES = {
    rank2Minutes:[1,10080], rank3Minutes:[1,10080], testRank:[1,3], rewardMinutes:[1,1440], minMessages:[1,10000], recentMinutes:[1,1440], checkSeconds:[10,30],
    statsFontSize:[8,36], maxUsers:[10,10000], maxQueue:[1,500], titleFontSize:[8,48], nameFontSize:[12,96], messageFontSize:[10,64], fontSize:[12,48], cardWidth:[280,1000], cornerRadius:[0,60],
    enterSeconds:[.1,5], displaySeconds:[1,60], exitSeconds:[.1,5], gapSeconds:[0,30],
    iconDelaySeconds:[0,2], volume:[0,100], saveSeconds:[5,60], retentionHours:[1,720], idleHours:[1,168],
    testRewardSeconds:[1,600], testMessages:[1,10000]
  };
  const BOTS = new Set(['streamelements','streamlabs','nightbot','moobot','fossabot','sery_bot','wizebot','botisimo']);
  const clean = (v, max=100) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,max) : '';
  const login = v => clean(v).trim().replace(/^@/,'').toLowerCase();
  const id = () => global.crypto && global.crypto.randomUUID ? global.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  const TITLE_FONTS={
    'Segoe UI':'"Segoe UI",Arial,sans-serif',
    'Arial':'Arial,Helvetica,sans-serif',
    'Georgia':'Georgia,"Times New Roman",serif',
    'Times New Roman':'"Times New Roman",Times,serif',
    'Verdana':'Verdana,Geneva,sans-serif',
    'Courier New':'"Courier New",Courier,monospace'
  };
  function settings(raw={}) {
    const s = {...DEFAULTS};
    for (const k of Object.keys(s)) {
      if (!(k in raw)) continue;
      if (RANGES[k]) {
        const n = Number(raw[k]);
        if (Number.isFinite(n)) s[k] = Math.max(RANGES[k][0], Math.min(RANGES[k][1], n));
      } else if (typeof s[k] === 'boolean') s[k] = raw[k] === true || raw[k] === 'true';
      else s[k] = clean(raw[k], k === 'excludedUsers' ? 10000 : 1000);
    }
    for (const k of ['minMessages','maxUsers','maxQueue','testMessages']) s[k] = Math.floor(s[k]);
    for (const k of ['primaryColor','secondaryColor','backgroundColor','textColor']) {
      if (!/^#[a-f\d]{3}([a-f\d]{3})?$/i.test(s[k])) s[k]=DEFAULTS[k];
    }
    // Старые FIELDS сохраняют прежние пропорции до установки новых контролов.
    if(!Object.prototype.hasOwnProperty.call(raw,'titleFontSize'))s.titleFontSize=s.fontSize*.46;
    if(!Object.prototype.hasOwnProperty.call(raw,'nameFontSize'))s.nameFontSize=s.fontSize*1.7;
    if(!Object.prototype.hasOwnProperty.call(raw,'messageFontSize'))s.messageFontSize=s.fontSize;
    if(!Object.prototype.hasOwnProperty.call(raw,'statsFontSize'))s.statsFontSize=s.fontSize*.49;
    if(!Object.prototype.hasOwnProperty.call(TITLE_FONTS,s.statsFont))s.statsFont=DEFAULTS.statsFont;
    if(!Object.prototype.hasOwnProperty.call(TITLE_FONTS,s.titleFont))s.titleFont=DEFAULTS.titleFont;
    if (!['top-left','top-right','bottom-left','bottom-right','center'].includes(s.position)) s.position=DEFAULTS.position;
    if (!['idle','manual'].includes(s.resetMode)) s.resetMode='idle';
    if (!['writer','observer'].includes(s.instanceRole)) s.instanceRole='observer';
    s.storageNamespace = s.storageNamespace.replace(/[^a-z\d]/gi,'').slice(0,48) || DEFAULTS.storageNamespace;
    s.rank2Minutes=Math.max(s.rewardMinutes+1,s.rank2Minutes);
    s.rank3Minutes=Math.max(s.rank2Minutes+1,s.rank3Minutes);
    s.testRank=Math.round(s.testRank);
    s.exclusions = new Set(s.excludedUsers.split(/[,;\s]+/).map(login).filter(Boolean));
    return s;
  }
  function normalizeEvent(detail) {
    if(!detail||typeof detail!=='object')return null;
    // Принимаем также совместимый вариант с listener внутри события кнопки.
    if(detail.event&&detail.event.listener==='widget-button')return {...detail,listener:'widget-button'};
    return detail;
  }
  function parseMessage(detail) {
    if (!detail || detail.listener !== 'message') return null;
    const d = detail.event && detail.event.data;
    if (!d || typeof d !== 'object') return null;
    const username = login(d.nick);
    const userId = clean(String(d.userId || (d.tags && d.tags['user-id']) || ''));
    if (!username && !userId) return null;
    return {userId, username, displayName:clean(d.displayName || (d.tags && d.tags['display-name']) || username || userId),
      messageId:clean(String(d.msgId || (d.tags && d.tags.id) || ''))};
  }
  function format(template, u, now) {
    const values={displayName:u.displayName,minutes:Math.max(0,Math.floor((now-u.firstSeenAt)/MINUTE)),messages:u.messageCount};
    return template.replace(/\{(displayName|minutes|messages)\}/g, (_, k) => String(values[k]));
  }
  class Engine {
    constructor(raw={}, now=Date.now) {
      this.s=settings(raw); this.now=now; this.users=new Map(); this.queue=[]; this.pending=new Set();
      this.seenMessages=new Map(); this.dirty=false; this.reset();
    }
    reset() {
      const now=this.now(); this.sessionId=id(); this.startedAt=now; this.lastActivityAt=now;
      this.users.clear(); this.queue=[]; this.pending.clear(); this.seenMessages.clear(); this.dirty=true;
    }
    excluded(u) { return this.s.exclusions.has(u.username) || this.s.exclusions.has(login(u.userId)) || (this.s.excludeBots && BOTS.has(u.username)); }
    rankAt(u,now=this.now()) {
      const elapsed=now-u.firstSeenAt;
      const unit=this.s.testMode?this.s.testRewardSeconds*1000/this.s.rewardMinutes:MINUTE;
      if(this.s.rank3Enabled&&elapsed>=this.s.rank3Minutes*unit)return 3;
      if(this.s.rank2Enabled&&elapsed>=this.s.rank2Minutes*unit)return 2;
      return this.s.rank1Enabled&&elapsed>=this.s.rewardMinutes*unit?1:0;
    }
    position(u) {
      let place=1;
      for(const other of this.users.values())if(!this.excluded(other)&&other.messageCount>u.messageCount)place++;
      return place;
    }
    checkRewardEligibility(u, now=this.now()) {
      const wait=this.s.testMode ? this.s.testRewardSeconds*1000 : this.s.rewardMinutes*MINUTE;
      return !!u && u.sessionId===this.sessionId && !this.excluded(u) && !this.pending.has(this.key(u)) &&
        now>=u.firstSeenAt && now-u.firstSeenAt>=wait && now-u.lastMessageAt<=this.s.recentMinutes*MINUTE &&
        now>=u.lastMessageAt && u.messageCount>=this.s.minMessages &&
        (this.s.ranksEnabled ? this.rankAt(u,now)>(u.rewardedRank||0) : (!u.rewarded || (this.s.allowRepeat && now-u.rewardedAt>=wait && u.lastMessageAt>u.rewardedAt)));
    }
    key(u) { return u.userId ? `id:${u.userId}` : `login:${u.username}`; }
    maintain(now=this.now()) {
      if (this.s.resetMode==='idle' && now-this.lastActivityAt>=this.s.idleHours*3600000) this.reset();
      for (const [k,u] of this.users) {
        // Награждённые остаются tombstone до конца сессии: очистка не должна разрешать дубль.
        if (!u.rewarded && !this.pending.has(k) && now-u.lastMessageAt>this.s.retentionHours*3600000) {
          this.users.delete(k); this.dirty=true;
        }
      }
    }
    message(m) {
      if (!m) return;
      const now=this.now(); this.maintain(now);
      if (m.messageId) {
        if (this.seenMessages.has(m.messageId)) return;
        this.seenMessages.set(m.messageId,now);
        if (this.seenMessages.size>5000) this.seenMessages.delete(this.seenMessages.keys().next().value);
      }
      let k=this.key(m), u=this.users.get(k);
      if (!u && m.userId && m.username) {
        const fallback=`login:${m.username}`;
        u=this.users.get(fallback);
        if (u) {
          this.users.delete(fallback); u.userId=m.userId; this.users.set(k,u);
          if(this.pending.delete(fallback)){this.pending.add(k);this.queue=this.queue.map(key=>key===fallback?k:key);}
        }
        else u=undefined;
      }
      // Если событие потеряло ID, используем уже известную стабильную запись.
      if (!u && !m.userId && m.username) {
        for (const [key,known] of this.users) if (known.username===m.username) { k=key; u=known; break; }
      }
      if (this.excluded(m)) return;
      this.lastActivityAt=now; this.dirty=true;
      if (!u) {
        if (this.users.size>=this.s.maxUsers) return;
        u={userId:m.userId||'', username:m.username, displayName:m.displayName||m.username,
          firstSeenAt:now,lastMessageAt:now,messageCount:0,rewardedRank:0,rewarded:false,rewardedAt:null,sessionId:this.sessionId};
        this.users.set(k,u);
      }
      u.username=m.username || u.username; u.displayName=m.displayName||u.displayName;
      u.lastMessageAt=now; u.messageCount=Math.min(Number.MAX_SAFE_INTEGER,u.messageCount+1);
      this.consider(u,now);
    }
    consider(u,now) {
      if (this.queue.length>=this.s.maxQueue || !this.checkRewardEligibility(u,now)) return false;
      const k=this.key(u); this.queue.push(k); this.pending.add(k); this.dirty=true; return true;
    }
    tick() {
      const now=this.now(); this.maintain(now);
      for (const u of this.users.values()) this.consider(u,now);
    }
    take() {
      while (this.queue.length) {
        const k=this.queue.shift(); this.pending.delete(k); this.dirty=true;
        const u=this.users.get(k), now=this.now();
        // Очередь могла ждать долго: проверяем актуальность ещё раз.
        if (!this.checkRewardEligibility(u,now)) continue;
        const rank=this.s.ranksEnabled?this.rankAt(u,now):0;
        u.rewardedRank=Math.max(u.rewardedRank||0,rank);
        u.rewarded=true; u.rewardedAt=now;
        return {...u,rank,chatPosition:this.position(u)};
      }
      return null;
    }
    snapshot() {
      return {schemaVersion:VERSION,sessionId:this.sessionId,startedAt:this.startedAt,lastActivityAt:this.lastActivityAt,
        resetToken:this.s.resetToken,updatedAt:this.now(),users:Array.from(this.users.values(),u=>({...u})),queue:[...this.queue]};
    }
    restore(data) {
      const now=this.now();
      if (!data || ![1,VERSION].includes(data.schemaVersion) || typeof data.sessionId!=='string' || !data.sessionId ||
        !finite(data.startedAt) || !finite(data.lastActivityAt) || !finite(data.updatedAt) ||
        data.startedAt<0 || data.startedAt>now+MINUTE || data.lastActivityAt<data.startedAt || data.lastActivityAt>now+MINUTE ||
        data.updatedAt>now+MINUTE || !Array.isArray(data.users)) return false;
      if (data.resetToken!==this.s.resetToken || now-data.updatedAt>this.s.retentionHours*3600000 ||
        (this.s.resetMode==='idle' && now-data.lastActivityAt>=this.s.idleHours*3600000)) return false;
      const users=new Map();
      // Не принимаем бесконечные или чрезмерно большие массивы из повреждённого хранилища.
      for (const raw of data.users.slice(0,this.s.maxUsers)) {
        if (!raw || raw.sessionId!==data.sessionId || !finite(raw.firstSeenAt) || !finite(raw.lastMessageAt) ||
          raw.firstSeenAt<data.startedAt || raw.firstSeenAt>raw.lastMessageAt || raw.lastMessageAt>now+MINUTE ||
          !Number.isSafeInteger(raw.messageCount) || raw.messageCount<1 || typeof raw.rewarded!=='boolean' ||
          (raw.rewarded && (!finite(raw.rewardedAt) || raw.rewardedAt<raw.firstSeenAt || raw.rewardedAt>now+MINUTE))) continue;
        const u={userId:clean(raw.userId),username:login(raw.username),displayName:clean(raw.displayName),
          firstSeenAt:raw.firstSeenAt,lastMessageAt:raw.lastMessageAt,messageCount:raw.messageCount,
          rewardedRank:Number.isInteger(raw.rewardedRank)&&raw.rewardedRank>=0&&raw.rewardedRank<=3?raw.rewardedRank:(raw.rewarded?1:0),
          rewarded:raw.rewarded,rewardedAt:raw.rewarded?raw.rewardedAt:null,sessionId:data.sessionId};
        if (!u.userId && !u.username) continue;
        if (!u.rewarded && now-u.lastMessageAt>this.s.retentionHours*3600000) continue;
        users.set(this.key(u),u);
      }
      this.users=users; this.sessionId=data.sessionId; this.startedAt=data.startedAt; this.lastActivityAt=data.lastActivityAt;
      this.queue=[]; this.pending.clear();
      if (Array.isArray(data.queue)) for (const k of data.queue.slice(0,this.s.maxQueue)) {
        if (typeof k==='string' && users.has(k) && !this.pending.has(k)) { this.queue.push(k);this.pending.add(k); }
      }
      this.dirty=false; return true;
    }
  }
  // store.set не имеет документированного Promise. Подтверждение — только kvstore:update.
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
      if (!this.enabled) return null;
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
      return this.localGet();
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

  class Renderer {
    constructor(s,doc) {
      this.s=s;this.doc=doc;this.root=doc.getElementById('thanks-root');this.card=doc.getElementById('thanks-card');
      this.timers=new Map();this.audio=null;this.stopped=false;this.avatars=new AvatarLookup();this.avatarGeneration=0;this.stopAvatar=null;
      if (!this.root || !this.card) throw new Error('Нет HTML виджета');
      const vars={primary:s.primaryColor,secondary:s.secondaryColor,panel:s.backgroundColor,ink:s.textColor,
        'stats-font':TITLE_FONTS[s.statsFont],'stats-size':s.statsFontSize+'px','title-font':TITLE_FONTS[s.titleFont],'title-size':s.titleFontSize+'px','name-size':s.nameFontSize+'px','message-size':s.messageFontSize+'px','icon-delay':(s.enterSeconds+Math.min(s.iconDelaySeconds,Math.max(0,s.displaySeconds-.45)))+'s',
        font:s.fontSize+'px',width:s.cardWidth+'px',radius:s.cornerRadius+'px',enter:s.enterSeconds+'s',hold:s.displaySeconds+'s',exit:s.exitSeconds+'s'};
      for(const [k,v] of Object.entries(vars))this.root.style.setProperty('--'+k,v);
      this.root.dataset.position=s.position;
    }
    prepareAvatar(u){
      if(this.stopAvatar)this.stopAvatar();
      const token=++this.avatarGeneration,icon=this.card.querySelector('.thanks-icon');
      const frame=this.card.querySelector('.thanks-avatar-shell'),img=this.card.querySelector('.thanks-avatar-image');
      const placeholder=this.card.querySelector('.thanks-avatar-placeholder'),caption=this.card.querySelector('.thanks-seal-caption');
      if(!icon||!frame||!img)return;
      icon.dataset.avatar='seal';frame.hidden=true;img.hidden=true;if(placeholder)placeholder.hidden=false;
      if(caption)caption.textContent='ПЕЧАТЬ ЧЕСТИ';
      const username=login(u.username);
      if(!this.s.avatarEnabled||!/^[a-z0-9_]{1,25}$/.test(username))return;
      const controller=new AbortController();let timer;
      const inactive=()=>this.stopped||controller.signal.aborted||token!==this.avatarGeneration;
      const cleanup=()=>{clearTimeout(timer);controller.abort();img.onload=null;img.onerror=null;img.removeAttribute('src');};
      this.stopAvatar=cleanup;
      const fallback=()=>{
        if(inactive())return;
        this.avatars.markFailed(username);cleanup();frame.hidden=true;icon.dataset.avatar='fallback';
        if(caption)caption.textContent='ПЕЧАТЬ ЧЕСТИ';
      };
      frame.hidden=false;icon.dataset.avatar='loading';if(caption)caption.textContent='ГЕРОЙ ЧАТА';
      // Общий бюджет загрузки не задерживает очередь или старт анимации.
      timer=setTimeout(fallback,3000);
      this.avatars.get(username,controller.signal).then(url=>{
        if(inactive())return;if(!url){fallback();return;}
        img.onload=()=>{if(inactive())return;clearTimeout(timer);img.hidden=false;if(placeholder)placeholder.hidden=true;icon.dataset.avatar='ready';};
        img.onerror=fallback;img.referrerPolicy='no-referrer';img.decoding='async';img.src=url;
      }).catch(fallback);
    }

    delay(ms) { return new Promise(resolve=>{ const t=setTimeout(()=>{this.timers.delete(t);resolve();},ms);this.timers.set(t,resolve); }); }
    async show(u,now) {
      if(this.stopped)return;
      const d=this.doc,s=this.s;
      const rank=s.ranksEnabled?Math.max(1,Math.min(3,u.rank||1)):0;
      this.root.dataset.rank=String(rank);
      const badge=d.getElementById('thanks-rank');
      if(badge){badge.textContent=rank?s['rank'+rank+'Name']:'';badge.hidden=!rank;}
      const position=d.getElementById('thanks-position');
      if(position){position.textContent=u.chatPosition?'№ '+u.chatPosition+' в чате':'';position.hidden=!s.showPosition||!u.chatPosition;}
      this.prepareAvatar(u);
      // Все имена и шаблоны выводятся textContent, никогда innerHTML.
      d.getElementById('thanks-title').textContent=format(s.title,u,now);
      d.getElementById('thanks-name').textContent=u.displayName;
      d.getElementById('thanks-text').textContent=format(rank?s['rank'+rank+'Text']:s.thankText,u,now);
      const mins=d.getElementById('thanks-minutes'), msgs=d.getElementById('thanks-messages');
      mins.textContent=`${Math.max(0,Math.floor((now-u.firstSeenAt)/MINUTE))} мин · с первого сообщения`;
      msgs.textContent=`${u.messageCount} сообщ.`; mins.hidden=!s.showMinutes;msgs.hidden=!s.showMessages;
      this.card.querySelector('.thanks-particles').hidden=!s.particles;
      d.getElementById('chatthanks-diagnostic')?.remove();
      const icon=this.card.querySelector('.thanks-icon');
      if(icon)icon.classList.remove('is-revealing');
      this.card.hidden=false;this.card.className='thanks-card enter';
      // Отдельная анимация эмблемы продолжается при смене enter на hold.
      if(icon){void icon.offsetWidth;icon.classList.add('is-revealing');}
      if (s.soundEnabled && /^https?:\/\//i.test(s.soundFile)) {
        try { this.audio=new global.Audio(s.soundFile);this.audio.volume=s.volume/100;const p=this.audio.play();if(p)p.catch(()=>{}); } catch (_) { /* Звук не блокирует очередь. */ }
      }
      await this.delay(s.enterSeconds*1000);if(this.stopped)return;
      this.card.className='thanks-card hold';
      await this.delay(s.displaySeconds*1000);if(this.stopped)return;
      this.card.className='thanks-card exit';
      await this.delay(s.exitSeconds*1000);this.card.hidden=true;if(this.stopAvatar){this.stopAvatar();this.stopAvatar=null;}
      if(this.audio){this.audio.pause();this.audio=null;}
    }
    dispose() { this.stopped=true;this.avatarGeneration++;if(this.stopAvatar)this.stopAvatar();for(const [t,resolve] of this.timers){clearTimeout(t);resolve();}this.timers.clear();this.card.hidden=true;if(this.audio)this.audio.pause(); }
  }
  const exported={DEFAULTS,settings,Engine,Persistence,Renderer,parseMessage,format,normalizeEvent,AvatarLookup,avatarURL};
  if(typeof module!=='undefined' && module.exports)module.exports=exported;
  if(!global.document)return;
  global.ChatThanks=exported;
  // Повторное исполнение скрипта снимает старые обработчики и таймеры.
  if(global.__chatThanks)global.__chatThanks.dispose();
  const app={disposed:false,runtime:null,pending:[],generation:0,loadChain:Promise.resolve()};
  let lastStatus='';
  let diagnosticTimer;
  function diagnostic(message){
    let box=global.document.getElementById('chatthanks-diagnostic');
    if(!box){box=global.document.createElement('div');box.id='chatthanks-diagnostic';
      box.style.cssText='position:fixed;inset:12px 12px auto;z-index:2147483647;background:#241b36;color:#fff;padding:16px;border:1px solid #a879ff;border-radius:10px;font:16px/1.5 Arial,sans-serif;white-space:pre-wrap';
      (global.document.body||global.document.documentElement).appendChild(box);}
    box.textContent=message;clearTimeout(diagnosticTimer);diagnosticTimer=setTimeout(()=>box.remove(),15000);
  }
  function status(msg) { lastStatus=msg;console.warn('[ChatThanks]',msg);global.dispatchEvent(new CustomEvent('chatthanks:status',{detail:msg})); }
  async function boot(raw) {
    const generation=++app.generation;
    if(app.runtime)app.runtime.dispose();
    const now=()=>global.__CHAT_THANKS_PREVIEW__ && typeof global.__CHAT_THANKS_PREVIEW__.now==='function' ? global.__CHAT_THANKS_PREVIEW__.now() : Date.now();
    const s=settings(raw), engine=new Engine(s,now);
    let local;try{local=global.localStorage;}catch(_){local=null;}
    const storage=new Persistence(s,global.SE_API,local,status);
    const renderer=new Renderer(s,global.document);
    let stopped=false,busy=false,interval,saveTimer,flushing=false,updating=false;
    const demos=[];
    const alive=()=>!stopped&&!app.disposed;
    const active=()=>alive()&&!storage.blocked&&s.instanceRole==='writer';
    const runtime={engine,storage,renderer,s,ready:false,
      canUpdate(){return runtime.ready&&!busy&&!runtime.resetting&&!updating&&!storage.blocked&&engine.queue.length===0&&demos.length===0;},
      async prepareUpdate(){
        if(!runtime.canUpdate())return null;
        updating=true;
        await runtime.flush(true);
        if(storage.blocked||stopped){updating=false;return null;}
        return {key:storage.key,snapshot:engine.snapshot()};
      },
      resumeAfterUpdate(){updating=false;if(active()){engine.tick();runtime.pump();}},
      dispose(){stopped=true;runtime.ready=false;clearInterval(interval);clearInterval(saveTimer);storage.dispose();renderer.dispose();},
      async flush(force=false){
        if(!active()||!s.persistence||(!engine.dirty&&!force))return;
        if(flushing){if(force && storage.inflight){await storage.inflight;return runtime.flush(true);}return;}
        flushing=true;engine.dirty=false;
        try { if(!await storage.save(engine.snapshot()))engine.dirty=true; }
        finally { flushing=false; }
      },
      async pump(){
        if(!alive()||busy||updating)return;
        busy=true;
        try {
          while(alive()&&!updating){
            const demo=demos.shift(), u=demo || (active()?engine.take():null);if(!u)break;
            // Статус награды фиксируется до отображения: перезапуск не повторяет уже начатое уведомление.
            if(!demo)await runtime.flush(true);
            if(!alive()||(!demo&&!active()))break;
            try{await renderer.show(u,now());}catch(e){status('Ошибка анимации: '+e.message);if(demo)diagnostic(lastStatus);}
            if(!alive())break;
            await renderer.delay(s.gapSeconds*1000);
            if(active())engine.tick();
          }
        } finally { busy=false; }
      },
      event(detail){
        storage.observe(detail);
        if(!alive()||!runtime.ready||updating)return;
        if(detail.listener==='widget-button'){
          const field=detail.event&&detail.event.field;
          if(field==='testActivity' && !active()){diagnostic('Тест условий остановлен: оставьте один активный экземпляр и роль «Активный».');return;}
          if(field==='testActivity' && !s.testMode){diagnostic('Для тестовых сообщений включите «Изолированный тест», сохраните и обновите виджет.');return;}
          if(field==='testActivity' && active() && s.testMode){
            for(let i=0;i<s.testMessages;i++)engine.message({userId:'synthetic-test-viewer',username:login(s.testName),displayName:s.testName});
            runtime.pump();
          }
          if(field==='testAlert') {
            if(demos.length>=s.maxQueue)return;
            const rank=s.testRank,minutes=rank===1?s.rewardMinutes:s['rank'+rank+'Minutes'];
            demos.push({rank,chatPosition:3,username:login(s.testName),displayName:s.testName,firstSeenAt:now()-minutes*MINUTE,messageCount:s.testMessages});runtime.pump();
          }
          if((field==='resetSession'||field==='clearData')&&active()){
            // Не допускаем завершения старой асинхронной записи после сброса: boot ждёт её.
            runtime.reset();
          }
        } else if(active() && detail.listener==='message' && (!s.testMode || global.__CHAT_THANKS_PREVIEW__)){
          engine.message(parseMessage(detail));runtime.pump();
        }
      },
      async reset(){
        if(runtime.resetting)return;runtime.resetting=true;
        // Остановить старую анимацию и дождаться единственной незавершённой записи.
        stopped=true;clearInterval(interval);clearInterval(saveTimer);renderer.dispose();
        if(storage.inflight)await storage.inflight;
        if(app.runtime!==runtime)return;
        engine.reset();await storage.save(engine.snapshot());
        if(app.runtime===runtime&&!app.disposed)await boot(raw);
      }
    };
    app.runtime=runtime;
    let data=await storage.load();
    // Передача в памяти только при горячем обновлении совместимой версии JS.
    const handover=global.__CHAT_THANKS_HANDOVER__;
    if(handover){delete global.__CHAT_THANKS_HANDOVER__;if(handover.key===storage.key)data=handover.snapshot;}
    if(stopped||app.disposed||generation!==app.generation)return;
    if(data&&!engine.restore(data)){
      status('Сохранённая сессия истекла, сброшена или повреждена; создана новая.');engine.dirty=true;
    }
    runtime.ready=true;
    // Первая запись также позволяет обнаружить второй писатель до выдачи наград.
    if(active())await runtime.flush(true);
    if(stopped||app.disposed||generation!==app.generation)return;
    for(const event of app.pending.splice(0))runtime.event(event);
    interval=setInterval(()=>{if(active()&&!updating){engine.tick();runtime.pump();}},s.checkSeconds*1000);
    saveTimer=setInterval(()=>runtime.flush(),s.saveSeconds*1000);
    engine.tick();runtime.pump();
    global.dispatchEvent(new CustomEvent('chatthanks:ready'));
  }
  const load=e=>{
    // Последовательная загрузка предотвращает конкурентные записи при двойном onWidgetLoad.
    app.loadChain=app.loadChain.then(async()=>{
      const old=app.runtime;if(old){old.dispose();if(old.storage.inflight)await old.storage.inflight;}
      if(!app.disposed)await boot(e.detail&&e.detail.fieldData||{});
    }).catch(e=>status('Ошибка загрузки: '+e.message));
  };
  const event=e=>{
    const detail=normalizeEvent(e.detail);if(!detail)return;
    if(app.runtime)app.runtime.storage.observe(detail);
    if(app.runtime&&app.runtime.ready)app.runtime.event(detail);
    else {
      if(detail.listener==='widget-button'&&detail.event&&['testAlert','testActivity'].includes(detail.event.field))
        diagnostic(lastStatus||'Виджет ещё запускается. Подождите несколько секунд. Если сообщение остаётся, проверьте вкладку HTML.');
      if(['message','widget-button'].includes(detail.listener)&&app.pending.length<5000)app.pending.push(detail);
    }
  };
  const hide=()=>{if(app.runtime)app.runtime.flush();};
  app.dispose=()=>{app.disposed=true;clearTimeout(diagnosticTimer);global.document.getElementById('chatthanks-diagnostic')?.remove();if(app.runtime)app.runtime.dispose();global.removeEventListener('onWidgetLoad',load);global.removeEventListener('onEventReceived',event);global.removeEventListener('pagehide',hide);};
  global.addEventListener('onWidgetLoad',load);global.addEventListener('onEventReceived',event);global.addEventListener('pagehide',hide);
  global.__chatThanks=app;
})(typeof window!=='undefined'?window:globalThis);
