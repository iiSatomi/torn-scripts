# Gym Prediction Calibration Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with test-first verification. Keep the production edit limited to the active 3.36-named script.

**Goal:** Calibrate the Gym Planner’s empirical formula correction using PDA 3.36 data and verify that held-out predictions improve.

**Architecture:** Preserve the existing formula and simulation. Replace only `FORMULA_CORRECTION` in `Torn Gym Planner-3.36.txt` with the value fitted from the first PDA 3.36 rows. A standalone Node regression test reads the script constant and log, fits on the earlier rows, evaluates the later rows, and compares against the old correction.

**Tech Stack:** Plain userscript JavaScript, Node.js CommonJS test scripts, tab-separated text logs.

## Global Constraints

- Use only PDA rows marked `scriptVer=3.36` for calibration.
- Exclude browser-log rows from the fit because their energy metadata is unreliable.
- Modify only `Torn Gym Planner-3.36.txt` for production behavior.
- Leave the 3.37 backup and all logger behavior unchanged.
- Do not add dependencies or network calls.
- Run the regression test before and after the production edit.

---

### Task 1: Add the failing calibration regression test

**Files:**
- Create: `test/gym-prediction-calibration.test.cjs`
- Read: `Torn Gym Planner-3.36.txt`
- Read: `Torn PDA Gym Log.txt`

**Interfaces:**
- Consumes the active script’s `FORMULA_CORRECTION` constant and PDA 3.36 TSV rows.
- Produces a failing assertion when the script still uses the old correction.

- [x] **Step 1: Write the failing test**

Implement helpers that parse the TSV header, reproduce `calcGain` and
`simulateBlock`, calculate the least-squares correction from the first 70 PDA
3.36 rows, and measure mean absolute percentage error on the final 20 rows.
Assert that the active script constant is within `0.002` of the fitted value and
that the fitted value improves held-out error over `1.027`.

- [x] **Step 2: Run the test and verify it fails for the expected reason**

Run:

```text
node test/gym-prediction-calibration.test.cjs
```

Expected: failure reporting that the active correction is still `1.027` while
the PDA-derived correction is near `1.14`.

### Task 2: Apply the calibrated correction

**Files:**
- Modify: `Torn Gym Planner-3.36.txt:356`

**Interfaces:**
- Consumes the fitted scalar reported by Task 1.
- Preserves the existing `calcGain(dots, stat, happy, bonus, energy, consts)` interface.

- [x] **Step 1: Change only the empirical scalar and its comment**

Replace the old `FORMULA_CORRECTION = 1.027` value with the fitted PDA 3.36
value from the failing test. Update the comment to state that it is calibrated
from the PDA 3.36 rows and that browser rows are intentionally excluded.

- [x] **Step 2: Run the calibration test**

Run:

```text
node test/gym-prediction-calibration.test.cjs
```

Expected: PASS; the held-out mean absolute error is lower than the baseline.

### Task 3: Run focused regression verification

**Files:**
- Read: `test/verify-gym-predictions.cjs`
- Read: `test/codex-diagnostics.test.js`
- Read: `test/codex-lifecycle.test.js`
- Read: `test/memory-lifecycle.test.js`
- Read: `test/loan-endpoint.test.js`

- [x] **Step 1: Check syntax**

Run:

```text
node --check test/gym-prediction-calibration.test.cjs
node --check test/verify-gym-predictions.cjs
```

- [x] **Step 2: Run the existing gym-log verifier**

Run:

```text
node test/verify-gym-predictions.cjs
```

Expected: the PDA 3.36 predictions move closer to actual gains; browser rows
remain flagged as logger-input outliers and are not used to tune the scalar.

- [x] **Step 3: Run existing focused tests**

Run each command independently:

```text
node test/codex-diagnostics.test.js
node test/codex-lifecycle.test.js
node test/memory-lifecycle.test.js
node test/loan-endpoint.test.js
```

Expected: all existing tests pass and no unrelated production file changes are
introduced.

## Completed result

- Fitted correction: `1.147209`; production value: `1.1472`.
- Held-out PDA 3.36 MAE: `10.552%` baseline → `1.300%` calibrated.
- All-PDA-3.36 recalculated MAE: approximately `1.17%`.
- PDA 3.36 rows within 10%: `89/90`.
- Browser rows remain excluded because their logged energy is not consumed
  energy.

## Follow-up hardening recorded 2026-08-24

- Desktop/PDA result parsing now shares one parser, and ambiguous energy stays
  unknown instead of entering calibration.
- Live page energy includes the cap and preserves legitimate over-cap values;
  subscriber status is synchronized from a visible `current/cap` bar.
- The logger now deduplicates by resulting stat/verified energy rather than by
  approximate gain alone, preventing rapid legitimate trains from disappearing.
- The source’s 16-test regression suite, syntax check, harness, and live local
  fixture were rerun after these changes.

## Extended pass recorded 2026-08-24

- Prediction calibration was re-verified against the same PDA dataset; no new
  scalar change was justified because the holdout and grouped errors remain low.
- Added style cleanup, API-error diagnostics, and stale-price invalidation so
  runtime state cannot look healthy while using accumulated DOM/API data.
- Added focused contracts for path suggestion, style lifecycle, API diagnostics,
  and price snapshots; the complete local suite now reports 26 passing tests.
