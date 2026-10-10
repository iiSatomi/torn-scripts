// Armoury ledger + loadouts (v4.5): armoryAction news parsing, the cursor-walked
// loan sync, loadout code round-trip, and the equipped-items scrape against the
// REAL saved items page.
const fs = require('fs');
const src = fs.readFileSync('Torn_OC_Suite.user.js', 'utf8');
const grab = (re, n) => { const m = src.match(re); if (!m) { console.error('MISSING', n); process.exit(1); } return m[0]; };

let pass = 0, fail = 0;
const check = (label, ok, extra) => {
  if (ok) { pass++; console.log(`✓ ${label}`); }
  else    { fail++; console.log(`✗ ${label}${extra !== undefined ? ' — got ' + JSON.stringify(extra) : ''}`); }
};

let store = {};
global.GM_getValue = (k, d) => (k in store ? store[k] : d);
global.GM_setValue = (k, v) => { store[k] = v; };
global.GMK = { LOAN_LEDGER: 'ocs_loan_ledger', LOAN_CURSOR: 'ocs_loan_cursor', LOAN_STATUS: 'ocs_loan_status', MEMBER_NAMES: 'ocs_member_names' };
global.btoa = s => Buffer.from(s, 'binary').toString('base64');
global.atob = s => Buffer.from(s, 'base64').toString('binary');

for (const [re, name, decl] of [
  [/function loadLoanLedger\(\) \{[\s\S]*?\n  \}/, 'loadLoanLedger', 'function loadLoanLedger'],
  [/function saveLoanLedger\(l\) \{[\s\S]*?\n  \}/, 'saveLoanLedger', 'function saveLoanLedger'],
  [/function parseArmoryNews\(txt\) \{[\s\S]*?\n  \}/, 'parseArmoryNews', 'function parseArmoryNews'],
  [/async function syncArmoryNews\(apiKey\) \{[\s\S]*?\n  \}/, 'syncArmoryNews', 'async function syncArmoryNews'],
  [/function encodeLoadout\(lo\) \{[\s\S]*?\n  \}/, 'encodeLoadout', 'function encodeLoadout'],
  [/function decodeLoadout\(code\) \{[\s\S]*?\n  \}/, 'decodeLoadout', 'function decodeLoadout'],
  [/function scanEquippedItems\(doc = document\) \{[\s\S]*?\n  \}/, 'scanEquippedItems', 'function scanEquippedItems'],
]) {
  eval(grab(re, name).replace(decl, `${name}=${decl.startsWith('async') ? 'async function' : 'function'}`));
}

const A = (id, name) => `<a href="http://www.torn.com/profiles.php?XID=${id}">${name}</a>`;

console.log('--- 1. parseArmoryNews across Torn phrasings ---');
{
  const loan = parseArmoryNews(`${A(1, 'Lead')} loaned 1x Ithaca 37 to ${A(2, 'Bob')}.`);
  check('loan: verb/item/actor/recipient', loan.verb === 'loaned' && loan.item === 'Ithaca 37' && loan.aid === '1' && loan.oid === '2', loan);
  const dep = parseArmoryNews(`${A(3, 'Carol')} deposited 5x First Aid Kit.`);
  check('deposit: qty parsed', dep.verb === 'deposited' && dep.qty === 5 && dep.item === 'First Aid Kit', dep);
  const used = parseArmoryNews(`${A(4, 'Dan')} used one of the faction's Xanax items.`);
  check("used: item from \"faction's X items\"", used.verb === 'used' && used.item === 'Xanax', used);
  const ret = parseArmoryNews(`${A(1, 'Lead')} retrieved 1x Ithaca 37 from ${A(2, 'Bob')}.`);
  check('retrieve keeps both parties', ret.verb === 'retrieved' && ret.oid === '2', ret);
  const weird = parseArmoryNews(`${A(5, 'Eve')} did something brand new with the armoury.`);
  check('unknown phrasing → verb other, raw kept', weird.verb === 'other' && /brand new/.test(weird.raw), weird);
  const filled = parseArmoryNews(`${A(6, 'Fay')} filled one of the faction's Empty Blood Bag items.`);
  check('filled parses', filled.verb === 'filled' && filled.item === 'Empty Blood Bag', filled);
}

console.log('--- 2. loadout code round-trip ---');
{
  const lo = { id: '3580191', ts: 1751000000, items: [{ id: '399', cat: 'Primary', name: 'ArmaLite M-15A4' }, { id: '50', cat: 'Melee', name: 'Né Ronin' }] };
  const code = encodeLoadout(lo);
  check('code is base64-ish, no raw JSON', !/items/.test(code) && code.length > 40, code.slice(0, 20));
  const back = decodeLoadout(code);
  check('round-trips (incl. unicode name)', back.items[1].name === 'Né Ronin' && back.id === '3580191', back);
  check('garbage → null, not throw', decodeLoadout('not a code') === null && decodeLoadout('') === null);
  check('valid b64 of wrong shape → null', decodeLoadout(global.btoa('{"x":1}')) === null);
}

(async () => {
  console.log('--- 3. armoryAction cursor walk ---');
  const NOWS = 1752000000;
  const ALL = [];
  for (let i = 1; i <= 150; i++) ALL.push({ id: 'n' + i, timestamp: NOWS - 5000 + i, news: `${A(1, 'Lead')} loaned 1x Item${i} to ${A(2, 'Bob')}.` });
  let calls = [];
  global.apiFetch = async (path) => {
    calls.push(path);
    const from = Number((path.match(/[&?]from=(\d+)/) || [])[1] || 0);
    const asc = /sort=ASC/.test(path);
    let rows = ALL.filter(n => !from || n.timestamp >= from);
    rows.sort((a, b) => asc ? a.timestamp - b.timestamp : b.timestamp - a.timestamp);
    return { news: Object.fromEntries(rows.slice(0, 100).map(n => [n.id, { timestamp: n.timestamp, news: n.news }])) };
  };
  await syncArmoryNews('K');
  check('seed: one DESC page, 100 parsed events', calls.length === 1 && Object.keys(loadLoanLedger()).length === 100, calls);
  store[GMK.LOAN_CURSOR] = NOWS - 5000;
  calls = [];
  await syncArmoryNews('K');
  check('walk catches all 150, ascending', Object.keys(loadLoanLedger()).length === 150 && calls.every(p => /ASC/.test(p)), { n: Object.keys(loadLoanLedger()).length, calls });
  check('events carry parsed fields', Object.values(loadLoanLedger())[0].verb === 'loaned');
  global.apiFetch = async () => { throw new Error('no AA'); };
  await syncArmoryNews('K');
  check('failure → status', /no AA/.test(store[GMK.LOAN_STATUS]), store[GMK.LOAN_STATUS]);

  console.log('--- 4. scanEquippedItems vs the REAL items page ---');
  const { JSDOM } = require('jsdom');
  const html = fs.readFileSync('fixtures/items.html', 'utf8');
  const t0 = Date.now();
  const dom = new JSDOM(html);
  const items = scanEquippedItems(dom.window.document);
  console.log(`  (parsed ${(html.length / 1048576).toFixed(0)}MB fixture in ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  check('found equipped items on the real page', items.length > 0, items.length);
  check('every item has an id', items.every(i => i.id && /^\d+$/.test(i.id)), items.slice(0, 3));
  check('categories captured', items.some(i => i.cat), items.map(i => i.cat));
  console.log('  equipped:', items.map(i => `${i.name || '#' + i.id} [${i.cat || '?'}]`).join(', '));

  console.log('--- 5. member-name cache (v4.8 — array-payload regression) ---');
  // The v2 members payload arrives as an ARRAY; the old stash indexed it by uid
  // ("0","1","2"…) and every lookup missed, so panes showed "#3580191".
  global.OCM_MEMBER_NAMES = null;
  for (const [re, name, decl] of [
    [/function loadMemberNameCache\(\) \{[\s\S]*?\n  \}/, 'loadMemberNameCache', 'function loadMemberNameCache'],
    [/function stashMemberNames\(memberMap\) \{[\s\S]*?\n  \}/, 'stashMemberNames', 'function stashMemberNames'],
    [/function warMemberName\(uid\) \{[\s\S]*?\n  \}/, 'warMemberName', 'function warMemberName'],
  ]) eval(grab(re, name).replace(decl, `${name}=function`));

  stashMemberNames([{ id: 3580191, name: 'iSatomi' }, { id: 22, name: 'Bob' }]);
  check('ARRAY payload: uid resolves to name', warMemberName('3580191') === 'iSatomi' && warMemberName(22) === 'Bob');
  stashMemberNames({ '33': { name: 'Carol' } });
  check('object payload: map key used when id is missing', warMemberName('33') === 'Carol');
  check('earlier names survive later stashes', warMemberName('22') === 'Bob');
  check('cache persists to GM storage', /iSatomi/.test(String(store['ocs_member_names'])), store['ocs_member_names']);
  global.OCM_MEMBER_NAMES = null;   // fresh session
  check('fresh session resolves from the persisted cache', warMemberName('3580191') === 'iSatomi');
  check('unknown uid → null (renderer falls back to #uid)', warMemberName('999') === null);

  console.log('--- 6. buildUsageStats — consumable windows ---');
  eval(grab(/const USAGE_WINDOWS = \[\[.*?\n/, 'USAGE_WINDOWS').replace('const USAGE_WINDOWS', 'USAGE_WINDOWS'));
  eval(grab(/function buildUsageStats\(ledger, nowS = Math\.floor\(Date\.now\(\) \/ 1000\)\) \{[\s\S]*?\n  \}/, 'buildUsageStats')
    .replace('function buildUsageStats', 'buildUsageStats=function'));

  const NOW = 1752500000;
  const mk = (id, ts, aid, an, item, verb = 'used', qty = 1) => [id, { ts, aid, an, item, verb, qty }];
  const ledU = Object.fromEntries([
    mk('u1', NOW - 3600,          '1', 'Ann', 'Xanax'),
    mk('u2', NOW - 2 * 86400,     '1', 'Ann', 'Xanax'),
    mk('u3', NOW - 20 * 86400,    '2', 'Bob', 'Xanax'),
    mk('u4', NOW - 40 * 86400,    '2', 'Bob', 'Xanax'),
    mk('u5', NOW - 1000,          '2', 'Bob', 'Bottle of Beer'),
    mk('l1', NOW - 500,           '1', 'Ann', 'Ithaca 37', 'loaned'),   // not a use — must be excluded
  ]);
  const stats = buildUsageStats(ledU, NOW);
  check('only used events counted, grouped per item', stats.length === 2, stats.map(s => s.name));
  const xan = stats.find(s => s.name === 'Xanax');
  check('item windows 24h/7d/30d/all', xan.d1 === 1 && xan.d7 === 2 && xan.d30 === 3 && xan.total === 4, xan);
  const ann = xan.users.find(u => u.uid === '1'), bob = xan.users.find(u => u.uid === '2');
  check('per-user windows', ann.d1 === 1 && ann.d7 === 2 && ann.all === 2 && bob.d30 === 1 && bob.all === 2, { ann, bob });
  check('users sorted by all-time count', xan.users[0].all >= xan.users[1].all);
  check('hottest item (30d) first', stats[0].name === 'Xanax');
  check('last-used timestamps carried', ann.last === NOW - 3600 && xan.last === NOW - 3600, { annLast: ann.last });

  console.log('--- 7. member armoury profiles (v4.9) ---');
  eval(grab(/const GEAR_SLOTS = \{[\s\S]*?\n  \};/, 'GEAR_SLOTS').replace('const GEAR_SLOTS', 'GEAR_SLOTS'));
  eval(grab(/function gearSlotOf\(g\) \{[\s\S]*?\n  \}/, 'gearSlotOf').replace('function gearSlotOf', 'gearSlotOf=function'));
  eval(grab(/function buildMemberArmouryProfiles\(gearItems, usage\) \{[\s\S]*?\n  \}/, 'buildMemberArmouryProfiles')
    .replace('function buildMemberArmouryProfiles', 'buildMemberArmouryProfiles=function'));

  check('weapon slots come from item type',
    gearSlotOf({ cat: 'weapons', type: 'Primary' }).key === 'primary'
    && gearSlotOf({ cat: 'weapons', type: 'Secondary' }).key === 'secondary'
    && gearSlotOf({ cat: 'weapons', type: 'Melee' }).key === 'melee');
  check('armour slots come from name keywords',
    gearSlotOf({ cat: 'armor', name: 'Combat Helmet' }).key === 'helmet'
    && gearSlotOf({ cat: 'armor', name: 'Riot Gloves' }).key === 'gloves'
    && gearSlotOf({ cat: 'armor', name: 'Dune Boots' }).key === 'boots'
    && gearSlotOf({ cat: 'armor', name: 'Combat Pants' }).key === 'pants'
    && gearSlotOf({ cat: 'armor', name: 'Flexible Body Armor' }).key === 'body');
  check('unknown armour → Body; utilities → item',
    gearSlotOf({ cat: 'armor', name: 'Mysterious Thing' }).key === 'body'
    && gearSlotOf({ cat: 'utilities', name: 'Lockpicks' }).key === 'item');

  const gearRows = [
    { id: '399', name: 'ArmaLite M-15A4', type: 'Primary', cat: 'weapons', uid: '1' },
    { id: '400', name: 'Minigun',         type: 'Primary', cat: 'weapons', uid: '1' },
    { id: '50',  name: 'Combat Helmet',   type: 'Defensive', cat: 'armor', uid: '1' },
    { id: '60',  name: 'Lockpicks',       type: 'Tool',    cat: 'utilities', uid: '2' },
    { id: '70',  name: 'Katana',          type: 'Melee',   cat: 'weapons', uid: '2' },
  ];
  const profs = buildMemberArmouryProfiles(gearRows, stats);   // usage stats from section 6
  const p1 = profs.find(p => p.uid === '1'), p2 = profs.find(p => p.uid === '2');
  check('gear split into weapons / armour / OC items',
    p1.weapons.length === 2 && p1.armour.length === 1 && p2.weapons.length === 1 && p2.items.length === 1,
    { w1: p1.weapons.length, a1: p1.armour.length, w2: p2.weapons.length, i2: p2.items.length });
  check('doubled-up Primary flagged ×2', p1.flags.length === 1 && /Primary ×2/.test(p1.flags[0]), p1.flags);
  check('usage folded per member (30d / all / rows)', p2.use30 === 2 && p2.useAll === 3 && p2.uses.length === 2, p2);
  check('names carried from usage events', p2.name === 'Bob' && p1.name === 'Ann');
  check('flagged members sort first', profs[0].uid === '1', profs.map(p => p.uid));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
