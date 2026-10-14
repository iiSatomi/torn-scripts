'use strict';
const assert = require('node:assert/strict');
const {WarPayoutAPI} = require('../lib/war-payout-api.cjs');
const war = {warId:7,factionId:10,opponentId:20,opponentName:'Opponent',start:100,end:200};
const actor = (id,factionId) => ({id,name:`Player ${id}`,faction:{id:factionId}});
const attack = (id,ended,from=10,to=20,result='Hospitalized') => ({id,ended,attacker:actor(1,from),defender:actor(2,to),result,is_ranked_war:true});
const page = (attacks,older=null) => ({attacks,_metadata:{links:{next:null,prev:older}}});
const next = to => `https://api.torn.com/v2/faction/attacks?from=99&to=${to}&sort=DESC&limit=100`;
const tests = [];
const test = (name,run) => tests.push({name,run});
function client(responses, options={}) {
  const calls=[];
  const instance=WarPayoutAPI.createClient({delayMs:0,...options,request:async (path,params,signal) => {
    calls.push({path,params:{...params},signal});
    const value=responses.shift();
    if (value instanceof Error) throw value;
    return typeof value === 'function' ? value(path,params,signal) : value;
  }});
  return {...instance,calls};
}

test('loads older DESC pages through live prev links with lowercase sort and stops without following newer next',async()=>{
  const older=next(170).replace('sort=DESC','sort=desc');
  const c=client([
    {attacks:[attack(1,190,10,99)],_metadata:{links:{next:null,prev:older}}},
    {attacks:[attack(2,160),attack(3,100,20,10)],_metadata:{links:{next:next(200),prev:null}}},
    {rankedwarreport:{factions:[]}}
  ]);
  const result=await c.loadWar(war);
  assert.equal(result.pages,2);
  assert.equal(result.totals.hits,1);
  assert.equal(result.totals.losses,1);
  assert.equal(result.scanned,3);
  assert.equal(c.calls[1].params.to,170);
  assert.equal(c.calls.length,3,'two attack pages and one optional report only');
});
test('lists own faction wars using v2 nested factions, including live wars', async () => {
  const c=client([{basic:{id:10}},{rankedwars:[{id:7,start:100,end:200,factions:[{id:20,name:'Enemy'},{id:10,name:'Ours'}]},
    {id:8,start:300,end:0,factions:[{id:10,name:'Ours'},{id:30,name:'Live enemy'}]}]}]);
  const result=await c.listWars();
  assert.equal(result.factionId,10);
  assert.deepEqual(result.wars,[{...war,opponentName:'Enemy'},{warId:8,factionId:10,opponentId:30,opponentName:'Live enemy',start:300,end:0}]);
  assert.deepEqual(c.calls.map(x=>x.path),['/faction/basic','/faction/rankedwars']);
  assert.equal(c.calls[1].params.limit,100);
});
test('aggregates paginated API attacks, dedupes boundary IDs, and never pays outsiders', async () => {
  const a=attack(1,190), b=attack(2,180,20,10), outsider=attack(3,170,10,99);
  const c=client([page([a,b],next(180)),page([b,outsider,attack(4,100)]),
    {rankedwarreport:{factions:[{id:10,rewards:{items:[{id:5,name:'Small cache',quantity:2}]}},{id:20,rewards:{items:[{id:6,name:'Enemy cache',quantity:8}]}}]}}]);
  const progress=[];
  const result=await c.loadWar(war,undefined,x=>progress.push(x));
  assert.deepEqual(result.totals,{hits:2,losses:1,assists:0,stalemates:0,defends:0});
  assert.equal(result.excluded,1);
  assert.equal(result.pages,2);
  assert.equal(result.coverage,'Available attack-log draft — completeness unverified');
  assert.equal(result.coverageStatus,'unverified');
  assert.equal(result.live,false);
  assert.deepEqual(result.scope,{warId:7,factionId:10,opponentId:20,start:100,end:200});
  assert.deepEqual(result.caches,[{id:5,name:'Small cache',quantity:2,price:0}]);
  assert.deepEqual(progress,[{pages:1},{pages:2}]);
  assert.deepEqual(c.calls[0].params,{from:99,to:200,sort:'DESC',limit:100});
  assert.equal(c.calls[1].params.to,180);
  assert.equal(c.calls[2].path,'/faction/7/rankedwarreport');
  assert.ok(!('attacks' in result));
  assert.ok(!JSON.stringify(result).includes('_metadata'));
});
test('live wars freeze their fetch end and remain provisional without report request', async () => {
  const now=Math.floor(Date.now()/1000);
  const c=client([page([attack(1,now)])]);
  const result=await c.loadWar({...war,end:0});
  assert.equal(result.live,true);
  assert.equal(result.coverage,'Available attack-log draft — completeness unverified; provisional counts so far');
  assert.equal(result.coverageStatus,'unverified');
  assert.ok(result.scope.end >= now && result.scope.end <= Math.floor(Date.now()/1000));
  assert.equal(c.calls.length,1);
});
test('missing or malformed primary response never becomes a zero-count completed report', async () => {
  for (const invalid of [{},{attacks:[]},page(null),{attacks:[],_metadata:{links:{next:7}}}, {error:{error:'sensitive raw message'}}]) {
    const c=client([invalid]);
    await assert.rejects(c.loadWar(war),e=> !e.message.includes('sensitive') && /response|data|page/i.test(e.message));
  }
  for (const invalid of [{}, {basic:{id:0}}]) await assert.rejects(client([invalid]).listWars());
  await assert.rejects(client([{basic:{id:10}},{}]).listWars());
});
test('empty retained history blocks a report but real nonqualifying logs permit a zero-count draft', async () => {
  const c=client([page([])]);
  await assert.rejects(c.loadWar(war),error=>error.message ===
    'No attack logs are available for this war. Use expected counts for a planning estimate.');
  assert.equal(c.calls.length,1);
  const d=client([page([attack(1,150,10,99),attack(2,140,10,20,'Lost')]),{}]);
  const result=await d.loadWar(war);
  assert.equal(result.totals.hits,0);
  assert.equal(result.excluded,2);
  assert.equal(result.coverageStatus,'unverified');
});
test('malformed attack actors and outcomes fail instead of silently excluding missing data', async () => {
  for (const change of [{attacker:undefined},{defender:null},{result:undefined},{attacker:{id:0,faction:{id:10}}},
    {defender:{id:2,faction:{id:'20'}}}]) {
    await assert.rejects(client([page([{...attack(1,150),...change}])]).loadWar(war),/response data/i);
  }
  const hidden={...attack(1,150,20,10),attacker:null};
  const result=await client([page([hidden]),{}]).loadWar(war);
  assert.equal(result.totals.losses,1);
});
test('pagination refuses off-origin, credentials, changed lower bound, filters and duplicate parameters', async () => {
  const invalid=[next(180).replace('api.torn.com','evil.example'),next(180).replace('https:','http:'),
    next(180).replace('api.torn.com','user:password@api.torn.com'),next(180).replace('/attacks','/basic'),
    next(180).replace('from=99','from=100'),next(180).replace('sort=DESC','sort=ASC'),
    next(180).replace('limit=100','limit=500'),next(180)+'&filters=ranked',next(180)+'&to=170',next(180)+'#fragment'];
  for (const link of invalid) {
    const c=client([page([attack(1,190)],link)]);
    await assert.rejects(c.loadWar(war),/pagination/i);
    assert.equal(c.calls.length,1);
  }
});
test('metadata credentials and decorative parameters cannot alter private transport', async () => {
  const c=client([page([attack(1,190)],next(180)+'&key=fixture-secret&comment=private&timestamp=123'),page([attack(2,170)]),{}]);
  await c.loadWar(war);
  assert.deepEqual(c.calls[1].params,{from:99,to:180,sort:'DESC',limit:100});
});
test('stalled cursors, repeated pages and cursor ranges fail instead of returning partial totals', async () => {
  for (const link of [next(200),next(201),next(98)]) {
    const c=client([page([attack(1,190)],link)]);
    await assert.rejects(c.loadWar(war),/pagination/i);
    assert.equal(c.calls.length,1);
  }
  for (const second of [page([attack(1,190)],next(170)),page([attack(2,170)],next(180))]) {
    const c=client([page([attack(1,190)],next(180)),second]);
    await assert.rejects(c.loadWar(war),/pagination/i);
    assert.equal(c.calls.length,2);
  }
});
test('cap stops before requesting another page, including the hard 250-page ceiling', async () => {
  const c=client([page([attack(1,190)],next(180))],{maxPages:1});
  await assert.rejects(c.loadWar(war),/page limit/i);
  assert.equal(c.calls.length,1);
  assert.throws(()=>WarPayoutAPI.createClient({request:async()=>{},maxPages:251}),/page/i);
});
test('hard 250-page ceiling stops after exactly 250 bounded requests', async () => {
  const responses=Array.from({length:250},(_,i)=>page([attack(i+1,1000-i)],next(999-i)));
  const c=client(responses);
  await assert.rejects(c.loadWar({...war,end:1000}),/page limit/i);
  assert.equal(c.calls.length,250);
  assert.ok(c.calls.every(call=>call.params.limit===100));
});
test('a terminal duplicate-only page also fails instead of silently accepting stale data', async () => {
  const c=client([page([attack(1,190)],next(180)),page([attack(1,190)])]);
  await assert.rejects(c.loadWar(war),/pagination/i);
});
test('abort before load or while awaiting a response prevents any subsequent request', async () => {
  const pre=new AbortController();pre.abort();
  const c=client([]);
  await assert.rejects(c.loadWar(war,pre.signal),e=>e.name==='AbortError');
  assert.equal(c.calls.length,0);
  const during=new AbortController();
  const d=client([()=>{during.abort();return page([attack(1,190)],next(180));}]);
  await assert.rejects(d.loadWar(war,during.signal),e=>e.name==='AbortError');
  assert.equal(d.calls.length,1);
});
test('cancellation clears pacing waits without sending the next request', async () => {
  const controller=new AbortController();
  const c=client([page([attack(1,190)],next(180))],{delayMs:1000});
  const promise=c.loadWar(war,controller.signal,()=>controller.abort());
  await assert.rejects(promise,e=>e.name==='AbortError');
  assert.equal(c.calls.length,1);
  const second=new AbortController();
  const d=client([page([attack(1,190)],next(180))],{delayMs:1000});
  const pending=d.loadWar(war,second.signal);
  await new Promise(resolve=>setTimeout(resolve,15));
  second.abort();
  await assert.rejects(pending,e=>e.name==='AbortError');
  assert.equal(d.calls.length,1);
});
test('transport failures are sanitized; optional cache failure does not lose aggregated counts', async () => {
  const secret='fixture-sensitive-key';
  const c=client([new Error(`https://api.torn.com/v2/faction/attacks?key=${secret} raw body`)]);
  await assert.rejects(c.loadWar(war),e=>!e.message.includes(secret)&&!e.message.includes('https:'));
  const d=client([page([attack(1,190)]),new Error(secret)]);
  const result=await d.loadWar(war);
  assert.equal(result.totals.hits,1);
  assert.deepEqual(result.caches,[]);
  const controller=new AbortController();
  const e=client([page([attack(1,150)]),()=>{controller.abort();throw new Error(secret);}]);
  await assert.rejects(e.loadWar(war,controller.signal),error=>error.name==='AbortError');
});
test('preserves sanitized calculator key/permission guidance but never arbitrary transport messages',async()=>{
  const c=client([WarPayoutAPI.requestError('Configure a Torn key in Hub API Keys or API connection.')]);
  await assert.rejects(c.listWars(),error=>error.message==='Configure a Torn key in Hub API Keys or API connection.');
  const d=client([WarPayoutAPI.requestError('This key needs faction attack access and faction API permission.')]);
  await assert.rejects(d.listWars(),error=>error.message.includes('faction attack access'));
});
(async()=>{
  for (const {name,run} of tests) { await run(); console.log(`PASS ${name}`); }
  console.log(`War payout API: ${tests.length} tests passed.`);
})().catch(error=>{ console.error(error);process.exitCode=1; });
