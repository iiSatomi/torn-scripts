'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.TORN_PLAYWRIGHT||'C:/Users/asato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../..'),source=fs.readFileSync(path.join(root,'Torn_War_Payout_Calculator.user.js'),'utf8'),hub=fs.readFileSync(path.join(root,'script-hub/dist/Torn_Script_Hub.user.js'),'utf8');
const html='<html><body style="background:#252c33"><aside id="sidebar"><a href="/messages.php">Mail</a><a href="/page.php?sid=events">Events</a><a href="/page.php?sid=awards">Awards</a></aside></body></html>';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.TORN_BROWSER||'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true,args:['--no-first-run','--no-default-browser-check']});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.name));await page.setViewportSize({width:1920,height:1080});
  await page.route('**/*',r=>r.fulfill({status:200,contentType:'text/html',body:html}));
  async function mount(values=[]){
   await page.goto('https://www.torn.com/factions.php?step=your&type=1');
   await page.evaluate(values=>{
    window.auditValues=new Map(values);window.auditCalls=[];window.auditLive=false;window.auditHits=1;window.auditQuota=false;window.auditFail=false;
    window.GM_info={scriptHandler:'Tampermonkey'};window.GM_getValue=(k,d)=>{const read=()=>window.auditValues.has(k)?window.auditValues.get(k):d;if(k==='twpc-war-cache-v1'&&window.auditHoldCache)return new Promise(resolve=>{window.auditCacheReadReady=true;window.auditReleaseCacheRead=()=>resolve(read());});return read();};
    window.GM_setValue=(k,v)=>{if(k==='twpc-war-cache-v1'&&window.auditQuota)throw new Error('Synthetic quota');window.auditValues.set(k,v);};window.GM_deleteValue=k=>window.auditValues.delete(k);window.GM_registerMenuCommand=()=>{};
    window.GM_xmlhttpRequest=o=>{
     const url=new URL(o.url),part=url.pathname.split('/').pop();window.auditCalls.push(part);
     const now=Math.floor(Date.now()/1000),war={id:window.auditLive?501:500,start:now-1000,end:window.auditLive?0:now-100,factions:[{id:10,name:'Frostbite'},{id:20,name:'Synthetic enemy'}]};
     // Stable scope across refresh and fresh mounts.
     war.start=1700000000;war.end=window.auditLive?0:1700001000;
     const actor=(id,faction)=>({id,name:id===1?'Alpha':'Beta',faction:{id:faction}});
     const attacks=Array.from({length:window.auditHits},(_,i)=>({id:i+1,started:1700000010+i,ended:1700000020+i,attacker:actor(1,10),defender:actor(2,20),result:'Hospitalized',is_ranked_war:true}));
     const data=part==='basic'?{basic:{id:window.auditFaction||10}}:part==='rankedwars'?{rankedwars:window.auditFaction===30||window.auditNoRecent?[]:[war]}:part==='attacks'?{attacks,_metadata:{links:{prev:null,next:null}}}:{rankedwarreport:{factions:[{id:10,rewards:{items:[{id:1,name:'Armor cache',quantity:3}]}}]}};
     const timer=setTimeout(()=>window.auditFail&&part==='attacks'?o.onerror():o.onload({status:200,responseText:JSON.stringify(data)}),5);return{abort:()=>clearTimeout(timer)};
    };
   },values);
   await page.evaluate(s=>(0,eval)(s),hub);await page.evaluate(s=>(0,eval)(s),source);await page.waitForSelector('#tsh-launcher');await page.click('#tsh-launcher');await page.click('[data-script="war-payout-calculator"] .tsh-primary');
  }
  const finished=()=>page.waitForFunction(()=>document.getElementById('twpc-dialog').getAttribute('aria-busy')==='false');
  const calls=()=>page.evaluate(()=>window.auditCalls.filter(p=>p==='attacks').length);
  await mount();await page.click('#twpc-settings-toggle');await page.type('#twpc-key','TESTTESTTESTTEST');await page.click('#twpc-use-key');await page.click('#twpc-tab-calculator');
  await page.click('#twpc-list-wars');await page.waitForSelector('#twpc-war option[value="500"]',{state:'attached'});await page.selectOption('#twpc-war','500');await finished();
  assert.match(await page.$eval('#twpc-cache-state',e=>e.textContent),/saved/i,'finished scan is saved');assert.equal(await calls(),1);
  await page.selectOption('#twpc-war','');await page.selectOption('#twpc-war','500');await finished();assert.equal(await calls(),1,'selecting completed saved war uses zero attack calls');assert.match(await page.$eval('#twpc-cache-state',e=>e.textContent),/cached/i);
  await page.evaluate(()=>{window.auditHits=2;window.auditNoRecent=true;});await page.click('#twpc-load');await finished();assert.equal(await calls(),2,'explicit Refresh bypasses saved counts even outside recent-war results');assert.equal(await page.$eval('#twpc-war',e=>e.value),'500','archived war remains selected');assert.match(await page.$eval('#twpc-war-counts',e=>e.textContent),/2 hits/);await page.evaluate(()=>{window.auditNoRecent=false;});
  await page.evaluate(()=>{window.auditFaction=30;});await page.click('#twpc-load');await finished();assert.match(await page.$eval('#twpc-status',e=>e.textContent),/different faction/i);assert.equal(await calls(),2,'wrong-faction Refresh never queries attacks');
  await page.selectOption('#twpc-war','');await page.selectOption('#twpc-war','500');await finished();assert.match(await page.$eval('#twpc-war-counts',e=>e.textContent),/2 hits/,'wrong-faction Refresh kept saved report');await page.evaluate(()=>{window.auditFaction=10;});
  await page.evaluate(()=>{window.auditQuota=true;window.auditHits=3;});await page.click('#twpc-load');await finished();assert.match(await page.$eval('#twpc-war-counts',e=>e.textContent),/3 hits/,'quota leaves fresh report usable');assert.match(await page.$eval('#twpc-status',e=>e.textContent),/could not be saved/i);
  await page.selectOption('#twpc-war','');await page.selectOption('#twpc-war','500');await finished();assert.match(await page.$eval('#twpc-war-counts',e=>e.textContent),/2 hits/,'old persisted report survived quota');
  const values=await page.evaluate(()=>[...window.auditValues]);await mount(values);await page.waitForSelector('#twpc-war option[value="500"]',{state:'attached'});await page.selectOption('#twpc-war','500');await finished();assert.equal(await calls(),0,'fresh script can reopen saved completed report without a key');assert.match(await page.$eval('#twpc-war-counts',e=>e.textContent),/2 hits/);
  const set=async(id,value)=>page.$eval('#twpc-'+id,(e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));},value);
  await set('profit','10000000');await set('rate-hits','1000000');
  assert.equal(await page.$eval('#twpc-dialog .tsui-title',e=>e.textContent),'War payout calculator');assert.equal(await page.$eval('#twpc-dialog',e=>e.dataset.tsuiKit),'1');
  for(const size of [{width:1920,height:1080},{width:390,height:844},{width:430,height:932},{width:844,height:390}]){
   await page.setViewportSize(size);await new Promise(r=>setTimeout(r,80));
   const rect=await page.$eval('#twpc-dialog',e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};});
   assert.ok(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=size.width+1&&rect.y+rect.height<=size.height+1);assert.ok(rect.width<=Math.min(760,size.width));
   await page.screenshot({path:path.join(__dirname,'war-payout-frostbite-'+size.width+'.png')});
   if(size.width===1920)await (await page.$('#twpc-dialog')).screenshot({path:path.join(__dirname,'war-payout-frostbite-preview.png')});
  }
  await page.selectOption('#twpc-mode','estimate');await set('cache-total','20000000');assert.equal(await page.$eval('#twpc-est-rate',e=>e.textContent),'$10,000,000');
  for(const size of [{width:1920,height:1080},{width:390,height:844},{width:430,height:932},{width:844,height:390}]){
   await page.setViewportSize(size);await new Promise(r=>setTimeout(r,80));await page.$eval('#twpc-dialog .tsui-content',e=>{e.scrollTop=0;});await page.screenshot({path:path.join(__dirname,'war-payout-frostbite-estimate-'+size.width+'.png')});
  }
  await page.selectOption('#twpc-mode','actual');await page.click('#twpc-settings-toggle');
  for(const size of [{width:1920,height:1080},{width:390,height:844},{width:430,height:932},{width:844,height:390}]){
   await page.setViewportSize(size);await new Promise(r=>setTimeout(r,80));await page.$eval('#twpc-dialog .tsui-content',e=>{e.scrollTop=0;});await page.screenshot({path:path.join(__dirname,'war-payout-frostbite-settings-'+size.width+'.png')});
  }
  await page.click('#twpc-tab-calculator');
  await page.setViewportSize({width:1920,height:1080});await page.click('#twpc-settings-toggle');await page.type('#twpc-key','TESTTESTTESTTEST');await page.click('#twpc-use-key');await page.click('#twpc-tab-calculator');
  await page.evaluate(()=>{window.auditLive=true;});await page.click('#twpc-list-wars');await finished();await page.selectOption('#twpc-war','501');await finished();assert.equal(await calls(),1,'new live war scans instead of using an old completed war');assert.match(await page.$eval('#twpc-cache-state',e=>e.textContent),/live snapshot/i);
  await page.selectOption('#twpc-war','');await page.selectOption('#twpc-war','501');await finished();assert.equal(await calls(),1,'live snapshot selection reuses cached preview');
  await page.click('#twpc-tab-credits');await page.click('#twpc-credit-reviewed');await page.waitForFunction(()=>!document.getElementById('twpc-credit-lock').disabled);await page.click('#twpc-credit-lock');await new Promise(r=>setTimeout(r,80));assert.match(await page.$eval('#twpc-credit-note',e=>e.textContent),/ended actual-profit payout/i);await page.click('#twpc-tab-calculator');
  await page.evaluate(()=>{window.auditHits=4;});await page.click('#twpc-load');await finished();assert.equal(await calls(),2,'live Refresh scans fully');assert.match(await page.$eval('#twpc-war-counts',e=>e.textContent),/4 hits/);
  await page.evaluate(()=>{window.auditFail=true;});await page.click('#twpc-load');await finished();assert.equal(await page.$eval('#twpc-copy',e=>e.disabled),true);await page.selectOption('#twpc-war','');await page.selectOption('#twpc-war','501');await finished();assert.match(await page.$eval('#twpc-war-counts',e=>e.textContent),/4 hits/,'failed scan kept previous preview');
  await page.evaluate(()=>{window.auditFail=false;window.auditHoldCache=true;window.auditHits=5;});await page.click('#twpc-load');await page.waitForFunction(()=>window.auditCacheReadReady===true);await page.click('#twpc-collapse');await page.evaluate(()=>{window.auditHoldCache=false;window.auditReleaseCacheRead();});await new Promise(r=>setTimeout(r,100));
  assert.equal(await page.evaluate(()=>JSON.parse(window.auditValues.get('twpc-war-cache-v1')).records.find(r=>r.scope.warId===501).totals.hits),4,'collapse during delayed storage read prevents a new cache write');await page.click('#twpc-collapse');await page.selectOption('#twpc-war','');await page.selectOption('#twpc-war','501');await finished();assert.match(await page.$eval('#twpc-war-counts',e=>e.textContent),/4 hits/);
  await page.evaluate(()=>{window.auditValues.set('twpc-credit-ledger-v1','RECEIPTS');});page.on('dialog',d=>d.accept());await page.click('#twpc-settings-toggle');await page.click('#twpc-cache-settings summary');await page.selectOption('#twpc-cache-delete-war','10:501');await page.click('#twpc-cache-delete');await page.waitForFunction(()=>JSON.parse(window.auditValues.get('twpc-war-cache-v1')).records.every(r=>r.scope.warId!==501));assert.equal(await page.evaluate(()=>window.auditValues.get('twpc-credit-ledger-v1')),'RECEIPTS');
  assert.deepEqual(errors,[]);console.log('PASS completed/live reuse, no-key reopen, explicit scans, quota/cancellation safety, shared window bounds, separate receipts');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
