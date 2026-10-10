# OC Suite Codex startup investigation

Status: investigation paused after discovering that the slow report happened
while flying. No loading-code change has been made yet.

## User report

On page load, the OC Suite sometimes takes roughly 10–20 seconds before it
appears. The user later clarified that the page was in flying mode.

## What was inspected

File under investigation:

- `Torn_OC_Suite_Codex.user.js`

Relevant startup code:

- `inject()` is called at boot near the `BOOT` section.
- The route watcher calls `inject()` again after hash navigation.
- The normal route searches for `.faction-crimes-wrap`, `#faction-crimes`,
  `.content-wrapper`, and `#mainContainer`.
- The travelling/abroad route searches for `#react-root` and
  `.content-wrapper`.
- The current core insertion loop polls every 500 ms.
- The sidebar insertion loop independently polls every 500 ms.
- `loadData()` starts after the root is built when an API key is saved; it is
  asynchronous and should not block creation of `#ocm-root`.

## Important interpretation

Flying changes Torn's route and page structure. The normal Crimes anchor may be
absent while Torn transitions to or renders the travelling/abroad page. A long
wait can therefore be caused by a legitimately missing anchor, by a late Torn
SPA render, or by the userscript itself. These must be measured separately:

1. userscript evaluation time;
2. time until the expected Torn anchor exists;
3. time from anchor existence to `#ocm-root` insertion;
4. time until first useful data/render state.

Do not classify the report as a 10–20 second userscript regression until these
four phases are recorded on both a normal Crimes page and a flying page.

## Planned test-first work

Create a browser timing test that:

- uses the isolated Brave debug profile on CDP port 9222;
- injects the GM shim without real secrets;
- records `performance.now()` around script evaluation;
- observes the first appearance of the Torn anchor and `#ocm-root`;
- records route, travelling/abroad flags, document readiness, and console
  errors;
- runs at least one normal Crimes case and one flying/abroad case;
- closes the dedicated browser process after the run.

Add a source-level contract test before implementation. The contract should
protect these properties:

- only one startup scheduler and one route watcher may be active;
- the scheduler must stop after mount or route departure;
- observer/timer cleanup must be explicit;
- initial shell insertion must not wait for the API data request;
- navigation must not create duplicate `#ocm-root` shells.

## Candidate implementation, pending measurement

If measurement shows that polling is the cause, replace the arbitrary 500 ms
interval with a small startup coordinator:

- attempt insertion synchronously first;
- observe the relevant document subtree for the anchor;
- use a bounded short fallback timer for pages that replace the body without
  producing a useful mutation signal;
- disconnect and clear all handles on successful mount, route departure, or a
  maximum wait timeout;
- re-evaluate the travelling flag when navigation changes instead of capturing
  a stale route state;
- leave data fetching and secondary widgets after the shell is visible.

If the anchor itself is late during flying, keep the correct route-aware wait
but make the shell show a lightweight loading state as soon as a safe host is
available. Do not insert into Torn's transient page in a way that will be lost
or duplicated by the next SPA render.

## Verification already available

The Codex copy has existing checks for diagnostics, lifecycle, consumables,
memory lifecycle, loans, syntax, and live smoke behavior. Re-run those after any
startup change. A prior live Codex smoke run passed with the diagnostics panel
visible, and the prior memory-cycle run showed stable suite-owned nodes and
intervals; those results are baseline evidence, not proof of the new startup
behavior.

## Resume checklist

- [ ] Measure normal route startup phases.
- [ ] Measure flying/abroad route startup phases.
- [ ] Add the failing startup contract test.
- [ ] Implement only the measured fix.
- [ ] Verify no duplicate observers/timers or shells.
- [ ] Verify loans and sidebar behavior after route changes.
- [ ] Run live browser test and close the isolated browser.
- [ ] Update this note with actual timings and final decision.
