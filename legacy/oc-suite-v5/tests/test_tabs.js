// Real-DOM test: builds the dashboard shell via inject()'s markup, runs initTabs(),
// and drives main-tab + sub-tab clicks. This is the gap that let the
// "root.querySelectorAll is not a function" crash ship — the old harness stubbed
// querySelectorAll to [], so initTabs() early-returned and its body never ran.
const fs = require('fs');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!DOCTYPE html><body><div id="host"></div></body>', {
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
global.setInterval = () => 0; global.clearInterval = () => {};

// Load the script's module body, exposing what we need.
let src = fs.readFileSync('Torn_OC_Suite.user.js', 'utf8');
src = src.replace(/\}\)\(\);\s*$/, '  global.__ocm = { buildDashboard: (typeof buildDashboard === "function" ? buildDashboard : null), initTabs, initCollapse };\n})();');
src = src.replace(/^\s*inject\(\);/m, '  // inject();');
src = src.replace(/^\s*injectSidebar\(\);/m, '  // injectSidebar();');
src = src.replace(/^\s*fetchRoleWeights\(\);/m, '  // fetchRoleWeights();');
src = src.replace(/^\s*initLoanAutofill\(\);/m, '  // initLoanAutofill();');
src = src.replace(/^\s*initArmoryAnnotations\(\);/m, '  // initArmoryAnnotations();');
// War Tools starts observers + a real safety timeout; not under test here.
src = src.replace(/^\s*initWarTools\(\);/m, '  // initWarTools();');
eval(src);

const { initTabs } = global.__ocm;

// Extract the shell markup straight out of the source (the template inside inject's
// builder) so we're testing the REAL markup, not a hand-written copy.
const shellMatch = src.match(/<div class="ocm-tabs" id="ocm-tabs" role="tablist">[\s\S]*?<div id="ocm-footer"><\/div>/);
if (!shellMatch) { console.error('could not locate shell markup'); process.exit(1); }
const shell = shellMatch[0].replace(/\$\{CPR_WARN\}/g, '65');
document.getElementById('host').innerHTML = shell;

console.log('--- structure ---');
const mainTabs = [...document.querySelectorAll('.ocm-tab')].map(t => t.dataset.tab);
console.log('main tabs :', mainTabs.join(', '));
for (const pane of document.querySelectorAll('.ocm-tab-pane')) {
  const subs = [...pane.querySelectorAll('.ocm-subtab')].map(s => s.dataset.sub);
  console.log(`  ${pane.id.padEnd(18)} subs: ${subs.join(', ') || '(none)'}`);
}

console.log('\n--- initTabs() (the crash site) ---');
try {
  initTabs();
  console.log('✓ initTabs ran without throwing');
} catch (e) {
  console.log('✗ THREW:', e.message);
  process.exit(1);
}

const activeTab = () => [...document.querySelectorAll('.ocm-tab')].find(t => t.classList.contains('active'))?.dataset.tab;
const activePane = () => [...document.querySelectorAll('.ocm-tab-pane')].find(p => p.classList.contains('active'))?.id;
const activeSub = (paneId) => {
  const p = document.getElementById(paneId);
  return [...p.querySelectorAll('.ocm-subpane')].find(s => s.classList.contains('active'))?.id;
};

console.log('\n--- main tab switching ---');
console.log('default    :', activeTab(), '/', activePane());
for (const name of ['people', 'money', 'war', 'armoury', 'crimes']) {
  document.querySelector(`.ocm-tab[data-tab="${name}"]`).dispatchEvent(new window.Event('click', { bubbles: true }));
  const ok = activeTab() === name && activePane() === `ocm-pane-${name}`;
  console.log(`${ok ? '✓' : '✗'} click ${name.padEnd(7)} -> tab=${activeTab()} pane=${activePane()}`);
}

console.log('\n--- sub-tab switching (per pane) ---');
const checks = [
  ['ocm-pane-crimes',  'active',   'ocm-sub-active'],
  ['ocm-pane-crimes',  'history',  'ocm-sub-history'],
  ['ocm-pane-people',  'blocked',  'ocm-sub-blocked'],
  ['ocm-pane-people',  'activity', 'ocm-sub-activity'],
  ['ocm-pane-people',  'optimize', 'ocm-sub-optimize'],
  ['ocm-pane-money',   'payouts',  'ocm-sub-payouts'],
  ['ocm-pane-money',   'costs',    'ocm-sub-costs'],
  ['ocm-pane-money',   'funds',    'ocm-sub-funds'],
  ['ocm-pane-war',     'wars',     'ocm-sub-wars'],
  ['ocm-pane-war',     'warroom',  'ocm-sub-warroom'],
  ['ocm-pane-war',     'tools',    'ocm-sub-tools'],
  ['ocm-pane-armoury', 'loans',    'ocm-sub-loans'],
  ['ocm-pane-armoury', 'armusers', 'ocm-sub-armusers'],
  ['ocm-pane-armoury', 'loanlog',  'ocm-sub-loanlog'],
];
for (const [paneId, sub, expect] of checks) {
  const pane = document.getElementById(paneId);
  pane.querySelector(`.ocm-subtab[data-sub="${sub}"]`).dispatchEvent(new window.Event('click', { bubbles: true }));
  const got = activeSub(paneId);
  console.log(`${got === expect ? '✓' : '✗'} ${paneId} -> ${sub.padEnd(9)} active=${got}`);
}

console.log('\n--- persistence ---');
console.log('saved keys:', Object.keys(store).filter(k => k.includes('tab')).map(k => `${k}=${store[k]}`).join(', '));

console.log('\n--- tab migration (old saved names) ---');
for (const [old, want] of [['action','crimes'], ['status','people'], ['finance','money'], ['reference','people']]) {
  store.ocs_active_tab = old;
  initTabs();
  console.log(`${activeTab() === want ? '✓' : '✗'} '${old}' migrates to '${activeTab()}' (want ${want})`);
}

console.log('\n--- v4.0 sub-tab migration (People loans/memitems -> Armoury) ---');
// A user whose saved People sub-tab was Loans should land on Armoury > Loans.
store.ocs_subtab_people = 'loans';
delete store.ocs_subtab_armoury;
store.ocs_active_tab = 'people';
initTabs();
console.log(`${store.ocs_subtab_armoury === 'loans' ? '✓' : '✗'} armoury inherits saved 'loans' (got ${store.ocs_subtab_armoury})`);
console.log(`${store.ocs_subtab_people === 'assign' ? '✓' : '✗'} people resets to 'assign' (got ${store.ocs_subtab_people})`);
console.log(`${activeTab() === 'armoury' ? '✓' : '✗'} active tab follows the moved pane (got ${activeTab()})`);
// New tab names survive the allow-list.
store.ocs_active_tab = 'war';
initTabs();
console.log(`${activeTab() === 'war' ? '✓' : '✗'} 'war' is a valid saved tab (got ${activeTab()})`);
store.ocs_active_tab = 'armoury';
initTabs();
console.log(`${activeTab() === 'armoury' ? '✓' : '✗'} 'armoury' is a valid saved tab (got ${activeTab()})`);
