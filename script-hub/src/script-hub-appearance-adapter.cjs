// Appearance-only adoption for explicitly declared legacy roots. This bridge
// shares the existing menu registration identity and never moves script content.
function createScriptUiAppearanceAdapter(options) {
  const {doc,win,id,read=()=>null,write=()=>{},getInstance=()=>null,onChange=()=>{}}=options;
  const safeId=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,79}$/.test(value);
  if(!safeId(id))throw new TypeError('A bounded script id is required.');
  const normalize=options.normalize||(typeof normalizeScriptUiTheme==='function'?normalizeScriptUiTheme:require('./script-hub-theme.cjs').normalizeScriptUiTheme);
  const apply=options.apply||(typeof applyScriptUiTheme==='function'?applyScriptUiTheme:require('./script-hub-theme.cjs').applyScriptUiTheme);
  const css=options.css||(typeof scriptUiThemeCss==='function'?scriptUiThemeCss:require('./script-hub-theme.cjs').scriptUiThemeCss);
  const createClient=options.createClient||(typeof createScriptUiThemeClient==='function'?createScriptUiThemeClient:require('./script-hub-theme-client.cjs').createScriptUiThemeClient);
  const selectors=(Array.isArray(options.selectors)?options.selectors:[]).filter(value=>typeof value==='string'&&value.length>0&&value.length<=240).slice(0,12);
  const commandEvent='torn-script-hub:v1:appearance',resultEvent=commandEvent+'-result';
  let started=false,disposed=false,suspended=false,pdaActive=true,ready=false,generation=0,frame=null,observer=null,style=null;
  let saved=null,readFailed=false,pending=0,queue=Promise.resolve();
  const roots=new Map(),listeners=[],seen=new Set();
  const active=()=>started&&!suspended&&pdaActive&&doc.visibilityState!=='hidden';
  const stateTheme=()=>saved===null?client.get():normalize(saved);
  function revision(){
    const text=JSON.stringify(saved);let first=2166136261,second=5381;
    for(let i=0;i<text.length;i++){first=Math.imul(first^text.charCodeAt(i),16777619);second=Math.imul(second,33)^text.charCodeAt(i);}
    return 'ui-v1:'+(first>>>0).toString(16).padStart(8,'0')+(second>>>0).toString(16).padStart(8,'0');
  }
  async function readSaved(){try{const raw=await read();saved=raw===null||raw===undefined?null:normalize(raw);readFailed=false;return saved;}catch(error){readFailed=true;throw error;}}
  const client=createClient({doc,win,scriptId:id,read:readSaved,write:async value=>{const theme=value===null?null:normalize(value);await write(theme);saved=theme;},onChange:theme=>{ready=true;if(active()){schedule();try{onChange(normalize(theme));}catch(_){}}}});
  function response(command,status){
    if(!active()||getInstance()!==command.instance)return;
    const value={id,instance:command.instance,request:command.request,page:'ui-appearance',status,data:{theme:stateTheme(),inherit:saved===null,revision:revision()}};
    try{const EventClass=win.CustomEvent||globalThis.CustomEvent;doc.dispatchEvent(new EventClass(resultEvent,{detail:JSON.stringify(value)}));}catch(_){}
  }
  function receive(event){
    if(!active()||!ready||typeof event.detail!=='string'||event.detail.length>16384)return;
    let command;try{command=JSON.parse(event.detail);}catch(_){return;}
    if(!command||command.id!==id||!safeId(command.instance)||command.instance!==getInstance()||!safeId(command.request)||command.page!=='ui-appearance'||!['read','save'].includes(command.method))return;
    if(command.method==='save'&&(typeof command.revision!=='string'||command.revision.length>128||!Object.prototype.hasOwnProperty.call(command,'theme')||(command.theme!==null&&(typeof command.theme!=='object'||Array.isArray(command.theme)))))return;
    const key=command.instance+':'+command.request;if(seen.has(key))return;
    if(pending>=5){response(command,'error');return;}
    seen.add(key);if(seen.size>30)seen.delete(seen.values().next().value);pending++;
    const ownGeneration=generation;
    const run=async()=>{
      try{
        if(!active()||generation!==ownGeneration||getInstance()!==command.instance)return;
        await client.refresh();
        if(!active()||generation!==ownGeneration||getInstance()!==command.instance)return;
        if(readFailed)throw new Error('Appearance read unavailable.');
        if(command.method==='save'){
          if(command.revision!==revision()){response(command,'conflict');return;}
          await client.setOverride(command.theme===null?null:normalize(command.theme));
        }
        if(generation===ownGeneration)response(command,'ok');
      }catch(_){if(generation===ownGeneration)response(command,'error');}
      finally{if(generation===ownGeneration)pending--;}
    };
    queue=queue.then(run,run);
  }
  const aliases={
    '--ocm-bg':'background','--ocm-bg-card':'surface','--ocm-bg-hover':'raised','--ocm-text':'text','--ocm-text-card':'text',
    '--ocm-text-dim':'muted','--ocm-text-muted':'muted','--ocm-text-faint':'muted','--ocm-border':'border','--ocm-border-soft':'border','--ocm-link':'accent',
    '--ocm-cpr-good':'success','--ocm-cpr-warn':'warning','--ocm-cpr-crit':'error',
    '--ground':'background','--surface':'surface','--raise':'raised','--line':'border','--text':'text','--dim':'muted','--muted':'muted','--faint':'muted',
    '--accent':'accent','--accent-dim':'accent','--warn':'warning','--bad':'error','--info':'focus',
    '--twpc-bg':'background','--twpc-surface':'surface','--twpc-text':'text','--twpc-muted':'muted','--twpc-line':'border','--twpc-accent':'accent'
  };
  function restore(node,record){
    for(const [key,entry]of record.styles){
      // A script may update its own inline properties while the bridge is active.
      if(node.style.getPropertyValue(key)!==entry.last||node.style.getPropertyPriority(key)!==entry.lastPriority)continue;
      if(entry.value)node.style.setProperty(key,entry.value,entry.priority);else node.style.removeProperty(key);
    }
    for(const [key,entry]of record.attributes)if(node.getAttribute(key)===entry.last){if(entry.value===null)node.removeAttribute(key);else node.setAttribute(key,entry.value);}
    if(!record.hadClass)node.classList.remove('tsui-legacy-surface');
  }
  function releaseRoots(){for(const [node,record]of roots)restore(node,record);roots.clear();}
  function applyRoot(node,theme){
    let record=roots.get(node);if(!record){record={styles:new Map(),attributes:new Map(),hadClass:node.classList.contains('tsui-legacy-surface')};roots.set(node,record);}
    const styles=new Map(),attributes=new Map();
    const resolved=apply({style:{setProperty:(key,value)=>styles.set(key,value)},setAttribute:(key,value)=>attributes.set(key,value)},theme,win.matchMedia?.('(prefers-color-scheme: dark)').matches===true);
    for(const [key,role]of Object.entries(aliases))styles.set(key,resolved.colors[role]);
    for(const [key,value]of styles){
      if(!record.styles.has(key))record.styles.set(key,{value:node.style.getPropertyValue(key),priority:node.style.getPropertyPriority(key)});
      node.style.setProperty(key,value);Object.assign(record.styles.get(key),{last:value,lastPriority:''});
    }
    for(const [key,value]of attributes){if(!record.attributes.has(key))record.attributes.set(key,{value:node.getAttribute(key)});node.setAttribute(key,value);record.attributes.get(key).last=value;}
    node.classList.add('tsui-legacy-surface');
  }
  function render(){
    frame=null;if(!active()||!ready)return;
    const found=new Set();for(const selector of selectors){let nodes;try{nodes=doc.querySelectorAll(selector);}catch(_){continue;}for(let i=0;i<nodes.length&&found.size<48;i++)found.add(nodes[i]);if(found.size>=48)break;}
    for(const [node,record]of roots)if(!found.has(node)||node.isConnected===false){restore(node,record);roots.delete(node);}
    const theme=client.get();for(const node of found)applyRoot(node,theme);
    if(found.size&&!style){style=doc.createElement('style');style.setAttribute('data-tsui-appearance-owner',id);style.textContent=css()+'\n.tsui-legacy-surface{background-color:var(--tsui-background);color:var(--tsui-text);border-color:var(--tsui-border)}';(doc.head||doc.documentElement).appendChild(style);}
    if(!observer&&selectors.length&&typeof win.MutationObserver==='function'){observer=new win.MutationObserver(schedule);observer.observe(doc.documentElement,{childList:true,subtree:true});}
  }
  function schedule(){if(!active()||!ready||frame!==null)return;frame=win.requestAnimationFrame(render);}
  function pause(){if(frame!==null)win.cancelAnimationFrame(frame);frame=null;observer?.disconnect();observer=null;}
  function activity(){if(active())schedule();else pause();}
  function pda(event){const state=event.detail;if(typeof state?.isActiveTab!=='boolean'||typeof state?.isWebViewVisible!=='boolean')return;pdaActive=state.isActiveTab&&state.isWebViewVisible;activity();}
  function route(){pause();if(active())releaseRoots();schedule();}
  function pagehide(event){if(event.persisted){suspended=true;pause();}else stop();}
  function pageshow(event){if(event.persisted){suspended=false;activity();}}
  function listen(target,name,callback){target.addEventListener(name,callback);listeners.push(()=>target.removeEventListener(name,callback));}
  async function start(){
    if(disposed)return client.get();if(started)return client.get();started=true;suspended=false;pdaActive=true;ready=false;generation++;
    listen(doc,commandEvent,receive);listen(doc,'visibilitychange',activity);listen(win,'tornpda:tabState',pda);listen(win,'hashchange',route);listen(win,'pagehide',pagehide);listen(win,'pageshow',pageshow);
    return client.start();
  }
  function stop(){started=false;generation++;client.stop();pause();releaseRoots();style?.remove();style=null;for(const remove of listeners.splice(0))remove();seen.clear();pending=0;queue=Promise.resolve();}
  function dispose(){if(disposed)return;stop();disposed=true;}
  return {start,stop,dispose,client};
}
module.exports = {createScriptUiAppearanceAdapter};
