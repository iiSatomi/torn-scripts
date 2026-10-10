# Browser Test Window Stability Design

## Problem

The visible dedicated Brave window is launched at 1920x1080, but the current
OC Suite smoke test later applies several mobile device-metric overrides to a
tab in that same headed browser. Those overrides make the visible browser
rapidly alternate between desktop, portrait-phone, and landscape-phone
layouts. The memory-cycle test also applies a mobile viewport to the visible
debug browser.

## Design

The dedicated visible Brave instance remains the desktop test surface. Tests
that connect to its debugging port may read the logged-in Torn page and run
desktop checks, but they must not apply mobile emulation or alter the browser
window bounds. Desktop smoke verification records the real window bounds and
CSS viewport before and after the run and fails if either changes.

PDA layout tests and mobile memory-cycle tests run in an isolated background
browser context attached to the dedicated Brave instance. The mobile target is
created with the DevTools `background` flag and is never allowed to call
`bringToFront`, so the authenticated desktop Torn tab remains visible and
unchanged. The temporary browser context is closed in a `finally` block.

A separate headless Brave process was tested and rejected: Torn/Cloudflare
served a `Just a moment...` challenge with no application DOM, even after the
dedicated session cookies were copied. The background-context design retains
the dedicated browser's accepted fingerprint while still isolating storage,
extensions, page lifecycle, and mobile viewport changes.

## Components

- `browser-session.cjs`: owns background-target creation, mobile viewport
  isolation, foreground protection, visible-window stability checks, and
  guaranteed context cleanup.
- `smoke-codex.cjs`: desktop-only smoke and accessibility checks against the
  fixed 1920x1080 visible browser.
- `smoke-codex.cjs`: performs its PDA viewport matrix, Consumables checks, and
  PDA screenshots in the isolated background context after desktop checks.
- `memory-cycle.cjs`: performs its mobile lifecycle run through the same
  background-context helper instead of changing the foreground tab.
- `browser-window-policy.test.cjs`: runs the browser harness through injectable
  test doubles and verifies desktop runs preserve bounds while mobile runs own
  and close an isolated browser.

## Failure handling

If the visible debug browser is unavailable, tests fail with a clear launch
instruction. If the Torn page is unavailable, the test reports that the
dedicated profile needs login. Background contexts are cleaned up whether a
test passes or throws. The helper verifies the visible window and desktop page
viewport are unchanged before disconnecting. The user’s normal Brave windows
are never closed.

## Verification

1. Run the policy test before implementation and observe it fail against the
   current mixed desktop/mobile harness.
2. Run the desktop smoke with the visible window at 1920x1080 and assert that
   window bounds and viewport are unchanged after every desktop tab.
3. Run the PDA matrix in the background and verify 390x844, 430x932, and
   844x390 layouts without any visible resizing or foreground activation.
4. Run injected and control memory cycles in background contexts.
5. Close only the dedicated test browser and confirm its debugging port is no
   longer listening.
