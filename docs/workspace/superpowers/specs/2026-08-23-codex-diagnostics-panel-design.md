# OC Suite Codex diagnostics panel

## Goal

Give the user a compact, user-facing read-only view of the suite's API activity,
DOM footprint, timers, route state, and browser heap support. It should help
distinguish a suite lifecycle problem from a Torn/PDA browser problem without
exposing API keys, request URLs, query strings, or member data.

## Interaction

- The panel lives in the existing Config view.
- `Refresh diagnostics` takes one snapshot; there is no polling loop.
- `Copy safe report` copies a redacted JSON report containing only counts,
  statuses, timing, route path, and browser capability information.
- Memory is shown when Chromium exposes `performance.memory`; otherwise the UI
  explicitly says that the browser does not expose heap metrics.

## Snapshot fields

- Script version and time since the current page loaded.
- Current route and whether the OC Suite root is connected.
- Total document nodes, suite-owned node count, and visible root state.
- Known suite timer slots and whether each is active.
- API request totals, successes, failures, timeouts, and recent module-level
  outcomes. The recorder stores no URL or response body.
- Heap used/limit/percentage when available.

## Safety and performance

- No network request is made by the panel.
- No API key is read by the report builder.
- No automatic refresh or observer is introduced.
- DOM values are escaped before they are inserted into the panel.
- The recorder keeps a bounded recent-event list so diagnostics cannot become a
  new source of memory growth.

