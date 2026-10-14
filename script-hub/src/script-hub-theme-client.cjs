const SCRIPT_UI_THEME_KEY='torn-script-hub:ui-theme:v1';
const SCRIPT_UI_THEME_EVENT=SCRIPT_UI_THEME_KEY+':changed';

function createScriptUiThemeClient({doc,win,scriptId,read=()=>null,write=()=>{},onChange=()=>{}}) {
  if(typeof scriptId!=='string'||!scriptId.length||scriptId.length>80)throw new TypeError('A bounded scriptId is required.');
  // The builder concatenates the contract first; Node loads the same contract.
  const normalize=typeof normalizeScriptUiTheme==='function'?normalizeScriptUiTheme:require('./script-hub-theme.cjs').normalizeScriptUiTheme;
  let started=false,suspended=false,pdaActive=true,pending=true,override=null,globalTheme=normalize(),effective=normalize();
  let generation=0,overrideRevision=0,pdaRevision=0,readTask=null,lastSignature='',lastDark=null,writeQueue=Promise.resolve(),cancelPdaQuery=null;
  const removers=[],subscribers=new Set();
  let media=null;try{media=win.matchMedia?.('(prefers-color-scheme: dark)');}catch(_){}
  const active=()=>started&&!suspended&&pdaActive&&doc.visibilityState!=='hidden';
  const clone=theme=>normalize(theme);
  const parse=value=>{if(typeof value!=='string'||value.length>8192)return null;try{const parsed=JSON.parse(value);return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)&&(!Object.prototype.hasOwnProperty.call(parsed,'version')||parsed.version===1)?normalize(parsed):null;}catch(_){return null;}};
  function loadGlobal(){
    try{
      const current=parse(win.localStorage?.getItem(SCRIPT_UI_THEME_KEY));if(current)return current;
      const text=win.localStorage?.getItem('torn-script-hub:v2:preferences');
      if(typeof text==='string'&&text.length<=32768){const old=JSON.parse(text);if(old&&typeof old==='object'&&!Array.isArray(old)&&['torn','dark','light'].includes(old.theme))return normalize({layout:'torn',palette:'torn',mode:old.theme==='light'?'light':'dark',density:old.compact===true?'compact':'comfortable',colors:{light:{accent:old.accent},dark:{accent:old.accent}}});}
      return normalize();
    }catch(_){return normalize();}
  }
  function emit(force=false){
    if(!active()){pending=true;return;}
    effective=clone(override||globalTheme);const signature=JSON.stringify(effective),dark=media?.matches===true;
    if(force||signature!==lastSignature||(effective.mode==='system'&&dark!==lastDark)){
      lastSignature=signature;lastDark=dark;onChange(clone(effective));
      for(const listener of subscribers){try{listener(clone(effective));}catch(_){}}
    }
    pending=false;
  }
  function listen(target,name,callback){target.addEventListener(name,callback);removers.push(()=>target.removeEventListener(name,callback));}
  async function refresh(){
    pending=true;if(!active())return get();
    if(readTask)return readTask;
    const ownGeneration=generation,revision=overrideRevision;
    readTask=(async()=>{
      let value;try{value=await read();}catch(_){value=undefined;}
      if(!started||generation!==ownGeneration)return get();
      if(overrideRevision===revision&&value!==undefined)override=value===null?null:normalize(value);
      globalTheme=loadGlobal();emit();return get();
    })();
    try{return await readTask;}finally{if(generation===ownGeneration)readTask=null;}
  }
  function get(){return clone(override||globalTheme);}
  function publicChange(event){
    const value=parse(event.detail);if(!value)return;
    // Events never carry settings or credentials; only the appearance allowlist survives.
    globalTheme=value;pending=true;if(active())emit();
  }
  function storageChange(event){if(event.key!==SCRIPT_UI_THEME_KEY&&event.key!==null)return;pending=true;if(active()){globalTheme=loadGlobal();emit();}}
  function visibility(){if(active()&&pending)void refresh();}
  function tabState(event){
    const state=event.detail;if(!state||typeof state.isActiveTab!=='boolean'||typeof state.isWebViewVisible!=='boolean')return;
    pdaRevision++;pdaActive=state.isActiveTab&&state.isWebViewVisible;
    const awaitingQuery=!!cancelPdaQuery;cancelPdaQuery?.();
    if(active()&&pending&&!awaitingQuery)void refresh();
  }
  function pagehide(event){if(event.persisted){suspended=true;pending=true;}else stop();}
  function pageshow(event){if(event.persisted){suspended=false;pending=true;if(active())void refresh();}}
  function mediaChange(){if(active())emit();else pending=true;}
  async function start(){
    if(started)return refresh();started=true;suspended=false;pending=true;lastSignature='';lastDark=null;
    const ownGeneration=++generation;
    listen(doc,SCRIPT_UI_THEME_EVENT,publicChange);listen(win,SCRIPT_UI_THEME_EVENT,publicChange);listen(win,'storage',storageChange);
    listen(doc,'visibilitychange',visibility);listen(win,'tornpda:tabState',tabState);listen(win,'pagehide',pagehide);listen(win,'pageshow',pageshow);
    if(media?.addEventListener)listen(media,'change',mediaChange);
    else if(media?.addListener){media.addListener(mediaChange);removers.push(()=>media.removeListener(mediaChange));}
    if(typeof win.PDA_getTabState==='function'){
      const revision=pdaRevision;pdaActive=false;
      const state=await new Promise(resolve=>{
        const schedule=win.setTimeout?.bind(win)||setTimeout,clear=win.clearTimeout?.bind(win)||clearTimeout;
        let settled=false,timer=null;
        const finish=value=>{if(settled)return;settled=true;if(timer!==null)clear(timer);if(cancelPdaQuery===finish)cancelPdaQuery=null;resolve(value);};
        cancelPdaQuery=finish;timer=schedule(()=>finish(undefined),750);
        Promise.resolve().then(()=>started&&generation===ownGeneration?win.PDA_getTabState():undefined).then(finish,()=>finish(undefined));
      });
      if(started&&generation===ownGeneration&&revision===pdaRevision)pdaActive=!(state?.isActiveTab===false||state?.isWebViewVisible===false);
    }
    if(started&&generation===ownGeneration)return refresh();return get();
  }
  function stop(){started=false;suspended=false;generation++;readTask=null;cancelPdaQuery?.();for(const remove of removers.splice(0))remove();}
  function setOverride(value){
    const normalized=value===null?null:normalize(value);overrideRevision++;
    const run=async()=>{await write(normalized===null?null:clone(normalized));override=normalized;globalTheme=loadGlobal();emit();return get();};
    const task=writeQueue.then(run);writeQueue=task.catch(()=>{});return task;
  }
  function subscribe(listener){if(typeof listener!=='function')throw new TypeError('Theme listener must be a function');subscribers.add(listener);return()=>subscribers.delete(listener);}
  return {start,stop,get,setOverride,refresh,subscribe};
}
module.exports = {createScriptUiThemeClient,SCRIPT_UI_THEME_KEY,SCRIPT_UI_THEME_EVENT};
