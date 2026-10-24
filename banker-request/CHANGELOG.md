# Changes

## 1.0.7 — 2026-10-23

- Fix account verification when Torn's mobile/PDA layout omits the desktop Name link. Compare the API-verified key owner with Torn's native banner bootstrap account ID, without another API call or persisted identity.
- Keep wrong-account, missing-ID and conflicting-ID checks. Add PDA-adapted browser regressions at desktop, phone and landscape widths.

## 1.0.6 — 2026-10-21

- Make the release faction-neutral: blank Cloudflare address, API key and requested amount on fresh installs. Preserve previously saved settings.
- Prevent builders from reintroducing a default relay. Exclude local setup reports and historical deployment/design notes from the public ZIP.
- Publish faction setup and member/banker instructions, with dedicated GitHub update feeds and Greasy Fork listing text.

## 1.0.5 — 2026-10-21

- Hide Review payout and the Hub review shortcut until the current account is verified as a banker. Regular members see Request and Connection only.
- Remove banker controls and prepared helper state when verification clears. Keep one Hub adapter instance and preserve automatic banker-link verification/prefilling.

## 1.0.4 — 2026-10-21

- Reject zero-balance, over-balance and unverifiable requests on the relay before Discord is contacted. Check only the authenticated requester's own faction money via Torn's User money selection; ignore other returned wealth and persist no balance.
- Automatically verify a banker request link and prepare the native recipient/amount once its form is ready. Preserve manual drafts and all current-balance guards; never submit the payment.
- Release local pending markers only after explicit server errors proving no notification was reserved. Keep uncertain/network outcomes recoverable under the original request ID.
- Requester keys now need User basic, faction and money selections. Existing banker-only review still uses identity/faction verification and native balances.

## 1.0.3 — 2026-10-21

- Fix the live Cloudflare relay's Torn verification failure by using manual redirect handling for upstream requests. Redirect responses still fail closed, and authentication headers are never forwarded to a redirect target.
- Add redacted, fixed-label verification diagnostics and redirect regressions for both Torn and Discord.
- Verify the backend fix against an existing deployment and the installed 1.0.2 client. No client reinstall was required for this server fix.

## 1.0.2 — 2026-10-21

- Fix Tampermonkey refusing Cloudflare connections: generate the supported `@connect workers.dev` permission.
- Replace separate Save/Verify actions with one Connect button; retain the configured relay and automatically re-verify an approved connection when reopened.
- Automatically discover approved Hub keys using the current encrypted key-context contract. Remove the extra Hub checkbox, hide personal-key input after Hub enrollment, and pause on revoked/missing Hub access without personal fallback.
- Add focused metadata and real-browser Hub approval/reload/revocation regressions; retain pending-request, cancellation and balance protections.
- Prevent a pending startup key read from undoing Forget; keep Forget unavailable until connection settings finish loading.

## 1.0.1 — 2026-10-20

- Add a default public relay for new installations (removed in 1.0.6); preserve saved connection settings and explicit key-sharing choices.
- Read Torn's current sidebar Name row as well as the older identity label; reject conflicting identities and ignore unrelated member links.
- Preserve the GPL-3.0 header during builds and include the full license in source ZIPs.

## 1.0.0 — 2026-10-15

- New compact request tool with Script Hub registration and shared themes.
- Amount/full-balance intent, own-account verification, session-only keys by default and optional Hub credential access.
- Cloudflare Worker and SQLite Durable Object: authenticated faction requests, persistent limits/idempotency, restricted Discord mentions, expiring banker links and fail-closed uncertain delivery.
- Banker review, current native member-balance checks, exact recipient selection, explicit-only form prefilling, guarded native submission and manual fallback.
- Deployment/member/banker instructions, focused security tests and responsive generated-script browser fixtures.
