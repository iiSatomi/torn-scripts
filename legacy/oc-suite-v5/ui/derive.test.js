/**
 * Tests for the derive layer.
 *
 *   node ui/derive.test.js
 *
 * These are the tests v5 could never have: the arithmetic lived inside a
 * renderer, so checking it meant rendering it. Here it is a pure function and
 * the awkward cases are one line each.
 */
const {
  DEFAULT_SHARE, lowestShare, splitFor, isPaid,
  ocRows, moneyByScenario, moneyTotals,
} = require('./derive.js');

let failed = 0;
const ok = (label, cond, detail) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + label);
  if (!cond) { failed++; if (detail) console.log('      ' + detail); }
};
const section = s => console.log('\n' + s);
const near = (a, b) => Math.abs(a - b) < 0.5;

/* ── Split resolution ────────────────────────────────────────────────────── */
section('Torn’s recorded split always beats the local setting');
{
  const oc = { difficulty: 1, rewards: { payout: { percentage: 65 } } };
  const s = splitFor(oc);
  ok('a recorded percentage is used', near(s.pct * 100, 65));
  ok('…and is marked exact', s.source === 'exact');
  ok('…even though difficulty 1 is configured at 100%',
     DEFAULT_SHARE[1] === 1 && s.pct !== 1,
     'a setting must never rewrite what was actually paid');
}

section('An unknown difficulty falls back to the LOWEST share');
{
  /* THE v5 BUG. Number(null) === 0, and 0 passes isFinite(), so a null
     difficulty scored 0, matched the level-1 bucket and took the MOST
     generous split — overstating what was owed on exactly the OCs we knew
     least about. Each of these must land on the lowest configured share. */
  const lowest = lowestShare();
  ok(`the lowest configured share is ${lowest * 100}%`, near(lowest * 100, 80));

  for (const [label, diff] of [
    ['null', null], ['undefined', undefined], ['zero', 0],
    ['a string', '1'], ['NaN', NaN], ['negative', -1],
  ]) {
    const s = splitFor({ difficulty: diff });
    ok(`difficulty ${label.padEnd(9)} → ${(s.pct * 100).toFixed(0)}% (${s.source})`,
       near(s.pct, lowest) && s.source === 'unknown',
       `got ${s.pct * 100}% — a generous default here overstates what members are owed`);
  }
}

section('Known difficulties use their configured share');
{
  ok('level 1 → 100%', near(splitFor({ difficulty: 1 }).pct * 100, 100));
  ok('level 3 → 90%',  near(splitFor({ difficulty: 3 }).pct * 100, 90));
  ok('level 5 → 80%',  near(splitFor({ difficulty: 5 }).pct * 100, 80));
  ok('…and they are marked as config, not exact',
     splitFor({ difficulty: 3 }).source === 'config');
  ok('a level above the table takes the hardest configured bucket, never more',
     near(splitFor({ difficulty: 9 }).pct * 100, 80),
     'harder crimes must not pay members a larger share by accident');

  const custom = { 1: 0.5, 2: 0.5 };
  ok('a custom table is respected', near(splitFor({ difficulty: 1 }, custom).pct, 0.5));
  ok('…including its own lowest as the unknown fallback',
     near(splitFor({ difficulty: null }, custom).pct, 0.5));
}

/* ── The model ───────────────────────────────────────────────────────────── */
section('Gross, members and kept stay separate');
{
  /* The worked example from CLAUDE.md: a $313m OC on an 80% split. The old
     "net" column reported gross minus cost and called it profit. */
  const ledger = { '1': { name: 'Break the Bank', money: 313_090_000, itemValue: 0, cost: 0 } };
  const archive = { '1': { difficulty: 5, rewards: { payout: { percentage: 80, paid_at: 1 } } } };
  const [r] = ocRows(ledger, archive);

  ok('gross is everything the OC produced', near(r.gross, 313_090_000));
  ok('members take 80% of the cash', near(r.members, 250_472_000));
  ok(`kept is ~$62.6m, not $313m (got $${(r.kept / 1e6).toFixed(1)}m)`,
     near(r.kept, 62_618_000),
     'this five-fold overstatement is exactly what the old NET column did');
}

section('Item value counts toward gross; item cost comes off kept');
{
  const ledger = { '1': { name: 'X', money: 100, itemValue: 50, cost: 30 } };
  const archive = { '1': { difficulty: 5, rewards: { payout: { percentage: 80, paid_at: 1 } } } };
  const [r] = ocRows(ledger, archive);
  ok('gross = cash + item value', near(r.gross, 150));
  ok('members take a cut of CASH only, not of reward items', near(r.members, 80));
  ok('kept = gross − members − cost', near(r.kept, 40));
}

section('An unpaid OC has not paid anyone yet');
{
  const ledger = { '1': { name: 'X', money: 1000, itemValue: 0, cost: 0 } };
  const unpaid = { '1': { difficulty: 5, rewards: { payout: { percentage: 80 } } } };
  const [r] = ocRows(ledger, unpaid);
  ok('no member cut is counted before Torn marks it paid', r.members === 0);
  ok('…so the whole gross is still with the faction', near(r.kept, 1000));
  ok('…and it is flagged unpaid', r.paid === false);

  const paid = { '1': { difficulty: 5, rewards: { payout: { percentage: 80, paid_at: 123 } } } };
  ok('paid_at is what makes it paid', ocRows(ledger, paid)[0].paid === true);
}

section('Missing and malformed data degrades to zero, never NaN');
{
  const [r] = ocRows({ '1': { name: 'X' } }, {});
  ok('an entry with no figures yields zeros', r.gross === 0 && r.kept === 0);
  ok('…and never NaN', Object.values(r).every(v => typeof v !== 'number' || Number.isFinite(v)),
     JSON.stringify(r));

  const [j] = ocRows({ '1': { name: 'X', money: 'abc', cost: null, itemValue: undefined } }, {});
  ok('junk values coerce to 0', j.gross === 0 && j.cost === 0);

  ok('an OC with no archive entry still produces a row',
     ocRows({ '9': { name: 'Orphan', money: 100 } }, {}).length === 1,
     'the archive can lag the profit ledger; dropping the row would hide money');
}

/* ── Aggregation ─────────────────────────────────────────────────────────── */
section('Scenario aggregation');
{
  const paidAt80 = { difficulty: 5, rewards: { payout: { percentage: 80, paid_at: 1 } } };
  const rows = ocRows(
    {
      a: { name: 'Bank', money: 1000, cost: 100 },
      b: { name: 'Bank', money: 2000, cost: 200 },
      c: { name: 'Heist', money: 500, cost: 0 },
    },
    { a: paidAt80, b: paidAt80, c: paidAt80 },
  );
  const out = moneyByScenario(rows);

  ok('one row per scenario', out.length === 2);
  const bank = out.find(g => g.name === 'Bank');
  ok('runs are counted', bank.runs === 2);
  ok('gross sums', near(bank.gross, 3000));
  ok('members sum', near(bank.members, 2400));
  ok('kept sums', near(bank.kept, 300));
  ok('per-run is total kept ÷ runs, not an average of averages',
     near(bank.perRun, 150));
  ok('sorted by what the faction actually keeps', out[0].name === 'Bank');
}

section('Aggregates admit when they are partly estimated');
{
  const known = { difficulty: 5, rewards: { payout: { percentage: 80, paid_at: 1 } } };
  const guess = { difficulty: null };

  const allExact = moneyByScenario(ocRows({ a: { name: 'X', money: 1 } }, { a: known }));
  ok('every run recorded → exact', allExact[0].prov === 'exact');

  const allGuess = moneyByScenario(ocRows({ a: { name: 'X', money: 1 } }, { a: guess }));
  ok('no run recorded → est', allGuess[0].prov === 'est');

  const some = moneyByScenario(ocRows(
    { a: { name: 'X', money: 1 }, b: { name: 'X', money: 1 } }, { a: known, b: guess }));
  ok('some recorded, some not → mixed', some[0].prov === 'mixed',
     'rounding this to "exact" would present a guess as a measurement');
}

section('Faction totals');
{
  const paid = { difficulty: 5, rewards: { payout: { percentage: 80, paid_at: 1 } } };
  const rows = ocRows(
    { a: { name: 'X', money: 1000, cost: 100 }, b: { name: 'Y', money: 500 } },
    { a: paid, b: { difficulty: 5 } },
  );
  const t = moneyTotals(rows);
  ok('gross totals across scenarios', near(t.gross, 1500));
  ok('unpaid cash is tracked separately', near(t.unpaidCash, 500));
  ok('…and counted', t.unpaidCount === 1);
  ok('an empty ledger totals to zeros, not NaN',
     Object.values(moneyTotals([])).every(Number.isFinite));
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAYOUT MATCHING
   ═══════════════════════════════════════════════════════════════════════════ */
const {
  buildClaims, resolveRecipients, matchPayouts, earningsByMember,
} = require('./derive.js');

const DAY = 86400;
const oc = (o = {}) => ({
  id: '1', name: 'Bank', money: 1000, executedAt: 10 * DAY,
  participants: { '100': 'Alice', '200': 'Bob' }, nativePaid: false, ...o,
});
const half = () => 1.0;   // 100% split → expected = money / crew

section('A natively-paid OC produces no claims');
{
  ok('an OC Torn paid itself is excluded',
     buildClaims([oc({ nativePaid: true })], half).length === 0,
     'it never touched the funds log, so its claims can only steal a give ' +
     'from a claim that genuinely needs one');
  ok('an unpaid OC produces one claim per participant',
     buildClaims([oc()], half).length === 2);
  ok('an OC with no cash produces none', buildClaims([oc({ money: 0 })], half).length === 0);
  ok('an OC with no participants produces none',
     buildClaims([oc({ participants: {} })], half).length === 0);
}

section('The split is resolved per OC, not flat');
{
  /* v5's original flat percentage made the expected amount 25% too high on an
     80%-split OC, pushing real gives outside tolerance so genuine payments
     looked unpaid. */
  const eighty = { '1': { ts: 10 * DAY + 3600, toId: '100', amount: 400 } };
  const perOc = matchPayouts([oc()], eighty, () => 0.8);
  ok('an 80% split expects $400 each and matches',
     perOc.byOc['1'].matched === 1);

  const flat = matchPayouts([oc()], eighty, () => 1.0);
  ok('…while a flat 100% expects $500 and misses it entirely',
     flat.byOc['1'].matched === 0,
     'this is the bug that made real payouts read as unpaid');
}

section('Timing rules');
{
  const at = ts => ({ '1': { ts, toId: '100', amount: 500 } });
  const m = ev => matchPayouts([oc()], ev, half).byOc['1'].matched;

  ok('a give the next day matches', m(at(11 * DAY)) === 1);
  ok('a give 20 days later still matches', m(at(30 * DAY)) === 1);
  ok('a give 22 days later is outside the window', m(at(32 * DAY)) === 0);
  ok('a give an hour BEFORE the OC is allowed (clock skew)',
     m(at(10 * DAY - 1800)) === 1);
  ok('…but two hours before is not', m(at(10 * DAY - 7200)) === 0);
}

section('Amount tolerance');
{
  const amt = a => ({ '1': { ts: 11 * DAY, toId: '100', amount: a } });
  const m = a => matchPayouts([oc()], amt(a), half).byOc['1'].matched;
  ok('an exact amount matches', m(500) === 1);
  ok('10% under matches', m(450) === 1);
  ok('20% under does not', m(400) === 0);
  ok('20% over does not', m(600) === 0);
}

section('One give settles one claim');
{
  const events = { e1: { ts: 11 * DAY, toId: '100', amount: 500 } };
  const r = matchPayouts([oc()], events, half);
  ok('only the matching member is settled', r.byOc['1'].matched === 1);
  ok('the other is still owed', near(r.byOc['1'].owedSum, 500));
  ok('the OC is not fully paid', r.byOc['1'].full === false);
  ok('…and reports partial confidence', r.byOc['1'].confidence === 'partial');

  const both = {
    e1: { ts: 11 * DAY, toId: '100', amount: 500 },
    e2: { ts: 11 * DAY, toId: '200', amount: 500 },
  };
  const full = matchPayouts([oc()], both, half).byOc['1'];
  ok('both matched → full', full.full === true);
  ok('…exact amounts → high confidence', full.confidence === 'high');

  const loose = {
    e1: { ts: 11 * DAY, toId: '100', amount: 470 },
    e2: { ts: 11 * DAY, toId: '200', amount: 470 },
  };
  ok('both matched but amounts off → "likely", not "high"',
     matchPayouts([oc()], loose, half).byOc['1'].confidence === 'likely');
}

section('Lump-sum payments');
{
  /* Leaders batch-pay: one transfer covering several OCs for one member. */
  const ocs = [
    oc({ id: 'a', executedAt: 10 * DAY, participants: { '100': 'Alice' } }),
    oc({ id: 'b', executedAt: 11 * DAY, participants: { '100': 'Alice' } }),
  ];
  const lump = { e1: { ts: 12 * DAY, toId: '100', amount: 2000 } };
  const r = matchPayouts(ocs, lump, half);
  ok('one give settles both claims', r.byOc.a.matched === 1 && r.byOc.b.matched === 1);
  ok('…and is flagged as a lump match', r.byOc.a.lump === true);

  const single = [oc({ id: 'a', participants: { '100': 'Alice' } })];
  const r2 = matchPayouts(single, { e1: { ts: 12 * DAY, toId: '100', amount: 3000 } }, half);
  ok('a single claim is NOT settled by a wildly wrong lump',
     r2.byOc.a.matched === 0,
     'one claim already had its chance at a 1:1 match');
}

section('Recipient resolution refuses to guess');
{
  const claims = buildClaims([oc()], half);
  const byName = resolveRecipients({ e1: { ts: 1, toName: 'Alice', amount: 500 } }, claims);
  ok('a plain-text give resolves by name', byName[0]?.toId === '100');

  const ambiguous = buildClaims([
    oc({ id: 'a', participants: { '100': 'Sam' } }),
    oc({ id: 'b', participants: { '999': 'Sam' } }),
  ], half);
  const dropped = resolveRecipients({ e1: { ts: 1, toName: 'Sam', amount: 500 } }, ambiguous);
  ok('a name held by two members is dropped, not guessed', dropped.length === 0,
     'guessing here credits one member with another member’s money');

  const explicit = resolveRecipients(
    { e1: { ts: 1, toId: '200', toName: 'Alice', amount: 500 } }, claims);
  ok('an explicit id always wins over the name', explicit[0].toId === '200');
}

section('Unmatched gives are surfaced, not swallowed');
{
  const r = matchPayouts([oc()], {
    e1: { ts: 11 * DAY, toId: '100', amount: 500 },
    e2: { ts: 11 * DAY, toId: '100', amount: 12345 },
  }, half);
  ok('a give nothing can explain is reported',
     r.unmatchedEvents.length === 1 && r.unmatchedEvents[0].amount === 12345,
     'silently dropping it hides money leaving the faction');
}

section('Member earnings');
{
  const r = matchPayouts([oc()], { e1: { ts: 11 * DAY, toId: '100', amount: 500 } }, half);
  const rows = earningsByMember(r.claims, { '100': 'Alice', '200': 'Bob' });
  ok('one row per member', rows.length === 2);
  const alice = rows.find(x => x.uid === '100');
  const bob = rows.find(x => x.uid === '200');
  ok('a matched claim counts as paid', near(alice.paid, 500) && near(alice.owed, 0));
  ok('an unmatched claim is still owed', near(bob.paid, 0) && near(bob.owed, 500));
  ok('earned is the same for both — they ran the same OC', near(alice.earned, bob.earned));
  ok('names resolve from the cache rather than rendering a uid',
     alice.name === 'Alice' && !/^#/.test(alice.name));
}

section('Empty and malformed input');
{
  const r = matchPayouts([], {}, half);
  ok('no OCs, no events → empty result, no throw',
     Object.keys(r.byOc).length === 0 && r.claims.length === 0);
  ok('a zero-amount give is ignored',
     resolveRecipients({ e1: { ts: 1, toId: '1', amount: 0 } }, []).length === 0);
  ok('earnings of nothing is an empty list', earningsByMember([]).length === 0);
}

/* ═══════════════════════════════════════════════════════════════════════════
   ROSTER
   ═══════════════════════════════════════════════════════════════════════════ */
const { rosterRows, trendOf, topRole, riskSeats } = require('./derive.js');

/**
 * n OCs for one member, `wins` of them successful, oldest first.
 *
 * REAL shape, from v5's slimCrime(): `executed_at`, `status`, and a `slots`
 * ARRAY of `{position, user_id, checkpoint_pass_rate}`. The previous version
 * of this helper invented `executedAt` + `participants`, so the whole roster
 * suite passed against data the real archive never produces — and the roster
 * came out empty the first time it met live storage.
 */
const history = (uid, n, wins, role = 'Muscle') => {
  const out = {};
  for (let i = 0; i < n; i++) {
    out['oc' + i] = {
      id: 'oc' + i, name: 'Bank',
      executed_at: 1000 + i * DAY,
      status: i < wins ? 'Successful' : 'Failure',
      slots: [{ position: role, user_id: Number(uid), checkpoint_pass_rate: 80 }],
    };
  }
  return out;
};

/** One OC in the real shape, for the smaller cases. */
const ocRec = (o = {}) => ({
  id: 'x', name: 'Bank', executed_at: 1000, status: 'Successful',
  slots: [{ position: 'Muscle', user_id: 100, checkpoint_pass_rate: 80 }], ...o,
});

section('Run history comes from the OC archive, not the CPR archive');
{
  /* CPR_ARCHIVE holds one entry per (member, OC, role) — most recent only.
     Counting runs from it would report 1 for a member with 400. */
  const cpr = { '100': { name: 'Alice', slots: { k1: { role: 'Muscle', cpr: 80, difficulty: 7 } } } };
  const [r] = rosterRows(cpr, history('100', 40, 34), {}, { now: 0 });

  ok('runs are counted from the OC archive', r.runs === 40,
     `got ${r.runs} — reading this from the CPR archive would give 1`);
  ok('success rate is computed from those runs', near(r.rate * 100, 85));
  ok('CPR still comes from the CPR archive', r.cpr === 80);
  ok('best difficulty too', r.best === 7);
}

section('A member with no run history is not a failure');
{
  const cpr = { '100': { name: 'Alice', slots: { k: { cpr: 70, difficulty: 5 } } } };
  const [r] = rosterRows(cpr, {}, {});
  ok('runs is 0', r.runs === 0);
  ok('rate is null, not 0%', r.rate === null,
     '0% claims they failed everything; null says we have no data');
  ok('the sparkline is empty rather than all-fail', r.spark === '');
  ok('last-run is null, not "now"', r.last === null);
}

section('Expired OCs are excluded — nobody ran them');
{
  const archive = {
    a: ocRec({ id: 'a', executed_at: 1, status: 'Successful' }),
    b: ocRec({ id: 'b', executed_at: 2, status: 'Expired' }),
    c: ocRec({ id: 'c', executed_at: 3, status: 'Failure' }),
  };
  const [r] = rosterRows({}, archive, {});
  ok('only ran OCs count toward the total', r.runs === 2);
  ok('…so the rate is 50%, not 33%', near(r.rate * 100, 50),
     'counting an expired OC as a loss blames a member for a crime nobody ran');

  /* Torn has shipped several spellings of these. All must normalise. */
  for (const [word, expect] of [['success', 1], ['Successful', 1], ['FAILED', 0]]) {
    const [x] = rosterRows({}, { z: ocRec({ status: word }) }, {});
    ok(`status "${word}" reads as ${expect ? 'a pass' : 'a fail'}`,
       x.runs === 1 && x.rate === expect);
  }
  const [unknown] = rosterRows({}, { z: ocRec({ status: 'Planning' }) }, {});
  ok('an unrecognised status is not counted either way', unknown.runs === 0,
     'guessing here invents a result Torn never reported');
}

section('Sparkline shows the most recent runs, newest last');
{
  /* 12 runs: first 6 fail, last 6 succeed. A 9-slot spark should show the
     tail — three failures then six successes. */
  const archive = {};
  for (let i = 0; i < 12; i++) {
    archive['o' + i] = ocRec({
      id: 'o' + i, executed_at: i, status: i < 6 ? 'Failure' : 'Successful',
    });
  }
  const [r] = rosterRows({}, archive, {});
  ok('the spark is capped at nine', r.spark.length === 9);
  ok(`it is the newest nine, in order (${r.spark})`, r.spark === 'fffssssss',
     'a reversed or leading slice would show the wrong period entirely');
}

section('Trend admits when there is not enough history');
{
  const mk = (n, wins) => Object.values(history('100', n, wins)).map((o, i) => ({
    ts: i, outcome: o.status === 'Successful' ? 'successful' : 'failure',
  }));
  ok('fewer than two full windows → null', trendOf(mk(10, 5)) === null,
     'a flat 0 would claim steady form we cannot actually support');
  ok('exactly two windows is enough', trendOf(mk(18, 9)) !== null);

  /* First nine all fail, second nine all succeed → +100%. */
  const improving = Array.from({ length: 18 }, (_, i) => ({ ts: i, outcome: i < 9 ? 'failure' : 'successful' }));
  ok('improving form reads positive', near(trendOf(improving) * 100, 100));
  const declining = improving.map(r => ({ ...r, outcome: r.outcome === 'successful' ? 'failure' : 'successful' }));
  ok('declining form reads negative', near(trendOf(declining) * 100, -100));
}

section('Top role prefers what was actually observed');
{
  const slots = [{ role: 'Hacker' }];
  const runs = [{ role: 'Muscle' }, { role: 'Muscle' }, { role: 'Thief' }];
  ok('observed runs win over the archive', topRole(slots, runs) === 'Muscle');
  ok('the archive is the fallback', topRole(slots, []) === 'Hacker');
  ok('nothing known → null', topRole([], []) === null);
}

section('Names never render as a bare uid when a name is known');
{
  const [r] = rosterRows({ '100': {} }, {}, { '100': 'Alice' });
  ok('the name cache resolves it', r.name === 'Alice');
  const [u] = rosterRows({ '999': {} }, {}, {});
  ok('an unknown uid is at least marked as one', u.name === '#999');
}

section('Risk seats rank by damage done, not by worst CPR');
{
  const ocs = [{
    name: 'Bank',
    slots: [
      { uid: '1', who: 'A', role: 'Muscle', cpr: 40, w: 5 },   // awful, but trivial seat
      { uid: '2', who: 'B', role: 'Thief',  cpr: 65, w: 45 },  // mild, but critical seat
      { uid: '3', who: 'C', role: 'Hacker', cpr: 95, w: 40 },  // fine
      { uid: '4', who: null, role: 'Empty', cpr: null, w: 50 },// unfilled
    ],
  }];
  const out = riskSeats(ocs, {}, {});

  ok('a low-weight seat is not flagged', !out.some(s => s.uid === '1'),
     'a weak member in a seat that barely matters is not the thing to fix');
  ok('a healthy seat is not flagged', !out.some(s => s.uid === '3'));
  ok('an empty seat is a different problem', !out.some(s => s.uid === '4'));
  ok('the high-weight shortfall is flagged', out[0]?.uid === '2');

  const both = riskSeats([{ name: 'X', slots: [
    { uid: 'a', who: 'A', cpr: 50, w: 25 },   // impact (70-50)*25 = 500
    { uid: 'b', who: 'B', cpr: 65, w: 45 },   // impact (70-65)*45 = 225
  ] }], {}, {});
  ok('ranked by shortfall × weight, so the worse CPR leads here',
     both[0].uid === 'a' && both[1].uid === 'b');
}

section('Roster handles empty and partial stores');
{
  ok('no stores at all → empty list', rosterRows({}, {}, {}).length === 0);
  ok('a member only in the OC archive still appears',
     rosterRows({}, history('55', 3, 2), {}).length === 1,
     'they ran crimes; omitting them hides real activity');
  ok('a member only in the CPR archive still appears',
     rosterRows({ '77': { slots: {} } }, {}, {}).length === 1);
  const [r] = rosterRows({ '1': { slots: {} } }, {}, {});
  ok('missing CPR is null, not 0', r.cpr === null,
     'a 0 would render as a red "0%" and look like a measured failure');
  ok('no numeric field is NaN',
     Object.values(r).every(v => typeof v !== 'number' || Number.isFinite(v)));
}

/* ═══════════════════════════════════════════════════════════════════════════
   WAR, CHAINS, ARMOURY
   ═══════════════════════════════════════════════════════════════════════════ */
const {
  tornList, currentWar, warHistory, chainRows,
  loanHolders, itemRows, loanRows, itemUsage,
} = require('./derive.js');

const MY = '4';
const war = (o = {}) => ({
  id: 'w1', start: 100, end: 0, target: 5000, winner: null,
  factions: [
    { id: '4', name: 'Us', score: 10 },
    { id: '9', name: 'Bravo Company', score: 20 },
  ], ...o,
});

section('Torn list normalisation keeps ids');
{
  ok('an array passes through', tornList([{ id: 'a' }]).length === 1);
  const keyed = tornList({ w1: { start: 1 }, w2: { start: 2 } });
  ok('an id-keyed object becomes a list', keyed.length === 2);
  ok('…with the key preserved as id', keyed.map(x => x.id).sort().join() === 'w1,w2',
     'Object.values() here would lose which war is which');
  ok('null is an empty list, not a throw', tornList(null).length === 0);
}

section('Current war');
{
  const w = currentWar({ w1: war() }, MY, { now: 500 });
  ok('the opponent is the faction that is not us', w.opponent === 'Bravo Company');
  ok('our score is ours', w.us === 10 && w.them === 20);
  ok('a war past its start is running', w.started === true);

  const soon = currentWar({ w1: war({ start: 900 }) }, MY, { now: 500 });
  ok('a scheduled war is not yet started', soon.started === false);
  ok('…but is still the current war', soon.opponent === 'Bravo Company');

  ok('a finished war is not current',
     currentWar({ w1: war({ end: 400 }) }, MY, { now: 500 }) === null);
  ok('no wars at all → null', currentWar({}, MY) === null);
}

section('War results compare faction ids as strings');
{
  /* Torn returns `winner` as a number in some payloads and a string in
     others, and 4 === '4' is false. Both must resolve to a win. */
  const asNum = warHistory({ w1: war({ end: 200, winner: 4 }) }, MY, { now: 500 });
  ok('a numeric winner id is recognised', asNum[0].result === 'won');
  const asStr = warHistory({ w1: war({ end: 200, winner: '4' }) }, MY, { now: 500 });
  ok('a string winner id is recognised', asStr[0].result === 'won');
  ok('someone else winning is a loss',
     warHistory({ w1: war({ end: 200, winner: 9 }) }, MY, { now: 500 })[0].result === 'lost');
  ok('no winner recorded on a finished war is "unknown", not a loss',
     warHistory({ w1: war({ end: 200, winner: null }) }, MY, { now: 500 })[0].result === 'unknown',
     'calling it a loss invents a defeat that may not have happened');
  ok('an unfinished war is pending',
     warHistory({ w1: war() }, MY, { now: 500 })[0].result === 'pending');
  ok('a pending war reports no scores',
     warHistory({ w1: war() }, MY, { now: 500 })[0].us === null);
}

section('Chains');
{
  const rows = chainRows({
    c1: { length: 100, respect: 500, start: 1, end: 2 },
    c2: { length: 2412, respect: 8912, start: 10, end: 20 },
    c3: { length: 0, respect: 0, start: 5, end: 6 },
  });
  ok('zero-length chains are dropped', rows.length === 2);
  ok('newest first', rows[0].id === 'c2');
  ok('`chain` is accepted as an alias for `length`',
     chainRows({ x: { chain: 50, end: 1 } })[0].len === 50);
}

section('loaned_to is a comma-separated STRING, not an array');
{
  ok('a comma string splits', loanHolders('100,200,300').length === 3);
  ok('whitespace is trimmed', loanHolders(' 100 , 200 ')[0] === '100');
  ok('a single id works', loanHolders('100').join() === '100');
  ok('empty is nobody', loanHolders('').length === 0);
  ok('absent is nobody', loanHolders(undefined).length === 0);
  ok('an array is tolerated too', loanHolders(['1', '2']).length === 2,
     'the payload shape has drifted before; both must work');
}

section('Item rows');
{
  const gear = { items: [
    { ID: 1, name: 'RF Detector', type: 'Tool', quantity: 14, available: 9, loaned: 5, loaned_to: '100,200' },
    { ID: 2, name: 'Blueprint', type: 'Material', quantity: 2, available: 0, loaned: 2, loaned_to: '300' },
  ] };
  const rows = itemRows(gear);
  ok('one row per item', rows.length === 2);
  ok('sorted by name', rows[0].name === 'Blueprint');
  const rf = rows.find(r => r.name === 'RF Detector');
  ok('available is carried through', rf.avail === 9);
  ok('holders are parsed', rf.holders.length === 2);
  ok('an item with no name falls back to its id',
     itemRows({ items: [{ ID: 7 }] })[0].name === 'Item #7');
  ok('an empty cache is an empty list', itemRows({}).length === 0);
}

section('Loans use present-tense truth for WHO, the ledger only for WHEN');
{
  const gear = { items: [
    { ID: 1, name: 'RF Detector', quantity: 5, available: 4, loaned: 1, loaned_to: '100' },
  ] };
  /* The ledger also records an older loan to 200 that has since come back.
     If "who has it" came from the ledger, 200 would still be listed. */
  const ledger = {
    e1: { uid: '200', item: 'RF Detector', ts: 1000 },
    e2: { uid: '100', item: 'RF Detector', ts: 5000 },
  };
  const rows = loanRows(gear, ledger, { '100': 'Alice' }, { now: 6000 });

  ok('only the current holder is listed', rows.length === 1 && rows[0].uid === '100',
     'a returned item must stop showing as on loan');
  ok('the name resolves', rows[0].who === 'Alice');
  ok('the ledger supplies when it went out', rows[0].since === 5000);
  ok('held-for is computed from that', rows[0].heldFor === 1000);
  ok('a recent loan is not overdue', rows[0].overdue === false);

  const old = loanRows(gear, ledger, {}, { now: 5000 + 8 * 86400 });
  ok('a loan older than the window is overdue', old[0].overdue === true);

  const noLedger = loanRows(gear, {}, {}, { now: 6000 });
  ok('a holder with no ledger entry still appears', noLedger.length === 1);
  ok('…with an unknown age', noLedger[0].since === null);
  ok('…and is NOT flagged overdue on an unknown age', noLedger[0].overdue === false,
     'nagging about an item that may have gone out an hour ago is noise');
}

section('Item usage is counted from the ledger, not read off the item');
{
  /* The utilities payload is a stock SNAPSHOT with no usage field at all. An
     earlier draft read `used30` off the item, which does not exist — every
     item would have silently reported zero consumption. */
  const gear = { items: [
    { ID: 1, name: 'A', quantity: 10, available: 10 },
    { ID: 2, name: 'B', quantity: 0, available: 0 },
    { ID: 3, name: 'C', quantity: 8, available: 1 },
  ] };
  const NOW = 100 * DAY;
  const ev = (item, ts, n) => Object.fromEntries(
    Array.from({ length: n }, (_, i) => [`${item}${i}`, { item, ts }]));
  const ledger = { ...ev('A', NOW - DAY, 2), ...ev('C', NOW - DAY, 8) };

  const rows = itemUsage(gear, ledger, { now: NOW });
  ok('an item with no usage field still reports real usage',
     rows.find(r => r.name === 'A').used === 2,
     'this is the check that would have caught the invented field');
  ok('sorted by consumption', rows[0].name === 'C');
  ok('the busiest item is the full bar', near(rows[0].share * 100, 100));
  ok('out of stock is critical', rows.find(r => r.name === 'B').tone === 'crit');
  ok('low relative to burn rate is a warning', rows.find(r => r.name === 'C').tone === 'warn');
  ok('healthy stock is fine', rows.find(r => r.name === 'A').tone === 'ok');

  const stale = itemUsage(gear, ev('A', NOW - 90 * DAY, 5), { now: NOW });
  ok('movements outside the window are not counted',
     stale.find(r => r.name === 'A').used === 0);

  const kinds = itemUsage(gear, {
    a: { item: 'A', ts: NOW - DAY, kind: 'use' },
    b: { item: 'A', ts: NOW - DAY, kind: 'return' },
  }, { now: NOW });
  ok('`kind` is honoured when the parser supplies it',
     kinds.find(r => r.name === 'A').used === 1,
     'so the news-text parser can drop in without touching this');

  ok('an empty cache does not divide by zero', itemUsage({}, {}).length === 0);
}

/* ═══════════════════════════════════════════════════════════════════════════
   LIVE SESSION DATA

   These three replaced the last places the v6 UI was inventing rows. Every
   check below is a thing the fabricated versions got wrong by construction:
   they could not read a shape, could not be empty, and could not say "unknown".
   ═══════════════════════════════════════════════════════════════════════════ */
const { activeCrimes, warRoomTargets, presence, shortGap } = require('./derive.js');

{
  const T = 1_000_000;

  section('activeCrimes reads the LIVE slot shape, not the archive’s');
  {
    /* Live carries user:{id,name} and position_info.label; the archive is
       slimmed to user_id and position. Reading only one shape is exactly how
       v5.0.1 gave every archived OC an empty crew. */
    const rows = activeCrimes({
      a: { id: 'a', name: 'Break the Bank', difficulty: 7, status: 'Planning',
           ready_at: T + 3600,
           slots: [{ position_info: { label: 'Muscle' }, user: { id: 9, name: 'Ravager' },
                     checkpoint_pass_rate: 88 }] },
    }, {}, {}, {}, { now: T });

    ok('a live slot resolves its member', rows[0].slots[0].who === 'Ravager');
    ok('…and its role label', rows[0].slots[0].role === 'Muscle');
    ok('…and its CPR', rows[0].slots[0].cpr === 88);

    const archived = activeCrimes({
      a: { id: 'a', name: 'X', status: 'Planning',
           slots: [{ position: 'Hacker', user_id: 4, checkpoint_pass_rate: 70 }] },
    }, {}, { 4: 'Tunabox' }, {}, { now: T });
    ok('the archive shape still resolves, so this cannot break on stale data',
       archived[0].slots[0].who === 'Tunabox' && archived[0].slots[0].role === 'Hacker');
  }

  section('activeCrimes shows the worst problem, not the phase');
  {
    const seat = extra => ({ position: 'Muscle', user_id: 1,
                             checkpoint_pass_rate: 90, ...extra });
    const one = (oc, members = {}) =>
      activeCrimes({ a: { id: 'a', name: 'X', status: 'Ready', slots: [seat(oc)] } },
                   {}, { 1: 'A' }, members, { now: T })[0];

    ok('a clean, fully-crewed crime is ready', one({}).status === 'ready');
    /* A "READY" crime with someone in hospital is not ready. Colouring it green
       would be the UI telling a leader something it knows to be false. */
    ok('a blocked member downgrades it',
       one({}, { 1: { status: { state: 'Hospital' } } }).status === 'crit');
    ok('a missing required item downgrades it',
       one({ item_requirement: { id: 7, is_available: false } }).status === 'crit');
    ok('a critically low CPR downgrades it',
       one({ checkpoint_pass_rate: 41 }).status === 'crit');

    const open = activeCrimes({
      a: { id: 'a', name: 'X', status: 'Recruiting',
           slots: [seat({}), { position: 'Thief', user_id: null }] },
    }, {}, { 1: 'A' }, {}, { now: T })[0];
    ok('an unfilled seat reads as recruiting', open.status === 'recruit');
    ok('…and is counted, not filled', open.filled === 1 && open.total === 2);
    /* An open seat has no countdown, so a time would be invention. */
    ok('…and reports seats open rather than a made-up timer', open.time === '1 open');
  }

  section('activeCrimes ignores everything that is not in flight');
  {
    const rows = activeCrimes({
      a: { id: 'a', name: 'Done', status: 'Successful', slots: [] },
      b: { id: 'b', name: 'Gone', status: 'Expired', slots: [] },
      c: { id: 'c', name: 'Live', status: 'Recruiting', slots: [] },
    }, {}, {}, {}, { now: T });
    ok('completed and expired crimes are dropped',
       rows.length === 1 && rows[0].name === 'Live');
    ok('no live crimes is an empty list, never a placeholder',
       activeCrimes({}, {}, {}, {}, { now: T }).length === 0);
  }

  section('warRoomTargets never invents a stat it does not have');
  {
    const rows = warRoomTargets({
      members: [
        { id: 1, name: 'A', level: 50, st: { state: 'Okay', until: 0 } },
        { id: 2, name: 'B', level: 60, st: { state: 'Hospital', until: T + 600 } },
      ],
    }, { 1: { ff: 2.4, bs: '1.2m' } }, null, { now: T });

    ok('a known fair fight is carried through', rows.find(r => r.uid === '1').ff === 2.4);
    /* No FFScouter key, or the batch has not landed. The pane must show a dash;
       the fabricated version returned `1 + i * 0.6` for everyone. */
    ok('an unknown fair fight is null, not a plausible number',
       rows.find(r => r.uid === '2').ff === null);
    ok('an unknown stat estimate is null too',
       rows.find(r => r.uid === '2').est === null);

    ok('hospital maps to the status the pane expects',
       rows.find(r => r.uid === '2').status === 'hosp');
    ok('…with a countdown to being attackable',
       rows.find(r => r.uid === '2').since === '10m');
    ok('attackable soonest sorts first', rows[0].uid === '1');
    ok('no enemy roster is an empty list', warRoomTargets(null, {}, null).length === 0);

    const called = warRoomTargets({ members: [{ id: 1, name: 'A', st: {} }] }, {},
      new Map([['1', [{ caller: 'iSatomi' }]]]), { now: T });
    ok('a live hit call names its caller', called[0].called === 'iSatomi');
  }

  section('presence reads Torn’s own label, not OC recency');
  {
    const p = presence({
      1: { id: 1, name: 'A', last_action: { status: 'Online' }, status: { state: 'Okay' } },
      2: { id: 2, name: 'B', last_action: { status: 'Idle' }, status: { state: 'Okay' } },
      3: { id: 3, name: 'C', last_action: { status: 'Offline' }, status: { state: 'Hospital' } },
      4: { id: 4, name: 'D', last_action: { status: 'Online' }, status: { state: 'Abroad' } },
    }, { now: T });

    ok('online is counted from the label', p.online === 2);
    ok('idle is counted from the label', p.idle === 1);
    ok('offline is counted from the label', p.offline === 1);
    ok('abroad is a separate axis, not a presence state', p.abroad === 1);
    ok('hospital is counted', p.hospital === 1);
    /* "Able to fight" is okay AND online. Someone asleep and someone in hospital
       are both unavailable, and lumping them together hides which is which. */
    ok('ready means okay and at the keyboard', p.ready === 1);
    ok('online sorts above idle above offline',
       p.rows.map(r => r.state).join() === 'Online,Online,Idle,Offline');

    /* No roster is genuinely different from an empty faction, and the card
       renders them differently — so this must not collapse to zeroes. */
    ok('no live roster returns null, not a confident zero', presence({}) === null);

    const inferred = presence({
      1: { id: 1, name: 'A', last_action: { timestamp: T - 60 } },
    }, { now: T });
    ok('a missing label falls back to the timestamp', inferred.rows[0].state === 'Online');
  }

  section('shortGap');
  {
    ok('days and hours', shortGap(2 * 86400 + 4 * 3600) === '2d 04h');
    ok('hours and minutes', shortGap(3600 + 300) === '1h 05m');
    ok('minutes alone', shortGap(600) === '10m');
    ok('negative time is clamped, never rendered as a negative countdown',
       shortGap(-500) === '0m');
  }
}

console.log(failed ? `\n${failed} check(s) FAILED\n` : '\nAll derive checks passing\n');
process.exit(failed ? 1 : 0);
