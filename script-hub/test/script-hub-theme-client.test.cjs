const test=require('node:test');
const assert=require('node:assert/strict');
const {createScriptUiThemeClient,SCRIPT_UI_THEME_KEY:KEY,SCRIPT_UI_THEME_EVENT:EVENT}=require('../src/script-hub-theme-client.cjs');
function fixture(extra={}){
  const doc=new EventTarget(),win=new EventTarget(),media=new EventTarget(),store=new Map();
  doc.visibilityState='visible';media.matches=false;win.matchMedia=()=>media;win.localStorage={getItem:key=>store.get(key)||null};
  Object.assign(win,extra);const changes=[],writes=[];let own=null,reads=0;
  const client=createScriptUiThemeClient({doc,win,scriptId:'test-helper',read:()=>{reads++;return own;},write:async theme=>{writes.push(theme);own=theme;},onChange:theme=>changes.push(theme)});
  const emit=(target,type,props={})=>{const e=new Event(type);for(const [key,value]of Object.entries(props))Object.defineProperty(e,key,{value});target.dispatchEvent(e);};
  const global=theme=>{store.set(KEY,JSON.stringify(theme));emit(doc,EVENT,{detail:JSON.stringify(theme)});};
  return{doc,win,media,store,client,changes,writes,emit,global,get reads(){return reads;}};
}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
test('shared UI subscribers receive private overrides, independent clones, media and reset, and can release ownership',async()=>{
  const f=fixture(),seen=[];
  const unsubscribe=f.client.subscribe(theme=>{seen.push(theme.palette);theme.palette='mutated';});
  const second=[];const removeSecond=f.client.subscribe(theme=>second.push(theme.palette));
  await f.client.start();await f.client.setOverride({palette:'workbench'});
  assert.deepEqual(seen,['frostbite','workbench']);assert.deepEqual(second,seen);assert.equal(f.client.get().palette,'workbench');
  unsubscribe();await f.client.setOverride(null);assert.deepEqual(seen,['frostbite','workbench']);assert.equal(second.at(-1),'frostbite');
  removeSecond();f.client.stop();
});
test('legacy Hub appearance is inherited before the user opens or saves Themes',async()=>{
  const f=fixture();f.store.set('torn-script-hub:v2:preferences',JSON.stringify({theme:'light',accent:'#123456',compact:true,secret:'discard'}));
  await f.client.start();assert.equal(f.client.get().layout,'torn');assert.equal(f.client.get().mode,'light');assert.equal(f.client.get().density,'compact');assert.equal(f.client.get().colors.light.accent,'#123456');assert.equal(JSON.stringify(f.client.get()).includes('secret'),false);f.client.stop();
});
test('standalone defaults, validated global changes, persisted overrides and reset',async()=>{
  const f=fixture();await f.client.start();assert.equal(f.client.get().palette,'frostbite');
  f.global({palette:'torn',secret:'drop'});await flush();assert.equal(f.client.get().palette,'torn');assert.equal(JSON.stringify(f.changes).includes('secret'),false);
  await f.client.setOverride({layout:'workbench',palette:'workbench'});assert.equal(f.writes[0].version,1);
  f.global({palette:'frostbite'});await flush();assert.equal(f.client.get().palette,'workbench');
  await f.client.setOverride(null);assert.equal(f.writes.at(-1),null);assert.equal(f.client.get().palette,'frostbite');
  const copy=f.client.get();copy.layout='torn';assert.equal(f.client.get().layout,'frostbite');f.client.stop();
});
test('malformed and oversized events ignored, storage failures fall back safely',async()=>{
  const f=fixture();await f.client.start();f.emit(f.doc,EVENT,{detail:'x'.repeat(9000)});f.emit(f.doc,EVENT,{detail:'{'});f.emit(f.doc,EVENT,{detail:{palette:'torn'}});await flush();assert.equal(f.client.get().palette,'frostbite');
  f.win.localStorage.getItem=()=>{throw Error('blocked');};await f.client.refresh();assert.equal(f.client.get().palette,'frostbite');f.client.stop();
  const client=createScriptUiThemeClient({doc:f.doc,win:f.win,scriptId:'broken',read:()=>{throw Error('denied');},write:()=>{throw Error('quota');},onChange:()=>{}});
  await client.start();await assert.rejects(client.setOverride({palette:'torn'}),/quota/);assert.equal(client.get().palette,'frostbite');client.stop();
});
test('hidden, PDA inactive and BFCache updates coalesce and stop removes all listeners',async()=>{
  const f=fixture();await f.client.start();const initial=f.changes.length;
  f.doc.visibilityState='hidden';f.emit(f.doc,'visibilitychange');f.global({palette:'torn'});f.global({palette:'workbench'});await flush();assert.equal(f.changes.length,initial);
  f.doc.visibilityState='visible';f.emit(f.doc,'visibilitychange');await flush();assert.equal(f.changes.length,initial+1);assert.equal(f.client.get().palette,'workbench');
  f.emit(f.win,'tornpda:tabState',{detail:{isActiveTab:false,isWebViewVisible:true}});f.global({palette:'torn'});await flush();const inactive=f.changes.length;
  f.emit(f.win,'tornpda:tabState',{detail:{isActiveTab:true,isWebViewVisible:true}});await flush();assert.equal(f.changes.length,inactive+1);
  f.emit(f.win,'pagehide',{persisted:true});f.global({palette:'frostbite'});await flush();assert.equal(f.changes.length,inactive+1);
  f.emit(f.win,'pageshow',{persisted:true});await flush();assert.equal(f.client.get().palette,'frostbite');
  f.client.stop();const count=f.changes.length;f.global({palette:'torn'});f.emit(f.win,'pageshow',{persisted:true});f.emit(f.media,'change');await flush();assert.equal(f.changes.length,count);
});
test('initial PDA query defers work, media changes notify, and late async read cannot undo explicit save',async()=>{
  const f=fixture({PDA_getTabState:async()=>({isActiveTab:false,isWebViewVisible:true})});await f.client.start();assert.equal(f.reads,0);assert.equal(f.changes.length,0);
  f.emit(f.win,'tornpda:tabState',{detail:{isActiveTab:true,isWebViewVisible:true}});await flush();assert.equal(f.changes.length,1);
  f.media.matches=true;f.emit(f.media,'change');await flush();assert.equal(f.changes.length,2);f.client.stop();
  let finish;const g=fixture();const client=createScriptUiThemeClient({doc:g.doc,win:g.win,scriptId:'race',read:()=>new Promise(resolve=>finish=resolve),write:async()=>{},onChange:()=>{}});
  const starting=client.start();await flush();await client.setOverride({palette:'torn'});finish({palette:'workbench'});await starting;assert.equal(client.get().palette,'torn');client.stop();
});
test('late PDA query failures cannot reactivate a restarted inactive client',async()=>{
  let rejectOld;const f=fixture({PDA_getTabState:()=>new Promise((_,reject)=>rejectOld=reject)});
  const oldStart=f.client.start();await flush();f.client.stop();
  f.win.PDA_getTabState=async()=>({isActiveTab:false,isWebViewVisible:true});await f.client.start();
  rejectOld(Error('bridge disposed'));await oldStart;f.global({palette:'torn'});await flush();
  assert.equal(f.changes.length,0);assert.equal(f.reads,0);f.client.stop();
});
test('storage changes validate data, BFCache reuses listeners, and stop releases ownership',async()=>{
  const {getEventListeners}=require('node:events');const f=fixture();await f.client.start();
  f.store.set(KEY,JSON.stringify({palette:'torn'}));f.emit(f.win,'storage',{key:KEY});await flush();assert.equal(f.client.get().palette,'torn');
  for(let i=0;i<3;i++){f.emit(f.win,'pagehide',{persisted:true});f.emit(f.win,'pageshow',{persisted:true});await flush();}
  assert.equal(getEventListeners(f.win,'pageshow').length,1);assert.equal(getEventListeners(f.doc,EVENT).length,1);
  f.client.stop();
  for(const [target,names]of [[f.doc,[EVENT,'visibilitychange']],[f.win,[EVENT,'storage','pageshow','pagehide','tornpda:tabState']],[f.media,['change']]])for(const name of names)assert.equal(getEventListeners(target,name).length,0);
});
test('a stalled PDA query falls back within a bounded timeout and ignores its late answer',async()=>{
  const timers=new Map();let finishQuery,calls=0;
  const f=fixture({PDA_getTabState:()=>{calls++;return new Promise(resolve=>finishQuery=resolve);},setTimeout:(callback,ms)=>{assert.ok(ms>0&&ms<=1000);timers.set(1,callback);return 1;},clearTimeout:id=>timers.delete(id)});
  const starting=f.client.start();await flush();assert.equal(timers.size,1);assert.equal(f.changes.length,0);
  timers.get(1)();await starting;assert.equal(f.changes.length,1);assert.equal(calls,1);assert.equal(timers.size,0);
  finishQuery({isActiveTab:false,isWebViewVisible:false});await flush();f.global({palette:'torn'});assert.equal(f.client.get().palette,'torn');assert.equal(f.changes.length,2);f.client.stop();
});
test('stop settles an outstanding PDA start and clears its timer; state events coalesce startup',async()=>{
  const timers=new Map();let id=0;
  const f=fixture({PDA_getTabState:()=>new Promise(()=>{}),setTimeout:callback=>{timers.set(++id,callback);return id;},clearTimeout:key=>timers.delete(key)});
  const starting=f.client.start();await flush();assert.equal(timers.size,1);f.client.stop();await starting;assert.equal(timers.size,0);assert.equal(f.changes.length,0);
  const restarted=f.client.start();await flush();f.emit(f.win,'tornpda:tabState',{detail:{isActiveTab:true,isWebViewVisible:true}});await restarted;await flush();
  assert.equal(timers.size,0);assert.equal(f.changes.length,1);assert.equal(f.reads,1);f.client.stop();
});
