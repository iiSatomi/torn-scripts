# OC Suite universal desktop/PDA design

Date: 2026-08-31

## Goal

Keep one distributable `Torn_OC_Suite_Codex.user.js` while making its storage,
lifecycle, and UI operate correctly in desktop userscript managers and Torn PDA.

## Evidence driving the design

- Torn PDA's GM compatibility storage is backed by shared WebView
  `localStorage`; it is not the app's durable per-script SQLite store.
- `PDA_storage` is a separate asynchronous API intended for sizeable caches,
  datasets, and history.
- The current suite stores growing OC, CPR, payout, war, and consumables data in
  GM/localStorage.
- Torn PDA WebViews can remain alive while hidden. The current suite does not use
  the documented PDA tab-state signal to pause work.
- The current browser smoke test begins as a mobile page and stretches that page
  to 1280×800 for its “desktop” assertion, so it does not verify the user's real
  1920×1080 layout.
- The classic shell is the required visual baseline. It currently inherits a
  number of broad `.ocm-ui2` rules originally written for the premium rail shell.

## Architecture

### One universal script

The script keeps one metadata block, one feature engine, and one distributed
file. PDA-only behavior is activated by method availability. Viewport CSS is
independent of PDA detection so a narrow desktop window and a wide tablet both
receive appropriate layouts.

### Platform adapter

A small `OCPlatform` object will own environment and visibility behavior:

```js
OCPlatform.init(): Promise<PlatformSnapshot>
OCPlatform.isWorkVisible(): boolean
OCPlatform.onVisibilityChange(listener): () => void
OCPlatform.snapshot(): PlatformSnapshot
```

`PlatformSnapshot` contains only non-sensitive diagnostics:

```js
{
  isPda: boolean,
  nativeStorage: boolean,
  activeTab: boolean,
  webViewVisible: boolean,
  documentVisible: boolean
}
```

The adapter listens to `tornpda:tabState`, queries `PDA_getTabState` when safe,
and falls back to `document.visibilityState`. It never blocks shell insertion.

### Hybrid bulk storage

A `OCBulkStore` adapter handles only keys classified as large/growing:

```js
OCBulkStore.init(keys): Promise<void>
OCBulkStore.getRaw(key, fallback): string
OCBulkStore.setRaw(key, value): void
OCBulkStore.delete(key): void
OCBulkStore.flush(): Promise<void>
OCBulkStore.usage(): Promise<StorageSnapshot>
OCBulkStore.snapshot(): StorageSnapshot
```

The sync `getRaw`/`setRaw` surface lets the existing engine continue operating
without rewriting every renderer as async. On desktop/old PDA it delegates to
GM storage. On native PDA:

1. `init` uses one `getMany` call for known fixed keys.
2. Missing native values are migrated once from valid GM values.
3. Reads use an in-memory map after hydration.
4. Writes update memory immediately and enter a pending map.
5. A short debounce coalesces writes into `PDA_storage.setMany`.
6. page hide/unload and explicit checkpoints request a flush.
7. `QuotaExceeded` retains memory/legacy fallback and updates diagnostics.

Dynamic-prefix caches (war IDs and contracts) use `loadAll()` once and retain
only matching keys in memory. They use the same batched write path.

Initial implementation keys:

- `ocs_oc_archive`, `ocs_oc_archive_meta`, `ocs_profit_ledger`;
- `ocs_payout_ledger`, `ocs_payout_events`, `ocs_cpr_archive`;
- `ocs_ts_cpr_cache`, `ocs_war_ff_cache`;
- `twpr_cache_index`, `twpr_cache_*`, and large war/OD cache keys;
- `frostbiteUsage.psCache.v1` and bounded consumables call history.

Small settings and secrets stay in GM storage. The embedded consumables module
will stop accessing `localStorage` directly and use compatibility wrappers so it
does not compete with Torn's page data.

### Lifecycle control

Automatic refresh and module timers check `OCPlatform.isWorkVisible()` before
network or heavy rendering work. When hidden they pause; when visible they run at
most one stale-data refresh. No lifecycle event may create an extra Torn API call
if data remains fresh.

### Responsive UI

The classic shell remains visually recognizable. Refinement focuses on:

- true 1920×1080 desktop validation;
- removing premium-shell rules that leak into classic mode;
- 44 px touch targets on PDA navigation and critical controls;
- responsive header actions and readable 16 px mobile inputs;
- safe-area padding for fixed embedded controls;
- bounded dialogs and internal table scrolling;
- 390×844, 430×932, and 844×390 overflow checks;
- non-drag/clamped embedded windows on touch layouts.

No feature is removed or moved into a separate PDA script.

## Startup and migration safety

- Build and insert the shell immediately when its Torn anchor exists.
- Begin platform/storage initialization concurrently.
- Before hydration finishes, large reads can use existing GM data.
- After hydration, native data becomes authoritative on capable PDA.
- Never delete legacy values during the first migration release.
- Never copy secrets into native diagnostics or logs.

## Diagnostics

The existing diagnostics panel gains:

- environment: desktop/Torn PDA/unknown;
- work visibility and PDA tab state;
- bulk storage mode: GM fallback or native SQLite;
- native used/quota bytes when available;
- pending write count, migration count, and last storage error code;
- no keys' contents and no API/sheet secrets.

## Verification contract

- Contract tests prove native feature detection, migration, batching, fallback,
  quota handling, and visibility pause/resume.
- Existing syntax, lifecycle, diagnostics, consumables, memory, and loan tests
  remain green.
- A real desktop page is loaded at 1920×1080, not an emulated mobile page.
- Separate mobile pages verify 390×844, 430×932, and 844×390.
- Tests assert no suite-level horizontal overflow and capture screenshots.
- A dedicated browser is closed by exact process/profile ownership after the run.

## Deferred work

- Splitting the source into build-time modules remains a later change. This work
  creates internal interfaces that can become module boundaries without changing
  the single distributed userscript.
- PDA-native notifications are not added in this change.
- Legacy large GM values are not automatically deleted in this change.
