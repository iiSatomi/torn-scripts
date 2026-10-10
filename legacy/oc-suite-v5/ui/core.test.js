/**
 * Tests for the v6 core.
 *
 *   node ui/core.test.js
 *
 * The point of a pure data layer is that this file needs no browser, no
 * jsdom, no network and no timers. Every dependency is injected, so the
 * awkward cases — a full quota, a 403, a burst of 300 events between two
 * refreshes — are ordinary tests rather than things you hope you got right.
 */
const { createStorage, createApi, defineStore, walkForward } = require('./core.js');

let failed = 0;
const ok = (label, cond, detail) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + label);
  if (!cond) { failed++; if (detail) console.log('      ' + detail); }
};
const section = s => console.log('\n' + s);

/** In-memory GM storage. `cap` simulates the quota. */
function memBack({ cap = Infinity, throwOnSet = false } = {}) {
  const m = new Map();
  return {
    get: k => m.get(k),
    set: (k, v) => {
      if (throwOnSet) throw new Error('storage disabled');
      const size = [...m.entries()].reduce((n, [a, b]) => n + a.length + b.length, 0);
      if (size + k.length + v.length > cap) throw new Error('QuotaExceededError');
      m.set(k, v);
    },
    _map: m,
  };
}

/* ── Storage ─────────────────────────────────────────────────────────────── */
section('Storage tolerates a hostile backend');
{
  const s = createStorage(memBack());
  s.set('a', { x: 1 });
  ok('round-trips JSON', s.get('a').x === 1);
  ok('returns the default for a missing key', s.get('nope', 'dflt') === 'dflt');

  const dead = createStorage(memBack({ throwOnSet: true }));
  let threw = false;
  try { dead.set('a', 1); } catch { threw = true; }
  ok('a write that throws does not propagate', !threw);
  ok('…and reports the failure rather than lying', dead.set('a', 1) === false);

  const corrupt = createStorage({ get: () => '{not json', set: () => {} });
  ok('unparseable stored data falls back instead of throwing',
     corrupt.get('a', 'safe') === 'safe');
}

/* ── API pacing ──────────────────────────────────────────────────────────── */
section('API respects the per-USER rate limit');
{
  let clock = 0;
  const sleeps = [];
  const calls = [];
  const api = createApi({
    perMinute: 60,
    now: () => clock,
    sleep: ms => { sleeps.push(ms); clock += ms; return Promise.resolve(); },
    transport: url => { calls.push({ url, at: clock }); return Promise.resolve({ ok: true }); },
  });

  ok('a 60/min budget is one call per second', api.minGapMs === 1000);

  (async () => {
    await Promise.all([api.call('/a'), api.call('/b'), api.call('/c')]);

    ok('three concurrent calls are serialised, not bursted', calls.length === 3);
    const gaps = calls.slice(1).map((c, i) => c.at - calls[i].at);
    ok(`…and spaced by the budget (gaps: ${gaps.join(', ')}ms)`,
       gaps.every(g => g >= api.minGapMs),
       'a burst here would starve every other script the user runs');

    /* ── Retry policy ── */
    section('API retries what is worth retrying, and nothing else');
    let attempts = 0;
    const flaky = createApi({
      perMinute: 6000, now: () => clock, sleep: () => Promise.resolve(),
      transport: () => {
        attempts++;
        return attempts < 3 ? Promise.reject(new Error('network')) : Promise.resolve({ ok: 1 });
      },
    });
    await flaky.call('/x');
    ok(`a transient failure is retried (${attempts} attempts)`, attempts === 3);

    let permAttempts = 0;
    const denied = createApi({
      perMinute: 6000, now: () => clock, sleep: () => Promise.resolve(),
      // Torn reports errors in a 200 body. Code 7 = no permission.
      transport: () => { permAttempts++; return Promise.resolve({ error: { code: 7, error: 'Incorrect ID-entity relation' } }); },
    });
    let msg = '';
    try { await denied.call('/y'); } catch (e) { msg = e.message; }
    ok('a permission error is NOT retried — it would spend the budget twice',
       permAttempts === 1, `attempted ${permAttempts} times`);
    ok('…and its real reason survives to the UI', /Incorrect ID-entity/.test(msg));

    await stores();
  })();
}

/* ── Store ───────────────────────────────────────────────────────────────── */
async function stores() {
  const env = (back, transport) => ({
    storage: createStorage(back),
    api: createApi({ transport, perMinute: 6000, sleep: () => Promise.resolve() }),
    now: () => 1000,
  });

  section('Store distinguishes the three ways of having no data');
  {
    const back = memBack();
    const e = env(back, () => Promise.resolve({ items: [] }));
    const s = defineStore({ key: 'k', statusKey: 'k_status', seed: {},
                            fetch: () => ({}) }, e);

    ok('never synced + empty reads as LOADING, not empty',
       s.state().state === 'loading',
       'a cold start must not look like an empty faction');

    await s.sync();
    ok('synced + empty reads as EMPTY — a real answer', s.state().state === 'empty');

    e.storage.set('k_status', 'needs faction API access (AA)');
    const st = s.state();
    ok('a failed status reads as ERROR', st.state === 'error');
    ok('…carrying the reason, not just a flag', /AA/.test(st.why));
  }

  section('Store never clobbers an archive it cannot re-fetch');
  {
    const back = memBack();
    const e = env(back);
    let page = 1;
    const s = defineStore({
      key: 'arc', mode: 'byId',
      fetch: () => (page === 1 ? { a: 1, b: 2 } : { c: 3 }),
    }, e);

    await s.sync();
    page = 2;
    await s.sync({}, { force: true });
    ok('a later partial page MERGES into history rather than replacing it',
       JSON.stringify(s.load()) === '{"a":1,"b":2,"c":3}',
       'got ' + JSON.stringify(s.load()));
  }

  section('Store survives a full quota without losing what it had');
  {
    const back = memBack({ cap: 120 });
    const e = env(back);
    const s = defineStore({ key: 'big', statusKey: 'big_status', mode: 'byId',
                            fetch: () => ({ a: 'x'.repeat(10) }) }, e);
    await s.sync();
    const kept = s.load();

    const huge = defineStore({ key: 'big', statusKey: 'big_status', mode: 'byId',
                               fetch: () => ({ b: 'y'.repeat(5000) }) }, e);
    const res = await huge.sync({}, { force: true });
    ok('a write too big to store fails loudly', res.ok === false);
    ok('…the previous data is still intact',
       JSON.stringify(s.load()) === JSON.stringify(kept));
    ok('…and the status says why', /storage full/.test(String(e.storage.get('big_status'))));
  }

  section('Store honours its TTL');
  {
    const back = memBack();
    let t = 1000;
    const e = { ...env(back), now: () => t };
    let fetches = 0;
    const s = defineStore({ key: 'ttl', ttl: 300, fetch: () => { fetches++; return { a: 1 }; } }, e);

    await s.sync();
    await s.sync();
    ok('a fresh store does not refetch', fetches === 1);
    t += 301;
    await s.sync();
    ok('a stale store does', fetches === 2);
    await s.sync({}, { force: true });
    ok('force overrides the TTL', fetches === 3);
  }

  /* ── The bug that motivated the whole cursor design ──────────────────── */
  section('Cursor walks cannot skip a burst');
  {
    /* 250 events land between two refreshes. A DESC walk from the cursor
       returns the newest 100 and the middle 150 are never requested again —
       that is the v5 bug. Ascending from the last id we stored cannot skip,
       because the cursor only ever advances over records we actually hold. */
    const all = Array.from({ length: 250 }, (_, i) => ({ id: i + 1, ts: i + 1 }));
    const pageAsc = async cursor => {
      const from = cursor || 0;
      const batch = all.filter(e => e.ts > from).slice(0, 100);
      const items = {};
      for (const e of batch) items[e.id] = e;
      return { items, next: batch.length ? batch[batch.length - 1].ts : from };
    };

    const out = await walkForward(pageAsc, null);
    ok(`all 250 events arrive across pages (got ${Object.keys(out.data).length})`,
       Object.keys(out.data).length === 250);
    const ids = Object.keys(out.data).map(Number).sort((a, b) => a - b);
    const gaps = ids.filter((id, i) => i && id !== ids[i - 1] + 1);
    ok('no id is skipped', !gaps.length, 'skipped before: ' + gaps.join(', '));
    ok('the cursor ends at the newest record', out.cursor === 250);

    const none = await walkForward(pageAsc, 250);
    ok('a walk with nothing new is a no-op', !Object.keys(none.data).length);

    let spins = 0;
    await walkForward(async c => { spins++; return { items: { x: 1 }, next: 'same' }; }, null, 20);
    ok('a stuck cursor stops instead of spinning forever', spins <= 2, `spun ${spins} times`);
  }

  await scheduler();
}

/* ── Scheduler ───────────────────────────────────────────────────────────── */
async function scheduler() {
  const { createScheduler, createSchedule } = require('./core.js');

  section('Scheduler runs what is due, and nothing else');
  {
    let t = 0;
    const s = createScheduler({ now: () => t });
    const hits = [];
    s.task({ id: 'fast', every: 60, run: async () => hits.push(['fast', t]) });
    s.task({ id: 'slow', every: 600, run: async () => hits.push(['slow', t]) });

    await s.tick();
    ok('both run on the first tick', hits.length === 2);
    await s.tick();
    ok('neither runs again immediately', hits.length === 2);
    t += 60;
    ok('only the due one runs', (await s.tick()).join() === 'fast');
    t += 600;
    ok('both run once both are due', (await s.tick()).sort().join() === 'fast,slow');
  }

  section('A poll nobody is watching does not run');
  {
    let t = 0;
    const s = createScheduler({ now: () => t });
    let runs = 0;
    s.task({
      id: 'warRoom', every: 30,
      when: ctx => ctx.chainLive || (ctx.page === 'war' && ctx.sub === 'room'),
      run: async () => { runs++; },
    });

    for (let i = 0; i < 20; i++) { t += 30; await s.tick({ page: 'money' }); }
    ok('ten minutes on another page costs nothing', runs === 0);

    t += 30; await s.tick({ page: 'war', sub: 'room' });
    ok('…but it runs the moment you open it', runs === 1);

    t += 30; await s.tick({ page: 'money', chainLive: true });
    ok('…and during a live chain regardless of page', runs === 2);
  }

  /* The check that keeps the whole design honest. Torn allows 100 calls per
     minute PER USER, shared with every other script they run. This simulates
     an hour of the worst realistic case — a live war, war room open the whole
     time — and counts what the schedule actually spends. */
  section('An hour of the heaviest case stays inside the budget');
  {
    let t = 0;
    let calls = 0;
    const fakeStores = new Proxy({}, {
      get: () => ({ sync: async () => { calls++; } }),
    });
    const s = createSchedule(fakeStores, createScheduler({ now: () => t }));

    const ctx = { warLive: true, chainLive: true, page: 'war', sub: 'room' };
    for (let sec = 0; sec < 3600; sec += 10) { t = sec; await s.tick(ctx); }

    const perMin = calls / 60;
    ok(`${calls} calls in an hour = ${perMin.toFixed(1)}/min, well under 100`,
       perMin < 20, 'the allowance is shared with every other script the user runs');

    /* Idle should be dramatically cheaper, or the gating is not working. */
    let idleCalls = 0;
    let t2 = 0;
    const idleStores = new Proxy({}, { get: () => ({ sync: async () => { idleCalls++; } }) });
    const s2 = createSchedule(idleStores, createScheduler({ now: () => t2 }));
    for (let sec = 0; sec < 3600; sec += 10) { t2 = sec; await s2.tick({ page: 'money' }); }

    ok(`idle costs ${idleCalls} calls/hour vs ${calls} busy`,
       idleCalls < calls / 2,
       'gating is not saving anything — check the `when` predicates');
  }

  await keyContract();
}

/* ── The check that protects the archives ────────────────────────────────── */
async function keyContract() {
  section('Every declared key exists in the live userscript');

  const fs = require('fs'), path = require('path');
  const scriptPath = path.join(__dirname, '..', 'Torn_OC_Suite.user.js');
  if (!fs.existsSync(scriptPath)) {
    ok('userscript found to validate against', false, 'missing: ' + scriptPath);
    return done();
  }

  const src = fs.readFileSync(scriptPath, 'utf8');
  /* Every 'ocs_*' literal in v5, from anywhere — GMK plus the handful defined
     inline. A key we declare that is NOT in this set is either a typo or a
     brand-new key; both need to be deliberate, because a typo does not throw,
     it just silently reads empty and abandons the archive. */
  const live = new Set((src.match(/'(ocs_[a-z0-9_]+)'/g) || []).map(s => s.slice(1, -1)));
  ok(`v5 defines ${live.size} storage keys`, live.size > 40);

  const core = fs.readFileSync(path.join(__dirname, 'core.js'), 'utf8');
  const registry = /function createStores\(env\) \{([\s\S]*?)\n\}/.exec(core)?.[1] || '';
  const declared = [...registry.matchAll(/(key|cursorKey|statusKey|atKey):\s*'(ocs_[a-z0-9_]+)'/g)]
    .map(m => ({ field: m[1], key: m[2] }));

  ok(`core declares ${declared.length} keys across ${
     (registry.match(/^    \w+: def\(\{/gm) || []).length} stores`, declared.length >= 25);

  const unknown = declared.filter(d => !live.has(d.key));
  ok('every declared key matches one v5 already writes', !unknown.length,
     unknown.map(d => `${d.field}: '${d.key}'`).join(' · '));

  /* The reverse direction is informational, not a failure — v5 has keys for
     config, view state and migration that the data layer has no business
     owning. Printed so the gap stays visible rather than forgotten. */
  const dataish = [...live].filter(k =>
    /(archive|ledger|cache|events|log|names)$/.test(k));
  const uncovered = dataish.filter(k => !declared.some(d => d.key === k));
  console.log(`  · ${dataish.length} data-bearing keys in v5, ${
    dataish.length - uncovered.length} declared` +
    (uncovered.length ? `\n    not yet ported: ${uncovered.join(', ')}` : ''));

  /* A store that merges must never be able to replace. Getting `mode` wrong
     on an archive is the one mistake here that destroys data rather than
     just costing API calls. */
  section('Archives are declared byId, never blob');
  for (const name of ['ocArchive', 'cprArchive', 'profitLedger', 'payoutEvents',
                      'deposits', 'attacks', 'wars', 'chains', 'names']) {
    const block = new RegExp(`${name}: def\\(\\{([\\s\\S]*?)\\}\\),`).exec(registry)?.[1] || '';
    ok(`${name.padEnd(13)} merges rather than replaces`, /mode:\s*'byId'/.test(block));
  }

  done();
}

function done() {
  console.log(failed ? `\n${failed} check(s) FAILED\n` : '\nAll core checks passing\n');
  process.exit(failed ? 1 : 0);
}
