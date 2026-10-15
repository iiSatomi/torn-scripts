'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.TORN_PLAYWRIGHT||'C:/Users/asato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../../..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.TORN_BROWSER||'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true});
 try{
  for(const [width,height,pda]of [[1920,1080,false],[390,844,true],[430,932,true],[844,390,true]]){
   const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><aside id="sidebar"><a href="/messages.php">Mail</a></aside></body></html>'}));
   await page.goto('https://www.torn.com/index.php');
   const fixture=({pda,initialRecords=[]})=>{
    window.records=new Map(initialRecords);window.GM_info={scriptHandler:'Tampermonkey'};
    window.GM_getValue=(k,d)=>records.has(k)?structuredClone(records.get(k)):d;window.GM_setValue=(k,v)=>records.set(k,structuredClone(v));window.GM_deleteValue=k=>records.delete(k);window.GM_registerMenuCommand=(_label,callback)=>{window.menuOpen=callback;};
    if(pda){window.PDA_storage={get:async(k,d)=>GM_getValue(k,d),set:async(k,v)=>GM_setValue(k,v),delete:async k=>GM_deleteValue(k)};window.PDA_getTabState=async()=>({isActiveTab:true,isWebViewVisible:true});}
    window.synthetic=Array.from({length:3},()=>crypto.randomUUID().replaceAll('-','').slice(0,16));window.calls=[];window.messages=[];window.failCode=0;
    if(!records.has('twpc-private-v1:personal-key'))records.set('twpc-private-v1:personal-key',synthetic[2]);
    for(const name of ['credential-info','credential-request','credential-reply'])document.addEventListener('torn-script-hub:v1:'+name,e=>messages.push(e.detail));
    window.GM_xmlhttpRequest=options=>{calls.push({key:options.headers.Authorization?.slice(7)});const url=new URL(options.url);const data=failCode?{error:{code:failCode}}:url.pathname.endsWith('/basic')?{basic:{id:10,name:'Test faction'}}:{rankedwars:[]};const timer=setTimeout(()=>options.onload({status:200,responseText:JSON.stringify(data)}),5);return {abort:()=>clearTimeout(timer)};};
   };await page.evaluate(fixture,{pda});
   await page.addScriptTag({content:read('script-hub/dist/Torn_Script_Hub.user.js')});
   await page.addScriptTag({content:read('Torn_War_Payout_Calculator.user.js')});
   await page.click('#tsh-launcher');await page.click('[data-hub-view=keys]');
   const provider=page.locator('[data-provider=torn]');await provider.locator('.tsh-key-permission input').first().waitFor();
   await page.waitForFunction(()=>{const node=document.querySelector('[data-provider=torn] .tsh-key-permission input');return node&&!node.disabled;});
   await provider.locator('> .tsh-key-input').fill(await page.evaluate(()=>synthetic[0]));await provider.locator('.tsh-save-key').click();
   await page.waitForFunction(()=>document.querySelector('[data-provider=torn] .tsh-key-status')?.textContent==='Key configured');
   const add=provider.locator('.tsh-named-key').last();await add.locator('.tsh-key-label').fill('Faction operations');await add.locator('.tsh-key-input').fill(await page.evaluate(()=>synthetic[1]));await add.locator('.tsh-save-named').click();
   await page.waitForFunction(()=>document.querySelectorAll('[data-provider=torn] .tsh-named-key').length===2);
   const permission=provider.locator('.tsh-key-permission').filter({hasText:'War Payout Calculator'}).locator('input');await permission.check();
   const assignment=provider.getByRole('combobox',{name:'torn key for War Payout Calculator'});await page.waitForFunction(()=>!document.querySelector('[aria-label="torn key for War Payout Calculator"]').disabled);
   const namedId=await assignment.locator('option').last().getAttribute('value');await assignment.selectOption(namedId);
   await page.waitForTimeout(450);
   await permission.uncheck();await page.waitForTimeout(300);await permission.check();await page.waitForTimeout(400);
   assert.equal(await assignment.inputValue(),namedId,'regrant keeps the displayed named assignment');
   await provider.locator('.tsh-named-key .tsh-key-label').first().fill('Unsaved label');await page.click('[data-hub-view=scripts]');await page.waitForSelector('.tsh-discard-confirm');await page.click('.tsh-keep-editing');
   assert.equal(await provider.locator('.tsh-named-key .tsh-key-label').first().inputValue(),'Unsaved label','draft guard preserves label edits');await page.click('[data-hub-view=scripts]');await page.click('.tsh-discard');
   async function showHub(view){if(await page.locator('#twpc-dialog').isVisible())await page.click('#twpc-close');if(await page.locator('#tsh-dialog').isHidden())await page.click('#tsh-launcher');await page.click('[data-hub-view='+view+']');}
   async function requestWars(){await showHub('scripts');await page.locator('[data-script="war-payout-calculator"] .tsh-primary').click();await page.click('#twpc-list-wars');await page.waitForFunction(()=>document.getElementById('twpc-dialog')?.getAttribute('aria-busy')==='false');}
   await requestWars();
   assert.equal(await page.evaluate(()=>calls[0]?.key===synthetic[1]),true,'assigned key used by actual transport');
   await showHub('keys');await provider.locator('.tsh-delete-named').scrollIntoViewIfNeeded();const scrollBefore=await page.locator('#tsh-dialog').evaluate(el=>el.scrollTop);await provider.locator('.tsh-delete-named').click();await page.waitForTimeout(400);
   assert.ok(await page.locator('#tsh-dialog').evaluate((el,before)=>Math.abs(el.scrollTop-Math.min(before,el.scrollHeight-el.clientHeight))<3,scrollBefore),'key updates preserve scroll');
   await provider.getByRole('checkbox',{name:'torn global fallback',exact:true}).check();await page.waitForTimeout(400);
   assert.match(await provider.locator('.tsh-assignment-status').innerText(),/Using global fallback/);
   await requestWars();
   assert.equal(await page.evaluate(()=>calls.at(-1)?.key===synthetic[0]),true,'fallback resolves to global key');
   await page.evaluate(()=>{failCode=5;window.beforeFailure=calls.length;});await requestWars();
   assert.equal(await page.evaluate(()=>calls.length-beforeFailure),1,'rate limit never switches keys/retries');
   await showHub('keys');await permission.uncheck();await page.waitForTimeout(400);
   await page.evaluate(()=>{window.beforeDenied=calls.length;});await requestWars();
   assert.equal(await page.evaluate(()=>calls.length),await page.evaluate(()=>beforeDenied),'revoked access cannot use fallback');
   assert.equal(await page.evaluate(()=>synthetic.every(key=>!messages.join('').includes(key)&&!document.querySelector('#tsh-dialog').textContent.includes(key))),true,'public transport and Hub DOM contain no credentials');
   await showHub('keys');
   assert.equal(await page.locator('#tsh-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+2),true,'no mobile horizontal overflow');
   const savedRecords=await page.evaluate(()=>[...records]);await page.reload();await page.evaluate(fixture,{pda,initialRecords:savedRecords});await page.addScriptTag({content:read('Torn_War_Payout_Calculator.user.js')});await page.evaluate(()=>menuOpen());
   await page.waitForFunction(()=>document.getElementById('twpc-key-state')?.textContent.includes('Managed by Hub'));
   assert.equal(await page.locator('#twpc-key').isDisabled(),true,'remembered enrollment disables personal key controls');
   await page.click('#twpc-list-wars');await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>calls.length),0,'reload without Hub cannot reactivate stored personal key');
   assert.deepEqual(errors,[]);await page.close();
  }
  console.log('PASS real-browser named keys, global fallback, revocation, redaction and four desktop/PDA viewports');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
