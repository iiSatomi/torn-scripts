/**
 * v6 DERIVE — stores in, display numbers out.
 *
 * Every function here is PURE: no DOM, no network, no storage, no clock it
 * did not receive. That is the whole point. In v5 the fetching, the
 * arithmetic and the HTML all live in one renderer, so the arithmetic cannot
 * be tested without a browser and has never been tested at all.
 *
 * The money model is the reason this file exists. Getting it wrong does not
 * crash anything — it just quietly reports the wrong number, and a faction
 * leader makes decisions on it.
 */

/* ═══════════════════════════════════════════════════════════════════════════
   THE MONEY MODEL

   The old "NET" column was gross minus item cost — the whole pie BEFORE
   anyone was paid. A "$313m net" OC on an 80% split really left the faction
   about $62m. That is a five-fold overstatement of the only number that
   answers "was this worth running", so the three quantities are now kept
   explicitly separate and never collapsed:

     gross   = cash + reward-item value
     members = cash × split%        counted ONLY for OCs Torn marks paid
     kept    = gross − members − item cost
   ═══════════════════════════════════════════════════════════════════════════ */

/** Default member share by difficulty. Every level is user-editable. */
const DEFAULT_SHARE = { 1: 1.00, 2: 1.00, 3: 0.90, 4: 0.90, 5: 0.80 };

/** The most conservative share configured — the fallback when we do not know. */
function lowestShare(cfg = DEFAULT_SHARE) {
  const vals = Object.values(cfg).filter(Number.isFinite);
  return vals.length ? Math.min(...vals) : 0.80;
}

/**
 * Resolve the member split for one OC.
 *
 * Torn's own recorded percentage ALWAYS wins. A local setting must never
 * rewrite what was actually paid — the setting is a fallback for OCs that
 * have not been paid yet, nothing more.
 *
 * THE TRAP, and why the guard below is so explicit:
 *   Number(null) === 0, and 0 passes isFinite().
 * v5 tested difficulty with isFinite(), so an OC whose difficulty was null
 * scored 0, fell through to the level-1 bucket, and was silently treated as
 * the MOST GENEROUS split — overstating what members were owed on exactly
 * the OCs we knew least about. Unknown must fall back to the LOWEST share,
 * because under-promising is recoverable and over-promising is not.
 *
 * @returns {{pct:number, source:'exact'|'config'|'unknown'}}
 */
function splitFor(oc, cfg = DEFAULT_SHARE) {
  const recorded = oc?.rewards?.payout?.percentage;
  if (typeof recorded === 'number' && Number.isFinite(recorded) && recorded > 0) {
    return { pct: recorded / 100, source: 'exact' };
  }

  const diff = oc?.difficulty;
  // Deliberately NOT isFinite(Number(diff)) — see the trap above. It must be
  // a number already, and a positive one.
  const known = typeof diff === 'number' && Number.isFinite(diff) && diff >= 1;
  if (!known) return { pct: lowestShare(cfg), source: 'unknown' };

  // Levels above the configured table take the highest configured level,
  // which is the lowest share — harder crimes never pay members MORE.
  const levels = Object.keys(cfg).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const bucket = cfg[diff] ?? cfg[levels[levels.length - 1]];
  return { pct: Number.isFinite(bucket) ? bucket : lowestShare(cfg), source: 'config' };
}

/** Has Torn itself recorded this OC as paid? The only authoritative signal. */
function isPaid(oc) {
  return Boolean(oc?.rewards?.payout?.paid_at);
}

/**
 * Join the two stores into one row per completed OC.
 *
 * `profitLedger` holds the money snapshot taken when we saw the OC; the
 * archive holds difficulty and Torn's payout record. Neither alone is enough
 * and neither is authoritative for the other's fields.
 *
 * @param {object} profitLedger  { [ocId]: {name, money, itemValue, cost, executedAt} }
 * @param {object} ocArchive     { [ocId]: {difficulty, rewards:{payout}} }
 */
function ocRows(profitLedger = {}, ocArchive = {}, cfg = DEFAULT_SHARE) {
  return Object.entries(profitLedger).map(([id, p]) => {
    const oc = ocArchive[id] || {};
    const cash = toNum(p.money);
    const items = toNum(p.itemValue);
    const cost = toNum(p.cost);
    const split = splitFor({ ...oc, difficulty: oc.difficulty ?? p.difficulty }, cfg);
    const paid = isPaid(oc);

    const gross = cash + items;
    // Only counted once Torn says it was paid. An unpaid OC's cash is still
    // sitting with the faction, so counting the cut early flatters nobody —
    // it just makes "kept" wrong in the pessimistic direction.
    const members = paid ? cash * split.pct : 0;

    return {
      id, name: p.name || 'Unknown',
      executedAt: toNum(p.executedAt),
      cash, items, cost, gross, members,
      kept: gross - members - cost,
      split: split.pct, splitSource: split.source, paid,
    };
  });
}

/**
 * Aggregate rows into the per-scenario table Money shows.
 *
 * `runs` is a count, `perRun` is derived at the end — never averaged from
 * per-row averages, which would weight a 1-run scenario the same as a
 * 96-run one.
 */
function moneyByScenario(rows = []) {
  const by = new Map();
  for (const r of rows) {
    const g = by.get(r.name) || {
      name: r.name, runs: 0, gross: 0, members: 0, cost: 0, kept: 0,
      paidRuns: 0, estimated: 0,
    };
    g.runs++;
    g.gross += r.gross;
    g.members += r.members;
    g.cost += r.cost;
    g.kept += r.kept;
    if (r.paid) g.paidRuns++;
    if (r.splitSource !== 'exact') g.estimated++;
    by.set(r.name, g);
  }
  return [...by.values()]
    .map(g => ({
      ...g,
      perRun: g.runs ? g.kept / g.runs : 0,
      // If any run in the group used a fallback split, the group's `members`
      // and `kept` are partly estimated and the UI must say so.
      prov: g.estimated === 0 ? 'exact' : g.estimated === g.runs ? 'est' : 'mixed',
    }))
    .sort((a, b) => b.kept - a.kept);
}

/** Faction-wide totals. Same arithmetic, one bucket. */
function moneyTotals(rows = []) {
  const t = { runs: rows.length, gross: 0, members: 0, cost: 0, kept: 0, unpaidCash: 0, unpaidCount: 0 };
  for (const r of rows) {
    t.gross += r.gross; t.members += r.members; t.cost += r.cost; t.kept += r.kept;
    if (!r.paid) { t.unpaidCash += r.cash; t.unpaidCount++; }
  }
  return t;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAYOUT MATCHING — inference, and labelled as such

   Torn does not record which OC a give-funds transfer paid for. So this
   matches gives back to OCs by amount and timing, and every result carries a
   confidence. It is a best guess, and the UI must never draw it as a fact.

   Ported from v5's matchPayouts. The rules below were learned by getting
   them wrong; each one is pinned by a test:

    · Natively-paid OCs produce NO claims. An OC Torn paid through its own
      system never touched the funds log, so a claim for it cannot be settled
      by any real give — it can only steal one from a claim that genuinely
      needs it, corrupting a match elsewhere.

    · Manually-marked-paid OCs DO keep their claims. Those really were paid
      by gives, and letting their claims absorb those gives is what stops the
      same gives being mis-attributed to other OCs.

    · The split must be resolved PER OC. v5 first used one flat percentage;
      on an 80%-split OC that made the expected amount 25% too high, so real
      gives fell outside tolerance and legitimate payments looked unpaid.

    · A name that maps to two different members stays unresolved. Guessing
      attributes someone else's money to the wrong person.
   ═══════════════════════════════════════════════════════════════════════════ */

const PAYOUT_WINDOW_DAYS = 21;    // a give this long after the OC still counts
const PAYOUT_TOLERANCE   = 0.15;  // amount may differ from expected by 15%
const CLOCK_SKEW_GRACE   = 3600;  // a give may predate the OC by up to an hour

/**
 * One claim per participant per unpaid OC: what that member is owed for it.
 * @param {Array} ocs  [{id, name, money, executedAt, participants:{uid:name}, nativePaid}]
 */
function buildClaims(ocs = [], splitOf) {
  const claims = [];
  for (const oc of ocs) {
    if (!(toNum(oc.money) > 0)) continue;
    if (oc.nativePaid) continue;              // see the header — this one matters
    const ids = Object.keys(oc.participants || {});
    if (!ids.length) continue;

    const pct = splitOf(oc);
    const expected = (toNum(oc.money) * pct) / ids.length;
    if (!(expected > 0)) continue;

    for (const uid of ids) {
      claims.push({
        ocId: String(oc.id), ocName: oc.name, uid: String(uid),
        name: oc.participants[uid], expected, ts: toNum(oc.executedAt), matched: null,
      });
    }
  }
  return claims;
}

/**
 * Attach a recipient id to each give.
 *
 * Plain-text news entries carry no XID, so those gives were once dropped from
 * matching entirely. Resolve them by exact case-insensitive name against the
 * claim population — but a name held by two different uids is ambiguous and
 * stays unresolved rather than guessing.
 */
function resolveRecipients(events = {}, claims = []) {
  const nameToUid = Object.create(null);
  for (const c of claims) {
    const k = String(c.name || '').trim().toLowerCase();
    if (!k) continue;
    if (!(k in nameToUid)) nameToUid[k] = c.uid;
    else if (nameToUid[k] !== c.uid) nameToUid[k] = null;   // ambiguous — refuse
  }

  return Object.entries(events)
    .filter(([, e]) => e && toNum(e.amount) > 0)
    .map(([id, e]) => {
      const explicit = e.toId !== null && e.toId !== undefined && e.toId !== '';
      const toId = explicit
        ? String(e.toId)
        : nameToUid[String(e.toName || '').trim().toLowerCase()] || null;
      return { id, ...e, amount: toNum(e.amount), ts: toNum(e.ts), toId, usedBy: [] };
    })
    .filter(e => e.toId)
    .sort((a, b) => a.ts - b.ts);
}

/**
 * Match gives to claims, then summarise per OC.
 *
 * @param {Array} ocs
 * @param {object} events    { [newsId]: {ts, toId, toName, amount} }
 * @param {(oc)=>number} splitOf   returns 0–1. Per OC — never a flat number.
 */
function matchPayouts(ocs = [], events = {}, splitOf = () => 0.8, opt = {}) {
  const windowDays = opt.windowDays ?? PAYOUT_WINDOW_DAYS;
  const tol = opt.tolerance ?? PAYOUT_TOLERANCE;
  const maxGap = windowDays * 86400;

  const claims = buildClaims(ocs, splitOf);
  const evts = resolveRecipients(events, claims);

  /* Pass 1 — confident 1:1 pairings, greedy by best score. Score favours a
     close amount first and a short delay second, so the most defensible
     pairing claims its give before a weaker one can take it. */
  const cands = [];
  for (const c of claims) {
    for (const e of evts) {
      if (e.toId !== c.uid) continue;
      const gap = e.ts - c.ts;
      if (gap < -CLOCK_SKEW_GRACE || gap > maxGap) continue;
      const relErr = Math.abs(e.amount - c.expected) / c.expected;
      if (relErr > tol) continue;
      cands.push({ c, e, relErr, score: relErr * 10 + gap / maxGap });
    }
  }
  cands.sort((a, b) => a.score - b.score);
  for (const cd of cands) {
    if (cd.c.matched || cd.e.usedBy.length) continue;
    cd.c.matched = { eventId: cd.e.id, ts: cd.e.ts, amount: cd.e.amount,
                     relErr: cd.relErr, mode: 'exact', covers: 1 };
    cd.e.usedBy.push(cd.c);
  }

  /* Pass 2 — lump sums. Leaders batch-pay, so one unused give may settle
     several of that member's open claims at once. Needs at least two, because
     a single claim already had its chance at a cleaner 1:1 match. */
  for (const e of evts) {
    if (e.usedBy.length) continue;
    const open = claims
      .filter(c => !c.matched && c.uid === e.toId &&
                   e.ts - c.ts >= -CLOCK_SKEW_GRACE && e.ts - c.ts <= maxGap)
      .sort((a, b) => a.ts - b.ts);
    if (open.length < 2) continue;

    let acc = 0; const take = [];
    for (const c of open) {
      if (acc + c.expected <= e.amount * (1 + tol)) { acc += c.expected; take.push(c); }
    }
    if (take.length < 2 || !(acc > 0)) continue;
    const relErr = Math.abs(e.amount - acc) / acc;
    if (relErr > tol) continue;

    for (const c of take) {
      c.matched = { eventId: e.id, ts: e.ts, amount: e.amount,
                    relErr, mode: 'lump', covers: take.length };
      e.usedBy.push(c);
    }
  }

  /* Summarise per OC. `confidence` is deliberately a word, not a number —
     "high" and "likely" mean different things to a reader, whereas 0.94 vs
     0.91 invites false precision about a guess. */
  const byOc = {};
  for (const c of claims) {
    const o = byOc[c.ocId] || (byOc[c.ocId] = {
      total: 0, matched: 0, paidSum: 0, owedSum: 0, lastTs: 0, minErr: 1, lump: false,
    });
    o.total++;
    if (c.matched) {
      o.matched++; o.paidSum += c.expected;
      o.lastTs = Math.max(o.lastTs, c.matched.ts);
      o.minErr = Math.min(o.minErr, c.matched.relErr);
      if (c.matched.mode === 'lump') o.lump = true;
    } else {
      o.owedSum += c.expected;
    }
  }
  for (const o of Object.values(byOc)) {
    o.full = o.total > 0 && o.matched === o.total;
    o.confidence = !o.full ? (o.matched ? 'partial' : 'none')
                 : o.minErr <= 0.02 ? 'high' : 'likely';
  }

  return { byOc, claims, events: evts, unmatchedEvents: evts.filter(e => !e.usedBy.length) };
}

/** What each member is owed, across every OC. Money › Member earnings. */
function earningsByMember(claims = [], names = {}) {
  const by = new Map();
  for (const c of claims) {
    const g = by.get(c.uid) || {
      uid: c.uid, name: names[c.uid] || c.name || `#${c.uid}`,
      runs: 0, earned: 0, paid: 0,
    };
    g.runs++;
    g.earned += c.expected;
    if (c.matched) g.paid += c.expected;
    by.set(c.uid, g);
  }
  return [...by.values()]
    .map(g => ({ ...g, owed: g.earned - g.paid }))
    .sort((a, b) => b.earned - a.earned);
}

/* ═══════════════════════════════════════════════════════════════════════════
   ROSTER — two stores, because neither one can answer the question alone

   CPR_ARCHIVE holds only the MOST RECENT entry per (member, OC, role). That
   is deliberate: it lets the archive cover every crime a member has run
   without growing by one row per run. The consequence is that it contains no
   run history at all, so it cannot supply runs, success rate, recent form or
   trend — only current CPR, preferred role and best difficulty.

   Everything time-series comes from OC_ARCHIVE. Reading run counts out of
   the CPR archive would silently report "1 run" for a member with 400.
   ═══════════════════════════════════════════════════════════════════════════ */

const SPARK_LEN = 9;   // how many recent runs the sparkline shows

/**
 * Normalise Torn's OC status. Mirrors v5's normOcStatus — the API has used
 * 'successful', 'success', 'failure', 'failed' and 'fail', and anything
 * unrecognised must come back null rather than being guessed at.
 */
function ocOutcome(raw) {
  const s = String(raw || '').toLowerCase().trim();
  if (s === 'successful' || s === 'success') return 'successful';
  if (s === 'failure' || s === 'failed' || s === 'fail') return 'failure';
  if (s === 'expired' || s === 'expire') return 'expired';
  return null;
}

/**
 * Roster rows from the two archives.
 *
 * THE SHAPES HERE ARE THE REAL ONES, read out of v5's slimCrime(). An earlier
 * version guessed them from fixtures and produced a completely empty roster
 * against live data — the most expensive mistake in this rewrite so far, and
 * the reason fixtures must be derived from the writer, never invented:
 *
 *   ocArchive[id] = { id, name, difficulty, status, executed_at,
 *                     rewards: { money, respect, items, payout },
 *                     slots: [ { position, user_id, checkpoint_pass_rate } ] }
 *
 * Two things that are NOT in it and must not be invented:
 *   · `participants` — members live in `slots`, keyed by `user_id`
 *   · a per-member outcome — success belongs to the WHOLE crime (`status`).
 *     So a member's rate means "how often did the crimes I was in succeed",
 *     not "how often did I personally pass". Torn does not publish the
 *     latter, and implying it would blame one member for a crew's failure.
 *
 * @param {object} cprArchive  { [uid]: {name, slots: {[k]: {role, difficulty, cpr, ...}}} }
 * @param {object} ocArchive   see above
 * @param {object} names       uid -> name
 */
function rosterRows(cprArchive = {}, ocArchive = {}, names = {}, opt = {}) {
  const now = opt.now ?? Math.floor(Date.now() / 1000);

  /* Walk the OC archive once, oldest first, collecting per-member run history.
     Sorting here rather than per member keeps this O(n log n) instead of
     O(members × runs) — the archive can hold thousands of OCs. */
  const runsBy = new Map();
  const ocs = Object.values(ocArchive)
    .filter(o => o && Array.isArray(o.slots))
    .sort((a, b) => toNum(a.executed_at) - toNum(b.executed_at));

  for (const o of ocs) {
    // One outcome for the whole crime, shared by everyone who was in it.
    const outcome = ocOutcome(o.status);
    for (const s of o.slots) {
      const uid = s?.user_id == null ? null : String(s.user_id);
      if (!uid) continue;                    // an unfilled seat has no member
      const list = runsBy.get(uid) || [];
      list.push({
        ts: toNum(o.executed_at),
        // An OC nobody ran (expired) is not a failure by anyone — it is
        // excluded from the rate entirely rather than counted as a loss.
        outcome,
        role: s.position || null,
      });
      runsBy.set(uid, list);
    }
  }

  const uids = new Set([...Object.keys(cprArchive), ...runsBy.keys()]);

  return [...uids].map(uid => {
    const cpr = cprArchive[uid] || {};
    const slots = Object.values(cpr.slots || {});
    const runs = (runsBy.get(uid) || []).filter(r => r.outcome === 'successful' || r.outcome === 'failure');

    const passed = runs.filter(r => r.outcome === 'successful').length;
    const recent = runs.slice(-SPARK_LEN);

    return {
      uid,
      name: names[uid] || cpr.name || `#${uid}`,
      runs: runs.length,
      rate: runs.length ? passed / runs.length : null,
      cpr: avg(slots.map(s => toNum(s.cpr)).filter(n => n > 0)),
      best: slots.length ? Math.max(...slots.map(s => toNum(s.difficulty))) : null,
      role: topRole(slots, runsBy.get(uid) || []),
      spark: recent.map(r => (r.outcome === 'successful' ? 's' : 'f')).join(''),
      trend: trendOf(runs),
      last: runs.length ? now - runs[runs.length - 1].ts : null,
    };
  }).sort((a, b) => b.runs - a.runs || String(a.name).localeCompare(String(b.name)));
}

/**
 * Recent form against earlier form, as a signed fraction.
 *
 * Returns null rather than 0 when there is not enough history. Those are
 * different statements — "steady" and "we don't know yet" — and rendering
 * an unknown as a flat line claims something we cannot support.
 */
function trendOf(runs, span = SPARK_LEN) {
  if (runs.length < span * 2) return null;
  const rate = list => list.filter(r => r.outcome === 'successful').length / list.length;
  const recent = runs.slice(-span);
  const before = runs.slice(-span * 2, -span);
  return rate(recent) - rate(before);
}

/** The role a member plays most, preferring observed runs over the archive. */
function topRole(slots, runs) {
  const tally = new Map();
  for (const r of runs) if (r.role) tally.set(r.role, (tally.get(r.role) || 0) + 1);
  if (!tally.size) for (const s of slots) if (s.role) tally.set(s.role, (tally.get(s.role) || 0) + 1);
  if (!tally.size) return null;
  return [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** Mean, or null for an empty set — never NaN, and never a misleading 0. */
function avg(list) {
  return list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : null;
}

/**
 * Seats worth fixing: a high-weight role held below the CPR threshold.
 * Sorted by how much damage the gap is doing, not by how bad the CPR is —
 * a weak member in a low-weight seat is not the problem to solve first.
 */
function riskSeats(activeOcs = [], cprArchive = {}, names = {}, opt = {}) {
  const minCpr = opt.minCpr ?? 70;
  const minWeight = opt.minWeight ?? 20;
  const out = [];

  for (const oc of activeOcs) {
    for (const slot of oc.slots || []) {
      if (!slot.who) continue;                       // empty seats are a different problem
      const cpr = toNum(slot.cpr);
      const w = toNum(slot.w);
      if (!(cpr > 0) || cpr >= minCpr || w < minWeight) continue;
      out.push({
        uid: slot.uid, name: names[slot.uid] || slot.who,
        role: slot.role, cpr, w, oc: oc.name,
        impact: (minCpr - cpr) * w,
      });
    }
  }
  return out.sort((a, b) => b.impact - a.impact);
}

/* ═══════════════════════════════════════════════════════════════════════════
   WAR & CHAINS

   Record shape, from v5's mergeWarsPayload:
     { [warId]: { start, end, target, winner, factions:[{id,name,score,chain}] } }

   `end === 0` means the war has not finished. `winner` is a faction id, and
   it is compared as a STRING everywhere — Torn returns it as a number in some
   payloads and a string in others, and `4 === '4'` is false.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Torn ships lists as arrays (v2) or id-keyed objects (v1 leftovers).
 * Return [{id, ...}] either way — Object.values() would silently drop the ids,
 * which is how a war list can lose track of which war is which.
 */
function tornList(raw) {
  if (Array.isArray(raw)) return raw;
  return Object.entries(raw || {})
    .map(([id, v]) => (v && typeof v === 'object' ? { id, ...v } : { id, value: v }));
}

/** Split a war record into "us" and "them" from our own faction id. */
function sides(war, myFid) {
  const list = war?.factions || [];
  const me = String(myFid ?? '');
  return {
    us: list.find(f => String(f.id) === me) || {},
    them: list.find(f => String(f.id) !== me) || {},
  };
}

/** The war currently running, or null. */
function currentWar(warArchive = {}, myFid, opt = {}) {
  const now = opt.now ?? Math.floor(Date.now() / 1000);
  const live = tornList(warArchive)
    .filter(w => !toNum(w.end) || toNum(w.end) > now)
    .sort((a, b) => toNum(b.start) - toNum(a.start))[0];
  if (!live) return null;

  const { us, them } = sides(live, myFid);
  return {
    id: String(live.id),
    opponent: them.name || 'Unknown faction',
    oppId: them.id || null,
    us: toNum(us.score), them: toNum(them.score),
    target: toNum(live.target),
    // A war with a future start has not begun; one already running has.
    started: toNum(live.start) > 0 && toNum(live.start) <= now,
    startsAt: toNum(live.start),
  };
}

/** Finished wars, newest first. */
function warHistory(warArchive = {}, myFid, opt = {}) {
  const now = opt.now ?? Math.floor(Date.now() / 1000);
  const me = String(myFid ?? '');

  return tornList(warArchive)
    .map(w => {
      const { us, them } = sides(w, me);
      const ended = toNum(w.end) > 0 && toNum(w.end) <= now;
      // Compared as strings deliberately — see the header.
      const winner = w.winner === null || w.winner === undefined ? null : String(w.winner);
      return {
        id: String(w.id),
        opp: them.name || 'Unknown faction',
        start: toNum(w.start), end: toNum(w.end),
        us: ended ? toNum(us.score) : null,
        them: ended ? toNum(them.score) : null,
        result: !ended ? 'pending' : winner === null ? 'unknown' : winner === me ? 'won' : 'lost',
      };
    })
    .sort((a, b) => b.start - a.start);
}

/** Chain archive → display rows, longest-recent first. */
function chainRows(chainArchive = {}) {
  return tornList(chainArchive)
    .map(c => ({
      id: String(c.id),
      len: toNum(c.length ?? c.chain),
      respect: toNum(c.respect),
      start: toNum(c.start), end: toNum(c.end),
    }))
    .filter(c => c.len > 0)
    .sort((a, b) => b.end - a.end || b.start - a.start);
}

/* ═══════════════════════════════════════════════════════════════════════════
   ARMOURY

   From `?selections=utilities` — NOT `armory`, which is not a real selection,
   and NOT `temporary`, which is grenades and flashbangs.

   Shape: { ID, name, type, quantity, available, loaned, loaned_to }
   `loaned_to` is a COMMA-SEPARATED STRING of user ids, not an array.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Parse `loaned_to`. Tolerates a string, an array, empty, or absent. */
function loanHolders(raw) {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  return String(raw ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

/** Current item stock. `available` is what can actually be given out now. */
function itemRows(gearCache = {}) {
  return (gearCache.items || []).map(i => ({
    id: String(i.ID ?? i.id ?? ''),
    name: i.name || `Item #${i.ID ?? i.id ?? '?'}`,
    type: i.type || 'Unknown',
    qty: toNum(i.quantity),
    // Total minus available is NOT always "on loan" — items get consumed too,
    // which is why both are shown rather than one being inferred.
    avail: toNum(i.available),
    loaned: toNum(i.loaned),
    holders: loanHolders(i.loaned_to),
  })).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Who currently holds what.
 *
 * Current holders come from the utilities payload — that is present-tense
 * truth. The news ledger only says when something went OUT; on its own it
 * cannot tell you whether it came back. Using it for "who has this" would
 * keep showing returned items forever.
 *
 * The ledger is still needed for `since`, which the utilities payload does
 * not carry.
 */
function loanRows(gearCache = {}, loanLedger = {}, names = {}, opt = {}) {
  const now = opt.now ?? Math.floor(Date.now() / 1000);
  const overdueAfter = (opt.overdueDays ?? 7) * 86400;

  /* Newest "X gave item to Y" event per (uid, item), for the since stamp.
     NESTED maps rather than a joined "uid|item" key: any separator can in
     principle appear in an item name, and picking one that cannot is how a
     literal NUL byte ended up in this file — invisible in an editor, and
     enough to make every tool treat the source as binary. Two maps have no
     separator to get wrong. */
  const outAt = new Map();                     // uid -> Map(itemName -> newest ts)
  for (const e of Object.values(loanLedger)) {
    if (!e || !e.uid || !e.item) continue;
    let byItem = outAt.get(e.uid);
    if (!byItem) outAt.set(e.uid, byItem = new Map());
    const prev = byItem.get(e.item);
    const ts = toNum(e.ts);
    if (prev === undefined || ts > prev) byItem.set(e.item, ts);
  }

  const rows = [];
  for (const item of itemRows(gearCache)) {
    for (const uid of item.holders) {
      const since = outAt.get(uid)?.get(item.name) ?? null;
      rows.push({
        uid, who: names[uid] || `#${uid}`,
        item: item.name,
        since,
        heldFor: since ? now - since : null,
        // Unknown age is not overdue. Flagging it would nag about items that
        // may have gone out an hour ago.
        overdue: since ? now - since > overdueAfter : false,
      });
    }
  }
  return rows.sort((a, b) => (b.heldFor ?? -1) - (a.heldFor ?? -1));
}

/**
 * Consumption over a window, counted from the armoury ledger.
 *
 * The utilities payload has NO usage field — it is a snapshot of stock, not a
 * history. (An earlier draft of this read `used30` off the item, which does
 * not exist and would have silently reported every item as unused.) Movement
 * counts therefore come from the armouryAction news ledger.
 *
 * KNOWN GAP: distinguishing "consumed" from "loaned out and returned" needs
 * the news-text parser, which is not written yet. Until it is, `used` counts
 * MOVEMENTS, which overstates consumption for reusable tools. `kind` is
 * honoured when present so the parser can drop in without touching this.
 *
 * @param {object} ledger  { [id]: {ts, item, kind?} }
 */
function itemUsage(gearCache = {}, ledger = {}, opt = {}) {
  const now = opt.now ?? Math.floor(Date.now() / 1000);
  const since = now - (opt.days ?? 30) * 86400;

  const moves = new Map();
  for (const e of Object.values(ledger)) {
    if (!e || !e.item || toNum(e.ts) < since) continue;
    if (e.kind && e.kind !== 'use') continue;      // honoured once the parser exists
    moves.set(e.item, (moves.get(e.item) || 0) + 1);
  }

  const rows = itemRows(gearCache).map(i => {
    const used = moves.get(i.name) || 0;
    return {
      ...i, used,
      // Out of stock is urgent. Low relative to the burn rate is a warning —
      // under about a week's supply at the current rate.
      tone: i.avail === 0 ? 'crit' : used > 0 && i.avail < used / 4 ? 'warn' : 'ok',
    };
  });

  const max = Math.max(1, ...rows.map(r => r.used));
  return rows.map(r => ({ ...r, share: r.used / max })).sort((a, b) => b.used - a.used);
}

/* ═══════════════════════════════════════════════════════════════════════════
   LIVE SESSION DATA — crimes in flight, the enemy roster, who is online

   None of this is in a persistent store, because none of it is worth keeping:
   it describes right now. It comes from the payload the dashboard already
   fetches (`faction?selections=crimes,members`) and from the two short-TTL
   caches the War Room maintains.

   These three are the last places the v6 UI was inventing data. Each one used
   to synthesise plausible-looking rows so the layout had something to draw —
   active crimes were the newest COMPLETED ones re-badged "READY", the war room
   was `50 + i * 7` for level and `1 + i * 0.6` for fair fight, and "members
   online" was really "members who ran an OC recently". All three rendered as
   confident fact. Now they read the real thing and return NOTHING when there
   is nothing, which the panes render as an honest empty state.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Crime states that mean "still in flight". Mirrors v5's ACTIVE set exactly. */
const ACTIVE_OC_STATES = new Set([
  'recruiting', 'planning', 'ready', 'blocked',
  'awaiting', 'initiated', 'executing', 'in progress', 'active',
]);

/** Statuses that stop a member taking part, so the crime cannot initiate. */
const BLOCKING_STATES = new Set(['hospital', 'jail', 'traveling', 'abroad']);

/** Short "2d 04h" / "18m" gap. Pure — the clock is always passed in. */
function shortGap(sec) {
  const s = Math.max(0, Math.round(toNum(sec)));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${String(h).padStart(2, '0')}h`;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m`;
}

/**
 * Crimes currently in flight, as the Crimes ▸ Active cards want them.
 *
 * Reads the LIVE crimes payload, whose slot shape is different from the
 * archive's — live carries `user:{id,name}` and `position_info.label`, the
 * archive is slimmed to a bare `user_id` and `position`. Both are read, because
 * this same function must not break if it is ever handed an archived crime.
 *
 * `status` is the card's accent, and it reflects the crime's WORST real problem
 * rather than its phase — a "READY" crime with someone in hospital is not ready,
 * and colouring it green would say it was. The phase still shows as the badge.
 *
 * @param {object} liveCrimes  faction.crimes, id-keyed
 * @param {object} cprArchive  for role weight, and CPR where the slot omits it
 * @param {object} members     uid -> live member, for blocking status
 */
function activeCrimes(liveCrimes = {}, cprArchive = {}, names = {}, members = {}, opt = {}) {
  const now = opt.now ?? Math.floor(Date.now() / 1000);
  const critCpr = opt.critCpr ?? 60;

  return Object.entries(liveCrimes)
    .map(([id, oc]) => ({ id, ...oc }))
    .filter(oc => ACTIVE_OC_STATES.has(String(oc.status || '').toLowerCase()))
    .map(oc => {
      const raw = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || {});
      const slots = raw.filter(Boolean).map(s => {
        const uid = (s.user?.id ?? s.user_id) == null ? null : String(s.user?.id ?? s.user_id);
        const role = s.position_info?.label || s.position || 'Unknown';
        const rec = uid && cprArchive[uid]?.slots?.[`${(oc.name || '').toLowerCase()}|${role.toLowerCase()}`];
        const state = uid ? String(members[uid]?.status?.state || '').toLowerCase() : '';
        return {
          uid, role,
          who: uid ? (names[uid] || s.user?.name || `#${uid}`) : null,
          cpr: s.checkpoint_pass_rate ?? rec?.cpr ?? null,
          // Weight is recorded per run by recordCprHistory, so it is a stored
          // fact rather than a live lookup. 10 is the "no data" floor, not a guess
          // at importance — it keeps a weightless seat out of the risk list.
          w: rec?.weight ?? 10,
          blocked: BLOCKING_STATES.has(state),
          // A filled seat whose required item is not available is a hard blocker:
          // the crime cannot run until someone hands the item over.
          needsItem: Boolean(uid && s.item_requirement && s.item_requirement.is_available === false),
        };
      });

      const filled = slots.filter(s => s.who).length;
      const phase = String(oc.status || '').toLowerCase();
      const trouble = slots.some(s => s.who && (s.blocked || s.needsItem
                                    || (s.cpr != null && s.cpr < critCpr)));

      // Ready means ready. Every seat filled, nobody blocked, nothing missing.
      const status = trouble ? 'crit'
                   : filled === slots.length && slots.length ? 'ready'
                   : 'recruit';

      /* One timer, chosen by what the crime is actually waiting on. An open seat
         has no countdown at all, so saying "~5d" there would be invention —
         that case reads "N seats open", which is the truthful answer. */
      const at = toNum(oc.executed_at) > now ? toNum(oc.executed_at)
               : toNum(oc.ready_at) > now ? toNum(oc.ready_at) : 0;
      const time = at ? shortGap(at - now)
                 : toNum(oc.time_left) > 0 ? '~' + shortGap(oc.time_left)
                 : filled < slots.length ? `${slots.length - filled} open`
                 : 'Ready';

      return {
        id: String(oc.id ?? ''),
        name: oc.name || `OC #${oc.id ?? '?'}`,
        diff: oc.difficulty ?? '?',
        status, badge: (oc.status || 'active').toUpperCase(),
        time, filled, total: slots.length, slots,
      };
    })
    // Soonest first, and crimes with no timer last — they are waiting on people,
    // not on the clock, and belong under the ones about to fire.
    .sort((a, b) => (a.time === 'Ready' ? -1 : 0) - (b.time === 'Ready' ? -1 : 0)
                 || a.name.localeCompare(b.name));
}

/**
 * War Room targets: the enemy roster, with estimates attached where we have them.
 *
 * FFScouter figures are ESTIMATES and the row carries them as such — the pane
 * labels the whole table `est`. `since` is a countdown to the moment they become
 * attackable, which is the only thing anyone actually reads off this screen.
 *
 * @param {object} enemyCache  {at, fid, name, members:[{id,name,level,la,st}]}
 * @param {object} spyCache    {[uid]: {ff, bs}}
 * @param {Map|object} calls   targetId -> [{caller}] from the hit-call sheet
 */
function warRoomTargets(enemyCache = null, spyCache = {}, calls = null, opt = {}) {
  const now = opt.now ?? Math.floor(Date.now() / 1000);
  const callerOf = id => {
    if (!calls) return null;
    const q = typeof calls.get === 'function' ? calls.get(String(id)) : calls[String(id)];
    return q && q.length ? (q[0].caller || null) : null;
  };

  return (enemyCache?.members || []).map(m => {
    const spy = spyCache[String(m.id)] || {};
    const state = String(m.st?.state || '').toLowerCase();
    const until = toNum(m.st?.until);
    const out = until > now ? until - now : 0;
    return {
      uid: String(m.id), name: m.name || `#${m.id}`,
      lvl: toNum(m.level) || null,
      // May genuinely be absent — no FFScouter key, or not yet fetched. The pane
      // must show a dash, never a plausible-looking number.
      ff: spy.ff == null ? null : Number(spy.ff),
      est: spy.bs == null ? null : spy.bs,
      status: state === 'hospital' ? 'hosp' : state === 'jail' ? 'jail'
            : state === 'okay' ? 'ok' : (state || 'ok'),
      since: out ? shortGap(out) : '—',
      readyIn: out,
      called: callerOf(m.id),
    };
  })
  // Attackable soonest first — that is the question the pane exists to answer.
  .sort((a, b) => a.readyIn - b.readyIn || String(a.name).localeCompare(String(b.name)));
}

/**
 * Who is around right now, from the live members payload.
 *
 * Torn reports `last_action.status` directly ("Online"/"Idle"/"Offline"), so
 * this reads it rather than inferring presence from a timestamp. The old version
 * inferred it from how recently someone ran an OC, which is a completely
 * different question and was wrong for anyone who simply hadn't run one.
 *
 * Returns null when there is no live roster at all — the card then says so
 * instead of reporting a confident zero.
 */
function presence(members = {}, opt = {}) {
  const now = opt.now ?? Math.floor(Date.now() / 1000);
  const list = Object.entries(members).map(([k, m]) => ({ ...m, id: String(m?.id ?? k) }));
  if (!list.length) return null;

  const rank = { Online: 0, Idle: 1, Offline: 2 };
  const rows = list.map(m => {
    const la = String(m.last_action?.status || '');
    const ts = toNum(m.last_action?.timestamp);
    const st = String(m.status?.state || '').toLowerCase();
    return {
      uid: m.id, name: m.name || `#${m.id}`,
      // Fall back to the timestamp only when Torn omits the label.
      state: la || (ts && now - ts < 900 ? 'Online' : ts && now - ts < 3 * 3600 ? 'Idle' : 'Offline'),
      abroad: st === 'traveling' || st === 'abroad',
      hospital: st === 'hospital' || st === 'jail',
      okay: st === 'okay',
      level: toNum(m.level) || null,
      idleFor: ts ? now - ts : null,
    };
  }).sort((a, b) => (rank[a.state] ?? 3) - (rank[b.state] ?? 3)
                 || String(a.name).localeCompare(String(b.name)));

  return {
    total: rows.length,
    online: rows.filter(r => r.state === 'Online').length,
    idle: rows.filter(r => r.state === 'Idle').length,
    offline: rows.filter(r => r.state === 'Offline').length,
    abroad: rows.filter(r => r.abroad).length,
    hospital: rows.filter(r => r.hospital).length,
    // Able to act right now: not in hospital, not travelling, and at the keyboard.
    ready: rows.filter(r => r.okay && r.state === 'Online').length,
    rows,
  };
}

/** Coerce to a finite number. null/undefined/'' all become 0, not NaN. */
function toNum(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_SHARE, lowestShare, splitFor, isPaid,
    ocRows, moneyByScenario, moneyTotals,
    PAYOUT_WINDOW_DAYS, PAYOUT_TOLERANCE,
    buildClaims, resolveRecipients, matchPayouts, earningsByMember,
    SPARK_LEN, rosterRows, trendOf, topRole, riskSeats,
    tornList, sides, currentWar, warHistory, chainRows,
    loanHolders, itemRows, loanRows, itemUsage,
    ACTIVE_OC_STATES, BLOCKING_STATES, shortGap,
    activeCrimes, warRoomTargets, presence,
  };
}
