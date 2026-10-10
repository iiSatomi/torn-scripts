# Consumables Codex Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Create `Torn_OC_Suite_Codex.user.js`, a safe variant of the current OC Suite with a mobile-first Consumables tab that balances operational highlights with member history.

**Architecture:** Copy the current userscript as an independent variant, preserving its API/storage behavior and all existing fixes. Replace only the native inline Consumables presentation with focused render helpers for the header, usage pulse, attention list, responsive member ledger, and compact trends; keep the embedded Frostbite module as the data source and settings owner.

**Tech Stack:** Tampermonkey/Greasemonkey userscript JavaScript, existing OC Suite inline CSS variables and `OCUI` helpers, Node.js assertion tests, Puppeteer live browser smoke tests.

## Global Constraints

- The existing `Torn_OC_Suite_PurrfectCrime.user.js` must not be modified by this redesign.
- The new file is `Torn_OC_Suite_Codex.user.js` and must keep the existing Torn match scope and grants.
- Do not change the Google Sheet contract, Torn API calls, local-storage keys, or embedded Frostbite data model.
- No new external libraries, images, network calls, or persistent data structures.
- The first 390px viewport must show the usage pulse and attention section without horizontal scrolling.
- Existing dark navy and ice-blue OC Suite styling remains the base visual language.
- Interactive controls must have accessible names, visible focus, and keyboard operation.
- Loading, configured, empty, unconfigured, and error states must remain explicit.

---

### Task 1: Create the isolated Codex variant

**Files:**
- Create: `Torn_OC_Suite_Codex.user.js` (copy of `Torn_OC_Suite_PurrfectCrime.user.js`)
- Test: `test/consumables-codex.test.js`

**Interfaces:**
- Consumes: the current working userscript, including the ui71 memory lifecycle fix and ui70 API v1 armory fix.
- Produces: an independent userscript whose metadata names it `Torn OC Suite Codex` and whose version is `3.37.0-codex1`.

- [ ] **Step 1: Write the failing variant-isolation test**

  Create a Node assertion test that reads both files and checks that the Codex file exists, has the Codex metadata, preserves the required grants, and contains the current route-watcher guard. Before the copy exists, the test must fail with a missing-file assertion.

- [ ] **Step 2: Run the test and verify it fails**

  Run: `node test/consumables-codex.test.js`

  Expected: FAIL because `Torn_OC_Suite_Codex.user.js` does not exist yet.

- [ ] **Step 3: Create the independent copy and update only metadata**

  Copy the current suite into `Torn_OC_Suite_Codex.user.js`, then change only its userscript name, version, and top changelog entry to identify the Codex variant. Keep the original file unchanged.

- [ ] **Step 4: Run the isolation test and syntax check**

  Run:

  ```text
  node test/consumables-codex.test.js
  node --check Torn_OC_Suite_Codex.user.js
  ```

  Expected: both commands exit 0; the original suite’s file content and version remain unchanged by this task.

- [ ] **Step 5: Commit the isolated baseline**

  ```text
  git add Torn_OC_Suite_Codex.user.js test/consumables-codex.test.js
  git commit -m "feat: add isolated OC Suite Codex variant"
  ```

### Task 2: Add the presentation regression contract

**Files:**
- Modify: `test/consumables-codex.test.js`
- Modify: `Torn_OC_Suite_Codex.user.js` only after the test is red

**Interfaces:**
- Consumes: the Codex source text from Task 1.
- Produces: static contracts for the new Consumables structure: `ocm-cons-pulse`, `ocm-cons-attention`, `ocm-cons-ledger`, `ocm-cons-trends`, labeled search/sort controls, and an `aria-live` status region.

- [ ] **Step 1: Extend the test with failing UI contracts**

  Assert that the Codex source contains the named render helpers and markup IDs, and that the old six-stat `OCUI.grid(fields.map(...))` construction is no longer used by the native `renderConsumables()` implementation.

- [ ] **Step 2: Run the focused test and verify it fails**

  Run: `node test/consumables-codex.test.js`

  Expected: FAIL on the first missing Codex Consumables helper or markup contract.

- [ ] **Step 3: Keep the test narrow**

  Do not assert exact copy, pixel values, or row counts. The test should guard hierarchy and accessibility hooks, not freeze visual details.

### Task 3: Implement the balanced Consumables presentation

**Files:**
- Modify: `Torn_OC_Suite_Codex.user.js:13430-13480` (native Consumables renderer)
- Modify: `Torn_OC_Suite_Codex.user.js` near the existing OC Suite style block around the `.ocm-ui2` rules

**Interfaces:**
- Consumes: `FBUSAGE.getState()`, `FBUSAGE.STAT_FIELDS`, `FBUSAGE.PERIODS`, `FBUSAGE.periodValue()`, `FBUSAGE.setPeriod()`, `FBUSAGE.refresh()`, `openSuiteConfig()`, `_num()`, and `OCUI.esc()`.
- Produces: `renderConsumablesHeader()`, `renderConsumablesPulse()`, `renderConsumablesAttention()`, `renderConsumablesLedger()`, `renderConsumablesTrends()`, and a `renderConsumables()` coordinator.

- [ ] **Step 1: Add local UI state without persistence**

  Add a small state object beside `_consMounted` with `query`, `sortKey`, and `sortDir`. It must reset only on a fresh userscript load and must not write to the Frostbite settings keys.

- [ ] **Step 2: Add the header and pulse render helpers**

  Build a compact header with labeled Refresh and Settings controls, the selected period, and a polite sync status. Build a single pulse block with Xanax total, total counter activity, active member count, and last sync. Render a horizontal category mix that uses widths capped to 100% and text labels so color is not the only signal.

- [ ] **Step 3: Add the attention section**

  Select the top two or three members by total activity, include their leading category and selected-period value, and label the reason in text. Return a useful empty state when no member has activity.

- [ ] **Step 4: Add responsive ledger markup**

  Render a labeled search input and sort control, a desktop table, and mobile stacked rows using the same member data. The mobile row must put member name and total first, with category details beneath it. Filter by name and sort by Total, Xanax, or Name in memory.

- [ ] **Step 5: Add compact trends**

  Render category rows using available period values and relative bars, with a clear note when a category is lifetime-only or has no comparable delta. Do not introduce a chart library or canvas.

- [ ] **Step 6: Replace the old renderer and preserve interactions**

  Keep period buttons wired to `FBUSAGE.setPeriod()` and rerender all sections. Keep Refresh async behavior and Settings routing. Preserve the not-configured panel, but make it compact and instructional. Keep the embedded Frostbite shell hidden as before.

- [ ] **Step 7: Add responsive, focus, and reduced-motion CSS**

  Use existing OC Suite variables, 4px-based spacing, restrained borders, and no new gradients or heavy shadows. Add breakpoints for 390px and 768px, visible `:focus-visible`, and a reduced-motion rule for any transition.

### Task 4: Verify the Codex variant in unit-style and live browsers

**Files:**
- Test: `test/consumables-codex.test.js`
- Test: `test/browser/smoke-codex.cjs`
- Test output: `test/browser/shots/codex-*` and `test/browser/codex-smoke-report.json`

**Interfaces:**
- Consumes: the completed `Torn_OC_Suite_Codex.user.js` and the existing isolated Brave profile.
- Produces: syntax, structure, screenshot, responsive, interaction, and console-error evidence.

- [ ] **Step 1: Run focused and existing checks**

  Run:

  ```text
  node test/consumables-codex.test.js
  node --check Torn_OC_Suite_Codex.user.js
  node test/loan-endpoint.test.js
  node test/browser/test-sweep-xlsx.cjs
  node test/browser/test-sweep-od-cache.cjs
  ```

- [ ] **Step 2: Run the live desktop smoke test**

  Inject only the Codex file in the isolated debug browser, visit Consumables, and verify the pulse, attention, ledger, period controls, Refresh, Settings, and no console errors. Capture the configured and unconfigured states when the test session has each state available.

- [ ] **Step 3: Run the live mobile-width check**

  Use a 390×844 viewport and verify no horizontal overflow, the pulse and attention sections are visible before the ledger, mobile rows show totals first, and all primary controls can receive focus.

- [ ] **Step 4: Review screenshots and report limitations**

  Compare Codex screenshots with the current Consumables screenshot. Record any browser-owned Torn React warnings separately from Codex errors; do not treat forced hash-navigation warnings as a clean application console.

- [ ] **Step 5: Commit the redesign variant**

  ```text
  git add Torn_OC_Suite_Codex.user.js test/consumables-codex.test.js test/browser/smoke-codex.cjs
  git commit -m "feat: redesign Codex consumables tab"
  ```
