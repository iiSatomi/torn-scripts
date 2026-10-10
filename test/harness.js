// Pulls the REAL function bodies out of the userscript and runs them against
// mock players, so we're testing shipped code rather than a copy of it.
const fs = require('fs');
const SRC = fs.readFileSync('C:/Users/asato/Desktop/Game Stuff/Torn Scripts/Torn Gym Planner-3.36.txt', 'utf8');

// Brace-match a top-level `    function NAME(` out of the IIFE body.
function extractFn(name) {
  const re = new RegExp(`\\n    (?:async )?function ${name}\\s*\\(`);
  const m = SRC.match(re);
  if (!m) throw new Error('function not found: ' + name);
  const start = m.index + 1;
  let i = SRC.indexOf('{', start), depth = 0, inS = null, esc = false;
  for (let j = i; j < SRC.length; j++) {
    const ch = SRC[j], prev = SRC[j-1];
    if (esc) { esc = false; continue; }
    if (inS) {
      if (ch === '\\') { esc = true; continue; }
      if (ch === inS) inS = null;
      if (inS === '`' && ch === '$' && SRC[j+1] === '{') { /* naive: templates here have no braces issues */ }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inS = ch; continue; }
    if (ch === '/' && SRC[j+1] === '/') { j = SRC.indexOf('\n', j); continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return SRC.slice(start, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}

const FNS = ['pickCandy','calcGain','happyDecay','simulateBlock','boosterFit','simDailyRegen','simDrugDay','simJump','edvdTradeoff',
             'buildTiers','tierCost','evalTiers','recommend','estimateIncome','invQty','priceOf',
             'cheapestBy','nwHistory'];
const code = FNS.map(extractFn).join('\n\n');

// ── Mock environment ─────────────────────────────────────────────────────────
const STAT_CONSTS = {
  strength:{A:1600,B:1700,C:700}, speed:{A:1600,B:2000,C:1350},
  dexterity:{A:1800,B:1500,C:1000}, defense:{A:2100,B:-600,C:1500},
};
const STAT_KEYS = { strength:"str", speed:"spd", defense:"def", dexterity:"dex" };
const NATURAL_E={no:20,yes:30}, E_CAP={no:100,yes:150};
const XAN_CD_AVG=7, XAN_CD_MIN=6, EDVD_CD=6, EDVD_HAPPY=2500;
const FHC_HAPPY=500, FHC_CD=6, CANDY_CD_HRS=0.5, FORMULA_CORRECTION=1.1472;
const ITEM_IDS={xanax:206,edvd:540,ecstasy:203,fhc:367,lsd:415};
const REFILL_POINTS=30;
const CANDY_TYPES=[
  {label:"Bag of Candy Kisses",happy:50,name:"Bag of Candy Kisses",id:616},
  {label:"Jawbreaker",happy:150,name:"Jawbreaker",id:617},
  {label:"Pixie Sticks",happy:150,name:"Pixie Sticks",id:618},{label:"Bag of Bloody Eyeballs",happy:75,name:"Bag of Bloody Eyeballs",id:null},{label:"Bag of Tootsie Rolls",happy:75,name:"Bag of Tootsie Rolls",id:null},{label:"Bag of Chocolate Truffles",happy:100,name:"Bag of Chocolate Truffles",id:null},{label:"Bag of Sherbet",happy:150,name:"Bag of Sherbet",id:null},{label:"Birthday Cupcake",happy:250,name:"Birthday Cupcake",id:null},
  {label:"Big Box of Chocolates",happy:35,name:"Big Box of Chocolate Bars",id:207},
  {label:"Box of Chocolates",happy:25,name:"Box of Chocolate Bars",id:208},
  {label:"Lollipop",happy:25,name:"Lollipop",id:621},
  {label:"Bag of Bon Bons",happy:25,name:"Bag of Bon Bons",id:619},
  {label:"Box of Mints",happy:25,name:"Box of Extra Strong Mints",id:620},
];
const CAN_TYPES=[{label:"Taurine Elite",name:"Can of Taurine Elite",e:30,id:967,cd:2}];

// REAL prices, back-computed from the user's own live price panel ($/happy x happy)
let candyPrices={
  "Box of Mints":699,"Bag of Bon Bons":694,"Box of Chocolates":640,"Lollipop":699,"Bag of Bloody Eyeballs":49000,"Bag of Tootsie Rolls":53723,"Bag of Chocolate Truffles":94900,"Bag of Sherbet":291032,"Birthday Cupcake":2544995,
  "Bag of Candy Kisses":59000, "Big Box of Chocolates":57015,
  "Pixie Sticks":321000, "Jawbreaker":325000,
};
let canPrices={"Taurine Elite":3750000};
let allItemPrices={xanax:835595,edvd:4311520,ecstasy:37565,fhc:13374499,lsd:22023};

// DOM stubs — only the fields the extracted code reads
let FIELDS = {};
const mk = v => ({ value:String(v) });
function setFields(o){ FIELDS = {}; for (const k in o) FIELDS[k]=mk(o[k]); }
const el = new Proxy({}, { get:(_,k)=> FIELDS[k] });
const gf = e => parseFloat(e?.value)||0;
const gi = e => parseInt(e?.value)||0;
const fmt = n => Math.round(n).toLocaleString();
const getPerk = e => (parseFloat(e?.value)||0)/100;
let NW_HISTORY = [];
const _load = (k,d) => k==='nwHistory_v1' ? JSON.stringify(NW_HISTORY) : d;
const _save = () => {};
const ASSESS_NW_TTL = 90*86400000;
const ASSESS_NW_KEY = 'nwHistory_v1';
const fmtDur = s => s<=0?"ready":`${Math.round(s/60)}m`;
const fmtD = (n,d=2) => n.toFixed(d);
function xanaxCooldownHours(count) {
  const doses = Math.max(0, Math.floor(Number(count) || 0));
  return doses >= 4 ? doses * XAN_CD_MIN : doses * XAN_CD_AVG;
}
function jumpCycleHours(drugCD, boosterCD, useRefill) {
  const drug = Math.max(0, Number(drugCD) || 0);
  const booster = Math.max(0, Number(boosterCD) || 0);
  return Math.max(1, drug, booster, useRefill ? 24 : 0);
}

eval(code);

// ── Scenarios ────────────────────────────────────────────────────────────────
const baseCtx = (over={}) => ({
  gym:{id:24,name:"George's",energy:10}, stat:"strength", dots:7.3, statLabel:"Strength",
  ePerTrain:10, consts:STAT_CONSTS.strength, propHappy:5025, statNow:250000, statGoal:1000000,
  bonus:1.30, cap:150, natE:30, anJob:false, voracity:0, candyMult:1, canFacPerk:0, ...over,
});
const basePlayer = (over={}) => ({
  limited:false, hasMoney:true, hasInv:true, onhand:50e6, vault:0, bank:0, bankLeft:0,
  points:100, networth:500e6, inv:{}, invName:{}, invMarket:{}, rentWeekly:0,
  cdDrug:0, cdBooster:0, refillUsed:false, ageDays:365, xanTaken:0, extTaken:0, overdosed:0, ...over,
});

function run(label, ctx, p, fields, income) {
  setFields(fields);
  const evals = evalTiers(ctx, p);
  const rec = recommend(evals, p, income);
  console.log('\n=== ' + label + ' ===');
  console.log(`budget/wk $${Math.round(rec.sustainableWeekly).toLocaleString()}  cash $${Math.round(rec.cashNow).toLocaleString()}`);
  for (const e of evals) {
    const flag = e===rec.primary?'<<PICK':e===rec.bestValue?'  value':e.readyNow?'  stock':'';
    console.log(
      `  ${e.t.name.padEnd(30)} +${Math.round(e.weeklyGain).toString().padStart(9)}/wk` +
      ` $${Math.round(e.weeklyCost).toLocaleString().padStart(13)}/wk` +
      ` gap $${Math.round(e.cost.gap).toLocaleString().padStart(11)}` +
      ` ${isFinite(e.perMillion)?Math.round(e.perMillion).toString().padStart(6):'   inf'}/\$m ${flag}` +
      (e.sim.boosterOverflow?' [CD OVERFLOW]':'')
    );
  }
  console.log(`  -> PICK: ${rec.primary.t.name} | dream: ${rec.dream.t.name} | ready: ${rec.readyNow?rec.readyNow.t.name:'none'}`);
  if (rec.primary.blockers?.length) console.log(`  -> blockers: ${rec.primary.blockers.join(' · ')}`);
  return {evals, rec};
}

const F = { assessIncome:0, assessReserve:5000000, assessSpendPct:70,
            hjXanaxCost:880000, hjEDVDCost:2500000, hjEcstasyCost:100000, hjFHCCost:12000000,
            dailyRefillCost:1725000, factionPerk:0, propertyPerk:0, eduStatPerk:0, eduGenPerk:0, jobPerk:0 };

// 1. Broke newbie: $2m, tiny income
run('BROKE — $2m cash, $5m/wk income', baseCtx({statNow:15000,dots:4.0,propHappy:3025,bonus:1.0,cap:100,natE:20}),
    basePlayer({onhand:2e6, networth:20e6, points:0}), F, {weekly:5e6, conf:'medium'});

// 2. Mid player: $80m, $150m/wk
run('MID — $80m cash, $150m/wk income', baseCtx(),
    basePlayer({onhand:80e6}), F, {weekly:150e6, conf:'high'});

// 3. Rich: $3b, $2b/wk
run('RICH — $3b cash, $2b/wk income', baseCtx({voracity:6}),
    basePlayer({onhand:3e9, networth:20e9}), F, {weekly:2e9, conf:'high'});

// 4. Mid player who already OWNS a jump's worth of stock
run('STOCKED — $10m cash but full jump in inventory', baseCtx(),
    basePlayer({onhand:10e6, inv:{206:12, 540:8, 203:4, 616:60}}), F, {weekly:150e6, conf:'high'});

// 5. On cooldown
run('ON COOLDOWN — drug CD active', baseCtx(),
    basePlayer({onhand:500e6, cdDrug:14400, cdBooster:7200, refillUsed:true, inv:{206:12,540:8,203:4,616:60}}),
    F, {weekly:400e6, conf:'high'});

// 6. No income signal at all
run('NO INCOME DATA — falls back to cash/4', baseCtx(),
    basePlayer({onhand:120e6}), F, {weekly:null, conf:'none'});

// ── boosterFit against the two known-good data points ───────────────────────
console.log('\n=== boosterFit sanity (published values) ===');
const chk = (got, want, what) => console.log(`  ${got===want?'PASS':'FAIL'}  ${what}: got ${got}, guides say ${want}`);
chk(boosterFit(24, 6),   5, '24h cap / eDVD  -> standard jump');
chk(boosterFit(48, 6),   9, '48h cap / eDVD  -> full Voracity max');
chk(boosterFit(24, 0.5),49, '24h cap / candy -> "49 lollipops"');
console.log(`  9 eDVD x 2500 happy = ${9*2500} (guides say 22,500)`);

// ── eDVD trade-off: the "I own 3 eDVDs" question ────────────────────────────
console.log('\n=== eDVD TRADE-OFF — player owns 3 eDVDs ===');
setFields(F);
{
  const c = baseCtx(), p = basePlayer({ inv:{540:3, 206:20, 203:5, 620:200} });
  const tr = edvdTradeoff(c, p);
  console.log(`  owns ${tr.owned} eDVD, cap ${tr.cdCap}h allows ${tr.maxEdvd}`);
  for (const r of tr.rows)
    console.log(`   ${String(r.e).padStart(2)} eDVD + ${String(r.candies).padStart(2)} candy` +
      ` happy ${String(Math.round(r.sim.happy)).padStart(6)}` +
      ` cycle ${r.sim.cycleH.toFixed(1)}h` +
      ` gain/wk +${Math.round(r.weeklyGain).toString().padStart(7)}` +
      ` buy ${r.buy}x $${Math.round(r.cost.gap).toLocaleString()}`);
}

// ── Voracity: does a moving cap actually move the ceiling? ──────────────────
console.log('\n=== VORACITY — dynamic booster cap ===');
for (const vor of [0, 6, 12, 24]) {
  setFields({ ...F, hjVoracity: vor });
  const c = baseCtx({ voracity: vor });
  const tr = edvdTradeoff(c, basePlayer({ inv:{} }));
  const top  = tr.rows[tr.rows.length-1];
  const peak = tr.rows.reduce((a,b)=> b.weeklyGain > a.weeklyGain ? b : a, tr.rows[0]);
  console.log(`  Voracity ${String(vor).padStart(2)}h -> cap ${String(tr.cdCap).padStart(2)}h, max ${tr.maxEdvd} eDVD` +
    ` | biggest stack: ${top.e} eDVD, ${Math.round(top.sim.cycleH)}h cycle, +${Math.round(top.weeklyGain).toLocaleString()}/wk` +
    ` | BEST/wk: ${peak.e} eDVD +${peak.candies} candy, ${Math.round(peak.sim.cycleH)}h cycle, +${Math.round(peak.weeklyGain).toLocaleString()}/wk`);
}
// Perk-string parsing: would we actually recognise it?
console.log('\n=== Voracity perk-string matching (tolerant regex) ===');
const parseVor = list => {
  let v = null;
  for (const s of list) {
    const t = String(s).toLowerCase();
    if (!t.includes('booster') || !t.includes('cooldown')) continue;
    const m = t.match(/(\d+(?:\.\d+)?)\s*(?:hour|hr)/);
    if (m && (v == null || +m[1] > v)) v = +m[1];
  }
  return v;
};
for (const s of ['Increases maximum booster cooldown by 6 hours',
                 '+ 6 hours maximum booster cooldown',
                 '6x booster cooldown',            // no "hour" -> expect null
                 'Increases gym gains by 10%',      // unrelated -> null
                 'Voracity: + 12 hrs max booster cooldown'])
  console.log(`  ${parseVor([s]) === null ? 'no match' : parseVor([s]) + 'h'}  <- "${s}"`);

// ── Income estimator ─────────────────────────────────────────────────────────
console.log('\n=== INCOME ESTIMATOR ===');
setFields({assessIncome:0});
NW_HISTORY = [];
console.log('no history, 365d old, $500m nw ->', JSON.stringify(estimateIncome(basePlayer())));
NW_HISTORY = [{t:Date.now()-10*86400000, v:400e6},{t:Date.now(), v:500e6}];
console.log('10d history +$100m       ->', JSON.stringify(estimateIncome(basePlayer())));
setFields({assessIncome:77000000});
console.log('manual override          ->', JSON.stringify(estimateIncome(basePlayer())));
