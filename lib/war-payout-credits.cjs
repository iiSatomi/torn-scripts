'use strict';

// Locked payout facts only. Native-page adapters own all request details.
const WarPayoutCredits = (() => {
  const KEY = 'twpc-credit-ledger-v1';
  const MAX_RUNS = 10, MAX_MEMBERS = 1000;
  const categories = ['hits', 'losses', 'assists', 'stalemates', 'defends'];
  const statuses = new Set(['pending', 'crediting', 'credited', 'needs-review', 'skipped']);
  const copy = value => JSON.parse(JSON.stringify(value));
  const fail = message => { throw new Error(message); };
  function integer(value, positive = false) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < (positive ? 1 : 0)) fail('Invalid payout record.');
    return value;
  }
  function cleanScope(input) {
    if (!input || typeof input !== 'object') fail('Invalid war scope.');
    const scope = Object.fromEntries(['warId', 'factionId', 'opponentId', 'start', 'end'].map(key => [key, integer(input[key], !['start', 'end'].includes(key))]));
    if (scope.factionId === scope.opponentId || !scope.end || scope.end < scope.start) fail('Invalid war scope.');
    return scope;
  }
  const runKey = scope => `${scope.factionId}:${scope.warId}`;
  const sameScope = (a, b) => ['warId', 'factionId', 'opponentId', 'start', 'end'].every(key => a[key] === b[key]);
  function cleanResult(input) {
    if (!input || typeof input !== 'object') fail('Invalid payout totals.');
    const result = Object.fromEntries(['profit', 'cut', 'pool', 'total'].map(key => [key, integer(input[key])]));
    if (result.total > result.pool) fail('Payouts exceed the player pool. Add funding or lower rates.');
    result.leftover = integer(input.leftover);
    if (result.cut > result.profit || result.pool !== result.profit - result.cut || result.leftover !== result.pool - result.total) fail('Invalid payout budget.');
    const rates = input.rates ?? {};
    if (typeof rates !== 'object' || !rates || Array.isArray(rates)) fail('Invalid payout rates.');
    result.rates = Object.fromEntries(categories.map(key => [key, integer(rates[key] ?? 0)]));
    return result;
  }
  function cleanEntries(rows, fromDraft) {
    if (!Array.isArray(rows) || rows.length > MAX_MEMBERS) fail('Payout member limit or record is invalid.');
    const seen = new Set();
    return rows.map(row => {
      const id = integer(row?.id, true), amount = integer(fromDraft ? row.payout : row.amount);
      if (seen.has(id)) fail('Duplicate payout member.');
      seen.add(id);
      const status = fromDraft ? (amount ? 'pending' : 'skipped') : row.status;
      if (!statuses.has(status) || (!amount && status !== 'skipped')) fail('Invalid payout status.');
      const name = typeof row.name === 'string' ? row.name.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 100) : `Player ${id}`;
      return {id, name: name || `Player ${id}`, amount, status, ...Object.fromEntries(categories.map(key => [key, integer(row[key] ?? 0)]))};
    });
  }
  function checkSum(entries, total) {
    const sum = entries.reduce((value, entry) => value + BigInt(entry.amount), 0n);
    if (sum !== BigInt(total)) fail('Member amounts do not match payout total.');
  }
  function cleanRun(input) {
    const scope = cleanScope(input?.scope), result = cleanResult(input?.result), entries = cleanEntries(input?.entries, false);
    if (input.mode !== 'actual' || input.coverage !== 'unverified') fail('Invalid locked payout record.');
    checkSum(entries, result.total);
    return {scope, version: integer(input.version, true), mode: 'actual', coverage: 'unverified', result, entries};
  }
  function cleanLedger(input) {
    if (input === null || input === undefined) return {version: 1, records: []};
    if (!input || input.version !== 1 || !Array.isArray(input.records) || input.records.length > MAX_RUNS) fail('Saved payout ledger needs review.');
    const records = input.records.map(cleanRun), seen = new Set();
    for (const record of records) {
      const key = runKey(record.scope);
      if (seen.has(key)) fail('Saved payout ledger needs review.');
      seen.add(key);
    }
    return {version: 1, records};
  }
  function createStore(env = {}) {
    const native = env.PDA_storage;
    const legacyGet = typeof env.GM_getValue === 'function' ? env.GM_getValue.bind(env)
      : typeof env.GM?.getValue === 'function' ? env.GM.getValue.bind(env.GM) : null;
    const usesNative = typeof native?.get === 'function' && typeof native?.set === 'function';
    let get, set;
    if (usesNative) {
      get = native.get.bind(native); set = native.set.bind(native);
    } else if (typeof env.GM_getValue === 'function' && typeof env.GM_setValue === 'function') {
      get = env.GM_getValue.bind(env); set = env.GM_setValue.bind(env);
    } else if (typeof env.GM?.getValue === 'function' && typeof env.GM?.setValue === 'function') {
      get = env.GM.getValue.bind(env.GM); set = env.GM.setValue.bind(env.GM);
    }
    return {
      async load() {
        try {
          if (!get) fail('Storage unavailable.');
          let value = await get(KEY, null);
          if ((value === null || value === undefined) && usesNative && legacyGet) {
            value = await legacyGet(KEY, null);
            if (value !== null && value !== undefined) {
              const migrated = cleanLedger(typeof value === 'string' ? JSON.parse(value) : value);
              await set(KEY, JSON.stringify(migrated));
              return migrated;
            }
          }
          if (value === null || value === undefined) return null;
          return cleanLedger(typeof value === 'string' ? JSON.parse(value) : value);
        } catch (_) { fail('Saved payout ledger could not be read. Crediting is disabled.'); }
      },
      async save(records) {
        try {
          if (!set) fail('Storage unavailable.');
          await set(KEY, JSON.stringify(cleanLedger(records)));
        } catch (_) { fail('Payout ledger could not be saved.'); }
      }
    };
  }
  function createController({store, onChange = () => {}, now = Date.now} = {}) {
    let ledger = {version: 1, records: []}, activeKey = null, ready = false, busy = false, attempt = null;
    // Serialize lifecycle writes with the pre-submit write. A late save cannot
    // overwrite stop's needs-review status with an older crediting snapshot.
    let writes = Promise.resolve();
    let mutationDrain = Promise.resolve();
    const active = () => ledger.records.find(record => runKey(record.scope) === activeKey) || null;
    const blocked = () => ledger.records.some(record => record.entries.some(entry => entry.status === 'needs-review' || entry.status === 'crediting'));
    function snapshot() {
      const run = active();
      if (!run) return null;
      return {...copy(run), busy, blocked: blocked(), nextMemberId: run.entries.find(entry => entry.status === 'pending' && entry.amount > 0)?.id ?? null};
    }
    function listRuns() {
      return ledger.records.map(run => ({key: runKey(run.scope), scope: copy(run.scope), version: run.version,
        total: run.result.total, blocked: run.entries.some(entry => entry.status === 'needs-review' || entry.status === 'crediting')}));
    }
    function select(key) {
      guard();
      if (typeof key !== 'string' || !ledger.records.some(run => runKey(run.scope) === key)) fail('Select a saved payout run.');
      activeKey = key;
      emit();
      return snapshot();
    }
    function emit() { try { onChange(snapshot()); } catch (_) { /* Consumer rendering cannot dispatch another operation. */ } }
    function persist() {
      const value = copy(ledger);
      const saved = writes.then(() => store.save(value));
      writes = saved.catch(() => {});
      return saved.catch(() => fail('Payout ledger could not be saved.'));
    }
    function guard() {
      if (!ready) fail('Payout ledger is unavailable.');
      if (busy) fail('A payout operation is already in progress.');
    }
    function beginMutation() {
      busy = true;
      let finish;
      mutationDrain = new Promise(resolve => { finish = resolve; });
      return finish;
    }
    async function mutate(change) {
      guard();
      const finish = beginMutation();
      const previous = copy(ledger), previousKey = activeKey;
      try { change(); emit(); await persist(); busy = false; return snapshot(); }
      catch (error) { ledger = previous; activeKey = previousKey; throw error; }
      finally { busy = false; emit(); finish(); }
    }
    async function init() {
      if (ready) return snapshot();
      if (busy) fail('A payout operation is already in progress.');
      const finish = beginMutation();
      try {
        ledger = cleanLedger(await store.load());
        activeKey = ledger.records.length ? runKey(ledger.records[ledger.records.length - 1].scope) : null;
        let recovered = false;
        for (const run of ledger.records) for (const entry of run.entries) if (entry.status === 'crediting') {entry.status = 'needs-review'; recovered = true;}
        if (recovered) await persist();
        ready = true;
        busy = false;
        return snapshot();
      } catch (_) { ready = false; fail('Saved payout ledger could not be loaded. Crediting is disabled.'); }
      finally { busy = false; emit(); finish(); }
    }
    async function lock(draft) {
      return mutate(() => {
        if (!draft || draft.live !== false || draft.mode !== 'actual' || draft.coverage !== 'unverified') fail('Review an ended actual-profit payout first.');
        const scope = cleanScope(draft.scope);
        if (scope.end > Math.floor(now() / 1000)) fail('The selected war has not ended.');
        const result = cleanResult(draft.result), entries = cleanEntries(draft.result.rows, true);
        checkSum(entries, result.total);
        entries.sort((a, b) => b.amount - a.amount || a.id - b.id);
        const key = runKey(scope), old = ledger.records.find(run => runKey(run.scope) === key);
        if (blocked() && !old) fail('Reconcile the uncertain payout before changing runs.');
        let version = 1;
        if (old) {
          if (!sameScope(scope, old.scope)) fail('The locked war scope cannot change.');
          const changed = old.entries.length !== entries.length || old.entries.some(prior => !entries.some(entry => entry.id === prior.id && entry.amount === prior.amount));
          for (const prior of old.entries) {
            const entry = entries.find(item => item.id === prior.id);
            if (!entry || ((prior.status === 'credited' || prior.status === 'needs-review' || prior.status === 'crediting') && entry.amount !== prior.amount)) fail('Existing payout records must be preserved.');
            if (blocked() && changed) fail('Reconcile uncertain payouts before revising amounts.');
            if (entry.amount === prior.amount) Object.assign(entry, copy(prior));
            else entry.status = entry.amount === 0 ? 'skipped' : prior.status;
          }
          version = old.version + (changed ? 1 : 0);
          if (!Number.isSafeInteger(version)) fail('Payout revision limit reached.');
          // Identical amounts resume the frozen order rather than re-sorting it.
          if (!changed) {
            entries.sort((a, b) => old.entries.findIndex(e => e.id === a.id) - old.entries.findIndex(e => e.id === b.id));
            Object.assign(result, copy(old.result));
          }
        } else if (ledger.records.length >= MAX_RUNS) {
          fail('Payout run limit reached. Existing receipts must be retained.');
        }
        const run = {scope, version, mode: 'actual', coverage: 'unverified', result, entries};
        if (old) ledger.records[ledger.records.indexOf(old)] = run;
        else ledger.records.push(run);
        activeKey = key;
      });
    }
    function getEntry(memberId) {
      integer(memberId, true);
      const entry = active()?.entries.find(item => item.id === memberId);
      if (!entry) fail('Select a locked payout member.');
      return entry;
    }
    function available(action) {
      try { return action?.trusted === true && typeof action.available === 'function' && action.available() === true && typeof action.submit === 'function'; }
      catch (_) { return false; }
    }
    async function performCredit(memberId, action) {
      guard();
      if (blocked()) fail('Reconcile uncertain payouts before crediting.');
      const entry = getEntry(memberId);
      if (entry.status !== 'pending' || !entry.amount || !available(action)) fail('This payout action is unavailable.');
      busy = true;
      const current = {entry, cancelled: false, submitted: false, stopped: null};
      attempt = current; entry.status = 'crediting'; emit();
      try {
        try { await persist(); }
        catch (error) { if (!current.cancelled) entry.status = 'pending'; throw error; }
        if (current.cancelled) { await current.stopped; return snapshot(); }
        if (!available(action)) {
          entry.status = 'pending';
          await persist();
          fail('The native payout action is no longer available.');
        }
        current.submitted = true;
        let outcome;
        try { outcome = await action.submit({memberId: entry.id, amount: entry.amount, scope: copy(active().scope)}); }
        catch (_) { outcome = {status: 'unknown'}; }
        if (current.cancelled) { await current.stopped; return snapshot(); }
        entry.status = outcome?.status === 'confirmed' ? 'credited' : outcome?.status === 'rejected' ? 'pending' : 'needs-review';
        try { await persist(); }
        catch (error) { entry.status = 'needs-review'; throw error; }
        return snapshot();
      } finally { if (attempt === current) attempt = null; busy = false; emit(); }
    }
    function credit(memberId, action) {
      return performCredit(memberId, action).then(() => snapshot());
    }
    async function skip(memberId) {
      return mutate(() => {const entry = getEntry(memberId); if (entry.status !== 'pending') fail('Only pending payouts can be skipped.'); entry.status = 'skipped';});
    }
    async function reconcile(memberId, outcome) {
      return mutate(() => {
        const entry = getEntry(memberId);
        if (entry.status !== 'needs-review' || !['credited', 'pending'].includes(outcome?.status)) fail('Choose a valid manual reconciliation.');
        entry.status = outcome.status;
      });
    }
    function stop() {
      if (!attempt || attempt.cancelled) {
        // The owner lock covers local mutations as well as native requests.
        // Release it only after skip/reconcile/lock/init writes have finished.
        return attempt?.stopped || mutationDrain.then(() => writes).then(() => snapshot());
      }
      attempt.cancelled = true; attempt.entry.status = 'needs-review'; emit();
      attempt.stopped = persist().then(() => snapshot());
      // Lifecycle callers may discard the Promise; preserve blocked state even
      // when native storage is unavailable and avoid an unhandled rejection.
      attempt.stopped.catch(() => {});
      return attempt.stopped;
    }
    return {init, lock, snapshot, listRuns, select, credit, skip, reconcile, stop};
  }
  return {createStore, createController};
})();

module.exports = {WarPayoutCredits};
