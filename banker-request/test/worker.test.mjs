import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
const moduleUrl = new URL('../worker/worker.mjs', import.meta.url);
test('secure relay implementation exists', () => assert.ok(existsSync(moduleUrl), 'missing secure relay'));
const implementation = existsSync(moduleUrl) ? await import(moduleUrl) : null;
const KEY = 'SyntheticKey0001';
const UUID = '9dfe305b-67f2-4d21-98db-fb2b5ee3ee58';
function harness(options = {}) {
  const db = new DatabaseSync(':memory:');
  const storage = { sql: { exec(query, ...args) { const rows = db.prepare(query).all(...args); return { toArray: () => rows, [Symbol.iterator]: () => rows[Symbol.iterator]() }; } }, transactionSync(fn) { db.exec('BEGIN'); try { const out = fn(); db.exec('COMMIT'); return out; } catch(e) { db.exec('ROLLBACK'); throw e; } } };
  const env = { FACTION_ID:'123', BANKER_IDS:'9', DISCORD_ROLE_IDS:'123456789012345678', ENABLED:'true', DISCORD_WEBHOOK:'https://discord.com/api/webhooks/123456789012345678/synthetic-token', ...options.env };
  const calls = []; let member = { id:7, name:'Alice', factionId:123 }; let balance = 1000000000000; let discord = options.discord || (() => Response.json({id:'123456789012345678'}));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({url:String(url), init});
    assert.equal(init.redirect,'manual','Torn and Discord redirects must never forward credentials');
    if (String(url).startsWith('https://api.torn.com/v2/user/')) {
      assert.match(init.headers.Authorization, /^ApiKey SyntheticKey[0-9]{4}$/);
      assert.equal(init.redirect, 'manual');
      if (options.torn) return options.torn(url, init);
      if (new URL(url).pathname.endsWith('/money')) return options.money ? options.money(url, init) : Response.json({money:{points:61,wallet:11223344,company:22334455,vault:33445566,cayman_bank:44556677,city_bank:{amount:55667788,profit:66778899,duration:90,interest_rate:0.6,until:1790000000,invested_at:1780000000},faction:{money:balance,points:71},daily_networth:77889900}});
      return Response.json(String(url).includes('/basic') ? {profile:{id:member.id,name:member.name,level:50,gender:'Male',status:{description:'Okay',details:null,state:'Okay',until:null}}} : {faction:{id:member.factionId,name:'Faction',tag:'F',tag_image:'',position:'Member',days_in_faction:10}});
    }
    assert.ok(String(url).startsWith('https://discord.com/api/webhooks/'));
    assert.equal(new URL(url).searchParams.get('wait'), 'true');
    return discord(url, init);
  };
  let object;
  function restart() { object = new implementation.BankerRelay({storage}, env); }
  restart();
  return { env, calls, storage, db, restart, raw(request) { return object.fetch(request); }, setMember(value) { member={...member,...value}; }, setBalance(value) { balance=value; },
    async request(path='/v1/requests', body={requestId:UUID,kind:'amount',amount:100}, headers={}) { const response = await object.fetch(new Request('https://relay.example'+path,{method:'POST',headers:{Authorization:'Bearer '+KEY,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1',...headers},body:JSON.stringify(body)})); return {status:response.status,body:await response.json(),headers:response.headers}; },
    restore() { globalThis.fetch=originalFetch; db.close(); }
  };
}
function secureTest(name, fn) { test(name, {skip:!implementation}, async () => { const h=harness(); try { await fn(h); } finally { h.restore(); } }); }
function assertNoReservation(h) {
  assert.equal(h.calls.filter(call=>call.url.includes('discord.com')).length,0);
  assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM request_ids').get().n,0);
  const state=JSON.parse(h.db.prepare('SELECT data FROM relay_state WHERE id=1').get().data);
  assert.deepEqual(state.notifications,[]);assert.deepEqual(state.members,{});assert.deepEqual(state.requests,{});
}
test('zero or negative own balance rejects amount and full requests before reserving notifications', {skip:!implementation}, async()=>{
  for(const balance of [0,-1]) for(const kind of ['amount','full']) {
    const h=harness();try {
      h.setBalance(balance);
      const result=await h.request('/v1/requests',{requestId:UUID,kind,...(kind==='amount'?{amount:1}:{})});
      assert.equal(result.status,409);assert.equal(result.body.error.code,'NO_BALANCE');assertNoReservation(h);
    } finally {h.restore();}
  }
});
secureTest('request over own balance is rejected and the same ID may be corrected without cooldown',async h=>{
  h.setBalance(99);
  const rejected=await h.request();assert.equal(rejected.status,409);assert.equal(rejected.body.error.code,'OVER_BALANCE');assertNoReservation(h);
  const corrected=await h.request('/v1/requests',{requestId:UUID,kind:'amount',amount:99});
  assert.equal(corrected.status,200);assert.equal(corrected.body.request.amount,99);
});
secureTest('fresh own balance is checked for each new request but replays and cooldown skips the read',async h=>{
  h.setBalance(100);const first=await h.request();assert.equal(first.status,200);
  h.setBalance(0);h.restart();const replay=await h.request();assert.equal(replay.body.request.token,first.body.request.token);
  const limited=await h.request('/v1/requests',{requestId:crypto.randomUUID(),kind:'full'});assert.equal(limited.status,429);
  assert.equal(h.calls.filter(call=>new URL(call.url).pathname.endsWith('/money')).length,1);
  const old=Date.now;Date.now=()=>old()+61000;
  try {const next=await h.request('/v1/requests',{requestId:crypto.randomUUID(),kind:'full'});assert.equal(next.body.error.code,'NO_BALANCE');}finally{Date.now=old;}
  const moneyCalls=h.calls.filter(call=>new URL(call.url).pathname.endsWith('/money'));
  assert.equal(moneyCalls.length,2);assert.ok(moneyCalls.every(call=>/^\d+$/.test(new URL(call.url).searchParams.get('timestamp'))));
  assert.ok(Number(new URL(moneyCalls[1].url).searchParams.get('timestamp'))>Number(new URL(moneyCalls[0].url).searchParams.get('timestamp')));
  assert.equal(h.calls.filter(call=>call.url.includes('discord.com')).length,1);
});
secureTest('full request validates own balance without storing or broadcasting the balance or other wealth',async h=>{
  h.setBalance(987654321);const result=await h.request('/v1/requests',{requestId:UUID,kind:'full'});assert.equal(result.status,200);
  assert.equal(h.calls.filter(call=>new URL(call.url).pathname.endsWith('/money')).length,1);
  assert.ok(!Object.hasOwn(result.body.request,'amount'));
  const sent=JSON.parse(h.calls.at(-1).init.body);assert.match(sent.content,/requested full faction balance/);
  const persisted=h.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(({name})=>h.db.prepare(`SELECT * FROM ${name}`).all());
  const visible=JSON.stringify([result.body,sent,persisted]);
  for(const privateValue of ['987654321','11223344','22334455','33445566','44556677','55667788','66778899','77889900']) assert.ok(!visible.includes(privateValue),'private wealth escaped own-balance validation');
});
test('permission, auth, upstream and malformed money results fail closed with fixed safe errors', {skip:!implementation},async()=>{
  const cases=[
    [()=>Response.json({error:{code:7,error:'private upstream denial'}}),'BALANCE_PERMISSION',403],
    [()=>new Response('private upstream denial',{status:403}),'BALANCE_PERMISSION',403],
    [()=>Response.json({error:{code:2,error:'private upstream denial'}}),'BALANCE_UNAVAILABLE',502],
    [()=>new Response('private upstream denial',{status:429}),'BALANCE_UNAVAILABLE',502],
    [()=>new Response(null,{status:302,headers:{Location:'https://foreign.example/collect'}}),'BALANCE_UNAVAILABLE',502],
    [()=>{throw Error('private upstream timeout');},'BALANCE_UNAVAILABLE',502],
    [()=>new Response('private invalid JSON'),'BALANCE_UNAVAILABLE',502],
    ...[{},null,{money:{}},{money:{faction:{money:'100'}}},{money:{faction:{money:0.5}}},{money:{faction:{money:Number.MAX_SAFE_INTEGER+1}}},{money:{faction:{money:null}}},{money:{faction:{money:100}},error:{code:0}}].map(body=>[()=>Response.json(body),'BALANCE_UNAVAILABLE',502])
  ];
  for(const [money,code,status] of cases) {
    const h=harness({money});try {
      const result=await h.request();assert.equal(result.status,status);assert.equal(result.body.error.code,code);assert.ok(!JSON.stringify(result.body).includes('private'));assertNoReservation(h);
    } finally {h.restore();}
  }
});
test('stalled money body times out without reserving a notification', {skip:!implementation},async()=>{
  const h=harness({money:()=>new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{'));}}))});
  try {const result=await h.request();assert.equal(result.status,502);assert.equal(result.body.error.code,'BALANCE_UNAVAILABLE');assertNoReservation(h);}finally{h.restore();}
});
secureTest('derives identity and exact server-built notification; never stores raw key', async h => {
 const r=await h.request(); assert.equal(r.status,200); assert.equal(r.body.request.userId,7); assert.equal(r.body.request.status,'sent'); assert.match(r.body.request.token,/^[0-9a-f-]{36}$/); assert.equal(r.body.retryAfter,60);
 const payload=JSON.parse(h.calls.at(-1).init.body); assert.deepEqual(payload.allowed_mentions,{parse:[],roles:['123456789012345678'],users:[]}); assert.ok(payload.content.includes('/factions.php?step=your&type=1#/tab=controls&bankRequest='+r.body.request.token));
 assert.ok(!JSON.stringify(h.db.prepare("SELECT name,sql FROM sqlite_master").all()).includes(KEY));
 for(const {name} of h.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()) assert.ok(!JSON.stringify(h.db.prepare(`SELECT * FROM ${name}`).all()).includes(KEY));
});
secureTest('strict input allowlists reject spoofed identity, invalid money/full fields and invalid UUID', async h => {
 for(const body of [{requestId:UUID,kind:'amount',amount:1,userId:9},{requestId:UUID,kind:'amount',amount:1,balance:1000000000000},{requestId:UUID,kind:'full',amount:1},{requestId:UUID,kind:'amount',amount:0},{requestId:UUID,kind:'amount',amount:Number.MAX_SAFE_INTEGER},{requestId:'no',kind:'full'}]) { const r=await h.request('/v1/requests',body); assert.equal(r.status,400); assert.equal(r.body.ok,false); }
 assert.equal(h.calls.length,0);
});
secureTest('concurrent duplicates and restart reuse one notification', async h => {
 const [a,b]=await Promise.all([h.request(),h.request()]); assert.equal(a.body.request.token,b.body.request.token); h.restart(); const c=await h.request(); assert.equal(c.body.request.token,a.body.request.token); assert.equal(h.calls.filter(x=>x.url.includes('discord.com')).length,1);
 const conflict=await h.request('/v1/requests',{requestId:UUID,kind:'amount',amount:101}); assert.equal(conflict.status,409);
});
secureTest('concurrent distinct UUIDs enforce durable member cooldown', async h => {
 const results=await Promise.all([h.request(),h.request('/v1/requests',{requestId:crypto.randomUUID(),kind:'full'})]); assert.deepEqual(results.map(r=>r.status).sort(),[200,429]); h.restart(); assert.equal((await h.request('/v1/requests',{requestId:crypto.randomUUID(),kind:'full'})).status,429);
});
secureTest('owner or faction banker alone resolves and expired links fail closed', async h => {
 const r=await h.request(); const token=r.body.request.token;
 assert.equal((await h.request('/v1/requests/resolve',{token})).status,200);
 const old=Date.now; Date.now=()=>old()+61000;
 try { h.setMember({id:8}); assert.equal((await h.request('/v1/requests/resolve',{token})).status,403); h.setMember({id:9}); Date.now=()=>old()+122000; assert.equal((await h.request('/v1/requests/resolve',{token})).status,200); Date.now=()=>old()+7200001; assert.equal((await h.request('/v1/requests/resolve',{token})).status,410); } finally {Date.now=old;}
});
secureTest('wrong faction rejected and cached identity expires within60seconds', async h => {
 assert.equal((await h.request('/v1/identity',{})).status,200); h.setMember({factionId:999}); assert.equal((await h.request('/v1/identity',{})).status,200);
 const old=Date.now; Date.now=()=>old()+60001; try{assert.equal((await h.request('/v1/identity',{})).status,403);}finally{Date.now=old;}
});
secureTest('preauth IP ceiling is durable and applied before Torn', async h => {
 for(let i=0;i<10;i++) await h.request('/v1/identity',{}, {Authorization:'Bearer bad'});
 h.restart(); const r=await h.request('/v1/identity',{}); assert.equal(r.status,429); assert.equal(h.calls.length,0);
});
secureTest('preauth aggregate ceiling applies across IPs before upstream verification', async h => {
 for(let i=0;i<30;i++) await h.request('/v1/identity',{}, {Authorization:'Bearer bad','CF-Connecting-IP':`192.0.2.${i+1}`});
 assert.equal((await h.request('/v1/identity',{}, {'CF-Connecting-IP':'192.0.2.99'})).status,429); assert.equal(h.calls.length,0);
});
secureTest('identity endpoint allowlists body and CORS rejects unrelated origins', async h => {
 assert.equal((await h.request('/v1/identity',{id:9})).status,400);
 const r=await h.request('/v1/identity',{}, {Origin:'https://evil.example'}); assert.equal(r.status,403); assert.equal(r.headers.get('Access-Control-Allow-Origin'),null);
 const good=await h.request('/v1/identity',{}, {Origin:'https://www.torn.com'}); assert.equal(good.headers.get('Access-Control-Allow-Origin'),'https://www.torn.com'); assert.equal(good.headers.get('Cache-Control'),'no-store');
});
test('uncertain and failed Discord outcomes never resend across restart', {skip:!implementation}, async () => {
 for(const discord of [()=>{throw Error('secret upstream');},()=>new Response('secret upstream',{status:500}),()=>new Response('secret upstream',{status:400}),()=>Response.json({}),()=>new Response(null,{status:204})]) {const h=harness({discord});try { const a=await h.request(); assert.ok(['failed','uncertain'].includes(a.body.request.status)); h.setBalance(0);h.restart();const b=await h.request();assert.equal(b.body.request.token,a.body.request.token);assert.equal(h.calls.filter(x=>x.url.includes('discord.com')).length,1);assert.equal(h.calls.filter(call=>new URL(call.url).pathname.endsWith('/money')).length,1);assert.ok(!JSON.stringify(b.body).includes('secret upstream')); } finally{h.restore();} }
});
test('disabled and unsafe webhook configuration make zero upstream calls', {skip:!implementation}, async () => {
 for(const env of [{ENABLED:undefined},{ENABLED:'false'},{DISCORD_WEBHOOK:'https://evil.example/api/webhooks/a/b'},{DISCORD_ROLE_IDS:'@everyone'}]) {const h=harness({env});try{assert.equal((await h.request()).status,503);assert.equal(h.calls.length,0);}finally{h.restore();}}
});
secureTest('request IDs remain non-reusable after24hour payload pruning', async h => {
 const sent=await h.request(); const old=Date.now;Date.now=()=>old()+86400001;
 try {h.restart();const replay=await h.request();assert.equal(replay.status,410);assert.equal(h.calls.filter(x=>x.url.includes('discord.com')).length,1);assert.equal((await h.request('/v1/requests/resolve',{token:sent.body.request.token})).status,404);}finally{Date.now=old;}
});
test('interrupted final persistence preserves uncertain reservation and never resends', {skip:!implementation}, async () => {
 let h;h=harness({discord:()=>{h.storage.sql.exec=(()=>{const exec=h.storage.sql.exec;return (sql,...args)=>{if(sql.startsWith('INSERT INTO relay_state')) throw Error('isolate stopped');return exec(sql,...args);};})();return Response.json({id:'123456789012345678'});}});
 const original=h.storage.sql.exec;
 try {const first=await h.request();assert.equal(first.status,503);h.storage.sql.exec=original;h.restart();const replay=await h.request();assert.equal(replay.body.request.status,'uncertain');assert.equal(h.calls.filter(x=>x.url.includes('discord.com')).length,1);}finally{h.restore();}
});
test('Discord timeout is durable uncertain and consumes notification cooldown', {skip:!implementation}, async () => {
 const h=harness({discord:()=>new Promise(()=>{})});try{const first=await h.request();assert.equal(first.body.request.status,'uncertain');h.restart();assert.equal((await h.request()).body.request.status,'uncertain');assert.equal((await h.request('/v1/requests',{requestId:crypto.randomUUID(),kind:'full'})).status,429);}finally{h.restore();}
});
test('Torn errors and malformed upstream identity never leak response text', {skip:!implementation}, async () => {
 for(const torn of [()=>Response.json({error:{code:2,error:'private body'}}),()=>Response.json({profile:{id:'7',name:'Alice'}}),()=>new Response('private body',{status:503})]){const h=harness({torn});try{const r=await h.request();assert.ok(r.status>=400);assert.ok(!JSON.stringify(r.body).includes('private body'));assert.equal(h.calls.filter(x=>x.url.includes('discord.com')).length,0);}finally{h.restore();}}
});
test('verification diagnostics expose only fixed stage/type labels, never upstream content', {skip:!implementation}, async()=>{
 const warnings=[],originalWarn=console.warn;console.warn=(...parts)=>warnings.push(parts);
 const h=harness({torn:()=>Response.json({profile:{id:'private-invalid-id',name:'private member name'}})});
 try{const r=await h.request('/v1/identity',{});assert.equal(r.body.error.code,'TORN_RESPONSE');assert.deepEqual(warnings,[['banker-verify','profile-shape',true,'string','string']]);assert.ok(!JSON.stringify(warnings).includes('private'));}
 finally{h.restore();console.warn=originalWarn;}
});
test('upstream redirects fail closed without following or verifying an identity', {skip:!implementation}, async()=>{
 const h=harness({torn:()=>new Response(null,{status:302,headers:{Location:'https://foreign.example/collect'}})});
 try{const r=await h.request('/v1/identity',{});assert.equal(r.body.ok,false);assert.equal(h.calls.length,1);assert.ok(h.calls.every(call=>call.url.startsWith('https://api.torn.com/')));}
 finally{h.restore();}
});
test('Discord redirect remains uncertain and cannot trigger another notification', {skip:!implementation}, async()=>{
 const h=harness({discord:()=>new Response(null,{status:302,headers:{Location:'https://foreign.example/collect'}})});
 try{const first=await h.request();assert.equal(first.body.request.status,'uncertain');h.restart();const second=await h.request();assert.equal(second.body.request.token,first.body.request.token);assert.equal(h.calls.filter(call=>call.url.includes('discord.com')).length,1);assert.ok(h.calls.every(call=>!call.url.includes('foreign.example')));}
 finally{h.restore();}
});

secureTest('faction ceiling limits10notifications/minute and100/hour across verified users', async h => {
 const old=Date.now;let now=old();Date.now=()=>now;
 try {
  for(let batch=0;batch<10;batch++) {
   for(let i=0;i<10;i++) {const id=batch*10+i+1;h.setMember({id});const r=await h.request('/v1/requests',{requestId:crypto.randomUUID(),kind:'full'},{Authorization:'Bearer SyntheticKey'+String(id).padStart(4,'0'),'CF-Connecting-IP':`192.0.2.${id}`});assert.equal(r.status,200);}
   h.setMember({id:900+batch});const limited=await h.request('/v1/requests',{requestId:crypto.randomUUID(),kind:'full'},{Authorization:'Bearer SyntheticKey'+String(900+batch).padStart(4,'0'),'CF-Connecting-IP':'192.0.2.200'});assert.equal(limited.status,429);
   now+=61000;h.restart();
  }
  h.setMember({id:1000});assert.equal((await h.request('/v1/requests',{requestId:crypto.randomUUID(),kind:'full'},{Authorization:'Bearer SyntheticKey1000'})).status,429);
  assert.equal(h.calls.filter(x=>x.url.includes('discord.com')).length,100);
 } finally {Date.now=old;}
});
secureTest('verified names cannot inject Discord mentions', async h => {
 h.setMember({name:'<@&999999999999999999> @everyone [x](https://evil.example)'});
 const r=await h.request();assert.equal(r.status,200);const payload=JSON.parse(h.calls.at(-1).init.body);assert.ok(!payload.content.includes('@everyone'));assert.ok(!payload.content.includes('<@&999999999999999999>'));
});
secureTest('oversized JSON body and wrong content type never call Torn', async h => {
 assert.equal((await h.request('/v1/identity',{padding:'a'.repeat(1025)})).status,413);
 assert.equal((await h.request('/v1/identity',{}, {'Content-Type':'text/plain'})).status,415);assert.equal(h.calls.length,0);
});
test('Worker always routes the configured faction to its singleton binding', {skip:!implementation}, async () => {
 let name;const request=new Request('https://relay.example/v1/identity',{method:'POST'});
 const env={FACTION_ID:'123',BANKER_IDS:'9',DISCORD_ROLE_IDS:'123456789012345678',ENABLED:'true',DISCORD_WEBHOOK:'https://discord.com/api/webhooks/123456789012345678/synthetic-token',BANKER_RELAY:{idFromName(n){name=n;return 'singleton';},get(id){assert.equal(id,'singleton');return{fetch(req){assert.equal(req,request);return Response.json({ok:true});}};}}};
 const r=await implementation.default.fetch(request,env);assert.equal(r.status,200);assert.equal(name,'faction:123');
});

secureTest('a stalled input body cannot hold the serialized relay indefinitely', async h => {
 const stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{'));}});
 const request=new Request('https://relay.example/v1/identity',{method:'POST',headers:{Authorization:'Bearer '+KEY,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1'},body:stream,duplex:'half'});
 const outcome=await Promise.race([h.raw(request),new Promise(resolve=>setTimeout(()=>resolve(null),2500))]);
 assert.ok(outcome,'relay did not bound body-read time');assert.equal(outcome.status,408);assert.equal(h.calls.length,0);
});
secureTest('oversized input returns promptly even when stream cancellation never settles', async h => {
 const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(1025));},cancel(){return new Promise(()=>{});}});
 const request=new Request('https://relay.example/v1/identity',{method:'POST',headers:{Authorization:'Bearer '+KEY,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1'},body:stream,duplex:'half'});
 const result=await Promise.race([h.raw(request),new Promise(resolve=>setTimeout(()=>resolve(null),250))]);
 assert.ok(result,'oversize rejection awaited hostile cancellation');assert.equal(result.status,413);
 assert.equal((await h.request('/v1/identity',{})).status,200);
});
test('upstream errors return promptly when response cancellation never settles', {skip:!implementation}, async () => {
 const h=harness({torn:()=>new Response(new ReadableStream({cancel(){return new Promise(()=>{});}}),{status:503})});
 try {const result=await Promise.race([h.request(),new Promise(resolve=>setTimeout(()=>resolve(null),250))]);assert.ok(result,'upstream error awaited hostile cancellation');assert.equal(result.status,401);}finally{h.restore();}
});
secureTest('rejected stream cancellation cannot replace the sanitized size error', async h => {
 const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(1025));},cancel(){return Promise.reject(Error('private cancellation detail'));}});
 const result=await h.raw(new Request('https://relay.example/v1/identity',{method:'POST',headers:{Authorization:'Bearer '+KEY,'Content-Type':'application/json'},body:stream,duplex:'half'}));
 assert.equal(result.status,413);assert.equal((await result.json()).error.code,'BODY_SIZE');await new Promise(resolve=>setImmediate(resolve));
});
test('role configuration rejects more than10 roles before consuming notification state', {skip:!implementation}, async () => {
 const roles=Array.from({length:11},(_,i)=>(10000000000000000000n+BigInt(i)).toString()).join(',');const h=harness({env:{DISCORD_ROLE_IDS:roles}});
 try{assert.equal((await h.request()).status,503);assert.equal(h.calls.length,0);assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM request_ids').get().n,0);}finally{h.restore();}
});
test('maximum supported role configuration and name keep Discord content within2000characters', {skip:!implementation}, async () => {
 const roles=Array.from({length:10},(_,i)=>(10000000000000000000n+BigInt(i)).toString()).join(',');const h=harness({env:{DISCORD_ROLE_IDS:roles}});
 try{h.setMember({id:Number.MAX_SAFE_INTEGER,name:'A'.repeat(100)});const r=await h.request('/v1/requests',{requestId:UUID,kind:'amount',amount:1000000000000});assert.equal(r.status,200);const content=JSON.parse(h.calls.at(-1).init.body).content;assert.ok(content.length<=2000);assert.equal(JSON.parse(h.calls.at(-1).init.body).allowed_mentions.roles.length,10);}finally{h.restore();}
});
