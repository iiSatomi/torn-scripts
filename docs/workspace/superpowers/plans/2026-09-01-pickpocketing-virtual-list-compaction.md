# Pickpocketing Virtual-List Compaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the blank virtual-list slots left by filtered Pickpocketing targets while preserving Torn's real cards, handlers, order, and native layout when filtering is reset.

**Architecture:** Detect a safe common parent for the recognized target wrappers. When at least one wrapper is filtered, add one script-owned class to that parent and use scoped CSS to return helper-owned target wrappers to normal flow; remove the class whenever filtering ends, the list changes, or the route is cleaned up.

**Tech Stack:** Tampermonkey userscript JavaScript, CSS, Node.js built-in test runner, Puppeteer browser fixtures, signed-in isolated Brave debugging profile.

## Global Constraints

- Keep the original downloaded 1.6 userscript unchanged; modify only `Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js`.
- Do not delete, move, clone, or reparent Torn's React-owned target nodes.
- Do not overwrite Torn inline styles; compaction must be controlled only by script-owned classes and scoped CSS.
- Make no additional Torn network requests.
- Use one universal desktop/PDA implementation and feature-detect the live DOM structure.
- If no safe common target parent exists, keep hiding individual cards without compacting an unrelated ancestor.
- Verify 1920x1080, 390x844, 430x932, and 844x390 fixture layouts plus signed-in live Torn desktop and 390x844 PDA layout.

---

### Task 1: Safe common-list detection

**Files:**
- Modify: `Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js`
- Test: `test/pickpocketing-helper.test.cjs`

**Interfaces:**
- Consumes: target-card elements returned by `findTargetCard(titleNode)`.
- Produces: `findSharedListParent(cards: Element[]): Element | null`, exported through `TEST_API`.

- [ ] **Step 1: Write the failing unit tests**

Add `findSharedListParent` to the expected test API and add:

```js
test('compacts only target cards that share one direct list parent', () => {
    const { api } = loadHelper();
    const shared = { children: [] };
    const first = { parentElement: shared };
    const second = { parentElement: shared };
    shared.children.push(first, second);
    assert.equal(api.findSharedListParent([first, second]), shared);

    const other = { children: [] };
    const third = { parentElement: other };
    other.children.push(third);
    assert.equal(api.findSharedListParent([first, third]), null);
    assert.equal(api.findSharedListParent([]), null);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node test/pickpocketing-helper.test.cjs`

Expected: FAIL because `findSharedListParent` is absent from `TEST_API`.

- [ ] **Step 3: Implement the minimal pure detector**

Add before `TEST_API`:

```js
function findSharedListParent(cards) {
    const list = Array.from(cards || []).filter(Boolean);
    if (!list.length) return null;
    const parent = list[0].parentElement;
    if (!parent || !list.every(card => card.parentElement === parent)) return null;
    return parent;
}
```

Export `findSharedListParent` through `TEST_API`.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `node test/pickpocketing-helper.test.cjs`

Expected: all focused tests PASS.

- [ ] **Step 5: Commit the detector and test**

```text
git add -- Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js test/pickpocketing-helper.test.cjs
git commit -m "test: guard pickpocket list compaction scope"
```

---

### Task 2: Reproduce fixed-height virtual-list gaps

**Files:**
- Modify: `test/browser/pickpocketing-helper-fixture.html`
- Create: `test/browser/pickpocketing-helper-compaction.cjs`

**Interfaces:**
- Consumes: existing fixture targets, fetch shim, and the 1.7 userscript.
- Produces: a browser regression that measures the target canvas and visible-card geometry in native, filtered, and reset states.

- [ ] **Step 1: Add an opt-in virtual-list mode to the fixture**

Give the six fixture cards `--virtual-y` values from `0px` through `500px` in `100px` increments. Add this scoped fixture CSS:

```css
html.pp-virtual-fixture #target-grid {
    position: relative;
    display: block;
    height: 600px;
}
html.pp-virtual-fixture #target-grid > .target-card {
    position: absolute;
    inset: 0 0 auto;
    width: 100%;
    height: 92px;
    transform: translateY(var(--virtual-y));
}
```

Before the fetch shim, enable it only for `?virtual=1`:

```js
if (new URLSearchParams(location.search).get('virtual') === '1') {
    document.documentElement.classList.add('pp-virtual-fixture');
}
```

- [ ] **Step 2: Write the browser regression**

Create `test/browser/pickpocketing-helper-compaction.cjs` using the same isolated-browser connection and cleanup pattern as `pickpocketing-helper-responsive.cjs`. For desktop 1920x1080 and PDA 390x844:

```js
await page.goto(`${pathToFileURL(FIXTURE_PATH).href}?virtual=1#/pickpocketing`, {
    waitUntil: 'domcontentloaded',
});
await page.evaluate(() => localStorage.removeItem('ppColorsSettings_v2'));
await page.addScriptTag({ content: source });
await page.waitForSelector('#pp-helper');
await page.evaluate(() => fetch('https://www.torn.com/page.php?sid=crimesData&step=crimesList'));
await page.waitForFunction(() => document.querySelectorAll('.pp-helper-target').length === 6);
await page.click('#pp-helper-toggle');
await page.click('[data-tier="4"]');
await page.click('#pp-ready-only');
await page.waitForFunction(() => document.querySelectorAll('.pp-helper-filtered').length === 5);
```

Measure the remaining visible card and canvas:

```js
const filtered = await page.evaluate(() => {
    const canvas = document.querySelector('#target-grid');
    const visible = Array.from(canvas.children).filter(node => getComputedStyle(node).display !== 'none');
    const canvasRect = canvas.getBoundingClientRect();
    const cardRect = visible[0].getBoundingClientRect();
    return {
        visibleCount: visible.length,
        firstOffset: Math.round(cardRect.top - canvasRect.top),
        canvasHeight: Math.round(canvasRect.height),
        cardHeight: Math.round(cardRect.height),
    };
});
assert.equal(filtered.visibleCount, 1);
assert.ok(filtered.firstOffset <= 1, 'filtered target retains a virtual top gap');
assert.ok(filtered.canvasHeight <= filtered.cardHeight + 1, 'virtual canvas retains hidden target height');
```

Click Reset and assert the canvas returns to 600px and all six cards are visible.

- [ ] **Step 3: Run the browser regression and verify RED**

Run the dedicated browser if it is not already active:

`node test/browser/launch-debug.cjs`

Then run:

`node test/browser/pickpocketing-helper-compaction.cjs`

Expected: FAIL because the remaining visible card keeps its translated offset or the canvas remains 600px tall.

- [ ] **Step 4: Commit the failing regression**

```text
git add -- test/browser/pickpocketing-helper-fixture.html test/browser/pickpocketing-helper-compaction.cjs
git commit -m "test: reproduce filtered virtual-list gaps"
```

---

### Task 3: Reversible native-list compaction

**Files:**
- Modify: `Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js`
- Modify: `test/browser/pickpocketing-helper-compaction.cjs`

**Interfaces:**
- Consumes: `findSharedListParent(cards)` and each row's `card` plus computed hidden state.
- Produces: `syncListCompaction(cards: Element[], active: boolean): void` and the owned `pp-helper-compacted` class.

- [ ] **Step 1: Add scoped compaction CSS**

Add beside `.pp-helper-filtered`:

```css
.pp-helper-compacted {
    display: block !important;
    height: auto !important;
    min-height: 0 !important;
}
.pp-helper-compacted > .pp-helper-target {
    position: relative !important;
    inset: auto !important;
    transform: none !important;
}
.pp-helper-compacted > .pp-helper-filtered {
    display: none !important;
}
```

- [ ] **Step 2: Add reversible class synchronization**

Add after `setCardFiltered`:

```js
function syncListCompaction(cards, active) {
    const parent = findSharedListParent(cards);
    document.querySelectorAll('.pp-helper-compacted').forEach(node => {
        if (!active || node !== parent) node.classList.remove('pp-helper-compacted');
    });
    if (active && parent) parent.classList.add('pp-helper-compacted');
}
```

In `updateColors`, count filtered rows while applying `setCardFiltered`, then call:

```js
syncListCompaction(rows.map(row => row.card), hiddenCount > 0);
```

Call `syncListCompaction([], false)` from `cleanupRoute()` after clearing card decorations.

- [ ] **Step 3: Run the compaction browser test and verify GREEN**

Run: `node test/browser/pickpocketing-helper-compaction.cjs`

Expected: PASS at desktop and PDA widths; the one visible target begins at the canvas top, the canvas shrinks to one card, and Reset restores six visible targets and the 600px native fixture canvas.

- [ ] **Step 4: Run static and responsive regressions**

Run:

```text
node --check Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js
node test/pickpocketing-helper.test.cjs
node test/browser/pickpocketing-helper-responsive.cjs
```

Expected: syntax passes, focused tests pass, and all four responsive fixture viewports pass without helper overlap, horizontal overflow, or sub-44px PDA controls.

- [ ] **Step 5: Verify the actual filtered state on live Torn**

Extend `test/browser/pickpocketing-helper-live.cjs` so a live filter state asserts:

```js
assert.equal(filtered.blankGapViolations.length, 0, `${viewport.name}: filtered list retains blank virtual gaps`);
assert.equal(filtered.compactedParents, 1, `${viewport.name}: filtered list is not compacted exactly once`);
```

Run: `node test/browser/pickpocketing-helper-live.cjs`

Expected: PASS at desktop and 390x844, with visible cards consecutive, one compacted parent, no metadata/cue collision, and exactly one observed crimes-list request per page.

Capture filtered-state screenshots and inspect both before claiming completion.

- [ ] **Step 6: Verify cleanup and original-file preservation**

Run:

```text
Get-FileHash -Algorithm SHA256 -LiteralPath 'C:\Users\asato\Downloads\Torn_Pickpocketing_Colors_Status-Aware_1.6.user.js'
git diff --check
git status --short
```

Expected original SHA-256: `B8AE463859DD5CA43C41440A951AB3CE8ED9F6A2A4D590F9A3C4F0B14C71C01A`.

Close only the exact dedicated Brave process started by `launch-debug.cjs`.

- [ ] **Step 7: Commit the verified fix**

```text
git add -- Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js test/browser/pickpocketing-helper-live.cjs
git commit -m "fix: compact filtered pickpocket targets"
```

