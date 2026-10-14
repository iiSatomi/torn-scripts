'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.TORN_PLAYWRIGHT||'C:/Users/asato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../../..');
const hub=fs.readFileSync(path.join(root,'script-hub/dist/Torn_Script_Hub.user.js'),'utf8');
const payout=fs.readFileSync(path.join(root,'Torn_War_Payout_Calculator.user.js'),'utf8');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.TORN_BROWSER||'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',r=>r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><head><style>[hidden]{display:none!important}</style></head><body style="background:#25282c;font-family:Arial"><aside id="sidebar"><a href="/messages.php">Mail</a><a href="/page.php?sid=events">Events</a><a href="/page.php?sid=awards">Awards</a></aside></body></html>'}));
  await page.goto('https://www.torn.com/factions.php?step=your&type=1');
  await page.evaluate(()=>{window.store={};window.GM_getValue=(key,value)=>store[key]??value;window.GM_setValue=(key,value)=>{store[key]=value;};window.GM_info={scriptHandler:'Tampermonkey'};window.GM_registerMenuCommand=()=>{};});
  await page.evaluate(code=>(0,eval)(code),hub);await page.evaluate(code=>(0,eval)(code),payout);
  await page.click('#tsh-launcher');await page.click('[data-script="war-payout-calculator"] .tsh-primary');await page.waitForSelector('#twpc-dialog');
  assert.equal(await page.isVisible('#tsh-dialog'),true,'opening a script keeps the Hub open');
  const order=()=>page.evaluate(()=>[Number(getComputedStyle(document.getElementById('tsh-dialog')).zIndex),Number(getComputedStyle(document.getElementById('twpc-dialog')).zIndex)]);
  let [hubZ,toolZ]=await order();assert.ok(toolZ>hubZ,'launched tool is in front of the retained Hub');
  await page.evaluate(()=>{for(const [id,name,icon]of [['oc-demo','OC Suite','oc'],['usage-demo','Faction Usage','usage'],['gym-demo','Gym Planner','gym'],['bank-demo','Banker Request','bank'],['crime-demo','Pickpocketing','crime']])document.dispatchEvent(new CustomEvent('torn-script-hub:v1:register',{detail:JSON.stringify({id,name,icon,instance:id,url:location.href,actions:[{id:'open',label:'Open tool'}]})}));});
  [hubZ,toolZ]=await order();assert.ok(toolZ>hubZ,'background script discovery does not pull Hub in front of the launched tool');
  await page.locator('#tsh-dialog .tsh-header').click({position:{x:500,y:20}});[hubZ,toolZ]=await order();assert.ok(hubZ>toolZ,'clicking the Hub brings it forward');
  await page.locator('#twpc-dialog .tsui-title').click({position:{x:20,y:10}});[hubZ,toolZ]=await order();assert.ok(toolZ>hubZ,'clicking the tool brings it forward again');
  await page.keyboard.press('Escape');assert.equal(await page.locator('#twpc-dialog').getAttribute('data-tsui-collapsed'),'true');assert.equal(await page.isVisible('#tsh-dialog'),true,'Escape affects only the foreground window');
  await page.click('#twpc-collapse');
  await page.click('#twpc-close');assert.equal(await page.isVisible('#tsh-dialog'),true,'closing the tool leaves Hub available');
  await page.evaluate(()=>{
   const modal=document.createElement('div');modal.id='legacy-background';modal.hidden=true;modal.style.cssText='position:fixed;inset:0;z-index:999999;background:#0008;display:grid;place-items:center';
   modal.innerHTML='<section class="tsui-legacy-surface" data-tsui-owner="legacy-modal" style="background:#ddd;padding:20px"><button id="legacy-close">Close legacy menu</button></section>';document.body.append(modal);
   document.getElementById('legacy-close').onclick=()=>{modal.hidden=true;};
   const metadata={id:'legacy-modal',name:'Legacy menu',instance:'legacy-instance',url:location.href,actions:[{id:'open',label:'Open menu'}]};
   document.addEventListener('torn-script-hub:v1:activate',event=>{const value=JSON.parse(event.detail);if(value.id!==metadata.id)return;modal.hidden=false;if(!window.legacyNoFocus)document.getElementById('legacy-close').focus();document.dispatchEvent(new CustomEvent('torn-script-hub:v1:result',{detail:JSON.stringify({...value,status:'opened'})}));});
   document.dispatchEvent(new CustomEvent('torn-script-hub:v1:register',{detail:JSON.stringify(metadata)}));
  });
  await page.click('[data-script="legacy-modal"] .tsh-primary');
  assert.equal(await page.locator('#legacy-close').evaluate(node=>{const r=node.getBoundingClientRect();return node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true,'legacy modal and its fixed backdrop appear above the retained Hub');
  await page.evaluate(()=>{window.legacyNoFocus=true;document.querySelector('#tsh-dialog .tsh-header').focus();});
  await page.click('[data-script="legacy-modal"] .tsh-primary');
  assert.equal(await page.locator('#legacy-close').evaluate(node=>{const r=node.getBoundingClientRect();return node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true,'reopening a declared legacy menu without focus still brings it forward');
  await page.click('#legacy-close');assert.equal(await page.isVisible('#tsh-dialog'),true);
  await page.locator('#tsh-dialog .tsh-header').click();
  const dir=path.join(__dirname,'artifacts/current');fs.mkdirSync(dir,{recursive:true});
  for(const layout of ['frostbite','workbench','torn']){
   await page.click('[data-hub-view="themes"]');await page.click('.tsh-theme-layout[data-layout="'+layout+'"]');await page.selectOption('.tsh-theme-palette',layout);await page.selectOption('.tsh-theme-mode','dark');await page.click('.tsh-theme-save');
   await page.waitForFunction(()=>document.querySelector('.tsh-theme-message').textContent==='Theme saved.');
   assert.equal(await page.locator('#tsh-dialog .tsui-theme-mark').count(),1,'one bundled visual identity per header');
   await page.click('[data-hub-view="scripts"]');
   if(layout==='torn')assert.equal(await page.locator('.tsh-tile').first().evaluate(n=>getComputedStyle(n).flexDirection),'row','Torn uses compact script rows');
   for(const [width,height]of [[1920,1080],[390,844],[430,932],[844,390]]){
    await page.setViewportSize({width,height});
    await page.waitForFunction(()=>{const r=document.getElementById('tsh-dialog').getBoundingClientRect();return r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;});
    assert.equal(await page.locator('#tsh-dialog').evaluate(n=>n.scrollWidth>n.clientWidth+1),false,layout+' fits '+width);
    await page.locator('#tsh-dialog').screenshot({path:path.join(dir,'hub-identity-'+layout+'-'+width+'.png')});
   }
   await page.setViewportSize({width:1920,height:1080});
  }
  assert.deepEqual(errors,[]);console.log('PASS retained Hub, shared window focus, three distinct identities and 12 responsive design combinations');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
