# War Contracts Hub changes

## 1.2.0 — 2026-10-16

- Copies confirmed deals into the main War Contracts table as well as Script Contracts.
- Reuses compatible member rows and preserves private stats, second targets, manual values, formulas and annotations.
- Recovers interrupted main-table writes without duplicating confirmation; My Deal shows pending conflicts and a retry button. Earlier confirmed current-war deals recover on their owner's board refresh.
- Combines compatible main/audit pairs in Current Contracts while retaining differing manual edits.
- Requires the updated Apps Script service.

## 1.1.0 — 2026-10-16

- Replaces the long Connection form with member/sheet status, war details and expandable settings; removes the consent checkbox.
- Automatically loads the configured sheet and detects the ranked war on opening with an approved key, while respecting inactive tabs and coalescing requests.
- Shows the detected opponent, Scheduled/Active/Ended status and TCT start; new invitations and deal-time defaults use the war details without replacing edits.
- Fills only genuinely blank D6/E6 sheet headers. Existing values, placeholders, formulas and manual contract rows remain untouched. Requires the updated Apps Script service for timing/header support.

## 1.0.4 — 2026-10-16

- Names the failed provider and HTTP status when a matching or sheet request is rejected, without exposing keys, addresses or upstream response bodies.
- Explains how to resolve an FFScouter unregistered-key response and distinguishes it from Torn permissions and sheet deployment failures.

## 1.0.3 — 2026-10-16

- Uses GPL-3.0 to match the published OC Suite, with full license text included in the source package and ZIP.
- Adds direct ZIP and quick-start links to the package overview.

## 1.0.2 — 2026-10-16

- First public release, with GitHub installation and update feeds.
- Finds manageable med-out partners using the member's own stats/gear and FFScouter estimates.
- Detects the scheduled/current ranked war and opposing faction automatically.
- Hides existing manual contracts and pending contacts, and rechecks before saving.
- Provides editable invitations to copy/send manually and requires agreement/stripping confirmation before saving a contract.
- Includes searchable Current Contracts and Hub 1.6+ private credential integration.

Live authenticated contract reads and manual duplicate protection were verified on the test workbook. Live recommendations for an unpaired member and physical-phone execution remain to be verified.
