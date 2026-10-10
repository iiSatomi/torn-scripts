// Pull the real builders out of the userscript and run them against a synthetic
// sweep shaped like the live one (8 wars, sparse participation).
const fs = require('fs');
const SRC = String.raw`C:\Users\asato\Desktop\Game Stuff\Torn Scripts\Torn_OC_Suite_PurrfectCrime.user.js`;
const src = fs.readFileSync(SRC, 'utf8');

function grab(name) {
  const start = src.indexOf('  function ' + name + '(');
  if (start < 0) throw new Error('not found: ' + name);
  // walk braces to the matching close
  let i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) break; }
  }
  return src.slice(start, i + 1);
}

const code = [
  grab('warShortNames'), grab('_sweepWarCodes'), grab('_sweepMetaLines'),
  grab('_sweepBuildCsv'),
].join('\n');

// ── stubs matching the real helpers
const _ENERGY_PER_XANAX = 250, _HITS_PER_XANAX = 10;
const _csvCell = s => { s = String(s == null ? '' : s); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const _sweepWarCols = s => s.wars.slice().sort((a, b) => (a.start || 0) - (b.start || 0));
const _sweepVisible = s => s.list;
const _sweepFilterLabel = (shown, total) => `Showing ${shown} of ${total} — everyone with drug or hit activity.`;
const _warState = { sweepOd: null };

// ── synthetic sweep: 8 wars, 4 members, deliberately sparse (like the real export)
const wars = [];
for (let i = 0; i < 8; i++) {
  wars.push({ warId: 'w' + i, start: Math.floor(Date.parse('2026-0' + ((i % 8) + 1) + '-02T00:00:00Z') / 1000), oppName: 'Opponent ' + (i + 1) });
}
const mk = (name, id, per) => ({
  name, id, per, warsFlaggedNet: 1, warsFlagged: 1, warsSeen: Object.keys(per).length,
  totalDrawn: 25, totalHits: 73, hitsKnown: true, avgHits: 12.2, hitsPerXan: 2.92,
  totalUsed: 25, unaccounted: 0, wasted: 17.7, efficiency: 0.29, excused: 0, odWars: [],
});
const list = [
  mk('Ashvile', 3925042, { w0: { used: 6, taken: 0, known: true, hits: 4, flagged: false, od: false } }),
  mk('schtofanos', 2795017, { w1: { used: 1, taken: 2, known: true, hits: 0, flagged: true, od: false } }),
  mk('Name, With Comma', 111, { w0: { used: 3, taken: 0, known: false, hits: 0, flagged: false, od: true } }),
  mk('buy', 2390564, { w2: { used: 45, taken: 0, known: true, hits: 9, flagged: false, od: false } }),
];
const sweep = { wars, list };

const ctx = { _csvCell, _sweepWarCols, _sweepVisible, _sweepFilterLabel, _warState, _ENERGY_PER_XANAX, _HITS_PER_XANAX };
ctx._warState.sweep = sweep;
const fn = new Function(...Object.keys(ctx), code + '\n; return { wide:_sweepBuildCsv() };');
const out = fn(...Object.values(ctx));

function check(label, cond) { console.log((cond ? '  PASS  ' : '  FAIL  ') + label); if (!cond) process.exitCode = 1; }

const wide = out.wide.text.split('\r\n');

console.log('=== WIDE ===');
console.log(wide.slice(0, 3).map(l => '  ' + l.slice(0, 150)).join('\n'));
check('header is row 1 (starts with Member)', wide[0].startsWith('Member,ID,'));
check('war columns are named after the opponent, not W1', /Opponent 1 Xan,Opponent 1 Hits/.test(wide[0]));
check('no W-number codes survive anywhere', !/W[1-9] (Xan|Hits)/.test(wide[0]));
check('war labels stay short enough to read', wide[0].split(',').every(h => h.length <= 24));
check('no 45-char war labels in header', !/Opponent 1 XanaxSwallowed/.test(wide[0]));
check('metadata moved below the data', wide.some(l => l.startsWith('# OC Suite')));
check('war key legend present', wide.some(l => /^# Opponent 1,/.test(l)));
