// Local raffle UI: owns its draw archive and exports, never payment state.
function createWarPayoutRaffleUI({doc,env,readSnapshot,isActive}) {
  const R=WarPayoutRaffle,win=doc.defaultView,archive=R.createArchive(env);
  const fields=['hits','losses','assists','stalemates','defends','flat'];
  const labels={hits:'Per war hit',losses:'Per loss to enemy',assists:'Per assist',stalemates:'Per stalemate',defends:'Per successful defend',flat:'Per counted participant'};
  const presets={losses:{losses:1},hits:{hits:1},balanced:{hits:1,losses:1,assists:1,defends:1},equal:{flat:1}};
  const el=(tag,text)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const panel=el('div');panel.id='twpc-raffle-panel';panel.className='twpc-content';
  panel.innerHTML=`<section><h3>War raffle</h3><p>Tickets use the loaded enemy-only war counts. Losses mean enemy attacks that defeated your members.</p><label for="twpc-raffle-preset">Ticket preset<select id="twpc-raffle-preset"><option value="losses">Loss raffle</option><option value="hits">War hits</option><option value="balanced">Balanced activity</option><option value="equal">Equal entries</option><option value="custom">Custom weights</option></select></label>
  <details><summary>Ticket weights</summary><div class="twpc-grid twpc-two">${fields.map(field=>`<label for="twpc-raffle-weight-${field}">${labels[field]}<input id="twpc-raffle-weight-${field}" data-raffle-weight="${field}" type="number" min="0" max="1000000" step="0.0001" inputmode="decimal" value="${field==='losses'?1:0}"></label>`).join('')}</div><p>Weights can use up to four decimal places. Each member’s total is rounded down, then capped. Equal entries include only participants represented in the loaded counts.</p></details>
  <div class="twpc-grid twpc-two"><label for="twpc-raffle-winners">Winners<input id="twpc-raffle-winners" type="number" min="1" max="1000" step="1" value="1" inputmode="numeric"></label><label for="twpc-raffle-cap">Tickets per member cap<input id="twpc-raffle-cap" type="number" min="0" step="1" value="0" inputmode="numeric"></label><label for="twpc-raffle-min">Minimum tickets<input id="twpc-raffle-min" type="number" min="0" step="1" value="1" inputmode="numeric"></label></div><p>Cap 0 means unlimited. Zero-ticket members are excluded.</p>
  <p id="twpc-raffle-summary" aria-live="polite"></p><div class="twpc-actions"><button id="twpc-raffle-draw" class="twpc-primary" disabled>Draw winners</button><button id="twpc-raffle-new" disabled>New draw</button></div><p id="twpc-raffle-note" role="status"></p></section>
  <section><h3>Saved draw</h3><label for="twpc-raffle-saved">Draw history<select id="twpc-raffle-saved"><option value="">No saved draws</option></select></label><p id="twpc-raffle-context"></p><ol id="twpc-raffle-results" class="twpc-raffle-results" aria-live="polite"></ol><div class="twpc-actions"><button id="twpc-raffle-copy" disabled>Copy results</button><button id="twpc-raffle-export" disabled>Export draw</button></div></section>
  <details><summary>Entrants and first-pick odds</summary><p>These are chances on the first pick. Each winner’s tickets are removed before the next pick.</p><div class="twpc-table-scroll"><table id="twpc-raffle-odds"><thead><tr><th>Participant</th><th>Tickets</th><th>First pick</th></tr></thead><tbody></tbody></table></div><button id="twpc-raffle-csv" disabled>Export odds CSV</button></details>
  <details><summary>Randomness and saved records</summary><p>Draws use Web Crypto random values with rejection sampling, weighted by tickets, without replacement. Secure randomness must be available to draw. Each draw saves its original entrants, settings and ranked winners before displaying results.</p><p>Records stay separate from payout receipts. This is a local draw record, not an externally verified public lottery. Available-log completeness remains unverified. Up to 50 draws / 2 MiB are retained without automatic deletion.</p></details>`;
  const $=name=>panel.querySelector('#twpc-raffle-'+name);
  let active=false,disposed=false,ready=false,busy=false,loading=null,records=[],selectedId='',newFor='',newAfter=null,scopeKey='',revision=0;
  let currentPool=null,currentResult=null,exportUrl=null,exportTimer=null;
  const key=scope=>scope?`${scope.factionId}:${scope.warId}`:'';
  const foreground=()=>!disposed&&active&&isActive()&&doc.visibilityState!=='hidden';
  function note(text){$('note').textContent=text;}
  function releaseExport(){clearTimeout(exportTimer);exportTimer=null;if(exportUrl)win.URL.revokeObjectURL(exportUrl);exportUrl=null;}
  function settings(){
    const number=name=>{const raw=$(name).value.trim();if(!raw)throw Error('Enter a whole number for '+name+'.');return Number(raw);};
    return {weights:Object.fromEntries(fields.map(field=>[field,$('weight-'+field).value.trim()])),cap:number('cap'),min:number('min'),winners:number('winners')};
  }
  function syncSelection(snapshot){
    const nextKey=key(snapshot?.scope);
    if(nextKey!==scopeKey){scopeKey=nextKey;newFor='';newAfter=null;selectedId=records.find(record=>key(record.scope)===nextKey)?.id||'';revision++;}
    if(!selectedId&&scopeKey)selectedId=records.find(record=>key(record.scope)===scopeKey)?.id||'';
  }
  function render(){
    if(disposed||!active)return;
    const snapshot=readSnapshot();records=archive.list().reverse();syncSelection(snapshot);
    $('saved').replaceChildren();
    for(const record of records)$('saved').append(new win.Option(`War #${record.scope.warId} · faction ${record.scope.factionId} · ${new Date(record.createdAt).toLocaleString()}`,record.id));
    if(!records.length)$('saved').append(new win.Option('No saved draws',''));
    $('saved').value=selectedId;$('saved').disabled=!ready||busy;
    currentResult=records.find(record=>record.id===selectedId)||null;
    $('results').replaceChildren();$('context').textContent='';
    if(currentResult){
      $('context').textContent=`War #${currentResult.scope.warId} · faction ${currentResult.scope.factionId} · ${new Date(currentResult.createdAt).toLocaleString()} · ${currentResult.entries.length} entrants / ${currentResult.total.toLocaleString()} tickets. Saved settings and counts; API-log completeness unverified.`;
      for(const winner of currentResult.winners){const row=el('li'),name=el('strong',`${winner.name} [${winner.id}]`);row.append(name,el('span',` · ${winner.tickets.toLocaleString()} tickets`));$('results').append(row);}
    }
    for(const name of ['copy','export'])$(name).disabled=!currentResult;
    const prior=records.some(record=>key(record.scope)===scopeKey);
    $('new').disabled=!ready||busy||!snapshot||!prior||snapshot.live||newFor===scopeKey;
    $('draw').disabled=true;$('csv').disabled=true;currentPool=null;
    $('odds').querySelector('tbody').replaceChildren();
    if(!ready){$('summary').textContent='Loading saved draws…';note('The calculator stays available while records load.');return;}
    if(!snapshot){$('summary').textContent='Load a war from Calculate to preview tickets.';note('Saved draws remain available in history.');return;}
    try{
      const pool=R.pool(snapshot.rows,settings());currentPool=pool;
      $('summary').textContent=`${pool.entries.length} eligible members · ${pool.total.toLocaleString()} tickets${snapshot.live?' · live preview':''}`;
      const body=$('odds').querySelector('tbody');
      for(const entry of pool.entries){const row=el('tr');row.append(el('td',`${entry.name} [${entry.id}]`),el('td',String(entry.tickets)),el('td',(100*entry.tickets/pool.total).toFixed(2)+'%'));body.append(row);}
      $('csv').disabled=!pool.entries.length;
      if(snapshot.live){note('Live war: odds preview only. Load completed counts before drawing.');return;}
      if(!pool.entries.length){note('No member meets these ticket rules. Set a positive weight or lower the minimum.');return;}
      if(pool.settings.winners>pool.entries.length){note('Winner count exceeds eligible members. Lower the number of winners.');return;}
      if(typeof env.crypto?.getRandomValues!=='function'){note('Secure random generation is unavailable. Draws are disabled.');return;}
      if(prior&&newFor!==scopeKey){note('A draw is already saved for this war. New draw keeps the earlier result and asks for confirmation.');return;}
      $('draw').disabled=busy||!foreground();note(busy?'Drawing and saving…':'Ready. One draw selects the chosen number of unique winners and saves the result.');
    }catch(error){$('summary').textContent='Check ticket settings.';note(error.message);}
  }
  function init(){
    if(!loading)loading=archive.load(foreground).then(()=>{ready=true;if(!disposed)render();}).catch(()=>{loading=null;ready=false;if(!disposed&&active){$('summary').textContent='Saved draws unavailable.';note('Saved raffle records could not be read. Existing data was kept; drawing is disabled. Reopen Raffle to retry.');}});
    return loading;
  }
  function trusted(event){return event.isTrusted&&event.detail<=1&&!busy&&foreground();}
  async function draw(event){
    if(!trusted(event)||!ready||$('draw').disabled)return;
    const snapshot=readSnapshot(),selection=settings(),token=++revision,previousDrawId=newFor===scopeKey?newAfter:null;
    const stillCurrent=()=>foreground()&&revision===token&&readSnapshot()===snapshot;
    busy=true;render();
    try{
      if(!stillCurrent())throw Error('The selected war changed. Review it before drawing.');
      const record=R.draw(snapshot,selection,env.crypto);
      await archive.append(record,{active:stillCurrent,previousDrawId});
      records=archive.list();
      if(!stillCurrent())return;
      selectedId=record.id;newFor='';newAfter=null;render();note('Draw saved. Results stay fixed until you deliberately start a new draw.');
    }catch(error){if(!disposed&&active){const latest=archive.list().filter(record=>key(record.scope)===key(snapshot?.scope)).at(-1);if(latest&&latest.id!==previousDrawId){newFor='';newAfter=null;selectedId=latest.id;}render();note(error.message||'The draw could not be saved. Earlier records were kept.');}}
    finally{busy=false;if(!disposed&&active){const message=$('note').textContent;render();note(message);}}
  }
  function newDraw(event){
    if(!trusted(event)||!readSnapshot()||readSnapshot().live)return;
    if(!win.confirm('Start another raffle for this war? The previous saved draw will remain in history.'))return;
    newFor=scopeKey;newAfter=records.find(record=>key(record.scope)===scopeKey)?.id||null;revision++;render();
  }
  async function copy(){
    if(!currentResult)return;
    const record=currentResult,text=`War raffle #${record.scope.warId} · faction ${record.scope.factionId}\n${new Date(record.createdAt).toISOString()}\nDraw ${record.id}\n${record.entries.length} entrants · ${record.total} tickets\n${record.winners.map(winner=>`${winner.rank}. ${winner.name} [${winner.id}] · ${winner.tickets} tickets`).join('\n')}\nWeb Crypto · weighted without replacement. API-log completeness unverified.`;
    try{if(typeof env.GM_setClipboard==='function')await env.GM_setClipboard(text);else if(typeof GM_setClipboard==='function')await GM_setClipboard(text);else if(typeof env.GM?.setClipboard==='function')await env.GM.setClipboard(text);else await win.navigator.clipboard.writeText(text);note('Raffle results copied.');}catch(_){note('Could not copy. Export the draw instead.');}
  }
  async function download(text,name,type){
    try{
      if(env.flutter_inappwebview?.callHandler){await env.__PDA_platformReadyPromise;const bytes=new TextEncoder().encode(text);let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);await env.flutter_inappwebview.callHandler('shareFile',{base64Data:win.btoa(binary),fileName:name});}
      else{releaseExport();exportUrl=win.URL.createObjectURL(new Blob([text],{type}));const link=el('a');link.href=exportUrl;link.download=name;panel.append(link);link.click();link.remove();exportTimer=setTimeout(releaseExport,1000);}
      note('Raffle export prepared.');
    }catch(_){note('Could not export the raffle. Try Copy results.');}
  }
  $('draw').addEventListener('click',draw);$('new').addEventListener('click',newDraw);
  for(const name of ['draw','new'])$(name).addEventListener('keydown',event=>{if(event.repeat)event.preventDefault();});
  $('copy').addEventListener('click',copy);
  $('export').addEventListener('click',()=>{if(currentResult)download(JSON.stringify(currentResult,null,2),'war-raffle-'+currentResult.scope.warId+'-'+currentResult.id+'.json','application/json');});
  $('csv').addEventListener('click',()=>{if(currentPool)download(R.oddsCsv(currentPool),'war-raffle-'+readSnapshot().scope.warId+'-odds.csv','text/csv;charset=utf-8');});
  $('saved').addEventListener('change',()=>{selectedId=$('saved').value;render();});
  $('preset').addEventListener('change',()=>{const preset=presets[$('preset').value];if(preset)for(const field of fields)$('weight-'+field).value=preset[field]??0;revision++;render();});
  panel.addEventListener('input',event=>{if(event.target.matches('input')){if(event.target.dataset.raffleWeight)$('preset').value='custom';revision++;render();}});
  return {panel,refresh:render,show(){if(disposed)return;active=true;render();init();},hide(){active=false;revision++;releaseExport();},destroy(){disposed=true;active=false;revision++;releaseExport();panel.remove();}};
}
