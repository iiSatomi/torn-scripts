/**
 * Frostbite Faction Usage Tracker — backend
 *
 * The sheet is the system of record. Everything that reads or writes usage data
 * goes through here, and all period maths happens server-side so the numbers are
 * identical whether you look at the dashboard or open the spreadsheet directly.
 *
 * TABS THIS SCRIPT MANAGES (created automatically):
 *   FactionUsage    — current lifetime totals, one row per member
 *   UsageSnapshots  — one row per member per UTC day, the raw history
 *   UsagePeriods    — computed daily / weekly / monthly usage, one row per member
 *   SyncLog         — one line per sync so you can see the tracker is alive
 *
 * SETUP:
 * 1. Create a Google Sheet. Extensions > Apps Script. Paste this whole file in.
 * 2. Project Settings (gear icon) > Script Properties. Add:
 *       WRITE_SECRET = <long random string members use to submit self-reports>
 *       READ_SECRET  = <a DIFFERENT long random string only leadership gets>
 *    Members only ever get WRITE_SECRET, which can do nothing but submit their own
 *    row. READ_SECRET reads data and writes history; leaders only.
 * 3. Deploy > New deployment > type "Web app".
 *       Execute as: Me       Who has access: Anyone
 *    The sheet stays private in your Drive — the web app runs as you, and only
 *    requests carrying a valid secret get anything back.
 * 4. Give members the URL + WRITE_SECRET. Give leaders the URL + READ_SECRET.
 * 5. Re-deploy (Manage deployments > Edit > New version) after every edit to this file.
 *
 * OPTIONAL — UNATTENDED 24/7 TRACKING (recommended):
 *   Without this, data only updates while a leader has the dashboard open. To let
 *   the sheet track by itself:
 *     a. Add two more Script Properties:
 *          TORN_API_KEY = <a Torn API key, public access level is enough>
 *        The faction tracked is whichever one that key's owner belongs to.
 *     b. In the Apps Script editor pick `setupHourlySync` from the function
 *        dropdown and press Run once. Authorise it when prompted.
 *   From then on the sheet pulls the whole faction every hour on its own, and the
 *   dashboard becomes a pure viewer. Check the SyncLog tab to confirm it is running.
 *
 * HOW PERIOD TRACKING WORKS:
 *   Torn only exposes lifetime totals — there is no "xanax this week" field. So we
 *   store a snapshot of everyone's totals each day and subtract. Daily = today minus
 *   yesterday's snapshot, weekly = minus 7 days ago, monthly = minus 30 days ago.
 *   Days are UTC, matching Torn City Time. Nothing shows until there are two days
 *   of history.
 */

/* ================================================================== *
 * Configuration
 * ================================================================== */

const SHEET_CURRENT = 'FactionUsage';
const SHEET_SNAPSHOTS = 'UsageSnapshots';
const SHEET_PERIODS = 'UsagePeriods';
const SHEET_INBOX = 'SelfReportInbox';
const SHEET_LOG = 'SyncLog';

const INBOX_COLUMNS = ['when', 'id', 'name', 'position', 'stats'];

/*
 * type 'counter' — a lifetime total that can only ever go up. Incoming values are
 *                  merged with max(), so a stale or partial read can never lower a
 *                  member's recorded number.
 * type 'level'   — a point-in-time value that legitimately moves both ways. The
 *                  newest non-blank reading wins.
 * api            — whether Torn returns it for OTHER players. Fields marked false
 *                  can only ever arrive from a member's own self-report.
 */
const STAT_FIELDS = [
  { key: 'xantaken',          type: 'counter', api: true },
  { key: 'alcoholused',       type: 'counter', api: true },
  { key: 'drugsused',         type: 'counter', api: true },
  { key: 'refills',           type: 'counter', api: true },
  { key: 'nerverefills',      type: 'counter', api: true },
  { key: 'statenhancersused', type: 'counter', api: true },
  { key: 'networth',          type: 'level',   api: true },
  { key: 'energy',            type: 'level',   api: false }
];

const STAT_KEYS = STAT_FIELDS.map(function (f) { return f.key; });

// Energy is a live bar, not a cumulative counter, so a day-over-day difference of
// it is meaningless. Everything else gets tracked over time.
const TRACKED_FIELDS = STAT_FIELDS.filter(function (f) { return f.key !== 'energy'; });
const TRACKED_KEYS = TRACKED_FIELDS.map(function (f) { return f.key; });

const PERIODS = [
  { prefix: 'd', days: 1 },
  { prefix: 'w', days: 7 },
  { prefix: 'm', days: 30 }
];

const CURRENT_COLUMNS = ['id', 'name', 'position'].concat(STAT_KEYS).concat(['source', 'updated']);
/*
 * 'source' is appended last so an existing sheet written by an earlier version
 * keeps every column where it was; those rows come back with a blank source and
 * are treated as observed, which they are.
 *
 * observed — read live from Torn on the day in question. Always authoritative.
 * backfill — reconstructed after the fact from a timestamped query. Never
 *            overwrites an observed row, and purgeBackfill() can remove every one
 *            of them if the reconstruction turns out to be wrong.
 */
const SNAPSHOT_COLUMNS = ['id', 'name', 'day'].concat(TRACKED_KEYS).concat(['capturedAt', 'source']);

// Which historical points the backfill reconstructs — the three the period columns
// actually need as baselines.
const BACKFILL_DAYS = [1, 7, 30];

/*
 * Torn's "current" personal stats for OTHER players are the previous day's
 * snapshot, not today's. Measured directly: on 2026-07-18 a member's live reading
 * was identical to the timestamped query for 07-17, and only differed from 07-16
 * onward.
 *
 * So a snapshot row we stamp with day D holds Torn's value for D-1. To reconstruct
 * what a sweep on day D would have recorded, the backfill must ask Torn for D-1 —
 * otherwise a row labelled "yesterday" contains today's numbers, every daily delta
 * comes out zero, and every longer window is silently one day short.
 *
 * Observed rows need no correction: they all carry the same one-day lag, so the
 * difference between any two of them spans exactly the right number of days.
 */
const TORN_SNAPSHOT_LAG_DAYS = 1;
const PERIOD_COLUMNS = ['id', 'name', 'position']
  .concat(PERIODS.reduce(function (acc, p) {
    return acc.concat(TRACKED_KEYS.map(function (k) { return p.prefix + '_' + k; }));
  }, []))
  .concat(PERIODS.map(function (p) { return p.prefix + '_window'; }))
  .concat(['anchor', 'updated']);

const SNAPSHOT_RETENTION_DAYS = 120;
const LOG_RETENTION_ROWS = 200;

/*
 * Torn allows 100 calls per minute PER USER — not per key. Every key you own shares
 * one budget, and so does every other script running under your account (TornTools,
 * FF Scouter, anything else).
 *
 * We hold this script to 30/min, well under Torn's ceiling, so the sheet can never
 * be the reason your browser tooling starts erroring. Two mechanisms, deliberately
 * belt-and-braces: a fixed delay that paces the normal case, and a sliding-window
 * limiter that hard-blocks if anything ever tries to burst. The limiter carries
 * across executions, so two runs starting back to back cannot stack.
 *
 * Apps Script caps a single execution at 6 minutes, so bail out before that and let
 * the next run pick up the rest rather than dying mid-write.
 */
const MAX_CALLS_PER_MIN = 30;
const TORN_DELAY_MS = 2000;
const CALL_LOG_KEY = 'CALL_LOG';
const TORN_MAX_MEMBERS_PER_RUN = 300;
const RUN_BUDGET_MS = 4.5 * 60 * 1000;

/*
 * Consumer Google accounts allow 90 minutes of total trigger runtime per day;
 * Workspace accounts get 6 hours.
 *
 * Two separate knobs, because they answer different questions:
 *   SYNC_INTERVAL_MINUTES — how often the sheet gets touched at all
 *   SYNC_CYCLE_MINUTES    — how long before any given member is re-read
 *
 * Each run sweeps only one slice of the roster, so a 15-minute interval on a
 * 60-minute cycle reads a quarter of the faction four times an hour. Every member
 * is still refreshed hourly and the daily call count is unchanged — but the sheet
 * updates four times as often, and the last write before UTC midnight lands within
 * 15 minutes of the boundary instead of an hour, which sharpens the daily numbers.
 * Driving the interval below the cycle costs nothing extra except per-run overhead.
 */
const CONSUMER_TRIGGER_BUDGET_MIN = 90;

/*
 * Torn serves OTHER players' personal stats as a once-a-day snapshot, not live
 * data — you only see your own stats update in real time. So polling hard buys
 * nothing: every read after the first one each day returns identical numbers.
 *
 * Four hours (six runs a day) is not about freshness, it is about resilience. A
 * single failed run cannot cost a whole day of history, and it does not matter
 * exactly when Torn rolls its snapshot over. Six full sweeps of a 100-member
 * faction is ~600 calls and ~10 min/day of trigger budget — noise against the
 * limits, and there is no reason to shave it further.
 */
const DEFAULT_SYNC_INTERVAL_MIN = 240;
const DEFAULT_SYNC_CYCLE_MIN = 240;

// Roughly what one run costs outside the per-member fetches: roster call, the
// merge, the snapshot write and the period recompute.
const RUN_OVERHEAD_SEC = 5;

function prop(name) {
  return PropertiesService.getScriptProperties().getProperty(name);
}

/* ================================================================== *
 * Web endpoints
 * ================================================================== */

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    /*
     * Member self-reports take the cheap path: append one line to an inbox tab and
     * return. No lock, no read-modify-write, no full-sheet rewrite.
     *
     * This matters at faction scale. Every member's script auto-submits every five
     * minutes, so a fifty-person faction produces a submission every six seconds. If
     * each one re-read and rewrote the whole FactionUsage tab under an exclusive
     * lock, they would queue behind each other and start timing out. appendRow is a
     * single cheap operation, so submissions never contend. The next sync drains the
     * inbox and folds it into the merge.
     */
    if (body.action === undefined || body.action === 'report') {
      if (body.secret !== prop('WRITE_SECRET')) return jsonOut({ ok: false, error: 'bad secret' });
      if (!body.id || !body.name) return jsonOut({ ok: false, error: 'missing id/name' });
      appendInbox(body);
      return jsonOut({ ok: true, queued: true });
    }

    if (body.action !== 'sync' && body.action !== 'snapshot') {
      return jsonOut({ ok: false, error: 'unknown action' });
    }

    if (body.secret !== prop('READ_SECRET')) return jsonOut({ ok: false, error: 'bad secret' });
    if (!Array.isArray(body.members)) return jsonOut({ ok: false, error: 'missing members array' });

    // The merge is read-modify-write, so serialise every writer: several leader
    // dashboards and the hourly trigger can all fire at once.
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(60000);
    } catch (_) {
      return jsonOut({ ok: false, error: 'another sync is running, try again shortly' });
    }

    try {
      const result = ingest(body.members, body.source || 'dashboard');
      return jsonOut({
        ok: true,
        day: result.day,
        merged: result.merged,
        raised: result.raised,
        ignoredLower: result.ignoredLower,
        drained: result.drained,
        rows: readCurrent(),
        periods: readPeriods(),
        meta: meta()
      });
    } finally {
      try { lock.releaseLock(); } catch (_) {}
    }
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  try {
    if (e.parameter.secret !== prop('READ_SECRET')) return jsonOut({ ok: false, error: 'bad secret' });

    const out = { ok: true, rows: readCurrent(), periods: readPeriods(), meta: meta() };

    // Raw history, for debugging or your own spreadsheet formulas. Not needed by
    // the dashboard — it reads the precomputed UsagePeriods tab instead.
    if (e.parameter.include === 'snapshots') {
      out.snapshots = readSnapshotRows(parseInt(e.parameter.days, 10) || 35);
    }
    return jsonOut(out);
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function meta() {
  const days = snapshotDayRange();
  return {
    today: todayUtc(),
    historyDays: days.count,
    oldestDay: days.oldest,
    lastSync: prop('LAST_SYNC') || '',
    lastSyncSource: prop('LAST_SYNC_SOURCE') || '',
    unattended: !!prop('TORN_API_KEY')
  };
}

/* ================================================================== *
 * Ingest — merge, snapshot, recompute
 * ================================================================== */

/**
 * The single write path. Takes whatever a caller observed and folds it into the
 * sheet without ever losing ground:
 *   - counters merge with max(), so a stale read or a half-finished sweep can
 *     never lower someone's recorded total
 *   - levels take the newest non-blank reading
 *   - a blank incoming value never overwrites a value we already have
 * Then it stamps today's snapshot and recomputes every period column.
 */
function ingest(members, source) {
  const day = todayUtc();

  // Fold in anything members submitted since the last sync, oldest first, before
  // the caller's own observations. Counters merge with max() either way, so order
  // only decides which reading wins for the level fields — and newest should.
  const queued = drainInbox();
  const merged = mergeCurrent(queued.members.concat(members), source);
  merged.drained = queued.count;
  const snapshots = writeSnapshots(merged.rows, day);
  writePeriods(computePeriods(merged.rows, snapshots, day));

  PropertiesService.getScriptProperties().setProperties({
    LAST_SYNC: new Date().toISOString(),
    LAST_SYNC_SOURCE: source
  });
  appendLog(source, merged.count, merged.raised, merged.ignoredLower);

  return {
    day: day,
    merged: merged.count,
    raised: merged.raised,
    ignoredLower: merged.ignoredLower,
    drained: queued.count
  };
}

/* ------------------------------------------------------------------ *
 * Self-report inbox
 * ------------------------------------------------------------------ */

function appendInbox(body) {
  const sheet = sheetFor(SHEET_INBOX, INBOX_COLUMNS);
  sheet.appendRow([
    new Date().toISOString(),
    String(body.id),
    body.name || String(body.id),
    body.position || '',
    JSON.stringify(body.stats || {})
  ]);
}

/**
 * Read and clear the inbox in one pass. Called only from inside the sync lock, so
 * a submission arriving mid-drain either lands before the read (and gets merged
 * now) or after the clear (and waits for the next sync). Neither loses data.
 */
function drainInbox() {
  const sheet = sheetFor(SHEET_INBOX, INBOX_COLUMNS);
  const last = sheet.getLastRow();
  if (last < 2) return { members: [], count: 0 };

  const values = sheet.getRange(2, 1, last - 1, INBOX_COLUMNS.length).getValues();
  const members = [];

  values
    .sort(function (a, b) { return String(a[0]) < String(b[0]) ? -1 : 1; })
    .forEach(function (r) {
      if (!r[1]) return;
      let stats = {};
      try { stats = JSON.parse(r[4] || '{}'); } catch (_) { return; }
      members.push({ id: String(r[1]), name: r[2], position: r[3], stats: stats });
    });

  sheet.getRange(2, 1, last - 1, INBOX_COLUMNS.length).clearContent();
  return { members: members, count: members.length };
}

function mergeCurrent(members, source) {
  const sheet = sheetFor(SHEET_CURRENT, CURRENT_COLUMNS);
  const data = sheet.getDataRange().getValues();
  const header = data.length ? data[0] : CURRENT_COLUMNS;
  const col = indexOf(header);

  const rows = data.slice(1);
  const rowById = {};
  rows.forEach(function (r, i) { rowById[String(r[col.id])] = i; });

  const now = new Date().toISOString();
  let count = 0;
  let raised = 0;
  let ignoredLower = 0;

  members.forEach(function (m) {
    if (!m || !m.id) return;
    const id = String(m.id);
    const stats = m.stats || {};

    let row = rowById[id] === undefined ? null : rows[rowById[id]];
    if (!row) {
      row = new Array(header.length).fill('');
      row[col.id] = id;
      rows.push(row);
      rowById[id] = rows.length - 1;
    }

    if (m.name) row[col.name] = m.name;
    if (m.position) row[col.position] = m.position;

    let changed = false;

    STAT_FIELDS.forEach(function (field) {
      const incoming = stats[field.key];
      if (incoming === undefined || incoming === null || incoming === '') return;

      const idx = col[field.key];
      if (idx === undefined) return;

      const existing = row[idx];
      const incomingNum = Number(incoming);
      if (!isFinite(incomingNum)) return;

      if (existing === '' || existing === null || existing === undefined) {
        row[idx] = incomingNum;
        changed = true;
        return;
      }

      const existingNum = Number(existing);

      if (field.type === 'counter') {
        if (incomingNum > existingNum) { row[idx] = incomingNum; raised++; changed = true; }
        else if (incomingNum < existingNum) { ignoredLower++; }
      } else if (incomingNum !== existingNum) {
        row[idx] = incomingNum;
        changed = true;
      }
    });

    if (changed) {
      row[col.source] = mergeSource(row[col.source], source);
      row[col.updated] = now;
    }
    count++;
  });

  writeAll(sheet, CURRENT_COLUMNS, rows);

  return {
    count: count,
    raised: raised,
    ignoredLower: ignoredLower,
    rows: rows.map(function (r) { return rowToObject(header, r); })
  };
}

function mergeSource(existing, incoming) {
  const parts = String(existing || '').split('+').filter(String);
  if (parts.indexOf(incoming) === -1) parts.push(incoming);
  return parts.slice(-3).join('+');
}

/**
 * One row per member per UTC day. Re-syncing the same day overwrites that day's
 * row, so it always holds the latest reading for the day. The day comes from the
 * server clock, never the caller, so leaders in any timezone land on the same
 * Torn day boundary.
 */
function writeSnapshots(currentRows, day) {
  const sheet = sheetFor(SHEET_SNAPSHOTS, SNAPSHOT_COLUMNS);
  const data = sheet.getDataRange().getValues();
  const header = data.length ? data[0] : SNAPSHOT_COLUMNS;
  const col = indexOf(header);
  const cutoff = dayMinus(day, SNAPSHOT_RETENTION_DAYS);

  const kept = [];
  const todayIndex = {};
  const seen = {};   // id|day -> index in kept

  for (let i = 1; i < data.length; i++) {
    const rowDay = normalizeDay(data[i][col.day]);
    if (rowDay < cutoff) continue; // prune, keeps the tab bounded

    const id = String(data[i][col.id]);
    const key = id + '|' + rowDay;

    /*
     * Collapse duplicates rather than carrying them forward. There should only ever
     * be one row per member per day, but while the day cells were being coerced to
     * Dates the upsert key never matched and every sync appended a fresh row. This
     * repairs that damage in place on the next write; the last row for a given day
     * wins, which is the most recent reading.
     */
    if (seen[key] !== undefined) {
      kept[seen[key]] = data[i];
      continue;
    }

    kept.push(data[i]);
    seen[key] = kept.length - 1;
    if (rowDay === day) todayIndex[id] = kept.length - 1;
  }

  const capturedAt = new Date().toISOString();

  currentRows.forEach(function (r) {
    const id = String(r.id);
    if (!id) return;
    // Only snapshot members we actually have tracked numbers for — a placeholder
    // row of blanks would poison tomorrow's deltas.
    const hasData = TRACKED_KEYS.some(function (k) { return r[k] !== '' && r[k] !== null && r[k] !== undefined; });
    if (!hasData) return;

    const row = [id, r.name || id, day]
      .concat(TRACKED_KEYS.map(function (k) { return blankToEmpty(r[k]); }))
      .concat([capturedAt, 'observed']);

    // A live reading always replaces a reconstructed one for the same day.
    const at = todayIndex[id];
    if (at === undefined) {
      kept.push(row);
      todayIndex[id] = kept.length - 1;
    } else {
      kept[at] = row;
    }
  });

  writeSnapshotTab(sheet, kept);

  // Hand the caller an id -> [{day, stats}] map sorted oldest first, so period
  // maths does not have to re-read the sheet.
  const byId = {};
  kept.forEach(function (r) {
    const id = String(r[col.id]);
    const d = normalizeDay(r[col.day]);
    if (!byId[id]) byId[id] = [];
    const stats = {};
    TRACKED_KEYS.forEach(function (k) { stats[k] = r[col[k]]; });
    byId[id].push({ day: d, stats: stats });
  });
  Object.keys(byId).forEach(function (id) {
    byId[id].sort(function (a, b) { return a.day < b.day ? -1 : (a.day > b.day ? 1 : 0); });
  });
  return byId;
}

/**
 * Newest snapshot on or before (today - days). If nothing is that old, fall back
 * to the oldest snapshot we do have so a young dataset still shows something —
 * the real window length is reported alongside so it can be labelled honestly.
 */
function findBaseline(list, day, days) {
  if (!list || !list.length) return null;
  const target = dayMinus(day, days);

  let chosen = null;
  for (let i = 0; i < list.length; i++) {
    if (list[i].day <= target) chosen = list[i];
    else break;
  }
  if (!chosen) {
    if (list[0].day >= day) return null; // only today exists — no window yet
    chosen = list[0];
  }
  return { snap: chosen, actualDays: daysBetween(chosen.day, day) };
}

/**
 * Every window is measured between two stored snapshots, anchored on the newest
 * one that member actually has — not on "today".
 *
 * Anchoring on today assumed today's sweep had already landed. When it has not,
 * or a sync failed, or Torn has not rolled a member's daily snapshot over yet, the
 * top of the window is missing and the whole column reads zero or blank. Anchoring
 * on the newest available snapshot instead means the daily figure is always "the
 * most recent complete day-over-day change I can actually measure" — if today is
 * missing, that is yesterday against the day before, which is exactly the question
 * being asked. The same logic carries the weekly and monthly windows.
 *
 * Each period reports the real span it covers in <prefix>_window, so a window that
 * came up short is visible rather than silently mislabelled, and a per-day rate can
 * be derived from it honestly.
 */
function computePeriods(currentRows, snapshotsById, day) {
  return currentRows.map(function (r) {
    const out = { id: String(r.id), name: r.name, position: r.position };
    const list = snapshotsById[String(r.id)] || [];

    const anchor = list.length ? list[list.length - 1] : null;
    const anchorDay = anchor ? anchor.day : day;
    const anchorStats = anchor ? anchor.stats : r;
    out.anchor = anchorDay;

    PERIODS.forEach(function (p) {
      const baseline = findBaseline(list, anchorDay, p.days);
      out[p.prefix + '_window'] = baseline ? baseline.actualDays : '';

      TRACKED_KEYS.forEach(function (k) {
        const key = p.prefix + '_' + k;
        const current = anchorStats[k];
        if (!baseline || current === '' || current === null || current === undefined) {
          out[key] = '';
          return;
        }
        const before = baseline.snap.stats[k];
        if (before === '' || before === null || before === undefined) { out[key] = ''; return; }
        out[key] = Number(current) - Number(before);
      });
    });

    out.updated = new Date().toISOString();
    return out;
  });
}

function writePeriods(periodRows) {
  const sheet = sheetFor(SHEET_PERIODS, PERIOD_COLUMNS);
  const rows = periodRows.map(function (obj) {
    return PERIOD_COLUMNS.map(function (c) { return blankToEmpty(obj[c]); });
  });
  writeAll(sheet, PERIOD_COLUMNS, rows);
}

/* ================================================================== *
 * Unattended sync — Torn API straight from the sheet
 * ================================================================== */

/**
 * Run this once by hand from the Apps Script editor. Safe to re-run — it clears its
 * own previous triggers first.
 *
 * Installs two things:
 *   1. A repeating sweep. Interval comes from the SYNC_INTERVAL_MINUTES script
 *      property (default 60). Allowed: 1, 5, 10, 15, 30, 60, 120, 240, 360, 720.
 *   2. A sweep just before UTC midnight. This is the one that actually improves
 *      accuracy: daily numbers are "today's total minus the last snapshot of
 *      yesterday", so if the final sweep of a day happened at 22:00, the last two
 *      hours of usage get counted against the wrong day. A boundary sweep costs one
 *      extra run per day and fixes that smear far more cheaply than polling harder.
 */
function setupSync() {
  if (!prop('TORN_API_KEY')) {
    throw new Error('Set the TORN_API_KEY script property first, or the sync has nothing to authenticate with.');
  }

  const minutes = parseInt(prop('SYNC_INTERVAL_MINUTES'), 10) || DEFAULT_SYNC_INTERVAL_MIN;
  const cycle = parseInt(prop('SYNC_CYCLE_MINUTES'), 10) || DEFAULT_SYNC_CYCLE_MIN;
  const estimate = estimateDailyRuntime(minutes, cycle);

  if (!estimate.fitsRuntime) {
    throw new Error(
      'That combination would use about ' + Math.round(estimate.minutesPerDay) + ' min/day of trigger runtime, ' +
      'and consumer Google accounts only allow ' + CONSUMER_TRIGGER_BUDGET_MIN + ' — syncs would start failing ' +
      'partway through each day. Roster ' + estimate.members + ', ' + estimate.perRun + ' per run. ' +
      'Raise SYNC_CYCLE_MINUTES (re-read each member less often) rather than the interval, ' +
      'or run this on a Google Workspace account. Call previewSyncBudget() to compare options.'
    );
  }

  if (!estimate.fitsExecution) {
    throw new Error(
      'A single run would take about ' + Math.round(estimate.secondsPerRun) + 's and Apps Script kills executions ' +
      'at 6 minutes. Lower SYNC_INTERVAL_MINUTES so each run sweeps a smaller slice of the roster.'
    );
  }

  removeSync();
  newIntervalTrigger(minutes);

  // A guaranteed full sweep just after Torn City midnight, when the daily snapshot
  // Torn serves for other players has just rolled over. Apps Script fires "atHour"
  // triggers within roughly a 15-minute window, hence 01:00 rather than 00:00.
  ScriptApp.newTrigger('runSync').timeBased()
    .atHour(1).nearMinute(0).everyDays(1).inTimezone('UTC').create();

  // Seed the sheet with the whole roster now rather than letting it fill in one
  // slice at a time over the first cycle.
  runFullSync();

  return 'Sync every ' + minutes + ' min in ' + estimate.buckets + ' slice(s) of ~' + estimate.perRun +
         ' members, so everyone is re-read every ' + cycle + ' min. Uses ~' +
         Math.round(estimate.minutesPerDay) + ' of ' + CONSUMER_TRIGGER_BUDGET_MIN +
         ' min/day trigger budget and ~' + Math.round(estimate.callsPerMinuteInRun) +
         ' Torn calls/min of our ' + MAX_CALLS_PER_MIN + ' cap. Plus a full 01:00 UTC boundary sweep.';
}

function newIntervalTrigger(minutes) {
  const builder = ScriptApp.newTrigger('runSync').timeBased();
  if (minutes >= 60) builder.everyHours(Math.round(minutes / 60));
  else builder.everyMinutes(minutes);
  builder.create();
}

function removeSync() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runSync') ScriptApp.deleteTrigger(t);
  });
}

/** Kept so older setup instructions still work. */
function setupHourlySync() {
  PropertiesService.getScriptProperties().setProperty('SYNC_INTERVAL_MINUTES', '60');
  return setupSync();
}

function estimateDailyRuntime(intervalMinutes, cycleMinutes) {
  // Roster size from the sheet if we have it, otherwise assume a full faction.
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CURRENT);
  const members = sheet && sheet.getLastRow() > 1 ? sheet.getLastRow() - 1 : 100;

  const cycle = cycleMinutes || DEFAULT_SYNC_CYCLE_MIN;
  const buckets = Math.max(1, Math.round(cycle / intervalMinutes));
  const perRun = Math.ceil(members / buckets);
  const runsPerDay = (24 * 60) / intervalMinutes;

  // Each member costs one UrlFetch (~250ms round trip) plus our pacing sleep.
  const fetchSecPerRun = perRun * (TORN_DELAY_MS + 250) / 1000;
  const secondsPerRun = fetchSecPerRun + RUN_OVERHEAD_SEC;

  // The 23:00 boundary run always sweeps the full roster, so bill it separately.
  const boundaryExtra = buckets > 1
    ? ((members - perRun) * (TORN_DELAY_MS + 250) / 1000) / 60
    : 0;

  const minutesPerDay = (secondsPerRun * runsPerDay) / 60 + boundaryExtra;
  const callsPerDay = Math.round(perRun * runsPerDay + (members - perRun));

  // Self-imposed ceiling is MAX_CALLS_PER_MIN, well under Torn's 100/min per user.
  const callsPerMinuteInRun = fetchSecPerRun > 0 ? (perRun / (fetchSecPerRun / 60)) : 0;

  return {
    members: members,
    buckets: buckets,
    perRun: perRun,
    secondsPerRun: secondsPerRun,
    minutesPerDay: minutesPerDay,
    callsPerDay: callsPerDay,
    callsPerMinuteInRun: callsPerMinuteInRun,
    fitsRuntime: minutesPerDay <= CONSUMER_TRIGGER_BUDGET_MIN,
    fitsExecution: secondsPerRun < 5 * 60
  };
}

/* ================================================================== *
 * Historical backfill
 *
 * Snapshot accumulation alone means the 7-day column is meaningless for a week
 * and the 30-day column for a month. Torn's personalstats endpoint accepts a
 * timestamp and returns the closest historical reading it has, so we can
 * reconstruct those baselines instead of waiting for them.
 *
 * That endpoint has a documented history of returning zeros, and a bad baseline
 * is not a harmless error: a zero baseline against a member with 50,000 lifetime
 * xanax renders as "50,000 xanax this week", which is the kind of number someone
 * gets confronted over. So everything here is built around refusing to write data
 * it cannot vouch for.
 * ================================================================== */

/**
 * One member, one date, raw response printed. Run this first.
 *
 * The exact request shape for timestamped personalstats is the part I am least
 * sure of, so this spends a single call to find out rather than discovering it
 * 300 calls into a backfill.
 */
function probeBackfill() {
  const key = String(prop('TORN_API_KEY') || '').trim();
  if (!key) return 'TORN_API_KEY is not set.';

  const rows = readCurrent();
  if (!rows.length) return 'FactionUsage is empty — run runFullSync() first so there is something to compare against.';

  const member = rows.find(function (r) {
    return TRACKED_KEYS.some(function (k) { return Number(r[k]) > 0; });
  }) || rows[0];

  const day = dayMinus(todayUtc(), 7);
  const stamp = dayToEpoch(dayMinus(day, TORN_SNAPSHOT_LAG_DAYS)); // same lag the backfill applies
  const out = [];

  out.push('Probing ' + member.name + ' [' + member.id + '] at ' + day + ' (timestamp ' + stamp + ')');
  out.push('Current lifetime values:');
  TRACKED_KEYS.forEach(function (k) { out.push('  ' + k + ' = ' + member[k]); });

  try {
    const res = tornGet('user/' + member.id, 'personalstats', key, {
      stat: TRACKED_KEYS.join(','),
      timestamp: stamp
    });

    out.push('');
    out.push('Raw response: ' + JSON.stringify(res).slice(0, 1500));
    out.push('');

    const ps = extractStats(res);
    if (!ps) {
      out.push('VERDICT: could not find a personalstats object in the response. Backfill will not work as written.');
    } else {
      TRACKED_KEYS.forEach(function (k) {
        out.push('  ' + k + ': historical = ' + ps[k] + ', current = ' + member[k]);
      });
      const check = validateBaseline(ps, member);
      out.push('');
      out.push(check.ok
        ? 'VERDICT: usable. Run backfillHistory().'
        : 'VERDICT: rejected — ' + check.reason + '. Backfill would refuse this member.');
    }
  } catch (err) {
    out.push('Request FAILED: ' + err);
  }

  console.log(out.join('\n'));
  return out.join('\n');
}

/**
 * Torn wants a unix timestamp, and returns the closest snapshot it holds.
 *
 * Those snapshots land on Torn City midnight, so 02:00 UTC sits unambiguously
 * nearest to the target day's own rollover — two hours from it, twenty-two from
 * the next. Midday is exactly equidistant between the two, which makes "closest"
 * a coin flip; when it resolves forward you get the following day's numbers
 * silently labelled as the target day, and every delta against it comes out zero.
 */
function dayToEpoch(day) {
  return Math.floor(new Date(day + 'T02:00:00Z').getTime() / 1000);
}

/** The response shape differs between API versions, so accept either. */
function extractStats(res) {
  if (!res) return null;
  if (res.personalstats) return res.personalstats;
  if (res.personalStats) return res.personalStats;
  // v2 sometimes nests under a per-category object; flatten one level.
  if (typeof res === 'object') {
    const keys = Object.keys(res);
    for (let i = 0; i < keys.length; i++) {
      const v = res[keys[i]];
      if (v && typeof v === 'object' && TRACKED_KEYS.some(function (k) { return v[k] !== undefined; })) return v;
    }
  }
  return null;
}

/**
 * Decide whether a reconstructed baseline is trustworthy enough to write.
 *
 * Rejections are per-member rather than per-field on purpose. A row where three
 * columns are real and one is nonsense looks fine at a glance, which makes it
 * more dangerous than a row that is simply absent.
 */
function validateBaseline(historical, current) {
  const values = {};
  let allZero = true;
  let anyCurrentNonZero = false;

  for (let i = 0; i < TRACKED_KEYS.length; i++) {
    const k = TRACKED_KEYS[i];
    const raw = historical[k];

    if (raw === undefined || raw === null || raw === '') {
      return { ok: false, reason: 'no historical value for ' + k };
    }
    const num = Number(raw);
    if (!isFinite(num) || num < 0) {
      return { ok: false, reason: 'non-numeric or negative ' + k + ' (' + raw + ')' };
    }
    if (num !== 0) allZero = false;

    const cur = Number(current[k]);
    if (isFinite(cur)) {
      if (cur !== 0) anyCurrentNonZero = true;

      // Counters are lifetime totals and cannot decrease. Networth is a level and
      // legitimately falls, so it is exempt from this check.
      const field = TRACKED_FIELDS.filter(function (f) { return f.key === k; })[0];
      if (field && field.type === 'counter' && num > cur) {
        return { ok: false, reason: 'historical ' + k + ' (' + num + ') exceeds current (' + cur + ')' };
      }
    }
    values[k] = num;
  }

  // The known failure mode: every stat comes back zero for a member who plainly
  // has history. A genuinely blank member would have zero current values too.
  if (allZero && anyCurrentNonZero) {
    return { ok: false, reason: 'every historical stat returned 0 while current values are non-zero' };
  }

  return { ok: true, values: values };
}

/**
 * Ask Torn for the same member at a spread of past dates and print what comes back.
 *
 * This answers the one question the backfill depends on and that no documentation
 * states: at what resolution does Torn actually hold historical personal stats? If
 * the &minus;1, &minus;2 and &minus;3 day rows are all identical to current, then day-level
 * reconstruction is not possible and the daily column can only ever come from our
 * own observed snapshots, however the request is phrased.
 *
 * Costs about eight calls. Writes nothing.
 */
function probeGranularity(query) {
  const key = String(prop('TORN_API_KEY') || '').trim();
  if (!key) return 'TORN_API_KEY is not set.';

  const needle = String(query || '').trim().toLowerCase();
  const rows = readCurrent();
  const member = needle
    ? rows.filter(function (r) {
        return String(r.id) === needle || String(r.name).toLowerCase() === needle;
      })[0]
    : rows.filter(function (r) { return Number(r.xantaken) > 50; })[0] || rows[0];

  if (!member) return 'No matching member in FactionUsage.';

  const today = todayUtc();
  const offsets = [0, 1, 2, 3, 5, 7, 14, 30];
  const out = [];
  const seen = {};

  out.push('Granularity probe — ' + member.name + ' [' + member.id + '], today ' + today + ' UTC');
  out.push('');
  out.push(pad('OFFSET', 9) + pad('DATE', 12) + TRACKED_KEYS.map(function (k) { return pad(k, 18); }).join(''));
  out.push(pad('current', 9) + pad('—', 12) + TRACKED_KEYS.map(function (k) { return pad(member[k], 18); }).join(''));

  offsets.forEach(function (off) {
    const day = dayMinus(today, off);
    try {
      const res = tornGet('user/' + member.id, 'personalstats', key, {
        stat: TRACKED_KEYS.join(','),
        timestamp: dayToEpoch(day)
      });
      const ps = extractStats(res);
      if (!ps) { out.push(pad('-' + off + 'd', 9) + pad(day, 12) + 'no personalstats in response'); return; }

      const values = TRACKED_KEYS.map(function (k) { return ps[k]; });
      out.push(pad('-' + off + 'd', 9) + pad(day, 12) +
        values.map(function (v) { return pad(v, 18); }).join(''));
      seen[values.join('|')] = true;
    } catch (err) {
      out.push(pad('-' + off + 'd', 9) + pad(day, 12) + 'FAILED: ' + err);
    }
  });

  const distinct = Object.keys(seen).length;
  out.push('');
  out.push('Distinct value sets returned: ' + distinct + ' out of ' + offsets.length + ' dates queried.');
  if (distinct <= 1) {
    out.push('VERDICT: Torn returned the same numbers for every date. The timestamp parameter');
    out.push('is not giving us history at all — backfill cannot work and should be purged.');
  } else if (String(offsets.slice(0, 4).map(function (o) { return o; })) && distinct < 4) {
    out.push('VERDICT: history exists but is coarser than daily. Compare the -1/-2/-3 rows:');
    out.push('if they are identical, the daily column can only come from our own observed');
    out.push('snapshots, which build up one per day from now on. Weekly and monthly are fine.');
  } else {
    out.push('VERDICT: day-level history is available. If the daily column is still blank,');
    out.push('the problem is on our side rather than Torn\'s — send this output over.');
  }

  console.log(out.join('\n'));
  return out.join('\n');
}

/**
 * Reconstruct the 1 / 7 / 30 day baselines for the whole faction.
 *
 * Resumable: each run works through as many members as fit inside the execution
 * budget and stores a cursor, so re-running continues where it stopped. Re-run
 * until it reports being finished.
 */
function backfillHistory() {
  const key = String(prop('TORN_API_KEY') || '').trim();
  if (!key) return 'TORN_API_KEY is not set.';

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (_) {
    return 'A sync is running right now — try again in a minute.';
  }

  try {
    const currentRows = readCurrent().filter(function (r) {
      return r.id && TRACKED_KEYS.some(function (k) { return r[k] !== '' && r[k] !== null; });
    });
    if (!currentRows.length) return 'FactionUsage is empty — run runFullSync() first.';

    currentRows.sort(function (a, b) { return String(a.id) < String(b.id) ? -1 : 1; });

    const props = PropertiesService.getScriptProperties();
    let cursor = parseInt(props.getProperty('BACKFILL_CURSOR'), 10) || 0;
    if (cursor >= currentRows.length) cursor = 0;

    const today = todayUtc();
    const startedAt = Date.now();
    const pending = [];
    const rejected = [];
    let processed = 0;
    let accepted = 0;

    while (cursor < currentRows.length && Date.now() - startedAt < RUN_BUDGET_MS) {
      const member = currentRows[cursor];

      BACKFILL_DAYS.forEach(function (offset) {
        const day = dayMinus(today, offset);
        try {
          // Ask for day-1: a row stamped `day` must hold what a sweep on `day`
          // would have seen, and Torn serves other players a day behind.
          const res = tornGet('user/' + member.id, 'personalstats', key, {
            stat: TRACKED_KEYS.join(','),
            timestamp: dayToEpoch(dayMinus(day, TORN_SNAPSHOT_LAG_DAYS))
          });
          const ps = extractStats(res);
          if (!ps) {
            rejected.push(member.name + ' @' + day + ': no personalstats in response');
            return;
          }
          const check = validateBaseline(ps, member);
          if (!check.ok) {
            rejected.push(member.name + ' @' + day + ': ' + check.reason);
            return;
          }
          pending.push({ id: String(member.id), name: member.name, day: day, stats: check.values });
          accepted++;
        } catch (err) {
          rejected.push(member.name + ' @' + day + ': ' + err);
        }
        Utilities.sleep(TORN_DELAY_MS);
      });

      cursor++;
      processed++;
    }

    if (pending.length) writeBackfillSnapshots(pending);

    const done = cursor >= currentRows.length;
    props.setProperty('BACKFILL_CURSOR', String(done ? 0 : cursor));

    if (done) {
      // Recompute so the period columns pick up the reconstructed baselines.
      writePeriods(computePeriods(readCurrent(), buildSnapshotMap(), today));
    }

    if (rejected.length) {
      console.log('Backfill rejections:\n' + rejected.join('\n'));
    }
    appendLog('backfill' + (done ? '-complete' : '-partial'), processed, accepted, rejected.length);

    const summary = 'Backfill ' + (done ? 'COMPLETE' : 'partial, run again to continue') +
      ': ' + processed + ' members this run, ' + accepted + ' baselines written, ' +
      rejected.length + ' rejected' + (rejected.length ? ' (see execution log for reasons)' : '') +
      (done ? '. Period columns recomputed.' : ' — cursor at ' + cursor + '/' + currentRows.length + '.');

    console.log(summary);
    return summary;
  } finally {
    persistCallTimes(); // the window must survive into the next execution
    try { lock.releaseLock(); } catch (_) {}
  }
}

/**
 * Merge reconstructed rows into the snapshot tab. An observed row is never
 * replaced — a live reading beats a reconstruction every time.
 */
function writeBackfillSnapshots(entries) {
  const sheet = sheetFor(SHEET_SNAPSHOTS, SNAPSHOT_COLUMNS);
  const data = sheet.getDataRange().getValues();
  const header = data.length ? data[0] : SNAPSHOT_COLUMNS;
  const col = indexOf(header);

  const rows = data.slice(1);
  const indexByKey = {};
  rows.forEach(function (r, i) {
    indexByKey[String(r[col.id]) + '|' + normalizeDay(r[col.day])] = i;
  });

  const capturedAt = new Date().toISOString();

  entries.forEach(function (entry) {
    const rowKey = entry.id + '|' + entry.day;
    const existingAt = indexByKey[rowKey];

    // Blank source means a row written before this column existed: observed.
    if (existingAt !== undefined && String(rows[existingAt][col.source] || 'observed') !== 'backfill') return;

    const row = [entry.id, entry.name, entry.day]
      .concat(TRACKED_KEYS.map(function (k) { return blankToEmpty(entry.stats[k]); }))
      .concat([capturedAt, 'backfill']);

    if (existingAt === undefined) {
      rows.push(row);
      indexByKey[rowKey] = rows.length - 1;
    } else {
      rows[existingAt] = row;
    }
  });

  writeSnapshotTab(sheet, rows);
}

/** id -> [{day, stats}] sorted oldest first, read fresh from the snapshot tab. */
function buildSnapshotMap() {
  const sheet = sheetFor(SHEET_SNAPSHOTS, SNAPSHOT_COLUMNS);
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return {};

  const col = indexOf(data[0]);
  const byId = {};

  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][col.id]);
    if (!id) continue;
    const stats = {};
    TRACKED_KEYS.forEach(function (k) { stats[k] = data[i][col[k]]; });
    if (!byId[id]) byId[id] = [];
    byId[id].push({
      day: normalizeDay(data[i][col.day]),
      source: data[i][col.source] || 'observed',
      stats: stats
    });
  }

  Object.keys(byId).forEach(function (id) {
    byId[id].sort(function (a, b) { return a.day < b.day ? -1 : (a.day > b.day ? 1 : 0); });
  });
  return byId;
}

/**
 * Print everything the sheet knows about one member: current values, every stored
 * snapshot, and which baseline each period resolves to. No Torn calls.
 *
 * Use this when a column looks wrong. If a baseline row's numbers are identical to
 * the current row, the delta is genuinely zero and the data is telling the truth —
 * the question then becomes whether that baseline is really the day it claims.
 *
 * Pass a name or an id: inspectMember('iSatomi')
 */
function inspectMember(query) {
  const needle = String(query || '').trim().toLowerCase();
  const rows = readCurrent();
  if (!rows.length) return 'FactionUsage is empty — run runFullSync() first.';

  // The editor's Run button cannot pass arguments, so with no name given pick the
  // heaviest xanax user: the member most likely to show a non-zero delta, and
  // therefore the most informative one to look at.
  const member = needle
    ? rows.filter(function (r) {
        return String(r.id) === needle || String(r.name).toLowerCase() === needle;
      })[0]
    : rows.slice().sort(function (a, b) { return Number(b.xantaken || 0) - Number(a.xantaken || 0); })[0];

  if (!member) return 'No member matching "' + query + '" in FactionUsage.';

  const today = todayUtc();
  const snaps = (buildSnapshotMap()[String(member.id)] || []);
  const out = [];

  out.push(member.name + ' [' + member.id + ']   today is ' + today + ' UTC');
  out.push('');
  out.push(pad('DAY', 12) + pad('SOURCE', 10) + TRACKED_KEYS.map(function (k) { return pad(k, 20); }).join(''));
  out.push(pad('current', 12) + pad('—', 10) + TRACKED_KEYS.map(function (k) { return pad(member[k], 20); }).join(''));

  snaps.slice().reverse().forEach(function (s) {
    out.push(pad(s.day, 12) + pad(s.source || '?', 10) +
      TRACKED_KEYS.map(function (k) { return pad(s.stats[k], 20); }).join(''));
  });

  out.push('');
  PERIODS.forEach(function (p) {
    const b = findBaseline(snaps, today, p.days);
    if (!b) {
      out.push(p.prefix + ' (' + p.days + 'd): NO BASELINE — column will be blank');
      return;
    }
    const deltas = TRACKED_KEYS.map(function (k) {
      const before = b.snap.stats[k];
      if (before === '' || before === null || before === undefined) return k + '=—';
      return k + '=' + (Number(member[k]) - Number(before));
    });
    out.push(p.prefix + ' (' + p.days + 'd): baseline ' + b.snap.day + ' [' + (b.snap.source || '?') +
      '], window ' + b.actualDays + 'd  →  ' + deltas.join('  '));
  });

  out.push('');
  out.push('If a baseline row matches the current row exactly, both readings came from the');
  out.push('same underlying Torn daily snapshot and a zero delta is correct, not a bug.');

  console.log(out.join('\n'));
  return out.join('\n');
}

function pad(v, n) {
  const s = String(v === undefined || v === null || v === '' ? '—' : v);
  return s.length >= n ? s.slice(0, n - 1) + ' ' : s + new Array(n - s.length + 1).join(' ');
}

/**
 * Rebuild UsagePeriods from the snapshots already in the sheet. No Torn calls.
 *
 * Run this whenever the period columns look wrong or empty but UsageSnapshots
 * clearly has the data — it re-derives every figure from what is already stored,
 * and repairs the day column formatting on the way through. Prints a sample so you
 * can see whether baselines are actually being found.
 */
function recomputePeriods() {
  const today = todayUtc();

  // Rewriting the snapshot tab through writeSnapshotTab re-stamps the day column as
  // plain text, converting any Date-coerced cells back to comparable strings.
  const sheet = sheetFor(SHEET_SNAPSHOTS, SNAPSHOT_COLUMNS);
  const data = sheet.getDataRange().getValues();
  let removedDupes = 0;

  if (data.length > 1) {
    const col = indexOf(data[0]);
    const seen = {};
    const rows = [];

    data.slice(1).forEach(function (r) {
      const copy = r.slice();
      copy[col.day] = normalizeDay(r[col.day]);

      // Collapse any duplicate id+day rows left behind by the date-coercion bug.
      const key = String(copy[col.id]) + '|' + copy[col.day];
      if (seen[key] !== undefined) {
        rows[seen[key]] = copy;
        removedDupes++;
        return;
      }
      rows.push(copy);
      seen[key] = rows.length - 1;
    });

    writeSnapshotTab(sheet, rows);
  }

  const currentRows = readCurrent();
  const snapshots = buildSnapshotMap();
  writePeriods(computePeriods(currentRows, snapshots, today));

  const out = [];
  out.push('Today (UTC): ' + today);
  if (removedDupes) out.push('Collapsed ' + removedDupes + ' duplicate snapshot rows.');
  out.push('Members in FactionUsage: ' + currentRows.length);
  out.push('Members with snapshot history: ' + Object.keys(snapshots).length);

  const sampleId = Object.keys(snapshots)[0];
  if (sampleId) {
    const days = snapshots[sampleId].map(function (s) { return s.day; });
    out.push('Sample member ' + sampleId + ' has ' + days.length + ' snapshots: ' + days.join(', '));
    PERIODS.forEach(function (p) {
      const b = findBaseline(snapshots[sampleId], today, p.days);
      out.push('  ' + p.prefix + ' (' + p.days + 'd): ' +
        (b ? 'baseline ' + b.snap.day + ', window ' + b.actualDays + 'd' : 'NO BASELINE FOUND'));
    });
  } else {
    out.push('No snapshot history at all — run runFullSync() first.');
  }

  console.log(out.join('\n'));
  return out.join('\n');
}

/**
 * Delete every reconstructed row, leaving observed history untouched. Run this if
 * the backfilled numbers look wrong — it is a clean undo.
 */
function purgeBackfill() {
  const sheet = sheetFor(SHEET_SNAPSHOTS, SNAPSHOT_COLUMNS);
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return 'No snapshots to purge.';

  const col = indexOf(data[0]);
  const kept = [];
  let removed = 0;

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][col.source]) === 'backfill') { removed++; continue; }
    kept.push(data[i]);
  }

  writeSnapshotTab(sheet, kept);
  writePeriods(computePeriods(readCurrent(), buildSnapshotMap(), todayUtc()));
  PropertiesService.getScriptProperties().deleteProperty('BACKFILL_CURSOR');
  appendLog('backfill-purged', removed, 0, 0);

  const msg = 'Removed ' + removed + ' backfilled snapshot rows. Observed history untouched, periods recomputed.';
  console.log(msg);
  return msg;
}

/**
 * Diagnose the Torn side of the setup without writing anything. Run this from the
 * editor when a sync fails; the result prints in the execution log.
 *
 * Torn's error 6 ("Incorrect ID") is the usual culprit and it never says which id
 * it disliked, so this checks each piece separately and reports the faction the key
 * owner is actually in.
 */
function testConnection() {
  const out = [];
  const key = String(prop('TORN_API_KEY') || '').trim();

  if (!key) {
    console.log('TORN_API_KEY is not set in Script Properties.');
    return 'TORN_API_KEY is not set in Script Properties.';
  }
  out.push('TORN_API_KEY: set, ending "' + key.slice(-4) + '" (' + key.length + ' chars)');

  try {
    const me = tornGet('user/', 'profile', key);
    out.push('Key owner: ' + me.name + ' [' + me.player_id + ']');
    if (me.faction && me.faction.faction_id) {
      out.push('Their faction: ' + me.faction.faction_name + ' [' + me.faction.faction_id + '] — this is what gets tracked.');
    } else {
      out.push('PROBLEM: this key\'s owner is not in a faction, so there is no roster to sync.');
    }
  } catch (err) {
    out.push('FAILED reading the key owner: ' + err);
    out.push('If this says "Incorrect Key", the key is wrong or has been revoked.');
    console.log(out.join('\n'));
    return out.join('\n');
  }

  try {
    const faction = tornGet('faction/', 'basic', key);
    const count = Object.keys(faction.members || {}).length;
    out.push('Roster call OK: ' + faction.name + ' — ' + count + ' members.');

    const firstId = Object.keys(faction.members || {})[0];
    if (firstId) {
      const ps = tornGet('user/' + firstId, 'personalstats', key).personalstats || {};
      const got = STAT_FIELDS.filter(function (f) { return f.api && ps[f.key] !== undefined; })
                             .map(function (f) { return f.key; });
      const missing = STAT_FIELDS.filter(function (f) { return f.api && ps[f.key] === undefined; })
                                 .map(function (f) { return f.key; });
      out.push('Sample member ' + faction.members[firstId].name + ': ' + Object.keys(ps).length + ' stats returned.');
      out.push('  Tracked and present: ' + (got.join(', ') || 'none'));
      out.push('  Tracked but missing: ' + (missing.join(', ') || 'none'));
    }
    out.push('');
    out.push('All good — run runFullSync() to seed the sheet.');
  } catch (err) {
    out.push('Roster call FAILED: ' + err);
    out.push('The key owner must be in a faction, and the key needs at least public access.');
  }

  console.log(out.join('\n'));
  return out.join('\n');
}

/**
 * Print the quota plan for a range of intervals without changing anything.
 * Run this from the editor to see what your actual roster affords.
 */
function previewSyncBudget() {
  const cycle = parseInt(prop('SYNC_CYCLE_MINUTES'), 10) || DEFAULT_SYNC_CYCLE_MIN;
  const lines = [60, 120, 240, 360, 720].map(function (m) {
    const e = estimateDailyRuntime(m, cycle);
    return 'every ' + m + ' min → ' + e.perRun + ' members/run (' + e.buckets + ' slices), ' +
      Math.round(e.minutesPerDay) + ' min/day runtime of ' + CONSUMER_TRIGGER_BUDGET_MIN + ', ' +
      e.callsPerDay + ' Torn calls/day of 20000, ' +
      Math.round(e.callsPerMinuteInRun) + '/min peak of ' + MAX_CALLS_PER_MIN +
      (e.fitsRuntime ? '' : '  ← over runtime budget');
  });

  const e = estimateDailyRuntime(60, cycle);
  const out = 'Roster: ' + e.members + ' members. Every member re-read every ' + cycle + ' min.\n' +
    lines.join('\n');
  console.log(out);
  return out;
}

/**
 * Pull the whole faction from Torn and ingest it. This is what makes the tracker
 * run without anybody's browser open.
 *
 * `personalstats` is a public-access selection: any key can read any player's
 * personal stats — the same numbers on the Personal Stats tab of their profile.
 * No spies and no member cooperation required.
 */
function runSync() {
  return sweep(false);
}

/**
 * Sweep every member in one go, ignoring the slice rotation. Run this by hand from
 * the editor for the first sync — a normal run only reads its slice of the roster,
 * so a fresh sheet would otherwise fill in gradually over a full cycle. Also handy
 * after adding members or if you suspect the sheet has drifted.
 */
function runFullSync() {
  return sweep(true);
}

function sweep(forceFull) {
  const key = prop('TORN_API_KEY');
  if (!key) throw new Error('TORN_API_KEY is not set in Script Properties — nothing to sync with.');

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    // Always the faction the key's owner belongs to. No id to configure, so no id
    // to get wrong.
    let faction;
    try {
      faction = tornGet('faction/', 'basic', key);
    } catch (err) {
      throw new Error('Could not read the faction roster: ' + err +
                      '. Run testConnection() to see what this key can reach.');
    }

    // Sorted so bucket membership is stable between runs — an unsorted key order
    // could shuffle and leave some members repeatedly skipped.
    const allIds = Object.keys(faction.members || {}).sort();
    const rosterIds = selectSlice(allIds, forceFull).slice(0, TORN_MAX_MEMBERS_PER_RUN);

    const members = [];
    const startedAt = Date.now();
    let failed = 0;
    let ranOut = false;

    for (let i = 0; i < rosterIds.length; i++) {
      // Leave time to actually write what we collected. Anything unread this run
      // gets picked up next run; the merge is additive so a partial sweep is safe.
      if (Date.now() - startedAt > RUN_BUDGET_MS) { ranOut = true; break; }

      const id = rosterIds[i];
      const info = faction.members[id];
      try {
        const res = tornGet('user/' + id, 'personalstats', key);
        const ps = res.personalstats || {};
        const stats = {};
        STAT_FIELDS.forEach(function (f) {
          if (!f.api) return;
          if (ps[f.key] !== undefined && ps[f.key] !== null && ps[f.key] !== '') stats[f.key] = ps[f.key];
        });
        members.push({ id: id, name: info.name, position: info.position, stats: stats });
      } catch (err) {
        failed++;
        console.warn('personalstats failed for ' + id + ': ' + err);
        // Error 5 means we are over Torn's 100/min. Nothing to do but stop —
        // hammering it further just extends the block.
        if (String(err).indexOf('Torn error 5') !== -1) {
          appendLog('torn-auto-ratelimited', members.length, 0, 0);
          break;
        }
      }
      Utilities.sleep(TORN_DELAY_MS);
    }

    if (members.length) ingest(members, 'torn-auto');
    if (failed) appendLog('torn-auto-errors', failed, 0, 0);
    if (ranOut) appendLog('torn-auto-partial (hit 4.5min budget)', members.length, 0, 0);
  } catch (err) {
    appendLog('torn-auto-FAILED: ' + String(err).slice(0, 120), 0, 0, 0);
    throw err;
  } finally {
    persistCallTimes(); // the window must survive into the next execution
    try { lock.releaseLock(); } catch (_) {}
  }
}

/**
 * Pick this run's slice of the roster and advance the cursor.
 *
 * The 23:00 UTC boundary run always takes everybody: it is the reading that every
 * "yesterday" baseline gets measured against, so a partial roster there would leave
 * some members with a day-boundary an hour out of place.
 */
function selectSlice(allIds, forceFull) {
  const props = PropertiesService.getScriptProperties();
  const interval = parseInt(props.getProperty('SYNC_INTERVAL_MINUTES'), 10) || DEFAULT_SYNC_INTERVAL_MIN;
  const cycle = parseInt(props.getProperty('SYNC_CYCLE_MINUTES'), 10) || DEFAULT_SYNC_CYCLE_MIN;

  // 01:00 UTC — just after Torn City midnight, so this run reads the freshly
  // rolled-over daily snapshot. It always takes the whole roster.
  const isBoundaryRun = Number(Utilities.formatDate(new Date(), 'UTC', 'H')) === 1;
  const buckets = Math.max(1, Math.round(cycle / interval));
  if (forceFull || isBoundaryRun || buckets === 1) return allIds;

  const cursor = parseInt(props.getProperty('SYNC_CURSOR'), 10) || 0;
  props.setProperty('SYNC_CURSOR', String((cursor + 1) % buckets));

  return allIds.filter(function (_, i) { return i % buckets === cursor % buckets; });
}

/* ------------------------------------------------------------------ *
 * Rate limiting — every Torn call in this file goes through here
 * ------------------------------------------------------------------ */

var _callTimes = null;   // epoch ms of recent calls, newest last
var _callsThisRun = 0;
var _callsSincePersist = 0;

function loadCallTimes() {
  if (_callTimes) return _callTimes;
  try { _callTimes = JSON.parse(prop(CALL_LOG_KEY) || '[]'); }
  catch (_) { _callTimes = []; }
  return _callTimes;
}

function persistCallTimes() {
  PropertiesService.getScriptProperties().setProperty(CALL_LOG_KEY, JSON.stringify(_callTimes || []));
  _callsSincePersist = 0;
}

/**
 * Block until making one more call would not breach MAX_CALLS_PER_MIN over the
 * trailing 60 seconds. Called immediately before every request.
 */
function awaitCallSlot() {
  const times = loadCallTimes();

  for (;;) {
    const now = Date.now();
    const windowStart = now - 60000;

    // Drop anything that has aged out of the window.
    while (times.length && times[0] < windowStart) times.shift();

    if (times.length < MAX_CALLS_PER_MIN) break;

    // At the ceiling: wait for the oldest call to fall out of the window.
    const wait = (times[0] + 60000) - now + 50;
    Utilities.sleep(Math.min(Math.max(wait, 100), 15000));
  }

  times.push(Date.now());
  _callsThisRun++;
  _callsSincePersist++;

  // Persisting on every call would cost more than the calls themselves, but the
  // tail has to survive the execution boundary or back-to-back runs could burst.
  if (_callsSincePersist >= 10) persistCallTimes();
}

/** Calls made so far in this execution — surfaced in SyncLog. */
function callsThisRun() { return _callsThisRun; }

function tornGet(path, selections, key, extra) {
  awaitCallSlot();

  let url = 'https://api.torn.com/' + path +
    '?selections=' + encodeURIComponent(selections) +
    '&key=' + encodeURIComponent(key) +
    '&comment=FrostbiteSheet';

  if (extra) {
    Object.keys(extra).forEach(function (k) {
      if (extra[k] !== undefined && extra[k] !== null && extra[k] !== '') {
        url += '&' + k + '=' + encodeURIComponent(extra[k]);
      }
    });
  }

  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('HTTP ' + res.getResponseCode());

  const json = JSON.parse(res.getContentText());
  if (json.error) throw new Error('Torn error ' + json.error.code + ': ' + json.error.error);
  return json;
}

/* ================================================================== *
 * Reads
 * ================================================================== */

function readCurrent() { return readTab(SHEET_CURRENT, CURRENT_COLUMNS); }
function readPeriods() { return readTab(SHEET_PERIODS, PERIOD_COLUMNS); }

function readTab(name, columns) {
  const sheet = sheetFor(name, columns);
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const header = data[0];
  const out = [];
  for (let i = 1; i < data.length; i++) out.push(rowToObject(header, data[i]));
  return out;
}

function readSnapshotRows(days) {
  const sheet = sheetFor(SHEET_SNAPSHOTS, SNAPSHOT_COLUMNS);
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const header = data[0];
  const dayCol = header.indexOf('day');
  const cutoff = dayMinus(todayUtc(), Math.min(SNAPSHOT_RETENTION_DAYS, Math.max(2, days)));
  const out = [];
  for (let i = 1; i < data.length; i++) {
    if (dayCol !== -1 && normalizeDay(data[i][dayCol]) < cutoff) continue;
    out.push(rowToObject(header, data[i]));
  }
  return out;
}

function snapshotDayRange() {
  const sheet = sheetFor(SHEET_SNAPSHOTS, SNAPSHOT_COLUMNS);
  const last = sheet.getLastRow();
  if (last < 2) return { count: 0, oldest: '' };

  const dayCol = SNAPSHOT_COLUMNS.indexOf('day') + 1;
  const values = sheet.getRange(2, dayCol, last - 1, 1).getValues();
  let oldest = null;
  values.forEach(function (v) {
    const d = normalizeDay(v[0]);
    if (d && (!oldest || d < oldest)) oldest = d;
  });
  return oldest
    ? { count: daysBetween(oldest, todayUtc()) + 1, oldest: oldest }
    : { count: 0, oldest: '' };
}

/* ================================================================== *
 * Sheet plumbing
 * ================================================================== */

function sheetFor(name, columns) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(columns);
    sheet.setFrozenRows(1);
    return sheet;
  }
  // Adopt a tab written by an older version of this script that is missing columns.
  const width = sheet.getLastColumn();
  if (width < columns.length) {
    sheet.getRange(1, 1, 1, columns.length).setValues([columns]);
  }
  return sheet;
}

/**
 * Write the snapshot tab with its day column forced to plain text FIRST.
 *
 * Without this, Sheets parses each written 'yyyy-MM-dd' into a Date value, and
 * every later day comparison then operates on 'Sat Jul 18' rather than
 * '2026-07-18'. The sheet looks entirely correct while every period column
 * silently comes out blank. The format must be applied before setValues, because
 * it governs how the incoming strings get interpreted.
 */
function writeSnapshotTab(sheet, rows) {
  const dayCol = SNAPSHOT_COLUMNS.indexOf('day') + 1;
  sheet.getRange(1, dayCol, sheet.getMaxRows(), 1).setNumberFormat('@');
  writeAll(sheet, SNAPSHOT_COLUMNS, rows);
}

/**
 * Rewrite a whole tab in one call — far cheaper than per-row updates.
 *
 * Deliberately overwrites in place and then trims, rather than clearing first.
 * Apps Script serves concurrent requests as separate executions and reads are not
 * blocked by the write lock, so a clear-then-write leaves a window in which a
 * reader sees an empty tab and a dashboard renders "no members". Writing over the
 * existing values means a reader can at worst catch a mix of old and new rows,
 * which the next refresh corrects.
 */
function writeAll(sheet, columns, rows) {
  const width = columns.length;
  const padded = rows.map(function (r) {
    const copy = r.slice(0, width);
    while (copy.length < width) copy.push('');
    return copy;
  });

  sheet.getRange(1, 1, 1, width).setValues([columns]);
  if (padded.length) sheet.getRange(2, 1, padded.length, width).setValues(padded);

  const surplus = sheet.getLastRow() - (padded.length + 1);
  if (surplus > 0) sheet.deleteRows(padded.length + 2, surplus);

  sheet.setFrozenRows(1);
}

function appendLog(source, members, raised, ignoredLower) {
  const sheet = sheetFor(SHEET_LOG, ['when', 'source', 'members', 'raised', 'ignoredLower', 'tornCalls', 'callsPerMin']);

  // Observed rate over this execution, so a pacing regression shows up in the log
  // rather than as a mystery error 5 weeks later.
  const times = loadCallTimes();
  const spanMin = times.length > 1 ? (times[times.length - 1] - times[0]) / 60000 : 0;
  const rate = spanMin > 0.05 ? Math.round(times.length / spanMin) : '';

  sheet.appendRow([new Date().toISOString(), source, members, raised, ignoredLower, callsThisRun(), rate]);

  const extra = sheet.getLastRow() - 1 - LOG_RETENTION_ROWS;
  if (extra > 0) sheet.deleteRows(2, extra);
}

function indexOf(header) {
  const map = {};
  header.forEach(function (h, i) { map[h] = i; });
  return map;
}

function rowToObject(header, row) {
  const obj = {};
  header.forEach(function (h, i) { obj[h] = row[i]; });
  return obj;
}

function blankToEmpty(v) { return (v === undefined || v === null) ? '' : v; }

/* ================================================================== *
 * Dates — all UTC, matching Torn City Time
 * ================================================================== */

function todayUtc() {
  return Utilities.formatDate(new Date(), 'UTC', 'yyyy-MM-dd');
}

/**
 * Turn whatever came out of a day cell back into a 'yyyy-MM-dd' string.
 *
 * Sheets silently parses a written '2026-07-18' into a Date value, and reading it
 * back gives a Date object whose String() form is 'Sat Jul 18 2026 ...'. Slicing
 * that to ten characters yields 'Sat Jul 18', so every day comparison quietly
 * fails and every period column comes out blank while the data looks perfect in
 * the sheet. Format using the SPREADSHEET's timezone, because that is the zone
 * Sheets used when it parsed the string — going through UTC here would shift the
 * date by a day for anyone whose sheet is set ahead of it.
 */
function normalizeDay(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  }
  return String(value || '').slice(0, 10);
}

function dayMinus(dayString, days) {
  const d = new Date(dayString + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - days);
  return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
}

function daysBetween(fromDay, toDay) {
  const a = new Date(fromDay + 'T00:00:00Z').getTime();
  const b = new Date(toDay + 'T00:00:00Z').getTime();
  return Math.round((b - a) / 86400000);
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
