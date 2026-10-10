# Pickpocketing Helper 1.7 — Responsive Redesign and Logic Audit

Date: 2026-09-01

## Goal

Produce a universal desktop/Torn PDA userscript that keeps the useful status-aware pickpocketing guidance while replacing the obstructive fixed settings panel with a compact inline interface. The change must also audit the decision logic, fully remove filtered target cards instead of leaving blank gaps, and verify the result in real desktop and mobile-sized browser layouts.

The original download remains untouched. Development targets a new workspace copy named `Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js`.

## Design direction

### Inline helper

Mount one compact `Pickpocket Helper` section immediately above the pickpocketing targets. The section is part of the page flow rather than fixed to the viewport, so it cannot cover Torn controls or target cards.

The collapsed row shows a concise summary such as `Ready only · Tier 3+ · Top 1` and a disclosure indicator. Activating the row expands the controls in place. The disclosure uses a semantic button with `aria-expanded`, a visible focus state, and keyboard support.

The expanded controls are:

- a touch-friendly Ready-only switch;
- six explicit minimum-tier choices, avoiding a tiny numeric field;
- minus and plus buttons around the highlighted-target count;
- a Reset action that restores the existing defaults.

Controls are at least approximately 44 CSS pixels on touch layouts. Text inputs are not required. The section uses Torn-compatible dark neutral surfaces, subtle borders, and the script's existing green, amber, red, purple, and gold only as semantic accents. It does not use gradients, heavy shadows, or hover-only behavior.

### Target presentation

Target names remain the primary content. On wide layouts, the tier, live status, verdict, and best-target marker may share one line. On narrow layouts, the name and compact badges wrap deliberately rather than producing an overlong rewritten sentence.

Color is not the only status cue: every visible target retains a textual verdict (`GO`, `WAIT`, `AVOID`, or `CAUTION`). The best target uses both a star label and a gold accent.

Filtered targets are hidden at the exact repeated target-card boundary. The script must not hide an arbitrary ancestor and must not leave an empty card, reserved grid slot, or blank target name. Removing a filter restores the card and any script-owned presentation without overwriting Torn's unrelated styles.

### Responsive behavior

The same interface is used on desktop and PDA. CSS layout responds to available width rather than treating PDA capability as a screen-size proxy.

Acceptance sizes are:

- desktop: 1920 × 1080;
- narrow mobile: 390 × 844;
- wide mobile: 430 × 932;
- landscape mobile: 844 × 390.

At every size, the script must cause no page-level horizontal overflow, cover no essential Torn control, keep the expanded settings content reachable, and preserve usable touch targets. Safe-area insets are respected when Torn's surrounding layout places content near an edge.

## Logic audit

The current `verdict()` table is an advisory strategy, not an official probability model. The audit will explicitly separate three kinds of information:

1. **Verified Torn mechanics** — the official wiki states that difficulty depends on pickpocketing skill, target type, body type, and current status; all 22 mark types are available from the beginning; smaller or distracted marks generally have higher success rates.
2. **Observed live data** — target names, icon identifiers, status values, build/body information, skill display, repeated-card DOM boundary, and the crimes-list response shape observed in the dedicated test browser.
3. **Community recommendations** — relative tiers and any exact skill cutoffs. These remain conservative guidance and are not described as guaranteed success thresholds.

Audit every one of the 22 mark types and every status encountered in the live response. Confirm that the name table matches Torn's current names, that the status-to-card association is stable for duplicate marks, and that no status is treated as favorable merely because its label sounds favorable.

The existing source captures `crimeInfo.muscular` but does not use it. The implementation may incorporate build/body data only if the live response exposes a stable meaning that can be matched reliably to the rendered target. If that evidence is insufficient, the UI and source comments must say that build is an unmodeled risk factor instead of pretending the verdict is complete.

Conservative fallback rules:

- an unknown target or unknown status is never promoted to `GO`;
- missing live status is shown as spawning/loading and is not ranked as ready;
- very difficult targets remain `AVOID` or `CAUTION` unless the audited rule has explicit support;
- a high skill value does not erase a source-supported exception such as Police Officer risk;
- `Tier` remains a relative difficulty rank and is never labeled as real XP or a true Torn level.

Research starting points:

- [Official Torn Pickpocketing wiki](https://wiki.torn.com/wiki/Pickpocketing)
- [Emforus pickpocketing guidance on Torn](https://www.torn.com/forums.php?a=0&b=0&f=3&p=threads&t=16396820)
- [Community unique/status evidence](https://www.torn.com/forums.php?a=0&b=0&f=61&p=threads&t=16358433)
- Workspace PDA reference: `docs/Torn-PDA-userscript-reference.md`

## Architecture and lifecycle

Keep one dependency-free userscript and one distribution file. Do not depend on `@require` because Torn PDA does not guarantee automatic loading.

Separate the script conceptually into small internal responsibilities even though it remains one IIFE:

- settings normalization and persistence;
- audited mark/verdict policy;
- live crimes-response ingestion;
- exact DOM target-card discovery;
- inline helper rendering and events;
- target decoration/filtering;
- route, visibility, and observer lifecycle.

The script may observe Torn's existing crimes-list traffic but must not add Torn API calls. A fetch hook must be installed only once and preserve the original fetch receiver, arguments, response, rejection behavior, and unrelated requests.

The route lifecycle must tolerate Torn SPA navigation. It mounts only on `#/pickpocketing`, creates no duplicate helper, and cleans up script-owned UI/decorations when leaving the route. Mutation observers and fallback work must not react to the script's own DOM changes in a feedback loop.

For PDA, use `tornpda:tabState` when available and document visibility as the desktop fallback. While inactive, suspend nonessential repaint polling and observer work. On return, perform one coalesced repaint without making a new network request.

The existing small synchronous settings may remain in `localStorage` for compatibility, using the current key and normalized defaults so version 1.6 preferences survive. No large or growing storage is introduced.

## Error handling

Malformed stored settings fall back to bounded defaults. Counts and tier values are clamped before use. Malformed or incomplete crimes responses are ignored without breaking Torn's fetch. A missing anchor or temporary empty target list is a recoverable SPA state, not a reason to create multiple timers or panels.

When live status is unavailable, the script keeps Torn's target visible unless the user explicitly filters it and communicates the unresolved state without inventing a verdict.

## Testing strategy

Implementation follows a red-green-refactor sequence.

Focused automated tests must cover:

- all 22 mark names resolve to the intended audited tier/policy;
- representative skill/status boundaries and conservative unknown fallbacks;
- missing status is not considered ready;
- settings migration, normalization, clamping, persistence, and reset;
- one inline helper with correct disclosure semantics;
- Ready-only and minimum-tier filters fully collapse and restore the exact card;
- duplicate target icons/status records are consumed deterministically;
- the fetch hook is singleton and transparent for unrelated traffic;
- script-owned mutations do not create an observer/repaint loop;
- route and hidden-tab transitions suspend and coalesce work without new API calls.

Static verification includes `node --check` and a source scan for secrets. Browser verification uses the dedicated test profile and a controlled local fixture first, followed by the live Torn pickpocketing route when the authenticated test context is available.

At 1920×1080, 390×844, 430×932, and 844×390, record screenshots and assert:

- the helper is inline and does not overlap targets;
- collapsed and expanded states fit the viewport;
- controls are reachable and respond to pointer/touch-sized interaction;
- no horizontal overflow is introduced;
- filtered cards leave no blank gaps;
- changing and resetting settings updates the summary and targets;
- leaving and returning to the route does not duplicate the helper;
- the browser console has no new script errors.

If a dedicated browser is launched, close only that exact test process.

## Out of scope

- Automating pickpocket attempts or clicking targets.
- Claiming exact success probabilities that Torn does not expose.
- Adding remote dependencies or making new API requests.
- Replacing Torn PDA native UI or producing a separate PDA-only distribution.
- Modifying the original file in `C:\Users\asato\Downloads`.

## Completion criteria

The work is complete only when the new 1.7 workspace userscript passes syntax and focused tests, the strategy audit is documented with verified versus advisory distinctions, responsive browser checks pass at all four viewports, filtered targets leave no blank cards, and a live Torn check confirms the script against the current page DOM and response shape.
