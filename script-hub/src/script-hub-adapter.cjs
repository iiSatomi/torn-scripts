// Bundled into each participating script; callbacks stay in that script's scope.
function registerTornScriptMenu(doc, win, metadata, callbacks, features = {}) {
  const prefix = 'torn-script-hub:v1:';
  const instance = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID() : 'menu-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  let attached = false, disposed = false;
  const seen = new Set();
  const requests = new Map();
  const preparedSecrets = new Map();
  const credentialContexts = new Map();
  let changeTimer = null;
  let credentialIdentity = null;
  let pairedHub = null;
  let pdaActive = true, active = doc.visibilityState !== 'hidden', drainingChanges = false, activityGeneration = 0;
  const providerRevisions = new Map(), changedProviders = new Map();
  const sharedProviders = [...new Set((Array.isArray(features.sharedProviders) ? features.sharedProviders : ['torn']).filter(value => typeof value === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(value)))].slice(0,20);
  function usable() { return attached && !disposed && active && doc.visibilityState !== 'hidden'; }
  function hook(name) {
    try { const result = features[name]?.(); if(result && typeof result.then==='function')result.catch(()=>{}); } catch (_) {}
  }
  function send(name, value) {
    try { doc.dispatchEvent(new CustomEvent(prefix + name, { detail: JSON.stringify(value) })); } catch (_) {}
  }
  function announce() { send('register', { ...metadata, credentialScope:features.credentialScope==='script'?'script':'main', credentialProviders:features.credentialClient?sharedProviders:[], capabilities:[...new Set([...(metadata.capabilities||[]),...(features.credentialContext?['hub-keys-v2']:[])])], instance, ...(credentialIdentity ? {credentialIdentity} : {}) }); }
  const safeId = value => typeof value === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(value);
  const safeField = value => typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,79}$/.test(value)&&!['__proto__','constructor','prototype'].includes(value);
  function decode(event, limit = 65536) {
    try { return typeof event.detail === 'string' && event.detail.length <= limit ? JSON.parse(event.detail) : null; } catch (_) { return null; }
  }
  function publicSchema(schema) {
    if(typeof normalizeHubPage==='function')return normalizeHubPage(schema);
    const value={id:schema.id,title:schema.title,description:schema.description||'',sections:[],actions:[]};
    for(const section of schema.sections||[]){
      const fields=[];
      for(const source of section.fields||[]){
        const field={};for(const key of ['id','type','label','description','required','readOnly','min','max','step','minLength','maxLength','options','visibleWhen','format','unit'])if(source[key]!==undefined)field[key]=source[key];
        if(!['password','secret'].includes(source.type)&&source.default!==undefined)field.default=source.default;fields.push(field);
      }
      value.sections.push({id:section.id,title:section.title,fields});
    }
    value.actions=(schema.actions||[]).map(action=>({id:action.id,label:action.label}));
    for (const section of value.sections || []) for (const field of section.fields || []) {
      if (['password','secret'].includes(field.type)) { delete field.default; delete field.value; }
    }
    return value;
  }
  function publicValues(schema, state) {
    const values = {};
    for (const section of schema.sections || []) for (const field of section.fields || []) {
      if (['password','secret'].includes(field.type) || !safeField(field.id)) continue;
      const value = state?.values?.[field.id];
      if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) || (typeof value === 'string' && value.length <= 32768)) values[field.id] = value;
    }
    if(encodeURIComponent(JSON.stringify(values)).replace(/%[A-F\d]{2}/g,'_').length>32768)throw new Error('Settings exceed transport limit.');
    return {values,revision:typeof state?.revision === 'string' ? state.revision.slice(0,128) : ''};
  }
  async function rpc(event) {
    const command = decode(event, 49152);
    if (!command || command.id !== metadata.id || command.instance !== instance || !safeId(command.request)
        || !metadata.pages?.some(page => page.id === command.page) || !['describe','read','save','prepare-secret'].includes(command.method)
        || typeof features.describePage !== 'function' || typeof features.readSettings !== 'function' || !usable()) return;
    const key = 'rpc-' + command.request;
    if (seen.has(key)) return;
    seen.add(key); if (seen.size > 30) seen.delete(seen.values().next().value);
    const reply = (status, data) => {
      if (!attached || disposed) return;
      const output = {id:metadata.id,instance,request:command.request,page:command.page,status,...(data ? {data} : {})};
      if (JSON.stringify(output).length <= 98304) send('rpc-result', output);
      else send('rpc-result', {id:metadata.id,instance,request:command.request,page:command.page,status:'error'});
    };
    try {
      const schema = publicSchema(await features.describePage(command.page));
      if (command.method === 'describe') { reply('ok', schema); return; }
      if(command.method==='prepare-secret'){
        if(!features.credentialClient||typeof features.saveSecrets!=='function'||preparedSecrets.size>=10){reply('error');return;}
        const request=await features.credentialClient.createRequest('script-settings',instance,'secret-'+command.request,{pageId:command.page});
        if(!request||!usable()){reply('error');return;}
        const timer=setTimeout(()=>preparedSecrets.delete(request.requestId),30000);
        preparedSecrets.set(request.requestId,{request,timer});reply('ok',request);return;
      }
      const current = publicValues(schema, await features.readSettings(command.page));
      if (command.method === 'read') { reply('ok', current); return; }
      if (typeof features.saveSettings !== 'function' || !command.values || typeof command.values !== 'object' || Array.isArray(command.values)) { reply('error'); return; }
      const fields = (schema.sections || []).flatMap(section => section.fields || []).filter(field => !['password','secret'].includes(field.type) && !field.readOnly);
      if (Object.keys(command.values).some(id => !fields.some(field => field.id === id))) { reply('error'); return; }
      if(encodeURIComponent(JSON.stringify(command.values)).replace(/%[A-F\d]{2}/g,'_').length>32768){reply('error');return;}
      if (command.revision !== current.revision) { reply('conflict'); return; }
      const result = await features.saveSettings(command.page, command.values, command.revision);
      reply('ok', publicValues(schema, result || await features.readSettings(command.page)));
    } catch (_) { reply('error'); }
  }
  async function onCredentialInfo(event) {
    const info = decode(event, 8192);
    if (!info?.identity?.publicJwk || !features.credentialClient || !usable()) return;
    const token=activityGeneration;
    try {
      if (!await features.credentialClient.pinHub(info.identity.publicJwk)) return;
      const identity=await features.credentialClient.publicIdentity();
      if(!usable()||token!==activityGeneration)return;
      if(identity&&credentialIdentity?.fingerprint!==identity.fingerprint){credentialIdentity=identity;announce();}
      const peer=JSON.stringify([info.identity.publicJwk.x,info.identity.publicJwk.y]);
      const initial=pairedHub!==peer;pairedHub=peer;
      const providers=Array.isArray(info.providers)?info.providers.slice(0,20):[];
      for(const providerId of sharedProviders){
        const record=providers.find(item=>item?.id===providerId&&Number.isSafeInteger(item.revision)&&item.revision>=0&&typeof item.configured==='boolean');
        const revision=record?JSON.stringify([record.revision,record.configured]):null;
        if(initial||(revision!==null&&providerRevisions.get(providerId)!==revision))queueCredentialChange(providerId);
        if(revision!==null)providerRevisions.set(providerId,revision);
      }
    } catch (_) {}
  }
  async function onCredentialReply(event) {
    const reply = decode(event, 131072);
    if (!reply || reply.scriptId !== metadata.id || reply.instance !== instance || !usable()) return;
    const item = requests.get(reply.requestId);
    if (!item) return;
    requests.delete(reply.requestId); clearTimeout(item.timer);
    try{
      let value=await features.credentialClient.consumeReply(reply,item.request);
      if(item.request.pageId==='credential-context-v2' && value!==null){
        const context=JSON.parse(value);
        if(context?.version!==2||context.managed!==true||typeof context.fallback!=='boolean'||!(context.value===null||typeof context.value==='string'&&context.value.length<=4096)||
          !(context.keyId==='global'||/^key-[a-f0-9]{24}$/.test(context.keyId)))throw new Error('Unavailable');
        if(!usable())throw new Error('Unavailable');
        if(!await features.credentialClient.rememberManaged(reply.providerId)){
          send('credential-policy',{scriptId:metadata.id,instance,providerId:reply.providerId,status:'failed'});
          features.onCredentialPolicyFailure?.(reply.providerId);throw new Error('Unavailable');
        }
        if(!usable())throw new Error('Unavailable');
        features.onHubManagementChange?.(reply.providerId,true);
        send('credential-policy',{scriptId:metadata.id,instance,providerId:reply.providerId,status:'saved'});
        credentialContexts.set(reply.providerId,context);value=context.value;
        features.onCredentialContext?.(reply.providerId,{keyId:context.keyId,fallback:context.fallback});
      }else if(value===null)credentialContexts.delete(reply.providerId);
      item.resolve(usable()?value:null);
    }catch(_){credentialContexts.delete(reply.providerId);item.resolve(null);}
  }
  async function onSecretSettings(event){
    const message=decode(event,131072),request=message?.request;
    if(!request||request.scriptId!==metadata.id||request.instance!==instance||request.providerId!=='script-settings'||!usable())return;
    const item=preparedSecrets.get(request.requestId);if(!item||item.request.pageId!==request.pageId)return;
    preparedSecrets.delete(request.requestId);clearTimeout(item.timer);
    let status='error';
    try{
      const value=await features.credentialClient.consumeReply(message.envelope,item.request);
      if(value===null||!usable())return;
      const values=JSON.parse(value),schema=await features.describePage(request.pageId);
      const fields=(schema.sections||[]).flatMap(section=>section.fields||[]).filter(field=>['password','secret'].includes(field.type)&&!field.readOnly);
      if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).some(id=>{const field=fields.find(field=>field.id===id),value=values[id];return !field||typeof value!=='string'||value.length>32768||(field.minLength!==undefined&&value.length<field.minLength)||(field.maxLength!==undefined&&value.length>field.maxLength);}))throw new Error();
      if(!usable())return;
      await features.saveSecrets(request.pageId,values);status='ok';
    }catch(_){}
    if(usable())send('secret-result',{id:metadata.id,instance,page:request.pageId,request:request.requestId,status});
  }
  function queueCredentialChange(providerId){
    if(!features.credentialClient||!sharedProviders.includes(providerId))return;
    changedProviders.set(providerId,(changedProviders.get(providerId)||0)+1);
    if(!usable()||changeTimer!==null||drainingChanges)return;
    changeTimer=setTimeout(drainCredentialChanges,250);
  }
  async function drainCredentialChanges(){
    changeTimer=null;if(!usable()||drainingChanges)return;
    drainingChanges=true;const token=activityGeneration;
    try{
      const providers=[...changedProviders.keys()];changedProviders.clear();
      for(const providerId of providers){
        if(!usable()||token!==activityGeneration)break;
        const value=await requestSharedCredential(providerId);
        if(usable()&&token===activityGeneration&&!changedProviders.has(providerId)&&typeof features.onSharedCredentialChange==='function')try{features.onSharedCredentialChange(providerId,value);}catch(_){}
      }
    }finally{drainingChanges=false;if(usable()&&changedProviders.size&&changeTimer===null)changeTimer=setTimeout(drainCredentialChanges,250);}
  }
  function onCredentialChanged(event){
    const change=decode(event,1024);
    if(!features.credentialClient||typeof features.onSharedCredentialChange!=='function'||!change||!safeId(change.providerId)||(change.scriptId&&change.scriptId!==metadata.id))return;
    queueCredentialChange(change.providerId);
  }
  async function requestSharedCredential(providerId) {
    if (!usable() || !features.credentialClient || !sharedProviders.includes(providerId) || requests.size >= 10) return null;
    const requestId = 'key-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    try {
      const request = await features.credentialClient.createRequest(providerId,instance,requestId,features.credentialContext?{pageId:'credential-context-v2'}:{});
      if (!request || !usable()) return null;
      return await new Promise(resolve => {
        const timer = setTimeout(() => {requests.delete(requestId);resolve(null);},2000);
        requests.set(requestId,{resolve,timer,request}); send('credential-request',request);
      });
    } catch (_) { return null; }
  }
  function clearCredentialWork(){
    for(const item of requests.values()){clearTimeout(item.timer);item.resolve(null);}requests.clear();
    for(const item of preparedSecrets.values())clearTimeout(item.timer);preparedSecrets.clear();
    clearTimeout(changeTimer);changeTimer=null;
  }
  function updateActivity(){
    const next=doc.visibilityState!=='hidden'&&pdaActive;
    if(next===active)return;active=next;activityGeneration++;
    if(!active)clearCredentialWork();
    else if(attached){providerRevisions.clear();for(const providerId of sharedProviders)changedProviders.set(providerId,1);send('credential-discover',{});}
  }
  function onPdaActivity(event){const info=event.detail;pdaActive=info?.isActiveTab===true&&info?.isWebViewVisible===true;updateActivity();}
  function takeover(event) {
    try {
      if (typeof event.detail !== 'string' || event.detail.length > 16000) return;
      const next = JSON.parse(event.detail);
      if (next?.id === metadata.id && typeof next.instance === 'string' && next.instance !== instance) dispose();
    } catch (_) {}
  }
  function activate(event) {
    let command;
    try {
      if (typeof event.detail !== 'string' || event.detail.length > 1024) return;
      command = JSON.parse(event.detail);
    } catch (_) { return; }
    if (!command || command.id !== metadata.id || command.instance !== instance || typeof command.action !== 'string'
        || !Object.prototype.hasOwnProperty.call(callbacks, command.action)
        || !metadata.actions.some(action => action.id === command.action)
        || typeof command.request !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(command.request)) return;
    if (seen.has(command.request)) return;
    seen.add(command.request);
    if (seen.size > 30) seen.delete(seen.values().next().value);
    const report = status => send('result', { id: metadata.id, action: command.action, request: command.request, instance, status });
    const statusFor = value => value === false ? 'not-ready' : value === 'navigate' ? 'navigate' : 'opened';
    try {
      const result = callbacks[command.action]();
      if (result && typeof result.then === 'function') result.then(value => report(statusFor(value)), () => report('error'));
      else report(statusFor(result));
    } catch (_) { report('error'); }
  }
  function detach() {
    if (!attached) return;
    attached = false;
    activityGeneration++;
    doc.removeEventListener(prefix + 'discover', announce);
    doc.removeEventListener(prefix + 'activate', activate);
    doc.removeEventListener(prefix + 'register', takeover);
    doc.removeEventListener(prefix + 'rpc', rpc);
    doc.removeEventListener(prefix + 'credential-info', onCredentialInfo);
    doc.removeEventListener(prefix + 'credential-reply', onCredentialReply);
    doc.removeEventListener(prefix + 'credential-changed',onCredentialChanged);
    doc.removeEventListener(prefix + 'secret-settings',onSecretSettings);
    credentialContexts.clear();
    clearCredentialWork();
    send('unregister', { id: metadata.id, instance });
    hook('onDetach');
  }
  function attach() {
    if (attached || disposed) return;
    attached = true;
    active=doc.visibilityState!=='hidden'&&pdaActive;
    doc.addEventListener(prefix + 'discover', announce);
    doc.addEventListener(prefix + 'activate', activate);
    doc.addEventListener(prefix + 'register', takeover);
    if (metadata.pages?.length) doc.addEventListener(prefix + 'rpc', rpc);
    if (features.credentialClient) {
      doc.addEventListener(prefix + 'credential-info', onCredentialInfo);
      doc.addEventListener(prefix + 'credential-reply', onCredentialReply);
      doc.addEventListener(prefix + 'credential-changed',onCredentialChanged);
      if(typeof features.saveSecrets==='function')doc.addEventListener(prefix + 'secret-settings',onSecretSettings);
    }
    announce();
    hook('onAttach');
    if(features.credentialClient&&usable()){providerRevisions.clear();send('credential-discover',{});}
  }
  win.addEventListener('pagehide', detach);
  win.addEventListener('pageshow', attach);
  doc.addEventListener('visibilitychange',updateActivity);
  win.addEventListener('tornpda:tabState',onPdaActivity);
  if(typeof win.PDA_getTabState==='function')Promise.resolve().then(()=>win.PDA_getTabState()).then(info=>{if(!disposed)onPdaActivity({detail:info});}).catch(()=>{});
  function dispose() {
    if(disposed)return;
    disposed = true;
    detach();
    win.removeEventListener('pagehide', detach);
    win.removeEventListener('pageshow', attach);
    doc.removeEventListener('visibilitychange',updateActivity);
    win.removeEventListener('tornpda:tabState',onPdaActivity);
    seen.clear();
    features.credentialClient?.destroy();
    changedProviders.clear();providerRevisions.clear();hook('onDispose');
  }
  attach();
  dispose.requestSharedCredential = requestSharedCredential;
  dispose.instance = instance;
  if (features.credentialClient) {
    Promise.resolve().then(() => features.credentialClient.ready()).then(async ready => {
      if(disposed)return;
      features.onCredentialPolicyReady?.(ready,providerId=>features.credentialClient.isManaged?.(providerId)===true);
      if (!ready || !usable()) return;
      credentialIdentity = await features.credentialClient.publicIdentity();
      if (usable() && credentialIdentity) {announce();send('credential-discover',{});}
    }).catch(() => {});
  }
  return dispose;
}

module.exports = { registerTornScriptMenu };
