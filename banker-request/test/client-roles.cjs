const assert=require('node:assert/strict');
module.exports=async function clientRoles(browser,source){
 const page=await browser.newPage();
 try{
  await page.route('https://www.torn.com/**',r=>r.fulfill({contentType:'text/html',body:'<html><body><a aria-label="Name: Sample" href="/profiles.php?XID=123">Sample</a></body></html>'}));
  await page.goto('https://www.torn.com/index.php');
  await page.evaluate(()=>{
   window.store={};window.banker=false;window.registrations=[];
   document.addEventListener('torn-script-hub:v1:register',e=>registrations.push(JSON.parse(e.detail)));
   window.GM_info={scriptHandler:'Tampermonkey'};window.GM_getValue=(k,d)=>Object.hasOwn(store,k)?structuredClone(store[k]):d;
   window.GM_setValue=(k,v)=>{store[k]=structuredClone(v);};window.GM_deleteValue=k=>{if(window.failDelete)throw new Error('Storage unavailable.');delete store[k];};
   window.GM_xmlhttpRequest=o=>{queueMicrotask(()=>o.onload({status:200,finalUrl:o.url,responseText:JSON.stringify({ok:true,user:{id:123,name:'Sample',factionId:10},banker})}));return {abort(){}};};
  });
  await page.addScriptTag({content:source});
  await page.getByRole('button',{name:'Open banker request',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Review payout',exact:true}).count(),0,'unverified accounts do not see banker navigation');
  await page.waitForFunction(()=>registrations.length>0);
  assert.equal(await page.evaluate(()=>registrations.at(-1).actions.some(a=>a.id==='review')),false,'unverified accounts advertise no banker shortcut');
  await page.getByRole('button',{name:'Connection',exact:true}).click();
  await page.locator('#brh-endpoint').fill('https://relay.example.workers.dev');
  await page.locator('#brh-key').fill('TESTONLY00000001');
  await page.getByRole('button',{name:'Connect',exact:true}).click();
  await page.getByText('Faction membership verified.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Review payout',exact:true}).count(),0,'verified members retain only member pages');
  await page.evaluate(()=>{window.banker=true;});
  await page.getByRole('button',{name:'Connect',exact:true}).click();
  await page.getByRole('button',{name:'Review payout',exact:true}).waitFor();
  await page.waitForFunction(()=>registrations.at(-1).actions.some(a=>a.id==='review'));
  const instance=await page.evaluate(()=>registrations.at(-1).instance);
  await page.getByRole('button',{name:'Review payout',exact:true}).click();
  await page.getByRole('button',{name:'Connection',exact:true}).click();
  await page.evaluate(()=>{window.failDelete=true;});
  await page.getByRole('button',{name:'Forget personal key',exact:true}).click();
  await page.getByText('Storage unavailable.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Review payout',exact:true}).count(),0,'forgetting the key removes banker navigation');
  assert.equal(await page.locator('#brh-token').isVisible(),false,'banker fields remain hidden after access clears');
  await page.waitForFunction(()=>!registrations.at(-1).actions.some(a=>a.id==='review'));
  assert.ok(await page.evaluate(instance=>registrations.every(r=>r.instance===instance),instance),'menu changes retain one adapter instance');
  await page.evaluate(()=>{window.failDelete=false;});
  await page.getByRole('button',{name:'Forget personal key',exact:true}).click();
  await page.getByText('Personal key forgotten.',{exact:true}).waitFor();
  console.log('PASS roles: member pages only until banker verification; Hub shortcut follows role and disappears when key is forgotten.');
 }finally{await page.close();}
};
