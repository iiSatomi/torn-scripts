/**
 * Runs every suite and fails loudly if any regresses.
 *
 * These exist because `node --check` cannot catch the bugs that actually shipped here:
 * a deleted function, a temporal-dead-zone ReferenceError, and CSS rules silently
 * overridden by duplicates. All parse fine. All break the dashboard.
 */
const { execFileSync } = require('child_process');
const path = require('path');

// [name, file, args, description]
const SUITES = [
  ['render',   'harness.js', ['Torn_OC_Suite.user.js', 'harness_out.json'], 'script renders; no undefined/NaN leaks'],
  ['collapse', 'test_collapse.js',        [], 'sections fold on the FIRST click'],
  ['tabs',     'test_tabs.js',            [], 'every tab + sub-tab switches'],
  ['join',     'test_join.js',            [], 'join button drives the real Torn DOM'],
  ['armory',   'test_armory_rerender.js', [], 'column survives Torn re-rendering the page'],
  ['autofill', 'test_autofill.js',        [], 'loan form autofill'],
  ['exports',  'test_exports.js',         [], '6 datasets x 4 formats'],
  ['backfill', 'test_backfill.js',        [], 'history paginates back; retries, never drops'],
  ['payout',   'test_payout_match.js',    [], 'per-OC split claims; native-paid excluded; cursor walk'],
  ['attacks',  'test_attacks_sync.js',    [], 'attack ledger sync/backfill; war archive; member stats'],
  ['livewar',  'test_chain_watch.js',     [], 'chain watcher gating/colours; war room; spy cache TTL'],
  ['warpay',   'test_warpay.js',          [], 'pot parsing; split math; rounding; official-vs-obs'],
  ['activity', 'test_activity.js',        [], 'snapshot throttle/prune; revive cursor walk'],
  ['loadout',  'test_loadout_parse.js',   [], 'armoury news parse; loadout codes; real items page'],
  ['funds',    'test_funds.js',           [], 'deposit ingestion; details-open survives re-render'],
  ['hitcall',  'test_hitcall.js',         [], 'call queues; expiry; backend script; URL guard'],
  ['profile',  'test_profile.js',         [], 'avatar URL guard; slot shapes; view migration; Crimes merge'],
  // Real-DOM, because `npm run render` structurally cannot cover this: its harness
  // stubs querySelector() to null, so every JS-painted table body is invisible to it.
  ['roster',   'test_roster.js',          [], 'roster paints: avatars, ranks, filters, sort, Crimes expand'],
  ['shell',    'test_shell.js',           [], 'nav rail contract; saved tab respected; dashboard cards + links'],
];

let failed = 0;
for (const [name, file, args, what] of SUITES) {
  process.stdout.write(`  ${name.padEnd(9)} `);
  try {
    const out = execFileSync('node', [path.join(__dirname, file), ...args], {
      cwd: path.join(__dirname, '..'), encoding: 'utf8', stdio: ['ignore','pipe','pipe'],
    });
    const passes = (out.match(/✓/g) || []).length;
    // Judge by explicit failure markers, not by counting ✗ glyphs — some suites PRINT a
    // ✗ line to describe the original bug they're guarding against, which is narrative,
    // not a failure. Exit code 0 + no "FAIL" marker means the suite is green.
    const fails = (out.match(/^\s*✗ /gm) || []).filter(l => !/pre-fix/i.test(l)).length;
    if (fails) { failed++; console.log(`✗ ${fails} FAILED — ${what}`); console.log(out); }
    else console.log(`✓ ${passes} checks — ${what}`);
  } catch (e) {
    failed++;
    console.log(`✗ CRASHED — ${what}`);
    console.log((e.stdout || '') + (e.stderr || ''));
  }
}
console.log(failed ? `\n${failed} suite(s) failing` : '\nAll suites passing');
process.exit(failed ? 1 : 0);
