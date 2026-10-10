// Profit tracking is the part of the Property Manager that can be quietly wrong:
// a bad basis or a mis-signed upkeep term produces a plausible number that is a
// lie. These run the real functions out of the userscript.
const fs = require('fs');
const src = fs.readFileSync(String.raw`C:\Users\asato\Desktop\Game Stuff\Torn Scripts\Torn_Property_Manager.user.js`, 'utf8');
function grab(name) {
  const i = src.indexOf('  function ' + name + '(');
  if (i < 0) throw new Error('not found: ' + name);
  let j = src.indexOf('{', i), d = 0, k = j;
  for (; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}
const store = { tpm_ledger: '{}' };
const code = ['basisOf', 'incomeOf', 'incomeUnknown', 'daysHeld', 'profitOf',
              'ledgerAll', 'ledgerSave', 'ledgerFor', 'ledgerPut', 'reconcileLeases'].map(grab).join('\n');
const api = new Function('GM_getValue', 'GM_setValue', 'K', 'PENDING_RENT',
  code + '\n; return { basisOf, incomeOf, daysHeld, profitOf, reconcileLeases, ledgerAll, ledgerFor, ledgerPut };')(
  (k, d) => store[k] === undefined ? d : store[k], (k, v) => { store[k] = v; }, { LEDGER: 'tpm_ledger' }, {});

let fail = 0;
const check = (l, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + l); if (!c) fail++; };
const DAY = 86400000;

// ── basis
check('a free property has no basis, whatever number is stored',
      api.basisOf({ acq: 'free', basis: 5000000, ups: [] }) === 0);
check('a free property still counts its upgrades',
      api.basisOf({ acq: 'free', basis: 0, ups: [{ cost: 500000 }, { cost: 100000 }] }) === 600000);
check('a bought property is purchase + upgrades',
      api.basisOf({ acq: 'bought', basis: 3000000, ups: [{ cost: 500000 }] }) === 3500000);

// ── income: an unknown amount must never be read as zero
check('rent with no amount recorded contributes nothing, not zero-as-fact',
      api.incomeOf({ inc: [{ amount: 200000 }, { amount: null }] }) === 200000);

// ── the projection
const prop = { upkeep: 1000, staffCost: 0 };
const L = { acq: 'bought', basis: 1000000, at: Date.now() - 10 * DAY, ups: [],
            inc: [{ amount: 100000, days: 50, live: true }] };
const r = api.profitOf(prop, L, null);
check('upkeep is charged over the days held', r.upkeepPaid === 10000);
check('net = collected - basis - upkeep', r.net === 100000 - 1000000 - 10000);
check('rent per day comes from the live lease', r.rentPerDay === 2000);
check('daily net subtracts upkeep from rent', r.dailyNet === 1000);
check('days to profit = shortfall / daily net', r.daysToProfit === Math.ceil(910000 / 1000));

// upkeep outrunning rent must be called out, not shown as a huge number of days
const bad = api.profitOf({ upkeep: 5000, staffCost: 0 }, L, null);
check('a property that can never pay for itself says so', bad.neverAtThisRate === true && bad.daysToProfit === null);

// already ahead
const ahead = api.profitOf({ upkeep: 0, staffCost: 0 },
  { acq: 'free', basis: 0, at: Date.now() - DAY, ups: [], inc: [{ amount: 50000, days: 10, live: true }] }, null);
check('a free property in the black reports zero days to profit', ahead.net === 50000 && ahead.daysToProfit === 0);

// no live lease and no market price: no honest projection exists
const blind = api.profitOf(prop, { acq: 'bought', basis: 500000, at: Date.now(), ups: [], inc: [] }, null);
check('with no rate at all it declines to project', blind.daysToProfit === null && blind.neverAtThisRate === false);
check('a market suggestion is used when there is no live lease',
      api.profitOf(prop, { acq: 'bought', basis: 500000, at: Date.now(), ups: [], inc: [] }, 3000).rentPerDay === 3000);

// ── reconcile
store.tpm_ledger = '{}';
const props = [{ id: '7', tenant: 'Satomi', daysTotal: 30, daysLeft: 20 }];
api.reconcileLeases(props);
api.reconcileLeases(props);                       // twice: must not double-count
const led = api.ledgerAll()['7'];
check('a lease seen twice is recorded once', led.inc.length === 1);
check('a lease we did not price is recorded with an unknown amount, not 0', led.inc[0].amount === null);
check('tracking starts from when the lease began', Math.abs(led.at - (Date.now() - 10 * DAY)) < 60000);

// an ignored property is left entirely alone
store.tpm_ledger = JSON.stringify({ 9: { ignore: true, inc: [], ups: [] } });
api.reconcileLeases([{ id: '9', tenant: 'X', daysTotal: 10, daysLeft: 5 }]);
check('a property you rent FROM someone is never given a lease record',
      api.ledgerAll()['9'].inc.length === 0);

// ── the label parsers behind the upgrade survey ──────────────────────────────
// No jsdom here, so readUpgrades() itself cannot run; these are the pure pieces
// underneath it, and they are where the known bugs were.
const UP_HAPPY = (() => {
  const i = src.indexOf('  const UP_HAPPY = ');
  let j = src.indexOf('{', i), d = 0, k = j;
  for (; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) break; } }
  return new Function('return ' + src.slice(j, k + 1))();
})();
const pure = new Function('UP_HAPPY', grab('costOf') + grab('happyFor') + '\n; return { costOf, happyFor };')(UP_HAPPY);

check('cost anchors on the $ figure, not the first number in the label',
      pure.costOf('2x Maid service ($10,000 per day)') === 10000);
check('a plain labelled cost still reads', pure.costOf('Large ($500,000)') === 500000);
check('a label with no price yields null, not 0', pure.costOf('None') === null);

const interiorKey = Object.keys(UP_HAPPY).find(k => /interior/i.test(k));
if (interiorKey) {
  const q = pure.happyFor(interiorKey, 1, 400), h = pure.happyFor(interiorKey, 2, 400);
  check('interior tiers scale off the property base happy', q === 100 && h === 200);
  check('interior happy is 0 when the base is unknown, never a guess',
        pure.happyFor(interiorKey, 1, null) === 0);
}
check('an unowned/None value contributes no happiness', pure.happyFor('pool', 0, 400) === 0);

// ── ownership: "Owned by you" vs "Owned by your spouse" ──────────────────────
const own = new Function('MODEL', 'ledgerFor',
  grab('ownProps') + grab('ownerMarkerPresent') + '\n; return { ownProps, ownerMarkerPresent };');
const mk = (id, txt) => ({ id, typeName: 'X',
  spouse: /Owned by your spouse/i.test(txt), owned: /Owned by you(?!r)/i.test(txt) });

const noLedger = () => ({ ignore: false });
let M = { props: [mk('1', 'Owned by you'), mk('2', 'Owned by your spouse'), mk('3', 'Leased to Bob')] };
let A = own(M, noLedger);
check('the spouse row is NOT read as yours (the "you"/"your" trap)', M.props[1].owned === false);
check('only "Owned by you" rows are tracked', A.ownProps().map(p => p.id).join(',') === '1');
check('a row with no owner text at all is excluded once the marker exists',
      !A.ownProps().some(p => p.id === '3'));

// marker absent entirely: must not blank the panel
M = { props: [mk('1', 'Leased to Bob'), mk('2', 'Owned by your spouse')] };
A = own(M, noLedger);
check('with no marker on the page it falls back rather than showing nothing',
      A.ownerMarkerPresent() === false && A.ownProps().map(p => p.id).join(',') === '1');

// an explicit ignore still wins
M = { props: [mk('1', 'Owned by you'), mk('2', 'Owned by you')] };
A = own(M, id => ({ ignore: id === '2' }));
check('a property flagged as rented-from-someone stays excluded',
      A.ownProps().map(p => p.id).join(',') === '1');

// ── what "max this property" means ───────────────────────────────────────────
const tms = new Function(grab('toMaxSteps') + '\n; return toMaxSteps;')();
const step = (key, value, isTop, perHappy, perDay) =>
  ({ key, selName: key, value, isTop, perHappy, perDay, effCost: perHappy * 10, gain: 10, name: key });
const u = { steps: [
  step('pool', 1, false, 350), step('pool', 3, true, 500),      // lower tier must be ignored
  step('interior', 2, true, 120),
  step('maid', 5, true, 90, true),                              // staff: a daily wage
] };
const q = tms(u);
check('only top tiers are queued (a lower tier never discounts a higher one)',
      q.every(s => s.isTop) && q.length === 2);
check('staff is never part of "max this property"', !q.some(s => s.perDay));
check('best value comes first', q[0].key === 'interior' && q[1].key === 'pool');
check('a track already at its top tier drops out entirely',
      tms({ steps: [step('interior', 2, true, 120)] }).length === 1 && tms({ steps: [] }).length === 0);

// ── load-order safety ────────────────────────────────────────────────────────
// A module-level `let` declared BELOW the first executable statement is a temporal
// dead zone error if anything that statement calls reads it — and it only shows up
// at runtime, as a completely dead panel. Every top-level binding must be declared
// before the script starts doing things.
const lines = src.split('\n');
const firstStmt = lines.findIndex(l => /^  boot\(false\);/.test(l));
const lateBindings = [];
lines.forEach((l, i) => {
  const m = l.match(/^  (?:let|const|var) ([A-Za-z_$][\w$]*)/);
  if (m && i > firstStmt) lateBindings.push(`${m[1]} (line ${i + 1})`);
});
check('every top-level binding is declared before the script starts running'
      + (lateBindings.length ? ' — late: ' + lateBindings.join(', ') : ''),
      firstStmt > 0 && lateBindings.length === 0);

// ID=0 appears on a real row link and is not a property. Taking it pointed a
// property's buttons at a page that does not exist — a button that does nothing.
// Built from the SCRIPT's own extraction lines rather than a copy of them: a
// reimplementation in the test would keep passing while the real parser stayed broken.
const idBody = (() => {
  const marker = "for (const a of li.querySelectorAll(";
  const i = src.indexOf(marker);
  const j = src.indexOf('\n      }', i);
  if (i < 0 || j < 0) throw new Error('id-extraction block not found');
  return src.slice(i, j + 8);          // the whole for-loop, header included: the body alone has a `continue`
})();
const idOf = new Function('hrefs',
  'let id = null;\n' +
  'const li = { querySelectorAll: () => hrefs.map(h => ({ getAttribute: () => h })) };\n' +
  idBody + '\nreturn id;');
check('a bare ID=0 link is never taken as the property id',
      idOf(['/properties.php?step=x&ID=0', '/properties.php#/p=options&ID=6157980']) === '6157980');
check('the tenant profile XID is still never mistaken for the property',
      idOf(['/profiles.php?XID=2795017', '/properties.php#/p=options&ID=5330516']) === '5330516');
check('all-zero means no id rather than a fake one', idOf(['/properties.php?ID=0']) === null);

console.log(fail ? fail + ' FAILED' : 'all good');
process.exitCode = fail ? 1 : 0;
