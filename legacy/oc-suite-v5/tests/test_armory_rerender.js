// Reproduces the REPORTED breakage: Torn re-renders the item list after a Retrieve,
// wiping our injected cells while the .ocm-armory-annotated class survives — leaving
// a 110px hole and misaligned headers.
const fs = require('fs');
const { JSDOM } = require('jsdom');

const file = 'fixtures/armory_broken.html';
const dom = new JSDOM(fs.readFileSync(file, 'utf8'), {
  url: 'https://www.torn.com/factions.php?step=your#/tab=armoury&start=0&sub=utilities',
});
const { window } = dom;
global.window = window; global.document = window.document; global.location = window.location;
global.MutationObserver = window.MutationObserver;

const store = { ocm_api_key: 'K' };
global.GM_getValue = (k, d) => (k in store ? store[k] : d);
global.GMK = { API_KEY: 'ocm_api_key' };
global.ocmToast = () => {};

// Fake API: Tunabox needs Lockpicks; ludacrisis is in an OC needing something else.
const wrapSel = '.armoury-tabs, .armoury-temporary-wrap';
const idOf = (name) => {
  for (const li of document.querySelectorAll('.item-list > li')) {
    const n = (li.querySelector('.name')?.textContent || '').trim();
    if (n.startsWith(name)) return li.querySelector('.img-wrap[data-itemid]')?.dataset.itemid;
  }
};
let apiCalls = 0;
global.apiFetch = async (path) => {
  apiCalls++;
  if (path.includes('crimes')) {
    const lock = Number(idOf('Lockpicks'));
    const badge = Number(idOf('Police Badge'));
    return { crimes: { 1: { id: 1, name: 'Break the Bank', status: 'Recruiting', slots: [
      { position: 'Picklock', position_info: { label: 'Picklock' }, user: { id: 4157808 },
        item_requirement: { id: lock, is_available: true } },
      { position: 'Bomber', position_info: { label: 'Bomber' }, user: { id: 2360099 },
        item_requirement: { id: badge, is_available: false } },
    ] } } };
  }
  return { members: { 4157808: { id: 4157808, name: 'Tunabox' }, 2360099: { id: 2360099, name: 'ludacrisis' } } };
};

const src = fs.readFileSync('Torn_OC_Suite.user.js', 'utf8');
const grab = re => src.match(re)[0];
eval(grab(/function waitForEl\(selector, timeoutMs = 10000\) \{[\s\S]*?\n  \}/).replace('function waitForEl', 'waitForEl=function'));
eval(grab(/  let _armoryNeed = null;/).replace('let _armoryNeed', 'global._armoryNeed'));
// v5.1.2: fetchArmoryNeed reads all three armouries through parseArmouryCat.
// Without it the call throws, the catch strips .ocm-armory-annotated, and the
// test sees the column "fail" for a reason that has nothing to do with re-render.
eval(grab(/function parseArmouryCat\(data, key, out\) \{[\s\S]*?\n  \}/).replace('function parseArmouryCat', 'parseArmouryCat=function'));
eval(grab(/async function fetchArmoryNeed\(apiKey\) \{[\s\S]*?\n  \}/).replace('async function fetchArmoryNeed', 'fetchArmoryNeed=async function'));
eval(grab(/function paintArmoryColumn\(wrap, need\) \{[\s\S]*?\n  \}\n/).replace('function paintArmoryColumn', 'paintArmoryColumn=function'));
// v4.9: initArmoryAnnotations also injects the quick-loan panel — bring the
// REAL function along (its deps stubbed: images/loan flow are out of scope here).
global.esc = s => String(s ?? '');
global.itemImgUrl = id => `https://www.torn.com/images/items/${id}/small.png`;
global.execArmoryLoanIntent = () => {};
eval(grab(/function injectQuickLoanPanel\(wrap, need\) \{[\s\S]*?\n  \}\n/).replace('function injectQuickLoanPanel', 'injectQuickLoanPanel=function'));
// v5.1.2 split the armoury sub-tab check into its own helper; initArmoryAnnotations
// calls it, so it has to come along or the eval'd copy throws ReferenceError.
eval(grab(/function armourySubOf\(\) \{[\s\S]*?\n  \}/).replace('function armourySubOf', 'armourySubOf=function'));
eval(grab(/async function initArmoryAnnotations\(\) \{[\s\S]*?\n  \}\n/).replace('async function initArmoryAnnotations', 'initArmoryAnnotations=async function'));

const wrap = () => document.querySelector('.ocm-armory-annotated') || document.querySelector(wrapSel);
const state = () => {
  const w = wrap();
  const rows = w.querySelectorAll('.item-list > li .img-wrap[data-itemid]').length;
  const cells = w.querySelectorAll('.item-list > li .ocm-acol').length;
  const hdr = w.querySelectorAll('.list-title .ocm-acol').length;
  const cls = w.classList.contains('ocm-armory-annotated');
  return { rows, cells, hdr, cls };
};

(async () => {
  console.log('=== STATE AS SAVED (the bug you hit) ===');
  let s = state();
  console.log(`  rows=${s.rows} cells=${s.cells} header=${s.hdr} class=${s.cls}`);
  console.log(`  BROKEN (pre-fix): class is on (CSS steals 110px) but ${s.cells} cells exist -> ${s.rows} rows with a hole`);

  console.log('\n=== AFTER THE FIX RUNS ===');
  await initArmoryAnnotations();
  await new Promise(r => setTimeout(r, 400));
  s = state();
  console.log(`  rows=${s.rows} cells=${s.cells} header=${s.hdr} class=${s.cls}`);
  console.log('  ✓ every row has a cell   :', s.cells === s.rows);
  console.log('  ✓ header restored        :', s.hdr === 1);
  console.log('  ✓ column sits before Type:', (() => {
    const t = wrap().querySelector('.list-title');
    const kids = [...t.children].map(c => c.className.split(' ')[0]);
    return kids.indexOf('ocm-acol') < kids.indexOf('type');
  })());
  console.log('  ✓ quick-loan panel lists the needy member:', (() => {
    const ql = document.getElementById('ocm-quickloan');
    return !!ql && /ludacrisis/.test(ql.textContent);
  })());

  console.log('\n=== SIMULATE TORN RE-RENDERING THE LIST (a Retrieve) ===');
  const w = wrap();
  const list = w.querySelector('.item-list');
  const fresh = list.cloneNode(true);
  fresh.querySelectorAll('.ocm-acol').forEach(c => c.remove());   // Torn's markup has none
  list.replaceWith(fresh);
  console.log('  immediately after re-render:', JSON.stringify(state()));
  await new Promise(r => setTimeout(r, 600));   // let the observer repaint
  s = state();
  console.log(`  after observer repaint     : rows=${s.rows} cells=${s.cells} header=${s.hdr}`);
  console.log('  ✓ column restored automatically:', s.cells === s.rows && s.rows > 0);

  console.log('\n=== SAFETY: API failure must NOT leave a broken layout ===');
  global._armoryNeed = null;
  global.apiFetch = async () => { throw new Error('boom'); };
  document.querySelectorAll('.ocm-acol').forEach(c => c.remove());
  const w2 = wrap(); w2.classList.add('ocm-armory-annotated'); w2.__ocmObserved = false;
  await initArmoryAnnotations();
  await new Promise(r => setTimeout(r, 200));
  console.log('  ✓ class removed so Torn layout is untouched:',
    !document.querySelector('.ocm-armory-annotated'));
})();
