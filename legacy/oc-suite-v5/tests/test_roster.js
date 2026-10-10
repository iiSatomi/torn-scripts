/**
 * REAL-DOM test for the Performance pane (v5.3).
 *
 * WHY THIS EXISTS: `npm run render` cannot see any of this. Its harness stubs
 * `querySelector()` to return null, so `histWireRoster` hits its `if (!table)
 * return` guard and paint() never runs — the roster body has NEVER been exercised
 * by the render QA, in v5.2 or since. The output HTML contains the table's static
 * <thead> and an empty <tbody>, which looks fine unless you count rows.
 *
 * So everything below drives the real functions against a real jsdom table:
 * rows actually paint, avatars actually render, filters actually filter, the sort
 * actually reorders, and the merged Crimes view actually expands.
 */
const fs = require('fs');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!DOCTYPE html><body><div id="pane"></div></body>', {
  url: 'https://www.torn.com/factions.php?step=your#/tab=crimes',
});
const { window } = dom;
global.window = window;
global.document = window.document;
global.Event = window.Event;
global.location = window.location;
global.MutationObserver = window.MutationObserver;
global.addEventListener = () => {};

const store = {};
global.GM_getValue = (k, d) => (k in store ? store[k] : d);
global.GM_setValue = (k, v) => { store[k] = v; };
global.GM_addStyle = () => {};
global.GM_registerMenuCommand = () => {};
global.GM_xmlHttpRequest = () => {};
global.setInterval = () => 0;
global.clearInterval = () => {};

let src = fs.readFileSync('Torn_OC_Suite.user.js', 'utf8');
src = src.replace(/\}\)\(\);\s*$/,
  '  global.__ocm = { histRosterHtml, histWireRoster, histCrimesHtml, histWireExpanders, histState, ocmAvatarHtml };\n})();');
for (const boot of ['inject', 'injectSidebar', 'fetchRoleWeights', 'initLoanAutofill',
                    'initArmoryAnnotations', 'initWarTools']) {
  src = src.replace(new RegExp(`^\\s*${boot}\\(\\);`, 'm'), `  // ${boot}();`);
}
eval(src);
const { histRosterHtml, histWireRoster, histCrimesHtml, histWireExpanders } = global.__ocm;

let fails = 0;
const ok = (label, cond) => { console.log(`${cond ? '✓' : '✗'} ${label}`); if (!cond) fails++; };
const eq = (label, got, want) => {
  const pass = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${pass ? '✓' : '✗'} ${label}${pass ? '' : ` — got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
  if (!pass) fails++;
};

const nowS = Math.floor(Date.now() / 1000);
const pane = document.getElementById('pane');

// ── Synthetic roster covering every branch the filters care about.
// NOTE: `avgCpr` uses an `in` check, NOT `??`. Passing null to mean "no CPR on
// record" is the whole point of the NoData fixture, and `null ?? 80` would
// silently substitute 80 — leaving the "No CPR" filter with nothing to find and
// the test passing vacuously.
const mkMember = (o) => ({
  uid: o.uid, name: o.name, isEx: !!o.isEx,
  runs: o.runs ?? 1, success: o.success ?? 1, failure: o.failure ?? 0, expired: 0,
  rate: o.rate ?? 1, avgCpr: 'avgCpr' in o ? o.avgCpr : 80, bestDiff: o.bestDiff ?? 5,
  topRole: o.topRole ?? 'Hacker', spark: o.spark ?? ['successful'],
  trend: o.trend ?? null, lastRun: o.lastRun ?? nowS - 3600,
  avatar: o.avatar ?? '', roles: {}, outcomes: [],
});
const members = [
  mkMember({ uid: '1', name: 'iSatomi',  runs: 14, avgCpr: 73, avatar: 'https://profileimages.torn.com/abc-1.png' }),
  mkMember({ uid: '2', name: 'Westend',  runs: 9,  avgCpr: 55 }),                    // low CPR
  mkMember({ uid: '3', name: 'Ghosted',  runs: 4,  avgCpr: 90, isEx: true }),         // left faction
  mkMember({ uid: '4', name: 'NoData',   runs: 2,  avgCpr: null }),                   // no CPR
  mkMember({ uid: '5', name: 'Dormant',  runs: 6,  avgCpr: 85, lastRun: nowS - 30 * 86400 }), // inactive
];

const st = { view: 'roster', win: 'all', filters: {} };
const render = () => {
  pane.innerHTML = histRosterHtml(members.map(m => ({ ...m })), st);
  histWireRoster(pane, members.map(m => ({ ...m })), st, {});
};

console.log('— roster actually paints (the gap render QA cannot see) —');
render();
const table = pane.querySelector('#ocm-hist-roster');
ok('roster table exists', !!table);
const bodyRows = () => [...table.tBodies[0].rows];
ok(`paints a row per member (got ${bodyRows().length})`, bodyRows().length === 4); // ex hidden by default
ok('does NOT leave an empty tbody — the exact thing render QA missed', bodyRows().length > 0);

console.log('\n— avatars —');
const firstRow = bodyRows()[0];
ok('each row carries an avatar tile', !!firstRow.querySelector('.ocm-avatar.xs'));
ok('monogram paints underneath, so a slow image never leaves a hole',
   !!firstRow.querySelector('.ocm-avatar .ocm-mono'));
{
  const withPic = bodyRows().find(r => /iSatomi/.test(r.textContent));
  const img = withPic.querySelector('.ocm-avatar img');
  ok('a member WITH a cached URL renders an <img>', !!img);
  ok('…lazily, so offscreen rows cost nothing', img && img.getAttribute('loading') === 'lazy');
  ok('…and fades in only once decoded', img && /is-loaded/.test(img.getAttribute('onload') || ''));
  const noPic = bodyRows().find(r => /Westend/.test(r.textContent));
  ok('a member with NO cached URL renders monogram only, no broken <img>',
     !noPic.querySelector('.ocm-avatar img'));
}

console.log('\n— rank column —');
eq('ranks are 1..n in sort order', bodyRows().map(r => r.cells[0].textContent), ['1', '2', '3', '4']);
ok('top three are marked', bodyRows().slice(0, 3).every(r => r.cells[0].classList.contains('top')));
ok('fourth is not', !bodyRows()[3].cells[0].classList.contains('top'));

console.log('\n— every row drills through to a profile —');
ok('rows carry data-ocm-profile', bodyRows().every(r => r.hasAttribute('data-ocm-profile')));
eq('and it is the member uid', bodyRows()[0].getAttribute('data-ocm-profile'), '1');

console.log('\n— sorting really reorders (default: most OCs first) —');
// Read the name span specifically — the cell also contains the monogram initials.
const names = () => bodyRows().map(r => r.querySelector('.ocm-rosname .n').textContent);
eq('default sort is runs desc', names(), ['iSatomi', 'Westend', 'Dormant', 'NoData']);
{
  // Click the "OCs" header twice: desc -> asc.
  const th = table.tHead.rows[0].cells[2];
  th.dispatchEvent(new window.Event('click', { bubbles: true }));
  eq('clicking OCs flips to ascending', bodyRows().map(r => r.cells[2].textContent), ['2', '6', '9', '14']);
  ok('rank renumbers with the new order', bodyRows()[0].cells[0].textContent === '1');
}

console.log('\n— filters —');
const countWith = (patch) => {
  st.filters = patch; render();
  return [...pane.querySelector('#ocm-hist-roster').tBodies[0].rows]
    .filter(r => !/No members match/.test(r.textContent)).length;
};
eq('ex-members hidden by default', countWith({}), 4);
eq('"Left faction" chip reveals them', countWith({ ex: true }), 5);
eq('"Low CPR" shows only sub-threshold members', countWith({ lowcpr: true }), 1);
eq('"No CPR" shows only members with none on record', countWith({ nodata: true }), 1);
eq('"Inactive 14d+" shows only the dormant one', countWith({ stale: true }), 1);
{
  st.filters = { lowcpr: true, nodata: true }; render();
  const rows = [...pane.querySelector('#ocm-hist-roster').tBodies[0].rows];
  eq('combined filters intersect (nobody is both low-CPR and no-CPR)',
     rows.length === 1 && /No members match/.test(rows[0].textContent), true);
  ok('empty state spans the full 10-column table',
     rows[0].cells[0].getAttribute('colspan') === '10');
}
st.filters = {};

console.log('\n— name search —');
render();
{
  const search = pane.querySelector('#ocm-hist-search');
  ok('search box exists', !!search);
  search.value = 'sat';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  const rows = [...pane.querySelector('#ocm-hist-roster').tBodies[0].rows];
  eq('filters to the matching member', rows.length, 1);
  ok('case-insensitively', /iSatomi/.test(rows[0].textContent));
}

// ── Crimes view: the merge that has to answer both old questions at once.
console.log('\n— merged Crimes view —');
const scen = [{
  key: 'counter offer', name: 'Counter Offer', runs: 3, success: 2, failure: 1, expired: 0,
  rate: 2 / 3, avgCpr: 70, respectPer: 120, moneyPer: 4.83e6,
  roleRows: [
    { role: 'Hacker', n: 3, fail: 2, failRate: 2 / 3, avgCpr: 61 },
    { role: 'Muscle', n: 3, fail: 0, failRate: 0, avgCpr: 88 },
  ],
}];
const runs = [
  { ocId: 'a', scenKey: 'counter offer', name: 'Counter Offer', difficulty: 5, outcome: 'successful',
    executedAt: nowS - 86400, respect: 120, money: 4.83e6, paid: true, avgCpr: 72,
    slots: [{ uid: '1', name: 'iSatomi', role: 'Hacker', cpr: 72, weight: 30 }] },
  { ocId: 'b', scenKey: 'counter offer', name: 'Counter Offer', difficulty: 5, outcome: 'failure',
    executedAt: nowS - 5 * 86400, respect: 0, money: 0, paid: false, avgCpr: 61,
    slots: [{ uid: '2', name: 'Westend', role: 'Hacker', cpr: 61, weight: 30 }] },
];
pane.innerHTML = histCrimesHtml(scen, runs);
histWireExpanders(pane, '.ocm-scen-row', '.ocm-scen-detail');

const master = pane.querySelector('.ocm-scen-row');
const detail = pane.querySelector('.ocm-scen-detail');
ok('a master row per crime', !!master);
ok('the weak seat is visible WITHOUT expanding — the old Scenarios view needed a click',
   /Hacker 67%/.test(master.textContent));
ok('detail starts collapsed', detail.style.display === 'none');
master.dispatchEvent(new window.Event('click', { bubbles: true }));
ok('clicking expands it', detail.style.display !== 'none');
ok('expanded detail answers "which seat fails"', /Which seat fails/.test(detail.textContent));
ok('…AND lists the runs, which used to be a separate view', /Runs \(2\)/.test(detail.textContent));
ok('both old views are now reachable from one place',
   /Which seat fails/.test(detail.textContent) && /Runs \(2\)/.test(detail.textContent));
{
  const chips = [...detail.querySelectorAll('.ocm-crewchip')];
  eq('crew renders as chips', chips.length, 2);
  ok('each crew chip drills through to that member', chips.every(c => c.hasAttribute('data-ocm-profile')));
  eq('and carries the right uid', chips.map(c => c.getAttribute('data-ocm-profile')), ['1', '2']);
}
master.dispatchEvent(new window.Event('click', { bubbles: true }));
ok('clicking again collapses', detail.style.display === 'none');

console.log(fails ? `\n${fails} FAILED` : '\nall roster/crimes checks passed');
process.exit(fails ? 1 : 0);
