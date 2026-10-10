# Gym Planner completion design

## Context

The active production target is `Torn Gym Planner-3.36.txt`. Its userscript
header says 3.37, but the user identifies the 3.36-named file as the file in
use. `Torn Gym Planner-3.37.txt` is retained as a read-only backup/reference.

The Claude Code history was found under the local Claude project transcript for
this workspace, especially session `0d87567c-9d82-49a5-8736-5edc92007c36`,
titled “Read Torn gym planner script”. The durable handoff from that work is
`REBUILD.md` plus `GAPS.md`; the transcript itself is not copied into the repo
because it contains tool output and unrelated session material.

The rebuild has a strong calculation/data engine, but the single-file render
layer is only partially connected. The goal is to make every visible control
have a working path, make missing data explicit, and remove contradictory
calculation paths only after their behavior has regression coverage.

## Current implementation status

The refresh coordinator, Now-side validation, truthful energy logging, copy
fallback, Money assessment states, and local inventory fallback are now wired
and covered by source plus live-browser checks. The ownership-aware best-gym
nudge and real auto-switcher fixture are also covered now. The remaining
design work is legacy calculator unification and reducing broad silent catches.

## Current findings

### Confirmed defects or unfinished behavior

1. `autofill()` updates individual fields and the old infobar, but does not
   consistently repaint the new freshness strip/build bar/result. This creates
   stale UI after a successful API fill.
2. Perk/profile changes update the bonus summary only. The Now result, best-gym
   recommendation, build bar, and any visible plan output can remain stale until
   the user changes tabs or another input.
3. Validation is rendered in Setup while the affected result is on Now. A bad
   stat, goal, happy value, or incompatible gym/stat selection can be hard to
   discover.
4. Best-gym analysis is deferred until the disclosure opens, with no compact
   recommendation in the Now summary.
5. The copy-result control is unhidden by `calculateSession()`, but there is no
   regression assertion that it becomes available after a valid result or that
   its clipboard fallback works.
6. The auto-switcher has a toggle and banner functions, but the current browser
   smoke test does not verify a real Torn gym switch control or the prevent/click
   path.
7. The old `calculateDaily`, `calculateHappyJump`, `calculateCompare`, and
   `calculateXanaxGrind` paths still coexist with `simDailyRegen`, `simJump`,
   and `simDrugDay`. The old happy-jump path uses a different cooldown model,
   so two screens can produce different answers for the same plan.
8. Data-driven states are incomplete. Loading, offline, limited-key, rate-limit,
   and stale states are not represented consistently across Money and Setup.
9. Money has no manual inventory fallback, so a key that cannot read v2
    inventory is displayed as “buy everything” without a usable way to correct
    the Have column.
10. The logger labels the click-time available energy as authoritative
    `energyUsed`. That is not the same value as energy spent and is the reason
    browser logs can be wrong even when the full desktop result parser is right.
11. The current source still contains broad silent catches around startup and
    API/UI transitions, which make failures look like empty panels instead of
    actionable states.

### Already verified and preserved

- The calibrated formula correction in the active file is `1.1472`. PDA 3.36
  holdout MAE improved from about 10.552% to 1.300%; browser logs remain
  excluded until the energy-used capture is fixed.
- The panel mounts on a real signed-in Torn gym page while the account is
  traveling/flying. The live smoke test verified the shell, tabs, selectors,
  Now pane, Setup button, and zero console errors.
- The data/calculation engine includes the corrected item IDs, candy values,
  API-v2 inventory handling, specialist paths, and the verified cooldown rules.
  These are not to be rewritten casually.

## Design decisions

### One refresh coordinator

Add a small coordinator that owns repaint ordering:

1. persist changed inputs;
2. refresh the lightweight strip and build bar;
3. validate inputs and render Now result/error;
4. refresh best-gym and visible Plan/Money subviews;
5. update copy availability and freshness state.

The coordinator must be cheap and guarded against re-entrant input events. It
must not start API requests; API actions remain explicit and cache-aware.

### Explicit screen states

Each data-driven view gets a state of `ready`, `first-run`, `loading`, `error`,
`offline`, `rate-limited`, or `stale`. State cards show what is known, what is
missing, and the next available action. Unknown inventory remains unknown; it
must never be silently treated as zero owned.

### One calculation engine per concept

Keep the verified simulation functions as the source of truth. Port any unique
jump-then-switch scheduling behavior into a tested engine function, then route
Plan and comparison rendering through that engine. Delete or quarantine legacy
calculators only after their outputs have fixture coverage.

### Logger truthfulness

Separate `energyBefore` used for session classification from `energyUsed` used
for prediction/calibration. Prefer energy parsed from Torn's full result; for
short results use the result's train count × gym energy; otherwise use a
measured before/after delta only when the delta is unambiguous. If energy spent
cannot be determined, store the entry as uncalibratable and say why.

### Active target and backup safety

All production edits go to `Torn Gym Planner-3.36.txt`. The 3.37 backup is read
for comparison only. Tests and docs may be added beside the script.

## Acceptance criteria

- A fresh mount renders a meaningful Now state or an actionable first-run state
  without a user input event.
- Auto-fill visibly updates every dependent area and does not leave stale
  values behind after success or failure.
- Changing profile/perk/session inputs updates all visible dependent output.
- Invalid input is explained next to the affected result and in Setup.
- Best gym and copy-result affordances are visible when they are actionable.
- Money clearly distinguishes known, stale, limited, and unknown inventory;
  manual inventory values can be entered and persist locally.
- Logger entries never claim a click-time available-energy value is spent energy.
- The legacy calculators are removed or made unreachable only after equivalent
  engine tests pass.
- Node syntax, existing engine tests, new regression tests, and real-browser
  smoke tests pass. Any dedicated debug browser process started for testing is
  closed afterward.
