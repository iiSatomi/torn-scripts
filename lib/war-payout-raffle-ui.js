// Local raffle UI: owns its draw archive and exports, never payment state.
function createWarPayoutRaffleUI({doc,env,readSnapshot,isActive}) {
  const R=WarPayoutRaffle,win=doc.defaultView,archive=R.createArchive(env);
  const fields=['hits','losses','assists','stalemates','defends','flat'];
  const labels={hits:'Per war hit',losses:'Per loss to enemy',assists:'Per assist',stalemates:'Per stalemate',defends:'Per successful defend',flat:'Per counted participant'};
  const presets={losses:{losses:1},hits:{hits:1},balanced:{hits:1,losses:1,assists:1,defends:1},equal:{flat:1}};
  const el=(tag,text)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const panel=el('div');panel.id='twpc-raffle-panel';panel.className='twpc-content';
  panel.innerHTML=`<section><h3>Host a war raffle</h3><p>Choose a preset and winner count. The default is one ticket per loss to the enemy.</p><label for="twpc-raffle-preset">Ticket preset<select id="twpc-raffle-preset"><option value="losses">Loss raffle</option><option value="hits">War hits</option><option value="balanced">Balanced activity</option><option value="equal">Equal entries</option><option value="custom">Custom weights</option></select></label>
<label for="twpc-raffle-winners">Winners<input id="twpc-raffle-winners" type="number" min="1" max="1000" step="1" value="1" inputmode="numeric"></label>
  <details class="twpc-raffle-advanced" id="twpc-raffle-advanced"><summary>Advanced: ticket weights and limits</summary><div class="twpc-grid twpc-two">${fields.map(field=>`<label for="twpc-raffle-weight-${field}">${labels[field]}<input id="twpc-raffle-weight-${field}" data-raffle-weight="${field}" type="number" min="0" max="1000000" step="0.0001" inputmode="decimal" value="${field==='losses'?1:0}"></label>`).join('')}</div><p>Weights can use up to four decimal places. Each member\u2019s total is rounded down, then capped. Equal entries include only participants represented in the loaded counts.</p><div class="twpc-grid twpc-two"><label for="twpc-raffle-cap">Tickets per member cap<input id="twpc-raffle-cap" type="number" min="0" step="1" value="0" inputmode="numeric"></label><label for="twpc-raffle-min">Minimum tickets<input id="twpc-raffle-min" type="number" min="0" step="1" value="1" inputmode="numeric"></label></div><p>Cap 0 means unlimited. Zero-ticket members are excluded.</p></details>
  <p id="twpc-raffle-summary" aria-live="polite"></p><div class="twpc-actions"><button id="twpc-raffle-draw" class="twpc-primary" disabled>Draw winners</button><button id="twpc-raffle-new" disabled>New draw</button></div><p id="twpc-raffle-note" role="status"></p></section>
  <section><h3>Saved draw</h3><label for="twpc-raffle-saved">Draw history<select id="twpc-raffle-saved"><option value="">No saved draws</option></select></label><button id="twpc-raffle-refresh-saved" type="button" disabled>Refresh saved draws</button><p id="twpc-raffle-refresh-status" role="status"></p><p id="twpc-raffle-context"></p><details class="twpc-raffle-display" id="twpc-raffle-display"><summary>Winner display</summary><p>These choices only change the on-screen list for this page, not saved draws or exports.</p><label for="twpc-raffle-emoji">Winner emoji<select id="twpc-raffle-emoji"><option value="none">None (default)</option><option value="trophy">Trophy</option><option value="star">Star</option></select></label><label class="twpc-checkbox"><input id="twpc-raffle-chance" type="checkbox"> Show chance on each pick</label></details><ol id="twpc-raffle-results" class="twpc-raffle-results" aria-live="polite"></ol><div class="twpc-actions"><button id="twpc-raffle-replay" type="button" disabled>Replay saved draw</button><button id="twpc-raffle-copy" type="button" aria-describedby="twpc-raffle-copy-status" disabled>Copy results</button><button id="twpc-raffle-export" disabled>Export draw</button></div><p id="twpc-raffle-copy-status" role="status"></p><p id="twpc-raffle-export-status" class="twpc-raffle-export-status" role="status"></p></section>
  <details><summary>Entrants and first-pick odds</summary><p>These are chances on the first pick. Each winner\u2019s tickets are removed before the next pick.</p><div class="twpc-table-scroll"><table id="twpc-raffle-odds"><thead><tr><th>Participant</th><th>Tickets</th><th>First pick</th></tr></thead><tbody></tbody></table></div><button id="twpc-raffle-csv" disabled>Export odds CSV</button><p id="twpc-raffle-csv-status" class="twpc-raffle-export-status" role="status"></p></details>
  <details><summary>Randomness and saved records</summary><p>Draws use Web Crypto random values with rejection sampling, weighted by tickets, without replacement. Secure randomness must be available to draw. Each draw saves its original entrants, settings and ranked winners before displaying results.</p><p>Records stay separate from payout receipts. This is a local draw record, not an externally verified public lottery. Available-log completeness remains unverified. Up to 50 draws / 2 MiB are retained without automatic deletion.</p></details>`;
  const $=name=>panel.querySelector('#twpc-raffle-'+name);
  let active=false,disposed=false,ready=false,busy=false,loading=null,records=[],selectedId='',newFor='',newAfter=null,scopeKey='',revision=0,refreshRequest=null,loadFailed=false,saveUncertain=false;
  let currentPool=null,currentResult=null,exportUrl=null,exportTimer=null,renderedSnapshot=null,renderedExportSettings=null,exportJob=null,exportFeedback=null,copyJob=null,copyFeedback=null;
  const key=scope=>scope?`${scope.factionId}:${scope.warId}`:'';
  const foreground=()=>!disposed&&active&&isActive()&&doc.visibilityState!=='hidden';
  function note(text){$('note').textContent=text;}
  function refreshStatus(text){$('refresh-status').textContent=text;}
  const audience=createSavedRaffleAudience({doc,win,panel,button:$('replay'),appearance:()=>({emoji:$('emoji').value,chance:$('chance').checked}),isActive:foreground});
  function releaseExport(){clearTimeout(exportTimer);exportTimer=null;if(exportUrl)win.URL.revokeObjectURL(exportUrl);exportUrl=null;}
  function settings(){
    const number=name=>{const raw=$(name).value.trim();if(!raw)throw Error('Enter a whole number for '+name+'.');return Number(raw);};
    return {weights:Object.fromEntries(fields.map(field=>[field,$('weight-'+field).value.trim()])),cap:number('cap'),min:number('min'),winners:number('winners')};
  }
  function syncSelection(snapshot){
    const nextKey=key(snapshot?.scope);
    if(nextKey!==scopeKey){scopeKey=nextKey;newFor='';newAfter=null;selectedId=records.find(record=>key(record.scope)===nextKey)?.id||'';revision++;}
    if(!records.some(record=>record.id===selectedId))selectedId=records.find(record=>key(record.scope)===scopeKey)?.id||'';
  }
  function renderWinners(){
    const target=$('results');target.replaceChildren();
    if(!currentResult)return;
    const badges={trophy:'\u{1f3c6}',star:'\u{2b50}'},choice=$('emoji').value;
    const badge=Object.hasOwn(badges,choice)?badges[choice]:'';
    const showChance=$('chance').checked;
    for(const winner of currentResult.winners){
      const row=el('li');
      if(badge){const icon=el('span',badge);icon.className='twpc-raffle-badge';icon.setAttribute('aria-hidden','true');row.append(icon);}
      const chanceLabel=raffleSavedChance(winner);
      const chance=showChance?` · ${chanceLabel} chance on this pick`:'';
      row.append(el('strong',`${winner.name} [${winner.id}]`),el('span',` · ${winner.tickets.toLocaleString()} tickets${chance}`));target.append(row);
    }
  }
  function render(){try{renderPanel();}finally{syncExport();syncCopy();}}
  function renderPanel(){
    if(disposed||!active)return;
    const snapshot=readSnapshot();renderedSnapshot=snapshot;records=archive.list().reverse();syncSelection(snapshot);
    $('saved').replaceChildren();
    for(const record of records)$('saved').append(new win.Option(`War #${record.scope.warId} · faction ${record.scope.factionId} · ${new Date(record.createdAt).toLocaleString()}`,record.id));
    if(!records.length)$('saved').append(new win.Option(ready?'No saved draws':loadFailed?'Saved draws unavailable':'Loading saved draws',''));
    $('refresh-saved').disabled=!foreground()||busy||!!refreshRequest||(!ready&&!loadFailed);
    $('saved').value=selectedId;$('saved').disabled=!ready||busy;
    currentResult=records.find(record=>record.id===selectedId)||null;
    audience.sync(currentResult,ready&&!busy&&!refreshRequest&&foreground());
    $('context').textContent='';
    if(currentResult){
      $('context').textContent=`War #${currentResult.scope.warId} · faction ${currentResult.scope.factionId} · ${new Date(currentResult.createdAt).toLocaleString()} · ${currentResult.entries.length} entrants / ${currentResult.total.toLocaleString()} tickets. Saved settings and counts; API-log completeness unverified.`;
    }
    renderWinners();

    const prior=records.some(record=>key(record.scope)===scopeKey);
    $('new').disabled=!ready||busy||saveUncertain||!!refreshRequest||!snapshot||!prior||snapshot.live||newFor===scopeKey;
    $('draw').disabled=true;currentPool=null;renderedExportSettings=null;
    $('odds').querySelector('tbody').replaceChildren();
    if(!ready){
      $('summary').textContent=loadFailed?'Saved draws unavailable.':'Loading saved draws.';
      note(loadFailed?'Saved raffle records could not be read. Existing data was kept; drawing is disabled. Use Refresh saved draws to retry.':'The calculator stays available while records load.');return;
    }
    if(!snapshot){$('summary').textContent='Load a war from Calculate to preview tickets.';note('Saved draws remain available in history.');return;}
    try{
      const rules=settings(),pool=R.pool(snapshot.rows,rules);currentPool=pool;renderedExportSettings=JSON.stringify(rules);
      $('summary').textContent=`${pool.entries.length} eligible members · ${pool.total.toLocaleString()} tickets${snapshot.live?' · live preview':''}`;
      const body=$('odds').querySelector('tbody');
      for(const entry of pool.entries){const row=el('tr');row.append(el('td',`${entry.name} [${entry.id}]`),el('td',String(entry.tickets)),el('td',R.firstPickLabel(entry.tickets,pool.total)));body.append(row);}
      if(saveUncertain){note('Could not verify the saved raffle. Use Refresh saved draws before drawing again.');return;}
      if(snapshot.live){note('Live war: odds preview only. Load completed counts before drawing.');return;}
      if(!pool.entries.length){note('No member meets these ticket rules. Set a positive weight or lower the minimum.');return;}
      if(pool.settings.winners>pool.entries.length){note('Winner count exceeds eligible members. Lower the number of winners.');return;}
      if(typeof env.crypto?.getRandomValues!=='function'){note('Secure random generation is unavailable. Draws are disabled.');return;}
      if(prior&&newFor!==scopeKey){note('A draw is already saved for this war. New draw keeps the earlier result and asks for confirmation.');return;}
      $('draw').disabled=busy||!!refreshRequest||!foreground();note(busy?'Drawing and saving…':'Ready. One draw selects the chosen number of unique winners and saves the result.');
    }catch(error){$('summary').textContent='Check ticket settings.';note(error.message);}
  }
  function init(){
    if(!ready&&!loading){
      loadFailed=false;
      loading=archive.load(foreground).then(()=>{ready=true;render();}).catch(()=>{loading=null;loadFailed=true;render();});
    }
    return loading;
  }
  async function refreshDraws(event){
    if(!event.isTrusted||busy||refreshRequest||!foreground()||$('refresh-saved').disabled)return;
    const attempt={};refreshRequest=attempt;
    const activeRead=()=>refreshRequest===attempt&&foreground();
    refreshStatus('Refreshing saved draws...');render();
    try{
      if(!await archive.refresh(activeRead)||!activeRead())return;
      ready=true;loadFailed=false;saveUncertain=false;
      const all=archive.list();
      if(newFor&&([...all].reverse().find(record=>key(record.scope)===newFor)?.id??null)!==newAfter){newFor='';newAfter=null;revision++;}
      refreshStatus(all.length?'Saved draws refreshed.':'No saved draws found.');
    }catch(_){
      if(activeRead())refreshStatus(ready?'Could not refresh saved draws. Previously loaded results are unchanged. Try again.':'Could not read saved draws. Try again.');
    }finally{
      if(refreshRequest===attempt){refreshRequest=null;if(foreground())render();}
    }
  }
  function trusted(event){return event.isTrusted&&event.detail<=1&&!busy&&!refreshRequest&&foreground();}
  async function draw(event){
    if(!trusted(event)||!ready||$('draw').disabled)return;
    const snapshot=readSnapshot(),selection=settings(),token=++revision,previousDrawId=newFor===scopeKey?newAfter:null;
    const stillCurrent=()=>foreground()&&revision===token&&readSnapshot()===snapshot;
    let feedback=null;busy=true;render();
    try{
      if(!stillCurrent())throw Error('The selected war changed. Review it before drawing.');
      const record=R.draw(snapshot,selection,env.crypto);
      await archive.append(record,{active:stillCurrent,previousDrawId});
      records=archive.list();
      if(!stillCurrent())return;
      selectedId=record.id;newFor='';newAfter=null;feedback='Draw saved. Results stay fixed until you deliberately start a new draw.';
    }catch(error){
      if(error?.raffleSaveUncertain){saveUncertain=true;newFor='';newAfter=null;}
      if(stillCurrent()){
        const latest=archive.list().filter(record=>key(record.scope)===key(snapshot?.scope)).at(-1);
        if(!saveUncertain&&latest&&latest.id!==previousDrawId){newFor='';newAfter=null;selectedId=latest.id;}
        feedback=error.message||'The draw could not be saved. Earlier records were kept.';
      }
    }finally{
      busy=false;
      if(!disposed&&active){render();if(feedback&&stillCurrent())note(feedback);}
    }
  }
  function newDraw(event){
    if(!trusted(event)||!readSnapshot()||readSnapshot().live)return;
    if(!win.confirm('Start another raffle for this war? The previous saved draw will remain in history.'))return;
    newFor=scopeKey;newAfter=records.find(record=>key(record.scope)===scopeKey)?.id||null;revision++;render();
  }
  function copySource(){
    if(!currentResult||$('saved').value!==currentResult.id)return null;
    const record=currentResult,text=`War raffle #${record.scope.warId} · faction ${record.scope.factionId}\n${new Date(record.createdAt).toISOString()}\nDraw ${record.id}\n${record.entries.length} entrants · ${record.total} tickets\n${record.winners.map(winner=>`${winner.rank}. ${winner.name} [${winner.id}] · ${winner.tickets} tickets`).join('\n')}\nWeb Crypto · weighted without replacement. API-log completeness unverified.`;
    return {id:record.id,text};
  }
  function ownsCopy(job,source=copySource()){
    return !!job&&!job.retired&&foreground()&&!!source&&source.id===job.id&&source.text===job.text;
  }
  function retireCopy(){
    if(copyJob)copyJob.retired=true;
    copyFeedback=null;$('copy-status').textContent='';
  }
  function syncCopy(){
    const source=copyJob||copyFeedback?copySource():null;
    if(copyJob&&!ownsCopy(copyJob,source))copyJob.retired=true;
    if(copyFeedback&&!ownsCopy(copyFeedback,source)){copyFeedback=null;$('copy-status').textContent='';}
    const button=$('copy');button.disabled=!!copyJob||!currentResult||!foreground();
    if(copyJob)button.setAttribute('aria-busy','true');else button.removeAttribute('aria-busy');
  }
  function copyStatus(job,message){
    if(copyJob!==job||!ownsCopy(job))return;
    copyFeedback=job;$('copy-status').textContent=message;
  }
  async function copy(event){
    if(!event.isTrusted||copyJob||!foreground()||$('copy').disabled)return;
    const job=copySource();if(!job)return;
    copyJob=job;copyStatus(job,'Copying saved results...');syncCopy();
    const fail=()=>copyStatus(job,'Could not copy the saved results. Use Export draw instead.');
    try{
      const manager=env.GM_info?.scriptHandler||env.GM?.info?.scriptHandler;
      const pda=!!(env.flutter_inappwebview||win.flutter_inappwebview||env.__PDA_platformReadyPromise||env.PDA_storage||env.PDA_getTabState||env.PDA_httpGet||env.__tornpda)||manager==='Torn PDA';
      const clipboard=win.navigator.clipboard,canObserve=typeof clipboard?.writeText==='function';
      let receipt;
      // PDA's legacy wrapper may discard a rejected writeText promise. Use
      // the observable path when present; never auto-retry a sent write.
      if(pda&&canObserve)receipt=clipboard.writeText(job.text);
      else if(typeof env.GM?.setClipboard==='function')receipt=env.GM.setClipboard(job.text);
      else if(typeof env.GM_setClipboard==='function')receipt=env.GM_setClipboard(job.text);
      else if(typeof GM_setClipboard==='function')receipt=GM_setClipboard(job.text);
      else if(canObserve)receipt=clipboard.writeText(job.text);
      else {fail();return;}
      if(typeof receipt?.then!=='function'){
        copyStatus(job,'Could not confirm the clipboard write. Try pasting, or use Export draw.');return;
      }
      const reply=await receipt;
      if(reply===false||reply?.status==='error'){fail();return;}
      copyStatus(job,'Raffle results copied.');
    }catch(_){fail();}
    finally{if(copyJob===job){copyJob=null;if(!disposed)syncCopy();}}
  }
  function exportSettings(){
    try{return JSON.stringify(settings());}catch(_){return null;}
  }
  function exportSource(kind){
    if(kind==='export'){
      if(!currentResult||$('saved').value!==currentResult.id)return null;
      const {id,scope}=currentResult;
      return {kind,id,text:JSON.stringify(currentResult,null,2),name:'war-raffle-'+scope.warId+'-'+id+'.json',mime:'application/json',label:'Saved draw file'};
    }
    const snapshot=readSnapshot(),stamp=exportSettings();
    if(!snapshot||snapshot!==renderedSnapshot||!currentPool?.entries.length||!stamp||stamp!==renderedExportSettings)return null;
    return {kind,snapshot,stamp,text:R.oddsCsv(currentPool),name:'war-raffle-'+snapshot.scope.warId+'-odds.csv',mime:'text/csv;charset=utf-8',label:'Odds CSV'};
  }
  function ownsExport(job){
    if(!job||job.retired||!foreground())return false;
    if(job.kind==='export')return currentResult?.id===job.id&&$('saved').value===job.id&&JSON.stringify(currentResult,null,2)===job.text;
    return readSnapshot()===job.snapshot&&renderedSnapshot===job.snapshot&&!!currentPool?.entries.length&&renderedExportSettings===job.stamp&&exportSettings()===job.stamp;
  }
  function exportStatus(job,text){
    if(!ownsExport(job))return;
    exportFeedback=job;
    $(job.kind==='export'?'export-status':'csv-status').textContent=text;
  }
  function clearExportStatus(){
    exportFeedback=null;$('export-status').textContent='';$('csv-status').textContent='';
  }
  function retireExport(){
    clearExportStatus();
    if(exportJob){
      exportJob.retired=true;
      // If handed to the bridge, no second share can start until it settles.
      // Before handoff it is safe to release the lane; a resumed wait cannot issue.
      if(!exportJob.started)exportJob=null;
    }
  }
  function syncExport(){
    if(exportJob&&!ownsExport(exportJob))retireExport();
    else if(exportFeedback&&!ownsExport(exportFeedback))clearExportStatus();
    $('export').disabled=!foreground()||!!exportJob||!currentResult;
    $('csv').disabled=!foreground()||!!exportJob||!currentPool?.entries.length;
  }
  async function download(kind,event){
    if(!event.isTrusted||exportJob||!foreground()||$(kind).disabled)return;
    const source=exportSource(kind);
    if(!source)return;
    const job={...source,started:false,retired:false};
    exportJob=job;clearExportStatus();syncExport();
    const stillCurrent=()=>exportJob===job&&ownsExport(job);
    const initialBridge=env.flutter_inappwebview;
    const manager=env.GM_info?.scriptHandler||env.GM?.info?.scriptHandler;
    const pda=!!(initialBridge||env.__PDA_platformReadyPromise||env.PDA_storage||env.PDA_getTabState||env.PDA_httpGet||env.__tornpda)||manager==='Torn PDA';
    const failed=()=>exportStatus(job,pda?'Could not hand off the '+(kind==='export'?'saved draw file':'odds CSV')+'. Try again or download on desktop.':'Could not start the raffle download. Try again.');
    try{
      if(pda){
        exportStatus(job,'Opening the PDA share menu...');
        await env.__PDA_platformReadyPromise;
        if(!stillCurrent())return;
        const bridge=env.flutter_inappwebview||win.flutter_inappwebview;
        if(typeof bridge?.callHandler!=='function'){failed();return;}
        const bytes=new TextEncoder().encode(job.text);
        let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
        job.started=true;
        const reply=await bridge.callHandler('shareFile',{base64Data:win.btoa(binary),fileName:job.name});
        if(!stillCurrent())return;
        if(reply?.status==='success')exportStatus(job,job.label+' handed to the PDA share menu. Choose where to save or share it.');
        else failed();
      }else{
        releaseExport();exportUrl=win.URL.createObjectURL(new Blob([job.text],{type:job.mime}));
        const link=el('a');link.href=exportUrl;link.download=job.name;
        try{panel.append(link);link.click();}
        finally{link.remove();exportTimer=setTimeout(releaseExport,1000);}
        exportStatus(job,'Raffle export prepared.');
      }
    }catch(_){if(stillCurrent())failed();}
    finally{if(exportJob===job){exportJob=null;syncExport();}}
  }
  $('draw').addEventListener('click',draw);$('new').addEventListener('click',newDraw);$('refresh-saved').addEventListener('click',refreshDraws);
  for(const name of ['draw','new'])$(name).addEventListener('keydown',event=>{if(event.repeat)event.preventDefault();});
  $('copy').addEventListener('click',copy);
  $('export').addEventListener('click',event=>{void download('export',event);});
  $('csv').addEventListener('click',event=>{void download('csv',event);});
  $('saved').addEventListener('change',()=>{selectedId=$('saved').value;render();});
  $('preset').addEventListener('change',()=>{const preset=presets[$('preset').value];if(preset)for(const field of fields)$('weight-'+field).value=preset[field]??0;revision++;render();});
  $('emoji').addEventListener('change',renderWinners);$('chance').addEventListener('change',renderWinners);
  panel.addEventListener('input',event=>{if(event.target.matches('input')&&event.target!==$('chance')){if(event.target.dataset.raffleWeight)$('preset').value='custom';revision++;render();}});
  return {panel,refresh:render,show(){if(disposed)return;active=true;init();render();},hide(){active=false;retireExport();retireCopy();audience.close();refreshRequest=null;refreshStatus('');revision++;releaseExport();},destroy(){disposed=true;active=false;retireExport();retireCopy();audience.destroy();refreshRequest=null;revision++;releaseExport();panel.remove();}};
}
