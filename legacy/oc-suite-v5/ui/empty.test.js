/**
 * Does the v6 bundle survive a faction with NOTHING recorded yet?
 *
 *   node ui/build.js && node ui/empty.test.js
 *
 * This is the state every user is in on the very first load, and it is the one
 * the fixtures cannot reach: bundle.test.js supplies 180 archived OCs, so every
 * derive returns something and every renderer gets handed data.
 *
 * It is not a hypothetical. Shipped and hit in a real browser:
 *
 *   · currentWar() returns NULL when no war is running. feed() only tested
 *     `Array.isArray(data) && !data.length` for emptiness, so null sailed
 *     through as state 'ok' and warOverviewPane died on `w.started`. Clicking
 *     War Centre threw, every time, and the pane never drew.
 *
 *   · Several panes never went through bound() at all — they mapped a derive
 *     result straight into a template, so an empty archive produced an empty
 *     STRING and the pane rendered as blank space. Indistinguishable from a
 *     crash, and equally alarming.
 *
 * So: every page, every sub-tab, with every store empty. The bar is that
 * nothing throws and no pane comes out blank — a pane with genuinely nothing
 * to show must SAY so.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

let failed = 0;
const ok = (label, cond, detail) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + label);
  if (!cond) { failed++; if (detail) console.log('      ' + detail); }
};
const section = s => console.log('\n' + s);

const bundle = fs.readFileSync(path.join(__dirname, 'v6-bundle.js'), 'utf8');

const dom = new JSDOM(
  `<!doctype html><html><body><div id="ocm-v6"></div></body></html>`,
  { runScripts: 'dangerously', pretendToBeVisual: true });
const { window: w } = dom;
const d = w.document;
w.scrollTo = () => {};
w.HTMLElement.prototype.scrollIntoView = () => {};

/* Every loader returns the SAME shape it returns on a fresh install: an empty
   object, or an object whose list is empty. Deliberately not `null` — that
   would be testing a bug in the loaders rather than in the UI. */
const env = `
  const GMK = { MY_FACTION_ID: 'ocs_my_faction_id' };
  function GM_getValue(k, dflt) { return dflt; }
  function GM_setValue() {}
  function loadMemberNameCache() { return {}; }
  function loadOcArchive()       { return {}; }
  function loadProfitLedger()    { return {}; }
  function loadCprArchive()      { return {}; }
  function loadPayoutEvents()    { return {}; }
  function loadDepositEvents()   { return {}; }
  function loadGearCache()       { return { items: [] }; }
  function loadLoanLedger()      { return {}; }
  function loadWarArchive()      { return {}; }
  function loadChainArchive()    { return {}; }
`;

section('It boots with every store empty');
let bootErr = null;
try {
  const script = new w.Function(`
    (function () {
      ${env}
      ${bundle}
      window.__v6 = { mount: ocmV6Mount, go, goSub, subTabs, navItems,
                      get V() { return V; }, get F() { return F; } };
    })();
  `);
  script.call(w);
} catch (e) { bootErr = e; }
ok('the bundle evaluates', !bootErr, bootErr && bootErr.message);
if (bootErr) { console.log('\n1 check(s) FAILED\n'); process.exit(1); }

const v6 = w.__v6;
ok('mount() succeeds on an empty faction', v6.mount() === true);

/* A derive returning null is normal, not broken — there IS no current war. */
section('Derives return honest emptiness, not fabricated data');
{
  ok('currentWar is null, not a placeholder war', v6.V.warNow === null);
  ok('the roster is empty', v6.V.roster.length === 0);
  ok('money totals are zero, not NaN',
     v6.V.totals.kept === 0 && !Number.isNaN(v6.V.totals.kept));
  ok('faction member count is 0, not undefined', v6.F.members === 0);
}

/* THE MAIN EVENT. Walk every page and every sub-tab the nav actually offers,
   rather than a hand-kept list — a page added later is covered automatically,
   which is the only way this stays true. */
section('Every page and sub-tab renders');
{
  const pages = v6.navItems().filter(n => !n.sep).map(n => n.id);
  const subs = v6.subTabs();
  const content = () => d.querySelector('#ocm-v6 .content');

  for (const page of pages) {
    let err = null;
    try { v6.go(page); } catch (e) { err = e; }
    ok(`${page} renders`, !err, err && err.message);
    if (err) continue;

    /* Blank is the failure mode that looks like a crash but throws nothing.
       A page must always put SOMETHING readable on screen. */
    const text = (content()?.textContent || '').trim();
    ok(`${page} is not blank`, text.length > 40,
       `only ${text.length} chars of text`);

    for (const t of (subs[page] || [])) {
      let subErr = null;
      try { v6.goSub(page, t.id); } catch (e) { subErr = e; }
      ok(`${page} ▸ ${t.id} renders`, !subErr, subErr && subErr.message);
      if (subErr) continue;
      const subText = (content()?.textContent || '').trim();
      ok(`${page} ▸ ${t.id} is not blank`, subText.length > 40,
         `only ${subText.length} chars of text`);
    }
  }
}

/* Counts must be COUNTED. Literals in the nav read as data and cannot ever be
   right — the first live test showed "Roster 48" beside an empty roster and a
   rail advertising 84 payouts on a faction with none. */
section('Badges and counts reflect reality, not the mock');
{
  const badges = v6.navItems().filter(n => !n.sep).map(n => n.badge);
  ok('no nav badge shows a number on an empty faction',
     badges.every(b => !b), 'saw: ' + JSON.stringify(badges));

  const counts = Object.values(v6.subTabs()).flat().map(t => t.n);
  ok('no sub-tab count shows a number on an empty faction',
     counts.every(n => !n), 'saw: ' + JSON.stringify(counts));
}

/* The diagnostic is the thing that makes an empty pane attributable, so it has
   to work in precisely the state it exists for. */
section('The data-source report explains the emptiness');
{
  v6.go('settings');
  const text = d.querySelector('#ocm-v6 .content').textContent;
  ok('Settings names the empty stores', /OC archive/.test(text));
  ok('it reports how many stores are empty', /10 of 10 stores are empty/.test(text),
     'the count line is what turns "blank UI" into "unsynced data"');
}

console.log(failed ? `\n${failed} check(s) FAILED\n` : '\nAll empty-faction checks passing\n');
process.exit(failed ? 1 : 0);
