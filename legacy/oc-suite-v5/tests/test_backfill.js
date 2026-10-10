// Drives backfillOcHistory against a mock API that behaves like Torn's:
// windowed by from/to, sparse history, and one flaky window.
const fs = require('fs');
const src = fs.readFileSync('Torn_OC_Suite.user.js', 'utf8');
const grab = re => { const m = src.match(re); if (!m) throw new Error('missing: ' + re); return m[0]; };

const store = {};
global.GM_getValue = (k, d) => (k in store ? store[k] : d);
global.GM_setValue = (k, v) => { store[k] = v; };
global.GMK = { OC_ARCHIVE: 'ocs_oc_archive', OC_ARCHIVE_META: 'ocs_oc_archive_meta' };
global.ocmToast = () => {};

// Fake history: 300 OCs spread over ~14 months — far beyond a 100-OC API window.
const NOW = Math.floor(Date.now() / 1000);
const history = [];
for (let i = 0; i < 300; i++) {
  const t = NOW - Math.floor(i * 1.4 * 86400);   // ~1 OC every 1.4 days
  history.push({
    id: 900000 + i,
    name: ['Break the Bank', 'Bidding War', 'Market Forces'][i % 3],
    difficulty: 3 + (i % 5),
    status: i % 9 === 0 ? 'Failure' : 'Successful',
    executed_at: t,
    rewards: { money: 1e6 * (i % 40), respect: 50 + (i % 30), items: [],
               payout: i % 4 === 0 ? null : { percentage: 80, paid_at: t + 3600, paid_by: 111 } },
    slots: [{ position_info: { label: 'Robber' }, user: { id: 11 }, checkpoint_pass_rate: 60 + (i % 35) }],
  });
}

let calls = 0, flakyFired = false;
global.apiFetch = async (path) => {
  calls++;
  const from = Number(path.match(/from=(\d+)/)[1]);
  const to   = Number(path.match(/to=(\d+)/)[1]);
  if (!flakyFired && calls === 3) { flakyFired = true; throw new Error('rate limited'); }  // one bad window
  return { crimes: history.filter(o => o.executed_at > from && o.executed_at <= to) };
};

eval(grab(/function loadOcArchive\(\) \{[\s\S]*?\n  \}/).replace('function loadOcArchive', 'loadOcArchive=function'));
eval(grab(/function saveOcArchive\(arc\) \{[\s\S]*?\n  \}/).replace('function saveOcArchive', 'saveOcArchive=function'));
eval(grab(/function slimCrime\(oc\) \{[\s\S]*?\n  \}/).replace('function slimCrime', 'slimCrime=function'));
eval(grab(/async function backfillOcHistory\(apiKey, onProgress\) \{[\s\S]*?\n  \}\n/).replace('async function backfillOcHistory', 'backfillOcHistory=async function'));

(async () => {
  const t0 = Date.now();
  let lastProg = null, sawError = false;
  const arc = await backfillOcHistory('KEY', p => { lastProg = p; if (p.error) sawError = true; });
  const n = Object.keys(arc).length;

  console.log('=== BACKFILL ===');
  console.log('  fake history size      :', history.length, 'OCs over ~14 months');
  console.log('  archived               :', n);
  console.log('  ✓ got everything        :', n === history.length);
  console.log('  API calls              :', calls, `(~${(calls/60*0.9).toFixed(1)}s of pacing)`);
  console.log('  ✓ recovered from a failed window:', sawError && n === history.length);
  console.log('  ✓ pacing under Torn limit (100/min):', (calls / ((Date.now()-t0)/60000)) < 100);

  const one = arc[String(history[0].id)];
  console.log('\n=== ARCHIVED RECORD (slimmed) ===');
  console.log('  bytes each (avg)       :', Math.round(JSON.stringify(arc).length / n));
  console.log('  total stored           :', (JSON.stringify(arc).length/1024).toFixed(0) + 'KB');
  console.log('  ✓ keeps payout          :', !!one.rewards.payout, JSON.stringify(one.rewards.payout));
  console.log('  ✓ keeps CPR             :', one.slots[0].checkpoint_pass_rate);
  console.log('  ✓ keeps status          :', one.status);

  console.log('\n=== COMPLETION RATE (the thing you asked for) ===');
  const all = Object.values(arc);
  const wins = all.filter(o => /success/i.test(o.status)).length;
  console.log(`  ${wins} / ${all.length} succeeded = ${(wins/all.length*100).toFixed(1)}%`);

  console.log('\n=== IDEMPOTENT RE-RUN ===');
  calls = 0;
  const arc2 = await backfillOcHistory('KEY', () => {});
  console.log('  ✓ no duplicates         :', Object.keys(arc2).length === history.length);

  console.log('\n=== payouts recoverable past the API window ===');
  const paid = all.filter(o => o.rewards.payout?.paid_at);
  console.log(`  ${paid.length} OCs with a recorded payout — vs ~100 visible from the live call alone`);
})();
