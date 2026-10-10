# War Command, Contracts, and Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a War Command landing view, bilateral hit/end-time planner, and FFScouter-backed med-out contract deal board inside PurrfectCrime's War tab.

**Architecture:** Keep the feature inside the existing native War module in `Torn_OC_Suite_PurrfectCrime.user.js`. Add pure calculator/matcher helpers before render functions; persist only user-entered plan inputs and per-war pairings through existing `GM_*` storage. Reuse the old suite's FFScouter batch protocol and no-image-byte PFP policy, but use the new suite's Armoury PFP fallback/hydrator pattern.

**Tech Stack:** Vanilla ES2020 userscript; Torn v1/v2 API via existing `apiFetch`/`GM_xmlHttpRequest`; FFScouter batch API; Greasemonkey storage; Puppeteer/Brave CDP harness; Node syntax check.

## Global Constraints

- Modify `Torn_OC_Suite_PurrfectCrime.user.js`; bump `@version` for every shipped feature commit.
- Do not automate attacks, meds, messages, or Torn confirmations.
- Missing FFScouter/faction-perk/history data must render `Unknown`/`not applied`; never invent a combat guarantee or rate.
- Keep the user’s FFScouter/API keys in existing GM storage only; never log or commit them.
- Use the selected ranked-war opponent automatically; no manual faction picker.
- Pairings are local per-war planning state and enforce one Frostbite member ↔ one enemy member.
- Test in the dedicated Brave debug profile and keep the existing CSP-safe `Runtime.evaluate` harness route.

---

### Task 1: Extract testable War math and storage contracts

**Files:**
- Modify: `Torn_OC_Suite_PurrfectCrime.user.js:10448-10574`
- Create: `test/browser/war-command.cjs`

**Interfaces:**
- Produces `WARX.baseRespect(level)`, `WARX.projectRespect(level, ff, warlordPercent, factionBonus)`, `WARX.estimateHits(target, respectPerHit)`, and `WARX.estimateEnd(nowMs, our, enemy)`.
- Produces `WARX.loadPlan(warId)` / `WARX.savePlan(warId, plan)` using `ocs_war_plan_<warId>`.
- `estimateEnd` returns `{ hours, at, limiting: 'our'|'enemy'|'unknown' }` or `null` if either required rate is absent/non-positive.

- [ ] **Step 1: Write a browser harness assertion block before adding implementation**

```js
const math = await page.evaluate(() => window.__OCS_WARX_TEST__?.());
if (math.baseLevel1 !== 1 || math.baseLevel100 !== 1.5) throw new Error('base respect bounds failed');
if (math.hits !== 100) throw new Error('hit estimate failed');
if (math.endHours !== 10 || math.limiting !== 'enemy') throw new Error('end estimate failed');
```

- [ ] **Step 2: Run the harness and verify it fails because `__OCS_WARX_TEST__` does not exist**

Run: `node test/browser/war-command.cjs`

Expected: failure naming missing `__OCS_WARX_TEST__`.

- [ ] **Step 3: Add the pure helpers and a test-only read-only wrapper**

```js
const WARX = (() => {
  const baseRespect = level => 1 + (Math.max(1, Math.min(100, Number(level) || 1)) - 1) * (0.5 / 99);
  const projectRespect = (level, ff, warlordPercent = 0, factionBonus = 0) =>
    Number.isFinite(Number(ff)) ? baseRespect(level) * Number(ff) * 2 * (1 + warlordPercent / 100) * (1 + factionBonus / 100) : null;
  const estimateHits = (target, perHit) => Number(perHit) > 0 ? Math.ceil(Math.max(0, Number(target) || 0) / Number(perHit)) : null;
  const estimateEnd = (nowMs, our, enemy) => { /* require valid hits and pace for both; max duration wins */ };
  return { baseRespect, projectRespect, estimateHits, estimateEnd, loadPlan, savePlan };
})();
window.__OCS_WARX_TEST__ = () => ({ baseLevel1: WARX.baseRespect(1), baseLevel100: WARX.baseRespect(100), hits: WARX.estimateHits(100, 1), endHours: WARX.estimateEnd(0, { hits: 10, pace: 2 }, { hits: 20, pace: 2 }).hours, limiting: WARX.estimateEnd(0, { hits: 10, pace: 2 }, { hits: 20, pace: 2 }).limiting });
```

- [ ] **Step 4: Run the harness and syntax check**

Run: `node --check Torn_OC_Suite_PurrfectCrime.user.js; node test/browser/war-command.cjs`

Expected: zero syntax errors and all math assertions pass.

- [ ] **Step 5: Commit**

```powershell
git add Torn_OC_Suite_PurrfectCrime.user.js test/browser/war-command.cjs
git commit -m "PurrfectCrime: add testable War Command math"
```

### Task 2: Add Command landing and bilateral Planner

**Files:**
- Modify: `Torn_OC_Suite_PurrfectCrime.user.js:10460-10575, 11445-11475`
- Modify: `test/browser/war-command.cjs`

**Interfaces:**
- Consumes `WARX.*`, `_warState.wars`, selected `_warState.war`, and cached report rows.
- Produces `warRenderCommand(host)` and `warRenderPlanner(host)`.
- Adds War keys `command` and `planner`; `command` is default.

- [ ] **Step 1: Extend the harness with required DOM assertions**

```js
const planner = await page.evaluate(() => ({
  command: !!document.querySelector('[data-tab="command"]'),
  planner: !!document.querySelector('[data-tab="planner"]'),
  ours: !!document.getElementById('ocm-plan-our-target'),
  theirs: !!document.getElementById('ocm-plan-enemy-target'),
  result: document.getElementById('ocm-plan-result')?.innerText || ''
}));
if (!planner.command || !planner.planner || !planner.ours || !planner.theirs) throw new Error('planner controls missing');
```

- [ ] **Step 2: Verify failure before rendering the new tabs**

Run: `node test/browser/war-command.cjs`

Expected: failure `planner controls missing`.

- [ ] **Step 3: Add Command and Planner renderers**

```js
const _warTabs = [
  { key: 'command', label: '⌂ Command' }, { key: 'contracts', label: '📜 Contracts' },
  { key: 'planner', label: '🧮 Planner' }, { key: 'report', label: '⚔️ Report' },
  { key: 'drugs', label: '💊 Drugs' }, { key: 'sweep', label: '📊 Multi-war' },
  { key: 'raffle', label: '🎟️ Raffle' }, { key: 'guide', label: 'ℹ️ Guide' }
];
```

Render two independent target/pace input groups, scenario buttons `0/15/17/19`, a result block showing both hits needed, both durations, limiting side, and local calendar end. Derive defaults only from compatible cached reports; leave a missing rate visibly unknown. Wire every input to save/re-render the selected-war plan.

- [ ] **Step 4: Run live planner interaction test**

Run: `node test/browser/war-command.cjs`

Expected: Command is selected on first render; changing targets and paces updates bilateral hit/end-time text with no console error.

- [ ] **Step 5: Commit**

```powershell
git add Torn_OC_Suite_PurrfectCrime.user.js test/browser/war-command.cjs
git commit -m "PurrfectCrime: add War Command landing and bilateral planner"
```

### Task 3: Port FFScouter batch cache and load selected-war rosters

**Files:**
- Modify: `Torn_OC_Suite_PurrfectCrime.user.js:10448-11475`
- Modify: `test/browser/war-command.cjs`

**Interfaces:**
- Produces `WARC.loadRosters(war, key)`, `WARC.fetchEstimates(ids)`, and `WARC.profile(member)`.
- Roster member shape: `{ id, name, level, status, factionId, factionName, bs, ff, estimateAt, estimateSource }`.
- `fetchEstimates` reads `ocs_ff_key`, updates `ocs_spy_cache`, has a 24-hour TTL, and returns records without logging its key.

- [ ] **Step 1: Add a failing UI state assertion**

```js
const state = await page.evaluate(() => document.querySelector('#ocm-war-tabcontent')?.innerText || '');
if (!/FFScouter|Load estimates|Add.*FFScouter/i.test(state)) throw new Error('contracts estimate state missing');
```

- [ ] **Step 2: Run it before implementation**

Run: `node test/browser/war-command.cjs`

Expected: failure `contracts estimate state missing`.

- [ ] **Step 3: Implement cache-aware FFScouter loading and roster request handling**

Use the old suite’s protocol but correct the URL construction:

```js
const url = `https://ffscouter.com/api/v1/get-stats?key=${encodeURIComponent(ffKey)}&targets=${ids.join(',')}`;
const rows = Array.isArray(response) ? response : (Array.isArray(response?.results) ? response.results : []);
```

Fetch only stale IDs; handle an absent key as a renderable setup state. Fetch faction roster data through the existing authenticated request helper. Never make a roster/estimate request automatically merely by viewing the tab; the user presses `Load estimates`.

- [ ] **Step 4: Verify no-key and cached-key paths in browser**

Run: `node test/browser/war-command.cjs`

Expected: no-key state renders without errors; existing stored key loads/caches estimates without displaying key contents.

- [ ] **Step 5: Commit**

```powershell
git add Torn_OC_Suite_PurrfectCrime.user.js test/browser/war-command.cjs
git commit -m "PurrfectCrime: load ranked-war contract rosters and FF estimates"
```

### Task 4: Build reciprocal recommendations and the Contracts deal board

**Files:**
- Modify: `Torn_OC_Suite_PurrfectCrime.user.js:10448-11475`
- Modify: `test/browser/war-command.cjs`

**Interfaces:**
- Produces `WARC.scorePair(our, enemy, opts)` returning `{ viable, confidence, ourRespect, enemyRespect, balance, rationale, score }`.
- Produces `WARC.rankForMember(our, enemies, reservedIds, opts)`.
- Produces `warRenderContracts(host)`.
- Pairing persistence key: `ocs_war_contracts_<warId>` with rows `{ ourMemberId, enemyMemberId, createdAt }`.

- [ ] **Step 1: Add pure score assertions to the harness**

```js
const score = await page.evaluate(() => window.__OCS_WARX_SCORE_TEST__?.());
if (!(score.balanced.score > score.oneSided.score)) throw new Error('reciprocal score did not prefer balanced deal');
if (score.unknown.confidence !== 'unknown') throw new Error('missing estimate was not marked unknown');
```

- [ ] **Step 2: Run and verify expected failure**

Run: `node test/browser/war-command.cjs`

Expected: missing score test wrapper.

- [ ] **Step 3: Implement scorer, pair persistence, and cards**

Use the lower of both projected base-respect values as the primary mutual-value term, then combined respect; apply a strong penalty for battle-stat asymmetry and mark unknown stats rather than declaring a safe hit. Card rows must show both PFPs/fallbacks, level, BS estimate, FF estimate, base/15/17/19 projections in both directions, confidence, and rationale. Show only three available recommendations per member plus an explicit unknown-estimates section.

- [ ] **Step 4: Implement Pair / Unpair and copy board**

```js
function pairContract(warId, ourId, enemyId) {
  const rows = loadContracts(warId).filter(r => r.ourMemberId !== ourId && r.enemyMemberId !== enemyId);
  rows.push({ ourMemberId: String(ourId), enemyMemberId: String(enemyId), createdAt: Date.now() });
  saveContracts(warId, rows);
}
```

After Pair, rerender and assert the enemy ID is absent from every other recommendation. Unpair must restore it. Copy must include neither API keys nor opaque score numbers without names.

- [ ] **Step 5: Run browser interaction tests**

Run: `node test/browser/war-command.cjs`

Expected: cards render; Pair reserves globally; Unpair restores; PFP fallback/image works; zero console errors.

- [ ] **Step 6: Commit**

```powershell
git add Torn_OC_Suite_PurrfectCrime.user.js test/browser/war-command.cjs
git commit -m "PurrfectCrime: add reciprocal med-out contracts board"
```

### Task 5: Integrate faction-perk provenance, polish, full verification, and Brain update

**Files:**
- Modify: `Torn_OC_Suite_PurrfectCrime.user.js:10448-11475`
- Modify: `test/browser/war-command.cjs`
- Modify: `D:/Obsidian/AI Brain/Torn/_Torn Scripts MOC.md`

**Interfaces:**
- Contract/Planner projections accept `factionBonus`; UI must display the source, explicit percentage, or `Faction perk unknown — not applied`.

- [ ] **Step 1: Add failed/missing-perk UI assertion**

```js
const perkText = await page.evaluate(() => document.querySelector('#ocm-war-tabcontent')?.innerText || '');
if (!/Faction perk unknown — not applied|Faction perk: \+\d+(\.\d+)?%/i.test(perkText)) throw new Error('perk provenance missing');
```

- [ ] **Step 2: Implement authoritative perk reading only**

Inspect the selected faction API response for a documented upgrade/perk value. Apply only a numeric value tied to a named source. If no documented field is available, render the exact unknown label and use zero adjustment.

- [ ] **Step 3: Run all browser passes**

Run:

```powershell
node --check Torn_OC_Suite_PurrfectCrime.user.js
node test/browser/war-command.cjs
node test/browser/smoke.cjs
node test/browser/armfull.cjs
```

Expected: all pass, Command/Planner/Contracts pass interaction checks, 0 console errors, and existing Armoury PFPs still load.

- [ ] **Step 4: Update Brain with verified facts**

Record version, commits, contracts data provenance, scenario math, no-auto-action boundary, planner assumptions, and browser proof. Do not commit the Brain repo if it lacks a configured Git identity; leave the modified note clearly visible instead.

- [ ] **Step 5: Commit final feature**

```powershell
git add Torn_OC_Suite_PurrfectCrime.user.js test/browser/war-command.cjs
git commit -m "PurrfectCrime: finish War Command contracts and planner"
```
