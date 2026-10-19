const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const artifact=path.join(__dirname,'../dist/Torn_War_Contracts_Hub.user.js');
assert.ok(fs.existsSync(artifact),'Build the separate War Contracts Hub userscript before browser verification.');
let playwright;try{playwright=require('playwright');}catch(_){playwright=require('C:/Users/asato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const source=fs.readFileSync(artifact,'utf8');
const report=path.join(__dirname,'../reports');fs.mkdirSync(report,{recursive:true});
async function connectionSettings(page){
 await page.getByRole('button',{name:'Connection',exact:true}).click();
 if(await page.locator('.wch-settings').getAttribute('open')===null)await page.locator('.wch-settings summary').click();
}
(async()=>{
 const browser=await playwright.chromium.launch({headless:true,executablePath:process.env.TORN_BROWSER||'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1920,height:1080}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://www.torn.com/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body><aside id="sidebar"><p>Name:<a href="/profiles.php?XID=123">Sample</a></p></aside><main>Isolated Torn fixture</main></body></html>'}));
  await page.goto('https://www.torn.com/index.php');
  await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../service/Code.gs'),'utf8')});
  await page.evaluate(()=>{
   window.store={};window.calls=[];window.copied=[];
   window.GM_info={scriptHandler:'Tampermonkey',script:{version:'1.0.0'}};
   window.GM_getValue=(k,d)=>Object.hasOwn(store,k)?store[k]:d;
   window.GM_setValue=(k,v)=>{store[k]=v;};window.GM_deleteValue=k=>{delete store[k];};
   window.GM_setClipboard=text=>{if(window.clipboardFail)throw new Error('blocked');window.copied.push(text);};
   window.manual=[{id:'manual:11',ourId:124,ourName:'Other member',enemyId:304,enemyName:'Booked Target',status:'manual',source:'manual',hits:'30',notes:'Manual entry must survive'}];window.deal=null;
   window.records=[];window.outputs=[];window.mainContracts=[];
   window.currentWar={war_id:42,start:Date.parse('2026-10-18T19:00:00Z')/1000,end:null,factions:[{id:100,name:'Example faction'},{id:200,name:'Example opponents'}]};
   const warCache=new Map();
   window.PropertiesService={getScriptProperties:()=>({getProperty:k=>({FACTION_ID:'100',WORKBOOK_ID:'synthetic'})[k]})};
   window.CacheService={getScriptCache:()=>({get:k=>warCache.get(k),put:(k,v)=>warCache.set(k,v)})};
   window.SpreadsheetApp={openById:()=>({})};
   window.UrlFetchApp={fetch:(url)=>{window.calls.push({path:'war-discovery',url});return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({wars:{ranked:window.currentWar,raids:[],territory:[]}})};}};
   const discovery=warContractsDependencies();
   window.service=createWarContractsService({
    config:{factionId:100},authenticate:()=>({id:123,factionId:100}),
    verifyContext:discovery.verifyContext,
    rosters:()=>({ours:[{id:123,name:'Sample'},{id:124,name:'Other member'}],enemies:[{id:304,name:'Booked Target'},{id:305,name:'Stretch Target'},{id:306,name:'Impossible Target'},{id:307,name:'Alternative Target'}]}),
    readManual:()=>({maxHits:30,opponentName:'Example opponents',contracts:window.conflict?[...window.manual,...window.mainContracts,{ourName:'Someone else',enemyId:305,enemyName:'Stretch Target'}]:[...window.manual,...window.mainContracts]}),
    readRecords:()=>({records:structuredClone(window.records),confirmed:structuredClone(window.outputs)}),
    writeRecord:r=>{window.records=window.records.filter(x=>x.id!==r.id).concat(structuredClone(r));},
    appendConfirmed:r=>{if(window.failBeforeAppend){window.failBeforeAppend=false;throw Error('Synthetic sheet outage');}window.outputs.push(structuredClone(r));},lock:fn=>fn(),now:()=>Date.now(),id:()=>crypto.randomUUID()
    ,syncMainContract:r=>{if(window.failMainSync){if(!manual.some(m=>m.id==='synthetic-conflict'))manual.push({...structuredClone(r),id:'synthetic-conflict',hits:99,status:'manual',source:'manual'});const e=Error('Synthetic main sheet conflict');e.publicCode='CONFLICT';throw e;}window.mainContracts=window.mainContracts.filter(m=>m.id!=='main-'+r.id).concat({...structuredClone(r),id:'main-'+r.id,status:'manual',source:'manual'});return 16;},
    planMainCancellation:r=>({id:r.id}),applyMainCancellation:(r,plan,roster,persist)=>{persist();window.mainContracts=window.mainContracts.filter(m=>m.id!=='main-'+r.id);window.manual=window.manual.filter(m=>!(m.ourId===r.ourId&&m.enemyId===r.enemyId));if(window.failCancelOnce){window.failCancelOnce=false;throw Error('Synthetic cancellation outage');}},markCancelled:r=>{const i=window.outputs.findIndex(x=>x.id===r.id);if(i<0)window.outputs.push(structuredClone(r));else window.outputs[i]=structuredClone(r);}
   });
   window.GM_xmlhttpRequest=o=>{
    const u=new URL(o.url),body=o.data?JSON.parse(o.data):null;window.calls.push({path:u.pathname,body});let ended=false;
    const reply=()=>{
     if(ended)return;let data;
     if(u.hostname==='ffscouter.com'&&window.ffStatus){o.onload({status:window.ffStatus,responseText:'private upstream response',finalUrl:o.url});return;}
     if(u.hostname==='script.google.com'){
      data=window.service.handle(body);if(data.ok)window.deal=data.deal||null;
     }else if(u.pathname.endsWith('/key/info'))data=window.tornError?{error:{code:window.tornError,error:'PRIVATE UPSTREAM DETAIL'}}:{info:{user:{id:window.invalidIdentity?999:123,faction_id:100}}};
     else if(u.pathname.endsWith('/battlestats'))data={battlestats:Object.fromEntries(['strength','defense','speed','dexterity'].map(k=>[k,{value:1000000,modifier:0}]))};
     else if(u.pathname.endsWith('/equipment'))data={equipment:[{uid:99,id:1,type:'Weapon',name:'Warlord rifle',stats:{damage:65,accuracy:65},bonuses:[{title:'Warlord',value:17}]}]};
     else if(u.pathname.endsWith('/members'))data={members:[{id:304,name:'Booked Target',level:100,status:{state:'Okay'}},{id:305,name:'Stretch Target',level:90,status:{state:'Hospital'}},{id:306,name:'Impossible Target',level:100,status:{state:'Okay'}},{id:307,name:'Alternative Target',level:80,status:{state:'Okay'}},{id:308,name:'Spy-only Target',level:100,status:{state:'Okay'}}]};
     else data=[{player_id:304,bss_public:4100,bs_estimate:4000000,last_updated:Date.now()/1000},{player_id:305,bss_public:4200,bs_estimate:4410000,last_updated:Date.now()/1000},{player_id:306,bss_public:900000,bs_estimate:202500000000,last_updated:Date.now()/1000},{player_id:307,bss_public:4100,bs_estimate:4202500,last_updated:Date.now()/1000},{player_id:308,bss_public:null,bs_estimate:4000000,last_updated:Date.now()/1000,source:'spies',available_estimates:{bss:null}}];
     o.onload({status:200,responseText:JSON.stringify(data),finalUrl:o.url});
    };
    if(window.delayReply){window.delayedReply=reply;}else setTimeout(reply,5);
    return {abort(){ended=true;}};
   };
  });
  await page.addScriptTag({content:source});
  await page.getByRole('button',{name:'Open war contracts',exact:true}).click();
  await connectionSettings(page);
  await page.locator('#wch-endpoint').fill('https://script.google.com/macros/s/test/exec');
  await page.locator('#wch-torn-key').fill('x'.repeat(16));
  await page.evaluate(()=>window.tornError=2);await page.getByRole('button',{name:'Save and reconnect',exact:true}).click();await page.getByText('Torn key info returned API error 2. Check that your assigned key is active and belongs to this account.',{exact:true}).waitFor();assert.equal((await page.locator('.wch-root').innerText()).includes('PRIVATE UPSTREAM DETAIL'),false);
  await page.evaluate(()=>window.tornError=0);
  await page.getByRole('button',{name:'Save and reconnect',exact:true}).click();
  await page.getByText('Connected as Sample.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Current Contracts',exact:true}).click();
  await page.locator('.wch-contract summary').first().click();
  await page.getByText('Manual entry must survive',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Find Partner',exact:true}).click();
  await page.evaluate(()=>window.ffStatus=401);
  await page.getByRole('button',{name:'Find my matches',exact:true}).click();
  await page.getByText('FFScouter rejected this request (HTTP 401). Register the exact estimate key at ffscouter.com, or enter your registered key in Connection.',{exact:true}).waitFor();
  assert.equal((await page.locator('.wch-root').innerText()).includes('private upstream'),false);
  assert.equal(await page.locator('.wch-match').count(),0);
  await page.evaluate(()=>window.ffStatus=0);
  await page.getByRole('button',{name:'Find my matches',exact:true}).click();
  await page.locator('.wch-match').filter({hasText:'Stretch Target'}).waitFor();
  assert.equal(await page.locator('.wch-match').filter({hasText:'Spy-only Target'}).count(),0,'merged spy-only estimate is not a public BSS recommendation');
  assert.equal(await page.locator('.wch-match-table').count(),1,'matches use one compact comparison table');
  assert.equal(await page.locator('.wch-match-detail').count(),1,'only the selected match gets a detail panel');
  assert.equal(await page.locator('.tsui-nav button:visible').count(),3,'Connection is in the window header');
  assert.equal(await page.locator('.tsui-header').getByRole('button',{name:'Connection',exact:true}).count(),1);
  const beforeSelection=await page.evaluate(()=>calls.length);
  await page.getByRole('button',{name:'Review Alternative Target',exact:true}).click();
  assert.equal(await page.locator('.wch-match-detail').filter({hasText:'Alternative Target'}).count(),1);
  await page.getByRole('button',{name:'Review Stretch Target',exact:true}).click();
  assert.equal(await page.evaluate(()=>calls.length),beforeSelection,'reviewing a match makes no API or reservation request');
  assert.equal(await page.locator('.wch-match').filter({hasText:'Booked Target'}).count(),0);
  assert.equal(await page.locator('.wch-match').filter({hasText:'Impossible Target'}).count(),0);
  for(const [width,height] of [[1920,1080],[390,844],[430,932],[844,390]]){
   await page.setViewportSize({width,height});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no matches document overflow '+width);
   assert.equal(await page.locator('.wch-match-table').evaluate(t=>t.scrollWidth>t.clientWidth+1),false,'match table fits '+width);
   if(width===1920)assert.ok(await page.locator('.wch-match').first().evaluate(r=>r.getBoundingClientRect().height)<60,'desktop comparison rows stay compact');
   else if(width<600)assert.ok(await page.getByRole('button',{name:'Review Stretch Target',exact:true}).evaluate(b=>b.getBoundingClientRect().height)>=44,'phone review target stays tappable');
   await page.screenshot({path:path.join(report,'matches-'+width+'.png'),fullPage:true});
  }
  await page.setViewportSize({width:1920,height:1080});
  await page.getByRole('button',{name:'Reserve and prepare message',exact:true}).click();
  await page.getByRole('button',{name:'Copy message',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>calls.filter(c=>c.body?.action==='reserve').length),1);
  assert.equal(await page.locator('#wch-time').inputValue(),'2026-10-18 19:00','new terms start with detected TCT time');
  assert.equal(await page.locator('#wch-online').inputValue(),'','member availability is not invented');
  assert.match(await page.locator('#wch-message').inputValue(),/Example opponents.*2026-10-18 19:00 TCT/);
  await page.getByRole('button',{name:'Review agreement',exact:true}).click();await page.locator('#wch-hits').fill('12');await page.locator('#wch-time').fill('20:30');await page.getByRole('button',{name:'Back to message',exact:true}).click();
  assert.match(await page.locator('#wch-message').inputValue(),/12 hits around 20:30 TCT/,'unedited generated invitation follows edited terms');
  await page.locator('#wch-message').fill('Custom invitation that must survive');await page.getByRole('button',{name:'Review agreement',exact:true}).click();await page.locator('#wch-hits').fill('14');await page.getByRole('button',{name:'Back to message',exact:true}).click();assert.equal(await page.locator('#wch-message').inputValue(),'Custom invitation that must survive');
  await page.locator('#wch-message').fill('');
  await page.getByRole('button',{name:'Review agreement',exact:true}).click();
  await page.locator('#wch-time').fill('22:00');
  await page.getByRole('button',{name:'Current Contracts',exact:true}).click();await page.getByRole('button',{name:'Refresh contracts',exact:true}).click();
  await page.getByText('Current contracts refreshed from the sheet.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'My Deal',exact:true}).click();assert.equal(await page.locator('#wch-time').inputValue(),'22:00','refresh preserves an edited draft even when the message is empty');
  await page.getByRole('button',{name:'Back to message',exact:true}).click();
  await page.locator('.wch-form select').selectOption('short');
  assert.equal(await page.evaluate(()=>calls.some(c=>c.body?.action==='sent')),false,'copy preparation must not mark sent');
  await page.evaluate(()=>window.clipboardFail=true);
  await page.getByRole('button',{name:'Copy message',exact:true}).click();
  await page.getByText('Could not copy. Select the message and copy it manually.',{exact:true}).waitFor();
  await page.evaluate(()=>window.clipboardFail=false);
  await page.getByRole('button',{name:'Copy message',exact:true}).click();
  await page.getByText('Message copied. Send it yourself; copying does not mark it sent.',{exact:true}).waitFor();
  assert.ok((await page.evaluate(()=>copied[0])).includes('Stretch Target'));
  await page.getByRole('button',{name:'Message sent',exact:true}).click();
  await page.getByText('Contact marked as sent.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Review agreement',exact:true}).click();
  const save=page.getByRole('button',{name:'Confirm and save deal',exact:true});
  assert.equal(await save.isEnabled(),false);
  await page.locator('#wch-agreed').check();
  await page.locator('#wch-hits').fill('21');
  await page.locator('#wch-online').fill('18:00-22:00');
  await page.locator('#wch-time').fill('19:30');
  await page.locator('#wch-notes').fill('21 hits then strip');
  await page.locator('#wch-final-review').check();
  await page.evaluate(()=>window.currentWar.war_id=43);
  await save.click();
  await page.getByText('The current war changed. Refresh Current Contracts.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>outputs.length),0,'a live war rollover prevents saving under the old war');
  await page.evaluate(()=>window.currentWar.war_id=42);
  await page.getByRole('button',{name:'Check saved state',exact:true}).click();
  await page.getByText('Saved state checked. Review My Deal and Current Contracts before continuing.',{exact:true}).waitFor();
  await page.evaluate(()=>window.conflict=true);
  await save.click();
  await page.getByText(/contract changed|already booked|conflict/i).last().waitFor();
  assert.notEqual(await page.evaluate(()=>deal.status),'confirmed','manual conflict must stop confirmation');
  await page.evaluate(()=>window.conflict=false);
  await page.getByRole('button',{name:'Check saved state',exact:true}).click();
  await page.getByText('Saved state checked. Review My Deal and Current Contracts before continuing.',{exact:true}).waitFor();
  await page.evaluate(()=>window.failBeforeAppend=true);
  await save.click();
  await page.getByText('The contracts service is unavailable. Refresh Current Contracts before retrying.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>outputs.length),0,'failed pre-append operation must not claim a confirmed sheet row');
  await page.locator('#wch-notes').fill('Unsaved edit after interruption');
  await page.getByRole('button',{name:'Check saved state',exact:true}).click();
  await page.getByText('Saved state checked. Review My Deal and Current Contracts before continuing.',{exact:true}).waitFor();
  assert.equal(await page.locator('#wch-notes').inputValue(),'21 hits then strip','authoritative pending terms replace same-session edits');
  assert.equal(await page.locator('#wch-agreed').isChecked(),false,'recovered terms need fresh agreement review');
  assert.equal(await page.locator('#wch-final-review').isChecked(),false);
  assert.ok((await page.locator('.wch-summary').last().textContent()).includes('21 hits then strip'),'preview reflects recovered terms');
  // Full consumer teardown/reinstall simulates reload; the independent service registry survives.
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false})));
  await page.addScriptTag({content:source});
  await page.getByRole('button',{name:'Open war contracts',exact:true}).click();
  await connectionSettings(page);
  await page.locator('#wch-torn-key').fill('x'.repeat(16));
  await page.getByRole('button',{name:'Save and reconnect',exact:true}).click();
  await page.getByText('Connected as Sample.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'My Deal',exact:true}).click();
  await page.getByText('Previous save terms recovered. Review and retry this exact agreement, or release the pending contact to start different terms.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Review agreement',exact:true}).click();
  assert.equal(await page.locator('#wch-hits').inputValue(),'21');
  assert.equal(await page.locator('#wch-online').inputValue(),'18:00-22:00');
  assert.equal(await page.locator('#wch-time').inputValue(),'19:30');
  assert.equal(await page.locator('#wch-notes').inputValue(),'21 hits then strip');
  await page.locator('#wch-agreed').check();await page.locator('#wch-final-review').check();
  await page.evaluate(()=>window.failMainSync=true);
  await save.click();
  await page.getByText('Deal confirmed; main sheet update needs attention.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>outputs.length),1);assert.equal(await page.evaluate(()=>mainContracts.length),0);
  const confirmationCalls=await page.evaluate(()=>calls.filter(c=>c.body?.action==='confirm').length);
  await page.evaluate(()=>{window.failMainSync=false;window.manual=window.manual.filter(m=>m.id!=='synthetic-conflict');});
  await page.getByRole('button',{name:'Retry main sheet sync',exact:true}).click();
  await page.getByText('Main War Contracts sheet updated.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>outputs.length),1);assert.equal(await page.evaluate(()=>mainContracts.length),1);
  assert.equal(await page.evaluate(()=>calls.filter(c=>c.body?.action==='confirm').length),confirmationCalls,'retrying the main copy is not a second confirmation');
  assert.equal(await page.evaluate(()=>manual[0].notes),'Manual entry must survive');
  await page.getByRole('button',{name:'Current Contracts',exact:true}).click();
  const ownRow=page.locator('.wch-contract').filter({hasText:'Stretch Target'});
  assert.equal(await ownRow.getAttribute('open'),null,'contract notes start folded');
  await ownRow.locator('summary').click();await page.getByText('21 hits then strip',{exact:true}).waitFor();
  assert.equal(await page.locator('.wch-contract').count(),2,'the main and audit rows for the script deal appear once');
  await page.locator('#wch-search').fill('Other member');
  assert.equal(await page.locator('.wch-contract').count(),1);
  await page.locator('#wch-search').fill('');
  assert.equal(await page.evaluate(()=>JSON.stringify(store).includes('xxxxxxxxxxxxxxxx')),false,'keys never persisted');
  assert.equal(await page.evaluate(()=>JSON.stringify(store).includes('1000000')),false,'private stats never persisted');
  await page.addScriptTag({content:source});
  assert.equal(await page.locator('[data-tsui-id="war-contracts"]').count(),1,'single UI instance');
  await page.getByRole('button',{name:'Close window',exact:true}).click();
  await page.getByRole('button',{name:'Open war contracts',exact:true}).click();
  assert.equal(await page.locator('.tsui-nav [aria-current="page"]').getAttribute('aria-label'),'My Deal','paired default opening selects My Deal');
  await page.getByRole('button',{name:'Current Contracts',exact:true}).click();
  await page.getByRole('button',{name:'Refresh contracts',exact:true}).click();
  await page.getByText('Current contracts refreshed from the sheet.',{exact:true}).waitFor();
  assert.equal(await page.locator('.tsui-nav [aria-current="page"]').getAttribute('aria-label'),'Current Contracts','refresh respects explicit navigation');
  for(const [width,height] of [[1920,1080],[390,844],[430,932],[844,390]]){
   await page.setViewportSize({width,height});
   await page.getByRole('button',{name:'Current Contracts',exact:true}).click();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no document overflow '+width);
   await page.screenshot({path:path.join(report,'contracts-'+width+'.png'),fullPage:true});
   await page.getByRole('button',{name:'Connection',exact:true}).click();
   if(await page.locator('.wch-settings').getAttribute('open')!==null)await page.locator('.wch-settings summary').click();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no connection overflow '+width);
   await page.screenshot({path:path.join(report,'connection-'+width+'.png'),fullPage:true});
  }
  await page.setViewportSize({width:1920,height:1080});
  await connectionSettings(page);
  await page.evaluate(()=>window.invalidIdentity=true);
  await page.locator('#wch-torn-key').fill('y'.repeat(16));
  await page.getByRole('button',{name:'Save and reconnect',exact:true}).click();
  await page.getByText('The key must belong to the Torn account currently logged in and a faction member.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Find Partner',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Find my matches',exact:true}).isEnabled(),false,'failed account switch clears old authorization');
  assert.equal(await page.locator('.wch-match').count(),0,'failed account switch clears private matches');
  await connectionSettings(page);
  await page.evaluate(()=>window.invalidIdentity=false);
  await page.locator('#wch-torn-key').fill('x'.repeat(16));
  await page.getByRole('button',{name:'Save and reconnect',exact:true}).click();
  await page.getByText('Connected as Sample.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Current Contracts',exact:true}).click();
  await page.evaluate(()=>window.delayReply=true);
  await page.getByRole('button',{name:'Refresh contracts',exact:true}).click();
  await page.getByRole('button',{name:'Close window',exact:true}).click();
  await page.evaluate(()=>window.delayedReply?.());
  assert.equal(await page.locator('[data-tsui-id="war-contracts"]').isVisible(),false,'late response must not reopen tool');
  await page.evaluate(()=>window.delayReply=false);
  await page.getByRole('button',{name:'Open war contracts',exact:true}).click();
  await page.getByRole('button',{name:'Cancel deal',exact:true}).click();
  const cancelSave=page.getByRole('button',{name:'Confirm cancellation',exact:true});assert.equal(await cancelSave.isEnabled(),false);
  for(const [width,height] of [[1920,1080],[390,844],[430,932],[844,390]]){await page.setViewportSize({width,height});await page.getByRole('button',{name:'My Deal',exact:true}).click();assert.equal(await page.getByRole('group',{name:'Cancel deal confirmation',exact:true}).isVisible(),true);await page.getByRole('button',{name:'Keep deal',exact:true}).focus();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'cancellation panel fits '+width);await page.screenshot({path:path.join(report,'cancel-'+width+'.png'),fullPage:true});}
  await page.setViewportSize({width:1920,height:1080});
  const cancellations=()=>page.evaluate(()=>calls.filter(c=>c.body?.action==='cancel').length);
  const beforeCancel=await cancellations();await page.getByRole('button',{name:'Keep deal',exact:true}).click();assert.equal(await cancellations(),beforeCancel,'opening/keeping a deal makes no cancellation request');
  await page.getByRole('button',{name:'Cancel deal',exact:true}).click();await page.locator('#wch-cancel-agreed').check();await page.evaluate(()=>window.failCancelOnce=true);await cancelSave.click();
  await page.getByText('Cancellation pending. Check My Deal, then retry.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Current Contracts',exact:true}).click();await page.getByRole('button',{name:'Refresh contracts',exact:true}).click();await page.getByText('Current contracts refreshed from the sheet.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>outputs[0].status),'cancelled');assert.equal(await page.locator('.wch-contract').count(),1,'cancelled history is absent from active contracts');assert.equal(await page.evaluate(()=>mainContracts.length),0);
  await page.evaluate(()=>manual.push({id:'own-manual',ourId:123,ourName:'Sample',enemyId:305,enemyName:'Stretch Target',hits:12,onlineWindow:'evening',time:'20:00',warlord:'No',notes:'Manual agreement'}));
  await page.getByRole('button',{name:'Refresh contracts',exact:true}).click();await page.getByText('Current contracts refreshed from the sheet.',{exact:true}).waitFor();await page.getByRole('button',{name:'My Deal',exact:true}).click();
  await page.getByRole('button',{name:'Cancel deal',exact:true}).click();await page.locator('#wch-cancel-agreed').check();await page.evaluate(()=>manual.find(m=>m.id==='own-manual').notes='Changed manually');await cancelSave.click();
  await page.getByText('The contract changed or someone is already booked. Refresh Current Contracts.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>manual.some(m=>m.id==='own-manual')),true,'a stale cancellation cannot remove changed manual terms');
  await page.getByRole('button',{name:'Check saved state',exact:true}).click();await page.getByText('Saved state checked. Review My Deal and Current Contracts before continuing.',{exact:true}).waitFor();await page.getByRole('button',{name:'Keep deal',exact:true}).click();
  await page.getByRole('button',{name:'Cancel deal',exact:true}).click();await page.locator('#wch-cancel-agreed').check();await cancelSave.click();await page.getByText('Deal cancelled. The active sheet pairing was removed.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>manual.length),1);assert.equal(await page.evaluate(()=>manual[0].notes),'Manual entry must survive');assert.equal(await page.evaluate(()=>outputs.every(r=>r.status==='cancelled')),true);
  assert.deepEqual(errors,[]);
  console.log('PASS browser: own stats/gear, booked and impossible filtering, reservation, editable message, clipboard failure, explicit confirmation, manual conflict, current contracts/search, privacy, singleton, four viewports, own script/manual cancellation, stale-snapshot protection, interrupted cancellation recovery, and late-reply cleanup.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
