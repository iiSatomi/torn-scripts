# War Contracts Hub changes

## 1.4.3 — 2026-10-19

- Consumes the existing Hub FFScouter provider instead of ignoring its configured estimate key. Approve War Contracts under both Torn and FFScouter when using separate keys.
- Keeps shared estimate keys in private memory, refreshes matching after key rotation and blocks fallback after Hub access is revoked. No Hub or Apps Script update is required beyond the 1.4.2 service.

## 1.4.2 — 2026-10-19

- Identifies safe Torn API error codes and failed selections without exposing keys or upstream messages.
- Rounds raw BSS and level base respect according to the documented model; rejects future-dated estimates.
- Keeps public FFScouter BSS and its timestamp together; merged spy-only data cannot become a public estimate.
- Updates unchanged generated invitations after hit/time edits while preserving member-edited messages.
- Binds manual sheet contracts to a war ID, protecting same-opponent rematches from old manual agreements.
- Allows unused blank sheets to view the last ended war; disables fresh matching for ended wars.
- Setup defaults only a genuinely blank hit cap to 30. Requires the updated Apps Script service.

## 1.4.1 — 2026-10-17

- Recognizes the current Torn sidebar Name row when its profile link has no accessibility label, restoring automatic connection. The Torn key must still match that unique logged-in member ID.
- Keeps the original labelled identity anchor supported. No further Apps Script update is needed beyond 1.4.0.

## 1.4.0 — 2026-10-17

- Adds Cancel deal in My Deal for your own confirmed and manually entered contracts, with named-opponent review and explicit confirmation.
- Removes the active main-sheet pairing and keeps Cancelled history; preserves identity, stats, the other target/shared terms, formulas, annotations and changed manual values.
- Enforces ownership, fresh war checks, exact manual snapshots and stable retries on the service. Interrupted cleanup stays blocking and cannot erase a renewed same-pair deal.
- Requires the updated Apps Script service. No messages are sent automatically.

## 1.3.0 — 2026-10-17

- Implements the selected Compact console: dense match comparison rows and one selected-player detail. Review does not reserve or fetch again.
- Moves Connection into the header Settings shortcut; three compact task tabs replace the large navigation buttons.
- Opens My Deal by default when paired, while preserving explicit navigation and drafts.
- Folds contract notes/profile links into expandable rows and separates message drafting from agreement review.
- Retains Hub themes, saved window geometry, touch targets and existing confirmation/sheet protections. No service update is required.

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
