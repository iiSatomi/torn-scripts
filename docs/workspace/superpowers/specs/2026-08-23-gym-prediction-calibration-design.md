# Gym Prediction Calibration Design

## Goal

Make the Gym Planner’s single-session predictions more accurate for the active
3.36-named script by calibrating its existing formula against the clean PDA
3.36 training data.

## Evidence

- `Torn PDA Gym Log.txt` contains 90 rows marked script version 3.36.
- Those rows reproduce the script’s logged prediction values to rounding, but
  actual gains average about 11.1% above prediction.
- The browser log is excluded from calibration because its `energyUsed` field
  is contaminated by the logger reading current available energy rather than
  the energy consumed by the result.
- The file named `Torn Gym Planner-3.36.txt` currently has a 3.37 header and
  shares the prediction formula with the 3.37 backup. It is still the active
  file selected by the user for this change.

## Design

Keep the Vladar formula, gym dots, perk multiplier, happy decay, and multi-train
simulation unchanged. Adjust only the empirical scalar applied after the
formula. Fit that scalar using the PDA 3.36 rows, with the earliest rows used
for fitting and the latest rows held out for validation. The regression test
will require the active script’s scalar to match the fitted value and will
require the held-out mean absolute percentage error to improve over the current
scalar.

The browser log will remain a separate logger-quality issue. It must not affect
the formula calibration until `energyUsed` is derived from the result or from a
before/after energy delta.

## Safety boundaries

- Modify only `Torn Gym Planner-3.36.txt` for production behavior.
- Do not modify the 3.37 backup or the original Torn Gym Planner sources.
- Do not change the logger in this task.
- Do not expose or add API keys, user secrets, or network calls.
- Keep the correction bounded to the observed data and test it on held-out
  rows before claiming improvement.

## Verification

- The calibration test reads the actual script constant and the PDA log.
- It checks the fit/holdout split and compares baseline versus calibrated MAE.
- Existing syntax and focused project tests must continue to pass.

## Result

The fitted correction was `1.147209`; the active script uses `1.1472`.
On the 20-row held-out PDA 3.36 set, mean absolute percentage error fell from
10.552% with the old scalar to 1.300% with the calibrated scalar. Across all 90
PDA 3.36 rows, the recalculated mean absolute error is approximately 1.17%,
with 89 of 90 entries within 10%.
