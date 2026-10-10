const fs = require('fs');
const SRC = fs.readFileSync('C:/Users/asato/Desktop/Game Stuff/Torn Scripts/Torn Gym Planner-3.36.txt', 'utf8');

function ex(name) {
  const m = SRC.match(new RegExp(`\\n    (?:async )?function ${name}\\s*\\(`));
  if (!m) throw new Error('not found: ' + name);
  const st = m.index + 1;
  let i = SRC.indexOf('{', st), d = 0, q = null, esc = false;
  for (let j = i; j < SRC.length; j++) {
    const c = SRC[j];
    if (esc) { esc = false; continue; }
    if (q) {
      if (c === '\\') { esc = true; continue; }
      if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '/' && SRC[j+1] === '/') { j = SRC.indexOf('\n', j); continue; }
    if (c === '{') d++;
    else if (c === '}') { d--; if (!d) return SRC.slice(st, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}

const STAT_KEYS = { strength:"str", speed:"spd", defense:"def", dexterity:"dex" };
const SPECIALIST_REQS = {
  25:{check:s=>(s.defense+s.dexterity)>=(s.strength+s.speed)*1.25},
  26:{check:s=>(s.strength+s.speed)>=(s.defense+s.dexterity)*1.25},
  27:{check:s=>{const r=[s.speed,s.defense,s.dexterity].sort((a,b)=>b-a);return s.strength>=r[0]*1.25;}},
  28:{check:s=>{const r=[s.strength,s.speed,s.dexterity].sort((a,b)=>b-a);return s.defense>=r[0]*1.25;}},
  29:{check:s=>{const r=[s.strength,s.defense,s.dexterity].sort((a,b)=>b-a);return s.speed>=r[0]*1.25;}},
  30:{check:s=>{const r=[s.strength,s.speed,s.defense].sort((a,b)=>b-a);return s.dexterity>=r[0]*1.25;}},
};
const GYM_BY_ID = {25:{name:"Balboas"},26:{name:"Frontline"},27:{name:"Gym 3000"},
                   28:{name:"Mr. Isoyamas"},29:{name:"Total Rebound"},30:{name:"Elites"}};
const COMBO_GYMS = {
  balboas:   { id:25, stat1:"defense",  stat2:"dexterity", sec1:"strength", sec2:"speed" },
  frontline: { id:26, stat1:"strength", stat2:"speed",     sec1:"defense",  sec2:"dexterity" },
};
const SOLO_GYM_FOR = { strength:27, defense:28, speed:29, dexterity:30 };
const BUILD_PATHS = {
  hank_def:{ratio:"Hank",whore:"defense",combo:"frontline"},
  hank_dex:{ratio:"Hank",whore:"dexterity",combo:"frontline"},
  hank_str:{ratio:"Hank",whore:"strength",combo:"balboas"},
  hank_spd:{ratio:"Hank",whore:"speed",combo:"balboas"},
  baldr_str:{ratio:"Baldr",whore:"strength",combo:"frontline"},
  baldr_spd:{ratio:"Baldr",whore:"speed",combo:"frontline"},
  baldr_def:{ratio:"Baldr",whore:"defense",combo:"balboas"},
  baldr_dex:{ratio:"Baldr",whore:"dexterity",combo:"balboas"},
};
const RATIO_MIN = 1.25, RATIO_MAX = 1.5, RATIO_BREAK = 1.6, STAT_SAFE_DISTANCE = 1000000;

const STAT_ABBREV = { strength:"STR", speed:"SPD", defense:"DEF", dexterity:"DEX" };
const STAT_LABELS = { strength:"Strength", speed:"Speed", defense:"Defense", dexterity:"Dexterity" };
const fmt = n => Math.round(n).toLocaleString();
const RATIO_MIN_ = 1.25;

eval(ex('analysePath'));
eval(ex('suggestPath'));
eval(ex("statLimits"));
const fmtK = n => { const v = Math.abs(Math.round(n));
  return v>=1e6 ? (v/1e6).toFixed(1).replace(/\.0$/,"")+"m"
       : v>=1000 ? (v/1000).toFixed(1).replace(/\.0$/,"")+"k" : String(v); };

function verdictOf(L, v) {
  if (L.min != null && v < L.min) return [`${STAT_LABELS[L.key]} is ${fmtK(L.min-v)} below the minimum — train it.`, 'BAD'];
  if (L.max != null && v > L.max) return [`${STAT_LABELS[L.key]} is ${fmtK(v-L.max)} ABOVE the limit — this is what's blocking you.`, 'BAD'];
  if (L.max != null)              return [`${STAT_LABELS[L.key]} is ${fmtK(L.max-v)} below the limit.`, 'ok'];
  return [`${STAT_LABELS[L.key]} is ${fmtK(v-(L.min||0))} above the minimum.`, 'ok'];
}

const F = n => Math.round(n).toLocaleString();
const cases = [
  ["already a correct DEF build", {defense:1250000, strength:900000, speed:880000, dexterity:20}],
  ["perfectly balanced, no path", {defense:500000,  strength:500000, speed:500000, dexterity:500000}],
  ["DEF overshot the ceiling",    {defense:3000000, strength:900000, speed:880000, dexterity:20}],
  ["DEF just short of floor",     {defense:1050000, strength:900000, speed:880000, dexterity:20}],
  ["a STR-leaning player",        {strength:1400000,speed:900000,    defense:950000, dexterity:30}],
];
for (const [label, s] of cases) {
  const sug = suggestPath(s);
  const A   = analysePath(sug.key, s);
  console.log(`\n--- ${label} ---`);
  console.log(`  suggests: whore ${A.P.whore} / forget ${A.P.forget}   (gyms already open: ${sug.open})`);
  console.log(`  ratio ${A.ratio.toFixed(2)}x  inBand=${A.inBand}`);
  console.log(`  ${GYM_BY_ID[A.P.solo].name}: ${A.soloOk?'OPEN':'shut'}    ${GYM_BY_ID[A.P.pair].name}: ${A.pairOk?'OPEN':'shut'}`);
  console.log(`  feasible=${A.feasible}  hold ${STAT_KEYS[A.P.whore].toUpperCase()} between ${F(A.needWhore)} and ${F(A.maxWhore)}  (currently ${F(s[A.P.whore])})`);
  console.log('  per-stat lines the user will actually read:');
  for (const L of (statLimits(sug.key, s)||{rows:[]}).rows) {
    const txt = L.verdict;
    const bounds = (L.min!=null?`min ${F(L.min)}`:'') + (L.min!=null&&L.max!=null?' / ':'') + (L.max!=null?`max ${F(L.max)}`:'');
    console.log(`    ${L.ok?'✓':'✗'} [${L.role.padEnd(13)}] ${txt}`);
    console.log(`        (${bounds})`);
  }
}
