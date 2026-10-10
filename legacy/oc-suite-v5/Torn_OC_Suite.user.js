// ==UserScript==
// @name         Torn OC Suite
// @namespace    torn_oc_suite
// @version      5.4.0
// @description  All-in-one faction manager for Torn leaders — OC management, war & chain analytics, war-page command center (War Tools), member activity, armoury tracking, funds and payout accounting.
// @author       iSatomi (3580191)
// @match        https://www.torn.com/factions.php*
// @match        https://www.torn.com/item.php*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @connect      tornprobability.com
// @connect      www.tornstats.com
// @connect      api.torn.com
// @connect      ffscouter.com
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @downloadURL https://update.greasyfork.org/scripts/573001/Torn%20OC%20Manager%20Dashboard.user.js
// @updateURL https://update.greasyfork.org/scripts/573001/Torn%20OC%20Manager%20Dashboard.meta.js
// ==/UserScript==
//
//
// Changelog (recent):
// v5.4.0 — REVERTED the experimental v6 "Central Command" UI. It was an opt-in
//          reskin (the 5.4.0-dev.x line) that never matched the depth of the
//          proven v5 dashboard — thin re-implementations of panes that carry
//          ~200 releases of hard-won detail. Removed entirely (~2,900 lines):
//          no more ❄ New UI button, no ocs_v6_on opt-in, no second shell. The
//          v5 suite everyone actually uses is the whole product again. The one
//          keeper is the "Frostbite" colour theme (Config → Colour Theme) —
//          the v6 palette, but on the working v5 shell. v5-side fixes made
//          along the way (e.g. a CPR lookup-key casing fix) are retained.
// v5.3.0 — THE SHELL REDESIGNED: a navigation rail, a Dashboard, and History
//          rethought. The suite stops being a wall of tabs.
//
//   • 🧭 NAVIGATION RAIL replaces the horizontal tab strip. Five tabs plus up
//     to seven sub-tabs meant TWO full-width strips of chrome before any data,
//     and on a narrow screen they wrapped to four lines. The rail is a 56px
//     column of icons; hover (or 📌 pin, for touch, which has no hover at all)
//     widens it to 190px WITH LABELS.
//     It expands by OVERFLOWING its fixed grid track rather than widening it,
//     so no table ever reflows because the mouse moved — this suite is injected
//     into Torn's ~990px content column, and .ocm-war-deep alone needs 830px.
//     Under 700px it reverts to the horizontal strip: a vertical rail costs too
//     much of a phone screen.
//     Structurally it is a RESTYLE, not a rewrite — initTabs still toggles
//     .active on .ocm-tab / .ocm-tab-pane, so every renderer and all 29 tab
//     tests were unaffected.
//
//   • 🏠 DASHBOARD — a new default landing view answering one question: what
//     needs you right now. Open slots, stuck OCs, risk seats (a high-weight
//     role held below the CPR threshold), members waiting on an item, OCs
//     awaiting payout, members idle 7d+, and the live war/chain. Every card
//     links into the pane that owns the detail; member names open their profile.
//     Assembled from stores already synced, so it costs ZERO extra API calls.
//     A card only appears when it has something to say — an all-clear board is
//     the good outcome, not a wall of zeroes.
//     A RETURNING user keeps their saved tab: nobody gets relocated mid-war.
//
//   • 📊 HISTORY → PERFORMANCE. "History" sat beside "Active OCs", so it read
//     as a time axis and surprised you with a roster; the pane's actual job is
//     performance analysis.
//   • 🗂 SCENARIOS + RUNS MERGED INTO ONE "CRIMES" VIEW. They looked like
//     duplicates for a real reason: both tables opened with the same four
//     columns (OC · success · CPR · money), and the one thing that justified
//     Scenarios — WHICH SEAT FAILS — was hidden behind a row click. Now the
//     weak seat shows ON the master row ("Hacker 67%"), and expanding a crime
//     gives the full seat breakdown AND every run of it, crew included.
//     A saved 'scenarios'/'runs' view migrates instead of landing on nothing.
//   • 👤 ROSTER HAS FACES — 28px avatars, plus a rank column so the top of the
//     table reads as a leaderboard. Cheap because they're small, lazy-loaded
//     and monogram-backed: the picture is decoration over initials that already
//     painted, so a 3.3MB animated GIF can't hold up a row.
//
//   • FIXED, from a live screenshot: every rank number sat ~12px BELOW its own
//     row. Table cells align on the baseline, and a flex container takes its
//     baseline from its first item — here the avatar, which has no text
//     baseline and so contributed its bottom edge.
//   • KPI TILES UNIFIED. kpiTile() emitted inline styles at 56 call sites while
//     .ocm-kpi-tile sat in the stylesheet unused, so every KPI row was pinned to
//     whatever the helper hardcoded. The base look is now the class; only the
//     semantic colour/border overrides stay inline. Tiles gain tabular figures,
//     so numbers line up down a row.
//   • Zero-value tab badges are hidden. A "0" is noise, and in the collapsed
//     rail it sits on top of the icon where noise costs most.
//
//   • TEST TOOLING — found a real hole: `npm run render` CANNOT see any
//     JS-painted table body. Its harness stubs querySelector() to null, so
//     every renderer guarded by `if (!table) return` silently early-returns.
//     The Performance roster had never been exercised by it, in v5.2 or since —
//     the output showed a correct <thead> above an empty <tbody>. Two real-DOM
//     suites now cover what it can't: tests/test_roster.js (rows paint, filters
//     filter, sort reorders, crimes expand) and tests/test_shell.js (rail
//     contract, saved-tab respect, dashboard cards and links).
//     19 suites, 448 checks.
// v5.2.0 — HISTORY REBUILT + MEMBER PROFILES. The pane you could only search,
//          you can now read.
//
//   • THE PROBLEM: Crimes > History was a ~1000-line vertical dump — two KPI
//     tiles, a "Last 5" teaser, five collapsed chart cards nobody opened, and
//     TWO near-identical autocomplete boxes. Member data was SEARCH-ONLY: you
//     had to already know whose name to type. There was no way to rank or scan
//     the faction, which is the actual question a leader has. And per-member
//     facts were scattered across six panes — Crimes > History, People > CPR,
//     People > Activity, Money > Member Earnings, War, Armoury — so "how is
//     this person doing" meant visiting all six and holding it in your head.
//
//   • 👥 ROSTER (new default view). One sortable, filterable table of every
//     player who has run an OC: OCs run, success rate, average CPR with an
//     observed/estimated dot, best difficulty cleared, most-played role, a
//     last-10 outcome sparkline, a trend arrow (last 10 vs the 10 before) and
//     time since their last run. Filter chips for low CPR / no data / left the
//     faction / inactive 14d+. This one table replaces BOTH the old By-Member
//     card and the member search box.
//   • 🗂 SCENARIOS — per-crime success, CPR, respect and money per successful
//     run, and a breakdown nothing has ever shown: WHICH SEAT FAILS. Per-role
//     fill counts, failure rate and average CPR for every scenario. The data
//     was always collected; it just had nowhere to go.
//   • 📋 RUNS — every completed OC, not the newest five, expandable to the crew.
//   • A TIME WINDOW (7d / 30d / 90d / All), which History never had.
//   • The header now states its own provenance honestly. It used to read
//     "of 100 cap" — untrue since the archive backfill landed, which routinely
//     analyses far more than 100.
//   • Five chart cards became ONE collapsed drawer holding the three that earn
//     their space, drawn only when you actually open it.
//
//   • 👤 MEMBER PROFILES. Click any name — Roster, or a crew row in Runs — for
//     one page covering everything the suite knows: identity with status and
//     current OC, an eight-row OC summary, Recent OCs (5, with "load more"),
//     then per-role performance, war, armoury and activity. Built as an in-pane
//     drill-down rather than a modal: Torn's React re-renders strip classes off
//     injected elements (the v5.1.0 vanishing-📌 bug), and it hides the leader
//     shell through one root class exactly the way member mode already does.
//     An open profile SURVIVES the 60s auto-refresh instead of dumping you back
//     to the tab list mid-read.
//   • Money on the profile is what was actually PAID at the recorded split —
//     never the ambiguous gross the money model forbids — with pending payouts
//     shown separately, because that money is still with the faction.
//   • PROFILE PICTURES, cached properly. Torn's profile_image lives on the
//     `profile` selection and its URL carries an unguessable UUID, so it has to
//     be fetched per member: 40 per pass at 400ms, URL cached 30 days (matching
//     Torn's own immutable/31-day policy). Name resolution now asks for
//     `basic,profile` together, so every name it resolves gets its avatar in the
//     SAME request for free.
//     Only URLs are stored, never image bytes — an avatar can be a 3.3MB
//     animated GIF, and base64-ing a roster of those into GM storage would blow
//     the quota for nothing, since the browser caches the bytes anyway.
//     For the same reason avatars appear ONLY on the profile card; every list
//     uses a generated monogram (initials on a uid-hashed colour). The monogram
//     also paints first and the picture fades in when it decodes, so the panel
//     never waits on a download. A member with no picture returns a SHARED
//     silhouette on a different host — accepted URLs are host-whitelisted and
//     must end in the member's own id, so a default face can never appear on
//     half the roster.
//
//   • CLEANUP: renderReferenceSection (1022 lines) deleted after switching the
//     call site, with a before/after function census proving exactly one
//     function was removed — a bad slice destroyed renderFinanceSection once
//     before. 158 lines of dead CSS removed with it (the search-widget and
//     analytics-card rules), keeping the shared selectors that are still live.
//   • FIXED A LATENT CSS BUG found while checking for duplicates: a superseded
//     .ocm-section-title::after block sat LATER in source than the redesigned
//     one, so it silently won — every section chevron rendered 8px after the
//     text in the old ▼ glyph instead of right-aligned ▾. The v3.35 "won by
//     luck of source order" hazard, with the new design on the losing side.
// v5.1.1 — HIT CALLING HARDENED + MEMBER MODE REPAIRED (from live-war feedback).
//
//   • THE 📌 BUTTON KEPT VANISHING — root-caused from a saved copy of the live
//     war page: Torn's React re-renders strip the flex-layout class we add to
//     the attack cell (while leaving our buttons orphaned in it), so the
//     buttons fell out of layout and clipped. The class is now RE-ASSERTED on
//     every reconcile tick, and the button renders FIRST in the cell so when
//     space runs tight the (shrinkable) name pill gives way — never the button.
//   • CALLS ARE EXCLUSIVE NOW. A called target is LOCKED: everyone else sees
//     🔒 with the caller's name instead of a call button (queueing removed).
//     If two people call in the same poll window, the sheet decides who was
//     first and the loser gets a ✗ to withdraw.
//   • CALLED TARGETS SHOW UP IN TORN'S OWN LIST: the whole row tints purple
//     (green when the call is yours) with a left edge bar — visible even
//     where the buttons are cramped. Plus a floating 📌 board button on war
//     pages with a live count of active calls.
//   • THE TIMEOUT IS NOW ABOUT THE TARGET BEING ALIVE, not a flat 15 minutes
//     (which killed calls on long hospital timers before the target even got
//     out, and let a caller squat an attackable target). A call HOLDS while
//     the target sits in hospital/jail, then expires 5 minutes after they're
//     attackable if the caller hasn't hit — the caller's own client logs the
//     timeout release to the sheet so everyone's row unlocks.
//   • MEMBER MODE UNBROKE: it was forcing every leader pane visible, burying
//     its own small panel under empty sub-tab bars and placeholder notes. The
//     leader shell now hides entirely in member mode, and identical open
//     seats (two Muscle slots in the same crime) collapse into one card with
//     an "×N open" count instead of duplicate rows.
// v5.1.0 — 📌 HIT CALLING, shared faction-wide through a Google Sheet.
//
//   • CALL BUTTONS ON THE WAR PAGE (War Tools). Every enemy row gets 📌 —
//     one tap calls the hit and every member running the suite sees a pill
//     with your name on that row within ~20s. A target that's already
//     called shows 🅝 instead: tap it to queue as NEXT on that target
//     ("who called next hit on who"). Your own calls show ✓ (log the hit)
//     and ✗ (release). Calls auto-expire after 15 minutes so nobody squats.
//   • 📌 CALL BOARD — a live panel (button in War > 🛠 Tools and in the War
//     Tools settings): every active call with its queue and age, plus a
//     hits-logged-last-24h tally per member.
//   • THE SHARED BACKEND IS A GOOGLE SHEET — no server, no accounts. One
//     member presses "Copy backend script" in War Tools ⚙, pastes it into a
//     new sheet's Apps Script, deploys it as a Web App (~2 minutes; steps
//     are in the copied text), and shares the /exec URL. Everyone pastes
//     that same URL into their own settings. The sheet itself is the
//     permanent, human-readable log of every call and hit.
//   • As always: calling and logging are COMMUNICATION. No attack, no chat
//     message, no game action happens without a human doing it.
// v5.0.2 — NAMES, PROPERLY, + THE MONEY TAB RETHOUGHT.
//
//   • #ID NAMES KILLED AT THE SOURCE. The archive stores bare user ids, and
//     members who left before the suite existed had no name anywhere — so the
//     Money tables rendered "#2360099". The suite now RESOLVES unknown ids
//     through the user endpoint (40 per pass, paced, cached forever in the
//     persistent name cache, failures retried weekly) and re-renders as names
//     land. Ex-member names fetched with the live window also seed the cache.
//   • MONEY TAB RESTRUCTURED — it had grown redundant and self-contradictory:
//       · Summary's headline "Net Profit" was the ambiguous whole-pie number
//         (revenue − cost, BEFORE payouts) that the money model explicitly
//         forbids, and its By Scenario duplicated Faction Earnings' table
//         with worse columns. Summary is now 📊 OVERVIEW: the honest split —
//         faction kept / gross / paid out / cost, kept-per-run scenario
//         ranking, weekly + monthly — with the pending-payout warning.
//       · The separate 🏦 Faction Earnings sub-tab is GONE (it IS the
//         Overview); a saved 'faction' sub-tab choice migrates to Overview.
//       · 💸 Payouts dropped its "Paid to Each Member" table — it duplicated
//         👤 Member Earnings row-for-row. Payouts now answers one question:
//         which OCs are paid / awaiting, and who was in them.
//     Eight sub-tabs became seven with zero duplicated numbers between them.
// v5.0.1 — POST-5.0 REPAIR PASS (reported from the live faction).
//
//   • MONEY NUMBERS WERE INCOHERENT after the auto-backfill landed: "Paid to
//     members $23.8b across 694 OCs" while every member row showed only ~4
//     OCs / $894m total. Root cause: archived OCs are stored SLIM — their
//     slots carry a bare user_id, but the crew extractor only read the live
//     shape's user.id, so every archived OC had an empty crew. The whole-
//     history payouts counted; the per-member splits didn't. Both now read
//     both shapes, so Member Earnings / Payouts / Faction Earnings agree and
//     cover the full archive.
//   • WAR REPORT TABLE UNREADABLE: 11 fixed-width columns over-constrained
//     the table inside Torn's content column, and fixed layout collapsed the
//     auto-width Member column to nothing (names invisible, headers drawn
//     over each other). Member is pinned at 130px, cells tightened, and the
//     table scrolls sideways in its own container when space runs out.
//   • ARCHIVE-SIZED TABLES CAPPED: Payouts > Paid shows the newest 120 (OCs
//     Ran scrolls the full history); weekly earnings shows the last 26 weeks.
//   • ARMOURY MEMBERS + LOADOUTS DE-CHROMED: the four KPI tiles and the
//     paragraph notes are gone — one quiet stat line, then the table.
// v5.0.0 — THE ALL-IN-ONE FACTION MANAGER. War Tools adopted, deeper war data,
//          faction funds ingestion, auto history, and a fix-everything pass.
//
//   • 🛠 WAR TOOLS ADOPTED (War > Tools). The standalone "Torn War Tools"
//     war-page command center now ships inside the suite: live hospital/
//     travel/jail countdowns painted onto Torn's own war list, hosp-first
//     sorting, per-enemy 📢 callouts and the 📋 mass-callout composer with
//     presets, FFScouter {stats}/{ff} placeholders, offline/idle hiding.
//     Its settings and keys carry over from the standalone (same storage) —
//     UNINSTALL the standalone copy so they don't race; whichever loads
//     first wins the singleton guard. Floating ⚙/📋 buttons now appear only
//     on war pages; everywhere else use War > 🛠 Tools.
//   • WAR REPORTS: THE DEFENSIVE SIDE, IN FULL. The detailed war table now
//     shows how many times the ENEMY hit each member (confirmed via the war
//     bonus even when stealthed, with likely-stealth counts on hover), losses
//     to anyone vs to the enemy, and defends — plus a totals row: war hits,
//     our losses, enemy hits on us, respect. The numbers the old standalone
//     payout-report script showed, now first-class columns.
//   • CARDS STOP FOLDING THEMSELVES. Every <details> card (wars, chains,
//     usage, loadouts) and expanded profile row now survives the 60s refresh
//     — open state is captured before each re-render and restored after.
//   • STUCK TOOLTIPS FIXED. Re-rendering under the cursor orphaned Torn's
//     [title] tooltips, which then never dismissed. Orphaned tooltip nodes
//     are swept after every render pass and on tab switches.
//   • ARMOURY MEMBERS + LOADOUTS, COMPACT. The chip rows ate half the screen.
//     Gear now renders as slot-coloured image TILES (name + slot on hover),
//     weapons and armour share one Gear column, and rows tightened — the
//     full named breakdown still lives in the expanded profile.
//   • ITEM STATUS DECLUTTERED: members whose current role needs no item and
//     who hold nothing on loan are no longer listed.
//   • 🏦 FUNDS (Money) — reads the faction funds log both ways: deposits
//     (cat=depositFunds, cursor-walked like every other sync) alongside the
//     gives already tracked. Per-member deposited vs received vs net, 30d
//     and all-time, plus the recent money flow.
//   • AUTO HISTORY. The full OC-history backfill now runs ITSELF: once when
//     the archive is empty (a few paced minutes, with a toast), then a
//     refresh pass at most weekly — Member/Faction Earnings cover the whole
//     history without pressing a button.
// v4.9.0 — ARMOURY MEMBER PROFILES + QUICK-LOAN PANEL.
//
//   • 👤 MEMBERS (Armoury) — one profile row per member covering everything of
//     the faction's they touch. Weapons and armour render as slot-classified
//     chips (p/s/m · body/gloves/helmet/boots/legs — the classic gear-list
//     layout) with real Torn item art; a FLAGGED column calls out doubled-up
//     slots (two Primaries / two Helmets = one is idle faction property).
//     Rows expand into the member's full profile: per-item consumable usage
//     across 24h / 7d / 30d / all with per-day rates, plus the OC items they
//     hold. Weapon slots come from the item TYPE; armour slots from name
//     keywords (the API doesn't subdivide armour — unknowns stay 'Body').
//     The gear cache now also carries utilities, so OC items held live in the
//     same store (the Loadouts table stays combat-gear-only).
//   • QUICK-LOAN PANEL on the armoury page itself: the OC Status column
//     already knew who needs what — now a panel above the item list lists
//     every member whose OC slot needs an item they don't have, with a
//     Loan ▸ button that opens THIS page's loan form prefilled (same flow as
//     Give ▸, minus the navigation). Not-stocked items say so instead of
//     offering a dead button, and the panel refreshes when Torn re-renders
//     the list after a loan. As always: the human presses LOAN.
// v4.8.0 — ARMOURY OVERHAUL: usage breakdown, names-not-numbers, item images.
//
//   • NAMES, NOT NUMBERS (root-caused). Loadouts and Chains showed "#3580191"
//     because the roster stash was the RAW members payload indexed by uid —
//     but the v2 payload is an ARRAY, so the keys were 0,1,2… and every lookup
//     missed. Names are now normalised by real user id into a PERSISTENT cache
//     (ocs_member_names), so ex-members and pre-refresh renders resolve too.
//     Gear items missing a name in the API payload get their ids resolved once
//     via the torn items endpoint — "#123" is gone from the gear table.
//   • 💊 USAGE BREAKDOWN (Armoury > Loan History). The raw feed was 90% "used
//     one of the faction's Xanax items" spam burying the actual loans. Uses now
//     fold into per-item cards — Torn item image, rolling 24h / 7d / 30d / all
//     counts — each expanding to a per-member table (24h/7d/30d/all, per-day
//     rate, last used). Item images come from a one-time name→id map (single
//     v1 items call, cached forever, retried at most daily; a 💊 placeholder
//     renders until it lands). The All/Loans/Deposits views exclude 'used'
//     lines and note where they went.
//   • ITEM IMAGES everywhere it helps: the event log's item column and the
//     Loadouts "gear on loan" chips now show the real Torn item art.
// v4.7.0 — PAST WARS, DEEP WAR REPORTS, GEAR LOADOUTS, STATS-BAR FIX.
//          (Ideas folded in from the standalone Torn War Payout Report script.)
//
//   • LOAD FULL WAR HISTORY (War > Wars) — one v1 call pulls EVERY ranked war
//     the faction has ever fought into the archive (v2 only returns recent
//     wars). Official per-member reports then fill in via the normal sync,
//     capped at 3 per pass so a long history can't blow the API budget.
//   • DEEP WAR REPORTS — any archived war, however old, gets a "Fetch
//     detailed report" button: walks v1 faction/attacks across that war's own
//     window (paced, deduped, tolerant of Torn's mid-stream short pages) and
//     permanently stores a rich per-member breakdown — wins / off-losses /
//     stalemates / assists / respect, plus the defensive side: beaten by
//     anyone vs by the enemy, confirmed enemy hits in (war bonus is the
//     definitive signal even when stealthed), and defends held. The war card
//     table upgrades automatically, and WAR PAY can now split pots for wars
//     older than the attack ledger.
//   • LOADOUTS — new "Faction gear on loan" table: every faction weapon and
//     armour piece each member currently holds (weapons/armor selections,
//     loaned_to). The API's honest loadout signal — no consent codes needed.
//   • STATS BAR FIX — the six KPI tiles were being jammed onto one line with
//     the recruiting strip (a leftover inline display:flex overriding the
//     grid), truncating "BLOCKED"/"LOW CPR". Now stacked properly, labels
//     never wrap, tiles collapse 6→3→2 columns responsively, and the five
//     main tabs wrap instead of overflowing on narrow screens.
// v4.6.0 — DOCS + TOOLING WRAP-UP for the v4 faction-suite arc.
//
//   • README/CLAUDE.md rewritten for the 5-tab suite: the war data layer's
//     cursor-walk pattern, the polling budget, provenance rules, and the
//     consent-based loadout design are now documented conventions.
//   • npm run render fixed (read the harness dump from harness_out.json,
//     write beside the tests, stamp the real @version) — visual QA works on
//     any machine again, not just the original Linux sandbox.
//   • No new colours were introduced in v4.x — every new component uses the
//     existing theme variables, so the AA-contrast guarantees hold.
// v4.5.0 — ARMOURY LEDGER + LOADOUTS.
//
//   • ARMOURY > LOAN HISTORY — who-did-what for the armoury, parsed from the
//     armoryAction news feed (the API's armoury selections are snapshots; the
//     history only exists as news text). Cursor-walked like every other sync,
//     id-keyed, filter chips for loans/uses/deposits. Unrecognised phrasings
//     keep their raw text — shown, never silently dropped.
//   • ARMOURY > LOADOUTS — honest by design: the Torn API does NOT expose
//     other players' equipped gear, so this works by consent. Opt-in capture
//     (Config or the Loadouts pane) snapshots YOUR equipped items from your
//     own Items page (data-equipped/data-item attributes, fixture-tested,
//     AJAX-rerender-safe); "Copy Loadout Code" produces a compact code
//     members paste into faction Discord; the leader imports codes here.
//     No backend, no scraping other people, no pretending.
//   • item.php is now live: the v4.0 page-router branch runs the capture
//     (still does nothing unless the user opted in).
// v4.4.0 — MEMBER ACTIVITY TRACKER + REVIVE TRACKING.
//
//   • PEOPLE > ACTIVITY — the whole roster sorted most-idle first: last
//     action (amber past 3 days, red past 7), status with hospital/jail
//     countdowns, revivability, in-OC flag, days in faction, and a 14-day
//     presence sparkline. Costs ZERO extra API: it aggregates the members
//     payload every refresh already fetches, at most one stored snapshot per
//     30 minutes, pruned at 90 days. The sparkline honestly shows presence
//     "as this suite saw it" — it is not Torn's own activity log.
//   • WAR > REVIVES — reviver leaderboard (count, success rate, average
//     chance) with 7d/30d/all windows, from the faction revive log
//     (id-keyed, cursor-walked forward like the attack ledger; no backfill
//     endpoint exists, so history builds from the first sync).
// v4.3.0 — WAR PAYOUT CALCULATOR (War > War Pay).
//
//   • Pick any archived war, type in what the cache sold for (the API can't
//     see it), choose the split basis — official Score, official Hits, or
//     observed Respect — plus a flat % that divides evenly and a minimum
//     metric below which a member gets nothing.
//   • Every payout rounds DOWN to $1k and the remainder stays with the
//     faction: the table can never promise more than the pot holds.
//   • Per-member "paid" ticks (tracked per war, like the OC payout ledger),
//     a Discord copy (fixed-width block, 2000-char safe) and a CSV download.
//   • All math lives in pure functions (parseMoneyInput / computeWarPay /
//     warPayRows) covered by tests/test_warpay.js.
// v4.2.0 — LIVE CHAIN WATCHER + WAR ROOM.
//
//   • LIVE CHAIN (War > Live Chain) — current hits, a per-second countdown to
//     the chain dropping (green → amber at 60s → red at 30s), progress to the
//     next bonus milestone, and cooldown state. Polls every 30s ONLY while the
//     pane is open or a chain is live (Torn's server caches 30s anyway); a
//     forced baseline check rides each war-data sync so a starting chain is
//     noticed without the pane open.
//   • WAR ROOM (War > War Room) — live enemy roster during a ranked war:
//     status with hospital-exit countdowns (default sort: attackable soonest),
//     level, last action (highlighted under 15 min), and FFScouter fair-fight
//     + battle-stat estimates (new optional FF key in Config; batch call,
//     cached 24h, shown as estimates — provenance, not fact). Filter chips and
//     sortable headers, both persisted. STRICTLY ADVISORY: rows link to the
//     profile/attack pages, nothing is automated — Torn's rules require every
//     game action to be a direct human click, and this suite complies.
//   • Enemy roster polls every 30s only while the War Room pane is open.
// v4.1.0 — WAR & CHAIN ANALYTICS: the attack ledger and both archives.
//
//   • ATTACK LEDGER — every faction attack, slimmed to ~120 bytes and id-keyed
//     (idempotent re-fetch). Forward sync walks ASCENDING from a cursor so a
//     burst never skips rows; a button-triggered backfill pages 90 days back
//     at the same 900ms pace as the OC backfill, with retries and honest gap
//     reporting. Raw rows prune at 180 days — the per-war/per-chain archives
//     are the permanent record.
//   • WAR TAB > WARS — every ranked war archived forever: scores, winner, and
//     a per-member table merging Torn's OFFICIAL post-war report (score/hits,
//     fetched once per ended war — it's immutable) with OBSERVED numbers from
//     the ledger (war hits, assists, losses, respect ±, avg fair-fight).
//     Same provenance honesty as CPR: official is exact, obs depends on
//     ledger coverage, and the table says so. Ex-members keep the name
//     recorded on their attacks — nothing resolves against the live roster.
//   • WAR TAB > CHAINS — every chain archived, with per-member hit/respect
//     breakdowns from the chain report (fetched once per chain, backing off
//     6h on failure). "Didn't hit" list included.
//   • POLLING — one throttled war-sync group piggybacked on the refresh:
//     every 60s while a ranked war is live, every 5 min otherwise. ~3–4 calls
//     per firing, far inside the shared 100/min budget. No AA on the key ⇒
//     the War panes degrade to a one-line explanation, never a blank pane.
//   • EXPORTS — three new datasets in the export builder: War member stats,
//     Chain history, and the raw attack ledger.
// v4.0.0 — THE FACTION SUITE SHELL. The dashboard grows from 3 tabs to 5:
//          Crimes · People · Money · War · Armoury.
//
//   • WAR (new) — sub-tabs for the features landing over v4.1–v4.4: Live Chain,
//     Wars, Chains, War Room, War Pay, Revives. Placeholders for now; the tab
//     exists so saved-tab state, badges and tests are settled before data lands.
//   • ARMOURY (new) — Loans and Item Status MOVED here from People (they are
//     armoury concerns, and People was carrying six sub-tabs). Their saved
//     sub-tab choice migrates over automatically; container ids are unchanged,
//     so every existing renderer keeps working. Loan History and Loadouts
//     sub-tabs arrive in v4.5.
//   • PEOPLE — gains an Activity sub-tab (v4.4); loans/item badges now count
//     toward the Armoury tab badge instead of People's.
//   • PAGE ROUTER — the script now also matches item.php (for the opt-in
//     self-loadout capture in v4.5). On item.php nothing runs unless that
//     feature is enabled; the factions.php boot is unchanged.
//   • SPACING SYSTEM — one spacing scale (--ocm-gap-1..4, --ocm-pad-card/cell)
//     and three utility classes (.ocm-note, .ocm-kpis, .ocm-flexrow) replace
//     the most-repeated inline padding strings, so panes stop drifting apart
//     visually. New components must use the scale.
// v3.37.0 — Payout-accounting audit: four real bugs in the money numbers.
//
//   1. "PAID TO MEMBERS" COULD READ $0 FOR A PAID OC.
//      The Payouts pane had its OWN memberCutOf that returned 0 whenever Torn's
//      payout record carried no percentage — silently understating "Paid to
//      members", "Faction kept" and every per-member earning. It now uses the
//      same split logic as everywhere else (Torn's recorded % if present, else
//      your per-level share setting), and estimated splits render as "~80%"
//      with a tooltip instead of pretending to be $0.
//
//   2. FUNDS-LOG MATCHING USED THE WRONG EXPECTED AMOUNT.
//      matchPayouts built every claim from the flat legacy share (100%), not the
//      per-OC split — so on an 80%-split OC the expected amount was 25% too high,
//      real gives fell outside the 15% tolerance, and matching quietly failed.
//      Claims now use the same per-OC split as the ledger. Also: OCs paid through
//      Torn's NATIVE payout system no longer generate claims at all — their money
//      never went through the funds log, so their claims could only ever "match"
//      unrelated gives and steal them from real claims.
//
//   3. PLAIN-TEXT GIVES WERE INVISIBLE TO MATCHING.
//      A give whose news entry had no profile link (no XID) was silently dropped.
//      Recipients are now resolved by exact name against the claim population
//      (ambiguous names stay unresolved rather than guessing).
//
//   4. THE NEWS CURSOR COULD JUMP OVER EVENTS FOREVER.
//      The incremental giveFunds fetch asked for from=cursor&sort=DESC&limit=100:
//      if more than 100 gives landed between refreshes, the oldest of them were
//      never fetched and the cursor advanced past them permanently. The fetch is
//      now an ascending walk from the cursor (up to 5 pages per refresh), which
//      catches up instead of skipping.
//
//      All four are locked in by a new suite: tests/test_payout_match.js.
// v3.36.0 — UI refinement pass: the collapse double-click, and the spacing.
//
//   1. DOUBLE-CLICK TO FOLD — root cause found, not patched over.
//      initCollapse() ran ONCE, at inject, BEFORE any data had loaded. At that moment
//      every section title still read "(0)", so it concluded "this section is empty,
//      start it collapsed" and set display:none. Then the data arrived, the count
//      became "(4)", the content was rendered — but the collapse state was NEVER
//      recomputed. The title's .collapsed class and the content's display drifted out
//      of sync, so your first click was toggling a state you couldn't see, and only the
//      second one did anything visible.
//      Fixed properly: the collapse state is re-evaluated after EVERY render
//      (syncStaticCollapse), and the title's class is now the single source of truth
//      that drives the content's display — they can no longer disagree. An explicit
//      choice still wins over the default and survives re-renders.
//      Now covered by a regression test (test_collapse.js, 8 checks).
//
//   2. PADDING.
//      • The six KPI tiles used flex-wrap, which broke them 3+3 and dragged the
//        "Recruiting by Diff" strip into a tall orphan column beside them. They're a
//        6-column GRID now: one line, shrinking together, with the strip on its own
//        full-width line below (3 columns under 720px).
//      • Fill Slots was exempt from the card padding (it holds OC cards), which left
//        its section titles and banners flush against the left edge while the cards
//        inside were deeply padded. That mismatch was most of what read as "bad
//        padding". Everything now shares one left gutter.
//      • "Your OC" and the leader-advice banners were bare divs bleeding to the edge —
//        they're proper cards now, like everything else.
//      • Member cards were the tightest thing on screen: a 5px-radius card with a
//        4px-radius box crammed inside it. Now one radius, real padding, consistent
//        with the rest of the card language.
//      • Consistent vertical rhythm, so a table's last row can't collide with the next
//        blue section header.
// v3.35.0 — The mockup layout, actually built this time.
//           v3.34 restyled the COMPONENTS but left the SHELL alone, which is why the
//           live UI still looked old: the readability of that design comes from its
//           LAYOUT — header, tabs, then cards with air — and the shell was still the
//           cramped original.
//           • HEADER is one clean row: title · version · updated · Legend · Config ·
//             Refresh. The separate #ocm-config-strip (with its "Key saved ✓ · CPR
//             70%/60% · ↻60s" line jammed across the top) is GONE — Config is a header
//             button now, and the key status lives inside the Config panel where you'd
//             look for it.
//           • TABS sit directly under the header as quiet underline tabs, instead of
//             boxed pills buried below a wall of stats.
//           • THE STATS BAR AND ALL THE BANNERS moved INSIDE Crimes > Fill Slots, where
//             they're actually about. They used to sit above the tabs, so People and
//             Money were pushed below a screenful of crime stats that had nothing to do
//             with them.
//           • Stats are now the mockup's KPI TILES — big number, small-caps label.
//           • REMOVED 29 SUPERSEDED CSS RULES. The old .ocm-tab / .ocm-stat / .ocm-subtab
//             definitions were still in the stylesheet. They happened to lose on source
//             order, so the new design won by luck rather than design — exactly the kind
//             of thing that silently reverts the next time someone reorders the CSS.
//           Logic untouched — all seven suites pass unchanged.
// v3.34.0 — UI rebuilt in the design language of the HTML export report.
//           That report reads easily for three concrete reasons, and all three are
//           now applied to the dashboard rather than just its colours:
//             1. ONE blue uppercase header per block. The old .ocm-section-title was a
//                grey gradient strip that read as chrome — everything had equal weight,
//                so nothing had any. It's now a heading, not a title bar.
//             2. A NOTE under every table saying what you're looking at. The old UI
//                showed numbers and assumed you already knew the rules.
//             3. TABULAR FIGURES on every number, right-aligned. Digits line up, so you
//                can scan down a column instead of reading each cell.
//           • Sub-tab panes are now CARDS — content sits inside something with padding
//             instead of bleeding to the edges. (The OC grids are exempt: they're
//             already cards, and a card of cards is just a box in a box.)
//           • THE OC CARD: slot rows are now shaped like every other table in the UI —
//             Role · Member · Item · Wgt · CPR, with a proper header row. Weight moved
//             out of the role label (where it was an italic afterthought) into its own
//             right-aligned column, because it's a number and numbers belong in a
//             column you can scan. You learn the pattern once and it holds everywhere,
//             instead of the OC card being a bespoke thing to decode.
//           • Fixed a contrast bug inherited from the report itself: its --faint was
//             #6e6e7e (3.3:1, below AA) and it's used for KPI sub-labels, which carry
//             real information. Exported reports get the fix too.
//           Logic untouched — all seven test suites pass unchanged.
// v3.33.1 — The per-level member shares are now in CONFIG too, not just in the
//           Money > OCs Ran panel. Same setting, two places — Config is where you'd
//           actually look for it if you wanted to change the scheme later.
//           Both editors write through one saver, which also pushes the new values
//           into the OTHER editor's inputs. Config is built once with the shell while
//           the OCs Ran panel re-renders on every refresh, so without an explicit sync
//           one of them would sit there showing stale numbers and quietly disagreeing
//           with the other — the kind of thing you'd only notice after trusting the
//           wrong figure.
//           Config saves on change (matching every other setting there); the OCs Ran
//           panel keeps its Save button. Both clamp to 0–100 and both have a Reset.
//           Also fixed: my Config markup had TWO class attributes on the same input,
//           so the second was being silently dropped by the browser.
// v3.33.0 — MEMBER SHARE IS NOW PER OC LEVEL, replacing the single global %.
//           Defaults match the common scheme, out of the box:
//               level 1-2 -> 100% to members
//               level 3-4 ->  90%
//               level 5+  ->  80%
//           Every level is editable individually (Money > OCs Ran > "⚖ Member share by
//           level"), so this isn't hard-coded to one faction's rules.
//           The setting is only a FALLBACK, and that distinction matters: when Torn has
//           actually recorded a payout, its real percentage ALWAYS wins. A setting must
//           never be able to rewrite what genuinely happened — it only fills in for OCs
//           that aren't paid yet, or that predate Torn's payout records. The per-OC
//           breakdown now says which one it used.
//
//           Two bugs this surfaced, both mine:
//           • DIFFICULTY WAS NEVER CARRIED onto the finance rows at all. A per-level
//             split is impossible without it — and it also means the "Difficulty" column
//             I added to the CSV/HTML exports in v3.31 has been rendering BLANK. Now
//             threaded through the ledger, the per-OC rows and the exports.
//           • Unknown difficulty returned 100%. Number(null) is 0, which passes isFinite
//             and matches level 1 — so any OC with a missing difficulty was treated as
//             the most generous split possible, overstating what members were owed. It
//             now falls back to the LOWEST configured share instead.
//           • splitOf() was also defined below its first use — a temporal-dead-zone
//             ReferenceError that would have blanked the entire Money tab at runtime.
//             node --check passes it happily; caught by checking definition order.
// v3.32.0 — FULL HISTORY BACKFILL. The dashboard could only ever see the ~100 most
//           recent OCs, because that's all the live crimes call returns. Everything
//           older simply didn't exist: payouts, respect and member earnings all
//           silently began at that cutoff, and there was no way to know what was
//           missing.
//           Scraping Torn's Completed page was the obvious idea and is the wrong one:
//           its "Show more" only expands each card's PROSE NARRATIVE ("iSatomi hacked
//           into the armor display…"), it isn't pagination, it shows 25 cards, and
//           parsing that text would break on any wording change.
//           The crimes API paginates instead:
//             /v2/faction/crimes?cat=completed&filter=executed_at&from=&to=&sort=DESC
//           So this walks BACKWARDS a month at a time and archives everything as
//           structured data — payouts, CPRs, participants, outcomes — permanently,
//           keyed by crime id. Done once; after that it just grows.
//           • Paced at ~66 calls/min, under Torn's 100/min-per-USER limit, which other
//             scripts share. A long history is a couple of minutes, once.
//           • Windows are RETRIED, not skipped. The first version stepped past a failed
//             window, which silently dropped every OC in that month — a permanent hole
//             in the history that nothing would ever report. Caught in testing: it lost
//             22 of 300 OCs to one transient error. Now retries with backoff, and if a
//             window still fails it's reported as a GAP rather than passed off as a
//             complete run.
//           • The archive is merged UNDER the live data (live wins, since payouts land
//             later), so every view — per-OC ledger, payouts, member earnings, weekly
//             buckets, exports — transparently covers the whole history.
//           • NEW: completion rate (success vs failure), now that outcomes go back far
//             enough to mean something. `status` is threaded through the ledger, the
//             per-OC rows and the CSV/HTML exports.
//           • ~300 bytes per archived OC — a thousand OCs is under 100KB.
// v3.31.0 — Money tab rebuilt: collapse fixed, NET disambiguated, exports rewritten.
//
//   1. COLLAPSE WAS FAKE. initCollapse wired a HARD-CODED list of title/content id
//      pairs. Every section rendered at runtime (all the Money panes, Loans, Item
//      Status, Assignments) still got the .ocm-section-title class — and so the ▼
//      chevron — but was never wired. The chevron was decorative. Collapse is now
//      delegated from the root: a dynamic section owns everything between its title
//      and the next title, so it works for whatever a future render produces too.
//      State persists per section.
//
//   2. "NET" WAS AMBIGUOUS, AND THAT MATTERED. It was revenue (cash + reward items)
//      minus item cost — the whole pie the OC produced, BEFORE anyone was paid. It
//      did NOT subtract member payouts. So "Break the Bank: NET $313.09m" on an 80%
//      split really meant: $250.47m to the crew, $62.62m kept by the faction. The
//      headline number was four times the truth. Now split in two:
//        👤 Member Earnings  — what each member actually RECEIVED (cash x split,
//                              divided by crew), only counting OCs Torn marks PAID.
//                              Expandable per member to show which crimes it came from.
//        🏦 Faction Earnings — what the faction actually KEPT (gross − payouts −
//                              materials), per scenario, with "kept per run" — the
//                              number that really ranks crimes. A monster crime on a
//                              90% split can keep less than a modest one at 50%.
//                              Also warns when unpaid cut is inflating the figure.
//      The old Payouts and OCs Ran tabs are untouched.
//
//   3. TRENDS was bucketing by week/month but reporting that same ambiguous net — a
//      number that was neither side's. Removed as a tab; the buckets now live inside
//      Faction Earnings with honest columns (OCs, gross, to members, cost, kept,
//      respect), which is what made them useless before.
//
//   4. EXPORT BUILDER replaces the fixed CSV buttons. Pick any of 6 datasets (per-OC
//      ledger, member earnings, weekly, monthly, by scenario, respect) in any of 4
//      formats:
//        📊 HTML  — standalone report with an inline-SVG chart of members-vs-faction
//                   per week. No external libraries, so it works offline and forever.
//        📄 CSV   — raw numbers for Sheets/Excel. Values are quoted, so a crime name
//                   starting with "=" can't execute as a formula.
//        💬 Discord — fixed-width code blocks, copied to the clipboard. Warns when the
//                   output exceeds Discord's 2000-char limit instead of silently
//                   producing a message that won't send.
//        { } JSON — for bots and other scripts.
//      Datasets and formats are declared separately, so a new dataset works in every
//      format automatically.
// v3.30.0 — Storage keys renamed to match: ocm_* -> ocs_*, WITH a one-time migration.
//           Worth being explicit about why this needed care rather than a find-replace.
//           These keys aren't settings — they hold the CPR archive and the profit /
//           payout ledgers: CPRs and OC results observed over months, reaching back
//           PAST Torn's ~100-OC API window. That history CANNOT be re-fetched; the
//           source data is gone from the API. A bare prefix rename would have left it
//           sitting in storage, unread, and the dashboard would have come up empty
//           forever with no error to explain why.
//           So migrateStorageKeys() copies every value across ONCE, before anything
//           reads storage (config, the TornStats cache and the ledgers are all read
//           during module init). It never clobbers an existing new-style value, so
//           re-running is safe. The old ocm_* keys are deliberately LEFT IN PLACE as
//           a free backup — they cost nothing, and the data is recoverable if this
//           ever misbehaves.
//           Verified against a simulated real install: archive, ledgers, API keys,
//           settings, active tab and sub-tabs all carried across with content intact.
//           (CSS class names stay .ocm-* — they're internal and cosmetic, and churning
//           1600 references would risk breaking layout for zero benefit.)
// v3.29.0 — Renamed: "Torn OC Manager Dashboard" -> "Torn OC Suite".
//           It stopped being a dashboard a while ago. It doesn't just report — it
//           fills the loan form on the armory page, clicks Join on the right slot,
//           annotates Torn's own armory with OC status, and keeps its own CPR archive
//           that outlives the API's ~100-OC window. "Suite" is what it actually is:
//           crew, kit and payouts in one tool.
//           STORAGE KEYS ARE DELIBERATELY UNCHANGED (still ocm_*). They hold the CPR
//           archive and profit/payout ledgers — history built up over real OCs that
//           reaches back PAST Torn's API window and cannot be re-fetched. Renaming the
//           prefix would have silently orphaned all of it for a cosmetic win.
//           NOTE: Tampermonkey keys scripts on @name, so this installs as a NEW script
//           rather than an update. Delete the old "Torn OC Manager Dashboard" entry
//           afterwards — your data lives under the ocm_* keys and carries over intact.
// v3.28.0 — TornStats Coverage told a comfortable lie. Fixed.
//           The number beside each name is how many CRIME+ROLE records TornStats has
//           for them — not a CPR. Nothing said so, so "Tunabox 1" looked like a
//           terrible CPR instead of "one record".
//           Worse, coverage was BINARY: any records at all counted as covered. A
//           member with a single record has essentially no usable data — the odds
//           that one record is the exact crime+role you're checking are tiny, so the
//           lookup falls straight through to a guess. Counting them as covered
//           produced a reassuring 94% that, on a real roster, is closer to 50%.
//           Now three honest tiers:
//             ✓ Good data      — 5+ crime/role records. Can answer a specific role.
//             ⚠ Barely any     — 1-4 records. On TornStats, but not usable. This is
//                                where all those "1"s go.
//             ❌ Nothing        — no data at all.
//           "Usable %" now counts only the first tier, each chip states its record
//           count on hover, and the panel explains what the number actually is.
//           Also noted where it matters: this is less important than it used to be,
//           because v3.26 made the script prefer its OWN recorded CPRs from completed
//           OCs — these gaps close themselves as people run crimes.
// v3.27.1 — FIX: retrieving an item broke the armory table layout.
//           Torn rebuilds the whole item list over AJAX after a Give/Loan/Retrieve.
//           That wiped our injected OC Status cells — but the wrapper kept the
//           .ocm-armory-annotated class, so the CSS carried on stealing 110px from
//           the name column with nothing left to fill it. Hence the misaligned
//           headers: a 110px hole across 37 rows.
//           The column is now IDEMPOTENT and re-paintable, and a MutationObserver
//           watches for Torn's re-render and restores it — refreshing the OC data at
//           the same time, since a retrieve also changes who's holding what. So the
//           column stays correct as you work through the armory instead of
//           disintegrating on the first action.
//           Failure is now safe too: if the OC data can't be loaded, the class is
//           REMOVED, leaving Torn's own layout completely untouched rather than
//           half-styled. Verified against the broken page — it repairs it.
// v3.27.1 — FIX: "Retrieve ▸" ran the LOAN flow — it would have handed the member a
//           SECOND copy of the item instead of taking back the one they had.
//           Two faults, both from treating the armory as one-row-per-item:
//           1. Retrieve stored the same intent as Give, so the armory page ran the
//              loan flow. Intents now carry a mode ('give' | 'retrieve').
//           2. Rows were matched on data-itemid and the FIRST hit was used. But the
//              armory lists ONE ROW PER STOCK LINE, so an item appears several times:
//                DSLR Camera x2  Available     [Give] [Loan]  Retrieve
//                DSLR Camera x1  TheRealDoom   [Give]  Loan  [Retrieve]
//              It grabbed the Available row and pre-filled the holder as the loan
//              recipient. Each mode now finds its OWN row and its OWN control:
//                retrieve -> the row that member is holding, click data-role=retrieve
//                give     -> a row with free stock,          click data-role=loan
//           If the member no longer holds the item, Retrieve now clicks NOTHING and
//           says so, rather than falling back to some other row.
//           Verified against the saved armory page on the exact DSLR Camera rows from
//           the report (one spare + one loaned to TheRealDoom).
// v3.27.0 — Full UI audit. Six real bugs found and fixed, plus a legend.
//           • ACTIVE OCS BADGE READ 0 (the reported one). updateTabCounts recovered
//             counts by REGEX-SCRAPING "(N)" out of rendered heading text. v3.18.2
//             restyled the phase headers to show the count in a <span> with no
//             parentheses, so the badge has parsed 0 ever since. Renderers now PUBLISH
//             their counts (OCM_COUNTS) instead of the badge parsing them back out of
//             HTML — killing the whole class of bug, not just this instance.
//           • BROKEN PROFILE LINKS: member cards rendered href="...XID=undefined"
//             whenever the members payload omitted an inline id (the map is keyed by
//             id, and the key was being ignored). The id is now stamped at source.
//           • HEADER SAID "v3.9.1" FOR ELEVEN RELEASES — it was hard-coded. Now read
//             from GM_info, so the UI can't disagree with the script again.
//           • MISSING HISTORY HEADING: Crimes > History had no title element in the
//             v3.17 shell, so the analytics heading (and its count) never rendered and
//             initCollapse wired a ghost id.
//           • CONTRAST: --ocm-text-faint was #6e6e7e — 3.3:1 on the card background,
//             below the 4.5:1 needed for small text, while carrying REAL information
//             (difficulty badges, "Unknown", empty states). Fixed across all 5 themes
//             that failed; every text token now passes WCAG AA.
//           • Dead code removed (GMK.FINANCE_SUBTAB, orphaned since the v3.17 shell).
//           • NEW "? Legend" button in the header: one place that finally defines CPR,
//             role weight, obs vs est, the 🔧/📦/✓/🏛/✗ item icons, the card accent and
//             TCT. These were used across a dozen panes and explained nowhere — you had
//             to already know what they meant to read your own dashboard.
// v3.26.0 — We DO keep our own CPR database — and it was being written but never read.
//           recordCprHistory() has been archiving every completed OC's real CPR per
//           (member, crime, role), persisting past Torn's ~100-OC API window, and
//           backfilling only the GAPS from TornStats without overwriting real runs.
//           A good database. tsGetCpr() just never looked at it.
//           Predictions instead asked TornStats FIRST, so a stale third-party guess
//           outranked a CPR that Torn itself had reported for that exact member in
//           that exact role. (That's the "TS 50" vs live "78%" contradiction.)
//           Priority is now observed-fact-first:
//             1. our archive — a real run by that member, in that crime, in that role
//             2. the current API window (averaged over repeat runs)
//             3. TornStats, exact crime+role — a third-party ESTIMATE
//             4/5. fuzzy fallbacks (same crime, other role; then TS lowest)
//           Fuzzy matches from our archive take the member's LOWEST CPR in that
//           crime, never their best — guessing high for a role someone has never run
//           is how you recommend them into a seat they'll fail.
//           The UI now shows PROVENANCE: a predicted CPR reads "obs 78" (from a real
//           run, with the date on hover) or "est 50" (TornStats). You can always see
//           whether a number is fact or guess.
//           The archive is also cached in memory now — tsGetCpr runs once per slot and
//           was re-parsing the stored JSON every call.
// v3.25.0 — "Your OC" self-check + the confusing double-CPR on cards is gone.
//           • CONFUSING BADGE FIXED: a filled slot showed BOTH "TS 50" and "78%" —
//             two different CPR numbers, contradicting each other, with nothing
//             saying which to believe. Torn's own checkpoint_pass_rate (the big %)
//             is authoritative; TornStats is a third-party ESTIMATE. So the TS badge
//             now only appears when Torn has NOT reported a CPR for that slot, where
//             it's the only number available — and it's labelled "est" so it can't be
//             mistaken for fact. TornStats data is still used where it genuinely
//             helps: predicting your fit for roles you're NOT currently in.
//             The big CPR % now explains itself on hover.
//           • NEW "Your OC" panel: checks whether YOU are in the right seat, using
//             the same weight-vs-CPR logic as People > Assignments:
//               🔴 You are the weak link  — you hold a high-weight role at low CPR.
//                                           You are the biggest risk to that crime.
//               🔵 You are underused      — strong CPR on a role that barely matters.
//               🟡 Below par, low stakes  — under threshold but not worth acting on.
//               🟢 Good fit               — right seat.
//             If TornStats predicts you'd be clearly better (+10 CPR or more) in an
//             OPEN slot that isn't lower-stakes, it says so and offers a Join button.
//             It never suggests trading DOWN to a less important role.
//           • The "best open slot" advisory now hides while you're already in an OC —
//             that question is answered by the panel above it, not by a suggestion to
//             join somewhere you can't join anyway.
// v3.24.0 — NEW People > 🎯 Assignments: is each member actually in the RIGHT seat?
//           An OC card shows you one crime's CPRs. This shows the whole faction at
//           once and asks what the cards can't: does this person's CPR match the
//           IMPORTANCE of the role they're sitting in?
//           Two variables decide it — the role's WEIGHT (how much it drives success)
//           and the member's CPR in it:
//                          low CPR                high CPR
//             high weight  🔴 RISK                🟢 aligned
//             low weight   🟡 weak (low stakes)   🔵 UNDERUSED
//           Only two are actionable, and they're the two nobody sees:
//             🔴 Risk      — a high-weight role held at low CPR. THIS is what loses
//                            OCs: the role that decides the outcome, held weakly.
//             🔵 Underused — a strong member parked on a role that barely matters.
//                            Not a failure, but a waste of your best people.
//           Sorted worst-first, every verdict explains itself on hover, and where
//           TornStats data exists it also flags when a member would be markedly
//           better in a DIFFERENT role of the same OC ("Hacker +18").
// v3.23.1 — "Join this slot" now verified against the REAL Torn OC 2.0 crimes DOM
//           (v3.23.0 was written blind, with guessed selectors).
//           Torn's actual markup:
//             <div data-oc-id="1887534">                       <- the OC card
//               <span class="title___d55Wy">Pickpocket</span>  <- the role
//               <button class="torn-btn joinButton___HHfqg">Join</button>
//           Those class names are CSS-module hashes and WILL change on any Torn
//           deploy, so nothing depends on them. We anchor on the two stable things:
//           the data-oc-id attribute and the button's visible "Join" text; the slot
//           is found by walking up from the Join button to whatever element also
//           holds a role title — no hashed class, no fixed depth.
//           Torn really does label duplicate roles "Robber #2", so the exact label is
//           matched first and the base role only as a fallback — with two Robbers
//           open, you get the one that was recommended.
//           Refuses to act rather than act wrongly: if the recommended role has been
//           taken, it clicks NOTHING and tells you what's still open (joining the
//           wrong role is worse than not joining). Same for an OC that's full, or on
//           a Torn tab that isn't currently displayed.
//           Torn's own confirmation dialog is never auto-accepted.
// v3.23.0 — "Join this slot ▸" button on the Your Best Open Slot banner.
//           Joining an OC can't go through the API (it's read-only), so this drives
//           Torn's own crimes list, which is on the same page as the dashboard: it
//           finds the OC card by name, scrolls to it, pulses the recommended slot,
//           and clicks that slot's Join control. Torn still shows its own
//           confirmation — the script never confirms the join for you. Signing you
//           up for a crime without a confirmation isn't something a script should do.
//           Torn's OC markup isn't ours, so every selector lives in one JOIN_SELECTORS
//           block and each step degrades honestly:
//             join control found -> click it (Torn confirms)
//             only the OC found  -> scroll + pulse the slot, you click
//             nothing found      -> say so, rather than pretending it worked
//           It also ignores the dashboard's OWN copy of the OC name, which would
//           otherwise match itself instead of Torn's list.
// v3.22.0 — Armory "OC Status" column simplified. It now answers exactly one
//           question — about items that are OUT ON LOAN:
//             🎯 In use     — the holder's current OC role requires it. Leave it.
//             ♻ Not needed  — the holder's role does NOT require it. Dead weight;
//                             hover for why, and retrieve it.
//             (blank)       — not loaned out. It's just in the armory. Nothing to say.
//           Removed the "Wanted ×N" / "Reserved ×N" ratings on available rows. They
//           were noise in a column about loans: one mixed "a person is waiting for
//           this" with "an empty seat might need it someday", and splitting them into
//           two more labels only made it worse. What to stock is already answered by
//           Money > Costs. A column should answer one question.
// v3.21.1 — Armory "OC Status": split the misleading "⚠ Wanted ×N" badge in two.
//           It was summing filled-slots-missing-the-item AND empty slots, which are
//           completely different situations — only one is actionable. A Police Badge
//           reading "Wanted ×3" was really 1 person waiting + 2 empty seats.
//             ⚠ Loan ×N     — N members are ALREADY IN a seat without the item.
//                             Real people, waiting. Loan it to them now. (Open slots
//                             are still mentioned in the tooltip as context.)
//             ◦ Reserved ×N — N OPEN slots will need it, but nobody has joined yet,
//                             so there is NOBODY to loan it to. Keep it in the armory.
//             · Spare       — no active OC needs it at all.
// v3.21.0 — NEW: "OC Status" column injected into the Utilities armory page itself,
//           sitting before Type. Answers the question the armory can't: is this item
//           actually doing anything?
//             🎯 In use     — loaned to someone whose current OC role requires it
//             ♻ Not needed  — loaned out, but the holder's role doesn't need it.
//                             Hover for why, e.g. "juga is holding RF Detector, but
//                             their role in Bidding War (Bomber) needs a different
//                             item — which they still need! This one can be retrieved."
//             ⚠ Wanted ×N   — sitting in the armory while N OC slots need it NOW
//                             (the inverse problem, previously invisible)
//             · Spare       — in the armory, nothing needs it
//           Torn's armory rows are a fixed-width FLOAT layout, so the column can't
//           simply be appended (it would wrap). Its 110px is borrowed from the name
//           column, and everything is scoped to .ocm-armory-annotated so the other
//           armory tabs are untouched. Verified against a saved copy of the live
//           Utilities armory.
// v3.20.0 — ARMORY FIX (the real one) + retrievable-items view.
//           v3.19's flattener didn't help because the request itself was wrong:
//           THERE IS NO "armory" SELECTION IN API v2. The faction selections are
//           armor / boosters / drugs / medical / temporary / weapons / UTILITIES —
//           and OC items (Enhancers, Tools, Materials) live in the Utilities armory.
//           So ?selections=armory returned nothing, every item read "Held: 0", and
//           16 fully-stocked items were reported as gaps needing $3.48m to cover.
//           Now uses ?selections=utilities, which returns
//             { ID, name, type, quantity, available, loaned, loaned_to }
//           and gives BOTH the stock and the loans in one call:
//           · stock  = `available` (items already on loan aren't yours to hand out)
//           · loans  = `loaned_to`, a comma-separated list of holder user IDs
//           Torn lists one row per stock line, so an item appears once as available
//           and once per loan (exactly like the armory page) — both are summed.
//           This also replaces the 'temporary' call, which was the WRONG ARMORY
//           (grenades/flashbangs), so loan data was never real. One fewer API call.
//           • NEW "♻ Retrievable — Held but Not Needed": members holding a faction
//             item their current OC role doesn't require, with the reason spelled
//             out — e.g. "In Bidding War as Sniper — needs Advanced Sniper Rifle
//             (missing), not this" — plus the total value sitting idle, and a
//             Retrieve button that opens the armory at that item.
// v3.19.0 — Costs FIX + Payouts rebuilt.
//           • ARMORY BUG: every item showed "Held: 0" and was reported as an armory
//             gap even when fully stocked (16 fake gaps, $3.48m of fake "cost to
//             cover"). The parser did Object.values(armoryData.armory) and treated
//             the result as items — but v2 nests the armory by CATEGORY (weapons,
//             temporary, medical, utilities...), and OC tools/materials live under
//             utilities. So it was iterating category ARRAYS, reading item.id as
//             undefined, and counting nothing. Replaced with flattenArmory(), which
//             walks the structure instead of assuming its shape, so a renamed or
//             added category can't silently zero the inventory again. It also counts
//             `available` rather than `quantity`, since items already loaned out
//             aren't yours to give.
//           • PAYOUTS: now answers "who got paid, and how much".
//             New "Paid to Each Member" table — every paid OC's members' cut split
//             across its crew and totalled per person, with OCs, total earned,
//             avg/OC and a share-of-payouts bar. Click any paid OC row to expand the
//             crew and see each member's exact cut. New KPIs: total paid to members,
//             members paid (+ top earner), and the faction's own kept cut.
//           • Payout tables were unreadable (muted grey on dark for everything).
//             Rebuilt: data is bright, chrome is dim, zebra rows, real row height.
//           Confirms Torn's native payout data reads correctly — 31 OCs, real split
//           percentages, in a live faction.
// v3.18.3 — FIX: every Money sub-tab (and People > Loans / Item Status) rendered
//           empty. renderFinanceSection still opened with
//               const el = document.getElementById('ocm-finance');
//               if (!el) return;
//           but #ocm-finance was DELETED in the v3.17 shell rewrite and replaced by
//           separate Money/People containers — so the function returned on line 2 and
//           filled nothing. (Exports still worked because a different renderer owns
//           it, which is why only that tab had content.) Now guards on a container
//           that exists, and the event wiring is scoped to the dashboard root.
//           Test gap closed: the render harness fabricated an element for ANY id, so
//           the guard never tripped in testing. getElementById now returns null for
//           ids that aren't in the real shell markup, exactly like the DOM — verified
//           by re-running it against v3.18.2, which it now correctly fails.
// v3.18.2 — Active OCs polish + phase headers redesigned.
//           • OC name was rendering huge: it was an <h3>, and Torn's page CSS styles
//             h3 globally, beating the card's own font-size. Now a <div> with a
//             specific selector, so the page can't override it.
//           • Card header given room to breathe — more padding, the countdown no
//             longer jammed into the corner, name/chips/time properly spaced.
//           • Cards no longer stretch to the tallest in their row (align-items:start),
//             so short cards stop showing a block of dead space.
//           • Planning / Recruiting headers rebuilt to match the card language: a
//             quiet section rule with a phase dot, a count pill and difficulty chips
//             pushed right — instead of heavy bordered panels competing with the
//             cards below them. Recruiting also shows total open slots at a glance,
//             and the chevron rotates when collapsed.
// v3.18.1 — FIX: every Torn API call was failing with a CORS error, so the dashboard
//           fell back to member mode / showed nothing.
//           Cause: the API calls used plain fetch(). api.torn.com is a DIFFERENT
//           ORIGIN from www.torn.com, so those were always cross-origin requests —
//           they only worked while Torn returned an Access-Control-Allow-Origin
//           header. That header is no longer coming back, and every call died.
//           (An old code comment even claimed the Torn API was "same-origin". It
//           never was.)
//           Fix: all five Torn API call sites now go through GM_xmlHttpRequest via a
//           new tornApiGet() transport. GM XHR isn't subject to CORS, the script
//           already declared @connect api.torn.com, and it's what every other Torn
//           userscript uses. Falls back to fetch() if the userscript manager doesn't
//           expose GM XHR, and still surfaces Torn's error payloads (which arrive
//           with HTTP 200) as real errors.
// v3.18.0 — Active OCs: OC cards fully rebuilt (new "oc2" design).
//           The old card crammed nine competing elements into every slot row —
//           status icon, role, member, TS badge, progress bar, risk icon, item badge,
//           weight, CPR — with each card tinted head-to-toe by status, so everything
//           looked equally urgent and nothing stood out. Rebuilt around three rules:
//           · Status is a LEFT ACCENT BAR, not a full card tint.
//           · Slots are a 4-column grid (role · member · tags · CPR) so you scan
//             straight DOWN a column instead of hunting across a soup of icons.
//           · Colour only where it means something — risk, blocked, missing item.
//             Everything else is muted. Colour is a signal, not decoration.
//           New: seat-fill progress bar ("4/6 filled"), per-member planning progress
//           as a hairline under each row (not a competing bar), a single clean
//           countdown + TCT sub-line instead of a paragraph of timer text, and an
//           issue footer showing only what a leader must act on ("2 open slots",
//           "BobH needs Advanced Sniper Rifle", "✓ No blockers").
//           Card accent now reflects the OC's WORST real problem (crit CPR > blocked
//           member > low CPR/missing item), not just its phase bucket.
//           Cards are wider (330px min) with hover lift; responsive down to mobile.
// v3.17.1 — Fix crash that stopped v3.17.0 loading entirely ("Not loaded"):
//           TypeError: root.querySelectorAll is not a function, in initTabs().
//           The new sub-tab wiring referenced a `root` element that doesn't exist in
//           initTabs' scope — it already has a `panes` NodeList from
//           document.querySelectorAll('.ocm-tab-pane'). Now uses that.
//           Why it wasn't caught: the render harness stubs querySelectorAll to [], so
//           initTabs hit its `if (!tabs.length) return` guard and the new code never
//           executed. Added test_tabs.js — builds the real shell markup in jsdom and
//           actually clicks every main tab and sub-tab, so DOM wiring is exercised
//           rather than skipped.
// v3.17.0 — UI restructure: 6 top tabs + 6 sub-tabs → 3 main tabs, each with
//           sub-tabs grouped by what you're actually doing. Nothing was removed —
//           things were moved to where they belong.
//             🎯 CRIMES (default — filling OCs is the main job)
//                Fill Slots · Active OCs · History
//             👥 PEOPLE (everything member-related, finally in one place)
//                Loans · Item Status · Blocked · Optimize · CPR Data
//             💰 MONEY
//                Summary · Payouts · OCs Ran · Trends · Costs · Exports
//           Previously "Members item status" lived under Profit & Items while
//           Status/Optimize were separate top tabs — all member context is now
//           under People. Analytics moved to Crimes › History (it's OC performance).
//           Badges roll up: Crimes = fillable slots, People = loans + item problems
//           + low CPR, Money = OCs awaiting payout. Sub-tab choice is remembered per
//           tab, and old saved tab names migrate automatically.
//           Sections inside a sub-tab now start EXPANDED (the old collapsed headers
//           meant clicking twice to see anything).
// v3.16.0 — Payouts now read Torn's NATIVE OC payout records instead of guessing.
//           CORRECTION to v3.12-3.14: OC 2.0 has a built-in payout system (leadership
//           pays a scenario out in-game with a % split between faction and crew), and
//           the API exposes it on the crime as rewards.payout — paid_at, percentage,
//           paid_by. So whether an OC was paid, when, and at what split is a FACT from
//           the API. The manual "Mark paid" toggle, the member-share % setting and the
//           funds-log matching engine were all reinventing data Torn already gives us.
//           • Payouts tab now shows "⏳ Awaiting Payout" and "✓ Paid" straight from
//             Torn's records: cash, crew size, the actual split %, each member's share,
//             and the date it was paid. No manual ticking.
//           • The manual toggle is hidden whenever Torn supplies payout data, and only
//             appears for OCs the API says nothing about (legacy ledger rows).
//           • If NO payout data is found at all, the old funds-log inference is kept as
//             a fallback and clearly labelled as inferred.
//           Field names are read defensively (paid_at/paidAt, percentage/percent, ...)
//           so an API rename degrades to the fallback rather than showing wrong numbers.
// v3.15.1 — Loans tab: a "not stocked" item no longer offers a pointless Give ▸.
//           If the armory has none of the item there is nothing to loan, so linking
//           to the armory just dead-ends (and the v3.15 autofill would land there
//           and report it can't find the row). Those rows now show Buy ▸ instead,
//           which opens the item market for that item so it can be sourced first.
//           No loan intent is recorded for a Buy — only a real Give arms the
//           armory autofill. Once the item is in the armory the row flips back to
//           Give ▸ on the next refresh.
// v3.15.0 — Loan AUTOFILL on the armory page (this never existed before — the old
//           "Give ▸" button only opened the armory and left you to fill it in).
//           Clicking Give ▸ / Retrieve ▸ now stores a one-shot loan intent; when the
//           armory tab opens, the script finds the item row (matched on
//           .img-wrap[data-itemid]), clicks its Loan link, sets the quantity (both
//           the visible AND the hidden input that actually posts), fills the member
//           field, highlights the row and scrolls to it.
//           The member field is a jQuery-UI autocomplete, so assigning .value is
//           normally ignored. Torn's own Handlebars template gives the answer — it
//           submits the field as "{{user.playername}} [{{user.userID}}]" — so we
//           write "Name [12345]" directly (the exact string picking from the
//           dropdown produces) and bypass the autocomplete entirely. Values are set
//           via the native setter + input/change/keyup/blur events so Torn's own
//           listeners still fire.
//           It deliberately does NOT press LOAN: this hands over real faction
//           property, so the human confirms. Intents expire after 5 minutes and fire
//           once, so a stale one can never loan something later by surprise.
//           Verified end-to-end against a saved copy of the live armory page.
// v3.14.0 — Payout MATCHING: gives from the faction funds log are now matched back
//           to the OCs they most likely paid for, instead of just being summed.
//           Each completed OC creates one claim per member (cash × share% ÷ crew).
//           A give settles a claim if it went to that member, landed AFTER the OC
//           executed, and falls within 21 days with the amount inside 15% of the
//           expected split. Two passes: confident 1:1 pairings first (greedy by
//           amount accuracy + time proximity), then lump sums — a single give that
//           covers several of that member's open claims at once, matched on the sum
//           (leaders often batch-pay). Gives that predate an OC, go to non-members,
//           or carry the wrong amount are never matched.
//           • New "🔎 Looks Paid — Confirm" panel: OCs where every member matched a
//             give but the OC isn't marked paid. Shows matched count, confidence
//             (high = within 2%, likely = within 15%), the payout date, and a
//             per-OC "Mark paid ✓" plus "Accept all". Nothing is auto-marked —
//             matching is inference (Torn never records which OC a give was for),
//             so confirmation stays with the leader.
//           • Reconciliation is now claim-level: "Still owed" counts only claims
//             with no matching give, rather than netting off any money a member
//             happened to receive. Money that matches no claim is shown separately
//             as "Other", and in a new "❔ Unmatched Gives" table, so nothing is
//             silently unexplained.
//           • OCs Ran: Paid column gains 🔎 (looks paid) and ◐ (partly paid); the
//             expanded breakdown marks each crew member ✓ (matched, with the give's
//             amount/date on hover) or • (still owed).
// v3.13.2 — Bug fixes in the Loans tab (all three reported from a live faction):
//           • "Give ▸" opened the wrong armory tab — the URL used sub=utility;
//             Torn expects sub=utilities (plural). Fixed.
//           • Member showed as a raw id ("#2360099") instead of a name. The OC
//             slot and temporary(loan) API payloads often carry only a user id and
//             no name, so slot.user.name / holderName can be null. Added
//             resolveMemberName(), which looks the id up against the faction roster
//             (falling back to the ex-member cache, then "#id"). Threaded through
//             the loan list, Members sub-tab, and the ledger's participant records.
//           • The DUE column rendered black/unreadable — the cell had no colour and
//             inherited the page default. Now coloured by urgency: red under 12h,
//             amber under 48h, dim otherwise.
// v3.13.1 — Internal refactor, zero behavior change (verified: before/after renders
//           are byte-identical under a differential DOM harness, on both the live
//           API-window path and the tracked-ledger path with legacy records).
//           • renderDashboard (~2,400 lines) split into an orchestrator plus five
//             top-level tab renderers (OC grids / Action / Status / Optimize /
//             Reference) sharing one ctx model object.
//           • Shared formatters (fmtMoney, netColor, negCost, normOcStatus, fmtEta,
//             dateStr, marketUrlOf, kpiTile) hoisted to module level; duplicate
//             finance-local copies removed.
//           • All 27 GM storage keys centralized in a GMK constants object
//             (dynamic ocm_collapse_* keys intentionally remain template-built).
// v3.13.0 — Payout reconciliation from the faction funds log. The script now reads
//           faction news (cat=giveFunds — "X gave $Y to Z") each refresh, parses the
//           entries (XIDs preferred, plain-text fallback), and stores them
//           permanently so payout history survives the news feed scrolling off.
//           Fetches are incremental via a timestamp cursor (one extra API call per
//           refresh; the first sync grabs the ~100 most recent gives).
//           New 💸 Payouts sub-tab:
//           • Per-member reconciliation — Owed (suggested splits from OCs not marked
//             paid) vs Received (gives from the log since your profit cutoff) vs
//             Outstanding. ✓ even / red outstanding / blue surplus.
//           • Recent Gives table — the raw log, newest first.
//           The log doesn't record which OC a give was for (Torn doesn't store
//           that), so per-OC Paid remains a manual toggle; reconciliation answers
//           "who's square". Requires a key with faction API access — without it the
//           tab shows a hint and owed figures still work.
// v3.12.0 — Profit & Items deep overhaul: payouts, drill-downs, member item intel.
//           • Payout tracking — OC cash lands in the faction wallet and Torn's API
//             can't see who you paid, so each completed OC gets a "Mark paid" toggle
//             (persisted). New "Unpaid Cash" KPI + amber • / green ✓ Paid column in
//             OCs Ran. Configurable "member share %" computes a suggested per-member
//             split (cash × share ÷ crew size) in each OC's breakdown.
//           • OCs Ran rows now expand on click — full breakdown per OC: cash, every
//             reward item with value, respect, consumed materials with prices, the
//             crew that ran it, suggested split, and the Paid toggle.
//           • New 👥 Members sub-tab — per-member item intelligence: current OC/role,
//             required item (✓ has / ✗ needs loan), everything they hold on faction
//             loan, with items NOT needed for their current role flagged ⚠. Status
//             column: Needs loan / Holds unneeded / OK. Members needing attention
//             show in the sub-tab badge.
//           • Ledger now records each OC's participants, so all-time records keep
//             their crew after aging out of the API's ~100-OC window (older records
//             show crew only while still in-window).
//           • Returnable-loans detection now shares the Members-tab logic (single
//             source of truth for "holds an item their role doesn't need").
// v3.11.0 — Merged the 💰 Profit and 📦 Items tabs into one "💰 Profit & Items" tab
//           with sub-tabs (Summary / OCs Ran / Trends / Items / Loans) instead of
//           long stacked sections. Switching sub-tabs is instant (show/hide, no
//           refetch); only the profit view toggle / date cutoff trigger a recompute.
//           • Summary — net-profit KPIs + By Scenario.
//           • OCs Ran — the per-OC revenue/cost/net list (taller, scrollable).
//           • Trends — weekly + monthly rollups.
//           • Items — armory item/cost tracker + Items Consumed + Items Received.
//           • Loans — loan worklist + returnable-loan panel.
//           The profit view controls hide automatically on the Loans sub-tab (they
//           only affect money figures). Fixes the "sections won't collapse" issue on
//           the old Items tab — those static headers are gone, replaced by real tabs.
//           The retired 'profit'/'items' saved-tab state migrates to the new tab.
// v3.10.0 — Profit tab rebuilt into a true profit/loss tracker. It now captures the
//           COST side, not just rewards: for each completed OC the consumed materials
//           (item_requirement slots where is_reusable === false) are priced at market
//           and subtracted from revenue. Reusable tools (🔧) are excluded — they aren't
//           consumed. Cost is snapshotted at completion in the ledger; records made
//           before v3.10 are backfilled from the live API window where still available.
//           New/updated UI:
//           • KPI tiles: Net Profit (revenue − cost) as the headline, plus Revenue,
//             Item Cost, Respect, and ~Net/Day.
//           • "OCs Ran" list — every completed OC with its date, revenue, cost and net
//             (newest first, scrollable).
//           • Weekly and Monthly rollups — OCs/revenue/cost/net per ISO week and month.
//           • By Scenario now shows cost + net + net-per-run (was revenue only).
//           • Items Consumed (cost) table alongside the existing Items Received table.
//           View toggle (API window / all-time tracked) and the "Profit since" date
//           cutoff are unchanged.
// v3.9.1 — Moved armory-shortage alerts off the next-OC banner (it was flooding with
//          a dozen lines) — shortages now live only on the Items tab. Banner keeps just
//          hard blockers: open slots, hospital/jail/travelling/abroad members, and
//          members missing their required item. New ♻ Returnable Loans panel on the
//          Items tab: flags faction items members hold on loan that no active OC needs,
//          so you can retrieve them (opens the armory; API can't retrieve for you).
// v3.9.0 — New 📦 Items tab: OC item & cost tracker plus a loan worklist.
//          Tracker lists every item OCs use with armory stock held, total needed
//          (loans + open slots), shortfall, and market cost to cover the gap.
//          Loan panel lists members waiting on an item, sorted by deadline, with a
//          'Give' button that opens the faction armory loan screen (Torn's API is
//          read-only so it can't auto-loan — you confirm in-game). Armory shortage
//          alerts now surface on the main next-OC banner (🔴 out of stock / ⚠️ short).
// v3.8.1 — Caught the last black text: unstyled <button>s (Config, Last-5 toggle,
//          Clear) and <label>/<option> elements were falling through to the browser's
//          default black. Added base #ocm-root button/label/option colour rules and
//          made the root's own bg/text use theme vars, so nothing can inherit black.
//          Converted remaining light text colours to vars too. Verified via an
//          automated luminance scan: ZERO near-black text across all tabs + config.
// v3.8.0 — Readability + full theme customization. (1) Fixed unreadable near-black
//          text everywhere (#555/#556/#445 → readable themed greys; ~175 spots).
//          (2) Fixed tight/overlapping spacing in Analytics tables (column widths,
//          smaller headers so 'SUCC…'/'AVG C…' no longer truncate, more padding).
//          (3) Custom theme editor: a colour picker for every element (5 text shades,
//          3 CPR colours, links, 3 backgrounds, 2 borders) with live preview, reset,
//          and copy-from-preset. Added a Midnight Blue preset. All colours are now
//          CSS variables so themes (incl. Custom) restyle the whole dashboard.
// v3.7.1 — Analytics UI fixes: the 'Show Chart' toggle buttons had no styling and
//          were nearly invisible (dark default text on dark bg) — now styled blue and
//          legible. Fixed overlapping text in the Member/OC History area (headings and
//          empty-state hints collided on narrow/mobile layouts) by adding proper
//          heading margins and reserving space for the Clear button. Brightened the
//          near-black empty-state hint text from #556 to #99a.
// v3.7.0 — Two new tools. (1) 'Cache Old CPRs' button in Member OC History: pulls
//          every member's current CPR from TornStats and backfills the history archive,
//          filling gaps where no real OC run exists (won't overwrite dated runs). TS-
//          sourced rows are marked ★ 'TornStats'. (2) TornStats Coverage section in
//          Reference: shows who in the faction has CPR data on TornStats and who
//          doesn't, with a coverage %, per-member entry counts, and profile links.
// v3.6.1 — Fixed regression from v3.5.5: the Active OCs slot member name was being
//          HTML-escaped a second time even though it already held a built <a> link,
//          so links showed as raw '<a href=...' text. The inner name is still escaped;
//          only the redundant outer escape was removed.
// v3.6.0 — Persistent CPR archive: the Member OC History search now draws on a
//          saved archive that accumulates OCs past the API's ~100-OC window. For each
//          member it keeps the most-recent run per OC+role (newer runs replace older,
//          no duplicate scenarios). Archived rows are marked with ⧗ and dimmed, with
//          a footnote. Fills gaps so you can see a member's CPR across every OC type
//          they've run, not just recent ones. (Only captures OCs seen from now on.)
// v3.5.5 — Security/robustness: all player names, OC names, and item names from
//          the Torn API are now HTML-escaped before being inserted into the DOM.
//          Previously a name containing < > & or quotes would break the layout (and
//          in theory inject markup); a malformed name could corrupt the dashboard.
//          Added an esc() helper applied to ~20 interpolation points. No visible
//          change for normal names.
// v3.5.4 — Robustness pass: added a concurrency guard so the 60s auto-refresh
//          can't run two renders at once (prevented interleaved DOM writes); loadData
//          now stops cleanly if the dashboard DOM is gone (SPA navigation) instead of
//          throwing every tick; guarded sidebar-cache JSON.parse; made the sidebar
//          render interval idempotent; replaced three O(n²) member lookups with an
//          O(1) id map (faster on large factions). No visual/behavioural changes.
// v3.5.3 — Refactor pass: replaced blocking alert() popups with non-blocking
//          toast notifications (better on mobile); removed dead code (unused vars);
//          Member/OC History searches now persist across the 60s auto-refresh
//          instead of resetting; toast reveal is rAF-safe for TornPDA. No visual
//          or behavioural changes to existing features.
// v3.5.2 — Fixed 'best open slot' advisory recommending 0% CPR slots. An open
//          slot has no CPR of its own, so it now looks up YOUR predicted CPR for
//          that crime+role from TornStats data (leader mode now resolves your own
//          player ID). If there's no CPR data for you in any open role, the advisory
//          hides instead of showing a meaningless 0%.
// v3.5.1 — Profit tab: added a 'Profit since' date cutoff (defaults to first-run
//          date, so it shows profit since you took over) and an All-time (tracked)
//          view that persistently records every completed OC's profit keyed by OC id,
//          accumulating past the API's ~100-OC cap. Toggle between live API window
//          and tracked all-time; clear the date for full history.
// v3.5.0 — New 💰 Profit tab: aggregates money + item value + respect from
//          completed OCs. KPI tiles (total profit, cash, item value, respect, per-day),
//          a By-Scenario breakdown (cash vs items vs total, avg/run), and an Items
//          Received table (qty, unit market value, total). Item values pulled from
//          /torn/items market price. Estimates — actual sale value varies.
// v3.4.0 — Themes now apply across the whole UI (converted all semantic colours
//          to CSS variables, not just CPR-class elements). Fixed: stale leader
//          'best slot' card showing in forced member mode; member-mode best-slot
//          no longer recommends 0%/unknown-CPR slots; Force Member Mode toggle
//          stays reachable so you can switch back to leader mode.
// v3.3.9 — Ported from upstream v3.5.7: opt-in colour themes (High Contrast +
//          Deuteranopia/Protanopia/Tritanopia colourblind modes with ✓/⚠/✗ shape
//          markers; default theme = current look). Travel-page injection: dashboard
//          now also shows on the faction profile page when abroad (crimes tab gone).
// v3.3.8 — TornStats CPR table now shows live slot CPR (blue dot) overriding
//          the estimate, plus role weights per column. Layout fixes: blocked
//          timer column, analytics table overlap, Last-5 OC header spacing.
// v3.3.7 — Job Planner-style UI refactor; TornStats CPR integration; per-
//          member best-fit slot recommendation with assignment-based dedup;
//          OC history CPR fallback; newsletter button with personalized
//          recommendations; mobile-first card layout for Available members.
// v3.3.5 — OC History pivot in Analytics.
// v3.3.4 — Member mode current-OC card.
// v3.3.3 — 11 CSV exports grouped by section.
// v3.3.2 — Member OC History in Analytics.
// v3.3.1 — Stuck OCs section.
// v3.3.0 — Recruits split, abroad flags, spawn reminder, last 5 OCs, heatmap fix.

(function () {
  'use strict';

  // ─── DUPLICATE GUARD ─────────────────────────────────────────────────────────
  if (window._ocmLoaded) return;
  window._ocmLoaded = true;

  // ─── CONFIG ──────────────────────────────────────────────────────────────────
  const API_BASE      = 'https://api.torn.com/v2';
  /** Every GM storage key in one place — grep GMK. to find all persisted state. */
  /** Loans + member-item issues, handed from the finance render to updateTabCounts.
   *  v4.0: these panes live under Armoury, so the count feeds that tab's badge. */
  let ocmArmouryAttn = 0;

  /**
   * Counts published by each render pass, read by updateTabCounts.
   *
   * These used to be recovered by regex-scraping "(N)" out of the rendered section
   * headings. That silently broke the moment a heading's format changed — v3.18.2
   * restyled the phase headers to show the count in a <span> without parentheses,
   * and the Active OCs badge has read 0 ever since. Renderers now publish the number
   * they already have, instead of the badge trying to parse it back out of HTML.
   */
  const OCM_COUNTS = {};

  /** Faction name, captured at render time for the exporter's report header. */
  let OCM_FACTION_NAME = '';

  /**
   * ONE-TIME STORAGE MIGRATION: ocm_* -> ocs_* (v3.29 rename to "Torn OC Suite").
   *
   * The keys aren't just settings. They hold the CPR archive and the profit/payout
   * ledgers — CPRs and OC results observed over months, reaching back PAST Torn's
   * ~100-OC API window. That history CANNOT be re-fetched: the source data is gone
   * from the API. Renaming the prefix without moving the data would leave it sitting
   * in storage, unread, and the dashboard would come up empty forever.
   *
   * So every key is copied across, once, before anything reads it. The old ocm_*
   * keys are deliberately LEFT IN PLACE as a free backup — they cost nothing, and if
   * this migration ever goes wrong the data is still there to recover.
   */
  function migrateStorageKeys(gmk) {
    const DONE = 'ocs_migrated_from_ocm';
    try {
      if (GM_getValue(DONE, false)) return;

      let moved = 0;
      for (const newKey of Object.values(gmk)) {
        if (typeof newKey !== 'string' || !newKey.startsWith('ocs_')) continue;
        const oldKey = 'ocm_' + newKey.slice(4);

        // SUBTAB_PREFIX is a prefix, not a key — migrate its known panes.
        if (newKey.endsWith('_')) {
          for (const pane of ['crimes', 'people', 'money']) {
            const o = GM_getValue(oldKey + pane, null);
            if (o !== null && GM_getValue(newKey + pane, null) === null) {
              GM_setValue(newKey + pane, o); moved++;
            }
          }
          continue;
        }

        const oldVal = GM_getValue(oldKey, null);
        if (oldVal === null || oldVal === undefined) continue;   // nothing to carry
        if (GM_getValue(newKey, null) !== null) continue;        // never clobber
        GM_setValue(newKey, oldVal);
        moved++;
      }

      GM_setValue(DONE, true);
      if (moved > 0) console.log(`[OC Suite] Migrated ${moved} stored value(s) from the old ocm_* keys. The originals were left in place as a backup.`);
    } catch (e) {
      console.warn('[OC Suite] Storage migration failed — falling back to the old keys.', e);
    }
  }

  /** Read from the @version header, so the UI can never disagree with the script.
   *  (It said "v3.9.1" for eleven releases because it was hard-coded.) */
  const SCRIPT_VERSION = (typeof GM_info !== 'undefined' && GM_info?.script?.version) || '?';

  const GMK = {
    SUBTAB_PREFIX: 'ocs_subtab_',
    LOAN_INTENT: 'ocs_loan_intent',
    ACTIVE_TAB: 'ocs_active_tab',
    API_KEY: 'ocs_api_key',
    CFG_CPR_CRIT: 'ocs_cfg_cpr_crit',
    CFG_CPR_MAX: 'ocs_cfg_cpr_max',      // overqualified above this (0 = off) — pushed by leaders (v5.1.2)
    CFG_CPR_WARN: 'ocs_cfg_cpr_warn',
    CFG_MIN_PER_DIFF: 'ocs_cfg_min_per_diff',
    CFG_REFRESH: 'ocs_cfg_refresh',
    CFG_WEIGHT_HIGH: 'ocs_cfg_weight_high',
    CFG_WEIGHT_MID: 'ocs_cfg_weight_mid',
    CPR_ARCHIVE: 'ocs_cpr_archive',
    OC_ARCHIVE:  'ocs_oc_archive',      // full completed-OC history, backfilled past the API window
    OC_ARCHIVE_META: 'ocs_oc_archive_meta',
    CUSTOM_THEME: 'ocs_custom_theme',
    FORCE_MEMBER: 'ocs_force_member',
    MH_LAST: 'ocs_mh_last',
    HIST_VIEW: 'ocs_hist_view',              // v5.2 History: roster | scenarios | runs
    HIST_WINDOW: 'ocs_hist_window',          // v5.2 History time window: 7 | 30 | 90 | all
    HIST_FILTERS: 'ocs_hist_filters',        // v5.2 Roster quick-filter chips
    RAIL_PINNED: 'ocs_rail_pinned',          // v5.3 nav rail held open (touch has no hover)
    MY_PLAYER_ID: 'ocs_my_player_id',
    MY_FACTION_ID: 'ocs_my_faction_id',
    OH_LAST: 'ocs_oh_last',
    // War data layer (v4.1)
    ATTACK_LEDGER: 'ocs_attack_ledger',   // { [attackId]: slimAttack } — raw rows, 180-day retention
    ATTACK_CURSOR: 'ocs_attack_cursor',   // newest attack ts seen by the forward sync
    ATTACK_STATUS: 'ocs_attack_status',   // 'ok' | last error string (AA capability probe)
    ATTACK_META:   'ocs_attack_meta',     // backfill stats {at, total, gaps}
    WAR_ARCHIVE:   'ocs_war_archive',     // { [warId]: {start,end,target,winner,factions,report} } — permanent
    WAR_STATUS:    'ocs_war_status',
    CHAIN_ARCHIVE: 'ocs_chain_archive',   // { [chainId]: {start,end,length,respect,report} } — permanent
    CHAIN_STATUS:  'ocs_chain_status',
    WAR_SYNC_AT:   'ocs_war_sync_at',     // throttle stamp for the war-data poll group
    // Live war features (v4.2)
    CHAIN_LIVE_STATUS: 'ocs_chain_live_status',
    ENEMY_CACHE:   'ocs_enemy_cache',     // last enemy-roster fetch {at, fid, members[]}
    ENEMY_STATUS:  'ocs_enemy_status',
    SPY_CACHE:     'ocs_spy_cache',       // { [uid]: {ts, ff, bs, src} } — 24h TTL
    SPY_STATUS:    'ocs_spy_status',
    FF_KEY:        'ocs_ff_key',          // FFScouter API key (optional)
    WARROOM_VIEW:  'ocs_warroom_view',
    // War payout calculator (v4.3)
    WAR_PAY_CFG:    'ocs_war_pay_cfg',    // global defaults {base, flatPct, minMetric, roundTo}
    WAR_PAY_LEDGER: 'ocs_war_pay_ledger', // { [warId]: {pot, base, flatPct, minMetric, paid:{uid:{amount,ts}}} }
    // Activity tracker + revives (v4.4)
    ACTIVITY_LOG:     'ocs_activity_log',     // { [uid]: {n, d:{ [utcDay]: {o,s,la,st} }} } — 90-day aggregates
    ACTIVITY_SNAP_AT: 'ocs_activity_snap_at', // last snapshot stamp (≤1 write / 30 min)
    REVIVE_LEDGER:  'ocs_revive_ledger',  // { [reviveId]: slim } — id-keyed
    REVIVE_CURSOR:  'ocs_revive_cursor',
    REVIVE_STATUS:  'ocs_revive_status',
    REVIVES_VIEW:   'ocs_revives_view',
    // Armoury ledger + loadouts (v4.5)
    LOAN_LEDGER:  'ocs_loan_ledger',      // { [newsId]: parsed armoryAction event }
    LOAN_CURSOR:  'ocs_loan_cursor',
    LOAN_STATUS:  'ocs_loan_status',
    LOANLOG_VIEW: 'ocs_loanlog_view',
    LOADOUT_ENABLED: 'ocs_loadout_enabled',  // opt-in: capture own equipped gear on item.php
    LOADOUT_SELF:    'ocs_loadout_self',     // {ts, id, name, items:[{id,cat,name}]}
    LOADOUT_STORE:   'ocs_loadout_store',    // { [uid]: imported loadout } — pasted codes
    GEAR_CACHE:  'ocs_gear_cache',           // faction weapons/armour on loan: {at, items:[{id,name,type,cat,uid}]}
    GEAR_STATUS: 'ocs_gear_status',
    MEMBER_NAMES: 'ocs_member_names',        // persistent uid -> name cache (v4.8; survives sessions + roster shape changes)
    NAME_RESOLVE_FAILED: 'ocs_name_resolve_failed', // uids that failed to resolve -> attempt ts (retried weekly)
    // Avatars (v5.2). URLs ONLY — never image bytes. A profile picture can be a
    // 3.3MB animated GIF; base64-ing a roster of those into GM storage would
    // blow the quota (saveAttackLedger already warns about size) for no gain,
    // since the browser's HTTP cache holds the bytes anyway — and Torn serves
    // them `immutable, max-age=2678400`, so it holds them for 31 days.
    AVATAR_CACHE: 'ocs_avatar_cache',        // { [uid]: {url, at} } — url '' = "asked, has none"
    AVATAR_SYNC_AT: 'ocs_avatar_sync_at',
    ITEM_ID_MAP:  'ocs_item_id_map',         // item name(lower) -> id, for armoury item images (one v1 items call)
    ITEM_ID_MAP_AT: 'ocs_item_id_map_at',    // last fetch attempt — retried at most daily
    PAYOUT_EVENTS: 'ocs_payout_events',
    DEPOSIT_EVENTS: 'ocs_deposit_events',    // faction funds log: deposits (v5.0)
    DEPOSIT_CURSOR: 'ocs_deposit_cursor',
    DEPOSIT_STATUS: 'ocs_deposit_status',
    OC_BACKFILL_AUTO: 'ocs_oc_backfill_auto_at',  // last automatic history pass (v5.0)
    PAYOUT_LEDGER: 'ocs_payout_ledger',
    PAYOUT_NEWS_CURSOR: 'ocs_payout_news_cursor',
    PAYOUT_NEWS_STATUS: 'ocs_payout_news_status',
    SHARE_BY_DIFF: 'ocs_cfg_share_by_diff',
    PAYOUT_SHARE: 'ocs_payout_share',
    PROFIT_LEDGER: 'ocs_profit_ledger',
    PROFIT_SINCE: 'ocs_profit_since',
    PROFIT_VIEW: 'ocs_profit_view',
    SIDEBAR_CACHE: 'ocs_sidebar_cache',
    THEME: 'ocs_theme',
    TS_CPR_CACHE: 'ocs_ts_cpr_cache',
    TS_KEY: 'ocs_ts_key',
  };

  // Must run BEFORE anything reads storage — the config values, the TornStats cache
  // and the ledgers are all read during module init, further down this file.
  migrateStorageKeys(GMK);

  // ─── PERSISTENT PROFIT TRACKING ────────────────────────────────────────────
  // The Torn API only returns ~100 recent completed OCs. To build an all-time
  // total that survives past that cap, we record each completed OC's profit
  // (keyed by its unique OC id) into GM storage as we see it. Re-seeing the same
  // OC id never double-counts. This only captures OCs from the moment the user
  // starts running this version forward — it can't recover OCs already aged out.
  const PROFIT_STORE_KEY = GMK.PROFIT_LEDGER;

  /** Load the persistent ledger:
   *  { [ocId]: {name, money, itemValue, respect, executedAt, items:{id:qty},
   *             cost, costItems:{id:{qty,unit}}} }
   *  `cost` / `costItems` are the consumed-material cost snapshotted at record time
   *  (reusable tools are excluded). Older entries recorded before v3.10 have no
   *  cost field — the renderer backfills those from the live API window when it can. */
  function loadProfitLedger() {
    try { return JSON.parse(GM_getValue(PROFIT_STORE_KEY, '{}')) || {}; }
    catch (_) { return {}; }
  }
  function saveProfitLedger(ledger) {
    try { GM_setValue(PROFIT_STORE_KEY, JSON.stringify(ledger)); } catch (_) {}
  }

  /** Payout tracking. OC cash lands in the faction wallet; paying members is a
   *  manual in-game action Torn's API can't see, so "paid" is a leader-set flag.
   *  Shape: { [ocId]: { paid: true, ts: unixSeconds } } */
  const PAYOUT_STORE_KEY = GMK.PAYOUT_LEDGER;
  function loadPayouts() {
    try { return JSON.parse(GM_getValue(PAYOUT_STORE_KEY, '{}')) || {}; } catch (_) { return {}; }
  }
  function savePayouts(p) {
    try { GM_setValue(PAYOUT_STORE_KEY, JSON.stringify(p)); } catch (_) {}
  }

  /** Persistent store of faction "give funds" events parsed from the faction news
   *  log (cat=giveFunds). Stored forever, keyed by news id, so payout history
   *  survives the news feed scrolling off. Shape:
   *  { [newsId]: { ts, fromId, fromName, toId, toName, amount } } */
  const PAYOUT_EVENTS_KEY = GMK.PAYOUT_EVENTS;
  function loadPayoutEvents() {
    try { return JSON.parse(GM_getValue(PAYOUT_EVENTS_KEY, '{}')) || {}; } catch (_) { return {}; }
  }
  function savePayoutEvents(ev) {
    try { GM_setValue(PAYOUT_EVENTS_KEY, JSON.stringify(ev)); } catch (_) {}
  }

  /**
   * Match faction "give" events from the funds log back to the OCs they most
   * likely paid for. Torn does NOT record which OC a give was for, so this is
   * inference, not truth — every match carries a confidence and the user stays
   * in control (nothing is marked paid without their say-so unless they opt in).
   *
   * Model: each completed OC with cash produces one CLAIM per participant
   * (expected = cash × share% ÷ crew). A give can settle a claim if it went to
   * that member, landed AFTER the OC executed, and falls inside the window.
   *
   * Two passes:
   *   1. 1:1 — best (amount, time) pairing, greedy by score, needs the amount to
   *      land within tolerance of the expected split.
   *   2. lump-sum — an otherwise-unused give that covers several of that member's
   *      open claims at once (leaders often batch-pay), matched on the SUM.
   *
   * @returns {{byOc:Object, claims:Array, events:Array, unmatchedEvents:Array}}
   */
  const PAYOUT_MATCH_WINDOW_D = 21;   // a give this long after the OC still counts
  const PAYOUT_MATCH_TOL      = 0.15; // amount may differ from expected by 15%
  function matchPayouts(ocList, payEvents, share, windowDays = PAYOUT_MATCH_WINDOW_D) {
    const maxGap = windowDays * 86400;
    // `share` is either a per-OC function (oc -> pct: Torn's recorded split if
    // present, else the per-level setting) or a flat legacy percentage. The flat
    // number was the old behaviour and it broke matching: on an 80%-split OC the
    // expected amount was 25% too high, so real gives fell outside the tolerance.
    const pctOf = typeof share === 'function' ? share : (() => Number(share) || 0);
    const claims = [];
    for (const oc of ocList) {
      if (!(oc.money > 0)) continue;
      // An OC paid through Torn's NATIVE payout system never touched the funds
      // log — a claim for it can only "match" some unrelated give and steal it
      // from a claim that actually needs it. (Manually-marked-paid OCs keep
      // their claims: those WERE paid via gives, and their claims absorbing
      // those gives is what stops false matches elsewhere.)
      if (oc.native && oc.native.paid) continue;
      const ids = Object.keys(oc.participants || {});
      if (!ids.length) continue;
      const expected = (oc.money * pctOf(oc) / 100) / ids.length;
      if (!(expected > 0)) continue;
      for (const uid of ids) {
        claims.push({ ocId: String(oc.id), ocName: oc.name, uid: String(uid),
                      name: oc.participants[uid], expected, ts: oc.executedAt || 0, matched: null });
      }
    }
    // Plain-text news entries carry no XID, so those gives used to be dropped
    // from matching entirely. Resolve them by exact (case-insensitive) name
    // against the claim population; a name shared by two different uids is
    // ambiguous and stays unresolved rather than guessing.
    const nameToUid = {};
    for (const c of claims) {
      const k = (c.name || '').trim().toLowerCase();
      if (!k) continue;
      if (!(k in nameToUid)) nameToUid[k] = c.uid;
      else if (nameToUid[k] !== c.uid) nameToUid[k] = null;
    }
    const events = Object.entries(payEvents || {})
      .filter(([, e]) => e && e.amount > 0)
      .map(([id, e]) => {
        const toId = (e.toId !== null && e.toId !== undefined && e.toId !== '')
          ? String(e.toId)
          : (nameToUid[(e.toName || '').trim().toLowerCase()] || null);
        return { id, ...e, toId, usedBy: [] };
      })
      .filter(e => e.toId)
      .sort((a, b) => a.ts - b.ts);

    // Pass 1 — confident 1:1 pairings, greedy by best score
    const cands = [];
    for (const c of claims) {
      for (const e of events) {
        if (e.toId !== c.uid) continue;
        const gap = e.ts - c.ts;
        if (gap < -3600 || gap > maxGap) continue;   // must land after the OC (1h skew grace)
        const relErr = Math.abs(e.amount - c.expected) / c.expected;
        if (relErr > PAYOUT_MATCH_TOL) continue;
        cands.push({ c, e, gap, relErr, score: relErr * 10 + (gap / maxGap) });
      }
    }
    cands.sort((a, b) => a.score - b.score);
    for (const cd of cands) {
      if (cd.c.matched || cd.e.usedBy.length) continue;
      cd.c.matched = { eventId: cd.e.id, ts: cd.e.ts, amount: cd.e.amount, relErr: cd.relErr, mode: 'exact', covers: 1 };
      cd.e.usedBy.push(cd.c);
    }

    // Pass 2 — lump sums: one unused give covering several open claims of that member
    for (const e of events) {
      if (e.usedBy.length) continue;
      const open = claims
        .filter(c => !c.matched && c.uid === e.toId && (e.ts - c.ts) >= -3600 && (e.ts - c.ts) <= maxGap)
        .sort((a, b) => a.ts - b.ts);
      if (open.length < 2) continue;               // 1:1 already had its chance
      let acc = 0; const take = [];
      for (const c of open) {
        if (acc + c.expected <= e.amount * (1 + PAYOUT_MATCH_TOL)) { acc += c.expected; take.push(c); }
      }
      if (take.length < 2 || !(acc > 0)) continue;
      const relErr = Math.abs(e.amount - acc) / acc;
      if (relErr > PAYOUT_MATCH_TOL) continue;
      for (const c of take) {
        c.matched = { eventId: e.id, ts: e.ts, amount: e.amount, relErr, mode: 'lump', covers: take.length };
        e.usedBy.push(c);
      }
    }

    // Aggregate per OC
    const byOc = {};
    for (const c of claims) {
      const o = byOc[c.ocId] || (byOc[c.ocId] = { total: 0, matched: 0, paidSum: 0, owedSum: 0, lastTs: 0, minErr: 1, lump: false });
      o.total++;
      if (c.matched) {
        o.matched++; o.paidSum += c.expected;
        o.lastTs = Math.max(o.lastTs, c.matched.ts);
        o.minErr = Math.min(o.minErr, c.matched.relErr);
        if (c.matched.mode === 'lump') o.lump = true;
      } else o.owedSum += c.expected;
    }
    for (const o of Object.values(byOc)) {
      o.full = o.total > 0 && o.matched === o.total;
      // High confidence = every member matched and amounts landed close to expected
      o.confidence = !o.full ? (o.matched ? 'partial' : 'none') : (o.minErr <= 0.02 ? 'high' : 'likely');
    }
    return { byOc, claims, events, unmatchedEvents: events.filter(e => !e.usedBy.length) };
  }
  /**
   * Parse a giveFunds news response and merge new events into the persistent
   * store. Handles both HTML entries (profile links with XIDs — preferred, we
   * request striptags=false) and plain-text fallbacks. Advances the incremental
   * fetch cursor to the newest timestamp seen. Safe to call with junk/errors.
   * @returns the number of raw news entries in the payload (full page = 100),
   *          so syncGiveFunds knows whether another page might be waiting.
   */
  function syncPayoutEvents(newsData) {
    if (!newsData || newsData.__err || !newsData.news) return 0;
    const raw = newsData.news;
    const list = Array.isArray(raw) ? raw : Object.entries(raw).map(([id, n]) => ({ id, ...(typeof n === 'object' ? n : { news: n }) }));
    const ev = loadPayoutEvents();
    let changed = false;
    let maxTs = Number(GM_getValue(GMK.PAYOUT_NEWS_CURSOR, 0)) || 0;
    const htmlRe  = /XID=(\d+)[^>]*>([^<]+)<\/a>\s*gave\s*\$([\d,]+)\s*to\s*<a[^>]*XID=(\d+)[^>]*>([^<]+)</i;
    const plainRe = /^\s*(.+?)\s+gave\s+\$([\d,]+)\s+to\s+(.+?)\s*\.?\s*$/i;
    for (const n of list) {
      const id = String(n.id ?? n.ID ?? '');
      const ts = Number(n.timestamp ?? n.ts ?? 0);
      if (ts > maxTs) maxTs = ts;
      if (!id || ev[id]) continue;
      const txt = String(n.news ?? n.text ?? '');
      let fromId = null, fromName = null, toId = null, toName = null, amount = 0;
      const hm = txt.match(htmlRe);
      if (hm) {
        fromId = hm[1]; fromName = hm[2]; amount = Number(hm[3].replace(/,/g, '')); toId = hm[4]; toName = hm[5];
      } else {
        const stripped = txt.replace(/<[^>]*>/g, '');
        const pm = stripped.match(plainRe);
        if (!pm) continue; // not a "gave $ to" entry
        fromName = pm[1]; amount = Number(pm[2].replace(/,/g, '')); toName = pm[3];
      }
      if (!amount) continue;
      ev[id] = { ts, fromId, fromName, toId, toName, amount };
      changed = true;
    }
    if (changed) savePayoutEvents(ev);
    if (maxTs > 0) GM_setValue(GMK.PAYOUT_NEWS_CURSOR, maxTs);
    return list.length;
  }

  /**
   * Pull new giveFunds news into the persistent event store.
   *
   * First run (no cursor yet): one DESC page seeds the most recent 100 —
   * history builds forward from there, as before.
   *
   * Every later run: an ASCENDING walk from the cursor, up to 5 pages per
   * refresh. The old single `from=cursor&sort=DESC&limit=100` call had a hole:
   * if more than 100 gives landed between refreshes, Torn returned only the
   * NEWEST 100, and syncPayoutEvents advanced the cursor past the ones that
   * were never fetched — permanently. Walking ascending catches up instead.
   * `from` is inclusive, so the boundary event is re-fetched and deduped by id.
   */
  async function syncGiveFunds(apiKey) {
    try {
      const cursor = Number(GM_getValue(GMK.PAYOUT_NEWS_CURSOR, 0)) || 0;
      if (!cursor) {
        syncPayoutEvents(await apiFetch('/faction/news?cat=giveFunds&striptags=false&limit=100&sort=DESC', apiKey));
      } else {
        for (let page = 0; page < 5; page++) {
          const from = Number(GM_getValue(GMK.PAYOUT_NEWS_CURSOR, 0)) || 0;
          const count = syncPayoutEvents(
            await apiFetch(`/faction/news?cat=giveFunds&striptags=false&limit=100&sort=ASC&from=${from}`, apiKey));
          if (!(count >= 100)) break;                                     // short page — caught up
          const after = Number(GM_getValue(GMK.PAYOUT_NEWS_CURSOR, 0)) || 0;
          if (after <= from) break;                                       // cursor didn't move — don't spin
        }
      }
      GM_setValue(GMK.PAYOUT_NEWS_STATUS, 'ok');
    } catch (err) {
      GM_setValue(GMK.PAYOUT_NEWS_STATUS, String((err && err.message) || err));
    }
  }

  // ─── FACTION DEPOSITS (v5.0) ───────────────────────────────────────────────
  // The other half of the funds log: money coming IN. cat=depositFunds entries
  // read "X deposited $1,000,000." — stored forever, keyed by news id, so the
  // Money > Funds pane can show per-member deposits alongside the gives.

  function loadDepositEvents() {
    try { return JSON.parse(GM_getValue(GMK.DEPOSIT_EVENTS, '{}')) || {}; } catch (_) { return {}; }
  }
  function saveDepositEvents(ev) {
    try { GM_setValue(GMK.DEPOSIT_EVENTS, JSON.stringify(ev)); } catch (_) {}
  }

  /**
   * Parse one depositFunds news page into the persistent store. Same shape
   * discipline as syncPayoutEvents: XID links preferred, plain-text fallback,
   * cursor advanced to the newest timestamp seen. Returns the raw entry count
   * so the walker knows whether another page might be waiting.
   */
  function syncDepositEvents(newsData) {
    if (!newsData || newsData.__err || !newsData.news) return 0;
    const raw = newsData.news;
    const list = Array.isArray(raw) ? raw : Object.entries(raw).map(([id, n]) => ({ id, ...(typeof n === 'object' ? n : { news: n }) }));
    const ev = loadDepositEvents();
    let changed = false;
    let maxTs = Number(GM_getValue(GMK.DEPOSIT_CURSOR, 0)) || 0;
    const htmlRe  = /XID=(\d+)[^>]*>([^<]+)<\/a>\s*deposited\s*\$([\d,]+)/i;
    const plainRe = /^\s*(.+?)\s+deposited\s+\$([\d,]+)\s*\.?\s*$/i;
    for (const n of list) {
      const id = String(n.id ?? n.ID ?? '');
      const ts = Number(n.timestamp ?? n.ts ?? 0);
      if (ts > maxTs) maxTs = ts;
      if (!id || ev[id]) continue;
      const txt = String(n.news ?? n.text ?? '');
      let uid = null, name = null, amount = 0;
      const hm = txt.match(htmlRe);
      if (hm) { uid = hm[1]; name = hm[2]; amount = Number(hm[3].replace(/,/g, '')); }
      else {
        const pm = txt.replace(/<[^>]*>/g, '').match(plainRe);
        if (!pm) continue;   // not a deposit entry
        name = pm[1]; amount = Number(pm[2].replace(/,/g, ''));
      }
      if (!amount) continue;
      ev[id] = { ts, uid, name, amount };
      changed = true;
    }
    if (changed) saveDepositEvents(ev);
    if (maxTs > 0) GM_setValue(GMK.DEPOSIT_CURSOR, maxTs);
    return list.length;
  }

  /** Cursor-walked depositFunds fetch — identical pattern to syncGiveFunds. */
  async function syncDepositFunds(apiKey) {
    try {
      const cursor = Number(GM_getValue(GMK.DEPOSIT_CURSOR, 0)) || 0;
      if (!cursor) {
        syncDepositEvents(await apiFetch('/faction/news?cat=depositFunds&striptags=false&limit=100&sort=DESC', apiKey));
      } else {
        for (let page = 0; page < 5; page++) {
          const from = Number(GM_getValue(GMK.DEPOSIT_CURSOR, 0)) || 0;
          const count = syncDepositEvents(
            await apiFetch(`/faction/news?cat=depositFunds&striptags=false&limit=100&sort=ASC&from=${from}`, apiKey));
          if (!(count >= 100)) break;
          const after = Number(GM_getValue(GMK.DEPOSIT_CURSOR, 0)) || 0;
          if (after <= from) break;
        }
      }
      GM_setValue(GMK.DEPOSIT_STATUS, 'ok');
    } catch (err) {
      GM_setValue(GMK.DEPOSIT_STATUS, String((err && err.message) || err));
    }
  }

  /**
   * Record completed OCs into the persistent ledger. Keyed by oc.id so repeated
   * refreshes don't double-count. Returns the updated ledger.
   * itemValues is used to snapshot item value at time of recording (so historical
   * profit isn't retroactively changed by market price swings).
   */
  /**
   * Compute the consumed-material cost of a single OC from its slots. Each slot's
   * item_requirement with is_reusable === false is a material consumed on the run;
   * reusable tools (is_reusable === true) are NOT consumed and are excluded, so they
   * never count as recurring cost. Returns the total cost at the supplied prices plus
   * a per-item {qty, unit} breakdown.
   * @param oc        a single OC object (must have .slots)
   * @param priceMap  itemId(string) -> unit market price
   * @returns {{cost:number, costItems:Object.<string,{qty:number,unit:number}>}}
   */
  function computeOcCost(oc, priceMap = {}) {
    const costItems = {};
    let cost = 0;
    const slots = Array.isArray(oc?.slots) ? oc.slots : Object.values(oc?.slots || {});
    for (const slot of slots) {
      const req = slot?.item_requirement;
      if (!req || !req.id) continue;
      if (req.is_reusable === true) continue;       // reusable tool — not consumed
      const iid  = String(req.id);
      const unit = Number(priceMap[iid]) || 0;
      if (!costItems[iid]) costItems[iid] = { qty: 0, unit };
      costItems[iid].qty += 1;                        // one item consumed per slot
      cost += unit;
    }
    return { cost, costItems };
  }

  /**
   * Read Torn's NATIVE OC payout data off a crime object.
   *
   * OC 2.0 has a built-in payout system: leadership pays out a scenario in-game,
   * choosing a percentage split between the faction and the participants (each
   * participant gets an equal share of the members' cut). Torn records this on the
   * crime itself — so who was paid, when, and at what percentage is a FACT from the
   * API, not something we need to infer from the funds log.
   *
   * Field names aren't fully pinned down across API revisions, so every key is read
   * defensively and any shape we don't recognise simply yields null (callers then
   * fall back to the manual Paid toggle / funds-log matching).
   *
   * @returns {{paid:boolean, at:number|null, by:string|null, percentage:number|null, type:string|null}|null}
   */
  function readNativePayout(oc) {
    const p = oc?.rewards?.payout ?? oc?.payout;
    if (!p || typeof p !== 'object') return null;
    const num = v => (v === null || v === undefined || v === '') ? null : (Number(v) || 0);
    const at   = num(p.paid_at ?? p.paidAt ?? p.timestamp ?? p.time);
    const by   = p.paid_by ?? p.paidBy ?? p.user_id ?? p.userId ?? null;
    const pct  = num(p.percentage ?? p.percent ?? p.share);
    const type = p.type ?? p.method ?? null;
    // A payout object with no timestamp means "not paid yet" (Torn stamps paid_at on payout).
    return { paid: !!at, at: at || null, by: by != null ? String(by) : null,
             percentage: pct, type: type != null ? String(type) : null };
  }

  function recordProfit(crimes, itemValues = {}, memberNames = {}) {
    const ledger = loadProfitLedger();
    let changed = false;
    for (const oc of Object.values(crimes || {})) {
      if (!oc || typeof oc !== 'object') continue;
      const status = (oc.status || '').toLowerCase();
      if (status !== 'successful' && status !== 'success') continue;
      const id = String(oc.id ?? '');
      if (!id || ledger[id]) continue; // already recorded
      const rewards = oc.rewards;
      if (!rewards) continue;
      const money = Number(rewards.money) || 0;
      const resp  = Number(rewards.respect) || 0;
      const rwItems = rewards.items
        ? (Array.isArray(rewards.items) ? rewards.items : Object.values(rewards.items))
        : [];
      let itemValue = 0;
      const items = {};
      for (const it of rwItems) {
        const iid = String(it?.id || it?.item_id || '');
        const qty = Number(it?.quantity || it?.qty || 1);
        if (!iid) continue;
        items[iid] = (items[iid] || 0) + qty;
        itemValue += (Number(itemValues[iid]) || 0) * qty;
      }
      // Cost side — consumed materials, priced at snapshot (record time)
      const { cost, costItems } = computeOcCost(oc, itemValues);
      // Participants — who ran it (kept so all-time records retain their crew
      // after the OC ages out of the API window)
      const participants = {};
      const pSlots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || {});
      for (const s of pSlots) if (s?.user?.id) participants[String(s.user.id)] = resolveMemberName(s.user.id, memberNames, s.user.name);
      ledger[id] = {
        name: oc.name || `OC #${id}`,
        money, itemValue, respect: resp, status: oc.status ?? null, difficulty: oc.difficulty ?? null,
        executedAt: oc.executed_at ?? null,
        items,
        cost, costItems,
        participants,
        payout: readNativePayout(oc),   // Torn's own payout record (authoritative)
      };
      changed = true;
    }
    if (changed) saveProfitLedger(ledger);
    return ledger;
  }

  // ─── WAR DATA LAYER (v4.1) ─────────────────────────────────────────────────
  // Attack ledger + war archive + chain archive. All API-fed (there is nothing
  // worth scraping for wars), all read-only advisory data, all id-keyed so
  // re-fetching overlapping pages is idempotent.
  //
  // Storage discipline: an active faction produces thousands of attack rows, so
  // rows are slimmed hard, raw rows are pruned to 180 days, and the PERMANENT
  // record is the per-war/per-chain aggregate in the archives.

  const ATTACK_RETENTION_S = 180 * 86400;

  function loadAttackLedger() {
    try { return JSON.parse(GM_getValue(GMK.ATTACK_LEDGER, '{}')) || {}; } catch (_) { return {}; }
  }
  function saveAttackLedger(led) {
    try { GM_setValue(GMK.ATTACK_LEDGER, JSON.stringify(led)); } catch (e) {
      ocmToast('Attack ledger too large to save: ' + e.message, 'warn');
    }
  }
  function loadWarArchive() {
    try { return JSON.parse(GM_getValue(GMK.WAR_ARCHIVE, '{}')) || {}; } catch (_) { return {}; }
  }
  function saveWarArchive(arc) {
    try { GM_setValue(GMK.WAR_ARCHIVE, JSON.stringify(arc)); } catch (_) {}
  }
  function loadChainArchive() {
    try { return JSON.parse(GM_getValue(GMK.CHAIN_ARCHIVE, '{}')) || {}; } catch (_) { return {}; }
  }
  function saveChainArchive(arc) {
    try { GM_setValue(GMK.CHAIN_ARCHIVE, JSON.stringify(arc)); } catch (_) {}
  }

  /** Torn ships lists as arrays (v2) or id-keyed objects (v1 leftovers). Return
   *  [{id, ...}] either way — Object.values would silently drop the ids. */
  function tornList(raw) {
    if (Array.isArray(raw)) return raw;
    return Object.entries(raw || {}).map(([id, v]) => (v && typeof v === 'object' ? { id, ...v } : { id, value: v }));
  }

  /**
   * Trim one attack to what the war analytics use. Every field is read
   * defensively — attack payload field names have drifted between API
   * revisions, and a shape we don't recognise must degrade, not throw.
   *   dir: 'out' = our member attacked, 'in' = our member was attacked.
   *   Stealthed incoming attacks have a null attacker — bucketed as unknown.
   */
  function slimAttack(a, myFid) {
    const atk = a?.attacker || null, def = a?.defender || null;
    const aFid = atk?.faction?.id ?? atk?.faction_id ?? null;
    const dFid = def?.faction?.id ?? def?.faction_id ?? null;
    const m = a?.modifiers || {};
    const warMod = Number(m.war ?? 1) || 1;
    return {
      i:  String(a?.id ?? a?.code ?? ''),
      ts: Number(a?.ended ?? a?.timestamp_ended ?? a?.started ?? 0) || 0,
      a:  atk?.id != null ? String(atk.id) : null,
      an: atk?.name ?? null,
      d:  def?.id != null ? String(def.id) : null,
      dn: def?.name ?? null,
      af: aFid != null ? String(aFid) : null,
      df: dFid != null ? String(dFid) : null,
      dir: (myFid && aFid != null && String(aFid) === String(myFid)) ? 'out' : 'in',
      res: a?.result ?? null,
      rg: Number(a?.respect_gain ?? a?.respect ?? 0) || 0,
      rl: Number(a?.respect_loss ?? 0) || 0,
      st: (a?.is_stealthed ?? a?.stealthed) ? 1 : 0,
      ch: Number(a?.chain ?? 0) || 0,
      rw: (a?.is_ranked_war ?? (warMod > 1)) ? 1 : 0,
      m: {
        ff:  Number(m.fair_fight ?? m.fairFight ?? 1) || 1,
        war: warMod,
        ret: Number(m.retaliation ?? 1) || 1,
        grp: Number(m.group ?? m.groupAttack ?? 1) || 1,
        os:  Number(m.overseas ?? 1) || 1,
        cb:  Number(m.chain ?? m.chainBonus ?? 1) || 1,
      },
    };
  }

  /** Merge one attacks page into the ledger; advance the forward cursor to the
   *  newest ts seen. Returns {added, rows} so callers can decide to page on. */
  function mergeAttacks(led, data, myFid) {
    let maxTs = Number(GM_getValue(GMK.ATTACK_CURSOR, 0)) || 0;
    let added = 0, rows = 0;
    for (const a of tornList(data?.attacks)) {
      rows++;
      const s = slimAttack(a, myFid);
      if (!s.i || !s.ts) continue;
      if (s.ts > maxTs) maxTs = s.ts;
      if (!led[s.i]) added++;
      led[s.i] = s;   // refresh even if seen — respect can finalise late
    }
    if (maxTs > 0) GM_setValue(GMK.ATTACK_CURSOR, maxTs);
    return { added, rows };
  }

  /** Drop raw rows past retention. The war/chain archives keep the aggregates. */
  function pruneAttacks(led) {
    const cutoff = Math.floor(Date.now() / 1000) - ATTACK_RETENTION_S;
    for (const [id, s] of Object.entries(led)) if ((s?.ts || 0) < cutoff) delete led[id];
    return led;
  }

  /**
   * Forward incremental attack sync. First run seeds the newest 100 (DESC);
   * afterwards an ASCENDING walk from the cursor, up to 5 pages per poll — the
   * same no-skipped-burst design as syncGiveFunds. Failures (usually a key
   * without faction AA) land in ATTACK_STATUS and the War panes degrade to a
   * one-line note instead of breaking.
   */
  async function syncAttacks(apiKey) {
    const myFid = String(GM_getValue(GMK.MY_FACTION_ID, '') || '');
    const led = loadAttackLedger();
    let changed = 0;
    try {
      const cursor = Number(GM_getValue(GMK.ATTACK_CURSOR, 0)) || 0;
      if (!cursor) {
        changed += mergeAttacks(led, await apiFetch('/faction/attacks?limit=100&sort=DESC', apiKey), myFid).added;
      } else {
        for (let page = 0; page < 5; page++) {
          const from = Number(GM_getValue(GMK.ATTACK_CURSOR, 0)) || 0;
          const { added, rows } = mergeAttacks(led,
            await apiFetch(`/faction/attacks?limit=100&sort=ASC&from=${from}`, apiKey), myFid);
          changed += added;
          if (rows < 100) break;                                          // short page — caught up
          if ((Number(GM_getValue(GMK.ATTACK_CURSOR, 0)) || 0) <= from) break;  // cursor stuck — don't spin
        }
      }
      GM_setValue(GMK.ATTACK_STATUS, 'ok');
    } catch (e) {
      GM_setValue(GMK.ATTACK_STATUS, String((e && e.message) || e));
    }
    if (changed) { pruneAttacks(led); saveAttackLedger(led); }
    return changed;
  }

  /**
   * Page BACKWARDS through attack history to fill the ledger (button-triggered,
   * like backfillOcHistory, and paced the same: ~66/min, retries, no silent
   * holes). Attacks paginate by rows not time, so the walk advances
   * `to = oldestRowSeen - 1` while a window keeps returning full pages.
   */
  async function backfillAttacks(apiKey, onProgress, floorDays = 90) {
    const led = loadAttackLedger();
    const PACE = 900, RETRIES = 4;
    const FLOOR = Math.floor(Date.now() / 1000) - Math.min(floorDays, 180) * 86400;
    const myFid = String(GM_getValue(GMK.MY_FACTION_ID, '') || '');
    const known = Object.values(led).map(s => s.ts).filter(Boolean);
    let to = known.length ? Math.min(...known) - 1 : Math.floor(Date.now() / 1000);
    let calls = 0, added = 0;
    const gaps = [];

    while (to > FLOOR) {
      let data = null, lastErr = null;
      for (let attempt = 1; attempt <= RETRIES && data === null; attempt++) {
        try {
          data = await apiFetch(`/faction/attacks?limit=100&sort=DESC&from=${FLOOR}&to=${to}`, apiKey);
          calls++;
        } catch (e) {
          lastErr = e; calls++;
          onProgress?.({ done: false, error: `${e.message} (retry ${attempt}/${RETRIES})`, added, calls });
          await new Promise(r => setTimeout(r, PACE * attempt * 2));
        }
      }
      if (data === null) { gaps.push({ to, error: lastErr?.message }); break; }

      const rows = tornList(data?.attacks);
      let oldest = to;
      for (const a of rows) {
        const s = slimAttack(a, myFid);
        if (!s.i || !s.ts) continue;
        if (!led[s.i]) added++;
        led[s.i] = s;
        if (s.ts < oldest) oldest = s.ts;
      }
      onProgress?.({ done: false, added, calls, oldest: new Date(oldest * 1000), total: Object.keys(led).length });
      if (rows.length < 100) break;      // window exhausted — reached the floor
      if (oldest >= to) break;           // no progress — bail rather than spin
      to = oldest - 1;
      await new Promise(r => setTimeout(r, PACE));
    }

    saveAttackLedger(led);
    GM_setValue(GMK.ATTACK_META, JSON.stringify({ at: Date.now(), total: Object.keys(led).length, gaps: gaps.length }));
    onProgress?.({ done: true, added, calls, total: Object.keys(led).length, gaps });
    return led;
  }

  /** Slim the official post-war report to per-faction, per-member {attacks, score}. */
  function slimWarReport(rw) {
    const fl = tornList(rw?.factions ?? rw);
    return {
      factions: fl.map(f => ({
        id: String(f.id ?? ''),
        name: f.name ?? null,
        score: Number(f.score ?? 0) || 0,
        attacks: Number(f.attacks ?? 0) || 0,
        rewards: f.rewards ? { respect: f.rewards.respect ?? null, points: f.rewards.points ?? null } : null,
        members: tornList(f.members).map(m => ({
          id: String(m.id ?? ''), name: m.name ?? null, level: m.level ?? null,
          attacks: Number(m.attacks ?? 0) || 0, score: Number(m.score ?? 0) || 0,
        })),
      })),
    };
  }

  /** Merge one rankedwars payload into the archive. Handles BOTH shapes:
   *  v2 (array of wars, flat fields) and v1 (object keyed by war id with a
   *  nested `war:{start,end,target,winner}` and fid-keyed `factions`). */
  function mergeWarsPayload(arc, data) {
    let changed = 0;
    for (const w of tornList(data?.rankedwars)) {
      const id = String(w.id ?? w.war_id ?? '');
      if (!id) continue;
      const nested = w.war || {};
      const factions = tornList(w.factions).map(f => ({
        id: String(f.id ?? ''), name: f.name ?? null,
        score: Number(f.score ?? 0) || 0, chain: Number(f.chain ?? 0) || 0,
      }));
      const rec = arc[id] || {};
      if (!arc[id]) changed++;
      arc[id] = {
        ...rec,
        start:  Number(w.start ?? nested.start ?? rec.start ?? 0) || 0,
        end:    Number(w.end ?? nested.end ?? rec.end ?? 0) || 0,
        target: Number(w.target ?? nested.target ?? rec.target ?? 0) || 0,
        winner: w.winner ?? nested.winner ?? rec.winner ?? null,
        factions: factions.length ? factions : (rec.factions || []),
      };
    }
    return changed;
  }

  /** v1 GET. Two things still only work well on v1: the FULL ranked-war
   *  history (v2 returns recent wars; v1 returns every war ever fought) and
   *  the windowed attacks walk for arbitrary past wars. */
  async function apiFetchV1(pathQuery, apiKey) {
    const sep = pathQuery.includes('?') ? '&' : '?';
    return tornApiGet(`https://api.torn.com/${pathQuery}${sep}key=${apiKey}&comment=OCSuite`);
  }

  /** Load the COMPLETE ranked-war history into the archive (one v1 call).
   *  Official per-member reports then arrive via syncWars, 3 per sync. */
  async function fetchFullWarHistory(apiKey) {
    const data = await apiFetchV1('faction/?selections=rankedwars', apiKey);
    const arc = loadWarArchive();
    const added = mergeWarsPayload(arc, data);
    saveWarArchive(arc);
    return { total: Object.keys(arc).length, added };
  }

  /**
   * Ranked wars → permanent archive. Live/upcoming wars refresh their scores on
   * every sync; an ENDED war additionally gets Torn's official per-member report
   * fetched once (immutable once over) — capped at 3 per sync so a freshly
   * loaded full history doesn't burn the whole minute's API budget at once.
   */
  async function syncWars(apiKey) {
    try {
      const data = await apiFetch('/faction/rankedwars', apiKey);
      const arc = loadWarArchive();
      let changed = mergeWarsPayload(arc, data) > 0;
      let fetched = 0;
      for (const [id, w] of Object.entries(arc).sort((x, y) => (y[1].end || 0) - (x[1].end || 0))) {
        if (fetched >= 3) break;
        if (!w.end || w.end > Math.floor(Date.now() / 1000) || w.report) continue;
        try {
          const rep = await apiFetch(`/torn/${id}?selections=rankedwarreport`, apiKey);
          const rw = rep?.rankedwarreport ?? rep?.rankedWarReport ?? null;
          if (rw) { w.report = slimWarReport(rw); changed = true; }
        } catch (_) { /* report not ready / shape drift — retried next sync */ }
        fetched++;
      }
      if (changed) saveWarArchive(arc);
      GM_setValue(GMK.WAR_STATUS, 'ok');
    } catch (e) {
      GM_setValue(GMK.WAR_STATUS, String((e && e.message) || e));
    }
  }

  // ── Deep per-war reports for ANY archived war (modelled on the standalone
  //    "Torn War Payout Report" script). The 180-day attack ledger can't cover
  //    old wars, so this walks v1 faction/attacks across the war's own window,
  //    classifies every row, and stores the per-member breakdown PERMANENTLY
  //    on the war record.

  /** Successful-attack results, from the attacker's point of view. */
  const WAR_WIN_RESULTS = new Set(['Attacked', 'Mugged', 'Hospitalized', 'Arrested', 'Looted', 'Special']);

  /**
   * Paginate v1 faction/attacks across [from, to]. Torn caps each call at 100
   * rows, so we walk forward by timestamp, deduping by attack id. Lessons
   * inherited from the standalone script: do NOT stop on a short page (Torn's
   * 30s cache can return one mid-stream — stopping drops later attacks); stop
   * only on two empty pages, a stalled cursor, or reaching `to`.
   */
  async function pullWarAttacks(apiKey, from, to, onProgress) {
    const PACE = 900, HARD_LIMIT = 250;
    const seen = new Map();
    let cursor = from, iterations = 0, emptyStreak = 0, partial = false;
    while (iterations < HARD_LIMIT) {
      iterations++;
      let data;
      try {
        data = await apiFetchV1(`faction/?selections=attacks&from=${cursor}&to=${to}`, apiKey);
      } catch (e) {
        if (seen.size > 0) { partial = true; break; }   // keep what we have
        throw e;
      }
      const batch = data?.attacks || {};
      const ids = Object.keys(batch);
      if (!ids.length) {
        if (++emptyStreak >= 2) break;
        cursor += 1;
        await new Promise(r => setTimeout(r, PACE));
        continue;
      }
      emptyStreak = 0;
      let newCount = 0, maxStarted = cursor;
      for (const id of ids) {
        const a = batch[id];
        if (!seen.has(id)) { seen.set(id, a); newCount++; }
        const ts = Number(a?.timestamp_started || 0);
        if (ts > maxStarted) maxStarted = ts;
      }
      onProgress?.(seen.size, iterations);
      if (maxStarted >= to) break;
      const prev = cursor;
      cursor = maxStarted > cursor ? maxStarted : cursor + 1;
      if (newCount === 0 && maxStarted <= prev) break;   // no progress — done
      await new Promise(r => setTimeout(r, PACE));
    }
    return { list: [...seen.values()], partial, calls: iterations };
  }

  /**
   * Classify a war's attacks into per-member rows (v1 flat field names).
   * Offensive vs the enemy: wins / lost / stalemates / assists / respect.
   * Defensive: beaten by anyone (lossAll) vs by the enemy (lossEnemy),
   * confirmed enemy incoming (war bonus is definitive even when stealthed),
   * likely-enemy stealthed incoming, and attacks held (defends).
   */
  function buildWarObsReport(attacks, myFid, oppId) {
    const my = String(myFid), opp = String(oppId ?? '');
    const rows = new Map();
    const blank = (id, name) => ({ uid: String(id), name: name || ('#' + id),
      wins: 0, offLost: 0, stale: 0, assists: 0, respect: 0, totalOff: 0,
      lossAll: 0, lossEnemy: 0, enemyOn: 0, stealthOn: 0, defHeld: 0 });
    const ensure = (id, name) => {
      const k = String(id);
      if (!rows.has(k)) rows.set(k, blank(k, name));
      const r = rows.get(k);
      if (name && r.name.startsWith('#')) r.name = name;
      return r;
    };
    let totalHits = 0, totalRespect = 0;
    for (const a of attacks) {
      const res = String(a?.result || '');
      const aF = String(a?.attacker_faction ?? '');
      const dF = String(a?.defender_faction ?? '');
      const warHit = Number(a?.modifiers?.war ?? 1) > 1;
      // Offensive: our member hit the enemy faction.
      if (aF === my && dF === opp && a?.attacker_id) {
        const r = ensure(a.attacker_id, a.attacker_name);
        r.totalOff++;
        if (WAR_WIN_RESULTS.has(res)) { r.wins++; totalHits++; }
        else if (res === 'Lost') r.offLost++;
        else if (res === 'Stalemate') r.stale++;
        else if (res === 'Assist') r.assists++;
        r.respect += Number(a?.respect_gain || 0);
        totalRespect += Number(a?.respect_gain || 0);
      }
      // Defensive: our member was attacked by someone outside the faction.
      if (dF === my && a?.defender_id && aF !== my) {
        const r = ensure(a.defender_id, a.defender_name);
        const enemyHit = aF === opp || warHit;   // war bonus is definitive even when stealthed
        if (enemyHit) r.enemyOn++;
        else if (Number(a?.stealthed) === 1) r.stealthOn++;
        if (WAR_WIN_RESULTS.has(res)) { r.lossAll++; if (enemyHit) r.lossEnemy++; }
        else if (res === 'Lost' || res === 'Stalemate' || res === 'Escape' || res === 'Timeout') r.defHeld++;
      }
    }
    const list = [...rows.values()]
      .filter(r => r.totalOff || r.lossAll || r.enemyOn || r.stealthOn || r.defHeld)
      .sort((x, y) => y.respect - x.respect || y.wins - x.wins);
    return { rows: list, totalHits, totalRespect };
  }

  /** Fetch + classify + permanently store the deep report for one archived war. */
  async function fetchWarObsReport(apiKey, warId, onProgress) {
    const arc = loadWarArchive();
    const war = arc[String(warId)];
    if (!war || !war.start) throw new Error('war not in archive');
    const to = war.end || Math.floor(Date.now() / 1000);
    const myFid = String(GM_getValue(GMK.MY_FACTION_ID, '') || '');
    const opp = (war.factions || []).find(f => String(f.id) !== myFid);
    const { list, partial, calls } = await pullWarAttacks(apiKey, war.start, to, onProgress);
    const rep = buildWarObsReport(list, myFid, opp ? opp.id : '');
    war.obsReport = { at: Math.floor(Date.now() / 1000), partial, scanned: list.length, calls, ...rep };
    saveWarArchive(arc);
    return war.obsReport;
  }

  /** Slim a chain report: per-attacker {attacks, respect, avg, best}. The API
   *  returns attacker IDs without names — names resolve at render time. */
  function slimChainReport(cr) {
    const att = tornList(cr?.attackers ?? cr?.members);
    return {
      chain:   Number(cr?.details?.chain ?? cr?.chain ?? 0) || 0,
      respect: Number(cr?.details?.respect ?? cr?.respect ?? 0) || 0,
      attackers: att.map(a => ({
        id: String(a.id ?? a.userID ?? ''),
        attacks: Number(a.attacks?.total ?? a.attacks ?? 0) || 0,
        respect: Number(a.respect?.total ?? (typeof a.respect === 'number' ? a.respect : 0)) || 0,
        avg:  Number(a.respect?.average ?? a.avg ?? 0) || 0,
        best: Number(a.respect?.best ?? a.best ?? 0) || 0,
      })),
      nonAttackers: (Array.isArray(cr?.non_attackers) ? cr.non_attackers : []).map(String),
    };
  }

  /**
   * Past chains → permanent archive, plus the per-member chain report for the
   * newest few unreported chains (one call each; a failed report attempt backs
   * off for 6 hours instead of hammering an endpoint that may not like us).
   */
  async function syncChains(apiKey) {
    try {
      const data = await apiFetch('/faction/chains?limit=25', apiKey);
      const arc = loadChainArchive();
      let changed = false;
      for (const c of tornList(data?.chains)) {
        const id = String(c.id ?? '');
        if (!id) continue;
        const rec = arc[id] || {};
        arc[id] = {
          ...rec,
          length:  Number(c.chain ?? c.length ?? rec.length ?? 0) || 0,
          respect: Number(c.respect ?? rec.respect ?? 0) || 0,
          start:   Number(c.start ?? rec.start ?? 0) || 0,
          end:     Number(c.end ?? rec.end ?? 0) || 0,
        };
        changed = true;
      }
      let fetched = 0;
      const RETRY_MS = 6 * 3600e3;
      for (const [id, c] of Object.entries(arc).sort((x, y) => (y[1].end || 0) - (x[1].end || 0))) {
        if (c.report || !c.end || fetched >= 3) continue;
        if (c.reportErrAt && Date.now() - c.reportErrAt < RETRY_MS) continue;
        try {
          const rep = await apiFetch(`/faction/${id}/chainreport`, apiKey);
          const cr = rep?.chainreport ?? rep?.chain_report ?? null;
          if (cr) { c.report = slimChainReport(cr); delete c.reportErrAt; changed = true; }
          fetched++;
        } catch (e) {
          c.reportErrAt = Date.now(); c.reportErr = String((e && e.message) || e);
          changed = true; fetched++;
        }
      }
      if (changed) saveChainArchive(arc);
      GM_setValue(GMK.CHAIN_STATUS, 'ok');
    } catch (e) {
      GM_setValue(GMK.CHAIN_STATUS, String((e && e.message) || e));
    }
  }

  /** Is a ranked war live right now (started, not ended)? */
  function warIsActive(arc) {
    const now = Math.floor(Date.now() / 1000);
    return Object.values(arc || {}).some(w => (w.start || 0) <= now && (!w.end || w.end > now));
  }

  /**
   * The war-data poll group, throttled as one unit: every 60s while a ranked
   * war is live, every 5 minutes otherwise. Piggybacks on the dashboard's
   * refresh cycle — at most ~3–4 extra calls per firing, well inside the
   * shared 100/min budget. Returns true when a sync actually ran.
   */
  let _warSyncInFlight = false;
  async function syncWarData(apiKey) {
    if (_warSyncInFlight) return false;
    const now = Date.now();
    const last = Number(GM_getValue(GMK.WAR_SYNC_AT, 0)) || 0;
    const interval = warIsActive(loadWarArchive()) ? 60e3 : 300e3;
    if (now - last < interval) return false;
    _warSyncInFlight = true;
    GM_setValue(GMK.WAR_SYNC_AT, now);
    try {
      await syncWars(apiKey);
      await syncAttacks(apiKey);
      await syncChains(apiKey);
      await syncRevives(apiKey);
      await syncArmoryNews(apiKey);
      await syncArmouryGear(apiKey);
      // Baseline live-chain check (forced): the 30s watcher only polls while
      // its pane is open or a chain is live — this is how we notice one STARTING.
      await pollLiveChain(apiKey, true);
      return true;
    } finally {
      _warSyncInFlight = false;
    }
  }

  /**
   * Per-member stats for one war, computed from the attack ledger ("obs" —
   * shown beside Torn's official report, never instead of it).
   *
   * Members are keyed by uid with the NAME CAPTURED ON THE ATTACK ROW — a
   * member who left the faction mid-war keeps their identity here; nothing is
   * resolved against the live roster.
   */
  function computeWarStats(led, war) {
    const myFid = String(GM_getValue(GMK.MY_FACTION_ID, '') || '');
    const opp = (war.factions || []).find(f => String(f.id) !== myFid) || null;
    const from = war.start || 0;
    const to = war.end || Math.floor(Date.now() / 1000);
    const per = {};
    const ensure = (uid, name) => {
      if (!per[uid]) per[uid] = { uid, name: name || ('#' + uid), hits: 0, warHits: 0, assists: 0,
                                  outLost: 0, losses: 0, defends: 0, respect: 0, respectLost: 0, ffSum: 0, ffN: 0 };
      if (name && per[uid].name.startsWith('#')) per[uid].name = name;
      return per[uid];
    };
    for (const s of Object.values(led)) {
      if (!s || s.ts < from || s.ts > to) continue;
      // Scope to this war's opponent when we know it (chains/random attacks
      // during the window would otherwise pollute the numbers).
      if (opp && s.af !== String(opp.id) && s.df !== String(opp.id)) continue;
      const res = String(s.res || '');
      if (s.dir === 'out') {
        if (!s.a) continue;
        const m = ensure(s.a, s.an);
        if (/^assist/i.test(res)) { m.assists++; continue; }
        if (/^(lost|stalemate|escape|timeout|interrupted)/i.test(res)) { m.outLost++; continue; }
        m.hits++;
        if (s.rw || s.m.war > 1) m.warHits++;
        m.respect += s.rg;
        if (s.m.ff > 0) { m.ffSum += s.m.ff; m.ffN++; }
      } else {
        if (!s.d) continue;
        const m = ensure(s.d, s.dn);
        // res is from the ATTACKER's perspective: their loss = our defend.
        if (/^(lost|stalemate|escape|timeout|interrupted)/i.test(res)) m.defends++;
        else { m.losses++; m.respectLost += s.rl; }
      }
    }
    return per;
  }

  // ─── WAR PAYOUT CALCULATOR (v4.3) ──────────────────────────────────────────
  // Pure math kept separate from the renderer so it's testable. The pot is a
  // MANUAL input — the API cannot see what the war cache sold for.

  /** "1.5b" → 1.5e9 · "750m" → 7.5e8 · "250k" → 250000 · "2,000,000" → 2e6. */
  function parseMoneyInput(s) {
    const t = String(s || '').trim().toLowerCase().replace(/[$,\s]/g, '');
    if (!t) return 0;
    const m = t.match(/^([\d.]+)([kmb])?$/);
    if (!m) return 0;
    const n = Number(m[1]);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * ({ k: 1e3, m: 1e6, b: 1e9 }[m[2]] || 1));
  }

  /**
   * Split a pot across members: `flatPct`% divided evenly, the rest
   * proportional to each member's metric. Every payout rounds DOWN to
   * `roundTo` (default $1k) and the remainder stays with the faction —
   * the split can never promise more money than the pot holds.
   */
  function computeWarPay(rows, pot, cfg = {}) {
    const flatPct = Math.max(0, Math.min(100, Number(cfg.flatPct) || 0));
    const roundTo = Math.max(1, Number(cfg.roundTo) || 1000);
    const n = rows.length;
    const totalMetric = rows.reduce((s, r) => s + (Number(r.metric) || 0), 0);
    const flatPool = pot * flatPct / 100;
    const perfPool = pot - flatPool;
    const out = rows.map(r => {
      const metric = Number(r.metric) || 0;
      const raw = (n ? flatPool / n : 0) + (totalMetric > 0 ? perfPool * metric / totalMetric : 0);
      const amount = Math.floor(raw / roundTo) * roundTo;
      return { ...r, metric, share: totalMetric > 0 ? metric / totalMetric : 0, amount };
    });
    const distributed = out.reduce((s, r) => s + r.amount, 0);
    return { rows: out, distributed, remainder: pot - distributed, totalMetric };
  }

  /**
   * Per-member metric rows for one war. Source priority: official report
   * (exact once the war ends) → the war's fetched deep report (works for any
   * archived war, however old) → the 180-day attack ledger. `minMetric` drops
   * members below the threshold entirely (no flat share either — that's the
   * point of a minimum).
   */
  function warPayRows(war, base = 'score', minMetric = 0) {
    const myFid = String(GM_getValue(GMK.MY_FACTION_ID, '') || '');
    const led = loadAttackLedger();
    const obs = computeWarStats(led, war);
    const rep = war.report?.factions?.find(f => String(f.id) === myFid) || null;
    const deep = {};
    for (const r of (war.obsReport?.rows || [])) deep[r.uid] = r;
    const uids = [...new Set([...(rep?.members || []).map(m => m.id), ...Object.keys(deep), ...Object.keys(obs)])];
    return uids.map(uid => {
      const o = obs[uid] || {};
      const d = deep[uid] || null;
      const r = (rep?.members || []).find(m => m.id === uid) || null;
      const metric = base === 'hits'    ? (r ? r.attacks : (d ? d.wins : (o.warHits || 0)))
                   : base === 'respect' ? (d ? d.respect : (o.respect || 0))
                   :                      (r ? r.score : (d ? d.respect : (o.respect || 0)));   // 'score'
      return { uid, name: r?.name || d?.name || o.name || ('#' + uid), metric: Math.round((Number(metric) || 0) * 100) / 100 };
    }).filter(r => r.metric >= minMetric && r.metric > 0)
      .sort((a, b) => b.metric - a.metric);
  }

  function loadWarPayLedger() {
    try { return JSON.parse(GM_getValue(GMK.WAR_PAY_LEDGER, '{}')) || {}; } catch (_) { return {}; }
  }
  function saveWarPayLedger(l) {
    try { GM_setValue(GMK.WAR_PAY_LEDGER, JSON.stringify(l)); } catch (_) {}
  }

  // ─── ACTIVITY TRACKER + REVIVES (v4.4) ─────────────────────────────────────
  // Activity costs ZERO extra API: it aggregates the members payload the
  // dashboard already fetches. Per member per UTC day we keep counts, not
  // samples — ~100 members × 90 days stays a few hundred KB at most.

  const ACTIVITY_RETENTION_D = 90;
  const ACTIVITY_SNAP_MIN_MS = 30 * 60e3;   // at most one write per 30 min

  function loadActivityLog() {
    try { return JSON.parse(GM_getValue(GMK.ACTIVITY_LOG, '{}')) || {}; } catch (_) { return {}; }
  }
  function saveActivityLog(log) {
    try { GM_setValue(GMK.ACTIVITY_LOG, JSON.stringify(log)); } catch (_) {}
  }

  /** UTC day key for a ms timestamp: "2026-07-14". */
  function utcDayKey(ms) { return new Date(ms).toISOString().slice(0, 10); }

  /**
   * Fold the current roster into the activity log. Throttled; prunes days past
   * retention and members gone past retention. `nowMs` injectable for tests.
   */
  function snapshotActivity(memberMap, nowMs = Date.now()) {
    const last = Number(GM_getValue(GMK.ACTIVITY_SNAP_AT, 0)) || 0;
    if (nowMs - last < ACTIVITY_SNAP_MIN_MS) return false;
    GM_setValue(GMK.ACTIVITY_SNAP_AT, nowMs);
    const log = loadActivityLog();
    const day = utcDayKey(nowMs);
    const nowS = Math.floor(nowMs / 1000);
    const seen = new Set();
    for (const [uid, m] of Object.entries(memberMap || {})) {
      seen.add(String(uid));
      const rec = log[uid] || (log[uid] = { n: m.name || ('#' + uid), d: {} });
      rec.n = m.name || rec.n;
      const d = rec.d[day] || (rec.d[day] = { o: 0, s: 0, la: 0, st: null });
      d.s++;
      const laTs = Number(m.last_action?.timestamp ?? 0) || 0;
      const laStatus = String(m.last_action?.status || '');
      if (laStatus === 'Online' || (laTs && nowS - laTs < 15 * 60)) d.o++;
      if (laTs > d.la) d.la = laTs;
      d.st = m.status?.state ?? d.st;
    }
    // Prune: old days everywhere; members not seen whose newest day fell off.
    const cutoff = utcDayKey(nowMs - ACTIVITY_RETENTION_D * 86400e3);
    for (const [uid, rec] of Object.entries(log)) {
      for (const k of Object.keys(rec.d)) if (k < cutoff) delete rec.d[k];
      if (!seen.has(uid) && Object.keys(rec.d).length === 0) delete log[uid];
    }
    saveActivityLog(log);
    return true;
  }

  function loadReviveLedger() {
    try { return JSON.parse(GM_getValue(GMK.REVIVE_LEDGER, '{}')) || {}; } catch (_) { return {}; }
  }
  function saveReviveLedger(l) {
    try { GM_setValue(GMK.REVIVE_LEDGER, JSON.stringify(l)); } catch (_) {}
  }

  function slimRevive(r) {
    return {
      i:  String(r?.id ?? ''),
      ts: Number(r?.timestamp ?? r?.timestamp_created ?? 0) || 0,
      ri: r?.reviver?.id != null ? String(r.reviver.id) : null,
      rn: r?.reviver?.name ?? null,
      rf: r?.reviver?.faction?.id != null ? String(r.reviver.faction.id) : (r?.reviver?.faction ?? null),
      ti: r?.target?.id != null ? String(r.target.id) : null,
      tn: r?.target?.name ?? null,
      res: String(r?.result ?? r?.success ?? ''),
      ch: Number(r?.chance ?? 0) || 0,
    };
  }

  /** Forward revive sync — same cursor-walk shape as syncAttacks. */
  async function syncRevives(apiKey) {
    const led = loadReviveLedger();
    let changed = 0;
    const merge = (data) => {
      let maxTs = Number(GM_getValue(GMK.REVIVE_CURSOR, 0)) || 0;
      let rows = 0;
      for (const r of tornList(data?.revives)) {
        rows++;
        const s = slimRevive(r);
        if (!s.i || !s.ts) continue;
        if (s.ts > maxTs) maxTs = s.ts;
        if (!led[s.i]) { led[s.i] = s; changed++; }
      }
      if (maxTs > 0) GM_setValue(GMK.REVIVE_CURSOR, maxTs);
      return rows;
    };
    try {
      const cursor = Number(GM_getValue(GMK.REVIVE_CURSOR, 0)) || 0;
      if (!cursor) {
        merge(await apiFetch('/faction/revives?limit=100&sort=DESC', apiKey));
      } else {
        for (let page = 0; page < 5; page++) {
          const from = Number(GM_getValue(GMK.REVIVE_CURSOR, 0)) || 0;
          const rows = merge(await apiFetch(`/faction/revives?limit=100&sort=ASC&from=${from}`, apiKey));
          if (rows < 100) break;
          if ((Number(GM_getValue(GMK.REVIVE_CURSOR, 0)) || 0) <= from) break;
        }
      }
      GM_setValue(GMK.REVIVE_STATUS, 'ok');
    } catch (e) {
      GM_setValue(GMK.REVIVE_STATUS, String((e && e.message) || e));
    }
    if (changed) saveReviveLedger(led);
    return changed;
  }

  // ─── ARMOURY LEDGER + LOADOUTS (v4.5) ──────────────────────────────────────
  // Loan history parses the armoryAction news feed (the API's armoury
  // selections are SNAPSHOTS — who-took-what only exists as news text).
  // Loadouts: the API never exposes another player's equipped gear, so this is
  // (a) your own gear scraped from YOUR items page, opt-in, plus (b) codes
  // members paste to each other — no backend, no pretending.

  function loadLoanLedger() {
    try { return JSON.parse(GM_getValue(GMK.LOAN_LEDGER, '{}')) || {}; } catch (_) { return {}; }
  }
  function saveLoanLedger(l) {
    try { GM_setValue(GMK.LOAN_LEDGER, JSON.stringify(l)); } catch (_) {}
  }

  /**
   * Best-effort parse of one armoryAction news entry. Torn's phrasing varies
   * ("X loaned 1x Ithaca 37 to Y", "X used one of the faction's Xanax items",
   * "X deposited 5x First Aid Kit", "X returned/retrieved/gave/took/filled…"),
   * so anything unrecognised keeps verb 'other' with the raw text — shown, not
   * dropped.
   */
  function parseArmoryNews(txt) {
    const links = [...String(txt).matchAll(/XID=(\d+)[^>]*>([^<]+)</gi)];
    const plain = String(txt).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    const out = {
      aid: links[0] ? links[0][1] : null, an: links[0] ? links[0][2] : null,
      oid: links[1] ? links[1][1] : null, on: links[1] ? links[1][2] : null,
      verb: 'other', qty: 1, item: null, raw: plain.slice(0, 140),
    };
    let m;
    if ((m = plain.match(/\b(loaned|returned|retrieved|gave|deposited|took|filled|used|opened)\b/i))) out.verb = m[1].toLowerCase();
    if ((m = plain.match(/(\d[\d,]*)\s*x\s+(.+?)(?:\s+(?:to|from)\s|\s*\.?\s*$)/i))) {
      out.qty = Number(m[1].replace(/,/g, '')) || 1;
      out.item = m[2].trim();
    } else if ((m = plain.match(/faction'?s\s+(.+?)\s+items?\b/i))) {
      out.item = m[1].trim();
    }
    return out;
  }

  /** Cursor-walked armoryAction news → loan ledger (same shape as the other syncs). */
  async function syncArmoryNews(apiKey) {
    const led = loadLoanLedger();
    let changed = 0;
    const merge = (data) => {
      let maxTs = Number(GM_getValue(GMK.LOAN_CURSOR, 0)) || 0;
      const raw = data?.news;
      const list = Array.isArray(raw) ? raw : Object.entries(raw || {}).map(([id, n]) => ({ id, ...(typeof n === 'object' ? n : { news: n }) }));
      for (const n of list) {
        const id = String(n.id ?? n.ID ?? '');
        const ts = Number(n.timestamp ?? n.ts ?? 0);
        if (ts > maxTs) maxTs = ts;
        if (!id || led[id]) continue;
        led[id] = { ts, ...parseArmoryNews(String(n.news ?? n.text ?? '')) };
        changed++;
      }
      if (maxTs > 0) GM_setValue(GMK.LOAN_CURSOR, maxTs);
      return list.length;
    };
    try {
      const cursor = Number(GM_getValue(GMK.LOAN_CURSOR, 0)) || 0;
      if (!cursor) {
        merge(await apiFetch('/faction/news?cat=armoryAction&striptags=false&limit=100&sort=DESC', apiKey));
      } else {
        for (let page = 0; page < 5; page++) {
          const from = Number(GM_getValue(GMK.LOAN_CURSOR, 0)) || 0;
          const rows = merge(await apiFetch(`/faction/news?cat=armoryAction&striptags=false&limit=100&sort=ASC&from=${from}`, apiKey));
          if (rows < 100) break;
          if ((Number(GM_getValue(GMK.LOAN_CURSOR, 0)) || 0) <= from) break;
        }
      }
      GM_setValue(GMK.LOAN_STATUS, 'ok');
    } catch (e) {
      GM_setValue(GMK.LOAN_STATUS, String((e && e.message) || e));
    }
    if (changed) saveLoanLedger(led);
    return changed;
  }

  // — Consumable usage analytics (v4.8). The raw armoury feed is one news line
  //   per pill/bottle, which buried the actual loan history in spam. These fold
  //   the 'used' events into per-item, per-member counts over rolling windows.

  function loadItemIdMap() {
    try { return JSON.parse(GM_getValue(GMK.ITEM_ID_MAP, '{}')) || {}; } catch (_) { return {}; }
  }

  /** Torn item image (same-origin on torn.com, so it always loads). */
  function itemImgUrl(id) { return `https://www.torn.com/images/items/${id}/small.png`; }

  let _itemMapFetching = false;
  /**
   * Resolve item names -> ids (for images) with ONE v1 items call, cached
   * permanently and re-attempted at most daily. News text only gives us the
   * item NAME ("Xanax", "Bottle of Beer"), but images need the id.
   * Returns true when the map was (re)built — callers should re-render.
   */
  async function ensureItemIdMap(apiKey, names) {
    const map = loadItemIdMap();
    if (!(names || []).some(n => n && map[String(n).toLowerCase()] == null)) return false;
    const last = Number(GM_getValue(GMK.ITEM_ID_MAP_AT, 0)) || 0;
    if (_itemMapFetching || Date.now() - last < 24 * 3600e3) return false;
    _itemMapFetching = true;
    GM_setValue(GMK.ITEM_ID_MAP_AT, Date.now());
    try {
      const data = await apiFetchV1('torn/?selections=items', apiKey);
      const out = {};
      for (const [id, it] of Object.entries(data?.items || {})) {
        if (it?.name) out[String(it.name).toLowerCase()] = Number(id);
      }
      if (!Object.keys(out).length) return false;
      GM_setValue(GMK.ITEM_ID_MAP, JSON.stringify(out));
      return true;
    } catch (_) {
      return false;
    } finally {
      _itemMapFetching = false;
    }
  }

  const USAGE_WINDOWS = [['d1', 86400], ['d7', 7 * 86400], ['d30', 30 * 86400]];

  /**
   * Fold 'used' armoury events into per-item, per-member counts across rolling
   * windows (24h / 7d / 30d / all-tracked). Items sorted hottest-first (30d),
   * each item's users sorted by all-time count. `nowS` injectable for tests.
   */
  function buildUsageStats(ledger, nowS = Math.floor(Date.now() / 1000)) {
    const items = {};
    for (const e of Object.values(ledger || {})) {
      if (!e || e.verb !== 'used' || !e.item) continue;
      const key = e.item.toLowerCase();
      const it = items[key] || (items[key] = { name: e.item, total: 0, d1: 0, d7: 0, d30: 0, last: 0, users: {} });
      const qty = Number(e.qty) || 1;
      const age = nowS - (e.ts || 0);
      const uKey = e.aid ? String(e.aid) : '?';
      const u = it.users[uKey] || (it.users[uKey] = { uid: e.aid ? String(e.aid) : null, name: e.an || null, d1: 0, d7: 0, d30: 0, all: 0, last: 0 });
      it.total += qty; u.all += qty;
      for (const [w, secs] of USAGE_WINDOWS) if (age <= secs) { it[w] += qty; u[w] += qty; }
      if (e.ts > it.last) it.last = e.ts;
      if (e.ts > u.last) u.last = e.ts;
      if (e.an) u.name = e.an;
    }
    return Object.values(items)
      .map(it => ({ ...it, users: Object.values(it.users).sort((a, b) => b.all - a.all) }))
      .sort((a, b) => b.d30 - a.d30 || b.total - a.total);
  }

  // — Per-member armoury profiles (v4.9): who holds which gear, in which slot,
  //   plus their consumable usage — the Armoury > Members pane's data model.

  const GEAR_SLOTS = {
    primary:   { key: 'primary',   letter: 'p', label: 'Primary' },
    secondary: { key: 'secondary', letter: 's', label: 'Secondary' },
    melee:     { key: 'melee',     letter: 'm', label: 'Melee' },
    body:      { key: 'body',      letter: 'v', label: 'Body' },
    helmet:    { key: 'helmet',    letter: 'h', label: 'Helmet' },
    gloves:    { key: 'gloves',    letter: 'g', label: 'Gloves' },
    boots:     { key: 'boots',     letter: 'b', label: 'Boots' },
    pants:     { key: 'pants',     letter: 'l', label: 'Legs' },
    item:      { key: 'item',      letter: '·', label: 'Item' },
  };

  /** Classify a gear-cache row into a loadout slot. Weapons carry their slot in
   *  the item TYPE (Primary/Secondary/Melee); armour isn't subdivided by the
   *  API, so its slot comes from name keywords — unknown names stay 'Body'. */
  function gearSlotOf(g) {
    const t = String(g?.type || '').toLowerCase();
    if (g?.cat === 'weapons') {
      if (t === 'secondary') return GEAR_SLOTS.secondary;
      if (t === 'melee') return GEAR_SLOTS.melee;
      return GEAR_SLOTS.primary;
    }
    if (g?.cat === 'armor') {
      const n = String(g?.name || '').toLowerCase();
      if (/helmet|hat\b|mask|hood/.test(n)) return GEAR_SLOTS.helmet;
      if (/glove|gauntlet/.test(n)) return GEAR_SLOTS.gloves;
      if (/boot|shoe/.test(n)) return GEAR_SLOTS.boots;
      if (/pants|trouser|\bleg/.test(n)) return GEAR_SLOTS.pants;
      return GEAR_SLOTS.body;   // vest / body armour / jacket / the rest
    }
    return GEAR_SLOTS.item;     // utilities: OC tools, materials, enhancers
  }

  /**
   * Fold gear-on-loan rows + usage stats into per-member armoury profiles:
   * weapons / armour / OC items held (each slot-classified), consumable usage
   * rows, and FLAGS for doubled-up slots (two Primaries or two Helmets means
   * one of them is idle faction property). Sorted flagged-first, then by how
   * much armoury kit the member is holding.
   */
  function buildMemberArmouryProfiles(gearItems, usage) {
    const members = {};
    const ensure = uid => members[uid] || (members[uid] = {
      uid: String(uid), name: null,
      weapons: [], armour: [], items: [],
      uses: [], use1: 0, use30: 0, useAll: 0, flags: [],
    });
    for (const g of gearItems || []) {
      if (!g?.uid) continue;
      const m = ensure(g.uid);
      const entry = { ...g, slot: gearSlotOf(g) };
      if (g.cat === 'weapons') m.weapons.push(entry);
      else if (g.cat === 'armor') m.armour.push(entry);
      else m.items.push(entry);
    }
    for (const it of usage || []) for (const u of it.users) {
      if (!u.uid) continue;
      const m = ensure(u.uid);
      if (u.name && !m.name) m.name = u.name;
      m.uses.push({ item: it.name, d1: u.d1, d7: u.d7, d30: u.d30, all: u.all, last: u.last });
      m.use1 += u.d1; m.use30 += u.d30; m.useAll += u.all;
    }
    for (const m of Object.values(members)) {
      m.uses.sort((a, b) => b.all - a.all);
      const counts = {};
      for (const e of [...m.weapons, ...m.armour]) counts[e.slot.label] = (counts[e.slot.label] || 0) + 1;
      m.flags = Object.entries(counts).filter(([, n]) => n > 1).map(([label, n]) => `${label} ×${n}`);
    }
    return Object.values(members).sort((a, b) =>
      (b.flags.length - a.flags.length)
      || ((b.weapons.length + b.armour.length + b.items.length) - (a.weapons.length + a.armour.length + a.items.length))
      || (b.use30 - a.use30));
  }

  // ─── MEMBER PROFILE ASSEMBLER (v5.2) ───────────────────────────────────────
  // One object describing everything the suite knows about one member, merged
  // from the six stores that each used to own a slice of it. No fetching here —
  // this is pure assembly over data already synced, so it's cheap enough to run
  // on every render and safe to unit-test.

  /** Slots as a flat array, tolerating BOTH shapes. Live crimes carry
   *  `user:{id}`; archived rows are slimmed to a bare `user_id`. Reading only
   *  one shape is exactly what gave every archived OC an empty crew in v5.0.1
   *  and made the Money tab disagree with itself. */
  function ocSlotList(oc) {
    const raw = Array.isArray(oc?.slots) ? oc.slots : Object.values(oc?.slots || {});
    return raw.filter(Boolean).map(s => ({
      uid: (s.user?.id ?? s.user_id) != null ? String(s.user?.id ?? s.user_id) : null,
      role: s.position_info?.label || s.position || '?',
      cpr: s.checkpoint_pass_rate ?? null,
    }));
  }

  /** Every completed OC this member ran — live window merged over the archive,
   *  live winning on id (payouts and outcomes land late). Newest first. */
  function memberOcRuns(uid, crimes) {
    const key = String(uid);
    const merged = {};
    for (const [id, oc] of Object.entries(loadOcArchive() || {})) merged[String(id)] = oc;
    for (const [id, oc] of Object.entries(crimes || {})) merged[String(oc?.id ?? id)] = oc;

    const runs = [];
    for (const oc of Object.values(merged)) {
      const outcome = normOcStatus(oc?.status);
      if (!outcome) continue;                       // still running — not history
      for (const slot of ocSlotList(oc)) {
        if (slot.uid !== key) continue;
        runs.push({
          ocId: String(oc.id ?? ''),
          ocName: oc.name || 'Unknown',
          difficulty: oc.difficulty ?? null,
          role: slot.role,
          weight: getWeight(oc.name || '', slot.role),
          cpr: slot.cpr,
          outcome,
          executedAt: oc.executed_at ?? null,
          respect: oc.rewards?.respect ?? null,
          money: oc.rewards?.money ?? null,
        });
      }
    }
    return runs.sort((a, b) => (b.executedAt || 0) - (a.executedAt || 0));
  }

  /**
   * Assemble the full profile.
   * @param uid  member id
   * @param ctx  { crimes, mInfo, memberById, memberMap } from renderDashboard —
   *             all optional; anything absent degrades to a `missing` entry
   *             rather than throwing or rendering a blank block.
   */
  function buildMemberProfile(uid, ctx = {}) {
    const key = String(uid);
    const missing = [];
    const safe = (label, fn, fallback) => {
      try { return fn(); } catch (_) { missing.push(label); return fallback; }
    };

    // ── Identity
    const info = (ctx.mInfo || {})[key] || null;
    const raw = (ctx.memberById || {})[key] || null;
    const name = info?.name || warMemberName(key) || ('#' + key);
    const runs = safe('oc history', () => memberOcRuns(key, ctx.crimes), []);

    let currentOc = null;
    for (const [ocId, oc] of Object.entries(ctx.crimes || {})) {
      if (normOcStatus(oc?.status)) continue;       // completed — not current
      const slot = ocSlotList(oc).find(s => s.uid === key);
      if (slot) { currentOc = { name: oc.name || ('OC #' + ocId), role: slot.role, cpr: slot.cpr }; break; }
    }

    const identity = {
      uid: key, name,
      isEx: !info,                                  // not on the live roster
      level: raw?.level ?? null,
      position: raw?.faction?.position ?? raw?.position ?? null,
      daysInFaction: raw?.days_in_faction ?? null,
      status: { state: info?.status ?? raw?.status?.state ?? null,
                until: raw?.status?.until ?? 0,
                desc: info?.description ?? raw?.status?.description ?? '' },
      lastAction: raw?.last_action?.timestamp ?? null,
      lastActionRel: raw?.last_action?.relative ?? null,
      currentOc,
      avatar: safe('avatar cache', () => avatarUrl(key), ''),
    };

    // ── OC performance
    const done = runs.filter(r => r.outcome !== 'expired');
    const success = runs.filter(r => r.outcome === 'successful').length;
    const failure = runs.filter(r => r.outcome === 'failure').length;
    const cprs = runs.map(r => r.cpr).filter(v => v != null);
    const byRole = {};
    for (const r of runs) {
      const b = byRole[r.role] || (byRole[r.role] = { role: r.role, runs: 0, success: 0, cprSum: 0, cprN: 0, weight: r.weight });
      b.runs++;
      if (r.outcome === 'successful') b.success++;
      if (r.cpr != null) { b.cprSum += r.cpr; b.cprN++; }
    }
    const roleRows = Object.values(byRole)
      .map(b => ({ ...b, avgCpr: b.cprN ? b.cprSum / b.cprN : null, rate: b.runs ? b.success / b.runs : 0 }))
      .sort((a, b) => b.runs - a.runs);
    const cleared = runs.filter(r => r.outcome === 'successful' && r.difficulty != null);
    const best = cleared.reduce((m, r) => (m && m.difficulty >= r.difficulty) ? m : r, null);
    // Trend: last 10 vs the 10 before. Needs 6+ in the older window or it's noise.
    const rate = arr => { const d = arr.filter(r => r.outcome !== 'expired'); return d.length ? d.filter(r => r.outcome === 'successful').length / d.length : null; };
    const recentRate = rate(runs.slice(0, 10));
    const priorRate = runs.length >= 16 ? rate(runs.slice(10, 20)) : null;

    const ocPerf = {
      runs,
      total: runs.length,
      success, failure,
      expired: runs.filter(r => r.outcome === 'expired').length,
      rate: done.length ? success / done.length : null,
      avgCpr: cprs.length ? cprs.reduce((a, b) => a + b, 0) / cprs.length : null,
      cprObserved: cprs.length > 0,                 // real runs, not a TornStats estimate
      roleRows,
      topRole: roleRows[0]?.role ?? null,
      bestCleared: best ? { difficulty: best.difficulty, name: best.ocName } : null,
      lastRunAt: runs[0]?.executedAt ?? null,
      spark: runs.slice(0, 10).map(r => r.outcome),
      trend: (recentRate != null && priorRate != null) ? recentRate - priorRate : null,
    };

    // ── Money: what this member was actually PAID (only OCs Torn marks paid,
    //    split by the recorded percentage — never the ambiguous gross).
    const money = safe('profit ledger', () => {
      const shareTable = loadShareByDiff();
      let earned = 0, ocsPaid = 0, owed = 0, ocsOwed = 0, respect = 0;
      for (const r of Object.values(loadProfitLedger() || {})) {
        const crew = Object.keys(r.participants || {});
        if (!crew.includes(key) || !(r.money > 0)) continue;
        const pct = r.payout?.percentage != null ? r.payout.percentage : shareForDifficulty(r.difficulty, shareTable);
        const each = (r.money * pct / 100) / crew.length;
        if (r.payout?.paid) { earned += each; ocsPaid++; respect += (r.respect || 0) / crew.length; }
        else { owed += each; ocsOwed++; }
      }
      return { earned, ocsPaid, owed, ocsOwed, respect };
    }, { earned: 0, ocsPaid: 0, owed: 0, ocsOwed: 0, respect: 0 });

    // ── War: observed from the attack ledger, plus revives.
    const war = safe('war ledger', () => {
      const led = loadAttackLedger() || {};
      let hits = 0, warHits = 0, losses = 0, defends = 0, respectGain = 0, ffSum = 0, ffN = 0;
      for (const s of Object.values(led)) {
        if (!s) continue;
        const res = String(s.res || '');
        if (s.dir === 'out' && s.a === key) {
          if (/^(lost|stalemate|escape|timeout|interrupted|assist)/i.test(res)) continue;
          hits++;
          if (s.rw || (s.m && s.m.war > 1)) warHits++;
          respectGain += s.rg || 0;
          if (s.m && s.m.ff > 0) { ffSum += s.m.ff; ffN++; }
        } else if (s.dir === 'in' && s.d === key) {
          if (/^(lost|stalemate|escape|timeout|interrupted)/i.test(res)) defends++;
          else losses++;
        }
      }
      let revives = 0, reviveOk = 0;
      for (const r of Object.values(loadReviveLedger() || {})) {
        if (r && r.ri === key) { revives++; if (/^(success|true|1)/i.test(String(r.res))) reviveOk++; }
      }
      return { hits, warHits, losses, defends, respect: respectGain,
               avgFf: ffN ? ffSum / ffN : null, revives, reviveOk };
    }, null);
    if (!war) missing.push('war ledger');

    // ── Armoury: reuse the existing profile builder rather than re-deriving.
    const armoury = safe('armoury', () => {
      const gear = loadGearCache();
      const profiles = buildMemberArmouryProfiles(gear?.items, buildUsageStats(loadLoanLedger()));
      return profiles.find(p => String(p.uid) === key) || null;
    }, null);

    // ── Activity: presence aggregates the tracker already keeps.
    const activity = safe('activity log', () => {
      const rec = (loadActivityLog() || {})[key];
      const la = identity.lastAction;
      return {
        days: rec?.d || {},
        idleSec: la ? Math.max(0, Math.floor(Date.now() / 1000) - la) : null,
      };
    }, { days: {}, idleSec: null });

    // ── One plain-English verdict. Deliberately says "not enough data" rather
    //    than inventing confidence from three runs.
    let verdict;
    if (!ocPerf.total) {
      verdict = 'No completed OCs on record yet — nothing to judge them on.';
    } else if (ocPerf.total < 5) {
      verdict = `Only ${ocPerf.total} OC${ocPerf.total === 1 ? '' : 's'} on record — too few to read much into.`;
    } else {
      const pct = Math.round((ocPerf.rate || 0) * 100);
      const band = pct >= 90 ? 'Strong' : pct >= 75 ? 'Solid' : pct >= 60 ? 'Patchy' : 'Struggling';
      const cpr = ocPerf.avgCpr != null ? `, ${ocPerf.avgCpr.toFixed(0)}% avg CPR` : '';
      const dir = ocPerf.trend == null ? ''
        : ocPerf.trend > 0.1 ? ' — improving lately'
        : ocPerf.trend < -0.1 ? ' — slipping lately' : '';
      verdict = `${band} — ${pct}% over ${ocPerf.total} OCs${cpr}${dir}.`;
    }

    return { uid: key, identity, ocPerf, money, war, armoury, activity, verdict, missing };
  }

  // — Loadout codes: compact base64 JSON members paste to each other.
  function encodeLoadout(lo) {
    const json = JSON.stringify({ v: 1, ...lo });
    return btoa(unescape(encodeURIComponent(json)));
  }
  function decodeLoadout(code) {
    try {
      const lo = JSON.parse(decodeURIComponent(escape(atob(String(code).trim()))));
      if (!lo || lo.v !== 1 || !Array.isArray(lo.items)) return null;
      return lo;
    } catch (_) { return null; }
  }
  function loadLoadoutStore() {
    try { return JSON.parse(GM_getValue(GMK.LOADOUT_STORE, '{}')) || {}; } catch (_) { return {}; }
  }
  function saveLoadoutStore(s) {
    try { GM_setValue(GMK.LOADOUT_STORE, JSON.stringify(s)); } catch (_) {}
  }

  /**
   * Faction combat gear currently ON LOAN, per member — the loadout signal the
   * API actually provides. Weapons and armour loans use the same row shape as
   * utilities ({ID, name, type, available, loaned_to}); one row per stock line,
   * loaned_to is a comma-separated holder id list.
   */
  function parseGearLoans(data, cat) {
    const out = [];
    const raw = data?.[cat] ?? [];
    for (const it of (Array.isArray(raw) ? raw : Object.values(raw || {}))) {
      if (!it || typeof it !== 'object') continue;
      const lt = it.loaned_to;
      if (lt === null || lt === undefined || lt === '' || lt === 0) continue;
      for (const uid of String(lt).split(',').map(s => s.trim()).filter(s => s && s !== '0')) {
        out.push({ id: String(it.ID ?? it.id ?? ''), name: it.name ?? null, type: it.type ?? null, cat, uid });
      }
    }
    return out;
  }

  async function syncArmouryGear(apiKey) {
    try {
      // Utilities ride along (server caches identical calls ~30s, so this
      // overlaps fetchAll's own utilities call for free) — the Members pane
      // needs OC items held per member in the same persistent store.
      const [weapons, armor, utils] = await Promise.all([
        apiFetch('/faction?selections=weapons', apiKey),
        apiFetch('/faction?selections=armor', apiKey),
        apiFetch('/faction?selections=utilities', apiKey),
      ]);
      const items = [...parseGearLoans(weapons, 'weapons'), ...parseGearLoans(armor, 'armor'),
                     ...parseGearLoans(utils, 'utilities')];
      // Some payload shapes omit the item name — resolve those ids once via the
      // torn items endpoint so the Loadouts pane never has to render "#123".
      const unnamed = [...new Set(items.filter(i => i.id && !i.name).map(i => i.id))];
      if (unnamed.length) {
        try {
          const named = await apiFetchV1(`torn/${unnamed.join(',')}?selections=items`, apiKey);
          for (const it of items) {
            const hit = named?.items?.[it.id];
            if (!it.name && hit?.name) it.name = hit.name;
          }
        } catch (_) { /* cosmetic — the ids still render */ }
      }
      GM_setValue(GMK.GEAR_CACHE, JSON.stringify({ at: Math.floor(Date.now() / 1000), items }));
      GM_setValue(GMK.GEAR_STATUS, 'ok');
    } catch (e) {
      GM_setValue(GMK.GEAR_STATUS, String((e && e.message) || e));
    }
  }
  function loadGearCache() {
    try { return JSON.parse(GM_getValue(GMK.GEAR_CACHE, 'null')); } catch (_) { return null; }
  }

  /** Read YOUR equipped items off the items page DOM. Anchors on Torn's own
   *  data-attributes (fixture-verified), never on hashed class names. */
  function scanEquippedItems(doc = document) {
    return [...doc.querySelectorAll('li[data-equipped="true"]')].map(li => ({
      id: li.getAttribute('data-item') || null,
      cat: li.getAttribute('data-category') || null,
      name: (li.querySelector('.name-wrap .name, .name, .title')?.textContent || '').replace(/\s+/g, ' ').trim() || null,
    })).filter(it => it.id);
  }

  // ─── LIVE WAR POLLING (v4.2) ───────────────────────────────────────────────
  // Chain watcher + War Room enemy roster. Both are visibility-gated: they only
  // spend API budget while their pane is actually on screen (or a chain is
  // already live and worth watching). Torn's server caches identical calls for
  // ~30s, so neither poller ever fires faster than that.

  /** Last live-chain fetch: {at(ms), current, max, timeout, cooldown, start, end}. */
  let _chainLive = null;

  function chainIsLive() {
    if (!_chainLive) return false;
    const elapsed = (Date.now() - _chainLive.at) / 1000;
    return _chainLive.current > 0 && (_chainLive.timeout - elapsed) > 0;
  }

  async function pollLiveChain(apiKey, force = false) {
    const watchVisible = !!document.querySelector('#ocm-pane-war.active #ocm-sub-watch.active');
    if (!force && !watchVisible && !chainIsLive()) return false;
    try {
      const data = await apiFetch('/faction/chain', apiKey);
      const c = data?.chain ?? data ?? {};
      _chainLive = {
        at: Date.now(),
        current:  Number(c.current ?? 0) || 0,
        max:      Number(c.max ?? 0) || 0,
        timeout:  Number(c.timeout ?? 0) || 0,
        cooldown: Number(c.cooldown ?? 0) || 0,
        start:    Number(c.start ?? 0) || 0,
        end:      Number(c.end ?? 0) || 0,
      };
      GM_setValue(GMK.CHAIN_LIVE_STATUS, 'ok');
      renderChainWatchSection();
      return true;
    } catch (e) {
      GM_setValue(GMK.CHAIN_LIVE_STATUS, String((e && e.message) || e));
      renderChainWatchSection();
      return false;
    }
  }

  function loadEnemyCache() {
    try { return JSON.parse(GM_getValue(GMK.ENEMY_CACHE, 'null')); } catch (_) { return null; }
  }
  function loadSpyCache() {
    try { return JSON.parse(GM_getValue(GMK.SPY_CACHE, '{}')) || {}; } catch (_) { return {}; }
  }
  function saveSpyCache(c) {
    try { GM_setValue(GMK.SPY_CACHE, JSON.stringify(c)); } catch (_) {}
  }

  /** The active ranked war and its opponent, or null. */
  function activeWarOpponent() {
    const myFid = String(GM_getValue(GMK.MY_FACTION_ID, '') || '');
    const now = Math.floor(Date.now() / 1000);
    const war = Object.values(loadWarArchive()).find(w => (w.start || 0) <= now && (!w.end || w.end > now)) || null;
    if (!war) return null;
    const opp = (war.factions || []).find(f => String(f.id) !== myFid) || null;
    return opp ? { war, opp } : null;
  }

  let _enemyPollInFlight = false;
  async function pollEnemyRoster(apiKey, force = false) {
    if (_enemyPollInFlight) return false;
    const roomVisible = !!document.querySelector('#ocm-pane-war.active #ocm-sub-warroom.active');
    if (!force && !roomVisible) return false;
    const target = activeWarOpponent();
    if (!target) return false;
    _enemyPollInFlight = true;
    try {
      // v2 path first; fall back to the selections form for older gateways.
      let data;
      try { data = await apiFetch(`/faction/${target.opp.id}/members`, apiKey); }
      catch (_) { data = await apiFetch(`/faction/${target.opp.id}?selections=members`, apiKey); }
      const members = tornList(data?.members).map(m => ({
        id: String(m.id ?? ''),
        name: m.name ?? null,
        level: Number(m.level ?? 0) || 0,
        la: { ts: Number(m.last_action?.timestamp ?? 0) || 0, status: m.last_action?.status ?? null },
        st: { state: m.status?.state ?? null, until: Number(m.status?.until ?? 0) || 0, desc: m.status?.description ?? null },
      })).filter(m => m.id);
      GM_setValue(GMK.ENEMY_CACHE, JSON.stringify({ at: Date.now(), fid: String(target.opp.id), name: target.opp.name, members }));
      GM_setValue(GMK.ENEMY_STATUS, 'ok');
      renderWarRoomSection();
      // Stat estimates load lazily behind the roster — never block on them.
      fetchSpyStats(members.map(m => m.id)).then(fresh => { if (fresh) renderWarRoomSection(); }).catch(() => {});
      return true;
    } catch (e) {
      GM_setValue(GMK.ENEMY_STATUS, String((e && e.message) || e));
      renderWarRoomSection();
      return false;
    } finally {
      _enemyPollInFlight = false;
    }
  }

  /**
   * FFScouter batch stat estimates (fair fight + battle-stat estimate) for the
   * given player ids, 24h-cached. One HTTP call per refresh for the whole
   * roster — this is what FFScouter's get-stats endpoint is designed for.
   * Returns true when anything new was fetched. No FF key ⇒ quiet no-op.
   */
  let _spyFetchInFlight = false;
  async function fetchSpyStats(ids) {
    if (_spyFetchInFlight) return false;
    const ffKey = GM_getValue(GMK.FF_KEY, '');
    if (!ffKey || !ids?.length) return false;
    const cache = loadSpyCache();
    const now = Date.now();
    const stale = ids.filter(id => !cache[id] || now - cache[id].ts > 24 * 3600e3);
    if (!stale.length) return false;
    _spyFetchInFlight = true;
    try {
      const res = await gmFetch(`https://ffscouter.com/api/v1/get-stats?key=${encodeURIComponent(ffKey)}&targets=${stale.join(',')}`);
      const rows = Array.isArray(res) ? res : (Array.isArray(res?.results) ? res.results : []);
      let got = 0;
      for (const r of rows) {
        const uid = String(r.player_id ?? r.playerId ?? r.id ?? '');
        if (!uid) continue;
        cache[uid] = {
          ts: now, src: 'ffs',
          ff: (r.fair_fight ?? r.ff ?? null),
          bs: (r.bs_estimate_human ?? r.bs_estimate ?? r.bs ?? null),
          upd: (r.last_updated ?? null),
        };
        got++;
      }
      if (got) saveSpyCache(cache);
      GM_setValue(GMK.SPY_STATUS, 'ok');
      return got > 0;
    } catch (e) {
      GM_setValue(GMK.SPY_STATUS, String((e && e.message) || e));
      return false;
    } finally {
      _spyFetchInFlight = false;
    }
  }

  /** 30s poll loop for the live panes. Each tick is a visibility-gated no-op
   *  unless the relevant pane is open (or a chain is live). */
  let _liveWarPoll = null;
  function startLiveWarPolling(apiKey) {
    clearInterval(_liveWarPoll);
    _liveWarPoll = setInterval(() => {
      pollLiveChain(apiKey).catch(() => {});
      pollEnemyRoster(apiKey).catch(() => {});
    }, 30e3);
  }

  // ─── PERSISTENT CPR ARCHIVE ────────────────────────────────────────────────
  // Like the profit ledger, but for per-member CPR history. The API only returns
  // the last ~100 completed OCs, so member history is capped. This archive records
  // each member's CPR per (member, OC, role) as OCs are seen — keeping ONLY the
  // most recent entry for each combination. A newer run of the same OC+role for a
  // member replaces the older one, so the archive grows to cover every OC type a
  // member has run without bloating with duplicate runs of the same scenario.
  const CPR_ARCHIVE_KEY = GMK.CPR_ARCHIVE;

  /** Load archive: { [uid]: { name, slots: { [ocKey|role]: {ocName, role, difficulty, cpr, outcome, weight, respect, executedAt} } } } */
  function loadCprArchive() {
    try { return JSON.parse(GM_getValue(CPR_ARCHIVE_KEY, '{}')) || {}; }
    catch (_) { return {}; }
  }
  function saveCprArchive(arc) {
    try { GM_setValue(CPR_ARCHIVE_KEY, JSON.stringify(arc)); } catch (_) {}
    _cprArcCache = arc;   // keep the read cache in step
  }

  /** Cached archive accessor — tsGetCpr is called once per slot, so re-parsing the
   *  stored JSON on every call would be needless work. */
  let _cprArcCache = null;
  function cprArchive() {
    if (!_cprArcCache) _cprArcCache = loadCprArchive();
    return _cprArcCache;
  }

  /**
   * Record completed OCs into the CPR archive. For each member+OC+role we keep only
   * the most recent run (by executed_at). Returns the updated archive.
   * @param crimes     faction crimes object
   * @param mInfo      map uid->{name} for current members (for display names)
   * @param exNames    map uid->name for ex-members
   * @param getW       getWeight(ocName, role) function
   * @param normStat   status normaliser returning 'successful'|'failure'|'expired'|null
   */
  function recordCprHistory(crimes, mInfo = {}, exNames = {}, getW = () => null, normStat = () => null) {
    const arc = loadCprArchive();
    let changed = false;
    for (const oc of Object.values(crimes || {})) {
      if (!oc || typeof oc !== 'object') continue;
      const outcome = normStat(oc.status);
      if (outcome === null) continue; // only completed OCs
      const ocSlots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
      const execAt  = oc.executed_at ?? null;
      for (const slot of ocSlots) {
        const uid = slot?.user?.id ? String(slot.user.id) : null;
        if (!uid) continue;
        const role   = slot.position_info?.label || slot.position || '?';
        // Key by OC name + role so re-runs of the same scenario+role collapse to one
        const key    = `${(oc.name || 'Unknown').toLowerCase()}|${role.toLowerCase()}`;
        if (!arc[uid]) arc[uid] = { name: mInfo[uid]?.name || exNames[uid] || `#${uid}`, slots: {} };
        else if (mInfo[uid]?.name) arc[uid].name = mInfo[uid].name; // refresh name if known
        const existing = arc[uid].slots[key];
        // Keep only the most-recent run for this member+OC+role
        if (existing && (existing.executedAt || 0) >= (execAt || 0)) continue;
        arc[uid].slots[key] = {
          ocName:     oc.name || 'Unknown',
          role,
          difficulty: oc.difficulty ?? '?',
          cpr:        slot.checkpoint_pass_rate ?? null,
          outcome,
          weight:     getW(oc.name || '', role),
          respect:    oc.rewards?.respect ?? null,
          executedAt: execAt,
        };
        changed = true;
      }
    }
    if (changed) saveCprArchive(arc);
    return arc;
  }

  /**
   * Backfill the CPR archive from the full TornStats faction CPR table. Torn's own
   * API can't return another member's OC history, but TornStats exposes every
   * member's current CPR per crime+role via /faction/cpr. This writes those values
   * into the archive ONLY where we don't already have a live faction-OC entry (which
   * is more authoritative — it's an actual run with date + outcome). TornStats-sourced
   * rows are flagged source:'ts' and carry no executedAt, so any later real OC run
   * for that member+OC+role will replace them.
   * @param tsData   tsCprData: { uid: { crime: { role: cpr } } }
   * @param mInfo    uid -> {name} for display names
   * @param exNames  uid -> name for ex-members
   * @param getW     getWeight(ocName, role)
   * @returns {filled:number, members:number}
   */
  function backfillCprFromTornStats(tsData, mInfo = {}, exNames = {}, getW = () => null) {
    const arc = loadCprArchive();
    let filled = 0;
    const membersTouched = new Set();
    for (const [uid, crimes] of Object.entries(tsData || {})) {
      if (!crimes || typeof crimes !== 'object') continue;
      for (const [crime, roles] of Object.entries(crimes)) {
        if (!roles || typeof roles !== 'object') continue;
        for (const [role, cpr] of Object.entries(roles)) {
          if (cpr == null) continue;
          const key = `${crime.toLowerCase()}|${role.toLowerCase()}`;
          if (!arc[uid]) arc[uid] = { name: mInfo[uid]?.name || exNames[uid] || `#${uid}`, slots: {} };
          else if (mInfo[uid]?.name) arc[uid].name = mInfo[uid].name;
          const existing = arc[uid].slots[key];
          // Don't overwrite a real faction-OC run (has an executedAt). Only fill gaps,
          // or refresh an older TornStats-sourced value with the latest TS number.
          if (existing && existing.executedAt) continue;
          arc[uid].slots[key] = {
            ocName:     crime,
            role,
            difficulty: existing?.difficulty ?? '?',
            cpr,
            outcome:    null,        // TS gives a CPR, not a run outcome
            weight:     getW(crime, role),
            respect:    null,
            executedAt: null,        // no date — it's a current snapshot, not a dated run
            source:     'ts',        // flag: came from TornStats backfill
          };
          filled++;
          membersTouched.add(uid);
        }
      }
    }
    if (filled > 0) saveCprArchive(arc);
    return { filled, members: membersTouched.size };
  }

  let CPR_WARN        = Number(GM_getValue(GMK.CFG_CPR_WARN,    70));
  let CPR_CRIT        = Number(GM_getValue(GMK.CFG_CPR_CRIT,    60));
  // Above this a member is OVERQUALIFIED for the slot (0 = off). Leaders set it
  // and push it to members via the faction settings code (v5.1.2).
  let CPR_MAX         = Number(GM_getValue(GMK.CFG_CPR_MAX,      0));

  /** Faction settings code (v5.1.2): leaders push CPR standards to members —
   *  same no-backend pattern as loadout codes (compact base64 JSON pasted in
   *  Config). Carries the warn/crit thresholds and the max-CPR cap. */
  function encodeFactionCfg() {
    return 'OCS1.' + btoa(JSON.stringify({ v: 1, warn: CPR_WARN, crit: CPR_CRIT, max: CPR_MAX }));
  }
  function decodeFactionCfg(code) {
    try {
      const raw = String(code || '').trim().replace(/^OCS1\./, '');
      const c = JSON.parse(atob(raw));
      if (!c || c.v !== 1) return null;
      const clamp = (v, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : d; };
      return { warn: clamp(c.warn, 70), crit: clamp(c.crit, 60), max: clamp(c.max, 0) };
    } catch (_) { return null; }
  }
  let WEIGHT_HIGH     = Number(GM_getValue(GMK.CFG_WEIGHT_HIGH, 25));
  let WEIGHT_MID      = Number(GM_getValue(GMK.CFG_WEIGHT_MID,  15));
  let REFRESH_S       = Number(GM_getValue(GMK.CFG_REFRESH,     60));
  // Minimum number of recruiting OCs per difficulty before a warning is shown
  let MIN_PER_DIFF    = Number(GM_getValue(GMK.CFG_MIN_PER_DIFF, 2));

  let tsCprData = {};
  const TS_CACHE_TTL = 86400000; // 24 hours in ms
  // Cooldown after a failed TornStats fetch so we don't hammer the API
  // when it returns errors (rate limit, auth fail, network blip, etc.)
  const TS_FAIL_COOLDOWN = 10 * 60 * 1000; // 10 minutes
  // In-flight guard so concurrent loadData() calls don't double-fire fetches
  let _tsFetchInFlight = false;
  let _tsLastFailAt    = 0;

  // Load cached TS CPR data immediately so it's available on first render
  try {
    const cached = JSON.parse(GM_getValue(GMK.TS_CPR_CACHE, '{}'));
    if (cached.ts && (Date.now() - cached.ts < TS_CACHE_TTL) && cached.data) {
      tsCprData = cached.data;
    }
  } catch(_) {}

  function saveTsCprCache(data) {
    tsCprData = data;
    GM_setValue(GMK.TS_CPR_CACHE, JSON.stringify({ ts: Date.now(), data }));
  }

  function isTsCprCacheFresh() {
    try {
      const cached = JSON.parse(GM_getValue(GMK.TS_CPR_CACHE, '{}'));
      return cached.ts && (Date.now() - cached.ts < TS_CACHE_TTL);
    } catch(_) { return false; }
  }

  // Reference to GM.xmlHttpRequest — the @grant GM.xmlHttpRequest makes this
  // available via the GM object even when GM_xmlHttpRequest is not directly accessible.
  const _gmXhrFn = (typeof GM_xmlHttpRequest === 'function' ? GM_xmlHttpRequest : null)
                || (typeof GM !== 'undefined' && typeof GM.xmlHttpRequest === 'function'
                    ? GM.xmlHttpRequest.bind(GM) : null);

  /** Promise wrapper around GM_xmlHttpRequest.
   *
   *  Used for EVERY cross-origin GET, Torn API included. api.torn.com is a
   *  different origin from www.torn.com, so plain fetch() is a CORS request and
   *  dies the moment Torn stops sending Access-Control-Allow-Origin (which is
   *  exactly what happened). GM_xmlHttpRequest is not bound by CORS, and the
   *  script already declares @connect api.torn.com, so this is the correct
   *  transport — it's also what every other Torn userscript uses. */
  function gmFetch(url) {
    return new Promise((resolve, reject) => {
      if (!_gmXhrFn) { reject(new Error('GM_xmlHttpRequest not available')); return; }
      _gmXhrFn({
        method: 'GET', url,
        onload(r) {
          if (r.status < 200 || r.status >= 300) { reject(new Error(`HTTP ${r.status}`)); return; }
          try { resolve(JSON.parse(r.responseText)); }
          catch (e) { reject(e); }
        },
        onerror() { reject(new Error('Network error')); },
      });
    });
  }

  /**
   * GET a Torn API URL and return parsed JSON.
   * Prefers GM_xmlHttpRequest (no CORS); falls back to fetch() if the userscript
   * manager doesn't expose it. Throws on HTTP errors and on Torn's own error
   * payloads (which arrive with HTTP 200).
   */
  async function tornApiGet(url) {
    let data;
    if (_gmXhrFn) {
      data = await gmFetch(url);
    } else {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    }
    if (data && data.error) throw new Error(`API error ${data.error.code}: ${data.error.error}`);
    return data;
  }

  /** Persist all config values and update local variables. */
  function saveConfig(warn, crit, wHigh, wMid, refresh, minPerDiff) {
    CPR_WARN     = warn;
    CPR_CRIT     = crit;
    WEIGHT_HIGH  = wHigh;
    WEIGHT_MID   = wMid;
    REFRESH_S    = refresh;
    MIN_PER_DIFF = minPerDiff;
    GM_setValue(GMK.CFG_CPR_WARN,      warn);
    GM_setValue(GMK.CFG_CPR_CRIT,      crit);
    GM_setValue(GMK.CFG_WEIGHT_HIGH,   wHigh);
    GM_setValue(GMK.CFG_WEIGHT_MID,    wMid);
    GM_setValue(GMK.CFG_REFRESH,       refresh);
    GM_setValue(GMK.CFG_MIN_PER_DIFF,  minPerDiff);
  }

  // ─── ROLE WEIGHTS ────────────────────────────────────────────────────────────
  let roleWeights = {};

  const FALLBACK_WEIGHTS = {
    // Tier 1 / Low difficulty
    "no reserve":              { "car thief": 33, "techie": 33, "engineer": 33 },
    "cash me if you can":      { "thief #1": 54, "thief 1": 54, "thief #2": 28, "thief 2": 28, "lookout": 18, "thief": 41 },
    "pet project":             { "kidnapper": 40, "muscle": 35, "picklock": 25 },
    "best of the lot":         { "car thief": 35, "muscle": 30, "picklock": 20, "imitator": 15 },
    // Tier 2 / Mid difficulty
    "smoke and wing mirrors":  { "car thief": 32, "imitator": 28, "hustler": 20, "hustler #1": 20, "hustler #2": 20 },
    "plucking the lotus petal":{ "muscle": 48, "robber #1": 14, "robber #2": 24, "hustler": 14, "robber": 19 },
    "guardian ángels":         { "muscle": 34, "lookout": 33, "engineer": 33, "enforcer": 33, "hustler": 33 },
    "snow blind":              { "hustler": 48, "imitator": 36, "muscle": 8, "muscle #1": 8, "muscle #2": 8 },
    "leave no trace":          { "techie": 34, "negotiator": 33, "imitator": 33 },
    "market forces":           { "enforcer": 28, "negotiator": 24, "lookout": 20, "arsonist": 15, "muscle": 13 },
    "sneaky git grab":         { "hacker": 30, "techie": 28, "picklock": 22, "pickpocket": 22, "lookout": 20, "imitator": 20 },
    "gaslight the way":        { "imitator": 22, "looter": 18, "imitator #1": 22, "imitator #2": 22, "imitator #3": 22, "looter #1": 18, "looter #2": 18, "looter #3": 18 },
    "mob mentality":           { "looter 1": 34, "looter #1": 34, "looter 2": 26, "looter #2": 26, "looter 4": 23, "looter #4": 23, "looter 3": 18, "looter #3": 18, "looter": 25 },
    "counter offer":           { "hacker": 30, "picklock": 22, "engineer": 20, "looter": 15, "robber": 13 },
    "honey trap":              { "muscle #2": 42, "muscle #1": 31, "enforcer": 27, "muscle": 37 },
    "bidding war":             { "robber 3": 28, "robber #3": 28, "robber 2": 21, "robber #2": 21, "driver": 18, "bomber 2": 16, "bomber #2": 16, "bomber 1": 9, "bomber #1": 9, "robber 1": 7, "robber #1": 7, "robber": 19, "bomber": 13 },
    "stage fright":            { "sniper": 46, "enforcer": 16, "muscle #1": 12, "muscle 1": 12, "muscle #3": 9, "muscle 3": 9, "muscle #2": 3, "muscle 2": 3, "lookout": 6, "muscle": 8 },
    // Tier 3 / Higher difficulty
    "blast from the past":     { "muscle": 34, "engineer": 24, "hacker": 12, "bomber": 16, "picklock 1": 11, "picklock 2": 3, "picklock": 11 },
    "stacking the deck":       { "imitator": 48, "hacker": 26, "cat burglar": 23, "driver": 3 },
    "break the bank":          { "muscle 3": 32, "thief 2": 29, "muscle 1": 14, "robber": 13, "muscle 2": 10, "thief 1": 3, "muscle": 18, "thief": 16 },
    "clinical precision":      { "imitator": 43, "cleaner": 22, "cat burglar": 19, "assassin": 16 },
    // Tier 4 / High difficulty
    "crane reaction":          { "sniper": 41, "lookout": 17, "bomber": 16, "muscle 1": 10, "muscle 2": 8, "engineer": 8, "muscle": 9 },
    "manifest cruelty":        { "reviver": 46, "interrogator": 24, "hacker": 16, "cat burglar": 14 },
    // Tier 5 / Omega
    "ace in the hole":         { "hacker": 28, "muscle 2": 25, "imitator": 21, "muscle 1": 18, "driver": 8, "muscle": 22 },
    "gone fission":            { "hijacker": 25, "imitator": 25, "bomber": 18, "pickpocket": 17, "engineer": 15 },
  };

  /** Load fallback weights immediately then overlay with live data from tornprobability.com. */
  function fetchRoleWeights() {
    const normKey = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+v\d+$/i, '');

    // Pre-load fallbacks so weights are always available even if the live fetch fails
    roleWeights = {};
    for (const [ocName, roles] of Object.entries(FALLBACK_WEIGHTS)) {
      roleWeights[normKey(ocName)] = Object.fromEntries(
        Object.entries(roles).map(([r, w]) => [r.toLowerCase().trim(), w])
      );
    }

    const processResponse = text => {
      try {
        const data = JSON.parse(text);
        // Merge live data over fallbacks — never wipe what we already have
        for (const [ocName, roles] of Object.entries(data)) {
          roleWeights[normKey(ocName)] = Object.fromEntries(
            Object.entries(roles || {}).map(([r, w]) => [r.toLowerCase().trim(), w])
          );
        }
      } catch (_) {}
    };

    const url = 'https://tornprobability.com:3000/api/GetRoleWeights';

    if (typeof GM_xmlHttpRequest !== 'undefined') {
      GM_xmlHttpRequest({ method: 'GET', url, onload: r => processResponse(r.responseText), onerror: () => {} });
    } else if (typeof GM !== 'undefined' && GM.xmlHttpRequest) {
      GM.xmlHttpRequest({ method: 'GET', url, onload: r => processResponse(r.responseText), onerror: () => {} });
    }
  }

  /** Look up the weight for a given role in a given OC. Returns null if not found. */
  /** Test/debug hook: seed role weights directly (normally fetched from tornprobability). */
  function setRoleWeights(w) { roleWeights = w || {}; }
  if (typeof globalThis !== 'undefined') globalThis.__ocmSetWeights = setRoleWeights;

  function getWeight(ocName, roleName) {
    const ocKey   = (ocName   || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+v\d+$/i, '');
    const roleKey = (roleName || '').toLowerCase().trim();
    const oc      = roleWeights[ocKey];
    if (oc && oc[roleKey] != null) return oc[roleKey];
    // Last resort — check FALLBACK_WEIGHTS directly in case live API used different key formatting
    const fb = FALLBACK_WEIGHTS[ocKey];
    if (fb && fb[roleKey] != null) return fb[roleKey];
    return null;
  }

  // ─── COUNTRY → FLAG EMOJI MAP ─────────────────────────────────────────────
  // Used by statusIcon() to convert Torn travel destination strings to emoji flags.
  // Torn description strings look like "Traveling to Japan" or "Returning from Mexico".
  // We scan the description for any of these country names (case-insensitive).
  const COUNTRY_FLAGS = {
    'argentina': '🇦🇷', 'canada': '🇨🇦', 'cayman': '🇰🇾', 'china': '🇨🇳',
    'hawaii': '🇺🇸',    'japan': '🇯🇵',   'mexico': '🇲🇽',  'south africa': '🇿🇦',
    'switzerland': '🇨🇭','uae': '🇦🇪',    'united arab': '🇦🇪', 'uk': '🇬🇧',
    'united kingdom': '🇬🇧', 'usa': '🇺🇸', 'united states': '🇺🇸',
  };

  /**
   * Returns the emoji flag for a country found in a Torn travel description,
   * or 🌍 if no known country is matched.
   */
  function flagFromDescription(description) {
    const lower = (description || '').toLowerCase();
    for (const [country, flag] of Object.entries(COUNTRY_FLAGS)) {
      if (lower.includes(country)) return flag;
    }
    return '🌍';
  }

  /** Title-case a country name pulled out of a description. */
  function prettyCountry(description) {
    const lower = (description || '').toLowerCase();
    for (const country of Object.keys(COUNTRY_FLAGS)) {
      if (lower.includes(country)) {
        return country.replace(/\b\w/g, c => c.toUpperCase());
      }
    }
    return null;
  }

  /**
   * Parse a Torn travel/abroad description into { dir, country, flag, label }.
   *   dir: 'out' (flying to a country) | 'back' (returning to Torn) | 'abroad' (landed)
   * Torn strings: "Traveling to Japan", "Returning to Torn from Japan",
   *               "In Japan", "Flying to Mexico", etc.
   */
  function travelInfo(status, description) {
    const s     = (status || '').toLowerCase();
    const lower = (description || '').toLowerCase();
    const flag  = flagFromDescription(description);
    const country = prettyCountry(description);
    if (s === 'abroad') {
      return { dir: 'abroad', country, flag, label: country ? `${flag} In ${country}` : `${flag} Abroad` };
    }
    // traveling — compact labels: arrow direction tells the story; country name kept short
    const returning = lower.includes('returning') || lower.includes('back to torn') || lower.includes('to torn');
    if (returning) {
      return { dir: 'back', country, flag, label: country ? `${flag}→🏠 From ${country}` : '✈→🏠 Returning' };
    }
    return { dir: 'out', country, flag, label: country ? `🏠→${flag} To ${country}` : '🏠→✈ Traveling' };
  }

  // ─── THEME SYSTEM (opt-in) ─────────────────────────────────────────────────
  // The dashboard's CSS uses hardcoded colours for layout-critical rules; only the
  // *semantic* colours (CPR good/warn/crit, links, key text/bg) are themeable via
  // CSS variables. The "default" theme reproduces the exact current look, so the
  // dashboard is visually identical unless the user opts into another theme.
  //
  // Accessibility themes remap the CPR good/warn/crit trio (and links) to palettes
  // that stay distinguishable under the common colourblindness types, and add
  // ✓/⚠/✗ shape prefixes so meaning is never carried by colour alone.
  const THEMES = {
    default: {
      label: 'Default (current look)',
      '--ocm-cpr-good':  '#7abf7a',
      '--ocm-cpr-warn':  '#bf9f5a',
      '--ocm-cpr-crit':  '#bf7a7a',
      '--ocm-link':      '#7a9acc',
      '--ocm-text':      '#e0e0e0',
      '--ocm-text-card': '#cccccc',
      '--ocm-text-dim':   '#aabbcc',
      '--ocm-text-muted': '#8a8a99',
      '--ocm-text-faint': '#848494',
      '--ocm-bg':         '#181818',
      '--ocm-bg-card':    '#1e1e1e',
      '--ocm-bg-hover':   '#232323',
      '--ocm-border':     '#333333',
      '--ocm-border-soft':'#2e2e2e',
      '--ocm-shape-good': '""',
      '--ocm-shape-warn': '""',
      '--ocm-shape-crit': '""',
    },
    // The v6 "Central Command" palette, applied to the PROVEN v5 shell. Same
    // renderers, same data — only the colours change. Every text tier checked
    // against --ocm-bg-card (#171d28): faint #818d9f lands ≈5.0:1, so even the
    // lowest informational tier clears AA (the bar --ocm-text-faint has failed
    // twice before).
    frostbite: {
      label: 'Frostbite (v6 look)',
      '--ocm-cpr-good':  '#3fb950',
      '--ocm-cpr-warn':  '#d4a017',
      '--ocm-cpr-crit':  '#e05252',
      '--ocm-link':      '#4da3f5',
      '--ocm-text':      '#e8eef7',
      '--ocm-text-card': '#c2cbd8',
      '--ocm-text-dim':   '#a0acbf',
      '--ocm-text-muted': '#8996a8',
      '--ocm-text-faint': '#818d9f',
      '--ocm-bg':         '#121821',
      '--ocm-bg-card':    '#171d28',
      '--ocm-bg-hover':   '#1b222e',
      '--ocm-border':     '#222b39',
      '--ocm-border-soft':'#1b2330',
      '--ocm-shape-good': '""',
      '--ocm-shape-warn': '""',
      '--ocm-shape-crit': '""',
    },
    highcontrast: {
      label: 'High Contrast',
      '--ocm-cpr-good':  '#00ff88',
      '--ocm-cpr-warn':  '#ffdd00',
      '--ocm-cpr-crit':  '#ff5555',
      '--ocm-link':      '#66bbff',
      '--ocm-text':      '#ffffff',
      '--ocm-text-card': '#f0f0f0',
      '--ocm-text-dim':   '#dddddd',
      '--ocm-text-muted': '#bbbbbb',
      '--ocm-text-faint': '#999999',
      '--ocm-bg':         '#000000',
      '--ocm-bg-card':    '#111111',
      '--ocm-bg-hover':   '#222222',
      '--ocm-border':     '#555555',
      '--ocm-border-soft':'#444444',
      '--ocm-shape-good': '""',
      '--ocm-shape-warn': '""',
      '--ocm-shape-crit': '""',
    },
    // Red/green colourblindness (most common) — green→blue, red→orange, plus shapes
    deuteranopia: {
      label: 'Deuteranopia (Red/Green CB)',
      '--ocm-cpr-good':  '#4499ff',
      '--ocm-cpr-warn':  '#ffcc00',
      '--ocm-cpr-crit':  '#ff6600',
      '--ocm-link':      '#88ccff',
      '--ocm-text':      '#e0e0e0',
      '--ocm-text-card': '#cccccc',
      '--ocm-text-dim':   '#aabbcc',
      '--ocm-text-muted': '#8a8a99',
      '--ocm-text-faint': '#7b7b8b',
      '--ocm-bg':         '#181818',
      '--ocm-bg-card':    '#1e1e1e',
      '--ocm-bg-hover':   '#232323',
      '--ocm-border':     '#333333',
      '--ocm-border-soft':'#2e2e2e',
      '--ocm-shape-good': '"\\2713  "',
      '--ocm-shape-warn': '"\\26a0  "',
      '--ocm-shape-crit': '"\\2717  "',
    },
    // Red deficiency — red appears very dark; use cyan/amber/white + shapes
    protanopia: {
      label: 'Protanopia (Red Deficiency)',
      '--ocm-cpr-good':  '#00ddcc',
      '--ocm-cpr-warn':  '#ffcc00',
      '--ocm-cpr-crit':  '#ffffff',
      '--ocm-link':      '#88ccff',
      '--ocm-text':      '#e0e0e0',
      '--ocm-text-card': '#cccccc',
      '--ocm-text-dim':   '#aabbcc',
      '--ocm-text-muted': '#8a8a99',
      '--ocm-text-faint': '#848494',
      '--ocm-bg':         '#181818',
      '--ocm-bg-card':    '#1e1e1e',
      '--ocm-bg-hover':   '#232323',
      '--ocm-border':     '#333333',
      '--ocm-border-soft':'#2e2e2e',
      '--ocm-shape-good': '"\\2713  "',
      '--ocm-shape-warn': '"\\26a0  "',
      '--ocm-shape-crit': '"\\2717  "',
    },
    // Blue/yellow colourblindness — use teal/pink/red + shapes
    tritanopia: {
      label: 'Tritanopia (Blue/Yellow CB)',
      '--ocm-cpr-good':  '#00ddaa',
      '--ocm-cpr-warn':  '#ff88cc',
      '--ocm-cpr-crit':  '#ff2255',
      '--ocm-link':      '#ff99dd',
      '--ocm-text':      '#e0e0e0',
      '--ocm-text-card': '#cccccc',
      '--ocm-text-dim':   '#aabbcc',
      '--ocm-text-muted': '#8a8a99',
      '--ocm-text-faint': '#848494',
      '--ocm-bg':         '#181818',
      '--ocm-bg-card':    '#1e1e1e',
      '--ocm-bg-hover':   '#232323',
      '--ocm-border':     '#333333',
      '--ocm-border-soft':'#2e2e2e',
      '--ocm-shape-good': '"\\2713  "',
      '--ocm-shape-warn': '"\\26a0  "',
      '--ocm-shape-crit': '"\\2717  "',
    },
    midnight: {
      label: 'Midnight Blue',
      '--ocm-cpr-good':  '#5ad6a0',
      '--ocm-cpr-warn':  '#e0b050',
      '--ocm-cpr-crit':  '#e07070',
      '--ocm-link':      '#6aa0e0',
      '--ocm-text':      '#dce6f0',
      '--ocm-text-card': '#b8c4d4',
      '--ocm-text-dim':   '#90a0b8',
      '--ocm-text-muted': '#708098',
      '--ocm-text-faint': '#7a869a',
      '--ocm-bg':         '#0e1420',
      '--ocm-bg-card':    '#141c2c',
      '--ocm-bg-hover':   '#1c2638',
      '--ocm-border':     '#2a3850',
      '--ocm-border-soft':'#1e2a3c',
      '--ocm-shape-good': '""',
      '--ocm-shape-warn': '""',
      '--ocm-shape-crit': '""',
    },
  };

  // The full list of themeable variables with human labels + which are colours
  // (for the custom theme editor). Order here = order in the editor UI.
  const THEME_VARS = [
    { key: '--ocm-text',        label: 'Primary text',      type: 'color' },
    { key: '--ocm-text-card',   label: 'Card text',         type: 'color' },
    { key: '--ocm-text-dim',    label: 'Secondary text',    type: 'color' },
    { key: '--ocm-text-muted',  label: 'Muted labels',      type: 'color' },
    { key: '--ocm-text-faint',  label: 'Faint / empty text',type: 'color' },
    { key: '--ocm-cpr-good',    label: 'CPR good (green)',   type: 'color' },
    { key: '--ocm-cpr-warn',    label: 'CPR warn (amber)',   type: 'color' },
    { key: '--ocm-cpr-crit',    label: 'CPR crit (red)',     type: 'color' },
    { key: '--ocm-link',        label: 'Links / accent',     type: 'color' },
    { key: '--ocm-bg',          label: 'Background',         type: 'color' },
    { key: '--ocm-bg-card',     label: 'Card background',    type: 'color' },
    { key: '--ocm-bg-hover',    label: 'Hover background',   type: 'color' },
    { key: '--ocm-border',      label: 'Borders',            type: 'color' },
    { key: '--ocm-border-soft', label: 'Soft borders',       type: 'color' },
  ];

  /** Apply a theme by setting its CSS variables on #ocm-root.
   *  'custom' pulls from saved ocm_custom_theme overrides (merged onto default). */
  function applyTheme(themeKey) {
    const root = document.getElementById('ocm-root');
    if (!root) return;
    let theme;
    if (themeKey === 'custom') {
      let custom = {};
      try { custom = JSON.parse(GM_getValue(GMK.CUSTOM_THEME, '{}')) || {}; } catch (_) {}
      theme = Object.assign({}, THEMES.default, custom);
    } else {
      theme = THEMES[themeKey] || THEMES.default;
    }
    for (const [prop, value] of Object.entries(theme)) {
      if (prop.startsWith('--')) root.style.setProperty(prop, value);
    }
    GM_setValue(GMK.THEME, themeKey);
  }

  /** Resolve the effective value of a theme var for the current/custom theme. */
  function getThemeVarValue(themeKey, varKey) {
    if (themeKey === 'custom') {
      let custom = {};
      try { custom = JSON.parse(GM_getValue(GMK.CUSTOM_THEME, '{}')) || {}; } catch (_) {}
      return custom[varKey] || THEMES.default[varKey] || '#000000';
    }
    return (THEMES[themeKey] || THEMES.default)[varKey] || '#000000';
  }

  // ─── STYLES ──────────────────────────────────────────────────────────────────
  GM_addStyle(`
    /* ═══ OC Manager v3.3.7 — Job Planner-style UI ═══
       Palette: bg #181818  card #1e1e1e  hover #1f1f1f  border #333/#2e2e2e
                text #e0e0e0/#ccc/#889/#556
                accents: g #7abf7a  a #bf9f5a  r #bf7a7a  b #7a9acc        */

    /* ── ROOT ─────────────────────────────────────────────────────────── */
    /* The report's page: dark canvas, cards floating on it with real air between.
       The old UI packed sections edge-to-edge, which is why everything competed. */
    #ocm-root {
      background: var(--ocm-bg);
      font-variant-numeric: tabular-nums;
      /* Themeable colours — full palette. Defaults reproduce the current look but
         with brighter muted-text values for readability. applyTheme() overrides. */
      --ocm-cpr-good:  #7abf7a;
      --ocm-cpr-warn:  #bf9f5a;
      --ocm-cpr-crit:  #bf7a7a;
      --ocm-link:      #7a9acc;
      --ocm-text:      #e0e0e0;
      --ocm-text-card: #cccccc;
      --ocm-text-dim:    #aab;   /* secondary text (was #99a/#aac) */
      --ocm-text-muted:  #8a8a99;/* tertiary labels (was #889/#778/#667) */
      --ocm-text-faint:  #8a8a99;/* faintest text — still >=4.5:1 on the card bg. It carries real
                                    info (difficulty badges, empty states), so it must pass contrast. */
      --ocm-bg:        #181818;  /* dashboard background */
      --ocm-bg-card:   #1e1e1e;  /* card/panel background */
      --ocm-bg-hover:  #232323;  /* hover/row-stripe background */
      --ocm-border:    #333333;  /* primary borders */
      --ocm-border-soft: #2e2e2e;/* subtle borders */
      --ocm-shape-good: "";
      --ocm-shape-warn: "";
      --ocm-shape-crit: "";
      /* SPACING SCALE (v4.0) — not themeable, applyTheme never touches these.
         Every new component uses the scale; inline pixel paddings are legacy. */
      --ocm-gap-1: 4px;
      --ocm-gap-2: 8px;
      --ocm-gap-3: 12px;
      --ocm-gap-4: 16px;
      --ocm-pad-card: 12px;
      --ocm-pad-cell: 6px 8px;
      margin: 8px 0 12px;
      background: var(--ocm-bg);
      border: 1px solid var(--ocm-border);
      border-radius: 6px;
      font-family: Arial, sans-serif;
      font-size: 13px;
      color: var(--ocm-text-card);
      overflow: hidden;
    }

    /* ── SPACING UTILITIES (v4.0) ─────────────────────────────────────── */
    /* The most-repeated inline-style patterns, promoted to classes so panes
       stop drifting apart visually. Use these, not inline pixels.
       (.ocm-note already exists further down — the 11px explainer class.) */
    .ocm-kpis {                     /* a row of kpiTile()s */
      display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: var(--ocm-gap-3);
    }
    .ocm-flexrow {                  /* generic control/label row */
      display: flex; gap: var(--ocm-gap-2); flex-wrap: wrap; align-items: center;
    }
    .ocm-mt { margin-top: var(--ocm-gap-4); }

    /* ── WAR CARDS (v4.1) — <details> cards for wars and chains ───────── */
    .ocm-war-card {
      background: var(--ocm-bg-card);
      border: 1px solid var(--ocm-border-soft);
      border-radius: 8px;
      margin-bottom: var(--ocm-gap-2);
      overflow: hidden;
    }
    .ocm-war-card > summary {
      display: flex; align-items: center; gap: var(--ocm-gap-3);
      padding: 10px var(--ocm-pad-card);
      cursor: pointer; list-style: none; font-size: 12px;
    }
    .ocm-war-card > summary::-webkit-details-marker { display: none; }
    .ocm-war-card > summary::before {
      content: '▸'; color: var(--ocm-text-faint); font-size: 10px;
      transition: transform .15s;
    }
    .ocm-war-card[open] > summary::before { transform: rotate(90deg); }
    .ocm-war-card > summary:hover { background: var(--ocm-bg-hover); }
    .ocm-war-card-body {
      padding: var(--ocm-gap-1) var(--ocm-pad-card) var(--ocm-pad-card);
      border-top: 1px solid var(--ocm-border-soft);
    }
    /* Deep war report: 11 columns — tighter cells, scrolls sideways if needed */
    .ocm-war-deep thead th { padding: 6px 6px; }
    .ocm-war-deep tbody td { padding: 6px 6px; }

    /* ── LIVE CHAIN + WAR ROOM (v4.2) ──────────────────────────────────── */
    .ocm-chain-hero {
      display: flex; align-items: center; justify-content: space-between;
      gap: var(--ocm-gap-4);
      background: var(--ocm-bg-card); border: 1px solid var(--ocm-border);
      border-radius: 8px; padding: var(--ocm-pad-card);
    }
    .ocm-chain-count { font-size: 34px; font-weight: 700; color: var(--ocm-text); line-height: 1.1; }
    .ocm-chain-timer { font-size: 26px; font-weight: 700; line-height: 1.1; font-variant-numeric: tabular-nums; }
    .ocm-wr-chip {
      font-size: 11px; padding: 4px 10px; border-radius: 6px; cursor: pointer;
      border: 1px solid var(--ocm-border); background: none; color: var(--ocm-text-muted);
    }
    .ocm-wr-chip.active { color: var(--ocm-text); border-color: var(--ocm-link); background: #16202c; }

    /* ── ACTIVITY SPARKLINE (v4.4) — 14 tiny presence bars ─────────────── */
    .ocm-spark { display: inline-flex; align-items: flex-end; gap: 2px; height: 14px; }
    .ocm-spark i { display: inline-block; width: 5px; border-radius: 1px; }

    /* ── ARMOURY USAGE BREAKDOWN (v4.8) — consumable cards + count pills ── */
    .ocm-use-img {
      width: 46px; height: 28px; flex: 0 0 46px;
      display: inline-flex; align-items: center; justify-content: center;
      background: #101216; border: 1px solid var(--ocm-border-soft); border-radius: 6px;
      font-size: 14px; overflow: hidden;
    }
    .ocm-use-img img { max-width: 44px; max-height: 26px; }
    .ocm-use-pill {
      font-size: 10px; padding: 2px 8px; border-radius: 9px;
      background: #22262e; color: var(--ocm-text-muted);
      font-variant-numeric: tabular-nums; white-space: nowrap;
    }
    .ocm-use-pill b { color: var(--ocm-text); font-weight: 700; }

    /* ── ARMOURY MEMBER PROFILES (v4.9) — slot-classified gear chips ────── */
    /* Chip = slot letter (italic, like the classic gear lists) + item art +
       name, with a slot-coloured left accent. Accents are decorative borders,
       not text, so they sit outside the AA-contrast rules. */
    .ocm-gp-chip {
      display: inline-flex; align-items: center; gap: 5px;
      background: #16181d; border: 1px solid var(--ocm-border-soft);
      border-left: 3px solid var(--ocm-border);
      border-radius: 5px; padding: 2px 8px 2px 6px; margin: 2px 4px 2px 0;
      font-size: 11px; color: var(--ocm-text-card); white-space: nowrap;
    }
    .ocm-gp-chip img { height: 16px; width: auto; }
    .ocm-gp-chip i {
      font-style: italic; font-weight: 700; font-size: 10px;
      color: var(--ocm-text-muted);
    }
    .ocm-gp-chip.gp-primary   { border-left-color: #c8883c; }
    .ocm-gp-chip.gp-primary i   { color: #d8a35c; }
    .ocm-gp-chip.gp-secondary { border-left-color: #8a6ac8; }
    .ocm-gp-chip.gp-secondary i { color: #a98ae0; }
    .ocm-gp-chip.gp-melee     { border-left-color: #c85a5a; }
    .ocm-gp-chip.gp-melee i     { color: #e08a8a; }
    .ocm-gp-chip.gp-body      { border-left-color: #5a8ac8; }
    .ocm-gp-chip.gp-body i      { color: #8ab0e0; }
    .ocm-gp-chip.gp-helmet    { border-left-color: #4ab8b0; }
    .ocm-gp-chip.gp-helmet i    { color: #7ad0c8; }
    .ocm-gp-chip.gp-gloves    { border-left-color: #6ab84a; }
    .ocm-gp-chip.gp-gloves i    { color: #96d07a; }
    .ocm-gp-chip.gp-boots     { border-left-color: #b8a24a; }
    .ocm-gp-chip.gp-boots i     { color: #d0be7a; }
    .ocm-gp-chip.gp-pants     { border-left-color: #b84a9a; }
    .ocm-gp-chip.gp-pants i     { color: #d07ac0; }
    .ocm-gp-row { cursor: pointer; }
    .ocm-gp-row td { white-space: normal; }
    .ocm-gp-detail td { background: #16191f !important; }
    .ocm-gp-flag { font-size: 10px; font-weight: 700; color: var(--ocm-cpr-warn); white-space: nowrap; cursor: help; }

    /* v5.0 compact redesign: gear renders as image TILES — slot carried by the
       coloured bottom edge, name + slot on hover. The named chip layout above
       survives for the legend and the expanded profile, where space is fine. */
    .ocm-gp-compact tbody td { padding: 5px 10px; }
    .ocm-gp-tile {
      position: relative; display: inline-flex; align-items: center; justify-content: center;
      width: 34px; height: 24px; background: #101216;
      border: 1px solid var(--ocm-border-soft); border-bottom-width: 2px;
      border-radius: 5px; margin: 1px 3px 1px 0; vertical-align: middle; cursor: help;
    }
    .ocm-gp-tile img { max-width: 32px; max-height: 20px; }
    .ocm-gp-tile i, .ocm-gp-tile { font-style: normal; font-size: 10px; font-weight: 700; color: var(--ocm-text-muted); }
    .ocm-gp-tile.gp-primary   { border-bottom-color: #c8883c; }
    .ocm-gp-tile.gp-secondary { border-bottom-color: #8a6ac8; }
    .ocm-gp-tile.gp-melee     { border-bottom-color: #c85a5a; }
    .ocm-gp-tile.gp-body      { border-bottom-color: #5a8ac8; }
    .ocm-gp-tile.gp-helmet    { border-bottom-color: #4ab8b0; }
    .ocm-gp-tile.gp-gloves    { border-bottom-color: #6ab84a; }
    .ocm-gp-tile.gp-boots     { border-bottom-color: #b8a24a; }
    .ocm-gp-tile.gp-pants     { border-bottom-color: #b84a9a; }
    .ocm-gp-tile.gp-item      { border-bottom-color: var(--ocm-border); }

    /* ── HEADER (top bar with title + refresh) ────────────────────────── */
    #ocm-last-update, .ocm-time {
      font-size: 11px;
      color: var(--ocm-text-muted);
    }

    /* ── SUB-STATUS BAR (key saved · CPR thresholds · refresh interval) */
    #ocm-config-strip, .ocm-config-strip {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 14px;
      background: #1c1c1c;
      border-bottom: 1px solid #252525;
      font-size: 11px;
      color: var(--ocm-text-dim);
      gap: 8px;
      flex-wrap: wrap;
    }

    /* ── BUTTONS ──────────────────────────────────────────────────────── */
    /* Base button — guarantees no button falls through to default black text. */
    #ocm-root button {
      color: var(--ocm-text-card);
      font-family: Arial, sans-serif;
    }
    .ocm-cfg-btn, #ocm-refresh-btn, #ocm-config-toggle, .ocm-config-toggle {
      padding: 7px 12px;
      border-radius: 4px;
      border: 1px solid #383838;
      background: #222;
      color: var(--ocm-text);
      font-size: 12px;
      font-weight: bold;
      cursor: pointer;
      transition: background .15s, border-color .15s;
    }
    .ocm-cfg-btn:hover, #ocm-refresh-btn:hover, #ocm-config-toggle:hover, .ocm-config-toggle:hover {
      background: var(--ocm-bg-hover);
      border-color: #4a4a4a;
    }
    /* Primary save buttons get green tint */
    #ocm-save-key-btn, #ocm-cfg-save-btn, #ocm-ts-save-btn {
      background: #1a2518;
      border-color: #3a5030;
      color: #7abf7a;
    }
    #ocm-save-key-btn:hover, #ocm-cfg-save-btn:hover, #ocm-ts-save-btn:hover {
      background: #20301e;
      border-color: #4a6040;
    }
    /* Refresh gets blue tint */
    #ocm-refresh-btn {
      background: #182028;
      border-color: #304060;
      color: #6aaade;
    }
    #ocm-refresh-btn:hover {
      background: #1e2a38;
      border-color: #405078;
    }

    /* ── INPUTS ───────────────────────────────────────────────────────── */
    #ocm-root input[type="text"],
    #ocm-root input[type="password"],
    #ocm-root input[type="number"],
    #ocm-root select {
      padding: 7px 10px;
      background: #222;
      border: 1px solid #383838;
      border-radius: 4px;
      color: var(--ocm-text);
      font-size: 13px;
      box-sizing: border-box;
    }
    /* Dropdown option list — some platforms render these with OS default (black);
       force the themed palette so they're always readable. */
    #ocm-root select option {
      background: var(--ocm-bg-card);
      color: var(--ocm-text);
    }
    /* Labels and any otherwise-unstyled inline text inherit a readable colour
       rather than falling through to the browser default (black on dark). */
    #ocm-root label { color: var(--ocm-text-card); }
    #ocm-root input:focus, #ocm-root select:focus {
      outline: none;
      border-color: var(--ocm-text-faint);
      background: #282828;
    }
    .ocm-cfg-num {
      width: 60px;
      text-align: center;
    }

    /* ── CONFIG PANEL ─────────────────────────────────────────────────── */
    #ocm-config-panel, .ocm-config-panel {
      background: #1a1a1a;
      border-bottom: 1px solid #252525;
    }
    .ocm-cfg-section {
      padding: 12px 14px;
      border-bottom: 1px solid #252525;
    }
    .ocm-cfg-section:last-child { border-bottom: none; }
    .ocm-cfg-label {
      display: block;
      color: var(--ocm-text-muted);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: bold;
      margin-bottom: 8px;
    }
    .ocm-cfg-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      font-size: 12px;
      color: #ccd;
    }
    .ocm-cfg-status {
      font-size: 11px;
      color: var(--ocm-text-dim);
      margin-top: 6px;
    }

    /* ── STATS BAR ────────────────────────────────────────────────────── */
    .ocm-recruiting-chip {
      background: var(--ocm-bg-card);
      border: 1px solid var(--ocm-border-soft);
      border-radius: 3px;
      padding: 2px 6px;
      font-size: 10px;
      color: #c8b060;
      font-weight: bold;
      white-space: nowrap;
    }
    .ocm-recruiting-chip.danger {
      color: var(--ocm-cpr-crit);
      border-color: #4a2a2a;
    }
    @media (max-width: 500px) {
    }

    /* ── BANNERS / NOTICES ────────────────────────────────────────────── */
    #ocm-stuck-banner, #ocm-next-banner, .ocm-banner-issue, .ocm-stuck-banner {
      margin: 8px 12px;
      padding: 10px 12px;
      background: #201810;
      border: 1px solid #4a3018;
      border-radius: 4px;
      color: #c8a060;
      font-size: 12px;
      line-height: 1.5;
    }
    .ocm-banner-title {
      color: #d8a060;
      font-weight: bold;
      margin-bottom: 4px;
    }
    .ocm-banner-issues { font-size: 11px; color: #b89060; }

    /* Next OC banner */
    #ocm-next-banner, .ocm-next-banner {
      margin: 8px 12px;
      padding: 10px 12px;
      background: #14181e;
      border: 1px solid #2a3040;
      border-radius: 4px;
      color: var(--ocm-text-dim);
      font-size: 12px;
      line-height: 1.6;
    }
    #ocm-next-banner.banner-ok {
      background: #14201a;
      border-color: #2a4a32;
      color: var(--ocm-text-dim)8a0;
    }
    #ocm-next-banner.banner-warn, .ocm-next-banner.warn {
      background: #1c1810;
      border-color: #4a3a18;
      color: #c8a060;
    }
    #ocm-next-banner.banner-crit {
      background: #201410;
      border-color: #4a2820;
      color: #c88a70;
    }
    #ocm-next-banner .ocm-banner-title {
      color: inherit;
      font-size: 13px;
      font-weight: bold;
      margin-bottom: 4px;
    }
    #ocm-next-banner .ocm-banner-title strong { color: var(--ocm-text); }
    #ocm-next-banner .ocm-banner-issues {
      margin-top: 6px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    #ocm-next-banner .ocm-banner-issue {
      font-size: 11px;
      color: inherit;
      opacity: 0.85;
      display: block;
    }

    /* Best slot card */
    .ocm-stat-pill, #ocm-best-slot, .ocm-best-slot {
      margin: 8px 12px;
      padding: 10px 12px;
      background: #14181e;
      border: 1px solid #2a3040;
      border-radius: 4px;
      color: var(--ocm-text-dim);
      font-size: 12px;
      line-height: 1.6;
    }

    /* ── SECTION TITLES (collapsible headers) ─────────────────────────── */
    /* Group tabs — switch between Action / Status / Optimize / Active OCs / Reference */
    .ocm-tab-pane { display: none; min-width: 0; }
    .ocm-tab-pane.active { display: block; min-width: 0; overflow: hidden; }

    /* MEMBER MODE (v5.1.1): one compact panel — the whole leader shell (tab
       strips, sub-tab bars, empty panes with placeholder notes) hides. */
    #ocm-root.ocm-member-mode .ocm-tabs,
    #ocm-root.ocm-member-mode .ocm-tab-pane { display: none !important; }

    /* Sub-tabs inside the combined Profit & Items pane */
    .ocm-subpane { display: none; min-width: 0; }
    .ocm-subpane.active { display: block; min-width: 0; }


    /* ══════════ SHELL — header, tabs, cards (the mockup layout) ══════════ */
    #ocm-header {
      display: flex; align-items: center; gap: 10px;
      padding: 0 0 16px; margin: 0;
      background: none; border: none;
    }
    #ocm-header h2 {
      font-size: 19px; margin: 0; color: var(--ocm-text); font-weight: 700;
      letter-spacing: 0; text-transform: none;
    }
    #ocm-header .ocm-ver { font-size: 10px; color: var(--ocm-text-faint); }
    #ocm-header .ocm-hdr-gap { flex: 1; }
    #ocm-header small { font-size: 11px; color: var(--ocm-text-muted); }
    #ocm-header button {
      background: none; border: 1px solid var(--ocm-border); color: var(--ocm-text-muted);
      font-size: 11px; padding: 5px 11px; border-radius: 6px; cursor: pointer;
      font-family: inherit; transition: color .15s, border-color .15s;
    }
    #ocm-header button:hover { color: var(--ocm-link); border-color: var(--ocm-link); }

    /* MAIN TABS — quiet underline. The cards carry the structure, not the chrome. */
    .ocm-tabs {
      display: flex; gap: 4px; flex-wrap: wrap;   /* five tabs since v4.0 — let them wrap on narrow screens */
      border-bottom: 1px solid var(--ocm-border);
      margin: 0 0 16px; padding: 0; background: none;
    }
    .ocm-tab {
      padding: 9px 16px; font-size: 12px; font-weight: 600;
      color: var(--ocm-text-muted); cursor: pointer;
      background: none; border: none; border-radius: 0;
      border-bottom: 2px solid transparent; margin-bottom: -1px;
      transition: color .15s;
    }
    .ocm-tab:hover { color: var(--ocm-text-dim); background: none; }
    .ocm-tab.active {
      color: var(--ocm-text); background: none;
      border-bottom-color: var(--ocm-link);
    }
    .ocm-tab-count {
      display: inline-block; background: #2a2a2a; color: var(--ocm-text-muted);
      font-size: 9px; padding: 1px 6px; border-radius: 8px; margin-left: 6px; font-weight: 700;
    }
    .ocm-tab.active .ocm-tab-count { background: var(--ocm-link); color: #0d1520; }
    .ocm-tab-count.has-attn { background: var(--ocm-cpr-crit); color: #fff; }

    /* SUB-TABS — light outline chips */
    .ocm-subtabs {
      display: flex; gap: 6px; flex-wrap: wrap;
      margin: 0 0 16px; padding: 0; background: none; border: none;
    }
    .ocm-subtab {
      padding: 5px 12px; font-size: 11px; color: var(--ocm-text-muted);
      cursor: pointer; background: none;
      border: 1px solid var(--ocm-border); border-radius: 6px;
      transition: color .15s, border-color .15s, background .15s;
    }
    .ocm-subtab:hover { color: var(--ocm-text-dim); border-color: #3a3a3a; }
    .ocm-subtab.active {
      color: var(--ocm-text); border-color: var(--ocm-link); background: #16202c;
    }
    .ocm-subtab-badge {
      display: inline-block; background: #2a2a2a; color: var(--ocm-text-muted);
      font-size: 9px; padding: 0 5px; border-radius: 7px; margin-left: 5px; font-weight: 700;
    }
    .ocm-subtab-badge.has-attn { background: var(--ocm-cpr-crit); color: #fff; }

    /* STATS -> the mockup's KPI tiles. Big number, small caps label, quiet sub-line. */
    #ocm-stats-bar { display: block; margin-bottom: 16px; }
    /* Grid, not flex-wrap. Six tiles stay on ONE line and shrink together instead of
       breaking 3+3 and dragging the recruiting strip into the gap beside them. */
    .ocm-stats-row {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 8px;
      background: none; border: none; padding: 0; margin: 0 0 8px;
    }
    @media (max-width: 900px) {
      .ocm-stats-row { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }
    @media (max-width: 480px) {
      .ocm-stats-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    .ocm-stat {
      background: var(--ocm-bg-card); border: 1px solid var(--ocm-border);
      border-radius: 8px; padding: 10px var(--ocm-pad-card);
      display: block; text-align: left; min-width: 0;
    }
    .ocm-stat-label {
      display: block; font-size: 9px; text-transform: uppercase; letter-spacing: .06em;
      color: var(--ocm-text-muted); font-weight: 700;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;   /* "BLOCKED" must never wrap or clip mid-word */
    }
    .ocm-stat-value {
      display: block; font-size: 20px; font-weight: 700; margin-top: 4px;
      line-height: 1.1;
      color: var(--ocm-text); font-variant-numeric: tabular-nums;
    }
    .ocm-s-open   .ocm-stat-value { color: var(--ocm-text); }
    .ocm-s-free   .ocm-stat-value { color: var(--ocm-link); }
    .ocm-s-lowcpr .ocm-stat-value { color: var(--ocm-cpr-warn); }
    .ocm-s-blocked .ocm-stat-value,
    .ocm-s-stuck  .ocm-stat-value { color: var(--ocm-cpr-crit); }
    .ocm-stats-row-recruiting {
      display: flex; align-items: center; gap: 10px;
      background: var(--ocm-bg-card); border: 1px solid var(--ocm-border);
      border-radius: 8px; padding: 8px 12px;
      width: 100%;                       /* its own full-width line, not a column */
    }
    .ocm-stats-row-recruiting .ocm-stat-label { flex: 0 0 auto; }

    /* ── SECTION HEADER
       One blue, uppercase header per block. This is the single biggest readability
       win from the report design: the eye lands on ONE thing per card instead of
       scanning a wall of same-weight grey. It is a HEADING, not a title bar — the
       old gradient strip looked like chrome and read as noise. */
    .ocm-section-title {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0;
      margin: 0 0 10px;
      background: none;
      border: none;
      font-size: 13px;
      font-weight: 700;
      color: var(--ocm-link);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      cursor: pointer;
      user-select: none;
      transition: color .15s;
    }
    .ocm-section-title:hover { color: var(--ocm-text); }
    .ocm-section-title::after {
      content: '▾';
      margin-left: auto;
      font-size: 10px;
      color: var(--ocm-text-faint);
      transition: transform .15s;
    }
    .ocm-section-title.collapsed::after { transform: rotate(-90deg); }

    /* Explains the block beneath it. The old UI showed numbers and assumed you knew
       the rules; every table now says what it is before you read it. */
    .ocm-note {
      color: var(--ocm-text-muted);
      font-size: 11px;
      margin: 0 0 12px;
      line-height: 1.6;
    }
    /* A second section inside the same card needs air above it, or the previous
       table's last row collides with the next blue header. */
    .ocm-section-title + * { margin-top: 0; }
    * + .ocm-section-title { margin-top: 18px; }
    .ocm-note b { color: var(--ocm-text-dim); }

    /* The card. Everything the report got right: air, one border, one radius. */
    /* Every sub-tab pane is a card. This is the change that does the most work:
       content sits INSIDE something, with padding, instead of bleeding to the edges. */
    .ocm-subpane.active {
      background: var(--ocm-bg-card);
      border: 1px solid var(--ocm-border);
      border-radius: 10px;
      padding: 16px 18px;
    }
    /* ...except the OC grids, which are already cards themselves — a card of cards
       would just be a box inside a box. They still need the gutter, though: without it
       the section titles and banners sat flush against the left edge while the cards
       inside them were deeply padded, and that mismatch is what reads as bad spacing. */
    #ocm-sub-fill.active, #ocm-sub-active.active {
      background: none; border: none; padding: 0;
    }
    #ocm-sub-fill > .ocm-section-title,
    #ocm-sub-active > .ocm-section-title { margin-top: 20px; }
    #ocm-sub-fill > .ocm-section-title:first-child { margin-top: 0; }

    /* Consistent vertical rhythm. Everything in a pane breathes the same amount. */
    #ocm-next-banner:not(:empty),
    #ocm-stuck-banner, #ocm-my-assignment, #ocm-leader-advice { margin-bottom: 12px; }

    /* Banners were bare divs bleeding to the edge. They're cards like everything else. */
    #ocm-my-assignment, #ocm-leader-advice {
      background: var(--ocm-bg-card);
      border: 1px solid var(--ocm-border);
      border-radius: 10px;
      padding: 12px 16px;
      font-size: 12px;
    }

    .ocm-card {
      background: var(--ocm-bg-card);
      border: 1px solid var(--ocm-border);
      border-radius: 10px;
      padding: 16px 18px;
      margin-bottom: 14px;
    }
    /* v5.2: a SUPERSEDED ::after block lived here. It was a leftover from the
       pre-v3.34 look, but sat later in source than the redesigned rule above,
       so it silently won — the chevron rendered 8px after the text instead of
       right-aligned (margin-left:auto), in the old ▼ glyph rather than ▾.
       Exactly the "won by luck of source order" hazard v3.35 documented, only
       here it was the NEW design losing. Removed; the intended rule now applies. */

    /* Section content panels */
    #ocm-available, #ocm-recruits, #ocm-blocked, #ocm-lowcpr, #ocm-overqualified, #ocm-tscpr,
    #ocm-analytics, #ocm-downloads {
      background: var(--ocm-bg);
      padding-top: 6px;
      padding-bottom: 6px;
      min-width: 0;
      overflow: hidden;
    }
    /* Section content gets uniform horizontal padding by default; specific
       layouts (mcard-list, row-grids, table wrappers) handle their own. */
    #ocm-available > *:not(.ocm-mcard-list),
    #ocm-recruits > *:not(.ocm-blocked-row):not(.ocm-lowcpr-row),
    #ocm-blocked > *:not(.ocm-blocked-row):not(.ocm-lowcpr-row),
    #ocm-lowcpr > *:not(.ocm-blocked-row):not(.ocm-lowcpr-row),
    #ocm-overqualified > *:not(.ocm-lowcpr-row),
    #ocm-tscpr > *:not(.ocm-tscpr-oc-block),
    #ocm-analytics > *,
    #ocm-downloads > * {
      padding-left: 12px;
      padding-right: 12px;
    }

    /* ── PHASE HEADERS (Planning / Recruiting bar) ────────────────────── */
    /* Assignment verdicts */
    .ocm-pay-table td.v-risk  { color: var(--ocm-cpr-crit); font-weight: 700; }
    .ocm-pay-table td.v-under { color: var(--ocm-link);     font-weight: 700; }
    .ocm-pay-table td.v-weak  { color: var(--ocm-cpr-warn); }
    .ocm-pay-table td.v-ok    { color: var(--ocm-cpr-good); }
    .ocm-pay-table td.v-none  { color: var(--ocm-text-faint); }

    #ocm-legend {
      background: var(--ocm-bg-card);
      border: 1px solid var(--ocm-border-soft);
      border-radius: 8px;
      padding: 14px 16px;
      margin: 0 12px 10px;
    }
    .ocm-legend-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 14px 20px;
    }
    .ocm-legend-grid h4 {
      margin: 0 0 4px;
      font-size: 11px !important;
      font-weight: 700;
      color: var(--ocm-link);
      text-transform: uppercase;
      letter-spacing: .05em;
    }
    .ocm-legend-grid p {
      margin: 0;
      font-size: 11px;
      line-height: 1.6;
      color: var(--ocm-text-dim);
    }
    .ocm-legend-grid b { color: var(--ocm-text); }
    .ocm-lg-tag { font-size: 10px; background: #22262e; padding: 1px 5px; border-radius: 3px; font-weight: 700; }
    #ocm-legend-btn {
      background: none; border: 1px solid var(--ocm-border);
      color: var(--ocm-text-muted); font-size: 11px;
      padding: 3px 9px; border-radius: 4px; cursor: pointer; margin-right: 6px;
    }
    #ocm-legend-btn:hover { color: var(--ocm-link); border-color: var(--ocm-link); }

    .ocm-exp-grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
    @media (max-width: 640px) { .ocm-exp-grid { grid-template-columns:1fr; } }
    .ocm-exp-h { font-size:10px; text-transform:uppercase; letter-spacing:.07em; color:var(--ocm-link); font-weight:700; margin-bottom:8px; }
    .ocm-exp-opt { display:flex; gap:9px; align-items:flex-start; padding:8px 10px; border:1px solid var(--ocm-border-soft);
                   border-radius:6px; margin-bottom:6px; cursor:pointer; background:var(--ocm-bg-card); }
    .ocm-exp-opt:hover { background:var(--ocm-bg-hover); border-color:var(--ocm-link); }
    .ocm-exp-opt input { margin-top:2px; flex:0 0 auto; }
    .ocm-exp-opt b { font-size:12px; color:var(--ocm-text); font-weight:600; }
    .ocm-exp-opt em { font-size:10px; color:var(--ocm-text-faint); font-style:normal; margin-left:4px; }
    .ocm-exp-opt small { display:block; font-size:10px; color:var(--ocm-text-muted); margin-top:2px; line-height:1.45; }
    .ocm-pay-row, .ocm-earn-row { cursor:pointer; }
    .ocm-pay-detail, .ocm-earn-detail { display:none; }
    .ocm-pay-detail.is-open, .ocm-earn-detail.is-open { display:table-row; }

    .ocm-join-btn {
      background: #16202c;
      border: 1px solid #2f4a68;
      color: var(--ocm-link);
      font-size: 11px;
      font-weight: 700;
      padding: 4px 12px;
      border-radius: 5px;
      cursor: pointer;
      white-space: nowrap;
      transition: background .15s, filter .15s;
    }
    .ocm-join-btn:hover { background: #1b2a3a; filter: brightness(1.2); }
    /* pulse the slot we sent them to, so it's obvious which row to click */
    @keyframes ocm-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(89,165,216,.0); }
      50%      { box-shadow: 0 0 0 3px rgba(89,165,216,.55); }
    }
    .ocm-join-target {
      animation: ocm-pulse 1.1s ease-in-out 4;
      outline: 2px solid var(--ocm-link) !important;
      outline-offset: 1px;
      border-radius: 4px;
    }

    /* ── ARMORY PAGE: injected "OC Status" column ──────────────────────────
       Torn's utilities armory is a fixed-width FLOAT layout (name 319px, type
       102px, loaned 102px, action 173px), so a new column can't just be inserted —
       its width has to be borrowed. We take 110px from the name column, which is
       the only one with room to spare. Scoped to .ocm-armory-annotated so we can
       never disturb the other armory tabs.                                      */
    .ocm-armory-annotated .item-list .name { width: 209px !important; }
    .ocm-armory-annotated .list-title .item-title { width: 280px !important; }
    .ocm-acol {
      float: left;
      width: 110px;
      height: 32px;
      line-height: 32px;
      margin-top: -1px;
      padding: 0 6px;
      box-sizing: border-box;
      font-size: 11px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      border-left: 1px solid var(--default-panel-divider-inner-side-color, #444);
      border-right: 1px solid var(--default-panel-divider-outer-side-color, #ccc);
    }
    .ocm-acol.s-inuse    { color: #7cba5c; font-weight: 700; }   /* loaned AND needed for their OC */
    .ocm-acol.s-idle     { color: #e8a33d; font-weight: 700; }   /* loaned, NOT needed -> retrievable */
    .ocm-acol.s-none     { color: transparent; }                 /* not loaned — nothing to say */
    .ocm-acol.s-loading  { color: #666; font-style: italic; }
    .list-title .ocm-acol { font-weight: 700; color: inherit; }

    /* ── PAYOUT TABLES — built for readability ─────────────────────────────
       The old payout table used muted greys on a dark card for everything, which
       was unreadable at a glance. Here the DATA is bright and the chrome is dim,
       with zebra rows and a real row height so the eye can track across.        */
    .ocm-pay-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      table-layout: fixed;
    }
    .ocm-pay-table thead th {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: .07em;
      font-weight: 700;
      color: var(--ocm-text-muted);
      text-align: left;
      padding: 6px 10px;
      border-bottom: 1px solid #2a2e36;
      white-space: nowrap;
    }
    .ocm-pay-table th.num, .ocm-pay-table td.num,
    .ocm-pay-table td[style*="text-align:right"], .ocm-pay-table th[style*="text-align:right"] {
      text-align: right;
      font-variant-numeric: tabular-nums;   /* digits line up; you can scan a column */
    }
    .ocm-pay-table tbody td:first-child { color: var(--ocm-text); font-weight: 600; }
    .ocm-pay-table tbody tr:last-child td { border-bottom: none; }
    .ocm-pay-table tbody td {
      padding: 9px 10px;
      color: var(--ocm-text-dim);
      font-variant-numeric: tabular-nums;
      border-bottom: 1px solid #242424;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    .ocm-pay-table tbody tr:nth-child(4n+1) td { background: #1b1e24; }
    .ocm-pay-table tbody tr:hover td { background: #23272f; }
    .ocm-pay-table a { color: var(--ocm-link); text-decoration: none; font-weight: 600; }
    .ocm-pay-table a:hover { text-decoration: underline; }

    /* clickable OC rows reveal the crew breakdown */
    .ocm-pay-row { cursor: pointer; }
    .ocm-pay-detail { display: none; }
    .ocm-pay-detail.is-open { display: table-row; }
    .ocm-pay-detail td { background: #16191f !important; padding: 8px 10px !important; white-space: normal !important; }
    .ocm-pay-crewwrap { display: flex; flex-wrap: wrap; gap: 6px; }
    .ocm-pay-crew {
      font-size: 11px; padding: 3px 8px; border-radius: 4px;
      background: #22262e; color: var(--ocm-text-dim); white-space: nowrap;
    }
    .ocm-pay-crew b { color: var(--ocm-cpr-good); margin-left: 3px; font-weight: 700; }

    /* share-of-payouts bar */
    .ocm-pay-bar { height: 5px; background: #23262c; border-radius: 3px; overflow: hidden; }
    .ocm-pay-bar > span { display: block; height: 100%; background: var(--ocm-cpr-good); opacity: .75; border-radius: 3px; }

    /* ── PHASE HEADERS — restyled to match the card language ──────────────
       A quiet section rule, not a heavy panel: accent dot + title + count,
       difficulty chips pushed right, chevron on the far edge.               */
    .ocm-phase-header, #ocm-planning-header, #ocm-recruiting-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 16px 12px 10px;
      padding: 0 0 8px;
      background: none;
      border: none;
      border-bottom: 1px solid #23262c;
      border-radius: 0;
      flex-wrap: wrap;
      cursor: pointer;
      user-select: none;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: .02em;
      color: var(--ocm-text-dim);
      transition: color .15s, border-color .15s;
    }
    .ocm-phase-header:hover, #ocm-planning-header:hover, #ocm-recruiting-header:hover {
      color: var(--ocm-text);
      border-bottom-color: #3a3f48;
    }
    /* the coloured dot is the only chrome — it says which phase this is */
    #ocm-planning-header::before, #ocm-recruiting-header::before {
      content: ''; width: 7px; height: 7px; border-radius: 50%; flex: 0 0 7px;
    }
    #ocm-planning-header::before   { background: #4a5160; }
    #ocm-recruiting-header::before { background: var(--ocm-link); }

    .ocm-phase-count {
      font-size: 11px; font-weight: 700;
      background: #22262e; color: var(--ocm-text-muted);
      padding: 1px 7px; border-radius: 10px;
      font-variant-numeric: tabular-nums;
    }
    #ocm-recruiting-header .ocm-phase-count { background: #16202c; color: var(--ocm-link); }
    #ocm-planning-header   .ocm-phase-count { background: #22262e; color: var(--ocm-text-dim); }

    /* difficulty chips: pushed to the right, quiet until hovered */
    .ocm-phase-chips { display: flex; gap: 4px; flex-wrap: wrap; margin-left: auto; align-items: center; }
    .ocm-diff-chip, .ocm-diff-chip-plan {
      background: #1e222a;
      border: none;
      color: var(--ocm-text-muted);
      padding: 2px 7px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    .ocm-diff-chip strong, .ocm-diff-chip-plan strong { color: var(--ocm-text-dim); font-weight: 700; }
    .ocm-diff-chip-plan { background: #1e222a; }
    .ocm-diff-sep { display: none; }   /* the chips group is self-evident now */

    .ocm-phase-collapse {
      color: var(--ocm-text-faint);
      font-size: 10px;
      cursor: pointer;
      user-select: none;
      flex: 0 0 auto;
      transition: transform .2s;
    }
    .ocm-phase-header.collapsed .ocm-phase-collapse { transform: rotate(-90deg); }

    /* ── OC GRID ──────────────────────────────────────────────────────── */
    .ocm-oc-grid, #ocm-grid-planning, #ocm-grid-recruiting {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
      gap: 10px;
      padding: 0 12px 12px;
      align-items: start;   /* cards size to content — no stretching to match the tallest in the row */
    }

    /* ── OC CARDS v2 — clean, modern rebuild ───────────────────────────────
       Design rules:
       · status is a LEFT ACCENT BAR, not a full card tint (tinted cards fight
         each other and make everything look urgent)
       · one row per slot, four fixed columns (role · member · tags · CPR) so the
         eye can scan straight down a column instead of hunting
       · muted by default, colour ONLY where it means something (risk, blocked,
         missing item) — colour is a signal, not decoration                    */
    .oc2 {
      position: relative;
      background: var(--ocm-bg-card);
      border: 1px solid var(--ocm-border-soft);
      border-radius: 10px;
      padding: 14px 16px 12px 18px;
      overflow: hidden;
      transition: border-color .15s, transform .15s;
    }
    .oc2:hover { border-color: #3a3f48; transform: translateY(-1px); }
    /* left accent bar carries the status colour */
    .oc2::before {
      content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
      background: var(--oc2-accent, #3a3f48);
    }
    .oc2[data-status="ready"]      { --oc2-accent: var(--ocm-cpr-good); }
    .oc2[data-status="recruiting"] { --oc2-accent: var(--ocm-link); }
    .oc2[data-status="planning"]   { --oc2-accent: #4a5160; }
    .oc2[data-status="blocked"]    { --oc2-accent: var(--ocm-cpr-crit); }
    .oc2[data-status="crit"]       { --oc2-accent: var(--ocm-cpr-crit); }
    .oc2[data-status="warn"]       { --oc2-accent: var(--ocm-cpr-warn); }

    .oc2-head { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 10px; }
    /* NOTE: this is a <div>, not an <h3> — Torn's page CSS styles h3 globally and
       was blowing the OC name up to heading size. Specific selector + explicit
       sizing so the page can't win. */
    .oc2 .oc2-name {
      font-size: 15px !important;
      font-weight: 600;
      color: var(--ocm-text);
      margin: 0 0 6px;
      padding: 0;
      line-height: 1.3;
      letter-spacing: -0.01em;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .oc2-meta { display: flex; gap: 5px; align-items: center; flex-wrap: wrap; }
    .oc2-chip {
      font-size: 9px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
      padding: 2px 6px; border-radius: 4px; white-space: nowrap;
      background: #22262e; color: var(--ocm-text-muted);
    }
    .oc2-chip.is-ready      { background: #14241a; color: var(--ocm-cpr-good); }
    .oc2-chip.is-recruiting { background: #16202c; color: var(--ocm-link); }
    .oc2-chip.is-blocked    { background: #2a1618; color: var(--ocm-cpr-crit); }
    .oc2-chip.is-warn       { background: #2a2416; color: var(--ocm-cpr-warn); }
    .oc2-chip.is-diff       { background: #1e222a; color: var(--ocm-text-dim); }

    .oc2-time { margin-left: auto; text-align: right; flex: 0 0 auto; padding-top: 1px; }
    .oc2-time-val { display: block; font-size: 12px; font-weight: 700; color: var(--ocm-text-dim); font-variant-numeric: tabular-nums; letter-spacing: .01em; }
    .oc2-time-val.is-soon { color: var(--ocm-cpr-warn); }
    .oc2-time-val.is-ready { color: var(--ocm-cpr-good); }
    .oc2-time-sub { display: block; font-size: 9px; color: var(--ocm-text-faint); margin-top: 1px; white-space: nowrap; }

    /* fill progress: how many seats are taken */
    .oc2-fill { display: flex; align-items: center; gap: 8px; margin-bottom: 9px; }
    .oc2-fillbar { flex: 1; height: 3px; background: #23262c; border-radius: 2px; overflow: hidden; }
    .oc2-fillbar > span { display: block; height: 100%; background: var(--oc2-accent, #4a5160); border-radius: 2px; transition: width .3s; }
    .oc2-fill-label { font-size: 10px; color: var(--ocm-text-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }

    /* slot rows */
    /* Slot rows are now shaped like every other table in the UI — same columns, same
       alignment, same tabular figures. You learn the pattern once and it holds
       everywhere, instead of the OC card being its own bespoke thing to decode.
       Columns: role · member · item · weight · CPR                             */
    .oc2-slots { display: flex; flex-direction: column; }
    .oc2-slot {
      display: grid;
      grid-template-columns: minmax(64px, 1fr) minmax(70px, 1.2fr) auto 44px 44px;
      align-items: center; gap: 10px;
      padding: 8px 8px; border-radius: 0;
      border-bottom: 1px solid #242424;
      font-size: 12px; position: relative;
      font-variant-numeric: tabular-nums;
    }
    .oc2-slots .oc2-slot:last-child { border-bottom: none; }
    .oc2-slot-head {
      display: grid;
      grid-template-columns: minmax(64px, 1fr) minmax(70px, 1.2fr) auto 44px 44px;
      gap: 10px; padding: 6px 8px;
      border-bottom: 1px solid #2a2e36;
      font-size: 9px; text-transform: uppercase; letter-spacing: .07em;
      font-weight: 700; color: var(--ocm-text-muted);
    }
    .oc2-slot-head .r { text-align: right; }
    .oc2-slot:hover { background: var(--ocm-bg-hover); }
    .oc2-slot.is-open  { opacity: .78; }
    .oc2-slot.is-risk  { background: #251a12; }
    .oc2-slot.is-risk:hover { background: #2c1f14; }
    /* per-member planning progress — a hairline under the row, not another bar */
    .oc2-slot::after {
      content: ''; position: absolute; left: 6px; bottom: 0; height: 1px;
      width: var(--oc2-prog, 0%); background: var(--oc2-prog-col, transparent);
      transition: width .3s;
    }

    .oc2-role { color: var(--ocm-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .oc2-w {
      text-align: right; font-size: 11px; color: var(--ocm-text-muted);
      font-variant-numeric: tabular-nums;
    }
    .oc2-w.w-high { color: var(--ocm-cpr-warn); font-weight: 600; }

    /* The verdict line: one plain-English sentence saying what's wrong with this OC.
       It replaces a row of coloured badges the reader had to decode. */
    .oc2-issue { font-size: 11px; margin: 2px 0 10px; line-height: 1.5; }

    .oc2-member { display: flex; align-items: center; gap: 5px; min-width: 0; }
    .oc2-member a { color: var(--ocm-text-card); text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .oc2-member a:hover { color: var(--ocm-link); }
    .oc2-open-label { color: var(--ocm-text-faint); font-style: italic; }
    .oc2-dot { width: 6px; height: 6px; border-radius: 50%; flex: 0 0 6px; background: var(--ocm-cpr-good); }
    .oc2-dot.is-blocked { background: var(--ocm-cpr-crit); }
    .oc2-dot.is-open    { background: #3a3f48; }

    .oc2-tags { display: flex; gap: 3px; align-items: center; justify-content: flex-end; }
    .oc2-tag {
      font-size: 9px; padding: 1px 4px; border-radius: 3px; text-decoration: none;
      white-space: nowrap; line-height: 1.5;
    }
    .oc2-tag.t-ok      { background: #14241a; color: var(--ocm-cpr-good); }
    .oc2-tag.t-armory  { background: #16202c; color: var(--ocm-link); }
    .oc2-tag.t-missing { background: #2a1618; color: var(--ocm-cpr-crit); }
    .oc2-tag.t-open    { background: #22262e; color: var(--ocm-text-faint); }
    .oc2-tag.t-ts      { background: #1e222a; }
    .oc2-tag.t-risk    { background: #2a2416; color: var(--ocm-cpr-warn); }

    .oc2-cpr {
      text-align: right; font-weight: 700; font-variant-numeric: tabular-nums;
      font-size: 11px; color: var(--ocm-text-faint);
    }
    .oc2-cpr.c-good { color: var(--ocm-cpr-good); }
    .oc2-cpr.c-warn { color: var(--ocm-cpr-warn); }
    .oc2-cpr.c-crit { color: var(--ocm-cpr-crit); }

    /* issue footer */
    .oc2-foot { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 8px; padding-top: 7px; border-top: 1px solid #23262c; }
    .oc2-issue { font-size: 9px; padding: 2px 6px; border-radius: 4px; white-space: nowrap; }
    .oc2-issue.i-crit { background: #2a1618; color: var(--ocm-cpr-crit); }
    .oc2-issue.i-warn { background: #2a2416; color: var(--ocm-cpr-warn); }
    .oc2-issue.i-ok   { background: #14241a; color: var(--ocm-cpr-good); }

    @media (max-width: 520px) {
      .oc2-slot { grid-template-columns: minmax(52px, 1fr) minmax(60px, 1fr) auto 34px; gap: 5px; }
      .oc2-time-sub { display: none; }
    }

    /* ── OC CARDS ─────────────────────────────────────────────────────── */
    .ocm-stuck-card, .ocm-card {
      background: var(--ocm-bg-card);
      border: 1px solid var(--ocm-border-soft);
      border-radius: 5px;
      overflow: hidden;
      transition: border-color .15s;
    }
    .ocm-stuck-card:hover, .ocm-card:hover {
      border-color: #3a3a3a;
    }
    .ocm-stuck-card-title, .ocm-card-title, .ocm-stuck-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 10px 2px;
      gap: 8px;
    }
    .ocm-stuck-card-title strong, .ocm-card-title strong {
      color: var(--ocm-text);
      font-size: 13px;
      font-weight: bold;
    }
    .ocm-card-subtitle {
      padding: 0 10px 4px;
      color: var(--ocm-text-muted);
      font-size: 11px;
    }
    .ocm-stuck-diff {
      background: #1a2030;
      border: 1px solid #2a4060;
      color: var(--ocm-link);
      padding: 2px 8px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: bold;
      letter-spacing: 0.05em;
    }
    .ocm-stuck-expiry { color: var(--ocm-text-muted); font-size: 11px; padding: 0 12px 6px; }

    /* ── SLOTS ────────────────────────────────────────────────────────── */
    .ocm-slots {
      display: flex;
      flex-direction: column;
    }
    .ocm-slot {
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      background: var(--ocm-bg);
      border-top: 1px solid var(--ocm-border-soft);
      font-size: 12px;
      flex-wrap: nowrap;
    }
    .ocm-slot:hover { background: var(--ocm-bg-card); }
    .ocm-slot-status { font-size: 11px; flex-shrink: 0; }
    .ocm-slot-role { color: var(--ocm-text-muted); font-size: 12px; flex-shrink: 0; min-width: 60px; }
    .ocm-slot-member {
      color: var(--ocm-text);
      font-size: 12px;
      flex: 1 1 auto;
      min-width: 50px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ocm-slot-cpr {
      font-weight: bold;
      font-size: 12px;
      text-align: right;
      flex-shrink: 0;
      min-width: 36px;
      margin-left: auto;
    }
    .ocm-slot-cpr.cpr-good { color: var(--ocm-cpr-good); }
    .ocm-slot-cpr.cpr-warn { color: var(--ocm-cpr-warn); }
    .ocm-slot-cpr.cpr-crit { color: var(--ocm-cpr-crit); }
    .ocm-slot-cpr.cpr-empty { color: var(--ocm-text-faint); }
    .ocm-slot-weight { color: var(--ocm-text-faint); font-size: 10px; flex-shrink: 0; }

    /* Smaller progress bar for mobile-friendly slot rows */
    .ocm-progress-wrap {
      width: 50px;
      height: 5px;
      background: var(--ocm-bg-hover);
      border-radius: 3px;
      overflow: hidden;
      flex-shrink: 0;
    }
    .ocm-progress-fill {
      height: 100%;
      background: #4a5a78;
      border-radius: 3px;
      transition: width .3s;
    }
    .ocm-progress-fill.cpr-good { background: #4a8a4a; }
    .ocm-progress-fill.cpr-warn { background: #8a7a3a; }
    .ocm-progress-fill.cpr-crit { background: #8a4a4a; }

    /* ── TS BADGE (TornStats CPR pill next to member name) ───────────── */
    .ocm-ts-badge {
      display: inline-block;
      background: #1a2028;
      border: 1px solid #2a3a4a;
      font-size: 9px;
      font-weight: bold;
      padding: 1px 5px;
      border-radius: 3px;
      letter-spacing: 0.02em;
      white-space: nowrap;
      flex-shrink: 0;
    }

    /* Item status badge — color-coded by availability so it's instantly readable */
    .ocm-item-tag {
      font-size: 10px;
      padding: 2px 5px;
      border-radius: 3px;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 2px;
      flex-shrink: 0;
      line-height: 1.2;
      transition: filter .15s;
    }
    .ocm-loan-btn {
      display: inline-block;
      background: #1c2a1c;
      border: 1px solid #3a5a3a;
      color: var(--ocm-cpr-good);
      font-size: 11px;
      font-weight: bold;
      padding: 3px 10px;
      border-radius: 4px;
      text-decoration: none;
      white-space: nowrap;
    }
    .ocm-loan-btn:hover { background: #24361f; filter: brightness(1.15); }
    /* Shown instead of Give when the armory has none of the item — the action is
       "go buy one", not "loan one", so it reads as neutral/blue rather than green. */
    .ocm-buy-btn {
      display: inline-block;
      background: #16202c;
      border: 1px solid #2f4a68;
      color: var(--ocm-link);
      font-size: 11px;
      font-weight: bold;
      padding: 3px 10px;
      border-radius: 4px;
      text-decoration: none;
      white-space: nowrap;
    }
    .ocm-buy-btn:hover { background: #1b2a3a; filter: brightness(1.15); }
    .ocm-return-btn {
      display: inline-block;
      background: #2a2416;
      border: 1px solid #5a4a2a;
      color: var(--ocm-cpr-warn);
      font-size: 11px;
      font-weight: bold;
      padding: 3px 10px;
      border-radius: 4px;
      text-decoration: none;
      white-space: nowrap;
    }
    .ocm-return-btn:hover { background: #362e1a; filter: brightness(1.15); }
    .ocm-item-tag:hover { filter: brightness(1.3); }
    .ocm-item-tag.item-ok {
      background: #14201a;
      border: 1px solid #2a4a32;
      color: var(--ocm-cpr-good);
    }
    .ocm-item-tag.item-armory {
      background: #14181e;
      border: 1px solid #2a3a4a;
      color: var(--ocm-link);
    }
    .ocm-item-tag.item-missing {
      background: #201410;
      border: 1px solid #4a2820;
      color: var(--ocm-cpr-crit);
    }
    .ocm-item-tag.item-unknown {
      background: #1c1810;
      border: 1px solid #3a3018;
      color: var(--ocm-cpr-warn);
    }

    /* ── MEMBER TABLES (Available, Recruits, Blocked, Low CPR) ───────── */

    /* Recruits notice — info banner above the recruits table */
    .ocm-recruits-notice {
      background: #1c1810;
      border: 1px solid #3a3018;
      border-radius: 4px;
      color: #c8a060;
      font-size: 11px;
      line-height: 1.5;
      padding: 8px 10px !important;
      margin: 8px 0;
    }
    .ocm-recruits-notice strong { color: #d8a060; }

    /* Card layout for Available members — mobile-first, prominent recommendation */
    .ocm-mcard-list {
      display: flex; flex-direction: column; gap: 10px; padding: 0;
    }
    .ocm-mcard {
      background: var(--ocm-bg-card); border: 1px solid var(--ocm-border);
      border-radius: 10px; padding: 14px 16px;
      transition: border-color .15s;
    }
    .ocm-mcard:hover { border-color: #3a3a3a; }
    .ocm-mcard-head {
      display: flex; align-items: baseline; justify-content: space-between;
      gap: 8px; margin-bottom: 10px;
    }
    .ocm-mcard-name {
      color: var(--ocm-text);
      font-weight: bold;
      font-size: 13px;
      text-decoration: none;
    }
    .ocm-mcard-name:hover { color: var(--ocm-text); }
    .ocm-mcard-seen {
      font-size: 11px;
      color: var(--ocm-text-muted);
      flex-shrink: 0;
    }
    .ocm-mcard-rec {
      background: var(--ocm-bg); border: 1px solid var(--ocm-border-soft);
      border-radius: 6px; padding: 9px 12px; margin-bottom: 8px;
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    }
    .ocm-mcard-meta {
      font-size: 11px; color: var(--ocm-text-muted);
      padding-top: 2px;
    }
    /* v5.2: .ocm-mh-table dropped from these shared selectors — the member/OC
       history search widgets it belonged to are gone (the Roster replaced them).
       .ocm-members-table and .ocm-analytics-table are still live, so the RULES
       stay; only the dead selector is removed. */
    .ocm-members-table, .ocm-blocked-row, .ocm-analytics-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .ocm-members-table th, .ocm-analytics-table th {
      background: var(--ocm-bg);
      color: var(--ocm-text-faint);
      font-size: 10px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      font-weight: bold;
      border-bottom: 1px solid #2a2a2a;
      padding: 6px 12px;
      text-align: left;
    }
    .ocm-members-table td, .ocm-analytics-table td {
      padding: 5px 12px;
      border-bottom: 1px solid var(--ocm-border-soft);
      color: var(--ocm-text);
    }
    .ocm-members-table tr:hover td,
    .ocm-analytics-table tr:hover td {
      background: var(--ocm-bg-card);
    }

    .ocm-blocked-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) minmax(0, 1.2fr) 88px;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      border-bottom: 1px solid var(--ocm-border-soft);
      font-size: 12px;
      min-width: 0;
      box-sizing: border-box;
      width: 100%;
    }
    .ocm-blocked-row:hover { background: var(--ocm-bg-card); }
    .ocm-blocked-name {
      color: var(--ocm-text);
      text-decoration: none;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }
    .ocm-blocked-name:hover { color: var(--ocm-text); }
    .ocm-blocked-status {
      font-size: 10px;
      color: var(--ocm-text-dim);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ocm-blocked-oc {
      color: var(--ocm-text-muted);
      font-size: 10px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ocm-blocked-timer {
      color: var(--ocm-text-dim);
      font-size: 10px;
      text-align: right;
      white-space: nowrap;
    }
    .ocm-blocked-timer.notimer { color: var(--ocm-text-faint); }

    /* Low CPR rows — different columns from blocked: member, OC, role, extras, CPR */
    .ocm-lowcpr-row {
      display: grid;
      grid-template-columns: minmax(80px, 1fr) minmax(0, 1.5fr) minmax(60px, 0.8fr) auto auto;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      border-bottom: 1px solid var(--ocm-border-soft);
      font-size: 12px;
    }
    .ocm-lowcpr-row:hover { background: var(--ocm-bg-card); }
    .ocm-lowcpr-name {
      color: var(--ocm-text);
      text-decoration: none;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ocm-lowcpr-oc {
      color: var(--ocm-text-muted);
      font-size: 11px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ocm-lowcpr-role {
      color: var(--ocm-text-muted);
      font-size: 11px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ocm-lowcpr-extras {
      display: flex;
      gap: 4px;
      align-items: center;
    }
    .ocm-lowcpr-cpr {
      text-align: right;
      min-width: 36px;
    }
    .ocm-blocked-reason { color: var(--ocm-cpr-crit); font-size: 11px; }

    /* ── TORNSTATS CPR SECTION ───────────────────────────────────────── */
    .ocm-tscpr-oc-block {
      margin: 8px 12px;
      background: var(--ocm-bg-card);
      border: 1px solid var(--ocm-border-soft);
      border-radius: 4px;
      overflow: hidden;
    }
    .ocm-tscpr-oc-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--ocm-bg-card);
      color: var(--ocm-text);
      font-size: 13px;
      font-weight: bold;
      cursor: pointer;
      user-select: none;
      transition: background .15s;
    }
    .ocm-tscpr-oc-header:hover { background: var(--ocm-bg-hover); }
    .ocm-tscpr-arrow {
      font-size: 9px;
      color: var(--ocm-text-faint);
      transition: transform .2s;
    }
    .ocm-tscpr-oc-header.collapsed .ocm-tscpr-arrow {
      transform: rotate(-90deg);
    }
    .ocm-tscpr-oc-body {
      border-top: 1px solid #2a2a2a;
      overflow-x: auto;
    }
    .ocm-tscpr-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      table-layout: auto;
    }
    .ocm-tscpr-table th {
      background: var(--ocm-bg);
      color: var(--ocm-text-faint);
      font-size: 9px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      font-weight: bold;
      border-bottom: 1px solid #2a2a2a;
      padding: 5px 6px;
      text-align: right;
      white-space: nowrap;
    }
    .ocm-tscpr-table th:first-child { text-align: left; }
    .ocm-tscpr-table td {
      padding: 3px 6px;
      border-bottom: 1px solid var(--ocm-border-soft);
      color: var(--ocm-text);
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .ocm-tscpr-table td:first-child {
      text-align: left;
      color: var(--ocm-text-card);
      white-space: nowrap;
      max-width: 120px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ocm-tscpr-table tr:hover td { background: var(--ocm-bg-card); }

    /* Difficulty badge inside TS CPR header */
    .ocm-tscpr-oc-header span[style*="7a9acc"] {
      background: #1a2030 !important;
      border: 1px solid #2a4060;
      color: var(--ocm-link) !important;
      padding: 1px 6px;
      border-radius: 3px;
      font-weight: bold !important;
      letter-spacing: 0.04em;
    }

    .ocm-chart-wrap {
      background: var(--ocm-bg-card);
      border: 1px solid var(--ocm-border-soft);
      border-radius: 4px;
      padding: 8px;
      margin: 8px 12px;
    }

    /* ── HEATMAP / TIMER / SPINNER ────────────────────────────────────── */
    .ocm-heatmap td {
      padding: 4px 6px;
      font-size: 11px;
      color: var(--ocm-text);
      border: 1px solid #232323;
    }
    .ocm-timer { font-family: monospace; color: var(--ocm-text-dim); }
    .ocm-spinner { color: var(--ocm-text-faint); font-size: 12px; padding: 14px; text-align: center; }
    .ocm-error {
      background: #201818;
      border: 1px solid #4a2828;
      color: var(--ocm-cpr-crit);
      padding: 10px 14px;
      margin: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
    }
    .ocm-empty-phase { color: var(--ocm-text-faint); padding: 12px 14px; font-size: 12px; }

    /* ── DOWNLOADS ────────────────────────────────────────────────────── */
    .ocm-downloads-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 6px;
      padding: 8px 12px;
    }
    .ocm-dl-btn {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: #1a2518;
      border: 1px solid #3a5030;
      border-radius: 4px;
      color: var(--ocm-cpr-good);
      font-size: 12px;
      cursor: pointer;
      transition: background .15s;
    }
    .ocm-dl-btn:hover { background: #20301e; border-color: #4a6040; }
    .ocm-dl-btn strong { color: var(--ocm-cpr-good); }
    .ocm-dl-btn span { color: var(--ocm-text-faint); font-size: 10px; }

    /* ── FOOTER ───────────────────────────────────────────────────────── */
    #ocm-footer, .ocm-footer {
      padding: 8px 14px;
      background: var(--ocm-bg);
      border-top: 1px solid #252525;
      color: var(--ocm-text-faint);
      font-size: 11px;
      text-align: center;
    }

    /* ── CPR TEXT COLOR CLASSES ───────────────────────────────────────── */
    .cpr-good { color: var(--ocm-cpr-good); }
    .cpr-warn { color: var(--ocm-cpr-warn); }
    .cpr-crit { color: var(--ocm-cpr-crit); }
    /* Shape prefixes — empty by default, set to ✓/⚠/✗ by accessibility themes */
    .cpr-good::before { content: var(--ocm-shape-good); }
    .cpr-warn::before { content: var(--ocm-shape-warn); }
    .cpr-crit::before { content: var(--ocm-shape-crit); }
    .cpr-empty { color: var(--ocm-text-faint); }


    /* ── KEY/STATUS LABELS ────────────────────────────────────────────── */
    .ocm-key-status {
      font-size: 11px;
      color: var(--ocm-cpr-good);
    }
    .ocm-key-status.bad { color: var(--ocm-cpr-crit); }
    .ocm-last-update { font-size: 11px; color: var(--ocm-text-muted); }

    /* ── BADGE / PILL UTILITY ─────────────────────────────────────────── */
    .ocm-badge {
      display: inline-block;
      background: #1a2030;
      border: 1px solid #2a4060;
      color: var(--ocm-link);
      padding: 1px 6px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: bold;
      letter-spacing: 0.04em;
    }

    /* ═══ v5.2 SHARED PRIMITIVES ═══════════════════════════════════════════
       Added at the END of the stylesheet deliberately: source order decides
       ties, so nothing above can silently override these. Every selector here
       was grepped first and is unique — the outcome sparkline is
       .ocm-run-spark, NOT .ocm-spark, which v4.4's activity bars already own.
       Colours are existing theme vars only, so the AA contrast guarantees hold. */

    /* ── PANEL: sectioned card with an uppercase icon title ───────────── */
    .ocm-panel {
      background: var(--ocm-bg-card);
      border: 1px solid var(--ocm-border);
      border-radius: 10px;
      padding: var(--ocm-pad-card) 14px;
      margin-bottom: var(--ocm-gap-3);
    }
    .ocm-panel-title {
      display: flex; align-items: center; gap: var(--ocm-gap-2);
      font-size: 12px; font-weight: 700; color: var(--ocm-link);
      text-transform: uppercase; letter-spacing: .06em;
      margin: 0 0 10px;
    }
    .ocm-panel-title .ocm-panel-sub {
      margin-left: auto; font-size: 10px; font-weight: 400;
      color: var(--ocm-text-muted); text-transform: none; letter-spacing: 0;
    }

    /* ── STAT ROW: icon + label left, value hard-right ────────────────── */
    .ocm-statrow {
      display: flex; align-items: center; gap: 10px;
      padding: 7px 2px;
      border-bottom: 1px solid var(--ocm-border-soft);
      font-size: 12px;
    }
    .ocm-statrow:last-child { border-bottom: none; }
    .ocm-statrow .k { color: var(--ocm-text-dim); flex: 1; min-width: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ocm-statrow .v {
      font-size: 14px; font-weight: 700; color: var(--ocm-text);
      font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap;
    }
    .ocm-statrow .ico { flex: 0 0 auto; font-size: 13px; line-height: 1; }

    /* ── AVATAR: monogram underneath, real picture revealed on load ─────
       Profile images run to 3.3 MB (animated GIFs), so the initials paint
       instantly and the <img> fades in only once it has decoded. onerror
       simply leaves the monogram showing. */
    .ocm-avatar {
      position: relative; flex: 0 0 auto;
      width: 64px; height: 64px; border-radius: 10px; overflow: hidden;
      border: 1px solid var(--ocm-border);
    }
    .ocm-avatar .ocm-mono {
      position: absolute; inset: 0;
      display: flex; align-items: center; justify-content: center;
      font-size: 24px; font-weight: 700; color: #fff;
      letter-spacing: .02em; text-shadow: 0 1px 2px rgba(0,0,0,.45);
      user-select: none;
    }
    .ocm-avatar img {
      position: absolute; inset: 0; width: 100%; height: 100%;
      object-fit: cover; opacity: 0; transition: opacity .18s;
    }
    .ocm-avatar img.is-loaded { opacity: 1; }
    .ocm-avatar.sm { width: 34px; height: 34px; border-radius: 7px; }
    .ocm-avatar.sm .ocm-mono { font-size: 13px; }

    /* ── SORTABLE DATA TABLE ──────────────────────────────────────────── */
    .ocm-datatable { width: 100%; border-collapse: collapse; font-size: 12px; }
    .ocm-datatable thead th {
      font-size: 9px; text-transform: uppercase; letter-spacing: .07em;
      font-weight: 700; color: var(--ocm-text-muted); text-align: left;
      padding: 6px 8px; border-bottom: 1px solid #2a2e36;
      white-space: nowrap; position: sticky; top: 0; background: var(--ocm-bg-card);
    }
    .ocm-datatable thead th.sortable { cursor: pointer; user-select: none; }
    .ocm-datatable thead th.sortable:hover { color: var(--ocm-link); }
    .ocm-datatable thead th[aria-sort]::after {
      content: '▾'; font-size: 8px; margin-left: 4px; color: var(--ocm-link);
      display: inline-block;
    }
    .ocm-datatable thead th[aria-sort="ascending"]::after { transform: rotate(180deg); }
    .ocm-datatable tbody td {
      padding: 7px 8px; color: var(--ocm-text-dim);
      border-bottom: 1px solid #242424;
      font-variant-numeric: tabular-nums;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .ocm-datatable tbody td.num { text-align: right; }
    .ocm-datatable tbody td:first-child { color: var(--ocm-text); font-weight: 600; }
    .ocm-datatable tbody tr:last-child td { border-bottom: none; }
    .ocm-datatable tbody tr:nth-child(4n+1) td { background: #1b1e24; }
    .ocm-datatable tbody tr:hover td { background: var(--ocm-bg-hover); }
    .ocm-datatable tbody tr.clickable { cursor: pointer; }
    .ocm-datatable a { color: var(--ocm-link); text-decoration: none; font-weight: 600; }
    .ocm-datatable a:hover { text-decoration: underline; }

    /* ── SEGMENTED CONTROL ────────────────────────────────────────────── */
    .ocm-seg { display: inline-flex; border: 1px solid var(--ocm-border);
      border-radius: 6px; overflow: hidden; }
    .ocm-seg button {
      background: none; border: none; border-right: 1px solid var(--ocm-border);
      color: var(--ocm-text-muted); font-size: 11px; padding: 5px 12px;
      cursor: pointer; font-family: inherit; transition: color .15s, background .15s;
    }
    .ocm-seg button:last-child { border-right: none; }
    .ocm-seg button:hover { color: var(--ocm-text-dim); }
    .ocm-seg button.active { background: #16202c; color: var(--ocm-text); font-weight: 600; }

    /* ── FILTER CHIP ──────────────────────────────────────────────────── */
    .ocm-chip-filter {
      background: none; border: 1px solid var(--ocm-border); border-radius: 6px;
      color: var(--ocm-text-muted); font-size: 11px; padding: 4px 11px;
      cursor: pointer; font-family: inherit; transition: color .15s, border-color .15s;
    }
    .ocm-chip-filter:hover { color: var(--ocm-text-dim); border-color: #3a3a3a; }
    .ocm-chip-filter.active { color: var(--ocm-text); border-color: var(--ocm-link); background: #16202c; }

    /* ── KPI TILE (class form of the inline kpiTile() helper) ─────────── */
    .ocm-kpi-tile {
      flex: 1; min-width: 108px;
      background: var(--ocm-bg-card); border: 1px solid var(--ocm-border-soft);
      border-radius: 8px; padding: 10px 14px;
    }
    .ocm-kpi-tile .l {
      font-size: 9px; color: var(--ocm-text-muted);
      text-transform: uppercase; letter-spacing: .06em;
    }
    .ocm-kpi-tile .v {
      font-size: 20px; font-weight: 700; line-height: 1.15; margin-top: 2px;
      color: var(--ocm-text); font-variant-numeric: tabular-nums;
    }
    .ocm-kpi-tile .s { font-size: 10px; color: var(--ocm-text-muted); }

    /* ── OUTCOME SPARKLINE (last-N run results) ───────────────────────── */
    .ocm-run-spark { display: inline-flex; gap: 2px; align-items: center; }
    .ocm-run-spark i {
      display: inline-block; width: 6px; height: 6px; border-radius: 50%;
      background: var(--ocm-border);
    }
    .ocm-run-spark i.s { background: var(--ocm-cpr-good); }
    .ocm-run-spark i.f { background: var(--ocm-cpr-crit); }
    .ocm-run-spark i.e { background: var(--ocm-text-faint); }

    /* ── PROVENANCE DOT: observed fact vs third-party estimate ────────── */
    .ocm-prov-dot {
      display: inline-block; width: 5px; height: 5px; border-radius: 50%;
      margin-left: 5px; vertical-align: middle;
    }
    .ocm-prov-dot.obs { background: var(--ocm-cpr-good); }
    .ocm-prov-dot.est { background: none; box-shadow: inset 0 0 0 1px var(--ocm-text-muted); }

    /* ── DRILL-DOWN BACK BAR ──────────────────────────────────────────── */
    .ocm-backbar {
      display: flex; align-items: center; gap: var(--ocm-gap-2);
      margin-bottom: var(--ocm-gap-3);
    }
    .ocm-backbar button {
      background: none; border: 1px solid var(--ocm-border); border-radius: 6px;
      color: var(--ocm-text-muted); font-size: 11px; padding: 5px 12px;
      cursor: pointer; font-family: inherit;
    }
    .ocm-backbar button:hover { color: var(--ocm-link); border-color: var(--ocm-link); }

    /* ── MEMBER PROFILE visibility ────────────────────────────────────────
       Same mechanism as member mode: one root class hides the entire leader
       shell. Keeps the drill-down out of the tab system entirely, so it can be
       opened from any pane without switching tabs or duplicating the view. */
    #ocm-member-profile { display: none; }
    #ocm-root.ocm-profile-open #ocm-member-profile { display: block; }
    #ocm-root.ocm-profile-open .ocm-tabs,
    #ocm-root.ocm-profile-open .ocm-tab-pane { display: none !important; }
    /* Member mode never shows the profile — it has no roster and no archive. */
    #ocm-root.ocm-member-mode #ocm-member-profile { display: none !important; }

    /* ── MEMBER PROFILE identity card ─────────────────────────────────── */
    .ocm-mp-id { display: flex; gap: 14px; align-items: flex-start; }
    .ocm-mp-idmain { flex: 1; min-width: 0; }
    .ocm-mp-name {
      font-size: 18px; font-weight: 700; color: var(--ocm-text);
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    }
    .ocm-mp-meta { font-size: 11px; color: var(--ocm-text-muted); margin-top: 3px; }
    .ocm-mp-meta a { color: var(--ocm-link); text-decoration: none; }
    .ocm-mp-strip {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
      gap: var(--ocm-gap-2); margin-top: 10px;
    }
    .ocm-mp-strip > div {
      background: var(--ocm-bg); border: 1px solid var(--ocm-border-soft);
      border-radius: 6px; padding: 6px 9px;
    }
    .ocm-mp-strip .l {
      font-size: 9px; text-transform: uppercase; letter-spacing: .06em;
      color: var(--ocm-text-muted);
    }
    .ocm-mp-strip .v { font-size: 12px; color: var(--ocm-text); margin-top: 1px; }
    .ocm-mp-verdict {
      margin-top: 10px; font-size: 12px; color: var(--ocm-text-dim);
      line-height: 1.5;
    }
    /* ═══ v5.3 — ROSTER FACES + MERGED CRIMES VIEW ═══════════════════════════
       At the END of the stylesheet like the v5.2 primitives: source order breaks
       ties, so nothing above can silently win. Every selector here was grepped
       for duplicates first. */

    /* Dense-table avatar. Deliberately small: one avatar in a real faction is a
       3.3MB animated GIF, so a roster of them only stays cheap because they're
       28px, lazy, and the monogram underneath paints first regardless. */
    .ocm-avatar.xs { width: 28px; height: 28px; border-radius: 6px; }
    .ocm-avatar.xs .ocm-mono { font-size: 11px; }

    /* Roster name cell — avatar and name share one baseline. */
    .ocm-rosname { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .ocm-rosname .n { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ocm-rosname .ex {
      flex: 0 0 auto; font-size: 9px; font-weight: 400; padding: 1px 5px;
      border-radius: 3px; background: #22262e; color: var(--ocm-text-faint);
    }
    .ocm-roster tbody td { padding-top: 5px; padding-bottom: 5px; }
    /* Table cells align on the BASELINE by default, and a flex container takes its
       baseline from its first item — here the 28px avatar, which has no text
       baseline, so it contributes its bottom edge. That dropped every rank number
       ~12px below its own row's name. Centring the cells fixes the whole row. */
    .ocm-roster tbody td, .ocm-roster thead th { vertical-align: middle; }

    /* The rank cell is now :first-child, which .ocm-datatable tbody td:first-child
       styles bright + 600. That rule is (0,2,1); these are (0,2,2), so they win on
       SPECIFICITY rather than on source order — a reorder can't flip them. */
    .ocm-datatable tbody td.ocm-rank {
      color: var(--ocm-text-faint); font-weight: 400; width: 30px;
    }
    .ocm-datatable tbody td.ocm-rank.top { color: var(--ocm-cpr-warn); font-weight: 700; }
    /* …and the emphasis moves to the player name, which is now the second cell. */
    .ocm-roster tbody td:nth-child(2) { color: var(--ocm-text); font-weight: 600; }

    /* Crew chips inside an expanded crime — each drills through to the profile. */
    .ocm-crewchip {
      display: inline-block; margin: 1px 3px 1px 0; padding: 1px 7px;
      border-radius: 4px; background: #22262e; color: var(--ocm-text-dim);
      font-size: 11px; cursor: pointer; white-space: nowrap;
    }
    .ocm-crewchip:hover { background: #2c313a; color: var(--ocm-link); }

    /* ═══ v5.3 NAVIGATION RAIL ═══════════════════════════════════════════════
       Everything here is scoped under #ocm-root, giving it (1,1,0) specificity —
       it beats the original (0,1,0) horizontal-tab rules on SPECIFICITY, not on
       source order. v3.35 and v5.2 both shipped rules that won a tie by luck of
       ordering and would have silently reverted on any reshuffle.

       WHY A GRID: the suite is injected into Torn's ~990px content column, so a
       Frostbite-style 290px sidebar would leave ~700px and force a horizontal
       scrollbar onto every wide table (.ocm-war-deep alone declares min-width
       830px). A 56px rail costs almost nothing, and the expanded state OVERFLOWS
       its fixed track instead of widening it — content never reflows on hover. */
    #ocm-root #ocm-body {
      display: grid;
      grid-template-columns: 56px minmax(0, 1fr);
      column-gap: 14px;
      align-items: start;
    }
    /* Everything that isn't the rail lives in column 2 and stacks normally. */
    #ocm-root #ocm-body > *:not(.ocm-tabs) { grid-column: 2; }

    #ocm-root .ocm-tabs {
      grid-column: 1; grid-row: 1 / -1;
      position: sticky; top: 8px;
      display: flex; flex-direction: column; gap: 2px;
      width: 56px; padding: 6px; margin: 0;
      box-sizing: border-box;
      background: var(--ocm-bg-card);
      border: 1px solid var(--ocm-border); border-radius: 10px;
      overflow: visible; z-index: 20;
      transition: width .14s ease, box-shadow .14s ease;
    }
    /* Expanding overflows the 56px track — the grid does NOT resize. */
    #ocm-root .ocm-tabs:hover,
    #ocm-root.ocm-rail-pinned .ocm-tabs {
      width: 190px;
      box-shadow: 0 8px 28px rgba(0,0,0,.55);
    }

    #ocm-root .ocm-tab {
      position: relative;
      display: flex; align-items: center; gap: 10px;
      padding: 9px 7px; margin: 0;
      border: none; border-bottom: none; border-radius: 8px;
      font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden;
      color: var(--ocm-text-muted); cursor: pointer;
      transition: background .12s, color .12s;
    }
    #ocm-root .ocm-tab:hover { background: var(--ocm-bg-hover); color: var(--ocm-text-dim); }
    #ocm-root .ocm-tab.active {
      background: #16202c; color: var(--ocm-text);
      box-shadow: inset 2px 0 0 var(--ocm-link);
    }
    .ocm-tab-ico { flex: 0 0 26px; font-size: 15px; line-height: 1; text-align: center; }
    /* Faded rather than removed, so expanding is a cross-fade and not a jump. */
    .ocm-tab-lbl { flex: 1 1 auto; opacity: 0; transition: opacity .12s ease; }
    #ocm-root .ocm-tabs:hover .ocm-tab-lbl,
    #ocm-root.ocm-rail-pinned .ocm-tab-lbl { opacity: 1; }

    /* Collapsed, the badge is a corner dot ON the icon — a count you can't see
       is not a badge. Expanded, it moves to the right edge of the row. */
    #ocm-root .ocm-tab-count {
      position: absolute; top: 3px; left: 27px;
      min-width: 15px; padding: 0 4px; margin: 0;
      border-radius: 8px; font-size: 9px; line-height: 15px;
      text-align: center; font-weight: 700;
    }
    #ocm-root .ocm-tabs:hover .ocm-tab-count,
    #ocm-root.ocm-rail-pinned .ocm-tab-count {
      position: static; margin-left: auto;
    }

    .ocm-rail-pin {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 7px; margin-top: 4px;
      border-top: 1px solid var(--ocm-border-soft); border-radius: 0 0 6px 6px;
      font-size: 11px; color: var(--ocm-text-faint); cursor: pointer;
      white-space: nowrap; overflow: hidden;
    }
    .ocm-rail-pin:hover { color: var(--ocm-link); }
    .ocm-rail-pin.active { color: var(--ocm-cpr-warn); }

    /* Member mode and the profile drill-down both hide the rail — collapse its
       track too, or the content sits 70px inset against an empty gutter. */
    #ocm-root.ocm-member-mode #ocm-body,
    #ocm-root.ocm-profile-open #ocm-body {
      grid-template-columns: 0 minmax(0, 1fr); column-gap: 0;
    }

    /* ── DASHBOARD ───────────────────────────────────────────────────────── */
    .ocm-dash-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
      gap: var(--ocm-gap-3); margin-bottom: var(--ocm-gap-3);
    }
    .ocm-dash-card {
      background: var(--ocm-bg-card); border: 1px solid var(--ocm-border);
      border-radius: 10px; padding: 12px 14px;
    }
    .ocm-dash-card.attn { border-color: var(--ocm-cpr-crit); }
    .ocm-dash-card.warn { border-color: var(--ocm-cpr-warn); }
    .ocm-dash-h {
      display: flex; align-items: center; gap: 8px; margin-bottom: 8px;
      font-size: 11px; font-weight: 700; text-transform: uppercase;
      letter-spacing: .06em; color: var(--ocm-link);
    }
    .ocm-dash-h .n {
      margin-left: auto; font-size: 17px; font-weight: 700; color: var(--ocm-text);
      font-variant-numeric: tabular-nums;
    }
    .ocm-dash-card.attn .ocm-dash-h .n { color: var(--ocm-cpr-crit); }
    .ocm-dash-card.warn .ocm-dash-h .n { color: var(--ocm-cpr-warn); }
    .ocm-dash-line {
      display: flex; align-items: center; gap: 7px;
      padding: 4px 0; font-size: 12px; color: var(--ocm-text-dim);
      border-bottom: 1px solid var(--ocm-border-soft);
    }
    .ocm-dash-line:last-child { border-bottom: none; }
    .ocm-dash-line .r { margin-left: auto; white-space: nowrap; color: var(--ocm-text-muted); }
    .ocm-dash-go {
      display: inline-block; margin-top: 8px; font-size: 11px;
      color: var(--ocm-link); cursor: pointer; background: none; border: none;
      padding: 0; font-family: inherit;
    }
    .ocm-dash-go:hover { text-decoration: underline; }
    .ocm-dash-ok { font-size: 12px; color: var(--ocm-cpr-good); padding: 4px 0; }

    /* TornPDA and narrow desktop: a vertical rail costs too much of a small
       screen, so it reverts to the horizontal strip it has always been. */
    @media (max-width: 700px) {
      #ocm-root #ocm-body { grid-template-columns: minmax(0, 1fr); column-gap: 0; }
      #ocm-root #ocm-body > *:not(.ocm-tabs) { grid-column: 1; }
      #ocm-root .ocm-tabs {
        grid-column: 1; grid-row: auto; position: static;
        flex-direction: row; flex-wrap: wrap; width: auto;
        margin-bottom: var(--ocm-gap-3);
      }
      #ocm-root .ocm-tabs:hover { width: auto; box-shadow: none; }
      #ocm-root .ocm-tab-lbl { opacity: 1; }
      #ocm-root .ocm-tab-count { position: static; margin-left: 5px; }
      .ocm-rail-pin { display: none; }   /* nothing to pin when it never collapses */
    }

    /* Under 600px (TornPDA) the identity card stacks and the tables scroll
       in their own container rather than forcing the page sideways. */
    @media (max-width: 600px) {
      .ocm-mp-id { flex-direction: column; }
      .ocm-tablewrap { overflow-x: auto; }
    }
  `);

  // ─── UTILITIES ───────────────────────────────────────────────────────────────

  /**
   * Escape a string for safe insertion into innerHTML. Player names and OC names
   * come from the Torn API and may contain &, <, >, ", ' — without escaping these
   * break the markup (e.g. an OC name with "&") or could inject HTML. Use this on
   * any API-sourced text interpolated into an innerHTML template.
   */
  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ─── SHARED FORMATTERS / HELPERS (hoisted from section renderers) ────────────
  /** Compact money: $1.23b / $4.56m / $7.8k / $12 (negative-safe). */
  function fmtMoney(n) {
    const v = Math.round(Number(n) || 0);
    const sign = v < 0 ? '-' : '';
    const a = Math.abs(v);
    if (a >= 1e9) return sign + '$' + (a / 1e9).toFixed(2) + 'b';
    if (a >= 1e6) return sign + '$' + (a / 1e6).toFixed(2) + 'm';
    if (a >= 1e3) return sign + '$' + (a / 1e3).toFixed(1) + 'k';
    return sign + '$' + a.toLocaleString();
  }
  /** Semantic colour for a net figure. */
  const netColor = v => v > 0 ? 'var(--ocm-cpr-good)' : v < 0 ? 'var(--ocm-cpr-crit)' : 'var(--ocm-text)';
  /** Cost shown as a negative money figure, or an em-dash for zero. */
  const negCost = c => c ? '−' + fmtMoney(c).replace('-', '') : '—';
  /** Normalise an OC status string to successful/failure/expired (else null). */
  function normOcStatus(raw) {
    const s = (raw || '').toLowerCase().trim();
    if (s === 'successful' || s === 'success') return 'successful';
    if (s === 'failure' || s === 'failed' || s === 'fail') return 'failure';
    if (s === 'expired' || s === 'expire') return 'expired';
    return null;
  }
  /** Short "in Xh Ym" ETA from a unix ts (or now / em-dash). */
  function fmtEta(ts) {
    if (!ts) return '—';
    const diff = ts * 1000 - Date.now();
    if (diff <= 0) return 'now';
    const h = Math.floor(diff / 3.6e6), m = Math.floor((diff % 3.6e6) / 6e4);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
  /** Short UTC date (Jul 4) from a unix ts. */
  const dateStr = ts => ts ? new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '—';
  /** Item-market deep link for an item id. */
  const marketUrlOf = id => `https://www.torn.com/page.php?sid=ItemMarket#/market/view=search&itemID=${id}`;
  /**
   * KPI tile — the single most-repeated component in the suite (56 call sites).
   *
   * v5.3: this used to emit a wall of inline styles while `.ocm-kpi-tile` sat in
   * the stylesheet essentially unused, so every KPI row was pinned to whatever
   * the helper hardcoded and drifted from the shared card language. Now the base
   * look comes from the class and only the SEMANTIC overrides stay inline —
   * `color` and `border` carry meaning (good / warn / crit), so they're a real
   * argument rather than styling that should have been a class.
   *
   * The signature is unchanged, so all 56 call sites keep working untouched.
   * Visible effect: tiles pick up tabular figures, so numbers line up down a row.
   */
  const kpiTile = (label, value, sub, color, border) => `
      <div class="ocm-kpi-tile"${border ? ` style="border-color:${border}"` : ''}>
        <div class="l">${label}</div>
        <div class="v"${color ? ` style="color:${color}"` : ''}>${value}</div>
        <div class="s">${sub}</div></div>`;

  // ─── v5.2 SHARED UI PRIMITIVES ─────────────────────────────────────────────
  // Declared with `function` (not const) so hoisting makes them safe to call
  // from anywhere in the IIFE — the temporal-dead-zone bug that blanked the
  // whole Money tab in v3.33 came from a `const` used above its definition.

  /** Stable tile colour derived from the uid — a member always gets the same one.
   *  Saturation/lightness are FIXED so every generated colour lands in the same
   *  readable band; white initials stay legible on all of them rather than
   *  depending on a contrast lottery. */
  function ocmMonoColor(uid) {
    const s = String(uid ?? '');
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return `hsl(${h % 360},42%,34%)`;
  }

  /** Initials for the monogram: "iSatomi" → IS · "ST4TIC" → ST · "" → ? */
  function ocmInitials(name) {
    const n = String(name || '').trim();
    if (!n) return '?';
    const parts = n.split(/[\s_\-.]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  }

  /**
   * Avatar tile. The monogram paints IMMEDIATELY and the real picture fades in
   * only once it has decoded — profile images run to 3.3 MB (animated GIFs are
   * allowed), so waiting on the download would leave a hole in the panel.
   * `onerror` removes the img and the monogram simply stays. Both handlers are
   * inline, matching how the armoury/loadout renderers already do it.
   */
  function ocmAvatarHtml(uid, name, url, cls = '') {
    const mono = `<span class="ocm-mono" style="background:${ocmMonoColor(uid)}">${esc(ocmInitials(name))}</span>`;
    const img = url
      ? `<img src="${esc(url)}" alt="" loading="lazy" onload="this.classList.add('is-loaded')" onerror="this.remove()">`
      : '';
    return `<span class="ocm-avatar ${esc(cls)}">${mono}${img}</span>`;
  }

  /**
   * Click-to-sort wiring for a .ocm-datatable, replacing the bespoke sort code
   * each table used to carry its own copy of.
   *
   * @param table   the <table> (must have a thead row)
   * @param rows    backing data array — sorted IN PLACE
   * @param cols    column defs parallel to the header cells:
   *                [{ key, get, num }] — a null/absent key marks a column
   *                unsortable (e.g. an actions column)
   * @param render  (rows) => void — repaints tbody from the sorted array
   * @param initial { key, dir } starting sort
   * @returns { sort(key, dir) } so callers can drive it programmatically
   */
  function ocmSortTable(table, rows, cols, render, initial) {
    if (!table || !table.tHead || !table.tHead.rows.length) return { sort() {} };
    const head = table.tHead.rows[0];
    let key = initial && initial.key != null ? initial.key : null;
    let dir = initial && initial.dir ? initial.dir : 'desc';

    const apply = () => {
      const col = cols.find(c => c && c.key === key);
      if (col) {
        rows.sort((a, b) => {
          const av = col.get(a), bv = col.get(b);
          // Nulls always sort last, whichever direction — "no data" is not a
          // value that should win a ranking.
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          const c = col.num
            ? (Number(av) || 0) - (Number(bv) || 0)
            : String(av).localeCompare(String(bv));
          return dir === 'asc' ? c : -c;
        });
      }
      for (const th of head.cells) th.removeAttribute('aria-sort');
      const idx = cols.findIndex(c => c && c.key === key);
      if (idx >= 0 && head.cells[idx]) {
        head.cells[idx].setAttribute('aria-sort', dir === 'asc' ? 'ascending' : 'descending');
      }
      render(rows);
    };

    [...head.cells].forEach((th, i) => {
      const col = cols[i];
      if (!col || col.key == null) return;
      th.classList.add('sortable');
      th.addEventListener('click', () => {
        if (key === col.key) dir = dir === 'asc' ? 'desc' : 'asc';
        else { key = col.key; dir = col.num ? 'desc' : 'asc'; }   // numbers open big-first
        apply();
      });
    });

    apply();
    return { sort: (k, d) => { key = k; dir = d || 'desc'; apply(); } };
  }

  /**
   * Resolve a player name for a user id. The OC-slots and temporary(loan) API
   * payloads frequently carry only an id (no name), which is why raw slot names
   * can't be trusted — hence the roster lookup. Order: explicit name from the
   * payload → faction roster → ex-member cache → "#id" as a last resort.
   */
  function resolveMemberName(uid, names = {}, explicit = null) {
    if (explicit) return explicit;
    const key = String(uid ?? '');
    return names[key] || (key ? `#${key}` : 'Unknown');
  }


  /**
   * Show a brief non-blocking toast notification. Replaces alert() — alert is
   * blocking and especially disruptive on TornPDA mobile. Auto-dismisses.
   * @param {string} msg   message text (supports \n)
   * @param {string} type  'ok' | 'warn' | 'crit' — controls accent colour
   */
  function ocmToast(msg, type = 'ok') {
    let host = document.getElementById('ocm-toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'ocm-toast-host';
      host.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:2147483647;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none';
      document.body.appendChild(host);
    }
    const accent = type === 'crit' ? '#bf7a7a' : type === 'warn' ? '#bf9f5a' : '#7abf7a';
    const t = document.createElement('div');
    t.style.cssText = `background:var(--ocm-bg-card);border:1px solid ${accent};border-left:3px solid ${accent};border-radius:6px;color:var(--ocm-text);font:13px/1.45 Arial,sans-serif;padding:10px 16px;max-width:360px;white-space:pre-line;box-shadow:0 4px 16px rgba(0,0,0,.5);opacity:0;transform:translateY(8px);transition:opacity .2s,transform .2s;pointer-events:auto`;
    t.textContent = msg;
    host.appendChild(t);
    // rAF can be paused on TornPDA in some states; fall back to a microtask delay.
    const reveal = () => { t.style.opacity = '1'; t.style.transform = 'translateY(0)'; };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(reveal);
    else setTimeout(reveal, 16);
    setTimeout(() => {
      t.style.opacity = '0'; t.style.transform = 'translateY(8px)';
      setTimeout(() => t.remove(), 250);
    }, 3800);
  }

  /** Format a duration in seconds to a human-readable string. */
  function fmtTime(seconds) {
    if (seconds <= 0) return '0s';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (d > 0) return `${d}d ${String(h).padStart(2,'0')}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
    if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
    return `${m}m ${String(s).padStart(2,'0')}s`;
  }

  /** Returns a live countdown string for a future unix timestamp. */
  function fmtCountdown(untilTs) {
    const diff = Math.max(0, untilTs - Math.floor(Date.now() / 1000));
    return fmtTime(diff);
  }

  /** Returns the CSS class for a CPR value based on configured thresholds. */
  function cprClass(cpr) {
    if (cpr === null) return 'cpr-empty';
    if (cpr >= CPR_WARN) return 'cpr-good';
    if (cpr >= CPR_CRIT) return 'cpr-warn';
    return 'cpr-crit';
  }

  /**
   * Returns an HTML span with the appropriate status icon.
   * Now distinguishes 'abroad' (🌍 + country flag) from 'traveling' (✈ direction).
   * Country flag is resolved from the description field via COUNTRY_FLAGS.
   */
  function statusIcon(status, description) {
    if (!status) return `<span class="ocm-slot-status status-unknown">?</span>`;
    const s = status.toLowerCase();
    if (s === 'okay') {
      return `<span class="ocm-slot-status status-ok" title="Okay">✓</span>`;
    }
    if (s === 'hospital') {
      return `<span class="ocm-slot-status status-hospital" title="Hospital">🏥</span>`;
    }
    if (s === 'jail') {
      return `<span class="ocm-slot-status status-jail" title="Jail">⛓</span>`;
    }
    if (s === 'traveling') {
      // Traveling = in transit (plane is in the air)
      const desc      = (description || '').toLowerCase();
      const returning = desc.includes('returning');
      const tip       = description || 'Traveling';
      const arrow     = returning ? '✈→🏠' : '🏠→✈';
      return `<span class="ocm-slot-status status-travel" title="${tip}">${arrow}</span>`;
    }
    if (s === 'abroad') {
      // Abroad = already at destination — show country flag
      const flag = flagFromDescription(description);
      const tip  = description || 'Abroad';
      return `<span class="ocm-slot-status status-abroad" title="${tip}">${flag}</span>`;
    }
    return `<span class="ocm-slot-status status-unknown" title="${status}">?</span>`;
  }

  /**
   * Returns true if a member's status prevents them from participating in OC initiation.
   * Traveling and abroad are both blocking.
   */
  function isBlocked(status) {
    if (!status) return false;
    const s = status.toLowerCase();
    return s === 'hospital' || s === 'jail' || s === 'traveling' || s === 'abroad';
  }

  /**
   * Returns true if the member holds the Recruit rank and therefore cannot join OCs.
   * Checks both the faction.position field and a top-level rank field.
   */
  function isRecruit(member) {
    const pos  = (member?.faction?.position || member?.position || '').toLowerCase().trim();
    const rank = (member?.rank || '').toLowerCase().trim();
    return pos === 'recruit' || rank === 'recruit';
  }

  // ─── API ─────────────────────────────────────────────────────────────────────

  /** Fetch a Torn API v2 endpoint and return the parsed JSON. Throws on error. */
  async function apiFetch(path, apiKey) {
    const sep = path.includes('?') ? '&' : '?';
    const url = `${API_BASE}${path}${sep}key=${apiKey}&comment=OCSuite`;
    return tornApiGet(url);
  }

  /** itemId -> which armoury SUB-TAB the item lives in ('utilities' | 'armour' |
   *  'weapons'), so Give ▸ / Retrieve ▸ open the right one. Filled by fetchAll. */
  let OCM_ARMOURY_CATS = {};

  /**
   * Parse ONE armoury category payload into the shared stock map + loan list.
   *
   * Shape (v2 — utilities / armor / weapons all share it):
   *   { <key>: [ { ID, name, type, quantity, available, loaned, loaned_to } ] }
   *   · available  — how many are sitting in the armoury, free to hand out
   *   · loaned_to  — comma-separated user IDs currently holding one
   *   · type       — "Tool" (reusable) | "Material" (consumed) | "Enhancer" | weapon/armour types
   *
   * OC item requirements are NOT only utilities — a Construction Helmet is
   * ARMOUR — so all three armouries feed one stock picture (v5.1.2; reading
   * just utilities made fully-stocked armour items show "✗ not stocked").
   * Each item also records which armoury TAB it lives in (out.cats) so the
   * loan flow can open the right page: Torn's sub= values are utilities /
   * armour / weapons, while the API selection is spelled 'armor'.
   *
   * Torn lists one entry per stock line, so the same item can appear multiple
   * times — once for the free stock and once per loan — which is exactly what
   * the armoury page shows. Both are summed/collected here.
   */
  function parseArmouryCat(data, key, out) {
    const raw = data?.[key] ?? (key === 'utilities' ? data?.utility : null) ?? [];
    const list = Array.isArray(raw) ? raw : Object.values(raw || {});
    const sub = key === 'armor' ? 'armour' : key;
    for (const it of list) {
      if (!it || typeof it !== 'object') continue;
      const id = String(it.ID ?? it.id ?? it.item_id ?? '');
      if (!id) continue;
      // Stock = what's free to give. Items out on loan are still faction property
      // but you can't hand them to someone else, so they don't count as stock.
      const avail = Number(it.available ?? 0) || 0;
      out.armory[id] = (out.armory[id] || 0) + avail;
      out.cats[id] = sub;

      // Loans. loaned_to is documented as "comma-separated ids" and can arrive as a
      // number (single holder) or a string ("123,456"). Empty/0 means nobody.
      const lt = it.loaned_to;
      if (lt !== null && lt !== undefined && lt !== '' && lt !== 0) {
        const uids = String(lt).split(',').map(s => s.trim()).filter(s => s && s !== '0');
        for (const uid of uids) {
          out.loanedOut.push({
            itemId: id,
            itemName: it.name || null,
            uid: String(uid),
            holderName: null,          // resolved from the roster by resolveMemberName
            isTool: String(it.type || '').toLowerCase() === 'tool',
            cat: sub,
          });
        }
      }
    }
    return out;
  }

  /** Fetch all data required for leader (faction) mode. */
  async function fetchAll(apiKey) {
    const [faction, members, utilData, armorData, weaponsData, me] = await Promise.all([
      apiFetch('/faction?selections=crimes,basic', apiKey),
      apiFetch('/faction?selections=members', apiKey),
      // THE armoury calls for OC purposes. There is no "armory" selection in v2 —
      // that request returned nothing, which is why every item read "Held: 0" and
      // was reported as a gap. Most OC items (Enhancers / Tools / Materials) live
      // in the Utilities armoury, but requirements can also be ARMOUR (Construction
      // Helmet) or weapons — so all three are read (v5.1.2). Each returns
      //   { <cat>: [{ ID, name, type, quantity, available, loaned, loaned_to }] }
      // loaned_to is a comma-separated list of the user IDs currently holding it.
      // (Server caches identical calls ~30s, and syncArmouryGear makes the same
      // armor/weapons calls, so these mostly ride for free.)
      apiFetch('/faction?selections=utilities', apiKey).catch(() => ({})),
      apiFetch('/faction?selections=armor', apiKey).catch(() => ({})),
      apiFetch('/faction?selections=weapons', apiKey).catch(() => ({})),
      apiFetch('/user?selections=basic', apiKey).catch(() => ({})),
      // Faction funds log ("X gave $Y to Z") — legacy payout fallback only.
      // Self-contained: merges into the persistent event store, walks extra
      // pages when a burst outran the cursor, and records readability status.
      syncGiveFunds(apiKey),
      // Deposits (money IN) — feeds Money > Funds. Same cursor-walk pattern.
      syncDepositFunds(apiKey),
    ]);

    // Viewer's own player ID — used by the "best open slot" advisory to look up
    // YOUR predicted CPR for each open role (an empty slot has no CPR of its own).
    const viewerId = me?.player_id ? String(me.player_id) : (me?.profile?.id ? String(me.profile.id) : null);
    if (viewerId) GM_setValue(GMK.MY_PLAYER_ID, viewerId);

    // Own faction ID — the war layer needs it to tell outgoing from incoming
    // attacks. Read defensively across response shapes.
    const myFid = faction?.basic?.id ?? faction?.basic?.ID ?? faction?.ID ?? null;
    if (myFid != null) GM_setValue(GMK.MY_FACTION_ID, String(myFid));

    // Parse ALL THREE armouries into one stock picture:
    //   armory[itemId]  = how many are on hand and free to give (NOT already loaned)
    //   cats[itemId]    = which armoury sub-tab the item lives in (for Give ▸ links)
    // Torn returns one entry per stock line, so an item can appear several times:
    // once "available" and once per loan. loaned_to is comma-separated user IDs.
    const parsedArmoury = { armory: {}, loanedOut: [], cats: {} };
    parseArmouryCat(utilData, 'utilities', parsedArmoury);
    parseArmouryCat(armorData, 'armor', parsedArmoury);
    parseArmouryCat(weaponsData, 'weapons', parsedArmoury);
    const armory = parsedArmoury.armory;
    OCM_ARMOURY_CATS = parsedArmoury.cats;

    // Collect item IDs referenced in active OC slots so we can resolve their names.
    // ocReqIds tracks the REQUIREMENT ids specifically — used below to decide which
    // armour/weapons loans are OC business.
    const itemIds = new Set();
    const ocReqIds = new Set();
    const INACTIVE = new Set(['completed', 'expired', 'cancelled', 'failed', 'success']);
    for (const oc of Object.values(faction.crimes || {})) {
      if (!oc || typeof oc !== 'object') continue;
      const ocStatus = (oc.status || '').toLowerCase();
      // Active OCs: collect item-requirement IDs (for the slot item badges)
      if (!INACTIVE.has(ocStatus)) {
        for (const slot of Object.values(oc.slots || oc.participants || [])) {
          const rawItems = slot.items
            ? (Array.isArray(slot.items) ? slot.items : Object.values(slot.items))
            : slot.item_requirement ? [slot.item_requirement] : [];
          for (const item of rawItems) {
            const id = item?.id || item?.item_id;
            if (id) { itemIds.add(String(id)); ocReqIds.add(String(id)); }
          }
        }
      }
      // ALL OCs: collect reward-item IDs (for profit tracking item values)
      const rwItems = oc.rewards?.items;
      if (rwItems) {
        const arr = Array.isArray(rwItems) ? rwItems : Object.values(rwItems);
        for (const it of arr) {
          const id = it?.id || it?.item_id;
          if (id) itemIds.add(String(id));
        }
      }
    }

    // Resolve item names AND market values via the torn items endpoint
    let itemNames = {};
    let itemValues = {};
    if (itemIds.size > 0) {
      try {
        const ids = [...itemIds].join(',');
        const url = `https://api.torn.com/torn/${ids}?selections=items&key=${apiKey}&comment=OCSuite`;
        const data = await tornApiGet(url);
        for (const [id, item] of Object.entries(data.items || {})) {
          itemNames[String(id)]  = item.name || `Item #${id}`;
          // v2 nests price under value.market_price; v1 used market_value
          itemValues[String(id)] = item.value?.market_price ?? item.market_value ?? item.value?.sell_price ?? 0;
        }
      } catch (_) {}
    }

    // Build last-OC records and collect ex-member IDs from completed OC history
    const lastOc       = {};
    const exMemberIds  = new Set();
    const currentMemberIds = new Set(Object.values(members.members || {}).map(m => String(m.id)));

    // Historical CPR map from completed OCs:
    //   ocHistoryCpr[memberId][ocName][roleNoNum] = { sum, count }
    // Used as a fallback when TornStats has no data for a member+role
    const ocHistoryCpr = {};

    for (const oc of Object.values(faction.crimes || {})) {
      if (!oc?.executed_at) continue;
      const ocSlots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
      for (const slot of ocSlots) {
        if (!slot) continue;
        const uid = slot.user?.id ? String(slot.user.id) : null;
        if (!uid) continue;
        if (!lastOc[uid] || oc.executed_at > lastOc[uid].executed_at) {
          lastOc[uid] = { name: oc.name || `OC #${oc.id}`, executed_at: oc.executed_at };
        }
        if (!currentMemberIds.has(uid)) exMemberIds.add(uid);

        // Record CPR for fallback lookup
        const cpr = slot.checkpoint_pass_rate;
        if (cpr != null && oc.name) {
          const roleRaw  = slot.position_info?.label || slot.position || '';
          const roleNorm = roleRaw.replace(/\s*#\d+$/, '').toLowerCase().trim();
          if (roleNorm) {
            const ocKey = oc.name.toLowerCase().trim();
            if (!ocHistoryCpr[uid]) ocHistoryCpr[uid] = {};
            if (!ocHistoryCpr[uid][ocKey]) ocHistoryCpr[uid][ocKey] = {};
            const bucket = ocHistoryCpr[uid][ocKey][roleNorm] || { sum: 0, count: 0 };
            bucket.sum   += cpr;
            bucket.count += 1;
            ocHistoryCpr[uid][ocKey][roleNorm] = bucket;
          }
        }
      }
    }
    window._ocmHistoryCpr = ocHistoryCpr;

    // Fetch display names for ex-members who've left the faction
    const exMemberNames = {};
    if (exMemberIds.size > 0) {
      await Promise.all([...exMemberIds].map(async uid => {
        try {
          const url  = `https://api.torn.com/user/${uid}?selections=basic&key=${apiKey}&comment=OCSuite`;
          const data = await tornApiGet(url);
          if (data?.name) exMemberNames[uid] = data.name;
        } catch (_) {}
      }));
    }

    // Utilities loans always count; armour/weapons loans join the loan list ONLY
    // when an active OC actually REQUIRES that item — otherwise every fielded
    // gun and vest would be flagged "holds unneeded / retrievable" in Item
    // Status. Combat gear on loan is the Loadouts pane's business.
    const loanedOut = parsedArmoury.loanedOut.filter(l => l.cat === 'utilities' || ocReqIds.has(l.itemId));

    return { faction, members: members.members || {}, armory, itemNames, itemValues, lastOc, exMemberNames, viewerId, loanedOut };
  }

  // ─── BUILD UI ────────────────────────────────────────────────────────────────

  /** Construct the dashboard root element. Returns an unattached DOM node. */
  function buildRoot() {
    const root = document.createElement('div');
    root.id = 'ocm-root';
    root.innerHTML = `
      <div id="ocm-header">
        <h2>⚔ OC Suite</h2>
        <span class="ocm-ver">v${SCRIPT_VERSION}</span>
        <small id="ocm-last-update">Not loaded</small>
        <span class="ocm-hdr-gap"></span>
        <button id="ocm-legend-btn" title="What do CPR, weight and the icons mean?">? Legend</button>
        <button id="ocm-config-toggle" title="Settings">⚙ Config</button>
        <button id="ocm-refresh-btn" title="Refresh data">↻ Refresh</button>
      </div>
      <div id="ocm-legend" style="display:none"></div>
      <div id="ocm-config-panel" style="display:none">
        <div class="ocm-cfg-section">
          <span id="ocm-key-status" style="font-size:11px;color:var(--ocm-text-dim)"></span>
        </div>
        <div class="ocm-cfg-section">
          <div class="ocm-cfg-label">Colour Theme
            <span style="font-size:10px;color:var(--ocm-text-dim);font-weight:normal;text-transform:none;letter-spacing:0;margin-left:6px">
              Accessibility themes add ✓ ⚠ ✗ shape markers. Pick "Custom" to set every colour yourself.
            </span>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <select id="ocm-theme-select" style="background:#1c1810;border:1px solid #3a3018;border-radius:4px;color:var(--ocm-text);padding:4px 8px;font-size:12px;cursor:pointer;flex:1;max-width:280px">
              <option value="default">Default (current look)</option>
              <option value="frostbite">Frostbite (v6 look)</option>
              <option value="highcontrast">High Contrast</option>
              <option value="midnight">Midnight Blue</option>
              <option value="deuteranopia">Deuteranopia (Red/Green CB)</option>
              <option value="protanopia">Protanopia (Red Deficiency)</option>
              <option value="tritanopia">Tritanopia (Blue/Yellow CB)</option>
              <option value="custom">⚙ Custom…</option>
            </select>
            <button id="ocm-theme-customize-btn" style="background:#1c1810;border:1px solid #3a3018;border-radius:4px;color:var(--ocm-cpr-warn);padding:4px 10px;font-size:11px;cursor:pointer">🎨 Customize</button>
          </div>
          <div id="ocm-theme-editor" style="display:none;margin-top:10px;background:var(--ocm-bg);border:1px solid var(--ocm-border-soft);border-radius:6px;padding:12px"></div>
        </div>
        <div class="ocm-cfg-section">
          <div class="ocm-cfg-label">Torn API Key
            <span style="font-size:10px;color:var(--ocm-text-dim);font-weight:normal;text-transform:none;letter-spacing:0;margin-left:6px">
              Requires: Faction data (read) access. Generate at
              <a href="https://www.torn.com/preferences.php#tab=api" target="_blank" style="color:var(--ocm-link)">Preferences → API</a>.
            </span>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <input id="ocm-api-input" type="password" placeholder="Paste your API key (faction read access)" style="flex:1;min-width:160px" />
            <button id="ocm-save-key-btn" class="ocm-cfg-btn">Save & Load</button>
          </div>
        </div>
        <div class="ocm-cfg-section">
          <div class="ocm-cfg-label">TornStats API Key
            <span style="font-size:10px;color:var(--ocm-text-dim);font-weight:normal;text-transform:none;letter-spacing:0;margin-left:6px">
              Optional. Get at <a href="https://www.tornstats.com/profile" target="_blank" style="color:var(--ocm-link)">TornStats → Profile</a>.
            </span>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <input id="ocm-ts-key-input" type="password" placeholder="TornStats API key" style="flex:1;min-width:160px" />
            <button id="ocm-ts-save-btn" class="ocm-cfg-btn">Save TS Key</button>
            <button id="ocm-ts-fetch-btn" class="ocm-cfg-btn" style="background:#1a3a1a">⬇ Fetch CPR</button>
          </div>
          <div id="ocm-ts-status" style="font-size:11px;color:var(--ocm-text-dim);margin-top:4px"></div>
        </div>
        <div class="ocm-cfg-section">
          <div class="ocm-cfg-label">FFScouter API Key
            <span style="font-size:10px;color:var(--ocm-text-dim);font-weight:normal;text-transform:none;letter-spacing:0;margin-left:6px">
              Optional. Powers enemy stat estimates in the War Room. Get one at <a href="https://ffscouter.com" target="_blank" style="color:var(--ocm-link)">ffscouter.com</a>.
            </span>
          </div>
          <div class="ocm-flexrow">
            <input id="ocm-ff-key-input" type="password" placeholder="FFScouter API key" style="flex:1;min-width:160px" />
            <button id="ocm-ff-save-btn" class="ocm-cfg-btn">Save FF Key</button>
          </div>
          <div id="ocm-ff-status" style="font-size:11px;color:var(--ocm-text-dim);margin-top:4px"></div>
        </div>
        <div class="ocm-cfg-section">
          <div class="ocm-cfg-label">CPR Thresholds</div>
          <div class="ocm-cfg-row">
            <label>Warn below <input id="ocm-cfg-cpr-warn" type="number" min="0" max="100" value="${CPR_WARN}" class="ocm-cfg-num" />%</label>
            <label>Crit below <input id="ocm-cfg-cpr-crit" type="number" min="0" max="100" value="${CPR_CRIT}" class="ocm-cfg-num" />%</label>
            <label>Overqualified above <input id="ocm-cfg-cpr-max" type="number" min="0" max="100" value="${CPR_MAX}" class="ocm-cfg-num" />%</label>
          </div>
          <div style="font-size:10px;color:var(--ocm-text-dim);margin-top:6px;line-height:1.4">
            "Overqualified above" is the max-CPR cap (0 = off): members whose CPR beats it in a low-difficulty OC get
            steered toward harder crimes instead of being under-used.
          </div>
        </div>
        <div class="ocm-cfg-section">
          <div class="ocm-cfg-label">Faction Settings for Members
            <span style="font-size:10px;color:var(--ocm-text-dim);font-weight:normal;text-transform:none;letter-spacing:0;margin-left:6px">
              Leaders: set the thresholds above, copy the code, drop it in faction Discord. Members: paste it below and Apply — your CPR warnings and recommendations then follow the faction's standards.
            </span>
          </div>
          <div class="ocm-cfg-row">
            <button id="ocm-fcfg-copy" class="ocm-cfg-btn">📋 Copy settings code</button>
            <input id="ocm-fcfg-paste" type="text" placeholder="paste your leader's settings code" style="flex:1;min-width:160px" />
            <button id="ocm-fcfg-apply" class="ocm-cfg-btn">Apply</button>
          </div>
          <div id="ocm-fcfg-status" style="font-size:11px;color:var(--ocm-text-dim);margin-top:4px;min-height:14px"></div>
        </div>
        <div class="ocm-cfg-section">
          <div class="ocm-cfg-label">Role Weight Thresholds</div>
          <div class="ocm-cfg-row">
            <label>High ≥ <input id="ocm-cfg-w-high" type="number" min="0" max="100" value="${WEIGHT_HIGH}" class="ocm-cfg-num" />%</label>
            <label>Mid ≥ <input id="ocm-cfg-w-mid" type="number" min="0" max="100" value="${WEIGHT_MID}" class="ocm-cfg-num" />%</label>
          </div>
        </div>
        <div class="ocm-cfg-section">
          <div class="ocm-cfg-label">Auto-refresh Interval</div>
          <div class="ocm-cfg-row">
            <label>Every <input id="ocm-cfg-refresh" type="number" min="30" max="3600" value="${REFRESH_S}" class="ocm-cfg-num" style="width:52px" /> seconds</label>
          </div>
        </div>
        <div class="ocm-cfg-section">
          <div class="ocm-cfg-label">Member Share by OC Level
            <span style="font-size:10px;color:var(--ocm-text-dim);font-weight:normal;text-transform:none;letter-spacing:0;margin-left:6px">
              The cut members get, per level. Only used for OCs Torn hasn't paid out yet — where it HAS paid,
              the real recorded percentage always wins.
            </span>
          </div>
          <div class="ocm-cfg-row" style="flex-wrap:wrap;gap:6px;align-items:flex-end">
            ${[1,2,3,4,5,6,7,8,9,10].map(lv => `
              <div style="text-align:center">
                <div style="font-size:9px;color:var(--ocm-text-faint);text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px">Lv ${lv}</div>
                <input type="number" class="ocm-cfg-share-lv ocm-cfg-num" data-lv="${lv}" min="0" max="100" step="5"
                       value="${loadShareByDiff()[lv] ?? 100}"
                       style="width:46px;text-align:center" />
              </div>`).join('')}
            <button id="ocm-cfg-share-reset" class="ocm-join-btn"
                    style="padding:5px 10px;background:none;border-color:var(--ocm-border);color:var(--ocm-text-muted);margin-left:6px"
                    title="Back to 100 / 100 / 90 / 90 / 80…">Reset to defaults</button>
            <span id="ocm-cfg-share-msg" style="font-size:11px;color:var(--ocm-cpr-good)"></span>
          </div>
          <div style="font-size:10px;color:var(--ocm-text-muted);margin-top:6px">Level 10 also covers anything above it.</div>
        </div>
        <div class="ocm-cfg-section">
          <div class="ocm-cfg-label">OC Spawn Reminder — min recruiting OCs per difficulty</div>
          <div class="ocm-cfg-row">
            <label>Min per difficulty <input id="ocm-cfg-min-per-diff" type="number" min="0" max="20" value="${MIN_PER_DIFF}" class="ocm-cfg-num" /></label>
            <span style="font-size:10px;color:var(--ocm-text-dim)">Stats bar turns red when any difficulty falls below this value. Set 0 to disable.</span>
          </div>
        </div>
        <div class="ocm-cfg-section" id="ocm-cfg-section-membermode" style="display:none">
          <div class="ocm-cfg-label">View Mode</div>
          <div class="ocm-cfg-row">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
              <input type="checkbox" id="ocm-cfg-force-member" style="cursor:pointer" />
              <span>Force Member Mode</span>
            </label>
          </div>
          <div style="font-size:10px;color:var(--ocm-text-dim);margin-top:6px;line-height:1.4">
            Your API key has faction-data access, so you can see the full leader dashboard.
            Tick this to preview the simplified Member Mode view (slot recommendations only).
          </div>
        </div>
        <div class="ocm-cfg-section">
          <div class="ocm-cfg-label">Debug</div>
          <div class="ocm-cfg-row">
            <button id="ocm-debug-snapshot-btn" class="ocm-cfg-btn" title="Download a JSON snapshot of the script's current internal state for troubleshooting">📋 Download Debug Snapshot</button>
            <button id="ocm-debug-copy-btn" class="ocm-cfg-btn" title="Copy a debug snapshot to clipboard">📋 Copy to Clipboard</button>
          </div>
          <div style="font-size:10px;color:var(--ocm-text-dim);margin-top:6px;line-height:1.4">
            Includes script state, computed sections, CPR data sources, and OC structure.
            API keys and full member rosters are redacted — safe to share for troubleshooting.
          </div>
        </div>
        <div style="padding:6px 10px 10px;display:flex;gap:8px">
          <button id="ocm-cfg-save-btn" class="ocm-cfg-btn">💾 Save Settings</button>
          <button id="ocm-cfg-reset-btn" class="ocm-cfg-btn" style="background:#222">↺ Reset Defaults</button>
          <span id="ocm-cfg-status" style="font-size:11px;color:var(--ocm-cpr-good);align-self:center"></span>
        </div>
      </div>
      <div id="ocm-body" style="display:none">
        <div id="ocm-error"></div>
        <!-- ═══ NAVIGATION RAIL (v5.3) ═══
             Still .ocm-tab[data-tab] driving .ocm-tab-pane#ocm-pane-X — initTabs'
             contract is untouched, so every renderer and the tab tests keep working.
             The rail is a LAYOUT change (a grid column on #ocm-body) plus icon/label
             spans, not a rewrite of the navigation.
             56px collapsed; hovering widens it to 200px, OVERFLOWING its fixed grid
             track rather than resizing it — so no table ever reflows because the
             mouse moved. 📌 pins it open for touch, where there is no hover. -->
        <div class="ocm-tabs" id="ocm-tabs" role="tablist">
          <div class="ocm-tab active" data-tab="dashboard" role="tab" title="Dashboard"><span class="ocm-tab-ico">🏠</span><span class="ocm-tab-lbl">Dashboard</span><span class="ocm-tab-count" id="ocm-tab-count-dashboard">0</span></div>
          <div class="ocm-tab"        data-tab="crimes"  role="tab" title="Crimes"><span class="ocm-tab-ico">🎯</span><span class="ocm-tab-lbl">Crimes</span><span class="ocm-tab-count" id="ocm-tab-count-crimes">0</span></div>
          <div class="ocm-tab"        data-tab="people"  role="tab" title="People"><span class="ocm-tab-ico">👥</span><span class="ocm-tab-lbl">People</span><span class="ocm-tab-count" id="ocm-tab-count-people">0</span></div>
          <div class="ocm-tab"        data-tab="money"   role="tab" title="Money"><span class="ocm-tab-ico">💰</span><span class="ocm-tab-lbl">Money</span><span class="ocm-tab-count" id="ocm-tab-count-money">0</span></div>
          <div class="ocm-tab"        data-tab="war"     role="tab" title="War"><span class="ocm-tab-ico">⚔️</span><span class="ocm-tab-lbl">War</span><span class="ocm-tab-count" id="ocm-tab-count-war">0</span></div>
          <div class="ocm-tab"        data-tab="armoury" role="tab" title="Armoury"><span class="ocm-tab-ico">🛡️</span><span class="ocm-tab-lbl">Armoury</span><span class="ocm-tab-count" id="ocm-tab-count-armoury">0</span></div>
          <div class="ocm-rail-pin" id="ocm-rail-pin" title="Keep the menu open (needed on touch, where there is no hover)"><span class="ocm-tab-ico">📌</span><span class="ocm-tab-lbl">Pin menu</span></div>
        </div>

        <!-- ═══ DASHBOARD — "what needs me right now" ═══
             Reads only stores the suite already syncs, so it costs zero extra API
             calls. Every tile links into the pane that owns the detail. -->
        <div class="ocm-tab-pane active" id="ocm-pane-dashboard">
          <div id="ocm-dashboard"></div>
        </div>

        <!-- ═══ MEMBER PROFILE — a drill-down, not a modal ═══
             Deliberately NOT an overlay: Torn's React re-renders strip classes
             off injected elements (the v5.1.0 vanishing-📌 bug), and an overlay
             would have to fight it. This is a sibling of the tab strip that
             hides the whole leader shell via one root class, exactly the way
             member mode already does. Reachable from any pane, no tab switching,
             and no per-pane copy of the view. -->
        <div id="ocm-member-profile"></div>

        <!-- ═══ CRIMES — running the OCs (the main job) ═══ -->
        <div class="ocm-tab-pane" id="ocm-pane-crimes">
          <div class="ocm-subtabs" role="tablist">
            <div class="ocm-subtab active" data-sub="fill"   role="tab">🎯 Fill Slots <span class="ocm-subtab-badge" id="ocm-sb-fill">0</span></div>
            <div class="ocm-subtab"        data-sub="active" role="tab">📋 Active OCs <span class="ocm-subtab-badge" id="ocm-sb-active">0</span></div>
            <div class="ocm-subtab"        data-sub="history" role="tab">📊 Performance</div>
          </div>
          <div class="ocm-subpane active" id="ocm-sub-fill">
            <div id="ocm-stats-bar" style="display:none">
        <div class="ocm-stats-row">
          <div class="ocm-stat ocm-s-active" title="Number of active OCs (excluding completed/expired)">
            <span class="ocm-stat-label">Active</span>
            <span class="ocm-stat-value" id="ocm-s-active">–</span>
          </div>
          <div class="ocm-stat ocm-s-open" title="Slots across all active OCs with no member assigned yet">
            <span class="ocm-stat-label">Open</span>
            <span class="ocm-stat-value" id="ocm-s-open">–</span>
          </div>
          <div class="ocm-stat ocm-s-free" title="Faction members not currently assigned to any OC — available to fill open slots">
            <span class="ocm-stat-label">Free</span>
            <span class="ocm-stat-value" id="ocm-s-free">–</span>
          </div>
          <div class="ocm-stat ocm-s-lowcpr" title="Filled slots where the member's Checkpoint Pass Rate is below the warn threshold — they may cause failure">
            <span class="ocm-stat-label">⚠ Low CPR</span>
            <span class="ocm-stat-value" id="ocm-s-lowcpr">–</span>
          </div>
          <div class="ocm-stat ocm-s-blocked" title="Members currently in an OC who are jailed, hospitalised, or travelling — OC cannot initiate while any member is blocked">
            <span class="ocm-stat-label">🔴 Blocked</span>
            <span class="ocm-stat-value" id="ocm-s-blocked">–</span>
          </div>
          <div class="ocm-stat ocm-s-stuck" id="ocm-s-stuck-stat" title="OCs where all slots are filled and planning is complete, but initiation is blocked by a jailed/hospitalised/abroad member.">
            <span class="ocm-stat-label">🚨 Stuck</span>
            <span class="ocm-stat-value" id="ocm-s-stuck">–</span>
          </div>
        </div>
        <div class="ocm-stats-row-recruiting" id="ocm-s-recruiting-stat" title="Recruiting OCs per difficulty. Turns red when any difficulty is below the configured minimum.">
          <span class="ocm-stat-label">Recruiting by Diff</span>
          <span id="ocm-s-recruiting" style="display:flex;gap:4px;flex-wrap:wrap;flex:1">–</span>
        </div>
      </div>

            <div id="ocm-stuck-banner" style="display:none"></div>
            <div id="ocm-next-banner"></div>
            <div id="ocm-my-assignment" style="display:none"></div>
            <div id="ocm-leader-advice" style="display:none"></div>
            <div class="ocm-section-title" id="ocm-title-available">Members Available for Assignment <span id="ocm-newsletter-btn" title="Build a newsletter message with each member's recommended slot, copy it to clipboard, and open the newsletter page" onclick="event.stopPropagation()" style="color:var(--ocm-link);cursor:pointer;font-size:13px;margin-left:6px">✉</span></div>
            <div id="ocm-available"></div>
            <div class="ocm-section-title collapsed" id="ocm-title-recruits">🚧 Recruits (cannot join OCs)</div>
            <div id="ocm-recruits" style="display:none"></div>
          </div>
          <div class="ocm-subpane" id="ocm-sub-active">
            <div id="ocm-planning-header" class="ocm-phase-header ocm-phase-planning">⏳ Planning <span id="ocm-planning-count" class="ocm-phase-count"></span><span class="ocm-phase-collapse">▼</span></div>
            <div id="ocm-grid-planning" class="ocm-oc-grid"></div>
            <div id="ocm-recruiting-header" class="ocm-phase-header ocm-phase-recruiting">🔍 Recruiting <span id="ocm-recruiting-count" class="ocm-phase-count"></span><span class="ocm-phase-collapse">▼</span></div>
            <div id="ocm-grid-recruiting" class="ocm-oc-grid"></div>
          </div>
          <div class="ocm-subpane" id="ocm-sub-history">
            <div class="ocm-section-title" id="ocm-title-analytics">📊 OC History &amp; Performance</div>
            <div id="ocm-analytics"></div>
          </div>
        </div>

        <!-- ═══ PEOPLE — everything about members, in one place ═══ -->
        <div class="ocm-tab-pane" id="ocm-pane-people">
          <div class="ocm-subtabs" role="tablist">
            <div class="ocm-subtab active" data-sub="assign"   role="tab">🎯 Assignments <span class="ocm-subtab-badge" id="ocm-sb-assign">0</span></div>
            <div class="ocm-subtab"        data-sub="blocked"  role="tab">🚫 Blocked <span class="ocm-subtab-badge" id="ocm-sb-blocked">0</span></div>
            <div class="ocm-subtab"        data-sub="activity" role="tab">🕐 Activity</div>
            <div class="ocm-subtab"        data-sub="optimize" role="tab">⚡ Optimize <span class="ocm-subtab-badge" id="ocm-sb-optimize">0</span></div>
            <div class="ocm-subtab"        data-sub="cpr"      role="tab">📈 CPR Data</div>
          </div>
          <div class="ocm-subpane active" id="ocm-sub-assign">
            <div id="ocm-people-assign"></div>
          </div>
          <div class="ocm-subpane" id="ocm-sub-activity">
            <div id="ocm-people-activity"><div class="ocm-note">Member activity tracking arrives in v4.4 — last-action trends, inactivity flags and status timers will build here as the suite collects snapshots.</div></div>
          </div>
          <div class="ocm-subpane" id="ocm-sub-blocked">
            <div class="ocm-section-title" id="ocm-title-blocked">Blocked Members (Jail / Hospital / Abroad)</div>
            <div id="ocm-blocked"></div>
          </div>
          <div class="ocm-subpane" id="ocm-sub-optimize">
            <div class="ocm-section-title" id="ocm-title-lowcpr">⚠ Low CPR Members — below ${CPR_WARN}%</div>
            <div id="ocm-lowcpr"></div>
            <div class="ocm-section-title collapsed" id="ocm-title-overqualified">⬆ Underutilized — could run a harder OC</div>
            <div id="ocm-overqualified" style="display:none"></div>
          </div>
          <div class="ocm-subpane" id="ocm-sub-cpr">
            <div class="ocm-section-title" id="ocm-title-tscoverage">🔍 TornStats Coverage</div>
            <div id="ocm-tscoverage"></div>
            <div class="ocm-section-title collapsed" id="ocm-title-tscpr">📈 TornStats CPR</div>
            <div id="ocm-tscpr" style="display:none"></div>
          </div>
        </div>

        <!-- ═══ MONEY — profit, payouts, costs ═══ -->
        <div class="ocm-tab-pane" id="ocm-pane-money">
          <div class="ocm-subtabs" role="tablist">
            <div class="ocm-subtab active" data-sub="summary" role="tab">📊 Overview</div>
            <div class="ocm-subtab"        data-sub="members" role="tab">👤 Member Earnings</div>
            <div class="ocm-subtab"        data-sub="payouts" role="tab">💸 Payouts <span class="ocm-subtab-badge" id="ocm-sb-payouts">0</span></div>
            <div class="ocm-subtab"        data-sub="ocsran"  role="tab">📋 OCs Ran</div>
            <div class="ocm-subtab"        data-sub="costs"   role="tab">📦 Costs <span class="ocm-subtab-badge" id="ocm-sb-costs">0</span></div>
            <div class="ocm-subtab"        data-sub="funds"   role="tab">🏦 Funds</div>
            <div class="ocm-subtab"        data-sub="exports" role="tab">⬇ Exports</div>
          </div>
          <div id="ocm-money-controls"></div>
          <div class="ocm-subpane active" id="ocm-sub-summary"><div id="ocm-money-summary"></div></div>
          <div class="ocm-subpane" id="ocm-sub-payouts"><div id="ocm-money-payouts"></div></div>
          <div class="ocm-subpane" id="ocm-sub-ocsran"><div id="ocm-money-ocs"></div></div>
          <div class="ocm-subpane" id="ocm-sub-members"><div id="ocm-money-members"></div></div>
          <div class="ocm-subpane" id="ocm-sub-costs"><div id="ocm-money-costs"></div></div>
          <div class="ocm-subpane" id="ocm-sub-funds"><div id="ocm-money-funds"><div class="ocm-note">The faction funds flow builds from the news log — give it one data refresh.</div></div></div>
          <div class="ocm-subpane" id="ocm-sub-exports"><div id="ocm-downloads"></div></div>
        </div>

        <!-- ═══ WAR — ranked wars, chains, targets, war pay ═══ -->
        <div class="ocm-tab-pane" id="ocm-pane-war">
          <div class="ocm-subtabs" role="tablist">
            <div class="ocm-subtab active" data-sub="watch"   role="tab">🔗 Live Chain</div>
            <div class="ocm-subtab"        data-sub="wars"    role="tab">⚔️ Wars</div>
            <div class="ocm-subtab"        data-sub="chains"  role="tab">📜 Chains</div>
            <div class="ocm-subtab"        data-sub="warroom" role="tab">🎯 War Room</div>
            <div class="ocm-subtab"        data-sub="warpay"  role="tab">💸 War Pay</div>
            <div class="ocm-subtab"        data-sub="revives" role="tab">💉 Revives</div>
            <div class="ocm-subtab"        data-sub="tools"   role="tab">🛠 Tools</div>
          </div>
          <div class="ocm-subpane active" id="ocm-sub-watch">
            <div id="ocm-war-watch"><div class="ocm-note">Live chain watcher arrives in v4.2 — countdown, timeout warnings and chain bonus tracking.</div></div>
          </div>
          <div class="ocm-subpane" id="ocm-sub-wars">
            <div id="ocm-war-history"><div class="ocm-note">Ranked-war analytics arrive in v4.1 — per-member hits, losses and respect for every war, kept forever.</div></div>
          </div>
          <div class="ocm-subpane" id="ocm-sub-chains">
            <div id="ocm-war-chains"><div class="ocm-note">Chain reports arrive in v4.1 — per-member hit and respect breakdowns for every chain.</div></div>
          </div>
          <div class="ocm-subpane" id="ocm-sub-warroom">
            <div id="ocm-warroom"><div class="ocm-note">The War Room arrives in v4.2 — a live enemy roster with status, hospital timers and stat estimates during ranked wars.</div></div>
          </div>
          <div class="ocm-subpane" id="ocm-sub-warpay">
            <div id="ocm-war-pay"><div class="ocm-note">The war payout calculator arrives in v4.3 — split the war cache by hits, respect or score, with exports.</div></div>
          </div>
          <div class="ocm-subpane" id="ocm-sub-revives">
            <div id="ocm-war-revives"><div class="ocm-note">Revive tracking arrives in v4.4 — reviver leaderboards and success rates.</div></div>
          </div>
          <div class="ocm-subpane" id="ocm-sub-tools">
            <div id="ocm-war-tools"></div>
          </div>
        </div>

        <!-- ═══ ARMOURY — loans, item status, loan history, loadouts ═══ -->
        <div class="ocm-tab-pane" id="ocm-pane-armoury">
          <div class="ocm-subtabs" role="tablist">
            <div class="ocm-subtab active" data-sub="loans"    role="tab">🤝 Loans <span class="ocm-subtab-badge" id="ocm-sb-loans">0</span></div>
            <div class="ocm-subtab"        data-sub="memitems" role="tab">🎒 Item Status <span class="ocm-subtab-badge" id="ocm-sb-memitems">0</span></div>
            <div class="ocm-subtab"        data-sub="armusers" role="tab">👤 Members</div>
            <div class="ocm-subtab"        data-sub="loanlog"  role="tab">📜 Loan History</div>
            <div class="ocm-subtab"        data-sub="loadouts" role="tab">🧰 Loadouts</div>
          </div>
          <div class="ocm-subpane active" id="ocm-sub-loans">
            <div id="ocm-people-loans"></div>
          </div>
          <div class="ocm-subpane" id="ocm-sub-memitems">
            <div id="ocm-people-items"></div>
          </div>
          <div class="ocm-subpane" id="ocm-sub-armusers">
            <div id="ocm-armoury-members"><div class="ocm-note">Per-member armoury profiles build from the gear and news syncs — give it one data refresh.</div></div>
          </div>
          <div class="ocm-subpane" id="ocm-sub-loanlog">
            <div id="ocm-armoury-loanlog"><div class="ocm-note">Loan history arrives in v4.5 — who took what from the armoury and when, built from the faction news log.</div></div>
          </div>
          <div class="ocm-subpane" id="ocm-sub-loadouts">
            <div id="ocm-armoury-loadouts"><div class="ocm-note">Loadout tracking arrives in v4.5 — armoury holdings per member, plus opt-in self-reported equipped gear.</div></div>
          </div>
        </div>

        <div id="ocm-footer"></div>
      </div>
    `;
    return root;
  }

  // ─── RENDER ──────────────────────────────────────────────────────────────────

  /**
   * Main render function — called after a successful faction API fetch.
   * Builds the complete dashboard from raw API data.
   */
  function renderDashboard(faction, memberMap, armory, itemNames, lastOc, exMemberNames = {}, itemValues = {}, viewerId = null, loanedOut = []) {
    OCM_FACTION_NAME = faction?.basic?.name || faction?.name || '';
    const crimes = faction.crimes || {};
    // Make sure tab strip is visible (might have been hidden in a previous member-mode render)
    const _tabsEl = document.getElementById('ocm-tabs');
    if (_tabsEl) _tabsEl.style.display = '';
    document.getElementById('ocm-root')?.classList.remove('ocm-member-mode');

    /** Resolve an item name from itemNames cache or fall back gracefully. */
    function itemName(item) {
      const id = String(item?.id || item?.item_id || '');
      return itemNames[id] || item?.name || (id ? `Item #${id}` : 'Unknown item');
    }

    // Build a quick-lookup of member info indexed by string ID
    const mInfo = {};
    const memberById = {}; // O(1) lookup by string id — avoids repeated Object.values().find()
    for (const [mapKey, m] of Object.entries(memberMap)) {
      // The members payload is keyed by user id; `m.id` is usually also present but
      // isn't guaranteed. Falling back to the key stops profile links rendering as
      // XID=undefined when it's missing.
      const key   = String(m.id ?? mapKey);
      const state = m.status?.state || m.status?.description || 'Unknown';
      const desc  = m.status?.description || '';
      mInfo[key] = { name: m.name, status: state, description: desc, recruit: isRecruit(m) };
      // Stamp the id onto the member object itself. Downstream code (member cards,
      // tables, profile links) reads m.id directly, and rendered XID=undefined links
      // whenever the payload omitted it.
      if (m.id == null) m.id = key;
      memberById[key] = m;
    }

    // --- First pass: collect aggregate stats
    const assignedIds    = new Set();
    let openSlots        = 0;
    let lowCprCount      = 0;
    let blockedInOcCount = 0;
    const readyOcs       = [];
    const planningOcs    = [];
    const recruitingOcs  = [];
    const blockedOcs     = [];

    // Build OC name → difficulty map for TornStats CPR section
    const crimeDiffMap = {};
    for (const oc of Object.values(crimes)) {
      if (oc?.name && oc?.difficulty != null) crimeDiffMap[oc.name.toLowerCase().trim()] = oc.difficulty;
    }
    window._ocmCrimeDiffMap = crimeDiffMap;

    const ACTIVE = new Set(['recruiting', 'planning', 'ready', 'blocked', 'awaiting', 'initiated', 'executing', 'in progress', 'active']);

    for (const [ocId, oc] of Object.entries(crimes)) {
      if (!oc || typeof oc !== 'object') continue;
      const phase  = (oc.status || '').toLowerCase();
      if (!ACTIVE.has(phase)) continue;

      for (const slot of (Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []))) {
        const user   = slot.user;
        const userId = user?.id ? String(user.id) : null;

        if (userId && !mInfo[userId]) {
          mInfo[userId] = { name: user.name || `#${userId}`, status: user.status?.state || 'Unknown' };
        }

        if (userId) assignedIds.add(userId);
        if (userId && mInfo[userId] && isBlocked(mInfo[userId].status)) blockedInOcCount++;

        const cpr = slot.checkpoint_pass_rate ?? null;
        if (cpr != null && userId && cpr < CPR_WARN) lowCprCount++;
        if (!userId) openSlots++;

        // Backfill tsCprData: if a member is in an OC with a known CPR but
        // TornStats doesn't have data for this crime+role, use the live CPR
        if (cpr != null && userId && oc.name) {
          const rn = (slot.position_info?.label || slot.position || '').replace(/\s*#\d+$/, '');
          if (rn) {
            if (!tsCprData[userId]) tsCprData[userId] = {};
            if (!tsCprData[userId][oc.name]) tsCprData[userId][oc.name] = {};
            if (tsCprData[userId][oc.name][rn] == null) {
              tsCprData[userId][oc.name][rn] = cpr;
            }
          }
        }
      }

      if (phase === 'recruiting')    recruitingOcs.push({ id: ocId, oc });
      else if (phase === 'planning') planningOcs.push({ id: ocId, oc });
      else if (phase === 'ready')    readyOcs.push({ id: ocId, oc });
      else if (phase === 'blocked')  blockedOcs.push({ id: ocId, oc });
    }

    // --- Split free members into recruits vs eligible
    const freeMembers  = [];
    const freeRecruits = [];
    for (const m of Object.values(memberMap)) {
      const mid  = String(m.id);
      const inOc = m.is_in_oc ?? assignedIds.has(mid);
      if (inOc) continue;
      const state = m.status?.state || m.status?.description || 'Unknown';
      if (isRecruit(m)) {
        freeRecruits.push({ id: mid, name: m.name, status: state });
      } else {
        freeMembers.push({ id: mid, name: m.name, status: state });
      }
    }

    // --- Recruiting OC counts per difficulty for spawn reminder stat
    const recruitingByDiff = {};
    for (const { oc } of recruitingOcs) {
      const diff = String(oc.difficulty ?? '?');
      recruitingByDiff[diff] = (recruitingByDiff[diff] || 0) + 1;
    }
    // Check if any known difficulty is below the minimum threshold
    const anyBelowMin = MIN_PER_DIFF > 0 && Object.values(recruitingByDiff).some(v => v < MIN_PER_DIFF);
    const recruitStatEl = document.getElementById('ocm-s-recruiting-stat');
    const sortedDiffs = Object.keys(recruitingByDiff).sort((a, b) => Number(a) - Number(b));
    const recruitChipHtml = sortedDiffs.length
      ? sortedDiffs.map(d => {
          const count = recruitingByDiff[d];
          const danger = MIN_PER_DIFF > 0 && count < MIN_PER_DIFF;
          return `<span class="ocm-recruiting-chip${danger ? ' danger' : ''}" title="D${d}: ${count} recruiting OC${count===1?'':'s'}">D${d}·${count}</span>`;
        }).join('')
      : '<span style="color:var(--ocm-text-faint);font-size:11px">–</span>';
    document.getElementById('ocm-s-recruiting').innerHTML = recruitChipHtml;
    if (recruitStatEl) {
      const title = anyBelowMin
        ? `⚠ One or more difficulty levels has fewer than ${MIN_PER_DIFF} recruiting OC(s). Consider spawning more.`
        : 'Recruiting OCs per difficulty. All levels above minimum threshold.';
      recruitStatEl.title = title;
    }

    // --- Update stats bar
    const activeOcCount = Object.values(crimes).filter(oc => oc && ACTIVE.has((oc.status||'').toLowerCase())).length;
    document.getElementById('ocm-s-active').textContent  = activeOcCount;
    document.getElementById('ocm-s-open').textContent    = openSlots;
    document.getElementById('ocm-s-lowcpr').textContent  = lowCprCount;
    document.getElementById('ocm-s-blocked').textContent = blockedInOcCount;
    document.getElementById('ocm-s-free').textContent    = freeMembers.length;
    // 'block', NOT 'flex': the stats bar holds the 6-tile GRID plus the recruiting
    // strip as two stacked rows. Inline flex jammed them side-by-side, squeezing
    // the tiles until their labels truncated ("BLOCKE…", "LOW CPR" wrapping).
    document.getElementById('ocm-stats-bar').style.display = 'block';
    // '' — NOT 'block'. #ocm-body starts as inline display:none; setting it to
    // 'block' here left an INLINE declaration that beat the stylesheet's
    // `display: grid`, so the v5.3 nav rail silently never got a grid at all and
    // the whole dashboard stacked underneath it. '' removes the inline override
    // and lets the stylesheet win. (Shipped broken in v5.3.0 — the render harness
    // computes no styles, so only a live screenshot could show it.)
    document.getElementById('ocm-body').style.display       = '';

    // 'now' used throughout the rest of renderDashboard — defined once here
    const now = Math.floor(Date.now() / 1000);

    // --- Detect stuck OCs:
    // An OC is "stuck" when every slot is filled, all planning progress is
    // complete (progress >= 100 for all members), and at least one member is
    // jailed, hospitalised, or abroad — preventing initiation.
    const stuckOcs = [];
    for (const [ocId, oc] of Object.entries(crimes)) {
      if (!oc || typeof oc !== 'object') continue;
      const phase = (oc.status || '').toLowerCase();
      // Only consider planning-phase OCs (ready, planning, blocked)
      if (!['planning', 'ready', 'blocked', 'awaiting'].includes(phase)) continue;
      const ocSlots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
      // All slots must be filled
      if (ocSlots.some(s => !s.user?.id)) continue;
      // All members must have completed planning (progress >= 100, or field absent = done)
      const allPlanned = ocSlots.every(s => (s.user?.progress ?? 100) >= 100);
      if (!allPlanned) continue;
      // At least one member must be blocked
      const blockers = ocSlots
        .map(s => {
          const uid  = String(s.user.id);
          const info = mInfo[uid];
          if (!info || !isBlocked(info.status)) return null;
          return { uid, name: info.name, status: info.status, description: info.description || '' };
        })
        .filter(Boolean);
      if (blockers.length === 0) continue;
      stuckOcs.push({ id: ocId, oc, blockers });
    }

    // --- Update stuck OC stat
    const stuckStatEl = document.getElementById('ocm-s-stuck-stat');
    document.getElementById('ocm-s-stuck').textContent = stuckOcs.length;
    if (stuckStatEl) {
      stuckStatEl.classList.toggle('ocm-stat-warn', stuckOcs.length > 0);
      stuckStatEl.title = stuckOcs.length > 0
        ? `⚠ ${stuckOcs.length} OC${stuckOcs.length > 1 ? 's are' : ' is'} fully planned and filled but cannot initiate — a member is unavailable.`
        : 'No stuck OCs — all fully planned OCs can initiate.';
    }

    // --- Render stuck OC banner
    const stuckBannerEl = document.getElementById('ocm-stuck-banner');
    if (stuckOcs.length === 0) {
      stuckBannerEl.style.display = 'none';
    } else {
      stuckBannerEl.style.display = 'block';
      const cardsHtml = stuckOcs.map(({ id, oc, blockers }) => {
        const expiredAt = oc.expired_at ?? null;
        const expiryHtml = expiredAt
          ? (() => {
              const secsLeft = expiredAt - now;
              const urgCol   = secsLeft < 3600  ? 'var(--ocm-cpr-crit)'
                             : secsLeft < 86400 ? 'var(--ocm-cpr-warn)'
                             : 'var(--ocm-cpr-warn)';
              return secsLeft > 0
                ? `<span class="ocm-stuck-expiry" style="color:${urgCol}">Expires in <span class="ocm-time" data-until="${expiredAt}">${fmtTime(secsLeft)}</span></span>`
                : `<span class="ocm-stuck-expiry" style="color:var(--ocm-cpr-crit)">Expired</span>`;
            })()
          : '';

        const blockersHtml = blockers.map(b => {
          const s           = (b.status || '').toLowerCase();
          let statusLabel;
          if (s === 'abroad' || s === 'traveling') {
            statusLabel = travelInfo(b.status, b.description).label;
          } else {
            const icons = { hospital: '🏥', jail: '⛓' };
            statusLabel = `${icons[s] || '❓'} ${b.status}`;
          }
          return `<div class="ocm-stuck-blocker">
            ↳ <a href="/profiles.php?XID=${b.uid}" target="_blank">${esc(b.name)}</a>
            <span style="color:var(--ocm-cpr-crit)">${statusLabel}</span>
            ${b.description ? `<span style="color:var(--ocm-text-muted);font-size:10px" title="${b.description}">${b.description.length > 40 ? b.description.slice(0,38)+'…' : b.description}</span>` : ''}
          </div>`;
        }).join('');

        return `<div class="ocm-stuck-card">
          <div class="ocm-stuck-card-title">
            <strong>${oc.name || `OC #${id}`}</strong>
            <span class="ocm-stuck-diff">D${oc.difficulty ?? '?'} · ${(Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || [])).length} slots · fully planned</span>
            ${expiryHtml}
          </div>
          ${blockersHtml}
        </div>`;
      }).join('');

      stuckBannerEl.innerHTML = `
        <div class="ocm-stuck-header">
          🚨 Stuck OCs — cannot initiate
          <span>${stuckOcs.length} OC${stuckOcs.length > 1 ? 's are' : ' is'} ready but blocked by an unavailable member</span>
        </div>
        ${cardsHtml}`;
    }

    function fmtRelative(ts) {
      if (!ts) return null;
      const diff = now - ts;
      if (diff < 3600)      return { text: `${Math.floor(diff / 60)}m ago`,   cls: 'ocm-seen-recent' };
      if (diff < 86400)     return { text: `${Math.floor(diff / 3600)}h ago`,  cls: 'ocm-seen-recent' };
      if (diff < 86400 * 7) return { text: `${Math.floor(diff / 86400)}d ago`, cls: 'ocm-seen-day' };
      return { text: `${Math.floor(diff / 86400)}d ago`, cls: 'ocm-seen-old' };
    }

    function fmtOcRelative(ts) {
      if (!ts) return null;
      const diff = now - ts;
      if (diff < 43200)  return { text: `${diff < 3600 ? Math.floor(diff/60)+'m' : Math.floor(diff/3600)+'h'} ago`, cls: 'ocm-oc-recent' };
      if (diff < 86400)  return { text: `${Math.floor(diff / 3600)}h ago`, cls: 'ocm-oc-warn' };
      return { text: `${Math.floor(diff / 86400)}d ago`, cls: 'ocm-oc-old' };
    }

    /** For an available member, find their best-fit open slot across all recruiting OCs.
     *  Uses TornStats CPR for matching, falls back to role weight only.
     *  Returns { ocName, role, cpr, weight, difficulty, score } or null. */
    /** Score a single (member, openSlot) candidate. Higher = better fit. */
    function scoreSlotForMember(memberId, oc, ocId, slot) {
      const role     = slot.position_info?.label || slot.position || 'Unknown';
      const ocName   = oc.name || `OC #${ocId}`;
      const tsResult = tsGetCpr(memberId, ocName, role);
      const cpr      = tsResult ? tsResult.cpr : null;
      const exact    = tsResult ? tsResult.exact : false;
      const source   = tsResult ? tsResult.source : null;
      const weight   = getWeight(ocName, role);
      const diff     = Number(oc.difficulty) || 0;
      // Item requirement (if any) and whether the faction armory has it
      const req         = slot.item_requirement;
      const itemMissing = !!(req && req.is_available === false);
      const itemName    = req ? (itemNames[String(req.id)] || `Item #${req.id}`) : null;
      const eligible    = cpr != null && cpr >= CPR_WARN;
      const comfort     = eligible ? Math.max(0, (cpr - CPR_WARN) / (100 - CPR_WARN)) : 0;
      const weightBonus = (weight ?? 15) * comfort;
      // Slight score penalty if item is missing so a recommendation with
      // the item available is preferred over one without (other things equal).
      const itemPenalty = itemMissing ? 25 : 0;
      const score       = eligible
        ? diff * 1000 + weightBonus + cpr + (exact ? 50 : 0) - itemPenalty
        : (cpr != null ? -(100 - cpr) : -10000);
      return { ocName, ocId, role, cpr, weight, difficulty: oc.difficulty ?? '?', score, exact, eligible, source, itemMissing, itemName };
    }

    /** Build the global assignment of available members → unique open slots.
     *  Greedy: at each step pick the highest-scoring eligible (member, slot) pair,
     *  lock both, and repeat. A member can only be assigned one slot, and each
     *  slot only goes to one member. Members without an eligible match still
     *  get a fallback recommendation (their highest-scoring non-eligible slot)
     *  so they aren't left empty-handed.
     *  Returns Map<memberId, slotInfo>. */
    function buildBestSlotAssignment(memberIds) {
      // Collect all open slots
       const openSlots = [];
      for (const [ocId, oc] of Object.entries(crimes)) {
        if (!oc || (oc.status || '').toLowerCase() !== 'recruiting') continue;
        const ocSlots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
        ocSlots.forEach((slot, slotIdx) => {
          if (slot.user?.id) return;
          openSlots.push({ ocId, oc, slot, slotKey: `${ocId}:${slotIdx}` });
        });
      }

      // Build all (member, slot) pairs with scores
      const pairs = [];
      for (const mid of memberIds) {
        for (const os of openSlots) {
          const info = scoreSlotForMember(mid, os.oc, os.ocId, os.slot);
          pairs.push({ memberId: mid, slotKey: os.slotKey, info });
        }
      }
      // Sort by score descending
      pairs.sort((a, b) => b.info.score - a.info.score);

      const assigned    = new Map();      // memberId → slotInfo (eligible match only)
      const usedSlots   = new Set();
      const usedMembers = new Set();

      // Pass 1: greedy assignment of eligible pairs only
      for (const p of pairs) {
        if (!p.info.eligible) break; // sorted desc — no more eligibles after first non-eligible
        if (usedMembers.has(p.memberId) || usedSlots.has(p.slotKey)) continue;
        assigned.set(p.memberId, p.info);
        usedMembers.add(p.memberId);
        usedSlots.add(p.slotKey);
      }

      // Pass 2: members with no eligible match — give them a fallback only if
      // we have SOME CPR signal for them. Members with zero data (new recruits,
      // no TornStats, no faction history) get nothing — better to flag them as
      // "needs to run an OC" than to invent a recommendation.
      for (const mid of memberIds) {
        if (assigned.has(mid)) continue;
        const myPairs = pairs.filter(p => p.memberId === mid && p.info.cpr != null);
        if (myPairs.length) assigned.set(mid, myPairs[0].info);
      }

      return assigned;
    }

    // Cache the assignment per render so repeat lookups are free
    let _bestSlotCache = null;
    function getBestSlotForMember(memberId) {
      if (!_bestSlotCache) {
        _bestSlotCache = buildBestSlotAssignment(freeMembers.map(m => m.id));
      }
      return _bestSlotCache.get(memberId) || null;
    }

    /** Render a members table into a target element. Used for both Available and Recruits.
     *  When showBestFit=true, adds a recommended-role column using TornStats CPR data. */
    function renderMembersTable(members, containerEl, extraClass = '', showBestFit = false) {
      if (members.length === 0) {
        containerEl.innerHTML = '<span style="color:var(--ocm-text-faint);font-size:11px">None.</span>';
        return;
      }
      const sorted = [...members].sort((a, b) => {
        const ta = lastOc[a.id]?.executed_at ?? Infinity;
        const tb = lastOc[b.id]?.executed_at ?? Infinity;
        return ta - tb;
      });

      // Available members get a card layout with prominent best-fit recommendation.
      // Recruits/etc keep the compact table layout.
      if (showBestFit) {
        const cards = sorted.map(m => {
          const member  = memberById[m.id];
          const lastTs  = member?.last_action?.timestamp ?? null;
          const seen    = fmtRelative(lastTs);
          const oc      = lastOc[m.id];
          const ocTs    = oc ? fmtOcRelative(oc.executed_at) : null;
          const best    = getBestSlotForMember(m.id);

          let recHtml;
          if (!best) {
            recHtml = `<div style="color:var(--ocm-text-muted);font-size:11px;line-height:1.4">
              <span style="color:var(--ocm-cpr-warn);font-weight:bold">No CPR data yet</span>
              <span style="color:var(--ocm-text-faint)"> — run any OC once to build a personal baseline.</span>
            </div>`;
          } else {
            const cprCol = best.cpr == null ? '#445'
                          : best.cpr >= CPR_WARN ? 'var(--ocm-cpr-good)'
                          : best.cpr >= CPR_CRIT ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-crit)';
            const cprTxt = best.cpr == null ? '?' : `${best.cpr}%`;
            const exactMark = best.exact ? '' : '~';
            const sourceTag = best.source === 'history'
              ? `<span style="font-size:9px;color:var(--ocm-text-muted);background:#1c1810;border:1px solid #3a3018;padding:0 4px;border-radius:2px;margin-left:4px" title="From this member's faction OC history (no TornStats data)">hist</span>`
              : '';
            const itemWarn = best.itemMissing
              ? `<div style="font-size:10px;color:var(--ocm-cpr-crit);margin-top:3px;display:flex;align-items:center;gap:4px" title="Required item not available in faction armory. The slot still recommends this member but they (or the faction) need to source ${best.itemName} before initiation.">⚠ Item missing: <span style="color:#d8a070">${best.itemName}</span></div>`
              : '';
            recHtml = `<div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;font-size:12px;line-height:1.5">
              <span style="color:var(--ocm-link);font-size:9px;font-weight:bold;letter-spacing:.06em;text-transform:uppercase">Best fit</span>
              <span style="color:var(--ocm-text);font-weight:bold">${best.role}</span>
              <span style="color:var(--ocm-text-muted);font-size:11px">in</span>
              <span style="color:var(--ocm-text-dim)">${best.ocName}</span>
              <span style="color:var(--ocm-text-faint);font-size:10px">D${best.difficulty}</span>
              <span style="color:${cprCol};font-weight:bold;margin-left:auto">${exactMark}${cprTxt}${sourceTag}</span>
            </div>${itemWarn}`;
          }

          const lastOcStr = oc
            ? `<span style="color:var(--ocm-text-muted)">${oc.name.length > 22 ? oc.name.slice(0, 20) + '…' : oc.name}</span> · <span class="${ocTs ? ocTs.cls : ''}">${ocTs ? ocTs.text : ''}</span>`
            : `<span style="color:var(--ocm-text-faint);font-style:italic">No OC history</span>`;
          const seenStr = seen
            ? `<span class="${seen.cls}">${seen.text}</span>`
            : `<span style="color:var(--ocm-text-faint)">Unknown</span>`;

          return `<div class="ocm-mcard">
            <div class="ocm-mcard-head">
              <a href="/profiles.php?XID=${m.id}" target="_blank" class="ocm-mcard-name">${esc(m.name)}</a>
              <span class="ocm-mcard-seen">${seenStr}</span>
            </div>
            <div class="ocm-mcard-rec">${recHtml}</div>
            <div class="ocm-mcard-meta">${lastOcStr}</div>
          </div>`;
        }).join('');
        containerEl.innerHTML = `<div class="ocm-mcard-list">${cards}</div>`;
        return;
      }

      // Default compact table layout (Recruits, etc.)
      const rows = sorted.map(m => {
        const member     = memberById[m.id];
        const lastTs     = member?.last_action?.timestamp ?? null;
        const seen       = fmtRelative(lastTs);
        const oc         = lastOc[m.id];
        const ocTs       = oc ? fmtOcRelative(oc.executed_at) : null;
        const nameCell   = `<a href="/profiles.php?XID=${m.id}" target="_blank" style="color:var(--ocm-text-card);text-decoration:none">${esc(m.name)}</a>`;
        const ocName     = oc ? (oc.name.length > 24 ? oc.name.slice(0, 22) + '…' : oc.name) : '';
        const ocAgeCell  = oc
          ? `<span class="${ocTs ? ocTs.cls : ''}">${ocTs ? ocTs.text : ''}</span>`
          : `<span class="ocm-lastoc-never">No record</span>`;
        const ocNameCell = oc ? `<span title="${esc(oc.name)}" style="color:var(--ocm-text-muted)">${ocName}</span>` : '';
        const seenCell   = seen
          ? `<span class="${seen.cls}">${seen.text}</span>`
          : `<span style="color:var(--ocm-text-faint)">Unknown</span>`;
        return `<tr>
          <td class="col-name">${nameCell}</td>
          <td class="col-oc">${ocNameCell}</td>
          <td class="col-ocage">${ocAgeCell}</td>
          <td class="col-seen">${seenCell}</td>
        </tr>`;
      }).join('');
      containerEl.innerHTML = `
        <table class="ocm-members-table ${extraClass}">
          <thead><tr>
            <th>Member</th>
            <th>Last OC</th><th></th><th>Last Online</th>
          </tr></thead>
          <tbody>${rows}</tbody></table>`;
    }

    // ── Shared model + helpers → ctx handed to each per-tab renderer
    const ctx = { faction, memberMap, armory, itemNames, lastOc, exMemberNames, itemValues, viewerId, loanedOut, crimes, mInfo, memberById, assignedIds, readyOcs, planningOcs, recruitingOcs, blockedOcs, crimeDiffMap, ACTIVE, freeMembers, freeRecruits, recruitingByDiff, anyBelowMin, sortedDiffs, activeOcCount, now, stuckOcs, itemName, fmtRelative, fmtOcRelative, scoreSlotForMember, buildBestSlotAssignment, getBestSlotForMember, renderMembersTable };

    // Stash for the member-profile drill-down, which redraws itself outside the
    // dashboard pass (opened from any pane, and restored after the 60s refresh).
    OCM_LAST_CTX = ctx;

    renderOcGridsSection(ctx);
    renderActionSection(ctx);
    // Build a map of live OC slot CPRs so the TornStats table can show a member's
    // ACTUAL current checkpoint pass rate (overriding the TornStats estimate) when
    // they're slotted in that crime+role right now.
    //   liveCprMap[uid][crimeNameLower][roleNoNumLower] = checkpoint_pass_rate
    const liveCprMap = {};
    for (const oc of Object.values(crimes)) {
      if (!oc || typeof oc !== 'object') continue;
      const ocKey = (oc.name || '').toLowerCase().trim();
      if (!ocKey) continue;
      const slots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
      for (const slot of slots) {
        if (!slot?.user?.id) continue;
        const cpr = slot.checkpoint_pass_rate;
        if (cpr == null) continue;
        const uid     = String(slot.user.id);
        const roleKey = (slot.position_info?.label || slot.position || '').replace(/\s*#\d+$/, '').toLowerCase().trim();
        if (!roleKey) continue;
        if (!liveCprMap[uid]) liveCprMap[uid] = {};
        if (!liveCprMap[uid][ocKey]) liveCprMap[uid][ocKey] = {};
        // Keep the highest live CPR if a member somehow appears in the same role twice
        if (liveCprMap[uid][ocKey][roleKey] == null || cpr > liveCprMap[uid][ocKey][roleKey]) {
          liveCprMap[uid][ocKey][roleKey] = cpr;
        }
      }
    }
    renderTsCprSection(memberMap, liveCprMap);
    renderTsCoverage(memberMap);
    // Name lookup for OC slots / loans: those payloads often carry only a user id,
    // so resolve against the faction roster (plus the ex-member cache for people
    // who have since left) instead of trusting slot.user.name.
    const memberNames = {};
    for (const [uid, m] of Object.entries(mInfo)) if (m?.name) memberNames[String(uid)] = m.name;
    for (const [uid, m] of Object.entries(memberMap || {})) {
      const key = String(m?.id ?? uid);
      if (m?.name && !memberNames[key]) memberNames[key] = m.name;
    }
    for (const [uid, nm] of Object.entries(exMemberNames || {})) if (nm && !memberNames[String(uid)]) memberNames[String(uid)] = nm;

    recordProfit(crimes, itemValues, memberNames);
    renderFinanceSection(crimes, armory, itemNames, itemValues, loanedOut, memberNames);

    renderStatusSection(ctx);
    renderOptimizeSection(ctx);
    renderAssignmentsSection(ctx);
    renderHistorySection(ctx);   // v5.2 — replaces renderReferenceSection

    // War panes render from their persistent stores (no fetch here). Fold the
    // roster into the persistent name cache first so war/chain/armoury tables
    // can resolve member names. Ex-member names resolved this fetch go in too,
    // so archived crews stop rendering as "#id".
    stashMemberNames(memberMap);
    stashMemberNames(Object.fromEntries(
      Object.entries(exMemberNames || {}).map(([uid, name]) => [uid, { id: uid, name }])));
    renderWarSections();

    // Activity: fold this roster into the aggregate log (throttled to one
    // write per 30 min), then render People > Activity from roster + log.
    snapshotActivity(memberMap);
    renderActivitySection(memberMap);

    // LAST: the Dashboard summarises what the other renderers just computed, so
    // it runs after them (it reads OCM_COUNTS / ocmArmouryAttn indirectly and the
    // same ctx they did).
    renderDashboardPane(ctx);

    updateTabCounts();
    startCountdowns();
    initProfileRouting();
    // An open profile must SURVIVE the 60s auto-refresh. Without this the
    // dashboard would rebuild underneath it and the reader would be dumped back
    // to the tab list mid-read — the same class of bug as the folding <details>
    // cards fixed in v5.0.
    if (OCM_PROFILE_UID) renderMemberProfile();
    clearStaleTooltips();
  }

  /** Active OCs tab — planning/recruiting card grids (extracted from renderDashboard — receives the shared model as ctx). */
  function renderOcGridsSection(ctx) {
    const { faction, memberMap, armory, itemNames, lastOc, exMemberNames, itemValues, viewerId, loanedOut, crimes, mInfo, memberById, assignedIds, readyOcs, planningOcs, recruitingOcs, blockedOcs, crimeDiffMap, ACTIVE, freeMembers, freeRecruits, recruitingByDiff, anyBelowMin, sortedDiffs, activeOcCount, now, stuckOcs, itemName, fmtRelative, fmtOcRelative, scoreSlotForMember, buildBestSlotAssignment, getBestSlotForMember, renderMembersTable } = ctx;
    // --- Build OC card grids
    const gridPlanning   = document.getElementById('ocm-grid-planning');
    const gridRecruiting = document.getElementById('ocm-grid-recruiting');
    gridPlanning.innerHTML   = '';
    gridRecruiting.innerHTML = '';

    /** Compute a sort key for an OC so urgent/imminent ones sort first. */
    function ocSortKey(oc) {
      const now       = Math.floor(Date.now() / 1000);
      const ocSlots   = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
      const openCount = ocSlots.filter(s => !s.user).length;
      if (oc.executed_at && oc.executed_at > now) return oc.executed_at;
      if (oc.ready_at    && oc.ready_at    > now) return oc.ready_at;
      if (oc.time_left > 0) return now + oc.time_left + (openCount * 24 * 3600);
      if (openCount > 0)    return now + (openCount * 24 * 3600);
      if (oc.expired_at)    return oc.expired_at;
      return Infinity;
    }

    // The card's own accent/status is derived from the OC's real state at render
    // time (see below) — the label here just says which phase bucket it sits in.
    const planningAll = [
      ...readyOcs.map(o    => ({ ...o, badgeLabel: 'READY' })),
      ...blockedOcs.map(o  => ({ ...o, badgeLabel: 'BLOCKED' })),
      ...planningOcs.map(o => ({ ...o, badgeLabel: 'PLANNING' })),
    ].sort((a, b) => ocSortKey(a.oc) - ocSortKey(b.oc));

    const recruitingAll = recruitingOcs
      .map(o => ({ ...o, badgeLabel: 'RECRUITING' }))
      .sort((a, b) => ocSortKey(a.oc) - ocSortKey(b.oc));

    // --- Update phase header labels
    const planningDiff = {};
    for (const { oc } of planningAll) {
      const diff = oc.difficulty ?? '?';
      planningDiff[diff] = (planningDiff[diff] || 0) + 1;
    }
    const planningBreakdownHtml = Object.keys(planningDiff)
      .sort((a, b) => Number(a) - Number(b))
      .map(diff => {
        const count = planningDiff[diff];
        return `<span class="ocm-diff-chip ocm-diff-chip-plan" title="Difficulty ${diff}: ${count} OC${count !== 1 ? 's' : ''} planning">D${diff} <strong>${count}</strong></span>`;
      }).join('');
    OCM_COUNTS.activeOc = planningAll.length + recruitingAll.length;
    OCM_COUNTS.planning = planningAll.length;
    OCM_COUNTS.recruiting = recruitingAll.length;

    const planningHeader = document.getElementById('ocm-planning-header');
    planningHeader.innerHTML = `<span>Planning</span><span class="ocm-phase-count">${planningAll.length}</span>`
      + (planningBreakdownHtml ? `<span class="ocm-phase-chips">${planningBreakdownHtml}</span>` : '<span style="margin-left:auto"></span>')
      + `<span class="ocm-phase-collapse">▼</span>`;

    const diffBreakdown = {};
    for (const { oc } of recruitingAll) {
      const diff = oc.difficulty ?? '?';
      if (!diffBreakdown[diff]) diffBreakdown[diff] = { ocs: 0, slots: 0 };
      diffBreakdown[diff].ocs++;
      const ocSlotList = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
      diffBreakdown[diff].slots += ocSlotList.filter(s => !s.user).length;
    }
    const breakdownHtml = Object.keys(diffBreakdown)
      .sort((a, b) => Number(a) - Number(b))
      .map(diff => {
        const { ocs, slots } = diffBreakdown[diff];
        return `<span class="ocm-diff-chip" title="Difficulty ${diff}: ${ocs} OC${ocs !== 1 ? 's' : ''}, ${slots} open slot${slots !== 1 ? 's' : ''}">D${diff} <strong>${ocs}</strong> · <strong>${slots}</strong> open</span>`;
      }).join('');
    const recruitingHeader = document.getElementById('ocm-recruiting-header');
    const openTotal = recruitingAll.reduce((n, { oc }) => {
      const s = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
      return n + s.filter(x => !x.user).length;
    }, 0);
    recruitingHeader.innerHTML = `<span>Recruiting</span><span class="ocm-phase-count">${recruitingAll.length}</span>`
      + `<span style="font-size:10px;color:var(--ocm-text-muted);font-weight:400">${openTotal} open slot${openTotal === 1 ? '' : 's'}</span>`
      + (breakdownHtml ? `<span class="ocm-phase-chips">${breakdownHtml}</span>` : '<span style="margin-left:auto"></span>')
      + `<span class="ocm-phase-collapse">▼</span>`;

    // --- Next OC banner
    const nextOc = planningAll.length > 0 ? planningAll[0].oc : null;
    const bannerEl = document.getElementById('ocm-next-banner');

    if (nextOc) {
      const ocSlotList = Array.isArray(nextOc.slots) ? nextOc.slots : Object.values(nextOc.slots || []);
      const executesAt = (nextOc.executed_at && nextOc.executed_at > now ? nextOc.executed_at : null)
                      ?? (nextOc.ready_at    && nextOc.ready_at    > now ? nextOc.ready_at    : null);
      const timeLeft   = nextOc.time_left ?? null;
      const openCount  = ocSlotList.filter(s => !s.user).length;

      let timeDisplay;
      if (executesAt) {
        const tctStr  = new Date(executesAt * 1000).toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false });
        const tctDate = new Date(executesAt * 1000).toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short' });
        const openExtra = openCount > 0 ? ` + ~${fmtTime(openCount * 24 * 3600)} (${openCount} open)` : '';
        timeDisplay = `<span class="ocm-time" data-until="${executesAt}">${fmtTime(executesAt - now)}</span>${openExtra} <span style="opacity:.6;font-size:11px">(${tctDate} ${tctStr} TCT)</span>`;
      } else if (timeLeft > 0) {
        const openExtra = openCount > 0 ? ` + ~${fmtTime(openCount * 24 * 3600)} (${openCount} open)` : '';
        timeDisplay = `~${fmtTime(timeLeft)}${openExtra} <span style="opacity:.6;font-size:11px">(paused)</span>`;
      } else if (openCount > 0) {
        timeDisplay = `~${fmtTime(openCount * 24 * 3600)} <span style="opacity:.6;font-size:11px">(${openCount} slot${openCount > 1 ? 's' : ''} × 24h est.)</span>`;
      } else {
        timeDisplay = `<span style="color:var(--ocm-cpr-good);font-weight:bold">Ready to initiate!</span>`;
      }

      // Banner issues are intentionally limited to hard blockers that stop the OC
      // from initiating cleanly: an open slot, a member who's hospital/jail/travelling/
      // abroad, or a member missing their required item. (Armory-wide shortages and
      // CPR-fit advice live on the Items and Optimize tabs so the banner stays terse.)
      const issues = [];
      for (const slot of ocSlotList) {
        const uid      = slot.user?.id ? String(slot.user.id) : null;
        const info     = uid ? mInfo[uid] : null;
        const slotRole = slot.position_info?.label || slot.position || 'Unknown';

        if (!uid) {
          issues.push({ sev: 'crit', msg: `Open slot: ${slotRole}` });
        } else if (info && isBlocked(info.status)) {
          issues.push({ sev: 'crit', msg: `${info.name} — ${info.status}` });
        }
        const req = slot.item_requirement;
        if (req && uid && !req.is_available) {
          issues.push({ sev: 'warn', msg: `${info?.name || uid} missing: ${itemName(req)}` });
        }
      }

      const hasCritIssue = issues.some(i => i.sev === 'crit');
      const hasWarnIssue = issues.some(i => i.sev === 'warn');
      const bannerClass  = hasCritIssue ? 'banner-crit' : hasWarnIssue ? 'banner-warn' : 'banner-ok';
      const bannerIcon   = hasCritIssue ? '🔴' : hasWarnIssue ? '⚠️' : '✅';

      const issuesHtml = issues.length > 0
        ? `<div class="ocm-banner-issues">${issues.map(i => `<span class="ocm-banner-issue">${i.sev === 'crit' ? '🔴' : '⚠️'} ${i.msg}</span>`).join('')}</div>`
        : `<div style="font-size:11px;margin-top:3px;opacity:.7">No issues — ready to initiate on schedule.</div>`;

      bannerEl.className = bannerClass;
      bannerEl.style.display = 'block';
      bannerEl.innerHTML = `
        <div class="ocm-banner-title">${bannerIcon} Next OC: <strong>${esc(nextOc.name)}</strong> &nbsp;·&nbsp; ${timeDisplay}</div>
        ${issuesHtml}`;

      GM_setValue(GMK.SIDEBAR_CACHE, JSON.stringify({
        name:       nextOc.name,
        executesAt: executesAt ?? null,
        severity:   hasCritIssue ? 'crit' : hasWarnIssue ? 'warn' : 'ok',
        issues:     issues.slice(0, 3),
        cachedAt:   now,
      }));

      // --- Leader slot advice ("your best open slot")
      // An OPEN slot has no CPR of its own (nobody's in it), so we look up the
      // VIEWER's own predicted CPR for that crime+role via TornStats data. Without
      // a viewer ID or CPR data we can't recommend, so the advisory hides instead
      // of showing a meaningless 0%.
      const leaderAdvisoryEl = document.getElementById('ocm-leader-advice');
      const myAssignEl = document.getElementById('ocm-my-assignment');
      if (leaderAdvisoryEl) {
        const myId = viewerId || GM_getValue(GMK.MY_PLAYER_ID, '') || null;
        const haveTs = myId && Object.keys(tsCprData).length > 0;

        // ── ARE *YOU* IN THE RIGHT OC?
        // Same weight-vs-CPR question as People > Assignments, but pointed at the
        // person running the script. Torn's live CPR is authoritative here; TornStats
        // is only used to predict roles you're NOT currently in.
        let mine = null;
        if (myId) {
          for (const [ocId, oc] of Object.entries(crimes)) {
            if (!oc || !ACTIVE.has((oc.status || '').toLowerCase())) continue;
            const ocSlots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
            for (const s of ocSlots) {
              if (String(s.user?.id ?? '') !== String(myId)) continue;
              const role = s.position_info?.label || s.position || 'Unknown';
              mine = {
                ocId: oc.id ?? ocId,
                ocName: oc.name || `OC #${ocId}`,
                role,
                cpr: s.checkpoint_pass_rate ?? null,
                weight: getWeight(oc.name || '', role),
                difficulty: oc.difficulty ?? '?',
                status: (oc.status || '').toLowerCase(),
                readyAt: oc.ready_at ?? oc.executed_at ?? null,
              };
              break;
            }
            if (mine) break;
          }
        }

        if (myAssignEl) {
          if (!mine) {
            myAssignEl.style.display = 'none';
          } else {
            const hiW = mine.weight != null && mine.weight >= WEIGHT_HIGH;
            const loW = mine.weight != null && mine.weight < WEIGHT_MID;
            const loC = mine.cpr != null && mine.cpr < CPR_WARN;
            let verdict, vCol, vWhy;
            if (mine.cpr == null) {
              verdict = 'No CPR yet'; vCol = 'var(--ocm-text-muted)';
              vWhy = "Torn hasn't reported your CPR for this role yet.";
            } else if (hiW && loC) {
              verdict = '🔴 You are the weak link'; vCol = 'var(--ocm-cpr-crit)';
              vWhy = `${mine.role} drives ${mine.weight.toFixed(0)}% of this OC's success and you're at ${mine.cpr}% CPR. You are the biggest risk to this crime — consider stepping aside for someone stronger, or train the role up.`;
            } else if (loC) {
              verdict = '🟡 Below par, low stakes'; vCol = 'var(--ocm-cpr-warn)';
              vWhy = `${mine.cpr}% is under the ${CPR_WARN}% threshold, but ${mine.role} only drives ${mine.weight != null ? mine.weight.toFixed(0) + '%' : 'a little'} of the outcome — not urgent.`;
            } else if (loW && mine.cpr >= 90) {
              verdict = '🔵 You are underused'; vCol = 'var(--ocm-link)';
              vWhy = `You're at ${mine.cpr}% but ${mine.role} only drives ${mine.weight.toFixed(0)}% of this OC. You'd be worth more on a role that actually decides it.`;
            } else {
              verdict = '🟢 Good fit'; vCol = 'var(--ocm-cpr-good)';
              vWhy = `${mine.cpr}% CPR on a ${mine.weight != null ? mine.weight.toFixed(0) + '%' : '?'}-weight role. You're in the right seat.`;
            }

            // Is there an open slot elsewhere you'd genuinely be better in? Only worth
            // saying if TornStats predicts a clearly higher CPR *and* it isn't a
            // lower-stakes role — otherwise it's noise.
            let swap = null;
            if (haveTs && mine.cpr != null) {
              for (const [ocId2, oc2] of Object.entries(crimes)) {
                if (!oc2 || (oc2.status || '').toLowerCase() !== 'recruiting') continue;
                const s2 = Array.isArray(oc2.slots) ? oc2.slots : Object.values(oc2.slots || []);
                for (const slot2 of s2) {
                  if (slot2.user?.id) continue;
                  const r2 = slot2.position_info?.label || slot2.position || '?';
                  const t2 = tsGetCpr(myId, oc2.name || '', r2);
                  if (!t2) continue;
                  const w2 = getWeight(oc2.name || '', r2);
                  const gain = t2.cpr - mine.cpr;
                  if (gain < 10) continue;
                  if (w2 != null && mine.weight != null && w2 < mine.weight) continue;  // don't trade down
                  if (!swap || t2.cpr > swap.cpr) swap = { ocId: oc2.id ?? ocId2, ocName: oc2.name || `OC #${ocId2}`, role: r2, cpr: t2.cpr, weight: w2, gain };
                }
              }
            }

            myAssignEl.style.display = 'block';
            myAssignEl.innerHTML = `
              <div style="font-size:10px;color:var(--ocm-link);text-transform:uppercase;letter-spacing:.08em;font-weight:bold;margin-bottom:6px">Your OC</div>
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px">
                <span style="font-weight:bold;color:var(--ocm-text)">${esc(mine.role)}</span>
                <span style="color:var(--ocm-text-muted)">in</span>
                <span style="color:var(--ocm-text-dim);font-weight:bold">${esc(mine.ocName)}</span>
                <span style="color:var(--ocm-text-faint);font-size:10px">D${mine.difficulty}</span>
                <span style="color:${vCol};font-weight:bold;cursor:help" title="${esc(vWhy)}">${verdict}</span>
                <span style="margin-left:auto;display:flex;gap:10px;font-size:11px">
                  <span style="color:var(--ocm-text-muted)" title="Torn's own figure for you in this role.">CPR: <strong style="color:${mine.cpr == null ? '#555' : mine.cpr >= CPR_WARN ? 'var(--ocm-cpr-good)' : mine.cpr >= CPR_CRIT ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-crit)'}">${mine.cpr != null ? mine.cpr + '%' : '?'}</strong></span>
                  <span style="color:var(--ocm-text-muted)" title="How much this role drives the OC's success.">Weight: <strong style="color:${mine.weight == null ? '#555' : mine.weight >= WEIGHT_HIGH ? 'var(--ocm-cpr-warn)' : '#aaa'}">${mine.weight != null ? mine.weight.toFixed(0) + '%' : '?'}</strong></span>
                </span>
              </div>
              ${swap ? `<div style="margin-top:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                  <span style="font-size:11px;color:var(--ocm-text-muted)">Better fit open:
                    <b style="color:var(--ocm-text-dim)">${esc(swap.role)}</b> in <b style="color:var(--ocm-text-dim)">${esc(swap.ocName)}</b>
                    — est. <b style="color:var(--ocm-cpr-good)">${swap.cpr}%</b> <span style="color:var(--ocm-cpr-good)">(+${swap.gain.toFixed(0)})</span>${swap.weight != null ? `, weight ${swap.weight.toFixed(0)}%` : ''}</span>
                  <button class="ocm-join-btn" data-ocid="${esc(String(swap.ocId))}" data-ocname="${esc(swap.ocName)}" data-role="${esc(swap.role)}"
                          title="Jump to ${esc(swap.role)} in ${esc(swap.ocName)}. You must leave your current OC first — Torn will not let you hold two slots.">Join that instead ▸</button>
                </div>` : ''}`;
            const swapBtn = myAssignEl.querySelector('.ocm-join-btn');
            if (swapBtn) swapBtn.addEventListener('click', () => joinOcSlot(swapBtn.dataset.ocid, swapBtn.dataset.ocname, swapBtn.dataset.role));
          }
        }

        const leaderSlots = [];
        if (haveTs) {
          for (const [ocId, oc] of Object.entries(crimes)) {
            if (!oc || (oc.status || '').toLowerCase() !== 'recruiting') continue;
            const ocSlots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
            for (const slot of ocSlots) {
              if (slot.user?.id) continue;
              const role   = slot.position_info?.label || slot.position || 'Unknown';
              // Look up the viewer's predicted CPR for this exact crime+role
              const tsRes  = tsGetCpr(myId, oc.name || '', role);
              const cpr    = tsRes?.cpr ?? null;
              if (cpr == null) continue; // no CPR data for you in this role — skip
              const weight = getWeight(oc.name || '', role);
              leaderSlots.push({ ocName: oc.name || `OC #${ocId}`, ocId: oc.id ?? ocId, role, cpr, weight, difficulty: oc.difficulty ?? '?', expiredAt: oc.expired_at ?? null, timeLeft: oc.time_left ?? null });
            }
          }
        }
        if (leaderSlots.length === 0 || mine) {
          // Hide rather than mislead: either we don't know the viewer, have no TS CPR
          // data, none of the open roles have a prediction for them — or they're
          // ALREADY in an OC, in which case the "Your OC" panel above is the answer
          // and a "best open slot" would just be noise.
          leaderAdvisoryEl.style.display = 'none';
        } else {
          const nowTs2 = Math.floor(Date.now() / 1000);
          function urgencyBonusL(s) {
            let bonus = 0;
            if (s.expiredAt) {
              const secsToExpiry = s.expiredAt - nowTs2;
              if (secsToExpiry > 0 && secsToExpiry < 6  * 3600) bonus += 500;
              else if (secsToExpiry > 0 && secsToExpiry < 24 * 3600) bonus += 200;
            }
            if (s.timeLeft != null) {
              if (s.timeLeft < 12 * 3600) bonus += 100;
              else if (s.timeLeft < 24 * 3600) bonus +=  50;
            }
            return Math.min(bonus, 999);
          }
          const scored = leaderSlots.map(s => {
            const cpr    = s.cpr ?? 0;
            const weight = s.weight ?? 15;
            const diff   = Number(s.difficulty) || 0;
            const eligible    = cpr >= CPR_WARN;
            const comfort     = eligible ? Math.max(0, (cpr - CPR_WARN) / (100 - CPR_WARN)) : 0;
            const weightBonus = weight * comfort;
            let tag = null;
            if (cpr < CPR_CRIT)           tag = 'risky';
            else if (cpr < CPR_WARN)      tag = 'marginal';
            else if (weight < WEIGHT_MID) tag = 'underutilised';
            else                          tag = 'good';
            const score = eligible
              ? diff * 1000 + urgencyBonusL(s) + weightBonus + cpr
              : -(1000 - cpr);
            return { ...s, score, tag, eligible, urgent: urgencyBonusL(s) > 0 };
          }).sort((a, b) => b.score - a.score);
          const top    = scored[0];
          const cprCol = top.cpr == null ? '#555' : top.cpr >= CPR_WARN ? 'var(--ocm-cpr-good)' : top.cpr >= CPR_CRIT ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-crit)';
          const wCol   = top.weight == null ? '#555' : top.weight >= WEIGHT_HIGH ? 'var(--ocm-cpr-warn)' : top.weight >= WEIGHT_MID ? '#aaa' : '#555';
          const tagLabel = top.tag === 'good'
            ? '<span style="font-size:10px;background:#14201a;color:var(--ocm-cpr-good);border-radius:3px;padding:1px 5px">&#10003; Good fit</span>'
            : top.tag === 'underutilised'
              ? '<span style="font-size:10px;background:#1c1810;color:var(--ocm-cpr-warn);border-radius:3px;padding:1px 5px">&#9432; Low-weight role</span>'
              : top.tag === 'marginal'
                ? '<span style="font-size:10px;background:#1c1810;color:var(--ocm-cpr-warn);border-radius:3px;padding:1px 5px">&#9888; Marginal CPR</span>'
                : '<span style="font-size:10px;background:#1c1410;color:var(--ocm-cpr-crit);border-radius:3px;padding:1px 5px">&#9888; Below threshold</span>';
          const urgLabel2 = top.urgent ? (() => {
            const secsLeft = top.expiredAt ? top.expiredAt - Math.floor(Date.now()/1000) : null;
            return secsLeft != null && secsLeft < 6 * 3600
              ? '<span style="font-size:10px;background:#181810;color:var(--ocm-cpr-warn);border-radius:3px;padding:1px 5px">&#9201; Expires soon</span>'
              : secsLeft != null && secsLeft < 24 * 3600
                ? '<span style="font-size:10px;background:#181810;color:var(--ocm-cpr-warn);border-radius:3px;padding:1px 5px">&#9201; Expiring today</span>'
                : '<span style="font-size:10px;background:#181810;color:var(--ocm-cpr-warn);border-radius:3px;padding:1px 5px">&#9201; Nearly ready</span>';
          })() : '';
          leaderAdvisoryEl.style.display = 'block';
          leaderAdvisoryEl.innerHTML = `
            <div style="font-size:10px;color:var(--ocm-link);text-transform:uppercase;letter-spacing:.08em;font-weight:bold;margin-bottom:6px">Your best open slot</div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px">
              <span style="font-weight:bold;color:var(--ocm-text)">${top.role}</span>
              <span style="color:var(--ocm-text-muted)">in</span>
              <span style="color:var(--ocm-text-dim);font-weight:bold">${top.ocName}</span>
              <span style="color:var(--ocm-text-faint);font-size:10px">D${top.difficulty}</span>
              ${tagLabel}${urgLabel2}
              <span style="margin-left:auto;display:flex;gap:10px;font-size:11px">
                <span style="color:var(--ocm-text-muted)">CPR: <strong style="color:${cprCol}">${top.cpr != null ? top.cpr+'%' : '?'}</strong></span>
                <span style="color:var(--ocm-text-muted)">Weight: <strong style="color:${wCol}">${top.weight != null ? top.weight.toFixed(0)+'%' : '?'}</strong></span>
              </span>
            </div>
            <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
              <button id="ocm-join-btn" class="ocm-join-btn"
                      data-ocid="${esc(String(top.ocId))}"
                      data-ocname="${esc(top.ocName)}"
                      data-role="${esc(top.role)}"
                      title="Jump to ${esc(top.ocName)} in the crimes list and open the ${esc(top.role)} slot. Torn asks you to confirm before you actually join.">Join this slot ▸</button>
              ${scored.length > 1 ? `<span style="font-size:10px;color:var(--ocm-text-faint)">${scored.length} open slots total — showing best fit</span>` : ''}
            </div>`;
          const joinBtn = document.getElementById('ocm-join-btn');
          if (joinBtn) joinBtn.addEventListener('click', () => {
            joinOcSlot(joinBtn.dataset.ocid, joinBtn.dataset.ocname, joinBtn.dataset.role);
          });
        }
      }
    } else {
      bannerEl.style.display = 'none';
      GM_setValue(GMK.SIDEBAR_CACHE, '');
    }

    // Re-apply collapse state to phase headers after their content is refreshed
    ['ocm-planning-header','ocm-recruiting-header'].forEach(id => {
      const el   = document.getElementById(id);
      const grid = document.getElementById(id === 'ocm-planning-header' ? 'ocm-grid-planning' : 'ocm-grid-recruiting');
      if (el && grid && grid.style.display === 'none') el.classList.add('collapsed');
    });
    if (recruitingAll.length === 0) gridRecruiting.innerHTML = '<div class="ocm-empty-phase">No OCs currently recruiting.</div>';

    const allOcs = [...planningAll, ...recruitingAll];
    if (allOcs.length === 0) gridPlanning.innerHTML = '<div class="ocm-empty-phase">No active OCs found.</div>';

    // --- Render OC cards (v2 design)
    for (const { id, oc, badgeLabel } of allOcs) {
      const isRecruiting = badgeLabel === 'RECRUITING';
      const targetGrid   = isRecruiting ? gridRecruiting : gridPlanning;
      const ocSlots      = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);

      // ── status: the worst thing about this OC decides the accent colour
      const hasCrit  = ocSlots.some(s => s.user?.id && s.checkpoint_pass_rate != null && s.checkpoint_pass_rate < CPR_CRIT);
      const hasLow   = ocSlots.some(s => s.user?.id && s.checkpoint_pass_rate != null && s.checkpoint_pass_rate < CPR_WARN);
      const hasBlock = ocSlots.some(s => { const u = s.user?.id ? String(s.user.id) : null; return u && mInfo[u] && isBlocked(mInfo[u].status); });
      const hasMissing = ocSlots.some(s => s.user?.id && s.item_requirement && !s.item_requirement.is_available);
      let status = badgeLabel.toLowerCase();           // ready | blocked | planning | recruiting
      if (hasCrit)       status = 'crit';
      else if (hasBlock) status = 'blocked';
      else if (hasLow || hasMissing) status = 'warn';

      const openCount   = ocSlots.filter(s => !s.user).length;
      const filledCount = ocSlots.length - openCount;
      const fillPct     = ocSlots.length ? (filledCount / ocSlots.length) * 100 : 0;

      // ── time: one number, one sub-line. No essay.
      const executesAt = oc.executed_at ?? oc.ready_at ?? null;
      const timeLeft   = oc.time_left ?? null;
      const expiredAt  = oc.expired_at ?? null;
      const tct = ts => {
        const d = new Date(ts * 1000);
        return d.toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short' })
             + ' ' + d.toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false }) + ' TCT';
      };
      let timeVal, timeSub = '', timeCls = '';
      if (executesAt && executesAt > now) {
        const secs = executesAt - now;
        timeVal = `<span class="ocm-time" data-until="${executesAt}">${fmtTime(secs)}</span>`;
        timeSub = tct(executesAt);
        if (secs < 3600) timeCls = 'is-soon';
      } else if (timeLeft > 0) {
        timeVal = fmtTime(timeLeft);
        timeSub = 'paused';
      } else if (openCount > 0) {
        timeVal = `~${fmtTime(openCount * 24 * 3600)}`;
        timeSub = `est. · ${openCount} open`;
      } else if (expiredAt) {
        const secs = expiredAt - now;
        timeVal = `<span class="ocm-time" data-until="${expiredAt}">${secs > 0 ? fmtTime(secs) : 'Expired'}</span>`;
        timeSub = 'until expiry';
        if (secs < 86400) timeCls = 'is-soon';
      } else {
        timeVal = 'Ready';
        timeSub = 'no timer';
        timeCls = 'is-ready';
      }

      // ── slots: filled first (by planning progress), open slots last
      const sortedSlots = [...ocSlots].sort((a, b) => {
        const pa = a.user ? (a.user.progress ?? 0) : -1;
        const pb = b.user ? (b.user.progress ?? 0) : -1;
        return pb - pa;
      });

      const slotsHtml = sortedSlots.map(slot => {
        const user   = slot.user;
        const uid    = user?.id ? String(user.id) : null;
        const member = uid ? mInfo[uid] : null;
        const role   = slot.position_info?.label || slot.position || 'Unknown';
        const cpr    = slot.checkpoint_pass_rate ?? null;
        const weight = getWeight(oc.name || '', role);

        // Weight is its own column now (it's a number, and numbers belong in a
        // column you can scan down — not tucked inside the role label as an italic).
        const wCls = weight != null && weight >= WEIGHT_HIGH ? 'w-high' : '';

        // member + status dot
        let memberHtml;
        if (member) {
          const blocked = isBlocked(member.status);
          const tip = blocked ? `${member.name} — ${member.status}${member.description ? ': ' + member.description : ''}` : `${member.name} — ${member.status}`;
          memberHtml = `<span class="oc2-dot ${blocked ? 'is-blocked' : ''}" title="${esc(tip)}"></span>`
                     + `<a href="/profiles.php?XID=${uid}" target="_blank" title="${esc(tip)}">${esc(member.name)}</a>`;
        } else {
          memberHtml = `<span class="oc2-dot is-open"></span><span class="oc2-open-label">Open</span>`;
        }

        // tags: item requirement, TornStats CPR, risk
        const tags = [];
        const req = slot.item_requirement;
        if (req) {
          const st = !uid ? 'open' : req.is_available ? 'ok' : (armory[String(req.id)] ? 'armory' : 'missing');
          const cls  = { ok: 't-ok', armory: 't-armory', missing: 't-missing', open: 't-open' }[st];
          const icon = { ok: '✓', armory: '🏛', missing: '✗', open: '?' }[st];
          const tip  = { ok: 'Has the item', armory: 'In armory — needs loaning', missing: 'MISSING — not in armory', open: 'Needed once filled' }[st];
          const kind = (req.is_reusable ?? false) ? '🔧' : '📦';
          tags.push(`<a class="oc2-tag ${cls}" href="${marketUrlOf(req.id)}" target="_blank" title="${esc(itemName(req))} ${kind}\n${tip}\nClick to open item market">${icon}${kind}</a>`);
        }
        // TornStats CPR badge.
        //
        // Torn's OWN cpr (slot.checkpoint_pass_rate, shown as the big % on the right)
        // is the authoritative number. TornStats is a third-party ESTIMATE, and when
        // both were shown side by side they just contradicted each other ("TS 50" next
        // to "78%") with nothing saying which to believe. So:
        //   · live CPR present  -> show only the live figure. TS adds nothing.
        //   · live CPR missing  -> TS is the only estimate we have: show it, clearly
        //                          marked as an estimate.
        // The TornStats numbers are still used where they genuinely help — predicting
        // a member's fit for a role they are NOT currently in (People > Assignments,
        // and the best-slot advisor).
        if (uid && cpr == null && Object.keys(tsCprData).length > 0) {
          const tsRes = tsGetCpr(uid, oc.name || '', role);
          if (tsRes != null) {
            const col = tsRes.cpr >= CPR_WARN ? 'var(--ocm-cpr-good)' : tsRes.cpr >= CPR_CRIT ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-crit)';
            const src_ = tsRes.observed
              ? `from a real run this member did${tsRes.at ? ' on ' + dateStr(tsRes.at) : ''}`
              : "TornStats' estimate";
            const how = tsRes.exact ? 'this exact role' : 'a different role in this crime (conservative — their lowest)';
            tags.push(`<span class="oc2-tag t-ts" style="color:${col}" title="Torn hasn't reported a CPR for this slot yet. Predicted ${tsRes.cpr}% — ${src_}, matched on ${how}.">${tsRes.observed ? 'obs' : 'est'} ${tsRes.cpr}</span>`);
          }
        }
        const isRisk = uid && weight != null && weight >= WEIGHT_HIGH && cpr != null && cpr < CPR_WARN;
        if (isRisk) tags.push(`<span class="oc2-tag t-risk" title="High-weight role (${weight.toFixed(0)}%) held at low CPR (${cpr}%) — the biggest threat to this OC">⚠</span>`);

        // CPR
        const cprTxt = cpr != null ? `${cpr}%` : (uid ? '?' : '–');
        const cprCls = cpr == null ? '' : cpr >= CPR_WARN ? 'c-good' : cpr >= CPR_CRIT ? 'c-warn' : 'c-crit';

        // planning progress as a hairline under the row
        const prog    = uid ? Math.min(100, Math.max(0, user.progress ?? 0)) : 0;
        const progCol = prog >= 100 ? 'var(--ocm-cpr-good)' : 'var(--ocm-link)';
        const rowCls  = [uid ? '' : 'is-open', isRisk ? 'is-risk' : ''].filter(Boolean).join(' ');

        return `<div class="oc2-slot ${rowCls}" style="--oc2-prog:${prog}%;--oc2-prog-col:${uid ? progCol : 'transparent'}">
            <span class="oc2-role" title="${esc(role)}">${esc(role)}</span>
            <span class="oc2-member">${memberHtml}</span>
            <span class="oc2-tags">${tags.join('')}</span>
            <span class="oc2-w ${wCls}" title="${weight != null
              ? `This role drives ${weight.toFixed(0)}% of the crime's success.`
              : 'No weight data for this role.'}">${weight != null ? weight.toFixed(0) + '%' : '—'}</span>
            <span class="oc2-cpr ${cprCls}" title="${cpr != null
              ? `Checkpoint Pass Rate: ${cpr}%. Torn's own figure — the chance ${member ? esc(member.name) : 'this member'} clears their checkpoints in this role. Below ${CPR_WARN}% is a problem; below ${CPR_CRIT}% is critical.`
              : (uid ? 'Torn has not reported a CPR for this slot yet.' : 'Slot is empty — no CPR until someone joins.')}">${cprTxt}</span>
          </div>`;
      }).join('');

      // ── footer: only the things a leader must act on
      const issues = [];
      if (openCount > 0) issues.push({ c: 'i-warn', t: `${openCount} open slot${openCount > 1 ? 's' : ''}` });
      const blockedNames = ocSlots
        .map(s => (s.user?.id ? mInfo[String(s.user.id)] : null))
        .filter(m => m && isBlocked(m.status));
      for (const m of blockedNames) issues.push({ c: 'i-crit', t: `${m.name}: ${m.status}` });
      const missing = ocSlots.filter(s => s.user?.id && s.item_requirement && !s.item_requirement.is_available);
      for (const s of missing) {
        const m = mInfo[String(s.user.id)];
        issues.push({ c: 'i-crit', t: `${m?.name || s.user.id} needs ${itemName(s.item_requirement)}` });
      }
      if (hasCrit) issues.push({ c: 'i-crit', t: `CPR below ${CPR_CRIT}%` });
      else if (hasLow) issues.push({ c: 'i-warn', t: `CPR below ${CPR_WARN}%` });
      if (issues.length === 0) issues.push({ c: 'i-ok', t: '✓ No blockers' });
      const footHtml = `<div class="oc2-foot">${issues.slice(0, 4).map(i => `<span class="oc2-issue ${i.c}">${esc(i.t)}</span>`).join('')}${issues.length > 4 ? `<span class="oc2-issue i-warn">+${issues.length - 4} more</span>` : ''}</div>`;

      const statusChip = { ready: 'is-ready', recruiting: 'is-recruiting', blocked: 'is-blocked', crit: 'is-blocked', warn: 'is-warn', planning: '' }[status] || '';

      const card = document.createElement('div');
      card.className = 'oc2';
      card.dataset.status = status;
      card.innerHTML = `
        <div class="oc2-head">
          <div style="min-width:0;flex:1">
            <div class="oc2-name" title="${esc(oc.name || `OC #${id}`)}">${esc(oc.name || `OC #${id}`)}</div>
            <div class="oc2-meta">
              <span class="oc2-chip is-diff">D${oc.difficulty ?? '?'}</span>
              <span class="oc2-chip ${statusChip}">${esc(badgeLabel)}</span>
            </div>
          </div>
          <div class="oc2-time">
            <span class="oc2-time-val ${timeCls}">${timeVal}</span>
            <span class="oc2-time-sub">${esc(timeSub)}</span>
          </div>
        </div>
        <div class="oc2-fill">
          <div class="oc2-fillbar"><span style="width:${fillPct}%"></span></div>
          <span class="oc2-fill-label">${filledCount}/${ocSlots.length} filled</span>
        </div>
        <div class="oc2-slot-head">
          <span>Role</span><span>Member</span><span>Item</span>
          <span class="r" title="How much this role drives the crime's success">Wgt</span>
          <span class="r" title="Checkpoint Pass Rate">CPR</span>
        </div>
        <div class="oc2-slots">${slotsHtml}</div>
        ${footHtml}`;
      targetGrid.appendChild(card);
    }

  }

  /** Action tab — available members, newsletter builder, recruits (extracted from renderDashboard — receives the shared model as ctx). */
  function renderActionSection(ctx) {
    const { faction, memberMap, armory, itemNames, lastOc, exMemberNames, itemValues, viewerId, loanedOut, crimes, mInfo, memberById, assignedIds, readyOcs, planningOcs, recruitingOcs, blockedOcs, crimeDiffMap, ACTIVE, freeMembers, freeRecruits, recruitingByDiff, anyBelowMin, sortedDiffs, activeOcCount, now, stuckOcs, itemName, fmtRelative, fmtOcRelative, scoreSlotForMember, buildBestSlotAssignment, getBestSlotForMember, renderMembersTable } = ctx;
    // ── Available members (non-recruits, not in OC)
    const availTitle = document.getElementById('ocm-title-available');
    const avail      = document.getElementById('ocm-available');
    if (availTitle) {
      const mailLink = availTitle.querySelector('a');
      availTitle.textContent = `Members Available for Assignment (${freeMembers.length})`;
      if (mailLink) availTitle.appendChild(mailLink);
    }


    if (freeMembers.length === 0) {
      avail.innerHTML = '<span style="color:var(--ocm-text-faint);font-size:11px">All active members are assigned.</span>';
    } else {
      renderMembersTable(freeMembers, avail, '', true);
      injectTsBadges(avail);
    }
    // ── Newsletter button — build message with per-member recommendations
    const newsletterBtn = document.getElementById('ocm-newsletter-btn');
    if (newsletterBtn && !newsletterBtn._wired) {
      newsletterBtn._wired = true;
      newsletterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (freeMembers.length === 0) {
          ocmToast('No available members to message.', 'warn');
          return;
        }
        // Build per-member recommendation list
        const lines = [];
        lines.push('Hey team — we have open OC slots that need filling. Here are the best fits based on your CPR:');
        lines.push('');
        const sorted = [...freeMembers].sort((a, b) => a.name.localeCompare(b.name));
        let withRecs = 0;
        for (const m of sorted) {
          const best = getBestSlotForMember(m.id);
          if (best && best.cpr != null) {
            const cprTxt = best.exact ? `${best.cpr}%` : `~${best.cpr}%`;
            lines.push(`• ${m.name}: ${best.role} in ${best.ocName} (D${best.difficulty}, CPR ${cprTxt})`);
            withRecs++;
          } else {
            lines.push(`• ${m.name}: no CPR data yet — please join any OC you're eligible for to build a baseline`);
          }
        }
        lines.push('');
        lines.push('Please join your recommended slot when you can. Thanks!');
        const message = lines.join('\n');

        // Copy to clipboard
        const opened = () => window.open('https://www.torn.com/factions.php?step=your#/tab=controls&option=newsletter&target=notInOC', '_blank');
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(message).then(() => {
            ocmToast(`✓ Copied (${withRecs} members with recs). Opening newsletter page — paste into the body.`, 'ok');
            opened();
          }).catch(() => {
            // Fallback if clipboard API blocked
            const ta = document.createElement('textarea');
            ta.value = message;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); } catch(_) {}
            ta.remove();
            ocmToast(`✓ Copied (${withRecs} members with recs). Opening newsletter page — paste into the body.`, 'ok');
            opened();
          });
        } else {
          // Old browser fallback
          const ta = document.createElement('textarea');
          ta.value = message;
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); } catch(_) {}
          ta.remove();
          ocmToast(`✓ Copied (${withRecs} members with recs). Opening newsletter page — paste into the body.`, 'ok');
          opened();
        }
      });
    }

    // ── Recruits section
    const recruitsEl    = document.getElementById('ocm-recruits');
    const recruitsTitle = document.getElementById('ocm-title-recruits');
    if (recruitsTitle) recruitsTitle.textContent = `🚧 Recruits — cannot join OCs (${freeRecruits.length})`;
    if (freeRecruits.length === 0) {
      recruitsEl.innerHTML = '<span style="color:var(--ocm-text-faint);font-size:11px">No recruits currently unassigned.</span>';
    } else {
      const notice = document.createElement('div');
      notice.className = 'ocm-recruits-notice';
      notice.innerHTML = 'Members listed here hold the <strong>Recruit</strong> rank and are not yet eligible to participate in Organised Crimes.';
      recruitsEl.innerHTML = '';
      recruitsEl.appendChild(notice);
      const tbl = document.createElement('div');
      renderMembersTable(freeRecruits, tbl, 'recruits-table');
      recruitsEl.appendChild(tbl);
    }

  }

  /** Status tab — blocked members (jail/hospital/abroad) (extracted from renderDashboard — receives the shared model as ctx). */
  function renderStatusSection(ctx) {
    const { faction, memberMap, armory, itemNames, lastOc, exMemberNames, itemValues, viewerId, loanedOut, crimes, mInfo, memberById, assignedIds, readyOcs, planningOcs, recruitingOcs, blockedOcs, crimeDiffMap, ACTIVE, freeMembers, freeRecruits, recruitingByDiff, anyBelowMin, sortedDiffs, activeOcCount, now, stuckOcs, itemName, fmtRelative, fmtOcRelative, scoreSlotForMember, buildBestSlotAssignment, getBestSlotForMember, renderMembersTable } = ctx;
    // ── Blocked members (in OC + jail/hospital/abroad)
    const blockedEl    = document.getElementById('ocm-blocked');
    const blockedTitle = document.getElementById('ocm-title-blocked');
    const allBlocked   = [];
    for (const m of Object.values(memberMap)) {
      const mid = String(m.id);
      if (!assignedIds.has(mid) || !isBlocked(m.status?.state)) continue;
      let ocName = null, ocExecutesAt = null;
      for (const oc of Object.values(crimes)) {
        if (!oc?.slots) continue;
        const ocSlots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots);
        if (!ocSlots.some(s => s.user?.id && String(s.user.id) === mid)) continue;
        ocName = oc.name || `OC #${oc.id}`;
        const exAt = oc.executed_at ?? oc.ready_at ?? null;
        ocExecutesAt = exAt && exAt > now ? exAt : null;
        break;
      }
      allBlocked.push({ id: mid, name: m.name, status: m.status?.state, description: m.status?.description || '', ocName, ocExecutesAt });
    }
    if (blockedTitle) blockedTitle.textContent = `Blocked Members — In OC (${allBlocked.length})`;
    allBlocked.sort((a, b) => {
      if (a.ocExecutesAt && b.ocExecutesAt) return a.ocExecutesAt - b.ocExecutesAt;
      if (a.ocExecutesAt) return -1;
      if (b.ocExecutesAt) return 1;
      return 0;
    });
    if (allBlocked.length === 0) {
      blockedEl.innerHTML = '<span style="color:var(--ocm-text-faint);font-size:11px">No blocked members. ✓</span>';
    } else {
      blockedEl.innerHTML = allBlocked.map(m => {
        const s           = (m.status || '').toLowerCase();
        let statusLabel;
        if (s === 'abroad' || s === 'traveling') {
          statusLabel = travelInfo(m.status, m.description).label;
        } else {
          statusLabel = m.status || 'Unknown';
        }
        const ocLabel = m.ocName
          ? `<span class="ocm-blocked-oc" title="OC: ${m.ocName}">${m.ocName}</span>`
          : '<span class="ocm-blocked-oc"></span>';
        const countdownLabel = m.ocExecutesAt
          ? `<span class="ocm-blocked-timer ocm-time" data-until="${m.ocExecutesAt}">${fmtTime(m.ocExecutesAt - now)}</span>`
          : `<span class="ocm-blocked-timer notimer">No timer</span>`;
        return `
          <div class="ocm-blocked-row">
            <a class="ocm-blocked-name" href="/profiles.php?XID=${m.id}" target="_blank">${esc(m.name)}</a>
            <span class="ocm-blocked-status" title="${m.description || m.status}">${statusLabel}</span>
            ${ocLabel}
            ${countdownLabel}
          </div>`;
      }).join('');
    }

  }

  /** Optimize tab — low-CPR and underutilized members (extracted from renderDashboard — receives the shared model as ctx). */
  function renderOptimizeSection(ctx) {
    const { faction, memberMap, armory, itemNames, lastOc, exMemberNames, itemValues, viewerId, loanedOut, crimes, mInfo, memberById, assignedIds, readyOcs, planningOcs, recruitingOcs, blockedOcs, crimeDiffMap, ACTIVE, freeMembers, freeRecruits, recruitingByDiff, anyBelowMin, sortedDiffs, activeOcCount, now, stuckOcs, itemName, fmtRelative, fmtOcRelative, scoreSlotForMember, buildBestSlotAssignment, getBestSlotForMember, renderMembersTable } = ctx;
    // ── Low CPR members
    const lowCprEl    = document.getElementById('ocm-lowcpr');
    const lowCprTitle = document.getElementById('ocm-title-lowcpr');
    const lowCprRows  = [];

    for (const [ocId, oc] of Object.entries(crimes)) {
      if (!oc || typeof oc !== 'object') continue;
      const phase = (oc.status || '').toLowerCase();
      if (!ACTIVE.has(phase)) continue;
      const ocName = oc.name || `OC #${ocId}`;
      const slots  = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
      for (const slot of slots) {
        const uid = slot.user?.id ? String(slot.user.id) : null;
        if (!uid) continue;
        const cpr = slot.checkpoint_pass_rate ?? null;
        if (cpr === null || cpr >= CPR_WARN) continue;
        const roleName = slot.position_info?.label || slot.position || 'Unknown role';
        const weight   = getWeight(ocName, roleName);
        const isRisk   = weight != null && weight >= WEIGHT_HIGH;
        lowCprRows.push({ uid, name: mInfo[uid]?.name || `#${uid}`, cpr, roleName, ocName, weight, isRisk });
      }
    }

    lowCprRows.sort((a, b) => a.cpr - b.cpr || (b.weight ?? 0) - (a.weight ?? 0));
    OCM_COUNTS.lowCpr = lowCprRows.length;
    if (lowCprTitle) lowCprTitle.textContent = `⚠ Low CPR Members — below ${CPR_WARN}% (${lowCprRows.length})`;

    if (lowCprRows.length === 0) {
      lowCprEl.innerHTML = '<span style="color:var(--ocm-text-faint);font-size:11px">No members with low CPR. ✓</span>';
    } else {
      lowCprEl.innerHTML = lowCprRows.map(r => {
        const cprCls     = r.cpr < CPR_CRIT ? 'cpr-crit' : 'cpr-warn';
        const weightHtml = r.weight != null
          ? `<span class="ocm-slot-weight ${r.weight >= WEIGHT_HIGH ? 'w-high' : r.weight >= WEIGHT_MID ? 'w-mid' : 'w-low'}" title="Role weight: ${r.weight.toFixed(1)}%">${r.weight.toFixed(0)}%</span>`
          : '';
        const riskBadge = r.isRisk
          ? `<span title="High-weight role (${r.weight.toFixed(0)}%) with low CPR — significant risk" style="font-size:11px;cursor:help">⚠</span>`
          : '';
        return `
          <div class="ocm-lowcpr-row">
            <a class="ocm-lowcpr-name" href="/profiles.php?XID=${r.uid}" target="_blank">${esc(r.name)}</a>
            <span class="ocm-lowcpr-oc" title="${r.ocName}">${r.ocName}</span>
            <span class="ocm-lowcpr-role" title="${r.roleName}">${r.roleName}</span>
            <span class="ocm-lowcpr-extras">${weightHtml}${riskBadge}</span>
            <span class="ocm-slot-cpr ${cprCls} ocm-lowcpr-cpr">${r.cpr}%</span>
          </div>`;
      }).join('');
    }

    // ── Underutilized members: in a low-difficulty OC but could clear a harder one
    // For each member currently assigned to an OC, compare their current OC's
    // difficulty against the highest-difficulty *recruiting* OC where they'd
    // still meet the CPR warn threshold (estimated via TornStats / OC history).
    // If a meaningfully harder OC is available, flag them as underutilized.
    const overEl    = document.getElementById('ocm-overqualified');
    const overTitle = document.getElementById('ocm-title-overqualified');
    const overRows  = [];

    // Build the set of difficulties currently recruiting (with at least one open slot)
    // mapped to a representative open OC name + role per difficulty.
    const recruitingOpenByDiff = {};
    for (const [ocId, oc] of Object.entries(crimes)) {
      if (!oc || (oc.status || '').toLowerCase() !== 'recruiting') continue;
      const diff   = Number(oc.difficulty) || 0;
      const ocName = oc.name || `OC #${ocId}`;
      const slots  = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
      for (const slot of slots) {
        if (slot?.user?.id) continue; // only open slots
        const role = slot.position_info?.label || slot.position || 'Unknown';
        if (!recruitingOpenByDiff[diff]) recruitingOpenByDiff[diff] = [];
        recruitingOpenByDiff[diff].push({ ocName, role, difficulty: diff });
      }
    }
    const recruitingDiffs = Object.keys(recruitingOpenByDiff).map(Number).sort((a, b) => b - a); // high → low

    // For each filled slot in an active OC, see if a harder recruiting OC fits
    for (const [ocId, oc] of Object.entries(crimes)) {
      if (!oc || typeof oc !== 'object') continue;
      const phase = (oc.status || '').toLowerCase();
      if (!ACTIVE.has(phase)) continue;
      const curDiff = Number(oc.difficulty) || 0;
      const ocName  = oc.name || `OC #${ocId}`;
      const slots   = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);

      for (const slot of slots) {
        const uid = slot?.user?.id ? String(slot.user.id) : null;
        if (!uid) continue;
        const curCpr = slot.checkpoint_pass_rate ?? null;
        // Only consider members performing WELL in their current OC (>= warn).
        // A struggling member belongs in the Low CPR section, not here.
        if (curCpr === null || curCpr < CPR_WARN) continue;
        const curRole = slot.position_info?.label || slot.position || 'Unknown';

        // Find the highest-difficulty recruiting OC where this member would still
        // clear the warn threshold, strictly harder than their current OC.
        // CRITICAL: only trust an EXACT estimate — real TornStats data or personal
        // history for that specific crime+role. Fuzzy/overall-lowest fallbacks
        // (the "~" estimates) are not reliable predictions of a brand-new role at
        // a much higher difficulty, so they're rejected here to avoid suggesting
        // everyone could run the hardest OC in the game.
        let bestUpgrade = null;
        for (const hd of recruitingDiffs) {
          if (hd <= curDiff) break; // sorted desc — nothing harder left
          for (const cand of recruitingOpenByDiff[hd]) {
            const est = tsGetCpr(uid, cand.ocName, cand.role);
            // Require an exact match (TornStats exact, or personal history exact)
            if (est && est.exact && est.cpr >= CPR_WARN) {
              bestUpgrade = { ...cand, estCpr: est.cpr, exact: est.exact, source: est.source };
              break;
            }
          }
          if (bestUpgrade) break;
        }
        if (!bestUpgrade) continue;

        overRows.push({
          uid, name: mInfo[uid]?.name || `#${uid}`,
          curOc: ocName, curDiff, curRole, curCpr,
          upOc: bestUpgrade.ocName, upDiff: bestUpgrade.difficulty, upRole: bestUpgrade.role,
          upCpr: bestUpgrade.estCpr, upExact: bestUpgrade.exact, upSource: bestUpgrade.source,
          gain: bestUpgrade.difficulty - curDiff,
        });
      }
    }

    // Sort by biggest difficulty jump, then by current performance
    overRows.sort((a, b) => b.gain - a.gain || b.curCpr - a.curCpr);
    if (overTitle) overTitle.textContent = `⬆ Underutilized — could run a harder OC (${overRows.length})`;

    if (overRows.length === 0) {
      overEl.innerHTML = '<span style="color:var(--ocm-text-faint);font-size:11px">No underutilized members — everyone is in an appropriately challenging OC. ✓</span>';
    } else {
      overEl.innerHTML = overRows.map(r => {
        const upCprCls = r.upCpr >= CPR_WARN ? 'cpr-good' : r.upCpr >= CPR_CRIT ? 'cpr-warn' : 'cpr-crit';
        const srcTag = r.upSource === 'history'
          ? `<span style="font-size:9px;color:var(--ocm-text-muted);background:#1c1810;border:1px solid #3a3018;padding:0 4px;border-radius:2px;margin-left:3px" title="Estimate from this member's OC history">hist</span>`
          : '';
        return `
          <div class="ocm-lowcpr-row" title="${esc(r.name)} is doing well in a D${r.curDiff} OC and has real data showing they can clear a D${r.upDiff} OC">
            <a class="ocm-lowcpr-name" href="/profiles.php?XID=${r.uid}" target="_blank">${esc(r.name)}</a>
            <span class="ocm-lowcpr-oc">
              <span style="color:var(--ocm-text-muted)">D${r.curDiff}</span>
              <span style="color:var(--ocm-cpr-good);font-weight:bold">${r.curCpr}%</span>
              <span style="color:var(--ocm-text-faint)">→</span>
              <span style="color:var(--ocm-link);font-weight:bold">D${r.upDiff}</span>
            </span>
            <span class="ocm-lowcpr-role" title="${r.upOc} · ${r.upRole}">${r.upRole} in ${r.upOc}</span>
            <span class="ocm-lowcpr-extras"><span class="ocm-badge" title="+${r.gain} difficulty levels">+${r.gain}</span></span>
            <span class="ocm-slot-cpr ${upCprCls} ocm-lowcpr-cpr" title="Known CPR at D${r.upDiff}">${r.upCpr}%${srcTag}</span>
          </div>`;
      }).join('');
    }

  }

  /** Reference tab — analytics, member/OC history, charts, downloads (extracted from renderDashboard — receives the shared model as ctx). */
  /**
   * ASSIGNMENTS — is each member actually in the right seat?
   *
   * A card shows you one OC's CPRs. This shows the whole faction at once and asks
   * the question the cards can't: does this person's CPR match the IMPORTANCE of
   * the role they're sitting in?
   *
   * Two variables decide it: the role's WEIGHT (how much it drives the OC's success)
   * and the member's CPR in it. That gives four cases, and only two of them matter:
   *
   *                 low CPR              high CPR
   *   high weight   🔴 RISK              🟢 aligned
   *                 (drives the OC,      (your best people
   *                  held weakly —        on the roles that
   *                  fix this first)      decide it)
   *
   *   low weight    🟡 weak but cheap    🔵 UNDERUSED
   *                 (low stakes, so      (a strong member parked
   *                  it can wait)         where it barely matters)
   *
   * RISK is what loses OCs. UNDERUSED is what wastes people. Both are actionable;
   * the other two are noise, so they're shown but never flagged.
   *
   * Where TornStats data exists we also check whether the member would be markedly
   * better in a DIFFERENT role of the same OC, and say so.
   */
  function renderAssignmentsSection(ctx) {
    const { crimes, mInfo, ACTIVE } = ctx;
    const el = document.getElementById('ocm-people-assign');
    if (!el) return;

    const rows = [];
    for (const [ocId, oc] of Object.entries(crimes)) {
      if (!oc || typeof oc !== 'object') continue;
      if (!ACTIVE.has((oc.status || '').toLowerCase())) continue;
      const ocName = oc.name || `OC #${ocId}`;
      const slots  = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);

      // Every role in this OC, so we can spot a better seat for someone.
      const roleList = slots.map(s => s.position_info?.label || s.position || '?');

      for (const slot of slots) {
        const uid = slot.user?.id ? String(slot.user.id) : null;
        if (!uid) continue;
        const role   = slot.position_info?.label || slot.position || 'Unknown';
        const cpr    = slot.checkpoint_pass_rate ?? null;
        const weight = getWeight(ocName, role);
        const name   = mInfo[uid]?.name || `#${uid}`;
        const blocked = mInfo[uid] ? isBlocked(mInfo[uid].status) : false;

        // Verdict — see the table in the docblock above.
        const hiW = weight != null && weight >= WEIGHT_HIGH;
        const loW = weight != null && weight < WEIGHT_MID;
        const loC = cpr != null && cpr < CPR_WARN;
        let verdict, vClass, vTip;
        if (cpr == null) {
          verdict = 'No data'; vClass = 'v-none'; vTip = 'No CPR reported for this slot.';
        } else if (hiW && loC) {
          verdict = '🔴 Risk'; vClass = 'v-risk';
          vTip = `${role} drives ${weight.toFixed(0)}% of this OC's success, but ${name} is only at ${cpr}% CPR. This is the single biggest threat to ${ocName} — swap them out or train them up.`;
        } else if (loC) {
          verdict = '🟡 Weak'; vClass = 'v-weak';
          vTip = `${cpr}% CPR is below your ${CPR_WARN}% threshold, but ${role} is only ${weight != null ? weight.toFixed(0) + '%' : 'low'} weight — low stakes, so this can wait.`;
        } else if (loW && cpr >= 90) {
          verdict = '🔵 Underused'; vClass = 'v-under';
          vTip = `${name} is at ${cpr}% CPR but ${role} only drives ${weight.toFixed(0)}% of the OC. They're wasted here — move them to a role that decides the outcome.`;
        } else {
          verdict = '🟢 Aligned'; vClass = 'v-ok';
          vTip = `${cpr}% CPR on a ${weight != null ? weight.toFixed(0) + '%' : '?'}-weight role. Good match.`;
        }

        // Would they be better in a different role of this same OC?
        let better = null;
        const mine = tsGetCpr(uid, ocName, role);
        if (mine != null) {
          for (const other of roleList) {
            if (normRole(other) === normRole(role)) continue;
            const alt = tsGetCpr(uid, ocName, other);
            if (alt == null) continue;
            const gain = alt.cpr - mine.cpr;
            if (gain >= 10 && (!better || alt.cpr > better.cpr)) better = { role: other, cpr: alt.cpr, gain, observed: !!alt.observed };
          }
        }

        rows.push({ uid, name, ocName, role, cpr, weight, verdict, vClass, vTip, better, blocked, ocId });
      }
    }

    // Worst first: Risk, then Underused, then Weak, then Aligned.
    const rank = { 'v-risk': 0, 'v-under': 1, 'v-weak': 2, 'v-ok': 3, 'v-none': 4 };
    rows.sort((a, b) => rank[a.vClass] - rank[b.vClass]
                     || (b.weight ?? 0) - (a.weight ?? 0)
                     || (a.cpr ?? 0) - (b.cpr ?? 0));

    const nRisk  = rows.filter(r => r.vClass === 'v-risk').length;
    const nUnder = rows.filter(r => r.vClass === 'v-under').length;
    const nOk    = rows.filter(r => r.vClass === 'v-ok').length;

    const badge = document.getElementById('ocm-sb-assign');
    if (badge) {
      const attn = nRisk + nUnder;
      badge.textContent = attn;
      badge.style.display = attn ? '' : 'none';
      badge.classList.toggle('has-attn', nRisk > 0);
    }

    if (rows.length === 0) {
      el.innerHTML = '<div style="color:var(--ocm-text-faint);font-size:12px;padding:10px 2px">Nobody is assigned to an active OC.</div>';
      return;
    }

    const kpis = `<div class="ocm-kpis">`
      + kpiTile('Misplaced', nRisk, 'high-weight role, low CPR', nRisk ? 'var(--ocm-cpr-crit)' : 'var(--ocm-cpr-good)')
      + kpiTile('Underused', nUnder, 'strong member, minor role', nUnder ? 'var(--ocm-link)' : 'var(--ocm-text-dim)')
      + kpiTile('Aligned', nOk, 'CPR matches the stakes', 'var(--ocm-cpr-good)')
      + kpiTile('Assigned', rows.length, 'members in active OCs', 'var(--ocm-text)')
      + `</div>`;

    const cprCol = c => c == null ? 'var(--ocm-text-faint)'
                    : c >= CPR_WARN ? 'var(--ocm-cpr-good)'
                    : c >= CPR_CRIT ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-crit)';
    const wCol   = w => w == null ? 'var(--ocm-text-faint)'
                    : w >= WEIGHT_HIGH ? 'var(--ocm-cpr-warn)'
                    : w >= WEIGHT_MID ? 'var(--ocm-text-dim)' : 'var(--ocm-text-faint)';

    el.innerHTML = kpis + `
      <div style="font-size:11px;color:var(--ocm-text-muted);margin-bottom:8px;line-height:1.6">
        Every member in an active OC, matched against how much their role actually matters.
        <b style="color:var(--ocm-cpr-crit)">🔴 Risk</b> = a high-weight role held at low CPR — this is what loses OCs, fix it first.
        <b style="color:var(--ocm-link)">🔵 Underused</b> = a strong member parked on a role that barely moves the outcome.
        Hover any verdict for the reasoning.</div>
      <table class="ocm-pay-table">
        <thead><tr>
          <th style="width:auto">Member</th>
          <th style="width:150px">OC</th>
          <th style="width:110px">Role</th>
          <th style="width:62px;text-align:right" title="How much this role drives the OC's success">Weight</th>
          <th style="width:56px;text-align:right">CPR</th>
          <th style="width:96px">Verdict</th>
          <th style="width:auto">Better fit</th>
        </tr></thead>
        <tbody>${rows.map(r => `<tr>
          <td><a href="/profiles.php?XID=${r.uid}" target="_blank">${esc(r.name)}</a>${r.blocked ? ' <span style="color:var(--ocm-cpr-crit)" title="Currently jailed / hospital / abroad">⛔</span>' : ''}</td>
          <td style="color:var(--ocm-text-dim)" title="${esc(r.ocName)}">${esc(r.ocName)}</td>
          <td style="color:var(--ocm-text-muted)">${esc(r.role)}</td>
          <td style="text-align:right;color:${wCol(r.weight)};font-weight:600">${r.weight != null ? r.weight.toFixed(0) + '%' : '—'}</td>
          <td style="text-align:right;color:${cprCol(r.cpr)};font-weight:700">${r.cpr != null ? r.cpr + '%' : '—'}</td>
          <td class="${r.vClass}" title="${esc(r.vTip)}" style="cursor:help">${r.verdict}</td>
          <td style="color:var(--ocm-text-muted);font-size:11px">${r.better
            ? `<span title="${esc(r.name)} is predicted at ${r.better.cpr}% for ${esc(r.better.role)} — ${r.better.gain.toFixed(0)} points better than their current role. Source: ${r.better.observed ? 'a real run they did' : 'TornStats estimate'}.">${esc(r.better.role)} <b style="color:var(--ocm-cpr-good)">+${r.better.gain.toFixed(0)}</b>${r.better.observed ? '' : ' <span style="color:var(--ocm-text-faint)">est</span>'}</span>`
            : '<span style="color:var(--ocm-text-faint)">—</span>'}</td>
        </tr>`).join('')}</tbody></table>`;
  }

  // ─── DASHBOARD (v5.3) ──────────────────────────────────────────────────────
  // "What needs me right now", assembled from stores the suite already syncs —
  // zero extra API calls. Every card links into the pane that owns the detail,
  // so this adds a front door without becoming a second place to read the data.

  /** Switch tab (and optionally sub-tab) by driving the REAL controls, so this
   *  can never drift from initTabs' wiring the way a parallel implementation would. */
  function ocmGoto(tab, sub) {
    document.querySelector(`.ocm-tab[data-tab="${tab}"]`)?.click();
    if (sub) document.querySelector(`#ocm-pane-${tab} .ocm-subtab[data-sub="${sub}"]`)?.click();
    document.getElementById('ocm-root')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderDashboardPane(ctx) {
    const el = document.getElementById('ocm-dashboard');
    if (!el) return;
    const { crimes = {}, mInfo = {}, memberById = {}, ACTIVE, stuckOcs = [], freeMembers = [] } = ctx;
    const nowS = Math.floor(Date.now() / 1000);

    // ── Walk the active OCs once for everything crime-shaped.
    const openByOc = [];
    const riskRows = [];
    const loanRows = [];
    let openSlots = 0;
    for (const [ocId, oc] of Object.entries(crimes)) {
      if (!oc || !ACTIVE?.has((oc.status || '').toLowerCase())) continue;
      const name = oc.name || ('OC #' + ocId);
      const slots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || {});
      let open = 0;
      for (const s of slots) {
        const uid = s?.user?.id ? String(s.user.id) : null;
        const role = s?.position_info?.label || s?.position || '?';
        if (!uid) { open++; openSlots++; continue; }
        const cpr = s.checkpoint_pass_rate ?? null;
        const weight = getWeight(oc.name || '', role);
        if (weight != null && weight >= WEIGHT_HIGH && cpr != null && cpr < CPR_WARN) {
          riskRows.push({ name: mInfo[uid]?.name || ('#' + uid), uid, ocName: name, role, cpr, weight });
        }
        const req = s.item_requirement;
        if (req && req.is_available === false) {
          loanRows.push({ name: mInfo[uid]?.name || ('#' + uid), uid, ocName: name });
        }
      }
      if (open > 0) openByOc.push({ name, open, diff: oc.difficulty ?? '?' });
    }
    openByOc.sort((a, b) => b.open - a.open);
    riskRows.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0) || (a.cpr ?? 0) - (b.cpr ?? 0));

    // ── Money: OCs Torn has not recorded as paid out.
    let unpaidCount = 0, unpaidCash = 0;
    try {
      for (const r of Object.values(loadProfitLedger() || {})) {
        if (!(r.money > 0)) continue;
        if (r.payout?.paid) continue;
        unpaidCount++; unpaidCash += r.money;
      }
    } catch (_) {}

    // ── People: idle past a week, and blocked members inside an OC.
    const idle = [];
    for (const m of Object.values(memberById)) {
      const la = Number(m?.last_action?.timestamp ?? 0) || 0;
      if (la && (nowS - la) > 7 * 86400) {
        idle.push({ name: m.name || ('#' + m.id), uid: String(m.id), days: Math.floor((nowS - la) / 86400) });
      }
    }
    idle.sort((a, b) => b.days - a.days);

    // ── War: whatever is live right now.
    let warLine = null;
    try {
      const t = activeWarOpponent();
      if (t) {
        const myFid = String(GM_getValue(GMK.MY_FACTION_ID, '') || '');
        const us = (t.war.factions || []).find(f => String(f.id) === myFid) || {};
        const them = t.opp || {};
        warLine = { kind: 'war', text: `vs ${them.name || '#' + them.id}`,
                    right: `${(us.score ?? 0).toLocaleString()} : ${(them.score ?? 0).toLocaleString()}` };
      } else if (typeof chainIsLive === 'function' && chainIsLive() && _chainLive) {
        const remain = Math.max(0, Math.round(_chainLive.timeout - (Date.now() - _chainLive.at) / 1000));
        warLine = { kind: 'chain', text: `${_chainLive.current.toLocaleString()}-hit chain live`,
                    right: fmtTime(remain) + ' left' };
      }
    } catch (_) {}

    // ── Cards. A card only appears when it has something to say — an all-clear
    //    wall of zeroes is exactly the noise this pane exists to remove.
    const line = (main, right, uid) =>
      `<div class="ocm-dash-line"${uid ? ` data-ocm-profile="${esc(uid)}" style="cursor:pointer"` : ''}>
         <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${main}</span>
         ${right ? `<span class="r">${right}</span>` : ''}</div>`;

    const card = (cls, ico, title, n, body, goLabel, tab, sub) => `
      <div class="ocm-dash-card ${cls}">
        <div class="ocm-dash-h"><span>${ico}</span><span>${esc(title)}</span><span class="n">${n}</span></div>
        ${body}
        ${goLabel ? `<button class="ocm-dash-go" data-go-tab="${tab}"${sub ? ` data-go-sub="${sub}"` : ''}>${esc(goLabel)} →</button>` : ''}
      </div>`;

    const cards = [];

    if (openSlots > 0) cards.push(card('warn', '🎯', 'Open slots', openSlots,
      openByOc.slice(0, 3).map(o => line(esc(o.name), `${o.open} open · D${o.diff}`)).join('') +
      (freeMembers.length ? `<div class="ocm-dash-line"><span style="color:var(--ocm-text-muted)">${freeMembers.length} member${freeMembers.length === 1 ? '' : 's'} free to fill them</span></div>` : ''),
      'Fill slots', 'crimes', 'fill'));

    if (stuckOcs.length) cards.push(card('attn', '🚨', 'Stuck OCs', stuckOcs.length,
      stuckOcs.slice(0, 3).map(s => line(esc(s.oc.name || 'OC'),
        esc(s.blockers.map(b => b.name).slice(0, 2).join(', ')))).join(''),
      'Review', 'crimes', 'fill'));

    if (riskRows.length) cards.push(card('attn', '🔴', 'Risk seats', riskRows.length,
      riskRows.slice(0, 3).map(r => line(
        `${esc(r.name)} <span style="color:var(--ocm-text-muted)">· ${esc(r.role)}</span>`,
        `${r.cpr}% CPR`, r.uid)).join('') +
      `<div class="ocm-note" style="margin:6px 0 0">High-weight roles held below ${CPR_WARN}% — this is what loses OCs.</div>`,
      'See assignments', 'people', 'assign'));

    if (loanRows.length) cards.push(card('warn', '🤝', 'Waiting on an item', loanRows.length,
      loanRows.slice(0, 3).map(l => line(esc(l.name), esc(l.ocName), l.uid)).join(''),
      'Hand out loans', 'armoury', 'loans'));

    if (unpaidCount) cards.push(card('warn', '💸', 'Awaiting payout', unpaidCount,
      line('Not yet paid to members', fmtMoney(unpaidCash)) +
      `<div class="ocm-note" style="margin:6px 0 0">Still with the faction — pay it out on the OC page.</div>`,
      'Open payouts', 'money', 'payouts'));

    if (idle.length) cards.push(card('', '💤', 'Inactive 7d+', idle.length,
      idle.slice(0, 3).map(m => line(esc(m.name), `${m.days}d`, m.uid)).join(''),
      'See activity', 'people', 'activity'));

    if (warLine) cards.push(card('', warLine.kind === 'war' ? '⚔️' : '🔗',
      warLine.kind === 'war' ? 'Ranked war live' : 'Chain live', '',
      line(esc(warLine.text), esc(warLine.right)),
      warLine.kind === 'war' ? 'Open war' : 'Watch chain', 'war',
      warLine.kind === 'war' ? 'wars' : 'watch'));

    const allClear = !cards.length;
    // Published rather than scraped back out of the rendered heading — the v3.27
    // lesson that killed the whole class of "badge reads 0" bugs.
    OCM_COUNTS.dashboard = cards.length;
    OCM_COUNTS.dashAttn = cards.filter(c => c.includes('ocm-dash-card attn')).length;
    el.innerHTML = `
      <div class="ocm-section-title" id="ocm-title-dashboard" data-ocm-static="1">🏠 What needs you</div>
      ${allClear
        ? `<div class="ocm-dash-card"><div class="ocm-dash-ok">✓ Nothing needs attention right now — no open slots, no stuck OCs, no risk seats, nothing awaiting payout.</div>
             <div class="ocm-note" style="margin-top:6px">Cards appear here only when there's something to act on, so an empty board is the good outcome.</div></div>`
        : `<div class="ocm-dash-grid">${cards.join('')}</div>`}
      <div class="ocm-note">Built from data already synced — opening this costs no extra API calls. Every card links to the pane that owns the detail; member names open their profile.</div>`;

    el.querySelectorAll('[data-go-tab]').forEach(b =>
      b.addEventListener('click', () => ocmGoto(b.dataset.goTab, b.dataset.goSub)));
  }

  // ─── HISTORY (v5.2) — Roster · Scenarios · Runs ────────────────────────────
  // Replaces renderReferenceSection's single 1000-line vertical dump. The old
  // pane could only be SEARCHED (type a name, get a table); there was no way to
  // rank or scan the faction, which is the actual question a leader has. This is
  // roster-first: one sortable table of every player, drilling into the profile.

  const HIST_WINDOWS = [['7', '7d'], ['30', '30d'], ['90', '90d'], ['all', 'All']];
  // v5.3: three views became two. Scenarios and Runs LOOKED like duplicates because
  // both tables opened with the same four columns (OC · success · CPR · money) and
  // the thing that justified Scenarios — the per-seat failure breakdown — was hidden
  // behind a row click. They're merged: a scenario is the master row, and expanding
  // it shows BOTH which seat fails AND that scenario's own run history.
  const HIST_VIEWS = [['roster', '👥 Roster'], ['crimes', '🗂 Crimes']];

  function histState() {
    let filters = {};
    try { filters = JSON.parse(GM_getValue(GMK.HIST_FILTERS, '{}')) || {}; } catch (_) {}
    // v5.3 merged Scenarios + Runs into Crimes. Anyone sitting on either of the
    // retired views lands on the merged one rather than a blank pane.
    let view = GM_getValue(GMK.HIST_VIEW, 'roster');
    if (view === 'scenarios' || view === 'runs') { view = 'crimes'; GM_setValue(GMK.HIST_VIEW, view); }
    if (view !== 'roster' && view !== 'crimes') view = 'roster';
    return {
      view,
      win: String(GM_getValue(GMK.HIST_WINDOW, 'all')),
      filters,
    };
  }

  /** Live window merged OVER the archive — live wins on id, because payouts and
   *  final outcomes land after a row was first archived. */
  function histMergedCrimes(crimes) {
    const merged = {};
    for (const [id, oc] of Object.entries(loadOcArchive() || {})) merged[String(id)] = oc;
    for (const [id, oc] of Object.entries(crimes || {})) merged[String(oc?.id ?? id)] = oc;
    return merged;
  }

  function renderHistorySection(ctx) {
    const { crimes, mInfo = {}, exMemberNames = {} } = ctx;
    const el = document.getElementById('ocm-analytics');
    const titleEl = document.getElementById('ocm-title-analytics');
    if (!el) return;

    // PRESERVED SIDE EFFECT: this is what grows the persistent CPR archive past
    // Torn's ~100-OC API window. It lived in the old renderer; losing it would
    // silently stop the archive from ever growing again.
    recordCprHistory(crimes, mInfo, exMemberNames, getWeight, normOcStatus);

    const st = histState();
    const merged = histMergedCrimes(crimes);
    const archivedCount = Object.keys(loadOcArchive() || {}).length;

    const nowS = Math.floor(Date.now() / 1000);
    const cutoff = st.win === 'all' ? 0 : nowS - (parseInt(st.win, 10) * 86400);
    const nameOf = uid => mInfo[uid]?.name || exMemberNames[uid] || warMemberName(uid) || ('#' + uid);

    // ── One pass builds all three views. Doing this per-member would mean
    //    re-reading the ledgers 100 times.
    const completed = [];
    const memberMap = {};
    const scenMap = {};
    for (const oc of Object.values(merged)) {
      const outcome = normOcStatus(oc?.status);
      if (!outcome) continue;
      if (cutoff && (oc.executed_at || 0) < cutoff) continue;

      const slots = ocSlotList(oc).filter(s => s.uid);
      const cprs = slots.map(s => s.cpr).filter(v => v != null);
      const run = {
        ocId: String(oc.id ?? ''),
        name: oc.name || 'Unknown',
        difficulty: oc.difficulty ?? null,
        outcome,
        executedAt: oc.executed_at ?? null,
        respect: oc.rewards?.respect ?? null,
        money: oc.rewards?.money ?? null,
        paid: !!oc.rewards?.payout?.paid_at,
        avgCpr: cprs.length ? cprs.reduce((a, b) => a + b, 0) / cprs.length : null,
        slots: slots.map(s => ({ ...s, name: nameOf(s.uid), weight: getWeight(oc.name || '', s.role) })),
      };
      completed.push(run);

      const sk = (oc.name || 'Unknown').toLowerCase().replace(/\s+v\d+$/i, '').trim();
      run.scenKey = sk;   // so the merged Crimes view can group runs under their scenario
      const sc = scenMap[sk] || (scenMap[sk] = { key: sk, name: oc.name || 'Unknown', runs: 0, success: 0, failure: 0, expired: 0, cprSum: 0, cprN: 0, respect: 0, money: 0, roles: {} });
      sc.runs++;
      sc[outcome === 'successful' ? 'success' : outcome === 'failure' ? 'failure' : 'expired']++;
      if (run.avgCpr != null) { sc.cprSum += run.avgCpr; sc.cprN++; }
      if (outcome === 'successful') { sc.respect += run.respect || 0; sc.money += run.money || 0; }

      for (const s of slots) {
        const m = memberMap[s.uid] || (memberMap[s.uid] = {
          uid: s.uid, name: nameOf(s.uid), isEx: !mInfo[s.uid],
          runs: 0, success: 0, failure: 0, expired: 0,
          cprSum: 0, cprN: 0, roles: {}, bestDiff: null, lastRun: null, outcomes: [],
        });
        m.runs++;
        m[outcome === 'successful' ? 'success' : outcome === 'failure' ? 'failure' : 'expired']++;
        if (s.cpr != null) { m.cprSum += s.cpr; m.cprN++; }
        m.roles[s.role] = (m.roles[s.role] || 0) + 1;
        if (outcome === 'successful' && oc.difficulty != null && (m.bestDiff == null || oc.difficulty > m.bestDiff)) m.bestDiff = oc.difficulty;
        if ((oc.executed_at || 0) > (m.lastRun || 0)) m.lastRun = oc.executed_at || 0;
        m.outcomes.push({ t: oc.executed_at || 0, o: outcome });

        // Per-scenario role breakdown — which seat actually fails in this crime.
        // The data was always collected; nothing ever surfaced it.
        const r = sc.roles[s.role] || (sc.roles[s.role] = { role: s.role, n: 0, fail: 0, cprSum: 0, cprN: 0 });
        r.n++;
        if (outcome === 'failure') r.fail++;
        if (s.cpr != null) { r.cprSum += s.cpr; r.cprN++; }
      }
    }
    completed.sort((a, b) => (b.executedAt || 0) - (a.executedAt || 0));

    const rateOf = (s, f) => (s + f) > 0 ? s / (s + f) : null;
    const memberRows = Object.values(memberMap).map(m => {
      m.outcomes.sort((a, b) => b.t - a.t);
      const last10 = m.outcomes.slice(0, 10);
      const prior10 = m.outcomes.slice(10, 20);
      const r = arr => { const d = arr.filter(x => x.o !== 'expired'); return d.length ? d.filter(x => x.o === 'successful').length / d.length : null; };
      const recent = r(last10), prior = prior10.length >= 6 ? r(prior10) : null;
      const topRole = Object.entries(m.roles).sort((a, b) => b[1] - a[1])[0];
      return {
        ...m,
        rate: rateOf(m.success, m.failure),
        avgCpr: m.cprN ? m.cprSum / m.cprN : null,
        topRole: topRole ? topRole[0] : null,
        spark: last10.map(x => x.o),
        trend: (recent != null && prior != null) ? recent - prior : null,
        // Cached URL only (never bytes). '' falls through to the monogram, which
        // is what every row paints first regardless.
        avatar: avatarUrl(m.uid),
      };
    });

    const scenRows = Object.values(scenMap).map(s => ({
      ...s,
      rate: rateOf(s.success, s.failure),
      avgCpr: s.cprN ? s.cprSum / s.cprN : null,
      moneyPer: s.success ? s.money / s.success : null,
      respectPer: s.success ? s.respect / s.success : null,
      roleRows: Object.values(s.roles)
        .map(r => ({ ...r, avgCpr: r.cprN ? r.cprSum / r.cprN : null, failRate: r.n ? r.fail / r.n : 0 }))
        .sort((a, b) => b.failRate - a.failRate || b.n - a.n),
    })).sort((a, b) => b.runs - a.runs);

    const totS = completed.filter(r => r.outcome === 'successful').length;
    const totF = completed.filter(r => r.outcome === 'failure').length;
    const overall = rateOf(totS, totF);

    if (titleEl) titleEl.textContent = `📊 OC Performance`;

    // ── Header: window control + an HONEST provenance line. The old pane said
    //    "of 100 cap", which stopped being true the moment the archive backfill
    //    landed — it routinely analyses far more than 100 now.
    const winBtns = HIST_WINDOWS.map(([v, label]) =>
      `<button data-win="${v}" class="${st.win === v ? 'active' : ''}">${label}</button>`).join('');
    const viewBtns = HIST_VIEWS.map(([v, label]) =>
      `<button data-view="${v}" class="${st.view === v ? 'active' : ''}">${label}</button>`).join('');

    const header = `
      <div class="ocm-flexrow" style="margin-bottom:8px">
        <div class="ocm-seg" id="ocm-hist-win">${winBtns}</div>
        <span style="font-size:11px;color:var(--ocm-text-muted);margin-left:auto">
          <b style="color:var(--ocm-text)">${completed.length}</b> OCs ·
          <b style="color:${overall == null ? 'var(--ocm-text-muted)' : overall >= 0.85 ? 'var(--ocm-cpr-good)' : overall >= 0.65 ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-crit)'}">${overall == null ? '—' : Math.round(overall * 100) + '%'}</b> success
          · ${archivedCount ? `${archivedCount} archived + live window` : 'live window only — no archive built yet'}
        </span>
      </div>
      <div class="ocm-seg" id="ocm-hist-view" style="margin-bottom:12px">${viewBtns}</div>`;

    // ── Body
    let body = '';
    if (!completed.length) {
      body = `<div class="ocm-note">No completed OCs${st.win === 'all' ? '' : ' in this window'}. ${archivedCount ? '' : 'The full-history archive builds itself in the background on first run.'}</div>`;
    } else if (st.view === 'roster') {
      body = histRosterHtml(memberRows, st);
    } else {
      body = histCrimesHtml(scenRows, completed);
    }

    // ── Charts, folded into ONE drawer. They were five always-present cards
    //    each behind its own "Show Chart" button; nobody clicks five buttons.
    const charts = `
      <details class="ocm-war-card" data-key="hist-charts" style="margin-top:12px">
        <summary><span style="font-weight:700;color:var(--ocm-text)">📈 Charts</span>
          <span style="color:var(--ocm-text-muted);font-size:11px">success over time · CPR spread · participation</span></summary>
        <div class="ocm-war-card-body">
          <div id="ocm-chart-timeline" class="ocm-chart-wrap"></div>
          <div id="ocm-chart-cpr" class="ocm-chart-wrap"></div>
          <div id="ocm-chart-members" class="ocm-chart-wrap"></div>
        </div>
      </details>`;

    // ── TornStats CPR backfill — PRESERVED from the old pane.
    const tsTools = `
      <div class="ocm-flexrow" style="margin-top:12px">
        <button id="ocm-mh-cache-btn" class="ocm-chip-filter"
          title="Pull every member's current CPR from TornStats and fill gaps in the archive. Never overwrites a real observed run.">⬇ Cache old CPRs (TornStats)</button>
        <span id="ocm-mh-cache-status" style="font-size:11px;color:var(--ocm-text-muted)"></span>
      </div>`;

    const openKeys = openDetailKeys(el);
    el.innerHTML = header + body + charts + tsTools;
    restoreOpenDetails(el, openKeys);

    // ── Wiring
    const setState = (k, v) => { GM_setValue(k, v); renderHistorySection(ctx); };
    el.querySelectorAll('#ocm-hist-win button').forEach(b =>
      b.addEventListener('click', () => setState(GMK.HIST_WINDOW, b.dataset.win)));
    el.querySelectorAll('#ocm-hist-view button').forEach(b =>
      b.addEventListener('click', () => setState(GMK.HIST_VIEW, b.dataset.view)));

    if (st.view === 'roster') histWireRoster(el, memberRows, st, ctx);
    if (st.view === 'crimes') histWireExpanders(el, '.ocm-scen-row', '.ocm-scen-detail');

    // Charts render lazily — only when the drawer is actually opened.
    const drawer = el.querySelector('details[data-key="hist-charts"]');
    if (drawer) {
      const draw = () => { if (drawer.open) histDrawCharts(completed, memberRows); };
      drawer.addEventListener('toggle', draw);
      draw();
    }

    histWireTsCache(el, ctx);
    document.getElementById('ocm-last-update').textContent = `Updated ${new Date().toLocaleTimeString()}`;
    clearStaleTooltips();
  }

  /** ROSTER — the view the old pane had no equivalent of. */
  function histRosterHtml(rows, st) {
    const f = st.filters || {};
    const chip = (k, label, title) =>
      `<button class="ocm-chip-filter ${f[k] ? 'active' : ''}" data-filter="${k}" title="${esc(title)}">${label}</button>`;
    return `
      <div class="ocm-flexrow" style="margin-bottom:10px">
        <input id="ocm-hist-search" type="text" placeholder="Filter by name…" autocomplete="off"
               style="flex:1;min-width:140px;max-width:240px">
        ${chip('lowcpr', '⚠ Low CPR', 'Average CPR below the warn threshold')}
        ${chip('nodata', '· No CPR', 'No observed CPR on record')}
        ${chip('ex', '👻 Left faction', 'Include members who have left')}
        ${chip('stale', '💤 Inactive 14d+', "Hasn't run an OC in 14 days")}
      </div>
      <div class="ocm-tablewrap"><table class="ocm-datatable ocm-roster" id="ocm-hist-roster">
        <thead><tr>
          <th class="num" title="Position in the current sort">#</th>
          <th>Player</th>
          <th class="num">OCs</th>
          <th class="num">Success</th>
          <th class="num">Avg CPR</th>
          <th class="num" title="Highest difficulty successfully cleared">Best</th>
          <th>Top role</th>
          <th title="Last 10 outcomes, newest first">Last 10</th>
          <th class="num" title="Success rate of the last 10 versus the 10 before">Trend</th>
          <th class="num">Last run</th>
        </tr></thead>
        <tbody></tbody>
      </table></div>
      <div class="ocm-note" style="margin-top:8px">Click any row for that member's full profile.
        Expired OCs are excluded from success rate — nobody ran them.
        <span class="ocm-prov-dot obs"></span> observed CPR ·
        <span class="ocm-prov-dot est"></span> estimated.</div>`;
  }

  function histWireRoster(el, rows, st, ctx) {
    const table = el.querySelector('#ocm-hist-roster');
    const search = el.querySelector('#ocm-hist-search');
    if (!table) return;
    const nowS = Math.floor(Date.now() / 1000);
    let q = '';

    const visible = () => {
      const f = st.filters || {};
      return rows.filter(r => {
        if (!f.ex && r.isEx) return false;
        if (f.lowcpr && !(r.avgCpr != null && r.avgCpr < CPR_WARN)) return false;
        if (f.nodata && r.avgCpr != null) return false;
        if (f.stale && !(r.lastRun && (nowS - r.lastRun) > 14 * 86400)) return false;
        if (q && !r.name.toLowerCase().includes(q)) return false;
        return true;
      });
    };

    const ago = ts => {
      if (!ts) return '—';
      const d = nowS - ts;
      return d < 86400 ? Math.floor(d / 3600) + 'h' : Math.floor(d / 86400) + 'd';
    };
    const rateCol = v => v == null ? 'var(--ocm-text-muted)'
      : v >= 0.85 ? 'var(--ocm-cpr-good)' : v >= 0.65 ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-crit)';

    const paint = () => {
      const list = visible();
      table.tBodies[0].innerHTML = list.length ? list.map((r, i) => `
        <tr class="clickable" data-ocm-profile="${esc(r.uid)}" title="Open ${esc(r.name)}'s profile">
          <td class="num ocm-rank${i < 3 ? ' top' : ''}">${i + 1}</td>
          <td><span class="ocm-rosname">${ocmAvatarHtml(r.uid, r.name, r.avatar, 'xs')}<span class="n">${esc(r.name)}</span>${
            r.isEx ? '<span class="ex" title="No longer in the faction">left</span>' : ''}</span></td>
          <td class="num">${r.runs}</td>
          <td class="num" style="color:${rateCol(r.rate)};font-weight:700">${r.rate == null ? '—' : Math.round(r.rate * 100) + '%'}</td>
          <td class="num ${r.avgCpr != null ? cprClass(r.avgCpr) : ''}">${r.avgCpr != null ? r.avgCpr.toFixed(0) + '%' : '—'}${
            r.avgCpr != null ? `<span class="ocm-prov-dot obs" title="Observed — from CPRs Torn reported on real runs"></span>` : ''}</td>
          <td class="num">${r.bestDiff != null ? 'D' + r.bestDiff : '—'}</td>
          <td style="color:var(--ocm-text-muted)">${r.topRole ? esc(r.topRole) : '—'}</td>
          <td><span class="ocm-run-spark">${r.spark.map(o =>
            `<i class="${o === 'successful' ? 's' : o === 'failure' ? 'f' : 'e'}"></i>`).join('')}</span></td>
          <td class="num" style="color:${r.trend == null ? 'var(--ocm-text-faint)' : r.trend > 0.05 ? 'var(--ocm-cpr-good)' : r.trend < -0.05 ? 'var(--ocm-cpr-crit)' : 'var(--ocm-text-muted)'}"
              title="${r.trend == null ? 'Needs 16+ runs to compare windows' : 'Last 10 vs the 10 before'}">${
            r.trend == null ? '—' : (r.trend > 0.05 ? '▲' : r.trend < -0.05 ? '▼' : '–') + ' ' + Math.abs(Math.round(r.trend * 100)) + '%'}</td>
          <td class="num" style="color:var(--ocm-text-muted)">${ago(r.lastRun)}</td>
        </tr>`).join('')
        : `<tr><td colspan="10" style="color:var(--ocm-text-faint);font-style:italic">No members match these filters.</td></tr>`;
    };

    ocmSortTable(table, rows, [
      null,                                   // rank — reflects the sort, so sorting BY it is meaningless
      { key: 'name', get: r => r.name },
      { key: 'runs', get: r => r.runs, num: true },
      { key: 'rate', get: r => r.rate, num: true },
      { key: 'cpr', get: r => r.avgCpr, num: true },
      { key: 'best', get: r => r.bestDiff, num: true },
      { key: 'role', get: r => r.topRole },
      null,
      { key: 'trend', get: r => r.trend, num: true },
      { key: 'last', get: r => r.lastRun, num: true },
    ], paint, { key: 'runs', dir: 'desc' });

    el.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.filter;
      st.filters[k] = !st.filters[k];
      GM_setValue(GMK.HIST_FILTERS, JSON.stringify(st.filters));
      b.classList.toggle('active', !!st.filters[k]);
      paint();
    }));
    if (search) search.addEventListener('input', () => { q = search.value.trim().toLowerCase(); paint(); });
  }

  /**
   * CRIMES — Scenarios and Runs, merged (v5.3).
   *
   * They were separate views and read as duplicates: both opened with OC · success ·
   * CPR · money, and the only thing that justified Scenarios — WHICH SEAT FAILS —
   * was hidden behind a row click. So the differentiator was invisible at rest and
   * the two looked like twins.
   *
   * Now the scenario is the master row, and expanding it answers both questions in
   * one place: which seat loses this crime, and every time you've run it.
   */
  function histCrimesHtml(rows, allRuns) {
    const rateCol = v => v == null ? 'var(--ocm-text-muted)'
      : v >= 0.85 ? 'var(--ocm-cpr-good)' : v >= 0.65 ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-crit)';
    const RUN_CAP = 25;   // per scenario — the whole history lives in Money ▸ Exports

    // Group runs under their scenario. `scenKey` is stamped at build time, so this
    // can't drift from the aggregate the master row was computed from.
    const runsBy = {};
    for (const r of allRuns) (runsBy[r.scenKey] || (runsBy[r.scenKey] = [])).push(r);

    const runsTable = (list, total) => `
      <div style="font-size:10px;color:var(--ocm-text-muted);text-transform:uppercase;letter-spacing:.06em;margin:12px 0 6px">Runs (${total})</div>
      <table class="ocm-datatable">
        <thead><tr><th class="num">When</th><th class="num">Diff</th><th>Outcome</th>
          <th class="num">Avg CPR</th><th class="num">Respect</th><th class="num">Money</th><th>Crew</th></tr></thead>
        <tbody>${list.map(r => `<tr>
          <td class="num" style="color:var(--ocm-text-muted)">${r.executedAt ? dateStr(r.executedAt) : '—'}</td>
          <td class="num">${r.difficulty != null ? 'D' + r.difficulty : '—'}</td>
          <td style="color:${r.outcome === 'successful' ? 'var(--ocm-cpr-good)' : r.outcome === 'failure' ? 'var(--ocm-cpr-crit)' : 'var(--ocm-text-muted)'}">${
            r.outcome === 'successful' ? '✅' : r.outcome === 'failure' ? '❌' : '⏰'}</td>
          <td class="num ${r.avgCpr != null ? cprClass(r.avgCpr) : ''}">${r.avgCpr != null ? r.avgCpr.toFixed(0) + '%' : '—'}</td>
          <td class="num">${r.outcome === 'successful' && r.respect ? Math.round(r.respect).toLocaleString() : '—'}</td>
          <td class="num">${r.outcome === 'successful' && r.money ? fmtMoney(r.money) : '—'}${
            r.paid ? ' <span style="color:var(--ocm-cpr-good);font-size:9px" title="Torn records this OC as paid out">✓</span>' : ''}</td>
          <td style="white-space:normal">${r.slots.length
            ? r.slots.map(s => `<span class="ocm-crewchip" data-ocm-profile="${esc(s.uid)}" title="${esc(s.role)}${
                s.cpr != null ? ' · ' + s.cpr + '% CPR' : ''}">${esc(s.name)}</span>`).join('')
            : '<span style="color:var(--ocm-text-faint);font-style:italic">no crew recorded</span>'}</td>
        </tr>`).join('')}</tbody></table>
      ${total > list.length ? `<div class="ocm-note" style="margin-top:6px">Showing the newest ${list.length} of ${total}. Money ▸ Exports has the full set.</div>` : ''}`;

    return `
      <div class="ocm-tablewrap"><table class="ocm-datatable">
        <thead><tr><th>Crime</th><th class="num">Runs</th><th class="num">Success</th>
          <th class="num">Avg CPR</th><th class="num">Respect/run</th><th class="num">Money/run</th>
          <th class="num" title="Worst seat: the role with the highest failure rate in this crime">Weak seat</th></tr></thead>
        <tbody>${rows.map((s, i) => {
          const list = (runsBy[s.key] || []);
          // Surface the weak seat ON the master row. It was the whole point of the
          // Scenarios view and it used to take a click to find.
          const weak = s.roleRows.find(r => r.n >= 3 && r.failRate > 0.15) || null;
          return `
          <tr class="clickable ocm-scen-row" data-i="${i}" title="Click for the seat breakdown and every run">
            <td>${esc(s.name)}</td>
            <td class="num">${s.runs}</td>
            <td class="num" style="color:${rateCol(s.rate)};font-weight:700">${s.rate == null ? '—' : Math.round(s.rate * 100) + '%'}</td>
            <td class="num ${s.avgCpr != null ? cprClass(s.avgCpr) : ''}">${s.avgCpr != null ? s.avgCpr.toFixed(0) + '%' : '—'}</td>
            <td class="num">${s.respectPer ? Math.round(s.respectPer).toLocaleString() : '—'}</td>
            <td class="num">${s.moneyPer ? fmtMoney(s.moneyPer) : '—'}</td>
            <td class="num" style="font-size:11px">${weak
              ? `<span style="color:var(--ocm-cpr-warn)" title="${esc(weak.role)} failed ${Math.round(weak.failRate * 100)}% of the ${weak.n} times it was filled">${esc(weak.role)} ${Math.round(weak.failRate * 100)}%</span>`
              : '<span style="color:var(--ocm-text-muted)">—</span>'}</td>
          </tr>
          <tr class="ocm-scen-detail" data-i="${i}" data-key="scen-${esc(s.key)}" data-detail="1" style="display:none">
            <td colspan="7" style="white-space:normal;padding:10px 12px">
              <div style="font-size:10px;color:var(--ocm-text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Which seat fails</div>
              <table class="ocm-datatable">
                <thead><tr><th>Role</th><th class="num">Filled</th><th class="num">Failures</th>
                  <th class="num">Fail rate</th><th class="num">Avg CPR</th></tr></thead>
                <tbody>${s.roleRows.map(r => `<tr>
                  <td>${esc(r.role)}</td>
                  <td class="num">${r.n}</td>
                  <td class="num">${r.fail || '—'}</td>
                  <td class="num" style="color:${r.failRate > 0.3 ? 'var(--ocm-cpr-crit)' : r.failRate > 0.15 ? 'var(--ocm-cpr-warn)' : 'var(--ocm-text-muted)'}">${Math.round(r.failRate * 100)}%</td>
                  <td class="num ${r.avgCpr != null ? cprClass(r.avgCpr) : ''}">${r.avgCpr != null ? r.avgCpr.toFixed(0) + '%' : '—'}</td>
                </tr>`).join('')}</tbody></table>
              <div class="ocm-note" style="margin-top:6px">Fail rate is how often this crime failed while that seat was filled — it points at the seat, not the person. Cross-check against the member's own CPR before acting.</div>
              ${runsTable(list.slice(0, RUN_CAP), list.length)}
            </td>
          </tr>`;
        }).join('')}</tbody></table></div>
      <div class="ocm-note" style="margin-top:8px">Money and respect are per SUCCESSFUL run — that's what ranks a crime, not gross. Click a crime for its seat breakdown and every run; click any crew name for that member's profile.</div>`;
  }

  /** Expand/collapse for the master/detail row pairs in the Crimes view. */
  function histWireExpanders(el, rowSel, detailSel) {
    el.querySelectorAll(rowSel).forEach(row => row.addEventListener('click', (e) => {
      if (e.target.closest('[data-ocm-profile]')) return;   // name click opens the profile instead
      const d = el.querySelector(`${detailSel}[data-i="${row.dataset.i}"]`);
      if (d) d.style.display = d.style.display === 'none' ? '' : 'none';
    }));
  }

  function histWireTsCache(el, ctx) {
    const btn = el.querySelector('#ocm-mh-cache-btn');
    const status = el.querySelector('#ocm-mh-cache-status');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const tsKey = GM_getValue(GMK.TS_KEY, '');
      if (!tsKey) {
        if (status) status.textContent = 'No TornStats key set — add one in Config first.';
        ocmToast('Add a TornStats API key in Config to cache CPRs.', 'warn');
        return;
      }
      btn.disabled = true;
      const orig = btn.textContent;
      btn.textContent = '⏳ Fetching…';
      try {
        let tsData = tsCprData;
        if (!tsData || !Object.keys(tsData).length) { tsData = await fetchTornStatsCpr(tsKey); tsCprData = tsData; }
        const res = backfillCprFromTornStats(tsData, ctx.mInfo || {}, ctx.exMemberNames || {}, getWeight);
        if (status) status.textContent = res.filled > 0
          ? `✓ Cached ${res.filled} CPR entr${res.filled === 1 ? 'y' : 'ies'} across ${res.members} member${res.members === 1 ? '' : 's'}.`
          : 'Archive already up to date.';
        ocmToast(res.filled > 0 ? `Cached ${res.filled} CPRs from TornStats.` : 'Already up to date.', 'ok');
      } catch (e) {
        if (status) status.textContent = 'Failed: ' + (e.message || 'TornStats error');
        ocmToast('CPR cache failed: ' + (e.message || 'error'), 'crit');
      } finally {
        btn.disabled = false;
        btn.textContent = orig;
      }
    });
  }

  // ── Charts. Same inline-SVG approach as before (no library, works offline),
  //    but only the three that earn their space, drawn on drawer open.
  function histDrawCharts(runs, memberRows) {
    const svgWrap = (id, title, inner) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<div style="font-size:10px;color:var(--ocm-text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">${title}</div>${inner}`;
    };
    const W = 720, H = 130, pad = { t: 10, r: 10, b: 26, l: 34 };
    const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;

    // 1. Success rate over time (weekly)
    const byWeek = {};
    for (const r of runs) {
      if (!r.executedAt) continue;
      const d = new Date(r.executedAt * 1000);
      d.setUTCDate(d.getUTCDate() - d.getUTCDay());
      const k = d.toISOString().slice(0, 10);
      const b = byWeek[k] || (byWeek[k] = { s: 0, f: 0 });
      if (r.outcome === 'successful') b.s++; else if (r.outcome === 'failure') b.f++;
    }
    const weeks = Object.keys(byWeek).sort();
    if (weeks.length > 1) {
      const vals = weeks.map(k => { const b = byWeek[k]; return (b.s + b.f) ? Math.round(b.s / (b.s + b.f) * 100) : null; });
      const step = cW / Math.max(weeks.length - 1, 1);
      let path = '';
      vals.forEach((v, i) => { if (v == null) return; const x = pad.l + i * step, y = pad.t + cH - (v / 100) * cH; path += (path ? 'L' : 'M') + x + ',' + y; });
      svgWrap('ocm-chart-timeline', 'Success rate over time (weekly)', `<svg width="100%" viewBox="0 0 ${W} ${H}">
        ${[0, 50, 100].map(t => `<line x1="${pad.l}" y1="${pad.t + cH - t / 100 * cH}" x2="${pad.l + cW}" y2="${pad.t + cH - t / 100 * cH}" stroke="rgba(255,255,255,.06)"/>
          <text x="${pad.l - 5}" y="${pad.t + cH - t / 100 * cH + 4}" text-anchor="end" fill="#8a8a99" font-size="9">${t}%</text>`).join('')}
        <path d="${path}" fill="none" stroke="var(--ocm-cpr-good)" stroke-width="2"/>
      </svg>`);
    } else {
      svgWrap('ocm-chart-timeline', 'Success rate over time (weekly)', '<div class="ocm-note">Not enough dated history in this window.</div>');
    }

    // 2. CPR distribution
    const buckets = { '<60': 0, '60–70': 0, '70–80': 0, '80–90': 0, '90+': 0 };
    for (const r of runs) for (const s of r.slots) {
      if (s.cpr == null) continue;
      if (s.cpr < 60) buckets['<60']++; else if (s.cpr < 70) buckets['60–70']++;
      else if (s.cpr < 80) buckets['70–80']++; else if (s.cpr < 90) buckets['80–90']++; else buckets['90+']++;
    }
    const bk = Object.keys(buckets), bv = Object.values(buckets), bmax = Math.max(...bv, 1);
    const bcol = ['var(--ocm-cpr-crit)', 'var(--ocm-cpr-warn)', 'var(--ocm-cpr-warn)', 'var(--ocm-cpr-good)', 'var(--ocm-link)'];
    svgWrap('ocm-chart-cpr', 'CPR distribution (all filled slots)', `<svg width="100%" viewBox="0 0 ${W} ${H}">
      ${bv.map((v, i) => { const bw = cW / bk.length - 8, x = pad.l + i * (cW / bk.length), h = (v / bmax) * cH;
        return `<rect x="${x}" y="${pad.t + cH - h}" width="${bw}" height="${h}" fill="${bcol[i]}" opacity=".85" rx="2"/>
          <text x="${x + bw / 2}" y="${pad.t + cH - h - 4}" text-anchor="middle" fill="#aab" font-size="9">${v}</text>
          <text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle" fill="#8a8a99" font-size="9">${bk[i]}</text>`; }).join('')}
    </svg>`);

    // 3. Participation, top 20
    const top = memberRows.filter(m => !m.isEx).slice(0, 20);
    if (top.length) {
      const rowH = 18, bh = top.length * rowH + 10, lw = 120, bw2 = W - lw - 50;
      const maxRuns = Math.max(...top.map(m => m.runs), 1);
      svgWrap('ocm-chart-members', 'Participation (top 20)', `<svg width="100%" viewBox="0 0 ${W} ${bh}">
        ${top.map((m, i) => { const y = i * rowH, w2 = Math.max(2, m.runs / maxRuns * bw2);
          const col = m.rate == null ? 'var(--ocm-text-muted)' : m.rate >= 0.85 ? 'var(--ocm-cpr-good)' : m.rate >= 0.65 ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-crit)';
          return `<text x="${lw - 6}" y="${y + 12}" text-anchor="end" fill="#aab" font-size="10">${esc(m.name.slice(0, 16))}</text>
            <rect x="${lw}" y="${y + 4}" width="${w2}" height="${rowH - 8}" fill="${col}" opacity=".8" rx="2"/>
            <text x="${lw + w2 + 5}" y="${y + 12}" fill="#8a8a99" font-size="9">${m.runs}</text>`; }).join('')}
      </svg>`);
    }
  }

  // ─── MEMBER PROFILE VIEW (v5.2) ────────────────────────────────────────────

  /** Last render context, so the profile can redraw itself without a full
   *  dashboard pass (opened from a pane, or restored after the 60s refresh). */
  let OCM_LAST_CTX = null;
  let OCM_PROFILE_UID = null;
  let OCM_PROFILE_SHOWN = 5;      // Recent-OCs paging; survives re-render (see below)

  const OCM_PROFILE_PAGE = 10;

  function openMemberProfile(uid) {
    if (!uid) return;
    if (String(uid) !== OCM_PROFILE_UID) OCM_PROFILE_SHOWN = 5;   // fresh member, fresh page
    OCM_PROFILE_UID = String(uid);
    document.getElementById('ocm-root')?.classList.add('ocm-profile-open');
    renderMemberProfile();
    document.getElementById('ocm-root')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closeMemberProfile() {
    OCM_PROFILE_UID = null;
    document.getElementById('ocm-root')?.classList.remove('ocm-profile-open');
    const el = document.getElementById('ocm-member-profile');
    if (el) el.innerHTML = '';
  }

  /** Delegated so it works for any renderer that stamps data-ocm-profile,
   *  present or future, and survives every innerHTML rebuild without rewiring. */
  function initProfileRouting() {
    const root = document.getElementById('ocm-root');
    if (!root || root.__ocmProfileWired) return;
    root.__ocmProfileWired = true;
    root.addEventListener('click', (e) => {
      const hit = e.target.closest('[data-ocm-profile]');
      if (!hit || !root.contains(hit)) return;
      // Never swallow a real Torn profile link — that's the user's escape hatch.
      if (e.target.closest('a[href*="profiles.php"]')) return;
      e.preventDefault();
      openMemberProfile(hit.getAttribute('data-ocm-profile'));
    });
  }

  function renderMemberProfile() {
    const el = document.getElementById('ocm-member-profile');
    if (!el || !OCM_PROFILE_UID) return;

    const p = buildMemberProfile(OCM_PROFILE_UID, OCM_LAST_CTX || {});
    const openKeys = openDetailKeys(el);
    const nowS = Math.floor(Date.now() / 1000);
    const ago = (ts) => {
      if (!ts) return '—';
      const d = nowS - ts;
      if (d < 3600) return Math.max(1, Math.floor(d / 60)) + 'm ago';
      if (d < 86400) return Math.floor(d / 3600) + 'h ago';
      return Math.floor(d / 86400) + 'd ago';
    };
    const pctTxt = (v) => v == null ? '—' : Math.round(v * 100) + '%';
    const rateCol = (v) => v == null ? 'var(--ocm-text-muted)'
      : v >= 0.85 ? 'var(--ocm-cpr-good)' : v >= 0.65 ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-crit)';

    // ── Identity
    const id = p.identity;
    const st = id.status.state || 'Unknown';
    const stCol = st === 'Okay' ? 'var(--ocm-cpr-good)'
      : (st === 'Hospital' || st === 'Jail') ? 'var(--ocm-cpr-warn)'
      : st === 'Unknown' ? 'var(--ocm-text-muted)' : 'var(--ocm-link)';
    const stTimer = id.status.until > nowS
      ? ` <span class="ocm-time" data-until="${id.status.until}">${fmtCountdown(id.status.until)}</span>` : '';

    const identityHtml = `
      <div class="ocm-panel">
        <div class="ocm-mp-id">
          ${ocmAvatarHtml(id.uid, id.name, id.avatar)}
          <div class="ocm-mp-idmain">
            <div class="ocm-mp-name">
              ${esc(id.name)}
              ${id.isEx ? '<span style="font-size:10px;color:var(--ocm-text-faint);font-weight:400">(left faction)</span>' : ''}
            </div>
            <div class="ocm-mp-meta">
              ID <a href="/profiles.php?XID=${esc(id.uid)}" target="_blank">${esc(id.uid)}</a>
              ${id.position ? ' · ' + esc(id.position) : ''}
              ${id.level ? ' · Level ' + esc(String(id.level)) : ''}
              ${id.daysInFaction != null ? ' · ' + id.daysInFaction + 'd in faction' : ''}
            </div>
            <div class="ocm-mp-strip">
              <div><div class="l">Status</div><div class="v" style="color:${stCol}">${esc(st)}${stTimer}</div></div>
              <div><div class="l">Last action</div><div class="v">${esc(id.lastActionRel || ago(id.lastAction))}</div></div>
              <div><div class="l">Current OC</div><div class="v">${id.currentOc
                ? esc(id.currentOc.name) + ' <span style="color:var(--ocm-text-muted)">· ' + esc(id.currentOc.role) + '</span>'
                : '<span style="color:var(--ocm-text-muted)">free</span>'}</div></div>
            </div>
            <div class="ocm-mp-verdict">${esc(p.verdict)}</div>
          </div>
        </div>
      </div>`;

    // ── OC summary — the reference panel's stat-list, applied to what matters here
    const o = p.ocPerf;
    const prov = o.avgCpr == null ? ''
      : `<span class="ocm-prov-dot ${o.cprObserved ? 'obs' : 'est'}" title="${o.cprObserved
          ? 'Observed — averaged from CPRs Torn reported on real runs'
          : 'Estimated — no observed CPR on record'}"></span>`;
    const row = (ico, k, v, title) => `<div class="ocm-statrow"${title ? ` title="${esc(title)}"` : ''}>
        <span class="ico">${ico}</span><span class="k">${esc(k)}</span><span class="v">${v}</span></div>`;

    const summaryHtml = `
      <div class="ocm-panel">
        <div class="ocm-panel-title">📊 OC Summary</div>
        ${row('🎯', 'OCs run', o.total)}
        ${row('✅', 'Success rate',
              `<span style="color:${rateCol(o.rate)}">${pctTxt(o.rate)}</span>`,
              `${o.success} successful · ${o.failure} failed${o.expired ? ' · ' + o.expired + ' expired' : ''}. Expired OCs are excluded from the rate — nobody ran them.`)}
        ${row('📈', 'Avg CPR', o.avgCpr != null
              ? `<span class="${cprClass(o.avgCpr)}">${o.avgCpr.toFixed(1)}%</span>${prov}` : '—')}
        ${row('⭐', 'Respect earned', Math.round(p.money.respect || 0).toLocaleString())}
        ${row('💰', 'Money earned', fmtMoney(p.money.earned),
              'Their share of OCs Torn records as PAID, at the recorded split. Excludes pending payouts — that money is still with the faction.')}
        ${p.money.owed > 0 ? row('⏳', 'Awaiting payout',
              `<span style="color:var(--ocm-cpr-warn)">${fmtMoney(p.money.owed)}</span>`,
              `${p.money.ocsOwed} completed OC${p.money.ocsOwed === 1 ? '' : 's'} not yet paid out.`) : ''}
        ${row('🏆', 'Highest cleared', o.bestCleared
              ? `D${o.bestCleared.difficulty} <span style="color:var(--ocm-text-muted);font-weight:400">${esc(o.bestCleared.name)}</span>` : '—')}
        ${row('🎭', 'Top role', o.topRole
              ? `${esc(o.topRole)} <span style="color:var(--ocm-text-muted);font-weight:400">${o.roleRows[0].runs} run${o.roleRows[0].runs === 1 ? '' : 's'}</span>` : '—')}
        ${row('⏱', 'Last OC', o.lastRunAt ? `${ago(o.lastRunAt)} <span style="color:var(--ocm-text-muted);font-weight:400">${dateStr(o.lastRunAt)}</span>` : '—')}
      </div>`;

    // ── Recent OCs, paged client-side over an array already in memory
    const shown = Math.min(OCM_PROFILE_SHOWN, o.runs.length);
    const remaining = o.runs.length - shown;
    const runRows = o.runs.slice(0, shown).map(r => {
      const ico = r.outcome === 'successful' ? '✅' : r.outcome === 'failure' ? '❌' : '⏰';
      return `<tr>
        <td>${ico} ${esc(r.ocName)}</td>
        <td class="num">${r.difficulty != null ? 'D' + r.difficulty : '—'}</td>
        <td>${esc(r.role)}</td>
        <td class="num ${r.cpr != null ? cprClass(r.cpr) : ''}">${r.cpr != null ? r.cpr + '%' : '—'}</td>
        <td class="num">${r.outcome === 'successful' && r.money ? fmtMoney(r.money) : '—'}</td>
        <td class="num" style="color:var(--ocm-text-muted)">${r.executedAt ? ago(r.executedAt) : '—'}</td>
      </tr>`;
    }).join('');

    const recentHtml = `
      <div class="ocm-panel">
        <div class="ocm-panel-title">📋 Recent OCs
          <span class="ocm-panel-sub">${o.runs.length} on record</span></div>
        ${o.runs.length ? `<div class="ocm-tablewrap"><table class="ocm-datatable">
          <thead><tr><th>OC</th><th class="num">Diff</th><th>Role</th>
            <th class="num">CPR</th><th class="num">Money</th><th class="num">When</th></tr></thead>
          <tbody>${runRows}</tbody></table></div>
          ${remaining > 0 ? `<div style="margin-top:10px;display:flex;align-items:center;gap:10px">
              <button id="ocm-mp-more" class="ocm-chip-filter">Load ${Math.min(OCM_PROFILE_PAGE, remaining)} more ▾</button>
              <span style="font-size:11px;color:var(--ocm-text-muted)">${remaining} remaining</span>
            </div>` : ''}`
          : '<div class="ocm-note">No completed OCs on record for this member.</div>'}
      </div>`;

    // ── Collapsible detail sections. Each degrades to a one-line note rather
    //    than rendering an empty block — a blank pane reads as "broken".
    const sec = (key, title, body) => `
      <details class="ocm-war-card" data-key="mp-${key}">
        <summary><span style="font-weight:700;color:var(--ocm-text)">${title}</span></summary>
        <div class="ocm-war-card-body">${body}</div>
      </details>`;

    const roleBody = o.roleRows.length ? `<table class="ocm-datatable">
        <thead><tr><th>Role</th><th class="num">Runs</th><th class="num">Success</th>
          <th class="num">Avg CPR</th><th class="num" title="How much this role drives the crime's outcome">Weight</th></tr></thead>
        <tbody>${o.roleRows.map(r => `<tr>
          <td>${esc(r.role)}</td>
          <td class="num">${r.runs}</td>
          <td class="num" style="color:${rateCol(r.rate)}">${pctTxt(r.rate)}</td>
          <td class="num ${r.avgCpr != null ? cprClass(r.avgCpr) : ''}">${r.avgCpr != null ? r.avgCpr.toFixed(0) + '%' : '—'}</td>
          <td class="num" style="color:var(--ocm-text-muted)">${r.weight != null ? r.weight.toFixed(0) + '%' : '—'}</td>
        </tr>`).join('')}</tbody></table>`
      : '<div class="ocm-note">No role history yet.</div>';

    const w = p.war;
    const warBody = (w && (w.hits || w.losses || w.revives)) ? `
        ${row('⚔️', 'War hits', w.warHits.toLocaleString(), 'Hits carrying the war modifier, observed from the attack ledger.')}
        ${row('👊', 'All hits', w.hits.toLocaleString())}
        ${row('⭐', 'Respect gained', (Math.round(w.respect * 10) / 10).toLocaleString())}
        ${row('🛡', 'Defends held', w.defends.toLocaleString())}
        ${row('💀', 'Times beaten', w.losses.toLocaleString())}
        ${w.avgFf != null ? row('⚖️', 'Avg fair fight', w.avgFf.toFixed(2)) : ''}
        ${w.revives ? row('💉', 'Revives', `${w.revives} <span style="color:var(--ocm-text-muted);font-weight:400">${Math.round(w.reviveOk / w.revives * 100)}% success</span>`) : ''}
        <div class="ocm-note" style="margin-top:8px">Observed from the attack ledger (180-day raw retention), so coverage depends on how long the ledger has been running — not an official war report.</div>`
      : '<div class="ocm-note">No attacks or revives recorded for this member. The war ledger needs a key with faction API access (AA), and builds forward from its first sync.</div>';

    const a = p.armoury;
    const armBody = a ? `
        ${row('🔫', 'Gear on loan', (a.weapons.length + a.armour.length) || '—')}
        ${row('🎒', 'OC items held', a.items.length || '—')}
        ${row('💊', 'Consumables · 30d', a.use30 || '—')}
        ${a.flags.length ? row('⚠', 'Flagged', `<span style="color:var(--ocm-cpr-warn)">${esc(a.flags.join(', '))}</span>`,
            'Holding more than one of the same slot — one is idle faction property.') : ''}`
      : '<div class="ocm-note">Not holding any faction gear, and no consumable use recorded.</div>';

    const act = p.activity;
    const idleDays = act.idleSec != null ? Math.floor(act.idleSec / 86400) : null;
    const actBody = act.idleSec != null ? `
        ${row('🕐', 'Last action', ago(id.lastAction))}
        ${row('📅', 'Idle', idleDays >= 1
            ? `<span style="color:${idleDays >= 7 ? 'var(--ocm-cpr-crit)' : idleDays >= 3 ? 'var(--ocm-cpr-warn)' : 'var(--ocm-text)'}">${idleDays}d</span>`
            : '<span style="color:var(--ocm-cpr-good)">today</span>')}
        <div class="ocm-note" style="margin-top:8px">Presence as this suite observed it (snapshots while the dashboard is open) — not Torn's own activity log.</div>`
      : '<div class="ocm-note">No activity data — this member isn\'t on the current roster.</div>';

    const missingNote = p.missing.length
      ? `<div class="ocm-note" style="margin-top:10px">Some sections are incomplete — couldn't read: ${esc([...new Set(p.missing)].join(', '))}.</div>`
      : '';

    el.innerHTML = `
      <div class="ocm-backbar">
        <button id="ocm-mp-back">← Back</button>
        <span style="font-size:11px;color:var(--ocm-text-muted)">Member profile</span>
      </div>
      ${identityHtml}
      ${summaryHtml}
      ${recentHtml}
      ${sec('roles', '🎭 Performance by role', roleBody)}
      ${sec('war', '⚔️ War', warBody)}
      ${sec('armoury', '🛡️ Armoury', armBody)}
      ${sec('activity', '🕐 Activity', actBody)}
      ${missingNote}`;

    restoreOpenDetails(el, openKeys);
    document.getElementById('ocm-mp-back')?.addEventListener('click', closeMemberProfile);
    document.getElementById('ocm-mp-more')?.addEventListener('click', () => {
      OCM_PROFILE_SHOWN += OCM_PROFILE_PAGE;
      renderMemberProfile();
    });
    clearStaleTooltips();
  }



  /** Start the 1-second interval that updates all live countdown timers in the DOM. */
  function startCountdowns() {
    clearInterval(window._ocmTimer);
    window._ocmTimer = setInterval(() => {
      document.querySelectorAll('.ocm-time[data-until]').forEach(el => {
        el.textContent = fmtCountdown(parseInt(el.dataset.until, 10));
      });
    }, 1000);
  }

  // ─── MEMBER MODE ─────────────────────────────────────────────────────────────

  /** Fetch data for member mode (no faction API access). */
  async function fetchMember(apiKey) {
    const url  = `${API_BASE}/user?selections=organizedcrimes,basic&key=${apiKey}&comment=OCSuite`;
    const data = await tornApiGet(url);
    if (data.error) throw new Error(`API error ${data.error.code}: ${data.error.error}`);
    return data;
  }

  /** Render the member-mode dashboard (slot recommendations only, no faction data). */
  function renderMemberDashboard(data) {
    document.getElementById('ocm-body').style.display       = '';
    document.getElementById('ocm-stats-bar').style.display  = 'none';
    document.getElementById('ocm-next-banner').style.display = 'none';

    ['ocm-title-available','ocm-available','ocm-title-recruits','ocm-recruits',
     'ocm-title-blocked','ocm-blocked','ocm-title-lowcpr','ocm-lowcpr',
     'ocm-title-overqualified','ocm-overqualified',
     'ocm-title-tscoverage','ocm-tscoverage',
     'ocm-title-tscpr','ocm-tscpr',
     'ocm-leader-advice',
     'ocm-planning-header','ocm-grid-planning','ocm-recruiting-header',
     'ocm-grid-recruiting','ocm-title-analytics','ocm-analytics',
     'ocm-title-downloads','ocm-downloads'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    // Member mode is ONE small panel (rendered into the footer container below).
    // The 5-tab leader shell — sub-tab bars, empty Money/War/Armoury panes, the
    // "arrives in v4.x" placeholder notes — is pure noise without faction data,
    // so the whole shell hides behind one root class. (The old code did the
    // opposite: it forced EVERY pane visible, which is why member mode showed a
    // wall of empty tab bars above the actual content.) Leader mode removes it.
    const tabsEl = document.getElementById('ocm-tabs');
    if (tabsEl) tabsEl.style.display = 'none';
    document.getElementById('ocm-root')?.classList.add('ocm-member-mode');
    // The profile drill-down is leader-only (it needs the roster + archive).
    // Close it on the way in, or its markup would linger behind member mode.
    closeMemberProfile();

    const crimes     = data.organizedcrimes || data.organized_crimes || {};
    const memberName = data.name || 'You';
    const myId       = data.player_id ? String(data.player_id) : null;
    const nowTs      = Math.floor(Date.now() / 1000);

    const errEl = document.getElementById('ocm-error');
    errEl.style.display = 'none';

    const footer = document.getElementById('ocm-footer');
    footer.innerHTML = '';

    const container = document.createElement('div');
    container.style.cssText = 'margin-top:4px';

    // Mode notice
    const notice = document.createElement('div');
    notice.style.cssText = 'background:var(--ocm-bg-card);border:0.5px solid #2e2e2e;border-left:3px solid #3a3018;border-radius:0 6px 6px 0;padding:8px 12px;font-size:11px;color:var(--ocm-text-dim);margin-bottom:10px';
    notice.innerHTML = '<strong style="color:var(--ocm-cpr-warn)">Member Mode</strong> \u2014 faction-wide data requires Faction API access on your role. Ask your faction leader.';
    container.appendChild(notice);

    // Detect whether the member is currently assigned to an active OC.
    // Scan all OCs returned by the API; find the one where a slot user.id
    // matches the member own player_id (returned as data.player_id).
    let currentOc = null;
    let mySlot    = null;

    for (const oc of Object.values(crimes)) {
      if (!oc) continue;
      const phase   = (oc.status || '').toLowerCase();
      // Skip terminal and recruiting phases
      if (['completed','expired','cancelled','failed','success','recruiting'].includes(phase)) continue;
      const ocSlots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
      const mine    = myId ? ocSlots.find(s => s.user && String(s.user.id) === myId) : null;
      if (mine) { currentOc = oc; mySlot = mine; break; }
    }

    if (currentOc) {
      // ── CURRENT OC CARD ──────────────────────────────────────────────────────
      const phase   = (currentOc.status || '').toLowerCase();
      const ocSlots = Array.isArray(currentOc.slots) ? currentOc.slots : Object.values(currentOc.slots || []);

      // Determine countdown / timer display
      const executesAt = (currentOc.executed_at && currentOc.executed_at > nowTs ? currentOc.executed_at : null)
                      || (currentOc.ready_at    && currentOc.ready_at    > nowTs ? currentOc.ready_at    : null);
      const timeLeft   = currentOc.time_left != null ? currentOc.time_left : null;
      const expiredAt  = currentOc.expired_at != null ? currentOc.expired_at : null;
      const openCount  = ocSlots.filter(s => !s.user).length;

      let timerHtml;
      if (executesAt) {
        const tctStr  = new Date(executesAt * 1000).toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false });
        const tctDate = new Date(executesAt * 1000).toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short' });
        timerHtml = '\u23F1 <span class="ocm-time" data-until="' + executesAt + '">' + fmtTime(executesAt - nowTs) + '</span>'
          + ' <span style="color:var(--ocm-text-faint);font-size:10px">(' + tctDate + ' ' + tctStr + ' TCT)</span>';
      } else if (timeLeft > 0) {
        timerHtml = '\u23F8 ~' + fmtTime(timeLeft) + ' remaining <span style="color:var(--ocm-text-faint);font-size:10px">(paused)</span>';
      } else if (openCount > 0) {
        timerHtml = '\u23F8 ~' + fmtTime(openCount * 24 * 3600) + ' est.'
          + ' <span style="color:var(--ocm-text-faint);font-size:10px">(' + openCount + ' open slot' + (openCount > 1 ? 's' : '') + ' x 24h)</span>';
      } else if (expiredAt && expiredAt > nowTs) {
        timerHtml = '\u23F3 Expires in <span class="ocm-time" data-until="' + expiredAt + '">' + fmtTime(expiredAt - nowTs) + '</span>';
      } else {
        timerHtml = '<span style="color:var(--ocm-cpr-good);font-weight:bold">Ready to initiate!</span>';
      }

      // My slot stats
      const myRole   = mySlot && mySlot.position_info && mySlot.position_info.label ? mySlot.position_info.label : (mySlot && mySlot.position ? mySlot.position : '?');
      const myCpr    = mySlot && mySlot.checkpoint_pass_rate != null ? mySlot.checkpoint_pass_rate : null;
      const myWeight = getWeight(currentOc.name || '', myRole);
      const myProg   = mySlot && mySlot.user && mySlot.user.progress != null ? mySlot.user.progress : null;
      const cprCol   = myCpr == null ? '#555' : myCpr >= CPR_WARN ? 'var(--ocm-cpr-good)' : myCpr >= CPR_CRIT ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-crit)';
      const wCol     = myWeight == null ? '#555' : myWeight >= WEIGHT_HIGH ? 'var(--ocm-cpr-warn)' : myWeight >= WEIGHT_MID ? '#aaa' : '#555';
      const progPct  = Math.min(100, Math.max(0, myProg != null ? myProg : 0));
      const progCol  = progPct >= 100 ? 'var(--ocm-cpr-good)' : 'var(--ocm-cpr-warn)';
      const progLabel = myProg == null ? 'No progress data' : myProg >= 100 ? 'Planning complete \u2713' : ('Planning: ' + progPct.toFixed(0) + '%');

      // Phase badge
      const phaseBadge = phase === 'ready'
        ? '<span style="background:#14201a;color:var(--ocm-cpr-good);font-size:10px;padding:1px 6px;border-radius:3px;font-weight:bold">READY</span>'
        : phase === 'blocked'
          ? '<span style="background:var(--ocm-bg);color:#bf7abf;font-size:10px;padding:1px 6px;border-radius:3px;font-weight:bold">BLOCKED</span>'
          : '<span style="background:#14181e;color:var(--ocm-link);font-size:10px;padding:1px 6px;border-radius:3px;font-weight:bold">PLANNING</span>';

      // Detect blocked members and stuck status
      const blockedSlots = ocSlots.filter(s => {
        if (!s.user || !s.user.id) return false;
        const st = (s.user.status ? (s.user.status.state || s.user.status.description || '') : '').toLowerCase();
        return st === 'hospital' || st === 'jail' || st === 'traveling' || st === 'abroad';
      });
      const allFilled  = ocSlots.every(s => s.user && s.user.id);
      const allPlanned = ocSlots.every(s => {
        const p = s.user && s.user.progress != null ? s.user.progress : 100;
        return p >= 100;
      });
      const isStuck = allFilled && allPlanned && blockedSlots.length > 0;

      // Alert banner
      let alertHtml = '';
      if (isStuck) {
        alertHtml = '<div style="background:#1c1810;border:1px solid #4a2820;border-radius:4px;padding:6px 10px;margin-bottom:8px;font-size:11px;color:var(--ocm-cpr-crit)">'
          + '\uD83D\uDEA8 <strong>Stuck</strong> \u2014 OC is fully planned but cannot initiate. '
          + blockedSlots.length + ' member' + (blockedSlots.length > 1 ? 's are' : ' is') + ' unavailable.</div>';
      } else if (blockedSlots.length > 0) {
        alertHtml = '<div style="background:#181410;border:1px solid #3a3018;border-radius:4px;padding:6px 10px;margin-bottom:8px;font-size:11px;color:var(--ocm-cpr-warn)">'
          + '\u26A0 ' + blockedSlots.length + ' member' + (blockedSlots.length > 1 ? 's are' : ' is') + ' currently jailed, hospitalised, or abroad.</div>';
      }

      // All slots list
      const otherSlotsHtml = ocSlots.map(s => {
        const isMe   = myId && s.user && String(s.user.id) === myId;
        const uid    = s.user ? String(s.user.id) : null;
        const name   = uid ? (s.user.name || ('#' + uid)) : 'Open slot';
        const role   = s.position_info && s.position_info.label ? s.position_info.label : (s.position || '?');
        const prog   = s.user && s.user.progress != null ? s.user.progress : null;
        const st     = s.user && s.user.status ? (s.user.status.state || s.user.status.description || '') : '';
        const stL    = st.toLowerCase();
        const desc   = s.user && s.user.status ? (s.user.status.description || '') : '';
        const stIcon = stL === 'okay'     ? '<span style="color:var(--ocm-cpr-good)">\u2713</span>'
          : stL === 'hospital' ? '\uD83C\uDFE5'
          : stL === 'jail'     ? '\u26D3'
          : stL === 'traveling'? '\u2708'
          : stL === 'abroad'   ? (flagFromDescription(desc) + ' ')
          : uid                ? '<span style="color:var(--ocm-text-faint)">?</span>'
          : '<span style="color:var(--ocm-cpr-crit)">\u2717</span>';
        const progStr = prog == null ? '' : prog >= 100
          ? '<span style="color:var(--ocm-cpr-good);font-size:9px">\u2713 done</span>'
          : '<span style="color:var(--ocm-cpr-warn);font-size:9px">' + prog.toFixed(0) + '%</span>';
        const nameStyle = isMe ? 'color:var(--ocm-link);font-weight:bold' : !uid ? 'color:var(--ocm-text-faint);font-style:italic' : 'color:var(--ocm-text-card)';
        return '<div style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:11px;border-bottom:1px solid #111">'
          + '<span style="flex:0 0 14px;text-align:center">' + stIcon + '</span>'
          + '<span style="flex:0 0 90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ocm-text-muted)" title="' + role + '">' + role + '</span>'
          + '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' + nameStyle + '">' + name + (isMe ? ' (you)' : '') + '</span>'
          + progStr
          + '</div>';
      }).join('');

      const borderCol = isStuck ? '#4a2820' : blockedSlots.length ? '#3a3018' : phase === 'ready' ? 'var(--ocm-cpr-good)' : '#2a3040';
      const card = document.createElement('div');
      card.style.cssText = 'background:var(--ocm-bg-card);border:1px solid ' + borderCol + ';border-radius:6px;padding:10px 12px;margin-bottom:10px';
      card.innerHTML =
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">'
          + '<span style="font-size:13px;font-weight:bold;color:var(--ocm-text)">' + (currentOc.name || 'Your OC') + '</span>'
          + '<span style="color:var(--ocm-text-muted);font-size:10px">D' + (currentOc.difficulty != null ? currentOc.difficulty : '?') + ' \xB7 ' + ocSlots.length + ' slots</span>'
          + phaseBadge
        + '</div>'
        + '<div style="font-size:11px;color:var(--ocm-text-dim);margin-bottom:8px">' + timerHtml + '</div>'
        + alertHtml
        + '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:10px;padding:6px 10px;background:#14181e;border-radius:4px;font-size:11px">'
          + '<div><div style="font-size:9px;color:var(--ocm-text-faint);text-transform:uppercase;letter-spacing:.5px">Your Role</div><div style="color:var(--ocm-text-card);font-weight:bold">' + myRole + '</div></div>'
          + '<div><div style="font-size:9px;color:var(--ocm-text-faint);text-transform:uppercase;letter-spacing:.5px">Weight</div><div style="font-weight:bold;color:' + wCol + '">' + (myWeight != null ? myWeight.toFixed(0) + '%' : '\u2014') + '</div></div>'
          + '<div><div style="font-size:9px;color:var(--ocm-text-faint);text-transform:uppercase;letter-spacing:.5px">Your CPR</div><div style="font-weight:bold;color:' + cprCol + '">' + (myCpr != null ? myCpr + '%' : '\u2014') + '</div></div>'
          + '<div style="flex:1;min-width:120px">'
            + '<div style="font-size:9px;color:var(--ocm-text-faint);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">' + progLabel + '</div>'
            + '<div style="height:5px;background:#0a1020;border-radius:3px;overflow:hidden">'
              + '<div style="height:100%;width:' + progPct + '%;background:' + progCol + ';border-radius:3px;transition:width .3s"></div>'
            + '</div>'
          + '</div>'
        + '</div>'
        + '<div style="font-size:9px;color:var(--ocm-text-faint);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">All Slots</div>'
        + '<div>' + otherSlotsHtml + '</div>';

      container.appendChild(card);

    } else {
      // ── NOT IN AN OC — show open slot recommendations ─────────────────────────

      const slots = [];
      for (const oc of Object.values(crimes)) {
        if (!oc || (oc.status || '').toLowerCase() !== 'recruiting') continue;
        const ocSlots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
        for (const slot of ocSlots) {
          if (slot.user && slot.user.id) continue;
          const role   = slot.position_info && slot.position_info.label ? slot.position_info.label : (slot.position || 'Unknown');
          const cpr    = slot.checkpoint_pass_rate != null ? slot.checkpoint_pass_rate : null;
          const weight = getWeight(oc.name || '', role);
          slots.push({
            ocName: oc.name || 'Unknown OC', ocId: oc.id, role, cpr, weight,
            difficulty: oc.difficulty != null ? oc.difficulty : '?',
            expiredAt:  oc.expired_at  != null ? oc.expired_at  : null,
            timeLeft:   oc.time_left   != null ? oc.time_left   : null,
          });
        }
      }

      function urgencyBonus(s) {
        let bonus = 0;
        if (s.expiredAt) {
          const secsToExpiry = s.expiredAt - nowTs;
          if (secsToExpiry > 0 && secsToExpiry < 6  * 3600) bonus += 500;
          else if (secsToExpiry > 0 && secsToExpiry < 24 * 3600) bonus += 200;
        }
        if (s.timeLeft != null) {
          if (s.timeLeft < 12 * 3600) bonus += 100;
          else if (s.timeLeft < 24 * 3600) bonus +=  50;
        }
        return Math.min(bonus, 999);
      }

      const scored = slots.map(s => {
        const cpr    = s.cpr    != null ? s.cpr    : 0;
        const weight = s.weight != null ? s.weight : 15;
        const diff   = Number(s.difficulty) || 0;
        let tag;
        if      (cpr < CPR_CRIT)           tag = 'risky';
        else if (cpr < CPR_WARN)           tag = 'marginal';
        else if (weight < WEIGHT_MID)      tag = 'underutilised';
        else                               tag = 'good';
        const eligible    = cpr >= CPR_WARN;
        const comfort     = eligible ? Math.max(0, (cpr - CPR_WARN) / (100 - CPR_WARN)) : 0;
        const weightBonus = weight * comfort;
        const score       = eligible
          ? diff * 1000 + urgencyBonus(s) + weightBonus + cpr
          : -(1000 - cpr);
        return Object.assign({}, s, { score, tag, eligible, urgent: urgencyBonus(s) > 0 });
      }).sort((a, b) => b.score - a.score);

      if (scored.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'background:var(--ocm-bg-card);border:0.5px solid #2e2e2e;border-radius:6px;padding:12px;text-align:center;color:var(--ocm-text-faint);font-size:12px';
        empty.textContent = 'No open recruiting slots found. All current OCs are full or in planning.';
        container.appendChild(empty);
      } else {
        const eligible   = scored.filter(s => s.eligible);
        // Only consider slots with REAL CPR data for the fallback — a slot with
        // null/unknown CPR (common in member mode for roles you're not slotted in)
        // shows as 0% and is meaningless as a "least risky" recommendation.
        const ineligible = scored.filter(s => !s.eligible && s.cpr != null && s.cpr > 0);
        const fallback   = eligible.length === 0 && ineligible.length > 0
          ? [ineligible.sort((a, b) => {
              if ((b.cpr || 0) !== (a.cpr || 0)) return (b.cpr || 0) - (a.cpr || 0);
              return (a.weight || 50) - (b.weight || 50);
            })[0]]
          : [];

        const belowWarn = eligible.length === 0 && fallback.length > 0;
        // No eligible slots AND no below-threshold slots with real CPR data either
        const noCprData = eligible.length === 0 && fallback.length === 0;

        if (noCprData) {
          const info = document.createElement('div');
          info.style.cssText = 'background:var(--ocm-bg-card);border:0.5px solid #2e2e2e;border-radius:6px;padding:12px;color:var(--ocm-text-dim);font-size:12px;line-height:1.5';
          info.innerHTML = 'No CPR data available for the open recruiting slots. '
            + 'In member mode, Torn only returns your checkpoint pass rate for crimes you\u2019ve run before. '
            + 'Run any OC once to build a CPR baseline, or ask your faction leader for the leader-mode view.';
          container.appendChild(info);
          footer.appendChild(container);
          startCountdowns();
          GM_setValue(GMK.SIDEBAR_CACHE, JSON.stringify({
            name: 'Member Mode', executesAt: null, timeLeft: null, openCount: 0,
            severity: 'ok', issues: [], cachedAt: Math.floor(Date.now() / 1000), memberMode: true,
          }));
          renderSidebarWidget();
          document.getElementById('ocm-last-update').textContent = 'Updated ' + new Date().toLocaleTimeString() + ' \xB7 Member Mode';
          return;
        }

        const title = document.createElement('div');
        title.style.cssText = 'color:var(--ocm-link);font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;border-bottom:1px solid #333;padding-bottom:3px';
        title.textContent = belowWarn
          ? ('No suitable slots above ' + CPR_WARN + '% CPR \u2014 showing least risky option')
          : ('Best slots for ' + memberName + ' (top ' + Math.min(5, eligible.length) + ' of ' + scored.length + ')');
        container.appendChild(title);

        if (belowWarn) {
          const warn = document.createElement('div');
          warn.style.cssText = 'background:#1c1810;border:0.5px solid #4a2820;border-radius:6px;padding:8px 12px;margin-bottom:8px;font-size:11px;color:var(--ocm-cpr-warn)';
          warn.innerHTML = '\u26A0 All open slots are below your CPR warn threshold (' + CPR_WARN + '%). The option below is the least likely to cause the OC to fail \u2014 but consider waiting for a more suitable slot to open up.';
          container.appendChild(warn);
        }

        // Two open Muscle seats in the same crime used to render as two IDENTICAL
        // cards — collapse duplicates into one card with an "×N open" count.
        const grouped = [];
        for (const s of (belowWarn ? fallback : scored)) {
            const key = `${s.ocName}|${s.role}|${s.cpr}|${s.weight}|${s.difficulty}|${s.tag}`;
            const hit = grouped.find(g => g._key === key);
            if (hit) hit._count++;
            else grouped.push(Object.assign({ _key: key, _count: 1 }, s));
        }
        const display = grouped.slice(0, 5);
        for (const s of display) {
          const card      = document.createElement('div');
          const borderCol = s.tag === 'good' ? '#3a5030' : s.tag === 'risky' ? '#4a2820' : s.tag === 'marginal' ? '#1c1810' : '#3a3018';
          card.style.cssText = 'background:var(--ocm-bg-card);border:0.5px solid ' + borderCol + ';border-radius:6px;padding:8px 12px;margin-bottom:6px';

          const cprCol = s.cpr == null ? '#555' : s.cpr >= CPR_WARN ? 'var(--ocm-cpr-good)' : s.cpr >= CPR_CRIT ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-crit)';
          const wCol   = s.weight == null ? '#555' : s.weight >= WEIGHT_HIGH ? 'var(--ocm-cpr-warn)' : s.weight >= WEIGHT_MID ? '#aaa' : '#555';
          const cprStr = s.cpr    != null ? (s.cpr    + '%') : '?';
          const wStr   = s.weight != null ? (s.weight.toFixed(0) + '%') : '?';

          let tagHtml = '';
          if      (s.tag === 'good')          tagHtml = '<span style="font-size:10px;background:#14201a;color:var(--ocm-cpr-good);border-radius:3px;padding:1px 6px;margin-left:6px">&#10003; Good fit</span>';
          else if (s.tag === 'underutilised') tagHtml = '<span style="font-size:10px;background:#1c1810;color:var(--ocm-cpr-warn);border-radius:3px;padding:1px 6px;margin-left:6px">&#9432; Low-weight role</span>';
          else if (s.tag === 'marginal')      tagHtml = '<span style="font-size:10px;background:#1c1810;color:var(--ocm-cpr-warn);border-radius:3px;padding:1px 6px;margin-left:6px">&#9888; Marginal CPR</span>';
          else if (s.tag === 'risky')         tagHtml = '<span style="font-size:10px;background:#1c1410;color:var(--ocm-cpr-crit);border-radius:3px;padding:1px 6px;margin-left:6px">&#9888; Below threshold</span>';

          if (s.urgent) {
            const secsLeft = s.expiredAt ? s.expiredAt - Math.floor(Date.now()/1000) : null;
            const urgLabel = secsLeft != null && secsLeft < 6 * 3600
              ? '&#9201; Expires soon'
              : secsLeft != null && secsLeft < 24 * 3600
                ? '&#9201; Expiring today'
                : '&#9201; Nearly ready';
            tagHtml += '<span style="font-size:10px;background:#181810;color:var(--ocm-cpr-warn);border-radius:3px;padding:1px 6px;margin-left:4px">' + urgLabel + '</span>';
          }

          let adviceHtml = '';
          if      (s.tag === 'underutilised') adviceHtml = '<div style="font-size:10px;color:var(--ocm-text-dim);margin-top:4px">This role has low weight (' + wStr + ') \u2014 your ' + cprStr + ' CPR won\u2019t make much difference here. Check if a higher-weight role is available at this difficulty.</div>';
          else if (s.tag === 'marginal')      adviceHtml = '<div style="font-size:10px;color:var(--ocm-text-dim);margin-top:4px">Your CPR is slightly below the ' + CPR_WARN + '% threshold. You can join but may hold the OC back \u2014 check if a lower-weight role is available instead.</div>';
          else if (s.tag === 'risky')         adviceHtml = '<div style="font-size:10px;color:var(--ocm-text-dim);margin-top:4px">Your CPR is below the critical threshold (' + CPR_CRIT + '%). Joining this role is likely to cause the OC to fail. Avoid if possible.</div>';

          // Join button: drives Torn's own crime list on this same page (finds
          // the OC card by data-oc-id, opens the slot; Torn still asks you to
          // confirm — the script never joins for you).
          const joinHtml = s.ocId != null
            ? '<div style="margin-top:6px"><button class="ocm-join-btn ocm-mm-join" data-ocid="' + esc(String(s.ocId)) + '" data-ocname="' + esc(s.ocName) + '" data-role="' + esc(s.role) + '" title="Jump to ' + esc(s.role) + ' in ' + esc(s.ocName) + ' in the crimes list and open the slot. Torn asks you to confirm before you actually join.">Join this slot ▸</button></div>'
            : '';
          card.innerHTML =
            '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap">'
              + '<span style="font-weight:bold;color:var(--ocm-text);font-size:12px">' + s.role + '</span>'
              + (s._count > 1 ? '<span style="color:var(--ocm-cpr-good);font-size:10px;font-weight:bold" title="' + s._count + ' identical open seats">×' + s._count + ' open</span>' : '')
              + '<span style="color:var(--ocm-text-muted);font-size:11px">in</span>'
              + '<span style="color:var(--ocm-link);font-size:12px">' + s.ocName + '</span>'
              + '<span style="color:var(--ocm-text-muted);font-size:10px">D' + s.difficulty + '</span>'
              + '<span style="margin-left:auto;display:flex;gap:10px;font-size:11px;white-space:nowrap">'
                + '<span>CPR: <strong style="color:' + cprCol + '">' + cprStr + '</strong></span>'
                + '<span>Weight: <strong style="color:' + wCol + '">' + wStr + '</strong></span>'
              + '</span>'
            + '</div>'
            + '<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;min-height:18px">' + tagHtml + '</div>'
            + adviceHtml
            + joinHtml;
          const mmJoin = card.querySelector('.ocm-mm-join');
          if (mmJoin) mmJoin.addEventListener('click', () => joinOcSlot(mmJoin.dataset.ocid, mmJoin.dataset.ocname, mmJoin.dataset.role));
          container.appendChild(card);
        }
      }
    }

    footer.appendChild(container);
    startCountdowns();

    GM_setValue(GMK.SIDEBAR_CACHE, JSON.stringify({
      name: 'Member Mode', executesAt: null, timeLeft: null, openCount: 0,
      severity: 'ok', issues: [], cachedAt: Math.floor(Date.now() / 1000), memberMode: true,
    }));
    renderSidebarWidget();
    document.getElementById('ocm-last-update').textContent = 'Updated ' + new Date().toLocaleTimeString() + ' \xB7 Member Mode';
  }


  // ─── TORNSTATS CPR ────────────────────────────────────────────────────────────

  function fetchTornStatsCpr(tsKey) {
    return gmFetch(`https://www.tornstats.com/api/v2/${tsKey}/faction/cpr`)
      .then(json => {
        if (!json.status) throw new Error(json.message || 'TornStats error');
        return json.members || {};
      });
  }

  function tsLowestCpr(obj) {
    let min = null;
    for (const roles of Object.values(obj)) for (const v of Object.values(roles)) if (min === null || v < min) min = v;
    return min;
  }

  /** Look up a member's TornStats CPR for a specific OC name + role.
   *  Falls back to: any role in same crime → overall lowest CPR.
   *  Returns { cpr, exact } where exact=true if crime+role matched. */
  /** Look up CPR for a member's specific OC role.
   *  Resolution order:
   *    1. TornStats exact crime+role match  (exact: true)
   *    2. TornStats fuzzy crime match, any role  (exact: false)
   *    3. Faction OC history avg for this crime+role  (exact: true, history)
   *    4. Faction OC history avg for this crime, any role  (exact: false, history)
   *    5. TornStats overall lowest  (exact: false)
   *  Returns { cpr, exact, source } | null. */
  /**
   * Predict a member's CPR for a given crime + role.
   *
   * SOURCE PRIORITY — observed fact beats third-party estimate:
   *
   *   1. OUR OWN ARCHIVE, exact crime+role, from a real faction run.
   *      This is a CPR Torn itself reported after that member actually ran that
   *      role. It's not an estimate at all. It persists past the API's ~100-OC
   *      window, so it's the only long-term memory the faction has.
   *   2. The current API window (averaged across repeat runs of the same role).
   *   3. TornStats, exact crime+role — a third-party estimate, and often stale.
   *   4/5. Fuzzy fallbacks: same crime but a different role, then TornStats' lowest.
   *
   * Until now this ran BACKWARDS — TornStats was consulted first, so a stale
   * third-party guess could override a CPR that Torn had actually reported for that
   * exact member in that exact role. The archive was being written and never read.
   *
   * @returns {{cpr:number, exact:boolean, source:'own'|'ts', observed:boolean, at:number|null}|null}
   */
  function tsGetCpr(uid, ocName, roleName) {
    const normOc   = (ocName || '').toLowerCase().trim().replace(/\s+v\d+$/i, '');
    const normRole = (roleName || '').toLowerCase().trim().replace(/\s*#\d+$/, '');
    const key      = String(uid);

    // ── 1. Our own archive, exact match, from a real run (has an executedAt).
    const arcMember = cprArchive()[key];
    if (arcMember?.slots) {
      let fuzzy = null;
      for (const rec of Object.values(arcMember.slots)) {
        const rOc   = String(rec.ocName || '').toLowerCase().trim().replace(/\s+v\d+$/i, '');
        const rRole = String(rec.role   || '').toLowerCase().trim().replace(/\s*#\d+$/, '');
        if (rec.cpr == null) continue;
        const ocMatch = rOc === normOc || rOc.includes(normOc) || normOc.includes(rOc);
        if (!ocMatch) continue;
        if (rRole === normRole) {
          // Observed run wins outright. A TornStats-backfilled row (executedAt null)
          // is only an estimate, so let the ladder below try for something better.
          if (rec.executedAt) {
            return { cpr: rec.cpr, exact: true, source: 'own', observed: true, at: rec.executedAt };
          }
        } else {
          // Same crime, DIFFERENT role — only a proxy. Keep the LOWEST, never the
          // best: guessing high for a role they've never run is how you end up
          // recommending someone into a seat they'll fail. Prefer an observed row
          // over a TornStats-backfilled one at equal footing.
          if (!fuzzy
              || (rec.executedAt && !fuzzy.executedAt)
              || (!!rec.executedAt === !!fuzzy.executedAt && rec.cpr < fuzzy.cpr)) {
            fuzzy = rec;
          }
        }
      }
      // stash for step 4
      var _arcFuzzy = fuzzy;
    }

    // ── 2. Current API window: averaged across repeat runs of this exact role.
    const history = window._ocmHistoryCpr;
    const memberHist = history && history[key];
    if (memberHist) {
      for (const [crime, roles] of Object.entries(memberHist)) {
        const ocMatch = crime === normOc || crime.includes(normOc) || normOc.includes(crime);
        if (!ocMatch) continue;
        if (roles[normRole]) {
          const b = roles[normRole];
          return { cpr: Math.round(b.sum / b.count), exact: true, source: 'own', observed: true, at: null };
        }
      }
    }

    // ── 3. TornStats, exact crime+role.
    const memberData = tsCprData[key];
    if (memberData) {
      for (const [crime, roles] of Object.entries(memberData)) {
        const nc = crime.toLowerCase().trim().replace(/\s+v\d+$/i, '');
        if (nc === normOc || nc.includes(normOc) || normOc.includes(nc)) {
          for (const [role, cpr] of Object.entries(roles)) {
            if (role.toLowerCase().trim() === normRole) {
              return { cpr, exact: true, source: 'ts', observed: false, at: null };
            }
          }
        }
      }
    }

    // ── 4. Same crime, different role — ours first, then TornStats.
    if (typeof _arcFuzzy !== 'undefined' && _arcFuzzy) {
      return { cpr: _arcFuzzy.cpr, exact: false, source: 'own', observed: !!_arcFuzzy.executedAt, at: _arcFuzzy.executedAt ?? null };
    }
    if (memberHist) {
      for (const [crime, roles] of Object.entries(memberHist)) {
        const ocMatch = crime === normOc || crime.includes(normOc) || normOc.includes(crime);
        if (!ocMatch) continue;
        const buckets = Object.values(roles);
        if (buckets.length) {
          const s = buckets.reduce((a, b) => a + b.sum, 0);
          const c = buckets.reduce((a, b) => a + b.count, 0);
          return { cpr: Math.round(s / c), exact: false, source: 'own', observed: true, at: null };
        }
      }
    }
    if (memberData) {
      for (const [crime, roles] of Object.entries(memberData)) {
        const nc = crime.toLowerCase().trim().replace(/\s+v\d+$/i, '');
        if (nc === normOc || nc.includes(normOc) || normOc.includes(nc)) {
          const vals = Object.values(roles);
          if (vals.length) return { cpr: Math.min(...vals), exact: false, source: 'ts', observed: false, at: null };
        }
      }
      // ── 5. TornStats' overall lowest, as a last resort.
      const low = tsLowestCpr(memberData);
      if (low !== null) return { cpr: low, exact: false, source: 'ts', observed: false, at: null };
    }

    // No personal data at all — return null so the caller flags this member as
    // needing to run the OC first, rather than guessing from faction averages.
    return null;
  }

  /**
   * Profit tab — aggregates money, item value, and respect from completed OCs.
   * Item value = quantity × market_price (from /torn/items value.market_price).
   * Built from the same ~100-OC completed window the rest of the dashboard uses.
   */
  /**
   * Analyse item requirements across all active OCs vs faction armory stock.
   * Returns:
   *   items:   [{ id, name, isTool, held, needed, filledMissing, openNeed, shortfall, unitValue, coverCost }]
   *   loans:   [{ uid, name, itemId, itemName, ocName, ocId, role, difficulty, readyAt, inArmory }]  (filled slots missing the item)
   *   summary: { distinctItems, totalNeeded, totalHeld, totalShortfall, coverCost, loanCount, armoryGaps }
   *
   * Terms:
   *   held          = quantity in faction armory
   *   filledMissing = # slots that have a member but the member lacks the item (a loan to hand out)
   *   openNeed      = # open (unfilled) slots that will need the item once filled
   *   needed        = filledMissing + openNeed (total demand from current OCs)
   *   shortfall     = max(0, needed - held) — how many MORE the faction must source
   */
  function analyseOcItems(crimes, armory = {}, itemNames = {}, itemValues = {}, memberNames = {}) {
    const items = {};   // id -> aggregate
    const loans = [];   // per filled-slot-missing-item
    const ensure = (id) => {
      if (!items[id]) items[id] = {
        id, name: itemNames[String(id)] || `Item #${id}`, isTool: false,
        held: Number(armory[String(id)]) || 0,
        filledMissing: 0, openNeed: 0,
        unitValue: Number(itemValues[String(id)]) || 0,
      };
      return items[id];
    };

    for (const [ocId, oc] of Object.entries(crimes || {})) {
      if (!oc || typeof oc !== 'object') continue;
      const status = (oc.status || '').toLowerCase();
      // Only active OCs consume items (recruiting/planning/ready)
      if (status !== 'recruiting' && status !== 'planning' && status !== 'ready') continue;
      const ocSlots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
      for (const slot of ocSlots) {
        const req = slot.item_requirement;
        if (!req || !req.id) continue;
        const id = String(req.id);
        const rec = ensure(id);
        rec.isTool = req.is_reusable ?? rec.isTool;
        const uid = slot.user?.id ? String(slot.user.id) : null;
        if (uid) {
          // Filled slot — if the member doesn't have the item, it's a loan to give
          if (req.is_available === false) {
            rec.filledMissing++;
            loans.push({
              uid,
              name: resolveMemberName(uid, memberNames, slot.user?.name),
              itemId: id,
              itemName: rec.name,
              isTool: rec.isTool,
              ocName: oc.name || `OC #${ocId}`,
              ocId: oc.id ?? ocId,
              role: slot.position_info?.label || slot.position || '?',
              difficulty: oc.difficulty ?? '?',
              readyAt: oc.ready_at ?? oc.execute_at ?? null,
              inArmory: (Number(armory[id]) || 0) > 0,
            });
          }
        } else {
          // Open slot — will need the item once someone joins
          rec.openNeed++;
        }
      }
    }

    // Finalise per-item aggregates
    const itemList = Object.values(items).map(r => {
      const needed    = r.filledMissing + r.openNeed;
      const shortfall = Math.max(0, needed - r.held);
      return { ...r, needed, shortfall, coverCost: shortfall * r.unitValue };
    }).sort((a, b) => b.shortfall - a.shortfall || b.needed - a.needed);

    // Sort loans by deadline (soonest first), then by whether armory can cover
    loans.sort((a, b) => {
      const ra = a.readyAt || Infinity, rb = b.readyAt || Infinity;
      if (ra !== rb) return ra - rb;
      return (b.inArmory ? 1 : 0) - (a.inArmory ? 1 : 0);
    });

    const summary = {
      distinctItems:  itemList.length,
      totalNeeded:    itemList.reduce((s, r) => s + r.needed, 0),
      totalHeld:      itemList.reduce((s, r) => s + r.held, 0),
      totalShortfall: itemList.reduce((s, r) => s + r.shortfall, 0),
      coverCost:      itemList.reduce((s, r) => s + r.coverCost, 0),
      loanCount:      loans.length,
      armoryGaps:     itemList.filter(r => r.shortfall > 0).length,
    };
    return { items: itemList, loans, summary };
  }

  /** Faction armoury page for an item's OWN sub-tab — the in-game loan flow
   *  (API can't loan, this opens the UI). Torn's sub= values: utilities /
   *  armour / weapons (and it's sub=utilities PLURAL — sub=utility silently
   *  lands on the wrong tab). Most OC items are utilities, but a Construction
   *  Helmet lives under armour — pass the item's category from OCM_ARMOURY_CATS. */
  function armoryGiveUrl(cat) {
    const sub = ['utilities', 'armour', 'weapons'].includes(cat) ? cat : 'utilities';
    return `https://www.torn.com/factions.php?step=your#/tab=armoury&start=0&sub=${sub}`;
  }

  // ─── LOAN AUTOFILL ──────────────────────────────────────────────────────────
  // Torn's API cannot loan an item, so the loan itself must happen in the game UI.
  // What we CAN do is carry the intent across to the armory page and fill the form
  // out, so the leader only has to eyeball it and hit LOAN.
  //
  // The member field (input.ac-search[name="user"]) is a jQuery-UI autocomplete, so
  // a bare .value assignment normally gets ignored. The trick comes from Torn's own
  // Handlebars template, which submits the field as:
  //     value="{{user.playername}} [{{user.userID}}]"
  // i.e. "Name [12345]" is exactly what selecting from the dropdown produces — so we
  // can write that string directly and skip the autocomplete entirely.
  //
  // We deliberately DO NOT auto-submit. This hands over real faction property; the
  // human confirms.
  const LOAN_INTENT_TTL = 5 * 60; // seconds — a stale intent must never fire later

  /** Record what the leader is about to loan, for the armory page to pick up. */
  function setLoanIntent(intent) {
    try {
      // mode: 'give' (loan it TO them) or 'retrieve' (take it BACK from them).
      // These drive different controls on different ROWS of the armory. Treating a
      // retrieve as a give loans out a SECOND copy — the exact opposite of intent.
      GM_setValue(GMK.LOAN_INTENT, JSON.stringify({ mode: 'give', ...intent, ts: Math.floor(Date.now() / 1000) }));
    } catch (_) {}
  }
  /** Read + consume a fresh loan intent (one-shot; stale ones are discarded). */
  function takeLoanIntent() {
    let it = null;
    try { it = JSON.parse(GM_getValue(GMK.LOAN_INTENT, 'null')); } catch (_) { return null; }
    if (!it || !it.itemId) return null;
    GM_setValue(GMK.LOAN_INTENT, 'null');                       // consume — fire once only
    if ((Math.floor(Date.now() / 1000) - (it.ts || 0)) > LOAN_INTENT_TTL) return null;
    return it;
  }

  /** Set a value on an input the way a real user would, so framework listeners fire. */
  function setNativeValue(input, value) {
    const proto = Object.getPrototypeOf(input);
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(input, value); else input.value = value;
    for (const type of ['input', 'change', 'keyup', 'blur']) {
      input.dispatchEvent(new Event(type, { bubbles: true }));
    }
  }

  /**
   * Take the player to the recommended slot in Torn's own crimes list, and open it.
   *
   * Joining an OC CANNOT be done through the API — it's read-only — so this has to
   * drive Torn's own UI. Torn's OC 2.0 markup isn't something we control, so every
   * selector we depend on lives in JOIN_SELECTORS below, and each step degrades:
   *   found the join control -> click it (Torn still shows its own confirmation)
   *   found only the OC card -> scroll to it and pulse the slot, user clicks
   *   found nothing          -> say so plainly, rather than pretending
   *
   * We never confirm the join itself. Joining commits the player to an OC, and a
   * script silently signing you up for a crime is not a thing that should exist.
   */
  /**
   * Torn's OC 2.0 crimes DOM, as of the saved page this was written against:
   *
   *   <div data-oc-id="1887534">                    <- the OC card
   *     <div class="wrapper___QkQL5 waitingJoin___nUKtz">   <- a slot
   *       <button class="slotHeader___oD218">
   *         <span class="title___d55Wy">Pickpocket</span>   <- the role
   *       </button>
   *       <div class="slotBody___qy1ah">
   *         <button class="torn-btn joinButton___HHfqg">Join</button>
   *
   * The class names are CSS-module hashes (title___d55Wy) and WILL change on any
   * Torn deploy, so nothing here depends on them. We anchor on the two things that
   * are stable: the data-oc-id attribute, and the button's visible "Join" text.
   * The slot is found by walking up from each Join button until we hit the element
   * that also holds a role title — no fixed depth, no hashed class.
   */
  const JOIN = {
    // OC ids are numeric; sanitising beats depending on CSS.escape being present.
    card:  (ocId) => {
      const id = String(ocId).replace(/[^\d]/g, '');
      return id ? document.querySelector(`[data-oc-id="${id}"]`) : null;
    },
    isJoinBtn: (b) => /^join$/i.test((b.textContent || '').trim()),
    // Role label inside a slot. Falls back to any short span if the hash prefix moves.
    roleTextOf: (slot) => {
      const el = slot.querySelector('[class*="title___"]')
              || slot.querySelector('button span, span');
      return (el?.textContent || '').trim();
    },
    // Walk up from a Join button to the slot container that also holds the role title.
    slotOf: (btn, card) => {
      let el = btn.parentElement;
      while (el && el !== card) {
        if (el.querySelector('[class*="title___"]')) return el;
        el = el.parentElement;
      }
      return null;
    },
  };

  /** "Looter #2" / "Bomber #1" -> "looter" / "bomber" so our label matches Torn's. */
  function normRole(s) {
    return String(s || '').replace(/#\s*\d+\s*$/, '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  /**
   * Join the recommended slot in Torn's own crimes list.
   *
   * The API is read-only, so this drives Torn's UI. It clicks the slot's Join
   * button — Torn then shows ITS OWN confirmation, which we never auto-accept.
   * A script silently committing you to a crime should not exist.
   *
   * Every failure is reported rather than silently swallowed, because the most
   * dangerous outcome here is clicking the WRONG slot.
   */
  function joinOcSlot(ocId, ocName, role) {
    const card = JOIN.card(ocId);
    if (!card) {
      ocmToast(`"${ocName}" isn't on screen — switch Torn's crime list to the tab it's in (Recruiting/Planning), then try again.`, 'warn');
      return;
    }
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Every open slot in this OC (a Join button means the seat is free).
    const joinBtns = [...card.querySelectorAll('button')].filter(JOIN.isJoinBtn);
    if (!joinBtns.length) {
      ocmToast(`No open slots left in ${ocName} — someone just took it.`, 'warn');
      return;
    }

    // Match our role to Torn's slot title. Torn labels duplicate roles "Robber #2",
    // so try the EXACT label first and only then fall back to the base role — that
    // way, when an OC has two Robbers open, we take the one we actually recommended.
    const openSlots = joinBtns.map(btn => {
      const slot = JOIN.slotOf(btn, card);
      return slot ? { btn, slot, label: JOIN.roleTextOf(slot) } : null;
    }).filter(Boolean);

    const exact = (a, b) => String(a).replace(/\s+/g, ' ').trim().toLowerCase()
                         === String(b).replace(/\s+/g, ' ').trim().toLowerCase();
    let chosen = openSlots.find(s => exact(s.label, role))
              || openSlots.find(s => normRole(s.label) === normRole(role));

    if (!chosen) {
      // The role we recommended is no longer open. Do NOT click a different one —
      // joining the wrong role is worse than not joining.
      const open = [...new Set(openSlots.map(s => s.label))];
      const firstSlot = openSlots[0]?.slot || card;
      firstSlot.classList.add('ocm-join-target');
      setTimeout(() => firstSlot.classList.remove('ocm-join-target'), 6000);
      ocmToast(`The ${role} slot in ${ocName} is gone. Still open: ${open.join(', ') || 'none'}.`, 'warn');
      return;
    }

    chosen.slot.classList.add('ocm-join-target');
    setTimeout(() => chosen.slot.classList.remove('ocm-join-target'), 6000);
    chosen.btn.click();
    ocmToast(`${role} in ${ocName} — confirm in Torn's dialog to join.`, 'ok');
  }

  /**
   * Annotate the Utilities armory with an "OC Status" column.
   *
   * Answers ONE question, about the items that are out on loan: is the person
   * holding it actually using it?
   *   🎯 In use     — loaned to someone whose current OC role requires it
   *   ♻ Not needed  — loaned out, but the holder's role doesn't require it. Dead
   *                   weight — pull it back so someone who needs it can have it.
   *   (blank)       — not loaned out; it's just in the armory. Nothing to say.
   *
   * Earlier versions also rated the AVAILABLE rows ("Wanted"/"Reserved"). That was
   * noise: it mixed "someone is waiting for this" with "an empty seat might need it
   * one day", and neither belongs in a column about loans. The dashboard's Costs tab
   * already covers what to stock.
   *
   * Torn's row layout is fixed-width floats, so the column's width is borrowed
   * from the name column (see the CSS) rather than appended, which would wrap.
   */
  // Cached OC demand, so a re-render doesn't re-hit the API.
  let _armoryNeed = null;

  /** Build "who needs what right now" from the faction's active OCs, plus the
   *  REAL stock across all three armouries (v5.1.2 — the quick-loan panel used
   *  to judge stock from the rows on the current page, so an armour item viewed
   *  from the utilities tab read "✗ not stocked" even with a shelf full). */
  async function fetchArmoryNeed(apiKey) {
    const [f, m, u, ar, w] = await Promise.all([
      apiFetch('/faction?selections=crimes', apiKey),
      apiFetch('/faction?selections=members', apiKey),
      apiFetch('/faction?selections=utilities', apiKey).catch(() => ({})),
      apiFetch('/faction?selections=armor', apiKey).catch(() => ({})),
      apiFetch('/faction?selections=weapons', apiKey).catch(() => ({})),
    ]);
    const crimes = f.crimes || {};
    const members = m.members || {};
    const parsedArmoury = { armory: {}, loanedOut: [], cats: {} };
    parseArmouryCat(u, 'utilities', parsedArmoury);
    parseArmouryCat(ar, 'armor', parsedArmoury);
    parseArmouryCat(w, 'weapons', parsedArmoury);
    const names = {};
    for (const [k, mem] of Object.entries(members)) names[String(mem.id ?? k)] = mem.name;

    const needByUser = new Map();   // "uid|itemId" -> {oc, role, has}
    for (const [ocId, oc] of Object.entries(crimes)) {
      const st = (oc.status || '').toLowerCase();
      if (st !== 'recruiting' && st !== 'planning' && st !== 'ready') continue;
      const slots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || {});
      for (const s of slots) {
        const req = s.item_requirement;
        if (!req?.id) continue;
        const uid = s.user?.id ? String(s.user.id) : null;
        if (!uid) continue;                       // open slot: nobody holding anything
        needByUser.set(`${uid}|${String(req.id)}`, {
          oc: oc.name || `OC #${ocId}`,
          role: s.position_info?.label || s.position || '?',
          has: req.is_available !== false,
        });
      }
    }
    const userNeeds = {};
    for (const [key, v] of needByUser) {
      const [uid, iid] = key.split('|');
      (userNeeds[uid] = userNeeds[uid] || []).push({ iid, ...v });
    }
    // Resolve the needed items' names once — the slot payload only carries ids,
    // and the quick-loan panel has to say WHAT someone needs.
    const itemNames = {};
    const ids = [...new Set([...needByUser.keys()].map(k => k.split('|')[1]))];
    if (ids.length) {
      try {
        const data = await apiFetchV1(`torn/${ids.join(',')}?selections=items`, apiKey);
        for (const [id, it] of Object.entries(data?.items || {})) if (it?.name) itemNames[id] = it.name;
      } catch (_) { /* names degrade to #id */ }
    }
    return { needByUser, userNeeds, names, itemNames, stock: parsedArmoury.armory, cats: parsedArmoury.cats };
  }

  /**
   * Paint the OC Status column onto whatever rows are currently in the DOM.
   *
   * IDEMPOTENT by design. Torn re-renders the whole item list over AJAX after a
   * Give/Loan/Retrieve, which destroys our injected cells — but the wrapper keeps
   * the .ocm-armory-annotated class, so the CSS kept stealing 110px from the name
   * column with nothing left to fill it. That's the misaligned table after a
   * retrieve. This can now be re-run safely on every mutation, and it strips the
   * class if it can't annotate, so a failure leaves Torn's layout untouched rather
   * than broken.
   */
  function paintArmoryColumn(wrap, need) {
    if (!wrap) return;
    if (!need) { wrap.classList.remove('ocm-armory-annotated'); return; }

    const rows = [...wrap.querySelectorAll('.item-list > li')]
      .filter(li => li.querySelector('.img-wrap[data-itemid]'));
    if (!rows.length) { wrap.classList.remove('ocm-armory-annotated'); return; }

    wrap.classList.add('ocm-armory-annotated');

    // Header cell
    const title = wrap.querySelector('.list-title');
    if (title && !title.querySelector('.ocm-acol')) {
      const th = document.createElement('li');
      th.className = 'ocm-acol';
      th.textContent = 'OC Status';
      title.insertBefore(th, title.querySelector('.type'));
    }

    for (const li of rows) {
      const typeCell = li.querySelector('.type');
      if (!typeCell) continue;
      let cell = li.querySelector('.ocm-acol');
      if (!cell) {
        cell = document.createElement('div');
        li.insertBefore(cell, typeCell);
      }

      const iid = li.querySelector('.img-wrap[data-itemid]')?.dataset.itemid;
      const itemName = (li.querySelector('.name')?.textContent || '').replace(/\s*x\s*\d+\s*$/, '').trim();
      const holderLink = li.querySelector('.loaned a[href*="XID="]');
      const holderId = holderLink ? (holderLink.href.match(/XID=(\d+)/) || [])[1] : null;
      const holderName = holderLink ? holderLink.textContent.trim() : null;

      let cls, text, tip;
      if (holderId) {
        const n = need.needByUser.get(`${holderId}|${iid}`);
        if (n) {
          cls = 's-inuse'; text = '🎯 In use';
          tip = `${holderName} needs this for ${n.oc} (${n.role}). Leave it with them.`;
        } else {
          cls = 's-idle'; text = '♻ Not needed';
          const theirs = need.userNeeds[holderId];
          if (theirs && theirs.length) {
            const t = theirs[0];
            tip = `${holderName} is holding ${itemName}, but their role in ${t.oc} (${t.role}) needs a different item`
                + (t.has ? ' — which they already have.' : ' — which they still need!')
                + ' This one can be retrieved.';
          } else {
            tip = `${holderName} isn't in an active OC that needs ${itemName}. This can be retrieved.`;
          }
        }
      } else {
        cls = 's-none'; text = ''; tip = '';
      }
      cell.className = `ocm-acol ${cls}`;
      cell.textContent = text;
      cell.title = tip;
    }
  }

  /**
   * QUICK-LOAN PANEL on the armoury page (v4.9): everyone whose current OC slot
   * needs an item they don't have, each with a Loan button that opens THIS
   * page's loan form prefilled (item row found, quantity + member filled in).
   * The human still presses LOAN — the script never hands out property itself.
   *
   * Injected as a SIBLING above the armoury wrapper so Torn's AJAX re-render
   * of the item list can't wipe it; the observer refresh re-renders content.
   */
  function injectQuickLoanPanel(wrap, need) {
    const old = document.getElementById('ocm-quickloan');
    if (!wrap || !need) { old?.remove(); return; }

    const pending = [];
    for (const [key, v] of need.needByUser) {
      if (v.has !== false) continue;   // they already hold their required item
      const [uid, iid] = key.split('|');
      pending.push({ uid, iid, name: need.names[uid] || ('#' + uid), oc: v.oc, role: v.role,
                     itemName: need.itemNames?.[iid] || ('#' + iid) });
    }
    if (!pending.length) { old?.remove(); return; }

    // Stocked = the API says the armoury (ANY of the three tabs) has a free one.
    // The old check only looked at the rows on the CURRENT page, so an armour
    // item viewed from the utilities tab always read "not stocked". DOM check
    // stays as the fallback when the API stock didn't load.
    const stocked = (iid) => {
      if (need.stock && need.stock[iid] != null) return need.stock[iid] > 0;
      return [...document.querySelectorAll(`.img-wrap[data-itemid="${iid}"]`)]
        .map(w => w.closest('li')).filter(Boolean)
        .some(li => !li.querySelector('.loaned a[href*="XID="]'));
    };
    pending.sort((a, b) => Number(stocked(b.iid)) - Number(stocked(a.iid)) || a.name.localeCompare(b.name));

    const panel = old || document.createElement('div');
    panel.id = 'ocm-quickloan';
    // Self-contained styling — the theme vars live on #ocm-root, which doesn't
    // exist on the armoury page.
    panel.style.cssText = 'background:#1e1e1e;border:1px solid #2e2e2e;border-radius:8px;padding:12px 14px;margin:8px 0;font:12px/1.5 Arial,sans-serif;color:#ccc';
    panel.innerHTML = `
      <div style="font-size:12px;font-weight:700;color:#59a5d8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">⚔ OC Suite — quick loans (${pending.length})</div>
      <div style="font-size:11px;color:#8a8a99;margin-bottom:6px">Members whose current OC slot needs an item they don't have. <b style="color:#7abf7a">Loan ▸</b> opens this page's loan form prefilled — check it, then press LOAN yourself.</div>
      ${pending.map(p => {
        const ok = stocked(p.iid);
        return `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-top:1px solid #242424">
          <img src="${itemImgUrl(p.iid)}" alt="" loading="lazy" style="height:20px;width:auto" onerror="this.remove()">
          <a href="/profiles.php?XID=${esc(p.uid)}" target="_blank" style="color:#7a9acc;text-decoration:none;font-weight:700;min-width:90px">${esc(p.name)}</a>
          <span style="color:#e0e0e0">${esc(p.itemName)}</span>
          <span style="color:#8a8a99;font-size:11px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.oc)} · ${esc(p.role)}</span>
          ${ok
            ? `<button class="ocm-ql-btn" data-item="${esc(p.iid)}" data-itemname="${esc(p.itemName)}" data-uid="${esc(p.uid)}" data-member="${esc(p.name)}"
                 style="background:#1c2a1c;border:1px solid #3a5a3a;color:#7abf7a;font-size:11px;font-weight:700;padding:3px 12px;border-radius:4px;cursor:pointer;white-space:nowrap">Loan ▸</button>`
            : `<span style="color:#bf7a7a;font-size:11px;white-space:nowrap" title="The armoury has no free ${esc(p.itemName)} — source one first (Money > Costs shows the price)">✗ not stocked</span>`}
        </div>`;
      }).join('')}`;
    if (!panel.isConnected) wrap.parentNode.insertBefore(panel, wrap);

    panel.querySelectorAll('.ocm-ql-btn').forEach(b => b.addEventListener('click', () => {
      const intent = { mode: 'give', itemId: b.dataset.item, itemName: b.dataset.itemname,
                       uid: b.dataset.uid, memberName: b.dataset.member, qty: 1 };
      // Item rows on THIS page → drive them directly. Item in a DIFFERENT
      // armoury tab (a Construction Helmet from the utilities tab) → store the
      // intent and hop to its tab; the hashchange boot re-runs the same
      // autofill flow there.
      if (document.querySelector(`.img-wrap[data-itemid="${intent.itemId}"]`)) {
        execArmoryLoanIntent(intent);
      } else {
        setLoanIntent(intent);
        const sub = (need.cats && need.cats[intent.itemId]) || 'utilities';
        location.hash = `#/tab=armoury&start=0&sub=${sub}`;
      }
    }));
  }

  /**
   * Annotate the Utilities armory with an "OC Status" column.
   *
   * Answers ONE question, about the items that are out on loan: is the person
   * holding it actually using it?
   *   🎯 In use     — loaned to someone whose current OC role requires it
   *   ♻ Not needed  — loaned out, but the holder's role doesn't require it
   *   (blank)       — not loaned out; nothing to say
   */
  let _armoryNeedAt = 0;
  /** Which armoury sub-tab the hash currently shows ('' when not an armoury page we handle). */
  function armourySubOf() {
    if (!location.hash.includes('tab=armoury')) return '';
    const m = location.hash.match(/sub=(\w+)/);
    return ['utilities', 'armour', 'weapons'].includes(m?.[1]) ? m[1] : '';
  }

  async function initArmoryAnnotations() {
    if (!location.href.includes('factions.php')) return;
    // v5.1.2: runs on ALL THREE armouries — OC requirements can be armour or
    // weapons, so the quick-loan panel belongs on those tabs too. The OC Status
    // COLUMN stays utilities-only: its width-borrowing CSS is verified against
    // that tab's fixed float layout and nothing else.
    const sub = armourySubOf();
    if (!sub) return;

    const apiKey = GM_getValue(GMK.API_KEY, '');
    if (!apiKey) return;

    const firstRow = await waitForEl('.item-list li .img-wrap[data-itemid]', 15000);
    if (!firstRow) return;
    const wrap = firstRow.closest('.armoury-tabs') || document.querySelector('.armoury-temporary-wrap');
    if (!wrap) return;

    if (!_armoryNeed) {
      try {
        _armoryNeed = await fetchArmoryNeed(apiKey);
        _armoryNeedAt = Date.now();
      } catch (e) {
        wrap.classList.remove('ocm-armory-annotated');   // don't leave the layout broken
        ocmToast('Could not load OC status for the armory: ' + e.message, 'warn');
        return;
      }
    }

    const paint = () => {
      if (armourySubOf() === 'utilities') paintArmoryColumn(wrap, _armoryNeed);
      else wrap.classList.remove('ocm-armory-annotated');   // never mangle the armour/weapons layout
      injectQuickLoanPanel(wrap, _armoryNeed);
    };
    paint();

    // Torn rebuilds the list after Give / Loan / Retrieve. Repaint when it does.
    // Guard against our own DOM writes re-triggering the observer.
    if (wrap.__ocmObserved) return;
    wrap.__ocmObserved = true;
    let painting = false;
    const obs = new MutationObserver(() => {
      if (painting) return;
      const curSub = armourySubOf();
      if (!curSub) return;
      if (curSub === 'utilities') {
        const rows = wrap.querySelectorAll('.item-list > li .img-wrap[data-itemid]');
        const cells = wrap.querySelectorAll('.item-list > li .ocm-acol');
        if (rows.length && cells.length >= rows.length) return;   // already painted
      } else if (Date.now() - _armoryNeedAt < 10_000) {
        // Non-utilities tabs have no painted cells to check against, so a
        // cooldown stops list mutations from turning into an API refetch storm.
        painting = true;
        paint();
        painting = false;
        return;
      }
      painting = true;
      // A retrieve also CHANGES who holds what, so refresh the OC picture too.
      fetchArmoryNeed(apiKey)
        .then(n => { _armoryNeed = n; _armoryNeedAt = Date.now(); })
        .catch(() => {})
        .finally(() => {
          paint();   // a loan just changed who needs what
          painting = false;
        });
    });
    obs.observe(wrap, { childList: true, subtree: true });
  }

  /** Poll for an element to appear (the armory list renders async). */
  function waitForEl(selector, timeoutMs = 10000) {
    return new Promise(resolve => {
      const found = document.querySelector(selector);
      if (found) return resolve(found);
      const deadline = Date.now() + timeoutMs;
      const t = setInterval(() => {
        const el = document.querySelector(selector);
        if (el) { clearInterval(t); resolve(el); }
        else if (Date.now() > deadline) { clearInterval(t); resolve(null); }
      }, 250);
    });
  }

  /**
   * Act on a pending armory intent: either loan an item OUT, or take one BACK.
   *
   * The armory lists ONE ROW PER STOCK LINE, so a single item appears several times —
   * once as "Available", and once for every member holding one:
   *
   *   DSLR Camera x2   Tool   Available     [Give] [Loan]  Retrieve
   *   DSLR Camera x1   Tool   TheRealDoom   [Give]  Loan  [Retrieve]
   *
   * So matching on data-itemid alone finds the WRONG ROW half the time. That is
   * exactly what broke Retrieve: it took the first (Available) row and opened the
   * LOAN form pre-filled with the holder's name — which would have loaned them a
   * SECOND copy instead of taking back the one they already had.
   *
   * Torn's own template says which control a row supports:
   *   <a data-role="retrieve">  -> only on a row that IS loaned out
   *   <a data-role="loan">      -> only on a row that can be loaned
   * so each mode hunts for its own row AND its own control.
   */
  function initLoanAutofill() {
    if (!location.href.includes('factions.php')) return;
    if (!location.hash.includes('tab=armoury')) return;
    const intent = takeLoanIntent();
    if (!intent) return;
    execArmoryLoanIntent(intent);
  }

  /** Drive one give/retrieve on the armoury page. Extracted from
   *  initLoanAutofill (v4.9) so the quick-loan panel — which is already ON the
   *  page — can run the same flow without the stored-intent hop. */
  function execArmoryLoanIntent(intent) {
    const retrieving = intent.mode === 'retrieve';

    const deadline = Date.now() + 15000;
    const tick = setInterval(() => {
      const rows = [...document.querySelectorAll(`.img-wrap[data-itemid="${intent.itemId}"]`)]
        .map(w => w.closest('li')).filter(Boolean);
      if (!rows.length) {
        if (Date.now() > deadline) {
          clearInterval(tick);
          ocmToast(`Couldn't find ${intent.itemName} in the armory.`, 'warn');
        }
        return;
      }

      const holderOf = (row) => {
        const a = row.querySelector('.loaned a[href*="XID="]');
        return a ? (a.href.match(/XID=(\d+)/) || [])[1] : null;
      };

      let row = null;
      if (retrieving) {
        // ONLY the row this member is holding. Never any other.
        row = rows.find(r => holderOf(r) === String(intent.uid));
      } else {
        // A row with free stock (nobody holding it) that offers the Loan control.
        row = rows.find(r => !holderOf(r) && r.querySelector('a[data-role="loan"]'))
           || rows.find(r => !holderOf(r));
      }
      if (!row) {
        if (Date.now() > deadline) {
          clearInterval(tick);
          ocmToast(retrieving
            ? `${intent.memberName} no longer appears to be holding ${intent.itemName}.`
            : `No free ${intent.itemName} in the armory to loan.`, 'warn');
        }
        return;
      }
      clearInterval(tick);

      try {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.style.outline = '2px solid var(--ocm-cpr-good, #7c7)';
        row.style.outlineOffset = '2px';
        setTimeout(() => { row.style.outline = ''; }, 6000);
      } catch (_) {}

      if (retrieving) {
        const rBtn = row.querySelector('a[data-role="retrieve"]');
        if (!rBtn) {
          ocmToast('No Retrieve option on that row — take it back manually.', 'warn');
          return;
        }
        rBtn.click();
        ocmToast(`Retrieving ${intent.itemName} from ${intent.memberName}.`, 'ok');
        return;
      }

      // ── Give: open the loan form on THIS row and fill it in.
      const loanLink = row.querySelector('a[data-role="loan"]');
      if (!row.classList.contains('item-loan-act') && loanLink) loanLink.click();

      const formDeadline = Date.now() + 5000;
      const fillTick = setInterval(() => {
        const cont = row.querySelector('.loan-cont');
        const userInput = cont?.querySelector('input.ac-search[name="user"]');
        if (!cont || !userInput) {
          if (Date.now() > formDeadline) {
            clearInterval(fillTick);
            ocmToast("Loan form didn't open — fill it in manually.", 'warn');
          }
          return;
        }
        clearInterval(fillTick);
        const qty = String(intent.qty || 1);
        cont.querySelectorAll('input.quantity').forEach(q => setNativeValue(q, qty));
        setNativeValue(userInput, `${intent.memberName} [${intent.uid}]`);
        ocmToast(`Loan prefilled: ${intent.itemName} → ${intent.memberName}. Check it, then hit LOAN.`, 'ok');
      }, 150);
    }, 250);
  }

  /**
   * Render the 📦 Items tab: a loan worklist (members waiting on OC items) + an
   * OC item/cost tracker (every item OCs use, armory stock, shortfall, cost to cover).
   */
  /**
   * Combined Profit & Items tab. Replaces the old separate renderProfitSection /
   * renderItemsSection. Computes the profit-ledger side and the live armory item
   * side once, then lays everything out under six sub-tabs:
   *   Summary — net-profit KPIs (incl. unpaid cash) + By Scenario
   *   OCs Ran — per-OC list with expandable full breakdown (rewards, costs,
   *             participants, suggested split) and a per-OC Paid toggle
   *   Trends  — weekly + monthly rollups
   *   Items   — armory item/cost tracker + consumed/received breakdowns
   *   Loans   — loan worklist + returnable loans
   *   Members — per-member item intelligence: who needs a loan, who is holding
   *             an item their current role doesn't require
   * Sub-tab switching is pure show/hide; only profit controls trigger a recompute.
   */
  // ═══════════════════════════════════════════════════════════════════════════
  //  EXPORT BUILDER
  //
  //  The old Exports tab was a handful of fixed CSV buttons. This is a builder:
  //  pick WHAT to export and in WHAT format, and it assembles the file.
  //
  //  Datasets are declared once, as {columns, rows}. Every format then renders the
  //  same declarations, so adding a dataset makes it available in ALL formats and
  //  adding a format makes it work for ALL datasets — instead of writing a new
  //  button for every pairing.
  // ═══════════════════════════════════════════════════════════════════════════

  /** Number formatting for exports: raw values, so spreadsheets can do maths on them. */
  const rawMoney = (v) => Math.round(Number(v) || 0);

  /**
   * Build every available dataset from the finance data.
   * Each is a plain {label, columns, rows, note} — no formatting decisions here.
   */
  // ═══════════════════════════════════════════════════════════════════════════
  //  OC HISTORY BACKFILL
  //
  //  The live crimes call returns only the ~100 most recent OCs, so everything older
  //  simply doesn't exist as far as the dashboard is concerned — payouts, respect and
  //  success rates all silently start at that cutoff.
  //
  //  But /v2/faction/crimes accepts a TIME WINDOW:
  //      ?cat=completed&filter=executed_at&from=<unix>&to=<unix>&sort=DESC
  //  so we can walk backwards a window at a time and pull the whole history as
  //  structured data. That's far better than scraping the Completed page, which shows
  //  25 cards of prose narrative ("iSatomi hacked into the armor display…") and would
  //  break on any wording change.
  //
  //  Everything fetched is stored permanently, keyed by crime id, so it only has to be
  //  done once — after that the archive just grows as new OCs complete.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * MEMBER SHARE BY OC DIFFICULTY.
   *
   * A single global "member share" didn't match how factions actually pay: the split
   * usually scales with difficulty, because a level-1 crime isn't worth the faction
   * keeping a cut of. Defaults follow the common scheme:
   *      level 1-2 -> 100% to members
   *      level 3-4 ->  90%
   *      level 5+  ->  80%
   * Every level is individually editable in Config.
   *
   * IMPORTANT: this is only a FALLBACK. When Torn has recorded an actual payout
   * (rewards.payout.percentage), that real figure always wins — it's what was truly
   * paid, and no setting should be allowed to overwrite history. These tiers apply to
   * OCs that are not yet paid, or that predate Torn's payout records.
   */
  const DEFAULT_SHARE_BY_DIFF = { 1: 100, 2: 100, 3: 90, 4: 90, 5: 80, 6: 80, 7: 80, 8: 80, 9: 80, 10: 80 };

  function loadShareByDiff() {
    try {
      const saved = JSON.parse(GM_getValue(GMK.SHARE_BY_DIFF, 'null'));
      if (saved && typeof saved === 'object') return { ...DEFAULT_SHARE_BY_DIFF, ...saved };
    } catch (_) {}
    return { ...DEFAULT_SHARE_BY_DIFF };
  }

  /**
   * The share for a given difficulty. Unknown difficulty falls back to the highest
   * configured level rather than to 100% — assuming the most generous split for an
   * OC we can't identify would overstate what members are owed.
   */
  function shareForDifficulty(diff, table) {
    const t = table || loadShareByDiff();
    // Number(null) is 0, which would sail through isFinite and match level 1 — i.e.
    // an OC with no difficulty would be treated as 100% to members. Require a real level.
    const d = (diff === null || diff === undefined || diff === '') ? NaN : Number(diff);
    if (Number.isFinite(d) && d >= 1) {
      if (t[d] != null) return Number(t[d]);
      const levels = Object.keys(t).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
      if (levels.length) {
        // Above the top configured level -> use the top level's share ("5+" behaviour).
        if (d > levels[levels.length - 1]) return Number(t[levels[levels.length - 1]]);
        for (const l of levels) if (d <= l) return Number(t[l]);
      }
    }
    const vals = Object.values(t).map(Number).filter(Number.isFinite);
    return vals.length ? Math.min(...vals) : 100;
  }

  /**
   * Save the per-level shares and keep BOTH editors in step.
   *
   * The same setting is exposed in two places — Config, and the Money > OCs Ran panel.
   * Config lives in the shell (built once), while the OCs Ran panel is re-rendered on
   * every refresh, so without an explicit sync one of them would happily sit there
   * showing stale values and quietly disagreeing with the other.
   */
  function saveShareByDiff(table) {
    GM_setValue(GMK.SHARE_BY_DIFF, JSON.stringify(table));
    for (const inp of document.querySelectorAll('.ocm-share-lv, .ocm-cfg-share-lv')) {
      const v = table[inp.dataset.lv];
      if (v != null) inp.value = v;
    }
  }

  /** Read whichever editor was edited into a clean, clamped table. */
  function readShareInputs(selector) {
    const table = { ...loadShareByDiff() };
    for (const inp of document.querySelectorAll(selector)) {
      let v = Number(inp.value);
      if (!isFinite(v)) v = 100;
      table[inp.dataset.lv] = Math.max(0, Math.min(100, v));
    }
    return table;
  }

  function loadOcArchive() {
    try { return JSON.parse(GM_getValue(GMK.OC_ARCHIVE, '{}')) || {}; } catch (_) { return {}; }
  }
  function saveOcArchive(arc) {
    try { GM_setValue(GMK.OC_ARCHIVE, JSON.stringify(arc)); } catch (e) {
      ocmToast('Archive too large to save: ' + e.message, 'warn');
    }
  }

  /** Trim a crime to just what the dashboard uses — the raw payload is far too big to keep. */
  function slimCrime(oc) {
    const slots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || {});
    return {
      id: oc.id,
      name: oc.name,
      difficulty: oc.difficulty ?? null,
      status: oc.status ?? null,
      executed_at: oc.executed_at ?? null,
      rewards: {
        money: oc.rewards?.money ?? 0,
        respect: oc.rewards?.respect ?? 0,
        items: oc.rewards?.items ?? [],
        payout: oc.rewards?.payout
          ? { percentage: oc.rewards.payout.percentage ?? null,
              paid_at: oc.rewards.payout.paid_at ?? null,
              paid_by: oc.rewards.payout.paid_by ?? null }
          : null,
      },
      // Slots kept slim, but WITH the CPR — this is what feeds the long-term CPR archive.
      slots: slots.map(s => ({
        position: s.position_info?.label || s.position || null,
        user_id: s.user?.id ?? null,
        checkpoint_pass_rate: s.checkpoint_pass_rate ?? null,
        item_id: s.item_requirement?.id ?? null,
      })),
    };
  }

  /**
   * Page backwards through completed crimes and archive everything.
   *
   * Torn allows 100 API calls/minute per USER (not per key), and other scripts share
   * that budget, so this deliberately paces itself rather than racing. A faction with
   * two years of OCs is a couple of minutes of fetching — once, ever.
   */
  async function backfillOcHistory(apiKey, onProgress) {
    const arc = loadOcArchive();
    const WINDOW = 30 * 86400;          // 30 days per request
    const FLOOR  = 1738368000;          // Feb 2025 — OC 2.0 didn't exist before this
    const PACE   = 900;                 // ms between calls; ~66/min, well under the limit

    const RETRIES = 4;

    let to = Math.floor(Date.now() / 1000);
    let added = 0, calls = 0, emptyStreak = 0;
    const gaps = [];

    while (to > FLOOR && emptyStreak < 3) {
      const from = Math.max(FLOOR, to - WINDOW);

      // RETRY the window rather than skipping it. Skipping on a transient failure
      // (a rate limit, a blip) silently drops every OC in that month and leaves a
      // permanent hole in the history that nothing would ever tell you about.
      let batch = null, lastErr = null;
      for (let attempt = 1; attempt <= RETRIES && batch === null; attempt++) {
        try {
          const res = await apiFetch(
            `/faction/crimes?cat=completed&filter=executed_at&from=${from}&to=${to}&sort=DESC`, apiKey);
          batch = Array.isArray(res.crimes) ? res.crimes : Object.values(res.crimes || {});
          calls++;
        } catch (e) {
          lastErr = e;
          calls++;
          onProgress?.({ done: false, error: `${e.message} (retry ${attempt}/${RETRIES})`, added, calls });
          await new Promise(r => setTimeout(r, PACE * attempt * 2));   // back off
        }
      }

      if (batch === null) {
        // Genuinely couldn't fetch this window. Record the gap so it can be reported
        // honestly, rather than pretending the history is complete.
        gaps.push({ from, to, error: lastErr?.message });
        to = from;
        continue;
      }

      let newHere = 0;
      for (const oc of batch) {
        if (!oc?.id) continue;
        const key = String(oc.id);
        if (!arc[key]) newHere++;
        arc[key] = slimCrime(oc);        // refresh even if seen: payouts can land later
      }
      added += newHere;
      emptyStreak = batch.length === 0 ? emptyStreak + 1 : 0;

      onProgress?.({ done: false, added, calls, oldest: new Date(from * 1000), total: Object.keys(arc).length });
      to = from;
      if (to > FLOOR) await new Promise(r => setTimeout(r, PACE));
    }

    saveOcArchive(arc);
    GM_setValue(GMK.OC_ARCHIVE_META, JSON.stringify({
      at: Date.now(), total: Object.keys(arc).length, gaps: gaps.length,
    }));
    onProgress?.({ done: true, added, calls, total: Object.keys(arc).length, gaps });
    return arc;
  }

  function triggerDownload(filename, content, mime) {
    const blob = new Blob([content], { type: mime || 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function buildExportDatasets(ctx) {
    const { perOc, weekly, monthly, memberCutOf, factionCutOf, splitOf, dateStr } = ctx;
    const sets = {};

    const isPaid = (r) => (r.native ? r.native.paid : r.paid);

    // ── 1. Per-OC ledger — the raw record everything else derives from.
    sets.ocs = {
      label: 'OCs Ran (per-crime ledger)',
      note: 'One row per completed OC: rewards, costs, the split, and what each side got.',
      columns: ['Date', 'OC', 'Difficulty', 'Outcome', 'Crew', 'Cash', 'Item value', 'Gross',
                'Split %', 'To members', 'Per member', 'Item cost', 'Faction kept', 'Respect', 'Paid'],
      rows: perOc.slice().sort((a, b) => (b.executedAt || 0) - (a.executedAt || 0)).map(r => {
        const crew = Object.keys(r.participants || {}).length;
        const mem  = isPaid(r) ? memberCutOf(r) : 0;
        return [
          r.executedAt ? new Date(r.executedAt * 1000).toISOString().slice(0, 10) : '',
          r.name, r.difficulty ?? '', r.status ?? '', crew,
          rawMoney(r.money), rawMoney(r.itemValue), rawMoney((r.money || 0) + (r.itemValue || 0)),
          splitOf(r), rawMoney(mem), crew ? rawMoney(mem / crew) : 0,
          rawMoney(r.cost), rawMoney(factionCutOf(r)), Math.round(r.respect || 0),
          isPaid(r) ? 'yes' : 'no',
        ];
      }),
    };

    // ── 2. Member earnings — what each person actually received.
    const memRows = {};
    for (const r of perOc) {
      if (!isPaid(r) || !(r.money > 0)) continue;
      const ids = Object.keys(r.participants || {});
      if (!ids.length) continue;
      const each = memberCutOf(r) / ids.length;
      for (const uid of ids) {
        const m = memRows[uid] || (memRows[uid] = { uid, name: r.participants[uid], ocs: 0, earned: 0, respect: 0 });
        m.ocs++; m.earned += each; m.respect += (r.respect || 0) / ids.length;
      }
    }
    sets.members = {
      label: 'Member earnings',
      note: 'Total each member received across all PAID OCs, plus their share of respect.',
      columns: ['Member', 'User ID', 'OCs', 'Earned', 'Avg per OC', 'Respect'],
      rows: Object.values(memRows).sort((a, b) => b.earned - a.earned).map(m =>
        [m.name, m.uid, m.ocs, rawMoney(m.earned), rawMoney(m.earned / m.ocs), Math.round(m.respect)]),
    };

    // ── 3/4. Weekly + monthly — OCs ran, member vs faction earnings, respect.
    const periodCols = ['Period', 'OCs', 'Gross', 'To members', 'Item cost', 'Faction kept', 'Respect'];
    const periodRows = (bs) => bs.map(b =>
      [b.key, b.ocs, rawMoney(b.gross), rawMoney(b.toMembers), rawMoney(b.cost), rawMoney(b.kept), Math.round(b.respect)]);
    sets.weekly  = { label: 'Weekly summary',  note: 'OCs run per week, split between members and the faction.',  columns: periodCols, rows: periodRows(weekly) };
    sets.monthly = { label: 'Monthly summary', note: 'OCs run per month, split between members and the faction.', columns: periodCols, rows: periodRows(monthly) };

    // ── 5. By scenario — which crimes are actually worth running.
    const scen = {};
    for (const r of perOc) {
      const s = scen[r.name] || (scen[r.name] = { name: r.name, runs: 0, gross: 0, mem: 0, cost: 0, kept: 0, respect: 0 });
      const gross = (r.money || 0) + (r.itemValue || 0);
      const mem = isPaid(r) ? memberCutOf(r) : 0;
      s.runs++; s.gross += gross; s.mem += mem; s.cost += (r.cost || 0);
      s.kept += gross - mem - (r.cost || 0); s.respect += (r.respect || 0);
    }
    sets.scenarios = {
      label: 'By scenario',
      note: 'Per crime type. "Kept per run" is what ranks them — a big gross with a 90% split can keep less than a small one.',
      columns: ['Scenario', 'Runs', 'Gross', 'To members', 'Item cost', 'Faction kept', 'Kept per run', 'Respect', 'Respect per run'],
      rows: Object.values(scen).sort((a, b) => b.kept - a.kept).map(s =>
        [s.name, s.runs, rawMoney(s.gross), rawMoney(s.mem), rawMoney(s.cost), rawMoney(s.kept),
         rawMoney(s.kept / s.runs), Math.round(s.respect), Math.round(s.respect / s.runs)]),
    };

    // ── 6. Respect — tracked separately because it's the other currency.
    sets.respect = {
      label: 'Respect tracking',
      note: 'Respect per OC and per member. The reason to run hard crimes even when the cash is worse.',
      columns: ['Date', 'OC', 'Difficulty', 'Respect', 'Crew', 'Respect per member'],
      rows: perOc.filter(r => (r.respect || 0) > 0)
        .sort((a, b) => (b.executedAt || 0) - (a.executedAt || 0))
        .map(r => {
          const crew = Object.keys(r.participants || {}).length || 1;
          return [
            r.executedAt ? new Date(r.executedAt * 1000).toISOString().slice(0, 10) : '',
            r.name, r.difficulty ?? '', Math.round(r.respect || 0), crew, Math.round((r.respect || 0) / crew),
          ];
        }),
    };

    // ── 7–9. War layer (v4.1) — read straight from the persistent war stores.
    const isoDay = ts => ts ? new Date(ts * 1000).toISOString().slice(0, 10) : '';
    const warArc = loadWarArchive();
    const warLed = loadAttackLedger();
    const myFid  = String(GM_getValue(GMK.MY_FACTION_ID, '') || '');
    const warRows = [];
    for (const [wid, w] of Object.entries(warArc)) {
      const opp = (w.factions || []).find(f => String(f.id) !== myFid) || null;
      const obs = computeWarStats(warLed, w);
      const rep = w.report?.factions?.find(f => String(f.id) === myFid) || null;
      const uids = new Set([...(rep?.members || []).map(m => m.id), ...Object.keys(obs)]);
      for (const uid of uids) {
        const o = obs[uid] || {};
        const r = (rep?.members || []).find(m => m.id === uid) || null;
        warRows.push([
          wid, opp?.name ?? '', isoDay(w.start), isoDay(w.end),
          r?.name || o.name || uid, uid,
          r ? r.attacks : '', r ? r.score : '',
          o.warHits || 0, o.hits || 0, o.assists || 0, o.losses || 0,
          Math.round((o.respect || 0) * 10) / 10, Math.round((o.respectLost || 0) * 10) / 10,
          o.ffN ? (o.ffSum / o.ffN).toFixed(2) : '',
        ]);
      }
    }
    sets.wars = {
      label: 'War member stats',
      note: 'One row per member per ranked war. Official columns come from Torn\'s war report; Obs columns from the attack ledger.',
      columns: ['War ID', 'Opponent', 'Start', 'End', 'Member', 'User ID',
                'Official hits', 'Official score', 'Obs war hits', 'Obs all hits',
                'Assists', 'Losses', 'Respect gained', 'Respect lost', 'Avg FF'],
      rows: warRows,
    };

    sets.chains = {
      label: 'Chain history',
      note: 'Every tracked chain, with per-member rows where the chain report has been fetched.',
      columns: ['Chain ID', 'Start', 'End', 'Length', 'Respect', 'Member ID', 'Member hits', 'Member respect'],
      rows: Object.entries(loadChainArchive()).flatMap(([cid, c]) => {
        const base = [cid, isoDay(c.start), isoDay(c.end), c.length || 0, Math.round(c.respect || 0)];
        if (!c.report?.attackers?.length) return [[...base, '', '', '']];
        return c.report.attackers.map(a => [...base, a.id, a.attacks, Math.round(a.respect * 10) / 10]);
      }),
    };

    sets.attacks = {
      label: 'Attack ledger (raw)',
      note: 'Slimmed attack rows from the ledger (up to 5000 newest). Stealthed incoming attacks have no attacker.',
      columns: ['Date', 'Direction', 'Attacker', 'Attacker ID', 'Defender', 'Defender ID',
                'Result', 'Respect gain', 'Respect loss', 'Chain #', 'FF', 'War mod', 'Stealth'],
      rows: Object.values(warLed).sort((a, b) => b.ts - a.ts).slice(0, 5000).map(s => [
        s.ts ? new Date(s.ts * 1000).toISOString() : '', s.dir,
        s.an ?? (s.st ? '(stealth)' : ''), s.a ?? '', s.dn ?? '', s.d ?? '',
        s.res ?? '', s.rg, s.rl, s.ch || '', s.m?.ff ?? '', s.m?.war ?? '', s.st ? 'yes' : '',
      ]),
    };

    return sets;
  }

  // ─── FORMATTERS ────────────────────────────────────────────────────────────

  function exportCSV(sets, keys) {
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const out = [];
    for (const k of keys) {
      const s = sets[k];
      if (!s) continue;
      if (keys.length > 1) out.push(`"${s.label}"`);          // section header when combining
      out.push(s.columns.map(esc).join(','));
      out.push(...s.rows.map(r => r.map(esc).join(',')));
      if (keys.length > 1) out.push('');
    }
    return out.join('\n');
  }

  function exportJSON(sets, keys) {
    const out = {};
    for (const k of keys) {
      const s = sets[k];
      if (!s) continue;
      out[k] = { label: s.label, columns: s.columns, rows: s.rows };
    }
    return JSON.stringify({ generated: new Date().toISOString(), data: out }, null, 2);
  }

  /**
   * Discord: fixed-width code blocks, because Discord has no tables.
   * Discord hard-limits a message to 2000 chars, so long datasets are TRUNCATED with
   * an honest note rather than silently cut or posted as an unreadable wall.
   */
  function exportDiscord(sets, keys, opts = {}) {
    const money = (v) => {
      const n = Number(v) || 0;
      if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + 'b';
      if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'm';
      if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(0) + 'k';
      return String(n);
    };
    const isMoneyCol = (c) => /gross|earned|kept|members|cost|cash|value|avg|per (member|oc|run)/i.test(c);
    const blocks = [];
    for (const k of keys) {
      const s = sets[k];
      if (!s || !s.rows.length) continue;
      const limit = opts.maxRows || 15;
      const rows = s.rows.slice(0, limit);
      const cols = s.columns;
      const disp = rows.map(r => r.map((v, i) => isMoneyCol(cols[i]) ? money(v) : String(v ?? '')));
      const w = cols.map((c, i) => Math.max(c.length, ...disp.map(r => (r[i] || '').length)));
      const line = (cells) => cells.map((c, i) => (i === 0 ? String(c).padEnd(w[i]) : String(c).padStart(w[i]))).join('  ');
      const body = [line(cols), w.map(n => '─'.repeat(n)).join('  '), ...disp.map(line)].join('\n');
      let block = `**${s.label}**\n\`\`\`\n${body}\n\`\`\``;
      if (s.rows.length > limit) block += `\n_…${s.rows.length - limit} more rows — use CSV for the full set._`;
      blocks.push(block);
    }
    return blocks.join('\n\n');
  }

  /**
   * HTML report — a standalone page with charts, openable in a browser and shareable.
   * Charts are inline SVG built from the data: no external library, no network call,
   * so the file works offline and forever.
   */
  function exportHTML(sets, keys, meta = {}) {
    const money = (n) => {
      n = Number(n) || 0;
      const a = Math.abs(n);
      const s = a >= 1e9 ? '$' + (n / 1e9).toFixed(2) + 'b'
              : a >= 1e6 ? '$' + (n / 1e6).toFixed(2) + 'm'
              : a >= 1e3 ? '$' + (n / 1e3).toFixed(1) + 'k'
              : '$' + n;
      return s;
    };
    const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const isMoneyCol = (c) => /gross|earned|kept|members|cost|cash|value|avg|per (member|oc|run)/i.test(c);

    // Bar chart: faction kept vs paid to members, per period. Two series, so you can
    // see at a glance whether the faction is actually retaining anything.
    const chart = (buckets) => {
      if (!buckets || !buckets.length) return '';
      const b = buckets.slice(0, 12).reverse();
      const max = Math.max(...b.map(x => Math.max(x.kept, x.toMembers)), 1);
      const W = 760, H = 220, pad = 34, bw = (W - pad * 2) / b.length;
      const bars = b.map((x, i) => {
        const x0 = pad + i * bw;
        const hK = Math.max(0, (x.kept / max) * (H - pad * 2));
        const hM = Math.max(0, (x.toMembers / max) * (H - pad * 2));
        const w2 = (bw - 8) / 2;
        return `<rect x="${x0 + 2}" y="${H - pad - hM}" width="${w2}" height="${hM}" fill="#59a5d8"><title>${esc(x.key)} — to members ${money(x.toMembers)}</title></rect>
                <rect x="${x0 + 4 + w2}" y="${H - pad - hK}" width="${w2}" height="${hK}" fill="#7cba5c"><title>${esc(x.key)} — faction kept ${money(x.kept)}</title></rect>
                <text x="${x0 + bw / 2}" y="${H - pad + 13}" font-size="9" fill="#8a8a99" text-anchor="middle">${esc(x.key.replace('Wk of ', ''))}</text>`;
      }).join('');
      return `<div class="card"><h2>Members vs Faction, by period</h2>
        <svg viewBox="0 0 ${W} ${H}" width="100%" role="img">
          <line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="#333"/>
          ${bars}
        </svg>
        <p class="legend"><span class="sw" style="background:#59a5d8"></span> Paid to members
           <span class="sw" style="background:#7cba5c;margin-left:14px"></span> Faction kept</p></div>`;
    };

    const tables = keys.map(k => {
      const s = sets[k];
      if (!s) return '';
      return `<div class="card">
        <h2>${esc(s.label)}</h2>
        ${s.note ? `<p class="note">${esc(s.note)}</p>` : ''}
        <table>
          <thead><tr>${s.columns.map((c, i) => `<th${i ? ' class="num"' : ''}>${esc(c)}</th>`).join('')}</tr></thead>
          <tbody>${s.rows.map(r => `<tr>${r.map((v, i) => {
            if (i === 0) return `<td>${esc(v)}</td>`;
            const cls = isMoneyCol(s.columns[i]) ? 'num money' : 'num';
            const val = isMoneyCol(s.columns[i]) ? money(v) : esc(v);
            const neg = isMoneyCol(s.columns[i]) && Number(v) < 0 ? ' neg' : '';
            return `<td class="${cls}${neg}">${val}</td>`;
          }).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>`;
    }).join('');

    const k = meta.kpis || {};
    return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${esc(meta.faction || 'Faction')} — OC Report</title>
<style>
  body { background:#141414; color:#d0d0d0; font-family:-apple-system,Segoe UI,Roboto,sans-serif; margin:0; padding:28px; }
  h1 { font-size:20px; margin:0 0 4px; color:#e0e0e0; }
  .sub { color:#8a8a99; font-size:12px; margin-bottom:22px; }
  .card { background:#1e1e1e; border:1px solid #2e2e2e; border-radius:10px; padding:16px 18px; margin-bottom:16px; }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:.06em; color:#59a5d8; margin:0 0 10px; }
  .note { color:#8a8a99; font-size:11px; margin:0 0 10px; line-height:1.6; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th { text-align:left; font-size:9px; text-transform:uppercase; letter-spacing:.07em; color:#8a8a99; padding:6px 10px; border-bottom:1px solid #2a2e36; }
  th.num, td.num { text-align:right; font-variant-numeric:tabular-nums; }
  td { padding:8px 10px; border-bottom:1px solid #242424; color:#aaa; }
  td:first-child { color:#e0e0e0; font-weight:600; }
  td.money { color:#7cba5c; font-weight:600; }
  td.money.neg { color:#d75f5f; }
  tbody tr:hover td { background:#232323; }
  .kpis { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:16px; }
  .kpi { flex:1; min-width:150px; background:#1e1e1e; border:1px solid #2e2e2e; border-radius:8px; padding:12px 14px; }
  .kpi .l { font-size:9px; text-transform:uppercase; letter-spacing:.06em; color:#8a8a99; }
  .kpi .v { font-size:21px; font-weight:700; margin-top:2px; }
  .legend { font-size:10px; color:#8a8a99; margin:8px 0 0; }
  .sw { display:inline-block; width:9px; height:9px; border-radius:2px; vertical-align:middle; margin-right:4px; }
  footer { color:#848494; font-size:10px; margin-top:20px; }
</style></head><body>
<h1>${esc(meta.faction || 'Faction')} — Organised Crime Report</h1>
<div class="sub">Generated ${new Date().toLocaleString()} · ${esc(meta.range || 'all tracked OCs')}</div>
<div class="kpis">
  <div class="kpi"><div class="l">Gross produced</div><div class="v" style="color:#e0e0e0">${money(k.gross)}</div></div>
  <div class="kpi"><div class="l">Paid to members</div><div class="v" style="color:#59a5d8">${money(k.toMembers)}</div></div>
  <div class="kpi"><div class="l">Faction kept</div><div class="v" style="color:${(k.kept || 0) >= 0 ? '#7cba5c' : '#d75f5f'}">${money(k.kept)}</div></div>
  <div class="kpi"><div class="l">Respect</div><div class="v" style="color:#e8a33d">${Math.round(k.respect || 0).toLocaleString()}</div></div>
</div>
${chart(meta.weekly)}
${tables}
<footer>Generated by Torn OC Suite. "Faction kept" = gross − member payouts − consumed materials.</footer>
</body></html>`;
  }

  function renderFinanceSection(crimes, armory = {}, itemNames = {}, itemValues = {}, loanedOut = [], memberNames = {}) {
    // v3.17 split the old single #ocm-finance pane into separate Money and People
    // containers. Guard on one that actually exists — guarding on the deleted
    // #ocm-finance made this whole function return on line 2, silently emptying
    // every Money sub-tab and People > Loans/Item Status.
    if (!document.getElementById('ocm-money-summary')) return;

    // ── Merge the backfilled history in.
    // The live API only returns the ~100 most recent OCs. Anything archived by the
    // backfill is layered UNDERNEATH the live data — live wins on conflict, since a
    // payout may have landed since the archive row was written. Everything downstream
    // (per-OC ledger, payouts, member earnings, weekly buckets, exports, success rate)
    // then transparently covers the full history instead of the last ~100.
    const archived = loadOcArchive();
    if (Object.keys(archived).length) {
      const merged = {};
      for (const [id, oc] of Object.entries(archived)) merged[id] = oc;
      for (const [id, oc] of Object.entries(crimes)) merged[id] = oc;   // live overrides
      crimes = merged;
    }
    // Query root for the event wiring below. The rendered blocks now live in several
    // containers (Money panes + People panes), so scope to the dashboard root.
    const el = document.getElementById('ocm-root') || document;

    // (shared formatters hoisted to module level)
    /** Colour the loan deadline by urgency — inherited colour rendered black/unreadable. */
    const dueColor = ts => {
      if (!ts) return 'var(--ocm-text-muted)';
      const h = (ts * 1000 - Date.now()) / 3.6e6;
      if (h <= 0)  return 'var(--ocm-cpr-crit)';
      if (h < 12)  return 'var(--ocm-cpr-crit)';
      if (h < 48)  return 'var(--ocm-cpr-warn)';
      return 'var(--ocm-text-dim)';
    };
    const normName = raw => (raw || 'Unknown').trim().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/\s+[Vv]\d+$/, '').trim();
    const itemName = id => itemNames[String(id)] || `Item #${id}`;

    // ═══════════════ PROFIT SIDE ═══════════════
    const viewMode = GM_getValue(GMK.PROFIT_VIEW, 'window');
    let sinceTs = Number(GM_getValue(GMK.PROFIT_SINCE, -1));
    if (sinceTs === -1) { sinceTs = Math.floor(Date.now() / 1000); GM_setValue(GMK.PROFIT_SINCE, sinceTs); }
    sinceTs = sinceTs || 0;
    const payouts = loadPayouts();

    // ── THE SPLIT, in one place.
    // Torn's recorded payout percentage is the truth for OCs that have actually been
    // paid — no setting may overwrite what was really paid. The configured
    // per-difficulty tier only fills in for OCs Torn can't tell us about: not yet
    // paid, or older than Torn's payout records.
    const shareTable   = loadShareByDiff();
    const splitOf      = (r) => (r.native?.percentage != null
                                  ? r.native.percentage
                                  : shareForDifficulty(r.difficulty, shareTable));
    const memberCutOf  = (r) => (r.money || 0) * splitOf(r) / 100;
    const factionCutOf = (r) => (r.money || 0) - memberCutOf(r) + (r.itemValue || 0) - (r.cost || 0);
    const wasPaid      = (r) => (r.native ? r.native.paid : r.paid);

    const liveByid = {};
    for (const [id, oc] of Object.entries(crimes || {})) liveByid[String(oc?.id ?? id)] = oc;
    const participantsOf = oc => {
      const out = {};
      const slots = Array.isArray(oc?.slots) ? oc.slots : Object.values(oc?.slots || {});
      for (const s of slots) {
        // Live API slots carry user:{id,name}; ARCHIVED rows are slimmed to a
        // bare user_id (slimCrime). Reading only s.user.id gave every archived
        // OC an EMPTY crew — the Payouts KPI counted all of history while the
        // per-member tables only saw the live window ($23.8b vs $894m).
        const uid = s?.user?.id ?? s?.user_id;
        if (uid == null) continue;
        out[String(uid)] = resolveMemberName(uid, memberNames, s?.user?.name || warMemberName(uid));
      }
      return out;
    };
    let anyUnknownCost = false;
    const resolveCost = (r) => {
      if (typeof r.cost === 'number') return { cost: r.cost, costItems: r.costItems || {} };
      const live = liveByid[String(r.id)];
      if (live) return computeOcCost(live, itemValues);
      anyUnknownCost = true;
      return { cost: 0, costItems: {} };
    };
    const resolveParticipants = (r) => {
      if (r.participants && Object.keys(r.participants).length) return r.participants;
      const live = liveByid[String(r.id)];
      return live ? participantsOf(live) : {};
    };

    let records = [];
    if (viewMode === 'tracked') {
      const ledger = loadProfitLedger();
      records = Object.entries(ledger).map(([id, r]) => ({ id, ...r }));
    } else {
      for (const oc of Object.values(crimes)) {
        if (!oc || normOcStatus(oc.status) !== 'successful' || !oc.rewards) continue;
        const rewards = oc.rewards;
        const rwItems = rewards.items ? (Array.isArray(rewards.items) ? rewards.items : Object.values(rewards.items)) : [];
        let itemValue = 0; const items = {};
        for (const it of rwItems) {
          const iid = String(it?.id || it?.item_id || ''); const qty = Number(it?.quantity || it?.qty || 1);
          if (!iid) continue;
          items[iid] = (items[iid] || 0) + qty;
          itemValue += (Number(itemValues[iid]) || 0) * qty;
        }
        const { cost, costItems } = computeOcCost(oc, itemValues);
        records.push({ id: String(oc.id ?? ''), name: oc.name || 'Unknown', status: oc.status ?? null, difficulty: oc.difficulty ?? null, money: Number(rewards.money) || 0, itemValue, respect: Number(rewards.respect) || 0, executedAt: oc.executed_at ?? null, items, cost, costItems, participants: participantsOf(oc), payout: readNativePayout(oc) });
      }
    }
    const allCount = records.length;
    if (sinceTs > 0) records = records.filter(r => (r.executedAt || 0) >= sinceTs);

    const monthKey = ts => new Date(ts * 1000).toISOString().slice(0, 7);
    const monthLabel = ts => new Date(ts * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', timeZone: 'UTC' });
    const weekMonday = ts => { const d = new Date(ts * 1000); const dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow); d.setUTCHours(0, 0, 0, 0); return d; };
    const weekKey = ts => weekMonday(ts).toISOString().slice(0, 10);
    const weekLabel = ts => 'Wk of ' + weekMonday(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

    let totalMoney = 0, totalItemValue = 0, totalRespect = 0, totalCost = 0;
    let unpaidCash = 0, unpaidCount = 0, nativeSeen = 0;
    const byScenario = {}, byItemRecv = {}, byItemCost = {}, perOc = [], byWeek = {}, byMonth = {};
    let earliest = Infinity, latest = 0;
    for (const r of records) {
      const name = normName(r.name);
      const rev = r.money + r.itemValue;
      const { cost, costItems } = resolveCost(r);
      const net = rev - cost;
      const participants = resolveParticipants(r);
      // Torn's own payout record is the source of truth. Fall back to the manual
      // toggle only for OCs the API tells us nothing about (legacy ledger rows).
      const native = r.payout || (liveByid[String(r.id)] ? readNativePayout(liveByid[String(r.id)]) : null);
      if (native) nativeSeen++;
      const paid = native ? native.paid : !!payouts[String(r.id)]?.paid;
      if (!paid && r.money > 0) { unpaidCash += r.money; unpaidCount++; }
      totalMoney += r.money; totalItemValue += r.itemValue; totalRespect += r.respect; totalCost += cost;
      if (r.executedAt) { earliest = Math.min(earliest, r.executedAt); latest = Math.max(latest, r.executedAt); }
      if (!byScenario[name]) byScenario[name] = { runs: 0, money: 0, itemValue: 0, cost: 0 };
      byScenario[name].runs++; byScenario[name].money += r.money; byScenario[name].itemValue += r.itemValue; byScenario[name].cost += cost;
      for (const [iid, qty] of Object.entries(r.items || {})) {
        const unit = Number(itemValues[iid]) || 0;
        if (!byItemRecv[iid]) byItemRecv[iid] = { qty: 0, unit, total: 0 };
        byItemRecv[iid].qty += qty; byItemRecv[iid].total += unit * qty;
      }
      for (const [iid, ci] of Object.entries(costItems || {})) {
        const unit = Number(ci.unit) || Number(itemValues[iid]) || 0; const qty = Number(ci.qty) || 0;
        if (!byItemCost[iid]) byItemCost[iid] = { qty: 0, unit, total: 0 };
        byItemCost[iid].qty += qty; byItemCost[iid].total += unit * qty;
      }
      perOc.push({ id: r.id, name, revenue: rev, cost, net, executedAt: r.executedAt || 0,
                   status: r.status ?? null, difficulty: r.difficulty ?? null,
                   money: r.money, itemValue: r.itemValue, respect: r.respect,
                   items: r.items || {}, costItems, participants, paid, native });
      if (r.executedAt) {
        const wk = weekKey(r.executedAt), mo = monthKey(r.executedAt);
        if (!byWeek[wk])  byWeek[wk]  = { runs: 0, revenue: 0, cost: 0, label: weekLabel(r.executedAt),  ts: r.executedAt };
        if (!byMonth[mo]) byMonth[mo] = { runs: 0, revenue: 0, cost: 0, label: monthLabel(r.executedAt), ts: r.executedAt };
        byWeek[wk].runs++;  byWeek[wk].revenue += rev;  byWeek[wk].cost += cost;
        byMonth[mo].runs++; byMonth[mo].revenue += rev; byMonth[mo].cost += cost;
      }
    }
    const ocCount = records.length;
    const revenue = totalMoney + totalItemValue;
    const netProfit = revenue - totalCost;
    const days = (earliest !== Infinity && latest > earliest) ? Math.max(1, (latest - earliest) / 86400) : 1;
    const netPerDay = netProfit / days;

    // ═══════════════ ITEMS / LOANS / MEMBERS SIDE ═══════════════
    const { items: itemList, loans, summary } = analyseOcItems(crimes, armory, itemNames, itemValues, memberNames);
    const neededPairs = new Set();
    const memberRows = {};   // uid -> member item-intelligence row
    const ensureMember = (uid, name) => {
      if (!memberRows[uid]) memberRows[uid] = { uid, name: name || `#${uid}`, ocName: null, role: null, reqItemId: null, reqItemName: null, hasReq: null, holding: [] };
      if (name && !name.startsWith('#') && memberRows[uid].name.startsWith('#')) memberRows[uid].name = name;
      return memberRows[uid];
    };
    for (const [ocId, oc] of Object.entries(crimes || {})) {
      if (!oc || typeof oc !== 'object') continue;
      const status = (oc.status || '').toLowerCase();
      if (status !== 'recruiting' && status !== 'planning' && status !== 'ready') continue;
      const ocSlots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
      for (const slot of ocSlots) {
        const uid = slot.user?.id ? String(slot.user.id) : null;
        if (!uid) continue;
        const m = ensureMember(uid, resolveMemberName(uid, memberNames, slot.user?.name));
        m.ocName = oc.name || `OC #${ocId}`;
        m.role   = slot.position_info?.label || slot.position || '?';
        const req = slot.item_requirement;
        if (req?.id) {
          m.reqItemId   = String(req.id);
          m.reqItemName = itemName(req.id);
          m.hasReq      = req.is_available !== false;
          neededPairs.add(`${uid}|${req.id}`);
        }
      }
    }
    for (const l of (loanedOut || [])) {
      if (!l.itemId || !l.uid) continue;
      const m = ensureMember(String(l.uid), resolveMemberName(l.uid, memberNames, l.holderName));
      m.holding.push({
        itemId: String(l.itemId),
        itemName: l.itemName || itemName(l.itemId),
        needed: neededPairs.has(`${l.uid}|${l.itemId}`),
        value: Number(itemValues[String(l.itemId)]) || 0,
      });
    }
    const memberList = Object.values(memberRows).map(m => {
      const needsLoan = m.reqItemId != null && m.hasReq === false;
      const unneeded  = m.holding.filter(h => !h.needed);
      return { ...m, needsLoan, unneeded, flag: needsLoan ? 2 : (unneeded.length ? 1 : 0) };
    })
      // v5.0: a member whose role needs no item and who holds nothing on loan
      // has nothing to say here — listing them was pure noise.
      .filter(m => m.reqItemId != null || m.holding.length > 0)
      .sort((a, b) => b.flag - a.flag || a.name.localeCompare(b.name));
    const memberAttn = memberList.filter(m => m.flag > 0).length;
    // Items a member is holding that their CURRENT role doesn't require. If their OC
    // needs X and they're holding Y, Y is dead weight — pull it back so someone who
    // needs it can have it. We also carry what they DO need, so the row explains itself.
    const returnable = memberList.flatMap(m => m.unneeded.map(h => ({
      ...h,
      uid: m.uid,
      holderName: m.name,
      needsInstead: m.reqItemId ? { id: m.reqItemId, name: m.reqItemName, has: m.hasReq } : null,
      ocName: m.ocName,
      role: m.role,
    }))).sort((a, b) => b.value - a.value);

    // ═══════════════ CONTROLS ═══════════════
    const sinceDateStr = sinceTs > 0 ? new Date(sinceTs * 1000).toISOString().slice(0, 10) : '';
    const controls = `
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:10px;padding:8px 10px;background:var(--ocm-bg);border:1px solid var(--ocm-border-soft);border-radius:6px">
        <div style="display:flex;gap:4px;align-items:center">
          <span style="font-size:10px;color:var(--ocm-text-muted);text-transform:uppercase;letter-spacing:.5px">Profit view</span>
          <button class="ocm-profit-view-btn" data-view="window" style="font-size:11px;padding:3px 9px;border-radius:4px;cursor:pointer;border:1px solid ${viewMode==='window'?'var(--ocm-link)':'#3a3018'};background:${viewMode==='window'?'#14181e':'#1c1810'};color:${viewMode==='window'?'var(--ocm-link)':'#99a'}">API window</button>
          <button class="ocm-profit-view-btn" data-view="tracked" style="font-size:11px;padding:3px 9px;border-radius:4px;cursor:pointer;border:1px solid ${viewMode==='tracked'?'var(--ocm-link)':'#3a3018'};background:${viewMode==='tracked'?'#14181e':'#1c1810'};color:${viewMode==='tracked'?'var(--ocm-link)':'#99a'}">All-time (tracked)</button>
        </div>
        <div style="display:flex;gap:5px;align-items:center;margin-left:auto">
          <span style="font-size:10px;color:var(--ocm-text-muted);text-transform:uppercase;letter-spacing:.5px">Profit since</span>
          <input type="date" id="ocm-profit-since" value="${sinceDateStr}" style="background:#1c1810;border:1px solid #3a3018;border-radius:4px;color:var(--ocm-text);padding:3px 6px;font-size:11px" />
          <button id="ocm-profit-since-clear" style="font-size:11px;padding:3px 8px;border-radius:4px;cursor:pointer;border:1px solid #3a3018;background:#1c1810;color:var(--ocm-text-dim)">All dates</button>
        </div>
      </div>`;
    const viewNote = viewMode === 'tracked'
      ? `Tracked total accumulates every completed OC this script has seen since you started running v3.5.1+ (survives past the API's ~100-OC cap). ${allCount} OC${allCount!==1?'s':''} recorded${sinceTs>0?` · ${ocCount} after cutoff`:''}.`
      : `Live API window — the ~100 most recent completed OCs Torn returns. Includes OCs run before you took over the faction.${sinceTs>0?` Showing ${ocCount} of ${allCount} after cutoff.`:''}`;

    // ═══════════════ SUB-PANES ═══════════════
    const rollupTable = (obj, title) => {
      const rows = Object.entries(obj).sort((a, b) => b[1].ts - a[1].ts).map(([, v]) => {
        const net = v.revenue - v.cost;
        return `<tr>
          <td style="white-space:nowrap">${esc(v.label)}</td>
          <td class="td-right">${v.runs}</td>
          <td class="td-right" style="color:var(--ocm-text-dim)">${fmtMoney(v.revenue)}</td>
          <td class="td-right" style="color:var(--ocm-cpr-crit)">${negCost(v.cost)}</td>
          <td class="td-right" style="color:${netColor(net)};font-weight:bold">${fmtMoney(net)}</td>
        </tr>`;
      }).join('');
      if (!rows) return '';
      return `
        <div class="ocm-section-title" style="margin-top:12px">${title}</div>
        <table class="ocm-analytics-table" style="table-layout:fixed;width:100%">
          <thead><tr><th style="width:auto">Period</th><th class="td-right" style="width:48px">OCs</th>
            <th class="td-right" style="width:80px">Revenue</th><th class="td-right" style="width:72px">Cost</th>
            <th class="td-right" style="width:82px">Net</th></tr></thead>
          <tbody>${rows}</tbody></table>`;
    };

    // — The old Summary pane is GONE (v5.0.2). Its headline "Net Profit" was
    //   the ambiguous whole-pie number the money model forbids, and its By
    //   Scenario duplicated Faction Earnings' with worse columns. The Overview
    //   pane (built below with the honest members/faction split) now owns
    //   ocm-money-summary.

    // — Payout matching (used by both the OCs Ran list and the Payouts pane).
    //   Torn's funds log doesn't record which OC a give was for, so gives are
    //   matched back to per-member OC claims by recipient + amount + timing.
    const payEvents = loadPayoutEvents();
    const newsStatus = String(GM_getValue(GMK.PAYOUT_NEWS_STATUS, ''));
    // Claims use the same per-OC split as the ledger (Torn's recorded % if
    // present, else the per-level setting) — a flat share made expected amounts
    // wrong whenever splits differ by level, and matching quietly failed.
    const match = matchPayouts(perOc, payEvents, splitOf);
    const matchByOc = match.byOc;

    // — OCs Ran pane (expandable rows + paid toggles + share config)
    let ocsPane;
    if (ocCount === 0) {
      ocsPane = '<div style="color:var(--ocm-text-dim);font-size:12px;padding:14px">No completed OCs in this view.</div>';
    } else {
      perOc.sort((a, b) => b.executedAt - a.executedAt);
      /** Paid indicator: manual ✓, log-inferred 🔎, owed •, or n/a. */
      const paidCell = (r) => {
        if (!(r.money > 0)) return { icon: '<span style="color:var(--ocm-text-muted)">—</span>', title: 'No cash reward' };
        if (r.paid) return { icon: '<span style="color:var(--ocm-cpr-good)">✓</span>', title: 'Marked paid' };
        const m = matchByOc[String(r.id)];
        if (m?.full) return { icon: '<span style="color:var(--ocm-link)">🔎</span>', title: `Looks paid — every member matched a give in the funds log (${m.confidence}). Confirm in the Payouts tab.` };
        if (m?.matched) return { icon: '<span style="color:var(--ocm-cpr-warn)">◐</span>', title: `Partly paid — ${m.matched}/${m.total} members matched a give in the funds log` };
        return { icon: '<span style="color:var(--ocm-cpr-warn)">•</span>', title: 'Not marked paid, no matching gives found' };
      };
      const detailHtml = (r) => {
        const pNames = Object.values(r.participants);
        const pCount = pNames.length;
        const pct = splitOf(r);
        const pctSrc = r.native?.percentage != null
          ? `Torn's recorded payout: ${pct}%`
          : `${pct}% — your setting for a level ${r.difficulty ?? '?'} OC (not paid out yet)`;
        const perHead = (r.money > 0 && pCount > 0) ? (r.money * pct / 100) / pCount : 0;
        const rewardLines = Object.entries(r.items).map(([iid, qty]) => {
          const unit = Number(itemValues[iid]) || 0;
          return `<div>· <a href="${marketUrlOf(iid)}" target="_blank" style="color:var(--ocm-link);text-decoration:none">${esc(itemName(iid))}</a> ×${qty}${unit?` <span style="color:var(--ocm-text-muted)">@ ${fmtMoney(unit)} = ${fmtMoney(unit*qty)}</span>`:''}</div>`;
        }).join('') || '<div style="color:var(--ocm-text-muted)">none</div>';
        const costLines = Object.entries(r.costItems).map(([iid, ci]) => {
          const unit = Number(ci.unit) || Number(itemValues[iid]) || 0;
          return `<div>· <a href="${marketUrlOf(iid)}" target="_blank" style="color:var(--ocm-link);text-decoration:none">${esc(itemName(iid))}</a> ×${ci.qty}${unit?` <span style="color:var(--ocm-text-muted)">@ ${fmtMoney(unit)} = ${fmtMoney(unit*ci.qty)}</span>`:''}</div>`;
        }).join('') || '<div style="color:var(--ocm-text-muted)">none (no consumed materials)</div>';
        return `
          <div style="display:flex;gap:18px;flex-wrap:wrap;padding:10px 12px;background:var(--ocm-bg);border-radius:6px;font-size:11px;line-height:1.6">
            <div style="flex:1;min-width:180px">
              <div style="font-size:9px;color:var(--ocm-text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">Rewards</div>
              <div>Cash: <b style="color:var(--ocm-cpr-good)">${fmtMoney(r.money)}</b> · Respect: <b style="color:var(--ocm-link)">${r.respect.toLocaleString()}</b></div>
              ${rewardLines}
            </div>
            <div style="flex:1;min-width:180px">
              <div style="font-size:9px;color:var(--ocm-text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">Consumed materials</div>
              ${costLines}
              <div style="margin-top:2px">Total cost: <b style="color:var(--ocm-cpr-crit)">${negCost(r.cost)}</b></div>
            </div>
            <div style="flex:1;min-width:200px">
              <div style="font-size:9px;color:var(--ocm-text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">Crew ${pCount?`(${pCount})`:''} &amp; payout</div>
              <div>${pCount ? Object.entries(r.participants).map(([uid, nm]) => {
                  const cl = match.claims.find(c => c.ocId === String(r.id) && c.uid === String(uid));
                  if (!cl) return esc(nm);
                  return cl.matched
                    ? `<span style="color:var(--ocm-cpr-good)" title="Matched a ${fmtMoney(cl.matched.amount)} give on ${dateStr(cl.matched.ts)}${cl.matched.mode==='lump'?' (lump sum covering '+cl.matched.covers+' OCs)':''}">${esc(nm)} ✓</span>`
                    : `<span style="color:var(--ocm-cpr-warn)" title="No matching give found — owed ${fmtMoney(cl.expected)}">${esc(nm)} •</span>`;
                }).join(', ') : '<span style="color:var(--ocm-text-muted)">unknown — recorded before v3.12 and out of API window</span>'}</div>
              ${perHead > 0 ? `<div style="margin-top:2px">Suggested split: <b>${fmtMoney(perHead)}</b> each <span style="color:var(--ocm-text-muted)">(${pCount} × ${pct}% of cash)</span></div>` : ''}
              ${r.native
                ? `<div style="margin-top:6px;font-size:11px;color:${r.native.paid?'var(--ocm-cpr-good)':'var(--ocm-cpr-warn)'}" title="From Torn's own OC payout record — not editable here.">${r.native.paid
                    ? `✓ Paid ${dateStr(r.native.at)}${r.native.percentage!=null?` · ${r.native.percentage}% to members`:''}`
                    : '⏳ Awaiting payout — handle it on the OC page'}</div>`
                : `<button class="ocm-paid-btn" data-oc="${esc(String(r.id))}" style="margin-top:6px;font-size:11px;padding:3px 10px;border-radius:4px;cursor:pointer;border:1px solid ${r.paid?'var(--ocm-cpr-good)':'#3a3018'};background:${r.paid?'#12200f':'#1c1810'};color:${r.paid?'var(--ocm-cpr-good)':'var(--ocm-cpr-warn)'}">${r.paid?'✓ Paid — click to unmark':'Mark paid'}</button>`}
            </div>
          </div>`;
      };
      const rows = perOc.map(r => `<tr class="ocm-fin-ocrow" data-oc="${esc(String(r.id))}" style="cursor:pointer">
          <td style="color:var(--ocm-text-muted);white-space:nowrap">${dateStr(r.executedAt)}</td>
          <td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.name)} — click for full breakdown">▸ ${esc(r.name)}</td>
          <td class="td-right" style="color:var(--ocm-text-dim)">${fmtMoney(r.revenue)}</td>
          <td class="td-right" style="color:var(--ocm-cpr-crit)">${negCost(r.cost)}</td>
          <td class="td-right" style="color:${netColor(r.net)};font-weight:bold">${fmtMoney(r.net)}</td>
          <td style="text-align:center" title="${paidCell(r).title}">${paidCell(r).icon}</td>
        </tr>
        <tr class="ocm-fin-detail" data-oc="${esc(String(r.id))}" style="display:none"><td colspan="6" style="padding:4px 6px 10px">${detailHtml(r)}</td></tr>`).join('');
      ocsPane = `
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px">
          <div class="ocm-section-title" style="margin:0">OCs Ran (${perOc.length})</div>
          <div style="margin-left:auto">
            <button id="ocm-share-toggle" class="ocm-join-btn" style="padding:4px 10px;font-size:11px"
              title="Set the member share for each OC difficulty level">⚖ Member share by level</button>
          </div>
        </div>
        <div id="ocm-share-panel" style="display:none;border:1px solid var(--ocm-border-soft);border-radius:6px;padding:10px 12px;margin-bottom:10px;background:var(--ocm-bg-card)">
          <div style="font-size:11px;color:var(--ocm-text-muted);line-height:1.6;margin-bottom:8px">
            The cut members get, per OC level. Used to work out earnings for OCs that
            <b>haven't been paid yet</b> — for anything Torn has actually paid out, the real recorded
            percentage always wins, because that's what genuinely happened.
            <br>Level 10 also covers anything higher, so "5+" just means levels 5–10 share a value.
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-end">
            ${[1,2,3,4,5,6,7,8,9,10].map(lv => `
              <div style="text-align:center">
                <div style="font-size:9px;color:var(--ocm-text-faint);text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px">Lv ${lv}</div>
                <input type="number" class="ocm-share-lv" data-lv="${lv}" min="0" max="100" step="5"
                  value="${shareTable[lv] ?? 100}"
                  style="width:46px;background:var(--ocm-bg);border:1px solid var(--ocm-border);border-radius:4px;color:var(--ocm-text);padding:4px;font-size:11px;text-align:center" />
              </div>`).join('')}
            <button id="ocm-share-save" class="ocm-join-btn" style="padding:5px 12px;margin-left:6px">Save</button>
            <button id="ocm-share-reset" class="ocm-join-btn" style="padding:5px 10px;background:none;border-color:var(--ocm-border);color:var(--ocm-text-muted)"
              title="Back to 100/100/90/90/80…">Reset</button>
            <span id="ocm-share-msg" style="font-size:11px;color:var(--ocm-cpr-good);margin-left:4px"></span>
          </div>
        </div>
        <div style="font-size:10px;color:var(--ocm-text-muted);margin-bottom:6px">Click a row for the full breakdown — rewards, consumed materials, crew, suggested split, and the Paid toggle. Paid ✓/• column tracks which cash payouts you've distributed.</div>
        <div style="max-height:460px;overflow-y:auto;border:1px solid var(--ocm-border-soft);border-radius:6px">
          <table class="ocm-analytics-table" style="table-layout:fixed;width:100%;margin:0">
            <thead><tr><th style="width:56px">Date</th><th style="width:auto">OC</th>
              <th class="td-right" style="width:76px">Revenue</th><th class="td-right" style="width:70px">Cost</th>
              <th class="td-right" style="width:78px">Net</th><th style="width:38px;text-align:center">Paid</th></tr></thead>
            <tbody>${rows}</tbody></table></div>`;
    }

    // — Trends pane
    const weeklyTable = rollupTable(byWeek, 'Weekly');
    const monthlyTable = rollupTable(byMonth, 'Monthly');
    const trendsPane = (weeklyTable || monthlyTable) ? (weeklyTable + monthlyTable)
      : '<div style="color:var(--ocm-text-dim);font-size:12px;padding:14px">No dated OCs to build trends from yet.</div>';

    // — Items pane
    const itemsKpis = `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:4px">`
      + kpiTile('Loans to give', summary.loanCount, 'members waiting', summary.loanCount>0?'var(--ocm-cpr-warn)':'var(--ocm-cpr-good)')
      + kpiTile('Armory gaps', summary.armoryGaps, 'items short', summary.armoryGaps>0?'var(--ocm-cpr-crit)':'var(--ocm-cpr-good)')
      + kpiTile('Cost to cover gaps', fmtMoney(summary.coverCost), `${summary.totalShortfall} item${summary.totalShortfall===1?'':'s'} to buy`)
      + kpiTile('Distinct items', summary.distinctItems, 'used across OCs', 'var(--ocm-link)')
      + `</div>`;
    let trackerTable;
    if (itemList.length === 0) {
      trackerTable = '<div style="color:var(--ocm-text-dim);font-size:12px;padding:10px 2px">No active OCs require items right now.</div>';
    } else {
      const itemRows = itemList.map(it => {
        const shortCls = it.shortfall > 0 ? 'var(--ocm-cpr-crit)' : 'var(--ocm-cpr-good)';
        const heldCls  = it.held === 0 && it.needed > 0 ? 'var(--ocm-cpr-crit)' : 'var(--ocm-text-card)';
        return `<tr>
          <td style="padding:6px 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(it.name)}">
            <a href="${marketUrlOf(it.id)}" target="_blank" style="color:var(--ocm-link);text-decoration:none">${esc(it.name)}</a> ${it.isTool?'🔧':'📦'}</td>
          <td style="padding:6px 8px;text-align:right;color:${heldCls}">${it.held}</td>
          <td style="padding:6px 8px;text-align:right;color:var(--ocm-text-dim)" title="${it.filledMissing} loan(s) + ${it.openNeed} open slot(s)">${it.needed}</td>
          <td style="padding:6px 8px;text-align:right;color:${shortCls};font-weight:bold">${it.shortfall || '—'}</td>
          <td style="padding:6px 8px;text-align:right;color:var(--ocm-text-muted)">${it.unitValue ? fmtMoney(it.unitValue) : '—'}</td>
          <td style="padding:6px 8px;text-align:right;color:${it.coverCost?'var(--ocm-cpr-warn)':'var(--ocm-text-muted)'}">${it.coverCost ? fmtMoney(it.coverCost) : '—'}</td>
        </tr>`;
      }).join('');
      trackerTable = `
        <div class="ocm-section-title" style="margin-top:2px">📊 OC Item &amp; Cost Tracker</div>
        <div style="font-size:10px;color:var(--ocm-text-muted);margin-bottom:6px;line-height:1.5">
          Held = in armory · Need = loans + open slots · Short = must source · Cover = shortfall × market price. 🔧 tool (reusable) · 📦 material (consumed).</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed">
          <thead><tr style="color:var(--ocm-text-muted);font-size:9px;text-transform:uppercase;text-align:right">
            <th style="padding:4px 8px;text-align:left;width:auto">Item</th><th style="padding:4px 8px;width:54px">Held</th>
            <th style="padding:4px 8px;width:54px">Need</th><th style="padding:4px 8px;width:54px">Short</th>
            <th style="padding:4px 8px;width:74px">Unit</th><th style="padding:4px 8px;width:80px">Cover</th></tr></thead>
          <tbody>${itemRows}</tbody></table>`;
    }
    const costRows = Object.entries(byItemCost).map(([id, it]) => ({ id, name: itemName(id), ...it })).sort((a, b) => b.total - a.total);
    const costTable = costRows.length === 0 ? '' : `
      <div class="ocm-section-title" style="margin-top:14px">Items Consumed (cost)</div>
      <table class="ocm-analytics-table" style="table-layout:fixed;width:100%">
        <thead><tr><th style="width:auto">Item</th><th class="td-right" style="width:60px">Qty</th>
          <th class="td-right" style="width:90px">Unit Price</th><th class="td-right" style="width:90px">Total Cost</th></tr></thead>
        <tbody>${costRows.map(r => `<tr>
          <td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.name)}">
            <a href="${marketUrlOf(r.id)}" target="_blank" style="color:var(--ocm-link);text-decoration:none">${esc(r.name)}</a></td>
          <td class="td-right">${r.qty.toLocaleString()}</td>
          <td class="td-right" style="color:var(--ocm-text-dim)">${fmtMoney(r.unit)}</td>
          <td class="td-right" style="color:var(--ocm-cpr-crit);font-weight:bold">${fmtMoney(r.total)}</td>
        </tr>`).join('')}</tbody></table>`;
    const recvRows = Object.entries(byItemRecv).map(([id, it]) => ({ id, name: itemName(id), ...it })).sort((a, b) => b.total - a.total);
    const recvTable = recvRows.length === 0 ? '' : `
      <div class="ocm-section-title" style="margin-top:14px">Items Received (reward)</div>
      <table class="ocm-analytics-table" style="table-layout:fixed;width:100%">
        <thead><tr><th style="width:auto">Item</th><th class="td-right" style="width:60px">Qty</th>
          <th class="td-right" style="width:90px">Unit Value</th><th class="td-right" style="width:90px">Total Value</th></tr></thead>
        <tbody>${recvRows.map(r => `<tr>
          <td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.name)}">
            <a href="${marketUrlOf(r.id)}" target="_blank" style="color:var(--ocm-link);text-decoration:none">${esc(r.name)}</a></td>
          <td class="td-right">${r.qty.toLocaleString()}</td>
          <td class="td-right" style="color:var(--ocm-text-dim)">${fmtMoney(r.unit)}</td>
          <td class="td-right" style="color:var(--ocm-cpr-warn);font-weight:bold">${fmtMoney(r.total)}</td>
        </tr>`).join('')}</tbody></table>`;
    const itemsPane = itemsKpis + trackerTable + costTable + recvTable
      + '<div style="font-size:10px;color:var(--ocm-text-muted);margin-top:12px;line-height:1.5">Item values are current market estimates. The tracker reflects items needed by active OCs right now; Consumed/Received reflect your profit view above.</div>';

    // — Loans pane
    let loanPanel;
    if (loans.length === 0) {
      loanPanel = `<div class="ocm-section-title" style="margin-top:2px">🤝 Loans to Hand Out</div>
        <div style="color:var(--ocm-cpr-good);font-size:12px;padding:8px 2px">✓ No pending loans — every filled slot has its item.</div>`;
    } else {
      const rows = loans.map(l => {
        const stock = l.inArmory
          ? `<span style="color:var(--ocm-cpr-good)" title="In armory — ready to loan">🏛 in armory</span>`
          : `<span style="color:var(--ocm-cpr-crit)" title="Not in armory — must be sourced first">✗ not stocked</span>`;
        return `<tr style="${l.inArmory ? '' : 'opacity:.7'}">
          <td style="padding:6px 8px"><a href="/profiles.php?XID=${l.uid}" target="_blank" style="color:var(--ocm-link);text-decoration:none">${esc(l.name)}</a></td>
          <td style="padding:6px 8px"><a href="${marketUrlOf(l.itemId)}" target="_blank" style="color:var(--ocm-text-card);text-decoration:none" title="Open item market for ${esc(l.itemName)}">${esc(l.itemName)} ${l.isTool?'🔧':'📦'}</a></td>
          <td style="padding:6px 8px;color:var(--ocm-text-dim)" title="${esc(l.ocName)} · ${esc(l.role)}">${esc(l.ocName)}</td>
          <td style="padding:6px 8px;text-align:center;font-size:11px;color:${dueColor(l.readyAt)};white-space:nowrap">${fmtEta(l.readyAt)}</td>
          <td style="padding:6px 8px;font-size:11px">${stock}</td>
          <td style="padding:6px 8px;text-align:right">${l.inArmory
            ? `<a href="${armoryGiveUrl(OCM_ARMOURY_CATS[String(l.itemId)])}" target="_blank" class="ocm-loan-btn ocm-loan-go" data-item="${esc(String(l.itemId))}" data-itemname="${esc(l.itemName)}" data-uid="${esc(String(l.uid))}" data-member="${esc(l.name)}" title="Opens the faction armory and fills the loan form: ${esc(l.itemName)} → ${esc(l.name)}. Torn's API can't loan for you, so check it and press LOAN.">Give ▸</a>`
            : `<a href="${marketUrlOf(l.itemId)}" target="_blank" class="ocm-buy-btn" title="The armory has no ${esc(l.itemName)}, so there's nothing to loan — opens the item market to buy one first. Once it's in the armory this becomes a Give button.">Buy ▸</a>`
          }</td>
        </tr>`;
      }).join('');
      loanPanel = `
        <div class="ocm-section-title" style="margin-top:2px">🤝 Loans to Hand Out (${loans.length})</div>
        <div style="font-size:10px;color:var(--ocm-text-muted);margin-bottom:6px;line-height:1.5">Sorted by deadline. <b style="color:var(--ocm-cpr-good)">Give ▸</b> opens the armory with the loan form already filled in — check it and press LOAN (Torn's API can't loan for you). <b style="color:var(--ocm-link)">Buy ▸</b> means the armory has none of that item, so there's nothing to loan yet — it opens the item market to source one first.</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="color:var(--ocm-text-muted);font-size:9px;text-transform:uppercase;text-align:left">
            <th style="padding:4px 8px">Member</th><th style="padding:4px 8px">Item</th><th style="padding:4px 8px">OC</th>
            <th style="padding:4px 8px;text-align:center">Due</th><th style="padding:4px 8px">Armory</th><th style="padding:4px 8px;text-align:right">Loan</th></tr></thead>
          <tbody>${rows}</tbody></table>`;
    }
    let returnPanel = '';
    if (returnable.length > 0) {
      const totalVal = returnable.reduce((s, r) => s + (r.value || 0), 0);
      const rrows = returnable.map(r => {
        // Why is it retrievable? Either they're in an OC needing a DIFFERENT item,
        // or they're not in an active OC at all.
        let why;
        if (r.ocName && r.needsInstead) {
          why = `<span style="color:var(--ocm-text-dim)">In <b>${esc(r.ocName)}</b> as ${esc(r.role || '?')} — needs <b style="color:${r.needsInstead.has ? 'var(--ocm-cpr-good)' : 'var(--ocm-cpr-warn)'}">${esc(r.needsInstead.name)}</b>${r.needsInstead.has ? '' : ' (missing)'}, not this</span>`;
        } else if (r.ocName) {
          why = `<span style="color:var(--ocm-text-dim)">In <b>${esc(r.ocName)}</b> as ${esc(r.role || '?')} — that role needs no item</span>`;
        } else {
          why = `<span style="color:var(--ocm-text-muted)">Not in an active OC</span>`;
        }
        return `<tr>
          <td style="padding:7px 8px"><a href="/profiles.php?XID=${r.uid}" target="_blank" style="color:var(--ocm-link);text-decoration:none;font-weight:600">${esc(r.holderName)}</a></td>
          <td style="padding:7px 8px"><a href="${marketUrlOf(r.itemId)}" target="_blank" style="color:var(--ocm-text-card);text-decoration:none">${esc(r.itemName)}</a></td>
          <td style="padding:7px 8px;font-size:11px">${why}</td>
          <td style="padding:7px 8px;text-align:right;color:var(--ocm-text-muted)">${r.value ? fmtMoney(r.value) : '—'}</td>
          <td style="padding:7px 8px;text-align:right"><a href="${armoryGiveUrl(OCM_ARMOURY_CATS[String(r.itemId)])}" target="_blank" class="ocm-return-btn ocm-loan-go" data-mode="retrieve" data-item="${esc(String(r.itemId))}" data-itemname="${esc(r.itemName)}" data-uid="${esc(String(r.uid))}" data-member="${esc(r.holderName)}" title="Opens the armory at ${esc(r.itemName)} so you can retrieve it from ${esc(r.holderName)}.">Retrieve ▸</a></td>
        </tr>`;
      }).join('');
      returnPanel = `
        <div class="ocm-section-title ocm-mt">♻ Retrievable — Held but Not Needed (${returnable.length})</div>
        <div class="ocm-note">
          These members are holding a faction item their current OC role doesn't require — worth <b style="color:var(--ocm-text-dim)">${fmtMoney(totalVal)}</b> sitting idle.
          Pulling them back frees stock for whoever actually needs it. Be considerate: they may be using it outside OCs.</div>
        <table class="ocm-pay-table">
          <thead><tr>
            <th style="width:110px">Holder</th><th style="width:130px">Holding</th>
            <th style="width:auto">Why it's not needed</th>
            <th style="width:80px;text-align:right">Value</th>
            <th style="width:90px;text-align:right">Action</th></tr></thead>
          <tbody>${rrows}</tbody></table>`;
    } else if ((loanedOut || []).length > 0) {
      returnPanel = `<div class="ocm-section-title ocm-mt">♻ Retrievable — Held but Not Needed</div>
        <div style="color:var(--ocm-cpr-good);font-size:12px;padding:8px 2px">✓ Every loaned item is still needed by its holder's current OC role.</div>`;
    }

    const loansPane = loanPanel + returnPanel;

    // — Members pane (per-member item intelligence)
    let membersPane;
    if (memberList.length === 0) {
      membersPane = '<div style="color:var(--ocm-text-dim);font-size:12px;padding:14px">No members in active OCs with item requirements, and no faction items out on loan.</div>';
    } else {
      const flagBadge = m => m.needsLoan
        ? '<span style="color:var(--ocm-cpr-crit);font-weight:bold">Needs loan</span>'
        : m.unneeded.length
          ? '<span style="color:var(--ocm-cpr-warn);font-weight:bold">Holds unneeded</span>'
          : '<span style="color:var(--ocm-cpr-good)">OK</span>';
      const mrows = memberList.map(m => {
        const reqCell = m.reqItemId
          ? `<a href="${marketUrlOf(m.reqItemId)}" target="_blank" style="color:var(--ocm-text-card);text-decoration:none">${esc(m.reqItemName)}</a> ${m.hasReq?'<span style="color:var(--ocm-cpr-good)" title="Has the item">✓</span>':'<span style="color:var(--ocm-cpr-crit)" title="Missing — needs a loan">✗</span>'}`
          : '<span style="color:var(--ocm-text-muted)">—</span>';
        const holdCell = m.holding.length
          ? m.holding.map(h => `<span title="${h.needed?'Needed for their current role':'NOT needed for their current role — retrievable'}" style="color:${h.needed?'var(--ocm-text-dim)':'var(--ocm-cpr-warn)'}">${esc(h.itemName)}${h.needed?'':' ⚠'}</span>`).join(', ')
          : '<span style="color:var(--ocm-text-muted)">—</span>';
        return `<tr>
          <td style="padding:6px 8px"><a href="/profiles.php?XID=${m.uid}" target="_blank" style="color:var(--ocm-link);text-decoration:none">${esc(m.name)}</a></td>
          <td style="padding:6px 8px;color:var(--ocm-text-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(m.ocName || '')}${m.role?' · '+esc(m.role):''}">${m.ocName ? esc(m.ocName) + (m.role?` · <span style="color:var(--ocm-text-muted)">${esc(m.role)}</span>`:'') : '<span style="color:var(--ocm-text-muted)">not in an OC</span>'}</td>
          <td style="padding:6px 8px">${reqCell}</td>
          <td style="padding:6px 8px">${holdCell}</td>
          <td style="padding:6px 8px">${flagBadge(m)}</td>
        </tr>`;
      }).join('');
      membersPane = `
        <div class="ocm-section-title" style="margin-top:2px">👥 Member Item Status (${memberList.length})</div>
        <div style="font-size:10px;color:var(--ocm-text-muted);margin-bottom:6px;line-height:1.5">
          Only members whose current OC role requires an item, or who hold a faction item on loan — everyone else is omitted.
          Required ✓ = has the item · ✗ = needs a loan (see Loans tab). Holding items marked ⚠ aren't needed for their current role and can be retrieved.</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed">
          <thead><tr style="color:var(--ocm-text-muted);font-size:9px;text-transform:uppercase;text-align:left">
            <th style="padding:4px 8px;width:110px">Member</th><th style="padding:4px 8px;width:auto">OC · Role</th>
            <th style="padding:4px 8px;width:130px">Required</th><th style="padding:4px 8px;width:150px">Holding (loans)</th>
            <th style="padding:4px 8px;width:96px">Status</th></tr></thead>
          <tbody>${mrows}</tbody></table>`;
    }

    // — Payouts pane. The funds log doesn't say which OC a give was for, so we
    //   MATCH gives back to per-member OC claims by recipient + amount + timing.

    // Per-member reconciliation, now claim-level: a claim is settled only if a
    // give actually matched it — not merely because the member received money.
    const reconMap = {};   // uid -> row
    const rowFor = (uid, name) => {
      const k = String(uid);
      if (!reconMap[k]) reconMap[k] = { uid: k, name: name || ('#' + k), owed: 0, matchedAmt: 0, ocs: 0, settled: 0, otherRecv: 0, last: 0 };
      if (name && reconMap[k].name.startsWith('#')) reconMap[k].name = name;
      return reconMap[k];
    };
    for (const c of match.claims) {
      // Respect the manual Paid toggle: an OC marked paid owes nothing.
      const ocRec = perOc.find(o => String(o.id) === c.ocId);
      if (ocRec?.paid) continue;
      const row = rowFor(c.uid, c.name);
      row.ocs++;
      if (c.matched) { row.settled++; row.matchedAmt += c.expected; row.last = Math.max(row.last, c.matched.ts); }
      else row.owed += c.expected;
    }
    // Gives that matched nothing still count as money the member received.
    for (const e of match.unmatchedEvents) {
      if (sinceTs > 0 && e.ts < sinceTs) continue;
      const row = rowFor(e.toId, e.toName);
      row.otherRecv += e.amount;
      row.last = Math.max(row.last, e.ts);
    }
    const reconRows = Object.values(reconMap)
      .map(r => ({ ...r, out: r.owed }))
      .filter(r => r.ocs > 0 || r.otherRecv > 0)
      .sort((a, b) => b.out - a.out || b.owed - a.owed);
    const outstandingCount = reconRows.filter(r => r.out > 0.5).length;

    // OCs the log says look paid, but that aren't marked paid yet.
    const suggested = perOc.filter(r => !r.paid && matchByOc[String(r.id)]?.full);
    // Torn records payouts natively (OC 2.0 payout system). When that data is
    // present it is authoritative and the funds-log inference is unnecessary.
    const nativeMode = nativeSeen > 0;
    let payoutsPane;
    if (nativeMode) {
      const paidOcs   = perOc.filter(r => r.money > 0 && r.native?.paid);
      const unpaidOcs = perOc.filter(r => r.money > 0 && !(r.native?.paid));
      // The pane used to carry its OWN memberCutOf that returned $0 whenever the
      // payout record had no percentage — silently understating "Paid to members",
      // "Faction kept" and every per-member earning. It now uses the shared
      // splitOf/memberCutOf from above (Torn's % if recorded, else the per-level
      // setting); estimated rows are marked "~%" in the tables below.
      const totalPaidOut = paidOcs.reduce((s, r) => s + memberCutOf(r), 0);

      // ── Who got paid what: roll every paid OC's split up per member
      const byMember = {};
      for (const r of paidOcs) {
        const ids = Object.keys(r.participants);
        if (!ids.length) continue;
        const each = memberCutOf(r) / ids.length;
        for (const uid of ids) {
          if (!byMember[uid]) byMember[uid] = { uid, name: r.participants[uid], ocs: 0, total: 0, last: 0 };
          byMember[uid].ocs++;
          byMember[uid].total += each;
          byMember[uid].last = Math.max(byMember[uid].last, r.native.at || 0);
        }
      }
      const memberRows = Object.values(byMember).sort((a, b) => b.total - a.total);
      const topPaid = memberRows[0];

      const kpis = `<div class="ocm-kpis">`
        + kpiTile('Paid to members', fmtMoney(totalPaidOut), `across ${paidOcs.length} OC${paidOcs.length === 1 ? '' : 's'}`, 'var(--ocm-cpr-good)')
        + kpiTile('Awaiting payout', unpaidOcs.length, unpaidOcs.length ? `${fmtMoney(unpaidCash)} not distributed` : 'all settled', unpaidOcs.length ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-good)')
        + kpiTile('Members paid', memberRows.length, topPaid ? `top: ${esc(topPaid.name)}` : '—', 'var(--ocm-link)')
        + kpiTile('Faction kept', fmtMoney(paidOcs.reduce((s, r) => s + (r.money - memberCutOf(r)), 0)), "the faction's cut", 'var(--ocm-text)')
        + `</div>`;

      // (The per-member "Paid to Each Member" table that lived here duplicated
      //  👤 Member Earnings row-for-row — removed in v5.0.2. byMember survives
      //  only to feed the "Members paid" KPI above.)

      // ── OC tables. Each paid OC expands to show its crew and each member's cut.
      const crewDetail = (r) => {
        const ids = Object.keys(r.participants);
        if (!ids.length) return '<span style="color:var(--ocm-text-muted)">crew unknown (ran before v3.12)</span>';
        const each = memberCutOf(r) / ids.length;
        return ids.map(uid => `<span class="ocm-pay-crew"><a href="/profiles.php?XID=${uid}" target="_blank">${esc(r.participants[uid])}</a> <b>${fmtMoney(each)}</b></span>`).join('');
      };
      const ocRows = (rows, paid) => rows.map(r => {
        const n = r.native || {};
        const crew = Object.keys(r.participants).length;
        const each = paid && crew ? memberCutOf(r) / crew : null;
        return `<tr class="ocm-pay-row" data-oc="${esc(String(r.id))}">
          <td style="color:var(--ocm-text-muted);white-space:nowrap">${dateStr(r.executedAt)}</td>
          <td style="font-weight:600;color:var(--ocm-text)">${esc(r.name)}</td>
          <td style="text-align:right;color:var(--ocm-text-dim)">${fmtMoney(r.money)}</td>
          <td style="text-align:center;color:var(--ocm-text-dim)">${crew || '—'}</td>
          <td style="text-align:center;color:var(--ocm-link);font-weight:600"${n.percentage == null ? ' title="Torn didn’t record the split for this payout — estimated from your per-level share setting"' : ''}>${n.percentage != null ? n.percentage + '%' : '~' + splitOf(r) + '%'}</td>
          <td style="text-align:right;font-weight:700;color:${paid ? 'var(--ocm-cpr-good)' : 'var(--ocm-text-muted)'}">${each != null ? fmtMoney(each) : '—'}</td>
          <td style="text-align:right;white-space:nowrap;color:${paid ? 'var(--ocm-cpr-good)' : 'var(--ocm-cpr-warn)'}">${paid ? '✓ ' + dateStr(n.at) : 'awaiting'}</td>
        </tr>
        ${paid ? `<tr class="ocm-pay-detail" data-oc="${esc(String(r.id))}"><td colspan="7"><div class="ocm-pay-crewwrap">${crewDetail(r)}</div></td></tr>` : ''}`;
      }).join('');
      const ocTable = (rows, title, note, paid) => !rows.length ? '' : `
        <div class="ocm-section-title ocm-mt">${title}</div>
        ${note ? `<div class="ocm-note">${note}</div>` : ''}
        <table class="ocm-pay-table">
          <thead><tr>
            <th style="width:56px">Ran</th><th style="width:auto">OC</th>
            <th style="width:90px;text-align:right">Cash</th>
            <th style="width:50px;text-align:center">Crew</th>
            <th style="width:56px;text-align:center" title="Members' cut, set when the payout was made in-game">Split</th>
            <th style="width:96px;text-align:right" title="What each participant received">Each</th>
            <th style="width:86px;text-align:right">Paid</th>
          </tr></thead>
          <tbody>${ocRows(rows, paid)}</tbody></table>`;

      payoutsPane = kpis
        + `<div class="ocm-note">This pane tracks WHICH OCs have been paid out and when — per-member totals live under <b>👤 Member Earnings</b>.</div>`
        + ocTable(unpaidOcs, `⏳ Awaiting Payout (${unpaidOcs.length})`,
                  'Completed OCs Torn has not recorded as paid out. Handle the payout on the OC page — Torn does the splitting.', false)
        + ocTable(paidOcs.slice(0, 120), `✓ Paid (${paidOcs.length})`,
                  paidOcs.length > 120
                    ? 'Click any row to see who got what. Showing the newest 120 — the OCs Ran tab scrolls the full archive.'
                    : 'Click any row to see who got what.', true)
        + `<div style="font-size:11px;color:var(--ocm-text-muted);margin-top:12px;line-height:1.6">
             Read straight from Torn's OC payout records: whether each OC was paid, when, and the split set at payout time.
             Each member receives an equal share of the members' cut, so "Each" = cash × split ÷ crew.
             A "~" split means Torn didn't record the percentage for that payout — your per-level share setting fills in.</div>`;
    } else {
      const evAll = Object.values(payEvents).sort((a, b) => b.ts - a.ts);
      const statusHint = (newsStatus && newsStatus !== 'ok' && evAll.length === 0)
        ? `<div style="color:var(--ocm-cpr-warn);font-size:11px;padding:8px 10px;background:var(--ocm-bg);border:1px solid var(--ocm-cpr-warn);border-radius:6px;margin-bottom:8px">
             ⚠ Couldn't read the faction funds log (<span style="color:var(--ocm-text-dim)">${esc(newsStatus)}</span>).
             The giveFunds news needs a key with faction API access — matching will populate once readable. Owed figures below still work.</div>`
        : '';

      // ── Suggested matches: OCs the log says are fully paid but aren't marked
      const confBadge = (c) => c === 'high'
        ? '<span style="color:var(--ocm-cpr-good);font-weight:bold" title="Every member matched, amounts within 2% of the expected split">high</span>'
        : '<span style="color:var(--ocm-cpr-warn);font-weight:bold" title="Every member matched, but amounts differ from the expected split by up to 15%">likely</span>';
      const sugRows = suggested.map(r => {
        const m = matchByOc[String(r.id)];
        return `<tr>
          <td style="padding:6px 8px;color:var(--ocm-text-muted);white-space:nowrap">${dateStr(r.executedAt)}</td>
          <td style="padding:6px 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.name)}">${esc(r.name)}</td>
          <td style="padding:6px 8px;text-align:right;color:var(--ocm-text-dim)">${fmtMoney(r.money)}</td>
          <td style="padding:6px 8px;text-align:center;color:var(--ocm-text-dim)">${m.matched}/${m.total}${m.lump?' <span title="Settled by a lump-sum give covering several OCs">📦</span>':''}</td>
          <td style="padding:6px 8px;text-align:center">${confBadge(m.confidence)}</td>
          <td style="padding:6px 8px;text-align:right;color:var(--ocm-text-muted);white-space:nowrap">${dateStr(m.lastTs)}</td>
          <td style="padding:6px 8px;text-align:right">
            <button class="ocm-paid-btn" data-oc="${esc(String(r.id))}" style="font-size:11px;padding:3px 10px;border-radius:4px;cursor:pointer;border:1px solid var(--ocm-cpr-good);background:#12200f;color:var(--ocm-cpr-good)">Mark paid ✓</button></td>
        </tr>`;
      }).join('');
      const sugPanel = suggested.length === 0 ? '' : `
        <div class="ocm-section-title" style="margin-top:2px">🔎 Looks Paid — Confirm (${suggested.length})</div>
        <div style="font-size:10px;color:var(--ocm-text-muted);margin-bottom:6px;line-height:1.5">
          Every member of these OCs received a matching give from the faction, but the OC isn't marked paid yet.
          Torn doesn't record which OC a give was for, so this is inference — check it, then confirm.
          <button id="ocm-accept-all" style="margin-left:6px;font-size:10px;padding:2px 8px;border-radius:4px;cursor:pointer;border:1px solid var(--ocm-cpr-good);background:#12200f;color:var(--ocm-cpr-good)">Accept all ${suggested.length}</button></div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed">
          <thead><tr style="color:var(--ocm-text-muted);font-size:9px;text-transform:uppercase;text-align:left">
            <th style="padding:4px 8px;width:56px">Ran</th><th style="padding:4px 8px;width:auto">OC</th>
            <th style="padding:4px 8px;width:78px;text-align:right">Cash</th>
            <th style="padding:4px 8px;width:60px;text-align:center" title="Members matched to a give">Matched</th>
            <th style="padding:4px 8px;width:62px;text-align:center">Confidence</th>
            <th style="padding:4px 8px;width:62px;text-align:right">Paid on</th>
            <th style="padding:4px 8px;width:96px;text-align:right">Confirm</th></tr></thead>
          <tbody>${sugRows}</tbody></table>`;

      // ── Per-member reconciliation (claim-level)
      const reconTable = reconRows.length === 0
        ? '<div style="color:var(--ocm-text-dim);font-size:12px;padding:10px 2px">Nothing to reconcile — no unpaid OC cash owed and no gives recorded in this window.</div>'
        : `<table style="width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed">
            <thead><tr style="color:var(--ocm-text-muted);font-size:9px;text-transform:uppercase;text-align:left">
              <th style="padding:4px 8px;width:auto">Member</th>
              <th style="padding:4px 8px;width:74px;text-align:center" title="Claims settled by a matched give, out of their claims on OCs not marked paid">Settled</th>
              <th style="padding:4px 8px;width:84px;text-align:right" title="Value of claims matched to a give in the funds log">Matched</th>
              <th style="padding:4px 8px;width:84px;text-align:right" title="Money they received that didn't match any OC claim (bonuses, loans, non-OC pay)">Other</th>
              <th style="padding:4px 8px;width:94px;text-align:right" title="Claims with no matching give — what you still owe them">Still owed</th></tr></thead>
            <tbody>${reconRows.map(r => `<tr>
              <td style="padding:6px 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><a href="/profiles.php?XID=${r.uid}" target="_blank" style="color:var(--ocm-link);text-decoration:none">${esc(r.name)}</a></td>
              <td style="padding:6px 8px;text-align:center;color:var(--ocm-text-dim)">${r.ocs ? `${r.settled}/${r.ocs}` : '—'}</td>
              <td style="padding:6px 8px;text-align:right;color:var(--ocm-cpr-good)">${r.matchedAmt ? fmtMoney(r.matchedAmt) : '—'}</td>
              <td style="padding:6px 8px;text-align:right;color:var(--ocm-link)">${r.otherRecv ? fmtMoney(r.otherRecv) : '—'}</td>
              <td style="padding:6px 8px;text-align:right;font-weight:bold;color:${r.out > 0.5 ? 'var(--ocm-cpr-crit)' : 'var(--ocm-cpr-good)'}">${r.out > 0.5 ? fmtMoney(r.out) : '✓ square'}</td>
            </tr>`).join('')}</tbody></table>`;

      // ── Unmatched gives — money out that no OC claim explains
      const umRows = match.unmatchedEvents.slice().sort((a, b) => b.ts - a.ts).slice(0, 15).map(e => `<tr>
          <td style="padding:4px 8px;color:var(--ocm-text-muted);white-space:nowrap">${dateStr(e.ts)}</td>
          <td style="padding:4px 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.fromName || '?')} <span style="color:var(--ocm-text-muted)">→</span> ${e.toId?`<a href="/profiles.php?XID=${e.toId}" target="_blank" style="color:var(--ocm-link);text-decoration:none">${esc(e.toName || '?')}</a>`:esc(e.toName || '?')}</td>
          <td style="padding:4px 8px;text-align:right;color:var(--ocm-link)">${fmtMoney(e.amount)}</td>
        </tr>`).join('');
      const umPanel = match.unmatchedEvents.length === 0 ? '' : `
        <div class="ocm-section-title" style="margin-top:14px">❔ Unmatched Gives (${match.unmatchedEvents.length})</div>
        <div style="font-size:10px;color:var(--ocm-text-muted);margin-bottom:6px;line-height:1.5">
          Faction money that went out but doesn't line up with any OC split — bonuses, loan repayments, non-OC pay,
          or an OC payout that didn't use the expected share. Shown so no money is silently unexplained.</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed">
          <thead><tr style="color:var(--ocm-text-muted);font-size:9px;text-transform:uppercase;text-align:left">
            <th style="padding:4px 8px;width:56px">Date</th><th style="padding:4px 8px;width:auto">Give</th>
            <th style="padding:4px 8px;width:90px;text-align:right">Amount</th></tr></thead>
          <tbody>${umRows}</tbody></table>`;

      const matchedClaims = match.claims.filter(c => c.matched).length;
      const legacyBanner = `<div style="font-size:10px;color:var(--ocm-text-muted);padding:8px 10px;background:var(--ocm-bg);border:1px solid var(--ocm-border-soft);border-radius:6px;margin-bottom:8px;line-height:1.5">
        Torn's own payout records aren't available for these OCs, so payouts are being <b>inferred</b> from the faction funds log instead. If your faction uses the in-game OC payout system, this view switches to those exact records automatically.</div>`;
      payoutsPane = legacyBanner + statusHint + sugPanel + `
        <div class="ocm-section-title" style="margin-top:${suggested.length?14:2}px">💸 Payout Reconciliation (${reconRows.length})</div>
        <div style="font-size:10px;color:var(--ocm-text-muted);margin-bottom:6px;line-height:1.5">
          Each completed OC creates one claim per member (cash × its expected share ÷ crew — Torn's recorded split
          if present, else your per-level setting). Gives from the faction funds log are
          matched to those claims by recipient, amount and timing — including lump sums that settle several OCs at once
          (within ${PAYOUT_MATCH_WINDOW_D} days, amounts tolerated to ${Math.round(PAYOUT_MATCH_TOL*100)}%).
          ${matchedClaims}/${match.claims.length} claim${match.claims.length===1?'':'s'} matched.
          Matching is inference — Torn never records which OC a give was for — so nothing is marked paid without you confirming.</div>
        ${reconTable}${umPanel}`;
    }

    // ═══════════════ EARNINGS: MEMBERS vs FACTION ═══════════════
    //
    // The old single "NET" column was ambiguous: revenue (cash + reward-item value)
    // minus item cost — i.e. the whole pie the OC produced, BEFORE anyone was paid.
    // On an 80% split, a "$313m net" OC actually left the faction about $62m. Two
    // different audiences, two different numbers, so they get two tabs:
    //
    //   MEMBER EARNINGS  = cash x split%, divided equally among that crew.
    //                      What people actually received.
    //   FACTION EARNINGS = (cash - member cut) + reward-item value - item cost.
    //                      What the faction actually kept. The faction eats the
    //                      materials and keeps the reward items, so both land here.
    // (split helpers hoisted above — they're needed by the OCs Ran pane too)

    /**
     * Period buckets WITH the split applied. The old Trends tab bucketed by week and
     * month but reported that same ambiguous "net" — a number that was neither what
     * members made nor what the faction kept, which is why it felt useless. Same
     * buckets, honest columns. Also feeds the exporter.
     */
    function bucketEarnings(rows, keyFn) {
      const out = {};
      for (const r of rows) {
        if (!r.executedAt) continue;
        const key = keyFn(new Date(r.executedAt * 1000));
        const b = out[key] || (out[key] = { key, ocs: 0, gross: 0, toMembers: 0, cost: 0, kept: 0, respect: 0, ts: r.executedAt });
        const gross = (r.money || 0) + (r.itemValue || 0);
        const mem   = wasPaid(r) ? memberCutOf(r) : 0;
        b.ocs++; b.gross += gross; b.toMembers += mem; b.cost += (r.cost || 0);
        b.kept += gross - mem - (r.cost || 0); b.respect += (r.respect || 0);
        b.ts = Math.min(b.ts, r.executedAt);
      }
      return Object.values(out).sort((a, b) => b.ts - a.ts);
    }
    const wkKey = (d) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() - x.getUTCDay()); return `Wk of ${x.toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' })}`; };
    const moKey = (d) => d.toLocaleDateString('en-GB', { timeZone: 'UTC', month: 'short', year: 'numeric' });
    const weekly  = bucketEarnings(perOc, wkKey);
    const monthly = bucketEarnings(perOc, moKey);

    const periodTable = (title, buckets) => !buckets.length ? '' : `
      <div class="ocm-section-title ocm-mt">${title}</div>
      <table class="ocm-pay-table">
        <thead><tr>
          <th style="width:auto">Period</th>
          <th style="width:50px;text-align:right">OCs</th>
          <th style="width:100px;text-align:right">Gross</th>
          <th style="width:100px;text-align:right">To members</th>
          <th style="width:88px;text-align:right">Cost</th>
          <th style="width:110px;text-align:right">Faction kept</th>
          <th style="width:88px;text-align:right">Respect</th>
        </tr></thead>
        <tbody>${buckets.map(b => `<tr>
          <td style="color:var(--ocm-text-dim)">${esc(b.key)}</td>
          <td style="text-align:right;color:var(--ocm-text-dim)">${b.ocs}</td>
          <td style="text-align:right;color:var(--ocm-text-dim)">${fmtMoney(b.gross)}</td>
          <td style="text-align:right;color:var(--ocm-link)">${b.toMembers ? '−' + fmtMoney(b.toMembers) : '—'}</td>
          <td style="text-align:right;color:${b.cost ? 'var(--ocm-cpr-warn)' : 'var(--ocm-text-faint)'}">${b.cost ? '−' + fmtMoney(b.cost) : '—'}</td>
          <td style="text-align:right;font-weight:700;color:${b.kept >= 0 ? 'var(--ocm-cpr-good)' : 'var(--ocm-cpr-crit)'}">${fmtMoney(b.kept)}</td>
          <td style="text-align:right;color:var(--ocm-text-muted)">${Math.round(b.respect).toLocaleString()}</td>
        </tr>`).join('')}</tbody></table>`;

    // ── MEMBER EARNINGS
    let memberEarnPane;
    {
      const paidOnly = perOc.filter(r => r.money > 0 && wasPaid(r));
      const rows = {};
      for (const r of paidOnly) {
        const ids = Object.keys(r.participants || {});
        if (!ids.length) continue;
        const each = memberCutOf(r) / ids.length;
        for (const uid of ids) {
          const row = rows[uid] || (rows[uid] = { uid, name: r.participants[uid], ocs: 0, earned: 0, respect: 0, byOc: {} });
          row.ocs++; row.earned += each; row.respect += (r.respect || 0) / ids.length;
          row.byOc[r.name] = (row.byOc[r.name] || 0) + each;
        }
      }
      const list = Object.values(rows).sort((a, b) => b.earned - a.earned);
      const totalToMembers = list.reduce((s, m) => s + m.earned, 0);
      const maxE = list.length ? list[0].earned : 1;

      memberEarnPane = `
        <div class="ocm-kpis">
          ${kpiTile('Paid to members', fmtMoney(totalToMembers), `across ${paidOnly.length} paid OC${paidOnly.length === 1 ? '' : 's'}`, 'var(--ocm-cpr-good)')}
          ${kpiTile('Members paid', list.length, list[0] ? `top: ${esc(list[0].name)}` : '—', 'var(--ocm-link)')}
          ${kpiTile('Average each', fmtMoney(list.length ? totalToMembers / list.length : 0), 'per member, all time', 'var(--ocm-text)')}
          ${kpiTile('Respect earned', Math.round(list.reduce((s, m) => s + m.respect, 0)).toLocaleString(), 'shared across crews', 'var(--ocm-text-dim)')}
        </div>
        <div class="ocm-section-title">👤 Member Earnings (${list.length})</div>
        <div style="font-size:11px;color:var(--ocm-text-muted);margin-bottom:8px;line-height:1.6">
          What each member actually <b>received</b>: the OC's cash × the split % recorded at payout, divided equally among that crew.
          Only OCs Torn records as PAID count — pending ones aren't money anyone has. Click a row for the crimes it came from.</div>
        ${list.length === 0 ? '<div style="color:var(--ocm-text-faint);font-size:12px;padding:8px 2px">No paid OCs with a known crew yet.</div>' : `
        <table class="ocm-pay-table">
          <thead><tr>
            <th style="width:auto">Member</th>
            <th style="width:56px;text-align:right">OCs</th>
            <th style="width:110px;text-align:right">Earned</th>
            <th style="width:96px;text-align:right">Avg / OC</th>
            <th style="width:80px;text-align:right">Respect</th>
            <th style="width:120px">Share</th>
          </tr></thead>
          <tbody>${list.map(m => `
            <tr class="ocm-earn-row" data-uid="${esc(m.uid)}">
              <td><a href="/profiles.php?XID=${m.uid}" target="_blank">${esc(m.name)}</a></td>
              <td style="text-align:right;color:var(--ocm-text-dim)">${m.ocs}</td>
              <td style="text-align:right;font-weight:700;color:var(--ocm-cpr-good)">${fmtMoney(m.earned)}</td>
              <td style="text-align:right;color:var(--ocm-text-dim)">${fmtMoney(m.earned / m.ocs)}</td>
              <td style="text-align:right;color:var(--ocm-text-muted)">${Math.round(m.respect).toLocaleString()}</td>
              <td><div class="ocm-pay-bar"><span style="width:${(m.earned / maxE) * 100}%"></span></div></td>
            </tr>
            <tr class="ocm-earn-detail" data-uid="${esc(m.uid)}"><td colspan="6"><div class="ocm-pay-crewwrap">
              ${Object.entries(m.byOc).sort((a, b) => b[1] - a[1]).map(([oc, v]) => `<span class="ocm-pay-crew">${esc(oc)} <b>${fmtMoney(v)}</b></span>`).join('')}
            </div></td></tr>`).join('')}</tbody></table>`}`;
    }

    // ── OVERVIEW (owns ocm-money-summary) — the honest split, faction-side.
    //    Merged from the old Faction Earnings sub-tab (v5.0.2).
    let overviewPane;
    {
      const done  = perOc.filter(r => (r.money || 0) > 0 || (r.itemValue || 0) > 0);
      const paid  = done.filter(wasPaid);
      const gross = done.reduce((s, r) => s + (r.money || 0) + (r.itemValue || 0), 0);
      const toMembers = paid.reduce((s, r) => s + memberCutOf(r), 0);
      const itemCost  = done.reduce((s, r) => s + (r.cost || 0), 0);
      const kept      = gross - toMembers - itemCost;
      const pending   = done.filter(r => !wasPaid(r)).reduce((s, r) => s + memberCutOf(r), 0);

      const byScen = {};
      for (const r of done) {
        const s = byScen[r.name] || (byScen[r.name] = { name: r.name, runs: 0, gross: 0, toMembers: 0, cost: 0, kept: 0 });
        const g = (r.money || 0) + (r.itemValue || 0);
        const m = wasPaid(r) ? memberCutOf(r) : 0;
        s.runs++; s.gross += g; s.toMembers += m; s.cost += (r.cost || 0); s.kept += g - m - (r.cost || 0);
      }
      const scen = Object.values(byScen).sort((a, b) => b.kept - a.kept);

      overviewPane = ocCount === 0
        ? `<div class="ocm-note" style="padding:6px 2px">No completed-OC data in this view${sinceTs > 0 ? ' after your cutoff date' : ''}. ${viewNote}</div>`
        : `
        <div class="ocm-kpis">
          ${kpiTile('Faction kept', fmtMoney(kept), 'after payouts and costs', kept >= 0 ? 'var(--ocm-cpr-good)' : 'var(--ocm-cpr-crit)')}
          ${kpiTile('Gross produced', fmtMoney(gross), 'cash + reward items', 'var(--ocm-text)')}
          ${kpiTile('Paid out', `−${fmtMoney(toMembers)}`, 'to members', 'var(--ocm-link)')}
          ${kpiTile('Item cost', `−${fmtMoney(itemCost)}`, 'materials consumed', itemCost ? 'var(--ocm-cpr-warn)' : 'var(--ocm-text-dim)')}
        </div>
        ${pending > 0 ? `<div style="font-size:11px;color:var(--ocm-cpr-warn);border:1px solid var(--ocm-cpr-warn);border-radius:6px;padding:8px 10px;margin-bottom:10px;line-height:1.5">
          ⚠ <b>${fmtMoney(pending)}</b> of members' cut hasn't been paid out yet. It's still with the faction, so "Faction kept" is flattering by that much until you settle it.</div>` : ''}
        <div class="ocm-section-title">🏦 What the Faction Actually Keeps</div>
        <div style="font-size:11px;color:var(--ocm-text-muted);margin-bottom:8px;line-height:1.6">
          <b>Gross</b> = everything the OC produced (cash + reward items). <b>To members</b> = cash × the split
          (Torn's actual recorded % where it paid out; otherwise your per-level setting).
          <b>Cost</b> = materials the faction burned. <b>Kept</b> = what's actually left — the number that decides
          whether a crime is worth running. A huge-gross crime on a 90% split can keep less than a modest one at 50%.</div>
        <table class="ocm-pay-table">
          <thead><tr>
            <th style="width:auto">Scenario</th>
            <th style="width:50px;text-align:right">Runs</th>
            <th style="width:100px;text-align:right">Gross</th>
            <th style="width:100px;text-align:right">To members</th>
            <th style="width:88px;text-align:right">Cost</th>
            <th style="width:110px;text-align:right">Faction kept</th>
            <th style="width:96px;text-align:right" title="What the faction keeps per run — the number that ranks scenarios">Kept / run</th>
          </tr></thead>
          <tbody>${scen.map(s => `<tr>
            <td style="font-weight:600;color:var(--ocm-text)">${esc(s.name)}</td>
            <td style="text-align:right;color:var(--ocm-text-dim)">${s.runs}</td>
            <td style="text-align:right;color:var(--ocm-text-dim)">${fmtMoney(s.gross)}</td>
            <td style="text-align:right;color:var(--ocm-link)">${s.toMembers ? '−' + fmtMoney(s.toMembers) : '—'}</td>
            <td style="text-align:right;color:${s.cost ? 'var(--ocm-cpr-warn)' : 'var(--ocm-text-faint)'}">${s.cost ? '−' + fmtMoney(s.cost) : '—'}</td>
            <td style="text-align:right;font-weight:700;color:${s.kept >= 0 ? 'var(--ocm-cpr-good)' : 'var(--ocm-cpr-crit)'}">${fmtMoney(s.kept)}</td>
            <td style="text-align:right;color:${s.kept >= 0 ? 'var(--ocm-cpr-good)' : 'var(--ocm-cpr-crit)'}">${fmtMoney(s.kept / s.runs)}</td>
          </tr>`).join('')}</tbody></table>
        ${periodTable('📅 By Week' + (weekly.length > 26 ? ' (last 26)' : ''), weekly.slice(0, 26))}
        ${periodTable('🗓 By Month', monthly)}
        <div class="ocm-note" style="margin-top:10px">${viewNote}${anyUnknownCost ? ' Some archived OCs predate cost tracking and show $0 cost.' : ''}</div>`;
    }

    // ═══════════════ EXPORTS — the builder ═══════════════
    {
      const dlEl = document.getElementById('ocm-downloads');
      if (dlEl) {
        const sets = buildExportDatasets({ perOc, weekly, monthly, memberCutOf, factionCutOf, splitOf });
        const DATASETS = [
          ['ocs',       'OCs ran (per-crime ledger)', 'Every completed OC: rewards, costs, split, both cuts.'],
          ['members',   'Member earnings',            'What each member received, plus their respect share.'],
          ['weekly',    'Weekly summary',             'OCs per week, members vs faction, respect.'],
          ['monthly',   'Monthly summary',            'The same, by month.'],
          ['scenarios', 'By scenario',                'Which crimes actually keep the most per run.'],
          ['respect',   'Respect tracking',           'Respect per OC and per member.'],
          ['wars',      'War member stats',           'Per-member hits, score and respect for every ranked war.'],
          ['chains',    'Chain history',              'Every tracked chain, with per-member rows where reported.'],
          ['attacks',   'Attack ledger (raw)',        'Slimmed raw attack rows — for your own analysis.'],
        ];
        const FORMATS = [
          ['html',    '📊 HTML report', 'A standalone page with a chart. Opens in any browser, works offline.'],
          ['csv',     '📄 CSV',         'For Excel / Sheets. Raw numbers so you can do maths on them.'],
          ['discord', '💬 Discord',     'Fixed-width code blocks, copied to your clipboard, ready to paste.'],
          ['json',    '{ } JSON',       'For feeding another script or a bot.'],
        ];

        dlEl.innerHTML = `
          <div class="ocm-section-title">⬇ Export Builder</div>
          <div style="font-size:11px;color:var(--ocm-text-muted);margin-bottom:12px;line-height:1.6">
            Pick what you want and how you want it. Every export uses the same honest split:
            <b>to members</b> = cash × the payout %; <b>faction kept</b> = everything else, minus the materials burned.</div>
          <div class="ocm-exp-grid">
            <div>
              <div class="ocm-exp-h">1 · What to include</div>
              ${DATASETS.map(([k, label, desc]) => `
                <label class="ocm-exp-opt">
                  <input type="checkbox" class="ocm-exp-ds" value="${k}" ${(k === 'weekly' || k === 'members') ? 'checked' : ''}>
                  <span><b>${label}</b> <em>${sets[k]?.rows.length ?? 0} rows</em><small>${desc}</small></span>
                </label>`).join('')}
            </div>
            <div>
              <div class="ocm-exp-h">2 · Format</div>
              ${FORMATS.map(([k, label, desc], i) => `
                <label class="ocm-exp-opt">
                  <input type="radio" name="ocm-exp-fmt" class="ocm-exp-fmt" value="${k}" ${i === 0 ? 'checked' : ''}>
                  <span><b>${label}</b><small>${desc}</small></span>
                </label>`).join('')}
              <button id="ocm-exp-go" class="ocm-join-btn" style="width:100%;padding:8px;margin-top:8px">Generate ▸</button>
              <div id="ocm-exp-status" style="font-size:11px;margin-top:8px;min-height:16px;line-height:1.5"></div>
            </div>
          </div>`;

        const statusEl = dlEl.querySelector('#ocm-exp-status');
        dlEl.querySelector('#ocm-exp-go')?.addEventListener('click', () => {
          const keys = [...dlEl.querySelectorAll('.ocm-exp-ds:checked')].map(c => c.value);
          const fmt  = dlEl.querySelector('.ocm-exp-fmt:checked')?.value || 'csv';
          if (!keys.length) { statusEl.innerHTML = '<span style="color:var(--ocm-cpr-warn)">Pick at least one dataset.</span>'; return; }
          const stamp = new Date().toISOString().slice(0, 10);
          const fname = `oc-${keys.length === 1 ? keys[0] : 'report'}-${stamp}`;
          const ok = (m) => statusEl.innerHTML = `<span style="color:var(--ocm-cpr-good)">✓ ${m}</span>`;

          try {
            if (fmt === 'csv') {
              triggerDownload(`${fname}.csv`, exportCSV(sets, keys), 'text/csv');
              ok(`Downloaded ${fname}.csv`);
            } else if (fmt === 'json') {
              triggerDownload(`${fname}.json`, exportJSON(sets, keys), 'application/json');
              ok(`Downloaded ${fname}.json`);
            } else if (fmt === 'html') {
              const done = perOc.filter(r => (r.money || 0) > 0 || (r.itemValue || 0) > 0);
              const kpis = {
                gross:     done.reduce((s, r) => s + (r.money || 0) + (r.itemValue || 0), 0),
                toMembers: done.filter(wasPaid).reduce((s, r) => s + memberCutOf(r), 0),
                respect:   done.reduce((s, r) => s + (r.respect || 0), 0),
              };
              kpis.kept = kpis.gross - kpis.toMembers - done.reduce((s, r) => s + (r.cost || 0), 0);
              triggerDownload(`${fname}.html`,
                exportHTML(sets, keys, { faction: OCM_FACTION_NAME || 'Faction', range: `${perOc.length} tracked OCs`, kpis, weekly }),
                'text/html');
              ok(`Downloaded ${fname}.html — open it in a browser.`);
            } else if (fmt === 'discord') {
              const text = exportDiscord(sets, keys, { maxRows: 15 });
              navigator.clipboard.writeText(text).then(() => {
                statusEl.innerHTML = `<span style="color:var(--ocm-cpr-good)">✓ Copied ${text.length} chars — paste into Discord.</span>`
                  + (text.length > 1900 ? `<br><span style="color:var(--ocm-cpr-warn)">⚠ Over Discord's 2000-char limit. Post it as two messages, or pick fewer datasets.</span>` : '');
              }).catch(() => {
                statusEl.innerHTML = '<span style="color:var(--ocm-cpr-crit)">The browser blocked clipboard access. Use CSV instead.</span>';
              });
            }
          } catch (e) {
            statusEl.innerHTML = `<span style="color:var(--ocm-cpr-crit)">Export failed: ${esc(e.message)}</span>`;
          }
        });
      }
    }

    // ── wire the backfill button
    const bfBtn = document.getElementById('ocm-backfill-btn');
    const bfStatus = document.getElementById('ocm-backfill-status');
    if (bfBtn && !bfBtn.__wired) {
      bfBtn.__wired = true;
      bfBtn.addEventListener('click', async () => {
        const key = GM_getValue(GMK.API_KEY, '');
        if (!key) { bfStatus.innerHTML = '<span style="color:var(--ocm-cpr-crit)">Set your API key in Config first.</span>'; return; }
        bfBtn.disabled = true;
        bfBtn.textContent = 'Working…';
        try {
          await backfillOcHistory(key, (p) => {
            if (p.error) {
              bfStatus.innerHTML = `<span style="color:var(--ocm-cpr-warn)">A window failed (${esc(p.error)}) — skipping it and continuing…</span>`;
            } else if (p.done) {
              const gapWarn = p.gaps?.length
                ? `<br><span style="color:var(--ocm-cpr-warn)">⚠ ${p.gaps.length} time window${p.gaps.length === 1 ? '' : 's'} couldn't be fetched even after retries — some OCs in ${p.gaps.length === 1 ? 'that period' : 'those periods'} are missing. Run it again to fill them in.</span>`
                : '';
              bfStatus.innerHTML = `<span style="color:var(--ocm-cpr-good)">✓ Archived ${p.total} OCs (${p.added} new) in ${p.calls} calls. Refreshing…</span>${gapWarn}`;
            } else {
              bfStatus.innerHTML = `Fetching… ${p.total} OCs archived, back to ${p.oldest.toLocaleDateString()} (${p.calls} calls)`;
            }
          });
          setTimeout(() => loadData(GM_getValue(GMK.API_KEY, '')), 800);
        } catch (e) {
          bfStatus.innerHTML = `<span style="color:var(--ocm-cpr-crit)">Backfill failed: ${esc(e.message)}</span>`;
        } finally {
          bfBtn.disabled = false;
          bfBtn.textContent = '↻ Update history';
        }
      });
    }

    syncStaticCollapse();
    restoreDynamicCollapse();

    // ═══════════════ DISTRIBUTE INTO THE TAB SHELL ═══════════════
    // Money panes and the two People panes are separate containers in the shell now,
    // so each rendered block goes where it belongs. No sub-tab bar is built here —
    // the shell owns that markup and wires it once at inject time.
    const put = (id, html) => { const t = document.getElementById(id); if (t) t.innerHTML = html; };
    // ═══════════════ HISTORY BACKFILL + COMPLETION RATE ═══════════════
    {
      // Torn reports completed OCs with a status; anything that isn't a success is a
      // failure. Both spellings appear in the wild, so match loosely rather than
      // assuming one exact string.
      const finished = perOc.filter(r => r.status);
      const isWin = (s) => /success/i.test(String(s));
      const wins  = finished.filter(r => isWin(r.status)).length;
      const rate  = finished.length ? (wins / finished.length) * 100 : null;

      const meta = (() => { try { return JSON.parse(GM_getValue(GMK.OC_ARCHIVE_META, 'null')); } catch (_) { return null; } })();
      const archiveTotal = meta?.total || 0;
      const oldest = perOc.reduce((m, r) => (r.executedAt && (!m || r.executedAt < m)) ? r.executedAt : m, null);

      const rateTile = rate == null ? '' : kpiTile(
        'Completion rate', `${rate.toFixed(1)}%`,
        `${wins} of ${finished.length} succeeded`,
        rate >= 90 ? 'var(--ocm-cpr-good)' : rate >= 75 ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-crit)');

      const backfillBanner = `
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">
          ${kpiTile('OCs tracked', perOc.length, archiveTotal ? `${archiveTotal} archived + live` : 'live API window only', 'var(--ocm-text)')}
          ${rateTile}
          ${kpiTile('History back to', oldest ? dateStr(oldest) : '—', archiveTotal ? 'from the archive' : 'API limit — backfill for more', 'var(--ocm-text-dim)')}
        </div>
        <div id="ocm-backfill-box" style="border:1px solid var(--ocm-border-soft);border-radius:6px;padding:10px 12px;margin-bottom:12px;background:var(--ocm-bg-card)">
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <div style="flex:1;min-width:240px;font-size:11px;color:var(--ocm-text-muted);line-height:1.6">
              <b style="color:var(--ocm-text)">Full history backfill.</b>
              Torn's live call only returns the ~100 most recent OCs — everything older is invisible to the dashboard,
              so payouts, respect and success rate all silently begin at that cutoff.
              This walks the crimes API backwards a month at a time and archives the lot, permanently.
              It's paced to stay well under Torn's API limit, so a long history takes a couple of minutes — once, ever.
            </div>
            <button id="ocm-backfill-btn" class="ocm-join-btn" style="padding:6px 14px">${archiveTotal ? '↻ Update history' : '⏬ Backfill full history'}</button>
          </div>
          <div id="ocm-backfill-status" style="font-size:11px;color:var(--ocm-text-muted);margin-top:8px;min-height:15px"></div>
        </div>`;
      ocsPane = backfillBanner + ocsPane;
    }

    put('ocm-money-controls', controls);
    put('ocm-money-summary',  overviewPane);
    put('ocm-money-payouts',  payoutsPane);
    put('ocm-money-ocs',      ocsPane);
    put('ocm-money-members',  memberEarnPane);
    put('ocm-money-costs',    itemsPane);
    put('ocm-people-loans',   loansPane);
    put('ocm-people-items',   membersPane);

    // Sub-tab badges owned by this render
    const setSb = (id, val, attn) => {
      const b = document.getElementById(id);
      if (!b) return;
      b.textContent = val;
      b.style.display = val ? '' : 'none';
      b.classList.toggle('has-attn', !!attn);
    };
    setSb('ocm-sb-loans',    summary.loanCount,  summary.loanCount > 0);
    setSb('ocm-sb-memitems', memberAttn,         memberAttn > 0);
    setSb('ocm-sb-costs',    summary.armoryGaps, summary.armoryGaps > 0);
    setSb('ocm-sb-payouts',  unpaidCount,        unpaidCount > 0);

    // Money main-tab badge = OCs still awaiting payout.
    const moneyBadge = document.getElementById('ocm-tab-count-money');
    if (moneyBadge) {
      moneyBadge.textContent = unpaidCount;
      // Hide a zero, exactly like updateTabCounts' setBadge does. This badge is
      // written HERE rather than there, so it missed the v5.3 zero-hiding and was
      // the only tab still showing a bare "0" on the rail.
      moneyBadge.style.display = unpaidCount ? '' : 'none';
      moneyBadge.classList.toggle('has-attn', unpaidCount > 0);
    }
    // The Armoury badge covers loans + item-status; updateTabCounts finalises it.
    ocmArmouryAttn = summary.loanCount + memberAttn;

    el.querySelectorAll('.ocm-earn-row').forEach(row => {
      row.addEventListener('click', () => {
        const d = el.querySelector(`.ocm-earn-detail[data-uid="${row.dataset.uid}"]`);
        if (d) d.classList.toggle('is-open');
      });
    });

    // ── wire expandable payout rows (reveal who got what)
    el.querySelectorAll('.ocm-pay-row').forEach(row => {
      row.addEventListener('click', () => {
        const det = el.querySelector(`.ocm-pay-detail[data-oc="${row.dataset.oc}"]`);
        if (det) det.classList.toggle('is-open');
      });
    });

    // ── wire expandable OC rows
    el.querySelectorAll('.ocm-fin-ocrow').forEach(row => {
      row.addEventListener('click', () => {
        const det = el.querySelector(`.ocm-fin-detail[data-oc="${row.dataset.oc}"]`);
        if (det) det.style.display = det.style.display === 'none' ? '' : 'none';
      });
    });

    // ── wire paid toggles (stopPropagation so the row doesn't collapse)
    const rerender = () => renderFinanceSection(crimes, armory, itemNames, itemValues, loanedOut, memberNames);
    el.querySelectorAll('.ocm-paid-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.oc;
        const p = loadPayouts();
        if (p[id]?.paid) delete p[id];
        else p[id] = { paid: true, ts: Math.floor(Date.now() / 1000) };
        savePayouts(p);
        rerender();
      });
    });

    // ── record the loan intent so the armory tab can autofill the form
    el.querySelectorAll('.ocm-loan-go').forEach(a => {
      a.addEventListener('click', () => {
        setLoanIntent({
          mode:       a.dataset.mode || 'give',
          itemId:     a.dataset.item,
          itemName:   a.dataset.itemname,
          uid:        a.dataset.uid,
          memberName: a.dataset.member,
          qty:        1,
        });
      });
    });

    // ── wire "accept all" on suggested payout matches
    const acceptAllBtn = document.getElementById('ocm-accept-all');
    if (acceptAllBtn) acceptAllBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const p = loadPayouts();
      const now = Math.floor(Date.now() / 1000);
      for (const r of suggested) p[String(r.id)] = { paid: true, ts: now, auto: true };
      savePayouts(p);
      ocmToast(`Marked ${suggested.length} OC${suggested.length===1?'':'s'} paid`, 'ok');
      rerender();
    });

    // ── wire member share % config
    // ── member share by OC level
    const shareToggle = document.getElementById('ocm-share-toggle');
    const sharePanel  = document.getElementById('ocm-share-panel');
    const shareMsg    = document.getElementById('ocm-share-msg');
    if (shareToggle && sharePanel) {
      shareToggle.addEventListener('click', () => {
        const open = sharePanel.style.display !== 'none';
        sharePanel.style.display = open ? 'none' : 'block';
        shareToggle.textContent = open ? '⚖ Member share by level' : '× Close';
      });
    }
    document.getElementById('ocm-share-save')?.addEventListener('click', () => {
      saveShareByDiff(readShareInputs('.ocm-share-lv'));
      if (shareMsg) shareMsg.textContent = '✓ Saved';
      rerender();
    });
    document.getElementById('ocm-share-reset')?.addEventListener('click', () => {
      saveShareByDiff({ ...DEFAULT_SHARE_BY_DIFF });
      rerender();
    });

    // ── wire profit controls (full re-render)
    el.querySelectorAll('.ocm-profit-view-btn').forEach(btn => {
      btn.addEventListener('click', () => { GM_setValue(GMK.PROFIT_VIEW, btn.dataset.view); rerender(); });
    });
    const sinceInput = document.getElementById('ocm-profit-since');
    if (sinceInput) sinceInput.addEventListener('change', () => {
      const v = sinceInput.value;
      GM_setValue(GMK.PROFIT_SINCE, v ? Math.floor(new Date(v + 'T00:00:00Z').getTime() / 1000) : 0);
      rerender();
    });
    const clearBtn = document.getElementById('ocm-profit-since-clear');
    if (clearBtn) clearBtn.addEventListener('click', () => { GM_setValue(GMK.PROFIT_SINCE, 0); rerender(); });
  }


  /**
   * TornStats Coverage checker — cross-references the faction roster against the
   * TornStats CPR data we have, showing who has CPR data in TornStats and who
   * doesn't. Members without data either haven't shared their CPRs with the faction
   * on TornStats, or haven't visited the crimes page to submit them.
   */
  function renderTsCoverage(memberMap) {
    const el = document.getElementById('ocm-tscoverage');
    if (!el) return;

    const tsKey   = GM_getValue(GMK.TS_KEY, '');
    const members = Object.values(memberMap || {});
    if (!tsKey) {
      el.innerHTML = '<div style="color:var(--ocm-text-dim);font-size:12px;padding:12px;line-height:1.5">'
        + 'No TornStats API key set. Add one in Config to see which members have CPR data on TornStats.</div>';
      return;
    }
    if (!members.length) {
      el.innerHTML = '<div style="color:var(--ocm-text-dim);font-size:12px;padding:12px">No member roster loaded.</div>';
      return;
    }

    // A member is only useful to us if TornStats has enough crime+role records to
    // actually match the role we're asking about. Someone with a single entry is
    // technically "on TornStats" but the odds it's the crime+role you need are
    // negligible — the lookup falls through to a fuzzy guess. Counting them as
    // covered produced a reassuring 94% that meant nothing.
    const TS_THIN = 5;   // fewer than this many crime+role records = not usable

    const good = [];     // enough data to answer a specific crime+role
    const thin = [];     // on TornStats, but barely anything recorded
    const missing = [];  // nothing at all
    for (const m of members) {
      const uid  = String(m.id);
      const data = tsCprData[uid];
      let cprCount = 0;
      if (data && typeof data === 'object') {
        for (const roles of Object.values(data)) cprCount += Object.keys(roles || {}).length;
      }
      const rec = { uid, name: m.name || `#${uid}`, cprCount };
      if (cprCount === 0) missing.push(rec);
      else if (cprCount < TS_THIN) thin.push(rec);
      else good.push(rec);
    }
    good.sort((a, b) => b.cprCount - a.cprCount);
    thin.sort((a, b) => b.cprCount - a.cprCount || a.name.localeCompare(b.name));
    missing.sort((a, b) => a.name.localeCompare(b.name));

    const total   = members.length;
    const covPct  = total > 0 ? Math.round(good.length / total * 100) : 0;
    const covCol  = covPct >= 80 ? 'var(--ocm-cpr-good)' : covPct >= 50 ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-crit)';
    const noUse   = thin.length + missing.length;

    const chip = (m, bg, border, col, label) => `<a href="/profiles.php?XID=${m.uid}" target="_blank" style="text-decoration:none"
        title="${esc(m.name)} — ${m.cprCount} crime/role CPR${m.cprCount === 1 ? '' : 's'} recorded on TornStats.${label}">
        <span style="display:inline-block;background:${bg};border:1px solid ${border};border-radius:4px;padding:3px 8px;font-size:11px;color:${col}">
          ${esc(m.name)} <b style="opacity:.75;font-weight:600">${m.cprCount}</b>
        </span></a>`;

    const summary = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">
        ${kpiTile('Usable', `${covPct}%`, `${good.length} of ${total} members`, covCol)}
        ${kpiTile('Good data', good.length, `${TS_THIN}+ roles recorded`, 'var(--ocm-cpr-good)')}
        ${kpiTile('Barely any', thin.length, `1–${TS_THIN - 1} roles — not usable`, thin.length ? 'var(--ocm-cpr-warn)' : 'var(--ocm-text-dim)')}
        ${kpiTile('Nothing', missing.length, 'no CPR data at all', missing.length ? 'var(--ocm-cpr-crit)' : 'var(--ocm-cpr-good)')}
      </div>
      <div style="font-size:11px;color:var(--ocm-text-muted);line-height:1.6;margin-bottom:10px">
        The number on each name is how many <b>crime + role</b> CPRs TornStats has for them — not a CPR.
        A member with <b>1</b> is on TornStats but effectively useless: the odds that single record is the exact
        role you're checking are tiny, so the lookup falls back to a guess. That's why they're counted as
        <b style="color:var(--ocm-cpr-warn)">Barely any</b> here rather than as coverage.
        <br>This matters less than it used to — the script now prefers its own recorded CPRs from completed OCs,
        so these gaps close themselves as people actually run crimes.
      </div>`;

    const missingList = missing.length === 0
      ? ''
      : `<div class="ocm-section-title" style="margin-top:4px">❌ Nothing on TornStats (${missing.length})</div>
         <div style="font-size:10px;color:var(--ocm-text-muted);margin:4px 0 6px">No CPR data at all. They haven't shared CPRs with the faction (TornStats → Settings → Share CPR with Faction), or have never submitted them.</div>
         <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
           ${missing.map(m => `<a href="/profiles.php?XID=${m.uid}" target="_blank" style="text-decoration:none">
             <span style="display:inline-block;background:#1c1410;border:1px solid #4a2820;border-radius:4px;padding:3px 8px;font-size:11px;color:var(--ocm-cpr-crit)">${esc(m.name)}</span>
           </a>`).join('')}
         </div>`;

    const thinList = thin.length === 0
      ? ''
      : `<div class="ocm-section-title" style="margin-top:14px">⚠ Barely Any Data (${thin.length})</div>
         <div style="font-size:10px;color:var(--ocm-text-muted);margin:4px 0 6px">On TornStats, but with fewer than ${TS_THIN} crime/role records — treat these as having no usable data. They'll improve on their own as they run OCs.</div>
         <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
           ${thin.map(m => chip(m, '#2a2416', '#5a4a2a', 'var(--ocm-cpr-warn)', ' Too few to match a specific role reliably.')).join('')}
         </div>`;

    const goodList = good.length === 0
      ? '<div style="color:var(--ocm-text-faint);font-size:12px;padding:8px 0">No member has usable TornStats data yet.</div>'
      : `<div class="ocm-section-title" style="margin-top:14px">✓ Good Data (${good.length})</div>
         <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
           ${good.map(m => chip(m, '#14241a', '#2f4a34', 'var(--ocm-cpr-good)', ' Enough records to match a specific crime + role.')).join('')}
         </div>`;

    el.innerHTML = summary + missingList + thinList + goodList;
  }

  function renderTsCprSection(memberMap, liveCprMap = {}) {
    const el = document.getElementById('ocm-tscpr'), title = document.getElementById('ocm-title-tscpr');
    if (!el) return;
    if (!tsCprData || Object.keys(tsCprData).length === 0) {
      if (title) title.textContent = '📈 TornStats CPR';
      el.innerHTML = '<span style="color:var(--ocm-text-faint);font-size:11px">No data. Add TornStats key in \u2699 Config \u2192 \u2b07 Fetch CPR.</span>';
      return;
    }
    const idToName = {};
    if (memberMap) for (const m of Object.values(memberMap)) idToName[String(m.id)] = m.name || `#${m.id}`;
    const byCrime = {};
    for (const [uid, crimes] of Object.entries(tsCprData))
      for (const [crime, roles] of Object.entries(crimes))
        for (const [role, cpr] of Object.entries(roles)) {
          if (!byCrime[crime]) byCrime[crime] = {};
          if (!byCrime[crime][role]) byCrime[crime][role] = [];
          byCrime[crime][role].push({ uid, name: idToName[uid] || `#${uid}`, cpr });
        }
    const diffMap = window._ocmCrimeDiffMap || {};
    const crimeNames = Object.keys(byCrime).sort((a, b) => {
      const da = diffMap[a.toLowerCase().trim()] ?? 999;
      const db = diffMap[b.toLowerCase().trim()] ?? 999;
      return da - db || a.localeCompare(b);
    });
    if (title) title.textContent = `📈 TornStats CPR \u2014 ${Object.keys(tsCprData).length} members, ${crimeNames.length} crimes`;
    let html = '';
    for (const crime of crimeNames) {
      const crimeKey = crime.toLowerCase().trim();
      const roles = Object.keys(byCrime[crime]).sort();
      const ms = new Map();
      for (const role of roles) for (const e of byCrime[crime][role]) if (!ms.has(e.uid)) ms.set(e.uid, e.name);

      // cprs[uid][role] = { cpr, live } — live flag set when overridden by a current slot
      const cprs = {};
      for (const role of roles) {
        const roleKey = role.replace(/\s*#\d+$/, '').toLowerCase().trim();
        for (const { uid, cpr } of byCrime[crime][role]) {
          if (!cprs[uid]) cprs[uid] = {};
          const live = liveCprMap[uid]?.[crimeKey]?.[roleKey];
          cprs[uid][role] = (live != null) ? { cpr: live, live: true } : { cpr, live: false };
        }
      }
      const sorted = [...ms.keys()].sort((a, b) =>
        Math.min(...Object.values(cprs[a] || {}).map(o => o.cpr)) -
        Math.min(...Object.values(cprs[b] || {}).map(o => o.cpr)));

      // Header columns: role name + its weight (from getWeight)
      const thCols = roles.map(r => {
        const w = getWeight(crime, r.replace(/\s*#\d+$/, ''));
        const wLabel = w != null
          ? `<span style="color:var(--ocm-cpr-warn);font-weight:normal;font-size:9px;display:block;line-height:1.2">W ${w.toFixed(0)}%</span>`
          : '';
        return `<th style="text-align:right;min-width:62px">${r}${wLabel}</th>`;
      }).join('');

      const diff = diffMap[crimeKey];
      const diffBadge = diff != null ? `<span style="color:var(--ocm-link);font-size:10px;margin-left:6px;font-weight:normal">D${diff}</span>` : '';
      const rows = sorted.map(uid => {
        const cells = roles.map(role => {
          const entry = cprs[uid]?.[role];
          if (entry == null) return '<td style="text-align:right;color:var(--ocm-text-faint)">\u2013</td>';
          const v = entry.cpr;
          const col = v >= CPR_WARN ? 'var(--ocm-cpr-good)' : v >= CPR_CRIT ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-crit)';
          // Live (currently-slotted) values get a small dot + tooltip so it's clear
          // this is their REAL current CPR, not the TornStats estimate.
          const liveMark = entry.live
            ? `<span title="Live CPR from their current OC slot (overrides TornStats estimate)" style="color:var(--ocm-link);font-size:9px;margin-right:2px">\u25cf</span>`
            : '';
          return `<td style="text-align:right;font-weight:bold;color:${col}">${liveMark}${v}%</td>`;
        }).join('');
        return `<tr><td><a href="/profiles.php?XID=${uid}" target="_blank" style="color:var(--ocm-text-card);text-decoration:none">${esc(ms.get(uid))}</a></td>${cells}</tr>`;
      }).join('');
      html += `<div class="ocm-tscpr-oc-block"><div class="ocm-tscpr-oc-header collapsed"><span class="ocm-tscpr-arrow">\u25bc</span>${crime}${diffBadge} <span style="color:var(--ocm-text-muted);font-weight:normal;font-size:10px">(${sorted.length} members)</span></div><div class="ocm-tscpr-oc-body" style="display:none"><table class="ocm-tscpr-table"><thead><tr><th>Member</th>${thCols}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
    }
    el.innerHTML = html;
    el.querySelectorAll('.ocm-tscpr-oc-header').forEach(h => h.addEventListener('click', () => { const b = h.nextElementSibling; const vis = b.style.display === 'none'; b.style.display = vis ? '' : 'none'; h.classList.toggle('collapsed', !vis); }));
  }

  function injectTsBadges(el) {
    if (!tsCprData || Object.keys(tsCprData).length === 0) return;
    el.querySelectorAll('a[href*="profiles.php"]').forEach(link => {
      const m = link.href.match(/XID=(\d+)/);
      if (!m || !tsCprData[m[1]] || link.parentNode.querySelector('.ocm-ts-badge')) return;
      const low = tsLowestCpr(tsCprData[m[1]]); if (low === null) return;
      const col = low >= CPR_WARN ? 'var(--ocm-cpr-good)' : low >= CPR_CRIT ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-crit)';
      const b = document.createElement('span'); b.className = 'ocm-ts-badge'; b.style.color = col;
      b.title = `TornStats lowest CPR: ${low}%`; b.textContent = `TS:${low}%`;
      link.insertAdjacentElement('afterend', b);
    });
  }

  // ─── LOAD DATA ───────────────────────────────────────────────────────────────

  /** Entry point for a data refresh. Falls back to member mode silently on faction API error. */
  let _ocmLoadInFlight = false;
  // ─── WAR RENDERERS (v4.1) ────────────────────────────────────────────────
  // Render-only: they read the persistent war stores, never fetch. Fetching is
  // syncWarData's job (piggybacked on the refresh cycle); when it lands new
  // data, loadData calls renderWarSections() again.

  /** Persistent uid -> name cache, so war/armoury renders can resolve names
   *  without another members fetch.
   *
   *  v4.8 root-cause fix: this used to stash the RAW members payload and index
   *  it by uid — but the v2 members payload arrives as an ARRAY, so the keys
   *  were "0","1","2"… and every lookup missed. That's why Loadouts and Chains
   *  showed "#3580191" instead of names. Names are now normalised by the real
   *  user id and persisted, so ex-members and pre-refresh renders resolve too. */
  let OCM_MEMBER_NAMES = null;

  function loadMemberNameCache() {
    try { return JSON.parse(GM_getValue(GMK.MEMBER_NAMES, '{}')) || {}; } catch (_) { return {}; }
  }

  /** Fold a members payload (array OR id-keyed object) into the name cache. */
  function stashMemberNames(memberMap) {
    const out = OCM_MEMBER_NAMES || loadMemberNameCache();
    let changed = false;
    for (const [k, m] of Object.entries(memberMap || {})) {
      const uid = String(m?.id ?? k);
      if (m?.name && out[uid] !== m.name) { out[uid] = m.name; changed = true; }
    }
    OCM_MEMBER_NAMES = out;
    if (changed) { try { GM_setValue(GMK.MEMBER_NAMES, JSON.stringify(out)); } catch (_) {} }
    return out;
  }

  function warMemberName(uid) {
    if (!OCM_MEMBER_NAMES) OCM_MEMBER_NAMES = loadMemberNameCache();
    return OCM_MEMBER_NAMES[String(uid)] || null;
  }

  // ── Re-render hygiene (v5.0) ──────────────────────────────────────────────
  // innerHTML re-renders collapse every <details> card and expanded row, so the
  // 60s refresh kept folding whatever the user was reading. Each renderer now
  // snapshots which data-key cards are open before rebuilding and restores them
  // after. First render may bake its own defaults (e.g. the live war open).

  function openDetailKeys(root) {
    if (!root) return new Set();
    const keys = new Set();
    for (const d of root.querySelectorAll('details[data-key][open]')) keys.add(d.dataset.key);
    for (const tr of root.querySelectorAll('tr[data-key]')) {
      if (tr.style.display !== 'none' && tr.dataset.detail === '1') keys.add(tr.dataset.key);
    }
    return keys;
  }
  function restoreOpenDetails(root, keys) {
    if (!root || !keys || !keys.size) return;
    for (const d of root.querySelectorAll('details[data-key]')) if (keys.has(d.dataset.key)) d.open = true;
    for (const tr of root.querySelectorAll('tr[data-key]')) {
      if (tr.dataset.detail === '1' && keys.has(tr.dataset.key)) tr.style.display = '';
    }
  }

  /**
   * Torn's page script turns [title] attributes into floating tooltip nodes.
   * When a re-render removes the hovered element mid-hover, the tooltip is
   * orphaned and never dismissed (the reported stuck-tooltip bug). Sweep
   * tooltip nodes after every render pass and on tab switches — a live one
   * simply re-shows on the next mouse move.
   */
  function clearStaleTooltips() {
    try {
      document.querySelectorAll('body > .ui-tooltip, body > div[role="tooltip"], body > [id^="ui-tooltip"]')
        .forEach(t => t.remove());
    } catch (_) {}
  }

  function renderWarSections() {
    renderWarHistorySection();
    renderChainHistorySection();
    renderChainWatchSection();
    renderWarRoomSection();
    renderWarPaySection();
    renderReviveSection();
    renderWarToolsSection();
    // Armoury store-backed panes share the same render triggers.
    renderLoanLogSection();
    renderArmouryMembersSection();
    renderLoadoutsSection();
    // Money > Funds reads the persistent deposit/give stores.
    renderFundsSection();
    const badge = document.getElementById('ocm-tab-count-war');
    if (badge) {
      const active = warIsActive(loadWarArchive()) ? 1 : 0;
      badge.textContent = active;
      badge.classList.toggle('has-attn', active > 0);
    }
    clearStaleTooltips();
  }

  /** Chain-bonus milestones — the next one is what the watcher counts toward. */
  const CHAIN_MILESTONES = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];

  /** Colour a remaining-seconds value: calm → amber at 60s → red at 30s. */
  function chainTimeoutColor(remain) {
    if (remain > 60) return 'var(--ocm-cpr-good)';
    if (remain > 30) return 'var(--ocm-cpr-warn)';
    return 'var(--ocm-cpr-crit)';
  }

  function renderChainWatchSection() {
    const el = document.getElementById('ocm-war-watch');
    if (!el) return;
    const status = String(GM_getValue(GMK.CHAIN_LIVE_STATUS, ''));
    const c = _chainLive;
    if (!c) {
      el.innerHTML = `<div class="ocm-section-title">🔗 Live Chain</div>
        <div class="ocm-note">${status && status !== 'ok'
          ? `Couldn't read the chain (<b>${esc(status)}</b>) — needs a key with faction API access (AA).`
          : 'Chain status loads with the next data refresh. While this pane is open it updates every 30s.'}</div>`;
      return;
    }
    const nowS = Date.now() / 1000;
    const elapsed = nowS - c.at / 1000;
    const remain = Math.max(0, c.timeout - elapsed);
    const live = c.current > 0 && remain > 0;
    const coolRemain = Math.max(0, c.cooldown - elapsed);

    if (!live && coolRemain <= 0) {
      el.innerHTML = `<div class="ocm-section-title">🔗 Live Chain</div>
        <div class="ocm-note">No chain running. Checked ${Math.round(elapsed)}s ago — this pane re-checks every 30s while open, and every data refresh otherwise.</div>`;
      return;
    }

    const next = CHAIN_MILESTONES.find(m => m > c.current) || null;
    const prev = CHAIN_MILESTONES.filter(m => m <= c.current).pop() || 0;
    const pct = next ? Math.min(100, Math.round(((c.current - prev) / (next - prev)) * 100)) : 100;
    const expiryTs = Math.floor(c.at / 1000 + c.timeout);

    el.innerHTML = `
      <div class="ocm-section-title">🔗 Live Chain</div>
      ${live ? `
        <div class="ocm-chain-hero">
          <div>
            <div class="ocm-chain-count">${c.current.toLocaleString()}</div>
            <div class="ocm-note" style="margin:0">hits${c.max ? ' · record ' + c.max.toLocaleString() : ''}</div>
          </div>
          <div style="text-align:right">
            <div class="ocm-chain-timer" style="color:${chainTimeoutColor(remain)}">
              <span class="ocm-time" data-until="${expiryTs}">${fmtCountdown(expiryTs)}</span>
            </div>
            <div class="ocm-note" style="margin:0">until the chain drops</div>
          </div>
        </div>
        ${next ? `
          <div class="ocm-note" style="margin-top:8px">Next bonus at <b>${next.toLocaleString()}</b> — ${next - c.current} hit${next - c.current === 1 ? '' : 's'} away</div>
          <div class="ocm-pay-bar" style="height:8px"><span style="width:${pct}%"></span></div>` : ''}
        <div class="ocm-note" style="margin-top:10px">Timer counts down locally between 30s polls; treat the last few seconds as approximate. Keeping the chain alive is up to the humans — this pane only watches.</div>`
      : `
        <div class="ocm-chain-hero">
          <div>
            <div class="ocm-chain-count" style="color:var(--ocm-text-dim)">cooldown</div>
            <div class="ocm-note" style="margin:0">chain of ${c.current ? c.current.toLocaleString() : '—'} finished</div>
          </div>
          <div style="text-align:right">
            <div class="ocm-chain-timer" style="color:var(--ocm-text-dim)">
              <span class="ocm-time" data-until="${Math.floor(c.at / 1000 + c.cooldown)}">${fmtCountdown(Math.floor(c.at / 1000 + c.cooldown))}</span>
            </div>
            <div class="ocm-note" style="margin:0">cooldown remaining</div>
          </div>
        </div>`}`;
  }

  function renderWarRoomSection() {
    const el = document.getElementById('ocm-warroom');
    if (!el) return;
    const target = activeWarOpponent();
    if (!target) {
      el.innerHTML = `<div class="ocm-section-title">🎯 War Room</div>
        <div class="ocm-note">No ranked war live. The War Room lights up when one starts: enemy roster, status timers and stat estimates, refreshed every 30s while this pane is open.</div>`;
      return;
    }
    const status = String(GM_getValue(GMK.ENEMY_STATUS, ''));
    const cache = loadEnemyCache();
    if (!cache || String(cache.fid) !== String(target.opp.id) || !cache.members?.length) {
      el.innerHTML = `<div class="ocm-section-title">🎯 War Room — vs ${esc(target.opp.name || '#' + target.opp.id)}</div>
        <div class="ocm-note">${status && status !== 'ok'
          ? `Couldn't read the enemy roster (<b>${esc(status)}</b>).`
          : 'Enemy roster loads within 30s while this pane is open.'}</div>`;
      return;
    }

    let view;
    try { view = JSON.parse(GM_getValue(GMK.WARROOM_VIEW, '{}')) || {}; } catch (_) { view = {}; }
    const sort = view.sort || 'ready';
    const filter = view.filter || 'all';
    const spies = loadSpyCache();
    const nowS = Math.floor(Date.now() / 1000);

    let rows = cache.members.map(m => {
      const spy = spies[m.id] || null;
      const okay = m.st.state === 'Okay';
      const hospUntil = (m.st.state === 'Hospital' || m.st.state === 'Jail') ? m.st.until : 0;
      return { ...m, spy, okay, hospUntil,
               readyIn: okay ? 0 : (hospUntil ? Math.max(0, hospUntil - nowS) : 9e9) };
    });
    if (filter === 'okay') rows = rows.filter(r => r.okay);
    if (filter === 'hosp') rows = rows.filter(r => r.st.state === 'Hospital');

    const SORTS = {
      ready: (a, b) => a.readyIn - b.readyIn || b.level - a.level,
      level: (a, b) => b.level - a.level,
      ff:    (a, b) => (Number(b.spy?.ff) || 0) - (Number(a.spy?.ff) || 0),
      la:    (a, b) => (b.la.ts || 0) - (a.la.ts || 0),
      name:  (a, b) => String(a.name).localeCompare(String(b.name)),
    };
    rows.sort(SORTS[sort] || SORTS.ready);

    const okayCount = cache.members.filter(m => m.st.state === 'Okay').length;
    const ffKey = GM_getValue(GMK.FF_KEY, '');
    const laText = ts => {
      if (!ts) return '—';
      const d = nowS - ts;
      if (d < 3600) return Math.floor(d / 60) + 'm';
      if (d < 86400) return Math.floor(d / 3600) + 'h';
      return Math.floor(d / 86400) + 'd';
    };
    const stCell = m => {
      if (m.st.state === 'Okay') return '<span style="color:var(--ocm-cpr-good);font-weight:700">Okay</span>';
      if (m.hospUntil > nowS) return `<span style="color:var(--ocm-cpr-warn)">${esc(m.st.state)}</span> <span class="ocm-time" data-until="${m.hospUntil}" style="color:var(--ocm-text-dim)">${fmtCountdown(m.hospUntil)}</span>`;
      return `<span style="color:var(--ocm-text-muted)">${esc(m.st.state || '?')}</span>`;
    };
    const chip = (key, label) => `<button class="ocm-wr-chip${filter === key ? ' active' : ''}" data-filter="${key}">${label}</button>`;
    const th = (key, label, title) => `<th data-sort="${key}" title="${title}" style="cursor:pointer">${label}${sort === key ? ' ▾' : ''}</th>`;

    el.innerHTML = `
      <div class="ocm-section-title">🎯 War Room — vs ${esc(cache.name || '#' + cache.fid)} (${cache.members.length})</div>
      <div class="ocm-note">Advisory only: this table watches and sorts, you do the clicking. Roster refreshed ${Math.round((Date.now() - cache.at) / 1000)}s ago${ffKey ? '' : ' · add an FFScouter key in Config for FF/stat estimates'}.</div>
      <div class="ocm-flexrow" style="margin-bottom:8px">
        ${chip('all', `All ${cache.members.length}`)}${chip('okay', `🟢 Okay ${okayCount}`)}${chip('hosp', '🏥 Hospital')}
      </div>
      <table class="ocm-pay-table" id="ocm-wr-table">
        <thead><tr>
          ${th('name', 'Member', 'Sort by name')}
          ${th('level', 'Lvl', 'Sort by level')}
          ${th('ready', 'Status', 'Sort by who is attackable soonest')}
          ${th('la', 'Last action', 'Sort by most recently active')}
          ${th('ff', 'FF', 'FFScouter fair-fight estimate — higher pays more respect but is harder')}
          <th title="FFScouter battle-stat estimate">Stats</th>
          <th></th>
        </tr></thead>
        <tbody>${rows.map(m => `<tr>
          <td><a href="/profiles.php?XID=${esc(m.id)}" target="_blank">${esc(m.name || '#' + m.id)}</a></td>
          <td style="text-align:right;color:var(--ocm-text-dim)">${m.level || '—'}</td>
          <td>${stCell(m)}</td>
          <td style="color:${(nowS - m.la.ts) < 900 ? 'var(--ocm-cpr-warn)' : 'var(--ocm-text-dim)'}">${laText(m.la.ts)}</td>
          <td style="text-align:right;color:var(--ocm-link)">${m.spy?.ff != null ? Number(m.spy.ff).toFixed(2) : '—'}</td>
          <td style="text-align:right;color:var(--ocm-text-dim)" title="${m.spy ? 'FFScouter estimate' : 'no estimate'}">${m.spy?.bs != null ? esc(String(m.spy.bs)) : '—'}</td>
          <td><a href="/loader.php?sid=attack&user2ID=${esc(m.id)}" target="_blank" title="Open the attack page (nothing is automated)">⚔</a></td>
        </tr>`).join('')}</tbody>
      </table>
      <div class="ocm-note" style="margin-top:8px">FF/Stats are third-party estimates (FFScouter), cached 24h — provenance, not fact. "Last action" under 15 min is highlighted: they may be online.</div>`;

    const setView = (patch) => {
      GM_setValue(GMK.WARROOM_VIEW, JSON.stringify({ sort, filter, ...patch }));
      renderWarRoomSection();
    };
    el.querySelectorAll('.ocm-wr-chip').forEach(b =>
      b.addEventListener('click', () => setView({ filter: b.dataset.filter })));
    el.querySelectorAll('#ocm-wr-table th[data-sort]').forEach(h =>
      h.addEventListener('click', () => setView({ sort: h.dataset.sort })));
  }

  let _attackBackfillRunning = false;
  let _warRepFetching = false;

  function renderWarHistorySection() {
    const el = document.getElementById('ocm-war-history');
    if (!el) return;
    const openKeys = openDetailKeys(el);
    const firstRender = !el.__ocmDetailsInit;
    el.__ocmDetailsInit = true;
    const warStatus = String(GM_getValue(GMK.WAR_STATUS, ''));
    const atkStatus = String(GM_getValue(GMK.ATTACK_STATUS, ''));
    const myFid = String(GM_getValue(GMK.MY_FACTION_ID, '') || '');
    const arc = loadWarArchive();
    const led = loadAttackLedger();
    const now = Math.floor(Date.now() / 1000);
    const wars = Object.entries(arc).map(([id, w]) => ({ id, ...w }))
      .sort((a, b) => (b.start || 0) - (a.start || 0));

    const aaHint = (st) => `Couldn't read this from the API (<b>${esc(st)}</b>). War data needs a key whose holder has faction API access (AA).`;

    if (!wars.length) {
      el.innerHTML = `<div class="ocm-section-title">⚔️ Ranked Wars</div>
        <div class="ocm-note">${warStatus && warStatus !== 'ok'
          ? aaHint(warStatus)
          : 'No ranked wars seen yet. Wars archive themselves automatically from the moment the suite first sees them (Torn only exposes recent wars, so history builds forward).'}</div>`;
      return;
    }

    // Ledger coverage + war record KPIs
    const ledTs = Object.values(led).map(s => s.ts).filter(Boolean);
    const ended = wars.filter(w => w.end && w.end <= now);
    const wins  = ended.filter(w => String(w.winner ?? '') === myFid).length;
    const active = wars.find(w => (w.start || 0) <= now && (!w.end || w.end > now)) || null;
    const kpis = `<div class="ocm-kpis">`
      + kpiTile('Wars tracked', wars.length, active ? 'one is LIVE now' : 'archived forever', active ? 'var(--ocm-cpr-warn)' : 'var(--ocm-link)')
      + kpiTile('Record', `${wins}–${ended.length - wins}`, 'wins–losses (tracked wars)', wins * 2 >= ended.length ? 'var(--ocm-cpr-good)' : 'var(--ocm-cpr-crit)')
      + kpiTile('Attacks in ledger', ledTs.length.toLocaleString(),
                ledTs.length ? `${dateStr(Math.min(...ledTs))} → ${dateStr(Math.max(...ledTs))}` : 'run a backfill to fill history',
                'var(--ocm-text)')
      + `</div>`;

    const statusNote = (atkStatus && atkStatus !== 'ok')
      ? `<div class="ocm-note" style="color:var(--ocm-cpr-warn)">⚠ Attack log unreadable: ${esc(atkStatus)} — per-member "obs" numbers below will be empty. ${aaHint(atkStatus)}</div>`
      : '';

    const fmtAge = ts => ts ? dateStr(ts) : '';
    // Per-card deep-report controls: fetch (or refresh) the full attack walk
    // for THIS war. Works for any archived war, however old — it reads the
    // war's own time window, not the 180-day ledger.
    const deepControls = (war, id) => `
      <div class="ocm-flexrow" style="margin-top:8px">
        <button class="ocm-join-btn ocm-war-fetchrep" data-war="${esc(id)}" style="padding:4px 10px;font-size:11px">
          ${war.obsReport ? `⟳ Refetch detailed report` : '⟲ Fetch detailed report'}</button>
        <span class="ocm-note ocm-war-fetchrep-st" style="margin:0">${war.obsReport
          ? `fetched ${fmtAge(war.obsReport.at)} · ${war.obsReport.scanned.toLocaleString()} attacks scanned${war.obsReport.partial ? ' · ⚠ partial' : ''}`
          : 'walks every attack in this war\'s window (~1.5s per 100 attacks)'}</span>
      </div>`;

    // Rich table when a deep report exists: offensive AND defensive breakdown,
    // merged with the official score where the war report is in.
    const deepTable = (war) => {
      const rep = war.report?.factions?.find(f => String(f.id) === myFid) || null;
      const offOf = uid => (rep?.members || []).find(m => m.id === uid) || null;
      const fmt1 = v => (Math.round(v * 10) / 10).toLocaleString();
      // Totals row — the numbers a leader quotes: our hits, our losses, and
      // how many times the enemy hit US (the war bonus confirms these even
      // when stealthed; likely-stealth incoming is counted separately).
      const tot = war.obsReport.rows.reduce((t, r) => {
        t.wins += r.wins; t.offLost += r.offLost; t.stale += r.stale; t.assists += r.assists;
        t.lossAll += r.lossAll; t.lossEnemy += r.lossEnemy;
        t.enemyOn += r.enemyOn; t.stealthOn += r.stealthOn; t.def += r.defHeld;
        return t;
      }, { wins: 0, offLost: 0, stale: 0, assists: 0, lossAll: 0, lossEnemy: 0, enemyOn: 0, stealthOn: 0, def: 0 });
      // 11 columns over-constrain a fixed-layout table inside Torn's content
      // column — the auto Member column collapsed to nothing. Pin Member's
      // width and let the whole table scroll horizontally when space runs out.
      return `<div style="overflow-x:auto"><table class="ocm-pay-table ocm-war-deep" style="min-width:830px">
        <thead><tr>
          <th style="width:130px">Member</th>
          <th style="width:58px;text-align:right" title="Torn's official war report — respect scored">Score</th>
          <th style="width:44px;text-align:right" title="Successful hits on the enemy">Wins</th>
          <th style="width:40px;text-align:right" title="Attacked the enemy and lost">Lost</th>
          <th style="width:40px;text-align:right" title="Offensive stalemates">Stale</th>
          <th style="width:40px;text-align:right" title="Assists">Ass.</th>
          <th style="width:64px;text-align:right" title="Respect gained on offensive hits">Respect</th>
          <th style="width:54px;text-align:right" title="Times beaten by ANYONE during the war">Losses</th>
          <th style="width:60px;text-align:right" title="Of those losses, how many were to the enemy faction">vs Enemy</th>
          <th style="width:64px;text-align:right" title="Confirmed enemy attacks on this member (war bonus is definitive even when stealthed) — hover a value for likely-stealth extras">Enemy hits</th>
          <th style="width:54px;text-align:right" title="Incoming attacks held / repelled">Defends</th>
        </tr></thead>
        <tbody>${war.obsReport.rows.map(r => {
          const off = offOf(r.uid);
          return `<tr>
            <td><a href="/profiles.php?XID=${esc(r.uid)}" target="_blank">${esc(off?.name || r.name)}</a></td>
            <td style="text-align:right;font-weight:700;color:var(--ocm-link)">${off ? fmt1(off.score) : '—'}</td>
            <td style="text-align:right;font-weight:700">${r.wins || '—'}</td>
            <td style="text-align:right;color:${r.offLost ? 'var(--ocm-cpr-warn)' : 'var(--ocm-text-muted)'}">${r.offLost || '—'}</td>
            <td style="text-align:right;color:var(--ocm-text-dim)">${r.stale || '—'}</td>
            <td style="text-align:right;color:var(--ocm-text-dim)">${r.assists || '—'}</td>
            <td style="text-align:right;color:var(--ocm-cpr-good)">${fmt1(r.respect)}</td>
            <td style="text-align:right;color:${r.lossAll ? 'var(--ocm-cpr-crit)' : 'var(--ocm-text-muted)'}">${r.lossAll || '—'}</td>
            <td style="text-align:right;color:${r.lossEnemy ? 'var(--ocm-cpr-crit)' : 'var(--ocm-text-muted)'}">${r.lossEnemy || '—'}</td>
            <td style="text-align:right;color:${r.enemyOn ? 'var(--ocm-cpr-warn)' : 'var(--ocm-text-muted)'}"${r.stealthOn ? ` title="+${r.stealthOn} stealthed incoming (likely enemy, not confirmed)"` : ''}>${r.enemyOn || '—'}${r.stealthOn ? '<span style="color:var(--ocm-text-faint)">*</span>' : ''}</td>
            <td style="text-align:right;color:${r.defHeld ? 'var(--ocm-cpr-good)' : 'var(--ocm-text-muted)'}">${r.defHeld || '—'}</td>
          </tr>`;
        }).join('')}
        <tr style="border-top:2px solid var(--ocm-border)">
          <td style="color:var(--ocm-text);font-weight:700">Total (${war.obsReport.rows.length})</td>
          <td style="text-align:right;font-weight:700;color:var(--ocm-link)">${rep ? fmt1(rep.score) : '—'}</td>
          <td style="text-align:right;font-weight:700">${tot.wins.toLocaleString()}</td>
          <td style="text-align:right;color:var(--ocm-text-dim)">${tot.offLost.toLocaleString()}</td>
          <td style="text-align:right;color:var(--ocm-text-dim)">${tot.stale.toLocaleString()}</td>
          <td style="text-align:right;color:var(--ocm-text-dim)">${tot.assists.toLocaleString()}</td>
          <td style="text-align:right;font-weight:700;color:var(--ocm-cpr-good)">${fmt1(war.obsReport.totalRespect)}</td>
          <td style="text-align:right;font-weight:700;color:var(--ocm-cpr-crit)">${tot.lossAll.toLocaleString()}</td>
          <td style="text-align:right;font-weight:700;color:var(--ocm-cpr-crit)">${tot.lossEnemy.toLocaleString()}</td>
          <td style="text-align:right;font-weight:700;color:var(--ocm-cpr-warn)" title="+${tot.stealthOn.toLocaleString()} stealthed incoming (likely enemy)">${tot.enemyOn.toLocaleString()}</td>
          <td style="text-align:right;font-weight:700;color:var(--ocm-cpr-good)">${tot.def.toLocaleString()}</td>
        </tr></tbody></table></div>
        <div class="ocm-note" style="margin-top:6px">From a full walk of this war's attack log (${war.obsReport.scanned.toLocaleString()} attacks${war.obsReport.partial ? ', ⚠ partial — a page failed, refetch to fill in' : ''}). War hits <b>${war.obsReport.totalHits.toLocaleString()}</b> · our losses <b>${tot.lossAll.toLocaleString()}</b> (${tot.lossEnemy.toLocaleString()} to the enemy) · enemy hits on us <b>${tot.enemyOn.toLocaleString()}</b>${tot.stealthOn ? ` (+${tot.stealthOn.toLocaleString()} likely-stealth*)` : ''}. Score is Torn's official report where available.</div>`;
    };

    const memberTable = (war) => {
      if (war.obsReport?.rows?.length) return deepTable(war);
      const obs = computeWarStats(led, war);
      const rep = war.report?.factions?.find(f => String(f.id) === myFid) || null;
      const uids = [...new Set([...(rep?.members || []).map(m => m.id), ...Object.keys(obs)])];
      if (!uids.length) return '<div class="ocm-note">No per-member data yet — the official report lands when the war ends; observed numbers need the attack ledger (or fetch the detailed report below).</div>';
      const rows = uids.map(uid => {
        const o = obs[uid] || {};
        const r = (rep?.members || []).find(m => m.id === uid) || null;
        return {
          uid,
          name: r?.name || o.name || warMemberName(uid) || ('#' + uid),
          offScore: r ? r.score : null, offAtt: r ? r.attacks : null,
          warHits: o.warHits || 0, hits: o.hits || 0, assists: o.assists || 0,
          losses: o.losses || 0, defends: o.defends || 0,
          resp: o.respect || 0, respLost: o.respectLost || 0,
          ff: o.ffN ? o.ffSum / o.ffN : null,
        };
      }).sort((a, b) => (b.offScore ?? b.resp) - (a.offScore ?? a.resp));
      const fmt1 = v => (Math.round(v * 10) / 10).toLocaleString();
      return `<table class="ocm-pay-table">
        <thead><tr>
          <th style="width:auto">Member</th>
          <th style="width:64px;text-align:right" title="Torn's official war report — respect scored in this war">Score</th>
          <th style="width:48px;text-align:right" title="Torn's official war report — war hits">Hits</th>
          <th style="width:56px;text-align:right" title="Observed from the attack ledger: hits with the war modifier">Obs war</th>
          <th style="width:48px;text-align:right" title="Observed: all successful outgoing hits vs this opponent in the window">All</th>
          <th style="width:48px;text-align:right" title="Observed assists">Ass.</th>
          <th style="width:52px;text-align:right" title="Times this member was beaten by the enemy">Losses</th>
          <th style="width:72px;text-align:right" title="Observed respect gained − lost">Respect ±</th>
          <th style="width:48px;text-align:right" title="Average fair-fight modifier on their hits">FF</th>
        </tr></thead>
        <tbody>${rows.map(r => `<tr>
          <td><a href="/profiles.php?XID=${esc(r.uid)}" target="_blank">${esc(r.name)}</a></td>
          <td style="text-align:right;font-weight:700;color:var(--ocm-link)">${r.offScore != null ? fmt1(r.offScore) : '—'}</td>
          <td style="text-align:right;color:var(--ocm-text-dim)">${r.offAtt != null ? r.offAtt : '—'}</td>
          <td style="text-align:right">${r.warHits || '—'}</td>
          <td style="text-align:right;color:var(--ocm-text-dim)">${r.hits || '—'}</td>
          <td style="text-align:right;color:var(--ocm-text-dim)">${r.assists || '—'}</td>
          <td style="text-align:right;color:${r.losses ? 'var(--ocm-cpr-crit)' : 'var(--ocm-text-muted)'}">${r.losses || '—'}</td>
          <td style="text-align:right;color:${(r.resp - r.respLost) >= 0 ? 'var(--ocm-cpr-good)' : 'var(--ocm-cpr-crit)'}">${fmt1(r.resp - r.respLost)}</td>
          <td style="text-align:right;color:var(--ocm-text-dim)">${r.ff != null ? r.ff.toFixed(2) : '—'}</td>
        </tr>`).join('')}</tbody></table>
        <div class="ocm-note" style="margin-top:6px">Score/Hits = Torn's official report (exact). Obs columns are computed from the attack ledger — attacks vs this opponent inside the war window — and depend on ledger coverage. Members who left the faction keep the name recorded on their attacks.</div>`;
    };

    const cards = wars.map(w => {
      const us  = (w.factions || []).find(f => String(f.id) === myFid) || {};
      const opp = (w.factions || []).find(f => String(f.id) !== myFid) || {};
      const live = (w.start || 0) <= now && (!w.end || w.end > now);
      const won  = w.end && String(w.winner ?? '') === myFid;
      const badge = live ? '<span style="color:var(--ocm-cpr-warn);font-weight:700">● LIVE</span>'
                  : (w.end ? (won ? '<span style="color:var(--ocm-cpr-good);font-weight:700">WON</span>'
                                  : '<span style="color:var(--ocm-cpr-crit);font-weight:700">LOST</span>')
                           : '<span style="color:var(--ocm-text-muted)">scheduled</span>');
      return `<details class="ocm-war-card" data-key="war-${esc(String(w.id))}"${live && firstRender ? ' open' : ''}>
        <summary>
          <span style="font-weight:700;color:var(--ocm-text)">vs ${esc(opp.name || ('#' + (opp.id || '?')))}</span>
          <span style="color:var(--ocm-text-muted)">${dateStr(w.start)}${w.end ? ' – ' + dateStr(w.end) : ''}</span>
          <span style="margin-left:auto;font-variant-numeric:tabular-nums">
            <b style="color:var(--ocm-link)">${(us.score ?? 0).toLocaleString()}</b>
            <span style="color:var(--ocm-text-muted)"> : </span>
            <b style="color:var(--ocm-text-dim)">${(opp.score ?? 0).toLocaleString()}</b>
            <span style="color:var(--ocm-text-muted)"> / ${(w.target || 0).toLocaleString()}</span>
          </span>
          ${badge}
        </summary>
        <div class="ocm-war-card-body">${memberTable(w)}${deepControls(w, w.id)}</div>
      </details>`;
    }).join('');

    el.innerHTML = `
      <div class="ocm-section-title">⚔️ Ranked Wars (${wars.length})</div>
      ${kpis}${statusNote}
      <div class="ocm-flexrow" style="margin-bottom:10px">
        <button id="ocm-war-loadhist" class="ocm-join-btn" style="padding:5px 12px;font-size:11px" title="One call — pulls every ranked war this faction has ever fought into the archive">📜 Load full war history</button>
        <button id="ocm-war-backfill" class="ocm-join-btn" style="padding:5px 12px;font-size:11px">⟲ Backfill attack history (90d)</button>
        <span id="ocm-war-backfill-status" class="ocm-note" style="margin:0"></span>
      </div>
      ${cards}`;
    restoreOpenDetails(el, openKeys);

    el.querySelector('#ocm-war-loadhist')?.addEventListener('click', async () => {
      const apiKey = GM_getValue(GMK.API_KEY, '');
      if (!apiKey) { ocmToast('Save an API key in Config first', 'warn'); return; }
      const st = el.querySelector('#ocm-war-backfill-status');
      if (st) st.textContent = 'Loading full war history…';
      try {
        const res = await fetchFullWarHistory(apiKey);
        ocmToast(`War history loaded — ${res.total} wars (${res.added} new). Official reports fill in over the next few refreshes.`, 'ok');
        renderWarSections();
      } catch (e) {
        if (st) st.textContent = `⚠ ${e.message}`;
      }
    });

    // Deep per-war report fetch (any archived war, however old).
    el.querySelectorAll('.ocm-war-fetchrep').forEach(btn => btn.addEventListener('click', async (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      if (_warRepFetching) { ocmToast('A report fetch is already running', 'warn'); return; }
      const apiKey = GM_getValue(GMK.API_KEY, '');
      if (!apiKey) { ocmToast('Save an API key in Config first', 'warn'); return; }
      _warRepFetching = true;
      const st = btn.parentElement?.querySelector('.ocm-war-fetchrep-st');
      btn.disabled = true;
      try {
        await fetchWarObsReport(apiKey, btn.dataset.war, (n, page) => {
          if (st) st.textContent = `scanning… ${n.toLocaleString()} attacks (page ${page})`;
        });
        renderWarSections();
      } catch (e) {
        if (st) st.textContent = `⚠ ${e.message}`;
        btn.disabled = false;
      } finally {
        _warRepFetching = false;
      }
    }));

    el.querySelector('#ocm-war-backfill')?.addEventListener('click', async () => {
      if (_attackBackfillRunning) return;
      const apiKey = GM_getValue(GMK.API_KEY, '');
      if (!apiKey) { ocmToast('Save an API key in Config first', 'warn'); return; }
      _attackBackfillRunning = true;
      const st = el.querySelector('#ocm-war-backfill-status');
      try {
        await backfillAttacks(apiKey, p => {
          if (!st) return;
          st.textContent = p.done
            ? `Done — ${p.total.toLocaleString()} attacks archived (${p.added} new, ${p.calls} calls${p.gaps?.length ? ', ' + p.gaps.length + ' gaps' : ''})`
            : (p.error ? `⚠ ${p.error}` : `Fetching… ${p.total?.toLocaleString() ?? ''} rows, back to ${p.oldest ? p.oldest.toISOString().slice(0, 10) : '…'}`);
        });
        renderWarSections();
      } finally { _attackBackfillRunning = false; }
    });
  }

  const LOAN_VERB_META = {
    loaned:    ['🤝', 'var(--ocm-link)'],
    gave:      ['🎁', 'var(--ocm-link)'],
    returned:  ['↩', 'var(--ocm-cpr-good)'],
    retrieved: ['↩', 'var(--ocm-cpr-good)'],
    deposited: ['📥', 'var(--ocm-cpr-good)'],
    took:      ['📤', 'var(--ocm-cpr-warn)'],
    used:      ['💊', 'var(--ocm-cpr-warn)'],
    filled:    ['🩸', 'var(--ocm-text-dim)'],
    opened:    ['📦', 'var(--ocm-text-dim)'],
    other:     ['·',  'var(--ocm-text-muted)'],
  };

  function renderLoanLogSection() {
    const el = document.getElementById('ocm-armoury-loanlog');
    if (!el) return;
    const openKeys = openDetailKeys(el);
    const status = String(GM_getValue(GMK.LOAN_STATUS, ''));
    const led = loadLoanLedger();
    const all = Object.values(led).sort((a, b) => b.ts - a.ts);
    if (!all.length) {
      el.innerHTML = `<div class="ocm-section-title">📜 Loan History</div>
        <div class="ocm-note">${status && status !== 'ok'
          ? `Couldn't read the armoury news (<b>${esc(status)}</b>) — needs a key with faction API access (AA).`
          : 'No armoury events recorded yet — history builds forward from the first sync (Torn only exposes recent news).'}</div>`;
      return;
    }
    let view;
    try { view = JSON.parse(GM_getValue(GMK.LOANLOG_VIEW, '{}')) || {}; } catch (_) { view = {}; }
    // v4.8 renamed the 'uses' chip to the aggregated 'usage' view — migrate a saved choice.
    const filter = view.filter === 'uses' ? 'usage' : (view.filter || 'all');
    const idMap = loadItemIdMap();
    const nameOf = (uid, explicit) => explicit || (uid ? (warMemberName(uid) || '#' + uid) : '?');
    const imgOf = (name) => {
      const id = idMap[String(name || '').toLowerCase()];
      return id ? `<img src="${itemImgUrl(id)}" alt="" loading="lazy" style="height:18px;width:auto;vertical-align:-4px;margin-right:5px" onerror="this.remove()">` : '';
    };
    // Fill the name->id image map lazily (one v1 call, cached forever).
    const allNames = [...new Set(all.map(e => e.item).filter(Boolean))];
    if (allNames.some(n => idMap[n.toLowerCase()] == null)) {
      const apiKey = GM_getValue(GMK.API_KEY, '');
      if (apiKey) ensureItemIdMap(apiKey, allNames).then(got => { if (got) renderLoanLogSection(); }).catch(() => {});
    }

    const chip = (k, label) => `<button class="ocm-wr-chip${filter === k ? ' active' : ''}" data-filter="${k}">${label}</button>`;
    const chips = `<div class="ocm-flexrow" style="margin-bottom:10px">
        ${chip('all', 'All')}${chip('loans', '🤝 Loans')}${chip('usage', '💊 Usage')}${chip('deposits', '📥 Deposits')}
      </div>`;

    let body;
    if (filter === 'usage') {
      // ── CONSUMABLES BREAKDOWN. The raw feed is one line per pill/bottle —
      //    unreadable spam. Fold it into per-item cards with per-member counts.
      const usage = buildUsageStats(led);
      if (!usage.length) {
        body = '<div class="ocm-note">No consumable use recorded yet — "used one of the faction\'s…" events fold in here as the armoury news syncs.</div>';
      } else {
        const sum = k => usage.reduce((s, u) => s + u[k], 0);
        const byUser = {};
        for (const it of usage) for (const u of it.users) {
          const k = u.uid || u.name || '?';
          const b = byUser[k] || (byUser[k] = { name: nameOf(u.uid, u.name), all: 0, d30: 0 });
          b.all += u.all; b.d30 += u.d30;
        }
        const top = Object.values(byUser).sort((a, b) => b.d30 - a.d30 || b.all - a.all)[0];
        const kpis = `<div class="ocm-kpis">`
          + kpiTile('Consumables', usage.length, 'distinct items used', 'var(--ocm-link)')
          + kpiTile('Used · 24h', sum('d1').toLocaleString(), `${sum('d7').toLocaleString()} in the last 7 days`, sum('d1') ? 'var(--ocm-cpr-warn)' : 'var(--ocm-text)')
          + kpiTile('Used · 30d', sum('d30').toLocaleString(), `${sum('total').toLocaleString()} all tracked`, 'var(--ocm-text)')
          + kpiTile('Top user · 30d', top ? esc(top.name) : '—', top ? `${top.d30.toLocaleString()} uses in 30 days` : '', 'var(--ocm-cpr-good)')
          + `</div>`;

        const pill = (label, v, hot) => `<span class="ocm-use-pill">${label} <b${hot ? ' style="color:var(--ocm-cpr-warn)"' : ''}>${v.toLocaleString()}</b></span>`;
        const cards = usage.map(it => {
          const id = idMap[it.name.toLowerCase()];
          const img = id
            ? `<span class="ocm-use-img"><img src="${itemImgUrl(id)}" alt="" loading="lazy" onerror="this.parentNode.textContent='💊'"></span>`
            : `<span class="ocm-use-img">💊</span>`;
          const perDay = it.d30 / 30;
          return `<details class="ocm-war-card" data-key="use-${esc(it.name.toLowerCase())}">
            <summary>
              ${img}
              <span style="font-weight:700;color:var(--ocm-text)">${esc(it.name)}</span>
              <span style="color:var(--ocm-text-muted);font-size:11px">${it.users.length} member${it.users.length === 1 ? '' : 's'}</span>
              <span style="margin-left:auto;display:flex;gap:5px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
                ${pill('24h', it.d1, it.d1 > 0)}${pill('7d', it.d7)}${pill('30d', it.d30)}${pill('all', it.total)}
              </span>
            </summary>
            <div class="ocm-war-card-body">
              <table class="ocm-pay-table">
                <thead><tr>
                  <th style="width:auto">Member</th>
                  <th style="width:52px;text-align:right">24h</th>
                  <th style="width:52px;text-align:right">7d</th>
                  <th style="width:52px;text-align:right">30d</th>
                  <th style="width:56px;text-align:right">All</th>
                  <th style="width:64px;text-align:right" title="Average per day over the last 30 days">/day</th>
                  <th style="width:72px;text-align:right">Last</th>
                </tr></thead>
                <tbody>${it.users.map(u => `<tr>
                  <td>${u.uid ? `<a href="/profiles.php?XID=${esc(u.uid)}" target="_blank">${esc(nameOf(u.uid, u.name))}</a>` : esc(u.name || '?')}</td>
                  <td style="text-align:right;color:${u.d1 ? 'var(--ocm-cpr-warn)' : 'var(--ocm-text-muted)'};font-weight:${u.d1 ? 700 : 400}">${u.d1 || '—'}</td>
                  <td style="text-align:right;color:var(--ocm-text-dim)">${u.d7 || '—'}</td>
                  <td style="text-align:right;color:var(--ocm-text-dim)">${u.d30 || '—'}</td>
                  <td style="text-align:right;font-weight:700">${u.all.toLocaleString()}</td>
                  <td style="text-align:right;color:var(--ocm-text-dim)">${u.d30 ? (u.d30 / 30).toFixed(1) : '—'}</td>
                  <td style="text-align:right;color:var(--ocm-text-muted)">${dateStr(u.last)}</td>
                </tr>`).join('')}</tbody>
              </table>
              <div class="ocm-note" style="margin-top:6px">${perDay >= 0.1
                ? `The faction burns ~<b>${perDay.toFixed(1)}</b> of these per day (30-day average).`
                : 'Barely used this month.'}</div>
            </div>
          </details>`;
        }).join('');
        body = kpis
          + `<div class="ocm-note">Every "used one of the faction's…" news line, folded into per-member counts. Windows are rolling — last 24 hours / 7 days / 30 days — and <b>all</b> covers everything tracked since the first sync. Click an item to expand its member breakdown.</div>`
          + cards;
      }
    } else {
      // ── EVENT LOG. Uses live in their own breakdown now — the raw feed was
      //    90% "used one of the faction's Xanax items" lines burying the loans.
      const GROUPS = { loans: ['loaned', 'gave', 'returned', 'retrieved'], deposits: ['deposited'] };
      const rows = (filter === 'all' ? all.filter(e => e.verb !== 'used')
                                     : all.filter(e => (GROUPS[filter] || []).includes(e.verb))).slice(0, 200);
      const byActor = {};
      for (const e of all) { if (e.aid && e.verb !== 'used') byActor[e.aid] = (byActor[e.aid] || 0) + 1; }
      const top = Object.entries(byActor).sort((a, b) => b[1] - a[1])[0];
      const topName = top ? nameOf(top[0], all.find(e => e.aid === top[0])?.an) : null;
      body = `<div class="ocm-kpis">
        ${kpiTile('Events tracked', all.length.toLocaleString(), `${dateStr(all[all.length - 1].ts)} → ${dateStr(all[0].ts)}`, 'var(--ocm-link)')}
        ${kpiTile('Most active', topName ? esc(topName) : '—', top ? top[1] + ' armoury actions (excl. uses)' : '', 'var(--ocm-text)')}
      </div>
      <div class="ocm-note">Parsed from the faction armoury news. Consumable "used" lines live under <b>💊 Usage</b> so they don't bury the loans. Unrecognised phrasings keep their raw text rather than being dropped.</div>
      ${rows.length ? `<table class="ocm-pay-table">
        <thead><tr>
          <th style="width:88px">When</th>
          <th style="width:auto">Member</th>
          <th style="width:82px">Action</th>
          <th style="width:auto">Item</th>
          <th style="width:auto">To / from</th>
        </tr></thead>
        <tbody>${rows.map(e => {
          const [icon, col] = LOAN_VERB_META[e.verb] || LOAN_VERB_META.other;
          return `<tr title="${esc(e.raw || '')}">
            <td style="color:var(--ocm-text-muted);white-space:nowrap">${dateStr(e.ts)}</td>
            <td>${e.aid ? `<a href="/profiles.php?XID=${esc(e.aid)}" target="_blank">${esc(nameOf(e.aid, e.an))}</a>` : '<span style="color:var(--ocm-text-muted)">?</span>'}</td>
            <td style="color:${col}">${icon} ${esc(e.verb)}</td>
            <td>${e.item ? `${imgOf(e.item)}${e.qty > 1 ? e.qty + '× ' : ''}${esc(e.item)}` : `<span style="color:var(--ocm-text-muted)">${esc((e.raw || '').slice(0, 60))}</span>`}</td>
            <td>${e.oid ? `<a href="/profiles.php?XID=${esc(e.oid)}" target="_blank">${esc(nameOf(e.oid, e.on))}</a>` : '<span style="color:var(--ocm-text-muted)">—</span>'}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>` : '<div class="ocm-note">Nothing in this view yet.</div>'}
      ${rows.length >= 200 ? `<div class="ocm-note" style="margin-top:6px">Showing the newest 200 — use the export builder for the full ledger.</div>` : ''}`;
    }

    el.innerHTML = `<div class="ocm-section-title">📜 Loan History (${all.length})</div>${chips}${body}`;
    restoreOpenDetails(el, openKeys);

    el.querySelectorAll('.ocm-wr-chip').forEach(b => b.addEventListener('click', () => {
      GM_setValue(GMK.LOANLOG_VIEW, JSON.stringify({ filter: b.dataset.filter }));
      renderLoanLogSection();
    }));
  }

  /**
   * MONEY > FUNDS (v5.0) — the faction funds log, both directions. Deposits
   * (money IN, cat=depositFunds) beside gives (money OUT, the store the payout
   * matcher already keeps). Per-member 30d/all-time flow plus the recent feed.
   * OC income itself lives under Summary/Faction Earnings — this pane is the
   * bank ledger.
   */
  function renderFundsSection() {
    const el = document.getElementById('ocm-money-funds');
    if (!el) return;
    const deposits = Object.values(loadDepositEvents());
    const gives = Object.values(loadPayoutEvents());
    const depStatus = String(GM_getValue(GMK.DEPOSIT_STATUS, ''));
    if (!deposits.length && !gives.length) {
      el.innerHTML = `<div class="ocm-section-title">🏦 Faction Funds</div>
        <div class="ocm-note">${depStatus && depStatus !== 'ok'
          ? `Couldn't read the funds log (<b>${esc(depStatus)}</b>) — needs a key with faction API access (AA).`
          : 'No funds events recorded yet — the log builds forward from the first sync (Torn only exposes recent news).'}</div>`;
      return;
    }

    const nowS = Math.floor(Date.now() / 1000);
    const D30 = 30 * 86400;
    const nameFor = (uid, explicit) => explicit || (uid ? (warMemberName(uid) || '#' + uid) : '?');

    const members = {};
    const rowOf = (uid, name) => {
      const k = String(uid || name || '?');
      const r = members[k] || (members[k] = { uid: uid ? String(uid) : null, name: nameFor(uid, name),
        dep30: 0, depAll: 0, recv30: 0, recvAll: 0, last: 0 });
      if (name && r.name.startsWith('#')) r.name = name;
      return r;
    };
    let dep30 = 0, depAll = 0, out30 = 0, outAll = 0;
    for (const d of deposits) {
      const r = rowOf(d.uid, d.name);
      r.depAll += d.amount; depAll += d.amount;
      if (nowS - d.ts <= D30) { r.dep30 += d.amount; dep30 += d.amount; }
      r.last = Math.max(r.last, d.ts);
    }
    for (const g of gives) {
      const r = rowOf(g.toId, g.toName);
      r.recvAll += g.amount; outAll += g.amount;
      if (nowS - g.ts <= D30) { r.recv30 += g.amount; out30 += g.amount; }
      r.last = Math.max(r.last, g.ts);
    }
    const rows = Object.values(members).sort((a, b) => (b.dep30 + b.recv30) - (a.dep30 + a.recv30) || (b.depAll + b.recvAll) - (a.depAll + a.recvAll));
    const topDep = rows.slice().sort((a, b) => b.dep30 - a.dep30)[0];

    const kpis = `<div class="ocm-kpis">`
      + kpiTile('Deposited · 30d', fmtMoney(dep30), `${fmtMoney(depAll)} all tracked`, 'var(--ocm-cpr-good)')
      + kpiTile('Given out · 30d', fmtMoney(out30), `${fmtMoney(outAll)} all tracked`, 'var(--ocm-link)')
      + kpiTile('Net flow · 30d', fmtMoney(dep30 - out30), 'deposits − gives', (dep30 - out30) >= 0 ? 'var(--ocm-cpr-good)' : 'var(--ocm-cpr-crit)')
      + kpiTile('Top depositor · 30d', topDep && topDep.dep30 ? esc(topDep.name) : '—', topDep && topDep.dep30 ? fmtMoney(topDep.dep30) : 'no deposits this month', 'var(--ocm-text)')
      + `</div>`;

    const recent = [
      ...deposits.map(d => ({ ts: d.ts, uid: d.uid, name: nameFor(d.uid, d.name), kind: 'dep', amount: d.amount })),
      ...gives.map(g => ({ ts: g.ts, uid: g.toId, name: nameFor(g.toId, g.toName), kind: 'give', amount: g.amount, from: g.fromName })),
    ].sort((a, b) => b.ts - a.ts).slice(0, 25);

    el.innerHTML = `
      <div class="ocm-section-title">🏦 Faction Funds (${(deposits.length + gives.length).toLocaleString()} events)</div>
      ${kpis}
      <div class="ocm-note">Read from the faction funds news: <b style="color:var(--ocm-cpr-good)">deposits</b> are money members put INTO the faction bank; <b style="color:var(--ocm-link)">given</b> is money leadership paid out (the same gives the Payouts matcher uses). History builds forward from the first sync. OC income lives under Summary — this is the bank ledger.</div>
      <table class="ocm-pay-table">
        <thead><tr>
          <th style="width:auto">Member</th>
          <th style="width:100px;text-align:right" title="Deposited into the faction in the last 30 days">Dep · 30d</th>
          <th style="width:100px;text-align:right">Dep · all</th>
          <th style="width:100px;text-align:right" title="Received from the faction (gives) in the last 30 days">Recv · 30d</th>
          <th style="width:100px;text-align:right">Recv · all</th>
          <th style="width:100px;text-align:right" title="Deposited − received, all tracked">Net</th>
          <th style="width:72px;text-align:right">Last</th>
        </tr></thead>
        <tbody>${rows.map(r => {
          const net = r.depAll - r.recvAll;
          return `<tr>
            <td>${r.uid ? `<a href="/profiles.php?XID=${esc(r.uid)}" target="_blank">${esc(r.name)}</a>` : esc(r.name)}</td>
            <td style="text-align:right;color:${r.dep30 ? 'var(--ocm-cpr-good)' : 'var(--ocm-text-muted)'};font-weight:${r.dep30 ? 700 : 400}">${r.dep30 ? fmtMoney(r.dep30) : '—'}</td>
            <td style="text-align:right;color:var(--ocm-text-dim)">${r.depAll ? fmtMoney(r.depAll) : '—'}</td>
            <td style="text-align:right;color:${r.recv30 ? 'var(--ocm-link)' : 'var(--ocm-text-muted)'}">${r.recv30 ? fmtMoney(r.recv30) : '—'}</td>
            <td style="text-align:right;color:var(--ocm-text-dim)">${r.recvAll ? fmtMoney(r.recvAll) : '—'}</td>
            <td style="text-align:right;font-weight:700;color:${net > 0 ? 'var(--ocm-cpr-good)' : net < 0 ? 'var(--ocm-cpr-crit)' : 'var(--ocm-text-muted)'}">${net ? fmtMoney(net) : '—'}</td>
            <td style="text-align:right;color:var(--ocm-text-muted)">${dateStr(r.last)}</td>
          </tr>`;
        }).join('')}</tbody></table>
      <div class="ocm-section-title ocm-mt" style="font-size:12px">Recent flow</div>
      <table class="ocm-pay-table">
        <thead><tr><th style="width:72px">When</th><th style="width:auto">Event</th><th style="width:110px;text-align:right">Amount</th></tr></thead>
        <tbody>${recent.map(e => `<tr>
          <td style="color:var(--ocm-text-muted);white-space:nowrap">${dateStr(e.ts)}</td>
          <td>${e.kind === 'dep'
            ? `<span style="color:var(--ocm-cpr-good)">📥 deposit</span> — ${e.uid ? `<a href="/profiles.php?XID=${esc(e.uid)}" target="_blank">${esc(e.name)}</a>` : esc(e.name)}`
            : `<span style="color:var(--ocm-link)">💸 give</span> — ${esc(e.from || '?')} <span style="color:var(--ocm-text-muted)">→</span> ${e.uid ? `<a href="/profiles.php?XID=${esc(e.uid)}" target="_blank">${esc(e.name)}</a>` : esc(e.name)}`}</td>
          <td style="text-align:right;font-weight:700;color:${e.kind === 'dep' ? 'var(--ocm-cpr-good)' : 'var(--ocm-link)'}">${fmtMoney(e.amount)}</td>
        </tr>`).join('')}</tbody></table>`;
  }

  /**
   * ARMOURY > MEMBERS — one profile row per member covering everything of the
   * faction's they touch: weapons and armour fielded (slot-classified chips
   * with Torn item art), OC items held, consumable burn, and a FLAGGED column
   * for doubled-up slots (two Primaries / two Helmets = one is idle faction
   * property). Rows expand into the member's full profile: per-item usage
   * across 24h / 7d / 30d / all, plus the OC items they're holding.
   */
  function renderArmouryMembersSection() {
    const el = document.getElementById('ocm-armoury-members');
    if (!el) return;
    const openKeys = openDetailKeys(el);
    const gear = loadGearCache();
    const gearStatus = String(GM_getValue(GMK.GEAR_STATUS, ''));
    const usage = buildUsageStats(loadLoanLedger());
    const profiles = buildMemberArmouryProfiles(gear?.items, usage);

    if (!profiles.length) {
      el.innerHTML = `<div class="ocm-section-title">👤 Armoury Members</div>
        <div class="ocm-note">${gearStatus && gearStatus !== 'ok'
          ? `Couldn't read the armoury (<b>${esc(gearStatus)}</b>) — needs a key with faction API access (AA).`
          : 'Nobody is holding faction gear and no consumable use is recorded yet — profiles build here as the data syncs.'}</div>`;
      return;
    }

    const idMap = loadItemIdMap();
    const nameOf = m => m.name || warMemberName(m.uid) || ('#' + m.uid);
    const chipOf = e => `<span class="ocm-gp-chip gp-${e.slot.key}" title="${esc(e.type || e.slot.label)}${e.name ? ' — ' + esc(e.name) : ''}">
        <i>${e.slot.letter}</i>${e.id ? `<img src="${itemImgUrl(e.id)}" alt="" loading="lazy" onerror="this.remove()">` : ''}${esc(e.name || '#' + e.id)}</span>`;
    const chips = list => list.length
      ? list.slice().sort((a, b) => a.slot.label.localeCompare(b.slot.label)).map(chipOf).join('')
      : '<span style="color:var(--ocm-text-faint)">—</span>';
    // Compact tiles for the main table — image + slot-coloured edge, details on
    // hover. The named chips stay in the legend and the expanded profile.
    const tileOf = e => `<span class="ocm-gp-tile gp-${e.slot.key}" title="${esc(e.slot.label)}${e.name ? ' — ' + esc(e.name) : ''}">${
      e.id ? `<img src="${itemImgUrl(e.id)}" alt="" loading="lazy" onerror="this.parentNode.textContent='${e.slot.letter}'">` : `<i>${e.slot.letter}</i>`}</span>`;
    const SLOT_ORDER = ['primary', 'secondary', 'melee', 'body', 'gloves', 'helmet', 'boots', 'pants', 'item'];
    const tiles = list => list.length
      ? list.slice().sort((a, b) => SLOT_ORDER.indexOf(a.slot.key) - SLOT_ORDER.indexOf(b.slot.key)).map(tileOf).join('')
      : '<span style="color:var(--ocm-text-faint)">—</span>';

    const flagged = profiles.filter(m => m.flags.length);
    const gearOut = profiles.reduce((s, m) => s + m.weapons.length + m.armour.length, 0);
    const itemsOut = profiles.reduce((s, m) => s + m.items.length, 0);
    // One quiet stat line, not four KPI tiles — this pane is about the table.
    const statline = `<div class="ocm-note" style="margin-bottom:8px">
      <b style="color:var(--ocm-text)">${gearOut}</b> gear fielded ·
      <b style="color:var(--ocm-text)">${itemsOut}</b> OC items out ·
      <b style="color:${flagged.length ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-good)'}">${flagged.length}</b> flagged
      — hover a tile for the item, click a row for the full profile.${gear?.at ? ` Refreshed ${dateStr(gear.at)}.` : ''}</div>`;

    const legendChip = s => `<span class="ocm-gp-chip gp-${s.key}" style="cursor:default"><i>${s.letter}</i>${s.label}</span>`;
    const legend = `<div class="ocm-flexrow" style="margin-bottom:10px;gap:2px">
        <span style="font-size:10px;color:var(--ocm-text-muted);text-transform:uppercase;letter-spacing:.06em;margin-right:6px">Weapons</span>
        ${legendChip(GEAR_SLOTS.primary)}${legendChip(GEAR_SLOTS.secondary)}${legendChip(GEAR_SLOTS.melee)}
        <span style="font-size:10px;color:var(--ocm-text-muted);text-transform:uppercase;letter-spacing:.06em;margin:0 6px 0 14px">Armour</span>
        ${legendChip(GEAR_SLOTS.body)}${legendChip(GEAR_SLOTS.gloves)}${legendChip(GEAR_SLOTS.helmet)}${legendChip(GEAR_SLOTS.boots)}${legendChip(GEAR_SLOTS.pants)}
      </div>`;

    const detailOf = m => {
      const useTable = m.uses.length ? `
        <div style="font-size:10px;color:var(--ocm-text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Consumable usage</div>
        <table class="ocm-pay-table" style="margin-bottom:8px">
          <thead><tr>
            <th style="width:auto">Item</th>
            <th style="width:52px;text-align:right">24h</th>
            <th style="width:52px;text-align:right">7d</th>
            <th style="width:52px;text-align:right">30d</th>
            <th style="width:56px;text-align:right">All</th>
            <th style="width:64px;text-align:right" title="Average per day over the last 30 days">/day</th>
            <th style="width:72px;text-align:right">Last</th>
          </tr></thead>
          <tbody>${m.uses.map(u => {
            const iid = idMap[u.item.toLowerCase()];
            return `<tr>
              <td>${iid ? `<img src="${itemImgUrl(iid)}" alt="" loading="lazy" style="height:16px;width:auto;vertical-align:-3px;margin-right:5px" onerror="this.remove()">` : ''}${esc(u.item)}</td>
              <td style="text-align:right;color:${u.d1 ? 'var(--ocm-cpr-warn)' : 'var(--ocm-text-muted)'};font-weight:${u.d1 ? 700 : 400}">${u.d1 || '—'}</td>
              <td style="text-align:right;color:var(--ocm-text-dim)">${u.d7 || '—'}</td>
              <td style="text-align:right;color:var(--ocm-text-dim)">${u.d30 || '—'}</td>
              <td style="text-align:right;font-weight:700">${u.all.toLocaleString()}</td>
              <td style="text-align:right;color:var(--ocm-text-dim)">${u.d30 ? (u.d30 / 30).toFixed(1) : '—'}</td>
              <td style="text-align:right;color:var(--ocm-text-muted)">${dateStr(u.last)}</td>
            </tr>`;
          }).join('')}</tbody></table>`
        : '<div class="ocm-note" style="margin-bottom:8px">No consumable use recorded for this member.</div>';
      const itemChips = m.items.length ? `
        <div style="font-size:10px;color:var(--ocm-text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">OC items on loan</div>
        <div>${chips(m.items)}</div>` : '';
      // The main table shows tiles only — the expanded profile carries the names.
      const gearChips = (m.weapons.length + m.armour.length) ? `
        <div style="font-size:10px;color:var(--ocm-text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Gear on loan</div>
        <div style="margin-bottom:8px">${chips([...m.weapons, ...m.armour])}</div>` : '';
      return gearChips + useTable + itemChips;
    };

    const rows = profiles.map((m, i) => `
      <tr class="ocm-gp-row" data-gp="${i}" title="Click to expand ${esc(nameOf(m))}'s full armoury profile">
        <td><a href="/profiles.php?XID=${esc(m.uid)}" target="_blank" onclick="event.stopPropagation()">${esc(nameOf(m))}</a>${m.items.length ? ` <span style="color:var(--ocm-text-muted);font-size:10px" title="${m.items.length} OC item${m.items.length === 1 ? '' : 's'} on loan — expand to see them">🎒${m.items.length}</span>` : ''}</td>
        <td style="white-space:normal">${tiles([...m.weapons, ...m.armour])}</td>
        <td style="text-align:right;color:${m.use30 ? 'var(--ocm-text)' : 'var(--ocm-text-muted)'};font-weight:${m.use30 ? 700 : 400}" title="${m.use1} in the last 24h · ${m.useAll} all tracked">${m.use30 || '—'}</td>
        <td>${m.flags.length
          ? m.flags.map(f => `<span class="ocm-gp-flag" title="Holding more than one of the same slot — one is idle faction property (see Loans > Retrievable)">⚠ ${esc(f)}</span>`).join('<br>')
          : '<span style="color:var(--ocm-text-faint)">—</span>'}</td>
      </tr>
      <tr class="ocm-gp-detail" data-gp="${i}" data-key="gp-${esc(m.uid)}" data-detail="1" style="display:none"><td colspan="4" style="white-space:normal;padding:10px 12px">${detailOf(m)}</td></tr>`).join('');

    el.innerHTML = `
      <div class="ocm-section-title">👤 Armoury Members (${profiles.length})</div>
      ${statline}
      ${legend}
      <table class="ocm-pay-table ocm-gp-compact">
        <thead><tr>
          <th style="width:140px">Player</th>
          <th style="width:auto">Gear on loan</th>
          <th style="width:60px;text-align:right" title="Consumable uses in the last 30 days">💊 30d</th>
          <th style="width:110px">Flagged</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    restoreOpenDetails(el, openKeys);

    el.querySelectorAll('.ocm-gp-row').forEach(row => row.addEventListener('click', () => {
      const det = el.querySelector(`.ocm-gp-detail[data-gp="${row.dataset.gp}"]`);
      if (det) det.style.display = det.style.display === 'none' ? '' : 'none';
    }));
  }

  function renderLoadoutsSection() {
    const el = document.getElementById('ocm-armoury-loadouts');
    if (!el) return;
    const openKeys = openDetailKeys(el);
    const enabled = GM_getValue(GMK.LOADOUT_ENABLED, false);
    let self = null;
    try { self = JSON.parse(GM_getValue(GMK.LOADOUT_SELF, 'null')); } catch (_) {}
    const store2 = loadLoadoutStore();
    const others = Object.entries(store2).map(([uid, lo]) => ({ uid, ...lo })).sort((a, b) => (b.ts || 0) - (a.ts || 0));

    const itemsList = (items) => {
      const byCat = {};
      for (const it of items || []) (byCat[it.cat || 'Other'] = byCat[it.cat || 'Other'] || []).push(it);
      return Object.entries(byCat).map(([cat, its]) =>
        `<div style="margin-bottom:4px"><span style="color:var(--ocm-text-muted);font-size:10px;text-transform:uppercase">${esc(cat)}</span><br>
         ${its.map(it => it.name ? esc(it.name) : `Item #${esc(it.id)}`).join(' · ')}</div>`).join('');
    };

    // — Faction gear on loan: the loadout signal the API DOES give us. A member
    //   holding a faction Ithaca is, in practice, fielding that Ithaca.
    const gear = loadGearCache();
    const gearStatus = String(GM_getValue(GMK.GEAR_STATUS, ''));
    // The cache also carries utilities (for the Members pane) — this table is
    // strictly combat gear, so keep it to weapons and armour.
    const gearItems = (gear?.items || []).filter(g => g.cat === 'weapons' || g.cat === 'armor');
    let gearHtml;
    if (gearItems.length) {
      const byMember = {};
      for (const g of gearItems) (byMember[g.uid] = byMember[g.uid] || []).push(g);
      const memberRows = Object.entries(byMember)
        .map(([uid, items]) => ({ uid, name: warMemberName(uid) || ('#' + uid), items }))
        .sort((a, b) => b.items.length - a.items.length || String(a.name).localeCompare(String(b.name)));
      gearHtml = `
        <div class="ocm-section-title ocm-mt" style="font-size:12px">Faction gear on loan (${memberRows.length} member${memberRows.length === 1 ? '' : 's'})</div>
        <div class="ocm-note">Hover a tile for the item name — the coloured edge is the slot.${gear.at ? ` Refreshed ${dateStr(gear.at)}.` : ''}</div>
        <table class="ocm-pay-table ocm-gp-compact">
          <thead><tr>
            <th style="width:140px">Member</th>
            <th style="width:auto">Holding</th>
            <th style="width:48px;text-align:right" title="Items held">#</th>
          </tr></thead>
          <tbody>${memberRows.map(m => `<tr>
            <td><a href="/profiles.php?XID=${esc(m.uid)}" target="_blank">${esc(m.name)}</a></td>
            <td style="white-space:normal">${m.items.map(g => {
              const slot = gearSlotOf(g);
              return `<span class="ocm-gp-tile gp-${slot.key}" title="${esc(slot.label)}${g.name ? ' — ' + esc(g.name) : ''}">${g.id
                ? `<img src="${itemImgUrl(g.id)}" alt="" loading="lazy" onerror="this.parentNode.textContent='${slot.letter}'">`
                : `<i>${slot.letter}</i>`}</span>`;
            }).join('')}</td>
            <td style="text-align:right;color:var(--ocm-text-dim)">${m.items.length}</td>
          </tr>`).join('')}</tbody></table>`;
    } else {
      gearHtml = `
        <div class="ocm-section-title ocm-mt" style="font-size:12px">Faction gear on loan</div>
        <div class="ocm-note">${gearStatus && gearStatus !== 'ok'
          ? `Couldn't read the weapons/armour armoury (<b>${esc(gearStatus)}</b>) — needs a key with faction API access (AA).`
          : 'Nothing on loan right now (or the first sync hasn\'t run yet — it rides the regular data refresh).'}</div>`;
    }

    el.innerHTML = `
      <div class="ocm-section-title">🧰 Loadouts</div>
      <div class="ocm-note">The API doesn't expose other players' equipped gear — faction gear <b>on loan</b> below is the honest signal. Personal loadouts work by consent: members enable capture, open their Items page, and share the code; import it here.</div>
      ${gearHtml}

      <div class="ocm-section-title ocm-mt" style="font-size:12px">My loadout</div>
      <label style="display:flex;gap:8px;align-items:center;font-size:12px;cursor:pointer;margin-bottom:8px">
        <input type="checkbox" id="ocm-lo-enable"${enabled ? ' checked' : ''}>
        Capture my equipped gear when I open the Items page
      </label>
      ${self?.items?.length
        ? `<div class="ocm-war-card" style="padding:var(--ocm-pad-card)">
             <div class="ocm-note">Captured ${dateStr(self.ts)} — ${self.items.length} equipped item${self.items.length === 1 ? '' : 's'}</div>
             ${itemsList(self.items)}
             <button id="ocm-lo-copy" class="ocm-join-btn" style="padding:5px 12px;font-size:11px;margin-top:6px">📋 Copy Loadout Code</button>
           </div>`
        : `<div class="ocm-note">${enabled ? 'Nothing captured yet — open your Items page and it snapshots automatically.' : 'Enable capture above, then open your Items page.'}</div>`}

      <div class="ocm-section-title ocm-mt" style="font-size:12px">Faction loadouts (${others.length})</div>
      <div class="ocm-flexrow" style="margin-bottom:8px">
        <input id="ocm-lo-paste" type="text" placeholder="paste a member's loadout code" style="flex:1;min-width:200px">
        <button id="ocm-lo-import" class="ocm-join-btn" style="padding:5px 12px;font-size:11px">Import</button>
        <span id="ocm-lo-status" class="ocm-note" style="margin:0"></span>
      </div>
      ${others.length ? others.map(o => `
        <details class="ocm-war-card" data-key="lo-${esc(String(o.uid))}">
          <summary>
            <span style="font-weight:700;color:var(--ocm-text)">${o.uid && !String(o.uid).startsWith('anon') ? `<a href="/profiles.php?XID=${esc(o.uid)}" target="_blank">${esc(warMemberName(o.uid) || o.name || '#' + o.uid)}</a>` : esc(o.name || 'Unknown')}</span>
            <span style="color:var(--ocm-text-muted)">${(o.items || []).length} items · ${dateStr(o.ts)}</span>
            <button class="ocm-lo-del" data-uid="${esc(o.uid)}" style="margin-left:auto;background:none;border:1px solid var(--ocm-border);border-radius:4px;color:var(--ocm-text-muted);font-size:10px;padding:2px 8px;cursor:pointer">remove</button>
          </summary>
          <div class="ocm-war-card-body">${itemsList(o.items)}</div>
        </details>`).join('') : '<div class="ocm-note">No imported loadouts yet.</div>'}`;
    restoreOpenDetails(el, openKeys);

    el.querySelector('#ocm-lo-enable')?.addEventListener('change', e => {
      GM_setValue(GMK.LOADOUT_ENABLED, e.target.checked);
      renderLoadoutsSection();
    });
    el.querySelector('#ocm-lo-copy')?.addEventListener('click', () => {
      const code = encodeLoadout({ id: self.id, ts: self.ts, items: self.items });
      const done = () => ocmToast('Loadout code copied — paste it in faction Discord', 'ok');
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(code).then(done, () => ocmToast('Copy failed', 'warn'));
    });
    el.querySelector('#ocm-lo-import')?.addEventListener('click', () => {
      const st = el.querySelector('#ocm-lo-status');
      const lo = decodeLoadout(el.querySelector('#ocm-lo-paste')?.value || '');
      if (!lo) { if (st) { st.textContent = '✗ not a valid loadout code'; st.style.color = 'var(--ocm-cpr-crit)'; } return; }
      const s = loadLoadoutStore();
      s[String(lo.id || 'anon' + Date.now())] = { ts: lo.ts || Math.floor(Date.now() / 1000), name: lo.name || null, items: lo.items };
      saveLoadoutStore(s);
      renderLoadoutsSection();
    });
    el.querySelectorAll('.ocm-lo-del').forEach(b => b.addEventListener('click', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const s = loadLoadoutStore();
      delete s[b.dataset.uid];
      saveLoadoutStore(s);
      renderLoadoutsSection();
    }));
  }

  /** Inactivity thresholds: amber past 3 days, red past 7. */
  const INACT_WARN_S = 3 * 86400, INACT_CRIT_S = 7 * 86400;

  function renderActivitySection(memberMap) {
    const el = document.getElementById('ocm-people-activity');
    if (!el) return;
    const members = Object.entries(memberMap || {}).map(([uid, m]) => ({ uid, ...m }));
    if (!members.length) {
      el.innerHTML = `<div class="ocm-section-title">🕐 Member Activity</div>
        <div class="ocm-note">No roster loaded yet.</div>`;
      return;
    }
    const log = loadActivityLog();
    const nowS = Math.floor(Date.now() / 1000);

    const rows = members.map(m => {
      const la = Number(m.last_action?.timestamp ?? 0) || 0;
      const idle = la ? nowS - la : Infinity;
      return {
        uid: m.uid, name: m.name || ('#' + m.uid),
        la, idle,
        laRel: m.last_action?.relative || '',
        state: m.status?.state || '?', until: Number(m.status?.until ?? 0) || 0,
        desc: m.status?.description || '',
        revivable: m.is_revivable ?? m.revive_setting ?? null,
        inOc: !!m.is_in_oc, dif: m.days_in_faction ?? null,
        days: log[m.uid]?.d || {},
      };
    }).sort((a, b) => b.idle - a.idle);   // most inactive first — that's the question this pane answers

    const activeToday = rows.filter(r => r.idle < 86400).length;
    const warn = rows.filter(r => r.idle >= INACT_WARN_S && r.idle < INACT_CRIT_S).length;
    const crit = rows.filter(r => r.idle >= INACT_CRIT_S).length;
    const kpis = `<div class="ocm-kpis">`
      + kpiTile('Members', rows.length, 'on the roster', 'var(--ocm-link)')
      + kpiTile('Active today', activeToday, 'last action < 24h', 'var(--ocm-cpr-good)')
      + kpiTile('Idle 3d+', warn, 'worth a nudge', warn ? 'var(--ocm-cpr-warn)' : 'var(--ocm-text)')
      + kpiTile('Idle 7d+', crit, 'at risk', crit ? 'var(--ocm-cpr-crit)' : 'var(--ocm-text)')
      + `</div>`;

    // 14-day presence sparkline from the aggregates (plain CSS bars).
    const spark = (days) => {
      const cells = [];
      for (let i = 13; i >= 0; i--) {
        const k = utcDayKey(Date.now() - i * 86400e3);
        const d = days[k];
        const ratio = d && d.s > 0 ? d.o / d.s : (d ? 0.15 : 0);
        const h = d ? Math.max(2, Math.round(ratio * 12)) : 1;
        const c = !d ? 'var(--ocm-border)' : ratio > 0 ? 'var(--ocm-cpr-good)' : 'var(--ocm-text-faint)';
        cells.push(`<i style="height:${h}px;background:${c}" title="${k}${d ? ` — seen ${d.s}×, online ${d.o}×` : ' — no data'}"></i>`);
      }
      return `<span class="ocm-spark">${cells.join('')}</span>`;
    };

    const idleColor = (idle) => idle >= INACT_CRIT_S ? 'var(--ocm-cpr-crit)'
                            : idle >= INACT_WARN_S ? 'var(--ocm-cpr-warn)' : 'var(--ocm-text-dim)';
    const idleText = (r) => r.laRel || (r.la ? Math.floor(r.idle / 86400) + 'd ago' : '—');
    const stCell = (r) => {
      if (r.state === 'Okay') return '<span style="color:var(--ocm-cpr-good)">Okay</span>';
      const cd = r.until > nowS ? ` <span class="ocm-time" data-until="${r.until}" style="color:var(--ocm-text-dim)">${fmtCountdown(r.until)}</span>` : '';
      const col = r.state === 'Hospital' || r.state === 'Jail' ? 'var(--ocm-cpr-warn)' : 'var(--ocm-link)';
      return `<span style="color:${col}" title="${esc(r.desc)}">${esc(r.state)}</span>${cd}`;
    };

    el.innerHTML = `
      <div class="ocm-section-title">🕐 Member Activity (${rows.length})</div>
      ${kpis}
      <div class="ocm-note">Sorted most-idle first. The 14-day strip builds from snapshots taken while the dashboard is open (one per 30 min) — it shows presence as this suite saw it, not Torn's own logs. Idle thresholds: <b style="color:var(--ocm-cpr-warn)">3d</b> / <b style="color:var(--ocm-cpr-crit)">7d</b>.</div>
      <table class="ocm-pay-table">
        <thead><tr>
          <th style="width:auto">Member</th>
          <th style="width:86px">Last action</th>
          <th style="width:120px">Status</th>
          <th style="width:104px" title="Presence over the last 14 days (UTC), from dashboard snapshots">14 days</th>
          <th style="width:44px;text-align:center" title="Revivable">💉</th>
          <th style="width:40px;text-align:center" title="Currently in an OC">OC</th>
          <th style="width:56px;text-align:right" title="Days in faction">Days</th>
        </tr></thead>
        <tbody>${rows.map(r => `<tr>
          <td><a href="/profiles.php?XID=${esc(r.uid)}" target="_blank">${esc(r.name)}</a></td>
          <td style="color:${idleColor(r.idle)};font-weight:${r.idle >= INACT_WARN_S ? 700 : 400}">${esc(idleText(r))}</td>
          <td>${stCell(r)}</td>
          <td>${spark(r.days)}</td>
          <td style="text-align:center">${r.revivable === true || r.revivable === 'Everyone' ? '✓' : r.revivable === false || r.revivable === 'No one' ? '<span style="color:var(--ocm-text-muted)">✗</span>' : '<span style="color:var(--ocm-text-muted)">—</span>'}</td>
          <td style="text-align:center">${r.inOc ? '✓' : '<span style="color:var(--ocm-text-muted)">·</span>'}</td>
          <td style="text-align:right;color:var(--ocm-text-dim)">${r.dif ?? '—'}</td>
        </tr>`).join('')}</tbody>
      </table>`;
  }

  function renderReviveSection() {
    const el = document.getElementById('ocm-war-revives');
    if (!el) return;
    const status = String(GM_getValue(GMK.REVIVE_STATUS, ''));
    const led = loadReviveLedger();
    const all = Object.values(led).sort((a, b) => b.ts - a.ts);
    if (!all.length) {
      el.innerHTML = `<div class="ocm-section-title">💉 Revives</div>
        <div class="ocm-note">${status && status !== 'ok'
          ? `Couldn't read the revive log (<b>${esc(status)}</b>) — needs a key with faction API access (AA).`
          : 'No revives recorded yet — the log builds forward from the first sync.'}</div>`;
      return;
    }
    let view;
    try { view = JSON.parse(GM_getValue(GMK.REVIVES_VIEW, '{}')) || {}; } catch (_) { view = {}; }
    const windowD = Number(view.window) || 30;
    const nowS = Math.floor(Date.now() / 1000);
    const rows = windowD > 0 ? all.filter(r => nowS - r.ts <= windowD * 86400) : all;

    const isOk = r => /^(success|true|1)/i.test(r.res);
    const byReviver = {};
    for (const r of rows) {
      if (!r.ri) continue;
      const b = byReviver[r.ri] || (byReviver[r.ri] = { uid: r.ri, name: r.rn || ('#' + r.ri), n: 0, ok: 0, chSum: 0 });
      b.n++; if (isOk(r)) b.ok++; b.chSum += r.ch;
      if (r.rn) b.name = r.rn;
    }
    const board = Object.values(byReviver).sort((a, b) => b.n - a.n);
    const okCount = rows.filter(isOk).length;

    const chip = (d, label) => `<button class="ocm-wr-chip${windowD === d ? ' active' : ''}" data-win="${d}">${label}</button>`;
    el.innerHTML = `
      <div class="ocm-section-title">💉 Revives (${rows.length})</div>
      <div class="ocm-flexrow" style="margin-bottom:8px">${chip(7, '7 days')}${chip(30, '30 days')}${chip(0, 'All tracked')}</div>
      <div class="ocm-kpis">
        ${kpiTile('Revives', rows.length, windowD ? `last ${windowD} days` : 'all tracked', 'var(--ocm-link)')}
        ${kpiTile('Success rate', rows.length ? Math.round(okCount / rows.length * 100) + '%' : '—', `${okCount} succeeded`, 'var(--ocm-cpr-good)')}
        ${kpiTile('Revivers', board.length, board[0] ? `top: ${esc(board[0].name)}` : '—', 'var(--ocm-text)')}
      </div>
      ${board.length ? `<table class="ocm-pay-table">
        <thead><tr>
          <th style="width:auto">Reviver</th>
          <th style="width:64px;text-align:right">Revives</th>
          <th style="width:72px;text-align:right">Success</th>
          <th style="width:80px;text-align:right" title="Average revive chance at the moment of the attempt">Avg chance</th>
        </tr></thead>
        <tbody>${board.map(b => `<tr>
          <td><a href="/profiles.php?XID=${esc(b.uid)}" target="_blank">${esc(b.name)}</a></td>
          <td style="text-align:right;font-weight:700">${b.n}</td>
          <td style="text-align:right;color:var(--ocm-cpr-good)">${Math.round(b.ok / b.n * 100)}%</td>
          <td style="text-align:right;color:var(--ocm-text-dim)">${b.chSum ? (b.chSum / b.n).toFixed(0) + '%' : '—'}</td>
        </tr>`).join('')}</tbody></table>` : '<div class="ocm-note">No outgoing revives in this window.</div>'}
      <div class="ocm-note" style="margin-top:8px">Only revives visible to your faction's log. History builds forward from the first sync — there is no backfill endpoint for revives.</div>`;

    el.querySelectorAll('.ocm-wr-chip').forEach(b => b.addEventListener('click', () => {
      GM_setValue(GMK.REVIVES_VIEW, JSON.stringify({ window: Number(b.dataset.win) }));
      renderReviveSection();
    }));
  }

  /**
   * WAR > TOOLS (v5.0) — the adopted "Torn War Tools" command center's menu.
   * The row enhancements (countdowns, hosp-first sorting, callout buttons)
   * run on the war page itself; this pane is the always-reachable front door
   * for its settings and the mass-callout composer.
   */
  function renderWarToolsSection() {
    const el = document.getElementById('ocm-war-tools');
    if (!el || el.__ocmWired) return;
    el.__ocmWired = true;
    el.innerHTML = `
      <div class="ocm-section-title">🛠 War Tools</div>
      <div class="ocm-note">The war-page command center, now built into the suite: live hospital / travel / jail countdowns painted onto Torn's own war member list, hosp-first sorting, offline/idle hiding, per-enemy 📢 callouts and the 📋 mass-callout composer (presets, FFScouter <b>{stats}</b>/<b>{ff}</b> placeholders, chat-length chunking). Everything runs automatically when a war list is on screen — the floating ⚙ / 📋 buttons appear there too.</div>
      <div class="ocm-flexrow" style="margin:12px 0">
        <button id="ocm-wt-open-settings" class="ocm-join-btn" style="padding:8px 16px">⚙ War Tools settings</button>
        <button id="ocm-wt-open-mass" class="ocm-join-btn" style="padding:8px 16px">📋 Mass callout composer</button>
        <button id="ocm-wt-open-board" class="ocm-join-btn" style="padding:8px 16px">📌 Hit call board</button>
      </div>
      <div class="ocm-note"><b>📌 Hit calling</b> (v5.1): the whole faction shares one Google Sheet — 📌 call a target on the war list and the row locks to you for everyone (purple tint + 🔒 with your name; nobody else can call them); ✓ logs the hit (the board tallies the last 24h) and frees the target. A call holds while the target sits in hospital, then expires 5 min after they're attackable if you haven't hit — no squatting. Setup is a one-time 2-minute job for one member — the board walks you through it, and the sheet itself is the faction's permanent hit log.</div>
      <div class="ocm-note">Callouts send ONE faction-chat message per tap, composed from your template — nothing runs unattended. Keys, templates, presets and every toggle live in the settings panel; an existing standalone install's settings carry over automatically (same storage). <b>If the standalone "Torn War Tools" script is still installed, uninstall it</b> — only one copy can run, and whichever loads first wins (the standalone copy has no hit calling).</div>`;
    const standalone = () => ocmToast('War Tools is currently handled by the STANDALONE script (it loaded first) — use its floating ⚙ button, or uninstall it and reload to use the built-in copy.', 'warn');
    el.querySelector('#ocm-wt-open-settings')?.addEventListener('click', () => OCM_WT ? OCM_WT.openSettings() : standalone());
    el.querySelector('#ocm-wt-open-mass')?.addEventListener('click', () => OCM_WT ? OCM_WT.openMassCallout() : standalone());
    el.querySelector('#ocm-wt-open-board')?.addEventListener('click', () => (OCM_WT && OCM_WT.openCallBoard) ? OCM_WT.openCallBoard() : standalone());
  }

  function renderWarPaySection() {
    const el = document.getElementById('ocm-war-pay');
    if (!el) return;
    const myFid = String(GM_getValue(GMK.MY_FACTION_ID, '') || '');
    const arc = loadWarArchive();
    const wars = Object.entries(arc).map(([id, w]) => ({ id, ...w }))
      .sort((a, b) => (b.start || 0) - (a.start || 0));
    if (!wars.length) {
      el.innerHTML = `<div class="ocm-section-title">💸 War Pay</div>
        <div class="ocm-note">No ranked wars tracked yet — the calculator appears once a war is archived.</div>`;
      return;
    }

    let defaults;
    try { defaults = JSON.parse(GM_getValue(GMK.WAR_PAY_CFG, '{}')) || {}; } catch (_) { defaults = {}; }
    const ledger = loadWarPayLedger();
    const selId = String(defaults.warId && arc[defaults.warId] ? defaults.warId : wars[0].id);
    const war = { id: selId, ...arc[selId] };
    const wcfg = ledger[selId] || {};
    const base = wcfg.base || defaults.base || 'score';
    const flatPct = wcfg.flatPct ?? defaults.flatPct ?? 20;
    const minMetric = wcfg.minMetric ?? defaults.minMetric ?? 0;
    const potStr = wcfg.potStr || '';
    const pot = parseMoneyInput(potStr);
    const paid = wcfg.paid || {};

    const opp = (war.factions || []).find(f => String(f.id) !== myFid) || {};
    const rows = warPayRows(war, base, Number(minMetric) || 0);
    const calc = computeWarPay(rows, pot, { flatPct, roundTo: 1000 });
    const paidSum = calc.rows.reduce((s, r) => s + (paid[r.uid] ? r.amount : 0), 0);

    const baseRadio = (k, label, title) => `<label style="cursor:pointer" title="${title}">
      <input type="radio" name="ocm-wp-base" value="${k}"${base === k ? ' checked' : ''}> ${label}</label>`;

    el.innerHTML = `
      <div class="ocm-section-title">💸 War Pay — vs ${esc(opp.name || '#' + (opp.id || '?'))}</div>
      <div class="ocm-note">Split the war cache between the members who fought. The pot is manual — the API can't see what the cache sold for. Payouts round DOWN to $1k; the remainder stays with the faction. Paying is still a human action in-game; the ✓ column just tracks it.</div>
      <div class="ocm-flexrow" style="margin-bottom:10px">
        <select id="ocm-wp-war" style="min-width:180px">${wars.map(w => {
          const o = (w.factions || []).find(f => String(f.id) !== myFid) || {};
          return `<option value="${esc(w.id)}"${w.id === selId ? ' selected' : ''}>vs ${esc(o.name || '#' + (o.id || '?'))} · ${dateStr(w.start)}</option>`;
        }).join('')}</select>
        <input id="ocm-wp-pot" type="text" placeholder="pot, e.g. 1.5b" value="${esc(potStr)}" style="width:110px">
        <span style="font-size:11px;color:var(--ocm-text-muted)">split by</span>
        ${baseRadio('score', 'Score', "Official war-report respect score (exact once the war ends)")}
        ${baseRadio('hits', 'Hits', 'Official war hits (obs war hits when no report yet)')}
        ${baseRadio('respect', 'Respect', 'Observed respect gained, from the attack ledger')}
        <label style="font-size:11px;color:var(--ocm-text-muted)" title="This % of the pot splits evenly among everyone who fought; the rest is proportional to the chosen metric">
          flat <input id="ocm-wp-flat" type="number" min="0" max="100" value="${Number(flatPct)}" style="width:52px">%</label>
        <label style="font-size:11px;color:var(--ocm-text-muted)" title="Members below this metric get nothing at all">
          min <input id="ocm-wp-min" type="number" min="0" value="${Number(minMetric)}" style="width:64px"></label>
      </div>
      <div class="ocm-kpis">
        ${kpiTile('Pot', pot ? fmtMoney(pot) : '—', pot ? 'manual entry' : 'enter the cache value', 'var(--ocm-link)')}
        ${kpiTile('Distributed', fmtMoney(calc.distributed), `across ${calc.rows.length} member${calc.rows.length === 1 ? '' : 's'}`, 'var(--ocm-cpr-good)')}
        ${kpiTile('Faction keeps', fmtMoney(calc.remainder), 'rounding remainder', 'var(--ocm-text)')}
        ${kpiTile('Marked paid', fmtMoney(paidSum), `${Object.keys(paid).filter(u => calc.rows.some(r => r.uid === u)).length} of ${calc.rows.length}`, 'var(--ocm-cpr-warn)')}
      </div>
      ${calc.rows.length ? `<table class="ocm-pay-table">
        <thead><tr>
          <th style="width:auto">Member</th>
          <th style="width:80px;text-align:right">${base === 'hits' ? 'Hits' : base === 'respect' ? 'Respect' : 'Score'}</th>
          <th style="width:64px;text-align:right">Share</th>
          <th style="width:110px;text-align:right">Payout</th>
          <th style="width:56px;text-align:center" title="Mark paid after you send the money in-game">Paid</th>
        </tr></thead>
        <tbody>${calc.rows.map(r => `<tr>
          <td><a href="/profiles.php?XID=${esc(r.uid)}" target="_blank">${esc(r.name)}</a></td>
          <td style="text-align:right;color:var(--ocm-text-dim)">${r.metric.toLocaleString()}</td>
          <td style="text-align:right;color:var(--ocm-text-muted)">${(r.share * 100).toFixed(1)}%</td>
          <td style="text-align:right;font-weight:700;color:var(--ocm-cpr-good)">${fmtMoney(r.amount)}</td>
          <td style="text-align:center"><button class="ocm-wp-paid" data-uid="${esc(r.uid)}" style="cursor:pointer;border:1px solid ${paid[r.uid] ? 'var(--ocm-cpr-good)' : 'var(--ocm-border)'};background:${paid[r.uid] ? '#12200f' : 'none'};color:${paid[r.uid] ? 'var(--ocm-cpr-good)' : 'var(--ocm-text-muted)'};border-radius:4px;padding:2px 10px;font-size:11px">${paid[r.uid] ? '✓' : '·'}</button></td>
        </tr>`).join('')}</tbody></table>
      <div class="ocm-flexrow" style="margin-top:10px">
        <button id="ocm-wp-discord" class="ocm-join-btn" style="padding:5px 12px;font-size:11px">💬 Copy for Discord</button>
        <button id="ocm-wp-csv" class="ocm-join-btn" style="padding:5px 12px;font-size:11px">📄 Download CSV</button>
      </div>`
      : `<div class="ocm-note">No members qualify — no per-member data for this war yet${minMetric > 0 ? ', or the minimum is set too high' : ''}.</div>`}`;

    // — wiring. Every input change persists (defaults + per-war) and re-renders.
    const saveAndRender = (patch) => {
      const led2 = loadWarPayLedger();
      led2[selId] = { ...(led2[selId] || {}), base, flatPct, minMetric, potStr, paid, ...patch };
      saveWarPayLedger(led2);
      GM_setValue(GMK.WAR_PAY_CFG, JSON.stringify({ ...defaults, warId: selId,
        base: patch.base ?? base, flatPct: patch.flatPct ?? flatPct, minMetric: patch.minMetric ?? minMetric }));
      renderWarPaySection();
    };
    el.querySelector('#ocm-wp-war')?.addEventListener('change', e => {
      GM_setValue(GMK.WAR_PAY_CFG, JSON.stringify({ ...defaults, warId: e.target.value }));
      renderWarPaySection();
    });
    el.querySelector('#ocm-wp-pot')?.addEventListener('change', e => saveAndRender({ potStr: e.target.value.trim() }));
    el.querySelectorAll('input[name="ocm-wp-base"]').forEach(r =>
      r.addEventListener('change', () => saveAndRender({ base: r.value })));
    el.querySelector('#ocm-wp-flat')?.addEventListener('change', e => saveAndRender({ flatPct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }));
    el.querySelector('#ocm-wp-min')?.addEventListener('change', e => saveAndRender({ minMetric: Math.max(0, Number(e.target.value) || 0) }));
    el.querySelectorAll('.ocm-wp-paid').forEach(b => b.addEventListener('click', () => {
      const uid = b.dataset.uid;
      const p = { ...paid };
      if (p[uid]) delete p[uid];
      else p[uid] = { amount: calc.rows.find(r => r.uid === uid)?.amount || 0, ts: Math.floor(Date.now() / 1000) };
      saveAndRender({ paid: p });
    }));
    el.querySelector('#ocm-wp-discord')?.addEventListener('click', () => {
      const money = v => Math.abs(v) >= 1e9 ? (v / 1e9).toFixed(2) + 'b' : Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + 'm' : (v / 1e3).toFixed(0) + 'k';
      const head = `**War payout — vs ${opp.name || '#' + (opp.id || '?')}** (${dateStr(war.start)}${war.end ? ' – ' + dateStr(war.end) : ''})\nPot $${money(pot)} · split by ${base} · ${flatPct}% flat · faction keeps $${money(calc.remainder)}\n`;
      const nameW = Math.max(...calc.rows.map(r => r.name.length), 6);
      let body = calc.rows.map(r => `${r.name.padEnd(nameW)}  ${String(r.metric.toLocaleString()).padStart(9)}  $${money(r.amount).padStart(8)}`).join('\n');
      let msg = head + '```\n' + body + '\n```';
      if (msg.length > 1990) msg = msg.slice(0, 1950) + '\n… (truncated)\n```';
      const done = () => ocmToast('Copied — paste into Discord', 'ok');
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(msg).then(done, () => ocmToast('Copy failed', 'warn'));
    });
    el.querySelector('#ocm-wp-csv')?.addEventListener('click', () => {
      const csv = ['Member,User ID,' + (base[0].toUpperCase() + base.slice(1)) + ',Share %,Payout,Paid']
        .concat(calc.rows.map(r => `"${r.name.replace(/"/g, '""')}",${r.uid},${r.metric},${(r.share * 100).toFixed(2)},${r.amount},${paid[r.uid] ? 'yes' : 'no'}`))
        .join('\n');
      triggerDownload(`war-pay-${selId}-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv');
    });
  }

  function renderChainHistorySection() {
    const el = document.getElementById('ocm-war-chains');
    if (!el) return;
    const openKeys = openDetailKeys(el);
    const status = String(GM_getValue(GMK.CHAIN_STATUS, ''));
    const arc = loadChainArchive();
    const led = loadAttackLedger();
    const chains = Object.entries(arc).map(([id, c]) => ({ id, ...c }))
      .sort((a, b) => (b.end || 0) - (a.end || 0));

    if (!chains.length) {
      el.innerHTML = `<div class="ocm-section-title">📜 Chains</div>
        <div class="ocm-note">${status && status !== 'ok'
          ? `Couldn't read chains (<b>${esc(status)}</b>) — needs a key with faction API access (AA).`
          : 'No chains recorded yet. Past chains archive automatically as the suite sees them.'}</div>`;
      return;
    }

    // Names: chain reports carry only user IDs — resolve from the roster stash,
    // then from names captured on attack-ledger rows.
    const ledNames = {};
    for (const s of Object.values(led)) { if (s.a && s.an) ledNames[s.a] = s.an; if (s.d && s.dn) ledNames[s.d] = s.dn; }
    const nameOf = uid => warMemberName(uid) || ledNames[uid] || ('#' + uid);

    const best = chains.reduce((m, c) => Math.max(m, c.length || 0), 0);
    const kpis = `<div class="ocm-kpis">`
      + kpiTile('Chains tracked', chains.length, 'archived forever', 'var(--ocm-link)')
      + kpiTile('Best chain', best.toLocaleString(), 'longest tracked', 'var(--ocm-cpr-good)')
      + kpiTile('Respect (total)', Math.round(chains.reduce((s, c) => s + (c.respect || 0), 0)).toLocaleString(), 'across tracked chains', 'var(--ocm-text)')
      + `</div>`;

    const fmt1 = v => (Math.round(v * 10) / 10).toLocaleString();
    const rows = chains.slice(0, 50).map(c => {
      const rep = c.report;
      const detail = rep ? `<table class="ocm-pay-table" style="margin:6px 0">
          <thead><tr>
            <th style="width:auto">Member</th>
            <th style="width:56px;text-align:right">Hits</th>
            <th style="width:76px;text-align:right">Respect</th>
            <th style="width:56px;text-align:right">Avg</th>
            <th style="width:56px;text-align:right">Best</th>
          </tr></thead>
          <tbody>${rep.attackers.slice().sort((a, b) => b.respect - a.respect).map(a => `<tr>
            <td><a href="/profiles.php?XID=${esc(a.id)}" target="_blank">${esc(nameOf(a.id))}</a></td>
            <td style="text-align:right">${a.attacks}</td>
            <td style="text-align:right;color:var(--ocm-cpr-good);font-weight:700">${fmt1(a.respect)}</td>
            <td style="text-align:right;color:var(--ocm-text-dim)">${fmt1(a.avg)}</td>
            <td style="text-align:right;color:var(--ocm-text-dim)">${fmt1(a.best)}</td>
          </tr>`).join('')}</tbody></table>
          ${rep.nonAttackers?.length ? `<div class="ocm-note">Didn't hit: ${rep.nonAttackers.map(u => esc(nameOf(u))).join(', ')}</div>` : ''}`
        : `<div class="ocm-note">${c.reportErr ? `Report unavailable (${esc(c.reportErr)}) — retried periodically.` : 'Per-member report not fetched yet — it lands on the next war-data sync.'}</div>`;
      return `<details class="ocm-war-card" data-key="chain-${esc(String(c.id))}">
        <summary>
          <span style="font-weight:700;color:var(--ocm-text)">${(c.length || 0).toLocaleString()}-hit chain</span>
          <span style="color:var(--ocm-text-muted)">${dateStr(c.start)}${c.end ? ' – ' + dateStr(c.end) : ''}</span>
          <span style="margin-left:auto;color:var(--ocm-cpr-good);font-variant-numeric:tabular-nums">+${Math.round(c.respect || 0).toLocaleString()} respect</span>
        </summary>
        <div class="ocm-war-card-body">${detail}</div>
      </details>`;
    }).join('');

    el.innerHTML = `
      <div class="ocm-section-title">📜 Chains (${chains.length})</div>
      ${kpis}${rows}`;
    restoreOpenDetails(el, openKeys);
  }

  /**
   * AUTOMATIC OC-HISTORY BACKFILL (v5.0). The full-history archive used to be
   * button-only, so Member/Faction Earnings quietly covered just the ~100-OC
   * API window until someone remembered to press it. Now: if the archive has
   * never been built, build it (paced exactly like the manual button — a few
   * minutes, once, with a toast); afterwards refresh it at most weekly.
   * Failures back off 6 hours instead of retrying every refresh.
   */
  /**
   * NAME RESOLUTION for archived crews (v5.0.2). The OC archive stores bare
   * user ids, and members who left before the suite ever saw them have no
   * entry in the persistent name cache — so the Money tables rendered
   * "#2360099" instead of a name. Resolve the unknowns through the user
   * endpoint: capped and paced per pass, results persisted forever in the
   * name cache, failures retried weekly.
   */
  // ─── AVATAR CACHE (v5.2) ───────────────────────────────────────────────────
  // Torn's profile_image lives on the `profile` selection and its URL carries an
  // unguessable UUID, so it MUST be fetched per uid — it can't be templated.
  // Format: https://profileimages.torn.com/{uuid}-{uid}.{ext}   (.png and .gif
  // both occur; a member with no picture returns a SHARED silhouette on a
  // different host, which is why acceptance is host-whitelisted below.)

  const AVATAR_TTL_MS = 30 * 86400e3;        // aligns with Torn's own 31-day immutable cache
  const AVATAR_RETRY_MS = 7 * 86400e3;       // a failed lookup comes back sooner than a good one
  let OCM_AVATARS = null;

  function loadAvatarCache() {
    try { return JSON.parse(GM_getValue(GMK.AVATAR_CACHE, '{}')) || {}; } catch (_) { return {}; }
  }

  /** Cached picture URL for a uid, or '' — callers fall back to the monogram. */
  function avatarUrl(uid) {
    if (!OCM_AVATARS) OCM_AVATARS = loadAvatarCache();
    const rec = OCM_AVATARS[String(uid)];
    return rec && rec.url ? rec.url : '';
  }

  /**
   * Accept ONLY a genuine per-user picture.
   *
   * Host-whitelist + uid suffix, deliberately extension-agnostic. "No picture"
   * comes back as `www.torn.com/images/profile_man.jpg` — one shared silhouette
   * on a different host. Whitelisting the host (rather than blocklisting that
   * filename) means a new or gendered default can never leak the SAME generic
   * face onto half the roster, which would look worse than initials.
   */
  function validAvatarUrl(url, uid) {
    const m = String(url || '').match(/^https:\/\/profileimages\.torn\.com\/([^/?#]+)$/);
    if (!m) return '';
    const stem = m[1].replace(/\.[a-z0-9]+$/i, '');
    return stem.endsWith('-' + String(uid)) ? String(url) : '';
  }

  /** Fold a profile payload's avatar into the cache. Returns true if it's a real one. */
  function noteAvatar(cache, uid, payload, now) {
    const raw = payload && payload.profile_image ? String(payload.profile_image) : '';
    const url = validAvatarUrl(raw, uid);
    cache[String(uid)] = { url, at: now };   // '' is a RECORDED NEGATIVE: asked, has none.
    return { ok: !!url, rejected: (!url && raw) ? raw : null };
  }

  /**
   * Walk everyone we render and cache their picture URL. Same shape as
   * resolveUnknownNames: 40 per pass at 400ms, so a 100-member faction is ~40s
   * spread over a couple of refreshes, an order of magnitude cheaper than the
   * OC history backfill that already runs automatically.
   */
  let _avatarSyncRunning = false;
  async function syncProfileImages(apiKey) {
    if (_avatarSyncRunning || !apiKey) return false;
    const cache = loadAvatarCache();
    const now = Date.now();
    const names = OCM_MEMBER_NAMES || loadMemberNameCache();
    const stale = Object.keys(names).filter(uid => {
      const rec = cache[uid];
      return !rec || (now - (rec.at || 0)) > AVATAR_TTL_MS;
    });
    if (!stale.length) return false;
    _avatarSyncRunning = true;
    let got = 0;
    const rejected = new Set();
    try {
      for (const uid of stale.slice(0, 40)) {
        try {
          const d = await apiFetchV1(`user/${uid}?selections=profile`, apiKey);
          const r = noteAvatar(cache, uid, d, now);
          if (r.ok) got++;
          if (r.rejected) rejected.add(r.rejected);
        } catch (_) {
          // Back-date the stamp so a failure retries in a week rather than
          // waiting the full 30 days, without needing a second failure store.
          cache[String(uid)] = { url: '', at: now - (AVATAR_TTL_MS - AVATAR_RETRY_MS) };
        }
        await new Promise(r => setTimeout(r, 400));
      }
      OCM_AVATARS = cache;
      try { GM_setValue(GMK.AVATAR_CACHE, JSON.stringify(cache)); } catch (e) {
        console.warn('[OC Suite] avatar cache too large to save:', e.message);
      }
      GM_setValue(GMK.AVATAR_SYNC_AT, now);
      // Surfaces anything Torn returns that ISN'T a per-user picture, so a new
      // default-silhouette URL is visible on day one instead of silently
      // rendering as "no avatar" forever.
      if (rejected.size) {
        console.log('[OC Suite] profile_image values rejected (not a per-user picture):', [...rejected].slice(0, 5));
      }
    } finally {
      _avatarSyncRunning = false;
    }
    return got > 0;
  }

  let _nameResolveRunning = false;
  async function resolveUnknownNames(apiKey) {
    if (_nameResolveRunning || !apiKey) return false;
    const cache = loadMemberNameCache();
    let failed = {};
    try { failed = JSON.parse(GM_getValue(GMK.NAME_RESOLVE_FAILED, '{}')) || {}; } catch (_) {}
    const RETRY_MS = 7 * 86400e3;
    const unknown = new Set();
    const noteUid = uid => {
      if (uid == null) return;
      const k = String(uid);
      if (!cache[k] && !(failed[k] && Date.now() - failed[k] < RETRY_MS)) unknown.add(k);
    };
    for (const oc of Object.values(loadOcArchive())) {
      const slots = Array.isArray(oc?.slots) ? oc.slots : Object.values(oc?.slots || {});
      for (const s of slots) noteUid(s?.user_id ?? s?.user?.id);
    }
    for (const d of Object.values(loadDepositEvents())) if (!d.name) noteUid(d.uid);
    if (!unknown.size) return false;
    _nameResolveRunning = true;
    let got = 0;
    try {
      // 40 per pass at 400ms — well inside the shared API budget; the next
      // refresh picks up whatever's left until every id has a name.
      // v5.2: ask for `profile` alongside `basic` — the avatar rides along in
      // the SAME request, so every name we resolve here costs syncProfileImages
      // one fewer call later. Widening the selection adds no extra round trip.
      const avatars = loadAvatarCache();
      const nowMs = Date.now();
      for (const uid of [...unknown].slice(0, 40)) {
        try {
          const d = await apiFetchV1(`user/${uid}?selections=basic,profile`, apiKey);
          if (d?.name) { cache[uid] = d.name; got++; }
          else failed[uid] = Date.now();
          if (d) noteAvatar(avatars, uid, d, nowMs);
        } catch (_) { failed[uid] = Date.now(); }
        await new Promise(r => setTimeout(r, 400));
      }
      OCM_MEMBER_NAMES = cache;
      OCM_AVATARS = avatars;
      try { GM_setValue(GMK.MEMBER_NAMES, JSON.stringify(cache)); } catch (_) {}
      try { GM_setValue(GMK.AVATAR_CACHE, JSON.stringify(avatars)); } catch (_) {}
      GM_setValue(GMK.NAME_RESOLVE_FAILED, JSON.stringify(failed));
    } finally {
      _nameResolveRunning = false;
    }
    return got > 0;
  }

  let _autoBackfillRunning = false;
  async function maybeAutoBackfill(apiKey) {
    if (_autoBackfillRunning || !apiKey) return;
    let meta = null;
    try { meta = JSON.parse(GM_getValue(GMK.OC_ARCHIVE_META, 'null')); } catch (_) {}
    const fresh = meta && Date.now() - (meta.at || 0) < 7 * 86400e3;
    if (fresh) return;
    const lastTry = Number(GM_getValue(GMK.OC_BACKFILL_AUTO, 0)) || 0;
    if (Date.now() - lastTry < 6 * 3600e3) return;
    GM_setValue(GMK.OC_BACKFILL_AUTO, Date.now());
    _autoBackfillRunning = true;
    try {
      if (!meta) ocmToast('Building the full OC history archive in the background — a few minutes, once. Earnings will cover your whole history when it lands.', 'ok');
      await backfillOcHistory(apiKey, null);
      loadData(apiKey);   // re-render so the Money panes pick up the archive
    } catch (e) {
      console.warn('[OC Suite] auto history pass failed (will retry later):', e);
    } finally {
      _autoBackfillRunning = false;
    }
  }

  async function loadData(apiKey) {
    // Concurrency guard: loadData fires from the 60s auto-refresh AND from button
    // clicks / settings changes. Without this, a slow fetch overlapping the next
    // interval tick would run two renders concurrently and interleave DOM writes.
    if (_ocmLoadInFlight) return;
    const errEl = document.getElementById('ocm-error');
    const btn   = document.getElementById('ocm-refresh-btn');
    // If the dashboard DOM is gone (e.g. SPA navigated away from the crimes tab),
    // stop the auto-refresh rather than throwing on null elements every tick.
    if (!errEl || !btn) { clearInterval(window._ocmRefresh); return; }
    _ocmLoadInFlight = true;
    errEl.style.display = 'none';
    btn.innerHTML = '<span class="ocm-spinner"></span>Loading…';
    btn.disabled  = true;

    // If user has Force Member Mode enabled in Config, skip the leader fetch
    // entirely and go straight to member-mode rendering. This is a preview /
    // testing toggle for users whose API key works for both modes.
    const forceMember = GM_getValue(GMK.FORCE_MEMBER, false);
    if (forceMember) {
      // Reveal the View Mode config section so the toggle remains reachable —
      // otherwise the user is locked in member mode with no way to switch back.
      const mmSection0 = document.getElementById('ocm-cfg-section-membermode');
      if (mmSection0) mmSection0.style.display = '';
      const fmEl0 = document.getElementById('ocm-cfg-force-member');
      if (fmEl0) fmEl0.checked = true;
      try {
        const data = await fetchMember(apiKey);
        window._ocmDebug = { mode: 'member', fetchedAt: Date.now(), data, forced: true };
        renderMemberDashboard(data);
        document.getElementById('ocm-key-status').textContent = `Key saved ✓ · Member Mode (forced) · ↻${REFRESH_S}s`;
        btn.innerHTML = '↻ Refresh';
        btn.disabled  = false;
        _ocmLoadInFlight = false;
        return;
      } catch (memberErr) {
        document.getElementById('ocm-body').style.display = '';
        errEl.innerHTML = `&#9888; Member mode fetch failed: ${memberErr.message}`;
        errEl.style.display = 'block';
        btn.innerHTML = '↻ Refresh';
        btn.disabled  = false;
        _ocmLoadInFlight = false;
        return;
      }
    }

    try {
      const { faction, members, armory, itemNames, itemValues, lastOc, exMemberNames, viewerId, loanedOut } = await fetchAll(apiKey);
      // Stash for debug snapshot — sanitised on demand, not here
      window._ocmDebug = { mode: 'leader', fetchedAt: Date.now(), faction, members, armory, itemNames, lastOc, exMemberNames };
      renderDashboard(faction, members, armory, itemNames, lastOc, exMemberNames, itemValues, viewerId, loanedOut);
      // War-data poll group (throttled internally: 60s during a live war, 5 min
      // otherwise). Fire-and-forget; re-render the War panes when new data lands.
      syncWarData(apiKey).then(ran => { if (ran) renderWarSections(); })
        .catch(e => console.warn('[OCM] war sync failed:', e));
      // Keep the OC-history archive built + fresh without the manual button.
      maybeAutoBackfill(apiKey);
      // Turn archived "#id" crews into real names (paced; converges over a
      // couple of refreshes). Re-render when any land.
      resolveUnknownNames(apiKey).then(got => { if (got) loadData(apiKey); }).catch(() => {});
      // Cache profile-picture URLs the same way. Deliberately does NOT trigger a
      // re-render: avatars are cosmetic, every member already shows a monogram,
      // and a reload per batch would be churn for no visible gain. They appear
      // on the next natural refresh.
      syncProfileImages(apiKey).catch(() => {});
      // Leader mode succeeded — show the View Mode toggle in Config
      const mmSection = document.getElementById('ocm-cfg-section-membermode');
      if (mmSection) mmSection.style.display = '';
      const _tsK = GM_getValue(GMK.TS_KEY, '');
      if (_tsK && !isTsCprCacheFresh() && !_tsFetchInFlight && (Date.now() - _tsLastFailAt > TS_FAIL_COOLDOWN)) {
        _tsFetchInFlight = true;
        fetchTornStatsCpr(_tsK)
          .then(d => {
            saveTsCprCache(d);
            renderDashboard(faction, members, armory, itemNames, lastOc, exMemberNames, itemValues, viewerId, loanedOut);
          })
          .catch(err => {
            // Record failure so we don't keep hammering the API every refresh
            _tsLastFailAt = Date.now();
            console.warn('[OCM] TornStats fetch failed, backing off for 10 min:', err);
          })
          .finally(() => { _tsFetchInFlight = false; });
      }
    } catch (leaderErr) {
      // Faction access failed — log it so we can debug, then try member mode
      console.warn('[OCM] Leader mode failed, falling back to member mode:', leaderErr);
      try {
        const data = await fetchMember(apiKey);
        window._ocmDebug = { mode: 'member', fetchedAt: Date.now(), data, leaderErr: leaderErr.message };
        renderMemberDashboard(data);
        document.getElementById('ocm-key-status').textContent = `Key saved ✓ · Member Mode · ↻${REFRESH_S}s · (leader: ${leaderErr.message})`;
      } catch (memberErr) {
        // Both failed — show error and open config panel
        document.getElementById('ocm-body').style.display = '';
        document.getElementById('ocm-config-panel').style.display = 'block';
        errEl.innerHTML = `&#9888; Could not load data: ${memberErr.message}<br>
          <span style="font-size:11px;color:var(--ocm-cpr-warn)">Please check your API key in &#9881; Config.</span>`;
        errEl.style.display = 'block';
      }
    } finally {
      btn.innerHTML = '↻ Refresh';
      btn.disabled  = false;
      _ocmLoadInFlight = false;
    }
  }

  /** Schedule the auto-refresh interval. Clears any existing interval first. */
  function scheduleRefresh(apiKey) {
    clearInterval(window._ocmRefresh);
    window._ocmRefresh = setInterval(() => loadData(apiKey), REFRESH_S * 1000);
    // Live panes (chain watcher / War Room) poll on their own 30s loop, but
    // each tick no-ops unless the pane is on screen or a chain is live.
    startLiveWarPolling(apiKey);
    document.getElementById('ocm-footer').textContent = `Auto-refreshes every ${REFRESH_S}s`;
  }

  // ─── COLLAPSE / EXPAND ───────────────────────────────────────────────────────

  /** Wire up all collapsible sections with GM_setValue persistence. */
  /**
   * Collapse for EVERY section title, including ones rendered dynamically.
   *
   * initCollapse() below wires a hard-coded list of title/content id pairs. Anything
   * generated at render time — all the Money panes, Loans, Item Status, Assignments —
   * still got the .ocm-section-title class (and so the ▼ chevron) but was never wired.
   * The chevron was decorative; clicking did nothing.
   *
   * This delegates from the root, so it covers what's on screen now AND whatever a
   * later render produces. A dynamic section owns everything between its title and the
   * next title, so no matching content id is needed.
   */
  const collapseKeyOf = (title) =>
    'ocs_collapse_' + (title.id || (title.textContent || '')
      .replace(/\(\d+\)/g, '')
      .replace(/[^a-z0-9]+/gi, '-')
      .toLowerCase().replace(/^-|-$/g, '').slice(0, 48));

  function sectionBody(title) {
    const out = [];
    let el = title.nextElementSibling;
    while (el && !el.classList.contains('ocm-section-title')) { out.push(el); el = el.nextElementSibling; }
    return out;
  }

  function applyCollapse(title, collapsed) {
    title.classList.toggle('collapsed', collapsed);
    for (const el of sectionBody(title)) el.style.display = collapsed ? 'none' : '';
  }

  function restoreDynamicCollapse() {
    const root = document.getElementById('ocm-root');
    if (!root) return;
    for (const title of root.querySelectorAll('.ocm-section-title')) {
      if (title.dataset.ocmStatic === '1') continue;
      title.style.cursor = 'pointer';
      if (GM_getValue(collapseKeyOf(title), null) === 'collapsed') applyCollapse(title, true);
    }
  }

  function initDynamicCollapse() {
    const root = document.getElementById('ocm-root');
    if (!root || root.__ocmCollapseWired) return;
    root.__ocmCollapseWired = true;
    root.addEventListener('click', (e) => {
      const title = e.target.closest('.ocm-section-title');
      if (!title || !root.contains(title) || title.dataset.ocmStatic === '1') return;
      const collapsed = !title.classList.contains('collapsed');
      applyCollapse(title, collapsed);
      GM_setValue(collapseKeyOf(title), collapsed ? 'collapsed' : 'open');
    });
  }

  /**
   * Collapse for the fixed shell sections.
   *
   * The state has to be re-evaluated AFTER each render, not just once at inject.
   * The old code ran only at boot — when every title still read "(0)" because no data
   * had loaded — decided "empty, so start collapsed", and never looked again. When the
   * data arrived the count became "(4)" but the collapse state was never revisited, so
   * the title's class and the content's display drifted out of sync with each other.
   * That's the double-click: the first click was toggling a state you couldn't see.
   */
  const COLLAPSE_SECTIONS = [
    { titleId: 'ocm-title-available',     contentId: 'ocm-available',     defaultOpen: true  },
    { titleId: 'ocm-title-recruits',      contentId: 'ocm-recruits',      defaultOpen: true  },
    { titleId: 'ocm-title-blocked',       contentId: 'ocm-blocked',       defaultOpen: true  },
    { titleId: 'ocm-title-lowcpr',        contentId: 'ocm-lowcpr',        defaultOpen: true  },
    { titleId: 'ocm-title-overqualified', contentId: 'ocm-overqualified', defaultOpen: true  },
    { titleId: 'ocm-title-tscoverage',    contentId: 'ocm-tscoverage',    defaultOpen: false },
    { titleId: 'ocm-title-tscpr',         contentId: 'ocm-tscpr',         defaultOpen: false },
    { titleId: 'ocm-title-analytics',     contentId: 'ocm-analytics',     defaultOpen: false },
    { titleId: 'ocm-title-downloads',     contentId: 'ocm-downloads',     defaultOpen: false },
  ];

  /** Single source of truth: the title's .collapsed class drives the content's display. */
  function setCollapsed(title, content, collapsed) {
    title.classList.toggle('collapsed', collapsed);
    content.style.display = collapsed ? 'none' : '';
  }

  /** Re-apply saved/default state. Safe to call after every render. */
  function syncStaticCollapse() {
    for (const { titleId, contentId, defaultOpen } of COLLAPSE_SECTIONS) {
      const title = document.getElementById(titleId);
      const content = document.getElementById(contentId);
      if (!title || !content) continue;
      title.dataset.ocmStatic = '1';       // the delegated handler must skip these

      const saved = GM_getValue(`ocs_collapse_${contentId}`, null);
      if (saved === 'open')      { setCollapsed(title, content, false); continue; }
      if (saved === 'collapsed') { setCollapsed(title, content, true);  continue; }

      // No preference yet. Open it if it now has something in it — which is only
      // knowable AFTER the data has loaded, hence re-running this post-render.
      const m = title.textContent.match(/\((\d+)\)/);
      const count = m ? Number(m[1]) : null;
      const hasContent = count === null ? true : count > 0;
      setCollapsed(title, content, !(defaultOpen && hasContent));
    }
  }

  function initCollapse() {
    for (const { titleId, contentId } of COLLAPSE_SECTIONS) {
      const title = document.getElementById(titleId);
      const content = document.getElementById(contentId);
      if (!title || !content || title.__ocmWired) continue;
      title.__ocmWired = true;
      title.addEventListener('click', () => {
        // Derive from the CLASS, not from inline display — they can't disagree now.
        const collapsed = !title.classList.contains('collapsed');
        setCollapsed(title, content, collapsed);
        GM_setValue(`ocs_collapse_${contentId}`, collapsed ? 'collapsed' : 'open');
      });
    }
    syncStaticCollapse();
  }

  /** Wire up the group tabs — exactly one pane visible at a time. Remembers
   *  the last selected tab via GM_setValue. */
  /**
   * One place that explains every term and symbol the dashboard uses. CPR, role
   * weight, obs/est and the item icons were used across a dozen panes and defined
   * nowhere — you had to already know what they meant to read your own dashboard.
   */
  /**
   * Config's copy of the per-level member shares. Saves on change (no Save button —
   * the rest of Config behaves that way), and the shared saver keeps the OCs Ran
   * editor showing the same numbers.
   */
  function initShareConfig() {
    const inputs = document.querySelectorAll('.ocm-cfg-share-lv');
    if (!inputs.length) return;
    const msg = document.getElementById('ocm-cfg-share-msg');
    const flash = () => {
      if (!msg) return;
      msg.textContent = '✓ Saved';
      clearTimeout(msg.__t);
      msg.__t = setTimeout(() => { msg.textContent = ''; }, 1800);
    };
    // Refresh the same way every other Config setting does.
    const refresh = () => {
      const key = GM_getValue(GMK.API_KEY, '');
      if (key) loadData(key);
    };
    for (const inp of inputs) {
      inp.addEventListener('change', () => {
        saveShareByDiff(readShareInputs('.ocm-cfg-share-lv'));
        flash();
        refresh();
      });
    }
    document.getElementById('ocm-cfg-share-reset')?.addEventListener('click', () => {
      saveShareByDiff({ ...DEFAULT_SHARE_BY_DIFF });
      flash();
      refresh();
    });
  }

  function initLegend() {
    const btn = document.getElementById('ocm-legend-btn');
    const box = document.getElementById('ocm-legend');
    if (!btn || !box) return;
    box.innerHTML = `
      <div class="ocm-legend-grid">
        <div>
          <h4>CPR — Checkpoint Pass Rate</h4>
          <p>Torn's own number: the chance a member clears their checkpoints in that role.
             It's the single best predictor of whether an OC succeeds.
             Below <b>${CPR_WARN}%</b> is a problem, below <b>${CPR_CRIT}%</b> is critical (both configurable).</p>
        </div>
        <div>
          <h4>Weight — how much a role matters</h4>
          <p>How much that role drives the crime's success. A 35%-weight role decides the OC;
             an 8%-weight one barely moves it. <b>Weight is why a low CPR isn't always a problem</b> —
             and why a high CPR in a minor role is wasted.</p>
        </div>
        <div>
          <h4>obs vs est</h4>
          <p><span class="ocm-lg-tag" style="color:var(--ocm-cpr-good)">obs 78</span> — <b>observed</b>: a CPR Torn actually reported after that member ran that role. Fact.<br>
             <span class="ocm-lg-tag" style="color:var(--ocm-text-muted)">est 50</span> — <b>estimated</b> from TornStats, or from a different role. A guess — treat it as such.</p>
        </div>
        <div>
          <h4>Item icons</h4>
          <p><b>🔧</b> tool (reusable, comes back) · <b>📦</b> material (consumed by the crime).<br>
             <b style="color:var(--ocm-cpr-good)">✓</b> member has it ·
             <b style="color:var(--ocm-link)">🏛</b> in the armory, needs loaning ·
             <b style="color:var(--ocm-cpr-crit)">✗</b> nobody has it, must be bought.</p>
        </div>
        <div>
          <h4>Card accent &amp; verdicts</h4>
          <p>An OC card's left bar shows its <b>worst</b> real problem, not just its phase.<br>
             <b style="color:var(--ocm-cpr-crit)">🔴 Risk</b> — high-weight role held at low CPR. This is what loses OCs.<br>
             <b style="color:var(--ocm-link)">🔵 Underused</b> — a strong member on a role that barely matters.</p>
        </div>
        <div>
          <h4>TCT &amp; timers</h4>
          <p><b>TCT</b> is Torn City Time (UTC) — the clock Torn runs on. Countdowns turn
             <span style="color:var(--ocm-cpr-warn)">amber</span> under 48h and
             <span style="color:var(--ocm-cpr-crit)">red</span> under 12h.</p>
        </div>
      </div>`;
    btn.addEventListener('click', () => {
      const open = box.style.display !== 'none';
      box.style.display = open ? 'none' : 'block';
      btn.textContent = open ? '? Legend' : '× Close';
    });
  }

  function initTabs() {
    const tabs  = document.querySelectorAll('.ocm-tab');
    const panes = document.querySelectorAll('.ocm-tab-pane');
    if (!tabs.length) return;

    function activate(tabName) {
      tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
      panes.forEach(p => p.classList.toggle('active', p.id === `ocm-pane-${tabName}`));
      GM_setValue(GMK.ACTIVE_TAB, tabName);
      clearStaleTooltips();   // a tooltip anchored in the pane we just hid would linger forever
    }

    tabs.forEach(t => {
      t.addEventListener('click', () => activate(t.dataset.tab));
    });

    // v4.0 moved Loans and Item Status from People into the new Armoury tab.
    // Carry the user's saved choice across so the move is invisible: if their
    // People sub-tab was one of the moved panes, Armoury opens on it and People
    // falls back to its default. Idempotent — People's saved value is reset.
    const movedSub = GM_getValue(GMK.SUBTAB_PREFIX + 'people', null);
    if (movedSub === 'loans' || movedSub === 'memitems') {
      if (GM_getValue(GMK.SUBTAB_PREFIX + 'armoury', null) === null) {
        GM_setValue(GMK.SUBTAB_PREFIX + 'armoury', movedSub);
      }
      GM_setValue(GMK.SUBTAB_PREFIX + 'people', 'assign');
      if (GM_getValue(GMK.ACTIVE_TAB, null) === 'people') GM_setValue(GMK.ACTIVE_TAB, 'armoury');
    }
    // v5.0.2 merged Faction Earnings into the Money Overview.
    if (GM_getValue(GMK.SUBTAB_PREFIX + 'money', null) === 'faction') {
      GM_setValue(GMK.SUBTAB_PREFIX + 'money', 'summary');
    }

    // Sub-tabs: each main pane has its own bar. Switching is pure show/hide within
    // that pane, and the choice is remembered per pane.
    panes.forEach(pane => {
      const subtabs  = [...pane.querySelectorAll('.ocm-subtab')];
      const subpanes = [...pane.querySelectorAll('.ocm-subpane')];
      if (!subtabs.length) return;
      const key = GMK.SUBTAB_PREFIX + pane.id.replace('ocm-pane-', '');
      const show = (sub) => {
        subtabs.forEach(b => b.classList.toggle('active', b.dataset.sub === sub));
        subpanes.forEach(p => p.classList.toggle('active', p.id === `ocm-sub-${sub}`));
        GM_setValue(key, sub);
      };
      subtabs.forEach(b => b.addEventListener('click', () => show(b.dataset.sub)));
      const saved = GM_getValue(key, null);
      if (saved && subtabs.some(b => b.dataset.sub === saved)) show(saved);
    });

    // v5.3: the rail can be PINNED open. Hover alone is not an affordance on
    // TornPDA/touch, where there is no hover state at all.
    const railPin = document.getElementById('ocm-rail-pin');
    if (railPin) {
      const root = document.getElementById('ocm-root');
      const apply = (on) => {
        root?.classList.toggle('ocm-rail-pinned', on);
        railPin.classList.toggle('active', on);
        GM_setValue(GMK.RAIL_PINNED, on);
      };
      // The RESTORE runs every time; only the LISTENER is guarded against being
      // bound twice. Guarding both meant a second initTabs() (a re-inject, or any
      // future caller) silently stopped honouring the saved pin — the state would
      // be in storage and never applied, with nothing to show it had been dropped.
      apply(GM_getValue(GMK.RAIL_PINNED, false) === true);
      if (!railPin.__ocmWired) {
        railPin.__ocmWired = true;
        railPin.addEventListener('click', () => apply(!root?.classList.contains('ocm-rail-pinned')));
      }
    }

    // Default to the Dashboard (v5.3) — but ONLY for someone with no saved choice.
    // Relocating a returning user mid-war would be its own small betrayal.
    // v3.17 restructured 6 tabs into 3, so migrate any retired tab name.
    const TAB_MIGRATION = { action: 'crimes', ocs: 'crimes', status: 'people',
                            optimize: 'people', reference: 'people',
                            profit: 'money', items: 'money', finance: 'money' };
    let saved = GM_getValue(GMK.ACTIVE_TAB, 'dashboard');
    if (TAB_MIGRATION[saved]) saved = TAB_MIGRATION[saved];
    if (!['dashboard', 'crimes', 'people', 'money', 'war', 'armoury'].includes(saved)) saved = 'dashboard';
    activate(saved);
  }

  /** Pulls (N) counts from each section title and updates tab badges.
   *  Called from renderDashboard after sections are populated. */
  function updateTabCounts() {
    // Section titles carry their own "(N)" — parse it back out.
    // Prefer the number the renderer published; only fall back to reading it out of
    // the heading for sections that still embed it as "(N)".
    function count(titleId, registryKey) {
      if (registryKey && OCM_COUNTS[registryKey] != null) return OCM_COUNTS[registryKey];
      const el = document.getElementById(titleId);
      if (!el) return 0;
      const m = el.textContent.match(/\((\d+)\)/);
      return m ? Number(m[1]) : 0;
    }
    const setBadge = (id, val, attn) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = val;
      // v5.3: a "0" badge is pure noise, and in the collapsed rail it sits on top
      // of the icon where noise costs the most. Hide zero, like the sub-tabs do.
      el.style.display = val ? '' : 'none';
      el.classList.toggle('has-attn', !!attn);
    };
    const setSub = (id, val, attn) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = val;
      el.style.display = val ? '' : 'none';
      el.classList.toggle('has-attn', !!attn);
    };

    const free     = count('ocm-title-available',     'free');
    const blocked  = count('ocm-title-blocked',       'blocked');
    const lowCpr   = count('ocm-title-lowcpr',        'lowCpr');
    const overQual = count('ocm-title-overqualified', 'overQual');
    const activeOc = count(null,                      'activeOc');

    // Crimes sub-badges
    setSub('ocm-sb-fill',   free,     free > 0);
    setSub('ocm-sb-active', activeOc, false);
    // People sub-badges (loans / item-status are set by the finance render)
    setSub('ocm-sb-blocked',  blocked,            false);
    setSub('ocm-sb-optimize', lowCpr + overQual,  lowCpr > 0);

    // Main tabs. Dashboard = how many things want you (red if any are critical).
    // Crimes = slots you could fill right now (the main job).
    // People = members needing attention (low CPR). Armoury = loans + item problems.
    setBadge('ocm-tab-count-dashboard', OCM_COUNTS.dashboard || 0, (OCM_COUNTS.dashAttn || 0) > 0);
    setBadge('ocm-tab-count-crimes', free, free > 0);
    setBadge('ocm-tab-count-people', lowCpr, lowCpr > 0);
    setBadge('ocm-tab-count-armoury', ocmArmouryAttn || 0, (ocmArmouryAttn || 0) > 0);
    // Money badge is owned by the finance render (OCs awaiting payout).
    // War badge stays 0 until the war data layer lands (v4.1+).
  }

  // ─── INJECT MAIN DASHBOARD ───────────────────────────────────────────────────

  /** Inject the dashboard into the OC tab when the URL matches. */
  function inject() {
    if (document.getElementById('ocm-root')) return;

    // Match the normal crimes tab, OR the faction profile/your page when the
    // player is travelling/abroad (Torn strips the crimes tab in that state).
    function isOcTab() {
      const isTraveling = document.body.dataset.traveling === 'true' || document.body.dataset.abroad === 'true';
      return location.href.includes('factions.php') && (
        location.hash.includes('tab=crimes') ||
        (isTraveling && (location.href.includes('step=profile') || location.href.includes('step=your')))
      );
    }

    if (!isOcTab()) {
      window.addEventListener('hashchange', () => { if (isOcTab() && !document.getElementById('ocm-root')) inject(); });
      return;
    }

    const isTraveling = document.body.dataset.traveling === 'true' || document.body.dataset.abroad === 'true';

    const tryInsert = setInterval(() => {
      const anchor = isTraveling
        ? (document.querySelector('#react-root') ||
           document.querySelector('.content-wrapper'))
        : (document.querySelector('.faction-crimes-wrap') ||
           document.querySelector('#faction-crimes')       ||
           document.querySelector('.content-wrapper')      ||
           document.querySelector('#mainContainer'));

      if (!anchor) return;
      clearInterval(tryInsert);

      const root = buildRoot();
      anchor.parentNode.insertBefore(root, anchor);
      initCollapse();
      initTabs();
      initLegend();
      initShareConfig();
      initDynamicCollapse();

      // Apply saved theme immediately, then wire the selector
      const savedTheme = GM_getValue(GMK.THEME, 'default');
      applyTheme(savedTheme);
      const themeSelect = document.getElementById('ocm-theme-select');
      const themeEditor = document.getElementById('ocm-theme-editor');
      const customizeBtn = document.getElementById('ocm-theme-customize-btn');

      // Build the per-variable colour-picker editor for the Custom theme.
      function renderThemeEditor() {
        if (!themeEditor) return;
        const activeTheme = GM_getValue(GMK.THEME, 'default');
        // The editor edits the "custom" theme. If a preset is active, seed custom
        // from that preset's values so the pickers show the live colours.
        const rows = THEME_VARS.map(v => {
          const val = getThemeVarValue(activeTheme, v.key);
          const hex = /^#[0-9a-fA-F]{6}$/.test(val) ? val : '#000000';
          return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <input type="color" data-var="${v.key}" value="${hex}" style="width:34px;height:24px;border:none;background:none;cursor:pointer;padding:0;flex:none" />
            <span style="font-size:11px;color:var(--ocm-text-card);flex:1">${v.label}</span>
            <code style="font-size:10px;color:var(--ocm-text-muted)">${v.key.replace('--ocm-','')}</code>
          </div>`;
        }).join('');
        themeEditor.innerHTML = `
          <div style="font-size:11px;color:var(--ocm-text-dim);margin-bottom:10px">
            Edit any colour below — changes apply live and switch the theme to <b>Custom</b>. Your custom theme is saved automatically.
          </div>
          ${rows}
          <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
            <button id="ocm-theme-reset-custom" style="background:var(--ocm-bg-card);border:1px solid var(--ocm-border);border-radius:4px;color:var(--ocm-text-dim);padding:4px 10px;font-size:11px;cursor:pointer">↺ Reset to Default</button>
            <button id="ocm-theme-copy-from" style="background:var(--ocm-bg-card);border:1px solid var(--ocm-border);border-radius:4px;color:var(--ocm-text-dim);padding:4px 10px;font-size:11px;cursor:pointer">Copy current preset → Custom</button>
          </div>`;

        // Wire each colour input — live update + persist to custom theme
        themeEditor.querySelectorAll('input[type="color"]').forEach(inp => {
          inp.addEventListener('input', () => {
            let custom = {};
            try { custom = JSON.parse(GM_getValue(GMK.CUSTOM_THEME, '{}')) || {}; } catch (_) {}
            custom[inp.dataset.var] = inp.value;
            GM_setValue(GMK.CUSTOM_THEME, JSON.stringify(custom));
            GM_setValue(GMK.THEME, 'custom');
            if (themeSelect) themeSelect.value = 'custom';
            applyTheme('custom');
          });
        });
        const resetBtn = document.getElementById('ocm-theme-reset-custom');
        if (resetBtn) resetBtn.addEventListener('click', () => {
          GM_setValue(GMK.CUSTOM_THEME, '{}');
          applyTheme('custom');
          renderThemeEditor();
          ocmToast('Custom theme reset to default colours.', 'ok');
        });
        const copyBtn = document.getElementById('ocm-theme-copy-from');
        if (copyBtn) copyBtn.addEventListener('click', () => {
          // Seed custom from whatever preset the dropdown currently shows
          const src = themeSelect && themeSelect.value !== 'custom' ? themeSelect.value : 'default';
          const preset = THEMES[src] || THEMES.default;
          const custom = {};
          for (const [k, val] of Object.entries(preset)) if (k.startsWith('--')) custom[k] = val;
          GM_setValue(GMK.CUSTOM_THEME, JSON.stringify(custom));
          GM_setValue(GMK.THEME, 'custom');
          if (themeSelect) themeSelect.value = 'custom';
          applyTheme('custom');
          renderThemeEditor();
          ocmToast(`Copied ${preset.label || src} into your custom theme.`, 'ok');
        });
      }

      if (themeSelect) {
        themeSelect.value = savedTheme;
        themeSelect.addEventListener('change', () => {
          applyTheme(themeSelect.value);
          if (themeSelect.value === 'custom') {
            if (themeEditor) themeEditor.style.display = 'block';
            renderThemeEditor();
          }
        });
      }
      if (customizeBtn) {
        customizeBtn.addEventListener('click', () => {
          if (!themeEditor) return;
          const showing = themeEditor.style.display !== 'none';
          themeEditor.style.display = showing ? 'none' : 'block';
          if (!showing) renderThemeEditor();
        });
      }
      // If launching already on custom, show editor open
      if (savedTheme === 'custom' && themeEditor) { themeEditor.style.display = 'block'; renderThemeEditor(); }

      const savedKey = GM_getValue(GMK.API_KEY, '');
      if (savedKey) {
        document.getElementById('ocm-api-input').value = '••••••••••••••••';
        document.getElementById('ocm-key-status').textContent = `Key saved ✓ · CPR ${CPR_WARN}%/${CPR_CRIT}% · W ${WEIGHT_HIGH}%/${WEIGHT_MID}% · ↻${REFRESH_S}s`;
        loadData(savedKey);
        scheduleRefresh(savedKey);
      } else {
        // No key saved — open config panel automatically
        document.getElementById('ocm-config-panel').style.display = 'block';
      }

      // Config panel toggle
      document.getElementById('ocm-config-toggle').addEventListener('click', () => {
        const panel = document.getElementById('ocm-config-panel');
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      });

      // Force Member Mode toggle — init from saved state, save on change, reload
      const forceMemberEl = document.getElementById('ocm-cfg-force-member');
      if (forceMemberEl) {
        forceMemberEl.checked = GM_getValue(GMK.FORCE_MEMBER, false);
        forceMemberEl.addEventListener('change', () => {
          GM_setValue(GMK.FORCE_MEMBER, forceMemberEl.checked);
          const k = GM_getValue(GMK.API_KEY, '');
          if (k) loadData(k);
        });
      }

      // Save API key
      document.getElementById('ocm-save-key-btn').addEventListener('click', () => {
        const key = document.getElementById('ocm-api-input').value.trim();
        if (!key || key.startsWith('•')) {
          const k = GM_getValue(GMK.API_KEY, '');
          if (k) { loadData(k); scheduleRefresh(k); }
          return;
        }
        GM_setValue(GMK.API_KEY, key);
        document.getElementById('ocm-api-input').value = '••••••••••••••••';
        document.getElementById('ocm-key-status').textContent = `Key saved ✓ · CPR ${CPR_WARN}%/${CPR_CRIT}% · W ${WEIGHT_HIGH}%/${WEIGHT_MID}% · ↻${REFRESH_S}s`;
        loadData(key);
        scheduleRefresh(key);
      });

      // Save all settings
      document.getElementById('ocm-cfg-save-btn').addEventListener('click', () => {
        const warn       = Number(document.getElementById('ocm-cfg-cpr-warn').value)      || 70;
        const crit       = Number(document.getElementById('ocm-cfg-cpr-crit').value)      || 60;
        const wHigh      = Number(document.getElementById('ocm-cfg-w-high').value)        || 25;
        const wMid       = Number(document.getElementById('ocm-cfg-w-mid').value)         || 15;
        const refresh    = Number(document.getElementById('ocm-cfg-refresh').value)       || 60;
        const minPerDiff = Number(document.getElementById('ocm-cfg-min-per-diff').value)  ?? 2;
        saveConfig(warn, crit, wHigh, wMid, refresh, minPerDiff);
        CPR_MAX = Math.max(0, Math.min(100, Number(document.getElementById('ocm-cfg-cpr-max')?.value) || 0));
        GM_setValue(GMK.CFG_CPR_MAX, CPR_MAX);
        document.getElementById('ocm-key-status').textContent = `Key saved ✓ · CPR ${CPR_WARN}%/${CPR_CRIT}% · W ${WEIGHT_HIGH}%/${WEIGHT_MID}% · ↻${REFRESH_S}s`;
        document.getElementById('ocm-cfg-status').textContent = 'Saved ✓';
        setTimeout(() => { document.getElementById('ocm-cfg-status').textContent = ''; }, 2000);
        const key = GM_getValue(GMK.API_KEY, '');
        if (key) { scheduleRefresh(key); loadData(key); }
      });

      // Reset to defaults
      document.getElementById('ocm-cfg-reset-btn').addEventListener('click', () => {
        saveConfig(70, 60, 25, 15, 60, 2);
        CPR_MAX = 0; GM_setValue(GMK.CFG_CPR_MAX, 0);
        const maxEl = document.getElementById('ocm-cfg-cpr-max');
        if (maxEl) maxEl.value = 0;
        document.getElementById('ocm-cfg-cpr-warn').value    = 70;
        document.getElementById('ocm-cfg-cpr-crit').value    = 60;
        document.getElementById('ocm-cfg-w-high').value      = 25;
        document.getElementById('ocm-cfg-w-mid').value       = 15;
        document.getElementById('ocm-cfg-refresh').value     = 60;
        document.getElementById('ocm-cfg-min-per-diff').value = 2;
        document.getElementById('ocm-key-status').textContent = `Key saved ✓ · CPR 70%/60% · W 25%/15% · ↻60s`;
        document.getElementById('ocm-cfg-status').textContent = 'Reset to defaults ✓';
        setTimeout(() => { document.getElementById('ocm-cfg-status').textContent = ''; }, 2000);
        const key = GM_getValue(GMK.API_KEY, '');
        if (key) { scheduleRefresh(key); loadData(key); }
      });

      // Manual refresh button
      document.getElementById('ocm-refresh-btn').addEventListener('click', () => {
        const key = GM_getValue(GMK.API_KEY, '');
        if (key) loadData(key);
      });

      // ── Debug snapshot — gathers internal state for troubleshooting
      function buildDebugSnapshot() {
        const dbg = window._ocmDebug || {};
        const tsCacheRaw = GM_getValue(GMK.TS_CPR_CACHE, '{}');
        let tsCacheMeta = { hasCache: false };
        try {
          const parsed = JSON.parse(tsCacheRaw);
          tsCacheMeta = {
            hasCache: !!parsed.ts,
            cachedAt: parsed.ts ? new Date(parsed.ts).toISOString() : null,
            memberCount: parsed.data ? Object.keys(parsed.data).length : 0,
            sampleMember: parsed.data ? Object.entries(parsed.data)[0] : null,
          };
        } catch (_) {}

        // Sanitise the raw faction data — keep structure, redact sensitive details
        function sanitiseFaction(faction) {
          if (!faction) return null;
          const out = { ID: faction.ID, name: '<redacted>', crimes: {} };
          for (const [id, oc] of Object.entries(faction.crimes || {})) {
            if (!oc) continue;
            out.crimes[id] = {
              id: oc.id,
              name: oc.name,
              difficulty: oc.difficulty,
              status: oc.status,
              executed_at: oc.executed_at,
              ready_at: oc.ready_at,
              expired_at: oc.expired_at,
              time_left: oc.time_left,
              slots: (Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || [])).map(s => s ? {
                position: s.position,
                position_info: s.position_info,
                checkpoint_pass_rate: s.checkpoint_pass_rate,
                user: s.user ? {
                  id: s.user.id,
                  progress: s.user.progress,
                  joined_at: s.user.joined_at,
                } : null,
                item_requirement: s.item_requirement ? {
                  id: s.item_requirement.id,
                  is_available: s.item_requirement.is_available,
                  is_reusable: s.item_requirement.is_reusable,
                } : null,
              } : null),
            };
          }
          return out;
        }
        function sanitiseMembers(members) {
          if (!members) return null;
          const out = {};
          for (const [k, m] of Object.entries(members)) {
            out[k] = {
              id: m.id,
              name: '<redacted>',
              status: m.status,
              is_in_oc: m.is_in_oc,
              last_action: m.last_action ? { timestamp: m.last_action.timestamp } : null,
              faction: m.faction ? { position: m.faction.position } : null,
              rank: m.rank,
            };
          }
          return out;
        }
        function sanitiseTsData(td) {
          if (!td) return null;
          const out = {};
          let i = 0;
          for (const [uid, crimes] of Object.entries(td)) {
            if (i++ < 3) {
              // Keep first 3 members in full to show structure
              out[uid] = crimes;
            } else {
              out[uid] = `<${Object.keys(crimes).length} crimes>`;
            }
          }
          return out;
        }
        function sanitiseHistoryCpr(h) {
          if (!h) return null;
          const out = {};
          let i = 0;
          for (const [uid, crimes] of Object.entries(h)) {
            if (i++ < 3) out[uid] = crimes;
            else out[uid] = `<${Object.keys(crimes).length} crimes>`;
          }
          return out;
        }

        // Snapshot of visible DOM sections — counts only
        function readSectionCount(titleId) {
          const el = document.getElementById(titleId);
          if (!el) return null;
          const m = el.textContent.match(/\((\d+)[\)\s]/);
          return m ? Number(m[1]) : null;
        }
        const visibleCounts = {
          available:      readSectionCount('ocm-title-available'),
          recruits:       readSectionCount('ocm-title-recruits'),
          blocked:        readSectionCount('ocm-title-blocked'),
          lowcpr:         readSectionCount('ocm-title-lowcpr'),
          overqualified:  readSectionCount('ocm-title-overqualified'),
          tscpr:          readSectionCount('ocm-title-tscpr'),
        };

        const statsBarValues = {};
        ['ocm-s-active','ocm-s-open','ocm-s-lowcpr','ocm-s-blocked','ocm-s-free','ocm-s-recruiting','ocm-s-stuck'].forEach(id => {
          const el = document.getElementById(id);
          if (el) statsBarValues[id] = el.textContent.trim();
        });

        return {
          generatedAt: new Date().toISOString(),
          script: { version: '3.9.1', userAgent: navigator.userAgent },
          config: { CPR_WARN, CPR_CRIT, WEIGHT_HIGH, WEIGHT_MID, REFRESH_S, MIN_PER_DIFF },
          mode: dbg.mode || 'unknown',
          fetchedAt: dbg.fetchedAt ? new Date(dbg.fetchedAt).toISOString() : null,
          leaderErr: dbg.leaderErr || null,
          tsCacheMeta,
          visibleCounts,
          statsBarValues,
          roleWeightsCount: Object.keys(roleWeights).length,
          tsCprData: sanitiseTsData(tsCprData),
          ocHistoryCpr: sanitiseHistoryCpr(window._ocmHistoryCpr),
          faction: sanitiseFaction(dbg.faction),
          memberCount: dbg.members ? Object.keys(dbg.members).length : 0,
          // Don't include full members list — too large + privacy
          membersSample: sanitiseMembers(
            dbg.members ? Object.fromEntries(Object.entries(dbg.members).slice(0, 5)) : null
          ),
          armoryItemCount: dbg.armory ? Object.keys(dbg.armory).length : 0,
          lastOcCount: dbg.lastOc ? Object.keys(dbg.lastOc).length : 0,
        };
      }

      document.getElementById('ocm-debug-snapshot-btn').addEventListener('click', () => {
        const snap = buildDebugSnapshot();
        const json = JSON.stringify(snap, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ocm-debug-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        document.getElementById('ocm-cfg-status').textContent = '✓ Debug snapshot downloaded';
        setTimeout(() => { document.getElementById('ocm-cfg-status').textContent = ''; }, 3000);
      });

      document.getElementById('ocm-debug-copy-btn').addEventListener('click', () => {
        const json = JSON.stringify(buildDebugSnapshot(), null, 2);
        const setStatus = (msg) => {
          document.getElementById('ocm-cfg-status').textContent = msg;
          setTimeout(() => { document.getElementById('ocm-cfg-status').textContent = ''; }, 3000);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(json).then(
            () => setStatus(`✓ Debug snapshot copied (${(json.length/1024).toFixed(1)} KB)`),
            () => setStatus('✗ Copy failed — check console')
          );
        } else {
          const ta = document.createElement('textarea');
          ta.value = json;
          ta.style.position = 'fixed'; ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); setStatus(`✓ Copied (${(json.length/1024).toFixed(1)} KB)`); }
          catch(_) { setStatus('✗ Copy failed'); }
          ta.remove();
        }
        console.log('[OCM Debug Snapshot]', JSON.parse(json));
      });

      // FFScouter (v4.2 — War Room stat estimates)
      const _ffk = GM_getValue(GMK.FF_KEY, '');
      if (_ffk) { document.getElementById('ocm-ff-key-input').value = '•'.repeat(16); document.getElementById('ocm-ff-status').textContent = 'Key saved ✓'; }
      document.getElementById('ocm-ff-save-btn').addEventListener('click', () => {
        const v = document.getElementById('ocm-ff-key-input').value.trim();
        if (!v || v.charCodeAt(0) === 0x2022) return;
        GM_setValue(GMK.FF_KEY, v);
        document.getElementById('ocm-ff-key-input').value = '•'.repeat(16);
        const s = document.getElementById('ocm-ff-status'); s.textContent = 'Key saved ✓'; s.style.color = 'var(--ocm-cpr-good)';
      });

      // TornStats
      const _stk = GM_getValue(GMK.TS_KEY, '');
      if (_stk) { document.getElementById('ocm-ts-key-input').value = '•'.repeat(16); document.getElementById('ocm-ts-status').textContent = 'Key saved ✓'; }
      document.getElementById('ocm-ts-save-btn').addEventListener('click', () => {
        const v = document.getElementById('ocm-ts-key-input').value.trim();
        if (!v || v.charCodeAt(0) === 0x2022) return;
        GM_setValue(GMK.TS_KEY, v);
        document.getElementById('ocm-ts-key-input').value = '•'.repeat(16);
        const s = document.getElementById('ocm-ts-status'); s.textContent = 'Key saved ✓'; s.style.color = 'var(--ocm-cpr-good)';
      });
      document.getElementById('ocm-ts-fetch-btn').addEventListener('click', async () => {
        const k = GM_getValue(GMK.TS_KEY, ''), s = document.getElementById('ocm-ts-status');
        if (!k) { s.textContent = '⚠ Save key first'; s.style.color = 'var(--ocm-cpr-warn)'; return; }
        s.textContent = 'Fetching…'; s.style.color = '#888';
        try {
          tsCprData = await fetchTornStatsCpr(k);
          saveTsCprCache(tsCprData);
          _tsLastFailAt = 0;  // Manual success clears the auto-fetch cooldown
          s.textContent = '✓ ' + Object.keys(tsCprData).length + ' members loaded';
          s.style.color = 'var(--ocm-cpr-good)';
          // Re-render dashboard so OC cards pick up TS badges
          const apiKey = GM_getValue(GMK.API_KEY, '');
          if (apiKey) loadData(apiKey);
        } catch (e) {
          _tsLastFailAt = Date.now();  // Manual failure also triggers cooldown
          s.textContent = '✗ ' + e.message;
          s.style.color = 'var(--ocm-cpr-crit)';
        }
      });

    }, 500);
  }

  // ─── SIDEBAR WIDGET ──────────────────────────────────────────────────────────

  /** Fetch fresh data for the sidebar widget and update the GM_setValue cache. */
  async function fetchSidebarData(apiKey) {
    try {
      const url  = `${API_BASE}/faction?selections=crimes,members&key=${apiKey}&comment=OCSuite-sidebar`;
      const data = await tornApiGet(url);
      if (data.error) return;

      const now      = Math.floor(Date.now() / 1000);
      const INACTIVE = new Set(['completed','expired','cancelled','failed','success','recruiting']);

      const mInfo = {};
      for (const m of Object.values(data.members || {})) {
        if (m?.id) mInfo[String(m.id)] = { name: m.name, status: m.status?.state || 'Unknown' };
      }

      const planning = [];
      for (const oc of Object.values(data.crimes || {})) {
        if (!oc) continue;
        if (INACTIVE.has((oc.status || '').toLowerCase())) continue;
        const slots     = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
        const openCount = slots.filter(s => !s.user).length;
        let sortKey = Infinity;
        if (oc.executed_at && oc.executed_at > now) sortKey = oc.executed_at;
        else if (oc.ready_at && oc.ready_at > now)  sortKey = oc.ready_at;
        else if (oc.time_left > 0)                   sortKey = now + oc.time_left + openCount * 86400;
        else if (openCount > 0)                      sortKey = now + openCount * 86400;
        planning.push({ oc, sortKey });
      }
      planning.sort((a, b) => a.sortKey - b.sortKey);
      const nextOc = planning[0]?.oc ?? null;

      if (!nextOc) { GM_setValue(GMK.SIDEBAR_CACHE, ''); renderSidebarWidget(); return; }

      const slots      = Array.isArray(nextOc.slots) ? nextOc.slots : Object.values(nextOc.slots || []);
      const executesAt = (nextOc.executed_at && nextOc.executed_at > now ? nextOc.executed_at : null)
                      ?? (nextOc.ready_at    && nextOc.ready_at    > now ? nextOc.ready_at    : null);
      const issues = [];
      for (const slot of slots) {
        const uid  = slot.user?.id ? String(slot.user.id) : null;
        const info = uid ? mInfo[uid] : null;
        if (!uid)                                issues.push({ sev: 'crit', msg: `Open: ${slot.position_info?.label || slot.position || '?'}` });
        else if (info && isBlocked(info.status)) issues.push({ sev: 'crit', msg: `${info.name} — ${info.status}` });
        const req = slot.item_requirement;
        if (req && uid && !req.is_available)     issues.push({ sev: 'warn', msg: `${info?.name || uid} missing item` });
      }

      GM_setValue(GMK.SIDEBAR_CACHE, JSON.stringify({
        name:       nextOc.name,
        executesAt: executesAt ?? null,
        timeLeft:   nextOc.time_left ?? null,
        openCount:  slots.filter(s => !s.user).length,
        severity:   issues.some(i => i.sev === 'crit') ? 'crit' : issues.some(i => i.sev === 'warn') ? 'warn' : 'ok',
        issues:     issues.slice(0, 3),
        cachedAt:   now,
      }));
      renderSidebarWidget();
    } catch (_) {}
  }

  /** Inject the sidebar widget, positioned before the NPC section if found. */
  function injectSidebar() {
    const tryInsert = setInterval(() => {
      const npcHeader = [...document.querySelectorAll('.title-black, .title-gray, [class*="title"]')]
        .find(el => /^NPC/i.test(el.textContent.trim()));
      const fallback = document.querySelector('#sidebar') || document.querySelector('[class*="sidebar"]');
      const anchor   = npcHeader || fallback;
      if (!anchor) return;
      clearInterval(tryInsert);
      if (document.getElementById('ocm-sidebar-widget')) return;

      const widget = document.createElement('div');
      widget.id    = 'ocm-sidebar-widget';
      widget.style.cssText = 'background:var(--ocm-bg-card);border-top:2px solid var(--ocm-link);border-bottom:1px solid #2a2a3a;font-size:11px;font-family:Arial,sans-serif;line-height:1.5';

      if (npcHeader) npcHeader.parentNode.insertBefore(widget, npcHeader);
      else           anchor.appendChild(widget);

      renderSidebarWidget();
      clearInterval(window._ocmSidebarTimer);
      window._ocmSidebarTimer = setInterval(renderSidebarWidget, 1000);

      const apiKey   = GM_getValue(GMK.API_KEY, '');
      const raw      = GM_getValue(GMK.SIDEBAR_CACHE, '');
      let cachedAt = 0;
      try { cachedAt = raw ? (JSON.parse(raw).cachedAt || 0) : 0; } catch (_) {}
      if (apiKey && (Math.floor(Date.now()/1000) - cachedAt > 300)) fetchSidebarData(apiKey);
    }, 500);
  }

  /** Render (or re-render) the sidebar widget from the GM_setValue cache. */
  function renderSidebarWidget() {
    const widget = document.getElementById('ocm-sidebar-widget');
    if (!widget) return;

    const expanded = widget.dataset.expanded === 'true';
    const raw = GM_getValue(GMK.SIDEBAR_CACHE, '');
    if (!raw) {
      widget.innerHTML = `<div style="color:var(--ocm-text-faint);font-size:10px;padding:6px 8px">⚔ OC Suite — loading…</div>`;
      return;
    }

    let data;
    try { data = JSON.parse(raw); } catch { return; }

    if (data.memberMode) { widget.style.display = 'none'; return; }

    const now   = Math.floor(Date.now() / 1000);
    const stale = now - (data.cachedAt || 0) > 300;
    const col   = stale ? '#555' : data.severity === 'crit' ? 'var(--ocm-cpr-crit)' : data.severity === 'warn' ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-good)';
    const icon  = data.severity === 'crit' ? '🔴' : data.severity === 'warn' ? '⚠️' : '✅';
    const arrow = expanded ? '▲' : '▼';

    let timeStr = '';
    if (data.executesAt && data.executesAt > now) {
      const d = data.executesAt - now;
      const h = Math.floor(d / 3600), m = Math.floor((d % 3600) / 60), s = d % 60;
      timeStr = h > 0 ? `${h}h ${String(m).padStart(2,'0')}m` : `${m}m ${String(s).padStart(2,'0')}s`;
    } else if (data.timeLeft > 0) {
      const h = Math.floor(data.timeLeft / 3600), m = Math.floor((data.timeLeft % 3600) / 60);
      timeStr = `~${h > 0 ? h+'h ' : ''}${String(m).padStart(2,'0')}m (paused)`;
    } else if (data.openCount > 0) {
      timeStr = `~${data.openCount * 24}h est.`;
    } else {
      timeStr = 'Ready to initiate!';
    }

    const issueLines = (data.issues || [])
      .map(i => `<div style="color:var(--ocm-text-dim);font-size:10px;padding:1px 0">${i.sev === 'crit' ? '🔴' : '⚠️'} ${i.msg}</div>`)
      .join('');

    const ocLink = `<a href="/factions.php?step=your#/tab=crimes" style="color:var(--ocm-text-faint);font-size:10px;text-decoration:none;float:right;margin-top:4px">Open →</a>`;

    widget.innerHTML = `
      <div id="ocm-sw-header" style="display:flex;align-items:center;justify-content:space-between;padding:5px 8px;cursor:pointer">
        <span style="color:var(--ocm-link);font-weight:bold;font-size:10px;letter-spacing:.5px">⚔ NEXT OC</span>
        <span style="color:${col};font-weight:bold;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0 6px" title="${data.name}">${icon} ${data.name}</span>
        <span style="color:var(--ocm-text-faint);font-size:10px">${timeStr}</span>
        <span style="color:var(--ocm-text-muted);font-size:10px;margin-left:6px">${arrow}</span>
      </div>
      ${expanded ? `<div style="padding:2px 8px 7px;border-top:1px solid #2a2a3a">${issueLines || '<div style="color:var(--ocm-text-faint);font-size:10px">No issues ✓</div>'}${ocLink}<div style="clear:both"></div></div>` : ''}`;

    const header = document.getElementById('ocm-sw-header');
    if (header) {
      header.addEventListener('click', () => {
        widget.dataset.expanded = widget.dataset.expanded === 'true' ? 'false' : 'true';
        renderSidebarWidget();
      });
    }
  }

  // ─── LOADOUT CAPTURE (item.php) ──────────────────────────────────────────────
  /**
   * Opt-in self-loadout capture — reads YOUR equipped items off your own items
   * page (data-equipped / data-item / data-category attributes; never hashed
   * class names). Idempotent and observer-driven: Torn loads item categories
   * lazily over AJAX, so we debounce-rescan on mutations and only save when
   * the equipped set actually changed.
   */
  function initLoadoutCapture() {
    if (!GM_getValue(GMK.LOADOUT_ENABLED, false)) return;
    let debounce = null, lastSig = null, toldUser = false;
    const scanAndSave = () => {
      const items = scanEquippedItems();
      if (!items.length) return;
      const sig = items.map(i => i.id + ':' + (i.cat || '')).sort().join('|');
      if (sig === lastSig) return;
      lastSig = sig;
      const prev = (() => { try { return JSON.parse(GM_getValue(GMK.LOADOUT_SELF, 'null')); } catch (_) { return null; } })();
      const prevSig = prev?.items ? prev.items.map(i => i.id + ':' + (i.cat || '')).sort().join('|') : null;
      GM_setValue(GMK.LOADOUT_SELF, JSON.stringify({
        ts: Math.floor(Date.now() / 1000),
        id: GM_getValue(GMK.MY_PLAYER_ID, null),
        items,
      }));
      if (sig !== prevSig && !toldUser) {
        toldUser = true;
        if (typeof ocmToast === 'function') ocmToast(`Loadout captured — ${items.length} equipped item${items.length === 1 ? '' : 's'} (Armoury > Loadouts)`, 'ok');
      }
    };
    waitForEl('li[data-equipped="true"]', 20000).then(() => {
      scanAndSave();
      const mo = new MutationObserver(() => {
        clearTimeout(debounce);
        debounce = setTimeout(scanAndSave, 600);
      });
      mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-equipped'] });
    }).catch(() => { /* no equipped items visible — nothing to capture */ });
  }

  // ─── WAR TOOLS (v5.0) — adopted wholesale from Torn_War_Tools v3.9.1 ───────
  // The war-page command center, embedded as a self-contained module: live
  // hospital/travel/jail countdowns painted onto Torn's war member list,
  // hosp-first sorting, offline/idle hiding, per-enemy 📢 callouts, the 📋
  // mass-callout composer (presets + FFScouter {stats}/{ff}), and its own
  // settings panel. It keeps its ORIGINAL storage keys so a standalone
  // install's settings carry over untouched, and keeps the original
  // singleton guard — if the standalone script is still installed, whichever
  // loads first wins (uninstall the standalone). Everything it does to the
  // page is scoped to war member lists; on other pages it only parks a cheap
  // observer. Chat callouts are one tap = one message — nothing unattended.
  let OCM_WT = null;
  function initWarTools() {


    /* ════════════════════════════════════════════════════════════════════════
     * 0. SINGLETON GUARD
     * Prevents double-execution (e.g. SPA re-inject, duplicate install) and
     * signals FFScouter to stand down its own war monitor.
     * ════════════════════════════════════════════════════════════════════════ */
    if (window.__tornWarToolsLoaded) return;
    window.__tornWarToolsLoaded = true;
    if (!document.getElementById('FFScouterV2DisableWarMonitor')) {
        const g = document.createElement('div');
        g.id = 'FFScouterV2DisableWarMonitor';
        g.style.display = 'none';
        document.documentElement.appendChild(g);
        try { window.dispatchEvent(new Event('FFScouterV2DisableWarMonitor')); } catch (_) {}
    }

    const VERSION = '3.9.1';
    const LOG = (...a) => console.log('%c[WarTools]', 'color:#4a78b8;font-weight:bold', ...a);

    /* ════════════════════════════════════════════════════════════════════════
     * 1. STORAGE LAYER
     * A small abstraction over GM_* with a localStorage fallback so the script
     * behaves identically under Tampermonkey, Violentmonkey, and TornPDA.
     * Keys for shared TWSE-compatible values reuse the original namespace so an
     * existing API key / hosp-first preference carries over with no re-entry.
     * ════════════════════════════════════════════════════════════════════════ */
    const Store = {
        _gmGet: typeof GM_getValue === 'function' ? GM_getValue
              : (typeof GM !== 'undefined' && GM.getValue) ? GM.getValue : null,
        _gmSet: typeof GM_setValue === 'function' ? GM_setValue
              : (typeof GM !== 'undefined' && GM.setValue) ? GM.setValue : null,

        get(key, def) {
            // Try GM storage first (synchronous form only; async GM.* falls through to LS mirror)
            try {
                if (typeof GM_getValue === 'function') {
                    const v = GM_getValue(key, undefined);
                    if (v !== undefined) return v;
                }
            } catch (_) {}
            try {
                const raw = localStorage.getItem('wt:' + key);
                if (raw !== null) return JSON.parse(raw);
            } catch (_) {}
            return def;
        },
        set(key, val) {
            try { if (typeof GM_setValue === 'function') GM_setValue(key, val); } catch (_) {}
            try { localStorage.setItem('wt:' + key, JSON.stringify(val)); } catch (_) {}
        },
        // Raw localStorage passthrough for TWSE-compatible keys
        rawGet(key) { try { return localStorage.getItem(key); } catch (_) { return null; } },
        rawSet(key, val) { try { localStorage.setItem(key, val); } catch (_) {} },
    };

    /* ════════════════════════════════════════════════════════════════════════
     * 2. CONFIG & CONSTANTS
     * ════════════════════════════════════════════════════════════════════════ */
    const C = {
        // TWSE-compatible storage keys (so migration is seamless)
        KEY_API:        'xentac-torn_war_stuff_enhanced-apikey',
        KEY_HOSP_FIRST: 'xentac-torn_war_stuff_enhanced-hosp-first',
        KEY_FFS:        'wt:ffscouter-key',
        CACHE_PREFIX:   'wt:status-cache:',

        FFS_ENDPOINT:   'https://ffscouter.com/api/v1/get-stats',
        FFS_POLL:       120_000,  // FFScouter caches ~5min; refreshing every 2min is plenty
        FFS_TTL:        330_000,  // treat a fetched estimate as usable for ~5.5 min

        // Timings (ms)
        POLL_ACTIVE:    12_000,   // API poll cadence while tab is focused
        POLL_HIDDEN:    45_000,   // slower poll when tab is in background
        TICK_CLOCK:     1_000,    // live countdown repaint
        TICK_RECONCILE: 600,      // DOM reconcile (re-find rows, re-apply state)
        CACHE_TTL:      11_000,   // status cache lifetime
        API_BACKOFF:    30_000,   // wait after a soft API error

        // Sort buckets (lower = higher in list when ascending)
        SORT: { DIFFERS: 0, OKAY: 1, HOSPITAL: 2, RETURNING: 3, ABROAD: 4, TRAVEL_TO: 5, TRAVELING: 6, UNKNOWN: 99 },

        RED_THRESHOLD: 300,       // seconds; hospital timer turns red/highlight under this

        FATAL_API: new Set([1, 2, 6, 7, 10, 13, 16, 18, 21]),
        RETRY_API: new Set([5, 8, 9, 17]),

        COUNTRY_ABBR: {
            'United Arab Emirates': 'UAE', 'South Africa': 'SA', 'Cayman Islands': 'Cayman',
            'United Kingdom': 'UK', 'Argentina': 'Arg', 'Switzerland': 'Switz',
            'China': 'China', 'Japan': 'Japan', 'Mexico': 'Mexico', 'Canada': 'Canada',
            'Hawaii': 'Hawaii',
        },

        // DOM attributes we stamp on rows
        ATTR: {
            PID: 'data-wt-pid', UNTIL: 'data-wt-until', SINCE: 'data-wt-since',
            SORT: 'data-wt-sort', LOC: 'data-wt-loc', STATE: 'data-wt-state',
        },
    };

    /* ════════════════════════════════════════════════════════════════════════
     * 3. APPLICATION STATE
     * Everything mutable lives here, so behavior is easy to trace and reset.
     * ════════════════════════════════════════════════════════════════════════ */
    const state = {
        apiKey: Store.rawGet(C.KEY_API) || GM_getValue(GMK.API_KEY, '') || '',   // falls back to the suite's key
        ffsKey: Store.get('ffscouter-key', '') || GM_getValue(GMK.FF_KEY, '') || '',   // falls back to the suite's FF key
        hcUrl: Store.get('hitcall-url', '') || '',   // Apps Script Web App URL — the shared hit-call sheet (v5.1)
        hospFirst: Store.rawGet(C.KEY_HOSP_FIRST) !== 'false',  // default ON
        running: true,
        warFound: false,
        everManualSort: false,
        lastPollAt: 0,
        nextPollAllowedAt: 0,
        nextFfsAllowedAt: 0,
        nextHcAllowedAt: 0,
        members: new Map(),   // pid -> { state, until, since, description, lastSeen }
        ffs: new Map(),       // pid -> { estHuman, ff, fetchedAt }
        calls: new Map(),     // targetId -> [{callerId, caller, ts, targetName}] — hit-call queues (v5.1)
        callEvents: [],       // raw events from the sheet (last 24h) — feeds the board tally
        rows: new Map(),      // pid -> { li, statusDiv, countdownEl }
        settings: {
            templates:        Store.get('templates', null) || defaultTemplates(),
            lastTemplate:     Store.get('lastTemplate', 0),
            offsetSeconds:    Store.get('offsetSeconds', 0),
            defaultMode:      Store.get('defaultMode', 'remaining'),
            calloutOnOwn:     Store.get('calloutOnOwn', false),
            quickCallBtn:     Store.get('quickCallBtn', true),
            calloutStates:    Store.get('calloutStates', { hosp: true, okay: true, traveling: false }),
            colorCountdowns:  Store.get('colorCountdowns', true),
            showStatsInline:  Store.get('showStatsInline', false),
            hideOffline:      Store.get('hideOffline', false),
            hideIdle:         Store.get('hideIdle', false),
            hideOnline:       Store.get('hideOnline', false),
            keepHospVisible:  Store.get('keepHospVisible', false),
            massFilter:       Store.get('massFilter', 'all'),
            massOnline:       Store.get('massOnline', 'any'),
            massLimit:        Store.get('massLimit', 0),
            massFFCap:        Store.get('massFFCap', false),
            massFFVal:        Store.get('massFFVal', 2),
            massHospU:        Store.get('massHospU', false),
            massHospUMin:     Store.get('massHospUMin', 15),
            massRespWar:      Store.get('massRespWar', true),
            massRespOverseas: Store.get('massRespOverseas', false),
            massPresets:      Store.get('massPresets', []),
            massLineFormats:  Store.get('massLineFormats', []),
            massSort:         Store.get('massSort', 'hosp_asc'),
            massLineTpl:      Store.get('massLineTpl', '{name} — {time} (FF {ff})'),
            massShowHeader:   Store.get('massShowHeader', true),
            massHeader:       Store.get('massHeader', '🎯 Targets:'),
            massNumber:       Store.get('massNumber', true),
        },
    };

    function defaultTemplates() {
        return [
            { name: 'Call X in Y',         body: 'Call on {name} in {time}' },
            { name: 'X out in Y',          body: '{name} out in {time}' },
            { name: 'X out + stats/FF',    body: '{name} out in {time} (~{stats}, FF {ff})' },
            { name: 'X out + FF',          body: '{name} out in {time} — FF {ff}' },
            { name: 'X + attack link',     body: '{name} out in {time} → https://www.torn.com/loader.php?sid=attack&user2ID={id}' },
            { name: 'X available in Y',    body: '{name} is available in {time}' },
            { name: 'X out NOW',           body: '{name} is out now — go go go' },
            { name: 'X out at HH:MM',      body: '{name} out at {clock} TCT' },
            { name: 'Soft on X (Y left)',  body: 'Soft target: {name} ({time} left)' },
        ];
    }
    function saveSetting(key, val) {
        state.settings[key] = val;
        Store.set(key, val);
    }

    // ── Mass-callout presets ─────────────────────────────────────────────────
    // A preset is a full snapshot of the mass-callout configuration. Built-ins
    // encode common war intents with plain-language names so they're useful the
    // moment you open the panel. The `cfg` object mirrors the panel controls.
    // `builtin: true` presets can't be deleted (but you can save a tweaked copy).
    function defaultMassPresets() {
        return [
            {
                name: '🏥 Hosp — soonest out',
                builtin: true,
                cfg: { filter: 'hosp', sort: 'hosp_asc', online: 'any', limit: 0,
                       ffCap: false, ffVal: 2, hospU: false, hospUMin: 15,
                       line: '{name} — {time}', header: true, headText: '🏥 Coming out:', number: true },
            },
            {
                name: '⏰ Out within 5 min',
                builtin: true,
                cfg: { filter: 'hosp', sort: 'hosp_asc', online: 'any', limit: 0,
                       ffCap: false, ffVal: 2, hospU: true, hospUMin: 5,
                       line: '{name} — {time}', header: true, headText: '⏰ Out in 5:', number: true },
            },
            {
                name: '🎯 Soft & online (FF≤2)',
                builtin: true,
                cfg: { filter: 'okay', sort: 'ff_asc', online: 'online', limit: 0,
                       ffCap: true, ffVal: 2, hospU: false, hospUMin: 15,
                       line: '{name} — FF {ff} (~{stats})', header: true, headText: '🎯 Hit now:', number: true },
            },
            {
                name: '✅ Attackable now',
                builtin: true,
                cfg: { filter: 'okay', sort: 'ff_asc', online: 'any', limit: 0,
                       ffCap: false, ffVal: 2, hospU: false, hospUMin: 15,
                       line: '{name} — FF {ff}', header: true, headText: '✅ Available:', number: true },
            },
            {
                name: '💤 Offline hosp targets',
                builtin: true,
                cfg: { filter: 'hosp', sort: 'hosp_asc', online: 'offline', limit: 0,
                       ffCap: false, ffVal: 2, hospU: false, hospUMin: 15,
                       line: '{name} — {time}', header: true, headText: '💤 Sleeping in hosp:', number: true },
            },
            {
                name: '📋 Everyone + timers',
                builtin: true,
                cfg: { filter: 'all', sort: 'hosp_asc', online: 'any', limit: 0,
                       ffCap: false, ffVal: 2, hospU: false, hospUMin: 15,
                       line: '{name} — {time} (FF {ff})', header: true, headText: '🎯 Targets:', number: true },
            },
        ];
    }
    // Merge built-ins (always present, by name) with the user's saved customs.
    function allMassPresets() {
        const custom = state.settings.massPresets || [];
        const builtinNames = new Set(defaultMassPresets().map(p => p.name));
        const cleanCustom = custom.filter(p => p && p.name && !builtinNames.has(p.name));
        return [...defaultMassPresets(), ...cleanCustom];
    }

    // Line-format presets: just the per-player line wording. Quick way to swap
    // the format without retyping placeholders. Customs append below built-ins.
    function defaultLineFormats() {
        return [
            { name: 'Name + timer',           body: '{name} — {time}' },
            { name: 'Name + timer + FF',      body: '{name} — {time} (FF {ff})' },
            { name: 'Name + timer + stats',   body: '{name} — {time} (~{stats})' },
            { name: 'Name + timer + both',    body: '{name} — {time} (~{stats}, FF {ff})' },
            { name: 'Name + release clock',   body: '{name} out at {clock} TCT' },
            { name: 'Name + FF only',         body: '{name} — FF {ff}' },
            { name: 'Name + respect est',     body: '{name} — {time} (~{respect} RP)' },
            { name: 'Name + FF + respect',    body: '{name} — FF {ff}, ~{respect} RP' },
            { name: 'Profile link (clickable)', body: '{name} ({time}) https://www.torn.com/profiles.php?XID={id}' },
            { name: 'Attack link (clickable)',  body: '{name} ({time}) https://www.torn.com/loader.php?sid=attack&user2ID={id}' },
            { name: 'Attack link + FF',         body: '{name} FF {ff} https://www.torn.com/loader.php?sid=attack&user2ID={id}' },
            { name: 'Compact',                body: '{name} {time}' },
        ];
    }
    function allLineFormats() {
        const custom = state.settings.massLineFormats || [];
        const builtinBodies = new Set(defaultLineFormats().map(f => f.body));
        const cleanCustom = custom.filter(f => f && f.body && !builtinBodies.has(f.body));
        return [...defaultLineFormats(), ...cleanCustom];
    }

    // One-time migration: if the user already has saved templates but none of
    // them use {ff}, append the FF-aware defaults so the feature is discoverable
    // without forcing a full reset (which would wipe their customs).
    (function migrateFFTemplates() {
        if (Store.get('mig_ff_templates', false)) return;
        const tpls = state.settings.templates || [];
        const hasFF = tpls.some(t => /\{ff\}/.test(t.body || ''));
        if (!hasFF) {
            tpls.push({ name: 'X out + stats/FF', body: '{name} out in {time} (~{stats}, FF {ff})' });
            tpls.push({ name: 'X out + FF',       body: '{name} out in {time} — FF {ff}' });
            state.settings.templates = tpls;
            Store.set('templates', tpls);
        }
        Store.set('mig_ff_templates', true);
    })();

    // One-time migration: a prior build briefly stripped FF from the mass-callout
    // line. If the saved line is the bare name+timer default, restore the
    // FF-bearing default. (Skips genuinely custom lines.)
    (function restoreMassLineFF() {
        if (Store.get('mig_mass_line_v3', false)) return;
        const cur = state.settings.massLineTpl || '';
        if (cur === '{name} — {time}') {
            state.settings.massLineTpl = '{name} — {time} (FF {ff})';
            Store.set('massLineTpl', state.settings.massLineTpl);
        }
        Store.set('mig_mass_line_v3', true);
    })();

    /* ════════════════════════════════════════════════════════════════════════
     * 4. TIME UTILITIES
     * Single source of truth for "now" so countdowns and callout math agree.
     * Torn exposes a server-synced clock via window.getCurrentTimestamp() on
     * many pages; we use it when present for sub-second accuracy.
     * ════════════════════════════════════════════════════════════════════════ */
    const Time = {
        nowSec() {
            try { if (typeof unsafeWindow !== 'undefined' && unsafeWindow.getCurrentTimestamp) return unsafeWindow.getCurrentTimestamp() / 1000; } catch (_) {}
            try { if (window.getCurrentTimestamp) return window.getCurrentTimestamp() / 1000; } catch (_) {}
            return Date.now() / 1000;
        },
        pad(n) { return n < 10 ? '0' + n : '' + n; },
        hms(totalSec) {
            totalSec = Math.max(0, Math.round(totalSec));
            const h = Math.floor(totalSec / 3600);
            const m = Math.floor((totalSec % 3600) / 60);
            const s = totalSec % 60;
            return `${Time.pad(h)}:${Time.pad(m)}:${Time.pad(s)}`;
        },
        // Human-friendly: "5m 12s", "1h 23m", "47s"
        human(totalSec) {
            totalSec = Math.max(0, Math.round(totalSec));
            const h = Math.floor(totalSec / 3600);
            const m = Math.floor((totalSec % 3600) / 60);
            const s = totalSec % 60;
            if (h > 0) return `${h}h ${Time.pad(m)}m`;
            if (m > 0) return s === 0 ? `${m}m` : `${m}m ${Time.pad(s)}s`;
            return `${s}s`;
        },
        clockTCT(unixSec) {
            const d = new Date(unixSec * 1000);
            return Time.pad(d.getUTCHours()) + ':' + Time.pad(d.getUTCMinutes());
        },
    };

    /* ════════════════════════════════════════════════════════════════════════
     * 5. DOM HELPERS
     * ════════════════════════════════════════════════════════════════════════ */
    const $  = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
    const el = (tag, props = {}, ...kids) => {
        const node = document.createElement(tag);
        for (const [k, v] of Object.entries(props)) {
            if (k === 'class') node.className = v;
            else if (k === 'style') node.style.cssText = v;
            else if (k === 'html') node.innerHTML = v;
            else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
            else node.setAttribute(k, v);
        }
        for (const kid of kids) if (kid != null) node.append(kid.nodeType ? kid : document.createTextNode(kid));
        return node;
    };
    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    /* ════════════════════════════════════════════════════════════════════════
     * 6. HTTP TRANSPORT
     * GM_xmlhttpRequest is used as the primary path so requests bypass any
     * page-level fetch/XHR interception (TornTools) and work on TornPDA. Falls
     * back to fetch() if no GM HTTP API is granted.
     * ════════════════════════════════════════════════════════════════════════ */
    function httpGetJSON(url) {
        return new Promise((resolve, reject) => {
            const gmReq = (typeof GM_xmlhttpRequest === 'function') ? GM_xmlhttpRequest
                        : (typeof GM !== 'undefined' && GM.xmlHttpRequest) ? GM.xmlHttpRequest : null;
            if (gmReq) {
                gmReq({
                    method: 'GET', url, timeout: 15000,
                    onload: (r) => {
                        try {
                            resolve(JSON.parse(r.responseText));
                        } catch (e) {
                            // Non-JSON body (HTML error page, 403, etc.) — surface status + snippet
                            reject(new Error(`HTTP ${r.status} non-JSON: ${String(r.responseText || '').slice(0, 120)}`));
                        }
                    },
                    onerror: (r) => reject(new Error(`network error (status ${r && r.status})`)),
                    ontimeout: () => reject(new Error('timeout')),
                });
            } else {
                fetch(url).then(async (r) => {
                    const txt = await r.text();
                    try { return JSON.parse(txt); }
                    catch (e) { throw new Error(`HTTP ${r.status} non-JSON: ${txt.slice(0, 120)}`); }
                }).then(resolve).catch(reject);
            }
        });
    }

    /* ════════════════════════════════════════════════════════════════════════
     * 7. API KEY MANAGEMENT
     * ════════════════════════════════════════════════════════════════════════ */
    function apiKeyValid(k) { return !!k && k.length === 16 && !k.includes('PDA-APIKEY'); }
    function promptApiKey() {
        const input = prompt('Torn War Tools needs a PUBLIC API key (16 chars) to read faction status:', state.apiKey || '');
        if (input && input.trim().length === 16) {
            state.apiKey = input.trim();
            Store.rawSet(C.KEY_API, state.apiKey);
            state.nextPollAllowedAt = 0;
            poll();
            return true;
        }
        return false;
    }
    try { GM_registerMenuCommand('Set Torn API Key', () => promptApiKey()); } catch (_) {}

    /* ════════════════════════════════════════════════════════════════════════
     * 8. FACTION / MEMBER DISCOVERY
     * ════════════════════════════════════════════════════════════════════════ */
    function getMemberLists() { return $$('ul.members-list'); }

    function getFactionIds() {
        const ids = new Set();
        for (const ul of getMemberLists()) {
            const link = ul.parentNode?.querySelector("a[href*='factions.php']");
            const m = link?.href.match(/ID=(\d+)/);
            if (m) ids.add(m[1]);
        }
        return [...ids];
    }

    // Map every visible enemy/your row by player id and cache its status div.
    function indexRows() {
        let changed = false;
        const seen = new Set();
        for (const ul of getMemberLists()) {
            for (const li of ul.querySelectorAll('li.enemy, li.your, li[class*="enemy"], li[class*="your"]')) {
                const profile = li.querySelector("a[href*='profiles.php']");
                const pid = profile?.href.match(/(?:XID=|user2ID=|ID=)(\d+)/)?.[1];
                if (!pid) continue;
                seen.add(pid);
                if (li.getAttribute(C.ATTR.PID) !== pid) li.setAttribute(C.ATTR.PID, pid);
                const prev = state.rows.get(pid);
                if (!prev || prev.li !== li) {
                    state.rows.set(pid, { li, statusDiv: li.querySelector('div.status'), countdownEl: null });
                    changed = true;
                }
            }
        }
        for (const pid of [...state.rows.keys()]) {
            if (!seen.has(pid)) { state.rows.delete(pid); changed = true; }
        }
        return changed;
    }

    /* ════════════════════════════════════════════════════════════════════════
     * 9. STATUS CACHE (smooths over poll gaps & page nav)
     * ════════════════════════════════════════════════════════════════════════ */
    function cacheWrite(fid, map) {
        try { localStorage.setItem(C.CACHE_PREFIX + fid, JSON.stringify({ t: Date.now(), m: map })); } catch (_) {}
    }
    function cacheRead(fid) {
        try {
            const raw = localStorage.getItem(C.CACHE_PREFIX + fid);
            if (!raw) return null;
            const p = JSON.parse(raw);
            return (Date.now() - p.t > C.CACHE_TTL) ? null : p.m;
        } catch (_) { return null; }
    }
    function hydrateFromCache() {
        for (const fid of getFactionIds()) {
            const c = cacheRead(fid);
            if (c) for (const [pid, s] of Object.entries(c)) state.members.set(pid, s);
        }
    }

    /* ════════════════════════════════════════════════════════════════════════
     * 10. API POLL
     * One call per faction to v1 /faction/{id}?selections=basic — the cheapest
     * way to get every member's status block. Adaptive cadence + error handling.
     * ════════════════════════════════════════════════════════════════════════ */
    function abbreviate(desc) {
        let out = desc || '';
        for (const [full, abbr] of Object.entries(C.COUNTRY_ABBR)) out = out.replace(full, abbr);
        return out;
    }

    async function poll() {
        if (!state.running || !state.warFound) return;
        if (!apiKeyValid(state.apiKey)) { promptApiKey(); return; }
        const now = Date.now();
        if (now < state.nextPollAllowedAt) return;
        state.lastPollAt = now;

        const fids = getFactionIds();
        for (const fid of fids) {
            let data;
            try {
                data = await httpGetJSON(`https://api.torn.com/faction/${fid}?selections=basic&key=${state.apiKey}&comment=TornWarTools`);
            } catch (e) { LOG('request failed', e.message); continue; }

            if (data.error) {
                const code = data.error.code ?? data.error;
                LOG('API error', code, data.error.error || '');
                if (C.FATAL_API.has(code)) { state.running = false; Toast.show('⚠ API key rejected — open ⚙ to re-enter'); return; }
                if (C.RETRY_API.has(code)) state.nextPollAllowedAt = now + C.API_BACKOFF;
                continue;
            }
            if (!data.members) continue;

            const reqTime = Math.floor(Time.nowSec());
            const fmap = {};
            for (const [pid, member] of Object.entries(data.members)) {
                const s = member.status || {};
                const prev = state.members.get(pid);
                const rec = {
                    state: s.state || 'Unknown',
                    until: s.until || 0,
                    description: abbreviate(s.description || ''),
                    since: (prev && prev.state === s.state) ? prev.since : reqTime,
                    lastSeen: reqTime,
                };
                state.members.set(pid, rec);
                fmap[pid] = rec;
            }
            cacheWrite(fid, fmap);
        }
        // schedule next
        state.nextPollAllowedAt = Date.now() + (document.hidden ? C.POLL_HIDDEN : C.POLL_ACTIVE);
    }

    /* ════════════════════════════════════════════════════════════════════════
     * 10b. FFSCOUTER POLL
     * Bulk-fetches battle-stat estimates + fair-fight scores for every visible
     * ENEMY player in one request (get-stats supports up to 205 IDs). Results
     * feed the {stats} and {ff} callout placeholders and the optional inline
     * stats badge. Skipped entirely if no FFScouter key is set.
     * ════════════════════════════════════════════════════════════════════════ */
    function ffsKeyValid(k) { return !!k && /^[A-Za-z0-9]{16}$/.test(k); }

    // Pull the list of result records out of whatever shape FFScouter returns.
    // Known/likely shapes: a bare array, { results: [...] }, { data: [...] },
    // or an object keyed by player id { "12345": {...} }.
    function ffsExtractRecords(data) {
        if (Array.isArray(data)) return data;
        if (data && Array.isArray(data.results)) return data.results;
        if (data && Array.isArray(data.data)) return data.data;
        if (data && typeof data === 'object') {
            // object keyed by id? collect values that look like records
            const vals = Object.values(data).filter(v => v && typeof v === 'object' && (v.player_id != null || v.fair_fight != null || v.bs_estimate_human != null));
            if (vals.length) return vals;
        }
        return [];
    }

    // Read a record's player id / estimate / fair-fight across field-name variants.
    function ffsReadRecord(r) {
        const pid = r.player_id ?? r.playerId ?? r.id ?? r.user_id ?? null;
        const est = r.bs_estimate_human ?? r.bs_estimate ?? r.estimate_human ?? r.estimate ?? null;
        let ff = r.fair_fight ?? r.fairfight ?? r.ff ?? null;
        if (typeof ff === 'string') { const n = parseFloat(ff); ff = Number.isFinite(n) ? n : null; }
        return { pid: pid == null ? null : String(pid), est: est != null ? String(est) : null, ff: (typeof ff === 'number') ? ff : null };
    }

    let _ffsDiagShown = false;
    async function pollFFScouter() {
        if (!state.warFound || !ffsKeyValid(state.ffsKey)) return;
        const now = Date.now();
        if (now < state.nextFfsAllowedAt) return;

        const ids = [];
        for (const [pid, row] of state.rows) {
            if (!isOwnFaction(row.li)) ids.push(pid);
        }
        if (!ids.length) return;
        state.nextFfsAllowedAt = now + C.FFS_POLL;

        for (let i = 0; i < ids.length; i += 200) {
            const chunk = ids.slice(i, i + 200);
            const url = `${C.FFS_ENDPOINT}?key=${state.ffsKey}&targets=${chunk.join(',')}&comment=TornWarTools`;
            let data;
            try {
                data = await httpGetJSON(url);
            } catch (e) { LOG('FFScouter request FAILED', e.message, '\n  url:', url.replace(state.ffsKey, '***')); continue; }

            // Error envelope (FFScouter returns { error, code } or { message })
            if (data && (data.error || data.code) && !Array.isArray(data) && !data.results && !data.data) {
                const code = data.code ?? '?';
                const msg = data.error ?? data.message ?? JSON.stringify(data);
                LOG('FFScouter API error — code', code, '·', msg);
                state.ffsLastError = `${code}: ${msg}`;
                if ([1, 2, 6, 7].includes(code) || /key/i.test(String(msg))) {
                    Toast.show('⚠ FFScouter key issue: ' + msg);
                }
                return;
            }

            const records = ffsExtractRecords(data);

            // One-time diagnostic so we can SEE the real shape on the live device.
            if (!_ffsDiagShown) {
                _ffsDiagShown = true;
                LOG('FFScouter response OK. records:', records.length,
                    '\n  sample:', records[0] ? JSON.stringify(records[0]) : '(none)',
                    '\n  top-level keys:', data && typeof data === 'object' ? Object.keys(data).slice(0, 8) : typeof data);
            }

            const t = Math.floor(Time.nowSec());
            let stored = 0;
            for (const r of records) {
                const rec = ffsReadRecord(r);
                if (rec.pid == null) continue;
                state.ffs.set(rec.pid, { estHuman: rec.est, ff: rec.ff, fetchedAt: t });
                stored++;
            }
            state.ffsLastError = stored ? null : (state.ffsLastError || 'response had no usable records');
        }
    }

    // Format a player's FFScouter data for display: "~1.2m · FF 2.4"
    function ffsLabel(pid) {
        const d = state.ffs.get(String(pid));
        if (!d) return '';
        const parts = [];
        if (d.estHuman) parts.push('~' + d.estHuman);
        if (d.ff != null) parts.push('FF ' + d.ff.toFixed(2));
        return parts.join(' · ');
    }

    /* ════════════════════════════════════════════════════════════════════════
     * 11. ROW RENDERING
     * Instead of TWSE's CSS ::after trick, we render the countdown into a real
     * <span> we own. This eliminates all the z-index/pointer-events/overflow
     * gymnastics the callout button needed, and lets us color/position freely.
     * ════════════════════════════════════════════════════════════════════════ */
    function classifyTraveling(desc) {
        if (desc.includes('Traveling to ')) return { bucket: C.SORT.TRAVEL_TO, label: '► ' + desc.split('Traveling to ')[1], loc: desc.split('Traveling to ')[1] };
        if (desc.includes('Returning'))     return { bucket: C.SORT.RETURNING, label: '◄ ' + (desc.split('Returning to Torn from ')[1] || 'Torn'), loc: desc.split('Returning to Torn from ')[1] || '' };
        if (desc.includes('In '))           return { bucket: C.SORT.ABROAD, label: desc.split('In ')[1], loc: desc.split('In ')[1] };
        return { bucket: C.SORT.TRAVELING, label: 'Traveling', loc: '' };
    }

    // Hide Torn's own status content (element children + bare text nodes) so
    // only our countdown shows. Stash originals so we can restore on "Okay".
    function hideNativeStatus(statusDiv) {
        for (const node of [...statusDiv.childNodes]) {
            if (node.nodeType === Node.TEXT_NODE) {
                if (node.textContent.trim()) { node.__wtText = node.textContent; node.textContent = ''; }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                if (!node.classList.contains('wt-countdown') && !node.classList.contains('wt-callout') && !node.classList.contains('wt-stats')) {
                    node.dataset.wtHidden = '1';
                }
            }
        }
    }
    function restoreNativeStatus(statusDiv) {
        for (const node of [...statusDiv.childNodes]) {
            if (node.nodeType === Node.TEXT_NODE && node.__wtText != null) { node.textContent = node.__wtText; delete node.__wtText; }
            else if (node.nodeType === Node.ELEMENT_NODE && node.dataset && node.dataset.wtHidden) delete node.dataset.wtHidden;
        }
    }

    function ensureCountdownEl(row) {
        if (row.countdownEl && row.countdownEl.isConnected) return row.countdownEl;
        const span = el('span', { class: 'wt-countdown' });
        row.statusDiv.appendChild(span);
        row.countdownEl = span;
        return span;
    }

    function paintRow(pid, rec) {
        const row = state.rows.get(pid);
        if (!row || !row.li.isConnected) return;
        const { li, statusDiv } = row;
        if (!statusDiv) return;

        const nowSec = Time.nowSec();
        const remaining = Math.round((rec.until || 0) - nowSec);

        li.setAttribute(C.ATTR.UNTIL, rec.until || 0);
        li.setAttribute(C.ATTR.SINCE, rec.since || 0);
        li.setAttribute(C.ATTR.STATE, rec.state);

        let bucket = C.SORT.OKAY, loc = '', highlight = false;
        const manage = (rec.state === 'Hospital' || rec.state === 'Jail' || rec.state === 'Traveling' || rec.state === 'Abroad');

        if (manage) {
            statusDiv.classList.add('wt-managed');
            hideNativeStatus(statusDiv);
        } else {
            statusDiv.classList.remove('wt-managed');
            restoreNativeStatus(statusDiv);
        }

        if (rec.state === 'Hospital' || rec.state === 'Jail') {
            bucket = C.SORT.HOSPITAL;
            if (remaining > 0) {
                const cd = ensureCountdownEl(row);
                cd.textContent = Time.hms(remaining);
                cd.dataset.kind = remaining < C.RED_THRESHOLD ? 'urgent' : 'hosp';
                highlight = remaining < C.RED_THRESHOLD;
                if (rec.state === 'Hospital' && calloutAllowedFor('hosp')) ensureCallout(pid, row);
                else removeCallout(row);
            } else {
                clearCountdown(row);
                removeCallout(row);
            }
        } else if (rec.state === 'Traveling' || rec.state === 'Abroad') {
            const t = classifyTraveling(rec.description);
            bucket = t.bucket; loc = t.loc;
            const cd = ensureCountdownEl(row);
            cd.textContent = t.label;
            cd.dataset.kind = 'travel';
            if (calloutAllowedFor('traveling')) ensureCallout(pid, row); else removeCallout(row);
        } else { // Okay / Unknown — let Torn's native text show
            bucket = C.SORT.OKAY;
            clearCountdown(row);
            if (calloutAllowedFor('okay')) ensureCallout(pid, row); else removeCallout(row);
        }

        li.setAttribute(C.ATTR.SORT, bucket);
        li.setAttribute(C.ATTR.LOC, loc);
        li.classList.toggle('wt-highlight', highlight);
        updateInlineStats(pid, row);
    }

    function clearCountdown(row) {
        if (row.countdownEl) { row.countdownEl.remove(); row.countdownEl = null; }
    }

    // Optional inline stat badge on enemy rows. Rendered in the SCORE column
    // (roomy) rather than the cramped status/timer cell, so it never collides
    // with the countdown or the callout buttons.
    function updateInlineStats(pid, row) {
        // Always clean up any stray badge from the old status-cell location.
        const oldInStatus = row.statusDiv?.querySelector('.wt-stats');
        if (oldInStatus) oldInStatus.remove();

        const scoreCell = row.li.querySelector('div.points, [class*="points"]');
        const existing = scoreCell ? scoreCell.querySelector('.wt-stats') : row.li.querySelector('.wt-stats');

        if (!state.settings.showStatsInline || isOwnFaction(row.li)) {
            if (existing) existing.remove();
            return;
        }
        const label = ffsLabel(pid);
        if (!label) { if (existing) existing.remove(); return; }
        if (!scoreCell) return; // no obvious home; skip rather than crowd status

        let badge = existing;
        if (!badge) {
            badge = el('span', { class: 'wt-stats' });
            scoreCell.appendChild(badge);
        }
        badge.textContent = label;
    }

    // Repaint just the countdown text every second (cheap; no re-classify).
    function tickCountdowns() {
        const nowSec = Time.nowSec();
        for (const [pid, rec] of state.members) {
            if (rec.state !== 'Hospital' && rec.state !== 'Jail') continue;
            const row = state.rows.get(pid);
            if (!row || !row.countdownEl) continue;
            const remaining = Math.round((rec.until || 0) - nowSec);
            if (remaining <= 0) { paintRow(pid, rec); continue; } // flip handling
            row.countdownEl.textContent = Time.hms(remaining);
            const urgent = remaining < C.RED_THRESHOLD;
            row.countdownEl.dataset.kind = urgent ? 'urgent' : 'hosp';
            row.li.classList.toggle('wt-highlight', urgent);
        }
    }

    /* ════════════════════════════════════════════════════════════════════════
     * 12. SORTING
     * Hospital-first (by soonest release) when enabled; otherwise a full status
     * sort matching the column the user clicked. DocumentFragment keeps it to a
     * single reflow, and we suspend our own observer during the swap.
     * ════════════════════════════════════════════════════════════════════════ */
    const num = (li, attr) => { const v = parseInt(li.getAttribute(attr), 10); return Number.isFinite(v) ? v : 0; };

    function compareFull(a, b, desc) {
        const as = li => li.hasAttribute(C.ATTR.SORT) ? num(li, C.ATTR.SORT) : C.SORT.UNKNOWN;
        const av = as(a), bv = as(b);
        if (av !== bv) return desc ? bv - av : av - bv;
        if (av === C.SORT.HOSPITAL) { const c = num(a, C.ATTR.UNTIL) - num(b, C.ATTR.UNTIL); if (c) return c; }
        else { const c = num(b, C.ATTR.SINCE) - num(a, C.ATTR.SINCE); if (c) return c; }
        return num(a, C.ATTR.PID) - num(b, C.ATTR.PID);
    }

    function sortAll() {
        for (const ul of getMemberLists()) {
            const kids = [...ul.children];
            let sorted;
            if (state.hospFirst) {
                const hosp = [], rest = [];
                for (const li of kids) (li.getAttribute(C.ATTR.SORT) === String(C.SORT.HOSPITAL) ? hosp : rest).push(li);
                hosp.sort((a, b) => (num(a, C.ATTR.UNTIL) - num(b, C.ATTR.UNTIL)) || (num(a, C.ATTR.PID) - num(b, C.ATTR.PID)));
                sorted = [...hosp, ...rest];
            } else {
                sorted = kids.slice().sort((a, b) => compareFull(a, b, false));
            }
            let same = true;
            for (let i = 0; i < sorted.length; i++) if (ul.children[i] !== sorted[i]) { same = false; break; }
            if (same) continue;
            suspendObserver(ul);
            const frag = document.createDocumentFragment();
            sorted.forEach(li => frag.appendChild(li));
            ul.appendChild(frag);
            resumeObserver(ul);
        }
    }

    /* ════════════════════════════════════════════════════════════════════════
     * 13. CALLOUT BUTTON
     * Real DOM element placed in the status-column gutter. Enemy-only unless the
     * user opts in. Click → modal.
     * ════════════════════════════════════════════════════════════════════════ */
    function isOwnFaction(li) { return li.classList.contains('your') || /\byour\b/.test(li.className) || /your___/.test(li.className); }

    // Read a row's online state. Torn marks the avatar wrapper link with one of
    // the gradient-dot classes online___ / idle___ / offline___ (hash-suffixed).
    // We read the class tokens of the avatar link specifically and look for the
    // FIRST token that starts with one of those prefixes — this avoids matching
    // unrelated sprite icons elsewhere in the row.
    function classifyStateToken(className) {
        const tokens = (className || '').split(/\s+/);
        for (const tok of tokens) {
            if (tok.startsWith('online___'))  return 'online';
            if (tok.startsWith('idle___'))    return 'idle';
            if (tok.startsWith('offline___')) return 'offline';
        }
        return null;
    }

    function onlineState(li) {
        // 1) The avatar link is the authoritative carrier.
        const avatar = li.querySelector('a[data-label="avatar"]');
        if (avatar) {
            const s = classifyStateToken(avatar.className);
            if (s) return s;
        }
        // 2) Search within the row for any element whose class TOKEN is a state.
        for (const node of li.querySelectorAll('[class*="online___"], [class*="idle___"], [class*="offline___"]')) {
            const s = classifyStateToken(node.className);
            if (s) return s;
        }
        // 3) Some virtual-scroll layouts render the indicator in a wrapper that
        //    is a sibling/ancestor of the content rather than a child of the
        //    <li>. Climb up to the nearest row-ish container and search there,
        //    but stay scoped to this one row (don't bleed into siblings).
        const container = li.closest('[class*="root___"]') || li.parentElement;
        if (container && container !== li) {
            const a2 = container.querySelector('a[data-label="avatar"]');
            if (a2) { const s = classifyStateToken(a2.className); if (s) return s; }
        }
        return null;
    }

    // One-time diagnostic: dump the structure of the first enemy row so we can
    // see exactly where (if anywhere) the online indicator lives on this device.
    let _debugDumped = false;
    function debugDumpRow() {
        if (_debugDumped) return;
        for (const [pid, row] of state.rows) {
            if (isOwnFaction(row.li)) continue;
            _debugDumped = true;
            const av = row.li.querySelector('a[data-label="avatar"]');
            LOG('DEBUG row pid', pid,
                '\n  state detected:', onlineState(row.li),
                '\n  avatar class:', av ? av.className : '(no avatar link)',
                '\n  li class:', row.li.className);
            const dots = row.li.querySelectorAll('[class*="online___"],[class*="idle___"],[class*="offline___"]');
            LOG('  state-class elements in row:', dots.length,
                [...dots].map(d => d.tagName + '.' + d.className).slice(0, 5));
            break;
        }
    }

    // Hide/show a row based on the offline/idle hide settings. Only ever hides
    // ENEMY rows (you always want to see your own faction). Never hides a row
    // that's currently in hospital with a live timer — that's the whole point
    // of a callout, even if they're idle/offline.
    function applyRowVisibility(pid, rec) {
        const row = state.rows.get(pid);
        if (!row || !row.li.isConnected) return;
        const S = state.settings;
        if (!S.hideOffline && !S.hideIdle && !S.hideOnline) { row.li.classList.remove('wt-hidden-row'); return; }
        if (isOwnFaction(row.li)) { row.li.classList.remove('wt-hidden-row'); return; }

        const st = onlineState(row.li);
        let hide = false;
        if (S.hideOffline && st === 'offline') hide = true;
        if (S.hideIdle && st === 'idle') hide = true;
        if (S.hideOnline && st === 'online') hide = true;

        row.li.classList.toggle('wt-hidden-row', hide);
    }

    // Which player states get callout buttons. Controlled by settings.calloutStates,
    // a set like {hosp:true, okay:true, traveling:false}.
    function calloutAllowedFor(stateKey) {
        const cs = state.settings.calloutStates || { hosp: true, okay: false, traveling: false };
        return !!cs[stateKey];
    }

    function ensureCallout(pid, row) {
        const { li, statusDiv } = row;
        if (!statusDiv) return;
        if (isOwnFaction(li) && !state.settings.calloutOnOwn) { removeCallout(row); return; }

        li.classList.add('wt-has-callout');

        // Host the buttons in the ATTACK column (rightmost), appended after the
        // Attack link so they sit to its right. Fall back to the status cell if
        // the attack cell can't be found.
        const host = li.querySelector('[class*="attack___"]') || li.querySelector('div.attack') || statusDiv;
        host.classList.add('wt-callout-host');

        const hasModal = host.querySelector('.wt-callout-modal');
        const hasQuick = host.querySelector('.wt-quick');

        // Quick-call (⚡): add if enabled & missing, remove if disabled & present.
        if (state.settings.quickCallBtn && !hasQuick) {
            const quick = el('a', {
                class: 'wt-callout wt-quick', href: 'javascript:void(0)',
                title: 'Quick call (last used template)',
                onclick: (e) => { e.preventDefault(); e.stopPropagation(); quickCallout(pid); },
            }, '⚡');
            host.appendChild(quick);
        } else if (!state.settings.quickCallBtn && hasQuick) {
            hasQuick.remove();
        }

        // Full callout (📢): the modal opener.
        if (!hasModal) {
            const btn = el('a', {
                class: 'wt-callout wt-callout-modal', href: 'javascript:void(0)',
                title: 'Send callout (open editor)',
                onclick: (e) => { e.preventDefault(); e.stopPropagation(); openCalloutModal(pid); },
            }, '📢');
            host.appendChild(btn);
        }
    }
    function removeCallout(row) {
        // Buttons may live in the attack cell or (fallback) the status cell.
        row.li.querySelectorAll('.wt-callout').forEach(b => b.remove());
        row.li.querySelectorAll('.wt-callout-host').forEach(h => h.classList.remove('wt-callout-host'));
        row.li.classList.remove('wt-has-callout');
    }

    function memberName(pid) {
        const row = state.rows.get(pid);
        const a = row?.li.querySelector("a[href*='profiles.php']");
        if (a) {
            const aria = a.getAttribute('aria-label') || '';
            const m = aria.match(/View profile of (.+)$/);
            if (m) return m[1].trim();
            const h = a.querySelector('.honor-text');
            if (h) return h.textContent.trim();
        }
        return 'Player ' + pid;
    }

    /* ════════════════════════════════════════════════════════════════════════
     * 14. FACTION CHAT SEND
     * ════════════════════════════════════════════════════════════════════════ */
    function sendToFactionChat(text) {
        const cands = $$('textarea.tt-chat-autocomplete, .root___dCIzf textarea, textarea[placeholder*="Type your message"]');
        const ta = cands.find(t => t.offsetParent !== null) || cands[0];
        if (!ta) { Toast.show('⚠ Open the faction chat panel first'); return false; }

        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        setter ? setter.call(ta, text) : (ta.value = text);
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
        ta.focus();
        ['keydown', 'keypress', 'keyup'].forEach(type =>
            ta.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true })));
        setTimeout(() => {
            if (ta.value) {
                const send = ta.parentElement?.querySelector('button.iconWrapper___SHmCW, button[type="button"]');
                if (send && !send.disabled) send.click();
            }
        }, 30);
        return true;
    }
    function copyText(text) {
        try { navigator.clipboard.writeText(text); return true; }
        catch (_) {
            try { const t = el('textarea', { style: 'position:fixed;opacity:0' }); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); return true; }
            catch (e) { return false; }
        }
    }

    function buildMessage(tpl, ctx) {
        return tpl.replace(/\{name\}/g, ctx.name).replace(/\{time\}/g, ctx.time)
                  .replace(/\{clock\}/g, ctx.clock).replace(/\{id\}/g, ctx.id)
                  .replace(/\{stats\}/g, ctx.stats).replace(/\{ff\}/g, ctx.ff)
                  .replace(/\{est\}/g, ctx.stats)   // {est} alias for {stats}
                  .replace(/\{level\}/g, ctx.level).replace(/\{respect\}/g, ctx.respect);
    }

    /* ── Respect calculator ──────────────────────────────────────────────────
     * Torn respect per attack (per the wiki, Chain > Fair fights):
     *   Respect = BaseRespect × FF × War × Overseas × Group × Chain
     *   BaseRespect scales linearly with DEFENDER level:
     *     level 1  → 1.00,  level 100 → 1.50   →  1 + (level-1) × (0.5/99)
     *   FF (1–3×)   comes from FFScouter per player.
     *   War 2×, Overseas 1.25× are optional toggles.
     * We surface the "EBR" (Expected Base Respect = Base × FF), matching common
     * war tools, then apply optional war/overseas multipliers the user picks.
     * ──────────────────────────────────────────────────────────────────────── */
    function baseRespectForLevel(level) {
        const lv = Math.max(1, Math.min(100, level || 1));
        return 1 + (lv - 1) * (0.5 / 99);
    }
    // Read the level shown in a member row (the Level column).
    function rowLevel(pid) {
        const row = state.rows.get(String(pid));
        if (!row) return null;
        const cell = row.li.querySelector('div.level, [class*="level"]');
        if (!cell) return null;
        const m = (cell.textContent || '').match(/\d+/);
        return m ? parseInt(m[0], 10) : null;
    }
    // Estimate respect for a player. opts: { war, overseas } booleans.
    function estimateRespect(pid, opts = {}) {
        const level = rowLevel(pid);
        const ffd = state.ffs.get(String(pid));
        const ff = ffd && ffd.ff != null ? ffd.ff : null;
        if (level == null || ff == null) return null;   // need both to be meaningful
        let r = baseRespectForLevel(level) * ff;
        if (opts.war) r *= 2;
        if (opts.overseas) r *= 1.25;
        return r;
    }
    function fmtRespect(r) {
        if (r == null) return '?';
        return r.toFixed(2);
    }


    // Build the callout text for a player using the CURRENTLY SAVED settings
    // (last template, last offset, last time-mode). Shared by the modal preview
    // path and the one-tap quick-call button so they always agree.
    function composeCallout(pid) {
        const S = state.settings;
        const rec = state.members.get(String(pid)) || {};
        const until = rec.until || 0;
        const tpl = S.templates[Math.min(S.lastTemplate, S.templates.length - 1)] || S.templates[0];
        const offSec = Math.round((S.offsetSeconds || 0));
        const nowSec = Time.nowSec();
        const mode = S.defaultMode === 'clock' ? 'remaining' : (S.defaultMode || 'remaining');
        const target = (mode === 'remaining' && until > 0) ? until + offSec : nowSec + offSec;
        const ffd = state.ffs.get(String(pid));
        const isHosp = (rec.state === 'Hospital' || rec.state === 'Jail') && until > nowSec;
        const timeStr = isHosp ? Time.human(target - nowSec) : (rec.state === 'Okay' ? 'OUT' : (rec.state || 'OUT'));
        return buildMessage(tpl.body, {
            name: memberName(pid), id: pid,
            time: timeStr,
            clock: isHosp ? Time.clockTCT(target) : '--:--',
            stats: ffd && ffd.estHuman ? ffd.estHuman : '?',
            ff: ffd && ffd.ff != null ? ffd.ff.toFixed(2) : '?',
            level: rowLevel(pid) ?? '?',
            respect: fmtRespect(estimateRespect(pid, { war: state.settings.massRespWar, overseas: state.settings.massRespOverseas })),
        });
    }

    // One-tap quick call: compose from saved settings and send immediately,
    // no modal. Used by the ⚡ button.
    function quickCallout(pid) {
        const text = composeCallout(pid);
        if (sendToFactionChat(text)) {
            Toast.show('⚡ ' + text.slice(0, 44) + (text.length > 44 ? '…' : ''));
        }
    }

    /* ════════════════════════════════════════════════════════════════════════
     * MASS CALLOUT
     * Compiles a multi-line target list for every (filtered) enemy, sortable by
     * FF, hospital time, stats, or name, and sends it to faction chat (chunked
     * to respect chat length limits).
     * ════════════════════════════════════════════════════════════════════════ */

    // Build a normalized data row for one player for the mass list.
    function massRowData(pid) {
        const rec = state.members.get(String(pid)) || {};
        const ffd = state.ffs.get(String(pid));
        const row = state.rows.get(String(pid));
        const nowSec = Time.nowSec();
        const until = rec.until || 0;
        const remaining = until > 0 ? Math.max(0, Math.round(until - nowSec)) : 0;
        const st = rec.state || 'Unknown';
        return {
            pid,
            name: memberName(pid),
            state: st,
            inHosp: (st === 'Hospital' || st === 'Jail') && remaining > 0,
            isOkay: st === 'Okay',
            isTraveling: st === 'Traveling' || st === 'Abroad',
            until, remaining,
            online: row ? onlineState(row.li) : null,   // 'online' | 'idle' | 'offline' | null
            ff: ffd && ffd.ff != null ? ffd.ff : null,
            est: ffd && ffd.estHuman ? ffd.estHuman : null,
            level: rowLevel(pid),
            respect: estimateRespect(pid, { war: state.settings.massRespWar, overseas: state.settings.massRespOverseas }),
        };
    }

    function gatherMassRows(opts) {
        // opts: { filter, onlineFilter, maxFFEnabled, maxFF, hospUnderEnabled, hospUnderMin }
        const rows = [];
        for (const [pid, row] of state.rows) {
            if (isOwnFaction(row.li)) continue;
            // Respect the offline/idle hide settings so the mass list matches what you see
            if (row.li.classList.contains('wt-hidden-row')) continue;
            const d = massRowData(pid);

            // Status filter
            if (opts.filter === 'hosp' && !d.inHosp) continue;
            if (opts.filter === 'out' && d.inHosp) continue;            // anyone not in hosp (okay/travel/etc)
            if (opts.filter === 'okay' && !d.isOkay) continue;          // strictly attackable now
            if (opts.filter === 'traveling' && !d.isTraveling) continue;

            // Online-state filter
            if (opts.onlineFilter === 'online' && d.online !== 'online') continue;
            if (opts.onlineFilter === 'idle_online' && !(d.online === 'online' || d.online === 'idle')) continue;
            if (opts.onlineFilter === 'offline' && d.online !== 'offline') continue;

            // FF ceiling (only keep targets at or below this FF; players with no
            // FF data are kept so you don't silently miss them)
            if (opts.maxFFEnabled && d.ff != null && d.ff > opts.maxFF) continue;

            // Hospital "out within N minutes" filter (only meaningful for hosp rows)
            if (opts.hospUnderEnabled) {
                if (!d.inHosp) continue;
                if (d.remaining > opts.hospUnderMin * 60) continue;
            }

            rows.push(d);
        }
        return rows;
    }

    function sortMassRows(rows, sortBy) {
        const byName = (a, b) => a.name.localeCompare(b.name);
        const cmp = {
            ff_asc:   (a, b) => (a.ff ?? 1e9) - (b.ff ?? 1e9) || byName(a, b),
            ff_desc:  (a, b) => (b.ff ?? -1) - (a.ff ?? -1) || byName(a, b),
            hosp_asc: (a, b) => {
                // soonest out first; non-hosp pushed to the bottom
                const av = a.inHosp ? a.remaining : 1e9;
                const bv = b.inHosp ? b.remaining : 1e9;
                return av - bv || byName(a, b);
            },
            hosp_desc: (a, b) => {
                const av = a.inHosp ? a.remaining : -1;
                const bv = b.inHosp ? b.remaining : -1;
                return bv - av || byName(a, b);
            },
            stats_desc: (a, b) => parseEstHuman(b.est) - parseEstHuman(a.est) || byName(a, b),
            stats_asc:  (a, b) => parseEstHuman(a.est) - parseEstHuman(b.est) || byName(a, b),
            respect_desc: (a, b) => (b.respect ?? -1) - (a.respect ?? -1) || byName(a, b),
            respect_asc:  (a, b) => (a.respect ?? 1e9) - (b.respect ?? 1e9) || byName(a, b),
            name:       byName,
        }[sortBy] || ((a, b) => (a.ff ?? 1e9) - (b.ff ?? 1e9) || byName(a, b));
        return rows.slice().sort(cmp);
    }

    // Convert "1.2m" / "33.3k" / "2.99b" to a number for sorting.
    function parseEstHuman(s) {
        if (!s) return 0;
        const m = String(s).match(/([\d.]+)\s*([kmb])?/i);
        if (!m) return 0;
        let n = parseFloat(m[1]) || 0;
        const unit = (m[2] || '').toLowerCase();
        if (unit === 'k') n *= 1e3;
        else if (unit === 'm') n *= 1e6;
        else if (unit === 'b') n *= 1e9;
        return n;
    }

    // Format one line of the mass message from the chosen line template.
    function formatMassLine(d, lineTpl) {
        const timeStr = d.inHosp ? Time.hms(d.remaining) : (d.state === 'Okay' ? 'OUT' : d.state);
        return lineTpl
            .replace(/\{name\}/g, d.name)
            .replace(/\{id\}/g, d.pid)
            .replace(/\{time\}/g, timeStr)
            .replace(/\{clock\}/g, d.until > 0 ? Time.clockTCT(d.until) : '--:--')
            .replace(/\{stats\}/g, d.est ? '~' + d.est : '?')
            .replace(/\{ff\}/g, d.ff != null ? d.ff.toFixed(2) : '?')
            .replace(/\{state\}/g, d.state)
            .replace(/\{level\}/g, d.level ?? '?')
            .replace(/\{respect\}/g, fmtRespect(d.respect));
    }

    function openMassCallout() {
        const { bg, box } = modalShell(560);
        const S = state.settings;

        box.innerHTML = `
            <h2>📋 Mass Callout</h2>

            <label style="margin-top:0">Preset</label>
            <div class="wt-row" style="align-items:center">
                <select class="wt-mass-preset" style="flex:1"></select>
                <button class="wt-preset-save" title="Save current settings as a preset" style="flex:0 0 auto">Save as…</button>
                <button class="wt-preset-del" title="Delete selected custom preset" style="flex:0 0 auto;background:#5a2a2a;border-color:#7a3a3a">Delete</button>
            </div>
            <div class="wt-help">Pick a preset to load its filters &amp; format instantly, then tweak below if needed.</div>

            <div class="wt-row" style="margin-top:8px">
                <div>
                    <label style="margin-top:0">Status</label>
                    <select class="wt-mass-filter">
                        <option value="all">Everyone (visible)</option>
                        <option value="hosp">In hospital only</option>
                        <option value="out">Out of hospital</option>
                        <option value="okay">Okay (attackable now)</option>
                        <option value="traveling">Traveling/abroad</option>
                    </select>
                </div>
                <div>
                    <label style="margin-top:0">Sort by</label>
                    <select class="wt-mass-sort">
                        <option value="hosp_asc">Hosp time — soonest out</option>
                        <option value="hosp_desc">Hosp time — latest out</option>
                        <option value="ff_asc">FF — lowest first (easiest)</option>
                        <option value="ff_desc">FF — highest first</option>
                        <option value="stats_asc">Stats — lowest first</option>
                        <option value="stats_desc">Stats — highest first</option>
                        <option value="respect_desc">Respect — most first</option>
                        <option value="respect_asc">Respect — least first</option>
                        <option value="name">Name (A–Z)</option>
                    </select>
                </div>
            </div>

            <div class="wt-row" style="margin-top:6px">
                <div>
                    <label style="margin-top:0">Online state</label>
                    <select class="wt-mass-online">
                        <option value="any">Any</option>
                        <option value="online">Online only</option>
                        <option value="idle_online">Online + idle</option>
                        <option value="offline">Offline only</option>
                    </select>
                </div>
                <div>
                    <label style="margin-top:0">Limit count</label>
                    <input type="number" class="wt-mass-limit" min="0" max="200" step="1" placeholder="0 = no limit">
                </div>
            </div>

            <div class="wt-row" style="align-items:center;margin-top:6px">
                <label class="wt-switch" style="margin:0;flex:0 0 auto"><input type="checkbox" class="wt-mass-ffcap"><span>Only FF ≤</span></label>
                <input type="number" class="wt-mass-ffval" min="0" max="10" step="0.25" style="flex:0 0 70px">
                <label class="wt-switch" style="margin:0 0 0 12px;flex:0 0 auto"><input type="checkbox" class="wt-mass-hospu"><span>Out within</span></label>
                <input type="number" class="wt-mass-hospumin" min="1" max="120" step="1" style="flex:0 0 60px">
                <span style="font-size:11px;color:#aaa">min</span>
            </div>

            <div class="wt-row" style="align-items:center;margin-top:6px">
                <span style="font-size:11px;color:#aaa;flex:0 0 auto">Respect estimate assumes:</span>
                <label class="wt-switch" style="margin:0;flex:0 0 auto"><input type="checkbox" class="wt-mass-war"><span>War ×2</span></label>
                <label class="wt-switch" style="margin:0 0 0 12px;flex:0 0 auto"><input type="checkbox" class="wt-mass-overseas"><span>Overseas ×1.25</span></label>
            </div>

            <label>Line format</label>
            <select class="wt-mass-lineformat" style="margin-bottom:4px"></select>
            <input type="text" class="wt-mass-line" value="${esc(S.massLineTpl)}">
            <div class="wt-help">Per-player line. Pick a format above or type your own. Placeholders: {name} {time} {clock} {stats} {ff} {state} {id} {level} {respect}<br>Links: Torn chat shows full URLs as plain text — they're only tappable if you (and readers) run a "clickable chat links" script like TornTools. The name itself can't be hyperlinked.</div>

            <div class="wt-row" style="align-items:center;margin-top:6px">
                <label class="wt-switch" style="margin:0"><input type="checkbox" class="wt-mass-header"><span>Add a header line</span></label>
                <input type="text" class="wt-mass-headtext" value="${esc(S.massHeader)}" placeholder="Header text" style="flex:1">
            </div>
            <div class="wt-row" style="align-items:center;margin-top:6px">
                <label class="wt-switch" style="margin:0"><input type="checkbox" class="wt-mass-number"><span>Number each line (1. 2. 3.)</span></label>
            </div>

            <label>Preview <span class="wt-mass-count" style="color:#888;font-weight:normal"></span></label>
            <textarea class="wt-mass-preview" rows="8" style="font-family:monospace;font-size:12px"></textarea>

            <div class="wt-help wt-mass-chunkinfo"></div>

            <div class="wt-btns">
                <button class="copy">Copy</button>
                <button class="cancel">Close</button>
                <button class="primary send">Send to chat</button>
            </div>`;

        const q = (s) => box.querySelector(s);

        // Read all panel controls into a cfg object (the preset shape).
        function readCfg() {
            return {
                filter:   q('.wt-mass-filter').value,
                sort:     q('.wt-mass-sort').value,
                online:   q('.wt-mass-online').value,
                limit:    parseInt(q('.wt-mass-limit').value, 10) || 0,
                ffCap:    q('.wt-mass-ffcap').checked,
                ffVal:    parseFloat(q('.wt-mass-ffval').value) || 0,
                war:      q('.wt-mass-war').checked,
                overseas: q('.wt-mass-overseas').checked,
                hospU:    q('.wt-mass-hospu').checked,
                hospUMin: parseFloat(q('.wt-mass-hospumin').value) || 0,
                line:     q('.wt-mass-line').value,
                header:   q('.wt-mass-header').checked,
                headText: q('.wt-mass-headtext').value,
                number:   q('.wt-mass-number').checked,
            };
        }
        // Write a cfg object back into the controls.
        function applyCfg(c) {
            if (!c) return;
            q('.wt-mass-filter').value = c.filter ?? 'all';
            q('.wt-mass-sort').value = c.sort ?? 'hosp_asc';
            q('.wt-mass-online').value = c.online ?? 'any';
            q('.wt-mass-limit').value = c.limit || '';
            q('.wt-mass-ffcap').checked = !!c.ffCap;
            q('.wt-mass-ffval').value = c.ffVal ?? 2;
            if (c.war !== undefined) q('.wt-mass-war').checked = !!c.war;
            if (c.overseas !== undefined) q('.wt-mass-overseas').checked = !!c.overseas;
            q('.wt-mass-hospu').checked = !!c.hospU;
            q('.wt-mass-hospumin').value = c.hospUMin ?? 15;
            q('.wt-mass-line').value = c.line ?? '{name} — {time}';
            q('.wt-mass-header').checked = c.header !== false;
            q('.wt-mass-headtext').value = c.headText ?? '🎯 Targets:';
            q('.wt-mass-number').checked = c.number !== false;
        }

        // Populate the preset dropdown (built-ins first, then customs).
        function refreshPresetDropdown(selectName) {
            const sel = q('.wt-mass-preset');
            const presets = allMassPresets();
            sel.innerHTML = '<option value="">— current settings —</option>' +
                presets.map((p, i) => `<option value="${i}">${esc(p.name)}${p.builtin ? '' : ' ✎'}</option>`).join('');
            if (selectName) {
                const idx = presets.findIndex(p => p.name === selectName);
                if (idx >= 0) sel.value = String(idx);
            }
        }
        refreshPresetDropdown();

        // Line-format dropdown: populate, select current if it matches a known
        // format, and apply the chosen body to the text input on change.
        function refreshLineFormatDropdown() {
            const sel = q('.wt-mass-lineformat');
            const formats = allLineFormats();
            const cur = q('.wt-mass-line').value;
            sel.innerHTML = '<option value="">— custom / type below —</option>' +
                formats.map((f, i) => `<option value="${i}">${esc(f.name)}</option>`).join('') +
                '<option value="save">+ Save current as format…</option>';
            const idx = formats.findIndex(f => f.body === cur);
            sel.value = idx >= 0 ? String(idx) : '';
        }
        refreshLineFormatDropdown();

        q('.wt-mass-lineformat').onchange = () => {
            const v = q('.wt-mass-lineformat').value;
            if (v === '') return;
            if (v === 'save') {
                const name = prompt('Name this line format:', '');
                if (name && name.trim()) {
                    const body = q('.wt-mass-line').value;
                    const custom = (state.settings.massLineFormats || []).filter(f => f.name !== name.trim());
                    custom.push({ name: name.trim(), body });
                    saveSetting('massLineFormats', custom);
                    Toast.show('✓ Format saved: ' + name.trim());
                }
                refreshLineFormatDropdown();
                return;
            }
            const f = allLineFormats()[+v];
            if (f) { q('.wt-mass-line').value = f.body; onManualChange(); }
        };

        q('.wt-mass-preset').onchange = () => {
            const idx = q('.wt-mass-preset').value;
            if (idx === '') return;
            const p = allMassPresets()[+idx];
            if (p) { applyCfg(p.cfg); refreshLineFormatDropdown(); rebuild(); }
        };
        q('.wt-preset-save').onclick = () => {
            const name = prompt('Save this preset as:', '');
            if (!name || !name.trim()) return;
            const clean = name.trim();
            // Don't allow overwriting a built-in name
            if (defaultMassPresets().some(p => p.name === clean)) { Toast.show('⚠ That name is reserved by a built-in preset'); return; }
            const custom = (state.settings.massPresets || []).filter(p => p.name !== clean);
            custom.push({ name: clean, builtin: false, cfg: readCfg() });
            saveSetting('massPresets', custom);
            refreshPresetDropdown(clean);
            Toast.show('✓ Preset saved: ' + clean);
        };
        q('.wt-preset-del').onclick = () => {
            const idx = q('.wt-mass-preset').value;
            if (idx === '') { Toast.show('Pick a preset to delete'); return; }
            const p = allMassPresets()[+idx];
            if (!p) return;
            if (p.builtin) { Toast.show('⚠ Built-in presets cannot be deleted'); return; }
            if (!confirm(`Delete preset "${p.name}"?`)) return;
            const custom = (state.settings.massPresets || []).filter(x => x.name !== p.name);
            saveSetting('massPresets', custom);
            refreshPresetDropdown();
            Toast.show('Preset deleted');
        };

        q('.wt-mass-filter').value = S.massFilter;
        q('.wt-mass-sort').value = S.massSort;
        q('.wt-mass-online').value = S.massOnline;
        q('.wt-mass-limit').value = S.massLimit || '';
        q('.wt-mass-ffcap').checked = S.massFFCap;
        q('.wt-mass-ffval').value = S.massFFVal;
        q('.wt-mass-war').checked = S.massRespWar;
        q('.wt-mass-overseas').checked = S.massRespOverseas;
        q('.wt-mass-hospu').checked = S.massHospU;
        q('.wt-mass-hospumin').value = S.massHospUMin;
        q('.wt-mass-header').checked = S.massShowHeader;
        q('.wt-mass-number').checked = S.massNumber;

        let lines = [];   // current compiled lines (without chunking)

        function rebuild() {
            // Sync respect-multiplier toggles into settings so massRowData picks them up.
            state.settings.massRespWar = q('.wt-mass-war').checked;
            state.settings.massRespOverseas = q('.wt-mass-overseas').checked;
            const opts = {
                filter:           q('.wt-mass-filter').value,
                onlineFilter:     q('.wt-mass-online').value,
                maxFFEnabled:     q('.wt-mass-ffcap').checked,
                maxFF:            parseFloat(q('.wt-mass-ffval').value) || 0,
                hospUnderEnabled: q('.wt-mass-hospu').checked,
                hospUnderMin:     parseFloat(q('.wt-mass-hospumin').value) || 0,
            };
            const sortBy = q('.wt-mass-sort').value;
            const lineTpl = q('.wt-mass-line').value || '{name} — {time}';
            const number = q('.wt-mass-number').checked;
            const showHeader = q('.wt-mass-header').checked;
            const headText = q('.wt-mass-headtext').value;
            const limit = parseInt(q('.wt-mass-limit').value, 10) || 0;

            let data = sortMassRows(gatherMassRows(opts), sortBy);
            if (limit > 0) data = data.slice(0, limit);
            lines = data.map((d, i) => (number ? `${i + 1}. ` : '') + formatMassLine(d, lineTpl));

            const body = [];
            if (showHeader && headText.trim()) body.push(headText.trim());
            body.push(...lines);
            const full = body.join('\n');

            q('.wt-mass-preview').value = full;
            q('.wt-mass-count').textContent = `(${data.length} player${data.length === 1 ? '' : 's'})`;

            // Chat messages have a length cap (~1000 chars is safe). Show chunk plan.
            const chunks = chunkLines(body, 950);
            q('.wt-mass-chunkinfo').textContent = chunks.length > 1
                ? `Will send as ${chunks.length} messages (chat length limit).`
                : '';
            box._chunks = chunks;
            return full;
        }

        // persist choices as they change
        const onManualChange = () => {
            // A manual tweak no longer matches the loaded preset → reset selector.
            const sel = q('.wt-mass-preset');
            if (sel.value !== '') sel.value = '';
            // Keep the line-format dropdown in sync with the current text.
            const lf = q('.wt-mass-lineformat');
            if (lf) {
                const formats = allLineFormats();
                const idx = formats.findIndex(f => f.body === q('.wt-mass-line').value);
                lf.value = idx >= 0 ? String(idx) : '';
            }
            rebuild();
        };
        ['change', 'input'].forEach(ev => {
            ['.wt-mass-filter', '.wt-mass-sort', '.wt-mass-online', '.wt-mass-limit',
             '.wt-mass-ffcap', '.wt-mass-ffval', '.wt-mass-hospu', '.wt-mass-hospumin',
             '.wt-mass-war', '.wt-mass-overseas',
             '.wt-mass-line', '.wt-mass-header', '.wt-mass-headtext', '.wt-mass-number'
            ].forEach(sel => q(sel).addEventListener(ev, onManualChange));
        });
        rebuild();

        q('.cancel').onclick = () => bg.remove();
        q('.copy').onclick = () => {
            const ok = copyText(q('.wt-mass-preview').value);
            Toast.show(ok ? '📋 Copied full list' : '⚠ Copy failed');
        };
        q('.send').onclick = async () => {
            // Save preferences
            saveSetting('massFilter', q('.wt-mass-filter').value);
            saveSetting('massSort', q('.wt-mass-sort').value);
            saveSetting('massOnline', q('.wt-mass-online').value);
            saveSetting('massLimit', parseInt(q('.wt-mass-limit').value, 10) || 0);
            saveSetting('massFFCap', q('.wt-mass-ffcap').checked);
            saveSetting('massFFVal', parseFloat(q('.wt-mass-ffval').value) || 0);
            saveSetting('massRespWar', q('.wt-mass-war').checked);
            saveSetting('massRespOverseas', q('.wt-mass-overseas').checked);
            saveSetting('massHospU', q('.wt-mass-hospu').checked);
            saveSetting('massHospUMin', parseFloat(q('.wt-mass-hospumin').value) || 0);
            saveSetting('massLineTpl', q('.wt-mass-line').value);
            saveSetting('massShowHeader', q('.wt-mass-header').checked);
            saveSetting('massHeader', q('.wt-mass-headtext').value);
            saveSetting('massNumber', q('.wt-mass-number').checked);

            const chunks = box._chunks || [];
            if (!chunks.length) { Toast.show('Nothing to send'); return; }
            bg.remove();
            // Send each chunk with a small delay so chat accepts them in order.
            for (let i = 0; i < chunks.length; i++) {
                const ok = sendToFactionChat(chunks[i]);
                if (!ok) { Toast.show('⚠ Open faction chat first'); break; }
                if (i < chunks.length - 1) await sleep(700);
            }
            Toast.show(`✓ Sent ${chunks.length} message${chunks.length === 1 ? '' : 's'}`);
        };

        document.body.appendChild(bg);
    }

    // Group lines into chat-sized chunks without splitting a line.
    function chunkLines(linesArr, maxLen) {
        const chunks = [];
        let cur = '';
        for (const line of linesArr) {
            const add = (cur ? '\n' : '') + line;
            if (cur && (cur.length + add.length) > maxLen) { chunks.push(cur); cur = line; }
            else cur += add;
        }
        if (cur) chunks.push(cur);
        return chunks;
    }
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    /* ════════════════════════════════════════════════════════════════════════
     * 14b. HIT CALLING (v5.1) — shared through a Google Sheet.
     *
     * There is no backend: one member deploys the copyable Apps Script below
     * onto a Google Sheet as a Web App, and every member pastes the same
     * /exec URL into their settings. Mutations and polls are plain GETs
     * through GM_xmlhttpRequest (no CORS; Apps Script redirects to
     * script.googleusercontent.com — both hosts are in @connect). The sheet
     * appends one row per event and hands back the last 24h, so it doubles
     * as the faction's permanent hit log. Client-side, events reduce to a
     * per-target owner: the first caller (by sheet order) LOCKS the target —
     * nobody else can call them. A call holds while the target sits in
     * hospital/jail, then expires HC_ALIVE_MIN after they're attackable
     * without being hit (hcCallStale), so an AFK caller can't squat; the
     * owner's client logs the timeout release back to the sheet.
     * ════════════════════════════════════════════════════════════════════════ */
    const HC_POLL = 20_000;       // sheet poll cadence while a war list is on screen
    const HC_MAX_MIN = 360;       // absolute cap — a call this old is dead regardless of anything
    const HC_ALIVE_MIN = 5;       // minutes a called target may be ATTACKABLE before the call times out

    /** The backend, shipped as copy-paste text (settings ⚙ → Copy backend script). */
    const HC_BACKEND = `/** Torn OC Suite — Hit Calling backend (paste ALL of this).
 * SETUP — about 2 minutes, done by ONE member:
 *   1. Go to sheets.new and create a sheet (name it e.g. "War Hit Calls").
 *   2. Extensions -> Apps Script. Delete the sample code, paste this file, save.
 *   3. Deploy -> New deployment -> type "Web app"
 *        Execute as: Me   ·   Who has access: Anyone
 *      -> Deploy, authorise it, and copy the Web app URL (ends in /exec).
 *   4. Paste that URL into War Tools (gear icon) -> "Hit calling" -> Save,
 *      and share the SAME URL with every member — they paste it into their own
 *      settings. That's it: the sheet logs every call and hit permanently.
 */
function doGet(e) { return handle(e); }
function doPost(e) { return handle(e); }
function handle(e) {
  var p = (e && e.parameter) || {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Calls') || ss.insertSheet('Calls');
  if (sh.getLastRow() === 0) sh.appendRow(['when', 'action', 'caller_id', 'caller', 'target_id', 'target', 'result']);
  var lock = LockService.getScriptLock();
  lock.tryLock(5000);
  try {
    if (p.action === 'call' || p.action === 'done' || p.action === 'release') {
      sh.appendRow([new Date(), p.action, p.caller_id || '', p.caller || '', p.target_id || '', p.target || '', p.result || '']);
    }
    var rows = sh.getDataRange().getValues();
    var cutoff = Date.now() - 24 * 3600 * 1000;
    var out = [];
    for (var i = 1; i < rows.length; i++) {
      var ts = new Date(rows[i][0]).getTime();
      if (!(ts >= cutoff)) continue;
      out.push({ ts: ts, action: String(rows[i][1]), caller_id: String(rows[i][2]), caller: String(rows[i][3]),
                 target_id: String(rows[i][4]), target: String(rows[i][5]), result: String(rows[i][6]) });
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true, events: out.slice(-500) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally { lock.releaseLock(); }
}`;

    function hcRequest(params) {
        const url = state.hcUrl;
        if (!/^https:\/\/script\.google\.com\/macros\//.test(url || '')) {
            return Promise.reject(new Error('no Web App URL set — open ⚙ settings'));
        }
        const qs = new URLSearchParams({ ...params, _t: Date.now() }).toString();
        return httpGetJSON(url + (url.includes('?') ? '&' : '?') + qs);
    }

    /** Who am I when I call? Id from the suite; name from the roster cache,
     *  else asked once and stored. */
    function hcIdentity() {
        let id = '';
        try { id = String(GM_getValue(GMK.MY_PLAYER_ID, '') || ''); } catch (_) {}
        let name = Store.get('hitcall-name', '') || '';
        if (!name && id) { try { name = warMemberName(id) || ''; } catch (_) {} }
        if (!name) {
            const input = prompt('Hit calling: what name should your calls show? (your Torn name)');
            if (input && input.trim()) { name = input.trim(); Store.set('hitcall-name', name); }
        }
        return { id: id || name || '?', name: name || (id ? '#' + id : '?') };
    }

    /** Events -> per-target caller queues. First in queue owns the hit. */
    function reduceCalls(events) {
        const byTarget = new Map();
        const sorted = (events || []).slice().sort((a, b) => a.ts - b.ts);
        for (const e of sorted) {
            const t = String(e.target_id || '');
            if (!t) continue;
            let q = byTarget.get(t) || [];
            const cid = String(e.caller_id || e.caller || '');
            if (e.action === 'call') {
                if (!q.some(c => c.callerId === cid)) {
                    q.push({ callerId: cid, caller: e.caller || cid, ts: e.ts, targetName: e.target || '' });
                }
            } else if (e.action === 'done' || e.action === 'release') {
                q = q.filter(c => c.callerId !== cid);
            }
            byTarget.set(t, q);
        }
        const cutoff = Date.now() - HC_MAX_MIN * 60 * 1000;
        for (const [t, q] of byTarget) byTarget.set(t, q.filter(c => c.ts >= cutoff));
        return byTarget;
    }

    /**
     * Alive-timeout (v5.1.1). The old flat 15-min TTL was wrong both ways: it
     * killed a call on a 3-hour hospital timer before the target even got out,
     * and it let a caller squat an attackable target for 15 minutes. Now a call
     * HOLDS for as long as the target sits in hospital/jail — that's what
     * calling is for — and once they're ATTACKABLE the caller has HC_ALIVE_MIN
     * minutes to take the shot before the call expires.
     * @param callTsMs sheet event time (ms) · @param rec War Tools member record
     *        ({state, since} — seconds) · @param nowSec current time (seconds)
     * No member record (dashboard page, roster gap) → not stale here; the
     * HC_MAX_MIN cap in reduceCalls still bounds it.
     */
    function hcCallStale(callTsMs, rec, nowSec) {
        if (!rec || !rec.state) return false;
        if (rec.state === 'Hospital' || rec.state === 'Jail') return false;
        const aliveSince = Math.max(callTsMs / 1000, rec.since || 0);
        return (nowSec - aliveSince) > HC_ALIVE_MIN * 60;
    }

    /** A target's live call queue with alive-timeouts applied. */
    function hcActiveQueue(pid) {
        const q = state.calls.get(String(pid)) || [];
        if (!q.length) return q;
        const rec = state.members.get(String(pid));
        const nowSec = Time.nowSec();
        return q.filter(c => !hcCallStale(c.ts, rec, nowSec));
    }

    async function pollHitCalls(force = false) {
        if (!state.hcUrl || (!state.warFound && !force)) return;
        const now = Date.now();
        if (!force && now < state.nextHcAllowedAt) return;
        state.nextHcAllowedAt = now + HC_POLL;
        try {
            const data = await hcRequest({ action: 'list' });
            if (data && data.ok && Array.isArray(data.events)) {
                state.callEvents = data.events;
                state.calls = reduceCalls(data.events);
                for (const [, row] of state.rows) delete row.li.dataset.wtCallsig;   // repaint with fresh ages
                paintHitCalls();
            }
        } catch (e) { LOG('hit-call poll failed', e.message); }
    }

    async function sendHitEvent(action, targetId, targetName, result) {
        const me = hcIdentity();
        if (!me.name || me.name === '?') return;
        try {
            const data = await hcRequest({ action, caller_id: me.id, caller: me.name,
                                           target_id: String(targetId), target: targetName || '', result: result || '' });
            if (data && data.ok && Array.isArray(data.events)) {
                state.callEvents = data.events;
                state.calls = reduceCalls(data.events);
                for (const [, row] of state.rows) delete row.li.dataset.wtCallsig;
                paintHitCalls();
            }
            Toast.show(action === 'call' ? '📌 Called ' + (targetName || '#' + targetId)
                     : action === 'done' ? '✓ Hit logged on ' + (targetName || '#' + targetId)
                     : 'Released ' + (targetName || '#' + targetId));
        } catch (e) {
            Toast.show('⚠ Hit-call sync failed: ' + e.message);
        }
    }

    const _hcAutoReleased = new Set();   // `${pid}|${ts}` — one timeout release per call

    /**
     * Paint 📌 / 🔒 / ✓✗ + the caller pill onto every enemy row, and tint the
     * whole row so a called target is visible in Torn's own list even where
     * the buttons are tight. Runs from the reconcile heartbeat; a per-row
     * signature skips DOM rebuilds when nothing changed, but classes are
     * RE-ASSERTED every tick — Torn's React re-renders strip our classes off
     * its own elements (leaving our appended buttons orphaned outside the flex
     * layout), which is exactly why the 📌 button kept vanishing.
     */
    function paintHitCalls() {
        updateBoardBtn();
        if (!state.hcUrl) return;
        let me = '';
        try { me = String(GM_getValue(GMK.MY_PLAYER_ID, '') || ''); } catch (_) {}
        const stripInfo = (q, mine) => {
            const age = Math.max(0, Math.round((Date.now() - q[0].ts) / 60000));
            const raced = q.length > 1 ? ` (+${q.length - 1} raced)` : '';
            return mine ? `📌 YOUR CALL · ${age}m${raced} — hit it, then press ✓`
                        : `🔒 CALLED — ${q[0].caller} · ${age}m ago${raced}`;
        };
        for (const [pid, row] of state.rows) {
            const li = row.li;
            if (!li.isConnected) continue;
            if (isOwnFaction(li)) continue;
            const q = hcActiveQueue(pid);
            const mineIdx = q.findIndex(c => c.callerId === me);

            // My call timed out (target ran free too long) — release it on the
            // sheet, once, so everyone's row unlocks. Communication only.
            const full = state.calls.get(String(pid)) || [];
            const myStale = full.find(c => c.callerId === me && !q.includes(c));
            if (myStale) {
                const k = pid + '|' + myStale.ts;
                if (!_hcAutoReleased.has(k)) {
                    _hcAutoReleased.add(k);
                    sendHitEvent('release', pid, memberName(pid), 'timeout');
                }
            }

            // Re-asserted every tick (cheap): Torn re-renders wipe these off.
            li.classList.toggle('wt-called', q.length > 0 && mineIdx !== 0);
            li.classList.toggle('wt-called-mine', mineIdx === 0);
            const host = li.querySelector('[class*="attack___"]') || li.querySelector('div.attack') || row.statusDiv;
            if (host) host.classList.add('wt-callout-host');

            // Keep the strip's age line fresh even when nothing structural changed.
            const liveInfo = li.querySelector('.wt-call-strip .wt-strip-info');
            if (liveInfo && q.length) liveInfo.textContent = stripInfo(q, mineIdx === 0);

            const sig = q.map(c => c.callerId).join(',') + '|' + mineIdx;
            const painted = q.length ? li.querySelector('.wt-call-strip') : (host && host.querySelector('.wt-call'));
            if (li.dataset.wtCallsig === sig && painted) continue;
            li.dataset.wtCallsig = sig;
            li.querySelectorAll('.wt-call, .wt-call-strip').forEach(n => n.remove());

            if (!q.length) {
                // Uncalled: just the compact 📌 in the attack cell.
                if (host) host.appendChild(el('a', {
                    class: 'wt-call', href: 'javascript:void(0)',
                    title: 'Call this hit — locks the target to you for everyone running the suite',
                    onclick: (e) => { e.preventDefault(); e.stopPropagation(); sendHitEvent('call', pid, memberName(pid)); },
                }, '📌'));
                continue;
            }

            // Called: the row grows its OWN full-width strip line (v5.1.2) —
            // the Attack cell was already overflowing (FFScouter's Est column
            // clips "Attack" on travel rows), so call state gets real estate
            // instead of fighting for the corner of a cramped cell. The rows
            // are float layouts ending in a clear div, so a block child appended
            // to the <li> renders as a second line (verified against the saved
            // war page).
            const mine = mineIdx === 0;
            const strip = el('div', { class: 'wt-call-strip' });
            strip.appendChild(el('span', {
                class: 'wt-strip-info',
                title: `A call locks the target. It holds while they're in hospital, then expires ${HC_ALIVE_MIN} min after they're attackable without being hit.`,
            }, stripInfo(q, mine)));
            if (mine) {
                strip.appendChild(el('a', {
                    class: 'wt-strip-btn wt-strip-hit', href: 'javascript:void(0)',
                    title: 'Log the hit (counts on the board) and free the target',
                    onclick: (e) => { e.preventDefault(); e.stopPropagation(); sendHitEvent('done', pid, memberName(pid), 'hit'); },
                }, '✓ HIT'));
                strip.appendChild(el('a', {
                    class: 'wt-strip-btn wt-strip-drop', href: 'javascript:void(0)',
                    title: 'Release the call without a hit',
                    onclick: (e) => { e.preventDefault(); e.stopPropagation(); sendHitEvent('release', pid, memberName(pid)); },
                }, '✗ DROP'));
            } else if (mineIdx > 0) {
                // Race case: I called at ~the same moment and lost — withdraw.
                strip.appendChild(el('a', {
                    class: 'wt-strip-btn wt-strip-drop', href: 'javascript:void(0)',
                    title: q[0].caller + ' called first — withdraw your call',
                    onclick: (e) => { e.preventDefault(); e.stopPropagation(); sendHitEvent('release', pid, memberName(pid)); },
                }, '✗ WITHDRAW'));
            }
            li.appendChild(strip);
        }
    }

    /** Floating 📌 board button badge: number of live calls right now. */
    function updateBoardBtn() {
        const btn = $('.wt-board-btn');
        if (!btn) return;
        let n = 0;
        for (const tid of state.calls.keys()) if (hcActiveQueue(tid).length) n++;
        const badge = btn.querySelector('.wt-board-count');
        if (badge) badge.textContent = n || '';
        btn.classList.toggle('has-calls', n > 0);
    }

    /** The live call board: active calls with queues + 24h hits-logged tally. */
    function openCallBoard() {
        const { bg, box } = modalShell(480);
        const render = () => {
            if (!state.hcUrl) {
                box.innerHTML = `
                    <h2>📌 Hit Calls</h2>
                    <div class="wt-help">No shared sheet linked yet. One member sets it up once (about 2 minutes),
                    then everyone pastes the same Web App URL into ⚙ settings → Hit calling.</div>
                    <div class="wt-btns">
                        <button class="setup">📋 Copy backend script + steps</button>
                        <button class="primary opensettings">⚙ Open settings</button>
                        <button class="cancel">Close</button>
                    </div>`;
                box.querySelector('.cancel').onclick = () => bg.remove();
                box.querySelector('.setup').onclick = () => Toast.show(copyText(HC_BACKEND) ? '📋 Copied — paste into Apps Script (steps are at the top)' : '⚠ Copy failed');
                box.querySelector('.opensettings').onclick = () => { bg.remove(); openSettings(); };
                return;
            }
            const active = [...state.calls.keys()]
                .map(tid => [tid, hcActiveQueue(tid)])
                .filter(([, q]) => q.length)
                .sort((a, b) => a[1][0].ts - b[1][0].ts);
            // Target status beside each call, where the war-page roster knows it.
            const stTxt = (tid) => {
                const rec = state.members.get(String(tid));
                if (!rec || !rec.state) return '';
                const nowS = Time.nowSec();
                if ((rec.state === 'Hospital' || rec.state === 'Jail') && (rec.until || 0) > nowS)
                    return ` · <span style="color:#e0b050">out in ${Time.human(rec.until - nowS)}</span>`;
                if (rec.state === 'Okay') return ' · <span style="color:#9be8a8;font-weight:700">OUT NOW</span>';
                return ` · <span style="color:#888">${esc(rec.state)}</span>`;
            };
            const dayAgo = Date.now() - 86400e3;
            const tally = {};
            for (const e of state.callEvents) {
                if (e.action !== 'done' || e.ts < dayAgo) continue;
                const k = e.caller || ('#' + e.caller_id);
                tally[k] = (tally[k] || 0) + 1;
            }
            const tallyRows = Object.entries(tally).sort((a, b) => b[1] - a[1]);
            const ageM = ts => Math.max(0, Math.round((Date.now() - ts) / 60000));
            box.innerHTML = `
                <h2>📌 Hit Calls</h2>
                <label style="margin-top:0">Active calls (${active.length})</label>
                ${active.length ? active.map(([tid, q]) => `
                    <div class="wt-hc-row">
                        <a href="https://www.torn.com/loader.php?sid=attack&user2ID=${esc(tid)}" target="_blank">${esc(q[0].targetName || '#' + tid)}</a>
                        — 📌 <b>${esc(q[0].caller)}</b> <span style="color:#888">(${ageM(q[0].ts)}m)</span>${stTxt(tid)}
                    </div>`).join('') : '<div class="wt-help">Nobody has a call out right now.</div>'}
                <label style="margin-top:12px">Hits logged — last 24h (${Object.values(tally).reduce((s, n) => s + n, 0)})</label>
                ${tallyRows.length ? tallyRows.map(([n, c]) => `<div class="wt-hc-row">${esc(n)} — <b>${c}</b> hit${c === 1 ? '' : 's'}</div>`).join('')
                    : '<div class="wt-help">No hits logged yet — after landing a called hit, press ✓ on the row.</div>'}
                <div class="wt-btns">
                    <button class="refresh">↻ Refresh</button>
                    <button class="cancel">Close</button>
                </div>
                <div class="wt-help">A call locks its target — nobody else can call them. It holds while they sit in hospital, then expires ${HC_ALIVE_MIN} min after they're attackable if the caller hasn't hit. The Google Sheet keeps the full permanent history — open it any time.</div>`;
            box.querySelector('.cancel').onclick = () => bg.remove();
            box.querySelector('.refresh').onclick = async () => { await pollHitCalls(true); render(); };
        };
        render();
        if (state.hcUrl) pollHitCalls(true).then(render).catch(() => {});
        document.body.appendChild(bg);
    }

    /* ════════════════════════════════════════════════════════════════════════
     * 15. UI — TOASTS
     * ════════════════════════════════════════════════════════════════════════ */
    const Toast = {
        show(msg, ms = 1900) {
            let t = $('.wt-toast');
            if (!t) { t = el('div', { class: 'wt-toast' }); document.body.appendChild(t); }
            t.textContent = msg;
            requestAnimationFrame(() => t.classList.add('show'));
            clearTimeout(t._h);
            t._h = setTimeout(() => t.classList.remove('show'), ms);
        },
    };

    /* ════════════════════════════════════════════════════════════════════════
     * 16. UI — MODALS
     * ════════════════════════════════════════════════════════════════════════ */
    function modalShell(maxWidth = 420) {
        const bg = el('div', { class: 'wt-modal-bg', onclick: (e) => { if (e.target === bg) bg.remove(); } });
        const box = el('div', { class: 'wt-modal', style: `max-width:${maxWidth}px` });
        bg.appendChild(box);
        const onEsc = (e) => { if (e.key === 'Escape') { bg.remove(); document.removeEventListener('keydown', onEsc); } };
        document.addEventListener('keydown', onEsc);
        return { bg, box };
    }

    function openCalloutModal(pid) {
        const rec = state.members.get(pid) || {};
        const name = memberName(pid);
        const until = rec.until || 0;
        const { bg, box } = modalShell(420);
        const S = state.settings;

        box.innerHTML = `
            <h2>📢 Callout — ${esc(name)}</h2>
            <label>Template</label>
            <select class="wt-tpl">${S.templates.map((t, i) => `<option value="${i}">${esc(t.name)}</option>`).join('')}</select>
            <label>Time mode</label>
            <div class="wt-row">
                <select class="wt-mode">
                    <option value="remaining">Hospital timer</option>
                    <option value="offsetNow">In X minutes (from now)</option>
                </select>
                <input type="number" class="wt-offset" min="-60" max="240" step="1" value="${S.offsetSeconds / 60}" title="Minutes to add (+later / −earlier)">
            </div>
            <div class="wt-help">"Hospital timer" uses their real release time + offset. "In X minutes" ignores the timer. Placeholders: {name} {time} {clock} {id} {stats} {ff} {level} {respect}</div>
            <label>Message</label>
            <textarea class="wt-msg" rows="2"></textarea>
            <label>Preview</label>
            <div class="wt-preview"></div>
            <div class="wt-statline"></div>
            <div class="wt-btns">
                <button class="copy">Copy</button>
                <button class="cancel">Cancel</button>
                <button class="primary send">Send to chat</button>
            </div>
            <span class="wt-link">⚙ Manage templates & defaults</span>`;

        const q = (s) => box.querySelector(s);
        const tplSel = q('.wt-tpl'), modeSel = q('.wt-mode'), offEl = q('.wt-offset'), msgEl = q('.wt-msg'), prev = q('.wt-preview');
        tplSel.value = String(Math.min(S.lastTemplate, S.templates.length - 1));
        modeSel.value = S.defaultMode === 'clock' ? 'remaining' : S.defaultMode;
        let dirty = false;

        // Resolve FFScouter data for this player (may be empty if no key / not yet fetched)
        const ffd = state.ffs.get(String(pid));
        const statsStr = ffd && ffd.estHuman ? ffd.estHuman : '?';
        const ffStr = ffd && ffd.ff != null ? ffd.ff.toFixed(2) : '?';
        const statLineEl = q('.wt-statline');
        if (ffd && (ffd.estHuman || ffd.ff != null)) {
            statLineEl.innerHTML = `<span class="wt-stat-badge">📊 ~${esc(ffd.estHuman || '?')} &nbsp;·&nbsp; FF ${esc(ffStr)}</span>`;
        } else if (ffsKeyValid(state.ffsKey)) {
            statLineEl.innerHTML = `<span class="wt-stat-badge muted">📊 estimate loading… (use {stats}/{ff} in your message)</span>`;
        } else {
            statLineEl.innerHTML = `<span class="wt-stat-badge muted">📊 add an FFScouter key in ⚙ to use {stats}/{ff}</span>`;
        }

        function recompute() {
            const tpl = S.templates[+tplSel.value] || S.templates[0];
            if (!dirty) msgEl.value = tpl.body;
            const offSec = Math.round((parseFloat(offEl.value) || 0) * 60);
            const nowSec = Time.nowSec();
            const target = modeSel.value === 'remaining' && until > 0 ? until + offSec : nowSec + offSec;
            const out = buildMessage(msgEl.value, {
                name, id: pid, time: Time.human(target - nowSec), clock: Time.clockTCT(target),
                stats: statsStr, ff: ffStr,
                level: rowLevel(pid) ?? '?', respect: fmtRespect(estimateRespect(pid)),
            });
            prev.textContent = out;
            return out;
        }
        tplSel.onchange = () => { dirty = false; recompute(); };
        modeSel.onchange = recompute;
        offEl.oninput = recompute;
        msgEl.oninput = () => { dirty = true; recompute(); };
        recompute();

        q('.cancel').onclick = () => bg.remove();
        q('.copy').onclick = () => Toast.show(copyText(recompute()) ? '📋 Copied' : '⚠ Copy failed');
        q('.send').onclick = () => {
            const text = recompute();
            saveSetting('lastTemplate', +tplSel.value);
            saveSetting('offsetSeconds', (parseFloat(offEl.value) || 0) * 60);
            saveSetting('defaultMode', modeSel.value);
            if (sendToFactionChat(text)) { Toast.show('✓ Sent'); bg.remove(); }
        };
        q('.wt-link').onclick = () => { bg.remove(); openSettings(); };

        document.body.appendChild(bg);
        msgEl.focus();
        msgEl.setSelectionRange(msgEl.value.length, msgEl.value.length);
    }

    function openSettings() {
        const { bg, box } = modalShell(520);
        const S = state.settings;
        box.innerHTML = `
            <h2>⚙ Torn War Tools — Settings <span style="font-weight:normal;color:#666;font-size:11px">v${VERSION}</span></h2>

            <button class="wt-open-mass" style="width:100%;padding:8px;margin-bottom:10px;background:linear-gradient(180deg,#3a8a5a,#1f5a36);color:#fff;border:1px solid #16401f;border-radius:4px;cursor:pointer;font-size:13px;font-weight:600">📋 Open Mass Callout</button>

            <label style="margin-top:0">War list</label>
            <label class="wt-switch"><input type="checkbox" class="wt-hosp"><span>Hosp First: pin hospitalized players to top</span></label>
            <label class="wt-switch"><input type="checkbox" class="wt-color"><span>Color-code countdowns (red under 5 min)</span></label>
            <label class="wt-switch"><input type="checkbox" class="wt-hide-offline"><span>Hide offline enemies</span></label>
            <label class="wt-switch"><input type="checkbox" class="wt-hide-idle"><span>Hide idle enemies</span></label>
            <label class="wt-switch"><input type="checkbox" class="wt-hide-online"><span>Hide online enemies</span></label>
            <label class="wt-switch" style="margin-left:18px"><input type="checkbox" class="wt-keep-hosp"><span>…but keep them if they're in hospital</span></label>

            <label style="margin-top:14px">Callout button</label>
            <label class="wt-switch"><input type="checkbox" class="wt-own"><span>Show 📢 on my own faction too (default: enemy only)</span></label>
            <label class="wt-switch"><input type="checkbox" class="wt-quick"><span>Show ⚡ quick-call button (instant send, last-used template)</span></label>
            <div class="wt-help" style="margin-top:6px;margin-bottom:2px">Show callout buttons on which enemies:</div>
            <label class="wt-switch"><input type="checkbox" class="wt-cs-hosp"><span>In hospital</span></label>
            <label class="wt-switch"><input type="checkbox" class="wt-cs-okay"><span>Okay / attackable now</span></label>
            <label class="wt-switch"><input type="checkbox" class="wt-cs-travel"><span>Traveling / abroad</span></label>

            <label style="margin-top:14px">Torn API key</label>
            <div class="wt-row" style="align-items:center">
                <input type="text" class="wt-key" placeholder="16-char public API key">
                <button class="wt-key-save" style="flex:0 0 auto">Save</button>
            </div>
            <div class="wt-help">Read-only faction status. A public key is enough.</div>

            <label style="margin-top:14px">FFScouter API key (stat estimates)</label>
            <div class="wt-row" style="align-items:center">
                <input type="text" class="wt-ffs" placeholder="16-char FFScouter-registered key">
                <button class="wt-ffs-save" style="flex:0 0 auto">Save</button>
                <button class="wt-ffs-test" style="flex:0 0 auto">Test</button>
            </div>
            <div class="wt-help">Enables <b>{stats}</b> &amp; <b>{ff}</b> in callouts (e.g. ~1.2m · FF 2.40). Get a key at <span style="color:#7ab3ff">ffscouter.com</span> — register there first. <b>Test</b> checks the key against one player and shows the result below.</div>
            <div class="wt-ffs-status" style="font-size:11px;margin-top:4px;min-height:14px"></div>
            <label class="wt-switch"><input type="checkbox" class="wt-inline-stats"><span>Show stat estimate under the Score column</span></label>

            <label style="margin-top:14px">📌 Hit calling (shared Google Sheet)</label>
            <div class="wt-row" style="align-items:center">
                <input type="text" class="wt-hc-url" placeholder="https://script.google.com/macros/s/…/exec">
                <button class="wt-hc-save" style="flex:0 0 auto">Save</button>
            </div>
            <div class="wt-help">Everyone pastes the <b>same</b> Web App URL and calls sync through the sheet: 📌 call a target and it LOCKS to you (nobody else can call them), ✓ log the hit. A call holds while they're in hospital, then expires ${HC_ALIVE_MIN} min after they're attackable if you haven't hit. One member sets it up once (~2 min) — press the button below, paste into a Google Sheet's Apps Script, deploy as Web App, share the URL.</div>
            <div class="wt-row" style="margin-top:4px">
                <button class="wt-hc-copy">📋 Copy backend script + setup steps</button>
                <button class="wt-hc-board" style="flex:0 0 auto">📌 Call board</button>
            </div>
            <div class="wt-hc-status" style="font-size:11px;margin-top:4px;min-height:14px"></div>

            <label style="margin-top:14px">Callout templates</label>
            <div class="wt-help" style="margin-top:0;margin-bottom:6px">Placeholders: <b>{name}</b>, <b>{time}</b>, <b>{clock}</b> (HH:MM TCT), <b>{id}</b>, <b>{stats}</b>, <b>{ff}</b></div>
            <div class="wt-tpl-list"></div>
            <button class="wt-tpl-add">+ Add template</button>

            <label style="margin-top:14px">Callout defaults</label>
            <div class="wt-row">
                <div><label style="margin-top:0">Time mode</label>
                    <select class="wt-def-mode"><option value="remaining">Hospital timer</option><option value="offsetNow">In X minutes</option></select></div>
                <div><label style="margin-top:0">Offset (min)</label>
                    <input type="number" class="wt-def-off" min="-60" max="240" step="1"></div>
            </div>

            <div class="wt-btns">
                <button class="danger reset">Reset defaults</button>
                <button class="cancel">Close</button>
                <button class="primary save">Save</button>
            </div>`;

        const q = (s) => box.querySelector(s);
        // toggles
        q('.wt-open-mass').onclick = () => { bg.remove(); openMassCallout(); };
        q('.wt-hosp').checked = state.hospFirst;
        q('.wt-hosp').onchange = (e) => {
            state.hospFirst = e.target.checked;
            Store.rawSet(C.KEY_HOSP_FIRST, state.hospFirst ? 'true' : 'false');
            sortAll(); Toast.show(`Hosp First: ${state.hospFirst ? 'ON' : 'OFF'}`);
        };
        q('.wt-color').checked = S.colorCountdowns;
        q('.wt-color').onchange = (e) => { saveSetting('colorCountdowns', e.target.checked); document.body.classList.toggle('wt-no-color', !e.target.checked); };
        q('.wt-hide-offline').checked = S.hideOffline;
        q('.wt-hide-offline').onchange = (e) => { saveSetting('hideOffline', e.target.checked); reconcile(); Toast.show(`Hide offline: ${e.target.checked ? 'ON' : 'OFF'}`); };
        q('.wt-hide-idle').checked = S.hideIdle;
        q('.wt-hide-idle').onchange = (e) => { saveSetting('hideIdle', e.target.checked); reconcile(); Toast.show(`Hide idle: ${e.target.checked ? 'ON' : 'OFF'}`); };
        q('.wt-hide-online').checked = S.hideOnline;
        q('.wt-hide-online').onchange = (e) => { saveSetting('hideOnline', e.target.checked); reconcile(); Toast.show(`Hide online: ${e.target.checked ? 'ON' : 'OFF'}`); };
        q('.wt-keep-hosp').checked = S.keepHospVisible;
        q('.wt-keep-hosp').onchange = (e) => { saveSetting('keepHospVisible', e.target.checked); reconcile(); };
        q('.wt-own').checked = S.calloutOnOwn;
        q('.wt-own').onchange = (e) => {
            saveSetting('calloutOnOwn', e.target.checked);
            if (!e.target.checked) for (const [, row] of state.rows) if (isOwnFaction(row.li)) removeCallout(row);
            Toast.show(`Own-faction callouts: ${e.target.checked ? 'ON' : 'OFF'}`);
        };
        q('.wt-quick').checked = S.quickCallBtn;
        q('.wt-quick').onchange = (e) => {
            saveSetting('quickCallBtn', e.target.checked);
            reconcile();
            Toast.show(`Quick-call button: ${e.target.checked ? 'ON' : 'OFF'}`);
        };
        // callout state toggles
        const cs = S.calloutStates || { hosp: true, okay: true, traveling: false };
        q('.wt-cs-hosp').checked = !!cs.hosp;
        q('.wt-cs-okay').checked = !!cs.okay;
        q('.wt-cs-travel').checked = !!cs.traveling;
        const onCsChange = () => {
            saveSetting('calloutStates', {
                hosp: q('.wt-cs-hosp').checked,
                okay: q('.wt-cs-okay').checked,
                traveling: q('.wt-cs-travel').checked,
            });
            reconcile();
        };
        q('.wt-cs-hosp').onchange = onCsChange;
        q('.wt-cs-okay').onchange = onCsChange;
        q('.wt-cs-travel').onchange = onCsChange;
        // torn api key
        q('.wt-key').value = apiKeyValid(state.apiKey) ? state.apiKey : '';
        q('.wt-key-save').onclick = () => {
            const v = q('.wt-key').value.trim();
            if (v.length !== 16) { Toast.show('⚠ Key must be 16 characters'); return; }
            state.apiKey = v; Store.rawSet(C.KEY_API, v); state.running = true; state.nextPollAllowedAt = 0;
            Toast.show('✓ API key saved'); poll();
        };
        // ffscouter key
        q('.wt-ffs').value = ffsKeyValid(state.ffsKey) ? state.ffsKey : '';
        q('.wt-ffs-save').onclick = () => {
            const v = q('.wt-ffs').value.trim();
            if (!ffsKeyValid(v)) { Toast.show('⚠ Key must be 16 alphanumeric characters'); return; }
            state.ffsKey = v; Store.set('ffscouter-key', v); state.nextFfsAllowedAt = 0;
            Toast.show('✓ FFScouter key saved — fetching estimates'); pollFFScouter();
        };
        // hit calling (v5.1)
        q('.wt-hc-url').value = state.hcUrl || '';
        q('.wt-hc-save').onclick = async () => {
            const v = q('.wt-hc-url').value.trim();
            const statusEl = q('.wt-hc-status');
            if (v && !/^https:\/\/script\.google\.com\/macros\//.test(v)) {
                statusEl.innerHTML = '<span style="color:#e88">✗ that is not an Apps Script Web App URL (must start with https://script.google.com/macros/ and end in /exec)</span>';
                return;
            }
            state.hcUrl = v; Store.set('hitcall-url', v);
            if (!v) { statusEl.textContent = 'Hit calling disabled.'; state.calls = new Map(); paintHitCalls(); return; }
            statusEl.textContent = 'Testing connection…';
            try {
                const data = await hcRequest({ action: 'list' });
                if (!data || !data.ok) throw new Error('unexpected response — redeploy the Web App with access "Anyone"');
                state.callEvents = data.events || [];
                state.calls = reduceCalls(state.callEvents);
                statusEl.innerHTML = '<span style="color:#8e8">✓ Connected — 📌 buttons are live on the war list</span>';
                reconcile();
            } catch (e) {
                statusEl.innerHTML = '<span style="color:#e88">✗ ' + esc(e.message) + '</span>';
            }
        };
        q('.wt-hc-copy').onclick = () => Toast.show(copyText(HC_BACKEND) ? '📋 Copied — paste into Apps Script (setup steps are at the top of the script)' : '⚠ Copy failed');
        q('.wt-hc-board').onclick = () => { bg.remove(); openCallBoard(); };
        q('.wt-ffs-test').onclick = async () => {
            const statusEl = q('.wt-ffs-status');
            const key = q('.wt-ffs').value.trim() || state.ffsKey;
            if (!ffsKeyValid(key)) { statusEl.innerHTML = '<span style="color:#e88">✗ enter a 16-char key first</span>'; return; }
            // Pick a target: first enemy on the page, else a fallback id.
            let target = null;
            for (const [pid, row] of state.rows) { if (!isOwnFaction(row.li)) { target = pid; break; } }
            if (!target) target = '1';
            statusEl.innerHTML = '<span style="color:#aaa">Testing…</span>';
            const url = `${C.FFS_ENDPOINT}?key=${key}&targets=${target}&comment=TornWarTools`;
            try {
                const data = await httpGetJSON(url);
                const recs = ffsExtractRecords(data);
                if ((data && (data.error || data.code)) && !recs.length) {
                    statusEl.innerHTML = `<span style="color:#e88">✗ API error ${esc(String(data.code ?? ''))}: ${esc(String(data.error ?? data.message ?? 'unknown'))}</span>`;
                } else if (recs.length) {
                    const rec = ffsReadRecord(recs[0]);
                    statusEl.innerHTML = `<span style="color:#9be8a8">✓ Works — player ${esc(rec.pid || '?')}: ~${esc(rec.est || '?')}, FF ${rec.ff != null ? rec.ff.toFixed(2) : '?'}</span>`;
                } else {
                    statusEl.innerHTML = `<span style="color:#e8c">⚠ Connected but no records. Raw: ${esc(JSON.stringify(data).slice(0, 100))}</span>`;
                }
            } catch (e) {
                statusEl.innerHTML = `<span style="color:#e88">✗ Request failed: ${esc(e.message)}</span>`;
            }
        };
        q('.wt-inline-stats').checked = S.showStatsInline;
        q('.wt-inline-stats').onchange = (e) => {
            saveSetting('showStatsInline', e.target.checked);
            if (!e.target.checked) $$('.wt-stats').forEach(n => n.remove());
            Toast.show(`Inline stats: ${e.target.checked ? 'ON' : 'OFF'}`);
        };
        // templates editor
        const list = q('.wt-tpl-list');
        const renderTpls = () => {
            list.innerHTML = '';
            S.templates.forEach((t, i) => {
                const row = el('div', { class: 'wt-tpl-row' });
                row.innerHTML = `
                    <input type="text" class="n" value="${esc(t.name)}" style="flex:0 0 32%" placeholder="Label">
                    <input type="text" class="b" value="${esc(t.body)}" placeholder="Body">
                    <button class="d" title="Delete">✕</button>`;
                row.querySelector('.n').oninput = (e) => { S.templates[i].name = e.target.value; };
                row.querySelector('.b').oninput = (e) => { S.templates[i].body = e.target.value; };
                row.querySelector('.d').onclick = () => { S.templates.splice(i, 1); if (!S.templates.length) S.templates.push({ name: 'Custom', body: '{name} out in {time}' }); renderTpls(); };
                list.appendChild(row);
            });
        };
        renderTpls();
        q('.wt-tpl-add').onclick = () => { S.templates.push({ name: 'New', body: '{name} — {time}' }); renderTpls(); };
        // callout defaults
        q('.wt-def-mode').value = S.defaultMode === 'clock' ? 'remaining' : S.defaultMode;
        q('.wt-def-off').value = S.offsetSeconds / 60;
        // buttons
        q('.cancel').onclick = () => bg.remove();
        q('.reset').onclick = () => {
            if (!confirm('Reset templates and callout defaults? (API key & Hosp First are kept.)')) return;
            S.templates = defaultTemplates(); saveSetting('templates', S.templates);
            saveSetting('defaultMode', 'remaining'); saveSetting('offsetSeconds', 0); saveSetting('lastTemplate', 0);
            renderTpls(); q('.wt-def-mode').value = 'remaining'; q('.wt-def-off').value = 0; Toast.show('Defaults restored');
        };
        q('.save').onclick = () => {
            S.templates = S.templates.filter(t => (t.name || '').trim() && (t.body || '').trim());
            if (!S.templates.length) S.templates = defaultTemplates();
            saveSetting('templates', S.templates);
            saveSetting('defaultMode', q('.wt-def-mode').value);
            saveSetting('offsetSeconds', (parseFloat(q('.wt-def-off').value) || 0) * 60);
            Toast.show('✓ Saved'); bg.remove();
        };

        document.body.appendChild(bg);
    }

    /* ════════════════════════════════════════════════════════════════════════
     * 17. UI — FLOATING GEAR
     * ════════════════════════════════════════════════════════════════════════ */
    function ensureGear() {
        if (!document.body) return;
        if (!$('.wt-gear')) {
            const gear = el('div', {
                class: 'wt-gear', title: 'War Tools settings',
                onclick: (e) => { e.preventDefault(); e.stopPropagation(); openSettings(); },
                html: '⚙<span class="wt-gear-tip">War Tools</span>',
            });
            document.body.appendChild(gear);
        }
        if (!$('.wt-mass-btn')) {
            const mass = el('div', {
                class: 'wt-mass-btn', title: 'Mass callout',
                onclick: (e) => { e.preventDefault(); e.stopPropagation(); openMassCallout(); },
                html: '📋<span class="wt-gear-tip">Mass callout</span>',
            });
            document.body.appendChild(mass);
        }
        // 📌 board button (v5.1.1) — only once hit calling is linked. The badge
        // shows how many calls are live, so the war page tells you at a glance.
        if (state.hcUrl && !$('.wt-board-btn')) {
            const board = el('div', {
                class: 'wt-board-btn', title: 'Hit call board',
                onclick: (e) => { e.preventDefault(); e.stopPropagation(); openCallBoard(); },
                html: '📌<span class="wt-board-count"></span><span class="wt-gear-tip">Hit calls</span>',
            });
            document.body.appendChild(board);
            updateBoardBtn();
        }
    }

    /* ════════════════════════════════════════════════════════════════════════
     * 18. PER-LIST OBSERVER (detect Torn re-renders / re-sorts)
     * ════════════════════════════════════════════════════════════════════════ */
    const observers = new WeakMap();
    const suspended = new WeakSet();
    let reconcileQueued = false;
    function suspendObserver(ul) { suspended.add(ul); }
    function resumeObserver(ul) { setTimeout(() => suspended.delete(ul), 0); }
    function queueReconcile() {
        if (reconcileQueued) return;
        reconcileQueued = true;
        requestAnimationFrame(() => { reconcileQueued = false; reconcile(); });
    }
    function attachObserver(ul) {
        if (observers.has(ul)) return;
        const o = new MutationObserver(() => { if (!suspended.has(ul)) queueReconcile(); });
        o.observe(ul, { childList: true });
        observers.set(ul, o);
    }

    /* ════════════════════════════════════════════════════════════════════════
     * 19. RECONCILE — the heartbeat that ties state → DOM
     * ════════════════════════════════════════════════════════════════════════ */
    function reconcile() {
        if (!state.warFound) return;
        const structureChanged = indexRows();
        for (const ul of getMemberLists()) attachObserver(ul);
        ensureGear();
        for (const [pid, rec] of state.members) {
            if (state.rows.has(pid)) paintRow(pid, rec);
        }
        // Apply offline/idle hiding across every row (even ones without an API
        // record yet). Hospital rows with a live timer are protected inside
        // applyRowVisibility so we never hide an active callout target.
        debugDumpRow();
        for (const [pid, row] of state.rows) {
            const rec = state.members.get(pid);
            const inHosp = rec && (rec.state === 'Hospital' || rec.state === 'Jail') && (rec.until || 0) > Time.nowSec();
            if (inHosp && state.settings.keepHospVisible) { row.li.classList.remove('wt-hidden-row'); continue; }
            applyRowVisibility(pid, rec || {});
        }
        sortAll();
        paintHitCalls();          // v5.1 — 📌 buttons/pills (signature-guarded, cheap when unchanged)
        // prune dead rows
        for (const [pid, row] of state.rows) if (!row.li.isConnected) state.rows.delete(pid);
    }

    /* ════════════════════════════════════════════════════════════════════════
     * 20. STYLES
     * ════════════════════════════════════════════════════════════════════════ */
    function injectStyles() {
        const css = `
        /* Managed status cell: lay out the callout button and countdown as a
           horizontal flex row so they never overlap. Button sits at the left,
           timer fills the rest and is fully visible. */
        .members-list div.status.wt-managed {
            position: relative;
            display: flex !important;
            align-items: center;
            justify-content: flex-end;
            gap: 4px;
            padding-right: 4px !important;
        }
        .members-list div.status [data-wt-hidden] { display: none !important; }
        .wt-countdown {
            display: inline-block;
            text-align: right;
            font-variant-numeric: tabular-nums;
            font-weight: 600;
            white-space: nowrap;
            flex: 0 1 auto;
            font-size: 12px;
        }
        .wt-countdown[data-kind="hosp"]   { color: var(--user-status-red-color, #e05038); }
        .wt-countdown[data-kind="urgent"] { color: #ff3b3b; }
        .wt-countdown[data-kind="travel"] { color: var(--user-status-blue-color, #4a90d9); font-weight: 500; }
        .wt-stats { display: block; font-size: 10px; font-weight: 600; line-height: 1.1; margin-top: 1px;
            color: #9be8a8; opacity: 0.9; white-space: nowrap; text-align: right; }
        body.wt-no-color .wt-countdown { color: inherit !important; }

        /* Offline/idle hiding */
        .members-list li.wt-hidden-row { display: none !important; }

        /* Soft row highlight when a hosp timer is under threshold */
        .members-list li.wt-highlight { background-color: rgba(224,80,56,0.10) !important; }
        :root .dark-mode .members-list li.wt-highlight { background-color: rgba(255,80,80,0.14) !important; }

        /* Callout buttons now live in the Attack column, to the RIGHT of the
           Attack link. Make the attack cell a flex row so the link and our
           buttons sit side by side without overlap. */
        .members-list .wt-callout-host {
            display: flex !important;
            align-items: center;
            gap: 4px;
            flex-wrap: nowrap;
        }
        .wt-callout {
            flex: 0 0 auto;
            order: 2;                        /* after the Attack link */
            position: static;
            transform: none;
            display: inline-flex; align-items: center; justify-content: center;
            width: 21px; height: 19px; font-size: 11px; line-height: 1;
            background: linear-gradient(180deg,#4a78b8,#2c4d7d);
            color: #fff !important; text-decoration: none !important;
            border: 1px solid #1b3358; border-radius: 3px; cursor: pointer; user-select: none;
            box-shadow: 0 1px 0 rgba(255,255,255,.15) inset, 0 2px 5px rgba(0,0,0,.55);
            transition: filter .1s, transform .1s; z-index: 5;
        }
        .wt-callout:hover  { filter: brightness(1.2); transform: scale(1.1); }
        .wt-callout:active { filter: brightness(.9); transform: scale(.95); }
        /* ⚡ sits just before 📢 (both after the Attack link) with amber tint */
        .wt-quick { order: 1; background: linear-gradient(180deg,#c8922e,#8a5f12); border-color: #6a4a10; }

        /* Hit calling (v5.1.1): 📌 call / 🔒 locked pill / ✓✗ own-call actions.
           order:-1 puts the button FIRST in the attack cell, so when the cell
           runs out of width the shrinkable pill gives way — never the button. */
        .wt-call {
            flex: 0 0 auto; order: -1;
            display: inline-flex; align-items: center; justify-content: center;
            min-width: 20px; height: 20px; padding: 0 3px; border-radius: 3px;
            font-size: 12px; line-height: 1; text-decoration: none !important; cursor: pointer;
            background: linear-gradient(180deg,#8a4ab8,#5a2c7d); border: 1px solid #3f1b58; color: #fff;
            transition: transform .1s, filter .1s;
        }
        .wt-call:hover { filter: brightness(1.2); transform: scale(1.1); }
        /* Called-target row state — the row itself tints (purple = locked by
           someone, green = your call) AND grows a full-width strip line below
           the float cells, so call state never fights the cramped Attack cell. */
        .members-list li.wt-called { background-color: rgba(138,74,184,0.16) !important; box-shadow: inset 3px 0 0 #8a4ab8; }
        .members-list li.wt-called-mine { background-color: rgba(58,138,90,0.16) !important; box-shadow: inset 3px 0 0 #3a8a5a; }
        /* Rows have a fixed height from Torn's CSS — let called rows grow. */
        .members-list li.wt-called, .members-list li.wt-called-mine { height: auto !important; }
        .wt-call-strip {
            clear: both; display: flex; align-items: center; gap: 8px;
            padding: 3px 10px 4px; font-size: 11px; font-weight: 600; line-height: 1.3;
            color: #e2c6ff; background: rgba(138,74,184,.22);
            border-top: 1px solid rgba(138,74,184,.4);
        }
        li.wt-called-mine .wt-call-strip { color: #9be8a8; background: rgba(58,138,90,.22); border-top-color: rgba(58,138,90,.45); }
        .wt-strip-info { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .wt-strip-btn { flex: 0 0 auto; padding: 2px 10px; border-radius: 3px; font-size: 11px; font-weight: 700;
            color: #fff !important; text-decoration: none !important; cursor: pointer; white-space: nowrap; }
        .wt-strip-hit  { background: linear-gradient(180deg,#3a8a5a,#1f5a36); border: 1px solid #16401f; }
        .wt-strip-drop { background: linear-gradient(180deg,#8a3a3a,#5a1f1f); border: 1px solid #401616; }
        .wt-strip-btn:hover { filter: brightness(1.2); }
        .wt-hc-row { padding: 5px 8px; margin: 3px 0; background: #161616; border: 1px solid #333;
            border-radius: 3px; font-size: 12px; line-height: 1.4; }
        .wt-hc-row a { color: #7ab3ff; }
        .wt-hc-save, .wt-hc-copy, .wt-hc-board { padding: 6px 12px; background: #5a2c7d; color: #fff;
            border: 1px solid #3f1b58; border-radius: 3px; cursor: pointer; white-space: nowrap; }
        .wt-hc-copy { background: #2a4a7a; border-color: #3a5a8a; width: 100%; }

        /* Modal */
        .wt-modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,.55); z-index: 999999;
            display: flex; align-items: center; justify-content: center; font-family: Arial, sans-serif; }
        .wt-modal { background: #1e1e1e; color: #ddd; border: 1px solid #444; border-radius: 6px;
            width: 92vw; padding: 14px 16px 12px; box-shadow: 0 8px 32px rgba(0,0,0,.6); font-size: 13px; max-height: 88vh; overflow-y: auto; }
        .wt-modal h2 { font-size: 14px; margin: 0 0 10px; padding-bottom: 8px; border-bottom: 1px solid #333; color: #7ab3ff; }
        .wt-modal label { display: block; margin: 8px 0 3px; font-size: 11px; color: #aaa; text-transform: uppercase; letter-spacing: .5px; }
        .wt-modal select, .wt-modal input[type=text], .wt-modal input[type=number], .wt-modal textarea {
            width: 100%; box-sizing: border-box; padding: 6px 8px; background: #111; color: #eee;
            border: 1px solid #444; border-radius: 3px; font-size: 13px; font-family: inherit; }
        .wt-modal textarea { resize: vertical; min-height: 54px; }
        .wt-row { display: flex; gap: 8px; } .wt-row > * { flex: 1; }
        .wt-preview { margin-top: 8px; padding: 8px 10px; background: #0d1c2e; border: 1px solid #284970;
            border-radius: 3px; color: #cfe4ff; min-height: 18px; word-wrap: break-word; }
        .wt-statline { margin-top: 8px; }
        .wt-stat-badge { display: inline-block; padding: 4px 9px; background: #16281a; border: 1px solid #2d5a35;
            border-radius: 4px; color: #9be8a8; font-size: 12px; font-weight: 600; }
        .wt-stat-badge.muted { background: #222; border-color: #3a3a3a; color: #888; font-weight: 500; }
        .wt-btns { display: flex; gap: 8px; margin-top: 12px; justify-content: flex-end; }
        .wt-btns button { padding: 6px 14px; border-radius: 3px; cursor: pointer; font-size: 12px;
            border: 1px solid #444; background: #2a2a2a; color: #ddd; }
        .wt-btns button.primary { background: linear-gradient(180deg,#4a78b8,#2c4d7d); border-color: #1b3358; color: #fff; }
        .wt-btns button.danger { background: #5a2a2a; border-color: #7a3a3a; color: #fff; }
        .wt-btns button:hover { filter: brightness(1.15); }
        .wt-link { display: block; text-align: right; margin-top: 8px; font-size: 11px; color: #7ab3ff; cursor: pointer; text-decoration: underline; }
        .wt-help { font-size: 11px; color: #888; margin-top: 4px; line-height: 1.4; }
        .wt-switch { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #ddd; cursor: pointer;
            text-transform: none; letter-spacing: normal; margin: 6px 0; }
        .wt-switch input { width: 16px; height: 16px; cursor: pointer; margin: 0; accent-color: #4a78b8; }
        .wt-tpl-row { display: flex; gap: 6px; margin-bottom: 4px; }
        .wt-tpl-row input { flex: 1; } .wt-tpl-row .d { padding: 0 8px; flex: 0 0 auto; cursor: pointer; background: #3a2a2a; color: #f99; border: 1px solid #5a3a3a; border-radius: 3px; }
        .wt-tpl-add { margin-top: 6px; padding: 4px 10px; font-size: 11px; cursor: pointer; background: #2a4a2a; color: #cfc; border: 1px solid #3a6a3a; border-radius: 3px; }
        .wt-key-save, .wt-ffs-save, .wt-ffs-test, .wt-preset-save, .wt-preset-del { padding: 6px 12px; background: #2a4a7a; color: #fff; border: 1px solid #3a5a8a; border-radius: 3px; cursor: pointer; white-space: nowrap; }
        .wt-preset-save { background: #2a5a3a; border-color: #3a7a4a; }
        .wt-ffs-test { background: #2a5a3a; border-color: #3a7a4a; }

        /* Toast */
        .wt-toast { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
            background: #2a4a7a; color: #fff; padding: 8px 16px; border-radius: 4px; font-size: 13px;
            z-index: 1000000; box-shadow: 0 2px 8px rgba(0,0,0,.5); pointer-events: none; opacity: 0; transition: opacity .2s; }
        .wt-toast.show { opacity: 1; }

        /* Gear */
        .wt-gear { position: fixed; top: 60px; left: 12px; width: 42px; height: 42px; border-radius: 50%;
            background: linear-gradient(180deg,#4a78b8,#2c4d7d); color: #fff; border: 1px solid #1b3358;
            box-shadow: 0 2px 8px rgba(0,0,0,.5), 0 1px 0 rgba(255,255,255,.15) inset; font-size: 20px;
            cursor: pointer; user-select: none; display: flex; align-items: center; justify-content: center;
            z-index: 99998; transition: transform .15s, filter .15s; }
        .wt-gear:hover { filter: brightness(1.2); transform: scale(1.08); }
        .wt-gear:active { transform: scale(.95); }
        .wt-gear-tip { position: absolute; left: 52px; top: 50%; transform: translateY(-50%);
            background: rgba(0,0,0,.85); color: #fff; padding: 4px 10px; border-radius: 4px; font-size: 11px;
            white-space: nowrap; pointer-events: none; opacity: 0; transition: opacity .15s; }
        .wt-gear:hover .wt-gear-tip { opacity: 1; }
        /* Mass-callout floating button — sits just below the gear, top-left */
        .wt-mass-btn { position: fixed; top: 110px; left: 12px; width: 42px; height: 42px; border-radius: 50%;
            background: linear-gradient(180deg,#3a8a5a,#1f5a36); color: #fff; border: 1px solid #16401f;
            box-shadow: 0 2px 8px rgba(0,0,0,.5), 0 1px 0 rgba(255,255,255,.15) inset; font-size: 18px;
            cursor: pointer; user-select: none; display: flex; align-items: center; justify-content: center;
            z-index: 99998; transition: transform .15s, filter .15s; }
        .wt-mass-btn:hover { filter: brightness(1.2); transform: scale(1.08); }
        .wt-mass-btn:active { transform: scale(.95); }
        .wt-mass-btn .wt-gear-tip { position: absolute; left: 52px; top: 50%; transform: translateY(-50%);
            background: rgba(0,0,0,.85); color: #fff; padding: 4px 10px; border-radius: 4px; font-size: 11px;
            white-space: nowrap; pointer-events: none; opacity: 0; transition: opacity .15s; }
        .wt-mass-btn:hover .wt-gear-tip { opacity: 1; }
        /* 📌 call-board floating button — below the mass-callout button */
        .wt-board-btn { position: fixed; top: 160px; left: 12px; width: 42px; height: 42px; border-radius: 50%;
            background: linear-gradient(180deg,#8a4ab8,#5a2c7d); color: #fff; border: 1px solid #3f1b58;
            box-shadow: 0 2px 8px rgba(0,0,0,.5), 0 1px 0 rgba(255,255,255,.15) inset; font-size: 18px;
            cursor: pointer; user-select: none; display: flex; align-items: center; justify-content: center;
            z-index: 99998; transition: transform .15s, filter .15s; }
        .wt-board-btn:hover { filter: brightness(1.2); transform: scale(1.08); }
        .wt-board-btn:active { transform: scale(.95); }
        .wt-board-btn .wt-gear-tip { position: absolute; left: 52px; top: 50%; transform: translateY(-50%);
            background: rgba(0,0,0,.85); color: #fff; padding: 4px 10px; border-radius: 4px; font-size: 11px;
            white-space: nowrap; pointer-events: none; opacity: 0; transition: opacity .15s; }
        .wt-board-btn:hover .wt-gear-tip { opacity: 1; }
        .wt-board-btn .wt-board-count { position: absolute; top: -4px; right: -4px; min-width: 17px; height: 17px;
            border-radius: 9px; background: #c8922e; border: 1px solid #6a4a10; color: #fff; font-size: 10px;
            font-weight: 700; line-height: 15px; text-align: center; padding: 0 3px; box-sizing: border-box; }
        .wt-board-btn .wt-board-count:empty { display: none; }
        .wt-board-btn.has-calls { animation: wt-board-pulse 2.4s ease-in-out infinite; }
        @keyframes wt-board-pulse {
            0%, 100% { box-shadow: 0 2px 8px rgba(0,0,0,.5), 0 0 0 0 rgba(138,74,184,.5); }
            50%      { box-shadow: 0 2px 8px rgba(0,0,0,.5), 0 0 0 6px rgba(138,74,184,0); }
        }`;
        try { if (typeof GM_addStyle === 'function') { GM_addStyle(css); return; } } catch (_) {}
        document.head.appendChild(el('style', {}, css));
    }

    /* ════════════════════════════════════════════════════════════════════════
     * 21. BOOTSTRAP
     * ════════════════════════════════════════════════════════════════════════ */
    function onWarReady() {
        if (state.warFound) return;
        state.warFound = true;
        LOG('war list detected — starting');
        hydrateFromCache();
        reconcile();
        poll();
        pollFFScouter();
    }

    function watchForWar() {
        const existing = $('#faction_war_list_id .faction-war') || $('.faction-war');
        if (existing) { onWarReady(); return; }
        const obs = new MutationObserver(() => {
            if ($('.faction-war')) { obs.disconnect(); onWarReady(); }
        });
        if (document.body) obs.observe(document.body, { childList: true, subtree: true });
        // Safety timeout: even on a plain faction page, show the gear so settings are reachable
        setTimeout(() => { if (!state.warFound && $('.faction-war')) onWarReady(); }, 10_000);
    }

    function start() {
        injectStyles();
        if (!state.settings.colorCountdowns) document.body?.classList.add('wt-no-color');
        // Floating ⚙/📋 appear only once a war list is on screen — the suite's
        // War > 🛠 Tools pane is the front door everywhere else.
        watchForWar();

        // Timers
        setInterval(() => { if (state.running && state.warFound) poll(); }, 3_000); // poll() self-gates on cadence
        setInterval(() => { if (state.warFound) pollFFScouter(); }, 5_000);          // self-gates on FFS_POLL
        setInterval(() => { if (state.warFound) pollHitCalls(); }, 5_000);           // self-gates on HC_POLL (v5.1)
        setInterval(() => { if (state.warFound && !document.hidden) tickCountdowns(); }, C.TICK_CLOCK);
        setInterval(() => { if (state.warFound) reconcile(); }, C.TICK_RECONCILE);
        setInterval(() => { if (state.warFound) ensureGear(); }, 3_000);

        // Repaint immediately when tab regains focus
        document.addEventListener('visibilitychange', () => { if (!document.hidden && state.warFound) { state.nextPollAllowedAt = 0; poll(); reconcile(); } });

        // Console handle
        const w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
        w.TornWarTools = {
            state, openSettings, openMassCallout, poll, pollFFScouter, version: VERSION,
            onlineState, reconcile, openCallBoard, pollHitCalls,
            // Manual probe: TornWarTools.debugStates() prints every enemy row's detected state
            debugStates() {
                const out = [];
                for (const [pid, row] of state.rows) {
                    if (isOwnFaction(row.li)) continue;
                    const av = row.li.querySelector('a[data-label="avatar"]');
                    out.push({ pid, state: onlineState(row.li), avatarClass: av ? av.className : '(none)' });
                }
                console.table(out);
                return out;
            },
        };
        OCM_WT = w.TornWarTools;   // suite-side handle for the War > 🛠 Tools pane
        LOG(`v${VERSION} ready (embedded in OC Suite)`);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }


  // ─── BOOT / PAGE ROUTER ──────────────────────────────────────────────────────
  if (location.pathname.includes('item.php')) {
    // Items page: only the (opt-in) self-loadout capture — no dashboard here.
    initLoadoutCapture();
  } else {
    // factions.php — the dashboard boot, unchanged.
    inject();
    initLoanAutofill();
    initArmoryAnnotations();
    // Armoury is a hash route — a later navigation there must also autofill.
    window.addEventListener('hashchange', () => { initLoanAutofill(); initArmoryAnnotations(); });
    injectSidebar();
    fetchRoleWeights();
    // War Tools (v5.0): self-contained war-page command center. No-ops on
    // pages without a war list beyond a cheap observer.
    initWarTools();
  }

})();