// War payout calculator (v4.3): money parsing, split math (flat + proportional,
// $1k round-down, remainder to faction), and metric-row assembly with official
// report priority + minimum-metric exclusion.
const fs = require('fs');
const src = fs.readFileSync('Torn_OC_Suite.user.js', 'utf8');
const grab = (re, n) => { const m = src.match(re); if (!m) { console.error('MISSING', n); process.exit(1); } return m[0]; };

let pass = 0, fail = 0;
const check = (label, ok, extra) => {
  if (ok) { pass++; console.log(`✓ ${label}`); }
  else    { fail++; console.log(`✗ ${label}${extra !== undefined ? ' — got ' + JSON.stringify(extra) : ''}`); }
};

let store = {};
global.GM_getValue = (k, d) => (k in store ? store[k] : d);
global.GM_setValue = (k, v) => { store[k] = v; };
global.GMK = { MY_FACTION_ID: 'ocs_my_faction_id', ATTACK_LEDGER: 'ocs_attack_ledger' };
global.ocmToast = () => {};

for (const [re, name, decl] of [
  [/function parseMoneyInput\(s\) \{[\s\S]*?\n  \}/, 'parseMoneyInput', 'function parseMoneyInput'],
  [/function computeWarPay\(rows, pot, cfg = \{\}\) \{[\s\S]*?\n  \}/, 'computeWarPay', 'function computeWarPay'],
  [/function warPayRows\(war, base = 'score', minMetric = 0\) \{[\s\S]*?\n  \}/, 'warPayRows', 'function warPayRows'],
  [/function loadAttackLedger\(\) \{[\s\S]*?\n  \}/, 'loadAttackLedger', 'function loadAttackLedger'],
  [/function computeWarStats\(led, war\) \{[\s\S]*?\n  \}/, 'computeWarStats', 'function computeWarStats'],
]) {
  eval(grab(re, name).replace(decl, `${name}=function`));
}

console.log('--- 1. parseMoneyInput ---');
check('"1.5b" → 1.5e9', parseMoneyInput('1.5b') === 1.5e9);
check('"750m" → 7.5e8', parseMoneyInput('750m') === 750e6);
check('"250k" → 250000', parseMoneyInput('250k') === 250000);
check('"$2,000,000" → 2e6', parseMoneyInput('$2,000,000') === 2e6);
check('garbage → 0', parseMoneyInput('lots') === 0 && parseMoneyInput('') === 0 && parseMoneyInput(null) === 0);

console.log('--- 2. computeWarPay: sums, rounding, remainder ---');
{
  const rows = [
    { uid: '1', name: 'A', metric: 900 },
    { uid: '2', name: 'B', metric: 600 },
    { uid: '3', name: 'C', metric: 0 },     // fought below the metric? zero-metric row
  ];
  const pot = 1_000_000_000;
  const r = computeWarPay(rows, pot, { flatPct: 30, roundTo: 1000 });
  check('never distributes more than the pot', r.distributed <= pot, r.distributed);
  check('remainder = pot − distributed', r.remainder === pot - r.distributed, r.remainder);
  check('every payout is a $1k multiple', r.rows.every(x => x.amount % 1000 === 0));
  // flat pool = 300m/3 = 100m each; perf pool 700m split 900:600:0
  check('zero-metric member gets flat share only', r.rows.find(x => x.uid === '3').amount === 100_000_000, r.rows.find(x => x.uid === '3').amount);
  const a = r.rows.find(x => x.uid === '1').amount;
  check('top scorer gets flat + 60% of perf pool', a === 100_000_000 + 420_000_000, a);
  check('shares sum to 1', Math.abs(r.rows.reduce((s, x) => s + x.share, 0) - 1) < 1e-9);
  // degenerate cases
  const z = computeWarPay([], pot, {});
  check('no members → nothing distributed', z.distributed === 0 && z.remainder === pot);
  const allFlat = computeWarPay(rows, pot, { flatPct: 100 });
  check('100% flat splits evenly', new Set(allFlat.rows.map(x => x.amount)).size === 1, allFlat.rows.map(x => x.amount));
  const zeroPot = computeWarPay(rows, 0, { flatPct: 20 });
  check('zero pot → zero payouts', zeroPot.rows.every(x => x.amount === 0));
}

console.log('--- 3. warPayRows: official beats obs, min-metric excludes ---');
{
  store[GMK.MY_FACTION_ID] = '9000';
  const now = Math.floor(Date.now() / 1000);
  // Ledger: Alice(11) has obs respect 9 (two war hits); Carol(13) obs respect 3.
  const mk = (i, ts, aid, an, rg) => [i, { i, ts, a: String(aid), an, d: '501', dn: 'E', af: '9000', df: '7777',
    dir: 'out', res: 'Hospitalized', rg, rl: 0, st: 0, ch: 0, rw: 1, m: { ff: 2, war: 2, ret: 1, grp: 1, os: 1, cb: 1 } }];
  store[GMK.ATTACK_LEDGER] = JSON.stringify(Object.fromEntries([
    mk('x1', now - 5000, 11, 'Alice', 5), mk('x2', now - 4000, 11, 'Alice', 4), mk('x3', now - 3000, 13, 'Carol', 3),
  ]));
  const war = { start: now - 9000, end: now - 1000, factions: [{ id: '9000' }, { id: '7777' }],
    report: { factions: [{ id: '9000', members: [
      { id: '11', name: 'Alice', attacks: 120, score: 900 },
      { id: '12', name: 'Bob', attacks: 80, score: 600 },
    ] }] } };
  const rows = warPayRows(war, 'score', 0);
  check('official score wins for reported members', rows.find(r => r.uid === '11')?.metric === 900, rows);
  check('report-only member included (Bob, no ledger rows)', rows.find(r => r.uid === '12')?.metric === 600);
  check('obs-only member falls back to observed respect', rows.find(r => r.uid === '13')?.metric === 3, rows.find(r => r.uid === '13'));
  const hits = warPayRows(war, 'hits', 0);
  check('hits basis uses official attacks', hits.find(r => r.uid === '11')?.metric === 120);
  check('hits basis obs fallback (Carol warHits=1)', hits.find(r => r.uid === '13')?.metric === 1, hits.find(r => r.uid === '13'));
  const strict = warPayRows(war, 'score', 500);
  check('min-metric drops the small fish entirely', strict.length === 2 && !strict.some(r => r.uid === '13'), strict.map(r => r.uid));
  check('rows sorted by metric desc', rows[0].uid === '11' && rows[1].uid === '12');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
