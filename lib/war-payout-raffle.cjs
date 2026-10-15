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
          await save(encoded);
          state=next;return copy(record);
        });
      });
      writes=operation.catch(()=>{});return operation;
    }
    return {load,append,list};
  }
  function oddsCsv(input){
    const cell=value=>{let text=String(value);if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
    const rows=[['Player ID','Player','Tickets','First-pick chance (%)']];
    integer(input?.total,'Total tickets');
    if(!Array.isArray(input.entries)||input.entries.length>MAX_ROWS)fail('Invalid odds entries.');
    for(const entry of input.entries)rows.push([entry.id,entry.name,entry.tickets,input.total?(entry.tickets/input.total*100).toFixed(6):'0.000000']);
    return rows.map(row=>row.map(cell).join(',')).join('\r\n');
  }
  return {pool,randomBelow,draw,createArchive,oddsCsv};
})();
module.exports={WarPayoutRaffle};
