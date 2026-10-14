'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.TORN_PLAYWRIGHT||'C:/Users/asato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'Torn_War_Payout_Calculator.user.js'),'utf8');
const hub=fs.readFileSync(path.join(root,'script-hub/dist/Torn_Script_Hub.user.js'),'utf8');
assert.ok(source.includes('WarPayoutCredits'),'standalone distribution must bundle the credit workflow');
const now=Math.floor(Date.now()/1000);
const person=(id,faction,name)=>({id,name,faction:{id:faction}});
const fixture={basic:{basic:{id:10}},rankedwars:{rankedwars:[{id:99,start:now-1000,end:now-500,factions:[{id:10,name:'Test faction'},{id:20,name:'Opponent'}]}]},attacks:{attacks:[1,2].map(id=>({id,started:now-900,ended:now-890,attacker:person(id,10,id===1?'Alpha':'Beta'),defender:person(20,20,'Enemy'),result:'Hospitalized',is_ranked_war:true})),_metadata:{links:{next:null,prev:null}}},rankedwarreport:{rankedwarreport:{factions:[]}}};
const html='<html><head></head><body><aside id="sidebar"><div class="status-icons"><a href="/messages.php">Mail</a><a href="/page.php?sid=events">Events</a><a href="/page.php?sid=awards">Awards</a></div></aside><main id="native-fixture"></main></body></html>';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.TORN_BROWSER||'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true,args:['--no-first-run','--no-default-browser-check']});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.fulfill({status:200,contentType:'text/html',body:html}));
  await page.goto('https://www.torn.com/factions.php?step=your&type=1');
  await page.evaluate(data=>{
   const values=new Map();window.GM_info={scriptHandler:'Tampermonkey'};window.GM_getValue=(k,d)=>values.has(k)?values.get(k):d;window.GM_setValue=(k,v)=>values.set(k,structuredClone(v));window.GM_deleteValue=k=>values.delete(k);window.GM_registerMenuCommand=()=>{};
   window.GM_xmlhttpRequest=o=>{const part=new URL(o.url).pathname.split('/').pop();const timer=setTimeout(()=>o.onload({status:200,responseText:JSON.stringify(data[part])}),10);return{abort:()=>clearTimeout(timer)};};
  },fixture);
  await page.evaluate(code=>(0,eval)(code),hub);await page.evaluate(code=>(0,eval)(code),source);
  await page.waitForSelector('#tsh-launcher');await page.click('#tsh-launcher');await page.click('[data-script="war-payout-calculator"] .tsh-primary');
  await page.click('#twpc-settings-toggle');await page.type('#twpc-key','TESTTESTTESTTEST');await page.click('#twpc-use-key');await page.click('#twpc-tab-calculator');
  await page.click('#twpc-list-wars');await page.waitForSelector('#twpc-war option[value="99"]',{state:'attached'});await page.selectOption('#twpc-war','99');await page.click('#twpc-load');
  await page.waitForFunction(()=>document.getElementById('twpc-coverage').textContent.includes('2 war hits'));
  const set=async(id,value)=>page.$eval('#'+id,(e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));},value);
  await set('twpc-profit','1000');await set('twpc-rate-hits','100');
  await page.click('#twpc-tab-credits');await page.waitForSelector('#twpc-credit-panel:not([hidden])');
  await page.click('#twpc-credit-reviewed');await page.click('#twpc-credit-lock');
  await page.waitForFunction(()=>document.querySelectorAll('#twpc-credit-members tbody tr').length===2);
  assert.equal(await page.$eval('#twpc-credit-next',e=>e.disabled),true,'no native credit form must leave credit actions disabled');
  assert.ok(await page.$eval('#twpc-credit-note',e=>e.textContent.length>0));
  assert.equal(await page.$eval('#twpc-credit-summary',e=>e.textContent.includes('$200')),true);
  await page.click('#twpc-tab-calculator');await set('twpc-rate-hits','200');await page.click('#twpc-tab-credits');
  assert.equal(await page.$eval('#twpc-credit-summary',e=>e.textContent.includes('$200')),true,'locked amounts remain independent of live calculator changes');
  await page.click('#twpc-credit-reviewed');assert.equal(await page.$eval('#twpc-credit-reviewed',e=>e.checked),true);
  await page.click('#twpc-tab-calculator');await set('twpc-rate-hits','201');await page.click('#twpc-tab-credits');
  assert.equal(await page.$eval('#twpc-credit-reviewed',e=>e.checked),false,'changing draft amounts requires fresh review before locking');
  for(const[width,height]of[[1920,1080],[390,844],[430,932],[844,390]]){
   await page.setViewportSize({width,height});
   await page.waitForFunction(()=>{const r=document.getElementById('twpc-dialog').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;});
   const bound=await page.$eval('#twpc-dialog',e=>{const r=e.getBoundingClientRect();return{l:r.left,r:r.right,t:r.top,b:r.bottom,w:innerWidth,h:innerHeight};});assert.ok(bound.l>=0&&bound.r<=bound.w&&bound.t>=0&&bound.b<=bound.h);await page.screenshot({path:path.join(__dirname,'war-payout-credits-'+width+'.png')});
  }
  // Full generated userscript with an observed-shape, synthetic native editor.
  await page.setViewportSize({width:1920,height:1080});
  await page.evaluate(()=>{
   document.getElementById('native-fixture').innerHTML='<section class="money___test"><form><input id="add-money-to-balance" type="radio"></form><ul>'+[1,2].map(id=>'<li class="listItem___test"><div class="userInfoWrap___test"><a href="/profiles.php?XID='+id+'">Member '+id+'</a><a href="/factions.php?step=profile&ID=10">Faction</a></div><div class="editBalanceWrap___test">$'+(id*10)+'.25<span class="hidden"><div class="input-money-group"><input class="input-money" data-testid="legacy-money-input" value="'+(id*10)+'.25"><input type="hidden" class="input-money" data-testid="legacy-money-input" value="'+(id*10)+'.25"></div></span><button type="submit" aria-label="Edit balance">Edit</button></div></li>').join('')+'</ul></section>';
   for(const editor of document.querySelectorAll('[class*=editBalanceWrap]')){const button=editor.querySelector('button'),input=editor.querySelector('input:not([type=hidden])'),hidden=editor.querySelector('input[type=hidden]');let model=input.value;
    const depositor={userID:Number(new URL(editor.closest('li').querySelector('a').href).searchParams.get('XID')),balance:Number(model),faction:{id:10},isMember:true};editor.__reactFiber$fixture={child:{memoizedProps:{section:'money',depositor}}};
    input.addEventListener('input',()=>{model=input.value;hidden.value=model;});button.addEventListener('click',()=>{if(button.getAttribute('aria-label')==='Edit balance'){editor.firstChild.textContent='';button.setAttribute('aria-label','Save balance');return;}document.body.dataset.nativeSaves=String(Number(document.body.dataset.nativeSaves||0)+1);button.disabled=true;setTimeout(()=>{depositor.balance=Number(model);editor.firstChild.textContent='$'+model;button.setAttribute('aria-label','Edit balance');button.disabled=false;},20);});}
   location.hash='/tab=controls';
  });
  await page.waitForFunction(()=>document.getElementById('twpc-dialog').hidden);await page.click('#tsh-launcher');await page.click('[data-script="war-payout-calculator"] .tsh-primary');await page.click('#twpc-tab-credits');
  await page.waitForFunction(()=>!document.getElementById('twpc-credit-next').disabled);await page.click('#twpc-credit-next');await page.waitForFunction(()=>document.getElementById('twpc-credit-summary').textContent.includes('1/2'));
  assert.equal(await page.$eval('body',e=>e.dataset.nativeSaves),'1','full bundle saves one member for one click');
  assert.equal(await page.$eval('[class*=editBalanceWrap]',e=>e.firstChild.textContent),'$110.25','uses locked $100 and preserves native balance');
  await page.click('#twpc-credit-next');await page.waitForFunction(()=>document.getElementById('twpc-credit-summary').textContent.includes('2/2'));assert.equal(await page.$eval('body',e=>e.dataset.nativeSaves),'2');
  assert.equal(await page.$eval('#twpc-credit-next',e=>e.disabled),true,'finished queue never sends more credits');
  assert.deepEqual(errors,[]);await page.close();
  // Exercise trusted-click UI wiring with an explicitly synthetic adapter.
  // This is not evidence for Torn's native form selectors or submit flow.
  const harness=await browser.newPage();await harness.route('**/*',r=>r.fulfill({status:200,contentType:'text/html',body:html}));await harness.goto('https://www.torn.com/factions.php?step=your&type=1');
  const credits=fs.readFileSync(path.join(root,'lib/war-payout-credits.cjs'),'utf8').replace(/^module\.exports[^\n]*$/gm,'');
  const ui=fs.readFileSync(path.join(root,'lib/war-payout-credit-ui.js'),'utf8');
  await harness.evaluate(code=>(0,eval)(code),`(function(){${credits}\n${ui}\n
   const records=new Map(),dialog=document.createElement('dialog');dialog.id='twpc-dialog';dialog.style.cssText='width:90vw;height:85vh;overflow:auto';document.body.append(dialog);dialog.showModal();
   const draft={scope:{warId:99,factionId:10,opponentId:20,start:${now-1000},end:${now-500}},live:false,mode:'actual',coverage:'unverified',result:{profit:1000,cut:0,pool:1000,total:300,leftover:700,rates:{hits:100},rows:[1,2,3].map(id=>({id,name:'Member '+id,payout:100,hits:1,losses:0}))}};
   document.body.dataset.ineligible='1';
   const creditUI=createWarPayoutCreditUI({dialog,env:{GM_getValue:(k,d)=>records.has(k)?records.get(k):d,GM_setValue:(k,v)=>records.set(k,v)},awake:()=>true,readDraft:()=>draft,nativeAdapter:{inspect:(scope,entry)=>({ready:entry?.id!==Number(document.body.dataset.ineligible||0)}),async submit(operation){document.body.dataset.submits=String(Number(document.body.dataset.submits||0)+1);document.body.dataset.lastMember=String(operation.memberId);await new Promise(resolve=>setTimeout(resolve,25));return{status:document.body.dataset.outcome||'confirmed'};}}});creditUI.show();
  })();`);
  await harness.click('#twpc-credit-reviewed');await harness.waitForFunction(()=>!document.getElementById('twpc-credit-lock').disabled);await harness.click('#twpc-credit-lock');
  await harness.waitForFunction(()=>!document.getElementById('twpc-credit-next').disabled);
  assert.ok(await harness.$eval('#twpc-credit-next',e=>e.textContent.includes('Member 2')),'Next skips an ineligible first pending member');
  await harness.$eval('body',e=>{delete e.dataset.ineligible;});await harness.click('#twpc-credit-recovery summary');await harness.selectOption('#twpc-credit-saved','10:99');
  await harness.click('#twpc-credit-next');
  await harness.waitForFunction(()=>document.getElementById('twpc-credit-summary').textContent.includes('1/3'));
  assert.equal(await harness.$eval('body',e=>e.dataset.submits),'1','one click performs only one synthetic submit');
  assert.equal(await harness.$eval('body',e=>e.dataset.lastMember),'1');
  // Send only the second trusted mouse click (detail=2), as a continuation of
  // the preceding action. locator.click({clickCount:2}) sends a fresh pair.
  const nextBounds=await harness.locator('#twpc-credit-next').boundingBox();
  await harness.mouse.move(nextBounds.x+nextBounds.width/2,nextBounds.y+nextBounds.height/2);
  await harness.mouse.down({clickCount:2});await harness.mouse.up({clickCount:2});
  assert.equal(await harness.$eval('body',e=>e.dataset.submits),'1','double-click continuation is ignored');
  await harness.click('#twpc-credit-next');await harness.waitForFunction(()=>document.getElementById('twpc-credit-summary').textContent.includes('2/3'));
  assert.equal(await harness.$eval('body',e=>e.dataset.submits),'2');assert.equal(await harness.$eval('body',e=>e.dataset.lastMember),'2');
  await harness.$eval('body',e=>{e.dataset.outcome='unknown';});await harness.click('#twpc-credit-next');
  await harness.waitForFunction(()=>document.getElementById('twpc-credit-members').textContent.includes('Needs review'));
  assert.equal(await harness.$eval('#twpc-credit-next',e=>e.disabled),true);assert.equal(await harness.$eval('body',e=>e.dataset.submits),'3');
  assert.ok(await harness.$eval('#twpc-credit-members',e=>e.textContent.includes('Needs review')));
  await harness.close();console.log('PASS member credit tab / locked snapshot / missing-native-form guard / four viewports / trusted click sequence / unknown-result stop');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
