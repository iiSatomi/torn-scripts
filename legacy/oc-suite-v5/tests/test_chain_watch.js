// Live war features (v4.2): chain timeout colour thresholds, visibility-gated
// chain polling, enemy roster slimming, FFScouter batch cache with 24h TTL,
// and the War Room sort orders.
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
global.GMK = {
  CHAIN_LIVE_STATUS: 'ocs_chain_live_status', ENEMY_CACHE: 'ocs_enemy_cache',
  ENEMY_STATUS: 'ocs_enemy_status', SPY_CACHE: 'ocs_spy_cache', SPY_STATUS: 'ocs_spy_status',
  FF_KEY: 'ocs_ff_key', WARROOM_VIEW: 'ocs_warroom_view',
  WAR_ARCHIVE: 'ocs_war_archive', MY_FACTION_ID: 'ocs_my_faction_id',
};
// The extracted pollers re-render on completion — stub the renderers.
global.renderChainWatchSection = () => {};
global.renderWarRoomSection = () => {};
// Visibility gate: pretend the pane is closed unless the test opens it.
let paneOpen = false;
global.document = { querySelector: (sel) => (paneOpen ? {} : null) };

for (const [re, name, decl] of [
  [/function chainTimeoutColor\(remain\) \{[\s\S]*?\n  \}/, 'chainTimeoutColor', 'function chainTimeoutColor'],
  [/function chainIsLive\(\) \{[\s\S]*?\n  \}/, 'chainIsLive', 'function chainIsLive'],
  [/async function pollLiveChain\(apiKey, force = false\) \{[\s\S]*?\n  \}/, 'pollLiveChain', 'async function pollLiveChain'],
  [/function loadWarArchive\(\) \{[\s\S]*?\n  \}/, 'loadWarArchive', 'function loadWarArchive'],
  [/function tornList\(raw\) \{[\s\S]*?\n  \}/, 'tornList', 'function tornList'],
  [/function loadEnemyCache\(\) \{[\s\S]*?\n  \}/, 'loadEnemyCache', 'function loadEnemyCache'],
  [/function loadSpyCache\(\) \{[\s\S]*?\n  \}/, 'loadSpyCache', 'function loadSpyCache'],
  [/function saveSpyCache\(c\) \{[\s\S]*?\n  \}/, 'saveSpyCache', 'function saveSpyCache'],
  [/function activeWarOpponent\(\) \{[\s\S]*?\n  \}/, 'activeWarOpponent', 'function activeWarOpponent'],
  [/async function fetchSpyStats\(ids\) \{[\s\S]*?\n  \}/, 'fetchSpyStats', 'async function fetchSpyStats'],
] ) {
  eval(grab(re, name).replace(decl, `${name}=${decl.startsWith('async') ? 'async function' : 'function'}`));
}
// module-level let from the script — recreate for the extracted functions
global._chainLive = null;
global._spyFetchInFlight = false;

console.log('--- 1. timeout colour thresholds ---');
check('>60s calm', chainTimeoutColor(61) === 'var(--ocm-cpr-good)');
check('30–60s amber', chainTimeoutColor(45) === 'var(--ocm-cpr-warn)');
check('<30s red', chainTimeoutColor(29) === 'var(--ocm-cpr-crit)');
check('exactly 60 → amber, exactly 30 → red', chainTimeoutColor(60) === 'var(--ocm-cpr-warn)' && chainTimeoutColor(30) === 'var(--ocm-cpr-crit)');

console.log('--- 2. chainIsLive from cached data + elapsed time ---');
_chainLive = { at: Date.now() - 10e3, current: 50, timeout: 300 };
check('live: 50 hits, 290s left', chainIsLive() === true);
_chainLive = { at: Date.now() - 400e3, current: 50, timeout: 300 };
check('dead: timeout elapsed since fetch', chainIsLive() === false);
_chainLive = { at: Date.now(), current: 0, timeout: 0 };
check('dead: no hits', chainIsLive() === false);

(async () => {
  console.log('--- 3. pollLiveChain is visibility-gated ---');
  let apiCalls = 0;
  global.apiFetch = async () => { apiCalls++; return { chain: { current: 120, max: 250, timeout: 240, cooldown: 0, start: 1, end: 0 } }; };
  _chainLive = null; paneOpen = false;
  check('closed pane + no live chain → no call', (await pollLiveChain('K')) === false && apiCalls === 0, apiCalls);
  check('forced call fetches anyway', (await pollLiveChain('K', true)) === true && apiCalls === 1, apiCalls);
  check('cached state parsed', _chainLive.current === 120 && _chainLive.timeout === 240, _chainLive);
  paneOpen = true;
  check('open pane → polls', (await pollLiveChain('K')) === true && apiCalls === 2, apiCalls);
  paneOpen = false;
  check('closed pane but chain live → still polls', (await pollLiveChain('K')) === true && apiCalls === 3, apiCalls);
  global.apiFetch = async () => { throw new Error('no AA'); };
  check('failure → status recorded, no throw', (await pollLiveChain('K', true)) === false && /no AA/.test(store[GMK.CHAIN_LIVE_STATUS]), store[GMK.CHAIN_LIVE_STATUS]);

  console.log('--- 4. activeWarOpponent from the archive ---');
  const now = Math.floor(Date.now() / 1000);
  store[GMK.MY_FACTION_ID] = '9000';
  store[GMK.WAR_ARCHIVE] = JSON.stringify({
    1: { start: now - 9000, end: now - 5000, factions: [{ id: '9000' }, { id: '5555', name: 'Old' }] },
    2: { start: now - 1000, end: 0, factions: [{ id: '9000' }, { id: '7777', name: 'Them' }] },
  });
  const t = activeWarOpponent();
  check('picks the LIVE war\'s opponent', t?.opp?.id === '7777' && t.opp.name === 'Them', t?.opp);
  store[GMK.WAR_ARCHIVE] = JSON.stringify({ 1: { start: now - 9000, end: now - 5000, factions: [{ id: '9000' }, { id: '5555' }] } });
  check('no live war → null', activeWarOpponent() === null);

  console.log('--- 5. FFScouter batch cache: TTL, no key, failure ---');
  store[GMK.SPY_CACHE] = '{}';
  delete store[GMK.FF_KEY];
  check('no FF key → quiet no-op', (await fetchSpyStats(['1', '2'])) === false);
  store[GMK.FF_KEY] = 'FFKEY';
  let ffCalls = [];
  global.gmFetch = async (url) => {
    ffCalls.push(url);
    const ids = url.match(/targets=([\d,]+)/)[1].split(',');
    return ids.map(id => ({ player_id: Number(id), fair_fight: 2.5, bs_estimate_human: '12m', last_updated: 1751000000 }));
  };
  check('batch fetch stores estimates', (await fetchSpyStats(['1', '2', '3'])) === true, store[GMK.SPY_CACHE]);
  let cache = JSON.parse(store[GMK.SPY_CACHE]);
  check('all three cached with provenance', ['1', '2', '3'].every(id => cache[id]?.src === 'ffs' && cache[id].ff === 2.5), cache);
  check('one batched call, all ids in it', ffCalls.length === 1 && /targets=1,2,3/.test(ffCalls[0]), ffCalls);
  check('fresh cache → no refetch', (await fetchSpyStats(['1', '2', '3'])) === false && ffCalls.length === 1, ffCalls.length);
  cache['2'].ts = Date.now() - 25 * 3600e3;                      // one entry goes stale
  store[GMK.SPY_CACHE] = JSON.stringify(cache);
  await fetchSpyStats(['1', '2', '3']);
  check('only the stale id refetched', ffCalls.length === 2 && /targets=2(&|$)/.test(ffCalls[1]), ffCalls[1]);
  global.gmFetch = async () => { throw new Error('ffs down'); };
  cache['1'].ts = 0; store[GMK.SPY_CACHE] = JSON.stringify(cache);
  check('FFScouter failure → status, no throw', (await fetchSpyStats(['1'])) === false && /ffs down/.test(store[GMK.SPY_STATUS]), store[GMK.SPY_STATUS]);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
