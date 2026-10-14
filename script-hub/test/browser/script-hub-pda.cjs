'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.TORN_PLAYWRIGHT||'C:/Users/asato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../../..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
// Same closure and punctuation normalization as upstream UserScriptsProvider.adaptSource().
const adapt=(source,id)=>('(function(){const PDA_storage=window.__pdaStorageFactory('+JSON.stringify(id)+');'+source+'}());').replace(/[\u201c\u201d]/g,'"').replace(/[\u2018\u2019]/g,"'");
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.TORN_BROWSER||'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true});
 try{
  // S25 Ultra physical display is 1440x3120. Exercise multiple Android scales;
  // reserve native toolbar space in the WebView instead of assuming full-screen CSS pixels.
  for(const [width,height,dpr]of [[480,856,3],[412,734,3.5],[360,642,4]]){
   const page=await browser.newPage({viewport:{width,height},screen:{width,height:Math.round(3120/dpr)},deviceScaleFactor:dpr,isMobile:true,hasTouch:true}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/*',r=>r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#252525;color:#ddd;font:14px Arial}nav{display:flex;gap:10px;padding:12px;background:#333}main{padding:20px;min-height:1400px}#quick-items{position:fixed;right:0;bottom:0;width:52%;height:40px;background:#456;z-index:2147483647}</style></head><body><nav>Home · Stocks · Events · Messages · Faction</nav><main>Synthetic mobile home</main><div id="quick-items">Synthetic quick items</div></body></html>'}));
   await page.addInitScript(()=>{
    const store=new Map();window.GM_info={scriptHandler:'Torn PDA'};window.GM_getValue=(key,fallback)=>store.has(key)?store.get(key):fallback;window.GM_setValue=(key,value)=>store.set(key,value);window.GM_deleteValue=key=>store.delete(key);window.GM_registerMenuCommand=(_label,callback)=>{window.syntheticNativeOpen=callback;};
    const namespaces=new Map();window.__pdaStorageFactory=id=>{if(!namespaces.has(id))namespaces.set(id,new Map());const native=namespaces.get(id);return {get:async(key,fallback)=>native.has(key)?native.get(key):fallback,set:async(key,value)=>native.set(key,value),delete:async key=>native.delete(key)};};
    window.PDA_getTabState=async()=>({isActiveTab:true,isWebViewVisible:true});window.apiCalls=0;window.GM_xmlhttpRequest=()=>{window.apiCalls++;throw Error('No API call expected in this fixture');};
   });
   await page.goto('https://www.torn.com/index.php');
   await page.evaluate(source=>(0,eval)(source),adapt(read('script-hub/dist/Torn_Script_Hub.user.js'),'synthetic-hub'));
   await page.waitForSelector('#tsh-launcher',{timeout:3000});
   const visible=await page.locator('#tsh-launcher').evaluate(n=>{const r=n.getBoundingClientRect();return r.width===44&&n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});assert.equal(visible,true,'PDA launcher is reachable at '+width+' CSS pixels');
   await page.tap('#tsh-launcher');assert.match(await page.textContent('.tsh-empty'),/script\u2019s page/,'original message punctuation survives PDA preparation');
   await page.evaluate(source=>(0,eval)(source),adapt(read('Torn_War_Payout_Calculator.user.js'),'synthetic-payout'));
   await page.tap('[data-script="war-payout-calculator"] .tsh-primary');
   try{await page.waitForSelector('#twpc-dialog',{timeout:3000});}catch(error){const failure=await page.evaluate(()=>{try{syntheticNativeOpen();return null;}catch(error){return error.stack;}});throw Error('PDA payout launch: '+JSON.stringify({errors,status:await page.textContent('.tsh-status'),failure})+' '+error.message);}
   assert.equal(await page.isVisible('#tsh-dialog'),true);assert.equal(await page.evaluate(()=>apiCalls),0);
   assert.deepEqual(errors,[]);await page.close();
  }
  console.log('PASS PDA-prepared Hub and payout, S25 Ultra scaling profiles, touch launch, preserved text and no API requests');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
