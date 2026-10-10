# Pickpocketing Helper 1.7 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify a responsive Torn Pickpocketing Helper 1.7 with an inline settings accordion, conservative audited target guidance, gap-free filtering, and desktop/PDA-sized browser coverage.

**Architecture:** Keep one dependency-free userscript IIFE, but separate its internal pure policy/settings functions from DOM rendering, traffic observation, and lifecycle control. Expose a frozen API only when `globalThis.__PP_HELPER_TEST_MODE__ === true`, allowing Node tests to execute the shipped functions without booting the userscript. Use a controlled HTML fixture for deterministic browser layout checks, then verify the same artifact against Torn's live authenticated route.

**Tech Stack:** Vanilla JavaScript userscript, Node.js `node:test`/`assert`, `vm`, Puppeteer Core over the existing dedicated Brave CDP profile, HTML/CSS fixture.

## Global Constraints

- Preserve `C:\Users\asato\Downloads\Torn_Pickpocketing_Colors_Status-Aware_1.6.user.js` unchanged; its pre-work SHA-256 is `B8AE463859DD5CA43C41440A951AB3CE8ED9F6A2A4D590F9A3C4F0B14C71C01A`.
- Create one universal `Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js`; do not make a PDA-only distribution.
- Add no remote runtime dependency and no `@require` dependency.
- Observe Torn's existing crimes-list traffic; make no additional Torn API request.
- Treat exact skill cutoffs and tiers as conservative community guidance, never official success probabilities or real XP.
- Unknown targets/statuses and missing live status must never be promoted to `GO`.
- Use responsive CSS by viewport width, not PDA capability detection.
- Suspend nonessential work for inactive PDA tabs and hidden desktop documents; resume with one coalesced repaint.
- Browser acceptance sizes are exactly 1920×1080, 390×844, 430×932, and 844×390.
- Filtered targets must collapse at the exact target-card boundary and restore without overwriting unrelated Torn styles.
- Keep the existing `ppColorsSettings_v2` key so 1.6 settings survive.
- Close only the exact dedicated browser process launched for testing.

## File map

- Create `Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js` — shipped universal userscript.
- Create `test/pickpocketing-helper.test.cjs` — source-backed pure logic, settings, DOM contract, fetch, and lifecycle tests.
- Create `test/browser/pickpocketing-helper-fixture.html` — deterministic Torn-like target grid and crimes response fixture.
- Create `test/browser/pickpocketing-helper-responsive.cjs` — desktop/mobile visual and interaction checks plus screenshots.
- Create `test/browser/pickpocketing-helper-live.cjs` — authenticated live-route DOM/response/status audit without making API calls.
- Create `docs/Pickpocketing-helper-logic-audit.md` — evidence table distinguishing official mechanics, observed fields, and advisory rules.
- Modify `AGENTS.md` only if verification establishes a durable project fact that future work needs; otherwise leave it untouched.

---

### Task 1: Establish the 1.7 artifact and source-backed test seam

**Files:**
- Create: `test/pickpocketing-helper.test.cjs`
- Create: `Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js`

**Interfaces:**
- Consumes: the immutable 1.6 download.
- Produces: `globalThis.__PP_HELPER_TEST_API__` containing `resolveMark`, `normalizeSettings`, `verdict`, `consumeStatus`, `summaryText`, `setCardFiltered`, `onActivityChange`, and `DEFAULT_SETTINGS` only in test mode.

- [ ] **Step 1: Write the failing artifact/test-mode contract**

Create `test/pickpocketing-helper.test.cjs` with a `loadHelper()` that reads the new 1.7 file, executes it in a `vm` context with `__PP_HELPER_TEST_MODE__: true`, and returns `__PP_HELPER_TEST_API__`. Begin with these assertions:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SCRIPT = path.resolve(__dirname, '..', 'Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js');

function loadHelper(overrides = {}) {
  const context = {
    console,
    URL,
    __PP_HELPER_TEST_MODE__: true,
    location: { href: 'https://www.torn.com/loader.php?sid=crimes#/pickpocketing' },
    ...overrides,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(SCRIPT, 'utf8'), context, { filename: SCRIPT });
  return { api: context.__PP_HELPER_TEST_API__, context };
}

test('ships version 1.7 and exposes a frozen source-backed test API', () => {
  const source = fs.readFileSync(SCRIPT, 'utf8');
  const { api } = loadHelper();
  assert.match(source, /^\/\/ @version\s+1\.7$/m);
  assert.equal(Object.isFrozen(api), true);
  assert.deepEqual(Object.keys(api).sort(), [
    'DEFAULT_SETTINGS', 'consumeStatus', 'normalizeSettings', 'onActivityChange',
    'resolveMark', 'setCardFiltered', 'summaryText', 'verdict',
  ]);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/pickpocketing-helper.test.cjs`

Expected: FAIL with `ENOENT` for `Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js`.

- [ ] **Step 3: Create the minimal 1.7 artifact and dormant test seam**

Add the 1.6 source as the new workspace file through `apply_patch`, bump only `@version` to `1.7`, define `DEFAULT_SETTINGS`, and place this gate immediately before normal boot:

```js
const TEST_API = Object.freeze({
    DEFAULT_SETTINGS,
    resolveMark,
    normalizeSettings,
    verdict,
    consumeStatus,
    summaryText,
    setCardFiltered,
    onActivityChange,
});
if (globalThis.__PP_HELPER_TEST_MODE__ === true) {
    globalThis.__PP_HELPER_TEST_API__ = TEST_API;
    return;
}
```

Add minimal named functions returning current 1.6-equivalent values so the source loads; do not redesign UI in this task.

- [ ] **Step 4: Run syntax and focused tests to verify GREEN**

Run:

```text
node --check Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js
node --test test/pickpocketing-helper.test.cjs
```

Expected: both exit 0; one test passes.

- [ ] **Step 5: Commit the test seam slice**

```text
git add Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js test/pickpocketing-helper.test.cjs
git commit -m "test: establish pickpocketing helper 1.7 seam"
```

---

### Task 2: Audit and encode conservative mark/status policy

**Files:**
- Modify: `test/pickpocketing-helper.test.cjs`
- Modify: `Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js`
- Create: `docs/Pickpocketing-helper-logic-audit.md`

**Interfaces:**
- Consumes: `{ name, statusIcon, skill, build }` from live DOM/response ingestion.
- Produces: `resolveMark(text) -> { name, tier, difficulty } | null`; `verdict(name, statusIcon, skill, build) -> 'GO' | 'WAIT' | 'AVOID' | 'CAUTION'`; `consumeStatus(pool, icon) -> status | null`.

- [ ] **Step 1: Record the evidence matrix before changing verdict behavior**

Create `docs/Pickpocketing-helper-logic-audit.md` with one row for every exact mark name and columns `Mark`, `Official difficulty`, `Observed statuses`, `Advisory tier`, `Verdict rule`, `Evidence`. Seed official difficulty from the Torn wiki and mark live-only fields as `Not yet observed` until Task 7. Explicitly record:

```text
Official: target type, body type, status, and skill all affect difficulty.
Advisory: tiers and numeric skill cutoffs are community strategy, not Torn probabilities.
Unmodeled: build/body never upgrades a verdict until the live field is proven stable.
Fallback: missing/unknown status is WAIT; unknown target is unresolved and never GO.
```

- [ ] **Step 2: Write failing table and boundary tests**

Add tests that assert all 22 names resolve once, Mobster and Police Officer are `very difficult`, missing/unknown status is never `GO`, Police remains `AVOID` below 100 and `CAUTION` at 100, Cyclist remains `AVOID` below 80, Jogger is only `GO` while walking at or above 65, Sex Worker/Thug special statuses require skill 45, and duplicated icon queues consume in response order:

```js
const MARKS = [
  'Businessman', 'Businesswoman', 'Classy lady', 'Cyclist', 'Drunk man',
  'Drunk woman', 'Elderly man', 'Elderly woman', 'Gang member',
  'Homeless person', 'Jogger', 'Junkie', 'Laborer', 'Mobster',
  'Police officer', 'Postal worker', 'Rich kid', 'Sex worker', 'Student',
  'Thug', 'Young man', 'Young woman',
];

test('resolves the complete current 22-mark set', () => {
  const { api } = loadHelper();
  assert.equal(new Set(MARKS.map(name => api.resolveMark(name).name)).size, 22);
  assert.equal(api.resolveMark('Mobster').difficulty, 'very difficult');
  assert.equal(api.resolveMark('Police officer').difficulty, 'very difficult');
});

test('uses conservative unknown and high-risk boundaries', () => {
  const { api } = loadHelper();
  assert.equal(api.verdict('Jogger', null, 100, null), 'WAIT');
  assert.equal(api.verdict('Jogger', 'walking', 64, null), 'WAIT');
  assert.equal(api.verdict('Jogger', 'walking', 65, null), 'GO');
  assert.equal(api.verdict('Cyclist', 'cycling', 79, null), 'AVOID');
  assert.equal(api.verdict('Police officer', 'running', 99, null), 'AVOID');
  assert.equal(api.verdict('Police officer', 'running', 100, null), 'CAUTION');
  assert.equal(api.verdict('Unknown mark', 'distracted', 100, null), 'WAIT');
});
```

- [ ] **Step 3: Run the focused test and verify RED**

Run: `node --test test/pickpocketing-helper.test.cjs`

Expected: FAIL because the 1.6 groups misclassify Mobster as tier 4/risky and the old safe/high-skill fallthrough promotes missing status.

- [ ] **Step 4: Replace parallel groups with one audited policy table**

Use one canonical object so name, tier, difficulty, and status rules cannot drift:

```js
const MARK_POLICY = Object.freeze({
    'Drunk man':       { tier: 1, difficulty: 'easier' },
    'Drunk woman':     { tier: 1, difficulty: 'easier' },
    'Elderly man':     { tier: 1, difficulty: 'easier' },
    'Elderly woman':   { tier: 1, difficulty: 'easier' },
    'Homeless person': { tier: 1, difficulty: 'easier' },
    'Junkie':          { tier: 1, difficulty: 'easier' },
    'Young man':       { tier: 2, difficulty: 'less difficult' },
    'Young woman':     { tier: 2, difficulty: 'less difficult' },
    'Businessman':     { tier: 3, difficulty: 'moderately difficult' },
    'Businesswoman':   { tier: 3, difficulty: 'moderately difficult' },
    'Jogger':          { tier: 3, difficulty: 'moderately difficult' },
    'Laborer':         { tier: 3, difficulty: 'moderately difficult' },
    'Postal worker':   { tier: 3, difficulty: 'moderately difficult' },
    'Student':         { tier: 3, difficulty: 'moderately difficult' },
    'Thug':            { tier: 3, difficulty: 'moderately difficult' },
    'Classy lady':     { tier: 4, difficulty: 'more difficult' },
    'Cyclist':         { tier: 4, difficulty: 'more difficult' },
    'Gang member':     { tier: 4, difficulty: 'more difficult' },
    'Rich kid':        { tier: 4, difficulty: 'more difficult' },
    'Sex worker':      { tier: 4, difficulty: 'more difficult' },
    'Mobster':         { tier: 6, difficulty: 'very difficult' },
    'Police officer':  { tier: 6, difficulty: 'very difficult' },
});
```

Implement exact-name dispatch with these conservative exceptions before any general high-skill rule: Police/Mobster, Cyclist, Jogger, Sex Worker soliciting, Thug loitering, and unknown/missing status. Retain the documented community thresholds 40/45/65/80/100 only where they existed in 1.6 or the approved design calls them out. Do not use `build` to upgrade a verdict.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `node --test test/pickpocketing-helper.test.cjs`

Expected: all policy tests pass with no warnings.

- [ ] **Step 6: Commit the audited policy**

```text
git add Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js test/pickpocketing-helper.test.cjs docs/Pickpocketing-helper-logic-audit.md
git commit -m "fix: audit pickpocketing target guidance"
```

---

### Task 3: Normalize settings and build the inline disclosure UI

**Files:**
- Modify: `test/pickpocketing-helper.test.cjs`
- Modify: `Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js`

**Interfaces:**
- Consumes: legacy stored `{ readyOnly, bestCount, minTier }`.
- Produces: normalized settings, `summaryText(settings)`, one `#pp-helper` section with `#pp-helper-toggle`, `#pp-helper-controls`, tier buttons, count stepper, and reset.

- [ ] **Step 1: Write failing settings and semantic markup tests**

Test clamping, malformed values, legacy preservation, and exact summary text:

```js
test('normalizes legacy settings without losing valid preferences', () => {
  const { api } = loadHelper();
  const normalized = JSON.parse(JSON.stringify(
    api.normalizeSettings({ readyOnly: true, bestCount: 20, minTier: 0 })
  ));
  assert.deepEqual(normalized, {
    readyOnly: true, bestCount: 10, minTier: 1,
  });
  assert.equal(api.summaryText({ readyOnly: true, bestCount: 2, minTier: 3 }),
    'Ready only · Tier 3+ · Top 2');
});
```

Add source-contract assertions for a semantic button, `aria-expanded`, `aria-controls="pp-helper-controls"`, six `data-tier` buttons, `pp-count-dec`, `pp-count-inc`, and `pp-reset`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test test/pickpocketing-helper.test.cjs`

Expected: FAIL because 1.6 parses inputs ad hoc and renders a fixed `#ppColorsPanel`.

- [ ] **Step 3: Implement normalized state and inline accordion**

Replace the fixed panel with `buildHelper(anchor)` and a single stylesheet. Use these tokens and touch dimensions:

```css
#pp-helper {
  --pp-surface: #1b1d20;
  --pp-surface-raised: #24272b;
  --pp-border: #3b4046;
  --pp-text: #f1f3f5;
  --pp-muted: #a9b0b7;
  margin-block: 8px;
  margin-left: max(0px, env(safe-area-inset-left));
  margin-right: max(0px, env(safe-area-inset-right));
  border: 1px solid var(--pp-border);
  border-radius: 6px;
  background: var(--pp-surface);
  color: var(--pp-text);
  font: 14px/1.4 Arial, sans-serif;
}
#pp-helper button, #pp-helper input { min-height: 36px; }
@media (max-width: 600px), (pointer: coarse) {
  #pp-helper button, #pp-helper input, #pp-helper label { min-height: 44px; }
  #pp-helper { font-size: 16px; }
}
```

Persist through `saveSettings(normalizeSettings(next))`, update the collapsed summary immediately, and repaint without a network request. Reset to `{ readyOnly: false, bestCount: 1, minTier: 1 }`.

- [ ] **Step 4: Run syntax and focused tests to verify GREEN**

Run:

```text
node --check Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js
node --test test/pickpocketing-helper.test.cjs
```

Expected: both exit 0.

- [ ] **Step 5: Commit the inline settings UI**

```text
git add Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js test/pickpocketing-helper.test.cjs
git commit -m "feat: add responsive inline pickpocket settings"
```

---

### Task 4: Decorate and filter the exact target card without gaps

**Files:**
- Modify: `test/pickpocketing-helper.test.cjs`
- Modify: `Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js`

**Interfaces:**
- Consumes: a resolved target title node and its nearest repeated card.
- Produces: `findTargetCard(titleNode) -> Element | null`; `setCardFiltered(card, hidden)` toggling only `pp-helper-filtered`; badges in a script-owned `.pp-helper-meta` node.

- [ ] **Step 1: Write failing card-boundary and restoration tests**

Use lightweight element doubles with `classList`, `hidden`, `dataset`, and parent relationships. Assert filtering applies to the repeated card, not the title's arbitrary third ancestor; unfiltering removes only `pp-helper-filtered`; original name text stays unchanged; metadata is rendered in a sibling script-owned node.

```js
test('filtering collapses and restores only the target card', () => {
  const classes = new Set();
  const card = { classList: { add: value => classes.add(value), remove: value => classes.delete(value) } };
  const { api } = loadHelper();
  api.setCardFiltered(card, true);
  assert.equal(classes.has('pp-helper-filtered'), true);
  api.setCardFiltered(card, false);
  assert.equal(classes.has('pp-helper-filtered'), false);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test test/pickpocketing-helper.test.cjs`

Expected: FAIL because 1.6 guesses card/container depth and rewrites `nameDiv.textContent`.

- [ ] **Step 3: Implement exact-card discovery and owned rendering**

Identify the card by starting at the face image/title relationship and selecting the closest repeated sibling whose subtree contains one face image and one title container. Cache no card across a Torn render. Add:

```css
.pp-helper-filtered { display: none !important; }
.pp-helper-meta { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 3px; }
.pp-helper-badge { border: 1px solid currentColor; border-radius: 3px; padding: 1px 5px; font-size: 11px; }
@media (max-width: 600px) { .pp-helper-meta { font-size: 12px; } }
```

Never rewrite Torn's target name. Remove stale `.pp-helper-meta` and script-owned classes when a card is reused, leaves the route, or stops resolving.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node --test test/pickpocketing-helper.test.cjs`

Expected: all tests pass.

- [ ] **Step 5: Commit gap-free filtering**

```text
git add Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js test/pickpocketing-helper.test.cjs
git commit -m "fix: collapse filtered pickpocket target cards"
```

---

### Task 5: Make fetch, observer, route, and PDA-tab lifecycle singleton and transparent

**Files:**
- Modify: `test/pickpocketing-helper.test.cjs`
- Modify: `Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js`

**Interfaces:**
- Consumes: existing page `fetch`, hash changes, `visibilitychange`, and `tornpda:tabState`.
- Produces: singleton traffic observer, `onActivityChange(active)`, coalesced repaint, complete route cleanup.

- [ ] **Step 1: Write failing lifecycle tests**

Assert the fetch wrapper calls the original with the same `this` and arguments, returns the original response, clones only matching crimes-list responses, and is not wrapped twice. Assert inactive state disconnects the marks observer/cancels fallback work and repeated active events schedule only one repaint without calling fetch.

```js
test('activity resume coalesces repaint work without traffic', () => {
  const calls = [];
  const { api } = loadHelper();
  const state = { active: true, repaintQueued: false };
  api.onActivityChange(state, false, action => calls.push(action));
  api.onActivityChange(state, true, action => calls.push(action));
  api.onActivityChange(state, true, action => calls.push(action));
  assert.deepEqual(calls, ['pause', 'resume-and-repaint']);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test test/pickpocketing-helper.test.cjs`

Expected: FAIL because 1.6 keeps a permanent 1.5-second interval, does not handle tab state, and assigns `window.fetch` without a singleton marker.

- [ ] **Step 3: Implement lifecycle controller**

Replace the permanent interval with an owned bounded fallback timer that exists only while the route is active and visible. Add one hashchange listener, one visibility listener, and one PDA tab-state listener. Use both `isActiveTab` and `isWebViewVisible` to define PDA active state. Mark the fetch wrapper with a private `Symbol.for('pp-helper.fetch-hook')` record on `globalThis`; preserve the original receiver using `Reflect.apply(originalFetch, this, args)`.

On route exit: disconnect observer, cancel animation frame/timer, remove helper/style, unfilter and undecorate cards. Keep the fetch hook installed because page-world hooks cannot be safely unwrapped if another script wraps later.

- [ ] **Step 4: Run syntax and focused tests to verify GREEN**

Run:

```text
node --check Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js
node --test test/pickpocketing-helper.test.cjs
```

Expected: both exit 0 with no warnings.

- [ ] **Step 5: Commit lifecycle hardening**

```text
git add Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js test/pickpocketing-helper.test.cjs
git commit -m "fix: harden pickpocket helper lifecycle"
```

---

### Task 6: Add deterministic responsive browser coverage

**Files:**
- Create: `test/browser/pickpocketing-helper-fixture.html`
- Create: `test/browser/pickpocketing-helper-responsive.cjs`
- Modify: `Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js` only for failures reproduced by the test.

**Interfaces:**
- Consumes: the shipped 1.7 source and fixture-provided fetch response/target cards.
- Produces: assertions and screenshots under `test/browser/shots/pickpocket-helper-*.png`.

- [ ] **Step 1: Build a fixture that reproduces the required DOM boundaries**

The fixture route must end in `#/pickpocketing`, expose a skill button, a heading, a repeated target grid, face URLs shaped like `/crimes/faces/101.webp`, and cards for at least Drunk man, Jogger, Sex worker, Mobster, and Police officer. Its `window.fetch` returns a cloneable response containing matching `DB.crimesByType` entries and does not contact the network.

- [ ] **Step 2: Write browser assertions before changing production CSS**

In `pickpocketing-helper-responsive.cjs`, launch isolated headless Brave/Chrome using the executable discovered from the existing debug setup, load the fixture, inject the userscript, trigger the fixture crimes-list fetch, and loop over:

```js
const VIEWPORTS = [
  { name: 'desktop', width: 1920, height: 1080, mobile: false },
  { name: 'mobile-390', width: 390, height: 844, mobile: true },
  { name: 'mobile-430', width: 430, height: 932, mobile: true },
  { name: 'landscape', width: 844, height: 390, mobile: true },
];
```

Assert one inline helper, `aria-expanded` transitions, minimum touch sizes of 44px on mobile, `document.documentElement.scrollWidth <= innerWidth`, no helper/target overlap, no blank grid gap after Ready-only filtering, reset restoration, no duplicate helper after hash route exit/re-entry, and no script-originated console/page errors. Capture collapsed and expanded screenshots.

- [ ] **Step 3: Run the browser test and verify RED if any responsive contract is unmet**

Run: `node test/browser/pickpocketing-helper-responsive.cjs`

Expected on the first run: either PASS or a specific assertion failure naming the viewport and violated contract; never accept a screenshot-only result.

- [ ] **Step 4: Apply the smallest CSS/DOM correction for each reproduced failure**

Keep the inline location and design tokens fixed. Corrections may adjust grid wrapping, helper control columns, badge wrapping, or safe-area padding, but must not add fixed-position UI or viewport-specific JavaScript branches.

- [ ] **Step 5: Re-run browser and focused tests to verify GREEN**

Run:

```text
node --test test/pickpocketing-helper.test.cjs
node test/browser/pickpocketing-helper-responsive.cjs
```

Expected: exit 0; all four viewport records report no overflow, no overlap, 44px mobile targets, gap-free filtering, and zero script errors.

- [ ] **Step 6: Visually inspect every screenshot**

Open the generated screenshots with the image viewer. Check hierarchy, contrast, wrapping, alignment, control reachability, and that collapsed/expanded states look intentional. If inspection finds a defect, add a browser assertion that detects it before applying the correction.

- [ ] **Step 7: Commit responsive coverage and corrections**

```text
git add Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js test/browser/pickpocketing-helper-fixture.html test/browser/pickpocketing-helper-responsive.cjs test/browser/shots/pickpocket-helper-*.png
git commit -m "test: verify responsive pickpocket helper UI"
```

---

### Task 7: Verify current Torn DOM/data live and finish the evidence record

**Files:**
- Create: `test/browser/pickpocketing-helper-live.cjs`
- Modify: `docs/Pickpocketing-helper-logic-audit.md`
- Modify: `Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js` only for a live-reproduced mismatch.

**Interfaces:**
- Consumes: authenticated dedicated Brave context on `https://www.torn.com/loader.php?sid=crimes#/pickpocketing` and existing crimes-list traffic.
- Produces: sanitized DOM/field summary, live screenshot, and completed evidence table without response bodies, cookies, or secrets.

- [ ] **Step 1: Write the live audit harness with preflight guards**

Use `browser-session.cjs` and `session-guard.cjs`. Inject the 1.7 source before navigating the background test page, wait for one helper and target cards, and record only:

```js
{
  urlPath,
  viewport,
  helperCount,
  targetCount,
  resolvedNames,
  observedStatusIcons,
  observedBuildTypes,
  hasDuplicateFaceIcons,
  horizontalOverflow,
  scriptErrors,
}
```

Do not record full response bodies, account identifiers, cookies, API keys, or target loot results. The harness must not call the Torn API or crimes endpoint itself.

- [ ] **Step 2: Launch or connect to the dedicated debug browser**

First try the existing CDP endpoint. If unavailable, run `node test/browser/launch-debug.cjs`, record the exact reported PID, and wait for the user only if session preflight reports logged-out/CAPTCHA/traveling. Do not resize or navigate the user's normal Brave window.

- [ ] **Step 3: Run the live audit**

Run: `node test/browser/pickpocketing-helper-live.cjs`

Expected: authenticated pickpocketing route, exactly one helper, at least one resolved target when marks are present, no horizontal overflow, and zero script-originated errors. If Torn has no marks during the bounded observation window, report that specific inconclusive condition rather than passing the association audit.

- [ ] **Step 4: Reconcile live evidence with policy and selectors**

Update `docs/Pickpocketing-helper-logic-audit.md` observed-status/build columns. If live build data is ambiguous or not reliably card-associated, retain the explicit `unmodeled risk factor` note. Any selector or status mismatch must first become a failing focused or browser test, then receive the smallest production correction, followed by the focused, fixture, and live reruns.

- [ ] **Step 5: Run the complete verification set**

Run:

```text
node --check Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js
node --test test/pickpocketing-helper.test.cjs
node test/browser/pickpocketing-helper-responsive.cjs
node test/browser/pickpocketing-helper-live.cjs
git diff --check
rg -n -i "api[_ -]?key|password|secret|cookie|authorization" Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js test/pickpocketing-helper.test.cjs test/browser/pickpocketing-helper-*.cjs docs/Pickpocketing-helper-logic-audit.md
Get-FileHash -Algorithm SHA256 -LiteralPath 'C:\Users\asato\Downloads\Torn_Pickpocketing_Colors_Status-Aware_1.6.user.js'
```

Expected: syntax and all tests exit 0; diff check is clean; the secret scan finds only explanatory test/document wording and no secret value; the original hash remains `B8AE463859DD5CA43C41440A951AB3CE8ED9F6A2A4D590F9A3C4F0B14C71C01A`.

- [ ] **Step 6: Review the complete diff with the code-quality checklist**

Confirm correctness, security, performance, accessibility, PDA lifecycle cleanup, no additional network requests, no unrelated file changes, and exact preservation of the Downloads original by comparing its SHA-256 hash to the hash recorded before Task 1.

- [ ] **Step 7: Commit live verification evidence**

```text
git add Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js test/browser/pickpocketing-helper-live.cjs docs/Pickpocketing-helper-logic-audit.md
git commit -m "test: verify pickpocket helper on live Torn"
```

- [ ] **Step 8: Close only a browser launched by this task**

If Task 7 launched the dedicated browser, stop only the exact PID reported by `launch-debug.cjs`. If it connected to a browser that was already running, disconnect Puppeteer and leave the browser open.

## Final handoff

Report:

- the absolute path to the new 1.7 userscript;
- which policy rules changed and why;
- which facts remain advisory or unmodeled;
- focused and browser test command results;
- the four fixture screenshots and live screenshot;
- whether the dedicated test browser was started and closed;
- confirmation that the Downloads original hash is unchanged;
- unrelated dirty-worktree files intentionally left untouched.
