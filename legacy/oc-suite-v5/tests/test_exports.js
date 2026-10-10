// Exercise every dataset x every format against realistic OC data.
const fs = require('fs');
const src = fs.readFileSync('Torn_OC_Suite.user.js', 'utf8');
const grab = re => { const m = src.match(re); if (!m) throw new Error('missing ' + re); return m[0]; };

global.rawMoney = (v) => Math.round(Number(v) || 0);

// v4.1: buildExportDatasets also reads the war stores directly.
const store = {};
global.GM_getValue = (k, d) => (k in store ? store[k] : d);
global.GM_setValue = (k, v) => { store[k] = v; };
global.GMK = { ATTACK_LEDGER: 'ocs_attack_ledger', WAR_ARCHIVE: 'ocs_war_archive',
               CHAIN_ARCHIVE: 'ocs_chain_archive', ATTACK_CURSOR: 'ocs_attack_cursor',
               MY_FACTION_ID: 'ocs_my_faction_id' };
eval(grab(/function loadAttackLedger\(\) \{[\s\S]*?\n  \}/).replace('function loadAttackLedger', 'loadAttackLedger=function'));
eval(grab(/function loadWarArchive\(\) \{[\s\S]*?\n  \}/).replace('function loadWarArchive', 'loadWarArchive=function'));
eval(grab(/function loadChainArchive\(\) \{[\s\S]*?\n  \}/).replace('function loadChainArchive', 'loadChainArchive=function'));
eval(grab(/function computeWarStats\(led, war\) \{[\s\S]*?\n  \}/).replace('function computeWarStats', 'computeWarStats=function'));
// Small war fixture so the three new datasets produce rows.
store.ocs_my_faction_id = '9000';
store.ocs_war_archive = JSON.stringify({ 55: {
  start: 1751900000, end: 1751990000, target: 3000, winner: 9000,
  factions: [{ id: '9000', name: 'Us', score: 3100, chain: 250 }, { id: '7777', name: 'Them', score: 2100, chain: 100 }],
  report: { factions: [{ id: '9000', name: 'Us', score: 3100, attacks: 400,
    members: [{ id: '1', name: 'iSatomi', level: 40, attacks: 120, score: 900 }] }] },
} });
store.ocs_attack_ledger = JSON.stringify({
  w1: { i: 'w1', ts: 1751950000, a: '1', an: 'iSatomi', d: '501', dn: 'Enemy1', af: '9000', df: '7777',
        dir: 'out', res: 'Hospitalized', rg: 5, rl: 0, st: 0, ch: 3, rw: 1, m: { ff: 2, war: 2, ret: 1, grp: 1, os: 1, cb: 1 } },
  w2: { i: 'w2', ts: 1751960000, a: null, an: null, d: '1', dn: 'iSatomi', af: '7777', df: '9000',
        dir: 'in', res: 'Mugged', rg: 0, rl: 2.5, st: 1, ch: 0, rw: 1, m: { ff: 1, war: 2, ret: 1, grp: 1, os: 1, cb: 1 } },
});
store.ocs_chain_archive = JSON.stringify({ 77: {
  start: 1751940000, end: 1751955000, length: 250, respect: 812,
  report: { chain: 250, respect: 812, attackers: [{ id: '1', attacks: 40, respect: 300, avg: 7.5, best: 21 }], nonAttackers: ['2'] },
} });

eval(grab(/function buildExportDatasets\(ctx\) \{[\s\S]*?\n  \}\n/).replace('function buildExportDatasets', 'buildExportDatasets=function'));
eval(grab(/function exportCSV\(sets, keys\) \{[\s\S]*?\n  \}\n/).replace('function exportCSV', 'exportCSV=function'));
eval(grab(/function exportJSON\(sets, keys\) \{[\s\S]*?\n  \}\n/).replace('function exportJSON', 'exportJSON=function'));
eval(grab(/function exportDiscord\(sets, keys, opts = \{\}\) \{[\s\S]*?\n  \}\n/).replace('function exportDiscord', 'exportDiscord=function'));
eval(grab(/function exportHTML\(sets, keys, meta = \{\}\) \{[\s\S]*?\n  \}\n/).replace('function exportHTML', 'exportHTML=function'));

// Realistic rows modelled on the user's real screenshots (80% splits, big cash, item costs)
const day = 86400;
const now = 1752000000;
const perOc = [
  { name:'Break the Bank', difficulty:7, executedAt: now-1*day, money:313090000, itemValue:0, cost:2500,
    respect:182, paid:true, native:{paid:true, percentage:80}, participants:{'1':'iSatomi','2':'Ashvile','3':'BarbenBOO','4':'ST4TIC','5':'ElKingCharles'} },
  { name:'Bidding War', difficulty:6, executedAt: now-2*day, money:128150000, itemValue:0, cost:156100,
    respect:150, paid:true, native:{paid:true, percentage:90}, participants:{'1':'iSatomi','2':'Ashvile'} },
  { name:'No Reserve', difficulty:5, executedAt: now-3*day, money:0, itemValue:0, cost:443400,
    respect:40, paid:false, native:null, participants:{'3':'BarbenBOO'} },
  { name:'Market Forces', difficulty:3, executedAt: now-9*day, money:8430000, itemValue:0, cost:528,
    respect:60, paid:true, native:{paid:true, percentage:80}, participants:{'2':'Ashvile','4':'ST4TIC'} },
];
const splitOf = r => (r.native?.percentage != null ? r.native.percentage : 100);
const memberCutOf = r => (r.money||0) * splitOf(r)/100;
const factionCutOf = r => (r.money||0) - memberCutOf(r) + (r.itemValue||0) - (r.cost||0);
const bucket = (rows, keyFn) => {
  const out={};
  for (const r of rows) {
    const k = keyFn(new Date(r.executedAt*1000));
    const b = out[k] || (out[k]={key:k,ocs:0,gross:0,toMembers:0,cost:0,kept:0,respect:0,ts:r.executedAt});
    const isPaid = r.native ? r.native.paid : r.paid;
    const g=(r.money||0)+(r.itemValue||0), m=isPaid?memberCutOf(r):0;
    b.ocs++; b.gross+=g; b.toMembers+=m; b.cost+=(r.cost||0); b.kept+=g-m-(r.cost||0); b.respect+=(r.respect||0);
    b.ts=Math.min(b.ts,r.executedAt);
  }
  return Object.values(out).sort((a,b)=>b.ts-a.ts);
};
const wk = d => { const x=new Date(d); x.setUTCDate(x.getUTCDate()-x.getUTCDay()); return 'Wk of '+x.toLocaleDateString('en-GB',{timeZone:'UTC',day:'numeric',month:'short'}); };
const mo = d => d.toLocaleDateString('en-GB',{timeZone:'UTC',month:'short',year:'numeric'});
const weekly = bucket(perOc, wk), monthly = bucket(perOc, mo);

const sets = buildExportDatasets({ perOc, weekly, monthly, memberCutOf, factionCutOf, splitOf });

console.log('=== DATASETS BUILT ===');
for (const [k,s] of Object.entries(sets)) console.log(`  ${k.padEnd(10)} ${String(s.rows.length).padStart(2)} rows | ${s.columns.length} cols | ${s.label}`);

console.log('\n=== THE NUMBER THAT WAS AMBIGUOUS ===');
const btb = sets.ocs.rows.find(r => r[1]==='Break the Bank');
const c = sets.ocs.columns;
const at = n => btb[c.indexOf(n)];
console.log(`  Break the Bank: gross $${(at('Gross')/1e6).toFixed(2)}m at ${at('Split %')}% split`);
console.log(`    -> to members  $${(at('To members')/1e6).toFixed(2)}m  (per member $${(at('Per member')/1e6).toFixed(2)}m x${at('Crew')})`);
console.log(`    -> faction kept $${(at('Faction kept')/1e6).toFixed(2)}m`);
console.log(`  ✓ members + faction + cost == gross:`,
  Math.abs((at('To members') + at('Faction kept') + at('Item cost')) - at('Gross')) < 2);

console.log('\n=== CSV (members) ===');
console.log(exportCSV(sets, ['members']).split('\n').slice(0,4).map(l=>'  '+l).join('\n'));

console.log('\n=== DISCORD (weekly) ===');
const disc = exportDiscord(sets, ['weekly'], { maxRows: 15 });
console.log(disc.split('\n').map(l=>'  '+l).join('\n'));
console.log('  chars:', disc.length, disc.length<=2000 ? '✓ fits Discord' : '✗ too long');

console.log('\n=== DISCORD truncation guard (all datasets) ===');
const big = exportDiscord(sets, Object.keys(sets), { maxRows: 15 });
console.log('  chars:', big.length, '| warns if >1900:', big.length>1900 ? 'yes (UI shows warning)' : 'n/a');

console.log('\n=== HTML ===');
const html = exportHTML(sets, ['weekly','members','scenarios'], {
  faction:'Test Faction', range:'4 tracked OCs',
  kpis:{gross:449670000,toMembers:378, kept:1, respect:432}, weekly });
console.log('  bytes            :', html.length);
console.log('  ✓ standalone      :', !/<script|cdn|https?:\/\/(?!www\.w3)/i.test(html));
console.log('  ✓ has SVG chart   :', html.includes('<svg'));
console.log('  ✓ has KPI tiles   :', html.includes('class="kpi"'));
console.log('  ✓ tables rendered :', (html.match(/<table>/g)||[]).length);
fs.writeFileSync('tests/example_oc_report.html', html);

console.log('\n=== JSON ===');
const j = JSON.parse(exportJSON(sets, ['weekly']));
console.log('  ✓ parses, keys:', Object.keys(j.data));

console.log('\n=== CSV injection safety ===');
const evil = { ...sets.members, rows:[['=cmd|calc!A1','1',1,2,3,4]] };
const out = exportCSV({ x: evil }, ['x']);
console.log('  quoted:', out.split('\n')[1].startsWith('"='), '(quoting prevents Excel auto-exec of bare =)');
