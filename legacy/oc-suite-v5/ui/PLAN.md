# v6 rebuild — the plan

**Goal:** replace the presentation and data-access layers of the suite with
something clean enough that adding a feature is a small, obvious change.
Keep every hard-won fact and every byte of stored history.

**The one rule that constrains everything:** storage keys and their shapes do
not change. `OC_ARCHIVE` and `CPR_ARCHIVE` reach further back than Torn's API
does, and `backfillOcHistory` cannot recover OCs that have aged out. New code,
same storage.

---

## Where things stand

| | Status | Checks |
|---|---|---|
| UI prototype — 9 pages, 21 routes, themes, layouts | **done** | 192 |
| Port prep — delegation, `#app` scoping, storage seam | **done** | (in above) |
| Feed contracts verified against real stores | **done** | (in above) |
| v6 core — Storage, Api, defineStore, walkForward | **done** | 28 |
| Store declarations (all 16) | not started | |
| Derive layer (pure store → UI functions) | not started | |
| Wire prototype to real logic | not started | |
| Port into the userscript | not started | |
| Cut over, retire v5 renderers | not started | |

The live script is untouched and passing all 19 suites. Nothing so far has put
it at risk.

---

## Phase 1 — Foundation

### 1a. Platform ✅ done
`ui/core.js`: storage wrapper, rate-limited API client, `defineStore`,
`walkForward`. Everything injected, so quota exhaustion, permission errors and
event bursts are ordinary tests. 28 checks.

### 1b. Declare the stores ✅ done
17 stores, 37 keys, all verified against the live script. Three data-bearing
v5 keys are deliberately not ported yet: `ocs_war_pay_ledger` (war payout
calculator), `ocs_sidebar_cache`, `ocs_ts_cpr_cache` (TornStats). They belong
to features the prototype has not designed screens for.

**Found while doing it:** v5's cursor keys are bespoke, not derived —
`ocs_attack_ledger`'s cursor is `ocs_attack_cursor`. `defineStore` originally
assumed `key + '_cursor'`, which would have abandoned every cursor and forced
a full re-walk on first run. Cursor and timestamp keys are now declared.

### 1c. Scheduler ✅ done
Grouped by what the user is doing, not by endpoint. A simulated hour of the
heaviest case (live war, war room open) costs **533 calls — 8.9/min** against
a 100/min allowance; idle costs 149/hour. Both are asserted by tests.

---

## Phase 2 — Derive layer — IN PROGRESS

**money ✅ done** (`ui/derive.js`, 45 checks). Split resolution, the
gross/members/kept model, scenario aggregation, faction totals. The v5 trap
— `Number(null) === 0` passing `isFinite()` and taking the *most generous*
split — is now six explicit tests. Aggregates report `exact` / `mixed` / `est`
so a group containing one guessed split cannot present itself as measured.

**payouts ✅ done.** Ported v5's `matchPayouts` faithfully — two-pass matching
(1:1 greedy, then lump sums), 21-day window, 15% tolerance, 1h clock-skew
grace. Its four non-obvious rules are now named tests: natively-paid OCs make
no claims; manually-paid ones keep theirs; the split resolves per OC (a flat
percentage made real payouts read as unpaid); an ambiguous name is dropped
rather than guessed. Unmatched gives are surfaced, not swallowed.

**roster ✅ done.** Two-store aggregation with the CPR-archive limitation
enforced by test: run history, success rate, sparkline and trend all come
from `OC_ARCHIVE`; only CPR, role and best difficulty come from
`CPR_ARCHIVE`. Expired OCs are excluded — nobody ran them. Unknowns are
`null`, never `0`, so "no data" cannot render as a measured failure.

**war, chains, armoury ✅ done.** Written against the real record shapes read
out of `mergeWarsPayload`, not guessed. `tornList` carried over — Torn ships
lists as arrays or id-keyed objects and `Object.values()` would drop the ids.
Winner ids compare as strings (`4 === '4'` is false). `loaned_to` is a
comma-separated string, not an array.

**Known gap:** `itemUsage` counts ledger MOVEMENTS, which overstates
consumption for reusable tools. Separating "consumed" from "loaned and
returned" needs the armoury news-text parser, which is not written. The
function already honours a `kind` field so that parser can drop in without
touching it.

Phase 2 total: **163 checks.**

### The original scope, for reference

Pure functions: stores in, UI shapes out. No DOM, no network, no storage.
This is the biggest quality win available — right now fetching, computing and
HTML generation live in one function, so none of it can be tested alone.

One per feed. The three that carry real logic:

- **money** — `kept = gross − members − cost`, split resolution, the
  difficulty fallback. CLAUDE.md warns about this one hardest: `Number(null)
  === 0` once made unknown-difficulty OCs take the *most generous* split.
- **payouts** — the OC↔give-funds inference, carrying confidence through to
  the UI rather than flattening it to a boolean.
- **roster** — aggregation across two stores, because `CPR_ARCHIVE` keeps only
  the most recent entry per (member, OC, role) and therefore cannot supply
  runs, success rate, sparkline or trend.

*Done when:* each derive function has tests covering its edge cases, run
against fixture data, with no browser involved.

**Size:** large. This is the real work.

---

## Phase 3 — Wire the prototype to real logic ✅ done

`ui/fixtures.js` builds fake data in **storage shapes** (per-OC ledgers, the
CPR archive's slots map, `loaned_to` as a comma-separated string), and the
prototype runs the real derive functions over it. The old mock was
pre-computed into UI shapes and could never disagree with itself.

**What that immediately caught** — four screens were reading fields that do
not exist in any real store, all invented by me when writing the original
mock:

| Field | Reality |
|---|---|
| `oppMembers` | war archive holds scores and names, no roster sizes |
| `used30` | utilities is a stock snapshot with no history |
| `c.best` / `bestHits` / `broke` | chain archive is `{start,end,length,respect}` only |
| `num()` collision | derive's coercer vs the prototype's formatter — same name, two meanings |

Columns that cannot be honestly filled were **removed**, not blanked. The
`num` collision was renamed (`toNum` in derive) — it would have broken the
port identically.

### Original scope, for reference

Replace the prototype's `mock: d => d.x` with `read: () => derive.x(stores)`.
Still standalone, still opens in a browser, but now running the actual
computation over fixture data.

*Done when:* the prototype renders real numbers, and the Data-state toggle
still exercises loading / error / empty.

**Size:** small — this is what the `readFeed` seam was built for.

---

## Phase 4 — Port into the userscript — IN PROGRESS

**Bundle built and verified ✅.** `node ui/build.js` generates
`ui/v6-bundle.js` (136kb, 2163 lines) from `frostbite.html` + `derive.js`.
Generated, never hand-edited, so it cannot drift from the tests.

`ui/bundle.test.js` (43 checks) renders it into a `#ocm-root` div inside a
**Torn-shaped page**, driven by v5's own `load*()` functions. That is the
arrangement the prototype cannot exercise.

**Two real bugs it caught, both invisible until the bundle ran inside a
foreign page:**

1. `* { box-sizing: border-box }` was unscoped — injected into Torn it would
   restyle **every element on the site**.
2. Almost no component selector was scoped. `.card`, `.content`, `.side` —
   Torn has its own elements with those names. The build now runs a proper
   CSS scoper (handles `@media`, `@keyframes`, comma lists, comments) that
   prefixes all 251 rules with `#ocm-root`. This also raises specificity,
   which is how v5's rail CSS already wins.

**Also verified:** Torn's own DOM survives untouched (a regex has eaten it
twice in this project's history), mounting twice does not duplicate the
shell, and theme/layout never touch `<html>` or `<body>`.

**Spliced ✅.** `Torn_OC_Suite.user.js` is now **v5.4.0-dev.1**, 20,023 lines.
All 19 suites still pass.

**INERT BY DEFAULT.** Nothing runs unless `ocs_v6_ui` is `true`. To try it:

```js
GM_setValue('ocs_v6_ui', true)   // then reload factions.php
```

v6 mounts into its own `#ocm-v6` div and hides v5's `#ocm-root` while active.
Set the flag back to `false` to return to v5.

**Three problems the splice surfaced:**

1. **~135 name collisions.** The bundle declares `esc`, `money`, `render`,
   `go`… and v5 already has several. The first splice died on
   `Identifier 'esc' has already been declared`. Fixed with a nested IIFE —
   v6 gets its own scope but still closes over `GMK`, `GM_getValue` and the
   `load*()` family. Exactly one name escapes: `ocmV6Start`.
2. **Two NUL bytes**, traced back to a composite map key in `loanRows`
   (`uid + NUL + item`). Invisible in an editor, passes every syntax check,
   makes grep treat the source as binary. Replaced with nested maps — no
   separator to get wrong. `build.js` now fails on any control character.
3. **A lying collision detector.** `"\\s"` inside a shell-quoted `node -e`
   collapses to `s`, so the regex was `^s*` and reported zero collisions when
   there were many. Scripts with escapes now go in a file, not `-e`.

**Verified after splicing:** function census by multiset (341 → 426
definitions, **no v5 function lost one**), valid UTF-8, no BOM, no CRLF, no
mojibake, no NULs.

### Original scope, for reference

Follow `ui/PORT.md`. CSS into `GM_addStyle`, markup into `#ocm-root`, JS into
the module body, `#app` → `#ocm-root`, storage seam to `GM_*`.

**Blocked on one decision — see below.**

*Done when:* the new UI renders inside Torn against live data and the existing
19 suites still pass.

**Size:** medium.

---

## Phase 5 — Cut over

Run v6 alongside v5 behind a toggle, verify the numbers agree, then delete the
v5 renderers.

Deleting is where this project has hurt itself before: a bad slice once
removed `renderFinanceSection` entirely and `node --check` passed. Census the
function list before and after, and diff it.

*Done when:* v5 renderers are gone, tests still pass, and the file is
materially smaller.

**Size:** medium, and the highest-risk step. Back up first.

---

## The one open decision

**How pages repaint.** The prototype re-renders everything through one
`render()`. The real script keeps panes in the DOM and toggles `.active`.

Under the 60s refresh, a full re-render wipes open `<details>`, expanded rows
and scroll position, and orphans Torn's `[title]` tooltips.

**Recommendation:** keep the page functions, mount each into a persistent
`.ocm-tab-pane#ocm-pane-X`, re-render only the visible pane. Existing hooks
and tests survive; the page functions don't change.

Needed before Phase 4. Doesn't block 1–3.

---

## Loose ends

- **`@version` is still 5.3.0.** Two real bug fixes — the nav-rail grid and
  the Money badge — are in the file but not reaching any browser. One line.
- `ui/prototype.html` is superseded and can be deleted.
- Rename `--green`/`--yellow`/`--red` to `--good`/`--warn`/`--crit` during
  Phase 4. The colour-safe theme puts blue in `--green`.

---

## Files

| File | What it is |
|---|---|
| `Torn_OC_Suite.user.js` | the live script — untouched so far |
| `ui/frostbite.html` | the UI prototype |
| `ui/check.js` | prototype checks (192) |
| `ui/core.js` | v6 data layer |
| `ui/core.test.js` | core checks (28) |
| `ui/PORT.md` | step-by-step port recipe |
| `ui/PLAN.md` | this file |
