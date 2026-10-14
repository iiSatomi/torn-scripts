'use strict';

// Aggregated reports only. This archive never owns payout receipts or credentials.
const WarPayoutCache = (() => {
  const KEY='twpc-war-cache-v1',MAX_WARS=50,MAX_ROWS=1000,MAX_BYTES=2*1024*1024;
  const metrics=['hits','losses','assists','stalemates','defends'];
  const messages={CACHE_READ:'Saved war cache could not be read. Calculations still work; existing saved data was kept.',CACHE_SAVE:'War cache could not be saved. This report is still usable; the previous saved copy was kept.',CACHE_FULL:'War cache is full. Remove a saved war in settings before saving another.',CACHE_LOCK:'This browser lacks single-tab storage locking. Saved reports can be read, but cache changes are disabled.',CACHE_STALE:'A newer or completed report is already saved. The previous saved copy was kept.',CACHE_PAUSED:'War cache save paused while the panel or tab was inactive. The previous saved copy was kept.'};
  const problem=code=>Object.assign(new Error(messages[code]),{code});
  const message=error=>messages[error?.code]||messages.CACHE_SAVE;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const fail=()=>{throw new Error('War cache record is invalid or exceeds its limit.');};
  const integer=(value,positive=false)=>{if(!Number.isSafeInteger(value)||value<(positive?1:0))fail();return value;};
  const text=(value,fallback)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,100)||fallback:fallback;
  const key=scope=>`${scope.factionId}:${scope.warId}`;
  const same=(a,b,fields)=>fields.every(field=>a[field]===b[field]);
  function scope(input){
    if(!input||typeof input!=='object')fail();
    const result=Object.fromEntries(['warId','factionId','opponentId','start','end'].map(field=>[field,integer(input[field],!['start','end'].includes(field))]));
    if(result.factionId===result.opponentId||(result.end&&result.end<result.start))fail();return result;
  }
  function clean(input){
    const selected=scope(input?.scope);
    if(!selected.end||typeof input.live!=='boolean'||!Array.isArray(input.rows)||input.rows.length>MAX_ROWS)fail();
    const ids=new Set(),sums=Object.fromEntries(metrics.map(field=>[field,0n]));
    const rows=input.rows.map(row=>{
      const id=integer(row?.id,true);if(ids.has(id))fail();ids.add(id);
      const result={id,name:text(row.name,`Player ${id}`)};
      for(const field of metrics){result[field]=integer(row[field]);sums[field]+=BigInt(result[field]);}
      return result;
    });
    const totals=Object.fromEntries(metrics.map(field=>{const value=integer(input.totals?.[field]);if(sums[field]!==BigInt(value))fail();return[field,value];}));
    const excluded=integer(input.excluded),unattributed=integer(input.unattributed??0),unknownResults=integer(input.unknownResults??0),scanned=integer(input.scanned,true),pages=integer(input.pages,true);
    if(unattributed+unknownResults>excluded||BigInt(excluded)+Object.values(sums).reduce((a,b)=>a+b,0n)!==BigInt(scanned)||pages>250)fail();
    if(!Array.isArray(input.caches)||input.caches.length>100)fail();
    const caches=input.caches.map(item=>({id:integer(item?.id,true),name:text(item.name,'Cache'),quantity:integer(item.quantity),price:0}));
    return {scope:selected,opponentName:text(input.opponentName,`Faction ${selected.opponentId}`),live:input.live,rows,totals,excluded,unattributed,unknownResults,scanned,pages,caches,savedAt:integer(input.savedAt,true),coverageStatus:'unverified',coverage:'Draft from available API logs; completeness is unverified.'};
  }
  function archive(value){
    if(value===null||value===undefined)return{version:1,records:[]};
    if(typeof value==='string'){if(new TextEncoder().encode(value).length>MAX_BYTES)fail();value=JSON.parse(value);}
    if(value?.version!==1||!Array.isArray(value.records)||value.records.length>MAX_WARS)fail();
    const records=value.records.map(clean),seen=new Set();
    for(const record of records){const id=key(record.scope);if(seen.has(id))fail();seen.add(id);}
    const result={version:1,records};encode(result);return result;
  }
  function encode(value){const encoded=JSON.stringify(value);if(new TextEncoder().encode(encoded).length>MAX_BYTES)throw problem('CACHE_FULL');return encoded;}
  function createCache(env={}){
    const native=env.PDA_storage,usesNative=typeof native?.get==='function'&&typeof native?.set==='function';
    const gmGet=typeof env.GM_getValue==='function'?env.GM_getValue.bind(env):env.GM?.getValue?.bind(env.GM);
    const gmSet=typeof env.GM_setValue==='function'?env.GM_setValue.bind(env):env.GM?.setValue?.bind(env.GM);
    const get=usesNative?native.get.bind(native):gmGet,set=usesNative?native.set.bind(native):gmSet;
    const locks=env.locks??globalThis.navigator?.locks;
    const active=()=>typeof env.isActive!=='function'||env.isActive()===true;
    let state={version:1,records:[]},loading=null,writes=Promise.resolve();
    async function read(migrate=false){
      if(!get||!set)throw new Error('War cache storage is unavailable.');
      let value=await get(KEY,null);
      if(usesNative&&value==null&&gmGet){const old=await gmGet(KEY,null);if(old!=null){const migrated=archive(old);if(migrate&&active())await set(KEY,encode(migrated));value=migrated;}}
      return archive(value);
    }
    function load(){
      if(!loading)loading=(locks?.request?locks.request(KEY,{mode:'exclusive'},()=>read(true)):read()).then(value=>{state=value;return list();}).catch(()=>{throw problem('CACHE_READ');});
      return loading;
    }
    function list(){return state.records.map(record=>({...record.scope,end:record.live?0:record.scope.end,opponentName:record.opponentName,savedAt:record.savedAt,live:record.live})).sort((a,b)=>b.start-a.start);}
    function lookup(war){
      const selected=scope(war),record=state.records.find(item=>key(item.scope)===key(selected));
      if(!record||!same(record.scope,selected,['warId','factionId','opponentId','start']))return null;
      if(selected.end?record.live||selected.end!==record.scope.end:!record.live)return null;
      return clone(record);
    }
    function mutate(change){
      const operation=writes.then(async()=>{
        await load();
        if(!active())throw problem('CACHE_PAUSED');
        if(typeof locks?.request!=='function')throw problem('CACHE_LOCK');
        const work=async()=>{
          // Re-read only at a mutation, under the desktop cross-tab lock. Normal
          // selection/rendering remains in memory; native writes are one batch.
          let base;try{base=await read();}catch(_){throw problem('CACHE_READ');}
          const next=change(base),encoded=encode(next);
          if(!active())throw problem('CACHE_PAUSED');
          try{await set(KEY,encoded);}catch(_){throw problem('CACHE_SAVE');}
          state=next;
        };
        return locks.request(KEY,{mode:'exclusive'},work);
      });
      writes=operation.catch(()=>{});return operation;
    }
    function put(war,input){
      return mutate(base=>{
        const selected=scope(war),record=clean({...input,savedAt:Date.now()});
        if(!same(selected,record.scope,['warId','factionId','opponentId','start'])||(selected.end?record.live||selected.end!==record.scope.end:!record.live))fail();
        const previous=base.records.find(item=>key(item.scope)===key(selected));
        if(record.live&&previous&&(!previous.live||record.scope.end<previous.scope.end))throw problem('CACHE_STALE');
        const records=base.records.filter(item=>key(item.scope)!==key(selected));
        if(records.length>=MAX_WARS)throw problem('CACHE_FULL');
        records.push(record);return{version:1,records};
      });
    }
    function remove(factionId,warId){return mutate(base=>{const id=key({factionId:integer(factionId,true),warId:integer(warId,true)});return{version:1,records:base.records.filter(record=>key(record.scope)!==id)};});}
    return{load,list,get:lookup,put,remove};
  }
  return{createCache,message};
})();
module.exports = {WarPayoutCache};
