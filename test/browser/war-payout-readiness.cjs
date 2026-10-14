'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.TORN_PLAYWRIGHT||'C:/Users/asato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'Torn_War_Payout_Calculator.user.js'),'utf8');
const hub=fs.readFileSync(path.join(root,'script-hub/dist/Torn_Script_Hub.user.js'),'utf8');
const base=Math.floor(Date.now()/1000),start=base+3*86400;
const html='<html><body><aside id="sidebar"><a href="/messages.php">Mail</a><a href="/page.php?sid=events">Events</a><a href="/page.php?sid=awards">Awards</a></aside></body></html>';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.TORN_BROWSER||'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true,args:['--no-first-run','--no-default-browser-check']});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.name));
  await page.route('**/*',r=>r.fulfill({status:200,contentType:'text/html',body:html}));
  await page.goto('https://www.torn.com/factions.php?step=your&type=1');
  await page.evaluate(({base,start})=>{
   window.auditNow=base;Date.now=()=>window.auditNow*1000;window.auditPhase='scheduled';window.auditCalls=[];
   const values=new Map();window.GM_info={scriptHandler:'Tampermonkey'};window.GM_getValue=(k,d)=>values.has(k)?values.get(k):d;
   window.GM_setValue=(k,v)=>{if(k==='twpc-credit-ledger-v1'&&window.auditQuota)throw new Error('Synthetic quota failure');values.set(k,v);};window.GM_deleteValue=k=>values.delete(k);window.GM_registerMenuCommand=()=>{};
   window.GM_xmlhttpRequest=o=>{
    const url=new URL(o.url),part=url.pathname.split('/').pop();window.auditCalls.push({part,to:url.searchParams.get('to')});
    const war={id:500,start,end:window.auditPhase==='ended'?start+120:0,factions:[{id:10,name:'Synthetic faction'},{id:window.auditMismatch?30:20,name:'Synthetic enemy'}]};
    const actor=(id,faction)=>({id,name:'Synthetic '+id,faction:{id:faction}});
    const attack=(id,ended,from,to)=>({id,started:ended-1,ended,attacker:actor(id,from),defender:actor(id+10,to),result:'Hospitalized',is_ranked_war:true});
    const attacks=[attack(1,start+40,10,20),attack(2,start+90,20,10)];if(window.auditPhase==='ended')attacks.push(attack(3,start+150,10,20));
    const data=part==='basic'?{basic:{id:10}}:part==='rankedwars'?{rankedwars:[war]}:part==='attacks'?{attacks:attacks.filter(a=>a.ended<=Number(url.searchParams.get('to'))),_metadata:{links:{next:null,prev:null}}}:{rankedwarreport:{factions:[{id:10,rewards:{items:[{id:1,name:'Synthetic cache',quantity:3}]}}]}};
    const timer=setTimeout(()=>o.onload({status:200,responseText:JSON.stringify(data)}),5);return{abort:()=>clearTimeout(timer)};
   };
  },{base,start});
  await page.evaluate(s=>(0,eval)(s),hub);await page.evaluate(s=>(0,eval)(s),source);
  await page.waitForSelector('#tsh-launcher');await page.click('#tsh-launcher');await page.click('[data-script="war-payout-calculator"] .tsh-primary');
  await page.click('#twpc-settings-toggle');await page.type('#twpc-key','TESTTESTTESTTEST');await page.click('#twpc-use-key');await page.click('#twpc-tab-calculator');
  await page.click('#twpc-list-wars');await page.waitForSelector('#twpc-war option[value="500"]',{state:'attached'});await page.selectOption('#twpc-war','500');
  assert.match(await page.$eval('#twpc-status',e=>e.textContent),/not started/);
  assert.equal(await page.evaluate(()=>window.auditCalls.filter(c=>c.part==='attacks').length),0,'scheduled selection sends no attack query');
  await page.evaluate(start=>{window.auditPhase='live';window.auditNow=start+100;},start);await page.click('#twpc-load');
  await page.waitForFunction(()=>document.getElementById('twpc-coverage').textContent.includes('Live war'));
  const beforeMismatch=await page.evaluate(()=>window.auditCalls.filter(c=>c.part==='attacks').length);
  await page.evaluate(()=>{window.auditMismatch=true;});await page.click('#twpc-load');await page.waitForFunction(()=>!document.getElementById('twpc-load').disabled);
  assert.match(await page.$eval('#twpc-status',e=>e.textContent),/details changed/i);
  assert.equal(await page.evaluate(()=>window.auditCalls.filter(c=>c.part==='attacks').length),beforeMismatch,'changed opponent scope sends no attack query');
  assert.equal(await page.$eval('#twpc-copy',e=>e.disabled),true,'failed refresh clears exportable old counts');
  await page.evaluate(()=>{window.auditMismatch=false;});await page.click('#twpc-load');await page.waitForFunction(()=>document.getElementById('twpc-coverage').textContent.includes('Live war'));
  const set=async(id,value)=>page.$eval('#twpc-'+id,(e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));},value);
  await set('profit','100');await set('rate-hits','1');await set('rate-losses','1');
  if(process.argv.includes('--lock-errors')){
   await page.click('#twpc-tab-credits');await page.click('#twpc-credit-reviewed');await page.waitForFunction(()=>!document.getElementById('twpc-credit-lock').disabled);await page.click('#twpc-credit-lock');
   await new Promise(r=>setTimeout(r,100));
   assert.match(await page.$eval('#twpc-credit-note',e=>e.textContent),/ended actual-profit payout/i,'live-war lock rejection remains visible');
   assert.equal(await page.$eval('#twpc-credit-next',e=>e.disabled),true);
   await page.click('#twpc-tab-calculator');
  }
  await page.evaluate(start=>{window.auditPhase='ended';window.auditNow=start+200;},start);await page.click('#twpc-load');
  await page.waitForFunction(()=>!document.getElementById('twpc-load').disabled);
  assert.equal(await page.$eval('#twpc-coverage',e=>e.textContent.includes('Live war')),false,'Reload must notice the server-side war end');
  assert.match(await page.$eval('#twpc-coverage',e=>e.textContent),/1 war hits.*1 losses/,'post-war attacks must not enter completed payouts');
  assert.equal(await page.$eval('[data-cache-qty]',e=>e.value),'3','ended rewards now load');
  assert.equal(await page.$eval('#twpc-total',e=>e.textContent),'$2');
  if(process.argv.includes('--lock-errors')){
   await set('profit','1');await page.click('#twpc-tab-credits');await page.click('#twpc-credit-reviewed');await page.waitForFunction(()=>!document.getElementById('twpc-credit-lock').disabled);await page.click('#twpc-credit-lock');
   await new Promise(r=>setTimeout(r,100));assert.match(await page.$eval('#twpc-credit-note',e=>e.textContent),/exceed the player pool/i,'over-budget rejection gives funding guidance');
   await page.click('#twpc-tab-calculator');await set('profit','100');
   await page.evaluate(()=>{window.auditQuota=true;});await page.click('#twpc-tab-credits');
   await page.click('#twpc-credit-reviewed');await page.waitForFunction(()=>!document.getElementById('twpc-credit-lock').disabled);await page.click('#twpc-credit-lock');
   await new Promise(r=>setTimeout(r,100));assert.match(await page.$eval('#twpc-credit-note',e=>e.textContent),/could not be saved/i,'storage failure remains visible');
   assert.equal(await page.$eval('#twpc-credit-next',e=>e.disabled),true);
   await page.evaluate(()=>{window.auditQuota=false;});await page.click('#twpc-credit-lock');
   await page.waitForFunction(()=>document.getElementById('twpc-credit-summary').textContent.includes('Pending $2'));
  }
  assert.deepEqual(errors,[]);
  console.log('PASS scheduled → live → ended reload / excludes post-war attacks / rewards / '+(process.argv.includes('--lock-errors')?'visible lock and quota errors':'upcoming-war transition'));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
