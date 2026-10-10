/**
 * v6 CORE — the data layer the UI sits on.
 *
 * Written standalone so it can be tested without Torn, Tampermonkey or a
 * browser, then pasted into the userscript as one section. No build step, no
 * imports — same constraint the shipping script has always had.
 *
 * WHY THIS EXISTS
 * Not line count — a v5 sync is only ~20 lines. The problem is that each one
 * re-implements the SAME four concerns (cursor walking, status capture,
 * merge semantics, pacing) privately, so they drift and nothing catches it.
 *
 * The concrete evidence: `syncDepositFunds` walks up to five pages
 * back-to-back, and `apiFetch` contains no pacing at all — so that loop can
 * fire five calls as fast as the network allows. `backfillOcHistory` is
 * carefully paced at ~66/min. Both are correct in isolation and inconsistent
 * with each other, which is exactly what happens when the rule lives in
 * every caller instead of in one place.
 *
 * Here a source is a DECLARATION. defineStore() supplies the fetching,
 * pacing, cursor walking, error capture and persistence; a store says only
 * what is true of itself. A store cannot forget to pace itself, because it
 * never writes any pacing — the budget is a property of the shared client.
 *
 * WHAT IS PRESERVED FROM v5 — these were learned by shipping bugs, and no
 * amount of restructuring makes them untrue:
 *
 *  · The Torn rate limit is 100 calls/minute PER USER, shared with every
 *    other script they run. Not per key. Racing it breaks other scripts.
 *  · Cursor walks go ASCENDING from a seed page. `from=cursor&sort=DESC`
 *    permanently skipped events whenever >100 landed between refreshes —
 *    they fell off the end of page 1 and were never requested again.
 *  · A failed sync writes its reason to a *_STATUS key and the pane degrades
 *    to an honest note. A blank pane that means "no API access" is
 *    indistinguishable from one that means "you have no members".
 *  · Storage is a hard quota. A write that throws must not take the app with
 *    it, and the archives must never be clobbered by a partial result.
 */

/* ═══════════════════════════════════════════════════════════════════════════
   PLATFORM — the two things everything else sits on
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Storage. Wraps GM_getValue/GM_setValue with JSON and total failure
 * tolerance. In the real script `back` is GM storage; in tests it is a Map.
 *
 * Every method swallows. Storage can throw outright — a full quota, a
 * TornPDA webview with storage disabled, Firefox private mode — and a
 * settings read is never a good enough reason to stop the UI from drawing.
 */
function createStorage(back) {
  return {
    get(key, dflt) {
      try {
        const raw = back.get(key);
        return raw === undefined || raw === null ? dflt : JSON.parse(raw);
      } catch { return dflt; }
    },
    /** @returns {boolean} false if the write was rejected — callers that are
     *  about to drop data on the floor need to know, even if most don't. */
    set(key, value) {
      try { back.set(key, JSON.stringify(value)); return true; }
      catch { return false; }
    },
    raw: back,
  };
}

/**
 * API client. One queue for the whole app, because the limit is per user.
 *
 * Every call in the process goes through here, so the pacing is a property
 * of the client rather than of each caller remembering to be polite. v5's
 * backfill was correctly paced and its live syncs were not; that asymmetry
 * is not expressible here.
 *
 * @param {object} o
 * @param {(url:string)=>Promise<any>} o.transport  does the actual request
 * @param {number} [o.perMinute=60]  budget. Deliberately below Torn's 100 —
 *        the user runs other scripts against the same allowance, and being
 *        the script that starves the others is its own kind of bug.
 * @param {()=>number} [o.now]  injectable clock, so tests need no timers
 */
function createApi({ transport, perMinute = 60, now = Date.now, sleep }) {
  const minGapMs = Math.ceil(60000 / perMinute);
  let chain = Promise.resolve();
  let lastAt = 0;
  const wait = sleep || (ms => new Promise(r => setTimeout(r, ms)));

  /**
   * @param {string} url
   * @param {object} [opt]
   * @param {number} [opt.retries=3]  transient failures only; a 403 is not
   *        transient and retrying it just spends the budget twice.
   */
  function call(url, opt = {}) {
    const run = async () => {
      const gap = minGapMs - (now() - lastAt);
      if (gap > 0) await wait(gap);
      lastAt = now();

      let lastErr;
      for (let attempt = 0; attempt <= (opt.retries ?? 3); attempt++) {
        try {
          const res = await transport(url);
          // Torn reports its own errors in a 200 body. `code` 5 is the rate
          // limit; anything else is ours to surface, not to retry blindly.
          if (res && res.error) {
            const err = new Error(res.error.error || 'API error');
            err.code = res.error.code;
            err.permanent = res.error.code !== 5;
            throw err;
          }
          return res;
        } catch (e) {
          lastErr = e;
          if (e.permanent) throw e;
          if (attempt < (opt.retries ?? 3)) await wait(minGapMs * (attempt + 1));
        }
      }
      throw lastErr;
    };
    // Serialised: the queue IS the rate limiter. Parallel calls would each
    // see the same lastAt and all fire at once.
    chain = chain.then(run, run);
    return chain;
  }

  return { call, get minGapMs() { return minGapMs; } };
}

/* ═══════════════════════════════════════════════════════════════════════════
   STORE — a data source, declared
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * @typedef {object} StoreSpec
 * @property {string} key          storage key. MUST match v5's `ocs_*` name
 *                                 wherever one exists — the archives are not
 *                                 re-fetchable and a renamed key orphans them.
 * @property {string} [statusKey]  where 'ok' | last error string is written.
 * @property {number} [ttl]        seconds before sync() will refetch.
 * @property {'blob'|'byId'} [mode='blob']
 *        blob  — replace wholesale (caches: gear, enemy roster)
 *        byId  — merge into a keyed map (ledgers: attacks, news, archives)
 * @property {(api, ctx) => Promise<any>} fetch
 *        Returns the new data. For byId, an object keyed by id; the merge is
 *        done here, so a fetch is never able to clobber the archive.
 * @property {any} [seed={}]
 */

/**
 * Everything a data source needs, in one declaration.
 *
 * What you DON'T write, and therefore cannot get wrong: pacing, retry,
 * cursor persistence, status capture, merge-not-clobber, quota tolerance.
 */
function defineStore(spec, { storage, api, now = () => Math.floor(Date.now() / 1000) }) {
  const { key, statusKey, ttl = 0, mode = 'blob', seed = {} } = spec;

  /* Cursor and timestamp keys are DECLARED, not derived from `key`. v5 named
     them by hand and they do not follow a pattern: ocs_attack_ledger's cursor
     is ocs_attack_cursor, and ocs_payout_events' is ocs_payout_news_cursor.
     Deriving `key + '_cursor'` would silently start from a fresh cursor —
     no data loss, since byId merges, but every cursor-walked store would
     re-walk its whole history on first run and spend the rate limit doing it.
     The defaults are only for stores v5 never had. */
  const atKey     = spec.atKey     || key + '_at';
  const cursorKey = spec.cursorKey || key + '_cursor';

  const load = () => storage.get(key, seed);
  const syncedAt = () => storage.get(atKey, 0);
  const status = () => (statusKey ? storage.get(statusKey, 'ok') : 'ok');
  const stale = () => !ttl || now() - syncedAt() >= ttl;

  /**
   * The state the UI renders from. This is the shape bound() consumes, and
   * the reason a pane can never come out blank: there is no path through
   * here that returns nothing without also saying why.
   */
  function state() {
    const st = status();
    if (st !== 'ok') return { state: 'error', why: String(st), data: null, syncedAt: syncedAt() };
    const data = load();
    const isEmpty = Array.isArray(data) ? !data.length : !Object.keys(data || {}).length;
    // Empty AND never synced is "still loading", not "genuinely nothing".
    // Conflating them is how a cold start looks like an empty faction.
    if (isEmpty && !syncedAt()) return { state: 'loading', data: null, syncedAt: 0 };
    return { state: isEmpty ? 'empty' : 'ok', data, syncedAt: syncedAt() };
  }

  async function sync(ctx = {}, { force = false } = {}) {
    if (!force && !stale()) return { skipped: true };
    try {
      const fresh = await spec.fetch(api, { ...ctx, cursor: storage.get(cursorKey, null) });
      if (fresh && fresh.cursor !== undefined) storage.set(cursorKey, fresh.cursor);
      const payload = fresh && fresh.data !== undefined ? fresh.data : fresh;

      if (mode === 'byId') {
        // Merge, never replace. A partial page must not erase history that
        // cannot be re-fetched.
        const merged = { ...load(), ...(payload || {}) };
        if (!storage.set(key, merged)) throw new Error('storage full — kept the previous data');
      } else {
        if (!storage.set(key, payload)) throw new Error('storage full — kept the previous data');
      }

      storage.set(atKey, now());
      if (statusKey) storage.set(statusKey, 'ok');
      return { ok: true };
    } catch (e) {
      // The reason is the whole point. "error" helps nobody; "needs faction
      // API access (AA)" tells the user what to actually go and fix.
      if (statusKey) storage.set(statusKey, String((e && e.message) || e));
      return { ok: false, why: String((e && e.message) || e) };
    }
  }

  return { key, load, save: v => storage.set(key, v), state, sync, stale, syncedAt, status };
}

/**
 * Walk a paginated endpoint forward from a cursor.
 *
 * ASCENDING, always. v5 learned this the hard way: fetching
 * `from=cursor&sort=DESC` returns the NEWEST hundred, so when more than a
 * hundred events landed between two refreshes the middle ones fell off the
 * end of page one and were never requested again. Ascending from the last
 * id we actually stored cannot skip, because the cursor only advances over
 * records we have.
 *
 * @param {(cursor:any) => Promise<{items:object, next:any}>} page
 * @param {number} [maxPages=20]  a stop, so a bad `next` cannot spin forever
 */
async function walkForward(page, cursor, maxPages = 20) {
  const items = {};
  let next = cursor;
  for (let i = 0; i < maxPages; i++) {
    const res = await page(next);
    const batch = res?.items || {};
    const ids = Object.keys(batch);
    if (!ids.length) break;
    Object.assign(items, batch);
    if (res.next === undefined || res.next === null || res.next === next) break;
    next = res.next;
  }
  return { data: items, cursor: next };
}

/* ═══════════════════════════════════════════════════════════════════════════
   REGISTRY — stores declared, not hand-written

   Adding a data source is one entry. Compare with v5, where it was a new
   ~150-line function that had to remember the pacing, the cursor direction,
   the status key and the merge semantics on its own.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Every key below is v5's ACTUAL key, verified against the userscript's GMK
 * block by core.test.js. This is the part of the rewrite where a typo is
 * expensive: OC_ARCHIVE and CPR_ARCHIVE reach further back than Torn's API
 * does, and backfillOcHistory cannot recover OCs that have aged out. A
 * mistyped key does not error — it silently starts from empty.
 *
 * `mode` is chosen by what the data IS, not by preference:
 *   blob  — a cache, meaningful only as a whole, safe to replace
 *   byId  — a ledger or archive, where a partial page must merge
 *
 * @returns {Record<string, ReturnType<defineStore>>}
 */
function createStores(env) {
  const def = spec => defineStore(spec, env);

  /** News-log walker. Five of v5's syncs are this same shape; it was written
   *  out five times there, which is how they came to differ. */
  const newsWalk = (cat, parse) => (api, ctx) => walkForward(async cursor => {
    const q = cursor ? `&from=${cursor}` : '';
    const res = await api.call(
      `/faction/news?cat=${cat}&striptags=false&limit=100&sort=ASC${q}`);
    const items = {};
    let next = cursor;
    for (const [id, n] of Object.entries(res?.news || {})) {
      const row = parse(n, id);
      if (row) items[id] = row;
      if (!next || n.timestamp > next) next = n.timestamp;
    }
    return { items, next };
  }, ctx.cursor);

  return {
    /* ── Crimes ─────────────────────────────────────────────────────────── */

    /* The permanent OC record, backfilled past Torn's ~100-OC window. The
       single most valuable thing in storage — it cannot be rebuilt. */
    ocArchive: def({
      key: 'ocs_oc_archive', atKey: 'ocs_oc_backfill_auto_at',
      mode: 'byId', ttl: 604800,          // weekly, per v5's maybeAutoBackfill
      fetch: async api => (await api.call('/faction/crimes?cat=completed'))?.crimes || {},
    }),

    /* Per-(member, OC, role), most recent only — deliberately, so it does not
       bloat with repeat runs. That is also why it CANNOT answer "how many
       runs" or "recent form"; those need ocArchive. */
    cprArchive: def({
      key: 'ocs_cpr_archive', mode: 'byId',
      fetch: async () => ({}),            // written by the derive pass, not fetched
    }),

    /* Per-OC profit snapshot: {name, money, itemValue, respect, cost, …}.
       Money's table rows are aggregates OVER this, never stored themselves. */
    profitLedger: def({
      key: 'ocs_profit_ledger', mode: 'byId',
      fetch: async () => ({}),            // recorded as OCs are seen
    }),

    /* Leader-set flag only: { [ocId]: {paid, ts} }. Nothing per-member. */
    payoutLedger: def({
      key: 'ocs_payout_ledger', mode: 'byId',
      fetch: async () => ({}),            // set by the user, never fetched
    }),

    /* ── Money movement ─────────────────────────────────────────────────── */

    /* Give-funds transfers. Torn does NOT record which OC a give paid for —
       the OC↔give link is inference, and must stay labelled as such. */
    payoutEvents: def({
      key: 'ocs_payout_events', cursorKey: 'ocs_payout_news_cursor',
      statusKey: 'ocs_payout_news_status', ttl: 120, mode: 'byId',
      fetch: newsWalk('giveFunds', n => ({ ts: n.timestamp, text: n.text })),
    }),

    deposits: def({
      key: 'ocs_deposit_events', cursorKey: 'ocs_deposit_cursor',
      statusKey: 'ocs_deposit_status', ttl: 300, mode: 'byId',
      fetch: newsWalk('depositFunds', n => ({ ts: n.timestamp, text: n.text })),
    }),

    /* ── Armoury ────────────────────────────────────────────────────────── */

    /* OC items live under `utilities`. NOT `armory` — that selection does not
       exist — and NOT `temporary`, which is grenades and flashbangs. */
    gear: def({
      key: 'ocs_gear_cache', statusKey: 'ocs_gear_status',
      ttl: 300, mode: 'blob', seed: { at: 0, items: [] },
      fetch: async api => ({
        at: Math.floor(Date.now() / 1000),
        items: (await api.call('/faction?selections=utilities'))?.utilities || [],
      }),
    }),

    loans: def({
      key: 'ocs_loan_ledger', cursorKey: 'ocs_loan_cursor',
      statusKey: 'ocs_loan_status', ttl: 300, mode: 'byId',
      fetch: newsWalk('armoryAction', n => ({ ts: n.timestamp, text: n.text })),
    }),

    /* ── War ────────────────────────────────────────────────────────────── */

    wars: def({
      key: 'ocs_war_archive', atKey: 'ocs_war_sync_at',
      statusKey: 'ocs_war_status', ttl: 60, mode: 'byId',
      fetch: async api => (await api.call('/faction/wars'))?.wars || {},
    }),

    chains: def({
      key: 'ocs_chain_archive', atKey: 'ocs_war_sync_at',
      statusKey: 'ocs_chain_status', ttl: 60, mode: 'byId',
      fetch: async api => (await api.call('/faction/chains'))?.chains || {},
    }),

    /* Slimmed to ~120 bytes/row; raw retention is 180 days and the per-war
       archives are the permanent record. Do not widen these rows casually. */
    attacks: def({
      key: 'ocs_attack_ledger', cursorKey: 'ocs_attack_cursor',
      statusKey: 'ocs_attack_status', ttl: 60, mode: 'byId',
      fetch: (api, ctx) => walkForward(async cursor => {
        const res = await api.call(`/faction/attacks?sort=ASC${cursor ? `&from=${cursor}` : ''}`);
        const items = {};
        let next = cursor;
        for (const [id, a] of Object.entries(res?.attacks || {})) {
          items[id] = { t: a.started, a: a.attacker?.id, d: a.defender?.id, r: a.respect_gain };
          if (!next || a.started > next) next = a.started;
        }
        return { items, next };
      }, ctx.cursor),
    }),

    enemy: def({
      key: 'ocs_enemy_cache', statusKey: 'ocs_enemy_status',
      ttl: 30, mode: 'blob', seed: { at: 0, fid: null, members: [] },
      fetch: async (api, ctx) => ({
        at: Math.floor(Date.now() / 1000), fid: ctx.enemyId,
        members: (await api.call(`/faction/${ctx.enemyId}?selections=basic`))?.members || [],
      }),
    }),

    /* FFScouter — third-party ESTIMATES, 24h TTL. Never rendered as measured. */
    spy: def({
      key: 'ocs_spy_cache', statusKey: 'ocs_spy_status',
      ttl: 86400, mode: 'byId',
      fetch: async () => ({}),            // populated per-target on demand
    }),

    /* ── People ─────────────────────────────────────────────────────────── */

    activity: def({
      key: 'ocs_activity_log', atKey: 'ocs_activity_snap_at',
      ttl: 1800, mode: 'byId',            // ≤1 write per 30 min, per v5
      fetch: async api => (await api.call('/faction?selections=basic'))?.members || {},
    }),

    revives: def({
      key: 'ocs_revive_ledger', cursorKey: 'ocs_revive_cursor',
      statusKey: 'ocs_revive_status', ttl: 300, mode: 'byId',
      fetch: (api, ctx) => walkForward(async cursor => {
        const res = await api.call(`/faction/revives?sort=ASC${cursor ? `&from=${cursor}` : ''}`);
        const items = {};
        let next = cursor;
        for (const [id, r] of Object.entries(res?.revives || {})) {
          items[id] = { ts: r.timestamp, by: r.reviver?.id, of: r.target?.id };
          if (!next || r.timestamp > next) next = r.timestamp;
        }
        return { items, next };
      }, ctx.cursor),
    }),

    /* uid → name, forever. The archives store bare ids, so without this the
       UI renders "#3580191" at people, which v5 explicitly forbids. */
    names: def({
      key: 'ocs_member_names', mode: 'byId',
      fetch: async () => ({}),            // filled by resolveUnknownNames
    }),

    /* URLs ONLY, never bytes — an avatar can be a 3.3MB animated GIF, and the
       browser's HTTP cache already holds the image for 31 days. */
    avatars: def({
      key: 'ocs_avatar_cache', atKey: 'ocs_avatar_sync_at',
      ttl: 2592000, mode: 'byId',
      fetch: async () => ({}),            // walked 40/pass by the scheduler
    }),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCHEDULER — what syncs, and when

   The budget is the design constraint. 100 calls/minute is shared with every
   other script the user runs, so the suite's job is to stay well under it
   while still feeling live during a war.

   Two rules carried over from v5, both load-bearing:

    · Related syncs fire as ONE group on one throttle. v5's syncWarData does
      this — five calls together every 60s in a live war, every 5 min
      otherwise. Independently-throttled syncs drift into a steady trickle
      that is harder to reason about and easy to exceed.

    · A poll that nobody is looking at does not run. The chain watcher and
      war room are 30s loops that no-op unless their pane is on screen (or a
      chain is live). Torn caches identical calls for about 30s anyway, so
      polling harder buys nothing at all — it only spends the allowance.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * @param {object} [o]
 * @param {()=>number} [o.now]  seconds. Injectable so a test can simulate an
 *        hour without waiting one.
 */
function createScheduler({ now = () => Math.floor(Date.now() / 1000) } = {}) {
  const tasks = [];
  const lastRun = Object.create(null);

  /**
   * @param {object} spec
   * @param {string} spec.id
   * @param {number|((ctx)=>number)} spec.every    seconds between runs
   * @param {(ctx)=>boolean} [spec.when]           gate; false means skip entirely
   * @param {(ctx)=>Promise<any>} spec.run
   */
  function task(spec) { tasks.push(spec); return self; }

  /** Run whatever is due. Returns the ids that actually fired. */
  async function tick(ctx = {}) {
    const t = now();
    const fired = [];
    for (const task of tasks) {
      if (task.when && !task.when(ctx)) continue;
      const every = typeof task.every === 'function' ? task.every(ctx) : task.every;
      const last = lastRun[task.id];
      if (last !== undefined && t - last < every) continue;
      lastRun[task.id] = t;
      await task.run(ctx);
      fired.push(task.id);
    }
    return fired;
  }

  const self = { task, tick, lastRun, get tasks() { return tasks.slice(); } };
  return self;
}

/**
 * The suite's actual schedule. Grouped by what a user is doing, not by which
 * endpoint the data happens to come from — that is why `war` sub-syncs
 * together rather than each store having its own timer.
 */
function createSchedule(stores, sched = createScheduler()) {
  const sync = (...names) => ctx => Promise.all(names.map(n => stores[n].sync(ctx)));

  return sched
    /* Live war data. One group, one throttle — v5's syncWarData. */
    .task({
      id: 'war',
      every: ctx => (ctx.warLive ? 60 : 300),
      run: sync('wars', 'chains', 'attacks'),
    })

    /* War room. 30s, but ONLY while someone is looking at it or a chain is
       running. This is the single biggest saving in the whole schedule. */
    .task({
      id: 'warRoom',
      every: 30,
      when: ctx => ctx.chainLive || (ctx.page === 'war' && ctx.sub === 'room'),
      run: sync('enemy', 'spy'),
    })

    .task({ id: 'crimes',  every: 60,   run: sync('ocArchive') })
    .task({ id: 'money',   every: 300,  run: sync('payoutEvents', 'deposits') })
    .task({ id: 'armoury', every: 300,  run: sync('gear', 'loans') })

    /* Slow background upkeep. Names and avatars change rarely and the
       activity snapshot is capped at one write per 30 minutes. */
    .task({ id: 'people',  every: 1800, run: sync('activity', 'names') })
    .task({ id: 'avatars', every: 86400, run: sync('avatars') });
}

/* Node (tests) and browser (userscript) both, without a build step. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createStorage, createApi, defineStore, walkForward, createStores,
    createScheduler, createSchedule,
  };
}
