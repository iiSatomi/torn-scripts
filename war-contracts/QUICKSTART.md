# War Contracts Hub — start here

This release is in testing. Keep using a copy of your contracts workbook until your faction has verified the whole workflow. Match ratings are estimates, not guaranteed wins.

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

1. Make a test copy of your contracts workbook. Preserve the `War Contracts` tab and its layout; see the service guide for the exact columns. I6 must contain your maximum hit count. Blank D6 (opponent) and E6 (TCT start) headers fill from Torn automatically; existing values, `-` placeholders and formulas are retained. A populated opponent heading must match the detected war.
2. Open the copy's **Extensions → Apps Script**. Paste `war-contracts/service/Code.gs`, save, and reload the workbook.
3. Choose **War Contracts Service → Configure faction service** in the workbook. Enter your own public faction ID. Setup creates `Script Contracts` and `Script Contract Registry`; existing manual values are preserved.
4. In Apps Script choose **Deploy → New deployment → Web app**. Run as the workbook owner, grant the required Google access and select access that lets faction members call the endpoint. The service independently verifies each caller's Torn key and faction.
5. Share the resulting `/exec` service address with your faction. The spreadsheet link is not the service address. No fixed war or opponent ID is needed: the service detects the scheduled/current ranked war through Torn.

Review Google's permission grant before accepting it. Publishing changed Google code requires a new deployment version; updating the userscript alone does not update the service.

## Members: install and connect

1. Install Torn Script Hub 1.6.0 or later and the War Contracts userscript in your userscript manager. Replace older entries rather than enabling duplicates. Reload Torn.
2. Create/use your own Torn custom key allowing **User battlestats**, **User equipment**, **Key info** and public **Faction members**, **Faction wars**, **Faction rankedwars**. Register the key used for estimates with FFScouter. Current Contracts alone does not need private battle stats.
3. In **Hub → API Keys**, assign and approve your Torn key for War Contracts. Keep your key private.
4. Open **Hub → War Contracts → Connection**. Expand **Connection settings**, paste your faction's `/exec` address once and choose **Save and reconnect**. Later openings automatically load the configured sheet and ranked war with your approved Hub key. The key must belong to the member logged into Torn.
5. Open **Current Contracts** to check existing manual/script deals. If you already have a contract, **My Deal** shows it and new matching is blocked.

## Find and record a deal

1. Open **Find Partner → Find my matches**. Select the equipped weapon you intend to use. Recommendations assume the opponent removes weapons and armor. Unavailable, already paired, pending and extreme-gap opponents are hidden.
2. The Connection page shows the detected opponent, war status and TCT start. New deal drafts use that start time, but remain editable. Select a partner and reserve the contact. The service rechecks the sheet before claiming either side.
3. Edit/copy the suggested invitation and send it yourself through Torn. The script does not send messages or perform attacks or medical actions.
4. In **My Deal**, mark the invitation sent. When both players agree, enter the hits, TCT window/time, Warlord requirement and notes. Confirm the agreement and stripping, review the preview, then confirm saving.
5. The confirmed deal appears in **Script Contracts**, the main **War Contracts** table and **Current Contracts**. Only blank compatible public cells are filled; stats, second targets, existing values and formulas are preserved. Release an abandoned pending contact explicitly so the players become available again.

If saving times out, use **Check saved state** before retrying. An uncertain request may already have saved; do not send a second invitation. If a manual entry appeared meanwhile, the conflict is rejected rather than overwritten.

If the main-table copy is pending, the deal is still confirmed in Script Contracts. Review any conflicting manual entry, then use **Retry main sheet sync**. Refreshing also copies your earlier confirmed current-war deal if needed. Completed copies do not replace later manual edits.

## Common issues

- **No Hub key:** update Hub to 1.6.0+, check the normal API-key assignment/approval, then reload Torn. Keys are never embedded in this download.
- **Already paired:** inspect My Deal or Current Contracts. Ask your sheet coordinator to resolve an incorrect manual entry; the script cannot overwrite it.
- **FFScouter HTTP 401:** the exact estimate key must be registered at [FFScouter](https://ffscouter.com). Enter an existing registered key under Connection settings if different from your Hub Torn key, then choose Save and reconnect. Separate estimate keys last for this page session.
- **No suitable matches:** check FFScouter registration, key scopes and estimates. The safety ceiling deliberately excludes unsuitable targets.
- **Opponent heading/configuration error:** ask the owner to update the test sheet's opponent heading to match Torn's detected war. Do not hard-code war IDs.
- **War changed or ended:** refresh the board. Old-war writes are blocked; an ended war can be viewed read-only.

GitHub-installed copies check the GitHub update feed. Greasy Fork-installed copies update through Greasy Fork. For developers, run `node war-contracts/tools/build.cjs` and `node war-contracts/tools/check.cjs`; browser checks additionally need Playwright and a browser executable via `TORN_BROWSER`.
