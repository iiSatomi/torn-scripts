'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.TORN_PLAYWRIGHT||'C:/Users/asato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.TORN_BROWSER||'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe'});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><h1>Isolated userscript settings fixture</h1></body></html>'}));
  await page.goto('https://www.torn.com/index.php');
  await page.evaluate(()=>{
   window.fixtureSaved=new Map();window.fixtureRequests=0;
   window.GM_getValue=(key,fallback)=>fixtureSaved.has(key)?fixtureSaved.get(key):fallback;
   window.GM_setValue=(key,value)=>fixtureSaved.set(key,value);
   window.GM_xmlhttpRequest=()=>{window.fixtureRequests++;};
   window.GM_registerMenuCommand=(label,callback)=>{const button=document.createElement('button');button.textContent=label;button.addEventListener('click',callback);document.body.append(button);};
  });
  await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../../Torn_Faction_Chat_Banker_Ping.user.js'),'utf8')});
  const configured='https://discord.com/api/webhooks/123/SYNTHETIC_TEST_ONLY';
  page.once('dialog',dialog=>dialog.accept(configured));
  await page.getByRole('button',{name:'Configure Discord webhook',exact:true}).click();
  assert.equal(await page.evaluate(()=>fixtureSaved.get('torn-banker-ping:discord-webhook')),configured);
  page.once('dialog',dialog=>dialog.accept(''));
  await page.getByRole('button',{name:'Configure Discord webhook',exact:true}).click();
  assert.equal(await page.evaluate(()=>fixtureSaved.get('torn-banker-ping:discord-webhook')),'');
  assert.equal(await page.evaluate(()=>fixtureRequests),0);assert.deepEqual(errors,[]);
  console.log('PASS browser: actual Banker Ping registers its configuration menu, saves/clears a synthetic destination, sends no requests and raises no page errors.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
