const test=require('node:test');
const assert=require('node:assert/strict');
const domain=require('../src/domain.cjs');
const now=1800000000000;
const token='dc88f110-9e02-4ce0-a038-d004ee887399';
const request={token,requestId:'6bc34db5-3049-4015-af10-ae19c90a8617',userId:123,name:'Sample',factionId:10,kind:'amount',amount:5000000,createdAt:now-1000,expiresAt:now+60000,status:'sent'};
test('parses whole dollars with conventional grouping, rejects ambiguous input',()=>{
  for(const [text,n] of [['5,000,000',5000000],['5000000',5000000],[' $ 250 ',250]])assert.equal(domain.parseAmount(text),n);
  for(const text of ['0','-1','5m','1.2','1e6','5,00','1 000','2abc','9007199254740992',''])assert.throws(()=>domain.parseAmount(text));
});
test('accepts only root HTTPS relay origins without secrets or local hosts',()=>{
  assert.equal(domain.validateEndpoint('https://banker-request.example.workers.dev/'),'https://banker-request.example.workers.dev');
  for(const text of ['http://example.com','https://u:p@example.com','https://example.com/a','https://example.com?key=a','https://localhost','https://127.0.0.1','https://[::1]','https://www.torn.com','https://discord.com'])assert.throws(()=>domain.validateEndpoint(text));
});
test('links are Torn controls routes containing one opaque request token',()=>{
  assert.equal(domain.parseRequestLink(new URL('https://www.torn.com/factions.php?step=your&type=1#/tab=controls&bankRequest='+token)),token);
  for(const url of ['https://example.com/factions.php?step=your#/tab=controls&bankRequest='+token,'https://www.torn.com/factions.php?step=your#/tab=controls&bankRequest='+token+'&bankRequest='+token,'https://www.torn.com/index.php#bankRequest='+token,'https://www.torn.com/factions.php?step=your#/tab=controls&bankRequest=bad'])assert.equal(domain.parseRequestLink(new URL(url)),null);
});
test('plan checks exact member, faction, live age and positive balance',()=>{
  const snap={userId:123,factionId:10,balanceCents:1250000000n,observedAt:now};
  assert.deepEqual(domain.payoutPlan(request,snap,now),{amount:5000000,balanceCents:1250000000n,afterCents:750000000n,userId:123,factionId:10});
  for(const changed of [{userId:456},{factionId:11},{balanceCents:300000000n},{balanceCents:0n},{balanceCents:-1n},{observedAt:now-31000}])assert.throws(()=>domain.payoutPlan(request,{...snap,...changed},now));
  assert.throws(()=>domain.payoutPlan({...request,expiresAt:now-1},snap,now));
  assert.throws(()=>domain.payoutPlan({...request,status:'uncertain'},snap,now));
});
test('full balance rounds down to whole dollars and never exceeds available cents',()=>{
  const plan=domain.payoutPlan({...request,kind:'full',amount:null},{userId:123,factionId:10,balanceCents:123456789n,observedAt:now},now);
  assert.equal(plan.amount,1234567);assert.equal(plan.afterCents,89n);
  assert.throws(()=>domain.payoutPlan({...request,kind:'full'},{userId:123,factionId:10,balanceCents:99n,observedAt:now},now));
});
test('strict native cents parser preserves cents and rejects truncated or scientific text',()=>{
  assert.equal(domain.parseCents('$12,500,000.25'),1250000025n);
  assert.equal(domain.parseCents('-1.50'),-150n);
  for(const text of ['12,50','unknown','1e5','1.001','3 dollars',''])assert.throws(()=>domain.parseCents(text));
});
test('validates upstream request records and does not copy arbitrary fields',()=>{
  assert.equal(domain.readRequest(request,now).token,token);
  for(const changed of [{userId:0},{amount:-5},{kind:'other'},{token:'bad'},{name:'x'.repeat(1000)},{expiresAt:now-1}])assert.throws(()=>domain.readRequest({...request,...changed},now));
  assert.equal(Object.hasOwn(domain.readRequest({...request,apiKey:'synthetic-only'},now),'apiKey'),false);
});
