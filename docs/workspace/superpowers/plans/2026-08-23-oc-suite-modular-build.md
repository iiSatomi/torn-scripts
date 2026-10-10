# OC Suite modular build proposal

## What “split the 1.2 MB userscript” means

The installed artifact would remain one Tampermonkey-compatible `.user.js` file.
The source would become a small set of files with explicit dependencies, and a
build script would bundle them in a deterministic order. This is source
modularization, not asking Tampermonkey to load many files at runtime.

## Proposed source tree

```text
src/oc-suite/
  metadata.js                 // userscript header, grants, connects
  core/
    runtime.js                // mount/unmount, route watcher, lifecycle slots
    storage.js                // GM settings and cache adapters
    diagnostics.js            // bounded API/DOM/memory diagnostics
    api.js                    // Torn v1/v2 + GM transport, timeout handling
  shell/
    root.js                   // rail, top bar, config, tabs
    theme.js                  // palette and accessibility themes
    styles.css                // shell and shared tokens
  features/
    crimes/                   // OC cards, CPR, recruitment, loans
    armoury/                  // ledger, retrieve/loan actions, annotations
    war/                      // payout and war report tools
    consumables/              // Usage Command bridge and redesigned UI
    sidebar/                  // native sidebar widgets
  build-userscript.cjs        // emits dist/Torn_OC_Suite_Codex.user.js
```

## Dependency direction

`runtime → shell → features` is the main direction. Feature modules receive
small interfaces such as `api`, `storage`, `ui`, and `diagnostics`; they do not
reach into another feature's private variables. Shared pure functions—formatting,
CPR calculations, and sanitisation—live in `core/` and can be unit-tested in
Node without a browser.

## Why this helps PDA memory

- Feature state and cleanup become visible at module boundaries.
- Optional features can be initialized only when their tab is opened.
- A module can own one timer/observer and expose `mount()`/`unmount()`.
- Tests can load a feature without constructing the entire 1.2 MB shell.
- Small source diffs reduce accidental duplicate listeners and retained closures.

The bundle still contains the code for the installed userscript, so splitting
alone does not magically reduce the browser's parsed code memory. The meaningful
runtime savings come from lazy initialization, bounded caches, and reliable
cleanup; the build split makes those changes safer to implement and verify.

## Migration sequence

1. Freeze the current Codex file as the behaviour baseline.
2. Extract pure utilities and the GM/API adapter first; keep the existing UI.
3. Extract the shell and diagnostics panel, preserving element IDs.
4. Move one feature at a time: crimes/loans, armoury, war, consumables, then
   sidebar. Each feature gets a mount/unmount contract and browser smoke test.
5. Add the deterministic bundler and compare the generated artifact against the
   baseline tests before changing behavior.
6. Only after parity, enable lazy mounting for heavy optional features.

## Build safeguards

- Keep metadata and grants at the top of the output.
- Fail the build on duplicate top-level names or missing module order.
- Run `node --check`, unit contracts, browser smoke, and the memory-cycle test
  against the generated artifact.
- Preserve `Torn_OC_Suite_PurrfectCrime.user.js` as a separate unchanged line.

