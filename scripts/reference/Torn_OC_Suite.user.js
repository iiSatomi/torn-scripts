// ==UserScript==
// @name         Torn OC Suite
// @namespace    torn_oc_suite
// @version      3.37.0-ui7
// @description  Full Organised Crime management for Torn faction leaders — fill slots by CPR, track loaned items and armory gaps, and see exactly who got paid what.
// @author       iSatomi (3580191)
// @match        https://www.torn.com/factions.php*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_xmlHttpRequest
// @grant        GM.xmlHttpRequest
// @connect      tornprobability.com
// @connect      www.tornstats.com
// @connect      api.torn.com
// @downloadURL https://update.greasyfork.org/scripts/573001/Torn%20OC%20Manager%20Dashboard.user.js
// @updateURL https://update.greasyfork.org/scripts/573001/Torn%20OC%20Manager%20Dashboard.meta.js
// ==/UserScript==
//
//
// Changelog (recent):
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
  /** Loans + member-item issues, handed from the finance render to updateTabCounts. */
  let ocmPeopleItemAttn = 0;

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
    MY_PLAYER_ID: 'ocs_my_player_id',
    OH_LAST: 'ocs_oh_last',
    PAYOUT_EVENTS: 'ocs_payout_events',
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
  function matchPayouts(ocList, payEvents, sharePct, windowDays = PAYOUT_MATCH_WINDOW_D) {
    const maxGap = windowDays * 86400;
    const claims = [];
    for (const oc of ocList) {
      if (!(oc.money > 0)) continue;
      const ids = Object.keys(oc.participants || {});
      if (!ids.length) continue;
      const expected = (oc.money * sharePct / 100) / ids.length;
      if (!(expected > 0)) continue;
      for (const uid of ids) {
        claims.push({ ocId: String(oc.id), ocName: oc.name, uid: String(uid),
                      name: oc.participants[uid], expected, ts: oc.executedAt || 0, matched: null });
      }
    }
    const events = Object.entries(payEvents || {})
      .filter(([, e]) => e && e.toId && e.amount > 0)
      .map(([id, e]) => ({ id, ...e, toId: String(e.toId), usedBy: [] }))
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
   */
  function syncPayoutEvents(newsData) {
    if (!newsData || newsData.__err || !newsData.news) return;
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
      '--ocm-cpr-good':  '#43c98b',
      '--ocm-cpr-warn':  '#e0a83a',
      '--ocm-cpr-crit':  '#f2678a',
      '--ocm-link':      '#7cd4ff',
      '--ocm-text':      '#dce7f7',
      '--ocm-text-card': '#c4d2e6',
      '--ocm-text-dim':   '#97abc7',
      '--ocm-text-muted': '#8195b0',
      '--ocm-text-faint': '#74879f',
      '--ocm-bg':         '#070c16',
      '--ocm-bg-card':    '#0f1728',
      '--ocm-bg-hover':   '#16223a',
      '--ocm-border':     '#1c2942',
      '--ocm-border-soft':'#172236',
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
      margin: 8px 0 12px;
      background: var(--ocm-bg);
      border: 1px solid var(--ocm-border);
      border-radius: 6px;
      font-family: Arial, sans-serif;
      font-size: 13px;
      color: var(--ocm-text-card);
      overflow: hidden;
    }

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
      display: flex; gap: 4px;
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
    @media (max-width: 720px) {
      .ocm-stats-row { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }
    .ocm-stat {
      background: var(--ocm-bg-card); border: 1px solid var(--ocm-border);
      border-radius: 8px; padding: 10px 12px;
      display: block; text-align: left; min-width: 0;
    }
    .ocm-stat-label {
      display: block; font-size: 9px; text-transform: uppercase; letter-spacing: .06em;
      color: var(--ocm-text-muted); font-weight: 700;
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
    .ocm-section-title::after {
      content: '▼';
      font-size: 9px;
      color: var(--ocm-text-faint);
      transition: transform .2s;
      margin-left: 8px;
    }
    .ocm-section-title.collapsed::after {
      transform: rotate(-90deg);
    }

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
    .ocm-members-table, .ocm-blocked-row, .ocm-mh-table, .ocm-analytics-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .ocm-members-table th, .ocm-mh-table th, .ocm-analytics-table th {
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
    .ocm-members-table td, .ocm-mh-table td, .ocm-analytics-table td {
      padding: 5px 12px;
      border-bottom: 1px solid var(--ocm-border-soft);
      color: var(--ocm-text);
    }
    .ocm-members-table tr:hover td,
    .ocm-mh-table tr:hover td,
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

    /* ── ANALYTICS ────────────────────────────────────────────────────── */
    .ocm-analytics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 10px;
      padding: 0 12px 12px;
    }
    .ocm-analytics-card {
      background: var(--ocm-bg-card);
      border: 1px solid var(--ocm-border-soft);
      border-radius: 4px;
      padding: 12px 14px;
      min-width: 0;
      overflow: hidden;
    }
    /* Chart card headings + their Show/Hide Chart toggle button */
    .ocm-analytics-card > h4,
    .ocm-chart-card > h4 {
      margin: 0 0 10px;
      font-size: 14px;
      color: var(--ocm-text);
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .ocm-chart-toggle {
      background: #1c2230;
      border: 1px solid #34507a;
      color: #9cb8e0;
      font-size: 11px;
      font-weight: bold;
      padding: 3px 10px;
      border-radius: 4px;
      cursor: pointer;
      line-height: 1.4;
    }
    .ocm-chart-toggle:hover { background: #233048; color: #c4d6f0; }
    .ocm-analytics-card .ocm-analytics-table {
      table-layout: fixed;
      width: 100%;
      border-collapse: collapse;
    }
    .ocm-analytics-card .ocm-analytics-table td,
    .ocm-analytics-card .ocm-analytics-table th {
      padding: 6px 5px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    /* Column headers — smaller so they don't truncate ("SUCC…", "AVG C…") */
    .ocm-analytics-card .ocm-analytics-table th {
      font-size: 9px;
      letter-spacing: .2px;
      color: var(--ocm-text-muted);
    }
    /* First column (name) takes all remaining space and ellipsizes */
    .ocm-analytics-card .ocm-analytics-table th:first-child,
    .ocm-analytics-card .ocm-analytics-table td:first-child {
      width: auto;
      padding-left: 10px;
    }
    .ocm-analytics-card .ocm-analytics-table th.td-right,
    .ocm-analytics-card .ocm-analytics-table td.td-right {
      width: 52px;
    }
    .ocm-analytics-card .ocm-analytics-table th.ocm-sfe-col,
    .ocm-analytics-card .ocm-analytics-table td.ocm-sfe-col {
      width: 76px;
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

    /* ── MEMBER HISTORY / OC HISTORY (Analytics drilldowns) ───────────── */
    #ocm-member-history-wrap, #ocm-oc-history-wrap {
      margin-top: 18px;
      clear: both;
    }
    #ocm-member-history-wrap h4, #ocm-oc-history-wrap h4 {
      margin: 0 0 8px;
      font-size: 14px;
      color: var(--ocm-text);
    }
    #ocm-mh-table-wrap, #ocm-oh-table-wrap { margin-top: 6px; }
    .ocm-mh-search-wrap, .ocm-oh-search-wrap {
      position: relative;
      margin: 8px 0;
      padding-right: 70px;     /* reserve room for the absolutely-positioned Clear button */
    }
    .ocm-mh-search, .ocm-oh-search {
      width: 100%;
      box-sizing: border-box;
    }
    .ocm-mh-clear, .ocm-oh-clear {
      position: absolute;
      right: 0;
      top: 50%;
      transform: translateY(-50%);
      background: var(--ocm-bg-hover);
      border: none;
      color: var(--ocm-text-dim);
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 3px;
      cursor: pointer;
      white-space: nowrap;
    }
    .ocm-mh-dropdown, .ocm-oh-dropdown {
      background: var(--ocm-bg-card);
      border: 1px solid var(--ocm-border-soft);
      border-radius: 4px;
      max-height: 200px;
      overflow-y: auto;
    }
    .ocm-mh-option {
      padding: 6px 10px;
      cursor: pointer;
      font-size: 12px;
      color: var(--ocm-text);
      border-bottom: 1px solid var(--ocm-border-soft);
    }
    .ocm-mh-option:hover { background: var(--ocm-bg-hover); }
    .ocm-mh-empty, .ocm-oh-empty { color: var(--ocm-text-dim); padding: 10px 14px; font-size: 12px; }
    .ocm-mh-summary, .ocm-oh-summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
      gap: 6px;
      margin: 8px 0;
    }
    .ocm-mh-sum-item {
      background: var(--ocm-bg-card);
      border: 1px solid var(--ocm-border-soft);
      border-radius: 4px;
      padding: 6px 10px;
    }
    .ocm-mh-sum-label { color: var(--ocm-text-faint); font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; }
    .ocm-mh-sum-value { color: var(--ocm-text); font-size: 14px; font-weight: bold; }
    .ocm-mh-table-wrap, .ocm-oh-table-wrap { overflow-x: auto; margin-top: 8px; }

    .ocm-last5-wrap { margin: 4px 0; }
    .ocm-last5-row-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 10px;
      background: #1a1a1a;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
      color: var(--ocm-text-dim);
    }
    .ocm-last5-row-header:hover { background: var(--ocm-bg-card); }
    .ocm-last5-detail, .ocm-oh-run-detail {
      padding: 8px 10px;
      background: var(--ocm-bg);
      border: 1px solid #2a2a2a;
      border-radius: 3px;
      margin-top: 4px;
      font-size: 11px;
      color: var(--ocm-text-dim);
    }

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

    /* ═══════════ NEW UI shell (v3.37-ui1) — rail + topbar, scoped to .ocm-ui2 ═══════════
       Reuses the themeable --ocm-* vars so every theme (incl. colour-blind) still applies.
       Only the outer chrome is restyled here; per-tab content is migrated tab-by-tab.      */
    #ocm-root.ocm-ui2 {
      --ocm-fb: #38bdf8; --ocm-fb-deep: #0ea5e9;
      --ocm-rail-w: 188px; --ocm-topbar-h: 46px;
      display: flex; align-items: stretch;
      margin: 8px 0 12px; padding: 0;
      border: 1px solid var(--ocm-border); border-radius: 10px; overflow: hidden;
      min-height: 520px;
    }
    /* ── rail ── */
    #ocm-root.ocm-ui2 #ocm-rail {
      flex: 0 0 var(--ocm-rail-w); display: flex; flex-direction: column; gap: 2px;
      background: rgba(0,0,0,.22); border-right: 1px solid var(--ocm-border); padding: 10px 8px;
    }
    #ocm-root.ocm-ui2 #ocm-rail-brand { display: flex; align-items: center; gap: 9px; padding: 6px 8px 12px; }
    #ocm-root.ocm-ui2 .ocm-rb-mark { width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; font-size: 15px; background: linear-gradient(135deg, var(--ocm-fb), #a371f7); flex: none; }
    #ocm-root.ocm-ui2 .ocm-rb-txt b { font-size: 13px; color: var(--ocm-text); }
    #ocm-root.ocm-ui2 .ocm-rb-txt small { display: block; font-size: 10px; color: var(--ocm-text-faint); }
    #ocm-root.ocm-ui2 #ocm-tabs { display: flex; flex-direction: column; gap: 3px; border: none; margin: 0; padding: 0; background: none; }
    #ocm-root.ocm-ui2 .ocm-nav {
      display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 8px;
      cursor: pointer; color: var(--ocm-text-dim); font-size: 12.5px; font-weight: 600;
      border: 1px solid transparent; position: relative; background: none;
    }
    #ocm-root.ocm-ui2 .ocm-nav .ocm-nav-i { width: 18px; text-align: center; font-size: 14px; }
    #ocm-root.ocm-ui2 .ocm-nav .ocm-nav-l { flex: 1; }
    #ocm-root.ocm-ui2 .ocm-nav:hover { background: var(--ocm-bg-hover); color: var(--ocm-text); }
    #ocm-root.ocm-ui2 .ocm-nav.active { background: var(--ocm-bg-card); color: #fff; border-color: var(--ocm-border); }
    #ocm-root.ocm-ui2 .ocm-nav.active::before { content: ""; position: absolute; left: -8px; top: 8px; bottom: 8px; width: 3px; border-radius: 2px; background: var(--ocm-fb); }
    #ocm-root.ocm-ui2 .ocm-nav .ocm-tab-count { margin-left: auto; background: var(--ocm-cpr-crit); color: #120a0a; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 9px; min-width: 15px; text-align: center; }
    #ocm-root.ocm-ui2 .ocm-nav .ocm-tab-count:empty { display: none; }
    #ocm-root.ocm-ui2 .ocm-rail-sp { flex: 1; }
    #ocm-root.ocm-ui2 #ocm-rail-foot { display: flex; flex-direction: column; gap: 5px; border-top: 1px solid var(--ocm-border); padding-top: 8px; }
    #ocm-root.ocm-ui2 #ocm-rail-foot button { width: 100%; text-align: left; background: var(--ocm-bg-card); border: 1px solid var(--ocm-border); color: var(--ocm-text-dim); border-radius: 7px; padding: 7px 10px; font-size: 11.5px; cursor: pointer; }
    #ocm-root.ocm-ui2 #ocm-rail-foot button:hover { color: var(--ocm-text); border-color: var(--ocm-fb); }
    /* ── main + topbar ── */
    #ocm-root.ocm-ui2 #ocm-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    #ocm-root.ocm-ui2 #ocm-topbar { display: flex; align-items: center; gap: 12px; height: var(--ocm-topbar-h); flex: 0 0 auto; padding: 0 14px; border-bottom: 1px solid var(--ocm-border); background: rgba(0,0,0,.15); }
    #ocm-root.ocm-ui2 #ocm-topbar-title { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
    #ocm-root.ocm-ui2 #ocm-topbar h2 { margin: 0; font-size: 14px; color: var(--ocm-text); white-space: nowrap; }
    #ocm-root.ocm-ui2 #ocm-topbar .ocm-hdr-gap { flex: 1; }
    #ocm-root.ocm-ui2 #ocm-refresh-btn { background: var(--ocm-bg-card); border: 1px solid var(--ocm-border); color: var(--ocm-text-dim); border-radius: 7px; padding: 6px 12px; font-size: 12px; cursor: pointer; }
    #ocm-root.ocm-ui2 #ocm-refresh-btn:hover { color: var(--ocm-fb); border-color: var(--ocm-fb); }
    #ocm-root.ocm-ui2 #ocm-body { padding: 12px 14px; overflow: auto; }
    #ocm-root.ocm-ui2 #ocm-legend,
    #ocm-root.ocm-ui2 #ocm-config-panel { margin: 12px 14px 0; }
    /* ── subtabs → pill row ── */
    #ocm-root.ocm-ui2 .ocm-subtabs { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 12px; border-bottom: 1px solid var(--ocm-border); padding-bottom: 8px; }
    #ocm-root.ocm-ui2 .ocm-subtab { padding: 6px 11px; border-radius: 7px; font-size: 12px; color: var(--ocm-text-dim); cursor: pointer; border: 1px solid transparent; background: none; }
    #ocm-root.ocm-ui2 .ocm-subtab:hover { background: var(--ocm-bg-hover); color: var(--ocm-text); }
    #ocm-root.ocm-ui2 .ocm-subtab.active { background: var(--ocm-bg-card); color: var(--ocm-fb); border-color: var(--ocm-border); }
    /* ── narrow (TornPDA / mobile): collapse rail to icons ── */
    @media (max-width: 620px) {
      #ocm-root.ocm-ui2 { --ocm-rail-w: 52px; }
      #ocm-root.ocm-ui2 .ocm-nav-l,
      #ocm-root.ocm-ui2 .ocm-rb-txt,
      #ocm-root.ocm-ui2 #ocm-rail-foot button { font-size: 0; }
      #ocm-root.ocm-ui2 #ocm-rail-foot button::first-letter { font-size: 13px; }
      #ocm-root.ocm-ui2 .ocm-nav { justify-content: center; padding: 9px 6px; }
      #ocm-root.ocm-ui2 .ocm-nav .ocm-tab-count { position: absolute; top: 3px; right: 3px; margin: 0; }
    }

    /* ─── UI KIT primitives — build all new/migrated content from these ─── */
    #ocm-root.ocm-ui2 .ocm-kgrid { display: grid; grid-template-columns: repeat(var(--kcols, 12), minmax(0, 1fr)); gap: 8px; }
    #ocm-root.ocm-ui2 .ocm-card { background: var(--ocm-bg-card); border: 1px solid var(--ocm-border); border-radius: 10px; padding: 12px; }
    #ocm-root.ocm-ui2 .ocm-card-h { display: flex; align-items: center; gap: 8px; margin: -2px 0 10px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; color: var(--ocm-text-dim); }
    #ocm-root.ocm-ui2 .ocm-card-h .ocm-card-r { margin-left: auto; font-weight: 500; text-transform: none; letter-spacing: 0; color: var(--ocm-text-faint); font-size: 11px; }
    #ocm-root.ocm-ui2 .ocm-tile { background: var(--ocm-bg-card); border: 1px solid var(--ocm-border); border-radius: 10px; padding: 10px 12px; }
    #ocm-root.ocm-ui2 .ocm-tile-v { font-size: 22px; font-weight: 700; letter-spacing: -.4px; line-height: 1.1; }
    #ocm-root.ocm-ui2 .ocm-tile-l { color: var(--ocm-text-dim); font-size: 11px; margin-top: 2px; }
    #ocm-root.ocm-ui2 .ocm-tile-s { color: var(--ocm-text-faint); font-size: 10px; margin-top: 1px; }
    #ocm-root.ocm-ui2 .ocm-tile-good .ocm-tile-v { color: var(--ocm-cpr-good); }
    #ocm-root.ocm-ui2 .ocm-tile-warn .ocm-tile-v { color: var(--ocm-cpr-warn); }
    #ocm-root.ocm-ui2 .ocm-tile-crit .ocm-tile-v { color: var(--ocm-cpr-crit); }
    #ocm-root.ocm-ui2 .ocm-tile-info .ocm-tile-v { color: var(--ocm-link); }
    #ocm-root.ocm-ui2 .ocm-kchip { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 6px; border: 1px solid var(--ocm-border); color: var(--ocm-text-dim); }
    #ocm-root.ocm-ui2 .ocm-kchip-good { color: var(--ocm-cpr-good); border-color: rgba(122,191,122,.4); }
    #ocm-root.ocm-ui2 .ocm-kchip-warn { color: var(--ocm-cpr-warn); border-color: rgba(191,159,90,.4); }
    #ocm-root.ocm-ui2 .ocm-kchip-crit { color: var(--ocm-cpr-crit); border-color: rgba(191,122,122,.4); }
    #ocm-root.ocm-ui2 .ocm-prov { font-size: 9.5px; font-weight: 700; padding: 1px 5px; border-radius: 5px; text-transform: uppercase; letter-spacing: .3px; }
    #ocm-root.ocm-ui2 .ocm-prov-obs { background: rgba(56,189,248,.16); color: #7dd3fc; }
    #ocm-root.ocm-ui2 .ocm-prov-est { background: var(--ocm-bg-hover); color: var(--ocm-text-faint); }

    /* ─── Crimes tab content, mapped onto the kit look (scoped overrides only) ─── */
    #ocm-root.ocm-ui2 .ocm-stats-row { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; margin-bottom: 8px; }
    #ocm-root.ocm-ui2 .ocm-stat { background: var(--ocm-bg-card); border: 1px solid var(--ocm-border); border-radius: 10px; padding: 9px 11px; display: flex; flex-direction: column; gap: 2px; }
    #ocm-root.ocm-ui2 .ocm-stat-label { order: 2; color: var(--ocm-text-dim); font-size: 10px; text-transform: uppercase; letter-spacing: .4px; }
    #ocm-root.ocm-ui2 .ocm-stat-value { order: 1; font-size: 20px; font-weight: 700; line-height: 1.1; }
    #ocm-root.ocm-ui2 .ocm-stats-row-recruiting { background: var(--ocm-bg-card); border: 1px solid var(--ocm-border); border-radius: 10px; padding: 8px 11px; display: flex; align-items: center; gap: 10px; }
    #ocm-root.ocm-ui2 .ocm-section-title { border-left: 3px solid var(--ocm-fb); padding-left: 9px; font-size: 12px; letter-spacing: .5px; }
    #ocm-root.ocm-ui2 .ocm-phase-header,
    #ocm-root.ocm-ui2 #ocm-planning-header,
    #ocm-root.ocm-ui2 #ocm-recruiting-header { background: var(--ocm-bg-card); border: 1px solid var(--ocm-border); border-radius: 9px; padding: 8px 12px; margin: 10px 0 8px; }
    @media (max-width: 620px) {
      #ocm-root.ocm-ui2 .ocm-stats-row { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }

    /* ─── bounded height: cap the suite so it never grows massive; scroll content inside ─── */
    #ocm-root.ocm-ui2 { max-height: min(78vh, 820px); }
    #ocm-root.ocm-ui2 #ocm-rail { overflow-y: auto; }
    #ocm-root.ocm-ui2 #ocm-main { min-height: 0; overflow: hidden; }
    #ocm-root.ocm-ui2 #ocm-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
    #ocm-root.ocm-ui2 #ocm-body { overflow: visible; }

    /* ─── member cards + OC slot rows, mapped onto the kit look ─── */
    #ocm-root.ocm-ui2 .ocm-mcard-list { display: flex; flex-direction: column; gap: 8px; }
    #ocm-root.ocm-ui2 .ocm-mcard { background: var(--ocm-bg-card); border: 1px solid var(--ocm-border); border-radius: 10px; padding: 10px 12px; transition: border-color .12s; }
    #ocm-root.ocm-ui2 .ocm-mcard:hover { border-color: rgba(56,189,248,.4); }
    #ocm-root.ocm-ui2 .ocm-mcard-name { font-weight: 650; }
    #ocm-root.ocm-ui2 .ocm-mcard-rec { background: rgba(56,189,248,.06); border: 1px solid var(--ocm-border); border-radius: 8px; padding: 6px 9px; margin-top: 6px; }
    #ocm-root.ocm-ui2 .ocm-slot { border: 1px solid var(--ocm-border); border-radius: 8px; padding: 6px 9px; }
    #ocm-root.ocm-ui2 .ocm-slot:hover { background: var(--ocm-bg-hover); }

    /* ─── shared data tables (People assignments/history, Money analytics) onto the kit ─── */
    #ocm-root.ocm-ui2 .ocm-members-table th,
    #ocm-root.ocm-ui2 .ocm-mh-table th,
    #ocm-root.ocm-ui2 .ocm-analytics-table th { position: sticky; top: 0; z-index: 1; background: var(--ocm-bg-hover); color: var(--ocm-text-dim); text-transform: uppercase; letter-spacing: .4px; font-size: 10.5px; }
    #ocm-root.ocm-ui2 .ocm-members-table td,
    #ocm-root.ocm-ui2 .ocm-mh-table td,
    #ocm-root.ocm-ui2 .ocm-analytics-table td { border-bottom: 1px solid var(--ocm-border-soft); }
    #ocm-root.ocm-ui2 .ocm-members-table tr:hover td,
    #ocm-root.ocm-ui2 .ocm-mh-table tr:hover td,
    #ocm-root.ocm-ui2 .ocm-analytics-table tr:hover td { background: var(--ocm-bg-hover); }

    /* ═══════════ PREMIUM RESKIN (Frostbite) — glow + gradient panels over the ui2 shell ═══════════ */
    #ocm-root.ocm-ui2 {
      --ocm-fb: #3db8f5; --ocm-fb-br: #7cd4ff; --ocm-glow: rgba(61,184,245,.5);
      background:
        radial-gradient(900px 380px at 12% -10%, rgba(30,136,224,.10), transparent 60%),
        radial-gradient(700px 320px at 100% 0%, rgba(61,184,245,.06), transparent 55%),
        var(--ocm-bg);
    }
    #ocm-root.ocm-ui2 #ocm-rail { background: linear-gradient(180deg, #0f1728, #0c1322); }
    #ocm-root.ocm-ui2 .ocm-rb-mark { background: linear-gradient(150deg, #10305a, #0a1730); border: 1px solid #1e4a7a; color: #8fd6ff; box-shadow: 0 0 18px rgba(61,184,245,.28), inset 0 0 12px rgba(61,184,245,.15); }
    #ocm-root.ocm-ui2 .ocm-rb-txt b { color: var(--ocm-fb-br); letter-spacing: .4px; text-shadow: 0 0 10px var(--ocm-glow); }
    #ocm-root.ocm-ui2 .ocm-nav.active { background: rgba(61,184,245,.10); color: var(--ocm-fb-br); border-color: rgba(61,184,245,.35); box-shadow: 0 0 16px rgba(61,184,245,.14); }
    #ocm-root.ocm-ui2 .ocm-nav.active::before { background: var(--ocm-fb); }
    #ocm-root.ocm-ui2 #ocm-topbar { background: linear-gradient(180deg, #0f1728, #0a111f); }
    #ocm-root.ocm-ui2 #ocm-topbar h2 { color: var(--ocm-fb-br); text-shadow: 0 0 10px var(--ocm-glow); letter-spacing: .4px; }
    #ocm-root.ocm-ui2 .ocm-card,
    #ocm-root.ocm-ui2 .ocm-tile,
    #ocm-root.ocm-ui2 .ocm-stat { background: linear-gradient(180deg, #0f1728, #0c1322); border-color: var(--ocm-border); }
    #ocm-root.ocm-ui2 .ocm-mcard { background: #0b1220; }
    #ocm-root.ocm-ui2 .ocm-subtab.active { color: var(--ocm-fb-br); }
    #ocm-root.ocm-ui2 .ocm-members-table th,
    #ocm-root.ocm-ui2 .ocm-mh-table th,
    #ocm-root.ocm-ui2 .ocm-analytics-table th { background: rgba(0,0,0,.22); }
    #ocm-root.ocm-ui2 #ocm-refresh-btn:hover,
    #ocm-root.ocm-ui2 #ocm-rail-foot button:hover { color: var(--ocm-fb-br); border-color: var(--ocm-fb); }
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
  /** KPI tile HTML used by the finance sub-tabs. */
  const kpiTile = (label, value, sub, color, border) => `
      <div style="flex:1;min-width:108px;background:var(--ocm-bg-card);border:1px solid ${border||'var(--ocm-border-soft)'};border-radius:6px;padding:10px 14px">
        <div style="font-size:9px;color:var(--ocm-text-muted);text-transform:uppercase;letter-spacing:.5px">${label}</div>
        <div style="font-size:20px;font-weight:bold;color:${color||'var(--ocm-text)'}">${value}</div>
        <div style="font-size:10px;color:var(--ocm-text-muted)">${sub}</div></div>`;

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

  /**
   * Parse the faction Utilities armory into the stock map and the loan list.
   *
   * Shape (v2, selections=utilities):
   *   { utilities: [ { ID, name, type, quantity, available, loaned, loaned_to } ] }
   *   · available  — how many are sitting in the armory, free to hand out
   *   · loaned_to  — comma-separated user IDs currently holding one
   *   · type       — "Tool" (reusable) | "Material" (consumed) | "Enhancer"
   *
   * Torn lists one entry per stock line, so the same item can appear multiple
   * times — once for the free stock and once per loan — which is exactly what the
   * armory page shows ("Lockpicks x49 Available" and "Lockpicks x1 → Tunabox").
   * Both are summed/collected here.
   *
   * @returns {{armory: Object.<string, number>, loanedOut: Array}}
   */
  function parseUtilities(utilData) {
    const armory = {};
    const loanedOut = [];
    const raw = utilData?.utilities ?? utilData?.utility ?? [];
    const list = Array.isArray(raw) ? raw : Object.values(raw || {});
    for (const it of list) {
      if (!it || typeof it !== 'object') continue;
      const id = String(it.ID ?? it.id ?? it.item_id ?? '');
      if (!id) continue;
      // Stock = what's free to give. Items out on loan are still faction property
      // but you can't hand them to someone else, so they don't count as stock.
      const avail = Number(it.available ?? 0) || 0;
      armory[id] = (armory[id] || 0) + avail;

      // Loans. loaned_to is documented as "comma-separated ids" and can arrive as a
      // number (single holder) or a string ("123,456"). Empty/0 means nobody.
      const lt = it.loaned_to;
      if (lt !== null && lt !== undefined && lt !== '' && lt !== 0) {
        const uids = String(lt).split(',').map(s => s.trim()).filter(s => s && s !== '0');
        for (const uid of uids) {
          loanedOut.push({
            itemId: id,
            itemName: it.name || null,
            uid: String(uid),
            holderName: null,          // resolved from the roster by resolveMemberName
            isTool: String(it.type || '').toLowerCase() === 'tool',
          });
        }
      }
    }
    return { armory, loanedOut };
  }

  /** Fetch all data required for leader (faction) mode. */
  async function fetchAll(apiKey) {
    // Incremental payout-log fetch: only ask for gives newer than the last one
    // we've stored (first run pulls the most recent 100 — history builds forward).
    const newsCursor = Number(GM_getValue(GMK.PAYOUT_NEWS_CURSOR, 0)) || 0;
    const giveFundsPath = '/faction/news?cat=giveFunds&striptags=false&limit=100&sort=DESC'
      + (newsCursor > 0 ? `&from=${newsCursor}` : '');
    const [faction, members, utilData, me, giveNews] = await Promise.all([
      apiFetch('/faction?selections=crimes,basic', apiKey),
      apiFetch('/faction?selections=members', apiKey),
      // THE armory call for OC purposes. There is no "armory" selection in v2 —
      // that request returned nothing, which is why every item read "Held: 0" and
      // was reported as a gap. OC items (Enhancers / Tools / Materials) live in the
      // Utilities armory, and this one call gives BOTH the stock and the loans:
      //   { utilities: [{ ID, name, type, quantity, available, loaned, loaned_to }] }
      // loaned_to is a comma-separated list of the user IDs currently holding it.
      // (The old 'temporary' call was the wrong armory entirely — that's grenades
      // and flashbangs, not OC item loans.)
      apiFetch('/faction?selections=utilities', apiKey).catch(() => ({})),
      apiFetch('/user?selections=basic', apiKey).catch(() => ({})),
      // Faction funds log ("X gave $Y to Z") — legacy payout fallback only.
      apiFetch(giveFundsPath, apiKey).catch(err => ({ __err: String((err && err.message) || err) })),
    ]);

    // Merge new give-events into the persistent payout-event store and record
    // whether the log is readable with this key (shown as a hint if not).
    syncPayoutEvents(giveNews);
    GM_setValue(GMK.PAYOUT_NEWS_STATUS, giveNews && giveNews.__err ? giveNews.__err : 'ok');

    // Viewer's own player ID — used by the "best open slot" advisory to look up
    // YOUR predicted CPR for each open role (an empty slot has no CPR of its own).
    const viewerId = me?.player_id ? String(me.player_id) : (me?.profile?.id ? String(me.profile.id) : null);
    if (viewerId) GM_setValue(GMK.MY_PLAYER_ID, viewerId);

    // Parse the Utilities armory once into the two things we need:
    //   armory[itemId]  = how many are on hand and free to give (NOT already loaned)
    //   loanedOut[]     = every {itemId, itemName, uid} pair currently on loan
    // Torn returns one entry per stock line, so an item can appear several times:
    // once "available" and once per loan. loaned_to is comma-separated user IDs.
    const { armory, loanedOut } = parseUtilities(utilData);

    // Collect item IDs referenced in active OC slots so we can resolve their names
    const itemIds = new Set();
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
            if (id) itemIds.add(String(id));
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

    return { faction, members: members.members || {}, armory, itemNames, itemValues, lastOc, exMemberNames, viewerId, loanedOut };
  }

  // ─── BUILD UI ────────────────────────────────────────────────────────────────

  // ─── UI KIT (new UI, v3.37) — modular component vocabulary ───────────────────
  // Design goal: every view speaks ONE language so adding a tab, or merging another
  // script's view, is easy. To add a tab: add an OCM_NAV entry + a matching
  // #ocm-pane-<id> in buildRoot's template + a renderer. Build ALL new content from
  // OCUI.* so a future restyle changes markup in one place, not across every tab.
  const OCM_NAV = [
    { tab: 'home',        icon: '🏠', label: 'Dashboard' },
    { tab: 'crimes',      icon: '🎯', label: 'Crimes',      countId: 'ocm-tab-count-crimes' },
    { tab: 'people',      icon: '👥', label: 'People',      countId: 'ocm-tab-count-people' },
    { tab: 'consumables', icon: '🧪', label: 'Consumables' },
    { tab: 'war',         icon: '⚔️', label: 'War' },
    { tab: 'armoury',     icon: '🛡️', label: 'Armoury' },
  ];
  function buildRailNav() {
    return OCM_NAV.map((v, i) =>
      `<div class="ocm-tab ocm-nav${i === 0 ? ' active' : ''}" data-tab="${v.tab}" role="tab" tabindex="0"` +
      `><span class="ocm-nav-i">${v.icon}</span><span class="ocm-nav-l">${v.label}</span>` +
      `${v.countId ? `<span class="ocm-tab-count" id="${v.countId}"></span>` : ''}</div>`
    ).join('');
  }
  // OCUI — reusable renderers returning HTML strings. One place for markup.
  const OCUI = {
    esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); },
    card({ title = '', right = '', body = '', span = 0, id = '' } = {}) {
      return `<div class="ocm-card"${span ? ` style="grid-column:span ${span}"` : ''}${id ? ` id="${id}"` : ''}>` +
        `${title ? `<div class="ocm-card-h">${OCUI.esc(title)}${right ? `<span class="ocm-card-r">${right}</span>` : ''}</div>` : ''}` +
        `<div class="ocm-card-b">${body}</div></div>`;
    },
    statTile({ value = '', label = '', tone = 'neutral', sub = '' } = {}) {
      return `<div class="ocm-tile ocm-tile-${tone}"><div class="ocm-tile-v">${OCUI.esc(value)}</div>` +
        `<div class="ocm-tile-l">${OCUI.esc(label)}</div>${sub ? `<div class="ocm-tile-s">${OCUI.esc(sub)}</div>` : ''}</div>`;
    },
    chip(text, tone = 'neutral') { return `<span class="ocm-kchip ocm-kchip-${tone}">${OCUI.esc(text)}</span>`; },
    prov(kind) { return `<span class="ocm-prov ocm-prov-${kind}">${OCUI.esc(kind)}</span>`; },
    grid(inner, cols = 0) { return `<div class="ocm-kgrid"${cols ? ` style="--kcols:${cols}"` : ''}>${inner}</div>`; },
  };

  /** Construct the dashboard root element. Returns an unattached DOM node. */
  function buildRoot() {
    const root = document.createElement('div');
    root.id = 'ocm-root';
    root.className = 'ocm-ui2';
    root.innerHTML = `
      <aside id="ocm-rail">
        <div id="ocm-rail-brand">
          <span class="ocm-rb-mark">🧊</span>
          <span class="ocm-rb-txt"><b>OC Suite</b><small>v${SCRIPT_VERSION}</small></span>
        </div>
        <nav id="ocm-tabs" class="ocm-rail-nav" role="tablist">${buildRailNav()}</nav>
        <div class="ocm-rail-sp"></div>
        <div id="ocm-rail-foot">
          <button id="ocm-legend-btn" title="What do CPR, weight and the icons mean?">? Legend</button>
          <button id="ocm-config-toggle" title="Settings">⚙ Config</button>
        </div>
      </aside>
      <div id="ocm-main">
        <header id="ocm-topbar">
          <div id="ocm-topbar-title"><h2>⚔ OC Suite</h2><small id="ocm-last-update">Not loaded</small></div>
          <span class="ocm-hdr-gap"></span>
          <button id="ocm-refresh-btn" title="Refresh data">↻ Refresh</button>
        </header>
      <div id="ocm-scroll">
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
          <div class="ocm-cfg-label">CPR Thresholds</div>
          <div class="ocm-cfg-row">
            <label>Warn below <input id="ocm-cfg-cpr-warn" type="number" min="0" max="100" value="${CPR_WARN}" class="ocm-cfg-num" />%</label>
            <label>Crit below <input id="ocm-cfg-cpr-crit" type="number" min="0" max="100" value="${CPR_CRIT}" class="ocm-cfg-num" />%</label>
          </div>
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

        <!-- Dashboard / Consumables / War / Armoury — Phase 2 stubs; filled in later phases -->
        <div class="ocm-tab-pane" id="ocm-pane-home">
          <div class="ocm-card" style="text-align:center;padding:44px 20px">
            <div style="font-size:36px;filter:drop-shadow(0 0 10px var(--ocm-glow))">🏠</div>
            <h3 style="margin:10px 0 4px">Dashboard</h3>
            <div style="color:var(--ocm-text-dim);max-width:470px;margin:0 auto">Faction overview — summary cards, "needs you now", and at-a-glance OC &amp; member breakdowns. Coming next.</div>
          </div>
        </div>
        <div class="ocm-tab-pane" id="ocm-pane-consumables">
          <div class="ocm-card" style="text-align:center;padding:44px 20px">
            <div style="font-size:36px">🧪</div>
            <h3 style="margin:10px 0 4px">Consumables</h3>
            <div style="color:var(--ocm-text-dim);max-width:470px;margin:0 auto">Per-member faction item usage + most-used overall. To be powered by the Frostbite usage tracker.</div>
          </div>
        </div>
        <div class="ocm-tab-pane" id="ocm-pane-war">
          <div class="ocm-card" style="text-align:center;padding:44px 20px">
            <div style="font-size:36px">⚔️</div>
            <h3 style="margin:10px 0 4px">War</h3>
            <div style="color:var(--ocm-text-dim);max-width:470px;margin:0 auto">Payout breakdown, drug analyzer &amp; multi-war sweep — the War Payout Report is being ported in behind this tab.</div>
          </div>
        </div>
        <div class="ocm-tab-pane" id="ocm-pane-armoury">
          <div class="ocm-card" style="text-align:center;padding:44px 20px">
            <div style="font-size:36px">🛡️</div>
            <h3 style="margin:10px 0 4px">Armoury</h3>
            <div style="color:var(--ocm-text-dim);max-width:470px;margin:0 auto">OC item stock vs requirements, and current loans. Coming soon.</div>
          </div>
        </div>

        <!-- ═══ CRIMES — running the OCs (the main job) ═══ -->
        <div class="ocm-tab-pane active" id="ocm-pane-crimes">
          <div class="ocm-subtabs" role="tablist">
            <div class="ocm-subtab active" data-sub="fill"   role="tab">🎯 Fill Slots <span class="ocm-subtab-badge" id="ocm-sb-fill">0</span></div>
            <div class="ocm-subtab"        data-sub="active" role="tab">📋 Active OCs <span class="ocm-subtab-badge" id="ocm-sb-active">0</span></div>
            <div class="ocm-subtab"        data-sub="history" role="tab">📊 History</div>
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
            <div class="ocm-subtab"        data-sub="loans"    role="tab">🤝 Loans <span class="ocm-subtab-badge" id="ocm-sb-loans">0</span></div>
            <div class="ocm-subtab"        data-sub="memitems" role="tab">🎒 Item Status <span class="ocm-subtab-badge" id="ocm-sb-memitems">0</span></div>
            <div class="ocm-subtab"        data-sub="blocked"  role="tab">🚫 Blocked <span class="ocm-subtab-badge" id="ocm-sb-blocked">0</span></div>
            <div class="ocm-subtab"        data-sub="optimize" role="tab">⚡ Optimize <span class="ocm-subtab-badge" id="ocm-sb-optimize">0</span></div>
            <div class="ocm-subtab"        data-sub="cpr"      role="tab">📈 CPR Data</div>
          </div>
          <div class="ocm-subpane active" id="ocm-sub-assign">
            <div id="ocm-people-assign"></div>
          </div>
          <div class="ocm-subpane" id="ocm-sub-loans">
            <div id="ocm-people-loans"></div>
          </div>
          <div class="ocm-subpane" id="ocm-sub-memitems">
            <div id="ocm-people-items"></div>
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
            <div class="ocm-subtab active" data-sub="summary" role="tab">📊 Summary</div>
            <div class="ocm-subtab"        data-sub="members" role="tab">👤 Member Earnings</div>
            <div class="ocm-subtab"        data-sub="faction" role="tab">🏦 Faction Earnings</div>
            <div class="ocm-subtab"        data-sub="payouts" role="tab">💸 Payouts <span class="ocm-subtab-badge" id="ocm-sb-payouts">0</span></div>
            <div class="ocm-subtab"        data-sub="ocsran"  role="tab">📋 OCs Ran</div>
            <div class="ocm-subtab"        data-sub="costs"   role="tab">📦 Costs <span class="ocm-subtab-badge" id="ocm-sb-costs">0</span></div>
            <div class="ocm-subtab"        data-sub="exports" role="tab">⬇ Exports</div>
          </div>
          <div id="ocm-money-controls"></div>
          <div class="ocm-subpane active" id="ocm-sub-summary"><div id="ocm-money-summary"></div></div>
          <div class="ocm-subpane" id="ocm-sub-payouts"><div id="ocm-money-payouts"></div></div>
          <div class="ocm-subpane" id="ocm-sub-ocsran"><div id="ocm-money-ocs"></div></div>
          <div class="ocm-subpane" id="ocm-sub-members"><div id="ocm-money-members"></div></div>
          <div class="ocm-subpane" id="ocm-sub-faction"><div id="ocm-money-faction"></div></div>
          <div class="ocm-subpane" id="ocm-sub-costs"><div id="ocm-money-costs"></div></div>
          <div class="ocm-subpane" id="ocm-sub-exports"><div id="ocm-downloads"></div></div>
        </div>

        <div id="ocm-footer"></div>
      </div>
      </div>
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
    document.getElementById('ocm-stats-bar').style.display = 'flex';
    document.getElementById('ocm-body').style.display       = 'block';

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
    renderReferenceSection(ctx);

    updateTabCounts();
    startCountdowns();
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

    const kpis = `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">`
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

  function renderReferenceSection(ctx) {
    const { faction, memberMap, armory, itemNames, lastOc, exMemberNames, itemValues, viewerId, loanedOut, crimes, mInfo, memberById, assignedIds, readyOcs, planningOcs, recruitingOcs, blockedOcs, crimeDiffMap, ACTIVE, freeMembers, freeRecruits, recruitingByDiff, anyBelowMin, sortedDiffs, activeOcCount, now, stuckOcs, itemName, fmtRelative, fmtOcRelative, scoreSlotForMember, buildBestSlotAssignment, getBestSlotForMember, renderMembersTable } = ctx;
    // ── Analytics section
    const analyticsEl    = document.getElementById('ocm-analytics');
    const analyticsTitle = document.getElementById('ocm-title-analytics');

    /** Normalise OC status to 'successful' | 'failure' | 'expired' | null */
    function normStatus(raw) {
      const s = (raw || '').toLowerCase().trim();
      if (s === 'successful' || s === 'success') return 'successful';
      if (s === 'failure'    || s === 'failed'  || s === 'fail') return 'failure';
      if (s === 'expired'    || s === 'expire')  return 'expired';
      return null;
    }

    /**
     * Normalise OC name for grouping — strip diacritics, version suffixes (V1/V2),
     * and lowercase. Used as the key for scenarioStats and heatmap data.
     */
    function normOcName(raw) {
      return (raw || 'Unknown')
        .trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+[Vv]\d+$/, '')
        .trim();
    }

    const completed = Object.values(crimes).filter(oc => oc && normStatus(oc.status) !== null);
    const successes = completed.filter(oc => normStatus(oc.status) === 'successful');
    const failures  = completed.filter(oc => normStatus(oc.status) === 'failure');
    const expired   = completed.filter(oc => normStatus(oc.status) === 'expired');
    const total     = completed.length;

    if (analyticsTitle) analyticsTitle.textContent = `📊 Analytics — ${total} completed OCs`;

    // Per-scenario stats — keyed by normOcName()
    const scenarioStats = {};
    for (const oc of completed) {
      const key = normOcName(oc.name);
      if (!scenarioStats[key]) scenarioStats[key] = { success: 0, failure: 0, expired: 0, total: 0 };
      const s = normStatus(oc.status);
      scenarioStats[key].total++;
      if (s === 'successful') scenarioStats[key].success++;
      else if (s === 'failure') scenarioStats[key].failure++;
      else scenarioStats[key].expired++;
    }

    // Per-member stats
    const memberStats = {};
    for (const oc of completed) {
      const s = normStatus(oc.status);
      const ocSlots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
      for (const slot of ocSlots) {
        const uid = slot.user?.id ? String(slot.user.id) : null;
        if (!uid) continue;
        if (!memberStats[uid]) {
          const name = mInfo[uid]?.name || exMemberNames[uid] || `#${uid}`;
          const isEx = !mInfo[uid];
          memberStats[uid] = { name, isEx, participated: 0, success: 0, failure: 0, cprSum: 0, cprCount: 0 };
        }
        memberStats[uid].participated++;
        if (s === 'successful') memberStats[uid].success++;
        else if (s === 'failure') memberStats[uid].failure++;
        const cpr = slot.checkpoint_pass_rate ?? null;
        if (cpr != null) { memberStats[uid].cprSum += cpr; memberStats[uid].cprCount++; }
      }
    }

    const memberRows = Object.entries(memberStats)
      .map(([uid, s]) => ({ uid, ...s, avgCpr: s.cprCount > 0 ? s.cprSum / s.cprCount : null, rate: (s.success + s.failure) > 0 ? s.success / (s.success + s.failure) : 0 }))
      .sort((a, b) => b.participated - a.participated);

    const scenarioRows = Object.entries(scenarioStats)
      .map(([name, s]) => ({ name, ...s, rate: (s.success + s.failure) > 0 ? s.success / (s.success + s.failure) : 0 }))
      .sort((a, b) => b.total - a.total);

    function rateCls(r) { return r >= 0.85 ? 'ocm-rate-high' : r >= 0.65 ? 'ocm-rate-mid' : 'ocm-rate-low'; }
    function pct(r)     { return `${Math.round(r * 100)}%`; }

    const overallRate = (successes.length + failures.length) > 0 ? successes.length / (successes.length + failures.length) : 0;

    // --- Last 5 completed OCs (sorted most-recent first)
    const last5 = [...completed]
      .sort((a, b) => (b.executed_at || 0) - (a.executed_at || 0))
      .slice(0, 5);

    const last5Html = last5.map((oc, idx) => {
      const s        = normStatus(oc.status);
      const icon     = s === 'successful' ? '✅' : '❌';
      const col      = s === 'successful' ? 'var(--ocm-cpr-good)' : 'var(--ocm-cpr-crit)';
      const ocSlots  = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
      const filled   = ocSlots.filter(sl => sl.user?.id);
      const avgCpr   = filled.length > 0
        ? (filled.reduce((a, sl) => a + (sl.checkpoint_pass_rate ?? 0), 0) / filled.length).toFixed(1)
        : null;
      const execDate = oc.executed_at
        ? new Date(oc.executed_at * 1000).toLocaleDateString('en-GB', { timeZone:'UTC', day:'2-digit', month:'short', year:'2-digit' })
        : '–';
      const rewards    = oc.rewards;
      const money      = rewards?.money ?? null;
      const respect    = rewards?.respect ?? null;
      const paid       = rewards?.paid ?? rewards?.is_paid ?? null;
      const paidBadge  = paid === true
        ? `<span style="font-size:9px;background:#14201a;color:var(--ocm-cpr-good);border-radius:3px;padding:1px 4px;margin-left:4px">Paid ✓</span>`
        : paid === false
          ? `<span style="font-size:9px;background:#1c1410;color:var(--ocm-cpr-crit);border-radius:3px;padding:1px 4px;margin-left:4px">Unpaid</span>`
          : '';
      const rewardParts = [];
      if (money && Number(money) > 0) rewardParts.push(`💰 $${Number(money).toLocaleString()}`);
      if (respect && Number(respect) > 0) rewardParts.push(`⭐ ${respect} resp`);

      // Per-member detail rows for the expandable section
      const memberDetailRows = filled.map(sl => {
        const uid  = String(sl.user.id);
        const name = mInfo[uid]?.name || exMemberNames[uid] || `#${uid}`;
        const role = sl.position_info?.label || sl.position || '?';
        const cpr  = sl.checkpoint_pass_rate ?? null;
        const w    = getWeight(oc.name || '', role);
        const cprCol = cpr == null ? '#555' : cpr >= CPR_WARN ? 'var(--ocm-cpr-good)' : cpr >= CPR_CRIT ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-crit)';
        const wCol   = w   == null ? '#555' : w >= WEIGHT_HIGH ? 'var(--ocm-cpr-warn)' : w >= WEIGHT_MID ? '#aaa' : '#555';
        return `<tr>
          <td><a href="/profiles.php?XID=${uid}" target="_blank" style="color:var(--ocm-text-card);text-decoration:none">${esc(name)}</a></td>
          <td style="color:var(--ocm-text-muted);text-align:right">${role}</td>
          <td style="text-align:right;font-weight:bold;color:${cprCol}">${cpr != null ? cpr+'%' : '–'}</td>
          <td style="text-align:right;font-weight:bold;color:${wCol}">${w != null ? w.toFixed(0)+'%' : '–'}</td>
        </tr>`;
      }).join('');

      return `
        <div class="ocm-last5-row-header" data-idx="${idx}" style="border-left:3px solid ${col}">
          <span style="color:${col};font-size:13px">${icon}</span>
          <span style="font-weight:bold;color:var(--ocm-text);flex:1">${oc.name || 'Unknown'}</span>
          <span style="color:var(--ocm-text-muted);font-size:10px">D${oc.difficulty ?? '?'}</span>
          <span style="color:var(--ocm-text-muted);font-size:10px">${execDate}</span>
          ${avgCpr ? `<span style="font-size:10px;color:var(--ocm-text-dim)">CPR: <strong class="${cprClass(Number(avgCpr))}">${avgCpr}%</strong></span>` : ''}
          ${paidBadge}
          ${rewardParts.length ? `<span style="font-size:10px;color:var(--ocm-text-dim)">${rewardParts.join(' ')}</span>` : ''}
          <span style="color:var(--ocm-text-faint);font-size:10px">▼</span>
        </div>
        <div class="ocm-last5-detail" id="ocm-last5-detail-${idx}">
          <table>
            <thead><tr style="font-size:9px;color:var(--ocm-text-faint)"><th>Member</th><th style="text-align:right">Role</th><th style="text-align:right">CPR</th><th style="text-align:right">Wt</th></tr></thead>
            <tbody>${memberDetailRows || '<tr><td colspan="4" style="color:var(--ocm-text-faint);font-style:italic">No member data</td></tr>'}</tbody>
          </table>
        </div>`;
    }).join('');

    analyticsEl.innerHTML = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;align-items:stretch">
        <div style="background:var(--ocm-bg-card);border:1px solid var(--ocm-border-soft);border-radius:6px;padding:8px 14px;text-align:center;min-width:90px">
          <div style="font-size:9px;color:var(--ocm-text-muted);text-transform:uppercase;letter-spacing:.5px">Success Rate</div>
          <div style="font-size:22px;font-weight:bold" class="${rateCls(overallRate)}">${pct(overallRate)}</div>
          <div style="font-size:10px;color:var(--ocm-text-faint)">${successes.length}S / ${failures.length}F / ${expired.length}E</div>
        </div>
        <div style="background:var(--ocm-bg-card);border:1px solid var(--ocm-border-soft);border-radius:6px;padding:8px 14px;text-align:center;min-width:80px">
          <div style="font-size:9px;color:var(--ocm-text-muted);text-transform:uppercase;letter-spacing:.5px">OCs Analysed</div>
          <div style="font-size:22px;font-weight:bold;color:var(--ocm-link)">${total}</div>
          <div style="font-size:10px;color:var(--ocm-text-faint)">of 100 cap</div>
        </div>
      </div>

      <div id="ocm-last5-wrap">
        <button id="ocm-last5-toggle">📋 Last 5 Completed OCs ▼</button>
        <div id="ocm-last5-body">
          ${last5.length === 0
            ? '<div style="color:var(--ocm-text-faint);font-size:11px;padding:6px">No completed OCs found.</div>'
            : last5Html}
        </div>
      </div>

      <div class="ocm-analytics-grid">
        <div class="ocm-analytics-card">
          <h4>By Scenario</h4>
          <table class="ocm-analytics-table">
            <thead><tr><th>OC</th><th class="td-right">Ran</th><th class="td-right">Success%</th><th class="td-right ocm-sfe-col">S/F/E</th></tr></thead>
            <tbody>${scenarioRows.map(r => {
              const activeRate = (r.success + r.failure) > 0 ? r.success / (r.success + r.failure) : 0;
              return `<tr>
                <td title="${esc(r.name)}">${esc(r.name)}</td>
                <td class="td-right">${r.total}</td>
                <td class="td-right ${rateCls(activeRate)}">${pct(activeRate)}</td>
                <td class="td-right ocm-sfe-col" style="font-size:10px">
                  <span class="ocm-stat-pill pill-success">${r.success}</span>
                  <span class="ocm-stat-pill pill-failure">${r.failure}</span>
                  <span class="ocm-stat-pill pill-expired">${r.expired}</span>
                </td>
              </tr>`;}).join('')}
            </tbody>
          </table>
        </div>
        <div class="ocm-analytics-card">
          <h4>By Member</h4>
          <table class="ocm-analytics-table">
            <thead><tr><th>Member</th><th class="td-right">OCs</th><th class="td-right">Success%</th><th class="td-right">Avg CPR</th></tr></thead>
            <tbody>${memberRows.map(r => `
              <tr${r.isEx ? ' style="opacity:.5"' : ''}>
                <td><a href="/profiles.php?XID=${r.uid}" target="_blank" style="color:${r.isEx?'#888':'#ccc'};text-decoration:none">${esc(r.name)}</a>${r.isEx?'<span style="font-size:9px;color:var(--ocm-text-faint);margin-left:3px">(left)</span>':''}</td>
                <td class="td-right">${r.participated}</td>
                <td class="td-right ${rateCls(r.rate)}">${pct(r.rate)}</td>
                <td class="td-right ${r.avgCpr != null ? cprClass(r.avgCpr) : ''}">${r.avgCpr != null ? r.avgCpr.toFixed(1)+'%' : '–'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="ocm-analytics-card" style="grid-column:1/-1">
          <h4>Success Rate Over Time <button class="ocm-chart-toggle" data-target="ocm-chart-timeline">Show Chart</button></h4>
          <div id="ocm-chart-timeline" class="ocm-chart-wrap"></div>
        </div>
        <div class="ocm-analytics-card" style="grid-column:1/-1">
          <h4>Success Rate by Scenario <button class="ocm-chart-toggle" data-target="ocm-chart-scenario">Show Chart</button></h4>
          <div id="ocm-chart-scenario" class="ocm-chart-wrap"></div>
        </div>
        <div class="ocm-analytics-card" style="grid-column:1/-1">
          <h4>CPR Distribution <button class="ocm-chart-toggle" data-target="ocm-chart-cpr">Show Chart</button></h4>
          <div id="ocm-chart-cpr" class="ocm-chart-wrap"></div>
        </div>
        <div class="ocm-analytics-card" style="grid-column:1/-1">
          <h4>Member Participation &amp; Success Rate <button class="ocm-chart-toggle" data-target="ocm-chart-members">Show Chart</button></h4>
          <div id="ocm-chart-members" class="ocm-chart-wrap"></div>
        </div>
        <div class="ocm-analytics-card" style="grid-column:1/-1">
          <h4>Member × Scenario Heatmap <button class="ocm-chart-toggle" data-target="ocm-heatmap">Show Chart</button></h4>
          <div id="ocm-heatmap" class="ocm-chart-wrap" style="overflow-x:auto"></div>
        </div>
      </div>

      <div id="ocm-member-history-wrap">
        <h4>👤 Member OC History</h4>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
          <button id="ocm-mh-cache-btn" title="Pull every member's current CPR from TornStats and fill any gaps in the history archive (won't overwrite real OC runs)." style="background:#1c1810;border:1px solid #3a3018;border-radius:4px;color:#bf9f5a;padding:5px 11px;font-size:11px;cursor:pointer;font-weight:bold">⬇ Cache Old CPRs (TornStats)</button>
          <span id="ocm-mh-cache-status" style="font-size:10px;color:var(--ocm-text-muted)"></span>
        </div>
        <div id="ocm-mh-search-wrap">
          <input id="ocm-mh-search" type="text" placeholder="Search member name…" autocomplete="off" />
          <div id="ocm-mh-dropdown"></div>
          <button id="ocm-mh-clear">✕ Clear</button>
        </div>
        <div id="ocm-mh-summary" style="display:none"></div>
        <div id="ocm-mh-table-wrap">
          <div id="ocm-mh-empty">Type a member name above to view their OC history.</div>
        </div>
      </div>

      <div id="ocm-oc-history-wrap">
        <h4>🗂 OC Scenario History</h4>
        <div id="ocm-oh-search-wrap">
          <input id="ocm-oh-search" type="text" placeholder="Search OC name… (e.g. Sneaky Git Grab)" autocomplete="off" />
          <div id="ocm-oh-dropdown"></div>
          <button id="ocm-oh-clear">✕ Clear</button>
        </div>
        <div id="ocm-oh-summary" style="display:none"></div>
        <div id="ocm-oh-table-wrap">
          <div id="ocm-oh-empty">Type an OC name above to view all runs of that scenario.</div>
        </div>
      </div>`;

    // Wire Last 5 expand/collapse toggle
    document.getElementById('ocm-last5-toggle').addEventListener('click', () => {
      const body = document.getElementById('ocm-last5-body');
      const btn  = document.getElementById('ocm-last5-toggle');
      const open = body.style.display === 'block';
      body.style.display = open ? 'none' : 'block';
      btn.textContent = `📋 Last 5 Completed OCs ${open ? '▼' : '▲'}`;
    });

    // Wire per-row expand/collapse in the Last 5 table
    analyticsEl.querySelectorAll('.ocm-last5-row-header').forEach(header => {
      header.addEventListener('click', () => {
        const idx    = header.dataset.idx;
        const detail = document.getElementById(`ocm-last5-detail-${idx}`);
        if (!detail) return;
        const isOpen = detail.style.display === 'block';
        detail.style.display = isOpen ? 'none' : 'block';
        const arrow = header.querySelector('span:last-child');
        if (arrow) arrow.textContent = isOpen ? '▼' : '▲';
      });
    });

    // ── Member OC History — search and render logic

    /**
     * Build a per-member history index from the completed OC list.
     * Each entry: { ocName, difficulty, role, weight, cpr, outcome, executedAt, respect }
     * Sorted newest-first within each member's array.
     */
    const memberHistoryIndex = {};
    for (const oc of completed) {
      const s       = normStatus(oc.status);
      const ocSlots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
      // Total respect from the OC rewards object (shared pot — not split per member)
      const respect = oc.rewards?.respect ?? null;
      for (const slot of ocSlots) {
        const uid = slot.user?.id ? String(slot.user.id) : null;
        if (!uid) continue;
        const name = mInfo[uid]?.name || exMemberNames[uid] || `#${uid}`;
        if (!memberHistoryIndex[uid]) memberHistoryIndex[uid] = { name, entries: [] };
        const role   = slot.position_info?.label || slot.position || '?';
        const weight = getWeight(oc.name || '', role);
        memberHistoryIndex[uid].entries.push({
          ocName:     oc.name || 'Unknown',
          difficulty: oc.difficulty ?? '?',
          role,
          weight,
          cpr:        slot.checkpoint_pass_rate ?? null,
          outcome:    s,
          executedAt: oc.executed_at ?? null,
          respect,
        });
      }
    }
    // Sort each member's entries newest-first
    for (const uid of Object.keys(memberHistoryIndex)) {
      memberHistoryIndex[uid].entries.sort((a, b) => (b.executedAt || 0) - (a.executedAt || 0));
    }

    // ── Persistent CPR archive ──────────────────────────────────────────────
    // Record this window's OCs into the archive (keeps newest per member+OC+role),
    // then merge in any archived OC+role combos NOT present in the current window,
    // so a member's history covers every scenario they've run — not just the last
    // ~100 OCs. Archived-only rows are flagged so the UI can mark them.
    const cprArchive = recordCprHistory(crimes, mInfo, exMemberNames, getWeight, normStatus);
    for (const [uid, rec] of Object.entries(cprArchive)) {
      if (!rec || !rec.slots) continue;
      // Which OC+role combos does the live window already have for this member?
      const liveKeys = new Set(
        (memberHistoryIndex[uid]?.entries || []).map(e => `${e.ocName.toLowerCase()}|${e.role.toLowerCase()}`)
      );
      for (const [key, a] of Object.entries(rec.slots)) {
        if (liveKeys.has(key)) continue; // live window has a fresher copy already
        if (!memberHistoryIndex[uid]) {
          memberHistoryIndex[uid] = { name: rec.name || `#${uid}`, entries: [] };
        }
        memberHistoryIndex[uid].entries.push({
          ocName:     a.ocName,
          difficulty: a.difficulty,
          role:       a.role,
          weight:     a.weight,
          cpr:        a.cpr,
          outcome:    a.outcome,
          executedAt: a.executedAt,
          respect:    a.respect,
          archived:   true,           // came from the persistent archive, not the live window
          tsSourced:  a.source === 'ts', // TornStats backfill (no run date/outcome)
        });
      }
      // Re-sort after merge
      if (memberHistoryIndex[uid]) {
        memberHistoryIndex[uid].entries.sort((b1, b2) => (b2.executedAt || 0) - (b1.executedAt || 0));
      }
    }

    // Build sorted list of all member names for autocomplete
    const mhAllMembers = Object.values(memberHistoryIndex)
      .map(m => ({ uid: Object.keys(memberHistoryIndex).find(k => memberHistoryIndex[k] === m), name: m.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    /** Render the history table and summary stats for a given uid. */
    function renderMemberHistory(uid) {
      const record    = memberHistoryIndex[uid];
      const summaryEl = document.getElementById('ocm-mh-summary');
      const tableWrap = document.getElementById('ocm-mh-table-wrap');
      if (!record || record.entries.length === 0) {
        summaryEl.style.display = 'none';
        tableWrap.innerHTML = `<div id="ocm-mh-empty">No completed OC history found for this member yet (live window + saved archive).</div>`;
        return;
      }

      const entries   = record.entries;
      const total     = entries.length;
      const successes = entries.filter(e => e.outcome === 'successful').length;
      const rate      = total > 0 ? Math.round(successes / total * 100) : 0;
      const cprs      = entries.filter(e => e.cpr != null).map(e => e.cpr);
      const avgCpr    = cprs.length > 0 ? (cprs.reduce((a, b) => a + b, 0) / cprs.length).toFixed(1) : null;

      // Most-played role
      const roleCounts = {};
      for (const e of entries) roleCounts[e.role] = (roleCounts[e.role] || 0) + 1;
      const topRole = Object.entries(roleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

      const rateCol = rate >= 85 ? 'var(--ocm-cpr-good)' : rate >= 65 ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-crit)';

      // Summary bar
      summaryEl.style.display = 'flex';
      summaryEl.innerHTML = `
        <div class="ocm-mh-sum-item">
          <span class="ocm-mh-sum-label">OCs</span>
          <span class="ocm-mh-sum-value">${total}</span>
        </div>
        <div class="ocm-mh-sum-item">
          <span class="ocm-mh-sum-label">Success Rate</span>
          <span class="ocm-mh-sum-value" style="color:${rateCol}">${rate}%</span>
        </div>
        <div class="ocm-mh-sum-item">
          <span class="ocm-mh-sum-label">Avg CPR</span>
          <span class="ocm-mh-sum-value ${avgCpr != null ? cprClass(Number(avgCpr)) : ''}">${avgCpr != null ? avgCpr + '%' : '—'}</span>
        </div>
        <div class="ocm-mh-sum-item">
          <span class="ocm-mh-sum-label">Most Played Role</span>
          <span class="ocm-mh-sum-value" style="font-size:11px;padding-top:2px">${topRole}</span>
        </div>`;

      // History table
      const rows = entries.map(e => {
        const dateStr   = e.executedAt
          ? new Date(e.executedAt * 1000).toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', year: '2-digit' })
          : '—';
        const cprStr    = e.cpr != null ? `${e.cpr}%` : '—';
        const cprCls    = e.cpr != null ? cprClass(e.cpr) : '';
        const wStr      = e.weight != null ? `${e.weight.toFixed(0)}%` : '—';
        const wCls      = e.weight != null ? (e.weight >= WEIGHT_HIGH ? 'w-high' : e.weight >= WEIGHT_MID ? 'w-mid' : 'w-low') : '';
        // Respect — only shown on successful OCs; dim/dash on failure or expired
        const respStr   = (e.outcome === 'successful' && e.respect != null) ? `${e.respect}` : '—';
        const respStyle = (e.outcome === 'successful' && e.respect != null) ? '' : 'color:var(--ocm-text-faint)';
        // TornStats-sourced rows have no run outcome — show "TS" instead of a result icon.
        let outIcon, outCls, outText;
        if (e.tsSourced) {
          outIcon = '📈'; outCls = ''; outText = 'TornStats';
        } else {
          outIcon = e.outcome === 'successful' ? '✅' : e.outcome === 'failure' ? '❌' : '⏰';
          outCls  = e.outcome === 'successful' ? 'ocm-mh-outcome-success' : e.outcome === 'failure' ? 'ocm-mh-outcome-failure' : 'ocm-mh-outcome-expired';
          outText = e.outcome === 'successful' ? 'Success' : e.outcome === 'failure' ? 'Failure' : 'Expired';
        }
        // Archived rows get a subtle marker; TS-sourced get a distinct one.
        const archMark  = e.tsSourced
          ? ' <span title="From TornStats — current CPR, not a dated run" style="color:#bf9f5a;font-size:9px">★</span>'
          : e.archived ? ' <span title="From saved archive — outside the current 100-OC API window" style="color:#7a9acc;font-size:9px">⧗</span>' : '';
        return `<tr${e.archived ? ' style="opacity:.82"' : ''}>
          <td class="col-date">${dateStr}${archMark}</td>
          <td class="col-oc" title="${esc(e.ocName)}">${esc(e.ocName)}</td>
          <td class="col-diff">D${e.difficulty}</td>
          <td class="col-role" title="${esc(e.role)}">${esc(e.role)}</td>
          <td class="col-weight ocm-slot-weight ${wCls}">${wStr}</td>
          <td class="col-cpr ${cprCls}">${cprStr}</td>
          <td class="col-respect" style="${respStyle}">${respStr}</td>
          <td class="col-outcome ${outCls}">${outIcon} ${outText}</td>
        </tr>`;
      }).join('');

      const tsCount   = entries.filter(e => e.tsSourced).length;
      const archCount2 = entries.filter(e => e.archived && !e.tsSourced).length;

      const noteParts = [];
      if (archCount2 > 0) noteParts.push(`⧗ ${archCount2} from the saved archive (most-recent run per OC, beyond the 100-OC window)`);
      if (tsCount > 0)    noteParts.push(`★ ${tsCount} from TornStats (current CPR, no run date)`);
      const archNote = noteParts.length
        ? `<div style="font-size:10px;color:var(--ocm-text-muted);margin-top:6px">${noteParts.join(' · ')}.</div>`
        : '';

      tableWrap.innerHTML = `
        <table class="ocm-mh-table">
          <thead><tr>
            <th class="col-date">Date</th>
            <th class="col-oc">OC Name</th>
            <th class="col-diff" style="text-align:center">Diff</th>
            <th class="col-role">Role</th>
            <th class="col-weight" style="text-align:right">Weight</th>
            <th class="col-cpr" style="text-align:right">CPR</th>
            <th class="col-respect" style="text-align:right">Respect</th>
            <th class="col-outcome" style="padding-left:14px">Outcome</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>${archNote}`;
    }

    // ── Wire member history search UI
    const mhSearch   = document.getElementById('ocm-mh-search');
    const mhDropdown = document.getElementById('ocm-mh-dropdown');
    const mhClear    = document.getElementById('ocm-mh-clear');

    // Cache Old CPRs — backfill the archive from the full TornStats faction CPR table
    const mhCacheBtn    = document.getElementById('ocm-mh-cache-btn');
    const mhCacheStatus = document.getElementById('ocm-mh-cache-status');
    if (mhCacheBtn) {
      mhCacheBtn.addEventListener('click', async () => {
        const tsKey = GM_getValue(GMK.TS_KEY, '');
        if (!tsKey) {
          if (mhCacheStatus) mhCacheStatus.textContent = 'No TornStats key set — add one in Config first.';
          ocmToast('Add a TornStats API key in Config to cache CPRs.', 'warn');
          return;
        }
        mhCacheBtn.disabled = true;
        const orig = mhCacheBtn.textContent;
        mhCacheBtn.textContent = '⏳ Fetching…';
        if (mhCacheStatus) mhCacheStatus.textContent = '';
        try {
          // Use fresh TornStats data if available, else fetch it now
          let tsData = tsCprData;
          if (!tsData || Object.keys(tsData).length === 0) {
            tsData = await fetchTornStatsCpr(tsKey);
            tsCprData = tsData;
          }
          const res = backfillCprFromTornStats(tsData, mInfo, exMemberNames, getWeight);
          if (mhCacheStatus) {
            mhCacheStatus.textContent = res.filled > 0
              ? `✓ Cached ${res.filled} CPR entr${res.filled === 1 ? 'y' : 'ies'} across ${res.members} member${res.members === 1 ? '' : 's'}.`
              : 'Archive already up to date — no new CPRs to cache.';
          }
          ocmToast(res.filled > 0 ? `Cached ${res.filled} CPRs from TornStats.` : 'Already up to date.', 'ok');
          // Re-render so newly-cached CPRs show; the archive merge happens on render.
          const last = GM_getValue(GMK.MH_LAST, '');
          if (last) loadData(GM_getValue(GMK.API_KEY, ''));
        } catch (e) {
          if (mhCacheStatus) mhCacheStatus.textContent = 'Failed: ' + (e.message || 'TornStats error');
          ocmToast('CPR cache failed: ' + (e.message || 'error'), 'crit');
        } finally {
          mhCacheBtn.disabled = false;
          mhCacheBtn.textContent = orig;
        }
      });
    }

    /** Highlight matching portion of a name with <em> tags. */
    function highlightMatch(name, query) {
      const idx = name.toLowerCase().indexOf(query.toLowerCase());
      if (idx === -1) return name;
      return name.slice(0, idx) + '<em>' + name.slice(idx, idx + query.length) + '</em>' + name.slice(idx + query.length);
    }

    /** Show the autocomplete dropdown filtered by the current search query. */
    function updateDropdown(query) {
      if (!query.trim()) { mhDropdown.classList.remove('visible'); mhDropdown.innerHTML = ''; return; }
      const matches = mhAllMembers.filter(m => m.name.toLowerCase().includes(query.toLowerCase()));
      if (matches.length === 0) { mhDropdown.classList.remove('visible'); mhDropdown.innerHTML = ''; return; }
      mhDropdown.innerHTML = matches.map(m =>
        `<div class="ocm-mh-option" data-uid="${m.uid}">${highlightMatch(m.name, query)}</div>`
      ).join('');
      mhDropdown.classList.add('visible');
      mhDropdown.querySelectorAll('.ocm-mh-option').forEach(opt => {
        opt.addEventListener('mousedown', e => {
          e.preventDefault(); // prevent blur firing before click
          const uid  = opt.dataset.uid;
          const name = memberHistoryIndex[uid]?.name || '';
          mhSearch.value  = name;
          mhDropdown.classList.remove('visible');
          renderMemberHistory(uid);
        });
      });
    }

    mhSearch.addEventListener('input', () => {
      updateDropdown(mhSearch.value);
      // If the typed text exactly matches a member name, render immediately
      const exact = mhAllMembers.find(m => m.name.toLowerCase() === mhSearch.value.toLowerCase());
      if (exact) { renderMemberHistory(exact.uid); GM_setValue(GMK.MH_LAST, exact.name); }
    });

    mhSearch.addEventListener('blur', () => {
      // Small delay so mousedown on option fires first
      setTimeout(() => mhDropdown.classList.remove('visible'), 150);
    });

    mhSearch.addEventListener('focus', () => {
      if (mhSearch.value.trim()) updateDropdown(mhSearch.value);
    });

    mhClear.addEventListener('click', () => {
      mhSearch.value  = '';
      GM_setValue(GMK.MH_LAST, '');
      mhDropdown.classList.remove('visible');
      document.getElementById('ocm-mh-summary').style.display = 'none';
      document.getElementById('ocm-mh-table-wrap').innerHTML =
        `<div id="ocm-mh-empty">Type a member name above to view their OC history.</div>`;
    });

    // Restore last-viewed member after a re-render (auto-refresh rebuilds this section
    // every 60s; without this your open history view would silently reset).
    const mhLast = GM_getValue(GMK.MH_LAST, '');
    if (mhLast) {
      const prev = mhAllMembers.find(m => m.name.toLowerCase() === mhLast.toLowerCase());
      if (prev) { mhSearch.value = prev.name; renderMemberHistory(prev.uid); }
    }

    // ── OC Scenario History — build index and wire search

    /**
     * Build a per-scenario history index from the completed OC list.
     * Keyed by normOcName() so searching "Sneaky Git Grab" matches all variants.
     * Each entry is a full OC record with its slots resolved for display.
     */
    const ocHistoryIndex = {};
    for (const oc of completed) {
      const key     = normOcName(oc.name);
      const display = oc.name || 'Unknown';
      if (!ocHistoryIndex[key]) ocHistoryIndex[key] = { display, runs: [] };
      const s       = normStatus(oc.status);
      const ocSlots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
      const respect = oc.rewards?.respect ?? null;
      // Build per-slot detail for the expandable row
      const slotDetail = ocSlots
        .filter(sl => sl.user?.id)
        .map(sl => {
          const uid  = String(sl.user.id);
          const name = mInfo[uid]?.name || exMemberNames[uid] || `#${uid}`;
          const role = sl.position_info?.label || sl.position || '?';
          const w    = getWeight(oc.name || '', role);
          const cpr  = sl.checkpoint_pass_rate ?? null;
          return { name, uid, role, weight: w, cpr };
        });
      // Avg CPR across filled slots
      const cprs   = slotDetail.filter(s => s.cpr != null).map(s => s.cpr);
      const avgCpr = cprs.length > 0 ? cprs.reduce((a, b) => a + b, 0) / cprs.length : null;

      ocHistoryIndex[key].runs.push({
        ocName:     display,
        difficulty: oc.difficulty ?? '?',
        outcome:    s,
        executedAt: oc.executed_at ?? null,
        respect,
        avgCpr,
        slots:      slotDetail,
      });
    }
    // Sort each scenario's runs newest-first
    for (const key of Object.keys(ocHistoryIndex)) {
      ocHistoryIndex[key].runs.sort((a, b) => (b.executedAt || 0) - (a.executedAt || 0));
    }

    // Sorted list of unique scenario names for autocomplete
    const ohAllScenarios = Object.entries(ocHistoryIndex)
      .map(([key, val]) => ({ key, display: val.display }))
      .sort((a, b) => a.display.localeCompare(b.display));

    /** Render all runs of a scenario into the OC history panel. */
    function renderOcHistory(key) {
      const record    = ocHistoryIndex[key];
      const summaryEl = document.getElementById('ocm-oh-summary');
      const tableWrap = document.getElementById('ocm-oh-table-wrap');
      if (!record || record.runs.length === 0) {
        summaryEl.style.display = 'none';
        tableWrap.innerHTML = `<div id="ocm-oh-empty">No history found for this scenario in the last 100 OCs.</div>`;
        return;
      }

      const runs      = record.runs;
      const total     = runs.length;
      const successes = runs.filter(r => r.outcome === 'successful').length;
      const failures  = runs.filter(r => r.outcome === 'failure').length;
      const rate      = (successes + failures) > 0 ? Math.round(successes / (successes + failures) * 100) : 0;
      const rateCol   = rate >= 85 ? 'var(--ocm-cpr-good)' : rate >= 65 ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-crit)';
      // Avg CPR across all runs
      const allCprs   = runs.filter(r => r.avgCpr != null).map(r => r.avgCpr);
      const overallAvgCpr = allCprs.length > 0 ? (allCprs.reduce((a, b) => a + b, 0) / allCprs.length).toFixed(1) : null;
      // Most common difficulty
      const diffCounts = {};
      for (const r of runs) diffCounts[r.difficulty] = (diffCounts[r.difficulty] || 0) + 1;
      const topDiff = Object.entries(diffCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '?';

      // Summary bar
      summaryEl.style.display = 'flex';
      summaryEl.innerHTML = `
        <div class="ocm-mh-sum-item">
          <span class="ocm-mh-sum-label">Runs</span>
          <span class="ocm-mh-sum-value">${total}</span>
        </div>
        <div class="ocm-mh-sum-item">
          <span class="ocm-mh-sum-label">Success Rate</span>
          <span class="ocm-mh-sum-value" style="color:${rateCol}">${rate}%</span>
        </div>
        <div class="ocm-mh-sum-item">
          <span class="ocm-mh-sum-label">W / F / E</span>
          <span class="ocm-mh-sum-value" style="font-size:12px">
            <span style="color:var(--ocm-cpr-good)">${successes}</span> /
            <span style="color:var(--ocm-cpr-crit)">${failures}</span> /
            <span style="color:var(--ocm-text-muted)">${total - successes - failures}</span>
          </span>
        </div>
        <div class="ocm-mh-sum-item">
          <span class="ocm-mh-sum-label">Avg CPR</span>
          <span class="ocm-mh-sum-value ${overallAvgCpr != null ? cprClass(Number(overallAvgCpr)) : ''}">${overallAvgCpr != null ? overallAvgCpr + '%' : '—'}</span>
        </div>
        <div class="ocm-mh-sum-item">
          <span class="ocm-mh-sum-label">Common Diff</span>
          <span class="ocm-mh-sum-value">D${topDiff}</span>
        </div>`;

      // Run rows — each expandable to show per-member slot detail
      const runsHtml = runs.map((r, idx) => {
        const dateStr  = r.executedAt
          ? new Date(r.executedAt * 1000).toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', year: '2-digit' })
          : '—';
        const outIcon  = r.outcome === 'successful' ? '✅' : r.outcome === 'failure' ? '❌' : '⏰';
        const outCls   = r.outcome === 'successful' ? 'ocm-mh-outcome-success' : r.outcome === 'failure' ? 'ocm-mh-outcome-failure' : 'ocm-mh-outcome-expired';
        const outText  = r.outcome === 'successful' ? 'Success' : r.outcome === 'failure' ? 'Failure' : 'Expired';
        const respStr  = (r.outcome === 'successful' && r.respect != null) ? `${r.respect}` : '—';
        const respCol  = (r.outcome === 'successful' && r.respect != null) ? 'var(--ocm-cpr-warn)' : '#333';
        const avgStr   = r.avgCpr != null ? `${r.avgCpr.toFixed(1)}%` : '—';
        const avgCol   = r.avgCpr != null ? cprClass(r.avgCpr) : '';

        // Per-slot detail rows
        const slotRows = r.slots.map(sl => {
          const wStr  = sl.weight != null ? `${sl.weight.toFixed(0)}%` : '—';
          const wCls  = sl.weight != null ? (sl.weight >= WEIGHT_HIGH ? 'w-high' : sl.weight >= WEIGHT_MID ? 'w-mid' : 'w-low') : '';
          const cStr  = sl.cpr != null ? `${sl.cpr}%` : '—';
          const cCls  = sl.cpr != null ? cprClass(sl.cpr) : '';
          return `<tr>
            <td><a href="/profiles.php?XID=${sl.uid}" target="_blank" style="color:var(--ocm-text-card);text-decoration:none">${esc(sl.name)}</a></td>
            <td style="color:var(--ocm-text-muted)">${sl.role}</td>
            <td class="td-right ocm-slot-weight ${wCls}">${wStr}</td>
            <td class="td-right ${cCls}" style="font-weight:bold">${cStr}</td>
          </tr>`;
        }).join('');

        return `
          <div class="ocm-oh-run-header" data-oh-idx="${idx}" style="border-left:3px solid ${r.outcome === 'successful' ? '#3a5030' : r.outcome === 'failure' ? '#4a2820' : '#444'}">
            <span class="${outCls}">${outIcon}</span>
            <span style="color:var(--ocm-text-muted);font-size:10px;flex:0 0 70px">${dateStr}</span>
            <span style="color:var(--ocm-text-muted);font-size:10px;flex:0 0 30px">D${r.difficulty}</span>
            <span class="${outCls}" style="flex:1">${outText}</span>
            <span style="color:var(--ocm-text-dim);font-size:10px">Avg CPR: <strong class="${avgCol}">${avgStr}</strong></span>
            <span style="color:${respCol};font-size:10px;flex:0 0 60px;text-align:right">${respStr !== '—' ? `${respStr} resp` : '—'}</span>
            <span style="color:var(--ocm-text-faint);font-size:10px;margin-left:4px">▼</span>
          </div>
          <div class="ocm-oh-run-detail" id="ocm-oh-detail-${idx}">
            <table>
              <thead><tr>
                <th>Member</th><th>Role</th>
                <th class="td-right">Weight</th>
                <th class="td-right">CPR</th>
              </tr></thead>
              <tbody>${slotRows || '<tr><td colspan="4" style="color:var(--ocm-text-faint);font-style:italic">No member data</td></tr>'}</tbody>
            </table>
          </div>`;
      }).join('');

      tableWrap.innerHTML = `<div>${runsHtml}</div>`;

      // Wire expand/collapse per run row
      tableWrap.querySelectorAll('.ocm-oh-run-header').forEach(header => {
        header.addEventListener('click', () => {
          const idx    = header.dataset.ohIdx;
          const detail = document.getElementById(`ocm-oh-detail-${idx}`);
          if (!detail) return;
          const isOpen = detail.style.display === 'block';
          detail.style.display = isOpen ? 'none' : 'block';
          const arrow = header.querySelector('span:last-child');
          if (arrow) arrow.textContent = isOpen ? '▼' : '▲';
        });
      });
    }

    // Wire OC history search UI
    const ohSearch   = document.getElementById('ocm-oh-search');
    const ohDropdown = document.getElementById('ocm-oh-dropdown');
    const ohClear    = document.getElementById('ocm-oh-clear');

    function updateOhDropdown(query) {
      if (!query.trim()) { ohDropdown.classList.remove('visible'); ohDropdown.innerHTML = ''; return; }
      const matches = ohAllScenarios.filter(s => s.display.toLowerCase().includes(query.toLowerCase()));
      if (matches.length === 0) { ohDropdown.classList.remove('visible'); ohDropdown.innerHTML = ''; return; }
      ohDropdown.innerHTML = matches.map(s =>
        `<div class="ocm-mh-option" data-key="${s.key}">${highlightMatch(s.display, query)}</div>`
      ).join('');
      ohDropdown.classList.add('visible');
      ohDropdown.querySelectorAll('.ocm-mh-option').forEach(opt => {
        opt.addEventListener('mousedown', e => {
          e.preventDefault();
          ohSearch.value = ocHistoryIndex[opt.dataset.key]?.display || '';
          ohDropdown.classList.remove('visible');
          renderOcHistory(opt.dataset.key);
        });
      });
    }

    ohSearch.addEventListener('input', () => {
      updateOhDropdown(ohSearch.value);
      const exact = ohAllScenarios.find(s => s.display.toLowerCase() === ohSearch.value.toLowerCase());
      if (exact) { renderOcHistory(exact.key); GM_setValue(GMK.OH_LAST, exact.display); }
    });

    ohSearch.addEventListener('blur', () => {
      setTimeout(() => ohDropdown.classList.remove('visible'), 150);
    });

    ohSearch.addEventListener('focus', () => {
      if (ohSearch.value.trim()) updateOhDropdown(ohSearch.value);
    });

    ohClear.addEventListener('click', () => {
      ohSearch.value = '';
      GM_setValue(GMK.OH_LAST, '');
      ohDropdown.classList.remove('visible');
      document.getElementById('ocm-oh-summary').style.display = 'none';
      document.getElementById('ocm-oh-table-wrap').innerHTML =
        `<div id="ocm-oh-empty">Type an OC name above to view all runs of that scenario.</div>`;
    });

    // Restore last-viewed scenario after re-render (same rationale as member history)
    const ohLast = GM_getValue(GMK.OH_LAST, '');
    if (ohLast) {
      const prev = ohAllScenarios.find(s => s.display.toLowerCase() === ohLast.toLowerCase());
      if (prev) { ohSearch.value = prev.display; renderOcHistory(prev.key); }
    }



    function svgLine(canvasId, labels, values, color = 'var(--ocm-cpr-good)') {
      const el = document.getElementById(canvasId);
      if (!el) return;
      const W = 760, H = 120;
      const pad = { t: 10, r: 10, b: 30, l: 36 };
      const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;
      const valids = values.filter(v => v != null);
      if (!valids.length) { el.innerHTML = '<span style="color:var(--ocm-text-faint);font-size:11px;padding:8px;display:block">Not enough data</span>'; return; }
      const xStep  = cW / Math.max(labels.length - 1, 1);
      const yScale = v => cH - (v / 100) * cH;
      let pathD    = '';
      values.forEach((v, i) => {
        if (v == null) return;
        const x = pad.l + i * xStep, y = pad.t + yScale(v);
        pathD += pathD === '' ? `M${x},${y}` : `L${x},${y}`;
      });
      const yTicks = [0, 25, 50, 75, 100];
      el.innerHTML = `<svg width="100%" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="display:block">
        ${yTicks.map(t => `
          <line x1="${pad.l}" y1="${pad.t + yScale(t)}" x2="${pad.l + cW}" y2="${pad.t + yScale(t)}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
          <text x="${pad.l - 4}" y="${pad.t + yScale(t) + 4}" text-anchor="end" fill="#555" font-size="9">${t}%</text>`).join('')}
        <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
        ${values.map((v, i) => v != null ? `<circle cx="${pad.l + i * xStep}" cy="${pad.t + yScale(v)}" r="3" fill="${color}"/>` : '').join('')}
        ${labels.map((l, i) => (i === 0 || i === labels.length - 1 || i % Math.ceil(labels.length / 5) === 0)
          ? `<text x="${pad.l + i * xStep}" y="${H - 4}" text-anchor="middle" fill="#555" font-size="9">${l}</text>` : '').join('')}
      </svg>`;
    }

    function svgBarH(canvasId, labels, values) {
      const el = document.getElementById(canvasId);
      if (!el) return;
      const W = 760;
      const rowH = 22, pad = { t: 4, r: 54, b: 4, l: 160 };
      const H = labels.length * rowH + pad.t + pad.b;
      const cW = W - pad.l - pad.r;
      el.innerHTML = `<svg width="100%" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="display:block">
        ${labels.map((l, i) => {
          const barW = Math.max(2, (values[i] / 100) * cW);
          const y   = pad.t + i * rowH;
          const col = values[i] >= 85 ? 'var(--ocm-cpr-good)' : values[i] >= 65 ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-crit)';
          return `
            <text x="${pad.l - 6}" y="${y + rowH * 0.68}" text-anchor="end" fill="#aaa" font-size="10">${l}</text>
            <rect x="${pad.l}" y="${y + 3}" width="${barW}" height="${rowH - 6}" fill="${col}" rx="2" opacity="0.8"/>
            <text x="${pad.l + barW + 4}" y="${y + rowH * 0.68}" fill="#aaa" font-size="10">${values[i]}%</text>`;
        }).join('')}
      </svg>`;
    }

    function svgBarV(canvasId, labels, values, colors) {
      const el = document.getElementById(canvasId);
      if (!el) return;
      const W = 760, H = 160;
      const pad = { t: 16, r: 10, b: 50, l: 30 };
      const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;
      const maxV = Math.max(...values, 1);
      const gap  = cW / labels.length;
      const barW = Math.max(6, gap - 4);
      el.innerHTML = `<svg width="100%" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="display:block">
        <line x1="${pad.l}" y1="${pad.t + cH}" x2="${pad.l + cW}" y2="${pad.t + cH}" stroke="#333" stroke-width="1"/>
        ${values.map((v, i) => {
          const bH  = Math.max(2, (v / maxV) * cH);
          const x   = pad.l + i * gap + (gap - barW) / 2;
          const y   = pad.t + cH - bH;
          const col = colors ? colors[i] : 'var(--ocm-cpr-good)';
          const raw = labels[i];
          const lbl = raw.length > 10 ? raw.slice(0,9)+'…' : raw;
          return `
            <rect x="${x}" y="${y}" width="${barW}" height="${bH}" fill="${col}" rx="2" opacity="0.85"/>
            <text x="${x + barW/2}" y="${y - 3}" text-anchor="middle" fill="#aaa" font-size="9">${v}</text>
            <text x="${x + barW/2}" y="${pad.t + cH + 12}" text-anchor="end" fill="#555" font-size="9"
              transform="rotate(-40 ${x + barW/2} ${pad.t + cH + 12})">${lbl}</text>`;
        }).join('')}
      </svg>`;
    }

    /**
     * Render the requested chart into its container.
     * The heatmap fix: both heatData and heatScenarios now use normOcName() as their key,
     * eliminating the previous mismatch between raw oc.name keys and normalised scenario keys.
     */
    function renderCharts(targetId) {
      // 1. Success rate over time (weekly buckets)
      if (targetId === 'ocm-chart-timeline') {
        const byWeek = {};
        for (const oc of completed) {
          if (!oc.executed_at) continue;
          const d  = new Date(oc.executed_at * 1000);
          const wk = Math.ceil(d.getUTCDate() / 7);
          const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-W${wk}`;
          if (!byWeek[key]) byWeek[key] = { s: 0, f: 0 };
          if (normStatus(oc.status) === 'successful') byWeek[key].s++;
          else if (normStatus(oc.status) === 'failure') byWeek[key].f++;
        }
        const weekKeys  = Object.keys(byWeek).sort();
        const weekRates = weekKeys.map(k => { const { s, f } = byWeek[k]; return (s+f) > 0 ? Math.round(s/(s+f)*100) : null; });
        svgLine('ocm-chart-timeline', weekKeys.map(k => k.slice(5)), weekRates);
      }

      // 2. Success rate by scenario (horizontal bar)
      if (targetId === 'ocm-chart-scenario') {
        const scenSorted = [...scenarioRows]
          .filter(r => r.success + r.failure > 0)
          .sort((a, b) => (b.success/(b.success+b.failure)) - (a.success/(a.success+a.failure)));
        svgBarH('ocm-chart-scenario',
          scenSorted.map(r => r.name.length > 22 ? r.name.slice(0,20)+'…' : r.name),
          scenSorted.map(r => Math.round(r.success / (r.success + r.failure) * 100)),
        );
      }

      // 3. CPR distribution histogram
      if (targetId === 'ocm-chart-cpr') {
        const cprBuckets = { '0–60': 0, '60–70': 0, '70–80': 0, '80–90': 0, '90–100': 0 };
        for (const oc of completed) {
          const ocSlots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
          for (const slot of ocSlots) {
            if (!slot.user?.id) continue;
            const cpr = slot.checkpoint_pass_rate ?? null;
            if (cpr === null) continue;
            if (cpr < 60)       cprBuckets['0–60']++;
            else if (cpr < 70)  cprBuckets['60–70']++;
            else if (cpr < 80)  cprBuckets['70–80']++;
            else if (cpr < 90)  cprBuckets['80–90']++;
            else                cprBuckets['90–100']++;
          }
        }
        svgBarV('ocm-chart-cpr', Object.keys(cprBuckets), Object.values(cprBuckets),
          ['var(--ocm-cpr-crit)','var(--ocm-cpr-warn)','var(--ocm-cpr-warn)','var(--ocm-cpr-good)','var(--ocm-link)']);
      }

      // 4. Member participation & success rate (top 20 current members)
      if (targetId === 'ocm-chart-members') {
        const topMembers = memberRows.filter(r => !r.isEx).slice(0, 20);
        svgBarV('ocm-chart-members',
          topMembers.map(r => r.name),
          topMembers.map(r => r.participated),
          topMembers.map(r => r.rate >= 0.85 ? 'var(--ocm-cpr-good)' : r.rate >= 0.65 ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-crit)'),
        );
      }

      // 5. Member × Scenario Heatmap
      // FIX: heatData is now keyed by normOcName(oc.name) to match heatScenarios
      // which comes from the normOcName()-keyed scenarioStats. Previously oc.name
      // was used as the key causing every cell lookup to miss.
      if (targetId === 'ocm-heatmap') {
        // Unique normalised scenario names that have at least one data point
        const heatScenarios = Object.keys(scenarioStats).sort();

        // Build heatData[memberUid][normOcName] = {s, f}
        const heatData = {};
        for (const oc of completed) {
          const s       = normStatus(oc.status);
          const normKey = normOcName(oc.name); // ← was oc.name (bug)
          const ocSlots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
          for (const slot of ocSlots) {
            const uid = slot.user?.id ? String(slot.user.id) : null;
            if (!uid) continue;
            // Only include members who appear in memberRows (participated in at least one OC)
            if (!memberRows.find(m => m.uid === uid)) continue;
            if (!heatData[uid]) heatData[uid] = {};
            if (!heatData[uid][normKey]) heatData[uid][normKey] = { s: 0, f: 0 };
            if (s === 'successful') heatData[uid][normKey].s++;
            else if (s === 'failure') heatData[uid][normKey].f++;
          }
        }

        // Only show scenarios that have at least one cell of data
        const heatScens = heatScenarios.filter(sc =>
          memberRows.some(m => heatData[m.uid]?.[sc])
        );

        const cellSize = 30; // slightly larger for readability with 45 members
        const labelW   = 140;

        const heatEl = document.getElementById('ocm-heatmap');
        if (!heatEl) return;
        heatEl.innerHTML = `
          <table style="border-collapse:collapse;font-size:10px;min-width:${heatScens.length * cellSize + labelW}px">
            <thead><tr>
              <th style="min-width:${labelW}px"></th>
              ${heatScens.map(sc => `<th style="text-align:center;color:var(--ocm-text-muted);padding:2px;writing-mode:vertical-rl;transform:rotate(180deg);height:80px;white-space:nowrap;font-weight:normal" title="${sc}">${sc.length>16 ? sc.slice(0,14)+'…' : sc}</th>`).join('')}
            </tr></thead>
            <tbody>${memberRows.map(m => {
              const hasAny = heatScens.some(sc => heatData[m.uid]?.[sc]);
              if (!hasAny) return '';
              return `<tr>
                <td style="padding:2px 6px;color:${m.isEx?'#555':'#ccc'};white-space:nowrap">${esc(m.name)}${m.isEx?' <span style="font-size:9px;color:var(--ocm-text-faint)">(left)</span>':''}</td>
                ${heatScens.map(sc => {
                  const d = heatData[m.uid]?.[sc];
                  if (!d || (d.s + d.f) === 0) return `<td style="width:${cellSize}px;height:${cellSize}px;background:#0a1020;border:1px solid #111" title="No data"></td>`;
                  const rate = d.s / (d.s + d.f);
                  const alpha = 0.3 + rate * 0.5;
                  const bg = rate >= 0.85
                    ? `rgba(68,238,136,${alpha})`
                    : rate >= 0.65
                      ? `rgba(255,170,0,${alpha})`
                      : `rgba(255,68,68,${0.3+(1-rate)*0.5})`;
                  return `<td style="width:${cellSize}px;height:${cellSize}px;background:${bg};border:1px solid #111;text-align:center;color:var(--ocm-text);font-weight:bold;font-size:9px" title="${esc(m.name)} — ${sc}: ${d.s}/${d.s+d.f} (${Math.round(rate*100)}%)">${Math.round(rate*100)}%</td>`;
                }).join('')}
              </tr>`;
            }).join('')}
            </tbody>
          </table>`;
      }
    }

    // Wire chart show/hide toggles — chart is rendered on first click, then cached
    const chartRendered = {};
    analyticsEl.querySelectorAll('.ocm-chart-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.target);
        if (!target) return;
        const visible = target.classList.toggle('visible');
        btn.textContent = visible ? 'Hide Chart' : 'Show Chart';
        if (visible && !chartRendered[btn.dataset.target]) {
          chartRendered[btn.dataset.target] = true;
          renderCharts(btn.dataset.target);
        }
      });
    });

    // The Exports pane is built by renderFinanceSection, which is where the per-OC
    // ledger and the weekly/monthly buckets actually live. Nothing to do here.

    document.getElementById('ocm-last-update').textContent = `Updated ${new Date().toLocaleTimeString()}`;
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
    document.getElementById('ocm-body').style.display       = 'block';
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
    // Hide tab strip; force all tab panes visible so the member-mode content (which is
    // injected inside panes) still renders. The member-mode UI is much smaller and
    // doesn't benefit from tabbing.
    const tabsEl = document.getElementById('ocm-tabs');
    if (tabsEl) tabsEl.style.display = 'none';
    document.querySelectorAll('.ocm-tab-pane').forEach(p => p.classList.add('active'));

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

        const display = (belowWarn ? fallback : scored).slice(0, 5);
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

          card.innerHTML =
            '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap">'
              + '<span style="font-weight:bold;color:var(--ocm-text);font-size:12px">' + s.role + '</span>'
              + '<span style="color:var(--ocm-text-muted);font-size:11px">in</span>'
              + '<span style="color:var(--ocm-link);font-size:12px">' + s.ocName + '</span>'
              + '<span style="color:var(--ocm-text-muted);font-size:10px">D' + s.difficulty + '</span>'
              + '<span style="margin-left:auto;display:flex;gap:10px;font-size:11px;white-space:nowrap">'
                + '<span>CPR: <strong style="color:' + cprCol + '">' + cprStr + '</strong></span>'
                + '<span>Weight: <strong style="color:' + wCol + '">' + wStr + '</strong></span>'
              + '</span>'
            + '</div>'
            + '<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;min-height:18px">' + tagHtml + '</div>'
            + adviceHtml;
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

  /** Faction armory give page — the in-game loan flow (API can't loan, this opens the UI).
   *  Must be sub=utilities (plural) — sub=utility silently lands on the wrong tab.
   *  OC items are Tools / Materials / Enhancers, all of which live under utilities. */
  function armoryGiveUrl() {
    return 'https://www.torn.com/factions.php?step=your#/tab=armoury&start=0&sub=utilities';
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

  /** Build "who needs what right now" from the faction's active OCs. */
  async function fetchArmoryNeed(apiKey) {
    const [f, m] = await Promise.all([
      apiFetch('/faction?selections=crimes', apiKey),
      apiFetch('/faction?selections=members', apiKey),
    ]);
    const crimes = f.crimes || {};
    const members = m.members || {};
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
    return { needByUser, userNeeds, names };
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
   * Annotate the Utilities armory with an "OC Status" column.
   *
   * Answers ONE question, about the items that are out on loan: is the person
   * holding it actually using it?
   *   🎯 In use     — loaned to someone whose current OC role requires it
   *   ♻ Not needed  — loaned out, but the holder's role doesn't require it
   *   (blank)       — not loaned out; nothing to say
   */
  async function initArmoryAnnotations() {
    if (!location.href.includes('factions.php')) return;
    if (!location.hash.includes('tab=armoury') || !location.hash.includes('sub=utilities')) return;

    const apiKey = GM_getValue(GMK.API_KEY, '');
    if (!apiKey) return;

    const firstRow = await waitForEl('.item-list li .img-wrap[data-itemid]', 15000);
    if (!firstRow) return;
    const wrap = firstRow.closest('.armoury-tabs') || document.querySelector('.armoury-temporary-wrap');
    if (!wrap) return;

    if (!_armoryNeed) {
      try {
        _armoryNeed = await fetchArmoryNeed(apiKey);
      } catch (e) {
        wrap.classList.remove('ocm-armory-annotated');   // don't leave the layout broken
        ocmToast('Could not load OC status for the armory: ' + e.message, 'warn');
        return;
      }
    }

    paintArmoryColumn(wrap, _armoryNeed);

    // Torn rebuilds the list after Give / Loan / Retrieve. Repaint when it does.
    // Guard against our own DOM writes re-triggering the observer.
    if (wrap.__ocmObserved) return;
    wrap.__ocmObserved = true;
    let painting = false;
    const obs = new MutationObserver(() => {
      if (painting) return;
      const rows = wrap.querySelectorAll('.item-list > li .img-wrap[data-itemid]');
      const cells = wrap.querySelectorAll('.item-list > li .ocm-acol');
      if (rows.length && cells.length >= rows.length) return;   // already painted
      painting = true;
      // A retrieve also CHANGES who holds what, so refresh the OC picture too —
      // but cheaply: only the crimes call, and only if a loan actually changed.
      fetchArmoryNeed(apiKey)
        .then(n => { _armoryNeed = n; })
        .catch(() => {})
        .finally(() => { paintArmoryColumn(wrap, _armoryNeed); painting = false; });
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
    const shareRaw = Number(GM_getValue(GMK.PAYOUT_SHARE, 100));
    const sharePct = (isFinite(shareRaw) && shareRaw >= 0 && shareRaw <= 100) ? shareRaw : 100;

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
      for (const s of slots) if (s?.user?.id) out[String(s.user.id)] = resolveMemberName(s.user.id, memberNames, s.user.name);
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
    }).sort((a, b) => b.flag - a.flag || a.name.localeCompare(b.name));
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

    // — Summary pane
    let summaryPane;
    if (ocCount === 0) {
      summaryPane = '<div style="color:var(--ocm-text-dim);font-size:12px;padding:14px;line-height:1.5">'
        + (viewMode === 'tracked'
            ? 'No OCs recorded yet. The all-time tracker starts logging completed OCs from now on — check back after your faction completes some.'
            : 'No completed-OC reward data in this window' + (sinceTs>0?' after your cutoff date':'') + '. Profit appears here once your faction completes OCs.')
        + '<br><span style="color:var(--ocm-text-muted);font-size:11px">' + viewNote + '</span></div>';
    } else {
      const kpis = `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:4px">`
        + kpiTile('Net Profit', fmtMoney(netProfit), 'revenue − item cost', netColor(netProfit), netProfit>=0?'var(--ocm-cpr-good)':'var(--ocm-cpr-crit)')
        + kpiTile('Revenue', fmtMoney(revenue), `cash ${fmtMoney(totalMoney)} + items ${fmtMoney(totalItemValue)}`)
        + kpiTile('Item Cost', fmtMoney(totalCost), 'consumed materials', 'var(--ocm-cpr-crit)')
        + kpiTile('Unpaid Cash', fmtMoney(unpaidCash), `${unpaidCount} OC${unpaidCount===1?'':'s'} not marked paid`, unpaidCash>0?'var(--ocm-cpr-warn)':'var(--ocm-cpr-good)')
        + kpiTile('Respect', totalRespect.toLocaleString(), `${ocCount} OCs`, 'var(--ocm-link)')
        + kpiTile('~ Net / Day', fmtMoney(netPerDay), `over ${days.toFixed(0)}d`, netColor(netPerDay))
        + `</div>`;
      const scenRows = Object.entries(byScenario)
        .map(([name, s]) => ({ name, ...s, revenue: s.money + s.itemValue, net: s.money + s.itemValue - s.cost }))
        .sort((a, b) => b.net - a.net);
      const scenTable = `
        <div class="ocm-section-title" style="margin-top:12px">By Scenario</div>
        <table class="ocm-analytics-table" style="table-layout:fixed;width:100%">
          <thead><tr><th style="width:auto">OC</th><th class="td-right" style="width:44px">Runs</th>
            <th class="td-right" style="width:76px">Revenue</th><th class="td-right" style="width:66px">Cost</th>
            <th class="td-right" style="width:80px">Net</th><th class="td-right" style="width:66px">Net/Run</th></tr></thead>
          <tbody>${scenRows.map(r => `<tr>
              <td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.name)}">${esc(r.name)}</td>
              <td class="td-right">${r.runs}</td>
              <td class="td-right" style="color:var(--ocm-text-dim)">${fmtMoney(r.revenue)}</td>
              <td class="td-right" style="color:var(--ocm-cpr-crit)">${negCost(r.cost)}</td>
              <td class="td-right" style="color:${netColor(r.net)};font-weight:bold">${fmtMoney(r.net)}</td>
              <td class="td-right" style="color:var(--ocm-text-dim)">${fmtMoney(r.net / r.runs)}</td>
            </tr>`).join('')}</tbody></table>`;
      summaryPane = kpis + scenTable
        + '<div style="font-size:10px;color:var(--ocm-text-muted);margin-top:10px;line-height:1.5">' + viewNote
        + ' Net = revenue (cash + reward item value) − item cost (consumed 📦 materials only; reusable 🔧 tools excluded). Unpaid = completed OCs with cash whose Paid toggle (OCs Ran tab) is off.'
        + (anyUnknownCost ? ' Some older OCs predate cost tracking and are out of the API window, so show $0 cost.' : '')
        + '</div>';
    }

    // — Payout matching (used by both the OCs Ran list and the Payouts pane).
    //   Torn's funds log doesn't record which OC a give was for, so gives are
    //   matched back to per-member OC claims by recipient + amount + timing.
    const payEvents = loadPayoutEvents();
    const newsStatus = String(GM_getValue(GMK.PAYOUT_NEWS_STATUS, ''));
    const match = matchPayouts(perOc, payEvents, sharePct);
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
              ${perHead > 0 ? `<div style="margin-top:2px">Suggested split: <b>${fmtMoney(perHead)}</b> each <span style="color:var(--ocm-text-muted)">(${pCount} × ${sharePct}% of cash)</span></div>` : ''}
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
            ? `<a href="${armoryGiveUrl()}" target="_blank" class="ocm-loan-btn ocm-loan-go" data-item="${esc(String(l.itemId))}" data-itemname="${esc(l.itemName)}" data-uid="${esc(String(l.uid))}" data-member="${esc(l.name)}" title="Opens the faction armory and fills the loan form: ${esc(l.itemName)} → ${esc(l.name)}. Torn's API can't loan for you, so check it and press LOAN.">Give ▸</a>`
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
          <td style="padding:7px 8px;text-align:right"><a href="${armoryGiveUrl()}" target="_blank" class="ocm-return-btn ocm-loan-go" data-mode="retrieve" data-item="${esc(String(r.itemId))}" data-itemname="${esc(r.itemName)}" data-uid="${esc(String(r.uid))}" data-member="${esc(r.holderName)}" title="Opens the armory at ${esc(r.itemName)} so you can retrieve it from ${esc(r.holderName)}.">Retrieve ▸</a></td>
        </tr>`;
      }).join('');
      returnPanel = `
        <div class="ocm-section-title" style="margin-top:16px">♻ Retrievable — Held but Not Needed (${returnable.length})</div>
        <div style="font-size:11px;color:var(--ocm-text-muted);margin-bottom:8px;line-height:1.5">
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
      returnPanel = `<div class="ocm-section-title" style="margin-top:16px">♻ Retrievable — Held but Not Needed</div>
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
          Every member in an active OC slot with an item requirement, plus anyone holding a faction item on loan.
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
      const memberCutOf = r => (r.native?.percentage != null) ? r.money * r.native.percentage / 100 : 0;
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

      const kpis = `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">`
        + kpiTile('Paid to members', fmtMoney(totalPaidOut), `across ${paidOcs.length} OC${paidOcs.length === 1 ? '' : 's'}`, 'var(--ocm-cpr-good)')
        + kpiTile('Awaiting payout', unpaidOcs.length, unpaidOcs.length ? `${fmtMoney(unpaidCash)} not distributed` : 'all settled', unpaidOcs.length ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-good)')
        + kpiTile('Members paid', memberRows.length, topPaid ? `top: ${esc(topPaid.name)}` : '—', 'var(--ocm-link)')
        + kpiTile('Faction kept', fmtMoney(paidOcs.reduce((s, r) => s + (r.money - memberCutOf(r)), 0)), "the faction's cut", 'var(--ocm-text)')
        + `</div>`;

      // ── Per-member earnings (the headline answer: who got paid, how much)
      const maxTotal = memberRows.length ? memberRows[0].total : 1;
      const memberTable = memberRows.length === 0 ? '' : `
        <div class="ocm-section-title" style="margin-top:2px">💰 Paid to Each Member (${memberRows.length})</div>
        <div style="font-size:11px;color:var(--ocm-text-muted);margin-bottom:8px;line-height:1.5">
          Every paid OC's members' cut, split evenly across its crew and totalled per person.</div>
        <table class="ocm-pay-table">
          <thead><tr>
            <th style="width:auto">Member</th>
            <th style="width:56px;text-align:right">OCs</th>
            <th style="width:110px;text-align:right">Total earned</th>
            <th style="width:100px;text-align:right">Avg / OC</th>
            <th style="width:130px">Share of payouts</th>
          </tr></thead>
          <tbody>${memberRows.map(m => `<tr>
            <td><a href="/profiles.php?XID=${m.uid}" target="_blank">${esc(m.name)}</a></td>
            <td style="text-align:right;color:var(--ocm-text-dim)">${m.ocs}</td>
            <td style="text-align:right;font-weight:700;color:var(--ocm-cpr-good)">${fmtMoney(m.total)}</td>
            <td style="text-align:right;color:var(--ocm-text-dim)">${fmtMoney(m.total / m.ocs)}</td>
            <td><div class="ocm-pay-bar"><span style="width:${(m.total / maxTotal) * 100}%"></span></div></td>
          </tr>`).join('')}</tbody></table>`;

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
          <td style="text-align:center;color:var(--ocm-link);font-weight:600">${n.percentage != null ? n.percentage + '%' : '—'}</td>
          <td style="text-align:right;font-weight:700;color:${paid ? 'var(--ocm-cpr-good)' : 'var(--ocm-text-muted)'}">${each != null ? fmtMoney(each) : '—'}</td>
          <td style="text-align:right;white-space:nowrap;color:${paid ? 'var(--ocm-cpr-good)' : 'var(--ocm-cpr-warn)'}">${paid ? '✓ ' + dateStr(n.at) : 'awaiting'}</td>
        </tr>
        ${paid ? `<tr class="ocm-pay-detail" data-oc="${esc(String(r.id))}"><td colspan="7"><div class="ocm-pay-crewwrap">${crewDetail(r)}</div></td></tr>` : ''}`;
      }).join('');
      const ocTable = (rows, title, note, paid) => !rows.length ? '' : `
        <div class="ocm-section-title" style="margin-top:16px">${title}</div>
        ${note ? `<div style="font-size:11px;color:var(--ocm-text-muted);margin-bottom:8px;line-height:1.5">${note}</div>` : ''}
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

      payoutsPane = kpis + memberTable
        + ocTable(unpaidOcs, `⏳ Awaiting Payout (${unpaidOcs.length})`,
                  'Completed OCs Torn has not recorded as paid out. Handle the payout on the OC page — Torn does the splitting.', false)
        + ocTable(paidOcs, `✓ Paid (${paidOcs.length})`, 'Click any row to see who got what.', true)
        + `<div style="font-size:11px;color:var(--ocm-text-muted);margin-top:12px;line-height:1.6">
             Read straight from Torn's OC payout records: whether each OC was paid, when, and the split set at payout time.
             Each member receives an equal share of the members' cut, so "Each" = cash × split ÷ crew.</div>`;
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
          or an OC payout that didn't use your ${sharePct}% share. Shown so no money is silently unexplained.</div>
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
          Each completed OC creates one claim per member (cash × ${sharePct}% ÷ crew). Gives from the faction funds log are
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
      <div class="ocm-section-title" style="margin-top:16px">${title}</div>
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
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
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

    // ── FACTION EARNINGS
    let factionEarnPane;
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

      factionEarnPane = `
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
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
        ${periodTable('📅 By Week', weekly)}
        ${periodTable('🗓 By Month', monthly)}`;
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
    put('ocm-money-summary',  summaryPane);
    put('ocm-money-payouts',  payoutsPane);
    put('ocm-money-ocs',      ocsPane);
    put('ocm-money-members',  memberEarnPane);
    put('ocm-money-faction',  factionEarnPane);
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
      moneyBadge.classList.toggle('has-attn', unpaidCount > 0);
    }
    // People's badge also covers blocked/optimize, so updateTabCounts finalises it —
    // hand it the loans + item-status part.
    ocmPeopleItemAttn = summary.loanCount + memberAttn;

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
        document.getElementById('ocm-body').style.display = 'block';
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
        document.getElementById('ocm-body').style.display = 'block';
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
    }

    tabs.forEach(t => {
      t.addEventListener('click', () => activate(t.dataset.tab));
    });

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

    // Default to the Crimes tab (filling OCs is the main job), or whatever was last
    // open. v3.17 restructured 6 tabs into 3, so migrate any retired tab name.
    const TAB_MIGRATION = { action: 'crimes', ocs: 'crimes', status: 'people',
                            optimize: 'people', reference: 'people',
                            profit: 'home', items: 'home', finance: 'home', money: 'home' };
    let saved = GM_getValue(GMK.ACTIVE_TAB, 'home');
    if (TAB_MIGRATION[saved]) saved = TAB_MIGRATION[saved];
    if (!['home', 'crimes', 'people', 'consumables', 'war', 'armoury'].includes(saved)) saved = 'home';
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

    // Main tabs. Crimes = slots you could fill right now (the main job).
    // People = anything needing a human: loans, item problems, low CPR.
    setBadge('ocm-tab-count-crimes', free, free > 0);
    const peopleAttn = (ocmPeopleItemAttn || 0) + lowCpr;
    setBadge('ocm-tab-count-people', peopleAttn, peopleAttn > 0);
    // Money badge is owned by the finance render (OCs awaiting payout).
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
        document.getElementById('ocm-key-status').textContent = `Key saved ✓ · CPR ${CPR_WARN}%/${CPR_CRIT}% · W ${WEIGHT_HIGH}%/${WEIGHT_MID}% · ↻${REFRESH_S}s`;
        document.getElementById('ocm-cfg-status').textContent = 'Saved ✓';
        setTimeout(() => { document.getElementById('ocm-cfg-status').textContent = ''; }, 2000);
        const key = GM_getValue(GMK.API_KEY, '');
        if (key) { scheduleRefresh(key); loadData(key); }
      });

      // Reset to defaults
      document.getElementById('ocm-cfg-reset-btn').addEventListener('click', () => {
        saveConfig(70, 60, 25, 15, 60, 2);
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

  // ─── BOOT ────────────────────────────────────────────────────────────────────
  inject();
  initLoanAutofill();
  initArmoryAnnotations();
  // Armoury is a hash route — a later navigation there must also autofill.
  window.addEventListener('hashchange', () => { initLoanAutofill(); initArmoryAnnotations(); });
  injectSidebar();
  fetchRoleWeights();

})();