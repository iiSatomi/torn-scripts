/**
 * Does the generated v6 bundle actually work inside a Torn-shaped page?
 *
 *   node ui/build.js && node ui/bundle.test.js
 *
 * The prototype proves the UI renders in a document it owns. This proves the
 * BUNDLE renders into a #ocm-v6 div that lives inside someone else's page,
 * driven by v5's own loader functions — which is the arrangement that has to
 * work, and the one the prototype cannot exercise.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { makeFixtures } = require('./fixtures.js');

let failed = 0;
const ok = (label, cond, detail) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + label);
  if (!cond) { failed++; if (detail) console.log('      ' + detail); }
};
const section = s => console.log('\n' + s);

const bundle = fs.readFileSync(path.join(__dirname, 'v6-bundle.js'), 'utf8');

/* ── A page that is NOT ours ─────────────────────────────────────────────
   Torn's own markup surrounds us. Anything the bundle does to this document
   beyond #ocm-v6 is a bug — v5 has twice had a regex eat Torn's real DOM. */
const dom = new JSDOM(`<!doctype html><html><head><title>Torn</title>
  <style>.card { color: red } .content { display: none }</style></head>
  <body class="torn-body">
    <div id="mainContainer"><div class="torn-thing" data-oc-id="99">Torn's own OC card</div></div>
    <div id="ocm-v6"></div>
    <div id="footer">Torn footer</div>
  </body></html>`, { runScripts: 'dangerously', pretendToBeVisual: true });

const { window: w } = dom;
const d = w.document;
w.scrollTo = () => {};
w.HTMLElement.prototype.scrollIntoView = () => {};

/* ── v5's environment, as the bundle expects to find it ──────────────────
   The real script supplies GMK, GM_getValue and the load*() family. Here
   they are backed by fixtures in the same shapes. */
const S = makeFixtures();
const env = `
  const GMK = { MY_FACTION_ID: 'ocs_my_faction_id' };
  const __store = ${JSON.stringify({ ocs_my_faction_id: S.myFactionId })};
  function GM_getValue(k, dflt) { return k in __store ? __store[k] : dflt; }
  function GM_setValue(k, v) { __store[k] = v; }
  const __fix = ${JSON.stringify({
    names: S.names, ocArchive: S.ocArchive, profitLedger: S.profitLedger,
    cprArchive: S.cprArchive, payoutEvents: S.payoutEvents, deposits: S.deposits,
    gearCache: S.gearCache, loanLedger: S.loanLedger,
    warArchive: S.warArchive, chainArchive: S.chainArchive,
  })};
  function loadMemberNameCache() { return __fix.names; }
  function loadOcArchive()       { return __fix.ocArchive; }
  function loadProfitLedger()    { return __fix.profitLedger; }
  function loadCprArchive()      { return __fix.cprArchive; }
  function loadPayoutEvents()    { return __fix.payoutEvents; }
  function loadDepositEvents()   { return __fix.deposits; }
  function loadGearCache()       { return __fix.gearCache; }
  function loadLoanLedger()      { return __fix.loanLedger; }
  function loadWarArchive()      { return __fix.warArchive; }
  function loadChainArchive()    { return __fix.chainArchive; }
`;

/* Wrapped in an IIFE, exactly as it will live inside the userscript's module
   body — so a name that only works at global scope fails here too. */
section('The bundle loads inside a module scope');
let bootErr = null;
try {
  const script = new w.Function(`
    (function () {
      ${env}
      ${bundle}
      window.__v6 = { mount: ocmV6Mount, refresh: ocmV6Refresh, render, go, goSub,
                      setTheme, setW, openProfile, closeProfile,
                      css: OCM_V6_CSS, stores: ocmV6Stores,
                      get S() { return S; }, get V() { return V; }, get F() { return F; } };
    })();
  `);
  script.call(w);
} catch (e) { bootErr = e; }
ok('it evaluates without throwing', !bootErr, bootErr && bootErr.message);
if (bootErr) { console.log('\n1 check(s) FAILED\n'); process.exit(1); }

const v6 = w.__v6;

section('It reads the real stores through v5’s loaders');
{
  const stores = v6.stores();
  ok('the OC archive arrives', Object.keys(stores.ocArchive).length === 180);
  ok('the CPR archive arrives', Object.keys(stores.cprArchive).length === 8);
  ok('the faction id comes from GM storage', stores.myFactionId === S.myFactionId);
  ok('gear arrives', (stores.gearCache.items || []).length === 6);
}

section('It mounts into #ocm-v6');
{
  const mounted = v6.mount();
  ok('mount() reports success', mounted === true);
  ok('the sidebar rendered', !!d.querySelector('#ocm-v6 .side'));
  ok('the content rendered', !!d.querySelector('#ocm-v6 .content .card'));
  ok('the dashboard is the landing page',
     d.querySelector('#ocm-v6 .page-title')?.textContent === 'Dashboard');
}

section('Torn’s own page is untouched');
{
  ok('Torn’s OC card survived', !!d.querySelector('[data-oc-id="99"]'),
     'a regex over HTML has eaten Torn’s DOM twice in this project');
  ok('Torn’s footer survived', d.getElementById('footer')?.textContent === 'Torn footer');
  ok('body keeps its own class', d.body.className === 'torn-body');
  ok('no width class was stamped on body',
     !/compact|icons|full/.test(d.body.className));
  ok('no theme attribute was stamped on <html>',
     d.documentElement.getAttribute('data-theme') === null);
  ok('everything we drew is inside #ocm-v6',
     d.querySelectorAll('.side, .content, .nav-item').length ===
     d.querySelectorAll('#ocm-v6 .side, #ocm-v6 .content, #ocm-v6 .nav-item').length);
}

section('Mounting twice does not duplicate the shell');
{
  v6.mount();
  v6.mount();
  ok('still one sidebar', d.querySelectorAll('#ocm-v6 .side').length === 1);
  ok('still one nav', d.querySelectorAll('#ocm-v6 .nav').length === 1);
  ok('nav items are not duplicated', d.querySelectorAll('#ocm-v6 .nav-item').length === 9);
}

section('Every page renders against real store data');
{
  const pages = [...d.querySelectorAll('#ocm-v6 .nav-item')].map(n => n.dataset.arg);
  for (const p of pages) {
    try {
      v6.go(p);
      const title = d.querySelector('#ocm-v6 .page-title')?.textContent;
      const text = d.querySelector('#ocm-v6 .content').textContent;
      const leak = /undefined|NaN|\[object Object\]/.exec(text);
      ok(`${p.padEnd(9)} → "${title}"`, !!title && !leak,
         leak ? `leaked "${leak[0]}" near …${text.slice(Math.max(0, leak.index - 50), leak.index + 50)}…` : '');
    } catch (e) {
      ok(`${p} renders`, false, e.message);
    }
  }
}

section('The numbers on screen are the derived ones');
{
  v6.go('money');
  const V = v6.V;
  ok('scenarios were aggregated', V.money.length === 5);
  ok('totals were computed', V.totals.gross > 0);
  /* kept must be gross − members − cost, on screen as well as in the derive. */
  const drift = Math.abs(V.totals.kept - (V.totals.gross - V.totals.members - V.totals.cost));
  ok(`kept = gross − members − cost (drift ${drift.toFixed(2)})`, drift < 1);
  ok('the roster was derived from run history', v6.V.roster.some(m => m.runs > 0));
  ok('faction figures are counted, not asserted',
     v6.F.ocsRun === Object.keys(v6.S.ocArchive).length);
}

/* The v5 60s refresh drives ocmV6Tick(), which is refresh() + render(). v6 used
   to read its stores ONCE at mount and freeze; the tick re-reads them. The
   property that makes that safe — a re-render lands on the SAME page and
   sub-tab, because the router keeps them in closure state — is what this checks.
   (ocmV6Tick itself lives in the hand-written tail, not the bundle, so its DOM
   plumbing — scroll capture, the not-mounted guard, the typing guard — is
   verified where it lives; here we prove the refresh+render it composes.) */
section('A refresh repaints in place, keeping the user where they were');
{
  v6.go('war');
  v6.goSub('war', 'history');
  /* Pin the baseline to explicit values, not just "whatever it was". If it read
     "unchanged" and navigation were broken too, a wrong-but-stable baseline
     would pass — the check has to know it started somewhere real. */
  const titleOf = () => d.querySelector('#ocm-v6 .page-title')?.textContent;
  const subOf = () => d.querySelector('#ocm-v6 .subnav button.on')?.textContent.trim();
  ok('baseline: navigated to War ▸ History', titleOf() === 'War Centre' && /History/.test(subOf()));

  let err = null;
  try { v6.refresh(); v6.render(); } catch (e) { err = e; }
  ok('a mid-session refresh does not throw', !err, err && err.message);
  ok('…and stays on War Centre',
     titleOf() === 'War Centre',
     'a refresh that resets navigation would fling the user back to Dashboard every 60s');
  ok('…and the same sub-tab', /History/.test(subOf() || ''));
  ok('…with content, never a blank pane',
     (d.querySelector('#ocm-v6 .content')?.textContent || '').trim().length > 40);

  /* An open member profile is a page-level mode; it too must survive a refresh,
     the way v5's own profile survives the 60s cycle. */
  v6.go('people'); v6.goSub('people', 'roster');
  v6.openProfile('3');
  const onProfile = () => !!d.querySelector('#ocm-v6 .prof-name');
  ok('a member profile is open', onProfile());
  v6.refresh(); v6.render();
  ok('…and survives a refresh instead of dumping back to the list', onProfile());
  v6.closeProfile();
}

section('Theme and layout stay inside our div');
{
  v6.setTheme('ember');
  ok('the theme attribute lands on #ocm-v6',
     d.getElementById('ocm-v6').getAttribute('data-theme') === 'ember');
  ok('…and not on <html>', d.documentElement.getAttribute('data-theme') === null);
  v6.setW('icons');
  ok('the width class lands on #ocm-v6',
     d.getElementById('ocm-v6').classList.contains('icons'));
  ok('…and not on <body>', !d.body.classList.contains('icons'));
  v6.setTheme('frostbite'); v6.setW('compact');
}

section('Clicks work through the delegated listener');
{
  const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  v6.go('dashboard');
  click(d.querySelector('#ocm-v6 .nav-item[data-arg="armoury"]'));
  ok('a nav click navigates', d.querySelector('#ocm-v6 .page-title')?.textContent === 'Armoury');
  const tab = [...d.querySelectorAll('#ocm-v6 .subnav button')].find(b => b.dataset.arg2 === 'loans');
  click(tab);
  ok('a sub-tab click switches pane',
     d.querySelector('#ocm-v6 .subnav button.on')?.textContent.trim().startsWith('On loan'));
}

section('The stylesheet is safe to inject into Torn’s page');
{
  const css = v6.css;
  ok('it is non-trivial', css.length > 10000);
  ok('nothing targets :root', !/(^|\})\s*:root[\s[{]/.test(css));
  ok('nothing targets bare body', !/(^|\})\s*body\s*\{/.test(css));
  ok('nothing targets bare html', !/(^|\})\s*html\s*\{/.test(css));
  /* Every selector must be anchored to our div, a keyframe, or a media query.
     An unanchored `.card` would restyle Torn's own cards. */
  /* Strip comments first — otherwise a comment sitting above a rule is read
     as part of its selector and every commented rule looks unscoped. */
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [...bare.matchAll(/(^|\})\s*([^{}@]+?)\s*\{/g)]
    .map(m => m[2].trim().replace(/\s+/g, ' '))
    .filter(s => s && !/^(from|to|\d+%)$/.test(s));
  const loose = selectors.filter(s =>
    !s.split(',').every(part => /#ocm-v6/.test(part)));
  ok(`every rule is scoped to #ocm-v6 (${selectors.length} rules)`, !loose.length,
     'unscoped: ' + loose.slice(0, 5).join(' · '));
}

console.log(failed ? `\n${failed} check(s) FAILED\n` : '\nAll bundle checks passing\n');
process.exit(failed ? 1 : 0);
