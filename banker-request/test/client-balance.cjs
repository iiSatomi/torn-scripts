const assert=require('node:assert/strict');
module.exports=async function clientBalance(browser,source){
 const page=await browser.newPage();
 try{
  await page.route('https://www.torn.com/**',r=>r.fulfill({contentType:'text/html',body:'<html><body><a aria-label="Name: Sample" href="/profiles.php?XID=123">Sample</a></body></html>'}));
  await page.goto('https://www.torn.com/index.php');
  await page.evaluate(()=>{
   window.store={'banker-request-hub:v1:settings':{endpoint:'https://relay.example.workers.dev',remember:true,connected:true},'banker-request-hub:v1:personal-key':'TESTONLY00000001'};
   window.posts=[];window.rejection='NO_BALANCE';window.GM_info={scriptHandler:'Tampermonkey'};
   window.GM_getValue=(k,d)=>Object.hasOwn(store,k)?store[k]:d;window.GM_setValue=(k,v)=>{store[k]=structuredClone(v);};window.GM_deleteValue=k=>{delete store[k];};
   window.GM_xmlhttpRequest=o=>{posts.push({url:o.url,body:JSON.parse(o.data)});queueMicrotask(()=>{const success=o.url.endsWith('/identity');o.onload({status:success?200:409,finalUrl:o.url,responseText:JSON.stringify(success?{ok:true,user:{id:123,name:'Sample',factionId:10},banker:false}:{ok:false,error:{code:rejection,message:'private upstream details'}})});});return {abort(){}};};
  });
  await page.addScriptTag({content:source});
  await page.getByRole('button',{name:'Open banker request',exact:true}).click();
  await page.getByRole('button',{name:'Send request',exact:true}).waitFor();
  await page.getByText('Account verified.',{exact:true}).waitFor();
  await page.locator('#brh-amount').fill('5,000,000');
  for(const code of ['NO_BALANCE','OVER_BALANCE','BALANCE_PERMISSION','BALANCE_UNAVAILABLE']){
   await page.evaluate(code=>{window.rejection=code;},code);
   await page.getByRole('button',{name:'Send request',exact:true}).click();
   await page.waitForFunction(()=>!store['banker-request-hub:v1:pending']&&!document.querySelector('.brh-page button.tsui-primary').disabled);
   assert.equal(await page.evaluate(()=>store['banker-request-hub:v1:pending']),undefined,code+' proves no request was reserved');
   assert.equal(await page.locator('#brh-amount').isDisabled(),false,code+' allows correcting the amount');
   assert.equal(await page.getByRole('button',{name:'Send request',exact:true}).isDisabled(),false);
   const status=await page.locator('.brh-status').innerText();assert.ok(!status.includes('private'));assert.ok(!status.includes('Check previous request'));
  }
  const ids=await page.evaluate(()=>posts.filter(p=>p.url.endsWith('/v1/requests')).map(p=>p.body.requestId));
  assert.equal(new Set(ids).size,4,'each explicitly rejected request can be corrected with a fresh ID');
  await page.evaluate(()=>{window.rejection='UNAVAILABLE';});
  await page.getByRole('button',{name:'Send request',exact:true}).click();
  await page.getByText(/Use Check previous request/).waitFor();
  assert.ok(await page.evaluate(()=>store['banker-request-hub:v1:pending']),'unknown outcomes retain idempotent recovery');
  console.log('PASS request rejections: balance/scope failures release unreserved pending drafts; unknown outcomes retain recovery.');
 }finally{await page.close();}
};
