# Banker Request Relay

This is source for a Cloudflare Worker and one SQLite-backed Durable Object. It sends server-built Discord notifications after Torn verifies the API key owner, configured faction membership and the requester's own available faction money. It never transfers money or retries Discord sends. No leader or faction-wide balance key is required.

## Setup

Use a Cloudflare account and a reviewed current Wrangler installation. Run commands from `banker-request/worker`.

1. Set `FACTION_ID` to your Torn faction ID, `BANKER_IDS` to comma-separated Torn player IDs authorized to review other members' requests, and `DISCORD_ROLE_IDS` to comma-separated Discord role IDs allowed to be mentioned (maximum 10 roles, to keep the complete message below Discord's content limit). These values are nonsecret. Keep `ENABLED` set to `"false"` during setup. Zero placeholders intentionally fail validation if enabled.
2. Add the secret interactively: `wrangler secret put DISCORD_WEBHOOK`. Enter the Discord webhook URL only in the secret prompt. Supported destination: `https://discord.com/api/webhooks/<id>/<token>`. Do not put it in source, command arguments, URLs sent to members, screenshots or logs.
3. Run `node --check worker.mjs` and, from the repository root, `node --test banker-request/test/worker.test.mjs` (Node 24 or later). The tests use real in-memory SQLite and synthetic network responses, never live Discord.
4. Review the config and deploy using `wrangler deploy`. Change `ENABLED` to `"true"` and deploy only when ready to accept real requests. Deployment itself sends no Discord message; an authorized `/v1/requests` call does. No live send is required for setup verification.
5. Give users the deployed HTTPS relay origin. Their Torn key is transmitted over HTTPS to this relay and Torn. The relay persists only a SHA-256 keyed identity proof, never a raw key. Protect the Cloudflare account, secret access and deployment permissions accordingly.

Disable all API activity by redeploying with `ENABLED: "false"`. Do not delete/recreate the Durable Object or its idempotency state during normal deployment, rollback or incident recovery.

## HTTP API

All routes use `POST`, `Content-Type: application/json`, and `Authorization: Bearer <16-character alphanumeric Torn key>`:

- `/v1/identity`, `{}` -> `{ok:true,user:{id,name,factionId},banker:boolean}`.
- `/v1/requests`, `{requestId:<UUIDv4>,kind:"amount",amount:<integer>}` or `{requestId:<UUIDv4>,kind:"full"}` -> `{ok:true,request,retryAfter:60}`.
- `/v1/requests/resolve`, `{token:<UUIDv4>}` -> `{ok:true,request}`. Only the verified owner or a configured banker in the configured faction can resolve.

The request is `{token,requestId,userId,name,factionId,kind,amount?,createdAt,expiresAt,status}`. Dates are Unix epoch milliseconds. Amount is absent for full balance and limited to positive safe whole dollars up to **1,000,000,000,000**. Before a new reservation, `/user/money?timestamp=<seconds>` reads only the authenticated requester's own `money.faction.money`. A balance below $1 rejects amount/full requests; an amount above that balance also fails. Full balance remains intent text: the checked balance is never stored, returned or posted. Other wealth fields in Torn's money response are ignored. Status is `sent`, `failed`, or `uncertain`. `sent` means Discord returned an HTTP200 message with a valid ID; it does not mean paid.

Requesters need **User money** in addition to basic/faction selections (custom or Limited-access key). Banker identity/review does not fetch the banker's money. Fixed errors `NO_BALANCE`, `OVER_BALANCE`, `BALANCE_PERMISSION` and `BALANCE_UNAVAILABLE` prove that no notification or tombstone was reserved for a new request. Existing UUIDs replay their durable original result before any balance read, even when the current balance has changed. New attempts use a fresh balance query; cooldown and capacity rejections skip it. API errors or unsafe/malformed balances fail closed.

Errors are `{ok:false,error:{code,message},retryAfter?:seconds}` with a matching HTTP status. Codes include `DISABLED`, `CONFIG`, `AUTH`, `FACTION`, `FORBIDDEN`, `EXPIRED`, `ID_CONFLICT`, `COOLDOWN`, `ATTEMPT_LIMIT`, `BODY_SIZE`, `BODY_TIMEOUT`, `TORN_UNAVAILABLE`, `TORN_RESPONSE`, `CAPACITY`, and `UNAVAILABLE`. Errors never echo upstream bodies or user input. Duplicate IDs with the same owner/content return the existing unexpired result; changed content conflicts. Keep the original request UUID after an ambiguous network result. Never automatically retry with a new UUID.

Link format is fixed: `https://www.torn.com/factions.php?step=your&type=1#/tab=controls&bankRequest=<token>`. Tokens expire after two hours. API responses use `no-store`. Only `https://www.torn.com` receives CORS access; userscript requests without Origin remain authenticated by the Torn key. CORS is not authorization.

## Durable safeguards and retention

One singleton object is selected by the server's faction ID. A bounded 32-request queue serializes every state transition across awaits. SQLite reservations store the request as `uncertain`, reserve limits and insert its idempotency tombstone in one transaction **before** contacting Discord. A crash, timeout, malformed Discord success, 5xx or unknown response leaves it uncertain. Explicit Discord 4xx becomes failed. No outcome is automatically resent, and every attempt consumes notification limits.

Sliding limits: member 60 seconds, faction 10 notifications/minute and 100/hour; unauthenticated attempts 10/IP/minute and 30 aggregate/minute. Every POST attempt passing configuration/route/origin checks consumes a preauth slot before key verification and Torn calls, including malformed input. IPs use Cloudflare's connecting-IP header, hashed in storage; forwarded-for headers are ignored. Missing IP shares one limited bucket. Identity proofs last at most 60 seconds from verification start; faction removal/revocation can have that bounded delay.

Input caps are 1 KiB with a 2 second body-read deadline. Each Torn endpoint has a 6 second timeout, Discord 8 seconds; response parsing is included and capped 32 KiB. Destinations are fixed and redirects forbidden. API keys appear only in outbound Torn Authorization headers. Notification text and allowed mentions are built on the server; names cannot inject mentions.

Pruning happens on incoming API actions. Identity/IP/member entries expire; notification timestamps retain one hour; request payloads retain 24 hours, but resolve and duplicate request responses fail after 2 hours. Rate ceilings bound these maps. Compact request-ID tombstones retain UUID, owner ID, token, kind and requested amount (when present). They are permanent to prevent an old UUID ever causing a second ping. There is a hard cap of 100,000 tombstones: at capacity new requests fail closed (`CAPACITY`), while existing records remain protected. Plan a reviewed migration to a larger durable schema/capacity before reaching the cap; never clear tombstones or silently create a replacement object to reset it. This deliberate availability limit reconciles permanent duplicate protection with bounded storage.

No third-party runtime dependencies are used; observability is disabled in the sample deployment. Keep platform/request-body logging disabled. Verification diagnostics emit only fixed stage/failure labels and shape/type checks, never keys or response content. The public package contains no existing faction deployment profile. Balance guards and automatic preparation are covered by synthetic tests; no physical PDA device was available.

## Sources

- [Torn OpenAPI](https://www.torn.com/swagger/openapi.json): own-user `/user/basic` uses `profile.id/name`, `/user/faction` uses `faction.id`, `/user/money` uses `money.faction.money` and requires the User money selection; header `Authorization: ApiKey <key>`.
- [Discord webhooks](https://docs.discord.com/developers/resources/webhook) and [allowed mentions](https://docs.discord.com/developers/resources/message#allowed-mentions-object).
- [Cloudflare SQLite Durable Object storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/) and [secrets](https://developers.cloudflare.com/workers/configuration/secrets/).
