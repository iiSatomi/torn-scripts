// Activity tracker + revives (v4.4): snapshot throttling, per-day aggregates,
// 90-day pruning, departed-member cleanup, and the revive cursor walk.
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
global.GMK = {
  ACTIVITY_LOG: 'ocs_activity_log', ACTIVITY_SNAP_AT: 'ocs_activity_snap_at',
  REVIVE_LEDGER: 'ocs_revive_ledger', REVIVE_CURSOR: 'ocs_revive_cursor', REVIVE_STATUS: 'ocs_revive_status',
};
global.ACTIVITY_RETENTION_D = 90;
global.ACTIVITY_SNAP_MIN_MS = 30 * 60e3;

for (const [re, name, decl] of [
  [/function loadActivityLog\(\) \{[\s\S]*?\n  \}/, 'loadActivityLog', 'function loadActivityLog'],
  [/function saveActivityLog\(log\) \{[\s\S]*?\n  \}/, 'saveActivityLog', 'function saveActivityLog'],
  [/function utcDayKey\(ms\) \{[\s\S]*?\}/, 'utcDayKey', 'function utcDayKey'],
  [/function snapshotActivity\(memberMap, nowMs = Date\.now\(\)\) \{[\s\S]*?\n  \}/, 'snapshotActivity', 'function snapshotActivity'],
  [/function tornList\(raw\) \{[\s\S]*?\n  \}/, 'tornList', 'function tornList'],
  [/function loadReviveLedger\(\) \{[\s\S]*?\n  \}/, 'loadReviveLedger', 'function loadReviveLedger'],
  [/function saveReviveLedger\(l\) \{[\s\S]*?\n  \}/, 'saveReviveLedger', 'function saveReviveLedger'],
  [/function slimRevive\(r\) \{[\s\S]*?\n  \}/, 'slimRevive', 'function slimRevive'],
  [/async function syncRevives\(apiKey\) \{[\s\S]*?\n  \}/, 'syncRevives', 'async function syncRevives'],
]) {
  eval(grab(re, name).replace(decl, `${name}=${decl.startsWith('async') ? 'async function' : 'function'}`));
}

const T0 = Date.UTC(2026, 6, 14, 12, 0, 0);   // fixed clock: 2026-07-14 12:00 UTC
const roster = (laOffsetS, status = 'Online') => ({
  11: { name: 'Alice', last_action: { timestamp: Math.floor(T0 / 1000) - laOffsetS, status }, status: { state: 'Okay' } },
  12: { name: 'Bob',   last_action: { timestamp: Math.floor(T0 / 1000) - 90000, status: 'Offline' }, status: { state: 'Hospital', until: Math.floor(T0 / 1000) + 600 } },
});

console.log('--- 1. snapshot: aggregates + throttle ---');
{
  check('first snapshot writes', snapshotActivity(roster(60), T0) === true);
  let log = JSON.parse(store[GMK.ACTIVITY_LOG]);
  const day = utcDayKey(T0);
  check('per-day aggregate created', log['11']?.d[day]?.s === 1 && log['11'].d[day].o === 1, log['11']);
  check('offline member counted as sample, not online', log['12'].d[day].s === 1 && log['12'].d[day].o === 0, log['12']);
  check('state recorded', log['12'].d[day].st === 'Hospital');
  check('10 min later → throttled, no write', snapshotActivity(roster(60), T0 + 10 * 60e3) === false);
  check('31 min later → writes again', snapshotActivity(roster(60), T0 + 31 * 60e3) === true);
  log = JSON.parse(store[GMK.ACTIVITY_LOG]);
  check('same-day counts accumulate', log['11'].d[day].s === 2 && log['11'].d[day].o === 2, log['11'].d[day]);
}

console.log('--- 2. prune: old days and departed members ---');
{
  const log = JSON.parse(store[GMK.ACTIVITY_LOG]);
  log['11'].d['2026-01-01'] = { o: 1, s: 1, la: 0, st: 'Okay' };            // ancient day
  log['99'] = { n: 'GoneGuy', d: { '2026-01-02': { o: 1, s: 1, la: 0, st: 'Okay' } } };  // left long ago
  store[GMK.ACTIVITY_LOG] = JSON.stringify(log);
  store[GMK.ACTIVITY_SNAP_AT] = 0;
  snapshotActivity(roster(60), T0 + 62 * 60e3);
  const after = JSON.parse(store[GMK.ACTIVITY_LOG]);
  check('day past 90d retention pruned', !after['11'].d['2026-01-01'], Object.keys(after['11'].d));
  check('departed member with no recent days dropped', !after['99'], Object.keys(after));
  check('current members kept', !!after['11'] && !!after['12']);
}

(async () => {
  console.log('--- 3. revive sync: seed, cursor walk, idempotence ---');
  const NOWS = Math.floor(T0 / 1000);
  const ALL = [];
  for (let i = 1; i <= 150; i++) ALL.push({
    id: 'r' + i, timestamp: NOWS - 5000 + i,
    reviver: { id: 21, name: 'Medic', faction: { id: 9000 } },
    target: { id: 500 + i, name: 'T' + i, faction: { id: 9000 } },
    result: i % 4 === 0 ? 'failure' : 'success', chance: 80 + (i % 20),
  });
  let calls = [];
  global.apiFetch = async (path) => {
    calls.push(path);
    const from = Number((path.match(/[&?]from=(\d+)/) || [])[1] || 0);
    const asc = /sort=ASC/.test(path);
    let rows = ALL.filter(r => !from || r.timestamp >= from);
    rows.sort((a, b) => asc ? a.timestamp - b.timestamp : b.timestamp - a.timestamp);
    return { revives: rows.slice(0, 100) };
  };
  store = {};
  await syncRevives('K');
  check('seed run: one DESC page, 100 stored', calls.length === 1 && /DESC/.test(calls[0]) && Object.keys(loadReviveLedger()).length === 100, calls);
  store[GMK.REVIVE_CURSOR] = NOWS - 5000;      // rewind: all 150 are "new"
  calls = [];
  const added = await syncRevives('K');
  check('cursor walk captures the rest (150 total, 50 new)', Object.keys(loadReviveLedger()).length === 150 && added === 50, { total: Object.keys(loadReviveLedger()).length, added });
  check('walk was ascending', calls.every(p => /ASC/.test(p)), calls);
  check('cursor at newest', Number(store[GMK.REVIVE_CURSOR]) === NOWS - 5000 + 150);
  global.apiFetch = async () => { throw new Error('no AA'); };
  await syncRevives('K');
  check('failure → status recorded', /no AA/.test(store[GMK.REVIVE_STATUS]), store[GMK.REVIVE_STATUS]);

  console.log('--- 4. slimRevive: defensive fields ---');
  const s = slimRevive(ALL[0]);
  check('slim keeps reviver/target/result/chance', s.ri === '21' && s.ti === '501' && s.res === 'success' && s.ch === 81, s);
  check('garbage degrades', slimRevive({}).i === '' && slimRevive(null).i === '');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
