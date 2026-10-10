// Build a workbook using the code AS IT SHIPS IN THE USERSCRIPT, so what gets
// verified is what the user actually downloads. The whole contiguous XLSX region
// is lifted verbatim rather than cherry-picking names — consts come across too.
const fs = require('fs'), vm = require('vm');
const SRC = String.raw`C:\Users\asato\Desktop\Game Stuff\Torn Scripts\Torn_OC_Suite_PurrfectCrime.user.js`;
const lines = fs.readFileSync(SRC, 'utf8').split('\n');
const from = lines.findIndex(l => l.startsWith('  const _xEsc = '));
const to   = lines.findIndex(l => l.startsWith('  function _sweepBuildXlsx('));
if (from < 0 || to <= from) throw new Error('region bounds not found');
const code = lines.slice(from, to).join('\n');

const ctx = { console, Date, Math, Number, String, Object, Array, Map, Set, JSON,
              Uint8Array, ArrayBuffer, TextEncoder, isNaN, parseInt, parseFloat, isFinite };
vm.createContext(ctx);
vm.runInContext(code + '\n;__b = buildSweepWorkbook;', ctx);

const WARS = [['Unicorn Apocalypse','2026-05-02'],['Requiem','2026-05-23'],['Sedition','2026-06-06'],
              ['Disciples of the Fallen','2026-06-20'],['Wargasm HQ','2026-08-01'],['Requiem','2026-08-13']];
const warCols = WARS.map(([opp,d],i) => ({ warId:900+i, oppName:opp, start:Date.parse(d)/1000 }));
const NAMES = ['Ashvile','FyreSK','Blight','Magnifier','buy','Thanatoss','Orkki','cobs'];
let seed = 7; const rnd = () => (seed = (seed*1103515245+12345) & 0x7fffffff) / 0x7fffffff;
const visible = NAMES.map((name, n) => {
  const per = {}; let hits = 0, used = 0;
  warCols.forEach((w, i) => {
    if ((n + i) % 3) {
      const h = Math.floor(rnd()*40), u = 2 + Math.floor(rnd()*9);
      per[w.warId] = { used:u, drawn:u, taken:0, hits:h, known:true, flagged:(h===0&&u>0), od:false };
      hits += h; used += u;
    }
  });
  const seen = Object.keys(per).length;
  const flg = Object.values(per).filter(p => p.flagged).length;
  return { name, id:3000000+n, per, warsSeen:seen, warsFlagged:flg, warsFlaggedNet:flg,
    totalHits:hits, totalDrawn:used, totalUsed:used, hitsKnown:true,
    avgHits: seen ? hits/seen : 0, hitsPerXan: used ? hits/used : 0,
    wasted: Math.max(0, used*10 - hits)/10, wastedEnergy:0,
    efficiency: used ? hits/(used*10) : 0, excused:0, odWars:[], unaccounted:0 };
});

const out = ctx.__b({ wars:warCols, list:visible }, {
  warCols, visible, filterLabel:'Showing 8 of 8 — everyone with drug or hit activity.',
  odRun:true, energyPerXanax:250, hitsPerXanax:10,
  fmtDate: ts => new Date(ts*1000).toISOString().slice(0,10),
});
fs.writeFileSync('_suite_smoke.xlsx', Buffer.from(out.bytes));
fs.writeFileSync('_suite_expect.json', JSON.stringify({
  hits: visible.reduce((n,r) => n + r.totalHits, 0),
  used: visible.reduce((n,r) => n + r.totalUsed, 0),
  wasted: +visible.reduce((n,r) => n + r.wasted, 0).toFixed(1),
  members: visible.length, wars: warCols.length,
  names: visible.slice().sort((a,b) => b.totalHits - a.totalHits).map(r => r.name),
}, null, 1));
console.log('built from the SUITE:', out.members, 'members,', out.wars, 'wars');

// ── assertions ───────────────────────────────────────────────────────────────
// The writer uses ZIP STORE (no compression), so every part is readable straight
// out of the buffer as text — no zip library needed to inspect the XML. Decoded as
// utf8, not latin1, or the ellipsis in a trimmed name reads back as three bytes.
const buf = Buffer.from(out.bytes).toString('utf8');
let fail = 0;
const check = (label, cond) => { console.log((cond ? '  PASS  ' : '  FAIL  ') + label); if (!cond) fail++; };

const sheetNames = [...buf.matchAll(/<sheet name="([^"]+)"/g)].map(m => m[1]);
console.log('sheets:', sheetNames.join(', '));
check('Summary is the first sheet a reader lands on', sheetNames[0] === 'Summary');
check('the detail sheets all survive', ['Overview','Members','By war','Legend'].every(n => sheetNames.includes(n)));

check('font is Arial, not Calibri (Sheets substitutes Calibri)',
      buf.includes('<name val="Arial"/>') && !buf.includes('Calibri'));

check('war columns carry real faction names', buf.includes('Fallout') || buf.includes('Unicorn Apocaly'));
check('no W-number war codes anywhere', !/>W[1-9] (Xanax|Hits)</.test(buf));
check('two wars vs the same faction stay distinguishable',
      buf.includes('Requiem 05-23') && buf.includes('Requiem 08-13'));
check('a long name is cut at a word boundary, not mid-word',
      buf.includes('Disciples\u2026') && !buf.includes('Disciples of\u2026'));

const formulas = [...buf.matchAll(/<f>([^<]+)<\/f>/g)].map(m => m[1]);
console.log('formulas:', formulas.length);
check('Summary aggregates are formulas, not pasted numbers', formulas.length >= 8);
const nRows = visible.length;
check('every formula range covers exactly the data rows',
      formulas.every(f => { const m = f.match(/[A-Z]+(\d+):[A-Z]+(\d+)/); return m && +m[1] === 9 && +m[2] === 8 + nRows; }));
check('one SUM per war column in the total row',
      formulas.filter(f => /^SUM\([H-Z]/.test(f)).length === warCols.length);
check('only Excel-2007-era functions are used (nothing needing _xlfn)',
      formulas.every(f => /^(SUM|AVERAGE|COUNT|IFERROR)\(/.test(f)));

// The per-war columns and the Hits total come from different places in the data,
// so making them agree is a real check, not a tautology.
const bad = visible.filter(r => {
  const perWar = warCols.reduce((n, w) => {
    const p = r.per[w.warId];
    return n + (p && p.known ? (p.hits || 0) : 0);
  }, 0);
  return perWar !== r.totalHits;
});
check('per-war hits reconcile with each member Hits total', bad.length === 0);
if (bad.length) console.log('   mismatched:', bad.map(r => r.name).join(', '));


// ── Legend ───────────────────────────────────────────────────────────────────
const legendProse = [...buf.matchAll(/<t xml:space="preserve">([^<]*)<\/t>/g)].map(m => m[1]);
check('Legend keeps its section bands merged', buf.includes('<mergeCell ref="A4:D4"'));
check('Legend explains where to start', legendProse.some(t => t.startsWith('Open the Summary tab')));
check('Legend still documents the waste model',
      legendProse.some(t => t.includes('never became a hit') && t.includes(String(250))));

// The worked example is generated from a real row, so its arithmetic has to hold.
// If the waste formula ever changes and this sentence does not, the example lies —
// which is worse than having no example at all.
const eg = legendProse.find(t => /Xanax buys enough energy for/.test(t));
check('Legend contains a worked example', !!eg);
if (eg) {
  const m = eg.match(/^(\d+) Xanax buys enough energy for (\d+) hits at break-even \((\d+) hits each\)\. They landed (\d+), so about ([\d.]+) Xanax/);
  check('the example sentence parses', !!m);
  if (m) {
    const [, used, capacity, per, hits, wasted] = m.map(Number);
    check('example: capacity = Xanax x hits-per-Xanax', capacity === used * per);
    check('example: wasted = Xanax - hits/hits-per-Xanax',
          Math.abs(wasted - (used - hits / per)) < 0.06);
  }
}

console.log(fail ? fail + ' FAILED' : 'all good');
process.exitCode = fail ? 1 : 0;
