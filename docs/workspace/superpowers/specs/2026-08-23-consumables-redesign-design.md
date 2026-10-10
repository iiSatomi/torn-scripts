# Consumables Tab Redesign

## Goal

Make the Consumables tab useful in the first phone-sized viewport while preserving the existing Usage Command data and settings flow. The page should answer two questions in order:

1. What usage deserves attention right now?
2. What is the supporting member history for the selected period?

This is a presentation-layer redesign. It does not change the Google Sheet contract, Torn API calls, local-storage keys, or the embedded Frostbite Usage Command data model.

## Design direction

Use the suite's existing dark navy and ice-blue visual language, but replace the equal-weight tile wall with an operations-oriented hierarchy:

- A compact “Usage pulse” header establishes the selected period and the current sync state.
- A small set of high-signal metrics gives a quick faction-level read.
- Attention rows surface the members driving the selected-period activity.
- The full member ledger remains available below, with search and sorting.
- A lightweight trend strip provides historical context without adding a new charting dependency.

The signature element is the “usage pulse”: one accent-led summary block that makes Xanax and total activity immediately legible, with the remaining categories treated as supporting signals rather than six competing cards.

## Layout

Desktop:

```text
┌ Consumables ─────────────────────────────── [Refresh] [Settings] ┐
│ Usage pulse · 7 Days                 [Lifetime] [1 Day] [7 Days] │
│                                                                  │
│  Xanax used       Total activity       Active members   Last sync │
│  184              322                  27               3:53 PM   │
│  [usage mix bars: Xanax · Alcohol · Drugs · Refills · Enhancers] │
├ NEEDS ATTENTION ─────────────────────────────────────────────────┤
│ Alex       42 Xanax       +18 this period                        │
│ Morgan     31 Xanax       +12 this period                        │
├ MEMBER USAGE ────────────────────────────── [Search] [Sort] ─────┤
│ Member                  Xanax  Alcohol  Drugs  Refills  Total     │
│ Alex                       42       8      3        2     55      │
│ ...                                                              │
├ TRENDS ───────────────────────────────────────────────────────────┤
│ category rows with compact period bars / deltas                  │
└──────────────────────────────────────────────────────────────────┘
```

Phone:

```text
CONSUMABLES                 [↻] [⚙]
7 DAYS  [Lifetime] [1 Day] [7 Days] [30 Days]

USAGE PULSE
184 Xanax · 322 total · 27 active
[compact category mix]

NEEDS ATTENTION
Alex       42 Xanax       +18
Morgan     31 Xanax       +12

MEMBER USAGE       [Search]
Alex                         55
Xanax 42 · Alcohol 8 · Drugs 3 · Refills 2
...

TRENDS
...
```

## Components and data flow

Keep `renderConsumables()` as the presentation entry point, but split its output into focused local render helpers:

- `renderConsumablesHeader(state)` — title, refresh, settings, sync state.
- `renderConsumablesPulse(state, fields, members)` — headline metrics and category mix.
- `renderConsumablesAttention(members, fields)` — top members for the selected period; hidden when there is no activity.
- `renderConsumablesLedger(members, fields)` — responsive member list/table, search, and sorting controls.
- `renderConsumablesTrends(state, fields)` — compact historical context derived from existing `periodValue()` data.

The existing `FBUSAGE` methods remain the source of truth: `getState()`, `STAT_FIELDS`, `PERIODS`, `periodValue()`, `setPeriod()`, and `refresh()`. Search and sort are UI state only and should not mutate the persisted Usage Command settings.

## Interaction rules

- Period selection updates pulse, attention, ledger, and trends together.
- Refresh keeps the current period, search, and sort state; it shows a busy label and restores the normal label in `finally`.
- Settings opens the existing suite Config section.
- Search is a labeled `type="search"` input and filters member names without an extra request.
- Sort offers at least `Total`, `Xanax`, and `Name`; the active sort is visibly indicated and keyboard accessible.
- On mobile, each member row shows the total first and the category breakdown beneath it; the desktop table is retained at wider widths.
- Attention is not color-only: rows include explicit text such as “highest Xanax usage” or “largest period increase.”

## States

- Loading: retain the shell and show compact skeleton rows or a clear “Updating usage…” status; do not flash an empty table.
- Configured with data: show the full hierarchy above.
- Configured with no usage: show a useful empty state explaining that the selected period has no usage and offering Refresh.
- Not configured: replace the current large blank card with a compact setup panel that explains the three required values and provides one clear “Open Settings” action.
- Error: keep the last successful content visible when available, show the error in a status region, and leave Refresh available.

## Responsive and accessibility requirements

- At 320px, no primary content may require horizontal scrolling.
- At 390px, the pulse and attention sections must fit without clipping; the ledger uses stacked rows.
- At 768px and above, the ledger may use a table and the pulse can expand into columns.
- Use existing semantic heading/card patterns and add `aria-live="polite"` to sync/error status.
- Every icon-only control has an accessible label and a visible focus state.
- Do not use red/green alone to communicate attention; pair accent color with labels or values.
- Respect `prefers-reduced-motion`; the redesign does not require animation.

## Performance boundaries

- No new external libraries, images, network calls, or persistent data structures.
- Render from the already available `FBUSAGE` state.
- Avoid rebuilding the full Usage Command floating shell; the native inline view remains the only visible Consumables UI.
- Use event delegation where practical so re-rendering does not accumulate listeners.

## Verification

- Existing syntax and unit-style tests remain green.
- Add focused presentation checks for period controls, empty/configured states, and mobile ledger markup where practical.
- Run the live smoke test on desktop and a 390px viewport.
- Confirm no new console errors.
- Capture before/after screenshots for the configured and unconfigured states.
- Check keyboard focus for period, refresh, settings, search, and sort controls.
