# War Contracts Hub

A separate member userscript using the existing Torn Script Hub adapter, shared window, themes and permissioned API-key manager. It does not change OC Suite or other installed tools.

[Download the complete ZIP](https://github.com/iiSatomi/torn-scripts/raw/refs/heads/main/war-contracts/releases/Torn_War_Contracts_Hub-1.4.1.zip) · [Step-by-step setup and usage guide](QUICKSTART.md)

## Install

1. [Install War Contracts](https://raw.githubusercontent.com/iiSatomi/torn-scripts/main/war-contracts/dist/Torn_War_Contracts_Hub.user.js) alongside **[Torn Script Hub 1.6.0 or later](https://greasyfork.org/en/scripts/600221-torn-script-hub)**. Replace any manually installed War Contracts entry instead of keeping duplicate copies. The 1.5.0 key manager cannot supply this script's Hub credential context; update Hub from its existing official release before connecting.
2. Open **Hub → War Contracts → Settings**.
3. Under **Connection settings**, enter the faction's deployed contracts-service `/exec` address once. The sheet link itself is not a service address.
4. Approve this script in **Hub → API Keys**. Before Hub enrollment, a personal key can instead be used for this page session. After enrollment, missing/revoked Hub access pauses the connection rather than silently switching to a personal key.
5. Choose **Save and reconnect** after editing settings. After setup, opening War Contracts automatically loads the configured sheet and checks the ranked war; no consent checkbox is required.

Use a custom Torn key with **User battlestats**, **User equipment**, **Key info** and public **Faction members**, **Faction wars** and **Faction rankedwars**. Register the estimate key with FFScouter; a separate FFScouter key is optional. A member can view Current Contracts without granting private battle-stat access. The key must identify the member logged into Torn.

The script bundles its Hub dependencies. No remote `@require`, npm installation or separate spy provider is needed by members. The Compact console has three task tabs and a Settings shortcut in its header. A default opening selects My Deal when you already have a contract or pending contact; explicit navigation remains selected. Match review selects one detail panel without reserving or making another API call. On a page without Hub, a fallback launcher opens the same window. Shared credentials require the Hub's supported userscript-manager/native PDA storage and WebCrypto capabilities.

## Member workflow

- **Settings:** Automatically load the saved sheet using your approved Hub key. See the opponent, Scheduled/Active/Ended status, war ID, start in TCT and hit cap. Service/key fields and API-use details are in expandable sections. Missing setup or a failed request offers manual reconnection instead of repeatedly retrying. Automatic loading does not fetch private stats, gear or FFScouter.
- **Matches:** Load your current four stats, modifiers and equipped gear plus the opposing roster/FFScouter estimates. Pick the equipped weapon you intend to use. Booked opponents and those already being contacted are omitted.
- **Reserve and prepare message:** The service checks current manual entries and claims both sides before showing the invitation. New invitations include the detected opponent and start; the coordinated-time field defaults to the detected TCT start. Availability is left for the member to enter. Edits and recovered agreement terms are preserved. Edit/copy the message and send it yourself.
- **My Deal:** Mark the invitation sent, release your pending contact, or review the agreed hit count, TCT window/time, Warlord requirement and notes. An explicit agreement/stripping attestation and final preview confirmation are required before saving.
- **Cancel deal:** In My Deal, cancel your own confirmed or manually entered contract. Review the named opponent, tick the cancellation confirmation and choose Confirm cancellation. Keep deal closes the panel without a request. The service removes the active main-sheet pairing and marks its history Cancelled; tell the opponent yourself. Members cannot cancel another member's deal.
- **Contracts:** Search compact rows of manually entered and script-confirmed contracts, along with pending contacts. Expand a row for notes and profile links. Refresh reads the sheet again. Existing notes and targets are displayed without being overwritten.

Confirmed deals append to **Script Contracts** and also fill the main **War Contracts** table. The service reuses your compatible unassigned member row or an unused row, filling only blank public contract cells. Existing values, formulas, annotations, private stats (E) and second targets (I) are preserved. Conflicts leave the confirmed audit record intact and show **Main sheet update pending**; review the manual row, then use **Retry main sheet sync**. A refresh also recovers your previously confirmed current-war deal. A completed copy never rewrites later manual edits. For a scheduled/current war, the service fills the opponent (D6) and TCT start (E6) headers only when genuinely blank. Existing text, including `-`, and formulas are preserved. Shared reservations live in **Script Contract Registry**. That service-owned tab must not be edited as a substitute for the member actions. Pending invitations do not expire silently, which avoids a new member messaging someone still considering an earlier invitation. Release an abandoned pending contact explicitly.

Cancellation preserves your name, private stats, the other target and its shared terms, formulas, cell annotations and changed manual values. Only the matching target and unchanged matching public terms are cleared. Cancelled records are hidden from active Contracts. Interrupted cancellation stays booked until recovery completes; use Check saved state. If the target-clear result is uncertain and the same pair is present, cleanup stops for coordinator review so a renewed deal cannot be erased.

If a save times out or the result is uncertain, use **Check saved state**. The board recovers completed writes and existing reservations; do not send another invitation just because a network call failed. The service rejects conflicts introduced manually after the reservation. Direct manual edits cannot acquire an Apps Script lock; conflicting external edits are detected on the next read. Unrecorded private agreements cannot be discovered by the tool.

## What the estimates mean

Fair-fight uses the two players' battle-stat scores and is capped at 3 for respect. Baseline war respect uses defender level, the war multiplier and the selected weapon's Warlord percentage. Chain/faction/other situational bonuses are not assumed. More difficulty above the fair-fight cap is not counted as extra respect.

Difficulty is a conservative ordering heuristic using the member's actual stat build/modifiers, weapon damage/accuracy and armor context, assuming the other player strips. It is not a combat simulator or a win percentage. A hard independent BSS ceiling and an offensive-capacity check reject extreme gaps and misleading defensive builds. Unknown or very old estimates are excluded; older usable estimates are labelled and downweighted. When only total-stat estimates exist, the conversion to BSS is labelled approximate. Gear does not change the fair-fight calculation.

Public FFScouter BSS is preferred with its corresponding timestamp/total estimate. The API can include other data, but no separate spy service is queried or required. Source references: [Torn API schema](https://www.torn.com/swagger/openapi.json), [Torn respect rules](https://wiki.torn.com/wiki/Chain), [FFScouter fair-fight model](https://ffscouter.com/guides/fair-fight-explained).

## Sheet service setup

See [service/README.md](service/README.md). The bound Apps Script needs the workbook owner to authorize Sheets/external-request access and deploy the web app. Configure our faction once; Torn's current-war API automatically identifies the scheduled/current ranked war and opponent when the board loads. Before every mutation the service rechecks Torn, bypassing its brief board cache. An old-war request is rejected if the war has changed. With no current ranked war, the latest ended war remains readable with writes disabled. The manual opponent heading must match the detected faction name, so a stale manual sheet cannot silently become the new war's board.

The Google authorization surface may request broader spreadsheet access because the web app opens its bound workbook by ID. Review that grant before deployment; the code limits its operations to the configured workbook. The script sends the member's Torn key to this configured service when opened with a configured service and approved key; API-use details remain available on Connection. The service authenticates with Torn and does not store the raw key. Sheet output contains public player identities and contract terms, never private stats, gear or API responses.

Personal fallback keys and private matching data stay in memory. Only harmless settings/window geometry are stored by this package. The existing Hub credential subsystem separately owns its private identity and enrollment records. No API keys are exported, inserted into visible inputs, or included in public Hub messages.

## Build and verify

From the repository root, using its existing shared Hub source modules:

```text
node war-contracts/tools/build.cjs
node war-contracts/tools/check.cjs --browser
```

The checker builds only this package. Tests run syntax checks first, then focused domain/HTTP/service tests, then real isolated Brave browser tests. Browser tests execute the actual service state machine against synthetic sheet dependencies and the actual generated Hub bundle for key grants/rotation, missing-Hub enrollment and simulated native PDA lifecycle. Four viewport checks cover 1920×1080, 390×844, 430×932 and 844×390. Every launched test browser closes in `finally`.

Fixture verification does not prove authenticated live Torn accuracy, native phone execution, Google OAuth authorization or a deployed live endpoint. These require separate integration checks. Generated distribution files belong to the builder; edit `src/` and `release.json` instead.

## Publication and updates

GitHub installs check the sibling `.meta.js` feed and download the generated `.user.js` above. Greasy Fork installs update through Greasy Fork. This package is published separately from the existing Hub/Payout managed release workflow: change its own `release.json`, build and verify this package, then publish only its reviewed files. Bundled shared Hub dependencies already exist in this repository. No service address, workbook ID, Torn key or faction credential is embedded in the installable script; members configure their faction service after installation.

This first public release is in testing. Authenticated service reads, automatic war detection and manual duplicate blocking were verified with the test workbook. Live matching for an unpaired desktop member has also been verified; simulated browser tests cover the full reservation and confirmation flow. Publishing does not switch the configured service from the test workbook to the live sheet.

For rollback, restore the last verified source, increase the package version and republish a verified build at the same paths. Do not lower versions or change its namespace. Disable the script while investigating any unexpected reservation or write behavior.

## License

Copyright 2026 iSatomi. War Contracts is distributed under the GNU General Public License version 3, matching the OC Suite's `GPL-3.0` metadata. See [LICENSE](LICENSE) for the full terms.
