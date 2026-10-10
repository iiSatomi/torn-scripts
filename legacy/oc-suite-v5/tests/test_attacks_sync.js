// War data layer (v4.1): slimAttack direction/stealth, cursor-walk forward sync
// that never skips a burst, idempotent merging, 180-day pruning, paged backfill
// with retry, war-report archival (fetched once), and per-war member stats.
const fs = require('fs');
const src = fs.readFileSync('Torn_OC_Suite.user.js', 'utf8');
const grab = (re, n) => { const m = src.match(re); if (!m) { console.error('MISSING', n); process.exit(1); } return m[0]; };

let pass = 0, fail = 0;
const check = (label, ok, extra) => {
  if (ok) { pass++; console.log(`✓ ${label}`); }
  else    { fail++; console.log(`✗ ${label}${extra !== undefined ? ' — got ' + JSON.stringify(extra) : ''}`); }
};

// ── shims ───────────────────────────────────────────────────────────────────
let store = {};
global.GM_getValue = (k, d) => (k in store ? store[k] : d);
global.GM_setValue = (k, v) => { store[k] = v; };
global.ocmToast = () => {};
global.GMK = {
  ATTACK_LEDGER: 'ocs_attack_ledger', ATTACK_CURSOR: 'ocs_attack_cursor',
  ATTACK_STATUS: 'ocs_attack_status', ATTACK_META: 'ocs_attack_meta',
  WAR_ARCHIVE: 'ocs_war_archive', WAR_STATUS: 'ocs_war_status',
  CHAIN_ARCHIVE: 'ocs_chain_archive', CHAIN_STATUS: 'ocs_chain_status',
  MY_FACTION_ID: 'ocs_my_faction_id',
};
global.ATTACK_RETENTION_S = Number(src.match(/const ATTACK_RETENTION_S = (\d+) \* 86400/)[1]) * 86400;
if (!/const WAR_WIN_RESULTS = new Set/.test(src)) { console.error('MISSING WAR_WIN_RESULTS'); process.exit(1); }
global.WAR_WIN_RESULTS = new Set(['Attacked', 'Mugged', 'Hospitalized', 'Arrested', 'Looted', 'Special']);
// Kill the backfill pacing so the suite runs instantly.
const realSetTimeout = setTimeout;
global.setTimeout = (cb) => realSetTimeout(cb, 0);

// ── real functions from the script ──────────────────────────────────────────
for (const [re, name, decl] of [
  [/function loadAttackLedger\(\) \{[\s\S]*?\n  \}/, 'loadAttackLedger', 'function loadAttackLedger'],
  [/function saveAttackLedger\(led\) \{[\s\S]*?\n  \}/, 'saveAttackLedger', 'function saveAttackLedger'],
  [/function loadWarArchive\(\) \{[\s\S]*?\n  \}/, 'loadWarArchive', 'function loadWarArchive'],
  [/function saveWarArchive\(arc\) \{[\s\S]*?\n  \}/, 'saveWarArchive', 'function saveWarArchive'],
  [/function loadChainArchive\(\) \{[\s\S]*?\n  \}/, 'loadChainArchive', 'function loadChainArchive'],
  [/function saveChainArchive\(arc\) \{[\s\S]*?\n  \}/, 'saveChainArchive', 'function saveChainArchive'],
  [/function tornList\(raw\) \{[\s\S]*?\n  \}/, 'tornList', 'function tornList'],
  [/function slimAttack\(a, myFid\) \{[\s\S]*?\n  \}/, 'slimAttack', 'function slimAttack'],
  [/function mergeAttacks\(led, data, myFid\) \{[\s\S]*?\n  \}/, 'mergeAttacks', 'function mergeAttacks'],
  [/function pruneAttacks\(led\) \{[\s\S]*?\n  \}/, 'pruneAttacks', 'function pruneAttacks'],
  [/async function syncAttacks\(apiKey\) \{[\s\S]*?\n  \}/, 'syncAttacks', 'async function syncAttacks'],
  [/async function backfillAttacks\(apiKey, onProgress, floorDays = 90\) \{[\s\S]*?\n  \}/, 'backfillAttacks', 'async function backfillAttacks'],
  [/function slimWarReport\(rw\) \{[\s\S]*?\n  \}/, 'slimWarReport', 'function slimWarReport'],
  [/async function syncWars\(apiKey\) \{[\s\S]*?\n  \}/, 'syncWars', 'async function syncWars'],
  [/function warIsActive\(arc\) \{[\s\S]*?\n  \}/, 'warIsActive', 'function warIsActive'],
  [/function computeWarStats\(led, war\) \{[\s\S]*?\n  \}/, 'computeWarStats', 'function computeWarStats'],
  [/function mergeWarsPayload\(arc, data\) \{[\s\S]*?\n  \}/, 'mergeWarsPayload', 'function mergeWarsPayload'],
  [/async function apiFetchV1\(pathQuery, apiKey\) \{[\s\S]*?\n  \}/, 'apiFetchV1', 'async function apiFetchV1'],
  [/async function fetchFullWarHistory\(apiKey\) \{[\s\S]*?\n  \}/, 'fetchFullWarHistory', 'async function fetchFullWarHistory'],
  [/async function pullWarAttacks\(apiKey, from, to, onProgress\) \{[\s\S]*?\n  \}/, 'pullWarAttacks', 'async function pullWarAttacks'],
  [/function buildWarObsReport\(attacks, myFid, oppId\) \{[\s\S]*?\n  \}/, 'buildWarObsReport', 'function buildWarObsReport'],
]) {
  eval(grab(re, name).replace(decl, `${name}=${decl.startsWith('async') ? 'async function' : 'function'}`));
}

const NOW = Math.floor(Date.now() / 1000);
const MY = '9000', OPP = '7777';
const mkAttack = (id, ts, o = {}) => ({
  id, started: ts - 60, ended: ts,
  attacker: o.stealth ? null : { id: o.aid ?? 11, name: o.an ?? 'Alice', faction: { id: Number(o.af ?? MY), name: 'Us' } },
  defender: { id: o.did ?? 501, name: o.dn ?? 'Enemy1', faction: { id: Number(o.df ?? OPP), name: 'Them' } },
  result: o.res ?? 'Hospitalized',
  respect_gain: o.rg ?? 4.5, respect_loss: o.rl ?? 0,
  is_stealthed: !!o.stealth, chain: o.ch ?? 0,
  modifiers: { fair_fight: o.ff ?? 2.2, war: o.war ?? 2, retaliation: 1, group: 1, overseas: 1, chain: 1 },
});

console.log('--- 1. slimAttack: direction, stealth, defensive fields ---');
{
  const out = slimAttack(mkAttack('a1', NOW), MY);
  check('outgoing attack → dir=out', out.dir === 'out', out.dir);
  check('modifiers captured', out.m.ff === 2.2 && out.m.war === 2, out.m);
  const inc = slimAttack(mkAttack('a2', NOW, { af: OPP, df: MY, aid: 501, an: 'Enemy1', did: 11, dn: 'Alice', rl: 3.1 }), MY);
  check('incoming attack → dir=in, respect_loss kept', inc.dir === 'in' && inc.rl === 3.1, inc);
  const st = slimAttack(mkAttack('a3', NOW, { stealth: true, df: MY, did: 11, dn: 'Alice' }), MY);
  check('stealthed incoming → null attacker, dir=in', st.a === null && st.dir === 'in' && st.st === 1, st);
  check('garbage payload degrades, not throws', slimAttack({}, MY).i === '', slimAttack({}, MY));
}

// Fake API: 250-attack burst, ts NOW-2000+1 .. NOW-2000+250 (2.5 pages).
const BURST = [];
for (let i = 1; i <= 250; i++) BURST.push(mkAttack('b' + i, NOW - 2000 + i, { rg: i % 7, ch: i }));
let apiCalls = [];
global.apiFetch = async (path) => {
  apiCalls.push(path);
  const from = Number((path.match(/[&?]from=(\d+)/) || [])[1] || 0);
  const to = Number((path.match(/[&?]to=(\d+)/) || [])[1] || Infinity);
  const asc = /sort=ASC/.test(path);
  let rows = BURST.filter(a => (!from || a.ended >= from) && a.ended <= to);
  rows.sort((a, b) => asc ? a.ended - b.ended : b.ended - a.ended);
  return { attacks: rows.slice(0, 100) };
};

(async () => {
  console.log('--- 2. forward sync: ascending cursor walk, no skipped burst ---');
  store = { [GMK.MY_FACTION_ID]: MY, [GMK.ATTACK_CURSOR]: NOW - 2000 };
  const added = await syncAttacks('K');
  let led = loadAttackLedger();
  check('all 250 burst rows captured', Object.keys(led).length === 250, Object.keys(led).length);
  check('reported 250 added', added === 250, added);
  check('cursor at newest', Number(store[GMK.ATTACK_CURSOR]) === NOW - 2000 + 250, store[GMK.ATTACK_CURSOR]);
  check('ascending pages used', apiCalls.length >= 3 && apiCalls.every(p => /sort=ASC/.test(p)), apiCalls.length);
  check('status ok', store[GMK.ATTACK_STATUS] === 'ok');

  console.log('--- 3. idempotence: same rows again add nothing ---');
  store[GMK.ATTACK_CURSOR] = NOW - 2000;          // rewind cursor, same data
  const added2 = await syncAttacks('K');
  led = loadAttackLedger();
  check('no duplicates on re-walk', Object.keys(led).length === 250, Object.keys(led).length);
  check('0 newly added', added2 === 0, added2);

  console.log('--- 4. seed path + AA failure ---');
  store = { [GMK.MY_FACTION_ID]: MY }; apiCalls = [];
  await syncAttacks('K');
  check('first run seeds via one DESC page', apiCalls.length === 1 && /sort=DESC/.test(apiCalls[0]), apiCalls);
  check('seed stored 100 rows', Object.keys(loadAttackLedger()).length === 100);
  store = { [GMK.MY_FACTION_ID]: MY };
  const okApi = global.apiFetch;
  global.apiFetch = async () => { throw new Error('Access level of this key is not high enough'); };
  await syncAttacks('K');
  check('AA failure lands in status, no throw', /Access level/.test(store[GMK.ATTACK_STATUS]), store[GMK.ATTACK_STATUS]);
  global.apiFetch = okApi;

  console.log('--- 5. prune: raw rows past retention drop ---');
  {
    const l = { old: { i: 'old', ts: NOW - ATTACK_RETENTION_S - 10 }, fresh: { i: 'fresh', ts: NOW - 100 } };
    pruneAttacks(l);
    check('old row pruned, fresh kept', !l.old && !!l.fresh, Object.keys(l));
  }

  console.log('--- 6. backfill: pages backwards, retries, honest meta ---');
  store = { [GMK.MY_FACTION_ID]: MY };
  apiCalls = []; let flaky = false;
  global.apiFetch = async (path) => {
    if (!flaky && apiCalls.length === 1) { flaky = true; apiCalls.push(path); throw new Error('rate limited'); }
    return okApi(path);
  };
  let last = null;
  await backfillAttacks('K', p => { last = p; }, 90);
  led = loadAttackLedger();
  check('backfill captured the full burst', Object.keys(led).length === 250, Object.keys(led).length);
  check('recovered from the flaky window', flaky && last?.done === true);
  check('meta recorded', JSON.parse(store[GMK.ATTACK_META]).total === 250, store[GMK.ATTACK_META]);
  global.apiFetch = okApi;

  console.log('--- 7. war archive: scores refresh, report fetched exactly once ---');
  const WAR = { id: '55', start: NOW - 5000, end: NOW - 1000, target: 3000, winner: Number(MY),
    factions: [{ id: Number(MY), name: 'Us', score: 3100, chain: 250 }, { id: Number(OPP), name: 'Them', score: 2100, chain: 100 }] };
  const REPORT = { rankedwarreport: { factions: [
    { id: Number(MY), name: 'Us', score: 3100, attacks: 400,
      members: [{ id: 11, name: 'Alice', level: 40, attacks: 120, score: 900 }, { id: 12, name: 'Bob', level: 35, attacks: 80, score: 600 }] },
    { id: Number(OPP), name: 'Them', score: 2100, attacks: 300, members: [] },
  ] } };
  let reportCalls = 0;
  global.apiFetch = async (path) => {
    if (/rankedwars/.test(path)) return { rankedwars: [WAR] };
    if (/rankedwarreport/.test(path)) { reportCalls++; return REPORT; }
    throw new Error('unexpected ' + path);
  };
  store[GMK.WAR_ARCHIVE] = '{}';
  await syncWars('K');
  await syncWars('K');
  const arc = loadWarArchive();
  check('war archived with factions + winner', arc['55']?.winner === Number(MY) && arc['55'].factions.length === 2, arc['55']);
  check('official report fetched exactly once across syncs', reportCalls === 1, reportCalls);
  check('report per-member slimmed', arc['55'].report.factions[0].members[0].score === 900, arc['55'].report?.factions?.[0]?.members?.[0]);
  check('warIsActive false for ended war', warIsActive(arc) === false);

  console.log('--- 8. computeWarStats: obs numbers from the ledger ---');
  {
    const l = {};
    // Alice: 2 war hits + 1 assist + 1 outgoing loss; got beaten once (-2.5).
    for (const [id, o] of [
      ['h1', { rg: 5, ff: 3 }], ['h2', { rg: 4, ff: 1 }],
      ['as', { res: 'Assist' }], ['ol', { res: 'Lost' }],
      ['in', { af: OPP, df: MY, aid: 501, an: 'Enemy1', did: 11, dn: 'Alice', res: 'Hospitalized', rl: 2.5 }],
      ['df', { af: OPP, df: MY, aid: 501, an: 'Enemy1', did: 11, dn: 'Alice', res: 'Lost' }],
      // outside the opponent — must be ignored
      ['x1', { df: '1234', dn: 'Rando', did: 999 }],
    ]) l[id] = slimAttack(mkAttack(id, NOW - 3000, o), MY);
    const per = computeWarStats(l, { start: NOW - 5000, end: NOW - 1000, factions: [{ id: MY }, { id: OPP }] });
    const a = per['11'];
    check('hits/warHits counted', a.hits === 2 && a.warHits === 2, a);
    check('assists + outgoing losses split out', a.assists === 1 && a.outLost === 1, a);
    check('incoming: loss + respectLost, defend counted', a.losses === 1 && a.respectLost === 2.5 && a.defends === 1, a);
    check('avg FF over hits only', Math.abs(a.ffSum / a.ffN - 2) < 1e-9, a.ffSum / a.ffN);
    check('respect summed', a.respect === 9, a.respect);
    check('non-opponent attack ignored', !per['999'], Object.keys(per));
  }

  console.log('--- 9. full war history: v1 payload shape merges cleanly ---');
  {
    // v1: object keyed by war id, nested war{}, fid-keyed factions{}.
    const v1 = { rankedwars: {
      101: { factions: { 9000: { name: 'Us', score: 900, chain: 100 }, 4444: { name: 'OldFoe', score: 500, chain: 50 } },
            war: { start: NOW - 900000, end: NOW - 890000, target: 1000, winner: 9000 } },
      102: { factions: { 9000: { name: 'Us', score: 100 }, 5555: { name: 'OtherFoe', score: 300 } },
            war: { start: NOW - 500000, end: NOW - 490000, target: 800, winner: 5555 } },
    } };
    global.tornApiGet = async (url) => {
      check9v1url = url;
      return v1;
    };
    let check9v1url = '';
    store[GMK.WAR_ARCHIVE] = JSON.stringify({ 55: { start: 1, end: 2, factions: [] } });   // pre-existing war survives
    const res = await fetchFullWarHistory('K');
    const arc9 = loadWarArchive();
    check('v1 history merged (2 new + 1 kept)', res.added === 2 && res.total === 3, res);
    check('v1 nested war fields parsed', arc9['101'].winner === 9000 && arc9['101'].target === 1000, arc9['101']);
    check('v1 fid-keyed factions keep their ids', arc9['101'].factions.some(f => f.id === '4444' && f.name === 'OldFoe'), arc9['101'].factions);
    check('v1 URL used', /api\.torn\.com\/faction\/\?selections=rankedwars/.test(check9v1url), check9v1url);
  }

  console.log('--- 10. pullWarAttacks: windowed v1 walk, dedupe, short-page tolerance ---');
  {
    // 250 attacks across the window; serve pages of 100 by timestamp_started.
    const FROM = NOW - 10000, TO = NOW - 5000;
    const allAtk = [];
    for (let i = 0; i < 250; i++) allAtk.push({
      code: 'v1a' + i, timestamp_started: FROM + i * 10, timestamp_ended: FROM + i * 10 + 30,
      attacker_id: 11, attacker_name: 'Alice', attacker_faction: 9000,
      defender_id: 501, defender_name: 'Enemy1', defender_faction: 7777,
      result: 'Hospitalized', respect_gain: 3, stealthed: 0, modifiers: { war: 2 },
    });
    let v1calls = 0;
    global.tornApiGet = async (url) => {
      v1calls++;
      const from = Number((url.match(/[&?]from=(\d+)/) || [])[1] || 0);
      const rows = allAtk.filter(a => a.timestamp_started >= from).slice(0, 100);
      return { attacks: Object.fromEntries(rows.map(a => [a.code, a])) };
    };
    const pulled = await pullWarAttacks('K', FROM, TO, () => {});
    check('all 250 rows pulled, deduped', pulled.list.length === 250, pulled.list.length);
    check('did not spin (few pages)', v1calls <= 6, v1calls);
  }

  console.log('--- 11. buildWarObsReport: offensive + defensive classification ---');
  {
    const A = (o) => ({ attacker_id: 11, attacker_name: 'Alice', attacker_faction: 9000,
      defender_id: 501, defender_name: 'Enemy1', defender_faction: 7777,
      result: 'Hospitalized', respect_gain: 4, stealthed: 0, modifiers: { war: 2 }, ...o });
    const attacks = [
      A({}), A({ result: 'Mugged', respect_gain: 2 }),                    // 2 wins, 6 respect
      A({ result: 'Lost', respect_gain: 0 }),                            // off loss
      A({ result: 'Stalemate', respect_gain: 0 }),                       // stalemate
      A({ result: 'Assist', respect_gain: 0 }),                          // assist
      // enemy beats Bob (confirmed enemy)
      A({ attacker_id: 501, attacker_name: 'Enemy1', attacker_faction: 7777, defender_id: 12, defender_name: 'Bob', defender_faction: 9000 }),
      // stealthed no-war-bonus hit on Bob (likely enemy, not confirmed)
      A({ attacker_id: '', attacker_name: null, attacker_faction: '', defender_id: 12, defender_name: 'Bob', defender_faction: 9000, stealthed: 1, modifiers: { war: 1 } }),
      // stealthed WITH war bonus -> confirmed enemy even though faction hidden
      A({ attacker_id: '', attacker_name: null, attacker_faction: '', defender_id: 12, defender_name: 'Bob', defender_faction: 9000, stealthed: 1, modifiers: { war: 2 } }),
      // Bob HOLDS an incoming attack
      A({ attacker_id: 502, attacker_faction: 7777, defender_id: 12, defender_name: 'Bob', defender_faction: 9000, result: 'Lost' }),
      // random mugging by an unrelated faction — counts in lossAll, not lossEnemy
      A({ attacker_id: 999, attacker_faction: 1234, defender_id: 12, defender_name: 'Bob', defender_faction: 9000, result: 'Mugged', modifiers: { war: 1 } }),
    ];
    const rep = buildWarObsReport(attacks, 9000, 7777);
    const alice = rep.rows.find(r => r.uid === '11');
    const bob = rep.rows.find(r => r.uid === '12');
    check('Alice: 2 wins, 1 lost, 1 stale, 1 assist, 6 respect',
      alice.wins === 2 && alice.offLost === 1 && alice.stale === 1 && alice.assists === 1 && alice.respect === 6, alice);
    check('Bob: beaten 4 (all) / 2 by enemy (war-bonus stealth counts, unrelated mug does not)',
      bob.lossAll === 4 && bob.lossEnemy === 2, bob);
    check('Bob: enemy-confirmed in = 3, likely-stealth = 1, defends = 1',
      bob.enemyOn === 3 && bob.stealthOn === 1 && bob.defHeld === 1, bob);
    check('totals: 3 team hits (Alice 2 + enemy? no — only OUR wins count)', rep.totalHits === 2, rep.totalHits);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
