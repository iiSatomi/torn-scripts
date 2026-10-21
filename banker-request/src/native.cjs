'use strict';
// Contract inspected read-only on Torn Controls > Give to User, 2026-10-15.
// Native autocomplete prepares only a verified banker request, never submission.
function createBankerNativeAdapter({doc,win,awake=()=>true,onGuard=()=>{}}){
  const domain=typeof BankerRequestDomain==='object'?BankerRequestDomain:require('./domain.cjs');
  const page=typeof unsafeWindow!=='undefined'?unsafeWindow:win;
  const pageDoc=page.document||doc;
  let disposed=false,pending=false,prepared=null,cancelWait=null,revision=0;
  function visible(el){return !!el?.isConnected&&el.getClientRects().length>0&&page.getComputedStyle(el).visibility==='visible';}
  function route(){return !disposed&&awake()&&doc.visibilityState!=='hidden'&&doc.hasFocus()&&win.location.hostname==='www.torn.com'&&win.location.pathname==='/factions.php'&&new URLSearchParams(win.location.search).get('step')==='your'&&/(?:^|[\/#&])tab=controls(?:&|$)/.test(win.location.hash);}
  function sameLink(link,path,key,id){try{const url=new URL(link.href);return url.origin==='https://www.torn.com'&&url.pathname===path&&Number(url.searchParams.get(key))===id;}catch(_){return false;}}
  function formParts(){
    const radio=pageDoc.getElementById('give-money'),form=radio?.closest('form');
    if(!form||!visible(form)||!radio.checked||radio.disabled)throw new Error('Open Controls > Give to User and select Give money.');
    const recipients=form.querySelectorAll('input[name="searchAccount"]');
    const amounts=form.querySelectorAll('input[aria-label="How much money would you like to give to this player?"][data-testid="legacy-money-input"]');
    const hidden=form.querySelectorAll('input[type="hidden"][data-testid="legacy-money-input"]');
    const submit=form.querySelectorAll('button[type="submit"]');
    if(recipients.length!==1||amounts.length!==1||hidden.length!==1||submit.length!==1||!visible(recipients[0])||!visible(amounts[0])||amounts[0].disabled)throw new Error('The native payout form changed. Use Torn manually.');
    return {form,recipient:recipients[0],amount:amounts[0],hidden:hidden[0],submit:submit[0]};
  }
  function rowBalance(request){
    const section=pageDoc.getElementById('add-money-to-balance')?.closest('section');
    if(!section||!visible(section))throw new Error('Current member balances are unavailable.');
    const rows=[...section.querySelectorAll('li')].filter(row=>[...row.querySelectorAll('a[href*="profiles.php"]')].some(a=>sameLink(a,'/profiles.php','XID',request.userId)));
    if(rows.length!==1||!visible(rows[0]))throw new Error('The requested member balance is missing or ambiguous.');
    const row=rows[0];
    if(row.querySelector('[class*="inactive___"]')||![...row.querySelectorAll('a[href*="factions.php"]')].some(a=>sameLink(a,'/factions.php','ID',request.factionId)))throw new Error('The member is no longer in this faction.');
    const editor=row.querySelector('[class*="editBalanceWrap"]');
    const edit=editor?.querySelector('button[aria-label="Edit balance"]');
    if(!editor||!visible(editor)||!edit||edit.disabled||editor.querySelector('button[aria-label="Save balance"]'))throw new Error('Finish the native balance edit before prefilling.');
    const text=[...editor.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim();
    const balance=domain.parseCents(text);
    const inputs=[...editor.querySelectorAll('input[data-testid="legacy-money-input"]')];
    if(inputs.length!==2||inputs.some(input=>domain.parseCents(input.value)!==balance))throw new Error('The member balance has an unfinished edit.');
    return balance;
  }
  function snapshot(request){
    if(!route())throw new Error('Actively view faction Controls before prefilling.');
    const parts=formParts();
    if(parts.recipient.value.trim()!==request.name+' ['+request.userId+']')throw new Error('Select the exact requested recipient in Torn first.');
    const balance=rowBalance(request),data=parts.amount.getAttribute('data-second-money'),hidden=parts.hidden.getAttribute('data-second-money');
    if(data===null||hidden===null||domain.parseCents(data)!==balance||domain.parseCents(hidden)!==balance)throw new Error('The selected recipient balance is unavailable or changing.');
    const title=parts.form.querySelector('[class*="formTitle"]')?.textContent||'';
    const expected=request.name+'`s current balance is ';
    if(!title.startsWith(expected)||domain.parseCents(title.slice(expected.length))!==balance)throw new Error('The native recipient balance could not be verified.');
    const value={userId:request.userId,factionId:request.factionId,balanceCents:balance,observedAt:Date.now()};
    return {...parts,snapshot:value,plan:domain.payoutPlan(request,value)};
  }
  function inspect(request){try{const current=snapshot(request);return {ready:true,plan:current.plan,reason:'Current recipient and member balance verified.'};}catch(error){return {ready:false,reason:error.message};}}
  function write(input,value){
    const setter=Object.getOwnPropertyDescriptor(page.HTMLInputElement.prototype,'value')?.set;
    if(!setter)throw new Error('Native input support is unavailable.');
    setter.call(input,value);input.dispatchEvent(new page.Event('input',{bubbles:true}));
    input.dispatchEvent(new page.KeyboardEvent('keyup',{key:'0',code:'Digit0',bubbles:true}));
    input.dispatchEvent(new page.Event('change',{bubbles:true}));
  }
  function waitFor(check,timeoutMessage='Torn did not finish selecting this recipient. Select them manually and try again.'){
    return new Promise((resolve,reject)=>{
      const start=Date.now();let timer=null,observer=null,done=false;
      const finish=(error,result)=>{if(done)return;done=true;if(timer!==null)win.clearTimeout(timer);observer?.disconnect();cancelWait=null;error?reject(error):resolve(result);};
      const tick=()=>{if(!route())return finish(new Error('Payout context changed.'));try{const found=check();if(found)return finish(null,found);}catch(error){return finish(error);}if(Date.now()-start>=6000)return finish(new Error(timeoutMessage));if(timer!==null)win.clearTimeout(timer);timer=win.setTimeout(tick,80);};
      cancelWait=()=>finish(new Error('Payout preparation cancelled.'));
      observer=new page.MutationObserver(tick);observer.observe(pageDoc.getElementById('give-money')?.closest('form')||pageDoc.body,{childList:true,subtree:true,attributes:true});tick();
    });
  }
  function clearPrepared(release=true){
    const own=prepared;if(release)prepared=null;if(!own)return;
    try{if(own.amount.isConnected&&domain.parseCents(own.amount.value)===BigInt(own.plan.amount)*100n)write(own.amount,'0');}catch(_){}
  }
  function guard(event){
    if(!prepared)return;
    const target=event.target;
    const isSubmit=event.type==='submit'&&target===prepared.form;
    const isClick=event.type==='click'&&target?.closest?.('button[type="submit"]')===prepared.submit;
    if(!isSubmit&&!isClick)return;
    let reason='The payout changed. Review this request again.';
    try{if(prepared.invalid)throw new Error(reason);const current=snapshot(prepared.request);if(current.form===prepared.form&&current.amount===prepared.amount&&current.plan.balanceCents===prepared.plan.balanceCents&&current.plan.amount===prepared.plan.amount&&domain.parseCents(current.amount.value)===BigInt(prepared.plan.amount)*100n&&domain.parseCents(current.hidden.value)===BigInt(prepared.plan.amount)*100n)return;}catch(error){reason=error.message;}
    event.preventDefault();event.stopImmediatePropagation();prepared.invalid=true;clearPrepared(false);onGuard(reason);
  }
  pageDoc.addEventListener('click',guard,true);pageDoc.addEventListener('submit',guard,true);
  async function prefill(raw,{waitForForm=false}={}){
    if(pending)return {ready:false,reason:'Payout preparation is already running.'};
    pending=true;clearPrepared(false);const own=++revision;let parts=null,wrote=false;
    try{
      const request=domain.readRequest(raw);if(request.status!=='sent'||!route())throw new Error('This payout is not ready for native preparation.');
      if(waitForForm)await waitFor(()=>{try{formParts();rowBalance(request);return true;}catch(_){return false;}},'Open Controls > Give to User and select Give money, then try prefilling again.');
      if(own!==revision)throw new Error('Payout preparation cancelled.');
      parts=formParts();
      if(domain.parseCents(parts.amount.value||'0')!==0n||domain.parseCents(parts.hidden.value||'0')!==0n)throw new Error('Clear the existing native money draft before prefilling.');
      // Verify this member belongs to the current faction before native lookup.
      domain.payoutPlan(request,{userId:request.userId,factionId:request.factionId,balanceCents:rowBalance(request),observedAt:Date.now()});
      if(parts.recipient.value.trim()!==request.name+' ['+request.userId+']'){
        if(parts.recipient.value.trim())throw new Error('Clear the existing native recipient draft before prefilling.');
        write(parts.recipient,String(request.userId));
        const option=await waitFor(()=>{
          const candidates=[...parts.form.querySelectorAll('.torn-react-autocomplete button.item')].filter(el=>visible(el)&&el.textContent.trim()===request.name+' ['+request.userId+']');
          if(candidates.length>1)throw new Error('Torn returned ambiguous recipients.');return candidates[0];
        });
        if(!route()||own!==revision)throw new Error('Payout context changed.');
        if(parts.recipient.value.trim()!==String(request.userId))throw new Error('The native recipient draft changed during lookup. Review it and try again.');
        if(domain.parseCents(parts.amount.value||'0')!==0n||domain.parseCents(parts.hidden.value||'0')!==0n)throw new Error('The native money draft changed during lookup. Clear it before prefilling.');
        option.click();
        await waitFor(()=>parts.recipient.value.trim()===request.name+' ['+request.userId+']'&&parts.amount.hasAttribute('data-second-money'));
      }
      if(own!==revision)throw new Error('Payout preparation cancelled.');
      const before=snapshot(request),plan=before.plan;
      if(domain.parseCents(before.amount.value||'0')!==0n||domain.parseCents(before.hidden.value||'0')!==0n)throw new Error('The native money draft changed during lookup. Clear it before prefilling.');
      if(plan.balanceCents!==rowBalance(request))throw new Error('The member balance changed.');
      write(before.amount,String(plan.amount));wrote=true;
      const after=snapshot(request);
      if(after.form!==before.form||after.amount!==before.amount||after.plan.balanceCents!==plan.balanceCents||after.plan.amount!==plan.amount||domain.parseCents(after.amount.value)!==BigInt(plan.amount)*100n||domain.parseCents(after.hidden.value)!==BigInt(plan.amount)*100n)throw new Error('The payout or balance changed during preparation.');
      prepared={...after,request,label:request.name+' ['+request.userId+']'};
      return {ready:true,plan,reason:'Form prefilled. Review it in Torn and submit manually.'};
    }catch(error){if(wrote&&parts)try{write(parts.amount,'0');}catch(_){}return {ready:false,reason:error.message};}
    finally{pending=false;}
  }
  function cancel(){revision++;cancelWait?.();}
  function dispose(){disposed=true;cancel();clearPrepared();pageDoc.removeEventListener('click',guard,true);pageDoc.removeEventListener('submit',guard,true);}
  return {inspect,prefill,cancel,dispose};
}
module.exports={createBankerNativeAdapter};
