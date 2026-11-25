// Owns one reviewed run and one active credit tab. No gameplay request originates
// here except through the native adapter following a fresh trusted click.
function createWarPayoutCreditUI({dialog,env,readDraft,awake,onMessage,onLayout=()=>{},nativeAdapter,isOpen=()=>dialog.open}) {
  const C=WarPayoutCredits;
  const doc=dialog.ownerDocument,win=doc.defaultView;
  const store=C.createStore(env);
  let controller=null,owner=false,active=false,disposed=false,releaseOwner=null,ownerGeneration=0,acquiring=false,lockedHtmlRevision=0,lockedPngRevision=0,rememberedRun=null;
  let exportUrl=null,exportTimer=null,ledgerJob=null,ledgerStatusSnapshot=null;
  const money=value=>'$'+Number(value).toLocaleString('en-US');
  const el=(tag,text)=>{const value=doc.createElement(tag);if(text!==undefined)value.textContent=text;return value;};
  const panel=el('div');panel.id='twpc-credit-panel';panel.className='twpc-content';panel.hidden=true;
  panel.innerHTML=`<section><p>One click credits one member\u2019s faction balance.</p><p id="twpc-credit-note" role="status"></p></section>
  <section><label class="twpc-checkbox"><input id="twpc-credit-reviewed" type="checkbox">I checked the amounts and the available-log draft.</label><div class="twpc-actions"><button id="twpc-credit-lock" class="twpc-primary">Lock payouts</button></div></section>
  <section><p id="twpc-credit-summary" aria-live="polite"></p><button id="twpc-credit-next" class="twpc-primary" disabled>Credit next member</button><div class="twpc-table-scroll" style="margin-top:8px"><table id="twpc-credit-members"><thead><tr><th>Member</th><th>War hits</th><th>Enemy losses</th><th>Credit</th><th>Status</th><th>Action</th></tr></thead><tbody></tbody></table></div></section>
  <details id="twpc-credit-recovery"><summary>Saved runs / recovery</summary><label for="twpc-credit-saved">Saved payout run<select id="twpc-credit-saved"><option value="">No saved runs</option></select></label><p id="twpc-credit-run"></p><div class="twpc-actions"><button id="twpc-credit-own">Reload saved runs</button></div><div id="twpc-locked-posting" class="twpc-posting" role="group" aria-labelledby="twpc-locked-posting-title"><h4 id="twpc-locked-posting-title">Share a locked payout sheet</h4><p class="twpc-locked-posting-help">Amounts are fixed. Check the credit statuses before sharing; locked does not mean paid.</p><div class="twpc-posting-image-copy"><button id="twpc-credit-copy-forum-png" type="button" class="twpc-primary" aria-describedby="twpc-locked-copy-help twpc-credit-forum-copy-status" disabled>Copy forum image</button><p id="twpc-locked-copy-help">Copies the styled image without saving a file. Tap again when it is ready.</p><p id="twpc-credit-forum-copy-status" class="twpc-copy-image-status" role="status"></p></div><div class="twpc-actions"><button id="twpc-credit-sheet-forum-png" type="button" aria-describedby="twpc-credit-png-download-status" disabled>Download locked forum PNG instead</button></div><details id="twpc-locked-more-formats"><summary>Other sheet formats</summary><div class="twpc-actions"><button id="twpc-credit-sheet" type="button" disabled>Download locked sheet</button><button id="twpc-credit-sheet-png" type="button" aria-describedby="twpc-credit-png-download-status" disabled>Download locked PNG</button></div></details><p id="twpc-credit-png-download-status" role="status"></p></div><div id="twpc-locked-records" role="group" aria-labelledby="twpc-locked-records-title"><h4 id="twpc-locked-records-title">Private recovery file</h4><p id="twpc-locked-records-help">Ledger JSON contains member IDs, amounts and credit states. Keep it out of the forum post.</p><button id="twpc-credit-export" type="button" aria-describedby="twpc-locked-records-help twpc-credit-export-status" disabled>Export ledger JSON</button><p id="twpc-credit-export-status" role="status"></p></div><p>Only ended wars with actual profit can be locked. Amounts stay fixed. If a credit needs review, check Torn\u2019s balance/history before marking it credited or unpaid. Never retry an uncertain credit without checking.</p></details>`;
  dialog.append(panel);
  const find=name=>panel.querySelector('#twpc-credit-'+name);
  function note(message){find('note').textContent=message;}
  function lockedPngNote(message){find('png-download-status').textContent=message;}
  function retireLockedPng(){lockedPngRevision++;lockedPngNote('');}
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
    find('export').disabled=!canExportLedger(run);retireChangedLedger(run);find('sheet').disabled=find('sheet-png').disabled=find('sheet-forum-png').disabled=!run||!active||!!run.busy||!run.entries.length;find('next').disabled=true;
    find('copy-forum-png').disabled=!owner||find('sheet-forum-png').disabled;
    lockedForumClipboard?.retireIfStale();
    if(!run){find('run').textContent='No locked run. Review the current calculator amounts to start.';find('summary').textContent='';find('next').textContent='Credit next member';if(owner)note('Review the actual-profit calculation and lock its member amounts.');onLayout();return;}
    find('run').textContent=`Faction ${run.scope.factionId} · war #${run.scope.warId} · locked version ${run.version}.`;
    const entries=run.entries,credited=entries.filter(entry=>entry.status==='credited'),pending=entries.filter(entry=>entry.status==='pending');
    find('summary').textContent=`${credited.length}/${entries.length} members credited · Credited ${money(credited.reduce((sum,e)=>sum+e.amount,0))} · Pending ${money(pending.reduce((sum,e)=>sum+e.amount,0))}.`;
    const next=nextEligible(run);
    const creditingEntry=entries.find(entry=>entry.status==='crediting');
    find('next').textContent=run.busy&&creditingEntry?`Crediting ${creditingEntry.name} — wait for confirmation`:run.blocked&&!run.busy?'Review the uncertain credit first':next?`Credit next: ${next.name} [${next.id}] — ${money(next.amount)}`:pending.length?'No eligible pending member on this page':'No pending member credits';
    find('next').disabled=!next||!!run.busy||!!run.blocked||!available(run,next);
    const inspection=nativeAdapter.inspect(run.scope,next);
    if(owner&&active)note(run.busy?'A payout operation is in progress. Wait for its result.':run.blocked?'A credit result needs review. Check Torn\u2019s balance/history and reconcile it before continuing.':inspection.reason||'Ready for one member credit per click.');
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
  async function change(work){retireLedger();lockedHtmlRevision++;retireLockedPng();lockedForumClipboard?.invalidate();try{await work();render();}catch(error){render();note(error.message||'Could not update the credit ledger.');}}
  async function credit(memberId,event){
    if(!event.isTrusted||event.detail>1||!owner||!active||!awake())return;
    const run=current(),entry=run?.entries.find(value=>value.id===memberId);
    if(!entry||!available(run,entry))return;
    // Resuming the window must not revive work from a released ownership epoch.
    const attemptGeneration=ownerGeneration;
    const isCurrent=()=>attemptGeneration===ownerGeneration&&owner&&active&&!disposed;
    await change(()=>controller.credit(memberId,{trusted:true,available:()=>isCurrent()&&available(run,entry),submit:operation=>nativeAdapter.submit({...operation,isCurrent})}));
  }
  function acquire(){
    if(disposed||!active||!awake()||!doc.hasFocus()||owner||acquiring)return;
    if(typeof win.navigator.locks?.request!=='function'){note('This browser cannot establish single-tab ownership. Credit submission stays disabled.');render();return;}
    const token=++ownerGeneration;acquiring=true;note('Loading the saved credit ledger.');render();
    const valid=()=>token===ownerGeneration&&active&&!disposed&&awake()&&doc.hasFocus();
    win.navigator.locks.request('torn-war-payout-credit-owner-v1',{mode:'exclusive',ifAvailable:true},async lock=>{
      if(!valid())return;
      if(!lock){note('Another tab owns member crediting. Close its payout tab, then retry ownership here.');return;}
      const local=C.createController({store,onChange:render});
      controller=local;
      try{await local.init();}catch(error){note(error.message||'Credit ledger storage is unavailable.');return;}
      if(!valid()){await local.stop();return;}
      if(rememberedRun&&local.listRuns().some(run=>run.key===rememberedRun))local.select(rememberedRun);
      await new Promise(resolve=>{releaseOwner=resolve;owner=true;render();});
      releaseOwner=null;owner=false;
    }).catch(()=>{owner=false;note('Could not acquire credit ownership. Submission remains disabled.');}).finally(()=>{
      acquiring=false;render();
      // A foreground event can arrive before stop finishes releasing our own lock.
      // Retry only on that new lifecycle, never against another tab's held lock.
      if(token!==ownerGeneration&&active&&!disposed&&awake())acquire();
    });
  }
  async function lock(){
    if(!owner||!find('reviewed').checked)return;
    await change(async()=>{const draft=readDraft();if(!draft)throw new Error('Load an ended war and valid actual-profit calculation first.');await controller.lock(draft);find('reviewed').checked=false;});
  }
  function pause(){
    retireLedger();lockedHtmlRevision++;retireLockedPng();lockedForumClipboard?.invalidate();active=false;ownerGeneration++;owner=false;
    clearExport();
    const run=current(),release=releaseOwner;
    if(run&&release)rememberedRun=run.scope.factionId+':'+run.scope.warId;
    const stopped=release?controller?.stop():null;
    Promise.resolve(stopped).catch(()=>note('A stopped credit could not be saved. Review Torn\u2019s balance/history before continuing.')).finally(()=>{release?.();});
    render();
  }
  function show(){active=true;panel.hidden=false;render();acquire();}
  function hide(){panel.hidden=true;pause();}
  find('reviewed').addEventListener('change',render);find('lock').addEventListener('click',event=>{if(event.isTrusted&&event.detail<=1)lock();});
  find('next').addEventListener('keydown',event=>{if(event.repeat)event.preventDefault();});find('next').addEventListener('click',event=>{const next=nextEligible(current());if(next)credit(next.id,event);});
  find('own').addEventListener('click',()=>{if(awake()){active=true;acquire();}});
  find('saved').addEventListener('change',()=>change(()=>controller.select(find('saved').value)));
  function clearExport(){clearTimeout(exportTimer);exportTimer=null;if(exportUrl)URL.revokeObjectURL(exportUrl);exportUrl=null;}
  for(const [id,png,compact] of [['sheet',false,false],['sheet-png',true,false],['sheet-forum-png',true,true]])find(id).addEventListener('click',async event=>{
    const run=current();if(!event.isTrusted||!active||!awake()||!isOpen()||!run||run.busy||find(id).disabled)return;
    const exact=JSON.stringify(run),revision=png?lockedPngRevision:++lockedHtmlRevision;
    const stillCurrent=()=>!disposed&&active&&awake()&&isOpen()&&JSON.stringify(current())===exact&&(png?lockedPngRevision:lockedHtmlRevision)===revision;
    try{
      const html=WarPayoutSheet.build({scope:run.scope,result:run.result,rows:run.entries,kind:'locked'});
      const saved=await (png?WarPayoutSheetPng:WarPayoutSheet).deliver({doc,env,html,fileName:'war-payout-'+run.scope.warId+'-locked'+(compact?'-forum.png':png?'.png':'.html'),stillCurrent,compact});
      if(saved&&stillCurrent())(png?lockedPngNote:note)(png?WarPayoutSheetPng.outcome(saved,true):saved==='native'?'Locked sheet handed to the PDA share menu. Choose where to save or share it.':'Locked payout sheet prepared. Review it before sharing.');
    }catch(error){if(stillCurrent())(png?lockedPngNote:note)(png?WarPayoutSheetPng.message(error):'Could not hand off the locked HTML sheet. Try Download locked sheet again, or download it on desktop. The ledger is unchanged.');}
  });
  function canExportLedger(run){
    return !!run&&!run.busy&&!disposed&&owner&&active&&awake()&&isOpen();
  }
  function ledgerStatus(message='',snapshot=null){
    find('export-status').textContent=message;
    ledgerStatusSnapshot=snapshot;
  }
  function retireLedger(){
    if(ledgerJob){
      ledgerJob.retired=true;
      if(!ledgerJob.sent){ledgerJob=null;find('export').removeAttribute('aria-busy');}
    }
    ledgerStatus();
  }
  function ledgerIsCurrent(job,run=current()){
    return ledgerJob===job&&!job.retired&&canExportLedger(run)&&ownerGeneration===job.generation&&JSON.stringify(run,null,2)===job.text;
  }
  function retireChangedLedger(run){
    if(ledgerJob&&!ledgerJob.retired&&!ledgerIsCurrent(ledgerJob,run)){retireLedger();return;}
    if(ledgerStatusSnapshot&&(!canExportLedger(run)||JSON.stringify(run,null,2)!==ledgerStatusSnapshot))ledgerStatus();
  }
  find('export').addEventListener('click',async event=>{
    const run=current();
    if(!event.isTrusted||ledgerJob||!canExportLedger(run))return;
    const button=find('export'),text=JSON.stringify(run,null,2),fileName='war-credit-ledger-'+run.scope.warId+'.json';
    const job={text,generation:ownerGeneration,retired:false,sent:false};
    ledgerJob=job;ledgerStatus();button.setAttribute('aria-busy','true');
    const manager=String(env.GM_info?.scriptHandler??'').trim();
    const pda=!!(env.flutter_inappwebview||env.__PDA_platformReadyPromise||env.PDA_storage||env.PDA_getTabState||env.PDA_httpGet||env.__tornpda)||manager==='Torn PDA';
    try{
      if(pda){
        await env.__PDA_platformReadyPromise;
        if(!ledgerIsCurrent(job))return;
        const bridge=env.flutter_inappwebview;
        if(typeof bridge?.callHandler!=='function')throw new Error('Unavailable PDA bridge');
        let binary='';for(const byte of new TextEncoder().encode(text))binary+=String.fromCharCode(byte);
        job.sent=true;
        const reply=await bridge.callHandler('shareFile',{base64Data:btoa(binary),fileName});
        if(!ledgerIsCurrent(job))return;
        if(reply?.status!=='success')throw new Error('Missing PDA acknowledgement');
        ledgerStatus('Ledger handed to the PDA share menu. Choose where to save it.',text);
      }else{
        if(!ledgerIsCurrent(job))return;
        clearExport();exportUrl=URL.createObjectURL(new Blob([text],{type:'application/json'}));
        const link=el('a');link.href=exportUrl;link.download=fileName;panel.append(link);
        try{link.click();}finally{link.remove();exportTimer=setTimeout(clearExport,1000);}
        if(ledgerIsCurrent(job))ledgerStatus('Ledger download started.',text);
      }
    }catch(_){
      if(ledgerIsCurrent(job))ledgerStatus(pda?'Could not hand off the ledger. Try Export ledger JSON again, or download it on desktop.':'Could not start the ledger download. Try Export ledger JSON again.',text);
    }finally{
      if(ledgerJob===job){ledgerJob=null;button.removeAttribute('aria-busy');}
    }
  });
  const lockedForumClipboard=WarPayoutSheetPng.createClipboard({doc,button:find('copy-forum-png'),locked:true,note:message=>{find('forum-copy-status').textContent=message;},readNote:()=>find('forum-copy-status').textContent,readSource(){
    const run=current();if(!owner||!active||!awake()||!isOpen()||!run||run.busy)return null;
    const exact=JSON.stringify(run);
    return {current:()=>!disposed&&owner&&active&&awake()&&isOpen()&&JSON.stringify(current())===exact,
      html:()=>WarPayoutSheet.build({scope:run.scope,result:run.result,rows:run.entries,kind:'locked'})};
  }});
  const blur=()=>{if(active){pause();active=true;}};const focus=()=>{if(active&&awake()&&isOpen()){render();acquire();}};win.addEventListener('blur',blur);win.addEventListener('focus',focus);
  return {panel,show,hide,pause,refresh:render,resetReview(){find('reviewed').checked=false;},isActive:()=>active&&owner&&!disposed&&isOpen(),destroy(){pause();disposed=true;win.removeEventListener('blur',blur);win.removeEventListener('focus',focus);panel.remove();}};
}
