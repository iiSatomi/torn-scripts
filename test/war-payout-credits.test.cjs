'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { WarPayoutCredits: credits } = require('../lib/war-payout-credits.cjs');
const copy = value => structuredClone(value);
const scope = {warId:7,factionId:10,opponentId:20,start:100,end:200};
function draft(extra={}) { return {scope:{...scope},live:false,mode:'actual',coverage:'unverified',result:{profit:100,cut:10,pool:90,total:60,leftover:30,rates:{hits:10},rows:[{id:2,name:'Beta',payout:20,hits:2},{id:1,name:'Alpha',payout:40,hits:4},{id:3,name:'Zero',payout:0}]},...extra}; }
function memory(initial=null) { let data=copy(initial), writes=0; return {async load(){return copy(data);},async save(value){data=copy(value);writes++;},read:()=>copy(data),writes:()=>writes}; }
async function setup(store=memory()) {const controller=credits.createController({store,now:()=>1000000});await controller.init();await controller.lock(draft());return {controller,store};}
const action = (submit,available=()=>true) => ({trusted:true,available,submit});
const deferred = () => { let resolve,reject; const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject}; };

test('locks copied reviewed amounts in deterministic queue order, skips zero amounts and strips secrets',async()=>{
 const store=memory(),c=credits.createController({store,now:()=>1000000}); await c.init();const input=draft();input.apiKey='test-key';input.result.rows[0].session='synthetic-secret';await c.lock(input);input.result.rows[0].payout=999;
 const snap=c.snapshot();assert.deepEqual(snap.entries.map(e=>[e.id,e.amount,e.status]),[[1,40,'pending'],[2,20,'pending'],[3,0,'skipped']]);assert.equal(snap.nextMemberId,1);snap.entries[0].amount=999;assert.equal(c.snapshot().entries[0].amount,40);assert(!JSON.stringify(store.read()).includes('test-key'));
});
test('rejects live, estimate, incomplete scope, unsafe money, duplicate members and inconsistent budget',async()=>{
 const c=credits.createController({store:memory(),now:()=>1000000});await c.init();
 const cases=[draft({live:true}),draft({mode:'estimate'}),draft({scope:{...scope,end:1001}}),draft({scope:{...scope,opponentId:10}})];
 for(const [field,value] of [['total',61],['pool',50],['leftover',-1],['profit',Number.MAX_SAFE_INTEGER+1]]) {const item=draft();item.result[field]=value;cases.push(item);}
 const duplicate=draft();duplicate.result.rows.push({...duplicate.result.rows[0]});cases.push(duplicate);
 for(const item of cases) await assert.rejects(c.lock(item)); assert.equal(c.snapshot(),null);
});
test('over-budget lock gives actionable funding guidance without saving a run',async()=>{
 const store=memory(),c=credits.createController({store,now:()=>1000000});await c.init();const input=draft();input.result.total=91;input.result.leftover=-1;
 await assert.rejects(c.lock(input),/exceed the player pool.*funding.*rates/i);assert.equal(store.writes(),0);assert.equal(c.snapshot(),null);
});
test('persists crediting before one selected submit and never dispatches next implicitly',async()=>{
 const {controller:c,store}=await setup();let calls=0;await c.credit(2,action(async request=>{calls++;assert.equal(store.read().records[0].entries.find(e=>e.id===2).status,'crediting');assert.deepEqual(request,{memberId:2,amount:20,scope});return {status:'confirmed',message:'synthetic-secret'};}));
 assert.equal(calls,1);assert.equal(c.snapshot().entries.find(e=>e.id===2).status,'credited');assert.equal(c.snapshot().nextMemberId,1);await assert.rejects(c.credit(2,action(async()=>{calls++;})));assert.equal(calls,1);assert(!JSON.stringify(store.read()).includes('synthetic-secret'));
});
test('synchronous shared guard prevents clicks during delayed durable write',async()=>{
 const {controller:c,store}=await setup();const hold=deferred(),save=store.save;store.save=async records=>{await hold.promise;return save(records);};let calls=0;const pending=c.credit(1,action(async()=>{calls++;return {status:'confirmed'};}));
 assert.equal(c.snapshot().busy,true);await assert.rejects(c.credit(2,action(async()=>{calls++;})));await assert.rejects(c.skip(2));await assert.rejects(c.lock(draft()));hold.resolve();await pending;assert.equal(calls,1);
});
test('failed persistence prevents native submission and preserves reviewed state',async()=>{
 const {controller:c,store}=await setup();store.save=async()=>{throw new Error('synthetic-secret quota');};let calls=0;await assert.rejects(c.credit(1,action(async()=>{calls++;})),error=>!error.message.includes('synthetic-secret'));assert.equal(calls,0);assert.equal(c.snapshot().entries[0].status,'pending');
});
test('requires trusted action and checks availability after persistence',async()=>{
 const {controller:c}=await setup();let calls=0;const a=action(async()=>{calls++;});a.trusted=false;await assert.rejects(c.credit(1,a));let checks=0;await assert.rejects(c.credit(1,action(async()=>{calls++;},()=>++checks===1)));assert.equal(calls,0);assert.equal(checks,2);assert.equal(c.snapshot().entries[0].status,'pending');
});
test('rejection needs a new explicit click and cannot automatically advance',async()=>{
 const {controller:c}=await setup();let calls=0;await c.credit(1,action(async()=>{calls++;return {status:'rejected',message:'synthetic-secret'};}));assert.equal(c.snapshot().entries[0].status,'pending');assert.equal(calls,1);await c.credit(1,action(async()=>{calls++;return {status:'confirmed'};}));assert.equal(calls,2);
});
test('ambiguous outcomes block all crediting until manually reconciled',async()=>{
 for(const outcome of ['unknown','thrown','invalid']) {const {controller:c,store}=await setup();let calls=0;await c.credit(1,action(async()=>{calls++;if(outcome==='thrown')throw new Error('synthetic-secret');return {status:outcome};}));assert.equal(c.snapshot().entries[0].status,'needs-review');assert.equal(c.snapshot().blocked,true);await assert.rejects(c.credit(2,action(async()=>{calls++;})));await assert.rejects(c.reconcile(2,{status:'pending'}));await c.reconcile(1,{status:'credited',note:'synthetic-secret'});assert.equal(c.snapshot().blocked,false);assert.equal(c.snapshot().entries[0].status,'credited');assert.equal(calls,1);assert(!JSON.stringify(store.read()).includes('synthetic-secret'));}
});
test('reload retains credited members and converts unfinished durable attempts to needs-review',async()=>{
 const {controller:c,store}=await setup();await c.credit(1,action(async()=>({status:'confirmed'})));const raw=store.read();raw.records[0].entries[1].status='crediting';await store.save(raw);const fresh=credits.createController({store,now:()=>1000000});await fresh.init();await fresh.lock(draft());assert.deepEqual(fresh.snapshot().entries.map(e=>e.status),['credited','needs-review','skipped']);assert.equal(store.read().records[0].entries[1].status,'needs-review');
});
test('stop during submission preserves uncertainty, discards late completion, and never sends next',async()=>{
 const {controller:c,store}=await setup();const hold=deferred();let calls=0;const pending=c.credit(1,action(async()=>{calls++;return hold.promise;}));await new Promise(resolve=>setImmediate(resolve));await c.stop();assert.equal(c.snapshot().entries[0].status,'needs-review');hold.resolve({status:'confirmed'});await pending;assert.equal(c.snapshot().entries[0].status,'needs-review');assert.equal(store.read().records[0].entries[0].status,'needs-review');assert.equal(calls,1);await c.reconcile(1,{status:'pending'});assert.equal(c.snapshot().blocked,false);
});
test('stop during pre-submit persistence cannot issue a native request',async()=>{
 const {controller:c,store}=await setup();const hold=deferred(),save=store.save;let count=0,calls=0;store.save=async records=>{if(++count===1)await hold.promise;return save(records);};const pending=c.credit(1,action(async()=>{calls++;return {status:'confirmed'};}));const stopping=c.stop();hold.resolve();await pending;await stopping;assert.equal(calls,0);assert.equal(store.read().records[0].entries[0].status,'needs-review');
});
test('failure after submit leaves needs-review in memory and crediting durably for reload',async()=>{
 const {controller:c,store}=await setup();const save=store.save;let count=0;store.save=async records=>{if(++count===2)throw new Error('synthetic-secret');return save(records);};await assert.rejects(c.credit(1,action(async()=>({status:'confirmed'}))));assert.equal(c.snapshot().entries[0].status,'needs-review');assert.equal(c.snapshot().blocked,true);assert.equal(store.read().records[0].entries[0].status,'crediting');
});
test('unpaid revisions are allowed but paid/uncertain amounts and scope cannot be overwritten',async()=>{
 const {controller:c}=await setup();const revised=draft();revised.result.rows[0].payout=10;revised.result.total=50;revised.result.leftover=40;await c.lock(revised);assert.equal(c.snapshot().version,2);await c.credit(1,action(async()=>({status:'confirmed'})));await c.lock(revised);assert.equal(c.snapshot().entries[0].status,'credited');const changedPaid=draft();changedPaid.result.rows[1].payout=30;changedPaid.result.total=50;changedPaid.result.leftover=40;await assert.rejects(c.lock(changedPaid));const omitted=draft();omitted.result.rows=omitted.result.rows.filter(e=>e.id!==1);omitted.result.total=20;omitted.result.leftover=70;await assert.rejects(c.lock(omitted));
});
test('skip changes only local pending choice and next queue derives remaining order',async()=>{
 const {controller:c}=await setup();await c.skip(1);assert.equal(c.snapshot().nextMemberId,2);assert.equal(c.snapshot().entries[0].status,'skipped');await assert.rejects(c.credit(1,action(async()=>({status:'confirmed'}))));await c.skip(2);assert.equal(c.snapshot().nextMemberId,null);
});
test('malformed persisted ledgers disable submission without erasing records',async()=>{
 for(const raw of [{wrong:true},'{broken',{version:1,records:[{scope}]}]) {const store=memory(raw),c=credits.createController({store,now:()=>1000000});await assert.rejects(c.init());await assert.rejects(c.lock(draft()));assert.equal(store.writes(),0);}
});
test('bounded ledger refuses new runs while all ten have unsettled members',async()=>{
 const {controller:c,store}=await setup();for(let id=8;id<=16;id++)await c.lock(draft({scope:{...scope,warId:id}}));assert.equal(store.read().records.length,10);await assert.rejects(c.lock(draft({scope:{...scope,warId:17}})));assert.equal(store.read().records.length,10);
});
test('settled receipts remain remembered at capacity to prevent duplicate old-war payout',async()=>{
 const {controller:c,store}=await setup();await c.credit(1,action(async()=>({status:'confirmed'})));await c.skip(2);for(let id=8;id<=16;id++)await c.lock(draft({scope:{...scope,warId:id}}));await assert.rejects(c.lock(draft({scope:{...scope,warId:17}})));assert.equal(store.read().records.length,10);await c.lock(draft());assert.equal(c.snapshot().entries[0].status,'credited');
});
test('member cap prevents excessive locked or loaded entries',async()=>{
 const {controller:c,store}=await setup();const tooMany=draft();tooMany.result.rows=Array.from({length:1001},(_,i)=>({id:i+1,name:'Member',payout:0}));tooMany.result.total=0;tooMany.result.leftover=90;await assert.rejects(c.lock(tooMany));const raw=store.read();raw.records[0].entries=Array.from({length:1001},(_,i)=>({id:i+1,name:'Member',amount:0,status:'skipped'}));const loaded=credits.createController({store:memory(raw)});await assert.rejects(loaded.init());
});
test('PDA is preferred, GM fallback works, corrupt store and quota errors are safe',async()=>{
 let saved,gmCalls=0;const pda=credits.createStore({PDA_storage:{async get(key,fallback){assert.equal(key,'twpc-credit-ledger-v1');return saved??fallback;},async set(key,value){saved=value;}},GM_getValue(){gmCalls++;},GM_setValue(){gmCalls++;}});assert.equal(await pda.load(),null);const {store}=await setup();await pda.save(store.read());assert.deepEqual(await pda.load(),store.read());assert.equal(gmCalls,1);assert.equal(typeof saved,'string');
 for(const dot of [false,true]) {let data;const env=dot?{GM:{async getValue(k,d){return data??d;},async setValue(k,v){data=v;}}}:{GM_getValue(k,d){return data??d;},GM_setValue(k,v){data=v;}};const fallback=credits.createStore(env);await fallback.save(store.read());assert.deepEqual(await fallback.load(),store.read());}
 const bad=credits.createStore({GM_getValue(){return '{broken';},GM_setValue(){throw new Error('synthetic-secret');}});await assert.rejects(bad.load(),error=>!error.message.includes('synthetic-secret'));await assert.rejects(bad.save(store.read()),error=>!error.message.includes('synthetic-secret'));await assert.rejects(credits.createStore({}).load());
});

test('resolved method snapshots release busy state and preserve reviewed facts on identical resume',async()=>{
 const {controller:c}=await setup();const result=await c.credit(1,action(async()=>({status:'confirmed'})));assert.equal(result.busy,false);
 const resumed=draft();resumed.result.rows[1].name='Renamed';resumed.result.rows[1].hits=9;await c.lock(resumed);assert.equal(c.snapshot().entries[0].name,'Alpha');assert.equal(c.snapshot().entries[0].hits,4);
});
test('PDA migration copies one valid GM ledger once and never falls back after native failure',async()=>{
 const {store}=await setup();const legacy=JSON.stringify(store.read());let nativeValue=null,gets=0,sets=0;
 const migrated=credits.createStore({PDA_storage:{async get(){return nativeValue;},async set(k,v){nativeValue=v;sets++;}},GM_getValue(){gets++;return legacy;},GM_setValue(){assert.fail('migration preserves old GM data');}});
 assert.deepEqual(await migrated.load(),store.read());assert.deepEqual(await migrated.load(),store.read());assert.equal(gets,1);assert.equal(sets,1);
 const failed=credits.createStore({PDA_storage:{async get(){throw new Error('secret');},async set(){}},GM_getValue(){assert.fail('native failure cannot silently switch ledgers');},GM_setValue(){}});await assert.rejects(failed.load());
});
test('uncertainty in another saved run remains a global barrier to all credits',async()=>{
 const {store}=await setup();const raw=store.read();raw.records[0].entries[0].status='needs-review';const other=copy(raw.records[0]);other.scope.warId=8;other.entries[0].status='pending';raw.records.push(other);const c=credits.createController({store:memory(raw),now:()=>1000000});await c.init();assert.equal(c.snapshot().blocked,true);await assert.rejects(c.credit(1,action(async()=>{assert.fail('uncertainty was bypassed');})));await assert.rejects(c.lock(draft({scope:{...scope,warId:9}})));
});
test('existing uncertain runs remain selectable for reconciliation without permitting revisions',async()=>{
 const {store}=await setup();const raw=store.read();raw.records[0].entries[0].status='needs-review';const other=copy(raw.records[0]);other.scope.warId=8;other.entries[0].status='pending';raw.records.push(other);const c=credits.createController({store:memory(raw),now:()=>1000000});await c.init();await c.lock(draft());await c.reconcile(1,{status:'credited'});assert.equal(c.snapshot().blocked,false);
});



test('saved run summaries select older uncertain runs without fetching data or resetting status',async()=>{
 const {store}=await setup();const raw=store.read();raw.records[0].entries[0].status='needs-review';const other=copy(raw.records[0]);other.scope.warId=8;other.entries[0].status='pending';raw.records.push(other);const c=credits.createController({store:memory(raw),now:()=>1000000});await c.init();
 const summaries=c.listRuns();assert.deepEqual(summaries,[{key:'10:7',scope,version:1,total:60,blocked:true},{key:'10:8',scope:{...scope,warId:8},version:1,total:60,blocked:false}]);summaries[0].scope.warId=999;assert.equal(c.listRuns()[0].scope.warId,7);
 const selected=c.select('10:7');assert.equal(selected.scope.warId,7);assert.equal(selected.entries[0].status,'needs-review');assert.throws(()=>c.select('10:999'));assert.equal(c.snapshot().scope.warId,7);await c.reconcile(1,{status:'credited'});assert.equal(c.listRuns()[0].blocked,false);assert.equal(c.snapshot().blocked,false);
});
test('saved run selection shares the synchronous in-flight guard and does not write ledger',async()=>{
 const {controller:c,store}=await setup();const writesBefore=store.writes();c.select('10:7');assert.equal(store.writes(),writesBefore);
 const hold=deferred();const pending=c.credit(1,action(async()=>hold.promise));assert.throws(()=>c.select('10:7'));await new Promise(resolve=>setImmediate(resolve));hold.resolve({status:'confirmed'});await pending;assert.equal(c.select('10:7').entries[0].status,'credited');
});
test('stop drains delayed skip, reconciliation and lock writes before ownership transfer',async()=>{
 for(const kind of ['skip','reconcile','lock']) {
  const {controller:a,store}=await setup();if(kind==='reconcile')await a.credit(2,action(async()=>({status:'unknown'})));
  const hold=deferred(),save=store.save;let delayFirst=true;store.save=async records=>{if(delayFirst){delayFirst=false;await hold.promise;}await save(records);};
  let mutation;if(kind==='skip')mutation=a.skip(2);else if(kind==='reconcile')mutation=a.reconcile(2,{status:'pending'});else {const revised=draft();revised.result.rows[0].payout=10;revised.result.total=50;revised.result.leftover=40;mutation=a.lock(revised);}
  let busyAtTransfer;const transfer=a.stop().then(async()=>{busyAtTransfer=a.snapshot().busy;const b=credits.createController({store,now:()=>1000000});await b.init();if(b.snapshot().blocked)await b.reconcile(2,{status:'credited'});await b.credit(1,action(async()=>({status:'confirmed'})));});
  await new Promise(resolve=>setImmediate(resolve));hold.resolve();await Promise.all([mutation,transfer]);
  assert.equal(store.read().records[0].entries.find(entry=>entry.id===1).status,'credited',`${kind}: former owner overwrote credited receipt`);assert.equal(busyAtTransfer,false,`${kind}: ownership transferred before the former mutation finished`);
 }
});
