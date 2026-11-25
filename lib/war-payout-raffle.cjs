'use strict';

// Local weighted draws. Only aggregate counts and immutable draw facts cross storage.
const WarPayoutRaffle = (() => {
  const KEY='twpc-raffle-draws-v1',MAX_ROWS=1000,MAX_DRAWS=50,MAX_BYTES=2*1024*1024;
  const metrics=['hits','losses','assists','stalemates','defends'],weightKeys=[...metrics,'flat'];
  const max=BigInt(Number.MAX_SAFE_INTEGER),range=1n<<53n;
  const copy=value=>JSON.parse(JSON.stringify(value));
  const fail=message=>{throw new Error(message);};
  function integer(value,label,positive=false){
    if(!Number.isSafeInteger(value)||value<(positive?1:0))fail(`${label} must be a ${positive?'positive':'nonnegative'} safe whole number.`);
    return value;
  }
  function safe(value,label){if(value<0n||value>max)fail(`${label} exceeds safe whole-number limits.`);return Number(value);}
  function object(value,label){if(!value||typeof value!=='object'||Array.isArray(value))fail(`${label} must be an object.`);return value;}
  function weight(value){
    if(typeof value!=='string'&&typeof value!=='number')fail('Weights require nonnegative decimals with at most four decimal places.');
    const text=String(value).trim();
    if(text.length>24||! /^(?:\d+(?:\.\d{0,4})?|\.\d{1,4})$/.test(text))fail('Weights require nonnegative decimals with at most four decimal places.');
    const [whole,fraction='']=text.split('.'),units=BigInt(whole||'0')*10000n+BigInt(fraction.padEnd(4,'0'));
    if(units>max*10000n)fail('Weight exceeds safe limits.');
    const trailing=String(units%10000n).padStart(4,'0').replace(/0+$/,'');
    return {units,text:String(units/10000n)+(trailing?'.'+trailing:'')};
  }
  function normalize(input={}){
    object(input,'Raffle settings');
    const raw=object(input.weights??{losses:1},'Weights');
    const weights=Object.fromEntries(weightKeys.map(key=>[key,weight(raw[key]??0).text]));
    const cap=integer(input.cap??0,'Ticket cap'),min=integer(input.min??1,'Minimum tickets'),winners=integer(input.winners??1,'Winner count',true);
    if(winners>MAX_ROWS)fail('Winner count exceeds the member limit.');
    return {weights,cap,min,winners};
  }
  const name=(value,id)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,100)||`Player ${id}`:`Player ${id}`;
  function pool(rows,input={}){
    if(!Array.isArray(rows)||rows.length>MAX_ROWS)fail('Raffle rows must contain at most 1,000 members.');
    const settings=normalize(input),units=Object.fromEntries(weightKeys.map(key=>[key,weight(settings.weights[key]).units]));
    const seen=new Set(),entries=[];let total=0n;
    for(const row of rows){
      const id=integer(row?.id,'Player ID',true);if(seen.has(id))fail('Duplicate raffle member ID.');seen.add(id);
      const counts=Object.fromEntries(metrics.map(key=>[key,integer(row[key],`${key} count`)]));
      let tickets=(metrics.reduce((sum,key)=>sum+BigInt(counts[key])*units[key],units.flat))/10000n;
      if(settings.cap&&tickets>BigInt(settings.cap))tickets=BigInt(settings.cap);
      const count=safe(tickets,'Member tickets');
      if(!count||count<settings.min)continue;
      entries.push({id,name:name(row.name,id),tickets:count,counts});total+=tickets;
    }
    return {entries,total:safe(total,'Total tickets'),settings};
  }
  function randomValues(crypto,array){
    if(typeof crypto?.getRandomValues!=='function')fail('Secure randomness is unavailable.');
    try{crypto.getRandomValues(array);}catch(_){fail('Secure randomness could not be generated.');}
  }
  function randomBelow(total,crypto){
    integer(total,'Ticket pool',true);
    const bound=BigInt(total),limit=range-range%bound,words=new Uint32Array(2);
    for(let attempt=0;attempt<128;attempt++){
      randomValues(crypto,words);
      // Exactly 53 random bits, including all safe integer ticket boundaries.
      const candidate=(BigInt(words[0]&0x1fffff)<<32n)|BigInt(words[1]);
      if(candidate<limit)return Number(candidate%bound);
    }
    fail('Secure randomness exceeded the rejection limit.');
  }
  function cleanScope(input,createdAt){
    object(input,'War scope');
    const scope=Object.fromEntries(['warId','factionId','opponentId','start','end'].map(key=>[key,integer(input[key],`Scope ${key}`,true)]));
    if(scope.factionId===scope.opponentId||scope.end<scope.start||scope.end>Math.floor(createdAt/1000))fail('A completed war scope is required.');
    return scope;
  }
  function freeze(value){for(const child of Object.values(value))if(child&&typeof child==='object')freeze(child);return Object.freeze(value);}
  function winnerAt(entries,ticket){
    let lower=0;
    for(const entry of entries){if(ticket<lower+entry.tickets)return entry;lower+=entry.tickets;}
    fail('Winning ticket is outside the remaining pool.');
  }
  function draw(snapshot,settings,crypto,now=Date.now){
    if(snapshot?.live!==false)fail('Draws require a completed, nonlive war snapshot.');
    const createdAt=integer(now(),'Draw time',true),scope=cleanScope(snapshot.scope,createdAt),result=pool(snapshot.rows,settings);
    if(result.settings.winners>result.entries.length)fail('Winner count exceeds eligible members.');
    const remaining=[...result.entries],winners=[];let poolTickets=result.total;
    for(let rank=1;rank<=result.settings.winners;rank++){
      const winningTicket=randomBelow(poolTickets,crypto),entry=winnerAt(remaining,winningTicket);
      winners.push({rank,id:entry.id,name:entry.name,tickets:entry.tickets,poolTickets,winningTicket});
      remaining.splice(remaining.indexOf(entry),1);poolTickets-=entry.tickets;
    }
    const bytes=new Uint8Array(16);randomValues(crypto,bytes);
    const id=createdAt.toString(36)+'-'+Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
    return freeze({version:1,id,scope,createdAt,coverageStatus:'unverified',settings:result.settings,entries:result.entries,total:result.total,winners});
  }
  function cleanRecord(input){
    object(input,'Draw record');
    if(input.version!==1||input.coverageStatus!=='unverified')fail('Invalid draw version or coverage status.');
    const createdAt=integer(input.createdAt,'Draw time',true),scope=cleanScope(input.scope,createdAt);
    if(typeof input.id!=='string'||!new RegExp('^'+createdAt.toString(36)+'-[a-f0-9]{32}$').test(input.id))fail('Invalid draw ID.');
    if(!Array.isArray(input.entries)||!input.entries.length||input.entries.length>MAX_ROWS)fail('Invalid draw entries.');
    object(input.settings,'Original raffle settings');object(input.settings.weights,'Original raffle weights');
    if(weightKeys.some(key=>!Object.hasOwn(input.settings.weights,key))||['cap','min','winners'].some(key=>!Object.hasOwn(input.settings,key)))fail('Original raffle settings are incomplete.');
    for(const key of weightKeys)weight(input.settings.weights[key]);
    for(const key of ['cap','min','winners'])integer(input.settings[key],`Original ${key}`,key==='winners');
    const rows=input.entries.map(entry=>{object(entry?.counts,'Entrant counts');return {id:entry.id,name:entry.name,...Object.fromEntries(metrics.map(key=>[key,entry.counts[key]]))};});
    const result=pool(rows,input.settings);
    if(result.total!==integer(input.total,'Total tickets',true)||result.entries.length!==input.entries.length||result.entries.some((entry,index)=>entry.tickets!==input.entries[index].tickets))fail('Draw tickets do not match the original counts and settings.');
    if(!Array.isArray(input.winners)||input.winners.length!==result.settings.winners||input.winners.length>result.entries.length)fail('Invalid winner count.');
    const remaining=[...result.entries],winners=[];let poolTickets=result.total;
    for(let index=0;index<input.winners.length;index++){
      const winner=input.winners[index],ticket=integer(winner?.winningTicket,'Winning ticket');
      if(ticket>=poolTickets)fail('Winning ticket is outside the remaining pool.');
      const entry=winnerAt(remaining,ticket),rank=index+1;
      if(winner.rank!==rank||winner.id!==entry.id||winner.name!==entry.name||winner.tickets!==entry.tickets||winner.poolTickets!==poolTickets)fail('Winner sequence does not match the original ticket pool.');
      winners.push({rank,id:entry.id,name:entry.name,tickets:entry.tickets,poolTickets,winningTicket:ticket});
      remaining.splice(remaining.indexOf(entry),1);poolTickets-=entry.tickets;
    }
    return {version:1,id:input.id,scope,createdAt,coverageStatus:'unverified',settings:result.settings,entries:result.entries,total:result.total,winners};
  }
  function encode(value){const encoded=JSON.stringify(value);if(new TextEncoder().encode(encoded).length>MAX_BYTES)fail('Raffle archive is full (2 MiB limit).');return encoded;}
  function archive(value){
    if(value==null)return {version:1,records:[]};
    if(typeof value==='string'){
      if(new TextEncoder().encode(value).length>MAX_BYTES)fail('Raffle archive exceeds its size limit.');
      try{value=JSON.parse(value);}catch(_){fail('Raffle archive data is malformed; saved data was kept.');}
    }
    if(value?.version!==1||!Array.isArray(value.records)||value.records.length>MAX_DRAWS)fail('Invalid raffle archive or draw limit exceeded.');
    const records=value.records.map(cleanRecord),seen=new Set();
    for(const record of records){if(seen.has(record.id))fail('Duplicate draw ID in archive.');seen.add(record.id);}
    const result={version:1,records};encode(result);return result;
  }
  function createArchive(env={}){
    const native=env.PDA_storage,usesNative=typeof native?.get==='function'&&typeof native?.set==='function';
    const gmGet=typeof env.GM_getValue==='function'?env.GM_getValue.bind(env):env.GM?.getValue?.bind(env.GM);
    const gmSet=typeof env.GM_setValue==='function'?env.GM_setValue.bind(env):env.GM?.setValue?.bind(env.GM);
    const get=usesNative?native.get.bind(native):gmGet,set=usesNative?native.set.bind(native):gmSet,locks=env.locks??globalThis.navigator?.locks;
    let state={version:1,records:[]},loading=null,writes=Promise.resolve();
    const isActive=active=>(typeof env.isActive!=='function'||env.isActive()===true)&&active()===true;
    const checkActive=active=>{if(!isActive(active))fail('Raffle archive save paused while inactive.');};
    async function fetchValue(getter){try{return await getter(KEY,null);}catch(_){fail('Raffle archive could not be read; saved data was kept.');}}
    async function save(encoded){try{await set(KEY,encoded);}catch(_){fail('Raffle archive could not be saved; previous records were kept.');}}
    async function read(migrate=false,active=()=>true){
      if(!get)fail('Raffle archive storage is unavailable.');
      let value=await fetchValue(get);
      if(usesNative&&value==null&&gmGet){
        const old=await fetchValue(gmGet);
        if(old!=null){const valid=archive(old);if(migrate){checkActive(active);await save(encode(valid));}value=valid;}
      }
      return archive(value);
    }
    function list(){return copy(state.records);}
    function load(active=()=>true){
      if(!loading){
        const locked=typeof locks?.request==='function';
        loading=(locked?locks.request(KEY,{mode:'exclusive'},()=>read(true,active)):read()).then(value=>{state=value;return list();}).catch(error=>{loading=null;throw error;});
      }
      return loading.then(()=>list());
    }
    async function append(input,{active=()=>true,previousDrawId=null}={}){
      // Capture immutable facts before any delayed storage/lock operation.
      const record=cleanRecord(input);
      const operation=writes.then(async()=>{
        checkActive(active);
        if(typeof locks?.request!=='function')fail('Raffle archive changes require storage locking.');
        if(!set)fail('Raffle archive storage is unavailable.');
        await load(active);checkActive(active);
        return locks.request(KEY,{mode:'exclusive'},async()=>{
          checkActive(active);
          const base=await read();checkActive(active);
          // A valid locked read refreshes local history even if this append is
          // refused, so the user can review a draw saved by another tab. Failed
          // or malformed reads leave the previous in-memory history intact.
          state=base;
          if(base.records.some(saved=>saved.id===record.id))fail('Duplicate raffle draw ID.');
          const latest=[...base.records].reverse().find(saved=>saved.scope.factionId===record.scope.factionId&&saved.scope.warId===record.scope.warId);
          if((latest?.id??null)!==previousDrawId)fail('Raffle history changed. Review the latest saved draw and confirm New draw again.');
          if(base.records.length>=MAX_DRAWS)fail('Raffle archive is full (50 draw limit).');
          const next={version:1,records:[...base.records,record]},encoded=encode(next);
          checkActive(active);
          // Verify under the same archive lock; some managers silently drop writes.
          try{
            await save(encoded);
            if(encode(archive(await fetchValue(get)))!==encoded)throw Error();
          }catch(_){
            const error=new Error('Could not verify the saved raffle. Use Refresh saved draws before drawing again.');
            error.raffleSaveUncertain=true;throw error;
          }
          state=next;return copy(record);
        });
      });
      writes=operation.catch(()=>{});return operation;
    }
    async function refresh(active=()=>true){
      // Keep an initial load/migration ahead of explicit read-only reads.
      if(loading)await loading.catch(()=>{});
      const operation=async()=>{
        if(!isActive(active))return false;
        const next=await read(false);
        if(!isActive(active))return false;
        // Publish inside the same lock used by append, not from an older result outside it.
        state=next;return true;
      };
      return typeof locks?.request==='function'?locks.request(KEY,{mode:'shared'},operation):operation();
    }
    return {load,append,list,refresh};
  }
  function firstPickLabel(tickets,total){
    if(!total||tickets===0)return '0.00%';
    if(tickets===total)return '100.00%';
    const rounded=(100*tickets/total).toFixed(2);
    return rounded==='0.00'?'<0.01%':rounded==='100.00'?'>99.99%':rounded+'%';
  }
  function oddsCsv(input){
    const cell=value=>{let text=String(value);if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
    const rows=[['Player ID','Player','Tickets','First-pick chance (%)','Total pool tickets','First-pick odds label']];
    integer(input?.total,'Total tickets');
    if(!Array.isArray(input.entries)||input.entries.length>MAX_ROWS)fail('Invalid odds entries.');
    for(const entry of input.entries)rows.push([entry.id,entry.name,entry.tickets,input.total?(entry.tickets/input.total*100).toFixed(6):'0.000000',String(input.total),firstPickLabel(entry.tickets,input.total)]);
    return rows.map(row=>row.map(cell).join(',')).join('\r\n');
  }
  return {pool,randomBelow,draw,createArchive,oddsCsv,firstPickLabel};
})();

function raffleSavedChance({tickets,poolTickets}){
  const rounded=(100*tickets/poolTickets).toFixed(2);
  return rounded==='0.00'?'<0.01%':rounded==='100.00'&&tickets!==poolTickets?'>99.99%':rounded+'%';
}

function createSavedRaffleAudience({doc,win,panel,button,appearance,isActive}){
  const modal=doc.createElement('dialog');modal.className='twpc-audience';
  modal.setAttribute('aria-labelledby','twpc-audience-title');modal.setAttribute('aria-describedby','twpc-audience-description');
  modal.innerHTML='<header class="twpc-audience-head"><div><p class="twpc-audience-war"></p><h2 id="twpc-audience-title" tabindex="-1">Saved raffle replay</h2></div><button type="button" data-replay-close>Close replay</button></header><p id="twpc-audience-description">Previously saved winners. This replay does not run a new draw or share anything.</p><div class="twpc-audience-controls"><button type="button" data-replay-skip>Skip motion</button><button type="button" data-replay-again hidden>Replay again</button><p role="status" data-replay-status></p></div><div class="twpc-audience-track" aria-hidden="true"><span></span><span></span><span></span><b data-replay-track></b></div><div class="twpc-audience-scroll" role="region" tabindex="0" aria-label="Saved winners"><ol data-replay-winners role="list"></ol></div>';
  panel.append(modal);
  const find=selector=>modal.querySelector(selector),title=find('h2'),closeButton=find('[data-replay-close]'),skip=find('[data-replay-skip]'),again=find('[data-replay-again]'),
    status=find('[data-replay-status]'),track=find('[data-replay-track]'),list=find('[data-replay-winners]'),scroll=find('.twpc-audience-scroll');
  const motion=win.matchMedia?.('(prefers-reduced-motion: reduce)');
  const badges={trophy:'\u{1f3c6}',star:'\u{2b50}'};
  let active=null,timer=null,current=null;
  function projection(saved){
    if(!saved?.winners?.length)return null;
    const winners=saved.winners.map(({rank,name,tickets,poolTickets})=>({rank,name,tickets,poolTickets}));
    return {signature:JSON.stringify([saved.id,saved.scope.warId,winners]),warId:saved.scope.warId,winners};
  }
  function clearTimer(){if(timer!==null)win.clearTimeout(timer);timer=null;}
  function close(refocus=false){
    clearTimer();
    if(!active&&!modal.open)return;
    active=null;modal.removeAttribute('data-rolling');
    if(modal.open)modal.close();
    list.replaceChildren();status.textContent='';track.textContent='';find('.twpc-audience-war').textContent='';
    if(refocus&&isActive()&&!button.disabled&&button.isConnected)button.focus({preventScroll:true});
  }
  const owns=job=>active===job&&modal.open&&isActive()&&current?.signature===job.saved.signature;
  function appendThrough(job,end,animated=false){
    const follow=animated&&scroll.scrollHeight-scroll.clientHeight-scroll.scrollTop<12;
    const nodes=doc.createDocumentFragment();
    while(job.revealed<end){
      const winner=job.saved.winners[job.revealed++],row=doc.createElement('li');
      row.value=winner.rank;
      if(animated&&end-job.revealed<6)row.classList.add('twpc-audience-new');
      const rank=doc.createElement('span');rank.className='twpc-audience-rank';rank.textContent='Rank '+winner.rank;
      const body=doc.createElement('div'),name=doc.createElement('strong');name.textContent=winner.name;
      if(job.badge){const badge=doc.createElement('span');badge.className='twpc-raffle-badge';badge.textContent=job.badge;badge.setAttribute('aria-hidden','true');body.append(badge);}
      body.append(name);
      const facts=doc.createElement('span');facts.className='twpc-audience-facts';
      facts.textContent=winner.tickets.toLocaleString()+(winner.tickets===1?' ticket':' tickets')+(job.chance?' · '+raffleSavedChance(winner)+' chance on this pick':'');
      body.append(facts);row.append(rank,body);nodes.append(row);
    }
    list.append(nodes);
    if(follow)scroll.scrollTop=scroll.scrollHeight;
  }
  function finish(job){
    if(!owns(job))return;
    clearTimer();appendThrough(job,job.saved.winners.length);
    modal.removeAttribute('data-rolling');track.textContent='Saved result complete';
    status.textContent='Replay complete. '+job.saved.winners.length+' saved '+(job.saved.winners.length===1?'winner shown.':'winners shown.');
    if(doc.activeElement===skip){again.hidden=false;again.focus({preventScroll:true});}
    skip.hidden=true;again.hidden=false;
  }
  function tick(job){
    if(active!==job)return;
    if(!owns(job)){close();return;}
    if(motion?.matches){finish(job);return;}
    const end=Math.min(job.saved.winners.length,job.revealed+job.batch);
    track.textContent=end===job.revealed+1?'Revealing pick '+end:'Revealing picks '+(job.revealed+1)+'–'+end;
    timer=win.setTimeout(()=>{
      timer=null;
      if(active!==job)return;
      if(!owns(job)){close();return;}
      appendThrough(job,end,!motion?.matches);
      if(end===job.saved.winners.length)finish(job);else tick(job);
    },430);
  }
  function restart(job){
    if(!owns(job))return;
    clearTimer();job.revealed=0;list.replaceChildren();scroll.scrollTop=0;
    if(motion?.matches){finish(job);return;}
    status.textContent='Replaying '+job.saved.winners.length+' saved '+(job.saved.winners.length===1?'winner.':'winners.');
    skip.hidden=false;if(doc.activeElement===again)skip.focus({preventScroll:true});again.hidden=true;
    modal.setAttribute('data-rolling','');tick(job);
  }
  function open(event){
    if(!event.isTrusted||button.disabled||active||!isActive()||!current)return;
    const style=appearance(),saved=current;
    const job={saved,badge:Object.hasOwn(badges,style.emoji)?badges[style.emoji]:'',chance:style.chance,revealed:0,batch:Math.ceil(saved.winners.length/20)};
    try{modal.showModal();}catch(_){return;}
    active=job;find('.twpc-audience-war').textContent='Local replay · War #'+saved.warId;
    title.focus({preventScroll:true});restart(job);
  }
  function sync(saved,enabled){
    current=projection(saved);
    button.disabled=!enabled||!current||typeof modal.showModal!=='function';
    if(active&&(!enabled||!current||current.signature!==active.saved.signature||!isActive()))close();
  }
  function onMotion(){if(motion.matches&&active)finish(active);}
  button.addEventListener('click',open);closeButton.addEventListener('click',()=>close(true));
  skip.addEventListener('click',()=>{if(active)finish(active);});
  again.addEventListener('click',()=>{if(active)restart(active);});
  modal.addEventListener('cancel',event=>{event.preventDefault();close(true);});
  modal.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}});
  motion?.addEventListener?.('change',onMotion);
  return {sync,close,destroy(){close();motion?.removeEventListener?.('change',onMotion);modal.remove();}};
}

module.exports={WarPayoutRaffle};
