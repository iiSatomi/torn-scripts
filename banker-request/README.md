# Torn Banker Request Hub

**Version 1.0.7 · public release, separate from the old Banker Request script.**

A compact panel in Script Hub lets faction members request an amount or **Full balance**, without a Discord account. A Cloudflare service verifies their Torn account, limits requests, and posts a banker-role mention with a link back to Torn. Bankers can verify that request and prepare the native money form. The script never presses Give money or the payment confirmation.

## What is included

- [Install from Greasy Fork](https://greasyfork.org/en/scripts/601376-torn-banker-request-hub), including a public description, how-to and troubleshooting.
- [Install from GitHub](https://raw.githubusercontent.com/iiSatomi/torn-scripts/main/banker-request/dist/Torn_Banker_Request_Hub.user.js). Optional [Script Hub](https://greasyfork.org/en/scripts/600221-torn-script-hub) integration provides the shared menu and explicitly approved key sharing; the banker panel can also run on its own.
- [Installable userscript](dist/Torn_Banker_Request_Hub.user.js) — import this file into your userscript manager or Torn PDA.
- [Cloudflare backend](worker/worker.mjs) and [deployment configuration](worker/wrangler.jsonc).
- [Backend reference](worker/README.md), source, focused tests and browser checks.

Fresh installs start with a blank relay address, API key and request amount. Nothing is preconfigured for a particular faction. Existing users keep settings they previously saved. The public ZIP contains install files, a generic disabled backend template, GPLv3 license, instructions, tests and build sources; it excludes local deployment profiles, setup history and verification reports. Extract it and start with `banker-request/README.md`.

## Administrator setup — once per faction

You need a Cloudflare account with Workers and SQLite-backed Durable Objects available, Node.js 24 or later for the command-line setup, and permission to manage a webhook in the intended Discord channel. Check your account's [Durable Object plan availability and limits](https://developers.cloudflare.com/durable-objects/platform/pricing/); no paid plan or subscription is purchased by these instructions.

### 1. Choose the Discord channel and banker role

1. In the desired server channel, open **Edit Channel → Integrations → Webhooks** and create a webhook. If an older script exposed a webhook URL to members, use a **new webhook** and revoke that exposed one.
2. Keep the webhook URL private. It will go into a Cloudflare **secret**, never the userscript or this configuration file. Do not paste it into chat, a shared document, or screenshots.
3. Create or choose a banker role and assign your bankers to it. Enable Discord Developer Mode, right-click the role and **Copy Role ID**. Configure the role/channel so the webhook can mention it. Discord members' own notification settings still control their notifications.
4. Collect each banker's **Torn player ID**. These are different from Discord role/user IDs. Bankers need the userscript installed and native Torn faction permission to give money.

### 2. Configure Cloudflare

Edit [worker/wrangler.jsonc](worker/wrangler.jsonc). Its zero values intentionally keep an incomplete configuration unusable:

| Setting | What to enter |
| --- | --- |
| `name` | A unique Worker name, for example `your-faction-banker-relay` |
| `FACTION_ID` | Your Torn faction ID, as a quoted string |
| `BANKER_IDS` | Comma-separated **Torn player IDs** allowed to review requests |
| `DISCORD_ROLE_IDS` | Comma-separated **Discord role IDs** to ping; usually one, at most ten |
| `ENABLED` | Keep `"false"` for the first deployment |

Leave the `BANKER_RELAY` binding, `BankerRelay` class name and `v1` migration intact. Their names must match the Worker source. The nonsecret IDs above may be shared; the webhook URL must not be added here.

Open PowerShell in `banker-request/worker` and run:

```powershell
npx --yes wrangler@4 login
npx --yes wrangler@4 deploy
npx --yes wrangler@4 secret put DISCORD_WEBHOOK
```

The login opens Cloudflare's authorization page. The first deploy creates a **disabled** service and its Durable Object. The secret command asks for the Discord webhook interactively; paste it only into that prompt. Do not put it on the command line. This uses the official [Wrangler setup](https://developers.cloudflare.com/workers/wrangler/install-and-update/) and [secret storage](https://developers.cloudflare.com/workers/configuration/secrets/).

Change `ENABLED` to `"true"`, then run:

```powershell
npx --yes wrangler@4 deploy
```

Copy the resulting relay origin, such as `https://your-faction-banker-relay.your-subdomain.workers.dev`. Give members that address. **The relay address is public routing information, not a password.** Possession of it does not authorize a request. You do not need a Google Sheet, Apps Script deployment, faction leader API key, Discord bot token, or individually issued member token.

Deployment sends no Discord message. Verify an account using the panel first. When you want an end-to-end test, explicitly send one small, clearly agreed request and confirm the bankers received it. Even then, the script does not make a payment.

### 3. Install the new userscript

1. **Disable the old Torn Banker Request userscript.** Do not run both versions: they use the same Hub shortcut ID. The old files are preserved in this workspace and are not automatically replaced.
2. Import [dist/Torn_Banker_Request_Hub.user.js](dist/Torn_Banker_Request_Hub.user.js) into Tampermonkey, Violentmonkey, or Torn PDA. Use the `.user.js` file, not the `.meta.js` file or internal source modules.
3. Reload a normal Torn page. Open **Script Hub → Banker Request → Connection**. Without Hub, use the **Banker request** button or the userscript manager's **Open banker request** menu command.
4. Enter the Cloudflare relay origin provided by your faction administrator, then configure your own key as below.

The default metadata permits `workers.dev`, which includes its subdomains using [Tampermonkey's documented domain syntax](https://www.tampermonkey.net/documentation.php?q=connect). Version 1.0.1 used an unsupported `*.workers.dev` entry that caused Tampermonkey to refuse the verification request. Update the installed script to 1.0.2 rather than just changing the address. For a custom relay domain, add only that host as another `@connect` entry in the installed script. The endpoint must be a public HTTPS origin with no path, port, query, credentials or fragment. Do not use Discord's webhook URL as the relay address.

## Member setup and use

1. Open **Connection** and enter the Cloudflare relay address supplied by your faction administrator.
2. **Using Script Hub:** save your own Torn key in **Hub → API Keys**, approve **Banker Request**, and select its assigned key. The script detects the approved key automatically; there is no additional Hub checkbox or key to paste. The personal-key field disappears once Hub manages the connection. Approval remains an explicit choice in Hub.
3. **Without Hub:** enter your own Torn API key with **User basic, faction and money selections**. A custom key with those selections, or a Limited-access key, is needed to send requests. The same requirement applies to your assigned Hub key. See Torn's [API key builder and documentation](https://www.torn.com/api.html). No full-access key, battle stats, faction roster or logs are needed. Banker-only review can still verify identity/faction with a public key. Leave **Remember personal key on this device** off for page-only memory, or opt in to saving through your script manager. Torn PDA compatibility storage is **not encrypted**.
4. Press **Connect** once. This saves the address and verifies your logged-in Torn account and faction. Your key travels over HTTPS to that relay and Torn. Before each new request, the relay reads your **own faction balance** from User money. That Torn selection also returns other wealth fields; the relay ignores those, returns none of them and stores neither the money response, your balance nor the raw key. Hub keys stay in private memory and never become saved personal keys. Once enrolled with Hub, removing approval or losing the Hub key pauses access instead of trying a saved personal key.
5. Open **Request**, choose a positive whole-dollar amount or **Full balance**, then **Send request**. A previously verified connection automatically re-verifies when the panel opens after a reload and an approved Hub key or explicitly remembered personal key is available. Verification does not ping Discord or prepare a payment.

Full balance sends the text **full faction balance**. It does not expose your balance to other members or trust a balance supplied by a requester. No Discord account is needed. The amount field accepts digits, a leading `$`, or conventional commas such as `5,000,000`; abbreviations such as `5m` are deliberately rejected. Amounts are limited to $1–$1,000,000,000,000.

A balance below $1 rejects both request types. A specific amount above your verified faction balance is rejected **before Discord is contacted**. Missing User money permission, API failure or an unreadable balance also blocks the request. These explicit rejections release the local pending draft so you can correct it. The check uses Torn's fresh API response; the banker checks the current native balance again before preparing payment.

**Request sent** means Discord confirmed receipt; it does not mean paid. If sending times out, use **Check previous request**. It reuses the same request ID and payload: if the relay already handled it, no new notification is sent; if it never arrived, the original request can be completed once. Do not create another request merely because delivery was uncertain. The pending request survives reloads, so reconnect with the same account and relay to check it. Unknown delivery requires checking with a banker; the backend never automatically resends it. Once the server reports that an old request expired, **Dismiss expired request** becomes available. Check Discord with a banker first, then confirm dismissal; this clears only the local pending marker, not server history or duplicate protection.

## Banker workflow and balance protection

Regular members see only **Request** and **Connection**. **Review payout** and the Hub review shortcut appear only after the current account is verified as a banker. Opening a Discord link with a connected key performs that verification automatically. Clearing verification hides the banker controls again; visibility never replaces the relay's banker/faction authorization checks.

1. Click the Torn link in the Discord notification. It opens faction **Controls** and the tool's **Review payout** page. Bankers need the userscript and the same relay configured.
2. With a previously connected key available, the link automatically verifies your banker access and resolves the request once. Otherwise, open **Connection** and press **Connect**, then return to the link. Links expire after **two hours**. A member cannot use a link to retrieve another member's request or balance.
3. The link waits briefly for native **Give to User → Give money** and prepares the verified recipient and amount automatically. If that panel is not open or contains a manual recipient/amount draft, it leaves your draft untouched and shows the reason. Open the panel, clear your draft if appropriate, then use **Check balance and prefill Torn form** to retry.
4. Every preparation checks the member's current visible balance row, faction, native selected-recipient label, native displayed balance, and matching amount-field balance attributes. It rejects missing, ambiguous, hidden, inactive, zero/negative, changing or edited records. A specific amount above the available balance is blocked. Full balance rounds the current balance **down to whole dollars**, retaining any cents. An older request that no longer fits the current balance stays blocked even if it was valid when sent.
5. When preparation succeeds, the tool minimizes and leaves Torn's native form prefilled. **Review the recipient and amount yourself**, then use Torn's normal Give money and confirmation controls.

The helper never presses native submission/confirmation buttons and never calls private Torn payment endpoints. While its prepared form is present, a changed recipient, amount, balance, expired request or inactive context blocks the guarded submit. Changing routes, hiding the browser/PDA tab or closing the browser page clears the helper-owned amount when it remains unchanged. The tool can be reopened from its **Restore Banker request** control.

If Torn changes its form or a balance cannot be verified, **nothing is prefilled**. The review page also provides **Copy member ID** and **Copy requested amount** for manual handling. A plain manually prepared form remains Torn's responsibility. The browser helper cannot guarantee a server-side atomic balance check across simultaneous bankers, enforce restrictions when the script is disabled, or determine whether a payment completed. Torn is the final authority on the actual transfer.

## Spam controls and administration

Limits are persisted together with request reservations in one Cloudflare Durable Object:

- One attempted notification per member per **60 seconds**.
- At most **10 notifications per faction per minute**, **100 per hour**.
- At most **10 API attempts per IP per minute**, plus **30 aggregate API attempts per minute**, before Torn verification. Repeated connections and request checks count too; wait instead of repeatedly clicking.
- Strict body/amount limits; fixed webhook destination; server-built messages; only configured banker roles may be mentioned. Requests cannot inject `@everyone` or arbitrary content.
- Durable duplicate protection across tabs, devices and Worker restarts. Failed and uncertain sends still consume limits.
- Identity proofs cached for at most **60 seconds**. Departed members or revoked keys can retain access until that short proof expires.

For an incident, change `ENABLED` to `"false"` and redeploy. To rotate the webhook, use `npx --yes wrangler@4 secret put DISCORD_WEBHOOK`; members do not need a different userscript. To change bankers, update `BANKER_IDS` and redeploy. Protect Cloudflare deployment access and keep request-body/platform logging disabled.

Request details retain for 24 hours; links expire after two hours. Permanent compact request-ID records retain owner ID, token and kind/amount fingerprint to prevent an old UUID ever becoming a new ping. At **100,000** records, new requests fail closed with `CAPACITY`. Plan a reviewed capacity/schema increase before that point. **Never delete/recreate the Durable Object, clear its idempotency records, or change faction routing to reset limits.** See [backend safeguards](worker/README.md#durable-safeguards-and-retention).

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Relay disabled / administrator setup needed | Check `ENABLED`, nonzero IDs, the Durable Object binding and webhook secret; redeploy. |
| Key not verified | Check the User basic/faction permissions and that it is your own account's key. |
| User money permission needed | Update the assigned Hub key or personal key to include User money (custom or Limited access). Banker-only review does not need this selection. |
| No balance / amount exceeds balance | Enter no more than your current faction balance. Below $1, neither amount nor full-balance requests can notify Discord. |
| Not in configured faction | Check the configured faction ID and your current membership. |
| No banker access | Add the banker's **Torn ID** to `BANKER_IDS`, redeploy, then verify again. |
| Sent but no notification sound | Check the target channel, role membership/mention settings and individual Discord notification settings. |
| Timed out / delivery needs checking | Use Check previous request once, then ask a banker to inspect Discord before creating another request. |
| Prefill blocked | Clear native drafts; open Give to User / Give money; confirm the member balance is visible and in the current faction. If still unavailable, handle it manually. |
| Script Hub opens the old banker board | Disable the old userscript and reload Torn. Keep only one Banker Request version enabled. |
| Cooldown / too many attempts | Wait until the displayed time; server limits apply across devices and reloads. |
| New request blocked after an old timeout | Reconnect to the same relay/account and check the stored previous request. If the server says it expired, check Discord with a banker, then use Dismiss expired request and confirm. |

## Build and verify

From the repository root:

```powershell
node banker-request/tools/build.cjs
node banker-request/tools/check.cjs
node banker-request/tools/check.cjs --browser
```

Node 24+ is required for the backend's real SQLite tests. Browser checks use Playwright and a dedicated **headless** Brave process, close exactly that process, and use synthetic Torn/API/Discord fixtures. They do not reuse your normal browser or read live keys. To use another Chromium executable, set `BANKER_BROWSER`. If Playwright is not available in the workspace runtime, run `npm install --no-save --ignore-scripts playwright@1.62.1` inside `banker-request` for development and provide your chosen browser executable; the userscript has no runtime dependencies or remote `@require`.

The builder owns `.user.js` and `.meta.js`; edit `src/` and rebuild. GitHub installs check this script's own `.meta.js` feed and download its matching `.user.js`. Greasy Fork installs use Greasy Fork's update feed. Update timing is controlled by your script manager. This package is published separately from the managed Hub/War Payout workflow; publish only reviewed builds to its own paths. Never upload local deployment profiles, keys, webhook URLs or browser data.

Greasy Fork listing **601376** uses Automatic source syncing from the raw GitHub `main` installer above. Update the existing listing rather than creating duplicates. Its additional description is maintained through Greasy Fork's Update page; [GREASY-FORK.md](GREASY-FORK.md) provides the public guide text.

## Verification status

Automated checks use synthetic keys and accounts in isolated browser fixtures matching the inspected native Torn form. They cover blank public defaults, member/banker visibility, authorization, balance caps, duplicate protection, pending recovery, cancellation and responsive layouts. They send no live Discord notifications or payments. Administrators must validate their own deployment; no physical PDA device is part of automated verification.
