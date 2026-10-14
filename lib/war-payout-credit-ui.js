// Owns one reviewed run and one active credit tab. No gameplay request originates
// here except through the native adapter following a fresh trusted click.
function createWarPayoutCreditUI({dialog,env,readDraft,awake,onMessage,onLayout=()=>{},nativeAdapter,isOpen=()=>dialog.open}) {
  const C=WarPayoutCredits;
  const doc=dialog.ownerDocument,win=doc.defaultView;
  const store=C.createStore(env);
  let controller=null,owner=false,active=false,disposed=false,releaseOwner=null,ownerGeneration=0,acquiring=false;
  let exportUrl=null,exportTimer=null;
  const money=value=>'$'+Number(value).toLocaleString('en-US');
  const el=(tag,text)=>{const value=doc.createElement(tag);if(text!==undefined)value.textContent=text;return value;};
  const panel=el('div');panel.id='twpc-credit-panel';panel.className='twpc-content';panel.hidden=true;
  panel.innerHTML=`<section><p>One click credits one member’s faction balance.</p><p id="twpc-credit-note" role="status"></p></section>
  <section><label class="twpc-checkbox"><input id="twpc-credit-reviewed" type="checkbox">I checked the amounts and the available-log draft.</label><div class="twpc-actions"><button id="twpc-credit-lock" class="twpc-primary">Lock payouts</button></div></section>
  <section><p id="twpc-credit-summary" aria-live="polite"></p><button id="twpc-credit-next" class="twpc-primary" disabled>Credit next member</button><div class="twpc-table-scroll" style="margin-top:8px"><table id="twpc-credit-members"><thead><tr><th>Member</th><th>War hits</th><th>Enemy losses</th><th>Credit</th><th>Status</th><th>Action</th></tr></thead><tbody></tbody></table></div></section>
  <details id="twpc-credit-recovery"><summary>Saved runs / recovery</summary><label for="twpc-credit-saved">Saved payout run<select id="twpc-credit-saved"><option value="">No saved runs</option></select></label><p id="twpc-credit-run"></p><div class="twpc-actions"><button id="twpc-credit-own">Reload saved runs</button><button id="twpc-credit-export" disabled>Export ledger</button></div><p>Only ended wars with actual profit can be locked. Amounts stay fixed. If a credit needs review, check Torn’s balance/history before marking it credited or unpaid. Never retry an uncertain credit without checking.</p></details>`;
  dialog.append(panel);
  const find=name=>panel.querySelector('#twpc-credit-'+name);
  function note(message){find('note').textContent=message;}
  const statuses={pending:'Pending',crediting:'Crediting',credited:'Credited','needs-review':'Needs review',skipped:'Skipped'};
  function current(){return controller?.snapshot()||null;}
  function available(run,entry){return owner&&active&&awake()&&doc.hasFocus()&&!!nativeAdapter.inspect(run.scope,entry).ready;}
  function nextEligible(run){return run?.entries.find(entry=>entry.status==='pending'&&entry.amount>0&&available(run,entry))||null;}
  function actionButton(label,handler,disabled){const button=el('button',label);button.type='button';button.disabled=disabled;button.addEventListener('keydown',event=>{if(event.repeat)event.preventDefault();});button.addEventListener('click',event=>{if(event.isTrusted&&event.detail<=1)handler(event);});return button;}
  function render(){
    if(disposed)return;
    const run=current(),body=find('members').querySelector('tbody');body.replaceChildren();
    const saved=find('saved');saved.replaceChildren();
    for(const record of controller?.listRuns()||[])saved.append(new Option(`Faction ${record.scope.factionId} · war #${record.scope.warId}${record.blocked?' · needs review':''}`,record.key));
    if(!saved.children.length)saved.append(new Option('No saved runs',''));
    if(run)saved.value=run.scope.factionId+':'+run.scope.warId;
    saved.disabled=!owner||!!run?.busy;
    find('own').disabled=owner||acquiring;
    find('lock').disabled=!owner||!active||!awake()||!find('reviewed').checked||!!run?.busy;
    find('export').disabled=!run;find('next').disabled=true;
    if(!run){find('run').textContent='No locked run. Review the current calculator amounts to start.';find('summary').textContent='';find('next').textContent='Credit next member';if(owner)note('Review the actual-profit calculation and lock its member amounts.');onLayout();return;}
    find('run').textContent=`Faction ${run.scope.factionId} · war #${run.scope.warId} · locked version ${run.version}.`;
    const entries=run.entries,credited=entries.filter(entry=>entry.status==='credited'),pending=entries.filter(entry=>entry.status==='pending');
    find('summary').textContent=`${credited.length}/${entries.length} members credited · Credited ${money(credited.reduce((sum,e)=>sum+e.amount,0))} · Pending ${money(pending.reduce((sum,e)=>sum+e.amount,0))}.`;
    const next=nextEligible(run);
    const creditingEntry=entries.find(entry=>entry.status==='crediting');
    find('next').textContent=run.busy&&creditingEntry?`Crediting ${creditingEntry.name} — wait for confirmation`:run.blocked&&!run.busy?'Review the uncertain credit first':next?`Credit next: ${next.name} [${next.id}] — ${money(next.amount)}`:pending.length?'No eligible pending member on this page':'No pending member credits';
    find('next').disabled=!next||!!run.busy||!!run.blocked||!available(run,next);
    const inspection=nativeAdapter.inspect(run.scope,next);
    if(owner&&active)note(run.busy?'A payout operation is in progress. Wait for its result.':run.blocked?'A credit result needs review. Check Torn’s balance/history and reconcile it before continuing.':inspection.reason||'Ready for one member credit per click.');
    for(const entry of entries){
      const row=el('tr');row.dataset.status=entry.status;for(const value of [`${entry.name} [${entry.id}]`,entry.hits??entry.counts?.hits??0,entry.losses??entry.counts?.losses??0,money(entry.amount),statuses[entry.status]||entry.status])row.append(el('td',String(value)));
      const cell=el('td');const disabled=!owner||!active||!!run.busy;
      if(entry.status==='pending'){
        cell.append(actionButton('Credit '+money(entry.amount),event=>credit(entry.id,event),disabled||!!run.blocked||!available(run,entry)));
        cell.append(actionButton('Skip',()=>change(()=>controller.skip(entry.id)),disabled));
      }else if(entry.status==='needs-review'){
        cell.append(actionButton('Verified credited',()=>change(()=>controller.reconcile(entry.id,{status:'credited'})),disabled));
        cell.append(actionButton('Verified not credited',()=>change(()=>controller.reconcile(entry.id,{status:'pending'})),disabled));
      }
      row.append(cell);body.append(row);
    }
    onLayout();
  }
  async function change(work){try{await work();render();}catch(error){render();note(error.message||'Could not update the credit ledger.');}}
  async function credit(memberId,event){
    if(!event.isTrusted||event.detail>1||!owner||!active||!awake())return;
    const run=current(),entry=run?.entries.find(value=>value.id===memberId);
    if(!entry||!available(run,entry))return;
    // Resuming the window must not revive work from a released ownership epoch.
    const attemptGeneration=ownerGeneration;
    const isCurrent=()=>attemptGeneration===ownerGeneration&&owner&&active&&!disposed;
    await change(()=>controller.credit(memberId,{trusted:true,available:()=>isCurrent()&&available(run,entry),submit:operation=>nativeAdapter.submit({...operation,isCurrent})}));
  }
  async function acquire(){
    if(disposed||!active||!awake()||owner||acquiring)return;
    if(typeof win.navigator.locks?.request!=='function'){note('This browser cannot establish single-tab ownership. Credit submission stays disabled.');render();return;}
    const token=++ownerGeneration;acquiring=true;note('Loading the saved credit ledger…');
    win.navigator.locks.request('torn-war-payout-credit-owner-v1',{mode:'exclusive',ifAvailable:true},async lock=>{
      acquiring=false;
      if(!lock){note('Another tab owns member crediting. Close its payout tab, then retry ownership here.');render();return;}
      if(token!==ownerGeneration||!active||disposed)return;
      owner=true;controller=C.createController({store,onChange:render});
      try{await controller.init();}catch(error){owner=false;note(error.message||'Credit ledger storage is unavailable.');render();return;}
      if(token!==ownerGeneration||!active||disposed){await controller.stop();owner=false;return;}
      render();await new Promise(resolve=>{releaseOwner=resolve;});releaseOwner=null;owner=false;
    }).catch(()=>{acquiring=false;owner=false;note('Could not acquire credit ownership. Submission remains disabled.');render();});
  }
  async function lock(){
    if(!owner||!find('reviewed').checked)return;
    await change(async()=>{const draft=readDraft();if(!draft)throw new Error('Load an ended war and valid actual-profit calculation first.');await controller.lock(draft);find('reviewed').checked=false;});
  }
  function pause(){
    active=false;ownerGeneration++;owner=false;
    clearExport();
    const stopped=controller?.stop();
    Promise.resolve(stopped).catch(()=>note('A stopped credit could not be saved. Review Torn’s balance/history before continuing.')).finally(()=>{releaseOwner?.();});
    render();
  }
  function show(){active=true;panel.hidden=false;render();acquire();}
  function hide(){panel.hidden=true;pause();}
  find('reviewed').addEventListener('change',render);find('lock').addEventListener('click',event=>{if(event.isTrusted&&event.detail<=1)lock();});
  find('next').addEventListener('keydown',event=>{if(event.repeat)event.preventDefault();});find('next').addEventListener('click',event=>{const next=nextEligible(current());if(next)credit(next.id,event);});
  find('own').addEventListener('click',()=>{if(awake()){active=true;acquire();}});
  find('saved').addEventListener('change',()=>change(()=>controller.select(find('saved').value)));
  function clearExport(){clearTimeout(exportTimer);exportTimer=null;if(exportUrl)URL.revokeObjectURL(exportUrl);exportUrl=null;}
  find('export').addEventListener('click',async()=>{
    const run=current();if(!run)return;
    const text=JSON.stringify(run,null,2),fileName='war-credit-ledger-'+run.scope.warId+'.json';
    try{
      if(env.flutter_inappwebview?.callHandler){await env.__PDA_platformReadyPromise;let binary='';for(const byte of new TextEncoder().encode(text))binary+=String.fromCharCode(byte);await env.flutter_inappwebview.callHandler('shareFile',{base64Data:btoa(binary),fileName});return;}
      clearExport();exportUrl=URL.createObjectURL(new Blob([text],{type:'application/json'}));const link=el('a');link.href=exportUrl;link.download=fileName;panel.append(link);link.click();link.remove();exportTimer=setTimeout(clearExport,1000);
    }catch(_){note('Could not export the credit ledger. No member credit was submitted.');}
  });
  const blur=()=>{if(active)pause();};win.addEventListener('blur',blur);
  return {panel,show,hide,pause,refresh:render,resetReview(){find('reviewed').checked=false;},isActive:()=>active&&owner&&!disposed&&isOpen(),destroy(){pause();disposed=true;win.removeEventListener('blur',blur);panel.remove();}};
}
