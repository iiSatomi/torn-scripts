/**
 * REAL-DOM test for the v5.3 shell: the navigation rail and the Dashboard.
 *
 * The rail is deliberately a RESTYLE of the existing tab system rather than a new
 * navigation implementation — initTabs still toggles .active on .ocm-tab /
 * .ocm-tab-pane. These checks exist to prove that contract survived, because if it
 * quietly didn't, every renderer would still "work" while nothing was visible.
 *
 * Also guards the two decisions that are easy to get wrong and hard to notice:
 *   · a RETURNING user must not be relocated to the new default tab mid-war;
 *   · the Dashboard must stay silent when there is nothing to act on, instead of
 *     rendering a wall of zeroes (which is the noise it exists to remove).
 */
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
// jsdom implements no layout, so scrollIntoView simply doesn't exist. Real
// browsers have had it forever; without this stub the click handler throws
// AFTER doing its job, which would look like a navigation bug and isn't one.
window.HTMLElement.prototype.scrollIntoView = function () {};

let store = {};
global.GM_getValue = (k, d) => (k in store ? store[k] : d);
global.GM_setValue = (k, v) => { store[k] = v; };
global.GM_addStyle = () => {};
global.GM_registerMenuCommand = () => {};
global.GM_xmlHttpRequest = () => {};
global.setInterval = () => 0;
global.clearInterval = () => {};

let src = fs.readFileSync('Torn_OC_Suite.user.js', 'utf8');
src = src.replace(/\}\)\(\);\s*$/,
  '  global.__ocm = { initTabs, renderDashboardPane, ocmGoto, updateTabCounts, OCM_COUNTS, setRoleWeights };\n})();');
for (const boot of ['inject', 'injectSidebar', 'fetchRoleWeights', 'initLoanAutofill',
                    'initArmoryAnnotations', 'initWarTools']) {
  src = src.replace(new RegExp(`^\\s*${boot}\\(\\);`, 'm'), `  // ${boot}();`);
}
eval(src);
const { initTabs, renderDashboardPane, ocmGoto, updateTabCounts, OCM_COUNTS, setRoleWeights } = global.__ocm;

let fails = 0;
const ok = (label, cond) => { console.log(`${cond ? '✓' : '✗'} ${label}`); if (!cond) fails++; };
const eq = (label, got, want) => {
  const pass = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${pass ? '✓' : '✗'} ${label}${pass ? '' : ` — got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
  if (!pass) fails++;
};

// Mount the REAL shell markup (extracted from source, not hand-copied).
const shellMatch = src.match(/<div class="ocm-tabs" id="ocm-tabs" role="tablist">[\s\S]*?<div id="ocm-footer"><\/div>/);
if (!shellMatch) { console.error('could not locate shell markup — the test_tabs anchors moved'); process.exit(1); }
const host = document.getElementById('host');
host.innerHTML = '<div id="ocm-root"><div id="ocm-body">' +
  shellMatch[0].replace(/\$\{CPR_WARN\}/g, '65') + '</div></div>';
const root = document.getElementById('ocm-root');
const click = (sel) => document.querySelector(sel)?.dispatchEvent(new window.Event('click', { bubbles: true }));

console.log('— rail structure —');
const tabs = [...document.querySelectorAll('.ocm-tab')].map(t => t.dataset.tab);
eq('six tabs, dashboard first', tabs, ['dashboard', 'crimes', 'people', 'money', 'war', 'armoury']);
ok('every tab still carries data-tab (initTabs\' contract)', tabs.every(Boolean));
ok('every tab has a matching pane', tabs.every(t => !!document.getElementById('ocm-pane-' + t)));
ok('icon and label are separate elements, so the rail can collapse to icons',
   [...document.querySelectorAll('.ocm-tab')].every(t => t.querySelector('.ocm-tab-ico') && t.querySelector('.ocm-tab-lbl')));
ok('collapsed rail still exposes the name via title=',
   [...document.querySelectorAll('.ocm-tab')].every(t => (t.getAttribute('title') || '').length > 0));
ok('badge ids preserved, so updateTabCounts keeps working',
   tabs.every(t => !!document.getElementById('ocm-tab-count-' + t)));
ok('pin control exists (touch has no hover state at all)', !!document.getElementById('ocm-rail-pin'));

console.log('\n— default tab —');
store = {};
initTabs();
const activeTab = () => [...document.querySelectorAll('.ocm-tab')].find(t => t.classList.contains('active'))?.dataset.tab;
const activePane = () => [...document.querySelectorAll('.ocm-tab-pane')].find(p => p.classList.contains('active'))?.id;
eq('a fresh install lands on the Dashboard', activeTab(), 'dashboard');
eq('…and its pane is the visible one', activePane(), 'ocm-pane-dashboard');
{
  // The important one: someone mid-war must not be teleported to a new tab.
  store = { ocs_active_tab: 'war' };
  initTabs();
  eq('a RETURNING user keeps their saved tab, not the new default', activeTab(), 'war');
  store = { ocs_active_tab: 'armoury' }; initTabs();
  eq('…for any saved tab', activeTab(), 'armoury');
  store = { ocs_active_tab: 'reference' }; initTabs();
  eq('a retired tab name still migrates', activeTab(), 'people');
  store = { ocs_active_tab: 'nonsense' }; initTabs();
  eq('an unknown saved tab falls back to the Dashboard', activeTab(), 'dashboard');
}

console.log('\n— switching still works through the rail —');
store = {};
initTabs();
for (const name of ['crimes', 'people', 'money', 'war', 'armoury', 'dashboard']) {
  click(`.ocm-tab[data-tab="${name}"]`);
  ok(`click ${name.padEnd(9)} → pane ${name}`,
     activeTab() === name && activePane() === `ocm-pane-${name}`);
}
eq('the choice is persisted', store.ocs_active_tab, 'dashboard');

console.log('\n— pin (the touch affordance) —');
store = {};
initTabs();
ok('starts unpinned', !root.classList.contains('ocm-rail-pinned'));
click('#ocm-rail-pin');
ok('clicking pins it open', root.classList.contains('ocm-rail-pinned'));
eq('…and persists', store.ocs_rail_pinned, true);
click('#ocm-rail-pin');
ok('clicking again unpins', !root.classList.contains('ocm-rail-pinned'));
{
  store = { ocs_rail_pinned: true };
  initTabs();
  ok('a saved pin is restored on load', root.classList.contains('ocm-rail-pinned'));
}

// ── Dashboard.
console.log('\n— dashboard: silent when there is nothing to do —');
setRoleWeights({ 'counter offer': { hacker: 40, muscle: 10 } });
const ACTIVE = new Set(['recruiting', 'planning', 'ready', 'blocked']);
store = {};
renderDashboardPane({ crimes: {}, mInfo: {}, memberById: {}, ACTIVE, stuckOcs: [], freeMembers: [] });
const dash = document.getElementById('ocm-dashboard');
ok('renders an explicit all-clear rather than a wall of zeroes', /Nothing needs attention/.test(dash.textContent));
eq('no cards', dash.querySelectorAll('.ocm-dash-card.attn, .ocm-dash-card.warn').length, 0);
eq('badge count is 0', OCM_COUNTS.dashboard, 0);

console.log('\n— dashboard: surfaces each real problem —');
const nowS = Math.floor(Date.now() / 1000);
const ctx = {
  ACTIVE,
  crimes: {
    1: { id: 1, name: 'Counter Offer', status: 'Recruiting', difficulty: 5, slots: [
      { position_info: { label: 'Hacker' }, user: { id: 11 }, checkpoint_pass_rate: 40 },   // risk seat
      { position_info: { label: 'Muscle' }, user: { id: 12 }, checkpoint_pass_rate: 90,
        item_requirement: { id: 7, is_available: false } },                                  // waiting on item
      { position_info: { label: 'Driver' } },                                                // open slot
    ] },
  },
  mInfo: { 11: { name: 'Westend' }, 12: { name: 'iSatomi' } },
  memberById: {
    11: { id: 11, name: 'Westend', last_action: { timestamp: nowS - 20 * 86400 } },   // idle
    12: { id: 12, name: 'iSatomi', last_action: { timestamp: nowS - 60 } },
  },
  stuckOcs: [{ oc: { name: 'Break the Bank' }, blockers: [{ name: 'Ghost' }] }],
  freeMembers: [{ id: '13', name: 'Spare' }],
};
store = { ocs_profit_ledger: JSON.stringify({ 99: { money: 5e6, payout: { paid: false } } }) };
renderDashboardPane(ctx);
const txt = () => document.getElementById('ocm-dashboard').textContent;
ok('open slots surfaced', /Open slots/.test(txt()));
ok('stuck OCs surfaced, with the blocker named', /Stuck OCs/.test(txt()) && /Ghost/.test(txt()));
ok('risk seat surfaced (high weight + low CPR)', /Risk seats/.test(txt()) && /Westend/.test(txt()));
ok('member waiting on an item surfaced', /Waiting on an item/.test(txt()));
ok('unpaid OC surfaced from the profit ledger', /Awaiting payout/.test(txt()));
ok('inactive member surfaced', /Inactive 7d\+/.test(txt()) && /20d/.test(txt()));
ok('a member active a minute ago is NOT called inactive', !/iSatomi.*60d/.test(txt()));
ok('badge counts the cards', OCM_COUNTS.dashboard >= 6);
ok('badge flags critical ones separately', OCM_COUNTS.dashAttn >= 1);
ok('member lines drill through to the profile',
   document.querySelectorAll('#ocm-dashboard [data-ocm-profile]').length > 0);

console.log('\n— dashboard links drive the REAL tab controls —');
{
  initTabs();
  const go = [...document.querySelectorAll('#ocm-dashboard [data-go-tab]')]
    .find(b => b.dataset.goTab === 'money');
  ok('a "go" button exists for payouts', !!go);
  go.dispatchEvent(new window.Event('click', { bubbles: true }));
  eq('it switches the main tab', activeTab(), 'money');
  const sub = [...document.querySelectorAll('#ocm-pane-money .ocm-subpane')]
    .find(p => p.classList.contains('active'))?.id;
  eq('…and the sub-tab it named', sub, 'ocm-sub-payouts');
}

console.log('\n— zero badges are hidden (noise sits on the icon when collapsed) —');
{
  OCM_COUNTS.dashboard = 0; OCM_COUNTS.dashAttn = 0;
  updateTabCounts();
  const b = document.getElementById('ocm-tab-count-dashboard');
  eq('zero badge hidden', b.style.display, 'none');
  OCM_COUNTS.dashboard = 3; OCM_COUNTS.dashAttn = 1;
  updateTabCounts();
  eq('non-zero badge shown', b.style.display, '');
  ok('critical count marks the badge', b.classList.contains('has-attn'));
}

// ── CSS contract. The rail only works if the grid places it in column 1 and the
// expanded state overflows a FIXED track — if the track ever became flexible,
// every table would resize on hover.
console.log('\n— rail CSS contract —');
ok('#ocm-body is a grid with a fixed 56px rail track',
   /#ocm-root #ocm-body \{[\s\S]*?grid-template-columns: 56px minmax\(0, 1fr\)/.test(src));
ok('everything that is not the rail sits in column 2',
   /#ocm-root #ocm-body > \*:not\(\.ocm-tabs\) \{ grid-column: 2; \}/.test(src));
ok('the rail spans all rows and sticks while you scroll',
   /grid-row: 1 \/ -1;[\s\S]{0,80}position: sticky/.test(src));
ok('hover widens the RAIL, never the track (so no table reflows)',
   /\.ocm-tabs:hover,[\s\S]{0,120}width: 190px/.test(src));
ok('rail rules are scoped under #ocm-root so they win on specificity, not order',
   (src.match(/#ocm-root \.ocm-tabs/g) || []).length >= 3);
ok('hiding the rail collapses its track (no empty gutter)',
   /ocm-member-mode #ocm-body,[\s\S]{0,80}ocm-profile-open #ocm-body \{[\s\S]{0,80}grid-template-columns: 0 /.test(src));
ok('narrow screens revert to the horizontal strip',
   /@media \(max-width: 700px\)[\s\S]{0,400}flex-direction: row/.test(src));

// The bug that shipped in v5.3.0: #ocm-body starts as inline display:none, and the
// renderers set it to 'block' — an INLINE declaration, which beats the stylesheet's
// `display: grid`. The rail was never in a grid on the live page. Asserting the CSS
// exists is not enough; nothing may re-assert display on this element inline.
ok('no renderer sets an inline display on #ocm-body that would kill the grid',
   !/getElementById\('ocm-body'\)\.style\.display\s*=\s*'(block|flex|inline[^']*)'/.test(src));
ok('…they clear the inline value instead, so the stylesheet wins',
   /getElementById\('ocm-body'\)\.style\.display\s*=\s*''/.test(src));
ok('the Money badge hides its zero like every other tab badge',
   /moneyBadge\.style\.display = unpaidCount \? '' : 'none'/.test(src));
ok('…and the pin is hidden there, since nothing collapses',
   /@media \(max-width: 700px\)[\s\S]{0,700}\.ocm-rail-pin \{ display: none/.test(src));

console.log(fails ? `\n${fails} FAILED` : '\nall shell checks passed');
process.exit(fails ? 1 : 0);
