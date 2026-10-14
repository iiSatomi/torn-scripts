'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test');
const {WarPayoutCache:C}=require('../lib/war-payout-cache.cjs');
const war={warId:500,factionId:10,opponentId:20,start:100,end:200,opponentName:'Enemy'};
const counts={hits:2,losses:1,assists:0,stalemates:0,defends:0};
const report=(scope=war)=>({scope:{...scope,end:scope.end||180},live:!scope.end,opponentName:'Enemy',rows:[{id:1,name:'Alpha',...counts}],totals:{...counts},excluded:4,unattributed:1,unknownResults:1,pages:1,scanned:7,caches:[{id:7,name:'Armor cache',quantity:3,price:0}],coverageStatus:'unverified'});
function storage(){const data=new Map();let tail=Promise.resolve();const locks={request:(key,options,work)=>{const next=tail.then(work);tail=next.catch(()=>{});return next;}};return {data,env:{locks,GM_getValue:(k,d)=>data.has(k)?data.get(k):d,GM_setValue:(k,v)=>data.set(k,v)}};}
test('completed counts reopen with exact scope and cloned rows',async()=>{
 const {env}=storage(),cache=C.createCache(env);await cache.load();await cache.put(war,report());
 const saved=cache.get(war);assert.equal(saved.totals.hits,2);assert.equal(saved.live,false);assert.ok(saved.savedAt>0);
 saved.rows[0].hits=900;assert.equal(cache.get(war).rows[0].hits,2);
 assert.equal(cache.get({...war,factionId:30}),null);assert.equal(cache.get({...war,opponentId:30}),null);assert.equal(cache.get({...war,start:99}),null);assert.equal(cache.get({...war,end:201}),null);
 const fresh=C.createCache(env);await fresh.load();assert.equal(fresh.get(war).rows[0].losses,1);assert.equal(fresh.list()[0].warId,500);
});
test('live previews remain provisional and never satisfy ended metadata',async()=>{
 const {env}=storage(),cache=C.createCache(env),live={...war,end:0};await cache.put(live,report(live));
 assert.equal(cache.get(live).live,true);assert.equal(cache.list()[0].end,0);assert.equal(cache.get(war),null);
 await cache.put(war,report());assert.equal(cache.get(war).live,false);assert.equal(cache.get(live),null);
});
test('only aggregate facts are persisted; payout amounts and secrets are omitted',async()=>{
 const {env,data}=storage(),cache=C.createCache(env),input=report();input.apiKey='PRIVATE-FAKE';input.attacks=[{raw:'secret'}];input.scope.key='PRIVATE-FAKE';input.rows[0].payout=100;input.rows[0].balance=200;input.rows[0].status='credited';
 await cache.put(war,input);const raw=[...data.values()].join('');assert.doesNotMatch(raw,/PRIVATE-FAKE|attacks|payout|balance|credited/);assert.equal(cache.get(war).coverageStatus,'unverified');
});
test('corrupt aggregates, duplicate players, mismatched scopes and unfinished scans cannot replace a good record',async()=>{
 const {env}=storage(),cache=C.createCache(env);await cache.put(war,report());
 const invalid=[{...report(),totals:{...counts,hits:3}},{...report(),rows:[report().rows[0],report().rows[0]]},{...report(),scope:{...war,opponentId:30}},{...report(),scanned:6},{...report(),pages:0},{...report(),live:true},{...report(),rows:[{...report().rows[0],hits:-1}]}];
 for(const input of invalid)await assert.rejects(cache.put(war,input));assert.equal(cache.get(war).totals.hits,2);
});
test('failed writes retain the last good saved report; deleting never touches the credit ledger',async()=>{
 const {env,data}=storage(),cache=C.createCache(env);data.set('twpc-credit-ledger-v1','RECEIPTS');await cache.put(war,report());
 env.GM_setValue=()=>{throw new Error('Quota private detail');};const failing=C.createCache(env);await failing.load();const changed=report();changed.rows[0].hits=3;changed.totals.hits=3;changed.scanned=8;
 await assert.rejects(failing.put(war,changed),/could not be saved/i);assert.equal(failing.get(war).totals.hits,2);
 await cache.remove(10,500);assert.equal(cache.get(war),null);assert.equal(data.get('twpc-credit-ledger-v1'),'RECEIPTS');
});
test('fifty saved wars remain available when capacity rejects the next',async()=>{
 const {env}=storage(),cache=C.createCache(env);for(let id=1;id<=50;id++){const selected={...war,warId:id};await cache.put(selected,report(selected));}
 const selected={...war,warId:51};await assert.rejects(cache.put(selected,report(selected)),/full|limit/i);assert.equal(cache.list().length,50);assert.equal(cache.get({...war,warId:1}).totals.hits,2);
 await cache.remove(10,1);await cache.put(selected,report(selected));assert.equal(cache.list().length,50);
});
test('oversized member archive is refused',async()=>{
 const {env}=storage(),cache=C.createCache(env),input=report();input.rows=Array.from({length:1001},(_,i)=>({id:i+1,name:'Player',...counts}));await assert.rejects(cache.put(war,input),/limit|invalid/i);
});
test('PDA async storage takes priority over GM and rejected native writes do not fall back',async()=>{
 const {env,data}=storage(),native=new Map();env.PDA_storage={get:async(k,d)=>native.has(k)?native.get(k):d,set:async(k,v)=>native.set(k,v)};
 const cache=C.createCache(env);await cache.put(war,report());assert.equal(data.size,0);assert.equal(native.size,1);
 env.PDA_storage.set=async()=>{throw new Error('Quota');};const failed=C.createCache(env);await failed.load();await assert.rejects(failed.remove(10,500));assert.equal(failed.list().length,1);assert.equal(data.size,0);
});
test('serialized writes and deletion preserve the final requested state',async()=>{
 const {env}=storage(),original=env.GM_setValue;env.GM_setValue=async(k,v)=>{await new Promise(r=>setTimeout(r,5));original(k,v);};const cache=C.createCache(env);
 await Promise.all([cache.put(war,report()),cache.remove(10,500)]);assert.equal(cache.list().length,0);const fresh=C.createCache(env);await fresh.load();assert.equal(fresh.list().length,0);
});
test('unreadable archive is preserved and blocks writes instead of resetting saved wars',async()=>{
 const {env,data}=storage();data.set('twpc-war-cache-v1','{broken');const cache=C.createCache(env);await assert.rejects(cache.load(),/could not be read/i);await assert.rejects(cache.put(war,report()));assert.equal(data.get('twpc-war-cache-v1'),'{broken');
});
test('byte capacity rejects growing archives without evicting saved wars',async()=>{
 const {env}=storage(),cache=C.createCache(env);let refused=false;
 for(let id=1;id<=20;id++){
  const selected={...war,warId:id},input=report(selected);input.rows=Array.from({length:1000},(_,i)=>({id:i+1,name:'\u{1f600}'.repeat(50),...counts}));input.totals={...counts,hits:2000,losses:1000};input.scanned=3004;
  try{await cache.put(selected,input);}catch(error){assert.match(error.message,/full/);refused=true;break;}
 }
 assert.equal(refused,true);assert.equal(cache.get({...war,warId:1}).rows.length,1000);assert.ok(cache.list().length<20);
});
test('late live writes cannot replace a completed war or a newer live preview',async()=>{
 const {env}=storage(),cache=C.createCache(env),live={...war,end:0};await cache.put(live,report(live));
 const older=report(live);older.scope.end=170;await assert.rejects(cache.put(live,older));assert.equal(cache.get(live).scope.end,180);
 await cache.put(war,report());await assert.rejects(cache.put(live,report(live)));assert.equal(cache.get(war).live,false);
});
test('native migration copies valid GM data once and preserves the fallback',async()=>{
 const {env,data}=storage();await C.createCache(env).put(war,report());const native=new Map();env.PDA_storage={get:async(k,d)=>native.has(k)?native.get(k):d,set:async(k,v)=>native.set(k,v)};
 const migrated=C.createCache(env);await migrated.load();assert.equal(migrated.get(war).totals.hits,2);assert.equal(native.size,1);assert.equal(data.size,1);
});
test('two cache instances retain both saves under a shared storage lock',async()=>{
 const {env}=storage(),a=C.createCache(env),b=C.createCache(env),other={...war,warId:501};await Promise.all([a.load(),b.load()]);await Promise.all([a.put(war,report()),b.put(other,report(other))]);
 const fresh=C.createCache(env);await fresh.load();assert.equal(fresh.list().length,2);
});
test('missing storage coordination permits reading but refuses unsafe archive writes',async()=>{
 const {env,data}=storage();await C.createCache(env).put(war,report());env.locks={};const cache=C.createCache(env);await cache.load();assert.equal(cache.get(war).totals.hits,2);
 await assert.rejects(cache.put({...war,warId:501},report({...war,warId:501})),/single-tab|locking/i);assert.equal(JSON.parse(data.get('twpc-war-cache-v1')).records.length,1);
});
test('becoming inactive during a delayed read pauses a cache write and retains the saved report',async()=>{
 const {env,data}=storage();let active=true,hold=false;env.isActive=()=>active;
 let started,release;const waiting=new Promise(r=>{started=r;}),gate=new Promise(r=>{release=r;}),get=env.GM_getValue;
 env.GM_getValue=async(k,d)=>{if(hold){started();await gate;}return get(k,d);};const cache=C.createCache(env);await cache.put(war,report());
 const changed=report();changed.rows[0].hits=3;changed.totals.hits=3;changed.scanned=8;hold=true;const pending=cache.put(war,changed);await waiting;active=false;release();
 await assert.rejects(pending,/inactive|paused/i);assert.equal(JSON.parse(data.get('twpc-war-cache-v1')).records[0].totals.hits,2);
});
