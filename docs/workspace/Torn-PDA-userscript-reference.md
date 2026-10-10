# Torn PDA userscript development reference

Last reviewed: 2026-08-31

This is the durable Torn PDA reference for every userscript in this workspace,
especially `Torn_OC_Suite_Codex.user.js`. Read it before changing PDA storage,
networking, lifecycle, metadata, exports, notifications, or responsive UI.

The document summarizes the official Torn PDA repository. It does not copy the
upstream text. Re-check the linked source when behavior is version-sensitive.

## Executive decisions for this workspace

1. Distribute one universal userscript for desktop and Torn PDA. Use capability
   detection for PDA-only APIs and ordinary fallbacks elsewhere. Maintain two
   scripts only if a future, tested incompatibility cannot be isolated behind an
   adapter.
2. `GM_getValue`/`GM_setValue` on PDA are compatibility storage, not the native
   large-data store. The current GM handler is backed by the page's shared
   `localStorage`.
3. Keep small, startup-critical synchronous settings in GM storage. Put large or
   growing datasets in `PDA_storage` when available, with a GM fallback for
   desktop and older PDA versions.
4. `PDA_storage` is durable and script-namespaced, but it is not a secret vault.
   A namespace prevents accidental key collisions; it is not a security boundary
   against other scripts the user installs.
5. Load native storage once, work from an in-memory cache, and batch/debounce
   writes. Do not cross the Flutter bridge for every row or UI render.
6. Use Torn PDA tab-state events to pause refreshes, timers, observers, and large
   rendering work while the WebView is not active/visible. Resume safely when it
   becomes visible.
7. Treat PDA availability by feature detection, not app-version guessing.
   Upstream `master` documentation can describe functionality newer than a user's
   installed build.
8. GM compatibility does not make desktop UI mobile-safe. PDA requires responsive
   layouts, touch targets, selector verification, bounded DOM, and lifecycle tests.

## Official source index

### Developer documentation

- [Developer documentation index](https://github.com/Manuito83/torn-pda/blob/master/docs/README.md)
- [Architecture overview](https://github.com/Manuito83/torn-pda/blob/master/docs/architecture.md)
- [Testing guide](https://github.com/Manuito83/torn-pda/blob/master/docs/testing.md)
- [GM compatibility guide](https://github.com/Manuito83/torn-pda/blob/master/docs/userscripts/gm-compatibility.md)
- [Userscript directory overview](https://github.com/Manuito83/torn-pda/blob/master/userscripts/README.md)
- [Native per-script storage](https://github.com/Manuito83/torn-pda/blob/master/userscripts/TornPDA_Storage.md)
- [Current GM compatibility implementation](https://github.com/Manuito83/torn-pda/blob/master/userscripts/GMforPDA.user.js)
- [Current PDA JavaScript API implementation](https://github.com/Manuito83/torn-pda/blob/master/userscripts/TornPDA_API.js)

### WebView bridge documentation

- [Bridge index and readiness](https://github.com/Manuito83/torn-pda/blob/master/docs/webview/webview-handlers.md)
- [HTTP handlers](https://github.com/Manuito83/torn-pda/blob/master/docs/webview/http-handlers.md)
- [Torn PDA environment check](https://github.com/Manuito83/torn-pda/blob/master/docs/webview/torn-pda-check-handler.md)
- [Tab state](https://github.com/Manuito83/torn-pda/blob/master/docs/webview/tab-state-handler.md)
- [Evaluate JavaScript](https://github.com/Manuito83/torn-pda/blob/master/docs/webview/evaluate-js-handler.md)
- [Copy to clipboard](https://github.com/Manuito83/torn-pda/blob/master/docs/webview/copy-to-clipboard-handler.md)
- [Reload page](https://github.com/Manuito83/torn-pda/blob/master/docs/webview/reload-page-handler.md)
- [Toast](https://github.com/Manuito83/torn-pda/blob/master/docs/webview/toast-handler.md)
- [Launch external intent](https://github.com/Manuito83/torn-pda/blob/master/docs/webview/pda-intent-handler.md)
- [Share file](https://github.com/Manuito83/torn-pda/blob/master/docs/webview/share-file-handler.md)
- [Notifications, alarms, and timers](https://github.com/Manuito83/torn-pda/blob/master/docs/webview/notification-handlers.md)
- [Notification test page source](https://github.com/Manuito83/torn-pda/blob/master/docs/webview/notification-test-web.md)

## How Torn PDA runs userscripts

Torn PDA is a Flutter application whose browser tabs are separate
`flutter_inappwebview` WebViews. The browser and app drawer are held in an
`IndexedStack`; WebViews can remain alive when not visible, and tabs can also be
put to sleep and later resumed.

The documented userscript pipeline is:

1. `UserScriptsProvider` loads saved scripts and metadata.
2. Torn PDA assembles platform-ready, HTTP, GM, evaluate-JS, and other handler
   sources.
3. It selects scripts whose `@match` patterns match the current URL.
4. Handler code and matching scripts are added to the WebView.
5. document-start scripts run as the page begins loading.
6. The Flutter platform-ready event/promise resolves when native handlers can be
   called safely.
7. document-end scripts run at the appropriate loading phase.

Practical implications:

- Page navigation is SPA-like in Torn and lifecycle-driven in the app. A script
  must tolerate anchors disappearing/reappearing without mounting duplicates.
- A hidden WebView can still execute JavaScript unless the script pauses itself.
- Sleeping/resumed tabs can replay lifecycle state; do not assume one continuous
  desktop-style page lifetime.
- Raw native calls made too early can fail. Prefer the injected PDA helpers, or
  wait for platform readiness before `callHandler`.

## Detecting Torn PDA and native readiness

Do not use the user agent as the primary test.

The raw environment handler is:

```js
const result = await window.flutter_inappwebview.callHandler('isTornPDA');
const isPda = result?.isTornPDA === true;
```

The bridge is safe only after `flutterInAppWebViewPlatformReady`. The current
injected API also exposes `window.__PDA_platformReadyPromise`; use it when
available. A universal adapter should first check that
`window.flutter_inappwebview?.callHandler` exists, wait for readiness, then call
the handler. Failure means “PDA capability unavailable,” not a fatal script
error.

For an individual feature, prefer direct capability checks:

```js
const hasNativeStore = typeof globalThis.PDA_storage?.loadAll === 'function';
const hasPdaHttp = typeof globalThis.PDA_httpGet === 'function';
```

This protects users on older Torn PDA versions and avoids relying on a version
string.

## Metadata and script matching

Torn PDA parses userscript metadata and has improved compatibility with
Tampermonkey/Violentmonkey conventions.

### `@grant`

- Parsed and stored.
- The grant list is available to the app's userscript model.
- Torn PDA currently provides a baseline GM handler rather than strictly
  enforcing each requested grant.
- Scripts should still declare every GM API they use for portability and future
  enforcement.

### `@require`

- Parsed and stored.
- Automatic fetching, loading order, and caching are documented as TODO work.
- Do not depend on `@require` to load a library on PDA. Bundle required runtime
  code in the generated userscript or implement an explicit, tested fallback.

### `@match`

Supported forms include:

- `*` as a legacy universal match;
- scheme wildcards such as `*://www.torn.com/*`;
- domain wildcards such as `*://*.torn.com/*`;
- path wildcards such as `*://www.torn.com/profiles.php*`;
- legacy patterns without a scheme;
- fallback handling for non-standard legacy patterns.

`@exclude` and `@include` are documented as future work. Do not depend on them
for PDA safety; perform a runtime route check as well.

### Versions and API-key placeholder

- Version comparison follows semantic-version rules, including prereleases, with
  a string fallback for non-standard versions.
- During injection, `UserScriptsProvider.adaptSource()` replaces the literal
  `###PDA-APIKEY###` token with the PDA user's API key.
- The replacement is convenience, not secret protection. Never log it, display
  it in diagnostics, or export it.
- The suite should keep its current explicit key/permission flow unless the PDA
  placeholder is deliberately introduced and tested for all required Torn API
  scopes.

## GM compatibility: exact supported surface

Torn PDA exposes common APIs in both promise-based `GM.*` and underscore
`GM_*` styles:

| Capability | Dot form | Underscore form | Notes |
| --- | --- | --- | --- |
| Script info | `GM.info` | `GM_info` | Handler/script metadata |
| Read value | `GM.getValue` | `GM_getValue` | Default on missing/corrupt |
| Read values | `GM.getValues` | `GM_getValues` | Array or defaults map |
| Write value | `GM.setValue` | `GM_setValue` | JSON-compatible values |
| Write values | `GM.setValues` | `GM_setValues` | Object map |
| Delete value | `GM.deleteValue` | `GM_deleteValue` | One key |
| Delete values | unavailable | `GM_deleteValues` | Bulk helper |
| List values | `GM.listValues` | `GM_listValues` | See storage caveat below |
| Add CSS | `GM.addStyle` | `GM_addStyle` | Works before `<head>` |
| Notify | `GM.notification` | `GM_notification` | Native confirm-style UI |
| Clipboard | `GM.setClipboard` | `GM_setClipboard` | Native bridge |
| HTTP | `GM.xmlHttpRequest` | `GM_xmlhttpRequest` | Routed through PDA HTTP |

`unsafeWindow` points to the page `window`. Bulk value helpers were added in
GMforPDA 2.3.0. If a page already defines `GM`, the handler can avoid
redeclaration rather than throwing.

### Critical GM storage implementation detail

The current `GMforPDA.user.js` implementation stores GM values in
`localStorage` with a serialization prefix. Dot notation wraps the same storage
in promises; it does not move values to SQLite. `GM_listValues` can therefore
observe page-storage keys rather than a manager-enforced private namespace.

Consequences:

- GM storage is suitable for small settings and compatibility fallbacks.
- Large ledgers, history, snapshots, and report caches can exhaust the shared
  WebView quota or be evicted under pressure.
- GM/localStorage should not be presented as secure secret storage.
- The native `PDA_storage` API must be called directly for durable large data.

Upstream currently has a minor version-label inconsistency: the GM script header
reports 2.3.0 while an internal version constant observed during this review was
2.2. Do not branch behavior on that internal number; detect methods instead.

## Native per-script storage: `PDA_storage`

The official index says native storage is available from Torn PDA v3.15.0. It
is injected automatically where supported.

### Storage model

- SQLite-backed, separate from WebView `localStorage`.
- Automatically namespaced per userscript.
- 10 MB default quota per script; the user can raise it (the official index says
  up to 50 MB).
- Survives clearing browser cache.
- Values may be any JSON-serializable object, array, string, number, or boolean.
- Entire API is asynchronous.
- Namespace isolation prevents collisions; it is not protection from malicious
  or overprivileged installed scripts.

### API

| Method | Result |
| --- | --- |
| `await PDA_storage.get(key, def)` | Value, or `def` when absent |
| `await PDA_storage.getMany(keys)` | Object map; absent keys are `null` |
| `await PDA_storage.loadAll()` | Every key/value in this script namespace |
| `await PDA_storage.list()` | Array of keys |
| `await PDA_storage.set(key, value)` | Store one value |
| `await PDA_storage.setMany(values)` | Atomic/batched object-map write |
| `await PDA_storage.delete(key)` | Remove one key |
| `await PDA_storage.usage()` | `{ used, quota }` in bytes |

`set` and `setMany` reject with an error whose `code` is `QuotaExceeded` when a
write exceeds the script's limit. The app also alerts the user. Catch the error,
keep the UI usable, retain the last good in-memory value, and surface a clear
storage diagnostic.

### Required access pattern

```js
const nativeData = await PDA_storage.getMany(LARGE_KEYS);
const cache = { ...nativeData };

// Read and update cache during normal UI work.

await PDA_storage.setMany(changedValues);
```

Do not call `get()` for every cell or `set()` for every item. Bridge calls have
serialization and native round-trip costs. Load once, use memory, and coalesce
writes.

### Universal migration pattern

For each large key:

1. If `PDA_storage` is absent, continue using GM storage.
2. If native storage exists, read the native value first.
3. If native value is absent and a valid legacy GM value exists, write one copy
   to native storage.
4. Mark migration complete only after the native write succeeds.
5. Keep the legacy value temporarily as a rollback path; delete it only under a
   separately tested cleanup policy.
6. After migration, native storage is authoritative on PDA. Desktop remains GM.

Never make the synchronous shell wait on all bulk data. Mount the shell first,
hydrate data asynchronously, and show a bounded loading state where needed.

## HTTP and cross-origin requests

The injected helpers `PDA_httpGet`, `PDA_httpPost`, `PDA_httpPut`,
`PDA_httpPatch`, and `PDA_httpDelete` call the native HTTP bridge. Raw handler
names are the same.

- GET/DELETE arguments: URL and headers.
- POST/PUT/PATCH arguments: URL, headers, and body.
- Calls are asynchronous.
- Logical response shape:
  `{ status, statusText, responseText, responseHeaders }`.
- The GM `xmlHttpRequest` compatibility implementation routes through these
  native handlers on PDA.

Universal order for this project:

1. Existing GM request API when present.
2. PDA native HTTP helper when present.
3. Browser `fetch` only for same-origin/CORS-safe requests.

Preserve cancellation, timeout, error normalization, and API-call diagnostics
across all transports. Torn PDA's application has its own Torn API rate-limiter,
but a userscript must still pace its own requests and avoid work in hidden tabs.

## Tab lifecycle and resource control

`PDA_getTabState` returns:

```js
{ uid, isActiveTab, isWebViewVisible }
```

- `uid` is a UUID per tab and persists while that tab exists; it may be restored
  with saved sessions.
- `isActiveTab` means this is the selected Torn PDA browser tab.
- `isWebViewVisible` means the browser WebView is in the foreground.

The app also emits:

```js
window.addEventListener('tornpda:tabState', event => {
  const { uid, isActiveTab, isWebViewVisible } = event.detail;
});
```

The event fires on tab switches, browser foreground/background changes, and
after navigation loads/resumes. Helpers may also be exposed under
`window.__tornpda.tab`.

For OC Suite, “active” means both flags are true. While inactive:

- cancel or pause refresh countdowns and automatic report refresh;
- avoid Torn/API network calls;
- disconnect nonessential observers or make their callbacks no-op;
- do not rebuild large tables;
- debounce storage flushes and release temporary arrays/blobs;
- retain only the small state required to resume.

On reactivation, perform one coalesced refresh only if data is stale. Never
replay one refresh per missed interval.

Desktop fallback uses `document.visibilityState`/`visibilitychange`, but PDA tab
state is more precise because a WebView may be alive yet not selected.

## Native utility handlers

All raw handlers require platform readiness and should be wrapped in capability
checks plus ordinary-browser fallbacks.

### Clipboard

`copyToClipboard(text)` copies through the native app and avoids browser
clipboard permission failures. Prefer `GM_setClipboard` when available; fall
back to this handler, then to `navigator.clipboard` where allowed.

### Reload

The reload handler provides a native workaround for devices where
`window.location.reload()` is unreliable. Use only for an explicit user reload,
not as recovery for script lifecycle bugs.

### Toast

`showToast` accepts an object containing message text, optional tap-to-close,
duration, and ARGB background/text colors. Use for brief confirmation or errors,
not long diagnostics.

### External intents

`launchIntent(url)` asks the operating system to open an HTTPS URL or custom
scheme. It resolves with a success flag or an error. URLs derived from live page
data must be validated before launch.

### Share file

`shareFile({ base64Data, fileName })` sends a generated file to the native system
share sheet and resolves with a status/message object. This is the correct PDA
path for CSV, text, image, and spreadsheet-style exports when browser download
links fail.

Requirements:

- encode UTF-8 safely before Base64 conversion;
- use a sanitized filename and known extension;
- do not include API keys, sheet secrets, or hidden member data;
- release Blob/base64 intermediates after export;
- keep ordinary Blob/download behavior as the desktop fallback.

### Evaluate JavaScript

The native evaluate-JS bridge can execute fetched JavaScript. It materially
expands trust and supply-chain risk. OC Suite should not use it for remote code.
Bundle dependencies into the distributed userscript.

## Notifications, alarms, and timers

The documented notification bridge includes scheduling a notification,
Android alarm/timer functions, cancellation/query helpers, and platform checks.
Notification IDs must be managed to avoid overwriting unrelated notifications.
Timestamps are milliseconds where documented.

OC Suite policy:

- add native notifications only as an explicit, user-configurable feature;
- request the smallest useful behavior and avoid repetitive alerts;
- use stable IDs scoped to this script;
- cancel superseded reminders;
- never place secrets or sensitive faction information in lock-screen text;
- feature-detect Android-only alarms/timers and provide a no-op/onscreen fallback.

The upstream notification test page is a developer sandbox, not production code
to embed.

## PDA UI rules for this workspace

GM handlers solve APIs, not layout. Torn's PDA page can differ in viewport,
available width, safe-area insets, font scaling, and selectors.

Minimum test matrix:

| Mode | Viewport | Purpose |
| --- | ---: | --- |
| Desktop | 1920 × 1080 | Full intended desktop layout |
| Narrow PDA | 390 × 844 | Common narrow phone width |
| Wide PDA | 430 × 932 | Larger phone/Android width |
| Landscape PDA | 844 × 390 | Short-height overflow and controls |

Required behavior:

- no page-level horizontal overflow caused by the suite;
- no fixed panel wider/taller than the visual viewport;
- respect `env(safe-area-inset-*)` where floating controls touch screen edges;
- interactive controls should be at least about 44 CSS px on touch layouts;
- do not depend on hover for essential information/actions;
- dialogs need bounded height, internal scrolling, and a reachable close button;
- tables need a deliberate mobile strategy: stacked cards, priority columns, or a
  clearly contained horizontal scroller;
- draggable desktop windows must clamp coordinates after resize/orientation
  changes and expose a non-drag mobile layout;
- inputs should use at least 16 px text on mobile to avoid unwanted zoom;
- DOM lists and diagnostics must be bounded to protect WebView memory;
- use semantic buttons, labels, focus states, and keyboard behavior on desktop.

Do not use “PDA” as a proxy for screen size. Use capability detection for native
features and CSS media/container queries for layout.

## Torn PDA application persistence and security context

The app architecture also uses SharedPreferences for settings, Sembast for
larger app blobs, secure storage for credentials, and Firestore for selected
backup/sync. Those are app-internal implementation details and are not directly
available to userscripts. A userscript must use only the documented injected
APIs.

Security rules:

- `PDA_storage` is durable, not encrypted secret storage.
- GM/localStorage is shared WebView storage and can be evicted.
- API keys and sheet secrets must never appear in source, logs, diagnostics,
  screenshots, exports, DOM attributes, or copied support reports.
- Keep sensitive settings small and redact them everywhere.
- Never fetch and execute remote code through the evaluate-JS handler.
- Treat Torn page content and native handler responses as untrusted data.

## Testing information from the upstream guide

Torn PDA itself is tested primarily with Flutter/Dart tooling. The upstream
testing guide covers environment setup, `flutter test`, focused test files,
analysis, headless/Docker workflows, and adding pure unit tests. Those commands
test the app repository, not this userscript workspace.

For this workspace, emulate the documented boundaries instead:

- unit-test capability detection and bridge error handling;
- provide a mock asynchronous `PDA_storage` with quota failures;
- verify one-time GM-to-native migration and desktop fallback;
- dispatch `tornpda:tabState` events and assert work pauses/resumes once;
- test platform readiness races;
- test HTTP response normalization;
- test share-file fallback without retaining large Base64 strings;
- run real desktop and responsive browser checks;
- test on an actual Torn PDA install before declaring native storage complete.

## OC Suite storage classification

Use the following policy when converting `Torn_OC_Suite_Codex.user.js`:

### Keep in synchronous GM storage

- active tab and subtab;
- theme and compact preferences;
- thresholds, refresh interval, feature toggles;
- small window/launcher coordinates;
- API keys and sheet configuration (still redact everywhere);
- small cursors/status flags and migration markers.

### Move to native bulk storage on capable PDA

- completed OC archive and metadata;
- profit ledger;
- payout ledger and payout-event history;
- CPR archive and TornStats CPR cache;
- war report caches and cache indexes;
- consumables personal-stat/report caches;
- any future unbounded or user-generated history.

### Bound or avoid entirely

- API diagnostic histories;
- call logs and error logs;
- duplicated parsed + raw responses;
- full DOM snapshots;
- repeated report copies;
- Base64/Blob export intermediates.

## Implementation checklist

Before shipping a PDA-related change:

- [ ] Re-read this reference and the specific upstream page linked above.
- [ ] Capability-detect every PDA-only API.
- [ ] Keep one universal distributed userscript.
- [ ] Mount the UI independently of native storage/API latency.
- [ ] Add migration and fallback tests before moving data.
- [ ] Load native bulk data once and batch writes.
- [ ] Handle `QuotaExceeded` without data loss or a dead UI.
- [ ] Pause hidden/inactive PDA WebView work.
- [ ] Verify no additional Torn API calls are introduced by lifecycle events.
- [ ] Test at 1920×1080, 390×844, 430×932, and landscape.
- [ ] Check overflow, touch targets, dialogs, tables, and draggable positions.
- [ ] Verify secrets are absent from logs, DOM, diagnostics, screenshots, and
      exports.
- [ ] Run syntax, focused storage/lifecycle/UI tests, memory-cycle tests, and live
      browser verification.
- [ ] Close only the dedicated debug browser process after testing.

## Known documentation/version caveat

At review time, the official documentation states that `PDA_storage` is
available since v3.15.0, while repository metadata and public release indexing
may not all reflect the same shipped version. This is normal for a moving
`master` branch. The correct compatibility contract is method availability,
not the displayed app or handler version.
