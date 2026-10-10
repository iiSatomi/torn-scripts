/**
 * FIXTURES — fake data in v5's REAL store shapes.
 *
 * The prototype's original mock was shaped like the UI: a `roster` array with
 * `runs` and `rate` already computed. That was fine for drawing screens and
 * useless for proving anything, because it skipped the entire derive layer.
 *
 * These are shaped like STORAGE instead — per-OC ledgers, the CPR archive's
 * slots map, `loaned_to` as a comma-separated string — so the real derive
 * functions run over them and the prototype exercises the actual code path.
 * If a derive function is wrong, the screen is now wrong too.
 *
 * Deterministic: the same seed gives the same data every run, so a rendering
 * check can assert on exact figures.
 */

/** Tiny seeded PRNG. Deterministic across runs and platforms. */
function rng(seed = 42) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const MEMBERS = [
  { uid: '3', name: 'iSatomi',    skill: 0.94, role: 'Techie'   },
  { uid: '2', name: 'schtefanos', skill: 0.91, role: 'Imitator' },
  { uid: '1', name: 'MrCallahan', skill: 0.88, role: 'Muscle'   },
  { uid: '5', name: 'juga',       skill: 0.86, role: 'Sniper'   },
  { uid: '4', name: 'Tunabox',    skill: 0.72, role: 'Hacker'   },
  { uid: '6', name: 'Blight',     skill: 0.90, role: 'Cleaner'  },
  { uid: '7', name: 'Ravager',    skill: 0.83, role: 'Robber'   },
  { uid: '8', name: 'Nyx',        skill: 0.77, role: 'Lookout'  },
];

const SCENARIOS = [
  { name: 'Break the Bank',     diff: 8, cash: 4_180_000, items: 90_000, cost: 1_480_000, crew: 6 },
  { name: 'Clinical Precision', diff: 7, cash: 2_240_000, items: 60_000, cost:   860_000, crew: 4 },
  { name: 'Stacking the Deck',  diff: 6, cash: 1_490_000, items: 40_000, cost:   440_000, crew: 5 },
  { name: 'Counter Offer',      diff: 5, cash:   820_000, items: 20_000, cost:   310_000, crew: 4 },
  { name: 'Stage Fright',       diff: 4, cash:   390_000, items: 10_000, cost:   220_000, crew: 3 },
];

const ITEMS = [
  { ID: 1, name: 'RF Detector',     type: 'Tool',     quantity: 14, available:  9, loaned: 5 },
  { ID: 2, name: 'Lock Pick',       type: 'Tool',     quantity: 31, available: 28, loaned: 3 },
  { ID: 3, name: 'Thermal Charge',  type: 'Material', quantity:  6, available:  6, loaned: 0 },
  { ID: 4, name: 'Blueprint',       type: 'Material', quantity:  2, available:  0, loaned: 2 },
  { ID: 5, name: 'Neural Enhancer', type: 'Enhancer', quantity: 19, available: 17, loaned: 2 },
  { ID: 6, name: 'Tension Wrench',  type: 'Tool',     quantity:  0, available:  0, loaned: 0 },
];

/**
 * @param {object} [o]
 * @param {number} [o.now]    unix seconds "now"
 * @param {number} [o.runs]   how many completed OCs to generate
 */
function makeFixtures({ now = 1_760_000_000, runs = 180, seed = 42 } = {}) {
  const rand = rng(seed);
  const DAY = 86400;

  const names = Object.fromEntries(MEMBERS.map(m => [m.uid, m.name]));
  const ocArchive = {};
  const profitLedger = {};
  const cprArchive = {};
  const payoutEvents = {};
  const deposits = {};

  let evId = 1000;

  for (let i = 0; i < runs; i++) {
    const id = 'oc' + i;
    const sc = SCENARIOS[i % SCENARIOS.length];
    // Spread backwards from now, newest last.
    const executedAt = now - (runs - i) * (DAY / 2) - Math.floor(rand() * 3600);

    const crew = [...MEMBERS].sort(() => rand() - 0.5).slice(0, sc.crew);

    /* Outcome belongs to the CRIME, not to each member — that is how Torn
       reports it, and the fixtures must not be kinder than reality. The crew
       succeeds only if everyone would have passed. */
    let allPassed = true;
    for (const m of crew) if (rand() >= m.skill) allPassed = false;
    const status = allPassed ? 'Successful' : 'Failure';

    /* slots is an ARRAY of {position, user_id, checkpoint_pass_rate} — the
       exact shape v5's slimCrime() writes. Generating a friendlier shape here
       is what let an empty roster ship: the tests passed against fixtures the
       real writer never produces. */
    const ocSlots = crew.map(m => ({
      position: m.role,
      user_id: Number(m.uid),
      checkpoint_pass_rate: Math.round(m.skill * 100 - 6 + rand() * 12),
      item_id: null,
    }));

    for (const m of crew) {
      // CPR archive: most recent entry per (member, OC, role) — overwriting
      // on purpose, which is exactly why it cannot supply run counts.
      const rec = cprArchive[m.uid] || (cprArchive[m.uid] = { name: m.name, slots: {} });
      rec.slots[sc.name + '|' + m.role] = {
        ocName: sc.name, role: m.role, difficulty: sc.diff,
        cpr: Math.round(m.skill * 100 - 6 + rand() * 12),
        outcome: allPassed ? 'successful' : 'failure',
        weight: 10 + Math.floor(rand() * 40),
        executedAt,
      };
    }

    /* Payment state, three ways — the mix matters, because each exercises a
       different path: Torn's own record, a give-funds match, and unpaid. */
    const roll = rand();
    const nativePaid = roll < 0.45;
    const paidByGive = !nativePaid && roll < 0.75;

    const cash = Math.round(sc.cash * (0.7 + rand() * 0.6));
    const pct = sc.diff >= 5 ? 80 : sc.diff >= 3 ? 90 : 100;

    /* Field names are v5's, not mine: `executed_at` and `status`, plus the
       full rewards block. Anything that reads `executedAt` or `participants`
       here is reading a field the real archive does not have. */
    ocArchive[id] = {
      id, name: sc.name, difficulty: sc.diff, status,
      executed_at: executedAt,
      slots: ocSlots,
      rewards: {
        money: cash, respect: 100 + Math.floor(rand() * 400), items: [],
        payout: nativePaid
          ? { percentage: pct, paid_at: executedAt + 3600, paid_by: '3' }
          : { percentage: pct, paid_at: null, paid_by: null },
      },
    };
    profitLedger[id] = {
      name: sc.name, money: cash, itemValue: sc.items,
      cost: Math.round(sc.cost * (0.8 + rand() * 0.4)), executedAt,
    };

    if (paidByGive) {
      // One give per participant, close to the expected split — the shape a
      // real leader payout produces, and what matchPayouts has to recognise.
      const each = (cash * (pct / 100)) / crew.length;
      for (const m of crew) {
        payoutEvents['e' + (evId++)] = {
          ts: executedAt + 7200 + Math.floor(rand() * DAY),
          toId: m.uid, toName: m.name,
          amount: Math.round(each * (0.97 + rand() * 0.05)),
        };
      }
    }

    if (rand() < 0.15) {
      deposits['d' + (evId++)] = {
        ts: executedAt + 1800, fromId: crew[0].uid, fromName: crew[0].name,
        amount: Math.round(cash * 0.1),
      };
    }
  }

  /* Armoury. `loaned_to` is a comma-separated STRING — the real payload
     shape, not an array. */
  const holders = { 1: '6,2', 2: '5', 4: '4,8', 5: '8' };
  const gearCache = {
    at: now - 300,
    items: ITEMS.map(i => ({ ...i, loaned_to: holders[i.ID] || '' })),
  };

  const loanLedger = {};
  let lid = 1;
  for (const [itemId, who] of Object.entries(holders)) {
    const item = ITEMS.find(i => String(i.ID) === itemId);
    who.split(',').filter(Boolean).forEach((uid, n) => {
      loanLedger['l' + (lid++)] = {
        ts: now - (n + 1) * 2 * DAY - Math.floor(rand() * DAY),
        uid, item: item.name,
      };
    });
  }
  // A few older movements so usage has something to count.
  for (let i = 0; i < 40; i++) {
    const item = ITEMS[Math.floor(rand() * ITEMS.length)];
    loanLedger['u' + (lid++)] = {
      ts: now - Math.floor(rand() * 30 * DAY), uid: '3', item: item.name, kind: 'use',
    };
  }

  /* War: one finished win, one finished loss, one scheduled. */
  const MY_FID = '4444';
  const warArchive = {
    w1: { id: 'w1', start: now - 41 * DAY, end: now - 39 * DAY, target: 5000, winner: MY_FID,
          factions: [{ id: MY_FID, name: 'Us', score: 5000 }, { id: '9001', name: 'Tenth Circle', score: 1877 }] },
    w2: { id: 'w2', start: now - 19 * DAY, end: now - 17 * DAY, target: 5000, winner: '9002',
          factions: [{ id: MY_FID, name: 'Us', score: 2118 }, { id: '9002', name: 'Deep Six', score: 5000 }] },
    w3: { id: 'w3', start: now + 3 * 3600, end: 0, target: 5000, winner: null,
          factions: [{ id: MY_FID, name: 'Us', score: 0 }, { id: '9003', name: 'Bravo Company', score: 0 }] },
  };

  const chainArchive = {
    c1: { id: 'c1', start: now - 6 * DAY, end: now - 6 * DAY + 7200, length: 500,  respect: 1420 },
    c2: { id: 'c2', start: now - 3 * DAY, end: now - 3 * DAY + 9000, length: 1000, respect: 3140 },
    c3: { id: 'c3', start: now - 12 * 3600, end: now - 10 * 3600,    length: 2412, respect: 8912 },
  };

  /* ── LIVE SESSION ────────────────────────────────────────────────────────
     Crimes in flight, the roster's present-tense status, and the enemy list.
     None of this is persisted anywhere, because none of it is worth keeping —
     it describes right now. In the userscript it comes from the payload
     renderDashboard already fetches plus the War Room's two short-TTL caches;
     here it is fixture data in exactly those shapes.

     The LIVE crime shape differs from the archive's, deliberately, because it
     really does: live carries `user:{id,name}` and `position_info.label`, and
     the archive is slimmed to a bare `user_id` and `position`. A fixture that
     smoothed that over would let a shape bug through. */
  const liveMembers = {};
  MEMBERS.forEach((m, i) => {
    const state = i % 5 === 0 ? 'Hospital' : i % 7 === 3 ? 'Traveling' : 'Okay';
    liveMembers[m.uid] = {
      id: m.uid, name: m.name, level: 20 + ((i * 7) % 80),
      status: { state, until: state === 'Hospital' ? now + 600 + i * 90 : 0,
                description: state === 'Traveling' ? 'Traveling to Japan' : '' },
      last_action: { status: i % 3 === 0 ? 'Online' : i % 3 === 1 ? 'Idle' : 'Offline',
                     timestamp: now - (i % 3) * 4000 },
    };
  });

  /* Three in-flight crimes, one per card state the renderer can show: one clean
     and fully crewed, one short of people, one with a real problem in it. */
  const seatFor = (name, roles, taken) => roles.map((role, i) => ({
    position: role,
    position_info: { label: role },
    user: i < taken ? { id: MEMBERS[(i + 2) % MEMBERS.length].uid,
                        name: MEMBERS[(i + 2) % MEMBERS.length].name } : null,
    checkpoint_pass_rate: i < taken ? 55 + ((i * 13) % 40) : null,
    item_requirement: i === 1 ? { id: 206, is_available: name !== 'Stacking the Deck' } : null,
  }));

  const liveCrimes = {
    l1: { id: 'l1', name: 'Break the Bank', difficulty: 7, status: 'Planning',
          ready_at: now + 2 * DAY + 4 * 3600,
          slots: seatFor('Break the Bank', ['Muscle', 'Thief', 'Robber', 'Muscle #2'], 4) },
    l2: { id: 'l2', name: 'Stacking the Deck', difficulty: 5, status: 'Ready',
          ready_at: now - 60,
          slots: seatFor('Stacking the Deck', ['Imitator', 'Hacker', 'Cat Burglar'], 3) },
    l3: { id: 'l3', name: 'Gone Fission', difficulty: 9, status: 'Recruiting',
          slots: seatFor('Gone Fission', ['Hijacker', 'Imitator', 'Bomber', 'Engineer'], 2) },
  };

  const enemyCache = {
    at: now - 20, fid: '9003', name: 'Bravo Company',
    members: MEMBERS.slice(0, 6).map((m, i) => ({
      id: 'e' + m.uid, name: 'Bravo' + (i + 1), level: 40 + i * 9,
      la: { ts: now - i * 1200, status: i % 2 ? 'Online' : 'Offline' },
      st: i === 2 ? { state: 'Hospital', until: now + 1080 }
        : i === 5 ? { state: 'Jail', until: now + 3840 }
        : { state: 'Okay', until: 0 },
    })),
  };
  // Deliberately incomplete: two enemies have no FFScouter record, so the pane
  // has to render a dash rather than a plausible-looking number.
  const spyCache = {};
  enemyCache.members.slice(0, 4).forEach((e, i) => {
    spyCache[e.id] = { ts: now - 300, ff: 1.2 + i * 0.7, bs: `${(i + 1) * 340}k` };
  });

  return {
    now, myFactionId: MY_FID,
    names, ocArchive, profitLedger, cprArchive,
    payoutEvents, deposits, gearCache, loanLedger, warArchive, chainArchive,
    live: { crimes: liveCrimes, members: liveMembers,
            enemies: enemyCache, spies: spyCache, calls: null },
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { makeFixtures, MEMBERS, SCENARIOS, ITEMS, rng };
}
