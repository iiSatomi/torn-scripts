const assert=require('node:assert/strict');
module.exports=async function clientInitialization(browser,source){
 const page=await browser.newPage();
 try{
  await page.route('https://www.torn.com/**',r=>r.fulfill({contentType:'text/html',body:'<html><body><a aria-label="Name: Sample" href="/profiles.php?XID=123">Sample</a></body></html>'}));
  await page.goto('https://www.torn.com/index.php');
  await page.evaluate(()=>{
   window.store={'banker-request-hub:v1:settings':{endpoint:'https://relay.example.workers.dev',remember:true},'banker-request-hub:v1:personal-key':'TESTONLY00000001'};window.posts=[];
   window.GM_info={scriptHandler:'Tampermonkey'};
   window.GM_getValue=(k,d)=>k==='banker-request-hub:v1:personal-key'?new Promise(resolve=>{const captured=store[k];window.releaseKey=()=>resolve(captured);}):Object.hasOwn(store,k)?store[k]:d;
   window.GM_setValue=(k,v)=>{store[k]=structuredClone(v);};window.GM_deleteValue=k=>{delete store[k];};
   window.GM_xmlhttpRequest=o=>{posts.push(o.url);queueMicrotask(()=>o.onerror());return {abort(){}};};
  });
  await page.addScriptTag({content:source});
  await page.waitForFunction(()=>typeof releaseKey==='function');
  await page.getByRole('button',{name:'Open banker request',exact:true}).click();
  await page.getByRole('button',{name:'Connection',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Forget personal key',exact:true}).isDisabled(),true,'Forget must wait for pending key hydration');
  await page.evaluate(()=>releaseKey());
  await page.getByRole('button',{name:'Forget personal key',exact:true}).click();
  await page.getByText('Personal key forgotten.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Connect',exact:true}).click();
  assert.equal(await page.evaluate(()=>posts.length),0,'forgotten key cannot be reused after delayed startup');
  assert.equal(await page.evaluate(()=>store['banker-request-hub:v1:personal-key']),undefined);
  console.log('PASS initialization: pending key hydration cannot undo Forget.');
 }finally{await page.close();}
};
