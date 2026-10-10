# Torn Faction Suite — project context

A single-file Tampermonkey userscript for Torn City faction management. Started as an
Organised Crimes (OC 2.0) manager; v4.x grew it into a full suite: war & chain
analytics, live chain watcher, War Room, war payouts, member activity, revives, and
armoury tracking. v5.0 absorbed the standalone "Torn War Tools" war-page command
center and added faction funds ingestion. v5.3 redesigned the shell: a navigation
rail and a Dashboard landing view. Author: iSatomi (3580191), faction leader.
Currently **v5.3.0**, ~17,800 lines.

The whole thing ships as ONE file: `Torn_OC_Suite.user.js`. It is not bundled, not
transpiled, and has no build step. Edit it directly.

---

## How to work on this

```bash
npm install          # jsdom only
npm test             # runs all 19 suites — do this after EVERY change
node --check Torn_OC_Suite.user.js
npm run render       # visual QA: injects the real UI into fixtures/torn_base.html
                     # (needs harness_out.json — npm test produces it)
```

**`npm run render` has a blind spot — do not treat it as coverage.** Its harness
(`tests/harness.js`) stubs `querySelector()` to return `null`, so any renderer that
starts `const t = el.querySelector('#x'); if (!t) return;` silently early-returns.
**Every table body painted by JS wiring is therefore absent from its output** — you
get the static `<thead>` above an empty `<tbody>`, which looks correct unless you
count rows. Discovered 2026-07-18: the Performance roster had never been exercised
by it at all. For anything painted after the initial `innerHTML` (sortable tables,
filter results, expand/collapse rows, event wiring), write a real jsdom suite —
`tests/test_roster.js` and `tests/test_shell.js` are the pattern: eval the module
body with a `global.__ocm = {...}` export shim appended, then drive real DOM.

On the author's Windows machine Node is portable, not on PATH:
`$env:Path = "$env:USERPROFILE\tools\node-v24.18.0-win-x64;$env:Path"`.

**Always bump `@version` in the metadata block.** Tampermonkey and TornPDA only detect
an update when the version string changes. A fix with no version bump does not reach
the user's browser.

---

## Hard-won lessons — please read before "improving" anything

These are all real bugs that shipped or nearly shipped in this codebase. They are the
reason the test suites exist.

### `node --check` is nearly worthless here
It only proves the file parses. It happily passes:
- **A whole function deleted.** A bad slice removed `renderFinanceSection()` entirely.
  Syntax was still valid; the Money tab would have been silently blank.
- **Temporal dead zone.** `const splitOf` was used ~700 lines above its definition.
  Parses fine, throws `ReferenceError` at runtime, blanks the entire tab.
- **Duplicate CSS rules.** New styles were being silently overridden by old definitions
  further down the stylesheet. The redesign only worked *by luck of source order*.

So: after any structural edit, verify what **survived**, not just that it parses.
- Do the functions you expect still exist? (`grep -c "function renderFinanceSection"`)
- Is every `const` defined before its first use *within the same scope*?
- Are there duplicate CSS selectors? (the last one wins)

### Never edit this file with PowerShell `Get-Content` / `Set-Content`
Windows PowerShell 5.1 corrupts the source in three ways at once, and **all three
pass `node --check`**:

- `Get-Content` on a BOM-less file assumes **ANSI**, not UTF-8 — so `×` (`C3 97`)
  is read as `Ã—` and written back as mojibake. This is how `"Primary ×2"` became
  `"Primary Ã—2"` and broke the loadout suite.
- `Set-Content -Encoding utf8` **adds a BOM** (PS 5.1 has no `utf8NoBOM`).
- `Set-Content` rewrites every line ending **LF → CRLF**, which breaks the tests'
  `grab()` regexes — they anchor on `\}\n`, and `}\r\n` doesn't match.

Use the Edit tool, or if you must script it:
```powershell
$u8 = New-Object System.Text.UTF8Encoding($false)      # $false = no BOM
$txt = [System.IO.File]::ReadAllText($p, $u8)
[System.IO.File]::WriteAllText($p, $txt, $u8)          # keeps LF, keeps UTF-8
```
After any scripted edit, assert `([regex]::Matches($txt,'Ã')).Count -eq 0` and that
the CRLF count is still 0.

### Deleting a function: census before and after
`node --check` will not tell you that you removed two functions instead of one.
Before a large deletion, record every `^  (async )?function NAME`; after, diff the
lists and confirm the removed set is exactly what you intended. v5.2 deleted
`renderReferenceSection` (1022 lines) this way; a bad slice destroyed
`renderFinanceSection` once before.

### Never regex over HTML
It has caused a destructive bug twice:
1. Slicing on string indices deleted `renderFinanceSection` and a chunk of surrounding code.
2. A regex meant to swap `#ocm-root` greedily ate Torn's entire crimes list.

Use jsdom. After any DOM manipulation, assert that **Torn's own markup survived**
(e.g. `document.querySelectorAll('[data-oc-id]').length` is unchanged).

### Class hashes change on every Torn deploy
Torn's DOM uses CSS-module hashes: `joinButton___abc12`, `title___xyz89`. **These change
whenever Torn deploys.** Never anchor on them.

Anchor on:
- `[data-oc-id]` — the stable OC card hook
- visible text (e.g. a button whose `textContent` is exactly `Join`)
- Torn duplicates role names as `Robber #2` — match exact first, then base name

### Torn re-renders its own DOM over AJAX
After a Give / Loan / Retrieve on the armory page, Torn replaces the whole item list.
Anything injected into it is wiped. The armory column annotator uses a MutationObserver
and is idempotent; if it fails it **removes its own class** so Torn's layout is left
untouched rather than half-broken.

### The Torn API rate limit is per USER, not per key
100 calls/minute, shared with every other script the user runs. The history backfill is
deliberately paced at ~66/min. Don't "optimise" it by racing.

---

## Verified Torn API v2 facts

Learned the hard way; do not re-guess these.

- **OC payouts are native.** `crimes` API → `rewards.payout` with `{percentage, paid_at,
  paid_by}`. This is authoritative and **always wins** over any local setting — a setting
  must never rewrite what was actually paid.
- **There is no `armory` selection.** OC items (Enhancers/Tools/Materials) live under
  **`?selections=utilities`**. (`temporary` is the wrong one — that's grenades/flashbangs.)
  Returns `{ID, name, type, quantity, available, loaned, loaned_to}`.
  `available` = free-to-give stock; `loaned_to` = comma-separated holder user IDs.
- **History pagination.** The live crimes call only returns the ~100 most recent OCs.
  To go further back:
  `/v2/faction/crimes?cat=completed&filter=executed_at&from=<unix>&to=<unix>&sort=DESC`
  Walk `to` backwards a window at a time. This is what `backfillOcHistory()` does.
- **Do NOT scrape the Completed page.** Its "Show more" only expands each card's *prose
  narrative* ("iSatomi hacked into the armor display…"). It is not pagination, it shows
  25 cards, and it gives less than the API.
- Loan member field submits as `PlayerName [UserID]`.
- Armory give URL: `...#/tab=armoury&start=0&sub=utilities` (`utilities` is **plural**).

---

## The money model (get this right or the numbers lie)

The old `NET` column was ambiguous and actively misleading: it was
`revenue − item cost`, i.e. the whole pie **before anyone was paid**. A "$313m net" OC on
an 80% split really left the faction ~$62m.

It is now split explicitly:

```
gross        = cash + reward-item value
memberCut    = cash × split%          (only counted for OCs Torn marks PAID)
factionKept  = gross − memberCut − item cost
```

`split%` = Torn's recorded `rewards.payout.percentage` if it exists, **otherwise** the
per-difficulty setting (default: levels 1–2 → 100%, 3–4 → 90%, 5+ → 80%; every level is
editable in Config). The setting is a *fallback only*, for OCs not yet paid.

Watch out: `Number(null) === 0`, which passes `isFinite()` and matched level 1 — so an OC
with unknown difficulty was silently treated as the **most generous** split. Unknown now
falls back to the lowest configured share.

---

## Architecture notes

- **Six tabs since v5.3**: Dashboard / Crimes / People / Money / War / Armoury.
  Loans + Item Status moved from People to Armoury in v4.0 — their container ids
  (`#ocm-people-loans`, `#ocm-people-items`) deliberately did NOT change, so the
  finance renderer's guards keep working. A one-time sub-tab migration in
  `initTabs()` carries the user's saved choice across.
- **The navigation rail (v5.3) is a RESTYLE, not a new navigation system.** This is
  the load-bearing decision: `initTabs()` still does nothing but toggle `.active` on
  `.ocm-tab[data-tab]` and `.ocm-tab-pane#ocm-pane-X`. Because rail items kept those
  hooks, every renderer and all 29 tab tests were untouched by the redesign. Keep it
  that way — if you find yourself writing parallel navigation logic, stop.
  · Layout is a CSS grid on `#ocm-body`: a **fixed 56px** track for the rail, plus
    `minmax(0,1fr)` for content. Hover widens the *rail* to 190px, which OVERFLOWS
    the fixed track instead of resizing it — content must never reflow on hover,
    because the suite lives in Torn's ~990px column and `.ocm-war-deep` needs 830px.
  · Rail CSS is scoped under `#ocm-root` so it beats the original horizontal-tab
    rules on **specificity**, not source order (see the duplicate-selector hazard).
  · Hover is not an affordance on TornPDA — hence `📌` (`GMK.RAIL_PINNED`), and a
    `max-width:700px` query that reverts to the horizontal strip entirely.
- **Dashboard (v5.3)**: `renderDashboardPane(ctx)` runs LAST in `renderDashboard`, so
  it can summarise what the other renderers just computed. It reads only already-synced
  stores — **zero extra API calls** — and a card is emitted only when it has something
  to act on. Navigation uses `ocmGoto(tab, sub)`, which *clicks the real controls*
  rather than reimplementing activation, so it can't drift.
  New default tab is `dashboard`, but **only for someone with no saved choice** —
  relocating a returning user mid-war is its own small betrayal.
- **Page router since v4.0**: `@match` covers factions.php AND item.php. The boot
  branches on `location.pathname`; item.php runs ONLY the opt-in loadout capture.
- **War data layer (v4.1+)**: every sync is id-keyed and cursor-walked ASCENDING
  (seed = one DESC page). This is the no-skipped-burst pattern — the old
  `from=cursor&sort=DESC` gives-fetch permanently skipped events when >100 landed
  between refreshes. All five syncs share it: attacks, revives, giveFunds,
  armoryAction, (wars/chains are id-merged). Failures land in a `*_STATUS` GM key and
  panes degrade to a one-line "needs faction API access (AA)" note — never a blank pane.
- **Attack ledger discipline**: rows slimmed to ~120 bytes, raw retention 180 days,
  the per-war/per-chain archives are the permanent record. `backfillAttacks` copies
  `backfillOcHistory`'s pacing exactly (900ms, 4 retries, honest gap reporting).
- **Polling budget**: `syncWarData` is ONE throttled group (60s during a live war,
  5 min otherwise, ~5 calls per firing). The chain watcher and War Room poll on a 30s
  loop that NO-OPS unless their pane is visible (or a chain is live) — Torn's server
  caches identical calls ~30s anyway, so polling faster is pointless.
- **Provenance honesty everywhere**: official war-report numbers are labelled exact;
  ledger-computed numbers are "obs"; FFScouter values are estimates with a source tag;
  a payout percentage Torn didn't record renders as `~80%`, never as a silent $0.
- **Loadouts are consent-based**: the API does not expose other players' equipped
  gear. Own gear is scraped (opt-in) from item.php `data-equipped/data-item`
  attributes; members share base64 codes; there is no backend.
- **Torn rules**: everything is advisory/display-only. War Room rows LINK to profile
  and attack pages; the script never performs a game action itself.
- **Storage keys** are `ocs_*` (renamed from `ocm_*` in v3.30; a one-time migration copies
  old values and never clobbers). **CSS class names are still `.ocm-*`** — ~1600 references,
  internal only, deliberately left alone.
- **Spacing scale (v4.0)**: `--ocm-gap-1..4`, `--ocm-pad-card`, `--ocm-pad-cell` +
  utility classes `.ocm-note`, `.ocm-kpis`, `.ocm-flexrow`, `.ocm-mt`. New components
  use the scale; inline pixel paddings are legacy. `.ocm-note` predates the scale and
  is defined ONCE (further down the stylesheet) — do not redefine it.
- **Collapse state must be re-synced after every render.** `initCollapse()` originally ran
  once at boot, when every title still read `(0)`, decided "empty → start collapsed", and
  never looked again — so the class and the display drifted apart and folding took two
  clicks. `syncStaticCollapse()` now runs post-render, and the title's `.collapsed` class
  is the single source of truth driving the content's display.
- **Counts are published, not scraped.** Tab badges read from the `OCM_COUNTS` registry.
  They used to regex the `(N)` out of rendered headers, which silently broke when the
  headers were restyled.
- **CPR priority** (`tsGetCpr`): own observed archive → live API window → TornStats exact →
  fuzzy. Provenance is shown in the UI as `obs 78` vs `est 50`. Never present an estimate
  as if it were observed.
- **TornStats "coverage"** is a count of crime+role records, *not* a CPR. Fewer than 5
  records is treated as unusable.
- **War Tools module (v5.0)**: the entire standalone Torn_War_Tools script lives inside
  `initWarTools()` — a self-contained function scope whose inner `esc`/`Toast`/`$` etc.
  deliberately shadow the suite's. It keeps its ORIGINAL storage keys (TWSE-compatible
  `xentac-*` + `wt:*`) so standalone installs migrate for free, and keeps the
  `window.__tornWarToolsLoaded` singleton guard — a still-installed standalone wins if
  it loads first. The suite reaches it only through the module-level `OCM_WT` handle
  (set when its `start()` runs), used by the War > 🛠 Tools pane. Its floating ⚙/📋
  buttons are gated on a war list being on screen. When editing it, re-run the embed
  discipline: it was spliced verbatim; don't "unify" its helpers with the suite's.
- **Hit calling (v5.1, hardened v5.1.1)**: shared state lives in a member-deployed
  Google Apps Script Web App over a Google Sheet (`HC_BACKEND` is the copyable
  backend; everyone pastes the same `/exec` URL — `Store 'hitcall-url'`). There is
  NO server of ours and NO auth: the sheet is an append-only event log
  (`call`/`done`/`release` rows), and `reduceCalls()` folds the last 24h into
  per-target caller queues client-side. Calls are EXCLUSIVE: the queue head owns
  the target, everyone else sees a 🔒 pill and NO call button (queueing was
  removed in v5.1.1 — a same-moment race gives the loser a ✗ to withdraw).
  Expiry is `hcCallStale()`: a call HOLDS while the target is Hospital/Jail, then
  dies `HC_ALIVE_MIN` (5 min) after they're attackable (`rec.since` from the War
  Tools poll); `HC_MAX_MIN` (6h) is the absolute cap inside `reduceCalls`. The
  OWNER's client auto-sends one `release` (result 'timeout') when its own call
  goes stale, so the sheet stays authoritative. `paintHitCalls()` runs from
  `reconcile()`'s 600ms tick: DOM rebuilds are signature-guarded
  (`li.dataset.wtCallsig`), but the row classes (`wt-called`/`wt-called-mine`)
  and the host's `wt-callout-host` class are RE-ASSERTED every tick — Torn's
  React re-renders strip classes off its own elements while leaving our appended
  buttons orphaned, which is how the 📌 button "vanished" in v5.1.0. `.wt-call`
  is `order:-1` (first in the attack cell) so overflow eats the shrinkable pill,
  never the button. Polling is `pollHitCalls()` self-gated on `HC_POLL` (20s),
  war list on screen only. Both `script.google.com` AND
  `script.googleusercontent.com` must stay in @connect — Apps Script answers via
  a 302 to the second host. Communication only: buttons write rows to the sheet;
  the human still presses Attack.
- **Member mode (v5.1.1)**: `renderMemberDashboard` puts `ocm-member-mode` on
  #ocm-root, which hides the ENTIRE leader shell (`.ocm-tabs` + every
  `.ocm-tab-pane`) via CSS — never force panes visible there; the member panel
  renders into #ocm-footer. Leader mode's `renderDashboard` removes the class.
  Identical open seats are collapsed to one card with `_count` ("×N open").
- **Re-render hygiene (v5.0)**: store-backed renderers rebuild via innerHTML on every
  refresh, which closes `<details>` cards and expanded rows. Renderers snapshot
  `openDetailKeys(el)` before rebuilding and `restoreOpenDetails(el, keys)` after —
  cards carry `data-key`, expanded table rows carry `data-key` + `data-detail="1"`.
  Any NEW `<details>` renderer must follow this or it will fold under the user.
  `clearStaleTooltips()` runs after render passes and tab switches because a re-render
  under the cursor orphans Torn's [title] tooltip nodes, which otherwise never dismiss.
- **Funds ingestion (v5.0)**: `syncDepositFunds` (cat=depositFunds) mirrors the
  giveFunds cursor walk; Money > Funds renders deposits vs gives per member. The OC
  history backfill also runs automatically now (`maybeAutoBackfill`): once when the
  archive is empty, then at most weekly, 6h backoff on failure.
- **Names are RESOLVED, never rendered as #id (v5.0.2)**: the archive stores bare
  user ids, so `resolveUnknownNames` fetches unknowns via the user endpoint (40 per
  pass, 400ms pace, weekly retry for failures) into the persistent MEMBER_NAMES
  cache; ex-member names from the live window are stashed there too. Any new
  renderer showing a uid must go through `warMemberName`/`resolveMemberName`.
- **Money tab structure (v5.0.2)**: Overview (owns `ocm-money-summary` — the honest
  faction-kept split; the old ambiguous "Net Profit" Summary and the separate
  Faction Earnings sub-tab are GONE, saved 'faction' sub-tab migrates to 'summary'),
  Member Earnings, Payouts (which-OCs-paid only — its per-member table duplicated
  Member Earnings and was removed), OCs Ran, Costs, Funds, Exports. Don't reintroduce
  a pane that repeats another pane's numbers.

- **Performance, roster-first (v5.2, renamed + merged in v5.3)**:
  `renderHistorySection` replaced `renderReferenceSection`. The sub-tab label is
  **📊 Performance** but `data-sub` is still `"history"` — the label changed, the
  key did not, so saved sub-tab state and the tab tests keep working. Two views now
  (**Roster / Crimes**) behind a time window; state in `HIST_VIEW` / `HIST_WINDOW` /
  `HIST_FILTERS`.
  · v5.3 merged Scenarios + Runs into **Crimes**. They read as duplicates because
    both opened with the same four columns and the seat-failure breakdown — the only
    thing that justified Scenarios — was hidden behind a click. The weak seat now
    shows on the master row; expanding gives seats AND that crime's runs. A saved
    `scenarios`/`runs` view **migrates** in `histState()`; don't drop that, or those
    users land on a blank pane.
  · Runs are grouped by `run.scenKey`, stamped at build time, so grouping cannot
    drift from the aggregate the master row was computed from.
  · It still calls `recordCprHistory()` — that is what grows the persistent CPR
    archive past Torn's ~100-OC window, and it must survive any future rewrite of
    this pane. The two autocomplete search widgets it replaced are GONE; `MH_LAST` /
    `OH_LAST` are unused keys left in storage harmlessly.
- **Member profile (v5.2)**: `buildMemberProfile(uid, ctx)` assembles the six
  stores into one object with a `missing[]` array so each section can degrade to
  an honest note instead of a blank block; `renderMemberProfile()` draws it.
  It is a DRILL-DOWN, not a modal — `#ocm-member-profile` is a sibling of the
  tab strip and `.ocm-profile-open` on the root hides the whole leader shell,
  the same mechanism member mode uses. Reached by a delegated click on any
  `[data-ocm-profile]`, so new renderers opt in with one attribute and nothing
  needs rewiring after an innerHTML rebuild. `OCM_PROFILE_UID` is re-rendered at
  the end of `renderDashboard` so an open profile survives the 60s refresh.
- **Avatars (v5.2)**: `profile_image` is on the `profile` selection and its URL
  carries an unguessable UUID — `https://profileimages.torn.com/{uuid}-{uid}.{ext}`
  (`.png` and `.gif` both occur; do NOT hardcode an extension). It cannot be
  templated from a uid, so `syncProfileImages()` walks 40/pass at 400ms and
  caches for 30 days (Torn serves them `immutable, max-age=2678400`).
  `resolveUnknownNames` asks for `basic,profile` so names and avatars arrive in
  one request. **Cache URLs only, never bytes** — an avatar can be a 3.3MB
  animated GIF. For the same reason avatars render ONLY on the profile card and
  every list uses `ocmMonogram`. "No picture" returns a SHARED silhouette at
  `www.torn.com/images/profile_man.jpg`, so `validAvatarUrl()` host-whitelists
  and requires the uid suffix — otherwise one generic face lands on half the
  roster, which reads worse than initials.
- **Shared primitives (v5.2)** live at the END of the stylesheet so source order
  can't betray them: `.ocm-panel`, `.ocm-statrow`, `.ocm-avatar`,
  `.ocm-datatable` (+ `ocmSortTable()`), `.ocm-seg`, `.ocm-chip-filter`,
  `.ocm-kpi-tile`, `.ocm-run-spark`, `.ocm-prov-dot`, `.ocm-backbar`.
  Note `.ocm-run-spark` — `.ocm-spark` was already taken by v4.4's activity bars.
- **`kpiTile()` emits `.ocm-kpi-tile` (v5.3), not inline styles.** It has 56 call
  sites; when it hardcoded its own CSS, the shared class sat unused and every KPI row
  in the suite was pinned to whatever the helper said. Only the *semantic* overrides
  (`color`, `border` — good/warn/crit) remain inline. Add new styling to the class.
- **Putting a flex box in a table cell moves the row's baseline.** Table cells align
  on `baseline` by default, and a flex container takes its baseline from its first
  item. `.ocm-rosname` starts with a 28px avatar that has no text baseline, so it
  contributed its *bottom edge* — dropping every rank number ~12px below its own
  row (shipped in v5.3.0-dev, caught from a user screenshot, not from any test).
  Any table mixing plain-text cells with flex/media cells wants an explicit
  `vertical-align: middle`.

## Design system (v3.34–3.36)

Lifted from the HTML export report:

```
page #141414 · card #1e1e1e · border #2e2e2e · radius 10px
h2   13px UPPERCASE .06em #59a5d8   ← one blue header per block
note 11px #8a8a99                   ← every table explains itself
th   9px UPPERCASE · td 12px · tabular-nums on ALL numbers
money #7cba5c · negative #d75f5f
faint #848494  (was #6e6e7e = 3.3:1 — below AA, and it carries real info)
```

Check contrast before introducing a colour. `--ocm-text-faint` failed AA twice.

---

## Security

The API key was pasted into a chat log at one point and should be treated as
compromised — rotate it in Torn if that hasn't been done. Never log the key, and never
commit one to this repo.
