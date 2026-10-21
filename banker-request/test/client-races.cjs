const assert=require('node:assert/strict');
module.exports=async function clientRaces(browser,source){
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try {
 await page.route('https://www.torn.com/**',r=>r.fulfill({contentType:'text/html',body:'<html><body><a aria-label="Name: Sample" href="/profiles.php?XID=123">Sample</a></body></html>'}));
 await page.goto('https://www.torn.com/index.php');
 await page.evaluate(()=>{
  window.store={};window.posts=[];window.GM_info={scriptHandler:'Tampermonkey',script:{version:'1.0.0'}};
  window.GM_getValue=(k,d)=>Object.hasOwn(store,k)?store[k]:d;
  window.GM_setValue=(k,v)=>{if(window.delayStorage===k.split(':').at(-1))return new Promise(resolve=>{window.releaseStorage=()=>{store[k]=v;window.delayStorage=null;resolve();};});store[k]=v;};
  window.GM_deleteValue=k=>{delete store[k];};
  window.GM_xmlhttpRequest=o=>{posts.push({url:o.url,body:JSON.parse(o.data),key:o.headers.Authorization});let stopped=false;queueMicrotask(()=>{if(stopped)return;const body=JSON.parse(o.data);const response=o.url.endsWith('/identity')?{ok:true,user:{id:123,name:'Sample',factionId:10},banker:true}:window.expired?{ok:false,error:{code:'EXPIRED',message:'Expired'}}:window.uncertain?{ok:true,request:{...body,token:'dc88f110-9e02-4ce0-a038-d004ee887399',userId:123,name:'Sample',factionId:10,amount:body.kind==='full'?undefined:body.amount,createdAt:Date.now(),expiresAt:Date.now()+7200000,status:window.delivered?'sent':window.deliveryPending?'pending':'uncertain'},retryAfter:0}:null;if(response)o.onload({status:response.ok?200:410,responseText:JSON.stringify(response),finalUrl:o.url});else o.ontimeout();});return{abort(){stopped=true;}};};
 });
 await page.addScriptTag({content:source});
 const click=name=>page.getByRole('button',{name,exact:true}).click();
 await click('Open banker request');await click('Open connection');await page.locator('#brh-endpoint').fill('https://relay.example.workers.dev');await page.locator('#brh-key').fill('TESTONLY00000001');await click('Connect');await page.getByText('Banker access verified.',{exact:true}).waitFor();
 await click('Request');await page.locator('#brh-amount').fill('5,000,000');await page.evaluate(()=>{window.delayStorage='pending';});await click('Send request');await page.waitForFunction(()=>typeof window.releaseStorage==='function');await click('Close window');await click('Open banker request');await page.evaluate(()=>window.releaseStorage());await page.waitForTimeout(80);
 assert.equal(await page.evaluate(()=>posts.filter(x=>x.url.endsWith('/requests')).length),0,'canceled pending-storage send cannot post after reopen');
 assert.equal(await page.getByRole('button',{name:'Dismiss expired request',exact:true,includeHidden:true}).count(),1,'expiry dismissal control exists');
 assert.equal(await page.getByRole('button',{name:'Dismiss expired request',exact:true,includeHidden:true}).isVisible(),false,'active ambiguous pending cannot be directly cleared');
 await page.evaluate(()=>{window.uncertain=true;window.delivered=true;window.delayStorage='cooldown';window.releaseStorage=null;});await click('Check previous request');await page.waitForFunction(()=>typeof window.releaseStorage==='function');await click('Close window');await click('Open banker request');await page.evaluate(()=>window.releaseStorage());await page.waitForTimeout(80);
 assert.ok(await page.evaluate(()=>store['banker-request-hub:v1:pending']),'cancelled cooldown continuation retains original pending record');
 await page.evaluate(()=>{window.delivered=false;window.deliveryPending=true;});await click('Check previous request');await page.getByText('Delivery needs checking',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Send request',exact:true}).isDisabled(),true,'server pending delivery retains original ID');
 await page.evaluate(()=>{window.deliveryPending=false;});await click('Check previous request');await page.getByText('Delivery needs checking',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Dismiss expired request',exact:true,includeHidden:true}).isVisible(),false,'uncertain pending cannot be dismissed');
 assert.equal(await page.getByRole('button',{name:'Send request',exact:true}).isDisabled(),true,'uncertain result retains original pending ID');
 await page.evaluate(()=>{window.expired=true;});await click('Check previous request');await page.getByRole('button',{name:'Dismiss expired request',exact:true}).waitFor();
 page.once('dialog',dialog=>{assert.match(dialog.message(),/check Discord/i);assert.match(dialog.message(),/server history/i);dialog.dismiss();});await click('Dismiss expired request');assert.ok(await page.evaluate(()=>store['banker-request-hub:v1:pending']),'cancelled confirmation retains pending');
 page.once('dialog',dialog=>dialog.accept());await click('Dismiss expired request');await page.waitForFunction(()=>!store['banker-request-hub:v1:pending']);assert.equal(await page.getByRole('button',{name:'Send request',exact:true}).isDisabled(),false);
 await click('Connection');await page.locator('#brh-key').fill('TESTONLY00000002');await page.locator('#brh-remember').check();await page.evaluate(()=>{window.delayStorage='settings';window.releaseStorage=null;});await click('Connect');await page.waitForFunction(()=>typeof window.releaseStorage==='function');await click('Forget personal key');await page.evaluate(()=>window.releaseStorage());await page.getByText('Personal key forgotten.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>store['banker-request-hub:v1:personal-key']),undefined,'delayed save cannot resurrect forgotten key');assert.equal(await page.evaluate(()=>store['banker-request-hub:v1:settings'].remember),false);
 assert.deepEqual(errors,[]);console.log('PASS client storage races: canceled-send suppression, persistent uncertain IDs, confirmed expiry dismissal, forget wins delayed save.');
 }finally{await page.close();}
};
