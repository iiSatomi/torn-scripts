# Medical and cross-category loans — Codex 9

## Findings and changes

- Medical was present in the old category table, but inventory fetching depended on types from current OC requirements. Once a medical OC finished, its category could disappear from the next fetch. Catalog lookup failures also silently routed unknown types to Utilities.
- Stock parsing assumed every response supplied `available`; quantity-only records became zero. Explicit `available` now wins (including zero). Otherwise numeric loan quantities are subtracted; ambiguous holder quantities do not become free stock. Counts are finite/nonnegative and item/holder IDs validated.
- One combined v1 inventory request replaces Utilities plus conditional per-category requests. Categories: utilities, armor, weapons, temporary, medical, drugs, boosters. Response/category metadata survives missing catalog data and is included in the existing loan snapshot.
- Native Consumables is separate from Boosters: Candy, Alcohol and Energy Drink map to Consumables. No unverified `consumables` v1 selection is sent. If a supported payload contains consumable types they are routed correctly; a separate `consumables` response key is also accepted. Live completeness of that v1 payload still needs authenticated verification.
- Unknown metadata stays unknown. Autofill uses visible tab state and exact item ID, searches other known visible item sections when necessary, and is bounded to eight pages per section / two minutes total. It does not promise to scan arbitrarily large inventories or unknown future section slugs.
- Visible rows only; Retrieve matches the exact holder. Missing/disabled Loan never falls back to Give or Use. A replacement intent cancels earlier polling. Loan prefill leaves final submission to the user.
- Medical and other supported sections receive inline OC status; Utilities retains its existing column. Ordinary non-OC faction gear is not newly marked for retrieval. The curated OC-item relevance list and grenade exemption remain unchanged.

## Sources

- [Torn API schema](https://www.torn.com/swagger/openapi.json): faction armory categories, item types, Medical/Consumable/Drug/Booster Loaning permissions.
- [Official Consumables wiki](https://wiki.torn.com/wiki/Consumables): Alcohol, Candy and Energy Drinks.
- [Official API documentation](https://staticfiles.torn.com/api.html): read-only API, v1/v2 selection distinction and request minimization.
- Workspace PDA reference: `docs/Torn-PDA-userscript-reference.md`. No new storage backend or background polling was added.

## Verification and limits

Passed syntax and category/parser tests; `armory-fetch.test.cjs` exercises production fetchAll with synthetic HTTP responses and no active OCs, proving medical loans and stock are retained with one inventory request.

Real isolated Brave fixtures exercise all eight native sections, stale Utilities-to-Medical discovery, duplicate intents, medical annotation idempotence, permission failure, member/quantity prefill and no loan submission. Tests run against localhost synthetic markup, never Torn; every test browser closes in finally.

Seven existing regression suites passed (diagnostics, lifecycle, consumables, memory lifecycle, loan endpoint, classic UI, PDA storage). The legacy loan-endpoint test targets the preserved original; the new fetch test covers Codex itself.

Authenticated Torn inspection was blocked by the browser authorization layer because connecting grants origin-wide access. No bypass attempted. Native PDA and current live medical markup/API payloads remain unverified; fixture success is not an authenticated end-to-end claim. User approval for that origin-wide connection is needed before a live inspection.
