'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.TORN_PLAYWRIGHT||'C:/Users/asato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'Torn_War_Payout_Calculator.user.js'),'utf8');
const hub=fs.readFileSync(path.join(root,'script-hub/dist/Torn_Script_Hub.user.js'),'utf8');
const now=Math.floor(Date.now()/1000),actor=(id,faction,name)=>({id,name,faction:{id:faction}});
const fixture={basic:{basic:{id:10}},rankedwars:{rankedwars:[{id:99,start:now-1000,end:now-500,factions:[{id:10,name:'Synthetic faction'},{id:20,name:'Synthetic enemy'}]}]},attacks:{attacks:[1,2].map(id=>({id,started:now-900,ended:now-890,attacker:actor(id,10,id===1?'Alpha':'Beta'),defender:actor(20,20,'Enemy'),result:'Hospitalized',is_ranked_war:true})),_metadata:{links:{next:null,prev:null}}},rankedwarreport:{rankedwarreport:{factions:[]}}};
async function main(){
 const browser=await chromium.launch({executablePath:process.env.TORN_BROWSER||'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',r=>r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body style="background:#252c33;color:#ccd6df;font-family:Arial"><aside id="sidebar"><a href="/messages.php">Mail</a><a href="/page.php?sid=events">Events</a><a href="/page.php?sid=awards">Awards</a></aside><input id="outside" aria-label="Torn draft"></body></html>'}));
  await page.goto('https://www.torn.com/factions.php?step=your&type=1');
  await page.evaluate(data=>{
   window.values={};window.apiCalls=[];window.GM_info={scriptHandler:'Tampermonkey'};
   window.GM_getValue=(key,fallback)=>Object.hasOwn(values,key)?structuredClone(values[key]):fallback;
   window.GM_setValue=(key,value)=>{values[key]=structuredClone(value);};window.GM_deleteValue=key=>{delete values[key];};
   window.GM_registerMenuCommand=()=>{};
   window.GM_xmlhttpRequest=options=>{const part=new URL(options.url).pathname.split('/').pop();apiCalls.push(part);const timer=setTimeout(()=>options.onload({status:200,responseText:JSON.stringify(data[part])}),window.slowScan?1000:5);return{abort:()=>clearTimeout(timer)};};
  },fixture);
  await page.evaluate(code=>(0,eval)(code),hub);await page.evaluate(code=>(0,eval)(code),source);
  const open=async()=>{await page.click('#tsh-launcher');await page.click('[data-script="war-payout-calculator"] .tsh-primary');};
  await open();
  assert.equal(await page.locator('#twpc-dialog').getAttribute('data-tsui-kit'),'1','payout adopts the actual shared shell');
  for(const label of ['Lock or unlock position','Reset window position','Minimize window','Maximize or restore window','Close window'])assert.equal(await page.locator('#twpc-dialog').getByLabel(label,{exact:true}).count(),1);
  await page.click('#twpc-settings-toggle');await page.fill('#twpc-key','TESTTESTTESTTEST');await page.click('#twpc-use-key');await page.click('#twpc-tab-calculator');
  await page.click('#twpc-list-wars');await page.selectOption('#twpc-war','99');
  await page.waitForFunction(()=>document.getElementById('twpc-coverage').textContent.includes('2 war hits'));
  await page.fill('#twpc-profit','1000');await page.fill('#twpc-rate-hits','100');
  assert.equal(await page.textContent('#twpc-total'),'$200');
  await page.evaluate(()=>{window.originalProfit=document.getElementById('twpc-profit');});
  await page.click('#twpc-tab-credits');await page.check('#twpc-credit-reviewed');await page.click('#twpc-credit-lock');
  await page.waitForFunction(()=>document.querySelectorAll('#twpc-credit-members tbody tr').length===2);
  assert.equal(await page.isDisabled('#twpc-credit-next'),true,'no native form means no credit submission');
  await page.click('#twpc-tab-calculator');await page.fill('#twpc-rate-hits','200');await page.click('#twpc-tab-credits');
  assert.match(await page.textContent('#twpc-credit-summary'),/Pending \$200/,'locked amounts survive calculation edits');
  assert.equal(await page.isChecked('#twpc-credit-reviewed'),false,'changed inputs require fresh review');
  await page.click('#twpc-tab-calculator');
  await page.fill('#twpc-rate-hits','10000');
  assert.equal(await page.textContent('#twpc-balance-label'),'Funding shortfall');
  assert.equal(await page.locator('#twpc-balance').evaluate(e=>getComputedStyle(e).color),await page.locator('#twpc-dialog').evaluate(e=>{const probe=document.createElement('span');probe.style.color='var(--tsui-error)';e.append(probe);const color=getComputedStyle(probe).color;probe.remove();return color;}),'funding shortfall uses the error role');
  await page.fill('#twpc-rate-hits','200');
  const artifacts=path.join(__dirname,'artifacts/war-payout-shared-ui');fs.mkdirSync(artifacts,{recursive:true});
  const callsBeforeThemes=await page.evaluate(()=>apiCalls.length);
  for(const layout of ['frostbite','workbench','torn']){
   await page.evaluate(layout=>{const detail=JSON.stringify({layout,palette:layout,mode:'dark'});localStorage.setItem('torn-script-hub:ui-theme:v1',detail);document.dispatchEvent(new CustomEvent('torn-script-hub:ui-theme:v1:changed',{detail}));},layout);
   await page.waitForFunction(layout=>document.getElementById('twpc-dialog').dataset.tsuiLayout===layout,layout);
   for(const [width,height]of [[1920,1080],[390,844],[430,932],[844,390]]){
    await page.setViewportSize({width,height});
    await page.waitForFunction(()=>{const r=document.getElementById('twpc-dialog').getBoundingClientRect();return r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.equal(await page.evaluate(()=>originalProfit===document.getElementById('twpc-profit')),true);
    assert.equal(await page.inputValue('#twpc-profit'),'1000');
    assert.equal(await page.textContent('#twpc-total'),'$400');
    await page.locator('#twpc-dialog').evaluate(root=>{root.querySelector('.tsui-content').scrollTop=0;root.querySelector('.tsui-body').scrollTop=0;});
    await page.screenshot({path:path.join(artifacts,`${layout}-${width}.png`)});
   }
  }
  assert.equal(await page.evaluate(()=>apiCalls.length),callsBeforeThemes,'theme and viewport changes do not fetch data');
  await page.setViewportSize({width:1920,height:1080});
  const title=page.locator('#twpc-dialog .tsui-title');await title.focus();
  const before=await page.locator('#twpc-dialog').boundingBox();await page.keyboard.press('ArrowRight');await page.keyboard.press('Shift+ArrowRight');
  const moved=await page.locator('#twpc-dialog').boundingBox();assert.equal(moved.x,before.x+10);assert.equal(moved.width,before.width+10);
  await page.locator('#twpc-dialog').getByLabel('Lock or unlock position').click();await title.focus();await page.keyboard.press('ArrowRight');assert.equal((await page.locator('#twpc-dialog').boundingBox()).x,moved.x);
  await page.locator('#twpc-dialog').getByLabel('Maximize or restore window').click();assert.ok((await page.locator('#twpc-dialog').boundingBox()).width>1800);await page.locator('#twpc-dialog').getByLabel('Maximize or restore window').click();
  await page.locator('#twpc-dialog').getByLabel('Minimize window').click();assert.equal(await page.isVisible('#twpc-dialog'),false);await page.getByLabel('Restore War payout calculator',{exact:true}).click();
  await page.click('#twpc-collapse');assert.equal(await page.locator('#twpc-dialog').getAttribute('data-tsui-collapsed'),'true');await page.click('#twpc-collapse');
  await page.click('#twpc-close');assert.equal(await page.isVisible('#twpc-dialog'),false);await open();assert.equal(await page.inputValue('#twpc-profit'),'1000');
  // Observed-shape synthetic native editor; no live Torn request or payment.
  await page.evaluate(()=>{
   const host=document.createElement('main');host.id='native-fixture';document.body.append(host);
   host.innerHTML='<section class="money___test"><form><input id="add-money-to-balance" type="radio"></form><ul>'+[1,2].map(id=>'<li class="listItem___test"><div class="userInfoWrap___test"><a href="/profiles.php?XID='+id+'">Member '+id+'</a><a href="/factions.php?step=profile&ID=10">Faction</a></div><div class="editBalanceWrap___test">$'+(id*10)+'.25<span class="hidden"><div class="input-money-group"><input class="input-money" data-testid="legacy-money-input" value="'+(id*10)+'.25"><input type="hidden" class="input-money" data-testid="legacy-money-input" value="'+(id*10)+'.25"></div></span><button type="submit" aria-label="Edit balance">Edit</button></div></li>').join('')+'</ul></section>';
   for(const editor of host.querySelectorAll('[class*=editBalanceWrap]')){
    const button=editor.querySelector('button'),input=editor.querySelector('input:not([type=hidden])'),hidden=editor.querySelector('input[type=hidden]');let model=input.value;
    const depositor={userID:Number(new URL(editor.closest('li').querySelector('a').href).searchParams.get('XID')),balance:Number(model),faction:{id:10},isMember:true};editor.__reactFiber$fixture={child:{memoizedProps:{section:'money',depositor}}};
    input.addEventListener('input',()=>{model=input.value;hidden.value=model;});button.addEventListener('click',()=>{if(button.getAttribute('aria-label')==='Edit balance'){editor.firstChild.textContent='';button.setAttribute('aria-label','Save balance');return;}document.body.dataset.nativeSaves=String(Number(document.body.dataset.nativeSaves||0)+1);button.disabled=true;setTimeout(()=>{depositor.balance=Number(model);editor.firstChild.textContent='$'+model;button.setAttribute('aria-label','Edit balance');button.disabled=false;},20);});
   }
   location.hash='/tab=controls';
  });
  await page.waitForFunction(()=>document.getElementById('twpc-dialog').hidden);await open();await page.click('#twpc-tab-credits');
  await page.waitForFunction(()=>!document.getElementById('twpc-credit-next').disabled);
  await page.click('#twpc-settings-toggle');
  assert.equal(await page.isDisabled('#twpc-credit-next'),true,'leaving Pay members releases credit ownership immediately');
  await page.click('#twpc-tab-credits');await page.waitForFunction(()=>!document.getElementById('twpc-credit-next').disabled);
  await page.click('#twpc-credit-next');await page.waitForFunction(()=>document.getElementById('twpc-credit-summary').textContent.includes('1/2'));
  assert.equal(await page.locator('body').getAttribute('data-native-saves'),'1','one trusted click saves one synthetic member');
  assert.equal(await page.locator('[class*=editBalanceWrap]').first().evaluate(e=>e.firstChild.textContent),'$110.25','uses locked amount and preserves existing balance cents');
  await page.click('#twpc-credit-next');await page.waitForFunction(()=>document.getElementById('twpc-credit-summary').textContent.includes('2/2'));
  assert.equal(await page.locator('body').getAttribute('data-native-saves'),'2');assert.equal(await page.isDisabled('#twpc-credit-next'),true);
  await page.click('#twpc-tab-calculator');
  await page.evaluate(()=>{window.slowScan=true;});await page.click('#twpc-load');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('tornpda:tabState',{detail:{isActiveTab:false,isWebViewVisible:false}})));
  assert.equal(await page.locator('#twpc-dialog').getAttribute('aria-busy'),'false');
  const pausedCalls=await page.evaluate(()=>apiCalls.length);
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('tornpda:tabState',{detail:{isActiveTab:true,isWebViewVisible:true}})));
  assert.equal(await page.evaluate(()=>apiCalls.length),pausedCalls,'resuming never retries a scan automatically');
  await page.evaluate(()=>{location.hash='another-route';});await page.waitForFunction(()=>document.getElementById('twpc-dialog').hidden);
  assert.equal(await page.locator('#twpc-dialog').count(),1);
  assert.ok(await page.evaluate(()=>values['twpc-ui-layout-v1']?.version===1),'window preferences stored independently');
  const saved=await page.evaluate(()=>structuredClone(values));
  saved['twpc-ui-layout-v1']={version:1,desktop:{x:200,y:180,width:900,height:700,locked:true,selected:'settings'}};
  await page.goto('https://www.torn.com/factions.php?step=your&type=1');
  await page.evaluate(saved=>{window.values=saved;window.apiCalls=[];window.GM_info={scriptHandler:'Tampermonkey'};window.GM_getValue=(key,fallback)=>Object.hasOwn(values,key)?structuredClone(values[key]):fallback;window.GM_setValue=(key,value)=>{values[key]=structuredClone(value);};window.GM_deleteValue=key=>{delete values[key];};window.GM_registerMenuCommand=()=>{};window.GM_xmlhttpRequest=()=>{apiCalls.push('unexpected');};},saved);
  await page.evaluate(code=>(0,eval)(code),hub);await page.evaluate(code=>(0,eval)(code),source);await open();
  await page.waitForFunction(()=>document.getElementById('twpc-dialog').getBoundingClientRect().width===900);
  assert.deepEqual(await page.locator('#twpc-dialog').evaluate(e=>{const r=e.getBoundingClientRect();return[r.x,r.y,e.dataset.tsuiLocked];}),[200,180,'true'],'first open restores saved geometry and lock');
  await page.click('#twpc-tab-calculator');
  await page.waitForSelector('#twpc-war option[value="99"]',{state:'attached',timeout:2000});await page.selectOption('#twpc-war','99');
  await page.waitForFunction(()=>document.getElementById('twpc-coverage').textContent.includes('2 war hits'));
  assert.match(await page.textContent('#twpc-cache-state'),/Cached/,'saved report reopens without a key or scan');assert.deepEqual(await page.evaluate(()=>apiCalls),[]);
  await page.click('#twpc-close');await page.click('#tsh-launcher');await page.click('[data-hub-view="settings"]');await page.click('[data-settings-script="war-payout-calculator"]');await page.click('.tsh-script-appearance');
  await page.uncheck('.tsh-theme-follow input');await page.click('.tsh-theme-layout[data-layout="workbench"]');await page.selectOption('.tsh-theme-mode','light');await page.click('.tsh-theme-save');
  await page.waitForFunction(()=>document.querySelector('.tsh-theme-message').textContent==='Theme saved.');
  assert.equal(await page.locator('#twpc-dialog').getAttribute('data-tsui-layout'),'workbench');
  assert.equal(await page.locator('[data-tsui-launcher-host]').getAttribute('data-tsui-layout'),'workbench','private override reaches launcher through the shared client');
  assert.equal(await page.locator('[data-tsui-launcher-host]').getAttribute('data-tsui-mode'),'light');
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false})));
  assert.equal(await page.locator('#twpc-dialog').count(),0);assert.equal(await page.locator('[data-tsui-launcher-host]').count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS payout shared shell, 12 layout/viewport combinations, stable drafts/calculations, credit review, window controls and inactive-route cleanup');
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
