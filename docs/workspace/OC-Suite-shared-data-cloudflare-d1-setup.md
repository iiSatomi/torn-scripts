# OC Suite shared faction data — Cloudflare Worker + D1 setup guide

**Status:** Implementation guide; nothing has been deployed yet.

**Recommended platform:** Cloudflare Worker + Cloudflare D1.

**Purpose:** Move faction-wide loans, consumable usage, CPR summaries, and audit
data out of browser storage and Google Sheets while keeping Torn API usage low.

## 1. What will be built

```text
OC Suite userscript
        │ HTTPS POST + member session
        ▼
Cloudflare Worker API
        │ validates token, role, faction, and action
        ▼
Cloudflare D1 database
```

Your Torn API key is used only by an occasional roster-sync operation. Normal
reads and writes use D1 and make **zero Torn API calls**.

The Worker will provide:

- faction member/session management;
- loans and armoury records;
- consumable usage records;
- CPR/configuration data;
- admin-only settings and sync actions;
- an audit trail;
- a health and quota-status endpoint.

Google Sheets can remain as a manual export/backup during migration, but it will
not be the live request path.

## 2. Why this option

Cloudflare Workers Free currently allows 100,000 requests per day. D1 Free
includes 5 million row reads per day, 100,000 row writes per day, and 5 GB of
storage. When free limits are exceeded, requests fail until the quota resets;
they do not silently turn into paid usage.

Official references:

- [Cloudflare Workers getting started](https://developers.cloudflare.com/workers/get-started/)
- [D1 getting started](https://developers.cloudflare.com/d1/get-started/)
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [D1 pricing and free limits](https://developers.cloudflare.com/d1/platform/pricing/)
- [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

## 3. Torn API call policy

The Worker must not call Torn for every user request.

| Operation | Torn API calls |
|---|---:|
| Read a faction record | 0 |
| Save a loan | 0 |
| Save consumable usage | 0 |
| Check member permission | 0 |
| Admin action | 0 |
| Member API-key activation/session renewal | 1 per session renewal |
| Scheduled roster refresh | 1 |
| Optional position refresh | 1 additional |

Recommended schedule:

- Run the first roster sync manually after deployment.
- Run one member sync every 24 hours.
- Run a position sync only when role permissions change.
- Do not automatically query Torn when an unknown user appears.
- Put unknown users into `pending_members` and let an admin approve or run a
  manual sync.

This keeps the normal API budget at roughly one Torn faction call per day. A
manual revoke in the admin panel handles urgent removals without spending a
Torn API call.

The current Apps Script has a similar roster concept, but its unknown-user
catch-up behavior should not be copied into the new Worker if minimizing calls
is important.

## 4. Security model

### Secrets that stay server-side

Store these as Cloudflare Worker secrets, never in the userscript or D1 rows:

- `TORN_API_KEY` — your limited faction-read Torn key, used only by roster sync;
- `ADMIN_PASSWORD_HASH` — hash of the admin password, not the password itself;
- `SESSION_PEPPER` — random secret used when hashing short-lived session tokens.

Cloudflare secrets are encrypted bindings and are not shown again in Wrangler
or the dashboard after creation. Use `wrangler secret put`, not plaintext
`vars`, for sensitive values.

### Member authentication

Do not trust a client-provided `user_id` as authentication.

Each member enters their own limited Torn API key in the OC Suite Config panel.
The userscript sends it once to `/v1/session/member` over HTTPS. The Worker:

1. Calls Torn's owner lookup using that submitted key.
2. Gets the real Torn user ID belonging to the key.
3. Checks that ID against the cached faction roster.
4. Rejects the request without reading D1 if the key is invalid or the user is
   not in the faction.
5. Discards the submitted API key and returns an automatic short-lived session
   token.

The userscript stores only that session token in userscript-manager storage. It
does not store the member's Torn API key. Normal data requests use the
short-lived session token and make zero Torn API calls.

This is not ten manually issued tokens for the administrator. Each member
authenticates themselves once, and the Worker creates the temporary session
automatically. If the session expires, the member enters their API key again.

Do not log, persist, or echo submitted member API keys. Ask members to create a
dedicated minimal/custom key rather than using a Full key. The Worker should
request only the owner identity needed for activation; it must not become a
generic proxy for arbitrary Torn endpoints.

### Admin authentication

The admin password is used only to start an admin session. The Worker should:

1. Receive the password over HTTPS in a `POST` body or header.
2. Derive a slow, salted password hash and compare it with the stored
   `ADMIN_PASSWORD_HASH` record. Do not use a single unsalted SHA-256 hash for
   the human password; random member/session tokens may use a normal hash
   because they are high-entropy values.
3. Return a random short-lived admin session token.
4. Store only the session-token hash and expiry.
5. Require that session token for admin actions.

Do not send the admin password with every request. Do not put it in a URL,
userscript source, Google Sheet cell, or log.

## 5. Create the Cloudflare project

Install Node.js first if it is not already installed. Cloudflare’s D1 guide
requires Node.js and uses Wrangler for local development and deployment.

In PowerShell:

```powershell
npm create cloudflare@latest -- torn-oc-suite-data
Set-Location torn-oc-suite-data
npx wrangler login
```

When prompted by the project creator, choose:

- Worker only;
- TypeScript;
- Git repository: yes;
- Deploy now: no.

Do not place real secrets in the repository. Add `.dev.vars` to `.gitignore` if
you use local secrets.

## 6. Create the D1 database

From the Worker project directory:

```powershell
npx wrangler@latest d1 create torn-oc-suite
```

Copy the returned database ID into `wrangler.jsonc`. The binding should look
similar to this; use the actual ID returned by Cloudflare:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "torn-oc-suite-data",
  "main": "src/index.ts",
  "compatibility_date": "2026-08-23",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "torn-oc-suite",
      "database_id": "PASTE_REAL_DATABASE_ID_HERE"
    }
  ],
  "secrets": {
    "required": [
      "TORN_API_KEY",
      "ADMIN_PASSWORD_HASH",
      "SESSION_PEPPER"
    ]
  }
}
```

## 7. Create the first database migration

Create a migration:

```powershell
npx wrangler d1 migrations create torn-oc-suite initial_schema
```

Put the following schema in the generated SQL file. The final Worker should
use prepared statements for every query.

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE factions (
  faction_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  last_roster_sync INTEGER,
  last_position_sync INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE members (
  faction_id TEXT NOT NULL,
  torn_user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  in_faction INTEGER NOT NULL DEFAULT 1,
  last_verified_at INTEGER,
  last_seen_at INTEGER,
  PRIMARY KEY (faction_id, torn_user_id),
  FOREIGN KEY (faction_id) REFERENCES factions(faction_id)
);

CREATE TABLE pending_members (
  faction_id TEXT NOT NULL,
  torn_user_id TEXT NOT NULL,
  requested_at INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (faction_id, torn_user_id),
  FOREIGN KEY (faction_id) REFERENCES factions(faction_id)
);

CREATE TABLE loans (
  id TEXT PRIMARY KEY,
  faction_id TEXT NOT NULL,
  item_id TEXT,
  item_name TEXT NOT NULL,
  borrower_id TEXT NOT NULL,
  lender_id TEXT,
  status TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (faction_id) REFERENCES factions(faction_id)
);

CREATE TABLE consumable_usage (
  faction_id TEXT NOT NULL,
  torn_user_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  xanax INTEGER NOT NULL DEFAULT 0,
  alcohol INTEGER NOT NULL DEFAULT 0,
  drugs INTEGER NOT NULL DEFAULT 0,
  energy_refills INTEGER NOT NULL DEFAULT 0,
  nerve_refills INTEGER NOT NULL DEFAULT 0,
  enhancers INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (faction_id, torn_user_id, period_start),
  FOREIGN KEY (faction_id) REFERENCES factions(faction_id)
);

CREATE TABLE admin_sessions (
  session_hash TEXT PRIMARY KEY,
  faction_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE member_sessions (
  session_hash TEXT PRIMARY KEY,
  faction_id TEXT NOT NULL,
  torn_user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER,
  FOREIGN KEY (faction_id, torn_user_id)
    REFERENCES members(faction_id, torn_user_id)
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  faction_id TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  target_id TEXT,
  created_at INTEGER NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_member_sessions_user ON member_sessions(faction_id, torn_user_id, expires_at);
CREATE INDEX idx_loans_faction_status ON loans(faction_id, status);
CREATE INDEX idx_usage_faction_period ON consumable_usage(faction_id, period_start);
CREATE INDEX idx_audit_faction_time ON audit_log(faction_id, created_at);
```

Apply locally first, then remotely:

```powershell
npx wrangler d1 migrations apply torn-oc-suite --local
npx wrangler d1 migrations apply torn-oc-suite --remote
```

Never run destructive `DROP TABLE` statements against the remote database until
an export has been made and the operation has been explicitly confirmed.

## 8. Add Worker secrets

Run each command and paste the value only when Wrangler asks for it:

```powershell
npx wrangler secret put TORN_API_KEY
npx wrangler secret put ADMIN_PASSWORD_HASH
npx wrangler secret put SESSION_PEPPER
```

Use a limited/custom Torn key with only the faction selections needed for the
roster sync. Do not use a Full or Limited key if a narrower custom key works.
Do not print the key in a terminal command, commit it, or send it through the
userscript.

## 9. Worker API contract

The first version should expose these operations:

```text
POST /v1/health
POST /v1/session/member        validate member Torn API key, create session
POST /v1/session/admin         start admin session
POST /v1/roster/sync           admin-only; uses TORN_API_KEY
POST /v1/loans/list
POST /v1/loans/save
POST /v1/loans/revoke
POST /v1/consumables/read
POST /v1/consumables/save
POST /v1/audit/list             admin-only
```

Every request other than `/v1/session/member` should require:

```text
Authorization: Bearer MEMBER_OR_ADMIN_SESSION_TOKEN
Content-Type: application/json
```

Rules:

- Reject `GET` for data-changing actions.
- Reject missing, expired, revoked, or unknown sessions.
- Derive `faction_id` and `actor_id` from the session, not the body.
- Validate action-specific fields and length limits at the Worker boundary.
- Use parameterized D1 statements.
- Return only the fields needed by the current role.
- Add an audit row for every write, revoke, session issue, and admin action.
- Apply per-session and per-faction rate limits.
- Do not return stack traces, secrets, SQL errors, or full database rows.

The Worker should not expose a generic SQL endpoint or a generic “read table”
operation.

## 10. Roster synchronization logic

The roster sync operation should:

1. Read the faction members using `TORN_API_KEY`.
2. Upsert current members into `members`.
3. Mark absent members as `in_faction = 0`.
4. Revoke their member sessions unless an admin explicitly keeps them active.
5. Update `factions.last_roster_sync`.
6. Write a summary to `audit_log` without logging the API key or raw response.

The Worker should not perform this sync on normal reads or writes. Use a Cloudflare
Cron Trigger once daily, or an admin-only manual sync. The Cloudflare Free plan
allows a small number of Cron Triggers; alternatively, the admin can run sync
manually from the OC Suite panel.

## 11. Member activation flow

There is no manual per-member token provisioning.

1. Member opens OC Suite Config.
2. Member enters their own dedicated limited/custom Torn API key.
3. The userscript sends the key once to `/v1/session/member` over HTTPS.
4. The Worker calls Torn's owner lookup with that key.
5. The Worker compares the returned user ID with the cached faction roster.
6. Invalid keys and non-members receive `401`; no faction data is read.
7. A valid member receives a short-lived session token.
8. The userscript stores only the session token in private userscript storage.
9. The submitted Torn API key is discarded by the Worker and never logged.

The session token is an automatic login session, not a token the administrator
has to generate, distribute, or maintain for each member. A member can clear or
renew their own session at any time.

## 12. Migrate the existing Google Sheet

Do not delete the existing Sheet during the first deployment.

1. Run a complete Sheet export.
2. Keep the original file read-only as a backup.
3. Import only the data needed by OC Suite: members, open loans, settled loan
   history, consumable summaries, and configuration.
4. Do not import Torn API keys, admin passwords, session tokens, or old webhook
   values.
5. Compare D1 row counts and totals against the Sheet.
6. Run the new userscript in read-only mode first.
7. Enable writes only after the comparison passes.
8. Keep the Sheet as a manual export until the Worker has been stable for at
   least two weeks.

## 13. Userscript integration

The userscript should receive a single data-layer module:

```js
FactionStore.listLoans()
FactionStore.saveLoan(input)
FactionStore.readConsumables(period)
FactionStore.saveConsumables(input)
FactionStore.getSessionState()
```

The module should:

- send requests only to the Worker URL;
- send the member/admin session token in an authorization header;
- prompt for a member Torn API key only when activating or renewing a session;
- cache successful reads locally for short offline use;
- never persist the member or owner Torn API key;
- clear an expired token after a `401` response;
- never fall back to writing shared data directly to localStorage;
- show “offline/cache” status clearly in the UI.

The Worker URL is not a secret. The short-lived session is the credential.

## 14. Verification checklist

Before enabling faction use, test all of these:

- A request with no session returns `401`.
- An invalid member Torn API key returns `401`.
- A valid key for a non-member returns `401`.
- A revoked/expired session returns `401`.
- A member session cannot read another faction’s data.
- A member cannot perform admin actions.
- Changing `user_id` in the JSON body does not change the authenticated actor.
- An inactive member loses access after roster sync or manual revoke.
- Member activation makes one intended Torn API request, not one per data request.
- Roster sync makes one intended Torn API request, not one per user request.
- Submitted member API keys never appear in logs, D1, or response bodies.
- Torn API failures do not expose the API key or raw response.
- Database errors do not expose SQL or stack traces.
- Oversized notes and invalid IDs are rejected.
- Duplicate writes are idempotent where appropriate.
- Audit records contain actor, action, target, and timestamp.
- Free-tier quota failures show a controlled service-unavailable message.
- Google Sheet totals and D1 totals match after migration.

## 15. Operations and rotation

Keep these procedures written down:

- Rotate `TORN_API_KEY` if the key may have been exposed.
- Rotate `SESSION_PEPPER` only with a planned session reset; changing it invalidates
  existing session hashes.
- Revoke a member’s sessions when they leave or lose access.
- Change the admin password by replacing `ADMIN_PASSWORD_HASH`.
- Export D1 data before schema changes.
- Review `audit_log` weekly.
- Review Worker and D1 free-tier usage monthly.
- Keep the Google Sheet backup until the new system has a verified restore path.

## Final recommendation

Use Cloudflare Worker + D1 as the live store, with:

- one daily roster sync using your Torn API key;
- zero Torn API calls for ordinary data handling;
- member API-key activation with automatic short-lived sessions;
- short-lived admin sessions;
- Google Sheets retained as a backup/export only.
