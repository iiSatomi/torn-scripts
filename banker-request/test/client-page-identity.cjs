const assert=require('node:assert/strict');
module.exports=async function clientPageIdentity(browser,source){
 const unavailable='Your logged-in Torn ID is unavailable. Open a normal Torn page and try again.';
 const wrongOwner='The key must belong to the Torn account currently logged in.';
 for(const viewport of [{width:390,height:844},{width:430,height:932},{width:844,height:390},{width:1920,height:1080}]){
  const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
   await page.route('https://www.torn.com/**',r=>r.fulfill({contentType:'text/html',body:'<html><head><script id="native-banner">window.topBannerInitData = {"user":{"data":{"userID":123}},"headlines":[]}</script></head><body><div id="sidebar"></div><a href="/profiles.php?XID=999">Viewed forum author</a></body></html>'}));
   await page.goto('https://www.torn.com/forums.php');
   await page.evaluate(()=>{
    window.store={};window.posts=[];
    window.PDA_getTabState=async()=>({uid:'00000000-0000-4000-8000-000000000001',isActiveTab:true,isWebViewVisible:true});
    window.GM_info={scriptHandler:'Torn PDA'};
    window.GM_getValue=(key,fallback)=>Object.hasOwn(store,key)?store[key]:fallback;
    window.GM_setValue=(key,value)=>{store[key]=value;};window.GM_deleteValue=key=>{delete store[key];};
    window.GM_xmlhttpRequest=options=>{posts.push(options.url);queueMicrotask(()=>options.onload({status:200,finalUrl:options.url,responseText:JSON.stringify({ok:true,user:{id:123,name:'Sample',factionId:10},banker:false})}));return {abort(){}};};
   });
   // PDA rewrites literal smart quotes before executing a userscript.
   const adapted=source.replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"');
   await page.addScriptTag({content:adapted});
   await page.getByRole('button',{name:'Open banker request',exact:true}).click();
   await page.getByRole('button',{name:'Connection',exact:true}).click();
   await page.locator('#brh-endpoint').fill('https://relay.example.workers.dev');
   await page.locator('#brh-key').fill('TESTONLY00000001');
   await page.getByRole('button',{name:'Connect',exact:true}).click();
   await page.getByText('Faction membership verified.',{exact:true}).waitFor({timeout:2000});
   assert.equal(await page.evaluate(()=>posts.length),1,'mobile verification uses one existing relay call');
   assert.equal(await page.evaluate(()=>Object.values(store).some(value=>JSON.stringify(value).includes('TESTONLY00000001'))),false,'key remains in memory');
   if(viewport.width===390){
    for(const [bootstrap,message] of [
     ['window.topBannerInitData = {"user":{"data":{"userID":999}}}',wrongOwner],
     ['window.topBannerInitData = {"profile":{"userID":123}}',unavailable],
     ['window.topBannerInitData = {"user":{"data":{"userID":0}}}',unavailable],
     ['window.topBannerInitData = {"user":{"data":{"userID":"123"}}}',unavailable],
     ['window.topBannerInitData = {"user":{"data":{"userID":9007199254740992}}}',unavailable],
     ['window.topBannerInitData = notJSON',unavailable],
     ['const example = "window.topBannerInitData = {\\"user\\":{\\"data\\":{\\"userID\\":123}}}";',unavailable],
     ['',unavailable]
    ]){
     await page.evaluate(text=>{document.getElementById('native-banner').textContent=text;},bootstrap);
     await page.getByRole('button',{name:'Connect',exact:true}).click();
     await page.getByText(message,{exact:true}).waitFor({timeout:2000});
     assert.equal(await page.getByRole('button',{name:'Send request',exact:true,includeHidden:true}).isEnabled(),false);
    }
    await page.evaluate(()=>{document.getElementById('native-banner').textContent='window.topBannerInitData = {"user":{"data":{"userID":123}}};';document.getElementById('sidebar').innerHTML='<p>Name: <a href="/profiles.php?XID=999">Conflicting account</a></p>';});
    await page.getByRole('button',{name:'Connect',exact:true}).click();
    await page.getByText(unavailable,{exact:true}).waitFor({timeout:2000});
    await page.evaluate(()=>{document.getElementById('sidebar').replaceChildren();});
    await page.getByRole('button',{name:'Connect',exact:true}).click();
    await page.getByText('Faction membership verified.',{exact:true}).waitFor({timeout:2000});
   }
   assert.deepEqual(errors,[],'PDA-adapted generated script has no syntax/runtime errors');
  }finally{await page.close();}
 }
 console.log('PASS mobile account identity: no sidebar, one relay check, PDA source adaptation, wrong-key/conflict/malformed rejection at desktop and phone widths.');
};
if(require.main===module){
 const fs=require('node:fs');let playwright;try{playwright=require('playwright');}catch(_){playwright=require('C:/Users/asato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
 (async()=>{const browser=await playwright.chromium.launch({headless:true,executablePath:process.env.BANKER_BROWSER||'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe'});try{await module.exports(browser,fs.readFileSync(require.resolve('../dist/Torn_Banker_Request_Hub.user.js'),'utf8'));}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
}
