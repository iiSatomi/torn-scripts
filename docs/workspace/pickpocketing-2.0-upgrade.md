# Pickpocket Helper 2.0

Scope: improve every existing feature while preserving the universal desktop/PDA distribution and saved attempts. No automatic game actions, API keys, external uploads, or invented XP rates.

Implementation order:
1. Correct outcome classification, missing readings, shared-face status queues, request correlation and pending-attempt lifecycle.
2. Versioned, deduplicated history; hydration-safe and serialized native persistence; CSV safety and JSON backup/restore.
3. Direct inline Targets / Insights / Settings navigation; optional native Torn presentation; search, tier/readiness filters, visible counts, explained highlights.
4. UTC periods, observation coverage, daily gains/losses, recent attempts, status-aware comparisons, sample-limited recommendations.
5. Source-backed regression tests, desktop/mobile browser interaction and layout checks, read-only live Torn smoke test.

Design: compact charcoal surfaces with restrained green/gold status accents, readable chart labels, 44px touch controls, no overlays or dependencies. Filters never prevent a game action. Native results remain available; compact feedback is bounded and does not remove Torn-owned result DOM.

Data semantics: visible CS is not hidden crime XP. Visible loot value is not net cash profit. Missing values stay missing. History is local and bounded; exports preserve retained observations. Recommendations describe observations, not verified odds, and need sufficient readable samples in the same target/status group.

References checked September 7, 2026:
- https://wiki.torn.com/wiki/Pickpocketing
- https://github.com/Manuito83/torn-pda/blob/master/userscripts/TornPDA_Storage.md
- docs/Torn-PDA-userscript-reference.md

## Release notes

- Direct inline Targets, Insights and Settings navigation with active-tab styling.
- Optional original Torn presentation; logging/Insights remain independently usable.
- Search by target/status, resettable filters, tier badges, zero-to-ten highlights and three advice goals.
- Status-aware comparisons require at least ten readable outcomes and 80% coverage. Safety ranking uses a Wilson lower bound rather than sorting tiny perfect samples first. Skill/value goals require adequate observed readings too.
- UTC today, rolling 7/30 days and retained-history views; fourteen-day gains/losses chart with accessible figures, outcome chart, coverage metrics and paginated recent attempts.
- Compact in-card and header feedback, explicit unread results, observed result text in history and exports.
- Fixed null-to-zero skill losses, delayed request association, unrelated DOM results, sibling loot-value capture, duplicate-face status shifts and virtual-row gaps.
- Native SQLite writes are serialized. A synchronous journal preserves unconfirmed attempts across tab closure. Hydration merges in-flight attempts. Clear markers prevent stale data resurrection, while explicit restores remain possible.
- UTF-8 CSV with spreadsheet formula protection; JSON merge/restore with stable IDs; documented PDA share handler, ordinary downloads and copyable fallback.
- Early network observation, singleton protection, native XHR JSON support, bounded rendering/history, initial PDA visibility detection and route cleanup.

## Verification

36 source-backed tests pass. Browser fixture coverage includes 1920×1080, 390×844, 430×932 and 844×390: interactions, export/restore, delayed capture, hydration, compact feedback, horizontal overflow, 44px touch controls, mode switching and navigation. Additional reliability and virtual-compaction checks pass.

Signed-in live Torn smoke checks verify native DOM, status responses, tier/status containment, both display modes and zero blank virtual gaps. No real crimes are submitted during tests. Native PDA sharing/storage are bridge-tested in a browser, not verified on a physical PDA install.

Limitations: results contain only visible observations; no hidden XP, assumed hospital duration, inferred cash profit or guaranteed target odds. Body type/skill progression are not controlled in historical comparisons. Retention is the newest 750 attempts. Use a single active logging tab; this is not a multi-device/account synchronization service. Back up before clearing storage or moving devices.

Install the 2.0 distribution as an update/replacement, with older copies disabled. The working source retains its historical 1.7 filename for existing test paths; its metadata is 2.0. The Downloads 1.6 original is untouched.
