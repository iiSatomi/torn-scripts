'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.TORN_PLAYWRIGHT||'C:/Users/asato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
async function main(){
 const browser=await chromium.launch({executablePath:process.env.TORN_BROWSER||'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',r=>r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body><section class="money___fixture"><form><input id="add-money-to-balance" type="radio"></form><ul><li class="listItem___fixture"><div class="userInfoWrap___fixture"><a href="/profiles.php?XID=1">Synthetic member</a><a href="/factions.php?step=profile&ID=10">Faction</a></div><div class="editBalanceWrap___fixture">$10.25<span><input class="input-money" data-testid="legacy-money-input" value="10.25"><input class="input-money" data-testid="legacy-money-input" type="hidden" value="10.25"></span><button aria-label="Edit balance">Edit</button></div></li></ul></section></body></html>'}));
  await page.goto('https://www.torn.com/factions.php?step=your&type=1#/tab=controls');
  const files=['lib/war-payout-credits.cjs','lib/war-payout-native.js','lib/war-payout-credit-ui.js'];
  const source=files.map(file=>fs.readFileSync(path.resolve(__dirname,'../..',file),'utf8').replace(/^module\.exports[^\n]*$/gm,'')).join('\n');
  await page.evaluate(source=>{
   const editor=document.querySelector('[class*=editBalanceWrap]'),button=editor.querySelector('button'),input=editor.querySelector('input:not([type=hidden])'),hidden=editor.querySelector('input[type=hidden]');let model=input.value;
   const depositor={userID:1,balance:10.25,faction:{id:10},isMember:true};editor.__reactFiber$fixture={child:{memoizedProps:{section:'money',depositor}}};
   input.addEventListener('input',()=>{model=input.value;hidden.value=model;});
   button.addEventListener('click',()=>{if(button.getAttribute('aria-label')==='Edit balance'){document.body.dataset.edits='1';setTimeout(()=>{editor.firstChild.textContent='';button.setAttribute('aria-label','Save balance');},200);return;}document.body.dataset.saves=String(Number(document.body.dataset.saves||0)+1);depositor.balance=Number(model);editor.firstChild.textContent='$'+model;button.setAttribute('aria-label','Edit balance');});
   (0,eval)('(function(){'+source+`;const values=new Map();const dialog=document.createElement('dialog');document.body.append(dialog);dialog.show();
    const scope={warId:99,factionId:10,opponentId:20,start:100,end:200};
    window.creditUI=createWarPayoutCreditUI({dialog,env:{GM_getValue:(k,d)=>values.get(k)||d,GM_setValue:(k,v)=>values.set(k,v)},awake:()=>true,readDraft:()=>({scope,live:false,mode:'actual',coverage:'unverified',result:{profit:1000,cut:0,pool:1000,total:100,leftover:900,rates:{hits:100},rows:[{id:1,name:'Synthetic member',payout:100,hits:1,losses:0}]}}),nativeAdapter:createWarPayoutNativeCreditAdapter({doc:document,win:window,awake:()=>!!window.creditUI?.isActive()})});creditUI.show();})();`);
  },source);
  await page.check('#twpc-credit-reviewed');await page.click('#twpc-credit-lock');await page.waitForFunction(()=>!document.getElementById('twpc-credit-next').disabled);await page.click('#twpc-credit-next');
  await page.waitForFunction(()=>document.body.dataset.edits==='1');
  assert.equal(await page.locator('body').getAttribute('data-saves'),null,'Save has not started at cancellation');
  await page.evaluate(()=>{creditUI.pause();setTimeout(()=>creditUI.show(),5);});
  await page.waitForTimeout(300);
  assert.equal(await page.locator('body').getAttribute('data-saves'),null,'resuming cannot revive cancelled native preparation');
  assert.equal(await page.isDisabled('#twpc-credit-next'),true,'interrupted operation still requires review');
  assert.match(await page.textContent('#twpc-credit-members'),/Needs review/);
  assert.deepEqual(errors,[]);
  await page.evaluate(()=>creditUI.destroy());
  console.log('PASS cancelled native preparation cannot activate Save after rapid resume');
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
