const assert=require('node:assert/strict');

const token='dc88f110-9e02-4ce0-a038-d004ee887399';
const link='https://www.torn.com/factions.php?step=your&type=1#/tab=controls&bankRequest='+token;
const endpoint='https://banker-link-fixture.example.workers.dev';
const ownPage='<html><body><div id="sidebar"><p>Name: <a href="/profiles.php?XID=999">Banker</a></p></div><main>Controls are loading</main></body></html>';

// Exercise the installed script through its public UI and Torn's native form.
// Every case has an isolated page, synthetic credentials and a stubbed relay.
module.exports=async function clientLink(browser,source){
 async function scenario(options,check){
  const page=await browser.newPage({viewport:{width:1920,height:1080}});
  const errors=[],unexpected=[];
  page.setDefaultTimeout(5000);
  page.on('pageerror',error=>errors.push(error.message));
  try{
   await page.route('**/*',route=>{
    if(route.request().isNavigationRequest()&&route.request().url().startsWith('https://www.torn.com/factions.php'))return route.fulfill({contentType:'text/html',body:ownPage});
    unexpected.push(route.request().url());return route.abort();
   });
   await page.goto(link);
   await page.bringToFront();
   await page.evaluate(({options,token,endpoint})=>{
    window.posts=[];window.nativeSelections=0;window.nativeSubmits=0;window.nativeSubmitClicks=0;window.moneyWrites=[];
    window.store={
     'banker-request-hub:v1:settings':{endpoint,useHub:false,remember:true,connected:true},
     'banker-request-hub:v1:personal-key':'TESTONLY00000001'
    };
    window.GM_info={scriptHandler:'Tampermonkey',script:{version:'link-fixture'}};
    window.GM_getValue=(key,fallback)=>Object.hasOwn(store,key)?structuredClone(store[key]):fallback;
    window.GM_setValue=(key,value)=>{store[key]=structuredClone(value);};
    window.GM_deleteValue=key=>{delete store[key];};
    window.GM_xmlhttpRequest=operation=>{
     const body=JSON.parse(operation.data);posts.push({url:operation.url,body});
     const timer=setTimeout(()=>{
      let result;
      if(operation.url===endpoint+'/v1/identity')result={ok:true,user:{id:999,name:'Banker',factionId:10},banker:options.banker!==false};
      else if(operation.url===endpoint+'/v1/requests/resolve')result={ok:true,request:{token,requestId:'6bc34db5-3049-4015-af10-ae19c90a8617',userId:123,name:'Sample',factionId:10,kind:'amount',amount:options.amount||5000000,status:'sent',createdAt:Date.now()-1000,expiresAt:Date.now()+60000}};
      else throw new Error('Unexpected fixture relay operation: '+operation.url);
      operation.onload({status:200,responseText:JSON.stringify(result),finalUrl:operation.url});
     },10);
     return {abort(){clearTimeout(timer);}};
    };
    window.insertNativeForm=()=>{
     const balance=options.balance===undefined?'12500000.25':String(options.balance);
     const balanceText='$'+Number(balance).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
     const section=document.createElement('section');
     section.innerHTML='<form><input name="searchAccount" data-testid="autocomplete-input" value=""><div class="torn-react-autocomplete"></div><p class="formTitle___fixture">Select a member</p><div class="input-money-group"><input aria-label="How much money would you like to give to this player?" data-testid="legacy-money-input" data-money="20000000" value="0"><input type="hidden" data-testid="legacy-money-input" data-money="20000000" value="0"></div><input id="give-money" type="radio" checked><input id="add-money-to-balance" type="radio"><button type="submit">give money</button></form><ul><li class="listItem___fixture"><a href="/profiles.php?XID=123">Sample</a><a href="/factions.php?step=profile&ID=10">Faction</a><div class="editBalanceWrap___fixture"></div></li></ul>';
     const form=section.querySelector('form'),recipient=form.querySelector('[name="searchAccount"]');
     const money=form.querySelector('input[aria-label]'),hidden=form.querySelector('input[type="hidden"]');
     const editor=section.querySelector('.editBalanceWrap___fixture');
     editor.append(document.createTextNode(balanceText));
     const rowInputs=document.createElement('span');rowInputs.hidden=true;
     for(const type of ['text','hidden']){const input=document.createElement('input');input.type=type;input.dataset.testid='legacy-money-input';input.value=balance;rowInputs.append(input);}
     const edit=document.createElement('button');edit.type='button';edit.setAttribute('aria-label','Edit balance');edit.textContent='Edit';editor.append(rowInputs,edit);
     recipient.addEventListener('keyup',()=>{
      if(recipient.value!=='123')return;
      const publish=()=>{
      const list=form.querySelector('.torn-react-autocomplete');list.replaceChildren();
      // A similar name with the wrong ID must never win selection.
      for(const id of [456,123]){
       const option=document.createElement('button');option.type='button';option.className='item';option.textContent='Sample ['+id+']';
       option.addEventListener('click',()=>{
        nativeSelections++;recipient.value='Sample ['+id+']';
        form.querySelector('.formTitle___fixture').textContent='Sample`s current balance is '+balanceText;
        money.dataset.secondMoney=balance;hidden.dataset.secondMoney=balance;list.replaceChildren();
        if(options.selectionDraft){money.value='654';hidden.value='654';}
       });list.append(option);
      }
      };
      if(options.delayOptions)window.publishNativeOptions=publish;else publish();
     });
     money.addEventListener('keyup',()=>{hidden.value=money.value;moneyWrites.push(money.value);});
     form.addEventListener('submit',event=>{event.preventDefault();nativeSubmits++;});
     form.querySelector('button[type="submit"]').addEventListener('click',()=>nativeSubmitClicks++);
     if(options.draft){recipient.value='Other [456]';money.value='321';hidden.value='321';}
     document.querySelector('main').replaceChildren(section);
    };
   },{options,token,endpoint});
   await page.addScriptTag({content:source});
   await page.locator('#brh-token').waitFor({state:'attached'});
   assert.equal(await page.locator('#brh-token').inputValue(),token,'Discord link opens the Review payout view');
   await check(page);
   assert.equal(await page.evaluate(()=>nativeSubmits),0,'the helper never submits a native payout');
   assert.equal(await page.evaluate(()=>nativeSubmitClicks),0,'the helper never clicks Torn submit');
   const calls=await page.evaluate(()=>posts);
   assert.ok(calls.some(call=>call.url===endpoint+'/v1/identity'),'link verifies the logged-in banker without clicking Connect or Verify');
   assert.ok(calls.every(call=>[endpoint+'/v1/identity',endpoint+'/v1/requests/resolve'].includes(call.url)),'opening a link cannot send a new Discord request');
   assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[],'no real Torn, Discord or relay HTTP calls');
  }finally{await page.close();}
 }
 async function resolved(page){
  await page.getByRole('heading',{name:'Sample',exact:true}).waitFor();
  const calls=await page.evaluate(()=>posts.filter(call=>call.url.endsWith('/v1/requests/resolve')));
  assert.ok(calls.length>0,'Discord link resolves automatically');
  assert.ok(calls.every(call=>call.body.token===token),'only the token from the link is resolved');
 }
 const money=page=>page.locator('form:has(#give-money) input[aria-label="How much money would you like to give to this player?"]');
 const recipient=page=>page.locator('form:has(#give-money) input[name="searchAccount"]');
 const hiddenMoney=page=>page.locator('form:has(#give-money) input[type="hidden"][data-testid="legacy-money-input"]');

 await scenario({},async page=>{
  await resolved(page);
  assert.equal(await page.locator('#give-money').count(),0,'native form is still absent after the request resolves');
  await page.waitForTimeout(150);
  await page.evaluate(()=>insertNativeForm());
  await page.waitForFunction(()=>document.querySelector('#give-money')?.closest('form').querySelector('input[aria-label]').value==='5000000');
  assert.equal(await recipient(page).inputValue(),'Sample [123]','the exact requested member wins over the similar wrong-ID option');
  assert.equal(await hiddenMoney(page).inputValue(),'5000000','native keyup synchronizes the hidden amount');
  assert.equal(await page.evaluate(()=>nativeSelections),1,'native autocomplete is selected once');
  assert.deepEqual(await page.evaluate(()=>moneyWrites),['5000000'],'one automatic preparation after delayed native form hydration');
 });

 for(const [label,options] of [['request above member balance',{amount:20000000}],['zero member balance',{balance:'0'}]]){
  await scenario(options,async page=>{
   await resolved(page);await page.evaluate(()=>insertNativeForm());
   await page.locator('.brh-status[data-error="true"]').waitFor({state:'visible'});
   assert.equal(await money(page).inputValue(),'0',label+' cannot prepare money');
   assert.equal(await hiddenMoney(page).inputValue(),'0',label+' cannot prepare hidden money');
   assert.deepEqual(await page.evaluate(()=>moneyWrites),[],label+' never writes money');
  });
 }

 await scenario({banker:false},async page=>{
  await page.locator('.brh-status[data-error="true"]').waitFor({state:'visible'});
  assert.equal(await page.getByRole('button',{name:'Review payout',exact:true}).count(),0,'a non-banker link does not expose banker navigation');
  assert.equal(await page.locator('#brh-token').isVisible(),false,'a non-banker link keeps banker fields hidden');
  await page.evaluate(()=>insertNativeForm());await page.waitForTimeout(200);
  assert.equal(await money(page).inputValue(),'0','non-banker cannot prepare a payout');
  assert.equal(await page.evaluate(()=>nativeSelections),0,'non-banker cannot select a payout recipient');
  assert.equal(await page.evaluate(()=>posts.filter(call=>call.url.endsWith('/v1/requests/resolve')).length),0,'non-banker is denied before request resolution');
 });

 await scenario({},async page=>{
  await resolved(page);
  await page.getByRole('button',{name:'Close window',exact:true}).click();
  await page.evaluate(()=>insertNativeForm());await page.waitForTimeout(300);
  assert.equal(await recipient(page).inputValue(),'','closing before native hydration cancels recipient selection');
  assert.equal(await money(page).inputValue(),'0','a late native form cannot resurrect a cancelled payout');
  assert.deepEqual(await page.evaluate(()=>moneyWrites),[]);
 });

 await scenario({draft:true},async page=>{
  await resolved(page);await page.evaluate(()=>insertNativeForm());
  await page.locator('.brh-status[data-error="true"]').waitFor({state:'visible'});
  assert.equal(await recipient(page).inputValue(),'Other [456]','an existing manual recipient draft is preserved');
  assert.equal(await money(page).inputValue(),'321','an existing manual money draft is preserved');
  assert.equal(await hiddenMoney(page).inputValue(),'321');
  assert.deepEqual(await page.evaluate(()=>moneyWrites),[],'automatic preparation never overwrites a manual draft');
 });
 for(const edited of ['recipient','amount'])await scenario({delayOptions:true},async page=>{
  await resolved(page);await page.evaluate(()=>insertNativeForm());
  await page.waitForFunction(()=>typeof publishNativeOptions==='function');
  await page.evaluate(edited=>{const form=document.querySelector('#give-money').closest('form');if(edited==='recipient')form.querySelector('[name=searchAccount]').value='Other [456]';else{form.querySelector('input[aria-label]').value='321';form.querySelector('input[type=hidden]').value='321';}publishNativeOptions();},edited);
  await page.locator('.brh-status[data-error="true"]').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>nativeSelections),0,'intervening '+edited+' edit cancels autocomplete selection');
  assert.equal(await money(page).inputValue(),edited==='amount'?'321':'0');
  assert.equal(await recipient(page).inputValue(),edited==='recipient'?'Other [456]':'123');
  assert.deepEqual(await page.evaluate(()=>moneyWrites),[],'a draft typed during lookup is not overwritten');
 });
 await scenario({selectionDraft:true},async page=>{
  await resolved(page);await page.evaluate(()=>insertNativeForm());
  await page.locator('.brh-status[data-error="true"]').waitFor({state:'visible'});
  assert.equal(await money(page).inputValue(),'654','amount entered during recipient hydration is preserved');
  assert.equal(await hiddenMoney(page).inputValue(),'654');assert.deepEqual(await page.evaluate(()=>moneyWrites),[]);
 });
 console.log('PASS Discord link: automatic banker verification, resolve and delayed native prefill; balance caps, non-banker denial, cancellation and manual draft preservation; no submit.');
};
