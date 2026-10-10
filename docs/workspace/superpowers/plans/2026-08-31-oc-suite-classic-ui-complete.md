# OC Suite Classic UI Complete Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the complete Codex/PurrfectCrime/rebuild feature set through the classic 3.36 OC Suite shell.

**Architecture:** Keep `Torn_OC_Suite_Codex.user.js` as the complete behavior baseline. Replace only its outer rail/topbar markup and add a final classic-shell style layer; retain all current feature pane IDs, classes, renderers, storage, and lifecycle controllers.

**Tech Stack:** Tampermonkey userscript JavaScript, Node.js assertions, Puppeteer browser checks, existing GM/Torn API adapters.

## Global Constraints

- Do not modify `Torn_OC_Suite.user.js.bak-v336-20260807-052330`.
- Do not modify `Torn_OC_Suite_PurrfectCrime.user.js`.
- Do not change Torn API endpoints, grants, connect domains, storage keys, or sheet contracts.
- Keep `.ocm-nav`, `.ocm-tab`, `data-tab`, and all `#ocm-pane-*` IDs compatible.
- Add no timers, observers, listeners, requests, or external dependencies.
- Preserve PDA usability and prevent horizontal shell overflow at 390 CSS pixels.
- Every production behavior change begins with a focused failing test.

---

### Task 1: Classic shell behavior contract

**Files:**
- Create: `test/oc-suite-classic-ui.test.js`
- Read: `Torn_OC_Suite_Codex.user.js`

**Interfaces:**
- Consumes: shipped `OCM_NAV`, `buildRailNav()`, and `buildRoot()`.
- Produces: executable assertions for the shell and complete feature navigation.

- [ ] **Step 1: Write the failing behavior test**

  Extract the real function bodies, execute them with a fake `document.createElement`,
  and assert these literal outcomes:

  ```js
  assert.equal(root.className, 'ocm-ui2 ocm-classic');
  assert.match(root.innerHTML, /id="ocm-header"/);
  assert.match(root.innerHTML, /class="ocm-tabs" id="ocm-tabs"/);
  assert.doesNotMatch(root.innerHTML, /id="ocm-rail"|id="ocm-topbar"/);
  for (const pane of ['home','crimes','people','consumables','war','armoury']) {
    assert.match(root.innerHTML, new RegExp(`id="ocm-pane-${pane}"`));
  }
  ```

- [ ] **Step 2: Run the test and verify RED**

  Run: `node test/oc-suite-classic-ui.test.js`

  Expected: FAIL because the current root is `ocm-ui2` and still renders
  `#ocm-rail` plus `#ocm-topbar`.

### Task 2: Replace the outer shell without changing feature panes

**Files:**
- Modify: `Torn_OC_Suite_Codex.user.js` in metadata and `buildRoot()`.
- Test: `test/oc-suite-classic-ui.test.js`.

**Interfaces:**
- Consumes: `buildRailNav()`, current config markup, and all current pane markup.
- Produces: `#ocm-header`, `.ocm-tabs#ocm-tabs`, and the unchanged pane tree.

- [ ] **Step 1: Update the userscript version**

  Change `@version` from `3.37.0-codex2` to `3.37.0-codex3` and update the
  mounted-version marker to the same release.

- [ ] **Step 2: Replace only the shell wrapper**

  Set `root.className = 'ocm-ui2 ocm-classic'`. Render the 3.36 header controls,
  then the existing Legend and Config sections, and place
  `<div class="ocm-tabs" id="ocm-tabs">${buildRailNav()}</div>` inside
  `#ocm-body` before the feature panes. Remove the rail/topbar/main/scroll wrappers.

- [ ] **Step 3: Run the focused test and verify GREEN**

  Run: `node test/oc-suite-classic-ui.test.js`

  Expected: PASS with six main panes and all current settings controls present.

### Task 3: Classic visual adapter

**Files:**
- Modify: `Torn_OC_Suite_Codex.user.js` at the end of the main `GM_addStyle` block.
- Test: `test/oc-suite-classic-ui.test.js`.

**Interfaces:**
- Consumes: existing 3.36 unscoped styles and current `.ocm-ui2` feature styles.
- Produces: modifier-scoped classic overrides under `.ocm-classic`.

- [ ] **Step 1: Extend the failing test with computed shell contracts**

  Assert the shipped style text contains modifier-scoped rules for horizontal
  `#ocm-tabs`, hidden rail pseudo-accent, classic header, flat cards, flat stats,
  responsive tab wrapping, and reduced-motion compatibility.

- [ ] **Step 2: Run the test and verify RED**

  Run: `node test/oc-suite-classic-ui.test.js`

  Expected: FAIL because the classic modifier rules do not exist.

- [ ] **Step 3: Add the minimal final override block**

  Add `.ocm-classic` rules after premium rules so the cascade restores the 3.36
  header, underline tabs, neutral cards, independent stat tiles, flat section
  headers, and mobile wrapping while retaining feature-specific component styles.

- [ ] **Step 4: Run the test and verify GREEN**

  Run: `node test/oc-suite-classic-ui.test.js`

### Task 4: Feature-parity regression gate

**Files:**
- Modify: `test/oc-suite-classic-ui.test.js` only for executable shell assertions.
- Verify: existing test files.

**Interfaces:**
- Consumes: complete Codex userscript after shell adaptation.
- Produces: evidence that shell changes did not remove functional modules.

- [ ] **Step 1: Run syntax and focused contracts**

  ```text
  node --check Torn_OC_Suite_Codex.user.js
  node test/oc-suite-classic-ui.test.js
  node test/codex-diagnostics.test.js
  node test/codex-lifecycle.test.js
  node test/consumables-codex.test.js
  node test/loan-endpoint.test.js
  node test/memory-lifecycle.test.js
  ```

- [ ] **Step 2: Run the existing data/export regressions**

  ```text
  node test/browser/test-sweep-csv.cjs
  node test/browser/test-sweep-xlsx.cjs
  node test/browser/test-sweep-od-cache.cjs
  ```

### Task 5: Browser verification

**Files:**
- Modify: `test/browser/smoke-codex.cjs` only if its expectations depend on the removed rail layout.
- Verify: `Torn_OC_Suite_Codex.user.js`.

**Interfaces:**
- Consumes: a dedicated logged-in Brave debug page and the current GM shim.
- Produces: tab-walk, mobile-overflow, diagnostics, and console-error evidence.

- [ ] **Step 1: Run the classic script in the isolated browser**

  ```text
  node test/browser/launch-debug.cjs
  node test/browser/smoke-codex.cjs
  node test/browser/audit-subtabs.cjs Torn_OC_Suite_Codex.user.js
  ```

- [ ] **Step 2: Verify the visible shell**

  Confirm the header appears above a wrapping underline tab strip, no left rail is
  visible, every main tab opens, every subtab renders non-empty content, PDA width
  has no horizontal shell overflow, and the console contains no suite errors.

- [ ] **Step 3: Close only the dedicated test browser process**

  Do not terminate the user's unrelated Brave windows.

### Task 6: Final review

**Files:**
- Review: `Torn_OC_Suite_Codex.user.js`.
- Review: `test/oc-suite-classic-ui.test.js`.

**Interfaces:**
- Consumes: final diff and fresh verification output.
- Produces: a release-ready classic-UI Codex userscript.

- [ ] **Step 1: Check scope and secrets**

  Confirm only metadata, outer shell markup, and classic styling changed in the
  userscript; no API key, sheet secret, session cookie, or response data appears in
  the diff.

- [ ] **Step 2: Run final verification**

  ```text
  node --check Torn_OC_Suite_Codex.user.js
  node test/oc-suite-classic-ui.test.js
  node test/codex-diagnostics.test.js
  node test/codex-lifecycle.test.js
  node test/consumables-codex.test.js
  node test/loan-endpoint.test.js
  node test/memory-lifecycle.test.js
  git diff --check -- Torn_OC_Suite_Codex.user.js test/oc-suite-classic-ui.test.js
  ```

- [ ] **Step 3: Inspect working-tree scope**

  Run `git status --short` and report unrelated pre-existing changes separately.

