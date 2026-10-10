// Hit calling (v5.1.1): reduceCalls turns the sheet's append-only event log
// into per-target caller queues — the HEAD owns the target exclusively (the
// rest of the queue only exists so a same-moment race resolves by sheet order).
// hcCallStale is the alive-timeout: a call holds while the target is in
// hospital/jail, then dies HC_ALIVE_MIN after they're attackable. Also guards
// the backend script text, the URL validation, and the v5.1.1 wiring (class
// re-assertion, exclusive locks, board button).
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'Torn_OC_Suite.user.js'), 'utf8');
const grab = (re, n) => { const m = src.match(re); if (!m) { console.error('MISSING', n); process.exit(1); } return m[0]; };

// Pull the real constants from the source so the test can't drift from the code.
const maxM = src.match(/const HC_MAX_MIN = (\d+)/);
const aliveM = src.match(/const HC_ALIVE_MIN = (\d+)/);
if (!maxM || !aliveM) { console.error('MISSING HC_MAX_MIN / HC_ALIVE_MIN'); process.exit(1); }
const HC_MAX_MIN = Number(maxM[1]);
const HC_ALIVE_MIN = Number(aliveM[1]);
let reduceCalls, hcCallStale;
eval(grab(/function reduceCalls\(events\) \{[\s\S]*?\n    \}/, 'reduceCalls').replace('function reduceCalls', 'reduceCalls=function'));
eval(grab(/function hcCallStale\(callTsMs, rec, nowSec\) \{[\s\S]*?\n    \}/, 'hcCallStale').replace('function hcCallStale', 'hcCallStale=function'));

const ok = (label, cond) => console.log(`${cond ? '✓' : '✗'} ${label}`);
const now = Date.now();

// ── 1. Basic call: first caller owns the target.
let q = reduceCalls([{ ts: now, action: 'call', caller_id: '1', caller: 'Alice', target_id: '900', target: 'Enemy' }]);
ok('single call owns target', q.get('900').length === 1 && q.get('900')[0].caller === 'Alice');

// ── 2. Race: the sheet's order decides the owner (head); dupes ignored.
q = reduceCalls([
  { ts: now - 60e3, action: 'call', caller_id: '1', caller: 'Alice', target_id: '900', target: 'E' },
  { ts: now - 30e3, action: 'call', caller_id: '2', caller: 'Bob',   target_id: '900', target: 'E' },
  { ts: now - 10e3, action: 'call', caller_id: '1', caller: 'Alice', target_id: '900', target: 'E' },
]);
ok('race: first caller by sheet order owns the target', q.get('900')[0].caller === 'Alice');
ok('re-calling does not duplicate', q.get('900').length === 2);

// ── 3. done pops ONLY that caller; a race loser inherits rather than being lost.
q = reduceCalls([
  { ts: now - 60e3, action: 'call', caller_id: '1', caller: 'Alice', target_id: '900', target: 'E' },
  { ts: now - 30e3, action: 'call', caller_id: '2', caller: 'Bob',   target_id: '900', target: 'E' },
  { ts: now - 5e3,  action: 'done', caller_id: '1', caller: 'Alice', target_id: '900', target: 'E' },
]);
ok('done promotes the race loser to owner', q.get('900').length === 1 && q.get('900')[0].caller === 'Bob');

// ── 4. release behaves like done (no hit implied here — that's the sheet's row).
q = reduceCalls([
  { ts: now - 60e3, action: 'call',    caller_id: '1', caller: 'Alice', target_id: '900', target: 'E' },
  { ts: now - 5e3,  action: 'release', caller_id: '1', caller: 'Alice', target_id: '900', target: 'E' },
]);
ok('release empties the queue', q.get('900').length === 0);

// ── 5. Absolute cap: a call older than HC_MAX_MIN is dead regardless.
q = reduceCalls([
  { ts: now - (HC_MAX_MIN + 1) * 60e3, action: 'call', caller_id: '1', caller: 'Alice', target_id: '900', target: 'E' },
  { ts: now - 60e3,                    action: 'call', caller_id: '2', caller: 'Bob',   target_id: '901', target: 'F' },
]);
ok(`call older than ${HC_MAX_MIN}m (absolute cap) expires`, q.get('900').length === 0);
ok('fresh call on other target survives', q.get('901').length === 1);

// ── 5b. Alive-timeout (hcCallStale): holds in hospital, dies once out too long.
const nowSec = Math.floor(now / 1000);
const callTs = now - 60 * 60e3;   // called an hour ago
ok('holds while target is in Hospital (even on long timers)',
  !hcCallStale(callTs, { state: 'Hospital', since: nowSec - 3600 }, nowSec));
ok('holds while target is in Jail',
  !hcCallStale(callTs, { state: 'Jail', since: nowSec - 3600 }, nowSec));
ok(`holds while target just became attackable (< ${HC_ALIVE_MIN}m)`,
  !hcCallStale(callTs, { state: 'Okay', since: nowSec - (HC_ALIVE_MIN * 60 - 30) }, nowSec));
ok(`expires once target attackable > ${HC_ALIVE_MIN}m without a hit`,
  hcCallStale(callTs, { state: 'Okay', since: nowSec - (HC_ALIVE_MIN * 60 + 30) }, nowSec));
ok('a FRESH call on an already-out target gets its own grace window',
  !hcCallStale(now - 60e3, { state: 'Okay', since: nowSec - 3600 }, nowSec));
ok('no member record → not stale here (absolute cap still applies)',
  !hcCallStale(callTs, null, nowSec));

// ── 6. Out-of-order events (sheet rows can arrive interleaved) still reduce right.
q = reduceCalls([
  { ts: now - 5e3,  action: 'done', caller_id: '1', caller: 'Alice', target_id: '900', target: 'E' },
  { ts: now - 60e3, action: 'call', caller_id: '1', caller: 'Alice', target_id: '900', target: 'E' },
]);
ok('events sorted by ts before reducing', q.get('900').length === 0);

// ── 7. Junk-safe: no target_id, empty/null input.
ok('event without target_id skipped', reduceCalls([{ ts: now, action: 'call', caller_id: '1', caller: 'A' }]).size === 0);
ok('null input yields empty map', reduceCalls(null).size === 0);

// ── 8. Backend script text: setup steps + both HTTP handlers + the log columns.
const backend = grab(/const HC_BACKEND = `[\s\S]*?`;/, 'HC_BACKEND');
ok('backend has setup steps', /Deploy -> New deployment/.test(backend) && /Anyone/.test(backend));
ok('backend handles GET and POST', /function doGet\(e\)/.test(backend) && /function doPost\(e\)/.test(backend));
ok('backend logs caller + target + result', /'caller_id', 'caller', 'target_id', 'target', 'result'/.test(backend));
ok('backend uses a script lock (concurrent callers)', /LockService\.getScriptLock/.test(backend));

// ── 9. URL validation: only Apps Script Web App URLs accepted.
const urlRe = /^https:\/\/script\.google\.com\/macros\//;
ok('accepts /macros/…/exec URL', urlRe.test('https://script.google.com/macros/s/AKfycb.../exec'));
ok('rejects a random site', !urlRe.test('https://evil.example.com/exec'));
ok('rejects the sheet URL itself (common paste mistake)', !urlRe.test('https://docs.google.com/spreadsheets/d/abc/edit'));

// ── 10. Wiring survival: poll timer, reconcile hook, board on the console handle.
ok('poll timer registered in start()', /pollHitCalls\(\); \}, 5_000\)/.test(src));
ok('paintHitCalls runs from reconcile', /sortAll\(\);\s*\n\s*paintHitCalls\(\);/.test(src));
ok('openCallBoard exposed on OCM_WT handle', /onlineState, reconcile, openCallBoard, pollHitCalls,/.test(src));
ok('@connect covers Apps Script redirect host', /@connect\s+script\.googleusercontent\.com/.test(src));

// ── 11. v5.1.1 hardening: exclusive locks, visible state, class re-assertion.
ok('queue affordance removed — calls are exclusive', !/wt-call-queue/.test(src));
ok('called rows tinted in Torn\'s own list', /li\.wt-called \{/.test(src) && /li\.wt-called-mine \{/.test(src));
ok('call button first in the attack cell (survives overflow)', /\.wt-call \{\s*\n\s*flex: 0 0 auto; order: -1;/.test(src));
// The POINT of this assertion is ordering: the host class must be re-applied
// before the signature guard can `continue`, or a Torn re-render that strips it
// is never repaired. It used to demand the two lines be adjacent, which broke
// the moment v5.1.2 inserted the live age-line refresh between them — so assert
// the ordering (and that the guard still exists), not the adjacency.
ok('host class re-asserted OUTSIDE the signature guard',
   /host\.classList\.add\('wt-callout-host'\);[\s\S]{0,600}?const sig =[\s\S]{0,300}?if \(li\.dataset\.wtCallsig === sig/.test(src));
ok('paint uses the alive-filtered queue', /const q = hcActiveQueue\(pid\);/.test(src));
ok('stale own call auto-releases on the sheet', /_hcAutoReleased\.add\(k\);\s*\n\s*sendHitEvent\('release'/.test(src));
ok('floating board button with live count', /wt-board-btn/.test(src) && /wt-board-count/.test(src));

// ── 12. Member mode (v5.1.1): shell hidden, duplicate seats collapsed.
ok('member mode hides the whole leader shell', /#ocm-root\.ocm-member-mode \.ocm-tab-pane \{ display: none !important; \}/.test(src));
ok('member mode class added on render, removed for leader', /classList\.add\('ocm-member-mode'\)/.test(src) && /classList\.remove\('ocm-member-mode'\)/.test(src));
ok('identical open seats collapse into one card', /_count\+\+/.test(src) && /×' \+ s\._count \+ ' open/.test(src));
