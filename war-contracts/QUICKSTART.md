# War Contracts Hub — start here

Set up the faction service before distributing the member script. Verify the workflow on a disposable copy before making real agreements. Match ratings are estimates, not guaranteed wins.

## What is in the ZIP?

- `war-contracts/dist/Torn_War_Contracts_Hub.user.js`: the member script to install.
- `script-hub/dist/Torn_Script_Hub.user.js`: Script Hub, required for shared API keys. Update an existing Hub instead of installing a duplicate.
- `war-contracts/service/Code.gs`: the Google Sheets service for the workbook owner.
- `war-contracts/README.md`: features, matching assumptions, privacy and development instructions.
- `war-contracts/service/README.md`: sheet layout, deployment and service details.
- Source, tests and the shared modules needed to rebuild this version.
- `war-contracts/LICENSE`: the GPLv3 license terms, matching the OC Suite's GPL-3.0 license.

The ZIP contains no account configuration, service address, workbook ID or working API keys. Do not paste a key into a source file or share one in a contract note.

## Workbook owner: one-time setup

1. Make a test copy of your contracts workbook. Preserve the `War Contracts` tab and its layout; see the service guide for the exact columns. I6 contains your maximum hit count; setup uses 30 only if that cell is genuinely blank. Existing values and formulas are kept. Blank D6 (opponent) and E6 (TCT start) headers fill from Torn automatically; existing values, `-` placeholders and formulas are retained. A populated opponent heading must match the detected war.
2. Open the copy's **Extensions → Apps Script**. Paste `war-contracts/service/Code.gs`, save, and reload the workbook.
3. Choose **War Contracts Service → Configure faction service** in the workbook. Enter your own public faction ID. Setup creates `Script Contracts` and `Script Contract Registry`; existing manual values are preserved.
4. In Apps Script choose **Deploy → New deployment → Web app**. Run as the workbook owner, grant the required Google access and select access that lets faction members call the endpoint. The service independently verifies each caller's Torn key and faction.
5. Share the resulting `/exec` service address with your faction. The spreadsheet link is not the service address. No fixed war or opponent ID is needed: the service detects the scheduled/current ranked war through Torn.

Setup leaves existing player/contract rows unchanged.

Review Google's permission grant before accepting it. Publishing changed Google code requires a new deployment version; updating the userscript alone does not update the service.

## Members: install and connect

1. Install Torn Script Hub 1.6.0 or later and the War Contracts userscript in your userscript manager. Replace older entries rather than enabling duplicates. Reload Torn.
2. Create/use your own Torn custom key allowing **User battlestats**, **User equipment**, **Key info** and public **Faction members**, **Faction wars**, **Faction rankedwars**. Register the key used for estimates with FFScouter. Current Contracts alone does not need private battle stats.
3. In **Hub → API Keys**, assign and approve your Torn key for War Contracts. Keep your key private.
4. Open **Hub → War Contracts → Settings**. Expand **Connection settings**, paste your faction's `/exec` address once and choose **Save and reconnect**. Later openings automatically load the configured sheet and ranked war with your approved Hub key. The key must belong to the member logged into Torn.
5. Open **Contracts** to check existing manual/script deals. If you already have a contract, the default opening goes to **My Deal** and new matching is blocked. Expand a contract row for its notes.

## Find and record a deal

1. Open **Matches → Find my matches**. Select the equipped weapon you intend to use. Recommendations assume the opponent removes weapons and armor. Unavailable, already paired, pending and extreme-gap opponents are hidden.
2. The Connection page shows the detected opponent, war status and TCT start. New deal drafts use that start time, but remain editable. Review a partner in the comparison table, then choose **Reserve and prepare message**. Selecting Review alone does not reserve anyone. The service rechecks the sheet before claiming either side.
3. Edit/copy the suggested invitation and send it yourself through Torn. The script does not send messages or perform attacks or medical actions.
4. In **My Deal**, mark the invitation sent. When both players agree, enter the hits, TCT window/time, Warlord requirement and notes. Confirm the agreement and stripping, review the preview, then confirm saving.
5. The confirmed deal appears in **Script Contracts**, the main **War Contracts** table and **Current Contracts**. Only blank compatible public cells are filled; stats, second targets, existing values and formulas are preserved. Release an abandoned pending contact explicitly so the players become available again.

If saving times out, use **Check saved state** before retrying. An uncertain request may already have saved; do not send a second invitation. If a manual entry appeared meanwhile, the conflict is rejected rather than overwritten.

If the main-table copy is pending, the deal is still confirmed in Script Contracts. Review any conflicting manual entry, then use **Retry main sheet sync**. Refreshing also copies your earlier confirmed current-war deal if needed. Completed copies do not replace later manual edits.

## Cancel your own deal

Open **My Deal → Cancel deal**, check the opponent, tick **I confirm cancelling this deal**, then choose **Confirm cancellation**. This works for your own script-saved and manually entered contracts in the current war. **Keep deal** closes the panel without changing anything. Tell the opponent yourself.

The active pairing is removed from the main sheet and Contracts view, while a Cancelled history entry remains in Script Contracts. Your name, stats, another target and its shared terms, formulas, annotations and changed manual values survive. Other members' contracts cannot be cancelled. Pending invitations use **Release pending contact** instead.

If cancellation is pending, use **Check saved state** before retrying. Players remain booked until cleanup completes. A conflict after an uncertain target clear needs the sheet coordinator to review/remove the original pairing, then refresh; the service refuses to clear a possible renewed agreement. Cancellation requires the updated Apps Script service as well as userscript 1.4.0.

## Prepare the next war

The service remembers which war the manual table belongs to. Before a new war, your coordinator should archive/review previous agreements, clear only completed old pairings and obsolete public terms, then clear the old opponent/start headers if they should auto-fill. Keep names/stats/formulas/formatting as needed. Existing pairings block rebinding even if you fight the same opponent again. Do not change MANUAL_WAR_ID to bypass the warning while stale pairings remain.

After the table is ready, opening the tool detects the new scheduled/current war and binds its empty table automatically. Ended wars are read-only, with fresh matching and deal actions disabled. An unused template may show the last ended war while leaving blank headers blank.

## Common issues

- **No Hub key:** update Hub to 1.6.0+, check the normal API-key assignment/approval, then reload Torn. Keys are never embedded in this download.
- **Already paired:** inspect My Deal or Current Contracts. Ask your sheet coordinator to resolve an incorrect manual entry; the script cannot overwrite it.
- **Torn key info API error:** check the assigned key is active. Errors 2/13/18 need a valid active account key; temporary/rate-limit errors should be retried later. The message names the failed selection and a safe code, without exposing your key.
- **FFScouter HTTP 401:** the exact estimate key must be registered at [FFScouter](https://ffscouter.com). Enter an existing registered key under Connection settings if different from your Hub Torn key, then choose Save and reconnect. Separate estimate keys last for this page session.
- **No suitable matches:** check FFScouter registration, key scopes and estimates. The safety ceiling deliberately excludes unsuitable targets.
- **Opponent heading/configuration error:** ask the owner to update the test sheet's opponent heading to match Torn's detected war. Do not hard-code war IDs.
- **Previous-war contracts warning:** ask the coordinator to archive/review and clear the previous pairings, then refresh. A rematch against the same faction still needs this reset.
- **War changed or ended:** refresh the board. Old-war writes are blocked; an ended war can be viewed read-only.

GitHub-installed copies check the GitHub update feed. Greasy Fork-installed copies update through Greasy Fork. For developers, run `node war-contracts/tools/build.cjs` and `node war-contracts/tools/check.cjs`; browser checks additionally need Playwright and a browser executable via `TORN_BROWSER`.
