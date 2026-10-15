'use strict';

const assert = require('node:assert/strict');
const {test} = require('node:test');
const {WarPayoutRaffle:R} = require('../lib/war-payout-raffle.cjs');

const KEY='twpc-raffle-draws-v1';
const scope={warId:91,factionId:10,opponentId:20,start:100,end:200};
const row=(id,losses=1,extra={})=>({id,name:`Player ${id}`,hits:0,losses,assists:0,stalemates:0,defends:0,...extra});
const snapshot=(rows=[row(1,2),row(2,3),row(3,1)])=>({scope:{...scope},live:false,rows});
const settings=(extra={})=>({weights:{losses:1},...extra});
// Explicit candidate integers allow boundary checks without statistical claims.
function cryptoCandidates(...candidates){
  let index=0;
  return {getRandomValues(array){
    if(array instanceof Uint8Array){array.fill(++index);return array;}
    assert.ok(array instanceof Uint32Array);assert.equal(array.length,2);
    const value=BigInt(candidates.shift()??0);array[0]=Number(value>>32n);array[1]=Number(value&0xffffffffn);return array;
  }};
}
const record=(options={})=>R.draw(snapshot(),settings(options),cryptoCandidates(4,0),()=>300000);

test('pool sums decimal products exactly before one floor per member',()=>{
  const result=R.pool([row(1,7,{hits:1}),row(2,0,{hits:1})],settings({weights:{losses:'0.1',hits:'0.3'}}));
  assert.deepEqual(result.entries,[{id:1,name:'Player 1',tickets:1,counts:{hits:1,losses:7,assists:0,stalemates:0,defends:0}}]);
  assert.equal(result.total,1);
  assert.equal(result.settings.weights.losses,'0.1');
  assert.equal(result.settings.weights.flat,'0');
  assert.equal(R.pool([row(1,9999)],settings({weights:{losses:'0.0001',flat:'0.0001'}})).total,1);
});

test('pool caps once and applies minimum eligibility, with flat tickets per counted participant',()=>{
  assert.deepEqual(R.pool([row(1,1),row(2,4),row(3,0)],settings({weights:{losses:1,flat:1},cap:3,min:3})).entries.map(r=>({id:r.id,tickets:r.tickets})),[{id:2,tickets:3}]);
  assert.equal(R.pool([row(1,0)],settings({weights:{flat:1}})).total,1);
  assert.equal(R.pool([row(1,5)],settings({cap:0,min:0})).total,5);
  assert.equal(R.pool([],settings()).total,0);
});

test('pool rejects unsafe counts, duplicate IDs, oversized rows and invalid settings',()=>{
  for(const rows of [[row(1,-1)],[row(1,0.1)],[row(1,NaN)],[row(1,Number.MAX_SAFE_INTEGER+1)],[row('1')],[row(1),row(1)],Array.from({length:1001},(_,i)=>row(i+1))])assert.throws(()=>R.pool(rows,settings()));
  for(const bad of [{weights:{losses:-1}},{weights:{losses:'0.00001'}},{weights:{losses:'1e3'}},{weights:{losses:Infinity}},{weights:{losses:1e30}},{weights:[]},{cap:-1},{cap:1.5},{min:-1},{winners:0},{winners:1.5}])assert.throws(()=>R.pool([row(1)],settings(bad)));
  assert.throws(()=>R.pool([row(1,Number.MAX_SAFE_INTEGER),row(2)],settings()));
  assert.throws(()=>R.pool([row(1,Number.MAX_SAFE_INTEGER)],settings({weights:{losses:2}})));
});

test('randomBelow rejects the 53-bit tail and handles ranges above 32 bits',()=>{
  const range=1n<<53n;
  assert.equal(R.randomBelow(10,cryptoCandidates(range-1n,19)),9);
  assert.equal(R.randomBelow(2**32+1,cryptoCandidates(2**32)),2**32);
  assert.equal(R.randomBelow(Number.MAX_SAFE_INTEGER,cryptoCandidates(range-1n,range-2n)),Number.MAX_SAFE_INTEGER-1);
  assert.equal(R.randomBelow(1,cryptoCandidates(range-1n)),0);
  assert.equal(R.randomBelow(6,cryptoCandidates(0)),0);
});

test('secure randomness fails closed, including repeated rejection',()=>{
  for(const total of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>R.randomBelow(total,cryptoCandidates()));
  assert.throws(()=>R.randomBelow(1,{}),/random|crypto/i);
  assert.throws(()=>R.randomBelow(1,{getRandomValues(){throw new Error('Unavailable');}}));
  assert.throws(()=>R.randomBelow(10,{getRandomValues(a){a.fill(0xffffffff);return a;}}),/random|rejection/i);
});

test('RNG failures expose safe random wording for both ticket picks and draw IDs',()=>{
  const secret='Synthetic RNG failure containing private bridge data';
  const safeError=error=>/random/i.test(error.message)&&!error.message.includes(secret);
  assert.throws(()=>R.randomBelow(1,{getRandomValues(){throw new Error(secret);}}),safeError);
  const crypto=cryptoCandidates();
  const fill=crypto.getRandomValues;
  crypto.getRandomValues=array=>{if(array instanceof Uint8Array)throw new Error(secret);return fill(array);};
  assert.throws(()=>R.draw(snapshot(),settings(),crypto,()=>300000),safeError);
});

test('draw maps ticket intervals and removes every winning member ticket',()=>{
  const result=record({winners:3});
  assert.deepEqual(result.winners,[
    {rank:1,id:2,name:'Player 2',tickets:3,poolTickets:6,winningTicket:4},
    {rank:2,id:1,name:'Player 1',tickets:2,poolTickets:3,winningTicket:0},
    {rank:3,id:3,name:'Player 3',tickets:1,poolTickets:1,winningTicket:0}
  ]);
  assert.equal(R.draw(snapshot(),settings(),cryptoCandidates(2),()=>300000).winners[0].id,2);
  assert.equal(R.draw(snapshot(),settings(),cryptoCandidates(5),()=>300000).winners[0].id,3);
  assert.throws(()=>record({winners:4}));
  assert.throws(()=>R.draw(snapshot([row(1,0)]),settings(),cryptoCandidates(),()=>300000));
});

test('draw freezes sanitized original facts and requires an ended nonlive scope',()=>{
  const input=snapshot();input.apiKey='secret';input.rows[0].payout=123;input.scope.balance=999;
  const result=R.draw(input,settings(),cryptoCandidates(),()=>300000);
  input.rows[0].name='Changed';input.scope.end=220;
  assert.equal(result.entries[0].name,'Player 1');assert.equal(result.scope.end,200);
  assert.equal(result.createdAt,300000);assert.equal(result.version,1);assert.equal(result.coverageStatus,'unverified');
  assert.match(result.id,/^[a-z0-9-]+$/i);assert.ok(Object.isFrozen(result.entries[0]));assert.ok(Object.isFrozen(result.settings.weights));
  assert.doesNotMatch(JSON.stringify(result),/apiKey|secret|payout|balance/);
  for(const input of [{...snapshot(),live:true},{...snapshot(),live:undefined},{...snapshot(),scope:{...scope,end:0}},{...snapshot(),scope:{...scope,end:301}},{...snapshot(),scope:{...scope,start:0}},{...snapshot(),scope:{...scope,opponentId:10}}])assert.throws(()=>R.draw(input,settings(),cryptoCandidates(),()=>300000));
  assert.throws(()=>R.draw(snapshot(),settings(),cryptoCandidates(),()=>NaN));
});

function storageEnv(initial=null){
  let value=initial,tail=Promise.resolve();
  const state={reads:0,writes:0,rejectWrites:false,delayRead:null};
  const env={
    async GM_getValue(key){assert.equal(key,KEY);state.reads++;if(state.delayRead)await state.delayRead();return value;},
    async GM_setValue(key,next){assert.equal(key,KEY);if(state.rejectWrites)throw new Error('QuotaExceeded');state.writes++;value=next;},
    locks:{request(key,options,work){assert.equal(key,KEY);assert.equal(options.mode,'exclusive');const run=tail.then(work);tail=run.catch(()=>{});return run;}}
  };
  return {env,state,get value(){return value;},set value(next){value=next;}};
}

test('archive loads once, appends immutable clones, and never modifies other stores',async()=>{
  const store=storageEnv(),archive=R.createArchive(store.env);
  await archive.load();await archive.load();assert.equal(store.state.reads,1);
  const draw=record();await archive.append(draw);
  const result=archive.list();result[0].entries[0].name='tamper';
  assert.equal(archive.list()[0].entries[0].name,'Player 1');
  assert.deepEqual(JSON.parse(store.value).records,[draw]);
  await assert.rejects(archive.append(draw),/duplicate/i);
  assert.equal(archive.list().length,1);
});

test('archive rejects inconsistent winner replays, settings and ticket totals',async()=>{
  const original=record({winners:2});
  const cases=[r=>r.total++,r=>r.entries[0].counts.losses++,r=>r.winners[0].poolTickets--,r=>r.winners[0].winningTicket=0,r=>r.winners[1].id=r.winners[0].id,r=>r.winners[0].name='Other',r=>r.winners[0].tickets++,r=>r.winners.pop(),r=>r.settings.weights.losses='0.00001',r=>r.settings.cap=1,r=>r.settings.min=4,r=>r.id='invalid',r=>r.scope.end=400];
  for(const mutate of cases){const bad=JSON.parse(JSON.stringify(original));mutate(bad);const store=storageEnv();await assert.rejects(R.createArchive(store.env).append(bad));assert.equal(store.state.writes,0);}
});

test('archive rejects malformed source data and preserves state on quota failure',async()=>{
  for(const value of ['bad json',{version:2,records:[]},{version:1,records:[{}]}])await assert.rejects(R.createArchive(storageEnv(value).env).load());
  const store=storageEnv(),archive=R.createArchive(store.env);await archive.load();store.state.rejectWrites=true;
  await assert.rejects(archive.append(record()),/save|storage|quota/i);assert.deepEqual(archive.list(),[]);assert.equal(store.value,null);
});

test('native archive migrates valid GM data once and remains authoritative',async()=>{
  const draw=record(),store=storageEnv(JSON.stringify({version:1,records:[draw]}));let native=null;
  store.env.PDA_storage={async get(){return native;},async set(key,value){assert.equal(key,KEY);native=value;}};
  const archive=R.createArchive(store.env);await archive.load();assert.deepEqual(archive.list(),[draw]);
  const legacy=store.value;store.value='invalid legacy';await R.createArchive(store.env).load();assert.ok(native);assert.equal(legacy.includes(draw.id),true);
  store.env.PDA_storage={async get(){return null;},async set(){throw new Error('QuotaExceeded');}};
  store.value=legacy;await assert.rejects(R.createArchive(store.env).load());assert.equal(store.value,legacy);
});

test('archive refuses unlocked writes and checks activity after a delayed read',async()=>{
  const unlocked=storageEnv();unlocked.env.locks=false;const a=R.createArchive(unlocked.env);await a.load();await assert.rejects(a.append(record()),/lock/i);assert.equal(unlocked.state.writes,0);
  const store=storageEnv(),archive=R.createArchive(store.env);await archive.load();let active=true;
  store.state.delayRead=async()=>{active=false;};await assert.rejects(archive.append(record(),{active:()=>active}),/active|paused/i);assert.equal(store.state.writes,0);
});

test('cross-tab read and append are serialized so both results survive',async()=>{
  const store=storageEnv(),a=R.createArchive(store.env),b=R.createArchive(store.env);await Promise.all([a.load(),b.load()]);
  const anotherWar=snapshot();anotherWar.scope.warId=92;
  const first=record(),second=R.draw(anotherWar,settings(),cryptoCandidates(),()=>301000);
  await Promise.all([a.append(first),b.append(second)]);
  assert.deepEqual(JSON.parse(store.value).records.map(r=>r.id),[first.id,second.id]);
});

test('archive refuses a 51st draw without evicting or writing',async()=>{
  const records=Array.from({length:50},(_,i)=>R.draw(snapshot(),settings(),cryptoCandidates(),()=>300000+i));
  const store=storageEnv(JSON.stringify({version:1,records})),archive=R.createArchive(store.env);await archive.load();
  await assert.rejects(archive.append(R.draw(snapshot(),settings(),cryptoCandidates(),()=>301000),{previousDrawId:records[49].id}),/full|limit/i);
  assert.equal(archive.list().length,50);assert.equal(store.state.writes,0);
});

test('odds CSV neutralizes formulas and labels probabilities as first pick only',()=>{
  const input=R.pool([row(1,1,{name:'=cmd,"x"'}),row(2,3,{name:'\t+SUM(A1)'})],settings());
  const csv=R.oddsCsv(input);
  assert.match(csv,/First.pick/i);assert.match(csv,/'=cmd,""x""/);assert.match(csv,/'\+SUM\(A1\)/);assert.match(csv,/25/);assert.match(csv,/75/);
});

test('archive rejects missing original settings rather than assuming draw defaults',async()=>{
  for(const mutate of [r=>delete r.settings,r=>delete r.settings.weights,r=>delete r.settings.weights.hits,r=>delete r.settings.winners,r=>r.settings.cap=null,r=>r.settings.min=null,r=>r.settings.weights.hits=null]){
    const bad=JSON.parse(JSON.stringify(record()));mutate(bad);const store=storageEnv();await assert.rejects(R.createArchive(store.env).append(bad));assert.equal(store.state.writes,0);
  }
});

test('inactivity during initial native migration prevents the migration write',async()=>{
  const store=storageEnv(JSON.stringify({version:1,records:[record()]}));let active=true,nativeWrites=0;
  store.env.PDA_storage={async get(){active=false;return null;},async set(){nativeWrites++;}};
  const archive=R.createArchive(store.env);
  await assert.rejects(archive.append(R.draw(snapshot(),settings(),cryptoCandidates(),()=>301000),{active:()=>active}),/active|paused/i);
  assert.equal(nativeWrites,0);
});

test('archive enforces the UTF-8 byte bound even below the draw count bound',async()=>{
  const many=snapshot(Array.from({length:1000},(_,i)=>row(i+1,1,{name:'\u65e5'.repeat(100)})));
  const records=Array.from({length:5},(_,i)=>R.draw(many,settings(),cryptoCandidates(),()=>300000+i));
  const store=storageEnv(JSON.stringify({version:1,records})),archive=R.createArchive(store.env);await archive.load();const before=store.value;
  await assert.rejects(archive.append(R.draw(many,settings(),cryptoCandidates(),()=>301000),{previousDrawId:records[4].id}),/full|limit/i);
  assert.equal(store.value,before);assert.equal(archive.list().length,5);assert.equal(store.state.writes,0);
  await assert.rejects(R.createArchive(storageEnv(' '.repeat(2*1024*1024+1)).env).load(),/size|limit/i);
});

test('storage failures never echo raw corrupt contents or bridge messages',async()=>{
  const invalid=storageEnv('{"apiKey":"FAKE",bad}');
  await assert.rejects(R.createArchive(invalid.env).load(),error=>!/apiKey|FAKE/.test(error.message));
  const failed=storageEnv();failed.env.GM_getValue=async()=>{throw new Error('do-not-show-this-value');};
  await assert.rejects(R.createArchive(failed.env).load(),error=>!/do-not-show/.test(error.message));
});

test('archive strips unexpected data and preserves its previous cache after a corrupt cross-tab read',async()=>{
  const input=JSON.parse(JSON.stringify(record()));input.apiKey='do-not-store';input.entries[0].balance=99;input.settings.rawAttacks=['do-not-store'];
  const store=storageEnv(),archive=R.createArchive(store.env);await archive.append(input);
  assert.doesNotMatch(store.value,/apiKey|balance|rawAttacks|do-not-store/);
  store.value='corrupt';
  await assert.rejects(archive.append(R.draw(snapshot(),settings(),cryptoCandidates(),()=>301000)));
  assert.equal(archive.list().length,1);assert.equal(store.value,'corrupt');assert.equal(store.state.writes,1);
});

test('archive initialization can retry after a transient read failure',async()=>{
  const store=storageEnv();let fail=true;const get=store.env.GM_getValue;
  store.env.GM_getValue=async(...args)=>{if(fail)throw new Error('Offline');return get(...args);};
  const archive=R.createArchive(store.env);await assert.rejects(archive.load());fail=false;
  await archive.load();await archive.append(record());assert.equal(archive.list().length,1);
});

test('concurrent first draws of one war require the losing tab to review the saved draw',async()=>{
  const store=storageEnv(),a=R.createArchive(store.env),b=R.createArchive(store.env);
  await Promise.all([a.load(),b.load()]);
  const first=record(),second=R.draw(snapshot(),settings(),cryptoCandidates(),()=>301000);
  const results=await Promise.allSettled([a.append(first),b.append(second)]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  const rejected=results.find(result=>result.status==='rejected');
  assert.match(rejected.reason.message,/review.*confirm|confirm.*review/i);
  assert.deepEqual(JSON.parse(store.value).records.map(draw=>draw.id),[first.id]);
  assert.deepEqual(b.list().map(draw=>draw.id),[first.id]);
  assert.equal(store.state.writes,1);
});

test('repeated draws require the acknowledged latest draw ID in append order',async()=>{
  const store=storageEnv(),a=R.createArchive(store.env),b=R.createArchive(store.env);
  const first=record(),second=R.draw(snapshot(),settings(),cryptoCandidates(),()=>302000);
  const third=R.draw(snapshot(),settings(),cryptoCandidates(),()=>301000);
  await a.append(first);await b.load();
  await a.append(second,{previousDrawId:first.id});
  await assert.rejects(b.append(third,{previousDrawId:first.id}),/review.*confirm|confirm.*review/i);
  assert.deepEqual(b.list().map(draw=>draw.id),[first.id,second.id]);
  assert.equal(store.state.writes,2);
  await b.append(third,{previousDrawId:second.id});
  assert.deepEqual(JSON.parse(store.value).records.map(draw=>draw.id),[first.id,second.id,third.id]);
  // The last appended record remains latest even if the local clock moved back.
  const fourth=R.draw(snapshot(),settings(),cryptoCandidates(),()=>303000);
  await assert.rejects(a.append(fourth,{previousDrawId:second.id}),/review.*confirm|confirm.*review/i);
  await a.append(fourth,{previousDrawId:third.id});
  assert.equal(store.state.writes,4);
});
