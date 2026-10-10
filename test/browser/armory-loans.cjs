const assert=require('node:assert/strict');
const puppeteer=require('puppeteer-core');
const {fn,cats}=require('../armory-categories.test.cjs');
const code=cats+'\n'+['catOfItemType','activeArmourySub','armouryTabLink','setNativeValue','initLoanAutofill','paintArmoryColumn'].map(fn).join('\n');
(async()=>{
 const browser=await puppeteer.launch({executablePath:'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',headless:true});
 try {
  const page=await browser.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request',r=>r.respond({status:200,contentType:'text/html',body:'<html><body></body></html>'}));
  await page.goto('http://127.0.0.1/factions.php#/tab=armoury&sub=utilities');
  await page.evaluate(code=>{
   window.messages=[];window.submits=0;
   new Function('takeLoanIntent','ocmToast','isKnownOcItem',code+`
     let _loanAutofillGeneration = 0;
     const NATIVE_LOAN_SUBS=new Set(Object.values(ARMORY_CATS).map(c=>c.sub));
     window.loanTest={start:initLoanAutofill,active:activeArmourySub,paint:paintArmoryColumn};
   `)(()=>{const intent=window.pending;window.pending=null;return intent;},m=>messages.push(m),name=>name==='Ipecac Syrup');
   window.setup=(sub,options={})=>{
    messages.length=0;
    document.body.innerHTML='<ul id="faction-armoury-tabs">'+['utilities','medical','consumables','armour','weapons','temporary','drugs','boosters'].map(s=>`<li class="${s===sub?'ui-tabs-active':''}"><a href="#/tab=armoury&sub=${s}">${s}</a></li>`).join('')+'</ul><section class="armoury-tabs"><ul class="item-list"></ul></section>';
    const render=s=>{
     document.querySelectorAll('#faction-armoury-tabs li').forEach(li=>li.classList.toggle('ui-tabs-active',li.textContent===s));
     const list=document.querySelector('.item-list');
     list.innerHTML=s===sub?'<li><span class="img-wrap" data-itemid="101">Item</span><span class="name">Ipecac Syrup x3</span><span class="type">Medical</span><span class="loaned"></span><a data-role="give">Give</a>'+(!options.noLoan?'<a href="#" data-role="loan">Loan</a>':'')+'</li>':'';
     list.querySelector('[data-role="give"]')?.addEventListener('click',()=>{throw Error('Give must not be clicked');});
     list.querySelector('[data-role="loan"]')?.addEventListener('click',e=>{e.preventDefault();list.querySelector('li').insertAdjacentHTML('beforeend','<div class="loan-cont"><input name="user" class="ac-search"><input class="quantity"><button>LOAN</button></div>');list.querySelector('button').onclick=()=>submits++;});
    };
    document.querySelectorAll('#faction-armoury-tabs a').forEach(a=>a.onclick=e=>{e.preventDefault();render(a.textContent);});
    render(sub);window.pending={itemId:'101',uid:'123',memberName:'Fixture Member',itemName:'Ipecac Syrup',qty:1,sub:options.intentSub??sub};
   };
  },code);
  for(const sub of ['medical','consumables','armour','weapons','temporary','drugs','boosters','utilities']){
   await page.evaluate(sub=>{setup(sub);loanTest.start();},sub);
   await page.waitForFunction(()=>document.querySelector('input[name="user"]')?.value==='Fixture Member [123]');
   assert.equal(await page.$eval('input.quantity',e=>e.value),'1');
  }
  // Outdated Utilities metadata must discover the actual Medical tab.
  await page.evaluate(()=>{setup('medical',{intentSub:'utilities'});loanTest.start();});
  await page.waitForFunction(()=>document.querySelector('input[name="user"]')?.value==='Fixture Member [123]',{timeout:12000});
  assert.equal(await page.evaluate(()=>loanTest.active()),'medical');
  await page.evaluate(()=>{setup('medical');const intent={...pending};loanTest.start();pending=intent;loanTest.start();});
  await page.waitForFunction(()=>document.querySelector('input[name="user"]')?.value==='Fixture Member [123]');
  assert.equal(await page.$$eval('.loan-cont',els=>els.length),1,'A replacement intent must cancel the old search');
  await page.evaluate(()=>{setup('medical',{noLoan:true});loanTest.start();});
  await page.waitForFunction(()=>messages.some(m=>m.includes('No enabled Loan')));
  assert.equal(await page.$('input[name="user"]'),null);
  await page.evaluate(()=>{
   setup('medical');window.retrieved=[];
   document.querySelector('.item-list').innerHTML=[['999',false],['123',true],['123',false]].map(([uid,hidden],i)=>`<li style="${hidden?'display:none':''}"><span class="img-wrap" data-itemid="101">Item</span><span class="loaned"><a href="/profiles.php?XID=${uid}">Holder</a></span><a data-role="retrieve" data-row="${i}">Retrieve</a></li>`).join('');
   document.querySelectorAll('[data-role="retrieve"]').forEach(a=>a.onclick=()=>retrieved.push(a.dataset.row));
   pending.mode='retrieve';loanTest.start();
  });
  await page.waitForFunction(()=>retrieved.length>0);
  assert.deepEqual(await page.evaluate(()=>retrieved),['2'],'Retrieve uses the exact holder on a visible row');
  await page.evaluate(()=>{
   setup('medical');const li=document.querySelector('.item-list li');
   li.querySelector('.loaned').innerHTML='<a href="/profiles.php?XID=123">Fixture Member</a>';
   const need={needByUser:new Map([['123|101',{oc:'Fixture OC',role:'Medic'}]]),userNeeds:{}};
   loanTest.paint(document.querySelector('.armoury-tabs'),need);
   loanTest.paint(document.querySelector('.armoury-tabs'),need);
  });
  assert.equal(await page.$$eval('.ocm-acol',els=>els.length),1,'Annotation remains singleton');
  assert.match(await page.$eval('.ocm-acol',el=>el.textContent),/In use/);
  assert.equal(await page.evaluate(()=>submits),0,'Never submits the loan');
  assert.deepEqual(errors,[]);
  console.log('Armory browser fixtures passed: eight native sections, stale-category discovery, medical annotations, no Loan permission, quantity/member prefill and no submission.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
