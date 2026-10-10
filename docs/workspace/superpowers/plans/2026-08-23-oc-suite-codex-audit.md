# OC Suite Codex Audit and Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) to implement this plan task-by-task with verification checkpoints. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Find and fix high-confidence correctness, lifecycle, and performance defects in `Torn_OC_Suite_Codex.user.js`, then verify the fixes in live Torn browser routes without changing the script's API or storage contracts.

**Architecture:** Keep the userscript as one isolated Codex variant, but give long-lived route work, timers, and native DOM observers explicit lifecycle slots. The UI renderers remain responsible for their own markup; route bootstrapping owns cancellation and native integrations own observer replacement. The audit harness becomes runnable so future route regressions are observable.

**Tech Stack:** Tampermonkey/Greasemonkey userscript JavaScript, Node.js assertion tests, Puppeteer live browser probes, existing Torn API/storage adapters.

## Global Constraints

- Do not modify `Torn_OC_Suite_PurrfectCrime.user.js` as part of this audit.
- Do not change Torn API endpoints, API-key scopes, Google Sheet contracts, or existing GM/localStorage key names.
- Do not add external libraries, polling loops, or persistent data structures.
- Route listeners, timers, and MutationObservers must have at most one active owner per feature.
- A detached Torn native root must not keep an observer or timer doing work for it.
- Every production fix must have a focused regression check that failed before the fix.
- Existing syntax, loan, memory, spreadsheet, cache, and live browser tests must remain green.

## Findings and acceptance criteria

1. The route injector's insertion poll must be cancellable and must re-check the route before inserting. Acceptance: navigating away before the Torn anchor appears leaves no pending insertion timer and cannot mount `#ocm-root` on the wrong route.
2. The countdown timer must stop when `#ocm-root` disappears. Acceptance: after leaving Crimes, no suite countdown interval remains and the next return starts one fresh timer.
3. The sidebar timer must stop when `#ocm-sidebar-widget` disappears. Acceptance: native-page removal/rebuild does not leave a one-second interval scanning the whole document.
4. Native OC-money and armory observers must be replaced/disconnected when their root changes. Acceptance: repeated native route mounts keep one observer per live root and detached roots are not retained by suite-owned controller references.
5. The all-subtab browser audit must parse and execute. Acceptance: `node test/browser/audit-subtabs.cjs Torn_OC_Suite_Codex.user.js` walks all rendered suite subtabs without a harness syntax error.
6. The live memory probe must show stable Codex-owned nodes and no growing suite timer/observer count across repeated route cycles. Torn-owned listener behavior must be reported separately rather than attributed to the suite.
7. GM-backed API and sheet requests must reject a stalled request within a bounded interval, and every direct API URL must encode its key parameter.

## Task List

### Task 1: Add failing lifecycle regression contracts

**Files:**
- Modify: `test/memory-lifecycle.test.js`
- Create: `test/codex-lifecycle.test.js`

**Interfaces:**
- Consumes: source text from `Torn_OC_Suite_Codex.user.js`.
- Produces: focused assertions for cancellable route insertion, root-aware timers, observer controller slots, and the audit harness syntax check.

- [ ] **Step 1: Add the failing source contracts**

  Assert that the Codex source contains:

  ```js
  let _ocmInjectTimer = null;
  let _ocmMoneyObserver = null;
  let _ocmArmoryObserver = null;
  ```

  Assert that the countdown and sidebar intervals contain a missing-root stop guard, and that the route insertion callback checks `isOcTab()` before building the root.

- [ ] **Step 2: Run the focused tests and verify the expected failure**

  Run:

  ```text
  node test/codex-lifecycle.test.js
  ```

  Expected: FAIL because the new lifecycle slots and guards do not yet exist.

- [ ] **Step 3: Add the audit harness parse check**

  The test reads `test/browser/audit-subtabs.cjs` and runs `node --check` against it. This must fail on the current unmatched callback/loop closure before the harness is repaired.

### Task 2: Harden route insertion and countdown/sidebar timers

**Files:**
- Modify: `Torn_OC_Suite_Codex.user.js` around `startCountdowns()`, `inject()`, and `injectSidebar()`.
- Test: `test/codex-lifecycle.test.js`.

**Interfaces:**
- Consumes: existing `isOcTab()`, `buildRoot()`, `renderSidebarWidget()`, and global timer slots.
- Produces: cancellable route insertion and timers that self-stop when their owning UI is gone.

- [ ] **Step 1: Add a cancellable insertion slot**

  Store the `inject()` insertion interval in `_ocmInjectTimer`, clear it before starting a new attempt, clear it when the route is no longer an OC route, and clear it after successful insertion. The callback must return immediately unless both `isOcTab()` and the expected anchor exist.

- [ ] **Step 2: Add root-aware countdown cleanup**

  At the top of the existing one-second callback, check for `#ocm-root`. If it is absent, clear `window._ocmTimer`, set it to `null`, and return without querying the page.

- [ ] **Step 3: Add sidebar timer cleanup**

  At the top of the sidebar interval callback, check for `#ocm-sidebar-widget`. If it is absent, clear `window._ocmSidebarTimer`, set it to `null`, and return.

- [ ] **Step 4: Run focused syntax and lifecycle verification**

  Run:

  ```text
  node test/codex-lifecycle.test.js
  node --check Torn_OC_Suite_Codex.user.js
  ```

- [ ] **Step 5: Add bounded network failure handling**

  Set a 20-second GM request timeout in both the suite's Torn API wrapper and the embedded Usage Command sheet wrapper. Each timeout must reject with a user-readable error so the existing `finally` paths restore the Refresh controls.

- [ ] **Step 6: Encode every direct API key interpolation**

  Use `encodeURIComponent(apiKey)` in the v1, v2, member-mode, item lookup, ex-member, and sidebar URL builders. Keep the endpoint paths and query parameters otherwise unchanged.

- [ ] **Step 7: Verify network hardening**

  Run `node test/codex-lifecycle.test.js`, `node test/loan-endpoint.test.js`, and `node --check Torn_OC_Suite_Codex.user.js`.

### Task 3: Make native observers lifecycle-owned

**Files:**
- Modify: `Torn_OC_Suite_Codex.user.js` in `initNativeOcMoney()` and `initArmoryAnnotations()`.
- Modify: `test/codex-lifecycle.test.js`.

**Interfaces:**
- Consumes: existing `MutationObserver` callbacks and native root discovery.
- Produces: one disconnectable observer reference per native integration, with replacement when Torn swaps the root.

- [ ] **Step 1: Add observer slots and root identity checks**

  Before observing a newly discovered root, disconnect the prior observer if it exists. Store the new observer and its root in the module-level slots. If the same root is already observed, return without creating another observer.

- [ ] **Step 2: Clear the controller when a root disappears**

  In each observer callback, if the observed root is no longer connected, disconnect it and clear its slot before returning.

- [ ] **Step 3: Add regression assertions**

  Assert the source calls `.disconnect()` before replacing the money and armory observer slots, and that the observers are not created as anonymous one-way `new MutationObserver(...).observe(...)` chains.

- [ ] **Step 4: Verify the observer slice**

  Run the focused test and the live configured/unconfigured smoke checks before continuing.

### Task 4: Repair and expand the browser audit harness

**Files:**
- Modify: `test/browser/audit-subtabs.cjs`.
- Modify: `test/codex-lifecycle.test.js` only for stable harness contracts.

**Interfaces:**
- Consumes: the existing Puppeteer connection, GM shims, and Codex script path argument.
- Produces: a runnable all-subtab browser audit that reports view names, text lengths, and console/page errors.

- [ ] **Step 1: Fix only the callback/loop closure**

  Close the `for (const nav ...)` loop before returning `out`, then close the `page.evaluate()` callback. Do not change the audit's selectors or browser behavior in this slice.

- [ ] **Step 2: Run Node syntax verification**

  Run: `node --check test/browser/audit-subtabs.cjs`

- [ ] **Step 3: Run the live audit with the Codex file**

  Run: `node test/browser/audit-subtabs.cjs Torn_OC_Suite_Codex.user.js`

  Acceptance: the harness reaches its own `Walked ... views` output; any remaining page errors are listed as script/browser findings, not a harness parse failure.

### Task 5: Performance pass for repeated route rendering

**Files:**
- Modify: `Torn_OC_Suite_Codex.user.js` only where the preceding lifecycle guards expose measurable repeated work.
- Modify: `test/browser/memory-cycle.cjs` only if needed to report Codex-owned timer/observer counts separately.

**Interfaces:**
- Consumes: the lifecycle-controlled timer and observer slots.
- Produces: stable suite-owned DOM/timer/observer counts over repeated Crimes → People → War → Armoury cycles.

- [ ] **Step 1: Extend the browser probe with suite-owned metrics**

  Report `#ocm-root` descendants, `#ocm-sidebar-widget`, active suite timer slots, and observer-controller presence. Keep Torn's hash listener count as a separate diagnostic.

- [ ] **Step 2: Run the memory cycle before and after the performance slice**

  Run with at least six cycles at 390×844 and compare the initial/final Codex-owned node and timer counts. The suite must not grow its own counts as routes repeat.

- [ ] **Step 3: Refactor only confirmed hot paths**

  If a suite-owned count grows, fix that path with the smallest root-aware cleanup. Do not add a general event bus or rewrite the existing renderers.

### Task 6: Full verification and code review

**Files:**
- Review: `Torn_OC_Suite_Codex.user.js`.
- Review: `test/codex-lifecycle.test.js`, `test/browser/audit-subtabs.cjs`, and `test/browser/memory-cycle.cjs`.

- [ ] **Step 1: Run the focused suite**

  ```text
  node test/codex-lifecycle.test.js
  node test/consumables-codex.test.js
  node test/loan-endpoint.test.js
  node test/memory-lifecycle.test.js
  node --check Torn_OC_Suite_Codex.user.js
  ```

- [ ] **Step 2: Run existing browser regressions**

  ```text
  node test/browser/test-sweep-xlsx.cjs
  node test/browser/test-sweep-od-cache.cjs
  node test/browser/smoke.cjs Torn_OC_Suite_Codex.user.js
  node test/browser/smoke-codex.cjs
  node test/browser/audit-subtabs.cjs Torn_OC_Suite_Codex.user.js
  ```

- [ ] **Step 3: Review correctness, security, readability, architecture, and performance**

  Confirm that no API key is added to logs, all API-sourced markup remains escaped, no interval or observer is duplicated, and the new cleanup code does not alter the loan or Consumables data flow.

- [ ] **Step 4: Run whitespace and status checks**

  ```text
  git diff --check -- Torn_OC_Suite_Codex.user.js test/codex-lifecycle.test.js test/browser/audit-subtabs.cjs test/browser/memory-cycle.cjs
  git status --short
  ```

  Git commits are attempted only if the repository index is writable; otherwise the changed files and verification evidence are handed off without touching unrelated user work.

## Later improvement ideas (not implemented in this audit unless a verified defect requires them)

- Replace whole-sidebar HTML replacement every second with a stable shell and text-only countdown updates.
- Add a small “data freshness and source” indicator to Loans so a stale snapshot cannot look live.
- Add a fixture-driven parser test for all armory categories, including array, object, numeric, and comma-separated `loaned_to` payloads.
- Add a compact “API calls this session” diagnostic to help TornPDA users identify which module is exhausting rate or memory budgets.
- Split the source into buildable modules so the shipped userscript can remove unused embedded modules on pages that never open War or Usage Command.
