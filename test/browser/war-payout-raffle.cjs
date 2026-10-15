'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.TORN_PLAYWRIGHT||'C:/Users/asato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../..'),source=fs.readFileSync(path.join(root,'Torn_War_Payout_Calculator.user.js'),'utf8'),hub=fs.readFileSync(path.join(root,'script-hub/dist/Torn_Script_Hub.user.js'),'utf8');
const raffleHarness=fs.readFileSync(path.join(root,'lib/war-payout-raffle.cjs'),'utf8').replace(/^module\.exports[^\n]*$/gm,'')+'\n'+fs.readFileSync(path.join(root,'lib/war-payout-raffle-ui.js'),'utf8');
const now=Math.floor(Date.now()/1000),actor=(id,faction,name)=>({id,name,faction:{id:faction}});
const alpha=actor(1,10,'Alpha'),beta=actor(2,10,'Beta'),gamma=actor(3,10,'=Gamma'),enemy=actor(20,20,'Enemy'),outside=actor(30,30,'Outsider');
const attack=(id,attacker,defender,result='Hospitalized')=>({id,started:now-900+id,ended:now-890+id,attacker,defender,result,is_ranked_war:true});
const fixture={basic:{basic:{id:10}},rankedwars:{rankedwars:[{id:99,start:now-1000,end:now-500,factions:[{id:10,name:'Synthetic faction'},{id:20,name:'Synthetic enemy'}]}]},attacks:{attacks:[attack(1,alpha,enemy),attack(2,alpha,enemy),attack(3,alpha,enemy),attack(4,beta,enemy),attack(5,beta,enemy),attack(6,enemy,alpha),attack(7,enemy,alpha),attack(8,enemy,beta),attack(9,gamma,enemy,'Assist'),attack(10,alpha,outside),attack(11,outside,beta)],_metadata:{links:{next:null,prev:null}}},rankedwarreport:{rankedwarreport:{factions:[]}}};
async function main(){
 const browser=await chromium.launch({executablePath:process.env.TORN_BROWSER||'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body style="background:#252c33"><aside id="sidebar"><a href="/messages.php">Mail</a><a href="/page.php?sid=events">Events</a><a href="/page.php?sid=awards">Awards</a></aside></body></html>'}));
  await page.goto('https://www.torn.com/factions.php?step=your&type=1');
  await page.evaluate(data=>{
   window.values={};window.calls=[];window.copied='';window.quota=false;window.live=false;
   window.GM_info={scriptHandler:'Tampermonkey'};window.GM_getValue=(k,d)=>Object.hasOwn(values,k)?structuredClone(values[k]):d;
   window.GM_setValue=async(k,v)=>{if(k==='twpc-raffle-draws-v1'){if(window.quota)throw Error('Synthetic quota');if(window.holdRaffleSave)await new Promise(resolve=>{window.releaseRaffleSave=resolve;});}values[k]=structuredClone(v);};window.GM_deleteValue=k=>delete values[k];window.GM_registerMenuCommand=()=>{};window.GM_setClipboard=text=>{window.copied=text;};
   window.GM_xmlhttpRequest=o=>{const part=new URL(o.url).pathname.split('/').pop();calls.push(part);const reply=structuredClone(data[part]);if(part==='rankedwars'&&window.live)reply.rankedwars[0].end=0;const timer=setTimeout(()=>o.onload({status:200,responseText:JSON.stringify(reply)}),5);return{abort:()=>clearTimeout(timer)};};
  },fixture);
  await page.evaluate(code=>(0,eval)(code),hub);await page.evaluate(code=>(0,eval)(code),source);
  await page.click('#tsh-launcher');await page.click('[data-script="war-payout-calculator"] .tsh-primary');await page.click('#twpc-settings-toggle');await page.fill('#twpc-key','TESTTESTTESTTEST');await page.click('#twpc-use-key');await page.click('#twpc-tab-calculator');
  await page.click('#twpc-list-wars');await page.selectOption('#twpc-war','99');await page.waitForFunction(()=>!document.querySelector('#twpc-dialog').getAttribute('aria-busy')||document.querySelector('#twpc-dialog').getAttribute('aria-busy')==='false');await page.waitForFunction(()=>document.getElementById('twpc-coverage').textContent.includes('5 war hits'));
  await page.fill('#twpc-profit','1000');await page.fill('#twpc-rate-hits','10');await page.fill('#twpc-rate-losses','1');const payout=await page.textContent('#twpc-total');
  await page.click('#twpc-tab-raffle');await page.waitForSelector('#twpc-raffle-odds tbody tr',{state:'attached'});assert.equal(await page.locator('#twpc-raffle-odds tbody tr').count(),2);assert.match(await page.textContent('#twpc-raffle-summary'),/3 tickets/);assert.equal(await page.locator('#twpc-raffle-draw').isEnabled(),true);
  assert.equal(await page.locator('#twpc-raffle-odds tbody tr').filter({hasText:'Alpha'}).locator('td').nth(1).textContent(),'2');
  await page.evaluate(()=>{window.realRandom=crypto.getRandomValues.bind(crypto);Object.defineProperty(crypto,'getRandomValues',{configurable:true,value:array=>{array.fill(0);return array;}});});
  await page.click('#twpc-raffle-draw');await page.waitForFunction(()=>document.getElementById('twpc-raffle-results').textContent.includes('Alpha'));
  const saved=await page.evaluate(()=>JSON.parse(values['twpc-raffle-draws-v1']));assert.equal(saved.records.length,1);assert.equal(saved.records[0].total,3);assert.equal(saved.records[0].winners[0].id,1);assert.equal(await page.textContent('#twpc-total'),payout);assert.equal(await page.evaluate(()=>Object.hasOwn(values,'twpc-credit-ledger-v1')),false,'raffle never creates or edits payout receipts');
  const stable=await page.textContent('#twpc-raffle-results');await page.click('#twpc-tab-calculator');await page.click('#twpc-tab-raffle');assert.equal(await page.textContent('#twpc-raffle-results'),stable,'switching tabs never rerolls');
  await page.click('#twpc-raffle-copy');assert.match(await page.evaluate(()=>window.copied),/Alpha/);assert.doesNotMatch(await page.evaluate(()=>window.copied),/TESTTEST/);
  await page.selectOption('#twpc-raffle-preset','equal');assert.equal(await page.locator('#twpc-raffle-odds tbody tr').count(),3);await page.fill('#twpc-raffle-winners','3');
  let confirmations=0;page.on('dialog',async d=>{confirmations++;await d.accept();});await page.click('#twpc-raffle-new');await page.click('#twpc-raffle-draw');await page.waitForFunction(()=>JSON.parse(values['twpc-raffle-draws-v1']).records.length===2);assert.equal(confirmations,1);assert.equal(await page.locator('#twpc-raffle-results li').count(),3);assert.equal(new Set(await page.locator('#twpc-raffle-results li').allTextContents()).size,3);
  await page.click('#twpc-raffle-new');await page.evaluate(()=>{window.quota=true;});await page.click('#twpc-raffle-draw');await page.waitForFunction(()=>document.getElementById('twpc-raffle-note').textContent.includes('saved'));assert.equal(await page.evaluate(()=>JSON.parse(values['twpc-raffle-draws-v1']).records.length),2,'quota cannot replace previous draws');assert.equal(await page.locator('#twpc-raffle-draw').isEnabled(),true,'retry requires another click');await page.evaluate(()=>{window.quota=false;});
  await page.evaluate(()=>{Object.defineProperty(crypto,'getRandomValues',{configurable:true,value:()=>{throw Error('Synthetic RNG failure');}});});await page.click('#twpc-raffle-draw');await page.waitForFunction(()=>/random/i.test(document.getElementById('twpc-raffle-note').textContent));assert.equal(await page.evaluate(()=>JSON.parse(values['twpc-raffle-draws-v1']).records.length),2);await page.evaluate(()=>{Object.defineProperty(crypto,'getRandomValues',{configurable:true,value:window.realRandom});});
  const callsBeforeThemes=await page.evaluate(()=>calls.length),historyBeforeThemes=await page.evaluate(()=>values['twpc-raffle-draws-v1']),resultsBeforeThemes=await page.textContent('#twpc-raffle-results');await page.evaluate(()=>{window.originalRaffleInput=document.getElementById('twpc-raffle-weight-losses');window.originalRaffleResults=document.getElementById('twpc-raffle-results');});
  for(const layout of ['frostbite','workbench','torn','stock']){
   await page.evaluate(layout=>{const detail=JSON.stringify({layout,palette:layout,mode:'dark'});localStorage.setItem('torn-script-hub:ui-theme:v1',detail);document.dispatchEvent(new CustomEvent('torn-script-hub:ui-theme:v1:changed',{detail}));},layout);await page.waitForFunction(layout=>document.getElementById('twpc-dialog').dataset.tsuiLayout===layout,layout);
   for(const size of [{width:1920,height:1080},{width:390,height:844},{width:430,height:932},{width:844,height:390}]){
    await page.setViewportSize(size);await page.waitForFunction(()=>{const r=document.getElementById('twpc-dialog').getBoundingClientRect();return r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.evaluate(()=>originalRaffleInput===document.getElementById('twpc-raffle-weight-losses')&&originalRaffleResults===document.getElementById('twpc-raffle-results')),true);
    await page.screenshot({path:path.join(__dirname,'artifacts/war-payout-raffle-'+layout+'-'+size.width+'.png')});
   }
  }
  assert.equal(await page.evaluate(()=>calls.length),callsBeforeThemes);assert.equal(await page.evaluate(()=>values['twpc-raffle-draws-v1']),historyBeforeThemes);assert.equal(await page.textContent('#twpc-raffle-results'),resultsBeforeThemes);assert.equal(await page.textContent('#twpc-total'),payout);
  await page.setViewportSize({width:1920,height:1080});await page.click('#twpc-tab-calculator');await page.evaluate(()=>{window.live=true;});await page.click('#twpc-list-wars');await page.selectOption('#twpc-war','99');await page.waitForFunction(()=>document.getElementById('twpc-coverage').textContent.includes('Live war'));
  await page.click('#twpc-tab-raffle');assert.equal(await page.locator('#twpc-raffle-draw').isDisabled(),true,'live snapshots only preview odds');assert.match(await page.textContent('#twpc-raffle-note'),/live|completed/i);
  const harness=await browser.newPage();await harness.route('**/*',r=>r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));await harness.goto('https://www.torn.com/');
  await harness.evaluate(({code,record})=>{
   window.legacy=JSON.stringify({version:1,records:[record]});window.harnessActive=true;window.nativeWrites=0;window.nativeReads=0;
   window.harnessSnapshot={scope:record.scope,live:false,rows:record.entries.map(e=>({id:e.id,name:e.name,...e.counts}))};
   (0,eval)(code+'\nwindow.mountHarness=env=>{window.harnessUI=createWarPayoutRaffleUI({doc:document,env,readSnapshot:()=>window.harnessSnapshot,isActive:()=>window.harnessActive});document.body.append(harnessUI.panel);harnessUI.show();};');
   window.mountHarness({crypto,GM_getValue:()=>window.legacy,GM_setValue:()=>{},PDA_storage:{get:async()=>{window.nativeReads++;if(window.nativeReads===1)await new Promise(resolve=>{window.releaseNativeRead=resolve;});return null;},set:async()=>{window.nativeWrites++;}}});
  },{code:raffleHarness,record:saved.records[0]});
  await harness.waitForFunction(()=>typeof window.releaseNativeRead==='function');await harness.evaluate(()=>{harnessActive=false;harnessUI.hide();releaseNativeRead();});await harness.waitForTimeout(80);assert.equal(await harness.evaluate(()=>nativeWrites),0,'hiding during initial native migration prevents storage write');
  await harness.evaluate(()=>{harnessActive=true;harnessUI.show();});await harness.waitForFunction(()=>nativeWrites===1);await harness.waitForFunction(()=>document.getElementById('twpc-raffle-context').textContent.includes('War #99'));
  await harness.evaluate(()=>{harnessUI.destroy();window.failedReads=0;mountHarness({crypto,GM_getValue:()=>{if(window.failedReads++===0)throw Error('Synthetic read failure');return window.legacy;},GM_setValue:()=>{}});});
  await harness.waitForFunction(()=>document.getElementById('twpc-raffle-note').textContent.includes('could not be read'));await harness.evaluate(()=>{harnessUI.hide();harnessUI.show();});await harness.waitForFunction(()=>document.getElementById('twpc-raffle-context').textContent.includes('War #99'));await harness.close();
  assert.deepEqual(errors,[]);console.log('PASS raffle / enemy-only weighted odds / secure unique draws / saved records / explicit redraw / storage and RNG failure / live guard / four viewports / no payments');
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
