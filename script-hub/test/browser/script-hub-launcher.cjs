'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.TORN_PLAYWRIGHT||'C:/Users/asato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../../..'),hub=fs.readFileSync(path.join(root,'script-hub/dist/Torn_Script_Hub.user.js'),'utf8');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.TORN_BROWSER||'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',r=>r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}#sidebar{position:fixed;top:50px;left:0;width:180px;transform:translateX(-100%)}.icons{height:40px;display:flex}</style></head><body><aside id="sidebar"><div class="icons"><a href="/messages.php">Mail</a><a href="/page.php?sid=events">Events</a><a href="/page.php?sid=awards">Awards</a></div></aside></body></html>'}));
  await page.goto('https://www.torn.com/index.php');
  await page.evaluate(()=>{window.PDA_getTabState=async()=>({isActiveTab:true,isWebViewVisible:true});});
  await page.evaluate(code=>(0,eval)(code),hub);
  await page.waitForSelector('#tsh-launcher',{state:'attached'});
  const reachable=()=>page.locator('#tsh-launcher').evaluate(node=>{const r=node.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return r.width>=32&&r.height>=32&&x>=0&&y>=0&&x<innerWidth&&y<innerHeight&&node.contains(document.elementFromPoint(x,y));});
  assert.equal(await reachable(),true,'mobile launcher remains reachable when the sidebar is translated off screen');
  for(const [width,height]of [[390,844],[430,932],[844,390],[1280,900]]){
   await page.setViewportSize({width,height});
   await page.waitForFunction(()=>document.getElementById('tsh-launcher').classList.contains('tsh-floating'));
   assert.equal(await reachable(),true,'touch launcher stays reachable at '+width+'x'+height);
   await page.tap('#tsh-launcher');await page.waitForSelector('#tsh-dialog');await page.tap('.tsh-close');
  }
  await page.evaluate(()=>{document.getElementById('sidebar').style.transform='none';});
  await page.waitForFunction(()=>{const n=document.getElementById('tsh-launcher'),r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});
  assert.equal(await page.locator('#tsh-launcher').count(),1);
  await page.evaluate(()=>{document.getElementById('sidebar').style.visibility='hidden';});
  await page.waitForFunction(()=>document.getElementById('tsh-launcher').classList.contains('tsh-floating'));
  assert.equal(await reachable(),true,'visibility-hidden sidebar cannot hide the mobile launcher');
  const desktop=await browser.newPage({viewport:{width:1920,height:1080}});desktop.on('pageerror',error=>errors.push(error.message));
  await desktop.route('**/*',r=>r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body><aside id="sidebar" style="width:180px"><div style="height:40px"><a href="/messages.php">Mail</a><a href="/page.php?sid=events">Events</a><a href="/page.php?sid=awards">Awards</a></div></aside></body></html>'}));
  await desktop.goto('https://www.torn.com/index.php');await desktop.evaluate(code=>(0,eval)(code),hub);
  assert.equal(await desktop.locator('#sidebar #tsh-launcher').count(),1,'desktop mouse layout retains sidebar launcher');
  const early=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});early.on('pageerror',error=>errors.push(error.message));
  await early.route('**/*',r=>r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main>Synthetic document-start fixture</main></body></html>'}));
  await early.addInitScript({content:hub+'\n'+hub});await early.goto('https://www.torn.com/index.php');
  await early.waitForSelector('#tsh-launcher',{timeout:3000});
  assert.equal(await early.locator('#tsh-launcher').count(),1,'early repeated injection mounts one Hub after the DOM becomes available');
  await early.tap('#tsh-launcher');await early.waitForSelector('#tsh-dialog');
  assert.deepEqual(errors,[]);console.log('PASS reachable touch launcher across four viewports, hidden sidebars, tap controls, desktop placement and early duplicate injection');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
