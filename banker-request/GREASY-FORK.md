# Torn Banker Request Hub

Request money from your faction vault without needing a Discord account. Choose an amount or **Full balance** and your faction's Cloudflare relay verifies your Torn account, checks your own faction balance, and posts a request mentioning the configured bankers in Discord.

**Your faction administrator must deploy its own relay first.** Installing the userscript alone does not connect you to a shared service. Fresh installations have no prefilled faction, Cloudflare address, API key or request amount.

## Features

- Compact request panel, with optional [Torn Script Hub](https://greasyfork.org/en/scripts/600221-torn-script-hub) menu, appearance and approved API-key sharing.
- Specific amounts and full faction balance requests; zero and over-balance requests are rejected before Discord is contacted.
- Account and faction verification, server-side request limits and duplicate protection.
- Banker-only review links, expiring after two hours, that can prepare Torn's native recipient and amount after checking the current visible balance.
- Bankers review and confirm payment themselves. The script never submits or confirms a transfer, and "Request sent" does not mean paid.

## Members: setup and use

1. Install this script in your userscript manager or Torn PDA. Disable older Banker Request scripts to avoid duplicate panels, then reload Torn.
2. Open **Banker Request** from Script Hub or the script's own launcher/menu. Open **Connection** and enter the HTTPS `workers.dev` relay address supplied by your faction administrator. Do not enter a Discord webhook URL.
3. Use your **own Torn API key** with User **basic, faction and money** selections (a custom key or Limited-access key). Either approve and assign the key to Banker Request in **Hub → API Keys**, or enter it in Connection. Personal keys stay in page memory unless you explicitly choose **Remember personal key on this device**.
4. Press **Connect**. Once verified, open **Request**, enter a positive whole-dollar amount or select **Full balance**, then press **Send request**. Full balance asks bankers for your full faction balance without posting the exact balance.
5. If delivery times out, use **Check previous request**. Do not repeatedly create new requests; ask a banker to check Discord if delivery remains uncertain.

Use digits or commas such as `5,000,000`; `5m` is not accepted. A balance below $1 blocks both request types. A request cannot exceed the balance returned by Torn's API at the time of the check.

## Bankers: review and pay

Bankers need the script, the same relay address, their own key and Torn's native permission to give faction money. Their Torn IDs must be authorized by the relay administrator.

Click the request link in Discord. With a connected key available, the script verifies banker access and opens **Review payout**. Regular members do not see that page. Open Torn's native **Give to User → Give money** panel; the helper can prepare the verified recipient and amount if the current visible balance supports the request. It preserves existing manual drafts and blocks preparation when required details cannot be checked.

**Review the recipient and amount yourself**, then use Torn's normal payment and confirmation controls. Expired requests and requests above the current balance are blocked. Manual edits and simultaneous banker activity can change the situation; Torn remains the final authority on the transfer.

## Other factions: administrator setup

The [complete setup guide and source](https://github.com/iiSatomi/torn-scripts/tree/main/banker-request) include the Worker, generic disabled configuration, tests and GPLv3 license.

1. Create a Discord channel webhook and choose a banker role. Collect your faction's Torn ID, the bankers' Torn player IDs and the Discord role ID. Torn IDs and Discord IDs are different.
2. Download the repository and follow [Administrator setup](https://github.com/iiSatomi/torn-scripts/blob/main/banker-request/README.md#administrator-setup--once-per-faction). Configure `banker-request/worker/wrangler.jsonc` with your Worker name, `FACTION_ID`, `BANKER_IDS` and `DISCORD_ROLE_IDS`. Keep `ENABLED` set to `"false"` during setup.
3. Deploy the disabled Worker. Add the webhook using Wrangler's interactive **`secret put DISCORD_WEBHOOK`** prompt. Never put the webhook into the userscript, configuration file, GitHub, Greasy Fork or a public message.
4. Enable and redeploy when configuration is complete, then give members only the deployed HTTPS relay origin. You do not need to edit or redistribute a faction-specific userscript.

Each faction operates and trusts its own relay. Member keys are sent over HTTPS to that relay and Torn for verification; use only a relay your faction trusts. The backend does not persist raw Torn keys or balances. Torn's money response includes additional wealth fields, which the relay ignores. Personal key storage depends on your script manager; Torn PDA compatibility storage is not encrypted.

## Request limits and troubleshooting

The relay permits one attempted notification per member per 60 seconds, at most 10 per faction per minute and 100 per hour, with additional API-attempt limits. Reloading or changing devices does not reset those limits. Failed and uncertain sends still consume notification limits.

- **User money permission needed:** update the personal or assigned Hub key to include User money.
- **No balance / amount exceeds balance:** check your current faction balance and lower the amount.
- **No banker access:** the administrator must authorize the banker's Torn ID and redeploy.
- **Connection failed:** check the faction's relay address and administrator deployment; never share your key in a support request.
- **Prefill blocked:** open Give to User / Give money, review existing drafts and current balances, or handle payment manually.

See the [full instructions and troubleshooting](https://github.com/iiSatomi/torn-scripts/blob/main/banker-request/README.md) or [report an issue](https://github.com/iiSatomi/torn-scripts/issues). Do not include API keys, webhook URLs, cookies or private balance screenshots in reports.

License: **GPL-3.0**. Desktop and responsive browser fixtures are tested; a physical Torn PDA device is not part of automated verification.
