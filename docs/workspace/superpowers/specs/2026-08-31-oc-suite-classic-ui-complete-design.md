# OC Suite Classic UI Complete Feature Design

## Goal

Keep the visual shell and interaction style of
`Torn_OC_Suite.user.js.bak-v336-20260807-052330` while retaining the complete
feature set and hardening already present in `Torn_OC_Suite_Codex.user.js`.

## Source of truth

- Visual reference: the 3.36 backup named above.
- Functional baseline: `Torn_OC_Suite_Codex.user.js`.
- Historical feature references: `Torn_OC_Suite_REBUILD.user.js` and
  `Torn_OC_Suite_PurrfectCrime.user.js`.
- The original backup and PurrfectCrime file remain untouched.

The Codex file is the correct implementation baseline because its named-function
surface is a superset of PurrfectCrime ui71 and it already includes the later
diagnostics, consumables, route-lifecycle, memory, API timeout, and encoding work.
Copying hundreds of functions into the 3.36 file would create unnecessary merge
risk and make omissions difficult to detect.

## UI architecture

The completed userscript keeps the modern feature panes and their existing IDs,
renderers, event wiring, and storage keys. Only the outer shell changes:

- the left navigation rail becomes the 3.36 horizontal underline tab bar;
- the premium topbar becomes the 3.36 header containing title, version, last
  refresh time, Legend, Config, and Refresh controls;
- the page returns to the 3.36 dark neutral palette, flat panels, restrained
  borders, and non-glowing controls;
- Dashboard, Crimes, People, Consumables, War, and Armoury remain available;
- responsive wrapping keeps all six tabs usable on PDA-sized screens.

The root carries both the current component class and a classic-shell modifier.
Current feature-specific styles remain available for complex War, Armoury,
Consumables, and diagnostics views, while final classic overrides neutralize the
premium rail, glow, gradients, and grouped-stat treatments.

## Data and behavior contracts

No Torn API endpoint, grant, connect domain, Google Sheet contract, storage key,
cache shape, CPR calculation, loan behavior, payout calculation, War report,
Consumables workflow, diagnostics payload, timer, or observer lifecycle changes.

Existing saved tab values continue to work. The navigation retains `.ocm-nav`,
`.ocm-tab`, `data-tab`, and pane IDs so existing code and browser tests continue
to activate the same feature renderers.

## Error and lifecycle behavior

The existing Codex lifecycle remains authoritative: one route handler, cancellable
injection, bounded network requests, root-aware timers, and replaceable native
observers. The shell change must not create a second listener, observer, interval,
or data fetch.

## Verification

1. A Node behavior test executes the shipped `buildRailNav()` and `buildRoot()`
   functions with controlled dependencies and verifies the classic shell, complete
   navigation, settings controls, and all six feature panes.
2. Existing diagnostics, lifecycle, consumables, loans, and memory contracts pass.
3. Node syntax and whitespace checks pass.
4. A live browser smoke test walks every main tab and subtab, checks mobile
   overflow, and records console errors without performing destructive Torn actions.

## Scope exclusions

- No source modularization in this change.
- No backend or shared-faction storage implementation.
- No redesign of the inner War, Armoury, or Consumables feature workflows.
- No changes to the 3.36 backup or PurrfectCrime working file.

