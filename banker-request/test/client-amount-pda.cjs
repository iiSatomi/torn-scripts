'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {launch} = require('../../test/offline/lab.cjs');

async function check(browser,source,early,pending=false,hub=false){
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 const page=await context.newPage(), errors=[], blocked=[];
 page.on('pageerror',error=>errors.push(error.message));
 try{
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.origin==='https://www.torn.com'&&url.pathname==='/index.php'){
    return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><script>window.topBannerInitData = {"user":{"data":{"userID":123}}};</script><body><main id="native-host">Offline Torn fixture</main></body>'});
   }
   blocked.push(url.origin+url.pathname);return route.abort();
  });
  await page.goto('https://www.torn.com/index.php');
  await page.evaluate(({early,pending})=>{
   const prefix='banker-request-hub:v1:';
   const values={
    [prefix+'settings']:{endpoint:'https://banker-fixture.example.workers.dev',remember:true,connected:true},
    [prefix+'personal-key']:'FixtureKey000001'
   };
   if(pending)values[prefix+'pending']={endpoint:values[prefix+'settings'].endpoint,userId:123,payload:{requestId:'a3658de8-8afb-4ff8-aa38-bc6f291883ca',kind:'amount',amount:1000}};
   window.bankerCalls=[];
   window.PDA_getTabState=async()=>({isActiveTab:true,isWebViewVisible:true});
   window.GM_info={scriptHandler:'Torn PDA'};
   window.GM_getValue=(key,fallback)=>key===prefix+'personal-key'&&early?new Promise(resolve=>{window.releaseBankerKey=()=>resolve(values[key]);}):Object.hasOwn(values,key)?values[key]:fallback;
   window.GM_setValue=(key,value)=>{values[key]=structuredClone(value);};
   window.GM_deleteValue=key=>{delete values[key];};
   window.GM_xmlhttpRequest=opts=>{
    const path=new URL(opts.url).pathname;
    window.bankerCalls.push(path);
    if(path!=='/v1/identity')throw new Error('Fixture does not support sending requests or other mutation actions');
    window.releaseBankerIdentity=()=>opts.onload({status:200,finalUrl:opts.url,responseText:JSON.stringify({ok:true,user:{id:123,name:'Fixture member',factionId:10},banker:false})});
    return {abort(){}};
   };
  },{early,pending});
  // Simulate Torn PDA source processing, without altering the generated input logic.
  const adapted=source.replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"');
  if(hub)await page.addScriptTag({content:fs.readFileSync(require.resolve('../../script-hub/dist/Torn_Script_Hub.user.js'),'utf8')});
  await page.addScriptTag({content:adapted});
  const amount=page.getByRole('textbox',{name:'Amount ($)',exact:true});
  const send=page.locator('.brh-root .brh-page button.tsui-primary').first();
  page.setDefaultTimeout(6000);
 const status=page.locator('.brh-root .brh-status');
  const focused=()=>amount.evaluate(el=>el===document.activeElement);
  async function tapAmount(){
   await amount.scrollIntoViewIfNeeded();
   const box=await amount.boundingBox();
   await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
  }
  if(hub){
   await page.getByRole('button',{name:'Open Script Hub',exact:true}).tap();
   await page.locator('.tsh-tile[data-script=banker-request] .tsh-primary').tap();
  }else await page.getByRole('button',{name:'Open banker request',exact:true}).tap();
  await amount.waitFor();
  assert.equal(await amount.getAttribute('inputmode'),'numeric','whole-dollar keypad hint remains numeric');
  if(early){
   await tapAmount();
   assert.equal(await focused(),true,'first tap before key hydration');
   await page.keyboard.type('12');
   await page.evaluate(()=>window.releaseBankerKey());
  }
  if(!early){
   // The mobile bridge may notify the already-open tool that its tab is active.
   await page.evaluate(async()=>{await new Promise(requestAnimationFrame);window.dispatchEvent(new CustomEvent('tornpda:tabState',{detail:{isActiveTab:true,isWebViewVisible:true}}));});
  }
  await page.waitForFunction(()=>typeof window.releaseBankerIdentity==='function',null,{timeout:5000}).catch(async error=>{
   throw new Error(error.message+': '+JSON.stringify({early,pending,status:await status.textContent(),calls:await page.evaluate(()=>window.bankerCalls),errors}));
  });
  assert.equal(await send.isDisabled(),true,'cannot Send during identity verification');
  if(pending){
   await tapAmount();
   assert.equal(await amount.isDisabled(),true,'an actual unresolved request still locks the draft');
   assert.equal(await focused(),false);
  }else{
   if(!early)await tapAmount();
   assert.equal(await focused(),true,early?'starting verification must not blur the draft':'first trusted touch must focus the amount while verification is held');
   await page.keyboard.type(early?'345':'5000');
   const expected=early?'12345':'5000';
   assert.equal(await amount.inputValue(),expected);
   await page.setViewportSize({width:390,height:510});
   await page.evaluate(()=>{document.getElementById('native-host').replaceChildren('Host rerendered');});
   assert.equal(await focused(),true,'simulated keyboard viewport and host repaint keep focus');
   assert.equal(await amount.inputValue(),expected);
  }
  await page.evaluate(()=>window.releaseBankerIdentity());
  await page.waitForFunction(()=>document.querySelector('.brh-root .brh-status')?.textContent==='Account verified.',null,{timeout:5000});
  if(!pending){
   assert.equal(await focused(),true,'identity completion must not blur amount');
   assert.equal(await amount.inputValue(),early?'12345':'5000');
   await page.getByRole('radio',{name:'Full balance',exact:true}).tap();
   assert.equal(await amount.isVisible(),false);
   await page.getByRole('radio',{name:'Specific amount',exact:true}).tap();
   await tapAmount();
   assert.equal(await focused(),true);
   assert.equal(await amount.inputValue(),early?'12345':'5000');
  }else{
   assert.equal(await send.isDisabled(),true,'existing pending Request remains blocked');
   assert.equal(await amount.isDisabled(),true);
  }
  assert.deepEqual(await page.evaluate(()=>window.bankerCalls),['/v1/identity']);
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
 }finally{await context.close();}
}

module.exports=check;
if(require.main===module)(async()=>{
 const path=process.env.BANKER_BASELINE||require.resolve('../dist/Torn_Banker_Request_Hub.user.js');
 const source=fs.readFileSync(path,'utf8');
 const rig=await launch();
 try{
  for(const pair of [[false,false],[true,false],[false,true],[false,false,true]]) await check(rig.browser,source,...pair);
  console.log('PASS Banker Request Hub PDA amount focus before/during/after held verification, draft, keypad, full/pending controls, and no request send.');
 }finally{await rig.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
