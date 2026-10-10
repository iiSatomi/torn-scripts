# Gym Planner completion plan

## Goal

Finish the active Gym Planner rebuild in `Torn Gym Planner-3.36.txt` without
damaging the calibrated engine or the untouched 3.37 backup.

## Work order

### 1. Baseline and audit harness

- Record current syntax, engine, calibration, and live UI results.
- Add a lightweight static audit that checks required UI IDs, event targets,
  startup render ordering, and duplicate/legacy calculator references.
- Add a DOM smoke assertion for a non-empty initial Now state and a visible
  error state for invalid inputs.

Verification: baseline tests pass and the new audit fails only on documented
known gaps.

### 2. Make the shell reliably usable — completed

- Replace the swallowed pre-initialization result call with a post-initialization
  render trigger or a deferred refresh.
- Add the shared refresh coordinator and route session/profile/perk changes
  through it.
- Make autofill call the coordinator after both successful and degraded fills.
- Surface validation in the Now result while retaining Setup explanations.

Verification: browser smoke test mounts cleanly, shows a result or actionable
first-run state, changes inputs, and updates visible output without a tab swap.

### 3. Complete the visible UI contracts — completed for the current UI slice

- Compute a compact, ownership-aware best-gym recommendation during normal
  render; keep the detailed disclosure lazy.
- Show copy-result only after a successful render and verify clipboard fallback.
- Verify auto-switcher behavior against a fixture page with a real switch
  control and retain the manual instruction when no control exists.
- Replace generic blank/warning strings with consistent loading/error/offline/
  stale cards.

Verification: each top-level tab and Setup subview has a usable empty, ready,
and error path; no dead buttons remain.

### 4. Correct logging and prediction data — completed for the safe-capture slice

- Add regression fixtures for full Torn result text, short PDA result text,
  missing energy, and available-energy-before-click.
- Separate energy-before from energy-used in the logger entry shape.
- Prefer parsed spend/train-count values and mark ambiguous entries instead of
  feeding them to calibration.
- Re-run the PDA calibration verifier after the logger change; do not include
  the old browser log until its rows are demonstrably valid.

Verification: malformed/ambiguous rows are rejected or flagged, valid rows
retain their current prediction accuracy, and no available-energy snapshot is
stored as spent energy.

### 5. Unify the plan engine

- Extract the unique jump-then-switch scheduler from the old compare path into
  a tested helper.
- Route Plan projection, Compare, and assessment through `simDailyRegen`,
  `simDrugDay`, `simJump`, and the shared scheduler.
- Compare old/new outputs with existing harnesses and document intentional
  differences.
- Delete unreachable legacy calculators after tests prove equivalent coverage.

Verification: no active UI path calls the old cooldown model; search confirms
there is one source of truth for each plan type.

### 6. Make Money honest and usable — manual fallback and state slice completed

- Keep v1/v2 inventory behavior and caching intact.
- Add five local manual inventory overrides for the items needed by the
  assessment, with clear “manual” freshness labels and a reset action.
- Ensure unknown inventory never becomes zero and that affordability badges
  reflect the selected source.
- Exercise limited-key, v2-unavailable, stale-price, and offline fixtures.

Verification: Money renders an accurate explanation for every source state and
manual values persist across remounts.

### 7. Cleanup and release verification

- Reduce silent startup catches to logged, user-visible state transitions.
- Add comments only where the behavior is load-bearing; remove dead wiring and
  unused element aliases found by the audit.
- Run syntax, focused unit/regression, full existing test suite, and live
  browser desktop/flying/mobile checks.
- Close any dedicated browser process started by the tests.

Verification: all required commands pass, screenshots show the key states, and
the final report lists any remaining limitations rather than hiding them.

### 8. Runtime hardening follow-up — completed in the current pass

- Add a document-visible singleton marker so live injection or SPA re-entry
  cannot mount duplicate widgets, observers, timers, or loggers.
- Filter result and train-button MutationObserver work before queueing/scanning,
  keep the result queue capped, reuse the result-text matcher, and cache page
  energy for only 100ms to collapse duplicate refresh scans.
- Deduplicate overlapping gym catalogue, price, and assessment requests so a
  fast click or startup/manual overlap does not multiply API traffic.
- Add a collapsed Setup runtime diagnostics panel showing network/API counts,
  errors, logger storage, pending result work, mounted widget count, and heap
  usage when Brave exposes it.
- Stop treating an unknown catalogue gym as owned unless it is the confirmed
  current gym.
- Read the live energy cap as well as current energy, including over-cap values
  after Xanax/refills; keep API-filled and page-filled cap displays consistent.
- Centralize desktop/PDA result parsing and make log deduplication require a
  result identity, so rapid legitimate trains are not discarded.
- Let the singleton remount after a Torn SPA redraw removes the widget, and
  prevent header action buttons from toggling the widget collapse state.
- Enforce the dynamic 5–9 eDVD booster-cap range in the Happy Jump projection,
  show the cap beside the input, and disclose any corrected out-of-range value.
- Register lifecycle cleanup so an SPA remount disconnects the old observers,
  timers, pending queue work, banner, and console hook before mounting again.

Verification: singleton, observer, diagnostics, ownership, energy-cap,
result-parser/dedupe, eDVD-cap, calibration, full regression, syntax, and live
local fixture contracts pass.

## Extended pass recorded 2026-08-24

- Owned both injected stylesheet nodes with `data-torn-gym-planner-style` and
  remove them during SPA cleanup, preventing style accumulation across repeated
  PDA remounts.
- Counted Torn API JSON error responses in runtime diagnostics while preserving
  the response for existing fallback handling; diagnostics now exposes the last
  numeric API error code.
- Reset the live price model before applying each price snapshot so a partial
  refresh cannot silently reuse stale prices in the assessment recommender.
- Added regression contracts for style lifecycle and API diagnostics.

## Priority

P0: refresh coordinator, validation, logger energy truth — complete.

P1: state cards, copy affordance, manual inventory fallback, best-gym nudge,
and auto-switcher fixture — complete for the tested paths.

P2: legacy calculator unification/removal, auto-switcher fixture, silent-catch
cleanup, and further UI polish.

## Deferred ideas after completion

- Multi-stage happy jumps that model natural regeneration between stacks.
- Cache-age detail beyond the current API/network counters and logger quality.
- Buildable source modules with a generated single userscript, once behavior is
  stable and the single-file version has a reliable release step.
