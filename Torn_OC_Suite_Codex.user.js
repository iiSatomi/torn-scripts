// ==UserScript==
// @name         Torn OC Suite Codex
// @namespace    torn_oc_suite_rebuild
// @version      3.37.0-codex24
// @description  Full Organised Crime management for Torn faction leaders — fill slots by CPR, track loaned items and armory gaps, and see exactly who got paid what.
// @author       iSatomi (3580191)
// @license      GPL-3.0
// @match        https://www.torn.com/factions.php*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_xmlHttpRequest
// @grant        GM.xmlHttpRequest
// @grant        GM.getValue
// @grant        GM.setValue
// @connect      tornprobability.com
// @connect      www.tornstats.com
// @connect      api.torn.com
// @downloadURL https://raw.githubusercontent.com/iiSatomi/torn-scripts/main/Torn_OC_Suite_Codex.user.js
// @updateURL https://raw.githubusercontent.com/iiSatomi/torn-scripts/main/Torn_OC_Suite_Codex.user.js
// @grant        GM_deleteValue
// @grant        GM_info
// ==/UserScript==
//
//
// Changelog (recent):
// codex17: Remove duplicate embedded War and Usage Command modules and their settings.
//          Keep Armory and loan copying within OC and restore standalone tool visibility.
// codex16-mobile: OC-only navigation, touch-readable record cards, one page scroll,
//                 preserved drafts/details/filters, bounded phone ledgers and
//                 explicit historical-cost provenance. No live actions added.
// codex15: Add modular Hub display/refresh preferences and private opt-in shared
//          Torn key access; retain personal fallback keys and native controls.
// codex14: Register OC Suite and its War, Consumables, Armoury and Settings menus
//          with the standalone Torn Script Hub; preserve native launch controls.
// v3.37.0-codex13 — Resolve Torn's selected armory tab container to its category
//                    link; refresh stale armory activity and disable stale loan
//                    shortcuts; paginate finance history and native payouts;
//                    cancel superseded native Crimes waiters on SPA navigation.
// v3.37.0-codex12 — Correct Codex update URLs; remount feature panes after SPA
//                    replacement; scope native armory annotations and loan cards
//                    to the active category and cancel stale navigation work.
// v3.37.0-codex5 — Refined the restored 3.36 shell: removed remaining premium
//                   input/button/glow leakage, restored classic stat ordering,
//                   fixed an undefined hover token and stale loading copy, added
//                   PDA-safe settings wrapping and 44px controls, and made main
//                   tabs/subtabs keyboard and screen-reader accessible. Browser
//                   tests now use fresh mobile documents and walk all six tabs.
// v3.37.0-codex4 — Added universal Torn PDA large-data storage support. Growing
//                   OC/CPR/payout/TornStats/FF and Consumables caches now use
//                   PDA_storage when available, with one-time legacy migration,
//                   batched writes, quota fallback, and safe diagnostics. Kept
//                   one desktop/PDA script and enlarged touch targets on narrow
//                   and coarse-pointer layouts.
// v3.37.0-codex3 — Restored the compact 3.36 header + horizontal tab shell while
//                  retaining the complete rebuild/PurrfectCrime/Codex feature set.
// v3.37.0-codex2 — Added a manual API & Memory Diagnostics panel to Config.
//                   It shows bounded request outcomes, DOM/timer footprint,
//                   and Chromium heap support without recording secrets.
// v3.37.0-codex1 — New isolated Codex variant. The Consumables tab is being
//                   redesigned for a mobile-first operational glance plus
//                   member history; the original suite remains unchanged.
// v3.37.0-ui71 — FIX: repeated SPA navigation away from Crimes added another
//                 hashchange listener every time inject() ran. Those retained
//                 the suite closure and pushed mobile browsers toward OOM. The
//                 route watcher is now installed once for the script lifetime.
// v3.37.0-ui70 — FIX: faction armory selections were sent through API v2, but
//                 Torn still serves utilities/armor/weapons/etc. only from v1.
//                 That returned error 22, so loaned_to was empty and the Loans
//                 view missed retrievable items. Armory selections now use v1;
//                 the rest of the leader data remains on v2.
// v3.37.0-ui69 - Legend rebuilt. It was unreadable, and the cause was column widths
//          that did not match their content: the COLOUR and COLUMNS sections put
//          their explanation prose in column B at width 12, while "Members, By war"
//          got column C at width 62. Now one grid for the whole sheet - A subject,
//          B swatch/value, C explanation (88 wide), D where to look.
//          New: a START HERE section, and a WORKED EXAMPLE built from a real row of
//          the export being generated - never invented numbers, so it cannot
//          describe something the sheet does not do. It walks the reader across one
//          member cell by cell, including where the wasted figure comes from. Tests
//          parse that sentence back out and assert its arithmetic holds, because an
//          example that lies is worse than no example. A member with an overdose
//          excuse is never chosen for it - their waste has the excused amount taken
//          off, so the plain arithmetic would not add up.
//          Also new: a METHOD section stating the waste assumption, that a blank is
//          an absence rather than a zero, whether the OD check actually covered
//          every war, and what a drug sweep does NOT contain (losses, respect,
//          defends - different endpoint).
//          Writer gains row heights and vertical-top alignment. Only single-line
//          section bands are merged: Excel auto-fits a wrapped cell but never a
//          merged one, so merging the prose would have clipped it.
// v3.37.0-ui68 - Multi-war sweep reuses cached overdose checks.
//          sweepOverdoses has been WRITING each war's OD result into that war's
//          cache slot since it shipped - it just never read it back, so every
//          sweep re-checked wars whose overdoses were settled history and could
//          not change. It now loads them, and the sweep does a free cache-only
//          pass on EVERY run rather than hiding what it already knows behind the
//          "Check overdoses" box. That box now only decides whether to spend calls
//          on wars never checked before; relabelled "(spends calls)" to say so.
//          A LIVE war is never served from cache - someone can still overdose in
//          it - so only wars with an end time are reused.
//          Coverage is tracked, because partial coverage must not read as a clean
//          bill of health: exports now say "run on all N wars", "PARTIAL - 3 of 8",
//          or "NOT run", and the workbook only claims odRun when every eligible war
//          was actually checked. The status line says how many came from cache and
//          how many are still unchecked.
// v3.37.0-ui67 - Summary sheet gains per-war hit columns.
//          After Wasted Xanax, one column per war headed with the war name, each
//          cell that member's hits in that war. Tinted by war exactly as on the
//          Members sheet, so the wash stays column IDENTITY only while red (landed
//          nothing) and blue (overdosed) text keep carrying the meaning.
//          A blank cell means they sat that war out OR Torn has not published its
//          hits yet - never a 0, which would be an assertion rather than an absence.
//          The total row gains a per-war hit total, and autofilter/widths extend to
//          cover the new columns. Tests now assert the per-war hits reconcile with
//          each member's Hits total - the two come from different places in the
//          data, so their agreeing is a real check rather than a tautology.
// v3.37.0-ui66 - Sweep workbook gains a Summary sheet; CSV retired.
//          The workbook opened on "Overview", a dense label/value list. New first
//          sheet "Summary" is the front door: a KPI band over a seven-column table
//          (member, wars in, Xanax, hits, avg hits/war, hits per Xanax, wasted) and
//          nothing else. No per-war grid - the complaint was that the export was
//          overloaded, not that it was missing anything. Overview/Members/By war/
//          Legend all survive underneath for the detail.
//          Its aggregates are FORMULAS (=SUM/AVERAGE/COUNT/IFERROR over the rows
//          right there), not numbers computed in JS and pasted in, so a reader can
//          click any total and see where it came from. Restricted to Excel-2007-era
//          functions so nothing needs an _xlfn prefix to evaluate.
//          Font Calibri -> Arial: the destination is Google Sheets, which has no
//          Calibri, substitutes it, and shifts every column width chosen here.
//          CSV dropped as an export choice now the workbook covers the same ground
//          in colour. The wide builder stays as the CLIPBOARD fallback only, since
//          Copy needs text and a workbook is binary; a saved "csv"/"tidy" pref from
//          an older version now resolves to the workbook instead of falling through.
//          War-name fix ported to the remaining exports: the embedded TWPR sweep CSV
//          was still emitting the full ~45-char "2026-05-02 Unicorn Apocalypse" per
//          column, and its standalone HTML cut at 11 chars mid-word ("Disciples o").
//          Both now share warShortNames(). Discord keeps its 4-char keys - monospace
//          has no column widths to spend. New test-sweep-xlsx.cjs covers the lot.
// v3.37.0-ui65 - War exports use real faction names instead of W1/W2/W3.
//          ui64 replaced ~45-character war labels with W-number codes to get the
//          header readable, which worked but cost the reader the thing they
//          actually wanted: "W6 Hits" means nothing without scrolling to the key.
//          A spreadsheet has column widths and wrapped headers, unlike the Discord
//          export it borrowed the idea from, so it can afford the real name.
//          warShortNames() trims each opponent to 16 characters at a WORD boundary
//          (never mid-syllable, never ending on a dangling "of"/"the"), and when the
//          same faction was fought twice it appends the date so a label always
//          identifies exactly one war. Applies to the workbook (Members headers,
//          By war, Legend) and both CSV formats. War columns widened 11 -> 13.
//          The Discord export keeps its 4-char keys - a monospace code block has no
//          column widths to spend.
// v3.37.0-ui64 - Multi-war sweep CSV rebuilt for spreadsheets.
//          Reported as unreadable in Google Sheets once several wars are swept.
//          Seen live on a real export (8 wars, 83 of 92 members) - three problems:
//          (1) five metadata lines plus a blank pushed the real header to ROW 7, so
//          freeze/filter/sort all had to be undone by hand first; (2) war columns were
//          labelled "2026-05-02 Unicorn Apocalypse XanaxSwallowed" - ~45 characters
//          each, 16 of them; (3) the wide matrix is mostly EMPTY, because hardly
//          anyone fights every war, so it is 16 sparse columns of blanks.
//          Fixes: header is now row 1 and the provenance block trails the data as #
//          comments; war columns use short codes (W1 Xan / W1 Hits) with a war key at
//          the bottom; and a new TIDY format emits one row per member PER WAR, only
//          for wars they were actually in - no blanks, and it pivots (member down the
//          side, war across the top) which is the real fix for many wars. Wide is
//          kept and still mirrors the on-screen table. Tidy downloads as -tidy.csv so
//          the two do not collide in Downloads.
// v3.37.0-ui63 — Dead-code trim (243 lines). Nothing behavioural; every removal was
//                 proven unreachable before deleting, and all 6 tabs re-verified live.
//                 JS: the membersPane builder (36 lines) rendered into
//                 #ocm-people-items, an element deleted when the Item Status sub-tab
//                 was retired — built every cycle, written nowhere; its put() and the
//                 setSb('ocm-sb-memitems') beside it; the #ocm-tab-count-money badge
//                 block (Money left OCM_NAV, so that id has no element); OCUI.prov(),
//                 a kit method with zero call sites.
//                 CSS: ~30 rule blocks for 26 classes never emitted anywhere —
//                 .ocm-mcard* (the pre-oc2 member cards), .ocm-slot*/.ocm-slots,
//                 .ocm-dl-btn/.ocm-downloads-grid, .ocm-item-tag*, .ocm-progress-*,
//                 .ocm-prov*, .ocm-note/.ocm-timer/.ocm-chart-card/.ocm-card-title;
//                 the two .ocm-embed rules left over from the pre-native era when War
//                 and Consumables mounted the vendored panels inline; and #ocm-header
//                 — the OLD UI shell header, replaced by the rail+topbar in the ui2
//                 rewrite, element long gone but 7 CSS rules still shipping.
//                 KEPT deliberately: .ocm-tile-*/.ocm-kchip-* look unused to a text
//                 scan but are built as `ocm-tile-${tone}` in the OCUI kit;
//                 #frostbite-usage-command's CSS (its root is created via
//                 `root.id = APP_ID`); and the old base content CSS the .ocm-ui2
//                 overrides layer on top of — that is load-bearing, not cruft.
//                 NOT removed, deliberately: #ocm-pane-money is unreachable (Money is
//                 not in OCM_NAV) but renderFinanceSection guards on
//                 #ocm-money-summary and its side effects feed the Armoury Loans view
//                 and the payout estimates — deleting the pane would silently kill
//                 both. Needs a proper split of computation from presentation first.
// v3.37.0-ui62 — Payout estimates are now REAL MONEY from your own runs, and the
//                 native badge wears the panel's theme.
//                 (1) ocPayoutEstimate() replaces ocMoneyEstText(). It prefers the
//                 faction's OWN completed runs — cash plus reward items priced at
//                 market, indexed per scenario in _ocPayoutObserved during the
//                 finance render — over Torn's published band. That's what puts a
//                 dollar figure on the scenarios the wiki could only call an "item
//                 reward": an item payout IS a payout, it just has to be priced.
//                 Built from the UNFILTERED record set so the profit view's date
//                 window (a display preference) can't shrink the sample. Falls back
//                 to the published range, then the wiki note, and the tooltip says
//                 which of the three you're looking at — observed figures name the
//                 run count and average, published ones say so explicitly.
//                 NOTE: a scenario you have never completed still shows the wiki
//                 note; there is no history to price yet.
//                 (2) The native badge now resolves --ocm-bg-card / --ocm-border-soft
//                 / --ocm-cpr-warn off #ocm-root and inlines them, so it matches
//                 whatever theme is active (including the colourblind and custom
//                 presets) instead of hardcoded gold-on-brown. Torn's cards sit
//                 outside #ocm-root so the vars can't cascade — they have to be
//                 resolved and written inline. A `data-skin` stamp lets the painter
//                 notice a theme change and repaint.
// v3.37.0-ui61 — Payout estimates now show on TORN'S OWN OC cards, not just inside
//                 the suite panel. New annotateNativeOcCards() drops a gold badge
//                 beside each scenario name on the native Recruiting/Planning/
//                 Completed list, reusing the same wiki table and the same Config
//                 toggle as the in-panel chip (toggling now repaints both).
//                 Torn's OC 2.0 markup is CSS-module hashed and those hashes move
//                 on every deploy, so nothing here binds to a full class name:
//                 cards come from the stable `data-oc-id`, the title from a
//                 `[class*="panelTitle"]` PREFIX match, with a final fallback that
//                 scans leaf nodes for text matching a known scenario. Torn rebuilds
//                 the whole list on tab switches and its own polling, wiping the
//                 badges, so a debounced MutationObserver on #faction-crimes-root
//                 repaints them (re-armed on hashchange, since leaving Crimes tears
//                 that node down and returning builds a new one).
//                 Verified live on all 6 active OCs, money and non-money variants.
// v3.37.0-ui60 — CPR: exact-match now takes the HIGHER of history vs TornStats,
//                 plus a Config -> "Rebuild CPR cache" button.
//                 tsGetCpr used to be strict first-wins by source priority, so an
//                 observed archived run always beat TornStats even when TornStats
//                 rated the member higher (they'd improved since, or the archived
//                 run was an early bad one). Steps 1-2 (our archive + the live API
//                 window) are now collected as "history", step 3 as "TornStats",
//                 and whichever is higher wins. Applies ONLY to exact crime+role
//                 matches, where both sources describe the same thing — the fuzzy
//                 fallbacks still deliberately take the LOWEST, since those are
//                 proxies for a role the member has never run and guessing high
//                 there seats someone who then fails.
//                 New Config button re-gathers every reference from source: forces
//                 the TornStats cache stale + clears its back-off, refetches
//                 TornStats, re-reads the faction's completed OCs (rebuilding
//                 _ocmHistoryCpr and archiving observed runs), then folds the fresh
//                 TornStats numbers into the archive. Non-destructive on purpose —
//                 the archive is the only memory of runs older than the API's ~100-OC
//                 window, so it is refreshed and added to, never wiped. Needed a
//                 module-scope _cprBackfillCtx stash because the backfill's roster
//                 maps are built inside renderDashboard, out of the Config panel's
//                 scope. Also removed two long-stale doc blocks above tsGetCpr that
//                 still described TornStats-first ordering.
// v3.37.0-ui59 — Retrieve now works from the CRIMES panel too (ui58 fixed it only
//                 when already inside the Armoury). ui58 fell back to hash+reload
//                 when the armoury tabs weren't in the DOM, on the belief that a
//                 cold load honours `sub=`. It doesn't: Torn resolves the initial
//                 sub-tab from a `type=` QUERY param, and coming from Crimes there
//                 is no type=, so the reload landed on the FIRST tab (Weapons).
//                 (The earlier "cold load honours the hash" test was a false
//                 positive — the page happened to already be on Armor, so restore-
//                 last-tab and honour-the-hash were indistinguishable.)
//                 Fix: stop routing by URL entirely. The intent now carries `sub`,
//                 and initLoanAutofill owns getting there — it waits for the
//                 armoury to render, then CLICKS the category tab (the only
//                 reliable switch), re-clicking if the strip re-renders under it,
//                 then runs the existing page sweep. Covers every entry point
//                 (Crimes panel, inside the Armoury, off-site) with one path and
//                 no page reload. Verified live: Crimes -> Armor in 2.4s.
// v3.37.0-ui58 — FIXES THE ACTUAL RETRIEVE BUG (found in review of ui45-57).
//                 Root cause: wireLoanGoButtons navigated by assigning
//                 location.hash. Torn's armoury router only reads sub=/start=
//                 on a COLD LOAD — a same-document hash change fires hashchange
//                 but the router IGNORES it, so the URL changed while the visible
//                 tab did not. Proven live twice: hash set to sub=armour with
//                 Utilities still on screen; same-document nav to sub=medical
//                 likewise stayed on Utilities. Every non-utilities Retrieve was
//                 therefore searching the WRONG category's list and timing out.
//                 Utilities only ever "worked" because Torn restores it by default.
//                 New armouryGoToSub(): if the target sub-tab is already active,
//                 autofill directly; else CLICK the real tab anchor (verified to
//                 switch categories in-page); only fall back to hash + reload when
//                 the armoury tabs aren't in the DOM at all (cold load DOES honour
//                 the hash — verified landing on Armor p2 with the helmet present).
//                 Also: (a) the page sweep now only clicks a VISIBLE next-arrow —
//                 Torn renders a spare hidden .pagination-wrap whose arrow is a
//                 silent no-op that would burn the page budget without advancing;
//                 (b) wireLoanGoButtons now guards against double-binding — it is
//                 called for all of #ocm-root AND again for #ocm-pane-armoury,
//                 which put two listeners on the same button; since the handler
//                 re-arms the intent before consuming it, the second listener
//                 started a SECOND pagination sweep racing the first;
//                 (c) new ocLookupKey() strips diacritics + version suffixes for
//                 the wiki-table lookups — Torn serves "Guardian Ángels" (U+00C1)
//                 where the wiki says "Guardian Angels", so that OC silently showed
//                 no payout chip (verified live: 12 of 13 OCs had chips, that one
//                 didn't). Named distinctly from the nested normOcName() in the
//                 analytics section to avoid shadowing.
// v3.37.0-ui57 — Removed the ui54 memberWithdrewFromArmoury ledger cross-check —
//                 user reported Construction Helmet vanished from Retrievable
//                 entirely after ui54, and it turned out to be a false negative:
//                 the ledger never had a matching "withdrew" record for that
//                 loan (coverage gap, not evidence it wasn't real), so a
//                 CONFIRMED real armory loan (working Retrieve+confirm dialog,
//                 visible in the give-list — see ui56) got hidden. Root issue:
//                 the check was solving a problem that doesn't need solving —
//                 loanedOut's `loaned_to` field comes straight from the
//                 faction's own armory API, already authoritative for "is this
//                 a real faction loan". No secondary signal needed. Retrievable
//                 gating is back to just OC_KNOWN_ITEM_NAMES (wiki allowlist) +
//                 the grenade exclusion.
// v3.37.0-ui56 — CORRECTION + real fix, per user directly finding the item on page
//                 2 of the Armor tab: the ui53/ui54 "Construction Helmet is
//                 personally-equipped, never touches the armory" conclusion was
//                 WRONG — it's a genuine armory item, just on a page my live-test
//                 (and initLoanAutofill's row-finder) never checked. Torn paginates
//                 the item list (50/page, real numbered pages + a next-page arrow —
//                 confirmed live). initLoanAutofill now sweeps up to 8 pages,
//                 clicking the paginator's own "next" control between checks,
//                 before giving up — applies to BOTH failure paths (no rows for
//                 this item id at all, AND rows present but not the target
//                 holder/free-stock instance, since same-item rows can also span
//                 pages). Corrected the now-inaccurate in-code claim about "0 rows
//                 across all 8 sub-tabs". (memberWithdrewFromArmoury, added here,
//                 was removed again in ui57 — see that entry.)
// v3.37.0-ui55 — NEW: 💰 payout-estimate chip on every Crimes-tab OC card, showing
//                 Torn's own published low–high money range for that scenario type
//                 (OC_MONEY_ESTIMATES, sourced directly from wiki.torn.com/wiki/
//                 Organized_Crime_2.0's scenario table — not inferred, not a guess).
//                 Scenarios that pay in items/Xanax/Cesium or chain into another
//                 scenario get a plain-language note instead of a fabricated $
//                 figure. New Config → "OC Card Display" toggle (defaults ON) to
//                 turn the chip off per user request.
// v3.37.0-ui54 — Detect up front whether a held OC item was actually borrowed FROM
//                 THE FACTION, per user's direct ask, instead of a 15s wait ending
//                 in an easy-to-miss 4s toast. memberWithdrewFromArmoury() checks
//                 the ARM armoury activity ledger for a real "loaned/gave X to
//                 Member from the faction armory" record — items satisfying an OC
//                 role via the member's OWN equipped gear (Construction Helmet,
//                 confirmed live) never generate one, so they're excluded from
//                 Retrievable entirely now, not offered as a dead-end Retrieve▸.
//                 Ledger is GM-storage-persisted (populated by armoury News
//                 polling) — an established faction like this one already has it;
//                 a brand-new install would need one Armoury-tab visit first.
// v3.37.0-ui53 — Grenades excluded from Retrievable (user call — cheap, not worth
//                 chasing down). Live-tested Construction Helmet's reported "issue":
//                 confirmed via real clicks across ALL 8 give-capable armory
//                 sub-tabs (not hash-guessing — that was silently unreliable, stayed
//                 on stale tabs) that it has NO row anywhere, despite the API
//                 reporting it on loan to a member. Root cause per the wiki itself:
//                 "Equipped items like Construction Helmet... are also usable in OC"
//                 — a member can satisfy the requirement with their OWN equipped
//                 item, which never touches the faction armory's give/loan system,
//                 so there's nothing on any armoury page to click. Not a bug to fix
//                 (Torn platform behaviour) — initLoanAutofill's "couldn't find"
//                 toast now explains this specifically for retrieve mode instead of
//                 a generic unhelpful message. No console errors either way —
//                 confirmed via live click, waited past the 15s timeout.
// v3.37.0-ui52 — Replaced every inference-based attempt (item category, "was this
//                 item ever an OC requirement somewhere", "does this member hold
//                 a whole kit") with a DEFINITIVE, wiki-sourced allowlist.
//                 wiki.torn.com/wiki/Organized_Crime_2.0 publishes the complete
//                 table of all 30 scenarios' item requirements — OC_KNOWN_ITEM_NAMES
//                 is that exact list (~55 items), isKnownOcItem() gates the
//                 Retrievable holding-scan directly by item NAME. Confirms
//                 Construction Helmet and China Lake (a weapon, Hostile Takeover)
//                 ARE genuine OC requirements despite reading as armor/weapons —
//                 which is exactly why no category-based filter could ever be
//                 fully reliable. Deleted the now-unnecessary everRequiredPairs/
//                 hasKit/isConfirmedUtility machinery from ui49-51 — this
//                 replaces all of it with one direct list. Needs updating if Torn
//                 ships a new OC scenario with a new item.
// v3.37.0-ui51 — ACTUAL bug found (not another heuristic): ui49/ui50's checks were
//                 gated behind `catOfItemType(itemTypes[id]) === 'utilities'`, and
//                 catOfItemType() defaults UNKNOWN types to 'utilities' (a safe
//                 fallback for URL routing elsewhere, wrong here). itemTypes only
//                 resolves for items fetchAll's itemIds saw — ACTIVE OCs' live
//                 window — but everRequiredPairs scans the full archive-merged
//                 crimes, so anything referenced only by a COMPLETED/archived OC
//                 (Combat Helmet, AK-47, Riot gear, Pepper Spray, war-loadout gear
//                 generally — 147 items live-tested) had an unresolved type and
//                 silently skipped BOTH the history check and the kit check
//                 entirely. New isConfirmedUtility(id) requires an ACTUAL resolved
//                 type, never assumes on absence — unresolved-type items now go
//                 through the same strict checks as any other non-utility item.
// v3.37.0-ui50 — ui49's per-member "ever required this exact item" check still let
//                 through people wearing a full personal combat kit (a member can
//                 legitimately have once held a role needing an item, yet also just
//                 be geared up for themselves now). New rule: 2+ DISTINCT non-
//                 utility items held by the same member = a coordinated loadout,
//                 not a stray OC loan (a real stale OC loan is always ONE isolated
//                 item) — skip retrieval suggestions entirely for that member's
//                 armor/weapons. Utilities unaffected.
// v3.37.0-ui49 — ui48 dropped non-utilities entirely from Retrievable (too blunt —
//                 user wanted it determined, not just excluded). New signal:
//                 everRequiredPairs scans EVERY OC (active + completed, full
//                 archive-merged crimes) for (member, item) pairs where that
//                 SPECIFIC member held a role that required that EXACT item —
//                 not just "some OC somewhere needs this item type". A held
//                 armor/weapon item only becomes a Retrievable candidate if the
//                 holder themselves has ever actually been assigned a role
//                 needing it; otherwise it's indistinguishable from personal/
//                 general-defense gear and is skipped. Utilities unaffected
//                 (kept its original per-current-role check — already reliable).
//                 Confirmed against a concrete case: member in an OC needing
//                 Tunneling Virus, personally holding Flexible Body Armor
//                 unrelated to any role they've held → correctly NOT flagged.
// v3.37.0-ui48 — ui46's "filter to OC-referenced item ids" wasn't enough: live-
//                 tested and Flexible Body Armor is BOTH an OC requirement AND
//                 this faction's general defense armor, so 16 false positives
//                 remained (same item, different reason for holding it — the
//                 filter can't tell those apart, item-id alone isn't a strong
//                 enough signal). Fix: non-utilities categories no longer feed
//                 the "Retrievable" heuristic AT ALL — only armory[id] stock
//                 merges in now (keeps Give▸/Buy▸ state accurate). "Loans to
//                 Hand Out" is unaffected — that list was always precise
//                 (a real filled slot missing its exact item), never sourced
//                 from this loose holding-scan.
// v3.37.0-ui47 — Native-page loans card: ✕ now COLLAPSES the list (header stays,
//                 body rolls up, ▾/▸ toggle) instead of fully hiding the card —
//                 was previously gone until the next hashchange re-render.
// v3.37.0-ui46 — Scope armor/weapon loan tracking to OC items ONLY. ui45 fetched
//                 whole-category loan data (e.g. every Flexible Body Armor on loan
//                 faction-wide, 163 of them here) and flagged all of it as
//                 "retrievable" — but factions loan out combat armor for general
//                 defense/wars too, nothing to do with OCs. Non-utilities category
//                 loans are now filtered to only items an active OC actually
//                 requires (fetchAll's itemIds set) before merging into loanedOut,
//                 so unrelated faction-wide gear never shows up. Utilities was left
//                 unfiltered (unchanged) since it's near-exclusively OC gear already.
// v3.37.0-ui45 — Armor/weapon loans + same-tab Give/Retrieve + native-page loan list.
//                 Loan tracking previously read ONLY the utilities armory selection,
//                 so an OC role requiring e.g. a Construction Helmet (Armor category)
//                 was invisible to stock/shortfall math. fetchAll() now resolves each
//                 required item's category from /torn/items `type` and fetches
//                 whichever of armor/weapons/temporary/medical/drugs/boosters are
//                 actually needed (ARMORY_CATS map + catOfItemType()) — utilities-only
//                 factions still make one call, same as before.
//                 Give ▸ / Retrieve ▸ no longer open a new tab (target=_blank) and no
//                 longer hardcode sub=utilities — wireLoanGoButtons() records the
//                 intent and navigates the SAME tab to the item's real sub-tab
//                 (confirmed live: weapons/armour/temporary/medical/consumables/
//                 drugs/boosters/utilities), or runs the autofill immediately if
//                 already there.
//                 NEW: a "who needs a loan" card now injects at the top of Torn's own
//                 native armory give page (any category), reading a small snapshot
//                 persisted to GM storage whenever the Crimes tab computes the
//                 worklist — so it's visible even landing on the armory page directly.
//                 Also fixed: the 60s auto-refresh could crash with null-reference
//                 errors (renderDashboard/renderMemberDashboard/loadData) if Torn's
//                 own SPA router swapped the Crimes tab's DOM out from under an
//                 in-flight refresh — all four now re-check #ocm-root before writing.
// v3.37.0-ui37 ? Member profiles now foreground cumulative work: cards/detail show
//                 actions and distinct item types, not a distracting last-activity time.
// v3.37.0-ui36 ? Armoury logistics pass: Loans moves out of People into Armoury,
//                 with urgent hand-outs, in-stock/buy state, retrievable items, and
//                 copy-for-chat. PFPs now use a visible initials fallback, refresh a
//                 stale cache weekly, recover from failed image URLs, and fetch in a
//                 four-request pool instead of a slow serial chain.
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
  // Shared Torn keys stay in this script's private scope; legacy keys remain fallback.
  let hubSharedTornKey = null;
  function hubEffectiveTornKey() { return hubSharedTornKey || GM_getValue(GMK.API_KEY, ''); }
  function hubStoreSharedTornKey(value) { hubSharedTornKey = typeof value === 'string' && /^[a-zA-Z0-9]{16}$/.test(value) ? value : null; }


  // ─── DUPLICATE GUARD ─────────────────────────────────────────────────────────
  if (window._ocmLoaded) return;
  window._ocmLoaded = true;

  // ─── CONFIG ──────────────────────────────────────────────────────────────────
  const API_BASE      = 'https://api.torn.com/v2';
  const API_BASE_V1   = 'https://api.torn.com';
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
    CRIME_DIFF:  'ocs_crime_diff',       // persisted crime→difficulty map so historical crimes still sort by level
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
    LOAN_SNAPSHOT: 'ocs_loan_snapshot', // {loans, returnable, itemTypes, ts} — lets the
                                          // native armory page show the worklist even
                                          // when landed on directly, without the Crimes
                                          // tab (where the live data is computed) open.
    SHOW_MONEY_EST: 'ocs_show_money_est', // Show the 💰 payout-estimate chip on OC cards.
  };

  /**
   * Hybrid large-data store for desktop userscript managers and Torn PDA.
   *
   * Torn PDA's GM compatibility functions use the page's shared localStorage.
   * The separate PDA_storage bridge is SQLite-backed and intended for sizeable
   * per-script data. This adapter keeps the engine's synchronous read surface by
   * hydrating native values into memory once, then coalescing writes through
   * setMany(). Small settings and secrets continue to use GM storage directly.
   */
  function createOcBulkStore(env = globalThis, options = {}) {
    const getFallback = options.getFallback || ((key, def) => {
      try { return typeof GM_getValue === 'function' ? GM_getValue(key, def) : def; }
      catch (_) { return def; }
    });
    const setFallback = options.setFallback || ((key, value) => {
      try { if (typeof GM_setValue === 'function') GM_setValue(key, value); } catch (_) {}
    });
    const deleteFallback = options.deleteFallback || ((key) => {
      try {
        if (typeof GM_deleteValue === 'function') GM_deleteValue(key);
        else if (typeof GM_setValue === 'function') GM_setValue(key, '');
      } catch (_) {}
    });
    const debounceMs = Math.max(0, Number(options.debounceMs ?? 250) || 0);
    const nativeApi = env && env.PDA_storage;
    const nativeCapable = !!(
      nativeApi &&
      typeof nativeApi.getMany === 'function' &&
      typeof nativeApi.setMany === 'function' &&
      typeof nativeApi.delete === 'function'
    );
    const values = new Map();
    const pending = new Map();
    const knownKeys = new Set();
    let nativeEnabled = false;
    let hydrated = false;
    let flushTimer = null;
    let migrations = 0;
    let lastError = '';
    let usedBytes = null;
    let quotaBytes = null;

    const errorCode = error => String(error?.code || error?.name || 'StorageError');

    function snapshot() {
      return {
        mode: nativeEnabled ? 'pda-native' : 'gm-fallback',
        hydrated,
        keys: knownKeys.size,
        pending: pending.size,
        migrations,
        lastError,
        usedBytes,
        quotaBytes,
      };
    }

    async function init(keys = []) {
      for (const key of keys) if (key) knownKeys.add(String(key));
      if (!nativeCapable) { hydrated = true; return snapshot(); }

      nativeEnabled = true;
      try {
        const keyList = [...knownKeys];
        const loaded = keyList.length ? await nativeApi.getMany(keyList) : {};
        const migrate = {};
        for (const key of keyList) {
          const nativeValue = loaded && loaded[key];
          if (nativeValue !== null && nativeValue !== undefined) {
            values.set(key, nativeValue);
            continue;
          }
          const legacyValue = getFallback(key, null);
          if (legacyValue !== null && legacyValue !== undefined && legacyValue !== '') {
            values.set(key, legacyValue);
            migrate[key] = legacyValue;
          }
        }
        if (Object.keys(migrate).length) {
          await nativeApi.setMany(migrate);
          migrations += Object.keys(migrate).length;
        }
        if (typeof nativeApi.usage === 'function') await usage();
        lastError = '';
      } catch (error) {
        // A bridge/read failure must not strand the suite. Keep all reads and
        // writes on the proven GM path for this page lifetime.
        nativeEnabled = false;
        values.clear();
        lastError = errorCode(error);
      } finally {
        hydrated = true;
      }
      return snapshot();
    }

    function getRaw(key, fallback = '') {
      key = String(key);
      if (nativeEnabled && hydrated && values.has(key)) return values.get(key);
      return getFallback(key, fallback);
    }

    function scheduleFlush() {
      if (flushTimer !== null || !nativeEnabled || !hydrated) return;
      flushTimer = setTimeout(() => {
        flushTimer = null;
        void flush();
      }, debounceMs);
    }

    function setRaw(key, value) {
      key = String(key);
      knownKeys.add(key);
      if (!nativeEnabled || !hydrated) {
        setFallback(key, value);
        return;
      }
      values.set(key, value);
      pending.set(key, value);
      scheduleFlush();
    }

    async function flush() {
      if (flushTimer !== null) { clearTimeout(flushTimer); flushTimer = null; }
      if (!nativeEnabled || !hydrated || pending.size === 0) return snapshot();
      const batch = Object.fromEntries(pending);
      try {
        await nativeApi.setMany(batch);
        for (const [key, value] of Object.entries(batch)) {
          if (pending.get(key) === value) pending.delete(key);
        }
        lastError = '';
      } catch (error) {
        lastError = errorCode(error);
        // Preserve a recoverable copy if native quota/bridge writes fail. The
        // in-memory value remains authoritative for the current page.
        for (const [key, value] of Object.entries(batch)) setFallback(key, value);
        pending.clear();
      }
      return snapshot();
    }

    async function remove(key) {
      key = String(key);
      values.delete(key);
      pending.delete(key);
      deleteFallback(key);
      if (!nativeEnabled || !hydrated) return;
      try { await nativeApi.delete(key); lastError = ''; }
      catch (error) { lastError = errorCode(error); }
    }

    async function usage() {
      if (!nativeEnabled || typeof nativeApi.usage !== 'function') return null;
      try {
        const result = await nativeApi.usage();
        usedBytes = Number.isFinite(Number(result?.used)) ? Number(result.used) : null;
        quotaBytes = Number.isFinite(Number(result?.quota)) ? Number(result.quota) : null;
        return result;
      }
      catch (error) { lastError = errorCode(error); return null; }
    }

    return { init, getRaw, setRaw, delete: remove, flush, usage, snapshot };
  }

  const OCBulkStore = createOcBulkStore(globalThis);
  const OC_BULK_KEYS = [
    GMK.OC_ARCHIVE,
    GMK.OC_ARCHIVE_META,
    GMK.PROFIT_LEDGER,
    GMK.PAYOUT_LEDGER,
    GMK.PAYOUT_EVENTS,
    GMK.CPR_ARCHIVE,
    GMK.TS_CPR_CACHE,
  ];
  const _ocBulkReady = OCBulkStore.init(OC_BULK_KEYS).catch(error => {
    console.warn('[OC Suite] PDA bulk storage initialization failed; using GM fallback.', error);
  });
  window.addEventListener('pagehide', () => { void OCBulkStore.flush(); }, { passive: true });

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
    try { return JSON.parse(OCBulkStore.getRaw(PROFIT_STORE_KEY, '{}')) || {}; }
    catch (_) { return {}; }
  }
  function saveProfitLedger(ledger) {
    try { OCBulkStore.setRaw(PROFIT_STORE_KEY, JSON.stringify(ledger)); } catch (_) {}
  }

  /** Payout tracking. OC cash lands in the faction wallet; paying members is a
   *  manual in-game action Torn's API can't see, so "paid" is a leader-set flag.
   *  Shape: { [ocId]: { paid: true, ts: unixSeconds } } */
  const PAYOUT_STORE_KEY = GMK.PAYOUT_LEDGER;
  function loadPayouts() {
    try { return JSON.parse(OCBulkStore.getRaw(PAYOUT_STORE_KEY, '{}')) || {}; } catch (_) { return {}; }
  }
  function savePayouts(p) {
    try { OCBulkStore.setRaw(PAYOUT_STORE_KEY, JSON.stringify(p)); } catch (_) {}
  }

  /** Persistent store of faction "give funds" events parsed from the faction news
   *  log (cat=giveFunds). Stored forever, keyed by news id, so payout history
   *  survives the news feed scrolling off. Shape:
   *  { [newsId]: { ts, fromId, fromName, toId, toName, amount } } */
  const PAYOUT_EVENTS_KEY = GMK.PAYOUT_EVENTS;
  function loadPayoutEvents() {
    try { return JSON.parse(OCBulkStore.getRaw(PAYOUT_EVENTS_KEY, '{}')) || {}; } catch (_) { return {}; }
  }
  function savePayoutEvents(ev) {
    try { OCBulkStore.setRaw(PAYOUT_EVENTS_KEY, JSON.stringify(ev)); } catch (_) {}
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
    try { return JSON.parse(OCBulkStore.getRaw(CPR_ARCHIVE_KEY, '{}')) || {}; }
    catch (_) { return {}; }
  }
  function saveCprArchive(arc) {
    try { OCBulkStore.setRaw(CPR_ARCHIVE_KEY, JSON.stringify(arc)); } catch (_) {}
    _cprArcCache = arc;   // keep the read cache in step
  }

  /** Cached archive accessor — tsGetCpr is called once per slot, so re-parsing the
   *  stored JSON on every call would be needless work. */
  let _cprArcCache = null;
  function cprArchive() {
    if (!_cprArcCache) _cprArcCache = loadCprArchive();
    return _cprArcCache;
  }

  /** Roster maps the TornStats→archive backfill needs, stashed on each render.
   *  They're built inside renderDashboard, but the Config panel's "Rebuild CPR
   *  cache" button lives outside that scope and needs them too. */
  let _cprBackfillCtx = null;

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
  let _tsCacheRevision = 0;
  let _tsLastFailAt    = 0;

  // Load cached TS CPR data immediately so it's available on first render
  try {
    const cached = JSON.parse(OCBulkStore.getRaw(GMK.TS_CPR_CACHE, '{}'));
    if (cached.ts && (Date.now() - cached.ts < TS_CACHE_TTL) && cached.data) {
      tsCprData = cached.data;
    }
  } catch(_) {}

  function saveTsCprCache(data) {
    _tsCacheRevision += 1;
    tsCprData = data;
    OCBulkStore.setRaw(GMK.TS_CPR_CACHE, JSON.stringify({ ts: Date.now(), data }));
  }

  function isTsCprCacheFresh() {
    try {
      const cached = JSON.parse(OCBulkStore.getRaw(GMK.TS_CPR_CACHE, '{}'));
      return cached.ts && (Date.now() - cached.ts < TS_CACHE_TTL);
    } catch(_) { return false; }
  }

  // Reference to GM.xmlHttpRequest — the @grant GM.xmlHttpRequest makes this
  // available via the GM object even when GM_xmlHttpRequest is not directly accessible.
  const _gmXhrFn = (typeof GM_xmlHttpRequest === 'function' ? GM_xmlHttpRequest : null)
                || (typeof GM !== 'undefined' && typeof GM.xmlHttpRequest === 'function'
                    ? GM.xmlHttpRequest.bind(GM) : null);

  // Read-only, bounded diagnostics. This intentionally stores module/status/time
  // only: URLs, query strings, response bodies, and credentials never enter it.
  const _ocmDiagnostics = {
    startedAt: Date.now(),
    totals: { total: 0, ok: 0, error: 0, timeout: 0 },
    recent: [],
  };

  function _ocmDiagRecord(module, status, ms, detail = '') {
    const key = status === 'ok' ? 'ok' : status === 'timeout' ? 'timeout' : 'error';
    _ocmDiagnostics.totals.total++;
    _ocmDiagnostics.totals[key]++;
    _ocmDiagnostics.recent.push({
      module: String(module).slice(0, 32),
      status: String(status).slice(0, 16),
      ms: Math.max(0, Math.round(Number(ms) || 0)),
      detail: String(detail || '').replace(/[^a-zA-Z0-9 .:_-]/g, '').slice(0, 64),
      at: new Date().toISOString(),
    });
    if (_ocmDiagnostics.recent.length > 12) _ocmDiagnostics.recent.shift();
  }

  function _ocmDiagMemory() {
    const memory = typeof performance !== 'undefined' ? performance.memory : null;
    if (!memory || !Number.isFinite(memory.usedJSHeapSize)) return { supported: false };
    const used = memory.usedJSHeapSize;
    const limit = Number.isFinite(memory.jsHeapSizeLimit) ? memory.jsHeapSizeLimit : null;
    return {
      supported: true,
      usedBytes: used,
      limitBytes: limit,
      percent: limit ? Math.round((used / limit) * 100) : null,
    };
  }

  function _ocmDiagSnapshot() {
    const root = document.getElementById('ocm-root');
    const timers = {
      countdown: !!window._ocmTimer,
      refresh: !!window._ocmRefresh,
      sidebar: !!window._ocmSidebarTimer,
      inject: !!_ocmInjectObserver,
    };
    return {
      generatedAt: new Date().toISOString(),
      scriptVersion: SCRIPT_VERSION,
      uptimeMs: Math.max(0, Date.now() - _ocmDiagnostics.startedAt),
      route: location.pathname + (location.hash ? location.hash.split('?')[0] : ''),
      rootConnected: !!root?.isConnected,
      dom: {
        documentNodes: document.getElementsByTagName('*').length,
        suiteNodes: root ? root.getElementsByTagName('*').length + 1 : 0,
      },
      timers,
      api: {
        ..._ocmDiagnostics.totals,
        recent: _ocmDiagnostics.recent.slice(),
      },
      memory: _ocmDiagMemory(),
      storage: OCBulkStore.snapshot(),
    };
  }

  function _ocmDiagReport() {
    // Keep this allow-list explicit so future diagnostics additions cannot
    // accidentally serialize config values or request details.
    const s = _ocmDiagSnapshot();
    return JSON.stringify({
      generatedAt: s.generatedAt,
      scriptVersion: s.scriptVersion,
      uptimeMs: s.uptimeMs,
      route: s.route,
      rootConnected: s.rootConnected,
      dom: s.dom,
      timers: s.timers,
      api: s.api,
      memory: s.memory,
      storage: s.storage,
    }, null, 2);
  }

  /** Promise wrapper around GM_xmlHttpRequest.
   *
   *  Used for EVERY cross-origin GET, Torn API included. api.torn.com is a
   *  different origin from www.torn.com, so plain fetch() is a CORS request and
   *  dies the moment Torn stops sending Access-Control-Allow-Origin (which is
   *  exactly what happened). GM_xmlHttpRequest is not bound by CORS, and the
   *  script already declares @connect api.torn.com, so this is the correct
   *  transport — it's also what every other Torn userscript uses. */
  function gmFetch(url) {
    const started = Date.now();
    return new Promise((resolve, reject) => {
      if (!_gmXhrFn) {
        _ocmDiagRecord('Torn API', 'error', Date.now() - started, 'GM transport unavailable');
        reject(new Error('GM_xmlHttpRequest not available')); return;
      }
      _gmXhrFn({
        method: 'GET', url, timeout: 20000,
        onload(r) {
          if (r.status < 200 || r.status >= 300) {
            _ocmDiagRecord('Torn API', 'error', Date.now() - started, `HTTP ${r.status}`);
            reject(new Error(`HTTP ${r.status}`)); return;
          }
          try {
            const data = JSON.parse(r.responseText);
            _ocmDiagRecord('Torn API', 'ok', Date.now() - started, 'response received');
            resolve(data);
          } catch (e) {
            _ocmDiagRecord('Torn API', 'error', Date.now() - started, 'invalid JSON');
            reject(e);
          }
        },
        onerror() { _ocmDiagRecord('Torn API', 'error', Date.now() - started, 'network error'); reject(new Error('Network error')); },
        ontimeout() { _ocmDiagRecord('Torn API', 'timeout', Date.now() - started, 'request timed out'); reject(new Error('Network request timed out')); },
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
    .ocm-diag-actions { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
    .ocm-diag-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:7px; margin-top:9px; }
    .ocm-diag-card { min-width:0; padding:8px; border:1px solid var(--ocm-border-soft); border-radius:5px; background:var(--ocm-bg-card); }
    .ocm-diag-card b { display:block; color:var(--ocm-text); font-size:12px; overflow-wrap:anywhere; }
    .ocm-diag-card span { display:block; color:var(--ocm-text-muted); font-size:10px; margin-top:3px; }
    .ocm-diag-muted { color:var(--ocm-text-muted); font-size:10px; line-height:1.45; }
    .ocm-diag-warning { color:var(--ocm-cpr-warn); }
    .ocm-diag-critical { color:var(--ocm-cpr-crit); }
    .ocm-diag-list { margin:9px 0 0; padding:0; list-style:none; color:var(--ocm-text-muted); font-size:10px; line-height:1.55; }
    .ocm-diag-list li { display:flex; justify-content:space-between; gap:8px; border-top:1px solid var(--ocm-border-soft); padding:4px 0; }
    .ocm-diag-list code { color:var(--ocm-text-card); overflow-wrap:anywhere; text-align:right; }
    @media (max-width:520px) { .ocm-diag-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }

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
    .ocm-stat-pill {
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

    /* Premium: the whole stats bar reads as ONE grouped strip (divider-separated),
       not six loose boxes — matches the overview strips elsewhere. */
    #ocm-root.ocm-ui2 #ocm-stats-bar {
      background: linear-gradient(180deg, #0f1728, #0c1322);
      border: 1px solid var(--ocm-border); border-radius: 10px;
      padding: 12px 6px; margin-bottom: 10px;
    }
    #ocm-root.ocm-ui2 #ocm-stats-bar .ocm-stats-row { display: flex; flex-wrap: wrap; gap: 0; margin: 0; }
    #ocm-root.ocm-ui2 #ocm-stats-bar .ocm-stat {
      background: none; border: none; border-radius: 0;
      padding: 2px 16px; flex: 1 1 auto; min-width: 82px;
      border-left: 1px solid var(--ocm-border-soft);
    }
    #ocm-root.ocm-ui2 #ocm-stats-bar .ocm-stat:first-child { border-left: none; }
    #ocm-root.ocm-ui2 #ocm-stats-bar .ocm-stats-row-recruiting {
      background: none; border: none; border-radius: 0;
      border-top: 1px solid var(--ocm-border-soft);
      margin: 10px 0 0; padding: 10px 16px 0;
    }

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
    /* A second section inside the same card needs air above it, or the previous
       table's last row collides with the next blue header. */
    .ocm-section-title + * { margin-top: 0; }
    * + .ocm-section-title { margin-top: 18px; }

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
    /* NOTE: a superseded second .ocm-section-title::after block used to live here
       (content down-triangle, margin-left:8px, no auto). Being later in source it
       silently won the cascade over the redesigned rule ~line 2222 and killed the
       caret right-alignment (margin-left:auto), jamming it mid-header. Removed in
       ui43. See AI Brain OC Suite note: duplicate CSS selectors are a recurring
       hazard (last rule wins). */

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
       layouts (row-grids, table wrappers) handle their own. */
    #ocm-available > *,
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
    .oc2-chip.is-money      { background: #241f14; color: var(--ocm-cpr-warn); text-transform: none; letter-spacing: 0; }

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
    .ocm-stuck-card-title, .ocm-stuck-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 10px 2px;
      gap: 8px;
    }
    .ocm-stuck-card-title strong {
      color: var(--ocm-text);
      font-size: 13px;
      font-weight: bold;
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
    /* Profile links keep the theme colour whether or not the profile has been visited
       (otherwise the browser paints visited links its default muddy purple). */
    .ocm-members-table a, .ocm-members-table a:visited,
    .ocm-mh-table a, .ocm-mh-table a:visited,
    .ocm-analytics-table a, .ocm-analytics-table a:visited { color: var(--ocm-link); text-decoration: none; }
    .ocm-members-table a:hover, .ocm-mh-table a:hover, .ocm-analytics-table a:hover { text-decoration: underline; }
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
    /* Column header row for the Optimize lists — same grid as .ocm-lowcpr-row */
    .ocm-lowcpr-head {
      display: grid;
      grid-template-columns: minmax(80px, 1fr) minmax(0, 1.5fr) minmax(60px, 0.8fr) auto auto;
      gap: 8px;
      padding: 5px 12px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: .05em;
      font-weight: 700;
      color: var(--ocm-text-muted);
      border-bottom: 1px solid var(--ocm-border);
    }
    .ocm-lowcpr-head .r { text-align: right; }
    #ocm-lowcpr .ocm-lowcpr-mobile-label { display: none; }

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
      #ocm-root.ocm-ui2 .ocm-cons-toolbar .ocm-cons-search {flex:1 1 100%;width:100%}
      #ocm-root.ocm-ui2 .ocm-cons-mix-track i,#ocm-root.ocm-ui2 .ocm-cons-trend-bar i {min-width:0}
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

    /* ─── Crimes tab content, mapped onto the kit look (scoped overrides only) ─── */
    #ocm-root.ocm-classic .ocm-workspace-intro { margin:0 0 12px; padding:0 0 12px; border-bottom:1px solid var(--ocm-border-soft); }
    #ocm-root.ocm-classic .ocm-workspace-intro h3 { margin:0 0 4px; color:var(--ocm-text); font-size:17px; font-weight:700; }
    #ocm-root.ocm-classic .ocm-workspace-intro p,
    #ocm-root.ocm-classic .ocm-workspace-context p { margin:0; color:var(--ocm-text-dim); font-size:12px; line-height:1.6; }
    #ocm-root.ocm-classic .ocm-workspace-context { display:flex; align-items:center; flex-wrap:wrap; gap:12px; margin:0 0 16px; padding:12px; border-left:3px solid var(--ocm-link); background:var(--ocm-bg-card); }
    #ocm-root.ocm-classic .ocm-workspace-context p { flex:1 1 240px; }
    #ocm-root.ocm-classic .ocm-workspace-context strong { color:var(--ocm-text); }
    #ocm-root.ocm-classic .ocm-workspace-links { display:flex; flex-wrap:wrap; gap:8px; }
    #ocm-root.ocm-classic .ocm-workspace-links button { min-height:36px; padding:6px 10px; border:1px solid var(--ocm-border); border-radius:6px; background:var(--ocm-bg); color:var(--ocm-link); cursor:pointer; font:inherit; }
    #ocm-root.ocm-classic .ocm-workspace-links button:focus-visible { outline:2px solid var(--ocm-link); outline-offset:2px; }
    #ocm-root.ocm-classic .ocm-workspace-caption { margin:0 0 8px; font-size:11px; color:var(--ocm-text-dim); font-weight:700; }
    #ocm-root.ocm-classic #ocm-pane-crimes #ocm-stats-bar { margin-bottom:16px; }
    #ocm-root.ocm-classic #ocm-pane-crimes .ocm-oc-grid { gap:12px; }
    #ocm-root.ocm-classic #ocm-pane-crimes .ocm-section-title { margin-top:16px; margin-bottom:8px; }
    #ocm-root.ocm-classic #ocm-next-banner:empty { display:none; }
    #ocm-root.ocm-classic .ocm-workspace-intro[hidden],
    #ocm-root.ocm-classic .ocm-workspace-context[hidden] { display:none !important; }
    @media(max-width:620px) {
      #ocm-root.ocm-classic .ocm-workspace-context { padding:10px; gap:8px; }
      #ocm-root.ocm-classic .ocm-workspace-links { width:100%; }
      #ocm-root.ocm-classic .ocm-workspace-links button { min-height:44px; flex:1 1 auto; }
      #ocm-root.ocm-classic #ocm-pane-crimes .ocm-subtab { min-height:44px; display:flex; align-items:center; }
      #ocm-root.ocm-classic #ocm-pane-crimes .ocm-phase-header { min-height:44px; }
    }
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
    #ocm-root.ocm-ui2 .ocm-subtab.active { color: var(--ocm-fb-br); }
    #ocm-root.ocm-ui2 .ocm-members-table th,
    #ocm-root.ocm-ui2 .ocm-mh-table th,
    #ocm-root.ocm-ui2 .ocm-analytics-table th { background: rgba(0,0,0,.22); }
    #ocm-root.ocm-ui2 #ocm-refresh-btn:hover,
    #ocm-root.ocm-ui2 #ocm-rail-foot button:hover { color: var(--ocm-fb-br); border-color: var(--ocm-fb); }
    /* ── Config panel — premium (Frostbite) theming so every section matches the navy cards ── */
    #ocm-root.ocm-ui2 #ocm-config-panel {
      background: linear-gradient(180deg, #0f1728, #0c1322);
      border-bottom-color: var(--ocm-border);
      max-height: 72vh; overflow-y: auto;
    }
    #ocm-root.ocm-ui2 .ocm-cfg-section { border-bottom-color: rgba(61,184,245,.12); }
    #ocm-root.ocm-ui2 #ocm-config-panel input:not([type=color]),
    #ocm-root.ocm-ui2 #ocm-config-panel select {
      background: #0b1322 !important; border: 1px solid #223a58 !important;
      border-radius: 8px !important; color: var(--ocm-text) !important;
    }
    #ocm-root.ocm-ui2 #ocm-config-panel input:not([type=color]):focus,
    #ocm-root.ocm-ui2 #ocm-config-panel select:focus {
      border-color: var(--ocm-fb) !important; box-shadow: 0 0 0 2px rgba(61,184,245,.15) !important; outline: none;
    }
    #ocm-root.ocm-ui2 #ocm-theme-customize-btn { background: #0b1322 !important; border: 1px solid #223a58 !important; color: var(--ocm-fb-br) !important; }
    /* sticky header + close so the panel can always be shut, even scrolled down */
    #ocm-config-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 14px; border-bottom: 1px solid rgba(61,184,245,.18);
      position: sticky; top: 0; z-index: 3;
      background: linear-gradient(180deg, #10203a, #0c1626);
    }
    #ocm-config-head span { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--ocm-fb-br); }
    #ocm-config-close {
      background: transparent; border: 1px solid var(--ocm-border-soft); color: var(--ocm-text-dim);
      border-radius: 7px; width: 28px; height: 28px; font-size: 18px; line-height: 1; cursor: pointer;
    }
    #ocm-config-close:hover { color: var(--ocm-fb-br); border-color: var(--ocm-fb); }

    /* ═══════════ CLASSIC 3.36 SHELL ADAPTER — complete engine, compact shell ═══════════ */
    #ocm-root.ocm-ui2.ocm-classic {
      display: block;
      min-height: 0;
      max-height: none;
      padding: 16px;
      overflow: visible;
      background: var(--ocm-bg);
      border: 1px solid var(--ocm-border);
      border-radius: 8px;
      box-shadow: none;
    }

    #ocm-root.ocm-ui2.ocm-classic #ocm-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 0 16px;
      margin: 0;
      background: none;
      border: 0;
    }
    #ocm-root.ocm-ui2.ocm-classic #ocm-header h2 {
      margin: 0;
      color: var(--ocm-text);
      font-size: 19px;
      font-weight: 700;
      letter-spacing: 0;
      text-transform: none;
    }
    #ocm-root.ocm-ui2.ocm-classic #ocm-header .ocm-ver {
      color: var(--ocm-text-faint);
      font-size: 10px;
    }
    #ocm-root.ocm-ui2.ocm-classic #ocm-header .ocm-hdr-gap { flex: 1; }
    #ocm-root.ocm-ui2.ocm-classic #ocm-header small {
      color: var(--ocm-text-muted);
      font-size: 11px;
    }
    #ocm-root.ocm-ui2.ocm-classic #ocm-header button {
      padding: 5px 11px;
      color: var(--ocm-text-muted);
      font: 11px/1.35 inherit;
      cursor: pointer;
      background: none;
      border: 1px solid var(--ocm-border);
      border-radius: 6px;
      box-shadow: none;
      transition: color .15s, border-color .15s, background .15s;
    }
    #ocm-root.ocm-ui2.ocm-classic #ocm-header button:hover,
    #ocm-root.ocm-ui2.ocm-classic #ocm-header button:focus-visible {
      color: var(--ocm-link);
      background: var(--ocm-bg-hover);
      border-color: var(--ocm-link);
      outline: none;
    }

    #ocm-root.ocm-ui2.ocm-classic #ocm-tabs {
      display: flex;
      flex-direction: row;
      flex-wrap: nowrap;
      gap: 4px;
      padding: 0;
      margin: 0 0 16px;
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-width: thin;
      background: none;
      border: 0;
      border-bottom: 1px solid var(--ocm-border);
    }
    #ocm-root.ocm-ui2.ocm-classic .ocm-nav {
      position: relative;
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      gap: 5px;
      min-height: 0;
      box-sizing: border-box;
      padding: 9px 13px;
      margin: 0 0 -1px;
      color: var(--ocm-text-muted);
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
      cursor: pointer;
      background: none;
      border: 0;
      border-bottom: 2px solid transparent;
      border-radius: 0;
      box-shadow: none;
    }
    #ocm-root.ocm-ui2.ocm-classic .ocm-nav:hover,
    #ocm-root.ocm-ui2.ocm-classic .ocm-nav:focus-visible {
      color: var(--ocm-text);
      background: var(--ocm-bg-hover);
      outline: none;
      transform: none;
    }
    #ocm-root.ocm-ui2.ocm-classic .ocm-nav.active {
      color: var(--ocm-text);
      background: none;
      border-color: transparent;
      border-bottom-color: var(--ocm-link);
      box-shadow: none;
    }
    #ocm-root.ocm-ui2.ocm-classic .ocm-nav.active::before { display: none; }
    #ocm-root.ocm-ui2.ocm-classic .ocm-nav .ocm-nav-i {
      display: inline;
      width: auto;
      color: inherit;
      font-size: 12px;
      text-align: left;
    }
    #ocm-root.ocm-ui2.ocm-classic .ocm-nav .ocm-nav-l {
      flex: none;
      font-size: 12px;
    }
    #ocm-root.ocm-ui2.ocm-classic .ocm-nav .ocm-tab-count {
      min-width: 16px;
      height: 16px;
      padding: 0 4px;
      color: var(--ocm-text-muted);
      font-size: 9px;
      line-height: 16px;
      text-align: center;
      background: var(--ocm-bg-card);
      border: 1px solid var(--ocm-border);
      border-radius: 8px;
    }

    #ocm-root.ocm-ui2.ocm-classic #ocm-body {
      min-width: 0;
      padding: 0;
      overflow: visible;
    }
    #ocm-root.ocm-ui2.ocm-classic #ocm-legend,
    #ocm-root.ocm-ui2.ocm-classic #ocm-config-panel { margin: 0 0 14px; }
    #ocm-root.ocm-ui2.ocm-classic #ocm-config-panel {
      max-height: 72vh;
      overflow-y: auto;
      background: var(--ocm-bg-card);
      border: 1px solid var(--ocm-border);
      border-radius: 6px;
      box-shadow: none;
    }
    #ocm-root.ocm-ui2.ocm-classic #ocm-config-head {
      background: var(--ocm-bg-card);
      border-bottom: 1px solid var(--ocm-border);
      box-shadow: none;
    }
    #ocm-root.ocm-ui2.ocm-classic #ocm-config-head span {
      color: var(--ocm-link);
      text-shadow: none;
    }
    #ocm-root.ocm-ui2.ocm-classic #ocm-config-close {
      color: var(--ocm-text-muted);
      background: none;
      border-color: var(--ocm-border);
      box-shadow: none;
    }
    #ocm-root.ocm-ui2.ocm-classic #ocm-config-close:hover,
    #ocm-root.ocm-ui2.ocm-classic #ocm-config-close:focus-visible {
      color: var(--ocm-link);
      border-color: var(--ocm-link);
    }
    #ocm-root.ocm-ui2.ocm-classic #ocm-config-panel input:not([type=color]),
    #ocm-root.ocm-ui2.ocm-classic #ocm-config-panel select {
      color: var(--ocm-text) !important;
      background: #222 !important;
      border: 1px solid var(--ocm-border) !important;
      border-radius: 4px !important;
      box-shadow: none !important;
    }
    #ocm-root.ocm-ui2.ocm-classic #ocm-config-panel input:not([type=color]):focus,
    #ocm-root.ocm-ui2.ocm-classic #ocm-config-panel select:focus {
      background: var(--ocm-bg-hover) !important;
      border-color: var(--ocm-link) !important;
      box-shadow: 0 0 0 1px var(--ocm-link) !important;
    }
    #ocm-root.ocm-ui2.ocm-classic #ocm-theme-customize-btn {
      color: var(--ocm-cpr-warn) !important;
      background: none !important;
      border: 1px solid var(--ocm-border) !important;
      border-radius: 4px !important;
      box-shadow: none !important;
    }
    #ocm-root.ocm-ui2.ocm-classic .ocm-cfg-actions {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      padding: 8px 10px 10px;
    }

    #ocm-root.ocm-ui2.ocm-classic .ocm-card,
    #ocm-root.ocm-ui2.ocm-classic .ocm-tile,
    #ocm-root.ocm-ui2.ocm-classic .ocm-stat {
      background: var(--ocm-bg-card);
      border-color: var(--ocm-border);
      border-radius: 8px;
      box-shadow: none;
    }
    #ocm-root.ocm-ui2.ocm-classic .ocm-card:hover,
    #ocm-root.ocm-ui2.ocm-classic .ocm-tile:hover {
      background: var(--ocm-bg-hover);
      border-color: var(--ocm-border);
      box-shadow: none;
      transform: none;
    }
    #ocm-root.ocm-ui2.ocm-classic .ocm-section-title {
      padding-left: 0;
      color: var(--ocm-link);
      background: none;
      border: 0;
      text-shadow: none;
    }
    #ocm-root.ocm-ui2.ocm-classic .ocm-subtabs {
      gap: 6px;
      padding: 0;
      margin: 0 0 14px;
      background: none;
      border: 0;
    }
    #ocm-root.ocm-ui2.ocm-classic .ocm-subtab {
      padding: 6px 11px;
      color: var(--ocm-text-muted);
      background: var(--ocm-bg-card);
      border: 1px solid var(--ocm-border);
      border-radius: 6px;
      box-shadow: none;
    }
    #ocm-root.ocm-ui2.ocm-classic .ocm-subtab:hover,
    #ocm-root.ocm-ui2.ocm-classic .ocm-subtab:focus-visible {
      color: var(--ocm-text);
      border-color: var(--ocm-link);
      transform: none;
    }
    #ocm-root.ocm-ui2.ocm-classic .ocm-subtab.active {
      color: var(--ocm-text);
      background: var(--ocm-bg-hover);
      border-color: var(--ocm-link);
      box-shadow: none;
    }

    #ocm-root.ocm-ui2.ocm-classic #ocm-stats-bar {
      padding: 0;
      margin-bottom: 16px;
      background: none;
      border: 0;
      border-radius: 0;
      box-shadow: none;
    }
    #ocm-root.ocm-ui2.ocm-classic #ocm-stats-bar .ocm-stats-row {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 8px;
      padding: 0;
      margin: 0 0 8px;
    }
    #ocm-root.ocm-ui2.ocm-classic #ocm-stats-bar .ocm-stat {
      display: block;
      min-width: 0;
      padding: 10px 12px;
      border: 1px solid var(--ocm-border);
    }
    #ocm-root.ocm-ui2.ocm-classic #ocm-stats-bar .ocm-stat-label,
    #ocm-root.ocm-ui2.ocm-classic #ocm-stats-bar .ocm-stat-value {
      order: initial;
    }
    #ocm-root.ocm-ui2.ocm-classic #ocm-stats-bar .ocm-stat:first-child {
      border-left: 1px solid var(--ocm-border);
    }
    #ocm-root.ocm-ui2.ocm-classic #ocm-stats-bar .ocm-stats-row-recruiting {
      padding: 8px 12px;
      margin: 0;
      background: var(--ocm-bg-card);
      border: 1px solid var(--ocm-border);
      border-radius: 8px;
    }
    #ocm-root.ocm-ui2.ocm-classic .ocm-feature-placeholder {
      padding: 24px 16px;
      background: var(--ocm-bg-card);
    }
    #ocm-root.ocm-ui2.ocm-classic .ocm-feature-placeholder .ocm-feature-icon {
      font-size: 28px;
      filter: none;
    }
    @media (max-width: 720px) {
      #ocm-root.ocm-ui2.ocm-classic { padding: 12px; }
      #ocm-root.ocm-ui2.ocm-classic #ocm-header {
        flex-wrap: wrap;
        gap: 7px;
        padding-bottom: 12px;
      }
      #ocm-root.ocm-ui2.ocm-classic #ocm-header .ocm-hdr-gap { display: none; }
      #ocm-root.ocm-ui2.ocm-classic #ocm-header small {
        order: 4;
        width: 100%;
      }
      #ocm-root.ocm-ui2.ocm-classic #ocm-tabs {
        flex-wrap: wrap;
        overflow-x: visible;
      }
      #ocm-root.ocm-ui2.ocm-classic .ocm-nav {
        flex: 1 0 calc(33.333% - 4px);
        justify-content: center;
        min-width: 95px;
        min-height: 44px;
        padding: 8px 7px;
      }
      #ocm-root.ocm-ui2.ocm-classic #ocm-stats-bar .ocm-stats-row {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      #ocm-root.ocm-ui2.ocm-classic .ocm-cfg-section {
        padding: 10px;
      }
      #ocm-root.ocm-ui2.ocm-classic .ocm-cfg-label > span {
        display: block;
        margin-top: 4px;
        margin-left: 0 !important;
        line-height: 1.45;
      }
    }
    @media (max-width: 480px) {
      #ocm-root.ocm-ui2.ocm-classic { padding: 10px; }
      #ocm-root.ocm-ui2.ocm-classic .ocm-nav {
        flex: 1 0 calc(33.333% - 6px);
        min-width: 0;
      }
      #ocm-root.ocm-ui2.ocm-classic #ocm-stats-bar .ocm-stats-row {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (max-width: 900px), (pointer: coarse) {
      #ocm-root.ocm-ui2.ocm-classic .ocm-nav,
      #ocm-root.ocm-ui2.ocm-classic #ocm-header button,
      #ocm-root.ocm-ui2.ocm-classic .ocm-subtab,
      #ocm-root.ocm-ui2.ocm-classic .ocm-cfg-btn,
      #ocm-root.ocm-ui2.ocm-classic #ocm-config-panel input:not([type=checkbox]):not([type=radio]):not([type=color]),
      #ocm-root.ocm-ui2.ocm-classic #ocm-config-panel select,
      #ocm-root.ocm-ui2.ocm-classic #ocm-config-close {
        min-height: 44px;
        box-sizing: border-box;
      }
      #ocm-root.ocm-ui2.ocm-classic #ocm-config-close {
        min-width: 44px;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      #ocm-root.ocm-ui2.ocm-classic *,
      #ocm-root.ocm-ui2.ocm-classic *::before,
      #ocm-root.ocm-ui2.ocm-classic *::after {
        scroll-behavior: auto !important;
        transition-duration: .01ms !important;
        animation-duration: .01ms !important;
        animation-iteration-count: 1 !important;
      }
    }
    /* ═══════════ END CLASSIC 3.36 SHELL ADAPTER ═══════════ */
  `);

  // OC MOBILE UI START
// OC mobile reading and refresh state. No network, secrets or game actions.
const OC_MOBILE_CSS = `
#ocm-root .ocm-mobile-nav,#ocm-root .ocm-mobile-subnav{display:none}
#ocm-root .ocm-home-go{font:inherit;background:transparent;border:1px solid var(--ocm-border);border-radius:6px;padding:8px;min-height:44px}
#ocm-root .ocm-home-metrics>summary{cursor:pointer;padding:12px;font-weight:600}
#ocm-root .ocm-record-pager{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 0}
#ocm-root .ocm-record-pager button{min-width:64px;min-height:44px;font:inherit}
#ocm-root .ocm-record-pager span{overflow-wrap:anywhere}
#ocm-root [role=button]:focus-visible,#ocm-root summary:focus-visible{outline:2px solid var(--ocm-link);outline-offset:2px}
@media(max-width:700px),(max-height:450px) and (max-width:900px){
 #ocm-root.ocm-ui2.ocm-classic{box-sizing:border-box!important;width:100%!important;max-width:100%!important;min-width:0!important;height:auto!important;max-height:none!important;overflow:visible!important;font-size:calc(16px * var(--tsui-font-scale,1))!important;line-height:1.5}
 #ocm-root.ocm-ui2.ocm-classic *{box-sizing:border-box}
 #ocm-root.ocm-ui2.ocm-classic #ocm-body,#ocm-root .ocm-tab-pane,#ocm-root .ocm-subpane{max-height:none!important;overflow:visible!important;min-width:0}
 #ocm-root.ocm-ui2.ocm-classic :is(div,span,small,p,table,thead,tbody,tr,td,th,label,a,button,input,select,textarea,summary){font-size:inherit!important}
 #ocm-root.ocm-ui2.ocm-classic :is(button,input,select,textarea,summary){min-height:44px!important;max-width:100%;box-sizing:border-box}
 #ocm-root.ocm-ui2.ocm-classic :is(input,select,textarea){font-size:max(16px,1em)!important}
 #ocm-root.ocm-ui2.ocm-classic :is(button,.ocm-loan-go,.ocm-buy-btn){background:var(--ocm-bg-card)!important;color:var(--ocm-link)!important;border:1px solid var(--ocm-border)!important;border-radius:6px}
 #ocm-root.ocm-ui2.ocm-classic #ocm-theme-customize-btn{background:var(--ocm-bg-card)!important;color:var(--ocm-link)!important;border-color:var(--ocm-border)!important}
 #ocm-root.ocm-ui2.ocm-classic :is(input:not([type=checkbox]):not([type=radio]),select,textarea){background:var(--ocm-bg-card)!important;color:var(--ocm-text)!important;border:1px solid var(--ocm-border)!important}
 #ocm-root.ocm-ui2.ocm-classic :is(button,a.ocm-loan-go,a.ocm-buy-btn){touch-action:manipulation}
 #ocm-root #ocm-header{display:grid!important;grid-template-columns:minmax(0,1fr) repeat(3,44px);gap:8px!important;padding:12px!important}
 #ocm-root #ocm-header h2{grid-column:auto;font-size:1.2em!important;margin:0}
 #ocm-root #ocm-header :is(.ocm-ver,.ocm-hdr-gap){display:none}
 #ocm-root #ocm-last-update{grid-column:1/-1;white-space:normal!important}
 #ocm-root.ocm-ui2.ocm-classic #ocm-header button{margin:0!important;padding:8px 4px!important;white-space:normal!important;font-size:0!important}
 #ocm-root #ocm-header button::before{content:attr(data-oc-short);font-size:20px}
 #ocm-root #ocm-tabs,#ocm-root .ocm-subtabs{display:none!important}
 #ocm-root .ocm-mobile-nav,#ocm-root .ocm-mobile-subnav{display:flex;align-items:center;gap:10px;padding:10px 0;min-width:0}
 #ocm-root :is(.ocm-mobile-nav,.ocm-mobile-subnav) select{flex:1;min-width:0;width:100%;background:var(--ocm-bg-card);color:var(--ocm-text);border:1px solid var(--ocm-border);border-radius:8px;padding:8px}
 #ocm-root .ocm-mobile-nav{border-bottom:1px solid var(--ocm-border)}
 #ocm-root .ocm-mobile-subnav>span{max-width:5em}
 #ocm-root .ocm-workspace-intro{display:none!important}
 #ocm-root .ocm-workspace-intro h3{font-size:1.2em!important}
 #ocm-root .ocm-workspace-context{display:flex!important;flex-wrap:wrap;align-items:center;gap:8px;padding:10px!important}
 #ocm-root .ocm-context-help{min-width:0}
 #ocm-root .ocm-context-help[open]{flex:1 0 100%}
 #ocm-root .ocm-context-help>summary{cursor:pointer;padding:8px 0}
 #ocm-root .ocm-workspace-links{display:flex;flex-wrap:wrap;gap:8px}
 #ocm-root #ocm-stats-bar{display:block!important;padding:0!important}
 #ocm-root .ocm-workload-details>summary{padding:12px 0;cursor:pointer;overflow-wrap:anywhere}
 #ocm-root .ocm-workload-details .ocm-stats-row{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;width:100%;min-width:0}
 #ocm-root .ocm-workload-details .ocm-stat{min-width:0!important;width:auto!important;padding:8px!important;white-space:normal}
 #ocm-root .ocm-workload-details .ocm-stats-row-recruiting{display:flex!important;flex-wrap:wrap;width:100%;min-width:0!important}
 #ocm-root .ocm-workspace-caption{display:none}
 #ocm-root .ocm-home-attention .ocm-card-b>div{flex-wrap:wrap}
 #ocm-root .ocm-home-attention .ocm-home-go{width:100%}
 #ocm-root .ocm-home-metrics .ocm-kgrid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
 #ocm-root.ocm-ui2.ocm-classic .ocm-tile-v{font-size:1.5em!important}
 #ocm-root #ocm-blocked .ocm-blocked-row{
   grid-template-columns:minmax(0,3fr) minmax(0,2fr);column-gap:10px;row-gap:4px;padding:6px 12px 12px
 }
 #ocm-root #ocm-blocked .ocm-blocked-row>*{min-width:0;white-space:normal;overflow:visible;overflow-wrap:anywhere;text-overflow:clip}
 #ocm-root #ocm-blocked :is(.ocm-blocked-name,.ocm-blocked-status){grid-column:1/-1}
 #ocm-root #ocm-blocked .ocm-blocked-name{display:flex;align-items:center;min-height:44px;color:var(--ocm-link);font-weight:600;text-decoration:underline}
 #ocm-root #ocm-blocked .ocm-blocked-timer{font-variant-numeric:tabular-nums}
 #ocm-root #ocm-lowcpr>.ocm-lowcpr-head{display:none}
 #ocm-root #ocm-lowcpr .ocm-lowcpr-row{
   grid-template-columns:minmax(0,1fr) max-content;column-gap:10px;row-gap:4px;padding:6px 12px 12px
 }
 #ocm-root #ocm-lowcpr .ocm-lowcpr-row>*{min-width:0;white-space:normal;overflow:visible;overflow-wrap:anywhere;text-overflow:clip}
 #ocm-root #ocm-lowcpr .ocm-lowcpr-name{grid-column:1;grid-row:1;display:flex;align-items:center;min-height:44px;color:var(--ocm-link);font-weight:600;text-decoration:underline}
 #ocm-root #ocm-lowcpr .ocm-lowcpr-cpr{grid-column:2;grid-row:1}
 #ocm-root #ocm-lowcpr :is(.ocm-lowcpr-oc,.ocm-lowcpr-role,.ocm-lowcpr-extras){grid-column:1/-1}
 #ocm-root #ocm-lowcpr .ocm-lowcpr-extras:empty{display:none}
 #ocm-root #ocm-lowcpr .ocm-lowcpr-mobile-label{display:inline;color:var(--ocm-text-muted);font-weight:normal}
 #ocm-root .ocm-mobile-records{display:block!important;width:100%!important;min-width:0!important;table-layout:auto!important}
 #ocm-root .ocm-record-container{max-height:none!important;height:auto!important;overflow:visible!important}
 #ocm-root .ocm-mobile-records>thead{position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip-path:inset(50%);white-space:nowrap}
 #ocm-root .ocm-mobile-records>tbody{display:block!important;width:100%}
 #ocm-root .ocm-mobile-records>tbody>tr{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:14px!important;margin-bottom:12px;border:1px solid var(--ocm-border)!important;border-radius:10px;background:var(--ocm-bg-card);min-width:0}
 #ocm-root .ocm-mobile-records>tbody>tr{opacity:1!important}
 #ocm-root .ocm-mobile-records>tbody>tr>td{display:flex!important;flex-direction:column;align-items:flex-start!important;text-align:left!important;white-space:normal!important;width:auto!important;min-width:0;padding:0!important;border:0!important;overflow-wrap:anywhere}
 #ocm-root .ocm-mobile-records>tbody>tr>td:first-child,#ocm-root .ocm-mobile-records td.ocm-record-wide{grid-column:1/-1}
 #ocm-root .ocm-mobile-records>tbody>tr>td:first-child{font-weight:600}
 #ocm-root .ocm-mobile-records td[data-oc-label]::before{content:attr(data-oc-label);display:block;font-size:.875em;font-weight:400;color:var(--ocm-text-dim);margin-bottom:3px}
 #ocm-root .ocm-mobile-records td>a{display:inline-flex;align-items:center;min-height:44px;max-width:100%;white-space:normal!important}
 #ocm-root .ocm-mobile-records :is(.ocm-earn-detail:not(.is-open),.ocm-pay-detail:not(.is-open),.ocm-fin-detail[style*="none"]){display:none!important}
 #ocm-root .ocm-mobile-records td[colspan]{grid-column:1/-1}
 #ocm-root .ocm-mobile-records td[colspan]::before{content:none}
 #ocm-root .ocm-arm-toolbar{grid-template-columns:repeat(2,minmax(0,1fr))!important}
 #ocm-root :is(.ocm-earn-row,.ocm-pay-row,.ocm-fin-ocrow){cursor:pointer}
 #ocm-root .ocm-finance-pager{flex-wrap:wrap}
 #ocm-root #ocm-config-panel{position:relative!important;max-height:none!important;overflow:visible!important;width:auto!important}
 #ocm-root #ocm-config-head{position:sticky;top:0;z-index:2;background:var(--ocm-bg-card)}
}
@media(max-width:380px){#ocm-root .ocm-mobile-records>tbody>tr{grid-template-columns:minmax(0,1fr)}}
@media(max-height:450px) and (max-width:900px){#ocm-root,#ocm-root #ocm-body{max-height:none!important;height:auto!important;overflow:visible!important}}
`;
GM_addStyle(OC_MOBILE_CSS);

const ocMobileInstances = new WeakMap();
function ocIsPhoneLayout(){return matchMedia('(max-width:700px),(max-height:450px) and (max-width:900px)').matches;}
function ocViewKey(el, root) {
  if (el.id) return '#' + CSS.escape(el.id);
  const pane = el.closest('[id]');
  for (const attr of ['data-oc','data-uid','name']) {
    const value = el.getAttribute(attr);
    if (value) return (pane && pane !== el ? '#' + CSS.escape(pane.id) + ' ' : '') + el.tagName.toLowerCase() +
      (el.classList.contains('ocm-fin-detail') ? '.ocm-fin-detail' : el.classList.contains('ocm-pay-detail') ? '.ocm-pay-detail' : el.classList.contains('ocm-earn-detail') ? '.ocm-earn-detail' : '') +
      '[' + attr + '="' + CSS.escape(value) + '"]' + (el.type === 'radio' ? '[value="' + CSS.escape(el.value) + '"]' : '');
  }
  const path=[];let node=el;
  while(node&&node!==root&&!node.id){const parent=node.parentElement;if(!parent)break;path.unshift(node.tagName.toLowerCase()+':nth-child('+(Array.from(parent.children).indexOf(node)+1)+')');node=parent;}
  if(node?.id&&path.length)return '#'+CSS.escape(node.id)+'>'+path.join('>');
  return null;
}
function captureOcViewState(root) {
  if (!root) return null;
  const fields=[];
  root.querySelectorAll('input:not([type=password]):not([type=hidden]),select,textarea,details,.ocm-fin-detail,.ocm-earn-detail,.ocm-pay-detail').forEach(el=>{
    // Connections are owned by their existing controls, never copied by UI state.
    // Armory filters are rendered from ARM.state, including explicit resets.
    if (el.closest('#ocm-config-panel, .ocm-arm-filters')) return;
    const key=ocViewKey(el,root);if(!key)return;
    fields.push({key,value:el.value,checked:el.checked,open:el.open,detail:el.matches('.ocm-fin-detail,.ocm-earn-detail,.ocm-pay-detail'),isOpen:el.classList.contains('is-open'),display:el.style.display});
  });
  return {root,fields,focus:root.contains(document.activeElement)?ocViewKey(document.activeElement,root):null};
}
function restoreOcViewState(state) {
  if(!state?.root?.isConnected)return;
  ocMobileInstances.get(state.root)?.refresh();
  for(const f of state.fields){
    const el=state.root.querySelector(f.key);if(!el)continue;
    if(f.value!==undefined && (el.tagName!=='SELECT'||Array.from(el.options).some(o=>o.value===f.value)))el.value=f.value;
    if(f.checked!==undefined)el.checked=f.checked;
    if(f.open!==undefined)el.open=f.open;
    if(f.detail){el.classList.toggle('is-open',f.isOpen);el.style.display=f.display;}
  }
  if(state.focus)state.root.querySelector(state.focus)?.focus({preventScroll:true});
  ocMobileInstances.get(state.root)?.refresh();
}
function initOcMobileUi(root) {
  if(!root||ocMobileInstances.has(root))return;
  let queued=false,observer;
  const pagers=new WeakMap(),pageMemory=new Map();
  const syncSelect=(bar,label,selector)=>{
    const tabs=Array.from(bar.children).filter(t=>t.matches('[role=tab]'));
    if(!tabs.length)return;
    let wrapper=bar.previousElementSibling;
    if(!wrapper?.classList.contains(selector)){
      wrapper=document.createElement('label');wrapper.className=selector;
      const caption=document.createElement('span');caption.textContent=label;
      const select=document.createElement('select');select.setAttribute('aria-label',label);
      wrapper.append(caption,select);bar.before(wrapper);
      select.addEventListener('change',()=>tabs.find(t=>(t.dataset.tab||t.dataset.sub)===select.value)?.click());
    }
    const select=wrapper.querySelector('select');
    for(const tab of tabs){const value=tab.dataset.tab||tab.dataset.sub;let option=Array.from(select.options).find(o=>o.value===value);
      if(!option){option=document.createElement('option');option.value=value;select.append(option);}const text=tab.textContent.trim().replace(/\s+/g,' ');if(option.textContent!==text)option.textContent=text;
      if(tab.classList.contains('active'))select.value=value;
    }
  };
  const refresh=()=>{
    queued=false;observer?.disconnect();
    const bar=root.querySelector('#ocm-tabs');if(bar)syncSelect(bar,'Section','ocm-mobile-nav');
    for(const [id,icon,label] of [['ocm-legend-btn','?','Legend'],['ocm-config-toggle','⚙','Settings'],['ocm-refresh-btn','↻','Refresh data']]){const button=root.querySelector('#'+id);if(button){button.dataset.ocShort=icon;button.setAttribute('aria-label',label);}}
    root.querySelectorAll('.ocm-subtabs').forEach(bar=>syncSelect(bar,'View','ocm-mobile-subnav'));
    root.querySelectorAll('.ocm-workspace-context>p').forEach(p=>{const details=document.createElement('details');details.className='ocm-context-help';const summary=document.createElement('summary');summary.textContent='Help';p.before(details);details.append(summary,p);});
    const workload=root.querySelector('#ocm-stats-bar');
    if(workload){let details=workload.querySelector('.ocm-workload-details');
      if(!details){details=document.createElement('details');details.id='ocm-workload-details';details.className='ocm-workload-details';details.open=!ocIsPhoneLayout();const summary=document.createElement('summary');const content=document.createElement('div');content.append(...workload.childNodes);details.append(summary,content);workload.append(details);}
      const number=id=>root.querySelector('#ocm-s-'+id)?.textContent.trim()||'0';
      details.querySelector('summary').textContent=number('open')+' open · '+number('blocked')+' blocked · '+number('lowcpr')+' low CPR';
    }
    root.querySelectorAll('table').forEach(table=>{
      const headers=Array.from(table.tHead?.rows?.[0]?.cells||[]);
      if(!headers.length||headers.length>8)return; // CPR matrices retain their contained horizontal scroller.
      table.classList.add('ocm-mobile-records');table.setAttribute('role','table');
      table.parentElement?.classList.add('ocm-record-container');
      const annotate=row=>Array.from(row.cells).forEach((cell,index)=>{
        cell.dataset.ocLabel=cell.colSpan>1?'':headers[index]?.textContent.trim()||'';
        cell.setAttribute('role','cell');
        cell.classList.toggle('ocm-record-wide',cell.colSpan>1||!!cell.querySelector('button,select,.ocm-loan-go,.ocm-buy-btn'));
      });
      Array.from(table.tBodies).forEach(body=>{
        let pager=pagers.get(body);
        if(!pager){
          const rows=Array.from(body.rows);rows.forEach(annotate);
          // Keep expandable row pairs together; their existing ledger pager owns them.
          if(rows.length>20&&!rows.some(r=>r.matches('.ocm-fin-detail,.ocm-earn-detail,.ocm-pay-detail')||r.querySelector('[colspan]'))){
            const nav=document.createElement('div');nav.className='ocm-record-pager';nav.setAttribute('aria-label','Record pages');
            const prev=document.createElement('button'),next=document.createElement('button'),info=document.createElement('span');prev.type=next.type='button';prev.textContent='Previous';next.textContent='Next';info.setAttribute('role','status');nav.append(prev,info,next);table.after(nav);
            const pageKey=ocViewKey(table,root)||headers.map(h=>h.textContent).join('|');
            const saved=pageMemory.get(pageKey)||{page:0,query:''};
            const search=document.createElement('input');search.type='search';search.maxLength=120;search.placeholder='Find a member, OC or item';search.setAttribute('aria-label','Find in records');search.style.cssText='width:100%;margin:8px 0;padding:10px;font:inherit;box-sizing:border-box';search.value=saved.query;table.before(search);
            pager={rows,page:Math.min(saved.page,Math.ceil(rows.length/20)-1),query:saved.query,nav,prev,next,info};pagers.set(body,pager);
            const show=()=>{const filtered=rows.filter(row=>row.textContent.toLocaleLowerCase().includes(pager.query.toLocaleLowerCase()));pager.page=Math.min(pager.page,Math.max(0,Math.ceil(filtered.length/20)-1));const start=pager.page*20;body.replaceChildren(...filtered.slice(start,start+20));prev.disabled=start===0;next.disabled=start+20>=filtered.length;info.textContent=filtered.length?(start+1)+'–'+Math.min(start+20,filtered.length)+' of '+filtered.length:'No matching records';pageMemory.set(pageKey,{page:pager.page,query:pager.query});if(pageMemory.size>40)pageMemory.delete(pageMemory.keys().next().value);};
            search.addEventListener('input',()=>{observer.disconnect();pager.query=search.value;pager.page=0;show();observe();});
            prev.addEventListener('click',()=>{observer.disconnect();pager.page--;show();observe();});next.addEventListener('click',()=>{observer.disconnect();pager.page++;show();observe();});show();
          }
        } else Array.from(body.rows).forEach(annotate);
      });
    });
    root.querySelectorAll('.ocm-earn-row,.ocm-pay-row,.ocm-fin-ocrow').forEach(row=>{
      const fin=row.classList.contains('ocm-fin-ocrow'),pay=row.classList.contains('ocm-pay-row'),kind=fin?'fin':pay?'pay':'earn',attr=fin||pay?'oc':'uid',id=row.dataset[attr];
      const detail=root.querySelector('.ocm-'+kind+'-detail[data-'+attr+'="'+CSS.escape(id||'')+'"]');
      if(detail){if(!detail.id)detail.id='ocm-detail-'+kind+'-'+id;row.setAttribute('aria-controls',detail.id);row.setAttribute('aria-expanded',String(fin?detail.style.display!=='none':detail.classList.contains('is-open')));}
      if(row.dataset.ocDisclosureReady)return;
      row.dataset.ocDisclosureReady='true';row.tabIndex=0;row.setAttribute('role','button');row.setAttribute('aria-label','Expand record: '+row.textContent.trim().replace(/\s+/g,' ').slice(0,160));
      row.addEventListener('keydown',event=>{if(event.target===row&&(event.key==='Enter'||event.key===' ')){event.preventDefault();row.click();}});
    });
    observe();
  };
  const observe=()=>observer.observe(root,{childList:true,subtree:true});
  observer=new MutationObserver(()=>{if(!queued){queued=true;queueMicrotask(refresh);}});
  root.addEventListener('click',()=>{if(!queued){queued=true;queueMicrotask(refresh);}});
  ocMobileInstances.set(root,{refresh,dispose:()=>observer.disconnect()});refresh();
}
  // OC MOBILE UI END

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

  /** A missing or invalid API rate is unknown, not a failed checkpoint. */
  function readCheckpointPassRate(raw) {
    const number = typeof raw === 'number' ? raw
      : typeof raw === 'string' && /^\d+(?:\.\d+)?$/.test(raw.trim()) ? Number(raw) : NaN;
    return Number.isFinite(number) && number >= 0 && number <= 100 ? number : null;
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
    const url = `${API_BASE}${path}${sep}key=${encodeURIComponent(apiKey)}&comment=OCSuite`;
    return tornApiGet(url);
  }

  /** Faction armory selections are still served only by Torn API v1. */
  async function apiFetchV1(path, apiKey) {
    const sep = path.includes('?') ? '&' : '?';
    const url = `${API_BASE_V1}${path}${sep}key=${encodeURIComponent(apiKey)}&comment=OCSuite`;
    return tornApiGet(url);
  }

  /**
   * Torn's faction armory is split into per-category selections — there is no
   * single "armory" selection. OC tools/materials/enhancers live in utilities,
   * but an OC role can also require a weapon or armor piece (e.g. a Construction
   * Helmet), which live in their own categories entirely invisible to a
   * utilities-only fetch. This table maps each category to its API selection
    * name, its response key(s) (defensive — the exact key isn't documented
   * anywhere we could pin down, so we try the plural and the singular), and the
   * real armory sub-tab slug confirmed live against torn.com (Give ▸ links must
   * land on the right one or the item row simply isn't on the page).
   */
  const ARMORY_CATS = {
    utilities: { selection: 'utilities', sub: 'utilities', keys: ['utilities', 'utility'] },
    armor:     { selection: 'armor',     sub: 'armour',    keys: ['armor', 'armour'] },
    weapons:   { selection: 'weapons',   sub: 'weapons',   keys: ['weapons', 'weapon'] },
    temporary: { selection: 'temporary', sub: 'temporary', keys: ['temporary'] },
    medical:   { selection: 'medical',   sub: 'medical',   keys: ['medical'] },
    // The native Consumables tab is distinct; do not invent a v1 selection.
    consumables: { selection: 'boosters', sub: 'consumables', keys: ['consumables'] },
    drugs:     { selection: 'drugs',     sub: 'drugs',     keys: ['drugs', 'drug'] },
    boosters:  { selection: 'boosters',  sub: 'boosters',  keys: ['boosters', 'booster'] },
  };

  /** Catalog type (string or named object) -> native armory category.
   * Unknown types remain unknown, so the bounded native tab search can resolve
   * them instead of treating Utilities as authoritative. */
  function catOfItemType(type) {
    const t = String((type && typeof type === 'object' ? type.name ?? type.type : type) || '').trim().toLowerCase();
    if (/melee|primary|secondary|weapon/.test(t)) return 'weapons';
    if (/defensive|armor|armour/.test(t)) return 'armor';
    if (/temporary/.test(t)) return 'temporary';
    if (/medical/.test(t)) return 'medical';
    if (/drug/.test(t)) return 'drugs';
    if (/alcohol|energy drink|candy|consumable/.test(t)) return 'consumables';
    if (/booster/.test(t)) return 'boosters';
    if (/^(tool|material|enhancer|utility|utilities)s?$/.test(t)) return 'utilities';
    return null; // Unknown is not evidence that the item lives in Utilities.
  }

  /**
   * The COMPLETE, definitive set of every item any Organized Crime 2.0 role has
   * ever required — sourced directly from wiki.torn.com/wiki/Organized_Crime_2.0
   * (its full scenario table, checked 2026-08-18, patch-current through #439).
   * Deliberately NOT inferred from live data — every inference-based attempt at
   * this (item category, "was this item ever an OC requirement somewhere",
   * "does this member hold a whole kit") let real war-loadout gear through
   * (Combat Helmet, AK-47, Riot gear, Pepper Spray — 147 false positives at one
   * point, live-tested). Most of these are Tools/Materials (Utilities armory),
   * but a few are NOT — Construction Helmet and China Lake are real OC
   * requirements (Gaslight the Way / Hostile Takeover) despite reading as
   * armor/weapons — which is exactly why a category-based filter can never be
   * fully reliable and this explicit list exists instead.
   * MAINTENANCE: if Torn ships a new OC scenario, its item(s) won't be
   * recognised here until this list is updated from the wiki page.
   */
  const OC_KNOWN_ITEM_NAMES = new Set([
    'lockpicks', 'shaving foam', 'jemmy', 'net', 'dog treats', 'cassock',
    'cell phone', 'id badge', 'atm key', 'police badge', 'dslr camera',
    'rf detector', 'gasoline', 'construction helmet', 'pcp', 'blank casino chips',
    'binoculars', 'hand drill', 'billfold', 'wire cutters', 'zip ties',
    'polymorphic virus', 'bolt cutters', 'spray paint : black', 'chloroform',
    'dental mirror', 'c4 explosive', 'flash grenade', 'thermite', 'ipecac syrup',
    'wireless dongle', 'tunneling virus', 'core drill', 'shaped charge',
    'firewalk virus', 'ladder', 'angle grinder', 'razor wire', 'floor cleaner',
    'smoke grenade', 'stealth virus', 'cigar cutter', 'car battery',
    'cut-throat razor', 'psu', 'hard drive', 'igniter cord', 'nail bomb',
    'china lake', 'remote detonator', 'tear gas', 'blood bag : irradiated',
    'syringe', 'ecstasy', 'lubricant', 'armored virus',
  ]);
  /**
   * Normalise a Torn-supplied OC/item name for lookup against our wiki-derived
   * tables. Torn's live names don't always match the wiki's spelling
   * character-for-character — the OC "Guardian Angels" is actually served as
   * "Guardian Ángels" (U+00C1), which silently missed an exact-match lookup and
   * showed no payout estimate. Strips diacritics and a trailing version suffix
   * ("Stage Fright V2"), matching what the analytics/CPR key builders elsewhere
   * in this file already do — deliberately named differently from the nested
   * normOcName() in the analytics section so the two never shadow each other.
   */
  function ocLookupKey(s) {
    return String(s || '')
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .trim().toLowerCase()
      .replace(/\s+v\d+$/, '')
      .trim();
  }

  function isKnownOcItem(name) {
    return OC_KNOWN_ITEM_NAMES.has(ocLookupKey(name));
  }

  /**
   * Payout estimates per OC scenario — the official Torn-published min/max
   * (money + respect where money is the reward; item/chain/currency-paid
   * scenarios get a plain-language note instead of a fabricated $ figure).
   * Sourced directly from wiki.torn.com/wiki/Organized_Crime_2.0's scenario
   * table (checked 2026-08-19, patch-current through #439) — NOT inferred or
   * guessed. These are Torn's own stated ranges; actual payout for any single
   * run still depends on the outcome path within that range.
   * MAINTENANCE: update from the wiki if Torn ships a new scenario or
   * rebalances an existing one's rewards.
   */
  const OC_MONEY_ESTIMATES = {
    'mob mentality':            { min: 673000,     max: 1500000 },
    'pet project':               { min: 414000,     max: 806000 },
    'cash me if you can':        { min: 829000,     max: 1601000 },
    'market forces':             { min: 5095000,    max: 8575000 },
    'snow blind':                 { min: 5575000,    max: 10565000 },
    'plucking the lotus petal':  { max: 8976000, note: 'up to' },
    'guardian angels':           { min: 6296000,    max: 8883000 },
    'honey trap':                 { min: 15753000,   max: 25671000 },
    'bidding war':                 { min: 71291000,   max: 133980000 },
    'leave no trace':            { min: 9660000,    max: 13474000 },
    'sneaky git grab':           { min: 21384000,   max: 38757000 },
    'blast from the past':       { min: 98046000,   max: 202382000 },
    'break the bank':            { min: 195135000,  max: 395980000 },
    'clinical precision':        { min: 61363000,   max: 122565000 },
    'ace in the hole':           { min: 280005000,  max: 579919000 },
    'hostile takeover':          { min: 511000000,  max: 856188000 },
    // Non-cash or chain-only rewards — plain note instead of a $ figure.
    'first aid and abet':        { note: 'Items only' },
    'best of the lot':           { note: 'Item reward' },
    'thou shalt not steal':      { note: 'Item reward' },
    'smoke and wing mirrors':    { note: 'Item reward' },
    'gaslight the way':          { note: 'Item reward' },
    'stage fright':               { note: '10–30 Xanax' },
    'counter offer':              { note: 'Items, ~$24m+ sell value' },
    'no reserve':                  { note: 'Chains → Bidding War' },
    'dish it out':                 { note: 'Item reward' },
    'window of opportunity':     { note: 'Item reward' },
    'stacking the deck':         { note: 'Chains → Ace in the Hole' },
    'lock stock':                  { note: 'Chains → Hostile Takeover' },
    'manifest cruelty':          { note: 'Chains → Gone Fission' },
    'gone fission':               { note: 'Chains → Crane Reaction' },
    'crane reaction':            { note: '1–3× Cesium-137' },
  };

  /** Observed payout per scenario key, rebuilt on each finance render.
   *  { [key]: { min, max, avg, n } } — cash + item value from our own runs. */
  let _ocPayoutObserved = null;

  /**
   * What this OC is worth, as { text, title } — or null if we know nothing.
   *
   * Prefers the faction's OWN completed runs (cash + reward items priced at
   * market) over Torn's published range, for two reasons: it's what this faction
   * actually earns rather than a global band, and it puts a real number on the
   * scenarios the wiki can only describe as an "item reward" — an item payout is
   * still a payout, it just has to be priced. Falls back to the published money
   * range, then to the wiki's plain-language note.
   *
   * Uses ocLookupKey because Torn serves "Guardian Ángels" where the wiki (and
   * therefore our key) says "Guardian Angels".
   */
  function ocPayoutEstimate(ocName) {
    const key = ocLookupKey(ocName);
    const obs = _ocPayoutObserved && _ocPayoutObserved[key];
    if (obs && obs.n > 0) {
      const runs = `${obs.n} completed run${obs.n === 1 ? '' : 's'}`;
      const text = (obs.n === 1 || obs.min === obs.max)
        ? fmtMoney(obs.avg)
        : `${fmtMoney(obs.min)}–${fmtMoney(obs.max)}`;
      return {
        text,
        title: `Your faction's own payouts across ${runs} — cash plus reward items priced at market. `
             + `Average ${fmtMoney(obs.avg)}. Gross, before the members' cut.`,
      };
    }
    const est = OC_MONEY_ESTIMATES[key];
    if (!est) return null;
    const published = "Torn's published range for this scenario (wiki.torn.com) — you haven't completed one yet, so this isn't your faction's own figure.";
    if (est.note && est.max == null) return { text: est.note, title: published };
    if (est.max != null && est.min == null) {
      return { text: `${est.note || ''} ${fmtMoney(est.max)}`.trim(), title: published };
    }
    return { text: `${fmtMoney(est.min)}–${fmtMoney(est.max)}`, title: published };
  }

  /**
   * Parse one faction armory category response into the stock map and the loan
   * list. Same shape for every category (confirmed for utilities; the others
   * are the same endpoint family so this is applied uniformly and adjusted if a
   * live category ever proves to differ):
   *   { <key>: [ { ID, name, type, quantity, available, loaned, loaned_to } ] }
   *   · available  — how many are sitting in the armory, free to hand out
   *   · loaned_to  — comma-separated user IDs currently holding one
   *
   * Torn lists one entry per stock line, so the same item can appear multiple
   * times — once for the free stock and once per loan — which is exactly what the
   * armory page shows ("Lockpicks x49 Available" and "Lockpicks x1 → Tunabox").
   * Both are summed/collected here.
   *
   * @param {object} data   Raw API response for this category.
   * @param {string[]} keys Candidate response keys to try, in order.
   * @returns {{armory: Object.<string, number>, loanedOut: Array}}
   */
  function parseArmoryCategory(data, keys) {
    const armory = {};
    const loanedOut = [];
    const itemTypes = {};
    let raw = [];
    for (const k of keys) { if (data && data[k] != null) { raw = data[k]; break; } }
    const list = Array.isArray(raw) ? raw : Object.values(raw || {});
    for (const it of list) {
      if (!it || typeof it !== 'object') continue;
      const id = String(it.ID ?? it.id ?? it.item_id ?? '');
      if (!/^\d+$/.test(id) || Number(id) <= 0) continue;
      // Stock = what's free to give. Items out on loan are still faction property
      // but you can't hand them to someone else, so they don't count as stock.
      const quantity = Number(it.quantity);
      const loaned = Number(it.loaned);
      const fallback = it.loaned != null && Number.isFinite(loaned) && loaned >= 0 && Number.isFinite(quantity)
        ? Math.max(0, quantity - loaned) : it.loaned_to ? 0 : quantity;
      const rawAvail = Number(it.available ?? fallback);
      const avail = Number.isFinite(rawAvail) ? Math.max(0, Math.floor(rawAvail)) : 0;
      armory[id] = (armory[id] || 0) + avail;
      const category = catOfItemType(it.type) || Object.keys(ARMORY_CATS).find(cat => ARMORY_CATS[cat].keys.some(k => keys.includes(k)));
      itemTypes[id] = category || it.type || '';

      // Loans. loaned_to is documented as "comma-separated ids" and can arrive as a
      // number (single holder) or a string ("123,456"). Empty/0 means nobody.
      const lt = it.loaned_to;
      if (lt !== null && lt !== undefined && lt !== '' && lt !== 0) {
        const uids = [...new Set(String(lt).split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s) && Number(s) > 0))];
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
    return { armory, loanedOut, itemTypes };
  }

  function parseArmoryInventory(data) {
    const result = { armory: {}, loanedOut: [], itemTypes: {} };
    for (const cat of Object.values(ARMORY_CATS)) {
      const parsed = parseArmoryCategory(data, cat.keys);
      Object.assign(result.armory, parsed.armory);
      Object.assign(result.itemTypes, parsed.itemTypes);
      result.loanedOut.push(...parsed.loanedOut);
    }
    return result;
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
      // One v1 request covers supported inventory selections, including medical.
      // Do not depend on current OC requirements to find old outstanding loans.
      apiFetchV1('/faction?selections=' + [...new Set(Object.values(ARMORY_CATS).map(cat => cat.selection))].join(','), apiKey).catch(() => ({})),
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

    // Parse the returned inventory into the stock, loan and item-category maps:
    //   armory[itemId]  = how many are on hand and free to give (NOT already loaned)
    //   loanedOut[]     = every {itemId, itemName, uid} pair currently on loan
    // Torn returns one entry per stock line, so an item can appear several times:
    // once "available" and once per loan. loaned_to is comma-separated user IDs.
    // Retain category evidence even when catalog lookup is unavailable.
    const { armory, loanedOut, itemTypes: inventoryTypes } = parseArmoryInventory(utilData);

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

    // Resolve item names, market values, AND category type via the torn items
    // endpoint. `type` is what lets us tell a Construction Helmet (Armor) apart
    // from a Lockpick (Utilities) without a separate lookup — same call, one more
    // field read off the response we're already making.
    let itemNames = {};
    let itemValues = {};
    let itemTypes = { ...inventoryTypes };
    if (itemIds.size > 0) {
      try {
        const ids = [...itemIds].join(',');
        const url = `https://api.torn.com/torn/${ids}?selections=items&key=${encodeURIComponent(apiKey)}&comment=OCSuite`;
        const data = await tornApiGet(url);
        for (const [id, item] of Object.entries(data.items || {})) {
          itemNames[String(id)]  = item.name || `Item #${id}`;
          // v2 nests price under value.market_price; v1 used market_value
          itemValues[String(id)] = item.value?.market_price ?? item.market_value ?? item.value?.sell_price ?? 0;
          itemTypes[String(id)]  = inventoryTypes[String(id)] || item.type || '';
        }
      } catch (_) {}
    }

    // All supported v1 stock selections were fetched together above. Category
    // coverage must not depend on current OC requirements: a medical loan still
    // needs to be found AFTER the OC that needed it finishes. One request, no
    // per-item calls or second-wave duplicate loans. OC relevance stays downstream.

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
          lastOc[uid] = { name: oc.name || `OC #${oc.id}`, executed_at: oc.executed_at, joined_at: slot.user?.joined_at ?? oc.created_at ?? null };
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
          const url  = `https://api.torn.com/user/${uid}?selections=basic&key=${encodeURIComponent(apiKey)}&comment=OCSuite`;
          const data = await tornApiGet(url);
          if (data?.name) exMemberNames[uid] = data.name;
        } catch (_) {}
      }));
    }

    return { faction, members: members.members || {}, armory, itemNames, itemValues, itemTypes, lastOc, exMemberNames, viewerId, loanedOut };
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
    { tab: 'money',       icon: '💰', label: 'Finance' },
    { tab: 'armoury',     icon: '🛡️', label: 'Armory' },
  ];
  function buildRailNav() {
    return OCM_NAV.map((v, i) =>
      `<div class="ocm-tab ocm-nav${i === 0 ? ' active' : ''}" id="ocm-tab-${v.tab}" data-tab="${v.tab}" role="tab"` +
      ` tabindex="${i === 0 ? '0' : '-1'}" aria-controls="ocm-pane-${v.tab}" aria-selected="${i === 0 ? 'true' : 'false'}"` +
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
    grid(inner, cols = 0) { return `<div class="ocm-kgrid"${cols ? ` style="--kcols:${cols}"` : ''}>${inner}</div>`; },
  };

  /** Construct the dashboard root element. Returns an unattached DOM node. */
  function buildRoot() {
    const root = document.createElement('div');
    root.id = 'ocm-root';
    root.className = 'ocm-ui2 ocm-classic';
    root.innerHTML = `
      <div id="ocm-header">
        <h2>OC Suite</h2>
        <span class="ocm-ver">v${SCRIPT_VERSION}</span>
        <small id="ocm-last-update">Not loaded</small>
        <span class="ocm-hdr-gap"></span>
        <button id="ocm-legend-btn" title="What do CPR, weight and the icons mean?">Legend</button>
        <button id="ocm-config-toggle" title="Settings">⚙ Settings</button>
        <button id="ocm-refresh-btn" title="Refresh data">↻ Refresh</button>
      </div>
      <div id="ocm-legend" style="display:none"></div>
      <div id="ocm-config-panel" style="display:none">
        <div id="ocm-config-head"><span>⚙ Settings</span><button id="ocm-config-close" title="Close settings">×</button></div>
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
          <div class="ocm-cfg-label">CPR Reference Data</div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <button id="ocm-cpr-recache-btn" class="ocm-cfg-btn" style="background:#16283a">♻ Rebuild CPR cache</button>
          </div>
          <div id="ocm-cpr-recache-status" style="font-size:11px;color:var(--ocm-text-dim);margin-top:4px"></div>
          <div style="font-size:10px;color:var(--ocm-text-dim);margin-top:6px;line-height:1.4">
            Re-pulls TornStats, re-reads your faction's completed OCs, and folds both into the
            stored CPR archive. For an exact crime+role the <b>higher</b> of history vs TornStats
            is used. Non-destructive — archived runs older than the API window are kept.
          </div>
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
            <span id="ocm-cfg-share-msg" role="status" style="font-size:11px;color:var(--ocm-cpr-good)"></span>
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
        <div class="ocm-cfg-section">
          <div class="ocm-cfg-label">OC Card Display</div>
          <div class="ocm-cfg-row">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
              <input type="checkbox" id="ocm-cfg-money-est" style="cursor:pointer" />
              <span>Show payout estimate (💰 low–high) on OC cards</span>
            </label>
          </div>
          <div style="font-size:10px;color:var(--ocm-text-dim);margin-top:6px;line-height:1.4">
            Torn's own published money range per scenario, from wiki.torn.com — not a
            guarantee, just what that OC type can pay out.
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
        <div class="ocm-cfg-section">
          <div class="ocm-cfg-label">API &amp; Memory Diagnostics</div>
          <div class="ocm-diag-actions">
            <button id="ocm-diagnostics-refresh" class="ocm-cfg-btn">↻ Refresh diagnostics</button>
            <button id="ocm-diagnostics-copy" class="ocm-cfg-btn">📋 Copy safe report</button>
          </div>
          <div id="ocm-diagnostics-panel" aria-live="polite" role="status" style="margin-top:8px"></div>
          <div class="ocm-diag-muted" style="margin-top:7px">
            Read-only snapshot. It never makes a request and does not include API keys, URLs, response data, or member rosters.
          </div>
        </div>
        <div class="ocm-cfg-actions">
          <button id="ocm-cfg-save-btn" class="ocm-cfg-btn">💾 Save Settings</button>
          <button id="ocm-cfg-reset-btn" class="ocm-cfg-btn" style="background:#222">↺ Reset Defaults</button>
          <span id="ocm-cfg-status" style="font-size:11px;color:var(--ocm-cpr-good);align-self:center"></span>
        </div>
      </div>
      <div id="ocm-body" style="display:none">
        <div id="ocm-error"></div>
        <div class="ocm-tabs" id="ocm-tabs" role="tablist">${buildRailNav()}</div>

        <!-- Loading placeholders; live renderers replace these as their data becomes available. -->
        <div class="ocm-tab-pane active" id="ocm-pane-home" role="tabpanel" aria-labelledby="ocm-tab-home">
          <div class="ocm-card ocm-feature-placeholder" style="text-align:center">
            <div class="ocm-feature-icon">🏠</div>
            <h3 style="margin:10px 0 4px">Dashboard</h3>
            <div style="color:var(--ocm-text-dim);max-width:470px;margin:0 auto">Faction overview loads here as soon as the suite has usable faction data.</div>
          </div>
        </div>
        <div class="ocm-tab-pane" id="ocm-pane-armoury" role="tabpanel" aria-labelledby="ocm-tab-armoury">
          <div class="ocm-card ocm-feature-placeholder" style="text-align:center">
            <div class="ocm-feature-icon">🛡️</div>
            <h3 style="margin:10px 0 4px">Armory</h3>
            <div style="color:var(--ocm-text-dim);max-width:470px;margin:0 auto">OC item stock, requirements, loans, and armoury activity load when this tab opens.</div>
          </div>
        </div>

        <!-- ═══ CRIMES — running the OCs (the main job) ═══ -->
        <div class="ocm-tab-pane" id="ocm-pane-crimes" role="tabpanel" aria-labelledby="ocm-tab-crimes">
          <header class="ocm-workspace-intro"><h3>Organized crimes</h3><p>Fill open roles, keep operations moving, and review completed results.</p></header>
          <div class="ocm-subtabs" role="tablist" aria-label="Organized crime views">
            <div class="ocm-subtab active" data-sub="fill"   role="tab">🎯 Fill Slots <span class="ocm-subtab-badge" id="ocm-sb-fill">0</span></div>
            <div class="ocm-subtab"        data-sub="active" role="tab">📋 Active OCs <span class="ocm-subtab-badge" id="ocm-sb-active">0</span></div>
            <div class="ocm-subtab"        data-sub="history" role="tab">📊 History &amp; performance</div>
          </div>
            <div id="ocm-stats-bar" style="display:none" role="region" aria-label="Current OC workload">
        <div class="ocm-workspace-caption">Current OC workload</div>
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

          <div class="ocm-subpane active" id="ocm-sub-fill">
            <div class="ocm-workspace-context"><p><strong>Staff the next operation.</strong> Compare available members with open roles. Existing assignments and CPR records live in People.</p><div class="ocm-workspace-links"><button type="button" data-suite-tab="people" data-suite-sub="blocked">Review blockers</button><button type="button" data-suite-tab="armoury">Stock &amp; loans</button></div></div>
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
            <div class="ocm-workspace-context"><p><strong>Follow operations in progress.</strong> Planning comes first; recruiting operations follow. Expand a card to review its roles and readiness.</p><div class="ocm-workspace-links"><button type="button" data-suite-tab="people" data-suite-sub="blocked">Review blockers</button><button type="button" data-suite-tab="armoury">Stock &amp; loans</button></div></div>
            <div id="ocm-planning-header" class="ocm-phase-header ocm-phase-planning">⏳ Planning <span id="ocm-planning-count" class="ocm-phase-count"></span><span class="ocm-phase-collapse">▼</span></div>
            <div id="ocm-grid-planning" class="ocm-oc-grid"></div>
            <div id="ocm-recruiting-header" class="ocm-phase-header ocm-phase-recruiting">🔍 Recruiting <span id="ocm-recruiting-count" class="ocm-phase-count"></span><span class="ocm-phase-collapse">▼</span></div>
            <div id="ocm-grid-recruiting" class="ocm-oc-grid"></div>
          </div>
          <div class="ocm-subpane" id="ocm-sub-history">
            <div class="ocm-workspace-context"><p>Compare completed OC outcomes and performance. Earnings, payouts, and accounting exports are in Finance.</p><div class="ocm-workspace-links"><button type="button" data-suite-tab="money" data-suite-sub="summary">Open OC finances</button></div></div>
            <div class="ocm-section-title" id="ocm-title-analytics">📊 OC History &amp; Performance</div>
            <div id="ocm-analytics"></div>
          </div>
        </div>

        <!-- ═══ PEOPLE — everything about members, in one place ═══ -->
        <div class="ocm-tab-pane" id="ocm-pane-people" role="tabpanel" aria-labelledby="ocm-tab-people">
          <header class="ocm-workspace-intro"><h3>People</h3><p>Review member assignments, availability, and CPR. Fill open roles in Crimes; manage faction item loans in Armory.</p></header>
          <div class="ocm-subtabs" role="tablist">
            <div class="ocm-subtab active" data-sub="assign"   role="tab">🎯 Assignments <span class="ocm-subtab-badge" id="ocm-sb-assign">0</span></div>
            <div class="ocm-subtab"        data-sub="blocked"  role="tab">🚫 Blocked <span class="ocm-subtab-badge" id="ocm-sb-blocked">0</span></div>
            <div class="ocm-subtab"        data-sub="optimize" role="tab">⚡ Role fit <span class="ocm-subtab-badge" id="ocm-sb-optimize">0</span></div>
            <div class="ocm-subtab"        data-sub="cpr"      role="tab">📈 CPR Data</div>
          </div>
          <div class="ocm-subpane active" id="ocm-sub-assign">
            <div id="ocm-people-assign"></div>
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
        <div class="ocm-tab-pane" id="ocm-pane-money" role="tabpanel" aria-labelledby="ocm-tab-money">
          <header class="ocm-workspace-intro"><h3>OC finances</h3><p>Track earnings, reconcile payouts, and account for item costs.</p></header>
          <div class="ocm-subtabs" role="tablist">
            <div class="ocm-subtab active" data-sub="summary" role="tab">📊 Summary</div>
            <div class="ocm-subtab"        data-sub="members" role="tab">👤 Member Earnings</div>
            <div class="ocm-subtab"        data-sub="faction" role="tab">🏦 Faction Earnings</div>
            <div class="ocm-subtab"        data-sub="payouts" role="tab">💸 Payouts <span class="ocm-subtab-badge" id="ocm-sb-payouts">0</span></div>
            <div class="ocm-subtab"        data-sub="ocsran"  role="tab">📋 OC ledger</div>
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
    `;
    return root;
  }

  // ─── RENDER ──────────────────────────────────────────────────────────────────

  /**
   * Main render function — called after a successful faction API fetch.
   * Builds the complete dashboard from raw API data.
   */
  /** Dashboard landing — summary tiles + "needs you now", wired to live stats. */
  function renderHome(s) {
    const pane = document.getElementById('ocm-pane-home');
    if (!pane) return;
    const tiles = [
      OCUI.statTile({ value: s.active,  label: 'Active OCs',   tone: 'info' }),
      OCUI.statTile({ value: s.open,    label: 'Open slots',   tone: s.open    > 0 ? 'info' : 'neutral' }),
      OCUI.statTile({ value: s.free,    label: 'Free members', tone: 'neutral' }),
      OCUI.statTile({ value: s.lowCpr,  label: 'Low CPR',      tone: s.lowCpr  > 0 ? 'warn' : 'good' }),
      OCUI.statTile({ value: s.blocked, label: 'Blocked',      tone: s.blocked > 0 ? 'crit' : 'neutral' }),
      OCUI.statTile({ value: s.stuck,   label: 'Stuck',        tone: s.stuck   > 0 ? 'crit' : 'neutral' }),
    ].join('');
    // Each item deep-links to the EXACT sub-view that holds the fix, not just the
    // top tab — a "Low CPR" alert should land on People › Optimize, not dump you on
    // People's default Assignments sub-tab to hunt for it. Tuple:
    // [tone, tag, text, tab, sub, goLabel]. sub='' jumps to the tab's default.
    const items = [];
    if (s.stuck   > 0) items.push(['crit',    'stuck',   `${s.stuck} OC${s.stuck>1?'s':''} fully planned but a member is blocked from initiating`, 'crimes', 'fill',     'Fill Slots ▸']);
    if (s.open    > 0) items.push(['neutral', 'fill',    `${s.open} open slot${s.open>1?'s':''} ready to fill`, 'crimes', 'fill',     'Fill Slots ▸']);
    if (s.lowCpr  > 0) items.push(['warn',    'low cpr', `${s.lowCpr} filled slot${s.lowCpr>1?'s':''} below your CPR threshold`, 'people', 'optimize', 'Optimize ▸']);
    if (s.blocked > 0) items.push(['warn',    'blocked', `${s.blocked} OC member${s.blocked>1?'s':''} jailed / hospitalised / abroad`, 'people', 'blocked',  'Blocked ▸']);
    const todo = items.length
      ? items.map(([tone, tag, text, tab, sub, go]) =>
          '<div style="display:flex;align-items:center;gap:10px;background:var(--ocm-bg-card);border:1px solid var(--ocm-border);border-radius:9px;padding:9px 11px;margin-bottom:7px">'
          + OCUI.chip(tag, tone) + '<span style="flex:1">' + OCUI.esc(text) + '</span>'
          + '<button type="button" class="ocm-home-go" data-go="' + tab + '" data-sub="' + sub + '" style="color:#7cd4ff;cursor:pointer;font-weight:700;font-size:12px">' + go + '</button></div>'
        ).join('')
      : '<div style="text-align:center;color:var(--ocm-cpr-good);padding:6px">✓ Nothing needs you right now — every active OC is covered.</div>';
    pane.innerHTML =
      '<div class="ocm-home-attention">' + OCUI.card({ title: 'Needs you now', right: items.length + ' item' + (items.length !== 1 ? 's' : ''), body: todo }) + '</div>'
      + '<details id="ocm-home-metrics" class="ocm-home-metrics"' + (!ocIsPhoneLayout() ? ' open' : '') + '><summary>' + s.active + ' active · ' + s.open + ' open slots · ' + s.free + ' available</summary>' + OCUI.grid(tiles, 6) + '</details>';
    pane.querySelectorAll('.ocm-home-go').forEach(el =>
      el.addEventListener('click', () => {
        document.querySelector('#ocm-tabs .ocm-nav[data-tab="' + el.dataset.go + '"]')?.click();
        const sub = el.dataset.sub;
        if (sub) document.querySelector('#ocm-pane-' + el.dataset.go + ' .ocm-subtab[data-sub="' + sub + '"]')?.click();
      }));
  }

  function renderDashboard(faction, memberMap, armory, itemNames, lastOc, exMemberNames = {}, itemValues = {}, viewerId = null, loanedOut = [], itemTypes = {}) {
    const _ocViewState = captureOcViewState(document.getElementById('ocm-root'));
    try {
    // The dashboard DOM only exists while Torn's Crimes tab is showing — an async
    // fetch can outlive a SPA navigation away from it, so re-check before writing.
    if (!document.getElementById('ocm-root')) return;
    OCM_FACTION_NAME = faction?.basic?.name || faction?.name || '';
    const crimes = faction.crimes || {};
    // Make sure tab strip is visible (might have been hidden in a previous member-mode render)
    const _tabsEl = document.getElementById('ocm-tabs');
    if (_tabsEl) _tabsEl.style.display = '';
    document.querySelectorAll('#ocm-root .ocm-workspace-intro, #ocm-root .ocm-workspace-context').forEach(el => { el.hidden = false; });

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
    // Difficulty map — seeded from what we've persisted before, then refreshed from the
    // currently-active crimes. Persisting means crimes the faction isn't running right now
    // (but that still appear in TornStats CPR data) keep their last-known level and sort
    // correctly by difficulty instead of dropping to the bottom.
    const crimeDiffMap = {};
    try { Object.assign(crimeDiffMap, JSON.parse(GM_getValue(GMK.CRIME_DIFF, '{}')) || {}); } catch (_) {}
    let _diffChanged = false;
    for (const oc of Object.values(crimes)) {
      if (oc?.name && oc?.difficulty != null) {
        const dk = oc.name.toLowerCase().trim();
        if (crimeDiffMap[dk] !== oc.difficulty) { crimeDiffMap[dk] = oc.difficulty; _diffChanged = true; }
      }
    }
    if (_diffChanged) { try { GM_setValue(GMK.CRIME_DIFF, JSON.stringify(crimeDiffMap)); } catch (_) {} }
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

        const cpr = readCheckpointPassRate(slot.checkpoint_pass_rate);
        if (cpr !== null && userId && cpr < CPR_WARN) lowCprCount++;
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
    renderHome({ active: activeOcCount, open: openSlots, free: freeMembers.length, lowCpr: lowCprCount, blocked: blockedInOcCount, stuck: stuckOcs.length });
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
            <strong>${esc(oc.name || `OC #${id}`)}</strong>
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

    const openRecruitingSlots = [];
    for (const [ocId, oc] of Object.entries(crimes)) {
      if (!oc || (oc.status || '').toLowerCase() !== 'recruiting') continue;
      const ocSlots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
      ocSlots.forEach((slot, slotIdx) => {
        if (slot.user?.id) return;
        openRecruitingSlots.push({ ocId, oc, slot, slotKey: `${ocId}:${slotIdx}` });
      });
    }

    /** Build the global assignment of available members → unique open slots.
     *  Greedy: at each step pick the highest-scoring eligible (member, slot) pair,
     *  lock both, and repeat. A member can only be assigned one slot, and each
     *  slot only goes to one member. Members without an eligible match still
     *  get a fallback recommendation (their highest-scoring non-eligible slot)
     *  so they aren't left empty-handed.
     *  Returns Map<memberId, slotInfo>. */
    function buildBestSlotAssignment(memberIds) {
      // Build all (member, slot) pairs with scores
      const pairs = [];
      for (const mid of memberIds) {
        for (const os of openRecruitingSlots) {
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
        const cprCol = c => c == null ? 'var(--ocm-text-faint)'
                        : c >= CPR_WARN ? 'var(--ocm-cpr-good)'
                        : c >= CPR_CRIT ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-crit)';
        const body = sorted.map(m => {
          const member  = memberById[m.id];
          const seen    = fmtRelative(member?.last_action?.timestamp ?? null);
          const oc      = lastOc[m.id];
          const endedTs = oc ? fmtOcRelative(oc.executed_at) : null;
          const joinTs  = oc && oc.joined_at ? fmtOcRelative(oc.joined_at) : null;
          const best    = getBestSlotForMember(m.id);

          let recCell, cprCell;
          if (!best) {
            recCell = openRecruitingSlots.length
              ? '<span style="color:var(--ocm-cpr-warn);font-weight:600">No CPR for open roles</span>'
              : '<span style="color:var(--ocm-text-faint)">No open recruiting slots</span>';
            cprCell = '<span style="color:var(--ocm-text-faint)">—</span>';
          } else {
            const sourceTag = best.source === 'history'
              ? ' <span style="font-size:9px;color:var(--ocm-text-muted)" title="From this member\'s OC history (no TornStats data)">history</span>'
              : '';
            recCell = `<b style="color:var(--ocm-text)">${esc(best.role)}</b> <span style="color:var(--ocm-text-muted);font-size:11px">in</span> <span style="color:var(--ocm-text-dim)">${esc(best.ocName)}</span> <span style="color:var(--ocm-text-faint);font-size:10px">D${best.difficulty}</span>`;
            cprCell = `<span style="color:${cprCol(best.cpr)};font-weight:700">${best.cpr == null ? '?' : (best.exact ? '' : '~') + best.cpr + '%'}</span>${sourceTag}`;
          }
          const joinCell = joinTs ? `<span class="${joinTs.cls}">${joinTs.text}</span>` : '<span style="color:var(--ocm-text-faint)">—</span>';
          const endCell  = oc
            ? `<span class="${endedTs ? endedTs.cls : ''}" title="${esc(oc.name)}">${endedTs ? endedTs.text : '—'}</span>`
            : '<span style="color:var(--ocm-text-faint);font-style:italic">none yet</span>';
          const seenCell = seen ? `<span class="${seen.cls}">${seen.text}</span>` : '<span style="color:var(--ocm-text-faint)">?</span>';

          return `<tr>
            <td class="l"><a href="/profiles.php?XID=${m.id}" target="_blank">${esc(m.name)}</a></td>
            <td class="l">${recCell}</td>
            <td class="n">${cprCell}</td>
            <td class="n">${joinCell}</td>
            <td class="n">${endCell}</td>
            <td class="n">${seenCell}</td>
          </tr>`;
        }).join('');
        containerEl.innerHTML = `<div class="ocm-card" style="padding:0;overflow:hidden"><div style="overflow-x:auto"><table class="ocm-members-table"><thead><tr>
          <th class="l">Member</th>
          <th class="l">Recommended slot</th>
          <th class="n">CPR</th>
          <th class="n" title="How long since they joined their last OC">Joined OC</th>
          <th class="n" title="How long ago their last OC ended">OC ended</th>
          <th class="n" title="Last action on Torn">Seen</th>
        </tr></thead><tbody>${body}</tbody></table></div></div>`;
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
      if (!['recruiting', 'planning', 'ready'].includes(String(oc.status || '').toLowerCase())) continue;
      const ocKey = (oc.name || '').toLowerCase().trim();
      if (!ocKey) continue;
      const slots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
      for (const slot of slots) {
        if (!slot?.user?.id) continue;
        const cpr = readCheckpointPassRate(slot.checkpoint_pass_rate);
        if (cpr === null) continue;
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
    renderFinanceSection(crimes, armory, itemNames, itemValues, loanedOut, memberNames, itemTypes);

    renderStatusSection(ctx);
    renderOptimizeSection(ctx);
    renderAssignmentsSection(ctx);
    renderReferenceSection(ctx);

    updateTabCounts();
    startCountdowns();
    } finally { restoreOcViewState(_ocViewState); }
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
        ? `<div class="ocm-banner-issues">${issues.map(i => `<span class="ocm-banner-issue">${i.sev === 'crit' ? '🔴' : '⚠️'} ${esc(i.msg)}</span>`).join('')}</div>`
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
      const slotRates = new Map(ocSlots.map(slot => [slot, slot.user?.id ? readCheckpointPassRate(slot.checkpoint_pass_rate) : null]));
      const knownRates = [...slotRates.values()].filter(rate => rate !== null);
      const hasCrit  = knownRates.some(rate => rate < CPR_CRIT);
      const hasLow   = knownRates.some(rate => rate < CPR_WARN);
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
        const cpr    = slotRates.get(slot);
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
      const moneyEst = GM_getValue(GMK.SHOW_MONEY_EST, true) ? ocPayoutEstimate(oc.name) : null;

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
              ${moneyEst ? `<span class="oc2-chip is-money" title="${esc(moneyEst.title)}">💰 ${esc(moneyEst.text)}</span>` : ''}
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
        if (!oc?.slots || !ACTIVE.has((oc.status || '').toLowerCase())) continue;
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
        const cpr = readCheckpointPassRate(slot.checkpoint_pass_rate);
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
      const lowHead = '<div class="ocm-lowcpr-head"><span>Member</span><span>OC</span><span>Role</span><span class="r">Weight</span><span class="r">CPR</span></div>';
      lowCprEl.innerHTML = lowHead + lowCprRows.map(r => {
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
            <span class="ocm-lowcpr-extras">${weightHtml ? '<span class="ocm-lowcpr-mobile-label">Weight</span>' : ''}${weightHtml}${riskBadge}</span>
            <span class="ocm-slot-cpr ${cprCls} ocm-lowcpr-cpr"><span class="ocm-lowcpr-mobile-label">CPR </span>${r.cpr}%</span>
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
        const curCpr = readCheckpointPassRate(slot.checkpoint_pass_rate);
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
      const overHead = '<div class="ocm-lowcpr-head"><span>Member</span><span>Upgrade</span><span>Target role</span><span class="r">+Lvl</span><span class="r">CPR</span></div>';
      overEl.innerHTML = overHead + overRows.map(r => {
        const upCprCls = r.upCpr >= CPR_WARN ? 'cpr-good' : r.upCpr >= CPR_CRIT ? 'cpr-warn' : 'cpr-crit';
        const srcTag = r.upSource === 'history'
          ? `<span style="font-size:9px;color:var(--ocm-text-muted);background:#1c1810;border:1px solid #3a3018;padding:0 4px;border-radius:2px;margin-left:3px" title="Estimate from this member's OC history">history</span>`
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
    const ocMeta = {};   // ocId -> { ocName, difficulty, phase, openRoles }
    for (const [ocId, oc] of Object.entries(crimes)) {
      if (!oc || typeof oc !== 'object') continue;
      if (!ACTIVE.has((oc.status || '').toLowerCase())) continue;
      const ocName = oc.name || `OC #${ocId}`;
      const slots  = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);

      // Every role in this OC, so we can spot a better seat for someone.
      const roleList = slots.map(s => s.position_info?.label || s.position || '?');
      const openRoles = slots.filter(s => !(s.user?.id)).map(s => s.position_info?.label || s.position || '?');
      ocMeta[ocId] = { ocName, difficulty: oc.difficulty ?? null, phase: (oc.status || '').toLowerCase(), openRoles };

      for (const slot of slots) {
        const uid = slot.user?.id ? String(slot.user.id) : null;
        if (!uid) continue;
        const role   = slot.position_info?.label || slot.position || 'Unknown';
        const cpr    = readCheckpointPassRate(slot.checkpoint_pass_rate);
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

    // "Who is where" — one card per active OC, its roster in role-weight order.
    // OCs with a Risk sort to the top, then Underused, then hardest first.
    const phaseLabel = { recruiting: 'Recruiting', planning: 'Planning', ready: 'Ready', initiated: 'In progress', executing: 'In progress', 'in progress': 'In progress', active: 'Active', awaiting: 'Awaiting', blocked: 'Blocked' };
    const ocRank = id => {
      const rs = rows.filter(r => r.ocId === id);
      if (rs.some(r => r.vClass === 'v-risk')) return 0;
      if (rs.some(r => r.vClass === 'v-under')) return 1;
      return 2;
    };
    const ocIds = Object.keys(ocMeta).sort((a, b) => ocRank(a) - ocRank(b)
      || (Number(ocMeta[b].difficulty) || 0) - (Number(ocMeta[a].difficulty) || 0)
      || ocMeta[a].ocName.localeCompare(ocMeta[b].ocName));

    const betterCell = r => r.better
      ? `<span title="${esc(r.name)} is predicted at ${r.better.cpr}% for ${esc(r.better.role)} — ${r.better.gain.toFixed(0)} points better than their current role. Source: ${r.better.observed ? 'a real run they did' : 'TornStats estimate'}.">${esc(r.better.role)} <b style="color:var(--ocm-cpr-good)">+${r.better.gain.toFixed(0)}</b>${r.better.observed ? '' : ' <span style="color:var(--ocm-text-faint)">est</span>'}</span>`
      : '<span style="color:var(--ocm-text-faint)">—</span>';

    const cards = ocIds.map(id => {
      const meta = ocMeta[id];
      const slotRows = rows.filter(r => r.ocId === id).sort((a, b) => (b.weight ?? -1) - (a.weight ?? -1));
      const nRiskOc  = slotRows.filter(r => r.vClass === 'v-risk').length;
      const nUnderOc = slotRows.filter(r => r.vClass === 'v-under').length;
      const nUnknown = slotRows.filter(r => r.vClass === 'v-none').length;
      const nWeak = slotRows.filter(r => r.vClass === 'v-weak').length;
      const coverage = [nWeak && (nWeak + ' weak'), nUnknown && (nUnknown + ' unknown CPR')].filter(Boolean).join(' / ');
      const diffBadge = meta.difficulty != null ? `<span class="ocm-badge" title="Difficulty level">D${meta.difficulty}</span> ` : '';
      const attn = nRiskOc ? `<span style="color:var(--ocm-cpr-crit);font-weight:700">${nRiskOc} misplaced</span>`
                 : nUnderOc ? `<span style="color:var(--ocm-link)">${nUnderOc} underused</span>`
                 : coverage ? `<span style="color:var(--ocm-text-muted)">${coverage}</span>`
                 : !slotRows.length ? '<span style="color:var(--ocm-text-muted)">no assigned members</span>'
                 : `<span style="color:var(--ocm-cpr-good)">all aligned</span>`;
      const memberRows = slotRows.map(r => `<tr>
        <td style="color:var(--ocm-text-muted);width:112px">${esc(r.role)}</td>
        <td><a href="/profiles.php?XID=${r.uid}" target="_blank">${esc(r.name)}</a>${r.blocked ? ' <span style="color:var(--ocm-cpr-crit)" title="Currently jailed / hospital / abroad">⛔</span>' : ''}</td>
        <td style="text-align:right;color:${wCol(r.weight)};font-weight:600;width:56px">${r.weight != null ? r.weight.toFixed(0) + '%' : '—'}</td>
        <td style="text-align:right;color:${cprCol(r.cpr)};font-weight:700;width:52px">${r.cpr != null ? r.cpr + '%' : '—'}</td>
        <td class="${r.vClass}" title="${esc(r.vTip)}" style="cursor:help;width:92px">${r.verdict}</td>
        <td style="color:var(--ocm-text-muted);font-size:11px">${betterCell(r)}</td>
      </tr>`).join('');
      const openRows = (meta.openRoles || []).map(role => `<tr style="opacity:.55">
        <td style="color:var(--ocm-text-muted);width:112px">${esc(role)}</td>
        <td colspan="5" style="color:var(--ocm-text-faint);font-style:italic">— open slot —</td>
      </tr>`).join('');
      return `<div class="ocm-card" style="margin-bottom:10px">
        <div class="ocm-card-h">${diffBadge}${esc(meta.ocName)}<span class="ocm-card-r" style="font-size:11px">${phaseLabel[meta.phase] || meta.phase} · ${attn}</span></div>
        <table class="ocm-pay-table" style="margin:0">
          <thead><tr><th style="width:15%">Role</th><th style="width:34%">Member</th><th style="text-align:right;width:11%" title="How much this role drives the OC's success">Weight</th><th style="text-align:right;width:10%">CPR</th><th style="width:18%">Verdict</th><th style="width:12%">Better</th></tr></thead>
          <tbody>${memberRows}${openRows}</tbody>
        </table>
      </div>`;
    }).join('');

    el.innerHTML = kpis + `
      <div style="font-size:11px;color:var(--ocm-text-muted);margin-bottom:10px;line-height:1.6">
        Who's in each active OC, and whether their CPR matches how much the role actually matters.
        <b style="color:var(--ocm-cpr-crit)">🔴 Risk</b> = a high-weight role held at low CPR — this is what loses OCs, fix it first.
        <b style="color:var(--ocm-link)">🔵 Underused</b> = a strong member parked on a role that barely moves the outcome.
        OCs with problems sort to the top; hover any verdict for the reasoning.</div>` + cards;
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
      const filled   = ocSlots.filter(sl => sl.user?.id).map(sl => ({ sl, cpr: readCheckpointPassRate(sl.checkpoint_pass_rate) }));
      const knownCprs = filled.map(entry => entry.cpr).filter(cpr => cpr != null);
      const avgCpr   = knownCprs.length > 0
        ? (knownCprs.reduce((sum, cpr) => sum + cpr, 0) / knownCprs.length).toFixed(1)
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
      const memberDetailRows = filled.map(({ sl, cpr }) => {
        const uid  = String(sl.user.id);
        const name = mInfo[uid]?.name || exMemberNames[uid] || `#${uid}`;
        const role = sl.position_info?.label || sl.position || '?';
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
          <span style="font-weight:bold;color:var(--ocm-text);flex:1">${esc(oc.name || 'Unknown')}</span>
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
    _cprBackfillCtx = { mInfo, exMemberNames };   // for Config → Rebuild CPR cache
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
      // TornStats reports current CPR, not a recorded run or outcome.
      const runs      = entries.filter(e => !e.tsSourced);
      const total     = runs.length;
      const outcomes  = runs.filter(e => ['successful', 'failure', 'expired'].includes(e.outcome));
      const successes = outcomes.filter(e => e.outcome === 'successful').length;
      const rate      = outcomes.length > 0 ? Math.round(successes / outcomes.length * 100) : null;
      const cprs      = runs.map(e => readCheckpointPassRate(e.cpr)).filter(cpr => cpr != null);
      const avgCpr    = cprs.length > 0 ? (cprs.reduce((a, b) => a + b, 0) / cprs.length).toFixed(1) : null;

      // Most-played role
      const roleCounts = Object.create(null);
      for (const e of runs) roleCounts[e.role] = (roleCounts[e.role] || 0) + 1;
      const topRole = Object.entries(roleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

      const rateCol = rate == null ? 'var(--ocm-text-muted)' : rate >= 85 ? 'var(--ocm-cpr-good)' : rate >= 65 ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-crit)';

      // Summary bar
      summaryEl.style.display = 'flex';
      summaryEl.innerHTML = `
        <div class="ocm-mh-sum-item">
          <span class="ocm-mh-sum-label">OCs</span>
          <span class="ocm-mh-sum-value">${total}</span>
        </div>
        <div class="ocm-mh-sum-item">
          <span class="ocm-mh-sum-label">Success Rate</span>
          <span class="ocm-mh-sum-value" style="color:${rateCol}">${rate == null ? 'No data' : rate + '%'}</span>
        </div>
        <div class="ocm-mh-sum-item">
          <span class="ocm-mh-sum-label">Avg CPR</span>
          <span class="ocm-mh-sum-value ${avgCpr != null ? cprClass(Number(avgCpr)) : ''}">${avgCpr != null ? avgCpr + '%' : '—'}</span>
        </div>
        <div class="ocm-mh-sum-item">
          <span class="ocm-mh-sum-label">Most Played Role</span>
          <span class="ocm-mh-sum-value" style="font-size:11px;padding-top:2px">${esc(topRole)}</span>
        </div>`;

      // History table
      const rows = entries.map(e => {
        const dateStr   = e.executedAt
          ? new Date(e.executedAt * 1000).toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', year: '2-digit' })
          : '—';
        const cpr       = readCheckpointPassRate(e.cpr);
        const cprStr    = cpr != null ? `${cpr}%` : '—';
        const cprCls    = cpr != null ? cprClass(cpr) : '';
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
          if (last) loadData(hubEffectiveTornKey());
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
          const cpr  = readCheckpointPassRate(sl.checkpoint_pass_rate);
          return { name, uid, role, weight: w, cpr };
        });
      // Avg of reported CPR across occupied slots
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
      if (!document.getElementById('ocm-root')) {
        clearInterval(window._ocmTimer);
        window._ocmTimer = null;
        return;
      }
      document.querySelectorAll('.ocm-time[data-until]').forEach(el => {
        el.textContent = fmtCountdown(parseInt(el.dataset.until, 10));
      });
    }, 1000);
  }

  // ─── MEMBER MODE ─────────────────────────────────────────────────────────────

  /** Fetch data for member mode (no faction API access). */
  async function fetchMember(apiKey) {
    const url  = `${API_BASE}/user?selections=organizedcrimes,basic&key=${encodeURIComponent(apiKey)}&comment=OCSuite`;
    const data = await tornApiGet(url);
    if (data.error) throw new Error(`API error ${data.error.code}: ${data.error.error}`);
    return data;
  }

  /** Render the member-mode dashboard (slot recommendations only, no faction data). */
  function renderMemberDashboard(data) {
    // Same SPA-navigated-away guard as renderDashboard — the async fetch that
    // reaches here can outlive the Crimes tab's DOM.
    if (!document.getElementById('ocm-root')) return;
    document.querySelectorAll('#ocm-root .ocm-workspace-intro, #ocm-root .ocm-workspace-context').forEach(el => { el.hidden = true; });
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

  /**
   * Predict a member's CPR for a given crime + role.
   *
   * EXACT crime+role — BOTH sources are consulted and the HIGHER one wins:
   *
   *   · HISTORY: our own archive (a CPR Torn itself reported after the member
   *     actually ran that role — persists past the API's ~100-OC window, the only
   *     long-term memory the faction has), plus the current API window averaged
   *     across repeat runs. The higher of those two represents "history".
   *   · TORNSTATS: a third-party estimate for the same crime+role.
   *
   * Taking the max means an improved member isn't held back by one bad archived
   * run, and a stale TornStats figure can't drag down a good observed one.
   *
   * FUZZY fallbacks (same crime, different role, then TornStats' overall lowest)
   * are unchanged and still take the LOWEST — those are proxies for a role the
   * member has never run, and guessing high there seats someone who then fails.
   *
   * @returns {{cpr:number, exact:boolean, source:'own'|'ts', observed:boolean, at:number|null}|null}
   */
  function tsGetCpr(uid, ocName, roleName) {
    const normOc   = (ocName || '').toLowerCase().trim().replace(/\s+v\d+$/i, '');
    const normRole = (roleName || '').toLowerCase().trim().replace(/\s*#\d+$/, '');
    const key      = String(uid);
    // EXACT crime+role candidates, kept side by side instead of first-wins, so the
    // two sources can be compared. Steps 1 & 2 are both "history" (our own archive
    // and the live API window); step 3 is TornStats. Resolved after step 3.
    let histExact = null;
    let tsExact   = null;

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
          // Observed run. A TornStats-backfilled row (executedAt null) is only an
          // estimate, so it doesn't count as history here. Collected rather than
          // returned so TornStats can still be compared against it below; keep the
          // highest observed run for this role.
          if (rec.executedAt && (histExact == null || rec.cpr > histExact.cpr)) {
            histExact = { cpr: rec.cpr, exact: true, source: 'own', observed: true, at: rec.executedAt };
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
          const avg = Math.round(b.sum / b.count);
          if (histExact == null || avg > histExact.cpr) {
            histExact = { cpr: avg, exact: true, source: 'own', observed: true, at: null };
          }
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
              if (tsExact == null || cpr > tsExact.cpr) {
                tsExact = { cpr, exact: true, source: 'ts', observed: false, at: null };
              }
            }
          }
        }
      }
    }

    // ── EXACT-MATCH RESOLUTION — history vs TornStats, HIGHER WINS.
    // Previously this was strict first-wins by source priority, so a real observed
    // run always beat TornStats even when TornStats had the member rated higher
    // (e.g. they've improved since that run, or the archived run was an early bad
    // one). Requested behaviour: consult both and take the better number.
    // Note this applies ONLY to exact crime+role matches, where both sides are
    // talking about the same thing. The fuzzy fallbacks below deliberately keep
    // their take-the-LOWEST rule — those are proxies for a role the member has
    // never actually run, and guessing high there is how you seat someone who
    // then fails the crime.
    if (histExact && tsExact) return tsExact.cpr > histExact.cpr ? tsExact : histExact;
    if (histExact) return histExact;
    if (tsExact)   return tsExact;

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
   *  `sub` must be the item's own category slug (confirmed live: weapons / armour /
   *  temporary / medical / consumables / drugs / boosters / utilities) — a Construction
   *  Helmet's row simply isn't on the utilities sub-tab, so the wrong slug silently
   *  finds nothing. Defaults to utilities, the common OC-item case. */
  function armoryGiveUrl(sub) {
    return `https://www.torn.com/factions.php?step=your#/tab=armoury&start=0&sub=${sub || 'utilities'}`;
  }

  /** Resolve the native sub-tab from inventory/catalog metadata. Empty means
   *  unknown: the autofill must discover the row, not trust a default category. */
  function armorySubOfItem(itemId) {
    const types = _armDataCache?.itemTypes || {};
    return ARMORY_CATS[catOfItemType(types[String(itemId)])]?.sub || '';
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

  /**
   * Wire every `.ocm-loan-go` control inside `container`: records the loan intent,
   * then gets the leader to the item's row WITHOUT opening a new tab — handing over
   * real faction property should stay one continuous flow, not a second window.
   *   · already on that exact armory sub-tab -> nothing will fire hashchange, so run
   *     the autofill directly.
   *   · on factions.php but a different sub (or a different top tab) -> change the
   *     hash in place; Torn's own SPA router re-renders, hashchange fires, the
   *     existing initLoanAutofill() listener picks it up.
   *   · anywhere else on the site -> same-tab full navigation (still not a new tab).
   * `href` is left pointing at the real URL so a middle/ctrl-click still opens a new
   * tab if that's what the user actually wanted — only the plain left-click is driven.
   */
  /** Which armoury sub-tab is actually on screen right now (slug, or null). Read
   *  from the ACTIVE tab's own href — the URL hash is not a reliable indicator
   *  (see armouryGoToSub). */
  function activeArmourySub() {
    const selected = document.querySelectorAll('#faction-armoury-tabs li.ui-tabs-active a, #faction-armoury-tabs [aria-selected="true"]');
    for (const el of selected) {
      if (el.offsetParent === null) continue;
      // Torn marks the containing LI selected as well as its anchor. The LI
      // has no href, and a second selected anchor may just point to #nogo.
      const links = el.matches('a[href]') ? [el] : el.querySelectorAll('a[href]');
      for (const link of links) {
        const match = (link.getAttribute('href') || '').match(/(?:[?&#])sub=([a-z]+)(?:&|$)/i);
        if (link.offsetParent !== null && match) return match[1].toLowerCase();
      }
    }
    return null;
  }
  /** The clickable tab anchor for a sub-tab. Torn renders more than one match
   *  (desktop + a hidden variant), so take the first VISIBLE one. */
  function armouryTabLink(sub) {
    return [...document.querySelectorAll('#faction-armoury-tabs a[href]')]
      .find(el => el.offsetParent !== null && ((el.getAttribute('href') || '').match(/(?:[?&#])sub=([a-z]+)(?:&|$)/i) || [])[1]?.toLowerCase() === sub) || null;
  }

  /**
   * Get the page to `sub`'s item list, then run the autofill.
   *
   * Torn's armoury router only reads `sub=`/`start=` from the hash on a COLD
   * LOAD. Assigning location.hash on an already-loaded page fires hashchange but
   * the router ignores it — the URL changes and the visible tab does NOT (proven
   * live: hash set to sub=armour while Utilities stayed on screen; a full
   * same-document navigation to sub=medical likewise stayed on Utilities). That
   * is why every non-utilities Retrieve silently searched the wrong list: it
   * "navigated" by hash, landed on whatever category Torn had restored, found
   * nothing, and timed out. Utilities appeared to work only because Torn happens
   * to restore Utilities by default.
   *
   * So: switch categories by CLICKING the real tab anchor (verified to work),
   * and fall back to hash + reload only when the armoury tabs aren't in the DOM
   * at all (e.g. we're on the Crimes tab) — a cold load DOES honour the hash.
   * The intent lives in GM storage, so it survives the reload and initLoanAutofill
   * picks it up on boot.
   */
  function armouryGoToSub(sub) {
    if (!location.pathname.includes('factions.php')) {
      // Off-site: full load into the armoury. Which sub-tab Torn picks on boot
      // doesn't matter — the intent carries `sub`, and initLoanAutofill clicks
      // the right tab once the armoury has rendered.
      location.href = armoryGiveUrl(sub);
      return;
    }
    // Already on factions.php. If we're not on the armoury at all (e.g. the
    // Crimes tab), switch the TOP-LEVEL tab via the hash — that part Torn's
    // router does handle in-page — and let initLoanAutofill wait for the
    // armoury to render before picking the category. Deliberately NOT
    // hash+reload: Torn resolves the initial sub-tab from a `type=` QUERY
    // param, not from `sub=` in the hash, so a reload launched from the Crimes
    // tab (no type= present) lands on the FIRST tab — the reported bug.
    if (!document.getElementById('faction-armoury-tabs')) {
      location.hash = '#/tab=armoury';
    }
    initLoanAutofill();
  }

  function wireLoanGoButtons(container) {
    (container || document).querySelectorAll('.ocm-loan-go').forEach(a => {
      // renderFinanceSection wires all of #ocm-root (which contains the Armoury
      // pane) and _armWire wires that pane again — without this guard the same
      // button ends up with two listeners, and because the handler re-arms the
      // intent before consuming it, the second one would start a SECOND
      // pagination sweep racing the first (both clicking "next page").
      if (a._ocmLoanWired) return;
      a._ocmLoanWired = true;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const sub = a.dataset.sub || armorySubOfItem(a.dataset.item);
        setLoanIntent({
          mode: a.dataset.mode || 'give', itemId: a.dataset.item, itemName: a.dataset.itemname,
          uid: a.dataset.uid, memberName: a.dataset.member, qty: 1, sub,
        });
        armouryGoToSub(sub);
      });
    });
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
   * Annotate supported armory sections with OC status. Utilities keeps its
   * column; other sections use an inline label without changing Torn's widths.
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
  let _ocmArmoryObserver = null;
  let _ocmArmoryObservedRoot = null;
  let _armoryAnnotationGeneration = 0;

  function nativeArmouryWrap() {
    if (!location.hash.includes('tab=armoury')) return null;
    const sub = activeArmourySub();
    if (!NATIVE_LOAN_SUBS.has(sub)) return null;
    return document.getElementById(`tab=armoury&sub=${sub}`) || null;
  }

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

    const inline = activeArmourySub() !== 'utilities';
    wrap.classList.toggle('ocm-armory-annotated', !inline);

    // Header cell
    const title = wrap.querySelector('.list-title');
    if (title && !inline && !title.querySelector('.ocm-acol')) {
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
        if (inline) (li.querySelector('.name') || typeCell).appendChild(cell);
        else li.insertBefore(cell, typeCell);
      }

      const iid = li.querySelector('.img-wrap[data-itemid]')?.dataset.itemid;
      const nameCopy = li.querySelector('.name')?.cloneNode(true);
      nameCopy?.querySelectorAll('.ocm-acol').forEach(el => el.remove());
      const itemName = (nameCopy?.textContent || '').replace(/\s*x\s*\d+\s*$/, '').trim();
      const holderLink = li.querySelector('.loaned a[href*="XID="]');
      const holderId = holderLink ? (holderLink.href.match(/XID=(\d+)/) || [])[1] : null;
      const holderName = holderLink ? holderLink.textContent.trim() : null;

      let cls, text, tip;
      if (holderId && (isKnownOcItem(itemName) || need.needByUser.has(`${holderId}|${iid}`))) {
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
      if (inline) cell.style.cssText = 'float:none;width:auto;height:auto;line-height:1.3;margin:2px 0;padding:0;font-size:11px;white-space:normal';
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
    const generation = ++_armoryAnnotationGeneration;
    if (_ocmArmoryObserver) _ocmArmoryObserver.disconnect();
    _ocmArmoryObserver = null;
    _ocmArmoryObservedRoot = null;
    if (!location.href.includes('factions.php')) return;
    if (!location.hash.includes('tab=armoury')) return;

    const apiKey = hubEffectiveTornKey();
    if (!apiKey) return;

    const cancelled = () => generation !== _armoryAnnotationGeneration || !location.hash.includes('tab=armoury');
    const firstRow = await waitForEl('.item-list li .img-wrap[data-itemid]', 15000,
      el => nativeArmouryWrap()?.contains(el), cancelled);
    if (!firstRow) return;
    const wrap = nativeArmouryWrap();
    if (!wrap) return;

    if (!_armoryNeed) {
      try {
        _armoryNeed = await fetchArmoryNeed(apiKey);
      } catch (e) {
        if (cancelled() || nativeArmouryWrap() !== wrap || !wrap.isConnected) return;
        wrap.classList.remove('ocm-armory-annotated');   // don't leave the layout broken
        ocmToast('Could not load OC status for the armory: ' + e.message, 'warn');
        return;
      }
    }

    if (cancelled() || nativeArmouryWrap() !== wrap || !wrap.isConnected) return;

    paintArmoryColumn(wrap, _armoryNeed);

    // Torn rebuilds the list after Give / Loan / Retrieve. Repaint when it does.
    // Guard against our own DOM writes re-triggering the observer.
    if (_ocmArmoryObservedRoot === wrap && _ocmArmoryObserver) return;
    if (_ocmArmoryObserver) _ocmArmoryObserver.disconnect();
    _ocmArmoryObservedRoot = wrap;
    let painting = false;
    const obs = new MutationObserver(() => {
      if (cancelled() || nativeArmouryWrap() !== wrap || !wrap.isConnected) {
        obs.disconnect();
        if (_ocmArmoryObserver === obs) {
          _ocmArmoryObserver = null;
          _ocmArmoryObservedRoot = null;
        }
        return;
      }
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
        .finally(() => {
          if (!cancelled() && wrap.isConnected && nativeArmouryWrap() === wrap) paintArmoryColumn(wrap, _armoryNeed);
          painting = false;
        });
    });
    _ocmArmoryObserver = obs;
    obs.observe(wrap, { childList: true, subtree: true });
  }

  /** Poll for an element to appear (the armory list renders async). */
  function waitForEl(selector, timeoutMs = 10000, accept = () => true, cancelled = () => false) {
    return new Promise(resolve => {
      if (cancelled()) return resolve(null);
      const find = () => [...document.querySelectorAll(selector)].find(accept);
      const found = find();
      if (found) return resolve(found);
      const deadline = Date.now() + timeoutMs;
      const t = setInterval(() => {
        if (cancelled()) { clearInterval(t); resolve(null); return; }
        const el = find();
        if (el) { clearInterval(t); resolve(el); }
        else if (Date.now() > deadline) { clearInterval(t); resolve(null); }
      }, 250);
    });
  }

  // ─── NATIVE ARMORY PAGE: "who needs a loan" list ───────────────────────────
  // initArmoryAnnotations() (above) adds a per-row OC-need column, but only on
  // sub=utilities and only while the panel is open. This is different: a
  // standalone summary card at the TOP of ANY give-capable armory sub-tab,
  // reading a small snapshot persisted whenever the Crimes tab last computed
  // the worklist — so it still shows up if you land on the armory page
  // directly, without the OC Suite panel open at all.
  const NATIVE_LOAN_SUBS = new Set(Object.values(ARMORY_CATS).map(cat => cat.sub));
  // Roll-up state — a session-scoped toggle (not persisted to storage), so it
  // resets on a fresh page load but survives re-renders (hashchange between subs).
  let _nativeLoansCollapsed = false;
  let _nativeLoanListGeneration = 0;

  function nativeLoanCardHtml(snap) {
    const wrapStyle = 'background:#0f1728;border:1px solid #223a58;border-radius:8px;padding:12px 14px;margin:0 0 14px;color:#dbe6f5;font:12px/1.6 Arial,Helvetica,sans-serif';
    const toggleGlyph = _nativeLoansCollapsed ? '▸' : '▾';
    const toggleTitle = _nativeLoansCollapsed ? 'Expand' : 'Collapse';
    const head = (right) => `<div style="display:flex;align-items:center;gap:8px;cursor:pointer" id="ocm-native-loans-head">
      <b style="color:#5ad1e0;font-size:13px">🤝 OC Suite — Loans</b>${right}<span style="flex:1"></span>
      <button id="ocm-native-loans-toggle" style="background:none;border:none;color:#54637a;cursor:pointer;font-size:13px;line-height:1;padding:2px 4px" title="${toggleTitle}">${toggleGlyph}</button>
    </div>`;
    if (!snap) {
      return `<div id="ocm-native-loans-inner" style="${wrapStyle}">${head('')}
        <div id="ocm-native-loans-body" style="${_nativeLoansCollapsed ? 'display:none;' : ''}color:#8ea3bd;margin-top:4px">Open the faction's <b>Crimes</b> tab once (that's where OC Suite computes this) and the loan worklist will show up here.</div>
      </div>`;
    }
    const ageM = Math.max(0, Math.round((Date.now() / 1000 - (snap.ts || 0)) / 60));
    const ageTxt = ageM < 1 ? 'just now' : ageM < 60 ? `${ageM}m ago` : `${Math.round(ageM / 60)}h ago`;
    if (ageM > 5) {
      return `<div id="ocm-native-loans-inner" style="${wrapStyle}">${head(`<span style="color:#e0a83a;font-size:10.5px">as of ${ageTxt}</span>`)}
        <div id="ocm-native-loans-body" style="${_nativeLoansCollapsed ? 'display:none;' : ''}margin-top:6px">This loan worklist is out of date. <a href="/factions.php?step=your#/tab=crimes" style="color:#5ad1e0">Open Crimes and refresh OC Suite</a> before preparing loans or retrieving items.</div></div>`;
    }
    const loans = snap.loans || [];
    const returnable = snap.returnable || [];
    const types = snap.itemTypes || {};
    const subOf = (id) => ARMORY_CATS[catOfItemType(types[String(id)])]?.sub || '';

    const giveRow = (l) => `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #182840">
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
        <b style="color:#e8eef7">${OCUI.esc(l.name)}</b> <span style="color:#6d84a3">needs</span> ${OCUI.esc(l.itemName)}
        <span style="color:#6d84a3">— ${OCUI.esc(l.ocName || '')}</span>
      </span>
      ${l.inArmory
        ? `<a href="${armoryGiveUrl(subOf(l.itemId))}" class="ocm-loan-go" data-item="${OCUI.esc(String(l.itemId))}" data-itemname="${OCUI.esc(l.itemName)}" data-uid="${OCUI.esc(String(l.uid))}" data-member="${OCUI.esc(l.name)}" data-sub="${subOf(l.itemId)}" style="color:#5ad1e0;font-weight:700;text-decoration:none;white-space:nowrap">Give ▸</a>`
        : `<span style="color:#c97a7a;white-space:nowrap;font-size:11px">not stocked</span>`}
    </div>`;
    const retrieveRow = (r) => `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #182840">
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
        <b style="color:#e8eef7">${OCUI.esc(r.holderName)}</b> <span style="color:#6d84a3">holds unneeded</span> ${OCUI.esc(r.itemName)}
      </span>
      <a href="${armoryGiveUrl(subOf(r.itemId))}" class="ocm-loan-go" data-mode="retrieve" data-item="${OCUI.esc(String(r.itemId))}" data-itemname="${OCUI.esc(r.itemName)}" data-uid="${OCUI.esc(String(r.uid))}" data-member="${OCUI.esc(r.holderName)}" data-sub="${subOf(r.itemId)}" style="color:#e0a83a;font-weight:700;text-decoration:none;white-space:nowrap">Retrieve ▸</a>
    </div>`;

    let body;
    if (!loans.length && !returnable.length) {
      body = `<div style="color:#6fbf8f;margin-top:4px">✓ Nothing to loan or retrieve right now.</div>`;
    } else {
      body = (loans.length ? `<div style="margin-top:6px">${loans.map(giveRow).join('')}</div>` : '')
        + (returnable.length ? `<div style="margin-top:${loans.length ? 10 : 6}px;color:#8ea3bd;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em">Retrievable — held but not needed</div>${returnable.map(retrieveRow).join('')}` : '');
    }
    return `<div id="ocm-native-loans-inner" style="${wrapStyle}">${head(`<span style="color:#54637a;font-size:10.5px">as of ${ageTxt}</span>`)}<div id="ocm-native-loans-body" style="${_nativeLoansCollapsed ? 'display:none' : ''}">${body}</div></div>`;
  }

  /** Mount (or refresh) the native-page loans card above the item list. */
  async function mountNativeLoanList() {
    const generation = ++_nativeLoanListGeneration;
    if (!location.href.includes('factions.php')) return;
    if (!location.hash.includes('tab=armoury')) return;
    const subMatch = location.hash.match(/sub=([a-z]+)/i);
    const sub = activeArmourySub() || (subMatch ? subMatch[1].toLowerCase() : '');
    if (!NATIVE_LOAN_SUBS.has(sub)) return; // Loot/Points/Deposit aren't give-able

    const cancelled = () => generation !== _nativeLoanListGeneration || !location.hash.includes('tab=armoury');
    const firstRow = await waitForEl('.item-list li .img-wrap[data-itemid]', 15000,
      el => nativeArmouryWrap()?.contains(el), cancelled);
    if (!firstRow) return;
    const wrap = nativeArmouryWrap();
    if (!wrap || !wrap.parentElement) return;

    let card = document.getElementById('ocm-native-loans');
    if (!card) {
      card = document.createElement('div');
      card.id = 'ocm-native-loans';
      wrap.parentElement.insertBefore(card, wrap);
    }
    let snap = null;
    try { snap = JSON.parse(GM_getValue(GMK.LOAN_SNAPSHOT, 'null')); } catch (_) {}
    card.innerHTML = nativeLoanCardHtml(snap);
    wireLoanGoButtons(card);
    const toggle = () => {
      _nativeLoansCollapsed = !_nativeLoansCollapsed;
      const body = card.querySelector('#ocm-native-loans-body');
      const btn = card.querySelector('#ocm-native-loans-toggle');
      if (body) body.style.display = _nativeLoansCollapsed ? 'none' : '';
      if (btn) { btn.textContent = _nativeLoansCollapsed ? '▸' : '▾'; btn.title = _nativeLoansCollapsed ? 'Expand' : 'Collapse'; }
    };
    card.querySelector('#ocm-native-loans-toggle')?.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
    card.querySelector('#ocm-native-loans-head')?.addEventListener('click', toggle);
  }

  // ─── NATIVE CRIMES PAGE: payout estimate on Torn's OWN OC cards ────────────
  // The 💰 chip on the suite's cards only helps while the panel is open; this puts
  // the same figure on Torn's native OC list underneath it.
  //
  // Torn's OC 2.0 markup is CSS-module hashed (panelTitle____Ko9_) and those hashes
  // change on any deploy, so nothing here depends on a full class name: cards come
  // from the stable `data-oc-id` attribute, the title from a `[class*="panelTitle"]`
  // PREFIX match, and if even that moves we fall back to scanning leaf nodes for
  // text matching a known scenario name.
  const OCM_MONEY_BADGE = 'ocm-oc-money-badge';

  /** The element holding an OC card's name, without depending on hashed classes. */
  function nativeOcTitleEl(card) {
    const byClass = card.querySelector('[class*="panelTitle"]');
    if (byClass) return byClass;
    return [...card.querySelectorAll('p,h1,h2,h3,h4,span,div')]
      .find(e => e.children.length === 0 && OC_MONEY_ESTIMATES[ocLookupKey(e.textContent)]) || null;
  }

  /**
   * Style the native badge from the PANEL's own theme rather than hardcoded
   * colours, so it matches whatever skin the user is running — including the
   * custom and colourblind presets. The theme vars live on #ocm-root and can't
   * cascade here (Torn's cards are outside it), so we resolve them and inline the
   * results. `stamp` lets the painter detect a theme change and repaint.
   */
  function nativeBadgeSkin() {
    const root = document.getElementById('ocm-root');
    let bg = '#0f1728', border = '#223a58', fg = '#e0a83a', glow = 'rgba(224,168,58,.18)';
    if (root) {
      const cs = getComputedStyle(root);
      const v = (n, fb) => (cs.getPropertyValue(n) || '').trim() || fb;
      bg     = v('--ocm-bg-card', bg);
      border = v('--ocm-border-soft', border);
      fg     = v('--ocm-cpr-warn', fg);
      glow   = 'transparent';   // panel chips are flat; keep the glow for the title only
    }
    return {
      stamp: `${bg}|${border}|${fg}`,
      css: 'display:inline-block;margin-left:8px;padding:1px 7px;border-radius:5px;'
         + `background:${bg};color:${fg};border:1px solid ${border};`
         + (glow !== 'transparent' ? `box-shadow:0 0 8px ${glow};` : '')
         + "font:700 10px/1.7 'Segoe UI',Arial,Helvetica,sans-serif;letter-spacing:.02em;"
         + 'white-space:nowrap;vertical-align:middle;font-variant-numeric:tabular-nums',
    };
  }

  let _ocMoneyPainting = false;
  let _ocmMoneyObserver = null;
  let _ocmMoneyObservedRoot = null;
  let _ocmMoneyInitGeneration = 0;
  function annotateNativeOcCards() {
    if (_ocMoneyPainting) return;
    _ocMoneyPainting = true;
    try {
      if (!GM_getValue(GMK.SHOW_MONEY_EST, true)) {
        document.querySelectorAll('.' + OCM_MONEY_BADGE).forEach(el => el.remove());
        return;
      }
      const skin = nativeBadgeSkin();
      for (const card of document.querySelectorAll('[data-oc-id]')) {
        const titleEl = nativeOcTitleEl(card);
        if (!titleEl) continue;
        const est = ocPayoutEstimate(titleEl.textContent);
        if (!est) continue;
        const label = '💰 ' + est.text;
        const sib = titleEl.nextElementSibling;
        if (sib && sib.classList.contains(OCM_MONEY_BADGE)) {
          if (sib.textContent === label && sib.dataset.skin === skin.stamp) continue; // current
          sib.remove();                              // scenario or theme changed
        }
        const b = document.createElement('span');
        b.className = OCM_MONEY_BADGE;
        b.dataset.skin = skin.stamp;
        b.textContent = label;
        b.title = est.title;
        b.style.cssText = skin.css;
        titleEl.insertAdjacentElement('afterend', b);
      }
    } finally { _ocMoneyPainting = false; }
  }

  /** Paint the native cards, and keep them painted across Torn's own re-renders. */
  async function initNativeOcMoney() {
    const generation = ++_ocmMoneyInitGeneration;
    if (_ocmMoneyObserver) _ocmMoneyObserver.disconnect();
    _ocmMoneyObserver = null;
    _ocmMoneyObservedRoot = null;
    if (!location.href.includes('factions.php')) return;
    if (!location.hash.includes('tab=crimes')) return;
    const cancelled = () => generation !== _ocmMoneyInitGeneration || !location.hash.includes('tab=crimes');
    const root = (await waitForEl('#faction-crimes-root', 15000, () => true, cancelled))
              || document.querySelector('[data-oc-id]')?.parentElement?.parentElement;
    if (!root || cancelled()) return;
    if (!root.isConnected) return;
    annotateNativeOcCards();
    if (_ocmMoneyObservedRoot === root && _ocmMoneyObserver) return;
    if (_ocmMoneyObserver) _ocmMoneyObserver.disconnect();
    _ocmMoneyObservedRoot = root;
    // Torn rebuilds this list on every Recruiting/Planning/Completed switch and on
    // its own polling, which wipes the badges. Repaint when it does — debounced so a
    // burst of mutations costs one pass, and guarded so our own inserts don't
    // retrigger it.
    let t = null;
    const observer = new MutationObserver(() => {
      if (cancelled() || !root.isConnected) {
        observer.disconnect();
        if (_ocmMoneyObserver === observer) {
          _ocmMoneyObserver = null;
          _ocmMoneyObservedRoot = null;
        }
        return;
      }
      if (_ocMoneyPainting) return;
      clearTimeout(t);
      t = setTimeout(annotateNativeOcCards, 120);
    });
    _ocmMoneyObserver = observer;
    observer.observe(root, { childList: true, subtree: true });
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
  let _loanAutofillGeneration = 0;
  function initLoanAutofill() {
    if (!location.href.includes('factions.php')) return;
    if (!location.hash.includes('tab=armoury')) return;
    const intent = takeLoanIntent();
    if (!intent) return;
    const generation = ++_loanAutofillGeneration;
    if (!/^\d+$/.test(String(intent.itemId)) || !/^\d+$/.test(String(intent.uid))) { ocmToast('Invalid item or member ID. Select the loan again.', 'warn'); return; }
    const retrieving = intent.mode === 'retrieve';

    // Torn paginates the armory item list (50/page, real numbered pages —
    // confirmed live: Construction Helmet sat on page 2 while this only ever
    // checked page 1). Give the current page a moment to settle, then click
    // the paginator's own "next" arrow and keep looking, up to MAX_PAGES.
    const MAX_PAGES = 8;
    const PAGE_SETTLE_MS = 1600;
    let pagesTried = 1;
    let pageDeadline = Date.now() + PAGE_SETTLE_MS;
    function tryAdvancePage() {
      if (pagesTried >= MAX_PAGES) return false;
      const nums = [...document.querySelectorAll('a.page-number')];
      const active = nums.find(a => a.classList.contains('active'));
      const last   = nums.find(a => a.classList.contains('last'));
      const activeN = active ? Number(active.textContent.trim()) : null;
      const lastN   = last ? Number(last.textContent.trim()) : null;
      if (activeN != null && lastN != null && activeN >= lastN) return false; // already last page
      // Torn renders a spare, hidden `.pagination-wrap` alongside the real one —
      // clicking its arrow is a silent no-op that would burn the whole page
      // budget without ever advancing. Only ever click a VISIBLE arrow.
      const nextArrow = [...document.querySelectorAll('i.pagination-right')]
        .find(el => el.offsetParent !== null)?.closest('a');
      if (!nextArrow) return false;
      nextArrow.click();
      pagesTried++;
      pageDeadline = Date.now() + PAGE_SETTLE_MS + 400;
      return true;
    }

    // ── Phase 0: get into the right CATEGORY before hunting for rows.
    // Torn picks the armoury's initial sub-tab from a `type=` query param, not
    // from `sub=` in the hash, so we can't route by URL from outside the
    // armoury — arriving from the Crimes tab lands on the first tab (Weapons)
    // no matter what `sub=` says. Clicking the tab anchor is the only reliable
    // switch, so do it here (rather than at click time) — this runs on boot and
    // on hashchange too, so it covers every way of arriving.
    let wantSub = intent.sub || activeArmourySub() || null;
    let subDeadline = Date.now() + 15000;
    const searchDeadline = Date.now() + 120000;
    const visitedSubs = new Set(wantSub ? [wantSub] : []);
    function tryNextCategory() {
      const next = [...document.querySelectorAll('#faction-armoury-tabs a[href]')]
        .filter(a => a.offsetParent !== null)
        .map(a => ((a.getAttribute('href') || '').match(/(?:[?&#])sub=([a-z]+)(?:&|$)/i) || [])[1]?.toLowerCase())
        .find(sub => sub && NATIVE_LOAN_SUBS.has(sub) && !visitedSubs.has(sub));
      if (!next || Date.now() >= searchDeadline) return false;
      visitedSubs.add(next); wantSub = next; pagesTried = 1;
      subDeadline = Date.now() + 15000; lastSubClick = 0;
      pageDeadline = Date.now() + PAGE_SETTLE_MS;
      return true;
    }
    let lastSubClick = 0;
    /** @returns {'ready'|'waiting'|'timeout'} */
    function ensureCategory() {
      if (!wantSub) return 'ready';
      if (!document.getElementById('faction-armoury-tabs')) {
        return Date.now() > subDeadline ? 'timeout' : 'waiting';   // armoury still rendering
      }
      if (activeArmourySub() === wantSub) return 'ready';
      // Re-click periodically rather than once: the tab strip can re-render
      // underneath us while the armoury is still settling, dropping the click.
      if (Date.now() - lastSubClick > 1200) {
        const link = armouryTabLink(wantSub);
        if (link) {
          link.click();
          lastSubClick = Date.now();
          pagesTried = 1;                                  // new category, page 1
          pageDeadline = Date.now() + PAGE_SETTLE_MS + 400;
        }
      }
      return Date.now() > subDeadline ? 'timeout' : 'waiting';
    }

    const tick = setInterval(() => {
      if (generation !== _loanAutofillGeneration) { clearInterval(tick); return; }
      if (!location.hash.includes('tab=armoury') || Date.now() >= searchDeadline) {
        clearInterval(tick); ocmToast('Armory search stopped. Select the loan again when ready.', 'warn'); return;
      }
      const cat = ensureCategory();
      if (cat === 'timeout') {
        if (tryNextCategory()) return;
        clearInterval(tick);
        ocmToast(`Couldn't open the ${wantSub} armoury tab for ${intent.itemName}. Open it manually and try again.`, 'warn');
        return;
      }
      if (cat === 'waiting') return;

      const rows = [...document.querySelectorAll(`.img-wrap[data-itemid="${intent.itemId}"]`)]
        .filter(w => w.offsetParent !== null).map(w => w.closest('li')).filter(Boolean);
      if (!rows.length) {
        if (Date.now() > pageDeadline) {
          if (tryAdvancePage()) return; // moved to a new page — keep polling
          if (tryNextCategory()) return;
          clearInterval(tick);
          ocmToast(retrieving
            ? `Couldn't find ${intent.itemName} on any of ${pagesTried} page${pagesTried > 1 ? 's' : ''} checked for ${intent.memberName}. It may have already been returned, or check manually.`
            : `Couldn't find ${intent.itemName} in the armoury (checked ${pagesTried} page${pagesTried > 1 ? 's' : ''}).`, 'warn');
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
        // Rows for this item id ARE on this page, just not the specific
        // instance we need (e.g. someone else's copy) — the target instance
        // can still be sitting on another page, so the same page-sweep applies.
        if (Date.now() > pageDeadline) {
          if (tryAdvancePage()) return;
          if (tryNextCategory()) return;
          clearInterval(tick);
          ocmToast(retrieving
            ? `${intent.memberName} no longer appears to be holding ${intent.itemName} (checked ${pagesTried} page${pagesTried > 1 ? 's' : ''}).`
            : `No free ${intent.itemName} in the armory to loan (checked ${pagesTried} page${pagesTried > 1 ? 's' : ''}).`, 'warn');
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
        if (!rBtn || rBtn.getAttribute('aria-disabled') === 'true' || rBtn.classList.contains('disabled')) {
          ocmToast('No enabled Retrieve option on that row. Check faction permissions or handle it manually.', 'warn');
          return;
        }
        rBtn.click();
        ocmToast(`Retrieving ${intent.itemName} from ${intent.memberName}.`, 'ok');
        return;
      }

      // ── Give: open the loan form on THIS row and fill it in.
      const loanLink = row.querySelector('a[data-role="loan"]');
      if (!loanLink || loanLink.getAttribute('aria-disabled') === 'true' || loanLink.classList.contains('disabled')) {
        ocmToast('No enabled Loan option on this item. Check faction loaning permissions or handle it manually; Give and Use were not selected.', 'warn');
        return;
      }
      if (!row.classList.contains('item-loan-act') && loanLink) loanLink.click();

      const formDeadline = Date.now() + 5000;
      const fillTick = setInterval(() => {
        if (generation !== _loanAutofillGeneration) { clearInterval(fillTick); return; }
        if (!row.isConnected || activeArmourySub() !== wantSub || !location.hash.includes('tab=armoury')) { clearInterval(fillTick); return; }
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
  const SHARE_SAVE_UNVERIFIED = 'Could not verify that member shares were saved. Check the values and try again.';
  function saveShareByDiff(table) {
    const payload = JSON.stringify(table);
    let verified = false;
    // Torn PDA's GM bridge may return normally when shared storage rejects a write.
    try {
      GM_setValue(GMK.SHARE_BY_DIFF, payload);
      verified = GM_getValue(GMK.SHARE_BY_DIFF, null) === payload;
    } catch (_) {}
    if (!verified) table = loadShareByDiff();
    for (const inp of document.querySelectorAll('.ocm-share-lv, .ocm-cfg-share-lv')) {
      const v = table[inp.dataset.lv];
      if (v != null) inp.value = v;
    }
    return verified;
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
    try { return JSON.parse(OCBulkStore.getRaw(GMK.OC_ARCHIVE, '{}')) || {}; } catch (_) { return {}; }
  }
  function saveOcArchive(arc) {
    try { OCBulkStore.setRaw(GMK.OC_ARCHIVE, JSON.stringify(arc)); } catch (e) {
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
    OCBulkStore.setRaw(GMK.OC_ARCHIVE_META, JSON.stringify({
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

  // Shared OC + armoury inputs, stashed each render so the Armoury → OC Stock
  // view can call analyseOcItems() without re-fetching.
  let _armDataCache = null;
  const _financePages = { ocs: 0, paid: 0, unpaid: 0 };
  function financePage(rows, key) {
    const mobilePageSize = ocIsPhoneLayout() ? 10 : 50;
    const pages = Math.max(1, Math.ceil(rows.length / mobilePageSize));
    const page = _financePages[key] = Math.max(0, Math.min(_financePages[key] || 0, pages - 1));
    return {
      rows: rows.slice(page * mobilePageSize, (page + 1) * mobilePageSize),
      controls: `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:8px 0" role="group" aria-label="${key === 'ocs' ? 'OC history' : key + ' payouts'} pages">
        <button type="button" data-fin-page="${key}" data-step="-1" ${page === 0 ? 'disabled' : ''} style="min-height:44px">Previous</button>
        <span>${rows.length} records · ${page + 1} / ${pages}</span>
        <button type="button" data-fin-page="${key}" data-step="1" ${page >= pages - 1 ? 'disabled' : ''} style="min-height:44px">Next</button></div>`,
    };
  }
  function renderFinanceSection(crimes, armory = {}, itemNames = {}, itemValues = {}, loanedOut = [], memberNames = {}, itemTypes = {}) {
    const _ocViewState = captureOcViewState(document.getElementById('ocm-root'));
    try {
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
    _armDataCache = { crimes, armory, itemNames, itemValues, memberNames, itemTypes };
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
      return { cost: 0, costItems: {}, unknownCost: true };
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
    // Observed payout per scenario, from our OWN completed runs (cash + item value
    // priced at market). This is what lets the 💰 estimate show real money for
    // scenarios the wiki only describes as an "item reward" — an item payout IS a
    // payout, it just has to be priced. Built from the UNFILTERED record set: the
    // profit view's date window is a display preference and shouldn't shrink the
    // sample behind the estimate.
    _ocPayoutObserved = {};
    for (const r of records) {
      const k = ocLookupKey(r.name);
      if (!k) continue;
      const total = (Number(r.money) || 0) + (Number(r.itemValue) || 0);
      if (total <= 0) continue;                    // nothing priced — don't count it
      const e = _ocPayoutObserved[k] || (_ocPayoutObserved[k] = { min: Infinity, max: 0, sum: 0, n: 0 });
      e.min = Math.min(e.min, total);
      e.max = Math.max(e.max, total);
      e.sum += total;
      e.n   += 1;
    }
    for (const e of Object.values(_ocPayoutObserved)) e.avg = Math.round(e.sum / e.n);

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
      const { cost, costItems, unknownCost } = resolveCost(r);
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
      perOc.push({ id: r.id, name, revenue: rev, cost, costKnown: !unknownCost, net, executedAt: r.executedAt || 0,
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
      // Definitive gate: is this item, by NAME, one of the ~55 items any OC
      // scenario has ever actually required? Every previous approach here tried
      // to INFER OC-relevance from live data (item category, "was this ever a
      // requirement somewhere", "do they hold a whole kit") and each one still
      // let real war-loadout gear through (Combat Helmet, AK-47, Riot gear,
      // Pepper Spray, etc — proven live, 147 false positives at one point).
      // wiki.torn.com/wiki/Organized_Crime_2.0 publishes the complete table of
      // every scenario's item requirements, so there's no need to infer anymore
      // — OC_KNOWN_ITEM_NAMES below is that exact list. If Torn ships a new
      // scenario with a new item, it won't show here until this list is updated.
      const holdName = l.itemName || itemName(l.itemId);
      if (!isKnownOcItem(holdName)) continue;
      // Grenades: user call — not worth flagging for retrieval even when they
      // ARE a real OC requirement (Flash/Smoke Grenade). Cheap, consumable-in-
      // spirit, and not something worth chasing a member down over.
      if (/grenade/i.test(holdName)) continue;
      // NOTE: a ui54 attempt added a ledger cross-check here ("did this member
      // ever withdraw this exact item from the armoury"), reasoning that Torn
      // lets a member satisfy an OC requirement with a personally-equipped item
      // that never touches the faction armory. Removed in ui57 — that theory
      // was based on a wrong live-test (Construction Helmet looked like it had
      // 0 rows anywhere, but that was pagination blindness, not a real
      // equipped-item case — see ui56). loanedOut's `loaned_to` field comes
      // straight from the faction's OWN armory API, which is already the
      // authoritative source for "is this actually a faction loan" — no
      // secondary ledger check needed, and the ledger one was producing false
      // negatives (hiding confirmed-real loans the ledger just hadn't logged).
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

    // Hand the computed loan worklist + retrievables to the Armoury → Loans view.
    if (_armDataCache) { _armDataCache.loans = loans; _armDataCache.returnable = returnable; }

    // Also persist a small snapshot to GM storage so the list can show on Torn's
    // OWN native armory page even when it's opened directly, without the Crimes
    // tab (where this is computed) ever having been open this page load.
    try {
      GM_setValue(GMK.LOAN_SNAPSHOT, JSON.stringify({
        loans, returnable, itemTypes: _armDataCache?.itemTypes || {}, ts: Math.floor(Date.now() / 1000),
      }));
    } catch (_) {}

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
        const hasRecordedSplit = r.native?.percentage != null;
        const pctSrc = hasRecordedSplit ? 'recorded payout split' : `level ${r.difficulty ?? '?'} setting`;
        const perHead = (r.money > 0 && pCount > 0) ? (r.money * pct / 100) / pCount : 0;
        const rewardLines = Object.entries(r.items).map(([iid, qty]) => {
          const unit = Number(itemValues[iid]) || 0;
          return `<div>· <a href="${marketUrlOf(iid)}" target="_blank" style="color:var(--ocm-link);text-decoration:none">${esc(itemName(iid))}</a> ×${qty}${unit?` <span style="color:var(--ocm-text-muted)">@ ${fmtMoney(unit)} = ${fmtMoney(unit*qty)}</span>`:''}</div>`;
        }).join('') || '<div style="color:var(--ocm-text-muted)">none</div>';
        const costLines = Object.entries(r.costItems).map(([iid, ci]) => {
          const unit = Number(ci.unit) || Number(itemValues[iid]) || 0;
          return `<div>· <a href="${marketUrlOf(iid)}" target="_blank" style="color:var(--ocm-link);text-decoration:none">${esc(itemName(iid))}</a> ×${ci.qty}${unit?` <span style="color:var(--ocm-text-muted)">@ ${fmtMoney(unit)} = ${fmtMoney(unit*ci.qty)}</span>`:''}</div>`;
        }).join('') || (r.costKnown === false ? '<div class="ocm-cost-unknown" style="color:var(--ocm-cpr-warn)">Unknown — this OC predates item cost tracking.</div>' : '<div style="color:var(--ocm-text-muted)">none (no consumed materials)</div>');
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
              ${r.money > 0 && pCount > 0 ? `<div style="margin-top:2px">${hasRecordedSplit ? 'Calculated' : 'Estimated'} per member: <b>${fmtMoney(perHead)}</b> <span style="color:var(--ocm-text-muted)">(${pct}% of cash split among ${pCount}; ${esc(pctSrc)})</span></div>` : ''}
              ${r.native
                ? `<div style="margin-top:6px;font-size:11px;color:${r.native.paid?'var(--ocm-cpr-good)':'var(--ocm-cpr-warn)'}" title="From Torn's own OC payout record — not editable here.">${r.native.paid
                    ? `✓ Paid ${dateStr(r.native.at)}${r.native.percentage!=null?` · ${r.native.percentage}% to members`:''}`
                    : '⏳ Awaiting payout — handle it on the OC page'}</div>`
                : `<button class="ocm-paid-btn" data-oc="${esc(String(r.id))}" style="margin-top:6px;font-size:11px;padding:3px 10px;border-radius:4px;cursor:pointer;border:1px solid ${r.paid?'var(--ocm-cpr-good)':'#3a3018'};background:${r.paid?'#12200f':'#1c1810'};color:${r.paid?'var(--ocm-cpr-good)':'var(--ocm-cpr-warn)'}">${r.paid?'✓ Paid — click to unmark':'Mark paid'}</button>`}
            </div>
          </div>`;
      };
      const ocPage = financePage(perOc, 'ocs');
      const rows = ocPage.rows.map(r => `<tr class="ocm-fin-ocrow" data-oc="${esc(String(r.id))}" style="cursor:pointer">
          <td style="color:var(--ocm-text-muted);white-space:nowrap">${dateStr(r.executedAt)}</td>
          <td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.name)} — click for full breakdown">▸ ${esc(r.name)}</td>
          <td class="td-right" style="color:var(--ocm-text-dim)">${fmtMoney(r.revenue)}</td>
          <td class="td-right" style="color:var(--ocm-cpr-crit)">${r.costKnown === false ? '<span class="ocm-cost-unknown" style="color:var(--ocm-cpr-warn)">Unknown</span>' : negCost(r.cost)}</td>
          <td class="td-right" style="color:${netColor(r.net)};font-weight:bold">${r.costKnown === false ? '~ ' : ''}${fmtMoney(r.net)}</td>
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
            Set the estimated member share per OC level when Torn has no recorded payout split.
            Changing these settings does not affect recorded splits.
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
            <span id="ocm-share-msg" role="status" style="font-size:11px;color:var(--ocm-cpr-good);margin-left:4px"></span>
          </div>
        </div>
        <div style="font-size:10px;color:var(--ocm-text-muted);margin-bottom:6px">Click a row for the full breakdown — rewards, consumed materials, crew, suggested split, and the Paid toggle. Paid ✓/• column tracks which cash payouts you've distributed.</div>
        <div style="max-height:460px;overflow-y:auto;border:1px solid var(--ocm-border-soft);border-radius:6px">
          <table class="ocm-analytics-table" style="table-layout:fixed;width:100%;margin:0">
            <thead><tr><th style="width:56px">Date</th><th style="width:auto">OC</th>
              <th class="td-right" style="width:76px">Revenue</th><th class="td-right" style="width:70px">Cost</th>
              <th class="td-right" style="width:78px">Net</th><th style="width:38px;text-align:center">Paid</th></tr></thead>
            <tbody>${rows}</tbody></table></div>${ocPage.controls}`;
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

    // Loans and retrievable-item calculation lives above because Armoury ? Loans
    // consumes it. Its UI is deliberately rendered there: People is member health,
    // while issuing/retrieving faction stock belongs in Armoury.


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
      const ocTable = (rows, title, note, paid) => {
        if (!rows.length) return '';
        const page = financePage(rows, paid ? 'paid' : 'unpaid');
        return `
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
          <tbody>${ocRows(page.rows, paid)}</tbody></table>${page.controls}`;
      };

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
        const key = hubEffectiveTornKey();
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
          setTimeout(() => loadData(hubEffectiveTornKey()), 800);
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

    // Sub-tab badges owned by this render
    const setSb = (id, val, attn) => {
      const b = document.getElementById(id);
      if (!b) return;
      b.textContent = val;
      b.style.display = val ? '' : 'none';
      b.classList.toggle('has-attn', !!attn);
    };
    setSb('ocm-sb-costs',    summary.armoryGaps, summary.armoryGaps > 0);
    setSb('ocm-sb-payouts',  unpaidCount,        unpaidCount > 0);

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
    const rerender = () => renderFinanceSection(crimes, armory, itemNames, itemValues, loanedOut, memberNames, itemTypes);
    el.querySelectorAll('[data-fin-page]').forEach(button => button.addEventListener('click', () => {
      const key = button.dataset.finPage;
      if (!Object.hasOwn(_financePages, key)) return;
      _financePages[key] += Number(button.dataset.step);
      rerender();
      el.querySelector(`[data-fin-page="${key}"][data-step="${button.dataset.step}"]`)?.focus();
    }));
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

    // ── record the loan intent + navigate to the item's row in place (no new tab)
    wireLoanGoButtons(el);

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
    const commitShares = table => {
      if (saveShareByDiff(table)) rerender();
      else if (shareMsg) {
        shareMsg.style.color = 'var(--ocm-cpr-warn)';
        shareMsg.textContent = SHARE_SAVE_UNVERIFIED;
      }
    };
    document.getElementById('ocm-share-save')?.addEventListener('click', () => commitShares(readShareInputs('.ocm-share-lv')));
    document.getElementById('ocm-share-reset')?.addEventListener('click', () => commitShares({ ...DEFAULT_SHARE_BY_DIFF }));

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
    } finally { restoreOcViewState(_ocViewState); }
  }


  // Exact crime/role coverage only: never substitute another role for a missing record.
  function buildCprCoverage(memberMap, live = {}, ts = {}, archive = {}, history = {}) {
    const members = Object.entries(memberMap || {}).map(([id, m]) => ({ uid: String(m.id || id), name: m.name || '#' + id }))
      .filter(m => /^\d+$/.test(m.uid));
    const roster = new Map(members.map(m => [m.uid, m.name]));
    const crimes = new Map();
    const norm = s => String(s || '').trim().toLowerCase().replace(/\s*#\d+$/, '');
    const add = (uid, crime, role, value, source, at = 0) => {
      if (!roster.has(String(uid)) || value == null || typeof value === 'boolean' || String(value).trim() === '') return;
      const cpr = Number(value), ck = norm(crime), rk = norm(role);
      if (!ck || !rk || !Number.isFinite(cpr) || cpr < 0 || cpr > 100) return;
      if (!crimes.has(ck)) crimes.set(ck, { name: crime, roles: new Map() });
      const bucket = crimes.get(ck).roles;
      if (!bucket.has(rk)) bucket.set(rk, new Map());
      const records = bucket.get(rk), old = records.get(String(uid));
      const priority = { History: 1, TornStats: 2, Live: 3 };
      if (old && (priority[old.source] > priority[source] || (old.source === source && old.at > at))) return;
      records.set(String(uid), { uid: String(uid), name: roster.get(String(uid)), cpr, source, at });
    };
    for (const [uid, cs] of Object.entries(ts || {}))
      for (const [crime, roles] of Object.entries(cs || {}))
        for (const [role, value] of Object.entries(roles || {})) add(uid, crime, role, value, 'TornStats');
    for (const [uid, cs] of Object.entries(history || {}))
      for (const [crime, roles] of Object.entries(cs || {}))
        for (const [role, entry] of Object.entries(roles || {}))
          if (entry?.count > 0) add(uid, crime, role, entry.sum / entry.count, 'History');
    for (const [uid, entry] of Object.entries(archive || {}))
      for (const slot of Object.values(entry?.slots || {}))
        if (Number(slot.executedAt) > 0) add(uid, slot.ocName, slot.role, slot.cpr, 'History', Number(slot.executedAt));
    for (const [uid, cs] of Object.entries(live || {}))
      for (const [crime, roles] of Object.entries(cs || {}))
        for (const [role, value] of Object.entries(roles || {})) add(uid, crime, role, value, 'Live');
    const byCrime = Object.create(null);
    for (const { name, roles } of crimes.values())
      byCrime[name] = Object.fromEntries([...roles].map(([role, records]) => [role, [...records.values()]]));
    return { members, byCrime };
  }

  function renderTsCoverage(memberMap) {
    const el = document.getElementById('ocm-tscoverage');
    if (!el) return;
    const model = buildCprCoverage(memberMap, {}, tsCprData, cprArchive(), window._ocmHistoryCpr || {});
    const imported = new Set(), historical = new Set();
    for (const roles of Object.values(model.byCrime))
      for (const records of Object.values(roles))
        for (const record of records) (record.source === 'TornStats' ? imported : historical).add(record.uid);
    el.innerHTML = '<div style="padding:12px;line-height:1.6">'
      + '<strong>' + model.members.length + ' faction members · ' + imported.size + ' with TornStats records</strong>'
      + '<br>' + historical.size + ' members have historical fallback records for roles missing from TornStats.'
      + '<br>Coverage varies by crime and role. One matching record is useful; a missing value is unknown, not 0%.'
      + '<br>TornStats returns the records available to your key, not necessarily every faction member. Check faction CPR sharing on TornStats; refresh the import in Config → Fetch CPR.'
      + '<br>History uses locally available completed OCs. It cannot recover records that have never been loaded.</div>';
  }

  function renderTsCprSection(memberMap, liveCprMap = {}) {
    const el = document.getElementById('ocm-tscpr'), title = document.getElementById('ocm-title-tscpr');
    if (!el) return;
    const previous = el.querySelector('[data-cpr-crime]')?.value;
    const model = buildCprCoverage(memberMap, liveCprMap, tsCprData, cprArchive(), window._ocmHistoryCpr || {});
    const crimes = Object.keys(model.byCrime).sort((a, b) => a.localeCompare(b));
    if (title) title.textContent = '📈 CPR Data — ' + model.members.length + ' faction members';
    if (!crimes.length) {
      el.innerHTML = '<p>No exact CPR records available from current slots, TornStats, or loaded completed OCs. Import CPR in Config or load OC history. Missing data is not a 0% pass rate.</p>';
      return;
    }
    el.innerHTML = '<label>Crime <select data-cpr-crime style="max-width:100%;min-height:44px">'
      + crimes.map(c => '<option value="' + esc(c) + '">' + esc(c) + '</option>').join('')
      + '</select></label><p>Current slot → TornStats → historical fallback. History is a past observation, not a current guarantee. Repeated numbered positions share their role.</p>'
      + '<div data-cpr-summary role="status"></div><div style="max-width:100%;overflow-x:auto" tabindex="0" aria-label="Member CPR table"><table class="ocm-tscpr-table"><thead></thead><tbody></tbody></table></div>';
    const select = el.querySelector('[data-cpr-crime]');
    if (crimes.includes(previous)) select.value = previous;
    const draw = () => {
      const roles = model.byCrime[select.value], names = Object.keys(roles).sort();
      const records = new Map();
      for (const role of names) for (const entry of roles[role]) {
        if (!records.has(entry.uid)) records.set(entry.uid, {});
        records.get(entry.uid)[role] = entry;
      }
      el.querySelector('[data-cpr-summary]').textContent = records.size + ' / ' + model.members.length
        + ' members have at least one exact-role record · ' + (model.members.length - records.size) + ' have no records for this crime';
      el.querySelector('thead').innerHTML = '<tr><th scope="col">Member</th>'
        + names.map(r => '<th scope="col">' + esc(r) + '</th>').join('') + '</tr>';
      el.querySelector('tbody').innerHTML = [...model.members].sort((a, b) => a.name.localeCompare(b.name)).map(m =>
        '<tr><th scope="row">' + esc(m.name) + '</th>' + names.map(role => {
          const entry = records.get(m.uid)?.[role];
          return entry ? '<td>' + Math.round(entry.cpr * 10) / 10 + '%<small style="display:block">' + entry.source + '</small></td>'
            : '<td title="No exact crime and role record">—<small style="display:block">Missing</small></td>';
        }).join('') + '</tr>').join('');
    };
    select.addEventListener('change', draw);
    draw();
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
  let _ocmRefreshOwner = 0;
  // Torn replaces the Crimes pane during SPA navigation. Keep one route watcher
  // for the lifetime of this userscript; adding one from every off-route inject()
  // call retains a closure (and, through it, the whole suite) forever.
  let _ocmInjectRouteHandler = null;
  let _ocmInjectTimer = null;
  let _ocmInjectObserver = null;
  function clearInjectWait() {
    _ocmInjectObserver?.disconnect();
    _ocmInjectObserver = null;
    clearTimeout(_ocmInjectTimer);
    _ocmInjectTimer = null;
  }
  async function loadData(apiKey) {
    apiKey = hubEffectiveTornKey();
    if (!apiKey || (typeof hubBindingAwake === 'function' && !hubBindingAwake())) return;
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
    const refreshOwner = ++_ocmRefreshOwner;
    if (typeof hubBindingPending !== 'undefined') hubBindingPending = false;
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
        // The await above can outlive a SPA navigation away from the Crimes tab —
        // re-check before touching any DOM (renderMemberDashboard self-guards, but
        // the key-status line below doesn't go through it).
        if (!btn.isConnected) { _ocmLoadInFlight = false; if (typeof hubBindingPending !== 'undefined' && hubBindingPending) hubBindingQueueRefresh(); return; }
        window._ocmDebug = { mode: 'member', fetchedAt: Date.now(), data, forced: true };
        renderMemberDashboard(data);
        document.getElementById('ocm-key-status').textContent = `Key saved ✓ · Member Mode (forced) · ↻${REFRESH_S}s`;
        btn.innerHTML = '↻ Refresh';
        btn.disabled  = false;
        _ocmLoadInFlight = false; if (typeof hubBindingPending !== 'undefined' && hubBindingPending) hubBindingQueueRefresh();
        return;
      } catch (memberErr) {
        if (!btn.isConnected) { _ocmLoadInFlight = false; if (typeof hubBindingPending !== 'undefined' && hubBindingPending) hubBindingQueueRefresh(); return; }
        document.getElementById('ocm-body').style.display = 'block';
        errEl.innerHTML = `&#9888; Member mode fetch failed: ${memberErr.message}`;
        errEl.style.display = 'block';
        btn.innerHTML = '↻ Refresh';
        btn.disabled  = false;
        _ocmLoadInFlight = false; if (typeof hubBindingPending !== 'undefined' && hubBindingPending) hubBindingQueueRefresh();
        return;
      }
    }

    try {
      const { faction, members, armory, itemNames, itemValues, itemTypes, lastOc, exMemberNames, viewerId, loanedOut } = await fetchAll(apiKey);
      // The await above can outlive a SPA navigation away from the Crimes tab —
      // renderDashboard self-guards, but the mmSection/TornStats code below doesn't.
      if (!btn.isConnected) { _ocmLoadInFlight = false; if (typeof hubBindingPending !== 'undefined' && hubBindingPending) hubBindingQueueRefresh(); return; }
      // Stash for debug snapshot — sanitised on demand, not here
      window._ocmDebug = { mode: 'leader', fetchedAt: Date.now(), faction, members, armory, itemNames, lastOc, exMemberNames };
      renderDashboard(faction, members, armory, itemNames, lastOc, exMemberNames, itemValues, viewerId, loanedOut, itemTypes);
      // Leader mode succeeded — show the View Mode toggle in Config
      const mmSection = document.getElementById('ocm-cfg-section-membermode');
      if (mmSection) mmSection.style.display = '';
      const _tsK = GM_getValue(GMK.TS_KEY, '');
      if (_tsK && !isTsCprCacheFresh() && !_tsFetchInFlight && (Date.now() - _tsLastFailAt > TS_FAIL_COOLDOWN)) {
        _tsFetchInFlight = true;
        const cacheRevision = _tsCacheRevision;
        const sameImport = () => cacheRevision === _tsCacheRevision
          && hubEffectiveTornKey() === apiKey && GM_getValue(GMK.TS_KEY, '') === _tsK;
        fetchTornStatsCpr(_tsK)
          .then(d => {
            if (!sameImport()) return;
            saveTsCprCache(d);
            // Keep valid imported CPR for the next refresh, but never redraw a superseded Torn snapshot.
            if (refreshOwner === _ocmRefreshOwner && btn.isConnected
                && document.getElementById('ocm-refresh-btn') === btn && !GM_getValue(GMK.FORCE_MEMBER, false)) {
              renderDashboard(faction, members, armory, itemNames, lastOc, exMemberNames, itemValues, viewerId, loanedOut, itemTypes);
            }
          })
          .catch(err => {
            if (!sameImport()) return;
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
        if (!btn.isConnected) { _ocmLoadInFlight = false; if (typeof hubBindingPending !== 'undefined' && hubBindingPending) hubBindingQueueRefresh(); return; }
        window._ocmDebug = { mode: 'member', fetchedAt: Date.now(), data, leaderErr: leaderErr.message };
        renderMemberDashboard(data);
        document.getElementById('ocm-key-status').textContent = `Key saved ✓ · Member Mode · ↻${REFRESH_S}s · (leader: ${leaderErr.message})`;
      } catch (memberErr) {
        // Both failed — show error and open config panel. Also possible the DOM
        // itself is gone (SPA navigated away mid-fetch) — bail quietly, not a crash.
        if (!btn.isConnected) { _ocmLoadInFlight = false; if (typeof hubBindingPending !== 'undefined' && hubBindingPending) hubBindingQueueRefresh(); return; }
        document.getElementById('ocm-body').style.display = 'block';
        document.getElementById('ocm-config-panel').style.display = 'block';
        errEl.innerHTML = `&#9888; Could not load data: ${memberErr.message}<br>
          <span style="font-size:11px;color:var(--ocm-cpr-warn)">Please check your API key in &#9881; Config.</span>`;
        errEl.style.display = 'block';
      }
    } finally {
      btn.innerHTML = '↻ Refresh';
      btn.disabled  = false;
      _ocmLoadInFlight = false; if (typeof hubBindingPending !== 'undefined' && hubBindingPending) hubBindingQueueRefresh();
    }
  }

  /** Schedule the auto-refresh interval. Clears any existing interval first. */
  function scheduleRefresh(apiKey) {
    clearInterval(window._ocmRefresh);
    window._ocmRefresh = setInterval(() => loadData(hubEffectiveTornKey()), REFRESH_S * 1000);
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
    const flash = verified => {
      if (!msg) return;
      clearTimeout(msg.__t);
      msg.style.color = verified ? 'var(--ocm-cpr-good)' : 'var(--ocm-cpr-warn)';
      msg.textContent = verified ? '✓ Saved' : SHARE_SAVE_UNVERIFIED;
      if (verified) msg.__t = setTimeout(() => { msg.textContent = ''; }, 1800);
    };
    // Refresh the same way every other Config setting does.
    const refresh = () => {
      const key = hubEffectiveTornKey();
      if (key) loadData(key);
    };
    for (const inp of inputs) {
      inp.addEventListener('change', () => {
        const verified = saveShareByDiff(readShareInputs('.ocm-cfg-share-lv'));
        flash(verified);
        if (verified) refresh();
      });
    }
    document.getElementById('ocm-cfg-share-reset')?.addEventListener('click', () => {
      const verified = saveShareByDiff({ ...DEFAULT_SHARE_BY_DIFF });
      flash(verified);
      if (verified) refresh();
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
    const tabs  = [...document.querySelectorAll('.ocm-tab')];
    const panes = [...document.querySelectorAll('.ocm-tab-pane')];
    if (!tabs.length) return;

    function activate(tabName) {
      tabs.forEach(t => {
        const selected = t.dataset.tab === tabName;
        t.classList.toggle('active', selected);
        t.setAttribute('aria-selected', String(selected));
        t.tabIndex = selected ? 0 : -1;
      });
      panes.forEach(p => {
        const selected = p.id === `ocm-pane-${tabName}`;
        p.classList.toggle('active', selected);
        p.setAttribute('aria-hidden', String(!selected));
      });
      const mobileNav = document.querySelector('#ocm-root .ocm-mobile-nav select');
      if (mobileNav) mobileNav.value = tabName;
      GM_setValue(GMK.ACTIVE_TAB, tabName);
    }

    function bindTabKeys(items, select) {
      items.forEach((item, index) => item.addEventListener('keydown', e => {
        let nextIndex = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') nextIndex = (index + 1) % items.length;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') nextIndex = (index - 1 + items.length) % items.length;
        else if (e.key === 'Home') nextIndex = 0;
        else if (e.key === 'End') nextIndex = items.length - 1;
        else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          select(item);
          return;
        } else return;
        e.preventDefault();
        const next = items[nextIndex];
        select(next);
        next.focus();
      }));
    }

    tabs.forEach(t => {
      t.addEventListener('click', () => activate(t.dataset.tab));
    });
    // Click also invokes lazy feature mounts; keyboard activation must use the
    // same path as pointer activation, not only reveal an unmounted pane.
    bindTabKeys(tabs, tab => tab.click());
    document.querySelectorAll('#ocm-root [data-suite-tab]').forEach(button => button.addEventListener('click', () => {
      const target = tabs.find(tab => tab.dataset.tab === button.dataset.suiteTab);
      if (!target) return;
      target.click();
      const pane = document.getElementById('ocm-pane-' + button.dataset.suiteTab);
      const sub = [...(pane?.querySelectorAll('.ocm-subtab') || [])].find(el => el.dataset.sub === button.dataset.suiteSub);
      if (sub) { sub.click(); sub.focus(); } else target.focus();
    }));

    // Sub-tabs: each main pane has its own bar. Switching is pure show/hide within
    // that pane, and the choice is remembered per pane.
    panes.forEach(pane => {
      const subtabs  = [...pane.querySelectorAll('.ocm-subtab')];
      const subpanes = [...pane.querySelectorAll('.ocm-subpane')];
      if (!subtabs.length) return;
      const key = GMK.SUBTAB_PREFIX + pane.id.replace('ocm-pane-', '');
      const show = (sub) => {
        subtabs.forEach((b, index) => {
          const selected = b.dataset.sub === sub;
          b.classList.toggle('active', selected);
          b.setAttribute('aria-selected', String(selected));
          b.tabIndex = selected ? 0 : -1;
          if (!b.id) b.id = `${pane.id}-subtab-${index}`;
          b.setAttribute('aria-controls', `ocm-sub-${b.dataset.sub}`);
        });
        subpanes.forEach(p => {
          const selected = p.id === `ocm-sub-${sub}`;
          p.classList.toggle('active', selected);
          p.setAttribute('role', 'tabpanel');
          p.setAttribute('aria-hidden', String(!selected));
          const controller = subtabs.find(b => `ocm-sub-${b.dataset.sub}` === p.id);
          if (controller) p.setAttribute('aria-labelledby', controller.id);
        });
        const mobileSub = pane.querySelector('.ocm-mobile-subnav select');
        if (mobileSub) mobileSub.value = sub;
        GM_setValue(key, sub);
      };
      subtabs.forEach(b => b.addEventListener('click', () => show(b.dataset.sub)));
      bindTabKeys(subtabs, tab => show(tab.dataset.sub));
      const saved = GM_getValue(key, null);
      const initial = saved && subtabs.some(b => b.dataset.sub === saved)
        ? saved
        : (subtabs.find(b => b.classList.contains('active')) || subtabs[0]).dataset.sub;
      show(initial);
    });

    // Default to the Dashboard, or whatever was last open. v3.17 restructured
    // six tabs into three, so migrate any retired tab name.
    const TAB_MIGRATION = { action: 'crimes', ocs: 'crimes', status: 'people',
                            optimize: 'people', reference: 'people',
                            profit: 'money', items: 'armoury', finance: 'money' };
    let saved = GM_getValue(GMK.ACTIVE_TAB, 'home');
    if (TAB_MIGRATION[saved]) saved = TAB_MIGRATION[saved];
    if (!tabs.some(tab => tab.dataset.tab === saved)) saved = 'home';
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

  // ── Armoury tab ──────────────────────────────────────────────────────────
  // A running ledger of faction-armoury activity, built from /v2/faction/news
  // (cat=armoryAction). Torn only serves recent entries per call, so we page
  // back on first load and merge new entries on refresh (dedup by news id),
  // persisting to GM storage. Aggregated per member into used / withdrew /
  // deposited / returned / filled totals, with profile pictures.
  const _num  = n => Math.round(Number(n) || 0).toLocaleString('en-US');
  const _nameLink = (name, id) => id
    ? `<a href="/profiles.php?XID=${id}" target="_blank" style="color:var(--ocm-link);font-weight:600;text-decoration:none">${OCUI.esc(name)}</a>`
    : `<span style="font-weight:600">${OCUI.esc(name)}</span>`;
  // One grouped stat strip — big number + label + sub-label, divider between each. items: [{v,l1,l2,color}]
  function _armOverview(items) {
    const stat = it => `<div style="display:flex;flex-direction:column;gap:3px;min-width:92px"><span style="font-size:22px;font-weight:800;line-height:1${it.color ? ';color:' + it.color : ''}">${it.v}</span><span style="color:var(--ocm-text);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">${it.l1}</span><span style="color:var(--ocm-text-faint);font-size:10.5px">${it.l2 || ''}</span></div>`;
    const div = '<div style="width:1px;align-self:stretch;background:var(--ocm-border-soft)"></div>';
    return `<div class="ocm-card" style="padding:14px 18px;margin-bottom:8px"><div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start">${items.map(stat).join(div)}</div></div>`;
  }
  const _selStyle   = 'background:var(--ocm-bg);border:1px solid var(--ocm-border-soft);border-radius:8px;color:var(--ocm-text);padding:7px 10px;font-size:12px';
  const _genBtnStyle = 'background:linear-gradient(180deg,#2ea0e6,#1c7fd0);border:none;color:#04121f;font-weight:800;border-radius:8px;padding:8px 16px;font-size:12.5px;cursor:pointer';
  const _pillStyle = 'background:var(--ocm-bg);border:1px solid var(--ocm-border-soft);color:var(--ocm-text-dim);border-radius:7px;padding:6px 11px;font-size:12px;cursor:pointer';
  const _btnStyle  = 'background:var(--ocm-bg-card);border:1px solid var(--ocm-border-soft);color:var(--ocm-text-dim);border-radius:7px;padding:6px 11px;font-size:12px;cursor:pointer';
  const _armMounted = new WeakSet();
  const ARM = (() => {
    const K_LEDGER = 'ocs_armory_ledger';   // { newsId: {ts, mid, name, cat, item, qty, toId, toName} }
    const K_PFP    = 'ocs_pfp_cache';        // { mid: {url, ts} }
    const CATS = [
      { key: 'used',      label: 'Used',      color: '#ff9a9a', sign: -1 },
      { key: 'withdrew',  label: 'Withdrew',  color: '#ffd479', sign: -1 },
      { key: 'deposited', label: 'Deposited', color: '#7fe3a0', sign: +1 },
      { key: 'returned',  label: 'Returned',  color: '#7fdfff', sign: +1 },
      { key: 'filled',    label: 'Filled',    color: '#c7a3ff', sign:  0 },
      { key: 'other',     label: 'Other',     color: 'var(--ocm-text-dim)', sign: 0 },
    ];
    const state = { view: 'log', member: null, fAction: 'all', fMember: 'all', q: '', page: 0, days: 'all', loading: false, loadState: 'idle', lastSync: 0, note: '' };

    const jget = (k) => { try { return JSON.parse(GM_getValue(k, '{}')) || {}; } catch { return {}; } };
    const jset = (k, v) => GM_setValue(k, JSON.stringify(v));
    const loadLedger = () => jget(K_LEDGER);
    const saveLedger = (l) => jset(K_LEDGER, l);

    const numWord = (s) => { if (s == null) return 1; if (/one/i.test(String(s))) return 1; const m = String(s).match(/([\d,]+)/); return m ? parseInt(m[1].replace(/,/g, ''), 10) : 1; };

    // Parse one armory-news HTML string into a structured record (or null).
    function parse(text) {
      const am = text.match(/XID=(\d+)"?\s*>([^<]+)<\/a>/i);
      const mid = am ? am[1] : null;
      const name = am ? am[2] : 'Unknown';
      const after = (text.includes('</a>') ? text.slice(text.indexOf('</a>') + 4) : text).trim();
      const recip = (s) => { const t = s.match(/XID=(\d+)"?\s*>([^<]+)<\/a>/i); if (t) return { toId: t[1], toName: t[2] }; if (/themselves/i.test(s)) return { toId: mid, toName: name }; return {}; };
      let m;
      if (m = after.match(/^used\s+(one|[\d,]+)\s+of the faction's\s+(.+?)\s+items$/i))
        return { mid, name, cat: 'used', qty: numWord(m[1]), item: m[2].trim() };
      if (m = after.match(/^filled\s+(one|[\d,]+)\s+of the faction's\s+.+?\s+to create\s+(?:a |an )?(.+)$/i))
        return { mid, name, cat: 'filled', qty: numWord(m[1]), item: m[2].trim() };
      if (m = after.match(/^deposited\s+([\d,]+)x?\s+(.+?)\s+(?:into|to)\s+the faction armory/i))
        return { mid, name, cat: 'deposited', qty: numWord(m[1]), item: m[2].trim() };
      if (m = after.match(/^loaned\s+([\d,]+)x\s+(.+?)\s+(?:to\s+(.+?)\s+)?from the faction armory/i))
        return { mid, name, cat: 'withdrew', qty: numWord(m[1]), item: m[2].trim(), ...(m[3] ? recip(m[3]) : {}) };
      if (m = after.match(/^gave\s+([\d,]+)x\s+(.+?)\s+(?:to\s+(.+?)\s+)?from the faction armory/i))
        return { mid, name, cat: 'withdrew', qty: numWord(m[1]), item: m[2].trim(), ...(m[3] ? recip(m[3]) : {}) };
      if (m = after.match(/^retrieved\s+([\d,]+)x\s+(.+?)\s+from\s+(.+)$/i))
        return { mid, name, cat: 'returned', qty: numWord(m[1]), item: m[2].trim(), ...recip(m[3]) };
      return { mid, name, cat: 'other', qty: 1, item: after.replace(/<[^>]+>/g, '').slice(0, 60) };
    }

    // Page through armoryAction news; merge into the ledger (dedup by id).
    function oldestTs(ledger) {
      let o = null;
      for (const e of Object.values(ledger)) if (e.ts && (o == null || e.ts < o)) o = e.ts;
      return o;
    }
    async function sync(full) {
      const key = hubEffectiveTornKey();
      if (!key) throw new Error('Set your Torn API key in ⚙ Config first.');
      const ledger = loadLedger();
      // Refresh pages from newest until it meets known entries. Backfill RESUMES
      // from the oldest entry already stored and pages further back, so repeated
      // backfills keep extending history toward "ever".
      const oldest0 = oldestTs(ledger);
      let to = full && oldest0 ? oldest0 - 1 : null;
      let pages = 0, added = 0, sawKnown = false;
      const maxPages = full ? 25 : 3;
      while (pages < maxPages) {
        const path = `/faction/news?cat=armoryAction&limit=100&sort=DESC${to ? '&to=' + to : ''}`;
        const j = await apiFetch(path, key);
        if (!Array.isArray(j?.news)) throw new Error('Invalid armory activity response.');
        const arr = j.news;
        if (!arr.length) break;
        for (const e of arr) {
          if (!e || !((typeof e.id === 'string' && e.id.trim()) || Number.isSafeInteger(e.id)) ||
              !Number.isFinite(e.timestamp) || e.timestamp <= 0 || typeof e.text !== 'string') throw new Error('Invalid armory activity entry.');
          if (ledger[e.id]) { sawKnown = true; continue; }
          ledger[e.id] = { ts: e.timestamp, ...parse(e.text) };
          added++;
        }
        // Step to the boundary timestamp (not past it) so entries sharing that exact
        // second aren't skipped — the id-dedup above drops the re-fetched overlap. Only
        // when a whole page is one timestamp do we step past it, to avoid re-looping.
        const lastTs = arr[arr.length - 1].timestamp;
        to = lastTs === arr[0].timestamp ? lastTs - 1 : lastTs;
        pages++;
        if (arr.length < 100) break;               // reached the end of history
        if (!full && sawKnown) break;              // incremental: reached known territory
      }
      saveLedger(ledger);
      return { added, total: Object.keys(ledger).length, oldest: oldestTs(ledger) };
    }

    // Per-member rollup from the ledger.
    function aggregate() {
      const ledger = loadLedger();
      const mem = {};
      for (const e of Object.values(ledger)) {
        if (!e || !e.mid) continue;
        const M = mem[e.mid] || (mem[e.mid] = { id: e.mid, name: e.name, actions: 0, last: 0, items: {} });
        if (e.name) M.name = e.name;
        const cat = e.cat || 'other';
        M[cat] = (M[cat] || 0) + (e.qty || 1);
        M.actions++;
        if (e.ts > M.last) M.last = e.ts;
        const bucket = (M.items[cat] = M.items[cat] || {});
        const it = e.item || '?';
        bucket[it] = (bucket[it] || 0) + (e.qty || 1);
      }
      return mem;
    }

    // Lazy, cached profile image lookup. Rarely changes → cache indefinitely.
    async function pfp(mid, cachedOnly = false) {
      const cache = jget(K_PFP);
      if (cache[mid] && cache[mid].url) return cache[mid].url;
      if (cachedOnly) return null;
      const key = hubEffectiveTornKey();
      if (!key) return null;
      try {
        const j = await apiFetch(`/user/${mid}?selections=profile`, key);
        const url = j?.profile?.image || null;
        if (url) { cache[mid] = { url, ts: Date.now() }; jset(K_PFP, cache); }
        return url;
      } catch { return null; }
    }

    // Evict a cached profile image (called from img.onerror when its URL 404s), so the
    // next render re-fetches instead of showing a broken icon. staleUrl guards against
    // dropping a cache entry that was already refreshed to a working URL.
    function dropPfp(mid, staleUrl) {
      const cache = jget(K_PFP);
      if (cache[mid] && (!staleUrl || cache[mid].url === staleUrl)) { delete cache[mid]; jset(K_PFP, cache); }
    }

    return { CATS, state, parse, sync, aggregate, pfp, dropPfp, entries: () => Object.entries(loadLedger()) };
  })();

  const _armCat = (k) => ARM.CATS.find(c => c.key === k) || ARM.CATS[ARM.CATS.length - 1];
  const _armBadge = (k) => { const c = _armCat(k); return `<span style="display:inline-block;padding:1px 7px;border-radius:9px;font-size:10px;font-weight:700;background:rgba(255,255,255,.05);color:${c.color}">${c.label}</span>`; };
  const _armAgo = (ts) => { if (!ts) return '—'; const s = Date.now() / 1000 - ts; if (s < 3600) return Math.max(1, Math.round(s / 60)) + 'm'; if (s < 86400) return Math.round(s / 3600) + 'h'; return Math.round(s / 86400) + 'd'; };

  // Never leave a broken-image icon behind while profile images resolve. API lookups
  // run in a small pool: serial requests made the Members view look mostly broken
  // for too long on a cold cache; an unbounded burst risks Torn API rate limits.
  const _armPfpFallback = (name = '?') => {
    const initial = String(name).trim().slice(0, 1).toUpperCase() || '?';
    return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="12" fill="%23213148"/><text x="40" y="51" text-anchor="middle" font-family="Arial,sans-serif" font-size="36" font-weight="700" fill="%239caecb">${initial}</text></svg>`);
  };
  function _armSetPfp(img, mid, name, url) {
    if (!img || !img.isConnected) return;
    img.onerror = () => {
      ARM.dropPfp(mid, url);
      img.onerror = null;
      img.src = _armPfpFallback(name);
      img.style.opacity = '.8';
    };
    img.src = url || _armPfpFallback(name);
    img.style.opacity = url ? '1' : '.8';
  }
  async function _armHydratePfps(members, cachedOnly = true) {
    const byId = new Map();
    for (const m of members) {
      const id = typeof m === 'object' ? m.id : m;
      if (id != null) byId.set(String(id), typeof m === 'object' ? m.name : '');
    }
    const jobs = [...byId.entries()];
    let next = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const [mid, name] = jobs[next++];
        if (!document.querySelector('#ocm-pane-armoury .ocm-arm-pfp')) return;
        const url = await ARM.pfp(mid, cachedOnly).catch(() => null);
        document.querySelectorAll(`img.ocm-arm-pfp[data-mid="${mid}"]`).forEach(img => _armSetPfp(img, mid, name, url));
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, worker));
  }

  function renderArmoury() {
    const _ocViewState = captureOcViewState(document.getElementById('ocm-root'));
    try {
    const pane = document.getElementById('ocm-pane-armoury');
    if (!pane) return;
    const st = ARM.state;
    const key = hubEffectiveTornKey();
    const head = OCUI.card({
      title: 'Armory',
      right: `<span id="ocm-arm-status" style="color:var(--ocm-text-faint);font-weight:500;font-size:12px">${OCUI.esc(st.note || '')}</span>`,
      body:
        '<p class="ocm-arm-intro">Track faction items, prepare OC supplies, and manage loans.</p><div class="ocm-arm-toolbar">' +
        `<button class="ocm-arm-view" data-v="ocs"     style="${st.view === 'ocs' ? _genBtnStyle : _pillStyle}">🎯 OC Stock</button>` +
        `<button class="ocm-arm-view" data-v="loans"   style="${st.view === 'loans' ? _genBtnStyle : _pillStyle}">🤝 Loans</button>` +
        `<button class="ocm-arm-view" data-v="log"     style="${st.view === 'log' ? _genBtnStyle : _pillStyle}">📜 Activity log</button>` +
        `<button class="ocm-arm-view" data-v="members" style="${st.view === 'members' ? _genBtnStyle : _pillStyle}">👥 Member activity</button>` +
        '<span style="flex:1"></span>' +
        (st.view === 'ocs' ? '' :
          `<button id="ocm-arm-refresh" style="${_btnStyle}">↻ Refresh</button>` +
          `<button id="ocm-arm-backfill" style="${_btnStyle}" title="Page further back through history">⏬ Backfill</button>`) +
        '</div>',
    });
    let content = '';
    if (!key) {
      content = OCUI.card({ title: 'Connect your faction', body: '<p>Set your Torn API key in Config to load armory activity.</p><button id="ocm-arm-config" type="button">Open Config</button>' });
    } else if (st.member) {
      content = _armMemberDetail(st.member);
    } else if (st.view === 'ocs') {
      content = _armOcStock();
    } else if (st.view === 'loans') {
      content = _armLoans();
    } else if (st.view === 'members') {
      content = _armMembersGrid();
    } else {
      content = _armLog();
    }
    pane.innerHTML = `<style>
      #ocm-pane-armoury{min-width:0;overflow-wrap:anywhere}
      #ocm-pane-armoury .ocm-arm-intro{color:var(--ocm-text-dim);margin:0 0 16px;line-height:1.6}
      #ocm-pane-armoury .ocm-arm-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      #ocm-pane-armoury button,#ocm-pane-armoury select,#ocm-pane-armoury input{max-width:100%;box-sizing:border-box}
      #ocm-pane-armoury button:focus-visible,#ocm-pane-armoury a:focus-visible{outline:2px solid var(--ocm-link);outline-offset:3px}
      #ocm-pane-armoury button:disabled{opacity:.5;cursor:wait}
      #ocm-pane-armoury .ocm-arm-filters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:12px}
      #ocm-pane-armoury .ocm-arm-filters label{display:grid;gap:5px;color:var(--ocm-text-dim);font-size:12px}
      #ocm-pane-armoury .ocm-arm-search{grid-column:1/-1}
      #ocm-pane-armoury .ocm-arm-pager{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:12px}
      #ocm-pane-armoury .ocm-arm-mcard{text-align:left;width:100%;font:inherit}
      #ocm-pane-armoury .ocm-arm-view[aria-pressed="true"]{box-shadow:inset 0 -2px var(--ocm-link)}
      @media(max-width:900px){
        #ocm-pane-armoury button,#ocm-pane-armoury select,#ocm-pane-armoury input,#ocm-pane-armoury .ocm-loan-go,#ocm-pane-armoury .ocm-buy-btn{min-height:44px!important}
        #ocm-pane-armoury input,#ocm-pane-armoury select{font-size:16px!important;width:100%}
        #ocm-pane-armoury .ocm-arm-filters{grid-template-columns:1fr}
        #ocm-pane-armoury .ocm-arm-toolbar{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}
        #ocm-pane-armoury .ocm-arm-toolbar>span{display:none}
        #ocm-pane-armoury .ocm-arm-log-table thead{display:none}
        #ocm-pane-armoury .ocm-arm-log-table tr{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid var(--ocm-border-soft);padding:8px 0}
        #ocm-pane-armoury .ocm-arm-log-table td{text-align:left;white-space:normal!important;border:0}
        #ocm-pane-armoury .ocm-arm-log-table td:nth-child(4){grid-column:1/-1}
        #ocm-pane-armoury .ocm-arm-log-table td:last-child:before{content:'Quantity: ';color:var(--ocm-text-dim)}
      }
    </style>` + head + content;
    pane.querySelectorAll('.ocm-arm-view').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.v === st.view)));
    pane.querySelectorAll('#ocm-arm-refresh, #ocm-arm-backfill').forEach(button => { button.disabled = st.loading; });
    const status = pane.querySelector('#ocm-arm-status');
    if (status) { status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); }
    _armWire();
    } finally { restoreOcViewState(_ocViewState); }
  }

  function _armLog() {
    const rows = ARM.entries().map(([id, e]) => ({ id, ...e })).filter(e => e.ts).sort((a, b) => b.ts - a.ts);
    const st = ARM.state;
    const failed = !st.loading && st.loadState === 'failed';
    const unavailable = 'Armory activity unavailable. Use Refresh to try again.';
    if (!rows.length) {
      const status = st.loading ? 'Loading armory activity.' : failed ? unavailable : st.loadState === 'loaded'
        ? 'No armory activity in the loaded history.'
        : 'Armory activity has not been loaded. Use Refresh to load recent activity.';
      return OCUI.card({ title: '📜 Activity log', body: `<p role="status">${status}</p>` });
    }
    const stale = failed ? `<p role="status"><span>${unavailable}</span> <span>Showing previously loaded activity.</span></p>` : '';
    const members = [...new Map(rows.filter(r => r.mid).map(r => [r.mid, r.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    const q = st.q.trim().toLowerCase();
    const matched = rows.filter(r =>
      (st.fAction === 'all' || r.cat === st.fAction) &&
      (st.fMember === 'all' || r.mid === st.fMember) &&
      (st.days === 'all' || r.ts >= Date.now() / 1000 - Number(st.days) * 86400) &&
      (!q || (r.item || '').toLowerCase().includes(q) || (r.name || '').toLowerCase().includes(q))
    );
    const pages = Math.max(1, Math.ceil(matched.length / 50));
    st.page = Math.max(0, Math.min(st.page || 0, pages - 1));
    const shown = matched.slice(st.page * 50, (st.page + 1) * 50);
    const actOpts = ['all', ...ARM.CATS.map(c => c.key)].map(k => `<option value="${k}"${st.fAction === k ? ' selected' : ''}>${k === 'all' ? 'All actions' : _armCat(k).label}</option>`).join('');
    const memOpts = `<option value="all"${st.fMember === 'all' ? ' selected' : ''}>All members</option>` + members.map(([id, nm]) => `<option value="${id}"${st.fMember === id ? ' selected' : ''}>${OCUI.esc(nm)}</option>`).join('');
    const filters =
      '<div class="ocm-arm-filters">' +
      `<label>Action<select id="ocm-arm-faction-act" style="${_selStyle}">${actOpts}</select></label>` +
      `<label>Member<select id="ocm-arm-fmember" style="${_selStyle}">${memOpts}</select></label>` +
      `<label>Period<select id="ocm-arm-days" style="${_selStyle}">${[['all','Loaded history'],['1','Last 24 hours'],['7','Last 7 days'],['30','Last 30 days']].map(([value,label]) => `<option value="${value}"${st.days === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label>` +
      `<label class="ocm-arm-search">Search activity<input id="ocm-arm-q" type="search" placeholder="Item or member name" value="${OCUI.esc(st.q)}" style="${_selStyle}" /></label>` +
      '</div>';
    const body = shown.map(r => `<tr>
      <td class="n" style="white-space:nowrap;color:var(--ocm-text-faint)" title="${new Date(r.ts * 1000).toLocaleString()}">${_armAgo(r.ts)} ago</td>
      <td class="l">${_nameLink(r.name, r.mid)}</td>
      <td class="l">${_armBadge(r.cat)}</td>
      <td class="l">${OCUI.esc(r.item || '—')}${r.toName ? ` <span style="color:var(--ocm-text-faint);font-size:11px">→ ${_nameLink(r.toName, r.toId)}</span>` : ''}</td>
      <td class="n"><b>${_num(r.qty || 1)}</b></td>
    </tr>`).join('');
    return OCUI.card({ title: '📜 Activity log', right: `${_num(shown.length)} shown`, body:
      stale + filters +
      (shown.length ? `<div style="overflow-x:auto"><table class="ocm-members-table ocm-arm-log-table"><thead><tr><th class="n">When</th><th class="l">Member</th><th class="l">Action</th><th class="l">Item</th><th class="n">Qty</th></tr></thead><tbody>${body}</tbody></table></div>` : '<p role="status">No activity matches your filters.</p><button id="ocm-arm-clear-filters" type="button">Clear filters</button>') +
      `<div class="ocm-arm-pager"><button id="ocm-arm-prev" type="button" ${st.page === 0 ? 'disabled' : ''}>Previous</button><span>${_num(matched.length)} matches · ${st.page + 1} / ${pages}</span><button id="ocm-arm-next" type="button" ${st.page >= pages - 1 ? 'disabled' : ''}>Next</button></div><p class="ocm-arm-intro">Counts cover loaded faction history only. Backfill loads older activity and uses additional API calls.</p>` });
  }

  function _armMembersGrid() {
    const mem = Object.values(ARM.aggregate()).sort((a, b) => b.actions - a.actions);
    if (!mem.length) return OCUI.card({ title: '👥 Members', body: '<div style="color:var(--ocm-text-dim)">No member activity yet — hit <b>↻ Refresh</b>.</div>' });
    const card = (M) => {
      const tot = ARM.CATS.filter(c => M[c.key]).map(c => `<span style="color:${c.color};font-size:11px">${c.label} ${_num(M[c.key])}</span>`).join('<span style="color:var(--ocm-border-soft)"> · </span>');
      const itemTypes = Object.values(M.items || {}).reduce((n, bucket) => n + Object.keys(bucket || {}).length, 0);
      return `<button type="button" class="ocm-arm-mcard ocm-card" data-mid="${M.id}" style="padding:12px;cursor:pointer;display:flex;gap:11px;align-items:center">
        <img class="ocm-arm-pfp" data-mid="${M.id}" src="${_armPfpFallback(M.name)}" alt="${OCUI.esc(M.name)}" style="width:44px;height:44px;border-radius:9px;object-fit:cover;background:var(--ocm-bg);flex:none;opacity:.35;transition:opacity .2s" />
        <div style="min-width:0;flex:1">
          <div style="font-weight:700;color:var(--ocm-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${OCUI.esc(M.name)}</div>
          <div style="margin:3px 0 2px;line-height:1.5">${tot || '<span style="color:var(--ocm-text-faint);font-size:11px">no totals</span>'}</div>
          <div style="color:var(--ocm-text-faint);font-size:10.5px">${_num(M.actions)} actions · ${_num(itemTypes)} item type${itemTypes === 1 ? '' : 's'} tracked</div>
        </div>
      </button>`;
    };
    const grid = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px">${mem.map(card).join('')}</div>`;
    setTimeout(() => _armHydratePfps(mem), 30);
    return OCUI.card({ title: '👥 Member profiles', right: `${_num(mem.length)} members`, body: grid });
  }

  function _armMemberDetail(mid) {
    const M = ARM.aggregate()[mid];
    if (!M) return OCUI.card({ title: 'Member', body: '<div style="color:var(--ocm-text-dim)">No activity for this member.</div>' });
    const itemTypes = Object.values(M.items || {}).reduce((n, bucket) => n + Object.keys(bucket || {}).length, 0);
    // Per-item, per-window counts from this member's ledger entries.
    const now = Date.now() / 1000, DAY = 86400;
    const win = {};   // cat -> item -> { d, w, m, all }
    let oldest = null;
    for (const [, e] of ARM.entries()) {
      if (e.mid !== mid || !e.ts) continue;
      if (oldest == null || e.ts < oldest) oldest = e.ts;
      const cat = e.cat || 'other', it = e.item || '?', q = e.qty || 1;
      const c = (win[cat] = win[cat] || {});
      const r = (c[it] = c[it] || { d: 0, w: 0, m: 0, all: 0 });
      r.all += q;
      if (e.ts >= now - DAY) r.d += q;
      if (e.ts >= now - 7 * DAY) r.w += q;
      if (e.ts >= now - 30 * DAY) r.m += q;
    }
    const totals = ARM.CATS.filter(c => M[c.key]).map(c =>
      `<div style="flex:1;min-width:88px"><div style="font-size:22px;font-weight:800;color:${c.color}">${_num(M[c.key])}</div><div style="color:var(--ocm-text-dim);font-size:11px;text-transform:uppercase;letter-spacing:.04em">${c.label}</div></div>`).join('');
    const dash = '<span style="color:var(--ocm-text-faint)">—</span>';
    const cell = (n) => (n ? _num(n) : dash);
    // One time-window table per category, "Used" first (CATS order). Sorted by all-time.
    const tables = ARM.CATS.map(c => {
      const items = win[c.key];
      if (!items) return '';
      const rows = Object.entries(items).sort((a, b) => b[1].all - a[1].all);
      return `<div style="margin-top:16px"><div style="color:${c.color};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">${c.label} — every item, all time</div>` +
        `<div style="overflow-x:auto"><table class="ocm-members-table"><thead><tr><th class="l">Item</th><th class="n">Today</th><th class="n">7 days</th><th class="n">30 days</th><th class="n">All time</th></tr></thead><tbody>` +
        rows.map(([it, r]) => `<tr><td class="l">${OCUI.esc(it)}</td><td class="n">${cell(r.d)}</td><td class="n">${cell(r.w)}</td><td class="n">${cell(r.m)}</td><td class="n" style="color:${c.color};font-weight:700">${_num(r.all)}</td></tr>`).join('') +
        `</tbody></table></div></div>`;
    }).join('');
    const depth = oldest ? `All-time = loaded history, back to <b>${new Date(oldest * 1000).toLocaleDateString()}</b>. Use <b>⏬ Backfill</b> on the Log view to go deeper.` : '';
    setTimeout(() => _armHydratePfps([{ id: mid, name: M.name }], false), 30);
    return OCUI.card({
      title: '👤 ' + OCUI.esc(M.name),
      right: `<button id="ocm-arm-back" style="${_btnStyle}">‹ Back</button>`,
      body:
        '<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:12px">' +
        `<img class="ocm-arm-pfp" data-mid="${M.id}" src="${_armPfpFallback(M.name)}" alt="${OCUI.esc(M.name)}" style="width:72px;height:72px;border-radius:12px;object-fit:cover;background:var(--ocm-bg);opacity:.35;transition:opacity .2s" />` +
        `<div><div style="font-size:17px;font-weight:800">${_nameLink(M.name, M.id)}</div><div style="color:var(--ocm-text-faint);font-size:12px">${_num(M.actions)} armoury actions · ${_num(itemTypes)} item type${itemTypes === 1 ? '' : 's'} tracked</div></div>` +
        '</div>' +
        `<div style="display:flex;gap:14px;flex-wrap:wrap;padding:12px;background:var(--ocm-bg);border-radius:10px">${totals}</div>` +
        tables +
        (depth ? `<div style="margin-top:12px;color:var(--ocm-text-faint);font-size:10.5px;line-height:1.5">${depth}</div>` : ''),
    });
  }

  // OC Stock view — items active OCs need vs faction armoury stock, with buy links.
  // Reuses analyseOcItems() over the data stashed by renderFinanceSection.
  function _armOcStock() {
    const d = _armDataCache;
    if (!d) return OCUI.card({ title: '🎯 OC item stock', body: '<div style="color:var(--ocm-text-dim)">Open the <b>Crimes</b> tab once so OC + armoury data loads, then come back.</div>' });
    const { items, summary } = analyseOcItems(d.crimes, d.armory, d.itemNames, d.itemValues, d.memberNames);
    const active = items.filter(it => it.needed > 0);
    if (!active.length) return OCUI.card({ title: '🎯 OC item stock', body: '<div style="color:var(--ocm-text-dim)">No active OCs need items right now.</div>' });
    const tiles = _armOverview([
      { v: _num(summary.totalHeld), l1: 'In stock', l2: 'items in armoury' },
      { v: _num(summary.armoryGaps), l1: 'Items short', l2: _num(summary.totalShortfall) + ' to buy', color: summary.armoryGaps ? 'var(--ocm-cpr-crit)' : 'var(--ocm-cpr-good)' },
      { v: '$' + _num(summary.coverCost), l1: 'Cost to cover', l2: 'at market value' },
    ]);
    const row = (it) => {
      const short = it.shortfall > 0;
      const kind = it.isTool ? '🔧' : '📦';
      const buy = short
        ? `<a href="${marketUrlOf(it.id)}" target="_blank" style="color:var(--ocm-link);font-weight:700;text-decoration:none">Buy ${_num(it.shortfall)} ▸</a>`
        : '<span style="color:var(--ocm-cpr-good)">✓</span>';
      return `<tr>
        <td class="l">${kind} ${OCUI.esc(it.name)}${it.isTool ? ' <span style="color:var(--ocm-text-faint);font-size:10px">reusable</span>' : ''}</td>
        <td class="n">${_num(it.needed)}</td>
        <td class="n">${_num(it.held)}</td>
        <td class="n" style="color:${short ? 'var(--ocm-cpr-crit)' : 'var(--ocm-cpr-good)'};font-weight:700">${short ? _num(it.shortfall) : '0'}</td>
        <td class="n">${buy}</td>
      </tr>`;
    };
    const short = active.filter(it => it.shortfall > 0);
    const covered = active.filter(it => it.shortfall === 0);
    const table = (list) => `<div style="overflow-x:auto"><table class="ocm-members-table"><thead><tr><th class="l">Item</th><th class="n" title="Needed by active OCs">Needed</th><th class="n">In stock</th><th class="n">Short</th><th class="n">Buy</th></tr></thead><tbody>${list.map(row).join('')}</tbody></table></div>`;
    return tiles +
      OCUI.card({ title: '🛒 Missing for OCs', right: `${short.length} item${short.length === 1 ? '' : 's'} short`,
        body: short.length ? table(short) : '<div style="color:var(--ocm-cpr-good)">Everything active OCs need is already in the armoury. 🎉</div>' }) +
      (covered.length ? OCUI.card({ title: '✅ Covered by stock', right: `${covered.length}`, body: table(covered) }) : '');
  }

  // Loans view — moved here from People. Loans to hand out (urgency-grouped) +
  // retrievables, with loan-aging cross-referenced from the activity ledger.
  function _armLoans() {
    const d = _armDataCache;
    if (!d || !d.loans) return OCUI.card({ title: '🤝 Loans', body: '<div style="color:var(--ocm-text-dim)">Open the <b>Crimes</b> tab once so OC + armoury data loads, then come back.</div>' });
    const now = Date.now() / 1000;
    const loans = d.loans || [];
    const returnable = d.returnable || [];

    // Loan aging: most recent "withdrew" ledger entry that put item Y in member X's hands.
    const outEntries = ARM.entries().map(([, e]) => e).filter(e => e && e.ts && e.cat === 'withdrew');
    const heldSince = (uid, itemName) => {
      const target = (itemName || '').toLowerCase(); let best = 0;
      for (const e of outEntries) {
        const toThem = String(e.toId || e.mid) === String(uid);
        if (toThem && (e.item || '').toLowerCase() === target && e.ts > best) best = e.ts;
      }
      return best || 0;
    };
    const heldTxt = (uid, itemName) => { const t = heldSince(uid, itemName); return t ? `held ${_armAgo(t)}` : '—'; };

    const etaTxt = (ts) => { if (!ts) return '—'; const h = (ts - now) / 3600; if (h <= 0) return 'ready'; if (h < 1) return Math.round(h * 60) + 'm'; if (h < 48) return Math.round(h) + 'h'; return Math.round(h / 24) + 'd'; };
    const etaCol = (ts) => { if (!ts) return 'var(--ocm-text-muted)'; const h = (ts - now) / 3600; if (h < 12) return 'var(--ocm-cpr-crit)'; if (h < 48) return 'var(--ocm-cpr-warn)'; return 'var(--ocm-text-dim)'; };
    const giveCell = (l) => l.inArmory
      ? `<a href="${armoryGiveUrl(armorySubOfItem(l.itemId))}" class="ocm-loan-btn ocm-loan-go" data-item="${OCUI.esc(String(l.itemId))}" data-itemname="${OCUI.esc(l.itemName)}" data-uid="${OCUI.esc(String(l.uid))}" data-member="${OCUI.esc(l.name)}" data-sub="${armorySubOfItem(l.itemId)}" title="Fills the loan form in place: ${OCUI.esc(l.itemName)} → ${OCUI.esc(l.name)}. Check it, then press LOAN.">Give ▸</a>`
      : `<a href="${marketUrlOf(l.itemId)}" target="_blank" class="ocm-buy-btn" title="None in the armory — opens the item market to source one first.">Buy ▸</a>`;
    const loanRow = (l) => `<tr style="${l.inArmory ? '' : 'opacity:.7'}">
      <td class="l">${_nameLink(l.name, l.uid)}</td>
      <td class="l"><a href="${marketUrlOf(l.itemId)}" target="_blank" style="color:var(--ocm-text-card);text-decoration:none">${OCUI.esc(l.itemName)} ${l.isTool ? '🔧' : '📦'}</a></td>
      <td class="l" style="color:var(--ocm-text-dim)" title="${OCUI.esc(l.role || '')}">${OCUI.esc(l.ocName || '')}</td>
      <td class="n" style="color:${etaCol(l.readyAt)};white-space:nowrap">${etaTxt(l.readyAt)}</td>
      <td class="n" style="font-size:11px">${l.inArmory ? '<span style="color:var(--ocm-cpr-good)">🏛 in armory</span>' : '<span style="color:var(--ocm-cpr-crit)">✗ not stocked</span>'}</td>
      <td class="n">${giveCell(l)}</td>
    </tr>`;
    const loanTable = (list) => `<div style="overflow-x:auto"><table class="ocm-members-table"><thead><tr><th class="l">Member</th><th class="l">Item</th><th class="l">OC</th><th class="n">Due</th><th class="n">Armory</th><th class="n">Loan</th></tr></thead><tbody>${list.map(loanRow).join('')}</tbody></table></div>`;

    const urgent = loans.filter(l => l.readyAt && (l.readyAt - now) < 6 * 3600);
    const later = loans.filter(l => !(l.readyAt && (l.readyAt - now) < 6 * 3600));
    const tiles = _armOverview([
      { v: _num(loans.length), l1: 'To hand out', l2: loans.filter(l => l.inArmory).length + ' ready in armory', color: loans.length ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-good)' },
      { v: _num(urgent.length), l1: 'Urgent', l2: 'OC ready within 6h', color: urgent.length ? 'var(--ocm-cpr-crit)' : 'var(--ocm-text-dim)' },
      { v: _num(returnable.length), l1: 'Retrievable', l2: '$' + _num(returnable.reduce((s, r) => s + (r.value || 0), 0)) + ' idle', color: returnable.length ? 'var(--ocm-cpr-warn)' : 'var(--ocm-text-dim)' },
    ]);

    let handOut;
    if (!loans.length) {
      handOut = OCUI.card({ title: '🤝 Loans to hand out', body: '<div style="color:var(--ocm-cpr-good)">✓ Every filled slot has its item. Nothing to loan.</div>' });
    } else {
      handOut = OCUI.card({
        title: '🤝 Loans to hand out', right: `<button id="ocm-arm-loan-copy" style="${_btnStyle}">📋 Copy for chat</button>`,
        body:
          '<div style="font-size:10.5px;color:var(--ocm-text-muted);margin-bottom:8px;line-height:1.5"><b style="color:var(--ocm-cpr-good)">Give ▸</b> opens the armory with the loan form prefilled — check it and press LOAN (Torn\'s API can\'t loan for you). <b style="color:var(--ocm-link)">Buy ▸</b> = none stocked, source one first.</div>' +
          (urgent.length ? `<div style="color:var(--ocm-cpr-crit);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">🔴 Urgent — OC ready soon</div>${loanTable(urgent)}` : '') +
          (later.length ? `<div style="color:var(--ocm-text-dim);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin:${urgent.length ? '14px' : '0'} 0 4px">Later</div>${loanTable(later)}` : ''),
      });
    }

    let retrieve = '';
    if (returnable.length) {
      const rrow = (r) => {
        const why = r.ocName
          ? (r.needsInstead ? `In <b>${OCUI.esc(r.ocName)}</b> — needs ${OCUI.esc(r.needsInstead.name)}${r.needsInstead.has ? '' : ' (missing)'}, not this` : `In <b>${OCUI.esc(r.ocName)}</b> — role needs no item`)
          : 'Not in an active OC';
        return `<tr>
          <td class="l">${_nameLink(r.holderName, r.uid)}</td>
          <td class="l"><a href="${marketUrlOf(r.itemId)}" target="_blank" style="color:var(--ocm-text-card);text-decoration:none">${OCUI.esc(r.itemName)}</a></td>
          <td class="l" style="color:var(--ocm-text-dim);font-size:11px">${why}</td>
          <td class="n" style="color:var(--ocm-text-faint);font-size:11px;white-space:nowrap" title="From the armoury activity log">${heldTxt(r.uid, r.itemName)}</td>
          <td class="n" style="color:var(--ocm-text-muted)">${r.value ? '$' + _num(r.value) : '—'}</td>
          <td class="n"><a href="${armoryGiveUrl(armorySubOfItem(r.itemId))}" class="ocm-return-btn ocm-loan-go" data-mode="retrieve" data-item="${OCUI.esc(String(r.itemId))}" data-itemname="${OCUI.esc(r.itemName)}" data-uid="${OCUI.esc(String(r.uid))}" data-member="${OCUI.esc(r.holderName)}" data-sub="${armorySubOfItem(r.itemId)}" title="Retrieves ${OCUI.esc(r.itemName)} from ${OCUI.esc(r.holderName)} in place.">Retrieve ▸</a></td>
        </tr>`;
      };
      retrieve = OCUI.card({ title: '♻ Retrievable — held but not needed', right: `${returnable.length}`, body:
        '<div style="font-size:10.5px;color:var(--ocm-text-muted);margin-bottom:8px;line-height:1.5">Members holding a faction item their current role doesn\'t need. <b>Held</b> is how long they\'ve had it (from the activity log). Be considerate — they may use it outside OCs.</div>' +
        `<div style="overflow-x:auto"><table class="ocm-members-table"><thead><tr><th class="l">Member</th><th class="l">Item</th><th class="l">Why</th><th class="n">Held</th><th class="n">Value</th><th class="n">Get</th></tr></thead><tbody>${returnable.map(rrow).join('')}</tbody></table></div>` });
    }
    return tiles + handOut + retrieve;
  }

  function _armSetStatus(msg) { const el = document.getElementById('ocm-arm-status'); if (el) el.textContent = msg || ''; ARM.state.note = msg || ''; }

  function _armWire() {
    document.getElementById('ocm-arm-config')?.addEventListener('click', () => document.getElementById('ocm-config-toggle')?.click());
    document.getElementById('ocm-arm-clear-filters')?.addEventListener('click', () => {
      Object.assign(ARM.state, { fAction: 'all', fMember: 'all', days: 'all', q: '', page: 0 });
      renderArmoury();
      document.getElementById('ocm-arm-q')?.focus({ preventScroll: true });
    });
    document.getElementById('ocm-arm-days')?.addEventListener('change', event => { ARM.state.days = event.target.value; ARM.state.page = 0; renderArmoury(); });
    document.getElementById('ocm-arm-prev')?.addEventListener('click', () => { ARM.state.page--; renderArmoury(); });
    document.getElementById('ocm-arm-next')?.addEventListener('click', () => { ARM.state.page++; renderArmoury(); });
    document.querySelectorAll('#ocm-pane-armoury .ocm-arm-view').forEach(b => b.addEventListener('click', () => { ARM.state.view = b.dataset.v; ARM.state.member = null; renderArmoury(); }));
    document.querySelectorAll('#ocm-pane-armoury .ocm-arm-mcard').forEach(c => c.addEventListener('click', () => { ARM.state.member = c.dataset.mid; renderArmoury(); }));
    document.getElementById('ocm-arm-back')?.addEventListener('click', () => { ARM.state.member = null; renderArmoury(); });
    const act = document.getElementById('ocm-arm-faction-act'); if (act) act.addEventListener('change', e => { ARM.state.fAction = e.target.value; ARM.state.page = 0; renderArmoury(); document.getElementById('ocm-arm-faction-act')?.focus(); });
    const fm = document.getElementById('ocm-arm-fmember'); if (fm) fm.addEventListener('change', e => { ARM.state.fMember = e.target.value; ARM.state.page = 0; renderArmoury(); document.getElementById('ocm-arm-fmember')?.focus(); });
    const q = document.getElementById('ocm-arm-q'); if (q) q.addEventListener('input', e => { ARM.state.q = e.target.value; ARM.state.page = 0; const p = q.selectionStart; renderArmoury(); const nq = document.getElementById('ocm-arm-q'); if (nq) { nq.focus(); try { nq.setSelectionRange(p, p); } catch (_) {} } });
    document.getElementById('ocm-arm-refresh')?.addEventListener('click', () => _armLoad(false));
    document.getElementById('ocm-arm-backfill')?.addEventListener('click', () => _armLoad(true));
    // Loan/retrieve buttons: record the intent + navigate to the item's row in place.
    wireLoanGoButtons(document.getElementById('ocm-pane-armoury'));
    document.getElementById('ocm-arm-loan-copy')?.addEventListener('click', async () => {
      const pane = document.getElementById('ocm-pane-armoury');
      if (!pane?.isConnected) return;
      const now = Date.now() / 1000;
      const lines = (_armDataCache?.loans || []).map(l => {
        const h = l.readyAt ? (l.readyAt - now) / 3600 : null;
        const eta = h == null ? '' : h <= 0 ? ' (ready now)' : h < 48 ? ` (ready ${Math.round(h)}h)` : ` (ready ${Math.round(h / 24)}d)`;
        return `• ${l.name} needs ${l.itemName} for ${l.ocName}${eta}${l.inArmory ? '' : ' — NOT in armory'}`;
      });
      if (!lines.length) { _armSetStatus('No pending loans to copy.'); return; }
      const text = 'Loans to hand out:\n' + lines.join('\n');
      let copied = false;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          copied = true;
        }
      } catch (_) { /* Clipboard access varies by WebView and browser permissions. */ }
      // Do not start a fallback copy or write status for a pane that was replaced.
      if (!pane.isConnected || document.getElementById('ocm-pane-armoury') !== pane) return;
      if (!copied) {
        const field = document.createElement('textarea');
        field.value = text;
        field.style.cssText = 'position:fixed;left:-9999px';
        document.body.appendChild(field);
        field.select();
        try { copied = document.execCommand('copy'); } catch (_) {}
        finally { field.remove(); }
      }
      _armSetStatus(copied ? `Copied ${lines.length} loan${lines.length === 1 ? '' : 's'} for chat.` : 'Copy failed. The browser did not allow clipboard access.');
    });
  }

  async function _armLoad(full) {
    if (ARM.state.loading) return;
    ARM.state.loading = true;
    renderArmoury();
    _armSetStatus(full ? 'backfilling…' : 'refreshing…');
    try {
      const { added, total, oldest } = await ARM.sync(full);
      ARM.state.loadState = 'loaded';
      if (!full) ARM.state.lastSync = Date.now();
      const back = oldest ? ' · back to ' + new Date(oldest * 1000).toLocaleDateString() : '';
      _armSetStatus(`${added ? '+' + _num(added) + ' new · ' : ''}${_num(total)} logged${back}`);
    } catch {
      ARM.state.loadState = 'failed';
      _armSetStatus(full ? 'Activity backfill failed.' : 'Activity refresh failed.');
    } finally {
      ARM.state.loading = false;
      renderArmoury();
    }
  }

  function mountArmouryInline() {
    const pane = document.getElementById('ocm-pane-armoury');
    if (!pane || _armMounted.has(pane)) return;
    _armMounted.add(pane);
    renderArmoury();
    // An existing ledger may be weeks old. Refresh once per session on open,
    // then at most once per five minutes when Torn replaces the suite pane.
    if (hubEffectiveTornKey() && Date.now() - (ARM.state.lastSync || 0) > 300000) _armLoad(false);
  }

  function _ocmDiagBytes(bytes) {
    if (!Number.isFinite(bytes)) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes, unit = 0;
    while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
    return `${value < 10 && unit ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
  }

  function renderDiagnosticsPanel() {
    const panel = document.getElementById('ocm-diagnostics-panel');
    if (!panel) return;
    const s = _ocmDiagSnapshot();
    const memory = s.memory;
    const heapText = memory.supported
      ? `${_ocmDiagBytes(memory.usedBytes)} / ${_ocmDiagBytes(memory.limitBytes)}`
      : 'Not exposed by this browser';
    const heapClass = memory.percent >= 85 ? 'ocm-diag-critical' : memory.percent >= 70 ? 'ocm-diag-warning' : '';
    const storage = s.storage;
    const storageText = storage.mode === 'pda-native'
      ? (storage.quotaBytes != null
          ? `${_ocmDiagBytes(storage.usedBytes)} / ${_ocmDiagBytes(storage.quotaBytes)}`
          : 'Torn PDA native')
      : 'GM compatibility';
    const storageSub = `${storage.pending} pending · ${storage.migrations} migrated${storage.lastError ? ` · ${storage.lastError}` : ''}`;
    const timerText = Object.entries(s.timers).map(([name, active]) => `${name}: ${active ? 'on' : 'off'}`).join(' · ');
    const recent = s.api.recent.length
      ? `<ul class="ocm-diag-list">${s.api.recent.slice().reverse().map(e =>
          `<li><span>${OCUI.esc(e.module)} · ${OCUI.esc(e.status)} · ${e.ms} ms</span><code>${OCUI.esc(e.detail || '')}</code></li>`
        ).join('')}</ul>`
      : '<div class="ocm-diag-muted" style="margin-top:8px">No instrumented requests yet.</div>';
    panel.innerHTML = `
      <div class="ocm-diag-grid">
        <div class="ocm-diag-card"><b>${OCUI.esc(s.scriptVersion)}</b><span>script · ${Math.round(s.uptimeMs / 1000)}s page uptime</span></div>
        <div class="ocm-diag-card"><b>${s.rootConnected ? 'Mounted' : 'Not mounted'}</b><span>suite root state</span></div>
        <div class="ocm-diag-card"><b>${OCUI.esc(String(s.dom.suiteNodes))}</b><span>suite DOM nodes</span></div>
        <div class="ocm-diag-card"><b>${OCUI.esc(String(s.dom.documentNodes))}</b><span>document DOM nodes</span></div>
        <div class="ocm-diag-card"><b class="${heapClass}">${OCUI.esc(heapText)}</b><span>JavaScript heap${memory.percent != null ? ` · ${memory.percent}%` : ''}</span></div>
        <div class="ocm-diag-card"><b>${s.api.total} total · ${s.api.ok} ok</b><span>${s.api.error} errors · ${s.api.timeout} timeouts</span></div>
        <div class="ocm-diag-card"><b>${OCUI.esc(storageText)}</b><span>bulk storage · ${OCUI.esc(storageSub)}</span></div>
      </div>
      <div class="ocm-diag-muted" style="margin-top:9px">Route: <code>${OCUI.esc(s.route)}</code></div>
      <div class="ocm-diag-muted" style="margin-top:4px">Timers: ${OCUI.esc(timerText)}</div>
      ${recent}`;
  }

  function initDiagnosticsPanel(setStatus) {
    const refresh = document.getElementById('ocm-diagnostics-refresh');
    const copy = document.getElementById('ocm-diagnostics-copy');
    refresh?.addEventListener('click', async () => {
      await OCBulkStore.usage();
      if (!refresh.isConnected) return;
      renderDiagnosticsPanel();
      setStatus('Diagnostics refreshed ✓');
    });
    copy?.addEventListener('click', () => {
      const report = _ocmDiagReport();
      const done = ok => setStatus(ok ? `Safe report copied ✓ (${(report.length / 1024).toFixed(1)} KB)` : 'Copy failed — select the report manually');
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(report).then(() => done(true), () => done(false));
      } else {
        const ta = document.createElement('textarea');
        ta.value = report; ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select();
        try { done(document.execCommand('copy')); } catch (_) { done(false); }
        ta.remove();
      }
    });
    renderDiagnosticsPanel();
  }

  function inject() {
    if (document.getElementById('ocm-root')) return;

    // Match the normal crimes tab, OR the faction profile/your page when the
    // player is travelling/abroad (Torn strips the crimes tab in that state).
    function isOcTab() {
      const { traveling, abroad } = document.body?.dataset || {};
      const isTraveling = traveling === 'true' || abroad === 'true';
      return location.href.includes('factions.php') && (
        location.hash.includes('tab=crimes') ||
        (isTraveling && (location.href.includes('step=profile') || location.href.includes('step=your')))
      );
    }

    if (!_ocmInjectRouteHandler) {
      _ocmInjectRouteHandler = () => {
        if (!isOcTab()) {
          clearInjectWait();
          return;
        }
        if (!document.getElementById('ocm-root')) inject();
      };
      window.addEventListener('hashchange', _ocmInjectRouteHandler);
    }
    clearInjectWait();
    const mount = () => {
      if (!isOcTab()) {
        clearInjectWait();
        return true;
      }
      if (document.getElementById('ocm-root')) {
        clearInjectWait();
        return true;
      }
      const { traveling, abroad } = document.body?.dataset || {};
      const isTraveling = traveling === 'true' || abroad === 'true';
      const anchor = isTraveling
        ? (document.querySelector('#react-root') ||
           document.querySelector('.content-wrapper'))
        : (document.querySelector('.faction-crimes-wrap') ||
           document.querySelector('#faction-crimes')       ||
           document.querySelector('.content-wrapper')      ||
           document.querySelector('#mainContainer'));

      if (!anchor?.parentNode) return false;
      clearInjectWait();

      const root = buildRoot();
      anchor.parentNode.insertBefore(root, anchor);
      const configStatus = root.querySelector('#ocm-cfg-status');
      let configStatusTimer;
      const setConfigStatus = (message, duration = 3000) => {
        if (!configStatus?.isConnected) return;
        clearTimeout(configStatusTimer);
        configStatus.textContent = message;
        configStatusTimer = setTimeout(() => { configStatus.textContent = ''; }, duration);
      };
      // Torn can replace the mounted pane without changing its URL. Watch only
      // the root's ancestor child lists, not the busy dashboard subtree.
      const detachObserver = new MutationObserver(() => {
        if (root.isConnected) return;
        detachObserver.disconnect();
        clearTimeout(configStatusTimer);
        inject();
      });
      for (let parent = root.parentNode; parent; parent = parent.parentNode) {
        detachObserver.observe(parent, { childList: true });
      }
      initCollapse();
      initTabs();
      initOcMobileUi(root);
      document.querySelector('#ocm-tabs .ocm-nav[data-tab="armoury"]')?.addEventListener('click', mountArmouryInline);
      if (document.querySelector('#ocm-tabs .ocm-nav.active')?.dataset.tab === 'armoury') mountArmouryInline();
      initLegend();
      initShareConfig();
      initDynamicCollapse();
      initDiagnosticsPanel(setConfigStatus);

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

      const savedKey = hubEffectiveTornKey();
      if (savedKey) {
        document.getElementById('ocm-api-input').value = '••••••••••••••••';
        document.getElementById('ocm-key-status').textContent = `Key saved ✓ · CPR ${CPR_WARN}%/${CPR_CRIT}% · W ${WEIGHT_HIGH}%/${WEIGHT_MID}% · ↻${REFRESH_S}s`;
        if (hubBindingAwake() && !_ocmLoadInFlight) loadData(savedKey);
        else hubBindingQueueRefresh();
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
      document.getElementById('ocm-config-close')?.addEventListener('click', () => {
        document.getElementById('ocm-config-panel').style.display = 'none';
      });

      // Force Member Mode toggle — init from saved state, save on change, reload
      const forceMemberEl = document.getElementById('ocm-cfg-force-member');
      if (forceMemberEl) {
        forceMemberEl.checked = GM_getValue(GMK.FORCE_MEMBER, false);
        forceMemberEl.addEventListener('change', () => {
          GM_setValue(GMK.FORCE_MEMBER, forceMemberEl.checked);
          const k = hubEffectiveTornKey();
          if (k) loadData(k);
        });
      }

      // Money-estimate chip toggle — defaults ON, init from saved state, reload on change
      const moneyEstEl = document.getElementById('ocm-cfg-money-est');
      if (moneyEstEl) {
        moneyEstEl.checked = GM_getValue(GMK.SHOW_MONEY_EST, true);
        moneyEstEl.addEventListener('change', () => {
          GM_setValue(GMK.SHOW_MONEY_EST, moneyEstEl.checked);
          annotateNativeOcCards();   // Torn's own cards aren't part of the suite re-render
          const k = hubEffectiveTornKey();
          if (k) loadData(k);
        });
      }

      // Save API key
      document.getElementById('ocm-save-key-btn').addEventListener('click', () => {
        const key = document.getElementById('ocm-api-input').value.trim();
        if (!key || key.startsWith('•')) {
          const k = hubEffectiveTornKey();
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
        setConfigStatus('Saved ✓', 2000);
        const key = hubEffectiveTornKey();
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
        setConfigStatus('Reset to defaults ✓', 2000);
        const key = hubEffectiveTornKey();
        if (key) { scheduleRefresh(key); loadData(key); }
      });

      // Manual refresh button
      document.getElementById('ocm-refresh-btn').addEventListener('click', () => {
        const key = hubEffectiveTornKey();
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
        setConfigStatus('✓ Debug snapshot downloaded');
      });

      document.getElementById('ocm-debug-copy-btn').addEventListener('click', () => {
        const json = JSON.stringify(buildDebugSnapshot(), null, 2);
        const setStatus = setConfigStatus;
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
          const apiKey = hubEffectiveTornKey();
          if (apiKey) loadData(apiKey);
        } catch (e) {
          _tsLastFailAt = Date.now();  // Manual failure also triggers cooldown
          s.textContent = '✗ ' + e.message;
          s.style.color = 'var(--ocm-cpr-crit)';
        }
      });

      // Rebuild CPR cache — re-gather every CPR reference from source.
      // Deliberately NON-DESTRUCTIVE: the archive is the faction's only memory of
      // runs older than the API's ~100-OC window, so this refreshes and adds to it
      // rather than wiping and rebuilding (which would permanently lose that tail).
      document.getElementById('ocm-cpr-recache-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('ocm-cpr-recache-btn');
        const out = document.getElementById('ocm-cpr-recache-status');
        const apiKey = hubEffectiveTornKey();
        const tsKey  = GM_getValue(GMK.TS_KEY, '');
        const orig = btn.textContent;
        btn.disabled = true; btn.textContent = '⏳ Rebuilding…';
        out.style.color = 'var(--ocm-text-dim)';
        const notes = [];
        try {
          _cprArcCache = null;                      // drop the read cache
          GM_setValue(GMK.TS_CPR_CACHE, '{}');      // force the TS cache stale
          _tsLastFailAt = 0;                        // and clear any back-off

          if (tsKey) {
            out.textContent = 'Fetching TornStats…';
            try {
              tsCprData = await fetchTornStatsCpr(tsKey);
              saveTsCprCache(tsCprData);
              notes.push(`TornStats ${Object.keys(tsCprData).length} members`);
            } catch (e) {
              _tsLastFailAt = Date.now();
              notes.push(`TornStats failed (${e.message})`);
            }
          } else {
            notes.push('TornStats skipped (no key)');
          }

          if (apiKey) {
            out.textContent = 'Re-reading faction OC history…';
            await loadData(apiKey);   // rebuilds _ocmHistoryCpr + archives observed runs
            notes.push('history re-read');
          }

          if (tsCprData && Object.keys(tsCprData).length && _cprBackfillCtx) {
            const res = backfillCprFromTornStats(
              tsCprData, _cprBackfillCtx.mInfo, _cprBackfillCtx.exMemberNames, getWeight);
            notes.push(`archive +${res.filled}`);
            if (apiKey) loadData(apiKey);   // re-render against the updated archive
          }

          out.textContent = '✓ ' + notes.join(' · ');
          out.style.color = 'var(--ocm-cpr-good)';
          ocmToast('CPR references rebuilt.', 'ok');
        } catch (e) {
          out.textContent = '✗ ' + (e.message || 'rebuild failed');
          out.style.color = 'var(--ocm-cpr-crit)';
        } finally {
          btn.disabled = false; btn.textContent = orig;
        }
      });

      return true;
    };
    if (mount()) return;
    _ocmInjectObserver = new MutationObserver(mount);
    _ocmInjectObserver.observe(document.documentElement, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['id', 'class', 'data-traveling', 'data-abroad'],
    });
    _ocmInjectTimer = setTimeout(clearInjectWait, 30_000);
  }

  // ─── SIDEBAR WIDGET ──────────────────────────────────────────────────────────

  /** Fetch fresh data for the sidebar widget and update the GM_setValue cache. */
  async function fetchSidebarData(apiKey) {
    try {
      const url  = `${API_BASE}/faction?selections=crimes,members&key=${encodeURIComponent(apiKey)}&comment=OCSuite-sidebar`;
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
      window._ocmSidebarTimer = setInterval(() => {
        if (!document.getElementById('ocm-sidebar-widget')) {
          clearInterval(window._ocmSidebarTimer);
          window._ocmSidebarTimer = null;
          return;
        }
        renderSidebarWidget();
      }, 1000);

      const apiKey   = hubEffectiveTornKey();
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
      .map(i => `<div style="color:var(--ocm-text-dim);font-size:10px;padding:1px 0">${i.sev === 'crit' ? '🔴' : '⚠️'} ${esc(i.msg)}</div>`)
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
  // The generated Hub adapter initializes synchronously later in this script.
  queueMicrotask(inject);
  initLoanAutofill();
  initArmoryAnnotations();
  mountNativeLoanList();
  initNativeOcMoney();
  // Armoury is a hash route — a later navigation there must also autofill.
  // Crimes is too, and Torn tears its list down when you leave, so the money
  // badges need re-initialising (against the NEW list node) on the way back.
  window.addEventListener('hashchange', () => {
    initLoanAutofill(); initArmoryAnnotations(); mountNativeLoanList(); initNativeOcMoney();
  });
  injectSidebar();
  fetchRoleWeights();

// SCRIPT HUB ADAPTER START
// Public appearance data only. These functions are bundled into userscripts.
function normalizeScriptUiTheme(raw) {
  const record=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key)?object[key]:undefined;
  raw=record(raw);if(own(raw,'version')!==undefined&&own(raw,'version')!==1)raw={};
  const choice=(key,allowed,fallback)=>allowed.includes(own(raw,key))?own(raw,key):fallback;
  const bounded=(key,min,max,fallback)=>typeof own(raw,key)==='number'&&Number.isFinite(own(raw,key))?Math.max(min,Math.min(max,own(raw,key))):fallback;
  const colors={light:{},dark:{}};
  const roles=['background','surface','raised','text','muted','border','accent','success','warning','error','focus','selection','chart1','chart2','chart3','chart4','chart5','chart6'];
  for(const mode of ['light','dark']){
    const input=record(own(record(own(raw,'colors')),mode));
    for(const role of roles){const value=own(input,role);if(typeof value==='string'&&/^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(value))colors[mode][role]=(value.length===4?'#'+[...value.slice(1)].map(c=>c+c).join(''):value).toLowerCase();}
  }
  return {version:1,layout:choice('layout',['frostbite','workbench','torn','stock'],'frostbite'),palette:choice('palette',['frostbite','workbench','torn','stock'],'frostbite'),
    mode:choice('mode',['system','dark','light'],'system'),density:choice('density',['comfortable','compact'],'comfortable'),
    radius:bounded('radius',0,18,null),fontScale:bounded('fontScale',.85,1.35,1),colors};
}

function resolveScriptUiTheme(raw, dark=false) {
  const theme=normalizeScriptUiTheme(raw),mode=theme.mode==='system'?(dark?'dark':'light'):theme.mode;
  // Each palette owns color roles only; layout defaults never select a palette.
  const bases={
    frostbite:{light:['#edf4fa','#ffffff','#e4edf6','#172b40','#4b6075','#bdcedd','#2563a8'],dark:['#0b1421','#111f31','#1a2c42','#e7f0fa','#a4b8cc','#3e546d','#69b5ff']},
    workbench:{light:['#e9e9f0','#ffffff','#f3f2f8','#302c40','#666078','#d3cede','#7051a2'],dark:['#202028','#2a2933','#34323f','#edeaf5','#b7b0c7','#4a4559','#c4a6f5']},
    torn:{light:['#e9e9e9','#ffffff','#dddddd','#222222','#555555','#bbbbbb','#416c38'],dark:['#181818','#242424','#333333','#eeeeee','#bbbbbb','#555555','#91be71']},
    stock:{light:['#edf4f3','#ffffff','#ddeceb','#182d2d','#486363','#9bb8b6','#1a696a'],dark:['#101212','#191c1c','#203030','#e5ebeb','#a3b2b2','#3c5555','#68c3c5']}
  };
  const [background,surface,raised,text,muted,border,accent]=bases[theme.palette][mode];
  const states=mode==='dark'?{success:'#83d99a',warning:'#f4ca68',error:'#ff9696',focus:'#b3d8ff',selection:'#2e4866'}:{success:'#23743c',warning:'#865600',error:'#b42328',focus:'#175fc4',selection:'#c5ddf5'};
  const chart=mode==='dark'?['#78b6ff','#e8b86a','#b29bff','#6ad0bf','#ed99bb','#b1ce78']:['#2866ae','#946000','#7547b5','#187c70','#ad426f','#657c24'];
  if(theme.palette==='stock'){states.focus=accent;states.selection=mode==='dark'?'#223b3b':'#c8e5e2';}
  const colors={background,surface,raised,text,muted,border,accent,...states,...Object.fromEntries(chart.map((value,i)=>['chart'+(i+1),value])),...theme.colors[mode]};
  const luminance=hex=>{const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
  const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  colors.onAccent=ratio('#ffffff',colors.accent)>=ratio('#000000',colors.accent)?'#ffffff':'#000000';
  const acrossSurfaces=role=>Math.min(...['background','surface','raised'].map(key=>ratio(colors[role],colors[key])));
  const contrast={text:acrossSurfaces('text'),muted:acrossSurfaces('muted'),onAccent:ratio(colors.onAccent,colors.accent),flags:[]};
  for(const role of ['text','muted','onAccent'])if(contrast[role]<4.5)contrast.flags.push(role);
  if(ratio(colors.focus,colors.surface)<3)contrast.flags.push('focus');
  return {...theme,mode,colors,contrast};
}

function applyScriptUiTheme(node, raw, dark=false) {
  const resolved=resolveScriptUiTheme(raw,dark);
  for(const [role,value]of Object.entries(resolved.colors))node.style.setProperty('--tsui-'+role.replace(/[A-Z]/g,char=>'-'+char.toLowerCase()),value);
  const defaults={frostbite:12,workbench:6,torn:3,stock:6};
  node.style.setProperty('--tsui-radius',(resolved.radius===null?defaults[resolved.layout]:resolved.radius)+'px');
  node.style.setProperty('--tsui-font-scale',String(resolved.fontScale));
  node.style.setProperty('--tsui-space',resolved.density==='compact'?'6px':'10px');
  node.style.setProperty('--tsui-control-height',resolved.density==='compact'?'32px':'38px');
  node.setAttribute('data-tsui-layout',resolved.layout);node.setAttribute('data-tsui-density',resolved.density);node.setAttribute('data-tsui-mode',resolved.mode);
  return resolved;
}

function scriptUiThemeCss() {
  return `.tsui-surface{box-sizing:border-box;color:var(--tsui-text);background:var(--tsui-background);border:1px solid var(--tsui-border);border-radius:var(--tsui-radius);font-size:calc(14px * var(--tsui-font-scale,1));color-scheme:light;accent-color:var(--tsui-accent)}
.tsui-surface[data-tsui-mode="dark"]{color-scheme:dark}
.tsui-surface *{box-sizing:border-box}.tsui-surface ::selection{background:var(--tsui-selection);color:var(--tsui-text)}
.tsui-surface :is(button,input,select,textarea){font:inherit;color:var(--tsui-text);background:var(--tsui-surface);border:1px solid var(--tsui-border);border-radius:calc(var(--tsui-radius) / 2);min-height:var(--tsui-control-height);padding:var(--tsui-space)}
.tsui-surface button{cursor:pointer}.tsui-surface :disabled{cursor:default;opacity:.6}.tsui-surface :focus-visible{outline:2px solid var(--tsui-focus);outline-offset:2px}
.tsui-surface .tsui-primary{color:var(--tsui-on-accent);background:var(--tsui-accent)}.tsui-surface .tsui-muted{color:var(--tsui-muted)}
@media(pointer:coarse),(max-width:600px){.tsui-surface :is(button,input,select,textarea){min-height:44px}.tsui-surface :is(input,select,textarea){font-size:max(16px,1em)}}
@media(prefers-reduced-motion:reduce){.tsui-surface,.tsui-surface *{animation:none!important;transition:none!important;scroll-behavior:auto!important}}`;
}
const SCRIPT_UI_THEME_KEY='torn-script-hub:ui-theme:v1';
const SCRIPT_UI_THEME_EVENT=SCRIPT_UI_THEME_KEY+':changed';

function createScriptUiThemeClient({doc,win,scriptId,read=()=>null,write=()=>{},onChange=()=>{}}) {
  if(typeof scriptId!=='string'||!scriptId.length||scriptId.length>80)throw new TypeError('A bounded scriptId is required.');
  // The builder concatenates the contract first; Node loads the same contract.
  const normalize=typeof normalizeScriptUiTheme==='function'?normalizeScriptUiTheme:require('./script-hub-theme.cjs').normalizeScriptUiTheme;
  let started=false,suspended=false,pdaActive=true,pending=true,override=null,globalTheme=normalize(),effective=normalize();
  let generation=0,overrideRevision=0,pdaRevision=0,readTask=null,lastSignature='',lastDark=null,writeQueue=Promise.resolve(),cancelPdaQuery=null;
  const removers=[],subscribers=new Set();
  let media=null;try{media=win.matchMedia?.('(prefers-color-scheme: dark)');}catch(_){}
  const active=()=>started&&!suspended&&pdaActive&&doc.visibilityState!=='hidden';
  const clone=theme=>normalize(theme);
  const parse=value=>{if(typeof value!=='string'||value.length>8192)return null;try{const parsed=JSON.parse(value);return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)&&(!Object.prototype.hasOwnProperty.call(parsed,'version')||parsed.version===1)?normalize(parsed):null;}catch(_){return null;}};
  function loadGlobal(){
    try{
      const current=parse(win.localStorage?.getItem(SCRIPT_UI_THEME_KEY));if(current)return current;
      const text=win.localStorage?.getItem('torn-script-hub:v2:preferences');
      if(typeof text==='string'&&text.length<=32768){const old=JSON.parse(text);if(old&&typeof old==='object'&&!Array.isArray(old)&&['torn','dark','light'].includes(old.theme))return normalize({layout:'torn',palette:'torn',mode:old.theme==='light'?'light':'dark',density:old.compact===true?'compact':'comfortable',colors:{light:{accent:old.accent},dark:{accent:old.accent}}});}
      return normalize();
    }catch(_){return normalize();}
  }
  function emit(force=false){
    if(!active()){pending=true;return;}
    effective=clone(override||globalTheme);const signature=JSON.stringify(effective),dark=media?.matches===true;
    if(force||signature!==lastSignature||(effective.mode==='system'&&dark!==lastDark)){
      lastSignature=signature;lastDark=dark;onChange(clone(effective));
      for(const listener of subscribers){try{listener(clone(effective));}catch(_){}}
    }
    pending=false;
  }
  function listen(target,name,callback){target.addEventListener(name,callback);removers.push(()=>target.removeEventListener(name,callback));}
  async function refresh(){
    pending=true;if(!active())return get();
    if(readTask)return readTask;
    const ownGeneration=generation,revision=overrideRevision;
    readTask=(async()=>{
      let value;try{value=await read();}catch(_){value=undefined;}
      if(!started||generation!==ownGeneration)return get();
      if(overrideRevision===revision&&value!==undefined)override=value===null?null:normalize(value);
      globalTheme=loadGlobal();emit();return get();
    })();
    try{return await readTask;}finally{if(generation===ownGeneration)readTask=null;}
  }
  function get(){return clone(override||globalTheme);}
  function publicChange(event){
    const value=parse(event.detail);if(!value)return;
    // Events never carry settings or credentials; only the appearance allowlist survives.
    globalTheme=value;pending=true;if(active())emit();
  }
  function storageChange(event){if(event.key!==SCRIPT_UI_THEME_KEY&&event.key!==null)return;pending=true;if(active()){globalTheme=loadGlobal();emit();}}
  function visibility(){if(active()&&pending)void refresh();}
  function tabState(event){
    const state=event.detail;if(!state||typeof state.isActiveTab!=='boolean'||typeof state.isWebViewVisible!=='boolean')return;
    pdaRevision++;pdaActive=state.isActiveTab&&state.isWebViewVisible;
    const awaitingQuery=!!cancelPdaQuery;cancelPdaQuery?.();
    if(active()&&pending&&!awaitingQuery)void refresh();
  }
  function pagehide(event){if(event.persisted){suspended=true;pending=true;}else stop();}
  function pageshow(event){if(event.persisted){suspended=false;pending=true;if(active())void refresh();}}
  function mediaChange(){if(active())emit();else pending=true;}
  async function start(){
    if(started)return refresh();started=true;suspended=false;pending=true;lastSignature='';lastDark=null;
    const ownGeneration=++generation;
    listen(doc,SCRIPT_UI_THEME_EVENT,publicChange);listen(win,SCRIPT_UI_THEME_EVENT,publicChange);listen(win,'storage',storageChange);
    listen(doc,'visibilitychange',visibility);listen(win,'tornpda:tabState',tabState);listen(win,'pagehide',pagehide);listen(win,'pageshow',pageshow);
    if(media?.addEventListener)listen(media,'change',mediaChange);
    else if(media?.addListener){media.addListener(mediaChange);removers.push(()=>media.removeListener(mediaChange));}
    if(typeof win.PDA_getTabState==='function'){
      const revision=pdaRevision;pdaActive=false;
      const state=await new Promise(resolve=>{
        const schedule=win.setTimeout?.bind(win)||setTimeout,clear=win.clearTimeout?.bind(win)||clearTimeout;
        let settled=false,timer=null;
        const finish=value=>{if(settled)return;settled=true;if(timer!==null)clear(timer);if(cancelPdaQuery===finish)cancelPdaQuery=null;resolve(value);};
        cancelPdaQuery=finish;timer=schedule(()=>finish(undefined),750);
        Promise.resolve().then(()=>started&&generation===ownGeneration?win.PDA_getTabState():undefined).then(finish,()=>finish(undefined));
      });
      if(started&&generation===ownGeneration&&revision===pdaRevision)pdaActive=!(state?.isActiveTab===false||state?.isWebViewVisible===false);
    }
    if(started&&generation===ownGeneration)return refresh();return get();
  }
  function stop(){started=false;suspended=false;generation++;readTask=null;cancelPdaQuery?.();for(const remove of removers.splice(0))remove();}
  function setOverride(value){
    const normalized=value===null?null:normalize(value);overrideRevision++;
    const run=async()=>{await write(normalized===null?null:clone(normalized));override=normalized;globalTheme=loadGlobal();emit();return get();};
    const task=writeQueue.then(run);writeQueue=task.catch(()=>{});return task;
  }
  function subscribe(listener){if(typeof listener!=='function')throw new TypeError('Theme listener must be a function');subscribers.add(listener);return()=>subscribers.delete(listener);}
  return {start,stop,get,setOverride,refresh,subscribe};
}
// DOM attributes coordinate independently bundled windows; no callbacks or data cross worlds.
function scriptUiFloatingOwner(doc,node) {
  let owner=null;
  for(let current=node;current&&current!==doc.body&&current!==doc.documentElement;current=current.parentElement){
    if(doc.defaultView.getComputedStyle(current).position==='fixed')owner=current;
  }
  return owner;
}
function scriptUiFloatingWindows(doc) {
  const nodes=new Set(doc.querySelectorAll('[data-tsui-kit="1"][data-tsui-surface="floating"],#tsh-dialog,[data-tsui-stack-window="1"]'));
  for(const root of doc.querySelectorAll('.tsui-legacy-surface')){const owner=scriptUiFloatingOwner(doc,root);if(owner)nodes.add(owner);}
  return Array.from(nodes)
    .filter(node=>!node.hidden&&node.isConnected&&node.getClientRects().length)
    .sort((a,b)=>{
      const rank=node=>{const value=Number(node.getAttribute('data-tsui-stack'));return Number.isSafeInteger(value)&&value>=0&&value<1000000?value:0;};
      return rank(a)-rank(b);
    });
}
function focusScriptUiWindow(doc,node) {
  const windows=scriptUiFloatingWindows(doc),index=windows.indexOf(node);
  if(index!==-1){windows.splice(index,1);windows.push(node);}
  windows.forEach((entry,i)=>{entry.setAttribute('data-tsui-stack',String(i));entry.style.zIndex=String(2147481000+i*2);});
  return windows.length;
}
// Original, bundled vector artwork. Colors inherit theme roles; no remote assets or user data.
function appendScriptUiHeaderArt(doc,header) {
  const mark=doc.createElement('span');mark.className='tsui-theme-mark';mark.setAttribute('aria-hidden','true');
  mark.innerHTML='<svg class="tsui-frost-mark" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M16 3v26M5 9l22 14M5 23L27 9M12 6l4 4 4-4M12 26l4-4 4 4M5 14l5-1-1-5M23 24l-1-5 5-1M5 18l5 1-1 5M23 8l-1 5 5 1"/><path d="m16 11 4 2v6l-4 2-4-2v-6z"/></svg><svg class="tsui-workbench-mark" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="4" y="5" width="24" height="22" rx="3"/><path d="M4 11h24M12 11v16M8 8h1m3 0h1m3 0h1M16 16l3 3-3 3m6 0h3"/></svg><svg class="tsui-torn-mark" viewBox="0 0 32 32" fill="currentColor"><path d="M3 26h26v3H3zm2-9h5v8H5zm7-10h8v18h-8zm10 6h5v12h-5zM14 3h4v3h-4z"/><path d="M14 10h1v2h-1zm3 0h1v2h-1zm-3 5h1v2h-1zm3 0h1v2h-1z" fill="var(--tsui-raised)"/></svg>';
  const scene=doc.createElement('span');scene.className='tsui-theme-scene';scene.setAttribute('aria-hidden','true');
  scene.innerHTML='<svg viewBox="0 0 300 72" preserveAspectRatio="xMaxYMid slice" fill="none" stroke="currentColor"><path d="m0 72 52-38 30 18 49-45 41 35 27-18 46 34 55-42v56z" fill="currentColor" opacity=".09" stroke="none"/><path d="m0 72 52-38 30 18 49-45 41 35 27-18 46 34 55-42M97 39l34-32 5 35 22 15m-70-2 43-48 41 35m-120-8 7 30m140-40 11 39" opacity=".45"/><path d="M260 6v18m-8-14 16 10m-16 0 16-10M224 8v8m-4-6 8 4m-8 0 8-4" opacity=".7"/></svg>';
  header.prepend(mark);header.append(scene);
}
function scriptUiIdentityCss(scope) {
  return `${scope} .tsui-theme-mark{display:none;flex:none;width:30px;height:30px;color:var(--tsui-accent);pointer-events:none}
${scope} .tsui-theme-mark svg{display:none;width:100%;height:100%}
${scope}[data-tsui-layout] .tsui-theme-mark{display:block}
${scope}[data-tsui-layout=frostbite] .tsui-frost-mark,${scope}[data-tsui-layout=workbench] .tsui-workbench-mark,${scope}[data-tsui-layout=torn] .tsui-torn-mark{display:block}
${scope} .tsui-theme-scene{display:none;position:absolute;inset:0 0 0 auto;width:min(44%,300px);overflow:hidden;color:var(--tsui-accent);opacity:.45;pointer-events:none;z-index:-1}
${scope} .tsui-theme-scene svg{width:100%;height:100%}
${scope}[data-tsui-layout=frostbite] .tsui-theme-scene{display:block}
${scope}[data-tsui-layout=frostbite] .tsui-header,${scope}[data-tsui-layout=frostbite] .tsh-header{isolation:isolate}
${scope}[data-tsui-layout=torn] .tsui-theme-mark{width:22px;height:22px}
@media(max-width:600px){${scope} .tsui-theme-mark{width:24px;height:24px}${scope} .tsui-theme-scene{opacity:.28;width:38%}}`;
}
'use strict';

/** Shared, framework-free native script surfaces. No network or storage is owned here.
 * createTornScriptUI({doc,win,id,title,surface,mount,applyTheme,theme,themeClient,
 *   ownsThemeClient:false,sections:[{id,label,node,footer,headerAction,render(host,ui)}],settings,inspector,
 *   onVisibilityChange(active),onSelect(id),onClose(),onDestroy(),autoDestroyOnDetach:true,
 *   readLayout(),writeLayout({version:1,desktop,mobile})}).
 * Layout adapters are optional, may be async, and receive only a bounded geometry
 * profile (x/y/width/height/locked/collapsed/selected). Mount never waits for IO;
 * interaction wins over a pending read. Writes coalesce to one pending snapshot.
 * Render callbacks run once; their optional returned cleanup runs on destroy.
 * A section node and the public content/settings/inspector slots are escape hatches
 * for native script UI. Scripts own drafts, refreshes, jobs, persistence and secrets.
 * themeClient supports get/start/stop; use setTheme in its onChange callback.
 * notice(text,{kind}), status(text), task({id,label,onCancel,onPause,onResume}),
 * table({columns:[{key,label}],rows,limit}) are bounded text-only helpers.
 * Tasks never cancel implicitly; visibility is reported for script-owned policies.
 */
function createTornScriptUI(options = {}) {
  const doc = options.doc;
  const win = options.win || (doc && doc.defaultView);
  if (!doc || typeof doc.createElement !== 'function' || !win) throw new TypeError('UI kit requires a document and window');
  if (typeof options.applyTheme !== 'function') throw new TypeError('UI kit requires applyTheme');
  // Isolated userscript worlds share DOM, but cannot safely share JS objects.
  // Only version, visibility and stack order cross this coordination boundary.
  let style = doc.querySelector('style[data-tsui-style="1"]');
  if (!style) {
    style = doc.createElement('style'); style.setAttribute('data-tsui-style', '1');
    (doc.head || doc.documentElement).append(style);
  }
  // Independently updated scripts can arrive in either order. Upgrade older
  // shared CSS once, while leaving a future revision owned by a newer bundle.
  const styleRevision=Number(style.getAttribute('data-tsui-style-revision'));
  if(!Number.isSafeInteger(styleRevision)||styleRevision<3){style.textContent=scriptUiKitCss();style.setAttribute('data-tsui-style-revision','3');}
  let launcherTray = doc.querySelector('[data-tsui-launchers="1"]');
  if (!launcherTray) {
    launcherTray = doc.createElement('div'); launcherTray.className = 'tsui-launchers';
    launcherTray.setAttribute('data-tsui-launchers', '1');
    (doc.body || doc.documentElement).append(launcherTray);
  }
  const cleanups = [];
  const tasks = new Map();
  const sections = new Map();
  const floating = options.surface !== 'embedded';
  // PDA capabilities are independent of viewport size; desktop touch stays desktop.
  function pdaOpening() { return floating && (typeof PDA_storage !== 'undefined' && !!PDA_storage || typeof win.PDA_getTabState === 'function' || typeof win.PDA_httpGet === 'function'); }
  let destroyed = false, shown = true, collapsed = false, minimized = false, maximized = false, locked = false;
  let pdaActive = typeof win.PDA_getTabState !== 'function', pageActive = true, pdaRevision = 0, lastActive, gesture = null, selected = null, returnFocus = null;
  let pdaTimer = null;
  function clearPdaTimer() { if (pdaTimer !== null) { win.clearTimeout(pdaTimer); pdaTimer = null; } }
  let currentTheme = {}, explicitDark;
  let themeQueued = false, nextTask = 0;
  const firstTheme=options.theme||(options.themeClient?.get?options.themeClient.get():{});
  const initial = { x: 24, y: 40, width: firstTheme?.layout==='stock'?340:760, height: firstTheme?.layout==='stock'?760:540 };
  let rect = { ...initial }, previousRect = null;
  let booting = true, visibilityQueued = false, writingLayout = false, persistQueued = false, pendingLayout = null;
  let layoutLoading = floating && typeof options.readLayout === 'function';
  const editedGeometry = new Set(), editedSelection = new Set();
  let currentProfile = profileName();
  let profiles = { desktop: normalizeProfile(), mobile: normalizeProfile() };
  function profileName() { const view = viewport(); return view.width <= 600 || view.height <= 500 ? 'mobile' : 'desktop'; }
  function normalizeProfile(value) {
    const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const normalized = { ...initial, locked: raw.locked === true, collapsed: raw.collapsed === true, selected: typeof raw.selected === 'string' ? raw.selected.slice(0, 100) : null };
    for (const key of ['x', 'y', 'width', 'height']) {
      if (typeof raw[key] === 'number' && Number.isFinite(raw[key]) && raw[key] >= 0 && raw[key] <= (key === 'x' || key === 'y' ? 100000 : 4096)) normalized[key] = raw[key];
    }
    return normalized;
  }
  function snapshotProfile() { return normalizeProfile({ ...(maximized && previousRect ? previousRect : rect), locked, collapsed, selected }); }
  function rememberLayout(geometryChanged = true) {
    if (booting || destroyed || !floating) return;
    if (layoutLoading) (geometryChanged ? editedGeometry : editedSelection).add(currentProfile);
    profiles[currentProfile] = snapshotProfile();
    if (typeof options.writeLayout !== 'function') return;
    pendingLayout = { version: 1, desktop: { ...profiles.desktop }, mobile: { ...profiles.mobile } };
    queuePersist();
  }
  function queuePersist() {
    if (layoutLoading || persistQueued || writingLayout || !pendingLayout || destroyed || doc.visibilityState === 'hidden' || !pdaActive || !pageActive) return;
    persistQueued = true;
    Promise.resolve().then(async () => {
      persistQueued = false; if (layoutLoading || destroyed || !pendingLayout || doc.visibilityState === 'hidden' || !pdaActive || !pageActive) return;
      const value = pendingLayout; pendingLayout = null; writingLayout = true;
      try { await options.writeLayout(value); } catch (_) { if (!destroyed) notice('Window layout could not be saved.', { kind: 'error' }); }
      finally { writingLayout = false; queuePersist(); }
    });
  }
  function applyProfile(value) {
    const normalized = normalizeProfile(value);
    rect = { x: normalized.x, y: normalized.y, width: normalized.width, height: normalized.height };
    locked = normalized.locked; collapsed = maximized ? false : normalized.collapsed;
    if (maximized) previousRect = { ...rect };
    if (normalized.selected && sections.has(normalized.selected)) {
      const wasBooting = booting; booting = true; select(normalized.selected); booting = wasBooting;
    }
    update();
  }
  function viewportChanged() {
    const nextProfile = profileName();
    if (nextProfile !== currentProfile) {
      profiles[currentProfile] = snapshotProfile(); currentProfile = nextProfile;
      applyProfile(profiles[currentProfile]);
    } else fit();
  }
  function node(tag, className, text) {
    const value = doc.createElement(tag);
    if (className) value.className = className;
    if (text !== undefined) value.textContent = String(text).slice(0, 4000);
    return value;
  }
  function listen(target, type, callback, opts) {
    target.addEventListener(type, callback, opts);
    cleanups.push(() => target.removeEventListener(type, callback, opts));
  }
  function button(text, label, callback, parent) {
    const value = node('button', '', text); value.type = 'button';
    value.setAttribute('aria-label', label);
    listen(value, 'click', callback); if (parent) parent.append(value);
    return value;
  }
  const root = node('section', 'tsui-root');
  root.setAttribute('data-tsui-kit', '1');
  root.dataset.tsuiId = String(options.id || 'script-ui').slice(0, 100);
  root.dataset.tsuiSurface = floating ? 'floating' : 'embedded';
  root.setAttribute('aria-label', String(options.title || 'Script tool').slice(0, 200));
  root.tabIndex = -1;
  const dragStrip=node('div','tsui-drag-strip','⠿ drag');dragStrip.tabIndex=0;dragStrip.setAttribute('role','button');dragStrip.setAttribute('aria-label','Move '+(options.title||'Script tool'));
  const header = node('header', 'tsui-header');
  const title = node('div', 'tsui-title', options.title || 'Script tool');
  title.tabIndex = 0;
  title.setAttribute('aria-label', 'Move ' + (options.title || 'Script tool'));
  title.title = 'Drag to move. Focus and use arrow keys to move; Shift + arrows resize. Escape cancels a drag.';
  const controls = node('div', 'tsui-controls');
  const headerActions=node('div','tsui-header-actions');controls.append(headerActions);
  header.append(title, controls);
  if(typeof appendScriptUiHeaderArt==='function')appendScriptUiHeaderArt(doc,header);
  const body = node('div', 'tsui-body');
  const nav = node('nav', 'tsui-nav'); nav.setAttribute('aria-label', 'Tool pages');
  const content = node('div', 'tsui-content');
  const settings = node('aside', 'tsui-settings'); settings.setAttribute('aria-label', 'Tool settings');
  const inspector = node('aside', 'tsui-inspector'); inspector.setAttribute('aria-label', 'Details');
  if (options.settings) settings.append(options.settings);
  if (options.inspector) inspector.append(options.inspector);
  body.append(nav, content, settings, inspector);
  const footer = node('footer', 'tsui-footer');
  const statusNode = node('div', 'tsui-status'); statusNode.setAttribute('role', 'status');
  const notices = node('div', 'tsui-notices'); notices.setAttribute('aria-live', 'polite');
  const taskList = node('div', 'tsui-tasks');
  footer.append(statusNode, notices, taskList);
  const sectionFooters=node('div','tsui-section-footers');
  const resize = node('div', 'tsui-resize'); resize.setAttribute('aria-hidden', 'true');
  root.append(dragStrip,header, body,sectionFooters, footer, resize);
  const launcher = button(options.title || 'Script tool', 'Restore ' + (options.title || 'Script tool'), () => { restore(); focus(); });
  launcher.className = 'tsui-launcher'; launcher.hidden = true;
  const mount = options.mount || doc.body || doc.documentElement;
  mount.append(root);
  // A DOM-owned tray gives independently bundled launchers native flex sizing,
  // wrapping and scrolling. Each host still owns its private handlers and tokens.
  const launcherHost = node('div', 'tsui-launcher-host'); launcherHost.setAttribute('data-tsui-launcher-host', '1');
  launcherHost.hidden = true; launcherHost.append(launcher); launcherTray.append(launcherHost);

  function active() { return !destroyed && shown && !minimized && !collapsed && pageActive && doc.visibilityState !== 'hidden' && pdaActive; }
  function visibility() {
    // Consumers may still be moving their content into the returned shell.
    // Initial notifications must run after construction and caller assignment.
    if(booting){
      if(!visibilityQueued){visibilityQueued=true;Promise.resolve().then(()=>{visibilityQueued=false;if(!destroyed)visibility();});}
      return;
    }
    queuePersist();
    const value = active();
    if (value === lastActive) return;
    lastActive = value;
    if (!value) endGesture(true);
    if (typeof options.onVisibilityChange === 'function') options.onVisibilityChange(value);
  }
  function viewport() {
    return { width: Math.max(1, Math.min(win.innerWidth || 1024, win.visualViewport ? win.visualViewport.width : Infinity)), height: Math.max(1, Math.min(win.innerHeight || 768, win.visualViewport ? win.visualViewport.height : Infinity)) };
  }
  function fit() {
    if (destroyed || !floating) return;
    const view = viewport(), inset = Math.min(8, view.width / 8, view.height / 8);
    const maxWidth = Math.max(1, view.width - inset * 2), maxHeight = Math.max(1, view.height - inset * 2);
    if (maximized) rect = { x: inset, y: inset, width: maxWidth, height: maxHeight };
    else {
      rect.width = Math.min(maxWidth, Math.max(Math.min(320, maxWidth), rect.width));
      rect.height = Math.min(maxHeight, Math.max(Math.min(180, maxHeight), rect.height));
      rect.x = Math.max(inset, Math.min(view.width - rect.width - inset, rect.x));
      rect.y = Math.max(inset, Math.min(view.height - (collapsed ? Math.min(92, rect.height) : rect.height) - inset, rect.y));
    }
    Object.assign(root.style, { left: rect.x + 'px', top: rect.y + 'px', width: rect.width + 'px', height: collapsed ? 'auto' : rect.height + 'px' });
  }
  function focus() {
    if (destroyed) return;
    if(typeof focusScriptUiWindow==='function'){
      const count=focusScriptUiWindow(doc,root);launcherTray.style.zIndex=String(2147481001+count*2);stackLaunchers();return;
    }
    const windows = floatingRoots();
    const index = windows.indexOf(root);
    if (index !== -1) { windows.splice(index, 1); windows.push(root); }
    windows.forEach((entry, i) => { entry.setAttribute('data-tsui-stack', String(i)); entry.style.zIndex = String(100000 + i * 2); });
    launcherTray.style.zIndex = String(100001 + windows.length * 2);
    stackLaunchers();
  }
  function floatingRoots() {
    if(typeof scriptUiFloatingWindows==='function')return scriptUiFloatingWindows(doc);
    return Array.from(doc.querySelectorAll('[data-tsui-kit="1"][data-tsui-surface="floating"]'))
      .filter(entry => !entry.hidden && entry.isConnected && entry.getClientRects().length)
      .sort((left, right) => {
        const rank = entry => { const value = Number(entry.getAttribute('data-tsui-stack')); return Number.isSafeInteger(value) && value >= 0 && value < 1000000 ? value : 0; };
        return rank(left) - rank(right);
      });
  }
  function stackLaunchers() {
    launcherTray.hidden = !Array.from(launcherTray.children).some(entry => !entry.hidden);
  }
  function update() {
    if (destroyed) return;
    root.hidden = !shown || minimized; launcherHost.hidden = launcher.hidden = !shown || !minimized;
    body.hidden = collapsed; footer.hidden = collapsed;sectionFooters.hidden=collapsed;
    if(!shown||minimized||collapsed)closeWindowOptions();
    root.dataset.tsuiCollapsed = String(collapsed); root.dataset.tsuiLocked = String(locked);root.dataset.tsuiMaximized=String(maximized);root.dataset.tsuiPda=String(pdaOpening());
    collapseButton.textContent = collapsed ? 'Expand' : 'Collapse'; collapseButton.setAttribute('aria-expanded', String(!collapsed));
    lockButton.textContent = locked ? 'Unlock' : 'Lock'; lockButton.setAttribute('aria-pressed', String(locked));
    resize.hidden = !floating || locked || maximized || collapsed;
    fit(); visibility(); stackLaunchers();
  }
  function show() { if (destroyed) return; shown = true; if (pdaOpening()) maximize(false); else update(); focus(); }
  function hide() { if (destroyed) return; shown = false; update(); }
  function close() { if (destroyed || !shown) return; hide(); if (typeof options.onClose === 'function') options.onClose(); }
  function collapse(value = !collapsed) { if (destroyed || collapsed === !!value) return; collapsed = !!value; update(); rememberLayout(); }
  function minimize() { if (destroyed) return; returnFocus = doc.activeElement; minimized = true; update(); launcher.focus(); }
  function maximize(remember = true) { if (destroyed || !floating) return; if (!maximized) previousRect = { ...rect }; maximized = true; minimized = collapsed = false; update(); if (remember) rememberLayout(); }
  function restore() {
    if (destroyed) return;
    const reopening = minimized || !shown;
    if (maximized && previousRect) rect = { ...previousRect };
    maximized = minimized = collapsed = false; shown = true; update();
    if (reopening && pdaOpening()) maximize(false);
    if (returnFocus && root.contains(returnFocus)) returnFocus.focus(); else title.focus();
    returnFocus = null;
    rememberLayout();
  }
  function setLocked(value) { if (destroyed || locked === !!value) return; locked = !!value; endGesture(true); update(); rememberLayout(); }
  function reset() { if (destroyed) return; rect = { ...initial }; maximized = minimized = collapsed = locked = false; shown = true; update(); rememberLayout(); }
  function endGesture(cancel) {
    if (!gesture) return;
    const old = gesture; gesture = null;
    if (cancel) { rect = old.start; fit(); }
    try { if (old.target.hasPointerCapture(old.pointerId)) old.target.releasePointerCapture(old.pointerId); } catch (_) {}
    root.classList.remove('tsui-gesturing');
    if (!cancel) rememberLayout();
  }
  function beginGesture(event, kind) {
    if (!floating || locked || maximized || event.button !== 0 || gesture || !active() || viewport().width <= 600 || event.pointerType === 'touch') return;
    if (layoutLoading) editedGeometry.add(currentProfile);
    focus(); gesture = { kind, pointerId: event.pointerId, target: event.currentTarget, start: { ...rect }, x: event.clientX, y: event.clientY };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch (_) {}
    root.classList.add('tsui-gesturing'); event.preventDefault();
  }
  const collapseButton = button('Collapse', 'Collapse or expand', () => collapse(), controls);
  const optionsToggle=button('⋯','Window options',()=>{const open=optionsToggle.getAttribute('aria-expanded')!=='true';optionsToggle.setAttribute('aria-expanded',String(open));windowOptions.dataset.open=String(open);if(open)windowOptions.querySelector('button')?.focus();},controls);
  optionsToggle.className='tsui-window-options-toggle';optionsToggle.setAttribute('aria-expanded','false');
  const windowOptions=node('div','tsui-window-options');windowOptions.setAttribute('role','group');windowOptions.setAttribute('aria-label','Window controls');controls.append(windowOptions);
  function closeWindowOptions(){optionsToggle.setAttribute('aria-expanded','false');windowOptions.dataset.open='false';}
  const lockButton = button('Lock', 'Lock or unlock position', () => setLocked(!locked), windowOptions);
  button('Reset', 'Reset window position', reset, windowOptions);
  if (floating) {
    button('Minimize', 'Minimize window', minimize, windowOptions);
    button('Maximize', 'Maximize or restore window', () => maximized ? restore() : maximize(), windowOptions);
  } else { lockButton.hidden = true; controls.querySelector('[aria-label="Reset window position"]').hidden = true; }
  button('×', 'Close window', close, controls);
  listen(doc,'pointerdown',event=>{if(!controls.contains(event.target))closeWindowOptions();});
  listen(title, 'pointerdown', event => beginGesture(event, 'move'));
  listen(dragStrip,'pointerdown',event=>beginGesture(event,'move'));
  listen(resize, 'pointerdown', event => beginGesture(event, 'resize'));
  listen(win, 'pointermove', event => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    rect = { ...gesture.start };
    if (gesture.kind === 'move') { rect.x += dx; rect.y += dy; } else { rect.width += dx; rect.height += dy; }
    fit();
  });
  listen(win, 'pointerup', event => { if (gesture && event.pointerId === gesture.pointerId) endGesture(false); });
  listen(win, 'pointercancel', () => endGesture(true));
  listen(win, 'blur', () => endGesture(true));
  listen(title, 'lostpointercapture', () => endGesture(true));
  listen(dragStrip,'lostpointercapture',()=>endGesture(true));
  listen(resize, 'lostpointercapture', () => endGesture(true));
  function moveKey(event) {
    if (!floating || locked || maximized || !/^Arrow(Left|Right|Up|Down)$/.test(event.key)) return;
    const delta = /Left|Up/.test(event.key) ? -10 : 10;
    const horizontal = /Left|Right/.test(event.key);
    rect[event.shiftKey ? horizontal ? 'width' : 'height' : horizontal ? 'x' : 'y'] += delta;
    fit(); rememberLayout(); event.preventDefault();
  }
  listen(title,'keydown',moveKey);listen(dragStrip,'keydown',moveKey);
  listen(root, 'pointerdown', focus);
  listen(root, 'focusin', focus);
  listen(doc, 'keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const top = floatingRoots().at(-1);
    if (top !== root) return;
    if(optionsToggle.getAttribute('aria-expanded')==='true'){closeWindowOptions();optionsToggle.focus();}
    else if (gesture) endGesture(true);
    else if (maximized) restore();
    else collapse();
    event.preventDefault();
  });
  listen(win, 'resize', viewportChanged);
  if (win.visualViewport) listen(win.visualViewport, 'resize', viewportChanged);
  listen(doc, 'visibilitychange', visibility);
  listen(win, 'pagehide', event => { if (!event.persisted) destroy(); else { pageActive = false; visibility(); } });
  listen(win, 'pageshow', () => { pageActive = true; visibility(); });
  listen(win, 'tornpda:tabState', event => {
    const detail = event.detail;
    if (!detail || typeof detail.isActiveTab !== 'boolean' || typeof detail.isWebViewVisible !== 'boolean') return;
    clearPdaTimer(); pdaRevision++; pdaActive = detail.isActiveTab && detail.isWebViewVisible; visibility();
  });
  if (typeof win.PDA_getTabState === 'function') {
    const revision = pdaRevision;
    function settleInitialPda(detail) {
      if (destroyed || revision !== pdaRevision) return;
      clearPdaTimer(); pdaRevision++;
      // Older or sleeping PDA bridges can return nothing or never settle.
      // Fall back to ordinary document visibility after a bounded wait.
      pdaActive = !detail || typeof detail.isActiveTab !== 'boolean' || typeof detail.isWebViewVisible !== 'boolean'
        ? true : detail.isActiveTab && detail.isWebViewVisible;
      visibility();
    }
    pdaTimer = win.setTimeout(() => settleInitialPda(null), 750);
    Promise.resolve().then(() => win.PDA_getTabState()).then(settleInitialPda, () => settleInitialPda(null));
  }
  function setTheme(theme, dark) {
    if (destroyed) return;
    closeWindowOptions();
    currentTheme = theme || {}; explicitDark = dark;
    const effectiveDark = typeof dark === 'boolean' ? dark : !!(win.matchMedia && win.matchMedia('(prefers-color-scheme: dark)').matches);
    options.applyTheme(root, currentTheme, effectiveDark);
    options.applyTheme(launcherHost, currentTheme, effectiveDark);
    fit();
  }
  if (typeof win.matchMedia === 'function') {
    const media = win.matchMedia('(prefers-color-scheme: dark)');
    if (media.addEventListener) listen(media, 'change', () => setTheme(currentTheme, explicitDark));
  }
  const client = options.themeClient;
  function queueTheme() {
    if (themeQueued || destroyed) return;
    themeQueued = true;
    // Read after every event listener has run, including a later client listener.
    Promise.resolve().then(() => { themeQueued = false; if (!destroyed && client.get) setTheme(client.get()); });
  }
  if (client && typeof client.subscribe === 'function') cleanups.push(client.subscribe(theme => setTheme(theme)));
  else if (client) {
    listen(doc, 'torn-script-hub:ui-theme:v1:changed', queueTheme);
    listen(win, 'torn-script-hub:ui-theme:v1:changed', queueTheme);
  }
  function select(id) {
    if (destroyed || !sections.has(id)) return false;
    const changed = selected !== id;
    selected = id;
    for (const [key, section] of sections) {
      section.host.hidden = key !== id; section.button.setAttribute('aria-current', key === id ? 'page' : 'false');
      if(section.footer)section.footer.hidden=key!==id;
      if(section.headerButton)section.headerButton.setAttribute('aria-pressed',String(key===id));
    }
    if (changed && !booting) rememberLayout(false);
    if (changed && typeof options.onSelect === 'function') options.onSelect(id);
    return true;
  }
  function notice(text, config = {}) {
    if (destroyed) return null;
    const item = node('div', 'tsui-notice');
    item.dataset.kind = ['success', 'warning', 'error'].includes(config.kind) ? config.kind : 'info';
    item.append(node('span', '', text));
    const dismiss = node('button', '', 'Dismiss'); dismiss.type = 'button'; dismiss.setAttribute('aria-label', 'Dismiss notice');
    dismiss.addEventListener('click', () => item.remove(), { once: true }); item.append(dismiss);
    notices.append(item);
    while (notices.children.length > 5) notices.firstElementChild.remove();
    return item;
  }
  function status(text) { if (!destroyed) statusNode.textContent = String(text || '').slice(0, 500); }
  function task(config = {}) {
    if (destroyed) return null;
    const id = String(config.id || 'task-' + nextTask++).slice(0, 100);
    if (tasks.has(id)) return tasks.get(id);
    if (tasks.size >= 8) { notice('Finish an existing task before adding another.', { kind: 'warning' }); return null; }
    const host = node('div', 'tsui-task');
    const label = node('span', '', config.label || 'Task');
    const progress = node('progress'); progress.max = 100; progress.removeAttribute('value');
    progress.setAttribute('aria-label', String(config.label || 'Task').slice(0, 100));
    host.append(label, progress);
    let ended = false, paused = false;
    const taskCleanups = [];
    // Task controls own their listeners, so finishing work releases callback closures.
    function taskButton(text, accessible, callback) {
      const value = node('button', '', text); value.type = 'button'; value.setAttribute('aria-label', accessible);
      value.addEventListener('click', callback); taskCleanups.push(() => value.removeEventListener('click', callback)); host.append(value); return value;
    }
    function finish() { if (ended) return; ended = true; taskCleanups.splice(0).forEach(fn => fn()); host.remove(); tasks.delete(id); }
    if (typeof config.onCancel === 'function') taskButton('Cancel', 'Cancel ' + (config.label || 'Task'), () => { finish(); config.onCancel(); });
    if (typeof config.onPause === 'function' && typeof config.onResume === 'function') {
      const pause = taskButton('Pause', 'Pause or resume ' + (config.label || 'Task'), () => { paused = !paused; pause.textContent = paused ? 'Resume' : 'Pause'; if (paused) config.onPause(); else config.onResume(); });
    }
    const controller = { update(value = {}) { if (ended || destroyed) return; if (value.label !== undefined) label.textContent = String(value.label).slice(0, 200); if (typeof value.progress === 'number' && Number.isFinite(value.progress)) progress.value = Math.max(0, Math.min(100, value.progress)); }, finish };
    tasks.set(id, controller); taskList.append(host); return controller;
  }
  function table(config = {}) {
    const wrap = node('div', 'tsui-table-scroll'); wrap.tabIndex = 0; wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', String(config.label || 'Data table').slice(0, 100));
    const tableNode = node('table'), head = node('thead'), row = node('tr'), tbody = node('tbody');
    const columns = Array.isArray(config.columns) ? config.columns.slice(0, 20) : [];
    for (const column of columns) { const th = node('th', '', column.label || column.key); th.scope = 'col'; row.append(th); }
    head.append(row);
    const limit = Number.isInteger(config.limit) ? Math.max(0, Math.min(500, config.limit)) : 100;
    for (const item of (Array.isArray(config.rows) ? config.rows : []).slice(0, limit)) {
      const tr = node('tr'); for (const column of columns) tr.append(node('td', '', item && item[column.key] != null ? item[column.key] : '')); tbody.append(tr);
    }
    tableNode.append(head, tbody); wrap.append(tableNode); return wrap;
  }
  function destroy() {
    if (destroyed) return;
    endGesture(true); clearPdaTimer(); destroyed = true; pendingLayout = null; visibility();
    for (const value of tasks.values()) value.finish(); tasks.clear();
    cleanups.splice(0).reverse().forEach(fn => fn());
    if (client && options.ownsThemeClient && typeof client.stop === 'function') client.stop();
    root.remove(); launcherHost.remove();
    if (!doc.querySelector('[data-tsui-kit="1"]')) style.remove();
    if (!launcherTray.children.length) launcherTray.remove(); else stackLaunchers();
    if (typeof options.onDestroy === 'function') options.onDestroy();
  }
  const api = { root, content, settings, inspector, nav, launcherHost, setTheme, select, show, hide, close, collapse, minimize, maximize, restore, setLocked, reset, focus, notice, status, task, table, destroy,
    getState: () => ({ shown, collapsed, minimized, maximized, locked, destroyed, active: active(), selected, rect: { ...rect } }) };
  for (const section of (Array.isArray(options.sections) ? options.sections : []).slice(0, 30)) {
    const id = String(section.id || ''); if (!id || sections.has(id)) continue;
    const host = node('div', 'tsui-page');
    const navButton = button(section.label || id, section.label || id, () => select(id), nav);
    if (section.node) host.append(section.node);
    let footerHost=null,headerButton=null;
    if(section.footer){footerHost=node('div','tsui-section-footer');footerHost.append(section.footer);sectionFooters.append(footerHost);}
    if(typeof section.headerAction==='string'){navButton.dataset.tsuiHeaderAction='true';headerButton=button(section.headerAction.slice(0,4),section.label||id,()=>select(id),headerActions);headerButton.setAttribute('aria-pressed','false');}
    content.append(host); sections.set(id, { host, button: navButton,footer:footerHost,headerButton });
    if (typeof section.render === 'function') { const cleanup = section.render(host, api); if (typeof cleanup === 'function') cleanups.push(cleanup); }
  }
  if (sections.size) select(sections.keys().next().value);
  if (client && typeof client.start === 'function' && options.ownsThemeClient) client.start();
  setTheme(options.theme || (client && client.get ? client.get() : {}), options.dark);
  if (options.autoDestroyOnDetach !== false && typeof win.MutationObserver === 'function') {
    const observer = new win.MutationObserver(() => { if (!root.isConnected) destroy(); });
    observer.observe(doc.documentElement, { childList: true, subtree: true }); cleanups.push(() => observer.disconnect());
  }
  if (pdaOpening()) maximize(false); else update();
  focus();
  booting = false;
  if (floating && typeof options.readLayout === 'function') {
    let timer;
    const deadline = new Promise((_, reject) => { timer = win.setTimeout(() => reject(new Error('Layout read timed out')), 1500); });
    cleanups.push(() => win.clearTimeout(timer));
    Promise.race([Promise.resolve().then(() => options.readLayout()), deadline]).then(value => {
      if (destroyed || !value || typeof value !== 'object' || value.version !== 1) return;
      const restored = { desktop: normalizeProfile(value.desktop), mobile: normalizeProfile(value.mobile) };
      profiles[currentProfile] = snapshotProfile();
      for (const name of ['desktop', 'mobile']) {
        if (editedGeometry.has(name)) restored[name] = profiles[name];
        else if (editedSelection.has(name)) restored[name].selected = profiles[name].selected;
      }
      profiles = restored; applyProfile(profiles[currentProfile]);
      if (pendingLayout) pendingLayout = { version: 1, desktop: { ...profiles.desktop }, mobile: { ...profiles.mobile } };
    }).catch(() => { if (!destroyed) notice('Saved window layout could not be loaded.', { kind: 'warning' }); })
      .finally(() => { win.clearTimeout(timer); layoutLoading = false; editedGeometry.clear(); editedSelection.clear(); queuePersist(); });
  }
  return api;
}

function scriptUiKitCss() {
  return (typeof scriptUiIdentityCss==='function'?scriptUiIdentityCss('.tsui-root'):'')+`
.tsui-root,.tsui-launcher-host{font:calc(14px * var(--tsui-font-scale,1))/1.45 system-ui,sans-serif;color:var(--tsui-text,#e5eaf2);color-scheme:light;box-sizing:border-box}.tsui-root[data-tsui-mode=dark],.tsui-launcher-host[data-tsui-mode=dark]{color-scheme:dark}
.tsui-root *,.tsui-launcher-host *{box-sizing:border-box}.tsui-root[hidden],.tsui-root [hidden],.tsui-launchers[hidden],.tsui-launcher-host[hidden],.tsui-launcher-host [hidden]{display:none!important}
.tsui-root{background:var(--tsui-background,#171d28);border:1px solid var(--tsui-border,#506076);border-radius:var(--tsui-radius,12px);overflow:hidden;min-width:0;display:flex;flex-direction:column;isolation:isolate}
.tsui-root[data-tsui-surface=floating]{position:fixed;box-shadow:0 18px 60px #0007;max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px)}
.tsui-root[data-tsui-surface=embedded]{position:relative;width:100%;min-height:220px;max-height:80dvh}
.tsui-header{position:relative;display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:var(--tsui-space,10px);background:var(--tsui-raised,#242d3c);border-bottom:1px solid var(--tsui-border,#506076);flex:none}
.tsui-title{font-weight:750;flex:1;min-width:90px;cursor:move;touch-action:none;padding:6px}.tsui-controls{display:flex;flex-wrap:wrap;gap:4px}
.tsui-drag-strip,.tsui-header-actions,.tsui-root .tsui-window-options-toggle{display:none}.tsui-window-options{display:contents}.tsui-section-footers{flex:none;max-height:44%;overflow:auto}.tsui-section-footers:empty,.tsui-section-footers:not(:has(.tsui-section-footer:not([hidden]))){display:none}.tsui-section-footer{border-top:1px solid var(--tsui-border);background:var(--tsui-raised);padding:10px}
.tsui-root button,.tsui-launcher{font:inherit;cursor:pointer;color:inherit;background:var(--tsui-surface,#242d3c);border:1px solid var(--tsui-border,#506076);border-radius:var(--tsui-radius,6px);padding:6px 10px;min-height:var(--tsui-control-height,34px)}
.tsui-root button:not(:disabled):hover{background:var(--tsui-selection,#38455b)}.tsui-root :focus-visible,.tsui-launcher:focus-visible{outline:2px solid var(--tsui-focus,#8fbcff);outline-offset:2px}
.tsui-root :is(button,input,select,textarea):disabled{opacity:.55;cursor:default}
.tsui-root .tsui-primary,.tsui-root .tsui-primary:not(:disabled):hover{background:var(--tsui-accent,#96b9ff);color:var(--tsui-on-accent,#101828);border-color:var(--tsui-accent,#96b9ff);font-weight:600}
.tsui-root :is(.tsui-controls,.tsui-nav) button:focus-visible{outline-offset:-3px}
.tsui-root input,.tsui-root select,.tsui-root textarea{font:inherit;color:inherit;background:var(--tsui-surface,#242d3c);border:1px solid var(--tsui-border,#506076);border-radius:4px;padding:8px;max-width:100%}
.tsui-body{display:grid;grid-template-columns:140px minmax(0,1fr);grid-template-rows:minmax(0,1fr) auto auto;min-height:0;flex:1;overflow:auto}.tsui-root[data-tsui-layout=frostbite] .tsui-nav{background:var(--tsui-surface,#242d3c)}.tsui-nav{display:flex;flex-direction:column;gap:6px;padding:10px;border-right:1px solid var(--tsui-border,#506076);grid-row:1/-1}
.tsui-nav:empty,.tsui-settings:empty,.tsui-inspector:empty{display:none}.tsui-body:not(:has(.tsui-nav button)){grid-template-columns:minmax(0,1fr)}
.tsui-nav button{text-align:left}.tsui-nav button[aria-current=page]{border-color:var(--tsui-accent,#96b9ff);background:var(--tsui-selection,#38455b);font-weight:bold}
.tsui-content{min-width:0;padding:16px;overflow:auto;scrollbar-gutter:stable;grid-column:2}.tsui-body:not(:has(.tsui-nav button)) .tsui-content{grid-column:1}.tsui-settings,.tsui-inspector{padding:12px;min-width:0;grid-column:2;border-top:1px solid var(--tsui-border,#506076)}
.tsui-footer{padding:8px 16px;border-top:1px solid var(--tsui-border,#506076);max-height:34%;overflow:auto;flex:none}.tsui-status:empty,.tsui-notices:empty,.tsui-tasks:empty{display:none}.tsui-footer:not(:has(.tsui-status:not(:empty),.tsui-notice,.tsui-task)){display:none}
.tsui-notice,.tsui-task{display:flex;align-items:center;gap:8px;margin:4px 0}.tsui-notice span,.tsui-task span{flex:1;overflow-wrap:anywhere}.tsui-notice[data-kind=error]{color:var(--tsui-error,#ff9e9e)}.tsui-notice[data-kind=warning]{color:var(--tsui-warning,#f4ce83)}.tsui-notice[data-kind=success]{color:var(--tsui-success,#a4dfb6)}.tsui-task progress{width:90px}
.tsui-resize{position:absolute;right:0;bottom:0;width:22px;height:22px;cursor:nwse-resize;touch-action:none;background:linear-gradient(135deg,transparent 55%,var(--tsui-border,#506076) 56%,transparent 65%)}.tsui-gesturing{user-select:none}
.tsui-launchers{position:fixed;bottom:max(12px,env(safe-area-inset-bottom));right:max(12px,env(safe-area-inset-right));width:max-content;max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);display:flex;flex-direction:column;align-items:stretch;gap:12px;overflow:auto;box-sizing:border-box;padding:2px}
.tsui-launcher-host{position:relative;max-width:100%;flex:none}.tsui-launcher{max-width:100%;overflow-wrap:anywhere;white-space:normal;width:100%}
.tsui-table-scroll{max-width:100%;overflow:auto}.tsui-root table{border-collapse:collapse;width:100%}.tsui-root th,.tsui-root td{text-align:left;border-bottom:1px solid var(--tsui-border,#506076);padding:8px;overflow-wrap:anywhere}
.tsui-root[data-tsui-layout=workbench] .tsui-body,.tsui-root[data-tsui-layout=torn] .tsui-body{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr) auto auto}.tsui-root[data-tsui-layout=workbench] .tsui-content,.tsui-root[data-tsui-layout=torn] .tsui-content{grid-column:1}
.tsui-root[data-tsui-layout=workbench] .tsui-nav,.tsui-root[data-tsui-layout=torn] .tsui-nav{flex-direction:row;flex-wrap:wrap;border-right:0;border-bottom:1px solid var(--tsui-border,#506076);grid-row:auto}
.tsui-root[data-tsui-layout=workbench] .tsui-nav{padding-bottom:0;gap:2px}.tsui-root[data-tsui-layout=workbench] .tsui-nav button{border-bottom-left-radius:0;border-bottom-right-radius:0}.tsui-root[data-tsui-layout=workbench] .tsui-settings,.tsui-root[data-tsui-layout=workbench] .tsui-inspector{grid-column:1}
.tsui-root[data-tsui-layout=frostbite] .tsui-header{background:linear-gradient(115deg,var(--tsui-surface),var(--tsui-raised));min-height:70px;padding:12px 16px}.tsui-root[data-tsui-layout=frostbite] .tsui-nav{background:var(--tsui-background)}.tsui-root[data-tsui-layout=frostbite] .tsui-nav button[aria-current=page]{box-shadow:inset 3px 0 0 var(--tsui-accent)}
.tsui-root[data-tsui-layout=workbench] .tsui-header{background:var(--tsui-background);padding:8px 12px}.tsui-root[data-tsui-layout=workbench] .tsui-title{font-family:Consolas,"SFMono-Regular",monospace;font-size:.95em}.tsui-root[data-tsui-layout=workbench] .tsui-nav{background:var(--tsui-background);gap:0;padding-top:0}.tsui-root[data-tsui-layout=workbench] .tsui-nav button{border-top:2px solid var(--tsui-background);border-bottom:0;color:var(--tsui-muted);background:var(--tsui-background);padding:9px 14px}.tsui-root[data-tsui-layout=workbench] .tsui-nav button[aria-current=page]{border-top-color:var(--tsui-accent);background:var(--tsui-surface);color:var(--tsui-text)}.tsui-root[data-tsui-layout=workbench] .tsui-inspector{background:var(--tsui-background)}
.tsui-root[data-tsui-layout=torn]{box-shadow:inset 0 0 0 2px var(--tsui-surface),0 18px 60px #0007}.tsui-root[data-tsui-layout=torn] .tsui-header{padding:5px 8px;background:linear-gradient(var(--tsui-raised),var(--tsui-surface));border-top:2px solid var(--tsui-accent);box-shadow:inset 0 1px 0 var(--tsui-surface)}.tsui-root[data-tsui-layout=torn] .tsui-title{font-family:Arial,Helvetica,sans-serif;font-size:.92em;letter-spacing:.025em;text-transform:uppercase}.tsui-root[data-tsui-layout=torn] .tsui-nav{padding:5px;gap:4px;background:var(--tsui-raised);box-shadow:inset 0 1px 0 var(--tsui-surface)}.tsui-root[data-tsui-layout=torn] .tsui-nav button{padding:5px 10px;font-size:.9em;font-weight:700}.tsui-root[data-tsui-layout=torn] .tsui-content{padding:10px;background:var(--tsui-surface)}.tsui-root[data-tsui-layout=torn] :is(th,td){padding:6px 8px}.tsui-root[data-tsui-layout=torn] th{background:linear-gradient(var(--tsui-raised),var(--tsui-surface));font-size:.9em}.tsui-root[data-tsui-layout=torn] tbody tr:nth-child(even){background:var(--tsui-raised)}.tsui-root[data-tsui-layout=torn] .tsui-settings,.tsui-root[data-tsui-layout=torn] .tsui-inspector{grid-column:1}
@media(min-width:850px){.tsui-root[data-tsui-layout=workbench] .tsui-body:has(.tsui-inspector:not(:empty)){grid-template-columns:minmax(0,1fr) 180px}.tsui-root[data-tsui-layout=workbench] .tsui-nav{grid-column:1/-1}.tsui-root[data-tsui-layout=workbench] .tsui-inspector{grid-column:2;grid-row:2/4;border-left:1px solid var(--tsui-border,#506076)}}
@media(max-width:600px),(pointer:coarse){.tsui-root button,.tsui-launcher{min-height:44px}.tsui-root input,.tsui-root select,.tsui-root textarea{font-size:16px}.tsui-header{gap:4px;padding:6px}.tsui-controls{width:100%;overflow:auto;flex-wrap:nowrap}.tsui-controls button{flex:1;padding:4px;font-size:12px}.tsui-root .tsui-body{grid-template-columns:minmax(0,1fr);grid-template-rows:auto auto auto auto;align-content:start}.tsui-root .tsui-nav{flex-direction:row;flex-wrap:wrap;border-right:0;border-bottom:1px solid var(--tsui-border,#506076);padding:6px;grid-row:auto}.tsui-root .tsui-content{padding:10px;grid-column:1;overflow:visible}.tsui-root .tsui-settings,.tsui-root .tsui-inspector{grid-column:1;grid-row:auto}.tsui-resize{display:none}.tsui-title{touch-action:auto;cursor:default}.tsui-task{flex-wrap:wrap}}
@media(prefers-reduced-motion:reduce){.tsui-root *{animation:none!important;transition:none!important}}
.tsui-root[data-tsui-layout=stock]{font-family:Arial,Helvetica,sans-serif;font-size:calc(13px * var(--tsui-font-scale,1))}
.tsui-root[data-tsui-layout=stock] .tsui-theme-mark{display:none}
.tsui-root[data-tsui-layout=stock][data-tsui-surface=floating]:not([data-tsui-maximized=true]) .tsui-drag-strip{display:block;background:var(--tsui-selection);color:var(--tsui-muted);font:10px/18px Consolas,monospace;letter-spacing:2px;text-align:center;cursor:move;touch-action:none;border-bottom:1px solid var(--tsui-border);flex:none}
.tsui-root[data-tsui-layout=stock] .tsui-header{padding:7px 10px;gap:6px;flex-wrap:nowrap;background:var(--tsui-raised);z-index:3}
.tsui-root[data-tsui-layout=stock] .tsui-title{font-size:1em;font-weight:600;color:var(--tsui-accent);padding:3px 0;min-width:60px;overflow-wrap:anywhere}
.tsui-root[data-tsui-layout=stock] .tsui-controls{width:auto;flex-wrap:nowrap;overflow:visible;gap:4px;flex:none}
.tsui-root[data-tsui-layout=stock] .tsui-header-actions{display:flex;gap:4px}.tsui-root[data-tsui-layout=stock] .tsui-header-actions:empty{display:none}
.tsui-root[data-tsui-layout=stock] .tsui-controls>button,.tsui-root[data-tsui-layout=stock] .tsui-header-actions>button{width:30px;min-height:30px;padding:3px;border-radius:3px;color:var(--tsui-accent)}
.tsui-root[data-tsui-layout=stock] .tsui-window-options-toggle{display:block}
.tsui-root[data-tsui-layout=stock] .tsui-controls>[aria-label="Collapse or expand"]{font-size:0}.tsui-root[data-tsui-layout=stock] .tsui-controls>[aria-label="Collapse or expand"]:before{content:'▴';font-size:16px}
.tsui-root[data-tsui-layout=stock][data-tsui-collapsed=true] .tsui-controls>[aria-label="Collapse or expand"]:before{content:'▾'}
.tsui-root[data-tsui-layout=stock] .tsui-window-options{display:none;position:absolute;right:8px;top:calc(100% + 3px);width:190px;max-height:min(250px,60dvh);overflow:auto;padding:6px;background:var(--tsui-surface);border:1px solid var(--tsui-border);border-radius:var(--tsui-radius);box-shadow:0 6px 20px #0006}
.tsui-root[data-tsui-layout=stock] .tsui-window-options[data-open=true]{display:flex;flex-direction:column;gap:4px}.tsui-root[data-tsui-layout=stock] .tsui-window-options button{text-align:left}
.tsui-root[data-tsui-layout=stock] .tsui-body{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr) auto auto;overflow:hidden}
.tsui-root[data-tsui-layout=stock] .tsui-content{grid-column:1;padding:12px;overflow:auto;scrollbar-gutter:auto}
.tsui-root[data-tsui-layout=stock] .tsui-nav{flex-direction:row;flex-wrap:wrap;grid-row:auto;border-right:0;border-bottom:1px solid var(--tsui-border);padding:0 10px;gap:16px;background:var(--tsui-surface)}
.tsui-root[data-tsui-layout=stock] .tsui-nav button{background:transparent;border:0;border-bottom:2px solid transparent;border-radius:0;padding:9px 2px;color:var(--tsui-muted);font-size:.95em}
.tsui-root[data-tsui-layout=stock] .tsui-nav button[aria-current=page]{border-bottom-color:var(--tsui-accent);color:var(--tsui-accent)}
.tsui-root[data-tsui-layout=stock] .tsui-nav [data-tsui-header-action=true]{display:none}.tsui-root[data-tsui-layout=stock] .tsui-settings,.tsui-root[data-tsui-layout=stock] .tsui-inspector{grid-column:1}
.tsui-root[data-tsui-layout=stock] input,.tsui-root[data-tsui-layout=stock] select{background:var(--tsui-background)}
.tsui-root[data-tsui-layout=stock][data-tsui-pda=true] .tsui-section-footers{padding-bottom:max(48px,env(safe-area-inset-bottom));background:var(--tsui-raised)}
@media(max-width:600px),(pointer:coarse){.tsui-root[data-tsui-layout=stock] .tsui-controls>button,.tsui-root[data-tsui-layout=stock] .tsui-header-actions>button{width:44px;min-height:44px}.tsui-root[data-tsui-layout=stock] .tsui-body{grid-template-rows:auto minmax(0,1fr) auto auto;align-content:stretch}.tsui-root[data-tsui-layout=stock] .tsui-content{overflow:auto}.tsui-root[data-tsui-layout=stock] .tsui-nav button{min-height:44px}.tsui-root[data-tsui-layout=stock] .tsui-title{font-size:13px}}
`;
}
// Appearance-only adoption for explicitly declared legacy roots. This bridge
// shares the existing menu registration identity and never moves script content.
function createScriptUiAppearanceAdapter(options) {
  const {doc,win,id,read=()=>null,write=()=>{},getInstance=()=>null,onChange=()=>{}}=options;
  const safeId=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,79}$/.test(value);
  if(!safeId(id))throw new TypeError('A bounded script id is required.');
  const normalize=options.normalize||(typeof normalizeScriptUiTheme==='function'?normalizeScriptUiTheme:require('./script-hub-theme.cjs').normalizeScriptUiTheme);
  const apply=options.apply||(typeof applyScriptUiTheme==='function'?applyScriptUiTheme:require('./script-hub-theme.cjs').applyScriptUiTheme);
  const css=options.css||(typeof scriptUiThemeCss==='function'?scriptUiThemeCss:require('./script-hub-theme.cjs').scriptUiThemeCss);
  const createClient=options.createClient||(typeof createScriptUiThemeClient==='function'?createScriptUiThemeClient:require('./script-hub-theme-client.cjs').createScriptUiThemeClient);
  const selectors=(Array.isArray(options.selectors)?options.selectors:[]).filter(value=>typeof value==='string'&&value.length>0&&value.length<=240).slice(0,12);
  const commandEvent='torn-script-hub:v1:appearance',resultEvent=commandEvent+'-result';
  let started=false,disposed=false,suspended=false,pdaActive=true,ready=false,generation=0,frame=null,observer=null,style=null;
  let saved=null,readFailed=false,pending=0,queue=Promise.resolve();
  const roots=new Map(),listeners=[],seen=new Set();
  const active=()=>started&&!suspended&&pdaActive&&doc.visibilityState!=='hidden';
  const stateTheme=()=>saved===null?client.get():normalize(saved);
  function revision(){
    const text=JSON.stringify(saved);let first=2166136261,second=5381;
    for(let i=0;i<text.length;i++){first=Math.imul(first^text.charCodeAt(i),16777619);second=Math.imul(second,33)^text.charCodeAt(i);}
    return 'ui-v1:'+(first>>>0).toString(16).padStart(8,'0')+(second>>>0).toString(16).padStart(8,'0');
  }
  async function readSaved(){try{const raw=await read();saved=raw===null||raw===undefined?null:normalize(raw);readFailed=false;return saved;}catch(error){readFailed=true;throw error;}}
  const client=createClient({doc,win,scriptId:id,read:readSaved,write:async value=>{const theme=value===null?null:normalize(value);await write(theme);saved=theme;},onChange:theme=>{ready=true;if(active()){schedule();try{onChange(normalize(theme));}catch(_){}}}});
  function response(command,status){
    if(!active()||getInstance()!==command.instance)return;
    const value={id,instance:command.instance,request:command.request,page:'ui-appearance',status,data:{theme:stateTheme(),inherit:saved===null,revision:revision()}};
    try{const EventClass=win.CustomEvent||globalThis.CustomEvent;doc.dispatchEvent(new EventClass(resultEvent,{detail:JSON.stringify(value)}));}catch(_){}
  }
  function receive(event){
    if(!active()||!ready||typeof event.detail!=='string'||event.detail.length>16384)return;
    let command;try{command=JSON.parse(event.detail);}catch(_){return;}
    if(!command||command.id!==id||!safeId(command.instance)||command.instance!==getInstance()||!safeId(command.request)||command.page!=='ui-appearance'||!['read','save'].includes(command.method))return;
    if(command.method==='save'&&(typeof command.revision!=='string'||command.revision.length>128||!Object.prototype.hasOwnProperty.call(command,'theme')||(command.theme!==null&&(typeof command.theme!=='object'||Array.isArray(command.theme)))))return;
    const key=command.instance+':'+command.request;if(seen.has(key))return;
    if(pending>=5){response(command,'error');return;}
    seen.add(key);if(seen.size>30)seen.delete(seen.values().next().value);pending++;
    const ownGeneration=generation;
    const run=async()=>{
      try{
        if(!active()||generation!==ownGeneration||getInstance()!==command.instance)return;
        await client.refresh();
        if(!active()||generation!==ownGeneration||getInstance()!==command.instance)return;
        if(readFailed)throw new Error('Appearance read unavailable.');
        if(command.method==='save'){
          if(command.revision!==revision()){response(command,'conflict');return;}
          await client.setOverride(command.theme===null?null:normalize(command.theme));
        }
        if(generation===ownGeneration)response(command,'ok');
      }catch(_){if(generation===ownGeneration)response(command,'error');}
      finally{if(generation===ownGeneration)pending--;}
    };
    queue=queue.then(run,run);
  }
  const aliases={
    '--ocm-bg':'background','--ocm-bg-card':'surface','--ocm-bg-hover':'raised','--ocm-text':'text','--ocm-text-card':'text',
    '--ocm-text-dim':'muted','--ocm-text-muted':'muted','--ocm-text-faint':'muted','--ocm-border':'border','--ocm-border-soft':'border','--ocm-link':'accent',
    '--ocm-cpr-good':'success','--ocm-cpr-warn':'warning','--ocm-cpr-crit':'error',
    '--ground':'background','--surface':'surface','--raise':'raised','--line':'border','--text':'text','--dim':'muted','--muted':'muted','--faint':'muted',
    '--accent':'accent','--accent-dim':'accent','--warn':'warning','--bad':'error','--info':'focus',
    '--twpc-bg':'background','--twpc-surface':'surface','--twpc-text':'text','--twpc-muted':'muted','--twpc-line':'border','--twpc-accent':'accent'
  };
  function restore(node,record){
    for(const [key,entry]of record.styles){
      // A script may update its own inline properties while the bridge is active.
      if(node.style.getPropertyValue(key)!==entry.last||node.style.getPropertyPriority(key)!==entry.lastPriority)continue;
      if(entry.value)node.style.setProperty(key,entry.value,entry.priority);else node.style.removeProperty(key);
    }
    for(const [key,entry]of record.attributes)if(node.getAttribute(key)===entry.last){if(entry.value===null)node.removeAttribute(key);else node.setAttribute(key,entry.value);}
    if(!record.hadClass)node.classList.remove('tsui-legacy-surface');
  }
  function releaseRoots(){for(const [node,record]of roots)restore(node,record);roots.clear();}
  function applyRoot(node,theme){
    let record=roots.get(node);if(!record){record={styles:new Map(),attributes:new Map(),hadClass:node.classList.contains('tsui-legacy-surface')};roots.set(node,record);}
    const styles=new Map(),attributes=new Map();
    const resolved=apply({style:{setProperty:(key,value)=>styles.set(key,value)},setAttribute:(key,value)=>attributes.set(key,value)},theme,win.matchMedia?.('(prefers-color-scheme: dark)').matches===true);
    attributes.set('data-tsui-owner',id);
    for(const [key,role]of Object.entries(aliases))styles.set(key,resolved.colors[role]);
    for(const [key,value]of styles){
      if(!record.styles.has(key))record.styles.set(key,{value:node.style.getPropertyValue(key),priority:node.style.getPropertyPriority(key)});
      node.style.setProperty(key,value);Object.assign(record.styles.get(key),{last:value,lastPriority:''});
    }
    for(const [key,value]of attributes){if(!record.attributes.has(key))record.attributes.set(key,{value:node.getAttribute(key)});node.setAttribute(key,value);record.attributes.get(key).last=value;}
    node.classList.add('tsui-legacy-surface');
  }
  function render(){
    frame=null;if(!active()||!ready)return;
    const found=new Set();for(const selector of selectors){let nodes;try{nodes=doc.querySelectorAll(selector);}catch(_){continue;}for(let i=0;i<nodes.length&&found.size<48;i++)found.add(nodes[i]);if(found.size>=48)break;}
    for(const [node,record]of roots)if(!found.has(node)||node.isConnected===false){restore(node,record);roots.delete(node);}
    const theme=client.get();for(const node of found)applyRoot(node,theme);
    if(found.size&&!style){style=doc.createElement('style');style.setAttribute('data-tsui-appearance-owner',id);style.textContent=css()+'\n.tsui-legacy-surface{background-color:var(--tsui-background);color:var(--tsui-text);border-color:var(--tsui-border)}';(doc.head||doc.documentElement).appendChild(style);}
    if(!observer&&selectors.length&&typeof win.MutationObserver==='function'){observer=new win.MutationObserver(schedule);observer.observe(doc.documentElement,{childList:true,subtree:true});}
  }
  function schedule(){if(!active()||!ready||frame!==null)return;frame=win.requestAnimationFrame(render);}
  function pause(){if(frame!==null)win.cancelAnimationFrame(frame);frame=null;observer?.disconnect();observer=null;}
  function activity(){if(active())schedule();else pause();}
  function pda(event){const state=event.detail;if(typeof state?.isActiveTab!=='boolean'||typeof state?.isWebViewVisible!=='boolean')return;pdaActive=state.isActiveTab&&state.isWebViewVisible;activity();}
  function route(){pause();if(active())releaseRoots();schedule();}
  function pagehide(event){if(event.persisted){suspended=true;pause();}else stop();}
  function pageshow(event){if(event.persisted){suspended=false;activity();}}
  function listen(target,name,callback){target.addEventListener(name,callback);listeners.push(()=>target.removeEventListener(name,callback));}
  async function start(){
    if(disposed)return client.get();if(started)return client.get();started=true;suspended=false;pdaActive=true;ready=false;generation++;
    listen(doc,commandEvent,receive);listen(doc,'visibilitychange',activity);listen(win,'tornpda:tabState',pda);listen(win,'hashchange',route);listen(win,'pagehide',pagehide);listen(win,'pageshow',pageshow);
    return client.start();
  }
  function stop(){started=false;generation++;client.stop();pause();releaseRoots();style?.remove();style=null;for(const remove of listeners.splice(0))remove();seen.clear();pending=0;queue=Promise.resolve();}
  function dispose(){if(disposed)return;stop();disposed=true;}
  return {start,stop,dispose,client};
}
'use strict';

// These functions are bundled into the hub's private userscript scope.
const hubFormTypes = new Set(['text', 'textarea', 'number', 'integer', 'password', 'secret', 'checkbox', 'toggle', 'select', 'radio', 'range', 'color', 'date', 'time']);
const hubFormNumeric = new Set(['number', 'integer', 'range']);
const hubFormSecret = field => field.type === 'password' || field.type === 'secret';
const hubFormBoolean = field => field.type === 'checkbox' || field.type === 'toggle';
const hubFormOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
let hubFormSequence = 0;

function normalizeHubPage(raw) {
  const fail = () => { throw new TypeError('Unsupported or invalid settings page.'); };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail();
  let serialized;
  try { serialized = JSON.stringify(raw); } catch (_) { fail(); }
  // Count UTF-8 bytes without relying on Node or an optional browser API.
  if (!serialized || serialized.length > 65536 || encodeURIComponent(serialized).replace(/%[A-F\d]{2}/g, '_').length > 65536) fail();
  const id = value => {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,79}$/.test(value) || ['__proto__', 'prototype', 'constructor'].includes(value)) fail();
    return value;
  };
  const text = (value, optional = false) => {
    if (optional && value === undefined) return '';
    if (typeof value !== 'string' || value.length > 8192) fail();
    return value;
  };
  const scalar = value => typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
  const fields = new Map();
  let count = 0;
  if (!Array.isArray(raw.sections) || raw.sections.length > 100) fail();
  const sectionIds = new Set();
  const sections = raw.sections.map(section => {
    if (!section || typeof section !== 'object' || !Array.isArray(section.fields)) fail();
    const sectionId = id(section.id);
    if (sectionIds.has(sectionId)) fail();
    sectionIds.add(sectionId);
    return { id: sectionId, title: text(section.title), fields: section.fields.map(source => {
      if (!source || typeof source !== 'object' || ++count > 100) fail();
      const fieldId = id(source.id);
      const type = source.type === 'slider' ? 'range' : source.type;
      if (fields.has(fieldId) || !hubFormTypes.has(type)) fail();
      const field = { id: fieldId, type, label: text(source.label) };
      fields.set(fieldId, field);
      if (source.description !== undefined) field.description = text(source.description);
      if (source.unit !== undefined) field.unit = text(source.unit);
      for (const key of ['required', 'readOnly']) {
        if (source[key] !== undefined) {
          if (typeof source[key] !== 'boolean') fail();
          field[key] = source[key];
        }
      }
      for (const key of ['min', 'max', 'step', 'minLength', 'maxLength']) {
        if (source[key] === undefined) continue;
        if (typeof source[key] !== 'number' || !Number.isFinite(source[key])) fail();
        if (key.endsWith('Length') && (!Number.isInteger(source[key]) || source[key] < 0 || source[key] > 32768)) fail();
        if (key === 'step' && source[key] <= 0) fail();
        field[key] = source[key];
      }
      if (field.min > field.max || field.minLength > field.maxLength) fail();
      if (source.format !== undefined) {
        if (!['email', 'url'].includes(source.format) || !['text', 'textarea'].includes(type)) fail();
        field.format = source.format;
      }
      if (type === 'select' || type === 'radio') {
        if (!Array.isArray(source.options) || !source.options.length || source.options.length > 100) fail();
        const optionIds = new Set();
        field.options = source.options.map(option => {
          const value = typeof option === 'string' ? option : option && option.value;
          if (!scalar(value) || optionIds.has(JSON.stringify(value))) fail();
          optionIds.add(JSON.stringify(value));
          return { value, label: text(typeof option === 'string' ? option : option.label) };
        });
      }
      if (source.visibleWhen !== undefined) {
        const condition = source.visibleWhen;
        if (!condition || typeof condition !== 'object' || !scalar(condition.equals)) fail();
        field.visibleWhen = { field: id(condition.field), equals: condition.equals };
      }
      if (hubFormOwn(source, 'default') && !hubFormSecret(field)) {
        if (!scalar(source.default)) fail();
        field.default = source.default;
      }
      return field;
    }) };
  });
  for (const field of fields.values()) {
    const visited = new Set([field.id]);
    let current = field;
    while (current.visibleWhen) {
      const dependency = fields.get(current.visibleWhen.field);
      if (!dependency || hubFormSecret(dependency) || visited.has(dependency.id)) fail();
      visited.add(dependency.id);
      current = dependency;
    }
    if (hubFormOwn(field, 'default') && hubFormFieldValue(field, field.default).error) fail();
  }
  if (raw.actions !== undefined && (!Array.isArray(raw.actions) || raw.actions.length > 100)) fail();
  const actionIds = new Set();
  const actions = (raw.actions || []).map(action => {
    if (!action || typeof action !== 'object') fail();
    const actionId = id(action.id);
    if (actionIds.has(actionId)) fail();
    actionIds.add(actionId);
    return { id: actionId, label: text(action.label) };
  });
  return { id: id(raw.id), title: text(raw.title), description: text(raw.description, true), sections, actions };
}

function hubFormFieldValue(field, raw) {
  const missing = raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');
  if (missing) {
    if (field.required) return { error: 'This field is required.' };
    return { value: hubFormBoolean(field) ? false : '' };
  }
  if (hubFormBoolean(field)) {
    if (typeof raw !== 'boolean') return { error: 'Choose an enabled or disabled value.' };
    if (field.required && !raw) return { error: 'This field must be enabled.' };
    return { value: raw };
  }
  if (hubFormNumeric.has(field.type)) {
    if (typeof raw !== 'number' && (typeof raw !== 'string' || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(raw.trim()))) return { error: 'Enter a number.' };
    const value = Number(raw);
    if (!Number.isFinite(value) || (field.type === 'integer' && !Number.isSafeInteger(value))) return { error: field.type === 'integer' ? 'Enter a whole number.' : 'Enter a finite number.' };
    if ((field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max)) return { error: 'Enter a number within the allowed range.' };
    if (field.step !== undefined) {
      const base = field.min || 0;
      const steps = (value - base) / field.step;
      const nearest = base + Math.round(steps) * field.step;
      // Allow operand rounding error, but never a half-step mismatch at any magnitude.
      const tolerance = Math.min(field.step * 1e-9, Number.EPSILON * 4 * Math.max(1, Math.abs(value), Math.abs(base), Math.abs(nearest)));
      if (!Number.isFinite(steps) || !Number.isFinite(nearest) || Math.abs(value - nearest) > tolerance) return { error: 'Enter a number matching the allowed step.' };
    }
    return { value };
  }
  if (field.type === 'select' || field.type === 'radio') {
    const option = field.options.find(item => item.value === raw);
    return option ? { value: option.value } : { error: 'Choose one of the available options.' };
  }
  if (typeof raw !== 'string' || raw.length > 32768) return { error: 'Enter a valid text value.' };
  if ((field.minLength !== undefined && raw.length < field.minLength) || (field.maxLength !== undefined && raw.length > field.maxLength)) return { error: 'Use the allowed text length.' };
  if (field.format === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return { error: 'Enter a valid email address.' };
  if (field.format === 'url') {
    try { const parsed = new URL(raw); if (!['https:', 'http:'].includes(parsed.protocol) || !parsed.hostname) throw new Error(); } catch (_) { return { error: 'Enter an HTTP or HTTPS URL.' }; }
  }
  if (field.type === 'color' && !/^#[0-9a-f]{6}$/i.test(raw)) return { error: 'Choose a six-digit color.' };
  if (field.type === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { error: 'Enter a valid date.' };
    const date = new Date(raw + 'T00:00:00Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== raw) return { error: 'Enter a valid date.' };
  }
  if (field.type === 'time' && !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(raw)) return { error: 'Enter a valid time.' };
  return { value: raw };
}

function hubFormValues(page, input) {
  const result = {};
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  for (const section of page.sections) for (const field of section.fields) {
    if (hubFormSecret(field)) continue;
    const value = hubFormOwn(source, field.id) ? source[field.id] : hubFormOwn(field, 'default') ? field.default : hubFormBoolean(field) ? false : '';
    result[field.id] = (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') ? value : '';
  }
  return result;
}

function hubFormVisible(field, fields, values) {
  if (!field.visibleWhen) return true;
  const dependency = fields.get(field.visibleWhen.field);
  if (!hubFormVisible(dependency, fields, values)) return false;
  const parsed = hubFormFieldValue(dependency, values[dependency.id]);
  return !parsed.error && parsed.value === field.visibleWhen.equals;
}

function validateHubSettings(page, input) {
  page = normalizeHubPage(page);
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const fields = new Map(page.sections.flatMap(section => section.fields).map(field => [field.id, field]));
  const combined = { ...hubFormValues(page, source) };
  const values = {}, errors = {}, secretPatch = {};
  for (const field of fields.values()) {
    if (field.readOnly || !hubFormVisible(field, fields, combined)) continue;
    const raw = hubFormSecret(field) ? source[field.id] : hubFormOwn(source, field.id) ? source[field.id] : combined[field.id];
    const parsed = hubFormFieldValue(field, raw);
    if (parsed.error) errors[field.id] = parsed.error;
    else if (!hubFormSecret(field)) values[field.id] = parsed.value;
    else if (parsed.value !== '') secretPatch[field.id] = parsed.value;
  }
  const checkSize = (patch, message) => {
    const serialized = JSON.stringify(patch);
    const bytes = encodeURIComponent(serialized).replace(/%[A-F\d]{2}/g, '_').length;
    if (bytes > 32768) {
      const lastField = Object.keys(patch).at(-1);
      errors[lastField] = message;
    }
  };
  checkSize(values, 'Settings exceed the 32 KiB limit. Shorten the values before saving.');
  checkSize(secretPatch, 'New secret values exceed the 32 KiB limit. Shorten them before saving.');
  return { ok: Object.keys(errors).length === 0, values, errors };
}

function renderHubForm(document, page, values, options = {}) {
  page = normalizeHubPage(page);
  const prefix = 'tsh-form-' + (++hubFormSequence) + '-';
  const fields = new Map(page.sections.flatMap(section => section.fields).map(field => [field.id, field]));
  const controls = new Map(), rows = new Map(), errors = new Map(), listeners = [];
  let destroyed = false, busy = false;
  let baseline = hubFormValues(page, values);
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    node.className = 'tsh-form-' + className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const listen = (node, event, callback) => { node.addEventListener(event, callback); listeners.push(() => node.removeEventListener(event, callback)); };
  const element = make('form', 'root');
  element.noValidate = true;
  element.append(make('h3', 'title', page.title));
  if (page.description) element.append(make('p', 'description', page.description));
  const status = make('p', 'status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.hidden = true;
  for (const section of page.sections) {
    const group = make('fieldset', 'section');
    group.append(make('legend', 'section-title', section.title));
    for (const field of section.fields) {
      const row = make(field.type === 'radio' ? 'fieldset' : 'div', 'field');
      row.dataset.field = field.id;
      const label = make(field.type === 'radio' ? 'legend' : 'label', 'label', field.label + (field.required ? ' *' : ''));
      const controlId = prefix + field.id;
      if (field.type !== 'radio') label.htmlFor = controlId;
      row.append(label);
      const helpId = controlId + '-help', errorId = controlId + '-error';
      const fieldControls = [];
      if (field.type === 'radio') {
        field.options.forEach((option, index) => {
          const optionLabel = make('label', 'option');
          const control = make('input', 'input');
          control.type = 'radio'; control.name = controlId; control.id = controlId + '-' + index; control.value = String(index);
          optionLabel.append(control, document.createTextNode(option.label)); row.append(optionLabel); fieldControls.push(control);
        });
      } else {
        const control = make(field.type === 'textarea' ? 'textarea' : field.type === 'select' ? 'select' : 'input', 'input');
        control.id = controlId;
        if (field.type === 'select') {
          const empty = document.createElement('option'); empty.value = ''; empty.textContent = 'Choose…'; control.append(empty);
          field.options.forEach((option, index) => { const node = document.createElement('option'); node.value = String(index); node.textContent = option.label; control.append(node); });
        } else if (field.type !== 'textarea') {
          control.type = hubFormSecret(field) ? 'password' : hubFormBoolean(field) ? 'checkbox' : field.type === 'integer' ? 'number' : field.type;
          if (field.type === 'toggle') control.setAttribute('role', 'switch');
        }
        if (hubFormSecret(field)) { control.autocomplete = 'new-password'; control.setAttribute('data-write-only', 'true'); }
        for (const key of ['min', 'max', 'step', 'minLength', 'maxLength']) if (field[key] !== undefined) control.setAttribute(key.toLowerCase(), String(field[key]));
        if (field.type === 'integer' && field.step === undefined) control.step = '1';
        if (field.type === 'number' && field.step === undefined) control.step = 'any';
        row.append(control); fieldControls.push(control);
      }
      if (field.unit) row.append(make('span', 'unit', field.unit));
      if (field.description) { const help = make('p', 'help', field.description); help.id = helpId; row.append(help); }
      const error = make('p', 'error'); error.id = errorId; error.hidden = true; error.setAttribute('role', 'alert'); row.append(error);
      for (const control of fieldControls) {
        control.setAttribute('aria-describedby', (field.description ? helpId + ' ' : '') + errorId);
        if (field.required) control.setAttribute('aria-required', 'true');
        if (field.readOnly) { control.readOnly = true; control.setAttribute('aria-readonly', 'true'); }
        listen(control, 'input', update); listen(control, 'change', update);
      }
      controls.set(field.id, fieldControls); rows.set(field.id, row); errors.set(field.id, error); group.append(row);
    }
    element.append(group);
  }
  element.append(status);
  const actions = make('div', 'actions');
  const buttons = [];
  const button = (text, className, callback, submit = false) => {
    const node = make('button', className, text); node.type = submit ? 'submit' : 'button';
    if (callback) listen(node, 'click', callback);
    buttons.push(node); actions.append(node); return node;
  };
  const save = button('Save', 'save', null, true);
  button('Cancel', 'cancel', () => invoke(options.onCancel));
  button('Reset defaults', 'reset', () => invoke(async () => {
    if (options.onReset && await options.onReset() === false) return;
    resetDefaults();
  }, true));
  for (const action of page.actions) button(action.label, 'action', () => invoke(() => options.onAction && options.onAction(action.id)));
  element.append(actions);

  function read(field) {
    const list = controls.get(field.id), control = list[0];
    if (field.type === 'radio') { const selected = list.find(item => item.checked); return selected ? field.options[Number(selected.value)].value : ''; }
    if (field.type === 'select') return control.value === '' ? '' : field.options[Number(control.value)].value;
    if (hubFormBoolean(field)) return control.checked;
    if (hubFormNumeric.has(field.type)) return control.validity.badInput ? NaN : control.value === '' ? '' : Number(control.value);
    return control.value;
  }
  function getValues() {
    const result = {};
    if (!destroyed) for (const field of fields.values()) if (!hubFormSecret(field)) result[field.id] = read(field);
    return result;
  }
  // Intentionally separate: callers may only route this patch through encrypted transport.
  function getSecretValues() {
    const result = {};
    if (!destroyed) {
      const current = getValues();
      for (const field of fields.values()) if (hubFormSecret(field) && !field.readOnly && hubFormVisible(field, fields, current)) {
        const value = read(field); if (value !== '') result[field.id] = value;
      }
    }
    return result;
  }
  function isDirty() { return !destroyed && (JSON.stringify(getValues()) !== JSON.stringify(baseline) || Object.keys(getSecretValues()).length > 0); }
  function write(next) {
    for (const field of fields.values()) {
      const list = controls.get(field.id), value = hubFormSecret(field) ? '' : next[field.id];
      if (field.type === 'radio') list.forEach((control, index) => { control.checked = field.options[index].value === value; });
      else if (field.type === 'select') { const index = field.options.findIndex(option => option.value === value); list[0].value = index < 0 ? '' : String(index); }
      else if (hubFormBoolean(field)) list[0].checked = value === true;
      else list[0].value = value === undefined || value === null ? '' : String(value);
    }
    // Browser color/range controls canonicalize blank and invalid initial values.
    update();
  }
  function clearErrors() { for (const [id, error] of errors) { error.hidden = true; error.textContent = ''; for (const control of controls.get(id)) control.removeAttribute('aria-invalid'); } }
  function update() {
    if (destroyed) return;
    const current = getValues();
    for (const field of fields.values()) {
      const visible = hubFormVisible(field, fields, current);
      rows.get(field.id).hidden = !visible;
      for (const control of controls.get(field.id)) {
        control.disabled = busy || !visible || (field.readOnly && (hubFormBoolean(field) || ['select', 'radio', 'range', 'color'].includes(field.type)));
        if (field.type === 'toggle') control.setAttribute('aria-checked', String(control.checked));
      }
    }
    for (const node of buttons) node.disabled = busy;
    save.disabled = busy || !isDirty();
  }
  async function invoke(callback, restoreFocus = false) {
    if (destroyed || busy || typeof callback !== 'function') return;
    const origin = restoreFocus ? document.activeElement : null;
    busy = true; update();
    try { await callback(); } catch (_) { if (!destroyed) { status.textContent = 'Unable to complete this action.'; status.hidden = false; } }
    finally {
      busy = false; update();
      // A reset confirmation removes its focused button while the form is busy.
      if (!destroyed && origin?.isConnected && document.activeElement === document.body) origin.focus({ preventScroll: true });
    }
  }
  function setValues(next, settings = {}) {
    if (destroyed || (isDirty() && !settings.force)) return false;
    baseline = hubFormValues(page, next); write(baseline); baseline = getValues(); clearErrors(); status.hidden = true; update(); return true;
  }
  function resetDefaults() {
    if (destroyed) return;
    const next = getValues();
    for (const field of fields.values()) if (!hubFormSecret(field) && !field.readOnly && hubFormOwn(field, 'default')) next[field.id] = field.default;
    write(next); clearErrors(); status.hidden = true; update();
  }
  listen(element, 'submit', event => {
    event.preventDefault();
    if (busy || destroyed) return;
    clearErrors();
    const submitted = getValues();
    const validation = validateHubSettings(page, { ...submitted, ...getSecretValues() });
    if (!validation.ok) {
      for (const [id, message] of Object.entries(validation.errors)) { const error = errors.get(id); error.textContent = message; error.hidden = false; for (const control of controls.get(id)) control.setAttribute('aria-invalid', 'true'); }
      controls.get(Object.keys(validation.errors)[0])[0].focus(); return;
    }
    if (typeof options.onSave !== 'function') return;
    invoke(async () => {
      const result = await options.onSave(validation.values);
      if (result === false || destroyed) return;
      if (result && typeof result === 'object' && result.values && typeof result.values === 'object' && !Array.isArray(result.values)) {
        write(hubFormValues(page, { ...submitted, ...result.values }));
        baseline = getValues();
      } else baseline = submitted;
      for (const field of fields.values()) if (hubFormSecret(field)) controls.get(field.id)[0].value = '';
      status.textContent = 'Settings saved.'; status.hidden = false;
    });
  });
  write(baseline); baseline = getValues(); update();
  function destroy() {
    if (destroyed) return;
    for (const field of fields.values()) if (hubFormSecret(field)) controls.get(field.id)[0].value = '';
    destroyed = true; for (const dispose of listeners.splice(0)) dispose();
    element.remove(); controls.clear(); rows.clear(); errors.clear(); fields.clear(); baseline = {}; options = {};
  }
  return { element, getValues, getSecretValues, isDirty, setValues, resetDefaults, destroy };
}
'use strict';

// Only selected manager/native APIs may hold identities, consent pins or values.
// Native PDA namespaces are durable storage, not protection against installed scripts.
function createHubCredentialStorage(env, namespace) {
  env = env || {};
  const validNamespace = typeof namespace === 'string' && /^[a-zA-Z0-9_.:-]{1,120}$/.test(namespace);
  const native = env.PDA_storage;
  const pda = !!native || !!env.flutter_inappwebview || !!env.__PDA_platformReadyPromise ||
    typeof env.PDA_getTabState === 'function' || typeof env.PDA_httpGet === 'function' ||
    env.isTornPDA === true || Object.keys(env).some(key => key.startsWith('PDA_') && env[key] != null);
  const manager = env.GM_info?.scriptHandler || env.GM?.info?.scriptHandler;
  const managerKnown = ['Tampermonkey', 'Violentmonkey', 'Greasemonkey'].includes(manager);
  let owner = null, read = null, write = null, remove = null, backend = 'none';
  if (native && ['get', 'set', 'delete'].every(name => typeof native[name] === 'function')) {
    owner = native; read = native.get; write = native.set; remove = native.delete; backend = 'pda';
  } else if (!pda && managerKnown) {
    if (['GM_getValue', 'GM_setValue', 'GM_deleteValue'].every(name => typeof env[name] === 'function')) {
      owner = env; read = env.GM_getValue; write = env.GM_setValue; remove = env.GM_deleteValue; backend = 'gm';
    } else if (env.GM && ['getValue', 'setValue', 'deleteValue'].every(name => typeof env.GM[name] === 'function')) {
      owner = env.GM; read = env.GM.getValue; write = env.GM.setValue; remove = env.GM.deleteValue; backend = 'gm';
    }
  }
  let eligible = validNamespace && backend !== 'none';
  const validKey = key => typeof key === 'string' && /^[a-zA-Z0-9_.:-]{1,150}$/.test(key);
  const prefix = namespace + ':';
  return {
    get eligible() { return eligible; },
    backend: eligible ? backend : 'none',
    async exclusive(work) {
      if (!eligible || typeof env.locks?.request !== 'function') return false;
      return env.locks.request('torn-script-hub-private:' + namespace, work);
    },
    async get(key) {
      if (!eligible || !validKey(key)) return null;
      try { const value = await read.call(owner, prefix + key, null); return value === undefined ? null : value; }
      catch (_) { eligible = false; return null; }
    },
    async set(key, value) {
      if (!eligible || !validKey(key)) return false;
      try { await write.call(owner, prefix + key, value); return true; }
      catch (_) { eligible = false; return false; }
    },
    async delete(key) {
      if (!eligible || !validKey(key)) return false;
      try { await remove.call(owner, prefix + key); return true; }
      catch (_) { eligible = false; return false; }
    }
  };
}

// No network, DOM, raw-error logging, or manager globals exist below this point.
const HUB_CREDENTIAL_TTL = 30000;
const HUB_CREDENTIAL_PROVIDERS = 20;
const HUB_CREDENTIAL_GRANTS = 200;
const HUB_CREDENTIAL_HISTORY = 256;
const HUB_CREDENTIAL_PENDING = 128;
const HUB_CREDENTIAL_KEYS = 20;
const hubCredentialLabel = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 60 && !/[\u0000-\u001f\u007f]/.test(value);
const hubCredentialClone = value => JSON.parse(JSON.stringify(value));
const hubCredentialBytes = value => new TextEncoder().encode(value);
const hubCredentialHex = value => Array.from(new Uint8Array(value), byte => byte.toString(16).padStart(2, '0')).join('');
function hubCredentialUnhex(value, maxBytes) {
  if (typeof value !== 'string' || value.length > maxBytes * 2 || value.length % 2 || !/^[a-f0-9]+$/.test(value)) throw new Error('Unavailable');
  return Uint8Array.from(value.match(/../g), byte => parseInt(byte, 16));
}
const hubCredentialId = value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,100}$/.test(value);
function hubCredentialPublic(raw) {
  if (!raw || raw.kty !== 'EC' || raw.crv !== 'P-256' || typeof raw.x !== 'string' ||
      typeof raw.y !== 'string' || !/^[a-zA-Z0-9_-]{43}$/.test(raw.x) || !/^[a-zA-Z0-9_-]{43}$/.test(raw.y) || raw.d !== undefined) throw new Error('Unavailable');
  return { kty: 'EC', crv: 'P-256', x: raw.x, y: raw.y };
}
async function hubCredentialFingerprint(crypto, raw) {
  return hubCredentialHex(await crypto.subtle.digest('SHA-256', hubCredentialBytes(JSON.stringify(hubCredentialPublic(raw)))));
}
function hubCredentialCryptoAvailable(crypto) {
  return !!crypto && typeof crypto.getRandomValues === 'function' && crypto.subtle &&
    ['generateKey', 'exportKey', 'importKey', 'deriveKey', 'digest', 'encrypt', 'decrypt'].every(name => typeof crypto.subtle[name] === 'function');
}
async function hubCredentialIdentity(crypto, stored) {
  let publicJwk, privateJwk;
  if (stored) {
    publicJwk = hubCredentialPublic(stored.publicJwk);
    privateJwk = stored.privateJwk;
    if (!privateJwk || typeof privateJwk.d !== 'string' || privateJwk.x !== publicJwk.x || privateJwk.y !== publicJwk.y) throw new Error('Unavailable');
  } else {
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
    publicJwk = hubCredentialPublic(await crypto.subtle.exportKey('jwk', pair.publicKey));
    privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  }
  const privateKey = await crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']);
  // Public import validates that the stored coordinates describe an actual point.
  await crypto.subtle.importKey('jwk', publicJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  return { privateKey, persisted: { publicJwk, privateJwk }, publicJwk, fingerprint: await hubCredentialFingerprint(crypto, publicJwk) };
}
async function hubCredentialPeerKey(crypto, privateKey, publicJwk) {
  const publicKey = await crypto.subtle.importKey('jwk', hubCredentialPublic(publicJwk), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  return crypto.subtle.deriveKey({ name: 'ECDH', public: publicKey }, privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
function hubCredentialRoute(request) {
  if (!request || request.version !== 1 || !['scriptId', 'providerId', 'instance', 'requestId'].every(name => hubCredentialId(request[name])) ||
      !Number.isSafeInteger(request.expiresAt)) throw new Error('Unavailable');
  if (request.pageId !== undefined && !hubCredentialId(request.pageId)) throw new Error('Unavailable');
  const route = { version: 1, scriptId: request.scriptId, providerId: request.providerId, instance: request.instance, requestId: request.requestId, expiresAt: request.expiresAt };
  if (request.pageId !== undefined) route.pageId = request.pageId;
  return route;
}
function hubCredentialFresh(route) {
  const now = Date.now();
  return route.expiresAt > now && route.expiresAt <= now + HUB_CREDENTIAL_TTL;
}
function hubCredentialAad(route, clientFingerprint, hubFingerprint) {
  return hubCredentialBytes(JSON.stringify({ ...route, direction: 'hub-to-client', clientFingerprint, hubFingerprint }));
}
function hubCredentialPrune(map) {
  const now = Date.now();
  for (const [key, value] of map) if (value.expiresAt <= now) map.delete(key);
}
function hubCredentialRequestKey(route) { return JSON.stringify([route.scriptId, route.instance, route.requestId]); }
function hubCredentialValidatedVaultState(stored) {
  if (!stored || stored.version !== 1 || !stored.identity || !Array.isArray(stored.providers) || !Array.isArray(stored.grants) ||
      stored.providers.length > HUB_CREDENTIAL_PROVIDERS || stored.grants.length > HUB_CREDENTIAL_GRANTS) throw new Error('Unavailable');
  const providerIds = new Set();
  for (const p of stored.providers) {
    if (!p || !hubCredentialId(p.id) || providerIds.has(p.id) || !(p.value === null || typeof p.value === 'string' && p.value.length <= 4096) ||
        !Number.isSafeInteger(p.revision) || p.revision < 0) throw new Error('Unavailable');
    providerIds.add(p.id);
    if (p.globalFallback !== undefined && typeof p.globalFallback !== 'boolean') throw new Error('Unavailable');
    if (p.keys !== undefined && (!Array.isArray(p.keys) || p.keys.length > HUB_CREDENTIAL_KEYS)) throw new Error('Unavailable');
    const ids = new Set();
    for (const key of p.keys || []) {
      if (!key || !hubCredentialId(key.id) || key.id === 'global' || ids.has(key.id) || !hubCredentialLabel(key.label) ||
          !(key.value === null || typeof key.value === 'string' && key.value.length > 0 && key.value.length <= 4096)) throw new Error('Unavailable');
      ids.add(key.id);
    }
  }
  const grantIds = new Set();
  for (const g of stored.grants) {
    if (!g || !hubCredentialId(g.scriptId) || !providerIds.has(g.providerId) || !/^[a-f0-9]{64}$/.test(g.fingerprint)) throw new Error('Unavailable');
    const key = g.scriptId + '\n' + g.providerId;
    if (grantIds.has(key)) throw new Error('Unavailable');
    grantIds.add(key);
    if (g.keyId !== undefined && !hubCredentialId(g.keyId)) throw new Error('Unavailable');
    if (g.allowed !== undefined && typeof g.allowed !== 'boolean') throw new Error('Unavailable');
  }
  return hubCredentialClone(stored);
}

function createHubCredentialVault({ storage, crypto } = {}) {
  let destroyed = false, enabled = false, identity = null, state = null, initialization = null;
  const seen = new Map();
  let queue = Promise.resolve();
  const disable = () => { enabled = false; identity = null; state = null; seen.clear(); };
  function ordered(work) {
    const result = queue.then(async () => {
      if (typeof storage?.exclusive !== 'function') return false;
      return storage.exclusive(async () => {
        if (!await ready()) return false;
        // Refresh under the same cross-tab lock as the subsequent mutation or
        // delivery. Never merge against this tab's cached permissions.
        const loaded = hubCredentialValidatedVaultState(await storage.get('vault-v1'));
        const keys = await hubCredentialIdentity(crypto, loaded.identity);
        if (destroyed || !storage.eligible) return false;
        state = loaded; identity = keys;
        return work();
      });
    }).catch(() => { disable(); return false; });
    queue = result.then(() => undefined);
    return result;
  }
  async function ready() {
    if (destroyed) return false;
    if (!initialization) initialization = (async () => {
      try {
        if (!storage?.eligible || !hubCredentialCryptoAvailable(crypto)) return false;
        const stored = await storage.get('vault-v1');
        if (!storage.eligible || destroyed) return false;
        const loaded = stored === null ? { version: 1, providers: ['torn', 'tornstats', 'ffscouter'].map(id => ({ id, value: null, revision: 0 })), grants: [] }
          : hubCredentialValidatedVaultState(stored);
        const keys = await hubCredentialIdentity(crypto, loaded.identity);
        if (destroyed) return false;
        loaded.identity = keys.persisted;
        if (!stored && !await storage.set('vault-v1', loaded)) return false;
        if (destroyed || !storage.eligible) return false;
        state = hubCredentialClone(loaded); identity = keys; enabled = true;
        return true;
      } catch (_) { disable(); return false; }
    })();
    return await initialization && !destroyed && enabled && storage.eligible;
  }
  async function save(next) {
    if (!await storage.set('vault-v1', next) || destroyed || !storage.eligible) { disable(); return false; }
    state = next;
    return true;
  }
  async function publicIdentity() {
    return await ordered(async () => await ready() ? { publicJwk: hubCredentialClone(identity.publicJwk), fingerprint: identity.fingerprint } : null) || null;
  }
  function refresh() {
    return ordered(async () => {
      if (!await ready()) return false;
      // One private backend read; never generate an identity or rewrite on resume.
      const stored = await storage.get('vault-v1');
      if (!storage.eligible || destroyed) { disable(); return false; }
      const loaded = hubCredentialValidatedVaultState(stored);
      const keys = await hubCredentialIdentity(crypto, loaded.identity);
      if (destroyed || !storage.eligible) { disable(); return false; }
      state = loaded; identity = keys;
      // Keep seen requests intact across refresh, including key/grant changes.
      return true;
    });
  }
  async function status() {
    return await ordered(async () => {
    if (!await ready()) return [];
    return state.providers.map(p => ({ id: p.id, configured: typeof p.value === 'string' && p.value.length > 0, revision: p.revision,
      globalFallback: p.globalFallback === true,
      keys: (p.keys || []).map(key => ({id:key.id,label:key.label,configured:!!key.value})),
      assignments: state.grants.filter(g=>g.providerId===p.id).map(g=>({scriptId:g.scriptId,keyId:g.keyId||'global'})),
      permissions: state.grants.filter(g => g.providerId === p.id && g.allowed!==false).map(g => ({ scriptId: g.scriptId, fingerprint: g.fingerprint, keyId:g.keyId || 'global' })) }));
    }) || [];
  }
  function editProvider(providerId, edit) {
    return ordered(async () => {
      if (!await ready() || !hubCredentialId(providerId) || providerId === 'script-settings') return false;
      const next = hubCredentialClone(state), provider = next.providers.find(p => p.id === providerId);
      if (!provider || provider.revision >= Number.MAX_SAFE_INTEGER || !edit(provider, next)) return false;
      provider.revision++;
      return save(next);
    });
  }
  async function addNamedKey(providerId, label, value) {
    if (!await ordered(() => ready()) || !hubCredentialLabel(label) || typeof value !== 'string' || !value.length || value.length > 4096) return false;
    const id = 'key-' + hubCredentialHex(crypto.getRandomValues(new Uint8Array(12)));
    return await editProvider(providerId, provider => {
      provider.keys ||= [];
      if (provider.keys.length >= HUB_CREDENTIAL_KEYS) return false;
      provider.keys.push({id,label:label.trim(),value});return true;
    }) ? id : false;
  }
  function setNamedKey(providerId, keyId, label, value) {
    if (!hubCredentialLabel(label) || !(value === undefined || typeof value === 'string' && value.length > 0 && value.length <= 4096)) return Promise.resolve(false);
    return editProvider(providerId, provider => {
      const key = provider.keys?.find(k => k.id === keyId);if (!key) return false;
      key.label = label.trim();if (value !== undefined) key.value = value;return true;
    });
  }
  function deleteNamedKey(providerId, keyId) {
    return editProvider(providerId, provider => {
      const key = provider.keys?.find(k => k.id === keyId);if (!key) return false;
      key.value = null;return true;
    });
  }
  function setGlobalFallback(providerId, value) {
    if (typeof value !== 'boolean') return Promise.resolve(false);
    return editProvider(providerId, provider => {provider.globalFallback=value;return true;});
  }
  function assignKey(scriptId, providerId, keyId) {
    if (!hubCredentialId(scriptId) || !hubCredentialId(keyId)) return Promise.resolve(false);
    return editProvider(providerId, (provider, next) => {
      const grant = next.grants.find(g => g.scriptId === scriptId && g.providerId === providerId);
      if (!grant || keyId !== 'global' && !provider.keys?.some(k => k.id === keyId)) return false;
      grant.keyId=keyId;return true;
    });
  }
  function setCredential(providerId, value) {
    return ordered(async () => {
      if (!await ready() || !hubCredentialId(providerId) || typeof value !== 'string' || !value.length || value.length > 4096) return false;
      const next = hubCredentialClone(state);
      let provider = next.providers.find(p => p.id === providerId);
      if (!provider) {
        if (next.providers.length >= HUB_CREDENTIAL_PROVIDERS) return false;
        provider = { id: providerId, value: null, revision: 0 }; next.providers.push(provider);
      }
      if (provider.revision >= Number.MAX_SAFE_INTEGER) return false;
      provider.value = value; provider.revision += 1;
      return save(next);
    });
  }
  function deleteCredential(providerId) {
    return ordered(async () => {
      if (!await ready() || !hubCredentialId(providerId)) return false;
      const next = hubCredentialClone(state), provider = next.providers.find(p => p.id === providerId);
      if (!provider || provider.revision >= Number.MAX_SAFE_INTEGER) return false;
      provider.value = null; provider.revision += 1;
      return save(next);
    });
  }
  function grant(scriptId, providerId, publicJwk) {
    return ordered(async () => {
      if (!await ready() || !hubCredentialId(scriptId) || !hubCredentialId(providerId)) return false;
      let fingerprint;
      try {
        // Reject invalid points before pinning a grant.
        await hubCredentialPeerKey(crypto, identity.privateKey, publicJwk);
        fingerprint = await hubCredentialFingerprint(crypto, publicJwk);
      } catch (_) { return false; }
      const next = hubCredentialClone(state);
      if (!next.providers.some(p => p.id === providerId)) {
        if (next.providers.length >= HUB_CREDENTIAL_PROVIDERS) return false;
        next.providers.push({ id: providerId, value: null, revision: 0 });
      }
      const existing = next.grants.find(g => g.scriptId === scriptId && g.providerId === providerId);
      if (existing) {existing.fingerprint = fingerprint;existing.allowed=true;}
      else {
        if (next.grants.length >= HUB_CREDENTIAL_GRANTS) return false;
        next.grants.push({ scriptId, providerId, fingerprint });
      }
      return save(next);
    });
  }
  function revoke(scriptId, providerId) {
    return ordered(async () => {
      if (!await ready() || !hubCredentialId(scriptId) || !hubCredentialId(providerId)) return false;
      const next = hubCredentialClone(state);
      const grant=next.grants.find(g=>g.scriptId===scriptId&&g.providerId===providerId);
      if(grant)grant.allowed=false;
      return save(next);
    });
  }
  async function encryptedResponse(request, payloadForProvider) {
    const result = await ordered(async () => {
      if (!await ready()) return { status: 'unavailable' };
      try {
        const route = hubCredentialRoute(request);
        if (!hubCredentialFresh(route)) return { status: 'denied' };
        const publicJwk = hubCredentialPublic(request.publicJwk);
        const fingerprint = await hubCredentialFingerprint(crypto, publicJwk);
        const permission = state.grants.find(g => g.scriptId === route.scriptId && g.providerId === route.providerId);
        const provider = state.providers.find(p => p.id === route.providerId);
        if (!permission || permission.allowed===false || permission.fingerprint !== fingerprint || !provider) return { status: 'denied' };
        const payload = payloadForProvider(provider, permission);
        if (typeof payload !== 'string' || !payload.length || hubCredentialBytes(payload).length > 32768) return { status: 'denied' };
        hubCredentialPrune(seen);
        const requestKey = hubCredentialRequestKey(route);
        if (seen.has(requestKey) || seen.size >= HUB_CREDENTIAL_HISTORY) return { status: 'denied' };
        seen.set(requestKey, route);
        const key = await hubCredentialPeerKey(crypto, identity.privateKey, publicJwk);
        const nonce = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: hubCredentialAad(route, fingerprint, identity.fingerprint), tagLength: 128 }, key, hubCredentialBytes(payload));
        if (destroyed || !enabled || !storage.eligible || !hubCredentialFresh(route)) return { status: 'unavailable' };
        return { ...route, status: 'ok', publicJwk: hubCredentialClone(identity.publicJwk), nonce: hubCredentialHex(nonce), ciphertext: hubCredentialHex(encrypted) };
      } catch (_) { return { status: 'denied' }; }
    });
    return result || { status: 'unavailable' };
  }
  function respond(request) {
    return encryptedResponse(request, (provider, permission) => {
      const assigned=permission.keyId || 'global';
      let keyId=assigned,value=assigned==='global'?provider.value:provider.keys?.find(k=>k.id===assigned)?.value || null;
      const fallback=!value && assigned!=='global' && provider.globalFallback===true && !!provider.value;
      if(fallback){keyId='global';value=provider.value;}
      return request.pageId==='credential-context-v2'
        ? JSON.stringify({version:2,value:value || null,keyId,fallback,managed:true}) : value;
    });
  }
  // Internal hub UI only; same consent and routing checks as credential deliveries.
  function encryptMessage(request, payloadString) { return encryptedResponse(request, () => payloadString); }
  function destroy() { destroyed = true; disable(); }
  return { ready: () => ordered(() => ready()), publicIdentity, refresh, setCredential, deleteCredential, addNamedKey, setNamedKey, deleteNamedKey, setGlobalFallback, assignKey, status, grant, revoke, respond, encryptMessage, destroy };
}

function createHubCredentialClient({ storage, crypto, scriptId } = {}) {
  let destroyed = false, enabled = false, identity = null, state = null, initialization = null;
  let queue = Promise.resolve();
  const pending = new Map();
  const disable = () => { enabled = false; identity = null; state = null; pending.clear(); };
  const storageKey = 'client-v1:' + scriptId;
  async function ready() {
    if (destroyed) return false;
    if (!initialization) initialization = (async () => {
      try {
        if (!hubCredentialId(scriptId) || !storage?.eligible || !hubCredentialCryptoAvailable(crypto)) return false;
        const stored = await storage.get(storageKey);
        if (!storage.eligible || destroyed || stored && (stored.version !== 1 || !stored.identity || !(stored.hubFingerprint === null || /^[a-f0-9]{64}$/.test(stored.hubFingerprint)) ||
          stored.managedProviders !== undefined && (!Array.isArray(stored.managedProviders) || stored.managedProviders.length > 20 || !stored.managedProviders.every(hubCredentialId)))) return false;
        const loaded = stored || { version: 1, hubFingerprint: null };
        const keys = await hubCredentialIdentity(crypto, loaded.identity);
        if (destroyed) return false;
        loaded.identity = keys.persisted;
        if (!stored && !await storage.set(storageKey, loaded)) return false;
        if (destroyed || !storage.eligible) return false;
        state = hubCredentialClone(loaded); identity = keys; enabled = true;
        return true;
      } catch (_) { disable(); return false; }
    })();
    return await initialization && !destroyed && enabled && storage.eligible;
  }
  async function publicIdentity() {
    return await ready() ? { publicJwk: hubCredentialClone(identity.publicJwk), fingerprint: identity.fingerprint } : null;
  }
  function pinHub(publicJwk, options = {}) {
    // First discovery is TOFU, not authentication of the host page. Never pin a reply.
    const result = queue.then(async () => {
      if (!await ready()) return false;
      try {
        await hubCredentialPeerKey(crypto, identity.privateKey, publicJwk);
        const fingerprint = await hubCredentialFingerprint(crypto, publicJwk);
        if (state.hubFingerprint && state.hubFingerprint !== fingerprint && options.replace !== true) return false;
        if (state.hubFingerprint === fingerprint) return true;
        const next = { ...state, hubFingerprint: fingerprint };
        if (!await storage.set(storageKey, next) || destroyed || !storage.eligible) { disable(); return false; }
        state = next; pending.clear();
        return true;
      } catch (_) { return false; }
    }).catch(() => { disable(); return false; });
    queue = result.then(() => undefined);
    return result;
  }
  async function createRequest(providerId, instance, requestId, options = {}) {
    if (!await ready()) return null;
    try {
      const route = hubCredentialRoute({ version: 1, scriptId, providerId, instance, requestId, expiresAt: Date.now() + HUB_CREDENTIAL_TTL, ...(options.pageId === undefined ? {} : { pageId: options.pageId }) });
      hubCredentialPrune(pending);
      const requestKey = hubCredentialRequestKey(route);
      if (pending.size >= HUB_CREDENTIAL_PENDING || pending.has(requestKey)) return null;
      const request = { ...route, publicJwk: hubCredentialClone(identity.publicJwk) };
      pending.set(requestKey, { ...route, encoded: JSON.stringify(request), hubFingerprint: state.hubFingerprint });
      return request;
    } catch (_) { return null; }
  }
  async function consumeReply(reply, request) {
    if (!await ready()) return null;
    try {
      const route = hubCredentialRoute(request), requestKey = hubCredentialRequestKey(route), owned = pending.get(requestKey);
      if (!owned || owned.encoded !== JSON.stringify(request) || route.scriptId !== scriptId) return null;
      // Claim synchronously before any crypto await so concurrent replay cannot win.
      pending.delete(requestKey);
      if (!state.hubFingerprint || owned.hubFingerprint !== state.hubFingerprint || !hubCredentialFresh(route) || reply?.status !== 'ok') return null;
      const replyRoute = hubCredentialRoute(reply);
      if (JSON.stringify(replyRoute) !== JSON.stringify(route)) return null;
      const hubFingerprint = await hubCredentialFingerprint(crypto, reply.publicJwk);
      if (hubFingerprint !== state.hubFingerprint) return null;
      const key = await hubCredentialPeerKey(crypto, identity.privateKey, reply.publicJwk);
      const nonce = hubCredentialUnhex(reply.nonce, 12);
      if (nonce.length !== 12) return null;
      const ciphertext = hubCredentialUnhex(reply.ciphertext, 32784);
      const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce, additionalData: hubCredentialAad(route, identity.fingerprint, hubFingerprint), tagLength: 128 }, key, ciphertext);
      if (destroyed || !enabled || !storage.eligible || !hubCredentialFresh(route) || state.hubFingerprint !== hubFingerprint) return null;
      const value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return value.length && bytes.byteLength <= 32768 ? value : null;
    } catch (_) { return null; }
  }
  function destroy() { destroyed = true; disable(); }
  function isManaged(providerId) { return state?.managedProviders?.includes(providerId) === true; }
  function rememberManaged(providerId) {
    const result=queue.then(async()=>{
      if(!await ready() || !hubCredentialId(providerId))return false;
      if(isManaged(providerId))return true;
      const managedProviders=[...(state.managedProviders || []),providerId];if(managedProviders.length>20)return false;
      const next={...state,managedProviders};
      if(!await storage.set(storageKey,next) || destroyed || !storage.eligible){disable();return false;}
      state=next;return true;
    }).catch(()=>{disable();return false;});queue=result.then(()=>undefined);return result;
  }
  return { ready, publicIdentity, pinHub, createRequest, consumeReply, isManaged, rememberManaged, destroy };
}
// Capture granted APIs from the userscript scope; managers need not put them on
// page window/globalThis. Only advertise native capabilities that actually exist.
function getHubPlatformEnvironment() {
  const env={crypto:globalThis.crypto,locks:globalThis.navigator?.locks};
  if(typeof GM_info!=='undefined')env.GM_info=GM_info;
  if(typeof GM_getValue==='function')env.GM_getValue=GM_getValue;
  if(typeof GM_setValue==='function')env.GM_setValue=GM_setValue;
  if(typeof GM_deleteValue==='function')env.GM_deleteValue=GM_deleteValue;
  if(typeof GM!=='undefined')env.GM=GM;
  for(const name of ['PDA_storage','flutter_inappwebview','__PDA_platformReadyPromise','PDA_getTabState','PDA_httpGet','__tornpda'])if(globalThis[name])env[name]=globalThis[name];
  // PDA binds this native store inside the script's private outer closure.
  // Prefer that namespace over any unrelated page-global value.
  if(typeof PDA_storage!=='undefined'&&PDA_storage)env.PDA_storage=PDA_storage;
  return env;
}
// Script-owned harmless settings: no duplicate store, arbitrary actions or keys.
function createHubScriptSettings(pages, readValues, applyValues, credentialClient, onSharedCredentialChange, saveSecrets) {
  const schemas=new Map(pages.map(page=>{const schema=normalizeHubPage(page);return[schema.id,schema];}));
  const snapshots=new Map();
  const writes=new Map();
  function schema(id){const page=schemas.get(id);if(!page)throw new Error('Unsupported settings page.');return page;}
  async function readSettings(id){
    schema(id);const values=await readValues(id);const serialized=JSON.stringify(values);
    const prior=snapshots.get(id), revision=prior?.serialized===serialized?prior.revision:(prior?.revision||0)+1;
    snapshots.set(id,{serialized,revision});return{values,revision:'settings-'+revision};
  }
  return {
    describePage:id=>schema(id),readSettings,
    saveSettings(id,patch,revision){
      const write=(writes.get(id)||Promise.resolve()).catch(()=>{}).then(async()=>{
      const current=await readSettings(id);if(current.revision!==revision)throw new Error('Settings changed.');
      const page=schema(id), allowed=page.sections.flatMap(section=>section.fields).filter(field=>!field.readOnly&&!['secret','password'].includes(field.type));
      if(Object.keys(patch).some(id=>!allowed.some(field=>field.id===id)))throw new Error('Unsupported setting.');
      const result=validateHubSettings(page,{...current.values,...patch});if(!result.ok)throw new Error('Invalid setting.');
      await applyValues(id,result.values);return readSettings(id);
      });
      writes.set(id,write);write.finally(()=>{if(writes.get(id)===write)writes.delete(id);}).catch(()=>{});return write;
    },
    credentialClient,onSharedCredentialChange,
    ...(saveSecrets?{saveSecrets}:{}),
  };
}
// Bundled into each participating script; callbacks stay in that script's scope.
function registerTornScriptMenu(doc, win, metadata, callbacks, features = {}) {
  const prefix = 'torn-script-hub:v1:';
  const instance = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID() : 'menu-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  let attached = false, disposed = false;
  const seen = new Set();
  const requests = new Map();
  const preparedSecrets = new Map();
  const credentialContexts = new Map();
  let changeTimer = null;
  let credentialIdentity = null;
  let pairedHub = null;
  let pdaActive = true, active = doc.visibilityState !== 'hidden', drainingChanges = false, activityGeneration = 0;
  const providerRevisions = new Map(), changedProviders = new Map();
  const sharedProviders = [...new Set((Array.isArray(features.sharedProviders) ? features.sharedProviders : ['torn']).filter(value => typeof value === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(value)))].slice(0,20);
  function usable() { return attached && !disposed && active && doc.visibilityState !== 'hidden'; }
  function hook(name) {
    try { const result = features[name]?.(); if(result && typeof result.then==='function')result.catch(()=>{}); } catch (_) {}
  }
  function send(name, value) {
    try { doc.dispatchEvent(new CustomEvent(prefix + name, { detail: JSON.stringify(value) })); } catch (_) {}
  }
  function announce() { send('register', { ...metadata, credentialScope:features.credentialScope==='script'?'script':'main', credentialProviders:features.credentialClient?sharedProviders:[], capabilities:[...new Set([...(metadata.capabilities||[]),...(features.credentialContext?['hub-keys-v2']:[])])], instance, ...(credentialIdentity ? {credentialIdentity} : {}) }); }
  const safeId = value => typeof value === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(value);
  const safeField = value => typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,79}$/.test(value)&&!['__proto__','constructor','prototype'].includes(value);
  function decode(event, limit = 65536) {
    try { return typeof event.detail === 'string' && event.detail.length <= limit ? JSON.parse(event.detail) : null; } catch (_) { return null; }
  }
  function publicSchema(schema) {
    if(typeof normalizeHubPage==='function')return normalizeHubPage(schema);
    const value={id:schema.id,title:schema.title,description:schema.description||'',sections:[],actions:[]};
    for(const section of schema.sections||[]){
      const fields=[];
      for(const source of section.fields||[]){
        const field={};for(const key of ['id','type','label','description','required','readOnly','min','max','step','minLength','maxLength','options','visibleWhen','format','unit'])if(source[key]!==undefined)field[key]=source[key];
        if(!['password','secret'].includes(source.type)&&source.default!==undefined)field.default=source.default;fields.push(field);
      }
      value.sections.push({id:section.id,title:section.title,fields});
    }
    value.actions=(schema.actions||[]).map(action=>({id:action.id,label:action.label}));
    for (const section of value.sections || []) for (const field of section.fields || []) {
      if (['password','secret'].includes(field.type)) { delete field.default; delete field.value; }
    }
    return value;
  }
  function publicValues(schema, state) {
    const values = {};
    for (const section of schema.sections || []) for (const field of section.fields || []) {
      if (['password','secret'].includes(field.type) || !safeField(field.id)) continue;
      const value = state?.values?.[field.id];
      if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) || (typeof value === 'string' && value.length <= 32768)) values[field.id] = value;
    }
    if(encodeURIComponent(JSON.stringify(values)).replace(/%[A-F\d]{2}/g,'_').length>32768)throw new Error('Settings exceed transport limit.');
    return {values,revision:typeof state?.revision === 'string' ? state.revision.slice(0,128) : ''};
  }
  async function rpc(event) {
    const command = decode(event, 49152);
    if (!command || command.id !== metadata.id || command.instance !== instance || !safeId(command.request)
        || !metadata.pages?.some(page => page.id === command.page) || !['describe','read','save','prepare-secret'].includes(command.method)
        || typeof features.describePage !== 'function' || typeof features.readSettings !== 'function' || !usable()) return;
    const key = 'rpc-' + command.request;
    if (seen.has(key)) return;
    seen.add(key); if (seen.size > 30) seen.delete(seen.values().next().value);
    const reply = (status, data) => {
      if (!attached || disposed) return;
      const output = {id:metadata.id,instance,request:command.request,page:command.page,status,...(data ? {data} : {})};
      if (JSON.stringify(output).length <= 98304) send('rpc-result', output);
      else send('rpc-result', {id:metadata.id,instance,request:command.request,page:command.page,status:'error'});
    };
    try {
      const schema = publicSchema(await features.describePage(command.page));
      if (command.method === 'describe') { reply('ok', schema); return; }
      if(command.method==='prepare-secret'){
        if(!features.credentialClient||typeof features.saveSecrets!=='function'||preparedSecrets.size>=10){reply('error');return;}
        const request=await features.credentialClient.createRequest('script-settings',instance,'secret-'+command.request,{pageId:command.page});
        if(!request||!usable()){reply('error');return;}
        const timer=setTimeout(()=>preparedSecrets.delete(request.requestId),30000);
        preparedSecrets.set(request.requestId,{request,timer});reply('ok',request);return;
      }
      const current = publicValues(schema, await features.readSettings(command.page));
      if (command.method === 'read') { reply('ok', current); return; }
      if (typeof features.saveSettings !== 'function' || !command.values || typeof command.values !== 'object' || Array.isArray(command.values)) { reply('error'); return; }
      const fields = (schema.sections || []).flatMap(section => section.fields || []).filter(field => !['password','secret'].includes(field.type) && !field.readOnly);
      if (Object.keys(command.values).some(id => !fields.some(field => field.id === id))) { reply('error'); return; }
      if(encodeURIComponent(JSON.stringify(command.values)).replace(/%[A-F\d]{2}/g,'_').length>32768){reply('error');return;}
      if (command.revision !== current.revision) { reply('conflict'); return; }
      const result = await features.saveSettings(command.page, command.values, command.revision);
      reply('ok', publicValues(schema, result || await features.readSettings(command.page)));
    } catch (_) { reply('error'); }
  }
  async function onCredentialInfo(event) {
    const info = decode(event, 8192);
    if (!info?.identity?.publicJwk || !features.credentialClient || !usable()) return;
    const token=activityGeneration;
    try {
      if (!await features.credentialClient.pinHub(info.identity.publicJwk)) return;
      const identity=await features.credentialClient.publicIdentity();
      if(!usable()||token!==activityGeneration)return;
      if(identity&&credentialIdentity?.fingerprint!==identity.fingerprint){credentialIdentity=identity;announce();}
      const peer=JSON.stringify([info.identity.publicJwk.x,info.identity.publicJwk.y]);
      const initial=pairedHub!==peer;pairedHub=peer;
      const providers=Array.isArray(info.providers)?info.providers.slice(0,20):[];
      for(const providerId of sharedProviders){
        const record=providers.find(item=>item?.id===providerId&&Number.isSafeInteger(item.revision)&&item.revision>=0&&typeof item.configured==='boolean');
        const revision=record?JSON.stringify([record.revision,record.configured]):null;
        if(initial||(revision!==null&&providerRevisions.get(providerId)!==revision))queueCredentialChange(providerId);
        if(revision!==null)providerRevisions.set(providerId,revision);
      }
    } catch (_) {}
  }
  async function onCredentialReply(event) {
    const reply = decode(event, 131072);
    if (!reply || reply.scriptId !== metadata.id || reply.instance !== instance || !usable()) return;
    const item = requests.get(reply.requestId);
    if (!item) return;
    requests.delete(reply.requestId); clearTimeout(item.timer);
    try{
      let value=await features.credentialClient.consumeReply(reply,item.request);
      if(item.request.pageId==='credential-context-v2' && value!==null){
        const context=JSON.parse(value);
        if(context?.version!==2||context.managed!==true||typeof context.fallback!=='boolean'||!(context.value===null||typeof context.value==='string'&&context.value.length<=4096)||
          !(context.keyId==='global'||/^key-[a-f0-9]{24}$/.test(context.keyId)))throw new Error('Unavailable');
        if(!usable())throw new Error('Unavailable');
        if(!await features.credentialClient.rememberManaged(reply.providerId)){
          send('credential-policy',{scriptId:metadata.id,instance,providerId:reply.providerId,status:'failed'});
          features.onCredentialPolicyFailure?.(reply.providerId);throw new Error('Unavailable');
        }
        if(!usable())throw new Error('Unavailable');
        features.onHubManagementChange?.(reply.providerId,true);
        send('credential-policy',{scriptId:metadata.id,instance,providerId:reply.providerId,status:'saved'});
        credentialContexts.set(reply.providerId,context);value=context.value;
        features.onCredentialContext?.(reply.providerId,{keyId:context.keyId,fallback:context.fallback});
      }else if(value===null)credentialContexts.delete(reply.providerId);
      item.resolve(usable()?value:null);
    }catch(_){credentialContexts.delete(reply.providerId);item.resolve(null);}
  }
  async function onSecretSettings(event){
    const message=decode(event,131072),request=message?.request;
    if(!request||request.scriptId!==metadata.id||request.instance!==instance||request.providerId!=='script-settings'||!usable())return;
    const item=preparedSecrets.get(request.requestId);if(!item||item.request.pageId!==request.pageId)return;
    preparedSecrets.delete(request.requestId);clearTimeout(item.timer);
    let status='error';
    try{
      const value=await features.credentialClient.consumeReply(message.envelope,item.request);
      if(value===null||!usable())return;
      const values=JSON.parse(value),schema=await features.describePage(request.pageId);
      const fields=(schema.sections||[]).flatMap(section=>section.fields||[]).filter(field=>['password','secret'].includes(field.type)&&!field.readOnly);
      if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).some(id=>{const field=fields.find(field=>field.id===id),value=values[id];return !field||typeof value!=='string'||value.length>32768||(field.minLength!==undefined&&value.length<field.minLength)||(field.maxLength!==undefined&&value.length>field.maxLength);}))throw new Error();
      if(!usable())return;
      await features.saveSecrets(request.pageId,values);status='ok';
    }catch(_){}
    if(usable())send('secret-result',{id:metadata.id,instance,page:request.pageId,request:request.requestId,status});
  }
  function queueCredentialChange(providerId){
    if(!features.credentialClient||!sharedProviders.includes(providerId))return;
    changedProviders.set(providerId,(changedProviders.get(providerId)||0)+1);
    if(!usable()||changeTimer!==null||drainingChanges)return;
    changeTimer=setTimeout(drainCredentialChanges,250);
  }
  async function drainCredentialChanges(){
    changeTimer=null;if(!usable()||drainingChanges)return;
    drainingChanges=true;const token=activityGeneration;
    try{
      const providers=[...changedProviders.keys()];changedProviders.clear();
      for(const providerId of providers){
        if(!usable()||token!==activityGeneration)break;
        const value=await requestSharedCredential(providerId);
        if(usable()&&token===activityGeneration&&!changedProviders.has(providerId)&&typeof features.onSharedCredentialChange==='function')try{features.onSharedCredentialChange(providerId,value);}catch(_){}
      }
    }finally{drainingChanges=false;if(usable()&&changedProviders.size&&changeTimer===null)changeTimer=setTimeout(drainCredentialChanges,250);}
  }
  function onCredentialChanged(event){
    const change=decode(event,1024);
    if(!features.credentialClient||typeof features.onSharedCredentialChange!=='function'||!change||!safeId(change.providerId)||(change.scriptId&&change.scriptId!==metadata.id))return;
    queueCredentialChange(change.providerId);
  }
  async function requestSharedCredential(providerId) {
    if (!usable() || !features.credentialClient || !sharedProviders.includes(providerId) || requests.size >= 10) return null;
    const requestId = 'key-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    try {
      const request = await features.credentialClient.createRequest(providerId,instance,requestId,features.credentialContext?{pageId:'credential-context-v2'}:{});
      if (!request || !usable()) return null;
      return await new Promise(resolve => {
        const timer = setTimeout(() => {requests.delete(requestId);resolve(null);},2000);
        requests.set(requestId,{resolve,timer,request}); send('credential-request',request);
      });
    } catch (_) { return null; }
  }
  function clearCredentialWork(){
    for(const item of requests.values()){clearTimeout(item.timer);item.resolve(null);}requests.clear();
    for(const item of preparedSecrets.values())clearTimeout(item.timer);preparedSecrets.clear();
    clearTimeout(changeTimer);changeTimer=null;
  }
  function updateActivity(){
    const next=doc.visibilityState!=='hidden'&&pdaActive;
    if(next===active)return;active=next;activityGeneration++;
    if(!active)clearCredentialWork();
    else if(attached){providerRevisions.clear();for(const providerId of sharedProviders)changedProviders.set(providerId,1);send('credential-discover',{});}
  }
  function onPdaActivity(event){const info=event.detail;pdaActive=info?.isActiveTab===true&&info?.isWebViewVisible===true;updateActivity();}
  function takeover(event) {
    try {
      if (typeof event.detail !== 'string' || event.detail.length > 16000) return;
      const next = JSON.parse(event.detail);
      if (next?.id === metadata.id && typeof next.instance === 'string' && next.instance !== instance) dispose();
    } catch (_) {}
  }
  function activate(event) {
    let command;
    try {
      if (typeof event.detail !== 'string' || event.detail.length > 1024) return;
      command = JSON.parse(event.detail);
    } catch (_) { return; }
    if (!command || command.id !== metadata.id || command.instance !== instance || typeof command.action !== 'string'
        || !Object.prototype.hasOwnProperty.call(callbacks, command.action)
        || !metadata.actions.some(action => action.id === command.action)
        || typeof command.request !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(command.request)) return;
    if (seen.has(command.request)) return;
    seen.add(command.request);
    if (seen.size > 30) seen.delete(seen.values().next().value);
    const report = status => send('result', { id: metadata.id, action: command.action, request: command.request, instance, status });
    const statusFor = value => value === false ? 'not-ready' : value === 'navigate' ? 'navigate' : 'opened';
    try {
      const result = callbacks[command.action]();
      if (result && typeof result.then === 'function') result.then(value => report(statusFor(value)), () => report('error'));
      else report(statusFor(result));
    } catch (_) { report('error'); }
  }
  function detach() {
    if (!attached) return;
    attached = false;
    activityGeneration++;
    doc.removeEventListener(prefix + 'discover', announce);
    doc.removeEventListener(prefix + 'activate', activate);
    doc.removeEventListener(prefix + 'register', takeover);
    doc.removeEventListener(prefix + 'rpc', rpc);
    doc.removeEventListener(prefix + 'credential-info', onCredentialInfo);
    doc.removeEventListener(prefix + 'credential-reply', onCredentialReply);
    doc.removeEventListener(prefix + 'credential-changed',onCredentialChanged);
    doc.removeEventListener(prefix + 'secret-settings',onSecretSettings);
    credentialContexts.clear();
    clearCredentialWork();
    send('unregister', { id: metadata.id, instance });
    hook('onDetach');
  }
  function attach() {
    if (attached || disposed) return;
    attached = true;
    active=doc.visibilityState!=='hidden'&&pdaActive;
    doc.addEventListener(prefix + 'discover', announce);
    doc.addEventListener(prefix + 'activate', activate);
    doc.addEventListener(prefix + 'register', takeover);
    if (metadata.pages?.length) doc.addEventListener(prefix + 'rpc', rpc);
    if (features.credentialClient) {
      doc.addEventListener(prefix + 'credential-info', onCredentialInfo);
      doc.addEventListener(prefix + 'credential-reply', onCredentialReply);
      doc.addEventListener(prefix + 'credential-changed',onCredentialChanged);
      if(typeof features.saveSecrets==='function')doc.addEventListener(prefix + 'secret-settings',onSecretSettings);
    }
    announce();
    hook('onAttach');
    if(features.credentialClient&&usable()){providerRevisions.clear();send('credential-discover',{});}
  }
  win.addEventListener('pagehide', detach);
  win.addEventListener('pageshow', attach);
  doc.addEventListener('visibilitychange',updateActivity);
  win.addEventListener('tornpda:tabState',onPdaActivity);
  if(typeof win.PDA_getTabState==='function')Promise.resolve().then(()=>win.PDA_getTabState()).then(info=>{if(!disposed)onPdaActivity({detail:info});}).catch(()=>{});
  function dispose() {
    if(disposed)return;
    disposed = true;
    detach();
    win.removeEventListener('pagehide', detach);
    win.removeEventListener('pageshow', attach);
    doc.removeEventListener('visibilitychange',updateActivity);
    win.removeEventListener('tornpda:tabState',onPdaActivity);
    seen.clear();
    features.credentialClient?.destroy();
    changedProviders.clear();providerRevisions.clear();hook('onDispose');
  }
  attach();
  dispose.requestSharedCredential = requestSharedCredential;
  dispose.instance = instance;
  if (features.credentialClient) {
    Promise.resolve().then(() => features.credentialClient.ready()).then(async ready => {
      if(disposed)return;
      features.onCredentialPolicyReady?.(ready,providerId=>features.credentialClient.isManaged?.(providerId)===true);
      if (!ready || !usable()) return;
      credentialIdentity = await features.credentialClient.publicIdentity();
      if (usable() && credentialIdentity) {announce();send('credential-discover',{});}
    }).catch(() => {});
  }
  return dispose;
}
function hubReveal(selector) {
  const root = document.querySelector(selector); if (!root) return false;
  root.hidden = false; root.scrollIntoView({ behavior: 'smooth', block: 'center' });
  root.querySelector('button, [tabindex="0"], input:not([type="password"])')?.focus({ preventScroll: true });
  return true;
}
function hubOpenOc(tab) {
      if (!document.getElementById('ocm-root')) return 'navigate';
      const button = document.querySelector('#ocm-tabs [data-tab="' + tab + '"]');
      if (!button) return false;
      button.click(); return hubReveal('#ocm-root');
    }

const hubSettingsPages = [{"id":"preferences","title":"Display and refresh","sections":[{"id":"display","title":"Display","fields":[{"id":"theme","type":"select","label":"Theme","options":[{"value":"default","label":"Default"}],"default":"default"},{"id":"cprWarn","type":"number","label":"CPR warning threshold","min":0,"max":100,"step":1,"unit":"%","default":70,"required":true},{"id":"cprCrit","type":"number","label":"CPR critical threshold","min":0,"max":100,"step":1,"unit":"%","default":60,"required":true},{"id":"refreshSeconds","type":"integer","label":"Refresh interval","min":30,"max":3600,"step":1,"unit":"seconds","default":60,"required":true}]}],"actions":[{"id":"settings","label":"Open original full settings"}]},{"id":"connection","title":"API connection","description":"Use your personal key as fallback, or approve this script in API Keys for an optional shared Torn key.","sections":[{"id":"connection","title":"Connection","fields":[{"id":"personalKeyPresent","type":"checkbox","label":"Personal fallback key configured","readOnly":true},{"id":"sharedKeyPresent","type":"checkbox","label":"Shared key available","readOnly":true},{"id":"personalApiKey","type":"secret","label":"Replace personal fallback key","description":"Write-only. Saved in this script\u2019s existing key setting; shared keys are never copied here.","minLength":16,"maxLength":16}]}],"actions":[{"id":"settings","label":"Open original full settings"}]}];
hubSettingsPages[0].sections[0].fields[0].options = Object.entries(THEMES).map(([value, theme]) => ({value, label: theme.label || value}));
function hubBindingRootReady() { return !!document.getElementById('ocm-root'); }
function hubBindingRefresh(key) {
  if (!key) { clearInterval(window._ocmRefresh); return; }
  if (_ocmLoadInFlight) hubBindingPending = true;
  else loadData(key);
  scheduleRefresh(key);
}
function hubReadSettings(page) {
  if (page === 'connection') return {personalKeyPresent: !!GM_getValue(GMK.API_KEY, ''), sharedKeyPresent: !!hubSharedTornKey};
  return {theme: GM_getValue(GMK.THEME, 'default'), cprWarn: CPR_WARN, cprCrit: CPR_CRIT, refreshSeconds: REFRESH_S};
}
function hubApplySettings(page, values) {
  if (page === 'connection') return;
  if (values.cprCrit > values.cprWarn) throw new Error('Critical threshold must not exceed the warning threshold.');
  const changed = CPR_WARN !== values.cprWarn || CPR_CRIT !== values.cprCrit || REFRESH_S !== values.refreshSeconds;
  saveConfig(values.cprWarn, values.cprCrit, WEIGHT_HIGH, WEIGHT_MID, values.refreshSeconds, MIN_PER_DIFF);
  GM_setValue(GMK.THEME, values.theme); applyTheme(values.theme);
  for (const [id, value] of [['ocm-theme-select',values.theme],['ocm-cfg-cpr-warn',values.cprWarn],['ocm-cfg-cpr-crit',values.cprCrit],['ocm-cfg-refresh',values.refreshSeconds]]) {
    const input = document.getElementById(id); if (input) input.value = String(value);
  }
  if (changed) hubBindingQueueRefresh();
}
async function hubSavePersonalSecrets(page, patch) {
  if (page !== 'connection' || !patch || Object.keys(patch).some(key => key !== 'personalApiKey') ||
      typeof patch.personalApiKey !== 'string' || !/^[a-zA-Z0-9]{16}$/.test(patch.personalApiKey)) throw new Error('Invalid personal key.');
  const before = hubEffectiveTornKey();
  GM_setValue(GMK.API_KEY, patch.personalApiKey);
  const input = document.getElementById('ocm-api-input'); if (input) input.value = '••••••••••••••••';
  if (before !== hubEffectiveTornKey()) hubBindingQueueRefresh();
}
const hubPrivateCredentialClient = createHubCredentialClient({storage: createHubCredentialStorage(getHubPlatformEnvironment(), 'oc-suite-hub-client-v1'), crypto: globalThis.crypto, scriptId: 'oc-suite'});
const hubSettingsFeatures = createHubScriptSettings(hubSettingsPages, hubReadSettings, hubApplySettings, hubPrivateCredentialClient, undefined, hubSavePersonalSecrets);

let hubBindingAttached = false, hubBindingPending = false, hubBindingTimer = null, hubBindingPdaActive = true;
function hubBindingAwake() {
  return document.visibilityState !== 'hidden' && hubBindingPdaActive && hubBindingRootReady();
}
function hubBindingQueueRefresh() {
  hubBindingPending = true;
  if (!hubBindingAttached || !hubBindingAwake() || hubBindingTimer !== null) return;
  hubBindingTimer = setTimeout(() => {
    hubBindingTimer = null;
    if (!hubBindingAttached || !hubBindingAwake() || !hubBindingPending) return;
    hubBindingPending = false;
    const key = hubEffectiveTornKey();
    hubBindingRefresh(key);
  }, 250);
}
function hubBindingVisibility() { if (hubBindingPending) hubBindingQueueRefresh(); }
function hubBindingTabState(event) {
  const info = event.detail;
  hubBindingPdaActive = info?.isActiveTab === true && info?.isWebViewVisible === true;
  if (!hubBindingPdaActive) { clearTimeout(hubBindingTimer); hubBindingTimer = null; }
  else hubBindingVisibility();
}
function hubBindingCredentialChanged(provider, value) {
  if (provider !== 'torn') return;
  const before = hubEffectiveTornKey();
  hubStoreSharedTornKey(value);
  if (before !== hubEffectiveTornKey()) hubBindingQueueRefresh();
}
Object.assign(hubSettingsFeatures, {
  sharedProviders: ['torn'],
  onSharedCredentialChange: hubBindingCredentialChanged,
  onAttach() {
    if (hubBindingAttached) return;
    hubBindingAttached = true;
    document.addEventListener('visibilitychange', hubBindingVisibility);
    window.addEventListener('tornpda:tabState', hubBindingTabState);
    if (typeof globalThis.PDA_getTabState === 'function') {
      hubBindingPdaActive = false;
      Promise.resolve().then(() => globalThis.PDA_getTabState()).then(info => {
        if (hubBindingAttached) hubBindingTabState({detail: info});
      }).catch(() => {});
    }
    hubBindingVisibility();
  },
  onDetach() {
    hubBindingAttached = false;
    document.removeEventListener('visibilitychange', hubBindingVisibility);
    window.removeEventListener('tornpda:tabState', hubBindingTabState);
    clearTimeout(hubBindingTimer); hubBindingTimer = null;
    hubStoreSharedTornKey(null);
  },
  onDispose() { hubSettingsFeatures.onDetach(); hubBindingPending = false; },
});
const hubMenuAdapter = registerTornScriptMenu(document, window, {
  "id": "oc-suite",
  "name": "OC Suite",
  "icon": "oc",
  "version": "3.37.0-codex17",
  "url": "https://www.torn.com/factions.php?step=your&type=1#/tab=crimes",
  "actions": [
    {
      "id": "open",
      "label": "Open OC Suite"
    },
    {
      "id": "crimes",
      "label": "Organized crimes"
    },
    {
      "id": "people",
      "label": "People and CPR"
    },
    {
      "id": "finance",
      "label": "OC finances"
    },
    {
      "id": "loans",
      "label": "OC item loans"
    },
    {
      "id": "armoury",
      "label": "Armoury"
    },
    {
      "id": "settings",
      "label": "Settings"
    }
  ],
  "pages": [
    {
      "id": "preferences",
      "title": "Display and refresh"
    },
    {
      "id": "connection",
      "title": "API connection"
    }
  ],
  "capabilities": [
    "settings",
    "credentials",
    "secret-settings",
    "appearance"
  ],
  "category": "Faction"
}, {
  "open": () => { return hubOpenOc('home'); },
  "crimes": () => { return hubOpenOc('crimes'); },
  "people": () => { return hubOpenOc('people'); },
  "finance": () => { return hubOpenOc('money'); },
  "loans": () => { ARM.state.view = 'loans'; return hubOpenOc('armoury'); },
  "armoury": () => { return hubOpenOc('armoury'); },
  "settings": () => { const panel = document.getElementById('ocm-config-panel'); if (!panel) return 'navigate'; panel.style.display = 'block'; return hubReveal('#ocm-config-panel'); }
}, hubSettingsFeatures);

const hubAppearanceKey="torn-script-hub:ui-override:v1:oc-suite";
const hubAppearance=createScriptUiAppearanceAdapter({doc:document,win:window,id:"oc-suite",selectors:["#ocm-root","#ocm-sidebar-widget"],getInstance:()=>hubMenuAdapter.instance,
read:()=>typeof GM_getValue==='function'?GM_getValue(hubAppearanceKey,null):typeof GM!=='undefined'&&typeof GM.getValue==='function'?GM.getValue(hubAppearanceKey,null):JSON.parse(localStorage.getItem(hubAppearanceKey)||'null'),
write:value=>{if(typeof GM_setValue==='function')return GM_setValue(hubAppearanceKey,value);if(typeof GM!=='undefined'&&typeof GM.setValue==='function')return GM.setValue(hubAppearanceKey,value);localStorage.setItem(hubAppearanceKey,JSON.stringify(value));}});
hubAppearance.start().catch(()=>{});
// SCRIPT HUB ADAPTER END
})();
