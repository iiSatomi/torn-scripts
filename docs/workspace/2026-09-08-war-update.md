# War workspace — Codex 8

Updated the Codex distribution only. Original and rebuild references preserved.

## Delivered

- Shared War workspace styling, selected-war context and clearer Options control.
- Responsive layouts and 44px controls at mobile widths, with 16px inputs; existing Battle/Reports views retained.
- Member report search by name or ID, 25-row paging, keyboard-sortable headers and explicit sorting controls.
- Mobile report rows become labeled member cards. Summary totals remain whole-war totals; copied active rows follow search but span pages.
- Clipboard rejection now reports failure instead of false success. Delimited exports escape quotes/newlines and guard formula-like member names.
- Selection cache reads use request generations; old results cannot overwrite a newer selection. Pulls lock selection and reject duplicate clicks, including during cache reads.
- Changing wars clears contract rosters/estimates and raffle results. Contract responses check the selected war before applying.
- Failed war-list loads expose Retry; loading and empty lists disable report pulls. Options exposes expanded state and supports Escape.

## Verification

`node --check Torn_OC_Suite_Codex.user.js` and seven existing suites passed: diagnostics, lifecycle, consumables, memory lifecycle, loan endpoint, classic UI, PDA storage.

`node test/browser/war-ui.cjs` passed in real, isolated headless Brave using the production report functions and synthetic data. Covered 62 members, paging, name search, numeric sorting, complete filtered exports, stale cache responses and rejected clipboard access. Screenshots at 1920x1080, 390x844, 430x932 and 844x390; no document overflow. Browser closed in finally; visible user browsers were not resized.

These are fixture-backed browser checks, not authenticated Torn integration or native PDA execution. Shared layout rules apply throughout War, but detailed visual/interaction verification here covers Report; existing planner, contract, drugs, sweep and raffle business rules were not rewritten or fully revalidated. No faction API requests or payout actions were made by this test.

PDA reference: `docs/Torn-PDA-userscript-reference.md`. One universal userscript remains the distribution; this change adds no storage backend or background polling.
