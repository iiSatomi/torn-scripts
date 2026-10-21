const assert=require('node:assert/strict');
const fs=require('node:fs');
const credentials=fs.readFileSync(require.resolve('../../script-hub/src/script-hub-credentials.cjs'),'utf8').replace(/^module\.exports[^\n]*$/gm,'');
module.exports=async function clientHub(browser,source){
 const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 async function boot(records,withHub){
  await page.evaluate(records=>{
   window.store=records;window.posts=[];window.GM_info={scriptHandler:'Tampermonkey'};
   window.GM_getValue=(k,d)=>Object.hasOwn(store,k)?structuredClone(store[k]):d;
   window.GM_setValue=(k,v)=>{store[k]=structuredClone(v);};window.GM_deleteValue=k=>{delete store[k];};
   window.GM_xmlhttpRequest=o=>{posts.push({url:o.url,key:o.headers.Authorization});queueMicrotask(()=>o.onload({status:200,finalUrl:o.url,responseText:JSON.stringify({ok:true,user:{id:123,name:'Sample',factionId:10},banker:false})}));return {abort(){}};};
  },records);
  if(withHub){
   await page.addScriptTag({content:credentials});
   await page.evaluate(async()=>{
    window.vault=createHubCredentialVault({storage:{eligible:true,async get(k){return store['fixture-vault:'+k]||null;},async set(k,v){store['fixture-vault:'+k]=structuredClone(v);return true;}},crypto});
    await vault.ready();await vault.setCredential('torn','TESTONLY00000002');
    window.emit=(name,value)=>document.dispatchEvent(new CustomEvent('torn-script-hub:v1:'+name,{detail:JSON.stringify(value)}));
    document.addEventListener('torn-script-hub:v1:register',e=>{window.consumer=JSON.parse(e.detail);});
    document.addEventListener('torn-script-hub:v1:credential-discover',async()=>emit('credential-info',{identity:await vault.publicIdentity(),providers:[{id:'torn',revision:1,configured:true}]}));
    document.addEventListener('torn-script-hub:v1:credential-request',async e=>{const reply=await vault.respond(JSON.parse(e.detail));if(reply)emit('credential-reply',reply);});
   });
  }
  await page.addScriptTag({content:source});
  await page.getByRole('button',{name:'Open banker request',exact:true}).click();
  await page.getByRole('button',{name:'Connection',exact:true}).click();
 }
 try{
  await page.route('https://www.torn.com/**',r=>r.fulfill({contentType:'text/html',body:'<html><body><a aria-label="Name: Sample" href="/profiles.php?XID=123">Sample</a></body></html>'}));
  await page.goto('https://www.torn.com/index.php');
  await boot({'banker-request-hub:v1:settings':{endpoint:'https://relay.example.workers.dev',remember:true,useHub:false},'banker-request-hub:v1:personal-key':'TESTONLY00000001'},true);
  await page.waitForFunction(()=>consumer?.credentialIdentity);
  assert.ok(await page.evaluate(()=>consumer.capabilities.includes('hub-keys-v2')),'announces current Hub key contract automatically');
  assert.equal(await page.locator('#brh-use-hub').count(),0,'no manual Hub opt-in checkbox');
  assert.equal(await page.evaluate(()=>posts.length),0,'discovery never sends a key to an unconfirmed relay');
  await page.evaluate(async()=>{await vault.grant('banker-request','torn',consumer.credentialIdentity.publicJwk);emit('credential-changed',{providerId:'torn',scriptId:'banker-request'});});
  await page.getByText('Using approved Script Hub Torn key.',{exact:true}).waitFor({timeout:5000});
  assert.equal(await page.locator('#brh-key').isVisible(),false,'Hub mode needs no personal key entry');
  await page.getByRole('button',{name:'Connect',exact:true}).click();
  await page.getByText('Account verified.',{exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>posts.map(p=>p.key)),['Bearer TESTONLY00000002']);
  assert.equal(await page.evaluate(()=>store['banker-request-hub:v1:personal-key']),undefined,'shared key never becomes a saved personal key');
  let saved=await page.evaluate(()=>structuredClone(store));
  await page.reload();await boot(saved,true);
  await page.getByText('Account verified.',{exact:true}).waitFor({timeout:5000});
  assert.equal(await page.evaluate(()=>posts.length),1,'approved connection verifies once when reopened after reload');
  await page.evaluate(async()=>{await vault.revoke('banker-request','torn');emit('credential-changed',{providerId:'torn',scriptId:'banker-request'});});
  await page.getByText('Managed by Script Hub. Approve Banker Request and select a key in Hub → API Keys.',{exact:true}).waitFor({timeout:5000});
  await page.getByRole('button',{name:'Connect',exact:true}).click();
  assert.equal(await page.evaluate(()=>posts.length),1,'revocation never retries the personal key');
  saved=await page.evaluate(()=>structuredClone(store));
  // A legacy saved personal key must also remain dormant after enrollment.
  saved['banker-request-hub:v1:personal-key']='TESTONLY00000001';saved['banker-request-hub:v1:settings'].remember=true;
  await page.reload();await boot(saved,false);
  await page.getByText('Managed by Script Hub. Approve Banker Request and select a key in Hub → API Keys.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Connect',exact:true}).click();
  assert.equal(await page.evaluate(()=>posts.length),0,'reload without Hub never activates a saved personal key');
  assert.deepEqual(errors,[]);
  console.log('PASS banker Hub integration: automatic discovery, explicit approval, encrypted delivery, one-click verification, approved reconnect, revocation and reload without personal fallback.');
 }finally{await page.close();}
};
