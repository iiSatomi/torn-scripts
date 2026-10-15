// Runs entirely in this userscript's private closure. The Hub only opens its menu.
function installWarPayoutCalculator() {
  const D = WarPayoutDomain;
  const id = 'war-payout-calculator';
  const env = getHubPlatformEnvironment();
  const warCache = WarPayoutCache.createCache({...env,isActive:()=>awake()&&!!shell?.ui.getState().active});
  const privateStore = createHubCredentialStorage(env, 'twpc-private-v1');
  const credentialClient = createHubCredentialClient({storage: privateStore, crypto: globalThis.crypto, scriptId: id});
  const metrics = ['hits', 'losses', 'assists', 'stalemates', 'defends'];
  const labels = {hits:'War hits', losses:'Losses to enemy', assists:'Assists', stalemates:'Stalemates', defends:'Successful defends'};
  let dialog, style, opener, snapshot = null, wars = [], job = null, sharedKey = null, personalKey = '', revision = 0;
  let creditUI=null, raffleUI=null, shell=null, selectedTab='calculator';
  let disposed = false, attached = false, pdaActive = true, current = null, estimate = null, generation = 0, draftEdited = false;
  let localKeyRevision = 0;
  let keyPolicyReady=false,hubManaged=false,hubFallback=false;
  let keyPersistence = Promise.resolve();
  let exportUrl = null, exportTimer = null, savedPrefs = null;
  let cacheReady = null, cacheLoaded = false, cacheIssue = '', reportSource = '';
  const $ = name => dialog?.querySelector('#twpc-' + name);
  const money = value => '$' + Number(value).toLocaleString('en-US');
  const awake = () => !disposed && attached && document.visibilityState !== 'hidden' && pdaActive && (!shell || shell.ui.getState().active);
  const key = () => sharedKey || (keyPolicyReady&&!hubManaged?personalKey:'');
  const number = (name, allowBlank = false) => {
    const raw = $(name)?.value.trim();
    if (allowBlank && !raw) return undefined;
    if (!raw || !Number.isFinite(Number(raw))) throw new Error('Enter a valid number for ' + ($(name)?.labels?.[0]?.textContent || name) + '.');
    return Number(raw);
  };
  const node = (tag, text, className) => { const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el; };
  function status(text) { if ($('status')) $('status').textContent = text; }
  function releaseExport() { clearTimeout(exportTimer);exportTimer=null;if(exportUrl)URL.revokeObjectURL(exportUrl);exportUrl=null; }
  function cancel(text = 'Loading cancelled. Load again when ready.') {
    generation++;
    if (job) { job.abort(); job=null; status(text); }
    busy(false);
  }
  function busy(value) {
    if (!dialog) return;
    for (const name of ['list-wars','load','war']) $(name).disabled=value||(name==='load'&&!$('war').value);
    $('cancel-load').hidden=!value;
    dialog.setAttribute('aria-busy',String(value));
    raffleUI?.refresh();
  }
  function clearSnapshot() { snapshot=null;current=null;reportSource='';updateCoverage();recalculate(); }
  function resetCacheRows() {
    if(!$('cache-rows'))return;
    $('cache-rows').replaceChildren();addCache();
  }
  // Native storage calls can complete out of order. Queue replacements and
  // deletion together so a delayed save cannot resurrect a forgotten key.
  function persistPersonalKey(value) {
    const operation=keyPersistence.then(()=>value===null?privateStore.delete('personal-key'):privateStore.set('personal-key',value));
    keyPersistence=operation.catch(()=>false);
    return operation;
  }
  function resetConnectionData() {
    wars=cacheLoaded?warCache.list():[];renderWars();resetCacheRows();clearSnapshot();
  }
  const warKey=war=>`${war.factionId}:${war.warId}`;
  const choice=war=>wars.filter(item=>item.warId===war.warId).length>1?warKey(war):String(war.warId);
  function mergeWars(remote,factionId) {
    const combined=new Map((cacheLoaded?warCache.list():[]).filter(war=>!factionId||war.factionId===factionId).map(war=>[warKey(war),war]));
    for(const war of remote)combined.set(warKey(war),war);
    wars=[...combined.values()].sort((a,b)=>b.start-a.start);
  }
  function renderWars(selected) {
    if(!$('war'))return;
    selected=selected||wars.find(war=>choice(war)===$('war').value);
    $('war').replaceChildren(new Option(wars.length?'Select a war':'Sync wars or reopen a saved report',''));
    for(const war of wars){
      let saved=null;try{if(cacheLoaded)saved=warCache.get(war);}catch(_){}
      const state=war.end?saved?' · saved':'':war.start>Math.floor(Date.now()/1000)?' · scheduled':saved?' · live snapshot':' · live';
      const faction=wars.filter(item=>item.warId===war.warId).length>1?` · faction ${war.factionId}`:'';
      $('war').append(new Option(`${war.opponentName} · ${new Date(war.start*1000).toISOString().slice(0,10)}${state}${faction}`,choice(war)));
    }
    if(selected&&wars.some(war=>warKey(war)===warKey(selected)))$('war').value=choice(wars.find(war=>warKey(war)===warKey(selected)));
    if($('cache-delete-war')){
      const previous=$('cache-delete-war').value;
      $('cache-delete-war').replaceChildren(new Option('Select saved war',''));
      for(const war of warCache.list())$('cache-delete-war').append(new Option(`${war.opponentName} · war #${war.warId} · faction ${war.factionId}`,warKey(war)));
      $('cache-delete-war').value=previous;
      $('cache-delete').disabled=!$('cache-delete-war').value;
      $('cache-storage-note').textContent=cacheIssue||`${warCache.list().length} / 50 saved wars. Saves counts and reward quantities; payout receipts are kept separately. Refresh scans again. Live snapshots are provisional.`;
    }
    busy(!!job);
  }
  function hydrateCache() {
    if(!cacheReady)cacheReady=warCache.load().then(()=>{cacheLoaded=true;},error=>{cacheIssue=WarPayoutCache.message(error);});
    return cacheReady;
  }
  function showSavedWars() {
    hydrateCache().then(()=>{if(disposed||!shell?.ui.getState().active||!awake())return;const selected=wars.find(war=>choice(war)===$('war').value);mergeWars(wars);renderWars(selected);});
  }
  async function deleteSavedWar() {
    const selected=warCache.list().find(war=>warKey(war)===$('cache-delete-war').value);if(!selected)return;
    if(!window.confirm(`Delete saved counts for war #${selected.warId} against ${selected.opponentName}? Payout receipts are kept.`))return;
    $('cache-delete').disabled=true;
    try{await warCache.remove(selected.factionId,selected.warId);if(disposed)return;cacheIssue='';renderWars();if(snapshot&&warKey(snapshot.scope)===warKey(selected)){snapshot={...snapshot,savedAt:undefined};reportSource='Unsaved';updateCoverage();}status('Saved war counts deleted. Payout receipts were kept.');}
    catch(error){if(!disposed){cacheIssue=WarPayoutCache.message(error);status(cacheIssue);renderWars();}}
  }
  function connection() {
    if ($('key-state')) $('key-state').textContent=hubManaged?(sharedKey?(hubFallback?'Using global fallback from Hub.':'Using assigned Hub key.'):'Managed by Hub. API paused: configure an approved key in Hub API Keys.'):sharedKey?'Approved Hub Torn key available.':personalKey?'Standalone key configured.':'Configure a key in Hub API Keys or use a standalone key before enrolling.';
    for(const name of ['key','use-key','remember-key'])if($(name))$(name).disabled=hubManaged||!keyPolicyReady||(name==='remember-key'&&!privateStore.eligible);
    if ($('storage-note')) $('storage-note').textContent=privateStore.eligible?'Saved personal keys use this script’s manager/native storage.':'Private persistent key storage is unavailable here. A personal key can be used for this page only.';
  }
  function readRates() { return Object.fromEntries(metrics.map(metric=>[metric,number('rate-'+metric)])); }
  function cacheInput() {
    if ($('cache-source').value==='total') return {cacheTotal:number('cache-total')};
    return {caches:[...$('cache-rows').children].map(row=>{
      const quantity=row.querySelector('[data-cache-qty]').value.trim(),price=row.querySelector('[data-cache-price]').value.trim();
      if(!quantity||!price)throw new Error('Enter a quantity and estimated price for each cache.');
      return {name:row.querySelector('[data-cache-name]').value,quantity:Number(quantity),price:Number(price)};
    })};
  }
  function countsInput(rates) {
    if ($('count-source').value==='loaded') {
      if (!snapshot) throw new Error('Load war data or choose expected counts for a planning estimate.');
      return snapshot.totals;
    }
    return Object.fromEntries(metrics.map(metric=>[metric,number('expected-'+metric,metric!=='hits' && rates[metric]===0)]));
  }
  function updateMode() {
    if (!dialog) return;
    const rough=$('mode').value==='estimate';
    $('mode').closest('.twpc-mode-row')?.classList.toggle('twpc-planning',rough);
    $('cut').step=$('cut-mode').value==='percent'?'0.01':'1';
    if(shell)$('cut').labels[0].firstChild.textContent=$('cut-mode').value==='percent'?'Cut (%)':'Cut ($)';
    $('actual').hidden=rough; $('estimate').hidden=!rough;
    $('cache-total-field').hidden=$('cache-source').value!=='total';
    $('cache-items').hidden=$('cache-source').value!=='items';
    $('expected').hidden=$('count-source').value!=='expected';
    for (const metric of metrics.slice(1)) $('expected-'+metric+'-field').hidden=Number($('rate-'+metric).value)===0;
    recalculate();
  }
  function updateCoverage() {
    if (!dialog) return;
    if($('cache-state')){
      $('cache-state').hidden=!snapshot;
      $('cache-state').textContent=snapshot?`${snapshot.live?'Live snapshot':reportSource}${snapshot.savedAt?' · '+new Date(snapshot.savedAt).toLocaleString():''}`:'';
      $('cache-state').classList.toggle('twpc-live',!!snapshot?.live);
    }
    if (!snapshot) { if($('war-counts'))$('war-counts').textContent='War details';$('coverage').textContent='Load a war to calculate each player’s payout. Planning estimates can use expected counts.'; return; }
    const totals=snapshot.totals;
    if($('war-counts'))$('war-counts').textContent=`${totals.hits} hits · ${totals.losses} losses · ${snapshot.rows.length} ${snapshot.rows.length===1?'player':'players'}`;
    $('coverage').textContent=`War #${snapshot.scope.warId}: ${totals.hits} war hits · ${totals.losses} losses to enemy · ${snapshot.scanned} attacks checked across ${snapshot.pages} pages. ${snapshot.live?'Live war: counts so far. ':''}${snapshot.excluded} outside/nonpaying attacks excluded, including ${snapshot.unattributed||0} unattributed and ${snapshot.unknownResults||0} unknown outcomes. Draft from available API logs; completeness is unverified.`;
  }
  function renderRows(result, rates) {
    const columns=['hits','losses',...metrics.slice(2).filter(metric=>rates[metric]>0)];
    const table=$('players'); table.replaceChildren();
    const head=node('thead'), header=node('tr');
    for (const label of ['Player',...columns.map(metric=>labels[metric]),'Payout']) {const th=node('th',label);th.scope='col';header.append(th);} head.append(header);table.append(head);
    const body=node('tbody');
    for (const row of result.rows) {
      const tr=node('tr');const name=node('td');name.append(node('strong',row.name),node('small',' ['+row.id+']'));tr.append(name);
      for (const metric of columns) tr.append(node('td',String(row[metric])));
      tr.append(node('td',money(row.payout),'twpc-pay'));body.append(tr);
    }
    table.append(body);
    $('empty').hidden=result.rows.length>0;
  }
  function recalculate() {
    if (!dialog) return;
    creditUI?.resetReview();
    current=null;estimate=null;
    $('validation').textContent='';$('copy').disabled=true;$('csv').disabled=true;$('apply-rate').disabled=true;
    $('est-rate').textContent='—';
    for (const name of ['summary-profit','summary-cut','pool','total','balance']) $(name).textContent='—';
    $('players').replaceChildren();$('empty').hidden=false;
    try {
      const rates=readRates(), cutMode=$('cut-mode').value,cutValue=number('cut');
      const rough=$('mode').value==='estimate';
      let profit;
      if (rough) {
        const cache=cacheInput(),counts=countsInput(rates);
        estimate=D.estimate({...cache,cutMode,cutValue,rates},counts);
        profit=estimate.profit;
        $('est-rate').textContent=estimate.rate===null?'—':money(estimate.rate);
        $('estimate-note').textContent=estimate.shortfall>0?`Other payouts exceed the pool by ${money(estimate.shortfall)}.`:estimate.rate===null?'Enter a positive hit count to estimate dollars per hit.':`After reserving ${money(estimate.reserved)} for other payouts. Rounding leaves ${money(estimate.remainder)}. ${$('count-source').value==='expected'?'Expected counts are planning assumptions.':snapshot?.live?'Loaded hits are counts so far.':'Uses loaded war counts.'} Use the estimated rate to update the player table.`;
        $('apply-rate').disabled=estimate.rate===null||estimate.shortfall>0;
      } else profit=number('profit');
      const result=D.calculate({profit,cutMode,cutValue,rates},snapshot?.rows||[]);
      $('summary-profit').textContent=money(result.profit);$('summary-cut').textContent=money(result.cut);$('pool').textContent=money(result.pool);$('total').textContent=money(result.total);
      $('balance-label').textContent=result.leftover<0?'Funding shortfall':'Leftover';$('balance').textContent=money(Math.abs(result.leftover));$('balance').classList.toggle('twpc-warning',result.leftover<0);
      renderRows(result,rates);
      const planning=rough&&$('count-source').value==='expected';
      $('table-note').textContent=planning?'Table uses loaded player counts and the chosen rates. Expected totals are for planning; switch to loaded counts to export player payouts.':rough?'Estimated values and the chosen fixed rates; unsold caches are not actual profit.':'Payouts use the chosen fixed rates. A shortfall does not change anyone’s rate.';
      current={result,context:{reportStatus:'Draft — API log completeness unverified',warId:snapshot?.scope.warId||'',opponent:snapshot?.opponentName||'',start:snapshot?.scope.start||'',end:snapshot?.scope.end||'',mode:rough?'Cache estimate':'Actual profit',coverage:snapshot?.coverage||'Not loaded',coverageStatus:snapshot?.coverageStatus||'not-loaded',live:!!snapshot?.live,unattributed:snapshot?.unattributed||0,unknownResults:snapshot?.unknownResults||0,cutMode,cutValue,countSource:rough?$('count-source').value:'loaded',...(rough?cacheInput():{})}};
      const canExport=!!snapshot&&!planning;
      $('copy').disabled=!canExport;$('csv').disabled=!canExport;
    } catch (error) { $('validation').textContent=error.message; }
    creditUI?.refresh();
    raffleUI?.refresh();
  }
  function addCache(cache = {}) {
    if ($('cache-rows').children.length>=12) {status('Use the estimated total for more than 12 cache types.');return;}
    const row=node('div',undefined,'twpc-cache-row');
    for (const [field,title,value] of [['name','Cache',cache.name||'Cache'],['qty','Quantity',cache.quantity??0],['price','Estimated $ each',cache.price??0]]) {
      const label=node('label',title),input=node('input');input.dataset['cache'+field[0].toUpperCase()+field.slice(1)]='';input.type=field==='name'?'text':'number';input.value=value;
      if(field==='name')input.maxLength=80;else{input.min='0';input.step='1';input.inputMode='numeric';}
      label.append(input);row.append(label);
    }
    const remove=node('button','Remove');remove.type='button';remove.addEventListener('click',()=>{row.remove();recalculate();});row.append(remove);$('cache-rows').append(row);
  }
  function exportText() { if(!current||$('csv').disabled)throw new Error('Load complete available war data before exporting.');return D.csv(current.result,current.context); }
  async function copy() {
    try {
      const text=exportText();
      if(typeof GM_setClipboard==='function') await GM_setClipboard(text);
      else if(typeof GM!=='undefined'&&typeof GM.setClipboard==='function') await GM.setClipboard(text);
      else await navigator.clipboard.writeText(text);
      status('Payout draft copied.');
    } catch (_) { status('Could not copy. Use Export CSV instead.'); }
  }
  async function download() {
    try {
      const text=exportText(),fileName='war-payout-'+snapshot.scope.warId+'.csv';
      if(env.flutter_inappwebview?.callHandler) {
        await env.__PDA_platformReadyPromise;
        const bytes=new TextEncoder().encode(text);let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
        await env.flutter_inappwebview.callHandler('shareFile',{base64Data:btoa(binary),fileName});status('Payout CSV shared.');return;
      }
      releaseExport();exportUrl=URL.createObjectURL(new Blob(['\uFEFF'+text],{type:'text/csv;charset=utf-8'}));
      const link=node('a');link.href=exportUrl;link.download=fileName;dialog.append(link);link.click();link.remove();exportTimer=setTimeout(releaseExport,1000);status('Payout CSV exported.');
    } catch (_) {status('Could not export. Try Copy payouts instead.');}
  }
  function request(path,params,signal) {
    const publicError=WarPayoutAPI.requestError;
    const url=new URL('https://api.torn.com/v2'+path);
    for(const [name,value] of Object.entries(params||{}))url.searchParams.set(name,String(value));
    url.searchParams.set('comment','WarPayoutCalculator');
    const apiKey=key();
    if(!apiKey)return Promise.reject(publicError('Configure a Torn key in Hub API Keys or API connection.'));
    return new Promise((resolve,reject)=>{
      let handle, settled=false;
      const finish=(error,response)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(error)reject(error);else resolve(response);};
      const abort=()=>{finish(publicError('Loading cancelled.'));try{handle?.abort?.();}catch(_){}};
      const timer=setTimeout(()=>{finish(publicError('Torn API request timed out. Try loading again.'));try{handle?.abort?.();}catch(_){}},30000);
      signal?.addEventListener('abort',abort,{once:true});
      if(signal?.aborted){abort();return;}
      const parse=response=>{
        try {
          if(response.status!==200)throw publicError('Torn API is unavailable. Try loading again.');
          let data;
          try{data=JSON.parse(response.responseText);}catch(_){throw publicError('Torn returned an unreadable response. Try loading again.');}
          if(!data||typeof data!=='object')throw publicError('Torn returned an unexpected response.');
          if(data.error) {const code=Number(data.error.code);throw publicError([2,16].includes(code)?'Torn rejected the API key. Check your key.':[7,10].includes(code)?'This key needs faction attack access and faction API permission.':code===5?'Torn API rate limit reached. Wait before loading again.':'Torn API could not provide this data (code '+(Number.isInteger(code)?code:'unknown')+').');}
          finish(null,data);
        } catch(error) {finish(error);}
      };
      const options={url:url.href,method:'GET',headers:{Authorization:'ApiKey '+apiKey},timeout:30000,onload:parse,onerror:()=>finish(publicError('Torn API request failed. Check your connection.')),ontimeout:()=>finish(publicError('Torn API request timed out.')),onabort:abort};
      try {
        if(typeof GM_xmlhttpRequest==='function')handle=GM_xmlhttpRequest(options);
        else if(typeof GM!=='undefined'&&typeof GM.xmlHttpRequest==='function')handle=GM.xmlHttpRequest(options);
        else if(typeof env.PDA_httpGet==='function')Promise.resolve(env.PDA_httpGet(url.href,options.headers)).then(parse,options.onerror);
        else {const controller=new AbortController();handle=controller;fetch(url.href,{headers:options.headers,signal:controller.signal}).then(async response=>parse({status:response.status,responseText:await response.text()}),options.onerror);}
      } catch (_) {finish(publicError('Torn API transport is unavailable.'));}
    });
  }
  const client=WarPayoutAPI.createClient({request});
  async function run(work) {
    if(!awake()){status('Bring this tab to the foreground before loading.');return;}
    cancel();const token=++generation,controller=new AbortController();job=controller;busy(true);
    try {
      await work(controller.signal,token);
    } catch(error) {if(token===generation)status(error.message);}
    finally {if(token===generation){job=null;busy(false);}}
  }
  function listWars() {
    run(async(signal,token)=>{
      status('Loading faction and recent wars…');const result=await client.listWars(signal);
      await hydrateCache();
      if(token!==generation||!awake())return;
      mergeWars(result.wars,result.factionId);renderWars();$('war').value='';
      clearSnapshot();status('Choose a war above to load its attacks.');
    });
  }
  function showReport(data,source) {
    snapshot=data;reportSource=source;updateCoverage();$('cache-rows').replaceChildren();
    if(data.caches?.length)for(const cache of data.caches)addCache(cache);else addCache();
    recalculate();
  }
  function loadWar(force=false) {
    const war=wars.find(value=>choice(value)===$('war').value);
    if(!war){status('Select a war first.');return;}
    if(war.start>Math.floor(Date.now()/1000)){clearSnapshot();status('This war has not started yet. Choose a completed or active war.');return;}
    clearSnapshot();
    run(async(signal,token)=>{
      await hydrateCache();if(token!==generation||!awake())return;
      const saved=!force&&cacheLoaded?warCache.get(war):null;
      if(saved){showReport(saved,'Cached');status(saved.live?'Saved live preview. Refresh to scan for updated counts.':'');return;}
      let selected=war;
      {
        status('Checking the war’s current status…');
        const refreshed=await client.listWars(signal);
        if(refreshed.factionId!==war.factionId)throw new Error('This API key belongs to a different faction. Use the saved war’s faction key to Refresh. Saved counts were kept.');
        const latest=refreshed.wars.find(item=>item.warId===war.warId);
        if(war.end===0&&!latest)throw new Error('Selected war details changed. Sync wars and select it again.');
        if(latest&&(latest.factionId!==war.factionId||latest.opponentId!==war.opponentId||latest.start!==war.start||(war.end&&latest.end!==war.end)))throw new Error('Selected war details changed. Sync wars and select it again.');
        selected=latest||war;
        if(token!==generation||!awake())return;
        mergeWars(refreshed.wars,refreshed.factionId);renderWars(selected);
      }
      status('Loading war attacks…');const data=await client.loadWar(selected,signal,progress=>{if(token===generation)status('Loading attack page '+progress.pages+'…');});
      if(token!==generation||!awake())return;
      const report={...data,opponentName:selected.opponentName};showReport(report,'Unsaved');
      if(!awake()||signal.aborted)return;
      try{
        await warCache.put(selected,report);
        if(token!==generation||!awake())return;
        cacheIssue='';snapshot=warCache.get(selected);reportSource='Saved';updateCoverage();renderWars(selected);
        status(selected.end?'':'Live preview saved. Refresh scans for updated counts.');
      }catch(error){if(token===generation&&awake()){cacheIssue=WarPayoutCache.message(error);renderWars(selected);status(cacheIssue);}}
    });
  }
  async function useKey() {
    if(hubManaged||!keyPolicyReady){status('Manage this connection in Hub API Keys.');return;}
    const value=$('key').value.trim();$('key').value='';
    if(!/^[A-Za-z0-9]{16}$/.test(value)){status('Enter a 16-character Torn API key.');return;}
    cancel();personalKey=value;revision++;const localRevision=++localKeyRevision;resetConnectionData();
    if($('remember-key').checked) {
      const ok=await persistPersonalKey(value);
      if(localRevision!==localKeyRevision||disposed)return;
      status(ok?'Personal fallback saved.':'Key is available for this page; saving failed.');
    } else status('Personal fallback set for this page.');
    connection();
  }
  async function rememberRates() {
    try {
      const rates=readRates(),cutMode=$('cut-mode').value,cutValue=number('cut');
      D.calculate({profit:cutMode==='amount'?cutValue:0,cutMode,cutValue,rates},[]);
      const value={rates,cutMode,cutValue};
      if(typeof GM_setValue==='function')await GM_setValue('twpc-preferences-v1',value);
      else if(typeof GM!=='undefined'&&typeof GM.setValue==='function')await GM.setValue('twpc-preferences-v1',value);
      else throw new Error();
      savedPrefs=value;status('Faction cut and payout rates remembered.');
    } catch (_) {status('Could not remember preferences. Check the faction cut and rates.');}
  }
  function applyPrefs() {
    if(!dialog||!savedPrefs||draftEdited)return;
    try {
      const {cutMode,cutValue,rates}=savedPrefs;
      D.calculate({profit:cutMode==='amount'?cutValue:0,cutMode,cutValue,rates},[]);
      $('cut-mode').value=cutMode;$('cut').value=cutValue;for(const metric of metrics)$('rate-'+metric).value=rates[metric]??0;
    } catch (_) {}
  }
  function build() {
    style=node('style');style.textContent=warPayoutShellCss();document.head.append(style);
    dialog=node('div');
    const field=(name,label,value=0)=>`<label id="twpc-${name}-field" for="twpc-${name}">${label}<input id="twpc-${name}" type="number" min="0" step="1" inputmode="numeric" value="${value}"></label>`;
    dialog.innerHTML=`<header><div><h2 id="twpc-title">War payout calculator</h2><small>Enemy-only counts · standalone Hub tool</small></div><button id="twpc-close" aria-label="Close calculator">×</button></header>
    <div class="twpc-content"><section><h3>1 · War</h3><label for="twpc-war">Ranked war<select id="twpc-war"><option value="">Load recent wars</option></select></label><div class="twpc-actions"><button id="twpc-list-wars">Load recent wars</button><button id="twpc-load" class="twpc-primary">Load war data</button><button id="twpc-cancel-load" hidden>Cancel loading</button></div><p id="twpc-coverage"></p>
    <details id="twpc-connection"><summary>API connection</summary><p id="twpc-key-state"></p><label for="twpc-key">Personal Torn API key<input id="twpc-key" type="password" maxlength="16" autocomplete="new-password" spellcheck="false" placeholder="Enter a replacement key"></label><label class="twpc-checkbox"><input id="twpc-remember-key" type="checkbox">Remember this personal fallback</label><div class="twpc-actions"><button id="twpc-use-key">Use personal key</button><button id="twpc-forget-key">Forget personal key</button></div><p id="twpc-storage-note"></p><p>Requires a Torn key with faction attacks access and faction API permission. Approve this calculator separately in Hub API Keys to use a shared key.</p></details></section>
    <section><h3>2 · Money available</h3><div class="twpc-grid"><label for="twpc-mode">Calculation mode<select id="twpc-mode"><option value="actual">Actual profit</option><option value="estimate">Rough estimate</option></select></label><label for="twpc-cut-mode">Faction cut type<select id="twpc-cut-mode"><option value="amount">Dollar amount</option><option value="percent">Percent</option></select></label>${field('cut','Faction cut',0)}</div>
    <div id="twpc-actual" class="twpc-grid twpc-two" style="margin-top:12px">${field('profit','Total war profit ($)',0)}</div>
    <div id="twpc-estimate" hidden><p>Estimate from unsold caches. Enter your expected sale values; prices are assumptions.</p><div class="twpc-grid twpc-two"><label for="twpc-cache-source">Cache value input<select id="twpc-cache-source"><option value="total">Estimated total</option><option value="items">Quantities × prices</option></select></label>${field('cache-total','Estimated cache total ($)',0)}</div><div id="twpc-cache-items" hidden><div id="twpc-cache-rows"></div><button id="twpc-add-cache">Add cache type</button></div>
    <label for="twpc-count-source" style="margin-top:12px">Hit and other payout counts<select id="twpc-count-source"><option value="loaded">Loaded war counts</option><option value="expected">Expected counts (planning)</option></select></label><div id="twpc-expected" class="twpc-grid" style="margin-top:12px" hidden>${metrics.map(metric=>field('expected-'+metric,'Expected '+labels[metric].toLowerCase(),metric==='hits'?0:'')).join('')}</div>
    <div class="twpc-rate-box"><div><small>Estimated dollars per war hit</small><div id="twpc-est-rate">—</div></div><button id="twpc-apply-rate" class="twpc-primary" disabled>Use estimated hit rate</button></div><p id="twpc-estimate-note"></p></div></section>
    <section><h3>3 · Player rates</h3><div class="twpc-grid twpc-two">${field('rate-hits','$ per successful war hit')}${field('rate-losses','$ per loss to enemy')}</div><p>A loss means an enemy attack that defeats your player. Failed attacks your players start do not earn loss pay.</p><details><summary>More payout options</summary><div class="twpc-grid">${metrics.slice(2).map(metric=>field('rate-'+metric,'$ per '+({assists:'assist',stalemates:'offensive stalemate',defends:'successful defend'}[metric]))).join('')}</div><p>Enemy-only assists and offensive stalemates. A successful defend means the enemy attacker lost; escapes and timeouts are excluded.</p></details><button id="twpc-remember-rates">Remember cut and rates</button></section>
    <p id="twpc-validation" role="alert"></p><div class="twpc-summary" aria-live="polite"><div><small>Profit / estimate</small><strong id="twpc-summary-profit">—</strong></div><div><small>Faction cut</small><strong id="twpc-summary-cut">—</strong></div><div><small>Player pool</small><strong id="twpc-pool">—</strong></div><div><small>Player payouts</small><strong id="twpc-total">—</strong></div><div><small id="twpc-balance-label">Leftover</small><strong id="twpc-balance">—</strong></div></div>
    <section><h3>Player payouts</h3><p id="twpc-table-note"></p><div class="twpc-table-scroll"><table id="twpc-players"></table></div><p id="twpc-empty">Load a war to see players.</p><div class="twpc-actions"><button id="twpc-csv" disabled>Export draft CSV</button><button id="twpc-copy" disabled>Copy payout draft</button></div></section><p id="twpc-status" role="status"></p></div>`;
    document.body.append(dialog);addCache();applyPrefs();connection();updateCoverage();updateMode();
    $('coverage').before($('status'));
    $('list-wars').textContent='Find wars';$('load').textContent='Reload war data';busy(false);
    $('war').after(node('small','Choose a war to load its attacks automatically.'));
    const calculatorContent=dialog.querySelector('.twpc-content');calculatorContent.id='twpc-calculator-panel';
    creditUI=createWarPayoutCreditUI({dialog,env,awake,isOpen:()=>!!shell?.ui.getState().active,onMessage:status,nativeAdapter:createWarPayoutNativeCreditAdapter({doc:document,win:window,awake:()=>awake()&&!!creditUI?.isActive()}),readDraft:()=>{
      if(!snapshot||!current||$('mode').value!=='actual')return null;
      return {scope:snapshot.scope,live:snapshot.live,mode:'actual',coverage:'unverified',result:current.result};
    }});
    raffleUI=createWarPayoutRaffleUI({doc:document,env,readSnapshot:()=>snapshot,isActive:()=>awake()&&selectedTab==='raffle'&&!job});dialog.append(raffleUI.panel);
    shell=mountWarPayoutShell({staging:dialog,themeClient:appearanceAdapter?.client,onClose:close,onSelect:sectionChanged,onVisibilityChange:surfaceActivity,
      readLayout:()=>readUiValue('twpc-ui-layout-v1'),writeLayout:value=>writeUiValue('twpc-ui-layout-v1',value),
      onDestroy(){cancel();releaseExport();creditUI?.destroy();raffleUI?.destroy();creditUI=null;raffleUI=null;shell=null;dialog=null;style?.remove();style=null;},
    });
    dialog=shell.root;
    const calculatorInput=event=>!event.target.closest?.('#twpc-credit-panel,#twpc-raffle-panel')&&event.target!==$('key')&&event.target!==$('remember-key');
    dialog.addEventListener('input',event=>{if(!calculatorInput(event))return;draftEdited=true;updateMode();});
    dialog.addEventListener('change',event=>{if(!calculatorInput(event))return;draftEdited=true;if(event.target===$('war')){cancel();resetCacheRows();clearSnapshot();if($('war').value)loadWar();}updateMode();});
    const actions={'list-wars':listWars,'load':()=>loadWar(true),'cancel-load':()=>cancel(),'use-key':useKey,'forget-key':async()=>{cancel();personalKey='';revision++;const localRevision=++localKeyRevision;resetConnectionData();connection();const ok=await persistPersonalKey(null);if(localRevision===localKeyRevision&&!disposed)status(ok?'Personal fallback removed.':'Personal fallback cleared for this page. Stored-key removal is unavailable; clear it in your userscript manager or PDA storage.');},'add-cache':()=>{addCache();recalculate();},'apply-rate':()=>{if(estimate?.rate!==null&&estimate?.shortfall===0){$('rate-hits').value=estimate.rate;draftEdited=true;recalculate();}},'remember-rates':rememberRates,'csv':download,'copy':copy};
    for(const [name,action] of Object.entries(actions))$(name).addEventListener('click',action);
    const cacheState=node('p',undefined,'twpc-cache-state');cacheState.id='twpc-cache-state';cacheState.title='Saved counts reopen without scanning. Refresh deliberately scans again. Live snapshots are provisional.';cacheState.hidden=true;$('war-details').before(cacheState);
    const cacheSettings=node('details');cacheSettings.id='twpc-cache-settings';cacheSettings.append(node('summary','Saved war reports'));
    const cacheSelect=node('select');cacheSelect.id='twpc-cache-delete-war';const cacheLabel=node('label','Saved war');cacheLabel.htmlFor=cacheSelect.id;cacheLabel.append(cacheSelect);cacheSettings.append(cacheLabel);
    const cacheNote=node('p');cacheNote.id='twpc-cache-storage-note';cacheSettings.append(cacheNote);
    const cacheDelete=node('button','Delete saved counts');cacheDelete.id='twpc-cache-delete';cacheDelete.type='button';cacheDelete.disabled=true;cacheDelete.addEventListener('click',deleteSavedWar);cacheSelect.addEventListener('change',()=>{cacheDelete.disabled=!cacheSelect.value;});cacheSettings.append(cacheDelete);$('settings-panel').append(cacheSettings);
    renderWars();
    updateCoverage();updateMode();
  }
  function readUiValue(name){
    if(typeof GM_getValue==='function')return GM_getValue(name,null);
    if(typeof GM!=='undefined'&&typeof GM.getValue==='function')return GM.getValue(name,null);
    return null;
  }
  function writeUiValue(name,value){
    if(typeof GM_setValue==='function')return GM_setValue(name,value);
    if(typeof GM!=='undefined'&&typeof GM.setValue==='function')return GM.setValue(name,value);
    throw new Error('Window settings storage unavailable');
  }
  function sectionChanged(name){
    selectedTab=name;if(!shell||!creditUI)return;
    if(name==='credits'&&awake())creditUI.show();else creditUI.hide();
    if(name==='raffle'&&awake())raffleUI?.show();else raffleUI?.hide();
    if(name!=='settings'&&$('key'))$('key').value='';
  }
  function selectTab(name){shell?.ui.select(name);}
  function surfaceActivity(active){
    if(!active){cancel('Loading paused while the calculator is inactive. Refresh when ready.');creditUI?.pause();raffleUI?.hide();releaseExport();if($('key'))$('key').value='';}
    else if(selectedTab==='credits')creditUI?.show();else if(selectedTab==='raffle')raffleUI?.show();
  }
  function open(tab='calculator') {
    if(disposed||!document.body)return false;
    if(!dialog)build();opener=document.activeElement;
    if(shell.ui.getState().minimized)shell.ui.restore();else{shell.ui.show();shell.ui.collapse(false);}
    selectTab(['calculator','credits','settings','raffle'].includes(tab)?tab:'calculator');
    sectionChanged(selectedTab);showSavedWars();
    shell.ui.nav.querySelector('[aria-current="page"]')?.focus();return true;
  }
  function close() {
    cancel();releaseExport();creditUI?.hide();raffleUI?.hide();if($('key'))$('key').value='';shell?.ui.hide();
    const target=opener?.isConnected&&opener.getClientRects().length?opener:document.getElementById('tsh-launcher');target?.focus();
  }
  function activity(event) {
    if(event?.type==='tornpda:tabState'){const detail=event.detail;if(typeof detail?.isActiveTab!=='boolean'||typeof detail?.isWebViewVisible!=='boolean')return;pdaActive=detail.isActiveTab&&detail.isWebViewVisible;}
    if(!awake()){cancel('Loading stopped while this tab is inactive. Load again when ready.');creditUI?.pause();raffleUI?.hide();if($('key'))$('key').value='';}else if(selectedTab==='raffle')raffleUI?.show();
  }
  function attach() {
    if(attached||disposed)return;attached=true;
    document.addEventListener('visibilitychange',activity);window.addEventListener('tornpda:tabState',activity);window.addEventListener('hashchange',route);window.addEventListener('popstate',route);
  }
  function detach() {
    if(!attached)return;attached=false;close();sharedKey=null;connection();
    document.removeEventListener('visibilitychange',activity);window.removeEventListener('tornpda:tabState',activity);window.removeEventListener('hashchange',route);window.removeEventListener('popstate',route);
  }
  function route() {close();}
  const apiPage={id:'connection',title:'API connection',sections:[{id:'key',title:'Torn connection',fields:[{id:'sharedPresent',type:'checkbox',label:'Approved Hub Torn key available',readOnly:true},{id:'personalPresent',type:'checkbox',label:'Personal fallback configured',readOnly:true},{id:'personalApiKey',type:'secret',label:'Replace personal fallback',minLength:16,maxLength:16}]}]};
  let appearanceAdapter=null;
  const adapter=registerTornScriptMenu(document,window,{id,name:'War Payout Calculator',version:WAR_PAYOUT_RELEASE_VERSION,icon:'war',category:'Faction',url:'https://www.torn.com/factions.php?step=your&type=1',actions:[{id:'open',label:'Open calculator'},{id:'credits',label:'Payout members'},{id:'raffle',label:'War raffle'},{id:'settings',label:'API connection'}],pages:[{id:'connection',title:'API connection'}],capabilities:['settings','credentials','secret-settings','appearance']},{open:()=>open('calculator'),credits:()=>open('credits'),raffle:()=>open('raffle'),settings:()=>{open('settings');shell?.showSettings();}}, {
    credentialClient, sharedProviders:['torn'],credentialContext:true,credentialScope:'script',
    onCredentialPolicyReady(ready,isManaged){keyPolicyReady=ready;hubManaged ||= isManaged('torn');connection();},
    onHubManagementChange(provider,managed){if(provider==='torn'&&managed){hubManaged=true;connection();}},
    onCredentialPolicyFailure(provider){if(provider==='torn'){keyPolicyReady=false;cancel('Hub enrollment could not be saved. Reload to retry.');connection();}},
    onCredentialContext(provider,context){if(provider==='torn'){hubFallback=context.fallback;connection();}},
    onSharedCredentialChange(provider,value){if(provider!=='torn')return;const previous=key();sharedKey=typeof value==='string'&&/^[A-Za-z0-9]{16}$/.test(value)?value:null;revision++;if(previous!==key()){cancel('API connection changed. Reload war data.');resetConnectionData();}connection();},
    describePage:()=>hubManaged?{...apiPage,description:'Managed by Hub. Configure keys and assignments in API Keys.',sections:apiPage.sections.map(section=>({...section,fields:section.fields.filter(field=>field.id!=='personalApiKey')}))}:apiPage, readSettings:()=>({values:{sharedPresent:!!sharedKey,personalPresent:!!personalKey},revision:String(revision)}),
    saveSettings:()=>({values:{sharedPresent:!!sharedKey,personalPresent:!!personalKey},revision:String(revision)}),
    async saveSecrets(page,patch){if(hubManaged||!keyPolicyReady||page!=='connection'||Object.keys(patch).some(name=>name!=='personalApiKey')||!/^[A-Za-z0-9]{16}$/.test(patch.personalApiKey))throw new Error('Unavailable');const localRevision=++localKeyRevision;if(!await persistPersonalKey(patch.personalApiKey))throw new Error('Unavailable');if(localRevision!==localKeyRevision||disposed)return;cancel();personalKey=patch.personalApiKey;revision++;resetConnectionData();connection();},
    onAttach:attach,onDetach:detach,onDispose(){appearanceAdapter?.dispose();detach();disposed=true;shell?.ui.destroy();creditUI?.destroy();raffleUI?.destroy();dialog?.remove();style?.remove();snapshot=null;wars=[];current=null;personalKey='';sharedKey=null;},
  });
  if(typeof createScriptUiAppearanceAdapter==='function'){
    const appearanceKey='twpc-ui-appearance-v1';
    appearanceAdapter=createScriptUiAppearanceAdapter({doc:document,win:window,id,selectors:['#twpc-dialog'],getInstance:()=>adapter.instance,
      read:()=>typeof GM_getValue==='function'?GM_getValue(appearanceKey,null):typeof GM!=='undefined'&&typeof GM.getValue==='function'?GM.getValue(appearanceKey,null):null,
      write:value=>{if(typeof GM_setValue==='function')return GM_setValue(appearanceKey,value);if(typeof GM!=='undefined'&&typeof GM.setValue==='function')return GM.setValue(appearanceKey,value);throw new Error('Appearance storage unavailable');}});
    appearanceAdapter.start().catch(()=>{});
  }
  if(typeof GM_registerMenuCommand==='function')GM_registerMenuCommand('War payout calculator',open);
  else if(typeof GM!=='undefined'&&typeof GM.registerMenuCommand==='function')GM.registerMenuCommand('War payout calculator',open);
  Promise.resolve().then(async()=>{
    let preferences=null;
    try{preferences=typeof GM_getValue==='function'?await GM_getValue('twpc-preferences-v1',null):typeof GM!=='undefined'&&GM.getValue?await GM.getValue('twpc-preferences-v1',null):null;}catch(_){}
    const stored=await privateStore.get('personal-key');
    if(disposed)return;
    if(localKeyRevision===0&&typeof stored==='string'&&/^[A-Za-z0-9]{16}$/.test(stored))personalKey=stored;
    savedPrefs=preferences;applyPrefs();connection();updateMode();
  });
}
