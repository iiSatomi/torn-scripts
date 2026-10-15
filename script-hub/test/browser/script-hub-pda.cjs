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
  for(const [width,height,dpr]of [[480,856,3],[412,734,3.5],[360,642,4],[390,844,3],[430,932,3],[844,390,3],[1920,1080,1]]){
   const page=await browser.newPage({viewport:{width,height},screen:{width,height:Math.round(3120/dpr)},deviceScaleFactor:dpr,isMobile:true,hasTouch:true}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/*',r=>r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#252525;color:#ddd;font:14px Arial}nav{display:flex;gap:10px;padding:12px;background:#333}main{padding:20px;min-height:1400px}#quick-items{position:fixed;right:0;bottom:0;width:52%;height:40px;background:#456;z-index:2147483647}</style></head><body><nav>Home · Stocks · Events · Messages · Faction</nav><main>Synthetic mobile home</main><div id="quick-items">Synthetic quick items</div></body></html>'}));
   await page.addInitScript(()=>{
    const store=new Map();window.GM_info={scriptHandler:'Torn PDA'};window.GM_getValue=(key,fallback)=>store.has(key)?store.get(key):fallback;window.GM_setValue=(key,value)=>store.set(key,value);window.GM_deleteValue=key=>store.delete(key);window.GM_registerMenuCommand=(_label,callback)=>{window.syntheticNativeOpen=callback;};
    const namespaces=new Map();window.__pdaStorageFactory=id=>{if(!namespaces.has(id))namespaces.set(id,new Map());const native=namespaces.get(id);return {get:async(key,fallback)=>native.has(key)?native.get(key):fallback,set:async(key,value)=>native.set(key,value),delete:async key=>native.delete(key)};};
    window.PDA_getTabState=async()=>({isActiveTab:true,isWebViewVisible:true});window.apiCalls=0;window.GM_xmlhttpRequest=()=>{window.apiCalls++;throw Error('No API call expected in this fixture');};
   });
   await page.goto('https://www.torn.com/index.php');
   if(width===1920)await page.evaluate(()=>delete window.PDA_getTabState);
   await page.evaluate(source=>(0,eval)(source),adapt(read('script-hub/dist/Torn_Script_Hub.user.js'),'synthetic-hub'));
   await page.waitForSelector('#tsh-launcher',{timeout:3000});
   const visible=await page.locator('#tsh-launcher').evaluate(n=>{const r=n.getBoundingClientRect();return r.width===44&&n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});assert.equal(visible,true,'PDA launcher is reachable at '+width+' CSS pixels');
   await page.tap('#tsh-launcher');assert.match(await page.textContent('.tsh-empty'),/script\u2019s page/,'original message punctuation survives PDA preparation');
   await page.evaluate(source=>(0,eval)(source),adapt(read('Torn_War_Payout_Calculator.user.js'),'synthetic-payout'));
   await page.tap('[data-script="war-payout-calculator"] .tsh-primary');
   try{await page.waitForSelector('#twpc-dialog',{timeout:3000});}catch(error){const failure=await page.evaluate(()=>{try{syntheticNativeOpen();return null;}catch(error){return error.stack;}});throw Error('PDA payout launch: '+JSON.stringify({errors,status:await page.textContent('.tsh-status'),failure})+' '+error.message);}
   await page.waitForFunction(()=>document.querySelector('#tsh-dialog').hidden,{},{timeout:3000});
   async function assertFitted(w,h){await page.waitForFunction(([w,h])=>{const r=document.querySelector('#twpc-dialog').getBoundingClientRect();return r.x===8&&r.y===8&&r.width===w-16&&r.height===h-16;},[w,h],{timeout:3000});const box=await page.locator('#twpc-dialog').boundingBox();assert.deepEqual([box.x,box.y,box.width,box.height],[8,8,w-16,h-16],'PDA tool opens maximized');}
   await assertFitted(width,height);
   assert.equal(await page.locator('#twpc-dialog').evaluate(node=>node.contains(document.activeElement)),true,'closing Hub does not steal tool focus');
   await page.click('#twpc-close');await page.tap('#tsh-launcher');await page.tap('[data-script="war-payout-calculator"] .tsh-primary');await assertFitted(width,height);
   await page.setViewportSize({width:height,height:width});await assertFitted(height,width);
   await page.setViewportSize({width,height});await assertFitted(width,height);
   await page.click('#twpc-close');await page.tap('#tsh-launcher');
   await page.evaluate(()=>{
    const meta={id:'synthetic-error',name:'Synthetic error',url:location.href,instance:'synthetic-error-instance',actions:[{id:'open',label:'Open'}]};
    document.dispatchEvent(new CustomEvent('torn-script-hub:v1:register',{detail:JSON.stringify(meta)}));
    document.addEventListener('torn-script-hub:v1:activate',event=>{const command=JSON.parse(event.detail);if(command.id===meta.id)document.dispatchEvent(new CustomEvent('torn-script-hub:v1:result',{detail:JSON.stringify({...command,status:'error'})}));});
   });
   await page.tap('[data-script="synthetic-error"] .tsh-primary');assert.equal(await page.isVisible('#tsh-dialog'),true,'failed launch retains Hub');
   assert.equal(await page.evaluate(()=>apiCalls),0);
   assert.deepEqual(errors,[]);await page.close();
  }
  console.log('PASS PDA-prepared Hub and payout, S25 scales and mobile/landscape/wide matrix, maximize/reopen/rotation, success-only dismissal and no API requests');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
