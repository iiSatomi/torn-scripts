# War Contracts tab — design

**Date:** 2026-08-13  
**Script:** `Torn_OC_Suite_PurrfectCrime.user.js`  
**Status:** Proposed; implementation awaits review

## Goal

Overhaul the native War tab into a **War Command** workspace: a Command landing for immediate decisions, a `📜 Contracts` deal board for negotiated ranked-war med-out pairs, and a `🧮 Planner` for bilateral respect/hit/end-time estimates. Contracts automatically uses the opponent in the selected ranked war and recommends reciprocal member-to-member pairings. A good recommendation must make both directions plausibly hittable and worthwhile for respect; it must not optimize only Frostbite's return.

## User workflow

1. Select the ranked war already used by War Report.
2. Open Contracts and press **Load estimates**.
3. The script reads both rosters, fetches/caches FFScouter estimates, then shows Frostbite member profile cards with PFPs.
4. Each card shows its battle-stat estimate and the best currently-unreserved enemy candidates.
5. Each candidate shows both members' estimates, estimated respect in both directions, Warlord scenarios, confidence, and an explanation.
6. Pressing **Pair** reserves that enemy globally. The candidate disappears from every other card and appears on the Confirmed deals board. **Unpair** restores it.
7. Copy the confirmed board as a Discord-ready contract proposal.

No game action is automated. Pairing is local planning state only and never attacks, meds, or confirms anything in Torn.

## Data and provenance

### Roster and status

- Use the opponent of the current selected ranked war; no faction picker.
- Fetch each faction's roster/status using the existing Torn API request layer.
- Exclude unavailable members by default (federal jail, travelling/abroad, inactive status); allow a visible inclusion toggle rather than silently deleting them.

### Stat and fair-fight estimates

- Use FFScouter's existing batch `get-stats` endpoint for both rosters.
- Reuse the established `ocs_ff_key` setting and 24-hour `ocs_spy_cache` model.
- Store only estimated battle stats, FF estimate, source, and fetch timestamp. Never store image bytes.
- Missing or stale estimates render `Unknown`, reduce ranking confidence, and do not fabricate a viable matchup.

### Respect projections

The baseline is the existing War Tools model:

`base(level of defender) × FF(defender) × ranked-war modifier`

For every candidate, display:

- **Our hit on them**: base expected respect.
- **Their hit on us**: base expected respect.
- **Warlord projections**: base, +15%, +17%, and +19%, shown as scenario values for both directions.
- **Perk adjustment**: the current faction war/respect perk is applied only when it can be read from authoritative faction data and is labelled with its source/value. If unavailable, the UI says `Faction perk unknown — not applied`; it never assumes a bonus.

The projections are estimates, not promises: chain state, temporary modifiers, and live game conditions can alter the actual award.

## Pairing score

For our member A and enemy B:

1. **Reciprocal viability (highest priority):** compare each member's FFScouter battle-stat estimate against the other. Strongly penalize a pair where one return hit is implausible. If either estimate is absent, classify viability as Unknown rather than Safe.
2. **Mutual respect:** score the lower of the two base respect projections first, then the pair's combined total. This avoids a deal that is lucrative for one side but poor for the other.
3. **Balance:** penalize extreme respect and stat asymmetry.
4. **Availability:** unavailable opponents do not receive automatic recommendations.
5. **Confidence:** high when both FF and battle-stat estimates are fresh; partial when one is missing/stale; unknown candidates appear only in an explicit lower-priority section.

The UI shows the score components in plain language: `return hits likely`, `balanced respect`, `high return`, `one-sided`, or `insufficient estimates`.

This is recommendation—not a prediction of battle RNG. It never calls a matchup guaranteed.

## UI

### Command landing

- `⌂ Command` becomes the default War view; Report remains available as deep analysis.
- It shows the selected opponent, both respect goals, expected timeout/end date, estimated required hits for both sides, confirmed-contract count, and clear entry points to Contracts and Planner.
- The War navigation becomes `Command · Contracts · Planner · Report · Drugs · Multi-war · Raffle · Guide`.

### Planner

- Inputs: target respect for Frostbite and target respect for the opponent, plus an editable hits/hour override for each side.
- Default pace: derive each side's average hits/hour from recent compatible cached ranked-war reports. If no trustworthy history exists, show `Unknown — enter pace`; never invent a rate.
- Respect/hit default: derive from cached completed-war reports for that side where available, else aggregate current FFScouter opponent/own-roster baseline estimates and label it estimated.
- Outputs: estimated hits needed for each faction and expected calendar end/time (`now + max(hours needed by each side)`), with the slower side identified as the limiting side. It is a forecast, not an official Torn timer.
- For each projection display base, Warlord +15%, +17%, and +19% scenarios; the selected scenario drives the headline forecast. Both sides have independent target inputs.

### Contracts tab

- Header: selected war/opponent, count of available members, FFScouter freshness, load/refresh control, and availability toggle.
- **Our members:** cards with PFP/initial fallback, level, estimated battle stats, FF, and 3 ranked enemy recommendations.
- **Recommendation rows:** opponent PFP/name/level/estimated stats, both-direction respect rows, Warlord scenario strip, confidence, rationale, and Pair action.
- **Confirmed deals:** reserved pair cards with the two-way projections and Unpair action. Includes a Copy for Discord button.
- Clear empty/error states: no selected war, no FFScouter key, failed roster load, no viable matches, or partial results.

The UI reuses the Armoury PFP fallback/cache strategy and does not use the abandoned parallel v6 shell.

## State and persistence

- Local storage key scoped to the selected war ID: pairings survive a tab re-render/reload but cannot leak into another war.
- State contains only `{ ourMemberId, enemyMemberId, createdAt }` and never API/FFScouter keys.
- Pair uses a uniqueness guard for both sides: one enemy can only appear in one deal; each Frostbite member can only have one confirmed partner. Re-pair replaces only after explicit confirmation/unpair.

## Testing

1. Unit-test the pure estimator/scoring functions with complete, partial, and absent estimates.
2. Browser test with real selected-war data:
   - Command is the default and links into all War tools;
   - Planner calculates bilateral hit count/end-time scenarios from controlled cached-history fixtures and preserves manual pace overrides;
   - renders contract card grid and PFP fallbacks;
   - verifies both-direction base/15/17/19 projections;
   - Pair removes that opponent from all remaining recommendations;
   - Unpair restores it;
   - confirmed-board copy is populated;
   - no console errors.
3. Verify the no-key/no-data states without performing any external game action.

## Deliberate exclusions for v1

- No automatic contracts or external communication.
- No auto-attacking, medding, or Torn UI confirmation.
- No manual enemy-faction selector.
- No assertion that an estimate guarantees a hit or respect amount.
