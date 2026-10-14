'use strict';
const assert = require('node:assert/strict');
const { WarPayoutDomain: domain } = require('../lib/war-payout-domain.cjs');
let passed = 0;
function test(name, run) { run(); passed++; }
const scope = {warId:7, factionId:10, opponentId:20, start:100, end:200};
const zero = {hits:0, losses:0, assists:0, stalemates:0, defends:0};
const player = (id, faction, name = `Player ${id}`) => ({id,name,level:50,faction:{id:faction,name:`Faction ${faction}`}});
function attack(id, result, attacker=player(1,10), defender=player(9,20), ended=150, extra={}) {
  return {id,code:`synthetic-${id}`,started:ended-10,ended,attacker,defender,result,
    respect_gain:0,respect_loss:0,chain:0,is_interrupted:false,is_stealthed:false,is_raid:false,
    is_ranked_war:false,is_territory_war:false,territory_war_id:null,finishing_hit_effects:[],modifiers:{},...extra};
}
const row = (id,name,counts={}) => ({id,name,...zero,...counts});

test('counts only recorded war sides and inclusive completion window', () => {
  const data = [attack(1,'Attacked',player(3,10,'Former member'),player(9,20),100),
    attack(2,'Mugged',player(3,10),player(9,20),200),
    attack(3,'Hospitalized',player(9,20),player(3,10,'Former member')),
    attack(4,'Attacked',player(3,10),player(9,30)),attack(5,'Attacked',player(9,30),player(3,10)),
    attack(6,'Attacked',undefined,undefined,99),attack(7,'Attacked',undefined,undefined,201),
    attack(8,'Attacked',player(3,30),player(9,20))];
  const result = domain.aggregate(data,scope);
  assert.deepEqual(result,{rows:[row(3,'Former member',{hits:2,losses:1})],
    totals:{...zero,hits:2,losses:1},excluded:5,unattributed:0,unknownResults:0});
});
test('successful outcome categories and only defensive Lost qualify for defends', () => {
  const data = ['Attacked','Mugged','Hospitalized','Arrested','Looted','Special'].map((r,i)=>attack(i+1,r));
  data.push(attack(20,'Lost'),attack(21,'Assist'),attack(22,'Stalemate'),
    attack(23,'Lost',player(9,20),player(2,10)),attack(24,'Stalemate',player(9,20),player(2,10)),
    attack(25,'Escape',player(9,20),player(2,10)),attack(26,'Timeout',player(9,20),player(2,10)),
    attack(27,'Unknown future result'),attack(28,'Interrupted'),attack(29,'None'),attack(30,'Bounty'));
  const result = domain.aggregate(data,scope);
  assert.deepEqual(result.rows,[row(1,'Player 1',{hits:6,assists:1,stalemates:1}),row(2,'Player 2',{defends:1})]);
  assert.deepEqual(result.totals,{hits:6,losses:0,assists:1,stalemates:1,defends:1});
  assert.equal(result.excluded,8); assert.equal(result.unknownResults,1);
});
test('hidden ranked-war attacker needs explicit evidence and never overrides third faction', () => {
  const result = domain.aggregate([attack(1,'Hospitalized',null,player(2,10),150,{is_ranked_war:true}),
    attack(2,'Lost',null,player(2,10),150,{is_ranked_war:true}),
    attack(3,'Hospitalized',null,player(2,10),150,{is_stealthed:true}),
    attack(4,'Hospitalized',player(9,30),player(2,10),150,{is_ranked_war:true}),
    attack(5,'Hospitalized',null,player(2,10),99,{is_ranked_war:true}),
    attack(6,'Hospitalized',player(9,20),player(2,10),150,{is_stealthed:true})],scope);
  assert.deepEqual(result.rows,[row(2,'Player 2',{losses:2,defends:1})]);
  assert.equal(result.unattributed,1); assert.equal(result.excluded,3);
});
test('streaming pages deduplicate IDs and return independent stable snapshots', () => {
  const agg = domain.createAggregator(scope);
  const item=attack(1,'Attacked',player(4,10),player(9,20));
  agg.add([item,item]);
  const first=agg.snapshot(); first.rows[0].hits=99; first.totals.hits=99;
  item.attacker.name='changed raw record';
  agg.add([item,attack(2,'Attacked',player(2,10),player(9,20))]);
  assert.deepEqual(agg.snapshot(),{rows:[row(2,'Player 2',{hits:1}),row(4,'Player 4',{hits:1})],
    totals:{...zero,hits:2},excluded:0,unattributed:0,unknownResults:0});
  assert.throws(()=>domain.aggregate([], {...scope,opponentId:10}));
  assert.throws(()=>domain.aggregate([], {...scope,start:201}));
  assert.throws(()=>domain.aggregate([attack(undefined,'Attacked')],scope));
});
test('fixed payout rates preserve shortfall and deterministic ordering without mutation', () => {
  const rows = [row(3,'Three',{hits:2}),row(2,'Two',{hits:1,losses:2,assists:1,stalemates:1,defends:1}),row(1,'One',{hits:2})];
  const result = domain.calculate({profit:100,cutMode:'fixed',cutValue:10,
    rates:{hits:30,losses:10,assists:5,stalemates:2,defends:3}},rows);
  assert.equal(result.profit,100);assert.equal(result.cut,10);assert.equal(result.pool,90);
  assert.equal(result.total,180);assert.equal(result.leftover,-90);
  assert.deepEqual(result.rows.map(r=>[r.id,r.payout]),[[1,60],[2,60],[3,60]]);
  assert.equal(rows[0].payout,undefined);
});
test('amount mode applies the fixed faction cut used by the UI', () => {
  assert.deepEqual(domain.calculate({profit:100,cutMode:'amount',cutValue:25},[]),
    {profit:100,cut:25,pool:75,total:0,leftover:75,rows:[],rates:zero});
});
test('percent cut rounds once and safe integer precision survives upper bound', () => {
  assert.equal(domain.calculate({profit:101,cutMode:'percent',cutValue:50},[]).cut,51);
  assert.equal(domain.calculate({profit:5,cutMode:'percent',cutValue:10},[]).cut,1);
  assert.equal(domain.calculate({profit:Number.MAX_SAFE_INTEGER,cutMode:'percent',cutValue:100},[]).cut,Number.MAX_SAFE_INTEGER);
  assert.equal(domain.calculate({profit:Number.MAX_SAFE_INTEGER,cutMode:'percent',cutValue:50},[]).cut,4503599627370496);
  assert.deepEqual(domain.calculate({profit:0},[]).rates,zero);
});
test('rejects invalid amounts counts cut modes and overflowing payout totals', () => {
  for (const bad of [-1,1.5,NaN,Infinity,'10',null,Number.MAX_SAFE_INTEGER+1]) {
    assert.throws(()=>domain.calculate({profit:bad},[]));
    assert.throws(()=>domain.calculate({profit:10,rates:{hits:bad}},[]));
    assert.throws(()=>domain.calculate({profit:10},[row(1,'One',{hits:bad})]));
  }
  assert.throws(()=>domain.calculate({profit:10,cutValue:11},[]));
  assert.throws(()=>domain.calculate({profit:10,cutMode:'other'},[]));
  assert.throws(()=>domain.calculate({profit:10,cutMode:'percent',cutValue:100.01},[]));
  assert.throws(()=>domain.calculate({profit:10,cutMode:'percent',cutValue:-0.1},[]));
  assert.throws(()=>domain.calculate({profit:10,rates:{hits:Number.MAX_SAFE_INTEGER}},[row(1,'One',{hits:2})]));
  assert.throws(()=>domain.calculate({profit:10,rates:{hits:Number.MAX_SAFE_INTEGER}},[row(1,'One',{hits:1}),row(2,'Two',{hits:1})]));
});
test('cache estimates match both approved examples and reserve optional payouts', () => {
  assert.deepEqual(domain.estimate({cacheTotal:100000000,cutMode:'percent',cutValue:20},{hits:400}),
    {profit:100000000,cut:20000000,pool:80000000,reserved:0,rate:200000,remainder:0,shortfall:0});
  assert.deepEqual(domain.estimate({cacheTotal:100000000,cutMode:'percent',cutValue:20,rates:{losses:1000000}},{hits:400,losses:5}),
    {profit:100000000,cut:20000000,pool:80000000,reserved:5000000,rate:187500,remainder:0,shortfall:0});
  assert.deepEqual(domain.estimate({caches:[{quantity:2,price:40},{quantity:3,price:10}],cutValue:10,
    rates:{losses:2,assists:3,stalemates:4,defends:5}}, {hits:6,losses:1,assists:2,stalemates:1,defends:1}),
    {profit:110,cut:10,pool:100,reserved:17,rate:13,remainder:5,shortfall:0});
});
test('estimate distinguishes zero hits missing enabled counts and reserved shortfall', () => {
  assert.deepEqual(domain.estimate({cacheTotal:100},{hits:0}),
    {profit:100,cut:0,pool:100,reserved:0,rate:null,remainder:100,shortfall:0});
  assert.deepEqual(domain.estimate({cacheTotal:10,rates:{losses:6}},{hits:2,losses:3}),
    {profit:10,cut:0,pool:10,reserved:18,rate:null,remainder:0,shortfall:8});
  assert.equal(domain.estimate({cacheTotal:10,rates:{losses:5}},{hits:2,losses:2}).rate,0);
  assert.throws(()=>domain.estimate({cacheTotal:10},{}));
  for(const key of ['losses','assists','stalemates','defends']) assert.throws(()=>domain.estimate({cacheTotal:10,rates:{[key]:1}},{hits:1}));
  assert.throws(()=>domain.estimate({cacheTotal:10},{hits:-1}));
  assert.throws(()=>domain.estimate({caches:[{quantity:0.5,price:10}]},{hits:1}));
  assert.throws(()=>domain.estimate({caches:[{quantity:1,price:0.5}]},{hits:1}));
  assert.throws(()=>domain.estimate({caches:[{quantity:2,price:Number.MAX_SAFE_INTEGER}]},{hits:1}));
  assert.throws(()=>domain.estimate({caches:[{quantity:1,price:Number.MAX_SAFE_INTEGER},{quantity:1,price:1}]},{hits:1}));
  assert.throws(()=>domain.estimate({}, {hits:1}));
});
test('CSV carries provenance and literal safe member cells without credentials', () => {
  const result = domain.calculate({profit:100,rates:{hits:2}},[row(1,'=SUM(1,2)\n"Quoted"',{hits:3})]);
  const csv = domain.csv(result,{scope,mode:'rough estimate',input:{countsSource:'expected',cachePriceAssumption:'manual',
    caches:[{quantity:2,price:50}],apiKey:'must-not-export',nested:{password:['synthetic', 'fixture'].join('-')}},
    authorization:'must-not-export',requestUrl:'https://example.invalid/?key=must-not-export'});
  assert.ok(csv.includes('scope.warId,7'));assert.ok(csv.includes('input.countsSource,expected'));
  assert.ok(csv.includes('input.caches.0.quantity,2'));assert.ok(csv.includes('profit,100'));
  assert.ok(csv.includes('id,name,hits,losses,assists,stalemates,defends,payout'));
  assert.ok(csv.includes('"\'=SUM(1,2)\n""Quoted"""'));
  assert.ok(!csv.includes('must-not-export'));
  for(const name of ['+cmd','-cmd','@cmd','\t=cmd',' \r=cmd']) {
    const data=domain.calculate({profit:0},[row(1,name)]);
    assert.ok(domain.csv(data,{}).includes(`'${name}`));
  }
});
console.log(`war-payout-domain: ${passed} tests passed`);


