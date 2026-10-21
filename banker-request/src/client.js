function installBankerRequestHub(){
  'use strict';
  if(document.getElementById('brh-installation'))return;
  const marker=document.createElement('meta');marker.id='brh-installation';(document.head||document.documentElement).append(marker);
  const D=BankerRequestDomain, id='banker-request', prefix='banker-request-hub:v1:';
  const env=getHubPlatformEnvironment();
  if(typeof GM_xmlhttpRequest==='function')env.GM_xmlhttpRequest=GM_xmlhttpRequest;
  if(typeof PDA_httpPost==='function')env.PDA_httpPost=PDA_httpPost;
  env.fetch=window.fetch?.bind(window);
  const credentialStore=createHubCredentialStorage(env,'brh-hub-private-v1'),hubStorageAvailable=credentialStore.eligible;
  const http=createBankerHttp(env), cleanups=[];
  let disposed=false,ready=false,settings={endpoint:'',useHub:false,remember:false},sessionKey='',sharedKey=null;
  let identity=null,identityAt=0,pendingRequest=null,reviewRequest=null,cooldownUntil=0,job=false,generation=0;
  let ui=null,themeClient=null,adapter=null,native=null,selected='request',pdaActive=typeof window.PDA_getTabState!=='function';
  let pendingExpired=false,connectionQueue=Promise.resolve();
  let storageQueue=Promise.resolve(),credentialClient=null,cooldownTimer=null;
  let keyPolicyReady=false,hubManaged=false,hubFallback=false;
  let linkAttempt=null;
  let adapterMetadata=null,bankerVisible=false;
  const refs={};
  const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
  function listen(target,event,callback,options){target.addEventListener(event,callback,options);cleanups.push(()=>target.removeEventListener(event,callback,options));}
  async function get(key,fallback){try{const value=typeof GM_getValue==='function'?await GM_getValue(prefix+key,fallback):typeof env.GM?.getValue==='function'?await env.GM.getValue(prefix+key,fallback):fallback;return value===undefined?fallback:value;}catch(_){return fallback;}}
  function put(key,value){const run=async()=>{if(value===null){if(typeof GM_deleteValue==='function')await GM_deleteValue(prefix+key);else if(typeof env.GM?.deleteValue==='function')await env.GM.deleteValue(prefix+key);}else if(typeof GM_setValue==='function')await GM_setValue(prefix+key,value);else if(typeof env.GM?.setValue==='function')await env.GM.setValue(prefix+key,value);else throw new Error('Settings storage is unavailable.');};const task=storageQueue.then(run);storageQueue=task.catch(()=>{});return task;}
  function awake(){return !disposed&&pdaActive&&document.visibilityState!=='hidden';}
  function usable(){return awake()&&!!ui&&ui.getState().active;}
  function key(){return sharedKey||(keyPolicyReady&&!hubManaged?sessionKey:'');}
  function pageId(){
    const anchors=[...document.querySelectorAll('a[aria-label^="Name:"][href*="profiles.php"],#sidebar a[href*="profiles.php?XID="]')].filter(a=>a.getAttribute('aria-label')?.startsWith('Name:')||(a.parentElement?.tagName==='P'&&/^Name\s*:/.test(a.parentElement.textContent.trim())));
    const ids=new Set();
    for(const a of anchors){try{const url=new URL(a.href);const values=url.searchParams.getAll('XID');if(url.origin!=='https://www.torn.com'||url.pathname!=='/profiles.php'||values.length!==1||!(/^[1-9][0-9]*$/).test(values[0]))return null;const value=Number(values[0]);if(!Number.isSafeInteger(value))return null;ids.add(value);}catch(_){return null;}}
    return ids.size===1?[...ids][0]:null;
  }
  function say(text,error=false){if(!refs.status)return;refs.status.textContent=text;refs.status.dataset.error=String(error);ui?.status(error?'Action needs attention.':'Faction money requests');}
  function button(text,fn,cls){const b=node('button',text,cls);b.type='button';b.addEventListener('click',fn);return b;}
  function field(label,input){const wrap=node('label',undefined,'brh-field');wrap.append(node('span',label),input);return wrap;}
  function input(type,name){const e=node('input');e.type=type;e.id='brh-'+name;refs[name]=e;return e;}
  function cancel(text){generation++;http.abort();job=false;native?.cancel?.();if(cooldownTimer!==null){clearTimeout(cooldownTimer);cooldownTimer=null;}if(refs.key)refs.key.value='';update();if(text)say(text);}
  function syncBankerVisibility(){
    const allowed=identity?.banker===true;
    if(ui){
      refs.reviewPage.hidden=!allowed;
      const button=[...ui.nav.querySelectorAll('button')].find(node=>node.textContent==='Review payout');if(button)button.hidden=!allowed;
      if(!allowed&&ui.getState().selected==='review')ui.select('request');
    }
    if(allowed===bankerVisible)return;
    bankerVisible=allowed;
    if(!allowed){reviewRequest=null;refs.reviewBody?.replaceChildren();native?.dispose();native=null;}
    if(adapterMetadata){adapterMetadata.actions=menuActions();document.dispatchEvent(new CustomEvent('torn-script-hub:v1:discover'));}
  }
  function menuActions(){return [{id:'open',label:'Request money'},{id:'settings',label:'Connection'},...(identity?.banker===true?[{id:'review',label:'Review payout'}]:[])];}
  function update(){
    syncBankerVisibility();
    if(!ui)return;
    const connected=!!identity;
    refs.member.textContent=connected?identity.user.name+' ['+identity.user.id+'] · faction '+identity.user.factionId:'Connect your Torn account to request money.';
    refs.identity.textContent=connected?identity.user.name+' ['+identity.user.id+'] · faction '+identity.user.factionId:'Not verified';
    refs.identityStatus.textContent=connected?(identity.banker?'Banker access verified.':'Faction membership verified.'):'Verify your own key with the faction service.';
    const cooldown=Math.max(0,Math.ceil((cooldownUntil-Date.now())/1000));
    refs.send.disabled=job||!ready||!connected||cooldown>0||!!pendingRequest;
    refs.send.textContent=job?'Sending…':cooldown>0?'Available after '+new Date(cooldownUntil).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'Send request';
    refs.verify.disabled=job||!ready;
    refs.forget.disabled=!ready;
    refs.dismissExpired.hidden=!pendingRequest||!pendingExpired;refs.dismissExpired.disabled=job;
    refs.checkRequest.hidden=!pendingRequest;refs.checkRequest.disabled=job;
    refs.amount.disabled=job||refs.full.checked||!!pendingRequest;
    refs.amountWrap.hidden=refs.full.checked;refs.fullMessage.hidden=!refs.full.checked;
    refs.kindAmount.disabled=job||!!pendingRequest;refs.full.disabled=job||!!pendingRequest;
    refs.connectionHint.hidden=connected;
    refs.keyState.textContent=!keyPolicyReady?'Checking API key connection…':hubManaged?(sharedKey?(hubFallback?'Using approved global fallback from Script Hub.':'Using approved Script Hub Torn key.'):'Managed by Script Hub. Approve Banker Request and select a key in Hub → API Keys.'):sessionKey?'Personal key is available.':'Use an approved Script Hub key, or enter your own Torn API key.';
    refs.personal.hidden=hubManaged;refs.remember.disabled=hubManaged||!keyPolicyReady;
    refs.key.disabled=hubManaged||!keyPolicyReady;
    if(cooldownTimer!==null){clearTimeout(cooldownTimer);cooldownTimer=null;}
    if(cooldown>0&&usable())cooldownTimer=setTimeout(()=>{cooldownTimer=null;update();},Math.max(1,cooldownUntil-Date.now()+30));
  }
  async function call(path,body){
    if(!usable())throw new Error('Open this tool in the active Torn tab before continuing.');
    if(!ready)throw new Error('Connection settings are still loading.');
    if(!keyPolicyReady)throw new Error('API key connection is unavailable. Reload Torn to retry.');
    if(!key())throw new Error(hubManaged?'Approve Banker Request and select a key in Script Hub → API Keys.':'Enter your Torn API key, or approve Banker Request in Script Hub → API Keys.');
    return http.post(D.validateEndpoint(settings.endpoint),key(),path,body);
  }
  function checkOwner(user){
    const own=pageId();
    if(!own)throw new Error('Your logged-in Torn ID is unavailable. Open a normal Torn page and try again.');
    if(!user||user.id!==own||!Number.isSafeInteger(user.factionId)||user.factionId<=0||typeof user.name!=='string'||user.name.length<1||user.name.length>80)throw new Error('The key must belong to the Torn account currently logged in.');
    return {id:user.id,name:user.name,factionId:user.factionId};
  }
  async function verify(){
    if(job)return;
    const own=++generation;job=true;update();say('Verifying your Torn account…');
    try{const response=await call('/v1/identity',{});if(own!==generation||!usable())return;identity={user:checkOwner(response.user),banker:response.banker===true};identityAt=Date.now();settings={...settings,connected:true};await put('settings',settings);if(own!==generation||!usable())return;say('Account verified.');}
    catch(error){if(own===generation){identity=null;say(error.message,true);}}
    finally{if(own===generation){job=false;update();if(identity)autoVerify();}}
  }
  async function send(checkPrevious=false){
    if(job)return;
    if(!identity){say('Verify your own Torn account in Connection first.',true);return;}
    const own=++generation;job=true;update();
    let operation=pendingRequest;
    const current=()=>own===generation&&usable()&&pendingRequest===operation;
    try{
      if(!usable())throw new Error('Requests can only be sent from an active Torn tab.');
      if(checkPrevious){if(!pendingRequest)throw new Error('No previous request to check.');}
      else{
        if(pendingRequest)throw new Error('Check your previous request before sending another.');
        if(cooldownUntil>Date.now())throw new Error('Wait until the request cooldown ends.');
        const payload={requestId:crypto.randomUUID(),kind:refs.full.checked?'full':'amount'};
        if(payload.kind==='amount')payload.amount=D.parseAmount(refs.amount.value);
        operation={endpoint:settings.endpoint,userId:identity.user.id,payload};
        pendingRequest=operation;pendingExpired=false;
        await put('pending',operation);
        if(!current())return;
      }
      if(!current())return;
      if(operation.endpoint!==settings.endpoint||operation.userId!==identity.user.id)throw new Error('Reconnect to the same relay and account to check the previous request.');
      say(checkPrevious?'Checking the previous request without another ping…':'Sending your request…');
      // Refresh identity after a stale proof, never trust a key switched to another owner.
      if(Date.now()-identityAt>60000){const proof=await call('/v1/identity',{});if(own!==generation||!usable())return;identity={user:checkOwner(proof.user),banker:proof.banker===true};identityAt=Date.now();if(operation.userId!==identity.user.id)throw new Error('The account changed. Check the original request with its owner.');}
      if(!current())return;
      const response=await call('/v1/requests',operation.payload);
      if(own!==generation||!usable())return;
      const result=D.readRequest(response.request);
      if(result.userId!==identity.user.id||result.factionId!==identity.user.factionId||result.requestId!==operation.payload.requestId)throw new Error('The request response could not be verified.');
      cooldownUntil=Date.now()+Math.max(0,Math.min(3600,Number(response.retryAfter)||0))*1000;
      await put('cooldown',cooldownUntil);
      if(!current())return;
      if(result.status==='sent'||result.status==='failed'){
        await put('pending',null);
        if(!current())return;
        pendingRequest=null;pendingExpired=false;
      }
      if(own!==generation||!usable())return;
      refs.sent.hidden=false;refs.sentTitle.textContent=result.status==='sent'?'Request sent':result.status==='failed'?'Discord rejected the request':'Delivery needs checking';
      refs.sentAmount.textContent=result.kind==='full'?'Full faction balance':D.money(result.amount);
      refs.sentDetail.textContent=result.status==='sent'?'The bankers have been notified.':result.status==='failed'?'Ask a faction administrator to check the Discord connection. This request will not be resent automatically.':'The request may have reached Discord. Check with a banker before making another request.';
      say(result.status==='sent'?'Request sent.':refs.sentDetail.textContent,result.status!=='sent');
    }catch(error){if(own===generation){
      if(['NO_BALANCE','OVER_BALANCE','BALANCE_PERMISSION','BALANCE_UNAVAILABLE'].includes(error.code)&&current()){
        try{await put('pending',null);if(!current())return;pendingRequest=null;pendingExpired=false;}catch(_){/* Keep the recovery marker if local storage cannot clear it. */}
      }
      if(own!==generation)return;if(error.code==='EXPIRED'&&pendingRequest===operation)pendingExpired=true;if(error.retryAfter)cooldownUntil=Date.now()+error.retryAfter*1000;say(error.message+(pendingRequest?' Use Check previous request to avoid a duplicate ping.':''),true);
    }}
    finally{if(own===generation){job=false;update();}}
  }
  function queueConnection(action){const task=connectionQueue.then(action);connectionQueue=task.catch(()=>{});return task;}
  function saveConnection(){
    if(job)return;
    try{
      const endpoint=D.validateEndpoint(refs.endpoint.value),incoming=refs.key.value.trim();
      if(incoming&&!/^[A-Za-z0-9]{16}$/.test(incoming))throw new Error('A Torn key must contain exactly 16 letters and numbers.');
      if(!keyPolicyReady)throw new Error('API key connection is still loading or unavailable. Reload Torn to retry.');
      const next={endpoint,useHub:hubManaged,remember:!hubManaged&&refs.remember.checked,connected:false},personal=hubManaged?'':incoming||sessionKey;
      if(!sharedKey&&!personal)throw new Error(hubManaged?'Approve Banker Request and select a key in Script Hub → API Keys.':'Enter your Torn API key, or approve Banker Request in Script Hub → API Keys.');
      const own=++generation;job=true;update();say('Connecting to your faction service…');
      return queueConnection(async()=>{
        await put('settings',next);await put('personal-key',next.remember?personal:null);
        if(own!==generation||!usable())return;
        settings=next;sessionKey=personal;identity=null;identityAt=0;linkAttempt=null;native?.dispose();native=null;
        refs.key.value='';job=false;await verify();
      }).catch(error=>{if(own===generation)say(error.message,true);}).finally(()=>{if(own===generation){job=false;update();}});
    }catch(error){say(error.message,true);}
  }
  function forgetKey(){
    if(!ready)return;
    cancel();sessionKey='';identity=null;refs.remember.checked=false;update();
    return queueConnection(async()=>{
      sessionKey='';identity=null;settings={...settings,remember:false,connected:false};
      await put('personal-key',null);await put('settings',settings);update();say('Personal key forgotten.');
    }).catch(error=>say(error.message,true));
  }
  async function dismissExpired(){
    if(job||!pendingRequest||!pendingExpired)return;
    if(!window.confirm('Check Discord and with a banker before dismissing this expired request. This only clears this device; server history is unchanged.'))return;
    const operation=pendingRequest,own=++generation;job=true;update();
    try{await put('pending',null);if(own!==generation||pendingRequest!==operation)return;pendingRequest=null;pendingExpired=false;say('Expired request dismissed on this device.');}
    catch(error){if(own===generation)say(error.message,true);}
    finally{if(own===generation){job=false;update();}}
  }
  async function copy(text){try{if(typeof GM_setClipboard==='function')await GM_setClipboard(text);else if(typeof env.GM?.setClipboard==='function')await env.GM.setClipboard(text);else await navigator.clipboard.writeText(text);say('Copied.');}catch(_){say('Copy is unavailable. Select the displayed value and copy it manually.',true);}}
  function nativeAdapter(){if(!native)native=createBankerNativeAdapter({doc:document,win:window,awake,onGuard:reason=>say('Payout blocked: '+reason,true)});return native;}
  async function prefillVerified(request,view,own,waitForForm=false){
    const outcome=await nativeAdapter().prefill(request,{waitForForm});if(own!==generation||!usable())return;
    view.nativeStatus.textContent=outcome.reason;view.nativeStatus.dataset.error=String(!outcome.ready);
    if(outcome.ready){view.row('Amount prepared',D.money(outcome.plan.amount));job=false;update();say('Form prefilled. Review and submit it in Torn yourself.');ui.minimize();}else say(outcome.reason,true);
  }
  function showReview(request){
    refs.reviewBody.replaceChildren();refs.reviewBody.append(node('h2',request.name),node('p','Torn ID '+request.userId+' · verified faction request','brh-muted'));
    const facts=node('dl',undefined,'brh-facts');
    const row=(label,value)=>{const line=node('div');line.append(node('dt',label),node('dd',value));facts.append(line);};
    row('Requested',request.kind==='full'?'Full faction balance':D.money(request.amount));
    row('Expires',new Date(request.expiresAt).toLocaleTimeString());refs.reviewBody.append(facts);
    const nativeStatus=node('p','Open faction Controls > Give to User. The current native recipient and balance must be verified.','brh-note');refs.reviewBody.append(nativeStatus);
    const prefill=button('Check balance and prefill Torn form',async()=>{
      if(job||!usable())return;
      const own=++generation;job=true;prefill.disabled=true;
      try{
        // Re-resolve on every explicit prefill, rechecking banker authorization and expiry.
        const response=await call('/v1/requests/resolve',{token:request.token});if(own!==generation||!usable())return;
        const fresh=D.readRequest(response.request);if(fresh.userId!==request.userId||fresh.factionId!==request.factionId||fresh.kind!==request.kind||fresh.amount!==request.amount)throw new Error('The request changed. Resolve it again.');
        const proof=await call('/v1/identity',{});if(own!==generation||!usable())return;checkOwner(proof.user);if(!proof.banker)throw new Error('Banker access is required.');
        await prefillVerified(fresh,{nativeStatus,row},own);
      }catch(error){if(own===generation)say(error.message,true);}
      finally{if(own===generation){job=false;prefill.disabled=false;update();}}
    },'tsui-primary');
    const actions=node('div',undefined,'brh-stack');actions.append(prefill,button('Copy member ID',()=>copy(String(request.userId))));
    if(request.kind==='amount')actions.append(button('Copy requested amount',()=>copy(String(request.amount))));
    refs.reviewBody.append(actions,node('p','No money is sent automatically. Closing this browser page or changing route clears the prepared amount.','brh-muted'));
    return {nativeStatus,row};
  }
  async function resolveReview(autoPrepare=false){
    if(job)return;
    const token=D.parseRequestLink(window.location)||refs.token.value.trim();
    if(!D.uuid(token)){say('Open a valid banker request link or paste its request ID.',true);return;}
    const own=++generation;job=true;update();say('Verifying banker access and request…');
    try{const proof=await call('/v1/identity',{});if(own!==generation||!usable())return;identity={user:checkOwner(proof.user),banker:proof.banker===true};identityAt=Date.now();update();if(!identity.banker)throw new Error('This account is not configured as a banker.');ui.select('review');const response=await call('/v1/requests/resolve',{token});if(own!==generation||!usable())return;reviewRequest=D.readRequest(response.request);if(reviewRequest.factionId!==identity.user.factionId)throw new Error('The request belongs to another faction.');const view=showReview(reviewRequest);say('Request verified.');if(autoPrepare)await prefillVerified(reviewRequest,view,own,true);}
    catch(error){if(own===generation){reviewRequest=null;refs.reviewBody.replaceChildren();say(error.message,true);}}
    finally{if(own===generation){job=false;update();}}
  }
  function build(){
    if(ui)return;
    const request=node('div',undefined,'brh-page'),connection=node('div',undefined,'brh-page'),review=node('div',undefined,'brh-page');
    refs.reviewPage=review;
    refs.member=node('p',undefined,'brh-member');refs.connectionHint=button('Open connection',()=>open('connection'));request.append(refs.member,refs.connectionHint);
    const group=node('fieldset',undefined,'brh-kind');group.append(node('legend','What would you like to request?'));
    refs.kindAmount=input('radio','kind-amount');refs.kindAmount.name='brh-kind';refs.kindAmount.checked=true;refs.full=input('radio','kind-full');refs.full.name='brh-kind';
    group.append(field('Specific amount',refs.kindAmount),field('Full balance',refs.full));request.append(group);
    refs.amount=input('text','amount');refs.amount.inputMode='numeric';refs.amount.autocomplete='off';
    refs.amountWrap=field('Amount ($)',refs.amount);refs.amountWrap.classList.add('brh-amount');request.append(refs.amountWrap);
    refs.fullMessage=node('p','Request your full faction balance. The banker checks the current amount before paying.','brh-note');refs.fullMessage.hidden=true;request.append(refs.fullMessage);
    refs.send=button('Send request',()=>send(false),'tsui-primary');refs.checkRequest=button('Check previous request',()=>send(true));refs.checkRequest.hidden=true;refs.dismissExpired=button('Dismiss expired request',dismissExpired);refs.dismissExpired.hidden=true;request.append(refs.send,refs.checkRequest,refs.dismissExpired,node('p','Notifies @Bankers · no Discord account needed','brh-muted'));
    refs.sent=node('section',undefined,'brh-note');refs.sent.setAttribute('role','status');refs.sent.hidden=true;refs.sentTitle=node('h2');refs.sentAmount=node('p',undefined,'brh-total');refs.sentDetail=node('p');refs.sent.append(refs.sentTitle,refs.sentAmount,refs.sentDetail);request.append(refs.sent);
    refs.endpoint=input('url','endpoint');refs.endpoint.placeholder='https://your-relay.your-subdomain.workers.dev';connection.append(field('Faction relay address',refs.endpoint));
    connection.append(node('p','Use only the relay address supplied by your faction administrator. Your Torn key is sent over HTTPS to that relay and Torn to verify your identity, faction and your own faction balance before a request. Torn’s User money response includes other money fields; the relay ignores those and stores neither the response, your balance nor the raw key. Requests share your name, Torn ID and requested amount with the bankers in Discord.','brh-note'));
    refs.keyState=node('p',undefined,'brh-note');connection.append(refs.keyState);
    refs.personal=node('div',undefined,'brh-page');refs.key=input('password','key');refs.key.autocomplete='new-password';refs.key.maxLength=16;refs.personal.append(field('Torn API key (without Script Hub)',refs.key));
    refs.personal.append(node('p','To send requests, use your own key with User basic, faction and money selections (custom or Limited access). Hub keys are detected automatically after you approve Banker Request in Hub → API Keys.','brh-muted'));
    refs.remember=input('checkbox','remember');refs.personal.append(field('Remember personal key on this device',refs.remember),node('p','Off by default. Saved keys are accessible to your script manager; Torn PDA compatibility storage is not encrypted.','brh-muted'));connection.append(refs.personal);
    refs.identity=node('p',undefined,'brh-member');refs.identityStatus=node('p',undefined,'brh-muted');refs.verify=button('Connect',saveConnection,'tsui-primary');refs.forget=button('Forget personal key',forgetKey);connection.append(refs.identity,refs.identityStatus,refs.verify,refs.forget);
    refs.token=input('text','token');refs.token.autocomplete='off';review.append(field('Request ID from Discord link',refs.token),button('Verify request',()=>resolveReview(!!D.parseRequestLink(window.location))));refs.reviewBody=node('div');review.append(refs.reviewBody);
    refs.status=node('p',ready?'Enter your connection details and press Connect.':'Connection settings are loading…','brh-status');refs.status.setAttribute('role','status');
    themeClient=createScriptUiThemeClient({doc:document,win:window,scriptId:id,read:()=>get('appearance',null),write:value=>put('appearance',value),onChange:theme=>ui?.setTheme(theme)});
    const width=520,initial={version:1,desktop:{x:30,y:50,width,height:690,selected:'request'},mobile:{x:8,y:8,width:390,height:760,selected:'request'}};
    ui=createTornScriptUI({doc:document,win:window,id,title:'Banker request',surface:'floating',applyTheme:applyScriptUiTheme,themeClient,ownsThemeClient:true,readLayout:async()=>await get('layout',null)||initial,writeLayout:value=>put('layout',value),sections:[{id:'request',label:'Request',node:request},{id:'connection',label:'Connection',node:connection},{id:'review',label:'Review payout',node:review}],onSelect:section=>{if(section==='review'&&identity?.banker!==true){selected='request';ui?.select('request');}else selected=section;},onClose:()=>cancel(),onVisibilityChange:active=>{if(!active&&job)cancel('Action stopped while the tool is hidden. Check the previous request if it was sending.');}});
    ui.root.append(refs.status);ui.root.classList.add('brh-root');
    const style=node('style');style.textContent=bankerRequestStyles();(document.head||document.documentElement).append(style);cleanups.push(()=>style.remove());
    refs.kindAmount.addEventListener('change',update);refs.full.addEventListener('change',update);
    refs.endpoint.value=settings.endpoint;refs.remember.checked=settings.remember;
    const token=D.parseRequestLink(window.location);if(token)refs.token.value=token;
    update();
  }
  function autoVerify(){
    if(!ready||!settings.connected||!key()||job||!usable())return;
    const token=D.parseRequestLink(window.location);
    if(token&&linkAttempt!==token){linkAttempt=token;void resolveReview(true);}
    else if(!token&&!identity)void verify();
  }
  function open(section){if(disposed)return false;build();ui.show();ui.collapse(false);if(ui.getState().minimized)ui.restore();const target=section==='review'&&identity?.banker!==true?'request':section;ui.select(target);selected=target;ui.focus();update();autoVerify();return true;}
  function registerAdapter(){
    adapter?.();adapter=null;sharedKey=null;
    credentialClient=createHubCredentialClient({storage:credentialStore,crypto:globalThis.crypto,scriptId:id});
    adapterMetadata={id,name:'Banker Request',icon:'bank',version:BANKER_REQUEST_VERSION,category:'Faction',url:'https://www.torn.com/factions.php?step=your&type=1#/tab=controls',actions:menuActions(),capabilities:['credentials']};
    adapter=registerTornScriptMenu(document,window,adapterMetadata,{open:()=>open('request'),settings:()=>open('connection'),review:()=>open('review')},{credentialClient,sharedProviders:['torn'],credentialContext:true,credentialScope:'script',
      onCredentialPolicyReady(ok,isManaged){keyPolicyReady=ok||!hubStorageAvailable;hubManaged ||= isManaged('torn');update();autoVerify();},
      onHubManagementChange(provider,managed){if(provider==='torn'&&managed&&!hubManaged){hubManaged=true;identity=null;identityAt=0;cancel();update();}},
      onCredentialPolicyFailure(provider){if(provider==='torn'){keyPolicyReady=false;identity=null;cancel('Hub approval could not be saved. Reload Torn to retry.');}},
      onCredentialContext(provider,context){if(provider==='torn'){hubFallback=context.fallback;update();}},
      onSharedCredentialChange(provider,value){if(provider!=='torn')return;const previous=key();sharedKey=typeof value==='string'&&/^[A-Za-z0-9]{16}$/.test(value)?value:null;if(previous!==key()){identity=null;identityAt=0;linkAttempt=null;cancel(sharedKey?'Script Hub key connected. Press Connect to verify your account.':'Script Hub key is unavailable. Approve Banker Request in Hub → API Keys.');autoVerify();}else update();}
    });
  }
  const launcher=button('Banker request',()=>open('request'));launcher.id='brh-launcher';launcher.setAttribute('aria-label','Open banker request');launcher.style.cssText='position:fixed;left:max(12px,env(safe-area-inset-left));bottom:max(12px,env(safe-area-inset-bottom));z-index:99999;min-height:44px;padding:10px 14px;border:1px solid #3e546d;border-radius:8px;background:#111f31;color:#e7f0fa;font:14px system-ui;cursor:pointer';(document.body||document.documentElement).append(launcher);
  const hideFallback=()=>{launcher.hidden=!!document.getElementById('tsh-launcher');};hideFallback();listen(document,'torn-script-hub:v1:discover',hideFallback);
  function activity(event){
    if(event.type==='tornpda:tabState'){const s=event.detail;if(typeof s?.isActiveTab!=='boolean'||typeof s?.isWebViewVisible!=='boolean')return;pdaActive=s.isActiveTab&&s.isWebViewVisible;}
    if(!awake()){cancel('Activity stopped while this tab is inactive.');native?.dispose();native=null;}else{update();autoVerify();}
  }
  function routeChanged(){cancel('Page changed. Reopen the request when ready.');native?.dispose();native=null;reviewRequest=null;linkAttempt=null;refs.reviewBody?.replaceChildren();if(D.parseRequestLink(window.location)){open('review');refs.token.value=D.parseRequestLink(window.location);}else ui?.hide();}
  function teardown(){if(disposed)return;disposed=true;http.abort();generation++;if(cooldownTimer!==null)clearTimeout(cooldownTimer);native?.dispose();adapter?.();ui?.destroy();sessionKey='';sharedKey=null;identity=null;launcher.remove();marker.remove();for(const cleanup of cleanups.splice(0))cleanup();}
  listen(document,'visibilitychange',activity);listen(window,'tornpda:tabState',activity);listen(window,'hashchange',routeChanged);listen(window,'popstate',routeChanged);listen(window,'pagehide',event=>{if(!event.persisted)teardown();else{cancel();native?.dispose();native=null;}});
  if(typeof window.PDA_getTabState==='function')Promise.resolve(window.PDA_getTabState()).then(state=>activity({type:'tornpda:tabState',detail:state})).catch(()=>{pdaActive=false;});
  const menu=typeof GM_registerMenuCommand==='function'?GM_registerMenuCommand:typeof env.GM?.registerMenuCommand==='function'?env.GM.registerMenuCommand.bind(env.GM):null;menu?.('Open banker request',()=>open('request'));
  void (async()=>{
    const saved=await get('settings',null);if(disposed)return;
    if(saved&&typeof saved==='object'){try{settings={endpoint:D.validateEndpoint(saved.endpoint),useHub:saved.useHub===true,remember:saved.remember===true,connected:saved.connected===true};hubManaged ||= settings.useHub;}catch(_){}}
    if(settings.remember){const stored=await get('personal-key','');if(/^[A-Za-z0-9]{16}$/.test(stored))sessionKey=stored;}
    else await put('personal-key',null).catch(()=>{});
    const pending=await get('pending',null);if(pending&&D.uuid(pending.payload?.requestId)&&['amount','full'].includes(pending.payload.kind)&&typeof pending.endpoint==='string'&&Number.isSafeInteger(pending.userId))pendingRequest=pending;
    const cooldown=await get('cooldown',0);if(Number.isFinite(cooldown)&&cooldown>Date.now()&&cooldown<Date.now()+3600000)cooldownUntil=cooldown;
    if(disposed)return;ready=true;registerAdapter();if(ui){refs.endpoint.value=settings.endpoint;refs.remember.checked=settings.remember;update();say('Enter your connection details and press Connect.');}
    if(D.parseRequestLink(window.location))open('review');
  })().catch(()=>{ready=true;say('Saved settings could not be loaded. Configure Connection again.',true);});
}

function bankerRequestStyles(){return `.brh-root .tsui-body{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr) auto auto}.brh-root .tsui-nav{grid-row:auto;flex-direction:row;border-right:0;border-bottom:1px solid var(--tsui-border);gap:6px;flex-wrap:wrap}.brh-root .tsui-nav button{flex:1}.brh-root .tsui-content{grid-column:1;padding:20px;overflow:auto}.brh-root .brh-page{display:flex;flex-direction:column;gap:14px;max-width:480px;margin:auto}.brh-root .brh-page p{margin:0;line-height:1.5}.brh-root .brh-member{font-size:15px;font-weight:600}.brh-root .brh-field{display:flex;flex-direction:column;gap:7px;font-size:13px}.brh-root .brh-field input{width:100%;min-height:44px}.brh-root .brh-kind{padding:0;border:0;display:flex;gap:10px;margin:6px 0}.brh-root .brh-kind legend{font-size:13px;margin-bottom:10px;font-weight:600}.brh-root .brh-kind label{position:relative;flex:1;flex-direction:row-reverse;align-items:center;justify-content:flex-end;gap:8px;padding:8px;background:var(--tsui-surface);border:1px solid var(--tsui-border);border-radius:6px;min-height:46px}.brh-root .brh-kind input,.brh-root input[type=checkbox]{width:18px;min-height:18px;flex:none;accent-color:var(--tsui-accent)}.brh-root .brh-kind label:has(input:checked){background:var(--tsui-raised);outline:1px solid var(--tsui-accent)}.brh-root .brh-amount input{font:500 28px Consolas,monospace;min-height:62px;letter-spacing:-.5px}.brh-root .brh-note{padding:14px;background:var(--tsui-raised);border-radius:7px;font-size:13px}.brh-root .brh-muted{font-size:12px;color:var(--tsui-muted)}.brh-root .brh-total{font:500 24px Consolas,monospace}.brh-root .brh-facts{margin:12px 0}.brh-root .brh-facts div{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid var(--tsui-border);padding:12px 0}.brh-root .brh-facts dt{color:var(--tsui-muted)}.brh-root .brh-facts dd{margin:0;text-align:right;font-family:Consolas,monospace}.brh-root .brh-stack{display:flex;flex-direction:column;gap:10px;margin:14px 0}.brh-root .brh-status{font-size:12px;margin:0;padding:10px 16px;border-top:1px solid var(--tsui-border);background:var(--tsui-surface);line-height:1.5}.brh-root [data-error=true]{color:var(--tsui-error)}.brh-root .brh-page h2{font-size:20px;margin:0 0 6px}.brh-root [hidden]{display:none!important}.brh-root .tsui-settings,.brh-root .tsui-inspector{display:none}.brh-root input:focus-visible,.brh-root button:focus-visible{outline:2px solid var(--tsui-focus);outline-offset:2px}@media(max-width:600px){.brh-root .tsui-content{padding:16px}.brh-root .brh-page{max-width:none}.brh-root .brh-field input{font-size:16px}.brh-root .brh-kind .brh-field{font-size:13px}}`;}
