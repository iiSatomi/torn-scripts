// Bound to the inspected native Cash balances list (2026-10-13). Uses Torn's
// own inline editor; no private endpoint, session token or autocomplete lookup.
function createWarPayoutNativeCreditAdapter({doc,win,awake}) {
  // Only the already displayed native balance record is read from the page
  // realm. No handler, endpoint, token or other component data is accessed.
  const pageDoc=typeof unsafeWindow!=='undefined'?unsafeWindow.document:doc;
  const LIMIT=BigInt(0x9184e729fff)*100n;
  function cents(value){
    const text=String(value).trim().replace(/^\$\s*/,'').replace(/\u2212/g,'-');
    if(!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text))throw new Error('Native balance is unreadable.');
    const negative=text.startsWith('-'),parts=text.replace(/[-,]/g,'').split('.');
    const amount=BigInt(parts[0])*100n+BigInt((parts[1]||'').padEnd(2,'0'));
    if(amount>LIMIT)throw new Error('Native balance exceeds its limit.');
    return negative?-amount:amount;
  }
  function decimal(value){const abs=value<0n?-value:value;return (value<0n?'-':'')+String(abs/100n)+(abs%100n?'.'+String(abs%100n).padStart(2,'0'):'');}
  function foreground(){return awake()&&doc.visibilityState!=='hidden'&&doc.hasFocus();}
  function route(){return foreground()&&win.location.hostname==='www.torn.com'&&win.location.pathname==='/factions.php'&&new URLSearchParams(win.location.search).get('step')==='your'&&/(?:^|[\/#&])tab=controls(?:&|$)/.test(win.location.hash);}
  function sameLink(link,path,key,id){try{const url=new URL(link.href);return url.origin===win.location.origin&&url.pathname===path&&Number(url.searchParams.get(key))===id;}catch(_){return false;}}
  function visible(element){return element.isConnected&&element.getClientRects().length>0&&win.getComputedStyle(element).visibility==='visible';}
  function find(scope,memberId){
    const section=pageDoc.getElementById('add-money-to-balance')?.closest('section');
    if(!section||!visible(section))return null;
    const matches=[...section.querySelectorAll('li')].filter(row=>[...row.querySelectorAll('a[href*="profiles.php"]')].some(link=>sameLink(link,'/profiles.php','XID',memberId)));
    if(matches.length!==1)return null;
    const row=matches[0];
    if(row.querySelector('[class*="inactive___"]')||![...row.querySelectorAll('a[href*="factions.php"]')].some(link=>sameLink(link,'/factions.php','ID',scope.factionId)))return null;
    const editor=row.querySelector('[class*="editBalanceWrap"]'),button=editor?.querySelector('button[aria-label="Edit balance"],button[aria-label="Save balance"]');
    const inputs=editor?.querySelectorAll('input[data-testid="legacy-money-input"]:not([type="hidden"])');
    // Torn hides the Edit icon until hover; the containing form and row must
    // have layout, while that native hover decoration need not be displayed.
    if(!editor||!button||inputs?.length!==1||!visible(row)||!visible(editor))return null;
    const input=inputs[0],hidden=editor.querySelector('input[type="hidden"][data-testid="legacy-money-input"]');
    return {row,editor,button,input,hidden};
  }
  function displayed(editor){return cents([...editor.childNodes].filter(node=>node.nodeType===3).map(node=>node.textContent).join('').trim());}
  function nativeBalances(native,scope,memberId){
    const key=Object.keys(native.editor).find(name=>name.startsWith('__reactFiber$'));
    const root=key&&native.editor[key];
    if(!root)throw new Error('Native balance record unavailable.');
    const balances=[];
    for(const branch of [root,root.alternate].filter(Boolean)){
      const pending=[branch];let visited=0,found=false;
      while(pending.length){
        if(++visited>40)throw new Error('Native balance record changed.');
        const fiber=pending.pop(),props=fiber.memoizedProps;
        if(props?.section==='money'&&props.depositor){
          const member=props.depositor;
          if(Number(member.userID)!==memberId||Number(member.faction?.id)!==scope.factionId||member.isMember!==true)throw new Error('Native member record changed.');
          balances.push(cents(member.balance));found=true;
        }
        for(let child=fiber.child;child;child=child.sibling){pending.push(child);if(pending.length>40)throw new Error('Native balance record changed.');}
      }
      if(!found)throw new Error('Native balance record unavailable.');
    }
    return balances;
  }
  function unchanged(native,scope,memberId,baseline){return nativeBalances(native,scope,memberId).every(balance=>balance===baseline);}
  function inspect(scope,entry){
    if(!route())return {ready:false,reason:'Open and actively view your faction Controls → Funds balance page before crediting.'};
    if(!entry)return {ready:false,reason:'No eligible pending member is selected.'};
    const native=find(scope,entry.id);
    if(!native)return {ready:false,reason:'Member is missing, outside this faction, or the native balance editor is unavailable.'};
    if(native.button.disabled||native.button.getAttribute('aria-label')!=='Edit balance')return {ready:false,reason:'Finish or cancel the existing native balance edit first.'};
    try{
      const baseline=displayed(native.editor);
      if(!unchanged(native,scope,entry.id,baseline))return {ready:false,reason:'The native balance is changing. Wait for Torn to finish updating it.'};
      if(cents(native.input.value)!==baseline||native.hidden&&cents(native.hidden.value)!==baseline)return {ready:false,reason:'The native balance field has an unfinished edit.'};
      if(!Number.isSafeInteger(entry.amount)||entry.amount<=0)return {ready:false,reason:'Credit amount must be a positive whole-dollar payout.'};
      const target=baseline+BigInt(entry.amount)*100n;
      if(target>LIMIT||target<-LIMIT)return {ready:false,reason:'This payout would exceed Torn’s native balance limit.'};
      return {ready:true,reason:'Uses the native inline balance editor; each click saves one reviewed member amount.'};
    }catch(_){return {ready:false,reason:'Native balance format is unsupported. Review it in Torn before crediting.'};}
  }
  function settle(predicate,timeout,isCurrent=()=>true){
    return new Promise((resolve,reject)=>{
      const start=Date.now();let timer;
      const check=()=>{
        if(!isCurrent()||!route()){clearTimeout(timer);reject(new Error('Native credit context changed.'));return;}
        try{const value=predicate();if(value){clearTimeout(timer);resolve(value);return;}}catch(_){clearTimeout(timer);reject(new Error('Native credit confirmation changed.'));return;}
        if(Date.now()-start>=timeout){clearTimeout(timer);reject(new Error('Native credit outcome is uncertain.'));return;}
        timer=win.setTimeout(check,25);
      };check();
    });
  }
  function write(input,value){
    const setter=Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype,'value').set;
    setter.call(input,value);
    input.dispatchEvent(new win.Event('input',{bubbles:true}));
    input.dispatchEvent(new win.KeyboardEvent('keyup',{key:'0',code:'Digit0',bubbles:true}));
    input.dispatchEvent(new win.Event('change',{bubbles:true}));
  }
  async function prepare(operation){
    const isCurrent=typeof operation.isCurrent==='function'?operation.isCurrent:()=>true;
    const entry={id:operation.memberId,amount:operation.amount};
    if(!isCurrent()||!inspect(operation.scope,entry).ready)throw new Error('Native credit action unavailable.');
    const native=find(operation.scope,entry.id),baseline=displayed(native.editor),target=baseline+BigInt(entry.amount)*100n;
    // Edit toggles local state only when its amount equals current balance.
    native.button.click();
    await settle(()=>native.row.isConnected&&native.button.getAttribute('aria-label')==='Save balance'&&!native.button.disabled,2000,isCurrent);
    write(native.input,decimal(target));
    await settle(()=>cents(native.input.value)===target&&(!native.hidden||cents(native.hidden.value)===target)&&!native.button.disabled,2000,isCurrent);
    await new Promise(resolve=>win.setTimeout(resolve,0));
    if(!isCurrent()||!route()||!native.row.isConnected||native.button.disabled||!unchanged(native,operation.scope,entry.id,baseline))throw new Error('Native credit context changed.');
    return {...native,baseline,target,scope:operation.scope,memberId:operation.memberId};
  }
  async function submit(operation){
    const isCurrent=typeof operation.isCurrent==='function'?operation.isCurrent:()=>true;
    if(!isCurrent()||!inspect(operation.scope,{id:operation.memberId,amount:operation.amount}).ready)return {status:'rejected'};
    try{
      const prepared=await prepare(operation);
      if(!isCurrent()||!route()||find(operation.scope,operation.memberId)?.editor!==prepared.editor||prepared.button.disabled||prepared.button.getAttribute('aria-label')!=='Save balance'||cents(prepared.input.value)!==prepared.target||prepared.hidden&&cents(prepared.hidden.value)!==prepared.target||!unchanged(prepared,operation.scope,operation.memberId,prepared.baseline))return {status:'unknown'};
      // Exactly one native Save activation. Never retry or send another member.
      prepared.button.click();
      await settle(()=>{
        if(!prepared.row.isConnected)return false;
        if(prepared.button.getAttribute('aria-label')!=='Edit balance'||prepared.button.disabled)return false;
        return displayed(prepared.editor)===prepared.target&&nativeBalances(prepared,operation.scope,operation.memberId).some(balance=>balance===prepared.target);
      },15000,isCurrent);
      return {status:'confirmed'};
    }catch(_){return {status:'unknown'};}
  }
  return {inspect,submit,prepare};
}
