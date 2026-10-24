const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
let playwright;try{playwright=require('playwright');}catch(_){playwright=require('C:/Users/asato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const root=path.resolve(__dirname,'..');
assert.ok(fs.existsSync(path.join(root,'dist/Torn_Banker_Request_Hub.user.js')),'Build must produce the new Banker Request Hub install artifact.');
const source=fs.readFileSync(path.join(root,'dist/Torn_Banker_Request_Hub.user.js'),'utf8');
const uuid='dc88f110-9e02-4ce0-a038-d004ee887399';
(async()=>{
 const browser=await playwright.chromium.launch({headless:true,executablePath:process.env.BANKER_BROWSER||'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1920,height:1080}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install();
  await page.route('https://www.torn.com/**',r=>r.fulfill({contentType:'text/html',body:'<html><body><a href="/profiles.php?XID=999">Unrelated profile</a><div id="sidebar"><p>Other: <a href="/profiles.php?XID=456">Other member</a></p><p>Name:<a href="/profiles.php?XID=123">Sample</a></p></div><main>Fixture Torn page</main></body></html>'}));
  await page.goto('https://www.torn.com/index.php');
  await page.evaluate(()=>{
   window.store={};window.posts=[];window.abortCount=0;
   window.GM_info={scriptHandler:'Tampermonkey',script:{version:'1.0.0'}};
   window.GM_getValue=(k,d)=>Object.hasOwn(store,k)?store[k]:d;
   window.GM_setValue=(k,v)=>{store[k]=v;};window.GM_deleteValue=k=>{delete store[k];};
   window.GM_xmlhttpRequest=o=>{window.posts.push({url:o.url,body:JSON.parse(o.data)});let stopped=false;const timer=setTimeout(()=>{
    if(stopped)return;
    if(window.timeoutNext){window.timeoutNext=false;o.ontimeout();return;}
    if(window.delayReply){window.delayed=()=>o.onload({status:200,responseText:JSON.stringify({ok:true,user:{id:123,name:'Sample',factionId:10},banker:true})});return;}
    const payload=JSON.parse(o.data);let response;
    if(o.url.endsWith('/identity'))response={ok:true,user:{id:123,name:'Sample',factionId:10},banker:true};
    else response={ok:true,request:{...payload,token:'dc88f110-9e02-4ce0-a038-d004ee887399',requestId:payload.requestId||'6bc34db5-3049-4015-af10-ae19c90a8617',userId:123,name:'Sample',factionId:10,kind:payload.kind||'amount',amount:payload.kind==='full'?undefined:payload.amount||5000000,createdAt:Date.now(),expiresAt:Date.now()+7200000,status:'sent'},retryAfter:60};
    o.onload({status:200,responseText:JSON.stringify(response),finalUrl:o.url});
   },10);return {abort(){stopped=true;clearTimeout(timer);window.abortCount++;}};};
  });
  await page.addScriptTag({content:source});
  await page.getByRole('button',{name:'Open banker request',exact:true}).click();
  await page.getByRole('button',{name:'Open connection',exact:true}).click();
  assert.equal(await page.locator('#brh-endpoint').inputValue(),'','fresh public install starts with no relay');
  assert.equal(await page.locator('#brh-key').inputValue(),'','fresh public install starts with no API key');
  assert.equal(await page.locator('#brh-amount').inputValue(),'','fresh public install starts with no requested amount');
  await page.locator('#brh-endpoint').fill('https://banker-demo.example.workers.dev');
  await page.locator('#brh-key').fill('TESTONLY00000001');
  await page.getByRole('button',{name:'Connect',exact:true}).click({timeout:2000});
  await page.getByText('Banker access verified.',{exact:true}).waitFor({timeout:2000});
  await page.evaluate(()=>{const a=document.createElement('a');a.id='ambiguous-identity';a.setAttribute('aria-label','Name: conflicting profile');a.href='/profiles.php?XID=999';document.body.append(a);});
  await page.getByRole('button',{name:'Connect',exact:true}).click();
  await page.getByText('Your logged-in Torn ID is unavailable. Open a normal Torn page and try again.',{exact:true}).waitFor({timeout:2000});
  await page.evaluate(()=>document.getElementById('ambiguous-identity').remove());
  await page.getByRole('button',{name:'Connect',exact:true}).click();
  await page.getByText('Banker access verified.',{exact:true}).waitFor({timeout:2000});
  assert.equal(await page.evaluate(()=>Object.values(store).some(x=>JSON.stringify(x).includes('TESTONLY00000001'))),false,'session key not persisted');
  await page.locator('#brh-key').evaluate(e=>e.value='');
  await page.getByRole('button',{name:'Request',exact:true}).click();
  await page.locator('#brh-amount').fill('5,000,000');
  await page.evaluate(()=>{window.timeoutNext=true;});
  await page.getByRole('button',{name:'Send request',exact:true}).click();
  await page.getByText(/Connection timed out\. Check the same request/).waitFor();
  await page.getByRole('button',{name:'Check previous request',exact:true}).click();
  await page.getByText('Request sent',{exact:true}).waitFor();
  const retried=await page.evaluate(()=>posts.filter(x=>x.url.endsWith('/v1/requests')));
  assert.equal(retried.length,2);assert.deepEqual(retried[0].body,retried[1].body,'ambiguous request keeps exact original id and payload');
  await page.clock.fastForward(61000);
  await page.getByRole('radio',{name:'Full balance',exact:true}).check();
  await page.getByRole('button',{name:'Send request',exact:true}).click();
  await page.getByText('Full faction balance',{exact:true}).waitFor();
  let requests=await page.evaluate(()=>posts.filter(x=>x.url.endsWith('/v1/requests')));
  assert.equal(requests.length,3);assert.equal(requests[2].body.kind,'full');assert.equal(Object.hasOwn(requests[2].body,'amount'),false);
  assert.equal(Object.hasOwn(requests[2].body,'userId'),false,'identity must not be claimed by client');
  await page.addScriptTag({content:source});
  assert.equal(await page.locator('[data-tsui-id="banker-request"]').count(),1,'singleton UI');
  for(const [width,height] of [[1920,1080],[390,844],[430,932],[844,390]]){
   await page.setViewportSize({width,height});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'page overflow '+width);
   await page.screenshot({path:path.join(root,'reports','ui-'+width+'.png'),fullPage:true});
  }
  await page.setViewportSize({width:1920,height:1080});
  await page.getByRole('button',{name:'Connection',exact:true}).click();
  await page.evaluate(()=>{window.delayReply=true;});
  await page.getByRole('button',{name:'Connect',exact:true}).click();
  await page.getByRole('button',{name:'Close window',exact:true}).click();
  await page.evaluate(()=>window.delayed?.());
  assert.equal(await page.locator('[data-tsui-id="banker-request"]').isVisible(),false,'late response cannot reopen UI');
  await page.getByRole('button',{name:'Open banker request',exact:true}).click();
  await page.getByRole('button',{name:'Connection',exact:true}).click();
  await page.evaluate(()=>{window.delayReply=false;document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new CustomEvent('tornpda:tabState',{detail:{isActiveTab:false,isWebViewVisible:false}}));});
  const calls=await page.evaluate(()=>posts.length);
  await page.getByRole('button',{name:'Connect',exact:true}).click();
  assert.equal(await page.evaluate(()=>posts.length),calls,'inactive PDA makes no calls');
  assert.deepEqual(errors,[]);
  await require('./client-races.cjs')(browser,source);
  await require('./client-hub.cjs')(browser,source);
  await require('./client-initialization.cjs')(browser,source);
  await require('./client-link.cjs')(browser,source);
  await require('./client-balance.cjs')(browser,source);
  await require('./client-roles.cjs')(browser,source);
  await require('./client-page-identity.cjs')(browser,source);
  await page.reload();
  await page.evaluate(()=>{
   const saved={endpoint:'https://saved-faction.example.workers.dev',useHub:false,remember:false};
   window.GM_info={scriptHandler:'Tampermonkey',script:{version:'1.0.1'}};
   const values={'banker-request-hub:v1:settings':saved};
   window.GM_getValue=(key,fallback)=>Object.hasOwn(values,key)?values[key]:fallback;
   window.GM_setValue=(key,value)=>{values[key]=value;};window.GM_deleteValue=key=>{delete values[key];};
  });
  await page.addScriptTag({content:source});
  await page.getByRole('button',{name:'Open banker request',exact:true}).click();
  await page.getByRole('button',{name:'Open connection',exact:true}).click();
  assert.equal(await page.locator('#brh-endpoint').inputValue(),'https://saved-faction.example.workers.dev','previously saved relay survives blank public defaults');
  console.log('PASS generated userscript: compact UI, session-only key, own identity, full intent, duplicate install, no overflow at desktop/PDA widths, close/late reply and inactive guards.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
