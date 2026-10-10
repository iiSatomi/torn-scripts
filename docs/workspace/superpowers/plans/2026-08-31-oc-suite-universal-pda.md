# OC Suite Universal PDA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship one OC Suite userscript with durable Torn PDA bulk storage, hidden-WebView lifecycle control, and verified desktop/PDA UI.

**Architecture:** Add capability-detected platform and hybrid bulk-store adapters inside the current single userscript. Convert only large/growing stores to the adapter, retain GM for small synchronous settings, and refine the classic shell through narrowly scoped responsive CSS. Tests drive every behavior before production edits.

**Tech Stack:** JavaScript userscript, Node.js `assert`, Puppeteer/Brave CDP, Torn PDA WebView bridge APIs.

## Global Constraints

- Active production target: `Torn_OC_Suite_Codex.user.js`.
- Keep one distributed script for desktop and PDA.
- Do not overwrite original/reference scripts.
- Never expose API keys, sheet secrets, passwords, cookies, or response bodies.
- Desktop browser viewport must be 1920×1080 screen size.
- PDA checks: 390×844, 430×932, and 844×390.
- Use `docs/Torn-PDA-userscript-reference.md` as the compatibility authority.
- Keep shell insertion independent from storage and API latency.
- Do not commit in this dirty workspace unless the user explicitly requests it.

---

### Task 1: Correct the UI browser contract

**Files:**
- Modify: `test/browser/smoke-codex.cjs`
- Modify: `test/browser/launch-debug.cjs`

**Interfaces:**
- Consumes: CDP endpoint `http://127.0.0.1:9222` and the isolated debug profile.
- Produces: independent desktop/mobile pages and screenshot/overflow reports.

- [ ] Replace the stretched mobile “desktop” assertion with a fresh desktop page whose viewport is 1920×1080 (screen) / available browser content dimensions.
- [ ] Add independent 390×844, 430×932, and 844×390 page checks using the same deterministic GM/network shim.
- [ ] Assert shell width, body width, root overflow, page overflow contribution, navigation rows, control sizes, and reachable config close control.
- [ ] Run `node test/browser/smoke-codex.cjs` against the current script and record the expected failing UI assertions.

### Task 2: Add platform and storage contract tests

**Files:**
- Create: `test/codex-pda-platform.test.js`
- Create: `test/codex-pda-storage.test.js`
- Modify: `Torn_OC_Suite_Codex.user.js`

**Interfaces:**
- Consumes: `PDA_storage`, `tornpda:tabState`, `PDA_getTabState`, GM fallback APIs.
- Produces: `OCPlatform` and `OCBulkStore` internal interfaces from the design.

- [ ] Write a source/VM contract that fails until `OCPlatform` feature-detects PDA and combines PDA tab visibility with document visibility.
- [ ] Run `node test/codex-pda-platform.test.js` and confirm the missing-adapter failure.
- [ ] Implement only platform detection, listener cleanup, and the visibility snapshot.
- [ ] Run the platform test and existing lifecycle test.
- [ ] Write storage tests that fail until fixed keys migrate GM→native once, writes batch through `setMany`, desktop uses GM, and `QuotaExceeded` is recorded without throwing into UI code.
- [ ] Run `node test/codex-pda-storage.test.js` and confirm expected failures.
- [ ] Implement `OCBulkStore` with in-memory values, debounced pending writes, migration markers, usage snapshot, and cleanup.
- [ ] Run storage, diagnostics, and lifecycle tests.

### Task 3: Convert large core stores

**Files:**
- Modify: `Torn_OC_Suite_Codex.user.js`
- Modify: `test/codex-pda-storage.test.js`
- Modify: `test/memory-lifecycle.test.js`

**Interfaces:**
- Consumes: `OCBulkStore.getRaw`, `setRaw`, `flush`, and `usage`.
- Produces: native-backed OC/CPR/profit/payout/TornStats/FF cache persistence.

- [ ] Add failing assertions that all classified core large keys use `OCBulkStore`, while API keys/preferences remain GM-only.
- [ ] Run the focused tests and confirm the classification failure.
- [ ] Replace only the classified load/save functions with bulk-store calls.
- [ ] Start bulk hydration concurrently at boot and invalidate parse caches once hydration finishes.
- [ ] Add a bounded unload/visibility flush and keep the shell non-blocking.
- [ ] Run syntax, storage, lifecycle, diagnostics, and memory tests.

### Task 4: Convert embedded War and Consumables storage

**Files:**
- Modify: `Torn_OC_Suite_Codex.user.js`
- Modify: `test/consumables-codex.test.js`
- Modify: `test/codex-pda-storage.test.js`

**Interfaces:**
- Consumes: common bulk-store and small-setting adapters.
- Produces: native-backed war report/personal-stat caches and GM-backed settings.

- [ ] Add failing tests that embedded modules contain no direct `localStorage` persistence and that dynamic war cache prefixes are classified as bulk.
- [ ] Run focused tests and confirm failures point to the existing direct calls.
- [ ] Route Consumables UI/settings/call-log access through small storage wrappers; bound call-log timestamps to the active minute window.
- [ ] Route personal-stat cache and war cache/index/OD history through `OCBulkStore`.
- [ ] Ensure cache clear functions remove both in-memory/native values and desktop GM fallback values safely.
- [ ] Run consumables, storage, war export, lifecycle, and memory tests.

### Task 5: Pause hidden PDA work

**Files:**
- Modify: `Torn_OC_Suite_Codex.user.js`
- Modify: `test/codex-pda-platform.test.js`
- Modify: `test/memory-lifecycle.test.js`

**Interfaces:**
- Consumes: `OCPlatform.isWorkVisible` and `onVisibilityChange`.
- Produces: coalesced pause/resume behavior for core and embedded refresh loops.

- [ ] Add failing fake-timer tests proving inactive PDA tabs make zero refresh calls and reactivation makes at most one stale refresh.
- [ ] Run tests and verify the current unconditional timers fail the contract.
- [ ] Gate core countdown/refresh, sidebar refresh, War auto work, and Consumables auto-refresh.
- [ ] Disconnect the platform listener in the existing teardown path.
- [ ] Run platform, lifecycle, memory, and API-call diagnostic tests.

### Task 6: Refine the classic shell for desktop and PDA

**Files:**
- Modify: `Torn_OC_Suite_Codex.user.js`
- Modify: `test/browser/smoke-codex.cjs`
- Modify: `test/consumables-codex.test.js`

**Interfaces:**
- Consumes: classic shell DOM and browser viewport matrix.
- Produces: scoped desktop/mobile CSS with no suite-level horizontal overflow.

- [ ] Use the corrected browser test to identify each actual overflow/clipping/touch failure.
- [ ] Add or tighten the failing assertion for one defect at a time.
- [ ] Scope premium rail/topbar rules away from `.ocm-classic` where they leak.
- [ ] Refine header wrapping, navigation sizing, mobile input font sizes, touch targets, safe-area offsets, dialog heights, table containment, and embedded window clamping.
- [ ] Run the browser smoke after each CSS slice and inspect generated screenshots.
- [ ] Verify keyboard focus and desktop pointer behavior were not lost.

### Task 7: Extend sanitized diagnostics

**Files:**
- Modify: `Torn_OC_Suite_Codex.user.js`
- Modify: `test/codex-diagnostics.test.js`

**Interfaces:**
- Consumes: `OCPlatform.snapshot()` and `OCBulkStore.snapshot()/usage()`.
- Produces: user-facing environment/storage health without secret contents.

- [ ] Add failing diagnostics tests for environment, visibility, storage mode, usage, pending writes, migrations, and last error code.
- [ ] Run the diagnostics test and confirm missing fields.
- [ ] Add sanitized diagnostic rows; never enumerate values or secret-bearing keys.
- [ ] Run diagnostics and browser panel checks.

### Task 8: Final verification and browser cleanup

**Files:**
- Review: all modified files
- Update if needed: `docs/Torn-PDA-userscript-reference.md`, `AGENTS.md`

**Interfaces:**
- Consumes: all previous slices.
- Produces: verified universal userscript and evidence report.

- [ ] Run `node --check Torn_OC_Suite_Codex.user.js`.
- [ ] Run every focused test listed in `AGENTS.md` plus the new PDA tests.
- [ ] Run the corrected 1920×1080/mobile browser smoke and memory-cycle test.
- [ ] Inspect desktop, portrait PDA, landscape PDA, diagnostics, Consumables, War, and Config screenshots.
- [ ] Review the diff for unrelated changes and accidental secret output.
- [ ] Close the exact dedicated debug browser process without touching normal Brave windows.
- [ ] Report verified behavior, remaining actual-device PDA validation, and deferred ideas.
