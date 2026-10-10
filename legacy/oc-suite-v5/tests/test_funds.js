// Funds ingestion (v5.0): syncDepositEvents parses depositFunds news into the
// persistent store (HTML + plain entries, dedupe, cursor advance) — plus the
// re-render hygiene helpers that stop cards folding on the 60s refresh.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const store = {};
global.GM_getValue = (k, d) => (k in store ? store[k] : d);
global.GM_setValue = (k, v) => { store[k] = v; };
global.GMK = { DEPOSIT_EVENTS: 'ocs_deposit_events', DEPOSIT_CURSOR: 'ocs_deposit_cursor' };

const src = fs.readFileSync(path.join(__dirname, '..', 'Torn_OC_Suite.user.js'), 'utf8');
const grab = (re, n) => { const m = src.match(re); if (!m) { console.error('MISSING', n); process.exit(1); } return m[0]; };

eval(grab(/function loadDepositEvents\(\) \{[\s\S]*?\n  \}/, 'loadDepositEvents').replace('function loadDepositEvents', 'loadDepositEvents=function'));
eval(grab(/function saveDepositEvents\(ev\) \{[\s\S]*?\n  \}/, 'saveDepositEvents').replace('function saveDepositEvents', 'saveDepositEvents=function'));
eval(grab(/function syncDepositEvents\(newsData\) \{[\s\S]*?\n  \}/, 'syncDepositEvents').replace('function syncDepositEvents', 'syncDepositEvents=function'));

const ok = (label, cond) => console.log(`${cond ? '✓' : '✗'} ${label}`);

// ── 1. Parse a mixed page: HTML entry, plain entry, and a non-deposit line.
const count = syncDepositEvents({ news: {
  n1: { timestamp: 1000, news: '<a href="/profiles.php?XID=123">Tunabox</a> deposited $1,000,000.' },
  n2: { timestamp: 2000, news: 'iSatomi deposited $250,000' },
  n3: { timestamp: 3000, news: '<a href="/profiles.php?XID=9">Lead</a> gave $5,000 to <a href="/profiles.php?XID=8">Someone</a>' },
} });
let ev = loadDepositEvents();
ok('page count returned: ' + count, count === 3);
ok('HTML entry parsed with uid', ev.n1 && ev.n1.uid === '123' && ev.n1.name === 'Tunabox' && ev.n1.amount === 1000000);
ok('plain entry parsed (no uid)', ev.n2 && ev.n2.uid === null && ev.n2.name === 'iSatomi' && ev.n2.amount === 250000);
ok('non-deposit line skipped', !ev.n3);
ok('cursor advanced to newest ts', Number(store.ocs_deposit_cursor) === 3000);

// ── 2. Re-seeing the same page never duplicates or mutates.
ev.n1.amount = 777;   // poison the in-store copy? no — reload from store below
syncDepositEvents({ news: { n1: { timestamp: 1000, news: '<a href="/profiles.php?XID=123">Tunabox</a> deposited $999.' } } });
ev = loadDepositEvents();
ok('id-keyed: re-seen entry not overwritten', ev.n1.amount === 1000000);
ok('cursor never regresses', Number(store.ocs_deposit_cursor) === 3000);

// ── 3. Junk-safe.
ok('null payload returns 0', syncDepositEvents(null) === 0);
ok('error payload returns 0', syncDepositEvents({ __err: true }) === 0);

// ── 4. Re-render hygiene: open <details>/rows survive an innerHTML rebuild.
const dom = new JSDOM('<!DOCTYPE html><div id="r"></div>');
global.document = dom.window.document;
eval(grab(/function openDetailKeys\(root\) \{[\s\S]*?\n  \}/, 'openDetailKeys').replace('function openDetailKeys', 'openDetailKeys=function'));
eval(grab(/function restoreOpenDetails\(root, keys\) \{[\s\S]*?\n  \}/, 'restoreOpenDetails').replace('function restoreOpenDetails', 'restoreOpenDetails=function'));

const r = dom.window.document.getElementById('r');
const markup = `
  <details data-key="war-1" open><summary>a</summary></details>
  <details data-key="war-2"><summary>b</summary></details>
  <table><tbody>
    <tr data-key="gp-11" data-detail="1" style="display:none"><td>x</td></tr>
    <tr data-key="gp-12" data-detail="1" style=""><td>y</td></tr>
  </tbody></table>`;
r.innerHTML = markup;
const keys = openDetailKeys(r);
ok('captures open card + expanded row only', keys.has('war-1') && keys.has('gp-12') && !keys.has('war-2') && !keys.has('gp-11'));
// Simulate the 60s refresh: rebuild with everything closed.
r.innerHTML = markup.replace(' open', '').replace('style=""', 'style="display:none"');
restoreOpenDetails(r, keys);
ok('open card restored after re-render', r.querySelector('details[data-key="war-1"]').open === true);
ok('closed card stays closed', r.querySelector('details[data-key="war-2"]').open === false);
ok('expanded row restored', r.querySelector('tr[data-key="gp-12"]').style.display === '');
ok('collapsed row stays hidden', r.querySelector('tr[data-key="gp-11"]').style.display === 'none');
