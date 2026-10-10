# Browser Test Window Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the visible OC Suite test browser fixed at 1920x1080 while running all PDA emulation and memory tests in a self-cleaning background browser context.

**Architecture:** A focused browser-session helper separates the visible dedicated Torn tab from an isolated background target. Desktop smoke tests inspect but never emulate the foreground page; PDA and memory tests receive a temporary background page that cannot be brought to the front and cannot affect the visible window.

**Tech Stack:** Node.js CommonJS, `puppeteer-core`, Brave/Chromium DevTools Protocol, `node:test`, `node:assert`.

## Global Constraints

- The user’s normal Brave profile and unrelated windows must never be touched or closed.
- The visible dedicated test browser stays on monitor 1 at 1920x1080.
- PDA viewports are exactly 390x844, 430x932, and 844x390.
- Temporary background contexts are closed on both success and failure.
- Cookie values, API keys, and other session data are never logged or written to screenshots.

---

### Task 1: Isolated Browser Session Contract

**Files:**
- Create: `test/browser/browser-session.test.cjs`
- Create: `test/browser/browser-session.cjs`

**Interfaces:**
- Produces: `getVisibleWindowState(page) -> Promise<{windowId,bounds,viewport}>`
- Produces: `assertVisibleWindowUnchanged(before, after) -> void`
- Produces: `withBackgroundTorn(options, callback) -> Promise<unknown>`

- [ ] **Step 1: Write the failing test**

Create fake DevTools and Puppeteer objects that verify unchanged bounds are accepted, changed bounds are rejected, the mobile target is created with `background: true`, foreground activation is rejected, and the browser context closes when the callback throws.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/browser/browser-session.test.cjs`

Expected: FAIL because `browser-session.cjs` does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement the three exported functions. `withBackgroundTorn` creates an isolated browser context and a DevTools background target, copies only the dedicated Torn session into that context, blocks `bringToFront`, invokes the callback, then closes the context and verifies the visible window in `finally`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/browser/browser-session.test.cjs`

Expected: all browser-session contract tests PASS.

### Task 2: Desktop Smoke Must Preserve the Visible Window

**Files:**
- Modify: `test/browser/smoke-codex.cjs`
- Test: `test/browser/browser-session.test.cjs`

**Interfaces:**
- Consumes: `getVisibleWindowState`, `assertVisibleWindowUnchanged`, and `withBackgroundTorn` from Task 1.

- [ ] **Step 1: Add a failing desktop preservation test**

Exercise the visible-state comparison around a fake desktop test action and assert that any width, height, position, or viewport mutation fails with a specific window-stability error.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/browser/browser-session.test.cjs`

Expected: FAIL because the desktop smoke has no stability guard.

- [ ] **Step 3: Remove visible mobile emulation**

Remove `page.setViewport` and every `Emulation.setDeviceMetricsOverride` call from the visible stage. Capture the window state before desktop checks, require a desktop-sized content viewport, then compare the final state before disconnecting.

- [ ] **Step 4: Move the PDA stage into background-context ownership**

After the desktop stage, run the existing PDA matrix, diagnostics, and Consumables interaction checks inside `withBackgroundTorn`. Keep screenshots and assertions unchanged except for obtaining the isolated background page from the callback.

- [ ] **Step 5: Run contract and syntax checks**

Run: `node --test test/browser/browser-session.test.cjs`

Run: `node --check test/browser/smoke-codex.cjs`

Expected: both PASS.

### Task 3: Background Memory Cycle

**Files:**
- Modify: `test/browser/memory-cycle.cjs`
- Test: `test/browser/browser-session.test.cjs`

**Interfaces:**
- Consumes: `withBackgroundTorn({ width: 390, height: 844 }, callback)`.

- [ ] **Step 1: Add a failing cleanup test**

Make the fake memory callback throw and assert that the isolated browser is closed exactly once and the visible browser receives no viewport or emulation command.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/browser/browser-session.test.cjs`

Expected: FAIL until memory-cycle ownership uses the helper.

- [ ] **Step 3: Route memory testing through the background helper**

Create a background target in an isolated context and run all instrumentation and route cycles on its 390x844 page. Keep the authenticated Torn page in the foreground and remove the old foreground `createBrowserContext` and `setViewport` calls.

- [ ] **Step 4: Run contract and syntax checks**

Run: `node --test test/browser/browser-session.test.cjs`

Run: `node --check test/browser/memory-cycle.cjs`

Expected: both PASS.

### Task 4: Live Window and Cleanup Verification

**Files:**
- Modify: `test/browser/launch-debug.cjs` only if live bounds show a launcher regression.
- Verify: `test/browser/smoke-codex.cjs`
- Verify: `test/browser/memory-cycle.cjs`

**Interfaces:**
- Consumes: the completed desktop and background-context test harnesses.

- [ ] **Step 1: Launch the dedicated browser**

Run: `node test/browser/launch-debug.cjs`

Expected: one dedicated Brave window on monitor 1 with 1920x1080 outer bounds.

- [ ] **Step 2: Run the full smoke test**

Run: `node test/browser/smoke-codex.cjs`

Expected: desktop bounds and viewport remain unchanged while all PDA checks pass in a non-foreground tab.

- [ ] **Step 3: Run injected and control memory cycles**

Run: `node test/browser/memory-cycle.cjs Torn_OC_Suite_Codex.user.js`

Run: `$env:SKIP_SCRIPT='1'; node test/browser/memory-cycle.cjs Torn_OC_Suite_Codex.user.js`

Expected: both runs complete in background contexts without changing the visible browser.

- [ ] **Step 4: Close only the dedicated browser**

Connect to the dedicated browser on port 9222 and issue `Browser.close`, then confirm port 9222 is no longer listening. Do not terminate unrelated Brave processes.

- [ ] **Step 5: Run the regression suite**

Run: `node --check Torn_OC_Suite_Codex.user.js`

Run: `node test/codex-lifecycle.test.js`

Run: `node test/memory-lifecycle.test.js`

Expected: all PASS.
