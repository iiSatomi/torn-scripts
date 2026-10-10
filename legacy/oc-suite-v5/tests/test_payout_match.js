// Locks in the v3.37 payout-accounting audit:
//   1. claims use the PER-OC split (native % / per-level setting), not a flat share
//   2. natively-paid OCs generate NO claims (their money never touched the funds log)
//   3. plain-text gives (no XID) resolve their recipient by exact name
//   4. the giveFunds cursor walks ASCENDING and can no longer jump over a burst
const fs = require('fs');
const src = fs.readFileSync('Torn_OC_Suite.user.js', 'utf8');
const grab = (re, n) => { const m = src.match(re); if (!m) { console.error('MISSING', n); process.exit(1); } return m[0]; };

let pass = 0, fail = 0;
const check = (label, ok, extra) => {
  if (ok) { pass++; console.log(`✓ ${label}`); }
  else    { fail++; console.log(`✗ ${label}${extra !== undefined ? ' — got ' + JSON.stringify(extra) : ''}`); }
};

// ── GM / env shims ──────────────────────────────────────────────────────────
let store = {};
global.GM_getValue = (k, d) => (k in store ? store[k] : d);
global.GM_setValue = (k, v) => { store[k] = v; };
global.GMK = {
  PAYOUT_NEWS_CURSOR: 'ocs_payout_news_cursor',
  PAYOUT_NEWS_STATUS: 'ocs_payout_news_status',
  PAYOUT_EVENTS:      'ocs_payout_events',
};
global.PAYOUT_EVENTS_KEY = 'ocs_payout_events';
global.PAYOUT_MATCH_WINDOW_D = Number(src.match(/const PAYOUT_MATCH_WINDOW_D = (\d+)/)[1]);
global.PAYOUT_MATCH_TOL      = Number(src.match(/const PAYOUT_MATCH_TOL\s*=\s*([\d.]+)/)[1]);

// ── Pull the REAL functions out of the script ───────────────────────────────
eval(grab(/function loadPayoutEvents\(\) \{[\s\S]*?\n  \}/, 'loadPayoutEvents').replace('function loadPayoutEvents', 'loadPayoutEvents=function'));
eval(grab(/function savePayoutEvents\(ev\) \{[\s\S]*?\n  \}/, 'savePayoutEvents').replace('function savePayoutEvents', 'savePayoutEvents=function'));
eval(grab(/function matchPayouts\(ocList[\s\S]*?\n  \}/, 'matchPayouts').replace('function matchPayouts', 'matchPayouts=function'));
eval(grab(/function syncPayoutEvents\(newsData\) \{[\s\S]*?\n  \}/, 'syncPayoutEvents').replace('function syncPayoutEvents', 'syncPayoutEvents=function'));
eval(grab(/async function syncGiveFunds\(apiKey\) \{[\s\S]*?\n  \}/, 'syncGiveFunds').replace('async function syncGiveFunds', 'syncGiveFunds=async function'));

// The per-OC split used by the dashboard: Torn's recorded % if present, else a
// stand-in per-level table (level 5+ -> 80).
const splitOf = r => (r.native && r.native.percentage != null) ? r.native.percentage
                   : ((r.difficulty >= 5) ? 80 : 90);

const T = 1751000000;
const oc = (id, money, participants, opts = {}) => ({
  id, name: 'OC ' + id, money, participants, executedAt: T,
  difficulty: opts.difficulty ?? 7, native: opts.native ?? null, paid: opts.paid ?? false,
});
const give = (id, toId, toName, amount, ts) => [id, { ts, fromId: '1', fromName: 'Lead', toId, toName, amount }];

console.log('--- 1. per-OC split drives expected claim amounts ---');
{
  // 80% native split on $1m across 2 crew -> expected $400k each.
  const ocs = [oc('A', 1000000, { 11: 'Alice', 12: 'Bob' }, { native: { paid: false, percentage: 80 } })];
  const ev = Object.fromEntries([give('g1', '11', 'Alice', 400000, T + 1000), give('g2', '12', 'Bob', 400000, T + 1000)]);
  const m = matchPayouts(ocs, ev, splitOf);
  check('both $400k gives match at 80% split', m.claims.length === 2 && m.claims.every(c => c.matched), m.claims);
  check('claim expected = cash × 80% ÷ 2', m.claims[0].expected === 400000, m.claims[0].expected);
  // The old flat-100% behaviour: expected $500k, relErr 0.2 > 0.15 -> NO match.
  const legacy = matchPayouts(ocs, ev, 100);
  check('flat 100% share would have missed both (the old bug)', legacy.claims.every(c => !c.matched));
  // No native % -> per-level fallback (difficulty 7 -> 80%).
  const ocs2 = [oc('A2', 1000000, { 11: 'Alice', 12: 'Bob' })];
  const m2 = matchPayouts(ocs2, ev, splitOf);
  check('no native % falls back to per-level share', m2.claims[0].expected === 400000, m2.claims[0].expected);
}

console.log('--- 2. natively-paid OCs generate no claims ---');
{
  const ocs = [
    oc('B', 600000, { 13: 'Carol' }, { native: { paid: true, percentage: 80, at: T + 100 } }),
    oc('C', 600000, { 13: 'Carol' }, { native: { paid: false, percentage: 80 } }),
  ];
  // One give that would perfectly match either OC's $480k claim.
  const ev = Object.fromEntries([give('g3', '13', 'Carol', 480000, T + 500)]);
  const m = matchPayouts(ocs, ev, splitOf);
  check('paid-native OC produced no claims', m.claims.every(c => c.ocId !== 'B'), m.claims.map(c => c.ocId));
  check('the give settles the UNPAID OC instead', m.claims.find(c => c.ocId === 'C')?.matched != null);
  // Manually-marked-paid OCs (no native record) KEEP their claims — those were
  // paid via gives, and absorbing them prevents false matches elsewhere.
  const m3 = matchPayouts([oc('D', 500000, { 14: 'Dan' }, { paid: true })], {}, splitOf);
  check('manual-paid OC (no native) still generates claims', m3.claims.length === 1, m3.claims.length);
}

console.log('--- 3. plain-text gives resolve by name ---');
{
  const ocs = [oc('E', 500000, { 21: 'EveF' }, { native: { paid: false, percentage: 100 } })];
  const ev = Object.fromEntries([give('g4', null, '  eveF ', 500000, T + 2000)]);   // no XID, sloppy case/spacing
  const m = matchPayouts(ocs, ev, splitOf);
  check('XID-less give matched via exact name', m.claims[0].matched != null);
  // Ambiguous: same name, two different uids -> must NOT guess.
  const ocs2 = [
    oc('F', 400000, { 31: 'Dup' }, { native: { paid: false, percentage: 100 } }),
    oc('G', 400000, { 32: 'Dup' }, { native: { paid: false, percentage: 100 } }),
  ];
  const ev2 = Object.fromEntries([give('g5', null, 'Dup', 400000, T + 2000)]);
  const m2 = matchPayouts(ocs2, ev2, splitOf);
  check('ambiguous name matched nothing', m2.claims.every(c => !c.matched));
}

console.log('--- 4. lump sums still work with per-OC splits ---');
{
  const ocs = [
    { ...oc('H', 200000, { 41: 'Hank' }, { native: { paid: false, percentage: 100 } }), executedAt: T },
    { ...oc('I', 200000, { 41: 'Hank' }, { native: { paid: false, percentage: 100 } }), executedAt: T + 100 },
  ];
  const ev = Object.fromEntries([give('g6', '41', 'Hank', 400000, T + 3000)]);
  const m = matchPayouts(ocs, ev, splitOf);
  check('one $400k give settles both $200k claims (lump)', m.claims.every(c => c.matched && c.matched.mode === 'lump'));
}

console.log('--- 5. giveFunds cursor: ascending walk, no skipped bursts ---');
const giveHtml = (toId, toName, amt) =>
  `<a href="http://www.torn.com/profiles.php?XID=1">Lead</a> gave $${amt.toLocaleString('en-US')} to <a href="http://www.torn.com/profiles.php?XID=${toId}">${toName}</a>`;
// 250 events, ts 1001..1250 — a burst 2.5× larger than one page.
const ALL = [];
for (let i = 1; i <= 250; i++) ALL.push({ id: 'n' + (1000 + i), timestamp: 1000 + i, news: giveHtml(2, 'Bob', 1000 + i) });
let apiCalls = [];
global.apiFetch = async (path) => {
  apiCalls.push(path);
  const from = Number((path.match(/[&?]from=(\d+)/) || [])[1] || 0);
  const asc = /sort=ASC/.test(path);
  let rows = ALL.filter(e => !from || e.timestamp >= from);
  rows.sort((a, b) => asc ? a.timestamp - b.timestamp : b.timestamp - a.timestamp);
  rows = rows.slice(0, 100);
  return { news: Object.fromEntries(rows.map(e => [e.id, { timestamp: e.timestamp, news: e.news }])) };
};

(async () => {
  // Seeded cursor at 1000 -> the whole 250-event burst is "new".
  store = { [GMK.PAYOUT_NEWS_CURSOR]: 1000 };
  await syncGiveFunds('K');
  let ev = JSON.parse(store[GMK.PAYOUT_EVENTS] || '{}');
  check('all 250 burst events captured (old code kept 100)', Object.keys(ev).length === 250, Object.keys(ev).length);
  check('cursor advanced to the newest event', Number(store[GMK.PAYOUT_NEWS_CURSOR]) === 1250, store[GMK.PAYOUT_NEWS_CURSOR]);
  check('walk used ascending pages', apiCalls.length >= 3 && apiCalls.every(p => /sort=ASC/.test(p)), apiCalls);
  check('status ok', store[GMK.PAYOUT_NEWS_STATUS] === 'ok');

  // First run (no cursor): one DESC seed page, newest 100.
  store = {}; apiCalls = [];
  await syncGiveFunds('K');
  ev = JSON.parse(store[GMK.PAYOUT_EVENTS] || '{}');
  check('first run seeds newest 100 via one DESC page', Object.keys(ev).length === 100 && apiCalls.length === 1 && /sort=DESC/.test(apiCalls[0]), apiCalls);
  check('first-run cursor at newest', Number(store[GMK.PAYOUT_NEWS_CURSOR]) === 1250, store[GMK.PAYOUT_NEWS_CURSOR]);

  // API failure: status records the error, nothing throws.
  store = { [GMK.PAYOUT_NEWS_CURSOR]: 1000 };
  global.apiFetch = async () => { throw new Error('Incorrect key'); };
  await syncGiveFunds('K');
  check('API failure lands in status, no crash', /Incorrect key/.test(store[GMK.PAYOUT_NEWS_STATUS]), store[GMK.PAYOUT_NEWS_STATUS]);

  console.log('--- 6. plain-text news entries parse with toId=null ---');
  store = {};
  syncPayoutEvents({ news: { p1: { timestamp: 500, news: 'Lead gave $5,000 to Alice' } } });
  ev = JSON.parse(store[GMK.PAYOUT_EVENTS] || '{}');
  check('plain-text give stored', ev.p1 && ev.p1.amount === 5000 && ev.p1.toId === null && ev.p1.toName === 'Alice', ev.p1);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
