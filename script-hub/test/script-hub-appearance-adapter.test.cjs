const test=require('node:test'),assert=require('node:assert/strict');
const {getEventListeners}=require('node:events');
const {createScriptUiAppearanceAdapter}=require('../src/script-hub-appearance-adapter.cjs');
const {normalizeScriptUiTheme,resolveScriptUiTheme}=require('../src/script-hub-theme.cjs');
const COMMAND='torn-script-hub:v1:appearance',RESULT=COMMAND+'-result';
function fixture(){
  class Node extends EventTarget{
    constructor(){super();this.attrs=new Map();this.classes=new Set();this.values=new Map();this.priorities=new Map();this.isConnected=true;
      this.classList={contains:name=>this.classes.has(name),add:name=>this.classes.add(name),remove:name=>this.classes.delete(name)};
      this.style={getPropertyValue:key=>this.values.get(key)||'',getPropertyPriority:key=>this.priorities.get(key)||'',setProperty:(key,value,priority='')=>{this.values.set(key,value);this.priorities.set(key,priority);},removeProperty:key=>{this.values.delete(key);this.priorities.delete(key);}};
    }
    setAttribute(key,value){this.attrs.set(key,value);}getAttribute(key){return this.attrs.get(key)??null;}removeAttribute(key){this.attrs.delete(key);}remove(){this.isConnected=false;}
  }
  const doc=new EventTarget(),win=new EventTarget(),observers=[],frames=new Map(),nodes=[new Node()],styles=[],responses=[];let own=null,frameId=0,reads=0,writes=[];
  doc.visibilityState='visible';doc.documentElement=new Node();doc.head={appendChild:node=>styles.push(node)};doc.createElement=()=>new Node();doc.querySelectorAll=selector=>selector==='#legacy'?nodes.filter(n=>n.isConnected):[];
  win.MutationObserver=class{constructor(callback){this.callback=callback;this.connected=false;observers.push(this);}observe(){this.connected=true;}disconnect(){this.connected=false;}};
  win.localStorage={getItem:()=>null};win.matchMedia=()=>({matches:false});win.requestAnimationFrame=callback=>{frames.set(++frameId,callback);return frameId;};win.cancelAnimationFrame=id=>frames.delete(id);
  doc.addEventListener(RESULT,event=>responses.push(JSON.parse(event.detail)));
  const adapter=createScriptUiAppearanceAdapter({doc,win,id:'tool',selectors:['#legacy'],getInstance:()=>'registered-1',read:()=>{reads++;return own;},write:async value=>{writes.push(value);own=value;}});
  const emit=(target,type,props={})=>{const event=new Event(type);for(const [key,value]of Object.entries(props))Object.defineProperty(event,key,{value});target.dispatchEvent(event);};
  const request=(request,method,extra={})=>emit(doc,COMMAND,{detail:JSON.stringify({id:'tool',instance:'registered-1',page:'ui-appearance',request,method,...extra})});
  const paint=()=>{for(const callback of [...frames.values()])callback();frames.clear();};
  return{Node,doc,win,nodes,styles,adapter,emit,request,responses,observers,frames,paint,get own(){return own;},set own(value){own=value;},get reads(){return reads;},get writes(){return writes;}};
}
async function flush(){for(let i=0;i<64;i++)await Promise.resolve();}

test('instance-bound bounded bridge exposes only validated appearance, supports reset and conflict',async()=>{
  const f=fixture();await f.adapter.start();f.request('read1','read');await flush();let result=f.responses.at(-1);
  assert.equal(result.status,'ok');assert.equal(result.data.inherit,true);assert.match(result.data.revision,/^[\w:-]{1,128}$/);
  const revision=result.data.revision;
  f.request('save1','save',{revision,theme:{palette:'torn',secret:'do-not-copy'}});await flush();result=f.responses.at(-1);
  assert.equal(result.status,'ok');assert.equal(result.data.theme.palette,'torn');assert.equal(result.data.inherit,false);assert.equal(JSON.stringify(f.responses).includes('do-not-copy'),false);assert.equal(JSON.stringify(f.writes).includes('do-not-copy'),false);
  f.own=normalizeScriptUiTheme({palette:'workbench'});f.request('stale','save',{revision:result.data.revision,theme:null});await flush();assert.equal(f.responses.at(-1).status,'conflict');assert.equal(f.writes.length,1);
  f.request('reset','save',{revision:f.responses.at(-1).data.revision,theme:null});await flush();assert.equal(f.responses.at(-1).data.inherit,true);assert.equal(f.own,null);
  const count=f.responses.length;f.request('wrong','read',{instance:'other'});f.request('read1','read');f.emit(f.doc,COMMAND,{detail:'x'.repeat(16385)});f.emit(f.doc,COMMAND,{detail:{id:'tool'}});await flush();assert.equal(f.responses.length,count);f.adapter.dispose();
});
test('serialized competing saves check a fresh revision and write once',async()=>{
  const f=fixture();await f.adapter.start();f.request('read','read');await flush();const revision=f.responses.at(-1).data.revision;
  f.request('a','save',{revision,theme:{palette:'torn'}});f.request('b','save',{revision,theme:{palette:'workbench'}});await flush();
  assert.equal(f.writes.length,1);assert.deepEqual(f.responses.slice(-2).map(r=>r.status),['ok','conflict']);f.adapter.dispose();
});
test('legacy roots gain owned tokens and aliases without moving content, then restore exact owned styles',async()=>{
  const f=fixture(),root=f.nodes[0];root.style.setProperty('--ocm-bg','#123456','important');root.style.setProperty('color','purple');root.classList.add('business-class');root.setAttribute('data-tsui-mode','old-mode');
  await f.adapter.start();f.paint();const colors=resolveScriptUiTheme({},false).colors;
  assert.equal(root.classList.contains('tsui-legacy-surface'),true);assert.equal(root.style.getPropertyValue('--tsui-background'),colors.background);assert.equal(root.style.getPropertyValue('--ocm-bg'),colors.background);assert.equal(root.style.getPropertyValue('--ground'),colors.background);
  assert.equal(root.classList.contains('business-class'),true);assert.equal(f.styles.length,1);assert.equal(f.observers.filter(o=>o.connected).length,1);
  f.adapter.stop();assert.equal(root.classList.contains('tsui-legacy-surface'),false);assert.equal(root.style.getPropertyValue('--ocm-bg'),'#123456');assert.equal(root.style.getPropertyPriority('--ocm-bg'),'important');assert.equal(root.style.getPropertyValue('--tsui-background'),'');assert.equal(root.style.getPropertyValue('color'),'purple');assert.equal(root.getAttribute('data-tsui-mode'),'old-mode');assert.equal(f.observers.filter(o=>o.connected).length,0);assert.equal(f.styles[0].isConnected,false);
  assert.equal(getEventListeners(f.doc,COMMAND).length,0);f.adapter.dispose();
});
test('hidden and PDA tabs release observer work and resume once, replaced roots are adopted',async()=>{
  const f=fixture();await f.adapter.start();f.paint();let observer=f.observers.find(o=>o.connected);
  observer.callback([]);observer.callback([]);assert.equal(f.frames.size,1);f.doc.visibilityState='hidden';f.emit(f.doc,'visibilitychange');assert.equal(f.frames.size,0);assert.equal(f.observers.filter(o=>o.connected).length,0);
  const old=f.nodes[0];old.isConnected=false;const fresh=new f.Node();f.nodes.push(fresh);f.request('hidden','read');await flush();assert.equal(f.responses.length,0);
  f.doc.visibilityState='visible';f.emit(f.doc,'visibilitychange');await flush();f.paint();assert.equal(f.observers.filter(o=>o.connected).length,1);assert.equal(fresh.classList.contains('tsui-legacy-surface'),true);assert.equal(old.classList.contains('tsui-legacy-surface'),false);
  f.emit(f.win,'tornpda:tabState',{detail:{isActiveTab:false,isWebViewVisible:true}});assert.equal(f.observers.filter(o=>o.connected).length,0);
  f.emit(f.win,'tornpda:tabState',{detail:{isActiveTab:true,isWebViewVisible:true}});await flush();f.paint();assert.equal(f.observers.filter(o=>o.connected).length,1);
  f.emit(f.win,'pagehide',{persisted:true});assert.equal(f.observers.filter(o=>o.connected).length,0);f.emit(f.win,'pageshow',{persisted:true});await flush();f.paint();assert.equal(f.observers.filter(o=>o.connected).length,1);
  f.emit(f.win,'hashchange');await flush();f.paint();assert.equal(f.observers.filter(o=>o.connected).length,1);f.adapter.dispose();
});
test('dedupe and queue stay bounded; failed writes produce no optimistic override',async()=>{
  const f=fixture();let release;let reads=0;
  const adapter=createScriptUiAppearanceAdapter({doc:f.doc,win:f.win,id:'blocked',selectors:[],getInstance:()=>'registered-1',read:()=>++reads===1?null:new Promise(resolve=>release=resolve),write:()=>{throw Error('private write failure');}});
  await adapter.start();for(let i=0;i<9;i++)f.request('pending'+i,'read',{id:'blocked'});await flush();assert.ok(reads<=2);assert.ok(f.responses.length<=4);
  adapter.dispose();release?.(null);await flush();assert.equal(getEventListeners(f.doc,COMMAND).length,0);
  const broken=createScriptUiAppearanceAdapter({doc:f.doc,win:f.win,id:'tool',selectors:[],getInstance:()=>'registered-1',read:()=>null,write:()=>{throw Error('private failure');}});await broken.start();f.request('before','read');await flush();f.request('fail','save',{revision:f.responses.at(-1).data.revision,theme:{palette:'torn'}});await flush();assert.equal(f.responses.at(-1).status,'error');assert.equal(f.responses.at(-1).data.inherit,true);assert.equal(JSON.stringify(f.responses).includes('private failure'),false);broken.dispose();
});
test('queued work abandoned while hidden releases its capacity on resume',async()=>{
  const f=fixture();let calls=0,finish;
  const adapter=createScriptUiAppearanceAdapter({doc:f.doc,win:f.win,id:'queued',selectors:[],getInstance:()=>'registered-1',read:()=>++calls===2?new Promise(resolve=>finish=resolve):null,write:()=>{}});
  await adapter.start();for(let i=0;i<5;i++)f.request('old'+i,'read',{id:'queued'});await flush();
  f.doc.visibilityState='hidden';f.emit(f.doc,'visibilitychange');finish(null);await flush();
  f.doc.visibilityState='visible';f.emit(f.doc,'visibilitychange');await flush();const previous=f.responses.length;
  for(let i=0;i<5;i++)f.request('new'+i,'read',{id:'queued'});await flush();
  assert.equal(f.responses.length-previous,5);assert.equal(f.responses.slice(previous).some(result=>result.status==='error'),false);adapter.dispose();
});
test('an initially inactive PDA tab does no appearance RPC or root work; hidden routes defer DOM cleanup',async()=>{
  const f=fixture();f.win.PDA_getTabState=async()=>({isActiveTab:false,isWebViewVisible:true});
  await f.adapter.start();f.request('inactive','read');await flush();f.paint();assert.equal(f.responses.length,0);assert.equal(f.reads,0);assert.equal(f.observers.length,0);
  f.emit(f.win,'tornpda:tabState',{detail:{isActiveTab:true,isWebViewVisible:true}});await flush();f.paint();assert.equal(f.nodes[0].classList.contains('tsui-legacy-surface'),true);
  f.doc.visibilityState='hidden';f.emit(f.doc,'visibilitychange');f.emit(f.win,'hashchange');assert.equal(f.nodes[0].classList.contains('tsui-legacy-surface'),true);f.adapter.dispose();
});
