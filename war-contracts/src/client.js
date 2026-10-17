function installWarContractsHub(){
  'use strict';
  if(document.getElementById('wch-installation'))return;
  const marker=document.createElement('meta');marker.id='wch-installation';(document.head||document.documentElement).append(marker);
  const D=WarContractsDomain,id='war-contracts',prefix='war-contracts-hub:v1:',refs={},cleanups=[];
  const env=getHubPlatformEnvironment();
  if(typeof GM_xmlhttpRequest==='function')env.GM_xmlhttpRequest=GM_xmlhttpRequest;
  if(typeof PDA_httpGet==='function')env.PDA_httpGet=PDA_httpGet;
  if(typeof PDA_httpPost==='function')env.PDA_httpPost=PDA_httpPost;
  const http=createWarContractsHttp(env);
  let settings={endpoint:''},sessionKey='',sessionFF='',sharedKey=null,verified=null;
  let board=null,member=null,enemies=[],deal=null,dealId=null,draftDealId=null,uncertain=false,loaded=false;
  let ui=null,themeClient=null,adapter=null,credentialClient=null,ready=false,disposed=false,busy=false,generation=0;
  let keyPolicyReady=false,hubManaged=false;
  let autoAttempted=false,landingPending=false,selectedMatchId=null,cancelDraft=null;
  let pdaActive=typeof window.PDA_getTabState!=='function',selected='find',reviewing=false;
  let writeQueue=Promise.resolve();
  const validKey=k=>typeof k==='string'&&/^[A-Za-z0-9]{16}$/.test(k);
  const activeStatuses=new Set(['manual','reserved','contacted','confirmed']);
  const labels={manual:'Manually entered',reserved:'Preparing contact',contacted:'Awaiting reply',confirmed:'Confirmed',cancelled:'Released'};
  const templates={invite:'Hey {name}, interested in a med-out deal for our {war}? Looking for {hits} hits around {time} TCT, with you stripped for my hits. What works for you?',short:'Hey {name}, looking for a stripped med-out partner for {hits} hits in our {war}. Are you available around {time} TCT?',followup:'Hey {name}, checking whether our {hits}-hit med deal around {time} TCT works for you. Please confirm before we lock it in.'};
  const errors={AUTH:'Your faction membership could not be verified.',CONFIG:'Check the service faction/workbook setup and that the sheet opponent matches the detected ranked war.',NO_WAR:'Your faction has no current or recent ranked war available.',CONFLICT:'The contract changed or someone is already booked. Refresh Current Contracts.',FORBIDDEN:'Only your own pending contact can be changed.',CONTEXT_CHANGED:'The current war changed. Refresh Current Contracts.',WAR_ENDED:'This war has ended. Current Contracts remains available to read.',INVALID:'Check the agreement details and the maximum hit count.',UNAVAILABLE:'The contracts service is unavailable. Refresh Current Contracts before retrying.'};
  function node(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);if(cls)e.className=cls;return e;}
  function button(text,fn,cls){const e=node('button',text,cls);e.type='button';e.addEventListener('click',fn);return e;}
  function input(type,name){const e=node('input');e.type=type;e.id='wch-'+name;refs[name]=e;return e;}
  function field(label,control){const e=node('label',undefined,'wch-field');e.append(node('span',label),control);return e;}
  function check(label,control){const e=field(label,control);e.classList.add('wch-check');e.replaceChildren(control,node('span',label));return e;}
  function note(text){return node('p',text,'wch-note');}
  function listen(target,type,callback){target.addEventListener(type,callback);cleanups.push(()=>target.removeEventListener(type,callback));}
  function get(key,fallback){return Promise.resolve().then(()=>typeof GM_getValue==='function'?GM_getValue(prefix+key,fallback):env.GM?.getValue?.(prefix+key,fallback)).then(v=>v===undefined?fallback:v).catch(()=>fallback);}
  function put(key,value){const work=writeQueue.then(()=>{if(typeof GM_setValue==='function')return GM_setValue(prefix+key,value);if(env.GM?.setValue)return env.GM.setValue(prefix+key,value);throw new Error('Settings storage is unavailable.');});writeQueue=work.catch(()=>{});return work;}
  function key(){return keyPolicyReady?(validKey(sharedKey)?sharedKey:hubManaged?'':sessionKey):'';}
  function awake(){return !disposed&&pdaActive&&document.visibilityState!=='hidden';}
  function usable(){return awake()&&!!ui&&ui.getState().active;}
  function ownPageId(){const anchor=document.querySelector('a[aria-label^="Name:"][href*="profiles.php"]');try{const n=Number(new URL(anchor.href).searchParams.get('XID'));return Number.isSafeInteger(n)&&n>0?n:null;}catch(_){return null;}}
  function say(text,error=false){if(!refs.status)return;refs.status.textContent=text;refs.status.dataset.error=String(error);}
  function cancel(){generation++;http.abort();busy=false;loaded=false;autoAttempted=false;update();}
  function resetAccount(){cancel();verified=null;board=null;member=null;enemies=[];deal=null;dealId=null;selectedMatchId=null;sessionFF='';uncertain=false;reviewing=false;if(refs.message)refs.message.value='';if(refs['ff-key'])refs['ff-key'].value='';render();}
  function update(){
    if(!ui)return;
    refs.connect.disabled=busy||!ready||!keyPolicyReady;refs.refresh.disabled=busy||!verified;refs.load.disabled=busy||!verified||uncertain;
    refs['torn-key'].disabled=hubManaged||!keyPolicyReady;
    refs.keyStatus.textContent=!keyPolicyReady?'Checking credential storage…':validKey(sharedKey)?'Approved Hub Torn key available.':hubManaged?'Managed by Hub. Approve an assigned key in Hub API Keys to reconnect.':validKey(sessionKey)?'Personal Torn key available for this page.':'Enter a personal key or approve access in Hub API Keys.';
    refs.context.textContent=board?'vs '+board.context.opponentName+' · '+D.warDetails(board.context).state+' · '+D.warDetails(board.context).startLabel+' · '+board.context.maxHits+'-hit cap':'Checking your faction sheet and ranked war';
    refs.context.dataset.connected=String(!!board);
    refs.loadoutWrap.hidden=!member;refs.load.hidden=!!deal;
    refs.identity.textContent=verified?'Verified member: '+verified.name+' ['+verified.id+']':'No member connected';
    const war=D.warDetails(board?.context);
    refs.connectionState.textContent=busy?'Checking connection…':board?'Connected to your faction sheet':verified?'Member verified · sheet not loaded':'Ready to connect';
    refs.sheetState.textContent=board?board.contracts.filter(r=>r.status!=='cancelled').length+' current contracts loaded':settings.endpoint?'Saved service address':'Add your faction service address once';
    refs.estimateState.textContent=sessionFF?'Separate FFScouter key set for this page.':'Estimates use your Hub/personal Torn key. Register that exact key with FFScouter, or add a registered key below.';
    refs.warTitle.textContent=board?(board.context.factionName?board.context.factionName+' vs ':'')+board.context.opponentName:'Ranked war';
    refs.warState.textContent=war.state;refs.warStart.textContent=war.startLabel;
    refs.warId.textContent=board?'#'+board.context.warId:'Waiting for connection';
    refs.warHits.textContent=board?'Up to '+board.context.maxHits+' hits':'From your faction sheet';
    for(const b of ui.root.querySelectorAll('[data-wch-action]'))b.disabled=busy||uncertain||board?.context.ended===true;
    const pending=deal&&['reserved','contacted'].includes(deal.status)&&deal.source==='script'&&board?.context.ended!==true;
    refs.copy.disabled=busy||uncertain||!pending;refs.sent.disabled=busy||uncertain||!pending;refs.release.disabled=busy||uncertain||!pending;refs.review.disabled=busy||uncertain||!pending;
    refs.confirm.disabled=busy||uncertain||!pending||!refs.agreed.checked||!refs.finalReview.checked;
    refs.syncMain.disabled=busy||uncertain||!verified||board?.context.ended===true;
    refs.cancelDeal.disabled=busy||uncertain||deal?.canCancel!==true||board?.context.ended===true;
    refs.cancelAgreed.disabled=busy||uncertain;refs.cancelSubmit.disabled=busy||uncertain||!cancelDraft||!refs.cancelAgreed.checked;refs.keepDeal.disabled=busy;
    for(const control of [refs.hits,refs.online,refs.time,refs.warlord,refs.notes])control.disabled=busy||deal?.confirmationPending===true;
    refs.recovery.hidden=!uncertain;
  }
  async function run(action){
    if(busy)return;
    if(!usable()){say('Open War Contracts in the active Torn tab before continuing.',true);return;}
    const token=++generation;busy=true;update();
    const current=()=>token===generation&&usable();
    try{await action(current);}catch(error){if(current())say(error.message,true);}
    finally{if(token===generation){busy=false;update();}}
  }
  function autoLoad(){
    if(!usable()||busy||!ready||!keyPolicyReady||!validKey(key())||!D.endpoint(settings.endpoint)||autoAttempted)return;
    if(verified&&board&&Date.now()-board.at<30000)return;
    autoAttempted=true;
    if(verified)void run(async current=>{say('Checking your faction sheet and ranked war…');if(await refresh(current))say('Current contracts refreshed from the sheet.');});
    else void connect({automatic:true});
  }
  function serviceError(data){if(data?.ok===true)return;throw new Error(errors[data?.error?.code]||errors.UNAVAILABLE);}
  async function call(action,fields={}){
    if(!usable()||!verified||!validKey(key()))throw new Error('Connect your own Torn account first.');
    const endpoint=D.endpoint(settings.endpoint);if(!endpoint)throw new Error('Enter the deployed Apps Script /exec address in Connection.');
    const data=await http.json(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:{action,apiKey:key(),...(action==='board'?{}:{warId:board?.context.warId}),...fields}});
    serviceError(data);return data;
  }
  function accept(data){
    const user=data.user,c=data.context;
    if(!verified||Number(user?.id)!==verified.id||Number(user?.factionId)!==verified.factionId||!c||Number(c.factionId)!==verified.factionId||![c.warId,c.opponentId,c.maxHits].every(n=>Number.isSafeInteger(n)&&n>0)||!Array.isArray(data.contracts)||data.contracts.length>2000)throw new Error('The contract service returned an invalid account or war.');
    const oldWar=board?.context.warId;
    board={context:c,contracts:data.contracts.filter(r=>r&&typeof r==='object'&&Object.hasOwn(labels,r.status)).map(r=>({...r,ourName:String(r.ourName||'').slice(0,100),enemyName:String(r.enemyName||'').slice(0,100),notes:String(r.notes||'').slice(0,2000)})),at:Date.now()};
    if(oldWar&&oldWar!==c.warId){member=null;enemies=[];loaded=false;}
    verified={...verified,name:String(user.name||'Member')};
    deal=board.contracts.find(r=>r.source==='script'&&activeStatuses.has(r.status)&&Number(r.ourId)===verified.id)||board.contracts.find(r=>activeStatuses.has(r.status)&&(Number(r.ourId)===verified.id||D.normalizeName(r.ourName)===D.normalizeName(verified.name)))||null;
    if((deal?.id||null)!==dealId){dealId=deal?.id||null;draftDealId=null;reviewing=false;if(refs.message)refs.message.value='';}
    uncertain=false;render();
    if(landingPending){landingPending=false;if(deal&&selected==='find')ui.select('mine');}
  }
  async function refresh(current){const data=await call('board');if(!current())return false;accept(data);return true;}
  async function torn(path){
    const result=await http.json('https://api.torn.com/v2/'+path,{headers:{Authorization:'ApiKey '+key()}});
    if(result.error)throw new Error('Torn could not provide the requested data. Check this key has User battlestats/equipment and public faction members access.');return result;
  }
  async function connect({automatic=false}={}){
    await run(async current=>{
      autoAttempted=true;
      const endpoint=D.endpoint(automatic?settings.endpoint:refs.endpoint.value);if(!endpoint)throw new Error('Use a deployed https://script.google.com/macros/s/.../exec address.');
      const personal=automatic?'':refs['torn-key'].value.trim(),ff=automatic?'':refs['ff-key'].value.trim();
      if(personal&&!validKey(personal)||ff&&!validKey(ff))throw new Error('API keys must contain 16 letters and numbers.');
      settings={endpoint};sessionKey=personal||sessionKey;sessionFF=ff||sessionFF;
      verified=null;board=null;member=null;enemies=[];deal=null;dealId=null;reviewing=false;uncertain=false;loaded=false;render();
      if(!validKey(key()))throw new Error('Approve this script in Hub API Keys, or enter your own personal key.');
      say('Checking your faction sheet and ranked war…');
      if(!automatic)await put('settings',settings);if(!current())return;
      const info=await torn('key/info');if(!current())return;
      const user=info.info?.user,own=ownPageId();
      if(!own)throw new Error('Open a normal Torn page so your logged-in member ID can be checked.');
      if(Number(user?.id)!==own||!Number.isSafeInteger(Number(user?.faction_id))||Number(user.faction_id)<=0)throw new Error('The key must belong to the Torn account currently logged in and a faction member.');
      verified={id:own,factionId:Number(user.faction_id),name:'Member'};member=null;enemies=[];board=null;deal=null;dealId=null;reviewing=false;
      if(await refresh(current)){refs['torn-key'].value='';refs['ff-key'].value='';say('Connected as '+verified.name+'.');}
    });
  }
  async function loadMatches(){await run(async current=>{
    say('Checking current contracts, your loadout and opponent estimates…');
    if(!await refresh(current))return;
    if(deal){say('You already have a contract or pending contact. Open My Deal.');return;}
    const [stats,equipment,roster]=await Promise.all([torn('user/battlestats'),torn('user/equipment'),torn('faction/'+board.context.opponentId+'/members?striptags=true')]);
    if(!current())return;
    if(!Array.isArray(roster.members)||roster.members.length>1000)throw new Error('Torn returned an invalid opponent roster.');
    const people=roster.members.map(m=>({id:Number(m.id),name:String(m.name),level:Number(m.level),status:m.status})).filter(m=>Number.isSafeInteger(m.id)&&m.id>0);
    const estimates=new Map();
    for(let offset=0;offset<people.length;offset+=200){
      if(!current())return;
      const ids=people.slice(offset,offset+200).map(m=>m.id).join(',');
      const data=await http.json('https://ffscouter.com/api/v1/get-stats?key='+encodeURIComponent(sessionFF||key())+'&targets='+ids);
      if(!current())return;
      if(!Array.isArray(data))throw new Error('FFScouter could not load estimates. Register your key with FFScouter or check its access.');
      for(const row of data){
        // Public BSS and its estimate belong together; do not combine a merged spy total with an unrelated BSS.
        const publicRow=row.available_estimates?.bss||row;
        estimates.set(Number(row.player_id),{bss:Number(publicRow.bss_public)||null,bs:Number(publicRow.bs_estimate)||null,estimateAt:publicRow.last_updated||null});
      }
    }
    if(!current())return;
    member=Object.assign(D.profile(stats,equipment),{id:verified.id,name:verified.name});
    if(!member.bss)throw new Error('Your four battle stats were unavailable. Enable User battlestats access.');
    enemies=people.map(m=>({...m,...(estimates.get(m.id)||{})}));loaded=true;
    renderWeapon();renderMatches();say('Matches loaded. Opponents are assumed stripped for the agreed hits.');
  });}
  function ownConflict(){return deal&&board&&D.contractBlocked(board.contracts.filter(r=>r.id!==deal.id),verified,{id:deal.enemyId,name:deal.enemyName});}
  async function reserve(enemy){await run(async current=>{
    if(!board||!member||uncertain)throw new Error('Refresh your matches before reserving a partner.');
    if(board.context.ended)throw new Error(errors.WAR_ENDED);
    uncertain=true;update();
    const data=await call('reserve',{requestId:crypto.randomUUID(),enemyId:enemy.id});if(!current())return;
    accept(data);open('mine');say('Contact reserved. Prepare your message, then send it yourself.');
  });}
  async function transition(action){await run(async current=>{
    if(!deal||deal.source!=='script'||!['reserved','contacted'].includes(deal.status))throw new Error('There is no pending contact to change.');
    const chosen=deal.id;uncertain=true;update();
    const data=await call(action,{id:chosen});if(!current())return;
    accept(data);say(action==='sent'?'Contact marked as sent.':'Pending contact released.');
  });}
  function draftMessage(){if(!deal)return;const war=D.warDetails(board?.context);refs.message.value=D.message(templates[refs.template.value],{name:deal.enemyName,hits:refs.hits.value||board?.context.maxHits||30,time:refs.time.value||'a time we agree',war:'war against '+board.context.opponentName+(war.dealTime?', starting '+war.startLabel:'')});}
  async function copyMessage(){await run(async current=>{
    if(!await refresh(current))return;
    if(!deal||!['reserved','contacted'].includes(deal.status)||ownConflict())throw new Error('This player is already booked or your contact changed. Refresh Current Contracts.');
    try{
      const text=refs.message.value;
      if(typeof GM_setClipboard==='function')await GM_setClipboard(text);else if(env.GM?.setClipboard)await env.GM.setClipboard(text);else await navigator.clipboard.writeText(text);
      if(current())say('Message copied. Send it yourself; copying does not mark it sent.');
    }catch(_){if(current())say('Could not copy. Select the message and copy it manually.',true);}
  });}
  function terms(){return {hits:Number(refs.hits.value),onlineWindow:refs.online.value.trim(),time:refs.time.value.trim(),warlord:refs.warlord.checked?'Yes':'No',notes:refs.notes.value.trim(),strippedConfirmed:refs.agreed.checked};}
  function preview(){const t=terms();refs.preview.textContent=(deal?verified.name+' ↔ '+deal.enemyName:'No partner')+'\n'+t.hits+' hits · '+(t.time||'time not set')+' TCT\nOnline window: '+(t.onlineWindow||'not set')+' TCT\nWarlord: '+t.warlord+' · Opponent stripped\n'+t.notes;refs.finalReview.checked=false;update();}
  async function confirm(){await run(async current=>{
    if(!deal||!refs.agreed.checked||!refs.finalReview.checked)throw new Error('Review the terms and confirm that both players agreed.');
    const t=terms();if(!Number.isInteger(t.hits)||t.hits<1||t.hits>board.context.maxHits)throw new Error('Hit count must be between 1 and '+board.context.maxHits+'.');
    uncertain=true;update();const data=await call('confirm',{id:deal.id,...t});if(!current())return;
    accept(data);reviewing=false;renderMine();say(deal?.mainSheetSynced===false?'Deal confirmed; main sheet update needs attention.':deal?.mainSheetSynced===true?'Deal confirmed and saved to both sheets.':'Deal confirmed and saved.',deal?.mainSheetSynced===false);
  });}
  async function retryMain(){await run(async current=>{if(!await refresh(current))return;const synced=deal?.status==='confirmed'&&deal.mainSheetSynced===true;say(synced?'Main War Contracts sheet updated.':'The confirmed deal still needs a main-sheet update. Check My Deal for details.',!synced);});}
  function cancelSnapshot(record){return Object.fromEntries(['ourId','ourName','enemyId','enemyName','hits','onlineWindow','time','warlord','notes'].map(k=>[k,record[k]??'']));}
  function beginCancellation(){
    if(!deal||deal.canCancel!==true||busy||uncertain)return;
    cancelDraft={id:deal.id,enemyId:deal.enemyId,warId:board.context.warId,operationId:crypto.randomUUID(),expected:cancelSnapshot(deal)};
    refs.cancelHeading.textContent='Cancel deal with '+deal.enemyName+'?';refs.cancelAgreed.checked=false;refs.cancelPanel.hidden=false;update();refs.keepDeal.focus();
  }
  function keepDeal(){cancelDraft=null;refs.cancelAgreed.checked=false;refs.cancelPanel.hidden=true;refs.cancelDeal.focus();update();}
  async function cancelDeal(){await run(async current=>{
    if(!cancelDraft||!refs.cancelAgreed.checked||!deal||deal.canCancel!==true||deal.id!==cancelDraft.id||board.context.warId!==cancelDraft.warId)throw new Error('Review your current deal before cancelling.');
    const chosen=cancelDraft;uncertain=true;update();const data=await call('cancel',{id:chosen.id,operationId:chosen.operationId,expected:chosen.expected,cancelConfirmed:true});if(!current())return;
    accept(data);cancelDraft=null;refs.cancelAgreed.checked=false;refs.cancelPanel.hidden=true;
    const pending=deal?.cancellationPending===true;say(pending?'Cancellation pending. Check My Deal, then retry.':'Deal cancelled. The active sheet pairing was removed.',pending);
  });}
  function profileLink(name,memberId){const e=node(memberId?'a':'span',name);if(memberId){e.href='https://www.torn.com/profiles.php?XID='+Number(memberId);e.target='_blank';e.rel='noopener noreferrer';}return e;}
  function renderWeapon(){
    refs.weapon.replaceChildren();
    for(const w of member?.weapons||[]){const option=node('option',w.name+' · damage '+w.damage+' · accuracy '+w.accuracy+(w.warlordPercent?' · Warlord +'+w.warlordPercent+'%':''));option.value=w.uid;refs.weapon.append(option);}
    refs.weapon.value=member?.weapon?.uid||'';refs.weaponWrap.hidden=!member?.weapons.length;
    refs.loadout.textContent=member?['strength','defense','speed','dexterity'].map(k=>k+': '+Number(member.stats[k]).toLocaleString()).join(' · ')+'\n'+(member.armor.length?'Armor detected. ':'')+'Private loadout stays on this device.':'';
  }
  function renderMatches(){
    refs.matches.replaceChildren();
    if(!verified){refs.matches.append(note('Connect your own account to find a partner.'));return;}
    if(deal){refs.matches.append(note('You already have a contract or pending contact.'),button('Open My Deal',()=>open('mine')));return;}
    if(!member||!loaded){refs.matches.append(note('Load your stats, equipped gear and FFScouter estimates when you are ready.'));return;}
    const matches=D.recommend(member,enemies,board.contracts,{});
    refs.matches.append(node('p',matches.length+' suitable, unbooked opponents. Baseline estimates exclude chain, faction and other situational bonuses.','wch-muted'));
    if(!matches.length){refs.matches.append(note('No suitable unbooked matches with usable estimates. Refresh later or arrange a deal manually.'));return;}
    const shown=matches.slice(0,20),chosen=shown.find(r=>r.enemy.id===selectedMatchId)||shown[0];selectedMatchId=chosen.enemy.id;
    const table=node('table',undefined,'wch-match-table'),thead=node('thead'),heading=node('tr'),tbody=node('tbody');table.setAttribute('aria-label','Available med-out partners');
    for(const [label,cls] of [['Partner',''],['Respect / hit',''],['Fit','wch-fit-col'],['Review','']]){const th=node('th',label,cls);th.scope='col';heading.append(th);}thead.append(heading);
    for(const result of shown){
      const m=result.enemy,row=node('tr',undefined,'wch-match');row.dataset.selected=String(m.id===selectedMatchId);
      const person=node('td');person.append(profileLink(m.name,m.id),node('span','Lv '+m.level,'wch-level'));
      const respect=node('td',result.respect.toFixed(2),'wch-number'),fit=node('td',result.fit,'wch-fit-col'),action=node('td');
      const review=button(m.id===selectedMatchId?'Selected':'Review',()=>{selectedMatchId=m.id;renderMatches();refs.matches.querySelector('[data-wch-review="'+m.id+'"]').focus();});review.setAttribute('aria-label','Review '+m.name);review.setAttribute('aria-pressed',String(m.id===selectedMatchId));review.dataset.wchReview=String(m.id);action.append(review);row.append(person,respect,fit,action);tbody.append(row);
    }
    table.append(thead,tbody);refs.matches.append(table);
    const result=chosen,m=result.enemy,detail=node('section',undefined,'wch-match-detail'),head=node('div',undefined,'wch-row'),identity=node('div');identity.append(profileLink(m.name,m.id),node('p',result.fit+' · estimate '+result.confidence,'wch-muted'));
    const claim=button('Reserve and prepare message',()=>reserve(m),'tsui-primary');claim.dataset.wchAction='reserve';head.append(identity,claim);
    const why=node('details'),summary=node('summary','Why this match? · Fair fight '+result.ff.toFixed(2));why.append(summary,node('p',result.reason,'wch-muted'));detail.append(head,why);refs.matches.append(detail);
    update();
  }
  function renderMine(){
    if(cancelDraft&&(!deal||cancelDraft.id!==deal.id||cancelDraft.enemyId!==deal.enemyId||cancelDraft.warId!==board?.context.warId)){cancelDraft=null;refs.cancelPanel.hidden=true;refs.cancelAgreed.checked=false;}
    refs.dealSummary.textContent=deal?verified.name+' ↔ '+deal.enemyName+' · '+labels[deal.status]:'No current deal. Find a suitable partner to begin.';
    const pending=deal&&deal.source==='script'&&['reserved','contacted'].includes(deal.status);
    refs.contact.hidden=!pending||reviewing;refs.agreement.hidden=!pending||!reviewing;
    refs.recovered.hidden=deal?.confirmationPending!==true;
    if(deal&&(deal.status==='confirmed'||deal.source==='manual'))refs.dealDetails.textContent=[deal.hits?deal.hits+' hits':'',deal.time?'Time: '+deal.time+' TCT':'',deal.warlord?'Warlord: '+deal.warlord:'',deal.notes||''].filter(Boolean).join('\n');else refs.dealDetails.textContent='';
    refs.cancelDeal.hidden=deal?.canCancel!==true;refs.cancelDeal.textContent=deal?.cancellationPending?'Retry cancellation':'Cancel deal';
    refs.cancelStatus.hidden=deal?.cancellationPending!==true;refs.cancelStatus.textContent=deal?.cancellationPending?'Cancellation pending. This pairing stays booked until cleanup finishes.'+(deal.cancellationError==='CONFLICT'?' The sheet changed; ask your coordinator to review it before retrying.':' Refresh Contracts or retry cancellation.'):'';
    const projection=deal?.source==='script'&&deal.status==='confirmed'&&typeof deal.mainSheetSynced==='boolean'&&!deal.cancellationPending;
    refs.syncStatus.hidden=!projection;refs.syncMain.hidden=!projection||deal.mainSheetSynced||board?.context.ended===true;
    refs.syncStatus.dataset.error=String(projection&&!deal.mainSheetSynced);
    refs.syncStatus.textContent=!projection?'':deal.mainSheetSynced?'Also recorded on the main War Contracts tab.':deal.mainSheetError==='CONFLICT'?'Confirmed in Script Contracts. A manual value or booking conflicts with the main-sheet update. Review the main sheet, then retry.':deal.mainSheetError==='WAR_ENDED'||deal.mainSheetError==='CONTEXT_CHANGED'?'Confirmed in Script Contracts. The war changed or ended before the main-sheet update. Ask your sheet coordinator to review it.':'Confirmed in Script Contracts. The main-sheet update is pending. Check the sheet, then retry.';
    if(pending&&(draftDealId!==deal.id||deal.confirmationPending)){
      const initial=draftDealId!==deal.id,before=JSON.stringify(terms());draftDealId=deal.id;
      refs.hits.value=String(deal.hits||board.context.maxHits);refs.time.value=deal.time||(!deal.confirmationPending?D.warDetails(board.context).dealTime:'');refs.online.value=deal.onlineWindow??'';refs.warlord.checked=deal.warlord?deal.warlord==='Yes':!!member?.weapon?.warlordPercent;refs.notes.value=deal.notes||'';
      if(initial||before!==JSON.stringify(terms())){refs.agreed.checked=false;preview();}
      if(initial)draftMessage();
    }
    update();
  }
  function renderContracts(){
    refs.contracts.replaceChildren();
    if(!board){refs.contracts.append(note('Connect or refresh to see contracts from the manual sheet and this script.'));return;}
    const query=D.normalizeName(refs.search.value);
    const rows=board.contracts.filter(r=>r.status!=='cancelled'&&D.normalizeName([r.ourName,r.enemyName,r.notes,labels[r.status]].join(' ')).includes(query));
    refs.contracts.append(node('p',rows.length+' current contracts · checked '+new Date(board.at).toLocaleTimeString()+' · manual values are preserved','wch-muted'));
    for(const r of rows.slice(0,200)){
      const card=node('details',undefined,'wch-contract'),head=node('summary'),pair=node('span',undefined,'wch-contract-pair');pair.append(node('span',r.ourName),node('span',' ↔ ','wch-muted'),node('span',r.enemyName));
      const brief=node('span',[r.hits?r.hits+' hits':'',r.time?r.time+' TCT':''].filter(Boolean).join(' · '),'wch-muted');head.append(pair,brief,node('span',labels[r.status],'wch-tag'));
      const links=node('div',undefined,'wch-row');links.append(profileLink(r.ourName,r.ourId),node('span','↔'),profileLink(r.enemyName,r.enemyId));card.append(head,links,node('p',[r.onlineWindow?'Online: '+r.onlineWindow+' TCT':'',r.warlord?'Warlord: '+r.warlord:''].filter(Boolean).join(' · '),'wch-muted'));
      if(r.notes)card.append(node('p',r.notes));refs.contracts.append(card);
      if(r.source==='script'&&r.status==='confirmed'&&r.mainSheetSynced===false)card.append(node('p','Main sheet update pending','wch-muted'));
    }
    if(rows.length>200)refs.contracts.append(note('Showing the first 200. Search to narrow the results.'));
  }
  function render(){if(!ui)return;renderWeapon();renderMatches();renderMine();renderContracts();update();}
  function build(){
    if(ui)return;
    const find=node('div',undefined,'wch-page'),mine=node('div',undefined,'wch-page'),contracts=node('div',undefined,'wch-page'),connection=node('div',undefined,'wch-page');
    refs.context=node('p',undefined,'wch-context');refs.load=button('Find my matches',loadMatches,'tsui-primary');refs.loadout=node('p',undefined,'wch-muted');refs.loadout.style.whiteSpace='pre-wrap';
    refs.weapon=node('select');refs.weapon.id='wch-weapon';refs.weaponWrap=field('Weapon planned for these hits',refs.weapon);refs.matches=node('div',undefined,'wch-list');
    refs.loadoutWrap=node('details',undefined,'wch-loadout');refs.loadoutWrap.append(node('summary','Your stats & gear'),refs.loadout);
    const findToolbar=node('div',undefined,'wch-toolbar');findToolbar.append(node('h2','Available partners'),refs.load);
    find.append(findToolbar,refs.weaponWrap,refs.loadoutWrap,refs.matches,node('p','Stripped-opponent estimates, not win guarantees. Paired players stay hidden.','wch-muted'));
    refs.weapon.addEventListener('change',()=>{if(member){member.weapon=member.weapons.find(w=>w.uid===refs.weapon.value)||member.weapon;renderMatches();}});
    refs.dealSummary=node('h2');refs.dealDetails=node('p',undefined,'wch-summary');refs.contact=node('div',undefined,'wch-form');refs.template=node('select');
    for(const [value,label] of [['invite','Med-out invitation'],['short','Short invitation'],['followup','Follow-up']]){const option=node('option',label);option.value=value;refs.template.append(option);}
    refs.message=node('textarea');refs.message.id='wch-message';refs.message.maxLength=2000;refs.copy=button('Copy message',copyMessage);refs.sent=button('Message sent',()=>transition('sent'));refs.release=button('Release pending contact',()=>transition('release'));refs.review=button('Review agreement',()=>{reviewing=true;renderMine();preview();refs.hits.focus();});
    refs.template.addEventListener('change',draftMessage);const contactActions=node('div',undefined,'wch-actions');contactActions.append(refs.copy,refs.sent,refs.review,refs.release);refs.contact.append(field('Quick message',refs.template),field('Edit before copying',refs.message),node('p','Send the message yourself. Copying does not mark it sent.','wch-muted'),contactActions);
    refs.agreement=node('div',undefined,'wch-form');refs.hits=input('number','hits');refs.hits.min='1';refs.hits.step='1';refs.online=input('text','online');refs.online.maxLength=120;refs.time=input('text','time');refs.time.maxLength=80;refs.warlord=input('checkbox','warlord');refs.notes=node('textarea');refs.notes.id='wch-notes';refs.notes.maxLength=1000;
    refs.agreed=input('checkbox','agreed');refs.finalReview=input('checkbox','final-review');refs.preview=node('p',undefined,'wch-note wch-summary');refs.confirm=button('Confirm and save deal',confirm,'tsui-primary');
    const grid=node('div',undefined,'wch-grid');grid.append(field('Agreed hits',refs.hits),field('Online window (TCT)',refs.online),field('Coordinated time (TCT)',refs.time),check('Warlord needed',refs.warlord));
    const agreementHeading=node('div',undefined,'wch-toolbar');agreementHeading.append(node('h3','Review the agreed deal'),button('Back to message',()=>{reviewing=false;renderMine();refs.review.focus();}));
    refs.agreement.append(agreementHeading,grid,field('Notes / deal terms',refs.notes),check('The other player agreed to strip for my hits.',refs.agreed),refs.preview,check('I reviewed these exact terms and both players agreed.',refs.finalReview),refs.confirm);
    for(const e of [refs.hits,refs.online,refs.time,refs.warlord,refs.notes])e.addEventListener('input',preview);
    refs.agreed.addEventListener('change',update);refs.finalReview.addEventListener('change',update);
    refs.recovered=note('Previous save terms recovered. Review and retry this exact agreement, or release the pending contact to start different terms.');refs.recovered.hidden=true;
    refs.syncStatus=note('');refs.syncStatus.hidden=true;refs.syncMain=button('Retry main sheet sync',retryMain);refs.syncMain.hidden=true;
    refs.cancelDeal=button('Cancel deal',beginCancellation,'wch-danger');refs.cancelDeal.hidden=true;refs.cancelStatus=note('');refs.cancelStatus.hidden=true;
    refs.cancelPanel=node('section',undefined,'wch-cancel-panel');refs.cancelPanel.hidden=true;refs.cancelPanel.setAttribute('role','group');refs.cancelPanel.setAttribute('aria-label','Cancel deal confirmation');refs.cancelHeading=node('h3');refs.cancelAgreed=input('checkbox','cancel-agreed');refs.cancelSubmit=button('Confirm cancellation',cancelDeal,'wch-danger');refs.keepDeal=button('Keep deal',keepDeal);
    const cancelActions=node('div',undefined,'wch-actions');cancelActions.append(refs.keepDeal,refs.cancelSubmit);refs.cancelPanel.append(refs.cancelHeading,node('p','Remove this pairing from active contracts and the main sheet. Keep a Cancelled history entry. Tell your opponent about the cancellation yourself.','wch-muted'),check('I confirm cancelling this deal.',refs.cancelAgreed),cancelActions);refs.cancelAgreed.addEventListener('change',update);
    mine.append(refs.dealSummary,refs.dealDetails,refs.syncStatus,refs.syncMain,refs.cancelStatus,refs.cancelDeal,refs.cancelPanel,refs.recovered,refs.contact,refs.agreement);
    refs.refresh=button('Refresh contracts',()=>run(async current=>{if(await refresh(current))say('Current contracts refreshed from the sheet.');}));refs.search=input('search','search');refs.search.placeholder='Search member, opponent, status or notes';refs.search.addEventListener('input',renderContracts);refs.contracts=node('div',undefined,'wch-list');
    const contractToolbar=node('div',undefined,'wch-toolbar');contractToolbar.append(field('Search contracts',refs.search),refs.refresh);contracts.append(contractToolbar,refs.contracts);
    refs.endpoint=input('url','endpoint');refs.endpoint.placeholder='https://script.google.com/macros/s/.../exec';refs.endpoint.value=settings.endpoint;
    refs['torn-key']=input('password','torn-key');refs['torn-key'].maxLength=16;refs['torn-key'].autocomplete='new-password';refs['ff-key']=input('password','ff-key');refs['ff-key'].maxLength=16;refs['ff-key'].autocomplete='new-password';
    refs.identity=node('p',undefined,'wch-muted');refs.keyStatus=node('p',undefined,'wch-muted');refs.connect=button('Save and reconnect',connect,'tsui-primary');
    refs.connectionState=node('h3');refs.sheetState=node('p',undefined,'wch-muted');refs.estimateState=node('p',undefined,'wch-muted');
    const state=node('section',undefined,'wch-connection-state');state.append(refs.connectionState,refs.identity,refs.sheetState,refs.keyStatus);
    const warCard=node('section',undefined,'wch-war');refs.warTitle=node('h3');const warFields=node('dl',undefined,'wch-war-fields');
    for(const [label,key] of [['War status','warState'],['Starts (TCT)','warStart'],['Ranked war','warId'],['Deal limit','warHits']]){const item=node('div');refs[key]=node('dd');item.append(node('dt',label),refs[key]);warFields.append(item);}
    warCard.append(refs.warTitle,warFields);
    refs.connectionSettings=node('details',undefined,'wch-settings');refs.connectionSettings.open=!settings.endpoint;
    const settingsForm=node('div',undefined,'wch-form');settingsForm.append(field('Faction contracts service address',refs.endpoint),field('Personal Torn key (session fallback)',refs['torn-key']),field('FFScouter key (optional; otherwise use my Torn key)',refs['ff-key']),refs.estimateState,refs.connect,button('Forget keys on this page',()=>{sessionKey='';sessionFF='';sharedKey=null;refs['torn-key'].value='';refs['ff-key'].value='';resetAccount();say('Personal session keys cleared. Reconnect to check any existing deal.');}));
    refs.connectionSettings.append(node('summary','Connection settings'),settingsForm);
    const privacy=node('details',undefined,'wch-privacy');privacy.append(node('summary','API access and privacy'),node('p','Your Torn key verifies faction membership with Torn and your configured sheet service. Matching reads your stats/gear and sends the estimate key to FFScouter. Keys, private stats and gear are never written to the sheet. Personal and separate FFScouter keys stay in this page session. Hub access remains controlled in Hub API Keys. Use User battlestats/equipment, Key info and public Faction members/wars/rankedwars permissions; register the estimate key at ffscouter.com.'));
    connection.append(node('h2','Connection'),node('p','Your saved faction sheet and ranked war are checked automatically when you open this tool.','wch-muted'),state,warCard,refs.connectionSettings,privacy);
    refs.status=node('p','Configure Connection to begin.','wch-status');refs.status.setAttribute('role','status');refs.status.setAttribute('aria-live','polite');refs.recovery=button('Check saved state',()=>run(async current=>{if(await refresh(current))say('Saved state checked. Review My Deal and Current Contracts before continuing.');}));refs.recovery.hidden=true;
    themeClient=createScriptUiThemeClient({doc:document,win:window,scriptId:id,read:()=>get('appearance',null),write:value=>put('appearance',value),onChange:theme=>ui?.setTheme(theme)});
    ui=createTornScriptUI({doc:document,win:window,id,title:'War Contracts',surface:'floating',applyTheme:applyScriptUiTheme,themeClient,ownsThemeClient:true,readLayout:()=>get('layout',{version:1,desktop:{x:30,y:45,width:720,height:620,selected:'find'},mobile:{x:0,y:0,width:390,height:790,selected:'find'}}),writeLayout:value=>put('layout',value),sections:[{id:'find',label:'Find Partner',node:find},{id:'mine',label:'My Deal',node:mine},{id:'contracts',label:'Current Contracts',node:contracts},{id:'connection',label:'Connection',headerAction:'Set',node:connection}],onSelect:value=>{selected=value;landingPending=false;},onClose:cancel,onVisibilityChange:active=>{if(!active)cancel();}});
    ui.root.classList.add('wch-root');ui.root.querySelector('.tsui-nav [aria-label="Find Partner"]').textContent='Matches';ui.root.querySelector('.tsui-nav [aria-label="Current Contracts"]').textContent='Contracts';ui.root.querySelector('.tsui-header-actions button').textContent='Settings';
    ui.root.querySelector('.tsui-body').prepend(refs.context);ui.root.append(refs.recovery,refs.status);const style=node('style');style.textContent=warContractsStyles();(document.head||document.documentElement).append(style);cleanups.push(()=>style.remove());render();
  }
  function open(section){if(disposed)return false;const smart=section===undefined;build();ui.show();ui.collapse(false);if(ui.getState().minimized)ui.restore();ui.select(section||(deal?'mine':'find'));landingPending=smart;ui.focus();update();autoLoad();return true;}
  function registerAdapter(){
    adapter?.();sharedKey=null;
    keyPolicyReady=false;
    credentialClient=createHubCredentialClient({storage:createHubCredentialStorage(env,'war-contracts-hub-private-v1'),crypto:globalThis.crypto,scriptId:id});
    adapter=registerTornScriptMenu(document,window,{id,name:'War Contracts',version:WAR_CONTRACTS_VERSION,icon:'war',category:'Faction',url:'https://www.torn.com/factions.php?step=your&type=1',actions:[{id:'open',label:'Find a partner'},{id:'contracts',label:'Current contracts'},{id:'mine',label:'My deal'},{id:'settings',label:'Connection'}],capabilities:['credentials']},{open:()=>open(),contracts:()=>open('contracts'),mine:()=>open('mine'),settings:()=>open('connection')},{credentialClient,sharedProviders:['torn'],credentialContext:true,credentialScope:'script',
      onCredentialPolicyReady(value,isManaged){keyPolicyReady=value;hubManaged ||= isManaged('torn');update();autoLoad();},
      onHubManagementChange(provider,managed){if(provider==='torn'&&managed){hubManaged=true;update();}},
      onCredentialPolicyFailure(){keyPolicyReady=false;resetAccount();say('Hub enrollment could not be saved. Reload to retry.',true);},
      onSharedCredentialChange(provider,value){if(provider!=='torn')return;const old=key();sharedKey=validKey(value)?value:null;if(key()!==old&&(verified||member||board||old)){resetAccount();say('Hub key changed. Reconnect to verify your account.');}else update();autoLoad();}});
  }
  const launcher=button('War Contracts',()=>open());launcher.id='wch-launcher';launcher.setAttribute('aria-label','Open war contracts');launcher.style.cssText='position:fixed;left:12px;bottom:12px;z-index:99999;min-height:44px;padding:10px 14px;border:1px solid #64748b;border-radius:6px;background:#142131;color:#eef4fa;cursor:pointer';(document.body||document.documentElement).append(launcher);
  const hideFallback=()=>{launcher.hidden=!!document.getElementById('tsh-launcher');};hideFallback();listen(document,'torn-script-hub:v1:discover',hideFallback);
  function activity(event){if(event.type==='tornpda:tabState'){const s=event.detail;if(typeof s?.isActiveTab!=='boolean'||typeof s?.isWebViewVisible!=='boolean')return;pdaActive=s.isActiveTab&&s.isWebViewVisible;}if(!awake())cancel();else{update();autoLoad();}}
  function teardown(){if(disposed)return;disposed=true;cancel();adapter?.();ui?.destroy();launcher.remove();marker.remove();sessionKey='';sessionFF='';sharedKey=null;member=null;enemies=[];board=null;for(const cleanup of cleanups.splice(0))cleanup();}
  listen(document,'visibilitychange',activity);listen(window,'tornpda:tabState',activity);listen(window,'hashchange',cancel);listen(window,'popstate',cancel);listen(window,'pagehide',event=>{if(event.persisted)cancel();else teardown();});
  if(typeof window.PDA_getTabState==='function')Promise.resolve(window.PDA_getTabState()).then(state=>activity({type:'tornpda:tabState',detail:state})).catch(()=>{pdaActive=false;cancel();});
  const menu=typeof GM_registerMenuCommand==='function'?GM_registerMenuCommand:env.GM?.registerMenuCommand?.bind(env.GM);menu?.('Open war contracts',()=>open());
  void(async()=>{const saved=await get('settings',null);if(disposed)return;if(saved&&typeof saved==='object')settings={endpoint:D.endpoint(saved.endpoint)||''};ready=true;registerAdapter();if(ui){refs.endpoint.value=settings.endpoint;refs.connectionSettings.open=!settings.endpoint;update();autoLoad();}})().catch(()=>{ready=true;say('Saved connection settings could not be loaded.',true);});
}
