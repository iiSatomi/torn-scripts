// Drives initArmoryAnnotations() against the REAL saved Utilities armory page.
const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('fixtures/armory.html', 'utf8');
const dom = new JSDOM(html, { url: 'https://www.torn.com/factions.php?step=your&type=1#/tab=armoury&start=0&sub=utilities' });
const { window } = dom;
global.window = window; global.document = window.document; global.location = window.location;
global.Event = window.Event;
global.MutationObserver = window.MutationObserver;

const store = { ocm_api_key: 'TESTKEY' };
global.GM_getValue = (k, d) => (k in store ? store[k] : d);
global.GM_setValue = (k, v) => { store[k] = v; };
global.GMK = { API_KEY: 'ocm_api_key' };

// Stub the API with a situation matching the user's real armory:
//  · Lockpicks(1203) loaned to Tunabox(4157808) — his OC role DOES need Lockpicks -> In use
//  · C4 Explosive loaned to ludacrisis — his role needs something ELSE -> Not needed
//  · Police Badge available, 4 OC slots need it -> Wanted x4
//  · Dog Treats available, nobody needs -> Spare
const IDS = {};
for (const w of document.querySelectorAll('.img-wrap[data-itemid]')) {
  const li = w.closest('li');
  const nm = (li.querySelector('.name')?.textContent || '').replace(/\s*x\s*\d+\s*$/, '').trim();
  if (!IDS[nm]) IDS[nm] = w.dataset.itemid;
}
const ID_LOCK = IDS['Lockpicks'], ID_C4 = IDS['C4 Explosive'], ID_BADGE = IDS['Police Badge'];

global.apiFetch = async (path) => {
  if (path.includes('crimes')) return { crimes: {
    1: { id: 1, name: 'Break the Bank', status: 'Recruiting', slots: [
      { position: 'Picklock', position_info: { label: 'Picklock' }, user: { id: 4157808, name: 'Tunabox' },
        item_requirement: { id: Number(ID_LOCK), is_available: true } },
      { position: 'Muscle', position_info: { label: 'Muscle' }, user: null,
        item_requirement: { id: Number(ID_BADGE), is_available: false } },
      { position: 'Lookout', position_info: { label: 'Lookout' }, user: null,
        item_requirement: { id: Number(ID_BADGE), is_available: false } },
    ] },
    2: { id: 2, name: 'Bidding War', status: 'Planning', slots: [
      // ludacrisis is in an OC, but his role needs a Police Badge — NOT the C4 he's holding
      { position: 'Bomber', position_info: { label: 'Bomber' }, user: { id: 2360099, name: 'ludacrisis' },
        item_requirement: { id: Number(ID_BADGE), is_available: false } },
    ] },
  } };
  return { members: {
    4157808: { id: 4157808, name: 'Tunabox' },
    2360099: { id: 2360099, name: 'ludacrisis' },
  } };
};

// Pull the two functions out of the script
const src = fs.readFileSync('Torn_OC_Suite.user.js', 'utf8');
const grab = (re, n) => { const m = src.match(re); if (!m) { console.error('MISSING', n); process.exit(1); } return m[0]; };
eval(grab(/function waitForEl\(selector, timeoutMs = 10000\) \{[\s\S]*?\n  \}/, 'waitForEl').replace('function waitForEl', 'waitForEl=function'));
eval(grab(/  let _armoryNeed = null;/, 'need').replace('let _armoryNeed', 'global._armoryNeed'));
eval(grab(/async function fetchArmoryNeed\(apiKey\) \{[\s\S]*?\n  \}/, 'fetchNeed').replace('async function fetchArmoryNeed', 'fetchArmoryNeed=async function'));
eval(grab(/function paintArmoryColumn\(wrap, need\) \{[\s\S]*?\n  \}\n/, 'paint').replace('function paintArmoryColumn', 'paintArmoryColumn=function'));
eval(grab(/async function initArmoryAnnotations\(\) \{[\s\S]*?\n  \}\n/, 'init').replace('async function initArmoryAnnotations', 'initArmoryAnnotations=async function'));

(async () => {
  await initArmoryAnnotations();
  await new Promise(r => setTimeout(r, 300));

  const title = document.querySelector('.list-title .ocm-acol');
  console.log('header column inserted   :', title ? `✓ "${title.textContent}"` : '✗');
  const th = document.querySelector('.list-title');
  const order = [...th.children].map(c => c.className.split(' ')[0]).join(' | ');
  console.log('header column order      :', order);
  console.log('  -> OC Status sits before Type:', order.indexOf('ocm-acol') < order.indexOf('type') ? '✓' : '✗');

  console.log('\nROW STATUSES');
  const seen = {};
  for (const li of document.querySelectorAll('.item-list > li')) {
    const w = li.querySelector('.img-wrap[data-itemid]');
    if (!w) continue;
    const cell = li.querySelector('.ocm-acol');
    if (!cell) continue;
    const name = (li.querySelector('.name')?.textContent || '').replace(/\s+/g, ' ').trim();
    const holder = li.querySelector('.loaned a')?.textContent.trim() || 'Available';
    const st = cell.className.replace('ocm-acol ', '');
    seen[st] = (seen[st] || 0) + 1;
    if (['Lockpicks x49', 'Lockpicks x1', 'C4 Explosive x1', 'Police Badge x10', 'Dog Treats x104'].includes(name)
        || st === 's-idle' || st === 's-inuse') {
      console.log(`  ${name.padEnd(20)} [${holder.padEnd(11)}] -> ${cell.textContent.padEnd(13)} (${st})`);
      if (cell.title) console.log(`      ↳ ${cell.title}`);
    }
  }
  console.log('\nstate counts:', seen);
  const stillLoading = document.querySelectorAll('.ocm-acol.s-loading').length;
  console.log('rows stuck on "loading" :', stillLoading === 0 ? '✓ none' : `✗ ${stillLoading}`);
})();
