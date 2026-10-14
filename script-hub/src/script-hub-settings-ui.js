// Bundled into the hub's private scope. Public preferences and private keys use
// different stores/transports; a schema never carries existing secret values.
function createHubSettingsController(config) {
  const {doc,win,registry,emit,button,icon,launch,navigatePage,getDialog} = config;
  const prefix='torn-script-hub:v1:', preferenceKey='torn-script-hub:v2:preferences';
  const defaults={title:'Script menus',theme:'torn',accent:'#c7e67c',columns:4,compact:false,iconSize:28,placement:'auto',favorites:[],window:normalizeHubWindowPreferences()};
  let prefs={...defaults}, view='scripts', selected=null, currentPage=null, form=null, panel=null, nav=null, toolbar=null;
  let sequence=0, generation=0, started=false, active=true, vault=null, storage=null, vaultReady=false;
  const pending=new Map(), schemas=new Map();
  let refreshPreferenceBaseline=null,preferenceFrame=null;
  let refreshWork=null;
  let editorPosition=null;
  const themeAvailable=typeof normalizeScriptUiTheme==='function'&&typeof renderHubThemes==='function';
  const themeKey='torn-script-hub:ui-theme:v1', presetKey='torn-script-hub:ui-presets:v1';
  let appearance=null, appearancePresets=[], themeDirty=false;
  let themeMedia=null;
  const vaultRecords=new Map(), exportUrls=new Map();
  try {
    const raw=JSON.parse(win.localStorage.getItem(preferenceKey)||'null');
    if(raw&&typeof raw==='object') for(const key of Object.keys(defaults)) {
      const value=raw[key];
      if(key==='favorites'){if(Array.isArray(value))prefs.favorites=value.filter(id=>typeof id==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(id)).slice(0,100);}
      else if(typeof value===typeof defaults[key]) prefs[key]=value;
    }
  } catch (_) {}
  prefs.columns=Number.isInteger(prefs.columns)?Math.max(2,Math.min(6,prefs.columns)):defaults.columns;
  prefs.iconSize=Number.isInteger(prefs.iconSize)?Math.max(20,Math.min(36,prefs.iconSize)):defaults.iconSize;
  if(!/^#[0-9a-fA-F]{6}$/.test(prefs.accent)) prefs.accent=defaults.accent;
  if(!['torn','dark','light'].includes(prefs.theme)) prefs.theme='torn';
  if(!['auto','floating'].includes(prefs.placement)) prefs.placement='auto';
  prefs.title=prefs.title.slice(0,40);if(!prefs.title.trim())prefs.title=defaults.title;
  prefs.window=normalizeHubWindowPreferences(prefs.window);
  if(themeAvailable){
    let stored=null,legacy=null;
    try{stored=JSON.parse(win.localStorage.getItem(themeKey)||'null');legacy=JSON.parse(win.localStorage.getItem(preferenceKey)||'null');appearancePresets=normalizeScriptUiPresets(JSON.parse(win.localStorage.getItem(presetKey)||'[]'),normalizeScriptUiTheme);}catch(_){}
    appearance=normalizeScriptUiTheme(stored||(legacy?{layout:'torn',palette:'torn',mode:prefs.theme==='light'?'light':'dark',density:prefs.compact?'compact':'comfortable',colors:{light:{accent:prefs.accent},dark:{accent:prefs.accent}}}:{}));
    if(!stored&&legacy){try{win.localStorage.setItem(themeKey,JSON.stringify(appearance));}catch(_){/* Clients also read the bounded legacy appearance when storage cannot be written. */}}
    try{themeMedia=win.matchMedia?.('(prefers-color-scheme: dark)');}catch(_){}
  }
  function applyAppearance(value=appearance){
    const dialog=getDialog();if(!dialog||!themeAvailable)return;
    const resolved=applyScriptUiTheme(dialog,value,themeMedia?.matches===true);
    dialog.style.colorScheme=resolved.mode;
    const label=dialog.querySelector('.tsh-current-style');if(label)label.textContent=({frostbite:'Frostbite',workbench:'Workbench',torn:'Torn native'})[resolved.layout];
  }
  function publishAppearance(){
    if(!themeAvailable)return;
    try{doc.dispatchEvent(new win.CustomEvent(themeKey+':changed',{detail:JSON.stringify(appearance)}));}catch(_){}
  }
  function refreshAppearance(){
    if(!themeAvailable||!active||themeDirty||(form?.element?.classList.contains('tsh-themes')&&form.isDirty()))return;
    if(selected!=='themes'&&form?.element?.classList.contains('tsh-themes')){applyAppearance(form.getValues());return;}
    const before=JSON.stringify(appearance);
    try{const raw=JSON.parse(win.localStorage.getItem(themeKey)||'null');if(raw)appearance=normalizeScriptUiTheme(raw);}catch(_){}
    if(view==='themes'&&form&&before!==JSON.stringify(appearance)){showThemes();return;}
    applyAppearance();
  }
  function showThemes(){
    screen();selected='themes';
    form=renderHubThemes({doc,win,normalize:normalizeScriptUiTheme,resolve:resolveScriptUiTheme,value:appearance,presets:appearancePresets,
      onPreview:value=>{themeDirty=JSON.stringify(value)!==JSON.stringify(appearance);applyAppearance(value);},
      onSave:(value,presets)=>{
        const next=normalizeScriptUiTheme(value),library=normalizeScriptUiPresets(presets,normalizeScriptUiTheme);
        let previousPresets=null;
        try{previousPresets=win.localStorage.getItem(presetKey);win.localStorage.setItem(presetKey,JSON.stringify(library));win.localStorage.setItem(themeKey,JSON.stringify(next));}
        catch(_){try{if(previousPresets===null)win.localStorage.removeItem(presetKey);else win.localStorage.setItem(presetKey,previousPresets);}catch(_){}return false;}
        appearance=next;appearancePresets=library;themeDirty=false;applyAppearance();publishAppearance();return true;
      }});
    panel.append(form.element);
  }
  function savePrefs(){
    let saved=true;try{win.localStorage.setItem(preferenceKey,JSON.stringify(prefs));}catch(_){saved=false;}
    applyPrefs();if(!saved)config.say('Hub changes apply only to this tab because browser storage is unavailable.');return saved;
  }
  function windowEditorValues(){
    const values={...prefs};
    for(const name of ['desktop','mobile']){const profile=prefs.window[name];for(const key of ['mode','width','height','x','y','locked'])values[name+key[0].toUpperCase()+key.slice(1)]=profile[key]??24;}
    return values;
  }
  function saveWindow(next){
    prefs.window=normalizeHubWindowPreferences(next);savePrefs();
    if(selected==='hub'&&form&&!form.isDirty()){const values=windowEditorValues();if(form.setValues(values))refreshPreferenceBaseline?.(values);}
  }
  function element(tag,cls,text){const node=doc.createElement(tag);node.className=cls||'';if(text!==undefined)node.textContent=text;return node;}
  function message(text){const target=panel?.querySelector('.tsh-settings-message');if(target)target.textContent=text;else config.say(text);}
  function heading(entry,page){
    const header=element('div','tsh-script-heading');header.append(icon(entry.icon));
    const body=element('div','');body.append(element('h3','',entry.name+(entry.version?' · v'+entry.version:'')));
    if(page)body.append(element('p','tsh-page-title',page));header.append(body);return header;
  }
  function applyPrefs(){
    const dialog=getDialog();if(!dialog)return;
    dialog.style.setProperty('--tsh-accent',prefs.accent);dialog.style.setProperty('--tsh-columns',String(prefs.columns));dialog.style.setProperty('--tsh-icon-size',prefs.iconSize+'px');
    dialog.classList.toggle('tsh-theme-light',prefs.theme==='light');dialog.classList.toggle('tsh-theme-dark',prefs.theme==='dark');dialog.classList.toggle('tsh-compact',prefs.compact);
    applyAppearance(form?.element?.classList.contains('tsh-themes')?form.getValues():appearance);
    const title=dialog.querySelector('#tsh-title');if(title)title.textContent=prefs.title;
    config.onPreferences?.(prefs);
  }
  function disposeForm(){editorPosition=null;if(preferenceFrame!==null)win.cancelAnimationFrame(preferenceFrame);preferenceFrame=null;refreshPreferenceBaseline=null;form?.destroy();form=null;currentPage=null;themeDirty=false;applyAppearance();}
  function hasNewKeys(){return !!panel?.querySelector('.tsh-key-input')&&[...panel.querySelectorAll('.tsh-key-input')].some(input=>input.value);}
  function clearNewKeys(){for(const input of panel?.querySelectorAll('.tsh-key-input')||[])input.value='';}
  function cancelPrompt(){const keep=getDialog()?.querySelector('.tsh-discard-confirm .tsh-keep-editing');if(!keep)return false;keep.click();return true;}
  function allowLeave(next){
    const dialog=getDialog();if(!dialog||dialog.querySelector('.tsh-discard-confirm'))return false;
    if(!form?.isDirty()&&!hasNewKeys())return true;
    const origin=editorPosition&&panel?.contains(editorPosition.node)?editorPosition:null;
    const scrollTop=origin?.top??dialog.scrollTop,scrollLeft=origin?.left??dialog.scrollLeft;
    const confirm=element('div','tsh-discard-confirm');confirm.setAttribute('role','alertdialog');confirm.setAttribute('aria-label','Unsaved settings');
    confirm.append(element('p','','Discard your unsaved changes?'));
    const keep=button('Keep editing','tsh-keep-editing',()=>{
      confirm.remove();
      const target=origin?.node?.isConnected?origin.node:(form?.element.querySelector('input,select,textarea')||panel?.querySelector('.tsh-key-input'));
      target?.focus({preventScroll:true});dialog.scrollTop=scrollTop;dialog.scrollLeft=scrollLeft;
      editorPosition=target?{node:target,top:dialog.scrollTop,left:dialog.scrollLeft}:null;
    });
    const discard=button('Discard changes','tsh-discard',()=>{confirm.remove();clearNewKeys();disposeForm();next();});confirm.append(keep,discard);dialog.append(confirm);keep.focus();return false;
  }
  function rpc(entry,page,method,extra={}){
    if(!entry.active||pending.size>=10||!active)return Promise.reject(new Error('Script unavailable.'));
    const request='settings-'+Date.now()+'-'+(++sequence);
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(request);reject(new Error('The script did not respond.'));},2500);
      pending.set(request,{id:entry.id,instance:entry.instance,page,resolve,reject,timer});
      emit(page==='ui-appearance'?'appearance':'rpc',{id:entry.id,instance:entry.instance,page,method,request,...extra});
    });
  }
  function onRpc(event){
    let value;try{if(typeof event.detail!=='string'||event.detail.length>98304)return;value=JSON.parse(event.detail);}catch(_){return;}
    const request=pending.get(value?.request);if(!request||value.id!==request.id||value.instance!==request.instance||value.page!==request.page)return;
    if(registry.get(request.id)?.instance!==request.instance)return;
    pending.delete(value.request);clearTimeout(request.timer);
    if(value.status==='ok')request.resolve(value.data);else{const error=new Error(value.status==='conflict'?'These settings changed elsewhere. Reopen this page before saving.':'The script could not complete that operation.');if(value.status==='conflict')error.code='UI_APPEARANCE_CONFLICT';request.reject(error);}
  }
  function clearRequests(){for(const item of pending.values()){clearTimeout(item.timer);item.reject(new Error('The hub is inactive.'));}pending.clear();}
  function screen(){
    generation++;disposeForm();clearNewKeys();panel.classList.remove('tsh-key-view');panel.replaceChildren();panel.append(element('p','tsh-settings-message'));return generation;
  }
  function showSurface(next){
    view=next;const dialog=getDialog();if(!dialog)return;
    dialog.querySelector('.tsh-grid').hidden=next!=='scripts';dialog.querySelector('.tsh-intro').hidden=next!=='scripts';dialog.querySelector('.tsh-actions').hidden=true;
    toolbar.hidden=next!=='scripts';panel.hidden=next==='scripts';
    for(const item of nav.querySelectorAll('button'))item.setAttribute('aria-selected',String(item.dataset.hubView===next));
  }
  function setView(next,force=false){
    if(!force&&!allowLeave(()=>setView(next,true)))return;
    selected=null;
    const dialog=getDialog();if(!dialog)return;
    showSurface(next);
    if(next==='settings')renderDirectory();else if(next==='keys')renderKeys();else if(next==='themes'&&themeAvailable)showThemes();else{screen();config.render();}
  }
  function renderDirectory(){
    screen();panel.append(element('h3','','Settings'),element('p','tsh-subtitle','Choose a script. Its settings stay together in its own submenu.'));
    panel.append(button('Hub preferences','tsh-settings-script tsh-hub-preferences',()=>showPreferences()));
    for(const entry of registry.entries()){
      const item=button('','tsh-settings-script',()=>openScript(entry.id));item.dataset.settingsScript=entry.id;
      item.append(icon(entry.icon),element('span','',entry.name),element('small','',entry.active?'On this page':'Go to page'));panel.append(item);
    }
    if(!registry.entries().length)panel.append(element('p','','Script submenus appear as your scripts register.'));
  }
  function openScript(id,force=false){
    if(!force&&!allowLeave(()=>openScript(id,true)))return;
    const entry=registry.get(id);if(!entry)return;selected=id;showSurface('settings');screen();
    panel.append(button('‹ All settings','tsh-back',()=>setView('settings')),heading(entry,'Settings'));
    const pages=entry.pages||[];
    for(const page of pages){const item=button(page.title,'tsh-settings-page',()=>openPage(id,page.id));item.dataset.settingsPage=page.id;panel.append(item);}
    if(themeAvailable&&entry.capabilities?.includes('appearance'))panel.append(button('Appearance','tsh-script-appearance',()=>openAppearance(id)));
    const action=entry.actions.find(action=>['settings','config','setup'].includes(action.id))||entry.actions[0];
    const nativeLabel=['settings','config','setup'].includes(action.id)||/\b(settings|setup|config)\b/i.test(action.label)?'Open full script settings':'Open script menu';
    panel.append(button(nativeLabel,'tsh-native-settings',()=>launch(id,action.id)));
    if(!pages.length)panel.append(element('p','tsh-subtitle','This script currently provides its original settings menu. Modular pages appear here when the script adds them.'));
  }
  async function openAppearance(id,force=false){
    if(!force&&!allowLeave(()=>openAppearance(id,true)))return;
    const entry=registry.get(id);if(!entry?.active){message('Open this script’s page before changing its appearance.');return;}
    selected=id;showSurface('settings');const token=screen();panel.append(button('‹ '+entry.name+' settings','tsh-back',()=>openScript(id)),heading(entry,'Appearance'));message('Loading appearance…');
    try{
      const state=await rpc(entry,'ui-appearance','read');if(token!==generation||!started)return;
      message('');let revision=state.revision;
      form=renderHubThemes({doc,win,normalize:normalizeScriptUiTheme,resolve:resolveScriptUiTheme,value:state.theme,inherit:state.inherit,inheritedTheme:appearance,presets:[],onPreview:value=>applyAppearance(value),onSave:async(value,_presets,options)=>{
        const saved=await rpc(entry,'ui-appearance','save',{theme:options.inherit?null:normalizeScriptUiTheme(value),revision});
        if(token!==generation||!started)return false;revision=saved.revision;return true;
      }});panel.append(form.element);
    }catch(error){if(token===generation&&started)message(error.message);}
  }
  async function openPage(id,pageId,force=false){
    if(!force&&!allowLeave(()=>openPage(id,pageId,true)))return;
    const entry=registry.get(id);if(!entry)return;
    if(!entry.active){navigatePage(entry,pageId);return;}
    selected=id;showSurface('settings');const token=screen();
    panel.append(button('‹ '+entry.name+' settings','tsh-back',()=>openScript(id)),heading(entry,entry.pages?.find(page=>page.id===pageId)?.title||'Settings'));
    message('Loading settings…');
    try{
      const key=id+'-'+entry.instance+'-'+pageId;
      let schema=schemas.get(key);
      if(!schema){const described=await rpc(entry,pageId,'describe');if(token!==generation||!started||!active)return;schema=normalizeHubPage(described);schemas.set(key,schema);while(schemas.size>2)schemas.delete(schemas.keys().next().value);}
      const state=await rpc(entry,pageId,'read');if(token!==generation||!started)return;
      let revision=state.revision;message('');currentPage={id,pageId};
      const ownerForm=renderHubForm(doc,schema,state.values||{}, {
        onSave:async values=>{
          try{
            const secrets=ownerForm.getSecretValues();
            let saved=await rpc(entry,pageId,'save',{values,revision});revision=saved.revision;
            if(token!==generation||!started||form!==ownerForm)return false;
            if(Object.keys(secrets).length){
              if(!await saveSecrets(entry,pageId,secrets)){if(token===generation)message('Preferences saved. Secret fields need explicit access in API Keys.');return false;}
              if(token!==generation||!started||form!==ownerForm)return false;
              saved=await rpc(entry,pageId,'read');revision=saved.revision;
            }
            if(token!==generation||form!==ownerForm)return false;
            message('Saved.');return {values:saved.values};
          }catch(error){if(token===generation&&form===ownerForm)message(error.message);return false;}
        },
        onCancel:()=>openScript(id),
        onReset:()=>new Promise(resolve=>confirmReset(resolve)),
        onAction:action=>{if(entry.actions.some(item=>item.id===action))launch(id,action);},
      });
      form=ownerForm;panel.append(form.element);
    }catch(error){if(token===generation)message(error.message||'This page is unavailable.');}
  }
  function confirmReset(resolve){
    const confirm=element('div','tsh-discard-confirm');confirm.setAttribute('role','alertdialog');confirm.append(element('p','','Reset this page to its defaults? Credentials are not changed.'));
    const finish=value=>{confirm.remove();resolve(value);};
    const cancel=button('Cancel','tsh-keep-editing',()=>finish(false));
    confirm.append(cancel,button('Reset defaults','tsh-discard',()=>finish(true)));getDialog().append(confirm);cancel.focus();
  }
  function windowSection(name,title,mobile){
    const id=key=>name+key;
    const options=[{value:'last',label:'Remember last position'},{value:'center',label:'Centered'},{value:'top-left',label:'Top left'},{value:'top-right',label:'Top right'},{value:'bottom-left',label:'Bottom left'},{value:'bottom-right',label:'Bottom right'},{value:'custom',label:'Custom coordinates'},{value:'fit',label:'Fit screen'}];
    return {id:name+'-window',title,fields:[
      {id:id('Mode'),type:'select',label:'Opening position',options,default:mobile?'fit':'last'},
      {id:id('Locked'),type:'checkbox',label:'Lock dragging and resizing',default:false},
      {id:id('Width'),type:'integer',label:'Window width',description:'Pixels; 0 uses automatic width. Always fits the current viewport.',min:0,max:4096,step:1,default:0,required:true},
      {id:id('Height'),type:'integer',label:'Window height',description:'Pixels; 0 grows with content. Fit screen overrides size.',min:0,max:4096,step:1,default:0,required:true},
      {id:id('X'),type:'integer',label:'Distance from left',unit:'px',min:0,max:16384,step:1,default:24,required:true,visibleWhen:{field:id('Mode'),equals:'custom'}},
      {id:id('Y'),type:'integer',label:'Distance from top',unit:'px',min:0,max:16384,step:1,default:24,required:true,visibleWhen:{field:id('Mode'),equals:'custom'}},
    ]};
  }
  const prefSchema={id:'hub-preferences',title:'Hub preferences',sections:[
    {id:'appearance',title:'Appearance',fields:[{id:'title',type:'text',label:'Hub title',required:true,maxLength:40,default:defaults.title},{id:'theme',type:'select',label:'Theme',options:[{value:'torn',label:'Torn dark'},{value:'dark',label:'Dark'},{value:'light',label:'Light'}],default:defaults.theme},{id:'accent',type:'color',label:'Accent color',default:defaults.accent},{id:'compact',type:'checkbox',label:'Compact tiles',default:false}]},
    {id:'layout',title:'Layout',fields:[{id:'columns',type:'integer',label:'Desktop columns',min:2,max:6,step:1,default:4},{id:'iconSize',type:'range',label:'Icon size',unit:'px',min:20,max:36,step:1,default:28},{id:'placement',type:'select',label:'Launcher position',options:[{value:'auto',label:'Sidebar with mobile fallback'},{value:'floating',label:'Floating button'}],default:'auto'}]},
    windowSection('desktop','Desktop window',false),windowSection('mobile','Small-screen window',true),
  ],actions:[]};
  function showPreferences(force=false){
    if(!force&&!allowLeave(()=>showPreferences(true)))return;
    screen();selected='hub';panel.append(button('‹ All settings','tsh-back',()=>setView('settings')),heading({name:'Torn Script Hub',version:'1.2.5',icon:'scripts'},'Hub preferences'));
    let initial=windowEditorValues();
    refreshPreferenceBaseline=values=>{initial=values;};
    form=renderHubForm(doc,normalizeHubPage(prefSchema),initial,{onSave:values=>{
      const next=normalizeHubWindowPreferences(prefs.window);
      for(const name of ['desktop','mobile'])for(const key of ['mode','width','height','x','y','locked']){
        const field=name+key[0].toUpperCase()+key.slice(1);
        if(values[field]!==undefined&&values[field]!==initial[field])next[name][key]=values[field];
      }
      for(const key of Object.keys(defaults))if(key!=='window'&&values[key]!==undefined)prefs[key]=values[key];
      prefs.window=normalizeHubWindowPreferences(next);
      if(!savePrefs()){message('Hub preferences could not be saved. Changes apply only to this tab; retry when browser storage is available.');return false;}
      initial=form.getValues();
      const owner=form;if(preferenceFrame!==null)win.cancelAnimationFrame(preferenceFrame);
      preferenceFrame=win.requestAnimationFrame(()=>{preferenceFrame=null;if(form===owner&&selected==='hub'&&!form.isDirty()){const values=windowEditorValues();if(form.setValues(values))initial=values;}});
      message('Hub preferences saved.');return true;
    },onCancel:()=>setView('settings'),onReset:()=>new Promise(resolve=>confirmReset(resolve))});panel.append(form.element);
    panel.append(button('Reset window position and size','tsh-reset-window-settings',()=>config.resetWindow?.()));
    const controls=element('div','tsh-preference-transfer');
    controls.append(button('Export preferences','tsh-export-preferences',()=>{
      const allowed={};for(const key of Object.keys(defaults))allowed[key]=prefs[key];
      const blob=new Blob([JSON.stringify({version:2,preferences:allowed},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=doc.createElement('a');a.href=url;a.download='torn-hub-preferences.json';a.click();exportUrls.set(url,setTimeout(()=>{URL.revokeObjectURL(url);exportUrls.delete(url);},1000));
    }));
    const file=doc.createElement('input');file.type='file';file.accept='.json,application/json';file.className='tsh-import-preferences';file.setAttribute('aria-label','Import hub preferences');
    const pageToken=generation;let importSequence=0;
    file.addEventListener('change',async()=>{
      if(file.disabled||getDialog()?.querySelector('.tsh-discard-confirm'))return;
      const request=++importSequence;
      const isCurrent=()=>started&&active&&pageToken===generation&&request===importSequence&&file.isConnected&&view==='settings'&&selected==='hub';
      file.disabled=true;
      try{
        const selected=file.files?.[0];if(!selected||selected.size>32768)throw new Error();
        const raw=JSON.parse(await selected.text());if(!isCurrent())return;
        if(![1,2].includes(raw.version)||!raw.preferences||typeof raw.preferences!=='object'||Array.isArray(raw.preferences))throw new Error();
        const validated=validateHubSettings(normalizeHubPage(prefSchema),raw.preferences);if(!validated.ok)throw new Error();
        const next={...defaults};for(const key of Object.keys(defaults))if(key!=='window'&&validated.values[key]!==undefined)next[key]=validated.values[key];
        next.window=normalizeHubWindowPreferences(raw.version===2?raw.preferences.window:undefined);
        next.favorites=Array.isArray(raw.preferences.favorites)?raw.preferences.favorites.filter(id=>typeof id==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(id)).slice(0,100):[];
        const apply=()=>{if(!isCurrent())return;prefs=next;const saved=savePrefs();showPreferences(true);message(saved?'Preferences imported.':'Preferences imported for this tab only; browser storage could not save them.');};
        if(allowLeave(apply))apply();
      }catch(_){if(isCurrent())message('Choose a valid hub preference file smaller than 32 KiB.');}finally{file.value='';file.disabled=false;}
    });controls.append(element('label','','Import preferences'),file);panel.append(controls);
  }
  async function announceVault(){
    if(!active||!vaultReady)return;
    const current=vault,identity=await current.publicIdentity(),records=await current.status();
    if(!active||!started||current!==vault)return;
    for(const record of records){
      const signature=JSON.stringify([record.configured,record.revision,record.permissions]);
      if(vaultRecords.has(record.id)&&vaultRecords.get(record.id)!==signature)emit('credential-changed',{providerId:record.id});
      vaultRecords.set(record.id,signature);
    }
    if(identity)emit('credential-info',{identity,providers:records.map(({id,configured,revision})=>({id,configured,revision}))});
  }
  function refreshVault(){
    if(!active||!vaultReady)return Promise.resolve(false);
    if(refreshWork)return refreshWork;
    const current=vault;
    const work=(async()=>{const ready=await current.refresh();if(!started||current!==vault)return false;vaultReady=ready;if(ready)await announceVault();return ready;})();
    refreshWork=work;work.finally(()=>{if(refreshWork===work)refreshWork=null;}).catch(()=>{});return work;
  }
  async function onCredentialDiscover(){try{await refreshVault();}catch(_){vaultReady=false;}}
  async function onCredentialRequest(event){
    let request;try{if(typeof event.detail!=='string'||event.detail.length>4096)return;request=JSON.parse(event.detail);}catch(_){return;}
    const entry=registry.get(request?.scriptId);
    if(!active||!vaultReady||!entry?.active||entry.instance!==request.instance||!entry.credentialIdentity)return;
    const expected=entry.credentialIdentity.publicJwk;
    if(request.publicJwk?.x!==expected.x||request.publicJwk?.y!==expected.y)return;
    const current=vault,result=await current.respond(request);if(!active||current!==vault||!registry.get(entry.id)?.active||registry.get(entry.id)?.instance!==request.instance)return;
    emit('credential-reply',{...result,scriptId:request.scriptId,providerId:request.providerId,instance:request.instance,requestId:request.requestId});
  }
  async function saveSecrets(entry,pageId,values){
    if(!vaultReady||!entry.credentialIdentity||!entry.capabilities?.includes('secret-settings'))return false;
    try{
      const request=await rpc(entry,pageId,'prepare-secret');
      const current=vault,envelope=await current.encryptMessage(request,JSON.stringify(values));if(envelope.status!=='ok'||!active||current!==vault||!registry.get(entry.id)?.active||registry.get(entry.id)?.instance!==entry.instance)return false;
      const requestId=request.requestId;
      return await new Promise(resolve=>{
        const timer=setTimeout(()=>{pending.delete(requestId);resolve(false);},2500);
        pending.set(requestId,{id:entry.id,instance:entry.instance,page:pageId,resolve:()=>resolve(true),reject:()=>resolve(false),timer});
        emit('secret-settings',{request,envelope});
      });
    }catch(_){return false;}
  }
  function onSecretResult(event){
    let result;try{result=JSON.parse(event.detail);}catch(_){return;}
    const item=pending.get(result?.request);if(!item||item.id!==result.id||item.instance!==result.instance||item.page!==result.page)return;
    clearTimeout(item.timer);pending.delete(result.request);if(active&&registry.get(item.id)?.instance===item.instance&&result.status==='ok')item.resolve();else item.reject();
  }
  async function reportKeyFailure(current,token,text){
    const ready=await current.ready();
    if(!started||current!==vault||token!==generation||view!=='keys')return false;
    vaultReady=ready;
    if(!ready){
      clearNewKeys();for(const control of panel.querySelectorAll('input,button'))control.disabled=true;
      message('Key storage is unavailable. Reload Torn to retry, or use the scripts’ own key settings.');
    }else message(text);
    return ready;
  }
  async function renderKeys(){
    if(hasNewKeys())return;
    const token=screen();panel.classList.add('tsh-key-view');
    panel.append(element('h3','','Shared API keys'),element('p','tsh-subtitle','Configure a key once, then enable access for the scripts you trust. Keys are never included in preference exports.'));
    await refreshVault();const providers=vault?await vault.status():[];if(token!==generation||!started)return;
    if(!vaultReady)panel.append(element('p','tsh-key-unavailable','Key sharing is unavailable in this environment. Use the scripts’ own key settings.'));
    const records=[...new Set(['torn','tornstats','ffscouter',...providers.map(record=>record.id)])].map(id=>providers.find(record=>record.id===id)||{id,configured:false,permissions:[]});
    for(const provider of records.filter(item=>item.id!=='script-settings')){
      const section=element('section','tsh-key-provider');section.append(element('h4','',({torn:'Torn',tornstats:'TornStats',ffscouter:'FFScouter'})[provider.id]||provider.id));
      const keyStatus=element('p','tsh-key-status',provider.configured?'Key configured':'No key configured');section.append(keyStatus);
      const input=doc.createElement('input');input.type='password';input.maxLength=4096;input.autocomplete='new-password';input.placeholder=provider.configured?'Enter replacement key':'Enter API key';input.className='tsh-key-input';input.setAttribute('aria-label',(provider.id==='torn'?'Torn':provider.id)+' API key');input.disabled=!vaultReady;
      function updateConfigured(configured){
        if(token!==generation||view!=='keys')return;
        provider.configured=configured;keyStatus.textContent=configured?'Key configured':'No key configured';
        input.placeholder=configured?'Enter replacement key':'Enter API key';save.disabled=!vaultReady;remove.disabled=!vaultReady||!configured;
      }
      const save=button('Save key','tsh-save-key',async()=>{
        if(!active||!input.value.trim()||!vaultReady)return;
        const current=vault,value=input.value.trim();input.value='';save.disabled=true;
        const ok=await current.setCredential(provider.id,value);if(!started||current!==vault)return;
        if(ok){updateConfigured(true);if(token===generation&&view==='keys')message('');emit('credential-changed',{providerId:provider.id});await announceVault();if(token===generation&&view==='keys')renderKeys();}
        else if(await reportKeyFailure(current,token,'The key could not be saved. Enter it again and retry.'))save.disabled=false;
      });save.disabled=!vaultReady;
      const remove=button('Delete key','tsh-delete-key',async()=>{
        if(!active||!vaultReady)return;
        const current=vault;remove.disabled=true;
        const ok=await current.deleteCredential(provider.id);if(!started||current!==vault)return;
        if(ok){updateConfigured(false);if(token===generation&&view==='keys')message('');emit('credential-changed',{providerId:provider.id});await announceVault();if(token===generation&&view==='keys')renderKeys();}
        else if(await reportKeyFailure(current,token,'The key could not be deleted. Retry or reload Torn.'))remove.disabled=false;
      });remove.disabled=!vaultReady||!provider.configured;
      section.append(input,save,remove,element('h5','','Scripts with access'));
      for(const entry of registry.entries()){
        const row=element('label','tsh-key-permission');const check=doc.createElement('input');check.type='checkbox';check.disabled=!vaultReady||!entry.credentialIdentity;
        check.checked=provider.permissions?.some(permission=>permission.scriptId===entry.id&&permission.fingerprint===entry.credentialIdentity?.fingerprint)||false;
        check.addEventListener('change',async()=>{if(!active||!vaultReady||registry.get(entry.id)?.instance!==entry.instance)return;check.disabled=true;const current=vault;const ok=check.checked?await current.grant(entry.id,provider.id,entry.credentialIdentity.publicJwk):await current.revoke(entry.id,provider.id);if(!started||current!==vault||token!==generation)return;check.disabled=registry.get(entry.id)?.instance!==entry.instance;if(!ok){check.checked=!check.checked;await reportKeyFailure(current,token,'This permission could not be saved.');return;}message('');emit('credential-changed',{providerId:provider.id,scriptId:entry.id});await announceVault();});
        row.append(check,icon(entry.icon),element('span','',entry.name));if(!entry.credentialIdentity)row.append(element('small','','Adapter update or script page needed'));section.append(row);
      }
      panel.append(section);
    }
    const secretScripts=registry.entries().filter(entry=>entry.capabilities?.includes('secret-settings')&&entry.credentialIdentity);
    if(secretScripts.length){
      const section=element('section','tsh-key-provider');section.append(element('h4','','Write-only script secret fields'));
      const state=providers.find(item=>item.id==='script-settings');
      for(const entry of secretScripts){const row=element('label','tsh-key-permission');const check=doc.createElement('input');check.type='checkbox';check.disabled=!vaultReady;check.checked=state?.permissions?.some(p=>p.scriptId===entry.id&&p.fingerprint===entry.credentialIdentity.fingerprint)||false;check.addEventListener('change',async()=>{if(!active||!vaultReady||registry.get(entry.id)?.instance!==entry.instance)return;check.disabled=true;const current=vault;const ok=check.checked?await current.grant(entry.id,'script-settings',entry.credentialIdentity.publicJwk):await current.revoke(entry.id,'script-settings');if(!started||current!==vault||token!==generation)return;check.disabled=registry.get(entry.id)?.instance!==entry.instance;if(!ok){check.checked=!check.checked;await reportKeyFailure(current,token,'This permission could not be saved.');return;}message('');await announceVault();});row.append(check,element('span','',entry.name+' secret edits'));section.append(row);}panel.append(section);
    }
  }
  function filterEntries(entries){
    const query=toolbar?.querySelector('.tsh-search')?.value.trim().toLowerCase()||'', category=toolbar?.querySelector('.tsh-category')?.value||'';
    return entries.filter(entry=>(!query||entry.name.toLowerCase().includes(query))&&(!category||entry.category===category)).sort((a,b)=>Number(prefs.favorites.includes(b.id))-Number(prefs.favorites.includes(a.id))||a.name.localeCompare(b.name));
  }
  function pinButton(entry){const pin=button(prefs.favorites.includes(entry.id)?'★':'☆','tsh-pin',()=>{prefs.favorites=prefs.favorites.includes(entry.id)?prefs.favorites.filter(id=>id!==entry.id):[...prefs.favorites,entry.id].slice(0,100);savePrefs();config.render();});pin.setAttribute('aria-label','Favorite '+entry.name);pin.setAttribute('aria-pressed',String(prefs.favorites.includes(entry.id)));return pin;}
  function mount(dialog){
    const previous=panel;
    nav=element('div','tsh-hub-nav');nav.setAttribute('role','tablist');
    for(const [id,label]of [['scripts','Scripts'],['settings','Settings'],...(themeAvailable?[['themes','Themes']]:[]),['keys','API Keys']]){const item=button(label,'tsh-hub-tab',()=>setView(id));const mark=icon(id);mark.classList.add('tsh-nav-icon');item.prepend(mark);item.dataset.hubView=id;item.setAttribute('role','tab');item.setAttribute('aria-selected',String(view===id));nav.append(item);}
    dialog.querySelector('.tsh-header').after(nav);
    toolbar=element('div','tsh-toolbar');const search=doc.createElement('input');search.type='search';search.placeholder='Find a script…';search.className='tsh-search';search.setAttribute('aria-label','Search scripts');search.addEventListener('input',()=>config.render());
    const category=doc.createElement('select');category.className='tsh-category';category.setAttribute('aria-label','Filter script category');category.addEventListener('change',()=>config.render());toolbar.append(search,category);nav.after(toolbar);
    panel=element('div','tsh-settings-view');panel.id='tsh-settings-view';panel.hidden=view==='scripts';if(previous)panel.append(...previous.childNodes);dialog.append(panel);
    const rememberEditorPosition=event=>{
      const target=event.target;
      if(!target.matches('input,select,textarea,button,summary')||(target.matches('button')&&!form?.element.contains(target)))return;
      editorPosition={node:target,top:dialog.scrollTop,left:dialog.scrollLeft};
    };
    for(const type of ['focusin','input','change','keyup','pointerup'])panel.addEventListener(type,rememberEditorPosition);
    toolbar.hidden=view!=='scripts';dialog.querySelector('.tsh-grid').hidden=view!=='scripts';dialog.querySelector('.tsh-intro').hidden=view!=='scripts';
    if(!doc.getElementById('tsh-settings-style')){
      const style=element('style','');style.id='tsh-settings-style';style.textContent=`
        #tsh-dialog .tsh-hub-nav{display:flex;gap:4px;padding:8px 12px;border-bottom:1px solid #202020;background:#292929;position:sticky;top:var(--tsh-header-height,49px);z-index:1}
        #tsh-dialog .tsh-hub-tab{flex:1;min-height:36px;background:#363636;border:1px solid #1d1d1d;border-radius:4px;padding:6px 12px;color:#ddd}
        #tsh-dialog .tsh-hub-tab[aria-selected=true]{border-color:var(--tsh-accent);color:var(--tsh-accent)}
        #tsh-dialog .tsh-toolbar{display:flex;gap:7px;padding:10px 14px 0}
        #tsh-dialog .tsh-toolbar input{min-width:0;flex:1}
        #tsh-dialog input:not([type=checkbox]):not([type=radio]):not([type=range]),#tsh-dialog select,#tsh-dialog textarea{background:#202020;color:#e8e8e8;border:1px solid #555;border-radius:4px;padding:8px;font:inherit;max-width:100%;min-height:36px}
        #tsh-dialog .tsh-settings-view{padding:14px}
        #tsh-dialog .tsh-settings-view h3{margin:0 0 5px;font-size:15px}
        #tsh-dialog .tsh-settings-view h4{margin:0 0 8px;font-size:14px}
        #tsh-dialog .tsh-subtitle,#tsh-dialog .tsh-page-title{color:#bcbcbc;line-height:1.5;margin:0 0 12px}
        #tsh-dialog .tsh-settings-script{width:100%;display:flex;align-items:center;gap:10px;min-height:50px;margin:7px 0;padding:10px;background:linear-gradient(#414141,#303030);border:1px solid #202020;border-radius:4px;text-align:left}
        #tsh-dialog .tsh-settings-script small{margin-left:auto;color:#c5cfab;font-size:10px}
        #tsh-dialog .tsh-settings-script .tsh-icon,#tsh-dialog .tsh-script-heading .tsh-icon{display:block;width:26px;height:26px;flex:none}
        #tsh-dialog .tsh-script-heading{display:flex;align-items:center;gap:10px;padding:10px 0 16px;border-bottom:1px solid #444;margin-bottom:14px}
        #tsh-dialog .tsh-back,#tsh-dialog .tsh-settings-page,#tsh-dialog .tsh-native-settings,#tsh-dialog .tsh-form-actions button,#tsh-dialog .tsh-preference-transfer button,#tsh-dialog .tsh-key-provider button{min-height:36px;border:1px solid #555;border-radius:4px;background:#353535;padding:8px 12px;margin:4px 5px 8px 0}
        #tsh-dialog .tsh-settings-page{display:block;width:100%;text-align:left}
        #tsh-dialog .tsh-settings-message{color:#e5d6a7;line-height:1.5;margin:0 0 10px}
        #tsh-dialog .tsh-settings-message:empty{display:none}
        #tsh-dialog .tsh-form-root{display:flex;flex-direction:column;gap:16px}
        #tsh-dialog .tsh-form-section{border:0;border-bottom:1px solid #494949;margin:0;padding:0 0 12px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
        #tsh-dialog .tsh-form-section>h3,#tsh-dialog .tsh-form-section>legend{grid-column:1/-1}
        #tsh-dialog .tsh-form-field{display:flex;flex-direction:column;gap:6px;min-width:0}
        #tsh-dialog .tsh-form-label{font-weight:600;font-size:12px}
        #tsh-dialog .tsh-form-input{width:100%}
        #tsh-dialog input[type=checkbox],#tsh-dialog input[type=radio]{accent-color:var(--tsh-accent);width:18px;height:18px}
        #tsh-dialog input[type=range]{accent-color:var(--tsh-accent)}
        #tsh-dialog .tsh-form-help{color:#b7b7b7;font-size:11px;line-height:1.4}
        #tsh-dialog .tsh-form-error{color:#f2b4aa;font-size:12px}
        #tsh-dialog .tsh-form-error:empty{display:none}
        #tsh-dialog .tsh-form-save{border-color:var(--tsh-accent)!important}
        #tsh-dialog .tsh-key-provider{padding:12px;border:1px solid #4b4b4b;border-radius:5px;margin:14px 0;background:#292929}
        #tsh-dialog .tsh-key-input{width:100%;margin-bottom:6px}
        #tsh-dialog .tsh-key-permission{display:flex;gap:8px;align-items:center;min-height:36px;font-size:12px}
        #tsh-dialog .tsh-key-permission .tsh-icon{display:block;width:16px;height:16px;flex:none}
        #tsh-dialog .tsh-key-permission small{color:#bbb;margin-left:auto;font-size:10px}
        #tsh-dialog .tsh-discard-confirm{position:sticky;bottom:0;background:#222;border:1px solid var(--tsh-accent);padding:14px;z-index:3;border-radius:5px;margin:12px}
        #tsh-dialog .tsh-discard-confirm button{padding:10px;border:1px solid #777;background:#393939;margin-right:8px;border-radius:4px}
        #tsh-dialog .tsh-tile-controls{display:flex;gap:4px;margin-top:4px}
        #tsh-dialog .tsh-pin{width:30px;min-height:28px;flex:none;border:1px solid #444;border-radius:3px;background:#252525;color:var(--tsh-accent);font-size:18px}
        #tsh-dialog .tsh-more{flex:1;margin-top:0}
        #tsh-dialog .tsh-icon{width:var(--tsh-icon-size,28px);height:var(--tsh-icon-size,28px)}
        #tsh-dialog .tsh-grid{grid-template-columns:repeat(var(--tsh-columns,4),minmax(0,1fr))}
        #tsh-dialog.tsh-compact .tsh-primary{min-height:90px;padding:8px 4px}
        #tsh-dialog.tsh-theme-light{background:#eee;color:#222}
        #tsh-dialog.tsh-theme-dark{background:#181b20;color:#e8ebf0}
        #tsh-dialog.tsh-theme-dark .tsh-header,#tsh-dialog.tsh-theme-dark .tsh-hub-nav{background:#242931}
        #tsh-dialog.tsh-theme-dark .tsh-primary,#tsh-dialog.tsh-theme-dark .tsh-settings-script,#tsh-dialog.tsh-theme-dark .tsh-key-provider{background:#242931}
        #tsh-dialog.tsh-theme-light{color-scheme:light;--tsh-accent:#506e14}
        #tsh-dialog.tsh-theme-light .tsh-header,#tsh-dialog.tsh-theme-light .tsh-hub-nav{background:#d8d8d8;color:#222}
        #tsh-dialog.tsh-theme-light h2,#tsh-dialog.tsh-theme-light .tsh-count{color:#222}
        #tsh-dialog.tsh-theme-light input:not([type=checkbox]):not([type=radio]):not([type=range]),#tsh-dialog.tsh-theme-light select,#tsh-dialog.tsh-theme-light textarea{background:#fff;color:#222;border-color:#999}
        #tsh-dialog.tsh-theme-light .tsh-hub-tab,#tsh-dialog.tsh-theme-light .tsh-back,#tsh-dialog.tsh-theme-light .tsh-settings-page,#tsh-dialog.tsh-theme-light .tsh-native-settings,#tsh-dialog.tsh-theme-light .tsh-form-actions button,#tsh-dialog.tsh-theme-light .tsh-key-provider button,#tsh-dialog.tsh-theme-light .tsh-preference-transfer button{background:#ddd;color:#222;border-color:#999}
        #tsh-dialog.tsh-theme-light .tsh-hub-tab[aria-selected=true]{background:#e3ead6;color:#30450b;border-color:#506e14}
        #tsh-dialog.tsh-theme-light .tsh-discard-confirm{background:#eee;color:#222}
        #tsh-dialog.tsh-theme-light .tsh-discard-confirm button{background:#ddd;color:#222}
        #tsh-dialog.tsh-theme-light button:focus-visible{outline-color:#506e14}
        #tsh-dialog.tsh-theme-light .tsh-settings-message{color:#664b08}
        #tsh-dialog.tsh-theme-light .tsh-form-help,#tsh-dialog.tsh-theme-light .tsh-subtitle,#tsh-dialog.tsh-theme-light .tsh-page-title{color:#555}
        #tsh-dialog.tsh-theme-light .tsh-primary,#tsh-dialog.tsh-theme-light .tsh-settings-script,#tsh-dialog.tsh-theme-light .tsh-key-provider{color:#eee}
        @media(max-width:600px){#tsh-dialog .tsh-grid{grid-template-columns:repeat(3,minmax(0,1fr))}#tsh-dialog .tsh-hub-tab,#tsh-dialog .tsh-settings-page,#tsh-dialog .tsh-form-actions button,#tsh-dialog .tsh-back,#tsh-dialog .tsh-key-provider button,#tsh-dialog .tsh-pin{min-height:44px}#tsh-dialog .tsh-hub-nav{top:var(--tsh-header-height,61px)}#tsh-dialog input:not([type=checkbox]):not([type=radio]),#tsh-dialog select,#tsh-dialog textarea{font-size:16px}#tsh-dialog .tsh-form-section{grid-template-columns:1fr}}
        @media(max-width:360px){#tsh-dialog .tsh-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      `;(doc.head||doc.documentElement).append(style);
    }
    if(themeAvailable){
      dialog.classList.add('tsui-surface');
      const inspector=element('aside','tsh-appearance-inspector');inspector.append(element('h3','','Window'),element('strong','tsh-current-style','Frostbite'),element('p','','Appearance follows your saved theme. Use the header to move or lock this window.'));
      inspector.append(button('Themes','tsh-inspector-themes',()=>setView('themes')),button('Reset layout','tsh-inspector-reset',()=>config.resetWindow?.()));dialog.append(inspector);
      if(!doc.getElementById('tsh-theme-style')){const style=element('style');style.id='tsh-theme-style';style.textContent=hubThemeStyles();(doc.head||doc.documentElement).append(style);}
    }
    applyPrefs();refresh();
  }
  function refresh(){
    if(toolbar){const select=toolbar.querySelector('.tsh-category'),selectedCategory=select.value;select.replaceChildren();for(const value of ['',...new Set(registry.entries().map(entry=>entry.category).filter(Boolean))]){const option=doc.createElement('option');option.value=value;option.textContent=value||'All categories';select.append(option);}select.value=selectedCategory;if(!select.value)select.value='';if(select.value!==selectedCategory)config.render();}
    if(!getDialog()?.hidden&&view==='settings'&&!selected&&!form)renderDirectory();
  }
  function open(){refreshAppearance();if(view==='scripts'){toolbar.hidden=false;panel.hidden=true;}else if(view==='keys')renderKeys();else if(view==='themes'&&!form)showThemes();else if(!form){if(selected==='hub')showPreferences(true);else if(selected)openScript(selected,true);else renderDirectory();}}
  function start(){
    if(started)return;started=true;active=true;
    doc.addEventListener(prefix+'rpc-result',onRpc);doc.addEventListener(prefix+'appearance-result',onRpc);doc.addEventListener(prefix+'secret-result',onSecretResult);doc.addEventListener(prefix+'credential-request',onCredentialRequest);doc.addEventListener(prefix+'credential-discover',onCredentialDiscover);
    if(themeAvailable){themeMedia?.addEventListener?.('change',refreshAppearance);win.addEventListener('storage',refreshAppearance);}
    storage=createHubCredentialStorage(getHubPlatformEnvironment(),'torn-hub-v2');vault=createHubCredentialVault({storage,crypto:globalThis.crypto});
    const current=vault;
    current.ready().then(ready=>{if(!started||current!==vault)return;vaultReady=ready;announceVault();if(view==='keys'&&!getDialog()?.hidden)renderKeys();}).catch(()=>{if(started&&current===vault)vaultReady=false;});
  }
  function stop(){
    started=false;active=false;generation++;clearRequests();clearNewKeys();disposeForm();schemas.clear();vault?.destroy();vault=null;vaultReady=false;selected=null;view='scripts';vaultRecords.clear();refreshWork=null;
    for(const [url,timer]of exportUrls){clearTimeout(timer);URL.revokeObjectURL(url);}exportUrls.clear();
    doc.removeEventListener(prefix+'rpc-result',onRpc);doc.removeEventListener(prefix+'appearance-result',onRpc);doc.removeEventListener(prefix+'secret-result',onSecretResult);doc.removeEventListener(prefix+'credential-request',onCredentialRequest);doc.removeEventListener(prefix+'credential-discover',onCredentialDiscover);
    if(themeAvailable){themeMedia?.removeEventListener?.('change',refreshAppearance);win.removeEventListener('storage',refreshAppearance);doc.getElementById('tsh-theme-style')?.remove();}
    panel=nav=toolbar=null;
    doc.getElementById('tsh-settings-style')?.remove();
  }
  function activity(value){if(active===value)return;active=value;if(!value)clearRequests();else{refreshAppearance();refreshVault().catch(()=>{vaultReady=false;});}}
  return {mount,start,stop,open,refresh,allowLeave,cancelPrompt,filterEntries,pinButton,activity,openPage,saveWindow,isScriptView:()=>view==='scripts',preferences:()=>prefs};
}
