# Tab organization audit — Codex 10

## Final structure

| Main tab | Views / contents | Boundary |
| --- | --- | --- |
| Dashboard | Summary and attention links | Triage, not another worklist |
| Crimes | Fill Slots; Active OCs; History & performance | Staff, monitor and review OC operations |
| People | Assignments; Blocked; Role fit; CPR Data | Member-centric assignments, availability, low/underused CPR and TornStats coverage |
| Finance | Summary; Member Earnings; Faction Earnings; Payouts; OC ledger; Costs; Exports | OC accounting, not War accounting or physical inventory |
| Armory | OC Stock; Loans; Activity log; Member activity, including member drilldown | Physical faction items, shortages, loans and inventory transactions |
| Consumables | Periods, usage pulse, member filters/list, category totals | Usage counters over time; missing coverage stays explicit |
| War / Battle | Battle overview; Contracts; Score planner | Current opponent, target assignments and score planning |
| War / Reports | War report; Drug usage; Multi-war; Raffle; Guide | War-scoped participation, resources and derived reporting |
| Config / Legend | Settings, diagnostics and explanatory material | Global controls remain in the header |

No business logic was relocated between renderers. Internal tab IDs and saved subtab keys remain stable. Finance (`money`) is restored to the main navigation; old profit/finance preferences route there and old items preferences route to Armory. An earlier cleanup intentionally hid Finance but retained its DOM because finance computation feeds other views. This pass restores access without splitting that computation.

## Crimes visual changes

Compact page introduction and purpose copy for each view. Current-workload metrics stay above the subviews and are explicitly labeled as current data, including when reviewing history. Cross-links lead to People / Blocked, Armory, and Finance / Summary. Existing assignment renderers, card logic, collapse handlers and history calculations are preserved. New introductions are hidden in member mode and restored in faction mode.

Existing classic-shell theme tokens, typography and compact density are retained. Mobile navigation uses three columns; actions have 44px minimum touch heights. Empty next-operation banners no longer leave a blank bordered strip. No remote fonts, images, new API requests or background refreshes.

## Verification

The production shell and tab logic ran in isolated Brave with synthetic content. Verified every main tab and static subtab, persisted Finance selection, cross-links, and keyboard activation of lazy loaders. Screenshots at 1920x1080, 390x844, 430x932 and 844x390 showed no page overflow; desktop/mobile screenshots reviewed. Fixture browsers closed automatically; no user's browser resized.

Syntax, classic UI feature-parity checks, diagnostics, lifecycle, memory lifecycle, Consumables baseline, PDA storage and Armory category/fetch tests passed. Armory and War retain their dedicated browser regression tests. The classic-shell test now reads production navigation rather than duplicating an outdated six-tab fixture.

Authenticated Torn, actual native PDA, fully populated Finance reports and all dynamic War view interactions were not newly verified. This is a navigation/presentation pass, not a claim that every underlying feature has been end-to-end audited. Medical live verification remains pending browser authorization; no authenticated access was attempted here.
