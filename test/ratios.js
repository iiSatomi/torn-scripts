// Does our statLimits reproduce RGiskard's script, and specifically the numbers
// visible in the user's screenshot?
//   Build: "Dexterity combo specialist (Baldr's Ratio)"
//   SPD 100,698 -> "Speed is 145.1k below the limit."
//   DEX 345,070 -> "Dexterity is 156.4k above the limit."
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
    if (q) { if (c === '\\') { esc = true; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '/' && SRC[j+1] === '/') { j = SRC.indexOf('\n', j); continue; }
    if (c === '{') d++; else if (c === '}') { d--; if (!d) return SRC.slice(st, j + 1); }
  }
}
const STAT_KEYS   = { strength:"str", speed:"spd", defense:"def", dexterity:"dex" };
const STAT_ABBREV = { strength:"STR", speed:"SPD", defense:"DEF", dexterity:"DEX" };
const STAT_LABELS = { strength:"Strength", speed:"Speed", defense:"Defense", dexterity:"Dexterity" };
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
  combo_bal:{ratio:"Combo",whore:null,combo:"balboas"},
  combo_fro:{ratio:"Combo",whore:null,combo:"frontline"},
};
const RATIO_MIN = 1.25, STAT_SAFE_DISTANCE = 1000000;
const fmt = n => Math.round(n).toLocaleString();
eval(ex('statLimits'));

const fmtK = n => { const v = Math.abs(Math.round(n));
  return v>=1e6 ? (v/1e6).toFixed(1).replace(/\.0$/,"")+"m"
       : v>=1000 ? (v/1000).toFixed(1).replace(/\.0$/,"")+"k" : String(v); };

// Solved from the screenshot: DEX 156.4k above its floor => floor 188,670
// => highest other stat = 150,936. And SPD's 145.1k combo headroom pins DEF.
const stats = { strength:150936, speed:100698, defense:150848, dexterity:345070 };
console.log('=== Screenshot reproduction: Dexterity combo (Baldr\'s) ===');
console.log('stats:', JSON.stringify(stats), '\n');
const R = statLimits('baldr_dex', stats);
for (const r of R.rows) {
  
  console.log(`  ${STAT_ABBREV[r.key]} ${String(stats[r.key]).padStart(7)}  [${r.role.padEnd(14)}] ` +
    r.verdict.padEnd(44) + (r.ok ? 'ok' : 'BREACH'));
}
console.log('\n  EXPECTED from screenshot: Speed 145.1k below, Dexterity 156.4k above');

console.log('\n=== Hank\'s vs Baldr\'s on the same stats (a DEF-lead build) ===');
const s2 = { defense:1250000, strength:900000, speed:880000, dexterity:20 };
for (const key of ['hank_def','baldr_def']) {
  const r = statLimits(key, s2);
  console.log(`\n  ${key}: ${r.soloGym?.name} + ${r.comboGym?.name}  solo=${r.soloOk?'OPEN':'shut'} combo=${r.comboOk?'OPEN':'shut'}`);
  for (const x of r.rows)
    console.log(`    ${STAT_ABBREV[x.key]} [${x.role.padEnd(14)}] headroom ${fmtK(x.headroom)}${x.headroom<0?' OVER':''} ${x.ok?'':' <-- BREACH'}`);
}
